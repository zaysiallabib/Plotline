/**
 * Level 5 (founder 2026-10-09: "the person fixes the rest in seconds"): the rooms printed on the sheet against the
 * draft as it stands — the count line, one row per printed name with no closed, named room, and its one-click fix.
 */
import { describe, expect, it } from 'vitest'
import { deriveFlats, deriveRooms } from '../core'
import type { Unit, Vertex, Wall } from '../core'
import type { PrintedRoom, ReviewItem } from '../trace/types'
import { emptyUnit, initialState, reducer, studioIssues, type StudioState } from './model'
import { fixesOf, markIssues, rowAnswers, type Fix } from './issues'
import { fewRooms, openReview, roomCount, roomRows, roomStates, studioReducer } from './review'
import { saysLevel } from '../trace/solve'

const v = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const w = (id: string, a: string, b: string, heightM = 3.048): Wall => ({ id, a, b, thicknessM: 0.127, heightM, openings: [] })
const unit = (vs: Vertex[], ws: Wall[], labels: Unit['roomLabels'] = []): Unit => ({ ...emptyUnit(), id: 'u', planImage: { src: 'p', pxPerM: 100, originPx: { x: 0, y: 0 } }, vertices: vs, walls: ws, roomLabels: labels })
/** a 4 × 3 m box cut at x = `cut` into two rooms, the left one named Bed 1 */
const twoRooms = (cut = 2, right: Unit['roomLabels'] = []) =>
  unit(
    [v('a', 0, 0), v('b', 4, 0), v('c', 4, 3), v('d', 0, 3), v('p', cut, 0), v('q', cut, 3)],
    [w('t1', 'a', 'p'), w('t2', 'p', 'b'), w('r', 'b', 'c'), w('b1', 'c', 'q'), w('b2', 'q', 'd'), w('l', 'd', 'a'), w('mid', 'p', 'q')],
    [{ id: 'bed', name: 'Bed 1', kind: 'bed', x: cut / 2, y: 1.5 }, ...right],
  )
const P = (name: string, x: number, y: number, kind = 'other'): PrintedRoom => ({ name, at: { x, y }, kind })

/** the fixes the Studio offers on review row `item` (its mark's, as StudioApp computes them) */
function fixesFor(u: Unit, item: ReviewItem, printed: PrintedRoom[]) {
  const rooms = deriveRooms(u)
  const issues = studioIssues(u, rooms)
  const m = markIssues(u, rooms, issues, [item]).find((x) => x.review)!
  return fixesOf(u, [m], issues, printed).get(m.key)?.fixes ?? []
}
const apply = (s: StudioState, f: Fix) => studioReducer(s, { type: 'apply-fix', actions: f.actions, label: f.label })

