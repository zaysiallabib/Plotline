/**
 * Arrange (staff only; CLAUDE.md Decisions 2026-09-27): move, turn and resize the flat's furniture in the 3D view with
 * the Studio's rules (src/studio/furniture.ts). Pure glue: who is staff, the layout saved in the browser and shared with
 * the Studio's tool F, the undo stack, and where a drag in the 3D view puts a piece.
 */
import type { FurniturePlacement, Id, Pt, Room, Unit } from '../core'
import { hangOn, layerOf, movePiece, pieceAt, placePiece, surfaceOf, type Move, type WallFace } from '../studio/furniture'
import { isUnit, normalizeUnit } from '../studio/model'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const STAFF_KEY = 'plotline.staff'

/**
 * Staff = the Studio has run in this browser (it sets the flag), or `?staff=1` (the load screen's "Staff mode" link),
 * which sets it too; `?staff=0` forgets it (see what a buyer sees). Share links never carry it (share.ts shareUrl).
 */
export function isStaff(search: string, store?: Store): boolean {
  try {
    const s = store ?? localStorage
    const q = new URLSearchParams(search).get('staff')
    if (q === '1') s.setItem(STAFF_KEY, '1')
    if (q === '0') s.removeItem(STAFF_KEY)
    return s.getItem(STAFF_KEY) === '1'
  } catch {
    return false // storage blocked: nobody is staff
  }
}

/** A buyer's link (Share: `?c=`) never offers staff mode: its load screen has no "Staff mode" or Studio link. */
export const isShareLink = (search: string): boolean => new URLSearchParams(search).has('c')

/** The arranged layout: the unit's whole FurniturePlacement[], written by Arrange and by the Studio's tool F. */
export const layoutKey = (unitId: Id): string => `plotline.layout.${unitId}`

export function readLayout(unitId: Id, store?: Store): FurniturePlacement[] | null {
  try {
    const v = JSON.parse((store ?? localStorage).getItem(layoutKey(unitId)) ?? 'null') as FurniturePlacement[] | null
    const ok = (p: FurniturePlacement) => p && typeof p.id === 'string' && typeof p.assetId === 'string' && [p.x, p.y, p.rotationDeg].every(Number.isFinite)
    return Array.isArray(v) && v.length && v.every(ok) ? v : null
  } catch {
    return null
  }
}

/** Saves the layout; none, or the unit's own (`base`: its JSON's, else the presets) removes the key, so it follows its JSON again. */
export function saveLayout(unitId: Id, pieces: FurniturePlacement[] | null, base?: FurniturePlacement[], store?: Store): void {
  try {
    const s = store ?? localStorage
    if (!pieces?.length || (base && JSON.stringify(pieces) === JSON.stringify(base))) s.removeItem(layoutKey(unitId))
    else s.setItem(layoutKey(unitId), JSON.stringify(pieces))
  } catch (e) {
    console.warn('[plotline] could not save the layout', e)
  }
}

/** The committed layout and the ones before it (Ctrl+Z). */
export interface Steps {
  pieces: FurniturePlacement[]
  past: FurniturePlacement[][]
}
const UNDO_MAX = 50
export const pushStep = (h: Steps, pieces: FurniturePlacement[]): Steps => ({ pieces, past: [...h.past, h.pieces].slice(-UNDO_MAX) })
export const undoStep = (h: Steps): Steps => (h.past.length ? { pieces: h.past[h.past.length - 1], past: h.past.slice(0, -1) } : h)

/** Where a drag slides a piece (studio/furniture.ts): walls, ceiling or floor. */
export { surfaceOf }

/**
 * The pointer during a drag (plan metres): `at` = where the piece's centre goes on the horizontal plane it was grabbed
 * at (grab offset kept); `wall` = the wall face under the pointer, `n` its normal toward the viewer's side.
 */
export interface DragTarget {
  at: Pt | null
  wall: WallFace | null
}

/** What a drag of piece `id` moves: a piece resting on another (a TV on its unit, cushions) → that one, as the Studio's pieceAt. */
export function baseOf(pieces: FurniturePlacement[], id: Id): FurniturePlacement | null {
  const p = pieces.find((x) => x.id === id)
  if (!p || surfaceOf(p) !== 'floor' || layerOf(p) !== 1) return p ?? null
  return pieceAt(pieces.filter((o) => o.roomId === p.roomId), p) ?? p
}

/**
 * Piece `id` (or what it rests on, baseOf) dragged to `t`, on the Studio's rules (movePiece: 3" grid, wall snap,
 * refusals, riders along), turned to `rotationDeg` (default: as it stands). A wall piece goes onto the wall under the
 * pointer — back to it, front into the room, sliding in 3" steps along it — so it hops walls; the others slide on their plane.
 */
export function dragTo(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, t: DragTarget, rotationDeg?: number): Move | null {
  const g = pieces.find((x) => x.id === id)
  const p = baseOf(pieces, id)
  if (!g || !p) return null
  if (surfaceOf(p) !== 'wall') return t.at && movePiece(unit, rooms, pieces, p.id, { x: t.at.x + p.x - g.x, y: t.at.y + p.y - g.y }, rotationDeg ?? p.rotationDeg)
  return t.wall && hangOn(unit, rooms, pieces, id, t.wall)
}

