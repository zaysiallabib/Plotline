/**
 * Auto-trace in the Studio's state: the result import (ONE undo step) and the "Check these" review list.
 * Wraps model.reducer instead of living in it: model.ts is shared with the buyer viewer's bundle, this file is not.
 */
import { deriveRooms, formatFeetInches, mainRectangle, newId, parseLength, pointInPolygon, printedSizeCheck, roomInnerPolygon, roomPolygon, sqmToSqft } from '../core'
import type { Id, Pt, Room, Unit } from '../core'
import type { AutoTraceResult, AutoTraceStats, PrintedRoom, ReviewItem } from '../trace/types'
import { entityPoints, findEntity, normalizeUnit, reducer, type Action, type StudioState, type Tool } from './model'
import { layoutFor } from './furniture'

/** = trace/ai AI_KEY_STORAGE (a test pins it), spelled out so the Studio chunk never pulls in the trace code */
export const AI_KEY = 'plotline.geminiKey'
/** localStorage: 'skeleton' = Auto-trace runs the older skeleton wall stage; unset = the default (wall tracks, wave 19) */
export const TRACKER_KEY = 'plotline.tracker'

/**
 * Shown only while the unit is that trace's (`unitId`: an undo past the import hides it, a redo brings it back).
 * `sig`: the item's entity as imported — once the user edits it, the item is done.
 */
export interface Review {
  unitId: Id
  items: (ReviewItem & { sig?: string })[]
  stats: AutoTraceStats
}

export type StudioAction =
  | Action
  /** the auto-trace result becomes the unit: one undo step; its review list comes with it */
  | { type: 'auto-trace'; result: AutoTraceResult }
  /** "Looks right": a review item leaves the list */
  | { type: 'dismiss-review'; id: string }
  /** the Width field while tracing: the chain's next walls get this thickness (m) */
  | { type: 'chain-thickness'; thicknessM: number }
  /** a held W / O / R released after it acted: back to `tool` with `selection`, minus what the action removed */
  | { type: 'spring-back'; tool: Tool; selection: Id[] }
  /** an Issues fix (issues.ts): its reducer actions in one go — one undo step (every fix holds exactly one commit / drag-begin) */
  | { type: 'apply-fix'; actions: Action[]; label: string }

/** An entity as it stands (its fields + where it is); undefined when the unit has no such entity (e.g. an unlabelled room). */
const entitySig = (u: Unit, id: Id): string | undefined => {
  const e = findEntity(u, id)
  return e ? JSON.stringify([e, entityPoints(u, id)]) : undefined
}

export function studioReducer(s: StudioState, a: StudioAction): StudioState {
  switch (a.type) {
    case 'auto-trace': {
      // a fresh id binds the review list to this trace; the plan image stays the one on screen; what the user typed stays
      const r = a.result.unit
      const raw = normalizeUnit({
        ...r,
        id: newId(),
        name: r.name || s.unit.name,
        projectName: r.projectName || s.unit.projectName,
        planImage: r.planImage && { ...r.planImage, src: s.planImage?.name ?? r.planImage.src },
      })
      // drag-begin = the reducer's commit minus the unit: the unit before the trace goes on the undo stack, redo clears;
      // then overlapping / crossing walls joined once (join-walls), its own undo step back to the draft as traced
      const t = reducer({ ...reducer(s, { type: 'drag-begin' }), unit: raw, selection: [], chain: null, tool: 'select' }, { type: 'join-walls' })
      // the room rows first (Level 5): one per printed name with no closed, named room — they stand for the trace's
      // "Unnamed space" row of the room they name
      const rows = a.result.stats.printed ? roomRows(t.unit, deriveRooms(t.unit), a.result.stats.printed) : []
      const claimed = new Set(rows.map((r) => r.entityId))
      const items = [...rows, ...a.result.review.filter((i) => !(i.kind === 'unlabelled' && claimed.has(i.entityId)))].map((i) => ({ ...i, sig: i.entityId ? entitySig(t.unit, i.entityId) : undefined }))
      return { ...t, review: { unitId: t.unit.id, items, stats: a.result.stats } }
    }
    case 'dismiss-review':
      return s.review ? { ...s, review: { ...s.review, items: s.review.items.filter((i) => i.id !== a.id) } } : s
    case 'restore':
      return { ...reducer(s, a), review: a.draft.review ?? null }
    case 'chain-thickness':
      return s.chain && a.thicknessM > 0 ? { ...s, chain: { ...s.chain, thicknessM: a.thicknessM } } : s
    case 'spring-back': {
      // = model.ts stillThere (graph entities or pieces of the furniture layer), kept here so the viewer's chunk stays as is
      const t = reducer(s, { type: 'set-tool', tool: a.tool })
      let pieces: Set<Id> | undefined
      const selection = a.selection.filter((id) => findEntity(t.unit, id) || (pieces ??= new Set(layoutFor(t.unit, deriveRooms(t.unit)).map((p) => p.id))).has(id))
      return { ...t, selection }
    }
    case 'apply-fix': {
      const t = a.actions.reduce(reducer, s)
      if (t.unit === s.unit) return reducer(s, { type: 'toast', text: 'Nothing to fix there any more' })
      // one undo step whatever the fix holds ("Close it" = a line + its room's name)
      return reducer({ ...t, history: { past: [...s.history.past, s.unit], future: [] } }, { type: 'toast', text: `${a.label} — Ctrl+Z undoes it` })
    }
    default:
      return reducer(s, a) // load-unit / reset start from initialState: no review
  }
}

