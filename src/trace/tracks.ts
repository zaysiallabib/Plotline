/**
 * Wall TRACKS (wave 19, Docs/AUTOTRACE_STRATEGY.md §3): a drawn wall is an occupied stretch of a track — one straight
 * line per wall alignment on the sheet's axes — so parallel duplicates, fragments and tilted walls cannot be
 * represented at all, and nothing downstream has to stitch them.
 *
 *   plant green whitened (founder rule 2) → ink → per column / row every ink run across a would-be wall: its centre and
 *   sub-pixel width → bands (the same cross-section column after column, centre held within 1 px) → the sheet's own
 *   thickness classes (length-weighted band widths, 2–4 peaks, ≤ 0.35 m) → tracks: bands on ONE centre line (within
 *   30 % of the thinnest class), longest first; every wall-class cross-section belongs to the nearest track only →
 *   along each track: W = its own wall's cross-section, O = another wall's band, B = ink thick both ways (a crossing
 *   wall's body, a column, a junction block), paper (thin lines included) → an INTERVAL = W stretches bridged through
 *   B (≤ 0.8 m), never across paper or another wall; its ends are where the ink stops; thickness snapped to the
 *   classes, split where it changes (two near classes on one centre line are one wall) → an end inside (or covered by)
 *   a crossing wall's body or block sits exactly on that wall's track (corners, T's: one shared point, nothing
 *   averaged) → a flush thickness step is two tracks whose touching ends are joined by a short crosswise JOG (each wall
 *   stays on its own ink) → GAPS from each free end over everything that is no wall to the next wall of the track, a
 *   crossing body, or a stepped wall beside it: a quarter arc centred on a jamb (or a frame / the jamb's end), radius
 *   ≈ the leaf, standing out from the rings beside it and not a closed shape (WC bowl, basin) = door; glass colour or
 *   ≥ 2 thin lines jamb to jamb inside the wall's band = window; otherwise NO opening — the gap stays open and both
 *   walls stop where their ink stops (founder: never draw wall over a window or an undecided gap).
 *
 * Axis-aligned walls only; walls.ts adds the skeleton's angled walls and arcs where no track owns the ink. Pure, px
 * (pixel centres at integer coordinates).
 */
import { edt } from './raster'
import { arcInk, glazing, inkThreshold, sideContrast, wallHalfWidth } from './walls'
import type { Gray, OpeningGuess, Px, WallSeg } from './types'

/** An occupied stretch of a track: from u0 to u1 along it (px), a wall `thPx` thick. */
export interface Interval {
  u0: number
  u1: number
  thPx: number
}

/**
 * One wall alignment. `horiz`: the track runs along x at y = c (its intervals' u are x); else along y at x = c.
 * Intervals are sorted by u0 and never overlap; u0 / u1 are centre-line ends: on a crossing track's c where the ink
 * joins them (corner, T), else where the drawn wall's ink stops. Two tracks a few px apart with a Join between them are
 * one stepped wall (a flush thickness step) — snap a room edge to the one whose interval covers it.
 */
