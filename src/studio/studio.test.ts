import { describe, expect, it } from 'vitest'
import { deriveRooms, roomAt } from '../core'
import type { Unit } from '../core'
import { EXTERIOR_M, PARTITION_M, guessKind, initialState, reducer, studioIssues, type Action, type StudioState } from './model'

const TOL = 0.05
const run = (s: StudioState, ...actions: Action[]) => actions.reduce(reducer, s)
const wallsOf = (u: Unit) => u.walls.map((w) => [w.a, w.b])

/** click (0,0), type 4 m east, 3 m south, 4 m west, click the start corner */
const traceRect = () =>
  run(
    reducer(initialState(), { type: 'set-scale', pxPerM: 100 }),
    { type: 'chain-start', at: { x: 0, y: 0, tolM: TOL } },
    { type: 'chain-typed', lengthM: 4, dirDeg: 0, tolM: TOL },
    { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL },
    { type: 'chain-typed', lengthM: 4, dirDeg: 180, tolM: TOL },
    { type: 'chain-add', at: { x: 0.01, y: 0.01, tolM: TOL } },
  )

describe('studio reducer', () => {
  it('traces a closed 4×3 rectangle from typed lengths', () => {
    const s = traceRect()
    expect(s.unit.vertices).toHaveLength(4)
    expect(s.unit.walls).toHaveLength(4)
    expect(s.chain).toBeNull()
    const v = s.unit.vertices
    expect(v[2]).toMatchObject({ x: 4, y: 3 })
    expect(v[3].x).toBeCloseTo(0)
    expect(v[3].y).toBeCloseTo(3)
    const rooms = deriveRooms(s.unit)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaSqm).toBeCloseTo(12)
    expect(s.history.past).toHaveLength(6) // scale + 5 placements
  })

  it('splits a wall when a vertex lands mid-span and keeps openings in place', () => {
    let s = traceRect()
    const top = s.unit.walls[0]
    s = reducer(s, { type: 'add-opening', wallId: top.id, t: 0.8, kind: 'door' })
    const door = s.unit.walls[0].openings[0]
    expect(door.offsetM).toBeCloseTo(3.2 - door.widthM / 2)

    s = reducer(s, { type: 'chain-start', at: { x: 2, y: 0.02, tolM: TOL } })
    expect(s.unit.walls).toHaveLength(5)
    expect(s.unit.vertices).toHaveLength(5)
    const mid = s.unit.vertices[4]
    expect(mid).toMatchObject({ x: 2, y: 0 })
    const pieces = s.unit.walls.filter((w) => w.a === mid.id || w.b === mid.id)
    expect(pieces).toHaveLength(2)
    expect(pieces.every((w) => w.thicknessM === PARTITION_M)).toBe(true)
    const second = pieces.find((w) => w.a === mid.id)!
    expect(second.openings[0].offsetM).toBeCloseTo(door.offsetM - 2) // same world position
    expect(s.chain?.ids).toEqual([mid.id])

    // a partition from the split point down to the bottom wall ends the chain on a T-junction
    s = reducer(s, { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL })
    expect(s.chain).toBeNull()
    expect(s.unit.walls).toHaveLength(7)
    expect(deriveRooms(s.unit)).toHaveLength(2)
    expect(studioIssues(s.unit, deriveRooms(s.unit)).filter((i) => i.level === 'error')).toHaveLength(0)
  })

  it('refuses to split through an opening', () => {
    let s = traceRect()
    s = reducer(s, { type: 'add-opening', wallId: s.unit.walls[0].id, t: 0.5 })
    const before = s.unit
    s = reducer(s, { type: 'chain-start', at: { x: 2, y: 0, tolM: TOL } })
    expect(s.unit).toBe(before)
    expect(s.toast?.text).toMatch(/opening/i)
  })

  it('undo returns to earlier states one placement at a time; redo restores', () => {
    let s = traceRect()
    const snapshot = s.unit
    s = run(
      s,
      { type: 'chain-start', at: { x: 2, y: 0, tolM: TOL } },
      { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL },
      { type: 'add-opening', wallId: s.unit.walls[1].id, t: 0.5 },
      { type: 'toggle-thickness' },
      { type: 'add-label', label: { name: 'A', kind: 'other', x: 1, y: 1 } },
    )
    s = run(s, { type: 'select', ids: [s.unit.walls[1].id] }, { type: 'toggle-thickness' })
    expect(s.unit.walls[1].thicknessM).toBe(EXTERIOR_M)
    const after = s.unit
    for (let i = 0; i < 5; i++) s = reducer(s, { type: 'undo' })
    expect(s.unit).toEqual(snapshot)
    expect(wallsOf(s.unit)).toEqual(wallsOf(snapshot))
    for (let i = 0; i < 5; i++) s = reducer(s, { type: 'redo' })
    expect(s.unit).toEqual(after)
    // deep undo never leaves a wall pointing at a missing vertex
    for (let i = 0; i < 20; i++) {
      s = reducer(s, { type: 'undo' })
      const ids = new Set(s.unit.vertices.map((v) => v.id))
      expect(s.unit.walls.every((w) => ids.has(w.a) && ids.has(w.b))).toBe(true)
    }
    expect(s.unit.walls).toHaveLength(0)
  })

  it('backspace removes the last chain vertex', () => {
    let s = run(
      reducer(initialState(), { type: 'set-scale', pxPerM: 100 }),
      { type: 'chain-start', at: { x: 0, y: 0, tolM: TOL } },
      { type: 'chain-typed', lengthM: 4, dirDeg: 0, tolM: TOL },
      { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL },
    )
    s = reducer(s, { type: 'chain-back' })
    expect(s.unit.walls).toHaveLength(1)
    expect(s.unit.vertices).toHaveLength(2)
    expect(s.chain?.ids).toHaveLength(2)
  })

  it('clamps openings inside the wall and refuses overlaps', () => {
    let s = traceRect()
    const wall = s.unit.walls[0] // 4 m
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.02 })
    const o1 = s.unit.walls[0].openings[0]
    expect(o1.offsetM).toBe(0)
    expect(o1.kind).toBe('door')
    expect(o1.widthM).toBeCloseTo(0.9144)

    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.1 }) // overlaps o1
    expect(s.unit.walls[0].openings).toHaveLength(1)
    expect(s.toast?.text).toBe('Two openings overlap on this wall')

    s = reducer(s, { type: 'update-opening', id: o1.id, patch: { offsetM: 10 } })
    expect(s.unit.walls[0].openings[0].offsetM).toBeCloseTo(4 - o1.widthM) // clamped to the far end
    s = reducer(s, { type: 'update-opening', id: o1.id, patch: { offsetM: 1 } })

    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.99, kind: 'window' })
    const o2 = s.unit.walls[0].openings[1]
    expect(o2.offsetM).toBeCloseTo(4 - o2.widthM)

    s = reducer(s, { type: 'update-opening', id: o1.id, patch: { offsetM: 3 } }) // onto the window → refused
    expect(s.unit.walls[0].openings[0].offsetM).toBe(1)

    s = reducer(s, { type: 'drag-opening', id: o1.id, offsetM: 2.5 })
    expect(s.dragBlocked).toBe(true)
    expect(s.unit.walls[0].openings[0].offsetM).toBe(1)
    s = reducer(s, { type: 'drag-opening', id: o1.id, offsetM: 0.5 })
    expect(s.dragBlocked).toBe(false)
    expect(s.unit.walls[0].openings[0].offsetM).toBe(0.5)
  })

  it('assigns a label to the enclosed face', () => {
    let s = traceRect()
    s = reducer(s, { type: 'add-label', label: { name: 'Bed-1', kind: guessKind('Bed-1'), x: 2, y: 1.5, printedSize: `13'-1" × 9'-10"` } })
    const rooms = deriveRooms(s.unit)
    expect(rooms[0].name).toBe('Bed-1')
    expect(rooms[0].kind).toBe('bed')
    expect(roomAt({ x: 1, y: 1 }, rooms, s.unit)?.id).toBe(s.unit.roomLabels[0].id)
    expect(studioIssues(s.unit, rooms).map((i) => i.code)).toEqual(['no-entry-door'])
  })

  it('guesses room kinds from names', () => {
    expect(guessKind('H.Toilet')).toBe('bath')
    expect(guessKind('PDR')).toBe('bath')
    expect(guessKind('Walk in Closet')).toBe('closet')
    expect(guessKind('Dining & Family Living')).toBe('dining')
    expect(guessKind('Lift Lobby')).toBe('shaft')
    expect(guessKind('Verandah')).toBe('balcony')
    expect(guessKind('Foyer')).toBe('other')
  })
})
