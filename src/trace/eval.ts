/**
 * Eval harness for walls.ts: score a WallTrace against a hand-traced Unit whose `planImage` maps metres to the same
 * pixels (px = originPx + m × pxPerM). Pure. Scoring is restricted to the unit's own bounds + margin, since a sheet
 * holds other flats and the core.
 */
import type { Unit } from '../core/types'
import { traceWalls, type WallOpts } from './walls'
import { edt, otsu, threshold } from './raster'
import type { Gray, Px, WallSeg, WallTrace } from './types'

export interface EvalOpts {
  /** centre lines within this distance (m) … */
  distM?: number
  /** … and this many degrees apart count as the same wall */
  angDeg?: number
  /** region = unit bounds grown by this (m) */
  marginM?: number
  /** an opening guess within this (m, centre to centre) of a hand-traced opening finds it */
  openM?: number
  /** lay the hand-traced walls onto the drawing first (registerTruth); default true */
  register?: boolean
}

export interface EvalReport {
  unitId: string
  /** traced wall length inside the region that lies on a hand-traced wall (openings included) */
  precision: number
  /** hand-traced solid wall length (wall minus its openings) covered by a traced wall */
  recall: number
  /** the same at twice the distance tolerance: the hand traces follow printed sizes and drift locally from the drawn lines */
  precisionLoose: number
  recallLoose: number
  tracedM: number
  truthM: number
  /** mean distance (m) from a matched traced segment's end to the nearest hand-traced vertex or jamb (ends within 0.5 m) */
  endpointErrM: number
  /** share of matched traced ends that lie within 0.5 m of a vertex / jamb */
  endpointNear: number
  /** mean |traced − true| thickness (m) over covered samples, and the signed mean */
  thicknessErrM: number
  thicknessBiasM: number
  openingRecall: number
  /** opening guesses in the region that sit on a hand-traced opening */
  openingPrecision: number
  /** matched openings whose kind guess equals the hand-traced kind */
  openingKindAcc: number
  truthOpenings: number
  ms?: number
  /** see inkCeiling: the recall an ink-based tracer could reach at all */
  inkCeiling?: number
  /** hand-traced solid wall samples no traced wall covers (px), and traced samples on no hand-traced wall — for overlays */
  missed: Px[]
  extra: Px[]
  /** hand-traced openings no guess found (centre px, kind, distance to the nearest guess in m) */
  missedOpenings: (Px & { kind: string; nearestM: number })[]
}

interface Line {
  a: Px
  b: Px
  thM: number
}

/** A traced wall as straight pieces (an arc → 8 chords). */
export function segPieces(s: WallSeg): { a: Px; b: Px }[] {
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
  for (let k = 1; k <= 8; k++) {
    const t = a0 + (sweep * k) / 8
    const p = k === 8 ? s.b : { x: c.x + c.r * Math.cos(t), y: c.y + c.r * Math.sin(t) }
    out.push({ a: prev, b: p })
    prev = p
  }
  return out
}

function circle3(a: Px, b: Px, c: Px): { x: number; y: number; r: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { x, y, r: Math.hypot(a.x - x, a.y - y) }
}

/** Distance from p to segment ab (only when p projects onto it, within `slack` px past the ends), else Infinity. */
function segDist(p: Px, a: Px, b: Px, slack: number): number {
  const vx = b.x - a.x, vy = b.y - a.y
  const L = Math.hypot(vx, vy)
  if (L < 1e-9) return Infinity
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L
  if (t < -slack || t > L + slack) return Infinity
  return Math.abs((p.x - a.x) * vy - (p.y - a.y) * vx) / L
}

const angleOk = (a: Px, b: Px, c: Px, d: Px, cosTol: number) => {
  const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - c.x, vy = d.y - c.y
  return Math.abs(ux * vx + uy * vy) >= cosTol * Math.hypot(ux, uy) * Math.hypot(vx, vy)
}

/**
 * metres → image px for a unit: px = c + (m − mid) · k · (1 + e), per axis (mid = the unit's bounds centre). The
 * hand-traced units follow the PRINTED dimensions, which drift a few % from the drawn lines; `registerTruth` finds
 * the per-axis stretch + shift that lays the hand-traced walls onto the drawing's thick ink (not onto any trace).
 */
export interface TruthXf {
  mid: Px
  c: Px
  k: number
  ex: number
  ey: number
}

