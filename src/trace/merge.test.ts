import { describe, expect, test } from 'vitest'
import { closeCorners, roomsOnTracks } from './merge'
import { fitRooms } from './rooms'
import { traceTracks } from './tracks'
import type { Gray, OpeningGuess, TextItem, WallSeg } from './types'

const W = (ax: number, ay: number, bx: number, by: number, th = 6): WallSeg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessPx: th, conf: 1 })

describe('closeCorners (k = 50 px/m)', () => {
  test('a free end 4 px short of a perpendicular wall is carried on to its centre line, along its own axis', () => {
    const walls = [W(0, 0, 0, 100), W(7, 50, 100, 50)]
    closeCorners(walls, [], 50)
    expect(walls[1].a).toEqual({ x: 0, y: 50 })
  })

  test('an opening ending short of a wall gets a connector; the opening keeps its span', () => {
    const walls = [W(0, 0, 0, 100)]
    const ops: OpeningGuess[] = [{ a: { x: 6, y: 50 }, b: { x: 60, y: 50 }, kind: 'window', conf: 0.6, thicknessPx: 6 }]
    const added = closeCorners(walls, ops, 50)
    expect(added).toEqual([expect.objectContaining({ a: { x: 6, y: 50 }, b: { x: 0, y: 50 } })])
    expect(ops[0].a).toEqual({ x: 6, y: 50 })
  })

  test('0.4 m short: left open — unless solid ink (a column) fills the gap', () => {
    const open = [W(0, 0, 0, 100), W(23, 50, 100, 50)]
    closeCorners(open, [], 50)
    expect(open[1].a).toEqual({ x: 23, y: 50 })
    const column = [W(0, 0, 0, 100), W(23, 50, 100, 50)]
    closeCorners(column, [], 50, () => 1)
    expect(column[1].a).toEqual({ x: 0, y: 50 })
  })

  test('an undecided gap is no edge: the wall ends beside it stay free and are not joined across it', () => {
    const walls = [W(0, 0, 0, 100), W(40, 50, 100, 50)]
    const ops: OpeningGuess[] = [{ a: { x: 3, y: 50 }, b: { x: 40, y: 50 }, kind: 'unknown', conf: 0 }]
    closeCorners(walls, ops, 50)
    expect(walls[1].a).toEqual({ x: 40, y: 50 })
  })
})

describe('roomsOnTracks: open plan (k = 50 px/m)', () => {
  // a living 4 × 5 m (centre lines, 10" walls) whose right side is drawn open save two 0.3 m stubs, beside a space no name
  // was read for: closed by an outer wall 4 m on (`closed`), or open to the outside
  const run = (closed: boolean) => {
    const K = 50, M = 60, w = 9 * K + 2 * M, h = 5 * K + 2 * M
    const g: Gray = { width: w, height: h, data: new Uint8Array(w * h).fill(255) }
    const box = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = Math.round(M + y0 * K); y < Math.round(M + y1 * K); y++) for (let x = Math.round(M + x0 * K); x < Math.round(M + x1 * K); x++) g.data[y * w + x] = 0
    }
    const t = 0.127
    box(-t, -t, closed ? 8 + t : 4 + t, t)
    box(-t, 5 - t, closed ? 8 + t : 4 + t, 5 + t)
    box(-t, -t, t, 5 + t)
    box(4 - t / 2, 0, 4 + t / 2, 0.3)
    box(4 - t / 2, 4.7, 4 + t / 2, 5)
    if (closed) box(8 - t, -t, 8 + t, 5 + t)
    const label: TextItem = { text: 'LIVING', box: { x: M + 2 * K - 30, y: M + 2.5 * K - 10, w: 60, h: 20 }, kind: 'room', roomKind: 'living', dims: { aM: 4 - t - t / 2, bM: 5 - 2 * t }, conf: 0.9, source: 'ocr' }
    const tt = traceTracks(g, { halfPx: (0.127 / 2) * K })
    const fits = fitRooms(g, [label], { pxPerM: K, tracks: tt.tracks })
    return roomsOnTracks(tt, [], fits, K, { gray: g, labels: fits.map((f) => f.at) })
  }

  test('open toward an enclosed space with no name read: a passage on that side, flagged "open-plan boundary"', () => {
    const r = run(true)
    const pass = r.openings.filter((o) => o.kind === 'passage')
    expect(pass.length).toBe(1)
    expect(Math.abs(pass[0].a.x - pass[0].b.x)).toBeLessThan(1e-6) // the living's right side, vertical
    expect(Math.abs(pass[0].a.y - pass[0].b.y) / 50).toBeGreaterThan(3.5)
    expect(r.review.some((x) => /Open-plan boundary/.test(x.message))).toBe(true)
  })

  test('open toward the outside: no passage, a review item', () => {
    const r = run(false)
    expect(r.openings.filter((o) => o.kind === 'passage')).toEqual([])
    expect(r.review.some((x) => /nothing drawn on it/.test(x.message))).toBe(true)
  })
})
