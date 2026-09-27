/**
 * Wave-16 solver: plan raster → an editable core Unit draft + the review list (the human 5 %).
 * GEOMETRY FIRST (founder, after the honest text scores): walls come from the ink (walls.ts); text (text.ts) and hints
 * (hints.ts, optional) only name rooms, anchor the scale and become size checks.
 *
 *   traceWalls → scale (printed dims ÷ the face they sit in | area label | the 5" partition prior) → re-trace at that
 *   wall width → metres → axis snap (real angles kept, arcs → chords) → close (join ends, extend onto walls, bridge
 *   facing ends ≤ 1.2 m, every opening guess = a bridge carrying the opening) → node (T / X splits) → prune spurs →
 *   5"/10" thickness → merge collinear (openings re-offset) → deriveRooms → pick the flat (grow from the click across
 *   partitions and doors; one entrance door out, never a second) → labels (text, else hint, else 'unlabelled')
 *   → opening kinds from the rooms on both sides → printed-size checks → validate (every leftover issue = review item).
 */
import { FT, deriveRooms, formatFeetInches, newId, pointInPolygon, polygonCentroid, roomInnerPolygon, roomPolygon, triangulate, validate } from '../core'
import type { Opening, OpeningKind, Room, RoomKind, RoomLabel, Unit, Vertex, Wall } from '../core'
import { EXTERIOR_M, PARTITION_M, WALL_HEIGHT_M, openingDefaults } from '../studio/model'
import { lineInk } from './raster'
import { normaliseName } from './text'
import { circle3, segPieces, traceWalls } from './walls'
import type { AutoTraceOpts, AutoTraceResult, AutoTraceStats, Gray, HintTrace, Px, ReviewItem, RoomHint, TextTrace, WallTrace } from './types'

/** Tuning knobs (metres unless said otherwise). */
export const KNOBS = {
  /** walls within this many degrees of the sheet's dominant axes are snapped onto them; others keep their angle */
  axisSnapDeg: 5,
  /** parallel axis walls whose centre lines differ by less than this are put on one line */
  trackM: 0.05,
  /** curved walls → chords with at most this sagitta */
  sagittaM: 0.1,
  /** wall ends closer than this × thickness are one corner */
  joinFrac: 0.75,
  /** a free end reaches onto a wall within this × thickness (a corner the thinning left open) */
  extendFrac: 1.5,
  /** facing free ends / a free end and a wall ahead are bridged across gaps up to this (railings, glass, missed doors) */
  bridgeM: 1.2,
  /** … and up to this along a clear drawn line (glazing, window bands, railings): at least inkShare of it inked */
  inkBridgeM: 6,
  /** a solid wall's free end runs on across open floor to the next wall up to this: the open-plan boundary a human draws */
  openPlanM: 4,
  inkShare: 0.75,
  /** "a clear drawn line": this many grey levels darker than the paper around it (tile grids and hatching are fainter) */
  lineDelta: 40,
  /** a single (not double) drawn line closes a room only from this long up, and only onto a wall's free end */
  singleLineM: 1,
  /** an unevidenced bridge at least this wide becomes a passage opening (a door the wall stage did not see) */
  passageM: 0.45,
  /** dangling walls shorter than this are dropped */
  spurM: 0.3,
  /** thickness ≥ this → 10" class, else 5" */
  thickM: 0.19,
  /** two printed dims agree on the scale within this share */
  dimsTol: 0.05,
  /** a face whose inner size differs from its printed size by more than this is a 'size-mismatch' */
  sizeTolM: 2 * 0.0254,
  /** faces bigger than this are never part of a flat (courtyards / the space between other flats) */
  maxRoomSqm: 90,
  /** a click in an open area floods at most this much floor to find the rooms around it */
  openFloodSqm: 50,
  /** faces smaller than this are closing artefacts: merged into a neighbour */
  sliverSqm: 0.3,
  /** sum of a flat's centreline faces ÷ its printed area (walls + common share are in the printed figure) */
  areaShare: 0.88,
  /** … and an area-label scale is used only within this share of the wall-thickness prior */
  areaTrust: 0.1,
}

type Pt = { x: number; y: number }
type GuessKind = OpeningKind | 'unknown'
interface Op {
  kind: GuessKind
  conf: number
  hinge?: Pt
  swingTo?: Pt
}
interface Seg {
  a: Pt
  b: Pt
  th: number
  conf: number
  op?: Op
  /** closed by the solver, not seen as a wall: 'ink' = along a thin line, 'gap' = over paper */
  bridge?: 'ink' | 'gap' | 'guess'
}

export interface SolveInputs {
  /** the wall stage's trace (default: traceWalls(gray)) */
  walls?: WallTrace
  text?: TextTrace
  hints?: HintTrace | null
  /** hints.ts findHints bound to the sheet: called once the scale is solved (its own wall-based scale is its weak spot) */
  findHints?: (pxPerM: number, walls: WallTrace) => HintTrace | null
  /** hints.ts propagateByColour bound to the sheet: per room (sheet px) a hint for the unnamed ones, from same-fill named rooms */
  propagate?: (rooms: { poly: Px[]; kind?: string }[]) => (RoomHint | null)[]
}

const d2 = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)
const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y })
const crs = (u: Pt, v: Pt) => u.x * v.y - u.y * v.x
const dot = (u: Pt, v: Pt) => u.x * v.x + u.y * v.y
const unit = (u: Pt): Pt => {
  const L = Math.hypot(u.x, u.y) || 1
  return { x: u.x / L, y: u.y / L }
}

// ───────────────────────────────────────────────────────────────── scale

/** px/m from the wall widths: the length-weighted commonest thickness is the 5" partition (or the 10" wall, if a mode sits at half of it). */
export function thicknessScale(walls: WallTrace['walls']): number {
  const bins = new Float64Array(400)
  for (const w of walls) {
    const L = d2(w.a, w.b)
    const b = Math.round(w.thicknessPx * 4)
    if (b > 0 && b < 400) bins[b] += L
  }
  const sm = (b: number) => (bins[b - 1] ?? 0) * 0.5 + bins[b] + (bins[b + 1] ?? 0) * 0.5
  let best = 1
  for (let b = 1; b < 399; b++) if (sm(b) > sm(best)) best = b
  const half = Math.round(best / 2)
  let halfPeak = 0
  for (let b = Math.round(half * 0.85); b <= Math.round(half * 1.15); b++) halfPeak = Math.max(halfPeak, sm(b))
  const partitionPx = halfPeak > 0.25 * sm(best) && half / 4 >= 2 ? half / 4 : best / 4
  return partitionPx / PARTITION_M
}

/** Rotate by −θ and take the bounding box: a face's width × depth along the sheet's axes. */
function extents(poly: Pt[], th0: number): { w: number; h: number } {
  const c = Math.cos(-th0), s = Math.sin(-th0)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of poly) {
    const x = p.x * c - p.y * s, y = p.x * s + p.y * c
    ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
  }
  return { w: x1 - x0, h: y1 - y0 }
}

/** Printed a × b against a face w × h: the better pairing's relative error and its scale factor (printed ÷ drawn). */
function matchDims(w: number, h: number, aM: number, bM: number): { err: number; f: number } {
  const p1 = [aM / w, bM / h], p2 = [bM / w, aM / h]
  const e = (p: number[]) => Math.abs(p[0] - p[1]) / ((p[0] + p[1]) / 2)
  const p = e(p1) <= e(p2) ? p1 : p2
  return { err: e(p), f: (p[0] + p[1]) / 2 }
}

// ───────────────────────────────────────────────────────────────── graph building (metres)

/** Dominant wall direction mod 90° (length-weighted, 0.5° bins, smoothed). */
function dominantAxis(segs: Seg[]): number {
  const bins = new Float64Array(180)
  for (const s of segs) {
    const a = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)
    const m = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)
    bins[Math.round((m / (Math.PI / 2)) * 180) % 180] += d2(s.a, s.b)
  }
  let best = 0, bv = -1
  for (let i = 0; i < 180; i++) {
    let v = 0
    for (let k = -3; k <= 3; k++) v += bins[(i + k + 180) % 180] * (1 - Math.abs(k) / 4)
    if (v > bv) (bv = v), (best = i)
  }
  const th = (best / 180) * (Math.PI / 2)
  return th > Math.PI / 4 ? th - Math.PI / 2 : th
}

