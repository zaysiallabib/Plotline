/**
 * The Studio makes what the hand-authored levels show (session 19, lane D): zone / common-room kinds, wall types picked
 * before placing (wall, low wall, kerb, zone line), walls that stand alone, floor levels and ramps on a label, columns
 * (C tool), the island fix. Reducer rules only — the canvas and panel just dispatch these.
 */
import { describe, expect, it } from 'vitest'
import { FT, deriveRooms, roomAt } from '../core'
import type { Unit, Vertex, Wall } from '../core'
import { GROUND_SAMPLE } from '../data/fixtures/ground-sample'
import { alignColumns } from '../data/building/projects'
import {
  KERB_M,
  PARTITION_M,
  PILLAR_M,
  WALL_HEIGHT_M,
  ZONE_LINE_M,
  emptyUnit,
  findEntity,
  formatLevel,
  guessKind,
  initialState,
  openingAt,
  parseLevel,
  rampArrow,
  rampDirs,
  reducer,
  snapRampDir,
  studioIssues,
  wallTypeOf,
  type Action,
  type StudioState,
} from './model'
import { studioReducer } from './review'
import { KEEP, fixesOf, issueKey, markIssues } from './issues'

const TOL = 0.05
const run = (s: StudioState, ...actions: Action[]) => actions.reduce(reducer, s)
const scaled = () => reducer(initialState(), { type: 'set-scale', pxPerM: 100 })
const at = (x: number, y: number) => ({ x, y, tolM: TOL })
const v = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const w = (id: string, a: string, b: string, heightM = 3.048): Wall => ({ id, a, b, thicknessM: 0.127, heightM, openings: [] })
const marked = (u: Unit) => {
  const rooms = deriveRooms(u)
  const issues = studioIssues(u, rooms)
  const marks = markIssues(u, rooms, issues)
  return { issues, marks, fixes: fixesOf(u, marks, issues) }
}
/** a 4 × 3 m rectangle drawn as one chain, back to its start */
const rect = (s: StudioState, x = 0, y = 0) =>
  run(s, { type: 'chain-start', at: at(x, y) }, { type: 'chain-add', at: at(x + 4, y) }, { type: 'chain-add', at: at(x + 4, y + 3) }, { type: 'chain-add', at: at(x, y + 3) }, { type: 'chain-add', at: at(x, y) })

describe('kinds: what a typed name guesses', () => {
  it('common rooms and outdoor zones; a lift lobby and drivers\' waiting stay "other"', () => {
    const cases: [string, string][] = [
      ['Lobby', 'lobby'], ['Reception', 'lobby'], ['Main lobby', 'lobby'], ['Gym', 'gym'], ['Community hall', 'community'], ['Guard room', 'guard'],
      ['Lawn', 'lawn'], ['Roof garden', 'lawn'], ['Driveway', 'driveway'], ['Ramp', 'driveway'], ['Car ramp 1:8', 'driveway'], ['Parking', 'parking'],
      ['1', 'parking'], ['12', 'parking'], ['P-3', 'parking'], ['Deck', 'deck'], ['Pool', 'pool'], ['Water body', 'pool'], ['Planter', 'planter'],
      ['Play area', 'play'], ['Pavers', 'paving'], ['Lift Lobby', 'other'], ["Drivers' waiting", 'other'], ['Bed-1', 'bed'], ['Toilet', 'bath'],
    ]
    expect(cases.map(([n]) => [n, guessKind(n)])).toEqual(cases)
  })

  it('a lobby door onto its lawn is the level\'s entry (no "no entry door"); the ground sample loads with no mark', () => {
    // (its 4' door with no hinge reads as a slider in an old export: given one, it is the hinged entry door)
    const walls = GROUND_SAMPLE.walls.map((x) => ({ ...x, openings: x.openings.map((o) => ({ ...o, hinge: 'a' as const, swing: 'in' as const })) }))
    const u = reducer(initialState(), { type: 'load-unit', unit: { ...GROUND_SAMPLE, walls, planImage: { src: '', pxPerM: 50, originPx: { x: 0, y: 0 } } } }).unit
    expect(marked(u).marks).toEqual([])
    const indoors: Unit = { ...u, roomLabels: u.roomLabels.map((l) => (l.kind === 'lawn' ? { ...l, kind: 'bed' as const } : l)) }
    expect(studioIssues(indoors, deriveRooms(indoors)).map((i) => i.code)).toContain('no-entry-door') // a door between two rooms is no entry
  })
})

