/**
 * ROOMS FIRST — auto-trace strategy v3, step 4 (wave 19). Almost every printed room label carries the room's inner
 * size ("BED-3 11'-0\"X10'-6\""): that W×H rectangle, fitted around the label onto the ink, IS the room — also where the
 * boundary is a window, a railing or nothing at all. The gap between two neighbouring rooms IS their wall: one wall per
 * boundary by construction. Pure: no DOM, no Three, no React.
 *
 * API (the source image's pixel space):
 *   calibrateScale(gray, labels, opts?) → ScaleFit | null      px/m from the rooms' printed sizes alone (≥ 3 sized labels)
 *   fitRooms(gray, labels, opts)        → RoomFit[]            one inner rectangle per sized label + its classified edges
 *   deriveWallsFromRooms(fits, pxPerM)  → RoomWalls            walls on the gaps, openings as their children, the rest listed
 *
 * Conventions: RectPx is half-open pixel index ranges — the room's inside columns are x0 … x1−1, so x0 / x1 / y0 / y1 are
 * its inner faces. Stretch u0 / u1 are half-open pixel indices along the edge (x for top/bottom, y for left/right).
 * WallSeg / OpeningGuess / Unwalled points are pixel CENTRES (pixel i spans i−0.5 … i+0.5), like walls.ts.
 *
 * How a fit is made (ported from the wave-19 spike, E:\dev\tmp\wave19\rooms\fit.ts): evidence = the ink step at each
 * edge (dark outside minus light inside) as prefix sums; every placement of the printed size (±5 %) that contains the
 * label is scored by its four edges' mean step; the sheet's convention (first printed number horizontal or vertical)
 * is a vote; then a joint pass best-first with an overlap penalty, and no rectangle may contain another label.
 *
 * Edge classes (the founder's hard requirement: know where each thing starts and stops, never claim more than is
 * drawn): wall (a dark band of wall thickness at the face — its thickness measured outward) · window (blue glass, or
 * ≥ 2 parallel thin lines within a wall's thickness) · door (a gap between wall stretches with a quarter arc of radius
 * ≈ the gap hinged on a jamb) · thin (one thin line: railing / parapet / partition) · open (nothing drawn) · unsure.
 * Only wall / window / door need positive evidence; anything doubtful is 'unsure' (a review item later).
 *
 * Tracks (src/trace/tracks.ts, being built in parallel): pass `tracks` and every track interval's two wall faces add
 * evidence, so rectangle edges snap onto them. Nothing here depends on it.
 */
import { parseDims } from './text'
import type { Dims, Gray, OpeningGuess, Px, TextItem, WallSeg } from './types'

export interface RectPx {
  x0: number
  y0: number
  x1: number
  y1: number
}

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type EdgeClass = 'wall' | 'window' | 'door' | 'thin' | 'open' | 'unsure'

/** One piece of a room edge, [u0, u1) along it, and what is drawn there. */
export interface Stretch {
  kind: EdgeClass
  u0: number
  u1: number
  /** wall: drawn thickness outward from the face (median, px); window: depth of its outermost line */
  thPx?: number
  /** door: the jamb the leaf hinges on (pixel centre, on the face it swings from) and a point the leaf swings to */
  hingeAt?: Px
  swingTo?: Px
}

export interface RoomEdge {
  side: Side
  /** the face line: y0 / y1 (top / bottom) or x0 / x1 (left / right) */
  c: number
  /** outward normal along the edge's normal axis: −1 for top / left, +1 for bottom / right */
  out: 1 | -1
  u0: number
  u1: number
  /** mean ink step along the edge, −1 … 1 (≈ 1 = dark outside, light inside all the way) */
  evidence: number
  stretches: Stretch[]
}

export interface RoomFit {
  /** the label that seeded it */
  label: TextItem
  /** the seed point (label box centre) */
  at: Px
  /** printed inner size used, metres (aM = first printed number) */
  dims: Dims
  /** true = the first printed number runs vertically on this sheet (the vote's outcome) */
  swapped: boolean
  rect: RectPx
  /** 0 … 1: the four edges' mean ink step */
  conf: number
  /** top, bottom, left, right */
  edges: RoomEdge[]
  /** the size is the reader's guess (TextItem.sizeGuess) the drawing confirmed — a review item, never a printed size */
  guessed?: true
}

/** An axis-aligned wall track (tracks.ts): centre line `c` (px) with occupied intervals along it. */
export interface Track {
  horiz: boolean
  c: number
  intervals: { u0: number; u1: number; thPx: number }[]
}

export interface RgbImage {
  width: number
  height: number
  /** RGBA, as a canvas gives it */
  data: Uint8Array | Uint8ClampedArray
}

export interface RoomsOpts {
  /** known scale; else calibrateScale */
  pxPerM?: number
  /** the sheet in colour: blue glass lines make windows */
  rgb?: RgbImage
  /** wall tracks (tracks.ts): their faces add edge evidence */
  tracks?: Track[]
  /** printed-size slack, fraction (default 0.05) */
  slack?: number
  /** search step px (default 2 at ≥ 40 px/m, else 1) */
  step?: number
  /** the sheet's convention: 'h' = first printed number horizontal, 'v' = vertical, 'vote' (default) */
  orient?: 'vote' | 'h' | 'v'
}

// ─────────────────────────────────────────────────────────────────────────────── seeds

const plausible = (d?: Dims): d is Dims => !!d && d.aM >= 0.6 && d.bM >= 0.6 && d.aM <= 12 && d.bM <= 12
const centre = (b: TextItem['box']): Px => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

interface Seed {
  at: Px
  dims?: Dims
  label: TextItem
  /** the size is the reader's GUESS for a line it flagged unread (TextItem.sizeGuess): a hypothesis, fitted last */
  guessed?: boolean
}

/**
 * Room labels → seeds; a label without its own size takes a size line read as a separate item just beside it. A sure
 * size no label claims (the name above it unread: Sheltech's FOYER / LIVING / K.VER) seeds a room of its own, its label
 * the size item. `guesses`: a label whose size line the reader flagged unread tries its `sizeGuess` (fitRooms keeps it
 * only when the drawing confirms it).
 */
function roomSeeds(labels: TextItem[], guesses = false): Seed[] {
  const dimsItems = labels.filter((i) => i.kind === 'dims' && plausible(i.dims))
  const claimed = new Set<TextItem>()
  const seeds: Seed[] = labels
    .filter((i) => i.kind === 'room')
    .map((it) => {
      const at = centre(it.box)
      let dims = plausible(it.dims) ? it.dims : undefined
      const r = 2.5 * Math.max(12, it.box.h)
      // (the label's own size read a second time as an item beside it: the same size, no room of its own)
      if (dims) for (const d of dimsItems) if (Math.hypot(centre(d.box).x - at.x, centre(d.box).y - at.y) < r) claimed.add(d)
      if (!dims) {
        let best = Infinity, from: TextItem | null = null
        for (const d of dimsItems) {
          const dist = Math.hypot(centre(d.box).x - at.x, centre(d.box).y - at.y)
          if (dist < r && dist < best) (best = dist), (dims = d.dims), (from = d)
        }
        if (from) claimed.add(from)
      }
      if (!dims && guesses && it.sizeUnread && it.sizeGuess) {
        const g = parseDims(it.sizeGuess)
        if (plausible(g ?? undefined)) return { at, dims: g!, label: it, guessed: true }
      }
      return { at, dims, label: it }
    })
  for (const d of dimsItems) if (!claimed.has(d)) seeds.push({ at: centre(d.box), dims: d.dims, label: d })
  return seeds
}

