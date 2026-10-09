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
 * resolved by "smallest containing face wins" in labelling and roomAt);
 * validate warns 'island-in-room'. Joined by one flush line (heightM 0) the
 * outer face becomes a keyhole that goes round it (area and floor without it).
 *
 * Touching is joined (founder 2026-10-09: "a room is closed once a wall touches a pillar — in the middle or on the edge
 * … pillar or not, a wall touches another wall, that is it, it is a box"): faces are traced on joinTouching's graph, where
 * a LOOSE wall end on / in a column's block or in another wall's body meets it (see there). The unit is not changed.
 */
import type { Id, Pillar, Room, RoomLabel, Unit, ValidationIssue, Vertex, Wall } from './types'
import {
  AREA_EPS,
  cross,
  pointInPolygon,
  polygonCentroid,
  roomAt,
  roomLevelAt,
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

/** A loose wall end this close to a column's block or to another wall's body touches it, m (half an inch). */
export const TOUCH_M = 0.0127
/** sin 10°: an end meeting a wall closer than this to parallel goes square across to its centre line */
const SIN10 = 0.1736

type Box = { x0: number; y0: number; x1: number; y1: number }
const boxOf = (c: Pillar): Box => ({ x0: c.x - c.wM / 2, y0: c.y - c.hM / 2, x1: c.x + c.wM / 2, y1: c.y + c.hM / 2 })
const inBox = (R: Box, p: Pt, tol: number) => p.x >= R.x0 - tol && p.x <= R.x1 + tol && p.y >= R.y0 - tol && p.y <= R.y1 + tol

interface Joined {
  vertices: Vertex[]
  walls: Wall[]
  /** the points added (no vertex of the unit): id → plan point */
  pts: Map<Id, Pt>
  /** the loose ends joined (never dangling) */
  ends: Set<Id>
  /** the columns something joins: the faces inside them are the columns themselves */
  cols: Box[]
}

/**
 * The graph rooms are traced on. A LOOSE wall end (one wall) on or in a column's block (within TOUCH_M) joins everything
 * at that column: the block's outline becomes edges (`<column id>#e<k>`, corners `<column id>#<k>`), every wall crossing
 * it is split there (a piece keeps its wall's id; the point is `<wall id>@<m along it>`), so the rooms beside it go round
 * the column. Any other loose end inside another wall's body (within TOUCH_M of its face, never a wall sharing a corner
 * with its own) meets that wall's centre line along its own line (square across when within 10° of parallel; a link
 * edge with its own wall's id), the wall split there. Nothing else changes; no loose end = the unit's own walls.
 */
function joinTouching(graph: Graph): Joined {
  const vs = vertexMap(graph.vertices)
  const walls = usableWalls(graph)
  const deg = new Map<Id, number>()
  for (const w of walls) for (const id of [w.a, w.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
  const loose = [...deg].filter(([, d]) => d === 1).map(([id]) => vs.get(id)!)
  const pts = new Map<Id, Pt>()
  const ends = new Set<Id>()
  const cols: Box[] = []
  if (!loose.length) return { vertices: graph.vertices, walls, pts, ends, cols }
  const seg = (w: Wall) => {
    const a = vs.get(w.a)!, b = vs.get(w.b)!
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    return { a, b, L, dir: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } }
  }
  const cuts = new Map<Id, { s: number; id: Id }[]>()
  /** split `w` at s m from its a (an earlier split within a micron is that one): the id used there */
  const cut = (w: Wall, s: number, id: Id, p?: Pt): Id => {
    const list = cuts.get(w.id) ?? []
    const hit = list.find((c) => Math.abs(c.s - s) < 1e-6)
    if (hit) return hit.id
    cuts.set(w.id, [...list, { s, id }])
    if (p) pts.set(id, p)
    return id
  }
  const extra: Wall[] = []
  const alias = new Map<Id, Id>()
  const edge = (id: Id, a: Id, b: Id): Wall => ({ id, a, b, thicknessM: 0, heightM: 0, openings: [] })

  for (const c of graph.pillars ?? []) {
    const R = boxOf(c)
    const mine = loose.filter((v) => !ends.has(v.id) && inBox(R, v, TOUCH_M))
    if (!mine.length) continue
    for (const v of mine) ends.add(v.id)
    cols.push(R)
    const rim = (p: Pt) => Math.min(Math.abs(p.x - R.x0), Math.abs(p.x - R.x1), Math.abs(p.y - R.y0), Math.abs(p.y - R.y1)) <= TOUCH_M
    // on the rim: a corner of walls in / on the block, or a loose end just short of it (its own point)
    const ring = new Map<Id, Pt>()
    for (const id of deg.keys()) {
      const v = vs.get(id)!
      if (inBox(R, v, TOUCH_M) && rim(v) && (inBox(R, v, 0) || deg.get(id) === 1)) ring.set(id, v)
    }
    // where a wall crosses the block's outline (Liang–Barsky on the closed block)
    for (const w of walls) {
      const { a, b, L } = seg(w)
      let t0 = 0, t1 = 1
      const dx = b.x - a.x, dy = b.y - a.y
      for (const [p, q] of [[-dx, a.x - R.x0], [dx, R.x1 - a.x], [-dy, a.y - R.y0], [dy, R.y1 - a.y]]) {
        if (Math.abs(p) < 1e-12) {
          if (q < 0) t0 = 2 // parallel and outside
        } else if (p < 0) t0 = Math.max(t0, q / p)
        else t1 = Math.min(t1, q / p)
      }
      if (t0 > t1) continue
      for (const t of new Set([t0, t1])) {
        if (t <= 0 || t >= 1) continue
        const q = { x: a.x + dx * t, y: a.y + dy * t }
        if ((ring.has(w.a) && t * L <= TOUCH_M) || (ring.has(w.b) && (1 - t) * L <= TOUCH_M)) continue // that end is on the rim
        ring.set(cut(w, t * L, `${w.id}@${(t * L).toFixed(4)}`, q), q)
      }
    }
    const corners = [{ x: R.x0, y: R.y0 }, { x: R.x1, y: R.y0 }, { x: R.x1, y: R.y1 }, { x: R.x0, y: R.y1 }]
    corners.forEach((p, k) => {
      if (![...ring.values()].some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= TOUCH_M)) ring.set(`${c.id}#${k}`, p), pts.set(`${c.id}#${k}`, p)
    })
    // round the outline clockwise on screen from its top-left corner: each point by its nearest side
    const [W, H] = [R.x1 - R.x0, R.y1 - R.y0]
    const per = (p: Pt) => {
      const x = Math.max(R.x0, Math.min(R.x1, p.x)), y = Math.max(R.y0, Math.min(R.y1, p.y))
      const side = [Math.abs(p.y - R.y0), Math.abs(p.x - R.x1), Math.abs(p.y - R.y1), Math.abs(p.x - R.x0)]
      const k = side.indexOf(Math.min(...side))
      return [x - R.x0, W + y - R.y0, W + H + R.x1 - x, 2 * W + H + R.y1 - y][k] % (2 * (W + H))
    }
    // two ends on one spot (two walls drawn to the same corner) are one point of the outline
    const order: [Id, Pt][] = []
    for (const [id, p] of [...ring].sort((m, n) => per(m[1]) - per(n[1]))) {
      const same = order.find(([, q]) => Math.hypot(q.x - p.x, q.y - p.y) <= 1e-6)
      if (same) alias.set(id, same[0])
      else order.push([id, p])
    }
    const along = (w: Wall, p: Pt) => {
      const { a, L, dir } = seg(w)
      const s = (p.x - a.x) * dir.x + (p.y - a.y) * dir.y
      return s >= -1e-6 && s <= L + 1e-6 && Math.abs((p.x - a.x) * dir.y - (p.y - a.y) * dir.x) <= 1e-6
    }
    order.forEach(([id, p], k) => {
      const [nid, q] = order[(k + 1) % order.length]
      if (nid === id || Math.hypot(q.x - p.x, q.y - p.y) <= 1e-9 || walls.some((w) => along(w, p) && along(w, q))) return // a wall runs there
      extra.push(edge(`${c.id}#e${k}`, id, nid))
    })
  }

  const inCol = (p: Pt) => cols.some((R) => inBox(R, p, TOUCH_M))
  for (const v of loose) {
    if (ends.has(v.id)) continue
    const own = walls.find((w) => w.a === v.id || w.b === v.id)!
    const far = vs.get(own.a === v.id ? own.b : own.a)!
    const Lo = Math.hypot(v.x - far.x, v.y - far.y)
    const u = { x: (v.x - far.x) / Lo, y: (v.y - far.y) / Lo }
    let best: { w: Wall; s: number; d: number } | null = null
    for (const w of walls) {
      if (w === own || w.a === own.a || w.a === own.b || w.b === own.a || w.b === own.b) continue
      const { a, L, dir } = seg(w)
      const body = (p: Pt) => {
        const s = (p.x - a.x) * dir.x + (p.y - a.y) * dir.y
        const d = Math.abs((p.x - a.x) * dir.y - (p.y - a.y) * dir.x)
        return d <= w.thicknessM / 2 + TOUCH_M && s >= -TOUCH_M && s <= L + TOUCH_M ? { s, d } : null
      }
      const at = body(v)
      // a nib lying wholly inside the wall (a traced jog) meets nothing: it would only close a sliver
      if (at && !body(far) && (!best || at.d < best.d)) best = { w, ...at }
    }
    if (!best) continue
    const { w } = best
    const { a, L, dir } = seg(w)
    const den = u.x * dir.y - u.y * dir.x
    const r = -((v.x - a.x) * dir.y - (v.y - a.y) * dir.x) / den // along its own line to w's centre line
    let s = best.s + r * (u.x * dir.x + u.y * dir.y)
    const own0 = Math.abs(den) >= SIN10 && s >= 0 && s <= L
    if (!own0) s = Math.max(0, Math.min(L, best.s))
    const P = { x: a.x + dir.x * s, y: a.y + dir.y * s }
    if (inCol(P)) continue // ponytail: it would meet the wall inside a column's outline; left loose
    ends.add(v.id)
    if (Math.hypot(P.x - v.x, P.y - v.y) <= 1e-9) {
      cut(w, s, v.id) // on the centre line already: a T there
      continue
    }
    const id = s <= TOUCH_M ? w.a : s >= L - TOUCH_M ? w.b : cut(w, s, `${w.id}@${s.toFixed(4)}`, P)
    if (deg.get(id) === 1) ends.add(id) // it lands on that wall's own loose end: both are joined
    if (own0 && r < 0) cut(own, own.a === v.id ? -r : Lo + r, id, pts.get(id)) // past the centre line: the two cross there
    else extra.push({ ...own, a: v.id, b: id, openings: [] })
  }

  const out: Wall[] = []
  for (const w of walls) {
    const { L } = seg(w)
    const cs = (cuts.get(w.id) ?? []).filter((c) => c.s > 1e-6 && c.s < L - 1e-6).sort((p, q) => p.s - q.s)
    let prev = w.a
    for (const c of cs) if (c.id !== prev) out.push({ ...w, a: prev, b: c.id }), (prev = c.id)
    out.push(prev === w.a ? w : { ...w, a: prev, b: w.b })
  }
  const one = (w: Wall): Wall => (alias.has(w.a) || alias.has(w.b) ? { ...w, a: alias.get(w.a) ?? w.a, b: alias.get(w.b) ?? w.b } : w)
  return { vertices: [...graph.vertices, ...[...pts].map(([id, p]) => ({ id, x: p.x, y: p.y }))], walls: [...out, ...extra].map(one), pts, ends, cols }
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

/**
 * "TYPE-A ±2736 SFT", "Type B": a label of kind 'other' that reads so names its FLAT (core.deriveFlats: "Type A"), as the
 * sheet prints it inside one of the flat's rooms — never a face. null for any other label.
 */
export function flatTypeOf(l: Pick<RoomLabel, 'name' | 'kind'>): string | null {
  const m = l.kind === 'other' ? /\btype[\s-]*([a-z0-9]{1,2})\b/i.exec(l.name) : null
  return m ? `Type ${m[1].toUpperCase()}` : null
}

/** Label → the smallest face containing it; first label wins when two share a face; a flat's "Type A" label names none. */
function assignLabels(faces: Face[], labels: RoomLabel[]): Map<Face, RoomLabel> {
  const taken = new Map<Face, RoomLabel>()
  for (const label of labels) {
    if (flatTypeOf(label)) continue
    let best: Face | null = null
    for (const f of faces) {
      if (pointInPolygon(label, f.pts) && (!best || f.area < best.area)) best = f
    }
    if (best && !taken.has(best)) taken.set(best, label)
  }
  return taken
}

export function deriveRooms(graph: Graph): Room[] {
  const J = joinTouching(graph)
  // the faces inside a column are the column itself
  const faces = traceFaces(J).filter((f) => !J.cols.some((R) => f.pts.every((p) => inBox(R, p, TOUCH_M))))
  const labels = assignLabels(faces, graph.roomLabels)
  let spaceN = 0
  return faces.map((f) => {
    const label = labels.get(f)
    const added = f.loop.filter((id) => J.pts.has(id))
    const base = { loop: f.loop, wallIds: f.wallIds, areaSqm: f.area, centroid: polygonCentroid(f.pts), ...(added.length ? { joinPts: Object.fromEntries(added.map((id) => [id, J.pts.get(id)!])) } : {}) }
    if (label) {
      const { levelM, slope } = label
      return { ...base, id: label.id, name: label.name, kind: label.kind, printedSize: label.printedSize, ...(levelM !== undefined ? { levelM } : {}), ...(slope ? { slope } : {}) }
    }
    spaceN++
    return { ...base, id: `space-${hashLoop(f.loop)}`, name: `Space ${spaceN}`, kind: 'other' }
  })
}

/** The floor height at a plan point, m: the smallest face around it (roomAt) by roomLevelAt; 0 outside every face. */
export function floorLevelAt(graph: Graph, x: number, y: number, rooms: Room[] = deriveRooms(graph)): number {
  const r = roomAt({ x, y }, rooms, graph)
  return r ? roomLevelAt(r, graph, x, y) : 0
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

  // a wall that stands alone ends free on purpose (a screen, a fin): its loose ends are no issue;
  // nor is an end touching a column or another wall's body (founder 2026-10-09: touching is joined — joinTouching)
  const meant = new Set(unit.walls.filter((w) => w.standsAlone).flatMap((w) => [w.a, w.b]))
  const J = joinTouching(unit)
  for (const [id, d] of degree) {
    if (d === 0) err('dangling-vertex', `vertex ${id} is not used by any wall`, [id])
    else if (d === 1 && !meant.has(id) && !J.ends.has(id)) warn('dangling-vertex', `vertex ${id} ends a dangling wall`, [id])
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
    if (inside && flatTypeOf(label)) continue // a flat's "Type A" label, standing in one of its rooms
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

  // islands: a group of walls joined to nothing that closes a face, standing inside a face of another group (a building
  // inside its lawn, a lift core inside a deck). deriveRooms does not cut it out, so that face's floor runs under it; one
  // flush line (heightM 0) joining it makes the outer face a keyhole that goes round it.
  const parent = new Map<Id, Id>()
  const find = (id: Id): Id => {
    const p = parent.get(id)
    return p === undefined || p === id ? id : find(p)
  }
  for (const w of usableWalls(J)) parent.set(find(w.a), find(w.b)) // what touches is joined (a column links its walls)
  const done = new Set<Id>()
  for (const r of rooms) {
    const c = find(r.loop[0])
    if (done.has(c)) continue
    done.add(c)
    const p = roomPolygon(r, unit)[0]
    let outer: Room | null = null
    for (const o of rooms) {
      if (find(o.loop[0]) !== c && (!outer || o.areaSqm < outer.areaSqm) && pointInPolygon(p, roomPolygon(o, unit))) outer = o
    }
    if (outer) {
      warn('island-in-room', `walls around "${r.name}" stand inside "${outer.name}" joined to nothing: join them to it with a flush line (height 0)`, [
        outer.id,
        ...usableWalls(unit).filter((w) => find(w.a) === c).map((w) => w.id),
      ])
    }
  }
  return issues
}
