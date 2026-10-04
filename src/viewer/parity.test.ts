/**
 * Parity audit (session 18): every viewer feature the five hand-authored units show must be there on the founder's own
 * Studio draft too — loaded the way Preview 3D hands it over (Studio Import = load-unit with Join walls, then the
 * viewer's normalizeUnit), with no floor, no finish slots, an unnamed project, "Space N" rooms, staff-arranged furniture.
 */
import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import typeA from '../data/units/type-a.json'
import { kitAsset } from '../furnish/kit'
import { layoutFor } from '../studio/furniture'
import { initialState, normalizeUnit, reducer } from '../studio/model'
import { withDefaults } from './defaults'
import { decodeConfig, encodeConfig } from './share'
import { entrySpawn, listedRooms, roomView } from './spawn'

const loaded = normalizeUnit(reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit)
const rooms = core.deriveRooms(loaded)
const unit = withDefaults(loaded, rooms)

describe("parity: the founder's draft gets what the hand-authored units show", { timeout: 60_000 }, () => {
  it('is the draft the audit is about: no slots, no floor, Space N rooms', () => {
    expect(loaded.finishSlots).toEqual([])
    expect(loaded.floor).toBeUndefined()
    expect(rooms.filter((r) => r.name.startsWith('Space')).length).toBeGreaterThan(0)
  })

  it('Finishes: the catalog, covering every closed room; a ?c= link round-trips', () => {
    expect(unit.finishSlots.length).toBe(7)
    const cfg = { s_floor_beds: 'fo_beds_walnut', s_wall_paint: 'fo_paint_sage' }
    expect(decodeConfig(encodeConfig(cfg), unit.finishSlots)).toEqual(cfg)
  })

  it('load screen: a name and an area (typed wins; else the closed rooms, as auto-trace does)', () => {
    expect(unit.name).toBe('Auto-trace draft')
    expect(unit.areaSqft).toBe(2736)
    const bare = withDefaults({ ...loaded, name: '  ', areaSqft: 0 }, rooms)
    expect(bare.name).toBe('Untitled unit')
    expect(bare.areaSqft).toBeGreaterThan(1500)
    expect(bare.areaSqft).toBeLessThan(2736)
  })

  it('sun and compass: a north', () => expect(Number.isFinite(unit.northDeg)).toBe(true))

  it('furniture: every bedroom has a bed, every living / dining room a seat — as he arranged it and as presets would', () => {
    for (const furniture of [loaded.furniture, []]) {
      const pieces = layoutFor({ ...unit, furniture }, rooms)
      const has = (roomId: string, cat: string) => pieces.some((p) => p.roomId === roomId && !p.removed && kitAsset(p.assetId)?.category === cat)
      for (const r of rooms.filter((x) => x.kind === 'bed')) expect(has(r.id, 'bed'), `${r.name} (${furniture.length ? 'his' : 'presets'})`).toBe(true)
      for (const r of rooms.filter((x) => x.kind === 'living')) expect(has(r.id, 'sofa') || has(r.id, 'chair'), r.name).toBe(true)
    }
  })

  it('walk: an entry view, a Rooms list with every bed / living / dining / kitchen / toilet, a first view of each', () => {
    expect(entrySpawn(unit, rooms)).not.toBeNull()
    const listed = listedRooms(unit, rooms)
    const lived = rooms.filter((r) => ['bed', 'living', 'dining', 'kitchen', 'bath'].includes(r.kind))
    expect(lived.length).toBeGreaterThan(5)
    for (const r of lived) expect(listed.map((x) => x.name), r.name).toContain(r.name)
    for (const r of listed) {
      const v = roomView(r, unit)
      expect([v.p.x, v.p.y, v.face.x, v.face.y].every(Number.isFinite), r.name).toBe(true)
    }
  })

  it('the hand-authored units keep what they carry', () => {
    const a = typeA as unknown as Unit
    const d = withDefaults(a, core.deriveRooms(a))
    expect([d.name, d.areaSqft, d.finishSlots]).toEqual([a.name, a.areaSqft, a.finishSlots])
  })

  it.todo('Building view: towerOf for a Studio project (Lane C, ask 2)')
  it.todo('passage height default for Studio passages (Lane A, ask 5)')
})
