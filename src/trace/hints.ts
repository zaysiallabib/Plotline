/**
 * Stage 2b of auto-trace (wave 16): room-kind clues that are NOT text. Geometry first — brochure print is 6–9 px and
 * OCR reads only part of the labels, so kinds also come from what is drawn:
 *   green    planters / lawns / foliage (colour mask)                                   → balcony + green
 *   fixture  symbols found as closed "holes" in the thin-line layer: WC / basin ovals    → bath
 *            (+ tank = WC), 2–4 hob burners → kitchen, a bed's two pillows → bed, a table ringed by chairs → dining
 *   colour   flat floor fills clustered by colour (HintTrace.fills / clusters); `propagateByColour` spreads the labels
 *            the OCR did read to unread rooms of the same fill (Banani: grey = bedrooms, blue = wet rooms)
 * Precision over recall: every detector has a size window in metres (scale = opts.pxPerM, else the thinnest common wall
 * ≈ a 5" partition) plus a shape test. North arrow: not built (a rose is a thin circle + needle + a 6–9 px "N"; no cheap
 * test separates it from door swings and round tables — the text stage's 'north' items are the better source).
 * Pure: typed arrays only, no DOM.
 */
import { edt, lineInk } from './raster'
import { inkThreshold, traceWalls } from './walls'
import { pointInPolygon } from '../core'
import type { ColourFill, Gray, HintTrace, Px, RoomHint, WallTrace } from './types'

/** A colour raster, row-major RGBA (canvas ImageData layout). */
export interface Rgba {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

export interface HintOpts {
  /** known scale; else estimated from the walls (±15 % on the eval sheets) */
  pxPerM?: number
  /** the walls stage's result, reused for the scale estimate (else traceWalls runs here) */
  walls?: WallTrace
  /** a fixture line is at least this many grey levels darker than its local background (tile stripes are ~30) */
  lineDelta?: number
}

const PARTITION_M = 0.127

/** px per metre from the thinnest common walls: the 10th-percentile traced thickness ≈ a 5" partition. 0 = no walls. */
export function estimatePxPerM(walls: WallTrace): number {
  const th = walls.walls.map((w) => w.thicknessPx).sort((a, b) => a - b)
  return th.length ? th[Math.floor(0.1 * (th.length - 1))] / PARTITION_M : 0
}

export function findHints(gray: Gray, rgb?: Rgba, opts: HintOpts = {}): HintTrace {
  const k = opts.pxPerM ?? estimatePxPerM(opts.walls ?? traceWalls(gray))
  const delta = opts.lineDelta ?? 40
  const hints = k > 0 ? fixtureHints(gray, k, delta) : []
  // faint outlines (BTI 3rd floor: a grey WC on striped tiles) leak at `delta`; a second, fainter pass keeps only the
  // strictest symbol, a WC bowl with its cistern (every other detector over-fires on faint lines)
  // ponytail: reruns every detector for one; split fixtureHints if the 0.3–0.6 s matters
  if (k > 0)
    for (const h of fixtureHints(gray, k, delta - 12))
      if (h.what === 'wc' && !hints.some((q) => q.kind === 'bath' && Math.hypot(q.at.x - h.at.x, q.at.y - h.at.y) < 0.6 * k)) hints.push(h)
  if (!rgb || k <= 0) return { hints }
  hints.push(...greenHints(rgb, k))
  return { hints, ...colourFills(rgb, k) }
}

// ---------------------------------------------------------------- connected components + shape measures

interface Comp {
  n: number
  sx: number
  sy: number
  sxx: number
  syy: number
  sxy: number
  x0: number
  y0: number
  x1: number
  y1: number
  edge: boolean
}

/** Components of mask = 1; lab = component index + 1 per pixel (0 = background). */
export function components(mask: Uint8Array, w: number, h: number, eight = false): { lab: Int32Array; comps: Comp[] } {
  const lab = new Int32Array(w * h)
  const comps: Comp[] = []
  const stack = new Int32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue
    const id = comps.length + 1
    const c: Comp = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, x0: w, y0: h, x1: 0, y1: 0, edge: false }
    let sp = 0
    stack[sp++] = i
    lab[i] = id
    while (sp) {
      const p = stack[--sp]
      const x = p % w, y = (p - x) / w
      c.n++
      c.sx += x
      c.sy += y
      c.sxx += x * x
      c.syy += y * y
      c.sxy += x * y
      if (x < c.x0) c.x0 = x
      if (x > c.x1) c.x1 = x
      if (y < c.y0) c.y0 = y
      if (y > c.y1) c.y1 = y
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        c.edge = true
        continue
      }
      const push = (q: number) => {
        if (mask[q] && !lab[q]) (lab[q] = id), (stack[sp++] = q)
      }
      push(p - 1), push(p + 1), push(p - w), push(p + w)
      if (eight) push(p - w - 1), push(p - w + 1), push(p + w - 1), push(p + w + 1)
    }
    comps.push(c)
  }
  return { lab, comps }
}

