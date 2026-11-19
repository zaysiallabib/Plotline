import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import * as THREE from 'three'
import { bakeDaylight, dayMap, factorAt, formFactor, HI, isCovered, LAMP_RANGE, LO, mapDaylight, openToSky, RANGE, setDaylight, setLampShare, SHORT_WALL_M } from './daylight'
import { GROUND_SAMPLE } from '../data/fixtures/ground-sample'
import { wallGeometry } from './details'
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

  test('founder 2026-11-20 ("way too bright inside even without sunlight"): deep rooms dim by day, windowless ones dimmer, a strong window-to-back falloff', () => {
    const d = bake(typeA as Unit)
    const vals = (room: string, cls: string) =>
      [...d.regions].filter(([k, r]) => r.roomId === room && k.startsWith(cls)).flatMap(([, r]) => Array.from({ length: r.nu * r.nv }, (_, i) => (RANGE * d.data[(r.y + Math.floor(i / r.nu)) * d.width + r.x + (i % r.nu)]) / 255))
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]
    // the windowless toilet (one door, to the help bed) and the walk-in closet: dim, about a third
    for (const room of ['r_htoilet', 'r_closet']) expect(median(vals(room, 'wall')), room).toBeLessThan(0.45)
    // the dining, lit through the living's passage and the study's glass: dimmer than the window rooms, not dark
    expect(median(vals('r_dining', 'wall'))).toBeGreaterThan(0.5)
    expect(median(vals('r_dining', 'wall'))).toBeLessThan(0.8)
    // a window room: its window zone ≥ 1.4, its back ≤ 0.7 (before: 1.25 and 0.75 at most)
    for (const room of ['r_living', 'r_bed1', 'r_study']) {
      const w = vals(room, 'wall')
      expect(Math.max(...w), room).toBeGreaterThan(1.4)
      expect(Math.min(...w), room).toBeLessThan(0.7)
      expect(median(w), room).toBeGreaterThan(0.85)
    }
  })

  test('the lamps’ bounce by room (the atlas’s second channel): a room’s own share, none toward the outside', () => {
    const d = bake(TEST_UNIT)
    setDaylight(d)
    setLampShare(new Map([['living', 1]]))
    const rg = (dayMap.value as THREE.DataTexture).image.data as Uint8Array
    const g = (key: string) => {
      const r = d.regions.get(key)!
      return (LAMP_RANGE * rg[2 * (r.y * d.width + r.x) + 1]) / 255
    }
    expect(g('floor:living')).toBeCloseTo(1, 1)
    expect(g('ceil:living')).toBeCloseTo(1, 1)
    expect(g('floor:bed')).toBe(0) // its lamp deleted
    expect(rg[1]).toBe(0) // the neutral block: faces toward the outside stay dark at night
    setLampShare(new Map([['bed', 0.2]]))
    expect(g('floor:bed')).toBeCloseTo(0.2, 1)
    expect(g('floor:living')).toBe(0)
    setDaylight(null)
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
  const step = (a: number, b: number) => (2 * Math.abs(a - b)) / (a + b)
  const texel = (d: ReturnType<typeof bake>, key: string) => {
    const r = d.regions.get(key)!
    return (x: number, y: number) => (RANGE * d.data[(r.y + y) * d.width + r.x + x]) / 255
  }
  // relative (the eye sees ratios): the stronger falloff of 2026-11-20 spans more range, so its smooth gradients take bigger
  // absolute steps by a window (0.19 → 0.30); wave 13's pattern was ≈ 0.5 of the value, from a hard clamp
  test('no texel-to-texel step above 35 % in any indoor room (wave 13: ≈ 50 % from the hard clamp and the wall-end texels)', () => {
    const u = typeA as Unit
    const rooms = core.deriveRooms(u)
    const d = bakeDaylight(u, rooms)
    for (const [key, r] of d.regions) {
      if (['shaft', 'balcony'].includes(rooms.find((x) => x.id === r.roomId)!.kind)) continue // a sky well / veranda: steep by nature
      const at = texel(d, key)
      let m = 0
      for (let y = 0; y < r.nv; y++)
        for (let x = 0; x < r.nu; x++) m = Math.max(m, x ? step(at(x, y), at(x - 1, y)) : 0, y ? step(at(x, y), at(x, y - 1)) : 0)
      expect(m, key).toBeLessThanOrEqual(0.35)
    }
  }, 30000)
  test("every face triangle reads its own face's region — the L-corner notch too (wave 13's sawtooth by the bed-1 door)", () => {
    const u = typeA as Unit
    const d = bake(u)
    let n = 0
    for (const w of u.walls) {
      const geo = wallGeometry(w, u)
      if (!geo) continue
      mapDaylight(d, geo, u, 'wall', w.id)
      const uv = geo.attributes.dayUv
      const [front, back] = d.sides.get(w.id)!
      const short = core.wallFrame(w, u.vertices).lengthM < SHORT_WALL_M // reads the floor at its foot instead
      for (const g of geo.groups) {
        if (g.materialIndex === 2 || !(g.materialIndex ? back : front)) continue
        const r = d.regions.get(short ? `floor:${(g.materialIndex ? back : front)!.id}` : `wall:${w.id}:${g.materialIndex ? -1 : 1}`)!
        for (let i = g.start; i < g.start + g.count; i++) {
          const [x, y] = [uv.getX(i) * d.width, uv.getY(i) * d.height]
          expect(x >= r.x && x <= r.x + r.nu && y >= r.y && y <= r.y + r.nv, `${w.id} group ${g.materialIndex} vertex ${i}`).toBe(true)
          n++
        }
      }
    }
    expect(n).toBeGreaterThan(1000)
  }, 30000)
  test('a wall-end texel (inside the neighbouring wall) copies the visible face, not its own dark sample', () => {
    const d = bake(typeA as Unit)
    const r = d.regions.get('wall:w_pdr_e:1')! // powder room, by its door: 0.60 beside 1.00 in wave 13
    const at = texel(d, 'wall:w_pdr_e:1')
    for (let y = 0; y < r.nv; y++) expect(Math.abs(at(0, y) - at(1, y))).toBeLessThan(0.06)
  }, 30000)
})

