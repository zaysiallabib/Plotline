/** Pure rules behind the contact shadows and the street context (context.ts). */
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import * as core from '../core'
import type { Unit } from '../core'
import { kitAsset } from '../furnish/kit'
import { furnish } from '../furnish/presets'
import sheltechA from '../data/units/sheltech-a.json'
import typeB from '../data/units/type-b.json'
import { streetOf, towerOf } from '../data/building'
import * as THREE from 'three'
import { lite } from '../furnish/procedural'
import { BAY, blockParts, buildStreet, contactShadows, madeUpStreet, neighbourBlocks, plainShade, STOREY } from './context'
import { TEST_UNIT } from './testUnit'

const base = typeA as unknown as Unit
const unit: Unit = { ...base, furniture: furnish(base, core.deriveRooms(base)) }
const UNIT_OF: Record<string, Unit> = { 'type-a': base, 'type-b': typeB as unknown as Unit, 'sheltech-a': sheltechA as unknown as Unit }

describe('contactShadows on furnished type-a', () => {
  const shadows = new Map(contactShadows(unit).map((s) => [s.id, s]))
  const ids = (re: RegExp) => unit.furniture.filter((p) => re.test(p.assetId)).map((p) => p.id)

  test('every floor-standing piece is grounded: sofas, beds, wardrobes, fridge, base modules, tables, chairs, bedsides', () => {
    const want = ids(/^(sofa_3seat|bed_|wardrobe_tall|drawer_cabinet|fridge|kitchen_(counter|sink|hob|tall)|dining_(table|chair)|bedside_oak|desk_oak|modern_wooden_cabinet)/)
    expect(want.length).toBeGreaterThan(25)
    for (const id of want) expect(shadows.has(id), id).toBe(true)
  })

  test('rugs, wall-hung, ceiling-hung and raised pieces get none', () => {
    const none = ids(/^(rug_|kitchen_upper|kitchen_hood|tv_55|ceiling_fan|modern_ceiling_lamp|art_|wall_clock|toilet|vanity|cushions_plain)/)
    expect(none.length).toBeGreaterThan(15)
    for (const id of none) expect(shadows.has(id), id).toBe(false)
    for (const p of unit.furniture) {
      const a = kitAsset(p.assetId)!
      if (a.category === 'rug' || (a.mount && a.mount !== 'floor') || (a.mountY ?? 0) > 0.05) expect(shadows.has(p.id), p.id).toBe(false)
    }
  })

  test('the shadow hugs the placement: centred on it, legged pieces lighter, taller pieces wider', () => {
    for (const p of unit.furniture) {
      const s = shadows.get(p.id)
      if (!s) continue
      const c = s.quad.reduce((a, q) => ({ x: a.x + q.x / 4, y: a.y + q.y / 4 }), { x: 0, y: 0 })
      expect(Math.hypot(c.x - p.x, c.y - p.y), p.id).toBeLessThan(1e-9)
    }
    const sofa = shadows.get(ids(/^sofa_3seat$/)[0])!
    const chair = shadows.get(ids(/^dining_chair$/)[0])!
    const wardrobe = shadows.get(ids(/^wardrobe_tall$/)[0])!
    const table = shadows.get(ids(/^modern_coffee_table_01$/)[0])!
    expect(chair.strength).toBeLessThan(sofa.strength)
    expect(wardrobe.blurM).toBeGreaterThan(sofa.blurM)
    expect(sofa.blurM).toBeGreaterThan(table.blurM)
  })
})

