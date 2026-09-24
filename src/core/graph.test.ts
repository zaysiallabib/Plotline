import { describe, expect, test } from 'vitest'
import {
  deriveRooms,
  roomPolygon,
  signedArea,
  validate,
  type Graph,
  type Opening,
  type RoomLabel,
  type Unit,
  type Wall,
} from './index'

/** Build a graph from "id: x y" vertices and "a-b" walls. */
function graph(verts: Record<string, [number, number]>, wallSpecs: string[], roomLabels: RoomLabel[] = []): Graph {
  return {
    vertices: Object.entries(verts).map(([id, [x, y]]) => ({ id, x, y })),
    walls: wallSpecs.map((s) => {
      const [a, b] = s.split('-')
      return { id: s, a, b, thicknessM: 0.125, heightM: 3, openings: [] }
    }),
    roomLabels,
  }
}
const label = (id: string, x: number, y: number, kind: RoomLabel['kind'] = 'bed'): RoomLabel => ({
  id,
  name: id,
  kind,
  x,
  y,
})
const unit = (g: Graph): Unit => ({
  id: 'u',
  projectName: 'p',
  name: 'n',
  northDeg: 0,
  furniture: [],
  finishSlots: [],
  areaSqft: 0,
  ...g,
})
const rect = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3] }, ['a-b', 'b-c', 'c-d', 'd-a'])

/** Two 4×3 rooms side by side sharing wall b-e: 6 vertices, 7 walls. */
const twoRooms = graph(
  { a: [0, 0], b: [4, 0], c: [8, 0], d: [8, 3], e: [4, 3], f: [0, 3] },
  ['a-b', 'b-c', 'c-d', 'd-e', 'e-f', 'f-a', 'b-e'],
  [label('left', 2, 1.5), label('right', 6, 1.5, 'living')],
)