/** = trace/solve KNOBS.sizeTolM: a room is its printed size within this (2") */
export const SIZE_TOL_M = 2 * 0.0254

/** The sheet's axis: the angle (folded into ±45°) most wall length runs along; 0 on an axis-aligned trace. */
export function sheetAxis(u: Unit): number {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  let sx = 0, sy = 0
  for (const w of u.walls) {
    const a = V.get(w.a), b = V.get(w.b)
    if (!a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (!L) continue
    const t = 4 * Math.atan2(b.y - a.y, b.x - a.x) // walls 90° apart vote for one axis
    ;(sx += L * Math.cos(t)), (sy += L * Math.sin(t))
  }
  return sx || sy ? Math.atan2(sy, sx) / 4 : 0
}

/** A room's size as the sheet prints it: the main rectangle of its clear inside, along the sheet's axes. */
export function drawnSize(u: Unit, room: Room, axis = sheetAxis(u)): { w: number; h: number } {
  return mainRectangle(roomInnerPolygon(room, u), axis)
}

/** "14'-0\" × 16'-0\"" → [4.27, 4.88] m; null when it is not two lengths */
export function parsePrintedSize(s: string | undefined): [number, number] | null {
  const parts = (s ?? '').split(/[×x]/i).map((t) => parseLength(t.trim()))
  return parts.length === 2 && parts[0] && parts[1] ? [parts[0], parts[1]] : null
}

/**
 * A size-mismatch row re-checked against the unit as it stands: the room vs the label's printed size by core
 * printedSizeCheck (main rectangle or whole outline; the row shows the main rectangle). null = nothing to check any more (label gone, printed size removed, or the room has
 * no closed face — then the row is not about the size); otherwise whether it still differs, and the current wording.
 */
export function sizeCheck(u: Unit, labelId: Id, rooms: Room[], axis?: number): { off: boolean; message: string } | null {
  const l = u.roomLabels.find((x) => x.id === labelId)
  const printed = parsePrintedSize(l?.printedSize)
  if (!l || !printed) return null
  const r = rooms.find((x) => x.id === labelId)
  if (!r) return null
  const { off, drawn: e, printed: pair } = printedSizeCheck(roomInnerPolygon(r, u), axis ?? sheetAxis(u), printed[0], printed[1], SIZE_TOL_M)
  return { off, message: `${l.name}: drawn ${formatFeetInches(e.w)} × ${formatFeetInches(e.h)}, printed ${formatFeetInches(pair[0])} × ${formatFeetInches(pair[1])}` }
}

/**
 * The review items still to look at: the unit is still the trace's, not dismissed, their entity not edited since.
 * A size-mismatch row is re-checked instead (the walls moved, or the printed size was corrected): it stays, with the
 * current figures, while the room still differs from its printed size, and goes once it matches.
 */
export function openReview(s: StudioState, rooms?: Room[]): Review['items'] {
  if (!s.review || s.review.unitId !== s.unit.id) return []
  let R = rooms
  let axis: number | undefined
  const printed = s.review.stats.printed ?? []
  let st: RoomState[] | undefined
  const out: Review['items'] = []
  for (const i of s.review.items) {
    // a room row: where its printed name stands now (it goes once the name is on a closed room)
    if (i.room !== undefined) {
      R ??= deriveRooms(s.unit)
      st ??= roomStates(s.unit, R, printed)
      const k = printedIndex(printed, i)
      if (k >= 0 && st[k].s !== 'done') out.push(roomRow(printed[k], st[k], i.id))
      continue
    }
    // an unnamed space: while it is one (named, joined to its neighbour or gone: done)
    if (i.kind === 'unlabelled' && i.entityId) {
      R ??= deriveRooms(s.unit)
      const r = R.find((x) => x.id === i.entityId)
      if (r && isUnnamed(r)) out.push(i)
      continue
    }
    if (i.kind === 'size-mismatch' && i.entityId) {
      R ??= deriveRooms(s.unit)
      axis ??= sheetAxis(s.unit)
      const c = sizeCheck(s.unit, i.entityId, R, axis)
      if (c === null) {
        // no printed size / no face to compare: back to the plain rule (the row goes once its label is edited)
        if (!i.sig || entitySig(s.unit, i.entityId) === i.sig) out.push(i)
      } else if (c.off) out.push(c.message === i.message ? i : { ...i, message: c.message })
      continue
    }
    // a dead end the trace flagged on a wall the user kept standing alone: his answer
    if (i.entityId && s.unit.walls.some((w) => w.standsAlone && (w.a === i.entityId || w.b === i.entityId))) continue
    if (!i.sig || entitySig(s.unit, i.entityId!) === i.sig) out.push(i)
  }
  return out
}

// ── Level 5 (founder 2026-10-09): the rooms printed on the sheet against the draft as it stands ─────────────────────

/** an unnamed room: the trace's "Space N" label, or a closed face with no label (core deriveRooms names it so too) */
export const isUnnamed = (r: Room): boolean => /^Space \d+$/i.test(r.name)
/** a printed name this close to an unnamed room names it (m): the name printed across the room's line, or beside it */
export const NEAR_M = 1

/**
 * Where a printed room name stands: on a closed room of its name (`done`), in no closed room (`open`), in a room named
 * for another printed name (`merged`), or on / within NEAR_M of an unnamed room (`unnamed`, `d` m off).
 */
export type RoomState = { s: 'done' } | { s: 'open' } | { s: 'merged'; into: Room } | { s: 'unnamed'; room: Room; d: number }

export const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/** p's distance to the polygon's outline; 0 inside */
function distTo(p: Pt, poly: Pt[]): number {
  if (pointInPolygon(p, poly)) return 0
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)) : 0
    best = Math.min(best, Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)))
  }
  return best
}

