/**
 * Arrange (staff only; CLAUDE.md Decisions 2026-09-27): move, turn and resize the flat's furniture in the 3D view with
 * the Studio's rules (src/studio/furniture.ts). Pure glue: who is staff, the layout saved in the browser and shared with
 * the Studio's tool F, the undo stack, and where a drag in the 3D view puts a piece.
 */
import type { FurniturePlacement, Id, Pt, Room, Unit } from '../core'
import { hangOn, layerOf, movePiece, pieceAt, surfaceOf, type Move, type WallFace } from '../studio/furniture'

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

/** What a click on piece `id` picks up: a piece resting on another (a TV on its unit, cushions) → that one, as the Studio's pieceAt. */
export function baseOf(pieces: FurniturePlacement[], id: Id): FurniturePlacement | null {
  const p = pieces.find((x) => x.id === id)
  if (!p || surfaceOf(p) !== 'floor' || layerOf(p) !== 1) return p ?? null
  return pieceAt(pieces.filter((o) => o.roomId === p.roomId), p) ?? p
}

/**
 * Piece `id` (or what it rests on, baseOf) dragged to `t`, on the Studio's rules (movePiece: 1 ft grid, wall snap,
 * refusals, riders along). A wall piece goes onto the wall under the pointer — back to it, front into the room, sliding
 * in 1 ft steps along it — so it hops walls; the others slide on their plane.
 */
export function dragTo(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, t: DragTarget): Move | null {
  const g = pieces.find((x) => x.id === id)
  const p = baseOf(pieces, id)
  if (!g || !p) return null
  if (surfaceOf(p) !== 'wall') return t.at && movePiece(unit, rooms, pieces, p.id, { x: t.at.x + p.x - g.x, y: t.at.y + p.y - g.y }, p.rotationDeg)
  return t.wall && hangOn(unit, rooms, pieces, id, t.wall)
}
