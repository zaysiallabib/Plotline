import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Vertex, Wall } from '../core'
import { closeRooms, type CloseLabel, type CloseOpts } from './close'
import { closeMessage } from './solve'
import type { Gray } from './types'

// A 4 × 3 m room (inner faces 1.06 … 4.94 × 1.0 … 3.94 m) drawn with three walls on a 50 px/m sheet; its top side open.
const K = 50
const v = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const w = (id: string, a: string, b: string, thicknessM = 0.127): Wall => ({ id, a, b, thicknessM, heightM: 3.048, openings: [] })
const sheet = (lines: number[], x0 = 1, x1 = 5): Gray => {
  const W = 12 * K, H = 6 * K, data = new Uint8Array(W * H).fill(255)
  // thin pen lines along y (m), 1 px wide, from x0 to x1
  for (const y of lines) for (let x = Math.round(x0 * K); x <= Math.round(x1 * K); x++) data[Math.round(y * K) * W + x] = 0
  return { width: W, height: H, data }
}
const opts = (gray: Gray): CloseOpts => ({ gray, k: K, th0: 0, maxSqm: 90, tolM: 0.15, rejectM: 0.3, wallHeightM: 3.048 })
const threeWalls = () => ({
  vertices: [v('a', 1, 1), v('b', 1, 4), v('c', 5, 4), v('d', 5, 1)],
  walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('R', 'c', 'd')],
})
const make = (base: Wall) => base
/** the room the name stands in after closing, and the pieces drawn */
const close = (g: { vertices: Vertex[]; walls: Wall[] }, labels: CloseLabel[], gray: Gray) => {
  const r = closeRooms(g.vertices, g.walls, labels, opts(gray), make)
  const unit = { vertices: r.vertices, walls: r.walls, roomLabels: [] }
  const room = (at: { x: number; y: number }) => deriveRooms(unit).find((x) => x.areaSqm < 90 && pointInPolygon(at, roomPolygon(x, unit)))
  return { ...r, room }
}
const SIZE = { aM: 3.87, bM: 2.94 }

