/**
 * Studio furniture layer (tool F): grid-snapped move / 90° rotate of the unit's placements. Pure, Vitest-covered.
 * The founder's exception to "no placement editor" (CLAUDE.md, 2026-09-27; 6" grid since 2026-09-28), wall snap, refuse overlaps and
 * door / entrance zones; pieces resize within their kit limits (kit.ts resizeLimits); pieces may be deleted. A dining table
 * carries its chairs, and a resized one gets as many as its new size seats. Nothing else is added, nothing placed free.
 * The viewer's Arrange mode (src/viewer/arrange.ts) runs the same rules.
 *
 * An empty `unit.furniture` IS the preset layout (layoutFor); the first move writes the whole array so it is exported,
 * "Reset all" empties it again; rooms with no stored pieces keep getting their presets. Reuses src/furnish (read-only).
 */
import { newId, pointInPolygon, roomAt, roomInnerPolygon, unitBounds, wallFrame } from '../core'
import type { FurniturePlacement, Id, Pt, Room, Unit } from '../core'
import { heightRange, KIT, kitAsset, objectKind, placementLabel, placementSize, resizeLimits, type KitAsset } from '../furnish/kit'
import { GAP, chairSpots, doorClearZones, footprint, furnish, quadsOverlap, windowZones } from '../furnish/presets'
import { PROCEDURAL, tableSeats } from '../furnish/procedural.meta'

/** 6" squares (0.25 sq ft; founder 2026-09-28 — 1 ft was too coarse to place a piece where he wanted) */
export const GRID_M = 0.3048 / 2
/** A footprint edge this close to a wall's inner face (or past it) goes flush. */
export const WALL_SNAP_M = 0.15
/** Fitted pieces (kitchen, bath, wall-hung) sit this far off the wall, as presets hang them; furniture sits GAP off. */
const FLUSH_M = 0.005
/**
 * The entrance keeps a 1.2 m path into the flat, its door's 1 m clear zone included. ponytail: the smaller reading of
 * "clear zone plus a 1.2 m path" (the shipped preset layouts respect it; 2.2 m would refuse type A's family sofa as placed).
 */
const ENTRY_DEPTH_M = 1.2

/**
 * The layout a unit shows (Studio tool F, viewer, Arrange, Preview 3D): its stored pieces whose room still exists, plus
 * the presets of every room with none stored (drawn or labelled after the first move). Tombstones (`removed`) stay: a room
 * emptied by deleting keeps nothing. The stored array itself when nothing changes.
 */
export function layoutFor(unit: Unit, rooms: Room[]): FurniturePlacement[] {
  if (!unit.furniture.length) return furnish(unit, rooms)
  const live = new Set(rooms.map((r) => r.id))
  const stored = unit.furniture.every((p) => live.has(p.roomId)) ? unit.furniture : unit.furniture.filter((p) => live.has(p.roomId))
  const has = new Set(stored.map((p) => p.roomId))
  // ponytail: runs every preset when some room has no pieces (a shaft, a lobby); cache per unit if the Studio ever lags
  const added = rooms.some((r) => !has.has(r.id)) ? furnish(unit, rooms).filter((p) => !has.has(p.roomId)) : []
  return added.length ? [...stored, ...added] : stored
}

/** The stored pieces without room `roomId`'s when those are still exactly its presets (none moved, turned, resized or deleted): a relabelled room re-furnishes. */
export function forgetPresets(unit: Unit, rooms: Room[], roomId: Id): FurniturePlacement[] {
  const mine = unit.furniture.filter((p) => p.roomId === roomId)
  if (!mine.length) return unit.furniture
  const preset = new Set(furnish(unit, rooms).filter((p) => p.roomId === roomId).map((p) => JSON.stringify(p)))
  return mine.every((p) => preset.has(JSON.stringify(p))) ? unit.furniture.filter((p) => p.roomId !== roomId) : unit.furniture
}

/** Piece `id` and what rests on it, deleted: tombstones, so the room stays as left and is never re-furnished. */
export function deletePiece(pieces: FurniturePlacement[], id: Id): FurniturePlacement[] {
  const p = pieces.find((x) => x.id === id)
  if (!p || p.removed) return pieces
  const gone = new Set([id, ...riders(pieces, p).map((r) => r.id)])
  return pieces.map((x) => (gone.has(x.id) ? { ...x, removed: true as const } : x))
}