/** Near-axis walls onto the axes (about their midpoints), then parallel axis walls on (almost) the same line onto one line. */
function snapAxes(segs: Seg[], th0: number): void {
  const tol = (KNOBS.axisSnapDeg * Math.PI) / 180
  const axes = [0, 1].map((k) => ({ x: Math.cos(th0 + (k * Math.PI) / 2), y: Math.sin(th0 + (k * Math.PI) / 2) }))
  const axisOf: (number | null)[] = []
  for (const s of segs) {
    const L = d2(s.a, s.b)
    const u = unit(sub(s.b, s.a))
    let got: number | null = null
    for (const k of [0, 1]) {
      const c = Math.abs(dot(u, axes[k]))
      if (c >= Math.cos(tol)) {
        got = k
        const sg = Math.sign(dot(u, axes[k]))
        const m = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
        s.a = { x: m.x - (axes[k].x * sg * L) / 2, y: m.y - (axes[k].y * sg * L) / 2 }
        s.b = { x: m.x + (axes[k].x * sg * L) / 2, y: m.y + (axes[k].y * sg * L) / 2 }
      }
    }
    axisOf.push(got)
  }
  // tracks: cluster the perpendicular coordinate of each axis family, length-weighted mean
  for (const k of [0, 1]) {
    const n = axes[1 - k] // the normal of family k
    const fam = segs.map((s, i) => ({ s, i, c: dot(s.a, n), L: d2(s.a, s.b) })).filter((x) => axisOf[x.i] === k).sort((p, q) => p.c - q.c)
    for (let i = 0; i < fam.length; ) {
      let j = i + 1
      while (j < fam.length && fam[j].c - fam[j - 1].c < KNOBS.trackM) j++
      const grp = fam.slice(i, j)
      const W = grp.reduce((t, x) => t + x.L, 0) || 1
      const c = grp.reduce((t, x) => t + x.c * x.L, 0) / W
      for (const { s, c: c0 } of grp) {
        const dc = c - c0
        s.a = { x: s.a.x + n.x * dc, y: s.a.y + n.y * dc }
        s.b = { x: s.b.x + n.x * dc, y: s.b.y + n.y * dc }
      }
      i = j
    }
  }
}

/** Least-squares meeting point of several lines (point + unit direction), null when they are near-parallel. */
function meet(lines: { p: Pt; u: Pt }[]): Pt | null {
  let a = 0, b = 0, c = 0, r1 = 0, r2 = 0
  for (const { p, u } of lines) {
    const nx = -u.y, ny = u.x, k = nx * p.x + ny * p.y
    ;(a += nx * nx), (b += nx * ny), (c += ny * ny), (r1 += nx * k), (r2 += ny * k)
  }
  const det = a * c - b * b
  if (det < 0.03 * lines.length * lines.length * 0.25) return null
  return { x: (r1 * c - r2 * b) / det, y: (a * r2 - b * r1) / det }
}

type End = { s: Seg; e: 'a' | 'b' }
const other = (x: End) => (x.e === 'a' ? x.s.b : x.s.a)
const outDir = (x: End) => unit(sub(x.s[x.e], other(x)))

/** Wall ends closer than joinFrac × thickness become one corner: the lines' meeting point, else their mean. */
function joinEnds(segs: Seg[]): void {
  const ends: End[] = segs.flatMap((s) => [{ s, e: 'a' as const }, { s, e: 'b' as const }])
  const parent = ends.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      if (ends[i].s === ends[j].s) continue
      const tol = KNOBS.joinFrac * Math.max(ends[i].s.th, ends[j].s.th)
      if (d2(ends[i].s[ends[i].e], ends[j].s[ends[j].e]) <= tol) parent[find(i)] = find(j)
    }
  const groups = new Map<number, End[]>()
  ends.forEach((x, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), x]))
  for (const g of groups.values()) {
    if (g.length < 2) continue
    const lines = g.filter((x) => d2(x.s.a, x.s.b) > 0.05).map((x) => ({ p: x.s[x.e], u: outDir(x) }))
    const mean = { x: g.reduce((t, x) => t + x.s[x.e].x, 0) / g.length, y: g.reduce((t, x) => t + x.s[x.e].y, 0) / g.length }
    const m = meet(lines)
    const at = m && d2(m, mean) < 2 * Math.max(...g.map((x) => x.s.th)) ? m : mean
    for (const x of g) x.s[x.e] = { ...at }
  }
}

