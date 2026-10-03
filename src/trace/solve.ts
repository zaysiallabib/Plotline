/**
 * Wave-16 solver: plan raster → an editable core Unit draft + the review list (the human 5 %).
 * GEOMETRY FIRST (founder, after the honest text scores): walls come from the ink (walls.ts); text (text.ts) and hints
 * (hints.ts, optional) only name rooms, anchor the scale and become size checks.
 *
 * Founder workflow (2026-09-28), in this order: (1) text first — read, then erase the glyph boxes; (2) plant sections —
 * planter / green / foliage strips marked (planterMask); (3) start in the middle — the flat grows from the click
 * (floodFlat) until nothing is left to follow; (4) whatever interrupts a thick wall is ignored and the same wall
 * resumes (resumeWalls); a door arc = door, glazing in a wall gap = window (+ rule 5 blue glazing, rule 6 stairs).
 *
 *   traceWalls → scale (printed dims ÷ the face they sit in | area label | the 5" partition prior) → re-trace at that
 *   wall width → metres → axis snap (real angles kept, arcs → chords) → glazing between walls (grey profile / blue
 *   line; never stair treads) → join ends → prune hairs → free ends follow their thick ink onto the next wall →
 *   rule-4 resume → node → merge collinear → deriveRooms → pick the flat (flood from the click; the outside, planters
 *   and stairs bound it; rival names split it) → labels (text, else hint, else 'unlabelled') → opening kinds from the
 *   rooms on both sides → printed-size checks → validate (every leftover issue = review item).
 *
 * Wave 19, tracker 'tracks' (the default): ONE draft from walls on tracks + rooms fitted from their printed sizes —
 *   traceWalls (tracks: exact walls, openings only on drawn evidence, undecided gaps left open) → scale = the rooms'
 *   printed sizes on the ink (rooms.ts calibrateScale; the guesses above are the fallback) → fitRooms (edges snap to the
 *   track faces) → merge.ts roomsOnTracks (room edges decide undecided gaps, add what no track has: walls, openings,
 *   low walls along railings / planter edges, open-plan passages; the rest is review) → faces.ts (lever 2: the faces only
 *   thin ink or plant green closes — AODs, planters, service verandas — as LOW walls, flagged) → the graph → the flat =
 *   the fitted rooms around the click (pickByRooms) ∪ the flood from it, bounded by the next flat's / the core's rooms,
 *   ± the thin-line faces against it (thinFacesOfFlat) → labels → checks (+ room-edge stretches left open, the rooms'
 *   area sum vs the printed sft, sizes to type).
 */
import { FT, deriveRooms, formatFeetInches, newId, pointInPolygon, polygonCentroid, roomInnerPolygon, roomPolygon, triangulate, validate } from '../core'
import type { Opening, OpeningKind, Room, RoomKind, RoomLabel, Unit, Vertex, Wall } from '../core'
import { EXTERIOR_M, PARTITION_M, WALL_HEIGHT_M, openingDefaults } from '../studio/model'
import { FACES, thinFaces, withWalls, type ThinFaces } from './faces'
import { roomsOnTracks, type RoomsOnTracks } from './merge'
import { edt, lineInk, threshold } from './raster'
import { calibrateScale, fitRooms, type RoomFit, type Side } from './rooms'
import { normaliseName } from './text'
import { trackThin } from './track'
import { circle3, glazing, inkThreshold, segPieces, thicknessOf, traceWalls, wallHalfWidth } from './walls'
import type { AutoTraceOpts, AutoTraceResult, AutoTraceStats, Gray, HintTrace, Px, ReviewItem, RoomHint, TextTrace, WallSeg, WallTrace } from './types'

/** Tuning knobs (metres unless said otherwise). */
export const KNOBS = {
  /** erase the read text's thin strokes from the raster before tracing walls */
  eraseText: true,
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
  /** founder rule 4: a thick wall interrupted by anything but a door arc / glazing resumes as the same wall across up to this */
  resumeM: 2.4,
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
  /** follow thin strokes from dangling wall ends (track.ts) */
  track: false,
  /**
   * Founder, 2026-09-28 (scope for this stage): trace only walls + door arcs (+ windows drawn in a wall gap); do not
   * auto-add partitions, passages or thin-line closures — unclosed spots stay review items. true = the full closer:
   * bridges over gaps (passages), long bridges along drawn lines, double-line glazing between walls, corner run-ons,
   * open-plan run-ons, the wall stage's evidence-free passage guesses.
   */
  closeGaps: false,
  /** a tracked line that closes a face smaller than this is furniture, not a wall */
  trackLoopSqm: 3,
  /** the flood from the click stops at the printed flat area; without one printed, at this much floor */
  defaultFlatSqm: 250,
  /** faces smaller than this are closing artefacts: merged into a neighbour */
  sliverSqm: 0.3,
  /** sum of a flat's centreline faces ÷ its printed area (walls + common share are in the printed figure) */
  areaShare: 0.88,
  /** … and an area-label scale is used only within this share of the wall-thickness prior */
  areaTrust: 0.05,
  /**
   * the wall stage: 'tracks' (wave 19, tracks.ts) = one wall per occupied stretch of a track, exact thickness, openings
   * only where a door arc / glazing is drawn, no repair passes; 'bands' = the wave-18 band tracker (straight, exact
   * thickness; walls.ts WallOpts.tracker) + the repair passes; 'skeleton' = the wave-15 path
   */
  tracker: 'tracks' as 'skeleton' | 'bands' | 'tracks',
  /**
   * Founder, 2026-09-30: the draft is WALLS AND DOORS, nothing else — no window guesses from the wall stage, no glazing
   * lines, no glass-colour lines. What walls and door arcs close is a room; everything else stays open for the human.
   * true (or the closer) brings the window rules back.
   */
  windows: false,
  /** tracks: a wall end inside another wall's body has ended there (joinInBodies) */
  joinBodies: true,
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
  bridge?: 'ink' | 'gap' | 'guess' | 'track' | 'glaze'
  /** a low wall (railing / parapet / planter edge): its height, m */
  heightM?: number
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
  /** filled by solveTraces for the eval's diagnosis: the wall trace used, the raster it was traced on, the whole-sheet graph before the flat pick */
  debug?: { trace?: WallTrace; plan?: Gray; full?: Unit; fullWalls?: GWall[]; plants?: Uint8Array; outside?: Uint8Array; inFlood?: (p: Pt) => boolean; touched?: Set<string>; fits?: RoomFit[]; merged?: RoomsOnTracks | null; flatFits?: number[]; thin?: ThinFaces | null }
  /** plant-green pixels of the sheet (hints.ts greenMask of the colour image): planter strips (founder rule 2) */
  green?: Uint8Array
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

/**
 * Free ends reach onto a wall a thickness or so away (corners and T's the thinning left open) — or farther, as far as
 * `inked` says the wall's thick ink runs on past the end (the founder's "follow the thick wall": the skeleton loses
 * corners where a door swing, a column or erased text touches the wall; the drawing still shows the wall there).
 */
function extendEnds(segs: Seg[], inked?: (x: End) => number, solid?: (p: Pt, q: Pt) => number): void {
  const deg = degrees(segs)
  for (const s of segs.slice())
    for (const e of ['a', 'b'] as const) {
      if (deg.get(ekey(s[e])) !== 1 || d2(s.a, s.b) < 0.05) continue
      const x = { s, e }
      const reach = Math.max(KNOBS.extendFrac * s.th + 0.02, inked ? inked(x) + s.th / 2 : 0)
      let hit = rayHit(segs, x, reach, KNOBS.extendFrac * s.th)
      // meeting a wall's line up to 0.6 m past its end: only where that stretch is solid wall ink (a column or shaft
      // block the skeleton lost at a corner) — the stretch is then added as wall
      if (!hit && solid) {
        const far = rayHit(segs, x, reach, 0.6)
        if (far && solid(far.t[far.v < 0 ? 'a' : 'b'], far.X) >= 0.9) hit = far
      }
      if (!hit) continue
      const old = ekey(s[e])
      if (hit.v < 0 || hit.v > 1) {
        const te = hit.v < 0 ? 'a' : 'b'
        if (deg.get(ekey(hit.t[te])) === 1) {
          deg.set(ekey(hit.t[te]), 0)
          hit.t[te] = { ...hit.X }
        } else if (solid && d2(hit.t[te], hit.X) > 0.02 && solid(hit.t[te], hit.X) >= 0.9) {
          segs.push({ a: { ...hit.t[te] }, b: { ...hit.X }, th: hit.t.th, conf: hit.t.conf })
          deg.set(ekey(hit.t[te]), (deg.get(ekey(hit.t[te])) ?? 0) + 1)
          deg.set(ekey(hit.X), (deg.get(ekey(hit.X)) ?? 0) - 1) // the +2 below counts the new piece's end and s's
        } else hit.X = { ...hit.t[te] }
      }
      deg.set(old, 0)
      s[e] = { ...hit.X }
      deg.set(ekey(hit.X), (deg.get(ekey(hit.X)) ?? 0) + 2)
    }
}

/** A gap founder rule 4 carried a wall across: a → b, its midpoint, length, and whether nothing is drawn along it. */
type Resumed = { a: Pt; b: Pt; at: Pt; L: number; empty: boolean }

/**
 * Founder rule 4 (2026-09-28): whatever interrupts a thick wall — furniture drawn over it, a fixture, text, hatch, a
 * dimension line, a column — is ignored; where the thick line comes back on the same alignment it is the SAME wall.
 * Facing free ends of one run (parallel within ~10°, off-line by at most half a wall) up to resumeM apart are joined as
 * wall, shortest gaps first. (A gap with a door arc or drawn glazing already carries its opening and has no free ends.)
 * Returns the resumed gaps; `empty` = nothing drawn along it (a door the arc test missed, or an opening) → review item.
 * The growth from the click passes through them (rule 3 follows the walls' branches; a carried gap may be a door).
 */
function resumeWalls(segs: Seg[], inkShare: (p: Pt, q: Pt) => number, glassShare?: (p: Pt, q: Pt) => number): Resumed[] {
  const deg = degrees(segs)
  const ends: End[] = segs.flatMap((s) => (['a', 'b'] as const).filter((e) => deg.get(ekey(s[e])) === 1 && d2(s.a, s.b) >= 0.05).map((e) => ({ s, e })))
  const cands: { x: End; y: End; L: number }[] = []
  for (let i = 0; i < ends.length; i++)
    for (let j = i + 1; j < ends.length; j++) {
      const x = ends[i], y = ends[j], p = x.s[x.e], d = outDir(x)
      const v = sub(y.s[y.e], p), u = dot(v, d)
      if (u <= 0.02 || u > KNOBS.resumeM || dot(outDir(y), d) > -0.985) continue
      if (Math.abs(crs(d, v)) > Math.max(x.s.th, y.s.th) / 2 + 0.03) continue
      cands.push({ x, y, L: u })
    }
  cands.sort((p, q) => p.L - q.L)
  const used = new Set<string>()
  const out: Resumed[] = []
  for (const c of cands) {
    const p = c.x.s[c.x.e], q = c.y.s[c.y.e]
    if (used.has(ekey(p)) || used.has(ekey(q))) continue
    used.add(ekey(p)), used.add(ekey(q))
    // a gap bridged by a line of the glazing colour is a window (founder rule 5), not a carried wall
    const glassy = !!glassShare && glassShare(p, q) >= 0.6
    segs.push({ a: { ...p }, b: { ...q }, th: Math.max(c.x.s.th, c.y.s.th), conf: 0.5, ...(glassy ? { bridge: 'glaze' as const, op: { kind: 'window' as const, conf: 0.6 } } : {}) })
    if (!glassy) out.push({ a: { ...p }, b: { ...q }, at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, L: c.L, empty: inkShare(p, q) < 0.5 })
  }
  return out
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
export function thinLines(mask0: Uint8Array, w: number, h: number, walls: WallTrace['walls'], k: number, gray?: Gray, anyLine = false, weak?: Uint8Array): { a: Px; b: Px }[] {
  const minPx = 0.6 * k, bandPx = Math.max(3, 0.3 * k), touch = 0.3 * k
  const out: { a: Px; b: Px }[] = []
  const ends = walls.flatMap((wl) => [wl.a, wl.b])
  const freeEnds = ends.filter((p) => ends.filter((q) => d2(p, q) < 2).length === 1)
  // a drawn wall's end nothing else reaches — no other wall, and no door / window guess carrying the wall on (a door
  // jamb is not where the wall stops): the corners a glazed side runs between
  const allEnds = walls.flatMap((wl) => [wl.a, wl.b].map((e) => ({ e, wl })))
  const stops = allEnds.filter(({ e, wl }) => !(wl as { guess?: boolean }).guess && allEnds.filter((o) => d2(o.e, e) <= wl.thicknessPx / 2 + 1).length === 1)
  const COS10 = Math.cos((10 * Math.PI) / 180)
  const COS35 = Math.cos((35 * Math.PI) / 180), shortPx = 0.3 * k
  // the same way within 10°; a piece under 0.3 m (the skeleton's corner bits at a thick wall's end) within 35°
  const along = (wl: WallSeg, p: Px, q: Px) => {
    const L = d2(wl.a, wl.b), M = d2(p, q)
    return L >= 1 && M >= 1 && !wl.mid && Math.abs(((wl.b.x - wl.a.x) * (q.x - p.x) + (wl.b.y - wl.a.y) * (q.y - p.y)) / (L * M)) >= (L < shortPx ? COS35 : COS10)
  }
  /** the distance from p to the line through wl (its centre line carried on) */
  const offLine = (p: Px, wl: WallSeg) => {
    const L = d2(wl.a, wl.b)
    return L < 1 ? d2(p, wl.a) : Math.abs((wl.b.x - wl.a.x) * (p.y - wl.a.y) - (wl.b.y - wl.a.y) * (p.x - wl.a.x)) / L
  }
  /**
   * p meets the end of a wall running the same way as p→q, ON that wall's line (a door leaf drawn a little inside the
   * room runs beside the wall, not on it), an end no crosswise wall shares: the line continues a wall stub
   */
  const stubEnd = (p: Px, q: Px): Px | null => {
    for (const wl of walls) {
      if (!along(wl, p, q) || offLine(p, wl) > wl.thicknessPx / 2 + 2) continue
      // a door / window guess carrying the line on counts even past a partition's end (the next room's window on
      // the same outer wall); a drawn wall's end must be a stub, not a corner
      const guess = (wl as { guess?: boolean }).guess
      for (const e of [wl.a, wl.b]) if (d2(e, p) <= touch + wl.thicknessPx / 2 && (guess || !walls.some((o) => o !== wl && d2(o.a, o.b) >= shortPx && !along(o, p, q) && (d2(o.a, e) < 2 || d2(o.b, e) < 2)))) return e
    }
    return null
  }
  const inLine = (p: Px, q: Px): boolean => stubEnd(p, q) !== null
  /** p meets where a wall crosswise to p→q stops: the corner a glazed side runs from */
  const cornerAt = (p: Px, q: Px): boolean => stops.some(({ e, wl }) => !along(wl, p, q) && d2(e, p) <= touch + wl.thicknessPx / 2)
  const scan = (mask: Uint8Array, stubOnly: boolean) => {
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
        // the second pass (wall bodies cut out of the mask) only adds lines that continue a wall stub, or run from where
        // one crosswise wall stops to where another does (a room's whole glazed side): a window sits in a wall's gap —
        // a double line from one wall's side to the other's (shower glass, a counter, a wardrobe) does not
        if (stubOnly && (d2(a, b) < 0.8 * k || (!inLine(a, b) && !inLine(b, a) && !(cornerAt(a, b) && cornerAt(b, a))))) continue
        // glazing (walls.ts `glazing`: >= 2 lines or a >= 3 px band, darker than the paper on both sides — not the edge of
        // a colour fill); a lone pen line only with the closer
        const L = d2(a, b)
        const gl = gray ? glazing(a, (b.x - a.x) / L, (b.y - a.y) / L, L, Math.max(4, 0.25 * k), (x, y) => gray.data[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))]) : null
        const isGlazing = anyLine || (gl ? gl.lines >= 2 || gl.band >= 3 : lines >= 2 || vs.length >= 3)
        if (!isGlazing && (!KNOBS.closeGaps || d2(a, b) < KNOBS.singleLineM * k || ![a, b].some((p) => freeEnds.some((q) => d2(p, q) <= touch)))) continue
        let onWall = 0
        for (let t = 0; t < 10; t++) {
          const p = { x: a.x + ((b.x - a.x) * (t + 0.5)) / 10, y: a.y + ((b.y - a.y) * (t + 0.5)) / 10 }
          if (walls.some((wl) => segDist(p, wl.a, wl.b) <= wl.thicknessPx / 2 + bandPx / 2)) onWall++
        }
        if (onWall > 3) continue
        // one line per place: the first pass's line wins
        const dup = out.some((o) => segDist(a, o.a, o.b) <= bandPx && segDist(b, o.a, o.b) <= bandPx)
        if (dup) continue
        // a line continuing a stub starts at the stub's end (the panes start a little past the wall's end cap)
        if (stubOnly) out.push({ a: stubEnd(a, b) ?? a, b: stubEnd(b, a) ?? b })
        else out.push({ a, b })
      }
    }
  }
  scan(mask0, false)
  // second pass: a pane's line that goes on as the wall's own edge line (the same pen draws both) drags the candidate's
  // ends through the walls and past them in the first pass — the traced wall bodies cut out of the mask, it ends where
  // the walls start, and it must continue a wall stub
  scan(clipWalls(mask0, w, h, walls), true)
  // and once more on the fainter mask when given: a pane's lines inside a tinted room fall short of the clear-line cut
  if (weak) scan(clipWalls(weak, w, h, walls), true)
  return out
}

