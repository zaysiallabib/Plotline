/** Every apartment keeps its own finishes and furniture (founder 2026-11-21): the key, the record, the floors changing, the cloud. */
import { describe, expect, test } from 'vitest'
import type { FurniturePlacement, Unit } from '../../core'
import * as bti from './demo-tower'
import * as sheltech from './sheltech-tower'
import { apartmentKey, buildingOf, drawingOf, finishesKey, keptAt, keptFor, layoutKey, outsideRecord, placesIn, putKept, readFinishes, readLayout, saveFinishes, saveLayout, splitKept } from './apartments'
import { keepApartments, makeProject, newProject, projectTower, setSlot } from './projects'

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), get length() { return m.size }, key: (i: number) => [...m.keys()][i] ?? null, m }
}
/** a drawing: one closed room 10 × 8 m */
const box = (id: string): Unit => {
  const pts = [[0, 0], [10, 0], [10, 8], [0, 8]]
  return {
    id,
    name: id,
    projectName: '',
    northDeg: 0,
    vertices: pts.map(([x, y], i) => ({ id: `${id}-v${i}`, x, y })),
    walls: pts.map((_, i) => ({ id: `${id}-w${i}`, a: `${id}-v${i}`, b: `${id}-v${(i + 1) % 4}`, thicknessM: 0.25, heightM: 3, openings: [] })),
    roomLabels: [{ id: `${id}-l`, name: 'Bedroom', kind: 'bed', x: 5, y: 4 }],
    furniture: [],
    finishSlots: [],
    areaSqft: 0,
  }
}
const bed = (x: number): FurniturePlacement[] => [{ id: 'bed', assetId: 'bed_queen', roomId: 'r', x, y: 3, rotationDeg: 0 }]
const SHELTECH_A = 'unit_sheltech_a_2736'
const keyOn = (t: Parameters<typeof placesIn>[0], id: string, floor?: number) => apartmentKey(id, floor, placesIn(t, id).length)

describe('an apartment: one drawing in one place of its building', () => {
  test('the same drawing on two floors is two apartments; one place keeps the key layouts always had', () => {
    expect(placesIn(sheltech, SHELTECH_A)).toEqual([2, 3, 4, 5, 6])
    expect([keyOn(sheltech, SHELTECH_A, 3), keyOn(sheltech, SHELTECH_A, 4)]).toEqual([`${SHELTECH_A}:3`, `${SHELTECH_A}:4`])
    expect(keyOn(bti, 'unit_type_a_2703', 2)).toBe('unit_type_a_2703') // Type A stands on floor 2 only: the drawing is the apartment
    expect(placesIn(bti, 'unit_type_b_1747')).toEqual([3, 4, 5, 6, 7, 8]) // massing stand-ins (floors 1, 2) are no apartment
    expect(keyOn(sheltech, 'sheltech-ground', 0)).toBe('sheltech-ground') // a level: one place
    expect(apartmentKey(SHELTECH_A, undefined, 5)).toBe(SHELTECH_A) // no floor named (the Studio's Preview 3D): the drawing
    expect([drawingOf(`${SHELTECH_A}:3`), drawingOf('a-m:-2'), drawingOf('a')]).toEqual([SHELTECH_A, 'a-m', 'a'])
  })

  test('the mirrored neighbour on the same floor is its own apartment; a level drawn twice is two', () => {
    const t = projectTower(makeProject('p', box('a'), 2, 4, 'right'))
    expect([placesIn(t, 'a'), placesIn(t, 'a-m')]).toEqual([[2, 3, 4], [2, 3, 4]])
    expect(new Set([keyOn(t, 'a', 3), keyOn(t, 'a-m', 3), keyOn(t, 'a', 4)])).toEqual(new Set(['a:3', 'a-m:3', 'a:4']))
    const b = projectTower([-1, -2].reduce((p, k) => setSlot(p, k, box('b')), newProject('q', 'Tower', { basements: 2, floors: 1, rooftop: false })))
    expect([keyOn(b, 'b', -1), keyOn(b, 'b', -2)]).toEqual(['b:-1', 'b:-2'])
  })
})

