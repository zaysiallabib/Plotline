/**
 * Daylight: where the sky reaches inside. The real-time indirect light (interior HDRI + hemisphere) is the same
 * everywhere, so a room read as bright at its back corner as at its window. At load, every room surface (floors,
 * ceilings, both faces of every wall) is sampled on a TEXEL grid; each sample sums the sky it sees through its own
 * room's openings — the analytic form factor of each aperture rectangle, cosine-weighted, occluded in plan by the
 * room's own walls (an opening only lights through its wall, so nothing leaks through a wall without one) — plus one
 * bounce (room mean × ρ/(1 − ρ)) and, through doors and passages, the neighbour room's light. The result multiplies
 * the INDIRECT terms only (env + hemi), never the sun or the lamps: the sun patch and the lamp pools stay as lit.
 *
 * Why an atlas and not vertex colours: the wall solids are crack-free grids (details.ts wallGeometry) that subdividing
 * would break, and floors are single polygons. A per-unit R8 atlas (one region per floor / ceiling / wall face, 1 texel
 * gap, texel centres exactly on the region's ends so filtering never reads a neighbour) needs no new vertices, and a
 * `dayUv` attribute on the room surfaces points into it. Room surfaces use their own `daylit` material variant
 * (materials.ts), so furniture that shares a finish never sees the attribute. Furniture (session 31) reads the atlas too,
 * one point a piece: its room's floor under its middle (pieceDayUv, lightPiece).
 */
import * as THREE from 'three'
import * as core from '../core'
import type { Id, Pt, Room, RoomKind, Unit, Wall } from '../core'
import { isGlazing } from './openings'

/** plan x, plan y, height */
type V3 = [number, number, number]

/** metres per atlas texel: the gradient is low-frequency; 0.25 m keeps a 2700 sft unit's bake well under 300 ms */
const TEXEL = 0.25
/** atlas byte 255 = factor RANGE */
export const RANGE = 2
/** walls shorter than this read the floor's daylight at their foot (mapDaylight) */
export const SHORT_WALL_M = 0.3
/**
 * what an opening lets through: glass × frame (and curtains stacked over about 36 % of a window — procedural.ts curtains; the
 * bake counts them on every window, a pair deleted or slid away included); a door stands ajar
 */
const TAU: Record<string, number> = { window: 0.6, slider: 0.7, door: 0.3, passage: 1, gap: 1 }
/** radiance below the horizon (street, the blocks opposite) / the sky's: a ceiling sees the window's lower view */
const GROUND = 0.3
/** mean interior albedo: bounce = ρ / (1 − ρ) × the room's mean direct light */
const RHO = 0.5
/**
 * factor = within × between. within = (E / the room's PIVOT texel)^γ: the eye (and a photo) compresses a real room's
 * ≈ 10 : 1 falloff from the window. between = (that texel / the habitable rooms' median)^γb, much flatter: the eye adapts
 * room to room (a photographer exposes each room), so a dining area lit only through the living room's passage — E ≈ 1/10
 * of the living's — reads dimmer, not black; never above 1 (a best-lit room keeps today's look, it doesn't whiten).
 * Both per surface class (floor / wall / ceiling), so each class keeps today's tuned level.
 * Tuned on type-a/-b at 15:30 (sRGB, 1280 × 720): between ≤ 1.1 lifted the long type-b living's window-facing wall and
 * ceiling into Neutral's knee (213 → 234, flat again); pivot 0.6 / γ 0.8 or normalising the room's MEAN to 1 sank the type-a
 * living's walls 213 → 182–197; this set kept mid-room walls ≈ 200 with the window zone up to +35 % and the back −35 %.
 * Founder 2026-11-20: "way too bright inside the room even without sunlight" — every room read as bright as its window
 * wall, a windowless toilet with its door shut at 80 % of a bedroom. Now the window zone reaches +50–60 %, a room's back
 * −45–55 %, and between falls to 0.35 (γb 0.2): a deep dining lit through a passage (E ≈ 1/9 of the median) reads ≈ 0.65,
 * a windowless toilet or closet (≈ 1/100) ≈ 0.35 — dim; a window room ≥ 0.9 as before. With render.ts's lower hemisphere
 * share and the day exposure +20 %: brighter by the windows and in the sun, darker deep inside.
 */
/** per class: floor, wall, ceiling (walls / ceilings steeper, wave 14) */
const GAMMA = [0.75, 0.9, 0.9]
const PIVOT = 0.5
// manager at merge: 0.65/1.35 left bedroom floors muddy (b-bed-1 oak 140 → 119) and the b-living window-facing wall at 232.
// Wave 14: per class (floor, wall, ceiling) and SOFT (tanh in log space, no plateau): the hard clamp flattened a small room's
// field into plateaus whose kinks read as blocks. Floors stay gentle; walls and ceilings carry the falloff, mostly downward.
const WITHIN: [number, number][] = [
  [0.55, 1.5],
  [0.45, 1.6],
  [0.45, 1.5],
]
const GAMMA_B = 0.2
const BETWEEN = [0.35, 1] // 0.8 left a flat wash; the stronger fall-off reads as a real room (2026-11-20)
/**
 * Neighbours (founder 2026-11-20: "with space there is much more light … which is not the case in real life"): a room's
 * light with the blocks round the building / its light with an open view, ^SHADE_GAMMA, no lower than SHADE_LO, × its factor.
 * The eye adapts again (the exposure follows), but not all the way: a bedroom facing a wall 3 m off reads dimmer.
 */
const SHADE_GAMMA = 0.5
const SHADE_LO = 0.6
/** a neighbour farther than this out of a window is not looked for (m) */
const VIEW_M = 100
export const LO = Math.min(...WITHIN.map((w) => w[0])) * BETWEEN[0] * SHADE_LO
export const HI = Math.max(...WITHIN.map((w) => w[1])) * BETWEEN[1]
/** ln(x) squashed into (ln lo, ln hi): slope 1 at x = 1, never reaching the bounds */
const soft = (lnx: number, [lo, hi]: [number, number]) => {
  const a = lnx < 0 ? -Math.log(lo) : Math.log(hi)
  return Math.exp(a * Math.tanh(lnx / a))
}
/** apertures are cut into strips this wide, each occlusion-tested on its own (an L-shaped room sees part of a window) */
const STRIP = 0.5
/** the rooms whose median sets factor 1: the tuned living-room look stays the average look */
const HABITABLE: RoomKind[] = ['living', 'dining', 'bed', 'study', 'kitchen']

/**
 * A zone (core.isOutdoor) under one of `cover`'s polygons (PlotlineScene.cover: the slab of the floor above) — by its
 * centroid. ponytail: a zone half under the slab is all covered or all open; split it with a flush line if that shows.
 */
