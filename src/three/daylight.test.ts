import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Unit } from '../core'
import * as THREE from 'three'
import { MAX_SAMPLES, bakeDaylight, bakeSteps, dayMap, daylightTexture, facing, factorAt, formFactor, HI, isCovered, LAMP_RANGE, lightPiece, LO, mapDaylight, openToSky, pieceDayUv, RANGE, setDaylight, setLampShare, SHORT_WALL_M, zRaise } from './daylight'
import { batch } from './batch'
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
  test('in steps (a floor reached by the stair bakes a little a frame): a pause after each surface it lights, the same atlas', () => {
    const u = typeA as unknown as Unit
    const rooms = core.deriveRooms(u)
    const steps = bakeSteps(u, rooms)
    let [n, r] = [0, steps.next()]
    for (; !r.done; r = steps.next()) n++
    const whole = bakeDaylight(u, rooms)
    expect(n).toBeGreaterThan(2 * whole.regions.size - 10) // twice round the surfaces (the sky, then through the doors)
    expect(r.value!.data).toEqual(whole.data)
  })
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

  test('another floor of the drawing reuses the open-view half of its bake (BakeKeep): the same atlas as a bake of its own, in fewer steps', () => {
    const blocks = [south(3)]
    const keep = {}
    const steps = (u: Unit, k = {}) => {
      const g = bakeSteps(u, rooms, [], blocks, k)
      let [n, r] = [0, g.next()]
      for (; !r.done; r = g.next()) n++
      return { n, d: r.value! }
    }
    const first = steps({ ...TEST_UNIT, floor: 3 }, keep)
    const fresh = steps({ ...TEST_UNIT, floor: 4 })
    const kept = steps({ ...TEST_UNIT, floor: 4 }, keep)
    expect(kept.d.data).toEqual(fresh.d.data)
    expect(kept.n).toBeLessThan(fresh.n)
    expect(first.d.data).not.toEqual(fresh.d.data) // a floor higher: the block's shade is less (the half that is kept is not the whole)
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
  })
})

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