/** `mask` without the pixels inside the traced walls (their centre line ± half the thickness + 1 px). */
function clipWalls(mask: Uint8Array, w: number, h: number, walls: WallTrace['walls']): Uint8Array {
  const out = mask.slice()
  for (const wl of walls)
    for (const pc of segPieces(wl)) {
      const r = wl.thicknessPx / 2 + 1
      const x0 = Math.max(0, Math.floor(Math.min(pc.a.x, pc.b.x) - r)), x1 = Math.min(w - 1, Math.ceil(Math.max(pc.a.x, pc.b.x) + r))
      const y0 = Math.max(0, Math.floor(Math.min(pc.a.y, pc.b.y) - r)), y1 = Math.min(h - 1, Math.ceil(Math.max(pc.a.y, pc.b.y) + r))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (out[y * w + x] && segDist({ x, y }, pc.a, pc.b) <= r) out[y * w + x] = 0
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

/**
 * Overlap = joined (founder 2026-10-03: "if a wall ends inside another — not necessarily at the middle point — it has
 * ended there"). On noded segs: a corner lying inside another wall's BODY (within its half thickness + 1 px of the
 * centre line, onto the segment) gets a connector along the normal onto that centre line — the next node() splits the
 * wall there and the two share the corner (a connector in line with the corner's wall merges into it: the wall just
 * reaches the centre line). A free end of that wall within its end block moves onto the meeting point instead (an L
 * whose ends stop short of / run past each other inside the bodies: no stub). A connector, not a moved corner: the
 * corner's other walls keep their angle and a door's jamb stays as drawn. Two widths meeting END TO END on offset
 * centre lines (the corner's wall runs along the other inside its end block): the connector is the crosswise piece,
 * as thick as the thicker wall (founder: never a visible thin zigzag); two parallel walls overlapping further in are
 * no end. Never onto an opening's piece, never onto a wall the corner already reaches along its own short walls
 * (≤ 0.3 m: a jog, a nib inside a junction — a connector there only closes a sliver). Crossings: node() splits them.
 */
function joinInBodies(segs: Seg[], px: number): Seg[] {
  const deg = degrees(segs)
  const pts = new Map<string, Seg[]>()
  for (const s of segs) for (const p of [s.a, s.b]) pts.set(ekey(p), [...(pts.get(ekey(p)) ?? []), s])
  const out = segs.slice()
  const sin10 = Math.sin((10 * Math.PI) / 180)
  for (const [k, at] of pts) {
    const ends = at.map((s) => (ekey(s.a) === k ? 'a' : ekey(s.b) === k ? 'b' : null))
    if (ends.includes(null)) continue // an end moved below
    const p = at[0][ends[0]!]
    const hops = new Map<string, number>([[k, 0]])
    for (const q = [k]; q.length; ) {
      const x = q.shift()!
      for (const s of pts.get(x) ?? []) {
        const y = ekey(s.a) === x ? ekey(s.b) : ekey(s.a)
        const h = hops.get(x)! + d2(s.a, s.b)
        if (h <= 0.3 && h < (hops.get(y) ?? Infinity)) hops.set(y, h), q.push(y)
      }
    }
    const dirs = at.filter((s) => d2(s.a, s.b) > 1e-6).map((s) => unit(sub(s.b, s.a)))
    let best: { t: Seg; q: Pt; d: number; move?: 'a' | 'b'; along: boolean } | null = null
    for (const t of segs) {
      if (Math.min(hops.get(ekey(t.a)) ?? Infinity, hops.get(ekey(t.b)) ?? Infinity) <= t.th + px) continue
      const L = d2(t.a, t.b)
      if (L < 1e-6) continue
      const u = unit(sub(t.b, t.a))
      const s = dot(sub(p, t.a), u), d = Math.abs(crs(u, sub(p, t.a)))
      if (d > t.th / 2 + px || (best && d >= best.d)) continue
      const side = s < L / 2 ? 'a' : 'b', toEnd = side === 'a' ? s : L - s, cap = t.th / 2 + px
      const along = dirs.some((v) => Math.abs(crs(u, v)) < sin10)
      if (along && toEnd > cap) continue // parallel walls overlapping: no end
      const corner = toEnd >= 0 && toEnd < 0.002
      if (t.op && !corner) continue // an opening's piece is never split or moved: only its jamb corner joins
      const onT = { x: t.a.x + u.x * s, y: t.a.y + u.y * s }
      if (!t.op && deg.get(ekey(t[side])) === 1 && toEnd <= cap && toEnd >= -cap) best = { t, q: onT, d, move: side, along }
      else if (!corner && toEnd >= 0) best = { t, q: onT, d, along }
      else if (corner) best = { t, q: t[side], d, along } // at the wall's corner
    }
    if (!best) continue
    if (best.move) best.t[best.move] = best.q
    const w = at.find((s) => !s.op) ?? at[0]
    const th = best.along ? Math.max(w.th, best.t.th) : w.th
    if (d2(p, best.q) > 0.002) out.push({ a: p, b: { ...best.q }, th, conf: w.conf, ...(w.heightM ? { heightM: w.heightM } : {}) })
  }
  return out
}

/**
 * A jog — the short crosswise piece joining two walls that meet END TO END on offset centre lines (a flush thickness
 * step; tracks / closeCorners draw it at the thinner wall's width), other walls at its corners or not — takes the
 * THICKER wall's thickness: drawn thin it stuck out of the thick wall's end as a visible zigzag (founder 2026-10-03).
 * Mutates `segs`.
 */
function thickJogs(segs: Seg[]): void {
  const at = new Map<string, Seg[]>()
  for (const s of segs) for (const p of [s.a, s.b]) at.set(ekey(p), [...(at.get(ekey(p)) ?? []), s])
  const out = (s: Seg, from: Pt) => unit(sub(d2(s.a, from) < 1e-9 ? s.b : s.a, from))
  for (const j of segs) {
    if (j.op) continue
    const L = d2(j.a, j.b), u = unit(sub(j.b, j.a))
    const square = (s: Seg, from: Pt) => s !== j && Math.abs(dot(u, out(s, from))) < 0.02
    for (const x of at.get(ekey(j.a))!.filter((s) => square(s, j.a)))
      for (const y of at.get(ekey(j.b))!.filter((s) => square(s, j.b))) {
        // the two walls leave in opposite directions (a step, not a slot), the jog within the thicker one's body
        const th = Math.max(x.th, y.th)
        if (dot(out(x, j.a), out(y, j.b)) < -0.98 && L <= th / 2 + 1e-6 && j.th < th) j.th = th
      }
  }
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
/**
 * Segments → a core wall graph. Thickness: the 5" / 10" class (the skeleton's width is a guess), or with `exactTh`
 * (the band tracker) the measured width to the nearest half inch — a 7" or 15" wall stays what it is drawn.
 */
function toUnitGraph(segs: Seg[], exactTh = false, openingsExact = false): { vertices: Vertex[]; walls: (Wall & { conf: number; bridge?: Seg['bridge']; guess?: Map<string, Op> })[] } {
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
    const halfInch = 0.0254 / 2
    // (tracks: an opening's piece is its wall's own thickness, so wall – opening – wall merge into one wall)
    const thicknessM = exactTh && (!s.bridge || (openingsExact && s.bridge === 'guess')) ? Math.max(PARTITION_M / 2, Math.round(s.th / halfInch) * halfInch) : s.th >= KNOBS.thickM ? EXTERIOR_M : PARTITION_M
    return { id: newId(), a: vid(s.a), b: vid(s.b), thicknessM, heightM: s.heightM ?? WALL_HEIGHT_M, openings, conf: s.conf, bridge: s.bridge, guess }
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
      if (p.thicknessM !== q.thicknessM || p.heightM !== q.heightM || p === q) continue
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

/**
 * The raster with the read text's strokes erased: inside every plausible text box, ink thinner than a wall core
 * turns to paper; wall ink running through the box stays (it is thicker). Garbage boxes (a read of a hatch or a
 * drawing, taller than a few text lines) are left alone.
 */
export function eraseText(gray: Gray, text: TextTrace): Gray {
  // read items only (room names, sizes, areas): an 'other' box is often a garbage read over a drawing, glazing included
  const items = text.items.filter((it) => it.kind !== 'other' && it.box.w > 0 && it.box.h > 0)
  if (!items.length) return gray
  const hs = items.filter((it) => it.kind !== 'other').map((it) => it.box.h).sort((a, b) => a - b)
  const lineH = text.glyphPx ?? (hs.length ? hs[hs.length >> 1] / 2 : 12)
  const { width: w, height: h } = gray
  const ink = threshold(gray, inkThreshold(gray, {}))
  const dt = edt(ink, w, h)
  const half = wallHalfWidth(dt, w, h)
  // on a low-res sheet a partition is as thin as a letter stroke: erasing thin ink would erase the partitions too
  if (half < 3) return gray
  const rCore = 0.7 * half
  const out = new Uint8Array(gray.data)
  for (const it of items) {
    const b = it.box
    if (b.h > 5 * lineH || b.w > 40 * lineH) continue
    for (let y = Math.max(0, Math.floor(b.y) - 1); y <= Math.min(h - 1, Math.ceil(b.y + b.h) + 1); y++)
      for (let x = Math.max(0, Math.floor(b.x) - 1); x <= Math.min(w - 1, Math.ceil(b.x + b.w) + 1); x++) {
        const i = y * w + x
        if (ink[i] && dt[i] < rCore) out[i] = 255
      }
  }
  return { width: w, height: h, data: out }
}

// ───────────────────────────────────────────────────────────────── the draft

interface Draft {
  unit: Unit
  walls: GWall[]
  rooms: Room[]
  th0: number
  /** gaps founder rule 4 carried the wall across (metres, the draft frame before any shift) */
  resumed?: Resumed[]
  /** stair flights found on the sheet (px boxes, founder rule 6) */
  stairs?: { x0: number; y0: number; x1: number; y1: number }[]
  /** tracks: gaps in a wall with nothing drawn in them (metres, the draft frame before any shift) — review items, never bridged */
  gaps?: { a: Pt; b: Pt }[]
}

/**
 * WallTrace (px) → a noded, pruned, merged wall graph in metres (origin = `originPx`). `tracker` 'bands' / 'tracks':
 * thickness as measured (½"), not the 5" / 10" classes. 'tracks': the walls arrive straight, exact and joined at track
 * crossings — none of the repair passes run (axis snap, end joining, spur pruning, end extension, rule-4 resume), the
 * openings are the trace's drawn doors / windows (children of the wall they are cut in), 'unknown' gaps stay open.
 */
export function buildGraph(trace: WallTrace, pxPerM: number, originPx: Px, gray: Gray, ink?: ReturnType<typeof inkMasks> & { glass?: Uint8Array }, tracked: WallSeg[] = [], tracker: 'skeleton' | 'bands' | 'tracks' = 'skeleton'): Draft {
  const exactTh = tracker !== 'skeleton', tracks = tracker === 'tracks'
  const toM = (p: Px): Pt => ({ x: (p.x - originPx.x) / pxPerM, y: (p.y - originPx.y) / pxPerM })
  const toPx = (p: Pt): Px => ({ x: originPx.x + p.x * pxPerM, y: originPx.y + p.y * pxPerM })
  let segs: Seg[] = []
  for (const w of trace.walls) {
    const th = w.thicknessPx / pxPerM
    if (!w.mid) {
      segs.push({ a: toM(w.a), b: toM(w.b), th, conf: w.conf, ...(w.heightM ? { heightM: w.heightM } : {}) })
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
  const gaps: { a: Pt; b: Pt }[] = []
  for (const o of trace.openings) {
    if (tracks) {
      // a drawn door / window (positive evidence only) is a child of its wall; a gap with nothing drawn is never bridged
      // (a passage: nothing drawn here AND on the fitted rooms' edges — merge.ts — an opening, flagged)
      if (o.kind === 'door' || o.kind === 'window' || o.kind === 'passage') segs.push({ a: toM(o.a), b: toM(o.b), th: (o.thicknessPx ?? PARTITION_M * pxPerM) / pxPerM, conf: o.conf, bridge: 'guess', op: { kind: o.kind, conf: o.conf, hinge: o.hingeAt && toM(o.hingeAt), swingTo: o.swingTo && toM(o.swingTo) } })
      else gaps.push({ a: toM(o.a), b: toM(o.b) })
      continue
    }
    // without the closer: only openings the drawing shows (a door arc, a window's lines), not evidence-free gaps
    if (!KNOBS.closeGaps && o.kind !== 'door' && (!KNOBS.windows || o.kind !== 'window')) continue
    let th = PARTITION_M, bd = Infinity
    for (const w of trace.walls)
      for (const p of [w.a, w.b]) {
        const d = Math.min(d2(p, o.a), d2(p, o.b))
        if (d < bd) (bd = d), (th = w.thicknessPx / pxPerM)
      }
    segs.push({ a: toM(o.a), b: toM(o.b), th, conf: o.conf, bridge: 'guess', op: { kind: o.kind, conf: o.conf, hinge: o.hingeAt && toM(o.hingeAt), swingTo: o.swingTo && toM(o.swingTo) } })
  }
  // thin walls the tracker followed (track.ts): weaker than drawn walls, marked so the small-loop rule can drop them
  for (const t of tracked) segs.push({ a: toM(t.a), b: toM(t.b), th: PARTITION_M, conf: t.conf, bridge: 'track' })
  const th0 = dominantAxis(segs.filter((s) => !s.bridge))
  const { weak, line, wall, glass } = { glass: undefined, ...(ink ?? inkMasks(gray)) }
  // founder rule 6: stair flights (their treads are parallel line bundles too — never glazing)
  const stairs = findStairs(line, gray.width, gray.height, pxPerM)
  const m2 = 0.2 * pxPerM
  const inStairs = (l: { a: Px; b: Px }) => stairs.some((s) => (l.a.x + l.b.x) / 2 >= s.x0 - m2 && (l.a.x + l.b.x) / 2 <= s.x1 + m2 && (l.a.y + l.b.y) / 2 >= s.y0 - m2 && (l.a.y + l.b.y) / 2 <= s.y1 + m2)
  // glazing between two walls, too faint for the wall stage: drawn as >= 2 lines or a band it is a window in a wall gap
  // (founder scope); a lone pen line (railing, counter) only with the gap closer
  // (a wall stretch the wall stage already read as a door / window gap counts as wall for "between walls": a window
  // reaching a corner where the wall's other side is a window too meets no traced wall there)
  const thMed = [...trace.walls].map((w) => w.thicknessPx).sort((p, q) => p - q)[trace.walls.length >> 1] ?? PARTITION_M * pxPerM
  const wallsPlus: WallSeg[] = [...trace.walls, ...trace.openings.filter((o) => o.kind === 'door' || o.kind === 'window').map((o) => ({ a: o.a, b: o.b, thicknessPx: thMed, conf: o.conf, guess: true }) as WallSeg)]
  // (tracks: windows come only from the trace's positive evidence — never these line passes, unless the closer is on)
  const windows = tracks ? KNOBS.closeGaps : KNOBS.windows || KNOBS.closeGaps
  if (windows && Math.abs(th0) < (2 * Math.PI) / 180)
    for (const l of thinLines(line, gray.width, gray.height, wallsPlus, pxPerM, gray, false, weak)) if (!inStairs(l)) segs.push({ a: toM(l.a), b: toM(l.b), th: PARTITION_M, conf: 0.4, bridge: 'glaze', op: { kind: 'window', conf: 0.4 } })
  // founder rule 5: a line of the sheet's glazing colour (Banani: thin blue) spanning between two walls is glass, even single
  if (windows && glass && Math.abs(th0) < (2 * Math.PI) / 180)
    for (const l of thinLines(glass, gray.width, gray.height, wallsPlus, pxPerM, undefined, true)) if (!inStairs(l)) segs.push({ a: toM(l.a), b: toM(l.b), th: PARTITION_M, conf: 0.6, bridge: 'glaze', op: { kind: 'window', conf: 0.6 } })
  const W = gray.width, H = gray.height
  let resumed: Resumed[] = []
  // (tracks: every point is exact — node at a hair's width, else a jog's two corners would merge and tilt a wall)
  if (tracks) {
    segs = KNOBS.joinBodies ? joinInBodies(node(segs, 0.002), 1 / pxPerM) : node(segs, 0.002)
    thickJogs(segs)
  } else {
    snapAxes(segs, th0)
    joinEnds(segs)
    // thinning hairs off first (a hair at a wall's end points the wrong way), then every free end follows its thick ink
    segs = pruneSpurs(node(segs, 0.02))
    const solidInk = (p: Pt, q: Pt) => {
      let best = 0
      for (let o = -2; o <= 2 && best < 1; o++) best = Math.max(best, inkAlong(wall, W, H, toPx(p), toPx(q), o))
      return best
    }
    extendEnds(segs, (x) => inkRun(wall, W, H, toPx(x.s[x.e]), outDir(x), x.s.th * pxPerM, 1.5 * pxPerM) / pxPerM, solidInk)
    resumed = resumeWalls(segs, (p, q) => {
      let best = 0
      for (let o = -2; o <= 2 && best < 1; o++) best = Math.max(best, inkAlong(weak, W, H, toPx(p), toPx(q), o))
      return best
    }, glass && ((p, q) => inkAlong(glass, W, H, toPx(p), toPx(q))))
  }
  if (KNOBS.closeGaps)
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
  let noded = tracks ? node(segs, 0.002) : pruneSpurs(node(segs, 0.02))
  noded = noded.filter((s) => d2(s.a, s.b) > (tracks ? 0.002 : 0.01))
  const g = toUnitGraph(noded, exactTh, tracks)
  let m = mergeCollinear(g.vertices, g.walls)
  // a tracked line closing a small loop with the walls is furniture (bed, wardrobe, counter): take it out again
  for (let it = 0; it < 50 && tracked.length; it++) {
    const rooms = deriveRooms({ vertices: m.vertices, walls: m.walls, roomLabels: [] })
    const bad = new Set(rooms.filter((r) => r.areaSqm < KNOBS.trackLoopSqm).flatMap((r) => r.wallIds))
    const walls = m.walls.filter((w) => !(w.bridge === 'track' && bad.has(w.id)))
    if (walls.length === m.walls.length) break
    const used = new Set(walls.flatMap((w) => [w.a, w.b]))
    m = mergeCollinear(m.vertices.filter((v) => used.has(v.id)), walls)
  }
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
  return { unit, walls: m.walls, rooms: deriveRooms(unit), th0, resumed, stairs, gaps }
}

export const inkMasks = (gray: Gray) => ({ weak: lineInk(gray, 18), line: lineInk(gray, KNOBS.lineDelta), wall: threshold(gray, inkThreshold(gray, {})) })

/**
 * How far (px) wall-thick ink runs on from `p` along unit `d`: at each step the ink run across the line (through the
 * centre, ±1 px) must be at least half the wall's width. Capped at `max` px (the caller: 1.5 m — a filled area is no wall).
 */
function inkRun(mask: Uint8Array, w: number, h: number, p: Px, d: Pt, thPx: number, max: number): number {
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < w && yi < h ? mask[yi * w + xi] : 0
  }
  const n = { x: -d.y, y: d.x }, r = Math.ceil(thPx), need = Math.max(2, 0.5 * thPx)
  let t = 1
  for (; t <= max; t++) {
    const q = { x: p.x + d.x * t, y: p.y + d.y * t }
    const c = [0, -1, 1].find((o) => at(q.x + n.x * o, q.y + n.y * o))
    if (c === undefined) break
    let lo = c, hi = c
    while (lo - 1 >= -r && at(q.x + n.x * (lo - 1), q.y + n.y * (lo - 1))) lo--
    while (hi + 1 <= r && at(q.x + n.x * (hi + 1), q.y + n.y * (hi + 1))) hi++
    if (hi - lo + 1 < need) break
  }
  return t - 1
}

const stripWall = (w: GWall): Wall => ({ id: w.id, a: w.a, b: w.b, thicknessM: w.thicknessM, heightM: w.heightM, openings: w.openings })

// ───────────────────────────────────────────────────────────────── plants, outside, picking the flat

/**
 * Founder rule 5: thin lines of a glazing colour — blue / cyan tinted (Banani draws windows and veranda glass as thin
 * light-blue lines). A blue FILL (a wet room's floor tint) is no glass: blue regions deeper than 3 px are cut out.
 */
export function glassMask(rgb: NonNullable<AutoTraceOpts['rgb']>): Uint8Array {
  const { width: w, height: h, data } = rgb
  const m = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) m[i] = data[i * 4 + 2] - Math.max(data[i * 4], data[i * 4 + 1]) >= 25 ? 1 : 0
  const deep = edt(m, w, h)
  const fill = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) fill[i] = deep[i] >= 3 ? 1 : 0
  const fillAll = dilate(fill, w, h, 3)
  for (let i = 0; i < w * h; i++) if (fillAll[i]) m[i] = 0
  return m
}

/**
 * Founder rule 6: stairs have lines but no text — a run of at least 5 short parallel treads (0.7–1.8 m long, one
 * start and end) evenly spaced 0.18–0.4 m apart, on the sheet's axes. Returns each flight's box (px). No AI, no text.
 * ponytail: axis-aligned sheets only, like thinLines; winders / spiral stairs are not found.
 */
export function findStairs(mask: Uint8Array, w: number, h: number, k: number): { x0: number; y0: number; x1: number; y1: number }[] {
  const out: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const horiz of [true, false]) {
    const U = horiz ? w : h, N = horiz ? h : w
    // tread candidates: runs 0.7–1.8 m long; runs on neighbouring rows with the same extent are one line
    const lines: { v: number; u0: number; u1: number }[] = []
    let recent: typeof lines = []
    for (let v = 0; v < N; v++) {
      recent = recent.filter((l) => v - l.v <= 2)
      let u0 = -1
      for (let u = 0; u <= U; u++) {
        const on = u < U && (horiz ? mask[v * w + u] : mask[u * w + v])
        if (on && u0 < 0) u0 = u
        if (!on && u0 >= 0) {
          const L = u - u0
          if (L >= 0.7 * k && L <= 1.8 * k) {
            const prev = recent.find((l) => Math.abs(l.u0 - u0) <= 3 && Math.abs(l.u1 - u) <= 3)
            if (prev) prev.v = v
            else lines.push({ v, u0, u1: u }), recent.push(lines[lines.length - 1])
          }
          u0 = -1
        }
      }
    }
    lines.sort((p, q) => p.v - q.v)
    const used = new Uint8Array(lines.length)
    for (let i = 0; i < lines.length; i++) {
      if (used[i]) continue
      // treads: same start and end (±0.15 m), then evenly spaced
      const run = [lines[i]]
      for (let j = i + 1; j < lines.length && lines[j].v - run[run.length - 1].v <= 0.4 * k; j++) {
        const last = run[run.length - 1], l = lines[j], gap = l.v - last.v
        if (used[j] || Math.abs(l.u0 - lines[i].u0) > 0.15 * k || Math.abs(l.u1 - lines[i].u1) > 0.15 * k || gap < 0.18 * k) continue
        if (run.length >= 2 && Math.abs(gap - (last.v - run[run.length - 2].v)) > 0.3 * gap) continue
        run.push(l), (used[j] = 1)
      }
      if (run.length < 5) continue
      const u0 = Math.min(...run.map((l) => l.u0)), u1 = Math.max(...run.map((l) => l.u1)), v0 = run[0].v, v1 = run[run.length - 1].v
      out.push(horiz ? { x0: u0, y0: v0, x1: u1, y1: v1 } : { x0: v0, y0: u0, x1: v1, y1: u1 })
    }
  }
  return out
}

/** Dilate a mask by r px (exact, through the distance transform). */
function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1
  const d = edt(inv, w, h)
  const out = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) out[i] = d[i] <= r ? 1 : 0
  return out
}