const under = (r: Room, cover: Pt[][]) => cover.some((poly) => core.pointInPolygon(r.centroid, poly))
export const isCovered = (r: Room, cover: Pt[][]) => core.isOutdoor(r.kind) && under(r, cover)
/**
 * No storey above: AOD shafts, the planter and the small recessed verandas get sky from above (render.ts's roof skips
 * them), and every outdoor zone — each only where the `cover` (the slab of the floor above, in a tower) is not over it.
 */
export const openToSky = (r: Room, cover: Pt[][] = []) =>
  (r.kind === 'shaft' || (r.kind === 'balcony' && r.areaSqm < 5) || core.isOutdoor(r.kind)) && !under(r, cover)
const outdoor = (r: Room | null) => !r || r.kind === 'balcony' || r.kind === 'shaft' || core.isOutdoor(r.kind)
/**
 * The indirect-light factor on a covered zone and the walls facing it (a parking deck under the slab): a flat shade, its
 * light comes from the rule's battens (render.ts), not a bake through openings it does not have.
 */
const COVERED = 0.75
/** where the atlas keeps it */
const COVERED_AT = [3, 0] as const

/** sky radiance seen through an opening onto `r`: open sky 1; a covered veranda's slab hides the upper sky; a shaft is a well */
const skyOf = (r: Room | null, cover: Pt[][]) =>
  !r ? 1 : r.kind === 'shaft' ? 0.3 : core.isOutdoor(r.kind) ? (isCovered(r, cover) ? 0.55 : 1) : openToSky(r, cover) ? 0.85 : 0.55

export interface Region {
  /** atlas texel of (u0, v0) */
  x: number
  y: number
  nu: number
  nv: number
  u0: number
  v0: number
  du: number
  dv: number
  /** raw irradiance (sky-radiance units) per texel, row-major; tests read it */
  E: Float32Array
  roomId: Id
  /** where texel (u, v) of the surface is (plan x, plan y, height over the room's floor) and which way it faces: the lamps' bake (setLampDirect) */
  at?: (u: number, v: number) => V3
  n?: V3
}

export interface Daylight {
  width: number
  height: number
  /** factor / RANGE × 255 */
  data: Uint8Array
  /** `floor:<room>`, `ceil:<room>`, `wall:<wall>:<+1|-1>` */
  regions: Map<string, Region>
  /** each wall's rooms: [front (+normal), back], as PlotlineScene.buildWall probes them */
  sides: Map<Id, [Room | null, Room | null]>
  /** bake time, ms */
  ms: number
}

interface Aperture {
  quad: V3[]
  /** radiance (pass 1) — or, through an interior door, the room whose light comes through (pass 2) */
  L: number
  from: Room | null
  wallId: Id | null
  /** plan point the occlusion test aims at */
  c: Pt
  /** a window's view out (`out`: plan normal to the outside) blocked by a neighbour D m off, H m over the floor (zRaise) */
  obs?: { out: Pt; D: number; H: number }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Sutherland–Hodgman: the part of `poly` where f ≥ 0. */
function clip(poly: V3[], f: (v: V3) => number): V3[] {
  const out: V3[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const fa = f(a)
    const fb = f(b)
    if (fa >= 0) out.push(a)
    if (fa >= 0 !== fb >= 0) {
      const t = fa / (fa - fb)
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])])
    }
  }
  return out
}

/** Form factor from a point (normal n) to a planar polygon, clipped to the hemisphere above the point (Lambert's formula). */
export function formFactor(p: V3, n: V3, poly: V3[]): number {
  const q = clip(poly, (v) => dot(sub(v, p), n) - 1e-5)
  if (q.length < 3) return 0
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const a = sub(q[i], p)
    const b = sub(q[(i + 1) % q.length], p)
    const c: V3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    const cl = Math.hypot(c[0], c[1], c[2])
    if (cl < 1e-12) continue
    s += (Math.atan2(cl, dot(a, b)) * dot(n, c)) / cl
  }
  return Math.min(1, Math.abs(s) / (2 * Math.PI))
}

/** Sky above height `z` of the aperture (the point's horizon, or a neighbour's roof line) at full radiance, the view below it at GROUND. */
function seen(p: V3, n: V3, quad: V3[], z = p[2]): number {
  let lo = Infinity
  let hi = -Infinity
  for (const v of quad) [lo, hi] = [Math.min(lo, v[2]), Math.max(hi, v[2])]
  if (lo >= z) return formFactor(p, n, quad)
  if (hi <= z) return GROUND * formFactor(p, n, quad)
  return formFactor(p, n, clip(quad, (v) => v[2] - z)) + GROUND * formFactor(p, n, clip(quad, (v) => z - v[2]))
}

/**
 * Where a neighbour's roof line crosses the window's plane, seen from p: the line H m up, D m out past the window, from p
 * dp m inside it — p's own horizon when the roof is below p. Above it p sees sky through the window, below it the block.
 */
export const zRaise = (pz: number, dp: number, D: number, H: number): number => pz + (Math.max(0, H - pz) * dp) / (dp + D)

/**
 * The neighbour a window at `c` looks at along `out` (plan): of the blocks the ray meets within VIEW_M, the one whose top
 * stands highest over the line of sight from `z` — its distance and its height over the flat's floor (`floorM` over the street).
 */
export function facing(c: Pt, out: Pt, z: number, blocks: { plan: Pt[]; heightM: number }[], floorM: number): { D: number; H: number } | null {
  let best: { D: number; H: number } | null = null
  for (const k of blocks) {
    let D = Infinity
    k.plan.forEach((p, i) => {
      const q = k.plan[(i + 1) % k.plan.length]
      const e = { x: q.x - p.x, y: q.y - p.y }
      const den = out.x * e.y - out.y * e.x
      if (Math.abs(den) < 1e-12) return
      const t = ((p.x - c.x) * e.y - (p.y - c.y) * e.x) / den
      const s = ((p.x - c.x) * out.y - (p.y - c.y) * out.x) / den
      if (t > 0 && s >= 0 && s <= 1) D = Math.min(D, t)
    })
    const H = k.heightM - floorM
    if (D <= VIEW_M && H > z && (!best || (H - z) / D > (best.H - z) / best.D)) best = { D, H }
  }
  return best
}

/** Proper crossing of segments ab and cd (touching ends don't count). */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const [d1, d2, d3, d4] = [o(c, d, a), o(c, d, b), o(a, b, c), o(a, b, d)]
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12
}

function convex(poly: Pt[]): boolean {
  let sign = 0
  for (let i = 0; i < poly.length; i++) {
    const [a, b, c] = [poly[i], poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]]
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (Math.abs(z) < 1e-9) continue
    if (sign && Math.sign(z) !== sign) return false
    sign = Math.sign(z)
  }
  return true
}

/**
 * One [1 2 1] / 4 pass each way inside one region (its edges repeat; it never reads a neighbour region): the 0.25 m grid
 * under-samples the steep light beside a window, and bilinear filtering showed the texel-to-texel kinks.
 */