describe('furniture reads the daylight of its room (session 31: "furniture in a windowless room is still lit as if it had a window")', () => {
  const u = typeA as Unit
  const rooms = core.deriveRooms(u)
  const d = bakeDaylight(u, rooms)
  /** the factor a piece gets: the atlas texel its dayUv falls in (the nearest, as factorAt reads) */
  const got = (uv: [number, number]) => (RANGE * d.data[Math.floor(uv[1] * d.height) * d.width + Math.floor(uv[0] * d.width)]) / 255
  const piece = (x: number, y: number, roomId: string) => pieceDayUv(d, rooms, u, { x, y }, roomId)

  test("a piece reads its room's floor where its middle stands: a closet's rail and a windowless toilet's basin dim, a sofa by the window bright", () => {
    const rail = piece(9.22, 12.6, 'r_closet') // the walk-in closet: no window
    const basin = piece(4.24, 9.44, 'r_htoilet') // the help's toilet: one door, no window
    const sofa = piece(11.16, 5.62, 'r_living') // its back to the living room's windows
    expect(got(rail)).toBe(factorAt(d, 'floor:r_closet', 9.22, 12.6))
    expect(got(basin)).toBe(factorAt(d, 'floor:r_htoilet', 4.24, 9.44))
    expect(got(sofa)).toBe(factorAt(d, 'floor:r_living', 11.16, 5.62))
    for (const v of [got(rail), got(basin)]) expect(v).toBeLessThan(0.5)
    expect(got(sofa)).toBeGreaterThan(1)
    // the dining, lit through the living room's opening: between the two
    const table = got(piece(6.67, 10.04, 'r_dining'))
    expect(table).toBeGreaterThan(got(rail))
    expect(table).toBeLessThan(got(sofa))
  })

  test('a piece across two rooms takes the room its middle is in; a middle in no room keeps its own room', () => {
    const dt = bakeDaylight(TEST_UNIT, core.deriveRooms(TEST_UNIT))
    const inRegion = (uv: [number, number], key: string) => {
      const r = dt.regions.get(key)!
      const [x, y] = [uv[0] * dt.width, uv[1] * dt.height]
      return x >= r.x && x <= r.x + r.nu && y >= r.y && y <= r.y + r.nv
    }
    const trs = core.deriveRooms(TEST_UNIT)
    expect(inRegion(pieceDayUv(dt, trs, TEST_UNIT, { x: 4.6, y: 2 }, 'bed'), 'floor:living')).toBe(true) // listed in the bed, its middle in the living
    expect(inRegion(pieceDayUv(dt, trs, TEST_UNIT, { x: 2.5, y: -0.1 }, 'bed'), 'floor:bed')).toBe(true) // in the outer wall's outer half: no room
  })

  test('a piece on an open zone (a lawn: not baked) reads the OPEN texel: neutral by day, a lit room at night — as before', () => {
    const g = GROUND_SAMPLE
    const gr = core.deriveRooms(g)
    const dg = bakeDaylight(g, gr)
    const at = { x: 1, y: 8 } // the lawn round the lobby
    expect(core.roomAt(at, gr, g)?.id).toBe('Lawn')
    const uv = pieceDayUv(dg, gr, g, at, 'Lawn')
    const [x, y] = [Math.floor(uv[0] * dg.width), Math.floor(uv[1] * dg.height)]
    expect(dg.regions.has('floor:Lawn')).toBe(false)
    expect([...dg.regions.values()].some((r) => x >= r.x && x < r.x + r.nu && y >= r.y && y < r.y + r.nv)).toBe(false) // no room's texel
    const rg = daylightTexture(dg).image.data as Uint8Array
    expect(rg[2 * (y * dg.width + x)]).toBe(Math.round(255 / RANGE)) // factor 1 by day
    expect(rg[2 * (y * dg.width + x) + 1]).toBeGreaterThan(0) // at night a lit room's lamp share (the neutral block's is 0: dark)
    expect(rg[2 * (y * dg.width + x) + 1]).toBe(rg[2 * 5 + 1])
    expect(rg[1]).toBe(0)
    expect(pieceDayUv(dg, gr, g, { x: 4, y: 4 }, 'Lawn')).not.toEqual(uv) // listed on the lawn, its middle in the lobby
  })

  test("lightPiece: each piece its own dayUv over its model's shared vertices; the material patched once; a moved piece only gets new numbers", () => {
    const geo = new THREE.BoxGeometry(1, 1, 1) // a model's clones share one geometry
    const mat = new THREE.MeshStandardMaterial()
    const own = new THREE.MeshStandardMaterial()
    own.onBeforeCompile = () => {} // a material with its own shader (a pane, water): left alone
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.1 }) // a shower screen: seen through, left alone
    const a = new THREE.Group().add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, own), new THREE.Mesh(geo, glass))
    const b = new THREE.Group().add(new THREE.Mesh(geo, mat))
    lightPiece(a, [0.25, 0.5])
    lightPiece(b, [0.75, 0.125])
    const [ma, mo] = a.children as THREE.Mesh[]
    const mb = b.children[0] as THREE.Mesh
    const uvs = (m: THREE.Mesh) => [...new Set(Array.from(m.geometry.getAttribute('dayUv').array as Float32Array).map((v, i) => `${i % 2}:${v}`))]
    expect(uvs(ma)).toEqual(['0:0.25', '1:0.5'])
    expect(uvs(mb)).toEqual(['0:0.75', '1:0.125'])
    expect(ma.geometry).not.toBe(geo)
    expect(ma.geometry.attributes.position).toBe(geo.attributes.position) // the vertices are not copied
    expect(ma.geometry.index).toBe(geo.index)
    expect(geo.getAttribute('dayUv')).toBeUndefined()
    expect(mat.customProgramCacheKey()).toBe('daylit') // the room surfaces' programs
    expect(mo.geometry).toBe(geo)
    expect(own.customProgramCacheKey()).not.toBe('daylit')
    expect((a.children[2] as THREE.Mesh).geometry).toBe(geo)
    expect(glass.customProgramCacheKey()).not.toBe('daylit')
    // moved into another room: the same geometry, new numbers
    const before = ma.geometry
    const v0 = (ma.geometry.getAttribute('dayUv') as THREE.BufferAttribute).version
    lightPiece(a, [0.5, 0.5])
    expect(ma.geometry).toBe(before)
    expect(uvs(ma)).toEqual(['0:0.5', '1:0.5'])
    expect((ma.geometry.getAttribute('dayUv') as THREE.BufferAttribute).version).toBeGreaterThan(v0)
    // batched (batch.ts), the two pieces stay one draw, each with its own numbers
    const root = new THREE.Group().add(a, b)
    const out = batch(root).filter((m) => m.material === mat)
    expect(out).toHaveLength(1)
    expect(uvs(out[0])).toEqual(['0:0.5', '1:0.5', '0:0.75', '1:0.125'])
  })
})

