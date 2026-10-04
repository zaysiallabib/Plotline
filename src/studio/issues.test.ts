/**
 * Issues on the plan (ask 9): every issue has a spot, a severity, a number in list order; a fix is offered only when
 * applying it closes the issue without a new one, and one Ctrl+Z undoes it.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Opening, Unit, Vertex, Wall } from '../core'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import { emptyUnit, initialState, reducer, studioIssues, type StudioState } from './model'
import { studioReducer } from './review'
import { fixesOf, issueKey, markIssues, type Mark } from './issues'

const v = (id: string, x: number, y: number): Vertex => ({ id, x, y })
const w = (id: string, a: string, b: string, openings: Opening[] = []): Wall => ({ id, a, b, thicknessM: 0.127, heightM: 3.048, openings })
const door = (id: string, offsetM: number, widthM = 0.9): Opening => ({ id, kind: 'door', offsetM, widthM, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' })
const win = (id: string, offsetM: number, widthM: number): Opening => ({ id, kind: 'window', offsetM, widthM, heightM: 1.2, sillM: 0.9 })
const SCALE = { src: 'plan.png', pxPerM: 100, originPx: { x: 0, y: 0 } }

/** a 4 × 3 m box (entry door on the top wall) plus `vs` / `ws`; `top` replaces the top wall's openings */
function box(vs: Vertex[] = [], ws: Wall[] = [], top: Opening[] = [door('d', 1)]): Unit {
  return {
    ...emptyUnit(),
    id: 'u',
    name: 'test',
    planImage: SCALE,
    vertices: [v('v1', 0, 0), v('v2', 4, 0), v('v3', 4, 3), v('v4', 0, 3), ...vs],
    walls: [w('top', 'v1', 'v2', top), w('right', 'v2', 'v3'), w('bottom', 'v3', 'v4'), w('left', 'v4', 'v1'), ...ws],
  }
}
/** the bottom wall split at (2, 3) for a partition standing on it */
const splitBottom = (u: Unit): Unit => ({
  ...u,
  vertices: [...u.vertices, v('p1', 2, 3)],
  walls: [...u.walls.filter((x) => x.id !== 'bottom'), w('b1', 'v3', 'p1'), w('b2', 'p1', 'v4')],
})

function marked(u: Unit) {
  const rooms = deriveRooms(u)
  const issues = studioIssues(u, rooms)
  const marks = markIssues(u, rooms, issues)
  return { rooms, issues, marks, fixes: fixesOf(u, marks, issues) }
}
const markOf = (marks: Mark[], code: string, id?: string) => marks.find((m) => m.issue?.code === code && (!id || m.issue.ids.includes(id)))!
const stateOf = (u: Unit): StudioState => ({ ...initialState(), unit: u })

/** applies the fix (its label starts with `label`) through the Studio reducer: the issue is gone, nothing new (but unnamed spaces) appeared, one undo restores the unit */
function applyAndUndo(u: Unit, m: Mark, label: string, { fixes, issues }: Pick<ReturnType<typeof marked>, 'fixes' | 'issues'> = marked(u)) {
  const f = fixes.get(m.key)?.fixes.find((x) => x.label.startsWith(label))
  expect(f, `${m.message}: ${label}`).toBeTruthy()
  const s = stateOf(u)
  const t = studioReducer(s, { type: 'apply-fix', actions: f!.actions, label: f!.label })
  expect(t.history.past).toHaveLength(1)
  const after = studioIssues(t.unit, deriveRooms(t.unit))
  const had = new Set(issues.map(issueKey))
  expect(after.map(issueKey)).not.toContain(m.key)
  expect(after.filter((i) => !had.has(issueKey(i)) && i.code !== 'unlabelled-room' && i.code !== 'no-entry-door')).toEqual([])
  expect(t.toast?.text).toBe(`${f!.label} — Ctrl+Z undoes it`)
  expect(studioReducer(t, { type: 'undo' }).unit).toBe(u)
  return t.unit
}

