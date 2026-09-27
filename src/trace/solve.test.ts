/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { deriveRooms, validate } from '../core'
import type { Unit } from '../core'
import { truthLines, registerTruth } from './eval'
import { FIXTURES, SHOTS, loadPgm, writeUnitOverlay } from './evalio'
import { solveTraces } from './solve'
import { formatSolveReports, scoreSolve, truthPick, type SolveReport } from './solveEval'
import type { Gray, HintTrace, Px, TextItem, TextTrace } from './types'

// ---------- synthetic: a 3-room flat with printed sizes → the exact Unit ----------
const K = 50 // px per m
const O = { x: 60, y: 60 }
const P = (x: number, y: number): Px => ({ x: O.x + x * K, y: O.y + y * K })

/** An axis-aligned wall a→b, `th` px thick, square ends, black. */
function stroke(g: Gray, a: Px, b: Px, th: number): void {
  const r = a.y === b.y ? { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: a.y - th / 2, y1: a.y + th / 2 } : { x0: a.x - th / 2, x1: a.x + th / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) }
  for (let y = Math.round(r.y0); y < Math.round(r.y1); y++) for (let x = Math.round(r.x0); x < Math.round(r.x1); x++) g.data[y * g.width + x] = 0
}

/**
 * 8 × 5 m (centre lines), 10" outer walls, 5" partitions: Living 0–4 × 0–5, Bed 4–8 × 0–2.5, Bath 4–8 × 2.5–5 (bath 6–8 only:
 * a store 4–6 × 2.5–5 left unlabelled). Doors are plain 0.9 m gaps in the partitions.
 */
function synthetic(): { g: Gray; text: TextTrace } {
  const width = Math.round(8 * K + 2 * O.x), height = Math.round(5 * K + 2 * O.y)
  const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
  const ext = 0.254 * K, par = 0.127 * K
  const h = ext / 2 / K
  // outer box, square corners
  stroke(g, P(-h, 0), P(8 + h, 0), ext)
  stroke(g, P(-h, 5), P(8 + h, 5), ext)
  stroke(g, P(0, 0), P(0, 5), ext)
  stroke(g, P(8, 0), P(8, 5), ext)
  // partition x = 4, door 1.0–1.9 (living ↔ bed) and 3.2–4.1 (living ↔ store)
  stroke(g, P(4, 0), P(4, 1.0), par)
  stroke(g, P(4, 1.9), P(4, 3.2), par)
  stroke(g, P(4, 4.1), P(4, 5), par)
  // partition y = 2.5 (bed | store + bath), bath wall x = 6 with a door 3.0–3.8
  stroke(g, P(4, 2.5), P(8, 2.5), par)
  stroke(g, P(6, 2.5), P(6, 3.0), par)
  stroke(g, P(6, 3.8), P(6, 5), par)
  const item = (name: string, kind: string, cx: number, cy: number, aM: number, bM: number): TextItem => {
    const c = P(cx, cy)
    return { text: `${name}\n${aM}x${bM}`, box: { x: c.x - 30, y: c.y - 10, w: 60, h: 20 }, kind: 'room', roomKind: kind, dims: { aM, bM }, conf: 0.9, source: 'ocr' }
  }
  // printed sizes = inner (face to face): centre-line span minus half a wall each side
  const text: TextTrace = {
    items: [
      item('LIVING', 'living', 2, 2.5, 4 - 0.127 - 0.0635, 5 - 0.254),
      item('BED-1', 'bed', 6, 1.25, 4 - 0.0635 - 0.127, 2.5 - 0.127 - 0.0635),
      item('TOILET', 'bath', 7, 3.75, 2 - 0.0635 - 0.127, 2.5 - 0.0635 - 0.127),
    ],
  }
  return { g, text }
}

