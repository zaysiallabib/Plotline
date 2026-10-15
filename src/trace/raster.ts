/** Raster primitives for walls.ts: threshold, exact distance transform, thinning. Pure, typed arrays only. */
import type { Gray } from './types'

/** Otsu's threshold over the grey histogram (the grey that best splits ink from paper). */
export function otsu(g: Gray): number {
  const h = new Float64Array(256)
  for (let i = 0; i < g.data.length; i++) h[g.data[i]]++
  const n = g.data.length
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * h[t]
  let wB = 0, sB = 0, best = 0, bestT = 128
  for (let t = 0; t < 256; t++) {
    wB += h[t]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sB += t * h[t]
    const mB = sB / wB, mF = (sum - sB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > best) (best = v), (bestT = t)
  }
  return bestT
}

/** 1 where grey ≤ t. */
export function threshold(g: Gray, t: number): Uint8Array {
  const m = new Uint8Array(g.data.length)
  for (let i = 0; i < m.length; i++) m[i] = g.data[i] <= t ? 1 : 0
  return m
}

/**
 * 1 where a pixel is at least `delta` darker than the lightest pixel within 3 px (its local paper or floor fill):
 * thin light-grey lines (door arcs, window frames) on white or on a grey floor fill, whatever their absolute grey.
 */
export function lineInk(g: Gray, delta: number, r = 3): Uint8Array {
  const { width: w, height: h, data } = g
  const rowMax = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (data[y * w + k] > m) m = data[y * w + k]
      rowMax[y * w + x] = m
    }
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (rowMax[k * w + x] > m) m = rowMax[k * w + x]
      out[y * w + x] = data[y * w + x] <= m - delta ? 1 : 0
    }
  return out
}

/**
 * Exact Euclidean distance transform (Felzenszwalb & Huttenlocher): for every pixel with mask = 1, the distance to the
 * nearest mask = 0 pixel (pixel centres). Mask-0 pixels get 0. Image border counts as mask 0.
 */