describe('wall types: picked before placing, remembered until changed', () => {
  it('a chain draws walls of the picked type; the pick stays for the next chain; a pick mid-chain changes the next walls', () => {
    let s = run(scaled(), { type: 'pick-wall', wall: 'zone' }, { type: 'chain-start', at: at(0, 0) }, { type: 'chain-add', at: at(3, 0) }, { type: 'chain-end' })
    expect(s.unit.walls.map((x) => [x.heightM, x.thicknessM])).toEqual([[0, ZONE_LINE_M]])
    s = run(s, { type: 'chain-start', at: at(0, 2) }, { type: 'chain-add', at: at(3, 2) }, { type: 'pick-wall', wall: 'kerb' }, { type: 'chain-add', at: at(3, 4) }, { type: 'pick-wall', wall: 'low' }, { type: 'chain-add', at: at(0, 4) }, { type: 'pick-wall', wall: 'wall' }, { type: 'chain-add', at: at(0, 6) })
    expect(s.unit.walls.slice(1).map((x) => [x.heightM, x.thicknessM])).toEqual([[0, ZONE_LINE_M], [0.15, PARTITION_M], [1.1, PARTITION_M], [WALL_HEIGHT_M, PARTITION_M]])
    expect(s.wallType).toBe('wall')
    expect(initialState().wallType).toBeUndefined() // = 'wall'
    expect(rect(scaled()).unit.walls.every((x) => x.heightM === WALL_HEIGHT_M)).toBe(true)
  })

  it('wallTypeOf reads a height: 0 zone line, ≤ 0.2 kerb, under 2 m low wall', () => {
    expect([0, 0.1, KERB_M, 0.45, 1.1, 1.99, 2.1, WALL_HEIGHT_M].map(wallTypeOf)).toEqual(['zone', 'kerb', 'kerb', 'low', 'low', 'low', 'wall', 'wall'])
  })

  it('a zone line or a kerb takes no opening (the O tool refuses with its reason); a low wall with one becomes full height', () => {
    const s = run(scaled(), { type: 'pick-wall', wall: 'zone' }, { type: 'chain-start', at: at(0, 0) }, { type: 'chain-add', at: at(3, 0) }, { type: 'pick-wall', wall: 'kerb' }, { type: 'chain-add', at: at(3, 3) }, { type: 'pick-wall', wall: 'low' }, { type: 'chain-add', at: at(6, 3) })
    const [zone, kerb, low] = s.unit.walls
    expect(openingAt(s.unit, zone, 0.5, 'door', 0, []).error).toBe('A zone line takes no doors or windows (it is not a wall)')
    const t = reducer(s, { type: 'add-opening', wallId: zone.id, t: 0.5, kind: 'door' })
    expect(t.unit).toBe(s.unit)
    expect(t.toast?.text).toBe('A zone line takes no doors or windows (it is not a wall)')
    expect(reducer(s, { type: 'add-opening', wallId: kerb.id, t: 0.5, kind: 'passage' }).toast?.text).toMatch(/^A kerb takes no doors or windows/)
    expect(reducer(s, { type: 'add-opening', wallId: low.id, t: 0.5, kind: 'window' }).unit.walls[2].heightM).toBe(WALL_HEIGHT_M)
  })

  it('set-wall-type on selected walls: one undo; a zone line 0.05 thin, back to a partition out of it; refused onto a zone line while it has openings', () => {
    let s = rect(scaled())
    const ids = s.unit.walls.map((x) => x.id)
    const n = s.history.past.length
    s = reducer(s, { type: 'set-wall-type', ids: ids.slice(0, 2), wall: 'zone' })
    expect(s.unit.walls.map((x) => [x.heightM, x.thicknessM])).toEqual([[0, ZONE_LINE_M], [0, ZONE_LINE_M], [WALL_HEIGHT_M, PARTITION_M], [WALL_HEIGHT_M, PARTITION_M]])
    expect(s.history.past).toHaveLength(n + 1)
    s = reducer(s, { type: 'set-wall-type', ids: [ids[0]], wall: 'kerb' })
    expect(s.unit.walls[0]).toMatchObject({ heightM: 0.15, thicknessM: PARTITION_M })
    s = reducer(s, { type: 'add-opening', wallId: ids[2], t: 0.5, kind: 'door' })
    const t = reducer(s, { type: 'set-wall-type', ids: [ids[2]], wall: 'zone' })
    expect(t.unit).toBe(s.unit)
    expect(t.toast?.text).toMatch(/^Remove its doors \/ windows first/)
    expect(reducer(s, { type: 'update-wall', id: ids[2], patch: { heightM: 0 } }).unit).toBe(s.unit) // the typed height too
    expect(reducer(s, { type: 'update-wall', id: ids[3], patch: { heightM: 0 } }).unit.walls[3].heightM).toBe(0)
  })
})

