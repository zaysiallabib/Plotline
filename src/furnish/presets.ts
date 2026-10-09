/**
 * Per-room furnishing presets: deterministic placements from the wall graph.
 * PURE — no three, no DOM (Vitest runs this in node).
 *
 * Plan space is y-down. FurniturePlacement.rotationDeg is CLOCKWISE on screen,
 * 0 = the asset's front faces +y. So the front vector for rotation θ is
 *   f(θ) = (−sin θ, cos θ)          (θ = 90° → front = −x, i.e. screen-left)
 * and the asset's local +x (its width axis) maps to (cos θ, sin θ).
 * Inverse: to face unit vector f, θ = atan2(−f.x, f.y).
 *
 * Room loops are positive (see core/geometry.ts), so for an edge with unit
 * direction d the inward normal is n = (−d.y, d.x). An item "against" that
 * edge has front = n, width along d, and its centre at
 *   p0 + d·u + n·(thickness/2 + GAP + depth/2).
 *
 * Every candidate footprint (4 rotated corners) must lie inside the room's
 * inner polygon. Beyond that, by placement mode:
 *  - 'solid' (default): must not cross a door/passage clear zone (opening width × 1 m into the room where a
 *    leaf swings in or it is a passage; 0.6 m where the leaf swings away or slides); must not overlap an earlier solid footprint whose height
 *    range [bottom, top] overlaps its own (a frame above a sofa is fine, a frame
 *    behind a wardrobe is not); must not stand in front of a window it would cover
 *    (top > sill + 0.35 m, e.g. a wardrobe, a mirror, upper cabinets).
 *  - 'stack' (wall cabinets / hood over a base module): 'solid' minus the furniture overlap test.
 *  - 'flat' (rugs): only the door clear zones and other rugs; furniture stands on them.
 *  - 'free' (ceiling fixtures, cushions on a sofa, a wall AC after its own checks): the inside test only.
 * Plants and the glass shower screen may stand in front of a window.
 */
import type { FurniturePlacement, Room, RoomKind, Unit } from '../core'
import { isOutdoor, pointInPolygon, polygonCentroid, roomInnerPolygon, roomPolygon, type Pt } from '../core'
import { heightRange, isCeilingLight, kitAsset, objectKind } from './kit'
import { ART_SETS, ART_W, BED_STYLES, PERGOLA_POST, planterId, STAIR_W, stairId, TRUNK_CLEAR } from './procedural.meta'

export const GAP = 0.05
/** `out` for wall-hung / fitted pieces: back 5 mm off the wall instead of GAP. */
const FLUSH = -GAP + 0.005
const DOOR_CLEAR = 1.0
/** Clear depth in front of a door whose leaf does not sweep the room (it swings away, or slides): room to step in. */
const STEP_IN = 0.6
/** A bed keeps the straight path in from every door free: door width × ENTRY into the room (a slider onto a veranda: its step-in zone). */
export const ENTRY = 1.2
/** A wardrobe keeps this much floor free in front of it, and a PATH_W wide straight path to it from some door that the bed does not cross. */
export const WARDROBE_CLEAR = 0.7
export const PATH_W = 0.6
/** Piece size by room size: a lounge in a room narrower than this gets the 2-seat sofa; a dining room under DINING_4 m² seats 4. */
const NARROW = 3.0
const DINING_4 = 10
/** How far a window "reaches" into the room for the cover test, and how much sill overlap is fine. */
const WIN_DEPTH = 0.3
const SILL_SLACK = 0.35
/** Glass-walled, may stand under a window (bath ventilators usually sit over the shower). */
const SEE_THROUGH = new Set(['shower_screen'])
const EPS = 1e-9

type Mode = 'solid' | 'stack' | 'flat' | 'free'

interface Side {
  p0: Pt // centerline start
  d: Pt // unit direction along the loop
  n: Pt // inward normal
  len: number
  thick: number
  /** the walls along it (collinear ones merged) */
  wallIds: string[]
  /** [u0, u1] along the side from p0, clear depth into the room, entry-path depth (ENTRY; a slider: its step-in) */
  doors: [number, number, number, number][]
  wins: { u0: number; u1: number; sill: number; top: number }[]
}

interface Ctx {
  room: Room
  unit: Unit
  /** every room of the unit (a planter's outer edge is a wall no other room has) */
  rooms: Room[]
  inner: Pt[]
  sides: Side[]
  corners: Pt[] // inner polygon vertices, convex first, sorted far-from-doors
  doorPts: Pt[]
  clear: Pt[][]
  /** door width × ENTRY into the room, per door: no bed there */
  entry: Pt[][]
  wins: { q: Pt[]; sill: number; top: number }[]
  quads: { q: Pt[]; y0: number; y1: number }[]
  rugs: Pt[][]
  out: FurniturePlacement[]
  counts: Map<string, number>
  /** centroid of the unit's kitchen, if any (the dining table goes to the end nearest it) */
  kitchen: Pt | null
  /** bed linen (BED_STYLES), by the bedroom's size rank in the unit */
  bedStyle: string
}

const size = (assetId: string) => kitAsset(assetId)?.sizeM ?? { x: 1, y: 1, z: 1 }
const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y
const norm360 = (deg: number) => ((Math.round(deg * 1000) / 1000) % 360 + 360) % 360

/** rotationDeg whose front faces unit vector f (see header). */
export const rotationFacing = (f: Pt): number => norm360((Math.atan2(-f.x, f.y) * 180) / Math.PI)

/** Four plan corners of an asset centred at c with rotation θ. */
export function footprint(c: Pt, rotationDeg: number, sz: { x: number; z: number }): Pt[] {
  const t = (rotationDeg * Math.PI) / 180
  const ex = { x: Math.cos(t), y: Math.sin(t) } // local +x
  const ey = { x: -Math.sin(t), y: Math.cos(t) } // local +y (front)
  const hw = sz.x / 2
  const hd = sz.z / 2
  return [
    add(add(c, ex, -hw), ey, -hd),
    add(add(c, ex, hw), ey, -hd),
    add(add(c, ex, hw), ey, hd),
    add(add(c, ex, -hw), ey, hd),
  ]
}

/** Separating-axis test for two convex polygons. Touching edges do not count. */
export function quadsOverlap(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const ax = p.y - q.y
      const ay = q.x - p.x
      const proj = (P: Pt[]) => {
        let lo = Infinity
        let hi = -Infinity
        for (const v of P) {
          const s = v.x * ax + v.y * ay
          lo = Math.min(lo, s)
          hi = Math.max(hi, s)
        }
        return [lo, hi]
      }
      const [a0, a1] = proj(a)
      const [b0, b1] = proj(b)
      if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false
    }
  }
  return true
}

/** Loop edges → sides; consecutive collinear edges (split walls) are merged so "longest wall" means the real wall. */
function buildSides(room: Room, unit: Unit): Side[] {
  const poly = roomPolygon(room, unit)
  const walls = new Map(unit.walls.map((w) => [w.id, w]))
  const vs = new Map(unit.vertices.map((v) => [v.id, v]))
  const raw: Side[] = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const len = dist(p, q) || 1
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const w = walls.get(room.wallIds[i])
    // which way the edge runs along its wall, and where the wall starts on it: by the plan, not by vertex ids (a wall
    // split where a loose end or a column joins it is several edges with one id, core Room.joinPts)
    const wa = w && vs.get(w.a)
    const wd = wa && w && vs.get(w.b) ? { x: vs.get(w.b)!.x - wa.x, y: vs.get(w.b)!.y - wa.y } : null
    const forward = !!wd && wd.x * d.x + wd.y * d.y > 0
    const at0 = wa ? (wa.x - p.x) * d.x + (wa.y - p.y) * d.y : 0 // the wall's a, along this edge
    const doors: Side['doors'] = []
    const wins: Side['wins'] = []
    for (const o of w?.openings ?? []) {
      const u0 = forward ? at0 + o.offsetM : at0 - o.offsetM - o.widthM
      if (u0 + o.widthM <= 0 || u0 >= len) continue // on another piece of the wall
      if (o.kind === 'window') wins.push({ u0, u1: u0 + o.widthM, sill: o.sillM, top: o.sillM + o.heightM })
      else {
        // leaf side as openings.ts builds it: 'out' = +normal, which is this room's side when the wall runs with the loop
        const slides = o.kind === 'slider'
        const sweeps = o.kind === 'passage' || (!slides && (o.swing !== 'in') === forward)
        doors.push([u0, u0 + o.widthM, sweeps ? DOOR_CLEAR : STEP_IN, slides ? STEP_IN : ENTRY])
      }
    }
    return { p0: p, d, n: { x: -d.y, y: d.x }, len, thick: w?.thicknessM ?? 0.127, wallIds: [room.wallIds[i]], doors, wins }
  })
  const collinear = (a: Side, b: Side) => a.d.x * b.d.x + a.d.y * b.d.y > 0.9999
  const merge = (a: Side, b: Side) => {
    for (const [u0, u1, depth, entry] of b.doors) a.doors.push([u0 + a.len, u1 + a.len, depth, entry])
    for (const w of b.wins) a.wins.push({ ...w, u0: w.u0 + a.len, u1: w.u1 + a.len })
    a.len += b.len
    a.thick = Math.max(a.thick, b.thick)
    a.wallIds.push(...b.wallIds)
  }
  const out: Side[] = []
  for (const s of raw) {
    const prev = out[out.length - 1]
    if (prev && collinear(prev, s)) merge(prev, s)
    else out.push(s)
  }
  if (out.length > 1 && collinear(out[out.length - 1], out[0])) {
    merge(out[out.length - 1], out[0])
    out.shift()
  }
  return out
}