const assetOf = (p: FurniturePlacement): KitAsset | undefined => kitAsset(p.assetId)
const sizeOf = placementSize
export const pieceQuad = (p: FurniturePlacement): Pt[] => footprint(p, p.rotationDeg, sizeOf(p))
/** "Queen bed, upholstered" → "Queen bed" */
export const pieceLabel = (p: FurniturePlacement): string => placementLabel(p).split(/[,(]/)[0].trim()

/** 0 stands on the floor, 1 lifted (on a unit / sofa / wall: mountY), 2 ceiling-hung (incl. the AC), 3 rug. */
export function layerOf(p: FurniturePlacement): 0 | 1 | 2 | 3 {
  const a = assetOf(p)
  if (!a) return 0
  if (a.category === 'rug') return 3
  if (a.mount === 'ceiling') return 2
  return a.mount === 'wall' || (a.mountY ?? 0) > 0.05 ? 1 : 0
}
/** Where a piece hangs: wall-hung ones (TV, art, clock, AC, hook rail: mount 'wall' or hung ≥ 0.9 m) on a wall, lights and fans on the ceiling, the rest on the floor. */
export function surfaceOf(p: { assetId: string }): 'floor' | 'wall' | 'ceiling' {
  const a = kitAsset(p.assetId)
  if (a?.mount === 'wall' || (a?.mountY ?? 0) >= 0.9) return 'wall'
  return a?.mount === 'ceiling' ? 'ceiling' : 'floor'
}
const band = (p: FurniturePlacement): [number, number] => {
  const a = assetOf(p)
  return a ? heightRange({ ...a, sizeM: sizeOf(p) }) : [0, sizeOf(p).y] // a resized wall piece stays centred at 1.5 m
}

/** Rugs only stop rugs, ceiling fixtures stop nothing, the rest when their heights overlap (a frame above a sofa is fine), as presets. */
function blocks(p: FurniturePlacement, o: FurniturePlacement): boolean {
  const [lp, lo] = [layerOf(p), layerOf(o)]
  if (lp === 3 || lo === 3) return lp === lo
  if (lp === 2 || lo === 2) return false
  const [p0, p1] = band(p)
  const [o0, o1] = band(o)
  return o1 > p0 + 0.02 && o0 < p1 - 0.02
}

/** The piece under a plan point: floor pieces before lifted, ceiling and rugs; the smaller first. */
export function pieceAt(pieces: FurniturePlacement[], m: Pt): FurniturePlacement | null {
  const area = (p: FurniturePlacement) => sizeOf(p).x * sizeOf(p).z
  const under = pieces.filter((p) => !p.removed && pointInPolygon(m, pieceQuad(p)))
  return under.sort((a, b) => layerOf(a) - layerOf(b) || area(a) - area(b))[0] ?? null
}

/** A dining table's chairs: the dining chairs of its room standing within 0.65 m of its edges (presets set them touching). */
function chairsOf(pieces: FurniturePlacement[], p: FurniturePlacement): FurniturePlacement[] {
  if (assetOf(p)?.category !== 'dining-table') return []
  const s = sizeOf(p)
  const reach = footprint(p, p.rotationDeg, { x: s.x + 1.3, z: s.z + 1.3 })
  return pieces.filter((o) => !o.removed && o.roomId === p.roomId && assetOf(o)?.category === 'dining-chair' && pointInPolygon(o, reach))
}

/** What rests on p and moves with it: cushions on a sofa, a TV on its unit, wall cabinets over a counter; a dining table's chairs. */
function riders(pieces: FurniturePlacement[], p: FurniturePlacement): FurniturePlacement[] {
  if (layerOf(p) !== 0) return []
  const q = pieceQuad(p)
  const top = band(p)[1]
  return [...pieces.filter((o) => o.id !== p.id && !o.removed && o.roomId === p.roomId && layerOf(o) === 1 && band(o)[0] <= top + 0.02 && pointInPolygon(o, q)), ...chairsOf(pieces, p)]
}

/** A chair's refusal, said of the set it belongs to. */
const chairWhy = (e: string | null): string | null => e && (e === 'Outside the room' ? 'No room for the chairs' : `A chair ${e[0].toLowerCase()}${e.slice(1)}`)

/**
 * A resized dining table's chairs laid again round its new size by presets' chairSpots: as many as before, plus as many
 * as its capacity (tableSeats) grew, never more than it seats; while one has no room (a wall, a door, another piece),
 * one fewer, as presets fall back. Chairs keep their ids (the nearest spot first), new ones copy the first and get
 * `${tableId}:chair:<n>`, dropped ones become tombstones like a delete. A string = why not even one fits.
 */
function relayChairs(unit: Unit, room: Room | null, others: FurniturePlacement[], table: FurniturePlacement, chairs: FurniturePlacement[], seatsBefore: number): FurniturePlacement[] | string {
  const s = sizeOf(table)
  // CLAUDE.md 2026-09-27 late: a longer table may gain chairs
  const want = Math.min(tableSeats(s.x), chairs.length + Math.max(0, tableSeats(s.x) - seatsBefore))
  const used = new Set([...others, ...chairs].map((o) => o.id))
  let k = 0
  const fresh = (): Id => {
    while (used.has(`${table.id}:chair:${++k}`));
    return `${table.id}:chair:${k}`
  }
  let why: string | null = null
  for (let n = want; n >= 1; n--) {
    const left = [...chairs]
    const laid: FurniturePlacement[] = []
    k = 0
    for (const sp of chairSpots(table, table.rotationDeg, s, n, sizeOf(chairs[0]).z)) {
      const i = left.reduce((b, c, j) => (Math.hypot(c.x - sp.c.x, c.y - sp.c.y) < Math.hypot(left[b].x - sp.c.x, left[b].y - sp.c.y) ? j : b), 0)
      const from = left.length ? left.splice(i, 1)[0] : { ...chairs[0], id: fresh() }
      const c = { ...from, x: sp.c.x, y: sp.c.y, rotationDeg: sp.rot, roomId: table.roomId }
      why = whyNot(unit, room, [...others, table, ...laid], c)
      if (why) break
      laid.push(c)
    }
    if (!why) return [...laid, ...left.map((c) => ({ ...c, removed: true as const }))]
  }
  return chairWhy(why) ?? 'No room for the chairs'
}

/** The first door in walls[] order is the entrance: its span, ENTRY_DEPTH_M out from both faces of its wall. */
export function entryZone(unit: Unit): Pt[] | null {
  for (const w of unit.walls) {
    const o = w.openings.find((x) => x.kind === 'door')
    if (!o) continue
    const f = wallFrame(w, unit.vertices)
    const at = (u: number, v: number): Pt => ({ x: f.origin.x + f.dir.x * u + f.normal.x * v, y: f.origin.y + f.dir.y * u + f.normal.y * v })
    const h = w.thicknessM / 2 + ENTRY_DEPTH_M
    return [at(o.offsetM, -h), at(o.offsetM + o.widthM, -h), at(o.offsetM + o.widthM, h), at(o.offsetM, h)]
  }
  return null
}

/** Shift c so the footprint's bounding-box min corner sits on the grid (origin = the unit's bounds min corner). */
export function snapToGrid(c: Pt, rotationDeg: number, size: { x: number; z: number }, origin: Pt): Pt {
  const q = footprint(c, rotationDeg, size)
  const on = (v: number, o: number) => o + Math.round((v - o) / GRID_M) * GRID_M - v
  return { x: c.x + on(Math.min(...q.map((p) => p.x)), origin.x), y: c.y + on(Math.min(...q.map((p) => p.y)), origin.y) }
}

/**
 * Flush against the inner faces (positive loop: inward normal (−d.y, d.x)) that the footprint at c is within WALL_SNAP_M
 * of, or pokes through: the nearest first, then one more that is not parallel to it (a corner). A face counts only
 * beside the footprint and when `from` (the unsnapped footprint) is not wholly behind it (a concave room's far side).
 */
export function snapToWalls(c: Pt, from: Pt[], rotationDeg: number, size: { x: number; z: number }, inner: Pt[], gap: number): { c: Pt; snapped: boolean; normals: Pt[] } {
  const done: Pt[] = []
  for (let k = 0; k < 2; k++) {
    const q = footprint(c, rotationDeg, size)
    let best: { n: Pt; shift: number } | null = null
    for (let i = 0; i < inner.length; i++) {
      const p0 = inner[i]
      const p1 = inner[(i + 1) % inner.length]
      const len = Math.hypot(p1.x - p0.x, p1.y - p0.y)
      if (len < 1e-6) continue
      const d = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }
      const n = { x: -d.y, y: d.x }
      if (done.some((m) => Math.abs(m.x * n.x + m.y * n.y) > 0.7)) continue
      const u = (p: Pt) => (p.x - p0.x) * d.x + (p.y - p0.y) * d.y
      const v = (p: Pt) => (p.x - p0.x) * n.x + (p.y - p0.y) * n.y
      const us = q.map(u)
      if (Math.max(...us) <= 0 || Math.min(...us) >= len || Math.max(...from.map(v)) <= 0) continue
      const g = Math.min(...q.map(v))
      if (g <= WALL_SNAP_M && (!best || Math.abs(gap - g) < Math.abs(best.shift))) best = { n, shift: gap - g }
    }
    if (!best) break
    const { n, shift } = best
    c = { x: c.x + n.x * shift, y: c.y + n.y * shift }
    done.push(n)
  }
  return { c, snapped: done.length > 0, normals: done }
}