describe('walls that stand alone', () => {
  it('the toggle on selected walls: on / off, one undo each, no `standsAlone: undefined` left behind', () => {
    let s = rect(scaled())
    const id = s.unit.walls[0].id
    const n = s.history.past.length
    s = reducer(s, { type: 'stand-alone', ids: [id], on: true })
    expect(s.unit.walls[0].standsAlone).toBe(true)
    expect(reducer(s, { type: 'stand-alone', ids: [id], on: true })).toBe(s) // nothing to change
    s = reducer(s, { type: 'stand-alone', ids: [id], on: false })
    expect('standsAlone' in s.unit.walls[0]).toBe(false)
    expect(s.history.past).toHaveLength(n + 2)
  })

  it('a screen drawn as a chain in the open (both ends free): "Keep" on either end keeps the whole chain, one click, one undo; its marks go', () => {
    const s = run(rect(scaled()), { type: 'pick-wall', wall: 'low' }, { type: 'chain-start', at: at(6, 0) }, { type: 'chain-add', at: at(8, 0) }, { type: 'chain-add', at: at(8, 2) }, { type: 'chain-add', at: at(10, 2) }, { type: 'chain-end' })
    const { marks, fixes } = marked(s.unit)
    const loose = marks.filter((m) => m.issue?.code === 'dangling-vertex')
    expect(loose).toHaveLength(2)
    const f = fixes.get(loose[0].key)!.fixes.find((x) => x.label === KEEP)!
    const t = studioReducer(s, { type: 'apply-fix', actions: f.actions, label: f.label })
    expect(t.history.past).toHaveLength(s.history.past.length + 1)
    expect(t.unit.walls.filter((x) => x.heightM === 1.1).map((x) => x.standsAlone)).toEqual([true, true, true])
    expect(marked(t.unit).marks.filter((m) => m.issue?.code === 'dangling-vertex')).toEqual([])
    expect(t.unit.walls.filter((x) => x.heightM !== 1.1).some((x) => x.standsAlone)).toBe(false) // the room's walls untouched
  })

  it('a fin off a room: Keep takes its run up to the junction, never the room', () => {
    let s = rect(scaled())
    s = run(s, { type: 'chain-start', at: at(4, 1.5) }, { type: 'chain-add', at: at(5.5, 1.5) }, { type: 'chain-add', at: at(5.5, 2.5) }, { type: 'chain-end' })
    const { marks, fixes } = marked(s.unit)
    const m = marks.find((x) => x.issue?.code === 'dangling-vertex')!
    const f = fixes.get(m.key)!.fixes.find((x) => x.label === KEEP)!
    expect(f.actions).toEqual([{ type: 'stand-alone', ids: expect.any(Array), on: true }])
    const ids = (f.actions[0] as { ids: string[] }).ids
    const fin = s.unit.walls.filter((x) => [x.a, x.b].some((id) => s.unit.vertices.find((p) => p.id === id)!.x > 4.01))
    expect(ids.sort()).toEqual(fin.map((x) => x.id).sort())
  })
})