/**
 * Founder rule 2 (2026-09-28): planter / sunshade / green strips are marked before the walls are followed — they bound
 * the flat as planters, the growth never enters them. From the raster: plant-green pixels (colour sheets) and foliage
 * drawings (solid dark ink at least 0.4 m across with a leafy texture — a column or a black fill is flat). A printed
 * SUNSHADE / PLANTER label marks its face (solveTraces). Blobs under 0.5 m² (a pot plant) are dropped.
 */
export function planterMask(plan: Gray, wallInk: Uint8Array, pxPerM: number, green?: Uint8Array): Uint8Array {
  const { width: w, height: h, data } = plan
  const seed = new Uint8Array(w * h)
  const dt = edt(wallInk, w, h)
  const deep = 0.2 * pxPerM
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (green?.[i]) seed[i] = 1
      if (dt[i] < deep) continue
      // leafy: the 5×5 neighbourhood varies (foliage 50–120 mottled); a fill or a column is one grey
      let s = 0, s2 = 0
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) (s += data[i + dy * w + dx]), (s2 += data[i + dy * w + dx] ** 2)
      if (s2 / 25 - (s / 25) ** 2 > 150) seed[i] = 1
    }
  const m = dilate(seed, w, h, deep)
  // drop small blobs
  const lab = new Int32Array(w * h).fill(-1)
  const stack: number[] = []
  const minPx = 0.5 * pxPerM * pxPerM
  for (let i = 0; i < w * h; i++) {
    if (!m[i] || lab[i] >= 0) continue
    const comp: number[] = []
    stack.push(i)
    lab[i] = i
    while (stack.length) {
      const p = stack.pop()!
      comp.push(p)
      const x = p % w
      for (const q of [p - 1, p + 1, p - w, p + w]) if (q >= 0 && q < w * h && m[q] && lab[q] < 0 && Math.abs((q % w) - x) <= 1) (lab[q] = i), stack.push(q)
    }
    if (comp.length < minPx) for (const p of comp) m[p] = 0
  }
  return m
}

