import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Configuration, FinishSlot, Room, Unit } from '../core'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import { initialState, normalizeUnit, reducer } from '../studio/model'
import { floorSlotId } from '../three/details'
import { resolveFinishRef } from '../three/materials'
import { FINISH_CATALOG, finishSlotsFor, isLevel } from './finishes'

const HAND = { 'type-a': typeA, 'type-b': typeB, 'type-c': typeC, 'sheltech-a': sheltechA, 'sheltech-b': sheltechB } as unknown as Record<string, Unit>
/** the founder's draft as Preview 3D hands it to the viewer: Studio load (Join walls), then the viewer's normalizeUnit */
const founder = normalizeUnit(reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit)
const TARGETS = ['floor', 'wall', 'ceiling'] as const

/** the slot a room's `target` resolves to (a slot naming the room beats an 'all' slot), as materials.ts picks it */
const slotOf = (slots: FinishSlot[], roomId: string, target: FinishSlot['target']) =>
  slots.find((s) => s.target === target && s.roomIds !== 'all' && s.roomIds.includes(roomId))?.id ??
  slots.find((s) => s.target === target && s.roomIds === 'all')?.id ??
  null

describe('finish catalog', () => {
  it('is structured: fixed unique ids, integer BDT, the default among the options, brand / sku / label filled in', () => {
    const optionIds = FINISH_CATALOG.flatMap((s) => s.options.map((o) => o.id))
    expect(new Set(optionIds).size).toBe(optionIds.length)
    expect(new Set(FINISH_CATALOG.map((s) => s.id)).size).toBe(FINISH_CATALOG.length)
    for (const s of FINISH_CATALOG) {
      expect(s.options.map((o) => o.id)).toContain(s.defaultOptionId)
      for (const o of s.options) {
        expect(Number.isInteger(o.priceDeltaBdt)).toBe(true)
        expect(o.brand && o.sku && o.label).toBeTruthy()
      }
    }
  })

  it.each(Object.keys(HAND))("%s carries exactly the catalog's slots for its kinds (its own room lists), and keeps them", (name) => {
    const u = HAND[name]
    const own = (id: string) => u.finishSlots.find((s) => s.id === id)?.roomIds
    const kinds = new Set(core.deriveRooms(u).map((r) => r.kind))
    // a slot only for kinds the flat has none of (the levels' lobby, gym) is not carried
    const mine = FINISH_CATALOG.filter((s) => own(s.id) || (s.kinds !== 'all' && s.kinds.some((k) => kinds.has(k))))
    expect(FINISH_CATALOG.length - mine.length).toBe(2)
    expect(u.finishSlots).toEqual(mine.map(({ kinds: _, levelKinds: __, ...s }) => ({ ...s, roomIds: own(s.id) })))
    // the viewer resolves a unit with slots to those very slots: what it renders cannot change
    expect(finishSlotsFor(u, core.deriveRooms(u))).toBe(u.finishSlots)
  })

  it("by kind it matches the hand units' own lists but for three choices their author made by name", () => {
    // why the five keep their lists: the powder room is a bath on the living floor, the lift core and the stair are
    // left out of the floors, and Sheltech B's lift core is left unpainted. Kind alone cannot say any of that.
    const diff: string[] = []
    for (const [name, u] of Object.entries(HAND)) {
      const rooms = core.deriveRooms(u)
      const byKind = finishSlotsFor({ ...u, finishSlots: [] }, rooms)
      for (const r of rooms)
        for (const t of TARGETS) {
          const [a, k] = [slotOf(u.finishSlots, r.id, t), slotOf(byKind, r.id, t)]
          if (a !== k) diff.push(`${name} ${r.name} ${t}: ${a} → ${k}`)
        }
    }
    expect(diff.sort()).toEqual(
      [
        'sheltech-a PDR floor: s_floor_living → s_floor_wet',
        'sheltech-a Stair floor: null → s_floor_living',
        'sheltech-b Lifts floor: null → s_floor_living',
        'sheltech-b Lifts wall: null → s_wall_paint',
        'sheltech-b PDR floor: s_floor_living → s_floor_wet',
        'type-a Lift core floor: null → s_floor_living',
        'type-a Powder room floor: s_floor_living → s_floor_wet',
        'type-b Powder room floor: s_floor_living → s_floor_wet',
        'type-b Stair floor: null → s_floor_living',
        'type-c Lift core floor: null → s_floor_living',
        'type-c Powder room floor: s_floor_living → s_floor_wet',
      ].sort(),
    )
  })
})