export function planXf(unit: Unit): TruthXf {
  const pi = unit.planImage
  if (!pi) throw new Error(`unit ${unit.id} has no planImage`)
  const xs = unit.vertices.map((v) => v.x), ys = unit.vertices.map((v) => v.y)
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  return { mid, c: { x: pi.originPx.x + mid.x * pi.pxPerM, y: pi.originPx.y + mid.y * pi.pxPerM }, k: pi.pxPerM, ex: 0, ey: 0 }
}

const apply = (t: TruthXf, x: number, y: number): Px => ({ x: t.c.x + (x - t.mid.x) * t.k * (1 + t.ex), y: t.c.y + (y - t.mid.y) * t.k * (1 + t.ey) })

/** Distance (px) from every pixel to the nearest thick ink (strokes ≥ ~3 px: walls, not text). */
function distToThickInk(gray: Gray): Float32Array {
  const { width: w, height: h } = gray
  const dt = edt(threshold(gray, otsu(gray)), w, h)
  const notThick = new Uint8Array(w * h)
  for (let i = 0; i < notThick.length; i++) notThick[i] = dt[i] >= 1.9 ? 0 : 1
  return edt(notThick, w, h)
}

/** Solid-wall (wall minus openings) sample points of a unit, metres, every 0.1 m. */
function solidSamples(unit: Unit): Px[] {
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  const S: Px[] = []
  for (const wl of unit.walls) {
    const a = V.get(wl.a)!, b = V.get(wl.b)!
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const cut = wl.openings.map((o) => [o.offsetM, o.offsetM + o.widthM])
    for (let m = 0.05; m < L; m += 0.1) if (!cut.some(([p, q]) => m > p && m < q)) S.push({ x: a.x + ((b.x - a.x) * m) / L, y: a.y + ((b.y - a.y) * m) / L })
  }
  return S
}

/**
 * The best recall any ink-based tracer can reach: the share of hand-traced solid wall that has thick ink within `distM`.
 * The rest are walls the drawing does not draw as walls (open-plan boundaries, railings, glass, lines the tracer added).
 */
export function inkCeiling(gray: Gray, unit: Unit, xf: TruthXf, distM = 0.15): number {
  const toInk = distToThickInk(gray)
  const S = solidSamples(unit)
  let hit = 0
  for (const p of S) {
    const q = apply(xf, p.x, p.y)
    const xi = Math.round(q.x), yi = Math.round(q.y)
    if (xi >= 0 && yi >= 0 && xi < gray.width && yi < gray.height && toInk[yi * gray.width + xi] <= distM * xf.k) hit++
  }
  return S.length ? hit / S.length : 0
}

/** Best per-axis stretch (±6 %) and shift (±0.4 m) of the hand-traced walls onto the image's thick ink. */
export function registerTruth(gray: Gray, unit: Unit): TruthXf {
  const { width: w, height: h } = gray
  const toInk = distToThickInk(gray)
  const t0 = planXf(unit)
  const cap = 0.3 * t0.k
  const S = solidSamples(unit)
  const cost = (t: TruthXf) => {
    let s = 0
    for (const p of S) {
      const q = apply(t, p.x, p.y)
      const xi = Math.round(q.x), yi = Math.round(q.y)
      const d = xi < 0 || yi < 0 || xi >= w || yi >= h ? cap : Math.min(cap, toInk[yi * w + xi])
      s += d * d
    }
    return s
  }
  let best = { ...t0 }, bc = cost(best)
  const span = Math.round(0.4 * t0.k)
  for (let it = 0; it < 3; it++)
    for (const axis of ['x', 'y'] as const) {
      const cur = { ...best }
      for (let e = -0.06; e <= 0.0601; e += 0.005)
        for (let d = -span; d <= span; d++) {
          const t = axis === 'x' ? { ...cur, ex: e, c: { x: t0.c.x + d, y: cur.c.y } } : { ...cur, ey: e, c: { x: cur.c.x, y: t0.c.y + d } }
          const c = cost(t)
          if (c < bc) (bc = c), (best = t)
        }
    }
  return best
}