describe('floor levels and ramps on a label', () => {
  it('parseLevel reads a printed level, signed; formatLevel prints it back', () => {
    const lv = (t: string) => parseLevel(t)
    expect(lv(`+3'-6"`)).toBeCloseTo(3.5 * FT)
    expect(lv(`-1'-6"`)).toBeCloseTo(-1.5 * FT)
    expect(lv(`−10'`)).toBeCloseTo(-10 * FT)
    expect(lv('-1.5m')).toBeCloseTo(-1.5)
    expect([lv('±0'), lv('0'), lv(''), lv('  '), lv('abc')]).toEqual([0, 0, undefined, undefined, null])
    expect([3.5 * FT, -10 * FT, 0, 0.001].map(formatLevel)).toEqual([`+3'-6"`, `−10'-0"`, '±0', '±0'])
  })

  it('a level and a ramp on a label: derived onto the room, cleared without leaving `undefined`, kept through export → re-open', () => {
    let s = rect(scaled())
    s = reducer(s, { type: 'add-label', label: { name: 'Ramp', kind: guessKind('Ramp'), x: 2, y: 1.5, levelM: 0 } })
    const id = s.selection[0]
    s = reducer(s, { type: 'update-label', id, patch: { slope: { toLevelM: -1.5, dirDeg: 90 } } })
    expect(deriveRooms(s.unit)[0]).toMatchObject({ kind: 'driveway', levelM: 0, slope: { toLevelM: -1.5, dirDeg: 90 } })
    const back = reducer(initialState(), { type: 'load-unit', unit: JSON.parse(JSON.stringify(s.unit)) }).unit
    expect(back.roomLabels).toEqual(s.unit.roomLabels)
    s = reducer(s, { type: 'update-label', id, patch: { levelM: undefined, slope: undefined } })
    expect(s.unit.roomLabels[0]).toEqual({ id, name: 'Ramp', kind: 'driveway', x: 2, y: 1.5 })
  })

  it('the four quick directions follow the zone\'s longest edge; a dragged arrow snaps to an edge direction (8°), else 5°', () => {
    const s = rect(scaled())
    const r = deriveRooms(s.unit)[0]
    expect(rampDirs(r, s.unit)).toEqual([0, 90, 180, 270])
    expect([snapRampDir(r, s.unit, 94), snapRampDir(r, s.unit, 77), snapRampDir(r, s.unit, 357)]).toEqual([90, 75, 0])
    // a zone turned 30°: its directions turn with it
    const k = Math.PI / 6
    const rot = (p: { x: number; y: number }) => ({ x: p.x * Math.cos(k) - p.y * Math.sin(k), y: p.x * Math.sin(k) + p.y * Math.cos(k) })
    const u = { ...s.unit, vertices: s.unit.vertices.map((p) => ({ ...p, ...rot(p) })) }
    expect(rampDirs(deriveRooms(u)[0], u).map((d) => Math.round(d))).toEqual([30, 120, 210, 300])
  })

  it('the arrow runs through the label across the zone, tail to head along its direction', () => {
    const s = rect(scaled())
    const r = deriveRooms(s.unit)[0]
    const a = rampArrow(r, s.unit, { x: 2, y: 1.5 }, 90) // → plan right
    expect(a.from.x).toBeCloseTo(0.6)
    expect(a.to.x).toBeCloseTo(3.4)
    expect([a.from.y, a.to.y]).toEqual([1.5, 1.5])
    expect(rampArrow(r, s.unit, { x: 2, y: 1.5 }, 0).to.y).toBeCloseTo(0.45) // ↑ = plan-up (−y)
  })

  it('aim-ramp is a drag step: no undo entry of its own; drag-begin + aims = one undo', () => {
    let s = rect(scaled())
    s = reducer(s, { type: 'add-label', label: { name: 'Ramp', kind: 'driveway', x: 2, y: 1.5, slope: { toLevelM: -1, dirDeg: 0 } } })
    const id = s.selection[0]
    const n = s.history.past.length
    const t = run(s, { type: 'drag-begin' }, { type: 'aim-ramp', id, dirDeg: 45 }, { type: 'aim-ramp', id, dirDeg: 90 })
    expect(t.unit.roomLabels[0].slope).toEqual({ toLevelM: -1, dirDeg: 90 })
    expect(t.history.past).toHaveLength(n + 1)
    expect(reducer(t, { type: 'undo' }).unit).toBe(s.unit)
  })
})

