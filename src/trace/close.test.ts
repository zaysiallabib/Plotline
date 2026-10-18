import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Vertex, Wall } from '../core'
import { closeRooms, insertPiece, joinLeftovers, type CloseLabel, type CloseOpts } from './close'
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
  test('one thin line across a living room\'s open side is no railing: a zone line (open plan), pinned by its printed size', () => {
    const r = close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Living', kind: 'living', dims: SIZE }], sheet([1]))
    expect(r.closed[0].pieces.map((p) => [p.kind, p.heightM])).toEqual([['zone', 0]])
  })
  test("s27: one thin line on a wall's own line, from its loose end to the wall ahead: a window in that wall (glass), the bedroom closes", () => {
    // the top wall stops at x 2.5; a single pen line carries its line on to the east wall (a window drawn as one line)
    const g = { vertices: [...threeWalls().vertices, v('e', 2.5, 1)], walls: [...threeWalls().walls, w('T', 'a', 'e')] }
    const r = close(g, [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: SIZE }], sheet([1], 2.5, 5))
    expect(r.closed.map((c) => c.pieces.map((p) => p.kind))).toEqual([['glass']])
    expect(r.room({ x: 3, y: 2.5 })).toBeTruthy()
  })
  test('a bedroom is never closed by a zone line (nothing drawn there): it stays open', () => {
    expect(close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: SIZE }], sheet([1])).closed).toEqual([])
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
    // a toilet and a kitchen side by side sharing a wall; the toilet is closed, the kitchen's top is open: the pieces
    // that close the kitchen never cut the toilet
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 3.5), v('c', 3, 3.5), v('d', 3, 1), v('e', 5, 3.5), v('f', 5, 1)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('M', 'c', 'd'), w('T', 'd', 'a'), w('B2', 'c', 'e'), w('R2', 'e', 'f')],
    }
    const r = close(g, [{ at: { x: 2, y: 2.2 }, name: 'Toilet 1', kind: 'bath' }, { at: { x: 4, y: 2.2 }, name: 'Kitchen', kind: 'kitchen', dims: { aM: 1.87, bM: 2.44 } }], sheet([]))
    expect(r.room({ x: 2, y: 2.2 })?.areaSqm).toBeCloseTo(5, 1)
    expect(r.closed.map((c) => c.room)).toEqual(['Kitchen'])
    expect(r.room({ x: 4, y: 2.2 })?.areaSqm).toBeCloseTo(5, 0)
  })
  test('a size the reader only guessed pins the room where the room closed matches it — else no zone line', () => {
    const living = (guess: { aM: number; bM: number }) => close(threeWalls(), [{ at: { x: 3, y: 2.5 }, name: 'Living', kind: 'living', guess }], sheet([1]))
    const r = living(SIZE)
    expect(r.closed.map((c) => [c.size, c.pieces.map((p) => p.kind)])).toEqual([['guess', ['zone']]])
    expect(closeMessage(r.closed[0])).toMatch(/as far as the size could be read \(check it\)/)
    expect(living({ aM: 2.5, bM: 2.5 }).closed).toEqual([])
  })
  test('a veranda drawn in thin lines against one wall: low walls (its railing) where its printed size puts its three sides', () => {
    // a room above (1 … 5 × 0.2 … 1); below its wall a railing box 2 … 4.5 × 1 … 2.3, one 1 px line on each side
    const g = {
      vertices: [v('a', 1, 0.2), v('b', 1, 1), v('c', 5, 1), v('d', 5, 0.2)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('R', 'c', 'd'), w('T', 'd', 'a')],
    }
    const gray = sheet([2.3], 2, 4.5)
    for (const x of [2, 4.5]) for (let y = Math.round(1 * K); y <= Math.round(2.3 * K); y++) gray.data[y * gray.width + Math.round(x * K)] = 0
    const r = close(g, [{ at: { x: 3.25, y: 1.65 }, name: 'Ver', kind: 'balcony', dims: { aM: 2.5, bM: 1.24 } }], gray)
    expect(r.closed.map((c) => [c.room, c.size, c.pieces.map((p) => [p.kind, p.heightM])])).toEqual([['Ver', 'match', [['low', 1.1], ['low', 1.1], ['low', 1.1]]]])
    expect(r.room({ x: 3.25, y: 1.65 })?.areaSqm).toBeCloseTo(2.5 * 1.3, 0)
    // (nothing drawn there: no box)
    expect(close(g, [{ at: { x: 3.25, y: 1.65 }, name: 'Ver', kind: 'balcony', dims: { aM: 2.5, bM: 1.24 } }], sheet([])).closed).toEqual([])
  })
  test('a wall stopping 0.3 m short of the corner it meets (a column there, not traced): carried on to it, the room closes at its print', () => {
    // the top wall stops 0.3 m before the east wall's line, the east wall 0.3 m below the top wall's: neither meets the other
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 4), v('c', 5, 4), v('d', 5, 1.3), v('e', 4.7, 1)],
      walls: [w('L', 'a', 'b'), w('B', 'b', 'c'), w('R', 'c', 'd'), w('T', 'a', 'e')],
    }
    const r = close(g, [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed', dims: SIZE }], sheet([]))
    expect(r.closed.map((c) => [c.room, c.size, c.pieces.map((p) => p.kind)])).toEqual([['Bed 2', 'match', ['wall']]])
    expect(r.room({ x: 3, y: 2.5 })?.areaSqm).toBeCloseTo(12, 0)
  })
  test('a piece whose jog onto a wall\'s end would end inside another wall\'s window, a hair off: it runs straight onto the end', () => {
    // a corner at (5, 1): a wall going east, and one going south with a window from its top; the piece comes in at y = 1.05
    const vs = [v('p', 0, 1.05), v('q', 2, 1.05), v('k', 5, 1), v('s', 5, 4), v('t', 8, 1)]
    const ws = [w('P', 'p', 'q'), { ...w('S', 'k', 's'), openings: [{ id: 'o', kind: 'window' as const, offsetM: 0.02, widthM: 1.5, heightM: 2.7, sillM: 0 }] }, w('E', 'k', 't')]
    const r = insertPiece(vs, ws, { a: { x: 2, y: 1.05 }, b: { x: 5, y: 1 }, via: { x: 5, y: 1.05 }, kind: 'door', thM: 0.127, heightM: 3.048 }, make)
    expect(r).not.toBeNull()
    const nw = r!.walls.find((x) => x.id === r!.id)!
    expect([nw.a, nw.b]).toEqual(['q', 'k'])
    expect(r!.walls.find((x) => x.id === 'S')!.openings).toHaveLength(1)
  })
  test('DINING whose print the space closed matches, with FAMILY LIVING still in it: a second line between them, DINING at its print', () => {
    // an L of open floor: DINING 1 … 4 × 1 … 6, FAMILY LIVING beside its lower end (4 … 6 × 4 … 6) under a toilet block;
    // the bottom is open down to a wall at y = 8
    const g = {
      vertices: [v('a', 1, 1), v('b', 4, 1), v('c', 4, 4), v('d', 6, 4), v('e', 6, 6), v('f', 1, 6), v('g', 0, 8), v('h', 7, 8)],
      walls: [w('T', 'a', 'b'), w('M', 'b', 'c'), w('K', 'c', 'd'), w('R', 'd', 'e'), w('L', 'a', 'f'), w('F', 'g', 'h')],
    }
    const labels: CloseLabel[] = [
      { at: { x: 2.5, y: 3.5 }, name: 'Dining', kind: 'dining', dims: { aM: 2.87, bM: 4.87 } },
      { at: { x: 5, y: 5 }, name: 'Family Living', kind: 'living' },
    ]
    const r = close(g, labels, sheet([]))
    expect(r.closed.map((c) => [c.room, c.size, c.pieces.map((p) => p.kind)])).toEqual([['Dining', 'match', ['zone', 'zone']]])
    const dining = r.room({ x: 2.5, y: 3.5 })!, family = r.room({ x: 5, y: 5 })!
    expect(dining.areaSqm).toBeCloseTo(15, 0)
    expect(family.id).not.toBe(dining.id)
  })
  test('one Check-these row per closed room: what was drawn, why it was kept, the question', () => {
    const p = (kind: 'door' | 'glass' | 'zone', L: number) => ({ a: { x: 0, y: 0 }, b: { x: L, y: 0 }, kind, thM: 0.1, heightM: 3 })
    expect(closeMessage({ room: 'Dining', size: 'match', pieces: [p('glass', 1.83)] })).toBe(`Drew a glass wall 6'-0" along the window line drawn there to close Dining — it then matches its printed size. Right?`)
    expect(closeMessage({ room: 'Toilet 2', size: 'none', pieces: [p('door', 0.76)] })).toMatch(/^Drew a 2'-6" door in the gap .* to close Toilet 2 — no printed size was read to check it\. A door, or open\?$/)
    expect(closeMessage({ room: 'Living', size: 'near', pieces: [p('door', 0.9), p('zone', 3)] })).toMatch(/door in the gap .* and a zone line .* within 30 cm .*Select a line to make it a wall/)
  })
})

