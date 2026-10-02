/**
 * LEVER 2 (wave 20) — faces no printed size can seed: AOD shafts, service verandas, planter strips, the open sides of
 * verandas. What bounds them is no thick wall but THIN ink: a 1–3 px pen line (railing, slab edge, glass), a dashed
 * grille, a light-grey band lighter than the wall cut. Pure, sheet pixels (pixel centres at integer coordinates).
 *
 *   draft walls + decided openings (+ every undecided gap: never bridged) cut out → the rest of the ink up to THIN_CUT
 *   grey (plant green never) → axis lines: per row / column runs ≥ 0.4 m (dash gaps ≤ 6 cm bridged), stacked into one
 *   line ≤ 0.35 m thick → each end lands on a wall's centre line (or a wall's end on its own line, or another line) →
 *   lines well inside a fitted room, or across a drawn fixture, are furniture → the faces they close (raster, 1 px graph
 *   lines, 4-connected) are tested: a face split off a region (the region's largest part keeps its old self) must be
 *   0.5–40 m², ≥ 0.35 m wide, hold at most one room label, no fixture unless labelled, split no fitted room, and lean on
 *   real walls for ≥ 40 % of its rim — a part failing it takes its thin lines out again, until nothing fails.
 * Every line kept closes a face: a LOW wall (1.1 m railing / parapet / shaft wall; 0.45 m beside plant green — a planter
 * edge), never a full-height wall, each a review item. Unlabelled faces ≤ 4 m² with no fixture are offered as an AOD
 * (flagged, no door). Axis-aligned lines only (the sheets' thin lines are), like tracks.ts.
 */
import { components } from './hints'
import type { RectPx } from './rooms'
import type { Gray, OpeningGuess, Px, WallSeg } from './types'

export interface FaceOpts {
  /** px per m */
  k: number
  /** the draft's walls so far (graph edges, px) */
  walls: WallSeg[]
  /** decided openings are graph edges too; 'unknown' = an undecided gap (its body is never a thin-line candidate) */
  openings: OpeningGuess[]
  /** printed room labels: name + centre, px */
  labels?: { at: Px; name: string }[]
  /** rooms fitted from their printed sizes (inner rects, px): a line well inside one is furniture */
  fits?: RectPx[]
  /** drawn fixture symbols: centre + keep-out radius, px */
  fixtures?: { at: Px; r: number }[]
  /** plant-green pixels: never line ink; a boundary beside them is a planter edge */
  green?: Uint8Array
}

/** a thin-line candidate: axis line at c from u0 to u1 (px), `th` px thick as drawn */
export interface FaceLine {
  horiz: boolean
  c: number
  u0: number
  u1: number
  th: number
  /** inked share of its length: a solid pen line ≈ 1, a dashed grille ≈ 0.5–0.75 */
  fill: number
}

export interface ThinFaces {
  /** the low walls added (px), one per kept line */
  walls: WallSeg[]
  /** the faces they close: a point inside, area, whether a label names it, plant green over half of it, offered as an AOD, its low walls (indices) */
  faces: { at: Px; areaSqm: number; labelled: boolean; planter: boolean; aod: boolean; walls: number[] }[]
  review: { a: Px; b: Px; message: string }[]
  /** for the eval / debugging: every candidate line (as snapped) and what became of it */
  lines: (FaceLine & { fate: string })[]
}

/** metres unless said otherwise */
export const FACES = {
  /** grey at or below this is thin-line ink (BTI floor tint is 216–235; light-grey shaft walls ~130–200) */
  thinCut: 215,
  minLen: 0.4,
  maxTh: 0.35,
  dashGap: 0.06,
  minArea: 0.5,
  maxArea: 40,
  minWidth: 0.35,
  /** a line inked along at least this share of its length is solid (a dashed grille is less) */
  dashFill: 0.8,
  /** at least this share of a face's rim is real wall */
  wallShare: 0.4,
  aodMax: 4,
  /** a line deeper than this inside a fitted room is furniture */
  fitMargin: 0.15,
  railingM: 1.1,
  planterM: 0.45,
}

type Seg = { a: Px; b: Px; th: number }
type Edge = { horiz: boolean; c: number; u0: number; u1: number; th: number }
const P = (horiz: boolean, c: number, u: number): Px => (horiz ? { x: u, y: c } : { x: c, y: u })

