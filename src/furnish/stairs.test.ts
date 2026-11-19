import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import * as core from '../core'
import type { FurniturePlacement, Unit } from '../core'
import { buildProcedural } from './procedural'
import { arriveBy, LANDING_M, stairArrival, stairSpot } from './stairs'
import { layoutFor } from '../studio/furniture'
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

  test('arriving: from below on the front landing beside flight B, facing out; from above on the half landing, facing down flight A', () => {
    const up = stairArrival(stair(90, 3, 9), 'below')
    expect(stairSpot(stair(90, 3, 9), up.at)).toBeNull() // on this floor's floor, in front of the stair
    expect(up.at.x).toBeCloseTo(3 - 1.55 - 0.45, 6)
    expect(up.at.y).toBeGreaterThan(9) // flight B's side
    expect(up.face.x).toBeCloseTo(-1, 6)
    const down = stairArrival(stair(90, 3, 9), 'above')
    expect(stairSpot(stair(90, 3, 9), down.at)).toEqual({ part: 'landing', h: LANDING_M })
  })

  test('a floor reached by the stair: its stair room, on its stair; a stair room too small for a flight: its middle', () => {
    const u = l1 as unknown as Unit
    const rooms = core.deriveRooms(u)
    const lu = { ...u, furniture: layoutFor(u, rooms) }
    const s = lu.furniture.find((p) => p.assetId.startsWith('stair_'))!
    const up = arriveBy(lu, rooms, { x: 3.53, y: 9.24 }, 'below')!
    expect(up.at).toEqual(stairArrival(s, 'below').at)
    expect(up.face.y).toBeLessThan(-0.5) // toward the stair room's door to the lobby (north), not the wall in front of the stair
    expect(arriveBy(lu, rooms, { x: 3.53, y: 9.24 }, 'above')).toEqual(stairArrival(s, 'above')) // down flight A
    const g = ground as unknown as Unit
    const gr = core.deriveRooms(g)
    const room = gr.find((r) => r.id === 'r_stair')!
    expect(arriveBy({ ...g, furniture: layoutFor(g, gr) }, gr, { x: 3.0, y: 10.2 }, 'above')!.at).toEqual(room.centroid)
    expect(arriveBy(lu, rooms, { x: -20, y: -20 }, 'below')).toBeNull()
  })
})