export interface Shape {
  id: number
  /** pixels of the filled shape (see shapeOf) */
  n: number
  c: Px
  /** long / short side of the best-fitting box (px) and the long side's direction (rad) */
  L1: number
  L2: number
  ang: number
  /** n / box area: ellipse ≈ 0.785, rectangle ≈ 1 */
  fill: number
  /** share of pixels outside the moment ellipse (×1.1): ellipse ≈ 0, rectangle ≈ 0.05, L-shapes more */
  out: number
}

/**
 * The component's shape with whatever it encloses filled in (orthogonally convex hull: inside its row span AND its column
 * span), so a burner ring or a basin with a tap line measures as a whole disc. Box fit at the principal axis, 0° and 45°
 * (a square's principal axis is arbitrary): the fullest box wins.
 */
export function shapeOf(c: Comp, id: number, lab: Int32Array, w: number): Shape {
  const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1
  const rMin = new Int32Array(bh).fill(bw), rMax = new Int32Array(bh).fill(-1), cMin = new Int32Array(bw).fill(bh), cMax = new Int32Array(bw).fill(-1)
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (lab[(c.y0 + y) * w + c.x0 + x] !== id) continue
      if (x < rMin[y]) rMin[y] = x
      if (x > rMax[y]) rMax[y] = x
      if (y < cMin[x]) cMin[x] = y
      if (y > cMax[x]) cMax[x] = y
    }
  const inside = (x: number, y: number) => x >= rMin[y] && x <= rMax[y] && y >= cMin[x] && y <= cMax[x]
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) if (inside(x, y)) (n++), (sx += x), (sy += y), (sxx += x * x), (syy += y * y), (sxy += x * y)
  const cx = sx / n, cy = sy / n
  const vxx = sxx / n - cx * cx, vyy = syy / n - cy * cy, vxy = sxy / n - cx * cy
  const th = 0.5 * Math.atan2(2 * vxy, vxx - vyy)
  const tr = vxx + vyy, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (vxx * vyy - vxy * vxy)))
  const A = 2.2 * Math.sqrt(tr / 2 + disc) + 0.5, B = 2.2 * Math.sqrt(Math.max(0, tr / 2 - disc)) + 0.5
  const angs = [th, 0, Math.PI / 4]
  const cs = angs.map(Math.cos), sn = angs.map(Math.sin)
  const ext = angs.map(() => [Infinity, -Infinity, Infinity, -Infinity])
  let out = 0
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      if (!inside(x, y)) continue
      const dx = x - cx, dy = y - cy
      for (let k = 0; k < 3; k++) {
        const u = dx * cs[k] + dy * sn[k], v = -dx * sn[k] + dy * cs[k], e = ext[k]
        if (u < e[0]) e[0] = u
        if (u > e[1]) e[1] = u
        if (v < e[2]) e[2] = v
        if (v > e[3]) e[3] = v
      }
      const u0 = dx * cs[0] + dy * sn[0], v0 = -dx * sn[0] + dy * cs[0]
      if ((u0 / A) ** 2 + (v0 / B) ** 2 > 1) out++
    }
  let best = 0, bestFill = -1
  for (let k = 0; k < 3; k++) {
    const e = ext[k], f = n / ((e[1] - e[0] + 1) * (e[3] - e[2] + 1))
    if (f > bestFill) (bestFill = f), (best = k)
  }
  const e = ext[best], du = e[1] - e[0] + 1, dv = e[3] - e[2] + 1
  return { id, n, c: { x: c.x0 + cx, y: c.y0 + cy }, L1: Math.max(du, dv), L2: Math.min(du, dv), ang: du >= dv ? angs[best] : angs[best] + Math.PI / 2, fill: bestFill, out: out / n }
}

