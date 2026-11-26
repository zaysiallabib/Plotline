import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import { optionsTotal } from './FinishesPanel'
import { compassPoint } from './Minimap'
import { decodeConfig, encodeConfig, finishKeys, formatDelta, formatTaka, stairUrl } from './share'
import { finishSlotsFor, roomKey, wallKey } from '../furnish/finishes'
import { kitAsset, placementRange, placementSize } from '../furnish/kit'
import { footprint, furnish } from '../furnish/presets'
import {
  AC_AHEAD, AC_DIP, AC_IN_VIEW, AC_LIFT, AC_NEAR, BATH_PITCH, CLOSET_PITCH, DOOR_CLEAR, DOOR_LEAF_MAX, FAN_CLEAR, FAN_IN_VIEW, FLAT_MAX, GALLEY_DOOR_CLEAR, HANG_CLEAR, HANG_IN_VIEW, HELP_PITCH,
  LEAF_GAIN, NEAR_WALL, NEAR_WALL_MAX, PHOTO_TURN, ROOM_PITCH, SIDE_WALL, SIDE_WALL_MAX, SMALL_WET, TALL_IN_VIEW, TINY_AIM_M, TINY_HFOV, TINY_WET_SQM, VIEW_INSET, WET_PITCH,
  VERANDA_PITCH, VERANDA_WALL, VERANDA_WALL_MAX, BAR_TOP, PORTRAIT_SIGHT, acCut, entrySpawn, footprintDist, inSight, lengthwise, listedRooms, roomView, wetBand, yawFor,
} from './spawn'
import { hhmm, nearestSpoke, period } from './SunPill'
import { EYE, boxInFrame, floorShare, frameShares, pieceInFrame, project, swings } from './frame'

const unit = typeA as unknown as Unit
const rooms = core.deriveRooms(unit)

