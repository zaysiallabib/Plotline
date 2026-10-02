/**
 * Wall TRACKS (wave 19, Docs/AUTOTRACE_STRATEGY.md §3): a drawn wall is an occupied stretch of a track — one straight
 * line per wall alignment on the sheet's axes — so parallel duplicates, fragments and tilted walls cannot be
 * represented at all, and nothing downstream has to stitch them.
 *
 *   plant green whitened (founder rule 2) → ink → per column / row every ink run across a would-be wall: its centre and
 *   sub-pixel width → bands (the same cross-section column after column) → the sheet's own thickness classes
 *   (length-weighted band widths, 2–3 peaks) → tracks: bands on one line, longest first; two lines closer than half the
 *   thinnest class are one track (a flush thickness step is one track, its offset absorbed) → along each track:
 *   W = a wall-class cross-section centred on it, B = ink thick both ways (a crossing wall's body, a column, a junction
 *   block), paper → an INTERVAL = W stretches bridged through B, never across paper; its ends are where the ink stops;
 *   thickness snapped to the classes, split where the class changes → an end inside a crossing wall's body or block sits
 *   exactly on that wall's track (corners, T's: one shared point, nothing averaged) → GAPS from each free end to the
 *   next ink on the track (another interval, or a crossing wall's face): a quarter arc centred on a jamb, radius ≈ gap,
 *   not a closed shape (WC bowl, basin) = door; glass colour or ≥ 2 thin lines jamb to jamb = window; otherwise NO
 *   opening — the gap stays open and both walls stop where their ink stops (founder: never draw wall over a window or
 *   an undecided gap).
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
 * Intervals are sorted by u0 and never overlap; their ends sit on crossing tracks where the ink joins them.
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
}

export interface TrackTrace {
  tracks: Track[]
  joins: Join[]
  /** ink thick in both directions (columns, junction blocks, shear walls, cores): bounding boxes, px — never walls */
  blocks: Box[]
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
  kind: 'door' | 'window' | 'unknown'
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
  const empty: TrackTrace = { tracks: [], joins: [], blocks: [], classes: [], ink, plantMask: opts.plant, glass: opts.glass, pxPerM: k, gaps: [] }
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
          if (r - q > maxBlock) {
            if (q > s) pieces.push([s, q - 1])
            s = r
          }
          q = r
        }
        if (j > s) pieces.push([s, j - 1])
        i = j
      }
      for (const [s, e] of pieces) {
        let w0 = s, w1 = e
        while (w0 <= e && lab[w0] !== W_) w0++
        while (w1 >= s && lab[w1] !== W_) w1--
        if (w0 > w1) continue // blocks only: never a wall
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

  // ── jogs: a free end touching the free end of a wall on a parallel track beside it (a flush thickness step, two walls
  // drawn side by side as one band) — joined by a short crosswise piece, both walls exactly on their ink
  const joins: Join[] = []
  const free0 = (iv: Iv) => iv.n0 === iv.f0, free1 = (iv: Iv) => iv.n1 === iv.f1
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
          joins.push({ horiz: T.horiz, u, c0: T.c, c1: T2.c, thPx: Math.min(iv.th, J.th) })
          break
        }
      }

  // ── gaps: from each free end over paper to the next ink on the track; an interval of the track or a crossing wall's
  // body (B) ends it — another wall beside the track (O) means it is no opening
  const gaps: Gap[] = []
  const seen = new Set<string>()
  const arcAt = arcInk(gray)
  const grayAt = (x: number, y: number) => gray.data[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))]
  const inWall = wallBodies(tracks, W, H)
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
          if (T.lab[i] === B_) break
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
          const Q = perp.find((q) => (q.c - far) * dir > 0 && (q.c - far) * dir <= maxBlock && reaches(q, T.c, iv.th))
          node = Q ? Q.c : far
        } else continue
        const u0 = Math.min(face, far), u1 = Math.max(face, far)
        const key = `${T.horiz}|${T.c.toFixed(1)}|${u0.toFixed(1)}|${u1.toFixed(1)}`
        if (seen.has(key)) continue
        seen.add(key)
        const cls = classifyGap(P(u0), P(u1), nb ? Math.max(iv.th, nb.th) : iv.th, k, (x, y) => arcAt(x, y) && !inWall(x, y), grayAt, opts.glass, W, H)
        gaps.push({ horiz: T.horiz, c: T.c, u0, u1, node0: dir > 0 ? face : node, node1: dir > 0 ? node : face, thPx: iv.th, ...(jog ? { jog } : {}), ...cls })
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
  const kept = gaps.filter((g) => !drop.has(g))

  const blocks = blockBoxes(ink, W, H, maxTh)
  return {
    tracks: tracks.map((T) => ({ horiz: T.horiz, c: T.c, intervals: T.ivs.map((iv) => ({ u0: iv.n0, u1: iv.n1, thPx: iv.th })) })),
    joins,
    blocks,
    classes,
    ink,
    plantMask: opts.plant,
    glass: opts.glass,
    pxPerM: k,
    gaps: kept,
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
 *   closed shapes; a swing stops at the leaf);
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
): Pick<Gap, 'kind' | 'conf' | 'hingeAt' | 'swingTo'> {
  const gap = Math.hypot(b.x - a.x, b.y - a.y)
  const ux = (b.x - a.x) / gap, uy = (b.y - a.y) / gap
  const nx = -uy, ny = ux
  if (gap >= M.doorMin * pxPerM && gap <= M.doorMax * pxPerM) {
    const near = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (arcAt(x + dx, y + dy)) return 1
      return 0
    }
    const RF = Array.from({ length: 15 }, (_, j) => 0.6 + 0.05 * j)
    let best = { score: 0, hinge: a, side: 1 }
    // the leaf may hang inside a frame (its hinge up to 0.3 of the gap in from the jamb) or stand on the jamb's end (up
    // to 0.2 out); its radius is the rest of the gap
    for (const [jb, sgn] of [[a, 1], [b, -1]] as const)
      for (let o = -0.2; o <= 0.3001; o += 0.05) {
        const hp = { x: jb.x + ux * sgn * o * gap, y: jb.y + uy * sgn * o * gap }, R = gap * (1 - o)
        for (const side of [1, -1]) {
          // angles 0.1–0.9 of the quarter (the swing) and 1.1–1.5 (past the open leaf: a closed shape goes on there)
          const ring = (j: number, f: number) => {
            const ang = (f * Math.PI) / 2
            const dx = Math.cos(ang) * ux * sgn + Math.sin(ang) * nx * side, dy = Math.cos(ang) * uy * sgn + Math.sin(ang) * ny * side
            return near(hp.x + dx * R * RF[j], hp.y + dy * R * RF[j])
          }
          let inner = 0
          for (let q = 0; q <= 16; q++) {
            const ang = ((0.1 + (0.8 * q) / 16) * Math.PI) / 2
            inner += arcAt(hp.x + (Math.cos(ang) * ux * sgn + Math.sin(ang) * nx * side) * R * 0.5, hp.y + (Math.cos(ang) * uy * sgn + Math.sin(ang) * ny * side) * R * 0.5) ? 1 : 0
          }
          if (inner / 17 > 0.35) continue
          const hits = RF.map((_, j) => Array.from({ length: 17 }, (_, q) => ring(j, 0.1 + (0.8 * q) / 16)))
          for (let j = 3; j <= 11; j++) {
            let hit = 0, clutter = 0
            for (let q = 0; q <= 16; q++) (hit += hits[j][q] | hits[j - 1][q] | hits[j + 1][q]), (clutter += hits[j - 3][q] | hits[j + 3][q])
            if (clutter / 17 > 0.65 || hit / 17 <= best.score) continue
            // past the open leaf (0.6–0.95 of a quarter beyond it): a swing has stopped; a bowl or basin outline goes on
            let past = 0
            for (let q = 0; q <= 8; q++) past += ring(j, 1.12 + (0.38 * q) / 8) | ring(j - 1, 1.12 + (0.38 * q) / 8) | ring(j + 1, 1.12 + (0.38 * q) / 8)
            if (past / 9 > 0.5) continue
            best = { score: hit / 17, hinge: hp, side }
          }
        }
      }
    if (best.score >= 0.7) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      return { kind: 'door', conf: best.score, hingeAt: best.hinge, swingTo: { x: mx + nx * best.side * gap * 0.5, y: my + ny * best.side * gap * 0.5 } }
    }
  }
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

