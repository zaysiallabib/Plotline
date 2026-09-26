/** The demo tower's data (data/building/demo-tower.ts): alignment offsets re-derived from the traced lift core, floor map. */
import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import { CORE, FLATS, FLOORS } from '../data/building/demo-tower'

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
