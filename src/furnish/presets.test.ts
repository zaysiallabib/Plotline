import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomInnerPolygon, type FurniturePlacement, type Pt, type Room, type RoomKind, type Unit } from '../core'
import { heightRange, kitAsset } from './kit'
import { doorClearZones, footprint, furnish, quadsOverlap } from './presets'

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
  })
})