export function edt(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20
  const n = Math.max(w, h) + 2
  const f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1)
  const v = new Int32Array(n)
  const tmp = new Float64Array(w * h)
  const pass = (len: number) => {
    // f[0..len) → d[0..len); positions -1 and len are implicit zeros (the border)
    let k = 0
    v[0] = -1
    f[len] = 0 // unused slot guard
    z[0] = -INF
    z[1] = INF
    const fv = (q: number) => (q < 0 || q >= len ? 0 : f[q])
    for (let q = 0; q <= len; q++) {
      const fq = fv(q)
      if (fq >= INF) continue
      let s = (fq + q * q - (fv(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (fq + q * q - (fv(v[k]) + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + fv(v[k])
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? INF : 0
    pass(h)
    for (let y = 0; y < h; y++) tmp[y * w + x] = d[y]
  }
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = tmp[y * w + x]
    pass(w)
    for (let x = 0; x < w; x++) out[y * w + x] = Math.sqrt(d[x])
  }
  return out
}

/** Zhang–Suen thinning in place (mask 1 = foreground) → one-pixel-wide 8-connected skeleton. Border pixels stay 0. */
export function thin(m: Uint8Array, w: number, h: number): void {
  // work only on the foreground's pixel list; it shrinks every pass
  let pts: number[] = []
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (m[y * w + x]) pts.push(y * w + x)
  for (let x = 0; x < w; x++) (m[x] = 0), (m[(h - 1) * w + x] = 0)
  for (let y = 0; y < h; y++) (m[y * w] = 0), (m[y * w + w - 1] = 0)
  const del: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (const i of pts) {
        if (!m[i]) continue
        const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1]
        const p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1]
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
        if (b < 2 || b > 6) continue
        const a =
          (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
          (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0)
        if (a !== 1) continue
        if (step === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue
        del.push(i)
      }
      for (const i of del) m[i] = 0
      if (del.length) changed = true
    }
    pts = pts.filter((i) => m[i])
  }
}

/**
 * White line work on a dark page (bti La Montana: white walls, text and furniture on a dark grey sheet) → the luminance
 * turned over, so everything after it sees dark ink on light paper. A dark page = median grey under 110 whose light
 * pixels are a minority and thin — a white panel on a dark page (a plan printed on a card) is not line work: most of its
 * light pixels lie deep inside it. A plan printed on a dark page as a light panel (Palm Spring's grey card, Azmary's navy,
 * Jahan Lodge's stripes) keeps its tones and gets the page made paper instead (paperPage). Anything else comes back as it is.
 */
export function normalPolarity(g: Gray): Gray {
  const { width: w, height: h, data } = g
  const hist = new Float64Array(256)
  for (let i = 0; i < data.length; i++) hist[data[i]]++
  let med = 0
  for (let n = hist[0]; n < data.length / 2; ) n += hist[++med]
  if (med >= 110) return g
  const light = new Uint8Array(data.length)
  let nLight = 0
  for (let i = 0; i < data.length; i++) if (data[i] > med + 60) (light[i] = 1), nLight++
  if (!nLight) return g
  const paper = paperPage(g, light)
  if (paper) return paper
  if (nLight > 0.4 * data.length) return g
  const dt = edt(light, w, h), deep = 0.03 * Math.min(w, h)
  let nDeep = 0
  for (let i = 0; i < dt.length; i++) if (dt[i] > deep) nDeep++
  if (nDeep > 0.2 * nLight) return g
  const out = new Uint8Array(data.length)
  for (let i = 0; i < out.length; i++) out[i] = 255 - data[i]
  return { width: w, height: h, data: out }
}

/** 4-connected: the pixels of `m` reached from `seeds` */
function reach(m: Uint8Array, w: number, seeds: number[]): Uint8Array {
  const r = new Uint8Array(m.length), st = seeds.filter((i) => m[i])
  for (const i of st) r[i] = 1
  while (st.length) {
    const p = st.pop()!, x = p % w
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < m.length && m[q] && !r[q]) (r[q] = 1), st.push(q)
  }
  return r
}

/**
 * A plan printed as a light panel on a dark page: its biggest light piece fills ≥ 0.3 of its box (line work's ≈ 0.1) →
 * the page made paper — outside that piece and all it holds (what the border reaches around it), the commonest tone ± 25,
 * reached from the border through that tone, painted white. null when the light is no panel.
 */
function paperPage(g: Gray, light: Uint8Array): Gray | null {
  const { width: w, height: h, data } = g
  const seen = new Uint8Array(data.length)
  let best = 0, share = 0, seed = 0
  for (let s = 0; s < data.length; s++) {
    if (!light[s] || seen[s]) continue
    const st = [s]
    seen[s] = 1
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p - x) / w
      n++
      ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) if (q >= 0 && q < light.length && light[q] && !seen[q]) (seen[q] = 1), st.push(q)
    }
    if (n > best) (best = n), (seed = s), (share = n / ((x1 - x0 + 1) * (y1 - y0 + 1)))
  }
  if (share < 0.3) return null
  const open = reach(light, w, [seed]).map((v) => 1 - v)
  const rim: number[] = []
  for (let x = 0; x < w; x++) rim.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) rim.push(y * w, y * w + w - 1)
  const outside = reach(open, w, rim)
  const hist = new Float64Array(256)
  for (let i = 0; i < data.length; i++) if (outside[i]) hist[data[i]]++
  const P = hist.indexOf(Math.max(...hist))
  // (reached through that tone only: a wall on the panel's edge keeps the plan's own greys from the page's)
  const page = reach(outside.map((v, i) => (v && Math.abs(data[i] - P) <= 25 ? 1 : 0)), w, rim)
  const out = new Uint8Array(data)
  for (let i = 0; i < data.length; i++) if (page[i]) out[i] = 255
  return { width: w, height: h, data: out }
}

/** per pixel of `m`: the length of its run of 1s along x (`horiz`) or y (0 off the mask) */
function runLengths(m: Uint8Array, w: number, h: number, horiz: boolean): Uint16Array {
  const r = new Uint16Array(w * h)
  const L = horiz ? w : h, n = horiz ? h : w, step = horiz ? 1 : w
  for (let line = 0; line < n; line++) {
    const base = horiz ? line * w : line
    for (let u = 0; u < L; ) {
      let e = u
      while (e < L && m[base + e * step]) e++
      for (let q = u; q < e; q++) r[base + q * step] = Math.min(65535, e - u)
      u = Math.max(e, u + 1)
    }
  }
  return r
}