// ─────────────────────────────────────────────────────────────────────────────── evidence

/** Prefix sums of the four directional ink steps. T/B: row-major along x, (w+1)·h; L/R: column-major along y, (h+1)·w. */
interface Evidence {
  w: number
  h: number
  T: Float32Array
  B: Float32Array
  L: Float32Array
  R: Float32Array
}

/**
 * Step responses, dilated ±1 px along the normal so a 2 px search step cannot miss a peak. top(x, y): an edge whose
 * INSIDE starts at row y = max(dark[y−1], dark[y−2]) − max(dark[y], dark[y+1]); bottom = −top (inside above row y).
 */
function evidence(g: Gray, tracks?: Track[], trackBonus = 0.5): Evidence {
  const { width: w, height: h, data } = g
  const lut = new Float32Array(256).map((_, v) => Math.max(0, Math.min(1, (230 - v) / 140)))
  const D = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : lut[data[y * w + x]])
  const sH = new Float32Array(w * h), sV = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      sH[y * w + x] = Math.max(D(x, y - 1), D(x, y - 2)) - Math.max(D(x, y), D(x, y + 1))
      sV[y * w + x] = Math.max(D(x - 1, y), D(x - 2, y)) - Math.max(D(x, y), D(x + 1, y))
    }
  // track faces: a horizontal track's lower face is a room-below's top edge (T), its upper face a room-above's bottom (B)
  const bonus = (horizEdge: boolean, lower: boolean): Float32Array | null => {
    if (!tracks?.length) return null
    const m = new Float32Array(w * h)
    for (const t of tracks) {
      if (t.horiz !== horizEdge) continue
      for (const iv of t.intervals) {
        const r = lower ? Math.round(t.c + (iv.thPx - 1) / 2) + 1 : Math.round(t.c - (iv.thPx - 1) / 2)
        for (let u = Math.max(0, Math.round(iv.u0)); u <= Math.min((horizEdge ? w : h) - 1, Math.round(iv.u1)); u++)
          for (let d = -1; d <= 1; d++) {
            // ±1 px like the steps, so the 2 px search grid cannot miss it
            const x = horizEdge ? u : r + d, y = horizEdge ? r + d : u
            if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = trackBonus
          }
      }
    }
    return m
  }
  const prefix = (s: Float32Array, sign: 1 | -1, horizEdge: boolean, add: Float32Array | null): Float32Array => {
    // dilate (max over ±1 along the normal) then prefix along the edge
    const val = (x: number, y: number) => {
      let v = -Infinity
      for (let d = -1; d <= 1; d++) {
        const xx = horizEdge ? x : x + d, yy = horizEdge ? y + d : y
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) v = Math.max(v, sign * s[yy * w + xx])
      }
      return v + (add ? add[y * w + x] : 0)
    }
    if (horizEdge) {
      const P = new Float32Array((w + 1) * h)
      for (let y = 0; y < h; y++) {
        let acc = 0
        for (let x = 0; x < w; x++) (acc += val(x, y)), (P[y * (w + 1) + x + 1] = acc)
      }
      return P
    }
    const P = new Float32Array((h + 1) * w)
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = 0; y < h; y++) (acc += val(x, y)), (P[x * (h + 1) + y + 1] = acc)
    }
    return P
  }
  return { w, h, T: prefix(sH, 1, true, bonus(true, true)), B: prefix(sH, -1, true, bonus(true, false)), L: prefix(sV, 1, false, bonus(false, true)), R: prefix(sV, -1, false, bonus(false, false)) }
}

/** mean step along each edge of a rect: top, bottom, left, right */
function edgeMeans(E: Evidence, r: RectPx): [number, number, number, number] {
  const { w, h } = E
  const x0 = Math.max(0, Math.min(w, r.x0)), x1 = Math.max(0, Math.min(w, r.x1)), y0 = Math.max(0, Math.min(h, r.y0)), y1 = Math.max(0, Math.min(h, r.y1))
  const lx = Math.max(1, x1 - x0), ly = Math.max(1, y1 - y0)
  const row = (y: number) => Math.max(0, Math.min(h - 1, y)), col = (x: number) => Math.max(0, Math.min(w - 1, x))
  return [
    (E.T[row(r.y0) * (w + 1) + x1] - E.T[row(r.y0) * (w + 1) + x0]) / lx,
    (E.B[row(r.y1) * (w + 1) + x1] - E.B[row(r.y1) * (w + 1) + x0]) / lx,
    (E.L[col(r.x0) * (h + 1) + y1] - E.L[col(r.x0) * (h + 1) + y0]) / ly,
    (E.R[col(r.x1) * (h + 1) + y1] - E.R[col(r.x1) * (h + 1) + y0]) / ly,
  ]
}

// ─────────────────────────────────────────────────────────────────────────────── one rectangle

interface Fit extends RectPx {
  score: number
  swapped: boolean
}

interface FitOpts {
  slack: number
  step: number
  /** other rooms' seeds: a placement containing one (by > 2 px) is refused */
  exclude?: Px[]
  /** penalty 4 × overlap fraction with these rects (joint fitting) */
  avoid?: RectPx[]
}

/** best inner rect of ~W×H px (±slack) containing `seed` */
function fitRect(E: Evidence, seed: Px, W: number, H: number, swapped: boolean, o: FitOpts): Fit | null {
  const { w, h } = E
  const st = o.step
  const sx = Math.round(seed.x), sy = Math.round(seed.y)
  const ex = (o.exclude ?? []).filter((p) => Math.abs(p.x - sx) < W * (1 + o.slack) + 2 && Math.abs(p.y - sy) < H * (1 + o.slack) + 2)
  const av = (o.avoid ?? []).filter((a) => a.x1 > sx - W * 1.1 && a.x0 < sx + W * 1.1 && a.y1 > sy - H * 1.1 && a.y0 < sy + H * 1.1)
  let best: Fit | null = null
  for (let ww = Math.max(4, Math.round(W * (1 - o.slack))); ww <= Math.round(W * (1 + o.slack)); ww += st)
    for (let hh = Math.max(4, Math.round(H * (1 - o.slack))); hh <= Math.round(H * (1 + o.slack)); hh += st)
      for (let x0 = Math.max(2, sx - ww + 1); x0 <= sx - 1 && x0 + ww < w - 2; x0 += st) {
        const x1 = x0 + ww
        for (let y0 = Math.max(2, sy - hh + 1); y0 <= sy - 1 && y0 + hh < h - 2; y0 += st) {
          const y1 = y0 + hh
          let s =
            (E.T[y0 * (w + 1) + x1] - E.T[y0 * (w + 1) + x0]) / ww +
            (E.B[y1 * (w + 1) + x1] - E.B[y1 * (w + 1) + x0]) / ww +
            (E.L[x0 * (h + 1) + y1] - E.L[x0 * (h + 1) + y0]) / hh +
            (E.R[x1 * (h + 1) + y1] - E.R[x1 * (h + 1) + y0]) / hh
          if (best && s <= best.score) continue
          if (ex.some((p) => p.x > x0 + 2 && p.x < x1 - 2 && p.y > y0 + 2 && p.y < y1 - 2)) continue
          for (const a of av) {
            const ix = Math.min(x1, a.x1) - Math.max(x0, a.x0), iy = Math.min(y1, a.y1) - Math.max(y0, a.y0)
            if (ix > 0 && iy > 0) s -= (4 * ix * iy) / (ww * hh)
          }
          if (!best || s > best.score) best = { x0, y0, x1, y1, score: s, swapped }
        }
      }
  return best
}

