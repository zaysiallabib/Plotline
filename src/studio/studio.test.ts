import { describe, expect, it } from 'vitest'
import { deriveRooms, roomAt, roomInnerPolygon, validate, wallFrame } from '../core'
import type { Opening, Unit, Wall } from '../core'
import typeA from '../data/units/type-a.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import { EXTERIOR_M, ISSUE_COPY, MERGE_M, PARTITION_M, WALL_HEIGHT_M, entityPoints, guessKind, initialState, isUnit, lengthMoves, normalizeUnit, openSpotsNear, reducer, slug, studioIssues, wallLabelSides, type Action, type Draft, type StudioState } from './model'
import { AI_KEY, drawnSize, openReview, sheetAxis, sizeCheck, studioReducer } from './review'
import { mockTraceResult } from './autotraceMock'
import { AI_KEY_STORAGE } from '../trace/ai'
import { snapMove, snapOpeningOffset, snapPoint } from './snap'
import { fitSheet, frameOf, mToPx, mToScreen, pxToM, screenToM } from './transform'
import type { FurniturePlacement } from '../core'
import { doorClearZones, furnish, quadsOverlap } from '../furnish/presets'
import { GRID_M, layoutFor, movePiece, pieceAt, pieceQuad, resizeAxes } from './furniture'

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

  it('sliding door: its own kind, 6\'-0" × 7\'-0" by default, a door switched to it takes those; H / Shift+H do nothing on it', () => {
    let s = traceRect()
    s = reducer(s, { type: 'add-opening', wallId: s.unit.walls[0].id, t: 0.5, kind: 'slider' })
    const o = s.unit.walls[0].openings[0]
    expect(o).toMatchObject({ kind: 'slider', sillM: 0 })
    expect(o.widthM).toBeCloseTo(6 * 0.3048)
    expect(o.heightM).toBeCloseTo(7 * 0.3048)
    expect(s.lastOpeningKind).toBe('slider')
    expect(reducer(s, { type: 'flip', what: 'hinge' })).toBe(s)
    expect(reducer(s, { type: 'flip', what: 'swing' })).toBe(s)
    s = reducer(s, { type: 'add-opening', wallId: s.unit.walls[2].id, t: 0.5, kind: 'door' })
    const d = s.unit.walls[2].openings[0]
    expect(reducer(s, { type: 'flip', what: 'hinge' }).unit.walls[2].openings[0].hinge).toBe('b') // a door still flips
    s = reducer(s, { type: 'update-opening', id: d.id, patch: { kind: 'slider' } })
    expect(s.unit.walls[2].openings[0].kind).toBe('slider')
    expect(s.unit.walls[2].openings[0].widthM).toBeCloseTo(6 * 0.3048)
  })

  it('opening edge snap: nearer edge flush to a wall end or a neighbour, else centred', () => {
    const door: Opening = { id: 'd', kind: 'door', offsetM: 2, widthM: 0.9, heightM: 2.1, sillM: 0 }
    const wall: Wall = { id: 'w', a: 'a', b: 'b', thicknessM: PARTITION_M, heightM: 3, openings: [door] }
    const at = (uM: number, tolM: number, ex?: string) => snapOpeningOffset(wall, 4, uM, 0.9, tolM, ex)
    const expectSnap = (r: ReturnType<typeof at>, offsetM: number, snapped: string | null) => {
      expect(r.snapped).toBe(snapped)
      expect(r.offsetM).toBeCloseTo(offsetM, 9)
    }
    expectSnap(at(0.6, 0.2), 0, 'corner') // centred would start at 0.15
    expectSnap(at(3.5, 0.2), 3.1, 'corner') // 0.05 from the far end beats 0.15 from the door
    expectSnap(at(3.4, 0.2), 2.9, 'door') // 0.05 from the door's jamb beats 0.15 from the far end
    expectSnap(at(1.4, 0.2), 1.1, 'door') // flush against the door's other side
    expectSnap(at(1.2, 0.1), 0.75, null) // nothing within tolerance: centred on the cursor
    expectSnap(at(-1, 0), 0, 'corner') // past the wall end: clamped, which is flush
    expectSnap(at(1.45, 0.2, 'd'), 1.0, null) // a dragged opening ignores its own edges
  })

  it('add-opening and drag-opening use the edge snap', () => {
    let s = traceRect()
    const wall = s.unit.walls[0] // (0,0) → (4,0)
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.6 / 4, tolM: 0.2 })
    const door = s.unit.walls[0].openings[0]
    expect(door.offsetM).toBe(0) // corner
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 1.6 / 4, kind: 'window', tolM: 0.2 })
    const win = s.unit.walls[0].openings[1]
    expect(win.offsetM).toBeCloseTo(door.widthM, 9) // next to the door
    s = run(s, { type: 'drag-begin' }, { type: 'drag-opening', id: win.id, offsetM: 2, tolM: 0.2 })
    expect(s.unit.walls[0].openings[1].offsetM).toBeCloseTo(2, 9) // centred on the cursor
    s = reducer(s, { type: 'drag-opening', id: win.id, offsetM: 0.95, tolM: 0.2 })
    expect(s.unit.walls[0].openings[1].offsetM).toBeCloseTo(door.widthM, 9)
    s = reducer(s, { type: 'drag-opening', id: win.id, offsetM: 2.7, tolM: 0.2 })
    expect(s.unit.walls[0].openings[1].offsetM).toBeCloseTo(4 - win.widthM, 9) // far corner
    expect(s.dragBlocked).toBe(false)
  })

  it('O tool pick: kind + width chosen before the click, remembered; keys 1–4 = the kind at its default (bath door 2\'-6")', () => {
    const FOOT = 0.3048
    let s = traceRect()
    const [top, right, bottom] = s.unit.walls // 4 m, 3 m, 4 m
    s = reducer(s, { type: 'pick-opening', kind: 'window', widthM: 6 * FOOT })
    expect(s.history.past).toHaveLength(traceRect().history.past.length) // a pick is no edit
    s = reducer(s, { type: 'add-opening', wallId: top.id, t: 0.5 }) // one click: the picked window
    expect(s.unit.walls[0].openings[0]).toMatchObject({ kind: 'window', sillM: 3 * FOOT })
    expect(s.unit.walls[0].openings[0].widthM).toBeCloseTo(6 * FOOT)
    s = reducer(s, { type: 'add-opening', wallId: right.id, t: 0.5 }) // still the pick
    expect(s.unit.walls[1].openings[0].widthM).toBeCloseTo(6 * FOOT)
    // explicit kind + width win; an explicit kind alone is that kind's default, not the picked window width
    s = reducer(s, { type: 'add-opening', wallId: bottom.id, t: 0.2, kind: 'slider', widthM: 8 * FOOT })
    expect(s.unit.walls[2].openings[0]).toMatchObject({ kind: 'slider' })
    expect(s.unit.walls[2].openings[0].widthM).toBeCloseTo(8 * FOOT)
    expect(s.lastOpeningKind).toBe('slider')
    s = reducer(s, { type: 'add-opening', wallId: bottom.id, t: 0.85, kind: 'door' })
    expect(s.unit.walls[2].openings[1].widthM).toBeCloseTo(3 * FOOT)
    // editing a placed opening never changes the pick
    s = reducer(s, { type: 'pick-opening', kind: 'door', widthM: 2.5 * FOOT })
    s = reducer(s, { type: 'update-opening', id: s.unit.walls[2].openings[1].id, patch: { kind: 'window' } })
    expect(s).toMatchObject({ lastOpeningKind: 'door', lastOpeningWidthM: 2.5 * FOOT })
    // too narrow → the 0.3 m minimum
    expect(reducer(s, { type: 'pick-opening', kind: 'passage', widthM: 0.1 }).lastOpeningWidthM).toBe(0.3)

    // a bath wall: key 1 (door, default width) → 2'-6"; a picked 3'-0" door overrides the bath rule
    let b = reducer(traceRect(), { type: 'add-label', label: { name: 'Bath', kind: 'bath', x: 2, y: 1.5 } })
    const wallId = b.unit.walls[0].id
    b = reducer(b, { type: 'pick-opening', kind: 'door' })
    expect(reducer(b, { type: 'add-opening', wallId, t: 0.5 }).unit.walls[0].openings[0].widthM).toBeCloseTo(2.5 * FOOT)
    b = reducer(b, { type: 'pick-opening', kind: 'door', widthM: 3 * FOOT })
    expect(reducer(b, { type: 'add-opening', wallId, t: 0.5 }).unit.walls[0].openings[0].widthM).toBeCloseTo(3 * FOOT)
  })

  it('resize-opening: the dragged end moves, the far end stays; edge snap, 0.3 m minimum, refused over a sibling or past the wall', () => {
    let s = traceRect()
    const wall = s.unit.walls[0] // (0,0) → (4,0)
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.5, kind: 'door', widthM: 1 }) // 1.5 – 2.5
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.875, kind: 'window', widthM: 0.5 }) // 3.25 – 3.75
    const [door, win] = s.unit.walls[0].openings
    const past = s.history.past.length
    const span = () => {
      const o = s.unit.walls[0].openings[0]
      return [o.offsetM, o.offsetM + o.widthM]
    }
    s = run(s, { type: 'drag-begin' }, { type: 'resize-opening', id: door.id, end: 'b', uM: 2.8 })
    expect(span()[0]).toBe(1.5)
    expect(span()[1]).toBeCloseTo(2.8, 9)
    s = reducer(s, { type: 'resize-opening', id: door.id, end: 'b', uM: 3.2, tolM: 0.1 }) // flush to the window
    expect(span()[1]).toBeCloseTo(3.25, 9)
    expect(s.dragBlocked).toBe(false)
    s = reducer(s, { type: 'resize-opening', id: door.id, end: 'b', uM: 3.5 }) // into the window: refused, stays
    expect(s.dragBlocked).toBe(true)
    expect(span()[1]).toBeCloseTo(3.25, 9)
    s = reducer(s, { type: 'resize-opening', id: door.id, end: 'a', uM: 0.04, tolM: 0.1 }) // end a to the corner, b stays
    expect(span()[0]).toBe(0)
    expect(span()[1]).toBeCloseTo(3.25, 9)
    s = reducer(s, { type: 'resize-opening', id: door.id, end: 'a', uM: 3.9 }) // past the far end: the minimum
    expect(span()[0]).toBeCloseTo(3.25 - 0.3, 9)
    expect(span()[1]).toBeCloseTo(3.25, 9)
    expect(s.history.past).toHaveLength(past + 1) // the whole drag = one undo entry (drag-begin)
    expect(reducer(s, { type: 'undo' }).unit.walls[0].openings[0]).toEqual(door)
    // a 0.2 m window 0.2 m from the wall end: no room for the 0.3 m minimum → refused, its far end never moves
    s = reducer(s, { type: 'update-opening', id: win.id, patch: { offsetM: 3.8, widthM: 0.2 } })
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'b', uM: 3.85 })
    expect(s.dragBlocked).toBe(true)
    expect(s.unit.walls[0].openings[1]).toMatchObject({ offsetM: 3.8, widthM: 0.2 })
  })

  it('resize-opening top / sill (the 3D dots): the head or the sill moves, the other stays; whole inches, floor to wall top, 0.3 m minimum, one undo', () => {
    let s = traceRect()
    const wall = s.unit.walls[0]
    s = reducer(s, { type: 'add-opening', wallId: wall.id, t: 0.5, kind: 'window', widthM: 1 })
    const win = s.unit.walls[0].openings[0] // sill 3', height 4'
    const past = s.history.past.length
    const o = () => s.unit.walls[0].openings[0]
    s = run(s, { type: 'drag-begin' }, { type: 'resize-opening', id: win.id, end: 'top', uM: 2.5 })
    expect(o().sillM).toBe(win.sillM)
    expect(o().sillM + o().heightM).toBeCloseTo(Math.round(2.5 / 0.0254) * 0.0254, 9) // the head, to the inch
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'top', uM: 99 }) // past the wall top: stops there
    expect(o().sillM + o().heightM).toBeCloseTo(wall.heightM, 9)
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'top', uM: 0 }) // below the sill: the minimum
    expect(o().heightM).toBeCloseTo(0.3, 9)
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'top', uM: 2.1336 }) // 7'
    const top = o().sillM + o().heightM
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'sill', uM: 0.3048 }) // sill down to 1': the head stays
    expect(o().sillM).toBeCloseTo(0.3048, 9)
    expect(o().sillM + o().heightM).toBeCloseTo(top, 9)
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'sill', uM: -1 }) // under the floor: the floor
    expect(o().sillM).toBe(0)
    s = reducer(s, { type: 'resize-opening', id: win.id, end: 'sill', uM: 99 }) // over the head: the minimum
    expect(o().heightM).toBeCloseTo(0.3, 9)
    expect(o().sillM + o().heightM).toBeCloseTo(top, 9)
    expect([o().offsetM, o().widthM]).toEqual([win.offsetM, win.widthM]) // never its place along the wall
    expect(s.dragBlocked).toBe(false)
    expect(s.history.past).toHaveLength(past + 1)
    expect(reducer(s, { type: 'undo' }).unit.walls[0].openings[0]).toEqual(win)
  })

  it('nudge moves the selection 1" (Shift 1\') without snapping, one history entry per press', () => {
    const IN = 0.0254
    const FOOT = 0.3048
    let s = traceRect()
    const [v0, v1, v2] = s.unit.vertices
    let past = s.history.past.length
    const nudge = (dx: number, dy: number) => {
      s = reducer(s, { type: 'nudge', dx, dy })
      expect(s.history.past.length).toBe(++past)
    }
    const vx = (id: string) => s.unit.vertices.find((v) => v.id === id)!

    s = reducer(s, { type: 'select', ids: [v1.id] }) // corner (4,0)
    nudge(IN, 0)
    expect(vx(v1.id)).toMatchObject({ x: 4 + IN, y: 0 })
    nudge(0, FOOT)
    expect(vx(v1.id).y).toBeCloseTo(FOOT, 12)
    expect(vx(v0.id)).toMatchObject({ x: 0, y: 0 })
    nudge(-IN, -FOOT) // back
    expect(vx(v1.id).x).toBeCloseTo(4, 12)
    expect(vx(v1.id).y).toBeCloseTo(0, 12)

    s = reducer(s, { type: 'select', ids: [s.unit.walls[1].id] }) // (4,0)→(4,3): both ends move
    nudge(IN, 0)
    expect(vx(v1.id).x).toBeCloseTo(4 + IN, 12)
    expect(vx(v2.id).x).toBeCloseTo(4 + IN, 12)
    expect(vx(v0.id)).toMatchObject({ x: 0, y: 0 })

    s = reducer(s, { type: 'add-label', label: { name: 'Bed-1', kind: 'bed', x: 2, y: 1.5 } }) // selects it
    past = s.history.past.length
    nudge(-IN, 0)
    expect(s.unit.roomLabels[0].x).toBeCloseTo(2 - IN, 12)
    expect(s.unit.roomLabels[0].y).toBe(1.5)

    s = reducer(s, { type: 'add-opening', wallId: s.unit.walls[0].id, t: 0.5 }) // door centred, selected
    past = s.history.past.length
    const door = s.unit.walls[0].openings[0]
    nudge(IN, 0) // Right = +offsetM
    expect(s.unit.walls[0].openings[0].offsetM).toBeCloseTo(door.offsetM + IN, 12)
    nudge(0, -FOOT) // Shift+Up = −1'
    expect(s.unit.walls[0].openings[0].offsetM).toBeCloseTo(door.offsetM + IN - FOOT, 12)

    // a window flush against the door's right jamb: nudging the door right is refused with a toast
    const selected = s.selection
    const d = s.unit.walls[0].openings[0]
    const top = s.unit.walls[0]
    const t = (d.offsetM + d.widthM + 0.6096 + 0.05) / wallFrame(top, s.unit.vertices).lengthM // window centre 5 cm past flush
    s = reducer(s, { type: 'add-opening', wallId: top.id, t, kind: 'window', tolM: 0.2 })
    expect(s.unit.walls[0].openings[1].offsetM).toBeCloseTo(d.offsetM + d.widthM, 9)
    s = reducer(s, { type: 'select', ids: selected })
    const before = s.unit
    s = reducer(s, { type: 'nudge', dx: IN, dy: 0 })
    expect(s.unit).toBe(before)
    expect(s.toast?.text).toBe('Two openings overlap on this wall')

    // nothing selected: no-op, no history
    s = reducer(s, { type: 'select', ids: [] })
    expect(reducer(s, { type: 'nudge', dx: IN, dy: 0 })).toBe(s)
  })

  it('the first closed loop shows the move tip, once per session', () => {
    let s = traceRect()
    expect(s.toast?.text).toBe('Drag any corner with V to adjust it')
    expect(s.loopTipShown).toBe(true)
    s = run(
      s,
      { type: 'clear-toast' },
      { type: 'chain-start', at: { x: 6, y: 0, tolM: TOL } },
      { type: 'chain-typed', lengthM: 2, dirDeg: 0, tolM: TOL },
      { type: 'chain-typed', lengthM: 2, dirDeg: 90, tolM: TOL },
      { type: 'chain-add', at: { x: 6, y: 0, tolM: TOL } },
    )
    expect(s.chain).toBeNull()
    expect(deriveRooms(s.unit)).toHaveLength(2)
    expect(s.toast).toBeNull()
  })

  it('a lone corner reads "click to find it"', () => {
    expect(ISSUE_COPY['dangling-vertex']).toBe('Corner is not joined to anything — click to find it')
    const s = run(
      reducer(initialState(), { type: 'set-scale', pxPerM: 100 }),
      { type: 'chain-start', at: { x: 1, y: 1, tolM: TOL } },
      { type: 'chain-end' },
    )
    const i = studioIssues(s.unit, []).find((x) => x.code === 'dangling-vertex')!
    expect(i.message).toBe('Corner is not joined to anything — click to find it')
    expect(i.ids).toEqual([s.unit.vertices[0].id])
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

  it('restores a draft that is only { unit } (no planImage / view / timer)', () => {
    expect(isUnit(typeA)).toBe(true)
    const s = reducer(initialState(), { type: 'restore', draft: { unit: typeA as unknown as Unit } as Draft })
    expect(s.unit.walls).toHaveLength(90)
    expect(s.unit.vertices).toHaveLength(64)
    expect(s.unit.name).toBe('Type A · 2703 sft')
    expect(s.unit.planImage).toEqual({ src: '/assets/plan-2nd-floor.webp', pxPerM: 74, originPx: { x: 246, y: 806 } })
    expect(s.planImage).toBeNull()
    expect(s.view).toEqual({ panX: 0, panY: 0, zoom: 1 })
    expect(s.timer.started).toBe(false)
    // the clock starts on the first input of any kind (an auto-traced draft never used the Scale tool) and then counts
    const t = reducer(reducer(s, { type: 'timer-input', now: 1000 }), { type: 'timer-tick', now: 2000, hidden: false })
    expect(t.timer.started).toBe(true)
    expect(t.timer.elapsedMs).toBe(1000)
    expect(deriveRooms(s.unit)).toHaveLength(27)
    expect(validate(s.unit).filter((i) => i.level === 'error')).toHaveLength(0)
    expect(studioIssues(s.unit, deriveRooms(s.unit))).toEqual([]) // entry door opens off the traced lift lobby
    // a bare unit also survives load-unit (Import)
    expect(reducer(initialState(), { type: 'load-unit', unit: typeA as unknown as Unit }).unit.walls).toHaveLength(90)
  })

  it('isUnit rejects JSON that would crash deriveRooms; normalizeUnit fills gaps', () => {
    expect(isUnit(null)).toBe(false)
    expect(isUnit('{}')).toBe(false)
    expect(isUnit({ name: 'x', vertices: [], walls: [] })).toBe(true)
    expect(isUnit({ name: 'x', vertices: [{ id: 'a', x: 0 }], walls: [] })).toBe(false) // vertex without y
    expect(isUnit({ name: 'x', vertices: [{ id: 'a', x: 0, y: 0 }], walls: [{ id: 'w', a: 'a', b: 'zzz' }] })).toBe(false) // missing vertex
    expect(isUnit({ name: 'x', vertices: [], walls: [], roomLabels: [{ id: 'l', name: 'r' }] })).toBe(false) // label without x/y
    // columns (auto-trace, optional): kept through normalizeUnit, a broken one rejects
    expect(isUnit({ name: 'x', vertices: [], walls: [], pillars: [{ id: 'p', x: 1, y: 1, wM: 0.4, hM: 1 }] })).toBe(true)
    expect(isUnit({ name: 'x', vertices: [], walls: [], pillars: [{ id: 'p', x: 1, y: 1 }] })).toBe(false)
    expect(normalizeUnit({ ...(JSON.parse('{"name":"x","vertices":[],"walls":[]}') as Unit), pillars: [{ id: 'p', x: 1, y: 1, wM: 0.4, hM: 1 }] }).pillars?.length).toBe(1)
    const raw = {
      name: 'x',
      vertices: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 3, y: 0 },
      ],
      walls: [{ id: 'w', a: 'a', b: 'b' }],
      planImage: { src: 'img.webp' }, // no pxPerM → unusable → dropped
    }
    expect(isUnit(raw)).toBe(true)
    const u = normalizeUnit(raw as unknown as Unit)
    expect(u.walls[0]).toMatchObject({ thicknessM: PARTITION_M, openings: [] })
    expect(u.planImage).toBeUndefined()
    expect(u.roomLabels).toEqual([])
    expect(() => deriveRooms(u)).not.toThrow()
    expect(() => validate(u)).not.toThrow()
  })

  it('normalizeUnit: an old export\'s hingeless door of 1.2–1.5 m (it rendered as a slider) becomes a slider; a double door (≥ 1.5 m) stays a door; nothing else changes', () => {
    const op = (id: string, widthM: number, hinge?: 'a') => ({ id, kind: 'door' as const, offsetM: 0, widthM, heightM: 2.1, sillM: 0, ...(hinge ? { hinge } : {}) })
    const raw = {
      name: 'x',
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 9, y: 0 }],
      walls: [{ id: 'w', a: 'a', b: 'b', openings: [op('wide', 1.3), op('double', 1.5), op('hinged', 1.3, 'a'), op('narrow', 0.9), { ...op('win', 1.5), kind: 'window' }] }],
    }
    expect(normalizeUnit(raw as unknown as Unit).walls[0].openings.map((o) => o.kind)).toEqual(['slider', 'door', 'door', 'door', 'window'])
  })

  it('no shipped unit JSON still has a hingeless door ≥ 1.2 m: every sliding door says kind "slider"', () => {
    const units = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
    expect(Object.keys(units).length).toBeGreaterThanOrEqual(5)
    for (const [path, u] of Object.entries(units)) {
      const guessed = u.walls.flatMap((w) => w.openings).filter((o) => o.kind === 'door' && !o.hinge && o.widthM >= 1.2)
      expect(guessed.map((o) => o.id), path).toEqual([])
      expect(normalizeUnit(u).walls, path).toEqual(u.walls) // an import of it migrates nothing
    }
  })

  it('re-setting the scale keeps originPx; transforms round-trip through originPx', () => {
    const s0 = reducer(initialState(), { type: 'restore', draft: { unit: typeA as unknown as Unit } as Draft })
    const s1 = reducer(s0, { type: 'set-scale', pxPerM: 80 })
    expect(s1.unit.planImage).toMatchObject({ pxPerM: 80, originPx: { x: 246, y: 806 } })
    expect(reducer(initialState(), { type: 'set-scale', pxPerM: 80 }).unit.planImage?.originPx).toEqual({ x: 0, y: 0 })

    const f = frameOf({ panX: 33, panY: -17, zoom: 0.4 }, s1.unit.planImage)
    expect(mToPx(f, { x: 0, y: 0 })).toEqual({ x: 246, y: 806 }) // metre origin sits on the image's originPx
    expect(mToPx(f, { x: 1, y: 2 })).toEqual({ x: 326, y: 966 })
    for (const m of [{ x: 0, y: 0 }, { x: 6.515, y: 1.308 }, { x: -3.2, y: 12.75 }]) {
      const back = screenToM(f, mToScreen(f, m))
      expect(back.x).toBeCloseTo(m.x, 9)
      expect(back.y).toBeCloseTo(m.y, 9)
      const px = mToPx(f, m)
      expect(pxToM(f, px).x).toBeCloseTo(m.x, 9)
      expect(pxToM(f, px).y).toBeCloseTo(m.y, 9)
    }
    // no scale yet: 100 px/m, origin (0,0)
    const g = frameOf({ panX: 0, panY: 0, zoom: 2 }, undefined)
    expect(mToScreen(g, { x: 1, y: 1 })).toEqual({ x: 200, y: 200 })
  })

  it('wall length labels sit outside the loop; open-chain walls get none', () => {
    let s = traceRect()
    s = reducer(s, { type: 'add-label', label: { name: 'Bed-1', kind: 'bed', x: 2, y: 1.5 } })
    const rooms = deriveRooms(s.unit)
    const sides = wallLabelSides(s.unit, rooms)
    expect(sides.size).toBe(4)
    for (const w of s.unit.walls) {
      const f = wallFrame(w, s.unit.vertices)
      const side = sides.get(w.id)!
      const probe = { x: f.origin.x + (f.dir.x * f.lengthM) / 2 + f.normal.x * side * 0.3, y: f.origin.y + (f.dir.y * f.lengthM) / 2 + f.normal.y * side * 0.3 }
      expect(roomAt(probe, rooms, s.unit), w.id).toBeNull()
    }
    // a partition splitting the room: both sides have rooms → label goes toward the farther centroid, still a side
    s = run(s, { type: 'chain-start', at: { x: 2, y: 0, tolM: TOL } }, { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL })
    const rooms2 = deriveRooms(s.unit)
    expect(rooms2).toHaveLength(2)
    expect(wallLabelSides(s.unit, rooms2).size).toBe(s.unit.walls.length)
    // an unclosed chain wall has no label side
    s = run(s, { type: 'chain-start', at: { x: 6, y: 6, tolM: TOL } }, { type: 'chain-typed', lengthM: 2, dirDeg: 0, tolM: TOL })
    const open = s.unit.walls[s.unit.walls.length - 1]
    expect(wallLabelSides(s.unit, deriveRooms(s.unit)).has(open.id)).toBe(false)
  })

  it('export name: empty unit name → "Untitled unit" → untitled-unit.plotline.json', () => {
    expect(slug('Untitled unit')).toBe('untitled-unit')
    expect(slug('Type A · 2703 sft')).toBe('type-a-2703-sft')
    expect(slug('')).toBe('unit')
  })

  it('guesses room kinds from names', () => {
    expect(guessKind('H.Toilet')).toBe('bath')
    expect(guessKind('PDR')).toBe('bath')
    expect(guessKind('Walk in Closet')).toBe('closet')
    expect(guessKind('Dining & Family Living')).toBe('dining')
    expect(guessKind('Lift Lobby')).toBe('other')
    expect(guessKind('Stair')).toBe('other')
    expect(guessKind('E-Shaft')).toBe('shaft')
    expect(guessKind('Verandah')).toBe('balcony')
    expect(guessKind('Foyer')).toBe('other')
  })
})

