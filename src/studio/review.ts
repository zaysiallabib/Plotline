/**
 * Auto-trace in the Studio's state: the result import (ONE undo step) and the "Check these" review list.
 * Wraps model.reducer instead of living in it: model.ts is shared with the buyer viewer's bundle, this file is not.
 */
import { deriveRooms, formatFeetInches, mainRectangle, newId, parseLength, roomInnerPolygon } from '../core'
import type { Id, Room, Unit } from '../core'
import type { AutoTraceResult, AutoTraceStats, ReviewItem } from '../trace/types'
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
      const items = a.result.review.map((i) => ({ ...i, sig: i.entityId ? entitySig(t.unit, i.entityId) : undefined }))
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
      return reducer(t.unit === s.unit ? s : t, { type: 'toast', text: t.unit === s.unit ? 'Nothing to fix there any more' : `${a.label} — Ctrl+Z undoes it` })
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
 * A size-mismatch row re-checked against the unit as it stands: the room's drawn inside vs the label's printed size,
 * the better of the two pairings. null = nothing to check any more (label gone, printed size removed, or the room has
 * no closed face — then the row is not about the size); otherwise whether it still differs, and the current wording.
 */
export function sizeCheck(u: Unit, labelId: Id, rooms: Room[], axis?: number): { off: boolean; message: string } | null {
  const l = u.roomLabels.find((x) => x.id === labelId)
  const printed = parsePrintedSize(l?.printedSize)
  if (!l || !printed) return null
  const r = rooms.find((x) => x.id === labelId)
  if (!r) return null
  const e = drawnSize(u, r, axis)
  const [a, b] = printed
  const pair = Math.abs(e.w - a) + Math.abs(e.h - b) <= Math.abs(e.w - b) + Math.abs(e.h - a) ? [a, b] : [b, a]
  const off = Math.abs(e.w - pair[0]) > SIZE_TOL_M || Math.abs(e.h - pair[1]) > SIZE_TOL_M
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
  const out: Review['items'] = []
  for (const i of s.review.items) {
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