const area = (r: RectPx) => (r.x1 - r.x0) * (r.y1 - r.y0)
const overlap = (a: RectPx, b: RectPx) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/**
 * Fit every sized seed: orientation by the sheet's vote, then jointly — duplicates (two labels → one room) dropped,
 * each room re-fitted best-first with an overlap penalty against the others. Labels without a size still count as
 * "another room is here" (no rectangle may contain them).
 */
function jointFit(E: Evidence, seeds: Seed[], k: number, slack: number, step: number, orient: 'vote' | 'h' | 'v'): (Fit | null)[] {
  const others = (i: number) => seeds.filter((s, j) => j !== i && Math.hypot(s.at.x - seeds[i].at.x, s.at.y - seeds[i].at.y) > 1.2 * k).map((s) => s.at)
  const fitOne = (i: number, swapped: boolean, avoid?: RectPx[]): Fit | null => {
    const d = seeds[i].dims
    if (!d) return null
    const [W, H] = swapped ? [d.bM * k, d.aM * k] : [d.aM * k, d.bM * k]
    return fitRect(E, seeds[i].at, W, H, swapped, { slack, step, exclude: others(i), avoid })
  }
  let cur: (Fit | null)[]
  // guessed sizes take no part in the vote or the joint passes: fitted last, around the others
  const sure = (i: number) => !seeds[i].guessed
  let swappedSheet = orient === 'v'
  if (orient === 'vote') {
    const A = seeds.map((_, i) => (sure(i) ? fitOne(i, false) : null)), B = seeds.map((_, i) => (sure(i) ? fitOne(i, true) : null))
    let hv = 0, vv = 0
    seeds.forEach((s, i) => {
      if (!A[i] || !B[i] || Math.abs(s.dims!.aM - s.dims!.bM) / Math.max(s.dims!.aM, s.dims!.bM) < 0.12) return
      if (A[i]!.score > B[i]!.score + 0.2) hv++
      else if (B[i]!.score > A[i]!.score + 0.2) vv++
    })
    swappedSheet = hv < vv
    cur = hv >= vv ? A : B
  } else cur = seeds.map((_, i) => (sure(i) ? fitOne(i, orient === 'v') : null))
  const order = cur.map((f, i) => ({ f, i })).filter((x) => x.f).sort((a, b) => b.f!.score - a.f!.score).map((x) => x.i)
  order.forEach((i, oi) => {
    for (const j of order.slice(oi + 1)) if (cur[i] && cur[j] && overlap(cur[i]!, cur[j]!) > 0.5 * Math.min(area(cur[i]!), area(cur[j]!))) cur[j] = null
  })
  for (let pass = 0; pass < 2; pass++)
    for (const i of order) {
      if (!cur[i]) continue
      const f = fitOne(i, cur[i]!.swapped, cur.filter((x, j) => x && j !== i) as RectPx[])
      if (f) cur[i] = f
    }
  seeds.forEach((s, i) => {
    if (s.guessed) cur[i] = fitOne(i, swappedSheet, cur.filter((x) => x) as RectPx[])
  })
  return cur
}

const DARK = new Float32Array(256).map((_, v) => Math.max(0, Math.min(1, (230 - v) / 140)))

/**
 * Each side alone, ±r px at step 1, onto its sharpest one-pixel step (dark just outside − dark just inside). The
 * search evidence is 2 px wide and dilated, so a fit can sit anywhere on a 4 px plateau; this puts the face on the ink.
 */
function refineSides(g: Gray, f: RectPx, r: number): RectPx {
  const out = { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1 }
  const D = (x: number, y: number) => (x < 0 || y < 0 || x >= g.width || y >= g.height ? 0 : DARK[g.data[y * g.width + x]])
  const step = (side: Side, c: number) => {
    let s = 0, n = 0
    if (side === 'top' || side === 'bottom')
      for (let x = out.x0; x < out.x1; x++) (s += side === 'top' ? D(x, c - 1) - D(x, c) : D(x, c) - D(x, c - 1)), n++
    else for (let y = out.y0; y < out.y1; y++) (s += side === 'left' ? D(c - 1, y) - D(c, y) : D(c, y) - D(c - 1, y)), n++
    return n ? s / n : 0
  }
  const key = { top: 'y0', bottom: 'y1', left: 'x0', right: 'x1' } as const
  for (const side of SIDES) {
    const base = out[key[side]]
    let best = -Infinity, bv = base
    for (let d = 0; d <= r; d++)
      for (const dd of d ? [-d, d] : [0]) {
        const v = step(side, base + dd)
        if (v > best + 1e-6) (best = v), (bv = base + dd)
      }
    out[key[side]] = bv
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────── scale

export interface ScaleFit {
  pxPerM: number
  /** rooms whose fit agreed (confident fits used for the median) */
  rooms: number
  /** interquartile range of the per-room ratios ÷ median */
  spread: number
  /** the px/m range searched */
  bracket: [number, number]
  /** the same median from the widths alone and from the heights alone (a scan or export stretched on one axis) */
  axes: [number, number]
}

/** The sheet's wall grey: the most common grey among dark pixels (≤ 160), 9-bin smoothed. */
function wallGray(g: Gray): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < g.data.length; i++) if (g.data[i] <= 160) hist[g.data[i]]++
  let best = 0, bv = 80
  for (let v = 0; v <= 160; v++) {
    let s = 0
    for (let d = -4; d <= 4; d++) s += hist[Math.max(0, Math.min(255, v + d))]
    if (s > best) (best = s), (bv = v)
  }
  return bv
}

/** grey ≤ this = wall ink: the wall grey + 45 (BTI walls 75 → 120 keeps their soft 136–150 shadow out) */
export const darkMaxOf = (g: Gray) => Math.max(40, Math.min(150, wallGray(g) + 45))

/**
 * px/m bracket from the wall-thickness prior only: the commonest dark run across ink (rows and columns, 2–60 px) is a
 * wall's thickness, and walls are 0.10–0.30 m.
 */