/**
 * The sheet's outside: paper that reaches the sheet border without crossing a drawn line (any line — railings and
 * glazing count; gaps under ~0.8 m are closed first). A flat's growth never enters it.
 */
export function outsideMask(lines: Uint8Array, wallInk: Uint8Array, w: number, h: number, pxPerM: number): Uint8Array {
  // barriers: wall ink, and drawn lines at least 1.2 m long — the dashes of a site boundary or a slab outline (and specks)
  // are no barrier, else closing the gaps would wall the outside off
  const bar = new Uint8Array(w * h)
  for (let i = 0; i < bar.length; i++) bar[i] = wallInk[i]
  {
    const seen = new Uint8Array(w * h), comp: number[] = [], minLen = 1.2 * pxPerM
    for (let s = 0; s < w * h; s++) {
      if (!lines[s] || seen[s]) continue
      comp.length = 0
      comp.push(s)
      seen[s] = 1
      let x0 = w, x1 = 0, y0 = h, y1 = 0
      for (let head = 0; head < comp.length; head++) {
        const p = comp[head], x = p % w, y = (p - x) / w
        ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy, q = Y * w + X
            if (X >= 0 && Y >= 0 && X < w && Y < h && lines[q] && !seen[q]) (seen[q] = 1), comp.push(q)
          }
      }
      if (Math.max(x1 - x0, y1 - y0) >= minLen) for (const p of comp) bar[p] = 1
    }
  }
  const r = 0.4 * pxPerM
  const closed = dilate(bar, w, h, r)
  // paper regions: those touching the sheet border, and the largest one (a sheet with a drawn frame: the paper around
  // the building lies inside the frame line)
  const lab = new Int32Array(w * h).fill(-1)
  const size: number[] = [], border: boolean[] = []
  const queue: number[] = []
  for (let s = 0; s < w * h; s++) {
    if (closed[s] || lab[s] >= 0) continue
    const id = size.length
    let n = 0, edge = false
    queue.length = 0
    queue.push(s)
    lab[s] = id
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head], x = p % w
      n++
      if (x === 0 || x === w - 1 || p < w || p >= w * (h - 1)) edge = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < w * h && !closed[q] && lab[q] < 0) (lab[q] = id), queue.push(q)
    }
    size.push(n), border.push(edge)
  }
  const big = size.indexOf(Math.max(0, ...size))
  const reach = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && (border[lab[i]] || lab[i] === big)) reach[i] = 1
  // grow back over the closing margin (not across a line)
  const out = dilate(reach, w, h, r)
  for (let i = 0; i < out.length; i++) if (bar[i]) out[i] = 0
  return out
}

/**
 * Founder rule 3, "start in the middle": flood the open floor from the click on a 0.1 m grid. Walls are barriers except
 * their door / passage / slider spans (a window looks out); `blocked` cells (the outside, planters) are never entered.
 * Breadth first until nothing is left — or `capSqm` of floor (the printed flat area: what leaks on through an unclosed
 * spot stops there). Then a one-per-flat name printed twice on that floor seeds a rival at the farther print: click and
 * rivals flood together, each cell goes to its nearest source, the click's share is the flat. Returns its cells and
 * every wall they touch.
 */
