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
