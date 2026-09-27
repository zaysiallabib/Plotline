/**
 * Thin-line tracker (founder's "robot line follower", wave 16): the wall stage keeps only strokes as thick as a wall,
 * so railings, parapets, glazing and light shaft / partition lines vanish and rooms stay open. From each dangling end
 * of a confirmed thick wall, follow the thinner stroke that carries on from it, straight along its line (one or two
 * right-angle turns allowed), and keep it only when it runs into another wall. Pixel space, pure.
 *
 * Guardrails against tracing furniture (founder / manager list): seeds only at dangling ends of confirmed thick walls;
 * only the railing / partition pen (clearly darker than the paper — the faint furniture / hatch hairlines are not
 * followed — and narrower than the wall it continues); a line counts only when it ends on another wall or tracked line
 * (dead ends are dropped); straight runs on the sheet's axes (curved / wobbly paths stop); no following inside fixture
 * hints (bed, table, wc, basin, stove, sink); tracked walls carry a low conf. The small-loop test (a tracked line
 * closing a face under ~3 m² with the walls: bed, wardrobe, counter) needs the wall graph — solve.ts applies it.
 */
import type { Gray, OpeningGuess, Px, WallSeg, WallTrace } from './types'

export interface TrackOpts {
  /** px per metre (for the metre-sized limits) */
  pxPerM: number
  /** "clearly darker than the paper": grey levels below the local background */
  delta?: number
  /** fixture hints (sheet px) and the radius around each where nothing is followed */
  avoid?: { at: Px; r: number }[]
  /** longest line followed, m */
  maxM?: number
  /** why each seed ended (debugging / the eval report): seed, no-stroke, too-short, furniture-zone, wobbly, dead-end, closed */
  stats?: Record<string, number>
}

const d2 = (p: Px, q: Px) => Math.hypot(p.x - q.x, p.y - q.y)

/** Distance from p to segment ab and the foot point. */
function foot(p: Px, a: Px, b: Px): { d: number; at: Px; t: number } {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2))
  const at = { x: a.x + vx * t, y: a.y + vy * t }
  return { d: d2(p, at), at, t }
}

