/** Pure spawn/camera helpers for the viewer (no Three, no DOM) — Vitest-covered. */
import * as core from '../core'
import type { FurniturePlacement, Pt, Room, Unit } from '../core'
import { heightRange, kitAsset } from '../furnish/kit'

const add = (a: Pt, b: Pt, s: number): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })
const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

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
/** Minimum distance from a stand point to a door/passage (a door needs max(this, widthM + 0.3) from its whole span). */
export const DOOR_CLEAR = 1.2
/** A wardrobe/shelf/tall (> 1.6 m) piece this close to the stand point fills the first view with a slab… */
const SLAB_NEAR = 1.5
/** …so that candidate loses this much of its distance-to-target score. */
const SLAB_PENALTY = 1.5

/** Distance from p to a placement's plan footprint (0 inside). rotationDeg is clockwise in y-down plan space. */
const footprintDist = (p: Pt, f: FurniturePlacement, size: { x: number; z: number }): number => {
  const r = (f.rotationDeg * Math.PI) / 180
  const s = f.scale ?? 1
  const dx = p.x - f.x
  const dy = p.y - f.y
  const u = Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) - (size.x * s) / 2
  const v = Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) - (size.z * s) / 2
  return Math.hypot(Math.max(u, 0), Math.max(v, 0))
}

const look = (p: Pt, target: Pt): { p: Pt; face: Pt } => {
  const d = Math.hypot(target.x - p.x, target.y - p.y) || 1
  return { p, face: { x: (target.x - p.x) / d, y: (target.y - p.y) / d } }
}

/**
 * Rooms-list jump. Candidates: every convex inner corner (VIEW_INSET from both walls), then every wall
 * midpoint (VIEW_INSET in). A candidate is out when it is outside the inner polygon, crowded by a third
 * edge, inside the footprint of anything reaching eye level (cabinets, wardrobe, TV), or near a door:
 * a door's whole span must be max(DOOR_CLEAR, widthM + 0.3) away — that covers its centre, its hinge
 * and the leaf's swing arc (radius widthM around the hinge); a passage (no leaf, may be a whole open
 * wall) only needs its centre DOOR_CLEAR away. Best = farthest from the furniture centroid (fallback:
 * the longest wall's midpoint), minus SLAB_PENALTY when a wardrobe/shelf/tall piece is within SLAB_NEAR.
 * Nothing qualifies: 0.9 m in from the first door/passage on its centreline. Always faces the target.
 */
export function roomView(room: Room, unit: Unit): { p: Pt; face: Pt } {
  const inner = core.roomInnerPolygon(room, unit)
  const n = inner.length
  const items = unit.furniture.filter((f) => f.roomId === room.id)
  let target: Pt
  if (items.length) {
    target = { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length }
  } else {
    let best = { len: -1, mid: room.centroid }
    inner.forEach((a, i) => {
      const b = inner[(i + 1) % n]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    })
    target = best.mid
  }

  const doors = room.wallIds.flatMap((id) => {
    const w = unit.walls.find((x) => x.id === id)
    if (!w) return []
    const f = core.wallFrame(w, unit.vertices)
    return w.openings
      .filter((o) => o.kind !== 'window')
      .map((o) => ({ o, w, f, a: add(f.origin, f.dir, o.offsetM), b: add(f.origin, f.dir, o.offsetM + o.widthM), c: add(f.origin, f.dir, o.offsetM + o.widthM / 2) }))
  })
  const clearOfDoors = (p: Pt) =>
    doors.every(({ o, a, b, c }) =>
      o.kind === 'door' ? segDist(p, a, b) >= Math.max(DOOR_CLEAR, o.widthM + 0.3) : Math.hypot(p.x - c.x, p.y - c.y) >= DOOR_CLEAR,
    )
  const pieces = items.flatMap((f) => {
    const k = kitAsset(f.assetId)
    return k ? [{ f, k, top: heightRange(k)[1] }] : []
  })

  // inward normal of edge a→b (loops are positive: n = (−d.y, d.x))
  const inward = (a: Pt, b: Pt): Pt => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
  }
  const candidates: Pt[] = []
  inner.forEach((v, i) => {
    const n1 = inward(inner[(i - 1 + n) % n], v)
    const n2 = inward(v, inner[(i + 1) % n])
    // convex corners turning > 20° only: a straight-through or reflex vertex is no corner to stand in.
    // (n1 + n2) / (1 + n1·n2) is exactly VIEW_INSET from both walls at any angle.
    if (n1.x * n2.y - n1.y * n2.x > 0.34) candidates.push(add(v, { x: n1.x + n2.x, y: n1.y + n2.y }, VIEW_INSET / (1 + n1.x * n2.x + n1.y * n2.y)))
  })
  inner.forEach((a, i) => {
    const b = inner[(i + 1) % n]
    candidates.push(add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, inward(a, b), VIEW_INSET))
  })

  let best: { p: Pt; score: number } | null = null
  for (const p of candidates) {
    if (!core.pointInPolygon(p, inner)) continue
    if (inner.some((a, j) => segDist(p, a, inner[(j + 1) % n]) < VIEW_INSET - 0.02)) continue // a third edge (wall-thickness step) crowds it
    if (!clearOfDoors(p)) continue
    if (pieces.some(({ f, k, top }) => top > 1.2 && footprintDist(p, f, k.sizeM) < 0.15)) continue // eye (1.6 m) inside a cabinet/wardrobe/TV
    const d = Math.hypot(target.x - p.x, target.y - p.y)
    if (d < 0.2) continue // target sits here: faces nothing useful
    const slab = pieces.some(({ f, k }) => (k.category === 'wardrobe' || k.category === 'shelf' || k.sizeM.y > 1.6) && footprintDist(p, f, k.sizeM) < SLAB_NEAR)
    const score = d - (slab ? SLAB_PENALTY : 0)
    if (!best || score > best.score) best = { p, score }
  }
  if (best) return look(best.p, target)

  for (const { w, f, c } of doors) {
    for (const s of [1, -1]) {
      const p = add(c, f.normal, s * (w.thicknessM / 2 + 0.9))
      if (core.pointInPolygon(p, inner)) return look(p, target)
    }
  }
  return look(room.centroid, target)
}