function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('deriveRooms', () => {
  test('single rectangle → 1 room, positive loop, outer face excluded', () => {
    const rooms = deriveRooms(rect)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaSqm).toBeCloseTo(12)
    expect(signedArea(roomPolygon(rooms[0], rect))).toBeGreaterThan(0)
    expect(rooms[0].centroid).toEqual({ x: 2, y: 1.5 })
    expect(rooms[0].wallIds.sort()).toEqual(['a-b', 'b-c', 'c-d', 'd-a'])
    expect(rooms[0].name).toBe('Space 1')
    expect(rooms[0].kind).toBe('other')
  })

  test('two rectangles sharing one wall → 2 rooms, shared wall in both', () => {
    const rooms = deriveRooms(twoRooms)
    expect(rooms.map((r) => r.id).sort()).toEqual(['left', 'right'])
    for (const r of rooms) {
      expect(r.areaSqm).toBeCloseTo(12)
      expect(r.wallIds).toContain('b-e')
      expect(r.wallIds).toHaveLength(4)
      expect(signedArea(roomPolygon(r, twoRooms))).toBeGreaterThan(0)
    }
    expect(rooms.find((r) => r.id === 'right')!.kind).toBe('living')
  })

  test('L-shaped apartment: 3 rooms incl. a 45° chamfer', () => {
    // 8×6 outer L with the bottom-right corner chamfered at 45°;
    // wall e-i splits off the right room, wall f-k splits off the upper room.
    const g2 = graph(
      { a: [0, 0], b: [4, 0], c: [8, 0], d: [8, 2], e: [7, 3], f: [4, 3], h: [4, 6], k: [0, 6], j: [0, 3] },
      ['a-b', 'b-c', 'c-d', 'd-e', 'e-f', 'f-h', 'h-k', 'k-j', 'j-a', 'b-f', 'f-j'],
      [label('bed', 2, 1.5), label('living', 6, 1.5, 'living'), label('study', 2, 4.5, 'study')],
    )
    const rooms = deriveRooms(g2)
    expect(rooms.map((r) => r.id).sort()).toEqual(['bed', 'living', 'study'])
    const living = rooms.find((r) => r.id === 'living')!
    expect(living.areaSqm).toBeCloseTo(12 - 0.5) // 4×3 minus the chamfer triangle
    expect(living.loop).toHaveLength(5)
    expect(rooms.find((r) => r.id === 'bed')!.areaSqm).toBeCloseTo(12)
    expect(rooms.find((r) => r.id === 'study')!.areaSqm).toBeCloseTo(12)
    for (const r of rooms) expect(signedArea(roomPolygon(r, g2))).toBeGreaterThan(0)
  })

  test('dangling stub inside a room → still 1 room, stub not in loop', () => {
    const g = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3], s: [2, 1.5] }, ['a-b', 'b-c', 'c-d', 'd-a', 'a-s'])
    const rooms = deriveRooms(g)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaSqm).toBeCloseTo(12)
    expect(rooms[0].loop).toHaveLength(4)
    expect(rooms[0].wallIds).not.toContain('a-s')
    // a two-wall chain stub too
    const g2 = graph(
      { a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3], s: [2, 1.5], t: [2, 2.5] },
      ['a-b', 'b-c', 'c-d', 'd-a', 'a-s', 's-t'],
    )
    expect(deriveRooms(g2)).toHaveLength(1)
    // and a lone stub touching nothing
    const g3 = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3], s: [1, 1], t: [2, 2] }, ['a-b', 'b-c', 'c-d', 'd-a', 's-t'])
    expect(deriveRooms(g3)).toHaveLength(1)
  })

  test('label assignment + unlabelled naming, stable ids', () => {
    const g: Graph = { ...twoRooms, roomLabels: [label('left', 2, 1.5)] }
    const rooms = deriveRooms(g)
    const left = rooms.find((r) => r.id === 'left')!
    expect(left.name).toBe('left')
    const other = rooms.find((r) => r.id !== 'left')!
    expect(other.name).toBe('Space 1')
    expect(other.id).toMatch(/^space-/)
    expect(deriveRooms(g).find((r) => r.id !== 'left')!.id).toBe(other.id)
    // label outside every face → no room takes it
    expect(deriveRooms({ ...twoRooms, roomLabels: [label('x', 20, 20)] }).every((r) => r.id !== 'x')).toBe(true)
    // nested: smallest containing face wins
    const nested = graph(
      { a: [0, 0], b: [6, 0], c: [6, 6], d: [0, 6], p: [2, 2], q: [3, 2], r: [3, 3], s: [2, 3] },
      ['a-b', 'b-c', 'c-d', 'd-a', 'p-q', 'q-r', 'r-s', 's-p'],
      [label('shaft', 2.5, 2.5, 'shaft'), label('living', 1, 1, 'living')],
    )
    const nr = deriveRooms(nested)
    expect(nr.find((r) => r.id === 'shaft')!.areaSqm).toBeCloseTo(1)
    expect(nr.find((r) => r.id === 'living')!.areaSqm).toBeCloseTo(36)
  })

  test('result independent of vertex/wall input order and of wall direction', () => {
    const base = deriveRooms(twoRooms)
    for (let seed = 1; seed < 8; seed++) {
      const g: Graph = {
        vertices: shuffled(twoRooms.vertices, seed),
        walls: shuffled(twoRooms.walls, seed * 7).map((w, i) => (i % 2 ? { ...w, a: w.b, b: w.a } : w)),
        roomLabels: twoRooms.roomLabels,
      }
      expect(deriveRooms(g)).toEqual(base)
    }
  })
})

