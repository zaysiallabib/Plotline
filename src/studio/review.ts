/**
 * Auto-trace in the Studio's state: the result import (ONE undo step) and the "Check these" review list.
 * Wraps model.reducer instead of living in it: model.ts is shared with the buyer viewer's bundle, this file is not.
 */
import { newId } from '../core'
import type { Id, Unit } from '../core'
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

/** The review items still to look at: the unit is still the trace's, not dismissed, their entity not edited since. */
export function openReview(s: StudioState): Review['items'] {
  if (!s.review || s.review.unitId !== s.unit.id) return []
  return s.review.items.filter((i) => !i.sig || entitySig(s.unit, i.entityId!) === i.sig)
}
