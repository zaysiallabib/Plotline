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

/** Distance from the room to spawn away from the two walls meeting at the chosen corner. */
export const VIEW_INSET = 0.4

/**
 * Rooms-list jump: stand in the inner corner farthest from the room's furniture centroid
 * (fallback: the midpoint of the longest wall), VIEW_INSET from both walls of that corner,
 * facing that centroid (fallback: room centroid). The far corner keeps the camera off the
 * wall in small rooms; a corner is always the farthest boundary point from any target.
 */
export function roomView(room: Room, unit: Unit): { p: Pt; face: Pt } {
  const inner = core.roomInnerPolygon(room, unit)
  const items = unit.furniture.filter((f) => f.roomId === room.id)
  let target: Pt
  if (items.length) {
    target = { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length }
  } else {
    let best = { len: -1, mid: room.centroid }
    inner.forEach((a, i) => {
      const b = inner[(i + 1) % inner.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    })
    target = best.mid
  }
  const n = inner.length
  const far = inner.map((v, i) => ({ v, i, d: Math.hypot(v.x - target.x, v.y - target.y) })).sort((a, b) => b.d - a.d)
  for (const { v, i } of far) {
    // inward normals of the two edges meeting at v (loops are positive: n = (−d.y, d.x))
    const prev = inner[(i - 1 + n) % n]
    const next = inner[(i + 1) % n]
    const inward = (a: Pt, b: Pt): Pt => {
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
      return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
    }
    const p = add(add(v, inward(prev, v), VIEW_INSET), inward(v, next), VIEW_INSET)
    if (!core.pointInPolygon(p, inner)) continue
    const face = { x: target.x - p.x, y: target.y - p.y }
    const d = Math.hypot(face.x, face.y)
    if (d < 0.2) continue // target sits in this corner: face nothing useful, try the next
    return { p, face: { x: face.x / d, y: face.y / d } }
  }
  const c = room.centroid
  const d = Math.hypot(target.x - c.x, target.y - c.y) || 1
  return { p: c, face: { x: (target.x - c.x) / d, y: (target.y - c.y) / d } }
}
