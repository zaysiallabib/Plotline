import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomInnerPolygon, type FurniturePlacement, type Pt, type Room, type RoomKind, type Unit } from '../core'
import { heightRange, isCeilingLight, kitAsset } from './kit'
import { AC_KINDS, doorClearZones, footprint, furnish, LIT_KINDS, quadsOverlap } from './presets'

/** Axis-aligned w × h room, 0.127 m partitions, optional door on wall index (0 = top y=0, 1 = right, 2 = bottom, 3 = left). */
function rect(kind: RoomKind, w: number, h: number, door?: { wall: number; offsetM: number }): Unit {
  const walls = [
    ['v1', 'v2'],
    ['v2', 'v3'],
    ['v3', 'v4'],
    ['v4', 'v1'],
  ].map(([a, b], i) => ({
    id: `w${i}`,
    a,
    b,
    thicknessM: 0.127,
    heightM: 3,
    openings:
      door && door.wall === i
        ? [{ id: 'door', kind: 'door' as const, offsetM: door.offsetM, widthM: 0.9, heightM: 2.1, sillM: 0 }]
        : [],
  }))
  return {
    id: 'u',
    projectName: 'T',
    name: 'T',
    northDeg: 0,
    areaSqft: 0,
    vertices: [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: w, y: 0 },
      { id: 'v3', x: w, y: h },
      { id: 'v4', x: 0, y: h },
    ],
    walls,
    roomLabels: [{ id: 'r', name: kind, kind, x: w / 2, y: h / 2 }],
    furniture: [],
    finishSlots: [],
  }
}

const quad = (p: FurniturePlacement) => {
  const s = kitAsset(p.assetId)!.sizeM
  const k = p.scale ?? 1
  return footprint(p, p.rotationDeg, { x: s.x * k, z: s.z * k })
}
const aabb = (q: Pt[]) => ({
  minX: Math.min(...q.map((p) => p.x)),
  maxX: Math.max(...q.map((p) => p.x)),
  minY: Math.min(...q.map((p) => p.y)),
  maxY: Math.max(...q.map((p) => p.y)),
})
const isRug = (p: FurniturePlacement) => kitAsset(p.assetId)!.category === 'rug'
// ceiling fixtures hang over everything; the cushions sit ON the sofa
const solidItems = (ps: FurniturePlacement[]) =>
  ps.filter((p) => kitAsset(p.assetId)!.mount !== 'ceiling' && !isRug(p) && !['throw_pillows_01', 'cushions_plain'].includes(p.assetId))
// fitted wall units sit over the base modules by design (the sink's tap reaches up into the splashback zone)
const STACKED = new Set(['kitchen_upper', 'kitchen_hood'])
const stacked = (a: FurniturePlacement, b: FurniturePlacement) =>
  (STACKED.has(a.assetId) && kitAsset(b.assetId)!.category === 'kitchen') || (STACKED.has(b.assetId) && kitAsset(a.assetId)!.category === 'kitchen')

function overlaps(a: Pt[], b: Pt[], axis: boolean): boolean {
  if (!axis) return quadsOverlap(a, b)
  const A = aabb(a)
  const B = aabb(b)
  return A.minX < B.maxX - 1e-6 && B.minX < A.maxX - 1e-6 && A.minY < B.maxY - 1e-6 && B.minY < A.maxY - 1e-6
}