describe('columns (the C tool)', () => {
  it('add (selected, 0.1 m at least), move / resize (live = no undo entry), nudge, delete; export → re-open keeps them', () => {
    let s = rect(scaled())
    s = reducer(s, { type: 'add-pillar', x: 2, y: 0, ...PILLAR_M })
    const id = s.selection[0]
    expect(s.unit.pillars).toEqual([{ id, x: 2, y: 0, wM: FT, hM: (20 / 12) * FT }])
    expect(findEntity(s.unit, id)).toEqual({ kind: 'pillar', p: s.unit.pillars![0] })
    const n = s.history.past.length
    s = run(s, { type: 'drag-begin' }, { type: 'set-pillar', id, patch: { x: 2.5 }, live: true }, { type: 'set-pillar', id, patch: { wM: 0.01 }, live: true })
    expect(s.unit.pillars![0]).toMatchObject({ x: 2.5, wM: 0.1 })
    expect(s.history.past).toHaveLength(n + 1)
    s = reducer(s, { type: 'set-pillar', id, patch: { hM: 0.6 } })
    expect(s.history.past).toHaveLength(n + 2)
    s = reducer(s, { type: 'nudge', dx: 0.0254, dy: 0 })
    expect(s.unit.pillars![0].x).toBeCloseTo(2.5254)
    const back = reducer(initialState(), { type: 'load-unit', unit: JSON.parse(JSON.stringify(s.unit)) }).unit
    expect(back.pillars).toEqual(s.unit.pillars)
    expect(deriveRooms(back)).toHaveLength(1) // a column changes no room
    s = reducer(s, { type: 'delete' })
    expect(s.unit.pillars).toEqual([])
  })

  it("hand-drawn columns place a level on the flats' columns (Building → stage-2 placement)", () => {
    const flats = [[0, 0], [6, 0], [0, 5], [6, 5]].map(([x, y], i) => ({ id: `f${i}`, x, y, ...PILLAR_M }))
    let s = scaled()
    for (const [x, y] of [[1, 1], [7, 1], [1, 6], [7, 6]]) s = reducer(s, { type: 'add-pillar', x, y, ...PILLAR_M })
    expect(alignColumns(flats, s.unit.pillars!)).toMatchObject({ offset: { x: -1, y: -1 }, matched: 4 })
  })
})

