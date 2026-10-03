/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { readdirSync } from 'node:fs'
import type { Unit, Wall } from '../core/types'
import { evalTrace, formatReports, scoreUnit, truthLines, type EvalReport } from './eval'
import { FIXTURES, SHOTS, loadPgm, writeOverlay } from './evalio'
import { KNOBS } from './solve'
import { traceWalls } from './walls'
import type { Gray, Px, WallTrace } from './types'

// ---------- synthetic rasters ----------
const K = 60 // px per m
const O = { x: 40, y: 40 }

function canvas(wM: number, hM: number, k = K): Gray {
  const width = Math.round(wM * k + 2 * O.x), height = Math.round(hM * k + 2 * O.y)
  return { width, height, data: new Uint8Array(width * height).fill(255) }
}
const P = (x: number, y: number, k = K): Px => ({ x: O.x + x * k, y: O.y + y * k })

/** Ink every pixel within `th/2` px of segment ab (anti-aliased by a 1-px ramp). */
function stroke(g: Gray, a: Px, b: Px, th: number, grey = 0): void {
  const r = th / 2
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - 2)), x1 = Math.min(g.width - 1, Math.ceil(Math.max(a.x, b.x) + r + 2))
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r - 2)), y1 = Math.min(g.height - 1, Math.ceil(Math.max(a.y, b.y) + r + 2))
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2))
      const d = Math.hypot(x - a.x - vx * t, y - a.y - vy * t)
      const cover = Math.max(0, Math.min(1, r + 0.5 - d))
      const i = y * g.width + x
      g.data[i] = Math.min(g.data[i], Math.round(255 - (255 - grey) * cover))
    }
}

function arcStroke(g: Gray, c: Px, rad: number, a0: number, a1: number, th: number): void {
  const n = Math.ceil(Math.abs(a1 - a0) * rad / 2)
  for (let k = 0; k < n; k++) {
    const t0 = a0 + ((a1 - a0) * k) / n, t1 = a0 + ((a1 - a0) * (k + 1)) / n
    stroke(g, { x: c.x + rad * Math.cos(t0), y: c.y + rad * Math.sin(t0) }, { x: c.x + rad * Math.cos(t1), y: c.y + rad * Math.sin(t1) }, th)
  }
}

/** A unit from a polygon (metres), walls 0.12 m, plus the raster of its solid walls (openings left as gaps). */
function unitFrom(pts: [number, number][], openings: Record<number, { offsetM: number; widthM: number; kind: 'door' | 'window' | 'passage' }> = {}, k = K): { unit: Unit; g: Gray } {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const g = canvas(Math.max(...xs) + 0.5, Math.max(...ys) + 0.5, k)
  const vertices = pts.map(([x, y], i) => ({ id: `v${i}`, x, y }))
  const walls: Wall[] = pts.map((_, i) => ({
    id: `w${i}`,
    a: `v${i}`,
    b: `v${(i + 1) % pts.length}`,
    thicknessM: 0.12,
    heightM: 3,
    openings: openings[i] ? [{ id: `o${i}`, heightM: 2.1, sillM: 0, ...openings[i] }] : [],
  }))
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    const L = Math.hypot(bx - ax, by - ay)
    const cuts = openings[i] ? [[openings[i].offsetM, openings[i].offsetM + openings[i].widthM]] : []
    let from = 0
    // extend each piece by half a thickness at the corners so they join squarely
    const at = (m: number) => P(ax + ((bx - ax) * m) / L, ay + ((by - ay) * m) / L, k)
    for (const [p, q] of [...cuts, [L + 0.06, L + 0.06]]) {
      stroke(g, at(from === 0 ? -0.06 : from), at(Math.min(p, L + 0.06)), 0.12 * k)
      from = q
    }
  }
  const unit: Unit = {
    id: 'synthetic',
    projectName: 't',
    name: 't',
    northDeg: 0,
    vertices,
    walls,
    roomLabels: [],
    furniture: [],
    finishSlots: [],
    areaSqft: 0,
    planImage: { src: '', pxPerM: k, originPx: O },
  }
  return { unit, g }
}

const score = (t: WallTrace, u: Unit) => evalTrace(t, u, { marginM: 0.3 })

