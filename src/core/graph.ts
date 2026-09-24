/**
 * Wall graph → rooms (planar face traversal) and validation.
 *
 * ASSUMPTIONS (the Studio enforces these; validate() reports violations):
 *  - Walls only meet at shared vertex ids. No T-junctions mid-wall: a wall
 *    that ends on the middle of another wall must be split there first.
 *    validate() flags such cases as 'walls-intersect'.
 *  - Walls are straight segments at arbitrary angles.
 *
 * Faces: every wall becomes two half-edges (a→b, b→a). At each vertex the
 * outgoing half-edges are sorted by angle; the successor of half-edge h is the
 * outgoing edge at h.to that comes just clockwise (previous in ascending
 * atan2 order) of h.twin. With that rule every bounded face is traced with
 * signedArea > 0 and every unbounded (outer) face with signedArea < 0 — one
 * outer face per connected component — so "exclude the outer face" is simply
 * "keep faces with positive area". Dangling stubs (a wall with the same face
 * on both sides) get visited out-and-back by their face; those two half-edges
 * are collapsed out of Room.loop / Room.wallIds (the wall still renders as a
 * wall, it just doesn't bound the floor). A closed loop attached by a single
 * bridge wall stays as a "keyhole" in the loop, which shoelace and ear
 * clipping both handle.
 *
 * Disconnected components are traced independently; an unconnected box inside
 * a bigger face is NOT subtracted from that face's area (nested faces are
 * resolved by "smallest containing face wins" in labelling and roomAt).
 */
import type { Id, Room, RoomLabel, Unit, ValidationIssue, Vertex, Wall } from './types'
import {
  AREA_EPS,
  cross,
  pointInPolygon,
  polygonCentroid,
  roomPolygon,
  signedArea,
  vertexMap,
  type Graph,
  type Pt,
} from './geometry'

interface HalfEdge {
  from: Id
  to: Id
  wall: Wall
  angle: number
  twin: HalfEdge
  next: HalfEdge
}

interface Face {
  loop: Id[]
  wallIds: Id[]
  pts: Pt[]
  area: number
}