function wallBracket(g: Gray): [number, number] {
  const { width: w, height: h, data } = g
  const dm = darkMaxOf(g)
  const hist = new Float64Array(64)
  const scan = (n: number, len: number, at: (i: number, j: number) => number) => {
    for (let i = 0; i < n; i++) {
      let run = 0
      for (let j = 0; j <= len; j++) {
        if (j < len && data[at(i, j)] <= dm) run++
        else {
          if (run >= 2 && run < 64) hist[run]++
          run = 0
        }
      }
    }
  }
  scan(h, w, (y, x) => y * w + x)
  scan(w, h, (x, y) => y * w + x)
  let t = 0, best = 0
  for (let r = 2; r < 64; r++) if (hist[r] > best) (best = hist[r]), (t = r)
  if (!t) return [10, 150]
  return [Math.max(6, t / 0.3), Math.min(400, t / 0.1)]
}

/** best mean-edge score of the exact W×H placement containing the seed (scale scan: no slack) */
function bestExact(E: Evidence, seed: Px, W: number, H: number, st: number, exclude: Px[]): number {
  const f = fitRect(E, seed, W, H, false, { slack: 0, step: st, exclude })
  return f ? f.score : 0
}

/**
 * Consensus px/m from the rooms themselves: scan a px/m range (`guess` ± 30 %, else the wall-thickness bracket) for
 * the scale at which the printed sizes sit best on the ink (sum over rooms, the sheet's better orientation; 2 % steps),
 * then twice: every room placed at that scale, its sides moved onto their sharpest steps nearby, the median fitted ÷
 * printed ratio of the sides on clear ink. Needs ≥ 3 sized labels.
 */
export function calibrateScale(gray: Gray, labels: TextItem[], opts: { guess?: number; tracks?: Track[] } = {}): ScaleFit | null {
  const seeds = roomSeeds(labels)
  const sized = seeds.map((s, i) => ({ s, i })).filter((x) => x.s.dims)
  if (sized.length < 3) return null
  const E = evidence(gray, opts.tracks)
  const bracket: [number, number] = opts.guess ? [opts.guess / 1.3, opts.guess * 1.3] : wallBracket(gray)
  let sBest = 0, scBest = -Infinity
  for (let s = bracket[0]; s <= bracket[1]; s *= 1.02) {
    const st = Math.max(1, Math.round(0.03 * s))
    const others = (i: number) => seeds.filter((q, j) => j !== i && Math.hypot(q.at.x - seeds[i].at.x, q.at.y - seeds[i].at.y) > 1.2 * s).map((q) => q.at)
    let sa = 0, sb = 0
    for (const { s: seed, i } of sized) {
      const d = seed.dims!
      sa += bestExact(E, seed.at, d.aM * s, d.bM * s, st, others(i))
      sb += bestExact(E, seed.at, d.bM * s, d.aM * s, st, others(i))
    }
    if (Math.max(sa, sb) > scBest) (scBest = Math.max(sa, sb)), (sBest = s)
  }
  // refine twice: each room's exact-size placement at the current scale, each side onto its sharpest step nearby
  // (±5 %, then ±2 %), the fitted ÷ printed ratios' median. Per axis: a width counts when both side edges sit on clear
  // ink, a height when top and bottom do (a pale-blue glazed side next to a tinted floor is a weak step).
  let k = sBest, rooms = 0, spread = NaN, axes: [number, number] = [NaN, NaN]
  for (const reach of [0.05, 0.02]) {
    const st = Math.max(1, Math.round(0.02 * k))
    const place = (swapped: boolean) =>
      sized.map(({ s: seed, i }) => {
        const d = seed.dims!
        const [W, H] = swapped ? [d.bM, d.aM] : [d.aM, d.bM]
        const others = seeds.filter((q, j) => j !== i && Math.hypot(q.at.x - seed.at.x, q.at.y - seed.at.y) > 1.2 * k).map((q) => q.at)
        return { f: fitRect(E, seed.at, W * k, H * k, swapped, { slack: 0, step: st, exclude: others }), W, H }
      })
    const A = place(false), B = place(true)
    const sum = (P: typeof A) => P.reduce((t, p) => t + (p.f?.score ?? 0), 0)
    const P = sum(A) >= sum(B) ? A : B
    const rx: number[] = [], ry: number[] = []
    let used = 0
    for (const { f, W, H } of P) {
      if (!f) continue
      const r = refineSides(gray, f, Math.round(reach * k * Math.max(W, H)) + 2)
      const [t, b, l, rr] = edgeMeans(E, r)
      if (Math.min(l, rr) >= 0.35) rx.push((r.x1 - r.x0) / W)
      if (Math.min(t, b) >= 0.35) ry.push((r.y1 - r.y0) / H)
      if (Math.min(l, rr) >= 0.35 || Math.min(t, b) >= 0.35) used++
    }
    const ratios = [...rx, ...ry].sort((a, b) => a - b)
    if (ratios.length < 4) break
    const med = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : NaN)
    k = med(ratios)
    axes = [med(rx), med(ry)]
    rooms = used
    spread = (ratios[Math.floor(ratios.length * 0.75)] - ratios[Math.floor(ratios.length * 0.25)]) / k
  }
  return { pxPerM: k, rooms, spread, bracket, axes }
}

// ─────────────────────────────────────────────────────────────────────────────── edge classes

const CLASSES: EdgeClass[] = ['wall', 'window', 'door', 'thin', 'open', 'unsure']

/** profile marks from the colour image */
const BLUE = 1, GREEN = 2

interface ProfileCtx {
  k: number
  darkMax: number
  /** search band inward/outward of the fitted face for the first ink, px */
  tol: number
  /** a dark run at least this long (px) is a wall */
  minWall: number
  /** thin line: at most this wide (px) */
  lineW: number
  /** the sheet draws its glass in blue: then grey parallel lines are railings / parapets, not windows */
  blueGlass?: boolean
}

interface ClassCtx extends ProfileCtx {
  g: Gray
  /** BLUE (glass) / GREEN (plants: foliage hides what is under it) per pixel, when a colour image was given */
  mark?: (x: number, y: number) => number
}

function classCtx(g: Gray, k: number, rgb?: RgbImage): ClassCtx {
  const base = { g, k, darkMax: darkMaxOf(g), tol: Math.max(2, Math.round(0.04 * k)), minWall: Math.max(2, Math.round(0.07 * k)), lineW: Math.max(2, Math.round(0.04 * k)) }
  if (!rgb) return base
  const { width: w, height: h, data } = rgb
  const isBlue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false
    const i = (y * w + x) * 4
    return data[i + 2] - Math.max(data[i], data[i + 1]) >= 25
  }
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return 0
    const i = (y * w + x) * 4, r = data[i], gg = data[i + 1], b = data[i + 2]
    return b - Math.max(r, gg) >= 25 ? BLUE : gg - r >= 12 && gg - b >= 20 ? GREEN : 0
  }
  // glass drawn blue on this sheet: ≥ 300 thin blue pixels (a fill is blue 2 px away on both sides, a line is not)
  let thinBlue = 0
  for (let y = 2; y < h - 2 && thinBlue < 300; y++)
    for (let x = 2; x < w - 2; x++) if (isBlue(x, y) && ((!isBlue(x - 2, y) && !isBlue(x + 2, y)) || (!isBlue(x, y - 2) && !isBlue(x, y + 2)))) thinBlue++
  return { ...base, mark, blueGlass: thinBlue >= 300 }
}