/**
 * Walls that are not solid ink: a BAND of wall thickness between two thin outlines, whatever its fill — bti's grey
 * (darker than the floor on both sides by 25; their columns stay solid black) or paper (Assure's and CAD's hollow walls).
 * Every row and column is read as floor | thin line | fill | thin line | floor (a line: 40 darker than the lightest pixel
 * beside it, so a 1 px grey outline counts): the whole crossing no wider than a thick wall (0.35 m at `k` px/m), the fill
 * at least 0.07 m (a window's panes are closer), even and 50 lighter than the lines, no hatch. The commonest fill tone of
 * the commoner kind is the sheet's wall fill; with a paper fill only the sheet's commonest crossing widths count (a sofa's,
 * a rug's, a letter's are spread thin). Its crossings, the paper they close in at corners and T's (thinner than a wall,
 * under 2 m, touching them; a grey fill: that tone within a wall width) — kept where they join a band ≥ 1 m long, also
 * through a column — are painted black on a copy, so the tracer reads solid ink, with `halfPx` = half the commonest
 * crossing (the wall stage's own width guess reads the thin lines on such a sheet). null when the sheet's long wall bands
 * are not mostly drawn this way (the long outlined ones under twice the long solid ones) or nothing is outlined.
 */
export function outlinedWalls(g: Gray, k: number): (Gray & { halfPx: number }) | null {
  const { width: w, height: h, data } = g
  const tD = 120, near = 20
  const maxW = Math.round(0.35 * k) + 2, lineMax = Math.max(3, Math.round(0.05 * k)), minSolid = Math.max(lineMax + 1, Math.round(0.1 * k))
  const minGap = Math.max(2, Math.round(0.07 * k))
  const hatch = hatchMask(g, k, tD)
  // (a line: 40 darker than the lightest pixel beside it — a grey 1 px outline too; solid: dark ink a wall wide)
  const li = lineInk(g, 40, 1)
  const dk = threshold(g, tD), hl = runLengths(dk, w, h, true), vl = runLengths(dk, w, h, false)
  const solid = dk.map((v, i) => (v && ((hl[i] >= minSolid && hl[i] <= maxW) || (vl[i] >= minSolid && vl[i] <= maxW)) ? 1 : 0))
  const hist = [new Float64Array(256), new Float64Array(256)] // fill darker than the floor | paper-like
  const mark = new Uint8Array(w * h)
  const fill: number[] = [], runs: number[] = [], found: number[] = [] // (crossings of the wall fill: base, step, from, to)
  // one pass over every row and column: T < 0 = collect the fill tones, else mark the
  // crossings of kind `cls` and fill ≈ T
  const scan = (cls: number, T: number) => {
    for (const horiz of [true, false]) {
      const L = horiz ? w : h, n = horiz ? h : w, step = horiz ? 1 : w
      for (let line = 0; line < n; line++) {
        const base = horiz ? line * w : line
        const at = (u: number) => (u < 0 || u >= L ? 255 : data[base + u * step])
        // the line's runs of line ink, then each pair of neighbours as a crossing
        runs.length = 0
        for (let u = 0; u < L; u++) {
          if (!li[base + u * step]) continue
          let e = u
          while (e + 1 < L && li[base + (e + 1) * step]) e++
          runs.push(u, e)
          u = e
        }
        const gapAt = (j: number) => (j >= 2 && j < runs.length ? runs[j] - runs[j - 1] - 1 : NaN)
        for (let j = 2; j < runs.length; j += 2) {
          const ps = runs[j - 2], pe = runs[j - 1], u = runs[j], e = runs[j + 1], gap = u - pe - 1
          // a grid (tiles, planks, a window's panes): three crossings in a row the same — texture, never a wall (a wall
          // beside one parallel line is two)
          const eq = (i: number) => Math.abs(gapAt(i) - gapAt(i + 2)) <= 1 && runs[i + 1] - runs[i] < lineMax
          const grid = (eq(j - 2) && eq(j - 4)) || (eq(j - 2) && eq(j)) || (eq(j) && eq(j + 2))
          if (!grid && pe - ps < lineMax && e - u < lineMax && e - ps < maxW && gap >= minGap && !hatch?.[base + ps * step] && !hatch?.[base + e * step]) {
            fill.length = 0
            for (let t = pe + 1; t < u; t++) fill.push(data[base + t * step])
            fill.sort((p, q) => p - q)
            const F = fill[fill.length >> 1]
            let dark = 255
            for (let t = ps; t <= e; t++) if (t <= pe || t >= u) dark = Math.min(dark, data[base + t * step])
            const A = Math.max(at(ps - 2), at(ps - 3)), B = Math.max(at(e + 2), at(e + 3))
            if (F - dark >= 50 && fill.filter((v) => Math.abs(v - F) <= 25).length >= 0.6 * fill.length) {
              const c = F <= Math.min(A, B) - 25 ? 0 : 1
              if (T < 0) hist[c][F]++
              else if (c === cls && Math.abs(F - T) <= near) found.push(base, step, ps, e)
            }
          }
        }
      }
    }
  }
  scan(-1, -1)
  let cls = 0, T = 0, best = 0
  for (const c of [0, 1])
    for (let t = 0; t < 256; t++) {
      let n = 0
      for (let d = -5; d <= 5; d++) n += hist[c][t + d] ?? 0
      if (n > best) (best = n), (cls = c), (T = t)
    }
  if (!best) return null
  scan(cls, T)
  // paper between two lines: only the sheet's wall thicknesses — crossing widths the commonest (≥ 15 % of the top, ± 1 px);
  // a sofa's, a rug's, a letter's widths are spread thin (a grey fill is the wall's own already)
  const wh = new Float64Array(maxW + 3)
  for (let i = 0; i < found.length; i += 4) wh[found[i + 3] - found[i + 2] + 1]++
  const sm = (x: number) => (wh[x - 1] ?? 0) + wh[x] + (wh[x + 1] ?? 0)
  let top = 0
  for (let x = 1; x <= maxW; x++) top = Math.max(top, sm(x))
  const good = new Uint8Array(maxW + 3)
  for (let x = 1; x <= maxW; x++) if (sm(x) >= 0.15 * top && sm(x) >= sm(x - 1) && sm(x) >= sm(x + 1)) good[x - 1] = good[x] = good[x + 1] = 1
  const widths: number[] = []
  for (let i = 0; i < found.length; i += 4) {
    const [base, step, a, b] = [found[i], found[i + 1], found[i + 2], found[i + 3]]
    if (cls === 1 && !good[b - a + 1]) continue
    widths.push(b - a + 1)
    for (let t = a; t <= b; t++) mark[base + t * step] = 1
  }
  // (pixels on a straight run ≥ 1 m one way, at most a wall thick the other)
  const long = (m: Uint8Array) => {
    const hl = runLengths(m, w, h, true), vl = runLengths(m, w, h, false)
    const seeds: number[] = []
    for (let i = 0; i < m.length; i++) if (m[i] && ((vl[i] >= k && hl[i] <= maxW) || (hl[i] >= k && vl[i] <= maxW))) seeds.push(i)
    return seeds
  }
  const seeds = long(mark)
  if (seeds.length < Math.max(0.3 * k * k, 2 * long(solid).length)) return null
  // a grey fill the clean crossings could not see (corners, T's): that tone, reached through itself within a wall width
  if (cls === 0) {
    let q: number[] = []
    for (let i = 0; i < mark.length; i++) if (mark[i]) q.push(i)
    for (let d = 1; d <= maxW && q.length; d++) {
      const nq: number[] = []
      for (const i of q)
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (j < 0 || j >= mark.length || mark[j] || Math.abs((j % w) - (i % w)) > 1) continue
          if (data[j] <= tD || Math.abs(data[j] - T) > near) continue
          ;(mark[j] = 1), nq.push(j)
        }
      q = nq
    }
  }
  // the paper the bands close in at corners and T's (and where a crossing was not clean): thinner than a wall, under 2 m
  // long, touching them, walled round
  const seen = new Uint8Array(w * h)
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || mark[s] || data[s] <= tD) continue
    const st = [s], px: number[] = []
    seen[s] = 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, touch = 0, big = false
    while (st.length) {
      const p = st.pop()!, x = p % w, y = (p - x) / w
      if (!big) px.push(p)
      ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
      if (Math.min(x1 - x0, y1 - y0) >= maxW || Math.max(x1 - x0, y1 - y0) >= 2 * k || x === 0 || y === 0 || x === w - 1 || y === h - 1) big = true
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue
        if (mark[q]) touch++
        else if (!seen[q] && data[q] > tD) (seen[q] = 1), st.push(q)
      }
    }
    if (!big && touch >= 2) for (const p of px) mark[p] = 1
  }
  // (the bands joined to a long one, also through a column or a solid wall. ponytail: a sofa's or a bed's hollow frame ≥ 1 m
  // long standing free is read as wall too — drop free-standing closed rings under FURNITURE.maxSide if one shows up)
  const keep = reach(mark.map((v, i) => v | solid[i]), w, long(mark))
  const out = new Uint8Array(data)
  for (let i = 0; i < out.length; i++) if (keep[i] && mark[i]) out[i] = 0
  widths.sort((p, q) => p - q)
  return { width: w, height: h, data: out, halfPx: widths[widths.length >> 1] / 2 }
}