/** Opening span [u0, u1] on a side → plan quad from the wall's inner face `depth` into the room. */
const spanQuad = (s: Side, u0: number, u1: number, depth: number): Pt[] => {
  const a = add(add(s.p0, s.d, u0), s.n, s.thick / 2)
  const b = add(add(s.p0, s.d, u1), s.n, s.thick / 2)
  return [a, b, add(b, s.n, depth), add(a, s.n, depth)]
}

/** Door/passage clear zones of a room (opening width × clear depth into the room); `entry`: the entry paths no bed may stand on. */
export function doorClearZones(room: Room, unit: Unit, entry = false): Pt[][] {
  return buildSides(room, unit).flatMap((s) => s.doors.map(([u0, u1, depth, e]) => spanQuad(s, u0, u1, entry ? e : depth)))
}

/** A room's windows as the cover test sees them (fits): span × WIN_DEPTH into the room, and the heights a piece may not reach into. */
export function windowZones(room: Room, unit: Unit): { q: Pt[]; from: number; to: number }[] {
  return buildSides(room, unit).flatMap((s) => s.wins.map((w) => ({ q: spanQuad(s, w.u0 + 0.05, w.u1 - 0.05, WIN_DEPTH), from: w.sill + SILL_SLACK, to: w.top })))
}

function makeCtx(room: Room, unit: Unit, rooms: Room[], kitchen: Pt | null, bedStyle: string): Ctx {
  const sides = buildSides(room, unit)
  const inner = roomInnerPolygon(room, unit)
  const doorPts: Pt[] = []
  const clear: Pt[][] = []
  const entry: Pt[][] = []
  const wins: Ctx['wins'] = []
  for (const s of sides) {
    for (const [u0, u1, depth, entryDepth] of s.doors) {
      clear.push(spanQuad(s, u0, u1, depth))
      entry.push(spanQuad(s, u0, u1, entryDepth))
      doorPts.push(add(add(s.p0, s.d, (u0 + u1) / 2), s.n, s.thick / 2))
    }
    // 5 cm trim at each end: a cabinet may butt up to a window that starts in the corner
    for (const w of s.wins) wins.push({ q: spanQuad(s, w.u0 + 0.05, w.u1 - 0.05, WIN_DEPTH), sill: w.sill, top: w.top })
  }
  const farFromDoors = (p: Pt) => (doorPts.length ? Math.min(...doorPts.map((q) => dist(p, q))) : 0)
  const corners = [...inner].sort((a, b) => farFromDoors(b) - farFromDoors(a))
  return { room, unit, rooms, inner, sides, corners, doorPts, clear, entry, wins, quads: [], rugs: [], out: [], counts: new Map(), kitchen, bedStyle }
}

/** The footprint if `assetId` may stand at c (see header for modes), else null. */
function fits(ctx: Ctx, assetId: string, c: Pt, rotationDeg: number, mode: Mode, scale = 1): Pt[] | null {
  const s = size(assetId)
  const quad = footprint(c, rotationDeg, { x: s.x * scale, z: s.z * scale })
  if (!quad.every((p) => pointInPolygon(p, ctx.inner))) return null
  if (mode === 'free') return quad
  if (ctx.clear.some((q) => quadsOverlap(q, quad))) return null
  if (assetId.startsWith('bed_') && ctx.entry.some((q) => quadsOverlap(q, quad))) return null
  if (mode === 'flat') return ctx.rugs.some((q) => quadsOverlap(q, quad)) ? null : quad
  const a = kitAsset(assetId)
  const [y0, y1] = a ? heightRange(a) : [0, 1]
  const coversWindow = (w: Ctx['wins'][number]) => y1 > w.sill + SILL_SLACK && y0 < w.top && quadsOverlap(w.q, quad)
  if (!SEE_THROUGH.has(assetId) && !(a && objectKind(a) === 'plant') && ctx.wins.some(coversWindow)) return null
  if (mode === 'solid' && ctx.quads.some((o) => o.y1 > y0 + 0.02 && o.y0 < y1 - 0.02 && quadsOverlap(o.q, quad))) return null
  return quad
}

function tryPlace(ctx: Ctx, assetId: string, c: Pt, rotationDeg: number, mode: Mode = 'solid', scale?: number): FurniturePlacement | null {
  const quad = fits(ctx, assetId, c, rotationDeg, mode, scale)
  if (!quad) return null
  const n = (ctx.counts.get(assetId) ?? 0) + 1
  ctx.counts.set(assetId, n)
  const p: FurniturePlacement = {
    id: `${ctx.room.id}:${assetId}:${n}`,
    assetId,
    roomId: ctx.room.id,
    x: c.x,
    y: c.y,
    rotationDeg: norm360(rotationDeg),
    ...(scale ? { scale } : {}),
  }
  ctx.out.push(p)
  if (mode === 'solid' || mode === 'stack') {
    const a = kitAsset(assetId)
    const [y0, y1] = a ? heightRange(a) : [0, 1]
    ctx.quads.push({ q: quad, y0, y1 })
  } else if (mode === 'flat') ctx.rugs.push(quad)
  return p
}

/** Runs `fn`; if it returns false every placement it made is rolled back (all-or-nothing groups). */
function atomic(ctx: Ctx, fn: () => boolean): boolean {
  const n = [ctx.out.length, ctx.quads.length, ctx.rugs.length]
  const counts = new Map(ctx.counts)
  if (fn()) return true
  ctx.out.length = n[0]
  ctx.quads.length = n[1]
  ctx.rugs.length = n[2]
  ctx.counts = counts
  return false
}

/** Centre of an item against `side` at distance u along it, plus `out` metres further into the room. */
const againstSide = (side: Side, assetId: string, u: number, out = 0): Pt =>
  add(add(side.p0, side.d, u), side.n, side.thick / 2 + GAP + size(assetId).z / 2 + out)

/** Where the perpendicular from p meets `side`, clamped to it. */
const projU = (side: Side, p: Pt) => Math.min(side.len, Math.max(0, dot({ x: p.x - side.p0.x, y: p.y - side.p0.y }, side.d)))

/** Positions along a side for an item hw half-wide: uPref first, then ±0.25 m steps (at most `reach`), each end 0.1 m off the corner. */
function* slots(side: Side, hw: number, uPref = side.len / 2, reach = side.len / 2) {
  for (let k = 0; k * 0.25 <= reach; k++) for (const u of k ? [uPref - k * 0.25, uPref + k * 0.25] : [uPref]) if (u - hw >= 0.1 && u + hw <= side.len - 0.1) yield u
}

/** Place against a side at the first of its slots where the footprint fits (and `ok` holds). */
function onSide(ctx: Ctx, side: Side, assetId: string, uPref = side.len / 2, out = 0, mode: Mode = 'solid', reach = side.len / 2, ok?: (c: Pt) => boolean) {
  const rot = rotationFacing(side.n)
  for (const u of slots(side, size(assetId).x / 2, uPref, reach)) {
    const c = againstSide(side, assetId, u, out)
    if (ok && !ok(c)) continue
    const p = tryPlace(ctx, assetId, c, rot, mode)
    if (p) return { p, u, c, side, rot }
  }
  return null
}

/** Try sides in order until one takes the item. */
function onSides(ctx: Ctx, sides: Side[], assetId: string, out = 0) {
  for (const s of sides) {
    const r = onSide(ctx, s, assetId, s.len / 2, out)
    if (r) return r
  }
  return null
}

/**
 * In a corner of the inner polygon, facing the outgoing edge's inward normal. Corners farthest from doors first.
 * Edge directions snap to the nearest real wall direction: where wall thickness steps along a straight wall the
 * inner polygon gets a short slanted edge, and a corner piece must not come out skewed by it.
 */
function inCorner(ctx: Ctx, assetId: string, exclude: Pt[] = [], gap = GAP) {
  const n = ctx.inner.length
  const sz = size(assetId)
  const snap = (e: Pt) => ctx.sides.map((s) => s.d).reduce((b, d) => (dot(d, e) > dot(b, e) ? d : b))
  for (const P of ctx.corners) {
    if (exclude.includes(P)) continue
    const i = ctx.inner.indexOf(P)
    const prev = ctx.inner[(i - 1 + n) % n]
    const next = ctx.inner[(i + 1) % n]
    const e1 = snap({ x: (next.x - P.x) / (dist(P, next) || 1), y: (next.y - P.y) / (dist(P, next) || 1) })
    const e0 = snap({ x: (P.x - prev.x) / (dist(P, prev) || 1), y: (P.y - prev.y) / (dist(P, prev) || 1) })
    if (Math.abs(dot(e0, e1)) > 0.9) continue // a thickness step, not a corner
    const c = add(add(P, e1, sz.x / 2 + gap), e0, -(sz.z / 2 + gap))
    const p = tryPlace(ctx, assetId, c, rotationFacing({ x: -e1.y, y: e1.x }))
    if (p) return { p, corner: P }
  }
  return null
}

