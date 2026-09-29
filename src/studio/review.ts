/**
 * Auto-trace in the Studio's state: the result import (ONE undo step) and the "Check these" review list.
 * Wraps model.reducer instead of living in it: model.ts is shared with the buyer viewer's bundle, this file is not.
 */
import { deriveRooms, formatFeetInches, newId, parseLength, roomInnerPolygon } from '../core'
import type { Id, Room, Unit } from '../core'
import type { AutoTraceResult, AutoTraceStats, ReviewItem } from '../trace/types'
import { entityPoints, findEntity, normalizeUnit, reducer, type Action, type StudioState } from './model'

/** = trace/ai AI_KEY_STORAGE (a test pins it), spelled out so the Studio chunk never pulls in the trace code */
export const AI_KEY = 'plotline.geminiKey'

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
      const unit = normalizeUnit({
        ...r,
        id: newId(),
        name: r.name || s.unit.name,
        projectName: r.projectName || s.unit.projectName,
        planImage: r.planImage && { ...r.planImage, src: s.planImage?.name ?? r.planImage.src },
      })
      const items = a.result.review.map((i) => ({ ...i, sig: i.entityId ? entitySig(unit, i.entityId) : undefined }))
      // drag-begin = the reducer's commit minus the unit: the unit before the trace goes on the undo stack, redo clears
      return { ...reducer(s, { type: 'drag-begin' }), unit, selection: [], chain: null, tool: 'select', review: { unitId: unit.id, items, stats: a.result.stats } }
    }
    case 'dismiss-review':
      return s.review ? { ...s, review: { ...s.review, items: s.review.items.filter((i) => i.id !== a.id) } } : s
    case 'restore':
      return { ...reducer(s, a), review: a.draft.review ?? null }
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

/** A room's inner size along the sheet's axes (the figure printed on the plan is the clear inside). */
export function drawnSize(u: Unit, room: Room, axis = sheetAxis(u)): { w: number; h: number } {
  const c = Math.cos(-axis), s = Math.sin(-axis)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of roomInnerPolygon(room, u)) {
    const x = p.x * c - p.y * s, y = p.x * s + p.y * c
    ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
  }
  return { w: x1 - x0, h: y1 - y0 }
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
    if (!i.sig || entitySig(s.unit, i.entityId!) === i.sig) out.push(i)
  }
  return out
}