/** Share of the pixels within r px outside component `id` for which isInk holds. */
function ringInk(c: Comp, id: number, lab: Int32Array, w: number, h: number, isInk: (i: number) => boolean, r: number): number {
  const x0 = Math.max(0, c.x0 - r), y0 = Math.max(0, c.y0 - r), x1 = Math.min(w - 1, c.x1 + r), y1 = Math.min(h - 1, c.y1 + r)
  const bw = x1 - x0 + 1
  const ring = new Uint8Array(bw * (y1 - y0 + 1))
  for (let y = c.y0; y <= c.y1; y++)
    for (let x = c.x0; x <= c.x1; x++) {
      if (lab[y * w + x] !== id) continue
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const X = x + dx, Y = y + dy
          if (X >= x0 && Y >= y0 && X <= x1 && Y <= y1 && dx * dx + dy * dy <= r * r) ring[(Y - y0) * bw + X - x0] = 1
        }
    }
  let n = 0, ink = 0
  for (let i = 0; i < ring.length; i++) {
    if (!ring[i]) continue
    const p = (y0 + Math.floor(i / bw)) * w + x0 + (i % bw)
    if (lab[p] === id) continue
    n++
    if (isInk(p)) ink++
  }
  return n ? ink / n : 0
}

// ---------------------------------------------------------------- fixtures

const LINE_PX = 1.5 // an interior hole is smaller than the drawn symbol by about one outline width
const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % Math.PI
  return Math.min(d, Math.PI - d)
}
const dist = (p: Px, q: Px) => Math.hypot(p.x - q.x, p.y - q.y)

/**
 * p moved `move` px along whichever of `dirs` crosses the least dark ink within `len` px — out of the corner / off the wall
 * a fixture stands against, into its room (the solver looks the hint's room up by point).
 */
function intoRoom(gray: Gray, t: number, p: Px, dirs: Px[], len: number, move: number): Px {
  let best = dirs[0], bestInk = Infinity
  for (const d of dirs) {
    let ink = 0
    for (let s = 1; s <= len; s++) {
      const x = Math.round(p.x + d.x * s), y = Math.round(p.y + d.y * s)
      if (x < 0 || y < 0 || x >= gray.width || y >= gray.height || gray.data[y * gray.width + x] <= t) ink++
    }
    if (ink < bestInk) (bestInk = ink), (best = d)
  }
  return { x: p.x + best.x * move, y: p.y + best.y * move }
}
const DIRS8: Px[] = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i * Math.PI) / 4), y: Math.sin((i * Math.PI) / 4) }))

export interface HoleShape extends Shape {
  /** long / short side in metres, the outline added back */
  m1: number
  m2: number
  /** own pixels / filled pixels: 1 = nothing drawn inside (a pillow), < 1 = lines or text inside (a burner ring, a label box) */
  solid: number
}

/**
 * Closed white regions ("holes") of the thin-line layer (lines ≥ lineDelta darker than their surroundings, plus dark ink),
 * sized between a 7 cm dot and 4 m², with their shape measures. `ringInk(s)`: share of dark ink just outside the hole
 * (a glyph counter's thick stroke ≈ 1, a fixture's thin outline ≤ ~0.4). `nearWall(p, r)`: thick dark ink within r px.
 */