describe('finishes on a level (by kind, no slots of its own)', () => {
  const levels = Object.entries(import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>)
    .map(([p, u]) => ({ p, u, rooms: core.deriveRooms(u) }))
    .filter(({ rooms }) => isLevel(rooms))
  it('the stair / lift core walks on the lobby floor, never "Living & dining floors"; a lounge keeps it; each slot touches a room', () => {
    expect(levels.length).toBeGreaterThanOrEqual(13)
    for (const { p, u, rooms } of levels) {
      const slots = finishSlotsFor(u, rooms)
      for (const r of rooms.filter((x) => x.kind === 'other')) expect(slotOf(slots, r.id, 'floor'), `${p} ${r.name}`).toBe('s_floor_lobby')
      const living = slots.find((s) => s.id === 's_floor_living')
      if (living) expect((living.roomIds as string[]).every((id) => rooms.find((r) => r.id === id)!.kind !== 'other'), p).toBe(true)
      for (const s of slots) expect(s.roomIds === 'all' ? rooms.some((r) => !core.isOutdoor(r.kind)) : s.roomIds.length > 0, `${p} ${s.id}`).toBe(true)
    }
    // the founder's flat draft (unnamed 'other' spaces) is no level: they stay on the living floor
    expect(isLevel(core.deriveRooms(founder))).toBe(false)
  })
})

describe("finishes on the founder's draft (no slots of its own)", () => {
  const rooms = core.deriveRooms(founder)
  const slots = finishSlotsFor(founder, rooms)

  it('gets the catalog: every closed room a wall and a ceiling finish, every room but a shaft a floor', () => {
    expect(founder.finishSlots).toEqual([])
    expect(slots.map((s) => s.id)).toEqual(FINISH_CATALOG.map((s) => s.id).filter((id) => id !== 's_floor_lobby' && id !== 's_floor_gym'))
    expect(rooms.some((r) => r.name.startsWith('Space'))).toBe(true) // unnamed closed spaces are covered too
    for (const r of rooms) {
      expect(slotOf(slots, r.id, 'wall'), r.name).not.toBeNull()
      expect(slotOf(slots, r.id, 'ceiling'), r.name).toBe('s_ceiling')
      expect(slotOf(slots, r.id, 'floor') === null, r.name).toBe(r.kind === 'shaft')
    }
  })

  it('keeps its slot and option ids through an edit and a re-publish', () => {
    const edited = normalizeUnit(JSON.parse(JSON.stringify({ ...founder, name: 'Renamed', roomLabels: founder.roomLabels.slice(1) })))
    const again = finishSlotsFor(edited, core.deriveRooms(edited))
    const ids = (ss: FinishSlot[]) => ss.flatMap((s) => [s.id, s.defaultOptionId, ...s.options.map((o) => o.id)])
    expect(ids(again)).toEqual(ids(slots))
  })

  it('each option changes exactly the rooms of its slot', () => {
    const base: Configuration = {}
    for (const slot of slots) {
      const def = slot.options.find((o) => o.id === slot.defaultOptionId)!
      for (const o of slot.options) {
        const cfg = { ...base, [slot.id]: o.id }
        const changed = rooms
          .flatMap((r) => TARGETS.map((t) => [r, t] as const))
          .filter(([r, t]) => JSON.stringify(resolveFinishRef(slots, cfg, r.id, t)) !== JSON.stringify(resolveFinishRef(slots, base, r.id, t)))
          .map(([r, t]) => `${r.id}:${t}`)
        const mine = rooms.filter((r) => slotOf(slots, r.id, slot.target) === slot.id).map((r) => `${r.id}:${slot.target}`)
        expect(changed.sort(), `${slot.id} ${o.id}`).toEqual(JSON.stringify(o.material) === JSON.stringify(def.material) ? [] : mine.sort())
      }
    }
  })

  it('a doorway gets a threshold exactly where its two rooms are in different floor groups', () => {
    const kindGroup = (r: Room | null) => (r ? (FINISH_CATALOG.find((s) => s.target === 'floor' && s.kinds !== 'all' && s.kinds.includes(r.kind))?.id ?? null) : null)
    let withSill = 0
    let without = 0
    for (const w of founder.walls) {
      const f = core.wallFrame(w, founder.vertices)
      for (const o of w.openings.filter((x) => x.kind !== 'window')) {
        const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
        const off = w.thicknessM / 2 + 0.05
        const [front, back] = [1, -1].map((s) => core.roomAt({ x: c.x + f.normal.x * off * s, y: c.y + f.normal.y * off * s }, rooms, founder))
        const threshold = floorSlotId(slots, front?.id) !== floorSlotId(slots, back?.id)
        expect(threshold, `${front?.name} | ${back?.name}`).toBe(kindGroup(front) !== kindGroup(back))
        if (threshold) withSill++
        else without++
      }
    }
    expect(withSill).toBeGreaterThan(0)
    expect(without).toBeGreaterThan(0)
  })
})
