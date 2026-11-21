/** The towers' data (data/building/*-tower.ts): alignment offsets re-derived from the traced core, floor maps, towerOf; Studio projects (projects.ts). */
import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'
import { floorIn, towerOf, type Tower } from '../data/building'
import { frameOf, onFlat, plate, sharedWith } from './building'
import * as bti from '../data/building/demo-tower'
import { CORE, FLATS, FLOORS } from '../data/building/demo-tower'
import { alignColumns, flatBounds, levelOf, makeProject, parseProjects, placeFlat, placeLevel, placeOfLevel, placementOf, projectTower, removeFlat, removeLevel, sheetOffset, syncUnit } from '../data/building/projects'
import { baseLevel, coverOf, levelName, roleIn, stairTo, topFloor } from '../data/building'
import * as banani from '../data/building/banani-tower'
import * as dmd from '../data/building/dmd-tower'
import * as sheltech from '../data/building/sheltech-tower'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import { initialState, reducer } from '../studio/model'

const roomsOf = (u: Unit) => core.deriveRooms(u)

/** The lift-core anchor as the data module documents it: west face of the core rooms, lobby↔lifts wall line. */
function coreAnchor(u: Unit): Pt {
  const box = (name: string) => {
    const r = roomsOf(u).find((x) => x.name === name)
    if (!r) return null
    const p = core.roomPolygon(r, u)
    return { minX: Math.min(...p.map((q) => q.x)), minY: Math.min(...p.map((q) => q.y)), maxY: Math.max(...p.map((q) => q.y)) }
  }
  const [lobby, lifts, stair] = ['Lift lobby', 'Lift core', 'Stair'].map(box)
  return { x: Math.min(...[lobby, lifts, stair].flatMap((b) => (b ? [b.minX] : []))), y: lifts ? lifts.minY : lobby!.maxY }
}

