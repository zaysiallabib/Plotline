/**
 * Stage 1 of auto-trace: plan raster → WallTrace (wall centre lines + thickness, straight or arc, plus gap guesses).
 * Deterministic image analysis, no AI, no network. Pixel space throughout (x → right, y → down).
 *
 * Pipeline (each step a small pure function):
 *   ink mask (Otsu) → distance transform → wall scale from the ridge histogram (walls = the commonest thick stroke)
 *   → core = ink at least `minHalf` from paper (text, furniture, dimension lines vanish) minus filled blobs (lawns, fills)
 *   → Zhang–Suen skeleton → pixel graph (junctions, ends, chains) → spur pruning → line / arc fitting
 *   → junction snapping + free-end extension → gaps between facing free ends = OpeningGuess (door arc / window lines test).
 */
import { bandWalls, coveredByBands } from './bands'
import { edt, otsu, thin, threshold } from './raster'
import { scaleTracks, traceTracks, trackWalls } from './tracks'
import type { Gray, OpeningGuess, Px, WallSeg, WallTrace } from './types'

export interface WallOpts {
  /** grey ≤ this is ink. Default: Otsu's threshold of the image, capped at `inkCap`. */
  darkMax?: number
  /** walls are dark: never count greys lighter than this as ink (light tile grids, fills, grey hatching). */
  inkCap?: number
  /** the commonest wall half-width in px (the partition wall). Default: the ridge-histogram peak. */
  halfPx?: number
  /** keep ink at least this far from paper (× halfPx); thinner strokes (text, furniture) vanish. */
  coreFrac?: number
  /** ink deeper than this (× halfPx) is a filled blob (lawn, hatch fill, a black block), not a wall. */
  blobFrac?: number
  /** drop isolated wall pieces shorter than this (× halfPx). */
  minCompFrac?: number
  /** assumed partition wall thickness (m) — only used to size door/window gaps before the solver knows the scale. */
  partitionM?: number
  /** enlarge the raster first (1 = never). Default: 2 when walls are under ~6 px thick (low-res sheets), else 1. */
  upscale?: number
  /** drop walls whose lighter side is less than this many grey levels above their centre (foliage, textures). */
  minContrast?: number
  /**
   * 'bands' (founder, wave 18): axis-aligned walls as straight bands of exactly their drawn thickness (bands.ts); the
   * skeleton only adds what no band covers (angled walls, arcs). 'skeleton' (default here — the solver passes
   * 'bands'): the skeleton for everything. 'tracks' (wave 19, tracks.ts): one wall per occupied stretch of a track,
   * openings as children of the wall they are cut in, only where a door arc or glazing is drawn.
   */
  tracker?: 'skeleton' | 'bands' | 'tracks'
  /** 'tracks': plant pixels (the colour image's green) whitened before tracing; glass pixels = window evidence */
  plant?: Uint8Array
  glass?: Uint8Array
}

const DEF = { coreFrac: 0.7, blobFrac: 4, minCompFrac: 6, partitionM: 0.127, inkCap: 160, minContrast: 60 }

export const inkThreshold = (g: Gray, o: WallOpts) => o.darkMax ?? Math.min(otsu(g), o.inkCap ?? DEF.inkCap)

/** Wall half-width (px) = the most common distance-transform ridge value among strokes thicker than text (DT ≥ 1.9). */
export function wallHalfWidth(dt: Float32Array, w: number, h: number): number {
  const bins = new Float64Array(200)
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, d = dt[i]
      if (d < 1.9 || d > 99) continue
      if (d >= dt[i - 1] && d >= dt[i + 1] && d >= dt[i - w] && d >= dt[i + w]) bins[Math.round(d * 2)]++
    }
  // smooth over ±0.5 px: an even-width wall's ridge splits across two bins
  const sm = (b: number) => bins[b - 1] * 0.5 + bins[b] + bins[b + 1] * 0.5
  let best = 4, bestC = -1
  for (let b = 4; b < 199; b++) {
    const c = sm(b)
    if (c > bestC) (bestC = c), (best = b)
  }
  // the commonest stroke can be the 10" wall (a flat with long outer walls): a strong peak at half its width is the
  // partition, and eroding by the 10" width would wipe the partitions out (solver, wave 16)
  if (best >= 8)
    for (let b = Math.max(5, Math.floor(best * 0.4)); b <= Math.ceil(best * 0.62); b++)
      if (sm(b) >= 0.3 * bestC && sm(b) >= sm(b - 1) && sm(b) >= sm(b + 1)) return b / 2
  return best / 2
}

interface Node {
  x: number
  y: number
  edges: number[]
}
interface Edge {
  a: number
  b: number
  pts: number[] // pixel indices, a → b
  dead?: boolean
}

const N8 = (w: number) => [-w - 1, -w, -w + 1, 1, w + 1, w, w - 1, -1] // clockwise from NW
const IS4 = [false, true, false, true, false, true, false, true]

