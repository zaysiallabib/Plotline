/**
 * What a low wall is made of (core Wall.lowKind; founder 2026-11-27: "a lot of buildings use glass walls on their balcony …
 * make sure that they can be used in any and all projects"): a glass balustrade, a metal railing, the Dhaka steel grille, a
 * timber balustrade, a timber fence, a chain-link fence — built by code from the wall's own line and height, as the pergola
 * is (furnish/procedural.ts): posts at a sane spacing, panes and bars between, a passage a gate (a gap). Also the cap on
 * every solid low wall a person drew (a coping, a stepped cornice when asked for) and a balcony's slab edge standing out
 * past its front. Nothing here knows a unit: only walls, their heights and the rooms' kinds.
 *
 * World space (plan x, y → X, Z), the wall's foot at y = 0 — the caller stands it on its floor (details.ts liftWall). Every
 * part is a block (a box, or one cut to a mitre where two walls meet), non-indexed, position + normal + uv in metres.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { LowWallKind, MaterialRef, Pt, Room, Unit, Wall } from '../core'
import { GLAZING_GLASS } from './openings'

type V3 = [number, number, number]
type Graph = Pick<Unit, 'vertices' | 'walls'>

/** Stainless / powder-coated aluminium: handrails, posts, a glass front's base channel. Not mirror-bright (openings.ts ALU: a high metalness flipped black / white with the sky). */
export const RAIL_STEEL: MaterialRef = { kind: 'color', color: '#c3c6c6', roughness: 0.32, metalness: 0.45 }
/** A Dhaka MS grille's enamel: near black */
export const GRILLE_PAINT: MaterialRef = { kind: 'color', color: '#2b2c2e', roughness: 0.5, metalness: 0.25 }
/** Oiled teak: a timber balustrade */
export const RAIL_TIMBER: MaterialRef = { kind: 'pbr', textureId: 'wood_veneer_light', tint: '#9b6b45' }
/** Weathered boards: a timber fence */
export const FENCE_TIMBER: MaterialRef = { kind: 'pbr', textureId: 'wood_veneer_light', tint: '#8d7257' }
/** Galvanised steel: a chain-link fence's posts and top rail */
export const FENCE_STEEL: MaterialRef = { kind: 'color', color: '#a2a7a9', roughness: 0.45, metalness: 0.5 }
/** A diamond wire mesh (2 px wires on a 32 px tile, 6 cm a diamond) as an alpha picture: far off it fades to a grey haze, as chain-link does. */
export const CHAIN_MESH = (() => {
  const N = 32
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const on = Math.min((x + y) % N, N - ((x + y) % N)) < 1.5 || Math.min((x - y + N) % N, N - ((x - y + N) % N)) < 1.5
      data.set([255, on ? 255 : 0, 255, 255], (y * N + x) * 4)
    }
  const t = new THREE.DataTexture(data, N, N)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1 / 0.06, 1 / 0.06)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.needsUpdate = true
  const m = new THREE.MeshStandardMaterial({ color: '#a7abad', roughness: 0.5, metalness: 0.4, alphaMap: t, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  m.userData.merge = true // (batch.ts: one batch, as the panes)
  return m
})()

export interface RailPart {
  m: MaterialRef | THREE.Material
  geo: THREE.BufferGeometry
}

// ───────────────────────────── blocks ─────────────────────────────

const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]]
/**
 * A convex block from its 8 corners P[i + 2j + 4k] (i along, j up, k across): 6 faces, each facing away from the block's
 * middle, flat normals, UVs in metres (horizontal faces plan x / z; upright ones along the face, y — as wallGeometry).
 */
