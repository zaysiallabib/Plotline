/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { deriveRooms, validate } from '../core'
import type { Unit } from '../core'
import { truthLines, registerTruth } from './eval'
import { FIXTURES, SHOTS, loadPgm, loadPpm, writeUnitOverlay } from './evalio'
import { findHints, greenMask } from './hints'
import { KNOBS, findStairs, glassMask, solveTraces, type SolveInputs } from './solve'
import { glazing } from './walls'
import { diagnoseMisses, formatSolveReports, scoreSolve, truthPick, type SolveReport } from './solveEval'
import { traceWalls } from './walls'
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

/** A 1.5 px dark-grey quarter arc (a door swing) around `c`, radius r m, angles a0 → a1 (radians, y down). */
function arc(g: Gray, c: Px, r: number, a0: number, a1: number): void {
  for (let k = 0; k <= 400; k++) {
    const t = a0 + ((a1 - a0) * k) / 400
    const x = Math.round(c.x + r * K * Math.cos(t)), y = Math.round(c.y + r * K * Math.sin(t))
    g.data[y * g.width + x] = 60
  }
}

/**
 * 8 × 5 m (centre lines), 10" outer walls, 5" partitions: Living 0–4 × 0–5, Bed 4–8 × 0–2.5, Bath 4–8 × 2.5–5 (bath 6–8 only:
 * a store 4–6 × 2.5–5 left unlabelled). Doors are 0.9 / 0.8 m gaps in the partitions, drawn with their swing arcs
 * (`arcs`) or as plain gaps (only the gap closer, KNOBS.closeGaps, closes those).
 */
function synthetic(arcs = true): { g: Gray; text: TextTrace } {
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
  if (arcs) {
    arc(g, P(4, 1.0), 0.9, Math.PI / 2, Math.PI) // hinge at the top jamb, swinging into the living
    arc(g, P(4, 3.2), 0.9, Math.PI / 2, Math.PI)
    arc(g, P(6, 3.0), 0.8, Math.PI / 2, 0) // into the bath
  }
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

/** run with the full gap closer on (bridges, passages, glazing lines) — off by default since the founder's 2026-09-28 scope */
function withCloser<T>(fn: () => T): T {
  KNOBS.closeGaps = true
  try {
    return fn()
  } finally {
    KNOBS.closeGaps = false
  }
}

describe('marks: stairs, glazing profile, glass colour', () => {
  test('a flight of 8 evenly spaced 1.2 m treads is a stair; 3 treads, or uneven lines, are not', () => {
    const w = 300, h = 300, k = 50
    const mask = new Uint8Array(w * h)
    const tread = (y: number, x0 = 40, x1 = 100) => { for (let x = x0; x < x1; x++) mask[y * w + x] = 1 }
    for (let i = 0; i < 8; i++) tread(40 + i * 14) // 0.28 m risers
    for (let i = 0; i < 3; i++) tread(40 + i * 14, 180, 240)
    for (const y of [180, 186, 215, 223, 260]) tread(y, 180, 240) // no rhythm
    const s = findStairs(mask, w, h, k)
    expect(s.length).toBe(1)
    expect(s[0]).toMatchObject({ x0: 40, y0: 40, y1: 40 + 7 * 14 })
  })

  test('glazing profile: a glass band or two lines count; the edge of a room fill does not', () => {
    const img = (f: (y: number) => number) => (_x: number, y: number) => f(Math.round(y))
    const band = glazing({ x: 0, y: 0 }, 1, 0, 100, 12, img((y) => (Math.abs(y) <= 3 ? 200 : 250)))
    expect(band.band).toBeGreaterThanOrEqual(3)
    const two = glazing({ x: 0, y: 0 }, 1, 0, 100, 12, img((y) => (y === -3 || y === 3 ? 150 : 250)))
    expect(two.lines).toBe(2)
    const fillEdge = glazing({ x: 0, y: 0 }, 1, 0, 100, 12, img((y) => (y < 0 ? 195 : 237)))
    expect(fillEdge.lines).toBe(0)
  })

  test('glass colour: a thin light-blue line is glass, a blue floor fill is not', () => {
    const w = 60, h = 60
    const data = new Uint8Array(w * h * 4).fill(255)
    const paint = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * w + x) * 4)
    for (let x = 5; x < 55; x++) paint(x, 5, [184, 216, 248])
    for (let y = 20; y < 50; y++) for (let x = 10; x < 50; x++) paint(x, y, [150, 190, 240])
    const m = glassMask({ width: w, height: h, data })
    expect(m[5 * w + 30]).toBe(1)
    expect(m[35 * w + 30]).toBe(0)
  })
})