function blur(F: Float32Array, nu: number, nv: number): Float32Array {
  const pass = (src: Float32Array, dx: number, dy: number) =>
    src.map((v, i) => {
      const [x, y] = [i % nu, Math.floor(i / nu)]
      const at = (k: number) => src[THREE.MathUtils.clamp(y + k * dy, 0, nv - 1) * nu + THREE.MathUtils.clamp(x + k * dx, 0, nu - 1)]
      return (at(-1) + 2 * v + at(1)) / 4
    })
  return pass(pass(F, 1, 0), 0, 1)
}

/**
 * Bake every room surface of the unit (pure: no GL). `blocks`: what stands round the building (context.ts neighbours,
 * height over the street): a window facing one sees its wall where it would see sky.
 */
export function bakeDaylight(unit: Unit, rooms: Room[], cover: Pt[][] = [], blocks: { plan: Pt[]; heightM: number }[] = [], keep: BakeKeep = {}): Daylight {
  const steps = bakeSteps(unit, rooms, cover, blocks, keep)
  for (;;) {
    const s = steps.next()
    if (s.done) return s.value
  }
}

/**
 * What one bake leaves for the next of the same drawing under the same cover (another floor of it, PlotlineScene arrive): the
 * rooms' light with an open view, as if no neighbour stood round — the same on every floor (only the neighbours' shade
 * depends on the floor's height), half of a bake with neighbours in view.
 */
export interface BakeKeep {
  open?: Map<Id, number>
}