describe('the lamps baked for Lite (session 31 perf: no lamp light in the shader)', () => {
  test('lampLight is three’s spot light: candela × cone × cos ÷ d², faded at its reach; nothing above it, behind a face or past its reach', async () => {
    const { lampLight } = await import('./daylight')
    const l = { roomId: 'living', x: 0, y: 0, h: 2.8, cd: 7, cosCone: Math.cos(THREE.MathUtils.degToRad(83)), distance: 8 }
    const fade = (d: number) => (1 - (d / 8) ** 4) ** 2
    expect(lampLight(l, [0, 0, 0], [0, 0, 1])).toBeCloseTo((7 * fade(2.8)) / 2.8 ** 2, 6) // straight under it
    const side = lampLight(l, [2, 0, 0], [0, 0, 1])
    expect(side).toBeGreaterThan(0)
    expect(side).toBeLessThan(lampLight(l, [0, 0, 0], [0, 0, 1])) // the pool falls off toward the walls
    expect(lampLight(l, [0, 0, 0], [0, 0, -1])).toBe(0) // a face turned away
    expect(lampLight(l, [0, 0, 3], [0, 0, 1])).toBe(0) // above it: outside its cone
    expect(lampLight(l, [9, 0, 0], [0, 0, 1])).toBe(0) // past its reach
  })

  test('setLampDirect: each room’s lamps on its own surfaces only, brightest under the lamp; the neutral block and other rooms dark', async () => {
    const { lampMap, setLampDirect, LAMP_DIRECT } = await import('./daylight')
    const d = bakeDaylight(TEST_UNIT, core.deriveRooms(TEST_UNIT))
    setDaylight(d)
    setLampDirect([{ roomId: 'living', x: 2.5, y: 2, h: 2.8, cd: 7, cosCone: Math.cos(THREE.MathUtils.degToRad(83)), distance: 6 }])
    const t = lampMap.value as THREE.DataTexture
    const data = t.image.data as Uint8Array
    const at = (key: string, u: number, v: number) => {
      const r = d.regions.get(key)!
      const x = Math.round((u - r.u0) / r.du)
      const y = Math.round((v - r.v0) / r.dv)
      return LAMP_DIRECT * (data[(r.y + y) * d.width + r.x + x] / 255) ** 2
    }
    expect(at('floor:living', 2.5, 2)).toBeGreaterThan(0.5) // the pool under it
    expect(at('floor:living', 2.5, 2)).toBeGreaterThan(at('floor:living', 0.4, 0.4)) // brighter than the corner
    expect(at('floor:bed', 7, 2)).toBe(0) // another room: its own lamps only
    expect(data[0]).toBe(0) // the neutral block: faces toward the outside stay dark
    setDaylight(null)
    expect(lampMap.value).not.toBe(t) // a new atlas: baked again for it
  })
})

describe('a big floor bakes in bounded work (s31 bigifc: the LTU A-House floor never opened in Preview 3D)', () => {
  /** a glazed corridor round a courtyard of `n` × `n` offices: one 2 m ring, every office a window and a door on it */
  function campus(n: number): Unit {
    const S = 6 // office size, m
    const W = n * S
    const v: Unit['vertices'] = []
    const walls: Unit['walls'] = []
    const at = (x: number, y: number) => {
      const id = `v${x},${y}`
      if (!v.some((q) => q.id === id)) v.push({ id, x, y })
      return id
    }
    const wall = (a: string, b: string, openings: Unit['walls'][number]['openings'] = []) => walls.push({ id: `w${walls.length}`, a, b, thicknessM: 0.15, heightM: 3, openings })
    const win = (k: number) => [{ id: `o${k}`, kind: 'window' as const, offsetM: 1, widthM: 4, heightM: 1.5, sillM: 0.9 }]
    const door = (k: number) => [{ id: `d${k}`, kind: 'door' as const, offsetM: 2.5, widthM: 0.9, heightM: 2.1, sillM: 0 }]
    // a row of offices along the top, their doors onto a corridor 2 m below, the corridor's outer wall glazed
    for (let i = 0; i < n; i++) {
      wall(at(i * S, 0), at((i + 1) * S, 0), win(i))
      wall(at(i * S, S), at((i + 1) * S, S), door(i))
      wall(at(i * S, S + 2), at((i + 1) * S, S + 2), win(1000 + i))
    }
    for (let i = 0; i <= n; i++) wall(at(i * S, 0), at(i * S, S))
    wall(at(0, S), at(0, S + 2))
    wall(at(W, S), at(W, S + 2))
    return { id: 'campus', projectName: 'p', name: 'Level 2', northDeg: 0, vertices: v, walls, roomLabels: [], furniture: [], finishSlots: [], areaSqft: 0 }
  }
  test("a flat keeps its 25 cm grid; a 240 m glazed corridor coarsens, and its whole bake stays quick", () => {
    const a = typeA as unknown as Unit
    const flat = bakeDaylight(a, core.deriveRooms(a))
    expect(Math.max(...[...flat.regions.values()].map((r) => Math.max(r.du, r.dv)))).toBeLessThanOrEqual(0.25 + 1e-9)
    const u = campus(40)
    const day = bakeDaylight(u, core.deriveRooms(u))
    const corridor = [...day.regions.entries()].find(([k, r]) => k.startsWith('floor:') && r.nu * r.du > 200)!
    expect(corridor[1].du).toBeGreaterThan(0.25)
    expect(Math.max(...[...day.regions.values()].map((r) => r.nu * r.nv))).toBeLessThanOrEqual(1.5 * MAX_SAMPLES) // (a thin face's rounding: a little over)
    expect(day.ms).toBeLessThan(3000)
  })
})
