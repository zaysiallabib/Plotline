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
 * light pixels lie deep inside it. Anything else comes back as it is.
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
  if (!nLight || nLight > 0.4 * data.length) return g
  const dt = edt(light, w, h), deep = 0.03 * Math.min(w, h)
  let nDeep = 0
  for (let i = 0; i < dt.length; i++) if (dt[i] > deep) nDeep++
  if (nDeep > 0.2 * nLight) return g
  const out = new Uint8Array(data.length)
  for (let i = 0; i < out.length; i++) out[i] = 255 - data[i]
  return { width: w, height: h, data: out }
}

/**
 * Walls drawn as a light band between two thin dark outlines (bti's grey walls; their columns stay solid black): every
 * row and column is read as floor | thin dark line | fill | thin dark line | floor, the whole crossing no wider than a
 * thick wall (0.35 m at `k` px/m) and the fill darker than the floor on BOTH sides by 25 — a tile or plank floor is the
 * same tone across its joints, a window's glass is paper. The commonest such fill tone is the sheet's wall fill; its
 * crossings (outlines included) and the fill they hold where no crossing is clean (corners, T's: that tone within a wall
 * width) are painted black on a copy, so the tracer reads solid ink. null when the walls are solid already (fewer
 * outlined crossings than solid dark wall-wide ones) or nothing is outlined.
 */
export function outlinedWalls(g: Gray, k: number): Gray | null {
  const { width: w, height: h, data } = g
  const tD = 120, near = 20
  const maxW = Math.round(0.35 * k) + 2, lineMax = Math.max(3, Math.round(0.05 * k)), minSolid = Math.max(lineMax + 1, Math.round(0.1 * k))
  const hist = new Float64Array(256)
  const mark = new Uint8Array(w * h)
  let solid = 0, outlined = 0
  const fill: number[] = []
  // one pass over every row and column: T null = collect the fill tones, else mark the crossings of fill ≈ T
  const scan = (T: number) => {
    for (const horiz of [true, false]) {
      const L = horiz ? w : h, n = horiz ? h : w, step = horiz ? 1 : w
      for (let line = 0; line < n; line++) {
        const base = horiz ? line * w : line
        const at = (u: number) => (u < 0 || u >= L ? 255 : data[base + u * step])
        let ps = -1, pe = -1 // the previous dark run
        for (let u = 0; u < L; ) {
          if (data[base + u * step] > tD) {
            u++
            continue
          }
          let e = u
          while (e + 1 < L && data[base + (e + 1) * step] <= tD) e++
          if (T < 0 && e - u + 1 >= minSolid && e - u + 1 <= maxW) solid++
          if (ps >= 0 && pe - ps < lineMax && e - u < lineMax && e - ps < maxW) {
            fill.length = 0
            for (let t = pe + 1; t < u; t++) fill.push(data[base + t * step])
            fill.sort((p, q) => p - q)
            const F = fill[fill.length >> 1]
            let dark = 255
            for (let t = ps; t <= e; t++) if (t <= pe || t >= u) dark = Math.min(dark, data[base + t * step])
            const A = Math.max(at(ps - 2), at(ps - 3)), B = Math.max(at(e + 2), at(e + 3))
            if (F - dark >= 50 && F <= Math.min(A, B) - 25 && fill.filter((v) => Math.abs(v - F) <= 25).length >= 0.6 * fill.length) {
              if (T < 0) hist[F]++
              else if (Math.abs(F - T) <= near) {
                outlined++
                for (let t = ps; t <= e; t++) mark[base + t * step] = 1
              }
            }
          }
          ;(ps = u), (pe = e), (u = e + 1)
        }
      }
    }
  }
  scan(-1)
  let T = 0, best = 0
  for (let t = 0; t < 256; t++) {
    let c = 0
    for (let d = -5; d <= 5; d++) c += hist[t + d] ?? 0
    if (c > best) (best = c), (T = t)
  }
  if (!best) return null
  scan(T)
  if (outlined < Math.max(50, solid)) return null
  // the fill the clean crossings could not see (corners, T's): that tone, reached through itself within a wall width
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
  const out = new Uint8Array(data)
  for (let i = 0; i < out.length; i++) if (mark[i]) out[i] = 0
  return { width: w, height: h, data: out }
}