export interface Track {
  horiz: boolean
  c: number
  intervals: Interval[]
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** a column: its box and its middle point, px (the Studio's sticky points: the middle, and where each wall's own centre line meets its faces) */
export interface Pillar extends Box {
  cx: number
  cy: number
}

/**
 * A jog: two walls on parallel tracks c0 / c1 drawn as one band (a flush thickness step, a wall built onto another)
 * meet end to end at u — joined there by a short crosswise piece.
 */
export interface Join {
  horiz: boolean
  u: number
  c0: number
  c1: number
  thPx: number
  /**
   * the centre lines step by less than the thicker wall's half width (a thin wall meeting a thick one end to end, faces not
   * aligned): ONE junction — no crosswise piece is drawn (founder 2026-10-03: no zigzag); the graph's join step closes it
   */
  flush?: boolean
}

export interface TrackTrace {
  tracks: Track[]
  joins: Join[]
  /** ink thick in both directions (columns, junction blocks, shear walls, cores): bounding boxes, px — never walls */
  blocks: Box[]
  /**
   * the blocks that are COLUMNS (findPillars), each with its middle point. A wall keeps its own centre line and thickness
   * (never shifted onto the column's axis — walls are often flush with one face): in its line the column never cuts it
   * (one wall carried through, under the column's block), and a wall ending in it reaches its far face (corners close)
   */
  pillars: Pillar[]
  /** the sheet's wall thickness classes, px, thinnest first */
  classes: number[]
  /** the masks used: wall ink (after the plants came out), plant (removed before tracing), glass */
  ink: Uint8Array
  plantMask?: Uint8Array
  glass?: Uint8Array
  /** the scale the tracer assumed (the thinnest class is a 5" partition, or from halfPx) — only sizes its search windows */
  pxPerM: number
  /** gaps between a free wall end and the next ink on its track, classified (door / window / 'unknown' = nothing drawn) */
  gaps: Gap[]
}

/** A gap on a track: from a free end's face to the next ink's face (`node`: where the far wall's centre line is). */
export interface Gap {
  horiz: boolean
  c: number
  /** the free end's face and the far face, along the track (u0 < u1) */
  u0: number
  u1: number
  /** centre-line point the far side's wall carries on from (the crossing track, or the far interval's start) */
  node0: number
  node1: number
  thPx: number
  /** the far side is a wall on a parallel track (a stepped wall): joined at along-track u to its centre line c */
  jog?: { u: number; c: number }
  /** 'passage': nothing drawn here and nothing drawn on the room edges either (merge.ts) — an opening, flagged */
  kind: 'door' | 'window' | 'passage' | 'unknown'
  conf: number
  hingeAt?: Px
  swingTo?: Px
}

export interface TrackOpts {
  /** the partition's half width, px (default: walls.ts wallHalfWidth of the sheet) */
  halfPx?: number
  /** plant pixels (the colour image's green, hints.ts greenMask) — whitened before anything is traced */
  plant?: Uint8Array
  /** glass pixels (blue / cyan glazing lines, solve.ts glassMask) — window evidence */
  glass?: Uint8Array
  /** grey ≤ this is ink (default walls.ts inkThreshold) */
  darkMax?: number
  /** drop intervals whose lighter side is less than this above their centre (foliage, textures) */
  minContrast?: number
}

/** Metres the tracer reasons in (converted with its own px/m estimate). */
const M = {
  /** a block (column, crossing body) an interval runs through or ends in — longer B is a core, never bridged */
  maxBlock: 0.8,
  /** bands this far apart along one line still join one track */
  trackGap: 3,
  /** the thickest wall class looked for */
  maxWall: 0.35,
  /** gaps considered for an opening */
  minGap: 0.3,
  maxGap: 4,
  /** a single door leaf */
  doorMin: 0.45,
  doorMax: 1.25,
  /** a double door (two leaves from the two jambs) */
  doubleMin: 0.9,
  doubleMax: 1.9,
  /** one leaf of a double door */
  leafMin: 0.35,
  leafMax: 1,
}

/** along a track: 0 paper (thin lines included), W_ its wall, B_ thick both ways (a crossing body, a column), O_ another wall's band */
const W_ = 1, B_ = 2, O_ = 3

/** Ink runs across one orientation's lines: for line u, runs off[u] … off[u+1] − 1 (centre c, sub-pixel width w, extent). */
interface Lines {
  off: Int32Array
  c: Float32Array
  w: Float32Array
  v0: Int32Array
  v1: Int32Array
}

/**
 * For every line u (a column when `horiz`: cross-sections of horizontal walls), every ink run at least `minTh` long:
 * its centre and width, sub-pixel — the two edge pixels count by how far they are from the paper beside them towards
 * the run's own darkest grey (bands.ts; the JPEG halo outside the run never counts).
 */
function crossRuns(g: Gray, ink: Uint8Array, horiz: boolean, minTh: number): Lines {
  const { width: W, height: H, data } = g
  const U = horiz ? W : H, V = horiz ? H : W
  const off = new Int32Array(U + 1)
  const cs: number[] = [], ws: number[] = [], a0: number[] = [], a1: number[] = []
  for (let u = 0; u < U; u++) {
    off[u] = cs.length
    const at = (v: number) => (horiz ? v * W + u : u * W + v)
    const gv = (v: number) => (v < 0 || v >= V ? 255 : data[at(v)])
    let v0 = -1
    for (let v = 0; v <= V; v++) {
      const on = v < V && ink[at(v)] === 1
      if (on && v0 < 0) v0 = v
      else if (!on && v0 >= 0) {
        const L = v - v0
        if (L >= minTh) {
          let dark = 255
          for (let t = v0; t < v; t++) dark = Math.min(dark, data[at(t)])
          const pLo = Math.max(gv(v0 - 2), gv(v0 - 3), dark + 1), pHi = Math.max(gv(v + 1), gv(v + 2), dark + 1)
          const cLo = Math.max(0, Math.min(1, (pLo - gv(v0)) / (pLo - dark))), cHi = Math.max(0, Math.min(1, (pHi - gv(v - 1)) / (pHi - dark)))
          cs.push((v0 + v - 1 + cHi - cLo) / 2)
          ws.push(L - 2 + cLo + cHi)
          a0.push(v0)
          a1.push(v - 1)
        }
        v0 = -1
      }
    }
  }
  off[U] = cs.length
  return { off, c: Float32Array.from(cs), w: Float32Array.from(ws), v0: Int32Array.from(a0), v1: Int32Array.from(a1) }
}

interface Band {
  u0: number
  u1: number
  c: number
  w: number
}

const median = (xs: number[]) => {
  const s = xs.slice().sort((p, q) => p - q)
  return s.length ? s[s.length >> 1] : 0
}

/** Runs of the same cross-section (centre within 1 px, width within 20 %) column after column. */
function bandsOf(L: Lines, U: number, maxW: number): Band[] {
  const bandOf = new Int32Array(L.c.length).fill(-1)
  const acc: { u0: number; u1: number; sc: number; ws: number[] }[] = []
  for (let u = 0; u < U; u++)
    for (let i = L.off[u]; i < L.off[u + 1]; i++) {
      const c = L.c[i], w = L.w[i]
      if (w > maxW) continue
      let best = -1, bd = 1.01
      if (u > 0)
        for (let j = L.off[u - 1]; j < L.off[u]; j++) {
          const b = bandOf[j]
          if (b < 0 || acc[b].u1 !== u - 1) continue
          // within 1 px of the previous column AND of the band's own mean (an angled band drifts away: no track)
          const d = Math.abs(L.c[j] - c)
          if (d < bd && Math.abs(acc[b].sc / acc[b].ws.length - c) <= 1 && Math.abs(L.w[j] - w) <= Math.max(1.5, 0.2 * w)) (bd = d), (best = b)
        }
      if (best >= 0) {
        const b = acc[best]
        ;(b.u1 = u), (b.sc += c), b.ws.push(w)
        bandOf[i] = best
      } else {
        bandOf[i] = acc.length
        acc.push({ u0: u, u1: u, sc: c, ws: [w] })
      }
    }
  return acc.map((b) => ({ u0: b.u0, u1: b.u1, c: b.sc / b.ws.length, w: median(b.ws) }))
}

/**
 * The sheet's wall thickness classes: peaks of the length-weighted width histogram of bands at least 3 widths long
 * (columns and junction blocks are as long as they are thick and do not count). Peaks under 5 % of the strongest, or
 * within 2.5 px of a stronger one, are dropped; at most 4, thinnest first.
 */
export function thicknessClasses(bands: Band[], capPx: number): number[] {
  const bin = 0.5, n = Math.ceil(capPx / bin) + 3
  const h = new Float64Array(n)
  for (const b of bands) {
    const len = b.u1 - b.u0 + 1
    if (b.w > capPx || len < Math.max(3 * b.w, 8)) continue
    h[Math.round(b.w / bin)] += len
  }
  const s = (i: number) => (h[i - 1] ?? 0) * 0.25 + h[i] * 0.5 + (h[i + 1] ?? 0) * 0.25
  const peaks: number[] = []
  for (let i = 1; i < n - 1; i++) if (s(i) > 0 && s(i) >= s(i - 1) && s(i) > s(i + 1)) peaks.push(i)
  peaks.sort((p, q) => s(q) - s(p))
  const top = peaks.length ? s(peaks[0]) : 0
  const got: number[] = []
  for (const p of peaks) {
    if (s(p) < 0.05 * top || got.some((q) => Math.abs(q - p) * bin < 2.5) || got.length >= 4) continue
    got.push(p)
  }
  return got
    .map((p) => {
      let sw = 0, sv = 0
      for (let i = Math.max(0, p - 2); i <= Math.min(n - 1, p + 2); i++) (sw += h[i]), (sv += h[i] * i * bin)
      return sv / (sw || 1)
    })
    .sort((p, q) => p - q)
}

interface Iv {
  /** faces: where the ink stops (u0 − ½, u1 + ½ of the first / last pixel) */
  f0: number
  f1: number
  /** centre-line ends: the faces, or the crossing track an end joins */
  n0: number
  n1: number
  /** where the W (wall-class) part starts / stops — the stretch beyond is an end block */
  w0: number
  w1: number
  th: number
  /** a column alone on the wall's line (glazing on either side): kept only when a drawn opening joins it to the line */
  pil?: boolean
}
interface Tr {
  horiz: boolean
  c: number
  ivs: Iv[]
  /** what lies along the track from u = a on: paper 0, W_, B_, O_ */
  lab: Uint8Array
  a: number
}

/**
 * The whole sheet as tracks (+ blocks, classes, the masks used, classified gaps). Pure; walls.ts `traceWalls` with
 * tracker 'tracks' turns it into a WallTrace.
 */
export function traceTracks(gray0: Gray, opts: TrackOpts = {}): TrackTrace {
  const { width: W, height: H } = gray0
  // founder rule 2: plant sections out before any wall is followed (foliage drawn over a wall hides the wall's line)
  let gray = gray0
  if (opts.plant) {
    const d = new Uint8Array(gray0.data)
    for (let i = 0; i < d.length; i++) if (opts.plant[i]) d[i] = 255
    gray = { width: W, height: H, data: d }
  }
  const t = opts.darkMax ?? inkThreshold(gray, {})
  const ink = new Uint8Array(W * H)
  for (let i = 0; i < ink.length; i++) ink[i] = gray.data[i] <= t ? 1 : 0
  const half = opts.halfPx ?? wallHalfWidth(edt(ink, W, H), W, H)
  const minTh = Math.max(2, 1.4 * half)
  let k = (2 * half) / 0.127
  const empty: TrackTrace = { tracks: [], joins: [], blocks: [], pillars: [], classes: [], ink, plantMask: opts.plant, glass: opts.glass, pxPerM: k, gaps: [] }
  const runs = [crossRuns(gray, ink, true, minTh), crossRuns(gray, ink, false, minTh)]
  const cap = M.maxWall * k
  const bands0 = [bandsOf(runs[0], W, cap), bandsOf(runs[1], H, cap)]
  const classes = thicknessClasses([...bands0[0], ...bands0[1]], cap).filter((c) => c >= minTh * 0.9)
  if (!classes.length) return empty
  // the scale guess: the thinnest class is the 5" partition (only sizes the search windows below)
  if (opts.halfPx === undefined) k = classes[0] / 0.127
  const maxTh = classes[classes.length - 1] + Math.max(1.5, 0.15 * classes[classes.length - 1])
  const maxBlock = M.maxBlock * k
  const snapTh = (w: number) => classes.reduce((b, c) => (Math.abs(c - w) < Math.abs(b - w) ? c : b))
  const minContrast = opts.minContrast ?? 60
  // founder's order (2026-10-03): names → plants → PILLARS → walls. A column in a wall's line is that wall (founder rule
  // 2026-09-28): its block never cuts the wall, however long it is along the line
  const blocks = blockBoxes(ink, W, H, maxTh)
  const pillars = pillarsOf(blocks, maxTh, k)
  /** of the stretch u0 … u1 along a track at c, the part no pillar holds */
  const outsidePillars = (horiz: boolean, c: number, u0: number, u1: number) => {
    let out = u1 - u0
    for (const b of pillars) {
      const [p0, p1, q0, q1] = horiz ? [b.x0, b.x1, b.y0, b.y1] : [b.y0, b.y1, b.x0, b.x1]
      if (c >= q0 - 1 && c <= q1 + 1) out -= Math.max(0, Math.min(u1, p1 + 1) - Math.max(u0, p0 - 1))
    }
    return out
  }

  // tracks: bands on ONE centre line (jitter only, ≤ 30 % of the thinnest class); a flush thickness step is two tracks
  // whose touching ends are joined (a jog), so neither wall is drawn off its ink
  const tolC = Math.max(1.5, 0.3 * classes[0])
  const maxGapPx = M.maxGap * k
  const tracks: Tr[] = []
  for (const horiz of [true, false]) {
    const L = runs[horiz ? 0 : 1]
    const U = horiz ? W : H, V = horiz ? H : W
    const idx = (u: number, v: number) => (horiz ? v * W + u : u * W + v)
    const bands = bands0[horiz ? 0 : 1].filter((b) => b.w <= maxTh && b.u1 - b.u0 + 1 >= 3).sort((p, q) => q.u1 - q.u0 - (p.u1 - p.u0))
    let lines: { c: number; u0: number; u1: number; m: number }[] = []
    const near = (l: (typeof lines)[number], c: number, u0: number, u1: number) => Math.abs(l.c - c) <= tolC && Math.max(u0 - l.u1, l.u0 - u1) <= M.trackGap * k
    for (const b of bands) {
      const len = b.u1 - b.u0 + 1
      let best: (typeof lines)[number] | null = null
      for (const l of lines) if (near(l, b.c, b.u0, b.u1) && (!best || Math.abs(l.c - b.c) < Math.abs(best.c - b.c))) best = l
      if (best) {
        best.c = (best.c * best.m + b.c * len) / (best.m + len)
        ;(best.m += len), (best.u0 = Math.min(best.u0, b.u0)), (best.u1 = Math.max(best.u1, b.u1))
      } else lines.push({ c: b.c, u0: b.u0, u1: b.u1, m: len })
    }
    // lines whose means drifted together are one
    for (let changed = true; changed; ) {
      changed = false
      lines.sort((p, q) => q.m - p.m)
      for (let i = 0; i < lines.length && !changed; i++)
        for (let j = i + 1; j < lines.length; j++) {
          const p = lines[i], q = lines[j]
          if (!near(p, q.c, q.u0, q.u1)) continue
          ;(p.c = (p.c * p.m + q.c * q.m) / (p.m + q.m)), (p.m += q.m), (p.u0 = Math.min(p.u0, q.u0)), (p.u1 = Math.max(p.u1, q.u1))
          lines = lines.filter((x) => x !== q)
          changed = true
          break
        }
    }
    // every wall-class cross-section belongs to ONE track: the nearest line reaching it (two lines a few px apart never
    // both claim one band — no side-by-side duplicate can form)
    const byC = lines.slice().sort((p, q) => p.c - q.c)
    const owner = (u: number, rc: number, w: number) => {
      const win = Math.max(tolC + 0.5, 0.35 * w)
      let lo = 0, hi = byC.length
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (byC[m].c < rc - win) lo = m + 1
        else hi = m
      }
      let best: (typeof lines)[number] | null = null
      for (let i = lo; i < byC.length && byC[i].c <= rc + win; i++) {
        const q = byC[i]
        if (u < q.u0 - maxGapPx || u > q.u1 + maxGapPx) continue
        if (!best || Math.abs(q.c - rc) < Math.abs(best.c - rc)) best = q
      }
      return best
    }
    for (const l of lines) {
      const vc = Math.round(l.c)
      if (vc < 0 || vc >= V) continue
      const a = Math.max(0, Math.floor(l.u0 - maxGapPx)), z = Math.min(U - 1, Math.ceil(l.u1 + maxGapPx))
      const n = z - a + 1
      const lab = new Uint8Array(n), wid = new Float32Array(n)
      // the ink run along the track's own line through each u (a thin line ALONG the track is no block)
      const along = new Int32Array(n)
      for (let i = 0; i < n; ) {
        if (!ink[idx(a + i, vc)]) {
          i++
          continue
        }
        let j = i
        while (j < n && ink[idx(a + j, vc)]) j++
        for (let q = i; q < j; q++) along[q] = j - i
        i = j
      }
      // W: the cross-section through the track is a wall-class run centred on it; O: a wall-class run centred elsewhere
      // (another wall: a flush step's other part, a wall touching ours side by side); B: a run longer than any wall
      // (a crossing wall's body, a column) that is thick along the track too; else paper (thin lines included)
      for (let u = a; u <= z; u++)
        for (let i = L.off[u]; i < L.off[u + 1]; i++) {
          if (L.v0[i] > vc || vc > L.v1[i]) continue
          if (L.w[i] <= maxTh) {
            if (owner(u, L.c[i], L.w[i]) === l) (lab[u - a] = W_), (wid[u - a] = L.w[i])
            else lab[u - a] = O_
          } else if (along[u - a] >= minTh) lab[u - a] = B_
          break
        }
      // one or two pixels inside a wall that read as paper (anti-aliasing) or as another band (a line touching the
      // wall's face there) are the wall
      for (let i = 1; i + 1 < n; i++) {
        if (lab[i] === W_ || lab[i] === B_ || lab[i - 1] !== W_) continue
        const j = lab[i + 1] === W_ ? i + 1 : i + 2 < n && lab[i + 1] !== B_ && lab[i + 2] === W_ ? i + 2 : -1
        if (j < 0) continue
        for (let q = i; q < j; q++) (lab[q] = W_), (wid[q] = (wid[i - 1] + wid[j]) / 2)
      }
      const ivs: Iv[] = []
      // pieces = maximal W / B stretches, cut at blocks longer than maxBlock
      const pieces: [number, number][] = []
      const wb = (i: number) => lab[i] === W_ || lab[i] === B_
      for (let i = 0; i < n; ) {
        if (!wb(i)) {
          i++
          continue
        }
        let j = i
        while (j < n && wb(j)) j++
        let s = i
        for (let q = i; q < j; ) {
          if (lab[q] !== B_) {
            q++
            continue
          }
          let r = q
          while (r < j && lab[r] === B_) r++
          if (r - q > maxBlock && outsidePillars(horiz, l.c, a + q - 0.5, a + r - 0.5) > maxBlock) {
            if (q > s) pieces.push([s, q - 1])
            s = r
          }
          q = r
        }
        if (j > s) pieces.push([s, j - 1])
        i = j
      }
      // the line's own wall thickness (a column alone on it is carried through at this thickness)
      const lineW: number[] = []
      for (let i = 0; i < n; i++) if (lab[i] === W_) lineW.push(wid[i])
      const lineTh = lineW.length ? snapTh(median(lineW)) : 0
      for (const [s, e] of pieces) {
        let w0 = s, w1 = e
        while (w0 <= e && lab[w0] !== W_) w0++
        while (w1 >= s && lab[w1] !== W_) w1--
        if (w0 > w1) {
          // blocks only: never a wall — unless it is a COLUMN on the wall's line (founder, pillars first: a facade of
          // columns with glazing between is an exterior wall with windows) — kept only when a drawn opening (glazing,
          // a door) joins it to the line; the wall's own line and thickness carried through it
          const f0 = a + s - 0.5, f1 = a + e + 0.5
          // (once: two tracks on one line can both reach the column)
          const twice = tracks.some((T2) => T2.horiz === horiz && Math.abs(T2.c - l.c) <= tolC && T2.ivs.some((j) => j.pil && Math.abs(j.f0 - f0) <= 1 && Math.abs(j.f1 - f1) <= 1))
          if (!twice && lineTh && f1 - f0 >= lineTh && outsidePillars(horiz, l.c, f0, f1) <= 2) ivs.push({ f0, f1, n0: f0, n1: f1, w0: f0, w1: f1, th: lineTh, pil: true })
          continue
        }
        // thickness classes along the W part; a class change held over ≥ 2 thicknesses splits the interval
        const cls: { from: number; to: number; th: number; n: number }[] = []
        for (let i = w0; i <= w1; i++) {
          if (lab[i] !== W_) continue
          const th = snapTh(wid[i])
          const last = cls[cls.length - 1]
          if (last && last.th === th) (last.to = i), last.n++
          else cls.push({ from: i, to: i, th, n: 1 })
        }
        // absorb short class runs into the longer neighbour, until stable; and on one centre line two NEAR classes
        // (within 25 %: 0.25 / 0.30 m) are one wall — a face line touching it widens a stretch, a wall does not swell
        const nearCls = (p: { th: number }, x: { th: number }) => Math.abs(p.th - x.th) < 0.25 * Math.min(p.th, x.th)
        for (let changed = true; changed && cls.length > 1; ) {
          changed = false
          for (let q = 0; q < cls.length; q++) {
            const r = cls[q]
            const p = cls[q - 1], x = cls[q + 1]
            const short = r.n < Math.max(2 * r.th, 6)
            const pNear = p && nearCls(p, r) && p.n >= r.n, xNear = x && nearCls(x, r) && x.n >= r.n
            if (!short && !pNear && !xNear) continue
            const into = short ? (!p ? x : !x ? p : p.n >= x.n ? p : x) : pNear && xNear ? (p.n >= x.n ? p : x) : pNear ? p : x
            ;(into.from = Math.min(into.from, r.from)), (into.to = Math.max(into.to, r.to)), (into.n += r.n)
            cls.splice(q, 1)
            for (let z2 = 0; z2 + 1 < cls.length; z2++) if (cls[z2].th === cls[z2 + 1].th) (cls[z2].to = cls[z2 + 1].to), (cls[z2].n += cls[z2 + 1].n), cls.splice(z2 + 1, 1), z2--
            changed = true
            break
          }
        }
        cls.forEach((r, q) => {
          // split points: halfway between two class runs (a step usually sits in a junction's body)
          const from = q === 0 ? s : Math.floor((cls[q - 1].to + r.from) / 2) + 1
          const to = q === cls.length - 1 ? e : Math.floor((r.to + cls[q + 1].from) / 2)
          const iw0 = q === 0 ? w0 : r.from, iw1 = q === cls.length - 1 ? w1 : r.to
          const f0 = a + from - 0.5, f1 = a + to + 0.5
          // an interval at least 1.5 wall thicknesses long with at least half a thickness of wall-class ink
          let nw = 0
          for (let i = from; i <= to; i++) nw += lab[i] === W_ ? 1 : 0
          if (f1 - f0 < 1.5 * r.th || nw < Math.max(3, 0.5 * r.th)) return
          ivs.push({ f0, f1, n0: f0, n1: f1, w0: a + iw0 - 0.5, w1: a + iw1 + 0.5, th: r.th })
        })
      }
      // a wall is a dark band with clean paper / floor beside it: foliage and textures are not
      const keep = ivs.filter((iv) => {
        if (iv.pil) return true // (a column is its own ink both sides of the line)
        const p = (u: number): Px => (horiz ? { x: u, y: l.c } : { x: l.c, y: u })
        return sideContrast(gray, { a: p(iv.w0), b: p(iv.w1) }, iv.th) >= minContrast
      })
      if (keep.length) tracks.push({ horiz, c: l.c, ivs: keep.sort((p, q) => p.f0 - q.f0), lab, a })
    }
  }

