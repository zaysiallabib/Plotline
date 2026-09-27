/**
 * End-to-end eval of the solver (wave 16): a draft Unit against a hand-traced Unit on the same sheet. Both are mapped to
 * sheet pixels through their own planImage (px = originPx + m × pxPerM), so rooms are matched on the drawing and the
 * draft's scale error shows up in its areas, not in the matching. Pure.
 */
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Room, Unit } from '../core'
import type { AutoTraceResult, Px } from './types'

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
  }
}

export function formatSolveReports(rows: SolveReport[]): string {
  const pct = (x: number) => (Number.isNaN(x) ? '   -' : `${(x * 100).toFixed(0)}%`).padStart(5)
  const head = 'unit                  rooms matched   area%  scale%  from       kindOk  cover  spill review    ms  review kinds'
  return [
    head,
    ...rows.map(
      (r) =>
        `${r.unitId.padEnd(20)} ${`${r.draftRooms}/${r.truthRooms}`.padStart(6)} ${String(r.matched).padStart(7)} ${pct(r.areaErr)}  ${(`${r.scaleErr >= 0 ? '+' : ''}${(r.scaleErr * 100).toFixed(1)}%`).padStart(6)}  ${r.scaleFrom.padEnd(9)} ${`${r.kindOk}/${r.matched}`.padStart(7)} ${pct(r.coverage)} ${pct(r.spill)} ${String(r.review).padStart(6)} ${String(r.ms).padStart(5)}  ${Object.entries(r.reviewByKind).map(([k, n]) => `${k} ${n}`).join(', ')}`,
    ),
  ].join('\n')
}