describe('close.ts joinLeftovers: a small nameless space cut off a room that only matches its print with it is part of it', () => {
  // a 2 × 3 m bath (inner 1.87 × 2.87) split at y = 2 by a line (a shower curtain traced as a wall): the name in the 2 m part
  const bath = (openings: Wall['openings'] = []) => ({
    vertices: [v('a', 1, 1), v('b', 1, 4), v('c', 3, 4), v('d', 3, 1), v('e', 1, 2), v('f', 3, 2)],
    walls: [w('L1', 'a', 'e'), w('L2', 'e', 'b'), w('B', 'b', 'c'), w('R2', 'c', 'f'), w('R1', 'f', 'd'), w('T', 'd', 'a'), { ...w('S', 'e', 'f'), openings }],
  })
  const at = { x: 2, y: 3 }
  test('joined when the print is the whole bath', () => {
    const r = joinLeftovers(bath().vertices, bath().walls, [{ at, name: 'Bath 3', kind: 'bath', dims: { aM: 1.87, bM: 2.87 } }], opts(sheet([])))
    expect(r.joined.map((j) => j.room)).toEqual(['Bath 3'])
    expect(r.walls.map((x) => x.id)).not.toContain('S')
  })
  test('a stray line that cuts the name off in a strip of its own: the room behind it (no name, bigger) is the rest of it', () => {
    // a 4 × 4 m bed (inner 3.87 × 3.87) cut at y = 3.6 by a line (a tile line read as a low wall): its name in the 1.4 m strip
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 5), v('c', 5, 5), v('d', 5, 1), v('e', 1, 3.6), v('f', 5, 3.6)],
      walls: [w('L1', 'a', 'e'), w('L2', 'e', 'b'), w('B', 'b', 'c'), w('R2', 'c', 'f'), w('R1', 'f', 'd'), w('T', 'd', 'a'), { ...w('S', 'e', 'f'), heightM: 1.1 }],
    }
    const r = joinLeftovers(g.vertices, g.walls, [{ at: { x: 3, y: 4.3 }, name: 'Bed', kind: 'bed', dims: { aM: 3.87, bM: 3.87 } }], opts(sheet([])))
    expect(r.joined.map((j) => j.room)).toEqual(['Bed'])
    expect(r.walls.map((x) => x.id)).not.toContain('S')
  })
  test('no size read: a LOW wall across a bedroom (a tile line, a rug edge) goes — a full wall stays', () => {
    const g = (heightM: number) => ({
      vertices: [v('a', 1, 1), v('b', 1, 5), v('c', 5, 5), v('d', 5, 1), v('e', 1, 3.6), v('f', 5, 3.6)],
      walls: [w('L1', 'a', 'e'), w('L2', 'e', 'b'), w('B', 'b', 'c'), w('R2', 'c', 'f'), w('R1', 'f', 'd'), w('T', 'd', 'a'), { ...w('S', 'e', 'f'), heightM }],
    })
    const join = (heightM: number, kind = 'bed') => joinLeftovers(g(heightM).vertices, g(heightM).walls, [{ at: { x: 3, y: 4.3 }, name: 'Bed', kind }], opts(sheet([]))).joined
    expect(join(1.1).map((j) => j.room)).toEqual(['Bed'])
    expect(join(3.048)).toEqual([])
    expect(join(1.1, 'balcony')).toEqual([])
  })
  test('left alone when the bath matches its print without it, or a door stands between them', () => {
    expect(joinLeftovers(bath().vertices, bath().walls, [{ at, name: 'Bath 3', kind: 'bath', dims: { aM: 1.87, bM: 1.9 } }], opts(sheet([]))).joined).toEqual([])
    const g = bath([{ id: 'o', kind: 'door', offsetM: 0.5, widthM: 0.8, heightM: 2.1, sillM: 0 }])
    expect(joinLeftovers(g.vertices, g.walls, [{ at, name: 'Bath 3', kind: 'bath', dims: { aM: 1.87, bM: 2.87 } }], opts(sheet([]))).joined).toEqual([])
  })
})