/**
 * The inner polygon's minimum-area bounding box, trying the walls' directions only: its long axis, long and short
 * extents. Ties keep the longest side's direction. (The true minimum may lie along a hull edge that bridges a notch.)
 */
function bounds(ctx: Ctx) {
  const ext = (a: Pt) => Math.max(...ctx.inner.map((p) => dot(p, a))) - Math.min(...ctx.inner.map((p) => dot(p, a)))
  let best = { axis: ctx.sides[0].d, long: 0, short: 0 }
  for (const s of rankLongest(ctx)) {
    const [a, b] = [ext(s.d), ext(s.n)]
    if (best.long && a * b >= best.long * best.short - 1e-6) continue
    best = a >= b ? { axis: s.d, long: a, short: b } : { axis: s.n, long: b, short: a }
  }
  return best
}

/** Sides ranked: fewest openings (doors + windows) first, then longest, then farthest from doors. */
const rankNoOpenings = (ctx: Ctx) =>
  [...ctx.sides].sort(
    (a, b) =>
      (a.doors.length + a.wins.length > 0 ? 1 : 0) - (b.doors.length + b.wins.length > 0 ? 1 : 0) ||
      b.len - a.len ||
      sideDoorDist(ctx, b) - sideDoorDist(ctx, a),
  )
const rankLongest = (ctx: Ctx) => [...ctx.sides].sort((a, b) => b.len - a.len || a.doors.length - b.doors.length)
const sideDoorDist = (ctx: Ctx, s: Side) => {
  const mid = add(s.p0, s.d, s.len / 2)
  return ctx.doorPts.length ? Math.min(...ctx.doorPts.map((q) => dist(mid, q))) : 0
}
const clearSpan = (s: Side) => s.len - s.doors.reduce((t, [u0, u1]) => t + (u1 - u0), 0)
const opposite = (ctx: Ctx, s: Side) =>
  ctx.sides.filter((o) => o.n.x * s.n.x + o.n.y * s.n.y < -0.7).sort((a, b) => b.len - a.len)
const others = (ctx: Ctx, used: Side[]) => rankLongest(ctx).filter((s) => !used.includes(s))
/** Sides by distance from p to their nearest point. */
const nearest = (ctx: Ctx, p: Pt) => [...ctx.sides].sort((a, b) => dist(p, add(a.p0, a.d, projU(a, p))) - dist(p, add(b.p0, b.d, projU(b, p))))

/**
 * A framed diptych centred at u on `side` (above a sofa or a headboard), else its right half alone. The art set
 * follows the room id so adjoining rooms rarely repeat. Facing the wall, side.d points to your right.
 */
