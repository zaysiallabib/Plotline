/** Pure rules behind the contact shadows and the street context (context.ts). */
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import * as core from '../core'
import type { Unit } from '../core'
import { kitAsset } from '../furnish/kit'
import { furnish } from '../furnish/presets'
import { BAY, contactShadows, neighbourBlocks } from './context'
import { TEST_UNIT } from './testUnit'

const base = typeA as unknown as Unit
const unit: Unit = { ...base, furniture: furnish(base, core.deriveRooms(base)) }

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
  const overlap = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

  test.each([1, 7, 12345, 0xdeadbeef])('seed %i: 6–10 storey blocks, whole bays, ≥ 8 m off the unit, never overlapping each other or the road', (seed) => {
    for (const b of cases) {
      const { blocks, road } = neighbourBlocks(b, seed)
      expect(blocks.length).toBeGreaterThanOrEqual(12)
      expect(blocks.length).toBeLessThanOrEqual(60)
      const keepOut = { x0: b.minX - 8 + 1e-9, x1: b.maxX + 8 - 1e-9, y0: b.minY - 8 + 1e-9, y1: b.maxY + 8 - 1e-9 }
      expect(overlap(road, { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY })).toBe(false)
      blocks.forEach((k, i) => {
        expect(k.storeys).toBeGreaterThanOrEqual(6)
        expect(k.storeys).toBeLessThanOrEqual(10)
        for (const len of [k.x1 - k.x0, k.y1 - k.y0]) expect(Math.abs(len / BAY - Math.round(len / BAY))).toBeLessThan(1e-9)
        expect(overlap(k, keepOut), `block ${i}`).toBe(false)
        expect(overlap(k, road), `block ${i} on the road`).toBe(false)
        for (const o of blocks.slice(i + 1)) expect(overlap(k, o)).toBe(false)
      })
    }
  })

  test('every side of the unit looks out at a near block within 8–40 m', () => {
    const b = core.unitBounds(base)
    const { blocks } = neighbourBlocks(b, 7)
    const near = (d: (k: (typeof blocks)[number]) => number) => blocks.some((k) => d(k) >= 8 - 1e-9 && d(k) <= 40)
    expect(near((k) => b.minY - k.y1)).toBe(true)
    expect(near((k) => k.y0 - b.maxY)).toBe(true)
    expect(near((k) => b.minX - k.x1)).toBe(true)
    expect(near((k) => k.x0 - b.maxX)).toBe(true)
  })
})