/**
 * Like the wall snap, for door / slider clear zones and the entrance: a footprint at c that pokes less than one grid step
 * into one, measured along its depth, goes back out to its edge + 1 cm (the grid must not refuse a spot that fits).
 * Deeper, it stays and whyNot refuses it.
 */
export function outOfZones(unit: Unit, room: Room, c: Pt, rotationDeg: number, size: { x: number; z: number }): Pt {
  const entry = entryZone(unit)
  for (const z of [...(entry ? [entry] : []), ...doorClearZones(room, unit)]) {
    const q = footprint(c, rotationDeg, size)
    if (!quadsOverlap(z, q)) continue
    const len = Math.hypot(z[3].x - z[0].x, z[3].y - z[0].y) // spanQuad / entryZone: z[0] → z[3] is the depth
    const m = { x: (z[3].x - z[0].x) / len, y: (z[3].y - z[0].y) / len }
    const at = q.map((v) => v.x * m.x + v.y * m.y)
    const up = z[3].x * m.x + z[3].y * m.y + 0.01 - Math.min(...at)
    const down = z[0].x * m.x + z[0].y * m.y - 0.01 - Math.max(...at)
    const s = Math.abs(up) < Math.abs(down) ? up : down
    if (Math.abs(s) < GRID_M) c = { x: c.x + m.x * s, y: c.y + m.y * s }
  }
  return c
}

