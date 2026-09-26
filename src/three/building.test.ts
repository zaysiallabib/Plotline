/** The towers' data (data/building/*-tower.ts): alignment offsets re-derived from the traced core, floor maps, towerOf. */
import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import { towerOf } from '../data/building'
import { CORE, FLATS, FLOORS } from '../data/building/demo-tower'
import * as sheltech from '../data/building/sheltech-tower'

const roomsOf = (u: Unit) => core.deriveRooms(u)

/** The lift-core anchor as the data module documents it: west face of the core rooms, lobby↔lifts wall line. */
function coreAnchor(u: Unit): Pt {
  const box = (name: string) => {
    const r = roomsOf(u).find((x) => x.name === name)
    if (!r) return null
    const p = core.roomPolygon(r, u)
    return { minX: Math.min(...p.map((q) => q.x)), minY: Math.min(...p.map((q) => q.y)), maxY: Math.max(...p.map((q) => q.y)) }
  }
  const [lobby, lifts, stair] = ['Lift lobby', 'Lift core', 'Stair'].map(box)
  return { x: Math.min(...[lobby, lifts, stair].flatMap((b) => (b ? [b.minX] : []))), y: lifts ? lifts.minY : lobby!.maxY }
}

describe('demo tower', () => {
  test('offsets put every trace’s lift core on Type B’s (within 1 cm)', () => {
    const b = coreAnchor(FLATS['type-b'].unit)
    for (const [stem, { unit, offset }] of Object.entries(FLATS)) {
      const a = coreAnchor(unit)
      expect(offset.x, stem).toBeCloseTo(b.x - a.x, 2)
      expect(offset.y, stem).toBeCloseTo(b.y - a.y, 2)
    }
  })

  test('aligned, Type A (2nd floor) and Type C (3rd) cover the same flat: bounds within 0.8 m', () => {
    const bounds = (stem: string) => {
      const { unit, offset } = FLATS[stem]
      const b = core.unitBounds(unit)
      return [b.minX + offset.x, b.maxX + offset.x, b.minY + offset.y, b.maxY + offset.y]
    }
    const [a, c] = [bounds('type-a'), bounds('type-c')]
    // A's east edge stops at its veranda (15.5 m); C's planter reaches 18.3 m: compare the other three sides
    for (const i of [0, 2, 3]) expect(Math.abs(a[i] - c[i])).toBeLessThan(0.8)
  })

  test('floor map: 2 = Type A, 3–8 = Type B + C; every flat sits on its own JSON floor; stems resolve', () => {
    expect(FLOORS.find((f) => f.floor === 2)!.flats).toEqual(['type-a'])
    for (let k = 3; k <= 8; k++) expect(FLOORS.find((f) => f.floor === k)!.flats).toEqual(['type-b', 'type-c'])
    for (const f of FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(FLATS[s], s).toBeDefined()
    for (const { unit } of Object.values(FLATS)) {
      expect(FLOORS.some((f) => f.floor === unit.floor && f.flats.some((s) => FLATS[s].unit.id === unit.id)), unit.name).toBe(true)
    }
  })

  test('the core rooms that run ground to roof exist in their traces', () => {
    for (const [stem, name] of CORE) expect(roomsOf(FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})

describe('Sheltech tower', () => {
  const T = sheltech

  test('towerOf: BTI for type-a/b/c, Sheltech for sheltech-a/b, null for a unit in no tower', () => {
    for (const { unit } of Object.values(FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(FLATS)
    for (const { unit } of Object.values(T.FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(T.FLATS)
    expect(towerOf({ ...FLATS['type-a'].unit, id: 'elsewhere' })).toBeNull()
  })

  test('A and B share the core walls (the lobby) within 1 cm after offsets', () => {
    /** a flat's walls around its Lobby, as segments in the building frame */
    const lobbyWalls = (stem: string) => {
      const { unit, offset } = T.FLATS[stem]
      const lobby = roomsOf(unit).find((r) => r.name === 'Lobby')!
      const vs = new Map(unit.vertices.map((v) => [v.id, { x: v.x + offset.x, y: v.y + offset.y }]))
      return lobby.wallIds.map((id) => unit.walls.find((w) => w.id === id)!).map((w) => [vs.get(w.a)!, vs.get(w.b)!] as const)
    }
    const dist = (p: Pt, [a, b]: readonly [Pt, Pt]) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)))
      return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y))
    }
    // every point along one flat's lobby walls lies on the other flat's lobby walls
    for (const [s, o] of [['sheltech-a', 'sheltech-b'], ['sheltech-b', 'sheltech-a']]) {
      const other = lobbyWalls(o)
      for (const [a, b] of lobbyWalls(s)) {
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const p = { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
          expect(Math.min(...other.map((seg) => dist(p, seg))), `${s} ${p.x},${p.y}`).toBeLessThan(0.01)
        }
      }
    }
  })

  test('floor map: 1 = stand-ins (lounge + gym), 2–6 = A + B; flats sit on their JSON floor; core rooms exist', () => {
    expect(T.FLOORS.map((f) => [f.floor, f.flats.length])).toEqual([[1, 0], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]])
    for (const f of T.FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(T.FLATS[s], s).toBeDefined()
    for (const { unit } of Object.values(T.FLATS)) {
      expect(T.FLOORS.some((f) => f.floor === unit.floor && f.flats.some((s) => T.FLATS[s].unit.id === unit.id)), unit.name).toBe(true)
    }
    for (const [stem, name] of T.CORE) expect(roomsOf(T.FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})
