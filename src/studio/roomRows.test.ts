/**
 * Level 5 (founder 2026-10-09: "the person fixes the rest in seconds"): the rooms printed on the sheet against the
 * draft as it stands — the count line, one row per printed name with no closed, named room, and its one-click fix.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Unit, Vertex, Wall } from '../core'
import type { PrintedRoom, ReviewItem } from '../trace/types'
import { emptyUnit, initialState, reducer, studioIssues, type StudioState } from './model'
import { fixesOf, markIssues, type Fix } from './issues'
import { openReview, roomCount, roomRows, roomStates, studioReducer } from './review'

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
    expect(roomCount(u, deriveRooms(u), { printed, wantSqm: 20 } as never)).toMatch(/^1 of the 3 room names read on the sheet are closed and named — missing: Toilet, Ver\. The closed rooms add up to 129 sft; the printed flat area gives about 215\.$/)
    expect(roomRows(u, deriveRooms(u), printed).map((r) => r.message)).toEqual(['Space 1 — printed name Toilet is 0.4 m away', 'Ver is open — no closed room around its name'])
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