describe('corners merge when moved onto each other', () => {
  const TOL = 0.1
  const rect = () =>
    run(
      reducer(initialState(), { type: 'set-scale', pxPerM: 100 }),
      { type: 'chain-start', at: { x: 0, y: 0, tolM: TOL } },
      { type: 'chain-typed', lengthM: 4, dirDeg: 0, tolM: TOL },
      { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL },
      { type: 'chain-typed', lengthM: 4, dirDeg: 180, tolM: TOL },
      { type: 'chain-add', at: { x: 0.01, y: 0.01, tolM: TOL } },
    )
  const kinds = (s: StudioState) => studioIssues(s.unit, deriveRooms(s.unit)).map((i) => i.code)

  it('a corner dragged onto its neighbour becomes that corner: no zero-length wall, no stray corner', () => {
    let s = rect()
    const [v0, v1, v2] = s.unit.vertices
    s = reducer(s, { type: 'add-opening', wallId: s.unit.walls[0].id, t: 0.5 }) // door on (0,0)→(4,0)
    s = reducer(s, { type: 'select', ids: [v1.id] })
    s = reducer(s, { type: 'drag-begin' })
    s = reducer(s, { type: 'drag', vertices: [{ id: v1.id, x: v2.x, y: v2.y }] })
    // mid-drag the collapsed wall exists and both issues show — exactly the founder's screen
    expect(kinds(s)).toEqual(expect.arrayContaining(['zero-length-wall']))
    s = reducer(s, { type: 'drag-end', ids: [v1.id] })
    expect(s.unit.vertices).toHaveLength(3)
    expect(s.unit.vertices.find((v) => v.id === v1.id)).toBeUndefined()
    expect(s.unit.walls).toHaveLength(3)
    expect(s.unit.walls.every((w) => w.a !== w.b)).toBe(true)
    const rewired = s.unit.walls.find((w) => [w.a, w.b].includes(v0.id) && [w.a, w.b].includes(v2.id))!
    expect(rewired.openings).toHaveLength(1) // the door followed its wall
    expect(s.selection).toEqual([v2.id])
    expect(kinds(s)).not.toEqual(expect.arrayContaining(['zero-length-wall', 'dangling-vertex']))
    expect(deriveRooms(s.unit)).toHaveLength(1) // the triangle still closes
  })

  it('nudging a corner onto another merges them too; a corner nudged near but not onto stays', () => {
    let s = rect()
    const [, v1, v2] = s.unit.vertices
    s = reducer(s, { type: 'select', ids: [v1.id] })
    s = reducer(s, { type: 'nudge', dx: 0, dy: 3 - MERGE_M * 2 })
    expect(s.unit.vertices).toHaveLength(4)
    s = reducer(s, { type: 'nudge', dx: 0, dy: MERGE_M * 2 })
    expect(s.unit.vertices).toHaveLength(3)
    expect(s.unit.walls).toHaveLength(3)
    expect(s.selection).toEqual([v2.id])
    s = reducer(s, { type: 'undo' })
    expect(s.unit.vertices).toHaveLength(4)
  })
})

