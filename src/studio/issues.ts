/**
 * Issues ON the plan (founder 2026-10-04: "issues in the floor plan do not lead me to the problem; some are not worth
 * it — colour-coded marks at the exact points and a visual suggestion of exactly what to change"). Every Issues row and
 * "Check these" row gets a spot, a severity (red = breaks the 3D, amber = worth a look, grey = cosmetic) and a number in
 * list order; an issue gets fixes — each a short list of the reducer's own actions (exactly one undo step) plus a ghost
 * of what it changes — and a fix is offered ONLY when applying it really closes the issue without a new one (`closes`).
 * Pure: no DOM. core.validate is untouched; this only reads its issues.
 */
import { deriveRooms, formatFeetInches, polygonCentroid, roomAt, roomPolygon, wallFrame } from '../core'
import type { Id, Pt, Room, RoomKind, RoomLabel, Unit, Wall } from '../core'
import type { PrintedRoom, ReviewItem } from '../trace/types'
import { MIN_OPENING_M, WALL_TYPES, ahead, entityPoints, findOpening, initialState, openSpotsNear, reducer, studioIssues, wallTypeOf, type Action, type StudioIssue, type StudioState, type WallType } from './model'
import { LOOKS_RIGHT, SHOW_ME, answerId, insidePoint, isUnnamed, parsePrintedSize, printedIndex, roomIndexAt, roomStates, sameName, sheetAxis, type Answer, type Box, type Review } from './review'

export type Severity = 'red' | 'amber' | 'grey'
/** an unnamed space smaller than this is a duct / wall pocket: cosmetic, m² */
export const SMALL_SQM = 2
/** "Extend" / "Close the gap": how far a loose end looks along its own line for a wall / another end (the founder's gaps: 0.55–0.75 m) */
export const GAP_M = 1.2
/** "Remove end" / "End it here": a loose piece of wall up to this long past a junction / a crossing is an overshoot (a fresh Sheltech B trace: 1.04 m) */
export const OVERSHOOT_M = 1.2
/** a loose end's third fix: the wall stands alone on purpose (Wall.standsAlone) */
export const KEEP = 'Keep — it stands alone'
/**
 * s27 rows: a mark's fixes are checked on the plan around its spot, not on the whole floor (Sheltech Windflower's six
 * flats, 1 370 walls: every check re-derived and re-validated the whole floor, 13–75 s a row, 755 rows): the walls that
 * reach within this of it (m) — room for a 40 m² room around its name and the walls "Close it" carries on.
 */
export const LOCAL_M = 8

/**
 * The plan around `at` a mark's fixes are checked on: every wall that reaches within `r` of it (whole), their corners and
 * the stray ones there, the labels and columns among them. Ids are kept (an issue / room of the piece has its key in the
 * unit); the unit itself when nothing is left out (one flat's sheet).
 * ponytail: a room reaching further than `r` from the spot is open in the piece, so a fix closing only such a room is not
 * offered (a long corridor); a bigger `r` if one ever needs it.
 */
export function around(u: Unit, at: Pt, r = LOCAL_M): Unit {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const near = (x0: number, y0: number, x1: number, y1: number) => x1 >= at.x - r && x0 <= at.x + r && y1 >= at.y - r && y0 <= at.y + r
  const walls = u.walls.filter((w) => {
    const a = V.get(w.a), b = V.get(w.b)
    return !!a && !!b && near(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y))
  })
  const used = new Set(walls.flatMap((w) => [w.a, w.b]))
  const vertices = u.vertices.filter((v) => used.has(v.id) || near(v.x, v.y, v.x, v.y))
  if (walls.length === u.walls.length && vertices.length === u.vertices.length) return u
  // (every face of the piece lies within its corners' extent)
  const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y)
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  const roomLabels = u.roomLabels.filter((l) => l.x >= x0 && l.x <= x1 && l.y >= y0 && l.y <= y1)
  const pillars = u.pillars?.filter((c) => c.x + c.wM / 2 >= x0 && c.x - c.wM / 2 <= x1 && c.y + c.hM / 2 >= y0 && c.y - c.hM / 2 <= y1)
  return { ...u, vertices, walls, roomLabels, ...(pillars ? { pillars } : {}) }
}

/** what breaks the 3D: an open room (no floor, skirting or daylight), doubled or crossing walls, an opening off its wall */
const BREAKS = new Set<StudioIssue['code']>(['dangling-vertex', 'zero-length-wall', 'duplicate-wall', 'opening-out-of-bounds', 'openings-overlap', 'walls-intersect'])

/** A fix's preview on the plan (metres): a wall end's way to the wall it joins, a piece that goes, a joint, a new span / area. */
export type Ghost = { kind: 'line'; from: Pt; to: Pt } | { kind: 'cut'; from: Pt; to: Pt } | { kind: 'ring'; at: Pt } | { kind: 'area'; pts: Pt[] }

export interface Fix {
  /** the button */
  label: string
  /** what it does, in a sentence */
  title: string
  actions: Action[]
  ghost: Ghost[]
}

export interface Mark {
  /** stable while the issue stands: its code + ids, or the review row's id */
  key: string
  /** 1-based in list order ("Check these", then Issues); null = a whole-plan issue with no spot */
  n: number | null
  severity: Severity
  at: Pt | null
  message: string
  issue?: StudioIssue
  review?: Review['items'][number]
  /** an unnamed room: its outline (tinted) */
  outline?: Pt[]
  /** an unnamed room: a point inside it and in no smaller room — a label there names exactly this room (deriveRooms
   *  gives a label to the smallest face around it), so naming in place always closes the issue */
  nameAt?: Pt
  /** a label in no closed room: the nearest open spot and why */
  hint?: { at: Pt; why: string }
  /** a "Check these" row on an issue's spot (the trace's dead end = that loose end): it shares the issue's mark, number and fixes */
  twinOf?: string
}

/** A mark's working fixes; `nameAt` = an unnamed room's name typed in place becomes a label here. */
export interface MarkFixes {
  fixes: Fix[]
  nameAt?: Pt
}

export const issueKey = (i: StudioIssue): string => `${i.code}:${[...i.ids].sort().join(',')}`

const ft = formatFeetInches
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y)
const degreeOf = (u: Unit, id: Id) => u.walls.filter((w) => w.a === id || w.b === id).length