// whole-flat tests compute every first frame of A, B and C (~1 s idle; a headless render on the same machine triples it)
describe('viewer', { timeout: 20_000 }, () => {
  // the whole-flat cases trace every first frame of A, B, C (and Sheltech A): with Playwright renders and another vitest
  // on the same machine they have run past 20 s (HANDOFF "Test flake")
  const WHOLE = { timeout: 90_000 }
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

  it('one-room and one-wall keys (session 23): named for a person; the share link keeps the valid ones, drops the rest', () => {
    const keys = finishKeys(unit, rooms)
    expect(keys.get(roomKey('r_bed1', 'floor'))).toMatchObject({ scope: 'Bed-1 · floor', slot: { id: 's_floor_beds' } })
    expect(keys.get(roomKey('r_living', 'wall'))).toMatchObject({ scope: 'Living room · all walls', slot: { id: 's_wall_paint' } })
    expect(keys.get(roomKey('r_bath2', 'wall'))?.slot.id).toBe('s_wall_bath')
    // one key per wall a person sees: Bed-1's 9 wall pieces are 6 walls, each named by its side of the room
    const bed1 = [...keys].filter(([k]) => k.startsWith('wall:') && k.endsWith(':r_bed1'))
    expect(bed1).toHaveLength(6)
    for (const [, v] of bed1) expect(v.scope).toMatch(/^Bed-1 · (north|south|east|west)(-(east|west))? wall$/)
    const wall = bed1[0][0]
    const cfg = { s_floor_beds: 'fo_beds_walnut', [roomKey('r_bed1', 'floor')]: 'fo_beds_marble', [wall]: 'fo_paint_sage' }
    expect(decodeConfig(encodeConfig(cfg), unit.finishSlots, keys)).toEqual(cfg)
    const junk = {
      'room:nope:floor': 'fo_beds_oak', // no such room
      'wall:nope:r_bed1': 'fo_paint_sage', // no such wall
      [roomKey('r_bed2', 'floor')]: 'fo_living_oak', // not an option of Bed-2's floor slot
      [roomKey('r_bath2', 'wall')]: 'fo_paint_sage', // paint is no bath-wall option
    }
    expect(decodeConfig(encodeConfig({ ...cfg, ...junk }), unit.finishSlots, keys)).toEqual(cfg)
    expect(decodeConfig(encodeConfig(cfg), unit.finishSlots)).toEqual({ s_floor_beds: 'fo_beds_walnut' }) // no keys given: slots only
  })

  it('a wall is named by the compass side of its room, turned by the plan north', () => {
    const box = (northDeg: number): Unit => {
      const u: Unit = {
        id: 'u', projectName: 'p', name: 'n', northDeg, areaSqft: 0, furniture: [], finishSlots: [],
        vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4, y: 0 }, { id: 'c', x: 4, y: 3 }, { id: 'd', x: 0, y: 3 }],
        walls: ['ab', 'bc', 'cd', 'da'].map((p) => ({ id: p, a: p[0], b: p[1], thicknessM: 0.2, heightM: 3, openings: [] })),
        roomLabels: [{ id: 'r', name: 'Bed', kind: 'bed', x: 2, y: 1.5 }],
      }
      return { ...u, finishSlots: finishSlotsFor(u, core.deriveRooms(u)) }
    }
    const names = (northDeg: number) => {
      const u = box(northDeg)
      const k = finishKeys(u, core.deriveRooms(u))
      return ['ab', 'bc', 'cd', 'da'].map((w) => k.get(wallKey(w, 'r'))?.scope)
    }
    // ab is the plan's top edge: north when north is plan-up; north 90° clockwise (plan right) makes it the west wall
    expect(names(0)).toEqual(['Bed · north wall', 'Bed · east wall', 'Bed · south wall', 'Bed · west wall'])
    expect(names(90)).toEqual(['Bed · west wall', 'Bed · north wall', 'Bed · east wall', 'Bed · south wall'])
    expect(names(45)[0]).toBe('Bed · north-west wall')
  })

  it('options total: every slot as chosen, plus each one-room / one-wall choice once, at its own price', () => {
    const slots = unit.finishSlots
    const base = optionsTotal(slots, {})
    expect(optionsTotal(slots, { [roomKey('r_bed1', 'floor')]: 'fo_beds_marble' })).toBe(base + 185000)
    expect(optionsTotal(slots, { [roomKey('r_bed1', 'floor')]: 'fo_beds_marble', [roomKey('r_bed2', 'floor')]: 'fo_beds_walnut' })).toBe(base + 185000 + 45000)
  })

  it('options total sums the selected deltas only; reset = defaults', () => {
    const slots = unit.finishSlots
    expect(optionsTotal(slots, {})).toBe(slots.reduce((t, s) => t + (s.options.find((o) => o.id === s.defaultOptionId)?.priceDeltaBdt ?? 0), 0))
    const pricey = slots.find((s) => s.options.some((o) => o.priceDeltaBdt > 0))!
    const opt = pricey.options.find((o) => o.priceDeltaBdt > 0)!
    expect(optionsTotal(slots, { [pricey.id]: opt.id })).toBe(optionsTotal(slots, {}) - (pricey.options.find((o) => o.id === pricey.defaultOptionId)?.priceDeltaBdt ?? 0) + opt.priceDeltaBdt)
  })

  it('wind rose: a click picks the spoke under the pointer, not the month drawn last (bug hunt 2026-10-18)', () => {
    // Banani, north 304°: January (NW, 2 m/s) and December (NNW, 1.9 m/s) nearly on one line; 85 % along January's
    const tips = [{ x: 55.05, y: 91.83 }, ...Array(10).fill({ x: 132, y: 118 }), { x: 56.88, y: 87.1 }]
    expect(nearestSpoke({ x: 60.3, y: 91.6 }, tips)).toBe(0)
    expect(nearestSpoke({ x: 57.5, y: 87.4 }, tips)).toBe(11)
    expect(nearestSpoke({ x: 170, y: 20 }, tips)).toBe(-1)
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

  it('the entry view (furnished as shown) has no wall AC looming in a top corner: no end of one within AC_IN_VIEW and ~53° of the view, nor within AC_AHEAD and 40° of it, the frame (session 31)', () => {
    for (const u of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) {
      const rs = core.deriveRooms(u)
      const shown = { ...u, furniture: furnish(u, rs) }
      const e = entrySpawn(shown, rs)!
      for (const ac of shown.furniture.filter((p) => p.assetId === 'ac_split')) {
        for (const q of [ac, ...footprint(ac, ac.rotationDeg, placementSize(ac))]) {
          const d = Math.hypot(q.x - e.p.x, q.y - e.p.y)
          const ahead = (ac.x - e.p.x) * e.face.x + (ac.y - e.p.y) * e.face.y
          const cos = ((q.x - e.p.x) * e.face.x + (q.y - e.p.y) * e.face.y) / d
          if (ahead > 0 && inSight(shown, e.p, ac)) expect((d < AC_IN_VIEW && cos > 0.6) || (d < AC_AHEAD && cos > Math.cos((40 * Math.PI) / 180)), `${u.id} ${ac.id}`).toBe(false)
        }
      }
    }
  })

  /** A wall AC of any room in sight looming in v's frame by its whole width (the entry rule above); `narrow`: an upright phone's frame, 20° each side. */
  const acLooms = (u: Unit, v: { p: Pt; face: Pt }, narrow = false) =>
    u.furniture.some((ac) => {
      if (ac.assetId !== 'ac_split' || (ac.x - v.p.x) * v.face.x + (ac.y - v.p.y) * v.face.y <= 0 || !inSight(u, v.p, ac)) return false
      return [ac, ...footprint(ac, ac.rotationDeg, placementSize(ac))].some((q) => {
        const d = Math.hypot(q.x - v.p.x, q.y - v.p.y)
        const cos = ((q.x - v.p.x) * v.face.x + (q.y - v.p.y) * v.face.y) / d
        const [loom, framed] = narrow ? [Math.cos((20 * Math.PI) / 180), Math.cos((20 * Math.PI) / 180)] : [0.6, Math.cos((40 * Math.PI) / 180)]
        return d < AC_NEAR || (d < AC_IN_VIEW && cos > loom) || (d < AC_AHEAD && cos > framed)
      })
    })

  it("no Rooms-list jump (furnished as shown) cuts a wall AC with the walk frame's top or hides it under the top bar (polish V4: type-a's dining stood its AC half under it)", { timeout: 90_000 }, () => {
    // the walk camera (50° tall, 16:9) from p at eye height: where a point lands, y = 1 the frame's top
    const ndc = (v: { p: Pt; face: Pt; pitch?: number }, q: Pt, h: number) => {
      const t = Math.tan((25 * Math.PI) / 180)
      const [cp, sp] = [Math.cos(v.pitch ?? 0), Math.sin(v.pitch ?? 0)]
      const [ahead, side, up] = [(q.x - v.p.x) * v.face.x + (q.y - v.p.y) * v.face.y, (q.y - v.p.y) * v.face.x - (q.x - v.p.x) * v.face.y, h - EYE]
      const z = ahead * cp + up * sp
      return { x: side / (z * t * (16 / 9)), y: (up * cp - ahead * sp) / (z * t), z }
    }
    const cuts = (u: Unit, v: { p: Pt; face: Pt; pitch?: number }) =>
      u.furniture.some((ac) => {
        if (ac.assetId !== 'ac_split' || !inSight(u, v.p, ac)) return false
        const [h0, h1] = placementRange(ac)
        const qs = footprint(ac, ac.rotationDeg, placementSize(ac)).flatMap((q) => [ndc(v, q, h0), ndc(v, q, h1)]).filter((q) => q.z > 0.05)
        return qs.length > 0 && Math.max(...qs.map((q) => q.y)) > BAR_TOP && Math.min(...qs.map((q) => q.y)) < 1 && qs.some((q) => Math.abs(q.x) < 1)
      })
    const cut: string[] = []
    const up: string[] = []
    for (const u0 of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) {
      const rs = core.deriveRooms(u0)
      const u = { ...u0, furniture: furnish(u0, rs) }
      for (const r of listedRooms(u, rs)) {
        const v = roomView(r, u)
        if (cuts(u, v)) cut.push(`${u.id} ${r.name}`)
        // a jump looks up only to show an AC whole under the bar, AC_LIFT at most, and no more than that takes
        if ((v.pitch ?? 0) > 0) {
          up.push(`${u.id} ${r.name}`)
          expect(v.pitch!, r.name).toBeLessThanOrEqual(AC_LIFT + 1e-9)
          expect(acCut(u, { ...v, pitch: v.pitch! - Math.PI / 180 }), `${r.name}: 1° less up cuts it`).toBe(true)
        }
      }
    }
    // 17 before (both dining rooms, most bedrooms, the studies); AC_CUT left five whose clear frames lose the bed's foot or
    // fill with a side wall; those change the least that clears them (spawn.ts unCut): A and B Bed-2 and Sheltech A Bed 4
    // look down 5–6° more (the bed whole: the pieceInFrame test below), Sheltech A's Passage turns 8° (still into the dining
    // room), Sheltech B's Foyer looks 3° up (the dining's AC whole under the bar)
    expect(cut).toEqual([])
    expect(up).toEqual(['unit_sheltech_b_2736 Foyer'])
    // the frame qa2 reported (type-a's dining jump before): the AC's top under the bar
    const rs = core.deriveRooms(unit)
    const u = { ...unit, furniture: furnish(unit, rs) }
    const before = { p: { x: 8.0065, y: 6.4415 }, face: { x: -0.505, y: 0.8631 }, pitch: ROOM_PITCH }
    expect([cuts(u, before), acCut(u, before)]).toEqual([true, true])
  })

  it("an upright phone whose first frame would show a door across the room looks down the room's length instead (polish P1); otherwise, and on a wide screen, as before", () => {
    /** where the middle of the frame lands (eye height): the first full-height wall, through passages, sliders and windows; in a swinging door? */
    const centre = (u: Unit, p: Pt, face: Pt) => {
      let hit = { t: 30, door: false }
      for (const w of u.walls.filter((x) => x.heightM >= EYE)) {
        const { origin: o, dir: d, lengthM } = core.wallFrame(w, u.vertices)
        const den = face.x * d.y - face.y * d.x
        if (Math.abs(den) < 1e-9) continue
        const t = ((o.x - p.x) * d.y - (o.y - p.y) * d.x) / den
        const s = ((o.x - p.x) * face.y - (o.y - p.y) * face.x) / den
        const at = w.openings.find((x) => s >= x.offsetM && s <= x.offsetM + x.widthM)
        if (t > 0.05 && s >= 0 && s <= lengthM && t < hit.t && !(at && !swings(at))) hit = { t, door: !!at }
      }
      return hit
    }
    const turned: string[] = []
    const doorInFrame: string[] = []
    for (const u0 of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) {
      const rs = core.deriveRooms(u0)
      const u = { ...u0, furniture: furnish(u0, rs) }
      const wide = entrySpawn(u, rs)!
      const tall = entrySpawn(u, rs, true)!
      const room = core.roomAt(wide.p, rs, u)!
      expect(core.roomAt(tall.p, rs, u)?.id, u.id).toBe(room.id) // the same room, the same door
      // the phone's frame (±10°, a ray every 2.5°) shows no door; its middle sees PORTRAIT_SIGHT into the room
      const doors = Array.from({ length: 9 }, (_, i) => (10 * (i / 4 - 1) * Math.PI) / 180).filter((r) => centre(u, tall.p, { x: tall.face.x * Math.cos(r) - tall.face.y * Math.sin(r), y: tall.face.x * Math.sin(r) + tall.face.y * Math.cos(r) }).door)
      expect(centre(u, tall.p, tall.face).door, `${u.id}: no door in the middle`).toBe(false)
      expect(centre(u, tall.p, tall.face).t, `${u.id}: the middle sees the room`).toBeGreaterThanOrEqual(PORTRAIT_SIGHT)
      if (doors.length) doorInFrame.push(u.id)
      expect(acLooms(u, tall, true), u.id).toBe(false)
      if (JSON.stringify(tall) === JSON.stringify(wide)) continue
      turned.push(u.id)
      // along the length (the stand point may have slid down it past a pendant, then turned at most 25° off it or an AC)
      const axis = lengthwise(core.roomInnerPolygon(room, u), tall.p)!
      expect(Math.min(deg(tall.face, axis), 180 - deg(tall.face, axis)), `${u.id}: down the length`).toBeLessThanOrEqual(25 + 1e-6)
    }
    // type-a and type-c: the wide screen's middle shows the door across the dining room (qa2 2p-02); the phone looks 5 m down it
    expect(turned).toEqual(['unit_type_a_2703', 'unit_type_c_2254'])
    // Sheltech B's foyer: its length is a blank wall 2 m off, so it keeps the wide view — its dining table in the middle, a
    // door at the frame's edge
    expect(doorInFrame).toEqual(['unit_sheltech_b_2736'])
    const rs = core.deriveRooms(unit)
    const u = { ...unit, furniture: furnish(unit, rs) }
    expect(centre(u, entrySpawn(u, rs)!.p, entrySpawn(u, rs)!.face).door).toBe(true)
    expect(centre(u, entrySpawn(u, rs, true)!.p, entrySpawn(u, rs, true)!.face).t).toBeGreaterThan(5)
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

  it('Rooms list: walk-in rooms only (a door or passage), no shafts, planters or common core (stair, lift, lobby)', () => {
    const names = listedRooms(unit, rooms).map((r) => r.name)
    expect(names).toContain('Help bed')
    for (const n of ['Planter', 'Lift core', 'Lift lobby', 'AOD (north)']) expect(names).not.toContain(n)
    const b = typeB as unknown as Unit
    const bNames = listedRooms(b, core.deriveRooms(b)).map((r) => r.name)
    for (const n of ['K. veranda', 'Help room']) expect(bNames).toContain(n)
    for (const n of ['Planter (bed-1)', 'Planter (living)', 'Stair', 'Lift lobby']) expect(bNames).not.toContain(n)
  })

  it('entry spawn finds the entrance wherever it is in the wall list (a Studio draft lists walls in drawing order)', () => {
    const e = entrySpawn({ ...unit, walls: [...unit.walls].reverse() }, rooms)!
    expect(core.roomAt(e.p, rooms, unit)?.name).toBe('Dining & family living') // in from the lift lobby, as before
    expect(e).toEqual(entrySpawn(unit, rooms))
  })

  it('entry spawn falls back to the largest living room when the first door has no enterable side', () => {
    // the entry door's flat side becomes a shaft (its other side is the lift lobby, common core) → no entrance → fallback
    const u: Unit = { ...unit, roomLabels: unit.roomLabels.map((l) => (l.name === 'Dining & family living' ? { ...l, kind: 'shaft' } : l)) }
    const r = core.deriveRooms(u)
    const e = entrySpawn(u, r)!
    const living = r.filter((x) => x.kind === 'living').sort((a, b) => b.areaSqm - a.areaSqm)[0]
    // (bug hunt 2026-10-18: the room's own view, as the Rooms list gives it — not its middle facing plan-up at a wall)
    const v = roomView(living, u)
    expect(e).toEqual({ p: v.p, face: v.face })
    expect(core.pointInPolygon(e.p, core.roomPolygon(living, u))).toBe(true)
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
      const items = furnished.furniture.filter((f) => f.roomId === r.id && kitAsset(f.assetId)?.mount !== 'ceiling' && kitAsset(f.assetId)?.kind !== 'curtain') // lights/ACs are overhead; curtains hang open at the window
      const hero = items.find((f) => /^(bed_|vanity$|kitchen_sink$|dining_table$)/.test(f.assetId))
      const target = hero ?? { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length }
      expect(core.pointInPolygon(v.p, inner), name).toBe(true)
      // never nose-to-wall: at least VIEW_INSET (minus a hair for acute corners) from every inner edge
      const nearest = Math.min(...inner.map((a, i) => segDist(v.p, a, inner[(i + 1) % inner.length])))
      expect(nearest, name).toBeGreaterThanOrEqual(VIEW_INSET - 0.02)
      // never in a doorway or a leaf's swing: every door/passage centre on the room's walls ≥ DOOR_CLEAR away (a galley: its whole span ≥ GALLEY_DOOR_CLEAR)
      for (const w of furnished.walls.filter((x) => r.wallIds.includes(x.id))) {
        const f = core.wallFrame(w, furnished.vertices)
        for (const o of w.openings.filter((x) => x.kind !== 'window')) {
          const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
          const along = Math.max(-o.widthM / 2, Math.min(o.widthM / 2, (v.p.x - c.x) * f.dir.x + (v.p.y - c.y) * f.dir.y))
          if (r.kind === 'kitchen') expect(Math.hypot(v.p.x - c.x - f.dir.x * along, v.p.y - c.y - f.dir.y * along), `${name} ${o.id}`).toBeGreaterThanOrEqual(GALLEY_DOOR_CLEAR)
          else expect(Math.hypot(v.p.x - c.x, v.p.y - c.y), `${name} ${o.id}`).toBeGreaterThanOrEqual(DOOR_CLEAR)
        }
      }
      // the bed / vanity / sink (else the furniture centroid) in frame — no more than PHOTO_TURN off the view, turned for more
      // floor — from ≥ 0.5 m off anything at eye level
      for (const f of items.filter((f) => f.assetId !== 'shower_screen' && (kitAsset(f.assetId)?.sizeM.y ?? 0) + (kitAsset(f.assetId)?.mountY ?? 0) > 1.2))
        expect(Math.hypot(v.p.x - f.x, v.p.y - f.y), `${name} ${f.id}`).toBeGreaterThan(0.5)
      expect(deg(v.face, sub(target, v.p)), name).toBeLessThanOrEqual(PHOTO_TURN + 1e-6)
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
    ])
  })

  const both = ([typeA, typeB, typeC] as unknown as Unit[]).map((u0) => {
    const rs = core.deriveRooms(u0)
    return { u: { ...u0, furniture: furnish(u0, rs) } as Unit, rs }
  })
  /** roomView, once per unit and room: the whole-flat tests below share the views (each costs up to ~0.1 s). */
  const memo = new WeakMap<Unit, Map<Room, ReturnType<typeof roomView>>>()
  const view = (r: Room, u: Unit) => {
    const m = memo.get(u) ?? memo.set(u, new Map()).get(u)!
    return m.get(r) ?? m.set(r, roomView(r, u)).get(r)!
  }
  const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
  const at = (p: Pt, d: Pt, s: number): Pt => ({ x: p.x + d.x * s, y: p.y + d.y * s })
  /** Every first frame of a flat: the entry and each Rooms-list jump. */
  const frames = ({ u, rs }: (typeof both)[number]) => {
    const e = entrySpawn(u, rs)!
    return [{ name: `${u.id} entry`, v: e as { p: Pt; face: Pt; pitch?: number } }, ...listedRooms(u, rs).map((r) => ({ name: `${u.id} ${r.name}`, v: view(r, u) }))]
  }
  const deg = (a: Pt, b: Pt) => (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / Math.hypot(a.x, a.y) / Math.hypot(b.x, b.y)))) * 180) / Math.PI

  it('swings: kind decides — every door has a leaf (hinged or not, any width), a slider never does', () => {
    const o = { id: 'o', offsetM: 0, heightM: 2.1, sillM: 0 }
    expect(swings({ ...o, kind: 'door', widthM: 1.8 })).toBe(true)
    expect(swings({ ...o, kind: 'door', widthM: 0.9, hinge: 'b' })).toBe(true)
    expect(swings({ ...o, kind: 'slider', widthM: 1.8 })).toBe(false)
    expect(swings({ ...o, kind: 'slider', widthM: 0.9, hinge: 'a', swing: 'in' })).toBe(false)
  })

  it('inSight: walls hide what is behind them; passages, windows and sliders do not, nor do rails; a hinged door (ajar 20°) does', () => {
    const [a] = both
    const e = entrySpawn(a.u, a.rs)!
    const ac = (room: string) => a.u.furniture.find((f) => f.assetId === 'ac_split' && f.roomId === a.rs.find((r) => r.name === room)!.id)!
    expect(inSight(a.u, e.p, ac('Dining & family living'))).toBe(true)
    expect(inSight(a.u, e.p, ac('Bed-3')), 'behind the Bed-3 wall, 1.5 m away').toBe(false)
    expect(inSight(a.u, e.p, ac('Living room')), 'through the 4.7 m passage').toBe(true)
    expect(inSight(a.u, e.p, ac('Bed-1')), 'behind the Bed-1 door').toBe(false)
  })

  it('nothing overhead spoils a first frame: a pendant, fan or wall AC of ANY room in sight keeps its distance, farther when in frame (A, B, C)', WHOLE, () => {
    const lim: Record<string, [number, number]> = { modern_ceiling_lamp_01: [HANG_CLEAR, HANG_IN_VIEW], ceiling_fan: [FAN_CLEAR, FAN_IN_VIEW], ac_split: [AC_NEAR, AC_IN_VIEW] }
    for (const flat of both) {
      expect(flat.u.furniture.filter((f) => f.assetId === 'modern_ceiling_lamp_01').length).toBeGreaterThan(0)
      for (const { name, v } of frames(flat))
        for (const f of flat.u.furniture.filter((f) => lim[f.assetId] && inSight(flat.u, v.p, f))) {
          const [near, inView] = lim[f.assetId]
          const d = Math.hypot(f.x - v.p.x, f.y - v.p.y)
          // a wall AC behind the eye's plane is out of the frame (C Bed-3 stands under its AC, at the bed's foot)
          if (f.assetId === 'ac_split' && (f.x - v.p.x) * v.face.x + (f.y - v.p.y) * v.face.y < 0) continue
          expect(d, `${name}: ${f.id} overhead`).toBeGreaterThanOrEqual(near)
          if (d < inView) expect(deg(v.face, sub(f, v.p)), `${name}: ${f.id} looming in frame`).toBeGreaterThan(53)
        }
    }
    // Type B walks in at the dining end, 2 m in front of the pendant: the entry slides on down the room past it
    const { u, rs } = both[1]
    const e = entrySpawn(u, rs)!
    expect(core.roomAt(e.p, rs, u)?.id).toBe('r_living')
    expect(e.face.x, 'still looking down the room').toBeGreaterThan(0.9)
  })

  /**
   * What fills a first frame, its `closeLeaf` shut (a shut door still counts): the largest share of one door leaf or slab
   * (wardrobe, shelf, tall piece; not a kitchen's run, a shower's glass or a closet's own rails), of one leaf alone, and the
   * share of wall hit within NEAR_WALL.
   */
  const frameFill = (u: Unit, r: Room, v: { p: Pt; face: Pt; pitch?: number; closeLeaf?: string }) => {
    const leaves = new Set(u.walls.flatMap((w) => w.openings.filter(swings).map((o) => o.id)))
    const flat = new Set([
      ...leaves,
      ...u.furniture
        .filter((f) => {
          const k = kitAsset(f.assetId)!
          const run = k.category === 'kitchen' && f.assetId !== 'fridge' // a free-standing fridge is no part of the run
          return k.mount !== 'ceiling' && f.assetId !== 'shower_screen' && !run && (k.category === 'wardrobe' || k.category === 'shelf' || k.sizeM.y > 1.6) && !(r.kind === 'closet' && f.roomId === r.id)
        })
        .map((f) => f.id),
    ])
    const walls = new Set(u.walls.filter((w) => w.heightM >= 1.6).map((w) => w.id)) // rails and curbs are no near plaster
    const shares = [...frameShares(u, v.p, v.face, v.pitch, Infinity, v.closeLeaf)]
    return {
      flat: Math.max(0, ...shares.filter(([id]) => flat.has(id)).map(([, s]) => s)),
      leaf: Math.max(0, ...shares.filter(([id]) => leaves.has(id)).map(([, s]) => s)),
      wall: [...frameShares(u, v.p, v.face, v.pitch, NEAR_WALL, v.closeLeaf)].filter(([id]) => walls.has(id)).reduce((t, [, s]) => t + s, 0),
    }
  }

  it('no ajar door leaf, wardrobe or other tall piece fills more than FLAT_MAX of a first frame (its closeLeaf shut), no wall within NEAR_WALL more than NEAR_WALL_MAX (A, B, C, Sheltech A) — but the door views (closets, a cot as long as its room), where no leaf fills more than DOOR_LEAF_MAX; a shut leaf takes back LEAF_GAIN of its frame', WHOLE, () => {
    const s0 = sheltechA as unknown as Unit
    const s = { u: { ...s0, furniture: furnish(s0, core.deriveRooms(s0)) } as Unit, rs: core.deriveRooms(s0) }
    const door: string[] = []
    const shut: string[] = []
    for (const { u, rs } of [...both, s]) {
      const leafIds = new Set(u.walls.flatMap((w) => w.openings.filter(swings).map((o) => o.id)))
      const e = entrySpawn(u, rs)!
      const views = [{ name: `${u.id} entry`, r: core.roomAt(e.p, rs, u)!, v: e as ReturnType<typeof roomView> }, ...listedRooms(u, rs).map((r) => ({ name: `${u.id} ${r.name}`, r, v: view(r, u) }))]
      for (const { name, r, v } of views) {
        const f = frameFill(u, r, v)
        if (v.closeLeaf) {
          shut.push(name.replace(/unit_(type_)?/, ''))
          expect(leafIds.has(v.closeLeaf), `${name}: shuts a hinged leaf`).toBe(true)
          // …standing in its doorway (a small wet room), the ajar leaf would be at the eye; else shutting takes back LEAF_GAIN
          const w = u.walls.find((x) => x.openings.some((o) => o.id === v.closeLeaf))!
          const o = w.openings.find((x) => x.id === v.closeLeaf)!
          const fr = core.wallFrame(w, u.vertices)
          const along = sub(v.p, fr.origin).x * fr.dir.x + sub(v.p, fr.origin).y * fr.dir.y
          const inDoorway = along >= o.offsetM && along <= o.offsetM + o.widthM && Math.abs(sub(v.p, fr.origin).x * fr.normal.x + sub(v.p, fr.origin).y * fr.normal.y) < 0.3
          const share = (s?: string) => frameShares(u, v.p, v.face, v.pitch, Infinity, s).get(v.closeLeaf!) ?? 0
          if (!inDoorway) expect(share(v.closeLeaf), `${name}: shutting takes back LEAF_GAIN`).toBeLessThanOrEqual(share() - LEAF_GAIN + 1e-9)
        }
        // steeper than WET_PITCH: only a door view looks down that far (at a cot)
        if (((v.pitch ?? 0) < WET_PITCH - 1e-9 && !v.hfov) || r.kind === 'closet') {
          door.push(name.replace(/unit_(type_)?/, ''))
          expect(f.leaf, `${name}: a leaf in a door view`).toBeLessThanOrEqual(DOOR_LEAF_MAX)
          continue
        }
        expect(f.flat, `${name}: a leaf or slab`).toBeLessThanOrEqual(FLAT_MAX)
        expect(f.wall, `${name}: near wall`).toBeLessThanOrEqual(NEAR_WALL_MAX)
      }
    }
    // the closets (the far door at the end of the aisle), the A/C help beds (a leaf at each end of a 1.8 m aisle); the
    // small wet rooms that were door views are framed from their doorway now
    expect(door).toEqual(['a_2703 Walk-in closet', 'a_2703 Help bed', 'c_2254 Walk-in closet', 'c_2254 Help bed'])
    // shut for the shot: leaves standing into a bath frame, the far leaf over the C cot, the wet rooms' own leaves behind the
    // eye in their doorway (the door corner), a room shot from its doorway (B Veranda (living), Sheltech A Bed 4);
    // a door seen along its own wall fills the same shut or ajar and stays ajar
    expect(shut).toEqual([
      'a_2703 Bath-2', 'a_2703 Bath-3', 'b_1747 Bath-1', 'b_1747 Bath-2', 'b_1747 Veranda (living)', 'c_2254 Bath-2', 'c_2254 Bath-3', 'c_2254 Help bed',
      'sheltech_a_2736 Toilet 1', 'sheltech_a_2736 Bed 4', 'sheltech_a_2736 PDR', 'sheltech_a_2736 Toilet',
    ])
    // the wave-9 frames this turns down: B Bath-3's leaf (31 %), B Bed-2's wardrobe (24 %) — the director's list
    const b = both[1]
    const wave9 = [
      ['Bath-3', { p: { x: 5.095, y: 0.97 }, face: { x: 0.0872, y: 0.9962 }, pitch: -Math.PI / 18 }],
      ['Bed-2', { p: { x: 10.529, y: 11.098 }, face: { x: -0.9925, y: -0.1219 } }],
    ] as const
    for (const [name, v] of wave9) expect(frameFill(b.u, b.rs.find((r) => r.name === name)!, v).flat, name).toBeGreaterThan(FLAT_MAX)
  })

  it('bath jumps show each fitting by what the projector sees (wetBand, boxInFrame): the vanity/basin WHOLE from counter to mirror top wherever a spot allows (else at least half of it), with as many other fittings as fit, no more than 10° down (a small wet room 25°) — A, B, C, Sheltech A + B', WHOLE, () => {
    const sh = ([sheltechA, sheltechB] as unknown as Unit[]).map((u0) => {
      const rs = core.deriveRooms(u0)
      return { u: { ...u0, furniture: furnish(u0, rs) } as Unit, rs }
    })
    const two: string[] = [] // the vanity/basin whole and another fitting whole
    const half: string[] = [] // no spot shows the vanity/basin whole
    for (const { u, rs } of [...both, ...sh])
      for (const r of listedRooms(u, rs).filter((x) => x.kind === 'bath')) {
        const name = `${u.id} ${r.name}`.replace(/unit_(type_)?/, '')
        const v = view(r, u)
        expect(core.pointInPolygon(v.p, core.roomInnerPolygon(r, u)), `${name} inside`).toBe(true)
        // (a WC under TINY_WET_SQM looks at its WC from its door through a narrower lens: steeper, checked below)
        expect(v.pitch! >= (v.hfov ? -Math.PI / 4 : r.areaSqm < SMALL_WET ? WET_PITCH : BATH_PITCH) - 1e-9 && v.pitch! <= 1e-9, `${name}: pitch`).toBe(true)
        const shares = u.furniture.flatMap((f) => {
          const b = f.roomId === r.id && wetBand(kitAsset(f.assetId)!, placementSize(f))
          return b ? [{ f, s: boxInFrame(f, placementSize(f), b.h0, b.h1, v.p, v.face, v.pitch!) }] : []
        })
        const hero = shares.find((x) => /^(vanity|basin)$/.test(x.f.assetId))!
        // (C Bath-3's pedestal basin, 1.2 m off the shower, showed from nowhere at a 1.6 m eye; at 1.45 m 4 of its 6 corners)
        expect(hero.s, `${name}: the ${hero.f.assetId}`).toBeGreaterThanOrEqual(0.5)
        if (hero.s < 1) half.push(name)
        else if (shares.some((x) => x !== hero && x.s === 1)) two.push(name)
      }
    // (the 1.45 m eye adds Sheltech A Toilet 2 + 3 and Sheltech B Toilet 2: their WC whole beside the vanity)
    expect(two).toEqual(['a_2703 Bath-2', 'b_1747 Bath-1', 'c_2254 Bath-2', 'sheltech_a_2736 Toilet 2', 'sheltech_a_2736 Toilet 3', 'sheltech_b_2736 Toilet 1', 'sheltech_b_2736 Toilet 2', 'sheltech_b_2736 PDR'])
    // vanity and WC/shower at opposite ends of a 1.5 m-wide bath, or a WC under 3 m²: the vanity/basin whole only from inside the
    // shower or from a spot whose frame a leaf or near tile fills (B Bath-3 23 %)
    expect(half).toEqual(['a_2703 Bath-3', 'a_2703 H. toilet', 'b_1747 Bath-3', 'b_1747 Powder room', 'c_2254 Bath-3', 'sheltech_a_2736 PDR', 'sheltech_a_2736 Toilet', 'sheltech_b_2736 Toilet'])
    // a WC under TINY_WET_SQM (A's servant's toilet, 1.5 m²): seen from its doorway, never from over its basin (qa3 P2)
    const tiny = [...both, ...sh].flatMap(({ u, rs }) => listedRooms(u, rs).filter((r) => r.kind === 'bath' && Math.abs(core.signedArea(core.roomInnerPolygon(r, u))) < TINY_WET_SQM).map((r) => ({ u, r })))
    expect(tiny.map(({ u, r }) => `${u.id} ${r.name}`.replace(/unit_(type_)?/, ''))).toEqual(['a_2703 H. toilet', 'sheltech_b_2736 Toilet']) // (B's and C's are under 2 m² on the plan's lines too: not in the Rooms list)
    for (const { u, r } of tiny) {
      const v = view(r, u)
      const gap = Math.min(
        ...r.wallIds.flatMap((id) => {
          const w = u.walls.find((x) => x.id === id)!
          const f = core.wallFrame(w, u.vertices)
          return w.openings.filter((o) => o.kind !== 'window').map((o) => Math.hypot(v.p.x - (f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2)), v.p.y - (f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2))) - w.thicknessM / 2)
        }),
      )
      expect(gap, `${u.id} ${r.name}: in its doorway`).toBeLessThan(0.2)
      // through a narrower lens, looking at its WC just over the lid: the basin beside the door at the frame's edge (polish2)
      expect(v.hfov, `${u.id} ${r.name}: a narrower lens`).toBe(TINY_HFOV)
      const wc = u.furniture.find((f) => f.roomId === r.id && f.assetId === 'toilet')!
      const d = { x: wc.x - v.p.x, y: wc.y - v.p.y }
      expect(Math.abs(Math.atan2(d.y, d.x) - Math.atan2(v.face.y, v.face.x))).toBeLessThan(1e-6)
      expect(v.pitch).toBeCloseTo(Math.atan2(TINY_AIM_M - EYE, Math.hypot(d.x, d.y)), 6)
    }
    // every other room keeps the walk's lens
    for (const { u, rs } of [...both, ...sh]) for (const r of listedRooms(u, rs)) if (!tiny.some((t) => t.r === r)) expect(view(r, u).hfov, `${u.id} ${r.name}`).toBeUndefined()
    // the director's worst: Sheltech B's PDR shows its basin AND its WC whole (was a top-down basin and a WC edge)
    const pdr = sh[1].rs.find((r) => r.name === 'PDR')!
    const v = view(pdr, sh[1].u)
    for (const id of ['basin', 'toilet']) {
      const f = sh[1].u.furniture.find((x) => x.roomId === pdr.id && x.assetId === id)!
      const b = wetBand(kitAsset(id)!, placementSize(f))!
      expect(boxInFrame(f, placementSize(f), b.h0, b.h1, v.p, v.face, v.pitch!), `SB PDR ${id}`).toBe(1)
    }
  })

  it('help room with a cot (cot or the short cot_s): lengthwise from its foot end, its pillow half centred, ≤ 15° down (B); a cot as long as its room from a door, its centre in the lower third (A, C)', () => {
    const cots = both.flatMap(({ u, rs }) => listedRooms(u, rs).flatMap((r) => u.furniture.filter((f) => f.roomId === r.id && f.assetId.startsWith('cot')).map((cot) => ({ u, r, cot }))))
    expect(cots.length).toBe(3)
    const foot: string[] = []
    for (const { u, r, cot } of cots) {
      const name = `${u.id} ${r.name}`
      const v = view(r, u)
      const L = kitAsset(cot.assetId)!.sizeM.x
      const axis = { x: Math.cos((cot.rotationDeg * Math.PI) / 180), y: Math.sin((cot.rotationDeg * Math.PI) / 180) } // toward the foot (the pillow is at −x)
      if (sub(v.p, cot).x * axis.x + sub(v.p, cot).y * axis.y >= L / 2) {
        foot.push(name)
        expect(v.pitch!, `${name}: ≤ 15° down`).toBeGreaterThanOrEqual(HELP_PITCH - 1e-9)
        expect(deg(v.face, sub(at(cot, axis, -L / 4), v.p)), `${name}: its pillow half centred`).toBeLessThan(1e-6)
        continue
      }
      expect(deg(v.face, sub(cot, v.p)), `${name}: cot in frame`).toBeLessThanOrEqual(40 + 1e-6)
      // screen height of the cot centre (0.23 m up): tan(angle below the view axis) / tan(half the 65° vertical FOV)
      const depth = (cot.x - v.p.x) * v.face.x + (cot.y - v.p.y) * v.face.y
      const ndc = Math.tan(Math.atan2(0.23 - EYE, depth) - (v.pitch ?? 0)) / Math.tan((32.5 * Math.PI) / 180)
      expect(ndc, `${name}: cot centre in the lower third`).toBeLessThan(-1 / 3)
      expect(ndc, `${name}: cot centre on screen`).toBeGreaterThan(-1)
    }
    expect(foot).toEqual(['unit_type_b_1747 Help room'])
  })

  it('walk-in closets are seen from 0.4–0.6 m inside a door down the aisle, along the rails, 5° down (A, C)', () => {
    for (const { u, rs } of [both[0], both[2]]) {
      const r = rs.find((x) => x.name === 'Walk-in closet')!
      const v = view(r, u)
      expect(v.pitch, u.id).toBe(CLOSET_PITCH)
      const spot = u.walls
        .filter((w) => r.wallIds.includes(w.id))
        .flatMap((w) => {
          const f = core.wallFrame(w, u.vertices)
          return w.openings.filter((o) => o.kind === 'door').map((o) => {
            const c = at(f.origin, f.dir, o.offsetM + o.widthM / 2)
            return { along: Math.abs(sub(v.p, c).x * f.dir.x + sub(v.p, c).y * f.dir.y), into: Math.abs(sub(v.p, c).x * f.normal.x + sub(v.p, c).y * f.normal.y) - w.thicknessM / 2 }
          })
        })
        .find((d) => d.along < 1e-6 && d.into > 0.4 - 1e-6 && d.into < 0.6 + 1e-6)
      expect(spot, `${u.id}: just inside a door`).toBeDefined()
      for (const f of u.furniture.filter((x) => x.roomId === r.id && x.assetId === 'closet_rail')) {
        const ax = { x: Math.cos((f.rotationDeg * Math.PI) / 180), y: Math.sin((f.rotationDeg * Math.PI) / 180) } // along the rail
        expect(Math.min(deg(v.face, ax), deg(v.face, { x: -ax.x, y: -ax.y })), `${u.id} ${f.id}: along it, not into it`).toBeLessThanOrEqual(40)
      }
    }
  })

  it('no wardrobe, shelf or other tall piece looms in a first frame: none in sight within TALL_IN_VIEW with a corner within ±40° of the view; B Bed-2 keeps 1.3 m off its wardrobe (A, B, C)', WHOLE, () => {
    for (const flat of both)
      for (const { name, v } of frames(flat)) {
        // a closet's rails and a galley's run are the room itself: its 1 m aisle / 2.3 m depth cannot keep 1.5 m off them
        if (/Walk-in closet|Kitchen/.test(name)) continue
        for (const f of flat.u.furniture) {
          const k = kitAsset(f.assetId)!
          if (k.mount === 'ceiling' || f.assetId === 'shower_screen' || k.kind === 'curtain' || !(k.category === 'wardrobe' || k.category === 'shelf' || k.sizeM.y > 1.6)) continue
          if (footprintDist(v.p, f, k.sizeM) < TALL_IN_VIEW && inSight(flat.u, v.p, f))
            for (const q of [f, ...footprint(f, f.rotationDeg, k.sizeM)]) expect(deg(v.face, sub(q, v.p)), `${name}: ${f.id}`).toBeGreaterThan(40)
        }
      }
    // B Bed-2: its doors pin the bed-foot spots to the east end; the one farthest from the wardrobe (the art director's third of the frame)
    const b = both[1]
    const bed2 = b.rs.find((r) => r.name === 'Bed-2')!
    const w = b.u.furniture.find((f) => f.roomId === bed2.id && f.assetId.startsWith('wardrobe'))!
    expect(footprintDist(view(bed2, b.u).p, w, kitAsset(w.assetId)!.sizeM)).toBeGreaterThan(1.3) // 1.33: a 1.45 m eye 5° down shows 0.38 of its floor from here (wave 13: 1.4 m, 0.33); FLAT_MAX still holds its slab
  })

  it('kitchen jumps stand across the room from the run, in front of the sink, and see the whole run (A, B, C; B is the model)', () => {
    for (const { u, rs } of both) {
      const r = rs.find((x) => x.kind === 'kitchen')!
      const v = view(r, u)
      const sink = u.furniture.find((f) => f.roomId === r.id && f.assetId === 'kitchen_sink')!
      const t = (sink.rotationDeg * Math.PI) / 180
      expect(sub(v.p, sink).x * -Math.sin(t) + sub(v.p, sink).y * Math.cos(t), `${u.id} across the room from the sink`).toBeGreaterThan(1.3)
      // each piece's centre at counter height inside the frame (the projector: 5° down, the frame's side reaches past 48° low)
      for (const f of u.furniture.filter((f) => f.roomId === r.id && /^(kitchen_|fridge)/.test(f.assetId))) {
        const q = project(v.p, v.face, v.pitch ?? 0, f, 0.9)
        expect(q.z > 0 && Math.abs(q.x) < 1 && Math.abs(q.y) < 1, `${u.id} ${f.assetId} in view`).toBe(true)
      }
    }
    // B has 3.2 m in front of its sink, no galley: it keeps the full door zone and its wave-8 diagonal
    const { u, rs } = both[1]
    const v = view(rs.find((x) => x.kind === 'kitchen')!, u)
    for (const w of u.walls.filter((x) => rs.find((r) => r.kind === 'kitchen')!.wallIds.includes(x.id)))
      for (const o of w.openings.filter((x) => x.kind !== 'window')) {
        const f = core.wallFrame(w, u.vertices)
        expect(Math.hypot(v.p.x - f.origin.x - f.dir.x * (o.offsetM + o.widthM / 2), v.p.y - f.origin.y - f.dir.y * (o.offsetM + o.widthM / 2)), o.id).toBeGreaterThanOrEqual(DOOR_CLEAR)
      }
  })

  it('veranda jumps are photos of the veranda — its floor and pieces with a slider into the flat in the frame (the director\'s best wave-13 frames: planters and paving with the lit bedroom beyond; worst: a bare rail and towers, a blank side wall), 5 or 10° down (A, B, C, Sheltech A + B)', WHOLE, () => {
    const sh = ([sheltechA, sheltechB] as unknown as Unit[]).map((u0) => {
      const rs = core.deriveRooms(u0)
      return { u: { ...u0, furniture: furnish(u0, rs) } as Unit, rs }
    })
    const way: string[] = []
    for (const { u, rs } of [...both, ...sh]) {
      const walls = new Set(u.walls.filter((w) => w.heightM >= 1.6).map((w) => w.id))
      for (const r of listedRooms(u, rs).filter((x) => x.kind === 'balcony')) {
        const name = `${u.id} ${r.name}`.replace(/unit_(type_)?/, '')
        const v = view(r, u)
        expect([ROOM_PITCH, VERANDA_PITCH], name).toContain(v.pitch)
        const sliders = u.walls
          .filter((w) => r.wallIds.includes(w.id))
          .flatMap((w) => w.openings.filter((o) => o.kind !== 'window' && !swings(o)).map((o) => at(core.wallFrame(w, u.vertices).origin, core.wallFrame(w, u.vertices).dir, o.offsetM + o.widthM / 2)))
        const frames = (c: Pt) => {
          const q = project(v.p, v.face, v.pitch!, c, 1.1)
          return q.z > 0.3 && Math.abs(q.x) <= 0.8 && Math.abs(q.y) <= 0.8
        }
        if (sliders.some(frames)) way.push(name)
        // wave 13's regressions (a blank side wall filling half the frame): plaster within SIDE_WALL under SIDE_WALL_MAX
        if (/(b_1747 Veranda \(living\)|Veranda \(study\)|Veranda 4)$/.test(name))
          expect([...frameShares(u, v.p, v.face, v.pitch, SIDE_WALL, v.closeLeaf)].filter(([id]) => walls.has(id)).reduce((t, [, s]) => t + s, 0), `${name}: side wall`).toBeLessThanOrEqual(SIDE_WALL_MAX)
        // …and no veranda's end wall 2–3 m off fills it (wave 14 before VERANDA_WALL: Sheltech A Veranda 4 72 %, A Veranda (bed-1) 48 %)
        expect([...frameShares(u, v.p, v.face, v.pitch, VERANDA_WALL, v.closeLeaf)].filter(([id]) => walls.has(id)).reduce((t, [, s]) => t + s, 0), `${name}: plaster`).toBeLessThanOrEqual(VERANDA_WALL_MAX)
      }
    }
    // all but the 1.5 m service verandas of B and Sheltech A, shot along themselves (their kitchen door or slider behind the eye)
    expect(way).toEqual([
      'a_2703 Veranda (bed-1)', 'a_2703 Veranda (living)', 'a_2703 Veranda (study)', 'b_1747 Veranda (bed-1)', 'b_1747 Veranda (living)',
      'c_2254 Veranda (bed-1)', 'c_2254 Veranda (living)', 'c_2254 Veranda (study)', 'sheltech_a_2736 Veranda 1', 'sheltech_a_2736 Veranda 4',
      'sheltech_b_2736 Veranda (kitchen)', 'sheltech_b_2736 Veranda 1', 'sheltech_b_2736 Veranda 4',
    ])
  })

  it('Sheltech A: the entry and an empty foyer or passage look on into the flat through their widest opening; a service veranda is shot along itself; a bed filling its room is seen from its door, not from on it', WHOLE, () => {
    const s0 = sheltechA as unknown as Unit
    const rs = core.deriveRooms(s0)
    const u = { ...s0, furniture: furnish(s0, rs) } as Unit
    const e = entrySpawn(u, rs)!
    expect(core.roomAt(e.p, rs, u)?.name, 'entered from the main door into the foyer').toBe('Foyer')
    const ahead = (v: { p: Pt; face: Pt }, m: number) => core.roomAt(at(v.p, v.face, m), rs, u)?.name
    expect(ahead(e, 3), 'entry: on into the living room').toBe('Living')
    const room = (n: string) => rs.find((r) => r.name === n)!
    expect(ahead(view(room('Foyer'), u), 3), 'foyer: into the living room').toBe('Living')
    expect(ahead(view(room('Passage'), u), 2.5), 'passage: into the dining room').toBe('Dining')
    // the director on wave 13's frame back into the kitchen: "the veranda itself is never shown" — now shot along itself
    expect(ahead(view(room('Veranda (kitchen)'), u), 1), 'service veranda: along itself, not back into the kitchen').toBe('Veranda (kitchen)')
    const v = view(room('Bed 4'), u)
    const bed = u.furniture.find((f) => f.roomId === room('Bed 4').id && f.assetId.startsWith('bed_'))!
    expect(footprintDist(v.p, bed, kitAsset(bed.assetId)!.sizeM), 'Bed 4: off the bed').toBeGreaterThanOrEqual(0.2)
    expect(deg(v.face, sub(bed, v.p)), 'Bed 4: the bed in frame').toBeLessThanOrEqual(40)
  })

  it('a room frame keeps plaster within SIDE_WALL (2 m) under SIDE_WALL_MAX where a spot allows — the wave-11 director\'s "close blank wall fills a quarter" frames (Sheltech A Bed 2; Sheltech B Bed 1, Bed 3, Kitchen, Foyer)', WHOLE, () => {
    const side = (u0: Unit, names: string[]) => {
      const rs = core.deriveRooms(u0)
      const u = { ...u0, furniture: furnish(u0, rs) } as Unit
      const walls = new Set(u.walls.filter((w) => w.heightM >= 1.6).map((w) => w.id))
      return names.map((n) => {
        const v = view(rs.find((r) => r.name === n)!, u)
        return [n, [...frameShares(u, v.p, v.face, v.pitch, SIDE_WALL, v.closeLeaf)].filter(([id]) => walls.has(id)).reduce((t, [, s]) => t + s, 0)] as const
      })
    }
    // wave 11 (HEAD before this rule): 17, 17, 20, 34, 25 % of the frame
    for (const [n, s] of [...side(sheltechA as unknown as Unit, ['Bed 2']), ...side(sheltechB as unknown as Unit, ['Bed 1', 'Bed 3', 'Kitchen', 'Foyer'])]) expect(s, n).toBeLessThanOrEqual(SIDE_WALL_MAX)
  })

  it('frameShares: a 1 m door leaf ajar 20° fills most of the frame from 0.5 m, under 15 % from 3 m; a wardrobe 1.5 m ahead fills half', () => {
    const bare: Unit = {
      id: 'u', projectName: '', name: '', northDeg: 0, areaSqft: 0, roomLabels: [], finishSlots: [], furniture: [],
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 8, y: 0 }],
      walls: [{ id: 'w', a: 'a', b: 'b', thicknessM: 0.1, heightM: 3, openings: [{ id: 'd', kind: 'door', offsetM: 3, widthM: 1, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' }] }],
    }
    // openings.ts: hinged at vertex a's jamb on the swing face (−normal = −y), turned 20° toward it
    const r = (20 * Math.PI) / 180
    const mid = at({ x: 3, y: -0.05 }, { x: Math.cos(r), y: -Math.sin(r) }, 0.5)
    const out = { x: -Math.sin(r), y: -Math.cos(r) } // the leaf's face on the swing side
    const leaf = (d: number) => frameShares(bare, at(mid, out, d), { x: -out.x, y: -out.y }).get('d') ?? 0
    expect(leaf(0.5)).toBeGreaterThan(0.6)
    expect(leaf(3)).toBeGreaterThan(0.03)
    expect(leaf(3)).toBeLessThan(0.15)
    // shut (a view's closeLeaf), the leaf plugs its doorway: 2 m in front of the wall, wall + leaf fill what a doorless
    // wall would (but the 3 cm leaf-to-frame gaps)
    const shut = frameShares(bare, { x: 3.5, y: -2 }, { x: 0, y: 1 }, 0, Infinity, 'd')
    const doorless: Unit = { ...bare, walls: [{ ...bare.walls[0], openings: [] }] }
    expect(shut.get('d')).toBeGreaterThan(0.1)
    expect(shut.get('w')! + shut.get('d')!).toBeGreaterThan(0.9 * frameShares(doorless, { x: 3.5, y: -2 }, { x: 0, y: 1 }).get('w')!)
    const robe: Unit = { ...bare, furniture: [{ id: 'x', assetId: 'wardrobe_tall', roomId: 'r', x: 4, y: -3, rotationDeg: 0 }] }
    expect(frameShares(robe, { x: 4, y: -4.5 }, { x: 0, y: 1 }).get('x')).toBeGreaterThan(0.5)
    // the wave-9 C Bed-1 frame (15:30 score shot: the wardrobe spans x 112–490, y 220–733 of 1280 × 720, ≈ 16 %)
    const c = both[2]
    const w = c.u.furniture.find((f) => f.roomId === 'r_bed1' && f.assetId === 'wardrobe_tall')!
    expect(frameShares(c.u, { x: 15.1855, y: 14.525 }, { x: -0.6518, y: -0.7584 }).get(w.id)).toBeCloseTo(0.16, 1)
  })

  it('frameShares in a 4 × 3 m box: the far wall fills most of the frame, floor, ceiling and the view out of a window count for nobody, the first hit hides what is behind it, `within` keeps near hits only', () => {
    const V = [[0, 0], [4, 0], [4, 3], [0, 3]].map(([x, y], i) => ({ id: `v${i}`, x, y }))
    const box = (openings: Unit['walls'][number]['openings'] = [], furniture: Unit['furniture'] = []): Unit => ({
      id: 'u', projectName: '', name: '', northDeg: 0, areaSqft: 0, roomLabels: [], finishSlots: [], furniture, vertices: V,
      // w1 is the east wall, 2 m ahead of the eye
      walls: V.map((v, i) => ({ id: `w${i}`, a: v.id, b: V[(i + 1) % 4].id, thicknessM: 0.1, heightM: 2.7, openings: i === 1 ? openings : [] })),
    })
    const p = { x: 2, y: 1.5 }
    const east = { x: 1, y: 0 }
    const plain = frameShares(box(), p, east)
    expect([...plain.keys()].sort()).toEqual(['w0', 'w1', 'w2']) // the wall behind is out of the frame
    expect(plain.get('w1')).toBeGreaterThan(0.6)
    expect(plain.get('w0')).toBeCloseTo(plain.get('w2')!, 9)
    // level at a 1.45 m eye the 2 m-off walls fill the frame (the floor enters 2.28 m ahead); 10° down the floor counts for nobody
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
    expect(sum(plain)).toBeGreaterThan(0.99)
    const total = sum(frameShares(box(), p, east, (-10 * Math.PI) / 180))
    expect(total).toBeLessThan(0.97)
    expect(total).toBeGreaterThan(0.8)
    // a 1 × 1.2 m window in the east wall: the frame through it counts for nobody
    const win = frameShares(box([{ id: 'win', kind: 'window', offsetM: 1, widthM: 1, heightM: 1.2, sillM: 0.9 }]), p, east)
    expect(plain.get('w1')! - win.get('w1')!).toBeGreaterThan(0.08)
    expect(win.get('w0')).toBeCloseTo(plain.get('w0')!, 9)
    // a wardrobe behind the east wall is hidden; one in front of it fills over half the frame
    expect(frameShares(box([], [{ id: 'x', assetId: 'wardrobe_tall', roomId: 'r', x: 5, y: 1.5, rotationDeg: 90 }]), p, east).has('x')).toBe(false)
    const robe = frameShares(box([], [{ id: 'x', assetId: 'wardrobe_tall', roomId: 'r', x: 3.6, y: 1.5, rotationDeg: 90 }]), p, east)
    expect(robe.get('x')).toBeGreaterThan(0.5)
    expect(robe.get('w1')).toBeLessThan(0.15)
    // within: every wall is 1.5 m or more off — none within 1 m; 0.6 m from the east wall it is the whole frame
    expect(frameShares(box(), p, east, 0, 1).size).toBe(0)
    expect(frameShares(box(), { x: 3.4, y: 1.5 }, east, 0, 1.2).get('w1')).toBeCloseTo(1, 9)
  })

  it('floorShare: the room floor in frame — more from a corner down the diagonal than from the middle at a wall, none behind the eye, none round an L\'s bend; the eye is 1.45 m', () => {
    expect(EYE).toBe(1.45)
    const box: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
    const corner = floorShare(box, { x: 0.4, y: 0.4 }, { x: 0.8, y: 0.6 })
    const middle = floorShare(box, { x: 2, y: 1.5 }, { x: 1, y: 0 })
    expect(corner).toBeGreaterThan(0.3)
    expect(middle).toBeLessThan(0.05) // level, 2 m off the wall: the floor enters the frame 2.28 m ahead
    expect(floorShare(box, { x: 2, y: 1.5 }, { x: 1, y: 0 }, ROOM_PITCH), '5° down shows more').toBeGreaterThan(middle)
    expect(floorShare(box, { x: 3.9, y: 1.5 }, { x: 1, y: 0 })).toBe(0) // facing the wall 0.1 m off: all of it behind the eye
    // an L (a 4 × 4 square less its north-east 2 × 2): from the south-west corner looking north, the east leg is round the bend
    const L: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }]
    const sq: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]
    const from = { x: 0.3, y: 3.7 }
    const toSE = { x: 0.7, y: -0.7 }
    expect(floorShare(L, from, toSE) * 12).toBeLessThan(floorShare(sq, from, toSE) * 16) // the L's hidden cells are the square's seen ones
  })

  it('pieceInFrame: a queen bed is whole (foot at its mattress, headboard top) 3.5 m in front of it, not 1.5 m off its foot; every bedroom and room jump is level or ROOM_PITCH down (further only to clear an AC, the least that does, AC_DIP at most) and shows ≥ 20 % of its floor with the bed ≥ 4 of 6 corners in (A, B, C, Sheltech A + B)', WHOLE, () => {
    const bed = { id: 'b', assetId: 'bed_queen', roomId: 'r', x: 0, y: 0, rotationDeg: 0 } // faces +y, headboard at −y
    expect(pieceInFrame(bed, { x: 0, y: 3.5 }, { x: 0, y: -1 }, ROOM_PITCH)).toBe(1)
    expect(pieceInFrame(bed, { x: 0, y: 2.6 }, { x: 0, y: -1 })).toBeLessThan(1)
    const sh = ([sheltechA, sheltechB] as unknown as Unit[]).map((u0) => {
      const rs = core.deriveRooms(u0)
      return { u: { ...u0, furniture: furnish(u0, rs) } as Unit, rs }
    })
    const rows: string[] = []
    for (const { u, rs } of [...both, ...sh])
      for (const r of listedRooms(u, rs).filter((x) => ['bed', 'living', 'dining', 'kitchen', 'study'].includes(x.kind))) {
        const name = `${u.id} ${r.name}`.replace(/unit_(type_)?/, '')
        const v = view(r, u)
        if (![0, ROOM_PITCH].includes(v.pitch!)) {
          // A and B Bed-2, Sheltech A Bed 4: an AC cut at 5° down (spawn.ts unCut)
          expect(v.pitch!, `${name}: AC_DIP at most`).toBeGreaterThanOrEqual(ROOM_PITCH - AC_DIP - 1e-9)
          expect(acCut(u, { ...v, pitch: v.pitch! + Math.PI / 180 }), `${name}: 1° less down cuts an AC`).toBe(true)
        }
        if (r.kind !== 'bed') continue
        const fs = floorShare(core.roomInnerPolygon(r, u), v.p, v.face, v.pitch)
        const b = u.furniture.find((f) => f.roomId === r.id && f.assetId.startsWith('bed_'))!
        rows.push(`${name} ${fs.toFixed(2)}`)
        // wave 13 (1.6 m, level, the farthest spot in front of the bed): A/C Bed-3 0.02, Sheltech A Bed 4 0.01, Bed 1 0.16; now
        // C Bed-3 (11.7 m², a queen bed and a wardrobe) 0.20 from the bed's foot, the rest 0.35 or more
        expect(fs, `${name}: floor in frame`).toBeGreaterThanOrEqual(0.2)
        expect(pieceInFrame(b, v.p, v.face, v.pitch), `${name}: the bed`).toBeGreaterThanOrEqual(4 / 6 - 1e-9)
      }
    expect(rows.length).toBe(17)
  })

  it('roomView falls back to 0.9 m in from the door when no candidate qualifies', () => {
    const bath = rooms.find((x) => x.name === 'Bath-1')!
    // a room-filling tall wardrobe blocks every corner and wall midpoint
    const u: Unit = { ...unit, furniture: [{ id: 'x', assetId: 'wardrobe_tall', roomId: bath.id, x: bath.centroid.x, y: bath.centroid.y, rotationDeg: 0, scale: 6 }] }
    const v = view(bath, u)
    const w = u.walls.find((x) => bath.wallIds.includes(x.id) && x.openings.some((o) => o.kind === 'door'))!
    const door = w.openings.find((o) => o.kind === 'door')!
    const f = core.wallFrame(w, u.vertices)
    const c = { x: f.origin.x + f.dir.x * (door.offsetM + door.widthM / 2), y: f.origin.y + f.dir.y * (door.offsetM + door.widthM / 2) }
    expect(Math.hypot(v.p.x - c.x, v.p.y - c.y)).toBeCloseTo(w.thicknessM / 2 + 0.9)
    expect(core.pointInPolygon(v.p, core.roomInnerPolygon(bath, u))).toBe(true)
  })
})

