/**
 * End-to-end eval of the solver (wave 16): a draft Unit against a hand-traced Unit on the same sheet. Both are mapped to
 * sheet pixels through their own planImage (px = originPx + m × pxPerM), so rooms are matched on the drawing and the
 * draft's scale error shows up in its areas, not in the matching. Pure.
 */
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Room, Unit } from '../core'
import { edt, lineInk, threshold } from './raster'
import { applyXf, evalTrace, type TruthXf } from './eval'
import { inkThreshold, segPieces, wallHalfWidth } from './walls'
import type { AutoTraceResult, Gray, Px, WallSeg, WallTrace } from './types'

export interface SolveReport {
  unitId: string
  truthRooms: number
  draftRooms: number
  /** truth rooms with a draft room at IoU ≥ 0.6 (one-to-one) */
  matched: number
  /** mean |draft − truth| / truth area over matched rooms (draft areas in the draft's own metres: scale error included) */
  areaErr: number
  /** draft px/m ÷ truth px/m − 1 */
  scaleErr: number
  scaleFrom: string
  /** matched rooms whose draft kind equals the truth kind */
  kindOk: number
  /** share of the truth flat's floor covered by some draft room / draft floor outside every truth room */
  coverage: number
  spill: number
  review: number
  reviewByKind: Record<string, number>
  ms: number
  /** truth openings with a draft opening centre within 0.3 m (one-to-one), of `truthOpenings` (in the draft's area) */
  openingsFound: number
  truthOpenings: number
  /** found openings whose kind (door / window / slider / passage) matches */
  openingKindOk: number
  /** draft openings on no truth opening */
  openingsExtra: number
  /** each unmatched truth room and why (no face / merged / split / shifted) */
  missed: string[]
  /** the unmatched truth rooms' ids (for diagnoseMisses) */
  missedIds: string[]
  /** the DRAFT's walls vs the hand trace (eval.ts evalTrace, centre lines within 0.15 m): share of hand-traced wall length the draft covers / share of draft wall length on a hand-traced wall. Rooms can match while walls are missing — the founder reads the walls (session 15) */
  wallRecall?: number
  wallPrecision?: number
}

/** The draft's walls as sheet-pixel segments (for evalTrace). */
export function draftWallSegs(u: Unit): WallSeg[] {
  const k = u.planImage!.pxPerM, o = u.planImage!.originPx
  const V = new Map(u.vertices.map((v) => [v.id, { x: o.x + v.x * k, y: o.y + v.y * k }]))
  return u.walls.map((w) => ({ a: V.get(w.a)!, b: V.get(w.b)!, thicknessPx: w.thicknessM * k, conf: 1, ...(w.heightM < 3 ? { heightM: w.heightM } : {}) }))
}

/** Adds the draft's wall recall / precision against the hand trace laid onto the drawing (`xf` = eval.ts registerTruth). */
export function withWallScore(row: SolveReport, res: AutoTraceResult, truth: Unit, xf: TruthXf): SolveReport {
  const r = evalTrace({ walls: draftWallSegs(res.unit), openings: [] }, truth, {}, xf)
  return { ...row, wallRecall: r.recall, wallPrecision: r.precision }
}

/** Opening centres in sheet px, with kind. */
function pxOpenings(u: Unit): { c: Px; kind: string }[] {
  const pi = u.planImage!
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  return u.walls.flatMap((w) => {
    const a = V.get(w.a)!, b = V.get(w.b)!
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return w.openings.map((o) => {
      const t = (o.offsetM + o.widthM / 2) / L
      return { c: { x: pi.originPx.x + (a.x + (b.x - a.x) * t) * pi.pxPerM, y: pi.originPx.y + (a.y + (b.y - a.y) * t) * pi.pxPerM }, kind: o.kind }
    })
  })
}

/** The biggest truth room's label point in sheet px: the eval's stand-in for the Studio click. */
export function truthPick(truth: Unit): Px {
  const pi = truth.planImage!
  const rooms = deriveRooms(truth).filter((r) => truth.roomLabels.some((l) => l.id === r.id))
  const big = rooms.reduce((b, r) => (r.areaSqm > b.areaSqm ? r : b))
  const l = truth.roomLabels.find((x) => x.id === big.id)!
  return { x: pi.originPx.x + l.x * pi.pxPerM, y: pi.originPx.y + l.y * pi.pxPerM }
}

function pxRooms(u: Unit): { r: Room; poly: Px[]; box: [number, number, number, number] }[] {
  const pi = u.planImage!
  return deriveRooms(u)
    .map((r) => {
      const poly = roomPolygon(r, u).map((p) => ({ x: pi.originPx.x + p.x * pi.pxPerM, y: pi.originPx.y + p.y * pi.pxPerM }))
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
      return { r, poly, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number] }
    })
    .sort((a, b) => a.r.areaSqm - b.r.areaSqm) // smallest containing face wins, as in deriveRooms' labelling
}