describe('solveTraces on a synthetic flat', () => {
  test('plain door gaps (no arcs): the wall resumes across them (founder rule 4), no door is invented, each gap is a review item', () => {
    const { g, text } = synthetic(false)
    const r = solveTraces(g, { text }, { pickPx: P(2, 2.5) })
    expect(deriveRooms(r.unit).length).toBe(4)
    expect(r.unit.walls.flatMap((w) => w.openings)).toEqual([])
    expect(r.review.filter((x) => x.kind === 'opening-guess' && /carried on/.test(x.message)).length).toBe(3)
    // and with the (default-off) gap closer on, the same 4 rooms
    expect(deriveRooms(withCloser(() => solveTraces(g, { text }, { pickPx: P(2, 2.5) })).unit).length).toBe(4)
  })

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
    // outer walls 10", partitions 5" — the skeleton classes them; the band tracker carries the measured width (within ½")
    if (KNOBS.tracker === 'bands') for (const w of r.unit.walls) expect(Math.min(Math.abs(w.thicknessM - 0.127), Math.abs(w.thicknessM - 0.254)), `${w.thicknessM}`).toBeLessThanOrEqual(0.0127 + 1e-9)
    else expect(new Set(r.unit.walls.map((w) => w.thicknessM))).toEqual(new Set([0.127, 0.254]))
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
    // a hand-wash basin alone (dining areas have one, founder): never a bath; kept as a fixture position
    const basin = solveTraces(g, { text, hints: { hints: [{ at: P(4.8, 3.3), kind: 'bath', source: 'fixture', what: 'basin', conf: 0.6 }, { at: P(1, 1), kind: 'bath', source: 'fixture', what: 'basin', conf: 0.6 }] } }, { pickPx: P(2, 2.5) })
    expect(store(basin).kind).toBe('other')
    expect(deriveRooms(basin.unit).find((x) => x.name === 'Living')!.kind).toBe('living')
    expect(basin.stats.fixtures?.map((f) => f.what)).toEqual(['hand-wash basin', 'hand-wash basin'])
    const byColour = solveTraces(g, { text, propagate: (rooms) => rooms.map((r) => (r.kind ? null : { at: r.poly[0], kind: 'utility', source: 'colour', conf: 0.6 })) }, { pickPx: P(2, 2.5) })
    expect(store(byColour).kind).toBe('utility')
  })

  test('a blank sheet: an empty draft that still opens (no crash, validates, says why)', () => {
    const g: Gray = { width: 300, height: 200, data: new Uint8Array(300 * 200).fill(255) }
    const r = solveTraces(g, {}, { pickPx: { x: 150, y: 100 } })
    expect(r.unit.walls).toEqual([])
    expect(validate(r.unit)).toEqual([])
    expect(r.review.length).toBeGreaterThan(0)
  })

  test('no click: the largest closed region, same rooms', () => {
    const { g, text } = synthetic()
    expect(deriveRooms(solveTraces(g, { text }).unit).length).toBe(4)
  })

  test('with the gap closer: a side drawn only as a double thin line (glazing) closes the room, as a window', () => {
    const width = Math.round(6 * K + 2 * O.x), height = Math.round(4 * K + 2 * O.y)
    const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
    const ext = 0.254 * K, h = 0.127
    stroke(g, P(-h, 0), P(6 + h, 0), ext)
    stroke(g, P(-h, 4), P(6 + h, 4), ext)
    stroke(g, P(0, 0), P(0, 4), ext)
    for (const dx of [-2, 2]) for (let y = Math.round(P(0, 0).y); y < Math.round(P(0, 4).y); y++) g.data[y * width + Math.round(P(6, 0).x) + dx] = 90
    const r = withCloser(() => solveTraces(g, {}, { pickPx: P(1.5, 2) }))
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
/**
 * TRACE_RGB=<dir of trace-fixtures.mjs --rgb PPMs>: run the product path — the colour image (planter greens, blue glazing)
 * and the hints stage, as the Studio worker has them. Unset: text only (the wave-16 baseline).
 */
const RGB = process.env.TRACE_RGB ?? ''
const withColour = (g: Gray, name: string): { inputs: Partial<SolveInputs>; rgb?: ReturnType<typeof loadPpm> } => {
  const rgb = RGB ? loadPpm(`${RGB}${name}.ppm`) : null
  if (!rgb) return { inputs: {} }
  return { rgb, inputs: { green: greenMask(rgb), findHints: (pxPerM, walls) => findHints(g, rgb, { pxPerM, walls }) } }
}
/** TRACE_TRACKER=skeleton | bands | tracks: that wall stage instead of the default (KNOBS.tracker), for comparison */
const TRACKER = process.env.TRACE_TRACKER
if (TRACKER === 'skeleton' || TRACKER === 'bands' || TRACKER === 'tracks') KNOBS.tracker = TRACKER
const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
const sheet = (u: Unit) => u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')
const haveFixtures = Object.values(units).every((u) => existsSync(`${FIXTURES}assets__${sheet(u)}.pgm`) && existsSync(`${TEXT}${sheet(u)}.json`))
const readTextJson = (name: string): TextTrace => JSON.parse(readFileSync(`${TEXT}${name}.json`, 'utf8'))

describe.skipIf(!haveFixtures)('solver vs the hand-traced units (eval report)', () => {
  test('rooms matched / area / scale / kinds / review per unit', () => {
    const rows: SolveReport[] = []
    const why: string[] = []
    for (const u of Object.values(units)) {
      const g = loadPgm(`${FIXTURES}assets__${sheet(u)}.pgm`)!
      const debug: NonNullable<SolveInputs['debug']> = {}
      const c = withColour(g, `assets__${sheet(u)}`)
      const res = solveTraces(g, { text: readTextJson(sheet(u)), debug, ...c.inputs }, { pickPx: truthPick(u), ...(c.rgb ? { rgb: c.rgb } : {}) })
      const row = scoreSolve(res, u)
      rows.push(row)
      if (process.env.TRACE_DIAG) {
        const d = diagnoseMisses(g, u, row.missedIds, { trace: debug.trace!, plan: debug.plan!, full: debug.full!, raw: traceWalls(g) }, registerTruth(g, u))
        why.push(`${u.id} causes: ${Object.entries(d.counts).sort((p, q) => q[1] - p[1]).map(([c, n]) => `${c} ${n}`).join(' · ')}\n${d.rooms.map((x) => `  ${x.name}: ${x.cause} (${x.detail})`).join('\n')}`)
      }
      if (SHOTS) writeUnitOverlay(`${SHOTS}/solve-${u.id}.png`, g, res.unit, res.review, truthLines(u, registerTruth(g, u)))
      expect(validate(res.unit).filter((i) => i.level === 'error'), u.id).toEqual([])
    }
    console.log(`\n${formatSolveReports(rows)}\n\n${rows.map((r) => `${r.unitId} missed: ${r.missed.join(' · ')}`).join('\n')}\n\n${why.join('\n')}\n`)
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
      const c = withColour(g, s.file.replace(/.pgm$/, ''))
      const res = solveTraces(g, { text: existsSync(`${TEXT}${s.text}.json`) ? readTextJson(s.text) : undefined, ...c.inputs }, { pickPx: s.pick, ...(c.rgb ? { rgb: c.rgb } : {}) })
      writeUnitOverlay(`${SHOTS}/solve-${s.text}.png`, g, res.unit, res.review)
      console.log(s.text, JSON.stringify(res.stats), res.review.length, 'review')
      expect(validate(res.unit).filter((i) => i.level === 'error'), s.file).toEqual([])
    }
  }, 300000)
})