/** Skeleton → graph of junction/end nodes and pixel chains. */
export function skeletonGraph(sk: Uint8Array, w: number, h: number): { nodes: Node[]; edges: Edge[] } {
  const nb = N8(w)
  const cls = new Uint8Array(sk.length) // 0 none, 2 path, 1/3 node (end / junction)
  const pix: number[] = []
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (!sk[i]) continue
      let n = 0, cn = 0
      for (let k = 0; k < 8; k++) {
        const v = sk[i + nb[k]], u = sk[i + nb[(k + 1) & 7]]
        n += v
        if (!v && u) cn++
      }
      cls[i] = n <= 1 ? 1 : cn >= 3 ? 3 : 2
      pix.push(i)
    }
  // node clusters: 8-connected runs of junction pixels; ends are single pixels
  const nodeOf = new Int32Array(sk.length).fill(-1)
  const nodes: Node[] = []
  for (const i of pix) {
    if (cls[i] === 2 || nodeOf[i] >= 0) continue
    const id = nodes.length
    const stack = [i]
    nodeOf[i] = id
    let sx = 0, sy = 0, c = 0
    while (stack.length) {
      const p = stack.pop()!
      sx += p % w
      sy += (p / w) | 0
      c++
      if (cls[p] === 1) continue
      for (const o of nb) {
        const q = p + o
        if (cls[q] === 3 && nodeOf[q] < 0) (nodeOf[q] = id), stack.push(q)
      }
    }
    nodes.push({ x: sx / c, y: sy / c, edges: [] })
  }
  const visited = new Uint8Array(sk.length)
  const edges: Edge[] = []
  const walk = (start: number, first: number) => {
    const a = nodeOf[start]
    const pts = [start, first]
    let prev = start, cur = first
    while (nodeOf[cur] < 0) {
      visited[cur] = 1
      let next = -1
      for (let k = 0; k < 8 && next < 0; k++) {
        const q = cur + nb[k]
        if (q !== prev && nodeOf[q] >= 0 && (nodeOf[q] !== a || pts.length > 3)) next = q
      }
      for (let pass = 0; pass < 2 && next < 0; pass++)
        for (let k = 0; k < 8; k++) {
          const q = cur + nb[k]
          if (IS4[k] === (pass === 0) && cls[q] === 2 && !visited[q] && q !== prev) {
            next = q
            break
          }
        }
      if (next < 0) {
        // dead end inside a chain (thinning artefact): make it an end node
        nodeOf[cur] = nodes.length
        nodes.push({ x: cur % w, y: (cur / w) | 0, edges: [] })
        break
      }
      prev = cur
      cur = next
      pts.push(cur)
    }
    const e = edges.length
    edges.push({ a, b: nodeOf[cur], pts })
    nodes[a].edges.push(e)
    nodes[nodeOf[cur]].edges.push(e)
  }
  for (const i of pix) {
    if (nodeOf[i] < 0) continue
    for (const o of nb) {
      const q = i + o
      if (cls[q] === 2 && !visited[q]) walk(i, q)
      else if (nodeOf[q] >= 0 && nodeOf[q] !== nodeOf[i] && q > i) {
        // two nodes touching directly: a zero-length chain between them
        const e = edges.length
        edges.push({ a: nodeOf[i], b: nodeOf[q], pts: [i, q] })
        nodes[nodeOf[i]].edges.push(e)
        nodes[nodeOf[q]].edges.push(e)
      }
    }
  }
  // closed loops with no node at all
  for (const i of pix) {
    if (cls[i] !== 2 || visited[i]) continue
    nodeOf[i] = nodes.length
    nodes.push({ x: i % w, y: (i / w) | 0, edges: [] })
    visited[i] = 1
    for (const o of nb) if (cls[i + o] === 2 && !visited[i + o]) {
      walk(i, i + o)
      break
    }
  }
  return { nodes, edges }
}

/**
 * Remove short end-spurs (thinning hairs at wall corners, the two-pronged fork at a thick wall's free end). Each round
 * judges every spur on the degrees before the round, so both prongs of a fork go together.
 */
function pruneSpurs(nodes: Node[], edges: Edge[], maxLen: (junction: number) => number): void {
  for (let round = 0; round < 3; round++) {
    const kill: number[] = []
    for (let e = 0; e < edges.length; e++) {
      const E = edges[e]
      if (E.dead || E.a === E.b) continue
      const da = nodes[E.a].edges.length, db = nodes[E.b].edges.length
      const at = da === 1 && db >= 3 ? E.b : db === 1 && da >= 3 ? E.a : -1
      if (at >= 0 && E.pts.length <= maxLen(at)) kill.push(e)
    }
    if (!kill.length) return
    for (const e of kill) {
      edges[e].dead = true
      for (const n of [edges[e].a, edges[e].b]) nodes[n].edges = nodes[n].edges.filter((x) => x !== e)
    }
  }
}

interface Seg {
  a: Px
  b: Px
  mid?: Px
  half: number // px
  na: number // node ids (−1 = interior split point)
  nb: number
  pts: Px[]
}

const dist = (p: Px, q: Px) => Math.hypot(p.x - q.x, p.y - q.y)

function lineDev(P: Px[], i0: number, i1: number): { d: number; at: number } {
  const a = P[i0], b = P[i1]
  const L = dist(a, b) || 1
  let d = 0, at = (i0 + i1) >> 1
  for (let i = i0 + 1; i < i1; i++) {
    const v = Math.abs((b.x - a.x) * (a.y - P[i].y) - (a.x - P[i].x) * (b.y - a.y)) / L
    if (v > d) (d = v), (at = i)
  }
  return { d, at }
}

/** Algebraic (Kåsa) circle fit. */
export function fitCircle(P: Px[]): { cx: number; cy: number; r: number; rms: number } | null {
  const n = P.length
  let mx = 0, my = 0
  for (const p of P) (mx += p.x), (my += p.y)
  mx /= n
  my /= n
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0
  for (const p of P) {
    const u = p.x - mx, v = p.y - my
    suu += u * u
    svv += v * v
    suv += u * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-9) return null
  const r1 = 0.5 * (suuu + suvv), r2 = 0.5 * (svvv + svuu)
  const uc = (r1 * svv - r2 * suv) / det, vc = (r2 * suu - r1 * suv) / det
  const cx = uc + mx, cy = vc + my
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n)
  let e = 0
  for (const p of P) e += (Math.hypot(p.x - cx, p.y - cy) - r) ** 2
  return { cx, cy, r, rms: Math.sqrt(e / n) }
}