describe('demo tower', () => {
  test('offsets put every trace’s lift core on Type B’s (within 1 cm)', () => {
    const b = coreAnchor(FLATS['type-b'].unit)
    for (const [stem, { unit, offset }] of Object.entries(FLATS)) {
      const a = coreAnchor(unit)
      expect(offset.x, stem).toBeCloseTo(b.x - a.x, 2)
      expect(offset.y, stem).toBeCloseTo(b.y - a.y, 2)
    }
  })

  test('aligned, Type A (2nd floor) and Type C (3rd) cover the same flat: bounds within 0.8 m', () => {
    const bounds = (stem: string) => {
      const { unit, offset } = FLATS[stem]
      const b = core.unitBounds(unit)
      return [b.minX + offset.x, b.maxX + offset.x, b.minY + offset.y, b.maxY + offset.y]
    }
    const [a, c] = [bounds('type-a'), bounds('type-c')]
    // A's east edge stops at its veranda (15.5 m); C's planter reaches 18.3 m: compare the other three sides
    for (const i of [0, 2, 3]) expect(Math.abs(a[i] - c[i])).toBeLessThan(0.8)
  })

  test('floor map: 2 = Type A, 3–8 = Type B + C; every flat sits on its own JSON floor; stems resolve', () => {
    expect(FLOORS.find((f) => f.floor === 2)!.flats).toEqual(['type-a'])
    for (let k = 3; k <= 8; k++) expect(FLOORS.find((f) => f.floor === k)!.flats).toEqual(['type-b', 'type-c'])
    for (const f of FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(FLATS[s], s).toBeDefined()
    for (const { unit } of Object.values(FLATS)) {
      expect(FLOORS.some((f) => f.floor === unit.floor && f.flats.some((s) => FLATS[s].unit.id === unit.id)), unit.name).toBe(true)
    }
  })

  test('the core rooms that run ground to roof exist in their traces', () => {
    for (const [stem, name] of CORE) expect(roomsOf(FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})

describe('Sheltech tower', () => {
  const T = sheltech

  test('towerOf: BTI for type-a/b/c, Sheltech for sheltech-a/b, null for a unit in no tower', () => {
    for (const { unit } of Object.values(FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(FLATS)
    for (const { unit } of Object.values(T.FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(T.FLATS)
    expect(towerOf({ ...FLATS['type-a'].unit, id: 'elsewhere' })).toBeNull()
  })

  test('A and B share the core walls (the lobby) within 1 cm after offsets', () => {
    /** a flat's walls around its Lobby, as segments in the building frame */
    const lobbyWalls = (stem: string) => {
      const { unit, offset } = T.FLATS[stem]
      const lobby = roomsOf(unit).find((r) => r.name === 'Lobby')!
      const vs = new Map(unit.vertices.map((v) => [v.id, { x: v.x + offset.x, y: v.y + offset.y }]))
      return lobby.wallIds.map((id) => unit.walls.find((w) => w.id === id)!).map((w) => [vs.get(w.a)!, vs.get(w.b)!] as const)
    }
    const dist = (p: Pt, [a, b]: readonly [Pt, Pt]) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)))
      return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y))
    }
    // every point along one flat's lobby walls lies on the other flat's lobby walls
    for (const [s, o] of [['sheltech-a', 'sheltech-b'], ['sheltech-b', 'sheltech-a']]) {
      const other = lobbyWalls(o)
      for (const [a, b] of lobbyWalls(s)) {
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const p = { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
          expect(Math.min(...other.map((seg) => dist(p, seg))), `${s} ${p.x},${p.y}`).toBeLessThan(0.01)
        }
      }
    }
  })

  test('floor map: 1 = the common level (lounge + gym), 2–6 = A + B, the hand-authored levels on theirs; flats and levels sit on their JSON floor; core rooms exist', () => {
    expect(T.FLOORS.map((f) => [f.floor, f.flats.length])).toEqual([[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 0]])
    expect(T.LEVELS).toEqual({ 'sheltech-b2': -2, 'sheltech-b1': -1, 'sheltech-ground': 0, 'sheltech-l1': 1, 'sheltech-roof': 7 })
    for (const f of T.FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(T.FLATS[s], s).toBeDefined()
    for (const [s, { unit }] of Object.entries(T.FLATS)) {
      if (T.LEVELS[s] !== undefined) expect(T.FLOORS.find((f) => f.floor === unit.floor)?.standIns, unit.name).toEqual([s])
      else expect(T.FLOORS.some((f) => f.floor === unit.floor && f.flats.some((x) => T.FLATS[x].unit.id === unit.id)), unit.name).toBe(true)
    }
    for (const [stem, name] of T.CORE) expect(roomsOf(T.FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})

describe('a building made in the Studio (projects.ts): floors of traced flats', () => {
  // the founder's draft as the Studio holds it (Import → Join walls)
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const xs = (x: Unit) => roomsOf(x).flatMap((r) => core.roomPolygon(r, x).map((p) => p.x))

  test('his draft on floors 2–7 with a mirrored neighbour: 6 floors × 2 flats, floor 1 stands in, the ground stands on his columns', () => {
    const t = projectTower(makeProject('p', u, 2, 7, 'left'))
    const m = `${u.id}-m`
    expect(Object.keys(t.FLATS).sort()).toEqual([u.id, m].sort())
    expect(t.FLOORS.map((f) => [f.floor, f.flats.length, f.standIns?.length ?? 0])).toEqual([[1, 0, 2], [2, 2, 0], [3, 2, 0], [4, 2, 0], [5, 2, 0], [6, 2, 0], [7, 2, 0]])
    expect(t.FLATS[u.id].unit).toBe(u)
    expect(t.GROUND.columns).toHaveLength(2 * (u.pillars ?? []).length)
    expect(t.GROUND.plot).toHaveLength(4)
    expect(t.FLOOR_M).toBe(bti.FLOOR_M)
    // the neighbour is the mirror image on the left: it ends on the flat's own west wall line, never inside it
    const mine = flatBounds(u)
    expect(Math.max(...xs(t.FLATS[m].unit))).toBeCloseTo(mine.minX, 6)
    expect(roomsOf(t.FLATS[m].unit).map((r) => r.areaSqm.toFixed(2)).sort()).toEqual(roomsOf(u).map((r) => r.areaSqm.toFixed(2)).sort())
    // right: the other side
    const r = projectTower(makeProject('p', u, 2, 7, 'right'))
    expect(Math.min(...xs(r.FLATS[m].unit))).toBeCloseTo(mine.maxX, 6)
  })

  test('towerOf / floorIn: the project for his draft (first, before a built-in tower), the floor it is listed on', () => {
    const t = projectTower(makeProject('p', u, 3, 8, 'none'))
    expect(towerOf(u, [t, bti, sheltech])).toBe(t)
    expect(towerOf(u, [bti, sheltech])).toBeNull()
    expect(floorIn(t, u.id, 5)).toBe(5)
    expect(floorIn(t, u.id, undefined)).toBe(3)
    expect(floorIn(t, u.id, 12)).toBe(3)
    // a hand-authored unit he built a building from: his building wins in his browser; without it the built-in one
    const sa = sheltech.FLATS['sheltech-a'].unit
    const his = projectTower(makeProject('q', sa, 2, 3, 'none'))
    expect(towerOf(sa, [his, bti, sheltech])).toBe(his)
    expect(towerOf(sa)).toBe(sheltech) // no stored projects here: the built-in tower, as before
    expect(floorIn(sheltech, 'sheltech-a', sa.floor)).toBe(sa.floor)
  })

  test('a flat with no column drawn: its shell stands in for the ground floor (no flat floats), beside a flat on its columns', () => {
    const t = projectTower(makeProject('p', FLATS['type-b'].unit, 2, 4, 'none'))
    expect(t.GROUND.columns).toEqual([])
    expect(t.FLOORS[0]).toEqual({ floor: 0, flats: [], standIns: [FLATS['type-b'].unit.id] })
    // his flat (9 columns) and Sheltech B (none) on one floor: his columns, B's shell
    const sb = sheltech.FLATS['sheltech-b'].unit
    const both = projectTower(placeFlat(makeProject('p', u, 2, 7, 'none'), sb, 2, 7, 'none'))
    expect(both.GROUND.columns).toHaveLength((u.pillars ?? []).length)
    expect(both.FLOORS[0]).toEqual({ floor: 0, flats: [], standIns: [sb.id] })
  })

  test('two traced flats off one drawing land where they were traced; editing a flat re-places it; taking it out', () => {
    const a = sheltech.FLATS['sheltech-a'].unit
    const pi = a.planImage!
    // type B traced off the same sheet with its metre origin 1 m right and 2 m down of A's
    const b = { ...sheltech.FLATS['sheltech-b'].unit, planImage: { ...pi, originPx: { x: pi.originPx.x + pi.pxPerM, y: pi.originPx.y + 2 * pi.pxPerM } } }
    let p = makeProject('p', a, 2, 6, 'none')
    const off = sheetOffset(p, b)
    expect(off.x).toBeCloseTo(1, 9)
    expect(off.y).toBeCloseTo(2, 9)
    expect(sheetOffset(p, { ...b, planImage: { ...b.planImage, src: 'another.jpg' } })).toEqual({ x: 0, y: 0 })
    // its own read of the scale 2 % off: its centre still lands on the same drawing pixel in A's metres; 6 % off: one is wrong
    const b2 = { ...b, planImage: { ...b.planImage, pxPerM: pi.pxPerM * 1.02 } }
    const o2 = sheetOffset(p, b2)
    const fb = flatBounds(b2)
    const c = { x: (fb.minX + fb.maxX) / 2, y: (fb.minY + fb.maxY) / 2 }
    expect(pi.originPx.x + (c.x + o2.x) * pi.pxPerM).toBeCloseTo(b2.planImage.originPx.x + c.x * b2.planImage.pxPerM, 6)
    expect(pi.originPx.y + (c.y + o2.y) * pi.pxPerM).toBeCloseTo(b2.planImage.originPx.y + c.y * b2.planImage.pxPerM, 6)
    expect(sheetOffset(p, { ...b, planImage: { ...b.planImage, pxPerM: pi.pxPerM * 1.06 } })).toEqual({ x: 0, y: 0 })
    p = placeFlat(p, b, 2, 6, 'none', off)
    expect(p.floors).toEqual([{ from: 2, to: 6, flats: [a.id, b.id] }])
    expect(projectTower(p).FLATS[b.id].offset).toEqual(off)
    // B again on floors 3–4 with a mirror: it leaves the 2–6 group, a new group holds it and its mirror
    p = placeFlat(p, b, 4, 3, 'right', off)
    expect(p.floors).toEqual([{ from: 2, to: 6, flats: [a.id] }, { from: 3, to: 4, flats: [b.id, `${b.id}-m`] }])
    expect(placementOf(p, b.id)).toEqual({ from: 3, to: 4, neighbour: 'right', offset: off })
    expect(projectTower(p).FLOORS.find((f) => f.floor === 3)!.flats).toEqual([a.id, b.id, `${b.id}-m`])
    expect(removeFlat(p, b.id)!.floors).toEqual([{ from: 2, to: 6, flats: [a.id] }])
    expect(removeFlat(removeFlat(p, b.id)!, a.id)).toBeNull()
  })

  test('the Studio autosave keeps the stored flat current; the mirror axis follows an edited outer wall; a corrupt store reads as none', () => {
    const p = makeProject('p', u, 2, 7, 'right')
    expect(syncUnit([p], u)).toBeNull()
    const east = flatBounds(u).maxX
    const moved = { ...u, vertices: u.vertices.map((v) => (Math.abs(v.x - east) < 1e-6 ? { ...v, x: v.x + 0.5 } : v)) }
    const [q] = syncUnit([p], moved)!
    expect(q.units[u.id]).toBe(moved)
    expect(Math.min(...xs(projectTower(q).FLATS[`${u.id}-m`].unit))).toBeCloseTo(east + 0.5, 6)
    expect(parseProjects('not json')).toEqual([])
    expect(parseProjects(JSON.stringify([{ id: 1 }, p]))).toEqual([p])
  })
})

describe('stage 2: his traced ground floor, basements and rooftop as shells (projects.ts levels)', () => {
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const cols = u.pillars ?? []
  /** a traced level: one closed outline (any angles), its columns, optionally the drawing it was traced off */
  const level = (id: string, pts: Pt[], pillars: Unit['pillars'] = [], planImage?: Unit['planImage']): Unit => ({
    ...u,
    id,
    name: id,
    vertices: pts.map((p, i) => ({ id: `${id}-v${i}`, ...p })),
    walls: pts.map((_, i) => ({ id: `${id}-w${i}`, a: `${id}-v${i}`, b: `${id}-v${(i + 1) % pts.length}`, thicknessM: 0.25, heightM: 3.048, openings: [] })),
    roomLabels: [],
    furniture: [],
    pillars,
    planImage,
  })
  const box = (id: string, x0: number, y0: number, x1: number, y1: number, pillars?: Unit['pillars'], pi?: Unit['planImage']) =>
    level(id, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], pillars, pi)
  const shifted = (d: Pt, noise = 0) => cols.map((q, i) => ({ ...q, id: `c${i}`, x: q.x - d.x + (i % 2 ? noise : -noise), y: q.y - d.y + (i % 3 ? -noise : noise) }))

  test("columns: a level traced in its own frame lands on the flat's columns (shift found; extra / missing columns, 2 cm drawing error)", () => {
    const d = { x: 3.2, y: -1.7 }
    const mine = [...shifted(d).slice(2), { id: 'x1', x: 40, y: 40, wM: 0.3, hM: 0.5 }, { id: 'x2', x: -30, y: 5, wM: 0.3, hM: 0.5 }]
    const a = alignColumns(cols, mine)!
    expect(a.matched).toBe(cols.length - 2)
    expect(a.offset.x).toBeCloseTo(d.x, 9)
    expect(a.offset.y).toBeCloseTo(d.y, 9)
    const n = alignColumns(cols, shifted(d, 0.02))!
    expect(Math.hypot(n.offset.x - d.x, n.offset.y - d.y)).toBeLessThan(0.02)
    expect(n.errM).toBeLessThan(0.04)
    expect(alignColumns(cols, shifted(d).slice(0, 2))).toBeNull() // two columns: chance on a grid, not an alignment
    expect(alignColumns(cols, shifted(d).map((q) => ({ ...q, wM: q.wM + 0.4 })))).toBeNull() // other sizes: other columns
  })

  test('placeOfLevel says how it placed the level: columns, the same drawing, or nothing (he types the shift)', () => {
    const p = makeProject('p', u, 2, 7, 'left')
    const d = { x: -4, y: 2.5 }
    const byCols = placeOfLevel(p, box('g', -14, -1, 14, 21, shifted(d)))!
    expect(byCols.by).toBe('columns')
    expect(byCols.matched).toBe(cols.length)
    expect(byCols.offset.x).toBeCloseTo(d.x, 9)
    expect(byCols.offset.y).toBeCloseTo(d.y, 9)
    const pi = u.planImage!
    const byDrawing = placeOfLevel(p, box('r', 0, 0, 12, 18, [], { ...pi, originPx: { x: pi.originPx.x - pi.pxPerM, y: pi.originPx.y } }))!
    expect(byDrawing.by).toBe('drawing')
    expect(byDrawing.offset.x).toBeCloseTo(-1, 9)
    expect(byDrawing.offset.y).toBeCloseTo(0, 9)
    expect(placeOfLevel(p, box('b', 0, 0, 30, 20, [], { src: 'Basement 1.jpg', pxPerM: 26, originPx: { x: 0, y: 0 } }))).toBeNull()
  })

  test('the levels in the tower: B2, B1 below, his ground at 0 (no columns, no stand-ins), the rooftop on the roof above floor 7', () => {
    const g = box('g', -14, -1, 14, 21)
    let p = makeProject('p', u, 2, 7, 'left')
    for (const [x, kind, n] of [[g, 'ground', undefined], [box('b1', -15, -2, 15, 22), 'basement', 1], [box('b2', -15, -2, 15, 22), 'basement', 2], [box('r', 2, 4, 9, 10), 'rooftop', undefined]] as const)
      p = placeLevel(p, x, kind, n, { x: 0.5, y: 0 }, 'typed')
    const t = projectTower(p)
    expect(t.FLOORS.map((f) => [f.floor, f.flats.length, (f.standIns ?? []).join()])).toEqual([
      [-2, 0, 'b2'],
      [-1, 0, 'b1'],
      [0, 0, 'g'],
      [1, 0, `${u.id},${u.id}-m`],
      [2, 2, ''],
      [3, 2, ''],
      [4, 2, ''],
      [5, 2, ''],
      [6, 2, ''],
      [7, 2, ''],
      [8, 0, 'r'],
    ])
    expect(t.LEVELS).toEqual({ g: 0, b1: -1, b2: -2, r: 8 })
    expect(topFloor(t)).toBe(7)
    expect(t.GROUND.columns).toEqual([]) // his ground floor carries its own columns
    expect(t.FLATS.g).toEqual({ unit: g, offset: { x: 0.5, y: 0 } })
    expect(t.GROUND.plot[0].x).toBeCloseTo(-14 + 0.5 - 2, 9) // the plot covers his ground floor
    for (const [s, k] of [['g', 0], ['b1', -1], ['r', 8], [u.id, 2]] as const) expect(floorIn(t, s, undefined), s).toBe(k)
    expect(projectTower(makeProject('p', u, 2, 7, 'left')).LEVELS).toEqual({}) // no levels: the stage-1 tower
  })

  test('slots: one ground / rooftop, one basement per number; a flat becomes a level; the only flat stays; take a level out', () => {
    const p = makeProject('p', u, 2, 7, 'none')
    let q = placeLevel(placeLevel(p, box('g1', 0, 0, 10, 10), 'ground', undefined, { x: 0, y: 0 }, 'typed'), box('g2', 0, 0, 11, 11), 'ground', undefined, { x: 1, y: 0 }, 'columns')
    expect(q.levels!.map((l) => [l.unitId, l.kind, l.by])).toEqual([['g2', 'ground', 'columns']])
    expect(Object.keys(q.units).sort()).toEqual(['g2', u.id].sort()) // g1's copy pruned
    q = placeLevel(placeLevel(q, box('a', 0, 0, 5, 5), 'basement', 1, { x: 0, y: 0 }, 'typed'), box('b', 0, 0, 5, 5), 'basement', 2, { x: 0, y: 0 }, 'typed')
    q = placeLevel(q, box('c', 0, 0, 5, 5), 'basement', 1, { x: 0, y: 0 }, 'typed')
    expect(q.levels!.map((l) => `${l.unitId}:${l.kind}${l.n ?? ''}`).sort()).toEqual(['b:basement2', 'c:basement1', 'g2:ground'])
    expect(levelOf(q, 'c')).toMatchObject({ kind: 'basement', n: 1 })
    expect(placeLevel(q, u, 'rooftop', undefined, { x: 0, y: 0 }, 'typed')).toBe(q) // his only flat cannot become the rooftop
    const sb = sheltech.FLATS['sheltech-b'].unit
    const two = placeLevel(placeFlat(q, sb, 2, 7, 'none'), sb, 'rooftop', undefined, { x: 0, y: 0 }, 'typed')
    expect(Object.keys(two.flats)).toEqual([u.id])
    expect(levelOf(two, sb.id)?.kind).toBe('rooftop')
    expect(removeLevel(q, 'c').levels!.map((l) => l.unitId).sort()).toEqual(['b', 'g2'])
    expect(removeLevel(q, 'c').units.c).toBeUndefined()
    expect(parseProjects(JSON.stringify([q]))).toEqual([q])
  })

  test('a common floor (Building → Common floor, floor n): takes that floor\'s place as a walked level, like the built-in Sheltech Level 1', () => {
    const l1 = box('l1', -14, -1, 14, 21)
    let p = placeLevel(makeProject('p', u, 2, 7, 'left'), l1, 'common', 1, { x: 0.5, y: 0 }, 'typed')
    const t = projectTower(p)
    // the built-in tower's shape for its Level 1: a level stand-in on floor 1, LEVELS = 1
    expect(t.FLOORS.find((f) => f.floor === 1)).toEqual({ floor: 1, flats: [], standIns: ['l1'] })
    expect(sheltech.FLOORS.find((f) => f.floor === 1)).toEqual({ floor: 1, flats: [], standIns: ['sheltech-l1'] })
    expect(t.LEVELS).toEqual({ l1: 1 })
    expect([topFloor(t), levelName(t, 1), roleIn(t, 'l1'), floorIn(t, 'l1')]).toEqual([7, 'Level 1', 'level', 1])
    expect(coverOf(t, 'l1').length).toBeGreaterThan(0) // the flats' slab above it
    // on a floor of flats: it takes the floor (its flats go on the others); one per floor number; above the flats: not drawn
    p = placeLevel(p, box('l3', 0, 0, 5, 5), 'common', 3, { x: 0, y: 0 }, 'typed')
    p = placeLevel(p, box('l3b', 0, 0, 5, 5), 'common', 3, { x: 0, y: 0 }, 'typed')
    const t2 = projectTower(p)
    expect(t2.FLOORS.filter((f) => f.floor >= 1 && f.floor <= 4).map((f) => [f.floor, f.flats.length, (f.standIns ?? []).join()])).toEqual([
      [1, 0, 'l1'],
      [2, 2, ''],
      [3, 0, 'l3b'],
      [4, 2, ''],
    ])
    expect(levelOf(p, 'l3b')).toMatchObject({ kind: 'common', n: 3 })
    expect(projectTower(placeLevel(p, box('l9', 0, 0, 5, 5), 'common', 9, { x: 0, y: 0 }, 'typed')).LEVELS?.l9).toBeUndefined()
    expect(parseProjects(JSON.stringify([p]))).toEqual([p])
  })

  test('an angled level (a chamfered rooftop, walls at 30° and 45°): placed on its columns and towered as traced, nothing squared', () => {
    const [c, s] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
    const r = level('angled', [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 8, y: 2 }, { x: 8 + 4 * s, y: 2 + 4 * c }, { x: 3, y: 8 }, { x: 0, y: 5 }], shifted({ x: 0, y: 0 }))
    expect(core.deriveRooms(r)).toHaveLength(1)
    const p = makeProject('p', u, 2, 7, 'none')
    const at = placeOfLevel(p, r)!
    expect(at.by).toBe('columns')
    const t = projectTower(placeLevel(p, r, 'rooftop', undefined, at.offset, at.by))
    expect(t.FLATS.angled.unit).toBe(r) // its walls as traced
    expect(t.FLOORS.at(-1)).toEqual({ floor: 8, flats: [], standIns: ['angled'] })
    const b = flatBounds(r)
    expect([b.maxX, b.maxY].map((v) => +v.toFixed(3))).toEqual([+(8 + 4 * s).toFixed(3), 8])
  })
})

describe('towers of common levels (session 19): Banani and dmd registered, levels walked, the slab over a level', () => {
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const B = banani
  const unitOf = (t: { FLATS: Record<string, { unit: Unit }> }, s: string) => t.FLATS[s].unit
  const poly = (x: Unit, name: string) => JSON.stringify(core.roomPolygon(core.deriveRooms(x).find((r) => r.name === name)!, x))
  const has = (cover: Pt[][], p: string) => cover.some((c) => JSON.stringify(c) === p)

  test('towerOf a level or a massing shell; top floor = the flats or massing, never a level; floorIn; roles; level names', () => {
    for (const [t, ids] of [[B, ['banani-ground', 'banani-b1', 'banani-b2', 'banani-roof', 'banani-typical']], [dmd, ['dmd-ground', 'dmd-b1', 'dmd-b2', 'dmd-roof', 'dmd-typical']]] as const)
      for (const s of ids) expect(towerOf(unitOf(t, s))?.FLATS, s).toBe(t.FLATS)
    expect([bti, sheltech, B, dmd].map((t) => topFloor(t))).toEqual([8, 6, 12, 13])
    expect(floorIn(B, 'banani-typical')).toBe(1)
    expect(floorIn(B, 'banani-roof')).toBe(13)
    expect(floorIn(dmd, 'dmd-b2', 5)).toBe(-2)
    expect(['banani-ground', 'banani-typical'].map((s) => roleIn(B, s))).toEqual(['level', 'massing'])
    expect(roleIn(sheltech, 'sheltech-a')).toBe('flat')
    expect([-2, 0, 1, 7].map((k) => levelName(sheltech, k))).toEqual(['Basement 2', 'Ground floor', 'Level 1', 'Rooftop'])
  })

  test('a level’s base is the floor inside its lowest gate (Banani −1.5, dmd −0.38); a basement has none', () => {
    const base = (x: Unit) => baseLevel(x, core.deriveRooms(x))
    expect(base(unitOf(B, 'banani-ground'))).toBeCloseTo(-1.5, 6)
    expect(base(unitOf(dmd, 'dmd-ground'))).toBeCloseTo(-0.38, 2)
    expect(base(unitOf(B, 'banani-b1'))).toBe(0)
  })

  test('cover: every floor above, but shafts and ramps going down; none over a rooftop or a flat', () => {
    const g = unitOf(B, 'banani-ground')
    const b1 = coverOf(B, 'banani-b1')
    expect(has(b1, poly(g, 'Lawn (east)'))).toBe(true) // a sunken lawn over the basement is a slab
    expect(has(b1, poly(g, 'Drop off area'))).toBe(true)
    for (const n of ['Car ramp', 'Car ramp (curve 1)', 'Car ramp (curve 3)']) expect(has(b1, poly(g, n)), n).toBe(false) // the void the ramp goes down
    expect(has(b1, poly(unitOf(B, 'banani-typical'), 'Typical floor'))).toBe(true)
    expect(has(coverOf(B, 'banani-b2'), poly(unitOf(B, 'banani-b1'), 'Driveway'))).toBe(true)
    expect(has(coverOf(B, 'banani-b2'), poly(unitOf(B, 'banani-b1'), 'Ramp down (to B2)'))).toBe(false)
    expect(coverOf(B, 'banani-roof')).toEqual([])
    expect(coverOf(B, 'banani-typical')).toEqual([]) // massing: never walked
    expect(coverOf(sheltech, 'sheltech-a')).toEqual([])
    // Sheltech's ground: under level 1's north half AND under the flats over its open south half
    const sg = coverOf(sheltech, 'sheltech-ground')
    expect(has(sg, poly(unitOf(sheltech, 'sheltech-l1'), 'Gym'))).toBe(true)
    expect(has(sg, poly(unitOf(sheltech, 'sheltech-a'), 'Living'))).toBe(true)
    // …but not under the rooftop's ledges: it stands on the top floor's slab
    expect(has(sg, poly(unitOf(sheltech, 'sheltech-roof'), 'Sunshade / planter (south)'))).toBe(false)
  })

  test('a flat in its tower (founder 2026-11-20: no sun through a slab): the floor above over its own rooms, a shaft open, the top floor under the rooftop', () => {
    const a = unitOf(sheltech, 'sheltech-a')
    const on2 = coverOf(sheltech, 'sheltech-a', 2)
    for (const n of ['Veranda 1', 'Planter (east)', 'Living']) expect(has(on2, poly(a, n)), n).toBe(true) // floor 3's flat A over floor 2's
    expect(has(on2, poly(unitOf(sheltech, 'sheltech-b'), 'Living'))).toBe(false) // the neighbour's slab: not over this flat
    const ta = unitOf(bti, 'type-a')
    const shafts = core.deriveRooms(ta).filter((r) => r.kind === 'shaft')
    const bal = core.deriveRooms(ta).find((r) => r.name === 'Veranda (study)')!
    const ta2 = coverOf(bti, 'type-a', 2) // under type-c on floor 3 (and B's slab beside it, left out)
    expect(ta2.some((c) => core.pointInPolygon(bal.centroid, c))).toBe(true)
    // the AODs that stack under C's stay open to the sky; the two that floor 3's flat B builds over (its Bed-2, Bath-2) are roofed
    expect(shafts.filter((r) => ta2.some((c) => core.pointInPolygon(r.centroid, c))).map((r) => r.name)).toEqual(['AOD (north)', 'AOD (east)'])
    const top = coverOf(sheltech, 'sheltech-a', 6)
    expect(has(top, poly(unitOf(sheltech, 'sheltech-roof'), 'Deck (west)')) || has(top, poly(unitOf(sheltech, 'sheltech-roof'), 'Deck (east)'))).toBe(true)
    expect(coverOf(sheltech, 'sheltech-a')).toEqual([]) // no floor: its own roof, as before
  })

  test('a stair leads to the floor above / below: the unit there with a stair room over it (founder 2026-11-20)', () => {
    const at = { x: 3.53, y: 9.25 } // Sheltech A's stair
    expect(stairTo(sheltech, 'sheltech-a', 2, at, 1)).toMatchObject({ stem: 'sheltech-a', floor: 3 })
    expect(stairTo(sheltech, 'sheltech-a', 2, at, -1)).toMatchObject({ stem: 'sheltech-l1', floor: 1 }) // the common level under the flats
    expect(stairTo(sheltech, 'sheltech-l1', 1, at, -1)).toMatchObject({ stem: 'sheltech-ground', floor: 0 })
    expect(stairTo(sheltech, 'sheltech-a', 6, at, 1)).toMatchObject({ stem: 'sheltech-roof', floor: 7 })
    expect(stairTo(sheltech, 'sheltech-roof', 7, at, 1)).toBeNull() // nothing above the rooftop
    expect(stairTo(sheltech, 'sheltech-b2', -2, at, -1)).toBeNull()
    expect(stairTo(sheltech, 'sheltech-a', 2, { x: 11.5, y: 16.8 }, 1)).toBeNull() // a veranda: no stair there
    // BTI: B's stair; floor 2 is A (no stair) with B standing in for the untraced rest: B there
    const b = core.deriveRooms(unitOf(bti, 'type-b')).find((r) => r.name === 'Stair')!.centroid
    expect(stairTo(bti, 'type-b', 3, b, -1)).toMatchObject({ stem: 'type-b', floor: 2, at: b })
    expect(stairTo(bti, 'type-b', 3, b, 1)).toMatchObject({ stem: 'type-b', floor: 4 })
  })

  test('a Studio project’s traced levels get the same cover, in the level’s own frame', () => {
    const v = (id: string, x: number, y: number) => ({ id, x, y })
    // a ground: a drive at −1 behind a 4 m gate, a ramp beside it falling to −3.5 (a flush line between them)
    const g: Unit = {
      ...u,
      id: 'g',
      name: 'g',
      vertices: [v('v0', 0, 0), v('v1', 10, 0), v('v2', 20, 0), v('v3', 20, 10), v('v4', 10, 10), v('v5', 0, 10)],
      walls: [
        { id: 'w0', a: 'v0', b: 'v1', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w1', a: 'v1', b: 'v2', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w2', a: 'v2', b: 'v3', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w3', a: 'v3', b: 'v4', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w4', a: 'v4', b: 'v5', thicknessM: 0.25, heightM: 2.1, openings: [{ id: 'gate', kind: 'passage', offsetM: 3, widthM: 4, heightM: 2.1, sillM: 0 }] },
        { id: 'w5', a: 'v5', b: 'v0', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w6', a: 'v1', b: 'v4', thicknessM: 0.05, heightM: 0, openings: [] },
      ],
      roomLabels: [
        { id: 'drive', name: 'Drive', kind: 'driveway', x: 5, y: 5, levelM: -1 },
        { id: 'ramp', name: 'Ramp', kind: 'driveway', x: 15, y: 5, levelM: -1, slope: { toLevelM: -3.5, dirDeg: 90 } },
      ],
      furniture: [],
      pillars: [],
    }
    const b1: Unit = { ...g, id: 'b1', name: 'b1', walls: g.walls.map((w) => ({ ...w, openings: [] })), roomLabels: [{ id: 'park', name: 'Parking', kind: 'parking', x: 5, y: 5 }] }
    let p = makeProject('p', u, 2, 7, 'none')
    p = placeLevel(p, g, 'ground', undefined, { x: 1, y: 2 }, 'typed')
    p = placeLevel(p, b1, 'basement', 1, { x: 1, y: 2 }, 'typed')
    const t = projectTower(p)
    expect(baseLevel(g, core.deriveRooms(g))).toBe(-1)
    const flat = core.deriveRooms(u).filter((r) => r.kind !== 'shaft').map((r) => core.roomPolygon(r, u).map((q) => ({ x: q.x - 1, y: q.y - 2 })))
    expect(coverOf(t, 'g')).toEqual(flat) // the flats' faces, building frame → the ground's
    const under = coverOf(t, 'b1')
    expect(has(under, poly(g, 'Drive'))).toBe(true)
    expect(has(under, poly(g, 'Ramp'))).toBe(false)
    expect(under).toHaveLength(flat.length + 1)
    expect(coverOf(t, u.id)).toEqual([])
  })
})

describe('the tower round a walked flat (three/building.ts, session 31)', () => {
  test('frame: a flat’s plan point lands at p + its offset − the walked flat’s, floor k at (k − floor) storeys, an imported building at its own heights', () => {
    const f = frameOf(bti as Tower, 'type-c', 6)
    expect(f.shift('type-b')).toEqual({ x: 0, y: -9.212 })
    expect(f.shift()).toEqual({ x: 0, y: -9.212 }) // the building frame's origin is Type B's
    expect(f.shift('type-c')).toEqual({ x: 0, y: 0 })
    expect([f.levelOf(6), f.levelOf(0), f.levelOf(9)].map((y) => +y.toFixed(3))).toEqual([0, +(-6 * bti.FLOOR_M).toFixed(3), +(3 * bti.FLOOR_M).toFixed(3)])
    const ifc = { ...bti, ELEVATIONS: { 0: 0, 1: 4.5, 2: 7.6 } } as Tower
    expect(frameOf(ifc, 'type-c', 2).levelOf(1)).toBeCloseTo(-3.1)
  })

  const A = sheltech.FLATS['sheltech-a'].unit
  const B = sheltech.FLATS['sheltech-b'].unit
  const [ra, rb] = [roomsOf(A), roomsOf(B)]
  test('sharedWith: the lobby Sheltech A and B both trace is left to the walked flat; the neighbour’s own rooms and walls stay', () => {
    const s = sharedWith(A, ra, B, rb, { x: 0, y: 0 })
    expect([...s.rooms].map((id) => rb.find((r) => r.id === id)!.name)).toEqual(['Lobby'])
    expect(s.walls.size).toBeGreaterThan(0)
    expect(s.walls.size).toBeLessThan(B.walls.length / 4)
    // each one lies in one of A's walls: its middle within that wall's body
    for (const id of s.walls) {
      const w = B.walls.find((x) => x.id === id)!
      const f = core.wallFrame(w, B.vertices)
      expect(onFlat({ x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }, A, ra)).toBe(true)
    }
    // a flat against itself shares everything; moved away, nothing
    const self = sharedWith(A, ra, A, ra, { x: 0, y: 0 })
    expect([self.walls.size, self.rooms.size]).toEqual([A.walls.length, ra.length])
    const far = sharedWith(A, ra, B, rb, { x: 100, y: 0 })
    expect([far.walls.size, far.rooms.size, far.pillars.size]).toEqual([0, 0, 0])
  })

  test('lid: over the walked flat the floor above starts on its roof; beside it the full plate', () => {
    const lid = { over: (p: Pt) => onFlat(p, A, ra), y: 0.1 }
    const bottoms = (u: Unit, rooms: Room[]) => plate(u, rooms, 0.2, 0.2, u.walls, lid).map((g) => (g.computeBoundingBox(), g.boundingBox!.min.y))
    // the same flat right above: every piece starts at the lid
    expect(Math.min(...bottoms(A, ra))).toBeCloseTo(0.1)
    // the neighbour above: its rooms beside A keep the whole plate, its lobby (over A's) starts at the lid
    const b = bottoms(B, rb)
    expect(b.filter((y) => Math.abs(y) < 1e-6).length).toBeGreaterThan(b.length / 2)
    expect(b.some((y) => Math.abs(y - 0.1) < 1e-6)).toBe(true)
    // a lid over the plate's top: nothing over the flat
    expect(plate(A, ra, 0.2, 0.2, A.walls, { ...lid, y: 0.3 })).toHaveLength(0)
  })
})

describe('the Building view: which floor, and the windows lit (session 31 pick)', () => {
  test('the floor under a height: the highest floor at or under it, a floor’s own top face its own, under them all the lowest', async () => {
    const { floorAtY } = await import('./building')
    // the BTI frame seen from floor 2 (FLOOR_M 3.198): basement none, ground −6.396, floor 2 at 0, roof (9) at 22.386
    const levels: [number, number][] = Array.from({ length: 10 }, (_, k) => [k, (k - 2) * 3.198])
    expect(floorAtY(0, levels)).toBe(2) // floor 2's own floor
    expect(floorAtY(-0.005, levels)).toBe(2) // its top face, a hair under
    expect(floorAtY(-0.1, levels)).toBe(1) // the slab's edge under it: the storey below
    expect(floorAtY(1.5, levels)).toBe(2)
    expect(floorAtY(3.198 * 6 + 0.5, levels)).toBe(8)
    expect(floorAtY(3.198 * 7 + 1.2, levels)).toBe(9) // a tank on the roof
    expect(floorAtY(-20, levels)).toBe(0) // under the ground floor: the lowest there is
    // an imported building's own storey heights (ELEVATIONS) and a basement, in any order
    expect(floorAtY(-2, [[1, 4.2], [-1, -3.1], [0, 0]])).toBe(-1)
    expect(floorAtY(4.19, [[1, 4.2], [-1, -3.1], [0, 0]])).toBe(1)
    expect(floorAtY(1, [])).toBeNull()
  })

  test('lit at night: about half the rooms, some flats all dark, the same every visit, every window of a room alike', async () => {
    const { roomLight } = await import('./building')
    const flats = Array.from({ length: 400 }, (_, i) => `type-${i % 5}|${i}`)
    const rooms = ['bed-1', 'bed-2', 'living', 'kitchen', 'dining', 'bath']
    const all = flats.flatMap((f) => rooms.map((r) => roomLight(f, r)))
    const lit = all.filter((v) => v > 0)
    expect(lit.length / all.length).toBeGreaterThan(0.45) // people live there
    expect(lit.length / all.length).toBeLessThan(0.6) // and some are out, or asleep
    expect(Math.min(...lit)).toBeGreaterThanOrEqual(0.55) // a lit room is never a faint smear
    expect(Math.max(...lit)).toBeLessThanOrEqual(1)
    expect(new Set(lit.map((v) => v.toFixed(2))).size).toBeGreaterThan(20) // varied, not one brightness
    const dark = flats.filter((f) => rooms.every((r) => roomLight(f, r) === 0)).length / flats.length
    expect(dark).toBeGreaterThan(0.06) // nobody home
    expect(dark).toBeLessThan(0.25)
    // deterministic: no flicker between frames or visits
    expect(flats.flatMap((f) => rooms.map((r) => roomLight(f, r)))).toEqual(all)
  })
})

describe('the Building view: rooms behind every window, the picked flat lit (session 31 glow)', () => {
  // the tower built in node as in the page: a canvas that draws nothing, pictures that never arrive (the rooms wait for them,
  // so only what is made at once is checked here), no frames
  const stop = { addColorStop: () => {} }
  const draw = new Proxy({}, { get: (_, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'measureText' ? () => ({ width: 1 }) : () => stop), set: () => true })
  const g = globalThis as unknown as Record<string, unknown>
  g.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => draw }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) }
  g.requestAnimationFrame ??= () => 0
  type Seen = {
    flats: { s: string; k: number; home: string; level: boolean; lamps: { image: { data: Uint8Array } }; scale: { value: number } }[]
    paneOwners: Map<{ geometry: { attributes: Record<string, unknown> }; material: { transparent: boolean; blending: number } }, unknown>
    lift: { meshes: { geometry: { boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null; computeBoundingBox(): void } }[] }
  }
  const tower = async (unit: Unit, tier: 'high' | 'low' | 'lite' = 'high') => {
    const { Building } = await import('./building')
    const b = Building.for(unit, tier)!
    for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
    return b as unknown as Pick<typeof b, 'setSun' | 'highlight' | 'dispose' | 'floor'> & Seen
  }
  const shut = (r: Room) => r.kind === 'shaft' || r.kind === 'balcony'

  test('every flat but the walked one has rooms behind its windows (the massing floors too); the panes are glass, no card on them', async () => {
    const THREE = await import('three')
    const b = await tower(bti.FLATS['type-a'].unit)
    const paneMesh = [...b.paneOwners.keys()][0] // (one merged pane mesh a floor)
    // BTI: floor 1 the typical plate (B + C), floor 2 Type A (walked) + B, floors 3–8 B + C
    expect(b.flats.map((f) => `${f.s}@${f.k}`).sort()).toEqual(['type-b@1', 'type-c@1', 'type-b@2', ...[3, 4, 5, 6, 7, 8].flatMap((k) => [`type-b@${k}`, `type-c@${k}`])].sort())
    expect(Object.keys(paneMesh.geometry.attributes).sort()).toEqual(['normal', 'pane', 'position', 'uv']) // the frame's data only: no curtain, blind or room drawn on it
    expect(paneMesh.material.transparent).toBe(true)
    expect(paneMesh.material.blending).toBe(THREE.CustomBlending) // what is behind it shows through
    // Sheltech from A on floor 3: every other A and B, and the common levels one sees from the street (ground, level 1, rooftop)
    const s = await tower(sheltech.FLATS['sheltech-a'].unit)
    const names = s.flats.map((f) => `${f.s}@${f.k}`)
    expect(names).toHaveLength(9 + 3)
    expect(names).not.toContain(`sheltech-a@${s.floor}`)
    expect(s.flats.filter((f) => f.level).map((f) => f.s).sort()).toEqual(['sheltech-ground', 'sheltech-l1', 'sheltech-roof'])
    b.dispose()
    s.dispose()
  })

  test('the picked flat lifted and its lamps on; another picked: the lift and the lamps move to it', async () => {
    const THREE = await import('three')
    const b = await tower(bti.FLATS['type-a'].unit)
    const sun = new THREE.DirectionalLight()
    b.setSun(sun, 1, 4, true) // night, the Lights on
    const lit = Math.round(255 * 0.85)
    const lamps = (f: Seen['flats'][number]) => Array.from({ length: f.lamps.image.data.length / 4 }, (_, i) => f.lamps.image.data[i * 4])
    const span = () => {
      const geo = b.lift.meshes[0].geometry
      geo.computeBoundingBox()
      return [geo.boundingBox!.min.y, geo.boundingBox!.max.y].map((y) => +y.toFixed(2))
    }
    const F = bti.FLOOR_M
    const rooms = (s: string) => core.deriveRooms(bti.FLATS[s].unit)
    const allLit = (s: string) => rooms(s).map((r) => (shut(r) ? 0 : lit))
    // floor 2 picked (the walked Type A: its own lamps are the scene's): the lift over its storey, slab edge to ceiling
    expect(span()).toEqual([+(3 - F).toFixed(2), 3])
    for (const f of b.flats) expect(f.scale.value, f.home).toBe(1) // the night: every other flat's pattern shows
    b.highlight(5)
    expect(span()).toEqual([+(3 * F + 3 - F).toFixed(2), +(3 * F + 3).toFixed(2)]) // floor 5's storey, floor 2's gone
    const on5 = b.flats.filter((f) => f.k === 5)
    expect(on5.map((f) => f.s).sort()).toEqual(['type-b', 'type-c']) // Type A is not on floor 5: both its flats are picked
    // every side of them: the lift reaches past each outer edge of their plans (their walls' outer faces)
    const lb = b.lift.meshes[0].geometry.boundingBox!
    const a = bti.FLATS['type-a'].offset
    const xs = ['type-b', 'type-c'].map((s) => ({ b: core.unitBounds(bti.FLATS[s].unit), o: bti.FLATS[s].offset }))
    expect(lb.min.x).toBeLessThan(Math.min(...xs.map(({ b: u, o }) => u.minX + o.x - a.x)))
    expect(lb.max.x).toBeGreaterThan(Math.max(...xs.map(({ b: u, o }) => u.maxX + o.x - a.x)))
    expect(lb.min.z).toBeLessThan(Math.min(...xs.map(({ b: u, o }) => u.minY + o.y - a.y)))
    expect(lb.max.z).toBeGreaterThan(Math.max(...xs.map(({ b: u, o }) => u.maxY + o.y - a.y)))
    for (const f of on5) expect(lamps(f), f.home).toEqual(allLit(f.s))
    const f3 = b.flats.find((f) => f.s === 'type-b' && f.k === 3)!
    expect(lamps(f3)).not.toEqual(allLit('type-b')) // a home's own pattern, not all lit
    b.setSun(sun, 1, 4, false) // the Lights button off: the picked flats go dark, the others keep their pattern
    for (const f of on5) expect(f.scale.value).toBe(0)
    expect(f3.scale.value).toBe(1)
    b.setSun(sun, 1, 4, true)
    b.highlight(3) // another floor: floor 5 back to its own pattern, floor 3 lit
    expect(lamps(f3)).toEqual(allLit('type-b'))
    for (const f of on5) expect(lamps(f), f.home).not.toEqual(allLit(f.s))
    b.setSun(sun, 0, 1.2, false) // by day with the Lights off: no lamp anywhere
    expect(b.flats.every((f) => f.scale.value === 0)).toBe(true)
    b.dispose()
  })

  test('which flats are furnished per tier and in what order: the nearest first; High all, Low the 3 storeys nearest the camera and the picked one, Lite none', async () => {
    const THREE = await import('three')
    const { furnishes, insideOrder, nearestStoreys, LOW_STOREYS, PICK_LIFT, HOVER_LIFT, PICK_NIGHT, HOVER_NIGHT } = await import('./building')
    const at = (x: number, y: number) => ({ at: new THREE.Vector3(x, y, 0), name: `${x},${y}` })
    const flats = [at(0, 30), at(0, 3), at(10, 3), at(0, 12)]
    expect(insideOrder(flats, new THREE.Vector3(0, 0, 0)).map((f) => f.name)).toEqual(['0,3', '10,3', '0,12', '0,30'])
    expect(insideOrder(flats, new THREE.Vector3(0, 40, 0)).map((f) => f.name)).toEqual(['0,30', '0,12', '0,3', '10,3'])
    const near = nearestStoreys([{ k: 8, d: 40 }, { k: 2, d: 5 }, { k: 2, d: 9 }, { k: 3, d: 8 }, { k: 5, d: 20 }, { k: 4, d: 12 }], LOW_STOREYS)
    expect([...near].sort()).toEqual([2, 3, 4])
    expect([2, 5, 8].map((k) => furnishes('high', k, near))).toEqual([true, true, true])
    expect([2, 5, 8].map((k) => furnishes('low', k, near))).toEqual([true, false, false])
    expect([2, 5, 8].map((k) => furnishes('lite', k, near))).toEqual([false, false, false])
    expect(furnishes('low', 2, null)).toBe(false) // before the camera is known
    expect([5, 8].map((k) => furnishes('low', k, near, 5))).toEqual([true, false]) // the picked floor too, wherever the camera is
    expect(furnishes('lite', 5, near, 5)).toBe(false)
    // the hover is quieter than the picked flat's lift, by day and by night
    expect(HOVER_LIFT).toBeLessThan(PICK_LIFT)
    expect(HOVER_NIGHT).toBeLessThan(PICK_NIGHT)
  })

  test('the lamps: the picked flat and a common level all lit, a home by its night pattern; never a balcony or a shaft', async () => {
    const { flatLamps, roomLight } = await import('./building')
    const rooms = core.deriveRooms(bti.FLATS['type-b'].unit)
    expect(flatLamps('type-b|4', rooms, 'picked')).toEqual(rooms.map((r) => (shut(r) ? 0 : 0.85)))
    expect(flatLamps('type-b|4', rooms, 'level')).toEqual(rooms.map((r) => (shut(r) ? 0 : 0.85)))
    expect(flatLamps('type-b|4', rooms, 'home')).toEqual(rooms.map((r) => (shut(r) ? 0 : roomLight('type-b|4', r.id))))
  })
})

describe('the Building view: each floor as staff left it (session 31 glow, with the kept records)', () => {
  test('a floor whose finishes or furniture staff changed has rooms of its own behind its windows; the others share the plan’s', async () => {
    const g = globalThis as unknown as Record<string, unknown>
    const store = new Map<string, string>()
    const had = g.localStorage
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    try {
      const b = bti.FLATS['type-b'].unit
      // floor 5's Type B painted Slate Blue (Finishes → Wall paint, kept for floor 5 only); floor 6's bed moved
      store.set(`plotline.finishes.${b.id}:5`, JSON.stringify({ s_wall_paint: 'fo_paint_slate_blue' }))
      const { layoutFor } = await import('../studio/furniture')
      const moved = layoutFor(b, core.deriveRooms(b)).map((p, i) => (i === 0 ? { ...p, x: p.x + 0.3 } : p))
      store.set(`plotline.layout.${b.id}:6`, JSON.stringify(moved))
      const { Building } = await import('./building')
      const made = Building.for(bti.FLATS['type-a'].unit)!
      for (const _ of made.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
      const t = made as unknown as { flats: { s: string; k: number }[]; drawing(f: unknown): unknown; drawn: Map<string, unknown>; dispose(): void }
      const of = (s: string, k: number) => t.drawing(t.flats.find((f) => f.s === s && f.k === k))
      expect(of('type-b', 4)).toBe(of('type-b', 7)) // the plan's: one geometry for both floors
      expect(of('type-b', 5)).not.toBe(of('type-b', 4)) // the slate blue walls: its own
      expect(of('type-b', 6)).not.toBe(of('type-b', 4)) // the moved bed: its own
      expect(of('type-b', 6)).not.toBe(of('type-b', 5))
      expect(of('type-c', 5)).toBe(of('type-c', 4)) // its neighbour on floor 5 is untouched
      t.dispose()
    } finally {
      g.localStorage = had
    }
  })
})

describe('one draw of the scene a frame (session 31 glow)', () => {
  test('a scanned model’s see-through glass (the wall clock’s face) is plain glass: nothing makes three draw everything twice', async () => {
    const THREE = await import('three')
    const { plainGlass } = await import('./furniture')
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 1, opacity: 1 })
    const wood = new THREE.MeshPhysicalMaterial({ color: '#8a6a4a' })
    const clock = new THREE.Group().add(new THREE.Mesh(new THREE.PlaneGeometry(), glass), new THREE.Mesh(new THREE.BoxGeometry(), wood))
    plainGlass(clock)
    expect([glass.transmission, glass.transparent, glass.opacity <= 0.15, glass.depthWrite]).toEqual([0, true, true, false])
    expect([wood.transmission, wood.transparent]).toEqual([0, false]) // the rest as it was
  })
})

describe('stand-ins: a scanned piece with hundreds of triangles where thousands are not seen (session 31 perf)', () => {
  test('simplified: about the budget, every part cut by the same share, small parts whole, the materials shared, the model itself untouched', async () => {
    const THREE = await import('three')
    const { simplified } = await import('./furniture')
    const wood = new THREE.MeshStandardMaterial()
    const seat = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), wood) // 12 k triangles
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8, 1), wood) // 32: a small part
    const model = new THREE.Group().add(seat, leg)
    const tris = (g: import('three').BufferGeometry) => (g.index ?? g.attributes.position).count / 3
    const before = tris(seat.geometry)
    const s = await simplified(model, 1200)
    const [sSeat, sLeg] = s.children as import('three').Mesh[]
    expect(tris(sSeat.geometry)).toBeLessThan(before / 8)
    expect(tris(sSeat.geometry)).toBeGreaterThan(400)
    expect(tris(sLeg.geometry)).toBe(tris(leg.geometry))
    expect(sSeat.material).toBe(wood)
    expect(tris(seat.geometry)).toBe(before) // the model the walk draws is not touched
    sSeat.geometry.computeBoundingBox()
    expect(sSeat.geometry.boundingBox!.max.y).toBeGreaterThan(0.9) // still the same shape's size
    expect(await simplified(model, 1e6)).toBe(model) // within the budget: the model itself
  })
})

