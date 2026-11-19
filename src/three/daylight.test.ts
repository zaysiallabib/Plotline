import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import { bakeDaylight, facing, factorAt, formFactor, HI, isCovered, LO, mapDaylight, openToSky, RANGE, SHORT_WALL_M, zRaise } from './daylight'
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
  test('no texel-to-texel step above 0.25 in any indoor room (wave 13: 0.49 from the hard clamp and the wall-end texels)', () => {
    const u = typeA as Unit
    const rooms = core.deriveRooms(u)
    const d = bakeDaylight(u, rooms)
    for (const [key, r] of d.regions) {
      if (['shaft', 'balcony'].includes(rooms.find((x) => x.id === r.roomId)!.kind)) continue // a sky well / veranda: steep by nature
      const at = texel(d, key)
      let m = 0
      for (let y = 0; y < r.nv; y++)
        for (let x = 0; x < r.nu; x++) m = Math.max(m, x ? Math.abs(at(x, y) - at(x - 1, y)) : 0, y ? Math.abs(at(x, y) - at(x, y - 1)) : 0)
      expect(m, key).toBeLessThanOrEqual(0.25)
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

describe('neighbours in the bake (founder 2026-11-20: "with space there is much more light … not the case in real life")', () => {
  // TEST_UNIT on floor 2 (6.6 m over the street): the living's window looks south (−y), the bed's east (+x)
  const rect = (x0: number, y0: number, x1: number, y1: number, heightM: number) => ({ plan: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], heightM })
  const south = (gap: number, heightM = 25) => rect(-10, -gap - 12, 20, -gap, heightM)
  const rooms = core.deriveRooms(TEST_UNIT)
  const open = bakeDaylight(TEST_UNIT, rooms)
  const mean = (d: ReturnType<typeof bake>, key: string) => [...d.regions.get(key)!.E].reduce((a, b) => a + b, 0) / d.regions.get(key)!.E.length

  test('facing: the block straight out of the window — its distance and its top over the floor; none behind, none lower, none far off', () => {
    const c = { x: 3, y: 0 }
    const out = { x: 0, y: -1 }
    expect(facing(c, out, 1.6, [south(3)], 6.6)).toEqual({ D: 3, H: 25 - 6.6 })
    expect(facing(c, { x: 0, y: 1 }, 1.6, [south(3)], 6.6)).toBeNull()
    expect(facing(c, out, 1.6, [south(3, 7)], 6.6)).toBeNull() // its roof 0.4 m over the floor: under the window
    expect(facing(c, out, 1.6, [south(150)], 6.6)).toBeNull()
    // two in line: the one standing higher over the line of sight
    expect(facing(c, out, 1.6, [south(3, 12), rect(-10, -40, 20, -20, 60)], 6.6)).toEqual({ D: 20, H: 60 - 6.6 })
  })

  test("zRaise: a neighbour's roof line in the window plane, seen from inside", () => {
    expect(zRaise(1, 0, 3, 20)).toBe(1) // at the window: its own horizon
    expect(zRaise(1, 3, 3, 20)).toBeCloseTo(1 + 19 / 2, 9) // as far in as the block is out: halfway up
    expect(zRaise(1, 3, 3, 0.5)).toBe(1) // a roof below the eye: the horizon
  })

  test('a block 3 m off the window darkens the room it faces, more than one 9 m off; the room facing the other way keeps its light', () => {
    const near = bakeDaylight(TEST_UNIT, rooms, [], [south(3)])
    const far = bakeDaylight(TEST_UNIT, rooms, [], [south(9)])
    expect(mean(near, 'floor:living')).toBeLessThan(0.6 * mean(open, 'floor:living'))
    expect(mean(near, 'floor:living')).toBeLessThan(mean(far, 'floor:living'))
    expect(mean(far, 'floor:living')).toBeLessThan(mean(open, 'floor:living'))
    // what the eye sees (the atlas): the living dimmer, the bed (its own window east) as before but for the door's share
    for (const key of ['floor:living', 'wall:w5:1', 'wall:w5:-1', 'ceil:living']) {
      if (!open.regions.has(key)) continue
      expect(factorAt(near, key, 2.5, 1), key).toBeLessThan(factorAt(open, key, 2.5, 1) - 0.1)
    }
    expect(factorAt(near, 'floor:bed', 7, 2)).toBeGreaterThan(factorAt(open, 'floor:bed', 7, 2) - 0.05)
  })

  test('a block lower than the floor, or out of view, changes nothing', () => {
    const d = bakeDaylight(TEST_UNIT, rooms, [], [south(3, 6), rect(-10, 4.5, 20, 20, 30)]) // under the floor; behind the living's blank north wall
    expect([...d.data]).toEqual([...open.data])
describe('a flat under the floor above (founder 2026-11-20: "a gap in the ceiling … getting sunlight in")', () => {
  const u = typeA as Unit
  const rooms = core.deriveRooms(u)
  const veranda = rooms.find((r) => r.name === 'Veranda (study)')! // 3.6 m²: a small recessed veranda
  const shaft = rooms.find((r) => r.name === 'AOD (west)')!
  const over = (r: core.Room) => [core.roomPolygon(r, u)] // the same face on the floor above

  test('a small veranda or a shaft sees the sky only where no slab of the floor above is over it', () => {
    expect([openToSky(veranda), openToSky(shaft)]).toEqual([true, true]) // no tower: as before
    expect(openToSky(veranda, over(veranda))).toBe(false)
    expect(openToSky(shaft, over(veranda))).toBe(true) // the slab is elsewhere: the shaft stays a light well
  })

  test('the bake gives the covered veranda no sky from above', () => {
    const open = bakeDaylight(u, rooms).regions.get(`floor:${veranda.id}`)!.E
    const shut = bakeDaylight(u, rooms, over(veranda)).regions.get(`floor:${veranda.id}`)!.E
    const mean = (e: ArrayLike<number>) => Array.from(e).reduce((a, b) => a + b, 0) / e.length
    expect(mean(shut)).toBeLessThan(mean(open) * 0.8) // its open sides (the rail) still light it
  })
})