/** Split a chain into straight pieces and arcs (recursive: line if flat, arc if it is a clean circle, else split). */
function fitChain(P: Px[], i0: number, i1: number, eps: number, half: number, out: { i0: number; i1: number; arc?: Px }[]): void {
  if (i1 - i0 > 3 && dist(P[i0], P[i1]) < 1) {
    // a closed loop (a shaft or room outline with no junction): split at the point farthest from its start
    let far = i0 + 1
    for (let i = i0 + 1; i < i1; i++) if (dist(P[i], P[i0]) > dist(P[far], P[i0])) far = i
    fitChain(P, i0, far, eps, half, out)
    fitChain(P, far, i1, eps, half, out)
    return
  }
  const { d, at } = lineDev(P, i0, i1)
  if (d <= eps || i1 - i0 < 3) {
    out.push({ i0, i1 })
    return
  }
  if (i1 - i0 >= Math.max(12, 8 * half) && d >= 2 * eps) {
    // a real bow (sagitta ≥ 2 eps over ≥ 4 wall thicknesses), not a wobbly skeleton on a column or a thickness step
    const c = fitCircle(P.slice(i0, i1 + 1))
    if (c && c.rms <= eps * 0.5 && c.r >= 4 * half) {
      // sweep must be one-directional and between ~20° and 300°
      const ang = (p: Px) => Math.atan2(p.y - c.cy, p.x - c.cx)
      let sweep = 0, sgn = 0, ok = true
      for (let i = i0 + 1; i <= i1; i++) {
        let da = ang(P[i]) - ang(P[i - 1])
        if (da > Math.PI) da -= 2 * Math.PI
        if (da < -Math.PI) da += 2 * Math.PI
        sweep += da
      }
      sgn = Math.sign(sweep)
      const mid = P[(i0 + i1) >> 1]
      const sw = Math.abs(sweep)
      if (sw < 0.35 || sw > 5.3) ok = false
      if (ok && sgn) {
        const k = c.r / (Math.hypot(mid.x - c.cx, mid.y - c.cy) || 1)
        out.push({ i0, i1, arc: { x: c.cx + (mid.x - c.cx) * k, y: c.cy + (mid.y - c.cy) * k } })
        return
      }
    }
  }
  fitChain(P, i0, at, eps, half, out)
  fitChain(P, at, i1, eps, half, out)
}

/** Least-squares line through points: centroid + unit direction. */
function lsq(P: Px[]): { cx: number; cy: number; dx: number; dy: number } {
  let cx = 0, cy = 0
  for (const p of P) (cx += p.x), (cy += p.y)
  cx /= P.length
  cy /= P.length
  let sxx = 0, syy = 0, sxy = 0
  for (const p of P) {
    const u = p.x - cx, v = p.y - cy
    sxx += u * u
    syy += v * v
    sxy += u * v
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { cx, cy, dx: Math.cos(th), dy: Math.sin(th) }
}

/** Point minimising squared distance to several lines (their normals), or null when they are near-parallel. */
function meetPoint(lines: { cx: number; cy: number; dx: number; dy: number }[]): Px | null {
  let a = 0, b = 0, c = 0, r1 = 0, r2 = 0
  for (const l of lines) {
    const nx = -l.dy, ny = l.dx, k = nx * l.cx + ny * l.cy
    a += nx * nx
    b += nx * ny
    c += ny * ny
    r1 += nx * k
    r2 += ny * k
  }
  const det = a * c - b * b
  if (det < 0.05 * lines.length * lines.length * 0.25) return null // all within ~13° of each other
  return { x: (r1 * c - r2 * b) / det, y: (a * r2 - b * r1) / det }
}

/** Stages 1–4: ink, distance transform, wall scale, wall core (thin strokes and filled blobs removed), its skeleton. */
export function wallSkeleton(gray: Gray, opts: WallOpts = {}) {
  const o = { ...DEF, ...opts }
  const { width: w, height: h } = gray
  const t = inkThreshold(gray, o)
  const ink = threshold(gray, t)
  const dt = edt(ink, w, h)
  const half = o.halfPx ?? wallHalfWidth(dt, w, h)
  const rCore = Math.max(1.9, half * o.coreFrac)
  const rBlob = half * o.blobFrac
  // filled blobs: every pixel within rBlob of a pixel deeper than rBlob (the blob and the band around its edge)
  const core = new Uint8Array(w * h)
  const notBlob = new Uint8Array(w * h)
  let anyBlob = false
  for (let i = 0; i < core.length; i++) {
    core[i] = dt[i] >= rCore ? 1 : 0
    if (dt[i] > rBlob) anyBlob = true
    else notBlob[i] = 1
  }
  const blob = new Uint8Array(w * h)
  if (anyBlob) {
    const toBlob = edt(notBlob, w, h)
    for (let i = 0; i < core.length; i++) if (!notBlob[i] || (toBlob[i] <= rBlob + 1 && ink[i])) (blob[i] = 1), (core[i] = 0)
  }
  const sk = core.slice()
  thin(sk, w, h)
  return { o, w, h, t, ink, dt, half, rCore, core, blob, sk }
}

/** Bilinear ×f enlargement: low-res plans (walls ≤ ~5 px) get sub-pixel stroke widths back from the anti-aliasing. */
export function upsample(g: Gray, f: number): Gray {
  const W = Math.round(g.width * f), H = Math.round(g.height * f)
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const sy = Math.min(g.height - 1, Math.max(0, (y + 0.5) / f - 0.5))
    const y0 = Math.floor(sy), y1 = Math.min(g.height - 1, y0 + 1), fy = sy - y0
    for (let x = 0; x < W; x++) {
      const sx = Math.min(g.width - 1, Math.max(0, (x + 0.5) / f - 0.5))
      const x0 = Math.floor(sx), x1 = Math.min(g.width - 1, x0 + 1), fx = sx - x0
      const d = g.data, r0 = y0 * g.width, r1 = y1 * g.width
      out[y * W + x] = (d[r0 + x0] * (1 - fx) + d[r0 + x1] * fx) * (1 - fy) + (d[r1 + x0] * (1 - fx) + d[r1 + x1] * fx) * fy + 0.5
    }
  }
  return { width: W, height: H, data: out }
}

const scalePx = (p: Px, k: number): Px => ({ x: p.x * k, y: p.y * k })

/** Nearest-neighbour enlargement of a mask to the upsampled raster's size. */
export function upMask(m: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / H))
    for (let x = 0; x < W; x++) out[y * W + x] = m[sy * w + Math.min(w - 1, Math.floor((x * w) / W))]
  }
  return out
}