const ekey = (p: Pt) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`
function degrees(segs: Seg[]): Map<string, number> {
  const deg = new Map<string, number>()
  for (const s of segs) for (const p of [s.a, s.b]) deg.set(ekey(p), (deg.get(ekey(p)) ?? 0) + 1)
  return deg
}

/** Ray from a free end: the first wall centre line it meets within `reach` (walls may be extended by `slack` at their ends). */
function rayHit(segs: Seg[], x: End, reach: number, slack: number, d = outDir(x)): { u: number; t: Seg; v: number; X: Pt } | null {
  const p = x.s[x.e]
  let best: { u: number; t: Seg; v: number; X: Pt } | null = null
  for (const t of segs) {
    if (t === x.s) continue
    const tv = sub(t.b, t.a), Lt = Math.hypot(tv.x, tv.y)
    if (Lt < 1e-6) continue
    const cr = crs(d, tv)
    if (Math.abs(cr) < Math.sin((25 * Math.PI) / 180) * Lt) continue
    const w = sub(t.a, p)
    const u = crs(w, tv) / cr
    const v = crs(w, d) / cr
    if (u < -0.5 * x.s.th || u > reach) continue
    if (v < -slack / Lt || v > 1 + slack / Lt) continue
    if (!best || u < best.u) best = { u, t, v, X: { x: p.x + u * d.x, y: p.y + u * d.y } }
  }
  return best
}

/** Free ends reach onto a wall a thickness or so away (corners and T's the thinning left open). */
function extendEnds(segs: Seg[]): void {
  const deg = degrees(segs)
  for (const s of segs.slice())
    for (const e of ['a', 'b'] as const) {
      if (deg.get(ekey(s[e])) !== 1 || d2(s.a, s.b) < 0.05) continue
      const x = { s, e }
      const hit = rayHit(segs, x, KNOBS.extendFrac * s.th + 0.02, KNOBS.extendFrac * s.th)
      if (!hit) continue
      const old = ekey(s[e])
      if (hit.v < 0 || hit.v > 1) {
        const te = hit.v < 0 ? 'a' : 'b'
        if (deg.get(ekey(hit.t[te])) === 1) {
          deg.set(ekey(hit.t[te]), 0)
          hit.t[te] = { ...hit.X }
        } else hit.X = { ...hit.t[te] }
      }
      deg.set(old, 0)
      s[e] = { ...hit.X }
      deg.set(ekey(hit.X), (deg.get(ekey(hit.X)) ?? 0) + 2)
    }
}

/** The share of `n` samples along p→q (middle 80 %) that have thin line ink within 1 px — px space. */
function inkAlong(ink: Uint8Array, w: number, h: number, p0: Px, q0: Px, off = 0): number {
  const L = d2(p0, q0)
  const n = Math.max(4, Math.round(L / 2))
  const nx = -(q0.y - p0.y) / (L || 1), ny = (q0.x - p0.x) / (L || 1)
  const p = { x: p0.x + nx * off, y: p0.y + ny * off }, q = { x: q0.x + nx * off, y: q0.y + ny * off }
  let hit = 0
  for (let i = 0; i < n; i++) {
    const f = 0.1 + (0.8 * (i + 0.5)) / n
    const x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f
    let got = 0
    for (const o of [-1, 0, 1]) {
      const xi = Math.round(x + nx * o), yi = Math.round(y + ny * o)
      if (xi >= 0 && yi >= 0 && xi < w && yi < h && ink[yi * w + xi]) got = 1
    }
    hit += got
  }
  return hit / n
}

/** Distance from p to segment ab (clamped). */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const v = sub(b, a), L2 = dot(v, v) || 1
  const t = Math.max(0, Math.min(1, dot(sub(p, a), v) / L2))
  return d2(p, { x: a.x + v.x * t, y: a.y + v.y * t })
}

/**
 * Long straight thin lines on the sheet's axes (px): glazing, window bands, railings, light exterior outlines — the wall
 * stage drops them (too thin, too light). Kept when both ends touch a traced wall and the line is not a wall's own edge;
 * a single line (not a double) only when it is long and one end closes onto a wall's free end — a counter or wardrobe
 * front runs between two walls' middles instead.
 * ponytail: axis-aligned sheets only (a rotated scan skips this); a Hough pass if rotated scans show up.
 */
function thinLines(mask: Uint8Array, w: number, h: number, walls: WallTrace['walls'], k: number): { a: Px; b: Px }[] {
  const minPx = 0.6 * k, bandPx = Math.max(3, 0.3 * k), touch = 0.3 * k
  const out: { a: Px; b: Px }[] = []
  const ends = walls.flatMap((wl) => [wl.a, wl.b])
  const freeEnds = ends.filter((p) => ends.filter((q) => d2(p, q) < 2).length === 1)
  for (const horiz of [true, false]) {
    const U = horiz ? w : h, N = horiz ? h : w
    const runs: { v: number; u0: number; u1: number }[] = []
    for (let v = 0; v < N; v++) {
      let u0 = -1, gap = 0
      for (let u = 0; u <= U; u++) {
        const on = u < U && (horiz ? mask[v * w + u] : mask[u * w + v])
        if (on) {
          if (u0 < 0) u0 = u
          gap = 0
        } else if (u0 >= 0 && ++gap > 2) {
          if (u - gap - u0 >= minPx) runs.push({ v, u0, u1: u - gap })
          ;(u0 = -1), (gap = 0)
        }
      }
    }
    runs.sort((p, q) => p.v - q.v || p.u0 - q.u0)
    const used = new Uint8Array(runs.length)
    for (let i = 0; i < runs.length; i++) {
      if (used[i]) continue
      const band = [runs[i]]
      used[i] = 1
      for (let j = i + 1; j < runs.length && runs[j].v - runs[i].v <= bandPx; j++) {
        const r = runs[j], s = runs[i]
        if (!used[j] && Math.min(s.u1, r.u1) - Math.max(s.u0, r.u0) >= 0.7 * Math.min(s.u1 - s.u0, r.u1 - r.u0)) (used[j] = 1), band.push(r)
      }
      const vs = [...new Set(band.map((r) => r.v))].sort((p, q) => p - q)
      let lines = 1
      for (let t = 1; t < vs.length; t++) if (vs[t] - vs[t - 1] >= 2) lines++
      const med = (xs: number[]) => xs.sort((p, q) => p - q)[xs.length >> 1]
      const v = (vs[0] + vs[vs.length - 1]) / 2, u0 = med(band.map((r) => r.u0)), u1 = med(band.map((r) => r.u1))
      const a = horiz ? { x: u0, y: v } : { x: v, y: u0 }, b = horiz ? { x: u1, y: v } : { x: v, y: u1 }
      // both ends on a wall; not the two edges of a wall already traced (most of it within the wall's band)
      if (![a, b].every((p) => walls.some((wl) => segDist(p, wl.a, wl.b) <= touch + wl.thicknessPx / 2))) continue
      if (lines < 2 && (d2(a, b) < KNOBS.singleLineM * k || ![a, b].some((p) => freeEnds.some((q) => d2(p, q) <= touch)))) continue
      let onWall = 0
      for (let t = 0; t < 10; t++) {
        const p = { x: a.x + ((b.x - a.x) * (t + 0.5)) / 10, y: a.y + ((b.y - a.y) * (t + 0.5)) / 10 }
        if (walls.some((wl) => segDist(p, wl.a, wl.b) <= wl.thicknessPx / 2 + bandPx / 2)) onWall++
      }
      if (onWall <= 3) out.push({ a, b })
    }
  }
  return out
}

/**
 * Free ends still open. Short gaps (≤ bridgeM): to a facing free end on the same run, or to the first wall ahead —
 * along thin ink (railing, glass, parapet line) the bridge is a solid wall, over paper a missed door / open side.
 * Long gaps (≤ inkBridgeM) only along a clear drawn line (glazing, window bands, railings the wall stage found too
 * faint): ahead, or sideways from the end (a glass side between two walls' ends). Shortest candidates first.
 */
function bridgeGaps(segs: Seg[], weakInk: (a: Pt, b: Pt) => number, lineInk: (a: Pt, b: Pt, th: number) => number): void {
  const deg = degrees(segs)
  const ends: End[] = segs.flatMap((s) => (['a', 'b'] as const).filter((e) => deg.get(ekey(s[e])) === 1 && d2(s.a, s.b) >= 0.05).map((e) => ({ s, e })))
  const cands: { x: End; y?: End; q: Pt; L: number; th: number; drawn: boolean; open?: boolean; corner?: Pt }[] = []
  // an open-plan boundary guess: a solid drawn wall (not a scrap) running on across open floor to the next wall
  const solid = (s: Seg) => s.conf >= 0.5 && !s.bridge && d2(s.a, s.b) >= 0.6
  const inked = (p: Pt, q: Pt, th: number) => lineInk(p, q, th) >= KNOBS.inkShare
  for (let i = 0; i < ends.length; i++) {
    const x = ends[i], p = x.s[x.e], d = outDir(x)
    // facing pairs (a gap in one wall run)
    for (let j = i + 1; j < ends.length; j++) {
      const y = ends[j], q = y.s[y.e]
      const v = sub(q, p), L = Math.hypot(v.x, v.y)
      if (L < 0.02 || L > KNOBS.inkBridgeM) continue
      const dy = outDir(y)
      if (Math.abs(crs(d, dy)) > Math.sin(Math.PI / 3)) {
        // two walls that should meet at a corner but both stop short: run both on to where their lines cross
        const cr = crs(d, dy), u = crs(v, dy) / cr, t = crs(v, d) / cr
        if (u > 0.02 && t > 0.02 && u <= KNOBS.bridgeM && t <= KNOBS.bridgeM)
          cands.push({ x, y, q, L: u + t, th: Math.max(x.s.th, y.s.th), drawn: false, corner: { x: p.x + d.x * u, y: p.y + d.y * u } })
        continue
      }
      if (dot(d, dy) > -0.94) continue
      // a scrap's blob-sized 'thickness' must not widen the run: the lateral slack is the thinner wall's, capped
      if (dot(d, v) <= 0 || Math.abs(crs(d, v)) > Math.min(0.25, 0.75 * Math.min(x.s.th, y.s.th))) continue
      const th = Math.max(x.s.th, y.s.th)
      if (L <= KNOBS.bridgeM || inked(p, q, th)) cands.push({ x, y, q, L, th, drawn: L > KNOBS.bridgeM })
      else if (L <= KNOBS.openPlanM && solid(x.s) && solid(y.s)) cands.push({ x, y, q, L, th, drawn: false, open: true })
    }
    // ahead, then sideways
    for (const [dir, side] of [[d, false], [{ x: -d.y, y: d.x }, true], [{ x: d.y, y: -d.x }, true]] as const) {
      const hit = rayHit(segs, x, KNOBS.inkBridgeM, side ? 1.5 * x.s.th : 0, dir)
      if (!hit || hit.u < (side ? 0.3 : 0.02)) continue
      if ((!side && hit.u <= KNOBS.bridgeM) || inked(p, hit.X, x.s.th)) cands.push({ x, q: hit.X, L: hit.u, th: x.s.th, drawn: side || hit.u > KNOBS.bridgeM })
      else if (!side && hit.u <= KNOBS.openPlanM && solid(x.s)) cands.push({ x, q: hit.X, L: hit.u, th: x.s.th, drawn: false, open: true })
    }
  }
  cands.sort((p, q) => p.L + (p.open ? KNOBS.openPlanM : 0) - q.L - (q.open ? KNOBS.openPlanM : 0)) // guesses last
  const used = new Set<string>()
  for (const c of cands) {
    const p = c.x.s[c.x.e]
    const kp = ekey(p), kq = c.y ? ekey(c.q) : ''
    if (used.has(kp) || (c.y && used.has(kq))) continue
    used.add(kp)
    if (c.y) used.add(kq)
    for (const [a, b] of c.corner ? [[p, c.corner], [c.q, c.corner]] : [[p, c.q]]) {
      const L = d2(a, b)
      const kind: Seg['bridge'] = c.drawn || weakInk(a, b) >= 0.6 ? 'ink' : 'gap'
      const op: Op | undefined = kind === 'gap' && L >= KNOBS.passageM ? { kind: 'passage', conf: c.open ? 0.1 : 0.2 } : undefined
      segs.push({ a: { ...a }, b: { ...b }, th: c.th, conf: 0.3, bridge: kind, op })
    }
  }
}

/** Split every segment at every crossing and every end lying on it; merge points within `tol`; drop zero / duplicate pieces. */
function node(segs: Seg[], tol: number): Seg[] {
  const cuts: number[][] = segs.map(() => [])
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], sv = sub(s.b, s.a), Ls = Math.hypot(sv.x, sv.y)
    if (Ls < 1e-9) continue
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j], tv = sub(t.b, t.a), Lt = Math.hypot(tv.x, tv.y)
      if (Lt < 1e-9) continue
      const cr = crs(sv, tv)
      if (Math.abs(cr) < 1e-9 * Ls * Lt || Math.abs(cr) / (Ls * Lt) < 0.02) {
        // (near-)parallel: an end of one lying on the other (overlaps become duplicates, dropped below)
        const onto = (A: Seg, LA: number, p: Pt, into: number[]) => {
          const av = sub(A.b, A.a), w = sub(p, A.a)
          const u = dot(w, av) / LA
          if (Math.abs(crs(av, w)) / LA <= tol && u > tol && u < LA - tol) into.push(u / LA)
        }
        for (const p of [t.a, t.b]) onto(s, Ls, p, cuts[i])
        for (const p of [s.a, s.b]) onto(t, Lt, p, cuts[j])
        continue
      }
      const w = sub(t.a, s.a)
      const u = crs(w, tv) / cr, v = crs(w, sv) / cr
      const eu = tol / Ls, ev = tol / Lt
      if (u < -eu || u > 1 + eu || v < -ev || v > 1 + ev) continue
      if (u * Ls > tol && (1 - u) * Ls > tol) cuts[i].push(u)
      if (v * Lt > tol && (1 - v) * Lt > tol) cuts[j].push(v)
    }
  }
  const out: Seg[] = []
  segs.forEach((s, i) => {
    const ts = [0, ...cuts[i].sort((p, q) => p - q), 1]
    const at = (t: number) => ({ x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t })
    for (let k = 0; k + 1 < ts.length; k++) if (ts[k + 1] - ts[k] > 1e-9) out.push({ ...s, a: at(ts[k]), b: at(ts[k + 1]) })
  })
  // point merge (grid hash + union-find)
  const pts: Pt[] = out.flatMap((s) => [s.a, s.b])
  const parent = pts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const grid = new Map<string, number[]>()
  const cell = (p: Pt) => [Math.floor(p.x / tol), Math.floor(p.y / tol)]
  pts.forEach((p, i) => {
    const [cx, cy] = cell(p)
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) if (d2(p, pts[j]) <= tol) parent[find(i)] = find(j)
    grid.set(`${cx},${cy}`, [...(grid.get(`${cx},${cy}`) ?? []), i])
  })
  const rep = new Map<number, Pt>()
  pts.forEach((p, i) => {
    const r = find(i)
    if (!rep.has(r)) rep.set(r, p) // the first point of a cluster stays (keeps axis alignment)
  })
  const seen = new Map<string, Seg>()
  out.forEach((s, k) => {
    s.a = rep.get(find(2 * k))!
    s.b = rep.get(find(2 * k + 1))!
  })
  for (const s of out) {
    if (s.a === s.b || d2(s.a, s.b) < 1e-6) continue
    const ka = ekey(s.a), kb = ekey(s.b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    const dup = seen.get(key)
    // a drawn wall beats a bridge; an opening beats none
    if (!dup || (dup.bridge && !s.bridge) || (!dup.op && s.op && !!dup.bridge === !!s.bridge)) seen.set(key, s)
  }
  return [...seen.values()]
}

/** Drop dangling walls shorter than spurM (thinning hairs, text left-overs), repeatedly. */
function pruneSpurs(segs: Seg[]): Seg[] {
  for (;;) {
    const deg = degrees(segs)
    const keep = segs.filter((s) => !((deg.get(ekey(s.a)) === 1 || deg.get(ekey(s.b)) === 1) && d2(s.a, s.b) < Math.max(KNOBS.spurM, 2 * s.th)))
    if (keep.length === segs.length) return keep
    segs = keep
  }
}

/** Segments → core vertices / walls (each bridge opening spans its whole piece). */
function toUnitGraph(segs: Seg[]): { vertices: Vertex[]; walls: (Wall & { conf: number; bridge?: Seg['bridge']; guess?: Map<string, Op> })[] } {
  const ids = new Map<string, Vertex>()
  const vid = (p: Pt) => {
    const k = ekey(p)
    if (!ids.has(k)) ids.set(k, { id: newId(), x: p.x, y: p.y })
    return ids.get(k)!.id
  }
  const walls = segs.map((s) => {
    const L = d2(s.a, s.b)
    const openings: Opening[] = s.op ? [{ id: newId(), kind: s.op.kind === 'unknown' ? 'passage' : s.op.kind, offsetM: 0, widthM: L, heightM: 0, sillM: 0 }] : []
    const guess = new Map<string, Op>(s.op ? [[openings[0].id, s.op]] : [])
    return { id: newId(), a: vid(s.a), b: vid(s.b), thicknessM: s.th >= KNOBS.thickM ? EXTERIOR_M : PARTITION_M, heightM: WALL_HEIGHT_M, openings, conf: s.conf, bridge: s.bridge, guess }
  })
  return { vertices: [...ids.values()], walls }
}

type GWall = ReturnType<typeof toUnitGraph>['walls'][number]

/** Merge two walls meeting end to end in a straight line at a corner nothing else uses (same thickness); openings re-offset, touching ones of one kind fused. */
function mergeCollinear(vertices: Vertex[], walls: GWall[]): { vertices: Vertex[]; walls: GWall[] } {
  const V = new Map(vertices.map((v) => [v.id, v]))
  let ws = walls.slice()
  for (let changed = true; changed; ) {
    changed = false
    const at = new Map<string, GWall[]>()
    for (const w of ws) for (const v of [w.a, w.b]) at.set(v, [...(at.get(v) ?? []), w])
    for (const [vid, list] of at) {
      if (list.length !== 2) continue
      const [p, q] = list
      if (p.thicknessM !== q.thicknessM || p === q) continue
      const A = p.a === vid ? p.b : p.a, B = q.a === vid ? q.b : q.a
      if (A === B) continue
      const va = V.get(A)!, vm = V.get(vid)!, vb = V.get(B)!
      const u1 = unit(sub(vm, va)), u2 = unit(sub(vb, vm))
      if (dot(u1, u2) < Math.cos((1.5 * Math.PI) / 180)) continue
      const L1 = d2(va, vm), L2 = d2(vm, vb)
      // openings along A→B
      const along = (w: GWall, from: string, L: number, base: number) =>
        w.openings.map((o) => ({ ...o, offsetM: base + (w.a === from ? o.offsetM : L - o.offsetM - o.widthM) }))
      const ops = [...along(p, A, L1, 0), ...along(q, vid, L2, L1)].sort((x, y) => x.offsetM - y.offsetM)
      const fused: Opening[] = []
      for (const o of ops) {
        const last = fused[fused.length - 1]
        if (last && last.kind === o.kind && o.offsetM - (last.offsetM + last.widthM) < 0.01) last.widthM = o.offsetM + o.widthM - last.offsetM
        else fused.push({ ...o })
      }
      const guess = new Map([...(p.guess ?? []), ...(q.guess ?? [])])
      // a fused opening keeps the first part's guess
      const merged: GWall = { ...p, id: newId(), a: A, b: B, openings: fused, conf: Math.min(p.conf, q.conf), bridge: p.bridge && q.bridge ? p.bridge : undefined, guess }
      ws = ws.filter((w) => w !== p && w !== q)
      ws.push(merged)
      V.delete(vid)
      changed = true
      break
    }
  }
  return { vertices: vertices.filter((v) => V.has(v.id)), walls: ws }
}

// ───────────────────────────────────────────────────────────────── the draft

interface Draft {
  unit: Unit
  walls: GWall[]
  rooms: Room[]
  th0: number
}

/** WallTrace (px) → a noded, pruned, merged wall graph in metres (origin = `originPx`). */
export function buildGraph(trace: WallTrace, pxPerM: number, originPx: Px, gray: Gray, ink?: { weak: Uint8Array; line: Uint8Array }): Draft {
  const toM = (p: Px): Pt => ({ x: (p.x - originPx.x) / pxPerM, y: (p.y - originPx.y) / pxPerM })
  const toPx = (p: Pt): Px => ({ x: originPx.x + p.x * pxPerM, y: originPx.y + p.y * pxPerM })
  const segs: Seg[] = []
  for (const w of trace.walls) {
    const th = w.thicknessPx / pxPerM
    if (!w.mid) {
      segs.push({ a: toM(w.a), b: toM(w.b), th, conf: w.conf })
      continue
    }
    // curved wall → chords with sagitta ≤ sagittaM: a chord of angle φ on radius r bows r(1 − cos φ/2)
    const c = circle3(w.a, w.mid, w.b)
    const pieces = segPieces(w, 64)
    let n = 2
    if (c) {
      const r = c.r / pxPerM
      const sweep = pieces.reduce((t, p) => t + d2(p.a, p.b), 0) / c.r
      const phi = r > KNOBS.sagittaM ? 2 * Math.acos(1 - KNOBS.sagittaM / r) : Math.PI
      n = Math.max(2, Math.ceil(sweep / phi))
    }
    for (const pc of segPieces(w, n)) segs.push({ a: toM(pc.a), b: toM(pc.b), th, conf: w.conf })
  }
  // opening guesses = bridges carrying the opening; thickness of the wall they continue
  for (const o of trace.openings) {
    let th = PARTITION_M, bd = Infinity
    for (const w of trace.walls)
      for (const p of [w.a, w.b]) {
        const d = Math.min(d2(p, o.a), d2(p, o.b))
        if (d < bd) (bd = d), (th = w.thicknessPx / pxPerM)
      }
    segs.push({ a: toM(o.a), b: toM(o.b), th, conf: o.conf, bridge: 'guess', op: { kind: o.kind, conf: o.conf, hinge: o.hingeAt && toM(o.hingeAt), swingTo: o.swingTo && toM(o.swingTo) } })
  }
  const th0 = dominantAxis(segs.filter((s) => !s.bridge))
  const { weak, line } = ink ?? inkMasks(gray)
  // glazing / window bands / railings: double thin lines between two walls, too faint for the wall stage
  if (Math.abs(th0) < (2 * Math.PI) / 180)
    for (const l of thinLines(line, gray.width, gray.height, trace.walls, pxPerM)) segs.push({ a: toM(l.a), b: toM(l.b), th: PARTITION_M, conf: 0.4, bridge: 'ink', op: { kind: 'window', conf: 0.4 } })
  snapAxes(segs, th0)
  joinEnds(segs)
  extendEnds(segs)
  const W = gray.width, H = gray.height
  bridgeGaps(
    segs,
    (p, q) => inkAlong(weak, W, H, toPx(p), toPx(q)),
    (p, q, th) => {
      // the drawn line may sit anywhere across the wall's width: best lateral offset
      let best = 0
      const r = Math.max(1, Math.round((th * pxPerM) / 2))
      for (let o = -r; o <= r && best < 1; o++) best = Math.max(best, inkAlong(line, W, H, toPx(p), toPx(q), o))
      return best
    },
  )
  let noded = pruneSpurs(node(segs, 0.02))
  noded = noded.filter((s) => d2(s.a, s.b) > 0.01)
  const g = toUnitGraph(noded)
  const m = mergeCollinear(g.vertices, g.walls)
  const unit: Unit = {
    id: newId(),
    projectName: '',
    name: 'Auto-trace draft',
    northDeg: 0,
    vertices: m.vertices,
    walls: m.walls.map(stripWall),
    roomLabels: [],
    furniture: [],
    finishSlots: [],
    areaSqft: 0,
    planImage: { src: '', pxPerM, originPx },
  }
  return { unit, walls: m.walls, rooms: deriveRooms(unit), th0 }
}

export const inkMasks = (gray: Gray) => ({ weak: lineInk(gray, 18), line: lineInk(gray, KNOBS.lineDelta) })

const stripWall = (w: GWall): Wall => ({ id: w.id, a: w.a, b: w.b, thicknessM: w.thicknessM, heightM: w.heightM, openings: w.openings })

// ───────────────────────────────────────────────────────────────── picking the flat

/**
 * The walls a flood from `at` over open floor touches (walls as barriers, 0.1 m cells, within `R` m): the rooms
 * around an area whose own walls did not close — e.g. an open-plan living / dining the click landed in.
 */
function openNeighbours(d: Draft, at: Pt, R = 9): Set<string> {
  const cell = 0.1, n = Math.ceil((2 * R) / cell)
  const x0 = at.x - R, y0 = at.y - R
  const grid = new Int32Array(n * n).fill(-1)
  const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
  d.walls.forEach((w, wi) => {
    const a = V.get(w.a)!, b = V.get(w.b)!
    const steps = Math.ceil(d2(a, b) / (cell / 2)) + 1
    const r = Math.max(1, Math.round(w.thicknessM / 2 / cell))
    for (let k = 0; k <= steps; k++) {
      const cx = Math.floor((a.x + ((b.x - a.x) * k) / steps - x0) / cell), cy = Math.floor((a.y + ((b.y - a.y) * k) / steps - y0) / cell)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy
          if (x >= 0 && y >= 0 && x < n && y < n) grid[y * n + x] = wi
        }
    }
  })
  const touched = new Set<string>()
  const start = Math.floor(R / cell) * n + Math.floor(R / cell)
  if (grid[start] >= 0) return touched
  const seen = new Uint8Array(n * n)
  const queue = [start]
  seen[start] = 1
  // breadth first, at most openFloodSqm of floor: the open room fills first; what leaks on down a corridor stops early
  for (let head = 0; head < queue.length && head < KNOBS.openFloodSqm / (cell * cell); head++) {
    const i = queue[head]
    const x = i % n, y = (i / n) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy
      if (X < 0 || Y < 0 || X >= n || Y >= n || (X - n / 2) ** 2 + (Y - n / 2) ** 2 > (n / 2) ** 2) continue
      const j = Y * n + X
      if (grid[j] >= 0) touched.add(d.walls[grid[j]].id)
      else if (!seen[j]) (seen[j] = 1), queue.push(j)
    }
  }
  return touched
}

/**
 * Faces of the flat: from the clicked face, grow across partitions (5") and walls with a door / passage / slider;
 * a door in a 10" wall is the entrance — the face behind it (the lobby) joins, but grows no further. A click in an
 * open area starts from every room around it.
 */
function pickFlat(d: Draft, at: Pt | null, core: Pt[] = [], budgetSqm = Infinity, names: { p: Pt; name: string }[] = []): { rooms: Set<Room>; open: boolean } {
  const byWall = new Map<string, Room[]>()
  for (const r of d.rooms) for (const w of r.wallIds) byWall.set(w, [...(byWall.get(w) ?? []), r])
  const W = new Map(d.walls.map((w) => [w.id, w]))
  const polys = new Map(d.rooms.map((r) => [r, roomPolygon(r, d.unit)]))
  const ok = (r: Room) => r.areaSqm <= KNOBS.maxRoomSqm
  const grow = (starts: Room[], entrance: boolean): Set<Room> => {
    const cost = new Map<Room, number>(starts.map((r) => [r, 0]))
    const queue = [...starts]
    while (queue.length) {
      const r = queue.shift()!
      const c = cost.get(r)!
      if (c > 0) continue // the lobby behind the entrance grows no further
      if (core.some((p) => pointInPolygon(p, polys.get(r)!))) continue // nor does a face labelled lobby / lift / stair
      for (const wid of new Set(r.wallIds)) {
        const w = W.get(wid)!
        const walk = w.openings.some((o) => o.kind !== 'window')
        const thin = w.thicknessM < KNOBS.thickM
        // a window looks out: the veranda / planter beyond joins, but is no way on (planters run past two flats)
        const window = w.openings.some((o) => o.kind === 'window')
        if (!thin && !walk && !window) continue
        const step = thin && !window ? 0 : 1
        if (step && !entrance) continue
        for (const n of byWall.get(wid) ?? []) {
          if (n === r || !ok(n) || (cost.get(n) ?? Infinity) <= c + step) continue
          cost.set(n, c + step)
          if (step) queue.push(n)
          else queue.unshift(n)
        }
      }
    }
    return new Set(cost.keys())
  }
  if (at) {
    // nearest rooms first up to the printed flat area: what leaks round the core into the next flat is farther away
    const cap = (rs: Set<Room>) => {
      let sum = 0
      return new Set([...rs].sort((p, q) => d2(p.centroid, at) - d2(q.centroid, at)).filter((r) => (sum += r.areaSqm) - r.areaSqm < budgetSqm))
    }
    // a one-per-flat name printed twice in the region (two LIVINGs, two BED 3s): the far one is the next flat's — every
    // face fewer rooms away from it than from the click goes with it
    const split = (rs: Set<Room>, starts: Room[]): Set<Room> => {
      const faceAt = (p: Pt) => [...rs].filter((r) => pointInPolygon(p, polys.get(r)!)).sort((a, b) => a.areaSqm - b.areaSqm)[0]
      const byName = new Map<string, Set<Room>>()
      for (const l of names) {
        const f = faceAt(l.p)
        if (f) byName.set(l.name, (byName.get(l.name) ?? new Set()).add(f))
      }
      const rivals = [...byName.values()].flatMap((fs) => [...fs].sort((a, b) => d2(a.centroid, at) - d2(b.centroid, at)).slice(1)).filter((r) => !starts.includes(r))
      if (!rivals.length) return rs
      const hops = (from: Room[]) => {
        const h = new Map(from.map((r) => [r, 0]))
        for (let i = 0, q = [...from]; i < q.length; i++)
          for (const w of q[i].wallIds) for (const n of byWall.get(w) ?? []) if (rs.has(n) && !h.has(n)) h.set(n, h.get(q[i])! + 1), q.push(n)
        return h
      }
      const hp = hops(starts), hr = hops(rivals)
      return new Set([...rs].filter((r) => (hp.get(r) ?? Infinity) <= (hr.get(r) ?? Infinity)))
    }
    let hit: Room | null = null
    for (const r of d.rooms) if (pointInPolygon(at, polys.get(r)!) && (!hit || r.areaSqm < hit.areaSqm)) hit = r
    if (hit) return { rooms: ok(hit) ? cap(split(grow([hit], true), [hit])) : new Set(), open: false }
    const touched = openNeighbours(d, at)
    const starts = d.rooms.filter((r) => ok(r) && r.wallIds.some((w) => touched.has(w)))
    return { rooms: starts.length ? cap(split(grow(starts, true), starts)) : new Set(), open: true }
  }
  // no click: the largest closed region (grown the same way, without the entrance step)
  let best = new Set<Room>(), bestA = 0
  const seen = new Set<Room>()
  for (const r of d.rooms) {
    if (seen.has(r) || !ok(r)) continue
    const g = grow([r], false)
    g.forEach((x) => seen.add(x))
    const A = [...g].reduce((t, x) => t + x.areaSqm, 0)
    if (A > bestA) (bestA = A), (best = g)
  }
  return { rooms: best, open: false }
}

/**
 * Slivers (faces under sliverSqm, or strips under ~0.2 m wide) are closing artefacts, not rooms: take out one of their
 * walls — one shared with a neighbour, the solver's own bridges first, then the longest — so they merge away.
 */
function dropSlivers(d: Draft): Draft {
  for (let it = 0; it < 100; it++) {
    const rooms = deriveRooms(d.unit)
    const perim = (r: Room) => {
      const p = roomPolygon(r, d.unit)
      return p.reduce((t, q, i) => t + d2(q, p[(i + 1) % p.length]), 0)
    }
    const s = rooms.find((r) => r.areaSqm < KNOBS.sliverSqm || r.areaSqm / perim(r) < 0.1)
    if (!s) return d
    const uses = new Map<string, number>()
    for (const r of rooms) for (const w of new Set(r.wallIds)) uses.set(w, (uses.get(w) ?? 0) + 1)
    const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
    const len = (w: GWall) => d2(V.get(w.a)!, V.get(w.b)!)
    const cands = d.walls.filter((w) => s.wallIds.includes(w.id))
    const score = (w: GWall) => (uses.get(w.id)! > 1 ? 4 : 0) + (w.bridge ? 2 : 0) + len(w) / 100
    const cut = cands.reduce((b, w) => (score(w) > score(b) ? w : b))
    const walls = d.walls.filter((w) => w !== cut)
    const used = new Set(walls.flatMap((w) => [w.a, w.b]))
    const m = mergeCollinear(d.unit.vertices.filter((v) => used.has(v.id)), walls)
    d = { ...d, unit: { ...d.unit, vertices: m.vertices, walls: m.walls.map(stripWall) }, walls: m.walls }
  }
  return { ...d, rooms: deriveRooms(d.unit) }
}

/** Keep only the picked faces' walls (+ loose walls inside them), re-merge, re-derive. */
function restrict(d: Draft, keep: Set<Room>): Draft {
  const ids = new Set([...keep].flatMap((r) => r.wallIds))
  const polys = [...keep].map((r) => roomPolygon(r, d.unit))
  const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
  for (const w of d.walls) {
    const a = V.get(w.a)!, b = V.get(w.b)!
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (!ids.has(w.id) && polys.some((p) => pointInPolygon(mid, p))) ids.add(w.id)
  }
  const walls = d.walls.filter((w) => ids.has(w.id))
  const used = new Set(walls.flatMap((w) => [w.a, w.b]))
  const m = mergeCollinear(d.unit.vertices.filter((v) => used.has(v.id)), walls)
  const unit: Unit = { ...d.unit, vertices: m.vertices, walls: m.walls.map(stripWall) }
  return { unit, walls: m.walls, rooms: deriveRooms(unit), th0: d.th0 }
}

// ───────────────────────────────────────────────────────────────── labels, openings, checks

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
const KIND_NAME: Record<RoomKind, string> = { bed: 'Bed', living: 'Living', dining: 'Dining', kitchen: 'Kitchen', bath: 'Toilet', balcony: 'Veranda', study: 'Study', closet: 'Closet', utility: 'Utility', shaft: 'Shaft', other: 'Space' }

/** A point strictly inside the room and in no smaller room (label anchor). */
function insidePoint(r: Room, u: Unit, rooms: Room[], prefer?: Pt): Pt {
  const poly = roomPolygon(r, u)
  const smaller = rooms.filter((o) => o !== r && o.areaSqm < r.areaSqm).map((o) => roomPolygon(o, u))
  const good = (p: Pt) => pointInPolygon(p, poly) && !smaller.some((s) => pointInPolygon(p, s))
  if (prefer && good(prefer)) return prefer
  const c = polygonCentroid(poly)
  if (good(c)) return c
  const tri = triangulate(poly)
  let best = c, bestA = -1
  for (let i = 0; i + 2 < tri.length; i += 3) {
    const [p, q, s] = [poly[tri[i]], poly[tri[i + 1]], poly[tri[i + 2]]]
    const A = Math.abs(crs(sub(q, p), sub(s, p)))
    const m = { x: (p.x + q.x + s.x) / 3, y: (p.y + q.y + s.y) / 3 }
    if (A > bestA && good(m)) (bestA = A), (best = m)
  }
  return best
}

const OP_CONF_OK = 0.5

/**
 * Plan raster + the stage outputs → the draft. Pure (no OCR here): `solve` runs the stages, the eval feeds cached ones.
 */
export function solveTraces(gray: Gray, inputs: SolveInputs, opts: AutoTraceOpts = {}): AutoTraceResult {
  const t0 = performance.now()
  const review: ReviewItem[] = []
  const text = inputs.text ?? { items: [] }
  let trace = inputs.walls ?? traceWalls(gray)
  const ink = inkMasks(gray)
  opts.onProgress?.('scale', 0.5)

  // ── scale
  let pxPerM = opts.pxPerM ?? thicknessScale(trace.walls)
  let scaleFrom: AutoTraceStats['scaleFrom'] = opts.pxPerM ? 'given' : 'thickness'
  const origin0 = { x: 0, y: 0 }
  let draft = buildGraph(trace, pxPerM, origin0, gray, ink)
  // the building core's labels (lobby, lifts, stair) and planter strips: part of the draft when reached, never a way
  // into the next flat
  const coreAt = (k: number) =>
    text.items
      .filter((it) => it.kind === 'room' && (it.green || /\b(LOBBY|LIFTS?|STAIRS?|HOISTWAY|CORE)\b/.test(normaliseName(it.text.split('\n')[0]))))
      .map((it) => ({ x: (it.box.x + it.box.w / 2) / k, y: (it.box.y + it.box.h / 2) / k }))
  // names a flat has once (LIVING, KITCHEN, numbered BED 3 / TOILET 2): a second one belongs to the next flat
  const namesAt = (k: number) =>
    text.items
      .filter((it) => it.kind === 'room')
      .map((it) => ({ p: { x: (it.box.x + it.box.w / 2) / k, y: (it.box.y + it.box.h / 2) / k }, name: normaliseName(it.text.split('\n')[0]) }))
      .filter((l) => /\d|\b(LIVING|DINING|KITCHEN|FOYER)\b/.test(l.name) && !/\b(AOD|LIFTS?|STAIRS?|LOBBY|VER|VERANDAH?)\b/.test(l.name))
  // the printed flat area nearest the click ("TYPE-A ±2736 SFT"), m²; the sheet title's figure when it is the only one
  const budget = ((): number => {
    const areas = text.items.filter((it) => it.kind === 'area' && it.areaSqm)
    if (!areas.length) return Infinity
    const at = opts.pickPx ?? { x: 0, y: 0 }
    const dist = (it: (typeof areas)[number]) => Math.hypot(it.box.x + it.box.w / 2 - at.x, it.box.y + it.box.h / 2 - at.y)
    return areas.reduce((b, it) => (dist(it) < dist(b) ? it : b)).areaSqm!
  })()
  const pickM = (k: number, o: Px) => (opts.pickPx ? { x: (opts.pickPx.x - o.x) / k, y: (opts.pickPx.y - o.y) / k } : null)
  if (!opts.pxPerM) {
    const polys = draft.rooms.map((r) => ({ r, inner: roomInnerPolygon(r, draft.unit), poly: roomPolygon(r, draft.unit) }))
    const fs: number[] = []
    for (const it of text.items) {
      if (!it.dims) continue
      const c = { x: (it.box.x + it.box.w / 2) / pxPerM, y: (it.box.y + it.box.h / 2) / pxPerM }
      let f: (typeof polys)[number] | null = null
      for (const p of polys) if (pointInPolygon(c, p.poly) && (!f || p.r.areaSqm < f.r.areaSqm)) f = p
      if (!f) continue
      const e = extents(f.inner, draft.th0)
      const m = matchDims(e.w, e.h, it.dims.aM, it.dims.bM)
      if (m.err <= KNOBS.dimsTol) fs.push(m.f)
    }
    fs.sort((p, q) => p - q)
    const med = fs[fs.length >> 1]
    const agree = fs.filter((f) => Math.abs(f / med - 1) <= KNOBS.dimsTol)
    if (agree.length >= 2) {
      // printed = drawn × f (metres at the provisional scale) → the true px/m is pxPerM / f
      pxPerM = pxPerM / (agree.reduce((t, f) => t + f, 0) / agree.length)
      scaleFrom = 'dims'
    } else {
      const areas = text.items.filter((it) => it.kind === 'area' && it.areaSqm)
      const flat = pickFlat(draft, pickM(pxPerM, origin0), coreAt(pxPerM)).rooms // uncapped: the budget is this same label
      const drawn = [...flat].reduce((t, r) => t + r.areaSqm, 0)
      if (areas.length && drawn > 0) {
        // the area label whose scale is closest to the wall prior
        const ks = areas.map((a) => pxPerM * Math.sqrt(drawn / (a.areaSqm! * KNOBS.areaShare)))
        const k = ks.reduce((b, x) => (Math.abs(Math.log(x / pxPerM)) < Math.abs(Math.log(b / pxPerM)) ? x : b))
        // the picked region is only as good as its walls: trust the label near the wall prior only (else the prior stays)
        if (Math.abs(Math.log(k / pxPerM)) < Math.log(1 + KNOBS.areaTrust)) {
          pxPerM = k
          scaleFrom = 'area'
        }
      }
    }
  }
  // re-trace at the scale's wall width when it moved (the wall stage's own width guess is its weakest link)
  const halfPx = (PARTITION_M / 2) * pxPerM
  if (Math.abs(pxPerM / thicknessScale(trace.walls) - 1) > 0.15) trace = traceWalls(gray, { halfPx })
  let hints = inputs.hints ?? null
  try {
    hints ??= inputs.findHints?.(pxPerM, trace) ?? null
  } catch {
    hints = null // a hint stage failure never costs the draft
  }
  opts.onProgress?.('graph', 0.7)

  // ── graph at the final scale, the flat, then its own origin
  draft = buildGraph(trace, pxPerM, origin0, gray, ink)
  const pick = pickM(pxPerM, origin0)
  const picked = pickFlat(draft, pick, coreAt(pxPerM), budget, namesAt(pxPerM))
  let flat = picked.rooms
  if (picked.open) review.push({ id: newId(), at: pick!, kind: 'unclosed', message: 'The clicked area is open — its walls did not close (open plan, glass or a railing the tracer missed). Draw the missing wall.' })
  if (!flat.size) flat = new Set(draft.rooms.filter((r) => r.areaSqm <= KNOBS.maxRoomSqm && (!pick || d2(r.centroid, pick) < 10)))
  if (flat.size) draft = dropSlivers(restrict(draft, flat))
  // shift so the draft starts near (0, 0)
  const xs = draft.unit.vertices.map((v) => v.x), ys = draft.unit.vertices.map((v) => v.y)
  const shift = xs.length ? { x: Math.min(...xs), y: Math.min(...ys) } : { x: 0, y: 0 }
  const originPx = { x: origin0.x + shift.x * pxPerM, y: origin0.y + shift.y * pxPerM }
  draft.unit.vertices = draft.unit.vertices.map((v) => ({ ...v, x: v.x - shift.x, y: v.y - shift.y }))
  for (const r of review) r.at = { x: r.at.x - shift.x, y: r.at.y - shift.y } // items raised before the shift
  draft.unit.planImage = { src: '', pxPerM, originPx }
  const u = draft.unit
  const rooms = deriveRooms(u)
  const toM = (p: Px): Pt => ({ x: (p.x - originPx.x) / pxPerM, y: (p.y - originPx.y) / pxPerM })
  const G = new Map(draft.walls.map((w) => [w.id, w]))
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  opts.onProgress?.('labels', 0.85)

  // ── labels: text inside the face, else a hint, else 'unlabelled'
  const polys = new Map(rooms.map((r) => [r.id, roomPolygon(r, u)]))
  const faceOf = (p: Pt): Room | null => {
    let f: Room | null = null
    for (const r of rooms) if (pointInPolygon(p, polys.get(r.id)!) && (!f || r.areaSqm < f.areaSqm)) f = r
    return f
  }
  const labelsIn = new Map<string, typeof text.items>()
  for (const it of text.items) {
    if (it.kind !== 'room' || !it.roomKind) continue
    const f = faceOf(toM({ x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 }))
    if (f) labelsIn.set(f.id, [...(labelsIn.get(f.id) ?? []), it])
  }
  const hintsIn = new Map<string, RoomHint[]>()
  for (const h of hints?.hints ?? []) {
    const f = faceOf(toM(h.at))
    if (f && h.kind) hintsIn.set(f.id, [...(hintsIn.get(f.id) ?? []), h])
  }
  /**
   * The hints in a face vote (sum of conf). A basin / sink never names a room by itself: Bangladeshi dining areas have a
   * hand-wash basin (founder), kitchens a sink — it only backs up a WC / shower.
   */
  const washOnly = (h: RoomHint) => /basin|sink/i.test(h.what ?? '')
  const vote = (all: RoomHint[]): RoomHint | null => {
    const hs = all.some((h) => !washOnly(h)) ? all : []
    const w = new Map<string, number>()
    for (const h of hs) w.set(h.kind!, (w.get(h.kind!) ?? 0) + h.conf * (washOnly(h) ? 0.4 : 1))
    const best = [...w].sort((p, q) => q[1] - p[1])[0]
    return best ? hs.filter((h) => h.kind === best[0]).sort((p, q) => q.conf - p.conf)[0] : null
  }
  const count = new Map<string, number>()
  const roomLabels: RoomLabel[] = []
  let labelled = 0
  const dimsOf = new Map<string, { aM: number; bM: number }>()
  const kindOf = new Map<Room, RoomKind>()
  const fromHint = (r: Room, h: RoomHint) => {
    const kind = h.kind as RoomKind
    kindOf.set(r, kind)
    const n = (count.get(kind) ?? 0) + 1
    count.set(kind, n)
    const at = insidePoint(r, u, rooms)
    const id = newId()
    roomLabels.push({ id, name: h.green ? 'Planter' : `${KIND_NAME[kind]} ${n}`, kind, ...at })
    labelled++
    const what = h.source === 'colour' ? 'the fill colour of named rooms' : h.source === 'green' ? 'the green (planter) fill' : (h.what ?? 'a drawn fixture')
    review.push({ id: newId(), at, kind: 'low-confidence', message: `Room type guessed from ${what} — check`, entityId: id })
  }
  const pending: Room[] = []
  for (const r of rooms) {
    const items = (labelsIn.get(r.id) ?? []).sort((p, q) => Number(!!q.dims) - Number(!!p.dims) || q.conf - p.conf)
    const it = items[0]
    if (it) {
      const at = insidePoint(r, u, rooms, toM({ x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 }))
      const id = newId()
      const name = titleCase(normaliseName(it.text.split('\n')[0]).replace(/\s+([.-])\s*/g, '$1').replace(/\.+$/, '')) || KIND_NAME[it.roomKind as RoomKind]
      // a misread size ("511X517" → 5'-11" × 51'-7") is no size: rooms are 0.6–12 m a side
      const dims = it.dims && Math.min(it.dims.aM, it.dims.bM) >= 0.6 && Math.max(it.dims.aM, it.dims.bM) <= 12 ? it.dims : undefined
      roomLabels.push({ id, name, kind: it.roomKind as RoomKind, ...at, ...(dims ? { printedSize: `${formatFeetInches(dims.aM)} × ${formatFeetInches(dims.bM)}` } : {}) })
      if (dims) dimsOf.set(id, dims)
      kindOf.set(r, it.roomKind as RoomKind)
      labelled++
      const names = new Set(items.map((x) => normaliseName(x.text.split('\n')[0])))
      if (names.size > 1) review.push({ id: newId(), at, kind: 'unclosed', message: `${[...names].map(titleCase).join(' and ')} fall in one space — a wall between them is probably missing`, entityId: id })
      continue
    }
    pending.push(r)
  }
  // founder rule: the printed label decides; without one, the fill colour of label-named rooms (Banani-style sheets),
  // then a drawn fixture / green fill — both flagged for a check; else 'other' + unlabelled
  if (pending.length && inputs.propagate) {
    const toPxP = (p: Pt): Px => ({ x: originPx.x + p.x * pxPerM, y: originPx.y + p.y * pxPerM })
    const got = inputs.propagate(rooms.map((r) => ({ poly: polys.get(r.id)!.map(toPxP), kind: kindOf.get(r) })))
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = got[rooms.indexOf(pending[i])]
      if (h?.kind) fromHint(pending[i], h), pending.splice(i, 1)
    }
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    const h = vote(hintsIn.get(pending[i].id) ?? [])
    if (h) fromHint(pending[i], h), pending.splice(i, 1)
  }
  for (const r of pending) {
    const n = (count.get('other') ?? 0) + 1
    count.set('other', n)
    const at = insidePoint(r, u, rooms)
    const id = newId()
    roomLabels.push({ id, name: `Space ${n}`, kind: 'other', ...at })
    if (r.areaSqm >= 0.5) review.push({ id: newId(), at, kind: 'unlabelled', message: `Unnamed space (${r.areaSqm.toFixed(1)} m²) — name it or delete a wall`, entityId: id })
  }
  u.roomLabels = roomLabels
  const named = deriveRooms(u)
  // basins / sinks outside wet rooms: kept as fixture positions (the dining area's hand-wash basin), not as a room kind
  const fixtures: NonNullable<AutoTraceStats['fixtures']> = []
  for (const h of hints?.hints ?? []) {
    if (!washOnly(h)) continue
    const at = toM(h.at)
    const f = named.filter((r) => pointInPolygon(at, roomPolygon(r, u))).sort((p, q) => p.areaSqm - q.areaSqm)[0]
    if (f && f.kind !== 'bath') fixtures.push({ what: f.kind === 'kitchen' ? 'sink' : 'hand-wash basin', at, roomId: f.id })
  }

  // ── opening kinds from the rooms on both sides
  const side = new Map<string, Room[]>()
  for (const r of named) for (const w of r.wallIds) side.set(w, [...(side.get(w) ?? []), r])
  for (const w of u.walls) {
    const g = G.get(w.id)
    const rs = [...new Set(side.get(w.id) ?? [])]
    const kinds = rs.map((r) => r.kind)
    const outside = rs.length < 2
    const a = V.get(w.a)!, b = V.get(w.b)!
    const dir = unit(sub(b, a)), nrm = { x: -dir.y, y: dir.x }
    w.openings = w.openings.flatMap((o) => {
      if (o.widthM < 0.3) return []
      const gs = g?.guess?.get(o.id)
      let kind: OpeningKind = o.kind
      const wet = kinds.includes('bath')
      const veranda = kinds.includes('balcony')
      // one room only: the outside (or an unclosed open area — then the review item says so)
      if (gs?.kind === 'window' || (outside && (kind !== 'door' || wet))) kind = 'window'
      if (veranda && o.widthM >= 1.2 && !outside) kind = 'slider'
      if (!outside && kind === 'passage' && o.widthM <= 1.1 && !kinds.includes('other')) kind = 'door'
      const conf = gs?.conf ?? 0.2
      const def = openingDefaults(kind, wet)
      const op: Opening = { ...o, kind, heightM: def.heightM, sillM: def.sillM }
      if (kind === 'door') {
        const mid = o.offsetM + o.widthM / 2
        // the guess's points are in the pre-shift metres
        const sh = (p: Pt): Pt => ({ x: p.x - shift.x, y: p.y - shift.y })
        op.hinge = gs?.hinge && dot(sub(sh(gs.hinge), a), dir) > mid ? 'b' : 'a'
        op.swing = gs?.swingTo && dot(sub(sh(gs.swingTo), a), nrm) > 0 ? 'out' : 'in'
      }
      if (conf < OP_CONF_OK || gs?.kind !== kind) {
        const m = o.offsetM + o.widthM / 2
        const at = { x: a.x + dir.x * m, y: a.y + dir.y * m }
        const why = !gs ? 'a gap with nothing drawn in it' : gs.kind === kind ? 'faint evidence' : gs.kind === 'unknown' ? `no clear symbol, rooms say ${kind}` : `drawn like a ${gs.kind}, rooms say ${kind}`
        review.push({ id: newId(), at, kind: 'opening-guess', message: `${titleCase(kind)} ${formatFeetInches(o.widthM)} wide? (${why})`, entityId: o.id })
      }
      return [op]
    })
  }

  // ── printed sizes: the face's inner size along the sheet's axes vs the label's dims
  for (const r of named) {
    const dm = dimsOf.get(r.id)
    if (!dm) continue
    const e = extents(roomInnerPolygon(r, u), draft.th0)
    const pair = Math.abs(e.w - dm.aM) + Math.abs(e.h - dm.bM) <= Math.abs(e.w - dm.bM) + Math.abs(e.h - dm.aM) ? [dm.aM, dm.bM] : [dm.bM, dm.aM]
    if (Math.abs(e.w - pair[0]) > KNOBS.sizeTolM || Math.abs(e.h - pair[1]) > KNOBS.sizeTolM)
      review.push({ id: newId(), at: r.centroid, kind: 'size-mismatch', message: `${r.name}: drawn ${formatFeetInches(e.w)} × ${formatFeetInches(e.h)}, printed ${formatFeetInches(pair[0])} × ${formatFeetInches(pair[1])}`, entityId: r.id })
  }

  // ── loose ends, low-confidence bridges, scale
  const deg = new Map<string, number>()
  for (const w of u.walls) for (const v of [w.a, w.b]) deg.set(v, (deg.get(v) ?? 0) + 1)
  for (const [vid, n] of deg) if (n === 1) review.push({ id: newId(), at: V.get(vid)!, kind: 'unclosed', message: 'A wall ends here without meeting another — close it or delete it', entityId: vid })
  for (const w of draft.walls)
    if (w.bridge === 'ink' && !w.openings.length && d2(V.get(w.a)!, V.get(w.b)!) >= 0.6) {
      const a = V.get(w.a)!, b = V.get(w.b)!
      review.push({ id: newId(), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'low-confidence', message: 'Closed along a thin line — railing, glass or a window?', entityId: w.id })
    }
  if (scaleFrom !== 'dims' && scaleFrom !== 'given')
    review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'scale', message: scaleFrom === 'area' ? 'Scale from the printed flat area — check one printed length' : 'Scale guessed from the wall thickness (5" partitions) — set it from one printed length' })

  // ── validate: fix what can be fixed, the rest goes to the list
  fixAndReport(u, review)
  const areaItem = text.items.find((it) => it.kind === 'area' && it.areaSqm)
  u.areaSqft = Math.round(areaItem ? areaItem.areaSqm! / (FT * FT) : named.reduce((t, r) => t + r.areaSqm, 0) / (FT * FT))
  if (hints?.northDeg !== undefined) u.northDeg = hints.northDeg
  opts.onProgress?.('done', 1)
  return {
    unit: u,
    review,
    stats: { ms: Math.round(performance.now() - t0), pxPerM, scaleFrom, walls: u.walls.length, rooms: named.length, labelled, ...(fixtures.length ? { fixtures } : {}) },
  }
}

/** validate(): drop broken openings / duplicate walls / stray labels; every issue left becomes a review item. */
function fixAndReport(u: Unit, review: ReviewItem[]): void {
  for (const is of validate(u)) {
    if (is.code === 'opening-out-of-bounds' || is.code === 'openings-overlap') {
      const drop = new Set(is.ids.slice(is.code === 'openings-overlap' ? 2 : 1))
      u.walls = u.walls.map((w) => (w.id === is.ids[0] ? { ...w, openings: w.openings.filter((o) => !drop.has(o.id)) } : w))
    } else if (is.code === 'duplicate-wall' || is.code === 'zero-length-wall') u.walls = u.walls.filter((w) => w.id !== is.ids[0])
    else if (is.code === 'label-outside-any-room') u.roomLabels = u.roomLabels.filter((l) => l.id !== is.ids[0])
  }
  for (const w of u.walls) {
    const L = d2(u.vertices.find((v) => v.id === w.a)!, u.vertices.find((v) => v.id === w.b)!)
    w.openings = w.openings.map((o) => ({ ...o, widthM: Math.min(o.widthM, L - Math.max(0, o.offsetM)), offsetM: Math.max(0, o.offsetM) }))
  }
  const used = new Set(u.walls.flatMap((w) => [w.a, w.b]))
  u.vertices = u.vertices.filter((v) => used.has(v.id))
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  for (const is of validate(u)) {
    if (is.level !== 'error') continue
    const w = u.walls.find((x) => x.id === is.ids[0])
    const p = w ? V.get(w.a)! : { x: 0, y: 0 }
    review.push({ id: newId(), at: { x: p.x, y: p.y }, kind: 'other', message: is.message, entityId: is.ids[0] })
  }
}

// ───────────────────────────────────────────────────────────────── entry

/** hints.ts's API (hints agent, wave 16) as the solver uses it; typed here so the solver builds with or without the file. */
type HintsModule = {
  findHints?: (gray: Gray, rgb?: AutoTraceOpts['rgb'], o?: { pxPerM?: number; walls?: WallTrace }) => HintTrace
  propagateByColour?: (rgb: NonNullable<AutoTraceOpts['rgb']>, trace: HintTrace, rooms: { poly: Px[]; kind?: string }[]) => (RoomHint | null)[]
}
/** hints.ts: loaded when it exists (Vite resolves the glob at build time), skipped when not. */
const HINTS = import.meta.glob<HintsModule>('./hints.ts')

export async function solve(gray: Gray, opts: AutoTraceOpts): Promise<AutoTraceResult> {
  const review: ReviewItem[] = []
  opts.onProgress?.('walls', 0)
  const walls = traceWalls(gray)
  opts.onProgress?.('text', 0.15)
  let text: TextTrace = { items: [] }
  try {
    const { readText } = await import('./text')
    text = await readText(gray)
    if (opts.ai) text = await (await import('./ai')).askAi(text, gray, opts.ai)
  } catch (e) {
    review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'other', message: `Could not read the printed text (${(e as Error).message}) — rooms stay unnamed` })
  }
  const load = HINTS['./hints.ts']
  const m: HintsModule = load ? await load().catch(() => ({})) : {}
  let hints: HintTrace | null = null
  const inputs: SolveInputs = {
    walls,
    text,
    findHints: m.findHints && ((pxPerM, w) => (hints = m.findHints!(gray, opts.rgb, { pxPerM, walls: w }))),
    propagate: m.propagateByColour && opts.rgb ? (rooms) => (hints ? m.propagateByColour!(opts.rgb!, hints, rooms) : rooms.map(() => null)) : undefined,
  }
  const r = solveTraces(gray, inputs, opts)
  if (text.glyphPx !== undefined && text.glyphPx < 7)
    review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'other', message: `The print is small (${text.glyphPx.toFixed(0)} px letters) — a larger export or the PDF reads far better` })
  return { ...r, review: [...review, ...r.review] }
}
