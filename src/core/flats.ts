/**
 * The flats of a whole-floor drawing (founder 2026-10-06) — DERIVED, never stored (invariant 1's spirit: no flat polygons,
 * no room lists). Rooms joined through a door, passage or slider on a shared wall are one flat (a window joins nothing;
 * a zone line — height 0, no wall at all — joins like a passage). The common core belongs to no flat and stops the walk:
 * lobbies, shafts, gym / community / guard rooms, outdoor zones, and 'other' rooms named as the levels and auto-trace name
 * the core ("Lobby", "Stair", "Lift", "Hoistway" — they have no kind of their own). A group of rooms is a flat when it
 * holds a bedroom and another room, a "Type A" label, or a pin; anything else stays loose, in no flat (a room alone: its
 * door is missing, or it has none — a planter behind a planter edge, a closed store; a ground floor's toilets).
 *
 * The override: RoomLabel.flat pins its room to the flat of that name whatever its doors ('' = in no flat); a pinned
 * room joins nothing through its doors. Names: a label of kind 'other' reading "TYPE-A ±2736 SFT" inside the flat names
 * it "Type A" and gives `printedSqft` (such a label names no room: graph.flatTypeOf); else "Flat N" by place, west → east,
 * then north → south.
 */
import { roomAt } from './geometry'
import { flatTypeOf } from './graph'
import { isOutdoor } from './index'
import type { Id, Room, RoomKind, Unit } from './types'

export interface Flat {
  /** its first room's id: stable while that room stays in it */
  key: string
  name: string
  roomIds: Id[]
  areaSqm: number
  /** from its "TYPE-A ±2736 SFT" label, when that label prints an area */
  printedSqft?: number
}

const CORE_KINDS: ReadonlySet<RoomKind> = new Set<RoomKind>(['lobby', 'shaft', 'gym', 'community', 'guard'])
const CORE_NAME = /\b(lobby|stairs?|staircase|lifts?|hoistway|elevators?)\b/i
const SFT = /(\d[\d,]{2,6})\s*(?:sft|sq\.?\s*ft|s\.f\.t)/i

/** In no flat by itself: the common core (a pin decides instead when there is one). */
export const isCore = (r: Pick<Room, 'kind' | 'name'>): boolean => CORE_KINDS.has(r.kind) || isOutdoor(r.kind) || (r.kind === 'other' && CORE_NAME.test(r.name))

export function deriveFlats(unit: Pick<Unit, 'vertices' | 'walls' | 'roomLabels'>, rooms: Room[]): Flat[] {
  const pin = new Map(unit.roomLabels.map((l) => [l.id, l.flat]))
  // union-find over the rooms the door walk may take
  const up = new Map<Id, Id>()
  for (const r of rooms) if (pin.get(r.id) === undefined && !isCore(r)) up.set(r.id, r.id)
  const root = (id: Id): Id => (up.get(id) === id ? id : root(up.get(id)!))
  const byWall = new Map<Id, Id[]>()
  for (const r of rooms) for (const w of new Set(r.wallIds)) if (up.has(r.id)) byWall.set(w, [...(byWall.get(w) ?? []), r.id])
  for (const w of unit.walls) {
    const ids = byWall.get(w.id)
    if (!ids || ids.length < 2 || (w.heightM > 0 && !w.openings.some((o) => o.kind !== 'window'))) continue
    for (const id of ids.slice(1)) up.set(root(id), root(ids[0]))
  }
  const groups = new Map<Id, Room[]>()
  for (const r of rooms) if (up.has(r.id)) groups.set(root(r.id), [...(groups.get(root(r.id)) ?? []), r])

  // a "TYPE-A ±2736 SFT" label (graph.flatTypeOf) names the group whose room it stands in
  const typed = new Map<Id, { name: string; sqft?: number }>()
  for (const l of unit.roomLabels) {
    const name = flatTypeOf(l)
    const r = name && roomAt(l, rooms, unit)
    if (!name || !r || !up.has(r.id) || typed.has(root(r.id))) continue
    const s = SFT.exec(`${l.name} ${l.printedSize ?? ''}`)
    typed.set(root(r.id), { name, ...(s ? { sqft: Number(s[1].replace(/,/g, '')) } : {}) })
  }

  const centre = (rs: Room[]) => {
    const a = rs.reduce((t, r) => t + r.areaSqm, 0) || 1
    return { x: rs.reduce((t, r) => t + r.centroid.x * r.areaSqm, 0) / a, y: rs.reduce((t, r) => t + r.centroid.y * r.areaSqm, 0) / a }
  }
  let n = 0
  // ponytail: "Flat N" follows the place, so a reflected floor (mirrorUnit) renumbers them — and a pin naming one moves
  // with the number; a "Type A" label or a pinned new name is the stable kind
  const flats = [...groups]
    .filter(([k, rs]) => typed.has(k) || (rs.length > 1 && rs.some((r) => r.kind === 'bed')))
    .map(([k, rs]) => ({ k, rs, c: centre(rs) }))
    .sort((p, q) => p.c.x - q.c.x || p.c.y - q.c.y)
    .map(({ k, rs }): { name: string; rs: Room[]; sqft?: number } => ({ name: typed.get(k)?.name ?? `Flat ${++n}`, rs, sqft: typed.get(k)?.sqft }))
  // pinned rooms join the flat of their name, else make it
  for (const r of rooms) {
    const name = pin.get(r.id)
    if (!name) continue
    const f = flats.find((x) => x.name === name)
    if (f) f.rs.push(r)
    else flats.push({ name, rs: [r] })
  }
  return flats.map(({ name, rs, sqft }) => {
    const ids = new Set(rs.map((r) => r.id))
    const roomIds = rooms.filter((r) => ids.has(r.id)).map((r) => r.id)
    return { key: roomIds[0], name, roomIds, areaSqm: rs.reduce((t, r) => t + r.areaSqm, 0), ...(sqft ? { printedSqft: sqft } : {}) }
  })
}