/** furniture painted out before walls and rooms (founder, 2026-10-15), metres */
export const FURNITURE = {
  /** a piece fits in this square (a bed with its side tables, an L-sofa, a table with its chairs) */
  maxSide: 3,
  /** …and is wider than a wall across (a window's frame in a wall gap is not furniture) */
  minSide: 0.35,
  /** its ink and what it closes in fill at least this share of its box (a chair, a bed outline, a solid sofa; an open door arc does not) */
  closed: 0.5,
  /** …and holds no wall: a straight band at least this long (m) and wallMinM … wallMaxM thick (a wall stub with a basin hung on it) */
  wallLen: 1,
  wallMinM: 0.08,
  wallMaxM: 0.35,
}

/**
 * Founder rules 2 + 3 (2026-10-15): furniture is not building. Ink (grey ≤ t) in a piece of its own — touching no wall,
 * no other line — that fits in FURNITURE.maxSide both ways, is wider across than a wall and is closed (solid, or an
 * outline around paper: a bed, a sofa, a table, a chair, a WC, a stamp box) and holds no wall's band → its pixels, what it
 * closes in and a pixel round: the wall tracer and the thin-line faces never see them — never a wall, a column or a room.
 * The sheet itself is not changed (the fitted rooms read it as drawn). A wall touching it (a bed against its wall) keeps it.
 * null when there is none.
 */