describe('wall length keeps neighbours straight; detach, re-join, delete', () => {
  /** a closed polygon from points, then optional extra chains [from, to] (T partitions); tol 0.05 */
  const poly = (pts: [number, number][], ...chains: [number, number][][]) => {
    let s = reducer(initialState(), { type: 'set-scale', pxPerM: 100 })
    for (const c of [[...pts, pts[0]], ...chains]) {
      s = reducer(s, { type: 'chain-start', at: { x: c[0][0], y: c[0][1], tolM: TOL } })
      for (const [x, y] of c.slice(1)) s = reducer(s, { type: 'chain-add', at: { x, y, tolM: TOL } })
      s = reducer(s, { type: 'chain-end' })
    }
    return s
  }
  const at = (s: StudioState, x: number, y: number) => s.unit.vertices.find((v) => Math.hypot(v.x - x, v.y - y) < 1e-6)
  const wallAt = (s: StudioState, p: [number, number], q: [number, number]) => {
    const a = at(s, ...p)!.id
    const b = at(s, ...q)!.id
    return s.unit.walls.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a))!
  }
  const setLen = (s: StudioState, w: Wall, lengthM: number) => reducer(s, { type: 'set-wall-length', id: w.id, lengthM })
  const issues = (s: StudioState) => studioIssues(s.unit, deriveRooms(s.unit)).map((i) => `${i.level}:${i.code}`)

  it('rectangle: shortening a side slides the far wall with it, one undo entry', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const right = wallAt(s, [4, 0], [4, 3]) // traced 4,0 → 4,3: b = (4,3)
    const past = s.history.past.length
    s = setLen(s, right, 2.5)
    expect(s.history.past.length).toBe(past + 1)
    expect(at(s, 4, 2.5)).toBeDefined()
    expect(at(s, 0, 2.5)).toBeDefined() // the bottom wall shifted up, not tilted
    expect(at(s, 0, 0)).toBeDefined()
    expect(deriveRooms(s.unit)[0].areaSqm).toBeCloseTo(10)
    s = reducer(s, { type: 'undo' })
    expect(at(s, 0, 3)).toBeDefined()
  })

  it('L: the neighbour at the moved end shifts, the wall beyond it stretches', () => {
    let s = poly([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]])
    s = setLen(s, wallAt(s, [4, 0], [4, 2]), 1.5)
    expect(at(s, 4, 1.5)).toBeDefined()
    expect(at(s, 2, 1.5)).toBeDefined() // (4,2)→(2,2) moved rigidly
    expect(at(s, 2, 4)).toBeDefined() // (2,2)→(2,4) stretched, still vertical
    expect(deriveRooms(s.unit)[0].areaSqm).toBeCloseTo(4 * 1.5 + 2 * 2.5)
  })

  it('T: a long wall split at a T-junction moves as one straight run; the partition stretches', () => {
    // 4×3 box, partition from (2,0) down to (2,3): top and bottom walls are split at x = 2
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 0], [2, 3]])
    expect(deriveRooms(s.unit)).toHaveLength(2)
    s = setLen(s, wallAt(s, [4, 0], [4, 3]), 2.5)
    for (const p of [[4, 2.5], [2, 2.5], [0, 2.5], [2, 0], [0, 0]] as [number, number][]) expect(at(s, ...p)).toBeDefined()
    expect(deriveRooms(s.unit).map((r) => r.areaSqm.toFixed(2))).toEqual(['5.00', '5.00'])
    // the partition's own end sits on the bottom wall: shortening it pulls the whole bottom wall, never kinks it
    s = setLen(s, wallAt(s, [2, 0], [2, 2.5]), 2)
    for (const p of [[4, 2], [2, 2], [0, 2]] as [number, number][]) expect(at(s, ...p)).toBeDefined()
    expect(deriveRooms(s.unit).map((r) => r.areaSqm.toFixed(2))).toEqual(['4.00', '4.00'])
    expect(issues(s).filter((c) => c.startsWith('error') || c.includes('dangling'))).toEqual([])
  })

  it('openings keep their offset and clamp inside a shortened wall', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const top = wallAt(s, [0, 0], [4, 0])
    s = reducer(s, { type: 'add-opening', wallId: top.id, t: 0.8, kind: 'window' }) // 1.22 m wide, centred at 3.2
    const o = s.unit.walls.find((w) => w.id === top.id)!.openings[0]
    s = setLen(s, s.unit.walls.find((w) => w.id === top.id)!, 3.5)
    const o2 = s.unit.walls.find((w) => w.id === top.id)!.openings[0]
    expect(o2.offsetM).toBeCloseTo(Math.min(o.offsetM, 3.5 - o.widthM))
    expect(issues(s).some((c) => c.includes('opening'))).toBe(false)
  })

  it('detach a partition end from a T, drag it, re-join it on the corner (merge) or on a wall (T-split)', () => {
    const base = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 0], [2, 3]])
    const part = wallAt(base, [2, 0], [2, 3])
    const t = at(base, 2, 3)!
    const detached = (to: [number, number]) => {
      let s = reducer(base, { type: 'drag-begin' })
      s = reducer(s, { type: 'detach', wallId: part.id, vertexId: t.id, newId: 'loose' })
      expect(s.unit.walls.find((w) => w.id === part.id)).toMatchObject({ b: 'loose' })
      expect(s.unit.vertices.find((v) => v.id === t.id)).toBeDefined() // the other walls keep the corner
      s = reducer(s, { type: 'drag', vertices: [{ id: 'loose', x: to[0], y: to[1] }] })
      return reducer(s, { type: 'drag-end', ids: ['loose'] })
    }
    // left free: the partition is 2.5 m, its end is loose (a dangling-end warning), one room
    let s = detached([2, 2.5])
    expect(wallFrame(s.unit.walls.find((w) => w.id === part.id)!, s.unit.vertices).lengthM).toBeCloseTo(2.5)
    expect(issues(s)).toContain('warning:dangling-vertex')
    expect(deriveRooms(s.unit)).toHaveLength(1)
    s = reducer(s, { type: 'undo' }) // the whole gesture is one entry
    expect(s.unit).toBe(base.unit)
    // dropped back on its corner: merged, the T is whole again
    s = detached([2, 3])
    expect(s.unit.vertices).toHaveLength(base.unit.vertices.length)
    expect(s.unit.walls.find((w) => w.id === part.id)).toMatchObject({ b: t.id })
    expect(deriveRooms(s.unit)).toHaveLength(2)
    // dropped on the bottom wall at x = 1: that wall splits there, two rooms, no crossing, no loose end
    s = detached([1, 3])
    expect(s.unit.walls.find((w) => w.id === part.id)).toMatchObject({ b: 'loose' })
    expect(s.unit.walls.filter((w) => w.a === 'loose' || w.b === 'loose')).toHaveLength(3)
    expect(deriveRooms(s.unit)).toHaveLength(2)
    expect(issues(s).filter((c) => c.startsWith('error') || c.includes('dangling'))).toEqual([])
  })

  it('extend a wall end alone out of an L corner (the drafted toilet): detach, slide along the axis, T-split the wall it reaches', () => {
    // 4×3 box; an unfinished partition (2,3)→(2,1.5)→(3,1.5) — its end at (3,1.5) stops short of the right wall (x = 4)
    const base = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 3], [2, 1.5], [3, 1.5]])
    const stub = wallAt(base, [2, 1.5], [3, 1.5])
    const corner = at(base, 2, 1.5)! // shared with the vertical piece: the end the founder pulls
    let s = reducer(base, { type: 'drag-begin' })
    s = reducer(s, { type: 'detach', wallId: stub.id, vertexId: corner.id, newId: 'end' })
    expect(s.unit.walls.find((w) => w.id === stub.id)).toMatchObject({ a: 'end' })
    expect(wallAt(s, [2, 3], [2, 1.5])).toBeDefined() // the vertical piece keeps its corner
    // the loose end slides along the stub's own line only (lengthMoves on a degree-1 end moves just it)
    const moves = lengthMoves(s.unit, stub.id, 'end', 3) // anchor (3,1.5), the end goes to x = 0
    expect(moves).toEqual([{ id: 'end', x: 0, y: 1.5 }])
    s = reducer(s, { type: 'drag', vertices: lengthMoves(s.unit, stub.id, 'end', 1) })
    s = reducer(s, { type: 'drag-end', ids: ['end'] })
    expect(at(s, 2, 1.5)).toBeDefined() // the old corner is still there, and (2,1.5)…(3,1.5) still open: no rooms yet
    // the dangling end (3,1.5) needs no detach (degree 1: the reducer ignores it); pulled onto the right wall at
    // (4,1.5) that wall splits there, two rooms, nothing dangling
    const loose = at(base, 3, 1.5)!.id
    s = reducer(base, { type: 'drag-begin' })
    expect(reducer(s, { type: 'detach', wallId: stub.id, vertexId: loose, newId: 'end' })).toBe(s)
    s = reducer(s, { type: 'drag', vertices: lengthMoves(s.unit, stub.id, loose, 2) })
    s = reducer(s, { type: 'drag-end', ids: [loose] })
    expect(at(s, 4, 1.5)).toBeDefined()
    expect(s.unit.walls.filter((w) => w.a === loose || w.b === loose)).toHaveLength(3)
    expect(deriveRooms(s.unit)).toHaveLength(2)
    expect(issues(s).filter((c) => c.startsWith('error') || c.includes('dangling'))).toEqual([])
  })

  it('Ctrl+D copies a wall 1 ft along its normal with new corners, same thickness / height, selected', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const top = wallAt(s, [0, 0], [4, 0])
    s = reducer(s, { type: 'select', ids: [top.id] })
    s = reducer(s, { type: 'duplicate' })
    expect(s.unit.walls).toHaveLength(5)
    const copy = s.unit.walls.find((w) => w.id === s.selection[0])!
    expect(copy.id).not.toBe(top.id)
    expect(copy).toMatchObject({ thicknessM: top.thicknessM, heightM: top.heightM })
    expect(new Set([copy.a, copy.b]).has(top.a) || new Set([copy.a, copy.b]).has(top.b)).toBe(false)
    const f = wallFrame(copy, s.unit.vertices)
    expect(f.lengthM).toBeCloseTo(4)
    expect(Math.abs(f.origin.y)).toBeCloseTo(0.3048)
    expect(s.unit.vertices).toHaveLength(6)
    s = reducer(s, { type: 'set-wall-length', id: copy.id, lengthM: 0.5 }) // the short piece a column gap needs
    expect(wallFrame(s.unit.walls.find((w) => w.id === copy.id)!, s.unit.vertices).lengthM).toBeCloseTo(0.5)
    expect(reducer(s, { type: 'undo' }).unit.walls).toHaveLength(5)
  })

  it('a dragged wall snaps like the Wall tool: an end aligns with a corner (guide), a corner snap wins', () => {
    const s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[5.05, -2], [7, -2]]) // a loose wall whose corner sits at x = 5.05
    const right = wallAt(s, [4, 0], [4, 3])
    const ends = (dx: number, dy: number) => [right.a, right.b].map((id) => ({ id, x: at(s, 4, id === right.a ? 0 : 3)!.x + dx, y: (id === right.a ? 0 : 3) + dy }))
    const aligned = snapMove(ends(1, 0.02), s.unit, 0.1)
    expect(aligned.dx).toBeCloseTo(0.05)
    expect(aligned.snap.kind).toBe('aligned x')
    expect(aligned.snap.guides).toContainEqual({ axis: 'x', at: 5.05 })
    const cornered = snapMove(ends(1.02, -1.97), s.unit, 0.1) // the top end lands 4 cm from (5.05, -2)
    expect(cornered.snap.kind).toBe('vertex')
    expect(cornered.dx).toBeCloseTo(0.03)
    expect(cornered.dy).toBeCloseTo(-0.03)
    expect(snapMove(ends(0.5, 0.5), s.unit, 0.1).snap.kind).toBe('free')
  })

  it('in line: an end within 3 cm of a wall\'s line past its end snaps onto it; corner and body snaps first; a chain drawn on from its end follows it', () => {
    // a diagonal wall (0,0)→(3,1) (not on the 45° rays) with a loose stub elsewhere
    const s = poly([[0, 0], [3, 1], [3, 4], [0, 4]])
    const L = Math.hypot(3, 1)
    const dir = { x: 3 / L, y: 1 / L }, nrm = { x: -dir.y, y: dir.x }
    const off = (along: number, side: number) => ({ x: dir.x * along + nrm.x * side, y: dir.y * along + nrm.y * side })
    const lateral = (p: { x: number; y: number }) => p.x * nrm.x + p.y * nrm.y
    const a = snapPoint(off(L + 1, 0.02), s.unit, { tolM: 0.1 })
    expect(a.kind).toBe('in line')
    expect(lateral(a)).toBeCloseTo(0, 9)
    expect(a.x * dir.x + a.y * dir.y).toBeCloseTo(L + 1, 9) // slid sideways only
    expect(snapPoint(off(L + 1, 0.04), s.unit, { tolM: 0.1 }).kind).toBe('free') // 4 cm off: not "a hair"
    expect(snapPoint(off(L / 2, 0.02), s.unit, { tolM: 0.1 }).kind).toBe('wall') // beside the wall: its body
    expect(snapPoint(off(L + 0.05, 0.02), s.unit, { tolM: 0.1 }).kind).toBe('vertex') // at its end: the corner
    expect(snapPoint(off(-1, -0.02), s.unit, { tolM: 0.1 }).kind).toBe('in line') // past the other end too
    // the dragged corner's own walls never pull it (exclude): (3,1) dragged off the line is not snapped back by them
    const c = at(s, 3, 1)!
    expect(snapPoint(off(L + 1, 0.02), s.unit, { tolM: 0.1, exclude: [c.id] }).kind).not.toBe('in line')
    // drawing on from (3,1): the ray would round to 0° or 45°; within 1.5° of the wall's line it follows the line
    const d = snapPoint(off(L + 2, 0.02), s.unit, { tolM: 0.1, from: at(s, 3, 1)! })
    expect(d.kind).toBe('in line')
    expect(lateral(d)).toBeCloseTo(0, 9)
    // an axis wall's line keeps its guide (the drag of a whole wall reads guides: snapMove is unchanged)
    const box = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const h = snapPoint({ x: 5, y: 0.02 }, box.unit, { tolM: 0.1 })
    expect(h).toMatchObject({ kind: 'in line', x: 5, y: 0 })
    expect(h.guides).toContainEqual({ axis: 'y', at: 0 })
    // axis align takes the nearest corner's x, not the first one listed (a neighbour a few cm off made 179° corners)
    const two = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[5.06, -2], [7, -2]], [[5, -4], [7, -4]])
    expect(snapPoint({ x: 5.01, y: 1.5 }, two.unit, { tolM: 0.1 })).toMatchObject({ kind: 'aligned x', x: 5 })
  })

  it('columns and wall faces snap, weaker than corners / centre lines (founder 2026-10-06); an end on a column is no loose end', () => {
    const box = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const s = reducer(box, { type: 'add-pillar', x: 6, y: 1, wM: 0.4, hM: 0.6 }) // faces x = 5.8 / 6.2, y = 0.7 / 1.3
    const tol = 0.1
    expect(snapPoint({ x: 5.75, y: 1.1 }, s.unit, { tolM: tol })).toMatchObject({ kind: 'column', x: 5.8, y: 1.1 }) // its left face
    expect(snapPoint({ x: 5.77, y: 0.68 }, s.unit, { tolM: tol })).toMatchObject({ kind: 'column', x: 5.8, y: 0.7 }) // a corner
    expect(snapPoint({ x: 6.03, y: 1.02 }, s.unit, { tolM: tol })).toMatchObject({ kind: 'column', x: 6, y: 1 }) // its centre
    expect(snapPoint({ x: 5.72, y: 1.1 }, s.unit, { tolM: tol }).kind).toBe('free') // 8 cm off: beyond the weaker reach (7 cm)
    expect(snapPoint({ x: 5.75, y: 1.1 }, s.unit, { tolM: tol, exclude: [s.unit.pillars![0].id] }).kind).toBe('free') // the dragged column itself never pulls
    // drawing from (4, 1.1) east: the ray meets the face at (5.8, 1.1) and keeps its angle
    expect(snapPoint({ x: 5.76, y: 1.12 }, s.unit, { tolM: tol, from: { x: 4, y: 1.1 } })).toMatchObject({ kind: 'column', x: 5.8, y: 1.1, angleDeg: 0 })
    // a wall's face line: the bottom wall (0,0)→(4,0), its face at y = ±thickness / 2
    const t = s.unit.walls[0].thicknessM / 2
    expect(snapPoint({ x: 2, y: t + 0.05 }, s.unit, { tolM: tol })).toMatchObject({ kind: 'wall face', x: 2, y: t })
    expect(snapPoint({ x: 2, y: 0.03 }, s.unit, { tolM: tol }).kind).toBe('wall') // the centre line wins near it
    // a wall ending on the column's face is joined there: no loose-end mark on that end
    const joined = run(s, { type: 'chain-start', at: { x: 4, y: 1.1, tolM: TOL } }, { type: 'chain-add', at: { x: 5.8, y: 1.1, tolM: TOL } }, { type: 'chain-end' })
    expect(issues(joined).filter((i) => i.endsWith('dangling-vertex'))).toEqual([])
    expect(snapMove([{ ...at(joined, 5.8, 1.1)!, x: 5.75, y: 1.1 }], joined.unit, tol).snap.kind).toBe('column')
  })

  it('a corner dragged onto a wall mid-span T-splits it (was: "Walls cross")', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 1], [2, 2]]) // a loose stub inside
    const tip = at(s, 2, 2)!
    s = run(s, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: tip.id, x: 2, y: 3 }] }, { type: 'drag-end', ids: [tip.id] })
    expect(s.unit.walls.filter((w) => w.a === tip.id || w.b === tip.id)).toHaveLength(3)
    expect(issues(s).filter((c) => c.includes('walls-intersect'))).toEqual([])
  })

  describe('overlap = joined (founder 2026-10-03: a wall ending inside another has ended there)', () => {
    /** 4×3 box, its bottom wall 10" thick (half 0.127 m), a partition from the top wall down to a loose tip at (2, 2) */
    const boxed = () => {
      let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 0], [2, 2]])
      s = reducer(s, { type: 'update-wall', id: wallAt(s, [4, 3], [0, 3]).id, patch: { thicknessM: EXTERIOR_M } })
      return { s, tip: at(s, 2, 2)! }
    }
    const drop = (s: StudioState, id: string, x: number, y: number) =>
      run(s, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id, x, y }] }, { type: 'drag-end', ids: [id] })
    const clean = (s: StudioState) => issues(s).filter((c) => c.startsWith('error') || c.includes('dangling'))

    it('an end dropped inside a thick wall\'s body, off its centre line and off-centre along it, T-splits it at the projection', () => {
      const { s: s0, tip } = boxed()
      for (const y of [2.9, 3.08]) {
        // short of the centre line by 0.1 m, or 0.08 m past it: both inside the 0.254 m wall
        const s = drop(s0, tip.id, 2.6, y)
        expect(s.unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 2.6, y: 3 }) // onto the centre line
        expect(s.unit.walls.filter((w) => w.a === tip.id || w.b === tip.id)).toHaveLength(3)
        expect(deriveRooms(s.unit)).toHaveLength(2)
        expect(clean(s)).toEqual([])
        expect(reducer(s, { type: 'undo' }).unit).toBe(s0.unit) // the drag and its join: one undo entry
      }
      // outside the body but within reach (7 cm short of its face; reach = max(0.15, 1.5 × 5") = 19 cm): the end goes on
      // along its OWN line (the wall (2,0)→(2.6,2.8) never tilts) onto the centre line and T-splits it
      const reached = drop(s0, tip.id, 2.6, 2.8)
      const v = reached.unit.vertices.find((x) => x.id === tip.id)!
      expect(v.y).toBeCloseTo(3, 9)
      expect(v.x).toBeCloseTo(2 + (0.6 * 3) / 2.8, 9)
      expect(reached.unit.walls.filter((w) => w.a === tip.id || w.b === tip.id)).toHaveLength(3)
      expect(deriveRooms(reached.unit)).toHaveLength(2)
      expect(clean(reached)).toEqual([])
      // beyond reach (32 cm short of the face): left as dropped, a loose end
      const out = drop(s0, tip.id, 2.6, 2.55)
      expect(out.unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 2.6, y: 2.55 })
      expect(issues(out)).toContain('warning:dangling-vertex')
      // a partition-thin wall's body is thinner: along the line 31 cm short of the left wall's face (5") stays loose,
      // 5 cm short reaches it, inside it (0.05 m off its centre line) joins as before
      expect(drop(s0, tip.id, 0.3, 1.5).unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 0.3, y: 1.5 })
      expect(drop(s0, tip.id, 0.1, 1.5).unit.vertices.find((v) => v.id === tip.id)!.x).toBeCloseTo(0, 9)
      expect(drop(s0, tip.id, 0.05, 1.5).unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 0, y: 1.5 })
    })

    it('an end inside a wall\'s end block becomes that corner; a nudge joins the same way', () => {
      const { s: s0, tip } = boxed()
      const corner = at(s0, 4, 3)!
      let s = drop(s0, tip.id, 3.92, 2.95)
      expect(s.unit.vertices.find((v) => v.id === tip.id)).toBeUndefined()
      expect(s.unit.walls.filter((w) => w.a === corner.id || w.b === corner.id)).toHaveLength(3)
      expect(clean(s)).toEqual([])
      s = run(s0, { type: 'select', ids: [tip.id] }, { type: 'nudge', dx: 0.5, dy: 0.9 }) // tip → (2.5, 2.9): in the body
      expect(s.unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 2.5, y: 3 })
      expect(deriveRooms(s.unit)).toHaveLength(2)
      expect(reducer(s, { type: 'undo' }).unit).toBe(s0.unit)
    })

    it('two walls that cross split each other at the crossing and share the corner', () => {
      // a loose wall (5,-1)→(5,4) dragged to x = 2 crosses the top and bottom walls
      const s0 = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[5, -1], [5, 4]])
      const [p, q] = [at(s0, 5, -1)!, at(s0, 5, 4)!]
      const s = run(s0, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: p.id, x: 2, y: -1 }, { id: q.id, x: 2, y: 4 }] }, { type: 'drag-end', ids: [p.id, q.id] })
      for (const y of [0, 3]) expect(s.unit.walls.filter((w) => [w.a, w.b].includes(at(s, 2, y)!.id))).toHaveLength(4)
      expect(deriveRooms(s.unit)).toHaveLength(2)
      expect(issues(s).filter((c) => c.includes('walls-intersect'))).toEqual([])
      // the Wall tool too: a wall drawn across the box splits what it crosses
      const w = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[1, -1], [1, 4]])
      expect(deriveRooms(w.unit)).toHaveLength(2)
      expect(issues(w).filter((c) => c.includes('walls-intersect'))).toEqual([])
    })

    it('an opening on the split point is trimmed back to the joining wall\'s face: the longer side kept (≥ 0.3 m), else it goes', () => {
      let { s } = boxed()
      const tip = at(s, 2, 2)!
      const bottom = wallAt(s, [4, 3], [0, 3]).id
      // a 3'-0" door centred on the bottom wall: 1.543–2.457 m from (4, 3), i.e. x 2.457 … 1.543
      const t = drop(reducer(s, { type: 'add-opening', wallId: bottom, t: 0.5, kind: 'door' }), tip.id, 2.2, 2.92)
      expect(t.unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 2.2, y: 3 }) // joined, not refused
      const [door, ...rest] = t.unit.walls.flatMap((w) => w.openings.map((o) => ({ o, f: wallFrame(w, t.unit.vertices) })))
      expect(rest).toEqual([])
      // kept: the side away from (4, 3) (0.59 m against 0.19 m), ending at the 5" partition's face (x 2.2 − 0.064)
      expect(door.o.widthM).toBeCloseTo(0.594, 3)
      const edge = [door.o.offsetM, door.o.offsetM + door.o.widthM].map((m) => door.f.origin.x + door.f.dir.x * m)
      expect(Math.max(...edge)).toBeCloseTo(2.2 - 0.0636, 3)
      expect(Math.min(...edge)).toBeCloseTo(4 - 2.457, 3)
      expect(t.toast?.text).toMatch(/1 opening trimmed/)
      // a 0.5 m window centred on the join: 0.19 m either side is under 0.3 m — it goes
      const w = drop(reducer(s, { type: 'add-opening', wallId: bottom, t: 0.45, kind: 'window', widthM: 0.5 }), tip.id, 2.2, 2.92)
      expect(w.unit.vertices.find((v) => v.id === tip.id)).toMatchObject({ x: 2.2, y: 3 })
      expect(w.unit.walls.flatMap((x) => x.openings)).toEqual([])
    })

    it('Import / auto-trace: a unit with overlaps is joined once, Ctrl+Z gives it as it was', () => {
      const raw = poly([[0, 0], [4, 0], [4, 3], [0, 3]]).unit
      // a partition whose ends stop 5 cm inside the top and bottom walls (never on their centre lines), not split
      const a = { id: 'pa', x: 2, y: 0.05 }, b = { id: 'pb', x: 2, y: 2.95 }
      const overlapping: Unit = { ...raw, vertices: [...raw.vertices, a, b], walls: [...raw.walls, { id: 'part', a: 'pa', b: 'pb', thicknessM: PARTITION_M, heightM: 3, openings: [] }] }
      expect(deriveRooms(overlapping)).toHaveLength(1)
      const loaded = reducer(initialState(), { type: 'load-unit', unit: overlapping })
      expect(deriveRooms(loaded.unit)).toHaveLength(2)
      expect(loaded.toast?.text).toMatch(/Joined 2/)
      expect(deriveRooms(reducer(loaded, { type: 'undo' }).unit)).toHaveLength(1)
      const r = mockTraceResult()
      const traced = studioReducer(initialState(), { type: 'auto-trace', result: { ...r, unit: overlapping } })
      expect(deriveRooms(traced.unit)).toHaveLength(2)
      const undone = studioReducer(traced, { type: 'undo' })
      expect(deriveRooms(undone.unit)).toHaveLength(1) // the draft as traced, its review list still showing
      expect(undone.review?.unitId).toBe(undone.unit.id)
      expect(studioReducer(undone, { type: 'undo' }).unit.walls).toEqual([]) // then the unit before the trace
    })

    /** a unit from points: walls [from, to, thickness] */
    const build = (pts: Record<string, [number, number]>, walls: [string, string, number][]): Unit => ({
      ...initialState().unit,
      vertices: Object.entries(pts).map(([id, [x, y]]) => ({ id, x, y })),
      walls: walls.map(([a, b, t], i) => ({ id: `w${i}`, a, b, thicknessM: t, heightM: 3, openings: [] })),
    })
    const wallKey = (w: Wall) => [w.a, w.b].sort().join('|')
    const axisOnly = (u: Unit) =>
      u.walls.every((w) => {
        const f = wallFrame(w, u.vertices)
        return Math.abs(f.dir.x) < 1e-9 || Math.abs(f.dir.y) < 1e-9
      })

    it('a 5" wall meeting a 10" wall END TO END on offset centre lines: one junction at the 10" wall\'s end, nothing tilts, the hidden piece is 10" thick', () => {
      // top side: 10" wall (0,0)→(2,0), then a 5" wall flush with its inner face — centre line 0.0635 lower — (2,0.0635)→(4,0.0635)
      const off = (EXTERIOR_M - PARTITION_M) / 2
      const raw = build({ A: [0, 0], E: [2, 0], F: [2, off], B: [4, off], C: [4, 3], D: [0, 3] }, [['A', 'E', EXTERIOR_M], ['F', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]])
      expect(deriveRooms(raw)).toHaveLength(0)
      const s = reducer(initialState(), { type: 'load-unit', unit: raw })
      expect(deriveRooms(s.unit)).toHaveLength(1)
      expect(axisOnly(s.unit)).toBe(true)
      for (const v of raw.vertices) expect(s.unit.vertices.find((x) => x.id === v.id)).toMatchObject({ x: v.x, y: v.y }) // nothing moved
      const piece = s.unit.walls.find((w) => wallKey(w) === 'E|F')!
      expect(piece.thicknessM).toBe(EXTERIOR_M) // the thick wall's, never a visible thin zigzag
      expect(s.unit.walls).toHaveLength(raw.walls.length + 1)
      expect(issues(s).filter((c) => c.startsWith('error') || c.includes('dangling'))).toEqual([])
      // the same by hand: the 5" wall's loose end dropped 2 cm past the 10" wall's free end: that end comes over, nothing tilts
      const loose = build({ A: [0, 0], E: [2, 0], F: [2.6, 0.5], B: [4, off], C: [4, 3], D: [0, 3] }, [['A', 'E', EXTERIOR_M], ['F', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]])
      let d = reducer(initialState(), { type: 'load-unit', unit: loose })
      d = run(d, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: 'F', x: 2.02, y: off }] }, { type: 'drag-end', ids: ['F'] })
      expect(deriveRooms(d.unit)).toHaveLength(1)
      expect(axisOnly(d.unit)).toBe(true)
      expect(d.unit.vertices.find((x) => x.id === 'E')).toMatchObject({ x: 2.02, y: 0 })
      expect(d.unit.vertices.find((x) => x.id === 'F')).toMatchObject({ x: 2.02, y: off })
    })

    it('join-walls: the whole unit in one undo entry; no "Walls cross" left; nothing to join = no entry', () => {
      const raw = build({ A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3], p: [2, 0.05], q: [2, 2.95], r: [-0.5, 1.5], t: [4.5, 1.5] }, [['A', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M], ['p', 'q', PARTITION_M], ['r', 't', PARTITION_M]])
      const s0 = { ...initialState(), unit: raw }
      expect(validate(raw).map((i) => i.code)).toContain('walls-intersect')
      const s = reducer(s0, { type: 'join-walls' })
      expect(s.history.past).toEqual([raw])
      expect(validate(s.unit).map((i) => i.code)).not.toContain('walls-intersect')
      expect(deriveRooms(s.unit)).toHaveLength(4)
      expect(s.toast?.text).toMatch(/Joined/)
      expect(reducer(s, { type: 'join-walls' })).toBe(s)
      expect(reducer(s, { type: 'undo' }).unit).toBe(raw)
    })

    it('a loose end short of a wall (within max(0.15 m, 1.5 × its thickness) of its face, along its own line) joins on load / Join walls: T, L, never through, an opening there trimmed', () => {
      const ends = (u: Unit) => u.vertices.filter((v) => u.walls.filter((w) => w.a === v.id || w.b === v.id).length === 1).map((v) => v.id)
      const load = (u: Unit) => reducer(initialState(), { type: 'load-unit', unit: u })
      // box 4×3 of 5" walls; a partition from the top down to p, 10 cm short of the bottom wall's face (y 2.9365)
      const box = { A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3] } as Record<string, [number, number]>
      const sides: [string, string, number][] = [['A', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]]
      const t = load(build({ ...box, m: [2, 0], p: [2, 2.84] }, [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ...sides.slice(1), ['m', 'p', PARTITION_M]]))
      expect(t.unit.vertices.find((v) => v.id === 'p')).toMatchObject({ x: 2, y: 3 }) // slid along its own line onto the centre line
      expect(ends(t.unit)).toEqual([])
      expect(deriveRooms(t.unit)).toHaveLength(2)
      expect(t.toast?.text).toMatch(/Joined 1/)
      expect(reducer(t, { type: 'undo' }).unit.vertices.find((v) => v.id === 'p')).toMatchObject({ y: 2.84 })
      // 30 cm short: beyond reach, stays a loose end
      expect(ends(load(build({ ...box, m: [2, 0], p: [2, 2.63] }, [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ...sides.slice(1), ['m', 'p', PARTITION_M]])).unit)).toEqual(['p'])
      // never through: both a 5" wall q→r (face 1.7 cm ahead) and the bottom wall behind it (face 15.7 cm) are within
      // reach — the nearest takes the end
      const thru = load(build({ ...box, m: [2, 0], p: [2, 2.78], q: [1, 2.86], r: [3, 2.86] }, [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ...sides.slice(1), ['m', 'p', PARTITION_M], ['q', 'r', PARTITION_M]]))
      expect(thru.unit.vertices.find((v) => v.id === 'p')).toMatchObject({ x: 2, y: 2.86 })
      // an opening on the split point: joined, the slider cut back to the partition's face (a tie: the side toward C kept)
      const door = build({ ...box, m: [2, 0], p: [2, 2.84] }, [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ...sides.slice(1), ['m', 'p', PARTITION_M]])
      door.walls[3].openings = [{ id: 'dr', kind: 'slider', offsetM: 1, widthM: 2, heightM: 2.1, sillM: 0 }] // C→D, x 3…1
      const trimmed = load(door)
      expect(trimmed.unit.vertices.find((v) => v.id === 'p')).toMatchObject({ x: 2, y: 3 })
      const [sl, ...more] = trimmed.unit.walls.flatMap((w) => w.openings)
      expect(more).toEqual([])
      expect(sl).toMatchObject({ id: 'dr', offsetM: 1 })
      expect(sl.widthM).toBeCloseTo(1 - PARTITION_M / 2, 9)
      expect(trimmed.toast?.text).toMatch(/Joined 1 overlapping \/ crossing wall \(1 opening trimmed\)/)
      // an L: two free ends 10 cm and 8 cm short of where their lines cross both come there; nothing tilts
      const l = load(build({ A: [0, 0], E: [1.9, 0], F: [2, 0.08], C: [2, 3], D: [0, 3] }, [['A', 'E', PARTITION_M], ['F', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]]))
      expect(ends(l.unit)).toEqual([])
      expect(deriveRooms(l.unit)).toHaveLength(1)
      expect(axisOnly(l.unit)).toBe(true)
      expect(l.unit.vertices.find((v) => v.id === 'E' || v.id === 'F')).toMatchObject({ x: 2, y: 0 })
      // a 1.1 m railing joins the same way; a 0.52 m pillar-thick wall is still a wall to join (its face 10 cm ahead)
      const low = build({ ...box, m: [2, 0], p: [2, 2.83] }, [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', 0.52], ['D', 'A', PARTITION_M], ['m', 'p', 0.0635]])
      low.walls[5].heightM = 1.1
      const lj = load({ ...low, vertices: low.vertices.map((v) => (v.id === 'p' ? { ...v, y: 3 - 0.26 - 0.1 } : v)) })
      expect(lj.unit.vertices.find((v) => v.id === 'p')).toMatchObject({ x: 2, y: 3 })
      expect(lj.unit.walls.find((w) => w.id === 'w5')!.heightM).toBe(1.1)
    })

    it('junk stubs go on load / Join walls (one undo step, toast): a nib ≤ 0.35 m past a corner with nothing ahead, a stub inside a pillar; never a longer nib, a low wall ≥ 0.35 m, one with an opening, or one whose corner would come loose; never on a drag', () => {
      const ids = (u: Unit) => u.walls.map((w) => w.id)
      // box of 5" walls split by a partition m→q→n at x = 2; extra walls appended per case, w6 onwards
      const base = { A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3], m: [2, 0], q: [2, 1.5], n: [2, 3] } as Record<string, [number, number]>
      const box: [string, string, number][] = [['A', 'm', PARTITION_M], ['m', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'n', PARTITION_M], ['n', 'D', PARTITION_M], ['D', 'A', PARTITION_M], ['m', 'q', PARTITION_M], ['q', 'n', PARTITION_M]]
      const with_ = (pts: Record<string, [number, number]>, extra: [string, string, number][], patch: (u: Unit) => Unit = (u) => u) => patch(build({ ...base, ...pts }, [...box, ...extra]))
      // a 0.2 m nib past corner B (the bottom wall carried on), nothing ahead: removed with its corner
      const raw = with_({ N: [4.2, 0] }, [['B', 'N', PARTITION_M]])
      const s = reducer(initialState(), { type: 'load-unit', unit: raw })
      expect(ids(s.unit)).toEqual(ids(raw).slice(0, 8))
      expect(s.unit.vertices.some((v) => v.id === 'N')).toBe(false)
      expect(s.toast?.text).toBe('Removed 1 stub (short wall ends sticking out)')
      expect(s.history.past).toHaveLength(1)
      expect(ids(reducer(s, { type: 'undo' }).unit)).toEqual(ids(raw)) // one undo step back to the file
      // a 0.5 m nib stays (a wall someone meant)
      expect(ids(reducer(initialState(), { type: 'load-unit', unit: with_({ N: [4.5, 0] }, [['B', 'N', PARTITION_M]]) }).unit)).toHaveLength(9)
      // a 0.45 m stub off the partition, both ends inside a pillar's block: removed; as a 1.1 m railing it stays
      const pillar = (u: Unit): Unit => ({ ...u, pillars: [{ id: 'P', x: 2.2, y: 1.5, wM: 0.6, hM: 0.6 }] })
      expect(ids(reducer(initialState(), { type: 'load-unit', unit: with_({ S: [2.45, 1.5] }, [['q', 'S', PARTITION_M]], pillar) }).unit)).toHaveLength(8)
      const rail = with_({ S: [2.45, 1.5] }, [['q', 'S', PARTITION_M]], (u) => pillar({ ...u, walls: u.walls.map((w) => (w.id === 'w8' ? { ...w, heightM: 1.1 } : w)) }))
      expect(ids(reducer(initialState(), { type: 'load-unit', unit: rail }).unit)).toHaveLength(9)
      // a 0.3 m nib carrying a vent stays
      const vent = with_({ N: [4.3, 0] }, [['B', 'N', PARTITION_M]], (u) => ({ ...u, walls: u.walls.map((w) => (w.id === 'w8' ? { ...w, openings: [{ id: 'v', kind: 'window' as const, offsetM: 0, widthM: 0.3, heightM: 0.6, sillM: 1.5 }] } : w)) }))
      expect(ids(reducer(initialState(), { type: 'load-unit', unit: vent }).unit)).toHaveLength(9)
      // a 0.2 m piece off a corner of only one other wall (removing it would leave that wall loose) stays
      const lone = build({ A: [0, 0], B: [3, 0], N: [3.2, 0.2] }, [['A', 'B', PARTITION_M], ['B', 'N', PARTITION_M]])
      expect(reducer(initialState(), { type: 'load-unit', unit: lone }).unit.walls).toHaveLength(2)
      // a drag leaving a nib: kept (whole-unit pass only)
      let d = reducer(initialState(), { type: 'load-unit', unit: with_({ N: [4.5, 0] }, [['B', 'N', PARTITION_M]]) })
      d = run(d, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: 'N', x: 4.2, y: 0 }] }, { type: 'drag-end', ids: ['N'] })
      expect(ids(d.unit)).toHaveLength(9)
    })

    it('openSpotsNear names why a click is in no room: an end short of a wall, a crossing, two corners apart; nearest first', () => {
      // the right wall stops 4 cm short of the top wall's face; the left side meets the top at two corners 3 cm apart
      const u = build({ A: [0, 0], A2: [0.03, 0], B: [4, 0], B2: [4, 0.0635 + 0.04], C: [4, 3], D: [0, 3] }, [['A2', 'B', PARTITION_M], ['B2', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]])
      const spots = openSpotsNear(u, deriveRooms(u), { x: 3.5, y: 0.5 })
      // (the top wall's own free end (4, 0) is 10 cm short of the right wall's end)
      expect(spots.slice(0, 2).map((x) => x.why)).toEqual(['Wall end 4 cm short of the wall', 'Wall end 10 cm short of the wall'])
      expect(spots[0].at.y).toBeCloseTo(0.1035)
      expect(spots.map((x) => x.why)).toContain('Two corners 3 cm apart, not one corner')
      const crossed = build({ A: [0, 0], B: [4.5, 0], C: [4, -0.5], D: [4, 3], E: [0, 3] }, [['A', 'B', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'E', PARTITION_M], ['E', 'A', PARTITION_M]])
      expect(openSpotsNear(crossed, deriveRooms(crossed), { x: 2, y: 1 }).map((x) => x.why)).toContain('Walls cross without a shared corner')
      const box = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
      expect(openSpotsNear(box.unit, deriveRooms(box.unit), { x: 2, y: 1 })).toEqual([])
    })

    it('the five hand traces load unchanged (nothing in them overlaps)', () => {
      for (const u of [typeA, typeB, typeC, sheltechA, sheltechB]) {
        const s = reducer(initialState(), { type: 'load-unit', unit: u as unknown as Unit })
        expect(s.history.past).toEqual([])
      }
    })

    describe('hand-fix precision (founder 2026-10-03: a wedge between two nearly collinear hand-fixed pieces, a door on a stub)', () => {
      /** each opening's hinge point on the plan and the side it swings to (+1 / −1 in plan y, or x on an x-normal wall) */
      const poses = (u: Unit) =>
        u.walls.flatMap((w) => {
          const f = wallFrame(w, u.vertices)
          return w.openings.map((o) => {
            const hu = o.hinge === 'b' ? o.offsetM + o.widthM : o.offsetM
            return { id: o.id, x: f.origin.x + f.dir.x * hu, y: f.origin.y + f.dir.y * hu, side: (o.swing === 'out' ? 1 : -1) * Math.sign(Math.abs(f.normal.y) > 0.5 ? f.normal.y : f.normal.x) }
          })
        })
      const near = (p: { x: number; y: number }, q: { x: number; y: number }, tol: number) => expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(tol)
      /** drag corners to new spots in one gesture and drop */
      const drop2 = (s: StudioState, to: [string, number, number][]) =>
        run(s, { type: 'drag-begin' }, { type: 'drag', vertices: to.map(([id, x, y]) => ({ id, x, y })) }, { type: 'drag-end', ids: to.map(([id]) => id) })
      const lateral = (u: Unit, p: string, a: string, b: string) => {
        const [P, A, B] = [p, a, b].map((id) => u.vertices.find((v) => v.id === id)!)
        return ((P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y)
      }

      it('(b) a ~1° corner after a drop heals into one straight wall; a door on the reversed piece keeps its hinge point and swing side', () => {
        // A(0,0)→B(2,0); a loose piece C→B whose end C is dropped 2.6 cm off A–B's line, 1.5 m on (≈ 1°)
        const u = build({ A: [0, 0], B: [2, 0], C: [3.5, 0.3] }, [['A', 'B', PARTITION_M], ['C', 'B', PARTITION_M]])
        let s = reducer(initialState(), { type: 'load-unit', unit: u })
        s = reducer(s, { type: 'add-opening', wallId: 'w1', t: 0.5, kind: 'door' })
        s = run(s, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: 'C', x: 3.5, y: 0.026 }] })
        const before = poses(s.unit)[0]
        s = reducer(s, { type: 'drag-end', ids: ['C'] })
        expect(s.unit.walls).toHaveLength(1)
        expect(s.unit.walls[0]).toMatchObject({ id: 'w0', a: 'A', b: 'C' })
        expect(s.unit.vertices.map((v) => v.id).sort()).toEqual(['A', 'C'])
        const after = poses(s.unit)[0]
        near(after, before, 0.01) // the corner moved ≤ 1.5 cm sideways: the hinge with it, never along
        expect(after.side).toBe(before.side)
        expect(reducer(s, { type: 'undo' }).unit.walls).toHaveLength(2) // the drag and its heal: one undo entry
      })

      it('(b) two widths through a bent corner are only straightened (each keeps its own); an exact straight corner on a whole-unit pass keeps its walls', () => {
        const u = build({ A: [0, 0], B: [2, 0.012], C: [3.5, 0], X: [0, 2], Y: [2, 2], Z: [4, 2] }, [['A', 'B', EXTERIOR_M], ['B', 'C', PARTITION_M], ['X', 'Y', PARTITION_M], ['Y', 'Z', PARTITION_M]])
        expect(Math.abs(lateral(u, 'B', 'A', 'C'))).toBeCloseTo(0.012, 6)
        const s = reducer(initialState(), { type: 'load-unit', unit: u }) // load = join-walls: the whole unit
        expect(s.unit.walls).toHaveLength(4)
        expect(lateral(s.unit, 'B', 'A', 'C')).toBeCloseTo(0, 9) // B onto the line A–C: no 179° corner left
        expect(s.unit.vertices.find((v) => v.id === 'Y')).toMatchObject({ x: 2, y: 2 }) // straight already: untouched
        expect(Math.abs(lateral(reducer(s, { type: 'undo' }).unit, 'B', 'A', 'C'))).toBeCloseTo(0.012, 6)
      })

      it('(b) a wall drawn on from a free wall end along its line becomes one wall with it; the chain goes on', () => {
        const b = build({ A: [0, 0], B: [3, 0] }, [['A', 'B', PARTITION_M]])
        const u = { ...b, walls: b.walls.map((w) => ({ ...w, heightM: 3.048 })) } // the Wall tool's height
        let s = reducer(initialState(), { type: 'load-unit', unit: u })
        s = run(s, { type: 'set-scale', pxPerM: 100 }, { type: 'chain-start', at: { x: 3, y: 0, tolM: TOL } }, { type: 'chain-add', at: { x: 5, y: 0, tolM: TOL } })
        expect(s.unit.walls).toHaveLength(1)
        expect(wallFrame(s.unit.walls[0], s.unit.vertices).lengthM).toBeCloseTo(5)
        expect(s.chain?.ids).toHaveLength(1)
        s = reducer(s, { type: 'chain-add', at: { x: 5, y: 2, tolM: TOL } })
        expect(s.unit.walls).toHaveLength(2)
      })

      /** 4×3 box (bottom wall C→D 10"), plus a loose 5" piece p→q at (1,2)→(3,2) */
      const overlaid = (railing = false) => {
        const u = build({ A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3], p: [1, 2], q: [3, 2] }, [['A', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', EXTERIOR_M], ['D', 'A', PARTITION_M], ['p', 'q', PARTITION_M]])
        return { ...u, walls: u.walls.map((w) => (w.id === 'w4' && railing ? { ...w, heightM: 1.1 } : w)) }
      }

      it('(c) a piece laid over a wall (centre lines 2–3 cm apart) is removed with a toast; its door goes onto the wall at the same place', () => {
        let s = reducer(initialState(), { type: 'load-unit', unit: overlaid() })
        s = reducer(s, { type: 'add-opening', wallId: 'w4', t: 0.5, kind: 'door' }) // centred at x = 2
        const door = s.unit.walls[4].openings[0].id
        s = drop2(s, [['p', 1, 2.97], ['q', 3, 2.98]])
        expect(s.toast?.text).toMatch(/Removed a wall drawn over another/)
        expect(s.unit.walls.map((w) => w.id)).toEqual(['w0', 'w1', 'w2', 'w3'])
        expect(s.unit.vertices).toHaveLength(4)
        expect(s.unit.walls[2].openings.map((o) => o.id)).toEqual([door])
        near(entityPoints(s.unit, door)[0], { x: 2, y: 3 }, 0.03)
        expect(deriveRooms(s.unit)).toHaveLength(1)
        expect(clean(s)).toEqual([])
        // Join walls / load do the same on the whole unit
        const laid = overlaid()
        const l = reducer(initialState(), { type: 'load-unit', unit: { ...laid, vertices: laid.vertices.map((v) => (v.id === 'p' ? { ...v, y: 2.97 } : v.id === 'q' ? { ...v, y: 2.98 } : v)) } })
        expect(l.unit.walls).toHaveLength(4)
        expect(l.toast?.text).toMatch(/Removed a wall drawn over another/)
      })

      it('(c) a low railing beside a full wall is not a duplicate; a piece 1 ft off is not either', () => {
        const rail = drop2(reducer(initialState(), { type: 'load-unit', unit: overlaid(true) }), [['p', 1, 2.97], ['q', 3, 2.98]])
        expect(rail.unit.walls.some((w) => w.id === 'w4')).toBe(true)
        expect(rail.toast?.text ?? '').not.toMatch(/Removed/)
        const apart = drop2(reducer(initialState(), { type: 'load-unit', unit: overlaid() }), [['p', 1, 2.7], ['q', 3, 2.7]])
        expect(apart.unit.walls).toHaveLength(5)
      })

      it('(d) a wall shortened under its door: the door moves onto the wall continuing it (same place), else it goes with a toast; a vent window on a short wall stays', () => {
        // A(0,0)→B(3,0)→C(6,0) with a T at B (a partition B→T), so B never heals; a door on A–B 0.2 m from A
        const u = build({ A: [0, 0], B: [3, 0], C: [6, 0], T: [3, 2] }, [['A', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['B', 'T', PARTITION_M]])
        let s = reducer(initialState(), { type: 'load-unit', unit: u })
        s = reducer(s, { type: 'add-opening', wallId: 'w0', t: 0.2, kind: 'door' })
        const door = s.unit.walls[0].openings[0]
        s = drop2(s, [['A', 2.5, 0]]) // A–B is 0.5 m now: the 0.91 m door hangs past B
        expect(s.unit.walls[0].openings).toEqual([])
        const moved = s.unit.walls[1].openings
        expect(moved.map((o) => o.id)).toEqual([door.id])
        expect(moved[0].offsetM).toBeCloseTo(0, 9) // flush against B, where it hung over
        expect(s.toast?.text ?? '').not.toMatch(/Door wider/)
        expect(clean(s).filter((c) => c.includes('opening'))).toEqual([])
        // nowhere to go (the continuing wall holds a window there already): removed, with the toast
        let t = reducer(initialState(), { type: 'load-unit', unit: u })
        t = run(t, { type: 'add-opening', wallId: 'w0', t: 0.2, kind: 'door' }, { type: 'add-opening', wallId: 'w1', t: 0.2, kind: 'window' })
        t = drop2(t, [['A', 2.5, 0]])
        expect(t.unit.walls.flatMap((w) => w.openings.map((o) => o.kind))).toEqual(['window'])
        expect(t.toast?.text).toBe('Door wider than its wall — removed; redraw it on the long wall')
        // the typed length does the same
        let l = reducer(initialState(), { type: 'load-unit', unit: u })
        l = run(l, { type: 'add-opening', wallId: 'w0', t: 0.2, kind: 'door' }, { type: 'set-wall-length', id: 'w0', lengthM: 0.5 })
        expect(l.unit.walls[1].openings).toHaveLength(1)
        // a 0.35 m vent on Sheltech A's 0.53 m wall is no door: loading keeps it (the five hand traces load unchanged)
        expect(reducer(initialState(), { type: 'load-unit', unit: sheltechA as unknown as Unit }).unit.walls.find((w) => w.id === 'w_t3_n2')!.openings).toHaveLength(1)
      })

      it('a wall carrying an opening is full height: a window placed on a 1.1 m railing raises it; a saved draft with one heals on load; a railing without one stays low', () => {
        const box = build({ A: [0, 0], B: [4, 0], C: [4, 3], D: [0, 3] }, [['A', 'B', PARTITION_M], ['B', 'C', PARTITION_M], ['C', 'D', PARTITION_M], ['D', 'A', PARTITION_M]])
        const railed = { ...box, walls: box.walls.map((w) => (w.id === 'w0' || w.id === 'w2' ? { ...w, heightM: 1.1 } : w)) }
        let s = reducer(initialState(), { type: 'load-unit', unit: railed })
        expect(s.unit.walls.map((w) => w.heightM)).toEqual([1.1, 3, 1.1, 3]) // no opening: railings stay
        s = reducer(s, { type: 'add-opening', wallId: 'w0', t: 0.5, kind: 'window' })
        expect(s.unit.walls.map((w) => w.heightM)).toEqual([WALL_HEIGHT_M, 3, 1.1, 3])
        expect(reducer(s, { type: 'undo' }).unit.walls[0].heightM).toBe(1.1) // one undo entry
        // the founder's saved draft: a window already on the railing
        const saved = { ...railed, walls: railed.walls.map((w) => (w.id === 'w0' ? { ...w, openings: s.unit.walls[0].openings } : w)) }
        expect(normalizeUnit(saved).walls[0].heightM).toBe(WALL_HEIGHT_M)
        expect(reducer(initialState(), { type: 'load-unit', unit: saved }).unit.walls.map((w) => w.heightM)).toEqual([WALL_HEIGHT_M, 3, 1.1, 3])
        // a gate: a passage in the 1.1 m railing is only a gap — the railing stays low, placed or loaded
        const gate = reducer(reducer(initialState(), { type: 'load-unit', unit: railed }), { type: 'add-opening', wallId: 'w2', t: 0.5, kind: 'passage' })
        expect(gate.unit.walls[2].openings[0].kind).toBe('passage')
        expect(gate.unit.walls.map((w) => w.heightM)).toEqual([1.1, 3, 1.1, 3])
        expect(normalizeUnit(gate.unit).walls[2].heightM).toBe(1.1)
      })
    })
  })

  it('delete: a rectangle side → room gone, no corner joined to nothing; the middle wall of a T → the through-wall is one wall again', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]])
    const past = s.history.past.length
    s = reducer(s, { type: 'delete', ids: [wallAt(s, [4, 0], [4, 3]).id] })
    expect(s.history.past.length).toBe(past + 1)
    expect(deriveRooms(s.unit)).toHaveLength(0)
    expect(s.unit.walls).toHaveLength(3)
    expect(s.unit.vertices).toHaveLength(4) // the two open ends still end walls: warnings, never an error
    expect(issues(s).filter((c) => c === 'error:dangling-vertex')).toEqual([])

    // T: partition (2,0)→(2,3) splits top and bottom; a door on the bottom-right piece, a window on the top-left one
    s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 0], [2, 3]])
    s = reducer(s, { type: 'add-opening', wallId: wallAt(s, [2, 3], [4, 3]).id, t: 0.5, kind: 'door' })
    s = reducer(s, { type: 'add-opening', wallId: wallAt(s, [0, 0], [2, 0]).id, t: 0.5, kind: 'window' })
    const world = (u: Unit) =>
      u.walls.flatMap((w) => {
        const f = wallFrame(w, u.vertices)
        return w.openings.map((o) => {
          const hu = o.hinge === 'b' ? o.offsetM + o.widthM : o.offsetM
          const side = (o.swing === 'out' ? 1 : -1) * Math.sign(f.normal.y || f.normal.x)
          return `${o.kind} ${(f.origin.x + f.dir.x * hu).toFixed(3)},${(f.origin.y + f.dir.y * hu).toFixed(3)} ${side}`
        })
      }).sort()
    const before = world(s.unit)
    s = reducer(s, { type: 'delete', ids: [wallAt(s, [2, 0], [2, 3]).id] })
    expect(s.unit.walls).toHaveLength(4)
    expect(s.unit.vertices).toHaveLength(4)
    expect(deriveRooms(s.unit)).toHaveLength(1)
    expect(world(s.unit)).toEqual(before) // openings stay where they were, hinge side and swing side too
    expect(issues(s).filter((c) => c.includes('dangling') || c.includes('opening'))).toEqual([])
  })
})