  // ── corners and T's: an end inside a crossing wall's body (or the block it ends in) sits on that wall's track — the
  // outermost one the ink reaches (a stepped band has two; the wall runs through the nearer and is noded there)
  const byDir = [tracks.filter((t) => t.horiz), tracks.filter((t) => !t.horiz)]
  const reaches = (P: Tr, c: number, th: number) => P.ivs.find((j) => j.f0 <= c + th / 2 + tolC && j.f1 >= c - th / 2 - tolC)
  const snaps: { iv: Iv; end: 0 | 1; at: number }[] = []
  for (const T of tracks) {
    const perp = byDir[T.horiz ? 1 : 0]
    for (const iv of T.ivs)
      for (const end of [0, 1] as const) {
        const face = end ? iv.f1 : iv.f0, wEnd = end ? iv.w1 : iv.w0
        let best: number | null = null, bd = Infinity
        for (const P of perp) {
          const J = reaches(P, T.c, iv.th)
          if (!J) continue
          // its centre between where our wall-class ink stops (or, when its body covers our end — it stands on our
          // wall there — its own far face) and just past our face (its near face within 2 px)
          const lo = end ? Math.min(wEnd, face - J.th / 2) - tolC : face - J.th / 2 - 2, hi = end ? face + J.th / 2 + 2 : Math.max(wEnd, face + J.th / 2) + tolC
          if (P.c < lo || P.c > hi) continue
          const d = Math.abs(P.c - face)
          if (d < bd) (bd = d), (best = P.c)
        }
        if (best !== null) snaps.push({ iv, end, at: best })
      }
  }
  for (const s of snaps) s.iv[s.end ? 'n1' : 'n0'] = s.at
  // an interval its two snapped ends collapsed (a stub inside a junction) is no wall
  for (const T of tracks) T.ivs = T.ivs.filter((iv) => iv.n1 - iv.n0 >= Math.max(2, 0.5 * iv.th))

