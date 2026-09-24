/**
 * Pure 2D geometry over plan space (x → right, y → DOWN, meters).
 *
 * WINDING CONVENTION: every sign here is the raw shoelace sign, i.e.
 * signedArea > 0 ⇔ counter-clockwise in a y-UP frame. Plan space is y-down,
 * so a positive loop LOOKS clockwise on screen. Room loops from deriveRooms
 * are always positive. The interior of a positive loop lies on the side of
 * `leftNormal(dir) = (-dir.y, dir.x)` of each edge — the same vector
 * wallFrame() returns as `normal` when the wall's a→b runs along the loop.
 */
import type { Id, Room, Unit, Vertex, Wall } from './types'

export interface Pt {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Graph-only view of a unit (what geometry needs). */
export type Graph = Pick<Unit, 'vertices' | 'walls' | 'roomLabels'>

export interface WallPiece {
  u0: number
  u1: number
  v0: number
  v1: number
}

/** Tolerances: lengths in m, areas in m². */
export const EPS = 1e-9
export const AREA_EPS = 1e-6

export const vertexMap = (vs: Vertex[]): Map<Id, Vertex> => new Map(vs.map((v) => [v.id, v]))

/** Cross product of (b−a) × (c−a): >0 when c is left of a→b (y-up sense). */
export const cross = (a: Pt, b: Pt, c: Pt): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const samePt = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS

export function signedArea(poly: Pt[]): number {
  let s = 0
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

/** Area-weighted polygon centroid; vertex mean for degenerate polygons. */
export function polygonCentroid(poly: Pt[]): Pt {
  const n = poly.length
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < n; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % n]
    const c = p.x * q.y - q.x * p.y
    a += c
    cx += (p.x + q.x) * c
    cy += (p.y + q.y) * c
  }
  if (Math.abs(a) < AREA_EPS || n === 0) {
    const sx = poly.reduce((s, p) => s + p.x, 0)
    const sy = poly.reduce((s, p) => s + p.y, 0)
    return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 }
  }
  return { x: cx / (3 * a), y: cy / (3 * a) }
}

/** Ray casting: count edges crossing the horizontal ray from p towards +x. */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y) {
      const x = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y)
      if (p.x < x) inside = !inside
    }
  }
  return inside
}

export function unitBounds(graph: Pick<Unit, 'vertices'>): Bounds {
  if (!graph.vertices.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const v of graph.vertices) {
    b.minX = Math.min(b.minX, v.x)
    b.minY = Math.min(b.minY, v.y)
    b.maxX = Math.max(b.maxX, v.x)
    b.maxY = Math.max(b.maxY, v.y)
  }
  return b
}

export function wallFrame(
  wall: Wall,
  vertices: Vertex[],
): { origin: Pt; dir: Pt; normal: Pt; lengthM: number } {
  const vs = vertexMap(vertices)
  const a = vs.get(wall.a)
  const b = vs.get(wall.b)
  if (!a || !b) throw new Error(`wall ${wall.id}: vertex not found`)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthM = Math.hypot(dx, dy)
  const dir = lengthM > EPS ? { x: dx / lengthM, y: dy / lengthM } : { x: 1, y: 0 }
  return { origin: { x: a.x, y: a.y }, dir, normal: { x: -dir.y, y: dir.x }, lengthM }
}

/**
 * Slab decomposition: split u at every opening edge; inside one slab the set of
 * holes is constant, so the solid parts are the v-gaps between the (merged)
 * holes. Adjacent slabs with identical v-gaps are merged back into one piece,
 * so a wall with no openings is one piece and the span between two doors is one.
 */
export function wallPieces(wall: Wall, lengthM: number): WallPiece[] {
  const H = wall.heightM
  const holes = wall.openings
    .map((o) => ({
      u0: Math.max(0, o.offsetM),
      u1: Math.min(lengthM, o.offsetM + o.widthM),
      v0: Math.max(0, o.sillM),
      v1: Math.min(H, o.sillM + o.heightM),
    }))
    .filter((h) => h.u1 - h.u0 > EPS && h.v1 - h.v0 > EPS)
  if (lengthM <= EPS || H <= EPS) return []
  if (!holes.length) return [{ u0: 0, u1: lengthM, v0: 0, v1: H }]

  const us = [...new Set([0, lengthM, ...holes.flatMap((h) => [h.u0, h.u1])])].sort((a, b) => a - b)
  const pieces: WallPiece[] = []
  let prev: WallPiece[] = []
  for (let i = 0; i + 1 < us.length; i++) {
    const u0 = us[i]
    const u1 = us[i + 1]
    if (u1 - u0 <= EPS) continue
    const mid = (u0 + u1) / 2
    const covering = holes.filter((h) => h.u0 <= mid && h.u1 >= mid).sort((a, b) => a.v0 - b.v0)
    const slab: WallPiece[] = []
    let v = 0
    for (const h of covering) {
      if (h.v0 - v > EPS) slab.push({ u0, u1, v0: v, v1: h.v0 })
      v = Math.max(v, h.v1)
    }
    if (H - v > EPS) slab.push({ u0, u1, v0: v, v1: H })

    const sameGaps =
      prev.length === slab.length &&
      prev.every((p, k) => Math.abs(p.v0 - slab[k].v0) <= EPS && Math.abs(p.v1 - slab[k].v1) <= EPS)
    if (sameGaps && prev.length) {
      for (const p of prev) p.u1 = u1
    } else {
      pieces.push(...slab)
      prev = slab
    }
  }
  return pieces
}

