/** Project first (founder 2026-10-05): the floors said first, any drawing on any floor. The older flows: three/building.test.ts. */
import { describe, expect, test } from 'vitest'
import type { Unit } from '../../core'
import { alignPlans, stackFloors, drawingName, forkFloor, keepReview, makeProject, newProject, parseFloors, parseProjects, planOf, projectTower, removeDrawing, setSlot, sharedAt, slotsOf, slotsText, type Project, type Slot } from './projects'
import { initialState } from '../../studio/model'
import { studioReducer, type Review } from '../../studio/review'

/** a drawing: one closed room w × h m */
const box = (id: string, w = 10, h = 8): Unit => {
  const pts = [[0, 0], [w, 0], [w, h], [0, h]]
  return {
    id,
    name: id,
    projectName: '',
    northDeg: 0,
    vertices: pts.map(([x, y], i) => ({ id: `${id}-v${i}`, x, y })),
    walls: pts.map((_, i) => ({ id: `${id}-w${i}`, a: `${id}-v${i}`, b: `${id}-v${(i + 1) % 4}`, thicknessM: 0.25, heightM: 3, openings: [] })),
    roomLabels: [{ id: `${id}-l`, name: 'Living', kind: 'living', x: w / 2, y: h / 2 }],
    furniture: [],
    finishSlots: [],
    areaSqft: 0,
  }
}
const put = (p: Project, slots: Slot[], u: Unit | null) => slots.reduce((q, s) => setSlot(q, s, u), p)
const rows = (p: Project) => slotsOf(p).map((r) => `${r.label}:${r.unitIds.join('+')}`)

