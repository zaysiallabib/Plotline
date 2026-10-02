/**
 * The feet-inch size reader (wave 19). A room label's size line ("13'-0\"x15'-6\"") is the input the rooms-first fit
 * needs most, and tesseract reads it badly at 6–9 px. But the line has a tiny alphabet (digits ' " - x X), a strict
 * grammar (F'-I"xF'-I", inches 0–11, feet ≤ 39) and one font per sheet. So it is read by template matching:
 *
 * 1. Each candidate line is resampled to a band of cap height H (`band`, the cap from the line's tall glyph blobs).
 * 2. `decode` = Viterbi over (column, grammar state): every column is a glyph column (template vs image, squared error)
 *    or a gap column (ink there costs). K best DISTINCT strings are kept, so the margin to the runner-up string is known.
 * 3. Templates start as a tiny stroke font (`FONT`, stroke width and width scale picked per sheet), then are re-learnt
 *    from the sheet's own glyphs — only glyphs whose digit a tesseract reading of the same line confirms (LCS of the
 *    digit strings), so the matcher never trains on its own guesses.
 * 4. A read is SURE when it fits well and either a tesseract variant gives the same value or the runner-up string is
 *    far behind. Everything else is unsure: shown to the AI montage / the user, never silently used.
 * Pure (no DOM); tested in text.test.ts, measured by the reader eval there.
 */
import { parseDims } from './text'
import type { Dims, Gray } from './types'

type Box = { x: number; y: number; w: number; h: number }
type Pt = [number, number]

const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt
  })

/** Stroke font, cap height 1, x right / y down, angles 0 = right, 90 = down. Key[0] is the character ('1b' = 1 with a foot). */
const FONT: Record<string, { w: number; strokes: Pt[][] }> = {
  '0': { w: 0.56, strokes: [arc(0.28, 0.5, 0.28, 0.5, 0, 360, 32)] },
  '1': { w: 0.32, strokes: [[[0.3, 0], [0.3, 1]], [[0, 0.2], [0.3, 0]]] },
  '1b': { w: 0.5, strokes: [[[0.26, 0], [0.26, 1]], [[0.02, 0.18], [0.26, 0]], [[0.02, 1], [0.5, 1]]] },
  '2': { w: 0.56, strokes: [[...arc(0.28, 0.27, 0.27, 0.27, 190, 390), [0, 1]], [[0, 1], [0.56, 1]]] },
  '3': { w: 0.54, strokes: [arc(0.26, 0.25, 0.25, 0.25, 200, 450), arc(0.26, 0.73, 0.28, 0.27, 270, 520)] },
  '4': { w: 0.6, strokes: [[[0.44, 0], [0, 0.72], [0.6, 0.72]], [[0.44, 0], [0.44, 1]]] },
  '5': { w: 0.54, strokes: [[[0.52, 0], [0.08, 0], [0.04, 0.44]], [[0.04, 0.44], ...arc(0.26, 0.68, 0.28, 0.32, 230, 510)]] },
  '6': { w: 0.56, strokes: [arc(0.3, 0.5, 0.28, 0.5, 300, 180, 12), arc(0.29, 0.68, 0.27, 0.32, 0, 360, 24)] },
  '7': { w: 0.56, strokes: [[[0, 0], [0.56, 0], [0.18, 1]]] },
  '8': { w: 0.56, strokes: [arc(0.28, 0.25, 0.24, 0.25, 0, 360, 24), arc(0.28, 0.73, 0.28, 0.27, 0, 360, 24)] },
  '9': { w: 0.56, strokes: [arc(0.26, 0.5, 0.28, 0.5, 120, 0, 12), arc(0.27, 0.32, 0.27, 0.32, 0, 360, 24)] },
  "'": { w: 0.08, strokes: [[[0.04, 0], [0.04, 0.3]]] },
  '"': { w: 0.28, strokes: [[[0.04, 0], [0.04, 0.3]], [[0.24, 0], [0.24, 0.3]]] },
  '-': { w: 0.32, strokes: [[[0, 0.56], [0.32, 0.56]]] },
  x: { w: 0.48, strokes: [[[0, 0.3], [0.48, 1]], [[0.48, 0.3], [0, 1]]] },
  xX: { w: 0.58, strokes: [[[0, 0], [0.58, 1]], [[0.58, 0], [0, 1]]] }, // a capital X reads as x too
}