/** The smallest room around p (deriveRooms' own rule for a label), or -1. */
export function roomIndexAt(p: Pt, rooms: Room[], polys: Pt[][]): number {
  let f = -1
  rooms.forEach((r, k) => {
    if (pointInPolygon(p, polys[k]) && (f < 0 || r.areaSqm < rooms[f].areaSqm)) f = k
  })
  return f
}

/** Each printed name's state in `u` (aligned with `printed`). An unnamed room goes to one name: the nearest. */
export function roomStates(u: Unit, rooms: Room[], printed: PrintedRoom[]): RoomState[] {
  const polys = rooms.map((r) => roomPolygon(r, u))
  const face = printed.map((p) => roomIndexAt(p.at, rooms, polys))
  const st: RoomState[] = printed.map((p, i) => {
    const f = face[i]
    if (f < 0) return { s: 'open' }
    const r = rooms[f]
    if (isUnnamed(r)) return { s: 'unnamed', room: r, d: 0 }
    if (sameName(r.name, p.name)) return { s: 'done' }
    // the room carries another printed name in it; none does (renamed by hand): the first printed name in it counts
    const mine = printed.findIndex((q, j) => face[j] === f && sameName(q.name, r.name))
    return (mine >= 0 ? mine : face.indexOf(f)) === i ? { s: 'done' } : { s: 'merged', into: r }
  })
  // a room of its name beside it, its own (no other printed name of that name in it): done — "Name it" on the room
  // the name was printed across, or a room he named so
  printed.forEach((p, i) => {
    if (st[i].s === 'done') return
    if (rooms.some((r, k) => sameName(r.name, p.name) && distTo(p.at, polys[k]) <= NEAR_M && !printed.some((q, j) => j !== i && face[j] === k && sameName(q.name, r.name)))) st[i] = { s: 'done' }
  })
  const pairs: { i: number; k: number; d: number }[] = []
  printed.forEach((p, i) => {
    if (st[i].s !== 'done') rooms.forEach((r, k) => isUnnamed(r) && pairs.push({ i, k, d: face[i] === k ? 0 : distTo(p.at, polys[k]) }))
  })
  const roomTaken = new Set<number>(), named = new Set<number>()
  for (const { i, k, d } of pairs.filter((x) => x.d <= NEAR_M).sort((p, q) => p.d - q.d)) {
    if (roomTaken.has(k) || named.has(i)) continue
    roomTaken.add(k)
    named.add(i)
    st[i] = { s: 'unnamed', room: rooms[k], d }
  }
  // a name inside an unnamed room another name took: it shares that room
  return st.map((x, i): RoomState => (x.s === 'unnamed' && !named.has(i) ? { s: 'merged', into: x.room } : x))
}

