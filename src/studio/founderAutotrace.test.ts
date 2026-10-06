/**
 * The founder's auto-trace draft of Sheltech Level 2 Type A (exported 2026-10-06, HANDOFF session 22 task 3): the
 * measurement baseline. Pins what the tracer did on his sheet so a tracer change can be measured against it:
 * 19 closed rooms, twelve of the thirteen printed sizes off (2" tolerance), and the flat's spine wall (x ≈ 5.14 in the hand-traced
 * sheltech-a) drawn on two different lines, 4.96 for y 5.55..10.68 and 5.27 for y 10.68..12.90, both 5.5" thin —
 * the two faces of one thick wall, each taken as a wall of its own.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Unit } from '../core'
import draft from '../data/fixtures/founder-autotrace-type-a-2026-10-06.json'
import { initialState, reducer } from './model'
import { sheetAxis, sizeCheck } from './review'

describe("founder's auto-trace draft of Type A (2026-10-06)", () => {
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const rooms = deriveRooms(u)
  it('loads: 102 walls, 19 closed rooms, 13 printed sizes, 12 of them off (the measurement finding)', () => {
    expect(u.walls.length).toBe(102)
    expect(rooms.length).toBe(19)
    const axis = sheetAxis(u)
    const checks = u.roomLabels.map((l) => [l.name, sizeCheck(u, l.id, rooms, axis)] as const).filter(([, c]) => c)
    expect(checks.length).toBe(13)
    expect(checks.filter(([, c]) => c!.off).length).toBe(12)
  })
  it('the spine wall was traced on its two faces (x 4.96 then 5.27), both thin', () => {
    const V = new Map(u.vertices.map((v) => [v.id, v]))
    const vertAt = (x: number) => u.walls.filter((w) => Math.abs(V.get(w.a)!.x - x) < 0.02 && Math.abs(V.get(w.b)!.x - x) < 0.02 && Math.abs(V.get(w.a)!.y - V.get(w.b)!.y) > 0.1)
    const west = vertAt(4.96).concat(vertAt(4.97)), east = vertAt(5.27)
    expect(west.length).toBeGreaterThan(0)
    expect(east.length).toBeGreaterThan(0)
    for (const w of [...west, ...east]) expect(w.thicknessM).toBeLessThan(0.16)
  })
})