/** bakeDaylight's work, pausing after each region it lights: a floor reached by the stair bakes a little a frame (PlotlineScene.arrive). `keep`: BakeKeep, read and filled. */
export function* bakeSteps(unit: Unit, rooms: Room[], cover: Pt[][] = [], blocks: { plan: Pt[]; heightM: number }[] = [], keep: BakeKeep = {}): Generator<void, Daylight> {
  const t0 = performance.now()
  const floorM = (unit.floor ?? 2) * 3.2 + 0.2 // over the street, as core.sheltered and the 3D
  const frames = new Map(unit.walls.map((w) => [w.id, core.wallFrame(w, unit.vertices)]))
  const sides = new Map<Id, [Room | null, Room | null]>()
  for (const w of unit.walls) {
    const f = frames.get(w.id)!
    const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
    const off = w.thicknessM / 2 + 0.05
    const at = (s: number) => core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, unit)
    sides.set(w.id, [at(1), at(-1)])
  }
  const heightOf = (r: Room) => Math.max(...r.wallIds.map((id) => unit.walls.find((w) => w.id === id)?.heightM ?? 3))
  const wallsById = new Map(unit.walls.map((w) => [w.id, w]))

  // ── apertures, per room ──
  const apertures = new Map<Id, Aperture[]>()
  const blockers = new Map<Id, { id: Id; a: Pt; b: Pt }[] | null>()
  // an outdoor zone is not baked: open, it reads neutral (full daylight); covered, the flat COVERED shade
  const baked = rooms.filter((r) => !core.isOutdoor(r.kind))
  for (const r of baked) {
    const list: Aperture[] = []
    const h = heightOf(r)
    /** `out`: toward the outside (+1: the wall's normal), when it opens onto the outside */
    const rect = (w: Wall, u0: number, u1: number, z0: number, z1: number, L: number, from: Room | null, out = 0) => {
      const f = frames.get(w.id)!
      const k = Math.max(1, Math.ceil((u1 - u0) / STRIP))
      const n = { x: f.normal.x * out, y: f.normal.y * out }
      for (let i = 0; i < k; i++) {
        const [a, b] = [u0 + ((u1 - u0) * i) / k, u0 + ((u1 - u0) * (i + 1)) / k]
        const P = (u: number): Pt => ({ x: f.origin.x + f.dir.x * u, y: f.origin.y + f.dir.y * u })
        const [pa, pb, c] = [P(a), P(b), P((a + b) / 2)]
        const ob = out && blocks.length ? facing(c, n, (z0 + z1) / 2, blocks, floorM) : null
        list.push({ quad: [[pa.x, pa.y, z0], [pb.x, pb.y, z0], [pb.x, pb.y, z1], [pa.x, pa.y, z1]], L, from, wallId: w.id, c, ...(ob ? { obs: { out: n, ...ob } } : {}) })
      }
    }
    for (const id of r.wallIds) {
      const w = wallsById.get(id)
      const s = sides.get(id)
      if (!w || !s) continue
      const other = s[0]?.id === r.id ? s[1] : s[1]?.id === r.id ? s[0] : null
      if ((s[0]?.id !== r.id && s[1]?.id !== r.id) || other === r) continue
      const through = (tau: number, u0: number, u1: number, z0: number, z1: number) =>
        outdoor(other) ? rect(w, u0, u1, z0, z1, tau * skyOf(other, cover), null, s[0]?.id === r.id ? -1 : 1) : rect(w, u0, u1, z0, z1, tau, other)
      // a glass wall (openings.ts isGlazing) lets more through than a window's sashes and curtains
      for (const o of w.openings) through(isGlazing(o) ? 0.85 : (TAU[o.kind] ?? 0.5), o.offsetM, o.offsetM + o.widthM, o.sillM, o.sillM + o.heightM)
      // a parapet / planter wall lower than the room: open above it
      if (w.heightM < h - 0.05) through(TAU.gap, 0, frames.get(id)!.lengthM, w.heightM, h)
    }
    if (openToSky(r, cover)) {
      const poly = core.roomInnerPolygon(r, unit)
      list.push({ quad: poly.map((p) => [p.x, p.y, h]), L: 1, from: null, wallId: null, c: r.centroid })
    }
    apertures.set(r.id, list)
    // occlusion only matters where the room isn't convex
    // (its outline's edges: a room going round a column has edges that are no wall — core Room.joinPts)
    const poly = core.roomPolygon(r, unit)
    blockers.set(r.id, convex(core.roomInnerPolygon(r, unit)) ? null : r.wallIds.map((id, i) => ({ id, a: poly[i], b: poly[(i + 1) % poly.length] })))
  }

  // ── sample grids ──
  type Job = { key: string; room: Room; nu: number; nv: number; u0: number; v0: number; du: number; dv: number; point: (u: number, v: number) => V3 | null; at: (u: number, v: number) => V3; n: V3; own: Id | null; cls: 0 | 1 | 2 }
  const jobs: Job[] = []
  const grid = (lo: number, hi: number) => {
    const n = Math.max(2, Math.ceil((hi - lo) / TEXEL) + 1)
    return { n, d: (hi - lo) / (n - 1) || TEXEL }
  }
  for (const r of baked) {
    const poly = core.roomPolygon(r, unit)
    const inner = core.roomInnerPolygon(r, unit)
    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const gx = grid(Math.min(...xs), Math.max(...xs))
    const gy = grid(Math.min(...ys), Math.max(...ys))
    const h = heightOf(r)
    const at = (z: number) => (u: number, v: number): V3 | null => (core.pointInPolygon({ x: u, y: v }, inner) ? [u, v, z] : null)
    const base = { room: r, nu: gx.n, nv: gy.n, u0: Math.min(...xs), v0: Math.min(...ys), du: gx.d, dv: gy.d, own: null }
    jobs.push({ ...base, key: `floor:${r.id}`, point: at(0), at: (u, v) => [u, v, 0], n: [0, 0, 1], cls: 0 })
    jobs.push({ ...base, key: `ceil:${r.id}`, point: at(h), at: (u, v) => [u, v, h], n: [0, 0, -1], cls: 2 })
  }
  const inners = new Map(rooms.map((r) => [r.id, core.roomInnerPolygon(r, unit)]))
  for (const w of unit.walls) {
    const f = frames.get(w.id)!
    const gu = grid(0, f.lengthM)
    const gv = grid(0, w.heightM)
    sides.get(w.id)!.forEach((room, i) => {
      if (!room || core.isOutdoor(room.kind)) return
      const s = i ? -1 : 1
      const off = (s * w.thicknessM) / 2
      jobs.push({
        key: `wall:${w.id}:${s}`,
        room,
        nu: gu.n,
        nv: gv.n,
        u0: 0,
        v0: 0,
        du: gu.d,
        dv: gv.d,
        // a texel at a wall end sits inside the neighbouring wall (the graph joins centrelines): wrong light, and a hard step
        // at every corner (wave 13's "light-leak" lines). Only texels on the visible face are lit; the rest copy the face.
        point: (u, v) => {
          const [x, y] = [f.origin.x + f.dir.x * u + f.normal.x * off, f.origin.y + f.dir.y * u + f.normal.y * off]
          const probe = { x: x + s * f.normal.x * 0.01, y: y + s * f.normal.y * 0.01 }
          return core.pointInPolygon(probe, inners.get(room.id)!) ? [x, y, v] : null
        },
        at: (u, v) => [f.origin.x + f.dir.x * u + f.normal.x * off, f.origin.y + f.dir.y * u + f.normal.y * off, v],
        n: [s * f.normal.x, s * f.normal.y, 0],
        own: w.id,
        cls: 1,
      })
    })
  }

  // ── pass 1: sky through outdoor openings; pass 2: the neighbour's light through doors / passages; one bounce ──
  const light = (job: Job, p: V3, pass: 1 | 2, mean: Map<Id, number>, open: boolean) => {
    let e = 0
    const bl = blockers.get(job.room.id)
    for (const a of apertures.get(job.room.id)!) {
      if ((pass === 1) !== (a.from === null)) continue
      if (bl && a.wallId && bl.some((b) => b.id !== a.wallId && b.id !== job.own && crosses({ x: p[0], y: p[1] }, a.c, b.a, b.b))) continue
      const L = pass === 1 ? a.L : a.L * RHO * (mean.get(a.from!.id) ?? 0)
      const o = open ? undefined : a.obs
      const z = o ? zRaise(p[2], Math.max(0, (a.c.x - p[0]) * o.out.x + (a.c.y - p[1]) * o.out.y), o.D, o.H) : p[2]
      if (L > 0) e += L * seen(p, job.n, a.quad, z)
    }
    return e
  }
  const pts = jobs.map((j) => {
    const out: (V3 | null)[] = []
    for (let y = 0; y < j.nv; y++) for (let x = 0; x < j.nu; x++) out.push(j.point(j.u0 + x * j.du, j.v0 + y * j.dv))
    return out
  })
  const roomMean = (vals: Float32Array[]) => {
    const sum = new Map<Id, [number, number]>()
    jobs.forEach((j, k) => {
      const s = sum.get(j.room.id) ?? [0, 0]
      for (const v of vals[k]) if (!Number.isNaN(v)) [s[0], s[1]] = [s[0] + v, s[1] + 1]
      sum.set(j.room.id, s)
    })
    return new Map([...sum].map(([id, [t, n]]) => [id, n ? t / n : 0]))
  }
  /** `open`: as if no neighbour stood round the building */
  const irradiance = function* (open: boolean) {
    const E = jobs.map((j) => new Float32Array(j.nu * j.nv).fill(NaN))
    const none = new Map<Id, number>()
    for (const [k, j] of jobs.entries()) {
      pts[k].forEach((p, i) => p && (E[k][i] = light(j, p, 1, none, open)))
      yield
    }
    // a room's light as seen through its door: direct + its own bounce
    const m1 = new Map([...roomMean(E)].map(([id, v]) => [id, v / (1 - RHO)]))
    for (const [k, j] of jobs.entries()) {
      pts[k].forEach((p, i) => p && (E[k][i] += light(j, p, 2, m1, open)))
      yield
    }
    const m2 = roomMean(E)
    jobs.forEach((j, k) => {
      const b = (RHO / (1 - RHO)) * (m2.get(j.room.id) ?? 0)
      for (let i = 0; i < E[k].length; i++) if (!Number.isNaN(E[k][i])) E[k][i] += b
    })
    return { E, m2 }
  }
  const { E, m2 } = yield* irradiance(false)
  // each room's share of the light it would have with an open view (SHADE_*): baked again without them, if any is in view
  const dim = new Map<Id, number>()
  if ([...apertures.values()].some((l) => l.some((a) => a.obs))) {
    keep.open ??= (yield* irradiance(true)).m2
    for (const [id, v] of keep.open) if (v > 0) dim.set(id, THREE.MathUtils.clamp(((m2.get(id) ?? 0) / v) ** SHADE_GAMMA, SHADE_LO, 1))
  }

  // floor / ceiling texels outside the room (under its walls): the nearest inside value, so filtering at the edge never reads garbage
  jobs.forEach((j, k) => {
    const e = E[k]
    for (let pass = 0; pass < j.nu + j.nv && e.some(Number.isNaN); pass++) {
      const prev = e.slice()
      for (let y = 0; y < j.nv; y++) {
        for (let x = 0; x < j.nu; x++) {
          if (!Number.isNaN(prev[y * j.nu + x])) continue
          let [t, n] = [0, 0]
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const [X, Y] = [x + dx, y + dy]
            const v = X >= 0 && Y >= 0 && X < j.nu && Y < j.nv ? prev[Y * j.nu + X] : NaN
            if (!Number.isNaN(v)) [t, n] = [t + v, n + 1]
          }
          if (n) e[y * j.nu + x] = t / n
        }
      }
    }
    if (e.some(Number.isNaN)) e.fill(m2.get(j.room.id) ?? 0) // a room too thin for any texel centre
  })

  // per room and class: the PIVOT texel; per class: the habitable rooms' median of those
  const median = (v: number[], q = 0.5) => (v.sort((a, b) => a - b), v.length ? v[Math.floor(q * (v.length - 1))] : 0)
  const roomMed = new Map<string, number>()
  for (const r of baked) {
    for (const c of [0, 1, 2]) {
      const v: number[] = []
      jobs.forEach((j, k) => j.cls === c && j.room === r && pts[k].forEach((p, i) => p && v.push(E[k][i])))
      roomMed.set(`${r.id}:${c}`, median(v, PIVOT))
    }
  }
  const med = [0, 1, 2].map((c) => median(rooms.filter((r) => HABITABLE.includes(r.kind)).map((r) => roomMed.get(`${r.id}:${c}`)!)))
  const factor = (e: number, room: Room, c: number) => {
    const rm = roomMed.get(`${room.id}:${c}`)!
    const within = rm > 0 ? soft(GAMMA[c] * Math.log(Math.max(e, 1e-9) / rm), WITHIN[c]) : 1
    const between = med[c] > 0 ? THREE.MathUtils.clamp((rm / med[c]) ** GAMMA_B, BETWEEN[0], BETWEEN[1]) : 1
    return within * between * (dim.get(room.id) ?? 1)
  }

  // ── atlas: a 2 × 2 neutral block at (0, 0) (exterior faces, and a missing attribute reads uv 0,0), the COVERED block, the
  // OPEN texel between them (furniture on an open zone, pieceDayUv), then shelves ──
  const order = jobs.map((_, k) => k).sort((a, b) => jobs[b].nv - jobs[a].nv)
  const width = Math.max(256, ...jobs.map((j) => j.nu + 1))
  const pos: [number, number][] = []
  let [cx, cy, rowH] = [6, 0, 2]
  for (const k of order) {
    const j = jobs[k]
    if (cx + j.nu > width) [cx, cy, rowH] = [0, cy + rowH + 1, 0]
    pos[k] = [cx, cy]
    cx += j.nu + 1
    rowH = Math.max(rowH, j.nv)
  }
  const height = cy + rowH
  const neutral = Math.round((255 * 1) / RANGE)
  const data = new Uint8Array(width * height).fill(neutral)
  const regions = new Map<string, Region>()
  // the COVERED block, 2 × 2 at (3, 0): a covered zone's floor and every wall face toward it read its centre texel
  for (const i of [3, 4, width + 3, width + 4]) data[i] = Math.round((255 * COVERED) / RANGE)
  const shade = (key: string, roomId: Id) => regions.set(key, { x: COVERED_AT[0], y: COVERED_AT[1], nu: 1, nv: 1, u0: 0, v0: 0, du: 1, dv: 1, E: new Float32Array(1), roomId })
  for (const r of rooms) if (isCovered(r, cover)) shade(`floor:${r.id}`, r.id)
  for (const [id, pair] of sides) pair.forEach((r, i) => r && isCovered(r, cover) && shade(`wall:${id}:${i ? -1 : 1}`, r.id))
  jobs.forEach((j, k) => {
    const [x0, y0] = pos[k]
    const F = blur(E[k].map((e) => factor(e, j.room, j.cls)), j.nu, j.nv)
    for (let y = 0; y < j.nv; y++) {
      for (let x = 0; x < j.nu; x++) data[(y0 + y) * width + x0 + x] = Math.round((255 * F[y * j.nu + x]) / RANGE)
    }
    regions.set(j.key, { x: x0, y: y0, nu: j.nu, nv: j.nv, u0: j.u0, v0: j.v0, du: j.du, dv: j.dv, E: E[k], roomId: j.room.id, at: j.at, n: j.n })
  })
  return { width, height, data, regions, sides, ms: performance.now() - t0 }
}