export function block(P: V3[]): THREE.BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const mid = [0, 1, 2].map((c) => P.reduce((s, p) => s + p[c], 0) / 8)
  for (const f of FACES) {
    const q = f.map((i) => P[i])
    // Newell's normal: right for a quad whose corners are not all distinct
    const n = [0, 0, 0]
    for (let i = 0; i < 4; i++) {
      const [a, b] = [q[i], q[(i + 1) % 4]]
      n[0] += (a[1] - b[1]) * (a[2] + b[2])
      n[1] += (a[2] - b[2]) * (a[0] + b[0])
      n[2] += (a[0] - b[0]) * (a[1] + b[1])
    }
    const len = Math.hypot(...n)
    if (len < 1e-9) continue // a face of no area (a block of no width)
    const c = [0, 1, 2].map((k) => q.reduce((s, p) => s + p[k], 0) / 4 - mid[k])
    const s = n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0 ? -1 : 1
    const m = n.map((x) => (s * x) / len)
    const order = s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const i of order) pos.push(...q[i]), nor.push(...m)
  }
  const uv: number[] = []
  for (let i = 0; i < pos.length; i += 3) {
    let [ax, az] = [-nor[i + 2], nor[i]]
    if (ax < 0 || (ax === 0 && az < 0)) [ax, az] = [-ax, -az]
    if (Math.abs(nor[i + 1]) > 0.5) uv.push(pos[i], pos[i + 2])
    else uv.push(ax * pos[i] + az * pos[i + 2], pos[i + 1])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** wall-local (u along a→b from vertex a, v up, w along its normal) → world */
function localOf(wall: Wall, graph: Pick<Unit, 'vertices'>): { L: number; f: ReturnType<typeof core.wallFrame>; at: (u: number, v: number, w: number) => V3 } {
  const f = core.wallFrame(wall, graph.vertices)
  return { L: f.lengthM, f, at: (u, v, w) => [f.origin.x + f.dir.x * u + f.normal.x * w, v, f.origin.y + f.dir.y * u + f.normal.y * w] }
}

/** A cut across a block's end: how far in from the end (along the wall) at w across it. */
type Cut = (w: number) => number
const SQUARE: Cut = () => 0

/** A block along the wall from u0 to u1 (its ends cut by `ca` / `cb`), v0–v1 up, w0–w1 across. */
function along(at: (u: number, v: number, w: number) => V3, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number, ca = SQUARE, cb = SQUARE): THREE.BufferGeometry {
  const P: V3[] = []
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const w = k ? w1 : w0
        P.push(at(i ? u1 - cb(w) : u0 + ca(w), j ? v1 : v0, w))
      }
  return block(P)
}

/** A bar from (u, v) p to q in the wall's upright plane, t thick in that plane, w0–w1 across. */
function bar(at: (u: number, v: number, w: number) => V3, p: Pt, q: Pt, t: number, w0: number, w1: number): THREE.BufferGeometry {
  const L = Math.hypot(q.x - p.x, q.y - p.y) || 1
  const n = { x: (-(q.y - p.y) / L) * (t / 2), y: ((q.x - p.x) / L) * (t / 2) }
  const P: V3[] = []
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const e = i ? q : p
        const s = j ? 1 : -1
        P.push(at(e.x + s * n.x, e.y + s * n.y, k ? w1 : w0))
      }
  return block(P)
}

/** A flat sheet along the wall at its centre line (one quad facing the wall's normal `n`; its material draws both sides), UVs in metres. */
function sheet(at: (u: number, v: number, w: number) => V3, n: Pt, u0: number, u1: number, v0: number, v1: number): THREE.BufferGeometry {
  const corners: [number, number][] = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]
  const order = [0, 1, 2, 0, 2, 3]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(order.flatMap((i) => at(corners[i][0], corners[i][1], 0)), 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(order.flatMap(() => [n.x, 0, n.y]), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(order.flatMap((i) => corners[i]), 2))
  return g
}

// ───────────────────────────── where a wall's ends stop ─────────────────────────────

const cross = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x
/** the walls other than w at w's end `end` */
const atEnd = (graph: Graph, w: Wall, end: 'a' | 'b') => graph.walls.filter((x) => x !== w && (x.a === w[end] || x.b === w[end]))
/** the way from w's vertex `id` along wall x, as a unit vector */
function away(graph: Pick<Unit, 'vertices'>, x: Wall, id: string): Pt {
  const f = core.wallFrame(x, graph.vertices)
  return x.a === id ? f.dir : { x: -f.dir.x, y: -f.dir.y }
}

