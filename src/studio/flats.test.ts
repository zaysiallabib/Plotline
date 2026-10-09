/**
 * Flats derived from real drawings (core.deriveFlats, founder 2026-10-06), loaded as the Studio loads a file (load-unit:
 * normalize + Join walls). Sheltech Level 2 as ONE whole-floor drawing: the two hand-traced flats (sheltech-a / -b, one
 * sheet, one origin) put together — their shared lift lobby joined by the Studio's own Join walls. The founder's own
 * auto-trace drafts of one flat: one flat each.
 */
import { describe, expect, test } from 'vitest'
import { deriveFlats, deriveRooms, isCore, sqmToSqft, validate } from '../core'
import type { Unit } from '../core'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import founder1006 from '../data/fixtures/founder-autotrace-type-a-2026-10-06.json'
import founder1003 from '../data/fixtures/founder-sheltech-a-draft.json'
import { initialState, reducer } from './model'

const load = (u: Unit) => reducer(initialState(), { type: 'load-unit', unit: u }).unit

/** Sheltech Level 2, both flats in one drawing (B's ids prefixed; its copy of the shared lobby's label left out). */
function sheltechLevel2(): Unit {
  const a = sheltechA as unknown as Unit
  const b = sheltechB as unknown as Unit
  const p = (id: string) => `b-${id}`
  return load({
    ...a,
    id: 'sheltech-l2-floor',
    name: 'Level 2',
    areaSqft: 0,
    vertices: [...a.vertices, ...b.vertices.map((v) => ({ ...v, id: p(v.id) }))],
    walls: [...a.walls, ...b.walls.map((w) => ({ ...w, id: p(w.id), a: p(w.a), b: p(w.b), openings: w.openings.map((o) => ({ ...o, id: p(o.id) })) }))],
    roomLabels: [...a.roomLabels, ...b.roomLabels.filter((l) => l.name !== 'Lobby').map((l) => ({ ...l, id: p(l.id) }))],
    pillars: [...(a.pillars ?? []), ...(b.pillars ?? []).map((q) => ({ ...q, id: p(q.id) }))],
    furniture: [],
    finishSlots: [],
  })
}

describe('flats of real drawings', () => {
  test('Sheltech Level 2 as one drawing: Flat 1 = its Type B (west), Flat 2 = Type A (east), the lobby / lifts / stair in neither', () => {
    const u = sheltechLevel2()
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
    const rooms = deriveRooms(u)
    const flats = deriveFlats(u, rooms)
    const name = (id: string) => rooms.find((r) => r.id === id)!.name
    expect(rooms.length).toBe(40)
    expect(flats.map((f) => f.name)).toEqual(['Flat 1', 'Flat 2'])
    // each flat is exactly its hand-traced flat's rooms (A's ids as they are, B's prefixed)
    const own = (f: (typeof flats)[number]) => [...new Set(f.roomIds.map((id) => (id.startsWith('b-') ? 'B' : 'A')))]
    expect(flats.map(own)).toEqual([['B'], ['A']])
    expect(flats[0].roomIds.map(name).sort()).toEqual(['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4', 'Dining', 'Foyer', 'Kitchen', 'Living', 'PDR', 'Toilet', 'Toilet 1', 'Toilet 2', 'Toilet 3', 'Veranda (kitchen)', 'Veranda 1', 'Veranda 4'])
    expect(flats[1].roomIds.map(name).sort()).toEqual(['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4', 'Dining', 'Foyer', 'Kitchen', 'Living', 'PDR', 'Passage', 'Toilet', 'Toilet 1', 'Toilet 2', 'Toilet 3', 'Veranda (kitchen)', 'Veranda 1', 'Veranda 4'])
    expect(rooms.filter(isCore).map((r) => r.name).sort()).toEqual(['Lifts', 'Lobby', 'Stair'])
    // loose: the four planters (behind 0.45 m planter edges or windows, no door) — in no flat until he moves them
    const inFlat = new Set(flats.flatMap((f) => f.roomIds))
    expect(rooms.filter((r) => !inFlat.has(r.id) && !isCore(r)).map((r) => r.name).sort()).toEqual(['Planter (east)', 'Planter (south)', 'Planter (south)', 'Planter (west)'])
    // centre-line room areas: ≈ 1860 sft a flat against the printed ±2736 (walls, the planters and a share of the core are in that)
    expect(flats.map((f) => Math.round(sqmToSqft(f.areaSqm)))).toEqual([1860, 1857])
  })

  test('named as the sheet prints them ("TYPE-B (L/L) ±2736 SFT" in the west dining, "TYPE-A ±2736 SFT" in the east): Type B, Type A', () => {
    const u = sheltechLevel2()
    const at = (id: string) => u.roomLabels.find((l) => l.id === id)!
    u.roomLabels.push({ id: 'tb', name: 'TYPE-B (L/L) ±2736 SFT', kind: 'other', x: at('b-r_dining').x, y: at('b-r_dining').y - 0.6 })
    u.roomLabels.push({ id: 'ta', name: 'TYPE-A ±2736 SFT', kind: 'other', x: at('r_dining').x, y: at('r_dining').y - 0.6 })
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
    const rooms = deriveRooms(u)
    expect(rooms.length).toBe(40)
    expect(deriveFlats(u, rooms).map((f) => [f.name, f.roomIds.length, f.printedSqft])).toEqual([
      ['Type B', 16, 2736],
      ['Type A', 17, 2736],
    ])
  })

  test('the same drawing as each hand-traced flat alone: one flat, its lobby and stair / lifts in none', () => {
    for (const u of [sheltechA, sheltechB] as unknown as Unit[]) {
      const flats = deriveFlats(u, deriveRooms(u))
      expect(flats.map((f) => f.name)).toEqual(['Flat 1'])
    }
  })

  test('the Flat pick: a room moved to the other flat by its label (one undo step), and back to "by its doors"', () => {
    const s0 = reducer(initialState(), { type: 'load-unit', unit: sheltechLevel2() })
    const bed2 = s0.unit.roomLabels.find((l) => l.id === 'b-r_bed2')!
    expect(bed2.name).toBe('Bed 2')
    const s1 = reducer(s0, { type: 'update-label', id: bed2.id, patch: { flat: 'Flat 2' } })
    const flats = (u: Unit) => deriveFlats(u, deriveRooms(u))
    expect(flats(s1.unit)[1].roomIds).toContain(bed2.id)
    expect(flats(s1.unit)[0].roomIds).not.toContain(bed2.id)
    expect(reducer(s1, { type: 'undo' }).unit).toEqual(s0.unit)
    const s2 = reducer(s1, { type: 'update-label', id: bed2.id, patch: { flat: undefined } })
    expect('flat' in s2.unit.roomLabels.find((l) => l.id === bed2.id)!).toBe(false)
    expect(flats(s2.unit)).toEqual(flats(s0.unit))
  })

  test("the founder's auto-trace drafts of Type A: one flat each", () => {
    for (const raw of [founder1006, founder1003] as unknown as Unit[]) {
      const u = load(raw)
      const rooms = deriveRooms(u)
      const flats = deriveFlats(u, rooms)
      expect(flats.map((f) => f.name)).toEqual(['Flat 1'])
    }
    // 2026-10-06: "Bedroom 2" has no door in the draft, so it stands alone — loose, not a flat of its own
    const u = load(founder1006 as unknown as Unit)
    const rooms = deriveRooms(u)
    const bed2 = rooms.find((r) => r.name === 'Bedroom 2')!
    expect(deriveFlats(u, rooms)[0].roomIds).not.toContain(bed2.id)
  })
})
