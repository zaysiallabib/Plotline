/**
 * Walls meet, rooms close (founder 2026-10-09: "pillar or not, a wall touches another wall, that is it, it is a box";
 * "nobody cares about 3 cm"; "why on universe would I need to ever close that wall. it is there, just let it be").
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms, roomAt, validate } from '../core'
import type { Pillar, Unit } from '../core'
import { initialState, reducer, type Action, type StudioState } from './model'
import { leaksAround } from './issues'

const run = (s: StudioState, ...actions: Action[]) => actions.reduce(reducer, s)
const at = (x: number, y: number) => ({ x, y, tolM: 1e-3 })
/** three walls of a 4 × 3 room (top, right, left) — the right one `rightT` thick, ending at y = `rightY` — and columns */
const threeSides = (rightT = 0.127, rightY = 3, pillars: Pillar[] = []): StudioState => {
  const unit: Unit = {
    ...initialState().unit,
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 4, y: 0 }, { id: 'c', x: 4, y: rightY }, { id: 'd', x: 0, y: 3 }],
    walls: [
      { id: 'top', a: 'a', b: 'b', thicknessM: 0.127, heightM: 3, openings: [] },
      { id: 'right', a: 'b', b: 'c', thicknessM: rightT, heightM: 3, openings: [] },
      { id: 'left', a: 'd', b: 'a', thicknessM: 0.127, heightM: 3, openings: [] },
    ],
    roomLabels: [],
    pillars,
    planImage: { src: 'x', pxPerM: 100, originPx: { x: 0, y: 0 } },
  }
  return { ...initialState(), unit, tool: 'wall' }
}
const closed = (s: StudioState) => deriveRooms(s.unit).length === 1
const loose = (s: StudioState) => validate(s.unit).filter((i) => i.code === 'dangling-vertex')

describe('W: an end that stops on or short of a wall / column is joined', () => {
  it('3 cm short of a wall face: carried on to the wall, the room closes, one wall, no loose end', () => {
    const s = run(threeSides(0.3), { type: 'chain-start', at: at(0, 3) }, { type: 'chain-add', at: at(4 - 0.15 - 0.03, 3) })
    expect(closed(s)).toBe(true)
    expect(loose(s)).toEqual([])
    expect(s.unit.walls.filter((w) => w.thicknessM === 0.127 && w.id !== 'top' && w.id !== 'left')).toHaveLength(1) // ONE new wall
  })
  it("8 cm short of a 25 cm wall's face (within its thickness) and at an angle", () => {
    const s = run(threeSides(0.254), { type: 'chain-start', at: at(0, 3) }, { type: 'chain-add', at: at(4 - 0.127 - 0.08, 2.4) })
    expect(closed(s)).toBe(true)
    expect(loose(s).map((i) => i.ids[0])).toEqual(['c']) // only the right wall's own end, below the new junction
  })
  it("on the thick wall's face from the OUTSIDE (a room on the other side)", () => {
    // a second room east of the right wall: its top and right walls, then its bottom drawn west to the right wall's east face
    let s = threeSides(0.3)
    s = run(s, { type: 'chain-start', at: at(0, 3) }, { type: 'chain-add', at: at(3.85, 3) }, { type: 'chain-end' })
    s = run(s, { type: 'chain-start', at: at(4, 0) }, { type: 'chain-add', at: at(7, 0) }, { type: 'chain-add', at: at(7, 3) }, { type: 'chain-add', at: at(4.15, 3) })
    expect(deriveRooms(s.unit)).toHaveLength(2)
    expect(loose(s)).toEqual([])
  })
  it("3 cm short of a column's face: carried on to the face, the room closes round the column", () => {
    const col = { id: 'col', x: 4, y: 3, wM: 0.4, hM: 0.4 }
    const s = run(threeSides(0.127, 2.8, [col]), { type: 'chain-start', at: at(0, 3) }, { type: 'chain-add', at: at(3.77, 3) })
    expect(closed(s)).toBe(true)
    expect(loose(s)).toEqual([])
    const end = s.unit.vertices.find((v) => Math.abs(v.y - 3) < 1e-9 && v.x > 3)!
    expect(end.x).toBeCloseTo(3.8, 9) // on the column's face, not inside it
  })
  it('a wall end far short (0.5 m) is NOT carried on', () => {
    const s = run(threeSides(0.127), { type: 'chain-start', at: at(0, 3) }, { type: 'chain-add', at: at(3.4, 3) })
    expect(closed(s)).toBe(false)
  })
})

describe('R: the closed-room check looks at the room around the click only', () => {
  const unitOf = (s: StudioState, extra: Partial<Unit>) => ({ ...s, unit: { ...s.unit, ...extra } })
  it('an end 3 cm short (left by an old draft): one leak, within reach — healed in one step', () => {
    const s0 = threeSides(0.3)
    const s = unitOf(s0, {
      vertices: [...s0.unit.vertices, { id: 'e', x: 3.82, y: 3 }],
      walls: [...s0.unit.walls, { id: 'bottom', a: 'd', b: 'e', thicknessM: 0.127, heightM: 3, openings: [] }],
    })
    const leaks = leaksAround(s, { x: 2, y: 1.5 })
    expect(leaks.map((l) => [l.id, l.heal])).toEqual([['e', true]])
    expect(leaks[0].gap).toBeCloseTo(0.03 + 0.15, 2) // to the centre line it is carried on to
    const t = leaks[0].fix.actions.reduce(reducer, s)
    expect(roomAt({ x: 2, y: 1.5 }, deriveRooms(t.unit), t.unit)).toBeTruthy()
  })
  it('a loose stub outside the room is never the reason; the real gap (0.6 m) is, and is not healed', () => {
    const s0 = threeSides(0.127)
    const s = unitOf(s0, {
      vertices: [...s0.unit.vertices, { id: 'e', x: 3.4, y: 3 }, { id: 'f', x: -1, y: 1 }, { id: 'g', x: -1.16, y: 1 }],
      walls: [
        ...s0.unit.walls,
        { id: 'bottom', a: 'd', b: 'e', thicknessM: 0.127, heightM: 3, openings: [] },
        { id: 'stub', a: 'g', b: 'f', thicknessM: 0.127, heightM: 3, openings: [] }, // west of the room, ends 16 cm short of nothing
      ],
    })
    const leaks = leaksAround(s, { x: 2, y: 1.5 })
    expect(leaks.map((l) => l.id)).toEqual(['e'])
    expect(leaks[0].heal).toBe(false)
  })
  it('nothing closes it: no leak named (a wall is missing)', () => {
    const s = unitOf(threeSides(0.127), {})
    expect(leaksAround(s, { x: 2, y: 1.5 })).toEqual([])
  })
})
