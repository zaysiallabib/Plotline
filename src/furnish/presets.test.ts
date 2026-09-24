import { describe, expect, test } from 'vitest'
import { deriveRooms, pointInPolygon, roomInnerPolygon, type FurniturePlacement, type Pt, type Room, type RoomKind, type Unit } from '../core'
import { kitAsset } from './kit'
import { footprint, furnish, quadsOverlap } from './presets'

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

const quad = (p: FurniturePlacement) => footprint(p, p.rotationDeg, kitAsset(p.assetId)!.sizeM)
const aabb = (q: Pt[]) => ({
  minX: Math.min(...q.map((p) => p.x)),
  maxX: Math.max(...q.map((p) => p.x)),
  minY: Math.min(...q.map((p) => p.y)),
  maxY: Math.max(...q.map((p) => p.y)),
})
// the round table's square footprint legitimately overlaps its chairs' corners
const floorItems = (ps: FurniturePlacement[]) => ps.filter((p) => kitAsset(p.assetId)!.mount !== 'ceiling' && p.assetId !== 'round_wooden_table_01')

function expectInsideAndDisjoint(ps: FurniturePlacement[], rooms: Room[], unit: Unit) {
  for (const p of ps) {
    const room = rooms.find((r) => r.id === p.roomId)!
    const inner = roomInnerPolygon(room, unit)
    for (const c of quad(p)) expect(pointInPolygon(c, inner), `${p.id} corner outside`).toBe(true)
  }
  const fl = floorItems(ps)
  for (let i = 0; i < fl.length; i++) {
    for (let j = i + 1; j < fl.length; j++) {
      if (fl[i].roomId !== fl[j].roomId) continue
      const a = quad(fl[i])
      const b = quad(fl[j])
      const axis = fl[i].rotationDeg % 90 === 0 && fl[j].rotationDeg % 90 === 0
      if (axis) {
        const A = aabb(a)
        const B = aabb(b)
        const hit = A.minX < B.maxX - 1e-6 && B.minX < A.maxX - 1e-6 && A.minY < B.maxY - 1e-6 && B.minY < A.maxY - 1e-6
        expect(hit, `${fl[i].id} overlaps ${fl[j].id}`).toBe(false)
      } else {
        expect(quadsOverlap(a, b), `${fl[i].id} overlaps ${fl[j].id}`).toBe(false)
      }
    }
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
    expect(Math.min(bed.y, 3.5 - bed.y)).toBeCloseTo(0.127 / 2 + 0.05 + 2.1 / 2, 6)
    const tables = ps.filter((p) => p.assetId === 'side_table_01')
    expect(tables).toHaveLength(2)
    expect(tables.some((t) => t.x < bed.x) && tables.some((t) => t.x > bed.x)).toBe(true)
    // door swing zone: 0.9 wide from y=0.3, 1 m into the room from the wall's inner face
    const swing = [
      { x: 4 - 0.0635, y: 0.3 },
      { x: 4 - 0.0635, y: 1.2 },
      { x: 4 - 1.0635, y: 1.2 },
      { x: 4 - 1.0635, y: 0.3 },
    ]
    for (const p of floorItems(ps)) expect(quadsOverlap(quad(p), swing), `${p.id} blocks the door`).toBe(false)
    expectInsideAndDisjoint(ps, rooms, unit)
    expect(ps.map((p) => p.id)).toContain('r:bed_queen:1')
  })

  test('small bedroom gets a single bed', () => {
    const unit = rect('bed', 3, 2.6)
    const ps = furnish(unit, deriveRooms(unit))
    expect(ps.some((p) => p.assetId === 'bed_single')).toBe(true)
  })

  test('5 × 4 living: sofa, table, tv unit, chair, plant, fan — inside and disjoint', () => {
    const unit = rect('living', 5, 4, { wall: 3, offsetM: 1.5 })
    const rooms = deriveRooms(unit)
    const ps = furnish(unit, rooms)
    const ids = ps.map((p) => p.assetId)
    for (const a of ['sofa_02', 'modern_coffee_table_01', 'modern_wooden_cabinet', 'modern_arm_chair_01', 'potted_plant_01', 'ceiling_fan']) {
      expect(ids, a).toContain(a)
    }
    expectInsideAndDisjoint(ps, rooms, unit)
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
  test.skipIf(!typeA)('type-a.json: ≥ 25 placements, none outside their room', () => {
    const rooms = deriveRooms(typeA)
    const ps = furnish(typeA, rooms)
    expect(ps.length).toBeGreaterThanOrEqual(25)
    expectInsideAndDisjoint(ps, rooms, typeA)
  })

  test.skipIf(!typeA)('type-a.json living room: sofa + coffee table + a TV unit or shelves on some other wall', () => {
    const rooms = deriveRooms(typeA)
    const living = rooms.find((r) => r.id === 'r_living')!
    const ids = furnish(typeA, rooms).filter((p) => p.roomId === living.id).map((p) => p.assetId)
    expect(ids).toContain('sofa_02')
    expect(ids).toContain('modern_coffee_table_01')
    expect(ids.some((a) => a === 'modern_wooden_cabinet' || a === 'wooden_display_shelves_01')).toBe(true)
  })
})