export function traceWalls(gray: Gray, opts: WallOpts = {}): WallTrace {
  let f = opts.upscale
  let half0 = opts.halfPx
  if (f === undefined) {
    half0 ??= wallHalfWidth(edt(threshold(gray, inkThreshold(gray, opts)), gray.width, gray.height), gray.width, gray.height)
    f = half0 < 3 ? 2 : 1
  }
  if (f !== 1) {
    const big = upsample(gray, f)
    // re-estimate on the enlarged raster (finer), but never above the native estimate: on a sheet with few walls the
    // enlarged histogram can lock onto the columns
    const halfBig = opts.halfPx ? opts.halfPx * f : Math.min(half0! * f, wallHalfWidth(edt(threshold(big, inkThreshold(big, opts)), big.width, big.height), big.width, big.height))
    const up = (m?: Uint8Array) => m && upMask(m, gray.width, gray.height, big.width, big.height)
    const t = traceWalls(big, { ...opts, upscale: 1, halfPx: halfBig, plant: up(opts.plant), glass: up(opts.glass) })
    const k = 1 / f
    const sc = (s: WallSeg): WallSeg => ({ ...s, a: scalePx(s.a, k), b: scalePx(s.b, k), ...(s.mid ? { mid: scalePx(s.mid, k) } : {}), thicknessPx: s.thicknessPx * k })
    return {
      ...(t.tracks ? { tracks: { lines: scaleTracks(t.tracks.lines, k), angled: t.tracks.angled.map(sc) } } : {}),
      walls: t.walls.map(sc),
      openings: t.openings.map((op) => ({
        ...op,
        a: scalePx(op.a, k),
        b: scalePx(op.b, k),
        ...(op.hingeAt ? { hingeAt: scalePx(op.hingeAt, k) } : {}),
        ...(op.swingTo ? { swingTo: scalePx(op.swingTo, k) } : {}),
        ...(op.thicknessPx ? { thicknessPx: op.thicknessPx * k } : {}),
      })),
    }
  }
  if (opts.tracker === 'tracks') {
    const tt = traceTracks(gray, { halfPx: opts.halfPx, plant: opts.plant, glass: opts.glass, darkMax: opts.darkMax, minContrast: opts.minContrast })
    const t = trackWalls(tt)
    const angled = angledWalls(gray, t.walls, opts)
    return { walls: [...t.walls, ...angled], openings: t.openings, tracks: { lines: { tracks: tt.tracks, joins: tt.joins, gaps: tt.gaps, blocks: tt.blocks, classes: tt.classes, pxPerM: tt.pxPerM }, angled } }
  }
  const { o, w, h, ink, dt, half, rCore, core, sk } = wallSkeleton(gray, opts)
  // the founder's tracker: straight bands of exactly the drawn thickness, where the sheet is on its axes
  const bands =
    o.tracker === 'bands'
      ? bandWalls(gray, ink, { minThPx: 2 * rCore, maxThPx: 2 * half * o.blobFrac, minLenPx: 3 * half }).filter((b) => sideContrast(gray, b, b.thicknessPx) >= o.minContrast)
      : []
  const walls = tidy(
    [
      ...bands,
      ...segsOf(sk, dt, w, h, o.minCompFrac * half).flatMap((s): WallSeg[] => {
        const len = dist(s.a, s.b)
        const thicknessPx = thicknessOf(s.half)
        // a wall is a dark band with clean paper / floor beside it on at least one side; foliage and textures are not
        const c = sideContrast(gray, s, thicknessPx)
        if (len < 1 || c < o.minContrast) return []
        if (bands.length && coveredByBands(s, bands)) return []
        return [{ a: s.a, b: s.b, ...(s.mid ? { mid: s.mid } : {}), thicknessPx, conf: Math.min(1, len / (4 * thicknessPx), c / 120) }]
      }),
    ],
    2.5 * thicknessOf(half),
  )
  // door arcs: ink darker than the local median (arcInk); windows: the grey profile across the gap (glazing)
  const openings = findOpenings(walls, core, rCore, w, h, half, o.partitionM, arcInk(gray), (x, y) => gray.data[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))])
  return { walls, openings }
}

/**
 * Tracks (wave 19): the walls off the sheet's axes — skeleton pieces more than 5° from both axes, and arcs — on ink no
 * track wall owns. An end that stops at a track wall is put on that wall's centre line (where the angled wall's line
 * crosses it, or the track wall's end beside it): the track wall is only noded there, never moved or tilted.
 */
