/** Pure spawn/camera helpers for the viewer (no Three, no DOM) — Vitest-covered. */
import * as core from '../core'
import type { Pt, Room, Unit } from '../core'

const add = (a: Pt, b: Pt, s: number): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })

/**
 * PlotlineScene.spawnAt yaw for a plan-space facing direction: 0 = plan −y (world −Z),
 * positive turns left. Camera forward for yaw θ is world (−sin θ, 0, −cos θ) = plan (−sin θ, −cos θ).
 */
export const yawFor = (dir: Pt): number => Math.atan2(-dir.x, -dir.y)

const enterable = (r: Room | null): r is Room => !!r && r.kind !== 'other' && r.kind !== 'shaft'

/**
 * Entry spawn (PM rule): the FIRST `door` in walls[] order; stand 1.2 m from the door centre on the
 * side whose room is not 'other'/'shaft' (larger room wins when both qualify), facing away from the
 * door into that room. Falls back to the centroid of the largest living room (then any room).
 */
export function entrySpawn(unit: Unit, rooms: Room[]): { p: Pt; face: Pt } | null {
  for (const w of unit.walls) {
    const door = w.openings.find((o) => o.kind === 'door')
    if (!door) continue
    const f = core.wallFrame(w, unit.vertices)
    const at = add(f.origin, f.dir, door.offsetM + door.widthM / 2)
    const off = w.thicknessM / 2 + 0.05
    const front = core.roomAt(add(at, f.normal, off), rooms, unit)
    const back = core.roomAt(add(at, f.normal, -off), rooms, unit)
    let side = 0
    if (enterable(front) && enterable(back)) side = front.areaSqm >= back.areaSqm ? 1 : -1
    else if (enterable(front)) side = 1
    else if (enterable(back)) side = -1
    if (!side) break // first door only; a door between two shafts/lobbies means the unit has no usable entry
    const n = { x: f.normal.x * side, y: f.normal.y * side }
    return { p: add(at, n, w.thicknessM / 2 + 1.2), face: n }
  }
  const living = rooms.filter((r) => r.kind === 'living').sort((a, b) => b.areaSqm - a.areaSqm)[0] ?? rooms[0]
  return living ? { p: living.centroid, face: { x: 0, y: -1 } } : null
}

/** Centroid, facing the midpoint of the room's longest wall. */
export function roomView(room: Room, unit: Unit): { p: Pt; face: Pt } {
  const poly = core.roomPolygon(room, unit)
  let best = { len: -1, mid: poly[0] }
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  })
  const c = room.centroid
  const d = Math.hypot(best.mid.x - c.x, best.mid.y - c.y) || 1
  return { p: c, face: { x: (best.mid.x - c.x) / d, y: (best.mid.y - c.y) / d } }
}