  const free0 = (iv: Iv) => iv.n0 === iv.f0, free1 = (iv: Iv) => iv.n1 === iv.f1
  // ── a column between two walls on near parallel tracks (Sheltech: a partition meeting the facade wall inside a column,
  // each on its own centre line): both run into it from either side — they meet end to end at its middle, one junction,
  // never two walls side by side through it
  for (const dir of byDir)
    for (const T of dir)
      for (const iv of T.ivs) {
        if (!free1(iv)) continue
        for (const T2 of dir) {
          const J = T2 === T ? undefined : T2.ivs.find((j) => free0(j) && j.f0 < iv.f1 && j.f1 > iv.f1 && Math.abs(T2.c - T.c) < (iv.th + j.th) / 2)
          if (!J) continue
          const [lo, hi, c0, c1] = T.horiz ? ['x0', 'x1', 'y0', 'y1'] as const : ['y0', 'y1', 'x0', 'x1'] as const
          const p = pillars.find((b) => b[lo] - 1 <= J.f0 && iv.f1 <= b[hi] + 1 && [T.c, T2.c].every((c) => c >= b[c0] - 1 && c <= b[c1] + 1))
          // (the thicker wall runs on through the column; the thinner one ends exactly at its end cross-section — founder:
          // thin into thick is one junction; two equal ones meet at the column's middle)
          const u = !p ? undefined : iv.th < J.th - 0.5 ? J.f0 : J.th < iv.th - 0.5 ? iv.f1 : T.horiz ? p.cx : p.cy
          if (u === undefined || u <= iv.n0 + 1 || u >= J.n1 - 1) continue
          ;(iv.n1 = iv.f1 = u), (J.n0 = J.f0 = u)
          break
        }
      }