/** Tracked thin walls (px) closing onto other walls; each piece carries conf ≤ 0.55. */
export function trackThin(gray: Gray, trace: WallTrace, o: TrackOpts): WallSeg[] {
  const { width: w, height: h } = gray
  // the pen: drawn lines clearly darker than paper (grey ≤ 255 − 55 ≈ 200); floor fills, tile grids and the faintest
  // hairlines stay out. Furniture outlines are often as dark (Btibd: 180) — the other guardrails deal with those.
  const dark = 255 - (o.delta ?? 55)
  const ink = new Uint8Array(w * h)
  for (let i = 0; i < ink.length; i++) ink[i] = gray.data[i] <= dark ? 1 : 0
  const at = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < w && yi < h ? ink[yi * w + xi] : 0
  }
  const walls = trace.walls.filter((s) => !s.mid)
  const key = (p: Px) => `${Math.round(p.x)},${Math.round(p.y)}`
  const deg = new Map<string, number>()
  for (const s of trace.walls) for (const p of [s.a, s.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1)
  const jamb = (p: Px) => trace.openings.some((op: OpeningGuess) => d2(op.a, p) < 3 || d2(op.b, p) < 3)
  const maxPx = (o.maxM ?? 8) * o.pxPerM
  const out: WallSeg[] = []
  const bump = (k: string) => o.stats && (o.stats[k] = (o.stats[k] ?? 0) + 1)
  const avoid = (p: Px) => (o.avoid ?? []).some((z) => d2(z.at, p) < z.r)

  /** the ink run across direction n through p within ±r: its centre offset and width, or null */
  const across = (p: Px, n: Px, r: number, near: number): { off: number; width: number } | null => {
    let best: { off: number; width: number } | null = null
    let s0 = NaN
    for (let s = -r; s <= r + 1; s++) {
      const on = s <= r && at(p.x + n.x * s, p.y + n.y * s)
      if (on && Number.isNaN(s0)) s0 = s
      if (!on && !Number.isNaN(s0)) {
        const c = (s0 + s - 1) / 2
        if (!best || Math.abs(c - near) < Math.abs(best.off - near)) best = { off: c, width: s - s0 }
        s0 = NaN
      }
    }
    return best
  }

  /** follow from p along unit d at lateral offset `off`; → the path's end and whether it hit a wall */
  const follow = (p0: Px, d: Px, off: number, maxW: number, seed: WallSeg, budget: number) => {
    const n = { x: -d.y, y: d.x }
    let lat = off, gap = 0, t = 0, last = 0
    const widths: number[] = []
    for (t = 2; t < budget; t++) {
      const c = { x: p0.x + d.x * t + n.x * lat, y: p0.y + d.y * t + n.y * lat }
      if (avoid(c)) return bump("furniture-zone"), null
      // ran into another wall (its body, not just its line)?
      for (const s of walls) {
        if (s === seed) continue
        const f = foot(c, s.a, s.b)
        if (f.d <= s.thicknessPx / 2 + 1.5) return { end: f.at, hit: true, len: t, widths }
      }
      for (const s of out) {
        const f = foot(c, s.a, s.b)
        if (f.d <= 2) return { end: f.at, hit: true, len: t, widths }
      }
      const run = across(c, n, Math.ceil(maxW) + 1, 0)
      if (run && Math.abs(run.off) <= 1.5 && run.width <= maxW) {
        gap = 0
        last = t
        widths.push(run.width)
        // re-centre on a full-pixel miss only (pixel rounding jitters by ½); a stroke that drifts sideways overall is
        // not straight (furniture curves, arcs)
        if (Math.abs(run.off) >= 1) lat += Math.sign(run.off) * 0.5
        if (Math.abs(lat - off) > 2 + t / 25) return bump("wobbly"), null
      } else if (++gap > 3) break
    }
    return { end: { x: p0.x + d.x * last + n.x * lat, y: p0.y + d.y * last + n.y * lat }, hit: false, len: last, widths }
  }

  for (const s of walls) {
    if (s.conf < 0.6) continue
    const L = d2(s.a, s.b)
    if (L < 0.5 * o.pxPerM) continue
    for (const [e, other] of [[s.a, s.b], [s.b, s.a]] as const) {
      if (deg.get(key(e)) !== 1 || jamb(e)) continue
      bump('seed')
      const d0 = { x: (e.x - other.x) / L, y: (e.y - other.y) / L }
      const maxW = Math.max(1.5, 0.6 * s.thicknessPx)
      const half = Math.ceil(s.thicknessPx / 2) + 2
      // the stroke carries on straight ahead, or runs past the wall's end sideways (a light exterior line the wall
      // butts into): try all three, keep every one that closes (a fork closes both ways)
      let any = false
      for (const [dir, side] of [[d0, false], [{ x: -d0.y, y: d0.x }, true], [{ x: d0.y, y: -d0.x }, true]] as const) {
        let d = dir
        let p: Px = e
        const legs: { a: Px; b: Px }[] = []
        let budget = maxPx
        let hit = false
        for (let turn = 0; turn < 3 && !hit; turn++) {
          const n = { x: -d.y, y: d.x }
          let t0 = 1, start: { off: number; width: number } | null = null
          if (side && turn === 0) {
            // sideways: a stroke along d passing the end face, within the wall's half width ahead or behind the end
            start = across({ x: p.x + d.x * 3, y: p.y + d.y * 3 }, n, half, 0)
            t0 = 2
          } else
            // ahead: step out of the wall's body, then the thin stroke leaving it anywhere across the wall's width
            for (; t0 <= s.thicknessPx + 4; t0++) {
              start = across({ x: p.x + d.x * t0, y: p.y + d.y * t0 }, n, half, 0)
              if (start && start.width <= maxW) break
            }
          if (!start || start.width > maxW) break
          const p1 = { x: p.x + d.x * (t0 - 2), y: p.y + d.y * (t0 - 2) }
          const r = follow(p1, d, start.off, maxW, s, budget)
          if (!r || r.len < 3) {
            if (r) bump('too-short')
            break
          }
          legs.push({ a: p, b: r.end })
          budget -= r.len
          hit = r.hit
          if (hit) break
          // a corner: the stroke carries on at a right angle (L-shaped railing / parapet)
          const q = r.end
          const turnTo = [{ x: -d.y, y: d.x }, { x: d.y, y: -d.x }].find((u) => {
            const run = across({ x: q.x + u.x * 3, y: q.y + u.y * 3 }, d, 2, 0)
            return run && Math.abs(run.off) <= 1.5 && run.width <= maxW
          })
          if (!turnTo) break
          p = q
          d = turnTo
        }
        if (legs.length && !hit) bump('dead-end')
        if (!hit || !legs.length) continue // a dead end is not a wall
        bump('closed')
        any = true
        const th = Math.max(1, Math.min(maxW, 2))
        for (const g of legs) if (d2(g.a, g.b) >= 2) out.push({ a: g.a, b: g.b, thicknessPx: th, conf: legs.length > 1 || side ? 0.35 : 0.45 })
      }
      if (!any) bump('no-closure')
    }
  }
  return out
}