export function holeShapes(gray: Gray, k: number, lineDelta = 40) {
  const { width: w, height: h } = gray
  const t = inkThreshold(gray, {})
  const thinInk = lineInk(gray, lineDelta, 2)
  const free = new Uint8Array(w * h), dark = new Uint8Array(w * h)
  for (let i = 0; i < free.length; i++) {
    dark[i] = gray.data[i] <= t ? 1 : 0
    free[i] = thinInk[i] || dark[i] ? 0 : 1
  }
  const { lab, comps } = components(free, w, h)
  const nMin = Math.max(8, 0.004 * k * k), nMax = 4 * k * k
  const shapes: HoleShape[] = []
  comps.forEach((c, i) => {
    if (c.edge || c.n < nMin || c.n > nMax) return
    const s = shapeOf(c, i + 1, lab, w)
    shapes.push({ ...s, m1: (s.L1 + LINE_PX) / k, m2: (s.L2 + LINE_PX) / k, solid: c.n / s.n })
  })
  const depth = edt(dark, w, h)
  const nearWall = (p: Px, r: number) => {
    for (let y = Math.max(0, Math.round(p.y - r)); y <= Math.min(h - 1, Math.round(p.y + r)); y++)
      for (let x = Math.max(0, Math.round(p.x - r)); x <= Math.min(w - 1, Math.round(p.x + r)); x++)
        if (depth[y * w + x] >= 1.9 && (x - p.x) ** 2 + (y - p.y) ** 2 <= r * r) return true
    return false
  }
  return { shapes, t, nearWall, ringInk: (s: Shape) => ringInk(comps[s.id - 1], s.id, lab, w, h, (i) => dark[i] === 1, 4) }
}