  // ── jogs: a free end touching the free end of a wall on a parallel track beside it (a flush thickness step, two walls
  // drawn side by side as one band) — joined by a short crosswise piece, both walls exactly on their ink
  const joins: Join[] = []
  for (const dir of byDir)
    for (const T of dir)
      for (const iv of T.ivs) {
        if (!free1(iv)) continue
        for (const T2 of dir) {
          if (T2 === T || Math.abs(T2.c - T.c) > maxTh) continue
          const J = T2.ivs.find((j) => free0(j) && Math.abs(j.f0 - iv.f1) <= 1.5 && Math.abs(T2.c - T.c) <= (iv.th + j.th) / 2)
          if (!J) continue
          const u = (iv.f1 + J.f0) / 2
          ;(iv.n1 = u), (J.n0 = u), (iv.f1 = u), (J.f0 = u)
          joins.push({ horiz: T.horiz, u, c0: T.c, c1: T2.c, thPx: Math.min(iv.th, J.th), ...(Math.abs(T2.c - T.c) < Math.max(iv.th, J.th) / 2 ? { flush: true } : {}) })
          break
        }
      }

  // ── gaps: from each free end over paper to the next ink on the track; an interval of the track or a crossing wall's
  // body (B) ends it — another wall beside the track (O) means it is no opening
  const gaps: Gap[] = []
  const seen = new Set<string>()
  // arc ink outside every wall body, each pixel judged once (the door probe asks the same pixels many times)
  const arcAt0 = arcInk(gray), arcMemo = new Uint8Array(W * H)
  const grayAt = (x: number, y: number) => gray.data[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))]
  const inWall = wallBodies(tracks, W, H)
  const arcAt = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false
    const i = yi * W + xi
    if (!arcMemo[i]) arcMemo[i] = arcAt0(xi, yi) && !inWall(xi, yi) ? 2 : 1
    return arcMemo[i] === 2
  }
  for (const T of tracks) {
    const perp = byDir[T.horiz ? 1 : 0]
    const P = (u: number): Px => (T.horiz ? { x: u, y: T.c } : { x: T.c, y: u })
    const n = T.lab.length
    for (const iv of T.ivs)
      for (const dir of [1, -1] as const) {
        if (!(dir > 0 ? free1(iv) : free0(iv))) continue
        const face = dir > 0 ? iv.f1 : iv.f0
        // walls on parallel tracks whose bodies overlap ours side by side: a gap running alongside one is no opening;
        // one starting across the gap is the far side of a stepped wall (a jog joins it)
        const sides = byDir[T.horiz ? 0 : 1].flatMap((T2) => (T2 === T ? [] : T2.ivs.filter((j) => Math.abs(T2.c - T.c) < (iv.th + j.th) / 2).map((j) => ({ j, c: T2.c }))))
        // walk over everything that is no wall: paper, thin lines, a window frame's little marks, wall-class bits too short
        // to be kept — until a kept wall of this track, a crossing body / block, or a stepped wall beside the track
        let i = Math.round(face + dir * 0.5) - T.a
        let g = 0, side: (typeof sides)[number] | undefined, nb: Iv | undefined
        for (; i >= 0 && i < n && g <= maxGapPx; i += dir, g++) {
          const u = T.a + i
          // (a column carried on the line as its own piece: the gap ends at its face, the piece carries on from there)
          if (T.lab[i] === B_) {
            nb = T.ivs.find((j) => j !== iv && j.pil && j.f0 - 0.5 <= u && u <= j.f1 + 0.5)
            break
          }
          if (T.lab[i] === W_ && (nb = T.ivs.find((j) => j !== iv && j.f0 <= u && u <= j.f1))) break
          if ((side = sides.find((s) => s.j.f0 <= u && u <= s.j.f1))) break
        }
        if (i < 0 || i >= n || g > maxGapPx) continue
        const far = side ? (dir > 0 ? side.j.f0 : side.j.f1) : nb ? (dir > 0 ? nb.f0 : nb.f1) : T.a + i - dir * 0.5
        if ((far - face) * dir < M.minGap * k) continue
        let node: number
        let jog: Gap['jog']
        if (side) {
          if (dir > 0 ? !free0(side.j) : !free1(side.j)) continue
          node = far
          jog = { u: far, c: side.c }
        } else if (nb) {
          node = dir > 0 ? nb.n0 : nb.n1
        } else if (T.lab[i] === B_) {
          // a crossing wall whose body this is: its centre line; else a block's face
          // (the nearest such wall whose body spans this line; a stepped wall has two tracks there)
          const Q = perp
            .filter((q) => (q.c - far) * dir > 0 && (q.c - far) * dir <= maxBlock && q.ivs.some((j) => j.f0 <= T.c && T.c <= j.f1))
            .sort((p, q) => Math.abs(p.c - far) - Math.abs(q.c - far))[0]
          node = Q ? Q.c : far
        } else continue
        const u0 = Math.min(face, far), u1 = Math.max(face, far)
        const key = `${T.horiz}|${T.c.toFixed(1)}|${u0.toFixed(1)}|${u1.toFixed(1)}`
        if (seen.has(key)) continue
        seen.add(key)
        // (a double door's jamb is a wall, not a stub: two arcs by chance — a WC and a basin — face each other across a floor)
        const cls = classifyGap(P(u0), P(u1), nb ? Math.max(iv.th, nb.th) : iv.th, k, arcAt, grayAt, opts.glass, W, H, iv.f1 - iv.f0 >= Math.max(0.3 * k, 2 * iv.th))
        gaps.push({ horiz: T.horiz, c: T.c, u0, u1, node0: dir > 0 ? face : node, node1: dir > 0 ? node : face, thPx: iv.th, ...(jog ? { jog } : {}), ...cls })
      }
  }

  // ── a door across a wall's END: a leaf hinged on a free end's corner, closing sideways along the end face over paper
  // onto the next ink within a door's width (a door set in a recess between two parallel walls, an L-shaped entry) — the
  // track has no gap there. Kept only where its swing is drawn (doorArcs); an end whose own track gap is a door or window
  // already has its arc explained. The far side's wall (parallel, its body on the chord) carries the connector.
  const isInk = (horiz: boolean, u: number, v: number) => {
    const x = Math.round(horiz ? u : v), y = Math.round(horiz ? v : u)
    return x >= 0 && y >= 0 && x < W && y < H && ink[y * W + x] === 1
  }
  for (const T of tracks)
    for (const iv of T.ivs)
      for (const end of [0, 1] as const) {
        if (!(end ? free1(iv) : free0(iv))) continue
        const face = end ? iv.f1 : iv.f0, dir = end ? 1 : -1
        // (a thickness split or a jog is no end: the wall carries on)
        if (T.ivs.some((j) => j !== iv && Math.abs((end ? j.f0 : j.f1) - face) <= 1) || joins.some((j) => j.horiz === T.horiz && Math.abs(j.u - face) <= 1 && (j.c0 === T.c || j.c1 === T.c))) continue
        // (a door's width of gap on the track itself: an arc on this corner is that gap's door, decided there or by the rooms)
        if (gaps.some((g) => g.horiz === T.horiz && g.c === T.c && (g.u0 === face || g.u1 === face) && (g.kind !== 'unknown' || g.u1 - g.u0 <= M.doorMax * k))) continue
        // the wall's last row of ink along the track: beside it, the recess
        const ul = face - dir * 0.5
        for (const s of [1, -1] as const) {
          let v = Math.round(T.c)
          while (Math.abs(v - T.c) <= iv.th / 2 + 2 && isInk(T.horiz, ul, v)) v += s
          if (isInk(T.horiz, ul, v)) continue
          const vNear = v - s * 0.5
          while (Math.abs(v - vNear) <= M.doorMax * k && !isInk(T.horiz, ul, v)) v += s
          const vFar = v - s * 0.5
          if (!isInk(T.horiz, ul, v) || Math.abs(vFar - vNear) < M.doorMin * k) continue
          // the other jamb: a wall parallel to this one, its body on the chord (it carries the connector), facing this wall
          // across the recess for ≥ 0.3 m back from the chord — or turning there into a wall the chord carries on (an L
          // corner: the door continues that wall's line); the leaf swings into the recess
          const back = (j: Iv) => (dir > 0 ? face - j.f0 : j.f1 - face)
          const corner = (Q: Tr) => byDir[T.horiz ? 1 : 0].some((P) => P.ivs.some((j) => Math.abs(P.c - face) <= j.th / 2 + 1 && Math.abs((s > 0 ? j.n0 : j.n1) - Q.c) <= 1))
          const far = byDir[T.horiz ? 0 : 1].find((Q) => Q !== T && Q.ivs.some((j) => j.f0 <= face && face <= j.f1 && Math.abs(Q.c - (s * j.th) / 2 - vFar) <= 1.5) && (Q.ivs.some((j) => j.f0 <= face && face <= j.f1 && back(j) >= M.minGap * k) || corner(Q)))
          if (!far) continue
          const Pc = (w: number): Px => (T.horiz ? { x: face, y: w } : { x: w, y: face })
          const d = doorArcs(Pc(vNear), Pc(vFar), k, arcAt, false)
          if (!d || ((T.horiz ? d.swingTo!.x : d.swingTo!.y) - face) * dir > 0) continue
          gaps.push({ horiz: !T.horiz, c: face, u0: Math.min(vNear, vFar), u1: Math.max(vNear, vFar), node0: s > 0 ? T.c : far.c, node1: s > 0 ? far.c : T.c, thPx: iv.th, ...d })
        }
      }

  // one opening per place: two near tracks (a jamb and the wall beyond it, a stepped wall) can find the same gap
  // (the better-evidenced one stays)
  const drop = new Set<Gap>()
  const rank = (g: Gap) => (g.kind === 'unknown' ? 0 : g.conf)
  for (let i = 0; i < gaps.length; i++)
    for (let j = i + 1; j < gaps.length; j++) {
      const p = gaps[i], q = gaps[j]
      if (q.horiz !== p.horiz || Math.abs(q.c - p.c) >= (q.thPx + p.thPx) / 2 || Math.min(q.u1, p.u1) - Math.max(q.u0, p.u0) < 0.5 * Math.min(q.u1 - q.u0, p.u1 - p.u0)) continue
      drop.add(rank(q) > rank(p) ? p : q)
    }
  let kept = gaps.filter((g) => !drop.has(g))
  // a column alone on the line stays only where a drawn opening (glazing, a door) joins it to the line — then it is the
  // wall through the column, its windows flagged (conf under the solver's 0.5: "window between pillars — check");
  // else it is no wall and its undecided gaps go with it (positive evidence only)
  for (const T of tracks)
    T.ivs = T.ivs.filter((iv) => {
      if (!iv.pil) return true
      const at = (g: Gap) => g.horiz === T.horiz && g.c === T.c && (Math.abs(g.u1 - iv.f0) <= 1 || Math.abs(g.u0 - iv.f1) <= 1)
      const mine = kept.filter(at)
      if (mine.some((g) => g.kind !== 'unknown')) {
        for (const g of mine) if (g.kind === 'window') g.conf = Math.min(g.conf, 0.45)
        return true
      }
      kept = kept.filter((g) => !mine.includes(g))
      return false
    })

  return {
    tracks: tracks.map((T) => ({ horiz: T.horiz, c: T.c, intervals: T.ivs.map((iv) => ({ u0: iv.n0, u1: iv.n1, thPx: iv.th })) })),
    joins,
    blocks: blocks.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })),
    pillars,
    classes,
    ink,
    plantMask: opts.plant,
    glass: opts.glass,
    pxPerM: k,
    gaps: kept,
  }
}