/** pixel at depth d outward of the face, at u along the edge (d < 0 = inside the room) */
function at(side: Side, c: number, u: number, d: number): [number, number] {
  switch (side) {
    case 'top':
      return [u, c - 1 - d]
    case 'bottom':
      return [u, c + d]
    case 'left':
      return [c - 1 - d, u]
    case 'right':
      return [c + d, u]
  }
}

/**
 * What is drawn at one position of an edge, from the grey profile along the outward normal (index 0 = tol px inside
 * the face). wall = a dark run touching the face, at least minWall long; window = blue glass, or ≥ 2 thin lines
 * (≤ 0.15 m apart, within 0.4 m) starting at the face; thin = one line at the face; open = no ink within 0.12 m.
 */
export function classifyProfile(v: ArrayLike<number>, marks: ArrayLike<number> | null, cx: ProfileCtx): { kind: EdgeClass; th: number } {
  const { k, darkMax, tol, minWall, lineW } = cx
  const n = v.length
  const touch = 2 * tol
  for (let i = 0; i <= touch && i < n; i++) {
    if (v[i] > darkMax) continue
    let j = i, green = 0
    for (; j < n && v[j] <= darkMax; j++) if (marks?.[j] === GREEN) green++
    if (j - i >= minWall) return green > 0.3 * (j - i) ? { kind: 'unsure', th: 0 } : { kind: 'wall', th: j - i }
    i = j
  }
  if (marks) {
    for (let a = 0; a < Math.min(n, touch + Math.round(0.3 * k)); a++) {
      if (marks[a] !== BLUE) continue
      let b = a
      while (b < n && marks[b] === BLUE) b++
      if (b - a <= Math.max(3, 0.06 * k)) return { kind: 'window', th: b - tol }
      a = b
    }
    for (let a = 0; a <= touch && a < n; a++) if (marks[a] === GREEN) return { kind: 'unsure', th: 0 }
  }
  // thin lines: runs ≤ lineW px, ≥ 25 darker than the lightest pixel within 4 px
  const lines: [number, number][] = []
  const isLine = (p: number) => {
    let ref = 0
    for (let q = Math.max(0, p - 4); q <= Math.min(n - 1, p + 4); q++) ref = Math.max(ref, v[q])
    return v[p] <= ref - 25
  }
  let anyInk = false
  for (let p = 0; p < n; p++) {
    if (!isLine(p)) continue
    let q = p
    while (q < n && isLine(q)) q++
    if (p <= touch + Math.round(0.12 * k)) anyInk = true
    if (q - p <= lineW) lines.push([p, q])
    else if (!lines.length && p <= touch) return { kind: 'unsure', th: 0 }
    p = q
  }
  if (!lines.length || lines[0][0] > touch) return { kind: anyInk ? 'unsure' : 'open', th: 0 }
  let m = 1
  while (m < lines.length && lines[m][0] - lines[m - 1][1] <= 0.15 * k && lines[m][1] - lines[0][0] <= 0.4 * k) m++
  return m >= 2 && !cx.blueGlass ? { kind: 'window', th: lines[m - 1][1] - tol } : { kind: 'thin', th: lines[0][1] - lines[0][0] }
}

/** mode filter over ±h, then runs; runs shorter than minLen become their neighbours' class when both agree, else unsure */
function toStretches(cls: Uint8Array, th: Float32Array, u0: number, h: number, minLen: number): Stretch[] {
  const n = cls.length
  const sm = new Uint8Array(n)
  const cnt = new Int32Array(CLASSES.length)
  for (let i = 0; i < n; i++) {
    cnt.fill(0)
    for (let j = Math.max(0, i - h); j <= Math.min(n - 1, i + h); j++) cnt[cls[j]]++
    let b = cls[i]
    for (let c = 0; c < CLASSES.length; c++) if (cnt[c] > cnt[b]) b = c
    sm[i] = b
  }
  let runs: { c: number; a: number; b: number }[] = []
  for (let i = 0; i < n; ) {
    let j = i
    while (j < n && sm[j] === sm[i]) j++
    runs.push({ c: sm[i], a: i, b: j })
    i = j
  }
  const unsure = CLASSES.indexOf('unsure')
  for (let changed = true; changed; ) {
    changed = false
    for (let r = 0; r < runs.length; r++) {
      const x = runs[r]
      if (x.b - x.a >= minLen || runs.length === 1) continue
      const p = runs[r - 1], q = runs[r + 1]
      const to = p && q && p.c === q.c ? p.c : unsure
      if (x.c !== to) (x.c = to), (changed = true)
    }
    const merged: typeof runs = []
    for (const x of runs) {
      const last = merged[merged.length - 1]
      if (last && last.c === x.c) last.b = x.b
      else merged.push({ ...x })
    }
    if (merged.length !== runs.length) changed = true
    runs = merged
  }
  return runs.map((x) => {
    const kind = CLASSES[x.c]
    const s: Stretch = { kind, u0: u0 + x.a, u1: u0 + x.b }
    if (kind === 'wall' || kind === 'window') {
      const t: number[] = []
      for (let i = x.a; i < x.b; i++) if (cls[i] === x.c) t.push(th[i])
      t.sort((a, b) => a - b)
      if (t.length) s.thPx = t[t.length >> 1]
    }
    return s
  })
}

function edgeOf(side: Side, r: RectPx): { c: number; out: 1 | -1; u0: number; u1: number } {
  if (side === 'top') return { c: r.y0, out: -1, u0: r.x0, u1: r.x1 }
  if (side === 'bottom') return { c: r.y1, out: 1, u0: r.x0, u1: r.x1 }
  if (side === 'left') return { c: r.x0, out: -1, u0: r.y0, u1: r.y1 }
  return { c: r.x1, out: 1, u0: r.y0, u1: r.y1 }
}

const SIDES: Side[] = ['top', 'bottom', 'left', 'right']
const horizSide = (s: Side) => s === 'top' || s === 'bottom'

/** walk one edge: per-pixel classes → stretches */
function classifyEdge(cx: ClassCtx, side: Side, r: RectPx): Stretch[] {
  const { c, u0, u1 } = edgeOf(side, r)
  const depth = cx.tol + Math.round(0.5 * cx.k)
  const n = u1 - u0
  const cls = new Uint8Array(n), th = new Float32Array(n)
  const v = new Uint8Array(depth + cx.tol), b = cx.mark ? new Uint8Array(v.length) : null
  for (let i = 0; i < n; i++) {
    for (let d = -cx.tol; d < depth; d++) {
      const [x, y] = at(side, c, u0 + i, d)
      const inside = x >= 0 && y >= 0 && x < cx.g.width && y < cx.g.height
      v[d + cx.tol] = inside ? cx.g.data[y * cx.g.width + x] : 255
      if (b) b[d + cx.tol] = cx.mark!(x, y)
    }
    const p = classifyProfile(v, b, cx)
    cls[i] = CLASSES.indexOf(p.kind)
    th[i] = p.th
  }
  return toStretches(cls, th, u0, Math.max(1, Math.round(0.03 * cx.k)), Math.max(2, Math.round(0.08 * cx.k)))
}