function angledWalls(gray0: Gray, axis: WallSeg[], opts: WallOpts): WallSeg[] {
  let gray = gray0
  if (opts.plant) {
    const d = new Uint8Array(gray0.data)
    for (let i = 0; i < d.length; i++) if (opts.plant[i]) d[i] = 255
    gray = { width: gray0.width, height: gray0.height, data: d }
  }
  const { o, w, h, dt, half, sk } = wallSkeleton(gray, opts)
  const offAxis = (p: Px, q: Px) => {
    const g = (((Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI) % 90 + 90) % 90
    return Math.min(g, 90 - g)
  }
  const out: WallSeg[] = []
  for (const s of segsOf(sk, dt, w, h, o.minCompFrac * half)) {
    const len = dist(s.a, s.b), th = thicknessOf(s.half)
    // on (or near) the axes it is the tracks' ink — a corner scrap of the skeleton, never a wall of its own
    if (!s.mid && offAxis(s.a, s.b) <= 10) continue
    if (len < Math.max(6 * half, 1.5 * th) || sideContrast(gray, s, th) < o.minContrast) continue
    if (s.mid) {
      // an arc: a real bow (sagitta ≥ half a wall), and not lying along a track wall's body
      const sag = Math.abs((s.b.x - s.a.x) * (s.a.y - s.mid.y) - (s.a.x - s.mid.x) * (s.b.y - s.a.y)) / (len || 1)
      const pcs = segPieces({ a: s.a, b: s.b, mid: s.mid, thicknessPx: th, conf: 1 })
      if (sag < Math.max(2, 0.5 * th) || pcs.filter((p) => coveredByBands(p, axis, 0.5)).length >= 0.5 * pcs.length) continue
    } else if (coveredByBands(s, axis, 0.5)) continue
    const seg: WallSeg = { a: s.a, b: s.b, ...(s.mid ? { mid: s.mid } : {}), thicknessPx: th, conf: Math.min(1, len / (4 * th)) }
    for (const end of ['a', 'b'] as const) {
      const p = seg[end], q = end === 'a' ? seg.b : seg.a
      const L = dist(p, q) || 1, dx = (p.x - q.x) / L, dy = (p.y - q.y) / L
      let best: Px | null = null, bd = Infinity
      for (const t of axis) {
        const horiz = t.a.y === t.b.y
        const c = horiz ? t.a.y : t.a.x, u0 = Math.min(horiz ? t.a.x : t.a.y, horiz ? t.b.x : t.b.y), u1 = Math.max(horiz ? t.a.x : t.a.y, horiz ? t.b.x : t.b.y)
        const reach = t.thicknessPx / 2 + th + 2
        // where the angled wall's line crosses the track wall's centre line, if that is on the wall and near our end
        const dc = horiz ? dy : dx
        if (!seg.mid && Math.abs(dc) > 0.05) {
          const k = (c - (horiz ? p.y : p.x)) / dc
          const X = { x: p.x + dx * k, y: p.y + dy * k }
          const u = horiz ? X.x : X.y
          if (k > -reach && k < reach && u >= u0 - t.thicknessPx / 2 && u <= u1 + t.thicknessPx / 2 && Math.abs(k) < bd) {
            ;(bd = Math.abs(k)), (best = { x: horiz ? Math.min(u1, Math.max(u0, u)) : c, y: horiz ? c : Math.min(u1, Math.max(u0, u)) })
            continue
          }
        }
        // else the track wall's end beside ours
        for (const e of [t.a, t.b]) if (dist(e, p) < 1.5 * th && dist(e, p) < bd) (bd = dist(e, p)), (best = e)
      }
      if (best) seg[end] = { ...best }
    }
    if (!seg.mid && offAxis(seg.a, seg.b) <= 10) continue // joining turned it onto an axis: a scrap after all
    out.push(seg)
  }
  return out
}

/**
 * "Arc ink" at a point: darker than the MEDIAN of its 7×7 neighbourhood by `delta`. A door swing drawn over a striped
 * bath floor stands out against the floor's median grey; the floor's own stripes (lighter than the fill) and the fill
 * itself do not — the max-based line ink marks every fill pixel next to a white stripe. Evaluated on demand (probes only).
 */
export function arcInk(g: Gray, delta = 18): (x: number, y: number) => boolean {
  const { width: w, height: h, data } = g
  const win = new Uint8Array(49)
  return (x, y) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi < 3 || yi < 3 || xi >= w - 3 || yi >= h - 3) return false
    let n = 0
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) win[n++] = data[(yi + dy) * w + xi + dx]
    win.sort()
    return data[yi * w + xi] <= win[24] - delta
  }
}

/** Skeleton → fitted, junction-snapped wall pieces (components shorter than `minComp` px dropped). */
function segsOf(sk: Uint8Array, dt: Float32Array, w: number, h: number, minComp: number): Seg[] {
  const { nodes, edges } = skeletonGraph(sk, w, h)
  pruneSpurs(nodes, edges, (j) => 1.5 * Math.max(2, dt[Math.round(nodes[j].y) * w + Math.round(nodes[j].x)]))

  // connected components of the live graph → drop tiny isolated pieces (leftover bold text, specks)
  const comp = new Int32Array(nodes.length).fill(-1)
  const compLen: number[] = []
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0 || !nodes[s].edges.length) continue
    const id = compLen.length
    let len = 0
    const st = [s]
    comp[s] = id
    while (st.length) {
      const n = st.pop()!
      for (const e of nodes[n].edges) {
        const E = edges[e]
        len += E.pts.length / 2
        const m = E.a === n ? E.b : E.a
        if (comp[m] < 0) (comp[m] = id), st.push(m)
      }
    }
    compLen.push(len)
  }

  const segs: Seg[] = []
  for (const E of edges) {
    if (E.dead || compLen[comp[E.a]] < minComp) continue
    const P: Px[] = E.pts.map((i) => ({ x: i % w, y: (i / w) | 0 }))
    P[0] = { x: nodes[E.a].x, y: nodes[E.a].y }
    P[P.length - 1] = { x: nodes[E.b].x, y: nodes[E.b].y }
    let hs: number[] = E.pts.map((i) => dt[i])
    hs = hs.slice().sort((x, y) => x - y)
    const eh = hs[hs.length >> 1]
    const pieces: { i0: number; i1: number; arc?: Px }[] = []
    fitChain(P, 0, P.length - 1, Math.max(1.5, 0.3 * eh), eh, pieces)
    for (const pc of pieces) {
      const sub = P.slice(pc.i0, pc.i1 + 1)
      const hh = E.pts.slice(pc.i0, pc.i1 + 1).map((i) => dt[i]).sort((x, y) => x - y)
      segs.push({
        a: P[pc.i0],
        b: P[pc.i1],
        mid: pc.arc,
        half: hh[hh.length >> 1],
        na: pc.i0 === 0 ? E.a : -1,
        nb: pc.i1 === P.length - 1 ? E.b : -1,
        pts: sub,
      })
    }
  }

  refine(segs, nodes, (p) => dt[Math.round(p.y) * w + Math.round(p.x)] ?? 0)
  return segs
}

/**
 * Median over the segment of (lighter side − centre) grey, the sides sampled 2 px beyond the stroke's edges. Walls:
 * ~150 (dark band, paper or floor fill beside it); tree canopies, hatching and textures: well under 60.
 */
export function sideContrast(g: Gray, s: { a: Px; b: Px; mid?: Px }, thicknessPx: number): number {
  const vals: number[] = []
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < g.width && yi < g.height ? g.data[yi * g.width + xi] : 255
  }
  const off = thicknessPx / 2 + 2
  for (const { a: p, b: q } of segPieces({ ...s, thicknessPx, conf: 1 })) {
    const L = dist(p, q)
    if (L < 1) continue
    const nx = -(q.y - p.y) / L, ny = (q.x - p.x) / L
    const n = Math.max(3, Math.min(24, Math.round(L / 4)))
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n
      const x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f
      vals.push(Math.max(at(x + nx * off, y + ny * off), at(x - nx * off, y - ny * off)) - at(x, y))
    }
  }
  vals.sort((u, v) => u - v)
  return vals.length ? vals[vals.length >> 1] : 0
}