describe('neighbourBlocks', () => {
  const cases = [core.unitBounds(base), core.unitBounds(TEST_UNIT)]
  type R = { minX: number; maxX: number; minY: number; maxY: number }
  const box = (k: { x0: number; x1: number; y0: number; y1: number }): R => ({ minX: k.x0, maxX: k.x1, minY: k.y0, maxY: k.y1 })
  const overlap = (a: R, b: R) => a.minX < b.maxX - 1e-9 && b.minX < a.maxX - 1e-9 && a.minY < b.maxY - 1e-9 && b.minY < a.maxY - 1e-9
  const grow = (b: R, d: number): R => ({ minX: b.minX - d, maxX: b.maxX + d, minY: b.minY - d, maxY: b.maxY + d })
  /** side k (0 −y, 1 +y, 2 −x, 3 +x): how far out from b a rect stands, and whether it lies off that side (within b's span) */
  const off = (b: R, q: R, k: number) => [b.minY - q.maxY, q.minY - b.maxY, b.minX - q.maxX, q.minX - b.maxX][k]
  const beside = (b: R, q: R, k: number) => (k < 2 ? q.minX < b.maxX && b.minX < q.maxX : q.minY < b.maxY && b.minY < q.maxY)
  const seeds = [1, 7, 12345, 0xdeadbeef, 42, 2026]

  test.each(seeds)('seed %i: whole-bay blocks of 6–10 storeys, 2.2 m or more off the walls; one or two roads 6–9 m wide; nothing overlaps', (seed) => {
    for (const b of cases) {
      const { blocks, roads } = neighbourBlocks({ walls: b }, seed)
      expect(blocks.length).toBeGreaterThanOrEqual(20)
      expect(blocks.length).toBeLessThanOrEqual(90)
      expect(roads.length).toBeGreaterThanOrEqual(1)
      expect(roads.length).toBeLessThanOrEqual(3) // a corner: the cross road in two pieces
      for (const q of roads) {
        expect(overlap(q, grow(b, 1.5 - 1e-6)), 'a road on the plot').toBe(false)
        expect(Math.min(q.maxX - q.minX, q.maxY - q.minY)).toBeGreaterThanOrEqual(6 - 1e-9)
        expect(Math.min(q.maxX - q.minX, q.maxY - q.minY)).toBeLessThanOrEqual(9 + 1e-9)
      }
      roads.forEach((q, i) => roads.slice(i + 1).forEach((o) => expect(overlap(q, o)).toBe(false)))
      blocks.forEach((k, i) => {
        expect(k.storeys).toBeGreaterThanOrEqual(6)
        expect(k.storeys).toBeLessThanOrEqual(10)
        for (const len of [k.x1 - k.x0, k.y1 - k.y0]) expect(Math.abs(len / BAY - Math.round(len / BAY))).toBeLessThan(1e-9)
        expect(overlap(box(k), grow(b, 2.2 - 1e-6)), `block ${i} on the plot`).toBe(false)
        for (const q of roads) expect(overlap(box(k), q), `block ${i} on the road`).toBe(false)
        for (const o of blocks.slice(i + 1)) expect(overlap(box(k), box(o))).toBe(false)
      })
    }
  })

  test.each(seeds)('seed %i: a window on a side with no road looks at a neighbour 2.2–4 m off, its row continuous (0–1.5 m gaps); across a road the blocks stand at its edge', (seed) => {
    for (const b of cases) {
      const { blocks, roads } = neighbourBlocks({ walls: b }, seed)
      const roadSides = [0, 1, 2, 3].filter((k) => roads.some((q) => beside(b, q, k) && off(b, q, k) >= 0))
      expect(roadSides.length).toBeGreaterThanOrEqual(1)
      expect(roadSides.length).toBeLessThanOrEqual(2)
      for (let k = 0; k < 4; k++) {
        const facing = blocks.map(box).filter((q) => beside(b, q, k) && off(b, q, k) >= 0)
        const near = Math.min(...facing.map((q) => off(b, q, k)))
        if (roadSides.includes(k)) {
          const q = roads.find((r) => beside(b, r, k) && off(b, r, k) >= 0)!
          const far = off(b, q, k) + (k < 2 ? q.maxY - q.minY : q.maxX - q.minX)
          expect(near - far, `side ${k}: across the road`).toBeGreaterThanOrEqual(1 - 1e-9)
          expect(near - far).toBeLessThanOrEqual(1.5 + 1e-9)
          continue
        }
        expect(near, `side ${k}`).toBeGreaterThanOrEqual(2.2 - 1e-9)
        expect(near, `side ${k}`).toBeLessThanOrEqual(4 + 1e-9)
        // the front row covers the walls' side — but up to 2 m at an end by a road (the next plot's front setback, the run
        // centred on its stretch) — no gap over 1.5 m between two neighbours
        const row = facing
          .filter((q) => off(b, q, k) < near + 1e-6)
          .map((q) => (k < 2 ? [q.minX, q.maxX] : [q.minY, q.maxY]))
          .sort((p, q) => p[0] - q[0])
        const [lo, hi] = k < 2 ? [b.minX, b.maxX] : [b.minY, b.maxY]
        expect(row[0][0], `side ${k} start`).toBeLessThanOrEqual(lo + 2)
        expect(row.at(-1)![1], `side ${k} end`).toBeGreaterThanOrEqual(hi - 2)
        for (let i = 1; i < row.length; i++) expect(row[i][0] - row[i - 1][1], `side ${k} gap`).toBeLessThanOrEqual(1.5 + 1e-9)
      }
    }
  })

  test('different seeds lay different streets: the road side and the gap vary', () => {
    const b = core.unitBounds(base)
    const sides = new Set<string>()
    const gaps = new Set<number>()
    for (let seed = 0; seed < 40; seed++) {
      const { blocks, roads } = neighbourBlocks({ walls: b }, seed)
      sides.add([0, 1, 2, 3].filter((k) => roads.some((q) => beside(b, q, k) && off(b, q, k) >= 0)).join())
      const west = blocks.map(box).filter((q) => beside(b, q, 2) && off(b, q, 2) >= 0)
      gaps.add(Math.round(10 * Math.min(...west.map((q) => off(b, q, 2)))))
    }
    expect(sides.size).toBeGreaterThanOrEqual(6) // each side alone, and corners
    expect(gaps.size).toBeGreaterThanOrEqual(5)
  })

  test("a tower's street (streetOf): the drawing's roads, no block on its plot (gardens, driveway), its storeys ± 2; one street per tower", () => {
    for (const stem of ['type-a', 'type-b', 'sheltech-a']) {
      const t = towerOf(UNIT_OF[stem])!
      const street = streetOf(t, stem)
      const { blocks, roads } = neighbourBlocks(street, 9)
      expect(roads).toEqual([]) // the drawing's roads are the street's: none made up
      for (const k of blocks) {
        expect(overlap(box(k), grow(street.plot!, 1.25 - 1e-6)), `${stem}: a block on the plot`).toBe(false)
        for (const q of street.roads!) expect(overlap(box(k), q), `${stem}: a block on the road`).toBe(false)
        expect(Math.abs(k.storeys - street.storeys!)).toBeLessThanOrEqual(2)
      }
      // a side with no road: a neighbour 1.25–4 m past the plot's edge
      const b = street.walls
      let free = 0
      for (let k = 0; k < 4; k++) {
        if (street.roads!.some((q) => beside(b, q, k) && off(b, q, k) >= -0.5)) continue
        free++
        const near = Math.min(...blocks.map(box).filter((q) => beside(b, q, k) && off(b, q, k) >= 0).map((q) => off(street.plot!, q, k)))
        expect(near, `${stem} side ${k}`).toBeGreaterThanOrEqual(1.25 - 1e-9)
        expect(near, `${stem} side ${k}`).toBeLessThanOrEqual(4)
      }
      expect(free).toBe(stem === 'sheltech-a' ? 3 : 2) // BTI: a corner plot (roads 9/A, 10/A); Sheltech: the road south
    }
    const [a, b] = [streetOf(towerOf(UNIT_OF['type-a'])!, 'type-a'), streetOf(towerOf(UNIT_OF['type-b'])!, 'type-b')]
    expect(a.seed).toBe(b.seed)
    expect(a.walls.minY - b.walls.minY).toBeCloseTo(-9.221, 6) // the same box, in each flat's own frame
  })

  test('facade variants mix; block parts hug their block (≤ 0.9 m out, up to the tanks) and skip the parking storey', () => {
    const b = core.unitBounds(base)
    const at = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
    const { blocks } = neighbourBlocks({ walls: b }, 7)
    expect(new Set(blocks.map((k) => k.facade)).size).toBeGreaterThanOrEqual(2)
    let r = 0
    for (const k of blocks) {
      const parts = blockParts(k, at, () => (r = (r + 0.37) % 1))
      const H = k.storeys * STOREY
      expect(parts.some((q) => q.tank && q.z0 > H)).toBe(true)
      for (const q of parts) {
        expect(q.x0 >= k.x0 - 0.9 - 1e-9 && q.x1 <= k.x1 + 0.9 + 1e-9 && q.y0 >= k.y0 - 0.9 - 1e-9 && q.y1 <= k.y1 + 0.9 + 1e-9).toBe(true)
        expect(q.z0 >= STOREY && q.z1 <= H + 4).toBe(true)
        // off the walls only on the side facing the unit
        if (q.x1 > k.x1 + 1e-9) expect(at.x).toBeGreaterThan(k.x1)
        if (q.x0 < k.x0 - 1e-9) expect(at.x).toBeLessThan(k.x0)
        if (q.y1 > k.y1 + 1e-9) expect(at.y).toBeGreaterThan(k.y1)
        if (q.y0 < k.y0 - 1e-9) expect(at.y).toBeLessThan(k.y0)
      }
    }
  })
})

describe('Lite’s street: plain boxes, one mesh', () => {
  test('one draw call, no picture, vertex colours; each block a bare box (no parapets, tanks or AC units), each road a strip', () => {
    const street = streetOf(towerOf(base)!, 'type-a')
    const { blocks, roads } = madeUpStreet(base, street)
    lite.on = true
    try {
      const plain = buildStreet(base, street, 0)
      expect(plain.children).toHaveLength(1)
      const mesh = plain.children[0] as THREE.Mesh
      const m = mesh.material as THREE.MeshStandardMaterial
      expect([m.map, m.vertexColors]).toEqual([null, true])
      expect(mesh.geometry.attributes.position.count / 3).toBe(12 * blocks.length + 2 * ((street.roads ?? []).length + roads.length))
    } finally {
      lite.on = false
    }
  })
  test('a face toward the afternoon light is lighter than one turned away; none darker than 0.7', () => {
    const [sw, ne] = [plainShade(new THREE.Vector3(-1, 0, 0)), plainShade(new THREE.Vector3(1, 0, 0))]
    expect(sw).toBeGreaterThan(ne)
    expect(ne).toBe(0.7)
    expect(plainShade(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(sw)
  })
})
