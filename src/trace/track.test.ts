/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Unit } from '../core'
import { evalTrace, registerTruth, type TruthXf } from './eval'
import { FIXTURES, loadPgm } from './evalio'
import { trackThin } from './track'
import { traceWalls } from './walls'
import type { Gray, Px, WallTrace } from './types'

const K = 50
const O = { x: 60, y: 60 }
const P = (x: number, y: number): Px => ({ x: O.x + x * K, y: O.y + y * K })
function box(g: Gray, x0: number, y0: number, x1: number, y1: number, grey = 0): void {
  for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) g.data[y * g.width + x] = grey
}

describe('trackThin on a synthetic sheet', () => {
  test('a railing carrying on from a wall end is followed to the next wall; a bed outline is not', () => {
    const width = Math.round(8 * K + 2 * O.x), height = Math.round(5 * K + 2 * O.y)
    const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
    const t = 0.254 * K
    box(g, P(0, 0).x - t / 2, P(0, 0).y - t / 2, P(8, 0).x + t / 2, P(0, 0).y + t / 2) // top wall
    box(g, P(0, 0).x - t / 2, P(0, 0).y, P(0, 0).x + t / 2, P(0, 5).y + t / 2) // left wall
    box(g, P(0, 5).x, P(0, 5).y - t / 2, P(3, 5).x, P(0, 5).y + t / 2) // bottom wall, stops at x = 3
    box(g, P(8, 0).x - t / 2, P(8, 0).y, P(8, 0).x + t / 2, P(8, 5).y + t / 2) // right wall
    box(g, P(3, 5).x, P(0, 5).y - 1, P(8, 5).x, P(0, 5).y + 1, 90) // the railing: a 2 px dark-grey line on to the right wall
    // a bed against the top wall: a 1 px outline hanging off nothing
    box(g, P(4, 0.2).x, P(4, 0.2).y, P(6, 0.2).x, P(4, 0.2).y + 1, 90)
    box(g, P(4, 0.2).x, P(4, 2.2).y, P(6, 0.2).x, P(4, 2.2).y + 1, 90)
    box(g, P(4, 0.2).x, P(4, 0.2).y, P(4, 0.2).x + 1, P(4, 2.2).y, 90)
    box(g, P(6, 0.2).x, P(4, 0.2).y, P(6, 0.2).x + 1, P(4, 2.2).y, 90)
    const trace = traceWalls(g)
    const got = trackThin(g, trace, { pxPerM: K })
    expect(got.length).toBeGreaterThan(0)
    const len = got.reduce((s, w) => s + Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), 0)
    expect(Math.abs(len / K - 5)).toBeLessThan(0.4) // ≈ 5 m of railing, x 3 → 8
    for (const w of got) expect(Math.abs((w.a.y + w.b.y) / 2 - P(0, 5).y)).toBeLessThan(3) // on the railing, not the bed
  })
})

// ---------- the real plans: wall recall and false walls inside truth rooms, before / after the tracker ----------
// the traced flats (a level authored without a plan image is no auto-trace target)
const units = Object.fromEntries(Object.entries(import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })).filter(([, u]) => u.planImage))
const sheet = (u: Unit) => u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')
const haveFixtures = Object.values(units).every((u) => existsSync(`${FIXTURES}assets__${sheet(u)}.pgm`))

/** Traced length (m) off every truth wall and deep inside a truth room (≥ 0.2 m from its outline): false walls. */
function falseInside(trace: WallTrace, u: Unit, xf: TruthXf): { m: number; walls: number } {
  const r = evalTrace(trace, u, {}, xf)
  const toPx = (p: { x: number; y: number }) => ({ x: xf.c.x + (p.x - xf.mid.x) * xf.k * (1 + xf.ex), y: xf.c.y + (p.y - xf.mid.y) * xf.k * (1 + xf.ey) })
  const polys = deriveRooms(u).map((room) => roomPolygon(room, u).map(toPx))
  const inset = 0.2 * xf.k
  const deep = (p: Px) =>
    polys.some((poly) => pointInPolygon(p, poly) && poly.every((q, i) => {
      const s = poly[(i + 1) % poly.length], vx = s.x - q.x, vy = s.y - q.y, L2 = vx * vx + vy * vy || 1
      const t = Math.max(0, Math.min(1, ((p.x - q.x) * vx + (p.y - q.y) * vy) / L2))
      return Math.hypot(p.x - q.x - vx * t, p.y - q.y - vy * t) >= inset
    }))
  const bad = r.extra.filter(deep)
  // a wall counts as false when most of its samples are
  const walls = trace.walls.filter((w) => {
    const n = 10
    let k = 0
    for (let i = 0; i < n; i++) {
      const p = { x: w.a.x + ((w.b.x - w.a.x) * (i + 0.5)) / n, y: w.a.y + ((w.b.y - w.a.y) * (i + 0.5)) / n }
      if (bad.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.05 * xf.k)) k++
    }
    return k > n / 2
  }).length
  return { m: bad.length * 0.05, walls }
}

describe.skipIf(!haveFixtures)('trackThin vs the hand-traced units (eval report)', () => {
  test('wall recall / precision and false walls inside truth rooms, without and with the tracker', () => {
    const lines = ['unit                  recall  → +track   prec  → +track   tracked  false-in-rooms (walls, m)  → +track']
    for (const u of Object.values(units)) {
      const g = loadPgm(`${FIXTURES}assets__${sheet(u)}.pgm`)!
      const xf = registerTruth(g, u)
      const k = u.planImage!.pxPerM
      const base = traceWalls(g, { halfPx: 0.0635 * k })
      const stats: Record<string, number> = {}
      const tracked = trackThin(g, base, { pxPerM: k, stats })
      console.log(u.id, JSON.stringify(stats))
      const withT = { ...base, walls: [...base.walls, ...tracked] }
      const a = evalTrace(base, u, {}, xf), b = evalTrace(withT, u, {}, xf)
      const fa = falseInside(base, u, xf), fb = falseInside(withT, u, xf)
      const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5)
      lines.push(`${u.id.padEnd(20)} ${pct(a.recall)}  → ${pct(b.recall)}   ${pct(a.precision)}  → ${pct(b.precision)}   ${String(tracked.length).padStart(7)}  ${`${fa.walls}, ${fa.m.toFixed(1)}`.padStart(16)}  → ${fb.walls}, ${fb.m.toFixed(1)}`)
      expect(b.recall).toBeGreaterThanOrEqual(a.recall - 0.01)
    }
    console.log(`\n${lines.join('\n')}\n(at the truth scale; recall/precision = evalTrace; false-in-rooms = traced length off every truth wall, ≥ 0.2 m inside a truth room)\n`)
  }, 300000)
})