describe('s27 clean 90: a veranda drawn in thin lines against the building, found from its name', () => {
  test('no size read: its three railing lines close it, each a low wall; the window behind it is split where they meet it', () => {
    // a closed 4 × 3 m bedroom; its south wall holds a window from x 1.5 to 4.5; below it a veranda drawn as three pen
    // lines (x 2 and x 4 from the wall down to y 5.2, and y 5.2 between them); VER printed in it, no size read
    const win = { id: 'win', kind: 'window' as const, offsetM: 0.5, widthM: 3, heightM: 1.5, sillM: 0.9 }
    const g = {
      vertices: [v('a', 1, 1), v('b', 1, 4), v('c', 5, 4), v('d', 5, 1)],
      walls: [w('L', 'a', 'b'), { ...w('B', 'b', 'c'), openings: [win] }, w('R', 'c', 'd'), w('T', 'd', 'a')],
    }
    const W = 12 * K, H = 6 * K, data = new Uint8Array(W * H).fill(255)
    for (let y = 4 * K; y <= 5.2 * K; y++) data[y * W + 2 * K] = data[y * W + 4 * K] = 0
    for (let x = 2 * K; x <= 4 * K; x++) data[Math.round(5.2 * K) * W + x] = 0
    const r = close(g, [{ at: { x: 3, y: 2.5 }, name: 'Bed 2', kind: 'bed' }, { at: { x: 3, y: 4.6 }, name: 'Ver', kind: 'balcony' }], { width: W, height: H, data })
    expect(r.closed.map((c) => [c.room, c.size, c.pieces.map((p) => p.kind)])).toEqual([['Ver', 'none', ['low', 'low', 'low']]])
    expect(r.room({ x: 3, y: 4.6 })?.areaSqm).toBeCloseTo(2.4, 1)
    expect(r.room({ x: 3, y: 2.5 })?.areaSqm).toBeCloseTo(12, 1)
    expect(r.walls.flatMap((x) => x.openings.filter((o) => o.kind === 'window').map((o) => o.widthM)).sort()).toEqual([0.5, 0.5, 2].map((x) => expect.closeTo(x, 1)))
  })
})
