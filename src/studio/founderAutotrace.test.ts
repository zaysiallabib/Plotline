/**
 * The founder's auto-trace draft of Sheltech Level 2 Type A (exported 2026-10-06, HANDOFF session 22 task 3): the
 * measurement baseline. Pins what is in his draft: 19 closed rooms, twelve of the thirteen printed sizes off (2" tolerance).
 * The check passes a room when its main rectangle OR its whole outline matches (founder 2026-10-09); the one that passes is
 * the 5'-2" × 6'-2" toilet (the sheet's PDR), by its outline — L-shaped on the sheet, which prints the whole L (its main
 * rectangle is the 3'-2" × 6'-2" leg). Checked against the sheet 2026-10-09 (src/trace/sheltechL2.test.ts pins the
 * tracer's side):
 * - EIGHT of the twelve are sizes the Studio typed itself: naming a room (R tool box, the "name this room" fix) fills
 *   Printed size with the room's CENTRE-LINE box (model.ts printedSizeOf), and the check compares the INSIDE — always
 *   off by about a wall's thickness. The sheet's own figures for those rooms are different.
 * - the walls at x 4.96 (y 5.55..10.68) and x 5.27 (y 10.68..12.90) are two separate 5" walls on the sheet — the stair
 *   core's east wall and Bed 4's west wall, 8 px apart — each on its own ink. Not one thick wall's faces (the session-22
 *   reading); the hand-traced sheltech-a's single wall at 5.14 sits on the paper between them.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Unit } from '../core'
import draft from '../data/fixtures/founder-autotrace-type-a-2026-10-06.json'
import { initialState, printedSizeOf, reducer } from './model'
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
  it("8 of the 12 off rows carry the Studio's own pre-fill (the room's centre-line box), not a size from the sheet", () => {
    const axis = sheetAxis(u)
    const prefilled = u.roomLabels.filter((l) => {
      const r = rooms.find((x) => x.id === l.id)
      return r && l.printedSize === printedSizeOf(r, u) && sizeCheck(u, l.id, rooms, axis)?.off
    })
    expect(prefilled.map((l) => l.name).sort()).toEqual(['Bed', 'Bedroom 2', 'Living', 'toilet', 'toilet', 'ver', 'ver', 'washroom'])
  })
  it('the walls at x 4.96 and x 5.27 (two separate walls on the sheet) are both thin', () => {
    const V = new Map(u.vertices.map((v) => [v.id, v]))
    const vertAt = (x: number) => u.walls.filter((w) => Math.abs(V.get(w.a)!.x - x) < 0.02 && Math.abs(V.get(w.b)!.x - x) < 0.02 && Math.abs(V.get(w.a)!.y - V.get(w.b)!.y) > 0.1)
    const west = vertAt(4.96).concat(vertAt(4.97)), east = vertAt(5.27)
    expect(west.length).toBeGreaterThan(0)
    expect(east.length).toBeGreaterThan(0)
    for (const w of [...west, ...east]) expect(w.thicknessM).toBeLessThan(0.16)
  })
})
