/**
 * Walking the dog-leg stair (procedural.ts stair, placed in a stair room by presets.ts stairwell) floor to floor (founder
 * 2026-11-20: "if i climb a stair i cannot reach the upper floor there is a block on the way"). Its own frame: x across
 * (flight A on −x, flight B on +x, a 0.1 m well between), z toward its front (+z, where you step on). Flight A climbs from
 * the front to the half landing at the back; flight B climbs from the landing back to the front, into the floor above —
 * so flight B is the way between floors: stepped onto from the landing it is "up", walked into from this floor's own
 * floor (under it, where the flight from the floor below arrives) it is "down". Pure: the walker (PlotlineScene) and the
 * tests read it.
 */
import { roomAt, wallFrame, type FurniturePlacement, type Id, type Pt, type Room, type Unit } from '../core'
import { kitAsset } from './kit'
import { STAIR_D, STAIR_RISE } from './procedural.meta'

const RISER = STAIR_RISE / 18
const TREAD = 0.25
/** the half landing's front edge */
const ZL = -STAIR_D / 2 + 1.1
/** the half landing's height: 9 risers */
export const LANDING_M = 9 * RISER

export const isStair = (p: FurniturePlacement): boolean => !p.removed && kitAsset(p.assetId)?.kind === 'stair'

const turn = (p: FurniturePlacement) => (p.rotationDeg * Math.PI) / 180
/** plan point → the stair's frame */
function local(p: FurniturePlacement, at: Pt): { x: number; z: number } {
  const t = turn(p)
  const [dx, dy] = [at.x - p.x, at.y - p.y]
  return { x: dx * Math.cos(t) + dy * Math.sin(t), z: -dx * Math.sin(t) + dy * Math.cos(t) }
}
/** the stair's frame → plan */
function plan(p: FurniturePlacement, x: number, z: number): Pt {
  const t = turn(p)
  return { x: p.x + x * Math.cos(t) - z * Math.sin(t), y: p.y + x * Math.sin(t) + z * Math.cos(t) }
}
const width = (p: FurniturePlacement) => kitAsset(p.assetId)?.sizeM.x ?? 2.4
/** the middle of a flight across */
const flightX = (p: FurniturePlacement) => (width(p) + 0.1) / 4

/**
 * Where plan point `at` is on stair `p`: on flight A or the half landing (`h` = the tread's height above the stair's floor),
 * on flight B ('between': up from the landing, down from this floor), or off it (null).
 */
export function stairSpot(p: FurniturePlacement, at: Pt): { part: 'flight' | 'landing'; h: number } | { part: 'between' } | null {
  const { x, z } = local(p, at)
  if (Math.abs(x) > width(p) / 2 || Math.abs(z) > STAIR_D / 2) return null
  if (z <= ZL) return { part: 'landing', h: LANDING_M }
  if (x >= 0) return { part: 'between' }
  return { part: 'flight', h: Math.min(8, Math.max(1, Math.ceil((STAIR_D / 2 - z) / TREAD))) * RISER }
}

/**
 * Where a walker arrives on stair `p`'s floor, always on that floor itself, facing out of the stair: come up from the
 * floor below → in front of flight B (he walked up it onto this floor); come down from the floor above → at the foot of
 * flight A, the last flight down to this floor (session 31: he used to land on the half landing, 1.5 m up, between floors).
 */
export function stairArrival(p: FurniturePlacement, from: 'below' | 'above'): { at: Pt; face: Pt } {
  const front = { x: -Math.sin(turn(p)), y: Math.cos(turn(p)) }
  return { at: plan(p, (from === 'below' ? 1 : -1) * flightX(p), STAIR_D / 2 + 0.45), face: front }
}

/** A stair room (a stair core, a fire stair, a flat's own stair): named so, as presets.ts furnishes it. */
export const isStairRoom = (r: Pick<Room, 'name'>): boolean => /\bstair/i.test(r.name)

/**
 * The stair room at plan point `near` (or the nearest one, its middle within 3 m) — where a walker taking the stair from
 * the next floor arrives (ViewerApp takeStair): at its stair (stairArrival), or in the room's middle when it has none drawn
 * (too small for a dog-leg); either way facing the room's nearest door, into the floor. `door`: that door's id; `aside`:
 * along the stair's front, away from that door (where the viewer turns him when the door is a step away: spawn.ts
 * arrivalFace). null: no stair room there.
 */
export function arriveBy(unit: Unit, rooms: Room[], near: Pt, from: 'below' | 'above'): { at: Pt; face: Pt; door?: Id; aside?: Pt } | null {
  const here = roomAt(near, rooms, unit)
  const dist = (r: Room) => Math.hypot(r.centroid.x - near.x, r.centroid.y - near.y)
  const room = here && isStairRoom(here) ? here : rooms.filter((r) => isStairRoom(r) && dist(r) <= 3).sort((a, b) => dist(a) - dist(b))[0]
  if (!room) return null
  const stair = unit.furniture.filter((p) => p.roomId === room.id && isStair(p)).sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y))[0]
  const a = stair ? stairArrival(stair, from) : { at: room.centroid, face: { x: 0, y: -1 } }
  // facing the room's nearest door, the way on — not the wall a stair's front often meets
  const doors = unit.walls.filter((w) => room.wallIds.includes(w.id)).flatMap((w) => {
    const f = wallFrame(w, unit.vertices)
    return w.openings.filter((o) => o.kind !== 'window').map((o) => ({ id: o.id, x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2) - a.at.x, y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) - a.at.y }))
  })
  const d = doors.sort((p, q) => Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y))[0]
  const n = d && Math.hypot(d.x, d.y)
  const across = stair && { x: Math.cos(turn(stair)), y: Math.sin(turn(stair)) } // the stair's front edge, flight A → flight B
  const aside = across && d && (across.x * d.x + across.y * d.y > 0 ? { x: -across.x, y: -across.y } : across)
  return { at: a.at, face: d && n > 0.1 ? { x: d.x / n, y: d.y / n } : a.face, ...(d && { door: d.id }), ...(aside && { aside }) }
}
