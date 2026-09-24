import { describe, expect, test } from 'vitest'
import {
  deriveRooms,
  nearestWall,
  pointInPolygon,
  roomAt,
  roomInnerPolygon,
  signedArea,
  triangulate,
  unitBounds,
  wallFrame,
  wallPieces,
  type Graph,
  type Opening,
  type Pt,
  type Wall,
} from './index'

const P = (x: number, y: number): Pt => ({ x, y })
const triArea = (poly: Pt[], tris: number[]) => {
  let s = 0
  for (let i = 0; i < tris.length; i += 3) s += signedArea([poly[tris[i]], poly[tris[i + 1]], poly[tris[i + 2]]])
  return s
}

const square = [P(0, 0), P(4, 0), P(4, 3), P(0, 3)]
const lShape = [P(0, 0), P(6, 0), P(6, 3), P(3, 3), P(3, 6), P(0, 6)]
const chamfered = [P(0, 0), P(5, 0), P(5, 3), P(4, 4), P(0, 4)]
const concave = [P(0, 0), P(6, 0), P(6, 4), P(4, 4), P(4, 1), P(2, 1), P(2, 4), P(0, 4)]
const collinear = [P(0, 0), P(2, 0), P(4, 0), P(4, 3), P(4, 3), P(0, 3)]

describe('triangulate', () => {
  test.each([
    ['square', square],
    ['L-shape', lShape],
    ['chamfered', chamfered],
    ['concave', concave],
    ['collinear+duplicate points', collinear],
  ])('%s, both windings', (_, poly) => {
    for (const p of [poly, [...poly].reverse()]) {
      const tris = triangulate(p)
      expect(tris.length % 3).toBe(0)
      // every triangle positive, sum equals |polygon area|
      for (let i = 0; i < tris.length; i += 3) {
        expect(signedArea([p[tris[i]], p[tris[i + 1]], p[tris[i + 2]]])).toBeGreaterThan(0)
      }
      expect(triArea(p, tris)).toBeCloseTo(Math.abs(signedArea(p)), 9)
    }
  })
  test('square gives 2 triangles', () => expect(triangulate(square)).toHaveLength(6))
})

describe('signedArea / pointInPolygon / unitBounds', () => {
  test('sign follows winding', () => {
    expect(signedArea(square)).toBe(12)
    expect(signedArea([...square].reverse())).toBe(-12)
  })
  test('pointInPolygon on concave', () => {
    expect(pointInPolygon(P(1, 2), concave)).toBe(true)
    expect(pointInPolygon(P(3, 2), concave)).toBe(false) // in the notch
    expect(pointInPolygon(P(5, 3), concave)).toBe(true)
    expect(pointInPolygon(P(7, 3), concave)).toBe(false)
  })
  test('unitBounds', () => {
    expect(unitBounds({ vertices: [{ id: 'a', x: -1, y: 2 }, { id: 'b', x: 3, y: -4 }] })).toEqual({
      minX: -1,
      minY: -4,
      maxX: 3,
      maxY: 2,
    })
    expect(unitBounds({ vertices: [] })).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })
})

const wall = (openings: Opening[] = [], heightM = 3): Wall => ({
  id: 'w',
  a: 'a',
  b: 'b',
  thicknessM: 0.1,
  heightM,
  openings,
})
const op = (o: Partial<Opening>): Opening => ({
  id: 'o',
  kind: 'door',
  offsetM: 0,
  widthM: 1,
  heightM: 2.1,
  sillM: 0,
  ...o,
})
const pieceArea = (ps: { u0: number; u1: number; v0: number; v1: number }[]) =>
  ps.reduce((s, p) => s + (p.u1 - p.u0) * (p.v1 - p.v0), 0)
const noOverlap = (ps: { u0: number; u1: number; v0: number; v1: number }[]) => {
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      const overlap = a.u0 < b.u1 - 1e-9 && b.u0 < a.u1 - 1e-9 && a.v0 < b.v1 - 1e-9 && b.v0 < a.v1 - 1e-9
      if (overlap) return false
    }
  return true
}

