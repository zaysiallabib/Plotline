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
import { pointInPolygon, polygonCentroid, roomInnerPolygon, roomPolygon, type Pt } from '../core'
import { heightRange, isCeilingLight, kitAsset } from './kit'
import { ART_SETS, ART_W, BED_STYLES, STAIR_W, stairId } from './procedural.meta'

export const GAP = 0.05
/** `out` for wall-hung / fitted pieces: back 5 mm off the wall instead of GAP. */
const FLUSH = -GAP + 0.005
const DOOR_CLEAR = 1.0
/** Clear depth in front of a door whose leaf does not sweep the room (it swings away, or slides): room to step in. */
const STEP_IN = 0.6
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
  /** [u0, u1] along the side from p0, clear depth into the room */
  doors: [number, number, number][]
  wins: { u0: number; u1: number; sill: number; top: number }[]
}

interface Ctx {
  room: Room
  inner: Pt[]
  sides: Side[]
  corners: Pt[] // inner polygon vertices, convex first, sorted far-from-doors
  doorPts: Pt[]
  clear: Pt[][]
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
  const raw: Side[] = poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    const len = dist(p, q) || 1
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const w = walls.get(room.wallIds[i])
    const forward = w?.a === room.loop[i]
    const doors: Side['doors'] = []
    const wins: Side['wins'] = []
    for (const o of w?.openings ?? []) {
      const u0 = forward ? o.offsetM : len - o.offsetM - o.widthM
      if (o.kind === 'window') wins.push({ u0, u1: u0 + o.widthM, sill: o.sillM, top: o.sillM + o.heightM })
      else {
        // leaf side as openings.ts builds it: 'out' = +normal, which is this room's side when the wall runs with the loop
        const slides = !o.hinge && o.widthM >= 1.2
        const sweeps = o.kind === 'passage' || (!slides && (o.swing !== 'in') === forward)
        doors.push([u0, u0 + o.widthM, sweeps ? DOOR_CLEAR : STEP_IN])
      }
    }
    return { p0: p, d, n: { x: -d.y, y: d.x }, len, thick: w?.thicknessM ?? 0.127, doors, wins }
  })
  const collinear = (a: Side, b: Side) => a.d.x * b.d.x + a.d.y * b.d.y > 0.9999
  const merge = (a: Side, b: Side) => {
    for (const [u0, u1, depth] of b.doors) a.doors.push([u0 + a.len, u1 + a.len, depth])
    for (const w of b.wins) a.wins.push({ ...w, u0: w.u0 + a.len, u1: w.u1 + a.len })
    a.len += b.len
    a.thick = Math.max(a.thick, b.thick)
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

/** Door/passage clear zones of a room (opening width × clear depth into the room). */
export function doorClearZones(room: Room, unit: Unit): Pt[][] {
  return buildSides(room, unit).flatMap((s) => s.doors.map(([u0, u1, depth]) => spanQuad(s, u0, u1, depth)))
}

function makeCtx(room: Room, unit: Unit, kitchen: Pt | null, bedStyle: string): Ctx {
  const sides = buildSides(room, unit)
  const inner = roomInnerPolygon(room, unit)
  const doorPts: Pt[] = []
  const clear: Pt[][] = []
  const wins: Ctx['wins'] = []
  for (const s of sides) {
    for (const [u0, u1, depth] of s.doors) {
      clear.push(spanQuad(s, u0, u1, depth))
      doorPts.push(add(add(s.p0, s.d, (u0 + u1) / 2), s.n, s.thick / 2))
    }
    // 5 cm trim at each end: a cabinet may butt up to a window that starts in the corner
    for (const w of s.wins) wins.push({ q: spanQuad(s, w.u0 + 0.05, w.u1 - 0.05, WIN_DEPTH), sill: w.sill, top: w.top })
  }
  const farFromDoors = (p: Pt) => (doorPts.length ? Math.min(...doorPts.map((q) => dist(p, q))) : 0)
  const corners = [...inner].sort((a, b) => farFromDoors(b) - farFromDoors(a))
  return { room, inner, sides, corners, doorPts, clear, wins, quads: [], rugs: [], out: [], counts: new Map(), kitchen, bedStyle }
}

/** The footprint if `assetId` may stand at c (see header for modes), else null. */
function fits(ctx: Ctx, assetId: string, c: Pt, rotationDeg: number, mode: Mode): Pt[] | null {
  const quad = footprint(c, rotationDeg, size(assetId))
  if (!quad.every((p) => pointInPolygon(p, ctx.inner))) return null
  if (mode === 'free') return quad
  if (ctx.clear.some((q) => quadsOverlap(q, quad))) return null
  if (mode === 'flat') return ctx.rugs.some((q) => quadsOverlap(q, quad)) ? null : quad
  const a = kitAsset(assetId)
  const [y0, y1] = a ? heightRange(a) : [0, 1]
  const coversWindow = (w: Ctx['wins'][number]) => y1 > w.sill + SILL_SLACK && y0 < w.top && quadsOverlap(w.q, quad)
  if (!SEE_THROUGH.has(assetId) && a?.category !== 'plant' && ctx.wins.some(coversWindow)) return null
  if (mode === 'solid' && ctx.quads.some((o) => o.y1 > y0 + 0.02 && o.y0 < y1 - 0.02 && quadsOverlap(o.q, quad))) return null
  return quad
}

function tryPlace(ctx: Ctx, assetId: string, c: Pt, rotationDeg: number, mode: Mode = 'solid', scale?: number): FurniturePlacement | null {
  const quad = fits(ctx, assetId, c, rotationDeg, mode)
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

/** Place against a side, preferring u = uPref and sliding ±0.25 m steps (at most `reach`) until the footprint fits. */
function onSide(ctx: Ctx, side: Side, assetId: string, uPref = side.len / 2, out = 0, mode: Mode = 'solid', reach = side.len / 2) {
  const hw = size(assetId).x / 2
  const rot = rotationFacing(side.n)
  for (let k = 0; k * 0.25 <= reach; k++) {
    for (const u of k ? [uPref - k * 0.25, uPref + k * 0.25] : [uPref]) {
      if (u - hw < 0.1 || u + hw > side.len - 0.1) continue
      const c = againstSide(side, assetId, u, out)
      const p = tryPlace(ctx, assetId, c, rot, mode)
      if (p) return { p, u, c, side, rot }
    }
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

function bed(ctx: Ctx): void {
  const queen = ctx.room.areaSqm >= 9
  const bedId = (queen ? 'bed_queen' : 'bed_single') + ctx.bedStyle
  const b = onSides(ctx, rankNoOpenings(ctx), bedId)
  if (!b) return
  const off = size(bedId).x / 2 + GAP + size('bedside_oak').x / 2
  for (const s of [-1, 1]) tryPlace(ctx, 'bedside_oak', againstSide(b.side, 'bedside_oak', b.u + s * off), b.rot)
  // rug under the lower two thirds of the bed (or a bit less), long side across it, nudged clear of door zones
  const L = size(bedId).z
  rug: for (const rug of queen ? ['rug_rect_large', 'rug_rect_small'] : ['rug_rect_small'])
    for (const out of [L / 3, L / 4])
      for (const du of [0, -0.25, 0.25, -0.5, 0.5]) if (tryPlace(ctx, rug, againstSide(b.side, rug, b.u + du, out), b.rot, 'flat')) break rug
  frames(ctx, b.side, b.u)
  // closed oak wardrobes only (the kit's steel-framed drawer_cabinet read as garage shelving): 3 doors, else 2, else beside the bed
  onSides(ctx, others(ctx, [b.side]), 'wardrobe_tall') ?? onSides(ctx, others(ctx, [b.side]), 'wardrobe_2door') ?? onSides(ctx, [b.side], 'wardrobe_2door')
  if (ctx.room.areaSqm >= 18) inCorner(ctx, 'modern_arm_chair_01')
  inCorner(ctx, 'potted_plant_02')
  // ponytail: no potted_plant_04 on a side table — placements carry no per-instance elevation (mountY is per asset).
}

/**
 * Sofa group: sofa on the first side that takes it (centred on `toward`'s projection), pillows on
 * it, a rug under its front legs and the coffee table, the table, frames above, an arm chair.
 */
function lounge(ctx: Ctx, sides: Side[], toward: Pt | null, tables = ['modern_coffee_table_01'], chairId = 'modern_arm_chair_01') {
  let sofa: ReturnType<typeof onSide> = null
  for (const s of sides) if ((sofa = onSide(ctx, s, 'sofa_3seat', toward ? projU(s, toward) : s.len / 2))) break
  if (!sofa) return null
  const { side, c, rot } = sofa
  const sz = size('sofa_3seat')
  for (const s of [-1, 1]) tryPlace(ctx, 'cushions_plain', add(add(c, side.d, s * 0.55), side.n, 0.12), rot + s * 8, 'free')
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
  // arm chair beside the coffee table facing across it; else at the sofa's end turned 30° toward it
  // (positive θ turns the front toward −d, see header)
  const chair = size(chairId)
  const beside = (s: number) =>
    !!table && !!tryPlace(ctx, chairId, add(tc, side.d, s * (size(table).x / 2 + 0.3 + chair.z / 2)), rotationFacing({ x: -side.d.x * s, y: -side.d.y * s }))
  if (!beside(1) && !beside(-1)) {
    placeChair: for (const s of [1, -1]) {
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

/** Table (long axis = local x) with chairs touching its edges, all-or-nothing. */
function diningSet(ctx: Ctx, c: Pt, rot: number, seats: number): boolean {
  return atomic(ctx, () => {
    if (!tryPlace(ctx, 'dining_table', c, rot)) return false
    const t = (rot * Math.PI) / 180
    const ex = { x: Math.cos(t), y: Math.sin(t) }
    const ey = { x: -Math.sin(t), y: Math.cos(t) }
    const tz = size('dining_table')
    const ch = size('dining_chair').z / 2
    const spots: [Pt, Pt][] = [] // [offset direction, along-offset]
    for (const s of [-1, 1]) for (const a of seats >= 6 ? [-0.4, 0.4] : [0]) spots.push([{ x: ey.x * s, y: ey.y * s }, { x: ex.x * a, y: ex.y * a }])
    if (seats !== 2) for (const s of [-1, 1]) spots.push([{ x: ex.x * s, y: ex.y * s }, { x: 0, y: 0 }])
    return spots.every(([dir, along]) => {
      const reach = Math.abs(dot(dir, ex)) > 0.5 ? tz.x / 2 : tz.z / 2
      const cc = add(add(c, along), dir, reach + ch)
      return !!tryPlace(ctx, 'dining_chair', cc, rotationFacing({ x: -dir.x, y: -dir.y }))
    })
  })
}

/** Centroid, main axis (the longest side) and the inner polygon's extent along it. */
function mainAxis(ctx: Ctx) {
  const c0 = polygonCentroid(ctx.inner)
  const axis = rankLongest(ctx)[0].d
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
  search: for (const seats of [6, 4, 2]) {
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
    const sofa = lounge(ctx, nearest(ctx, family), family, ['coffee_table_round_01', 'ottoman_01', 'modern_coffee_table_01'], 'mid_century_lounge_chair')
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
  if (ctx.room.areaSqm >= 4) inCorner(ctx, 'shower_screen', [], GAP + FLUSH) // a fitted tray: flush to both walls
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

function balcony(ctx: Ctx): void {
  const plant = inCorner(ctx, 'potted_plant_02')
  // a planter is for plants; a ledge under 1.2 m deep is no place to sit
  if (/planter/i.test(ctx.room.name)) inCorner(ctx, 'potted_plant_01', plant ? [plant.corner] : [])
  else if (ctx.room.areaSqm >= 3 && bounds(ctx).short >= 1.2) {
    inCorner(ctx, 'mid_century_lounge_chair', plant ? [plant.corner] : []) ??
      tryPlace(ctx, 'ottoman_01', polygonCentroid(ctx.inner), 0)
  }
}

/** Walk-in closet: an open rail + shelf unit (1.8 m, else 1.2 m) on each of its two blankest walls. */
function closet(ctx: Ctx): void {
  if (ctx.room.areaSqm >= 3) for (const s of rankNoOpenings(ctx).slice(0, 2)) onSide(ctx, s, 'closet_rail') ?? onSide(ctx, s, 'closet_rail_s')
}

/** Help / servant room: a cot along the blankest wall, a hook rail on another wall (else over the cot), nothing else. */
function helpRoom(ctx: Ctx): void {
  const cot = onSides(ctx, rankNoOpenings(ctx), 'cot')
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
export const LIT_KINDS: RoomKind[] = ['living', 'dining', 'bed', 'kitchen', 'study', 'bath']
/** Rooms that get a wall-mounted split AC. */
export const AC_KINDS: RoomKind[] = ['bed', 'living', 'dining', 'study']
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

const BY_KIND: Partial<Record<Room['kind'], (ctx: Ctx) => void>> = {
  bed,
  living,
  dining,
  study,
  kitchen,
  bath,
  balcony,
  closet,
}

/** Deterministic preset placements for every room (rooms in the given order). */
export function furnish(unit: Unit, rooms: Room[]): FurniturePlacement[] {
  const out: FurniturePlacement[] = []
  const beds = rooms.filter((r) => r.kind === 'bed').sort((a, b) => b.areaSqm - a.areaSqm)
  const k = rooms.find((r) => r.kind === 'kitchen')
  const kitchenAt = k && k.loop.length >= 3 ? polygonCentroid(roomInnerPolygon(k, unit)) : null
  for (const room of rooms) {
    const help = isHelpRoom(room)
    const fn = isStair(room) ? stairwell : help ? helpRoom : BY_KIND[room.kind]
    if (!fn || room.loop.length < 3) continue
    const ctx = makeCtx(room, unit, kitchenAt, BED_STYLES[Math.max(0, beds.indexOf(room)) % BED_STYLES.length])
    fn(ctx)
    // after the room's own pieces, so their ids stay put; 'free' placements, so they move nothing
    if (LIT_KINDS.includes(room.kind)) ceilingLight(ctx)
    if (AC_KINDS.includes(room.kind) && !help) wallAC(ctx)
    out.push(...ctx.out)
  }
  return out
}