/** the room count against the sheet, as it stands: "17 of 18 printed rooms closed and named — missing: …" + the area */
export function roomCount(u: Unit, rooms: Room[], stats: AutoTraceStats): string | null {
  const printed = stats.printed ?? []
  if (!printed.length) return null
  const st = roomStates(u, rooms, printed)
  const missing = printed.filter((_, i) => st[i].s !== 'done').map((p) => p.name)
  const n = printed.length
  const line = missing.length ? `${n - missing.length} of ${n} printed rooms closed and named — missing: ${missing.join(', ')}` : `All ${n} printed rooms closed and named`
  const sum = rooms.reduce((t, r) => t + r.areaSqm, 0)
  return stats.wantSqm ? `${line}. The closed rooms add up to ${Math.round(sqmToSqft(sum))} sft; the printed flat area gives about ${Math.round(sqmToSqft(stats.wantSqm))}.` : `${line}.`
}

/** a room row's index in `printed` (its name read at its spot) */
export const printedIndex = (printed: PrintedRoom[], i: Pick<ReviewItem, 'room' | 'at'>): number =>
  printed.findIndex((p) => p.name === i.room && p.at.x === i.at.x && p.at.y === i.at.y)

/** the row for a printed name not yet on a closed, named room: which room, where, and why */
export function roomRow(p: PrintedRoom, s: RoomState, id = newId()): ReviewItem {
  const base = { id, at: p.at, room: p.name }
  if (s.s === 'unnamed')
    return { ...base, kind: 'unlabelled', entityId: s.room.id, message: s.d < 0.05 ? `${s.room.name} — the printed name ${p.name} is in it` : `${s.room.name} — printed name ${p.name} is ${s.d.toFixed(1)} m away` }
  if (s.s === 'merged') return { ...base, kind: 'unclosed', message: `${p.name} shares ${s.into.name}'s room — no wall between them` }
  return { ...base, kind: 'unclosed', message: `${p.name} is open — no closed room around its name` }
}

/** The room rows after a trace: one per printed name that is not on a closed, named room. */
export function roomRows(u: Unit, rooms: Room[], printed: PrintedRoom[]): ReviewItem[] {
  const st = roomStates(u, rooms, printed)
  return printed.flatMap((p, i) => (st[i].s === 'done' ? [] : [roomRow(p, st[i])]))
}
