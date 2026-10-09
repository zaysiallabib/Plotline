import { describe, expect, test } from 'vitest'
import { closeCorners, roomsOnTracks } from './merge'
import { fitRooms, type RoomFit, type Side, type Stretch } from './rooms'
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

describe('roomsOnTracks: a veranda\'s railing (Level 1, k = 50 px/m)', () => {
  // the building's outer wall (y = 60, 10 px) has a gap 110 … 190 — the open side of the room fitted below it, whose top
  // edge reads ONE thin line along the wall's outer face (y 55.5); its other sides are walls
  const run = (name: string, roomKind: string) => {
    const g: Gray = { width: 300, height: 200, data: new Uint8Array(300 * 200).fill(255) }
    const tt = {
      tracks: [
        { horiz: true, c: 60, intervals: [{ u0: 0, u1: 110, thPx: 10 }, { u0: 190, u1: 300, thPx: 10 }] },
        { horiz: false, c: 100, intervals: [{ u0: 60, u1: 130, thPx: 10 }] },
        { horiz: false, c: 200, intervals: [{ u0: 60, u1: 130, thPx: 10 }] },
        { horiz: true, c: 130, intervals: [{ u0: 100, u1: 200, thPx: 10 }] },
      ],
      joins: [],
      gaps: [{ horiz: true, c: 60, u0: 110, u1: 190, node0: 100, node1: 200, thPx: 10, kind: 'unknown' as const, conf: 0.2 }],
    }
    const edge = (side: Side, c: number, out: 1 | -1, u0: number, u1: number, kind: Stretch['kind']) => ({ side, c, out, u0, u1, evidence: 1, stretches: [{ kind, u0, u1, ...(kind === 'wall' ? { thPx: 10 } : {}) }] })
    const label: TextItem = { text: name, box: { x: 130, y: 85, w: 40, h: 20 }, kind: 'room', roomKind, conf: 0.9, source: 'ocr' }
    const fit: RoomFit = { label, at: { x: 150, y: 95 }, dims: { aM: 1.8, bM: 1.3 }, swapped: false, rect: { x0: 105, y0: 56, x1: 195, y1: 125 }, conf: 1, edges: [edge('top', 56, -1, 105, 195, 'thin'), edge('bottom', 125, 1, 105, 195, 'wall'), edge('left', 105, -1, 56, 125, 'wall'), edge('right', 195, 1, 56, 125, 'wall')] }
    return roomsOnTracks(tt, [], [fit], 50, { gray: g, labels: [fit.at] })
  }

  test('on a room printed VER the thin line across the gap is its railing: a 1.1 m low wall on the drawn line, joined to the wall ends, flagged; a bedroom\'s stays open', () => {
    const ver = run('VER', 'balcony')
    const low = ver.walls.filter((x) => x.heightM === 1.1)
    expect(low.length, JSON.stringify([ver.review.map((x) => x.message), ver.gapReads])).toBeGreaterThan(0)
    expect(low.find((x) => x.a.y === x.b.y)).toMatchObject({ a: { x: 110 }, b: { x: 190 } })
    expect(ver.review.some((x) => /across the veranda's open side/.test(x.message))).toBe(true)
    const bed = run('BED 2', 'bed')
    expect(bed.walls.filter((x) => x.heightM === 1.1 && x.a.y === x.b.y && x.a.y < 60)).toEqual([])
    expect(bed.review.some((x) => /one thin line across it/.test(x.message))).toBe(true)
  })
})