function frames(ctx: Ctx, side: Side, u: number): void {
  const set = ART_SETS[[...ctx.room.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % ART_SETS.length]
  const rot = rotationFacing(side.n)
  const hang = (id: string, du: number) => tryPlace(ctx, id, againstSide(side, id, u + du, FLUSH), rot)
  const du = (ART_W + 0.05) / 2
  if (!atomic(ctx, () => !!hang(`${set}_l`, -du) && !!hang(`${set}_r`, du))) hang(`${set}_r`, 0)
}

// ───────────────────────────── per kind ─────────────────────────────

/** A PATH_W wide strip from a to b. */
const corridor = (a: Pt, b: Pt): Pt[] => {
  const l = dist(a, b) || 1
  const m = { x: (-(b.y - a.y) / l) * (PATH_W / 2), y: ((b.x - a.x) / l) * (PATH_W / 2) }
  return [add(a, m), add(b, m), add(b, m, -1), add(a, m, -1)]
}

/**
 * Wardrobe `id` on the first of `sides` that takes it with WARDROBE_CLEAR free in front: no piece under 1 m high across
 * its width (reserved, so later pieces stay off it), room to stand (PATH_W wide) in front of its middle, and a straight
 * path from some door into that clear strip (to its middle or either end, PATH_W / 2 in) that the bed (footprint `bed`)
 * does not cross.
 */
function wardrobe(ctx: Ctx, sides: Side[], id: string, bed: Pt[]): boolean {
  const sz = size(id)
  for (const s of sides) {
    let zone: Pt[] = []
    const ok = (c: Pt) => {
      const mid = add(c, s.n, sz.z / 2 + WARDROBE_CLEAR / 2)
      zone = footprint(mid, rotationFacing(s.n), { x: sz.x, z: WARDROBE_CLEAR })
      const ends = [0, -1, 1].map((k) => add(mid, s.d, (k * (sz.x - PATH_W)) / 2))
      return (
        footprint(mid, rotationFacing(s.n), { x: PATH_W, z: WARDROBE_CLEAR }).every((p) => pointInPolygon(p, ctx.inner)) &&
        !ctx.quads.some((o) => o.y0 < 1 && quadsOverlap(o.q, zone)) &&
        (!ctx.doorPts.length || ctx.doorPts.some((d) => ends.some((e) => !quadsOverlap(corridor(d, e), bed))))
      )
    }
    if (onSide(ctx, s, id, s.len / 2, 0, 'solid', s.len / 2, ok)) {
      ctx.quads.push({ q: zone, y0: 0, y1: 1 })
      return true
    }
  }
  return false
}

/**
 * Bed at u on `side`, clear of every door's entry path (fits), bedside tables, a rug, prints over it; then wardrobe `robe`
 * on another wall (a 2-door one also beside the bed). False if the bed does not fit or the wardrobe does not (null: none).
 */
function dressBed(ctx: Ctx, side: Side, bedId: string, u: number, robe: string | null): boolean {
  const b = onSide(ctx, side, bedId, u, 0, 'solid', 0)
  if (!b) return false
  const off = size(bedId).x / 2 + GAP + size('bedside_oak').x / 2
  for (const s of [-1, 1]) tryPlace(ctx, 'bedside_oak', againstSide(b.side, 'bedside_oak', b.u + s * off), b.rot)
  // rug under the lower two thirds of the bed (or a bit less), long side across it, nudged clear of door zones
  const L = size(bedId).z
  rug: for (const rug of bedId.startsWith('bed_queen') ? ['rug_rect_large', 'rug_rect_small'] : ['rug_rect_small'])
    for (const out of [L / 3, L / 4])
      for (const du of [0, -0.25, 0.25, -0.5, 0.5]) if (tryPlace(ctx, rug, againstSide(b.side, rug, b.u + du, out), b.rot, 'flat')) break rug
  frames(ctx, b.side, b.u)
  // closed oak wardrobes only (the kit's steel-framed drawer_cabinet read as garage shelving)
  const q = footprint(b.c, b.rot, size(bedId))
  return !robe || wardrobe(ctx, others(ctx, [side]), robe, q) || (robe === 'wardrobe_2door' && wardrobe(ctx, [side], robe, q))
}

function bed(ctx: Ctx): void {
  const beds = (ctx.room.areaSqm >= 9 ? ['bed_queen', 'bed_single'] : ['bed_single']).map((id) => id + ctx.bedStyle)
  const robes = ctx.room.areaSqm >= 11 ? ['wardrobe_tall', 'wardrobe_2door'] : ['wardrobe_2door']
  // the blankest wall that takes the bed (sliding along it) with a reachable wardrobe, the 3-door one first; else the next
  // wall; else the single bed; else the bed without a wardrobe
  const tries = (rs: (string | null)[]) => beds.flatMap((bedId) => rankNoOpenings(ctx).flatMap((side) => rs.map((robe) => ({ robe, bedId, side }))))
  const placed = [...tries(robes), ...tries([null])].some(({ robe, bedId, side }) => [...slots(side, size(bedId).x / 2)].some((u) => atomic(ctx, () => dressBed(ctx, side, bedId, u, robe))))
  if (!placed) return
  if (ctx.room.areaSqm >= 18) inCorner(ctx, 'modern_arm_chair_01')
  inCorner(ctx, 'potted_plant_02')
  // ponytail: no potted_plant_04 on a side table — placements carry no per-instance elevation (mountY is per asset).
}

/**
 * Sofa group: sofa on the first side that takes it (centred on `toward`'s projection), pillows on
 * it, a rug under its front legs and the coffee table, the table, frames above, an arm chair — on the
 * side away from `away` first (the room's other zone: a chair back between them hides it).
 */
function lounge(ctx: Ctx, sides: Side[], toward: Pt | null, tables = ['modern_coffee_table_01'], chairId = 'modern_arm_chair_01', away: Pt | null = null) {
  // a narrow room gets the 2-seater: the 3-seater's depth plus a coffee table and a walkway fill it
  const sofaId = bounds(ctx).short < NARROW ? 'sofa_2seat' : 'sofa_3seat'
  let sofa: ReturnType<typeof onSide> = null
  for (const s of sides) if ((sofa = onSide(ctx, s, sofaId, toward ? projU(s, toward) : s.len / 2))) break
  if (!sofa) return null
  const { side, c, rot } = sofa
  const sz = size(sofaId)
  for (const s of sofaId === 'sofa_3seat' ? [-0.55, 0.55] : [0.2]) tryPlace(ctx, 'cushions_plain', add(add(c, side.d, s), side.n, 0.12), rot + Math.sign(s) * 8, 'free')
  rug: for (const rug of ['rug_rect_large', 'rug_rect_small'])
    for (const du of [0, -0.25, 0.25, -0.5, 0.5])
      if (tryPlace(ctx, rug, add(add(c, side.d, du), side.n, sz.z / 2 - 0.25 + size(rug).z / 2), rot, 'flat')) break rug
  let table: string | undefined
  let tc = c
  for (const t of tables) {
    tc = add(c, side.n, sz.z / 2 + 0.45 + size(t).z / 2)
    if (tryPlace(ctx, t, tc, rot)) {
      table = t
      break
    }
  }
  frames(ctx, side, sofa.u)
  // arm chair beside the coffee table facing across it, slid ≤ 0.25 m toward or away from the sofa (the away side
  // first); else at the sofa's end turned 30° toward it (positive θ turns the front toward −d, see header)
  const chair = size(chairId)
  const order = away && dot(side.d, { x: away.x - tc.x, y: away.y - tc.y }) > 0 ? [-1, 1] : [1, -1]
  const beside = (s: number) =>
    !!table &&
    [0, -0.25, 0.25].some(
      (o) => !!tryPlace(ctx, chairId, add(add(tc, side.d, s * (size(table).x / 2 + 0.3 + chair.z / 2)), side.n, o), rotationFacing({ x: -side.d.x * s, y: -side.d.y * s })),
    )
  if (!order.some(beside)) {
    placeChair: for (const s of order) {
      for (const out of [0.15, 0.3, 0.45]) {
        const cc = add(add(c, side.d, s * (sz.x / 2 + 0.35 + chair.x / 2)), side.n, out)
        if (tryPlace(ctx, chairId, cc, rot + s * 30)) break placeChair
      }
    }
  }
  return sofa
}

function living(ctx: Ctx): void {
  if (twoZones(ctx)) return dining(ctx) // open-plan "living, dining & family": a TV across the whole length is useless
  // the TV wants the longest blank wall; the sofa faces it from the opposite side
  const tvWall = rankNoOpenings(ctx)[0]
  const opp = opposite(ctx, tvWall)
  const sofa = lounge(ctx, [...opp, ...others(ctx, [tvWall, ...opp])], add(tvWall.p0, tvWall.d, tvWall.len / 2))
  if (sofa) {
    const facing = opposite(ctx, sofa.side)
    const walls = [...facing, ...others(ctx, [sofa.side, ...facing])]
    let unit: ReturnType<typeof onSide> = null
    for (const w of walls) if (clearSpan(w) >= 2.7 && (unit = onSide(ctx, w, 'modern_wooden_cabinet', projU(w, sofa.c)))) break
    if (unit) tryPlace(ctx, 'tv_55', againstSide(unit.side, 'tv_55', unit.u, 0.1), unit.rot)
    else {
      for (const w of walls) if (onSide(ctx, w, 'tv_55_wall', projU(w, sofa.c), FLUSH)) break
      onSides(ctx, walls, 'wooden_display_shelves_01')
    }
  }
  inCorner(ctx, 'potted_plant_01')
  tryPlace(ctx, 'ceiling_fan', polygonCentroid(ctx.inner), 0, 'free')
}

/**
 * Where `seats` chairs (depth `chairD`) go round a dining table of size `t` centred at c, turned rot (long axis = local
 * x): one at each head from 4 seats on a table ≥ 1.4 m long, the rest spread evenly along the two long sides (back side
 * first), each touching its edge and facing the table. Presets and a resized table (studio/furniture.ts) both use it;
 * a table seats up to tableSeats(t.x).
 */
export function chairSpots(c: Pt, rot: number, t: { x: number; z: number }, seats: number, chairD = size('dining_chair').z): { c: Pt; rot: number }[] {
  const r = (rot * Math.PI) / 180
  const ex = { x: Math.cos(r), y: Math.sin(r) }
  const ey = { x: -Math.sin(r), y: Math.cos(r) }
  const heads = seats >= 4 && t.x >= 1.4 ? 2 : 0
  const out: { c: Pt; rot: number }[] = []
  for (const s of [-1, 1]) {
    const n = s < 0 ? Math.ceil((seats - heads) / 2) : Math.floor((seats - heads) / 2)
    for (let i = 0; i < n; i++) out.push({ c: add(add(c, ex, t.x * ((i + 0.5) / n - 0.5)), ey, s * (t.z / 2 + chairD / 2)), rot: rotationFacing({ x: -ey.x * s, y: -ey.y * s }) })
  }
  if (heads) for (const s of [-1, 1]) out.push({ c: add(c, ex, s * (t.x / 2 + chairD / 2)), rot: rotationFacing({ x: -ex.x * s, y: -ex.y * s }) })
  return out
}

/** Table (long axis = local x) with chairs touching its edges, all-or-nothing. */
function diningSet(ctx: Ctx, c: Pt, rot: number, seats: number): boolean {
  return atomic(ctx, () => !!tryPlace(ctx, 'dining_table', c, rot) && chairSpots(c, rot, size('dining_table'), seats).every((s) => !!tryPlace(ctx, 'dining_chair', s.c, s.rot)))
}

/** Centroid, main axis (the bounding box's long side: an irregular room's longest wall may run across it) and the inner polygon's extent along it. */
function mainAxis(ctx: Ctx) {
  const c0 = polygonCentroid(ctx.inner)
  const axis = bounds(ctx).axis
  const along = ctx.inner.map((p) => dot({ x: p.x - c0.x, y: p.y - c0.y }, axis))
  return { c0, axis, lo: Math.min(...along), hi: Math.max(...along) }
}

/** A long, big room is "dining + family living": table at the end nearest the kitchen, sofa group at the other. */
function twoZones(ctx: Ctx): boolean {
  const { lo, hi } = mainAxis(ctx)
  return hi - lo >= 6 && ctx.room.areaSqm >= 25
}

function dining(ctx: Ctx): void {
  const { c0, axis, lo, hi } = mainAxis(ctx)
  const split = twoZones(ctx)
  const mid = (lo + hi) / 2
  let ends = split ? [add(c0, axis, mid - (hi - lo) / 4), add(c0, axis, mid + (hi - lo) / 4)] : [c0]
  if (ctx.kitchen) ends = [...ends].sort((a, b) => dist(a, ctx.kitchen!) - dist(b, ctx.kitchen!))
  const cross = { x: -axis.y, y: axis.x }
  const rotAlong = rotationFacing(cross)
  // most seats first, then a rug under the whole set, then the smallest shift from the natural spot
  const offs = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75]
  let table: Pt | null = null
  let end: Pt | null = null
  search: for (const seats of ctx.room.areaSqm < DINING_4 ? [4, 2] : [6, 4, 2]) {
    for (const rug of ['rug_rect_large', 'rug_rect_small', null]) {
      for (const e of ends) {
        for (const a of offs) {
          for (const b of offs) {
            const c = add(add(e, axis, a), cross, b)
            for (const rot of [rotAlong, rotAlong + 90]) {
              if (atomic(ctx, () => diningSet(ctx, c, rot, seats) && (!rug || !!tryPlace(ctx, rug, c, rot, 'flat')))) {
                table = c
                end = e
                tryPlace(ctx, 'modern_ceiling_lamp_01', c, 0, 'free')
                break search
              }
            }
          }
        }
      }
    }
  }
  clockOver(ctx, table ?? c0)
  const family = split ? ends.find((e) => e !== end) : undefined
  if (family) {
    // a different table and chair from the living room's: the two zones are seen together through the passage
    const sofa = lounge(ctx, nearest(ctx, family), family, ['coffee_table_round_01', 'ottoman_01', 'modern_coffee_table_01'], 'mid_century_lounge_chair', table)
    // across from the sofa or not at all: slid further along a long room it faces the dining table instead
    if (sofa) for (const w of opposite(ctx, sofa.side)) if (onSide(ctx, w, 'tv_55_wall', projU(w, sofa.c), FLUSH, 'solid', 1)) break
  }
  onSides(ctx, rankNoOpenings(ctx), 'wooden_display_shelves_01')
}

/**
 * Wall clock high (kit.ts: centre 2.4 m) on the wall nearest `at`, over bare wall: no door or window within AC_CLEAR
 * of it, nothing taller than 1.8 m beneath it — and the wall below it stays reserved (0.6 m deep, from 1.8 m up) so
 * no later wardrobe or shelf slides under it.
 */
function clockOver(ctx: Ctx, at: Pt): void {
  const hw = size('wall_clock').x / 2
  for (const s of nearest(ctx, at)) {
    const spans = [...s.doors, ...s.wins.map((w): [number, number] => [w.u0, w.u1])]
    for (let k = 0, u0 = projU(s, at); k * 0.25 <= s.len; k++) {
      for (const u of k ? [u0 - k * 0.25, u0 + k * 0.25] : [u0]) {
        if (u - hw < AC_CLEAR || u + hw > s.len - AC_CLEAR || spans.some(([a, b]) => u - hw - AC_CLEAR < b && a < u + hw + AC_CLEAR)) continue
        const below = spanQuad(s, u - hw, u + hw, 0.6)
        if (ctx.quads.some((o) => o.y1 > 1.8 && quadsOverlap(o.q, below))) continue
        if (!tryPlace(ctx, 'wall_clock', againstSide(s, 'wall_clock', u, FLUSH), rotationFacing(s.n))) continue
        ctx.quads.push({ q: below, y0: 1.8, y1: 3 })
        return
      }
    }
  }
}