/** Where two walls validate calls crossing meet: an end of one lying on the other (`end`), else the crossing point. */
function crossing(u: Unit, P: Wall, Q: Wall): { at: Pt; end?: Id } {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const [a, b, c, e] = [V.get(P.a)!, V.get(P.b)!, V.get(Q.a)!, V.get(Q.b)!]
  const onSeg = (p: Pt, s0: Pt, s1: Pt) => {
    const L2 = (s1.x - s0.x) ** 2 + (s1.y - s0.y) ** 2
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - s0.x) * (s1.x - s0.x) + (p.y - s0.y) * (s1.y - s0.y)) / L2)) : 0
    return dist(p, lerp(s0, s1, t)) <= 1e-6
  }
  const shared = new Set([P.a, P.b].filter((id) => id === Q.a || id === Q.b))
  for (const [id, p, s0, s1] of [[P.a, a, c, e], [P.b, b, c, e], [Q.a, c, a, b], [Q.b, e, a, b]] as const) if (!shared.has(id) && onSeg(p, s0, s1)) return { at: { x: p.x, y: p.y }, end: id }
  const den = (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x)
  const t = den ? ((c.x - a.x) * (e.y - c.y) - (c.y - a.y) * (e.x - c.x)) / den : 0.5
  return { at: lerp(a, b, t) }
}

/** The corners of `w`'s slab between u0 and u1 (m along it from a). */
function span(u: Unit, w: Wall, u0: number, u1: number): Pt[] {
  const f = wallFrame(w, u.vertices)
  const h = w.thicknessM / 2
  return [[u0, -h], [u1, -h], [u1, h], [u0, h]].map(([s, t]) => ({ x: f.origin.x + f.dir.x * s + f.normal.x * t, y: f.origin.y + f.dir.y * s + f.normal.y * t }))
}