const pkey = (p: Px) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`

/**
 * Topology clean-up on the fitted walls: (1) merge two straight walls meeting end to end within 4° (thinning splits a
 * run at every hair it pruned); (2) close near-junctions: a free end that stops within 1.5 thicknesses of another
 * wall's line is extended onto it — that wall is split there (a T), or, if the meeting point is past its free end too,
 * both ends move to the corner (an L). Real gaps (doors ≥ 0.45 m) are far wider than 1.5 thicknesses.
 */
export function tidy(walls: WallSeg[], minReach = 0): WallSeg[] {
  walls = walls.slice()
  const cos4 = Math.cos((4 * Math.PI) / 180)
  for (let changed = true; changed; ) {
    changed = false
    const at = new Map<string, number[]>()
    walls.forEach((s, i) => [s.a, s.b].forEach((p) => at.set(pkey(p), [...(at.get(pkey(p)) ?? []), i])))
    for (const [k, list] of at) {
      if (list.length !== 2 || list[0] === list[1]) continue
      const s = walls[list[0]], t = walls[list[1]]
      if (s.mid || t.mid) continue
      const s0 = pkey(s.a) === k ? s.b : s.a, t1 = pkey(t.a) === k ? t.b : t.a
      const sh = pkey(s.a) === k ? s.a : s.b
      const ls = dist(s0, sh), lt = dist(sh, t1)
      if (ls < 1 || lt < 1 || dist(s0, t1) < 1) continue
      const c =((sh.x - s0.x) * (t1.x - sh.x) + (sh.y - s0.y) * (t1.y - sh.y)) / (ls * lt || 1)
      if (c < cos4 || Math.abs(s.thicknessPx - t.thicknessPx) > 0.35 * Math.max(s.thicknessPx, t.thicknessPx)) continue
      const merged: WallSeg = { a: s0, b: t1, thicknessPx: (s.thicknessPx * ls + t.thicknessPx * lt) / (ls + lt), conf: Math.max(s.conf, t.conf) }
      walls = walls.filter((_, i) => i !== list[0] && i !== list[1])
      walls.push(merged)
      changed = true
      break
    }
  }
  // near-junctions
  const deg = new Map<string, number>()
  const bump = (p: Px, d: number) => deg.set(pkey(p), (deg.get(pkey(p)) ?? 0) + d)
  for (const s of walls) (bump(s.a, 1), bump(s.b, 1))
  const sin25 = Math.sin((25 * Math.PI) / 180)
  for (let i = 0; i < walls.length; i++) {
    for (const end of ['a', 'b'] as const) {
      const s = walls[i]
      if (s.mid) break
      const e = s[end], o = end === 'a' ? s.b : s.a
      if (deg.get(pkey(e)) !== 1) continue
      const L = dist(e, o)
      if (L < 1) continue
      const dx = (e.x - o.x) / L, dy = (e.y - o.y) / L
      const reach = Math.max(minReach, 1.5 * s.thicknessPx)
      let best: { u: number; j: number; v: number; X: Px } | null = null
      for (let j = 0; j < walls.length; j++) {
        const t = walls[j]
        if (j === i || t.mid) continue
        const tx = t.b.x - t.a.x, ty = t.b.y - t.a.y, Lt = Math.hypot(tx, ty)
        if (Lt < 1) continue
        const cr = dx * ty - dy * tx
        if (Math.abs(cr) < sin25 * Lt) continue
        // e + u·d = t.a + v·(t.b − t.a)
        const u = ((t.a.x - e.x) * ty - (t.a.y - e.y) * tx) / cr
        const v = ((t.a.x - e.x) * dy - (t.a.y - e.y) * dx) / cr
        if (u < -0.5 * s.thicknessPx || u > reach + t.thicknessPx / 2) continue
        const slack = reach / Lt
        if (v < -slack || v > 1 + slack) continue
        if (!best || Math.abs(u) < Math.abs(best.u)) best = { u, j, v, X: { x: e.x + u * dx, y: e.y + u * dy } }
      }
      if (!best) continue
      const t = walls[best.j], X = best.X
      bump(e, -1)
      walls[i] = { ...s, [end]: X }
      bump(X, 1)
      if (best.v <= 0 || best.v >= 1) {
        // past t's end: an L corner if that end is free, else a T at t's end (it is a junction already)
        const te = best.v <= 0 ? 'a' : 'b'
        if (deg.get(pkey(t[te])) === 1) {
          bump(t[te], -1)
          walls[best.j] = { ...t, [te]: X }
          bump(X, 1)
        } else {
          bump(X, -1)
          walls[i] = { ...s, [end]: t[te] }
          bump(t[te], 1)
        }
      } else if (dist(X, t.a) >= 1 && dist(X, t.b) >= 1) {
        walls[best.j] = { ...t, b: X }
        walls.push({ ...t, a: X })
        bump(X, 2)
      }
    }
  }
  return walls
}

/** DT at the ridge → stroke width. A (2k+1)-px stroke has ridge DT k+1, a 2k-px stroke has k (pixel-centre distances). */
export const thicknessOf = (ridgeDt: number) => Math.max(1, 2 * ridgeDt - 0.5)

/** Snap junction nodes to the least-squares meeting point of their straight arms; extend free ends by the skeleton retraction. */
function refine(segs: Seg[], nodes: Node[], dtAt: (p: Px) => number): void {
  const arms = new Map<number, { s: Seg; end: 'a' | 'b' }[]>()
  for (const s of segs)
    for (const end of ['a', 'b'] as const) {
      const n = end === 'a' ? s.na : s.nb
      if (n < 0) continue
      if (!arms.has(n)) arms.set(n, [])
      arms.get(n)!.push({ s, end })
    }
  // interior split points (corners inside one chain): intersect the two neighbouring pieces' LSQ lines
  const fitOf = (s: Seg) => {
    const k = Math.max(1, Math.round(s.half))
    const inner = s.pts.length > 2 * k + 2 ? s.pts.slice(k, s.pts.length - k) : s.pts
    return lsq(inner)
  }
  for (let i = 0; i + 1 < segs.length; i++) {
    const s = segs[i], t = segs[i + 1]
    if (s.nb !== -1 || t.na !== -1 || s.mid || t.mid) continue
    if (s.b.x !== t.a.x || s.b.y !== t.a.y) continue
    const p = meetPoint([fitOf(s), fitOf(t)])
    if (p && dist(p, s.b) <= 2 * Math.max(s.half, t.half)) (s.b = p), (t.a = { ...p })
  }
  for (const [n, list] of arms) {
    if (list.length === 1) {
      // free end: the skeleton stops ~one half-width short of the wall's end
      const { s, end } = list[0]
      const p = end === 'a' ? s.a : s.b, q = end === 'a' ? s.b : s.a
      if (s.mid) continue
      const L = dist(p, q) || 1
      const ext = Math.min(s.half, dtAt(p)) // the end pixel sits dt(end) from the paper beyond it
      const np = { x: p.x + ((p.x - q.x) / L) * ext, y: p.y + ((p.y - q.y) / L) * ext }
      if (end === 'a') s.a = np
      else s.b = np
      continue
    }
    const straight = list.filter((x) => !x.s.mid && x.s.pts.length >= 4)
    if (straight.length < 2) continue
    const p = meetPoint(straight.map((x) => fitOf(x.s)))
    const node = nodes[n]
    const lim = 1.5 * Math.max(...list.map((x) => x.s.half))
    const at = p && dist(p, node) <= lim ? p : { x: node.x, y: node.y }
    for (const { s, end } of list) {
      if (end === 'a') s.a = { ...at }
      else s.b = { ...at }
    }
  }
}

/**
 * Gaps: from every free wall end, march on along the wall's direction over the wall core; the first wall pixel between
 * ~0.45 m and ~3.2 m away (at the assumed partition scale) is the far jamb — another free end (a gap in one wall run)
 * or the side of a cross wall (a door beside a corner). Kind: a thin arc of radius ≈ gap around either jamb → door;
 * glazing across the gap (see `glazing`) → window; else passage (≤ 1.4 m) / unknown.
 */
function findOpenings(walls: WallSeg[], core: Uint8Array, rCore: number, w: number, h: number, half: number, partitionM: number, arcAt: (x: number, y: number) => boolean, grayAt: (x: number, y: number) => number): OpeningGuess[] {
  const pxPerM = thicknessOf(half) / partitionM
  const key = (p: Px) => `${Math.round(p.x)},${Math.round(p.y)}`
  const deg = new Map<string, number>()
  for (const s of walls) for (const p of [s.a, s.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1)
  // free ends cast rays; so do junctions (a window between two corners has no free end), but those need evidence
  const ends: { p: Px; dir: Px; th: number; junction: boolean }[] = []
  for (const s of walls) {
    if (s.mid) continue
    const L = dist(s.a, s.b)
    if (L < 1.5 * s.thicknessPx) continue // a stub's direction is noise
    const ux = (s.b.x - s.a.x) / L, uy = (s.b.y - s.a.y) / L
    ends.push({ p: s.a, dir: { x: -ux, y: -uy }, th: s.thicknessPx, junction: deg.get(key(s.a)) !== 1 })
    ends.push({ p: s.b, dir: { x: ux, y: uy }, th: s.thicknessPx, junction: deg.get(key(s.b)) !== 1 })
  }
  const at = (m: Uint8Array, x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < w && yi < h ? m[yi * w + xi] : 0
  }
  const out: OpeningGuess[] = []
  for (const E of ends) {
    const { dir } = E
    let t = 1
    const maxSkip = (E.junction ? 3 : 2) * E.th
    while (t < maxSkip && at(core, E.p.x + dir.x * t, E.p.y + dir.y * t)) t++ // off our own wall (or the corner's body)
    if (E.junction && t >= maxSkip) continue // the wall runs on through the junction
    // the near jamb: a free end is its own jamb; from a junction it is where the corner's body stops
    const a0 = E.junction ? t - 1 + rCore : 0
    const p = { x: E.p.x + dir.x * a0, y: E.p.y + dir.y * a0 }
    let hit = -1
    // up to 6 m: a bedroom's glazing runs 3–4 m (only window evidence is accepted past 2 m, see classifyGap)
    for (; t <= a0 + 6 * pxPerM + rCore; t++)
      if (at(core, E.p.x + dir.x * t, E.p.y + dir.y * t)) {
        hit = t - rCore - a0 // the core is the wall eroded by rCore
        break
      }
    if (hit < 0.45 * pxPerM) continue
    const b = { x: p.x + dir.x * hit, y: p.y + dir.y * hit }
    const tol = 1.5 * E.th
    if (out.some((o) => (dist(o.a, b) < tol && dist(o.b, p) < tol) || (dist(o.a, p) < tol && dist(o.b, b) < tol))) continue
    // a ray running alongside a wall's body (the junction point sits a little off that wall's line) is no gap
    let alongside = false
    for (let off = -0.8 * E.th; off <= 0.8 * E.th && !alongside; off += 1) {
      let n = 0, c = 0
      for (let f = 0.1; f <= 0.9; f += 0.05, n++) c += at(core, p.x + dir.x * hit * f - dir.y * off, p.y + dir.y * hit * f + dir.x * off)
      alongside = c >= 0.5 * n
    }
    if (alongside) continue
    const g = classifyGap(p, b, E.th, hit, pxPerM, (x, y) => (arcAt(x, y) && at(core, x, y) === 0 ? 1 : 0), grayAt)
    if (g && (!E.junction || g.kind === 'door' || g.kind === 'window')) out.push(g)
  }
  return out
}

/** Door / window / passage / unknown for a gap a→b; null = no evidence and too wide to be a plain passage. */
function classifyGap(a: Px, b: Px, th: number, gap: number, pxPerM: number, arcAt: (x: number, y: number) => number, grayAt: (x: number, y: number) => number): OpeningGuess | null {
  const ux = (b.x - a.x) / gap, uy = (b.y - a.y) / gap
  const nx = -uy, ny = ux
  // door: a quarter arc around either jamb, on either side, at ONE radius (0.75–1.15 × the gap) over most of its sweep,
  // with empty floor inside it (control ring at half the radius). One radius: tile grids and furniture edges cross the
  // probe ring here and there, a swing follows it. Arc ink is judged against the local median (striped bath floors).
  const arcNear = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (arcAt(x + dx, y + dy)) return 1
    return 0
  }
  // radii 0.6–1.3 × the gap are probed; the swing sits at 0.75–1.15, the rings 0.15 inside and outside it must be clear
  // (a curve, not a field of text, hatching or a fixture's clutter)
  const RF = Array.from({ length: 15 }, (_, j) => 0.6 + 0.05 * j)
  let best = { score: 0, hinge: a, side: 1 }
  if (gap <= 1.25 * pxPerM)
    for (const [hp, sgn] of [[a, 1], [b, -1]] as const)
      for (const side of [1, -1]) {
        const hits = RF.map(() => new Uint8Array(17))
        let inner = 0
        for (let k = 0; k <= 16; k++) {
          const ang = ((0.1 + (0.8 * k) / 16) * Math.PI) / 2
          const dx = Math.cos(ang) * ux * sgn + Math.sin(ang) * nx * side
          const dy = Math.cos(ang) * uy * sgn + Math.sin(ang) * ny * side
          RF.forEach((rf, j) => (hits[j][k] = arcNear(hp.x + dx * gap * rf, hp.y + dy * gap * rf)))
          inner += arcAt(hp.x + dx * gap * 0.5, hp.y + dy * gap * 0.5) ? 1 : 0
        }
        if (inner / 17 > 0.35) continue
        for (let j = 3; j <= 11; j++) {
          let hit = 0, clutter = 0
          for (let k = 0; k <= 16; k++) (hit += hits[j][k] | hits[j - 1][k] | hits[j + 1][k]), (clutter += hits[j - 3][k] | hits[j + 3][k])
          if (clutter / 17 <= 0.65 && hit / 17 > best.score) best = { score: hit / 17, hinge: hp, side }
        }
      }
  // a single leaf is 0.6–1.1 m: wider "arcs" are furniture and text lining up by chance
  if (best.score >= 0.7) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    return { a, b, kind: 'door', conf: best.score, hingeAt: best.hinge, swingTo: { x: mx + nx * best.side * gap * 0.5, y: my + ny * best.side * gap * 0.5 } }
  }
  const g = glazing(a, ux, uy, gap, th, grayAt)
  if (g.lines >= 2) return { a, b, kind: 'window', conf: 0.6 }
  if (g.band >= 3) return { a, b, kind: 'window', conf: 0.5 }
  return gap <= 1.4 * pxPerM ? { a, b, kind: 'passage', conf: 0.3 } : gap <= 2 * pxPerM ? { a, b, kind: 'unknown', conf: 0.2 } : null
}

/**
 * Glazing drawn along a→(a + u·len) within ±0.8·th of the line: the grey profile across it (at each offset the 80th
 * percentile along the middle 80 %, so a line must run nearly the whole length) has dark intervals — darker by 15 than
 * the brightest profile value on EACH side (a line or a glass band, not the edge of a room's colour fill ending there).
 * `lines` = such intervals, `band` = the widest one's width (px). ≥ 2 lines (frame / panes) or a band ≥ 3 px (a light
 * glass band, lines merged at low resolution) is a window; a lone 1–2 px line is a pen line (railing, sill, furniture).
 */
export function glazing(a: Px, ux: number, uy: number, len: number, th: number, grayAt: (x: number, y: number) => number): { lines: number; band: number } {
  const nx = -uy, ny = ux
  const prof: number[] = []
  for (let off = -th * 0.8; off <= th * 0.8; off += 0.5) {
    const v: number[] = []
    for (let t = 0.1; t <= 0.9; t += 0.05) v.push(grayAt(a.x + ux * len * t + nx * off, a.y + uy * len * t + ny * off))
    v.sort((p, q) => p - q)
    prof.push(v[Math.floor(0.8 * (v.length - 1))])
  }
  const n = prof.length
  const left = prof.map((_, i) => Math.max(...prof.slice(0, i + 1)))
  const right = prof.map((_, i) => Math.max(...prof.slice(i)))
  let lines = 0, band = 0, run = 0
  for (let i = 0; i <= n; i++) {
    const dark = i < n && prof[i] <= Math.min(left[i], right[i]) - 15
    if (dark) run++
    else if (run) (lines++), (band = Math.max(band, run * 0.5)), (run = 0)
  }
  return { lines, band }
}

/** A traced wall as straight pieces (an arc → `n` chords). */
export function segPieces(s: WallSeg, n = 8): { a: Px; b: Px }[] {
  if (!s.mid) return [{ a: s.a, b: s.b }]
  const c = circle3(s.a, s.mid, s.b)
  if (!c) return [{ a: s.a, b: s.mid }, { a: s.mid, b: s.b }]
  const ang = (p: Px) => Math.atan2(p.y - c.y, p.x - c.x)
  const norm = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  const a0 = ang(s.a)
  // the sweep direction that passes through mid
  let sweep = norm(ang(s.b) - a0)
  if (norm(ang(s.mid) - a0) > sweep) sweep -= 2 * Math.PI
  const out: { a: Px; b: Px }[] = []
  let prev = s.a
  for (let k = 1; k <= n; k++) {
    const t = a0 + (sweep * k) / n
    const p = k === n ? s.b : { x: c.x + c.r * Math.cos(t), y: c.y + c.r * Math.sin(t) }
    out.push({ a: prev, b: p })
    prev = p
  }
  return out
}

export function circle3(a: Px, b: Px, c: Px): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { x, y, r: Math.hypot(a.x - x, a.y - y) }
}