/**
 * How a block along w (across it from its centre line, its own normal's side) ends at its end `end`: meeting ONE wall of its
 * kind (`mate`), cut on the line halving the angle between them (a mitre: the two meet face to face, any angle — the
 * bisector is exact when both are as wide); in line with one of several, straight on; meeting several and in line with none
 * (a T), stopped at their faces (`half`: how far across from its centre line a mate reaches); meeting no mate (a free end,
 * a full wall, a railing), run `open(the walls there)` past the corner (0: at the corner — inside what it meets).
 */
function endCut(graph: Graph, w: Wall, end: 'a' | 'b', mate: (x: Wall) => boolean, half: (x: Wall) => number, open: (others: Wall[]) => number): Cut {
  const others = atEnd(graph, w, end)
  const f = core.wallFrame(w, graph.vertices)
  const d = end === 'a' ? f.dir : { x: -f.dir.x, y: -f.dir.y } // (away from the corner along w)
  const mates = others.filter(mate)
  if (mates.length === 1) {
    const e = away(graph, mates[0], w[end])
    const m = { x: d.x + e.x, y: d.y + e.y }
    const ml = Math.hypot(m.x, m.y)
    if (ml < 1e-6) return SQUARE // in line: square, end to end
    const mm = { x: m.x / ml, y: m.y / ml }
    const c = -cross(mm, f.normal) / cross(mm, d) // (the point on the bisector at w across: c · w in along w)
    return Number.isFinite(c) && Math.abs(c) < 4 ? (x) => c * x : SQUARE // (a hairpin: square, no spike)
  }
  if (mates.length > 1) {
    if (mates.some((x) => { const e = away(graph, x, w[end]); return d.x * e.x + d.y * e.y < -0.999 })) return SQUARE
    const trim = Math.max(...mates.map((x) => half(x) / Math.max(0.35, Math.abs(cross(d, away(graph, x, w[end]))))))
    return () => Math.min(0.5, trim)
  }
  const past = open(others)
  return past ? () => -past : SQUARE
}

// ───────────────────────────── railings ─────────────────────────────

/** the stretches of w a railing runs along (u from its corner A): its length less its openings (a passage is a gate), stopped at the face of a solid wall at either end */
function spans(graph: Graph, w: Wall, L: number): [number, number][] {
  const stop = (end: 'a' | 'b') => {
    const id = w[end]
    const d = away(graph, w, id)
    const solid = atEnd(graph, w, end).filter((x) => x.heightM > 0.2 && !core.railOf(x))
    // (a wall going on in line from the corner ends there: the railing starts at its end)
    const face = (x: Wall) => {
      const e = away(graph, x, id)
      return d.x * e.x + d.y * e.y < -0.94 ? 0 : (x.thicknessM / 2 + (capped(x) ? CAP_P : 0)) / Math.max(0.35, Math.abs(cross(d, e)))
    }
    return Math.min(0.5, Math.max(0, ...solid.map(face)))
  }
  let runs: [number, number][] = [[stop('a'), L - stop('b')]]
  for (const o of w.openings) runs = runs.flatMap(([a, b]) => [[a, Math.min(b, o.offsetM)], [Math.max(a, o.offsetM + o.widthM), b]] as [number, number][])
  return runs.filter(([a, b]) => b - a > 0.05)
}

/** posts `p` wide along a stretch [a, b], one at each end and none further apart than `max` (centres) */
function posts([a, b]: [number, number], p: number, max: number): number[] {
  const len = b - a - p
  if (len <= 0) return [(a + b) / 2]
  const n = Math.max(1, Math.ceil(len / max))
  return [...Array(n + 1)].map((_, i) => a + p / 2 + (i * len) / n)
}

/** bars between each two posts (centres `at`), evenly, no two uprights' centres further apart than `max` */
function infill(at: number[], max: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < at.length; i++) {
    const D = at[i + 1] - at[i]
    const n = Math.max(0, Math.ceil(D / max - 1e-9) - 1)
    for (let j = 1; j <= n; j++) out.push(at[i] + (j * D) / (n + 1))
  }
  return out
}

