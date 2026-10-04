/** The towers' data (data/building/*-tower.ts): alignment offsets re-derived from the traced core, floor maps, towerOf; Studio projects (projects.ts). */
import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import { floorIn, towerOf } from '../data/building'
import * as bti from '../data/building/demo-tower'
import { CORE, FLATS, FLOORS } from '../data/building/demo-tower'
import { alignColumns, flatBounds, levelOf, makeProject, parseProjects, placeFlat, placeLevel, placeOfLevel, placementOf, projectTower, removeFlat, removeLevel, sheetOffset, syncUnit } from '../data/building/projects'
import { baseLevel, coverOf, levelName, roleIn, topFloor } from '../data/building'
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