function study(ctx: Ctx): void {
  const ranked = [...ctx.sides].sort((a, b) => (b.wins.length > 0 ? 1 : 0) - (a.wins.length > 0 ? 1 : 0) || b.len - a.len)
  const desk = onSides(ctx, ranked, 'desk_oak')
  if (desk) {
    const cc = add(desk.c, desk.side.n, size('desk_oak').z / 2 + 0.05 + size('dining_chair').z / 2)
    tryPlace(ctx, 'dining_chair', cc, desk.rot + 180)
    onSides(ctx, others(ctx, [desk.side]), 'wooden_display_shelves_01')
  }
  inCorner(ctx, 'modern_arm_chair_01')
  inCorner(ctx, 'potted_plant_02')
  const c = polygonCentroid(ctx.inner)
  const offs = [0, -0.25, 0.25, -0.5, 0.5]
  rug: for (const dx of offs) for (const dy of offs) if (tryPlace(ctx, 'rug_round', { x: c.x + dx, y: c.y + dy }, 0, 'flat')) break rug
}

/** Kitchen: fridge in a corner, then one fitted run of 0.6 m modules (sink, hob, counters) with wall cabinets over. */
function kitchen(ctx: Ctx): void {
  inCorner(ctx, 'fridge')
  const w = size('kitchen_counter').x
  let best: { side: Side; us: number[] } | null = null
  for (const side of rankNoOpenings(ctx)) {
    // contiguous 0.6 m slots along the side, longest unbroken run wins
    const rot = rotationFacing(side.n)
    let run: number[] = []
    for (let u = w / 2 + 0.02; u + w / 2 <= side.len; ) {
      if (fits(ctx, 'kitchen_counter', againstSide(side, 'kitchen_counter', u, FLUSH), rot, 'solid')) {
        run.push(u)
        if (!best || run.length > best.us.length) best = { side, us: [...run] }
        u += w
      } else {
        run = []
        u += 0.05
      }
    }
  }
  if (!best) return
  const { side, us } = best
  const n = us.length
  const win = side.wins[0]
  const sink = win ? us.reduce((b, u, i) => (Math.abs(u - (win.u0 + win.u1) / 2) < Math.abs(us[b] - (win.u0 + win.u1) / 2) ? i : b), 0) : n >= 4 ? 1 : 0
  const hob = n < 2 ? 0 : sink < n / 2 ? Math.min(n - 1, Math.max(sink + 2, n - 2)) : Math.max(0, Math.min(sink - 2, 1))
  const rot = rotationFacing(side.n)
  // a long run ends in a tall larder at the end nearest the fridge; the first plain counter gets kettle, board, fruit
  const fridge = ctx.out.find((p) => p.assetId === 'fridge')
  const near = (i: number) => (fridge ? dist(add(side.p0, side.d, us[i]), fridge) : i)
  const larder = n >= 4 ? ([0, n - 1].filter((i) => i !== sink && i !== hob).sort((a, b) => near(a) - near(b))[0] ?? -1) : -1
  us.forEach((u, i) => {
    const at = (id: string, mode: Mode = 'solid') => tryPlace(ctx, id, againstSide(side, id, u, FLUSH), rot, mode)
    if (i === larder && at('kitchen_tall')) return
    const id = i === hob ? 'kitchen_hob' : i === sink && n > 1 ? 'kitchen_sink' : 'kitchen_counter'
    if (!(id === 'kitchen_counter' && !ctx.counts.has('kitchen_counter_styled') && at('kitchen_counter_styled'))) at(id)
    at(i === hob ? 'kitchen_hood' : 'kitchen_upper', 'stack')
  })
}

function bath(ctx: Ctx): void {
  // a fitted tray, flush to both walls, from 3.5 m² (an L-shaped 3.8 m² bath takes one); never in a powder room (a guest WC)
  if (ctx.room.areaSqm >= 3.5 && !/powder|\bpdr\b/i.test(ctx.room.name)) inCorner(ctx, 'shower_screen', [], GAP + FLUSH)
  // toilet on the blankest wall and the vanity on another; if that leaves no room for the vanity, the other way round
  const pair = (a: string, b: string) =>
    atomic(ctx, () => {
      const first = onSides(ctx, rankNoOpenings(ctx), a, FLUSH)
      return !!first && !!(onSides(ctx, others(ctx, [first.side]), b, FLUSH) ?? onSide(ctx, first.side, b, first.side.len / 2, FLUSH))
    })
  // a WC under 2.5 m² gets a pedestal basin: a vanity + mirror there leaves nowhere to stand in front of it
  if (ctx.room.areaSqm >= 2.5 && (pair('toilet', 'vanity') || pair('vanity', 'toilet'))) return
  const t = onSides(ctx, rankNoOpenings(ctx), 'toilet', FLUSH)
  onSides(ctx, t ? others(ctx, [t.side]) : rankLongest(ctx), 'basin') ?? onSides(ctx, rankLongest(ctx), 'basin')
}

/** A planter strip (Dhaka drawings' SUNSHADE/PLANTER): a balcony named planter, or one no door opens onto. Not somewhere to stand. */
export const isPlanter = (room: Room, unit: Unit): boolean =>
  room.kind === 'balcony' &&
  (/planter/i.test(room.name) || !room.wallIds.some((id) => unit.walls.find((w) => w.id === id)?.openings.some((o) => o.kind !== 'window')))

/**
 * One raised bed filling the strip (procedural planter_bed, shaped by its id): plants trail over every outer edge, a
 * wall lower than 1.5 m (parapet, rail) that no other room shares; a curb onto a veranda or the building's wall is not one.
 */
function planter(ctx: Ctx): void {
  const walls = new Map(ctx.unit.walls.map((w) => [w.id, w]))
  const edges = ctx.room.wallIds.map((id) => {
    const w = walls.get(id)
    return w && w.heightM < 1.5 && !ctx.rooms.some((r) => r !== ctx.room && r.wallIds.includes(id)) ? { h: w.heightM, t: w.thicknessM } : { h: 0, t: 0 }
  })
  // a planter ZONE is drawn with its own soil floor (at its levelM) and copings: the bed is only its planting
  const { id, c } = planterId(ctx.inner, edges, ctx.room.kind === 'planter')
  ctx.out.push({ id: `${ctx.room.id}:planter_bed:1`, assetId: id, roomId: ctx.room.id, x: c.x, y: c.y, rotationDeg: 0 })
}

function balcony(ctx: Ctx): void {
  if (isPlanter(ctx.room, ctx.unit)) return planter(ctx)
  const plant = inCorner(ctx, 'potted_plant_02')
  // a ledge under 1.2 m deep is no place to sit
  if (ctx.room.areaSqm >= 3 && bounds(ctx).short >= 1.2) {
    inCorner(ctx, 'mid_century_lounge_chair', plant ? [plant.corner] : []) ??
      tryPlace(ctx, 'ottoman_01', polygonCentroid(ctx.inner), 0)
  }
  planterSet(ctx)
}

/** Its open edges: sides whose walls are all lower than 1.5 m (a railing, a parapet) and border no other room or zone. */
const outerSides = (ctx: Ctx): Side[] => {
  const walls = new Map(ctx.unit.walls.map((w) => [w.id, w]))
  return rankLongest(ctx).filter((s) => s.wallIds.every((id) => (walls.get(id)?.heightM ?? 3) < 1.5 && !ctx.rooms.some((r) => r !== ctx.room && r.wallIds.includes(id))))
}

/**
 * A balcony's default planter set (founder 2026-10-04: planters inside the flat too; staff choose, no price): the longest
 * planter box that fits along its railing, after the pot and the chair, so it never crowds them; none on a ledge under
 * 1.4 m deep (the box would leave no way along it).
 */
function planterSet(ctx: Ctx): void {
  if (bounds(ctx).short < 1.4) return
  for (const s of outerSides(ctx)) for (const id of ['planter_box_240', 'planter_box_150', 'planter_box_90']) if (onSide(ctx, s, id)) return
}

// ───────────────────────────── outdoor zones (session 19): by kind and geometry only ─────────────────────────────

/** Plan points on a `step` grid inside the inner polygon, `order`ed (ties by y, then x): spots for free-standing pieces. */
function gridSpots(ctx: Ctx, step: number, order: (p: Pt) => number): Pt[] {
  const xs = ctx.inner.map((p) => p.x)
  const ys = ctx.inner.map((p) => p.y)
  const out: Pt[] = []
  for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) if (pointInPolygon({ x, y }, ctx.inner)) out.push({ x, y })
  return out.map((p) => ({ p, k: order(p) })).sort((a, b) => a.k - b.k || a.p.y - b.p.y || a.p.x - b.p.x).map((e) => e.p)
}
const square = (c: Pt, s: number): Pt[] => footprint(c, 0, { x: s, z: s })
const toCentre = (ctx: Ctx) => {
  const c = polygonCentroid(ctx.inner)
  return (p: Pt) => dist(p, c)
}
/** Walls as tall as `h` or taller along a side: something to put a back to. */
const high = (ctx: Ctx, h: number) => {
  const walls = new Map(ctx.unit.walls.map((w) => [w.id, w]))
  return (s: Side) => s.wallIds.every((id) => (walls.get(id)?.heightM ?? 0) >= h)
}