describe('saved the moment it changes, shown on the next open', () => {
  test('floor 3 keeps its beige wall and its bed; floor 4 still opens as the drawing (the Studio arranged it)', () => {
    const s = memStore()
    const studio = bed(2)
    saveLayout(SHELTECH_A, studio, undefined, s) // the Studio's tool F: the drawing's own
    saveFinishes(SHELTECH_A, { s_walls: 'white' }, {}, s) // Preview 3D's pick: the drawing's own
    const f3 = keptAt({ id: SHELTECH_A }, 3, sheltech, s)
    expect(f3).toMatchObject({ key: `${SHELTECH_A}:3`, layout: studio, base: studio, finishes: { s_walls: 'white' } })
    saveLayout(f3.key, bed(5), f3.base!, s)
    saveFinishes(f3.key, { s_walls: 'white', 'wall:w1:r1': 'beige' }, f3.baseFinishes, s)
    expect(keptAt({ id: SHELTECH_A }, 3, sheltech, s)).toMatchObject({ layout: bed(5), finishes: { s_walls: 'white', 'wall:w1:r1': 'beige' } })
    expect(keptAt({ id: SHELTECH_A }, 4, sheltech, s)).toMatchObject({ key: `${SHELTECH_A}:4`, layout: studio, finishes: { s_walls: 'white' } })
    // Reset layout: back to the drawing's (the key goes); Reset to included over the drawing's picks is kept as {}
    saveLayout(f3.key, studio, studio, s)
    saveFinishes(f3.key, {}, f3.baseFinishes, s)
    expect([s.getItem(layoutKey(f3.key)), readFinishes(f3.key, s)]).toEqual([null, {}])
    saveFinishes(f3.key, { s_walls: 'white' }, f3.baseFinishes, s) // the same as the drawing's again: follows it
    expect(s.getItem(finishesKey(f3.key))).toBeNull()
    // a drawing in one place IS its apartment: no fallback, the key the Studio's tool F writes
    expect(keptAt({ id: 'unit_type_a_2703' }, 2, bti, s)).toEqual({ key: 'unit_type_a_2703', layout: null, base: null, finishes: {}, baseFinishes: {} })
    expect(readLayout('garbage', s)).toBeNull()
    s.setItem(finishesKey('x'), '[1,2]')
    expect(readFinishes('x', s)).toBeNull()
  })

  test('floors change: a drawing left on one floor keeps what that floor had; one floor to several starts from it', () => {
    const s = memStore()
    const p = [1, 2].reduce((q, k) => setSlot(q, k, box('a')), newProject('p', 'Tower', { basements: 0, floors: 3, rooftop: false }))
    saveLayout('a', bed(1), undefined, s)
    saveLayout('a:1', bed(2), undefined, s)
    saveLayout('a:2', bed(3), undefined, s)
    saveFinishes('a:2', { s: 'beige' }, {}, s)
    const cleared = setSlot(p, 1, null) // floor 1 emptied: the drawing stands on floor 2 only
    keepApartments([p], [cleared], s)
    expect([readLayout('a', s), readFinishes('a', s), s.getItem(layoutKey('a:2'))]).toEqual([bed(3), { s: 'beige' }, null])
    const again = setSlot(cleared, 3, box('a')) // on floors 2 and 3: nothing moves, floor 3 starts from the drawing (floor 2's)
    keepApartments([cleared], [again], s)
    expect(keptAt({ id: 'a' }, 3, projectTower(again), s)).toMatchObject({ key: 'a:3', layout: bed(3), finishes: { s: 'beige' } })
    keepApartments([again], [{ ...again, name: 'Renamed' }], s) // not a change of floors: nothing to do
    expect(readLayout('a', s)).toEqual(bed(3))
  })
})

describe('the cloud: the records travel inside the project JSON', () => {
  test('gathered for its drawings (mirrored too) and put back on another computer; a reset elsewhere stays reset; an old copy changes nothing', () => {
    const here = memStore()
    saveLayout('a', bed(1), undefined, here)
    saveLayout('a:2', bed(2), undefined, here)
    saveFinishes('a-m:2', { s: 'teak' }, {}, here)
    saveFinishes('sheltech-b1', { s: 'x' }, {}, here) // another drawing whose name starts the same
    saveLayout('zz:3', bed(9), undefined, here)
    const recs = keptFor(['a', 'sheltech-b'], here)
    expect(recs).toEqual({ a: { furniture: bed(1) }, 'a:2': { furniture: bed(2) }, 'a-m:2': { finishes: { s: 'teak' } } })
    const saved = JSON.parse(JSON.stringify({ id: 'p', units: {}, apartments: recs }))
    const { data, apartments } = splitKept(saved)
    expect([data, apartments]).toEqual([{ id: 'p', units: {} }, recs])
    const there = memStore()
    saveLayout('a:3', bed(7), undefined, there) // reset on the first computer since: gone here too
    saveLayout('zz:3', bed(8), undefined, there)
    putKept(['a'], apartments!, there)
    expect(keptFor(['a'], there)).toEqual(recs)
    expect(readLayout('zz:3', there)).toEqual(bed(8)) // another project's: untouched
    expect(splitKept({ id: 'p', units: {} })).toEqual({ data: { id: 'p', units: {} } }) // saved before records: nothing to put
  })
})

describe("the building's outside: one record for the whole building (session 31 facade)", () => {
  test('a project keeps it under its own id, a built-in tower under its first flat, a lone flat under its id; the cloud carries it', () => {
    const p = projectTower(makeProject('proj', box('a'), 2, 4, 'right'))
    expect([buildingOf(p, 'a'), buildingOf(p, 'a-m'), buildingOf(bti, 'unit_type_b_1747'), buildingOf(null, 'lone')]).toEqual(['proj', 'proj', 'type-a', 'lone'])
    expect(outsideRecord('proj')).toBe('proj:outside')
    expect(drawingOf(outsideRecord('proj'))).toBe('proj')
    const here = memStore()
    saveFinishes(outsideRecord('proj'), { s_outside: 'fo_out_brick_red' }, {}, here)
    saveFinishes(outsideRecord('lone'), { s_frames: 'fo_frame_black' }, {}, here)
    const recs = keptFor(['a', 'proj'], here)
    expect(recs).toEqual({ 'proj:outside': { finishes: { s_outside: 'fo_out_brick_red' } } })
    const there = memStore()
    putKept(['a', 'proj'], recs, there)
    expect(readFinishes(outsideRecord('proj'), there)).toEqual({ s_outside: 'fo_out_brick_red' })
    expect(keptFor(['lone'], here)).toEqual({ 'lone:outside': { finishes: { s_frames: 'fo_frame_black' } } }) // a lone drawing's own cloud copy
  })
})
