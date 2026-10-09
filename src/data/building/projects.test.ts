/** Project first (founder 2026-10-05): the floors said first, any drawing on any floor. The older flows: three/building.test.ts. */
import { describe, expect, test } from 'vitest'
import type { Unit } from '../../core'
import { drawingName, makeProject, newProject, parseFloors, planOf, projectTower, removeDrawing, setSlot, slotsOf, type Project, type Slot } from './projects'

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
