import { describe, expect, test } from 'vitest'
import { deriveRooms } from '../core'
import { KNOBS, solveTraces } from './solve'
import { traceTracks, trackWalls } from './tracks'
import type { Gray } from './types'

const K = 50 // px per m
/** A blank sheet w × h m with a 1 m margin; P(x, y) m → px. */
function sheet(wM: number, hM: number): { g: Gray; P: (x: number, y: number) => { x: number; y: number }; box: (x0: number, y0: number, x1: number, y1: number, grey?: number) => void } {
  const width = Math.round((wM + 2) * K), height = Math.round((hM + 2) * K)
  const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
  const P = (x: number, y: number) => ({ x: (x + 1) * K, y: (y + 1) * K })
  /** fill the rectangle x0..x1 × y0..y1 (m) */
  const box = (x0: number, y0: number, x1: number, y1: number, grey = 0) => {
    for (let y = Math.round((y0 + 1) * K); y < Math.round((y1 + 1) * K); y++) for (let x = Math.round((x0 + 1) * K); x < Math.round((x1 + 1) * K); x++) g.data[y * width + x] = grey
  }
  return { g, P, box }
}
/** a horizontal wall at y (centre), x0 → x1, th m thick; a vertical one at x */
const hw = (box: ReturnType<typeof sheet>['box'], y: number, x0: number, x1: number, th: number) => box(x0, y - th / 2, x1, y + th / 2)
const vw = (box: ReturnType<typeof sheet>['box'], x: number, y0: number, y1: number, th: number) => box(x - th / 2, y0, x + th / 2, y1)