/** The atlas factor at (u, v) of a region (nearest texel), for tests and probes. */
export function factorAt(d: Daylight, key: string, u: number, v: number): number {
  const r = d.regions.get(key)!
  const x = Math.round(THREE.MathUtils.clamp((u - r.u0) / r.du, 0, r.nu - 1))
  const y = Math.round(THREE.MathUtils.clamp((v - r.v0) / r.dv, 0, r.nv - 1))
  return (RANGE * d.data[(r.y + y) * d.width + r.x + x]) / 255
}

/**
 * A piece on an open zone (a lawn, a pool deck: not baked) reads this texel: neutral by day (the fill) and a lit room's lamp
 * share at night (daylightTexture; setLampShare never writes it) — lit exactly as before: no zone floor takes a lamp's
 * bounce, but the pieces always did, and the neutral block's 0 at night left a lawn's trees black on a lamp-lit lawn.
 */
const OPEN_AT = [2, 0] as const

/** `key`'s region at (u, v) as atlas texture coordinates, clamped to its texel grid (filtering never reads a neighbour); no such region: the neutral block. */
function uvOf(d: Daylight, key: string | null, u: number, v: number): [number, number] {
  const r = key ? d.regions.get(key) : undefined
  if (!r) return [1 / d.width, 1 / d.height]
  return [(r.x + 0.5 + THREE.MathUtils.clamp((u - r.u0) / r.du, 0, r.nu - 1)) / d.width, (r.y + 0.5 + THREE.MathUtils.clamp((v - r.v0) / r.dv, 0, r.nv - 1)) / d.height]
}

/**
 * The atlas point a piece of furniture reads (session 31: "furniture in a windowless room is still lit as if it had a
 * window"): one per piece — the floor of the room its middle `at` stands in, at that point (a rug across a doorway: the room
 * its middle is in; its own `roomId` when the middle is in no room). A wardrobe in a windowless closet is as dim as the
 * closet, a sofa by the window as bright as the floor there; on a covered zone the COVERED shade; on an open zone (not baked)
 * the OPEN texel: as before.
 */
export function pieceDayUv(d: Daylight, rooms: Room[], unit: Unit, at: Pt, roomId: Id): [number, number] {
  const key = `floor:${core.roomAt(at, rooms, unit)?.id ?? roomId}`
  return d.regions.has(key) ? uvOf(d, key, at.x, at.y) : [(OPEN_AT[0] + 0.5) / d.width, (OPEN_AT[1] + 0.5) / d.height]
}

// ───────────────────────────── GL glue ─────────────────────────────

/**
 * The atlas's second channel: the lamps' bounce on each room's surfaces at night, as a share of a lit room's (render.ts
 * lampShares; byte 255 = LAMP_RANGE) — a room whose lamps were deleted goes dark but for what comes through its doors.
 * 0 on the neutral block (faces toward the outside, open zones): at night they stay dark.
 */