/** Why p may not stand where it is (null = it may). `others` = every piece that is not moving with it. */
export function whyNot(unit: Unit, room: Room | null, others: FurniturePlacement[], p: FurniturePlacement): string | null {
  const q = pieceQuad(p)
  if (!room || !q.every((v) => pointInPolygon(v, roomInnerPolygon(room, unit)))) return 'Outside the room'
  if (layerOf(p) !== 2) {
    const entry = entryZone(unit)
    if (entry && quadsOverlap(entry, q)) return 'Blocks the entrance'
    if (doorClearZones(room, unit).some((z) => quadsOverlap(z, q))) return 'Blocks the door'
  }
  if (surfaceOf(p) === 'wall') {
    const [y0, y1] = band(p)
    if (windowZones(room, unit).some((w) => y1 > w.from && y0 < w.to && quadsOverlap(w.q, q))) return 'Covers the window'
  }
  const hit = others.find((o) => !o.removed && blocks(p, o) && quadsOverlap(pieceQuad(o), q))
  if (!hit) return null
  const name = pieceLabel(hit)
  return `Overlaps the ${name[0].toLowerCase()}${name.slice(1)}`
}

export interface Move {
  /** the whole layout after the move (the piece and what rides on it moved) */
  furniture: FurniturePlacement[]
  piece: FurniturePlacement
  /** the pieces that moved: the piece first, then its riders */
  ids: Id[]
  snapped: 'wall' | 'grid' | null
  /** why the drop is refused; the caller keeps the old layout */
  error: string | null
}

/** Kitchen, bath and wall-hung pieces (the AC too: ceiling layer, hung on a wall) go flush; furniture keeps GAP. */
function isFitted(p: FurniturePlacement): boolean {
  const a = assetOf(p)
  return layerOf(p) === 1 || (a?.mountY ?? 0) > 0.05 || a?.category === 'kitchen' || a?.category === 'bath'
}

const norm = (deg: number) => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360