/** a thin line pixel crossing the radius here: ≥ 15 darker than both radial neighbours 3 px away */
function ridge(g: Gray, x: number, y: number, dx: number, dy: number): boolean {
  const px = (xx: number, yy: number) => {
    const xi = Math.round(xx), yi = Math.round(yy)
    return xi < 0 || yi < 0 || xi >= g.width || yi >= g.height ? 255 : g.data[yi * g.width + xi]
  }
  return px(x, y) <= Math.min(px(x - 3 * dx, y - 3 * dy), px(x + 3 * dx, y + 3 * dy)) - 15
}

/**
 * Share of a quarter arc (10°…80°) hinged at H, from direction e (across the gap) to m (into the swing room), with
 * ink — at ONE radius (0.85…1.08 × r, ±1 px): hatched floors cross every radius somewhere, an arc keeps its own.
 */
export function arcCoverage(g: Gray, H: Px, e: Px, m: Px, r: number): number {
  const N = 24
  const r0 = Math.round(0.85 * r), r1 = Math.round(1.08 * r), w = r >= 60 ? 2 : 1
  const hits: Uint8Array[] = []
  for (let t = 0; t < N; t++) {
    const a = ((10 + (70 * t) / (N - 1)) * Math.PI) / 180
    const dx = Math.cos(a) * e.x + Math.sin(a) * m.x, dy = Math.cos(a) * e.y + Math.sin(a) * m.y
    const h = new Uint8Array(r1 - r0 + 1 + 2 * w)
    for (let rr = r0 - w; rr <= r1 + w; rr++) h[rr - r0 + w] = ridge(g, H.x + dx * rr, H.y + dy * rr, dx, dy) ? 1 : 0
    hits.push(h)
  }
  let best = 0
  for (let i = w; i <= r1 - r0 + w; i++) {
    let n = 0
    for (const h of hits) if (h.subarray(i - w, i + w + 1).some((x) => x)) n++
    best = Math.max(best, n / N)
  }
  return best
}

/** point on the face line (pixel centres) at u, `d` px outward */
function facePoint(side: Side, c: number, u: number, d: number): Px {
  const f = horizSide(side) ? { x: u, y: side === 'top' ? c - 0.5 - d : c - 0.5 + d } : { x: side === 'left' ? c - 0.5 - d : c - 0.5 + d, y: u }
  return f
}

/**
 * A door in the gap g0 … g1 of an edge: a quarter arc of radius ≈ the gap hinged on either jamb, on either face of the
 * wall (a stub ending on the face carries the hinge), swinging either way — or two (a double door, equal leaves or a
 * main door's 0.75 + 0.4 m). Best coverage ≥ 0.7, else null.
 */
function doorArc(cx: ClassCtx, side: Side, c: number, g0: number, g1: number, th: number): { cov: number; hinge: Px; swing: Px } | null {
  const gap = g1 - g0
  if (gap < 0.55 * cx.k || gap > 1.25 * cx.k) return null
  const along: Px = horizSide(side) ? { x: 1, y: 0 } : { x: 0, y: 1 }
  const back: Px = { x: -along.x, y: -along.y }
  const outN: Px = horizSide(side) ? { x: 0, y: side === 'top' ? -1 : 1 } : { x: side === 'left' ? -1 : 1, y: 0 }
  let best: { cov: number; hinge: Px; swing: Px } | null = null
  const fr = [0.3, 0.4, 0.5, 0.6, 0.7]
  for (const swingIn of [true, false])
    for (const d of [0, th]) {
      const m = swingIn ? { x: -outN.x, y: -outN.y } : outN
      const j0 = facePoint(side, c, g0 - 0.5, d), j1 = facePoint(side, c, g1 - 0.5, d)
      for (const [H, e] of [[j0, along], [j1, back]] as const) {
        const cov = arcCoverage(cx.g, H, e, m, gap)
        if (cov >= 0.7 && (!best || cov > best.cov)) best = { cov, hinge: H, swing: { x: H.x + m.x * gap, y: H.y + m.y * gap } }
      }
      const cA = fr.map((f) => arcCoverage(cx.g, j0, along, m, f * gap)), cB = fr.map((f) => arcCoverage(cx.g, j1, back, m, f * gap))
      fr.forEach((fa, i) =>
        fr.forEach((fb, j) => {
          const cov = Math.min(cA[i], cB[j])
          if (fa + fb >= 0.85 && fa + fb <= 1.15 && cov >= 0.7 && (!best || cov > best.cov)) best = { cov, hinge: j0, swing: { x: j0.x + m.x * fa * gap, y: j0.y + m.y * fa * gap } }
        }),
      )
    }
  return best
}

/**
 * Doors: a run of non-wall stretches 0.55–1.25 m long between two wall stretches (an edge end counts when the
 * perpendicular edge is wall at that corner) with a quarter arc of radius ≈ the gap (or two of half the gap) hinged on
 * a jamb, swinging into this room or out of it.
 */
function findDoors(cx: ClassCtx, fitEdges: { side: Side; c: number; u0: number; u1: number; stretches: Stretch[] }[]): void {
  const k = cx.k
  const cornerInk = (side: Side, atStart: boolean): boolean => {
    // the perpendicular edge meeting this one's start (u0) or end (u1)
    const perp = horizSide(side) ? (atStart ? 'left' : 'right') : atStart ? 'top' : 'bottom'
    const pe = fitEdges.find((e) => e.side === perp)!
    const near = horizSide(side) ? (side === 'top' ? pe.stretches[0] : pe.stretches[pe.stretches.length - 1]) : side === 'left' ? pe.stretches[0] : pe.stretches[pe.stretches.length - 1]
    return !!near && near.kind !== 'open'
  }
  // second pass: a door leaf drawn shut across the gap reads as grey lines (window-like); an arc on the jamb still makes
  // it a door. Not where the sheet draws its glass blue: there a window is glass, never a door.
  const passes = [(s: Stretch) => s.kind === 'open' || s.kind === 'thin' || s.kind === 'unsure', (s: Stretch) => s.kind !== 'wall' && s.kind !== 'door']
  for (const isGap of cx.blueGlass ? passes.slice(0, 1) : passes)
  for (const E of fitEdges) {
    const S = E.stretches
    for (let a = 0; a < S.length; a++) {
      if (!isGap(S[a])) continue
      let b = a
      while (b + 1 < S.length && isGap(S[b + 1])) b++
      // between two wall stretches; at a corner the perpendicular edge only needs some ink there (a leaf drawn open
      // along it reads as lines) — but one side must be this edge's own wall
      const leftOk = a > 0 ? S[a - 1].kind === 'wall' : cornerInk(E.side, true)
      const rightOk = b < S.length - 1 ? S[b + 1].kind === 'wall' : cornerInk(E.side, false)
      // …and one jamb a wall seen ACROSS (≤ 0.4 m deep): a wall running away from the face reads deeper than any wall
      const across = (s?: Stretch) => s?.kind === 'wall' && (s.thPx ?? 0) <= 0.4 * k
      const jambOk = across(S[a - 1]) || across(S[b + 1])
      // the wall's thickness: the thinner neighbour (a perpendicular wall ending on the face reads as a long run)
      const ths = [S[a - 1]?.thPx, S[b + 1]?.thPx].filter((t): t is number => !!t)
      const th = Math.max(0.08 * k, Math.min(0.35 * k, ths.length ? Math.min(...ths) : 0.15 * k))
      // the jambs: the run's ends, or inside a short 'unsure' bit at either end (a jamb's shadow / frame)
      const short = (s: Stretch) => s.kind === 'unsure' && s.u1 - s.u0 < 0.1 * k
      const cand: [number, number][] = []
      for (const ta of b > a && short(S[a]) ? [0, 1] : [0]) for (const tb of b - ta > a && short(S[b]) ? [0, 1] : [0]) cand.push([a + ta, b - tb])
      let found: { cov: number; hinge: Px; swing: Px; i: number; j: number } | null = null
      if (leftOk && rightOk && jambOk)
        for (const [i, j] of cand) {
          const d = doorArc(cx, E.side, E.c, S[i].u0, S[j].u1, th)
          if (d && (!found || d.cov > found.cov)) found = { ...d, i, j }
        }
      if (found) {
        S.splice(found.i, found.j - found.i + 1, { kind: 'door', u0: S[found.i].u0, u1: S[found.j].u1, hingeAt: found.hinge, swingTo: found.swing })
        b -= found.j - found.i
      }
      a = b
    }
  }
}