export const LAMP_RANGE = 2
const share = (v: number) => Math.round((255 * THREE.MathUtils.clamp(v, 0, LAMP_RANGE)) / LAMP_RANGE)
const NEUTRAL = new THREE.DataTexture(new Uint8Array([Math.round(255 / RANGE), share(1)]), 1, 1, THREE.RGFormat)
NEUTRAL.needsUpdate = true
/** the unit's atlas, shared by every daylit material (like context.ts's haze) */
export const dayMap = { value: NEUTRAL as THREE.Texture }
/** the sky's share of the indirect light (render.ts setAltitude): 1 by day → ≈ 0 at night with the lamps on */
export const dayMix = { value: 1 }
/**
 * The lamps' bounce seen from OUTSIDE the flat (the Building view with the lamps on: render.ts setAltitude): what the walk's
 * hemisphere carries — down onto the floors (sky), up onto the ceilings (ground) — on the room surfaces and pieces alone,
 * × each room's own lamp share (the atlas's G), so its rooms glow through its glass as the walk shows them; the tower and
 * the street outside take none. Black otherwise.
 */
export const lampOut = { sky: { value: new THREE.Color(0, 0, 0) }, ground: { value: new THREE.Color(0, 0, 0) } }

/**
 * The city at night on what stands outside (qa3 P10: at 21:00 the towers were black shapes, only their lit windows read):
 * the sky's glow, a low cool light on every outside face, and the street's lamps, warm, brightest on the storeys nearest
 * the street and gone some NIGHT_REACH_M up — × the face's own colour. No light of any kind: one term in the shader
 * (nightPatch), 0 by day. `glow`: as seen ÷ the exposure (render.ts setAltitude); `streetY`: the street's level (Look's
 * ground plane, every frame). On the tower's shells and levels (materials.ts `outside`), the walked flat's outer faces
 * (EXTERIOR_PLASTER) and the street's blocks, roads and ground (context.ts hazed).
 */
export const nightOut = { glow: { value: 0 }, streetY: { value: 0 } }
/** the night's light on an outside face, as seen (× its colour): the sky's glow (cool) and, at the street, its lamps (warm) */
export const NIGHT_SKY = [0.085, 0.085, 0.1] as const
export const NIGHT_STREET = [0.2, 0.15, 0.09] as const
/** how far up the street lamps' light reaches on a facade (m over the street): the ground floor and the first four storeys */
export const NIGHT_REACH_M = 16
const ON = { value: 1 }
/** nightOut's term into a material's shaders (`on`: a per-material switch, 0 = none — the daylit program is the rooms' too; `weight`: a per-pixel one, GLSL). */
export function nightPatch(s: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, on: { value: number } = ON, weight = '1.0'): void {
  Object.assign(s.uniforms, { nightGlow: nightOut.glow, nightStreetY: nightOut.streetY, nightOn: on })
  const v3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`
  s.vertexShader = `varying float vNightY;\n${s.vertexShader}`.replace(
    '#include <project_vertex>',
    '#include <project_vertex>\nvNightY = (transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz)).y;', // its height in the world, whatever its matrices
  )
  s.fragmentShader = `uniform float nightGlow;\nuniform float nightStreetY;\nuniform float nightOn;\nvarying float vNightY;\n${s.fragmentShader}`.replace(
    '#include <lights_physical_fragment>',
    `totalEmissiveRadiance += diffuseColor.rgb * (nightGlow * nightOn * ${weight}) * (${v3(NIGHT_SKY)} + ${v3(NIGHT_STREET)} * (1.0 - smoothstep(0.0, ${NIGHT_REACH_M.toFixed(1)}, vNightY - nightStreetY)));
    #include <lights_physical_fragment>`,
  )
}
/** the atlas shown (setDaylight) and its texture's bytes: setLampShare rewrites their lamp channel */
let shown: { d: Daylight; rg: Uint8Array; tex: THREE.DataTexture } | null = null

/**
 * The lamps' own light baked (Lite, session 31 perf: a weak chip pays for every lamp light on every pixel, lit or not):
 * where `lampBake.on`, the room surfaces and the pieces take each lamp's direct light from a second atlas of the same layout
 * (setLampDirect: every lamp of a room on that room's surfaces, as a spot light gives it — candela × its cone × cos ÷ d², its
 * reach's fade), × `lampBake.color` (the lamps' white while they are on, black off) — no light in the shader at all, every
 * lamp of the flat lit, not only the nearest. LAMP_DIRECT is the brightest kept (a texel right under a lamp; brighter is
 * cut), stored as its square root: the dim corners keep their steps.
 */
export const lampBake = { on: false, color: { value: new THREE.Color(0, 0, 0) } }
export const LAMP_DIRECT = 8
const DARK = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat)
DARK.needsUpdate = true
/** the lamps' direct light (lampBake): one byte a texel, the daylight atlas's layout */
export const lampMap = { value: DARK as THREE.Texture }

/** A lamp as the bake sees it (render.ts setFixtures): its room, plan point, height over the room's floor, peak candela, its cone's cos (from straight down), its reach (m). */
export interface BakedLamp {
  roomId: Id
  x: number
  y: number
  h: number
  cd: number
  cosCone: number
  distance: number
}

/** One lamp's light on a surface point p (plan x, y, height) facing n: three's spot light (penumbra 1, decay 2) as the shader would sum it. */
export function lampLight(l: BakedLamp, p: V3, n: V3): number {
  const L: V3 = [l.x - p[0], l.y - p[1], l.h - p[2]]
  const d = Math.hypot(L[0], L[1], L[2])
  if (d < 1e-4 || d >= l.distance) return 0
  const cos = (L[0] * n[0] + L[1] * n[1] + L[2] * n[2]) / d
  if (cos <= 0) return 0
  const spot = THREE.MathUtils.smoothstep(L[2] / d, l.cosCone, 1) // the angle from straight down
  const fade = Math.max(0, 1 - (d / l.distance) ** 4) ** 2
  return (l.cd * spot * fade * cos) / Math.max(d * d, 0.01)
}

/** The lamps' direct light into the shown atlas's layout (lampMap): each room's lamps on its own surfaces; none elsewhere. */
export function setLampDirect(lamps: BakedLamp[]): void {
  if (!shown) return
  const { d } = shown
  const data = new Uint8Array(d.width * d.height)
  const byRoom = new Map<Id, BakedLamp[]>()
  for (const l of lamps) byRoom.set(l.roomId, [...(byRoom.get(l.roomId) ?? []), l])
  for (const r of d.regions.values()) {
    const ls = byRoom.get(r.roomId)
    if (!ls || !r.at || !r.n) continue
    for (let y = 0; y < r.nv; y++)
      for (let x = 0; x < r.nu; x++) {
        const p = r.at(r.u0 + x * r.du, r.v0 + y * r.dv)
        const e = ls.reduce((a, l) => a + lampLight(l, p, r.n!), 0)
        data[(r.y + y) * d.width + r.x + x] = Math.round(255 * Math.sqrt(Math.min(1, e / LAMP_DIRECT)))
      }
  }
  if (lampMap.value !== DARK) lampMap.value.dispose()
  const t = new THREE.DataTexture(data, d.width, d.height, THREE.RedFormat)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  lampMap.value = t
}