describe('traceWalls on synthetic plans', () => {
  test('rectangle room, 0.12 m walls: every side found, nothing else, thickness right', () => {
    const { unit, g } = unitFrom([[0, 0], [4, 0], [4, 3], [0, 3]])
    const t = traceWalls(g)
    const r = score(t, unit)
    expect(r.recall).toBeGreaterThan(0.95)
    expect(r.precision).toBeGreaterThan(0.97)
    expect(r.thicknessErrM).toBeLessThan(0.03)
    expect(r.endpointErrM).toBeLessThan(0.06)
  })

  test('L-shaped room', () => {
    const { unit, g } = unitFrom([[0, 0], [5, 0], [5, 2], [2.5, 2], [2.5, 4], [0, 4]])
    const r = score(traceWalls(g), unit)
    expect(r.recall).toBeGreaterThan(0.95)
    expect(r.precision).toBeGreaterThan(0.97)
  })

  test('45° chamfered corner keeps its real angle', () => {
    const { unit, g } = unitFrom([[0, 0], [3, 0], [4, 1], [4, 3.5], [0, 3.5]])
    const t = traceWalls(g)
    const r = score(t, unit)
    expect(r.recall).toBeGreaterThan(0.93)
    expect(r.precision).toBeGreaterThan(0.95)
    const diag = t.walls.filter((w) => !w.mid && Math.abs(Math.abs(Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x)) - Math.PI / 4 - (w.b.x < w.a.x ? Math.PI / 2 : 0)) < 0.1)
    expect(diag.length).toBeGreaterThan(0)
  })

  test('curved wall comes out as an arc through `mid`', () => {
    const g = canvas(4, 4)
    const c = P(0.2, 0.2), rad = 3.2 * K
    arcStroke(g, c, rad, 0.05, Math.PI / 2 - 0.05, 0.12 * K)
    const t = traceWalls(g)
    const arcs = t.walls.filter((w) => w.mid)
    expect(arcs.length).toBeGreaterThan(0)
    for (const w of arcs) for (const p of [w.a, w.mid!]) expect(Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - rad)).toBeLessThan(3)
    const arcLen = arcs.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0)
    expect(arcLen).toBeGreaterThan(0.8 * rad * Math.SQRT2 * 0.9)
  })

  test('door gap with a swing arc → a door opening at the gap, hinge at a jamb', () => {
    const { unit, g } = unitFrom([[0, 0], [5, 0], [5, 3.5], [0, 3.5]], { 0: { offsetM: 1.5, widthM: 0.9, kind: 'door' } })
    // leaf hinged at x = 1.5, swinging into the room (+y): a quarter arc radius 0.9 m + the open leaf line
    arcStroke(g, P(1.5, 0), 0.9 * K, 0, Math.PI / 2, 1.2)
    stroke(g, P(1.5, 0), P(1.5, 0.9), 1.2)
    const t = traceWalls(g)
    const r = score(t, unit)
    expect(r.openingRecall).toBe(1)
    expect(r.openingKindAcc).toBe(1)
    const d = t.openings.find((o) => o.kind === 'door')!
    expect(Math.hypot(d.hingeAt!.x - P(1.5, 0).x, d.hingeAt!.y - P(1.5, 0).y)).toBeLessThan(0.1 * K)
    expect(d.swingTo!.y).toBeGreaterThan(P(0, 0).y) // into the room
  })

  test('low-res noisy sheet (26.6 px/m, walls ≈ 3 px, jpeg-like noise): upsampled, still found', () => {
    const k = 26.6
    const { unit, g } = unitFrom([[0, 0], [5, 0], [5, 4], [2.5, 4], [2.5, 2.5], [0, 2.5]], {}, k)
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < g.data.length; i++) g.data[i] = Math.max(0, Math.min(255, g.data[i] + Math.round((rnd() - 0.5) * 40)))
    const tt = traceWalls(g)
    const r = evalTrace(tt, unit, { marginM: 0.3 })
    expect(r.recall).toBeGreaterThan(0.9)
    expect(r.precision).toBeGreaterThan(0.9)
  })

  test('text and a thin dimension line are not walls', () => {
    const { unit, g } = unitFrom([[0, 0], [4, 0], [4, 3], [0, 3]])
    // dimension line with ticks above the room, and a line of "text" (2 px strokes, 0.2 m letters) inside it
    stroke(g, P(0, -0.4), P(4, -0.4), 1)
    for (const x of [0, 4]) stroke(g, P(x - 0.05, -0.35), P(x + 0.05, -0.45), 1)
    for (let i = 0; i < 8; i++) {
      const x = 1 + i * 0.25
      stroke(g, P(x, 1.4), P(x, 1.6), 2)
      stroke(g, P(x, 1.4), P(x + 0.15, 1.4), 2)
      stroke(g, P(x, 1.5), P(x + 0.12, 1.5), 2)
    }
    const r = evalTrace(traceWalls(g), unit, { marginM: 0.6 })
    expect(r.precision).toBeGreaterThan(0.97)
    expect(r.recall).toBeGreaterThan(0.95)
  })
})