/** Holes of the thin-line layer → fixture symbols. k = px per metre. */
export function fixtureHints(gray: Gray, k: number, lineDelta = 40): RoomHint[] {
  const { shapes: S, t, nearWall, ringInk } = holeShapes(gray, k, lineDelta)
  const isRect = (s: HoleShape) => s.fill >= 0.88
  // a glyph's counter ("O", "0" in a big title) is ringed by a thick dark stroke; a fixture by a thin line
  const thinRing = (s: HoleShape) => ringInk(s) <= 0.55
  const rects = S.filter(isRect)
  const out: RoomHint[] = []
  const frame = (o: Shape, p: Px) => {
    const dx = p.x - o.c.x, dy = p.y - o.c.y
    return { a: Math.abs(dx * Math.cos(o.ang) + dy * Math.sin(o.ang)), b: Math.abs(-dx * Math.sin(o.ang) + dy * Math.cos(o.ang)) }
  }

  // dining: a table box with ≥ 4 chair-sized holes just outside its edges
  const small = S.filter((s) => s.L2 >= 4 && s.m1 >= 0.28 && s.m1 <= 0.65 && s.m2 >= 0.15 && s.m2 <= 0.6)
  const side = (o: Shape, p: Px) => Math.sign(-(p.x - o.c.x) * Math.sin(o.ang) + (p.y - o.c.y) * Math.cos(o.ang))
  const tables = rects.filter((tb) => {
    if (tb.m1 < 1.0 || tb.m1 > 2.8 || tb.m2 < 0.72 || tb.m2 > 1.3 || tb.m1 / tb.m2 < 1.2 || tb.m1 / tb.m2 > 3.2) return false
    const chairs = small.filter((s) => {
      const { a, b } = frame(tb, s.c)
      return !(a < tb.L1 / 2 && b < tb.L2 / 2) && a <= tb.L1 / 2 + 0.55 * k && b <= tb.L2 / 2 + 0.55 * k
    })
    // chairs on BOTH long sides (stair treads beside a landing line up on one)
    const long = chairs.filter((s) => frame(tb, s.c).b >= tb.L2 / 2)
    return chairs.length >= 4 && chairs.length <= 12 && long.some((s) => side(tb, s.c) > 0) && long.some((s) => side(tb, s.c) < 0)
  })
  for (const tb of tables) out.push({ at: tb.c, kind: 'dining', source: 'fixture', what: 'table+chairs', conf: 0.7 })
  const atTable = (p: Px) =>
    tables.some((tb) => {
      const { a, b } = frame(tb, p)
      return a <= tb.L1 / 2 + 0.7 * k && b <= tb.L2 / 2 + 0.7 * k
    })

  // WC bowl / basin: an oval; a flat box (the cistern) ACROSS one end of its long axis makes it a WC. A chair seat is an
  // oval-ish box with its back box running ALONG it, and sits at a table.
  const chairLike = (o: Shape) =>
    S.some((s) => {
      if (s === o || angDiff(s.ang, o.ang) > 0.25 || s.L1 / o.L1 < 0.7 || s.L1 / o.L1 > 1.43) return false
      const { a, b } = frame(o, s.c)
      return a <= 0.25 * o.L1 && b <= (o.L2 + s.L2) / 2 + 0.12 * k
    })
  const circles = S.filter((s) => s.L2 >= 6 && s.m1 / s.m2 < 1.25 && (s.m1 + s.m2) / 2 >= 0.13 && (s.m1 + s.m2) / 2 <= 0.36 && s.fill >= 0.66 && s.fill <= 0.9 && s.out <= 0.06 && thinRing(s))

  // hob: 2–4 similar burner circles close together (lamps on bedside tables are ~2 m apart)
  const parent = circles.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < circles.length; i++)
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i], b = circles[j]
      const da = (a.L1 + a.L2) / 2, db = (b.L1 + b.L2) / 2, d = dist(a.c, b.c)
      if (Math.max(da, db) / Math.min(da, db) <= 1.4 && d >= 1.5 * Math.max(da, db) && d <= Math.min(3.5 * Math.max(da, db), 0.75 * k)) parent[find(i)] = find(j)
    }
  const groups = new Map<number, HoleShape[]>()
  circles.forEach((c, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), c]))
  const hobs: Px[] = []
  for (const g of groups.values()) {
    if (g.length < 2 || g.length > 4) continue
    const xs = g.map((c) => c.c.x), ys = g.map((c) => c.c.y)
    if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) > 0.8 * k) continue
    const c = { x: xs.reduce((a, b) => a + b) / g.length, y: ys.reduce((a, b) => a + b) / g.length }
    hobs.push(c)
    out.push({ at: intoRoom(gray, t, c, DIRS8, 0.9 * k, 0.35 * k), kind: 'kitchen', source: 'fixture', what: 'stove', conf: 0.7 })
  }

  // double kitchen sink: two alike bowls sharing a divider, on a counter against a wall, nothing alike beside them
  const bowls = S.filter((s) => s.m1 >= 0.22 && s.m1 <= 0.5 && s.m2 >= 0.18 && s.m2 <= 0.45 && s.m1 / s.m2 < 1.5 && s.fill >= 0.75 && thinRing(s) && !atTable(s.c) && nearWall(s.c, 0.7 * k))
  const sinkBowl = new Set<HoleShape>()
  for (let i = 0; i < bowls.length; i++)
    for (let j = i + 1; j < bowls.length; j++) {
      const a = bowls[i], b = bowls[j], L = (a.L1 + b.L1) / 2, d = dist(a.c, b.c)
      if (sinkBowl.has(a) || sinkBowl.has(b) || Math.max(a.n, b.n) / Math.min(a.n, b.n) > 1.5 || d < 0.8 * L || d > L + 0.12 * k) continue
      const c = { x: (a.c.x + b.c.x) / 2, y: (a.c.y + b.c.y) / 2 }
      // a drainboard may make three; a row of chairs makes more
      if (bowls.filter((q) => q !== a && q !== b && Math.max(q.n, a.n) / Math.min(q.n, a.n) <= 1.5 && dist(q.c, c) < 2 * L).length > 1) continue
      sinkBowl.add(a), sinkBowl.add(b)
      hobs.push(c)
      out.push({ at: intoRoom(gray, t, c, DIRS8, 0.9 * k, 0.35 * k), kind: 'kitchen', source: 'fixture', what: 'sink', conf: 0.6 })
    }

  // a WC stands and a basin hangs against a wall; a sink beside a hob is the kitchen's
  const ovals = S.filter((s) => s.L2 >= 5 && s.m1 >= 0.25 && s.m1 <= 0.72 && s.m2 >= 0.17 && s.m2 <= 0.52 && s.m1 / s.m2 >= 1.18 && s.m1 / s.m2 <= 2.1 && s.fill >= 0.68 && s.fill <= 0.9 && s.out <= 0.08 && thinRing(s) && !atTable(s.c) && !chairLike(s) && nearWall(s.c, 0.75 * k) && !sinkBowl.has(s) && !hobs.some((p) => dist(p, s.c) < 1.2 * k))
  for (const o of ovals) {
    const u = { x: Math.cos(o.ang), y: Math.sin(o.ang) }
    const tank = rects.find((r) => {
      const dx = r.c.x - o.c.x, dy = r.c.y - o.c.y, along = dx * u.x + dy * u.y, lat = Math.abs(-dx * u.y + dy * u.x)
      return r.m1 >= 0.3 && r.m1 <= 0.7 && r.m2 >= 0.06 && r.m2 <= 0.3 && angDiff(r.ang, o.ang + Math.PI / 2) < 0.25 && Math.abs(along) <= (o.L1 + r.L2) / 2 + 0.2 * k && Math.abs(along) >= o.L1 / 3 && lat <= 0.12 * k
    })
    const at = tank
      ? (() => {
          const s = Math.sign((o.c.x - tank.c.x) * u.x + (o.c.y - tank.c.y) * u.y)
          return { x: o.c.x + u.x * s * 0.25 * k, y: o.c.y + u.y * s * 0.25 * k }
        })()
      : intoRoom(gray, t, o.c, DIRS8, 0.9 * k, 0.3 * k)
    out.push({ at, kind: 'bath', source: 'fixture', what: tank ? 'wc' : 'wc/basin', conf: tank ? 0.8 : 0.6 })
  }

  // bed: exactly two pillow boxes end to end along the headboard; the hint goes onto the bed, away from the wall.
  // Pillows are empty inside (a label box — F.H.B, E-SHAFT — holds text).
  const pillows = rects.filter((r) => r.L2 >= 4 && r.solid >= 0.92 && r.m1 >= 0.35 && r.m1 <= 0.9 && r.m2 >= 0.18 && r.m2 <= 0.55 && r.m1 / r.m2 >= 1.3 && r.m1 / r.m2 <= 3)
  const alike = (a: (typeof S)[0], b: (typeof S)[0]) => Math.max(a.L1, b.L1) / Math.min(a.L1, b.L1) <= 1.3 && Math.max(a.L2, b.L2) / Math.min(a.L2, b.L2) <= 1.3 && angDiff(a.ang, b.ang) < 0.15
  const usedP = new Set<number>()
  for (let i = 0; i < pillows.length; i++)
    for (let j = i + 1; j < pillows.length; j++) {
      const a = pillows[i], b = pillows[j]
      if (usedP.has(i) || usedP.has(j) || !alike(a, b)) continue
      const u = { x: Math.cos(a.ang), y: Math.sin(a.ang) }
      const dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, along = Math.abs(dx * u.x + dy * u.y), lat = Math.abs(-dx * u.y + dy * u.x)
      const L1 = (a.L1 + b.L1) / 2, L2 = (a.L2 + b.L2) / 2
      if (along < 0.9 * L1 || along > L1 + 0.35 * k || lat > 0.25 * L2 + 2) continue
      const c = { x: (a.c.x + b.c.x) / 2, y: (a.c.y + b.c.y) / 2 }
      // a third alike box nearby = a row of cushions / tiles, not a bed
      if (rects.some((r) => r.id !== a.id && r.id !== b.id && alike(r, a) && dist(r.c, c) < 2.2 * L1)) continue
      usedP.add(i), usedP.add(j)
      const at = intoRoom(gray, t, c, [{ x: -u.y, y: u.x }, { x: u.y, y: -u.x }], 1.2 * k, 0.8 * k)
      out.push({ at, kind: 'bed', source: 'fixture', what: 'bed', conf: 0.7 })
    }
  // ponytail: no bed-without-pillows detector — Banani's white beds merge with their bedside tables into one hole; its
  // grey bedroom fill (propagateByColour) is the route there
  return out
}