export function scoreSolve(res: AutoTraceResult, truth: Unit): SolveReport {
  const T = pxRooms(truth), D = pxRooms(res.unit)
  const k = truth.planImage!.pxPerM
  const st = Math.max(0.5, 0.05 * k) // 5 cm grid
  const all = [...T, ...D].map((x) => x.box)
  const x0 = Math.min(...all.map((b) => b[0])), y0 = Math.min(...all.map((b) => b[1]))
  const x1 = Math.max(...all.map((b) => b[2])), y1 = Math.max(...all.map((b) => b[3]))
  const at = (L: typeof T, p: Px) => L.findIndex((x) => p.x >= x.box[0] && p.x <= x.box[2] && p.y >= x.box[1] && p.y <= x.box[3] && pointInPolygon(p, x.poly))
  const inter = new Map<string, number>()
  const aT = new Float64Array(T.length), aD = new Float64Array(D.length)
  let tIn = 0, tCov = 0, dIn = 0, dOut = 0
  // ponytail: raster IoU on a 5 cm grid — exact polygon clipping if the eval ever needs sub-percent areas
  for (let y = y0 + st / 2; y < y1; y += st)
    for (let x = x0 + st / 2; x < x1; x += st) {
      const p = { x, y }
      const t = at(T, p), d = at(D, p)
      if (t >= 0) (aT[t]++, tIn++)
      if (d >= 0) (aD[d]++, dIn++)
      if (t >= 0 && d >= 0) {
        tCov++
        inter.set(`${t},${d}`, (inter.get(`${t},${d}`) ?? 0) + 1)
      }
      if (d >= 0 && t < 0) dOut++
    }
  const pairs = [...inter].map(([key, n]) => {
    const [t, d] = key.split(',').map(Number)
    return { t, d, iou: n / (aT[t] + aD[d] - n) }
  })
  pairs.sort((a, b) => b.iou - a.iou)
  const usedT = new Set<number>(), usedD = new Set<number>()
  let matched = 0, areaErr = 0, kindOk = 0
  for (const p of pairs) {
    if (p.iou < 0.6 || usedT.has(p.t) || usedD.has(p.d)) continue
    usedT.add(p.t), usedD.add(p.d)
    matched++
    areaErr += Math.abs(D[p.d].r.areaSqm - T[p.t].r.areaSqm) / T[p.t].r.areaSqm
    if (D[p.d].r.kind === T[p.t].r.kind) kindOk++
  }
  // openings: only truth openings inside the draft's bounding box count (the draft may be one part of the flat)
  const dO = pxOpenings(res.unit)
  const xs = D.flatMap((x) => [x.box[0], x.box[2]]), ys = D.flatMap((x) => [x.box[1], x.box[3]])
  const tO = pxOpenings(truth).filter((o) => o.c.x >= Math.min(...xs) && o.c.x <= Math.max(...xs) && o.c.y >= Math.min(...ys) && o.c.y <= Math.max(...ys))
  const oPairs = tO.flatMap((t, i) => dO.map((d, j) => ({ i, j, dist: Math.hypot(t.c.x - d.c.x, t.c.y - d.c.y) }))).filter((p) => p.dist <= 0.3 * k).sort((p, q) => p.dist - q.dist)
  const oT = new Set<number>(), oD = new Set<number>()
  let openingKindOk = 0
  for (const p of oPairs) {
    if (oT.has(p.i) || oD.has(p.j)) continue
    oT.add(p.i), oD.add(p.j)
    if (tO[p.i].kind === dO[p.j].kind) openingKindOk++
  }
  const reviewByKind: Record<string, number> = {}
  for (const r of res.review) reviewByKind[r.kind] = (reviewByKind[r.kind] ?? 0) + 1
  return {
    unitId: truth.id,
    truthRooms: T.length,
    draftRooms: D.length,
    matched,
    areaErr: matched ? areaErr / matched : NaN,
    scaleErr: res.stats.pxPerM / k - 1,
    scaleFrom: res.stats.scaleFrom,
    kindOk,
    coverage: tIn ? tCov / tIn : 0,
    spill: dIn ? dOut / dIn : 0,
    review: res.review.length,
    reviewByKind,
    ms: res.stats.ms,
    openingsFound: oT.size,
    truthOpenings: tO.length,
    openingKindOk,
    openingsExtra: dO.length - oD.size,
    missed: T.flatMap((t, i) => {
      if (usedT.has(i)) return []
      const best = pairs.find((p) => p.t === i)
      if (!best) return [`${t.r.name}: no face`]
      const ratio = aD[best.d] / aT[i]
      return [`${t.r.name}: IoU ${best.iou.toFixed(2)} with a face ${ratio > 1.3 ? `${ratio.toFixed(1)}× its size (merged)` : ratio < 0.77 ? `${ratio.toFixed(1)}× its size (split)` : 'of its size (shifted)'}`]
    }),
    missedIds: T.filter((_, i) => !usedT.has(i)).map((t) => t.r.id),
  }
}

