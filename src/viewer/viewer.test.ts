import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import { optionsTotal } from './FinishesPanel'
import { decodeConfig, encodeConfig, formatDelta, formatTaka } from './share'
import { kitAsset } from '../furnish/kit'
import { furnish } from '../furnish/presets'
import { DOOR_CLEAR, HANG_CLEAR, HANG_IN_VIEW, VIEW_INSET, entrySpawn, listedRooms, roomView, yawFor } from './spawn'
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

  it('Type B: entry faces down the 36-ft living room, not into the hall across the door; a 2.6 m slider does not push the Bed-1 view to the headboard', () => {
    const b = typeB as unknown as Unit
    const bRooms = core.deriveRooms(b)
    const e = entrySpawn(b, bRooms)!
    const living = bRooms.find((r) => r.id === 'r_living')!
    expect(core.roomAt(e.p, bRooms, b)?.id).toBe('r_living')
    expect(e.face.x, 'looks east along the room').toBeGreaterThan(0.9)
    const d = Math.hypot(living.centroid.x - e.p.x, living.centroid.y - e.p.y)
    expect(e.face.x * (living.centroid.x - e.p.x) + e.face.y * (living.centroid.y - e.p.y)).toBeCloseTo(d, 6)
    // Bed-1: a sliding door has no leaf, so its whole 2.6 m span does not keep the camera 2.9 m away
    const furnished: Unit = { ...b, furniture: furnish(b, bRooms) }
    const bed1 = bRooms.find((r) => r.id === 'r_bed1')!
    const bed = furnished.furniture.find((f) => f.roomId === bed1.id && f.assetId.startsWith('bed_'))!
    const v = roomView(bed1, furnished)
    const t = (bed.rotationDeg * Math.PI) / 180
    expect((v.p.x - bed.x) * -Math.sin(t) + (v.p.y - bed.y) * Math.cos(t), 'in front of the bed').toBeGreaterThan(2)
  })

  it('Rooms list: walk-in rooms only (a door or passage), no shafts, planters or lift core', () => {
    const names = listedRooms(unit, rooms).map((r) => r.name)
    expect(names).toContain('Lift lobby')
    expect(names).toContain('Help bed')
    for (const n of ['Planter', 'Lift core', 'AOD (north)']) expect(names).not.toContain(n)
    const b = typeB as unknown as Unit
    const bNames = listedRooms(b, core.deriveRooms(b)).map((r) => r.name)
    for (const n of ['Stair', 'K. veranda', 'Help room']) expect(bNames).toContain(n)
    for (const n of ['Planter (bed-1)', 'Planter (living)']) expect(bNames).not.toContain(n)
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
    for (const name of ['Bed-1', 'Bed-2', 'Kitchen', 'Living room', 'Dining & family living']) {
      const r = rooms.find((x) => x.name === name)!
      const v = roomView(r, furnished)
      const inner = core.roomInnerPolygon(r, furnished)
      const items = furnished.furniture.filter((f) => f.roomId === r.id && kitAsset(f.assetId)?.mount !== 'ceiling') // lights/ACs are overhead
      const hero = items.find((f) => /^(bed_|vanity$|kitchen_sink$|dining_table$)/.test(f.assetId))
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

  it('roomView: an empty or small room without a hero piece looks along its longest sightline, not at the near wall', () => {
    const b = typeB as unknown as Unit
    for (const [u, names] of [[unit, ['Lift lobby', 'Help bed', 'Walk-in closet']], [b, ['Lift lobby', 'Help room', 'Stair']]] as const) {
      const rs = core.deriveRooms(u)
      const furnished: Unit = { ...u, furniture: furnish(u, rs) }
      for (const name of names) {
        const r = rs.find((x) => x.name === name)!
        const inner = core.roomInnerPolygon(r, furnished)
        const v = roomView(r, furnished)
        let ray = 0 // clear distance along the view before it leaves the room
        while (ray < 20 && core.pointInPolygon({ x: v.p.x + v.face.x * (ray + 0.05), y: v.p.y + v.face.y * (ray + 0.05) }, inner)) ray += 0.05
        expect(ray, name).toBeGreaterThan(1.2) // a 3 m² help room tops out near 1.5 m
      }
    }
  })

  it('Rooms list in walk-through order: entry room, living, dining, kitchen + its veranda, each bedroom with its bath/closet, other baths, study/utility, verandas, the rest', () => {
    expect(listedRooms(unit, rooms).map((r) => r.name)).toEqual([
      'Dining & family living', // entered from the main door
      'Living room',
      'Kitchen', // its service veranda is under 2 m², not listed
      'Bed-1',
      'Walk-in closet',
      'Bath-1', // through the closet
      'Bed-2',
      'Bath-2',
      'Bed-3',
      'Bath-3',
      'Powder room',
      'H. toilet',
      'Study room',
      'Help bed',
      'Veranda (bed-1)',
      'Veranda (living)',
      'Veranda (study)',
      'Lift lobby',
    ])
    const b = typeB as unknown as Unit
    expect(listedRooms(b, core.deriveRooms(b)).map((r) => r.name)).toEqual([
      'Living, dining & family',
      'Kitchen',
      'K. veranda',
      'Bed-1',
      'Bath-1',
      'Bed-2',
      'Bath-2',
      'Bed-3',
      'Bath-3',
      'Powder room',
      'Help room',
      'Veranda (bed-1)',
      'Veranda (living)',
      'Lift lobby',
      'Stair',
    ])
  })

  const both = ([typeA, typeB] as unknown as Unit[]).map((u0) => {
    const rs = core.deriveRooms(u0)
    return { u: { ...u0, furniture: furnish(u0, rs) } as Unit, rs }
  })
  /** The inward normal of the door whose centre p stands 0.4–0.6 m in front of (inner wall face), else null. */
  const doorSpot = (u: Unit, r: Room, p: Pt): Pt | null => {
    for (const w of u.walls.filter((x) => r.wallIds.includes(x.id))) {
      const f = core.wallFrame(w, u.vertices)
      for (const o of w.openings.filter((x) => x.kind !== 'window')) {
        const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
        const along = (p.x - c.x) * f.dir.x + (p.y - c.y) * f.dir.y
        const into = Math.abs((p.x - c.x) * f.normal.x + (p.y - c.y) * f.normal.y) - w.thicknessM / 2
        const s = Math.sign((p.x - c.x) * f.normal.x + (p.y - c.y) * f.normal.y)
        if (Math.abs(along) < 1e-6 && into > 0.4 - 1e-6 && into < 0.6 + 1e-6) return { x: f.normal.x * s, y: f.normal.y * s }
      }
    }
    return null
  }
  const deg = (a: Pt, b: Pt) => (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / Math.hypot(a.x, a.y) / Math.hypot(b.x, b.y)))) * 180) / Math.PI

  it('no pendant fills the first frame: the entry and every jump stay HANG_CLEAR from its room\'s pendant, HANG_IN_VIEW when it hangs ahead (A and B)', () => {
    for (const { u, rs } of both) {
      expect(u.furniture.filter((f) => f.assetId === 'modern_ceiling_lamp_01').length).toBeGreaterThan(0)
      const e = entrySpawn(u, rs)!
      for (const [r, v] of [[core.roomAt(e.p, rs, u)!, e], ...listedRooms(u, rs).map((r) => [r, roomView(r, u)] as const)] as const) {
        const name = v === e ? 'entry' : r.name
        for (const f of u.furniture.filter((f) => f.roomId === r.id && f.assetId === 'modern_ceiling_lamp_01')) {
          const d = Math.hypot(f.x - v.p.x, f.y - v.p.y)
          expect(d, `${u.id} ${name}`).toBeGreaterThanOrEqual(HANG_CLEAR)
          if (d < HANG_IN_VIEW) expect(deg(v.face, { x: f.x - v.p.x, y: f.y - v.p.y }), `${u.id} ${name}: pendant ahead`).toBeGreaterThan(53)
        }
      }
    }
    // Type B walks in at the dining end, 2 m in front of the pendant: the entry slides on down the room past it
    const { u, rs } = both[1]
    const e = entrySpawn(u, rs)!
    expect(core.roomAt(e.p, rs, u)?.id).toBe('r_living')
    expect(e.face.x, 'still looking down the room').toBeGreaterThan(0.9)
  })

  it('bath jumps stand 0.4–0.6 m inside the door and look in diagonally: vanity in frame, never the mirror head-on (A and B)', () => {
    for (const { u, rs } of both) {
      for (const r of listedRooms(u, rs).filter((x) => x.kind === 'bath')) {
        const v = roomView(r, u)
        const n = doorSpot(u, r, v.p)
        expect(n, `${u.id} ${r.name} at a door`).not.toBeNull()
        expect(deg(v.face, n!), `${u.id} ${r.name} looks in, not along the door wall`).toBeLessThanOrEqual(70 + 1e-6)
        const vanity = u.furniture.find((f) => f.roomId === r.id && f.assetId === 'vanity')
        if (!vanity) continue // a WC's pedestal basin may sit beside the door
        const t = (vanity.rotationDeg * Math.PI) / 180
        expect(deg(v.face, { x: vanity.x - v.p.x, y: vanity.y - v.p.y }), `${u.id} ${r.name} vanity in frame`).toBeLessThanOrEqual(40 + 1e-6)
        expect(deg(v.face, { x: Math.sin(t), y: -Math.cos(t) }), `${u.id} ${r.name} mirror not head-on`).toBeGreaterThan(30)
      }
    }
  })

  it('a room too small to frame from inside (A help bed, WC) is seen from just inside its door; the 4.3 m² help room keeps its sightline view (B)', () => {
    const [a, b] = both
    for (const name of ['Help bed', 'H. toilet']) {
      const r = a.rs.find((x) => x.name === name)!
      const v = roomView(r, a.u)
      const n = doorSpot(a.u, r, v.p)
      expect(n, name).not.toBeNull()
      expect(deg(v.face, n!), name).toBeLessThanOrEqual(70 + 1e-6)
    }
    const help = b.rs.find((x) => x.name === 'Help room')!
    expect(doorSpot(b.u, help, roomView(help, b.u).p)).toBeNull()
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