/** Trees, biggest first, then smaller or scaled down where a crown does not fit (a crown stays inside the face); mast trees line strips too narrow for a spreading one. */
const TREE_SIZES: [string, number][] = [['tree_large', 1], ['tree_large', 0.85], ['tree_medium', 1], ['tree_medium', 0.85], ['tree_small', 1], ['tree_mast', 1], ['tree_mast', 0.85], ['tree_mast', 0.7]]
/** Mast trees stand at least this far apart (planted as a row, not a hedge). */
const MAST_SPACING = 2.6
/** ...and 4 m apart in a row along a boundary wall. */
const MAST_ROW = 4
/** A tree's trunk stands at least this far off a window or a glass wall: closer, its crown lay against the lobby's glass. */
const GLASS_CLEAR = 1.5
const offGlass = (ctx: Ctx, c: Pt) => ctx.wins.every((w) => !pointInPolygon(c, w.q) && wallClearance(c, w.q) >= GLASS_CLEAR)
/** A crown r round at c is over this face only: its circle inside, no corner of the face under it (a C-shaped lawn's arms hold a square's corners while it spans what lies between). */
const crownFits = (ctx: Ctx, c: Pt, r: number) =>
  Array.from({ length: 16 }, (_, i) => ({ x: c.x + r * Math.cos((i * Math.PI) / 8), y: c.y + r * Math.sin((i * Math.PI) / 8) })).every((p) => pointInPolygon(p, ctx.inner)) && !ctx.inner.some((v) => dist(v, c) < r)

/**
 * Trees on a lawn (or a wide planter): biggest first, each where its whole crown stays inside the face, spots nearest the
 * edges first (they line the edges and fill the corners), trunks TRUNK_CLEAR square clear of door zones and of pieces,
 * crowns at most ~15 % into each other, until crowns cover `cover` of the face. Turned by quarters in order. Deterministic.
 */
function trees(ctx: Ctx, cover: number, sizes = TREE_SIZES): void {
  const edge = (p: Pt) => wallClearance(p, ctx.inner)
  const spots = gridSpots(ctx, 0.5, edge)
  const placed: { c: Pt; r: number }[] = []
  let area = 0
  for (const [id, k] of sizes) {
    const r = (size(id).x * k) / 2
    for (const c of spots) {
      if (area + Math.PI * r * r > cover * ctx.room.areaSqm) break // a smaller one may still fit the budget
      if (placed.some((t) => dist(t.c, c) < Math.max(0.85 * (t.r + r), id === 'tree_mast' ? MAST_SPACING : 0)) || !offGlass(ctx, c)) continue
      const trunk = square(c, TRUNK_CLEAR)
      if (ctx.clear.some((q) => quadsOverlap(q, trunk)) || ctx.quads.some((o) => quadsOverlap(o.q, trunk))) continue
      if (!crownFits(ctx, c, r) || !tryPlace(ctx, id, c, 90 * (placed.length % 4), 'free', k === 1 ? undefined : k)) continue
      placed.push({ c, r })
      area += Math.PI * r * r
      ctx.quads.push({ q: trunk, y0: 0, y1: 3 })
    }
  }
}

/** Shrubs along the walls at least `h` tall (boundary, building, screens): one every ~1.8 m, at most `max`. How many. */
function shrubs(ctx: Ctx, h: number, max: number): number {
  let n = 0
  for (const s of rankLongest(ctx).filter(high(ctx, h)))
    for (let u = 0.6; u <= s.len - 0.6 && n < max; u += 1.8) if (tryPlace(ctx, 'shrub_round', againstSide(s, 'shrub_round', u), rotationFacing(s.n))) n++
  return n
}

/** A bench with its back to the longest wall at least 0.9 m tall, facing in. */
const benchOnWall = (ctx: Ctx, id = 'modular_street_seating') => onSides(ctx, rankNoOpenings(ctx).filter(high(ctx, 0.9)), id)

/**
 * `place` (one piece or a group) at the free spot nearest the middle whose extent `ext` at rotation `rot` plus `margin`
 * all round lies inside the face, clear of door zones and of pieces; the margin is then reserved (floor pieces keep out).
 */
function spaced(ctx: Ctx, ext: { x: number; z: number }, rot: number, margin: number, place: (c: Pt) => boolean, order = toCentre(ctx)): boolean {
  for (const c of gridSpots(ctx, 0.25, order)) {
    const safe = footprint(c, rot, { x: ext.x + 2 * margin, z: ext.z + 2 * margin })
    if (!safe.every((q) => pointInPolygon(q, ctx.inner)) || ctx.quads.some((o) => o.y0 < 0.5 && quadsOverlap(o.q, safe)) || ctx.clear.some((q) => quadsOverlap(q, safe))) continue
    if (!atomic(ctx, () => place(c))) continue
    ctx.quads.push({ q: safe, y0: 0, y1: 0.5 })
    return true
  }
  return false
}

/**
 * A row of mast trees along the plot's boundary: sides whose walls are all 1.5–2.6 m tall (a boundary wall or a screen,
 * not the building) with no opening, one every 3 m where its crown (full size, else 0.85 / 0.7) stays inside the face and
 * clear of the crowns already there — Dhaka's Debdaru rows. Outside the crown-cover budget of `trees`.
 */
function mastRow(ctx: Ctx): void {
  const walls = new Map(ctx.unit.walls.map((w) => [w.id, w]))
  const boundary = (s: Side) => !s.doors.length && s.wallIds.every((id) => (walls.get(id)?.heightM ?? 0) >= 1.5 && (walls.get(id)?.heightM ?? 9) < 2.6)
  const crown = size('tree_mast').x
  const trunks = () => ctx.out.filter((p) => kitAsset(p.assetId)?.category === 'rug' && objectKind(kitAsset(p.assetId)!) === 'plant' && !p.assetId.startsWith('planter_bed@')).map((p) => ({ c: { x: p.x, y: p.y }, r: (size(p.assetId).x * (p.scale ?? 1)) / 2 }))
  for (const s of rankLongest(ctx).filter(boundary))
    for (let u = 1.2; u <= s.len - 1.2; u += 0.5)
      for (const k of [1, 0.85, 0.7]) {
        const c = add(add(s.p0, s.d, u), s.n, s.thick / 2 + GAP + (crown * k) / 2)
        if (trunks().some((t) => dist(t.c, c) < Math.max(0.85 * (t.r + (crown * k) / 2), MAST_ROW)) || !offGlass(ctx, c)) continue
        const trunk = square(c, TRUNK_CLEAR)
        if (ctx.clear.some((q) => quadsOverlap(q, trunk)) || ctx.quads.some((o) => quadsOverlap(o.q, trunk))) continue
        if (!crownFits(ctx, c, (crown * k) / 2) || !tryPlace(ctx, 'tree_mast', c, 90 * (u % 4 | 0), 'free', k === 1 ? undefined : k)) continue
        ctx.quads.push({ q: trunk, y0: 0, y1: 3 })
        break
      }
}

/** Lawn: trees by size and space, a mast row along its boundary walls, shrubs along its walls; a small or narrow lawn gets shrubs only; a big one a bench too. */
function lawn(ctx: Ctx): void {
  const big = ctx.room.areaSqm >= 12 && bounds(ctx).short >= 2.5
  if (big) trees(ctx, 0.5)
  if (ctx.room.areaSqm >= 12) mastRow(ctx)
  if (ctx.room.areaSqm >= 60) benchOnWall(ctx)
  // a strip with no wall to line still gets one
  if (!shrubs(ctx, 0.9, big ? 10 : 4)) for (const s of rankLongest(ctx)) if (onSide(ctx, s, 'shrub_round')) break
}

/** Planter zone: one planted bed filling it (as a balcony's planter strip), shrubs down its middle if it is 0.9 m wide, a small tree if 2 m. */
function planterZone(ctx: Ctx): void {
  planter(ctx)
  const b = bounds(ctx)
  if (b.short >= 2) trees(ctx, 0.6, TREE_SIZES.filter(([id]) => id === 'tree_small').concat([['tree_small', 0.65]]))
  if (b.short < 0.9) return
  const { c0, axis, lo, hi } = mainAxis(ctx)
  for (let t = lo + 0.6; t <= hi - 0.6; t += 1.4) tryPlace(ctx, 'shrub_round', add(c0, axis, t), 0)
}

/**
 * Deck: loungers facing the swimming pool it borders (a pool face of 25 m² or more, at least 1.8 times as long as it is
 * wide: a lap pool, not a fountain or a water body); else a pergola over a bistro set, more sets, a bench; pots in two corners.
 */