/**
 * Why each unmatched truth room failed — the wave-17 diagnosis. Walks the room's hand-traced boundary (every 5 cm) and
 * asks, at each point the solver's whole-sheet graph (before the flat pick) leaves open, what the drawing and the stages
 * had there. The room's cause is the one with the most open boundary; a room whose face the graph did build is
 * 'not picked'. Pure; `raw` = traceWalls on the sheet before the text erase (to tell 'erased by the text pass').
 */
export function diagnoseMisses(
  gray: Gray,
  truth: Unit,
  missedIds: string[],
  dbg: { trace: WallTrace; plan: Gray; full: Unit; raw: WallTrace },
  /** the hand trace laid onto the drawing (eval.ts registerTruth): the boundary walk uses it, the hand trace drifts from the ink */
  xf?: TruthXf,
): { rooms: { name: string; cause: string; detail: string }[]; counts: Record<string, number> } {
  const pi = truth.planImage!
  const k = pi.pxPerM
  const toPx = (p: { x: number; y: number }, u: Unit): Px => ({ x: u.planImage!.originPx.x + p.x * u.planImage!.pxPerM, y: u.planImage!.originPx.y + p.y * u.planImage!.pxPerM })
  const segsOf = (u: Unit) => {
    const V = new Map(u.vertices.map((v) => [v.id, toPx(v, u)]))
    return u.walls.map((w) => ({ a: V.get(w.a)!, b: V.get(w.b)! }))
  }
  const near = (p: Px, segs: { a: Px; b: Px }[], tol: number) => segs.some((s) => segDistPx(p, s.a, s.b) <= tol)
  const G = segsOf(dbg.full)
  const rawW = dbg.trace.walls.flatMap((w) => segPieces(w))
  const unerased = dbg.raw.walls.flatMap((w) => segPieces(w))
  const doors = dbg.trace.openings.filter((o) => o.kind === 'door')
  const ink = threshold(dbg.plan, inkThreshold(dbg.plan, {}))
  const half = wallHalfWidth(edt(ink, dbg.plan.width, dbg.plan.height), dbg.plan.width, dbg.plan.height)
  const faint = lineInk(dbg.plan, 18)
  const light = threshold(dbg.plan, 210)
  const at = (m: Uint8Array, x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < gray.width && yi < gray.height ? m[yi * gray.width + xi] : 0
  }
  /** the widest ink run across the wall's normal within ±r of p (px), 0 = none */
  const strokeAt = (m: Uint8Array, p: Px, n: Px, r: number) => {
    let best = 0, run = 0
    for (let s = -r; s <= r; s++) {
      run = at(m, p.x + n.x * s, p.y + n.y * s) ? run + 1 : 0
      best = Math.max(best, run)
    }
    return best
  }
  const faces = deriveRooms(dbg.full).map((r) => roomPolygon(r, dbg.full).map((p) => toPx(p, dbg.full)))
  const truthRooms = deriveRooms(truth)
  const V = new Map(truth.vertices.map((v) => [v.id, v]))
  const W = new Map(truth.walls.map((w) => [w.id, w]))
  const counts: Record<string, number> = {}
  const rooms: { name: string; cause: string; detail: string }[] = []
  for (const id of missedIds) {
    const r = truthRooms.find((x) => x.id === id)!
    const poly = roomPolygon(r, truth).map((p) => toPx(p, truth))
    // the best whole-sheet face (raster IoU, 10 cm grid)
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
    const st = 0.1 * k
    const inR: Px[] = []
    for (let y = Math.min(...ys) + st / 2; y < Math.max(...ys); y += st) for (let x = Math.min(...xs) + st / 2; x < Math.max(...xs); x += st) if (pointInPolygon({ x, y }, poly)) inR.push({ x, y })
    const area = (q: Px[]) => Math.abs(q.reduce((t, p, i) => t + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0)) / 2 / (st * st)
    let bestIoU = 0, bestRatio = 0
    for (const f of faces) {
      const n = inR.filter((p) => pointInPolygon(p, f)).length
      if (!n) continue
      const iou = n / (inR.length + area(f) - n)
      if (iou > bestIoU) (bestIoU = iou), (bestRatio = area(f) / inR.length)
    }
    let cause: string, detail = ''
    if (bestIoU >= 0.6) cause = 'face built, not picked'
    else {
      const open: Record<string, number> = {}
      let total = 0
      for (const wid of new Set(r.wallIds)) {
        const w = W.get(wid)!
        const va = V.get(w.a)!, vb = V.get(w.b)!
        const a = xf ? applyXf(xf, va.x, va.y) : toPx(va, truth), b = xf ? applyXf(xf, vb.x, vb.y) : toPx(vb, truth)
        const L = Math.hypot(b.x - a.x, b.y - a.y), Lm = Math.hypot(vb.x - va.x, vb.y - va.y)
        const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, n = { x: -d.y, y: d.x }
        // hand traces follow the printed sizes and sit up to ~0.2 m off the drawn line
        const tol = Math.max(0.25 * k, (w.thicknessM / 2 + 0.1) * k)
        for (let m = 0.025; m < Lm; m += 0.05) {
          total++
          const p = { x: a.x + (d.x * m * L) / Lm, y: a.y + (d.y * m * L) / Lm }
          if (near(p, G, tol)) continue
          const op = w.openings.find((o) => m >= o.offsetM && m <= o.offsetM + o.widthM)
          let why: string
          if (op?.kind === 'door') why = doors.some((o) => segDistPx(p, o.a, o.b) <= tol) ? 'door found, lost in the graph' : 'door arc not detected'
          else if (op?.kind === 'window') why = 'window gap not bridged'
          else if (op?.kind === 'slider') why = 'slider gap not bridged'
          else if (op?.kind === 'passage') why = 'passage (drawn open)'
          else if (near(p, rawW, tol)) why = 'wall traced, lost in the graph'
          else if (near(p, unerased, tol)) why = 'wall erased by the text pass'
          else {
            const s = strokeAt(ink, p, n, Math.round(tol))
            why =
              s >= 1.4 * half ? 'thick ink, no wall traced (mostly foliage over a planter wall)'
              : strokeAt(light, p, n, Math.round(tol)) >= 1.4 * half ? 'light-grey thick wall (lighter than the ink cut)'
              : s > 0 || strokeAt(faint, p, n, Math.round(tol)) ? 'thin line (railing / glass / shaft / thin partition)'
              : 'nothing drawn there'
          }
          open[why] = (open[why] ?? 0) + 1
        }
      }
      const openN = Object.values(open).reduce((t, x) => t + x, 0)
      const top = Object.entries(open).sort((p, q) => q[1] - p[1])[0]
      if (openN <= 0.03 * total) cause = bestIoU > 0 && bestRatio < 0.77 ? 'split by an extra wall' : 'boundary closed, face not formed'
      else cause = top[0]
      detail = `open ${Object.entries(open).map(([c, x]) => `${c} ${(x * 0.05).toFixed(1)}`).join(', ')} of ${(total * 0.05).toFixed(1)} m; best face IoU ${bestIoU.toFixed(2)}`
    }
    counts[cause] = (counts[cause] ?? 0) + 1
    rooms.push({ name: r.name, cause, detail })
  }
  return { rooms, counts }
}