/** classify the four edges of a fitted rectangle */
function classifyRoom(cx: ClassCtx, r: RectPx): { side: Side; c: number; out: 1 | -1; u0: number; u1: number; stretches: Stretch[] }[] {
  const edges = SIDES.map((side) => ({ side, ...edgeOf(side, r), stretches: classifyEdge(cx, side, r) }))
  findDoors(cx, edges)
  return edges
}

// ─────────────────────────────────────────────────────────────────────────────── fitRooms

/**
 * One inner rectangle per sized room label, its edges classified. Empty when no scale is given or found. A size the
 * reader only guessed (TextItem.sizeGuess on a flagged line) is a hypothesis: its rectangle is kept only when the drawing
 * confirms it — all four sides on clear evidence (mean ink step ≥ 0.35, track faces count) and no overlap with any
 * other room (RoomFit.guessed); else the room stays unsized (the Studio asks for the size).
 */
export function fitRooms(gray: Gray, labels: TextItem[], opts: RoomsOpts = {}): RoomFit[] {
  const seeds = roomSeeds(labels, true)
  const k = opts.pxPerM ?? calibrateScale(gray, labels, { tracks: opts.tracks })?.pxPerM
  if (!k) return []
  const E = evidence(gray, opts.tracks)
  const step = opts.step ?? (k >= 40 ? 2 : 1)
  const fits = jointFit(E, seeds, k, opts.slack ?? 0.05, step, opts.orient ?? 'vote')
  const cx = classCtx(gray, k, opts.rgb)
  const out: RoomFit[] = []
  const rects = fits.map((f) => f && refineSides(gray, f, step + 2))
  fits.forEach((f, i) => {
    if (!f) return
    const rect = rects[i]!
    const ev = edgeMeans(E, rect)
    if (seeds[i].guessed && (Math.min(...ev) < 0.35 || rects.some((r, j) => r && j !== i && overlap(r, rect) > 0.03 * area(rect)))) return
    const edges = classifyRoom(cx, rect)
    out.push({
      label: seeds[i].label,
      at: seeds[i].at,
      dims: seeds[i].dims!,
      swapped: f.swapped,
      rect,
      conf: Math.max(0, Math.min(1, ev.reduce((a, b) => a + b, 0) / 4)),
      edges: edges.map((e, j) => ({ ...e, evidence: ev[j] })),
      ...(seeds[i].guessed ? { guessed: true as const } : {}),
    })
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────── walls from rooms

/** A room-edge stretch that makes no wall (thin line, nothing drawn, or doubtful): the integration lists it for review. */
export interface Unwalled {
  a: Px
  b: Px
  kind: 'thin' | 'open' | 'unsure'
  /** indices into the fits it bounds (two when shared) */
  rooms: number[]
}

export interface RoomWalls {
  walls: WallSeg[]
  /** openings as children of walls[wall] (core invariant 1) */
  openings: (OpeningGuess & { wall: number })[]
  unwalled: Unwalled[]
}

interface Piece {
  horiz: boolean
  /** centre line (pixel centres) */
  c: number
  th: number
  /** extent along the line, continuous pixel-centre coordinates */
  u0: number
  u1: number
  ops: { kind: 'door' | 'window'; u0: number; u1: number; hingeAt?: Px; swingTo?: Px }[]
  shared: boolean
}

/**
 * The walls the fitted rooms imply. Facing edges of two rooms (parallel, 0–0.45 m apart, overlapping) share ONE wall
 * on the centre line of the gap, thickness = the gap (clamped 0.1–0.35 m); an edge with no neighbour takes the
 * thickness drawn outward. Walls exist only over wall / door / window stretches — doors and windows become openings
 * of that wall; thin / open / unsure stretches make no wall and come back in `unwalled`. Collinear pieces merge into
 * one wall (across a perpendicular wall's body), and ends meeting a perpendicular wall snap onto its centre line.
 * ponytail: axis-aligned rooms only (the fit is axis-aligned); angled walls stay with the tracker.
 */
export function deriveWallsFromRooms(fits: RoomFit[], pxPerM: number): RoomWalls {
  const k = pxPerM
  const pieces: Piece[] = []
  const unwalled: Unwalled[] = []
  const classAt = (e: RoomEdge, u: number): Stretch | undefined => e.stretches.find((s) => u >= s.u0 && u < s.u1)
  const pt = (horiz: boolean, c: number, u: number): Px => (horiz ? { x: u, y: c } : { x: c, y: u })
  /** one run of samples along a line → pieces + unwalled */
  const emit = (horiz: boolean, centre: (th: number) => number, thFixed: number | null, u0: number, samples: { s?: Stretch; t?: Stretch }[], rooms: number[]) => {
    const kindOf = (x: { s?: Stretch; t?: Stretch }): EdgeClass => {
      const a = x.s?.kind ?? 'unsure', b = x.t ? x.t.kind : a
      if (a === b) return a
      if ((a === 'door' && b !== 'wall' && b !== 'window') || (b === 'door' && a !== 'wall' && a !== 'window')) return 'door'
      return 'unsure'
    }
    const kinds = samples.map(kindOf)
    for (let i = 0; i < kinds.length; ) {
      const walled = kinds[i] === 'wall' || kinds[i] === 'door' || kinds[i] === 'window'
      let j = i
      while (j < kinds.length && (kinds[j] === 'wall' || kinds[j] === 'door' || kinds[j] === 'window') === walled && (walled || kinds[j] === kinds[i])) j++
      if (walled) {
        const ths = samples.slice(i, j).flatMap((x, q) => (kinds[i + q] === 'wall' ? [x.s?.thPx ?? 0] : [])).filter((t) => t > 0).sort((a, b) => a - b)
        const th = thFixed ?? (ths.length ? ths[ths.length >> 1] : 0.127 * k)
        const c = centre(th)
        const ops: Piece['ops'] = []
        for (let q = i; q < j; ) {
          let r = q
          while (r < j && kinds[r] === kinds[q]) r++
          if (kinds[q] === 'door' || kinds[q] === 'window') {
            const src = samples[q].s?.kind === kinds[q] ? samples[q].s : samples[q].t
            ops.push({ kind: kinds[q] as 'door' | 'window', u0: u0 + q - 0.5, u1: u0 + r - 0.5, hingeAt: src?.hingeAt, swingTo: src?.swingTo })
          }
          q = r
        }
        pieces.push({ horiz, c, th, u0: u0 + i - 0.5, u1: u0 + j - 0.5, ops, shared: thFixed !== null })
      } else {
        const c = centre(thFixed ?? 0)
        unwalled.push({ a: pt(horiz, c, u0 + i - 0.5), b: pt(horiz, c, u0 + j - 0.5), kind: kinds[i] as Unwalled['kind'], rooms })
      }
      i = j
    }
  }
  const edgeList = fits.flatMap((f, i) => f.edges.map((e) => ({ i, e })))
  for (const { i, e } of edgeList) {
    const horiz = horizSide(e.side)
    // facing partners: the other room's opposite edge, 0 … 0.45 m outward, overlapping along the edge
    const partners = edgeList
      .filter((p) => p.i !== i && horizSide(p.e.side) === horiz && p.e.out === -e.out)
      .map((p) => ({ ...p, gap: (p.e.c - e.c) * e.out, lo: Math.max(e.u0, p.e.u0), hi: Math.min(e.u1, p.e.u1) }))
      .filter((p) => p.gap >= -0.05 * k && p.gap <= 0.45 * k && p.hi - p.lo >= 2)
    // samples along this edge; shared spans are emitted once, from the +1 side
    let u = e.u0
    while (u < e.u1) {
      const p = partners.filter((q) => u >= q.lo && u < q.hi).sort((a, b) => a.gap - b.gap)[0]
      let v = u + 1
      if (p) {
        v = p.hi
        if (e.out === 1) {
          const samples: { s?: Stretch; t?: Stretch }[] = []
          for (let w = u; w < v; w++) samples.push({ s: classAt(e, w), t: classAt(p.e, w) })
          const th = Math.max(0.1 * k, Math.min(0.35 * k, p.gap))
          // wall pixels e.c … p.e.c − 1 → centre (e.c + p.e.c − 1) / 2
          emit(horiz, () => (e.c + p.e.c - 1) / 2, th, u, samples, [i, p.i])
        }
      } else {
        while (v < e.u1 && !partners.some((q) => v >= q.lo && v < q.hi)) v++
        const samples: { s?: Stretch }[] = []
        for (let w = u; w < v; w++) samples.push({ s: classAt(e, w) })
        emit(horiz, (th) => (e.out === 1 ? e.c + (th - 1) / 2 : e.c - (th + 1) / 2), null, u, samples, [i])
      }
      u = v
    }
  }
  // collinear pieces on one line merge (overlapping, or across a gap a perpendicular piece's body fills)
  const perpCovers = (horiz: boolean, c: number, th: number, a: number, b: number) =>
    pieces.some((q) => q.horiz !== horiz && q.c - q.th / 2 <= a + 1 && q.c + q.th / 2 >= b - 1 && q.u0 <= c + th / 2 + 2 && q.u1 >= c - th / 2 - 2)
  for (let merged = true; merged; ) {
    merged = false
    outer: for (let a = 0; a < pieces.length; a++)
      for (let b = a + 1; b < pieces.length; b++) {
        const p = pieces[a], q = pieces[b]
        if (p.horiz !== q.horiz || Math.abs(p.c - q.c) > Math.max(1.5, 0.35 * Math.min(p.th, q.th))) continue
        const lo = p.u1 < q.u0 ? p : q, hi = lo === p ? q : p
        const gap = hi.u0 - lo.u1
        if (gap > 1 && !(gap <= Math.max(p.th, q.th) + 2 && perpCovers(p.horiz, (p.c + q.c) / 2, Math.max(p.th, q.th), lo.u1, hi.u0))) continue
        const lp = p.u1 - p.u0, lq = q.u1 - q.u0
        pieces[a] = { horiz: p.horiz, c: (p.c * lp + q.c * lq) / (lp + lq), th: (p.th * lp + q.th * lq) / (lp + lq), u0: Math.min(p.u0, q.u0), u1: Math.max(p.u1, q.u1), ops: [...p.ops, ...q.ops], shared: p.shared || q.shared }
        pieces.splice(b, 1)
        merged = true
        break outer
      }
  }
  // ends meet perpendicular walls exactly: an end within reach of a perpendicular centre line moves onto it (T and L);
  // at an L both walls end on the crossing
  const tol = Math.max(2, 0.05 * k)
  for (let pass = 0; pass < 2; pass++)
    for (const p of pieces)
      for (const end of ['u0', 'u1'] as const) {
        let best: Piece | null = null, bd = Infinity
        for (const q of pieces) {
          if (q.horiz === p.horiz) continue
          const d = Math.abs(q.c - p[end])
          if (d > q.th / 2 + p.th / 2 + tol || p.c < q.u0 - p.th / 2 - tol || p.c > q.u1 + p.th / 2 + tol) continue
          if (d < bd) (bd = d), (best = q)
        }
        if (!best) continue
        p[end] = best.c
        if (p.c < best.u0) best.u0 = p.c
        if (p.c > best.u1) best.u1 = p.c
      }
  // clean-up: overlapping openings of one kind on a wall are one; slivers go — an opening < 0.25 m, a wall < 0.05 m,
  // a one-sided wall shorter than its own thickness with no opening (a perpendicular wall's end seen from the side)
  for (const p of pieces) {
    const ops: Piece['ops'] = []
    for (const o of [...p.ops].sort((a, b) => a.u0 - b.u0)) {
      const last = ops[ops.length - 1]
      if (last && last.kind === o.kind && o.u0 <= last.u1 + 1) last.u1 = Math.max(last.u1, o.u1)
      else ops.push({ ...o })
    }
    p.ops = ops.filter((o) => o.u1 - o.u0 >= 0.25 * k)
  }
  const kept = pieces.filter((p) => p.u1 - p.u0 >= Math.max(2, 0.05 * k) && (p.shared || p.ops.length > 0 || p.u1 - p.u0 >= p.th))
  const walls: WallSeg[] = kept.map((p) => ({ a: pt(p.horiz, p.c, p.u0), b: pt(p.horiz, p.c, p.u1), thicknessPx: p.th, conf: p.shared ? 0.9 : 0.7 }))
  const openings = kept.flatMap((p, w) =>
    p.ops.map((o) => ({ a: pt(p.horiz, p.c, o.u0), b: pt(p.horiz, p.c, o.u1), kind: o.kind, ...(o.hingeAt ? { hingeAt: o.hingeAt, swingTo: o.swingTo } : {}), conf: 0.8, wall: w })),
  )
  return { walls, openings, unwalled }
}