/**
 * Per component (lab = index + 1): the pixel nearest its centroid among those at least 70 % as deep as its deepest —
 * the middle of a strip, not its end, and never outside an L- or ring-shaped region.
 */
function innerPoints(lab: Int32Array, depth: Float32Array, n: number, w: number): (Px & { depth: number })[] {
  const max = new Float32Array(n), sx = new Float64Array(n), sy = new Float64Array(n), cnt = new Float64Array(n)
  for (let i = 0; i < lab.length; i++) {
    const c = lab[i] - 1
    if (c < 0) continue
    if (depth[i] > max[c]) max[c] = depth[i]
    sx[c] += i % w
    sy[c] += Math.floor(i / w)
    cnt[c]++
  }
  const best = new Float64Array(n).fill(Infinity), at = new Int32Array(n)
  for (let i = 0; i < lab.length; i++) {
    const c = lab[i] - 1
    if (c < 0 || depth[i] < 0.7 * max[c]) continue
    const d = (i % w - sx[c] / cnt[c]) ** 2 + (Math.floor(i / w) - sy[c] / cnt[c]) ** 2
    if (d < best[c]) (best[c] = d), (at[c] = i)
  }
  return Array.from(at, (i, c) => ({ x: i % w, y: Math.floor(i / w), depth: max[c] }))
}