export function furnitureMask(g: Gray, k: number, t: number): Uint8Array | null {
  const { width: w, height: h, data } = g
  const lab = new Int32Array(w * h)
  const stack: number[] = []
  const maxS = FURNITURE.maxSide * k, minS = FURNITURE.minSide * k
  // (ink runs along x and along y through every pixel: a wall's band is long one way, wall-thick the other)
  const hl = new Uint16Array(w * h), vl = new Uint16Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; ) {
      let e = x
      while (e < w && data[y * w + e] <= t) e++
      for (let q = x; q < e; q++) hl[y * w + q] = Math.min(65535, e - x)
      x = Math.max(e, x + 1)
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; ) {
      let e = y
      while (e < h && data[e * w + x] <= t) e++
      for (let q = y; q < e; q++) vl[q * w + x] = Math.min(65535, e - y)
      y = Math.max(e, y + 1)
    }
  const L = FURNITURE.wallLen * k, t0 = FURNITURE.wallMinM * k, t1 = FURNITURE.wallMaxM * k
  const band = (p: number) => (hl[p] >= L && vl[p] >= t0 && vl[p] <= t1) || (vl[p] >= L && hl[p] >= t0 && hl[p] <= t1)
  const out = new Uint8Array(w * h)
  let painted = 0
  for (let s = 0; s < w * h; s++) {
    if (lab[s] || data[s] > t) continue
    const id = s + 1
    let x0 = w, y0 = h, x1 = -1, y1 = -1, n = 0, big = false
    const px: number[] = []
    lab[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!, x = p % w, y = (p - x) / w
      n++
      if (!big) px.push(p)
      ;(x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
      if (x1 - x0 > maxS || y1 - y0 > maxS) (big = true), (px.length = 0)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const q = yy * w + xx
          if (!lab[q] && data[q] <= t) (lab[q] = id), stack.push(q)
        }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1
    if (big || Math.min(bw, bh) < minS || x0 === 0 || y0 === 0 || x1 === w - 1 || y1 === h - 1) continue
    // closed: the box's paper the outside cannot reach (flood from the box's rim, around the piece's own ink)
    const reach = new Uint8Array(bw * bh)
    const q: number[] = []
    for (let x = 0; x < bw; x++) for (const y of [0, bh - 1]) q.push(y * bw + x)
    for (let y = 0; y < bh; y++) for (const x of [0, bw - 1]) q.push(y * bw + x)
    let outside = 0
    while (q.length) {
      const i = q.pop()!
      if (reach[i] || lab[(y0 + Math.floor(i / bw)) * w + x0 + (i % bw)] === id) continue
      reach[i] = 1
      outside++
      const x = i % bw, y = (i - x) / bw
      if (x > 0) q.push(i - 1)
      if (x < bw - 1) q.push(i + 1)
      if (y > 0) q.push(i - bw)
      if (y < bh - 1) q.push(i + bw)
    }
    if (bw * bh - outside < FURNITURE.closed * bw * bh) continue
    let nb = 0
    for (const p of px) if (band(p)) nb++
    if (nb >= L * t0) continue
    // (the piece and the paper it closes in: its anti-aliased rim too, one pixel round)
    for (const p of px) {
      const x = p % w, y = (p - x) / w
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h) out[(y + dy) * w + x + dx] = 1
    }
    for (let i = 0; i < bw * bh; i++) if (!reach[i]) out[(y0 + Math.floor(i / bw)) * w + x0 + (i % bw)] = 1
    painted += n
  }
  return painted ? out : null
}