export function roomPolygon(room: Room, graph: Graph): Pt[] {
  const vs = vertexMap(graph.vertices)
  return room.loop.map((id) => {
    const v = vs.get(id)
    if (!v) throw new Error(`vertex ${id} not found`)
    return { x: v.x, y: v.y }
  })
}

/**
 * Offset each edge inward by half its wall thickness and intersect adjacent
 * offset lines. Near-parallel neighbours (collinear split walls) fall back to
 * a plain vertex offset. Assumes room.loop is positive (interior on the left).
 */
export function roomInnerPolygon(room: Room, graph: Graph): Pt[] {
  const poly = roomPolygon(room, graph)
  const n = poly.length
  if (n < 3) return poly
  const thick = new Map(graph.walls.map((w) => [w.id, w.thicknessM]))
  // offset line i: passes through p[i] + n_i * t_i/2 with direction d_i
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n]
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const h = (thick.get(room.wallIds[i]) ?? 0) / 2
    return { d, o: { x: p.x - d.y * h, y: p.y + d.x * h } }
  })
  return poly.map((_, i) => {
    const l0 = lines[(i - 1 + n) % n]
    const l1 = lines[i]
    const den = l0.d.x * l1.d.y - l0.d.y * l1.d.x
    if (Math.abs(den) < 1e-6) return l1.o // parallel: simple vertex offset
    // solve l0.o + s*l0.d = l1.o + t*l1.d for s
    const wx = l1.o.x - l0.o.x
    const wy = l1.o.y - l0.o.y
    const s = (wx * l1.d.y - wy * l1.d.x) / den
    return { x: l0.o.x + s * l0.d.x, y: l0.o.y + s * l0.d.y }
  })
}

/**
 * Ear clipping. Works on a positive (numerically CCW) index ring so "convex"
 * means cross > 0; collinear/duplicate vertices are dropped without emitting a
 * triangle. Output triangles are always positive-signed regardless of input
 * winding, and index into the ORIGINAL `poly`.
 */
export function triangulate(poly: Pt[]): number[] {
  const n = poly.length
  if (n < 3) return []
  const ring = poly.map((_, i) => i)
  if (signedArea(poly) < 0) ring.reverse()
  const tris: number[] = []
  const c3 = (a: number, b: number, c: number) => cross(poly[a], poly[b], poly[c])
  // inclusive containment (boundary counts) so keyhole/weakly-simple loops
  // never get an ear whose diagonal passes through another vertex
  const inTri = (p: Pt, a: Pt, b: Pt, c: Pt) =>
    cross(a, b, p) >= -EPS && cross(b, c, p) >= -EPS && cross(c, a, p) >= -EPS

  while (ring.length > 3) {
    let clipped = false
    for (let i = 0; i < ring.length; i++) {
      const ia = ring[(i - 1 + ring.length) % ring.length]
      const ib = ring[i]
      const ic = ring[(i + 1) % ring.length]
      const c = c3(ia, ib, ic)
      if (Math.abs(c) <= AREA_EPS) {
        ring.splice(i, 1) // collinear or duplicate: drop, no triangle
        clipped = true
        break
      }
      if (c < 0) continue // reflex vertex
      const A = poly[ia]
      const B = poly[ib]
      const C = poly[ic]
      let ear = true
      for (const j of ring) {
        if (j === ia || j === ib || j === ic) continue
        const p = poly[j]
        if (samePt(p, A) || samePt(p, B) || samePt(p, C)) continue
        if (inTri(p, A, B, C)) {
          ear = false
          break
        }
      }
      if (!ear) continue
      tris.push(ia, ib, ic)
      ring.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break // ponytail: self-intersecting input; return what we have
  }
  if (ring.length === 3 && Math.abs(c3(ring[0], ring[1], ring[2])) > AREA_EPS) tris.push(...ring)
  return tris
}

export function nearestWall(
  p: Pt,
  graph: Pick<Unit, 'vertices' | 'walls'>,
): { wall: Wall; t: number; distanceM: number } | null {
  const vs = vertexMap(graph.vertices)
  let best: { wall: Wall; t: number; distanceM: number } | null = null
  for (const wall of graph.walls) {
    const a = vs.get(wall.a)
    const b = vs.get(wall.b)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 > EPS ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
    const distanceM = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
    if (!best || distanceM < best.distanceM) best = { wall, t, distanceM }
  }
  return best
}

/** Smallest containing room wins, so a shaft nested inside a living face resolves to the shaft. */
export function roomAt(p: Pt, rooms: Room[], graph: Graph): Room | null {
  let best: Room | null = null
  for (const r of rooms) {
    if (pointInPolygon(p, roomPolygon(r, graph)) && (!best || r.areaSqm < best.areaSqm)) best = r
  }
  return best
}
