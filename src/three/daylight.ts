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
 * (materials.ts), so furniture that shares a finish never sees the attribute.
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
/** what an opening lets through: glass × frame (and the curtains stacked over 36 % of a window); a door stands ajar */
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
 * living's walls 213 → 182–197; this set keeps mid-room walls ≈ 200 with the window zone up to +35 % and the back −35 %.
 */
/** per class: floor, wall, ceiling (walls / ceilings steeper, wave 14) */
const GAMMA = [0.75, 0.9, 0.9]
const PIVOT = 0.5
// manager at merge: 0.65/1.35 left bedroom floors muddy (b-bed-1 oak 140 → 119) and the b-living window-facing wall at 232.
// Wave 14: per class (floor, wall, ceiling) and SOFT (tanh in log space, no plateau): the hard clamp flattened a small room's
// field into plateaus whose kinks read as blocks. Floors stay gentle; walls and ceilings carry the falloff, mostly downward.
const WITHIN: [number, number][] = [
  [0.75, 1.25],
  [0.62, 1.25],
  [0.6, 1.22],
]
const GAMMA_B = 0.25
const BETWEEN = [0.8, 1] // 0.75 greyed the window walls / baths 10–20 levels
export const LO = Math.min(...WITHIN.map((w) => w[0])) * BETWEEN[0]
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
export const isCovered = (r: Room, cover: Pt[][]) => core.isOutdoor(r.kind) && cover.some((poly) => core.pointInPolygon(r.centroid, poly))
/**
 * No storey above: AOD shafts, the planter and the small recessed verandas get sky from above (render.ts's roof skips
 * them), and every outdoor zone not under the `cover`.
 */
export const openToSky = (r: Room, cover: Pt[][] = []) =>
  r.kind === 'shaft' || (r.kind === 'balcony' && r.areaSqm < 5) || (core.isOutdoor(r.kind) && !isCovered(r, cover))
const outdoor = (r: Room | null) => !r || r.kind === 'balcony' || r.kind === 'shaft' || core.isOutdoor(r.kind)
/**
 * The indirect-light factor on a covered zone and the walls facing it (a parking deck under the slab): a flat shade, its
 * light comes from the rule's battens (render.ts), not a bake through openings it does not have.
 */
const COVERED = 0.75

/** sky radiance seen through an opening onto `r`: open sky 1; a covered veranda's slab hides the upper sky; a shaft is a well */
const skyOf = (r: Room | null, cover: Pt[][]) =>
  !r ? 1 : r.kind === 'shaft' ? 0.3 : core.isOutdoor(r.kind) ? (isCovered(r, cover) ? 0.55 : 1) : openToSky(r) ? 0.85 : 0.55

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