function segDistPx(p: Px, a: Px, b: Px): number {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2))
  return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t)
}

export function formatSolveReports(rows: SolveReport[]): string {
  const pct = (x: number) => (Number.isNaN(x) ? '   -' : `${(x * 100).toFixed(0)}%`).padStart(5)
  const head = 'unit                  rooms matched   area%  scale%  from       kindOk  cover  spill  opens okKind extra review    ms  wallRec wallPrec  review kinds'
  return [
    head,
    ...rows.map(
      (r) =>
        `${r.unitId.padEnd(20)} ${`${r.draftRooms}/${r.truthRooms}`.padStart(6)} ${String(r.matched).padStart(7)} ${pct(r.areaErr)}  ${(`${r.scaleErr >= 0 ? '+' : ''}${(r.scaleErr * 100).toFixed(1)}%`).padStart(6)}  ${r.scaleFrom.padEnd(9)} ${`${r.kindOk}/${r.matched}`.padStart(7)} ${pct(r.coverage)} ${pct(r.spill)} ${`${r.openingsFound}/${r.truthOpenings}`.padStart(6)} ${String(r.openingKindOk).padStart(6)} ${String(r.openingsExtra).padStart(5)} ${String(r.review).padStart(6)} ${String(r.ms).padStart(5)}  ${pct(r.wallRecall ?? NaN).padStart(7)} ${pct(r.wallPrecision ?? NaN).padStart(8)}  ${Object.entries(r.reviewByKind).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    ),
  ].join('\n')
}