/** Inside the room; no two solid items share plan area AND height; rugs never in a door zone nor on another rug. */
function expectInsideAndDisjoint(ps: FurniturePlacement[], rooms: Room[], unit: Unit) {
  for (const p of ps) {
    const room = rooms.find((r) => r.id === p.roomId)!
    const inner = roomInnerPolygon(room, unit)
    for (const c of quad(p)) expect(pointInPolygon(c, inner), `${p.id} corner outside`).toBe(true)
  }
  const fl = solidItems(ps)
  for (let i = 0; i < fl.length; i++) {
    for (let j = i + 1; j < fl.length; j++) {
      if (fl[i].roomId !== fl[j].roomId || stacked(fl[i], fl[j])) continue
      const [a0, a1] = heightRange(kitAsset(fl[i].assetId)!)
      const [b0, b1] = heightRange(kitAsset(fl[j].assetId)!)
      if (a1 <= b0 + 0.02 || b1 <= a0 + 0.02) continue // one hangs above the other (frame over a sofa)
      const axis = fl[i].rotationDeg % 90 === 0 && fl[j].rotationDeg % 90 === 0
      expect(overlaps(quad(fl[i]), quad(fl[j]), axis), `${fl[i].id} overlaps ${fl[j].id}`).toBe(false)
    }
  }
  const rugs = ps.filter(isRug)
  for (const r of rugs) {
    const room = rooms.find((x) => x.id === r.roomId)!
    for (const z of doorClearZones(room, unit)) expect(quadsOverlap(quad(r), z), `${r.id} in a door clear zone`).toBe(false)
    for (const o of rugs) if (o !== r && o.roomId === r.roomId) expect(quadsOverlap(quad(r), quad(o)), `${r.id} on ${o.id}`).toBe(false)
  }
}