// ---------------------------------------------------------------- green

// plant greens are yellowish (blue well under red: lawn 95,108,53 · planter 223,235,197 · tree 116,128,104); a mint flat tint is not (210,234,204)
const isGreen = (r: number, g: number, b: number) => g >= r + 6 && g >= b + 10 && g - (r + b) / 2 >= 12 && b <= r - 8

/**
 * Green blobs (planter strips, lawns, foliage images) → balcony + green at each blob's deepest point. Clumps closer than
 * ~0.25 m merge; blobs under 0.6 m² (a pot plant, a tree dot) are dropped; a PALE green blob wider than 2.4 m is a tinted
 * flat (DMD Type B), not a planter.
 */
export function greenHints(rgb: Rgba, k: number): RoomHint[] {
  const { width: w, height: h, data } = rgb
  const notGreen = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) notGreen[i] = isGreen(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) ? 0 : 1
  const toGreen = edt(notGreen, w, h)
  const rd = Math.max(1, 0.12 * k)
  const dil = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) dil[i] = toGreen[i] <= rd ? 1 : 0
  const { lab, comps } = components(dil, w, h, true)
  const inner = innerPoints(lab, edt(dil, w, h), comps.length, w)
  const n = comps.map(() => 0), minC = comps.map(() => 0)
  for (let i = 0; i < w * h; i++) {
    const c = lab[i] - 1
    if (c >= 0 && !notGreen[i]) (n[c]++), (minC[c] += Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]))
  }
  const out: RoomHint[] = []
  comps.forEach((c, i) => {
    if (n[i] < 0.6 * k * k) return
    const pale = minC[i] / n[i] > 170
    // a tinted flat (DMD Type B) is wide, or full of furniture holes; a planter strip is a narrow solid band
    if (pale && ((2 * (inner[i].depth - rd)) / k > 2.4 || c.n / shapeOf(c, i + 1, lab, w).n < 0.85)) return
    out.push({ at: { x: inner[i].x, y: inner[i].y }, kind: 'balcony', green: true, source: 'green', what: pale ? 'green fill' : 'foliage', conf: pale ? 0.6 : 0.8, areaPx: n[i] })
  })
  return out
}

// ---------------------------------------------------------------- colour fills

const cdist = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))

/**
 * Flat floor fills: light, non-paper pixels grown into regions of one colour (±16 per channel from the seed), regions
 * ≥ 1 m² kept, then clustered by mean colour (±14). Paper, ink, tile stripes and hatching drop out by colour or size.
 */
export function colourFills(rgb: Rgba, k: number): { fills: ColourFill[]; clusters: [number, number, number][] } {
  const { width: w, height: h, data } = rgb
  const cand = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    cand[i] = mx >= 150 && (765 - r - g - b >= 40 || mx - mn >= 14) ? 1 : 0
  }
  const lab = new Int32Array(w * h)
  const stack = new Int32Array(w * h)
  const regions: { n: number; sum: [number, number, number]; px: number }[] = []
  for (let i = 0; i < w * h; i++) {
    if (!cand[i] || lab[i]) continue
    const id = regions.length + 1
    const seed = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
    const reg = { n: 0, sum: [0, 0, 0] as [number, number, number], px: i }
    let sp = 0
    stack[sp++] = i
    lab[i] = id
    while (sp) {
      const p = stack[--sp]
      reg.n++
      for (let c = 0; c < 3; c++) reg.sum[c] += data[p * 4 + c]
      const x = p % w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h || lab[q] || !cand[q]) continue
        if (Math.abs(data[q * 4] - seed[0]) > 16 || Math.abs(data[q * 4 + 1] - seed[1]) > 16 || Math.abs(data[q * 4 + 2] - seed[2]) > 16) continue
        lab[q] = id
        stack[sp++] = q
      }
    }
    regions.push(reg)
  }
  const keep = regions.map((r) => r.n >= k * k)
  for (let i = 0; i < w * h; i++) if (lab[i] && !keep[lab[i] - 1]) lab[i] = 0
  const inKept = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) if (lab[i]) inKept[i] = 1
  const inner = innerPoints(lab, edt(inKept, w, h), regions.length, w)
  const clusters: { rgb: [number, number, number]; n: number }[] = []
  const fills: ColourFill[] = []
  const order = regions.map((_, i) => i).filter((i) => keep[i]).sort((a, b) => regions[b].n - regions[a].n)
  for (const i of order) {
    const r = regions[i]
    const mean = r.sum.map((s) => Math.round(s / r.n)) as [number, number, number]
    let ci = clusters.findIndex((c) => cdist(c.rgb, mean) <= 14)
    if (ci < 0) (ci = clusters.length), clusters.push({ rgb: mean, n: 0 })
    const c = clusters[ci]
    c.rgb = c.rgb.map((v, j) => Math.round((v * c.n + mean[j] * r.n) / (c.n + r.n))) as [number, number, number]
    c.n += r.n
    fills.push({ at: { x: inner[i].x, y: inner[i].y }, areaPx: r.n, rgb: mean, cluster: ci })
  }
  return { fills, clusters: clusters.map((c) => c.rgb) }
}