/** Pieces that stand with their back to a wall (a TV unit, sofa, wardrobe, bed's headboard, desk, shelves, kitchen and bath fittings, cot, closet units); not tables, chairs, rugs, plants. */
const BACKED: KitAsset['category'][] = ['tv-unit', 'sofa', 'wardrobe', 'bed', 'desk', 'shelf', 'kitchen', 'bath']
const backsOnto = (p: FurniturePlacement) => {
  const a = assetOf(p)
  return !!a && BACKED.includes(a.category) && !a.mount && (a.mountY ?? 0) < 0.9
}
/** Front (local +y) of a piece turned `deg`, as footprint(). */
const frontOf = (deg: number): Pt => ({ x: -Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180) })
/** Half its footprint's extent along n. */
const halfAlong = (q: Pt[], n: Pt) => (Math.max(...q.map((v) => v.x * n.x + v.y * n.y)) - Math.min(...q.map((v) => v.x * n.x + v.y * n.y))) / 2

/**
 * Piece `id` to centre `to`, turned to `rotationDeg`: onto the 6" grid (unless `grid` is false: R turns in place),
 * then flush to a wall it nears. A piece that stands against a wall (BACKED), dropped onto a wall it is not backed
 * onto, turns its back to that wall and goes flush. It belongs to the room `to` is in. What rests on it moves and turns with it.
 */
export function movePiece(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, to: Pt, rotationDeg: number, grid = true): Move | null {
  const p = pieces.find((x) => x.id === id)
  if (!p) return null
  let rot = norm(rotationDeg)
  const size = sizeOf(p)
  const b = unitBounds(unit)
  let c = grid ? snapToGrid(to, rot, size, { x: b.minX, y: b.minY }) : { x: to.x, y: to.y }
  const room = roomAt(to, rooms, unit)
  let snapped: Move['snapped'] = grid ? 'grid' : null
  if (room) {
    const inner = roomInnerPolygon(room, unit)
    const gap = isFitted(p) ? FLUSH_M : GAP
    let r = snapToWalls(c, footprint(to, rot, size), rot, size, inner, gap)
    const n = r.normals[0]
    const f = frontOf(rot)
    if (grid && n && backsOnto(p) && !r.normals.some((m) => m.x * f.x + m.y * f.y > 0.99)) {
      // back to the wall it was dropped on (front = the wall's inward normal), still flush: its depth now spans n
      const turned = norm((Math.atan2(-n.x, n.y) * 180) / Math.PI)
      const k = halfAlong(footprint(r.c, rot, size), n) - halfAlong(footprint(r.c, turned, size), n)
      const c2 = { x: r.c.x - n.x * k, y: r.c.y - n.y * k }
      rot = turned
      r = snapToWalls(c2, footprint(c2, rot, size), rot, size, inner, gap)
    }
    c = r.c
    if (r.snapped) snapped = 'wall'
    if (layerOf(p) === 0) c = outOfZones(unit, room, c, rot, size)
  }
  const roomId = room?.id ?? p.roomId
  const piece = { ...p, x: c.x, y: c.y, rotationDeg: rot, roomId }
  const t = ((rot - p.rotationDeg) * Math.PI) / 180
  const moved = new Map<Id, FurniturePlacement>([[p.id, piece]])
  for (const r of riders(pieces, p)) {
    const dx = r.x - p.x
    const dy = r.y - p.y
    const x = c.x + dx * Math.cos(t) - dy * Math.sin(t)
    const y = c.y + dx * Math.sin(t) + dy * Math.cos(t)
    moved.set(r.id, { ...r, x, y, rotationDeg: norm(r.rotationDeg + rot - p.rotationDeg), roomId })
  }
  // ponytail: lifted riders are not checked themselves; they sit inside the piece's footprint, add checks if one ever overhangs
  const others = pieces.filter((x) => !moved.has(x.id))
  let error = whyNot(unit, room, others, piece)
  for (const c of chairsOf(pieces, p)) error ??= chairWhy(whyNot(unit, room, others, moved.get(c.id)!)) // a table's chairs stand round it, not on it
  return { furniture: pieces.map((x) => moved.get(x.id) ?? x), piece, ids: [...moved.keys()], snapped, error }
}

/** A wall face: a point on it and its normal into the room (plan metres). */
export interface WallFace {
  p: Pt
  n: Pt
}