/**
 * A low wall that is not plaster (core.railOf), built from its line and height H, one geometry per material; [] when it is
 * solid. Glass: 12 mm panes ≤ 1.25 m wide in a base channel, a steel cap rail. Railing: 45 mm posts ≤ 1.5 m apart, top and
 * bottom rails, 16 mm bars ≤ 11.5 cm apart (a child's head does not pass). Grille: a frame, 12 mm bars ≤ 10 cm apart and a
 * band of crossed flats at mid-height (the Dhaka MS grille). Timber: 90 mm posts, a handrail, 40 mm balusters. Fence:
 * 95 mm boards on two rails between posts ≤ 1.8 m. Chain-link: posts ≤ 2.5 m, a top rail, the wire mesh.
 */
export function railParts(w: Wall, graph: Graph): RailPart[] {
  const kind = core.railOf(w)
  if (!kind) return []
  const { L, f, at } = localOf(w, graph)
  const H = w.heightM
  const out = new Map<MaterialRef | THREE.Material, THREE.BufferGeometry[]>()
  const put = (m: MaterialRef | THREE.Material, g: THREE.BufferGeometry) => out.set(m, [...(out.get(m) ?? []), g])
  const box = (m: MaterialRef | THREE.Material, u0: number, u1: number, v0: number, v1: number, h: number) => v1 > v0 && put(m, along(at, u0, u1, v0, v1, -h, h))
  for (const s of spans(graph, w, L)) build(kind, s)
  return [...out].map(([m, gs]) => {
    const geo = mergeGeometries(gs)!
    gs.forEach((g) => g.dispose())
    return { m, geo }
  })

  function build(k: LowWallKind, s: [number, number]): void {
    const [a, b] = s
    if (k === 'glass') {
      const CH = Math.min(0.1, H / 3)
      box(RAIL_STEEL, a, b, 0, CH, 0.035)
      box(RAIL_STEEL, a, b, H - 0.045, H, 0.03)
      const gap = 0.012
      const n = Math.max(1, Math.ceil((b - a) / 1.25))
      const pw = (b - a - (n + 1) * gap) / n
      if (pw > 0.02) for (let i = 0; i < n; i++) box(GLAZING_GLASS, a + gap + i * (pw + gap), a + (i + 1) * (pw + gap), CH, H - 0.045, 0.006)
      return
    }
    if (k === 'railing' || k === 'timber') {
      const timber = k === 'timber'
      const m = timber ? RAIL_TIMBER : RAIL_STEEL
      const [P, TOP, BAR] = timber ? [0.09, 0.05, 0.04] : [0.045, 0.04, 0.016]
      const ps = posts(s, P, 1.5)
      for (const u of ps) box(m, u - P / 2, u + P / 2, 0, H - TOP, P / 2)
      box(m, a, b, H - TOP, H, timber ? 0.05 : 0.025)
      const [b0, b1] = timber ? [0.08, 0.125] : [0.07, 0.1]
      box(m, a, b, b0, b1, timber ? 0.035 : 0.015)
      for (const u of infill(ps, timber ? 0.12 : 0.115)) box(m, u - BAR / 2, u + BAR / 2, b1, H - TOP, BAR / 2)
      return
    }
    if (k === 'grille') {
      const P = 0.04
      const [lo, hi] = [0.075, H - 0.035]
      const ps = posts(s, P, 1.8)
      for (const u of ps) box(GRILLE_PAINT, u - P / 2, u + P / 2, 0, hi, P / 2)
      box(GRILLE_PAINT, a, b, hi, H, 0.02)
      box(GRILLE_PAINT, a, b, 0.04, lo, 0.02)
      const bars = infill(ps, 0.1)
      for (const u of bars) box(GRILLE_PAINT, u - 0.006, u + 0.006, lo, hi, 0.006)
      // the band: two flats at mid-height, crossed flats between each two bars (a row of diamonds)
      const mid = (lo + hi) / 2
      const [c0, c1] = [mid - 0.055, mid + 0.055]
      if (c0 - 0.015 <= lo || c1 + 0.015 >= hi) return
      box(GRILLE_PAINT, a, b, c0 - 0.015, c0, 0.012)
      box(GRILLE_PAINT, a, b, c1, c1 + 0.015, 0.012)
      const xs = [...new Set([...ps, ...bars])].sort((x, y) => x - y)
      for (let i = 0; i + 1 < xs.length; i++) {
        put(GRILLE_PAINT, bar(at, { x: xs[i], y: c0 }, { x: xs[i + 1], y: c1 }, 0.01, -0.005, 0.005))
        put(GRILLE_PAINT, bar(at, { x: xs[i], y: c1 }, { x: xs[i + 1], y: c0 }, 0.01, -0.005, 0.005))
      }
      return
    }
    if (k === 'fence') {
      const P = 0.08
      for (const u of posts(s, P, 1.8)) box(FENCE_TIMBER, u - P / 2, u + P / 2, 0, H, P / 2)
      // two rails behind the boards (one on a fence under 0.7 m), the boards in front: the frame shows from behind only
      for (const v of H >= 0.7 ? [0.2, H - 0.3] : [H / 2 - 0.04]) put(FENCE_TIMBER, along(at, a, b, v, v + 0.08, -0.039, -0.005))
      const n = Math.max(1, Math.round((b - a) / 0.11))
      const bw = (b - a) / n - 0.015
      for (let i = 0; i < n; i++) put(FENCE_TIMBER, along(at, a + i * (bw + 0.015) + 0.0075, a + i * (bw + 0.015) + 0.0075 + bw, 0.05, H - 0.02, -0.06, -0.04))
      return
    }
    // chain-link
    const P = 0.05
    for (const u of posts(s, P, 2.5)) box(FENCE_STEEL, u - P / 2, u + P / 2, 0, H, P / 2)
    box(FENCE_STEEL, a, b, H - 0.04, H, 0.02)
    if (H - 0.04 > 0.05) put(CHAIN_MESH, sheet(at, f.normal, a, b, 0.03, H - 0.04))
  }
}