const wallKey = (w: Wall): string => (w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`)

/** Walls deriveRooms can traverse: both vertices exist, non-zero length, first of any duplicates. */
function usableWalls(graph: Pick<Unit, 'vertices' | 'walls'>): Wall[] {
  const vs = vertexMap(graph.vertices)
  const seen = new Set<string>()
  return graph.walls.filter((w) => {
    const a = vs.get(w.a)
    const b = vs.get(w.b)
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) <= 1e-9) return false
    const k = wallKey(w)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function traceFaces(graph: Pick<Unit, 'vertices' | 'walls'>): Face[] {
  const vs = vertexMap(graph.vertices)
  const halfEdges: HalfEdge[] = []
  const outgoing = new Map<Id, HalfEdge[]>()
  for (const wall of usableWalls(graph)) {
    const a = vs.get(wall.a)!
    const b = vs.get(wall.b)!
    const ab = { from: wall.a, to: wall.b, wall, angle: Math.atan2(b.y - a.y, b.x - a.x) } as HalfEdge
    const ba = { from: wall.b, to: wall.a, wall, angle: Math.atan2(a.y - b.y, a.x - b.x) } as HalfEdge
    ab.twin = ba
    ba.twin = ab
    for (const h of [ab, ba]) {
      halfEdges.push(h)
      const list = outgoing.get(h.from) ?? []
      list.push(h)
      outgoing.set(h.from, list)
    }
  }
  for (const list of outgoing.values()) list.sort((p, q) => p.angle - q.angle)
  for (const h of halfEdges) {
    const ring = outgoing.get(h.to)!
    const i = ring.indexOf(h.twin)
    h.next = ring[(i - 1 + ring.length) % ring.length]
  }

  const visited = new Set<HalfEdge>()
  const faces: Face[] = []
  for (const start of halfEdges) {
    if (visited.has(start)) continue
    const cyc: HalfEdge[] = []
    for (let h = start; !visited.has(h); h = h.next) {
      visited.add(h)
      cyc.push(h)
    }
    // collapse dangling stubs: a half-edge immediately followed by its twin
    let changed = true
    while (changed && cyc.length) {
      changed = false
      for (let i = 0; i < cyc.length; i++) {
        const j = (i + 1) % cyc.length
        if (i !== j && cyc[i].twin === cyc[j]) {
          cyc.splice(Math.max(i, j), 1)
          cyc.splice(Math.min(i, j), 1)
          changed = true
          break
        }
      }
    }
    if (cyc.length < 3) continue
    // rotate to start at the smallest vertex id so the loop is independent of input order
    let k = 0
    for (let i = 1; i < cyc.length; i++) if (cyc[i].from < cyc[k].from) k = i
    const ordered = [...cyc.slice(k), ...cyc.slice(0, k)]
    const pts = ordered.map((h) => {
      const v = vs.get(h.from)!
      return { x: v.x, y: v.y }
    })
    const area = signedArea(pts)
    if (area <= AREA_EPS) continue // outer face (negative) or degenerate
    faces.push({ loop: ordered.map((h) => h.from), wallIds: ordered.map((h) => h.wall.id), pts, area })
  }
  faces.sort((p, q) => (p.loop.join(',') < q.loop.join(',') ? -1 : 1))
  return faces
}

/** djb2 — stable id for unlabelled faces; changes only when the loop changes. */
function hashLoop(loop: Id[]): string {
  let h = 5381
  for (const ch of loop.join(',')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return h.toString(36)
}

/** Label → the smallest face containing it; first label wins when two share a face. */
function assignLabels(faces: Face[], labels: RoomLabel[]): Map<Face, RoomLabel> {
  const taken = new Map<Face, RoomLabel>()
  for (const label of labels) {
    let best: Face | null = null
    for (const f of faces) {
      if (pointInPolygon(label, f.pts) && (!best || f.area < best.area)) best = f
    }
    if (best && !taken.has(best)) taken.set(best, label)
  }
  return taken
}

export function deriveRooms(graph: Graph): Room[] {
  const faces = traceFaces(graph)
  const labels = assignLabels(faces, graph.roomLabels)
  let spaceN = 0
  return faces.map((f) => {
    const label = labels.get(f)
    const base = { loop: f.loop, wallIds: f.wallIds, areaSqm: f.area, centroid: polygonCentroid(f.pts) }
    if (label) {
      return { ...base, id: label.id, name: label.name, kind: label.kind, printedSize: label.printedSize }
    }
    spaceN++
    return { ...base, id: `space-${hashLoop(f.loop)}`, name: `Space ${spaceN}`, kind: 'other' }
  })
}

/** Faces smaller than this are not nagged about being unlabelled (shafts, wall pockets). */
export const MIN_LABELLED_AREA_SQM = 0.5
const TOUCH_TOL_M = 1e-6

/** Distance from p to segment ab. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Proper crossing (strict sign change on both segments). Endpoint touches are handled separately. */
function properCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = cross(p3, p4, p1)
  const d2 = cross(p3, p4, p2)
  const d3 = cross(p1, p2, p3)
  const d4 = cross(p1, p2, p4)
  const e = 1e-12
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))
}

export function validate(unit: Unit): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (code: ValidationIssue['code'], message: string, ids: Id[]) =>
    issues.push({ level: 'error', code, message, ids })
  const warn = (code: ValidationIssue['code'], message: string, ids: Id[]) =>
    issues.push({ level: 'warning', code, message, ids })

  const vs = vertexMap(unit.vertices)
  const degree = new Map<Id, number>(unit.vertices.map((v) => [v.id, 0]))
  const seenKeys = new Map<string, Id>()
  const good: { wall: Wall; a: Vertex; b: Vertex }[] = []

  for (const w of unit.walls) {
    const a = vs.get(w.a)
    const b = vs.get(w.b)
    if (!a || !b) {
      err('zero-length-wall', `wall ${w.id} references a missing vertex`, [w.id])
      continue
    }
    degree.set(w.a, (degree.get(w.a) ?? 0) + 1)
    degree.set(w.b, (degree.get(w.b) ?? 0) + 1)
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (w.a === w.b || len <= 1e-9) {
      err('zero-length-wall', `wall ${w.id} has zero length`, [w.id])
      continue
    }
    const k = wallKey(w)
    const dup = seenKeys.get(k)
    if (dup) {
      err('duplicate-wall', `wall ${w.id} duplicates wall ${dup}`, [w.id, dup])
      continue
    }
    seenKeys.set(k, w.id)
    good.push({ wall: w, a, b })

    const spans = w.openings.map((o) => ({ o, u0: o.offsetM, u1: o.offsetM + o.widthM }))
    for (const { o, u0, u1 } of spans) {
      if (o.widthM <= 0 || u0 < -TOUCH_TOL_M || u1 > len + TOUCH_TOL_M) {
        err(
          'opening-out-of-bounds',
          `opening ${o.id} spans ${u0.toFixed(3)}–${u1.toFixed(3)} m on a ${len.toFixed(3)} m wall`,
          [w.id, o.id],
        )
      }
    }
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        const p = spans[i]
        const q = spans[j]
        if (p.u0 < q.u1 - TOUCH_TOL_M && q.u0 < p.u1 - TOUCH_TOL_M) {
          err('openings-overlap', `openings ${p.o.id} and ${q.o.id} overlap on wall ${w.id}`, [
            w.id,
            p.o.id,
            q.o.id,
          ])
        }
      }
    }
  }

  for (const [id, d] of degree) {
    if (d === 0) err('dangling-vertex', `vertex ${id} is not used by any wall`, [id])
    else if (d === 1) warn('dangling-vertex', `vertex ${id} ends a dangling wall`, [id])
  }

  // ponytail: O(n²) pair scan; a unit has tens of walls, not thousands
  for (let i = 0; i < good.length; i++) {
    for (let j = i + 1; j < good.length; j++) {
      const P = good[i]
      const Q = good[j]
      const shared = new Set([P.wall.a, P.wall.b].filter((id) => id === Q.wall.a || id === Q.wall.b))
      let hit = false
      if (!shared.size && properCross(P.a, P.b, Q.a, Q.b)) hit = true
      // an endpoint (that is not the shared vertex) lying on the other wall = T-junction / overlap
      for (const [e, id] of [
        [P.a, P.wall.a],
        [P.b, P.wall.b],
      ] as const) {
        if (!shared.has(id) && distToSegment(e, Q.a, Q.b) <= TOUCH_TOL_M) hit = true
      }
      for (const [e, id] of [
        [Q.a, Q.wall.a],
        [Q.b, Q.wall.b],
      ] as const) {
        if (!shared.has(id) && distToSegment(e, P.a, P.b) <= TOUCH_TOL_M) hit = true
      }
      if (hit) {
        err('walls-intersect', `walls ${P.wall.id} and ${Q.wall.id} cross or touch mid-segment; split them at a shared vertex`, [
          P.wall.id,
          Q.wall.id,
        ])
      }
    }
  }

  const rooms = deriveRooms(unit)
  const labelIds = new Set(unit.roomLabels.map((l) => l.id))
  for (const label of unit.roomLabels) {
    const owner = rooms.find((r) => r.id === label.id)
    if (owner) continue
    const inside = rooms.find((r) => pointInPolygon(label, roomPolygon(r, unit)))
    err(
      'label-outside-any-room',
      inside
        ? `label "${label.name}" shares a face with label "${inside.name}"`
        : `label "${label.name}" is not inside any enclosed face`,
      [label.id],
    )
  }
  for (const r of rooms) {
    if (!labelIds.has(r.id) && r.areaSqm >= MIN_LABELLED_AREA_SQM) {
      warn('unlabelled-room', `${r.name} (${r.areaSqm.toFixed(1)} m²) has no RoomLabel`, [r.id, ...r.wallIds])
    }
  }
  return issues
}