/** Session 19: an outdoor zone is open sky (neutral, no bake), or under the slab above (`cover`) the flat COVERED shade. */
describe('outdoor zones in the bake (ground sample)', () => {
  const u = GROUND_SAMPLE
  const rooms = core.deriveRooms(u)
  const lawnFaces = (d: ReturnType<typeof bakeDaylight>) => [...d.sides].flatMap(([id, [f, b]]) => [f?.id === 'Lawn' ? `wall:${id}:1` : null, b?.id === 'Lawn' ? `wall:${id}:-1` : null]).filter((k): k is string => !!k)

  test('open: a zone and the wall faces toward it are not baked (they read the neutral block); the lobby is, and its door sees open sky', () => {
    const d = bakeDaylight(u, rooms)
    expect(lawnFaces(d).length).toBeGreaterThan(4)
    for (const key of ['floor:Lawn', 'floor:Driveway', 'floor:Ramp', 'ceil:Lawn', ...lawnFaces(d)]) expect(d.regions.has(key), key).toBe(false)
    expect(d.regions.get('floor:Lobby')!.E.some((e) => e > 0)).toBe(true)
    expect(openToSky(rooms.find((r) => r.id === 'Lawn')!)).toBe(true)
  })

  test('covered: the zone under the slab and its wall faces read the COVERED shade; the open ones stay neutral', () => {
    const cover = [[{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 10 }]] // over the lawn, not the drive
    const d = bakeDaylight(u, rooms, cover)
    const lawn = rooms.find((r) => r.id === 'Lawn')!
    expect(isCovered(lawn, cover)).toBe(true)
    expect(openToSky(lawn, cover)).toBe(false)
    expect(factorAt(d, 'floor:Lawn', 1, 5)).toBeCloseTo(0.75, 1)
    for (const key of lawnFaces(d)) expect(factorAt(d, key, 0.5, 1), key).toBeCloseTo(0.75, 1)
    expect(d.regions.has('floor:Driveway')).toBe(false)
  })
})
