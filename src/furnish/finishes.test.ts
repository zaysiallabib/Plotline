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
import { EDGES_SLOT, EDGE_SAME, FINISH_CATALOG, FRAMES_SLOT, OUTSIDE_SLOT, faceWallId, finishSlotsFor, frameKey, isLevel, outerRuns, outsideFloorKey, outsideKey, outsideOf } from './finishes'

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

describe('one wall to look at (faceWallId, session 23: a buyer paints ONE wall)', () => {
  const faces = (u: Unit, r: Room) => new Set(r.wallIds.map((w) => faceWallId(u, r, w)))
  it("names each straight run of wall pieces round a room by one of them: Type A's Bed-1 is 9 pieces, 6 walls", () => {
    const u = HAND['type-a']
    const rooms = core.deriveRooms(u)
    const count = (id: string) => [rooms.find((r) => r.id === id)!.wallIds.length, faces(u, rooms.find((r) => r.id === id)!).size]
    expect([count('r_bed1'), count('r_living'), count('r_dining'), count('r_bath2')]).toEqual([[9, 6], [6, 4], [13, 6], [4, 4]])
  })
  it('on every hand unit and the founder draft: a face id is a wall of that room, and its own face id (any piece clicked → the same key)', () => {
    for (const u of [...Object.values(HAND), founder]) {
      for (const r of core.deriveRooms(u)) {
        for (const w of r.wallIds) {
          const f = faceWallId(u, r, w)
          expect(r.wallIds).toContain(f)
          expect(faceWallId(u, r, f), `${u.name} ${r.name}`).toBe(f)
        }
      }
    }
    const r = core.deriveRooms(HAND['type-a'])[0]
    expect(faceWallId(HAND['type-a'], r, 'not-on-its-outline')).toBe('not-on-its-outline')
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

describe('the outside (session 31 facade): a building-wide choice, one floor, one wall; the frames', () => {
  it('both slots are structured, unique, the first option what was always drawn (the warm plaster, the silver aluminium)', () => {
    const all = [...FINISH_CATALOG, OUTSIDE_SLOT, FRAMES_SLOT].flatMap((s) => s.options.map((o) => o.id))
    expect(new Set(all).size).toBe(all.length)
    for (const s of [OUTSIDE_SLOT, FRAMES_SLOT]) {
      expect(s.options[0].id).toBe(s.defaultOptionId)
      for (const o of s.options) expect(o.brand && o.sku && o.label && o.priceDeltaBdt === 0).toBeTruthy()
    }
    expect(OUTSIDE_SLOT.options[0].material).toEqual({ kind: 'pbr', textureId: 'plaster_white', tint: '#dbd3c6' })
    expect(FRAMES_SLOT.options[0].material).toEqual({ kind: 'color', color: '#d5d7d6', roughness: 0.45, metalness: 0.15 }) // openings.ts ALU
  })

  it('nothing chosen: null everywhere (drawn as before); then the wall beats its floor beats the building', () => {
    const none = outsideOf({})
    expect([none.wall('d', 'w', 3), none.frame('d', 'o'), none.sig]).toEqual([null, null, ''])
    const mat = (id: string) => OUTSIDE_SLOT.options.find((o) => o.id === id)!.material
    const o = outsideOf({ s_outside: 'fo_out_render_white', [outsideFloorKey(0)]: 'fo_out_stone', [outsideKey('d', 'w')]: 'fo_out_timber_slats', [frameKey('d', 'o')]: 'fo_frame_black', s_frames: 'fo_frame_white' })
    expect(o.wall('d', 'w', 0)).toEqual(mat('fo_out_timber_slats'))
    expect(o.wall('d', 'x', 0)).toEqual(mat('fo_out_stone'))
    expect(o.wall('d', 'x', 3)).toEqual(mat('fo_out_render_white'))
    expect(o.wall('e', 'w', 3)).toEqual(mat('fo_out_render_white')) // another drawing's wall of that id
    expect(o.wall(null, null)).toEqual(mat('fo_out_render_white')) // a block of the ground floor, no wall of a drawing
    expect(o.frame('d', 'o')).toEqual(FRAMES_SLOT.options.find((x) => x.id === 'fo_frame_black')!.material)
    expect(o.frame('d', 'p')).toEqual(FRAMES_SLOT.options.find((x) => x.id === 'fo_frame_white')!.material)
    expect(outsideOf({ s_outside: 'no_such' }).wall('d', 'w')).toBeNull() // a choice not offered: as drawn
    expect(outsideOf({ b: '1', a: '2' }).sig).toBe(outsideOf({ a: '2', b: '1' }).sig)
  })

  it('the edges and caps (session 31 outside2): nothing chosen, none; else the building\'s own choice, or each wall\'s outside as it wears it', () => {
    const ids = [...FINISH_CATALOG, OUTSIDE_SLOT, FRAMES_SLOT, EDGES_SLOT].flatMap((s) => s.options.map((o) => o.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(EDGES_SLOT.options[0].id).toBe(EDGE_SAME)
    expect(EDGES_SLOT.defaultOptionId).toBe(EDGE_SAME)
    for (const o of EDGES_SLOT.options) expect(o.brand && o.sku && o.label && o.priceDeltaBdt === 0).toBeTruthy()
    const mat = (id: string) => [...OUTSIDE_SLOT.options, ...EDGES_SLOT.options].find((o) => o.id === id)!.material
    expect(outsideOf({}).edge('d', 'w', 3)).toBeNull()
    // a brick tower: its edges brick, a wall in timber its own edge timber, the plinth floor's stone on that floor
    const o = outsideOf({ s_outside: 'fo_out_brick_red', [outsideKey('d', 'w')]: 'fo_out_timber_slats', [outsideFloorKey(0)]: 'fo_out_stone' })
    expect(o.edge('d', 'x', 3)).toEqual(mat('fo_out_brick_red'))
    expect(o.edge('d', 'w', 3)).toEqual(mat('fo_out_timber_slats'))
    expect(o.edge(null, null, 0)).toEqual(mat('fo_out_stone')) // a ground column
    expect(outsideOf({ s_outside: 'fo_out_brick_red', s_edges: EDGE_SAME }).edge('d', 'x', 3)).toEqual(mat('fo_out_brick_red'))
    // the building's own edges beat every wall's; alone they dress a plaster tower's edges
    const c = outsideOf({ s_outside: 'fo_out_brick_red', [outsideKey('d', 'w')]: 'fo_out_timber_slats', s_edges: 'fo_edge_concrete' })
    expect([c.edge('d', 'w', 3), c.edge(null, null, 0), c.wall('d', 'w', 3)]).toEqual([mat('fo_edge_concrete'), mat('fo_edge_concrete'), mat('fo_out_timber_slats')])
    expect(outsideOf({ s_edges: 'fo_edge_metal' }).edge('d', 'x', 2)).toEqual(mat('fo_edge_metal'))
    expect(outsideOf({ s_edges: 'fo_edge_metal' }).wall('d', 'x', 2)).toBeNull()
  })

  it("staff's own outside option (Finishes → + Add option) is one more option of the slot", () => {
    const own = { ...OUTSIDE_SLOT, options: [...OUTSIDE_SLOT.options, { id: 'own_x', brand: 'Mine', sku: 'M1', label: 'Our brick', priceDeltaBdt: 0, material: { kind: 'pbr' as const, textureId: 'own_x' } }] }
    expect(outsideOf({ s_outside: 'own_x' }, [own, FRAMES_SLOT]).wall('d', 'w')).toEqual({ kind: 'pbr', textureId: 'own_x' })
  })

  it('one wall to look at outside: pieces in line and alike in height are one run (any direction drawn); a parapet in line and a wall meeting it are their own', () => {
    const v = (id: string, x: number, y: number) => ({ id, x, y })
    const w = (id: string, a: string, b: string, heightM = 3) => ({ id, a, b, thicknessM: 0.25, heightM, openings: [] })
    const u = { vertices: [v('a', 0, 0), v('b', 3, 0), v('c', 6, 0), v('d', 8, 0), v('e', 3, 4)], walls: [w('w2', 'a', 'b'), w('w1', 'c', 'b'), w('w3', 'c', 'd', 1.1), w('w4', 'b', 'e')] }
    expect(Object.fromEntries(outerRuns(u))).toEqual({ w2: 'w1', w1: 'w1', w3: 'w3', w4: 'w4' })
  })

  it("on Type A every outer wall's run is a wall of it, the same for each piece of the run (a click on any piece: one key)", () => {
    const u = HAND['type-a']
    const runs = outerRuns(u)
    const ids = new Set(u.walls.map((x) => x.id))
    for (const [id, run] of runs) {
      expect(ids.has(run)).toBe(true)
      expect(runs.get(run)).toBe(run)
      expect(run <= id).toBe(true)
    }
    expect(new Set(runs.values()).size).toBeLessThan(u.walls.length) // some outer walls are split by the rooms behind them
  })
})
