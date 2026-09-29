import { describe, expect, it } from 'vitest'
import { deriveRooms, roomAt, roomInnerPolygon, validate, wallFrame } from '../core'
import type { Opening, Unit, Wall } from '../core'
import typeA from '../data/units/type-a.json'
import sheltechA from '../data/units/sheltech-a.json'
import { EXTERIOR_M, ISSUE_COPY, MERGE_M, PARTITION_M, guessKind, initialState, isUnit, normalizeUnit, reducer, slug, studioIssues, wallLabelSides, type Action, type Draft, type StudioState } from './model'
import { AI_KEY, drawnSize, openReview, sheetAxis, sizeCheck, studioReducer } from './review'
import { mockTraceResult } from './autotraceMock'
import { AI_KEY_STORAGE } from '../trace/ai'
import { snapMove, snapOpeningOffset } from './snap'
import { frameOf, mToPx, mToScreen, pxToM, screenToM } from './transform'
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

  it('normalizeUnit: an old export\'s hingeless door ≥ 1.2 m (it rendered as a slider) becomes a slider; nothing else changes', () => {
    const op = (id: string, widthM: number, hinge?: 'a') => ({ id, kind: 'door' as const, offsetM: 0, widthM, heightM: 2.1, sillM: 0, ...(hinge ? { hinge } : {}) })
    const raw = {
      name: 'x',
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 9, y: 0 }],
      walls: [{ id: 'w', a: 'a', b: 'b', openings: [op('wide', 1.5), op('hinged', 1.5, 'a'), op('narrow', 0.9), { ...op('win', 1.5), kind: 'window' }] }],
    }
    expect(normalizeUnit(raw as unknown as Unit).walls[0].openings.map((o) => o.kind)).toEqual(['slider', 'door', 'door', 'window'])
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

  it('a corner dragged onto a wall mid-span T-splits it (was: "Walls cross")', () => {
    let s = poly([[0, 0], [4, 0], [4, 3], [0, 3]], [[2, 1], [2, 2]]) // a loose stub inside
    const tip = at(s, 2, 2)!
    s = run(s, { type: 'drag-begin' }, { type: 'drag', vertices: [{ id: tip.id, x: 2, y: 3 }] }, { type: 'drag-end', ids: [tip.id] })
    expect(s.unit.walls.filter((w) => w.a === tip.id || w.b === tip.id)).toHaveLength(3)
    expect(issues(s).filter((c) => c.includes('walls-intersect'))).toEqual([])
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
    const living = after.unit.roomLabels.find((l) => l.name === 'Living')!
    // the hand trace's Living is 13'-6" × 16'-3" inside, the plan prints 13'-6" × 16'-0"
    expect(sizeCheck(after.unit, living.id, deriveRooms(after.unit))).toEqual({ off: true, message: `Living: drawn 13'-6" × 16'-3", printed 13'-6" × 16'-0"` })
    expect(openReview(after).find((i) => i.id === 'r-size')!.message).toBe(`Living: drawn 13'-6" × 16'-3", printed 13'-6" × 16'-0"`)
    // renaming the label is not fixing the size: the row stays, reworded
    const renamed = studioReducer(after, { type: 'update-label', id: living.id, patch: { name: 'Living room' } })
    expect(openReview(renamed).find((i) => i.id === 'r-size')!.message).toBe(`Living room: drawn 13'-6" × 16'-3", printed 13'-6" × 16'-0"`)
    // a printed size that still differs keeps it; the drawn size (either way round) closes it; no printed size = nothing to check
    expect(openReview(studioReducer(after, { type: 'update-label', id: living.id, patch: { printedSize: "14'-4\" × 16'-0\"" } })).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale'])
    const fixed = studioReducer(after, { type: 'update-label', id: living.id, patch: { printedSize: "16'-3\" × 13'-6\"" } })
    expect(openReview(fixed).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
    expect(openReview(studioReducer(fixed, { type: 'undo' })).map((i) => i.id)).toEqual(['r-size', 'r-open', 'r-scale'])
    expect(openReview(studioReducer(after, { type: 'update-label', id: living.id, patch: { printedSize: '' } })).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
    // within 2" is the printed size
    expect(openReview(studioReducer(after, { type: 'update-label', id: living.id, patch: { printedSize: "13'-5\" × 16'-2\"" } })).map((i) => i.id)).toEqual(['r-open', 'r-scale'])
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