describe('Lite: a model’s colour picture only (session 31 perf: one material program where there were four)', () => {
  test('colourOnly leaves the colour picture, drops relief, shading, roughness and metal pictures; a metal-mapped part goes dull, not chrome', async () => {
    const THREE = await import('three')
    const { colourOnly } = await import('./furniture')
    const t = () => new THREE.Texture()
    const m = new THREE.MeshStandardMaterial({ map: t(), normalMap: t(), aoMap: t(), roughnessMap: t(), metalnessMap: t(), metalness: 1, roughness: 1 })
    const plain = new THREE.MeshStandardMaterial({ color: '#888888', metalness: 1 }) // a metal with no picture keeps its metal
    colourOnly(new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), m), new THREE.Mesh(new THREE.BoxGeometry(), plain)))
    expect([!!m.map, m.normalMap, m.aoMap, m.roughnessMap, m.metalnessMap, m.metalness]).toEqual([true, null, null, null, null, 0])
    expect(plain.metalness).toBe(1)
  })
  test('a scan’s physical material becomes a standard one (one program fewer), its see-through glass drawn from the front only', async () => {
    const THREE = await import('three')
    const { colourOnly, plainGlass } = await import('./furniture')
    const map = new THREE.Texture()
    const fabric = new THREE.MeshPhysicalMaterial({ map, sheen: 1, color: '#806040', side: THREE.DoubleSide })
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 1, side: THREE.DoubleSide })
    const [a, b] = [new THREE.Mesh(new THREE.BoxGeometry(), fabric), new THREE.Mesh(new THREE.BoxGeometry(), glass)]
    colourOnly(plainGlass(new THREE.Group().add(a, b)))
    const fa = a.material as InstanceType<typeof THREE.MeshStandardMaterial>
    const gl = b.material as InstanceType<typeof THREE.MeshStandardMaterial>
    expect([fa.type, fa.map === map, fa.color.getHexString(), fa.side]).toEqual(['MeshStandardMaterial', true, '806040', THREE.DoubleSide]) // an opaque two-sided cloth keeps its sides
    expect([gl.type, gl.transparent, gl.opacity <= 0.15, gl.side]).toEqual(['MeshStandardMaterial', true, true, THREE.FrontSide])
  })
})

