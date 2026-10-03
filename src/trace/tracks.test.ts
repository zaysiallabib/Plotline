import { describe, expect, test } from 'vitest'
import { deriveRooms } from '../core'
import { KNOBS, solveTraces } from './solve'
import { traceTracks, trackWalls } from './tracks'
import { traceWalls } from './walls'
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

  test('pillars first: a long column on a wall is a pillar (with its middle) and never cuts the wall; a junction and a core block are no pillars', () => {
    const { g, box } = sheet(10, 6)
    hw(box, 1, 0, 10, 0.127)
    hw(box, 4, 0, 10, 0.127)
    vw(box, 2, 1, 4, 0.127) // a T / junction at (2, 1) and (2, 4): blocks, no pillars
    box(5.75, 0.6, 6.25, 1.8) // a 0.5 × 1.2 m column along the wall (Sheltech's facade columns): longer than a crossing body
    box(7.5, 3.0, 9.5, 5.0) // a 2 × 2 m core block on the lower wall: no pillar
    const tt = traceTracks(g, {})
    expect(tt.pillars.length).toBe(1)
    const p = tt.pillars[0]
    expect(Math.abs(p.cx / K - 1 - 6)).toBeLessThan(0.03)
    expect(Math.abs(p.cy / K - 1 - 1.2)).toBeLessThan(0.03)
    expect(Math.abs((p.x1 - p.x0) / K - 0.5)).toBeLessThan(0.05)
    // the wall runs through it as ONE wall, on its own centre line, at its own thickness
    const wall = tt.tracks.find((t) => t.horiz && Math.abs(t.c / K - 2) < 0.05)!
    const through = wall.intervals.filter((iv) => iv.u0 < 5.5 * K && iv.u1 > 7.5 * K)
    expect(through.length).toBe(1)
    expect(Math.abs(through[0].thPx / K - 0.127)).toBeLessThan(0.03)
    // the core block still cuts the lower wall (never bridged)
    const lower = tt.tracks.find((t) => t.horiz && Math.abs(t.c / K - 5) < 0.05)!
    expect(lower.intervals.some((iv) => iv.u0 < 8 * K && iv.u1 > 10.6 * K)).toBe(false)
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

  test('a gap with glass-colour pixels inside the wall band is a window; the same gap without them stays undecided', () => {
    const { g, box } = sheet(8, 4)
    hw(box, 1, 0, 3, 0.127)
    hw(box, 1, 4.5, 8, 0.127)
    hw(box, 3, 0, 8, 0.127)
    const glass = new Uint8Array(g.width * g.height)
    for (let x = Math.round(4 * K); x < Math.round(5.5 * K); x++) glass[Math.round(2 * K) * g.width + x] = 1 // a 1 px blue line
    expect(traceTracks(g, { glass }).gaps.map((x) => x.kind)).toEqual(['window'])
    expect(traceTracks(g, {}).gaps.map((x) => x.kind)).toEqual(['unknown'])
  })

  test('a double door: two quarter arcs from the two jambs meeting in the gap are ONE door; one arc alone over half the gap is none', () => {
    const run = (both: boolean) => {
      const { g, P, box } = sheet(8, 4)
      hw(box, 1, 0, 3, 0.127)
      hw(box, 1, 4.5, 8, 0.127)
      hw(box, 3, 0, 8, 0.127)
      // a 1 px grey quarter arc, hinge (cx, cy) m, radius r m, from angle a0 to a1 (radians, y down)
      const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
        const c = P(cx, cy)
        for (let i = 0; i <= 300; i++) {
          const t = a0 + ((a1 - a0) * i) / 300
          g.data[Math.round(c.y + r * K * Math.sin(t)) * g.width + Math.round(c.x + r * K * Math.cos(t))] = 60
        }
      }
      arc(3, 1.0635, 0.75, 0, Math.PI / 2) // leaf hinged on the left jamb, swinging down
      if (both) arc(4.5, 1.0635, 0.75, Math.PI / 2, Math.PI) // …and its mirror on the right jamb
      return traceTracks(g, {}).gaps.map((x) => x.kind)
    }
    expect(run(true)).toEqual(['door'])
    expect(run(false)).toEqual(['unknown'])
  })

  test('a door set in a recess: the leaf hinges on a wall END and closes sideways onto the parallel wall — a door across the end face', () => {
    const run = (withArc: boolean) => {
      const { g, P, box } = sheet(5, 5)
      vw(box, 1, 0, 4, 0.127) // the recess's far side, running on past the door
      vw(box, 1.9, 0, 2.5, 0.127) // the hinge wall, ending at y = 2.5
      hw(box, 0, 0.9, 2, 0.127) // the recess's back
      if (withArc) {
        const c = P(1.9 - 0.0635, 2.5), r = 0.9 - 0.127
        for (let i = 0; i <= 300; i++) {
          const t = Math.PI + (Math.PI / 2) * (i / 300) // from pointing at the far wall (shut) to up the hinge wall's face (open)
          g.data[Math.round(c.y + r * K * Math.sin(t)) * g.width + Math.round(c.x + r * K * Math.cos(t))] = 60
        }
      }
      return traceTracks(g, {}).gaps.filter((x) => x.horiz && Math.abs(x.c / K - 1 - 2.5) < 0.05)
    }
    const doors = run(true)
    expect(doors.map((x) => x.kind)).toEqual(['door'])
    expect(Math.abs(doors[0].u0 / K - 1 - (1 + 0.0635))).toBeLessThan(0.04) // face to face across the recess
    expect(Math.abs(doors[0].u1 / K - 1 - (1.9 - 0.0635))).toBeLessThan(0.04)
    expect(run(false)).toEqual([]) // nothing drawn: no door, no gap there
  })

  test('a 45° chamfer: the skeleton adds it as an angled wall whose ends sit on the track walls it meets', () => {
    const { g, P } = sheet(6, 5)
    const line = (p: { x: number; y: number }, q: { x: number; y: number }, th: number) => {
      const r = th / 2, L = Math.hypot(q.x - p.x, q.y - p.y)
      for (let y = 0; y < g.height; y++)
        for (let x = 0; x < g.width; x++) {
          const t = Math.max(0, Math.min(1, ((x - p.x) * (q.x - p.x) + (y - p.y) * (q.y - p.y)) / (L * L)))
          if (Math.hypot(x - p.x - (q.x - p.x) * t, y - p.y - (q.y - p.y) * t) <= r) g.data[y * g.width + x] = 0
        }
    }
    const pts = [P(0, 0), P(3, 0), P(4, 1), P(4, 3.5), P(0, 3.5)]
    pts.forEach((p, i) => line(p, pts[(i + 1) % pts.length], 0.127 * K))
    const { walls } = traceWalls(g, { tracker: 'tracks' })
    const diag = walls.filter((w) => Math.abs(Math.abs(w.b.x - w.a.x) - Math.abs(w.b.y - w.a.y)) < 0.2 * Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y))
    expect(diag.length).toBe(1)
    const axis = walls.filter((w) => w !== diag[0])
    for (const w of axis) expect(w.a.x === w.b.x || w.a.y === w.b.y, JSON.stringify(walls)).toBe(true)
    // both diagonal ends are ends (or points) of the axis walls it meets: on their centre lines
    for (const e of [diag[0].a, diag[0].b]) expect(axis.some((w) => (w.a.y === w.b.y && Math.abs(e.y - w.a.y) < 1e-6) || (w.a.x === w.b.x && Math.abs(e.x - w.a.x) < 1e-6)), JSON.stringify(walls.map((w) => [w.a, w.b]))).toBe(true)
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