/** A glyph template: `rows` × w darkness (0 paper … 1 ink). */
export interface Tpl {
  w: number
  d: Float32Array
}
export type Font = Record<string, Tpl>

/** Band geometry: cap height H px with P blank rows above and below. */
export const H = 20
const P = 3
const ROWS = H + 2 * P

function segDist(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b[0] - a[0]
  const vy = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / (vx * vx + vy * vy || 1e-9)))
  return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t)
}

/** The stroke font at stroke width `sw` and width scale `ws` (both in cap heights), anti-aliased. */
export function renderFont(sw: number, ws: number): Font {
  const out: Font = {}
  for (const [k, f] of Object.entries(FONT)) {
    const w = Math.max(1, Math.round((f.w * ws + sw) * H))
    const d = new Float32Array(ROWS * w)
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < w; x++) {
        const gx = (x + 0.5) / H - sw / 2
        const gy = (y + 0.5 - P) / H
        let dm = Infinity
        // stroke centres sit sw/2 inside the cap, so the INK spans rows P..P+H like the glyph blobs the band is cut to
        const at = (p: Pt): Pt => [p[0] * ws, sw / 2 + p[1] * (1 - sw)]
        for (const st of f.strokes) for (let i = 0; i + 1 < st.length; i++) dm = Math.min(dm, segDist(gx, gy, at(st[i]), at(st[i + 1])))
        d[y * w + x] = Math.max(0, Math.min(1, (sw / 2 - dm) * H + 0.5))
      }
    out[k] = { w, d }
  }
  return out
}

// ---------------------------------------------------------------- the grammar: F'-I" x F'-I" as a small automaton
type Arc = { to: number; chars: string }
/** One side, states o..o+7: start · feet 1–3 (may go on) · feet done · ' · - · inch done · inch "1" (may be 10/11) · " */
function side(o: number, next: number): Arc[][] {
  const x = next >= 0 ? [{ to: next, chars: 'x' }] : []
  return [
    [{ to: o + 1, chars: '123' }, { to: o + 2, chars: '456789' }],
    [{ to: o + 2, chars: '0123456789' }, { to: o + 3, chars: "'" }, ...x],
    [{ to: o + 3, chars: "'" }, ...x],
    [{ to: o + 4, chars: '-' }, ...x],
    [{ to: o + 5, chars: '023456789' }, { to: o + 6, chars: '1' }],
    [{ to: o + 7, chars: '"' }],
    [{ to: o + 7, chars: '"' }, { to: o + 5, chars: '01' }],
    x,
  ]
}
const ARCS: Arc[][] = [...side(0, 8), ...side(8, -1)]
/** side B done after its ", or bare feet / feet' ("15X18'-3\"" prints side A bare; "X12" is rarer but read) */
const ACCEPT = [15, 9, 10, 11]
const AFTER_X = 8

export interface Decoded {
  text: string
  cost: number
  /** cost of the best path that reads a DIFFERENT string, minus this one's (Infinity when there is none) */
  margin: number
  runnerUp?: string
  /** mean squared residual per band pixel */
  fit: number
  glyphs: { k: string; x: number; dy: number }[]
}

/**
 * Best grammar-valid reading of a band (D: ROWS × W darkness). Gaps between glyphs are at most `maxGap` columns,
 * except around the x (sizes are often printed "3'-0\"X   5'-5\"").
 */
