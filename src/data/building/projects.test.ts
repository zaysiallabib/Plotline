/** Project first (founder 2026-10-05): the floors said first, any drawing on any floor. The older flows: three/building.test.ts. */
import { describe, expect, test } from 'vitest'
import type { Unit } from '../../core'
import { drawingName, forkFloor, keepReview, makeProject, newProject, parseFloors, parseProjects, planOf, projectTower, removeDrawing, setSlot, sharedAt, slotsOf, slotsText, type Project, type Slot } from './projects'
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