/** Day factors (R) and every room at a lit room's lamp bounce (G) until setLampShare says otherwise; the neutral block 0. */
export function daylightTexture(d: Daylight): THREE.DataTexture {
  const rg = new Uint8Array(d.width * d.height * 2)
  for (let i = 0; i < d.data.length; i++) [rg[2 * i], rg[2 * i + 1]] = [d.data[i], share(1)]
  for (const i of [0, 1, d.width, d.width + 1]) rg[2 * i + 1] = 0
  const t = new THREE.DataTexture(rg, d.width, d.height, THREE.RGFormat)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

/**
 * Each room's lamp bounce (render.ts lampShares: 1 = a lit room's, 0 = no lamp) into the shown atlas; a room not listed
 * has none. A covered zone keeps its own (its battens are always on: render.ts coverLights).
 */
export function setLampShare(shares: Map<Id, number>): void {
  if (!shown) return
  const { d, rg, tex } = shown
  for (const r of d.regions.values()) {
    if (r.x === COVERED_AT[0] && r.y === COVERED_AT[1]) continue
    const v = share(shares.get(r.roomId) ?? 0)
    for (let y = 0; y < r.nv; y++) for (let x = 0; x < r.nu; x++) rg[2 * ((r.y + y) * d.width + r.x + x) + 1] = v
  }
  tex.needsUpdate = true
}

/**
 * Painted plaster's cloudiness (materials.ts MOTTLE, session 31): a hand-plastered, painted wall is never one flat colour.
 * A material with the MOTTLE define (its strength) has its indirect diffuse × 1 + MOTTLE × (this picture − its own mean,
 * the top of its mip chain), MOTTLE_UV of its colour map's tile a tile, blurred 4× (a mip bias): soft clouds a hand wide,
 * no specks; as bright as before on average, the paint's colour its own. Shared by every painted wall.
 */
export const mottleMap = { value: null as THREE.Texture | null }

/**
 * Patch one material: its indirect diffuse + specular × the atlas at the fragment's `dayUv`; its colour map read
 * `userData.mapBias` mip levels softer (materials.ts PORE_BLUR; 0: as is) — a uniform, so the room surfaces keep sharing
 * their programs. The plaster's cloudiness (`userData.mottle`, materials.ts) is a uniform too: the painted walls were a
 * program of their own. `on` false (session 31 start lane): the same program with the atlas left out — its light × 1, no
 * lamp bounce from outside — so a plain lit surface (a door frame, a scan's leaves, the glass) draws exactly as it did
 * unpatched and shares the rooms' program instead of making one of its own (Firefox: 0.3 s each on High, one after another).
 * A two-sided solid piece's alpha test (materials.ts samePictures `solid`) never cuts: it shares the leaves' program.
 */
export function daylit(m: THREE.MeshStandardMaterial, on = true): void {
  if (on && !m.userData.dayOn) (m.userData.dayOn = true), (m.needsUpdate = true)
  if (m.onBeforeCompile === m.userData.dayFn) return
  m.userData.dayFn = m.onBeforeCompile = (s) => {
    s.uniforms.dayMap = dayMap
    s.uniforms.dayMix = dayMix
    s.uniforms.lampOutSky = lampOut.sky
    s.uniforms.lampOutGround = lampOut.ground
    s.uniforms.mottleMap = mottleMap
    s.uniforms.mapBias = { value: m.userData.mapBias ?? 0 }
    s.uniforms.lampMap = lampMap
    s.uniforms.lampColor = lampBake.color
    s.uniforms.dayPiece = { value: m.userData.dayPiece ? 1 : 0 } // lightPiece marks a piece's materials; a uniform: one program with the rooms
    s.uniforms.dayOn = { value: m.userData.dayOn ? 1 : 0 }
    s.uniforms.mottleK = { value: m.userData.mottle?.k ?? 0 }
    s.uniforms.mottleUv = { value: m.userData.mottle?.uv ?? 1 }
    s.uniforms.dayCut = { get value() { return m.userData.solid ? -1 : m.alphaTest } } // (read each frame, as three's own alphaTest)
    nightPatch(s, { value: m.userData.nightOut ? 1 : 0 }) // an outer face (materials.ts EXTERIOR_PLASTER): the city's night light; a room's: none
    s.vertexShader = `attribute vec2 dayUv;\nvarying vec2 vDayUv;\n${s.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDayUv = dayUv;')
    // (the baked lamps' picture declared only where it is read: Firefox counts every declared picture against the 16 a program may)
    s.fragmentShader = `${lampBake.on ? '#define LAMP_BAKE\n' : ''}uniform sampler2D dayMap;\nuniform float dayMix;\nuniform vec3 lampOutSky;\nuniform vec3 lampOutGround;\nuniform sampler2D mottleMap;\nuniform float mapBias;\n${lampBake.on ? 'uniform sampler2D lampMap;\n' : ''}uniform vec3 lampColor;\nuniform float dayPiece;\nuniform float dayOn;\nuniform float mottleK;\nuniform float mottleUv;\nuniform float dayCut;\nvarying vec2 vDayUv;\n${s.fragmentShader}`
      .replace('#include <map_fragment>', THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'texture2D( map, vMapUv, mapBias )'))
      .replace('#include <alphatest_fragment>', THREE.ShaderChunk.alphatest_fragment.replaceAll('alphaTest', 'dayCut'))
      .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      // the lamps' bounce (the rest of dayMix): its own room's lamps (the atlas's G, setLampShare); none on a face toward
      // the outside or an open zone: at night they stay dark
      vec2 dayRg = texture2D(dayMap, vDayUv).rg;
      float dayK = mix(1.0, mix(${LAMP_RANGE.toFixed(1)} * dayRg.g, ${RANGE.toFixed(1)} * dayRg.r, dayMix), dayOn);
      reflectedLight.indirectDiffuse *= dayK;
      reflectedLight.indirectSpecular *= min(dayK, 1.0); // darker in the back, but the HDRI studio mirrored brighter near a window blew the marble out
      // seen from outside with the lamps on (lampOut): their bounce as the walk's hemisphere gives it, × this room's lamps
      float dayUp = 0.5 + 0.5 * dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
      reflectedLight.indirectDiffuse += mix(lampOutGround, lampOutSky, dayUp) * BRDF_Lambert(material.diffuseColor) * ${LAMP_RANGE.toFixed(1)} * dayRg.g * dayOn;
      #ifdef LAMP_BAKE
      float lampE = texture2D(lampMap, vDayUv).r * dayOn;
      // a piece reads the floor under it: its top takes that light, its sides and underside less (the lamp is overhead)
      float lampK = mix(1.0, 0.2 + 0.8 * max(2.0 * dayUp - 1.0, 0.0), dayPiece);
      reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * lampColor * (lampE * lampE * ${LAMP_DIRECT.toFixed(1)} * lampK);
      #endif
      #ifdef USE_MAP
      if (mottleK > 0.0) reflectedLight.indirectDiffuse *= 1.0 + mottleK * (texture2D(mottleMap, vMapUv * mottleUv, 2.0).r - textureLod(mottleMap, vec2(0.5), 16.0).r);
      #endif`,
    )
  }
  m.customProgramCacheKey = () => (lampBake.on ? 'daylit-lamps' : 'daylit')
}