/** Piece `id` hung on face `w`: back to it, front into the room, sliding along it in 6" steps; a move's rules (flush, refusals). */
export function hangOn(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, w: WallFace): Move | null {
  const p = pieces.find((x) => x.id === id)
  if (!p) return null
  const { n } = w
  const d = { x: n.y, y: -n.x } // along the wall
  const u = w.p.x * d.x + w.p.y * d.y
  const s = Math.round(u / GRID_M) * GRID_M - u
  const out = sizeOf(p).z / 2 + FLUSH_M
  const c = { x: w.p.x + d.x * s + n.x * out, y: w.p.y + d.y * s + n.y * out }
  return movePiece(unit, rooms, pieces, id, c, (Math.atan2(-n.x, n.y) * 180) / Math.PI, false)
}

/** The inner wall face of `at`'s room nearest to it (a plan click in the Studio). */
export function nearestFace(unit: Unit, rooms: Room[], at: Pt): WallFace | null {
  const room = roomAt(at, rooms, unit)
  if (!room) return null
  const inner = roomInnerPolygon(room, unit)
  let best: (WallFace & { dist: number }) | null = null
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]
    const b = inner[(i + 1) % inner.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 1e-6) continue
    const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    const t = Math.max(0, Math.min(len, (at.x - a.x) * d.x + (at.y - a.y) * d.y))
    const p = { x: a.x + d.x * t, y: a.y + d.y * t }
    const dist = Math.hypot(at.x - p.x, at.y - p.y)
    if (!best || dist < best.dist) best = { p, n: { x: -d.y, y: d.x }, dist } // positive loop: inward normal
  }
  return best && { p: best.p, n: best.n }
}

/**
 * A new piece of kit asset `assetId` (the staff library, CLAUDE.md 2026-09-27 late) dropped at `at`, turned
 * `rotationDeg`, on a move's rules: floor and ceiling pieces as movePiece puts them (6" grid, flush to a wall they
 * near, backed ones back to it); wall pieces on `wall` (the face under the 3D pointer), else on the face of `at`'s room
 * nearest `at` (hangOn). It belongs to the room it lands in. `error` = why not; the caller keeps the old layout.
 */
export function placePiece(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], assetId: string, at: Pt, rotationDeg: number, id: Id = newId(), wall?: WallFace | null): Move | null {
  if (!kitAsset(assetId)) return null
  const p: FurniturePlacement = { id, assetId, roomId: roomAt(at, rooms, unit)?.id ?? '', x: at.x, y: at.y, rotationDeg: norm(rotationDeg) }
  const all = [...pieces, p]
  if (surfaceOf(p) !== 'wall') return movePiece(unit, rooms, all, id, at, rotationDeg)
  const face = wall ?? nearestFace(unit, rooms, at)
  return face ? hangOn(unit, rooms, all, id, face) : { furniture: all, piece: p, ids: [id], snapped: null, error: 'Outside the room' }
}

const TABS = ['Living', 'Dining', 'Bedroom', 'Kitchen', 'Bath', 'Lights & AC', 'Decor'] as const
/** By category, else by what it is (the 'other' pieces); the rest (plants, rugs, art, clock, vase) is Decor. */
const TAB_OF: Record<string, (typeof TABS)[number]> = {
  sofa: 'Living', armchair: 'Living', 'coffee-table': 'Living', 'tv-unit': 'Living', shelf: 'Living', tv: 'Living', ottoman: 'Living', cushions: 'Living',
  'dining-table': 'Dining', 'dining-chair': 'Dining',
  bed: 'Bedroom', bedside: 'Bedroom', wardrobe: 'Bedroom', desk: 'Bedroom', chair: 'Bedroom',
  kitchen: 'Kitchen', bath: 'Bath', lamp: 'Lights & AC', 'ceiling-fan': 'Lights & AC', ac: 'Lights & AC',
}
const BED_LINEN: Record<string, string> = { '': 'terracotta throw', _b: 'sage throw', _c: 'no throw' }
export interface LibraryItem {
  id: string
  label: string
  size: KitAsset['sizeM']
}
/** The staff library: every kit asset (Poly Haven + procedural) by tab, but the stairs (building, not furniture); beds name their linen. */
export function library(): { tab: string; items: LibraryItem[] }[] {
  const all = [...Object.keys(KIT), ...Object.keys(PROCEDURAL)].map((id) => kitAsset(id)!).filter((a) => objectKind(a) !== 'stair')
  const label = (a: KitAsset) => (a.category === 'bed' && a.id.startsWith('bed_') ? `${a.label} (${BED_LINEN[a.id.match(/_[bc]$/)?.[0] ?? '']})` : a.label)
  return TABS.map((tab) => ({ tab, items: all.filter((a) => (TAB_OF[a.category] ?? TAB_OF[objectKind(a)] ?? 'Decor') === tab).map((a) => ({ id: a.id, label: label(a), size: a.sizeM })) }))
}