// ---------- the real plans (fixtures from scripts/trace-fixtures.mjs; skipped when absent) ----------
const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
const fixture = (u: Unit) => `${FIXTURES}assets__${u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')}.pgm`
const haveFixtures = Object.values(units).every((u) => loadPgm(fixture(u)) !== null)

/** Floors = what the tracer reached when written, minus a margin, so the report never flakes but regressions show. */
const FLOOR: Record<string, { precision: number; recall: number; openingRecall: number }> = {
  unit_type_a_2703: { precision: 0.63, recall: 0.4, openingRecall: 0.31 },
  unit_type_b_1747: { precision: 0.7, recall: 0.61, openingRecall: 0.4 },
  unit_type_c_2254: { precision: 0.76, recall: 0.54, openingRecall: 0.42 },
  unit_sheltech_a_2736: { precision: 0.56, recall: 0.48, openingRecall: 0.37 },
  unit_sheltech_b_2736: { precision: 0.7, recall: 0.51, openingRecall: 0.34 },
}

describe.skipIf(!haveFixtures)('traceWalls vs the hand-traced units (eval report)', () => {
  test('precision / recall / endpoint / thickness / openings per unit', () => {
    const rows: EvalReport[] = []
    for (const u of Object.values(units)) {
      const g = loadPgm(fixture(u))!
      // the solver's default wall stage; TRACE_TRACKER=skeleton | bands | tracks compares another
      const { report, trace, xf } = scoreUnit(g, u, { tracker: (['skeleton', 'bands', 'tracks'] as const).find((t) => t === process.env.TRACE_TRACKER) ?? KNOBS.tracker })
      rows.push(report)
      if (SHOTS) writeOverlay(`${SHOTS}/eval-${u.id}.png`, g, trace, truthLines(u, xf), undefined, report)
    }
    console.log(`\n${formatReports(rows)}\n`)
    for (const r of rows) {
      const f = FLOOR[r.unitId]
      if (!f) continue
      expect(r.precision, r.unitId).toBeGreaterThan(f.precision)
      expect(r.recall, r.unitId).toBeGreaterThan(f.recall)
      expect(r.openingRecall, r.unitId).toBeGreaterThan(f.openingRecall)
      expect(r.ms!, r.unitId).toBeLessThan(3000)
    }
  }, 120000)
})

const allFixtures = haveFixtures ? readdirSync(FIXTURES).filter((f) => f.endsWith('.pgm')) : []

describe.skipIf(!allFixtures.length)('traceWalls smoke run over every demo drawing', () => {
  test('never crashes, stays fast', () => {
    const lines: string[] = []
    for (const f of allFixtures) {
      const g = loadPgm(FIXTURES + f)!
      const t0 = performance.now()
      const t = traceWalls(g)
      const ms = performance.now() - t0
      const deg = new Map<string, number>()
      for (const w of t.walls) for (const p of [w.a, w.b]) deg.set(`${p.x.toFixed(2)},${p.y.toFixed(2)}`, (deg.get(`${p.x.toFixed(2)},${p.y.toFixed(2)}`) ?? 0) + 1)
      const freeEnds = t.walls.flatMap((w) => [w.a, w.b]).filter((p) => deg.get(`${p.x.toFixed(2)},${p.y.toFixed(2)}`) === 1)
      const free = freeEnds.length
      // dangling = a free end that is no jamb of any opening guess: the solver's junction-closing work
      const dangling = freeEnds.filter((p) => !t.openings.some((o) => Math.hypot(o.a.x - p.x, o.a.y - p.y) < 3 || Math.hypot(o.b.x - p.x, o.b.y - p.y) < 3)).length
      lines.push(`${f.padEnd(40)} ${String(g.width).padStart(5)}×${String(g.height).padEnd(5)} walls ${String(t.walls.length).padStart(4)} arcs ${String(t.walls.filter((w) => w.mid).length).padStart(3)} free ends ${String(free).padStart(4)} dangling ${String(dangling).padStart(4)} openings ${String(t.openings.length).padStart(3)} ${String(Math.round(ms)).padStart(4)} ms`)
      if (SHOTS) writeOverlay(`${SHOTS}/smoke-${f.replace(/\.pgm$/, '')}.png`, g, t)
      expect(ms, f).toBeLessThan(6000)
      for (const w of t.walls) expect(Number.isFinite(w.a.x + w.a.y + w.b.x + w.b.y + w.thicknessPx), f).toBe(true)
    }
    console.log(`\n${lines.join('\n')}\n`)
  }, 300000)
})