describe('an island in a zone', () => {
  it('a closed lobby inside a lawn: a mark, and "Join with a zone line" makes the lawn go round it — one undo', () => {
    let s = scaled()
    s = run(s, { type: 'chain-start', at: at(0, 0) }, { type: 'chain-add', at: at(10, 0) }, { type: 'chain-add', at: at(10, 10) }, { type: 'chain-add', at: at(0, 10) }, { type: 'chain-add', at: at(0, 0) })
    s = rect(s, 4, 4)
    s = run(s, { type: 'add-label', label: { name: 'Lawn', kind: 'lawn', x: 1, y: 1 } }, { type: 'add-label', label: { name: 'Lobby', kind: 'lobby', x: 6, y: 5.5, levelM: 1.067 } })
    const { marks, fixes, issues } = marked(s.unit)
    const m = marks.find((x) => x.issue?.code === 'island-in-room')!
    expect(m).toMatchObject({ severity: 'amber', message: 'Walls stand inside a room joined to nothing (its floor runs under them) — join them with a zone line' })
    const f = fixes.get(m.key)!.fixes
    expect(f.map((x) => x.label)).toEqual(['Join with a zone line'])
    expect(f[0].ghost).toEqual([{ kind: 'line', from: { x: 8, y: 7 }, to: { x: 10, y: 10 } }]) // the nearest corners
    const t = studioReducer(s, { type: 'apply-fix', actions: f[0].actions, label: f[0].label })
    expect(t.history.past).toHaveLength(s.history.past.length + 1)
    expect(t.unit.walls.filter((x) => x.heightM === 0).map((x) => x.thicknessM)).toEqual([ZONE_LINE_M])
    const after = studioIssues(t.unit, deriveRooms(t.unit)).map(issueKey)
    expect(after.filter((k) => !issues.map(issueKey).includes(k))).toEqual([])
    expect(after.some((k) => k.startsWith('island-in-room'))).toBe(false)
    const rooms = deriveRooms(t.unit)
    expect(roomAt({ x: 6, y: 5.5 }, rooms, t.unit)).toMatchObject({ kind: 'lobby', levelM: 1.067 })
    expect(rooms.find((r) => r.kind === 'lawn')!.areaSqm).toBeCloseTo(100 - 12, 1)
    expect(t.wallType).toBeUndefined() // the fix never changes his W pick
    expect(studioReducer(t, { type: 'undo' }).unit).toBe(s.unit)
  })

  it('a ring inside a ring inside a plot: two marks; the outer ring joined first (the inner one joined to it alone would still be an island), then the inner', () => {
    const u: Unit = {
      ...emptyUnit(),
      planImage: { src: '', pxPerM: 100, originPx: { x: 0, y: 0 } },
      vertices: [v('a', 0, 0), v('b', 10, 0), v('c', 10, 10), v('d', 0, 10), v('i1', 4, 4), v('i2', 6, 4), v('i3', 6, 6), v('i4', 4, 6), v('o1', 3, 3), v('o2', 7, 3), v('o3', 7, 7), v('o4', 3, 7)],
      walls: [w('ab', 'a', 'b'), w('bc', 'b', 'c'), w('cd', 'c', 'd'), w('da', 'd', 'a'), w('i12', 'i1', 'i2'), w('i23', 'i2', 'i3'), w('i34', 'i3', 'i4'), w('i41', 'i4', 'i1'), w('o12', 'o1', 'o2'), w('o23', 'o2', 'o3'), w('o34', 'o3', 'o4'), w('o41', 'o4', 'o1')],
      roomLabels: [],
    }
    const islands = (x: Unit) => {
      const m = marked(x)
      return m.marks.filter((k) => k.issue?.code === 'island-in-room').map((k) => m.fixes.get(k.key)?.fixes[0])
    }
    const [inner, outer] = islands(u)
    expect(inner).toBeUndefined()
    expect(outer!.ghost).toEqual([{ kind: 'line', from: { x: 3, y: 3 }, to: { x: 0, y: 0 } }])
    const t = studioReducer({ ...initialState(), unit: u }, { type: 'apply-fix', actions: outer!.actions, label: outer!.label })
    const [next] = islands(t.unit)
    expect(next!.ghost).toEqual([{ kind: 'line', from: { x: 4, y: 4 }, to: { x: 3, y: 3 } }])
    expect(islands(studioReducer(t, { type: 'apply-fix', actions: next!.actions, label: next!.label }).unit)).toEqual([])
  })
})