export function decode(D: Float32Array, W: number, T: Font, maxGap = Math.round(0.35 * H), K = 3): Decoded | null {
  const blank = new Float64Array(W + 1)
  for (let x = 0; x < W; x++) {
    let s = 0
    for (let y = 0; y < ROWS; y++) s += D[y * W + x] ** 2
    blank[x + 1] = blank[x] + s
  }
  // each template's squared error at every column, best of three vertical shifts
  const cost = new Map<string, { c: Float64Array; dy: Int8Array }>()
  for (const [k, t] of Object.entries(T)) {
    const c = new Float64Array(W).fill(Infinity)
    const dyA = new Int8Array(W)
    for (let x0 = 0; x0 + t.w <= W; x0++)
      for (let dy = -1; dy <= 1; dy++) {
        let sum = 0
        for (let y = 0; y < ROWS; y++) {
          const yy = y + dy
          const row = yy * W + x0
          const inside = yy >= 0 && yy < ROWS
          for (let x = 0; x < t.w; x++) {
            const e = t.d[y * t.w + x] - (inside ? D[row + x] : 0)
            sum += e * e
          }
        }
        if (sum < c[x0]) {
          c[x0] = sum
          dyA[x0] = dy
        }
      }
    cost.set(k, { c, dy: dyA })
  }
  const byChar: Record<string, string[]> = {}
  for (const k of Object.keys(T)) (byChar[k[0]] ??= []).push(k)
  type E = { cost: number; text: string; prev: E | null; k: string; x: number; dy: number }
  const NS = ARCS.length
  // cell[x][state]: up to K entries with distinct texts whose last glyph ends at column x (exclusive)
  const cell: E[][][] = Array.from({ length: W + 1 }, () => Array.from({ length: NS }, () => []))
  // pref[x][state]: the K best (distinct texts) of cell[≤ x][state] keyed by cost − blank[end] — an unbounded gap in O(1)
  const pref: E[][][] = Array.from({ length: W + 1 }, () => Array.from({ length: NS }, () => []))
  /** keep `list` the K cheapest distinct texts; a candidate worse than a full list's last is dropped before it is built */
  const push = (list: E[], cost: number, text: () => string, make: (text: string) => E) => {
    if (list.length === K && cost >= list[K - 1].cost) return
    const t = text()
    const i = list.findIndex((o) => o.text === t)
    if (i >= 0) {
      if (list[i].cost <= cost) return
      list.splice(i, 1)
    }
    list.push(make(t))
    list.sort((a, b) => a.cost - b.cost)
    if (list.length > K) list.length = K
  }
  for (let xe = 1; xe <= W; xe++) {
    const xf = xe - 1 // column xf is final now: fold it into the prefix lists
    for (let st = 0; st < NS; st++) {
      const list = xf > 0 ? [...pref[xf - 1][st]] : []
      for (const e of cell[xf][st])
        push(
          list,
          e.cost - blank[xf],
          () => e.text,
          (text) => ({ ...e, text, cost: e.cost - blank[xf], prev: e }),
        )
      pref[xf][st] = list
    }
    for (let st = 0; st < NS; st++)
      for (const a of ARCS[st])
        for (const ch of a.chars)
          for (const k of byChar[ch] ?? []) {
            const x0 = xe - T[k].w
            if (x0 < 0) continue
            const g = cost.get(k)!
            const gc = g.c[x0]
            if (!isFinite(gc)) continue
            const dy = g.dy[x0]
            const out = cell[xe][a.to]
            if (st === 0) {
              const c0 = blank[x0] + gc
              push(out, c0, () => ch, (text) => ({ cost: c0, text, prev: null, k, x: x0, dy }))
            } else if (ch === 'x' || st === AFTER_X)
              // any gap before / after the x: pref entries carry their own end in `prev`
              for (const p of pref[x0][st]) {
                const c1 = p.cost + blank[x0] + gc
                push(out, c1, () => p.text + ch, (text) => ({ cost: c1, text, prev: p.prev, k, x: x0, dy }))
              }
            else
              for (let xp = Math.max(1, x0 - maxGap); xp <= x0; xp++)
                for (const p of cell[xp][st]) {
                  const c2 = p.cost + blank[x0] - blank[xp] + gc
                  push(out, c2, () => p.text + ch, (text) => ({ cost: c2, text, prev: p, k, x: x0, dy }))
                }
          }
  }
  const fin: E[] = []
  for (let xe = 1; xe <= W; xe++)
    for (const st of ACCEPT)
      for (const e of cell[xe][st]) {
        const c = e.cost + blank[W] - blank[xe]
        push(
          fin,
          c,
          () => e.text,
          () => ({ ...e, cost: c }),
        )
      }
  if (!fin.length) return null
  const best = fin[0]
  const glyphs: Decoded['glyphs'] = []
  for (let e: E | null = best; e; e = e.prev) glyphs.unshift({ k: e.k, x: e.x, dy: e.dy })
  return { text: best.text, cost: best.cost, margin: fin.length > 1 ? fin[1].cost - best.cost : Infinity, runnerUp: fin[1]?.text, fit: best.cost / (W * ROWS), glyphs }
}

/** The line's cap band from its glyph blobs: median top / bottom of the tall ones (marks, dots, stray rules don't move it). */
export function capBand(glyphs: Box[], box: Box): { y0: number; y1: number } {
  const inside = glyphs.filter((b) => b.x >= box.x - 1 && b.x + b.w <= box.x + box.w + 1 && b.y >= box.y - 1 && b.y + b.h <= box.y + box.h + 1)
  const mh = Math.max(0, ...inside.map((b) => b.h))
  const tall = inside.filter((b) => b.h >= 0.75 * mh)
  const med = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1]
  return tall.length ? { y0: med(tall.map((b) => b.y)), y1: med(tall.map((b) => b.y + b.h)) } : { y0: box.y, y1: box.y + box.h }
}