function floodFlat(d: Draft, at: Pt, blocked: (p: Pt) => boolean, capSqm: number, names: { p: Pt; name: string }[] = []): { inFlood: (p: Pt) => boolean; touched: Set<string>; sqm: number } {
  const cell = 0.1
  const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
  const xs = d.unit.vertices.map((v) => v.x).concat(at.x), ys = d.unit.vertices.map((v) => v.y).concat(at.y)
  const x0 = Math.min(...xs) - 1, y0 = Math.min(...ys) - 1
  const nx = Math.ceil((Math.max(...xs) + 1 - x0) / cell), ny = Math.ceil((Math.max(...ys) + 1 - y0) / cell)
  const grid = new Int32Array(nx * ny).fill(-1)
  d.walls.forEach((w, wi) => {
    const a = V.get(w.a)!, b = V.get(w.b)!
    const L = d2(a, b)
    const steps = Math.ceil(L / (cell / 2)) + 1
    const r = Math.max(1, Math.round(w.thicknessM / 2 / cell))
    for (let k = 0; k <= steps; k++) {
      const m = (L * k) / steps
      if (w.openings.some((o) => o.kind !== 'window' && m > o.offsetM + 0.05 && m < o.offsetM + o.widthM - 0.05)) continue
      const cx = Math.floor((a.x + ((b.x - a.x) * k) / steps - x0) / cell), cy = Math.floor((a.y + ((b.y - a.y) * k) / steps - y0) / cell)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy
          if (x >= 0 && y >= 0 && x < nx && y < ny) grid[y * nx + x] = wi
        }
    }
  })
  // gaps rule 4 carried a wall across stay passable (maybe a door the swing test missed)
  for (const g of d.resumed ?? []) {
    const L = d2(g.a, g.b), steps = Math.ceil(L / (cell / 2)) + 1
    for (let k = 1; k < steps; k++) {
      const cx = Math.floor((g.a.x + ((g.b.x - g.a.x) * k) / steps - x0) / cell), cy = Math.floor((g.a.y + ((g.b.y - g.a.y) * k) / steps - y0) / cell)
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 2 && cx + dx >= 0 && cy + dy >= 0 && cx + dx < nx && cy + dy < ny) grid[(cy + dy) * nx + cx + dx] = -1
    }
  }
  const centre = (i: number): Pt => ({ x: x0 + ((i % nx) + 0.5) * cell, y: y0 + (Math.floor(i / nx) + 0.5) * cell })
  const seen = new Uint8Array(nx * ny)
  const touched = new Set<string>()
  // the click, or the nearest free cell within 0.5 m (a click on a wall line)
  const sx = Math.floor((at.x - x0) / cell), sy = Math.floor((at.y - y0) / cell)
  let start = -1
  for (let r = 0; r <= 5 && start < 0; r++)
    for (let dy = -r; dy <= r && start < 0; dy++)
      for (let dx = -r; dx <= r && start < 0; dx++) {
        const x = sx + dx, y = sy + dy, i = y * nx + x
        if (x >= 0 && y >= 0 && x < nx && y < ny && grid[i] < 0) start = i
      }
  if (start < 0) return { inFlood: () => false, touched, sqm: 0 }
  const free = blocked(centre(start)) ? () => true : (i: number) => !blocked(centre(i))
  const cellOf = (p: Pt) => {
    const x = Math.floor((p.x - x0) / cell), y = Math.floor((p.y - y0) / cell)
    return x >= 0 && y >= 0 && x < nx && y < ny ? y * nx + x : -1
  }
  const near4 = (i: number) => {
    const x = i % nx
    return [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, i - nx, i + nx < nx * ny ? i + nx : -1]
  }
  // pass 1: from the click, breadth first, until nothing is left or the cap
  const dist = new Int32Array(nx * ny).fill(-1)
  const queue = [start]
  seen[start] = 1
  dist[start] = 0
  const cap = capSqm / (cell * cell)
  for (let head = 0; head < queue.length && head < cap; head++) {
    const i = queue[head]
    for (const j of near4(i)) if (j >= 0 && !seen[j] && grid[j] < 0 && free(j)) (seen[j] = 1), (dist[j] = dist[i] + 1), queue.push(j)
  }
  // pass 2: a name a flat has once, printed twice on that floor — the farther print is the next flat's. The click and
  // those rivals flood together; every cell goes to the nearest source, the click's share is the flat.
  const byName = new Map<string, { c: number; d: number }[]>()
  for (const l of names) {
    const c = cellOf(l.p)
    if (c >= 0 && seen[c]) byName.set(l.name, [...(byName.get(l.name) ?? []), { c, d: dist[c] }])
  }
  const rivals = [...byName.values()].flatMap((ls) => ls.sort((p, q) => p.d - q.d).slice(1).map((l) => l.c)).filter((c) => c !== start)
  const own = new Int8Array(nx * ny).fill(-1)
  const q2 = [start, ...rivals]
  own[start] = 0
  for (const r of rivals) own[r] = 1
  for (let head = 0; head < q2.length; head++) {
    const i = q2[head]
    for (const j of near4(i)) if (j >= 0 && seen[j] && own[j] < 0) (own[j] = own[i]), q2.push(j)
  }
  let n = 0
  for (let i = 0; i < nx * ny; i++) {
    if (own[i] !== 0) continue
    n++
    for (const j of near4(i)) if (j >= 0 && grid[j] >= 0) touched.add(d.walls[grid[j]].id)
  }
  const inFlood = (p: Pt) => {
    const c = cellOf(p)
    return c >= 0 && own[c] === 0
  }
  return { inFlood, touched, sqm: n * cell * cell }
}


/**
 * Faces of the flat. With a click: every closed face on the floor the flood from the click reaches (floodFlat), the
 * closed rooms mostly surrounded by it, and the planters at its edge; `touched` = every wall the flood met (the flat's
 * unclosed walls go into the draft too). Without a click: the largest region grown across partitions and doors.
 */
function pickFlat(
  d: Draft,
  at: Pt | null,
  core: Pt[] = [],
  budgetSqm = Infinity,
  names: { p: Pt; name: string }[] = [],
  /** cells the flood never enters: the outside, planters */
  blocked: (p: Pt) => boolean = () => false,
  /** of those, the planters: a planter face on the flooded floor's edge joins the flat as a planter */
  planter: (p: Pt) => boolean = () => false,
): { rooms: Set<Room>; open: boolean; touched: Set<string>; inFlood?: (p: Pt) => boolean } {
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
    // founder rule 3: the floor the flood from the click reaches; every closed face on it, the planters at its edge
    // the printed figure includes walls and a common share: the floor is about areaShare of it
    const fl = floodFlat(d, at, blocked, Number.isFinite(budgetSqm) ? budgetSqm * KNOBS.areaShare : KNOBS.defaultFlatSqm, names)
    const inner = new Map(d.rooms.map((r) => [r, insidePoint(r, d.unit, d.rooms)]))
    const onFloor = d.rooms.filter((r) => ok(r) && fl.inFlood(inner.get(r)!))
    // a closed room the flood could not enter (its door not found, or carried over as wall) but mostly surrounded by
    // the flat — at least 60 % of its perimeter on walls the flood touched or the flat's rooms own — is the flat's too;
    // the next flat's room shares one party wall only
    const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
    const len = (wid: string) => d2(V.get(W.get(wid)!.a)!, V.get(W.get(wid)!.b)!)
    for (let it = 0; it < 3; it++) {
      const flatWalls = new Set([...fl.touched, ...onFloor.flatMap((r) => r.wallIds)])
      const more = d.rooms.filter((r) => ok(r) && !onFloor.includes(r) && !blocked(inner.get(r)!) && r.areaSqm < 30 && r.wallIds.reduce((t, w) => t + (flatWalls.has(w) ? len(w) : 0), 0) >= 0.6 * r.wallIds.reduce((t, w) => t + len(w), 0))
      if (!more.length) break
      onFloor.push(...more)
    }
    const edge = d.rooms.filter((r) => ok(r) && !onFloor.includes(r) && planter(inner.get(r)!) && r.wallIds.some((w) => fl.touched.has(w)))
    if (!onFloor.length) return { rooms: new Set(edge), open: true, touched: fl.touched, inFlood: fl.inFlood }
    const rooms = new Set([...onFloor, ...edge])
    // open = flooded floor no closed face covers (an open plan, or walls the tracer could not close)
    const covered = onFloor.reduce((t, r) => t + r.areaSqm, 0)
    return { rooms, open: fl.sqm > covered + 2, touched: fl.touched, inFlood: fl.inFlood }
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
  return { rooms: best, open: false, touched: new Set() }
}

/**
 * The flat from the fitted rooms (tracks + rooms, wave 19): the room the click is in, and every fitted room reached from
 * it across shared boundaries — a door or nothing drawn costs 1, a window 2, a wall 3 — each room going to the nearest
 * of the click and the rival seeds (a one-per-flat name printed twice: the farther print on the sheet is the next flat's). Lobby /
 * lift / stair rooms and planters join when reached but lead nowhere (the next flat lies beyond them). Faces: those holding
 * a picked room's seed and no other room's (nor a core label); then closed faces with no seed at all (AOD, shafts,
 * rooms with no size read) beside them, inside the picked rooms' box. Walls kept: the faces', and every wall lying
 * mostly along / inside a picked room (its sides that close no face). A click in no fitted room (an unsized dining)
 * starts from the nearest one within 4 m; null when there is none (the caller floods instead).
 */