/** Resized sizes land on this step (m). */
export const SIZE_STEP_M = 0.05
/** The axes a piece may be resized along (x width, y height, z depth): none for structure; min = max fixes an axis. */
export function resizeAxes(assetId: string): ('x' | 'y' | 'z')[] {
  const l = resizeLimits(assetId)
  return l ? (['x', 'z', 'y'] as const).filter((k) => l.max[k] > l.min[k]) : []
}

/**
 * Piece `id` resized to `size` (m; x width, y height, z depth): each axis on the 5 cm step, clamped to its kit limits
 * (resizeLimits; null = move / turn only → returns null). `grow` picks the face that moves per footprint axis (+1 the
 * +x / front face, −1 the other, 0 both halves): the opposite face stays. Then flush to a wall it nears, and refused on
 * the same rules as a move. What rests on it stays put; a dining table's chairs are laid again round it (relayChairs).
 */
export function resizePiece(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, size: { x: number; y: number; z: number }, grow = { x: 0, z: 1 }): Move | null {
  const p = pieces.find((x) => x.id === id)
  const lim = p && resizeLimits(p.assetId)
  if (!p || !lim) return null
  const fit = (k: 'x' | 'y' | 'z') => Math.min(lim.max[k], Math.max(lim.min[k], Math.round(size[k] / SIZE_STEP_M) / (1 / SIZE_STEP_M))) // n / 20: 0.6, not 0.6000000000000001
  const s = { x: fit('x'), y: fit('y'), z: fit('z') }
  const old = sizeOf(p)
  if (lim.lock) {
    // proportional (a plant, a chair, a print): the axis changed most sets the scale, the other locked axes follow it
    const kit = assetOf(p)!.sizeM
    const k = lim.lock.reduce((a, b) => (Math.abs(size[b] / old[b] - 1) > Math.abs(size[a] / old[a] - 1) ? b : a))
    const f = s[k] / kit[k]
    for (const a of lim.lock) if (a !== k) s[a] = Math.round(kit[a] * f * 1000) / 1000
  }
  const t = (p.rotationDeg * Math.PI) / 180
  const du = (grow.x * (s.x - old.x)) / 2 // along local +x
  const dv = (grow.z * (s.z - old.z)) / 2 // along local +y, the front
  let c = { x: p.x + du * Math.cos(t) - dv * Math.sin(t), y: p.y + du * Math.sin(t) + dv * Math.cos(t) }
  const room = rooms.find((r) => r.id === p.roomId) ?? null
  let snapped: Move['snapped'] = null
  if (room) {
    const r = snapToWalls(c, footprint(c, p.rotationDeg, s), p.rotationDeg, s, roomInnerPolygon(room, unit), isFitted(p) ? FLUSH_M : GAP)
    c = r.c
    if (r.snapped) snapped = 'wall'
  }
  const piece = { ...p, x: c.x, y: c.y, sizeM: s }
  const chairs = chairsOf(pieces, p)
  // what rests on it (cushions on a sofa, a TV on its unit) stays put and never blocks it; a table's chairs are laid again
  const on = riders(pieces, p)
  const others = pieces.filter((x) => x.id !== id && !on.includes(x))
  let error = whyNot(unit, room, others, piece)
  // a dining table's chairs are laid again round its new size
  const laid = chairs.length && !error ? relayChairs(unit, room, others, piece, chairs, tableSeats(old.x)) : []
  if (typeof laid === 'string') error = laid
  const moved = new Map<Id, FurniturePlacement>([[id, piece], ...(typeof laid === 'string' ? [] : laid.map((q) => [q.id, q] as const))])
  const added = [...moved.values()].filter((q) => !pieces.some((x) => x.id === q.id))
  return { furniture: [...pieces.map((x) => moved.get(x.id) ?? x), ...added], piece, ids: [...moved.keys()], snapped, error }
}