/**
 * The line as a darkness band: cap rows → rows P..P+H, the same scale across, 1.5 line heights of margin left and right
 * (a glyph the line finder missed at an end is still read). Darkness from the crop's own paper and ink levels.
 */
export function band(g: Gray, box: Box, cap: { y0: number; y1: number }): { D: Float32Array; W: number } | null {
  const x0 = Math.floor(box.x - 1.5 * box.h)
  const x1 = Math.ceil(box.x + box.w + 1.5 * box.h)
  const y0 = Math.floor(Math.min(box.y, cap.y0) - 3)
  const y1 = Math.ceil(Math.max(box.y + box.h, cap.y1) + 3)
  const cw = x1 - x0
  const ch = y1 - y0
  const v = new Float32Array(cw * ch)
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const sx = x0 + x
      const sy = y0 + y
      v[y * cw + x] = sx >= 0 && sy >= 0 && sx < g.width && sy < g.height ? g.data[sy * g.width + sx] : 255
    }
  const sorted = Float32Array.from(v).sort()
  const ink = sorted[Math.floor(0.03 * (sorted.length - 1))]
  const paper = sorted[Math.floor(0.7 * (sorted.length - 1))]
  if (paper - ink < 30) return null
  const dk = (x: number, y: number) => Math.max(0, Math.min(1, (paper - v[y * cw + x]) / (paper - ink)))
  // sub-pixel cap edges: the blob box's first / last row is only partly covered — by its ink relative to an inner row's
  const r0 = cap.y0 - y0
  const r1 = cap.y1 - y0 - 1
  const prof = (r: number) => {
    let s = 0
    for (let x = Math.max(0, Math.round(box.x - x0)); x < Math.min(cw, Math.round(box.x + box.w - x0)); x++) s += dk(x, r)
    return s
  }
  const inner = Array.from({ length: Math.max(0, r1 - r0 - 1) }, (_, k) => prof(r0 + 1 + k)).sort((a, b) => a - b)
  const ref = inner.length ? inner[inner.length >> 1] : 0
  const cover = (r: number) => (ref > 0 ? Math.max(0, Math.min(1, prof(r) / ref)) : 1)
  const capTop = r0 + 1 - cover(r0)
  const capH = r1 + cover(r1) - capTop
  if (capH < 3) return null
  const s = H / capH
  const W = Math.round(cw * s)
  const D = new Float32Array(ROWS * W)
  for (let y = 0; y < ROWS; y++) {
    const fy = Math.max(0, Math.min(ch - 1, capTop + (y - P + 0.5) / s - 0.5))
    const ya = Math.floor(fy)
    const yb = Math.min(ch - 1, ya + 1)
    const ty = fy - ya
    for (let x = 0; x < W; x++) {
      const fx = Math.max(0, Math.min(cw - 1, (x + 0.5) / s - 0.5))
      const xa = Math.floor(fx)
      const xb = Math.min(cw - 1, xa + 1)
      const tx = fx - xa
      D[y * W + x] = (dk(xa, ya) * (1 - tx) + dk(xb, ya) * tx) * (1 - ty) + (dk(xa, yb) * (1 - tx) + dk(xb, yb) * tx) * ty
    }
  }
  return { D, W }
}

/** New templates: each glyph's mean over its aligned instances (at least `min`); the rest stay as they were. */
export function learn(T: Font, from: { D: Float32Array; W: number; glyphs: Decoded['glyphs'] }[], min = 2): Font {
  const acc: Record<string, { sum: Float32Array; n: number }> = {}
  for (const { D, W, glyphs } of from)
    for (const g of glyphs) {
      const t = T[g.k]
      const a = (acc[g.k] ??= { sum: new Float32Array(t.d.length), n: 0 })
      for (let y = 0; y < ROWS; y++) {
        const yy = y + g.dy
        if (yy < 0 || yy >= ROWS) continue
        for (let x = 0; x < t.w; x++) a.sum[y * t.w + x] += D[yy * W + g.x + x]
      }
      a.n++
    }
  const out: Font = {}
  for (const k of Object.keys(T)) out[k] = acc[k] && acc[k].n >= min ? { w: T[k].w, d: acc[k].sum.map((v) => v / acc[k].n) } : T[k]
  return out
}