const wallMid = (u: Unit, w: Wall): Pt => {
  const f = wallFrame(w, u.vertices)
  return { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
}

/** Segments a–b and p–q cross (strictly inside both). */
const cuts = (a: Pt, b: Pt, p: Pt, q: Pt): boolean => {
  const c = (o: Pt, s: Pt, t: Pt) => (s.x - o.x) * (t.y - o.y) - (s.y - o.y) * (t.x - o.x)
  return c(a, b, p) * c(a, b, q) < 0 && c(p, q, a) * c(p, q, b) < 0
}

/** The walls of the run a loose end `id` of `w` starts: on through every corner where only two walls meet, to a junction or a free end. */
function runOf(u: Unit, id: Id, w: Wall): Id[] {
  const out = [w.id]
  for (let at = w.a === id ? w.b : w.a, cur = w; degreeOf(u, at) === 2; ) {
    const next = u.walls.find((x) => x !== cur && (x.a === at || x.b === at))!
    if (out.includes(next.id)) break // a closed loop
    out.push(next.id)
    ;(cur = next), (at = next.a === at ? next.b : next.a)
  }
  return out
}

/** One issue's mark (number still unset). */
function issueMark(u: Unit, rooms: Room[], i: StudioIssue): Omit<Mark, 'n'> {
  const base = { key: issueKey(i), issue: i, message: i.message, severity: BREAKS.has(i.code) ? ('red' as const) : ('amber' as const), at: null as Pt | null }
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const W = new Map(u.walls.map((w) => [w.id, w]))
  switch (i.code) {
    case 'dangling-vertex': {
      const v = V.get(i.ids[0])
      const deg = degreeOf(u, i.ids[0])
      return { ...base, at: v ? { x: v.x, y: v.y } : null, message: deg ? 'Loose wall end (room open in 3D)' : 'Stray corner with no wall' }
    }
    case 'zero-length-wall': {
      const w = W.get(i.ids[0])
      const v = w && (V.get(w.a) ?? V.get(w.b))
      return { ...base, at: v ? { x: v.x, y: v.y } : null }
    }
    case 'duplicate-wall': {
      const w = W.get(i.ids[0])
      return { ...base, at: w ? wallMid(u, w) : null }
    }
    case 'opening-out-of-bounds':
    case 'openings-overlap': {
      const w = W.get(i.ids[0])
      const os = i.ids.slice(1).map((id) => findOpening(u, id)?.opening).filter((o) => !!o)
      if (!w || !os.length) return base
      const f = wallFrame(w, u.vertices)
      // the part past the wall's end / the overlap's middle, on the wall
      const s = i.code === 'openings-overlap' && os.length === 2 ? (Math.max(os[0].offsetM, os[1].offsetM) + Math.min(os[0].offsetM + os[0].widthM, os[1].offsetM + os[1].widthM)) / 2 : os[0].offsetM + os[0].widthM / 2
      const c = Math.max(0, Math.min(f.lengthM, s))
      return { ...base, at: { x: f.origin.x + f.dir.x * c, y: f.origin.y + f.dir.y * c } }
    }
    case 'walls-intersect': {
      const [P, Q] = [W.get(i.ids[0]), W.get(i.ids[1])]
      return { ...base, at: P && Q ? crossing(u, P, Q).at : null }
    }
    case 'island-in-room': {
      const w = W.get(i.ids[1]) // ids: the room around it, then the island's walls
      return { ...base, at: w ? wallMid(u, w) : null }
    }
    case 'unlabelled-room': {
      const r = rooms.find((x) => x.id === i.ids[0])
      if (!r) return base
      const inside = insidePoint(r, u, rooms)
      const outline = roomPolygon(r, u)
      // (no clean inside point: the mark sits at the centroid and naming in place is not offered)
      return { ...base, severity: r.areaSqm < SMALL_SQM ? 'grey' : 'amber', at: inside ?? polygonCentroid(outline), outline, message: `Unnamed space · ${r.areaSqm.toFixed(1)} m²`, ...(inside ? { nameAt: inside } : {}) }
    }
    case 'label-outside-any-room': {
      const l = u.roomLabels.find((x) => x.id === i.ids[0])
      if (!l) return base
      const spot = openSpotsNear(u, rooms, l)[0]
      return { ...base, at: { x: l.x, y: l.y }, message: `${i.message}: ${l.name}`, ...(spot ? { hint: spot } : {}) }
    }
    default:
      return base // scale, no rooms, no entry door: the whole plan
  }
}

const RANK: Record<Severity, number> = { red: 0, amber: 1, grey: 2 }

/** a "Check these" spot this close to an issue's is that issue (m) */
const TWIN_M = 0.1

/**
 * The marks in list order: "Check these" rows, then the issues by severity (whole-plan ones last); numbered where they
 * have a spot. A "Check these" row on an issue's spot gets no mark of its own: it carries the issue's number (twinOf).
 */
export function markIssues(u: Unit, rooms: Room[], issues: StudioIssue[], review: Review['items'] = []): Mark[] {
  const fromIssues = issues.map((i) => issueMark(u, rooms, i)).sort((p, q) => Number(!p.at) - Number(!q.at) || RANK[p.severity] - RANK[q.severity])
  const fromReview: Omit<Mark, 'n'>[] = review.map((r) => {
    const twin = fromIssues.find((m) => m.at && dist(m.at, r.at) <= TWIN_M)
    return { key: `review:${r.id}`, severity: twin?.severity ?? (r.kind === 'unclosed' ? 'red' : 'amber'), at: r.at, message: r.message, review: r, ...(twin ? { twinOf: twin.key } : {}) }
  })
  let n = 0
  const marks = [...fromReview, ...fromIssues].map((m) => ({ ...m, n: m.at && !m.twinOf ? ++n : null }))
  const nOf = new Map(marks.map((m) => [m.key, m.n]))
  return marks.map((m) => (m.twinOf ? { ...m, n: nOf.get(m.twinOf) ?? null } : m))
}

/** what a room a fix closes brings with it, never a new problem: an unnamed space, the first room's "no entry door yet" */
const CLOSED_A_ROOM = new Set<StudioIssue['code']>(['unlabelled-room', 'no-entry-door'])

/**
 * Applying `actions` to `u` leaves no issue with `issue`'s key and no issue that was not there before (but what a newly
 * closed room brings: CLOSED_A_ROOM). The reducer's own rules run, so what is offered is exactly what a click does.
 */
export function closes(u: Unit, actions: Action[], issue: StudioIssue, before: StudioIssue[]): boolean {
  const s = actions.reduce(reducer, { ...initialState(), unit: u })
  if (s.unit === u) return false
  const had = new Set(before.map(issueKey))
  const k = issueKey(issue)
  return studioIssues(s.unit, deriveRooms(s.unit)).every((i) => issueKey(i) !== k && (had.has(issueKey(i)) || CLOSED_A_ROOM.has(i.code)))
}

/** drag-begin (the one undo entry) → corners to `moves` → drag-end joins them where they landed (settle) */
const dragTo = (moves: { id: Id; x: number; y: number }[], ids = moves.map((m) => m.id)): Action[] => [
  { type: 'drag-begin' },
  ...(moves.length ? [{ type: 'drag', vertices: moves } as Action] : []),
  { type: 'drag-end', ids },
]

/** Candidate fixes for one issue (unchecked). */
function candidates(u: Unit, i: StudioIssue): Fix[] {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const W = new Map(u.walls.map((w) => [w.id, w]))
  switch (i.code) {
    case 'dangling-vertex': {
      const id = i.ids[0]
      const v = V.get(id)
      const mine = u.walls.filter((w) => w.a === id || w.b === id)
      if (!v) return []
      if (!mine.length) return [{ label: 'Remove', title: 'Remove this stray corner', actions: [{ type: 'delete', ids: [id] }], ghost: [{ kind: 'ring', at: v }] }]
      if (mine.length !== 1) return []
      const w = mine[0]
      const far = V.get(w.a === id ? w.b : w.a)!
      const out: Fix[] = []
      const hit = ahead(u, id, w, GAP_M)
      // a gap the trace left in one wall: another loose end facing this one, a few cm off its line at most (ahead takes
      // only an end ON the line) — this end slides along its own line to it; the end-to-end join does the rest, no tilt
      const L0 = dist(far, v)
      const d = { x: (v.x - far.x) / L0, y: (v.y - far.y) / L0 }
      const deg = new Map<Id, number>()
      for (const x of u.walls) for (const e of [x.a, x.b]) deg.set(e, (deg.get(e) ?? 0) + 1)
      const facing = u.walls
        .flatMap((x) => (x === w ? [] : [x.a, x.b].filter((e) => deg.get(e) === 1).map((qid) => ({ x, qid }))))
        .flatMap(({ x, qid }) => {
          const q = V.get(qid)!, qf = V.get(qid === x.a ? x.b : x.a)!
          const Lq = dist(qf, q)
          const r = (q.x - v.x) * d.x + (q.y - v.y) * d.y
          const off = Math.abs((q.y - v.y) * d.x - (q.x - v.x) * d.y)
          const back = Lq > 0 && ((q.x - qf.x) * d.x + (q.y - qf.y) * d.y) / Lq < -0.985 // its wall points back at this end (within 10°)
          return r > 1e-6 && r <= GAP_M && off <= Math.max(w.thicknessM, x.thicknessM) && back ? [{ q, r }] : []
        })
        .sort((p, q) => p.r - q.r)[0]
      if (facing && (!hit || facing.r < hit.r)) {
        const to = { x: v.x + d.x * facing.r, y: v.y + d.y * facing.r }
        out.push({ label: `Close the gap ${ft(facing.r)}`, title: `Carry this wall ${ft(facing.r)} along its own line to the wall end facing it: one wall, no gap (add a window or door there with O if the gap was one)`, actions: dragTo([{ id, ...to }]), ghost: [{ kind: 'line', from: v, to: facing.q }] })
      } else if (hit?.inside) out.push({ label: 'Join', title: 'Join this end to the wall it sits in', actions: dragTo([], [id]), ghost: [{ kind: 'ring', at: v }] })
      else if (hit) {
        const moves = [{ id, ...hit.to }, ...(hit.also ? [{ id: hit.also.end, ...hit.to }] : [])]
        const ghost: Ghost[] = [{ kind: 'line', from: v, to: hit.to }, ...(hit.also ? [{ kind: 'line' as const, from: V.get(hit.also.end)!, to: hit.to }] : [])]
        out.push({ label: `Extend ${ft(hit.r)}`, title: `Carry this wall ${ft(hit.r)} along its own line to the wall ahead and join it there`, actions: dragTo(moves), ghost })
      }
      // a short loose piece past a junction (nothing else ends at its free corner): an overshoot — it can simply go
      const pastJunction = degreeOf(u, far.id) >= 3
      if (pastJunction && !w.openings.length && L0 <= OVERSHOOT_M)
        out.push({ label: 'Remove end', title: `Remove this ${ft(L0)} piece of wall sticking out past the corner`, actions: [{ type: 'delete', ids: [w.id] }], ghost: [{ kind: 'cut', from: far, to: v }] })
      // an overshoot first — unless a gap in one wall is what is open: closing it comes first then
      if (pastJunction && !(facing && out[0]?.label.startsWith('Close'))) out.reverse()
      // or it is meant to end there (founder 2026-10-04: a screen, a fin, a decorative or wind wall): stored on the walls of
      // its run — the walls from this end through plain bends to a junction or its other free end, so a drawn screen is one click
      out.push({ label: KEEP, title: 'This wall is meant to end here (a screen, fin, decorative or wind wall): keep it standing alone', actions: [{ type: 'stand-alone', ids: runOf(u, id, w), on: true }], ghost: [{ kind: 'ring', at: v }] })
      return out
    }
    case 'island-in-room': {
      // one zone line (height 0) from the island's corner nearest a corner of the room around it, crossing no wall: that
      // room becomes a keyhole going round it (core.validate)
      const outer = deriveRooms(u).find((r) => r.id === i.ids[0])
      const isle = new Set(i.ids.slice(1).flatMap((id) => (W.get(id) ? [W.get(id)!.a, W.get(id)!.b] : [])))
      if (!outer) return []
      let best: { p: Pt; q: Pt; d: number } | null = null
      for (const a of isle)
        for (const b of new Set(outer.loop.filter((id) => V.has(id)))) {
          const p = V.get(a)!, q = V.get(b)!, d = dist(p, q)
          if (d > 1e-6 && (!best || d < best.d) && !u.walls.some((x) => x.a !== a && x.b !== a && x.a !== b && x.b !== b && cuts(V.get(x.a)!, V.get(x.b)!, p, q))) best = { p, q, d }
        }
      if (!best) return []
      const [p, q] = [best.p, best.q].map(({ x, y }) => ({ x, y }))
      return [{ label: 'Join with a zone line', title: `Draw a ${ft(best.d)} zone line (height 0, nothing in 3D) from it to the room around it: that room's floor then goes round it`, actions: [{ type: 'chain-start', at: { ...p, tolM: 1e-3 }, wall: 'zone' }, { type: 'chain-add', at: { ...q, tolM: 1e-3 } }, { type: 'chain-end' }], ghost: [{ kind: 'line', from: p, to: q }] }]
    }
    case 'zero-length-wall': {
      const w = W.get(i.ids[0])
      if (!w) return []
      const a = V.get(w.a), b = V.get(w.b)
      if (!a || !b || w.a === w.b) return [{ label: 'Remove', title: 'Remove this wall with no length', actions: [{ type: 'delete', ids: [w.id] }], ghost: [] }]
      return [{ label: 'Merge corners', title: 'Make its two corners one corner', actions: dragTo([], [w.a]), ghost: [{ kind: 'ring', at: a }] }]
    }
    case 'duplicate-wall': {
      const [p, q] = [W.get(i.ids[0]), W.get(i.ids[1])]
      if (!p || !q) return []
      const drop = p.openings.length <= q.openings.length ? p : q
      if (drop.openings.length) return [] // both carry openings: which to keep is his call
      const f = wallFrame(drop, u.vertices)
      return [{ label: 'Remove the copy', title: 'Remove the wall lying on top of the other one', actions: [{ type: 'delete', ids: [drop.id] }], ghost: [{ kind: 'cut', from: f.origin, to: { x: f.origin.x + f.dir.x * f.lengthM, y: f.origin.y + f.dir.y * f.lengthM } }] }]
    }
    case 'opening-out-of-bounds': {
      const w = W.get(i.ids[0])
      const o = findOpening(u, i.ids[1])?.opening
      if (!w || !o) return []
      const L = wallFrame(w, u.vertices).lengthM
      if (!(o.widthM > 0) || L < MIN_OPENING_M) return [{ label: 'Remove it', title: `Remove this ${o.kind}: its wall is too short for it`, actions: [{ type: 'delete', ids: [o.id] }], ghost: [] }]
      const widthM = Math.min(o.widthM, L)
      const offsetM = Math.max(0, Math.min(L - widthM, o.offsetM))
      const label = widthM < o.widthM - 1e-6 ? `Shrink to ${ft(widthM)}` : 'Move it inside'
      return [{ label, title: `${label === 'Move it inside' ? 'Slide' : 'Shrink'} the ${o.kind} so it fits on its wall`, actions: [{ type: 'update-opening', id: o.id, patch: { offsetM, widthM } }], ghost: [{ kind: 'area', pts: span(u, w, offsetM, offsetM + widthM) }] }]
    }
    case 'openings-overlap': {
      const w = W.get(i.ids[0])
      const [p, q] = [findOpening(u, i.ids[1])?.opening, findOpening(u, i.ids[2])?.opening]
      if (!w || !p || !q) return []
      const [x, y] = p.widthM <= q.widthM ? [p, q] : [q, p] // the narrower one gives way
      const before = y.offsetM - x.offsetM
      const after = x.offsetM + x.widthM - (y.offsetM + y.widthM)
      const keep = before >= after ? { offsetM: x.offsetM, widthM: before } : { offsetM: y.offsetM + y.widthM, widthM: after }
      if (keep.widthM < MIN_OPENING_M) return [{ label: `Remove the ${x.kind}`, title: `Remove the ${x.kind}: it lies inside the other opening`, actions: [{ type: 'delete', ids: [x.id] }], ghost: [{ kind: 'area', pts: span(u, w, x.offsetM, x.offsetM + x.widthM) }] }]
      return [{ label: `Trim the ${x.kind}`, title: `Trim the ${x.kind} to ${ft(keep.widthM)} so it stops at the other opening`, actions: [{ type: 'update-opening', id: x.id, patch: keep }], ghost: [{ kind: 'area', pts: span(u, w, keep.offsetM, keep.offsetM + keep.widthM) }] }]
    }
    case 'walls-intersect': {
      const [P, Q] = [W.get(i.ids[0]), W.get(i.ids[1])]
      if (!P || !Q) return []
      const c = crossing(u, P, Q)
      if (c.end) return [{ label: 'Join here', title: 'Join this wall end to the wall it touches', actions: dragTo([], [c.end]), ghost: [{ kind: 'ring', at: c.at }] }]
      // a free end just past the crossing: an overshoot — that wall ends at the crossing instead
      let over: { id: Id; d: number } | null = null
      for (const w of [P, Q])
        for (const id of [w.a, w.b]) {
          const d = dist(V.get(id)!, c.at)
          if (degreeOf(u, id) === 1 && d <= OVERSHOOT_M && (!over || d < over.d)) over = { id, d }
        }
      const join: Fix = { label: 'Join here', title: 'Split both walls at the crossing so they share one corner', actions: dragTo([], [P.a, P.b]), ghost: [{ kind: 'ring', at: c.at }] }
      if (!over) return [join]
      return [{ label: 'End it here', title: `End the wall at the crossing (the ${ft(over.d)} past it goes)`, actions: dragTo([{ id: over.id, ...c.at }]), ghost: [{ kind: 'cut', from: c.at, to: V.get(over.id)! }, { kind: 'ring', at: c.at }] }, join]
    }
    default:
      return []
  }
}

/** `after` holds no issue `before` did not, but what a newly closed room brings (CLOSED_A_ROOM) */
/** A leak of the room around an R click: a loose end, its own fix, how far short it stops, and whether it is within reach. */
export interface Leak {
  id: Id
  at: Pt
  fix: Fix
  gap: number
  /** within the reach every Studio path carries an end on by itself (model.ahead): the R tool heals it and names the room */
  heal: boolean
}

/**
 * Why `p` (the R tool's click) lies in no closed room, decided on the room around it only (founder 2026-10-09: "why on
 * universe would I need to ever close that wall. it is there, just let it be"): the loose ends whose own fix (Close the
 * gap / Join / Extend, as the Issues list offers it) closes a room around p — each alone; when none does alone, those all of
 * them together need (each left out in turn reopens it). A loose end anywhere else is never a reason. [] = no wall end
 * nearby closes it (a wall is missing).
 */
export function leaksAround(s: StudioState, p: Pt): Leak[] {
  const u = s.unit
  const closedAt = (t: StudioState) => !!roomAt(p, deriveRooms(t.unit), t.unit)
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const cands = studioIssues(u, deriveRooms(u)).flatMap((i) => {
    const v = i.code === 'dangling-vertex' ? V.get(i.ids[0]) : undefined
    const fix = v && candidates(u, i).find((f) => /^(Close the gap|Join|Extend)/.test(f.label))
    return v && fix ? [{ v, fix }] : []
  })
  const apply = (cs: typeof cands) => cs.reduce((t, c) => c.fix.actions.reduce(reducer, t), s)
  let leaks = cands.filter((c) => closedAt(apply([c])))
  if (!leaks.length && cands.length > 1 && closedAt(apply(cands))) leaks = cands.filter((c) => !closedAt(apply(cands.filter((x) => x !== c))))
  return leaks.map(({ v, fix }) => {
    const line = fix.ghost.find((g) => g.kind === 'line')
    const gap = line && line.kind === 'line' ? dist(line.from, line.to) : 0
    const w = u.walls.find((x) => x.a === v.id || x.b === v.id)
    const near = w && ahead(u, v.id, w)
    return { id: v.id, at: { x: v.x, y: v.y }, fix, gap, heal: fix.label === 'Join' || gap <= 0.1 || (!!near && !near.inside) }
  })
}

const noNewIssues = (before: StudioIssue[], after: StudioIssue[]): boolean => {
  const had = new Set(before.map(issueKey))
  return after.every((i) => had.has(issueKey(i)) || CLOSED_A_ROOM.has(i.code))
}

// (Level 4: with the flat it was read in — the room joins that flat whatever its doors)
const labelOf = (p: PrintedRoom): Omit<RoomLabel, 'id' | 'x' | 'y'> => ({ name: p.name, kind: p.kind as RoomKind, ...(p.printedSize ? { printedSize: p.printedSize } : {}), ...(p.flat ? { flat: p.flat } : {}) })

/** "Close it": corners and loose ends this far from the printed name are tried (m) … */
export const CLOSE_R_M = 5
/** … with a line up to this long along the sheet's axes (m), the shortest first, at most CLOSE_TRIES of them … */
export const CLOSE_MAX_M = 6
const CLOSE_TRIES = 40
/** … and the room it closes no bigger than this (m²), nor far off its printed size */
const CLOSE_MAX_SQM = 40
const AXIS_TOL = (3 * Math.PI) / 180

/** The nearest wall centre line `d` meets from `from` (m ahead), never one ending at `skip`; null = none. */
function rayHit(u: Unit, from: Pt, d: Pt, skip?: Id): Pt | null {
  let best: { r: number; at: Pt } | null = null
  // (each wall's frame from its own two corners: core's wallFrame maps every vertex on each call — s27 fix 2)
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  for (const w of u.walls) {
    if (w.a === skip || w.b === skip) continue
    const f = wallFrame(w, [V.get(w.a)!, V.get(w.b)!])
    const den = d.x * f.dir.y - d.y * f.dir.x
    if (Math.abs(den) < 0.17) continue // (near parallel)
    const rel = { x: f.origin.x - from.x, y: f.origin.y - from.y }
    const r = (rel.x * f.dir.y - rel.y * f.dir.x) / den, s = (rel.x * d.y - rel.y * d.x) / den
    if (r > 1e-6 && s >= 0 && s <= f.lengthM && (!best || r < best.r)) best = { r, at: { x: from.x + d.x * r, y: from.y + d.y * r } }
  }
  return best?.at ?? null
}

/**
 * "Close it" (Level 5): what closes a room around a printed name that has none (open, or sharing another's room) — one
 * straight line along the sheet's axes, the shortest first: corner to corner, a corner on to the wall it looks at, or
 * across the room halfway between this name and another one near it (two names in one open area: closed one by one);
 * else the loose wall ends around it carried on to the walls ahead, nearest first. The name goes in the room it closes.
 * Kept only when the room is its printed size within reason (≤ CLOSE_MAX_SQM without one), no closed + named room loses
 * its name, and no new issue — each candidate applied with the reducer's own rules. A line on a veranda's open side is a
 * railing (a low wall, the W tool's low-wall height), any other a zone line (nothing in 3D: he makes it a wall / glass
 * if it is one); carried-on walls stay what they are. null = none closes it: he draws it ("Show me").
 * The lines are found on `u`; each is checked on `sub` (around the name) against its issues `before`.
 */
function closeAround(u: Unit, rooms: Room[], printed: PrintedRoom[], k: number, sub: Unit, before: StudioIssue[]): Fix | null {
  const p = printed[k]
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const axis = sheetAxis(u)
  const ax = [0, 1, 2, 3].map((q) => ({ x: Math.cos(axis + (q * Math.PI) / 2), y: Math.sin(axis + (q * Math.PI) / 2) }))
  const along = (a: Pt, b: Pt) => {
    const t = (((Math.atan2(b.y - a.y, b.x - a.x) - axis) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
    return Math.min(t, Math.PI / 2 - t) <= AXIS_TOL
  }
  // (the lines halfway between this name and another in the same room / open area first: few, and the one a shared
  // room needs)
  const polys = rooms.map((r) => roomPolygon(r, u))
  const mine = roomIndexAt(p.at, rooms, polys)
  const st0 = roomStates(u, rooms, printed)
  const ends: { a: Pt; b: Pt; L?: number }[] = []
  for (const [j, q] of printed.entries()) {
    if (q === p || dist(q.at, p.at) > CLOSE_R_M || (st0[j].s === 'done' && (mine < 0 || roomIndexAt(q.at, rooms, polys) !== mine))) continue
    const rel = { x: q.at.x - p.at.x, y: q.at.y - p.at.y }
    const d = Math.abs(rel.x * ax[0].x + rel.y * ax[0].y) >= Math.abs(rel.x * ax[1].x + rel.y * ax[1].y) ? ax[1] : ax[0] // across p → q
    // halfway, else a little to either side (an end landing in a door is refused: a wall is never split inside one)
    for (const t of [0.5, 0.3, 0.7]) {
      const m = lerp(p.at, q.at, t)
      const a = rayHit(u, m, d), b = rayHit(u, m, { x: -d.x, y: -d.y })
      if (a && b) ends.push({ a, b, L: 0 })
    }
  }
  const near = u.vertices.filter((v) => dist(v, p.at) <= CLOSE_R_M)
  near.forEach((a, i) => near.slice(i + 1).forEach((b) => along(a, b) && ends.push({ a, b })))
  for (const v of near)
    for (const d of ax) {
      const b = rayHit(u, v, d, v.id)
      if (b) ends.push({ a: v, b })
    }
  // never through a wall, nor across a closed, named room (but the one the name shares)
  const lines = ends
    .map(({ a, b, L }) => ({ a: { x: a.x, y: a.y }, b, L: dist(a, b), first: L === 0 }))
    .filter(({ a, b, L }) => {
      if (L < MIN_OPENING_M || L > CLOSE_MAX_M || u.walls.some((w) => cuts(V.get(w.a)!, V.get(w.b)!, a, b))) return false
      const j = roomIndexAt(lerp(a, b, 0.5), rooms, polys)
      return j < 0 || j === mine || isUnnamed(rooms[j])
    })
    .sort((x, y) => Number(y.first) - Number(x.first) || x.L - y.L)
  const size = parsePrintedSize(p.printedSize)
  const wasDone = (sub === u ? st0 : roomStates(sub, deriveRooms(sub), printed)).map((x) => x.s === 'done')
  const name: Action = { type: 'add-label', label: { ...labelOf(p), x: p.at.x, y: p.at.y } }
  /** the room closed around the name — its area — when every check passes, else null */
  const closedSqm = (s: StudioState): number | null => {
    const R = deriveRooms(s.unit)
    const f = R[roomIndexAt(p.at, R, R.map((r) => roomPolygon(r, s.unit)))]
    if (!f || !sameName(f.name, p.name) || f.areaSqm > CLOSE_MAX_SQM) return null
    if (size && (f.areaSqm < 0.5 * size[0] * size[1] || f.areaSqm > 1.6 * size[0] * size[1] + 1)) return null
    const st = roomStates(s.unit, R, printed)
    return wasDone.every((was, j) => !was || st[j].s === 'done') && noNewIssues(before, studioIssues(s.unit, R)) ? f.areaSqm : null
  }
  // the tightest room wins: nearest its printed size when one was read, else the smallest
  const score = (sqm: number | null) => (sqm === null ? Infinity : size ? Math.abs(sqm - size[0] * size[1]) : sqm)
  const best: { fix?: Fix; score: number } = { score: Infinity }
  const keep = (sqm: number | null, fix: () => Fix) => {
    if (score(sqm) < best.score - 0.05) Object.assign(best, { fix: fix(), score: score(sqm) })
  }
  const start = { ...initialState(), unit: sub }
  const railing = p.kind === 'balcony' && mine < 0 // (a veranda's open side; the line it shares a room across is no railing)
  for (const { a, b, L } of lines.slice(0, CLOSE_TRIES)) {
    const actions: Action[] = [{ type: 'chain-start', at: { ...a, tolM: 1e-3 }, wall: railing ? 'low' : 'zone' }, { type: 'chain-add', at: { ...b, tolM: 1e-3 } }, { type: 'chain-end' }, name]
    const what = railing ? 'a railing (a low wall)' : 'a zone line (nothing in 3D — select it to make it a wall, low wall or glass)'
    keep(closedSqm(actions.reduce(reducer, start)), () => ({ label: railing ? 'Close it — railing' : 'Close it — zone line', title: `Draw ${what} ${ft(L)} across its open side and name the room ${p.name}`, actions, ghost: [{ kind: 'line', from: a, to: b }] }))
  }
  // the loose ends around it, nearest first, each carried on to the wall ahead (kept when it adds no issue) — then the
  // ones the tightest room it closes does not need are left as they were
  let s = start
  const steps: { actions: Action[]; ghost: Ghost }[] = []
  let carried: { steps: typeof steps; sqm: number } | null = null
  for (const v of near.filter((x) => degreeOf(u, x.id) === 1).sort((x, y) => dist(x, p.at) - dist(y, p.at))) {
    const w = s.unit.walls.find((x) => x.a === v.id || x.b === v.id)
    const h = w && ahead(s.unit, v.id, w, CLOSE_MAX_M)
    if (!h || h.inside) continue
    const actions = dragTo([{ id: v.id, ...h.to }, ...(h.also ? [{ id: h.also.end, ...h.to }] : [])])
    const t = actions.reduce(reducer, s)
    if (t.unit === s.unit || !noNewIssues(before, studioIssues(t.unit, deriveRooms(t.unit)))) continue
    s = t
    steps.push({ actions, ghost: { kind: 'line', from: v, to: h.to } })
    const sqm = closedSqm(reducer(s, name))
    if (sqm !== null && (!carried || score(sqm) < score(carried.sqm) - 0.05)) carried = { steps: [...steps], sqm }
  }
  if (carried) {
    const { sqm } = carried
    let used = carried.steps
    for (const x of carried.steps) {
      const fewer = used.filter((y) => y !== x)
      const got = closedSqm([...fewer.flatMap((y) => y.actions), name].reduce(reducer, start))
      if (got !== null && Math.abs(got - sqm) < 0.05) used = fewer
    }
    const n = used.length
    keep(sqm, () => ({ label: `Close it — carry ${n} wall${n > 1 ? 's' : ''} on`, title: `Carry the loose wall end${n > 1 ? 's' : ''} around it on to the wall ahead (walls stay walls, low walls low) and name the room ${p.name}`, actions: [...used.flatMap((y) => y.actions), name], ghost: used.map((y) => y.ghost) }))
  }
  return best.fix ?? null
}

/**
 * "Join it to …" (Level 5): an unnamed room is part of the named room beside it (an unread corner, a wardrobe strip, a
 * passage cut off by a line that is no wall — the 2026-10-03 "join the unread space" rule, by hand): the walls between
 * them go (none with a door, slider or window, none thicker than 8"), and its "Space N" label. The longest shared side
 * first, at most two neighbours; each one checked by applying it.
 */
/** where room `n` lies from room `r` on the plan, in screen words ("below left") */
const sideOf = (r: Room, n: Room): string =>
  ['right', 'below right', 'below', 'below left', 'left', 'above left', 'above', 'above right'][(Math.round(Math.atan2(n.centroid.y - r.centroid.y, n.centroid.x - r.centroid.x) / (Math.PI / 4)) + 8) % 8]

function joinFixes(u: Unit, rooms: Room[], id: Id, sub: Unit, before: StudioIssue[]): Fix[] {
  const r = rooms.find((x) => x.id === id)
  if (!r || !isUnnamed(r)) return []
  const W = new Map(u.walls.map((w) => [w.id, w]))
  const label = u.roomLabels.find((l) => l.id === id)
  const at = label ?? insidePoint(r, u, rooms)
  if (!at) return []
  const out: Fix[] = []
  const nexts = rooms
    .filter((n) => n !== r && !isUnnamed(n))
    .map((n) => {
      const shared = [...new Set(r.wallIds.filter((w) => n.wallIds.includes(w)))].map((w) => W.get(w)!)
      return { n, shared, L: shared.reduce((t, w) => t + wallFrame(w, u.vertices).lengthM, 0) }
    })
    .filter((c) => c.shared.length && c.shared.every((w) => w.thicknessM <= 0.21 && !w.openings.some((o) => o.kind !== 'passage')))
    .sort((p, q) => q.L - p.L)
  for (const c of nexts) {
    const actions: Action[] = [{ type: 'delete', ids: [...c.shared.map((w) => w.id), ...(label ? [label.id] : [])] }]
    const s = reducer({ ...initialState(), unit: sub }, actions[0])
    const R = deriveRooms(s.unit)
    const k = roomIndexAt(at, R, R.map((x) => roomPolygon(x, s.unit)))
    if (k < 0 || R[k].id !== c.n.id || !noNewIssues(before, studioIssues(s.unit, R))) continue
    const ghost: Ghost[] = c.shared.map((w) => {
      const f = wallFrame(w, u.vertices)
      return { kind: 'cut', from: f.origin, to: { x: f.origin.x + f.dir.x * f.lengthM, y: f.origin.y + f.dir.y * f.lengthM } }
    })
    // two neighbours of one name (two toilets): each button says which side of the space it is on (and how much wall
    // goes, when both lie on one side)
    const twins = nexts.filter((o) => o !== c && o.n.name === c.n.name)
    const side = !twins.length ? '' : twins.some((o) => sideOf(r, o.n) === sideOf(r, c.n)) ? ` (${sideOf(r, c.n)}, ${ft(c.L)} of wall)` : ` (${sideOf(r, c.n)})`
    out.push({ label: `Join it to ${c.n.name}${side}`, title: `${r.name} is part of ${c.n.name}: take out the ${ft(c.L)} of wall between them`, actions, ghost })
    if (out.length === 2) break
  }
  return out
}

/**
 * A room row's fixes (Level 5, review.ts roomStates): "Name it …" for an unnamed room under / beside its printed name,
 * "Close it" for a name in no room or sharing another's; an unnamed space's row: "Join it to …". Empty = by hand.
 */
function roomFixes(u: Unit, rooms: Room[], item: ReviewItem, printed: PrintedRoom[], sub: Unit, before: StudioIssue[]): Fix[] {
  if (item.room === undefined) return item.entityId ? joinFixes(u, rooms, item.entityId, sub, before) : []
  const k = printedIndex(printed, item)
  const s = k >= 0 ? roomStates(u, rooms, printed)[k] : null
  if (!s || s.s === 'done') return []
  const p = printed[k]
  if (s.s === 'unnamed') {
    const l = u.roomLabels.find((x) => x.id === s.room.id)
    const at = l ?? insidePoint(s.room, u, rooms)
    if (!at) return []
    const act: Action = l ? { type: 'update-label', id: l.id, patch: labelOf(p) } : { type: 'add-label', label: { ...labelOf(p), x: at.x, y: at.y } }
    return [{ label: `Name it ${p.name}`, title: `${s.room.name} is ${p.name} on the sheet: name it so`, actions: [act], ghost: [{ kind: 'area', pts: roomPolygon(s.room, u) }] }]
  }
  const c = closeAround(u, rooms, printed, k, sub, before)
  return c ? [c] : []
}

/**
 * The answers to a "Check these" row about one guessed piece — the trace's own questions ("railing, glass or …?", "Door
 * 2'-8" wide?", step 2's "Drew a zone line to close Dining — right?"): the piece made what else it may be, or taken out.
 * Each changes the piece, so its row goes (the row stands only while its entity is as traced). Nothing for other rows.
 */
function guessFixes(u: Unit, id: Id): Fix[] {
  const op = findOpening(u, id)
  const w = op?.wall ?? u.walls.find((x) => x.id === id)
  if (!w) return []
  const f = wallFrame(w, u.vertices)
  const ghost: Ghost[] = [{ kind: 'line', from: f.origin, to: { x: f.origin.x + f.dir.x * f.lengthM, y: f.origin.y + f.dir.y * f.lengthM } }]
  const out: Fix[] = []
  if (op) {
    const o = op.opening
    if (o.kind === 'door') out.push({ label: 'Make it open (no door)', title: `An opening with no door leaf, ${ft(o.widthM)} wide`, actions: [{ type: 'update-opening', id: o.id, patch: { kind: 'passage' } }], ghost })
    if (o.kind === 'passage') out.push({ label: 'Make it a door', title: `A door, ${ft(o.widthM)} wide`, actions: [{ type: 'update-opening', id: o.id, patch: { kind: 'door' } }], ghost })
    const whole = o.widthM >= f.lengthM - 0.02
    out.push({ label: 'Take it out', title: whole ? 'Nothing is there: take the piece out (the room opens again)' : 'No opening there: the wall runs on', actions: [{ type: 'delete', ids: [whole ? w.id : o.id] }], ghost })
    return out
  }
  const type = wallTypeOf(w.heightM)
  for (const t of ['wall', 'low', 'zone'] as WallType[])
    if (t !== type && !(t === 'zone' && w.openings.length)) out.push({ label: `Make it a ${WALL_TYPES[t].label.toLowerCase()}`, title: `This ${ft(f.lengthM)} piece is a ${WALL_TYPES[t].label.toLowerCase()}`, actions: [{ type: 'set-wall-type', ids: [w.id], wall: t }], ghost })
  out.push({ label: 'Take it out', title: 'Nothing is there: take the piece out (the room opens again)', actions: [{ type: 'delete', ids: [w.id] }], ghost })
  return out
}

/**
 * The fixes that work, per mark (by key): each candidate applied and re-checked (`closes`); an unnamed room's name spot;
 * a room row's / an unnamed space row's (roomFixes — set even when empty: the row then offers "Show me").
 * `printed`: the last trace's room names (its review stats); `rooms` = deriveRooms(u), when the caller has it. Each
 * candidate is checked on the plan around the mark (`around`) against that piece's own issues.
 */
export function fixesOf(u: Unit, marks: Mark[], issues: StudioIssue[], printed: PrintedRoom[] = [], rooms?: Room[]): Map<string, MarkFixes> {
  const out = new Map<string, MarkFixes>()
  for (const m of marks) {
    const sub = m.at ? around(u, m.at) : u
    let before: StudioIssue[] | undefined
    const near = () => (before ??= sub === u ? issues : studioIssues(sub, deriveRooms(sub)))
    if (m.review && (m.review.room !== undefined || (m.review.kind === 'unlabelled' && m.review.entityId))) {
      // an unnamed space: a name typed on the plan goes on its "Space N" label (StudioApp nameRoom renames it), or in it
      rooms ??= deriveRooms(u)
      const r = m.review.room === undefined ? rooms.find((x) => x.id === m.review!.entityId) : undefined
      const l = r && u.roomLabels.find((x) => x.id === r.id)
      const nameAt = l ? { x: l.x, y: l.y } : r && insidePoint(r, u, rooms)
      out.set(m.key, { fixes: roomFixes(u, rooms, m.review, printed, sub, near()), ...(nameAt ? { nameAt } : {}) })
    }
    if (m.review && m.review.room === undefined && m.review.entityId && (m.review.kind === 'low-confidence' || m.review.kind === 'opening-guess')) {
      const fixes = guessFixes(u, m.review.entityId)
      if (fixes.length) out.set(m.key, { fixes })
    }
    const i = m.issue
    if (!i) continue
    const fixes = candidates(u, i).filter((f) => closes(sub, f.actions, i, near()))
    if (fixes.length || m.nameAt) out.set(m.key, { fixes, ...(m.nameAt ? { nameAt: m.nameAt } : {}) })
  }
  return out
}

/**
 * s27 rows: what a mark's fixes are worked out from — the mark, and the walls, corners, labels and columns within reach of
 * its spot (the piece its fixes are checked on; a room row: the lines "Close it" tries), each by identity (an edit makes new ones only where it changes the plan). Two
 * equal signatures: the same fixes, so StudioApp keeps a row's buttons through an edit elsewhere on the floor.
 * ponytail: a run of walls "Keep" marks, or a room around the spot, reaching further than that is not in it.
 */
export function fixSig(u: Unit, m: Mark): unknown[] {
  const p = m.at ? around(u, m.at, m.review?.room !== undefined ? CLOSE_R_M + CLOSE_MAX_M : LOCAL_M) : u
  const r = m.review
  return [JSON.stringify([m.key, m.at, m.nameAt, m.twinOf, m.issue, r && [r.room, r.kind, r.entityId, r.at]]), ...p.walls, ...p.vertices, ...p.roomLabels, ...(p.pillars ?? [])]
}

/** a row's box: this far (m) around its spot, what it is about and what its answers change … */
const BOX_PAD_M = 1
/** … and at least this far (m) each way from its spot (an open room's name: the walls around it) */
const BOX_HALF_M = 2.5

/**
 * s27 AI-prep: every open "Check these" row as a model gets it — its buttons as answers (its own fixes, then its issue's
 * when it sits on one, Show me when nothing closes a room row, Looks right: Panel.tsx shows exactly these) and the sheet
 * around it, image px (its spot, its entity and the answers' ghosts, BOX_PAD_M around, BOX_HALF_M at least each way;
 * clipped to the picture when its size is given; none before the scale is set). `fixes` = fixesOf's, complete.
 */
export function rowAnswers(u: Unit, marks: Mark[], fixes: Map<string, MarkFixes>, size?: { w: number; h: number }): Record<string, { box?: Box; answers: Answer[] }> {
  const out: Record<string, { box?: Box; answers: Answer[] }> = {}
  for (const m of marks) {
    const r = m.review
    if (!r) continue
    const list = [...(m.twinOf ? (fixes.get(m.key)?.fixes ?? []) : []), ...(fixes.get(m.twinOf ?? m.key)?.fixes ?? [])]
    // ids are unique in a row (an answer by id must reach each button): a repeated label's id gets -2, -3 …
    const answers: Answer[] = list.map((f, i) => {
      const n = list.slice(0, i).filter((g) => answerId(g.label) === answerId(f.label)).length
      return { id: answerId(f.label) + (n ? `-${n + 1}` : ''), label: f.label, title: f.title, actions: f.actions }
    })
    if (r.room !== undefined && !fixes.get(m.key)?.fixes.length) answers.push({ id: SHOW_ME, label: 'Show me', title: 'Nothing closes it in one click: draw the missing line with the Wall tool', actions: [] })
    answers.push({ id: LOOKS_RIGHT, label: 'Looks right', title: 'Take it off the list', actions: [] })
    const pts: Pt[] = [
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: r.at.x + sx * (BOX_HALF_M - BOX_PAD_M), y: r.at.y + sy * (BOX_HALF_M - BOX_PAD_M) }))),
      ...(r.entityId ? entityPoints(u, r.entityId) : []),
      ...list.flatMap((f) => f.ghost.flatMap((g) => (g.kind === 'area' ? g.pts : g.kind === 'ring' ? [g.at] : [g.from, g.to]))),
    ]
    const pi = u.planImage
    let box: Box | undefined
    if (pi) {
      const xs = pts.map((p) => pi.originPx.x + p.x * pi.pxPerM), ys = pts.map((p) => pi.originPx.y + p.y * pi.pxPerM)
      const pad = BOX_PAD_M * pi.pxPerM
      let x0 = Math.floor(Math.min(...xs) - pad), y0 = Math.floor(Math.min(...ys) - pad), x1 = Math.ceil(Math.max(...xs) + pad), y1 = Math.ceil(Math.max(...ys) + pad)
      if (size) (x0 = Math.max(0, x0)), (y0 = Math.max(0, y0)), (x1 = Math.min(size.w, x1)), (y1 = Math.min(size.h, y1))
      box = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
    }
    out[r.id] = { ...(box ? { box } : {}), answers }
  }
  return out
}