function pickByRooms(d: Draft, fits: RoomFit[], k: number, at: Pt, core: Pt[], outside: (p: Pt) => boolean): { rooms: Set<Room>; open: boolean; touched: Set<string>; fits: number[]; others: number[]; inFlood?: (p: Pt) => boolean } | null {
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const R: Box[] = fits.map((f) => ({ x0: (f.rect.x0 - 0.5) / k, y0: (f.rect.y0 - 0.5) / k, x1: (f.rect.x1 - 0.5) / k, y1: (f.rect.y1 - 0.5) / k }))
  const inR = (r: Box, p: Pt, m = 0) => p.x >= r.x0 - m && p.x <= r.x1 + m && p.y >= r.y0 - m && p.y <= r.y1 + m
  const seed = (i: number): Pt => ({ x: fits[i].at.x / k, y: fits[i].at.y / k })
  const name = (i: number) => normaliseName(fits[i].label.text.split('\n')[0])
  const isCore = (i: number) => CORE_NAME.test(name(i))
  const leaf = (i: number) => !!fits[i].label.green || /\b(PLANTER|SUNSHADE)\b/.test(name(i))
  const n = fits.length
  let start = R.findIndex((r) => inR(r, at))
  if (start < 0) {
    const near = R.map((r, i) => ({ i, d: Math.hypot(Math.max(r.x0 - at.x, 0, at.x - r.x1), Math.max(r.y0 - at.y, 0, at.y - r.y1)) })).sort((p, q) => p.d - q.d)[0]
    if (near && near.d <= 4) start = near.i
  }
  if (start < 0 || isCore(start)) return null
  // (the outside mask also takes the largest closed paper region: when that is the click's own, it bounds nothing — as in floodFlat)
  if (outside(seed(start))) outside = () => false
  // boundaries between fitted rooms: facing faces −0.05 … 0.45 m apart, overlapping ≥ 0.3 m; the cost from what the
  // two edges read along the shared span
  const walk = (i: number, side: Side, lo: number, hi: number) => {
    let door = 0, win = 0
    for (const s of fits[i].edges.find((x) => x.side === side)!.stretches) {
      const ov = Math.min(hi, s.u1 / k) - Math.max(lo, s.u0 / k)
      if (ov <= 0) continue
      if (s.kind === 'door' || s.kind === 'open') door += ov
      else if (s.kind === 'window') win += ov
    }
    return door >= 0.4 ? 1 : win >= 0.4 ? 2 : 3
  }
  const adj: { j: number; cost: number }[][] = fits.map(() => [])
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const a = R[i], b = R[j]
      for (const [gap, lo, hi, si, sj] of [
        [b.x0 - a.x1, Math.max(a.y0, b.y0), Math.min(a.y1, b.y1), 'right', 'left'],
        [b.y0 - a.y1, Math.max(a.x0, b.x0), Math.min(a.x1, b.x1), 'bottom', 'top'],
      ] as [number, number, number, Side, Side][]) {
        if (gap < -0.05 || gap > 0.45 || hi - lo < 0.3) continue
        const cost = Math.min(walk(i, si, lo, hi), walk(j, sj, lo, hi))
        adj[i].push({ j, cost })
        adj[j].push({ j: i, cost })
      }
    }
  // Dijkstra from the sources (a sheet has a few dozen labels: the plain O(n²) form); equal distances go to the rival
  const dijkstra = (src: number[]) => {
    const dist = new Array<number>(n).fill(Infinity), own = new Array<number>(n).fill(-1), done = new Array<boolean>(n).fill(false)
    src.forEach((s, o) => ((dist[s] = 0), (own[s] = o)))
    for (;;) {
      let i = -1
      for (let q = 0; q < n; q++) if (!done[q] && dist[q] < Infinity && (i < 0 || dist[q] < dist[i] || (dist[q] === dist[i] && own[q] > own[i]))) i = q
      if (i < 0) return { dist, own }
      done[i] = true
      if (isCore(i) || (leaf(i) && dist[i] > 0)) continue
      for (const { j, cost } of adj[i]) {
        if (outside(seed(j))) continue
        const nd = dist[i] + cost
        if (nd < dist[j] || (nd === dist[j] && own[i] > own[j])) (dist[j] = nd), (own[j] = own[i])
      }
    }
  }
  const alone = dijkstra([start])
  const byName = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const nm = name(i)
    if (alone.dist[i] < Infinity && /\d|\b(LIVING|DINING|KITCHEN|FOYER)\b/.test(nm) && !/\b(AOD|LIFTS?|STAIRS?|LOBBY|VER|VERANDAH?)\b/.test(nm)) byName.set(nm, [...(byName.get(nm) ?? []), i])
  }
  // (the print nearer the click on the sheet is this flat's: a room behind walls is far in steps, not on the floor)
  const far = (i: number) => d2(seed(i), at)
  const rivals = [...byName.values()].flatMap((is) => is.sort((p, q) => far(p) - far(q)).slice(1)).filter((i) => i !== start)
  const { own } = dijkstra([start, ...rivals])
  const mine = fits.map((_, i) => i).filter((i) => own[i] === 0)
  // faces: a picked room's seed and nobody else's; then seedless closed faces beside them
  const polys = new Map(d.rooms.map((r) => [r, roomPolygon(r, d.unit)]))
  const holds = (r: Room, p: Pt) => pointInPolygon(p, polys.get(r)!)
  // (a core room reached joins as a leaf — never passed through: the next flat's rooms beyond it are a rival's)
  const others = [...fits.map((_, i) => i).filter((i) => own[i] !== 0).map(seed), ...core.filter((p) => !mine.some((i) => inR(R[i], p)))]
  const ok = (r: Room) => r.areaSqm <= KNOBS.maxRoomSqm && !others.some((p) => holds(r, p))
  const rooms = new Set(d.rooms.filter((r) => ok(r) && mine.some((i) => holds(r, seed(i)))))
  const box: Box = { x0: Math.min(...mine.map((i) => R[i].x0)), y0: Math.min(...mine.map((i) => R[i].y0)), x1: Math.max(...mine.map((i) => R[i].x1)), y1: Math.max(...mine.map((i) => R[i].y1)) }
  for (let it = 0; it < 2; it++) {
    const walls = new Set([...rooms].flatMap((r) => r.wallIds))
    for (const r of d.rooms) {
      if (rooms.has(r) || !ok(r) || r.areaSqm > 30 || fits.some((_, i) => holds(r, seed(i)))) continue
      const p = insidePoint(r, d.unit, d.rooms)
      if (inR(box, p, 0.4) && !outside(p) && r.wallIds.some((w) => walls.has(w))) rooms.add(r)
    }
  }
  const touched = new Set([...rooms].flatMap((r) => r.wallIds))
  const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
  for (const w of d.walls) {
    if (touched.has(w.id)) continue
    const a = V.get(w.a)!, b = V.get(w.b)!, L = d2(a, b)
    const N = Math.max(2, Math.ceil(L / 0.05)), m = w.thicknessM / 2 + 0.15
    let inside = 0
    for (let q = 0; q < N; q++) {
      const t = (q + 0.5) / N
      if (mine.some((i) => inR(R[i], { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, m))) inside++
    }
    if (inside >= 0.5 * N || (inside * L) / N >= 0.5) touched.add(w.id)
  }
  // the next flat's rooms (a rival reached them first) and the core: what bounds the flood; rooms reached by neither are open
  const bound = fits.map((_, i) => i).filter((i) => own[i] > 0 || isCore(i))
  return { rooms, open: false, touched, fits: mine, others: bound }
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

/**
 * Founder 2026-10-03 (Sheltech A "Space 6" under DINING: a dashed beam line): a passage — the open-plan boundary merge.ts
 * draws where a room's side is open — between a space whose name was read (`named`) and one with no name of its own (no
 * label, no hint: `hinted`) never splits them: the unnamed face joins its named neighbour. A space that is no closed face
 * is no neighbour (the passage then still closes the named room).
 */
export function mergeUnread(d: Draft, named: Pt[], hinted: Pt[]): Draft {
  for (let it = 0; it < 20; it++) {
    const rooms = deriveRooms(d.unit)
    const polys = rooms.map((r) => roomPolygon(r, d.unit))
    const has = (i: number, pts: Pt[]) => pts.some((p) => pointInPolygon(p, polys[i]))
    const side = new Map<string, number[]>()
    rooms.forEach((r, i) => new Set(r.wallIds).forEach((w) => side.set(w, [...(side.get(w) ?? []), i])))
    const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
    const cut = d.walls.find((w) => {
      const s = side.get(w.id) ?? []
      const open = w.openings.filter((o) => o.kind === 'passage').reduce((t, o) => t + o.widthM, 0)
      if (s.length !== 2 || open < 0.9 * d2(V.get(w.a)!, V.get(w.b)!)) return false
      const [p, q] = s.map((i) => has(i, named))
      return p !== q && !has(p ? s[1] : s[0], hinted)
    })
    if (!cut) return it ? { ...d, rooms: deriveRooms(d.unit) } : d
    const walls = d.walls.filter((w) => w !== cut)
    const used = new Set(walls.flatMap((w) => [w.a, w.b]))
    const m = mergeCollinear(d.unit.vertices.filter((v) => used.has(v.id)), walls)
    d = { ...d, unit: { ...d.unit, vertices: m.vertices, walls: m.walls.map(stripWall) }, walls: m.walls }
  }
  return { ...d, rooms: deriveRooms(d.unit) }
}

/**
 * Keep the picked faces' walls (+ loose walls inside them) and `extra` walls (those the flood touched: the flat's walls
 * that close no face yet, so the human closes a gap instead of redrawing a wall), re-merge, re-derive.
 */
function restrict(d: Draft, keep: Set<Room>, extra: Set<string> = new Set()): Draft {
  const ids = new Set([...[...keep].flatMap((r) => r.wallIds), ...extra])
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
  return { unit, walls: m.walls, rooms: deriveRooms(unit), th0: d.th0, resumed: d.resumed, stairs: d.stairs, gaps: d.gaps }
}

// ───────────────────────────────────────────────────────────────── labels, openings, checks

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
/** the building core's names — read loosely (the reader's L088Y / L0BBY is the lobby) */
const CORE_NAME = /\b(L[O0][B8]{2}Y|LIFTS?|STAIRS?|HOISTWAY|CORE)\b/
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
  // text first (founder): letters and size marks touching walls come out of the raster before the walls are traced
  const plan = KNOBS.eraseText ? eraseText(gray, text) : gray
  const ink = { ...inkMasks(plan), glass: opts.rgb ? glassMask(opts.rgb) : undefined }
  // founder rule 2: plant sections before any wall tracing (sized by the raster's own wall width, the 5" prior)
  const plants = planterMask(plan, ink.wall, opts.pxPerM ?? thicknessOf(wallHalfWidth(edt(ink.wall, gray.width, gray.height), gray.width, gray.height)) / PARTITION_M, inputs.green)
  const tracker = opts.tracker ?? KNOBS.tracker
  // tracks: the plant green comes out before tracing (founder rule 2), the glass colour is window evidence
  const masks = tracker === 'tracks' ? { plant: inputs.green, glass: ink.glass } : {}
  let trace = inputs.walls ?? traceWalls(plan, { tracker, ...masks })
  opts.onProgress?.('scale', 0.5)

  // ── scale
  let pxPerM = opts.pxPerM ?? thicknessScale(trace.walls)
  let scaleFrom: AutoTraceStats['scaleFrom'] = opts.pxPerM ? 'given' : 'thickness'
  // tracks: the rooms' printed sizes fitted onto the ink ARE the scale (rooms.ts calibrateScale: ≥ 3 sized labels whose
  // fits agree); the line weight / dims-in-faces / area guesses below stay the fallback. With too few clear sides for
  // its refinement (rooms 0) the scan alone is still the scale where ≥ 4 printed sizes sit best on the ink — flagged
  let scaleFew = false
  if (!opts.pxPerM && tracker === 'tracks') {
    const s = calibrateScale(gray, text.items, { tracks: trace.tracks?.lines.tracks })
    const sized = text.items.filter((it) => (it.kind === 'room' || it.kind === 'dims') && it.dims).length
    if (s && ((s.rooms >= 3 && s.spread <= 0.08) || (s.rooms === 0 && sized >= 4))) (pxPerM = s.pxPerM), (scaleFrom = 'dims'), (scaleFew = s.rooms === 0)
  }
  const origin0 = { x: 0, y: 0 }
  let draft: Draft
  // the building core's labels (lobby, lifts, stair) and planter strips: part of the draft when reached, never a way
  // into the next flat
  const coreAt = (k: number) =>
    text.items
      .filter((it) => it.kind === 'room' && (it.green || CORE_NAME.test(normaliseName(it.text.split('\n')[0]))))
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
  if (!opts.pxPerM && scaleFrom !== 'dims') {
    draft = buildGraph(trace, pxPerM, origin0, gray, ink, [], tracker)
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
  if (Math.abs(pxPerM / thicknessScale(trace.walls) - 1) > 0.15) trace = traceWalls(plan, { halfPx, tracker, ...masks })
  let hints = inputs.hints ?? null
  try {
    hints ??= inputs.findHints?.(pxPerM, trace) ?? null
  } catch {
    hints = null // a hint stage failure never costs the draft
  }
  // follow thin strokes from dangling wall ends; never inside a drawn fixture (bed, table, wc, basin, stove, sink)
  const FIX_R: Record<string, number> = { bed: 1, table: 0.8, dining: 0.8, wc: 0.4, basin: 0.4, sink: 0.4, stove: 0.4 }
  const avoid = (hints?.hints ?? []).filter((h) => h.source === 'fixture').map((h) => ({ at: h.at, r: (FIX_R[h.what ?? ''] ?? 0.5) * pxPerM, kind: h.kind }))
  const tracked = KNOBS.track ? trackThin(plan, trace, { pxPerM, avoid, delta: KNOBS.lineDelta }) : []
  opts.onProgress?.('graph', 0.7)

  // ── tracks: one rectangle per sized label fitted onto the ink (edges snapped to the track faces); its edges decide
  // the tracks' undecided gaps and add what no track has (merge.ts)
  let fits: RoomFit[] = []
  let merged: RoomsOnTracks | null = null
  if (tracker === 'tracks' && trace.tracks) {
    fits = fitRooms(gray, text.items, { pxPerM, rgb: opts.rgb, tracks: trace.tracks.lines.tracks })
    if (fits.length) {
      const labels = text.items.filter((it) => it.kind === 'room').map((it) => ({ x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 }))
      merged = roomsOnTracks(trace.tracks.lines, trace.tracks.angled, fits, pxPerM, { gray, rgb: opts.rgb, labels: [...labels, ...fits.map((f) => f.at)] })
      trace = { ...trace, walls: merged.walls, openings: merged.openings }
    }
  }
  // (on the sheet as drawn: the text pass erases thin ink inside label boxes, and an AOD's label box often covers its grille)
  const thin = tracker === 'tracks' && trace.tracks ? closeThinFaces(gray, trace, pxPerM, text, fits, avoid, inputs.green) : null
  if (thin) trace = { ...trace, walls: [...trace.walls, ...thin.walls] }

  // ── graph at the final scale, the flat, then its own origin
  draft = buildGraph(trace, pxPerM, origin0, gray, ink, tracked, tracker)
  if (inputs.debug) Object.assign(inputs.debug, { trace, plan, full: draft.unit, fullWalls: draft.walls, plants, fits, merged, thin })
  const pick = pickM(pxPerM, origin0)
  // founder rules 2 + 3: grow from the click over the floor; the outside and the planters bound it (a face with a printed
  // SUNSHADE / PLANTER label counts as planter too)
  // (the low walls of the small faces faces.ts closed shut them to the outside too: an AOD's grille is dashes, no barrier)
  const shut = (thin?.faces ?? []).filter((f) => f.areaSqm <= FACES.aodMax).flatMap((f) => f.walls.map((i) => thin!.walls[i]))
  const outside = outsideMask(ink.weak, shut.length ? withWalls(ink.wall, gray.width, gray.height, shut) : ink.wall, gray.width, gray.height, pxPerM)
  const greenFaces = text.items
    .filter((it) => it.kind === 'room' && it.green)
    .flatMap((it) => {
      const c = { x: (it.box.x + it.box.w / 2) / pxPerM, y: (it.box.y + it.box.h / 2) / pxPerM }
      const f = draft.rooms.filter((r) => r.areaSqm <= KNOBS.maxRoomSqm && pointInPolygon(c, roomPolygon(r, draft.unit))).sort((p, q) => p.areaSqm - q.areaSqm)[0]
      return f ? [roomPolygon(f, draft.unit)] : []
    })
  const px = (m: Uint8Array) => (p: Pt) => {
    const x = Math.round(origin0.x + p.x * pxPerM), y = Math.round(origin0.y + p.y * pxPerM)
    return x >= 0 && y >= 0 && x < gray.width && y < gray.height && m[y * gray.width + x] === 1
  }
  const inPlants = px(plants), inOutside = px(outside)
  const isPlanter = (p: Pt) => inPlants(p) || greenFaces.some((f) => pointInPolygon(p, f))
  // a stair flight is the building's core: the flat never grows through it
  const inStair = (p: Pt) => (draft.stairs ?? []).some((s) => { const x = origin0.x + p.x * pxPerM, y = origin0.y + p.y * pxPerM; return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1 })
  // the building's core (a closed face a LOBBY / LIFT / STAIR label sits in) is never the flat's floor: the flood does
  // not walk through it into the next flat's foyer
  const coreFaces = coreAt(pxPerM).flatMap((c) => draft.rooms.filter((r) => r.areaSqm <= KNOBS.maxRoomSqm && pointInPolygon(c, roomPolygon(r, draft.unit))).map((r) => roomPolygon(r, draft.unit)))
  // …and where that face is not closed (a lobby whose double doors were not read), the floor within 1.2 m of its label:
  // a lobby is a corridor ~2 m deep, so the flood cannot walk along it past its name
  const corePts = coreAt(pxPerM)
  const inCore = (p: Pt) => coreFaces.some((f) => pointInPolygon(p, f)) || corePts.some((c) => d2(c, p) < 1.2)
  // tracks + ≥ 3 fitted rooms: the flat is the fitted rooms around the click (pickByRooms) — plus what the flood from the
  // click reaches where no room was fitted (labels not read), the flood never entering a room fitted to the next flat or
  // the core (those rooms bound it, so it cannot leak through an open gap into them)
  const byRooms = tracker === 'tracks' && pick && fits.length >= 3 ? pickByRooms(draft, fits, pxPerM, pick, coreAt(pxPerM), inOutside) : null
  const otherRects = byRooms ? byRooms.others.map((i) => fits[i].rect) : []
  const inOther = (p: Pt) => otherRects.some((r) => p.x * pxPerM >= r.x0 && p.x * pxPerM <= r.x1 - 1 && p.y * pxPerM >= r.y0 && p.y * pxPerM <= r.y1 - 1)
  const flood = pickFlat(draft, pick, coreAt(pxPerM), budget, namesAt(pxPerM), (p) => inOutside(p) || isPlanter(p) || inStair(p) || inCore(p) || inOther(p), isPlanter)
  const picked = byRooms ? { ...flood, rooms: new Set([...byRooms.rooms, ...flood.rooms]), touched: new Set([...byRooms.touched, ...flood.touched]), open: false } : flood
  if (inputs.debug && byRooms) inputs.debug.flatFits = byRooms.fits
  let flat = picked.rooms
  if (thin?.walls.length) {
    // (with too few fitted rooms to say whose a face is — the flood picked the flat — only AOD-sized ones join)
    const ns = byRooms ? thinFacesOfFlat(draft, picked.rooms, fits, byRooms.fits, byRooms.others, pxPerM, thin) : thinFacesOfFlat(draft, picked.rooms, fits, [], [], pxPerM, thin, FACES.aodMax)
    flat = ns.rooms
    ns.drop.forEach((w) => picked.touched.delete(w))
  }
  // founder (2026-09-30): the draft is the flat's WALLS. Every wall beside the flooded floor is the flat's — not only
  // the ones a flooded cell touches (a wall behind a closet or a fixture, the far side of a room the flood did not
  // fill): any wall with a point within 1 m of the floor, tested across it, stays
  if (picked.inFlood) {
    const VV = new Map(draft.unit.vertices.map((v) => [v.id, v]))
    for (const w of draft.walls) {
      if (picked.touched.has(w.id)) continue
      const a = VV.get(w.a)!, b = VV.get(w.b)!
      const L = d2(a, b)
      if (L < 1e-6) continue
      const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, nrm = { x: -dir.y, y: dir.x }
      let near = false
      for (let m = 0.15; m < L && !near; m += 0.3)
        for (const off of [0.3, -0.3, 0.6, -0.6, 1, -1]) if (picked.inFlood({ x: a.x + dir.x * m + nrm.x * off, y: a.y + dir.y * m + nrm.y * off })) { near = true; break }
      if (near) picked.touched.add(w.id)
    }
  }
  if (inputs.debug) Object.assign(inputs.debug, { inFlood: picked.inFlood, touched: picked.touched, outside })
  if (picked.open) review.push({ id: newId(), at: pick!, kind: 'unclosed', message: 'Part of the floor around the click has no closed room — an open plan, or walls the tracer could not close (see the wall ends marked). Draw the missing walls.' })
  if (!flat.size && !picked.touched.size) flat = new Set(draft.rooms.filter((r) => r.areaSqm <= KNOBS.maxRoomSqm && (!pick || d2(r.centroid, pick) < 10)))
  if (flat.size || picked.touched.size) draft = dropSlivers(restrict(draft, flat, picked.touched))
  if (tracker === 'tracks') {
    const at = (it: (typeof text.items)[number]) => ({ x: (it.box.x + it.box.w / 2) / pxPerM, y: (it.box.y + it.box.h / 2) / pxPerM })
    const named = text.items.filter((it) => it.kind === 'room' && it.roomKind).map(at)
    // (any text read there — a name read wrong, a size alone, a garbage read of a label — is a name of its own)
    const hinted = [...text.items.map((it) => ({ at: { x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 } })), ...(hints?.hints ?? []).filter((h) => h.kind), ...(thin?.faces ?? []).filter((f) => f.aod || f.planter), ...(draft.stairs ?? []).map((s) => ({ at: { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 } }))].map((h) => ({ x: h.at.x / pxPerM, y: h.at.y / pxPerM }))
    draft = mergeUnread(draft, named, hinted)
  }
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
  // a stair flight names its face when no label does (founder rule 6), flagged like every other guess
  const stairHints: RoomHint[] = (draft.stairs ?? []).map((s) => ({ at: { x: (s.x0 + s.x1) / 2, y: (s.y0 + s.y1) / 2 }, kind: 'other', source: 'fixture', what: 'stair treads', conf: 0.9 }))
  // a small unlabelled face closed by thin lines (faces.ts): offered as an AOD, flagged like every other guess
  // (and a green one as a planter)
  const aodHints: RoomHint[] = (thin?.faces ?? []).flatMap((f): RoomHint[] => (f.aod ? [{ at: f.at, kind: 'other', source: 'fixture', what: AOD_HINT, conf: 0.5 }] : f.planter && !f.labelled ? [{ at: f.at, kind: 'balcony', green: true, source: 'green', conf: 0.6 }] : []))
  for (const h of [...(hints?.hints ?? []), ...stairHints, ...aodHints]) {
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
    roomLabels.push({ id, name: h.green ? 'Planter' : h.what === 'stair treads' ? 'Stair' : h.what === AOD_HINT ? 'AOD' : `${KIND_NAME[kind]} ${n}`, kind, ...at })
    labelled++
    const what = h.source === 'colour' ? 'the fill colour of named rooms' : h.source === 'green' ? 'the green (planter) fill' : h.what === AOD_HINT ? 'its size and thin-line sides (an AOD / shaft, no door?)' : (h.what ?? 'a drawn fixture')
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
    // a wide opening the wall stage read in pieces (a slider's leaf line splits its gap): touching openings on one
    // wall are one run, and the run's width decides slider or window
    const runOf = new Map<string, number>()
    const sorted = [...w.openings].sort((p, q) => p.offsetM - q.offsetM)
    for (let i = 0; i < sorted.length; ) {
      let j = i, end = sorted[i].offsetM + sorted[i].widthM
      while (j + 1 < sorted.length && sorted[j + 1].offsetM <= end + 0.15) end = Math.max(end, sorted[++j].offsetM + sorted[j].widthM)
      for (let t = i; t <= j; t++) runOf.set(sorted[t].id, end - sorted[i].offsetM)
      i = j + 1
    }
    w.openings = w.openings.flatMap((o) => {
      if (o.widthM < 0.3) return []
      const gs = g?.guess?.get(o.id)
      let kind: OpeningKind = o.kind
      const wet = kinds.includes('bath')
      const veranda = kinds.includes('balcony')
      // one room only: the outside (or an unclosed open area — then the review item says so)
      // (a swing the drawing shows stays a door: with gaps left open, "one room only" is often an open neighbour)
      if (gs?.kind === 'window' || (outside && gs?.kind !== 'door' && gs?.kind !== 'passage' && (kind !== 'door' || wet))) kind = 'window'
      if (veranda && (runOf.get(o.id) ?? o.widthM) >= 1.2 && !outside) kind = 'slider'
      // (not a tracks + rooms passage: nothing at all is drawn there — no door is invented)
      if (!outside && kind === 'passage' && o.widthM <= 1.1 && !kinds.includes('other') && gs?.kind !== 'passage') kind = 'door'
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
        const why = !gs ? 'a gap with nothing drawn in it' : gs.kind === 'passage' ? 'nothing drawn across it, nor on the rooms\' edges: open, or a door whose swing is not drawn' : gs.kind === kind ? 'faint evidence' : gs.kind === 'unknown' ? `no clear symbol, rooms say ${kind}` : `drawn like a ${gs.kind}, rooms say ${kind}`
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
  // tracks: a gap in a wall with nothing drawn in it (no arc, no glazing) stays open — one item for both of its jambs
  const jambs = new Set<string>()
  for (const g of draft.gaps ?? []) {
    const a = { x: g.a.x - shift.x, y: g.a.y - shift.y }, b = { x: g.b.x - shift.x, y: g.b.y - shift.y }
    const ends = u.vertices.filter((v) => deg.get(v.id) === 1 && (d2(v, a) < 0.03 || d2(v, b) < 0.03))
    if (!ends.length) continue // not this flat's
    ends.forEach((v) => jambs.add(v.id))
    review.push({ id: newId(), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'unclosed', message: `A ${formatFeetInches(d2(a, b))} gap in the wall with no door swing or window drawn in it — a door, a window, or open?`, entityId: ends[0].id })
  }
  for (const [vid, n] of deg) if (n === 1 && !jambs.has(vid)) review.push({ id: newId(), at: V.get(vid)!, kind: 'unclosed', message: 'A wall ends here without meeting another — close it or delete it', entityId: vid })
  for (const w of draft.walls)
    if (w.bridge === 'track' && d2(V.get(w.a)!, V.get(w.b)!) >= 3) {
      const a = V.get(w.a)!, b = V.get(w.b)!
      review.push({ id: newId(), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'low-confidence', message: 'Wall followed along a long thin line — railing, glass or furniture?', entityId: w.id })
    } else if (w.bridge === 'ink' && !w.openings.length && d2(V.get(w.a)!, V.get(w.b)!) >= 0.6) {
      const a = V.get(w.a)!, b = V.get(w.b)!
      review.push({ id: newId(), at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, kind: 'low-confidence', message: 'Closed along a thin line — railing, glass or a window?', entityId: w.id })
    }
  // founder rule 4 carried a wall across a gap with nothing drawn in it: a door whose swing was not found, or an opening
  for (const r of draft.resumed ?? []) {
    if (!r.empty || r.L < 0.5) continue
    const at = { x: r.at.x - shift.x, y: r.at.y - shift.y }
    const w = u.walls.find((x) => segDist(at, V.get(x.a)!, V.get(x.b)!) < 0.05)
    if (w) review.push({ id: newId(), at, kind: 'opening-guess', message: `Wall carried on across a ${formatFeetInches(r.L)} gap with nothing drawn in it — a door (no swing found) or an opening?`, entityId: w.id })
  }
  // tracks + rooms: room-edge stretches left for the human (thin / open / unsure / readings that disagree), the low walls
  // added along thin lines — those of this flat (in its picked rooms, else in the draft's box)
  // lever 2: the low walls along thin lines and the AODs offered (faces.ts) — those on this flat's walls / in its rooms
  for (const m of thin?.review ?? []) {
    const a = toM(m.a), b = toM(m.b), at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    if (u.walls.some((w) => segDist(at, V.get(w.a)!, V.get(w.b)!) < 0.05) || named.some((r) => pointInPolygon(at, roomPolygon(r, u)))) review.push({ id: newId(), at, kind: 'low-confidence', message: m.message })
  }
  if (merged) {
    const inFlat = (p: Pt) => {
      const q = { x: p.x + shift.x, y: p.y + shift.y } // pre-shift metres = sheet px / k
      if (byRooms) return byRooms.fits.some((i) => { const r = fits[i].rect; return q.x >= (r.x0 - 0.5) / pxPerM - 0.3 && q.x <= (r.x1 - 0.5) / pxPerM + 0.3 && q.y >= (r.y0 - 0.5) / pxPerM - 0.3 && q.y <= (r.y1 - 0.5) / pxPerM + 0.3 })
      return u.vertices.length > 0 && p.x >= -0.2 && p.y >= -0.2 && p.x <= Math.max(...u.vertices.map((v) => v.x)) + 0.2 && p.y <= Math.max(...u.vertices.map((v) => v.y)) + 0.2
    }
    const KIND: Record<string, ReviewItem['kind']> = { low: 'low-confidence', conflict: 'low-confidence', thin: 'unclosed', open: 'unclosed', unsure: 'unclosed', 'gap-thin': 'unclosed' }
    for (const m of merged.review) {
      const at = toM({ x: (m.a.x + m.b.x) / 2, y: (m.a.y + m.b.y) / 2 })
      if (inFlat(at)) review.push({ id: newId(), at, kind: KIND[m.kind], message: m.message })
    }
  }
  // the rooms' areas against the printed flat area (walls and a common share are in the printed figure: ≈ areaShare)
  if (Number.isFinite(budget) && named.length) {
    const sum = named.reduce((t, r) => t + r.areaSqm, 0), want = budget * KNOBS.areaShare
    if (Math.abs(sum / want - 1) > 0.12)
      review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'other', message: `The rooms add up to ${Math.round(sum / (FT * FT))} sft; the printed ${Math.round(budget / (FT * FT))} sft flat should give about ${Math.round(want / (FT * FT))} — a room ${sum < want ? 'is missing or still open' : 'too many (the next flat\'s, or the lobby)'}` })
  }
  // a printed size the reader saw but could not read: the human types it (its guess, when the drawing confirmed the
  // guessed rectangle, is offered — never taken as the printed size)
  for (const it of text.items) {
    if (it.kind !== 'room' || !it.sizeUnread || it.dims) continue
    const at = toM({ x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 })
    const r = named.find((x) => pointInPolygon(at, roomPolygon(x, u)))
    if (!r) continue
    const fitted = fits.some((f) => f.guessed && f.label === it)
    const msg = fitted ? `${r.name}: printed size not read for sure — it looks like ${it.sizeGuess} (the walls fit that); type the size to confirm` : `${r.name}: its printed size could not be read${it.sizeGuess ? ` (perhaps ${it.sizeGuess})` : ''} — type it`
    review.push({ id: newId(), at, kind: 'other', message: msg, entityId: r.id })
  }
  if (scaleFew) review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'scale', message: 'Scale from a few printed room sizes only — check one printed length' })
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
    stats: {
      ms: Math.round(performance.now() - t0),
      pxPerM,
      scaleFrom,
      tracker,
      walls: u.walls.length,
      rooms: named.length,
      labelled,
      ...(fixtures.length ? { fixtures } : {}),
      ...(tracker === 'tracks' ? { fitted: fits.length, gapsDecided: Object.values(merged?.stats.decided ?? {}).reduce((t, x) => t + x, 0) } : {}),
    },
  }
}