export function evalTrace(trace: WallTrace, unit: Unit, opts: EvalOpts = {}, xf: TruthXf = planXf(unit)): EvalReport {
  const distM = opts.distM ?? 0.15, cosTol = Math.cos(((opts.angDeg ?? 10) * Math.PI) / 180)
  const margin = opts.marginM ?? 0.3, openM = opts.openM ?? 0.3
  const k = xf.k
  const toPx = (x: number, y: number): Px => apply(xf, x, y)
  const V = new Map(unit.vertices.map((v) => [v.id, toPx(v.x, v.y)]))
  const xs = unit.vertices.map((v) => v.x), ys = unit.vertices.map((v) => v.y)
  const r0 = toPx(Math.min(...xs) - margin, Math.min(...ys) - margin), r1 = toPx(Math.max(...xs) + margin, Math.max(...ys) + margin)
  const inRegion = (p: Px) => p.x >= r0.x && p.x <= r1.x && p.y >= r0.y && p.y <= r1.y
  const tol = distM * k, tol2 = 2 * tol, step = 0.05 * k

  const truth: Line[] = []
  const solid: Line[] = []
  const jambs: Px[] = [...V.values()]
  const openings: { c: Px; kind: string }[] = []
  const VM = new Map(unit.vertices.map((v) => [v.id, v]))
  for (const wl of unit.walls) {
    const a = V.get(wl.a)!, b = V.get(wl.b)!
    truth.push({ a, b, thM: wl.thicknessM })
    const am = VM.get(wl.a)!, bm = VM.get(wl.b)!
    const L = Math.hypot(bm.x - am.x, bm.y - am.y) * k
    const at = (m: number): Px => toPx(am.x + ((bm.x - am.x) * m * k) / L, am.y + ((bm.y - am.y) * m * k) / L)
    let from = 0
    for (const op of [...wl.openings].sort((p, q) => p.offsetM - q.offsetM)) {
      if (op.offsetM > from) solid.push({ a: at(from), b: at(op.offsetM), thM: wl.thicknessM })
      jambs.push(at(op.offsetM), at(op.offsetM + op.widthM))
      openings.push({ c: at(op.offsetM + op.widthM / 2), kind: op.kind })
      from = Math.max(from, op.offsetM + op.widthM)
    }
    if (L / k > from) solid.push({ a: at(from), b, thM: wl.thicknessM })
  }

  const traced = trace.walls.flatMap((s) => segPieces(s).map((p) => ({ ...p, thM: s.thicknessPx / k, src: s })))

  // precision: traced samples in the region lying on a true wall
  let tIn = 0, tHit = 0, tHit2 = 0
  const missed: Px[] = [], extra: Px[] = []
  const segHits = new Map<WallSeg, { n: number; hit: number }>()
  for (const t of traced) {
    const L = Math.hypot(t.b.x - t.a.x, t.b.y - t.a.y)
    const n = Math.max(1, Math.round(L / step))
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n
      const p = { x: t.a.x + (t.b.x - t.a.x) * f, y: t.a.y + (t.b.y - t.a.y) * f }
      if (!inRegion(p)) continue
      tIn++
      let d = Infinity
      for (const g of truth) if (angleOk(t.a, t.b, g.a, g.b, cosTol)) d = Math.min(d, segDist(p, g.a, g.b, tol))
      const hit = d <= tol
      if (hit) tHit++
      else extra.push(p)
      if (d <= tol2) tHit2++
      const sh = segHits.get(t.src) ?? { n: 0, hit: 0 }
      sh.n++
      if (hit) sh.hit++
      segHits.set(t.src, sh)
    }
  }

  // recall + thickness: true solid samples covered by a traced wall
  let gIn = 0, gHit = 0, gHit2 = 0, thAbs = 0, thSig = 0
  for (const g of solid) {
    const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
    const n = Math.max(1, Math.round(L / step))
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n
      const p = { x: g.a.x + (g.b.x - g.a.x) * f, y: g.a.y + (g.b.y - g.a.y) * f }
      gIn++
      let best: (typeof traced)[number] | null = null, bd = Infinity
      for (const t of traced) {
        const d = segDist(p, t.a, t.b, 0)
        if (d < bd && d <= tol2 && angleOk(t.a, t.b, g.a, g.b, cosTol)) (bd = d), (best = t)
      }
      if (best) gHit2++
      if (!best || bd > tol) missed.push(p)
      if (best && bd <= tol) {
        gHit++
        thAbs += Math.abs(best.thM - g.thM)
        thSig += best.thM - g.thM
      }
    }
  }

  // endpoints of mostly-matched traced walls
  let eSum = 0, eNear = 0, eAll = 0
  for (const s of trace.walls) {
    const sh = segHits.get(s)
    if (!sh || sh.hit < sh.n * 0.5) continue
    for (const p of [s.a, s.b]) {
      if (!inRegion(p)) continue
      eAll++
      let d = Infinity
      for (const j of jambs) d = Math.min(d, Math.hypot(p.x - j.x, p.y - j.y))
      if (d <= 0.5 * k) (eSum += d / k), eNear++
    }
  }

  // openings
  const guesses = trace.openings.map((o) => ({ c: { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }, kind: o.kind })).filter((o) => inRegion(o.c))
  let oHit = 0, oKind = 0
  const missedOpenings: EvalReport['missedOpenings'] = []
  for (const t of openings) {
    let best: (typeof guesses)[number] | null = null, bd = Infinity
    for (const gss of guesses) {
      const d = Math.hypot(gss.c.x - t.c.x, gss.c.y - t.c.y)
      if (d < bd) (bd = d), (best = gss)
    }
    if (best && bd <= openM * k) {
      oHit++
      if (best.kind === t.kind) oKind++
    } else missedOpenings.push({ ...t.c, kind: t.kind, nearestM: bd / k })
  }
  const gHitOpen = guesses.filter((gss) => openings.some((t) => Math.hypot(gss.c.x - t.c.x, gss.c.y - t.c.y) <= openM * k)).length

  return {
    unitId: unit.id,
    precision: tIn ? tHit / tIn : 0,
    recall: gIn ? gHit / gIn : 0,
    precisionLoose: tIn ? tHit2 / tIn : 0,
    recallLoose: gIn ? gHit2 / gIn : 0,
    tracedM: (tIn * step) / k,
    truthM: (gIn * step) / k,
    endpointErrM: eNear ? eSum / eNear : NaN,
    endpointNear: eAll ? eNear / eAll : 0,
    thicknessErrM: gHit ? thAbs / gHit : NaN,
    thicknessBiasM: gHit ? thSig / gHit : NaN,
    openingRecall: openings.length ? oHit / openings.length : 0,
    openingPrecision: guesses.length ? gHitOpen / guesses.length : 0,
    openingKindAcc: oHit ? oKind / oHit : 0,
    truthOpenings: openings.length,
    missed,
    extra,
    missedOpenings,
  }
}