describe('project first: floors said first, any drawing on any floor', () => {
  const empty = newProject('p', 'Tower', { basements: 2, floors: 6, rooftop: true })

  test('the floor list top to bottom; an empty project draws as nothing (no NaN plot)', () => {
    expect(rows(empty)).toEqual(['Rooftop:', 'Floor 6:', 'Floor 5:', 'Floor 4:', 'Floor 3:', 'Floor 2:', 'Floor 1:', 'Ground floor:', 'Basement 1:', 'Basement 2:'])
    const t = projectTower(empty)
    expect(t.FLOORS).toEqual([])
    expect(t.FLATS).toEqual({})
    expect(t.GROUND.plot.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true)
    // only a ground floor drawn: it stands at 0, the plot round it
    const g = projectTower(setSlot(empty, 0, box('g', 20, 30)))
    expect(g.FLOORS).toEqual([{ floor: 0, flats: [], standIns: ['g'] }])
    expect(g.LEVELS).toEqual({ g: 0 })
    expect(g.GROUND.plot[2]).toEqual({ x: 22, y: 32 })
  })

  test('one drawing on floors 2, 4, 6-8, another on 3 and 5; a floor changed inside a range splits it; cleared drawings stay', () => {
    const a = box('a'), b = box('b')
    let p = newProject('p', 'Tower', { basements: 0, floors: 9, rooftop: false })
    p = put(put(p, parseFloors('2, 4, 6-8')!, a), [3, 5], b)
    expect(p.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['2-2:a', '3-3:b', '4-4:a', '5-5:b', '6-8:a'])
    expect(rows(p).slice(0, 9)).toEqual(['Floor 9:', 'Floor 8:a', 'Floor 7:a', 'Floor 6:a', 'Floor 5:b', 'Floor 4:a', 'Floor 3:b', 'Floor 2:a', 'Floor 1:'])
    p = setSlot(p, 7, b)
    expect(p.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['2-2:a', '3-3:b', '4-4:a', '5-5:b', '6-6:a', '7-7:b', '8-8:a'])
    p = put(p, [2, 4, 6, 8], null)
    expect(p.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['3-3:b', '5-5:b', '7-7:b'])
    expect(Object.keys(p.flats)).toEqual(['b']) // a is on no floor …
    expect(p.units.a).toBe(a) // … but still one of his drawings
    // the tower: 9 floors tall as said, floors without a drawing standing in with the nearest below (else above)
    const t = projectTower(p)
    expect(t.FLOORS.map((f) => [f.floor, f.flats.join(), (f.standIns ?? []).join()])).toEqual([
      [0, '', 'b'], // no columns drawn: its shell under the lowest flats
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => ([3, 5, 7].includes(k) ? [k, 'b', ''] : [k, '', 'b'])),
    ])
  })

  test('levels: the same drawing on B1 and B2, and one drawing on a floor and the ground — each place its own stem', () => {
    const park = box('park', 30, 30), g = box('g', 30, 30), a = box('a'), r = box('r', 6, 6)
    let p = put(empty, [-1, -2], park)
    p = put(setSlot(setSlot(p, 2, a), 0, a), ['R'], r)
    expect(rows(p)).toEqual(['Rooftop:r', 'Floor 6:', 'Floor 5:', 'Floor 4:', 'Floor 3:', 'Floor 2:a', 'Floor 1:', 'Ground floor:a', 'Basement 1:park', 'Basement 2:park'])
    const t = projectTower(p)
    expect(t.LEVELS).toEqual({ park: -1, 'park@-2': -2, 'a@0': 0, r: 7 })
    expect(t.FLATS['park@-2'].unit).toBe(park)
    expect(t.FLOORS.map((f) => [f.floor, f.flats.join(), (f.standIns ?? []).join()])).toEqual([
      [-2, '', 'park@-2'],
      [-1, '', 'park'],
      [0, '', 'a@0'],
      [1, '', 'a'],
      [2, 'a', ''],
      [3, '', 'a'],
      [4, '', 'a'],
      [5, '', 'a'],
      [6, '', 'a'],
      [7, '', 'r'],
    ])
    // the ground floor takes another drawing: one ground; cleared: none
    expect(rows(setSlot(p, 0, g))[7]).toBe('Ground floor:g')
    expect(rows(setSlot(p, 0, null))[7]).toBe('Ground floor:')
    // deleting a drawing takes it off every floor
    const d = removeDrawing(p, 'park')
    expect(rows(d).slice(-2)).toEqual(['Basement 1:', 'Basement 2:'])
    expect(d.units.park).toBeUndefined()
    expect(rows(removeDrawing(p, 'a'))[5]).toBe('Floor 2:')
  })

  test('new drawings are named Floor plan A, Floor plan B … on floors, after the level elsewhere', () => {
    expect(drawingName(empty, 3)).toBe('Floor plan A')
    expect(drawingName(setSlot(empty, 3, { ...box('x'), name: 'Floor plan A' }), 5)).toBe('Floor plan B')
    expect([drawingName(empty, 0), drawingName(empty, -2), drawingName(empty, 'R')]).toEqual(['Ground floor', 'Basement 2', 'Rooftop'])
  })

  test('"2, 4, 6-8" → floor numbers', () => {
    expect(parseFloors('2, 4, 6-8')).toEqual([2, 4, 6, 7, 8])
    expect(parseFloors('8 – 6 , 2 2')).toEqual([2, 6, 7, 8])
    expect(parseFloors('')).toEqual([])
    expect(parseFloors('2, G')).toBeNull()
    expect(parseFloors('1-5000')).toBeNull()
  })

  test('an older project (made from one flat) reads as a floor list too', () => {
    const p = makeProject('q', box('a'), 2, 7, 'right')
    expect(planOf(p)).toEqual({ basements: 0, floors: 7, rooftop: false })
    expect(rows(p).slice(0, 2)).toEqual(['Floor 7:a', 'Floor 6:a'])
    // a floor of it given another drawing: the range splits, the mirrored neighbour stays on the others
    const q = setSlot(p, 4, box('b'))
    expect(q.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['2-3:a,a-m', '4-4:b', '5-7:a,a-m'])
  })
})