describe('wall tracks on synthetic rasters', () => {
  test('a flush thickness step: one wall per part, each exactly on its ink, touching and joined — nothing side by side', () => {
    const { g, box } = sheet(8, 4)
    // a 10" wall 0–4 m and a 5" wall 4–8 m, flush along their top face (y = 1)
    box(0, 1, 4, 1.254)
    box(4, 1, 8, 1.127)
    // something else on the sheet so the 5" class is common enough (a 5" box)
    hw(box, 3, 0, 8, 0.127)
    const tt = traceTracks(g, {})
    const near = tt.tracks.filter((t) => t.horiz && Math.abs(t.c / K - 1 - 1.1) < 0.2)
    const ivs = near.flatMap((t) => t.intervals.map((i) => ({ ...i, c: t.c }))).sort((p, q) => p.u0 - q.u0)
    expect(ivs.length).toBe(2)
    // the rasterised bands: 13 px from y = 100 (centre 106), 6 px from y = 100 (centre 103)
    expect(Math.abs(ivs[0].thPx - 13)).toBeLessThan(0.6)
    expect(Math.abs(ivs[0].c - 106)).toBeLessThan(0.6)
    expect(Math.abs(ivs[1].thPx - 6)).toBeLessThan(0.6)
    expect(Math.abs(ivs[1].c - 102.5)).toBeLessThan(0.6)
    expect(Math.abs(ivs[0].u1 - ivs[1].u0)).toBeLessThan(0.01) // end to end, no overlap
    expect(tt.joins.length).toBe(1) // the jog that keeps them one boundary
    expect(Math.abs(ivs[0].u0 / K - 1 - 0)).toBeLessThan(0.02) // the wall starts where its ink starts
    expect(Math.abs(ivs[1].u1 / K - 1 - 8)).toBeLessThan(0.02)
  })

  test('a column on a wall: one wall through it, no duplicate, the column is a block', () => {
    const { g, box } = sheet(8, 4)
    hw(box, 1, 0, 8, 0.127)
    hw(box, 3, 0, 8, 0.127)
    box(3.7, 0.75, 4.3, 1.35) // a 0.6 × 0.6 m column straddling the wall
    const tt = traceTracks(g, {})
    const hz = tt.tracks.filter((t) => t.horiz)
    expect(hz.length).toBe(2)
    const wall = hz.find((t) => Math.abs(t.c / K - 2) < 0.1)!
    expect(wall.intervals.length).toBe(1)
    expect(wall.intervals[0].u1 - wall.intervals[0].u0).toBeGreaterThan(7.9 * K)
    expect(tt.tracks.filter((t) => !t.horiz)).toEqual([]) // the column is no vertical wall
    expect(tt.blocks.some((b) => b.x0 <= 4.7 * K + 1 && b.x1 >= 5.3 * K - 1)).toBe(true)
  })

  test('a plain gap: two walls, no opening; their ends stay where the ink stops', () => {
    const { g, box } = sheet(8, 4)
    hw(box, 1, 0, 3, 0.127)
    hw(box, 1, 4, 8, 0.127)
    hw(box, 3, 0, 8, 0.127)
    const { walls, openings } = trackWalls(traceTracks(g, {}))
    const top = walls.filter((w) => Math.abs(w.a.y / K - 2) < 0.1).sort((p, q) => p.a.x - q.a.x)
    expect(top.length).toBe(2)
    expect(Math.abs(top[0].b.x / K - 1 - 3)).toBeLessThan(0.02)
    expect(Math.abs(top[1].a.x / K - 1 - 4)).toBeLessThan(0.02)
    expect(openings.filter((o) => o.kind !== 'unknown')).toEqual([])
    expect(openings.filter((o) => o.kind === 'unknown').length).toBe(1) // a review item, not a wall
  })

  test('a window gap drawn as two thin lines: classified window, and the solver makes ONE wall with a window child', () => {
    const { g, P, box } = sheet(8, 5)
    // a closed 6 × 4 m room; its top wall has a 1.5 m window (2 thin lines inside the wall's band) at 2–3.5 m
    hw(box, 0, -0.127, 2, 0.254)
    hw(box, 0, 3.5, 6.127, 0.254)
    for (const dy of [-0.06, 0.06]) box(2, dy - 0.01, 3.5, dy + 0.01, 120)
    hw(box, 4, -0.127, 6.127, 0.254)
    vw(box, 0, 0, 4, 0.254)
    vw(box, 6, 0, 4, 0.254)
    const tt = traceTracks(g, {})
    expect(tt.gaps.filter((x) => x.kind === 'window').length).toBe(1)
    const prev = KNOBS.tracker
    KNOBS.tracker = 'tracks'
    try {
      const r = solveTraces(g, {}, { pickPx: P(3, 2) })
      const withWin = r.unit.walls.filter((w) => w.openings.some((o) => o.kind === 'window'))
      expect(withWin.length).toBe(1)
      const V = new Map(r.unit.vertices.map((v) => [v.id, v]))
      const w = withWin[0], a = V.get(w.a)!, b = V.get(w.b)!
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      expect(L).toBeGreaterThan((5.9 * K) / r.stats.pxPerM) // the whole top wall, corner to corner (draft metres)
      expect(deriveRooms(r.unit).length).toBe(1)
    } finally {
      KNOBS.tracker = prev
    }
  })

  test('crossings: an L corner and a T meet at the exact track crossing (one shared point)', () => {
    const { g, box } = sheet(8, 5)
    // L: top wall 0..6 at y = 0, left wall at x = 0 going down; T: a partition at x = 3 from the top wall down to y = 4
    hw(box, 0, -0.127, 6, 0.254)
    vw(box, 0, -0.127, 4, 0.254)
    vw(box, 3, 0, 4, 0.127)
    hw(box, 4, -0.127, 6, 0.127)
    const { walls } = trackWalls(traceTracks(g, {}))
    const ends = walls.flatMap((w) => [w.a, w.b])
    const at = (x: number, y: number) => ends.filter((p) => Math.hypot(p.x - (x + 1) * K, p.y - (y + 1) * K) < 3)
    // the L corner: the top wall's and the left wall's ends coincide exactly
    const L = at(0, 0)
    expect(L.length).toBe(2)
    expect(L[0].x).toBeCloseTo(L[1].x, 6)
    expect(L[0].y).toBeCloseTo(L[1].y, 6)
    // the T: the partition's top end lies exactly on the top wall's centre line
    const top = walls.find((w) => w.a.y === w.b.y && Math.abs(w.a.y / K - 1) < 0.1)!
    const part = walls.find((w) => w.a.x === w.b.x && Math.abs(w.a.x / K - 4) < 0.1)!
    expect(Math.min(part.a.y, part.b.y)).toBeCloseTo(top.a.y, 6)
    // nothing tilted, nothing doubled
    for (const w of walls) expect(w.a.x === w.b.x || w.a.y === w.b.y).toBe(true)
    expect(walls.length).toBe(4)
  })
})