/** Sky above the point's horizon at full radiance, the view below it at GROUND. */
function seen(p: V3, n: V3, quad: V3[]): number {
  let lo = Infinity
  let hi = -Infinity
  for (const v of quad) [lo, hi] = [Math.min(lo, v[2]), Math.max(hi, v[2])]
  if (lo >= p[2]) return formFactor(p, n, quad)
  if (hi <= p[2]) return GROUND * formFactor(p, n, quad)
  return formFactor(p, n, clip(quad, (v) => v[2] - p[2])) + GROUND * formFactor(p, n, clip(quad, (v) => p[2] - v[2]))
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

/** Bake every room surface of the unit (pure: no GL). */
export function bakeDaylight(unit: Unit, rooms: Room[], cover: Pt[][] = []): Daylight {
  const t0 = performance.now()
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
    const rect = (w: Wall, u0: number, u1: number, z0: number, z1: number, L: number, from: Room | null) => {
      const f = frames.get(w.id)!
      const k = Math.max(1, Math.ceil((u1 - u0) / STRIP))
      for (let i = 0; i < k; i++) {
        const [a, b] = [u0 + ((u1 - u0) * i) / k, u0 + ((u1 - u0) * (i + 1)) / k]
        const P = (u: number): Pt => ({ x: f.origin.x + f.dir.x * u, y: f.origin.y + f.dir.y * u })
        const [pa, pb] = [P(a), P(b)]
        list.push({ quad: [[pa.x, pa.y, z0], [pb.x, pb.y, z0], [pb.x, pb.y, z1], [pa.x, pa.y, z1]], L, from, wallId: w.id, c: P((a + b) / 2) })
      }
    }
    for (const id of r.wallIds) {
      const w = wallsById.get(id)
      const s = sides.get(id)
      if (!w || !s) continue
      const other = s[0]?.id === r.id ? s[1] : s[1]?.id === r.id ? s[0] : null
      if ((s[0]?.id !== r.id && s[1]?.id !== r.id) || other === r) continue
      const through = (tau: number, u0: number, u1: number, z0: number, z1: number) =>
        outdoor(other) ? rect(w, u0, u1, z0, z1, tau * skyOf(other, cover), null) : rect(w, u0, u1, z0, z1, tau, other)
      // a glass wall (openings.ts isGlazing) lets more through than a window's sashes and curtains
      for (const o of w.openings) through(isGlazing(o) ? 0.85 : (TAU[o.kind] ?? 0.5), o.offsetM, o.offsetM + o.widthM, o.sillM, o.sillM + o.heightM)
      // a parapet / planter wall lower than the room: open above it
      if (w.heightM < h - 0.05) through(TAU.gap, 0, frames.get(id)!.lengthM, w.heightM, h)
    }
    if (openToSky(r)) {
      const poly = core.roomInnerPolygon(r, unit)
      list.push({ quad: poly.map((p) => [p.x, p.y, h]), L: 1, from: null, wallId: null, c: r.centroid })
    }
    apertures.set(r.id, list)
    // occlusion only matters where the room isn't convex
    blockers.set(
      r.id,
      convex(core.roomInnerPolygon(r, unit))
        ? null
        : r.wallIds.map((id) => {
            const w = wallsById.get(id)!
            return { id, a: core.vertexById(unit.vertices, w.a), b: core.vertexById(unit.vertices, w.b) }
          }),
    )
  }

  // ── sample grids ──
  type Job = { key: string; room: Room; nu: number; nv: number; u0: number; v0: number; du: number; dv: number; point: (u: number, v: number) => V3 | null; n: V3; own: Id | null; cls: 0 | 1 | 2 }
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
    jobs.push({ ...base, key: `floor:${r.id}`, point: at(0), n: [0, 0, 1], cls: 0 })
    jobs.push({ ...base, key: `ceil:${r.id}`, point: at(h), n: [0, 0, -1], cls: 2 })
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
        n: [s * f.normal.x, s * f.normal.y, 0],
        own: w.id,
        cls: 1,
      })
    })
  }

  // ── pass 1: sky through outdoor openings; pass 2: the neighbour's light through doors / passages; one bounce ──
  const light = (job: Job, p: V3, pass: 1 | 2, mean: Map<Id, number>) => {
    let e = 0
    const bl = blockers.get(job.room.id)
    for (const a of apertures.get(job.room.id)!) {
      if ((pass === 1) !== (a.from === null)) continue
      if (bl && a.wallId && bl.some((b) => b.id !== a.wallId && b.id !== job.own && crosses({ x: p[0], y: p[1] }, a.c, b.a, b.b))) continue
      const L = pass === 1 ? a.L : a.L * RHO * (mean.get(a.from!.id) ?? 0)
      if (L > 0) e += L * seen(p, job.n, a.quad)
    }
    return e
  }
  const E = jobs.map((j) => new Float32Array(j.nu * j.nv).fill(NaN))
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
  const none = new Map<Id, number>()
  jobs.forEach((j, k) => pts[k].forEach((p, i) => p && (E[k][i] = light(j, p, 1, none))))
  // a room's light as seen through its door: direct + its own bounce
  const m1 = new Map([...roomMean(E)].map(([id, v]) => [id, v / (1 - RHO)]))
  jobs.forEach((j, k) => pts[k].forEach((p, i) => p && (E[k][i] += light(j, p, 2, m1))))
  const m2 = roomMean(E)
  jobs.forEach((j, k) => {
    const b = (RHO / (1 - RHO)) * (m2.get(j.room.id) ?? 0)
    for (let i = 0; i < E[k].length; i++) if (!Number.isNaN(E[k][i])) E[k][i] += b
  })

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
    return within * between
  }

  // ── atlas: a 2 × 2 neutral block at (0, 0) (exterior faces, and a missing attribute reads uv 0,0), then shelves ──
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
  const shade = (key: string, roomId: Id) => regions.set(key, { x: 3, y: 0, nu: 1, nv: 1, u0: 0, v0: 0, du: 1, dv: 1, E: new Float32Array(1), roomId })
  for (const r of rooms) if (isCovered(r, cover)) shade(`floor:${r.id}`, r.id)
  for (const [id, pair] of sides) pair.forEach((r, i) => r && isCovered(r, cover) && shade(`wall:${id}:${i ? -1 : 1}`, r.id))
  jobs.forEach((j, k) => {
    const [x0, y0] = pos[k]
    const F = blur(E[k].map((e) => factor(e, j.room, j.cls)), j.nu, j.nv)
    for (let y = 0; y < j.nv; y++) {
      for (let x = 0; x < j.nu; x++) data[(y0 + y) * width + x0 + x] = Math.round((255 * F[y * j.nu + x]) / RANGE)
    }
    regions.set(j.key, { x: x0, y: y0, nu: j.nu, nv: j.nv, u0: j.u0, v0: j.v0, du: j.du, dv: j.dv, E: E[k], roomId: j.room.id })
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

// ───────────────────────────── GL glue ─────────────────────────────

const NEUTRAL = new THREE.DataTexture(new Uint8Array([Math.round(255 / RANGE)]), 1, 1, THREE.RedFormat)
NEUTRAL.needsUpdate = true
/** the unit's atlas, shared by every daylit material (like context.ts's haze) */
export const dayMap = { value: NEUTRAL as THREE.Texture }
/** 1 by day → 0 at dusk: the lamps light the flat, not the windows */
export const dayMix = { value: 1 }

export function daylightTexture(d: Daylight): THREE.DataTexture {
  const t = new THREE.DataTexture(d.data, d.width, d.height, THREE.RedFormat)
  t.magFilter = t.minFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

/** Patch one material: its indirect diffuse + specular × the atlas at the fragment's `dayUv`. */
export function daylit(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (s) => {
    s.uniforms.dayMap = dayMap
    s.uniforms.dayMix = dayMix
    s.vertexShader = `attribute vec2 dayUv;\nvarying vec2 vDayUv;\n${s.vertexShader}`.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDayUv = dayUv;')
    s.fragmentShader = `uniform sampler2D dayMap;\nuniform float dayMix;\nvarying vec2 vDayUv;\n${s.fragmentShader}`.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      float dayK = mix(1.0, ${RANGE.toFixed(1)} * texture2D(dayMap, vDayUv).r, dayMix);
      reflectedLight.indirectDiffuse *= dayK;
      reflectedLight.indirectSpecular *= min(dayK, 1.0); // darker in the back, but the HDRI studio mirrored brighter near a window blew the marble out`,
    )
  }
  m.customProgramCacheKey = () => 'daylit'
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
  const put = (i: number, key: string | null, u: number, v: number) => {
    const r = key ? d.regions.get(key) : undefined
    if (!r) return uv.set([1 / d.width, 1 / d.height], i * 2) // neutral block
    uv[i * 2] = (r.x + 0.5 + THREE.MathUtils.clamp((u - r.u0) / r.du, 0, r.nu - 1)) / d.width
    uv[i * 2 + 1] = (r.y + 0.5 + THREE.MathUtils.clamp((v - r.v0) / r.dv, 0, r.nv - 1)) / d.height
  }
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

/** The unit's atlas for every daylit material (null: neutral); the previous one is freed. */
export function setDaylight(d: Daylight | null): void {
  if (dayMap.value !== NEUTRAL) dayMap.value.dispose()
  dayMap.value = d ? daylightTexture(d) : NEUTRAL
}