describe('furniture tool: grid move, wall snap, rotate, refusals', () => {
  /**
   * 8 × 5 m, 0.2 m walls, partition at x = 5: Living (inner 0.1..4.9) | Bed (inner 5.1..7.9), y inner 0.1..4.9.
   * The left wall's door (walls[0]) is the entrance: zone x −1.3..1.3, y 0.5..1.5. Partition door y 3.0..3.8.
   */
  const V = [[0, 0], [5, 0], [8, 0], [8, 5], [5, 5], [0, 5]].map(([x, y], i) => ({ id: `v${i}`, x, y }))
  const wall = (id: string, a: number, b: number, openings: Opening[] = []): Wall => ({ id, a: `v${a}`, b: `v${b}`, thicknessM: 0.2, heightM: 3, openings })
  const door = (id: string, offsetM: number, widthM: number): Opening => ({ id, kind: 'door', offsetM, widthM, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' })
  const piece = (id: string, assetId: string, roomId: string, x: number, y: number, rotationDeg = 0): FurniturePlacement => ({ id, assetId, roomId, x, y, rotationDeg })
  const fixture = (): StudioState => ({
    ...initialState(),
    tool: 'furniture',
    unit: {
      ...initialState().unit,
      vertices: V,
      walls: [wall('wL', 5, 0, [door('entry', 3.5, 1)]), wall('wT1', 0, 1), wall('wT2', 1, 2), wall('wR', 2, 3), wall('wB2', 3, 4), wall('wB1', 4, 5), wall('wP', 1, 4, [door('d', 3, 0.8)])],
      roomLabels: [
        { id: 'A', name: 'Living', kind: 'living', x: 2.5, y: 2.5 },
        { id: 'B', name: 'Bed', kind: 'bed', x: 6.5, y: 2.5 },
      ],
      furniture: [
        piece('sofa', 'sofa_3seat', 'A', 2.5, 4.39, 180), // against the bottom wall, facing up
        piece('cush', 'cushions_plain', 'A', 3.05, 4.27, 180), // on the sofa
        piece('rug', 'rug_rect_small', 'A', 2.5, 2.5),
        piece('lamp', 'ceiling_light', 'A', 2.5, 2.5),
        piece('side', 'bedside_oak', 'B', 6.5, 2.5), // 0.5 × 0.4
        piece('base', 'kitchen_counter', 'B', 6.5, 0.415), // fitted: 5 mm off the top wall
      ],
    },
  })
  const at = (s: StudioState, id: string) => s.unit.furniture.find((p) => p.id === id)!
  const move = (s: StudioState, id: string, x: number, y: number) => reducer(s, { type: 'move-piece', id, x, y })

  it('snaps the footprint corner onto the 3" grid from the unit corner; one undo entry', () => {
    const s0 = fixture()
    const s = move(s0, 'side', 6.61, 2.47)
    const q = pieceQuad(at(s, 'side'))
    for (const k of ['x', 'y'] as const) {
      const lo = Math.min(...q.map((p) => p[k]))
      expect(Math.abs(lo / GRID_M - Math.round(lo / GRID_M))).toBeLessThan(1e-9)
    }
    expect(at(s, 'side')).toMatchObject({ x: expect.closeTo(6.5746, 4), y: expect.closeTo(2.486, 4), roomId: 'B' })
    expect(s.history.past).toHaveLength(1)
    expect(reducer(s, { type: 'undo' }).unit).toBe(s0.unit)
  })

  it('snaps flush to a wall within 0.15 m: furniture GAP 0.05 off, fitted pieces 5 mm off (also out of a wall)', () => {
    const s = move(fixture(), 'side', 7.6, 2.5) // the grid leaves its right edge 8.5 cm off the wall
    expect(Math.max(...pieceQuad(at(s, 'side')).map((p) => p.x))).toBeCloseTo(7.9 - 0.05, 6)
    const k = move(fixture(), 'base', 6.5, 0.45) // the grid pushes it 10 cm into the top wall
    expect(at(k, 'base').y).toBeCloseTo(0.1 + 0.005 + 0.31, 6)
  })

  it('R turns 90° clockwise in place; against a wall it comes out flush and what rests on it turns along', () => {
    let s = reducer(fixture(), { type: 'rotate-piece', id: 'side' })
    expect(at(s, 'side')).toMatchObject({ x: 6.5, y: 2.5, rotationDeg: 90 })
    expect(s.history.past).toHaveLength(1)
    s = reducer(fixture(), { type: 'rotate-piece', id: 'sofa' })
    expect(at(s, 'sofa')).toMatchObject({ x: expect.closeTo(2.5, 6), y: expect.closeTo(4.9 - 0.05 - 1.1, 6), rotationDeg: 270 })
    // the cushion's offset (0.55, −0.12) turns to (0.12, 0.55), then comes out of the wall with the sofa
    expect(at(s, 'cush')).toMatchObject({ x: expect.closeTo(2.62, 6), y: expect.closeTo(4.39 + 0.55 - (4.39 - 3.75), 6), rotationDeg: 270 })
  })

  it('refuses a drop that overlaps a piece, a door zone, the entrance or leaves the room; nothing moves', () => {
    const s0 = fixture()
    const cases: [number, number, string][] = [
      [2.5, 4.3, 'Overlaps the 3-seat fabric sofa'],
      [4.6, 3.4, 'Blocks the door'],
      [0.8, 1.0, 'Blocks the entrance'],
      [-3, 2, 'Outside the room'],
    ]
    for (const [x, y, why] of cases) {
      const s = move(s0, 'side', x, y)
      expect(s.unit).toBe(s0.unit)
      expect(s.toast?.text).toBe(why)
    }
    // rugs and ceiling fixtures never block a floor piece
    expect(move(s0, 'side', 2.5, 2.5).unit).not.toBe(s0.unit)
  })

  it('moving into another room re-assigns the room; what rests on a piece moves with it', () => {
    let s = move(fixture(), 'side', 1.0, 3.0)
    expect(at(s, 'side').roomId).toBe('A')
    s = move(fixture(), 'sofa', 2.5 - GRID_M, 4.39)
    expect(at(s, 'sofa')).toMatchObject({ x: expect.closeTo(2.3954, 4), y: expect.closeTo(4.39, 6) })
    expect(at(s, 'cush')).toMatchObject({ x: expect.closeTo(3.05 - 0.1046, 4), y: expect.closeTo(4.27, 6) })
    expect(at(s, 'rug')).toEqual(at(fixture(), 'rug'))
  })

  it('pieceAt prefers the floor piece over what rests on it, and ceiling fixtures over rugs', () => {
    const ps = fixture().unit.furniture
    expect(pieceAt(ps, { x: 3.05, y: 4.27 })?.id).toBe('sofa')
    expect(pieceAt(ps, { x: 2.5, y: 2.5 })?.id).toBe('lamp')
    expect(pieceAt(ps, { x: 2.0, y: 2.0 })?.id).toBe('rug')
    expect(pieceAt(ps, { x: 0.5, y: 0.5 })).toBeNull()
  })

  it('type A: the first move writes the preset layout with only the moved piece (and its cushions) changed; resets', () => {
    const preset = furnish(typeA as Unit, deriveRooms(typeA as Unit))
    const sofa = preset.find((p) => p.id === 'r_living:sofa_3seat:1')!
    let s: StudioState = { ...initialState(), tool: 'furniture', unit: typeA as Unit, selection: [sofa.id] }
    expect(layoutFor(s.unit, deriveRooms(s.unit))).toEqual(preset)
    s = move(s, sofa.id, sofa.x + GRID_M, sofa.y)
    const changed = s.unit.furniture.filter((p, i) => JSON.stringify(p) !== JSON.stringify(preset[i])).map((p) => p.id)
    expect(changed).toEqual(['r_living:sofa_3seat:1', 'r_living:cushions_plain:1', 'r_living:cushions_plain:2'])
    expect(reducer(s, { type: 'undo' }).selection).toEqual([sofa.id]) // preset ids are deterministic
    const byId = (ps: FurniturePlacement[]) => [...ps].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(reducer(s, { type: 'reset-furniture', roomId: 'r_living' }).unit.furniture)).toEqual(byId(preset))
    expect(reducer(s, { type: 'reset-furniture' }).unit.furniture).toEqual([])
  })

  it('layoutFor: a room with no stored pieces gets its presets, a gone room’s pieces drop, a room emptied by deleting stays empty', () => {
    const u = fixture().unit
    const rooms = deriveRooms(u)
    const presetB = furnish(u, rooms).filter((p) => p.roomId === 'B')
    expect(presetB.length).toBeGreaterThan(0)
    const noB = { ...u, furniture: [...u.furniture.filter((p) => p.roomId !== 'B'), piece('old', 'bedside_oak', 'gone', 1, 1)] }
    const l = layoutFor(noB, rooms)
    expect(l.filter((p) => p.roomId === 'A')).toEqual(u.furniture.filter((p) => p.roomId === 'A'))
    expect(l.filter((p) => p.roomId === 'B')).toEqual(presetB)
    expect(l.some((p) => p.roomId === 'gone')).toBe(false)
    expect(layoutFor(u, rooms)).toBe(u.furniture) // nothing to add or drop: the stored array itself
    const emptied = { ...u, furniture: u.furniture.map((p) => (p.roomId === 'B' ? { ...p, removed: true as const } : p)) }
    expect(layoutFor(emptied, rooms).filter((p) => p.roomId === 'B' && !p.removed)).toEqual([])
  })

  it('relabelling a room to another kind re-furnishes it while it holds only presets; a moved piece keeps the room as is', () => {
    const u0 = fixture().unit
    const u = { ...u0, furniture: furnish(u0, deriveRooms(u0)) }
    const s0: StudioState = { ...fixture(), unit: u }
    const relabel = (s: StudioState) => reducer(s, { type: 'update-label', id: 'B', patch: { kind: 'study', name: 'Study' } })
    const s = relabel(s0)
    expect(layoutFor(s.unit, deriveRooms(s.unit)).filter((p) => p.roomId === 'B')).toEqual(furnish(s.unit, deriveRooms(s.unit)).filter((p) => p.roomId === 'B'))
    // the first legal one-square move of a Bed piece
    const moved = u.furniture
      .filter((p) => p.roomId === 'B')
      .flatMap((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => reducer(s0, { type: 'move-piece', id: p.id, x: p.x + dx * GRID_M, y: p.y + dy * GRID_M })))
      .find((x) => x.unit !== s0.unit)!
    expect(moved).toBeDefined()
    expect(relabel(moved).unit.furniture.filter((p) => p.roomId === 'B')).toEqual(moved.unit.furniture.filter((p) => p.roomId === 'B'))
  })

  it('Delete: the piece and what rests on it become tombstones (one undo step); they block nothing and are never picked', () => {
    const s0 = fixture()
    const s = reducer({ ...s0, selection: ['sofa'] }, { type: 'delete-piece', id: 'sofa' })
    expect(s.unit.furniture.filter((p) => p.removed).map((p) => p.id)).toEqual(['sofa', 'cush'])
    expect(s.selection).toEqual([])
    expect(s.history.past).toHaveLength(1)
    expect(reducer(s, { type: 'undo' }).unit).toBe(s0.unit)
    expect(pieceAt(s.unit.furniture, { x: 3.05, y: 4.27 })).toBeNull()
    expect(move(s, 'side', 2.5, 4.3).toast).toBeNull() // where the sofa stood
    // "Reset to preset" clears the room's tombstones
    expect(reducer(s, { type: 'reset-furniture', roomId: 'A' }).unit.furniture.some((p) => p.removed)).toBe(false)
  })

  it('a piece that stands against a wall, dropped on a wall it is not backed onto, turns its back to it (its TV along); a chair keeps its rotation', () => {
    const u = typeA as Unit
    const rooms = deriveRooms(u)
    const living = rooms.find((r) => r.id === 'r_living')!
    const east = Math.max(...roomInnerPolygon(living, u).map((p) => p.x))
    // the armchair and the plant stand on that wall's free stretch: out of the way first
    const ps = furnish(u, rooms).filter((p) => !['r_living:modern_arm_chair_01:1', 'r_living:potted_plant_01:1'].includes(p.id))
    const m = movePiece(u, rooms, ps, 'r_living:modern_wooden_cabinet:1', { x: 13.0, y: 6.4 }, 180)!
    expect(m.error).toBeNull()
    expect(m.piece.rotationDeg).toBe(90) // front faces west, into the room
    expect(Math.max(...pieceQuad(m.piece).map((p) => p.x))).toBeCloseTo(east - 0.05, 6) // backed flush (GAP)
    expect(m.furniture.find((p) => p.id === 'r_living:tv_55:1')!.rotationDeg).toBe(90)
    const f = fixture()
    const withChair = { ...f, unit: { ...f.unit, furniture: [...f.unit.furniture, piece('chair', 'dining_chair', 'B', 6.5, 3.5)] } }
    const s = move(withChair, 'chair', 7.7, 3.5) // snaps flush to the right wall, still facing +y
    expect(at(s, 'chair')).toMatchObject({ rotationDeg: 0, x: expect.closeTo(7.9 - 0.05 - 0.235, 6) })
    // R still turns freely against a wall
    expect(at(reducer(s, { type: 'rotate-piece', id: 'chair' }), 'chair').rotationDeg).toBe(90)
  })

  it('Sheltech A Veranda 1: a chair dragged toward the slider stops at its step-in strip and never into it', () => {
    const u = sheltechA as unknown as Unit
    const rooms = deriveRooms(u)
    const v1 = rooms.find((r) => r.name === 'Veranda 1')!
    const ps = furnish(u, rooms)
    const chair = ps.find((p) => p.roomId === v1.id && /chair/.test(p.assetId))!
    const m = movePiece(u, rooms, ps, chair.id, { x: chair.x, y: chair.y - GRID_M }, chair.rotationDeg)!
    expect(m.error).toBeNull()
    expect(m.piece.y).toBeLessThanOrEqual(chair.y + 1e-9) // on the 3" grid the preset chair already sits at the strip edge
    const zones = doorClearZones(v1, u)
    expect(zones.some((z) => quadsOverlap(z, pieceQuad(m.piece)))).toBe(false)
    // deeper than a foot into a zone: still refused
    expect(movePiece(u, rooms, ps, chair.id, { x: chair.x, y: chair.y - 3 * 0.3048 }, chair.rotationDeg)!.error).toBe('Blocks the door')
  })

  it('resizeAxes: structure none; an axis with min = max stays fixed', () => {
    expect(resizeAxes('stair_36')).toEqual([])
    expect(resizeAxes('sofa_3seat')).toEqual(['x'])
    expect(resizeAxes('potted_plant_01')).toEqual(['x', 'z', 'y'])
    expect(resizeAxes('wardrobe_2door')).toEqual(['x', 'z', 'y'])
    expect(resizeAxes('desk_oak')).toEqual(['x', 'z'])
  })

  it('entering or leaving the furniture tool clears the selection', () => {
    const s = reducer(reducer(fixture(), { type: 'select', ids: ['sofa'] }), { type: 'set-tool', tool: 'select' })
    expect(s.selection).toEqual([])
    expect(reducer({ ...s, selection: ['v1'] }, { type: 'set-tool', tool: 'wall' }).selection).toEqual(['v1'])
  })
})

describe('auto-trace import and its review list', () => {
  const plan = { dataUrl: 'data:,', naturalW: 2000, naturalH: 1400, name: 'plan-sheltech-l2.jpg' }
  const traced = () => {
    const before = run(traceRect(), { type: 'set-plan-image', image: plan })
    return { before, after: studioReducer(before, { type: 'auto-trace', result: mockTraceResult() }) }
  }

  it('the result becomes the unit in ONE undo step; undo restores the hand trace, redo the auto-trace', () => {
    const { before, after } = traced()
    const r = mockTraceResult()
    expect(after.unit.walls).toHaveLength(r.unit.walls.length)
    expect(after.unit.roomLabels).toHaveLength(r.unit.roomLabels.length)
    expect(after.unit.planImage).toMatchObject({ src: 'plan-sheltech-l2.jpg', pxPerM: r.unit.planImage!.pxPerM })
    expect(after.planImage).toBe(plan) // the image on screen stays
    expect(after.history.past).toHaveLength(before.history.past.length + 1)
    expect(after.history.future).toEqual([])
    const undone = studioReducer(after, { type: 'undo' })
    expect(undone.unit).toBe(before.unit)
    expect(openReview(undone)).toEqual([]) // the list belongs to the trace
    const redone = studioReducer(undone, { type: 'redo' })
    expect(redone.unit).toBe(after.unit)
    expect(openReview(redone)).toHaveLength(3)
  })

  it('stays editable like a hand trace: a corner moves, a label renames, both undo', () => {
    const { after } = traced()
    const v = after.unit.vertices[0]
    const moved = studioReducer(after, { type: 'move-vertex', id: v.id, x: v.x + 0.1, y: v.y })
    expect(moved.unit.vertices[0].x).toBeCloseTo(v.x + 0.1)
    const l = after.unit.roomLabels[0]
    const renamed = studioReducer(moved, { type: 'update-label', id: l.id, patch: { name: 'Guest bed' } })
    expect(renamed.unit.roomLabels[0].name).toBe('Guest bed')
    expect(run(renamed, { type: 'undo' }, { type: 'undo' }).unit).toBe(after.unit)
  })

  it('"looks right" dismisses a row; editing its entity closes a row; rows without an entity stay', () => {
    const { after } = traced()
    expect(openReview(after).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale'])
    const dismissed = studioReducer(after, { type: 'dismiss-review', id: 'r-open' })
    expect(openReview(dismissed).map((i) => i.id)).toEqual(['r-size', 'r-scale'])
    const win = after.unit.walls.flatMap((w) => w.openings).find((o) => o.kind === 'window')!
    const undismissed = studioReducer(after, { type: 'update-opening', id: win.id, patch: { kind: 'slider' } })
    expect(openReview(undismissed).map((i) => i.id)).toEqual(['r-size', 'r-scale']) // the opening was decided by editing it
    expect(openReview(studioReducer(undismissed, { type: 'undo' })).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale']) // undo re-opens it
  })

  it('a size-mismatch row re-checks itself: it stays (with the current figures) while the room differs from its printed size, and goes once it matches', () => {
    const { after } = traced()
    const dining = after.unit.roomLabels.find((l) => l.name === 'Dining')!
    // the hand trace's Dining main rectangle is 13'-10" × 16'-11", the plan prints 13'-11" × 17'-4" (its Living matches)
    expect(sizeCheck(after.unit, dining.id, deriveRooms(after.unit))).toEqual({ off: true, message: `Dining: drawn 13'-10" × 16'-11", printed 13'-11" × 17'-4"` })
    expect(openReview(after).find((i) => i.id === 'r-size')!.message).toBe(`Dining: drawn 13'-10" × 16'-11", printed 13'-11" × 17'-4"`)
    // renaming the label is not fixing the size: the row stays, reworded
    const renamed = studioReducer(after, { type: 'update-label', id: dining.id, patch: { name: 'Dining room' } })
    expect(openReview(renamed).find((i) => i.id === 'r-size')!.message).toBe(`Dining room: drawn 13'-10" × 16'-11", printed 13'-11" × 17'-4"`)
    // a printed size that still differs keeps it; the drawn size (either way round) closes it; no printed size = nothing to check
    expect(openReview(studioReducer(after, { type: 'update-label', id: dining.id, patch: { printedSize: "14'-4\" × 17'-4\"" } })).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale'])
    const fixed = studioReducer(after, { type: 'update-label', id: dining.id, patch: { printedSize: "16'-11\" × 13'-10\"" } })
    expect(openReview(fixed).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
    expect(openReview(studioReducer(fixed, { type: 'undo' })).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale'])
    expect(openReview(studioReducer(after, { type: 'update-label', id: dining.id, patch: { printedSize: '' } })).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
    // within 2" is the printed size
    expect(openReview(studioReducer(after, { type: 'update-label', id: dining.id, patch: { printedSize: "13'-9\" × 17'-0\"" } })).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
  })

  it('sheetAxis: the axis most wall length runs along, folded to ±45°', () => {
    const u = traced().after.unit
    expect(Math.abs(sheetAxis(u))).toBeLessThan(1e-6)
    const rot = (deg: number) => {
      const t = (deg * Math.PI) / 180
      return { ...u, vertices: u.vertices.map((v) => ({ ...v, x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) })) }
    }
    expect((sheetAxis(rot(7)) * 180) / Math.PI).toBeCloseTo(7, 6)
    expect((sheetAxis(rot(-30)) * 180) / Math.PI).toBeCloseTo(-30, 6)
    expect((sheetAxis(rot(90)) * 180) / Math.PI).toBeCloseTo(0, 6) // 90° = the same axes
    const a = drawnSize(rot(7), deriveRooms(rot(7))[0]), b = drawnSize(u, deriveRooms(u)[0]) // the size follows the sheet, not the page
    expect(a.w).toBeCloseTo(b.w, 9)
    expect(a.h).toBeCloseTo(b.h, 9)
  })

  it('the review list survives a draft restore; load-unit and reset drop it', () => {
    const { after } = traced()
    const d: Draft = { unit: after.unit, planImage: after.planImage, view: after.view, timer: after.timer, review: after.review }
    expect(openReview(studioReducer(initialState(), { type: 'restore', draft: d }))).toHaveLength(3)
    expect(studioReducer(after, { type: 'load-unit', unit: typeA as unknown as Unit }).review).toBeUndefined()
    expect(studioReducer(after, { type: 'reset' }).review).toBeUndefined()
  })

  it('the Studio key field writes the key the AI reader reads', () => expect(AI_KEY).toBe(AI_KEY_STORAGE))
})

describe('line a plan picture up with an existing drawing (S on a drawing with walls)', () => {
  it('two matched corners give the scale and where the picture sits', () => {
    const f = { pxPerM: 26.638, originPx: { x: 492.293, y: 140.708 } }
    const m1 = { x: -13.72, y: -2.06 }
    const m2 = { x: 14.15, y: 22.66 }
    const px = (m: { x: number; y: number }) => ({ x: f.originPx.x + m.x * f.pxPerM, y: f.originPx.y + m.y * f.pxPerM })
    const fit = fitSheet(px(m1), m1, px(m2), m2)!
    expect(fit.pxPerM).toBeCloseTo(f.pxPerM, 6)
    expect(fit.originPx.x).toBeCloseTo(f.originPx.x, 6)
    expect(fit.originPx.y).toBeCloseTo(f.originPx.y, 6)
    expect(fit.turnDeg).toBeCloseTo(0, 6)
    const s = reducer(initialState(), { type: 'set-scale', pxPerM: fit.pxPerM, originPx: fit.originPx })
    expect(s.unit.planImage?.originPx).toEqual(fit.originPx)
  })
  it('refuses corners too close together and reports a turned match', () => {
    expect(fitSheet({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 0 })).toBeNull()
    expect(fitSheet({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }, { x: 5, y: 0 })!.turnDeg).toBeCloseTo(90, 6)
  })
})

describe('O tool: the Glass wall pick', () => {
  it('the clicked wall becomes glass from end to end, floor to its top; another pick switches it off', () => {
    let s = reducer(traceRect(), { type: 'pick-opening', kind: 'window', glass: true })
    const w = s.unit.walls[0]
    s = reducer(s, { type: 'add-opening', wallId: w.id, t: 0.3 })
    const o = s.unit.walls.find((x) => x.id === w.id)!.openings[0]
    expect(o).toMatchObject({ kind: 'window', offsetM: 0, sillM: 0, heightM: w.heightM })
    expect(o.widthM).toBeCloseTo(4, 6)
    expect(reducer(s, { type: 'pick-opening', kind: 'door' }).glassPick).toBe(false)
  })
})