function deck(ctx: Ctx): void {
  const swim = (r: Room) => {
    const b = bounds(makeCtx(r, ctx.unit, ctx.rooms, null, ''))
    return r.kind === 'pool' && r.areaSqm >= 25 && b.long >= 1.8 * b.short
  }
  const pool = ctx.rooms.find((r) => r.wallIds.some((id) => ctx.room.wallIds.includes(id)) && swim(r))
  const edge = pool && rankLongest(ctx).find((s) => s.wallIds.some((id) => pool.wallIds.includes(id)))
  if (edge) {
    // feet to the water: a row along the pool's edge (0.3 m back from it, or tight on a narrow deck), turned to face it
    const face = rotationFacing({ x: -edge.n.x, y: -edge.n.y })
    for (let u = 0.5; u + 0.45 <= edge.len && (ctx.counts.get('lounger') ?? 0) < 8; u += 0.25) if ([0.3, 0.05].some((out) => tryPlace(ctx, 'lounger', againstSide(edge, 'lounger', u, out), face))) u += 0.7
  } else {
    if (ctx.room.areaSqm >= 20) pergolaSet(ctx)
    const set = size('outdoor_table_chair_set_01')
    const rot = rotationFacing(rankLongest(ctx)[0].n)
    for (let n = Math.min(3, Math.floor(ctx.room.areaSqm / 12)); n > 0; n--) if (!spaced(ctx, set, rot, 0.4, (c) => !!tryPlace(ctx, 'outdoor_table_chair_set_01', c, rot))) break
    // a big deck: two loungers side by side, heads to its blankest high wall
    if (ctx.room.areaSqm >= 40)
      for (const s of rankNoOpenings(ctx).filter(high(ctx, 0.9)))
        if ([...slots(s, 0.85)].some((u) => atomic(ctx, () => [0, 0.85].every((du) => !!tryPlace(ctx, 'lounger', againstSide(s, 'lounger', u - 0.425 + du), rotationFacing(s.n)))))) break
    if (ctx.room.areaSqm >= 8) benchOnWall(ctx, 'bench_timber')
  }
  // planter boxes along its parapets (its open edges), one every ~3.2 m, at most 6
  let boxes = 0
  for (const s of outerSides(ctx)) for (let u = 1.3; u <= s.len - 1.3 && boxes < 6; u += 0.4) if (tryPlace(ctx, 'planter_box_240', againstSide(s, 'planter_box_240', u), rotationFacing(s.n)) && ++boxes) u += 2.8
  const pot = inCorner(ctx, 'pot_money_tree')
  inCorner(ctx, 'pot_anthurium', pot ? [pot.corner] : [])
}

/** A pergola (category rug: pieces may stand under it, its four posts kept clear) at the spot nearest the middle where it fits, a bistro set under it. */
function pergolaSet(ctx: Ctx): boolean {
  const s = size('pergola')
  const p = s.x / 2 - 0.15 - PERGOLA_POST / 2
  for (const c of gridSpots(ctx, 0.25, toCentre(ctx))) {
    const posts = [-1, 1].flatMap((i) => [-1, 1].map((j) => square({ x: c.x + i * p, y: c.y + j * p }, PERGOLA_POST + 0.1)))
    if (posts.some((q) => ctx.quads.some((o) => quadsOverlap(o.q, q)))) continue
    if (!tryPlace(ctx, 'pergola', c, 0, 'flat')) continue
    for (const q of posts) ctx.quads.push({ q, y0: 0, y1: 2.6 })
    tryPlace(ctx, 'outdoor_table_chair_set_01', c, 90)
    return true
  }
  return false
}

/** Play area: swing set, slide, seesaw (each where it and a safety margin round it fit), benches for the parents along its walls. */
function play(ctx: Ctx): void {
  // round the edges, the middle left open to run in; each along the area's length if it fits so (swings swing and the
  // seesaw rocks along it, the slide runs down it), else across; in its own safety zone: the swings' arc 1.2 m before
  // and behind, 0.3 m at the frame's ends; 0.5–0.6 m round the others
  const along = rotationFacing(bounds(ctx).axis)
  const edge = (p: Pt) => wallClearance(p, ctx.inner)
  for (const [id, mx, mz] of [['swing_frame', 0.3, 1.2], ['slide', 0.6, 0.5], ['seesaw', 0.5, 0.3]] as const) {
    const s = size(id)
    ;[along, along + 90].some((turn) => spaced(ctx, { x: s.x + 2 * mx, z: s.z + 2 * mz }, turn, 0, (c) => !!tryPlace(ctx, id, c, turn), edge))
  }
  for (const s of rankNoOpenings(ctx).filter(high(ctx, 0.9)).slice(0, 2)) onSide(ctx, s, 'bench_timber')
}

/** Paving: empty, but a big one (25 m², not a ramp) gets a bench against its longest wall. */
function paving(ctx: Ctx): void {
  if (ctx.room.areaSqm >= 25) benchOnWall(ctx)
}

// ───────────────────────────── common rooms (session 19) ─────────────────────────────

/**
 * Lobby by size: under 20 m² or narrower than 3 m (a lift lobby, a passage) a tall plant or two and nothing else; from
 * 20 m² a seating group too; from 30 m² and 4 m across a reception desk first, backed by a 1 m receptionist's zone to its
 * wall, the chair in it — on the blankest wall farthest from the doors.
 */
function lobby(ctx: Ctx): void {
  const b = bounds(ctx)
  if (ctx.room.areaSqm >= 30 && b.short >= 4) {
    const walls = rankNoOpenings(ctx).sort((a, c) => sideDoorDist(ctx, c) - sideDoorDist(ctx, a))
    for (const s of walls) {
      const ok = atomic(ctx, () => {
        const d = onSide(ctx, s, 'reception_desk', s.len / 2, 1.0)
        if (!d) return false
        const behind = add(d.c, s.n, -(size('reception_desk').z / 2 + 0.45))
        ctx.quads.push({ q: footprint(add(d.c, s.n, -(size('reception_desk').z / 2 + 0.5)), d.rot, { x: size('reception_desk').x, z: 1.0 }), y0: 0, y1: 1 })
        tryPlace(ctx, 'dining_chair', behind, d.rot, 'free')
        return true
      })
      if (ok) break
    }
  }
  if (ctx.room.areaSqm >= 20 && b.short >= 3) lounge(ctx, rankNoOpenings(ctx), null)
  const tall = inCorner(ctx, 'pot_money_tree_tall') ?? inCorner(ctx, 'potted_plant_01')
  if (ctx.room.areaSqm >= 12) inCorner(ctx, 'pot_calathea', tall ? [tall.corner] : [])
}

/**
 * Gym: a mirror on the blankest wall with the dumbbell rack before it, treadmills backed onto other walls (one per 8 m²,
 * at most 3), a squat rack from 20 m², an exercise mat on the floor that is left.
 */
function gym(ctx: Ctx): void {
  const blank = rankNoOpenings(ctx)
  const m = onSides(ctx, blank, 'mirror_panel', FLUSH)
  if (m) onSide(ctx, m.side, 'dumbbell_rack', m.u)
  const rest = m ? others(ctx, [m.side]) : rankLongest(ctx)
  const want = Math.min(3, Math.max(1, Math.floor(ctx.room.areaSqm / 8)))
  for (const s of rest) for (let u = 0.6; u <= s.len - 0.4 && (ctx.counts.get('treadmill') ?? 0) < want; u += 0.25) if (tryPlace(ctx, 'treadmill', againstSide(s, 'treadmill', u), rotationFacing(s.n))) u += 0.85
  if (ctx.room.areaSqm >= 20) onSides(ctx, rest, 'gym_rack', 0.1)
  const turn = rotationFacing(bounds(ctx).axis) + 90
  spaced(ctx, size('gym_mat'), turn, 0.3, (c) => !!tryPlace(ctx, 'gym_mat', c, turn))
}

/** Community room: a sofa corner from 25 m², then dining sets (six seats, else four) through the room, one per 12 m², 0.6 m apart round their chairs; a plant. */
function community(ctx: Ctx): void {
  if (ctx.room.areaSqm >= 25) lounge(ctx, rankNoOpenings(ctx), null)
  const { axis } = mainAxis(ctx)
  const rot = rotationFacing({ x: -axis.y, y: axis.x })
  const t = size('dining_table')
  const chair = size('dining_chair').z
  for (let n = Math.max(1, Math.floor(ctx.room.areaSqm / 12)); n > 0; n--)
    if (![6, 4].some((seats) => spaced(ctx, { x: t.x + 2 * chair, z: t.z + 2 * chair }, rot, 0.3, (c) => diningSet(ctx, c, rot, seats)))) break
  inCorner(ctx, 'potted_plant_01')
}

/** Guard room / drivers' waiting / staff room: a desk on the window wall (the guard looks out) with its chair, benches on the other walls, one per 6 m² (at most 3). */
function guard(ctx: Ctx): void {
  const ranked = [...ctx.sides].sort((a, b) => (b.wins.length > 0 ? 1 : 0) - (a.wins.length > 0 ? 1 : 0) || b.len - a.len)
  const desk = onSides(ctx, ranked, 'desk_oak')
  if (desk) tryPlace(ctx, 'dining_chair', add(desk.c, desk.side.n, size('desk_oak').z / 2 + 0.05 + size('dining_chair').z / 2), desk.rot + 180)
  const want = Math.min(3, Math.floor(ctx.room.areaSqm / 6))
  for (const s of others(ctx, desk ? [desk.side] : [])) if ((ctx.counts.get('bench_timber') ?? 0) < want) onSide(ctx, s, 'bench_timber')
}