describe('the stair\'s address (session 31: a floor reached by the stair is this page on that floor)', () => {
  it('a reload lands on that floor; what only the first arrival asked for goes; a link stays what it was', () => {
    expect(stairUrl('?floor=3', 'type-b', 4, false)).toBe('/u/type-b?floor=4')
    expect(stairUrl('', 'sheltech-roof', 7, false)).toBe('/u/sheltech-roof?floor=7') // a level: its floor, the same way
    expect(stairUrl('?floor=2&view=building&pick=2&quality=lite', 'sheltech-l1', 1, false)).toBe('/u/sheltech-l1?floor=1&quality=lite')
    expect(stairUrl('?floor=3&edit=furniture&own=1&export=glb', 'type-b', 2, false)).toBe('/u/type-b?floor=2')
    expect(stairUrl('?floor=3&c=abc', 'type-b', 4, true)).toBe('/u/type-b?floor=4&c=abc') // a buyer's finishes ride along
    expect(stairUrl('', 'type-b', 4, true)).toBe('/u/type-b?floor=4&c=') // from a published link: still a buyer's link
    // a flat picked in the Building view: its Dollhouse again on a reload; the tower's own view and pick dropped
    expect(stairUrl('?floor=2&view=building&pick=2&quality=lite', 'type-c', 8, false, true)).toBe('/u/type-c?floor=8&quality=lite&view=dollhouse')
  })
})

