/**
 * Issues ON the plan (founder 2026-10-04: "issues in the floor plan do not lead me to the problem; some are not worth
 * it — colour-coded marks at the exact points and a visual suggestion of exactly what to change"). Every Issues row and
 * "Check these" row gets a spot, a severity (red = breaks the 3D, amber = worth a look, grey = cosmetic) and a number in
 * list order; an issue gets fixes — each a short list of the reducer's own actions (exactly one undo step) plus a ghost
 * of what it changes — and a fix is offered ONLY when applying it really closes the issue without a new one (`closes`).
 * Pure: no DOM. core.validate is untouched; this only reads its issues.
 */
import { deriveRooms, formatFeetInches, pointInPolygon, polygonCentroid, roomPolygon, triangulate, wallFrame } from '../core'
import type { Id, Pt, Room, Unit, Wall } from '../core'
import { MIN_OPENING_M, ahead, findOpening, initialState, openSpotsNear, reducer, studioIssues, type Action, type StudioIssue } from './model'
import type { Review } from './review'

export type Severity = 'red' | 'amber' | 'grey'
/** an unnamed space smaller than this is a duct / wall pocket: cosmetic, m² */
export const SMALL_SQM = 2
/** "Extend": how far a loose end looks along its own line for a wall to join (the founder's gaps: 0.55–0.75 m) */
export const GAP_M = 1.2
/** "Remove end" / "End it here": a loose piece of wall up to this long past a junction / a crossing is an overshoot */
export const OVERSHOOT_M = 1

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

/**
 * A point strictly inside the room and in no smaller room (= trace/solve insidePoint; the Studio chunk never imports the
 * trace code); null when none of the centroid and the triangle centres is. A label there names exactly this room.
 */
function insidePoint(r: Room, u: Unit, rooms: Room[]): Pt | null {
  const poly = roomPolygon(r, u)
  const smaller = rooms.filter((o) => o !== r && o.areaSqm < r.areaSqm).map((o) => roomPolygon(o, u))
  const good = (p: Pt) => pointInPolygon(p, poly) && !smaller.some((s) => pointInPolygon(p, s))
  const c = polygonCentroid(poly)
  if (good(c)) return c
  const tri = triangulate(poly)
  let best: Pt | null = null, bestA = -1
  for (let i = 0; i + 2 < tri.length; i += 3) {
    const [p, q, s] = [poly[tri[i]], poly[tri[i + 1]], poly[tri[i + 2]]]
    const A = Math.abs((q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x))
    const m = { x: (p.x + q.x + s.x) / 3, y: (p.y + q.y + s.y) / 3 }
    if (A > bestA && good(m)) (bestA = A), (best = m)
  }
  return best
}

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

/** The marks in list order: "Check these" rows, then the issues by severity (whole-plan ones last); numbered where they have a spot. */
export function markIssues(u: Unit, rooms: Room[], issues: StudioIssue[], review: Review['items'] = []): Mark[] {
  const fromReview: Omit<Mark, 'n'>[] = review.map((r) => ({ key: `review:${r.id}`, severity: r.kind === 'unclosed' ? 'red' : 'amber', at: r.at, message: r.message, review: r }))
  const fromIssues = issues.map((i) => issueMark(u, rooms, i)).sort((p, q) => Number(!p.at) - Number(!q.at) || RANK[p.severity] - RANK[q.severity])
  let n = 0
  return [...fromReview, ...fromIssues].map((m) => ({ ...m, n: m.at ? ++n : null }))
}

/**
 * Applying `actions` to `u` leaves no issue with `issue`'s key and no issue that was not there before (a room a fix
 * closes may be a new unnamed space — that one is allowed). The reducer's own rules run, so what is offered is exactly
 * what a click does.
 */
export function closes(u: Unit, actions: Action[], issue: StudioIssue, before: StudioIssue[]): boolean {
  const s = actions.reduce(reducer, { ...initialState(), unit: u })
  if (s.unit === u) return false
  const had = new Set(before.map(issueKey))
  const k = issueKey(issue)
  return studioIssues(s.unit, deriveRooms(s.unit)).every((i) => issueKey(i) !== k && (had.has(issueKey(i)) || i.code === 'unlabelled-room'))
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
      if (hit?.inside) out.push({ label: 'Join', title: 'Join this end to the wall it sits in', actions: dragTo([], [id]), ghost: [{ kind: 'ring', at: v }] })
      else if (hit) {
        const moves = [{ id, ...hit.to }, ...(hit.also ? [{ id: hit.also.end, ...hit.to }] : [])]
        const ghost: Ghost[] = [{ kind: 'line', from: v, to: hit.to }, ...(hit.also ? [{ kind: 'line' as const, from: V.get(hit.also.end)!, to: hit.to }] : [])]
        out.push({ label: `Extend ${ft(hit.r)}`, title: `Carry this wall ${ft(hit.r)} along its own line to the wall ahead and join it there`, actions: dragTo(moves), ghost })
      }
      // a short loose piece past a junction (nothing else ends at its free corner): an overshoot — it can simply go
      const L = dist(far, v)
      const pastJunction = degreeOf(u, far.id) >= 3
      if (pastJunction && !w.openings.length && L <= OVERSHOOT_M)
        out.push({ label: 'Remove end', title: `Remove this ${ft(L)} piece of wall sticking out past the corner`, actions: [{ type: 'delete', ids: [w.id] }], ghost: [{ kind: 'cut', from: far, to: v }] })
      return pastJunction ? out.reverse() : out
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

/** The fixes that work, per mark (by key): each candidate applied and re-checked (`closes`); an unnamed room's name spot. */
export function fixesOf(u: Unit, marks: Mark[], issues: StudioIssue[]): Map<string, MarkFixes> {
  const out = new Map<string, MarkFixes>()
  for (const m of marks) {
    const i = m.issue
    if (!i) continue
    const fixes = candidates(u, i).filter((f) => closes(u, f.actions, i, issues))
    if (fixes.length || m.nameAt) out.set(m.key, { fixes, ...(m.nameAt ? { nameAt: m.nameAt } : {}) })
  }
  return out
}