// ───────────────────────────── caps and cornices ─────────────────────────────

/** a solid low wall a person drew: over a kerb, under a storey, plaster (no railOf) — it gets a cap */
export const capped = (w: Wall): boolean => core.takesLowKind(w) && !core.railOf(w)
/** the cap (coping): CAP_P proud of both faces, CAP_H deep, its top 5 mm over the wall's (no face shared with it) */
export const CAP_P = 0.025
export const CAP_H = 0.05
const CAP_UP = 0.005
/**
 * a cornice (Wall.cornice): its cap further out and 1 cm higher than a plain cap (where the two lap at a corner, no face
 * shared), two steps under it — [proud of the faces, from, to] below the wall's top
 */
const CORNICE: [number, number, number][] = [
  [0.06, -0.045, CAP_UP + 0.01],
  [0.035, -0.085, -0.045],
  [0.015, -0.115, -0.085],
]

/**
 * The cap of a solid low wall (capped), and under it its cornice's steps when it has one: one geometry, world space, foot at
 * 0; null for any other wall. Mitred where it meets one other capped wall of its height and cornice, stopped at the faces of
 * a T; where nothing as tall goes on (a free end, a railing, a lower wall) it runs its overhang past the end, over its end
 * face; over a capped wall of its height but another cornice, across that wall (the two lap); at a taller wall, it stops at
 * the corner — inside that wall.
 */
