import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomInnerPolygon, type FurniturePlacement, type Opening, type Pt, type Room, type RoomKind, type Unit } from '../core'
import { heightRange, isCeilingLight, kitAsset, placementLabel } from './kit'
import { AC_KINDS, doorClearZones, ENTRY, footprint, furnish, isCommonCore, isPlanter, LIT_KINDS, PATH_W, quadsOverlap, WARDROBE_CLEAR } from './presets'
import { buildProcedural } from './procedural'
import { ART_SETS, parsePlanter, PLANTER } from './procedural.meta'

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
/** A planter bed's own outline in plan (its id carries the shape), else null. */
const bedShape = (p: FurniturePlacement) => parsePlanter(p.assetId)?.poly.map((q) => ({ x: p.x + q.x, y: p.y + q.y })) ?? null
// the planter bed is a 'rug' to the engine (floor-level), not a rug furniture stands on
const isRug = (p: FurniturePlacement) => kitAsset(p.assetId)!.category === 'rug' && !bedShape(p)
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
    const shape = bedShape(p)
    // a planter bed fills its room: its outline is the inner polygon, to the cm its id is written in
    if (shape) inner.forEach((c, i) => expect(Math.hypot(c.x - shape[i].x, c.y - shape[i].y), `${p.id} vertex ${i}`).toBeLessThan(0.01))
    else for (const c of quad(p)) expect(pointInPolygon(c, inner), `${p.id} corner outside`).toBe(true)
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
    expect(ids, 'under 3 m wide: the 2-seater (wave 11, piece size by room size)').toContain('sofa_2seat')
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

  test('a slider keeps only the 0.6 m step-in strip, never the 1 m swing zone; its width and a stray hinge do not matter', () => {
    const depth = (o: Partial<Opening>) => {
      const unit = rect('balcony', 2.2, 2.0, { wall: 3, offsetM: 0.1 })
      Object.assign(unit.walls[3].openings[0], o) // wall 3 runs with the loop: swing 'out' = into the room
      return Math.max(...doorClearZones(deriveRooms(unit)[0], unit)[0].map((p) => p.x)) - 0.0635
    }
    expect(depth({ kind: 'slider', widthM: 1.8 })).toBeCloseTo(0.6, 6)
    expect(depth({ kind: 'slider', widthM: 0.9, hinge: 'a', swing: 'out' })).toBeCloseTo(0.6, 6)
    expect(depth({ kind: 'door', widthM: 1.8, swing: 'out' })).toBeCloseTo(1.0, 6) // a wide hingeless door still swings
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
  test('AC: 2.3 m up, centred on the longest clear stretch of wall, 0.5 m off corners and openings; none if no stretch qualifies', () => {
    expect(heightRange(kitAsset('ac_split')!)[0], 'bottom 2.3 m above the floor').toBe(2.3)
    // 5 × 3.4 study: door at the left end of the top wall (x 0.2–1.1), a window in the bottom wall; stretches: top 3.9, sides 3.4, bottom 2.5
    const unit = rect('study', 5, 3.4, { wall: 0, offsetM: 0.2 })
    unit.walls[2].openings.push({ id: 'win', kind: 'window', offsetM: 1.0, widthM: 1.5, heightM: 1.4, sillM: 0.9 })
    const rooms = deriveRooms(unit)
    const ac = furnish(unit, rooms).find((p) => p.assetId === 'ac_split')!
    expect(ac.x, 'centred between the door and the corner').toBeCloseTo((1.1 + 5) / 2, 6)
    expect(ac.y, 'on the top wall, 5 mm off its face').toBeCloseTo(0.0635 + 0.005 + kitAsset('ac_split')!.sizeM.z / 2, 6)
    expectACClearOfOpenings(ac, rooms[0], unit)
    // a wall that is all windows, four times over: nowhere to hang it
    const glassy = rect('study', 2.4, 2.4)
    glassy.walls.forEach((w, i) => w.openings.push({ id: `w${i}`, kind: 'window', offsetM: 0.7, widthM: 1.0, heightM: 1.4, sillM: 0.9 }))
    expect(furnish(glassy, deriveRooms(glassy)).map((p) => p.assetId)).not.toContain('ac_split')
  })

  test('a help room (help/servant/maid, or a bedroom under 4 m²) gets a cot along a wall and a hook rail, nothing else', () => {
    const tiny = rect('bed', 2.4, 1.6)
    const ids = furnish(tiny, deriveRooms(tiny)).map((p) => p.assetId)
    expect(ids.sort()).toEqual(['ceiling_light', 'cot', 'hook_rail'])
    const help = rect('utility', 1.6, 3.1, { wall: 0, offsetM: 0.35 })
    help.roomLabels[0].name = 'Help room'
    const rooms = deriveRooms(help)
    const ps = furnish(help, rooms)
    expect(ps.map((p) => p.assetId).sort()).toEqual(['cot', 'hook_rail'])
    const cot = ps.find((p) => p.assetId === 'cot')!
    expect([90, 270], 'long side against a long wall').toContain(cot.rotationDeg)
    expectInsideAndDisjoint(ps, rooms, help)
    // a WC named for the help is still a WC; a normal bedroom still gets a bed
    const wc = rect('bath', 1.4, 1.6)
    wc.roomLabels[0].name = 'Help toilet'
    expect(furnish(wc, deriveRooms(wc)).map((p) => p.assetId)).not.toContain('cot')
    expect(furnish(rect('bed', 3, 2.6), deriveRooms(rect('bed', 3, 2.6))).map((p) => p.assetId)).not.toContain('cot')
  })

  test('a dead-end walk-in closet puts its first unit on the far wall, the one its doorway looks at', () => {
    const unit = rect('closet', 2.4, 3.0, { wall: 2, offsetM: 0.75 }) // door centred on the bottom short wall (y = 3)
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const units = ps.filter((p) => p.assetId.startsWith('closet_rail'))
    expect(units.length, `${ps.map((p) => p.assetId)}`).toBe(2)
    expect(units[0].rotationDeg, 'backed onto the top wall, facing the door').toBe(0)
    expect(units[0].y).toBeLessThan(0.5)
    expectInsideAndDisjoint(ps, rooms, unit)
  })

  test('common-core rooms are flagged for the viewer; a stair room gets the widest dog-leg that fits, clear of its door', () => {
    for (const n of ['Stair', 'Staircase', 'Lift lobby', 'Lift core', 'LIFT', 'Lift machine room']) expect(isCommonCore({ name: n }), n).toBe(true)
    for (const n of ['Bed-1', 'Living, dining & family', 'Help room', 'H. toilet', 'Kitchen', 'Walk-in closet']) expect(isCommonCore({ name: n }), n).toBe(false)
    const unit = rect('other', 4.4, 3.7, { wall: 2, offsetM: 0.3 }) // bottom wall runs right to left: the door is at its right end
    unit.roomLabels[0].name = 'Stair'
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    expect(ps.map((p) => p.assetId)).toEqual(['stair_32']) // the 3.7 m wall is 3.57 m inside: 3.6 does not fit
    for (const z of doorClearZones(rooms[0], unit)) expect(quadsOverlap(quad(ps[0]), z), 'flights clear of the door').toBe(false)
    // the half landing backs onto the wall farthest from the door, a floor landing ≥ 1 m in front
    expect(ps[0].rotationDeg).toBe(270) // front faces +x: backed onto the left wall
    expect(4.4 - 0.0635 - Math.max(...quad(ps[0]).map((p) => p.x))).toBeGreaterThanOrEqual(1)
    expectInsideAndDisjoint(ps, rooms, unit)
  })

  test('art: 8+ print sets, a diptych set picked by room id; every bedroom and living room of a unit hangs a different one', () => {
    expect(ART_SETS.length).toBeGreaterThanOrEqual(8)
    const setOf = (ps: FurniturePlacement[], roomId: string) => [...new Set(ps.filter((p) => p.roomId === roomId && p.assetId.startsWith('art_')).map((p) => p.assetId.slice(0, -2)))]
    const a = rect('bed', 4, 3.5, { wall: 1, offsetM: 0.3 })
    const b = structuredClone(a)
    b.roomLabels[0].id = 'r2'
    const [sa, sb] = [setOf(furnish(a, deriveRooms(a)), 'r'), setOf(furnish(b, deriveRooms(b)), 'r2')]
    expect(sa).toHaveLength(1)
    expect(sa, 'same id, same print').toEqual(setOf(furnish(a, deriveRooms(a)), 'r'))
    expect(sa, 'another id, another print').not.toEqual(sb)
    for (const u of [typeA, typeB].filter(Boolean)) {
      const ps = furnish(u, deriveRooms(u))
      const sets = [...new Set(ps.filter((p) => p.assetId.startsWith('art_')).map((p) => p.roomId))].map((r) => setOf(ps, r)[0])
      expect(sets.length, u.id).toBeGreaterThanOrEqual(3)
      expect(new Set(sets).size, `${u.id}: ${sets}`).toBe(sets.length)
    }
  })

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
    expect(ids('r_help'), 'help room: cot + hook rail').toEqual(['cot', 'hook_rail'])
    expect(ids('r_stair')).toEqual(['stair_32'])
    expect(ids('r_lobby'), 'common core stays empty').toEqual([])
    // closed oak wardrobes, never the steel-framed shelving, in either unit
    for (const u of [typeA, typeB]) for (const p of furnish(u, deriveRooms(u))) expect(['steel_frame_shelves_01', 'drawer_cabinet'], p.id).not.toContain(p.assetId)
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

  // Type C = Type A's layout on floors 3/5/7: its rule breaks, reproduced on the real plan
  const typeC = (Object.values(import.meta.glob('../data/units/type-c*.json', { eager: true, import: 'default' })) as Unit[])[0]
  const sheltech = (Object.values(import.meta.glob('../data/units/sheltech-a*.json', { eager: true, import: 'default' })) as Unit[])[0]
  test.skipIf(!typeA || !typeB || !typeC || !sheltech)('every planter (A, B, C, Sheltech) gets one planter bed and nothing else; a balcony under 1.2 m deep gets no seat', () => {
    for (const u of [typeA, typeB, typeC, sheltech]) {
      const rooms = deriveRooms(u)
      const ps = furnish(u, rooms)
      const planters = rooms.filter((r) => isPlanter(r, u))
      expect(planters.length, u.id).toBeGreaterThanOrEqual(1)
      for (const r of planters) {
        const mine = ps.filter((p) => p.roomId === r.id)
        expect(mine.map((p) => p.id), `${u.id} ${r.name}`).toEqual([`${r.id}:planter_bed:1`])
        expect(mine[0].assetId.startsWith(PLANTER)).toBe(true)
      }
      expectInsideAndDisjoint(ps, rooms, u)
    }
    // Sheltech's 18 m² Planter (south): plants trail over its three parapets only, not over the curbs onto Veranda 1 / 4
    const r = deriveRooms(sheltech).find((r) => r.id === 'r_planter_south')!
    const bed = furnish(sheltech, deriveRooms(sheltech)).find((p) => p.roomId === r.id)!
    const outer = parsePlanter(bed.assetId)!.edges.map((e, i) => (e.h ? r.wallIds[i] : null)).filter(Boolean)
    expect(outer.sort()).toEqual(['w_pls_e', 'w_pls_s', 'w_pls_w'])
    const ledge = rect('balcony', 4, 1.1, { wall: 0, offsetM: 0.3 }) // 4.4 m², 0.97 m clear, a door: a veranda, not a planter
    const ids = furnish(ledge, deriveRooms(ledge)).map((p) => p.assetId)
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.every((a) => a.startsWith('potted_plant_')), `${ids}`).toBe(true)
  })

  test.skipIf(!typeA || !typeB || !typeC)('the L-shaped 3.8 m² Bath-3 (C) gets a shower tray flush in a corner; a powder room never does', () => {
    const rooms = deriveRooms(typeC)
    const ps = furnish(typeC, rooms)
    const bath = rooms.find((r) => r.id === 'r_bath3')!
    const mine = ps.filter((p) => p.roomId === bath.id)
    const tray = mine.find((p) => p.assetId === 'shower_screen')
    expect(tray, `${mine.map((p) => p.assetId)}`).toBeDefined()
    const inner = roomInnerPolygon(bath, typeC)
    expect(Math.min(...inner.flatMap((c) => quad(tray!).map((q) => Math.hypot(q.x - c.x, q.y - c.y)))), 'flush in a corner').toBeLessThan(0.02)
    expect(mine.map((p) => p.assetId)).toContain('toilet')
    expectInsideAndDisjoint(ps, rooms, typeC)
    for (const u of [typeA, typeB, typeC]) {
      const rs = deriveRooms(u)
      const all = furnish(u, rs)
      for (const r of rs.filter((r) => /powder/i.test(r.name))) expect(all.filter((p) => p.roomId === r.id).map((p) => p.assetId), `${u.id} ${r.name}`).not.toContain('shower_screen')
    }
  })

  test.skipIf(!typeA || !typeC)('the irregular 33 m² dining (C) gets two zones like A: table at the kitchen end, lounge at the other; a square room never splits', () => {
    for (const u of [typeA, typeC]) {
      const rooms = deriveRooms(u)
      const ps = furnish(u, rooms)
      const mine = ps.filter((p) => p.roomId === 'r_dining')
      const table = mine.find((p) => p.assetId === 'dining_table')!
      const sofa = mine.find((p) => p.assetId === 'sofa_3seat')
      expect(sofa, `${u.id}: ${mine.map((p) => p.assetId)}`).toBeDefined()
      const k = roomInnerPolygon(rooms.find((r) => r.kind === 'kitchen')!, u)
      const kc = { x: k.reduce((t, p) => t + p.x, 0) / k.length, y: k.reduce((t, p) => t + p.y, 0) / k.length }
      expect(Math.hypot(table.x - kc.x, table.y - kc.y), `${u.id} table nearer the kitchen`).toBeLessThan(Math.hypot(sofa!.x - kc.x, sofa!.y - kc.y))
      expect(Math.hypot(table.x - sofa!.x, table.y - sofa!.y), `${u.id} two zones`).toBeGreaterThan(2)
      expectInsideAndDisjoint(ps, rooms, u)
    }
    const square = rect('dining', 5.4, 5.4, { wall: 0, offsetM: 0.4 }) // 29 m², but no end to put a lounge at
    expect(furnish(square, deriveRooms(square)).map((p) => p.assetId)).not.toContain('sofa_3seat')
  })

  test.skipIf(!typeC)('two zones: the lounge chair takes the coffee table side away from the dining table (C: its back hid the table)', () => {
    const wide = rect('living', 11, 3.8, { wall: 3, offsetM: 1.4 })
    for (const u of [typeC, wide, { ...wide, vertices: wide.vertices.map((v) => ({ ...v, x: 11 - v.x })) }]) {
      const ps = furnish(u, deriveRooms(u))
      const at = (re: RegExp) => ps.find((p) => re.test(p.assetId))!
      const [table, coffee, chair] = [at(/^dining_table$/), at(/coffee_table|ottoman/), at(/^mid_century_lounge_chair$/)]
      expect(chair, u.id).toBeDefined()
      const d = (p: Pt) => Math.hypot(p.x - table.x, p.y - table.y)
      expect(d(chair), `${u.id}: chair ${chair.x},${chair.y}`).toBeGreaterThan(d(coffee))
    }
  })

  test.skipIf(!typeA || !typeC)('a help room too short for the 1.9 m cot (A, C: 1.8 × 1.5 m) gets the short cot, still named cot*', () => {
    for (const u of [typeA, typeC]) {
      const rooms = deriveRooms(u)
      const ps = furnish(u, rooms)
      expect(ps.filter((p) => p.roomId === 'r_helpbed').map((p) => p.assetId).sort(), u.id).toEqual(['cot_s', 'hook_rail'])
      expectInsideAndDisjoint(ps, rooms, u)
      for (const z of doorClearZones(rooms.find((r) => r.id === 'r_helpbed')!, u)) expect(quadsOverlap(quad(ps.find((p) => p.assetId === 'cot_s')!), z)).toBe(false)
    }
  })

  // ───────────── wave 11: planter beds, piece size by room size, beds off the entry paths ─────────────

  /** A 4 × 1 m planter strip (parapets 1.1 m on three sides) beside a 4 × 2 m veranda, a 0.45 m curb between them. */
  function planterAndVeranda(): Unit {
    const u = rect('balcony', 4, 3)
    u.vertices = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
      { id: 'c', x: 4, y: 1 },
      { id: 'd', x: 4, y: 3 },
      { id: 'e', x: 0, y: 3 },
      { id: 'f', x: 0, y: 1 },
    ]
    const wall = (id: string, a: string, b: string, heightM: number, door = false) => ({
      id,
      a,
      b,
      thicknessM: 0.127,
      heightM,
      openings: door ? [{ id: 'slider', kind: 'slider' as const, offsetM: 1, widthM: 1.8, heightM: 2.1, sillM: 0 }] : [],
    })
    u.walls = [wall('ab', 'a', 'b', 1.1), wall('bc', 'b', 'c', 1.1), wall('cd', 'c', 'd', 1.1), wall('de', 'd', 'e', 3, true), wall('ef', 'e', 'f', 1.1), wall('fa', 'f', 'a', 1.1), wall('curb', 'f', 'c', 0.45)]
    u.roomLabels = [
      { id: 'p', name: 'Planter', kind: 'balcony', x: 2, y: 0.5 },
      { id: 'v', name: 'Veranda', kind: 'balcony', x: 2, y: 2 },
    ]
    return u
  }

  test('a planter strip gets one bed filling it (no chair, ottoman or pot); plants trail over its parapets, not over the curb onto the veranda', () => {
    const unit = planterAndVeranda()
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const mine = ps.filter((p) => p.roomId === 'p')
    expect(mine.map((p) => p.id)).toEqual(['p:planter_bed:1'])
    const bed = mine[0]
    expect(bed.rotationDeg).toBe(0)
    const room = rooms.find((r) => r.id === 'p')!
    const { edges } = parsePlanter(bed.assetId)!
    expect(edges.map((e, i) => [room.wallIds[i], e.h]).filter(([, h]) => h).map(([w]) => w).sort()).toEqual(['ab', 'bc', 'fa'])
    for (const e of edges.filter((e) => e.h)) expect(e).toEqual({ h: 1.1, t: 0.13 }) // cm, as the id writes it
    // the engine sees a floor-level piece the size of the strip: no contact shadow, never a view blocker
    const a = kitAsset(bed.assetId)!
    expect([a.category, a.kind, a.url]).toEqual(['rug', 'plant', `procedural:${bed.assetId}`])
    expect(Math.abs(a.sizeM.x - (4 - 0.127))).toBeLessThan(0.01)
    expect(Math.abs(a.sizeM.z - (1 - 0.127))).toBeLessThan(0.01)
    expectInsideAndDisjoint(ps, rooms, unit)
    // the veranda (a door opens onto it) is still a veranda
    expect(ps.filter((p) => p.roomId === 'v').map((p) => p.assetId)).not.toContain(bed.assetId)
    expect(ps.filter((p) => p.roomId === 'v').some((p) => /lounge_chair|ottoman/.test(p.assetId))).toBe(true)
    // a strip no door opens onto is a planter whatever it is called
    unit.roomLabels[0].name = 'Sunshade'
    expect(furnish(unit, deriveRooms(unit)).filter((p) => p.roomId === 'p').map((p) => p.id)).toEqual(['p:planter_bed:1'])
  })

  test('planter leaves keep off the veranda: none past the curb, low beside it, and strands hang down the parapets outside', () => {
    const unit = planterAndVeranda()
    const bed = furnish(unit, deriveRooms(unit)).find((p) => p.roomId === 'p')!
    const g = buildProcedural(bed.assetId)!
    const ims = g.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh)
    expect(ims.length).toBeGreaterThan(0)
    // bed-local: plan y = world z, the strip's inner faces at z = ±0.4365, the curb's veranda face at z = 0.5635
    const [m, base, tip] = [new THREE.Matrix4(), new THREE.Vector3(), new THREE.Vector3()]
    let [leaves, hanging] = [0, 0]
    for (const im of ims)
      for (let i = 0; i < im.count; i++, leaves++) {
        im.getMatrixAt(i, m)
        base.setFromMatrixPosition(m)
        tip.set(0, 1, 0).applyMatrix4(m) // a blade is re-posed petiole end at the origin, tip at +y 1
        for (const p of [base, tip]) expect(p.z).toBeLessThan(0.5635)
        if (tip.z > 0.1365 && base.y < 1.05) expect(tip.y).toBeLessThan(0.95) // the mound within 0.3 m of the curb stays well under the 1.1 m caps
        if (base.z < -0.4365 - 0.127 && tip.y < base.y && tip.y < 1.1) hanging++ // outside the far parapet, tip down
      }
    expect(leaves).toBeGreaterThan(300)
    expect(hanging).toBeGreaterThan(100)
  })

  /** Front zone of a wardrobe placement: its width × WARDROBE_CLEAR. */
  const frontZone = (p: FurniturePlacement) => {
    const s = kitAsset(p.assetId)!.sizeM
    const t = (p.rotationDeg * Math.PI) / 180
    const f = { x: -Math.sin(t), y: Math.cos(t) }
    return footprint({ x: p.x + f.x * (s.z + WARDROBE_CLEAR) / 2, y: p.y + f.y * (s.z + WARDROBE_CLEAR) / 2 }, p.rotationDeg, { x: s.x, z: WARDROBE_CLEAR })
  }
  const low = (p: FurniturePlacement) => heightRange(kitAsset(p.assetId)!)[0] < 1

  test('piece size by room size: under 11 m² a 2-door wardrobe, under 9 m² a single bed, under 10 m² a 4-seat dining set; a wardrobe keeps 0.7 m clear in front', () => {
    const small = rect('bed', 3.5, 3.1) // 10.85 m²
    const ids = furnish(small, deriveRooms(small)).map((p) => p.assetId)
    expect(ids).toContain('bed_queen')
    expect(ids).toContain('wardrobe_2door')
    expect(ids).not.toContain('wardrobe_tall')
    const big = rect('bed', 3.6, 3.1) // 11.16 m², 10 cm longer: the 3-door one fits, and is allowed
    expect(furnish(big, deriveRooms(big)).map((p) => p.assetId)).toContain('wardrobe_tall')
    const tiny = rect('bed', 3.0, 2.9, { wall: 1, offsetM: 0.3 }) // 8.7 m²
    expect(furnish(tiny, deriveRooms(tiny)).map((p) => p.assetId)).toContain('bed_single')
    const dining = rect('dining', 3.2, 3.0, { wall: 3, offsetM: 1 }) // 9.6 m²: six chairs would fit, four is the rule
    expect(furnish(dining, deriveRooms(dining)).filter((p) => p.assetId === 'dining_chair')).toHaveLength(4)
    for (const u of [small, big, tiny, typeA, typeB, typeC, sheltech].filter(Boolean)) {
      const ps = furnish(u, deriveRooms(u))
      for (const w of ps.filter((p) => p.assetId.startsWith('wardrobe_')))
        for (const p of ps.filter((p) => p.roomId === w.roomId && p !== w && low(p) && !isRug(p) && kitAsset(p.assetId)!.mount !== 'ceiling'))
          expect(quadsOverlap(frontZone(w), quad(p)), `${u.id}: ${p.id} within 0.7 m of ${w.id}`).toBe(false)
    }
  })

  test.skipIf(!typeA || !typeB || !typeC || !sheltech)('a bed never stands on a door entry path (1.2 m in; a slider its step-in) and some door has a straight path to the wardrobe past it', () => {
    for (const u of [typeA, typeB, typeC, sheltech]) {
      const rooms = deriveRooms(u)
      const ps = furnish(u, rooms)
      for (const r of rooms.filter((r) => r.kind === 'bed' && r.areaSqm >= 4)) {
        const mine = ps.filter((p) => p.roomId === r.id)
        const bed = mine.find((p) => p.assetId.startsWith('bed_'))
        expect(bed, `${u.id} ${r.name}: a bed`).toBeDefined()
        const entries = doorClearZones(r, u, true)
        for (const z of entries) expect(quadsOverlap(quad(bed!), z), `${u.id} ${r.name}: bed on an entry path`).toBe(false)
        const w = mine.find((p) => p.assetId.startsWith('wardrobe_'))
        if (!w) continue
        // the 0.7 m strip in front of it: its middle and both ends (PATH_W / 2 in)
        const t = (w.rotationDeg * Math.PI) / 180
        const s = kitAsset(w.assetId)!.sizeM
        const [f, x] = [{ x: -Math.sin(t), y: Math.cos(t) }, { x: Math.cos(t), y: Math.sin(t) }]
        const ends = [0, -1, 1].map((k) => ({
          x: w.x + f.x * (s.z + WARDROBE_CLEAR) / 2 + (x.x * k * (s.x - PATH_W)) / 2,
          y: w.y + f.y * (s.z + WARDROBE_CLEAR) / 2 + (x.y * k * (s.x - PATH_W)) / 2,
        }))
        const path = (a: Pt, b: Pt) => {
          const l = Math.hypot(b.x - a.x, b.y - a.y)
          const m = { x: (-(b.y - a.y) / l) * (PATH_W / 2), y: ((b.x - a.x) / l) * (PATH_W / 2) }
          return [{ x: a.x + m.x, y: a.y + m.y }, { x: b.x + m.x, y: b.y + m.y }, { x: b.x - m.x, y: b.y - m.y }, { x: a.x - m.x, y: a.y - m.y }]
        }
        const doors = entries.map((z) => ({ x: (z[0].x + z[1].x) / 2, y: (z[0].y + z[1].y) / 2 }))
        expect(doors.some((d) => ends.some((e) => !quadsOverlap(path(d, e), quad(bed!)))), `${u.id} ${r.name}: wardrobe cut off by the bed`).toBe(true)
      }
    }
    expect(ENTRY).toBe(1.2)
    // Sheltech Bed 4 (10.4 m², door + 1.8 m slider): the queen leaves no reachable wardrobe with 0.7 m clear, so the single bed
    const ids = furnish(sheltech, deriveRooms(sheltech)).filter((p) => p.roomId === 'r_bed4').map((p) => p.assetId)
    expect(ids).toContain('bed_single')
    expect(ids).toContain('wardrobe_2door')
  })

  test('a bed slides along the blankest wall off a door entry path (centred, it cleared the 1 m swing zone but not the 1.2 m path)', () => {
    // 4 × 3.2, a window in the bottom wall: the top wall is the blankest; a door in the left wall at its top end
    const unit = rect('bed', 4, 3.2, { wall: 3, offsetM: 2.2 }) // wall 3 runs v4 → v1 (bottom to top): the door spans y 1.0–0.1
    unit.walls[2].openings.push({ id: 'win', kind: 'window', offsetM: 1.5, widthM: 1.0, heightM: 1.4, sillM: 0.9 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const bed = ps.find((p) => p.assetId.startsWith('bed_'))!
    expect(bed.rotationDeg, 'still against the top wall').toBe(0)
    expect(bed.x, 'slid away from the door').toBeGreaterThan(2)
    for (const z of doorClearZones(rooms[0], unit, true)) expect(quadsOverlap(quad(bed), z)).toBe(false)
    expectInsideAndDisjoint(ps, rooms, unit)
  })
})