describe('furnish', () => {
  test('4 × 3.5 bedroom, door on the right short wall', () => {
    const unit = rect('bed', 4, 3.5, { wall: 1, offsetM: 0.3 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const bed = ps.find((p) => p.assetId === 'bed_queen')!
    expect(bed).toBeDefined()
    // against a long wall (y = 0 or y = 3.5), never the door wall (x = 4)
    expect([0, 180]).toContain(bed.rotationDeg)
    expect(Math.min(bed.y, 3.5 - bed.y)).toBeCloseTo(0.127 / 2 + 0.05 + kitAsset('bed_queen')!.sizeM.z / 2, 6)
    const tables = ps.filter((p) => p.assetId === 'bedside_oak')
    expect(tables).toHaveLength(2)
    expect(tables.some((t) => t.x < bed.x) && tables.some((t) => t.x > bed.x)).toBe(true)
    // door swing zone: 0.9 wide from y=0.3, 1 m into the room from the wall's inner face
    const swing = [
      { x: 4 - 0.0635, y: 0.3 },
      { x: 4 - 0.0635, y: 1.2 },
      { x: 4 - 1.0635, y: 1.2 },
      { x: 4 - 1.0635, y: 0.3 },
    ]
    for (const p of ps.filter((p) => kitAsset(p.assetId)!.mount !== 'ceiling')) expect(quadsOverlap(quad(p), swing), `${p.id} blocks the door`).toBe(false)
    expectInsideAndDisjoint(ps, rooms, unit)
    expect(ps.map((p) => p.id)).toContain('r:bed_queen:1')
    // rug under the foot end of the bed, frames above the headboard
    const rug = ps.find((p) => p.assetId.startsWith('rug_'))!
    expect(rug).toBeDefined()
    expect(quadsOverlap(quad(rug), quad(bed))).toBe(true)
    expect(ps.filter((p) => p.assetId.startsWith('art_')).length).toBe(2) // a diptych
  })

  test('small bedroom gets a single bed', () => {
    const unit = rect('bed', 3, 2.6)
    const ps = furnish(unit, deriveRooms(unit))
    expect(ps.some((p) => p.assetId === 'bed_single')).toBe(true)
  })

  test('5 × 4 living: sofa + pillows, rug, table, tv unit + TV, chair, frames, plant, fan — inside and disjoint', () => {
    const unit = rect('living', 5, 4, { wall: 3, offsetM: 1.5 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const ids = ps.map((p) => p.assetId)
    for (const a of ['sofa_3seat', 'cushions_plain', 'modern_coffee_table_01', 'modern_wooden_cabinet', 'tv_55', 'modern_arm_chair_01', 'potted_plant_01', 'ceiling_fan']) {
      expect(ids, a).toContain(a)
    }
    expect(ids.some((a) => a.startsWith('rug_'))).toBe(true)
    expect(ids.filter((a) => a.startsWith('art_')), 'diptych over the sofa').toHaveLength(2)
    expectInsideAndDisjoint(ps, rooms, unit)
    // the TV stands on its unit, facing the same way
    const tv = ps.find((p) => p.assetId === 'tv_55')!
    const cab = ps.find((p) => p.assetId === 'modern_wooden_cabinet')!
    expect(tv.rotationDeg).toBe(cab.rotationDeg)
    for (const c of quad(tv)) expect(pointInPolygon(c, quad(cab))).toBe(true)
    // the rug is under the sofa's front and the coffee table
    const rug = ps.find((p) => p.assetId.startsWith('rug_'))!
    for (const a of ['sofa_3seat', 'modern_coffee_table_01']) expect(quadsOverlap(quad(rug), quad(ps.find((p) => p.assetId === a)!)), a).toBe(true)
  })

  test('living room with no wall long enough for the TV unit gets a wall-mounted TV', () => {
    const unit = rect('living', 2.6, 2.6, { wall: 3, offsetM: 0.3 })
    const ids = furnish(unit, deriveRooms(unit)).map((p) => p.assetId)
    expect(ids).toContain('sofa_3seat')
    expect(ids).not.toContain('modern_wooden_cabinet')
    expect(ids).toContain('tv_55_wall')
  })

  test('kitchen: one fitted run with sink, hob + hood and wall cabinets over the base modules', () => {
    const unit = rect('kitchen', 3.6, 2.4, { wall: 0, offsetM: 0.3 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const ids = ps.map((p) => p.assetId)
    for (const a of ['fridge', 'kitchen_sink', 'kitchen_hob', 'kitchen_hood', 'kitchen_upper']) expect(ids, a).toContain(a)
    const base = ps.filter((p) => ['kitchen_sink', 'kitchen_hob', 'kitchen_counter', 'kitchen_counter_styled'].includes(p.assetId))
    const tops = ps.filter((p) => STACKED.has(p.assetId))
    expect(tops.length).toBe(base.length)
    for (const t of tops) expect(base.some((b) => b.rotationDeg === t.rotationDeg && quadsOverlap(quad(b), quad(t)))).toBe(true)
    expectInsideAndDisjoint(ps, rooms, unit)
  })

  test('bath ≥ 4 m² gets a shower screen, toilet and vanity; a WC gets no shower', () => {
    const big = rect('bath', 2.4, 2.1, { wall: 0, offsetM: 1.4 })
    const ids = furnish(big, deriveRooms(big)).map((p) => p.assetId)
    for (const a of ['shower_screen', 'toilet', 'vanity']) expect(ids, a).toContain(a)
    const wc = rect('bath', 1.4, 1.6, { wall: 0, offsetM: 0.3 })
    expect(furnish(wc, deriveRooms(wc)).map((p) => p.assetId)).not.toContain('shower_screen')
    const wcIds = furnish(wc, deriveRooms(wc)).map((p) => p.assetId)
    expect(wcIds, 'a WC under 2.5 m² gets no vanity').not.toContain('vanity')
  })

  test('a shower tray sits flush in its corner, so it still fits beside a door zone with centimetres to spare', () => {
    // door zone x 0.3–1.2; the far corner's tray spans x 2.2 − 0.0635 − 0.9 − gap: 1.1865 with a 5 cm gap (in the zone), 1.2315 flush
    const unit = rect('bath', 2.2, 1.9, { wall: 0, offsetM: 0.3 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const tray = ps.find((p) => p.assetId === 'shower_screen')!
    expect(tray).toBeDefined()
    const b = aabb(quad(tray))
    expect(2.2 - 0.0635 - b.maxX).toBeLessThan(0.01)
    expect(1.9 - 0.0635 - b.maxY).toBeLessThan(0.01)
    expectInsideAndDisjoint(ps, rooms, unit)
  })

  test('a door whose leaf swings out of the room keeps only a 0.6 m step-in zone: a servant WC still gets its toilet', () => {
    const wc = (swing: 'in' | 'out') => {
      const unit = rect('bath', 1.5, 1.15, { wall: 3, offsetM: 0.1 })
      // wall 3 runs with the room loop: 'out' = +normal = into the WC, 'in' = away from it
      Object.assign(unit.walls[3].openings[0], { widthM: 0.7, hinge: 'a', swing })
      return unit
    }
    const depth = (u: Unit) => Math.max(...doorClearZones(deriveRooms(u)[0], u)[0].map((p) => p.x)) - 0.0635
    expect(depth(wc('out'))).toBeCloseTo(1.0, 6)
    expect(depth(wc('in'))).toBeCloseTo(0.6, 6)
    const unit = wc('in')
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    expect(ps.map((p) => p.assetId)).toContain('toilet')
    expectInsideAndDisjoint(ps, rooms, unit)
    expect(furnish(wc('out'), deriveRooms(wc('out'))).map((p) => p.assetId)).not.toContain('toilet') // the leaf sweeps the whole WC
  })

  test('an open-plan living room long enough for two zones gets a dining set and a lounge whose TV faces the sofa', () => {
    const unit = rect('living', 11, 3.8, { wall: 3, offsetM: 1.4 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const ids = ps.map((p) => p.assetId)
    for (const a of ['dining_table', 'dining_chair', 'sofa_3seat']) expect(ids, a).toContain(a)
    const table = ps.find((p) => p.assetId === 'dining_table')!
    const sofa = ps.find((p) => p.assetId === 'sofa_3seat')!
    expect(Math.abs(table.x - sofa.x), 'two zones, one at each end').toBeGreaterThan(3)
    const tv = ps.find((p) => p.assetId.startsWith('tv_55'))
    if (tv) expect(Math.abs(tv.x - sofa.x), 'TV across from the sofa, not down the room').toBeLessThan(1.5)
    expectInsideAndDisjoint(ps, rooms, unit)
  })

  test('nothing tall covers a window; a frame never hangs over one', () => {
    for (const kind of ['bed', 'living', 'bath', 'kitchen'] as RoomKind[]) {
      const unit = rect(kind, 3.6, 3.2, { wall: 3, offsetM: 1 })
      unit.walls[1].openings.push({ id: 'win', kind: 'window', offsetM: 0.6, widthM: 2.0, heightM: 1.4, sillM: 0.9 })
      const zone = [
        { x: 3.6 - 0.0635, y: 0.65 },
        { x: 3.6 - 0.0635, y: 2.55 },
        { x: 3.6 - 0.3635, y: 2.55 },
        { x: 3.6 - 0.3635, y: 0.65 },
      ]
      for (const p of furnish(unit, deriveRooms(unit))) {
        const a = kitAsset(p.assetId)!
        const exempt = a.category === 'plant' || a.category === 'rug' || a.mount === 'ceiling' || p.assetId === 'shower_screen' // glass
        if (exempt || heightRange(a)[1] <= 0.9 + 0.35) continue
        expect(quadsOverlap(quad(p), zone), `${kind}: ${p.id} covers the window`).toBe(false)
      }
    }
  })

  test('deterministic', () => {
    const unit = rect('dining', 4, 4)
    expect(furnish(unit, deriveRooms(unit))).toEqual(furnish(unit, deriveRooms(unit)))
  })

  test('every kind furnishes a modest room without leaks', () => {
    for (const kind of ['bed', 'living', 'dining', 'study', 'kitchen', 'bath', 'balcony', 'closet'] as RoomKind[]) {
      const unit = rect(kind, 3.6, 3.2, { wall: 0, offsetM: 0.4 })
      const rooms = deriveRooms(unit)
      const ps = furnish(unit, rooms)
      expect(ps.length, kind).toBeGreaterThan(0)
      expectInsideAndDisjoint(ps, rooms, unit)
    }
  })

  const units = import.meta.glob('../data/units/type-a*.json', { eager: true, import: 'default' }) as Record<string, Unit>
  const typeA = Object.values(units)[0]
  test.skipIf(!typeA)('type-a.json: ≥ 60 placements, none outside their room, rugs clear of every door', () => {
    const rooms = deriveRooms(typeA)
    const ps = furnish(typeA, rooms)
    expect(ps.length).toBeGreaterThanOrEqual(60)
    expectInsideAndDisjoint(ps, rooms, typeA)
    // rugs really are under furniture somewhere (the point of exempting them)
    const rugs = ps.filter(isRug)
    expect(rugs.length).toBeGreaterThanOrEqual(4)
    for (const r of rugs) expect(solidItems(ps).some((p) => p.roomId === r.roomId && quadsOverlap(quad(p), quad(r))), r.id).toBe(true)
  })

  /** A wall-mounted AC's back edge must not pass over any door/window span of the room's walls. */
  const expectACClearOfOpenings = (ac: FurniturePlacement, room: Room, unit: Unit) => {
    const t = (ac.rotationDeg * Math.PI) / 180
    const [f, r] = [{ x: -Math.sin(t), y: Math.cos(t) }, { x: Math.cos(t), y: Math.sin(t) }]
    const s = kitAsset('ac_split')!.sizeM
    for (const w of unit.walls.filter((w) => room.wallIds.includes(w.id))) {
      const a = unit.vertices.find((v) => v.id === w.a)!
      const b = unit.vertices.find((v) => v.id === w.b)!
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      for (const o of w.openings) {
        for (let i = 0; i <= 10; i++) {
          // a point along the AC's back edge, projected on the wall's centreline
          const p = { x: ac.x - (f.x * s.z) / 2 + r.x * s.x * (i / 10 - 0.5), y: ac.y - (f.y * s.z) / 2 + r.y * s.x * (i / 10 - 0.5) }
          const u = (p.x - a.x) * d.x + (p.y - a.y) * d.y
          const off = Math.abs((p.x - a.x) * -d.y + (p.y - a.y) * d.x)
          expect(off < w.thicknessM / 2 + 0.05 && u > o.offsetM - 0.05 && u < o.offsetM + o.widthM + 0.05, `${ac.id} over ${o.id}`).toBe(false)
        }
      }
    }
  }

  test('lit rooms get exactly one ceiling light (flush fixture, fan or pendant); bedrooms facing the bed wall get the AC', () => {
    for (const kind of ['bed', 'living', 'dining', 'study', 'kitchen', 'bath'] as RoomKind[]) {
      const unit = rect(kind, 4, 3.5, { wall: 1, offsetM: 0.3 })
      const ps = furnish(unit, deriveRooms(unit))
      expect(ps.filter((p) => isCeilingLight(p.assetId)), kind).toHaveLength(1)
      expect(ps.filter((p) => p.assetId === 'ac_split'), kind).toHaveLength(AC_KINDS.includes(kind) ? 1 : 0)
    }
    const unit = rect('bed', 4, 3.5, { wall: 1, offsetM: 0.3 })
    const ps = furnish(unit, deriveRooms(unit))
    const bed = ps.find((p) => p.assetId === 'bed_queen')!
    const ac = ps.find((p) => p.assetId === 'ac_split')!
    // the wardrobe takes the wall the bed faces, so the AC goes beside the bed, not over the headboard or the wardrobe
    expect(ac.rotationDeg, 'not over the headboard').not.toBe(bed.rotationDeg)
    for (const p of ps.filter((p) => heightRange(kitAsset(p.assetId)!)[1] > 1.8 && kitAsset(p.assetId)!.mount !== 'ceiling'))
      expect(quadsOverlap(quad(p), quad(ac)), `over ${p.id}`).toBe(false)
    expectACClearOfOpenings(ac, deriveRooms(unit)[0], unit)
  })

  test('concave (L-shaped) bedroom: the ceiling light lands in the room, clear of the inner corner', () => {
    // 5 × 5 with the top-right 2.5 × 2.5 cut out; the centroid sits 0.6 m off the reflex corner, the best spot 1.4 m
    const unit = rect('bed', 5, 5)
    unit.vertices = [
      { id: 'v1', x: 0, y: 0 },
      { id: 'v2', x: 2.5, y: 0 },
      { id: 'v5', x: 2.5, y: 2.5 },
      { id: 'v6', x: 5, y: 2.5 },
      { id: 'v3', x: 5, y: 5 },
      { id: 'v4', x: 0, y: 5 },
    ]
    const ids = ['v1', 'v2', 'v5', 'v6', 'v3', 'v4']
    unit.walls = ids.map((a, i) => ({ id: `w${i}`, a, b: ids[(i + 1) % ids.length], thicknessM: 0.127, heightM: 3, openings: [] }))
    unit.roomLabels[0] = { ...unit.roomLabels[0], x: 1, y: 4 }
    const rooms = deriveRooms(unit)
    const light = furnish(unit, rooms).find((p) => isCeilingLight(p.assetId))!
    expect(pointInPolygon(light, roomInnerPolygon(rooms[0], unit))).toBe(true)
    expect(Math.hypot(light.x - 2.5, light.y - 2.5), 'away from the reflex corner').toBeGreaterThan(0.9)
  })

  test.skipIf(!typeA)('type-a.json: one ceiling light per lit room, an AC in every bedroom/living clear of openings, old ids untouched', () => {
    const rooms = deriveRooms(typeA)
    const ps = furnish(typeA, rooms)
    for (const r of rooms) {
      const mine = ps.filter((p) => p.roomId === r.id)
      expect(mine.filter((p) => isCeilingLight(p.assetId)), r.name).toHaveLength(LIT_KINDS.includes(r.kind) ? 1 : 0)
      const acs = mine.filter((p) => p.assetId === 'ac_split')
      if (r.kind === 'bed' || r.kind === 'living') expect(acs, r.name).toHaveLength(1)
      for (const ac of acs) expectACClearOfOpenings(ac, r, typeA)
      // light + AC come after the room's own pieces and are new asset ids, so every earlier id is what it was
      const added = mine.findIndex((p) => ['ceiling_light', 'ceiling_light_large', 'ac_split'].includes(p.assetId))
      if (added >= 0) expect(mine.slice(added).every((p) => isCeilingLight(p.assetId) || p.assetId === 'ac_split'), r.name).toBe(true)
    }
    for (const id of ['r_bed1:bed_queen:1', 'r_living:sofa_3seat:1', 'r_living:ceiling_fan:1', 'r_bath1:vanity:1', 'r_dining:modern_ceiling_lamp_01:1'])
      expect(ps.map((p) => p.id)).toContain(id)
  })

  test.skipIf(!typeA)('type-a.json rooms get their staging', () => {
    const rooms = deriveRooms(typeA)
    const ps = furnish(typeA, rooms)
    const ids = (roomId: string) => ps.filter((p) => p.roomId === roomId).map((p) => p.assetId)
    for (const a of ['sofa_3seat', 'cushions_plain', 'modern_coffee_table_01', 'tv_55']) expect(ids('r_living'), a).toContain(a)
    for (const a of ['dining_table', 'dining_chair', 'wall_clock', 'modern_ceiling_lamp_01']) expect(ids('r_dining'), a).toContain(a)
    expect(ids('r_dining').filter((a) => a === 'dining_chair')).toHaveLength(6)
    for (const a of ['kitchen_sink', 'kitchen_hob', 'kitchen_upper', 'fridge', 'kitchen_tall', 'kitchen_counter_styled']) expect(ids('r_kitchen'), a).toContain(a)
    expect(ids('r_bed1'), 'bed').toContain('bed_queen')
    // linen by size rank: no two bedrooms dressed alike
    expect(ids('r_bed2'), 'bed-2 linen').toContain('bed_queen_b')
    expect(ids('r_bed3'), 'bed-3 linen').toContain('bed_queen_c')
    expect(ids('r_dining'), 'family sofa cushions').toContain('cushions_plain')
    expect(ids('r_bed1').filter((a) => a.startsWith('art_')), 'diptych').toHaveLength(2)
    for (const a of ['vanity', 'shower_screen', 'toilet']) expect(ids('r_bath1'), a).toContain(a)
    expect(ids('r_htoilet').sort(), 'the 2.1 m² WC: toilet + pedestal basin').toEqual(['basin', 'ceiling_light', 'toilet'])
  })

  // the second plan (system proof): same rules, no per-unit code
  const typeB = (Object.values(import.meta.glob('../data/units/type-b*.json', { eager: true, import: 'default' })) as Unit[])[0]
  test.skipIf(!typeB)('type-b.json rooms get their staging, inside and disjoint', () => {
    const rooms = deriveRooms(typeB)
    const ps = furnish(typeB, rooms)
    expectInsideAndDisjoint(ps, rooms, typeB)
    const ids = (roomId: string) => ps.filter((p) => p.roomId === roomId).map((p) => p.assetId)
    // 36'-2" open-plan living, dining & family: both zones
    for (const a of ['dining_table', 'sofa_3seat', 'cushions_plain']) expect(ids('r_living'), a).toContain(a)
    expect(ids('r_living').filter((a) => a === 'dining_chair')).toHaveLength(6)
    for (const r of ['r_bath1', 'r_bath2', 'r_bath3']) for (const a of ['vanity', 'shower_screen', 'toilet']) expect(ids(r), `${r} ${a}`).toContain(a)
    expect(ids('r_htoilet'), 'servant WC, door swings out').toContain('toilet')
    for (const a of ['kitchen_sink', 'kitchen_hob', 'fridge']) expect(ids('r_kitchen'), a).toContain(a)
    expect(ids('r_bed1')).toContain('bed_queen')
    expect(ids('r_bed2')).toContain('bed_queen_c')
    expect(ids('r_bed3')).toContain('bed_queen_b')
  })

  test.skipIf(!typeA || !typeB)('the wall clock hangs at 2.4 m over bare wall: no door/window within 0.3 m, nothing over 1.8 m beneath (A and B)', () => {
    const k = kitAsset('wall_clock')!
    expect((heightRange(k)[0] + heightRange(k)[1]) / 2).toBeCloseTo(2.4)
    // a dining room whose long walls are mostly window: the clock goes to a short wall or 0.3 m clear of the glass
    const glazed = rect('dining', 4.5, 3.5)
    for (const i of [0, 2]) glazed.walls[i].openings = [{ id: `win${i}`, kind: 'window', offsetM: 0.6, widthM: 3.3, heightM: 1.4, sillM: 0.9 }]
    for (const unit of [typeA, typeB, glazed]) {
      const ps = furnish(unit, deriveRooms(unit))
      const clock = ps.find((p) => p.assetId === 'wall_clock')!
      const t = (clock.rotationDeg * Math.PI) / 180
      const front = { x: -Math.sin(t), y: Math.cos(t) }
      for (const w of unit.walls) {
        const a = unit.vertices.find((v) => v.id === w.a)!
        const b = unit.vertices.find((v) => v.id === w.b)!
        const L = Math.hypot(b.x - a.x, b.y - a.y)
        const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
        if (Math.abs((clock.x - a.x) * -d.y + (clock.y - a.y) * d.x) > w.thicknessM / 2 + 0.1) continue // not on this wall
        const u = (clock.x - a.x) * d.x + (clock.y - a.y) * d.y
        for (const o of w.openings) expect(Math.abs(u - o.offsetM - o.widthM / 2), `${clock.id} by ${o.id}`).toBeGreaterThanOrEqual(o.widthM / 2 + k.sizeM.x / 2 + 0.3 - 1e-6)
      }
      const below = footprint({ x: clock.x + front.x * 0.3, y: clock.y + front.y * 0.3 }, clock.rotationDeg, { x: k.sizeM.x, z: 0.55 })
      for (const p of ps.filter((p) => p !== clock && p.roomId === clock.roomId && kitAsset(p.assetId)!.mount !== 'ceiling' && heightRange(kitAsset(p.assetId)!)[1] > 1.8))
        expect(quadsOverlap(quad(p), below), `${p.id} under the clock`).toBe(false)
    }
  })
})
