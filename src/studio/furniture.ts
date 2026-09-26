/**
 * Studio furniture layer (tool F): grid-snapped move / 90° rotate of the unit's placements. Pure, Vitest-covered.
 * The founder's one-time exception to "no placement editor": 1 ft grid, wall snap, refuse overlaps and door /
 * entrance zones. Nothing is added, deleted, scaled or placed free.
 *
 * An empty `unit.furniture` IS the preset layout (the viewer runs `furnish` then, ViewerApp); the first move writes
 * the whole array so it is exported, "Reset all" empties it again. Reuses src/furnish (read-only).
 */
import { pointInPolygon, roomAt, roomInnerPolygon, unitBounds, wallFrame } from '../core'
import type { FurniturePlacement, Id, Pt, Room, Unit } from '../core'
import { heightRange, kitAsset, type KitAsset } from '../furnish/kit'
import { GAP, doorClearZones, footprint, furnish, quadsOverlap } from '../furnish/presets'

export const GRID_M = 0.3048
/** A footprint edge this close to a wall's inner face (or past it) goes flush. */
export const WALL_SNAP_M = 0.15
/** Fitted pieces (kitchen, bath, wall-hung) sit this far off the wall, as presets hang them; furniture sits GAP off. */
const FLUSH_M = 0.005
/**
 * The entrance keeps a 1.2 m path into the flat, its door's 1 m clear zone included. ponytail: the smaller reading of
 * "clear zone plus a 1.2 m path" (the shipped preset layouts respect it; 2.2 m would refuse type A's family sofa as placed).
 */
const ENTRY_DEPTH_M = 1.2

export const piecesOf = (unit: Unit, rooms: Room[]): FurniturePlacement[] => (unit.furniture.length ? unit.furniture : furnish(unit, rooms))

const assetOf = (p: FurniturePlacement): KitAsset | undefined => kitAsset(p.assetId)
const sizeOf = (p: FurniturePlacement) => {
  const s = assetOf(p)?.sizeM ?? { x: 1, z: 1 }
  const k = p.scale ?? 1
  return { x: s.x * k, z: s.z * k }
}
export const pieceQuad = (p: FurniturePlacement): Pt[] => footprint(p, p.rotationDeg, sizeOf(p))
/** "Queen bed, upholstered" → "Queen bed" */
export const pieceLabel = (p: FurniturePlacement): string => (assetOf(p)?.label ?? p.assetId).split(/[,(]/)[0].trim()

/** 0 stands on the floor, 1 lifted (on a unit / sofa / wall: mountY), 2 ceiling-hung (incl. the AC), 3 rug. */
export function layerOf(p: FurniturePlacement): 0 | 1 | 2 | 3 {
  const a = assetOf(p)
  if (!a) return 0
  if (a.category === 'rug') return 3
  if (a.mount === 'ceiling') return 2
  return a.mount === 'wall' || (a.mountY ?? 0) > 0.05 ? 1 : 0
}
const band = (p: FurniturePlacement): [number, number] => {
  const a = assetOf(p)
  return a ? heightRange(a) : [0, 1]
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
  const under = pieces.filter((p) => pointInPolygon(m, pieceQuad(p)))
  return under.sort((a, b) => layerOf(a) - layerOf(b) || area(a) - area(b))[0] ?? null
}

/** What rests on p and moves with it: cushions on a sofa, a TV on its unit, wall cabinets over a counter. */
function riders(pieces: FurniturePlacement[], p: FurniturePlacement): FurniturePlacement[] {
  if (layerOf(p) !== 0) return []
  const q = pieceQuad(p)
  const top = band(p)[1]
  return pieces.filter((o) => o.id !== p.id && o.roomId === p.roomId && layerOf(o) === 1 && band(o)[0] <= top + 0.02 && pointInPolygon(o, q))
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
export function snapToWalls(c: Pt, from: Pt[], rotationDeg: number, size: { x: number; z: number }, inner: Pt[], gap: number): { c: Pt; snapped: boolean } {
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
  return { c, snapped: done.length > 0 }
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
  const hit = others.find((o) => blocks(p, o) && quadsOverlap(pieceQuad(o), q))
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

const norm = (deg: number) => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360

/**
 * Piece `id` to centre `to`, turned to `rotationDeg`: onto the 1 ft grid (unless `grid` is false: R turns in place),
 * then flush to a wall it nears. It belongs to the room `to` is in. What rests on it moves and turns with it.
 */
export function movePiece(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, to: Pt, rotationDeg: number, grid = true): Move | null {
  const p = pieces.find((x) => x.id === id)
  if (!p) return null
  const rot = norm(rotationDeg)
  const size = sizeOf(p)
  const b = unitBounds(unit)
  let c = grid ? snapToGrid(to, rot, size, { x: b.minX, y: b.minY }) : { x: to.x, y: to.y }
  const room = roomAt(to, rooms, unit)
  let snapped: Move['snapped'] = grid ? 'grid' : null
  if (room) {
    const a = assetOf(p)
    const fitted = layerOf(p) === 1 || a?.category === 'kitchen' || a?.category === 'bath'
    const r = snapToWalls(c, footprint(to, rot, size), rot, size, roomInnerPolygon(room, unit), fitted ? FLUSH_M : GAP)
    c = r.c
    if (r.snapped) snapped = 'wall'
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
  // ponytail: riders are not checked themselves; they sit inside the piece's footprint, add checks if a rider ever overhangs
  const error = whyNot(unit, room, pieces.filter((x) => !moved.has(x.id)), piece)
  return { furniture: pieces.map((x) => moved.get(x.id) ?? x), piece, ids: [...moved.keys()], snapped, error }
}