describe('sized labels', () => {
  test('a resized piece is named for what is built: doors, seats, width; at its kit size the kit label', () => {
    for (const id of ['wardrobe_tall', 'wardrobe_2door', 'closet_rail', 'closet_rail_s', 'kitchen_tall', 'dining_table', 'rug_rect_large', 'rug_rect_small', 'bed_queen', 'bed_single_b'])
      expect(placementLabel({ assetId: id }), id).toBe(kitAsset(id)!.label)
    const sized = (assetId: string, x: number, z = 0.6) => placementLabel({ assetId, sizeM: { x, y: 2.2, z } })
    expect(sized('wardrobe_tall', 2.4)).toBe('Tall wardrobe (oak, 4 doors)')
    expect(sized('wardrobe_2door', 0.9)).toBe('Wardrobe (oak, 2 doors)')
    expect(sized('dining_table', 0.9, 0.75)).toBe('Dining table, oak, 2 seats')
    expect(sized('dining_table', 1.2, 0.9)).toBe('Dining table, oak, 4 seats')
    expect(sized('dining_table', 2.6, 1.0)).toBe('Dining table, oak, 10 seats')
    expect(sized('closet_rail', 2.35)).toBe('Open closet unit: rail, shelf, clothes (2.35 m)')
    expect(sized('rug_rect_small', 2.5, 1.8)).toBe('Wool rug 2.5 × 1.8 m')
    expect(sized('bed_queen', 2.16, 2.16)).toBe('King bed, upholstered')
    expect(placementLabel({ assetId: 'sofa_3seat', sizeM: { x: 9, y: 1, z: 1 } })).toBe('3-seat fabric sofa') // no size in its name
  })
})
