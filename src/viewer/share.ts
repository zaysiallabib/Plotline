/** Share links: `?c=<base64url(JSON.stringify(Configuration))>`, and BDT formatting. */
import * as core from '../core'
import type { Configuration, FinishSlot, Pt, Room, Unit } from '../core'
import { faceWallId, roomKey, slotFor, wallKey } from '../furnish/finishes'

export function encodeConfig(cfg: Configuration): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(cfg))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * The buyer link: this route, the floor if one was picked in the Building view (`?floor=`), the finishes. Nothing else
 * from the address, so a staff `?staff=1` never reaches a buyer.
 */
export function shareUrl(loc: { origin: string; pathname: string; search: string }, floor: number | undefined, cfg: Configuration): string {
  const f = new URLSearchParams(loc.search).get('floor') ? `floor=${floor}&` : ''
  return `${loc.origin}${loc.pathname}?${f}c=${encodeConfig(cfg)}`
}

export type FinishKeys = Map<string, { slot: FinishSlot; scope: string }>

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
/** A plan direction by the compass (northDeg: true north, degrees clockwise from plan-up; plan y points down). */
const compass = (d: Pt, northDeg: number): string => COMPASS[Math.round((((((Math.atan2(d.x, -d.y) * 180) / Math.PI - northDeg) % 360) + 360) % 360) / 45) % 8]

/**
 * Every one-room and one-wall key this unit offers (finishes.ts roomKey / wallKey), with the slot covering it and its
 * name for a person: "Bed-1 · floor", "Living room · all walls", "Living room · north wall" (the side of the room the wall
 * stands on). A wall face is found as the 3D finds it (PlotlineScene.buildWall: the room just off its middle, each side).
 * Outdoor zones take no buyer finish.
 */
export function finishKeys(unit: Unit, rooms: Room[]): FinishKeys {
  const keys: FinishKeys = new Map()
  const indoor = (r: Room | null | undefined) => (r && !core.isOutdoor(r.kind) ? r : null)
  for (const r of rooms) {
    if (!indoor(r)) continue
    for (const t of ['floor', 'wall', 'ceiling'] as const) {
      const slot = slotFor(unit.finishSlots, r.id, t)
      if (slot) keys.set(roomKey(r.id, t), { slot, scope: `${r.name} · ${t === 'wall' ? 'all walls' : t}` })
    }
  }
  for (const w of unit.walls) {
    const f = core.wallFrame(w, unit.vertices)
    const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
    const off = w.thicknessM / 2 + 0.05
    for (const s of [1, -1]) {
      const r = indoor(core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, unit))
      const slot = r && slotFor(unit.finishSlots, r.id, 'wall')
      if (!r || !slot) continue
      const side = compass({ x: -s * f.normal.x, y: -s * f.normal.y }, unit.northDeg ?? 0) // from the room toward the wall
      keys.set(wallKey(faceWallId(unit, r, w.id), r.id), { slot, scope: `${r.name} · ${side} wall` })
    }
  }
  return keys
}

/**
 * Unknown slot/option ids are dropped silently (spec §3.7); so is a one-room / one-wall key this unit does not offer
 * (`keys`: finishKeys) or whose option is not in the slot covering it.
 */
export function decodeConfig(s: string | null, slots: FinishSlot[], keys?: FinishKeys): Configuration {
  if (!s) return {}
  try {
    const raw = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))) as Record<string, unknown>
    const cfg: Configuration = {}
    for (const [key, opt] of Object.entries(raw)) {
      const slot = slots.find((x) => x.id === key) ?? keys?.get(key)?.slot
      if (slot && typeof opt === 'string' && slot.options.some((o) => o.id === opt)) cfg[key] = opt
    }
    return cfg
  } catch {
    return {}
  }
}

/** Bangladeshi digit grouping: 185000 → "1,85,000", 12500000 → "1,25,00,000". */
export function formatTaka(n: number): string {
  const s = String(Math.abs(Math.trunc(n)))
  if (s.length <= 3) return s
  const head = s.slice(0, -3)
  return head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3)
}

/** 0 → "Included", +185000 → "+৳1,85,000", −40000 → "−৳40,000". */
export function formatDelta(n: number): string {
  if (n === 0) return 'Included'
  return `${n > 0 ? '+' : '−'}৳${formatTaka(n)}`
}
