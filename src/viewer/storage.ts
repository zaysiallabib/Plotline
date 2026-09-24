/**
 * Comment pins, Phase 0: localStorage `plotline.pins.<unitId>` as APPEND-ONLY
 * rows. Removal = a `{removedId}` row that supersedes the pin on read
 * (CLAUDE.md invariant 6). The Supabase `events` table replaces this later.
 */
import type { Id } from '../core'
import type { PickKind } from '../three/PlotlineScene'

export interface PinAnchor {
  kind: PickKind
  entityId: Id
  /** hit point in the entity's local frame (see PickHit.localOffset) */
  offset?: { u: number; v: number }
}

export interface Pin {
  id: Id
  anchor: PinAnchor
  /** world point at creation — for rendering only; the anchor is the identity */
  point: { x: number; y: number; z: number }
  roomId?: Id
  text: string
  createdAt: string
}

type Row = Pin | { removedId: Id; createdAt: string }

const key = (unitId: Id) => `plotline.pins.${unitId}`

function rows(unitId: Id): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(unitId)) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function append(unitId: Id, row: Row): void {
  try {
    localStorage.setItem(key(unitId), JSON.stringify([...rows(unitId), row]))
  } catch (e) {
    console.warn('[plotline] could not save note', e)
  }
}

export function readPins(unitId: Id): Pin[] {
  const removed = new Set<Id>()
  const pins: Pin[] = []
  for (const r of rows(unitId)) {
    if ('removedId' in r) removed.add(r.removedId)
    else pins.push(r)
  }
  return pins.filter((p) => !removed.has(p.id))
}

export const appendPin = (unitId: Id, pin: Pin): void => append(unitId, pin)
export const removePin = (unitId: Id, id: Id): void => append(unitId, { removedId: id, createdAt: new Date().toISOString() })