/** What the solver keeps of a trace (the masks stay with the tracer). */
export type TrackLines = Pick<TrackTrace, 'tracks' | 'joins' | 'gaps' | 'blocks' | 'pillars' | 'classes' | 'pxPerM'>

/** The trace's lines × k (an upscaled sheet's trace back to the sheet: walls.ts scales its walls the same way, p × k). */
export function scaleTracks(t: TrackLines, k: number): TrackLines {
  const p = (q: Px): Px => ({ x: q.x * k, y: q.y * k })
  return {
    tracks: t.tracks.map((T) => ({ horiz: T.horiz, c: T.c * k, intervals: T.intervals.map((iv) => ({ u0: iv.u0 * k, u1: iv.u1 * k, thPx: iv.thPx * k })) })),
    joins: t.joins.map((j) => ({ ...j, u: j.u * k, c0: j.c0 * k, c1: j.c1 * k, thPx: j.thPx * k })),
    gaps: t.gaps.map((g) => ({ ...g, c: g.c * k, u0: g.u0 * k, u1: g.u1 * k, node0: g.node0 * k, node1: g.node1 * k, thPx: g.thPx * k, ...(g.jog ? { jog: { u: g.jog.u * k, c: g.jog.c * k } } : {}), ...(g.hingeAt ? { hingeAt: p(g.hingeAt) } : {}), ...(g.swingTo ? { swingTo: p(g.swingTo) } : {}) })),
    blocks: t.blocks.map((b) => ({ x0: b.x0 * k, y0: b.y0 * k, x1: b.x1 * k, y1: b.y1 * k })),
    pillars: t.pillars.map((b) => ({ x0: b.x0 * k, y0: b.y0 * k, x1: b.x1 * k, y1: b.y1 * k, cx: b.cx * k, cy: b.cy * k })),
    classes: t.classes.map((c) => c * k),
    pxPerM: t.pxPerM * k,
  }
}

