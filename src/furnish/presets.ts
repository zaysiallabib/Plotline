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
 * inner polygon, must not cross any door/passage clear zone (opening width ×
 * 1 m into the room) and must not overlap an earlier footprint (SAT on quads).
 * Ceiling-mounted items only need the inside test.
 */
import type { FurniturePlacement, Room, Unit } from '../core'
import { pointInPolygon, polygonCentroid, roomInnerPolygon, roomPolygon, type Pt } from '../core'
import { kitAsset } from './kit'

export const GAP = 0.05
const DOOR_CLEAR = 1.0
const EPS = 1e-9

interface Side {
  p0: Pt // centerline start
  d: Pt // unit direction along the loop
  n: Pt // inward normal
  len: number
  thick: number
  /** [u0, u1] along the side from p0 */
  doors: [number, number][]
  windows: number
}

interface Ctx {
  room: Room
  inner: Pt[]
  sides: Side[]
  corners: Pt[] // inner polygon vertices, convex first, sorted far-from-doors
  doorPts: Pt[]
  clear: Pt[][]
  quads: Pt[][]
  out: FurniturePlacement[]
  counts: Map<string, number>
}

const size = (assetId: string) => kitAsset(assetId)?.sizeM ?? { x: 1, y: 1, z: 1 }
const add = (a: Pt, b: Pt, s = 1): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
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
    const doors: [number, number][] = []
    let windows = 0
    for (const o of w?.openings ?? []) {
      const u0 = forward ? o.offsetM : len - o.offsetM - o.widthM
      if (o.kind === 'window') windows++
      else doors.push([u0, u0 + o.widthM])
    }
    return { p0: p, d, n: { x: -d.y, y: d.x }, len, thick: w?.thicknessM ?? 0.127, doors, windows }
  })
  const collinear = (a: Side, b: Side) => a.d.x * b.d.x + a.d.y * b.d.y > 0.9999
  const merge = (a: Side, b: Side) => {
    for (const [u0, u1] of b.doors) a.doors.push([u0 + a.len, u1 + a.len])
    a.windows += b.windows
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

function makeCtx(room: Room, unit: Unit): Ctx {
  const sides = buildSides(room, unit)
  const inner = roomInnerPolygon(room, unit)
  const doorPts: Pt[] = []
  const clear: Pt[][] = []
  for (const s of sides) {
    for (const [u0, u1] of s.doors) {
      const a = add(add(s.p0, s.d, u0), s.n, s.thick / 2)
      const b = add(add(s.p0, s.d, u1), s.n, s.thick / 2)
      clear.push([a, b, add(b, s.n, DOOR_CLEAR), add(a, s.n, DOOR_CLEAR)])
      doorPts.push(add(add(s.p0, s.d, (u0 + u1) / 2), s.n, s.thick / 2))
    }
  }
  const farFromDoors = (p: Pt) => (doorPts.length ? Math.min(...doorPts.map((q) => dist(p, q))) : 0)
  const corners = [...inner].sort((a, b) => farFromDoors(b) - farFromDoors(a))
  return { room, inner, sides, corners, doorPts, clear, quads: [], out: [], counts: new Map() }
}

function tryPlace(ctx: Ctx, assetId: string, c: Pt, rotationDeg: number, skipOverlap = false): FurniturePlacement | null {
  const quad = footprint(c, rotationDeg, size(assetId))
  if (!quad.every((p) => pointInPolygon(p, ctx.inner))) return null
  if (!skipOverlap && [...ctx.clear, ...ctx.quads].some((q) => quadsOverlap(q, quad))) return null
  const n = (ctx.counts.get(assetId) ?? 0) + 1
  ctx.counts.set(assetId, n)
  const p: FurniturePlacement = {
    id: `${ctx.room.id}:${assetId}:${n}`,
    assetId,
    roomId: ctx.room.id,
    x: c.x,
    y: c.y,
    rotationDeg: norm360(rotationDeg),
  }
  ctx.out.push(p)
  if (!skipOverlap) ctx.quads.push(quad)
  return p
}

/** Centre of an item against `side` at distance u along it, plus `out` metres further into the room. */
const againstSide = (side: Side, assetId: string, u: number, out = 0): Pt =>
  add(add(side.p0, side.d, u), side.n, side.thick / 2 + GAP + size(assetId).z / 2 + out)

/** Place against a side, preferring u = uPref and sliding ±0.25 m steps until the footprint fits. */
function onSide(ctx: Ctx, side: Side, assetId: string, uPref = side.len / 2, out = 0) {
  const hw = size(assetId).x / 2
  const rot = rotationFacing(side.n)
  for (let k = 0; k * 0.25 <= side.len / 2; k++) {
    for (const u of k ? [uPref - k * 0.25, uPref + k * 0.25] : [uPref]) {
      if (u - hw < 0.1 || u + hw > side.len - 0.1) continue
      const c = againstSide(side, assetId, u, out)
      const p = tryPlace(ctx, assetId, c, rot)
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

/** In a corner of the inner polygon, facing the outgoing edge's inward normal. Corners farthest from doors first. */
function inCorner(ctx: Ctx, assetId: string, exclude: Pt[] = []) {
  const n = ctx.inner.length
  const sz = size(assetId)
  for (const P of ctx.corners) {
    if (exclude.includes(P)) continue
    const i = ctx.inner.indexOf(P)
    const prev = ctx.inner[(i - 1 + n) % n]
    const next = ctx.inner[(i + 1) % n]
    const e1 = { x: (next.x - P.x) / (dist(P, next) || 1), y: (next.y - P.y) / (dist(P, next) || 1) }
    const e0 = { x: (P.x - prev.x) / (dist(P, prev) || 1), y: (P.y - prev.y) / (dist(P, prev) || 1) }
    const c = add(add(P, e1, sz.x / 2 + GAP), e0, -(sz.z / 2 + GAP))
    const p = tryPlace(ctx, assetId, c, rotationFacing({ x: -e1.y, y: e1.x }))
    if (p) return { p, corner: P }
  }
  return null
}

/** Sides ranked: fewest openings (doors + windows) first, then longest, then farthest from doors. */
const rankNoOpenings = (ctx: Ctx) =>
  [...ctx.sides].sort(
    (a, b) =>
      (a.doors.length + a.windows > 0 ? 1 : 0) - (b.doors.length + b.windows > 0 ? 1 : 0) ||
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

// ───────────────────────────── per kind ─────────────────────────────

function bed(ctx: Ctx): void {
  const bedId = ctx.room.areaSqm < 9 ? 'bed_single' : 'bed_queen'
  const b = onSides(ctx, rankNoOpenings(ctx), bedId)
  if (!b) return
  const off = size(bedId).x / 2 + GAP + size('side_table_01').x / 2
  for (const s of [-1, 1]) {
    const c = againstSide(b.side, 'side_table_01', b.u + s * off)
    tryPlace(ctx, 'side_table_01', c, b.rot)
  }
  const wardrobe = onSides(ctx, others(ctx, [b.side]), 'wardrobe_tall') ?? onSides(ctx, others(ctx, [b.side]), 'drawer_cabinet')
  if (!wardrobe) onSides(ctx, [b.side], 'drawer_cabinet')
  // ponytail: no potted_plant_04 on a side table — the engine grounds every asset and placements carry no elevation.
}

function living(ctx: Ctx): void {
  const sofa = onSides(ctx, rankLongest(ctx), 'sofa_02')
  if (sofa) {
    const { side, c, rot } = sofa
    const tc = add(c, side.n, size('sofa_02').z / 2 + 0.5 + size('modern_coffee_table_01').z / 2)
    tryPlace(ctx, 'modern_coffee_table_01', tc, rot)
    const opp = opposite(ctx, side)
    onSides(ctx, opp, opp[0] && clearSpan(opp[0]) >= 2.7 ? 'modern_wooden_cabinet' : 'wooden_display_shelves_01')
    // arm chair at the sofa's end, turned 30° toward it (positive θ turns the front toward −d, see header)
    const chair = size('modern_arm_chair_01')
    placeChair: for (const s of [1, -1]) {
      for (const out of [0.15, 0.3, 0.45]) {
        const cc = add(add(c, side.d, s * (size('sofa_02').x / 2 + 0.35 + chair.x / 2)), side.n, out)
        if (tryPlace(ctx, 'modern_arm_chair_01', cc, rot + s * 30)) break placeChair
      }
    }
  }
  inCorner(ctx, 'potted_plant_01')
  tryPlace(ctx, 'ceiling_fan', polygonCentroid(ctx.inner), 0, true)
}

function dining(ctx: Ctx): void {
  const c = polygonCentroid(ctx.inner)
  const tableQuad = footprint(c, 0, size('round_wooden_table_01'))
  if (tableQuad.every((p) => pointInPolygon(p, ctx.inner))) {
    // chairs first: the table is round, so its square footprint must not reject the diagonal chairs
    const k = ctx.room.areaSqm >= 12 ? 6 : 4
    const r = size('round_wooden_table_01').x / 2 + 0.35
    for (let i = 0; i < k; i++) {
      const a = (2 * Math.PI * i) / k + Math.PI / k
      const f = { x: -Math.cos(a), y: -Math.sin(a) }
      tryPlace(ctx, 'dining_chair_02', add(c, f, -r), rotationFacing(f))
    }
    tryPlace(ctx, 'round_wooden_table_01', c, 0, true)
    tryPlace(ctx, 'modern_ceiling_lamp_01', c, 0, true)
  }
  onSides(ctx, rankNoOpenings(ctx), 'steel_frame_shelves_01') ?? onSides(ctx, rankNoOpenings(ctx), 'wooden_display_shelves_01')
}

function study(ctx: Ctx): void {
  const ranked = [...ctx.sides].sort((a, b) => (b.windows > 0 ? 1 : 0) - (a.windows > 0 ? 1 : 0) || b.len - a.len)
  const desk = onSides(ctx, ranked, 'metal_office_desk')
  if (desk) {
    const cc = add(desk.c, desk.side.n, size('metal_office_desk').z / 2 + 0.1 + size('dining_chair_02').z / 2)
    tryPlace(ctx, 'dining_chair_02', cc, desk.rot + 180)
    onSides(ctx, others(ctx, [desk.side]), 'wooden_display_shelves_01')
  }
  inCorner(ctx, 'potted_plant_02')
}

function kitchen(ctx: Ctx): void {
  const stove = onSides(ctx, rankLongest(ctx), 'electric_stove')
  if (stove) {
    const half = size('electric_stove').x / 2 + size('kitchen_counter').x / 2
    for (const s of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const u = stove.u + s * (half + k * size('kitchen_counter').x)
        const hw = size('kitchen_counter').x / 2
        if (u - hw < 0.1 || u + hw > stove.side.len - 0.1) break
        if (!tryPlace(ctx, 'kitchen_counter', againstSide(stove.side, 'kitchen_counter', u), stove.rot)) break
      }
    }
  }
  inCorner(ctx, 'fridge')
}

function bath(ctx: Ctx): void {
  const t = onSides(ctx, rankNoOpenings(ctx), 'toilet')
  onSides(ctx, t ? others(ctx, [t.side]) : rankLongest(ctx), 'basin') ?? onSides(ctx, rankLongest(ctx), 'basin')
}

function balcony(ctx: Ctx): void {
  const plant = inCorner(ctx, 'potted_plant_02')
  if (ctx.room.areaSqm >= 3) {
    inCorner(ctx, 'mid_century_lounge_chair', plant ? [plant.corner] : []) ??
      tryPlace(ctx, 'ottoman_01', polygonCentroid(ctx.inner), 0)
  }
}

function closet(ctx: Ctx): void {
  if (ctx.room.areaSqm >= 3) onSides(ctx, rankNoOpenings(ctx), 'steel_frame_shelves_01')
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
  for (const room of rooms) {
    const fn = BY_KIND[room.kind]
    if (!fn || room.loop.length < 3) continue
    const ctx = makeCtx(room, unit)
    fn(ctx)
    out.push(...ctx.out)
  }
  return out
}