/**
 * `dayUv` for one room-surface mesh. `target` floor / ceiling (and skirting, which follows the floor): plan (X, Z) into
 * the room's region. A wall: each triangle into one face's region — a face by the side it lies on; reveals, end caps and
 * tops (they span the thickness) into the room-facing side at their (u, v); a face toward the outside reads neutral.
 * A triangle in a face group (0 front, 1 back) reads that face when it borders a room: the L-corner notch quads lie past
 * the wall's end, where the centroid test split each quad between the two faces (wave 13's sawtooth by the bed-1 door).
 */
export function mapDaylight(d: Daylight, geo: THREE.BufferGeometry, unit: Unit, target: 'floor' | 'ceiling' | 'wall', id: Id): void {
  const p = geo.attributes.position
  const uv = new Float32Array(p.count * 2)
  const put = (i: number, key: string | null, u: number, v: number) => uv.set(uvOf(d, key, u, v), i * 2)
  if (target !== 'wall') {
    const key = `${target === 'floor' ? 'floor' : 'ceil'}:${id}`
    for (let i = 0; i < p.count; i++) put(i, key, p.getX(i), p.getZ(i))
  } else {
    const w = unit.walls.find((x) => x.id === id)!
    const f = core.wallFrame(w, unit.vertices)
    const [front, back] = d.sides.get(id) ?? [null, null]
    const prefer = front ? 1 : back ? -1 : 0
    const T2 = w.thicknessM / 2
    // a short wall (a traced jog, a hair-long connector at a junction) is lit like the floor at its foot in the room it
    // faces, not with a bake of its own: a 13 cm face baked alone came out darker than the wall it continues (founder's
    // "grey line" at a passage jamb, 2026-10-03)
    const short = f.lengthM < SHORT_WALL_M
    const local = (i: number) => {
      const [dx, dz] = [p.getX(i) - f.origin.x, p.getZ(i) - f.origin.y]
      return { u: dx * f.dir.x + dz * f.dir.y, w: dx * f.normal.x + dz * f.normal.y, v: p.getY(i) }
    }
    const idx = geo.index
    const n = idx ? idx.count : p.count
    for (let t = 0; t < n; t += 3) {
      const vi = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k))
      const l = vi.map(local)
      const wc = (l[0].w + l[1].w + l[2].w) / 3
      const g = geo.groups.find((x) => t >= x.start && t < x.start + x.count)?.materialIndex
      const gs = g === 0 && front ? 1 : g === 1 && back ? -1 : 0
      const s = gs || (Math.abs(wc) > T2 / 2 ? Math.sign(wc) : prefer)
      const room = s > 0 ? front : s < 0 ? back : null
      if (short) vi.forEach((v) => put(v, room ? `floor:${room.id}` : null, p.getX(v), p.getZ(v)))
      else vi.forEach((v, k) => put(v, room ? `wall:${id}:${s}` : null, l[k].u, l[k].v))
    }
  }
  geo.setAttribute('dayUv', new THREE.BufferAttribute(uv, 2))
}

/**
 * A material furniture shares the room surfaces' patch with: a plain lit, solid one — never one with a shader of its own (a
 * mirror's, a line's), never glass: it is seen through, and patched it left the windows' glass program (Lite +2 programs).
 */
const patchable = (m: THREE.Material): m is THREE.MeshStandardMaterial =>
  !!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial && !m.transparent && (m.userData.dayPiece || m.onBeforeCompile === m.userData.dayFn || m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile)

/** A geometry of mesh `id`'s own over `g`'s vertices (not copied: a model's clones share one geometry), with an empty `dayUv`. */
function own(g: THREE.BufferGeometry, id: number): THREE.BufferGeometry {
  const o = new THREE.BufferGeometry()
  o.setIndex(g.index)
  for (const k in g.attributes) if (k !== 'dayUv') o.setAttribute(k, g.attributes[k])
  Object.assign(o, { morphAttributes: g.morphAttributes, morphTargetsRelative: g.morphTargetsRelative, boundingBox: g.boundingBox, boundingSphere: g.boundingSphere, userData: { dayOf: id } })
  for (const x of g.groups) o.addGroup(x.start, x.count, x.materialIndex)
  o.setDrawRange(g.drawRange.start, g.drawRange.count)
  o.setAttribute('dayUv', new THREE.BufferAttribute(new Float32Array((g.attributes.position?.count ?? 0) * 2), 2))
  return o
}

/**
 * A piece of furniture lit as the room it stands in (`uv`: pieceDayUv): its meshes drawn in a plain lit material each get a
 * geometry of their own over the model's vertices with every `dayUv` at `uv`, and those materials the room surfaces'
 * patch (daylit) once — the programs are the rooms' where the maps match; no new material. Called again when the piece
 * moves: only the numbers change. The batches (batch.ts) carry each piece's own numbers, one draw per material as before.
 */
// ponytail: every vertex of a piece holds its one dayUv (8 bytes: type-a ≈ 4.5 MB on Lite, 8 MB on High, again in the batches);
// a 16-bit attribute or a per-piece index into a small table if a phone runs short of memory.
export function lightPiece(obj: THREE.Object3D, uv: [number, number]): void {
  const [u, v] = [Math.fround(uv[0]), Math.fround(uv[1])]
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    const mats = m.isMesh ? [m.material].flat().filter(patchable) : []
    if (!mats.length) return
    for (const x of mats) if (!x.userData.dayPiece) (daylit(x), (x.userData.dayPiece = true), (x.needsUpdate = true))
    if (m.geometry.userData.dayOf !== m.id) m.geometry = own(m.geometry, m.id)
    const a = m.geometry.getAttribute('dayUv') as THREE.BufferAttribute
    const arr = a.array as Float32Array
    if (!arr.length || (arr[0] === u && arr[1] === v)) return
    for (let i = 0; i < arr.length; i += 2) (arr[i] = u), (arr[i + 1] = v)
    a.needsUpdate = true
  })
}

/** The unit's atlas for every daylit material (null: neutral); the previous one is freed. */
export function setDaylight(d: Daylight | null): void {
  if (dayMap.value !== NEUTRAL) dayMap.value.dispose()
  if (lampMap.value !== DARK) (lampMap.value.dispose(), (lampMap.value = DARK)) // its lamps are baked again (setLampDirect)
  const tex = d && daylightTexture(d)
  shown = d && tex && { d, rg: tex.image.data as Uint8Array, tex }
  dayMap.value = tex ?? NEUTRAL
}