/** the hint faces.ts's small unlabelled faces become (named "AOD", kind 'other', flagged) */
const AOD_HINT = 'AOD (thin-line face)'

/**
 * Lever 2 (faces.ts): after the track walls + the rooms' pieces, the faces only THIN ink closes (AOD grilles, slab
 * edges, railings, light-grey shaft walls) — low walls, never full height. Lines inside a fitted room or across a drawn
 * fixture are furniture; printed labels say which side is which room.
 */
function closeThinFaces(sheet: Gray, trace: WallTrace, k: number, text: TextTrace, fits: RoomFit[], fixtures: { at: Px; r: number }[], green?: Uint8Array): ThinFaces {
  const labels = text.items.filter((it) => it.kind === 'room').map((it) => ({ at: { x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 }, name: normaliseName(it.text.split('\n')[0]) }))
  return thinFaces(sheet, { k, walls: trace.walls, openings: trace.openings, labels, fits: fits.map((f) => f.rect), fixtures, green })
}

/**
 * Lever 2: the faces faces.ts's low walls closed (an AOD, a planter, a veranda's open side), holding none of this flat's
 * fitted rooms, belong to the flat when they lie against its rooms (a full-height wall shared with a picked room, or
 * inside the box of its fitted rooms + 0.4 m) — also when the pick did not reach them — unless they are shared: against
 * a room fitted to another flat or the core, or between two rooms of one name (a planter strip between two flats).
 */