describe('issues on the plan', () => {
  it('a loose end short of a wall: red, at the end, "Extend" carries it to the wall and closes the room', () => {
    const u = splitBottom(box([v('p2', 2, 0.6)], [w('part', 'p1', 'p2')]))
    const { marks, rooms } = marked(u)
    expect(rooms).toHaveLength(1)
    const m = markOf(marks, 'dangling-vertex', 'p2')
    expect(m).toMatchObject({ severity: 'red', at: { x: 2, y: 0.6 }, n: 1, message: 'Loose wall end (room open in 3D)' })
    expect(marked(u).fixes.get(m.key)!.fixes.map((f) => f.label)).toEqual([`Extend 2'-0"`]) // to the top wall's centre line
    const after = applyAndUndo(u, m, 'Extend')
    expect(deriveRooms(after)).toHaveLength(2)
  })

  it('a gap the trace left in one wall (two ends facing, 2 cm off one line): "Close the gap" closes the room, both ends gone, no tilt', () => {
    // the top wall in two pieces, 0.6 m apart, the right one 2 cm low; the only room's door on the left wall
    const u: Unit = {
      ...box([v('g1', 1.5, 0), v('g2', 2.1, 0.02)], [], []),
      walls: [w('t1', 'v1', 'g1'), w('t2', 'g2', 'v2'), w('right', 'v2', 'v3'), w('bottom', 'v3', 'v4'), w('left', 'v4', 'v1', [door('d', 1)])],
    }
    const { marks, fixes, rooms } = marked(u)
    expect(rooms).toHaveLength(0)
    const m = markOf(marks, 'dangling-vertex', 'g1')
    expect(fixes.get(m.key)!.fixes.map((f) => f.label)).toEqual([`Close the gap 2'-0"`])
    const after = applyAndUndo(u, m, 'Close the gap')
    expect(deriveRooms(after)).toHaveLength(1)
    const left = studioIssues(after, deriveRooms(after)).map((i) => i.code)
    expect(left).not.toContain('dangling-vertex')
    // g1 slid along its own line only: t1 is still level
    const t1 = after.walls.find((x) => x.id === 't1')!
    const [a, b] = [after.vertices.find((p) => p.id === t1.a)!, after.vertices.find((p) => p.id === t1.b)!]
    expect(a.y).toBe(0)
    expect(b.y).toBe(0)
  })

  it('a "Check these" row on an issue\'s spot shares its mark and number (one badge, not two)', () => {
    const u = splitBottom(box([v('p2', 2, 0.6)], [w('part', 'p1', 'p2')]))
    const rooms = deriveRooms(u)
    const marks = markIssues(u, rooms, studioIssues(u, rooms), [
      { id: 'r1', at: { x: 2.01, y: 0.6 }, kind: 'unclosed', message: 'A wall ends here without meeting another' },
      { id: 'r2', at: { x: 1, y: 1 }, kind: 'size-mismatch', message: 'Room: drawn …' },
    ])
    const loose = markOf(marks, 'dangling-vertex', 'p2')
    expect(marks[0]).toMatchObject({ key: 'review:r1', twinOf: loose.key, n: loose.n, severity: 'red' })
    expect(marks[1].n).toBe(1)
    expect(loose.n).toBe(2)
    expect(marks.filter((m) => m.n !== null && !m.twinOf).map((m) => m.n)).toEqual([1, 2, 3])
  })

  it('a short piece past a junction: "Remove end" takes it off', () => {
    const u = box([v('s', 4.5, 0)], [w('stub', 'v2', 's')])
    const { marks, fixes } = marked(u)
    const m = markOf(marks, 'dangling-vertex', 's')
    expect(fixes.get(m.key)!.fixes.map((f) => f.label)).toEqual(['Remove end'])
    expect(applyAndUndo(u, m, 'Remove end').walls.map((x) => x.id).sort()).toEqual(['bottom', 'left', 'right', 'top'])
  })

  it('crossing walls: the mark is the crossing point; "End it here" ends the overshooting wall on the other one', () => {
    const u = splitBottom(box([v('p2', 2, -0.4)], [w('part', 'p1', 'p2')]))
    const { marks, fixes } = marked(u)
    const m = markOf(marks, 'walls-intersect')
    expect(m.severity).toBe('red')
    expect(m.at!.x).toBeCloseTo(2)
    expect(m.at!.y).toBeCloseTo(0)
    expect(fixes.get(m.key)!.fixes.map((f) => f.label)).toEqual(['End it here', 'Join here'])
    const after = applyAndUndo(u, m, 'End it here')
    expect(deriveRooms(after)).toHaveLength(2)
    expect(studioIssues(after, deriveRooms(after)).filter((i) => i.code === 'dangling-vertex')).toEqual([])
  })

  it('a wall end touching a wall without a corner: "Join here" splits the wall there', () => {
    const u = box([v('p1', 2, 3), v('p2', 2, 0)], [w('part', 'p1', 'p2')])
    const { marks } = marked(u)
    const touches = marks.filter((m) => m.issue?.code === 'walls-intersect')
    expect(touches).toHaveLength(2)
    applyAndUndo(u, touches[0], 'Join here')
  })

  it('an opening past its wall end slides back in; overlapping openings: the narrower is trimmed', () => {
    const out = box([], [], [door('d', 1)])
    out.walls[1] = w('right', 'v2', 'v3', [win('x', 2.5, 0.9)])
    const m1 = markOf(marked(out).marks, 'opening-out-of-bounds')
    expect(m1.severity).toBe('red')
    const fixedOut = applyAndUndo(out, m1, 'Move it inside')
    expect(fixedOut.walls[1].openings[0].offsetM).toBeCloseTo(2.1)

    const lap = box([], [], [door('d', 1), win('x', 1.5, 1.2)])
    const m2 = markOf(marked(lap).marks, 'openings-overlap')
    const fixedLap = applyAndUndo(lap, m2, 'Trim the door')
    expect(fixedLap.walls[0].openings.find((o) => o.id === 'd')).toMatchObject({ offsetM: 1, widthM: 0.5 })
  })

  it('no fix is offered when applying it would not close the issue (the slid opening would land on another)', () => {
    const u = box()
    u.walls[1] = w('right', 'v2', 'v3', [win('a', 0, 2.5), door('b', 2.6)])
    const { marks, fixes } = marked(u)
    const m = markOf(marks, 'opening-out-of-bounds', 'b')
    expect(m.at).toBeTruthy()
    expect(fixes.has(m.key)).toBe(false)
  })

  it('a doubled wall and a stray corner each have a one-click fix', () => {
    const dup = box([], [w('copy', 'v2', 'v3')])
    applyAndUndo(dup, markOf(marked(dup).marks, 'duplicate-wall'), 'Remove the copy')
    const stray = box([v('lost', 9, 9)])
    applyAndUndo(stray, markOf(marked(stray).marks, 'dangling-vertex', 'lost'), 'Remove')
  })

  it('an unnamed room is amber, tinted, named in place; one under 2 m² is grey (cosmetic)', () => {
    const u = box()
    const { marks, fixes } = marked(u)
    const m = markOf(marks, 'unlabelled-room')
    expect(m.severity).toBe('amber')
    expect(m.outline).toHaveLength(4)
    const at = fixes.get(m.key)!.nameAt!
    expect(at.x).toBeCloseTo(2)
    expect(at.y).toBeCloseTo(1.5)
    const named = reducer(stateOf(u), { type: 'add-label', label: { name: 'Bed 1', kind: 'bed', ...at } }).unit
    expect(studioIssues(named, deriveRooms(named))).toEqual([])
    const small = { ...u, vertices: u.vertices.map((p) => ({ ...p, x: p.x / 4, y: p.y / 3 })) }
    expect(markOf(marked(small).marks, 'unlabelled-room').severity).toBe('grey')
  })

  it('list order = numbers: red first, then amber, grey; a whole-plan issue last and unnumbered', () => {
    // a loose end, the big room unnamed, a 1 m² box inside it unnamed, no door
    const sq = [v('q1', 0.5, 0.5), v('q2', 1.5, 0.5), v('q3', 1.5, 1.5), v('q4', 0.5, 1.5)]
    const u = splitBottom(box([v('p2', 2, 0.6), ...sq], [w('part', 'p1', 'p2'), w('s1', 'q1', 'q2'), w('s2', 'q2', 'q3'), w('s3', 'q3', 'q4'), w('s4', 'q4', 'q1')], []))
    const { marks } = marked(u)
    expect(marks.map((m) => m.severity)).toEqual(['red', 'amber', 'grey', 'amber'])
    expect(marks.map((m) => m.n)).toEqual([1, 2, 3, null])
    expect(marks.at(-1)!.issue!.code).toBe('no-entry-door')
  })

  it('"Check these" rows come first and are numbered with the rest; an unclosed one is red', () => {
    const u = box()
    const rooms = deriveRooms(u)
    const marks = markIssues(u, rooms, studioIssues(u, rooms), [
      { id: 'r1', at: { x: 1, y: 1 }, kind: 'size-mismatch', message: 'Bed 1: drawn …' },
      { id: 'r2', at: { x: 3, y: 2 }, kind: 'unclosed', message: 'Outline not closed' },
    ])
    expect(marks.map((m) => [m.key, m.n, m.severity])).toEqual([
      ['review:r1', 1, 'amber'],
      ['review:r2', 2, 'red'],
      [marks[2].key, 3, 'amber'],
    ])
  })
})