describe('validate', () => {
  const codes = (u: Unit) => validate(u).map((i) => `${i.level}:${i.code}`)

  test('clean unit → no issues', () => {
    expect(validate(unit(twoRooms))).toEqual([])
  })
  test('dangling-vertex: degree 0 error, degree 1 warning', () => {
    const g = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3], lone: [9, 9], s: [2, 1] }, ['a-b', 'b-c', 'c-d', 'd-a', 'a-s'])
    const issues = validate(unit({ ...g, roomLabels: [label('r', 1, 2)] }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'error', code: 'dangling-vertex', ids: ['lone'] }))
    expect(issues).toContainEqual(expect.objectContaining({ level: 'warning', code: 'dangling-vertex', ids: ['s'] }))
  })
  test('zero-length-wall (incl. missing vertex)', () => {
    const g = graph({ a: [0, 0], b: [0, 0] }, ['a-b', 'a-a'])
    g.walls.push({ id: 'ghost', a: 'a', b: 'zz', thicknessM: 0.1, heightM: 3, openings: [] })
    expect(codes(unit(g)).filter((c) => c === 'error:zero-length-wall')).toHaveLength(3)
  })
  test('duplicate-wall', () => {
    const g = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3] }, ['a-b', 'b-c', 'c-d', 'd-a', 'b-a'])
    expect(codes(unit({ ...g, roomLabels: [label('r', 1, 1)] }))).toEqual(['error:duplicate-wall'])
    expect(deriveRooms(g)).toHaveLength(1)
  })
  test('opening-out-of-bounds and openings-overlap', () => {
    const o = (id: string, offsetM: number, widthM: number): Opening => ({ id, kind: 'door', offsetM, widthM, heightM: 2, sillM: 0 })
    const g = graph({ a: [0, 0], b: [4, 0], c: [4, 3], d: [0, 3] }, ['a-b', 'b-c', 'c-d', 'd-a'], [label('r', 1, 1)])
    const w: Wall = g.walls[0]
    w.openings = [o('neg', -0.1, 1), o('far', 3.5, 1), o('p', 1, 1), o('q', 1.5, 1)]
    const issues = validate(unit(g))
    expect(issues.filter((i) => i.code === 'opening-out-of-bounds').map((i) => i.ids[1]).sort()).toEqual(['far', 'neg'])
    expect(issues.filter((i) => i.code === 'openings-overlap').map((i) => i.ids.slice(1).sort())).toEqual([['p', 'q']])
    // exactly fitting is fine
    w.openings = [o('fit', 0, 4)]
    expect(validate(unit(g))).toEqual([])
  })
  test('unlabelled-room warning, tiny faces ignored', () => {
    expect(codes(unit(rect))).toEqual(['warning:unlabelled-room'])
    const tiny = graph({ a: [0, 0], b: [0.5, 0], c: [0.5, 0.5], d: [0, 0.5] }, ['a-b', 'b-c', 'c-d', 'd-a'])
    expect(codes(unit(tiny))).toEqual([])
  })
  test('label-outside-any-room (outside, and second label in same face)', () => {
    const g: Graph = { ...rect, roomLabels: [label('in', 1, 1), label('out', 9, 9), label('dup', 2, 2)] }
    const issues = validate(unit(g)).filter((i) => i.code === 'label-outside-any-room')
    expect(issues.map((i) => i.ids[0]).sort()).toEqual(['dup', 'out'])
  })
  test('walls-intersect: crossing, T-junction, collinear overlap', () => {
    const crossing = graph({ a: [0, 0], b: [4, 4], c: [0, 4], d: [4, 0] }, ['a-b', 'c-d'])
    expect(codes(unit(crossing))).toContain('error:walls-intersect')
    const tee = graph({ a: [0, 0], b: [4, 0], c: [2, 3] }, ['a-b', 'c-b']) // fine: shares b
    expect(codes(unit(tee))).not.toContain('error:walls-intersect')
    const tee2 = graph({ a: [0, 0], b: [4, 0], c: [2, 3], m: [2, 0] }, ['a-b', 'c-m']) // m sits mid a-b
    expect(codes(unit(tee2))).toContain('error:walls-intersect')
    const overlap = graph({ a: [0, 0], b: [4, 0], c: [2, 0] }, ['a-b', 'a-c']) // a-c lies along a-b
    expect(codes(unit(overlap))).toContain('error:walls-intersect')
  })
})

// Optional: the unit JSON is drafted by another agent; skip until it exists.
const typeA = import.meta.glob<Unit>('../data/units/type-a.json', { eager: true, import: 'default' })[
  '../data/units/type-a.json'
]
test.skipIf(!typeA)('src/data/units/type-a.json validates and every label lands', () => {
  const u = typeA!
  const errors = validate(u).filter((i) => i.level === 'error')
  expect(errors).toEqual([])
  const rooms = deriveRooms(u)
  const ids = new Set(rooms.map((r) => r.id))
  for (const l of u.roomLabels) expect(ids.has(l.id), `label ${l.name} matched a face`).toBe(true)
})