/** hatch (founder rule 4, 2026-10-15), metres */
export const HATCH = {
  /** a hatch line is at most this thick */
  lineM: 0.05,
  /** …and this many of them cross a scan within windowM (a hollow wall's two outlines or a window's three panes do not) */
  lines: 4,
  windowM: 0.4,
}

/**
 * Founder rule 4 (2026-10-15): hatch is texture, never a wall — thin lines close together (shower tiles, a wardrobe's
 * hangers, a floor's planks): ink pixels of a line at most HATCH.lineM thick, running across a row (column) that crosses at
 * least HATCH.lines such lines within HATCH.windowM. On a dark page it runs after normalPolarity (it reads `g` as given).
 * null when there is none.
 */
export function hatchMask(g: Gray, k: number, t: number): Uint8Array | null {
  const { width: w, height: h, data } = g
  const thin = Math.max(3, HATCH.lineM * k), half = Math.max(3, Math.round((HATCH.windowM * k) / 2))
  const out = new Uint8Array(w * h)
  let n = 0
  // (one orientation: lines u = rows (horiz) or columns, each a scan along v; `across` = the ink run through a pixel across the scan)
  const pass = (horiz: boolean) => {
    const U = horiz ? h : w, V = horiz ? w : h
    const at = (u: number, v: number) => (horiz ? u * w + v : v * w + u)
    const across = (u: number, v: number) => {
      let a = u, b = u
      while (a > 0 && data[at(a - 1, v)] <= t && u - a < 3 * thin) a--
      while (b < U - 1 && data[at(b + 1, v)] <= t && b - u < 3 * thin) b++
      return b - a + 1
    }
    const starts: number[] = [], ends: number[] = []
    for (let u = 0; u < U; u++) {
      starts.length = ends.length = 0
      for (let v = 0; v < V; ) {
        if (data[at(u, v)] > t) {
          v++
          continue
        }
        let e = v
        while (e < V && data[at(u, e)] <= t) e++
        // a thin run whose ink runs on across the scan (a line crossing it, not a dash along it)
        if (e - v <= thin && across(u, (v + e - 1) >> 1) >= 2 * (e - v)) starts.push(v), ends.push(e)
        v = e
      }
      for (let i = 0, lo = 0, hi = 0; i < starts.length; i++) {
        const c = (starts[i] + ends[i]) / 2
        while (starts[lo] < c - half) lo++
        while (hi < starts.length && starts[hi] <= c + half) hi++
        if (hi - lo < HATCH.lines) continue
        for (let v = starts[i]; v < ends[i]; v++) if (!out[at(u, v)]) (out[at(u, v)] = 1), n++
      }
    }
  }
  pass(true)
  pass(false)
  return n ? out : null
}