describe("the founder's draft: every issue findable on the plan, each fix closes its issue", () => {
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const { marks, fixes, issues } = marked(u)
  const labels = (id: string) => fixes.get(markOf(marks, 'dangling-vertex', id).key)?.fixes.map((f) => f.label.split(' ')[0])

  it('13 marks, each at a spot on the plan, numbered 1–13 in list order', () => {
    expect(issues).toHaveLength(13)
    expect(marks.map((m) => m.n)).toEqual([...Array(13)].map((_, i) => i + 1))
    for (const m of marks) expect(m.at, m.message).toBeTruthy()
    expect(marks.filter((m) => m.severity === 'red')).toHaveLength(5) // the 5 loose ends
  })

  it('the loose ends: Extend where a wall is ahead, Remove end where it overshoots a junction, nothing for the sunshade line', () => {
    const id = (p: string) => u.vertices.find((x) => x.id.startsWith(p))!.id
    expect(labels(id('9f4f74b7'))).toEqual(['Extend']) // the toilet's east wall, 0.75 m short of Bed 2's north wall
    expect(labels(id('05c6f946'))).toEqual(['Remove']) // Bed 3's west wall 0.65 m past its north wall
    expect(labels(id('791e5dbd'))).toEqual(['Remove', 'Extend']) // Bed 2's side walls: past the south wall, short of the sunshade line
    expect(labels(id('179fac4e'))).toEqual(['Remove', 'Extend'])
    expect(labels(id('8516f94c'))).toBeUndefined() // the 24.8 m sunshade line's far end: his call (Del)
  })

  it('every unnamed space can be named in place, and the name closes exactly its issue', () => {
    const unnamed = marks.filter((x) => x.issue?.code === 'unlabelled-room')
    expect(unnamed).toHaveLength(8)
    for (const m of unnamed) {
      const at = fixes.get(m.key)?.nameAt
      expect(at, m.message).toBeTruthy()
      const t = reducer(stateOf(u), { type: 'add-label', label: { name: 'Store', kind: 'utility', ...at! } }).unit
      const after = studioIssues(t, deriveRooms(t)).map(issueKey)
      expect(after).not.toContain(m.key)
      expect(after).toHaveLength(issues.length - 1)
    }
  })

  it('every offered fix, applied, closes its issue; one undo gives the draft back', () => {
    let n = 0
    for (const m of marks) for (const f of fixes.get(m.key)?.fixes ?? []) applyAndUndo(u, m, f.label, { fixes, issues }), n++
    expect(n).toBe(6)
  })

  it('the five hand-authored units: no marks', () => {
    for (const h of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) {
      const x = reducer(initialState(), { type: 'load-unit', unit: h }).unit
      expect(marked(x).marks).toEqual([])
    }
  })
})