/** Positions in `a` matched by a longest common subsequence with `b`. */
export function lcsMatches(a: string, b: string): number[] {
  const n = a.length
  const m = b.length
  const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: number[] = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      out.push(i)
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) i++
    else j++
  }
  return out
}

/**
 * The glyphs of a decoded line that tesseract confirms: digits on an LCS of the two digit strings (when it covers ≥ 60 %
 * of them), plus the marks of a line confirmed that well. Null when nothing is confirmed.
 */
export function confirmed(d: Decoded, tess: string[]): Decoded['glyphs'] | null {
  const di = d.glyphs.flatMap((g, i) => (/\d/.test(g.k[0]) ? [i] : []))
  const ds = di.map((i) => d.glyphs[i].k[0]).join('')
  const ok = new Set<number>()
  for (const t of tess) {
    const m = lcsMatches(ds, t.replace(/\D/g, ''))
    if (m.length >= 0.6 * ds.length) m.forEach((k) => ok.add(di[k]))
  }
  if (!ok.size) return null
  const line = ok.size >= 0.6 * ds.length
  return d.glyphs.filter((g, i) => ok.has(i) || (line && !/\d/.test(g.k[0])))
}

export interface SizeRead {
  /** canonical text, e.g. 13'-0"x15'-6" */
  text: string
  dims: Dims
  /** margin to the runner-up string (squared-error units of a H = 20 band) */
  margin: number
  fit: number
  /** a tesseract variant read the same value */
  agree: boolean
  /** safe to use without asking: fits, and agreed or far ahead of the runner-up */
  sure: boolean
}

/** Knobs of the sure rule (measured on the five units, wave 19). */
export const SIZE_RULE = { maxFit: 0.04, sureMargin: 6, iterations: 3 }

const INCH = 0.0254
const sameDims = (a: Dims, b: Dims) => Math.abs(a.aM - b.aM) < INCH / 2 && Math.abs(a.bM - b.bM) < INCH / 2

/**
 * Read every candidate line as a size. `clean` = the glyph-only raster, `glyphs` its blobs, `tess[i]` = tesseract's
 * readings of line i (digit-whitelist variants). Null where the line reads as no size at all.
 */
export function readSizes(clean: Gray, glyphs: Box[], lines: { box: Box; tess: string[] }[]): (SizeRead | null)[] {
  const bands = lines.map((l) => band(clean, l.box, capBand(glyphs, l.box)))
  const run = (T: Font, only?: boolean[]) => bands.map((b, i) => (b && (!only || only[i]) ? decode(b.D, b.W, T) : null))
  // the stroke font that fits the size-looking lines best (tesseract saw digits and a mark or an x)
  const sizeish = lines.map((l) => l.tess.some((t) => /\d.*['"xX].*\d/.test(t)))
  let generic: Font | null = null
  let bestFit = Infinity
  for (const sw of [0.1, 0.14, 0.18, 0.22])
    for (const ws of [0.7, 0.8, 0.9, 1]) {
      const T = renderFont(sw, ws)
      const fits = run(T, sizeish).flatMap((r) => (r ? [r.fit] : []))
      const mean = fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : Infinity
      if (mean < bestFit || !generic) {
        bestFit = mean
        generic = T
      }
    }
  let T = generic!
  let reads = run(T)
  for (let it = 0; it < SIZE_RULE.iterations; it++) {
    const train = reads.flatMap((r, i) => {
      const g = r && parseDims(r.text) ? confirmed(r, lines[i].tess) : null
      return g ? [{ ...bands[i]!, glyphs: g }] : []
    })
    T = learn(generic!, train)
    reads = run(T)
  }
  return reads.map((r, i) => {
    const dims = r ? parseDims(r.text) : null
    if (!r || !dims) return null
    const agree = lines[i].tess.some((t) => {
      const e = parseDims(t)
      return !!e && sameDims(e, dims)
    })
    // a reading with no foot / inch mark at all ("84x71") is as likely a name line forced through the grammar
    const sure = r.fit <= SIZE_RULE.maxFit && /['"]/.test(r.text) && (agree || r.margin >= SIZE_RULE.sureMargin)
    return { text: r.text, dims, margin: r.margin, fit: r.fit, agree, sure }
  })
}