/** A point-in-wall test over every interval's body (centre line ± half the thickness + 1 px). */
function wallBodies(tracks: Tr[], W: number, H: number): (x: number, y: number) => boolean {
  const m = new Uint8Array(W * H)
  for (const T of tracks)
    for (const iv of T.ivs) {
      const r = iv.th / 2 + 1
      const v0 = Math.max(0, Math.floor(T.c - r)), v1 = Math.ceil(T.c + r)
      for (let u = Math.max(0, Math.floor(iv.f0)); u <= Math.ceil(iv.f1); u++)
        for (let v = v0; v <= v1; v++) {
          const x = T.horiz ? u : v, y = T.horiz ? v : u
          if (x < W && y < H) m[y * W + x] = 1
        }
    }
  return (x, y) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < W && yi < H && m[yi * W + xi] === 1
  }
}

/**
 * Door / window / nothing for the gap a → b (on a track; `th` the wall's thickness). Positive evidence only:
 * - door: a quarter arc around either jamb, on either side, at ONE radius 0.75–1.15 × the gap over most of its sweep,
 *   the floor inside it clear, and the ring NOT running on past the open leaf (a WC bowl, a basin, a shower tray are
 *   closed shapes; a swing stops at the leaf) — or two such arcs, one from each jamb, meeting: a double door (doorArcs);
 * - window: glass-colour pixels along ≥ 60 % of the gap inside the wall's band, or ≥ 2 thin lines running jamb to jamb
 *   inside it (walls.ts `glazing`);
 * - else 'unknown' (conf 0): nothing is drawn that says what the gap is.
 */
export function classifyGap(
  a: Px,
  b: Px,
  th: number,
  pxPerM: number,
  arcAt: (x: number, y: number) => boolean,
  grayAt: (x: number, y: number) => number,
  glass: Uint8Array | undefined,
  W: number,
  H: number,
  /** a double door may be read here */
  double = true,
): Pick<Gap, 'kind' | 'conf' | 'hingeAt' | 'swingTo'> {
  const gap = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / gap, uy = (b.y - a.y) / gap
  const nx = -uy, ny = ux
  const door = doorArcs(a, b, pxPerM, arcAt, double)
  if (door) return door
  // glass colour along the gap, inside the wall's band
  if (glass) {
    let n = 0, hit = 0
    const r = Math.ceil(th / 2) + 1
    for (let t = 0.1 * gap; t <= 0.9 * gap; t += 1) {
      n++
      for (let o = -r; o <= r; o++) {
        const x = Math.round(a.x + ux * t + nx * o), y = Math.round(a.y + uy * t + ny * o)
        if (x >= 0 && y >= 0 && x < W && y < H && glass[y * W + x]) {
          hit++
          break
        }
      }
    }
    if (n && hit / n >= 0.6) return { kind: 'window', conf: 0.7 }
  }
  if (glazing(a, ux, uy, gap, th, grayAt).lines >= 2) return { kind: 'window', conf: 0.6 }
  return { kind: 'unknown', conf: 0 }
}

/**
 * The door rules of classifyGap (positive evidence: the swing drawn). A leaf hinges on either jamb, hanging inside a
 * frame (hinge up to 0.3 of the gap in from the jamb) or on the jamb's end (up to 0.2 out), its radius the rest of the
 * gap: ONE door. Or two leaves from the two jambs, swinging to one side, each 0.35–1 m and clearly drawn, whose radii add
 * up to the span between their hinges (± 15 %): a DOUBLE door, one opening of the gap's width (main doors: equal leaves
 * or 0.9 + 0.5 m; the hand traces draw one door there).
 */
function doorArcs(a: Px, b: Px, pxPerM: number, arcAt: (x: number, y: number) => boolean, double = true): Pick<Gap, 'kind' | 'conf' | 'hingeAt' | 'swingTo'> | null {
  const gap = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / gap, uy = (b.y - a.y) / gap
  const nx = -uy, ny = ux
  const near = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (arcAt(x + dx, y + dy)) return 1
    return 0
  }
  /**
   * The best one-ring quarter arc hinged at hp, from direction e (the closed leaf, across the gap) to m (the open leaf),
   * radius 0.75–1.15 × R: the share of its sweep (0.1–0.9 of the quarter) on that ring (± 0.05 R). None when the floor
   * inside it is not clear, the rings max(0.15 R, 3 px) inside and outside are as full (tiles, a window's frame lines and
   * furniture edges cross every ring alike), or the ring runs on past the open leaf (0.6–0.95 of a quarter beyond it: a
   * swing stops at the leaf; a WC bowl, a basin, a shower tray are closed shapes).
   */
  const quarter = (hp: Px, ex: number, ey: number, mx: number, my: number, R: number): { score: number; r: number } => {
    const on = (f: number, r: number) => {
      const ang = (f * Math.PI) / 2, c = Math.cos(ang), s = Math.sin(ang)
      return near(hp.x + (c * ex + s * mx) * r, hp.y + (c * ey + s * my) * r)
    }
    let inner = 0
    for (let q = 0; q <= 16; q++) {
      const ang = ((0.1 + (0.8 * q) / 16) * Math.PI) / 2, c = Math.cos(ang), s = Math.sin(ang)
      inner += arcAt(hp.x + (c * ex + s * mx) * R * 0.5, hp.y + (c * ey + s * my) * R * 0.5) ? 1 : 0
    }
    const best = { score: 0, r: R }
    if (inner / 17 > 0.35) return best
    const d = Math.max(1, 0.05 * R), D = Math.max(3, 0.15 * R)
    for (let j = 3; j <= 11; j++) {
      const r = R * (0.6 + 0.05 * j)
      let hit = 0, clutter = 0
      for (let q = 0; q <= 16; q++) {
        const f = 0.1 + (0.8 * q) / 16
        ;(hit += on(f, r - d) | on(f, r) | on(f, r + d)), (clutter += on(f, r - D) | on(f, r + D))
      }
      if (clutter / 17 > 0.65 || clutter > 0.5 * hit || hit / 17 <= best.score) continue
      let past = 0
      for (let q = 0; q <= 8; q++) past += on(1.12 + (0.38 * q) / 8, r - d) | on(1.12 + (0.38 * q) / 8, r) | on(1.12 + (0.38 * q) / 8, r + d)
      if (past / 9 > 0.5) continue
      ;(best.score = hit / 17), (best.r = r)
    }
    return best
  }
  type Leaf = { score: number; r: number; hp: Px; t: number; side: number }
  /** leaves hinged near one jamb (sgn +1 at a, −1 at b): hinge `o` of the gap in from it, radius R */
  const leaves = (jb: Px, sgn: 1 | -1, side: number, os: number[], Rs: (o: number) => number[]): Leaf[] => {
    const out: Leaf[] = []
    for (const o of os) {
      const hp = { x: jb.x + ux * sgn * o * gap, y: jb.y + uy * sgn * o * gap }
      for (const R of Rs(o)) {
        const q = quarter(hp, ux * sgn, uy * sgn, nx * side, ny * side, R)
        if (q.score > 0) out.push({ ...q, hp, t: sgn > 0 ? o * gap : gap - o * gap, side })
      }
    }
    return out
  }
  const swing = (side: number, r: number): Px => ({ x: (a.x + b.x) / 2 + nx * side * r, y: (a.y + b.y) / 2 + ny * side * r })
  if (gap >= M.doorMin * pxPerM && gap <= M.doorMax * pxPerM) {
    const os = Array.from({ length: 11 }, (_, i) => -0.2 + 0.05 * i)
    let best: Leaf | null = null
    for (const side of [1, -1])
      for (const [jb, sgn] of [[a, 1], [b, -1]] as const)
        for (const l of leaves(jb, sgn, side, os, (o) => [gap * (1 - o)])) if (!best || l.score > best.score) best = l
    if (best && best.score >= 0.7) return { kind: 'door', conf: best.score, hingeAt: best.hp, swingTo: swing(best.side, gap * 0.5) }
  }
  if (double && gap >= M.doubleMin * pxPerM && gap <= M.doubleMax * pxPerM) {
    const os = Array.from({ length: 8 }, (_, i) => -0.05 + 0.05 * i)
    const Rs = () => [0.3, 0.4, 0.5, 0.6, 0.7].map((f) => f * gap)
    let best: { score: number; L: Leaf } | null = null
    // each leaf clearer than a single door's swing need be (two arcs side by side are easier to find by chance), 0.35–1 m,
    // the larger at most 2.2× the smaller
    const leaf = (l: Leaf) => l.score >= 0.8 && l.r >= M.leafMin * pxPerM && l.r <= M.leafMax * pxPerM
    for (const side of [1, -1]) {
      const A = leaves(a, 1, side, os, Rs).filter(leaf), B = leaves(b, -1, side, os, Rs).filter(leaf)
      for (const p of A)
        for (const q of B) {
          const span = q.t - p.t
          if (span <= 0 || Math.abs(p.r + q.r - span) > 0.15 * span || Math.max(p.r, q.r) > 2.2 * Math.min(p.r, q.r)) continue
          const s = Math.min(p.score, q.score)
          if (!best || s > best.score) best = { score: s, L: p.r >= q.r ? p : q }
        }
    }
    if (best) return { kind: 'door', conf: best.score, hingeAt: best.L.hp, swingTo: swing(best.L.side, gap * 0.5) }
  }
  return null
}