describe('close.ts: open printed rooms closed on evidence, kept only at their printed size', () => {
  test('two thin parallel lines across the open side: a glass wall (full-height glazing), the room at its printed size', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: SIZE }], sheet([0.96, 1.04]))
    expect(r.closed).toHaveLength(1)
    expect(r.closed[0]).toMatchObject({ room: 'Bed 2', size: 'match' })
    expect(r.closed[0].pieces.map((p) => p.kind)).toEqual(['glass'])
    const glass = r.walls.find((x) => x.openings.some((o) => o.kind === 'window'))!
    expect(glass.openings[0].widthM).toBeCloseTo(4, 2)
    expect(r.room({ x: 3, y: 2.5 })?.areaSqm).toBeCloseTo(12, 0)
  })
  test('one thin line across a veranda\'s open side: a low wall (railing)', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Ver', kind: 'balcony', dims: SIZE }], sheet([1]))
    expect(r.closed[0].pieces.map((p) => [p.kind, p.heightM])).toEqual([['low', 1.1]])
    expect(r.room({ x: 3, y: 2.5 })).toBeTruthy()
  })
  test('one thin line across a bedroom\'s side is no railing: a zone line, pinned by its printed size', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: SIZE }], sheet([1]))
    expect(r.closed[0].pieces.map((p) => [p.kind, p.heightM])).toEqual([['zone', 0]])
  })
  test('nothing drawn and no printed size read: no zone line — the room stays open', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed' }], sheet([]))
    expect(r.closed).toEqual([])
    expect(r.room({ x: 3, y: 2.5 })).toBeUndefined()
  })
  test('a printed size the closed room does not match: nothing drawn, the room stays open', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: { aM: 3.87, bM: 3.6 } }], sheet([0.96, 1.04]))
    expect(r.closed).toEqual([])
    expect(r.walls).toHaveLength(3)
  })
  test('DINING beside LIVING in one room: a zone line where the printed size puts its side — two rooms, never one', () => {
    // an 8 × 3 m box (inner 1.06 … 8.94), LIVING on the west, DINING 3.87 m wide on the east
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 4), v('c', 9, 4), v('d', 9, 1)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('R', 'c', 'd'), w('T', 'd', 'a')],
    }
    const r = close(g, [{ at: { x: 3, y: 2.5 }, name: 'Living', kind: 'living' }, { at: { x: 7, y: 2.5 }, name: 'Dining', kind: 'dining', dims: SIZE }], sheet([]))
    expect(r.closed.map((c) => [c.room, c.pieces.map((p) => p.kind)])).toEqual([['Dining', ['zone']]])
    const dining = r.room({ x: 7, y: 2.5 })!, living = r.room({ x: 3, y: 2.5 })!
    expect(dining.id).not.toBe(living.id)
    // (its printed width within 0.15 m: the side halfway between the names or where the size puts it)
    expect(dining.areaSqm).toBeGreaterThan(11.3)
    expect(dining.areaSqm).toBeLessThan(12.1)
  })
  test('a wall line broken by a 0.8 m gap with nothing drawn: a door in the gap (never a solid wall), the toilet closes', () => {
    // a 2 × 2.5 m toilet: its top wall stops 0.8 m short of the east wall
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 3.5), v('c', 3, 3.5), v('d', 3, 1), v('e', 2.2, 1)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('R', 'c', 'd'), w('T', 'a', 'e')],
    }
    const r = close(g, [{ at: { x: 2, y: 2.2 }, name: 'Toilet', kind: 'bath' }], sheet([]))
    expect(r.closed[0]).toMatchObject({ room: 'Toilet', size: 'none' })
    expect(r.closed[0].pieces.map((p) => p.kind)).toEqual(['door'])
    const door = r.walls.find((x) => x.openings.length)!
    expect(door.openings[0]).toMatchObject({ kind: 'door' })
    expect(door.openings[0].widthM).toBeCloseTo(0.8, 2)
    expect(r.room({ x: 2, y: 2.2 })?.areaSqm).toBeCloseTo(5, 0)
  })
  test('a room closed around one name before stays that room', () => {
    // two toilets side by side sharing the east wall; the west one is closed, the east one's top is open: the pieces
    // that close the east one never cut the west one
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 3.5), v('c', 3, 3.5), v('d', 3, 1), v('e', 5, 3.5), v('f', 5, 1)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('M', 'c', 'd'), w('T', 'd', 'a'), w('B2', 'c', 'e'), w('R2', 'e', 'f')],
    }
    const r = close(g, [{ at: { x: 2, y: 2.2 }, name: 'Toilet 1', kind: 'bath' }, { at: { x: 4, y: 2.2 }, name: 'Toilet 2', kind: 'bath', dims: { aM: 1.87, bM: 2.44 } }], sheet([]))
    expect(r.room({ x: 2, y: 2.2 })?.areaSqm).toBeCloseTo(5, 1)
    expect(r.closed.map((c) => c.room)).toEqual(['Toilet 2'])
    expect(r.room({ x: 4, y: 2.2 })?.areaSqm).toBeCloseTo(5, 0)
  })
  test('one Check-these row per closed room: what was drawn, why it was kept, the question', () => {
    const p = (kind: 'door' | 'glass' | 'zone', L: number) => ({ a: { x: 0, y: 0 }, b: { x: L, y: 0 }, kind, thM: 0.1, heightM: 3 })
    expect(closeMessage({ room: 'Dining', size: 'match', pieces: [p('glass', 1.83)] })).toBe(`Drew a glass wall 6'-0" along the double line to close Dining — it then matches its printed size. Right?`)
    expect(closeMessage({ room: 'Toilet 2', size: 'none', pieces: [p('door', 0.76)] })).toMatch(/^Drew a 2'-6" door in the gap .* to close Toilet 2 — no printed size was read to check it\. A door, or open\?$/)
    expect(closeMessage({ room: 'Living', size: 'near', pieces: [p('door', 0.9), p('zone', 3)] })).toMatch(/door in the gap .* and a zone line .* within 30 cm .*Select a line to make it a wall/)
  })
})