export function capGeometry(w: Wall, graph: Graph): THREE.BufferGeometry | null {
  if (!capped(w)) return null
  const { L, at } = localOf(w, graph)
  const H = w.heightM
  const T2 = w.thicknessM / 2
  const rows: [number, number, number][] = w.cornice ? CORNICE : [[CAP_P, CAP_UP - CAP_H, CAP_UP]]
  const level = (x: Wall) => Math.abs(x.heightM - H) < 0.01
  const mate = (x: Wall) => capped(x) && level(x) && !x.cornice === !w.cornice
  const parts = rows.map(([p, v0, v1]) => {
    const half = (x: Wall) => x.thicknessM / 2 + p
    const open = (xs: Wall[]) =>
      xs.every((x) => x.heightM < H - 0.01 || core.railOf(x)) ? p : xs.length === 1 && capped(xs[0]) && level(xs[0]) ? half(xs[0]) : 0
    const [ca, cb] = (['a', 'b'] as const).map((e) => endCut(graph, w, e, mate, half, open))
    return along(at, 0, L, H + v0, H + v1, -(T2 + p), T2 + p, ca, cb)
  })
  const g = mergeGeometries(parts)!
  parts.forEach((x) => x.dispose())
  return g
}

// ───────────────────────────── a balcony that stands out ─────────────────────────────

/** a balcony's slab edge: BAND_P proud of its front's outer face, from BAND_DOWN under its floor to BAND_UP over it */
export const BAND_P = 0.06
export const BAND_DOWN = 0.25
export const BAND_UP = 0.05
/** the drip under the edge: a 15 mm nib this far in from its front, so rain drops off before it runs back under the slab */
const DRIP_IN = 0.03

/**
 * The slab edge of every balcony of `unit` (a room of kind balcony) along its front — each of its walls under a storey
 * (a railing, a glass front, a parapet, an open edge) with no room of the unit beyond it — as one geometry, world space,
 * floor at 0: a band BAND_P past the wall's outer face, from BAND_DOWN under the floor to BAND_UP over it, a drip under it,
 * mitred round the front's corners (a curved balcony's short walls too). null: no balcony front.
 */
export function balconyEdges(unit: Unit, rooms: Room[]): THREE.BufferGeometry | null {
  const parts = balconyEdgeParts(unit, rooms).map(([, g]) => g)
  if (!parts.length) return null
  const g = mergeGeometries(parts)!
  parts.forEach((x) => x.dispose())
  return g
}

/** balconyEdges a front wall at a time: [the wall's id, its band and drip] — the building's Edges and caps dress each as its wall (three/building.ts). */
export function balconyEdgeParts(unit: Unit, rooms: Room[]): [string, THREE.BufferGeometry][] {
  const sideOf = new Map<string, number>()
  for (const r of rooms) {
    if (r.kind !== 'balcony') continue
    for (const id of new Set(r.wallIds)) {
      const w = unit.walls.find((x) => x.id === id)
      if (!w || w.heightM >= core.LOW_KIND_MAX_M) continue
      const f = core.wallFrame(w, unit.vertices)
      const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
      const off = w.thicknessM / 2 + 0.05
      const [front, back] = [1, -1].map((s) => core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, unit))
      if (!front !== !back) sideOf.set(w.id, front ? -1 : 1) // (the side with no room is outside)
    }
  }
  const out: [string, THREE.BufferGeometry][] = []
  const graph = { vertices: unit.vertices, walls: unit.walls }
  for (const [id, s] of sideOf) {
    const w = unit.walls.find((x) => x.id === id)!
    const { L, at } = localOf(w, graph)
    const far = w.thicknessM / 2 + BAND_P
    const mate = (x: Wall) => sideOf.has(x.id)
    const half = (x: Wall) => x.thicknessM / 2 + BAND_P
    const [ca, cb] = (['a', 'b'] as const).map((e) => endCut(graph, w, e, mate, half, () => 0))
    const across = (w0: number, w1: number): [number, number] => (s > 0 ? [w0, w1] : [-w1, -w0])
    const parts = [along(at, 0, L, -BAND_DOWN, BAND_UP, ...across(0, far), ca, cb), along(at, 0, L, -BAND_DOWN - 0.015, -BAND_DOWN, ...across(far - DRIP_IN - 0.015, far - DRIP_IN), ca, cb)]
    out.push([id, mergeGeometries(parts)!])
    parts.forEach((x) => x.dispose())
  }
  return out
}