/** Bounding boxes of ink thick both ways (both runs through the pixel longer than the thickest wall class). */
function blockBoxes(ink: Uint8Array, W: number, H: number, maxTh: number): Box[] {
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
  const out: Box[] = []
  const stack: number[] = []
  for (let s = 0; s < blk.length; s++) {
    if (blk[s] !== 1) continue
    let x0 = W, y0 = H, x1 = 0, y1 = 0
    blk[s] = 2
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!, x = p % W, y = (p - x) / W
      ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) if (q >= 0 && q < blk.length && blk[q] === 1) (blk[q] = 2), stack.push(q)
    }
    out.push({ x0: x0 - 0.5, y0: y0 - 0.5, x1: x1 + 0.5, y1: y1 + 0.5 })
  }
  return out
}

/**
 * Tracks → the wall stage's output: one straight wall per interval (centre line between its ends, exact thickness),
 * and for every gap the door / window rules classified, the opening (face to face) plus the short connector from the
 * far face to the far wall's centre line, so the solver joins wall – opening – wall into ONE wall with the opening as
 * its child. Gaps with nothing drawn come out as 'unknown' guesses with conf 0: the solver never bridges them.
 */
export function trackWalls(tt: TrackTrace): { walls: WallSeg[]; openings: OpeningGuess[] } {
  const walls: WallSeg[] = []
  const P = (horiz: boolean, c: number, u: number): Px => (horiz ? { x: u, y: c } : { x: c, y: u })
  for (const T of tt.tracks) for (const iv of T.intervals) walls.push({ a: P(T.horiz, T.c, iv.u0), b: P(T.horiz, T.c, iv.u1), thicknessPx: iv.thPx, conf: 1 })
  for (const j of tt.joins) walls.push({ a: P(j.horiz, j.c0, j.u), b: P(j.horiz, j.c1, j.u), thicknessPx: j.thPx, conf: 1 })
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
