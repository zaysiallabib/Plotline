import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import { bakeDaylight, factorAt, formFactor, HI, LO, RANGE } from './daylight'
import { TEST_UNIT } from './testUnit'
import typeA from '../data/units/type-a.json'

const bake = (u: Unit) => bakeDaylight(u, core.deriveRooms(u))
const without = (u: Unit, ids: string[]): Unit => ({ ...u, walls: u.walls.map((w) => ({ ...w, openings: w.openings.filter((o) => !ids.includes(o.id)) })) })

describe('formFactor', () => {
  const quad: [number, number, number][] = [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] // 2 × 2 m, 1 m above
  test('facing a window: more than side-on, nothing from behind', () => {
    const facing = formFactor([0, 0, 0], [0, 0, 1], quad)
    expect(facing).toBeGreaterThan(0.5) // a 2 × 2 m square 1 m overhead ≈ 0.55
    expect(facing).toBeLessThan(0.6)
    expect(formFactor([0, 0, 0], [1, 0, 0], quad)).toBeLessThan(facing)
    expect(formFactor([0, 0, 0], [0, 0, -1], quad)).toBe(0)
    expect(formFactor([0, 0, 2], [0, 0, 1], quad)).toBe(0)
  })
  test('bounded: a huge overhead plane ≈ the whole hemisphere', () => {
    const f = formFactor([0, 0, 0], [0, 0, 1], [[-1e3, -1e3, 1], [1e3, -1e3, 1], [1e3, 1e3, 1], [-1e3, 1e3, 1]])
    expect(f).toBeGreaterThan(0.99)
    expect(f).toBeLessThanOrEqual(1)
  })
})

describe('bakeDaylight', () => {
  test('the window zone is brighter than the back of the room', () => {
    const d = bake(TEST_UNIT) // living: window win1 in the y = 0 wall, x 2.2–3.8
    expect(factorAt(d, 'floor:living', 3, 0.6)).toBeGreaterThan(factorAt(d, 'floor:living', 3, 3.6))
    expect(factorAt(d, 'floor:living', 3, 3.6)).toBeLessThan(1)
    // the wall opposite the window, at the window's height, vs the same wall's far end
    const opp = TEST_UNIT.walls.find((w) => w.id === 'w5')! // v3 (5, 4) → v4 (0, 4)
    const side = d.sides.get(opp.id)![0]?.id === 'living' ? 1 : -1
    expect(factorAt(d, `wall:w5:${side}`, 2, 1.2)).toBeGreaterThan(factorAt(d, `wall:w5:${side}`, 4.9, 0.1))
  })

  test('nothing leaks through a wall without an opening', () => {
    const shut = without(TEST_UNIT, ['door1'])
    const a = bake(shut)
    const b = bake(without(shut, ['win1'])) // the living's only window gone
    let n = 0
    for (const [key, r] of a.regions) {
      if (r.roomId !== 'bed') continue
      expect([...r.E]).toEqual([...b.regions.get(key)!.E])
      n++
    }
    expect(n).toBeGreaterThan(4)
    // ...while through the door, the living's window does reach the bed
    const open = bake(TEST_UNIT)
    const shade = bake(without(TEST_UNIT, ['win1']))
    expect(open.regions.get('floor:bed')!.E[0]).toBeGreaterThan(shade.regions.get('floor:bed')!.E[0])
  })

  test('a windowless room sits at the floor of the range, not black', () => {
    const d = bake(without(TEST_UNIT, ['door1', 'win2']))
    const r = d.regions.get('floor:bed')!
    expect(Math.max(...r.E)).toBe(0)
    expect(factorAt(d, 'floor:bed', 7, 2)).toBeGreaterThan(0.4)
  })

  test('bounded on a real unit: every texel within the range, finite', () => {
    const d = bake(typeA as Unit)
    const E = [...d.regions.values()].flatMap((r) => [...r.E])
    expect(E.every((e) => Number.isFinite(e) && e >= 0)).toBe(true)
    expect(d.data.reduce((a, b) => Math.min(a, b), 255)).toBeGreaterThanOrEqual(Math.floor((255 * LO) / RANGE))
    expect(d.data.reduce((a, b) => Math.max(a, b), 0)).toBeLessThanOrEqual(Math.ceil((255 * HI) / RANGE))
  }, 30000) // ≈ 100 ms idle; the dev machine runs other agents' headless browsers at 100 % CPU
})

describe('smooth atlas (wave 14: no texel pattern)', () => {
  const texel = (d: ReturnType<typeof bake>, key: string) => {
    const r = d.regions.get(key)!
    return (x: number, y: number) => (RANGE * d.data[(r.y + y) * d.width + r.x + x]) / 255
  }
  test('no texel-to-texel step above 0.25 anywhere (wave 13: 0.49 from the hard clamp and the wall-end texels)', () => {
    const d = bake(typeA as Unit)
    for (const [key, r] of d.regions) {
      const at = texel(d, key)
      let m = 0
      for (let y = 0; y < r.nv; y++)
        for (let x = 0; x < r.nu; x++) m = Math.max(m, x ? Math.abs(at(x, y) - at(x - 1, y)) : 0, y ? Math.abs(at(x, y) - at(x, y - 1)) : 0)
      expect(m, key).toBeLessThanOrEqual(0.25)
    }
  }, 30000)
  test('a wall-end texel (inside the neighbouring wall) copies the visible face, not its own dark sample', () => {
    const d = bake(typeA as Unit)
    const r = d.regions.get('wall:w_pdr_e:1')! // powder room, by its door: 0.60 beside 1.00 in wave 13
    const at = texel(d, 'wall:w_pdr_e:1')
    for (let y = 0; y < r.nv; y++) expect(Math.abs(at(0, y) - at(1, y))).toBeLessThan(0.06)
  }, 30000)
})
