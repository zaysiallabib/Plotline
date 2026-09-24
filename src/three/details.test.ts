/** Pure span logic behind the skirting mesh (details.ts). */
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import * as core from '../core'
import type { Unit } from '../core'
import { skirtingSpans } from './details'
import { TEST_UNIT } from './testUnit'

describe('skirtingSpans', () => {
  const rooms = core.deriveRooms(TEST_UNIT)

  test.each(['living', 'bed'])('%s: skirting stops exactly at the door jambs of the shared wall', (id) => {
    const room = rooms.find((r) => r.id === id)!
    const inner = core.roomInnerPolygon(room, TEST_UNIT)
    const edge = room.wallIds.indexOf('w8') // v2 (5,0) → v3 (5,4); door1 spans y ∈ [2.4, 3.3]
    const ys = skirtingSpans(room, TEST_UNIT)
      .filter((s) => s.edge === edge)
      .map((s) => {
        const p = inner[edge]
        const q = inner[(edge + 1) % inner.length]
        const at = (t: number) => p.y + ((q.y - p.y) * t) / s.len
        return [at(s.s0), at(s.s1)].sort((a, b) => a - b)
      })
      .sort((a, b) => a[0] - b[0])
    expect(ys).toHaveLength(2)
    expect(ys[0][1]).toBeCloseTo(2.4, 9)
    expect(ys[1][0]).toBeCloseTo(3.3, 9)
  })

  test('windows above skirting height do not interrupt it', () => {
    const living = rooms.find((r) => r.id === 'living')!
    expect(skirtingSpans(living, TEST_UNIT).filter((s) => s.edge === living.wallIds.indexOf('w1'))).toHaveLength(1)
  })

  test('type-a: none in baths, balconies or shafts; every bedroom has some', () => {
    const unit = typeA as unknown as Unit
    for (const r of core.deriveRooms(unit)) {
      const n = skirtingSpans(r, unit).length
      if (['bath', 'balcony', 'shaft'].includes(r.kind)) expect(n, r.name).toBe(0)
      if (r.kind === 'bed') expect(n, r.name).toBeGreaterThan(3)
    }
  })
})