describe('wallPieces', () => {
  test('no openings → 1 piece', () => {
    expect(wallPieces(wall(), 5)).toEqual([{ u0: 0, u1: 5, v0: 0, v1: 3 }])
  })
  test('door with header → 3 pieces (left, header, right)', () => {
    const ps = wallPieces(wall([op({ offsetM: 2, widthM: 1, heightM: 2.1 })]), 5)
    expect(ps).toHaveLength(3)
    expect(ps).toContainEqual({ u0: 2, u1: 3, v0: 2.1, v1: 3 })
    expect(pieceArea(ps)).toBeCloseTo(15 - 2.1, 9)
    expect(noOverlap(ps)).toBe(true)
  })
  test('full-height door → 2 pieces', () => {
    const ps = wallPieces(wall([op({ offsetM: 2, widthM: 1, heightM: 3 })]), 5)
    expect(ps).toHaveLength(2)
    expect(pieceArea(ps)).toBeCloseTo(12, 9)
  })
  test('window → 4 pieces', () => {
    const ps = wallPieces(wall([op({ kind: 'window', offsetM: 1, widthM: 1.5, sillM: 0.9, heightM: 1.2 })]), 5)
    expect(ps).toHaveLength(4)
    expect(pieceArea(ps)).toBeCloseTo(15 - 1.5 * 1.2, 9)
    expect(noOverlap(ps)).toBe(true)
  })
  test('door + window, area conserved, span between is one piece', () => {
    const ps = wallPieces(
      wall([
        op({ id: 'd', offsetM: 0.5, widthM: 0.9, heightM: 2.1 }),
        op({ id: 'w', kind: 'window', offsetM: 3, widthM: 1.2, sillM: 0.9, heightM: 1.2 }),
      ]),
      5,
    )
    expect(pieceArea(ps)).toBeCloseTo(15 - 0.9 * 2.1 - 1.2 * 1.2, 9)
    expect(noOverlap(ps)).toBe(true)
    expect(ps).toContainEqual({ u0: 1.4, u1: 3, v0: 0, v1: 3 })
    expect(ps).toHaveLength(1 + 1 + 1 + 2 + 1)
  })
  test('out-of-range openings are clamped / ignored', () => {
    const ps = wallPieces(wall([op({ offsetM: 4.5, widthM: 2, heightM: 5 }), op({ offsetM: 9, widthM: 1 })]), 5)
    expect(ps).toEqual([{ u0: 0, u1: 4.5, v0: 0, v1: 3 }])
  })
})

/** 4×3 rectangle, walls 0.2 thick. */
const rect: Graph = {
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 4, y: 0 },
    { id: 'c', x: 4, y: 3 },
    { id: 'd', x: 0, y: 3 },
  ],
  walls: [
    { id: 'ab', a: 'a', b: 'b', thicknessM: 0.2, heightM: 3, openings: [] },
    { id: 'bc', a: 'b', b: 'c', thicknessM: 0.2, heightM: 3, openings: [] },
    { id: 'cd', a: 'c', b: 'd', thicknessM: 0.2, heightM: 3, openings: [] },
    { id: 'da', a: 'd', b: 'a', thicknessM: 0.2, heightM: 3, openings: [] },
  ],
  roomLabels: [],
}

describe('wallFrame / roomInnerPolygon / nearestWall / roomAt', () => {
  test('wallFrame', () => {
    const f = wallFrame(rect.walls[1], rect.vertices)
    expect(f.origin).toEqual({ x: 4, y: 0 })
    expect(f.dir).toEqual({ x: 0, y: 1 })
    expect(f.normal).toEqual({ x: -1, y: 0 })
    expect(f.lengthM).toBe(3)
  })
  test('roomInnerPolygon of 4×3 with 0.2 walls is 3.8×2.8', () => {
    const [room] = deriveRooms(rect)
    const inner = roomInnerPolygon(room, rect)
    expect(Math.abs(signedArea(inner))).toBeCloseTo(3.8 * 2.8, 9)
    for (const p of inner) {
      expect(Math.min(Math.abs(p.x - 0.1), Math.abs(p.x - 3.9))).toBeLessThan(1e-9)
      expect(Math.min(Math.abs(p.y - 0.1), Math.abs(p.y - 2.9))).toBeLessThan(1e-9)
    }
  })
  test('roomInnerPolygon on an L-shape keeps the inner corner', () => {
    const g: Graph = {
      vertices: lShape.map((p, i) => ({ id: `v${i}`, ...p })),
      walls: lShape.map((_, i) => ({
        id: `w${i}`,
        a: `v${i}`,
        b: `v${(i + 1) % 6}`,
        thicknessM: 0.2,
        heightM: 3,
        openings: [],
      })),
      roomLabels: [],
    }
    const [room] = deriveRooms(g)
    const inner = roomInnerPolygon(room, g)
    expect(inner).toHaveLength(6)
    expect(inner).toContainEqual({ x: 2.9, y: 2.9 }) // reflex corner moves outward (into the notch)
    expect(Math.abs(signedArea(inner))).toBeCloseTo(5.8 * 5.8 - 3 * 3, 9)
  })
  test('nearestWall', () => {
    const r = nearestWall(P(2, 0.3), rect)!
    expect(r.wall.id).toBe('ab')
    expect(r.t).toBeCloseTo(0.5)
    expect(r.distanceM).toBeCloseTo(0.3)
    expect(nearestWall(P(9, 1), rect)!.wall.id).toBe('bc')
    expect(nearestWall(P(0, 0), { vertices: [], walls: [] })).toBeNull()
  })
  test('roomAt', () => {
    const rooms = deriveRooms(rect)
    expect(roomAt(P(1, 1), rooms, rect)).toBe(rooms[0])
    expect(roomAt(P(9, 9), rooms, rect)).toBeNull()
  })
})