/**
 * Walk-in closet: an open rail + shelf unit (1.8 m, else 1.2 m) on each of its two blank walls farthest from its doors — a
 * dead end's far wall first, the one its doorway looks at (seen whole, not as a close-up of a side unit).
 */
function closet(ctx: Ctx): void {
  const open = (s: Side) => (s.doors.length + s.wins.length > 0 ? 1 : 0)
  const walls = [...ctx.sides].sort((a, b) => open(a) - open(b) || sideDoorDist(ctx, b) - sideDoorDist(ctx, a))
  if (ctx.room.areaSqm >= 3) for (const s of walls.slice(0, 2)) onSide(ctx, s, 'closet_rail') ?? onSide(ctx, s, 'closet_rail_s')
}

/** Help / servant room: a cot (else the short one) along the blankest wall, a hook rail on another wall (else over the cot), nothing else. */
function helpRoom(ctx: Ctx): void {
  const cot = onSides(ctx, rankNoOpenings(ctx), 'cot') ?? onSides(ctx, rankNoOpenings(ctx), 'cot_s')
  onSides(ctx, cot ? others(ctx, [cot.side]) : rankLongest(ctx), 'hook_rail', FLUSH) ?? (cot && onSide(ctx, cot.side, 'hook_rail', cot.u, FLUSH))
}

/**
 * Stair room (common core): the widest dog-leg stair (STAIR_W) whose half landing backs onto a wall — the one farthest
 * from the door first — with its flights clear of every door zone and a 1 m floor landing in front of it inside the
 * room. It may stand in front of a window (stairwell windows light the landing), so it is placed 'free' after these checks.
 */
function stairwell(ctx: Ctx): void {
  const sides = [...ctx.sides].sort((a, b) => sideDoorDist(ctx, b) - sideDoorDist(ctx, a))
  for (const w of STAIR_W)
    for (const s of sides)
      for (const du of [0, -0.25, 0.25, -0.5, 0.5]) {
        const id = stairId(w)
        const c = againstSide(s, id, s.len / 2 + du, FLUSH)
        const rot = rotationFacing(s.n)
        const q = footprint(c, rot, size(id))
        if (ctx.clear.some((z) => quadsOverlap(z, q)) || !footprint(add(c, s.n, 1), rot, size(id)).every((p) => pointInPolygon(p, ctx.inner))) continue
        if (tryPlace(ctx, id, c, rot, 'free')) return
      }
}

/** Common-core rooms (stair, lift, lift lobby) are not part of the buyer's flat: the viewer leaves them out of the Rooms list; they stay in 3D. */
export const isCommonCore = (room: Pick<Room, 'name'>): boolean => /\b(stair|lift|elevator|lobby)/i.test(room.name)
const isStair = (room: Room) => /\bstair/i.test(room.name)
/** A servant's room: a bedroom under 4 m², or a bed/utility/other room named help, servant or maid. */
export const isHelpRoom = (room: Room): boolean =>
  (room.kind === 'bed' && room.areaSqm < 4) || (['bed', 'utility', 'other'].includes(room.kind) && /\b(help|servant|maid)/i.test(room.name))

// ───────────────────────────── ceiling light, AC (every room kind) ─────────────────────────────

/** Rooms that get a ceiling light: the preset's fan or pendant, else a flush fixture (ceilingLight). render.ts lights them. */
export const LIT_KINDS: RoomKind[] = ['living', 'dining', 'bed', 'kitchen', 'study', 'bath', 'lobby', 'gym', 'community', 'guard']
/** Rooms that get a wall-mounted split AC. */
export const AC_KINDS: RoomKind[] = ['bed', 'living', 'dining', 'study', 'gym', 'community', 'guard']
/** An AC keeps this clear of the doors/windows on its wall (casings; curtains reach 0.24 m past the reveal) and of the room's corners. */
const AC_CLEAR = 0.5

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-9
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2))
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}
const wallClearance = (p: Pt, poly: Pt[]) => Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])))

/**
 * Flush ceiling light in a room with no fan or pendant, sized by the room: at the centroid, unless that is outside or
 * tucked into a corner of a concave room (under 3/4 of the best clearance), then at the 0.25 m grid point farthest from
 * every wall.
 */
function ceilingLight(ctx: Ctx): void {
  if (ctx.out.some((p) => isCeilingLight(p.assetId))) return
  const xs = ctx.inner.map((p) => p.x)
  const ys = ctx.inner.map((p) => p.y)
  let best = { p: polygonCentroid(ctx.inner), d: 0 }
  for (let x = Math.min(...xs) + 0.125; x < Math.max(...xs); x += 0.25)
    for (let y = Math.min(...ys) + 0.125; y < Math.max(...ys); y += 0.25) {
      const d = pointInPolygon({ x, y }, ctx.inner) ? wallClearance({ x, y }, ctx.inner) : 0
      if (d > best.d) best = { p: { x, y }, d }
    }
  const c = polygonCentroid(ctx.inner)
  const at = pointInPolygon(c, ctx.inner) && wallClearance(c, ctx.inner) >= 0.75 * best.d ? c : best.p
  tryPlace(ctx, ctx.room.areaSqm > 12 ? 'ceiling_light_large' : 'ceiling_light', at, 0, 'free')
}

/**
 * Split AC 2.3 m up (its mountY), centred on the longest clear stretch of wall: every side is cut at its doors and
 * windows, and the AC must keep AC_CLEAR from those cuts and from the room's corners. A stretch behind a bed's
 * headboard comes last (cold air on the sleeper); one over anything taller than 1.8 m (wardrobe, shelves, larder) is
 * out. No stretch qualifies: no AC.
 */
function wallAC(ctx: Ctx): void {
  const id = 'ac_split'
  const hw = size(id).x / 2
  const bed = ctx.out.find((p) => p.assetId.startsWith('bed_'))
  const t = ((bed?.rotationDeg ?? 0) * Math.PI) / 180
  const behindBed = (s: Side) => !!bed && dot(s.n, { x: -Math.sin(t), y: Math.cos(t) }) > 0.9
  const stretches = ctx.sides.flatMap((s) => {
    const cuts = [...s.doors, ...s.wins.map((w): [number, number] => [w.u0, w.u1]), [s.len, s.len]].sort((a, b) => a[0] - b[0])
    const out: { s: Side; u: number; len: number }[] = []
    let u0 = 0
    for (const [a, b] of cuts) {
      if (a - u0 > 0) out.push({ s, u: (u0 + a) / 2, len: a - u0 })
      u0 = Math.max(u0, b)
    }
    return out
  })
  stretches.sort((a, b) => Number(behindBed(a.s)) - Number(behindBed(b.s)) || b.len - a.len)
  for (const { s, u, len } of stretches) {
    const c = againstSide(s, id, u, FLUSH)
    const rot = rotationFacing(s.n)
    const q = footprint(c, rot, size(id))
    // openings: by the stretch's length; corners: AC_CLEAR past each end must still be in the room
    if (len < 2 * (hw + AC_CLEAR) || ![-1, 1].every((k) => pointInPolygon(add(c, s.d, k * (hw + AC_CLEAR)), ctx.inner))) continue
    if (ctx.quads.some((o) => o.y1 > 1.8 && quadsOverlap(o.q, q))) continue
    if (tryPlace(ctx, id, c, rot, 'free')) return
  }
}

/** By kind (and the room's geometry) only — never a unit, project or room name (the benchmark rule, session 19). No preset: pool, driveway, parking (nothing stands there). */
const BY_KIND: Partial<Record<Room['kind'], (ctx: Ctx) => void>> = {
  bed,
  living,
  dining,
  study,
  kitchen,
  bath,
  balcony,
  closet,
  lobby,
  gym,
  community,
  guard,
  lawn,
  planter: planterZone,
  deck,
  play,
  paving,
}

/** Deterministic preset placements for every room (rooms in the given order). */
export function furnish(unit: Unit, rooms: Room[]): FurniturePlacement[] {
  const out: FurniturePlacement[] = []
  const beds = rooms.filter((r) => r.kind === 'bed').sort((a, b) => b.areaSqm - a.areaSqm)
  const k = rooms.find((r) => r.kind === 'kitchen')
  const kitchenAt = k && k.loop.length >= 3 ? polygonCentroid(roomInnerPolygon(k, unit)) : null
  for (const room of rooms) {
    const help = isHelpRoom(room)
    const fn = isStair(room) && !isOutdoor(room.kind) ? stairwell : help ? helpRoom : BY_KIND[room.kind]
    if (!fn || room.loop.length < 3 || room.slope) continue // nothing stands on a ramp
    const ctx = makeCtx(room, unit, rooms, kitchenAt, BED_STYLES[Math.max(0, beds.indexOf(room)) % BED_STYLES.length])
    fn(ctx)
    // after the room's own pieces, so their ids stay put; 'free' placements, so they move nothing
    if (LIT_KINDS.includes(room.kind)) ceilingLight(ctx)
    if (AC_KINDS.includes(room.kind) && !help) wallAC(ctx)
    out.push(...ctx.out)
  }
  return out
}