describe('one floor on its own: a drawing on floors 1-4, floor 2 forked (founder 2026-11-20)', () => {
  const a = box('a')
  a.walls[0].openings.push({ id: 'a-win', kind: 'window', offsetM: 2, widthM: 1.5, heightM: 1.2, sillM: 0.9 })
  const p0 = { ...put(newProject('p', 'Tower', { basements: 1, floors: 4, rooftop: true }), [1, 2, 3, 4], a), elevations: { '0': 0, '1': 3.2 } }

  test('the drawing stays on the other floors; floor 2 gets a deep copy with a new unit id and the same wall / opening ids', () => {
    const p = forkFloor(p0, 2, 'a', 'f')
    expect(rows(p).slice(1, 5)).toEqual(['Floor 4:a', 'Floor 3:a', 'Floor 2:f', 'Floor 1:a'])
    expect(p.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['1-1:a', '2-2:f', '3-4:a'])
    const f = p.units.f
    expect([f.id, f.name, f.floor]).toEqual(['f', 'a · floor 2', 2])
    expect(f.walls.map((w) => w.id)).toEqual(a.walls.map((w) => w.id)) // ids are per unit: kept (see forkFloor)
    expect(f.walls[0].openings[0].id).toBe('a-win')
    expect(f.walls).not.toBe(a.walls) // a deep copy: changing one never touches the other
    expect(f.walls[0].openings).not.toBe(a.walls[0].openings)
    expect(p.units.a).toBe(a)
    expect([p.plan, p.elevations]).toEqual([p0.plan, p0.elevations])
    // the Building view draws floor 2 from the copy: its own openings (one window taken out there only)
    const q = { ...p, units: { ...p.units, f: { ...f, walls: f.walls.map((w) => ({ ...w, openings: [] })) } } }
    const t = projectTower(q)
    expect(t.FLOORS.filter((x) => x.floor >= 1).map((x) => `${x.floor}:${x.flats}`)).toEqual(['1:a', '2:f', '3:a', '4:a'])
    expect(t.FLATS.f.unit.walls[0].openings).toEqual([])
    expect(t.FLATS.a.unit.walls[0].openings.map((o) => o.id)).toEqual(['a-win'])
    // forking a floor it is not on, or a drawing it does not have: nothing changes
    expect(forkFloor(p, 2, 'a', 'g')).toBe(p)
    expect(forkFloor(p, 3, 'nope', 'g')).toBe(p)
  })

  test('the copy says where its drawing came from (session 31 frame: the floor list shows it)', () => {
    const p = forkFloor({ ...p0, from: { a: { kind: 'set', line: 'from page 7 · 2ND FLOOR PLAN · 1 : 48' } } }, 2, 'a', 'f')
    expect(p.from?.f).toEqual({ kind: 'set', line: 'from page 7 · 2ND FLOOR PLAN · 1 : 48' })
    expect(p.from?.a).toEqual(p.from?.f)
    expect(forkFloor(p0, 2, 'a', 'f').from).toBeUndefined() // (an older project has none)
  })

  test('an older project: the mirrored neighbour comes along, where it stood', () => {
    const p = forkFloor(makeProject('q', box('a'), 2, 7, 'right'), 4, 'a', 'f')
    expect(p.floors.map((g) => `${g.from}-${g.to}:${g.flats}`)).toEqual(['2-3:a,a-m', '4-4:f,f-m', '5-7:a,a-m'])
    expect(p.flats['f-m']).toEqual({ unitId: 'f', offset: { x: 0, y: 0 }, mirror: 'right' })
    expect(projectTower(p).FLATS['f-m'].unit.id).toBe('f-m')
    // only on one floor (its top one forked too): the old stem goes, the drawing with it (an older project keeps only what it uses)
    const one = forkFloor(makeProject('r', box('a'), 2, 2, 'none'), 2, 'a', 'f')
    expect([Object.keys(one.flats), Object.keys(one.units)]).toEqual([['f'], ['f']])
  })

  test('a level: the same drawing on both basements, basement 2 forked', () => {
    const park = box('park', 30, 30)
    const two = put(newProject('p', 'T', { basements: 2, floors: 2, rooftop: false }), [-1, -2], park)
    const q = forkFloor(two, -2, 'park', 'f')
    expect(rows(q).slice(-2)).toEqual(['Basement 1:park', 'Basement 2:f'])
    expect(q.units.f.name).toBe('park · basement 2')
    expect(q.units.f.floor).toBeUndefined()
  })

  test('the question: asked only on a floor whose drawing is on another floor too', () => {
    const b = box('b')
    const p = setSlot(p0, 3, b)
    expect(sharedAt([p], 'a', 2)).toEqual({ p, unitId: 'a', slots: [4, 2, 1] })
    expect(sharedAt([p], 'b', 3)).toBeNull() // b is only on floor 3
    expect(sharedAt([p], 'a', 3)).toBeNull() // not on floor 3
    expect(sharedAt([forkFloor(p, 2, 'a', 'f')], 'f', 2)).toBeNull() // forked: on its own
    expect(sharedAt([makeProject('q', box('m'), 2, 3, 'left')], 'm-m', 3)?.unitId).toBe('m')
    expect(slotsText(['R', 4, 0, -1, 2])).toBe('B1, G, 2, 4, Roof')
  })
})

