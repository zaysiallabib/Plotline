/**
 * The founder's wall tracker (wave 18): a wall is a straight band of ink exactly as thick as it is drawn.
 *
 * On a plan drawn on the sheet's axes (every Dhaka plan so far), a horizontal wall is a run of ink whose CROSS-SECTION —
 * the vertical ink run through any of its pixels — is the same short run column after column: that run IS the wall's
 * thickness, its middle IS the centre line. So: for every column, every vertical ink run of a wall's width marks its
 * middle pixel as a "horizontal centre" carrying that width; runs of centre pixels along a row are horizontal walls,
 * straight by construction, their thickness the median width along them. Vertical walls the same way with rows and
 * columns swapped. Where a crossing wall or a column widens the cross-section the centre mark drops out, but the row
 * stays inked: the wall runs on through it (founder rule 4) as one wall. A block as long as it is thick (a column, a
 * filled shaft corner) is no wall.
 *
 * Angled walls, arcs and anything not on the axes are not found here — the skeleton path (walls.ts) still traces
 * those, and traceWalls keeps its pieces where no band covers them. Pixel space, pure.
 */
import type { Gray, Px, WallSeg } from './types'

export interface BandOpts {
  /** the thinnest cross-section that is a wall, px (text strokes and pen lines are thinner) */
  minThPx: number
  /** the thickest, px (deeper ink is a fill, a block, foliage) */
  maxThPx: number
  /** the shortest band that is a wall, px */
  minLenPx: number
}

interface Run {
  v: number
  u0: number
  u1: number
  /** cross-section widths of the centre pixels in the run */
  ths: number[]
}

/**
 * Bands of one orientation. `horiz`: walls along x (cross-sections along y). The mask is read through `at(u, v)` with
 * u along the wall, v across it, so one routine serves both orientations.
 */