/** every pixel within `r` of segment a–b set to `v` */
function stamp(m: Uint8Array, W: number, H: number, a: Px, b: Px, r: number, v = 1): void {
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + r))
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + r))
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / L2))
      if (Math.hypot(x - a.x - vx * t, y - a.y - vy * t) <= r) m[y * W + x] = v
    }
}

/** a copy of `mask` with `walls` drawn in (≥ 1 px each side of the centre line): the low walls as barriers to a flood */
export function withWalls(mask: Uint8Array, W: number, H: number, walls: WallSeg[]): Uint8Array {
  const m = new Uint8Array(mask)
  for (const w of walls) stamp(m, W, H, w.a, w.b, Math.max(1, w.thicknessPx / 2))
  return m
}

/** a 1 px line a–b, 4-connected (a diagonal step fills its corner), into `m` (value v); returns its pixels */
function draw(m: Uint8Array | Int32Array, W: number, H: number, a: Px, b: Px, v: number): number[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4))
  const out: number[] = []
  let px = Math.round(a.x), py = Math.round(a.y)
  const put = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    m[y * W + x] = v
    out.push(y * W + x)
  }
  put(px, py)
  for (let i = 1; i <= n; i++) {
    const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n)
    if (x === px && y === py) continue
    if (x !== px && y !== py) put(x, py)
    put(x, y)
    ;(px = x), (py = y)
  }
  return out
}

/**
 * Axis lines in a candidate mask: per row (horiz) / column, runs ≥ minLen px with gaps ≤ gap bridged and ≥ half inked;
 * runs on neighbouring rows overlapping ≥ 70 % stack into one line (centre = mean row, ends = median ends) up to maxTh.
 */
export function axisLines(C: Uint8Array, W: number, H: number, horiz: boolean, minLen: number, gap: number, maxTh: number): FaceLine[] {
  const U = horiz ? W : H, V = horiz ? H : W
  type G = { v0: number; v1: number; sv: number; sl: number; si: number; a: number[]; b: number[]; lastU0: number; lastU1: number }
  const out: FaceLine[] = []
  let open: G[] = []
  const close = (g: G) => {
    const th = g.v1 - g.v0 + 1
    if (th > maxTh) return
    const med = (xs: number[]) => xs.slice().sort((p, q) => p - q)[xs.length >> 1]
    out.push({ horiz, c: g.sv / g.sl, u0: med(g.a), u1: med(g.b), th, fill: g.si / g.sl })
  }
  for (let v = 0; v < V; v++) {
    const runs: [number, number, number][] = []
    let s = -1, l = -1, n = 0
    const end = () => {
      if (s >= 0 && l - s + 1 >= minLen && n >= 0.5 * (l - s + 1)) runs.push([s, l, n])
    }
    for (let u = 0; u < U; u++) {
      if (!C[horiz ? v * W + u : u * W + v]) continue
      if (s < 0 || u - l - 1 > gap) end(), (s = u), (n = 0)
      l = u
      n++
    }
    end()
    const next: G[] = []
    const used = new Set<G>()
    for (const [a, b, ni] of runs) {
      let best: G | null = null, bo = 0
      for (const g of open) {
        if (used.has(g)) continue
        const ov = Math.min(b, g.lastU1) - Math.max(a, g.lastU0) + 1
        if (ov >= 0.7 * Math.min(b - a + 1, g.lastU1 - g.lastU0 + 1) && ov > bo) (best = g), (bo = ov)
      }
      const g: G = best ?? { v0: v, v1: v, sv: 0, sl: 0, si: 0, a: [], b: [], lastU0: a, lastU1: b }
      used.add(g)
      ;(g.v1 = v), (g.sv += v * (b - a + 1)), (g.sl += b - a + 1), (g.si += ni), g.a.push(a), g.b.push(b), (g.lastU0 = a), (g.lastU1 = b)
      next.push(g)
    }
    // a group skips at most one row (a double line's paper between its two pens)
    for (const g of open) if (!used.has(g)) (v - g.v1 <= 1 ? next.push(g) : close(g))
    open = next
  }
  for (const g of open) close(g)
  return out
}