describe('room count and room rows', () => {
  it('a printed name is done on its room, unnamed beside an unnamed room, open in none — the count line says which', () => {
    const u = twoRooms()
    const printed = [P('Bed 1', 1, 1.5, 'bed'), P('Toilet', 3, 3.4, 'bath'), P('Ver', 9, 1.5, 'balcony')]
    const st = roomStates(u, deriveRooms(u), printed)
    expect(st.map((x) => x.s)).toEqual(['done', 'unnamed', 'open'])
    expect(st[1].s === 'unnamed' && st[1].d).toBeCloseTo(0.4, 1)
    expect(roomCount(u, deriveRooms(u), { printed, wantSqm: 20 } as never)).toMatch(/^1 of the 3 room names read on the sheet are closed and named — missing: Toilet, Ver\. But the closed rooms add up to only 129 sft of about 215 — the sheet prints more rooms than were found\.$/)
    expect(roomRows(u, deriveRooms(u), printed).map((r) => r.message)).toEqual(['Space 1 — printed name Toilet is 0.4 m away', 'Ver is open — no closed room around its name'])
  })

  it('Level 4: per traced flat — one count line each (its names, its rooms against its printed area), the rows say which flat, "Name it" puts the room in its flat', () => {
    // the box's two rooms as two flats: Bed 1 pinned to Type A, the unnamed one to Flat 1
    const u = twoRooms()
    u.roomLabels = [{ ...u.roomLabels[0], flat: 'Type A' }, { id: 'sp', name: 'Space 1', kind: 'other', x: 3, y: 1.5, flat: 'Flat 1' }]
    const printed = [{ ...P('Bed 1', 1, 1.5, 'bed'), flat: 'Type A' }, { ...P('Toilet', 3, 3.4, 'bath'), flat: 'Flat 1' }, { ...P('Ver', 9, 1.5, 'balcony'), flat: 'Flat 1' }]
    const rooms = deriveRooms(u)
    const stats = { printed, flats: [{ name: 'Type A', wantSqm: 20 }, { name: 'Flat 1' }] } as never
    expect(roomCount(u, rooms, stats, deriveFlats(u, rooms))?.split('\n')).toEqual([
      'Type A: all 1 room names read on it are closed and named. But its closed rooms add up to only 65 sft of about 215 — the sheet prints more rooms than were found.',
      'Flat 1: 0 of the 2 room names read on it are closed and named — missing: Toilet, Ver. Its closed rooms add up to 65 sft; no printed flat area was read on it.',
    ])
    expect(roomRows(u, rooms, printed).map((r) => r.message)).toEqual(['Flat 1: Space 1 — printed name Toilet is 0.4 m away', 'Flat 1: Ver is open — no closed room around its name'])
    const row = roomRows(u, rooms, printed)[0]
    const [f] = fixesFor(u, row, printed)
    const t = apply({ ...initialState(), unit: u, review: { unitId: 'u', items: [row], stats } }, f)
    expect(t.unit.roomLabels.find((l) => l.name === 'Toilet')?.flat).toBe('Flat 1')
  })

  it('s25 #6: "all N names closed" never hides a flat whose closed rooms fall under 70 % of its printed area', () => {
    const u = twoRooms()
    u.roomLabels[0].flat = 'Type A'
    const rooms = deriveRooms(u)
    const printed = [{ ...P('Bed 1', 1, 1.5, 'bed'), flat: 'Type A' }]
    const line = (wantSqm: number) => roomCount(u, rooms, { printed, flats: [{ name: 'Type A', wantSqm }] } as never, deriveFlats(u, rooms))
    // Bed 1's 6 m² (65 sft): 7 m² printed (75 sft, 86 %) keeps the wording; 9 m² (97 sft, 67 %) says rooms were not found
    expect(line(7)).toBe('Type A: all 1 room names read on it are closed and named. Its closed rooms add up to 65 sft; the printed flat area gives about 75.')
    expect(line(9)).toBe('Type A: all 1 room names read on it are closed and named. But its closed rooms add up to only 65 sft of about 97 — the sheet prints more rooms than were found.')
  })

  it('Level 4: a printed name inside the core\'s room (the lifts\' face left open around a toilet) is not closed — it shares the lift\'s room', () => {
    const u = twoRooms(2, [{ id: 'lift', name: 'Lift', kind: 'other', x: 3, y: 1.5 }])
    const st = roomStates(u, deriveRooms(u), [P('Toilet 2', 3, 2.5, 'bath')])
    expect(st.map((x) => (x.s === 'merged' ? `merged into ${x.into.name}` : x.s))).toEqual(['merged into Lift'])
  })

  it('s25 #13: few rooms closed says what happened — "ground floor" only when the sheet says so (PARKING / RAMP, a lobby alone)', () => {
    const banani = { walls: 8, labelled: 1, rooms: 1, printed: [P('Bed 04', 1, 1, 'bed'), P('Kitchen', 2, 1, 'kitchen')] } as never
    expect(fewRooms(banani)).toBe('Auto-trace found only 8 walls and 1 room. Walls drawn grey, hollow or as thin lines are not yet read well; draw the missing walls with W, or trace one flat with a click.')
    // no names read at all (Amabilia's grey walls): still never "ground floor" from the count
    expect(fewRooms({ walls: 13, labelled: 0, rooms: 0 } as never)).toMatch(/^Auto-trace found only 13 walls and 0 rooms\./)
    expect(fewRooms({ walls: 3, labelled: 0, rooms: 0, level: true } as never)).toMatch(/^Auto-trace is made for flats\. On a ground floor/)
    expect(fewRooms({ labelled: 5, rooms: 5 } as never)).toBeNull()
    // what makes `level`: the sheet's own words
    expect(saysLevel(['CAR PARKING', 'RAMP UP'], [P('Guard Toilet', 1, 1, 'bath')])).toBe(true)
    expect(saysLevel(['LIFT LOBBY'], [])).toBe(true)
    expect(saysLevel(['CAR PARKING'], [P('Bed 1', 1, 1, 'bed')])).toBe(false) // a flat sheet's note on parking
    expect(saysLevel(['LIFT LOBBY', 'KITCHEN'], [P('Kitchen', 1, 1, 'kitchen')])).toBe(false) // a flat sheet's lift lobby
  })

  it('Level 3: a printed name standing inside an unnamed room after the import names it — no row; one only beside it keeps its row', () => {
    const traced = (printed: PrintedRoom[]) =>
      studioReducer(initialState(), { type: 'auto-trace', result: { unit: twoRooms(), review: [], stats: { ms: 1, pxPerM: 100, scaleFrom: 'given', walls: 7, rooms: 2, labelled: 1, printed } } as never })
    const inside = traced([P('Bed 1', 1, 1.5, 'bed'), { ...P('Toilet', 3, 1.5, 'bath'), printedSize: `9'-0" × 9'-0"` }])
    const toilet = deriveRooms(inside.unit).find((r) => r.name === 'Toilet')!
    expect(toilet.kind).toBe('bath')
    expect(inside.unit.roomLabels.find((l) => l.id === toilet.id)!.printedSize).toBe(`9'-0" × 9'-0"`)
    // its printed size is checked live: the 2 × 3 m room (inside its walls) is not 9' × 9', so the size row shows (and only that row)
    expect(openReview(inside).map((i) => i.message)).toEqual([`Toilet: drawn 6'-2" × 9'-5", printed 9'-0" × 9'-0"`])
    const beside = traced([P('Bed 1', 1, 1.5, 'bed'), P('Toilet', 3, 3.4, 'bath')])
    expect(openReview(beside).map((i) => i.message)).toEqual(['Space 1 — printed name Toilet is 0.4 m away'])
  })

  it('"Name it" names the unnamed room as printed; the row and the count follow the unit, not the trace', () => {
    const u = twoRooms()
    const printed = [P('Bed 1', 1, 1.5, 'bed'), P('Toilet', 3, 3.4, 'bath')]
    const rows = roomRows(u, deriveRooms(u), printed)
    const s: StudioState = { ...initialState(), unit: u, review: { unitId: 'u', items: rows, stats: { printed } as never } }
    expect(openReview(s)).toHaveLength(1)
    const [f] = fixesFor(u, rows[0], printed)
    expect(f.label).toBe('Name it Toilet')
    const t = apply(s, f)
    const room = deriveRooms(t.unit).find((r) => r.name === 'Toilet')!
    expect(room.kind).toBe('bath')
    expect(openReview(t)).toEqual([])
    expect(roomCount(t.unit, deriveRooms(t.unit), { printed } as never)).toBe('All 2 room names read on the sheet are closed and named. The closed rooms add up to 129 sft; no printed flat area was read on this flat.')
  })

  it('"Close it" closes an open veranda with a railing across its open side and names it — one undo step', () => {
    // the box, and a veranda's two side walls east of it with nothing drawn across their ends
    const base = twoRooms(2, [{ id: 'sp', name: 'Toilet', kind: 'bath', x: 3, y: 1.5 }])
    const u = { ...base, vertices: [...base.vertices, v('e1', 6, 0), v('e2', 6, 3)], walls: [...base.walls, w('s1', 'b', 'e1'), w('s2', 'c', 'e2')] }
    const printed = [P('Bed 1', 1, 1.5, 'bed'), P('Toilet', 3, 1.5, 'bath'), { ...P('Ver', 5, 1.5, 'balcony'), printedSize: `6'-6" × 9'-10"` }]
    const [row] = roomRows(u, deriveRooms(u), printed)
    expect(row.message).toBe('Ver is open — no closed room around its name')
    const fixes = fixesFor(u, row, printed)
    expect(fixes.map((f) => f.label)).toEqual(['Close it — railing'])
    const s: StudioState = { ...initialState(), unit: u }
    const t = apply(s, fixes[0])
    const ver = deriveRooms(t.unit).find((r) => r.name === 'Ver')!
    expect(ver.areaSqm).toBeCloseTo(6, 1)
    expect(ver.printedSize).toBe(`6'-6" × 9'-10"`)
    expect(t.unit.walls.filter((x) => x.heightM === 1.1)).toHaveLength(1) // the railing
    expect(t.history.past).toHaveLength(1)
    expect(reducer(t, { type: 'undo' }).unit).toBe(u)
  })

  it('"Close it" puts a zone line between two names sharing one room', () => {
    const u = unit([v('a', 0, 0), v('b', 4, 0), v('c', 4, 2), v('d', 0, 2)], [w('t', 'a', 'b'), w('r', 'b', 'c'), w('bt', 'c', 'd'), w('l', 'd', 'a')], [{ id: 'k', name: 'Kitchen', kind: 'kitchen', x: 1, y: 1 }])
    const printed = [P('Kitchen', 1, 1, 'kitchen'), P('Dining', 3, 1, 'dining')]
    const [row] = roomRows(u, deriveRooms(u), printed)
    expect(row.message).toBe("Dining shares Kitchen's room — no wall between them")
    const [f] = fixesFor(u, row, printed)
    expect(f.label).toBe('Close it — zone line')
    const t = apply({ ...initialState(), unit: u }, f)
    expect(roomStates(t.unit, deriveRooms(t.unit), printed).map((x) => x.s)).toEqual(['done', 'done'])
    expect(t.unit.walls.filter((x) => x.heightM === 0)).toHaveLength(1)
  })

  it('no line closes it (nothing drawn around the name): no fix — the row offers "Show me"', () => {
    const u = twoRooms()
    const printed = [P('Bed 1', 1, 1.5, 'bed'), P('Ver', 9, 1.5, 'balcony')]
    expect(fixesFor(u, roomRows(u, deriveRooms(u), printed)[0], printed)).toEqual([])
  })

  it('"Join it to …" takes out the thin wall between an unnamed space and its named neighbour', () => {
    const u = twoRooms(3.5, [{ id: 'sp', name: 'Space 1', kind: 'other', x: 3.75, y: 1.5 }])
    const row: ReviewItem = { id: 'r', at: { x: 3.75, y: 1.5 }, kind: 'unlabelled', message: 'Unnamed space', entityId: 'sp' }
    const [f] = fixesFor(u, row, [])
    expect(f.label).toBe('Join it to Bed 1')
    const t = apply({ ...initialState(), unit: u, review: { unitId: 'u', items: [row], stats: {} as never } }, f)
    expect(deriveRooms(t.unit).map((r) => [r.name, +r.areaSqm.toFixed(1)])).toEqual([['Bed 1', 12]])
    expect(openReview(t)).toEqual([])
  })

  it('two neighbours of one name (bug hunt 2026-10-18, Assure Phera): each Join button says its side; a row never repeats an answer id', () => {
    const u = unit(
      [v('a', 0, 0), v('b', 5, 0), v('c', 5, 2), v('d', 0, 2), v('p', 2, 0), v('q', 2, 2), v('m', 3, 0), v('n', 3, 2)],
      [w('t1', 'a', 'p'), w('t2', 'p', 'm'), w('t3', 'm', 'b'), w('r', 'b', 'c'), w('b1', 'c', 'n'), w('b2', 'n', 'q'), w('b3', 'q', 'd'), w('l', 'd', 'a'), w('x1', 'p', 'q'), w('x2', 'm', 'n')],
      [{ id: 'toiA', name: 'Toilet', kind: 'bath', x: 1, y: 1 }, { id: 'sp', name: 'Space 1', kind: 'other', x: 2.5, y: 1 }, { id: 'toiB', name: 'Toilet', kind: 'bath', x: 4, y: 1 }],
    )
    const row: ReviewItem = { id: 'r', at: { x: 2.5, y: 1 }, kind: 'unlabelled', message: 'Unnamed space', entityId: 'sp' }
    expect(fixesFor(u, row, []).map((f) => f.label).sort()).toEqual(['Join it to Toilet (left)', 'Join it to Toilet (right)'])
    const rooms = deriveRooms(u)
    const m = markIssues(u, rooms, studioIssues(u, rooms), [row]).find((x) => x.review)!
    const twice = { fixes: [0, 1].map(() => ({ label: 'Join it', title: '', actions: [], ghost: [] })) }
    expect(rowAnswers(u, [m], new Map([[m.key, twice]])).r.answers.map((a) => a.id)).toEqual(['join-it', 'join-it-2', 'looks-right'])
  })

  it('after Auto-trace a closed room with no label at all gets a row too, with "Join it" and the name box', () => {
    const s = studioReducer(initialState(), { type: 'auto-trace', result: { unit: twoRooms(3.5), review: [], stats: { ms: 0, pxPerM: 100, scaleFrom: 'given', walls: 7, rooms: 2, labelled: 1 } } })
    const [row] = openReview(s)
    expect(row.message).toBe('Unnamed space (1.5 m²) — type its name (Name it), or join it to the room it is part of')
    const rooms = deriveRooms(s.unit), issues = studioIssues(s.unit, rooms)
    const m = markIssues(s.unit, rooms, issues, [row]).find((x) => x.review)!
    const f = fixesOf(s.unit, [m], issues, []).get(m.key)!
    expect(f.fixes.map((x) => x.label)).toEqual(['Join it to Bed 1'])
    expect(f.nameAt).toBeTruthy()
  })
})