describe('the Check these list kept with each drawing (manual walk s31: it went when another floor was opened and back)', () => {
  const u = box('floor-plan-a')
  const p = setSlot(newProject('p', 'Tower', { basements: 0, floors: 4, rooftop: false }), 2, u)
  // Auto-trace gave the drawing a new id: the list names that one (review.unitId), the project keeps it under the drawing's
  const r = { unitId: 'traced', items: [{ id: 'r1', at: { x: 1, y: 2 }, kind: 'other', message: 'Bath 3: its printed size could not be read — type it' }], stats: { walls: 4, rooms: 1, labelled: 1 } } as unknown as Review

  test('kept with its drawing, saved and read back as the browser stores it, opened again on the drawing', () => {
    const ps = keepReview([p], u.id, r)!
    expect(ps[0].reviews?.[u.id]).toEqual(r)
    expect(keepReview(ps, u.id, r)).toBeNull() // nothing changed: no save
    const back = parseProjects(JSON.stringify(ps))[0]
    expect(back.reviews?.[u.id]).toEqual(r)
    // the Studio opens the drawing (load-unit) and gets its rows back, bound to the drawing as it opened
    const s = studioReducer(studioReducer(initialState(), { type: 'load-unit', unit: back.units[u.id] }), { type: 'keep-review', review: back.reviews![u.id] })
    expect(s.review?.unitId).toBe(s.unit.id)
    expect(s.review?.items.map((i) => i.message)).toEqual(['Bath 3: its printed size could not be read — type it'])
  })

  test('an emptied list, or the drawing deleted, takes its rows with it; a drawing in no project keeps none', () => {
    const ps = keepReview([p], u.id, r)!
    expect(keepReview(ps, u.id, null)![0].reviews).toEqual({})
    expect(keepReview(ps, u.id, { ...r, items: [] })![0].reviews).toEqual({})
    expect(removeDrawing(ps[0], u.id).reviews).toEqual({})
    expect(keepReview([p], 'not-in-it', r)).toBeNull()
  })
})