export function thinFaces(gray: Gray, o: FaceOpts): ThinFaces {
  const { width: W, height: H } = gray
  const k = o.k
  const empty: ThinFaces = { walls: [], faces: [], review: [], lines: [] }
  if (!(k > 0) || !o.walls.length) return empty
  const halo = Math.max(2, 0.03 * k)
  const tol = Math.max(3, 0.08 * k)
  const decided = o.openings.filter((x) => x.kind !== 'unknown')
  const thOf = (x: WallSeg | OpeningGuess) => ('thicknessPx' in x && x.thicknessPx ? x.thicknessPx : 0.127 * k)

  // ── candidates: thin ink outside every wall / decided opening body, never plant green
  const E = new Uint8Array(W * H)
  for (const s of [...o.walls, ...decided]) stamp(E, W, H, s.a, s.b, thOf(s) / 2 + halo)
  const C = new Uint8Array(W * H)
  for (let i = 0; i < C.length; i++) C[i] = gray.data[i] <= FACES.thinCut && !E[i] && !o.green?.[i] ? 1 : 0
  const gap = Math.max(2, Math.round(FACES.dashGap * k))
  const raw = [true, false].flatMap((h) => axisLines(C, W, H, h, FACES.minLen * k, gap, FACES.maxTh * k))

  // furniture: well inside a fitted room, or across a drawn fixture
  const m = FACES.fitMargin * k
  const inFit = (L: FaceLine) =>
    (o.fits ?? []).some((r) => {
      const [c0, c1, a0, a1] = L.horiz ? [r.y0, r.y1, r.x0, r.x1] : [r.x0, r.x1, r.y0, r.y1]
      return L.c > c0 + m && L.c < c1 - m && Math.min(L.u1, a1) - Math.max(L.u0, a0) > 0.5 * (L.u1 - L.u0)
    })
  const crossesFixture = (L: FaceLine) =>
    (o.fixtures ?? []).some((f) => {
      const fc = L.horiz ? f.at.y : f.at.x, fu = L.horiz ? f.at.x : f.at.y
      return Math.abs(fc - L.c) < f.r && fu > L.u0 - f.r && fu < L.u1 + f.r
    })
  // an undecided gap (founder: never bridged) keeps it open — unless a dashed line (an AOD's grille: positive evidence of
  // what is drawn there, no door or window) runs across it
  const gaps = o.openings
    .filter((x) => x.kind === 'unknown')
    .map((g) => {
      const horiz = Math.abs(g.a.y - g.b.y) < 1e-6, p = horiz ? g.a.x : g.a.y, q = horiz ? g.b.x : g.b.y
      return { horiz, c: horiz ? g.a.y : g.a.x, u0: Math.min(p, q), u1: Math.max(p, q), th: thOf(g) }
    })
  const onGap = (L: FaceLine) => L.fill >= FACES.dashFill && gaps.some((g) => g.horiz === L.horiz && Math.abs(g.c - L.c) <= g.th / 2 + halo && Math.min(g.u1, L.u1) - Math.max(g.u0, L.u0) > Math.min(0.2 * k, 0.5 * (g.u1 - g.u0)))
  const why = (L: FaceLine) => (inFit(L) ? 'inside a fitted room' : crossesFixture(L) ? 'across a fixture' : onGap(L) ? 'solid line on an undecided gap' : '')
  const dropped = raw.flatMap((L) => (why(L) ? [{ ...L, fate: why(L) }] : []))
  const lines = raw.filter((L) => !why(L))

  // ── ends onto the graph: a wall / decided opening across the end (its centre line), or a wall ending on this line
  const edges: Edge[] = []
  for (const s of [...o.walls, ...decided]) {
    const horiz = Math.abs(s.a.y - s.b.y) < 1e-6, vert = Math.abs(s.a.x - s.b.x) < 1e-6
    if (!horiz && !vert) continue
    edges.push({ horiz, c: horiz ? s.a.y : s.a.x, u0: Math.min(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y), u1: Math.max(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y), th: thOf(s) })
  }
  type End = { u: number; lo: number; hi: number; d: number; to: number } // to: −1 an edge, else a candidate index
  const attach = (L: FaceLine, end: 0 | 1, pool: Edge[], to: (i: number) => number): End | null => {
    const e = end ? L.u1 : L.u0, dir = end ? 1 : -1
    let best: End | null = null
    pool.forEach((Q, i) => {
      if (Q.horiz !== L.horiz) {
        const d = dir * (Q.c - e)
        if (d < -(halo + 2) || d > Q.th / 2 + halo + tol) return
        if (L.c < Q.u0 - Q.th / 2 - halo - 1 || L.c > Q.u1 + Q.th / 2 + halo + 1) return
        if (!best || Math.abs(d) < Math.abs(best.d)) best = { u: Q.c, lo: Q.u0, hi: Q.u1, d, to: to(i) }
      } else if (Math.abs(Q.c - L.c) <= Q.th / 2 + halo + 1) {
        const qe = end ? Q.u0 : Q.u1
        const d = dir * (qe - e)
        if (d < -(halo + 2) || d > halo + tol) return
        if (!best || Math.abs(d) < Math.abs(best.d)) best = { u: qe, lo: Q.c, hi: Q.c, d, to: to(i) }
      }
    })
    return best
  }
  type Cand = FaceLine & { e: [End | null, End | null]; c2: number; seg?: Seg }
  const cands: Cand[] = lines.map((L) => ({ ...L, e: [attach(L, 0, edges, () => -1), attach(L, 1, edges, () => -1)], c2: L.c }))
  // the line's own position: inside both wall ends' spans (a slab line at the walls' outer ends moves onto them)
  const slack = (L: Cand) => L.th / 2 + halo + 2
  for (const L of cands) {
    let lo = L.c - slack(L), hi = L.c + slack(L)
    for (const x of L.e) if (x) (lo = Math.max(lo, x.lo)), (hi = Math.min(hi, x.hi))
    L.c2 = lo <= hi ? Math.min(hi, Math.max(lo, L.c)) : NaN
  }
  // free ends onto another line across them (thin-to-thin corners and T's)
  const asEdges: Edge[] = cands.map((L) => ({ horiz: L.horiz, c: L.c2, u0: L.u0, u1: L.u1, th: Math.max(1, L.th) }))
  cands.forEach((L, i) => {
    for (const end of [0, 1] as const)
      if (!L.e[end] && Number.isFinite(L.c2)) {
        const x = attach({ ...L, c: L.c2 }, end, asEdges.map((q, j) => (j === i || !Number.isFinite(q.c) || q.horiz === L.horiz ? { ...q, horiz: L.horiz, c: -1e9 } : q)), (j) => j)
        if (x) L.e[end] = x
      }
  })
  // final segments: an end on a candidate takes that candidate's position; valid = both ends on the graph or on valid lines
  let alive = cands.map((L) => Number.isFinite(L.c2) && !!L.e[0] && !!L.e[1])
  const fate: string[] = cands.map((L) => (!Number.isFinite(L.c2) ? 'ends on walls disagree' : !L.e[0] || !L.e[1] ? 'an end on nothing' : ''))
  const segOf = (L: Cand): Seg => ({ a: P(L.horiz, L.c2, L.e[0]!.u), b: P(L.horiz, L.c2, L.e[1]!.u), th: L.th })
  const onSeg = (L: Cand, end: 0 | 1, live: boolean[]) => {
    const x = L.e[end]!
    if (x.to < 0) return true
    const M = cands[x.to]
    if (!live[x.to]) return false
    const lo = Math.min(M.e[0]!.u, M.e[1]!.u), hi = Math.max(M.e[0]!.u, M.e[1]!.u)
    return L.c2 >= lo - 1e-6 && L.c2 <= hi + 1e-6
  }
  const prune = () => {
    for (let ch = true; ch; ) {
      ch = false
      cands.forEach((L, i) => {
        if (!alive[i]) return
        const len = Math.abs(L.e[1]!.u - L.e[0]!.u)
        if (len < 0.3 * k || L.e[1]!.u <= L.e[0]!.u || !onSeg(L, 0, alive) || !onSeg(L, 1, alive)) (alive[i] = false), (ch = true), (fate[i] ||= 'end off its line / too short')
      })
    }
  }
  prune()

  // ── faces: the graph as 1 px lines; components before (B0) and with the live lines (B1)
  const B0 = new Uint8Array(W * H)
  for (const s of [...o.walls, ...decided]) draw(B0, W, H, s.a, s.b, 1)
  const free0 = new Uint8Array(W * H)
  for (let i = 0; i < free0.length; i++) free0[i] = B0[i] ? 0 : 1
  const lab0 = components(free0, W, H).lab
  const b0px: number[] = []
  for (let i = 0; i < B0.length; i++) if (B0[i]) b0px.push(i)
  const labelPx = (o.labels ?? []).map((l) => ({ i: Math.round(l.at.y) * W + Math.round(l.at.x), name: l.name })).filter((l) => l.i >= 0 && l.i < W * H)
  const fixPx = (o.fixtures ?? []).map((f) => Math.round(f.at.y) * W + Math.round(f.at.x)).filter((i) => i >= 0 && i < W * H)
  const k2 = k * k
  type Part = { id: number; n: number; G: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; edge: boolean; walls: number; thin: number; green: number; lines: Set<number>; ok?: boolean; why?: string }
  const greenPx: number[] = []
  if (o.green) for (let i = 0; i < o.green.length; i++) if (o.green[i]) greenPx.push(i)
  let parts: Part[] = []
  let lab1: Int32Array = new Int32Array(0)
  const nb = (i: number) => [i - 1, i + 1, i - W, i + W]
  for (let iter = 0; iter < 40; iter++) {
    const B1 = new Uint8Array(B0)
    // (a line's own pixels, not those on the wall / line it ends on: those touch the faces beyond that too)
    const drawn: number[][] = cands.map((L, i) => (alive[i] ? draw(B1, W, H, segOf(L).a, segOf(L).b, 2) : []))
    const occ = new Map<number, number>()
    for (const px of drawn) for (const p of new Set(px)) occ.set(p, (occ.get(p) ?? 0) + 1)
    const linePx = drawn.map((px) => px.filter((p) => !B0[p] && occ.get(p) === 1))
    const free1 = new Uint8Array(W * H)
    for (let i = 0; i < free1.length; i++) free1[i] = B1[i] ? 0 : 1
    const cc = components(free1, W, H)
    lab1 = cc.lab
    parts = cc.comps.map((c, j) => ({ id: j + 1, n: c.n, G: 0, x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, cx: c.sx / c.n, cy: c.sy / c.n, edge: c.edge, walls: 0, thin: 0, green: 0, lines: new Set<number>() }))
    for (let i = 0; i < lab1.length; i++) if (lab1[i] && !parts[lab1[i] - 1].G) parts[lab1[i] - 1].G = lab0[i]
    for (const i of b0px) for (const q of nb(i)) if (q >= 0 && q < W * H && lab1[q]) parts[lab1[q] - 1].walls++
    for (const i of greenPx) if (lab1[i]) parts[lab1[i] - 1].green++
    linePx.forEach((px, li) => {
      for (const i of px) for (const q of nb(i)) if (q >= 0 && q < W * H && lab1[q]) parts[lab1[q] - 1].thin++, parts[lab1[q] - 1].lines.add(li)
    })
    // each fitted room's pixels by part (a part covering a fit's share without being it splits it)
    const fitHist = (o.fits ?? []).map((r) => {
      const h = new Map<number, number>()
      for (let y = Math.max(0, r.y0); y < Math.min(H, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) if (lab1[y * W + x]) h.set(lab1[y * W + x], (h.get(lab1[y * W + x]) ?? 0) + 1)
      return { ra: (r.x1 - r.x0) * (r.y1 - r.y0), h }
    })
    // per region: its parts; the largest keeps its old self, every other part must be a face
    const byG = new Map<number, Part[]>()
    for (const p of parts) byG.set(p.G, [...(byG.get(p.G) ?? []), p])
    const test = (p: Part): string | null => {
      const a = p.n / k2
      if (p.edge) return 'sheet edge'
      if (a < FACES.minArea) return 'sliver'
      if (p.n / Math.max(p.x1 - p.x0 + 1, p.y1 - p.y0 + 1) < FACES.minWidth * k) return 'sliver'
      if (a > FACES.maxArea) return 'too big'
      if (p.walls < FACES.wallShare * (p.walls + p.thin)) return 'thin rim'
      const names = new Set(labelPx.filter((l) => lab1[l.i] === p.id).map((l) => l.name))
      if (names.size > 1) return 'two labels'
      if (!names.size && fixPx.some((i) => lab1[i] === p.id)) return 'fixture'
      // no label: an AOD-sized space, or a planter (plant green over half of it); anything bigger is no evidence of a room
      if (!names.size && a > FACES.aodMax && p.green < 0.5 * p.n) return 'unlabelled, too big for an AOD'
      for (const { ra, h } of fitHist) {
        const ov = h.get(p.id) ?? 0
        if (ov >= 0.15 * ra && ov / (p.n + ra - ov) < 0.5) return 'splits a fitted room'
      }
      return null
    }
    const failing: Part[] = []
    for (const ps of byG.values()) {
      if (ps.length < 2) continue
      ps.sort((p, q) => q.n - p.n)
      for (const p of ps.slice(1)) {
        p.why = test(p) ?? undefined
        p.ok = !p.why
        if (!p.ok && p.lines.size) failing.push(p)
      }
    }
    if (!failing.length) break
    // slivers first (a double pen line, a frame line beside a wall): the longest of a sliver's lines stays; the faces they
    // cut are judged again without them
    const slivers = failing.filter((p) => p.why === 'sliver')
    for (const p of slivers.length ? slivers : failing) {
      const ls = [...p.lines].sort((x, y) => Math.abs(cands[y].e[1]!.u - cands[y].e[0]!.u) - Math.abs(cands[x].e[1]!.u - cands[x].e[0]!.u))
      for (const li of p.why === 'sliver' && ls.length > 1 ? ls.slice(1) : ls) (alive[li] = false), (fate[li] ||= `face: ${p.why} (${(p.n / k2).toFixed(1)} m², ${p.x0},${p.y0}–${p.x1},${p.y1}, ${p.lines.size} lines, iter ${iter})`)
    }
    prune()
  }

  // ── out: the lines that close a face (and border no failing part), as low walls; the faces
  const keep = new Set<number>()
  for (const p of parts) if (p.ok) p.lines.forEach((li) => alive[li] && keep.add(li))
  for (const p of parts) if (p.ok === false) p.lines.forEach((li) => keep.delete(li))
  // (an end on a line that closes nothing would dangle: both go)
  alive = alive.map((_, i) => keep.has(i))
  prune()
  for (const li of [...keep]) if (!alive[li]) keep.delete(li)
  const walls: WallSeg[] = []
  const wallOf = new Map<number, number>()
  const review: ThinFaces['review'] = []
  const isGreen = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !!o.green?.[Math.round(y) * W + Math.round(x)]
  for (const li of keep) {
    wallOf.set(li, walls.length)
    const L = cands[li], s = segOf(L)
    // plant green along ≥ 40 % of it within 0.3 m on one side: the planter's edge
    let g = 0, n = 0
    for (let u = Math.min(L.e[0]!.u, L.e[1]!.u); u <= Math.max(L.e[0]!.u, L.e[1]!.u); u += 2, n++)
      for (const side of [-1, 1]) {
        let hit = 0
        for (let d = 2; d <= 0.3 * k; d += 2) if ((L.horiz ? isGreen(u, L.c2 + side * d) : isGreen(L.c2 + side * d, u))) hit++
        if (hit >= 0.3 * (0.3 * k / 2)) {
          g++
          break
        }
      }
    const planter = n > 0 && g >= 0.4 * n
    const heightM = planter ? FACES.planterM : FACES.railingM
    walls.push({ a: s.a, b: s.b, thicknessPx: Math.max(0.0635 * k, Math.min(L.th, 0.254 * k)), conf: 0.4, heightM })
    const len = `${(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / k).toFixed(1)} m`
    review.push({ a: s.a, b: s.b, message: planter ? `Planter edge traced as a ${heightM} m low wall along a thin line beside the green, ${len} — check` : `Thin-line boundary traced as a ${heightM} m low wall, ${len} — a railing / parapet / shaft wall, or a full-height partition? Check` })
  }
  const faces: ThinFaces['faces'] = []
  for (const p of parts) {
    const own = [...p.lines].filter((li) => keep.has(li))
    if (!p.ok || !own.length) continue
    // a point inside: the part's pixel nearest its centroid
    let at: Px = { x: Math.round(p.cx), y: Math.round(p.cy) }
    if (lab1[at.y * W + at.x] !== p.id) {
      let bd = Infinity
      for (let y = p.y0; y <= p.y1; y++) for (let x = p.x0; x <= p.x1; x++) if (lab1[y * W + x] === p.id && Math.hypot(x - p.cx, y - p.cy) < bd) (bd = Math.hypot(x - p.cx, y - p.cy)), (at = { x, y })
    }
    const labelled = labelPx.some((l) => lab1[l.i] === p.id)
    const areaSqm = p.n / k2, planter = p.green >= 0.5 * p.n
    faces.push({ at, areaSqm, labelled, planter, aod: !labelled && !planter && areaSqm <= FACES.aodMax, walls: own.map((li) => wallOf.get(li)!) })
  }
  for (const f of faces)
    if (f.aod) review.push({ a: f.at, b: f.at, message: `A small space (${f.areaSqm.toFixed(1)} m²) closed by thin lines, no label — offered as an AOD / shaft with no door; check` })
  const all = [...dropped, ...cands.map((L, i) => ({ horiz: L.horiz, c: Number.isFinite(L.c2) ? L.c2 : L.c, u0: L.e[0]?.u ?? L.u0, u1: L.e[1]?.u ?? L.u1, th: L.th, fill: L.fill, fate: keep.has(i) ? 'kept' : fate[i] || 'closes no face' }))]
  return { walls, faces, review, lines: all }
}