describe('minimap compass', () => {
  it('points to true north on the plan as drawn: north 0 → needle straight up; north 304° → turned 304° (up and to the left)', () => {
    const up = compassPoint(0, 6)
    expect(up.x).toBeCloseTo(11)
    expect(up.y).toBeCloseTo(5)
    const t = compassPoint(304, 6)
    expect((Math.atan2(t.x - 11, 11 - t.y) * 180) / Math.PI + 360).toBeCloseTo(304)
    expect(t.x).toBeLessThan(11)
    expect(t.y).toBeLessThan(11)
  })
})

describe('a whole floor with flats picked to furnish (s31 bigifc): the walk starts in a picked flat, never a bare one', () => {
  /** four 4 m boxes in a row: flat 1 (bed, living) | flat 2 (living, bed), each living room with its door from outside */
  function floor(furnishFlats?: string[]): Unit {
    const names: [string, Room['kind']][] = [['Bed 1', 'bed'], ['Living 1', 'living'], ['Living 2', 'living'], ['Bed 2', 'bed']]
    const vertices = [0, 1, 2, 3, 4].flatMap((i) => [{ id: `t${i}`, x: 4 * i, y: 0 }, { id: `b${i}`, x: 4 * i, y: 4 }])
    const door = (id: string) => [{ id, kind: 'door' as const, offsetM: 1.5, widthM: 0.9, heightM: 2.1, sillM: 0, hinge: 'a' as const, swing: 'in' as const }]
    const wall = (id: string, a: string, b: string, openings: Unit['walls'][number]['openings'] = []) => ({ id, a, b, thicknessM: 0.127, heightM: 3, openings })
    const walls = [
      wall('top0', 't0', 't1'), wall('top1', 't1', 't2', door('in1')), wall('top2', 't2', 't3', door('in2')), wall('top3', 't3', 't4'),
      ...[0, 1, 2, 3].map((i) => wall(`bot${i}`, `b${i}`, `b${i + 1}`)),
      wall('x0', 't0', 'b0'), wall('x1', 't1', 'b1', door('d1')), wall('x2', 't2', 'b2'), wall('x3', 't3', 'b3', door('d2')), wall('x4', 't4', 'b4'),
    ]
    const roomLabels = names.map(([name, kind], i) => ({ id: `r${i}`, name, kind, x: 4 * i + 2, y: 2 }))
    return { id: 'f', projectName: 'p', name: 'Level 2', northDeg: 0, vertices, walls, roomLabels, furniture: [], finishSlots: [], areaSqft: 0, ...(furnishFlats ? { furnishFlats } : {}) }
  }
  it('no pick: the first door from outside (flat 1); Flat 2 picked: in through its own door', () => {
    const u = floor()
    expect(core.deriveFlats(u, core.deriveRooms(u)).map((f) => f.name)).toEqual(['Flat 1', 'Flat 2'])
    expect(entrySpawn(u, core.deriveRooms(u))!.p.x).toBeLessThan(8)
    const v = floor(['Flat 2'])
    const e = entrySpawn(v, core.deriveRooms(v))!
    expect(e.p.x).toBeGreaterThan(8)
    expect(core.roomAt(e.p, core.deriveRooms(v), v)?.name).toBe('Living 2')
  })
})
