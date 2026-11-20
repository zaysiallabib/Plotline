import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import * as core from '../core'
import type { FurniturePlacement, Unit } from '../core'
import { buildProcedural } from './procedural'
import { arriveBy, isStair, isStairRoom, LANDING_M, stairArrival, stairSpot } from './stairs'
import { layoutFor } from '../studio/furniture'
import { stairTo, type Tower } from '../data/building'
import { arrivalFace, DOOR_LEAF_MAX } from '../viewer/spawn'
import { frameShares } from '../viewer/frame'
import * as bti from '../data/building/demo-tower'
import * as sheltech from '../data/building/sheltech-tower'
import l1 from '../data/units/sheltech-l1.json'
import ground from '../data/units/sheltech-ground.json'

const stair = (rotationDeg = 0, x = 0, y = 0): FurniturePlacement => ({ id: 's', assetId: 'stair_28', roomId: 'r', x, y, rotationDeg })

describe('walking the dog-leg stair (founder 2026-11-20: "if i climb a stair i cannot reach the upper floor")', () => {
  test('the walker stands on the treads the 3D stair draws: flight A up to the half landing', () => {
    const g = buildProcedural('stair_28')!
    g.updateMatrixWorld(true)
    const top = (x: number, z: number) => new THREE.Raycaster(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0)).intersectObject(g, true)[0]?.point.y
    const h = (x: number, z: number) => {
      const s = stairSpot(stair(), { x, y: z })
      return s && 'h' in s ? s.h : null
    }
    for (const i of [1, 3, 5, 8]) expect(h(-0.7, 1.55 - (i - 0.5) * 0.25), `tread ${i}`).toBeCloseTo(top(-0.7, 1.55 - (i - 0.5) * 0.25)!, 2) // mid-tread
    expect(h(-0.7, -1.0)).toBeCloseTo(LANDING_M, 6)
    expect(top(0.7, -1.0)).toBeCloseTo(LANDING_M, 2) // the landing runs across both flights
    expect(top(0.7, 0.3)!).toBeGreaterThan(LANDING_M) // flight B: on up to the floor above
  })

  test('flight B is the way to the next floor; off the stair is the floor', () => {
    expect(stairSpot(stair(), { x: 0.7, y: 0.3 })).toEqual({ part: 'between' })
    expect(stairSpot(stair(), { x: -0.7, y: 1.42 })).toEqual({ part: 'flight', h: 1 / 6 })
    expect(stairSpot(stair(), { x: 0, y: 1.7 })).toBeNull() // in front of it
    // turned 90°: its front faces −x (presets turn it to its wall), flight A on the −y side
    expect(stairSpot(stair(90), { x: -1.42, y: -0.7 })).toEqual({ part: 'flight', h: 1 / 6 })
    expect(stairSpot(stair(90), { x: -0.3, y: 0.7 })).toEqual({ part: 'between' })
  })

  test('arriving: on that floor itself, in front of the stair — from below beside flight B, from above at the foot of flight A (session 31)', () => {
    const up = stairArrival(stair(90, 3, 9), 'below')
    expect(stairSpot(stair(90, 3, 9), up.at)).toBeNull() // on this floor's floor, in front of the stair
    expect(up.at.x).toBeCloseTo(3 - 1.55 - 0.45, 6)
    expect(up.at.y).toBeGreaterThan(9) // flight B's side
    expect(up.face.x).toBeCloseTo(-1, 6)
    const down = stairArrival(stair(90, 3, 9), 'above')
    expect(stairSpot(stair(90, 3, 9), down.at)).toBeNull() // on the floor, not the half landing 1.5 m up (between floors)
    expect(down.at.x).toBeCloseTo(up.at.x, 6)
    expect(down.at.y).toBeLessThan(9) // flight A's side: the foot of the last flight down to this floor
    // a step back from there is onto flight A's first tread (the way he came down), not under flight B (the way down again)
    expect(stairSpot(stair(90, 3, 9), { x: down.at.x + 0.6, y: down.at.y })).toEqual({ part: 'flight', h: 1 / 6 })
    expect(down.face).toEqual(up.face)
  })

  test('a floor reached by the stair: its stair room, on its stair; a stair room too small for a flight: its middle', () => {
    const u = l1 as unknown as Unit
    const rooms = core.deriveRooms(u)
    const lu = { ...u, furniture: layoutFor(u, rooms) }
    const s = lu.furniture.find((p) => p.assetId.startsWith('stair_'))!
    const up = arriveBy(lu, rooms, { x: 3.53, y: 9.24 }, 'below')!
    expect(up.at).toEqual(stairArrival(s, 'below').at)
    expect(up.face.y).toBeLessThan(-0.5) // toward the stair room's door to the lobby (north), not the wall in front of the stair
    const down = arriveBy(lu, rooms, { x: 3.53, y: 9.24 }, 'above')!
    expect(down.at).toEqual(stairArrival(s, 'above').at) // the foot of flight A
    expect(down.face.y).toBeLessThan(-0.5) // into the floor: toward the same door as on the way up
    const g = ground as unknown as Unit
    const gr = core.deriveRooms(g)
    const room = gr.find((r) => r.id === 'r_stair')!
    expect(arriveBy({ ...g, furniture: layoutFor(g, gr) }, gr, { x: 3.0, y: 10.2 }, 'above')!.at).toEqual(room.centroid)
    expect(arriveBy(lu, rooms, { x: -20, y: -20 }, 'below')).toBeNull()
  })

  /** the stair taken from `stem` on `floor` as the viewer takes it (its stair room's stair, else the room's middle): where he arrives */
  const leg = (t: Tower, stem: string, floor: number, room: string, dir: 1 | -1) => {
    const u = t.FLATS[stem].unit
    const rooms = core.deriveRooms(u)
    const lu = { ...u, furniture: layoutFor(u, rooms) }
    const r = rooms.find((x) => x.name === room)!
    const s = lu.furniture.find((p) => p.roomId === r.id && isStair(p))
    const to = stairTo(t, stem, floor, s ?? r.centroid, dir)
    if (!to) return null
    const nu = t.FLATS[to.stem].unit
    const nr = core.deriveRooms(nu)
    const next = { ...nu, furniture: layoutFor(nu, nr) }
    const by = arriveBy(next, nr, to.at, dir > 0 ? 'below' : 'above')!
    const solid = { vertices: next.vertices, walls: next.walls.filter((w) => w.heightM > 0.2) }
    return { stem: to.stem, floor: to.floor, room: core.roomAt(by.at, nr, next)?.name, at: by.at, wallM: core.nearestWall(by.at, solid)!.distanceM, onStair: next.furniture.filter(isStair).some((p) => stairSpot(p, by.at)) }
  }

  test('a whole tower by the stair, basements to the rooftop and back: each floor in its stair room, standing on its floor', () => {
    const T = sheltech as unknown as Tower
    const up: string[] = []
    const down: string[] = []
    for (let k = -2, stem = 'sheltech-b2', room = 'Stair'; ; ) {
      const a = leg(T, stem, k, room, 1)
      if (!a) break
      expect(a.onStair, `${stem} up`).toBe(false) // on the floor in front of the stair, never on a tread or the half landing
      expect(a.wallM, `${stem} up`).toBeGreaterThan(0.5) // clear of the walls: he can walk on (the walker is 0.3 m round)
      up.push(`${a.stem}@${a.floor} ${a.room}`)
      ;[k, stem, room] = [a.floor, a.stem, a.room!]
    }
    expect(up).toEqual([
      'sheltech-b1@-1 Stair',
      'sheltech-ground@0 Stair (to the basements)', // the basements' own stair on the ground
      'sheltech-l1@1 Stair',
      ...[2, 3, 4, 5, 6].map((k) => `sheltech-a@${k} Stair`),
      'sheltech-roof@7 Stair case',
    ])
    for (let k = 7, stem = 'sheltech-roof', room = 'Stair case'; ; ) {
      const a = leg(T, stem, k, room, -1)
      if (!a) break
      expect(a.onStair, `${stem} down`).toBe(false)
      expect(a.wallM, `${stem} down`).toBeGreaterThan(0.5)
      down.push(`${a.stem}@${a.floor} ${a.room}`)
      ;[k, stem, room] = [a.floor, a.stem, a.room!]
    }
    expect(down).toEqual([...up.slice(0, -1)].reverse().concat('sheltech-b2@-2 Stair'))
    // BTI: the stair is Type B's (Type A has none); down from floor 3 to the floor-2 stand-in, at the foot of flight A
    const b3 = leg(bti as unknown as Tower, 'type-b', 3, 'Stair', -1)!
    expect(b3).toMatchObject({ stem: 'type-b', floor: 2, room: 'Stair', onStair: false })
    const bu = core.deriveRooms(bti.FLATS['type-b'].unit)
    const flight = layoutFor(bti.FLATS['type-b'].unit, bu).find(isStair)!
    expect(b3.at).toEqual(stairArrival(flight, 'above').at)
    expect(leg(bti as unknown as Tower, 'type-b', 8, 'Stair', 1)).toBeNull() // the top floor: no stair on up (the rooftop is massing)
    expect(isStairRoom({ name: 'Stair case' })).toBe(true)
  })

  test('which way he looks on arrival: the door, into the floor — or, the door a step away (BTI), along the stair', () => {
    const look = (raw: unknown, from: 'below' | 'above') => {
      const u0 = raw as Unit
      const rooms = core.deriveRooms(u0)
      const u = { ...u0, furniture: layoutFor(u0, rooms) }
      const s = u.furniture.find(isStair)!
      const by = arriveBy(u, rooms, stairArrival(s, from).at, from)!
      return { by, face: arrivalFace(u, by), leaf: frameShares(u, by.at, by.face).get(by.door!) ?? 0 }
    }
    const tb = look(bti.FLATS['type-b'].unit, 'above')
    expect(tb.leaf).toBeGreaterThan(DOOR_LEAF_MAX) // the stair room's door 1 m off: its leaf would fill the frame
    expect(tb.face).toEqual(tb.by.aside)
    expect(tb.face.y).toBeCloseTo(-1, 6) // north along the 1.3 m strip in front of the stair, away from the door (south)
    for (const [name, raw] of [['type-b', bti.FLATS['type-b'].unit], ['sheltech-a', sheltech.FLATS['sheltech-a'].unit]] as const)
      expect(look(raw, 'below').face, `${name} up: the door`).toEqual(look(raw, 'below').by.face)
    const sa = look(sheltech.FLATS['sheltech-a'].unit, 'above')
    expect(sa.leaf).toBeLessThanOrEqual(DOOR_LEAF_MAX)
    expect(sa.face).toEqual(sa.by.face) // 1.4 m: the door, into the floor
  })
})