function bandsAlong(gray: Gray, ink: Uint8Array, horiz: boolean, o: BandOpts): WallSeg[] {
  const { width: w, height: h, data } = gray
  const U = horiz ? w : h, V = horiz ? h : w
  const idx = (u: number, v: number) => (horiz ? v * w + u : u * w + v)
  const at = (u: number, v: number) => ink[idx(u, v)]
  // centre marks: mark[v * U + u] = cross-section width when (u, v) is the middle of a wall-wide run across. The width
  // is sub-pixel: the run's two edge pixels count by how much of the way from the paper beside them to the wall's own
  // grey they are (an anti-aliased or upsampled edge is half covered), the pixels between count one each
  const mark = new Float32Array(U * V)
  for (let u = 0; u < U; u++) {
    let v0 = -1
    for (let v = 0; v <= V; v++) {
      const on = v < V && at(u, v)
      if (on && v0 < 0) v0 = v
      if (!on && v0 >= 0) {
        const L = v - v0
        if (L >= o.minThPx && L <= o.maxThPx) {
          // the width: the run's inner pixels count one each, its two edge pixels by how far they are from the paper
          // beside them towards the wall's own grey (an anti-aliased or upsampled edge is part covered). Pixels outside
          // the run never count: on a scan the JPEG halo beside a dark edge is darker than paper without being wall.
          let dark = 255
          for (let t = v0; t < v; t++) dark = Math.min(dark, data[idx(u, t)])
          const g = (t: number) => (t < 0 || t >= V ? 255 : data[idx(u, t)])
          const paperLo = Math.max(g(v0 - 2), g(v0 - 3), dark + 1), paperHi = Math.max(g(v + 1), g(v + 2), dark + 1)
          const cover = (t: number, paper: number) => Math.max(0, Math.min(1, (paper - g(t)) / (paper - dark)))
          const width = L === 1 ? cover(v0, Math.max(paperLo, paperHi)) : L - 2 + cover(v0, paperLo) + cover(v - 1, paperHi)
          const c = v0 + (L - 1) / 2
          mark[Math.floor(c) * U + u] = width
          if (L % 2 === 0) mark[Math.ceil(c) * U + u] = width
        }
        v0 = -1
      }
    }
  }
  // runs of centre marks along each row v; a gap is bridged when the row stays inked across it and is no longer than
  // the widest wall (a crossing wall's body, a column — a longer thick stretch is the next wall, with its own centre),
  // or when it is a pixel or two (anti-aliasing)
  const runs: Run[] = []
  for (let v = 0; v < V; v++) {
    let u0 = -1, last = -1, ths: number[] = []
    const close = () => {
      if (u0 >= 0 && last - u0 + 1 >= o.minLenPx) runs.push({ v, u0, u1: last, ths })
      ;(u0 = -1), (last = -1), (ths = [])
    }
    for (let u = 0; u < U; u++) {
      const m = mark[v * U + u]
      if (m) {
        if (u0 < 0) u0 = u
        else if (u - last > 1) {
          // a gap: bridged only when inked all the way and short enough
          let inked = true
          for (let t = last + 1; t < u && inked; t++) if (!at(t, v)) inked = false
          if (!(u - last - 1 <= 2 || (inked && u - last - 1 <= o.maxThPx))) {
            close()
            u0 = u
          }
        }
        last = u
        ths.push(m)
      }
    }
    close()
  }
  // rows within 2 px whose runs overlap are one band (an even-width wall marks two rows; a slightly tilted scan jitters)
  runs.sort((p, q) => p.v - q.v || p.u0 - q.u0)
  const used = new Uint8Array(runs.length)
  const out: WallSeg[] = []
  for (let i = 0; i < runs.length; i++) {
    if (used[i]) continue
    const band = [runs[i]]
    used[i] = 1
    for (let j = i + 1; j < runs.length && runs[j].v - band[band.length - 1].v <= 2; j++) {
      if (used[j]) continue
      const r = runs[j]
      if (band.some((s) => Math.min(s.u1, r.u1) - Math.max(s.u0, r.u0) >= 0.5 * Math.min(s.u1 - s.u0, r.u1 - r.u0))) (used[j] = 1), band.push(r)
    }
    const len = band.reduce((t, r) => t + (r.u1 - r.u0 + 1), 0)
    const v = band.reduce((t, r) => t + r.v * (r.u1 - r.u0 + 1), 0) / len
    let u0 = Math.min(...band.map((r) => r.u0)), u1 = Math.max(...band.map((r) => r.u1))
    const ths = band.flatMap((r) => r.ths).sort((p, q) => p - q)
    const th = ths[ths.length >> 1]
    // a block as long as it is thick is a column or a corner, not a wall
    if (u1 - u0 + 1 < Math.max(o.minLenPx, 1.5 * th)) continue
    // the ends run on through the ink along the centre line (a corner block, the crossing wall's body) up to one wall
    // width: the band reaches the far face of the wall it meets — the graph stage nodes it at that wall's centre
    const vc = Math.round(v)
    let u0x = u0, u1x = u1
    while (u0x > 0 && u0 - u0x < o.maxThPx && at(u0x - 1, vc)) u0x--
    while (u1x < U - 1 && u1x - u1 < o.maxThPx && at(u1x + 1, vc)) u1x++
    ;(u0 = u0x), (u1 = u1x)
    const a: Px = horiz ? { x: u0, y: v } : { x: v, y: u0 }, b: Px = horiz ? { x: u1, y: v } : { x: v, y: u1 }
    out.push({ a, b, thicknessPx: th, conf: Math.min(1, (u1 - u0 + 1) / (4 * th)) })
  }
  return out
}

/** Every axis-aligned wall band in the ink mask, both orientations, exact thickness. */
export function bandWalls(gray: Gray, ink: Uint8Array, o: BandOpts): WallSeg[] {
  return [...bandsAlong(gray, ink, true, o), ...bandsAlong(gray, ink, false, o)]
}

/** Does a band cover this segment: at least `share` of its length within a band's body (± 2 px)? */
export function coveredByBands(s: { a: Px; b: Px; mid?: Px }, bands: WallSeg[], share = 0.7): boolean {
  if (s.mid) return false
  const n = 10
  let inside = 0
  for (let t = 0; t < n; t++) {
    const p = { x: s.a.x + ((s.b.x - s.a.x) * (t + 0.5)) / n, y: s.a.y + ((s.b.y - s.a.y) * (t + 0.5)) / n }
    if (
      bands.some((b) => {
        const horiz = Math.abs(b.b.x - b.a.x) >= Math.abs(b.b.y - b.a.y)
        const along = horiz ? p.x : p.y, across = horiz ? p.y : p.x
        const a0 = Math.min(horiz ? b.a.x : b.a.y, horiz ? b.b.x : b.b.y), a1 = Math.max(horiz ? b.a.x : b.a.y, horiz ? b.b.x : b.b.y)
        const c = horiz ? b.a.y : b.a.x
        return along >= a0 - 1 && along <= a1 + 1 && Math.abs(across - c) <= b.thicknessPx / 2 + 2
      })
    )
      inside++
  }
  return inside >= share * n
}