describe('the rooms behind the glass take none of the walked flat’s lamps (session 31 perf)', () => {
  test('noSpots: every chunk that names spot lights written out with none; the sun, the sky and the rest untouched', async () => {
    const THREE = await import('three')
    const { noSpots } = await import('./materials')
    for (const sh of [THREE.ShaderLib.standard.vertexShader, THREE.ShaderLib.standard.fragmentShader]) {
      const out = noSpots(sh)
      expect(out).not.toMatch(/NUM_SPOT_LIGHT/)
      expect(out).not.toMatch(/#include <(lights_fragment_begin|lights_pars_begin|shadowmap_pars_vertex|shadowmap_vertex)>/)
    }
    const f = noSpots(THREE.ShaderLib.standard.fragmentShader)
    expect(f).toMatch(/NUM_DIR_LIGHTS/) // the sun stays
    expect(f).toMatch(/#include <map_fragment>/) // chunks with no spot light left to three
  })
  test('the tower: its shells, plates and levels in the outside variant of their finish (none of the walked flat’s lamps); the walk keeps its own', async () => {
    const { materialFor, EXTERIOR_PLASTER } = await import('./materials')
    const { Building } = await import('./building')
    const out = materialFor(EXTERIOR_PLASTER, false, false, true)
    expect(out).not.toBe(materialFor(EXTERIOR_PLASTER)) // the walk's slab keeps its lamps
    expect(out.customProgramCacheKey()).toBe('outside')
    const b = Building.for(bti.FLATS['type-a'].unit)!
    for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
    const used = new Set<unknown>()
    b.traverse((o) => void used.add((o as unknown as { material?: unknown }).material))
    expect(used.has(out)).toBe(true) // the shells and plates
    expect(used.has(materialFor(EXTERIOR_PLASTER))).toBe(false) // never the walk's own
    b.dispose()
  })
})

describe('a code-built piece as a stand-in too (session 31 perf: a curtain’s pleats, a bed’s quilting were 4–11 thousand triangles on Lite)', () => {
  test('buildFurniture with a budget: a heavy code-built piece comes back near it; without one, as built', async () => {
    const { buildFurniture } = await import('./furniture')
    const { PROCEDURAL: KIT } = await import('../furnish/procedural.meta')
    const tris = (o: import('three').Object3D) => {
      let n = 0
      o.traverse((m) => {
        const g = (m as import('three').Mesh).isMesh ? (m as import('three').Mesh).geometry : null
        if (g?.attributes.position) n += (g.index ?? g.attributes.position).count / 3
      })
      return n
    }
    const heavy = await Promise.all(Object.values(KIT).filter((a) => a.url.startsWith('procedural:')).map(async (a) => ({ a, n: tris(await buildFurniture({ id: 'x', assetId: a.id, roomId: 'r', x: 0, y: 0, rotationDeg: 0 })) })))
    const big = heavy.sort((p, q) => q.n - p.n)[0]
    expect(big.n).toBeGreaterThan(4000)
    const light = tris(await buildFurniture({ id: 'x', assetId: big.a.id, roomId: 'r', x: 0, y: 0, rotationDeg: 0 }, 3.048, 0, undefined, 1500))
    expect(light).toBeLessThan(big.n / 2)
    // a curtain walked past keeps its pleats (they are its look); behind the Building view's glass it is light too
    const curtain = { id: 'c', assetId: 'curtains', roomId: 'r', x: 0, y: 0, rotationDeg: 0 }
    const pleated = tris(await buildFurniture(curtain))
    expect(tris(await buildFurniture(curtain, 3.048, 0, undefined, 1500))).toBe(pleated)
    expect(tris(await buildFurniture(curtain, 3.048, 0, undefined, 500))).toBeLessThan(pleated / 2)
  })
})

describe('round the flat the tower is a handful of draws (session 31 perf: the context lane took Walk / High 94 → 127 draws on Type A)', () => {
  test('once settled the tower shows as one mesh per material; the Building view gets it back one by one (its cut, lift and picking)', async () => {
    const g = globalThis as unknown as Record<string, unknown>
    g.requestAnimationFrame ??= () => 0
    const { Building } = await import('./building')
    const { HIDDEN } = await import('./batch')
    const b = Building.for(bti.FLATS['type-a'].unit, 'low')!
    for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
    const drawn = () => {
      let n = 0
      b.traverseVisible((o) => void ((o as import('three').Mesh).isMesh && o.layers.mask === 1 && n++))
      return n
    }
    b.frame('walk', 'low')
    const one = drawn()
    await new Promise((r) => setTimeout(r, 450))
    const batched = drawn()
    expect(batched).toBeLessThan(one / 3)
    b.frame('building', 'low')
    let hidden = 0
    b.traverse((o) => void (o.layers.mask === 1 << HIDDEN && hidden++))
    expect(hidden).toBe(0) // every piece back on its own
    expect(b.children.some((o) => o.userData.batch)).toBe(false)
    b.dispose()
  })

  test("every tree's leaves of one card and atlas are one instanced mesh round the flat, the trees' own back in the Building view", async () => {
    const g = globalThis as unknown as Record<string, unknown>
    g.requestAnimationFrame ??= () => 0
    const THREE = await import('three')
    const { Building } = await import('./building')
    const { HIDDEN } = await import('./batch')
    const { lightPiece } = await import('./daylight')
    const b = Building.for(bti.FLATS['type-a'].unit, 'low')!
    for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
    const card = new THREE.PlaneGeometry(0.1, 0.2), atlas = new THREE.MeshStandardMaterial()
    const tree = (x: number, n: number) => {
      const t = new THREE.Group()
      t.position.set(x, 0, 0)
      const im = new THREE.InstancedMesh(card, atlas, n)
      for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, 1 + i, 0))
      t.add(im)
      lightPiece(t, [0, 0]) // as the tower's pieces: each tree's leaves get a geometry of their own over the card's vertices
      b.add(t)
      return im
    }
    const a1 = tree(0, 3), a2 = tree(5, 2), far = tree(20, 1) // (another 8 m square: its own, so out of sight it is not drawn)
    expect(a1.geometry).not.toBe(a2.geometry)
    b.frame('walk', 'low')
    await new Promise((r) => setTimeout(r, 450))
    const merged = b.children.filter((o): o is import('three').InstancedMesh => (o as import('three').InstancedMesh).isInstancedMesh && o.layers.mask === 1)
    expect(merged.length).toBe(1)
    expect(merged[0].count).toBe(5)
    expect([a1.layers.mask, a2.layers.mask, far.layers.mask]).toEqual([1 << HIDDEN, 1 << HIDDEN, 1])
    const m = new THREE.Matrix4()
    merged[0].getMatrixAt(3, m) // the second tree's first leaf, where it stood
    expect(new THREE.Vector3().setFromMatrixPosition(m).toArray()).toEqual([5, 1, 0])
    b.frame('building', 'low')
    expect([a1.layers.mask, a2.layers.mask]).toEqual([1, 1])
    expect(merged[0].parent).toBe(null)
    expect(card.attributes.position).toBeTruthy() // the trees' card kept
    b.dispose()
  })
})