describe('solveTraces on a synthetic flat', () => {
  test('3 named rooms + 1 unnamed, scale from the printed sizes, doors in the partitions, a Unit that validates', () => {
    const { g, text } = synthetic()
    const r = solveTraces(g, { text }, { pickPx: P(2, 2.5) })
    expect(r.stats.scaleFrom).toBe('dims')
    expect(Math.abs(r.stats.pxPerM / K - 1)).toBeLessThan(0.02)
    const rooms = deriveRooms(r.unit)
    expect(rooms.length).toBe(4)
    const by = (n: string) => rooms.find((x) => x.name === n)!
    expect(by('Living').kind).toBe('living')
    expect(by('Bed 1').kind).toBe('bed')
    expect(by('Toilet').kind).toBe('bath')
    expect(Math.abs(by('Living').areaSqm - 20)).toBeLessThan(0.6)
    expect(Math.abs(by('Bed 1').areaSqm - 10)).toBeLessThan(0.4)
    expect(Math.abs(by('Toilet').areaSqm - 5)).toBeLessThan(0.3)
    expect(r.review.filter((x) => x.kind === 'unlabelled').length).toBe(1)
    expect(r.review.filter((x) => x.kind === 'size-mismatch')).toEqual([])
    const errors = validate(r.unit).filter((i) => i.level === 'error')
    expect(errors).toEqual([])
    const ops = r.unit.walls.flatMap((w) => w.openings)
    expect(ops.length).toBe(3)
    for (const o of ops) expect(Math.abs(o.widthM - 0.85)).toBeLessThan(0.12)
    // outer walls 10", partitions 5"
    expect(new Set(r.unit.walls.map((w) => w.thicknessM))).toEqual(new Set([0.127, 0.254]))
  })

  test('hints name the unlabelled store: a table outvotes a lone basin; colour propagation fills what is left', () => {
    const { g, text } = synthetic()
    const hints: HintTrace = {
      hints: [
        { at: P(4.8, 3.3), kind: 'bath', source: 'fixture', what: 'basin', conf: 0.6 },
        { at: P(5.2, 4.2), kind: 'dining', source: 'fixture', what: 'table', conf: 0.7 },
      ],
    }
    const store = (r: ReturnType<typeof solveTraces>) => deriveRooms(r.unit).find((x) => x.centroid.x > 0 && !['Living', 'Bed 1', 'Toilet'].includes(x.name))!
    const byHint = solveTraces(g, { text, hints }, { pickPx: P(2, 2.5) })
    expect(store(byHint).kind).toBe('dining')
    expect(byHint.review.filter((x) => x.kind === 'unlabelled')).toEqual([])
    const byColour = solveTraces(g, { text, propagate: (rooms) => rooms.map((r) => (r.kind ? null : { at: r.poly[0], kind: 'utility', source: 'colour', conf: 0.6 })) }, { pickPx: P(2, 2.5) })
    expect(store(byColour).kind).toBe('utility')
  })

  test('no click: the largest closed region, same rooms', () => {
    const { g, text } = synthetic()
    expect(deriveRooms(solveTraces(g, { text }).unit).length).toBe(4)
  })

  test('a side drawn only as a double thin line (glazing) still closes the room, as a window', () => {
    const width = Math.round(6 * K + 2 * O.x), height = Math.round(4 * K + 2 * O.y)
    const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
    const ext = 0.254 * K, h = 0.127
    stroke(g, P(-h, 0), P(6 + h, 0), ext)
    stroke(g, P(-h, 4), P(6 + h, 4), ext)
    stroke(g, P(0, 0), P(0, 4), ext)
    for (const dx of [-2, 2]) for (let y = Math.round(P(0, 0).y); y < Math.round(P(0, 4).y); y++) g.data[y * width + Math.round(P(6, 0).x) + dx] = 90
    const r = solveTraces(g, {}, { pickPx: P(1.5, 2) })
    const rooms = deriveRooms(r.unit)
    expect(rooms.length).toBe(1) // open on the right without the glazing: no room at all
    // (no printed sizes here: the scale is the wall prior, so compare with the wall's own length)
    const len = (w: (typeof r.unit.walls)[number]) => {
      const a = r.unit.vertices.find((v) => v.id === w.a)!, b = r.unit.vertices.find((v) => v.id === w.b)!
      return Math.hypot(b.x - a.x, b.y - a.y)
    }
    expect(r.unit.walls.some((w) => w.openings.some((o) => o.kind === 'window' && o.widthM > 0.9 * len(w)))).toBe(true)
    expect(validate(r.unit).filter((i) => i.level === 'error')).toEqual([])
  })
})

// ---------- the real plans: end to end vs the hand-traced units (fixtures + cached OCR; skipped when absent) ----------
const TEXT = process.env.TRACE_TEXT ?? 'E:/dev/tmp/wave16/solver/text/'
const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
const sheet = (u: Unit) => u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')
const haveFixtures = Object.values(units).every((u) => existsSync(`${FIXTURES}assets__${sheet(u)}.pgm`) && existsSync(`${TEXT}${sheet(u)}.json`))
const readTextJson = (name: string): TextTrace => JSON.parse(readFileSync(`${TEXT}${name}.json`, 'utf8'))

describe.skipIf(!haveFixtures)('solver vs the hand-traced units (eval report)', () => {
  test('rooms matched / area / scale / kinds / review per unit', () => {
    const rows: SolveReport[] = []
    for (const u of Object.values(units)) {
      const g = loadPgm(`${FIXTURES}assets__${sheet(u)}.pgm`)!
      const res = solveTraces(g, { text: readTextJson(sheet(u)) }, { pickPx: truthPick(u) })
      rows.push(scoreSolve(res, u))
      if (SHOTS) writeUnitOverlay(`${SHOTS}/solve-${u.id}.png`, g, res.unit, res.review, truthLines(u, registerTruth(g, u)))
      expect(validate(res.unit).filter((i) => i.level === 'error'), u.id).toEqual([])
    }
    console.log(`\n${formatSolveReports(rows)}\n`)
  }, 300000)
})

/** One flat each on the sheets nobody traced by hand (click = a spot in its living room). */
const SMOKE: { file: string; text: string; pick: Px }[] = [
  { file: 'Sheltech_Banani__Level_2-6.pgm', text: 'Sheltech-Banani-Level-2-6', pick: { x: 490, y: 320 } },
  { file: 'Sheltech_dmd__Level_3-14.pgm', text: 'Sheltech-dmd-Level-3-14', pick: { x: 440, y: 470 } },
]
describe.skipIf(!haveFixtures || !SHOTS)('solver smoke on other sheets (overlays only)', () => {
  test('never crashes, validates', () => {
    for (const s of SMOKE) {
      const g = loadPgm(FIXTURES + s.file)
      if (!g) continue
      const res = solveTraces(g, { text: existsSync(`${TEXT}${s.text}.json`) ? readTextJson(s.text) : undefined }, { pickPx: s.pick })
      writeUnitOverlay(`${SHOTS}/solve-${s.text}.png`, g, res.unit, res.review)
      console.log(s.text, JSON.stringify(res.stats), res.review.length, 'review')
      expect(validate(res.unit).filter((i) => i.level === 'error'), s.file).toEqual([])
    }
  }, 300000)
})