describe("a set's floors stacked on what they share (session 31 levels: each drawing was placed by its own frame)", () => {
  /** a floor: an outer box w × h, a stair core 2.6 × 5 m at (cx, cy), and its own partitions; everything moved by (dx, dy) */
  const floor = (id: string, d: { x: number; y: number }, parts: [number, number, number, number][], w = 12, h = 9, core = { x: 4, y: 2 }): Unit => {
    const lines: [number, number, number, number][] = [
      [0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0],
      [core.x, core.y, core.x + 2.6, core.y], [core.x + 2.6, core.y, core.x + 2.6, core.y + 5], [core.x + 2.6, core.y + 5, core.x, core.y + 5], [core.x, core.y + 5, core.x, core.y],
      ...parts,
    ]
    const u = box(id)
    u.vertices = lines.flatMap(([x0, y0, x1, y1], i) => [{ id: `${id}-a${i}`, x: x0 + d.x, y: y0 + d.y }, { id: `${id}-b${i}`, x: x1 + d.x, y: y1 + d.y }])
    u.walls = lines.map((_, i) => ({ id: `${id}-w${i}`, a: `${id}-a${i}`, b: `${id}-b${i}`, thicknessM: 0.2, heightM: 3, openings: [] }))
    return u
  }
  test('the upper floor (its own frame, other partitions) lands on the ground floor: its shift back, to the millimetre', () => {
    const ground = floor('g', { x: 0, y: 0 }, [[7, 0, 7, 9], [7, 4.5, 12, 4.5]])
    const upper = floor('f1', { x: -3.25, y: 1.7 }, [[2, 0, 2, 9], [9, 3, 12, 3], [9, 3, 9, 9]])
    const a = alignPlans(ground, upper)!
    expect(a.by).toBe('walls')
    expect(a.offset.x).toBeCloseTo(3.25, 3)
    expect(a.offset.y).toBeCloseTo(-1.7, 3)
    expect(a.errM).toBeLessThan(0.001)
    expect(a.share).toBeGreaterThan(0.6)
  })
  test('a floor that shares nothing with it is not placed; columns, when both have them, place it first', () => {
    const ground = floor('g', { x: 0, y: 0 }, [])
    const other: Unit = { ...box('o', 3, 2), vertices: box('o', 3, 2).vertices.map((v) => ({ ...v, x: v.x + 0.37, y: v.y + 0.61 })) }
    expect(alignPlans(ground, other)).toBeNull()
    const cols = (d: number) => [[0, 0], [6, 0], [12, 0], [0, 9], [12, 9]].map(([x, y], i) => ({ id: `c${i}`, x: x + d, y: y + d, wM: 0.4, hM: 0.4 }))
    // columns propose a shift the walls then judge; with no walls drawn (a column layout) the columns place it
    expect(alignPlans({ ...ground, walls: [], pillars: cols(0) }, { ...other, walls: [], pillars: cols(-2) })).toMatchObject({ by: 'columns', offset: { x: 2, y: 2 } })
  })
  test("the files' own frame (one CAD model) wins when its walls fit nearly as well as the best shift: it is exact, not refined", () => {
    const ground = floor('g', { x: 0, y: 0 }, [[7, 0, 7, 9]])
    const upper = floor('f1', { x: -3.25, y: 1.7 }, [[2, 0, 2, 9]])
    // the model says 4 cm more: the same walls, 4 cm apart (the upper floor's walls drawn a little off its lower ones)
    expect(alignPlans(ground, upper, { x: 3.29, y: -1.7 })).toMatchObject({ by: 'frame', offset: { x: 3.29, y: -1.7 } })
    // a frame far off (another page's placement): the walls decide
    expect(alignPlans(ground, upper, { x: 8, y: 8 })).toMatchObject({ by: 'walls' })
  })
  test('a stack of floors: each finds the floor it shares most with (the roof its top floor, not the ground); a stranger stays put', () => {
    const ground = floor('g', { x: 0, y: 0 }, [[7, 0, 7, 9]], 16, 9) // a wider ground floor (a shop front)
    const upper = floor('f1', { x: 1, y: 1 }, [[2, 0, 2, 9]])
    const top = floor('f2', { x: -2, y: 0.5 }, [[2, 0, 2, 9], [9, 3, 12, 3]])
    // (a plan drawn another way up — turned 30°: nothing of it lies along the others' walls)
    const other: Unit = { ...box('o', 6, 4), vertices: box('o', 6, 4).vertices.map((v) => ({ ...v, x: v.x * Math.cos(0.52) - v.y * Math.sin(0.52), y: v.x * Math.sin(0.52) + v.y * Math.cos(0.52) })) }
    const st = stackFloors([{ unit: ground }, { unit: upper }, { unit: top }, { unit: other }])
    expect(st[0]).toMatchObject({ offset: { x: 0, y: 0 } })
    expect(st[1]!.offset.x).toBeCloseTo(-1, 3)
    expect(st[1]!.offset.y).toBeCloseTo(-1, 3)
    expect(st[2]!.offset.x).toBeCloseTo(2, 3)
    expect(st[2]!.offset.y).toBeCloseTo(-0.5, 3)
    expect(st[2]!.on).toBe(1) // on floor 1, which it shares most with
    expect(st[3]).toBeNull()
    // the set added to a project that has its ground floor already (at its own place in the building): the set's floors stack on it
    const added = stackFloors([{ unit: ground, at: { x: 5, y: 5 } }, { unit: upper }])
    expect(added[0]!.offset).toEqual({ x: 5, y: 5 })
    expect(added[1]!.offset.x).toBeCloseTo(4, 3)
    expect(added[1]!.offset.y).toBeCloseTo(4, 3)
  })
  test('a drawing put on its floors at its place: a floor of flats and a level both carry it, the tower draws it there', () => {
    const p0 = newProject('p', 'House', { basements: 0, floors: 2, rooftop: true })
    const g = box('g'), f = box('f'), r = box('r')
    const p = setSlot(setSlot(setSlot(p0, 0, g), 1, f, { x: 1.5, y: -2 }), 'R', r, { x: 0.5, y: 0.25 })
    expect(p.flats.f.offset).toEqual({ x: 1.5, y: -2 })
    expect(p.levels!.find((l) => l.kind === 'rooftop')!.offset).toEqual({ x: 0.5, y: 0.25 })
    const t = projectTower(p)
    expect(t.FLATS.f.offset).toEqual({ x: 1.5, y: -2 })
    expect(t.FLATS.r.offset).toEqual({ x: 0.5, y: 0.25 })
    // the same drawing on floor 2 too keeps the place it was given
    expect(setSlot(p, 2, f).flats.f.offset).toEqual({ x: 1.5, y: -2 })
  })
})

describe("a 3D model dropped on a drawing stands on the street (session 31 ifcmap: Shell.street)", () => {
  test('on the floor its drawing stands on it sits that floor lower; a shape of a storey of its own (an IFC) keeps its own', () => {
    const shell = { id: 'glb', name: 'model', baseY: 0, offset: { x: 5, y: 4 } }
    let p = newProject('p', 'Tower', { basements: 0, floors: 3, rooftop: false })
    p = setSlot(p, 2, { ...box('a'), shell: { ...shell, street: true } })
    p = setSlot(p, 3, { ...box('b'), shell: { ...shell, baseY: 1.5 } })
    const t = projectTower(p)
    expect(t.FLATS.a.unit.shell?.baseY).toBeCloseTo(2 * t.FLOOR_M)
    expect(t.FLATS.b.unit.shell?.baseY).toBe(1.5)
  })
})