/** the sheet's COLUMNS: dark ink thick both ways (blockBoxes) */
export const PILLAR = {
  /** at most this long a side, m (Sheltech's exterior columns ~0.45 × 1.05 m; a lift core or a shear wall is longer) */
  maxSide: 1.6,
  /** its block pixels fill at least this share of its box (a filled column, not an L of crossing wall bodies) */
  fill: 0.7,
}

/**
 * The sheet's columns (founder 2026-10-03: names → plants → PILLARS → walls): a block (ink thick both ways) WIDER than
 * every wall class in both directions — a junction of two walls is as wide as they are, a column stands out of them —
 * at most PILLAR.maxSide m a side and solid. Black columns of Sheltech's facade, the bigger junction columns of BTI.
 */
export function findPillars(ink: Uint8Array, W: number, H: number, classes: number[], pxPerM: number): Pillar[] {
  if (!classes.length) return []
  const top = classes[classes.length - 1]
  const maxTh = top + Math.max(1.5, 0.15 * top)
  return pillarsOf(blockBoxes(ink, W, H, maxTh), maxTh, pxPerM)
}

function pillarsOf(blocks: (Box & { n?: number })[], maxTh: number, pxPerM: number): Pillar[] {
  return blocks
    .filter((b) => {
      const w = b.x1 - b.x0, h = b.y1 - b.y0
      return Math.min(w, h) >= maxTh && Math.max(w, h) <= PILLAR.maxSide * pxPerM && (b.n ?? w * h) >= PILLAR.fill * w * h
    })
    .map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }))
}

/** Bounding boxes of ink thick both ways (both runs through the pixel longer than the thickest wall class); n = its pixels. */
function blockBoxes(ink: Uint8Array, W: number, H: number, maxTh: number): (Box & { n: number })[] {
  const hl = new Uint16Array(W * H), vl = new Uint16Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; ) {
      if (!ink[y * W + x]) {
        x++
        continue
      }
      let e = x
      while (e < W && ink[y * W + e]) e++
      for (let q = x; q < e; q++) hl[y * W + q] = Math.min(65535, e - x)
      x = e
    }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; ) {
      if (!ink[y * W + x]) {
        y++
        continue
      }
      let e = y
      while (e < H && ink[e * W + x]) e++
      for (let q = y; q < e; q++) vl[q * W + x] = Math.min(65535, e - y)
      y = e
    }
  const blk = new Uint8Array(W * H)
  for (let i = 0; i < blk.length; i++) blk[i] = ink[i] && hl[i] > maxTh && vl[i] > maxTh ? 1 : 0
  const out: (Box & { n: number })[] = []
  const stack: number[] = []
  for (let s = 0; s < blk.length; s++) {
    if (blk[s] !== 1) continue
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0
    blk[s] = 2
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!, x = p % W, y = (p - x) / W
      ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y)), n++
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < blk.length && blk[q] === 1) (blk[q] = 2), stack.push(q)
    }
    out.push({ x0: x0 - 0.5, y0: y0 - 0.5, x1: x1 + 0.5, y1: y1 + 0.5, n })
  }
  return out
}

/**
 * Tracks → the wall stage's output: one straight wall per interval (centre line between its ends, exact thickness),
 * and for every gap the door / window rules classified, the opening (face to face) plus the short connector from the
 * far face to the far wall's centre line, so the solver joins wall – opening – wall into ONE wall with the opening as
 * its child. Gaps with nothing drawn come out as 'unknown' guesses with conf 0: the solver never bridges them.
 */
export function trackWalls(tt: Pick<TrackTrace, 'tracks' | 'joins' | 'gaps'>): { walls: WallSeg[]; openings: OpeningGuess[] } {
  const walls: WallSeg[] = []
  const P = (horiz: boolean, c: number, u: number): Px => (horiz ? { x: u, y: c } : { x: c, y: u })
  for (const T of tt.tracks) for (const iv of T.intervals) walls.push({ a: P(T.horiz, T.c, iv.u0), b: P(T.horiz, T.c, iv.u1), thicknessPx: iv.thPx, conf: 1 })
  for (const j of tt.joins) if (!j.flush) walls.push({ a: P(j.horiz, j.c0, j.u), b: P(j.horiz, j.c1, j.u), thicknessPx: j.thPx, conf: 1 })
  const openings: OpeningGuess[] = []
  for (const g of tt.gaps) {
    const a = P(g.horiz, g.c, g.u0), b = P(g.horiz, g.c, g.u1)
    openings.push({ a, b, kind: g.kind, conf: g.conf, thicknessPx: g.thPx, ...(g.hingeAt ? { hingeAt: g.hingeAt, swingTo: g.swingTo } : {}) })
    if (g.kind === 'unknown') continue
    // connectors: a face → the centre line the wall carries on to (a crossing wall's track, or the far wall's snapped end)
    for (const [f, n] of [[g.u0, g.node0], [g.u1, g.node1]] as const) if (Math.abs(f - n) > 0.25) walls.push({ a: P(g.horiz, g.c, f), b: P(g.horiz, g.c, n), thicknessPx: g.thPx, conf: 1 })
    if (g.jog) walls.push({ a: P(g.horiz, g.c, g.jog.u), b: P(g.horiz, g.jog.c, g.jog.u), thicknessPx: g.thPx, conf: 1 })
  }
  return { walls, openings }
}