/** Trace + time + score one unit on its own plan image. */
export function scoreUnit(gray: Gray, unit: Unit, opts: WallOpts = {}, evalOpts: EvalOpts = {}): { report: EvalReport; trace: WallTrace; xf: TruthXf } {
  const t0 = performance.now()
  const trace = traceWalls(gray, opts)
  const ms = performance.now() - t0
  const xf = evalOpts.register === false ? planXf(unit) : registerTruth(gray, unit)
  return { report: { ...evalTrace(trace, unit, evalOpts, xf), ms, inkCeiling: inkCeiling(gray, unit, xf, evalOpts.distM) }, trace, xf }
}

/** The hand-traced walls in image px (for overlays). */
export function truthLines(unit: Unit, xf: TruthXf = planXf(unit)): { a: Px; b: Px }[] {
  const V = new Map(unit.vertices.map((v) => [v.id, apply(xf, v.x, v.y)]))
  return unit.walls.map((w) => ({ a: V.get(w.a)!, b: V.get(w.b)! }))
}

/** One row per unit, fixed width, for test logs and reports. */
export function formatReports(rows: EvalReport[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5)
  const m = (x: number) => (Number.isNaN(x) ? '   - ' : x.toFixed(3).padStart(6))
  const head = 'unit                  prec recall  prec2 recall2  ceil endErr  near  thErr thBias opRec opPrec  kind    ms'
  return [
    head,
    ...rows.map(
      (r) =>
        `${r.unitId.padEnd(20)} ${pct(r.precision)}  ${pct(r.recall)}  ${pct(r.precisionLoose)}  ${pct(r.recallLoose)} ${pct(r.inkCeiling ?? NaN)} ${m(r.endpointErrM)} ${pct(r.endpointNear)} ${m(r.thicknessErrM)} ${m(r.thicknessBiasM)} ${pct(r.openingRecall)} ${pct(r.openingPrecision)} ${pct(r.openingKindAcc)} ${String(Math.round(r.ms ?? 0)).padStart(5)}`,
    ),
  ].join('\n')
}