function thinFacesOfFlat(d: Draft, rooms: Set<Room>, fits: RoomFit[], mine: number[], others: number[], k: number, thin: ThinFaces, maxSqm = Infinity): { rooms: Set<Room>; drop: Set<string> } {
  // (the draft's pieces of faces.ts's walls and its new faces: the draft is in sheet px / k here, before the shift)
  const V = new Map(d.unit.vertices.map((v) => [v.id, v]))
  const onThin = (p: Pt) => thin.walls.some((s) => segDist(p, { x: s.a.x / k, y: s.a.y / k }, { x: s.b.x / k, y: s.b.y / k }) < 0.01)
  const newAt = thin.faces.map((f) => ({ x: f.at.x / k, y: f.at.y / k, named: f.labelled }))
  const low = new Set(d.walls.filter((w) => w.heightM < WALL_HEIGHT_M && onThin({ x: (V.get(w.a)!.x + V.get(w.b)!.x) / 2, y: (V.get(w.a)!.y + V.get(w.b)!.y) / 2 })).map((w) => w.id))
  const rect = (i: number, m: number) => ({ x0: (fits[i].rect.x0 - 0.5) / k - m, y0: (fits[i].rect.y0 - 0.5) / k - m, x1: (fits[i].rect.x1 - 0.5) / k + m, y1: (fits[i].rect.y1 - 0.5) / k + m })
  const inB = (b: ReturnType<typeof rect>, v: Pt) => v.x >= b.x0 && v.x <= b.x1 && v.y >= b.y0 && v.y <= b.y1
  const theirs = others.map((i) => rect(i, 0.3))
  const all = fits.map((f, i) => ({ b: rect(i, 0.3), name: normaliseName(f.label.text.split('\n')[0]).replace(/\s+/g, '') }))
  const ours = mine.map((i) => ({ x: fits[i].at.x / k, y: fits[i].at.y / k }))
  const bs = mine.map((i) => rect(i, 0.4))
  const box = { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) }
  // (a face faces.ts made: what was left of a closed room it split is that room still)
  const isThin = (r: Room) => r.wallIds.some((w) => low.has(w)) && newAt.some((p) => pointInPolygon(p, roomPolygon(r, d.unit)))
  const own = [...rooms].filter((r) => !isThin(r))
  const ownWalls = new Set(own.flatMap((r) => r.wallIds.filter((w) => !low.has(w))))
  const fitSeeds = fits.map((f) => ({ x: f.at.x / k, y: f.at.y / k }))
  const seeded = new Set(d.rooms.filter((r) => fitSeeds.some((p) => pointInPolygon(p, roomPolygon(r, d.unit)))))
  const byWall = new Map<string, Room[]>()
  for (const r of d.rooms) for (const w of r.wallIds) byWall.set(w, [...(byWall.get(w) ?? []), r])
  const ok = (r: Room) => {
    const poly = roomPolygon(r, d.unit)
    if (ours.some((p) => pointInPolygon(p, poly))) return true
    // another flat's fitted room; with no name printed in it, too big to take on no evidence
    if (seeded.has(r) || (r.areaSqm > maxSqm && !newAt.some((p) => p.named && pointInPolygon(p, poly)))) return false
    // against a fitted room this flat does not have: the next flat's
    if (r.wallIds.some((w) => (byWall.get(w) ?? []).some((n) => n !== r && seeded.has(n) && !rooms.has(n)))) return false
    // between two rooms of one name (BED 2 | strip | BED 2): two flats' rooms, the strip is shared
    const names = all.filter((f) => poly.some((v) => inB(f.b, v))).map((f) => f.name)
    if (names.length !== new Set(names).size || poly.some((v) => theirs.some((b) => inB(b, v)))) return false
    return inB(box, insidePoint(r, d.unit, d.rooms)) || r.wallIds.some((w) => ownWalls.has(w))
  }
  const keep = new Set([...own, ...[...rooms].filter((r) => isThin(r) && ok(r))])
  // (and those the pick did not reach)
  for (const r of d.rooms) if (!rooms.has(r) && r.areaSqm <= 30 && isThin(r) && r.wallIds.some((w) => ownWalls.has(w)) && ok(r)) keep.add(r)
  // its thin-line walls go too (else the walls kept around it close it again), unless a kept room uses them
  const used = new Set([...keep].flatMap((r) => r.wallIds))
  const drop = new Set([...rooms].filter((r) => !keep.has(r)).flatMap((r) => r.wallIds.filter((w) => low.has(w) && !used.has(w))))
  return { rooms: keep, drop }
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
  greenMask?: (rgb: NonNullable<AutoTraceOpts['rgb']>) => Uint8Array
}
/** hints.ts: loaded when it exists (Vite resolves the glob at build time), skipped when not. */
const HINTS = import.meta.glob<HintsModule>('./hints.ts')

export async function solve(gray: Gray, opts: AutoTraceOpts): Promise<AutoTraceResult> {
  const review: ReviewItem[] = []
  // text first (founder): its strokes are erased before the walls are traced (solveTraces)
  opts.onProgress?.('text', 0)
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
  opts.onProgress?.('walls', 0.4)
  const inputs: SolveInputs = {
    green: opts.rgb && m.greenMask ? m.greenMask(opts.rgb) : undefined,
    text,
    findHints: m.findHints && ((pxPerM, w) => (hints = m.findHints!(gray, opts.rgb, { pxPerM, walls: w }))),
    propagate: m.propagateByColour && opts.rgb ? (rooms) => (hints ? m.propagateByColour!(opts.rgb!, hints, rooms) : rooms.map(() => null)) : undefined,
  }
  const r = solveTraces(gray, inputs, opts)
  if (text.glyphPx !== undefined && text.glyphPx < 7)
    review.push({ id: newId(), at: { x: 0, y: 0 }, kind: 'other', message: `The print is small (${text.glyphPx.toFixed(0)} px letters) — a larger export or the PDF reads far better` })
  return { ...r, review: [...review, ...r.review] }
}
