/** Walking a level (session 19): where a ground floor / rooftop / basement is entered, its Rooms list, minimap, area — by kind and geometry. */
import { describe, expect, it } from 'vitest'
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'
import bananiB1 from '../data/units/banani-b1.json'
import bananiB2 from '../data/units/banani-b2.json'
import bananiGround from '../data/units/banani-ground.json'
import bananiRoof from '../data/units/banani-roof.json'
import dmdB1 from '../data/units/dmd-b1.json'
import sheltechL1 from '../data/units/sheltech-l1.json'
import typeA from '../data/units/type-a.json'
import { withDefaults } from './defaults'
import { mapOf } from './Minimap'
import { entrySpawn, isLevel, listedRooms } from './spawn'

const at = (u: Unit) => {
  const rooms = core.deriveRooms(u)
  const e = entrySpawn(u, rooms)!
  return { rooms, e, room: core.roomAt(e.p, rooms, u)!, named: (n: string) => rooms.find((r) => r.name === n)! }
}
const toward = (e: { p: Pt; face: Pt }, q: Pt) => {
  const d = Math.hypot(q.x - e.p.x, q.y - e.p.y)
  return (e.face.x * (q.x - e.p.x) + e.face.y * (q.y - e.p.y)) / d
}

describe('a level is walked by its own rules', () => {
  it('a ground floor: just inside its widest gate, facing the lobby', () => {
    const { e, room, rooms } = at(bananiGround as unknown as Unit)
    expect(room.name).toBe('Entry ramp') // the 4.55 m car gate, not the 1.6 m pedestrian one
    const lobby = rooms.filter((r) => r.kind === 'lobby').sort((a, b) => b.areaSqm - a.areaSqm)[0]
    expect(toward(e, lobby.centroid)).toBeGreaterThan(0.99)
  })

  it('a rooftop: out of the stair-and-lift lobby onto the roof, facing on; a basement: beside the lift lobby on the drive, never in a parking bay', () => {
    const roof = at(bananiRoof as unknown as Unit)
    expect(roof.room.name).toBe('Roof terrace')
    expect(core.isOutdoor(roof.room.kind)).toBe(true)
    const b1 = at(bananiB1 as unknown as Unit)
    expect(b1.room.kind).toBe('driveway')
    const lobby = b1.named('Lift lobby')
    expect(Math.min(...core.roomPolygon(lobby, bananiB1 as unknown as Unit).map((q) => Math.hypot(q.x - b1.e.p.x, q.y - b1.e.p.y)))).toBeLessThan(4)
    for (const u of [bananiB2, dmdB1]) expect(at(u as unknown as Unit).room.kind, (u as unknown as Unit).id).toBe('driveway')
  })

  it('a common floor of rooms only (Level 1: lounge, gym) is entered like a flat; a flat is not a level', () => {
    const l1 = at(sheltechL1 as unknown as Unit)
    expect(isLevel(l1.rooms)).toBe(true)
    expect(l1.room.kind).toBe('lobby')
    expect(isLevel(core.deriveRooms(typeA as unknown as Unit))).toBe(false)
  })

  it('a level traced in the Studio (no names relied on): gate → drive, facing its lobby; Rooms list: rooms first, then zones, bays last by number', () => {
    const v = (id: string, x: number, y: number) => ({ id, x, y })
    const wall = (id: string, a: string, b: string, heightM = 3, openings: Unit['walls'][number]['openings'] = []) => ({ id, a, b, thicknessM: heightM ? 0.25 : 0.05, heightM, openings })
    // 0..30 × 0..12: a lobby (west, 0..8), a drive (8..30 × 0..7) with the gate in its south… north wall, two bays (8..30 × 7..12)
    const u: Unit = {
      id: 'g',
      projectName: '',
      name: 'g',
      northDeg: 0,
      vertices: [v('a', 0, 0), v('b', 8, 0), v('c', 30, 0), v('d', 30, 7), v('e', 30, 12), v('f', 19, 12), v('g', 8, 12), v('h', 8, 7), v('i', 0, 12), v('j', 19, 7)],
      walls: [
        wall('w1', 'a', 'b'),
        wall('w2', 'b', 'c', 2.1, [{ id: 'gate', kind: 'passage', offsetM: 15, widthM: 5, heightM: 2.1, sillM: 0 }]),
        wall('w3', 'c', 'd'),
        wall('w4', 'd', 'e'),
        wall('w5', 'e', 'f'),
        wall('w6', 'f', 'g'),
        wall('w7', 'g', 'i'),
        wall('w8', 'i', 'a'),
        wall('w9', 'b', 'h', 3, [{ id: 'door', kind: 'door', offsetM: 3, widthM: 1.2, heightM: 2.1, sillM: 0 }]),
        wall('w10', 'h', 'g'),
        wall('w11', 'h', 'j', 0),
        wall('w12', 'j', 'd', 0),
        wall('w13', 'j', 'f', 0),
      ],
      roomLabels: [
        { id: 'l', name: 'Hall', kind: 'lobby', x: 4, y: 6 },
        { id: 'd', name: 'Drive', kind: 'driveway', x: 20, y: 3 },
        { id: 'p2', name: 'P2', kind: 'parking', x: 25, y: 10 },
        { id: 'p1', name: 'P1', kind: 'parking', x: 12, y: 10 },
      ],
      furniture: [],
      finishSlots: [],
      areaSqft: 0,
    }
    const { e, room, named, rooms } = at(u)
    expect(room.name).toBe('Drive')
    expect(e.p.y).toBeCloseTo(0.125 + 1.2, 6) // 1.2 m inside the gate's wall face
    expect(toward(e, named('Hall').centroid)).toBeGreaterThan(0.99)
    expect(listedRooms(u, rooms).map((r) => r.name)).toEqual(['Hall', 'Drive', 'P1', 'P2'])
    // the minimap: zone edges dashed, the zones tinted by kind; area: the hall only (a drive is no floor area)
    const m = mapOf(u, rooms)
    expect(m.walls.filter((w) => w.low === 'flush')).toHaveLength(3)
    expect(m.rooms.map((r) => r.zone ?? 'room').sort()).toEqual(['driveway', 'parking', 'parking', 'room'])
    const hall = named('Hall') as Room
    expect(withDefaults(u, rooms).areaSqft).toBe(Math.round(core.sqmToSqft(hall.areaSqm)))
  })
})