/**
 * A piece in hand (founder 2026-10-04: "where it does not fit, don't put it back — red and a warning, but I can still
 * move it, turn it, and place it where it fits"): a dragged piece, one picked up with G (also while walking with the
 * mouse locked), or a new one from the library (`assetId`). It follows the pointer on the Studio's rules; where they
 * refuse it, its candidate stays shown (red, `move.error` = why) and is never committed; it drops only where it fits;
 * Esc = the committed layout, where it was picked up. The rules themselves are dragTo / placePiece, unchanged.
 */
export interface Held {
  /** the piece the pointer holds (dragTo moves what it rests on); a library piece's new id */
  id: Id
  /** a library piece, not in the layout yet */
  assetId?: string
  /** its turn: R adds 90° */
  rot: number
  /** the last pointer target that put it somewhere (R turns it there) */
  at: DragTarget | null
  /** where it is now: the candidate layout; `error` = why it may not stay (null: it may); null = nowhere yet */
  move: Move | null
}

/** Piece `id` (a drag's first frame, or G) picked up as it stands. */
export const pickUp = (pieces: FurniturePlacement[], id: Id): Held => ({ id, rot: baseOf(pieces, id)?.rotationDeg ?? 0, at: null, move: null })

/**
 * The held piece at pointer target `t` turned `rot`, on the rules (a refused spot is kept, with its reason); a target
 * that puts it nowhere (the sky out of a window, no wall under a TV) keeps it where it was.
 */
export function holdAt(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], h: Held, t: DragTarget | null = h.at, rot = h.rot): Held {
  const p = t && (t.at ?? t.wall?.p)
  const move = !t ? null : h.assetId ? p && placePiece(unit, rooms, pieces, h.assetId, p, rot, h.id, t.wall) : dragTo(unit, rooms, pieces, h.id, t, rot)
  return move ? { ...h, at: t, rot, move } : { ...h, rot }
}

/** R: a quarter turn on, where it is (a backed piece by a wall still turns its back to it, as any move). */
export const turnHeld = (unit: Unit, rooms: Room[], pieces: FurniturePlacement[], h: Held): Held => holdAt(unit, rooms, pieces, h, h.at, h.rot + 90)

/** What a click / G / release commits: the layout with the piece where it is — only where it fits (null: it stays in hand). */
export const dropHeld = (h: Held): FurniturePlacement[] | null => (h.move && !h.move.error ? h.move.furniture : null)

// ── Edit openings (staff, founder 2026-10-04): a door / window / passage changed in the 3D view is a change to the plan
// the Studio opens — written into the Studio draft and the preview, so plan and 3D never disagree.
export const DRAFT_KEY = 'plotline.studio.draft'
export const PREVIEW_KEY = 'plotline.preview'
const planOf = (u: Unit): string => JSON.stringify([u.vertices, u.walls])
/** a stored draft is a Draft `{ unit, … }` or a bare Unit (StudioApp init accepts both) */
const unitIn = (x: unknown): Unit | null => (isUnit(x) ? x : isUnit((x as { unit?: unknown } | null)?.unit) ? (x as { unit: Unit }).unit : null)

/** Can this page's opening edits go into the Studio draft? 'ok': it holds this unit, its plan as shown here; 'other': another unit, or none; 'changed': this unit, its plan edited in the Studio since. */
export function draftState(unit: Unit, store?: Store): 'ok' | 'other' | 'changed' {
  try {
    const u = unitIn(JSON.parse((store ?? localStorage).getItem(DRAFT_KEY) ?? 'null'))
    if (!u || u.id !== unit.id) return 'other'
    return planOf(normalizeUnit(u)) === planOf(unit) ? 'ok' : 'changed'
  } catch {
    return 'other'
  }
}

/**
 * A committed opening edit: `after`'s walls (their openings) into the Studio draft and the preview, every other field of
 * theirs kept — only while the draft still holds `before`'s plan; else why not, and nothing is written.
 */
export function saveOpenings(before: Unit, after: Unit, store?: Store): 'ok' | 'other' | 'changed' | 'full' {
  const s = store ?? localStorage
  const why = draftState(before, s)
  if (why !== 'ok') return why
  try {
    for (const key of [DRAFT_KEY, PREVIEW_KEY]) {
      const d: unknown = JSON.parse(s.getItem(key) ?? 'null')
      const u = unitIn(d)
      if (!u || u.id !== after.id) continue
      const v = { ...u, walls: after.walls }
      s.setItem(key, JSON.stringify(isUnit(d) ? v : { ...(d as object), unit: v }))
    }
    return 'ok'
  } catch {
    return 'full' // ponytail: the draft may be written and the preview not; the Studio warns the same way when a draft outgrows storage
  }
}

/** `unit` as this page shows it becomes the Studio draft and the preview (a built-in unit, or not the draft) — what Edit openings then edits. */
export function makeDraft(unit: Unit, store?: Store): boolean {
  try {
    const s = store ?? localStorage
    s.setItem(DRAFT_KEY, JSON.stringify({ unit }))
    s.setItem(PREVIEW_KEY, JSON.stringify(unit))
    return true
  } catch {
    return false
  }
}
