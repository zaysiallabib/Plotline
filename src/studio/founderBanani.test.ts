/**
 * The founder's own Banani Unit A draft (2026-10-09 night, live site, 67 minutes by hand: 108 walls, 17 labels, 12
 * columns). Bed-02, M Bed and the living / dining would not close because their walls end on columns, and the checker
 * showed nothing wrong (an end inside a column was forgiven) — so he drew TEN short pieces inside columns (each with both
 * ends in one column) to glue the walls together. Counted 2026-10-09:
 *   his draft as saved .................................. before this rule 17 of 17 labels in a closed room, 20 faces
 *   without his ten pieces inside columns ............... before: 12 of 17 (Toilet, Bed 3, Master bed, Bed 2, greens open)
 *                                                         and NO loose end anywhere (validate quiet); now: 17 of 17
 *   now, his draft as saved ............................. 17 of 17, 21 faces (the unnamed S.Bed / S.Toilet corner closes
 *                                                         too: its two walls end in the column at (0.16, 13.69))
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms, validate } from '../core'
import type { Pt, Unit } from '../core'
import draft from '../data/fixtures/founder-banani-unit-a-2026-10-09.json'
import { initialState, reducer } from './model'

const his = draft as unknown as Unit
const closed = (u: Unit) => {
  const rooms = deriveRooms(u)
  return u.roomLabels.filter((l) => rooms.some((r) => r.id === l.id)).length
}
const loose = (u: Unit) => validate(u).filter((i) => i.code === 'dangling-vertex').length
/** his draft without the pieces he drew inside columns (both ends in one column's block) */
const withoutGlue = (u: Unit): Unit => {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const col = (p: Pt) => (u.pillars ?? []).find((c) => Math.abs(p.x - c.x) <= c.wM / 2 + 1e-6 && Math.abs(p.y - c.y) <= c.hM / 2 + 1e-6)
  const walls = u.walls.filter((w) => {
    const a = col(V.get(w.a)!)
    return !a || a !== col(V.get(w.b)!)
  })
  const used = new Set(walls.flatMap((w) => [w.a, w.b]))
  return { ...u, walls, vertices: u.vertices.filter((v) => used.has(v.id)) }
}

describe("founder's Banani Unit A draft (2026-10-09): walls ending on columns close the rooms", () => {
  it('his draft as saved: every one of his 17 labels in a closed room, no loose end', () => {
    expect(his.walls).toHaveLength(108)
    expect(his.pillars).toHaveLength(12)
    expect(closed(his)).toBe(17)
    expect(deriveRooms(his)).toHaveLength(21)
    expect(loose(his)).toBe(0)
  })
  it('without the ten pieces he drew inside columns: still 17 of 17 (was 12), no loose end', () => {
    const u = withoutGlue(his)
    expect(u.walls).toHaveLength(98)
    expect(closed(u)).toBe(17)
    expect(loose(u)).toBe(0)
  })
  it('loaded in the Studio (load = Join walls): still 17 of 17, with and without his pieces', () => {
    for (const u of [his, withoutGlue(his)]) {
      const s = reducer(initialState(), { type: 'load-unit', unit: u })
      expect(closed(s.unit)).toBe(17)
      expect(loose(s.unit)).toBe(0)
    }
  })
})