/**
 * The solver's colour step. `rooms`: every room of the draft in pixel space (`poly`), with `kind` when its label was read.
 * Each room gets its dominant fill cluster (≥ 35 % of its pixels within ±18 of the cluster colour; plain paper → none).
 * A cluster with ≥ 2 labelled rooms, ≥ 2/3 of them agreeing on one kind, gives that kind to its UNLABELLED rooms.
 * Returns an array aligned with `rooms`: a RoomHint (source 'colour', at = a pixel of that fill inside the room,
 * conf = agreement × min(1, labelled / 3) × 0.6 — the weakest hint) or null.
 */
export function propagateByColour(rgb: Rgba, trace: HintTrace, rooms: { poly: Px[]; kind?: string }[]): (RoomHint | null)[] {
  const cl = trace.clusters ?? []
  const { width: w, height: h, data } = rgb
  const dom = rooms.map((r) => {
    if (!cl.length || r.poly.length < 3) return null
    const xs = r.poly.map((p) => p.x), ys = r.poly.map((p) => p.y)
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w - 1, Math.ceil(Math.max(...xs)))
    const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)))
    const step = Math.max(1, Math.round(Math.max(x1 - x0, y1 - y0) / 50))
    const mid = { x: xs.reduce((a, b) => a + b) / xs.length, y: ys.reduce((a, b) => a + b) / ys.length }
    const count = cl.map(() => 0), near: (Px | null)[] = cl.map(() => null)
    let total = 0
    for (let y = y0; y <= y1; y += step)
      for (let x = x0; x <= x1; x += step) {
        if (!pointInPolygon({ x, y }, r.poly)) continue
        total++
        const i = (y * w + x) * 4
        let best = -1, bd = 19
        cl.forEach((c, j) => {
          const d = cdist(c, [data[i], data[i + 1], data[i + 2]])
          if (d < bd) (bd = d), (best = j)
        })
        if (best < 0) continue
        count[best]++
        const nb = near[best]
        if (!nb || Math.hypot(x - mid.x, y - mid.y) < Math.hypot(nb.x - mid.x, nb.y - mid.y)) near[best] = { x, y }
      }
    const j = count.indexOf(Math.max(...count))
    return total && count[j] >= 0.35 * total ? { cluster: j, at: near[j]! } : null
  })
  const vote = new Map<number, Map<string, number>>()
  rooms.forEach((r, i) => {
    const d = dom[i]
    if (!d || !r.kind) return
    const m = vote.get(d.cluster) ?? new Map<string, number>()
    m.set(r.kind, (m.get(r.kind) ?? 0) + 1)
    vote.set(d.cluster, m)
  })
  return rooms.map((r, i) => {
    const d = dom[i]
    const m = d && !r.kind ? vote.get(d.cluster) : undefined
    if (!d || !m) return null
    const n = [...m.values()].reduce((a, b) => a + b, 0)
    const [kind, c] = [...m.entries()].sort((a, b) => b[1] - a[1])[0]
    if (n < 2 || c / n < 2 / 3) return null
    return { at: d.at, kind, source: 'colour', what: `fill ${d.cluster}`, conf: (c / n) * Math.min(1, n / 3) * 0.6 }
  })
}
