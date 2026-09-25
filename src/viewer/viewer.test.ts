import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import typeA from '../data/units/type-a.json'
import { optionsTotal } from './FinishesPanel'
import { decodeConfig, encodeConfig, formatDelta, formatTaka } from './share'
import { kitAsset } from '../furnish/kit'
import { furnish } from '../furnish/presets'
import { DOOR_CLEAR, VIEW_INSET, entrySpawn, roomView, yawFor } from './spawn'
import { hhmm, period } from './SunPill'

const unit = typeA as unknown as Unit
const rooms = core.deriveRooms(unit)

describe('viewer', () => {
  it('formats taka with Bangladeshi grouping', () => {
    expect(formatTaka(0)).toBe('0')
    expect(formatTaka(-40000)).toBe('40,000')
    expect(formatTaka(999)).toBe('999')
    expect(formatTaka(1000)).toBe('1,000')
    expect(formatTaka(100000)).toBe('1,00,000')
    expect(formatTaka(185000)).toBe('1,85,000')
    expect(formatTaka(12500000)).toBe('1,25,00,000')
    expect(formatDelta(0)).toBe('Included')
    expect(formatDelta(185000)).toBe('+৳1,85,000')
    expect(formatDelta(-40000)).toBe('−৳40,000')
  })

  it('share codec round-trips and drops unknown ids', () => {
    const slots = unit.finishSlots
    const cfg = Object.fromEntries(slots.map((s) => [s.id, s.options[s.options.length - 1].id]))
    const enc = encodeConfig(cfg)
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeConfig(enc, slots)).toEqual(cfg)
    expect(decodeConfig(encodeConfig({ ...cfg, nope: 'x', [slots[0].id]: 'not-an-option' }), slots)).toEqual(
      Object.fromEntries(Object.entries(cfg).filter(([k]) => k !== slots[0].id)),
    )
    expect(decodeConfig(null, slots)).toEqual({})
    expect(decodeConfig('%%%garbage', slots)).toEqual({})
  })

  it('options total sums the selected deltas only; reset = defaults', () => {
    const slots = unit.finishSlots
    expect(optionsTotal(slots, {})).toBe(slots.reduce((t, s) => t + (s.options.find((o) => o.id === s.defaultOptionId)?.priceDeltaBdt ?? 0), 0))
    const pricey = slots.find((s) => s.options.some((o) => o.priceDeltaBdt > 0))!
    const opt = pricey.options.find((o) => o.priceDeltaBdt > 0)!
    expect(optionsTotal(slots, { [pricey.id]: opt.id })).toBe(optionsTotal(slots, {}) - (pricey.options.find((o) => o.id === pricey.defaultOptionId)?.priceDeltaBdt ?? 0) + opt.priceDeltaBdt)
  })

  it('sun pill labels', () => {
    expect(hhmm(15.5)).toBe('15:30')
    expect(hhmm(6)).toBe('06:00')
    expect(hhmm(10.75)).toBe('10:45')
    expect(period(6)).toBe('morning')
    expect(period(10.75)).toBe('morning')
    expect(period(11)).toBe('midday')
    expect(period(13.75)).toBe('midday')
    expect(period(14)).toBe('afternoon')
    expect(period(16.75)).toBe('afternoon')
    expect(period(17)).toBe('evening')
    expect(period(18)).toBe('evening')
  })

  it('yawFor: 0 = plan −y, positive turns left', () => {
    expect(yawFor({ x: 0, y: -1 })).toBeCloseTo(0)
    expect(yawFor({ x: -1, y: 0 })).toBeCloseTo(Math.PI / 2) // facing plan-left = a left turn from plan-up
    expect(yawFor({ x: 1, y: 0 })).toBeCloseTo(-Math.PI / 2)
    expect(Math.abs(yawFor({ x: 0, y: 1 }))).toBeCloseTo(Math.PI)
    // camera forward for yaw θ is plan (−sin θ, −cos θ): the inverse of yawFor
    for (const d of [{ x: 0.6, y: 0.8 }, { x: -0.8, y: 0.6 }]) {
      const t = yawFor(d)
      expect(-Math.sin(t)).toBeCloseTo(d.x)
      expect(-Math.cos(t)).toBeCloseTo(d.y)
    }
  })

  it('entry spawn: first door in walls[] order, on the non-lobby side, 1.2 m in, facing into the room', () => {
    const e = entrySpawn(unit, rooms)!
    const wall = unit.walls.find((w) => w.openings.some((o) => o.kind === 'door'))!
    expect(wall.id).toBe('w_entry')
    const door = wall.openings.find((o) => o.kind === 'door')!
    const f = core.wallFrame(wall, unit.vertices)
    const at = { x: f.origin.x + f.dir.x * (door.offsetM + door.widthM / 2), y: f.origin.y + f.dir.y * (door.offsetM + door.widthM / 2) }
    const room = core.roomAt(e.p, rooms, unit)!
    expect(room.name).toBe('Dining & family living')
    expect(Math.hypot(e.p.x - at.x, e.p.y - at.y)).toBeCloseTo(wall.thicknessM / 2 + 1.2)
    // facing away from the door (along the same side normal we stepped in on)
    expect(e.face.x * (e.p.x - at.x) + e.face.y * (e.p.y - at.y)).toBeGreaterThan(0)
    expect(core.roomAt({ x: e.p.x + e.face.x * 0.5, y: e.p.y + e.face.y * 0.5 }, rooms, unit)?.id).toBe(room.id)
  })

  it('entry spawn falls back to the largest living room when the first door has no enterable side', () => {
    // relabel both sides of the entry door as 'other' → fallback
    const u: Unit = { ...unit, roomLabels: unit.roomLabels.map((l) => (l.name === 'Dining & family living' ? { ...l, kind: 'other' } : l)) }
    const r = core.deriveRooms(u)
    const e = entrySpawn(u, r)!
    const living = r.filter((x) => x.kind === 'living').sort((a, b) => b.areaSqm - a.areaSqm)[0]
    expect(e.p).toEqual(living.centroid)
  })

  it('roomView: clear of doors and slabs, inset from every wall, facing the hero piece or the furniture', () => {
    const furnished: Unit = { ...unit, furniture: furnish(unit, rooms) }
    const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x
      const dy = b.y - a.y
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
    }
    for (const name of ['Bed-1', 'Bed-2', 'Kitchen', 'Bath-1', 'Living room']) {
      const r = rooms.find((x) => x.name === name)!
      const v = roomView(r, furnished)
      const inner = core.roomInnerPolygon(r, furnished)
      const items = furnished.furniture.filter((f) => f.roomId === r.id)
      const hero = items.find((f) => /^(bed_|vanity$|kitchen_sink$)/.test(f.assetId))
      const target = hero ?? { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length }
      expect(core.pointInPolygon(v.p, inner), name).toBe(true)
      // never nose-to-wall: at least VIEW_INSET (minus a hair for acute corners) from every inner edge
      const nearest = Math.min(...inner.map((a, i) => segDist(v.p, a, inner[(i + 1) % inner.length])))
      expect(nearest, name).toBeGreaterThanOrEqual(VIEW_INSET - 0.02)
      // never in a doorway or a leaf's swing: every door/passage centre on the room's walls ≥ DOOR_CLEAR away
      for (const w of furnished.walls.filter((x) => r.wallIds.includes(x.id))) {
        const f = core.wallFrame(w, furnished.vertices)
        for (const o of w.openings.filter((x) => x.kind !== 'window')) {
          const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
          expect(Math.hypot(v.p.x - c.x, v.p.y - c.y), `${name} ${o.id}`).toBeGreaterThanOrEqual(DOOR_CLEAR)
        }
      }
      // facing the bed / vanity / sink (else the furniture centroid), from ≥ 0.5 m off anything at eye level
      for (const f of items.filter((f) => f.assetId !== 'shower_screen' && (kitAsset(f.assetId)?.sizeM.y ?? 0) + (kitAsset(f.assetId)?.mountY ?? 0) > 1.2))
        expect(Math.hypot(v.p.x - f.x, v.p.y - f.y), `${name} ${f.id}`).toBeGreaterThan(0.5)
      const d = Math.hypot(target.x - v.p.x, target.y - v.p.y)
      expect(v.face.x * (target.x - v.p.x) + v.face.y * (target.y - v.p.y), name).toBeCloseTo(d, 6)
    }
    // the art director's Bed-1: not the door corner, not beside the wardrobe slab
    const bed1 = rooms.find((x) => x.name === 'Bed-1')!
    const wardrobe = furnished.furniture.find((f) => f.roomId === bed1.id && f.assetId.includes('wardrobe'))!
    const v1 = roomView(bed1, furnished)
    expect(Math.hypot(v1.p.x - wardrobe.x, v1.p.y - wardrobe.y)).toBeGreaterThanOrEqual(1.5)
    // no furniture: still inside, faces the longest wall's midpoint
    const bare = rooms.find((x) => x.name === 'Lift lobby')!
    const v = roomView(bare, unit)
    expect(core.pointInPolygon(v.p, core.roomInnerPolygon(bare, unit))).toBe(true)
    expect(Math.hypot(v.face.x, v.face.y)).toBeCloseTo(1)
  })

  it('roomView falls back to 0.9 m in from the door when no candidate qualifies', () => {
    const bath = rooms.find((x) => x.name === 'Bath-1')!
    // a room-filling tall wardrobe blocks every corner and wall midpoint
    const u: Unit = { ...unit, furniture: [{ id: 'x', assetId: 'wardrobe_tall', roomId: bath.id, x: bath.centroid.x, y: bath.centroid.y, rotationDeg: 0, scale: 6 }] }
    const v = roomView(bath, u)
    const w = u.walls.find((x) => bath.wallIds.includes(x.id) && x.openings.some((o) => o.kind === 'door'))!
    const door = w.openings.find((o) => o.kind === 'door')!
    const f = core.wallFrame(w, u.vertices)
    const c = { x: f.origin.x + f.dir.x * (door.offsetM + door.widthM / 2), y: f.origin.y + f.dir.y * (door.offsetM + door.widthM / 2) }
    expect(Math.hypot(v.p.x - c.x, v.p.y - c.y)).toBeCloseTo(w.thicknessM / 2 + 0.9)
    expect(core.pointInPolygon(v.p, core.roomInnerPolygon(bath, u))).toBe(true)
  })
})
