/**
 * Eval of rooms.ts (wave 19) against the hand-traced units: rooms matched (the same raster IoU ≥ 0.6, one-to-one, as
 * solveEval.ts scoreSolve), and per-edge classes vs what the hand trace has on that edge (confusion in metres, plus
 * per item: class right, start / stop within 0.1 m). Overlays as RGB buffers (evalio.writePng writes them). Pure.
 */
import { deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Room, Unit } from '../core'
import { applyXf, type TruthXf } from './eval'
import type { EdgeClass, RectPx, RgbImage, RoomFit, RoomWalls, Side } from './rooms'
import type { Dims, Gray, Px, TextItem } from './types'

/** "15'-0\" × 11'-10\"" → metres (first printed number first) */
export function printedDims(s: string): Dims | null {
  const m = [...s.matchAll(/(\d+)'\s*-?\s*(\d+(?:\.\d+)?)"/g)]
  if (m.length !== 2) return null
  const [aM, bM] = m.map((x) => (+x[1] + +x[2] / 12) * 0.3048)
  return { aM, bM }
}

/** what a reader that never misreads would hand over: one label per named room, at its label point, with its printed size */
export function oracleLabels(u: Unit): TextItem[] {
  const pi = u.planImage!
  return u.roomLabels.map((l) => {
    const p = { x: pi.originPx.x + l.x * pi.pxPerM, y: pi.originPx.y + l.y * pi.pxPerM }
    const dims = l.printedSize ? printedDims(l.printedSize) ?? undefined : undefined
    return { text: `${l.name}${l.printedSize ? `\n${l.printedSize}` : ''}`, box: { x: p.x - 20, y: p.y - 8, w: 40, h: 16 }, kind: 'room', roomKind: l.kind, ...(dims ? { dims } : {}), conf: 1, source: 'ocr' }
  })
}

export interface TruthRoomPx {
  r: Room
  poly: Px[]
  box: [number, number, number, number]
}

/** truth rooms in sheet px through the unit's planImage, smallest first (as scoreSolve) */
export function truthRoomsPx(u: Unit): TruthRoomPx[] {
  const pi = u.planImage!
  return deriveRooms(u)
    .map((r) => {
      const poly = roomPolygon(r, u).map((p) => ({ x: pi.originPx.x + p.x * pi.pxPerM, y: pi.originPx.y + p.y * pi.pxPerM }))
      const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
      return { r, poly, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as [number, number, number, number] }
    })
    .sort((a, b) => a.r.areaSqm - b.r.areaSqm)
}

/** the drawn depth (px) of a side: length-weighted over its wall / window stretches; 0 when nothing of that is drawn */
function sideDepth(f: RoomFit, side: Side): number {
  const e = f.edges.find((x) => x.side === side)!
  let s = 0, n = 0
  for (const t of e.stretches) if ((t.kind === 'wall' || t.kind === 'window') && t.thPx) (s += t.thPx * (t.u1 - t.u0)), (n += t.u1 - t.u0)
  return n ? s / n : 0
}

/** inner rect → centre-line rect (truth rooms are wall-centre faces): each side grows by half what is drawn there */
export function centreRect(f: RoomFit): RectPx {
  const r = f.rect
  return { x0: r.x0 - sideDepth(f, 'left') / 2, y0: r.y0 - sideDepth(f, 'top') / 2, x1: r.x1 + sideDepth(f, 'right') / 2, y1: r.y1 + sideDepth(f, 'bottom') / 2 }
}

export interface RoomScore {
  matched: number
  /** per truth room (truthRoomsPx order): the matched rect index (−1 none) and its IoU */
  per: { d: number; iou: number }[]
  meanIoU: number
}

/** raster IoU on a 5 cm grid, one-to-one greedy by IoU, matched at ≥ 0.6 — scoreSolve's rule, rectangles for faces */
export function scoreRooms(truth: Unit, rects: RectPx[]): RoomScore {
  const T = truthRoomsPx(truth)
  const k = truth.planImage!.pxPerM
  const st = Math.max(0.5, 0.05 * k)
  const tb = [Math.min(...T.map((t) => t.box[0])), Math.min(...T.map((t) => t.box[1])), Math.max(...T.map((t) => t.box[2])), Math.max(...T.map((t) => t.box[3]))]
  const D = rects.map((r, i) => ({ r, i })).filter(({ r }) => r.x1 > tb[0] && r.x0 < tb[2] && r.y1 > tb[1] && r.y0 < tb[3]).sort((a, b) => (a.r.x1 - a.r.x0) * (a.r.y1 - a.r.y0) - (b.r.x1 - b.r.x0) * (b.r.y1 - b.r.y0))
  const x0 = Math.min(tb[0], ...D.map((d) => d.r.x0)), y0 = Math.min(tb[1], ...D.map((d) => d.r.y0))
  const x1 = Math.max(tb[2], ...D.map((d) => d.r.x1)), y1 = Math.max(tb[3], ...D.map((d) => d.r.y1))
  const aT = new Float64Array(T.length), aD = new Float64Array(D.length)
  const inter = new Map<number, number>()
  for (let y = y0 + st / 2; y < y1; y += st)
    for (let x = x0 + st / 2; x < x1; x += st) {
      const p = { x, y }
      const t = T.findIndex((q) => x >= q.box[0] && x <= q.box[2] && y >= q.box[1] && y <= q.box[3] && pointInPolygon(p, q.poly))
      const d = D.findIndex((q) => x >= q.r.x0 && x < q.r.x1 && y >= q.r.y0 && y < q.r.y1)
      if (t >= 0) aT[t]++
      if (d >= 0) aD[d]++
      if (t >= 0 && d >= 0) inter.set(t * 10000 + d, (inter.get(t * 10000 + d) ?? 0) + 1)
    }
  const pairs = [...inter].map(([key, n]) => ({ t: Math.floor(key / 10000), d: key % 10000, iou: n / (aT[Math.floor(key / 10000)] + aD[key % 10000] - n) })).sort((a, b) => b.iou - a.iou)
  const per = T.map(() => ({ d: -1, iou: 0 }))
  const usedD = new Set<number>()
  for (const p of pairs) {
    if (per[p.t].d >= 0 || usedD.has(p.d)) continue
    per[p.t] = { d: D[p.d].i, iou: p.iou }
    usedD.add(p.d)
  }
  return { matched: per.filter((p) => p.iou >= 0.6).length, per, meanIoU: per.reduce((s, p) => s + p.iou, 0) / Math.max(1, T.length) }
}

// ─────────────────────────────────────────────────────────────────────────────── edge classes vs the hand trace

export type TruthEdgeClass = 'wall' | 'wall-thin' | 'wall-glass' | 'window' | 'window-solid' | 'door' | 'passage' | 'none'
export const TRUTH_CLASSES: TruthEdgeClass[] = ['wall', 'wall-thin', 'wall-glass', 'window', 'window-solid', 'door', 'passage', 'none']
export const OUR_CLASSES: EdgeClass[] = ['wall', 'window', 'door', 'thin', 'open', 'unsure']
/**
 * The class a truth item should get from what is DRAWN: a hand-traced wall drawn thin is a thin line — unless the
 * colour image has blue glass there ('wall-glass': the hand trace closed a glazed side without a window opening); a
 * hand-traced window the drawing shows as a solid dark band (no glazing lines) is drawn as a wall; a passage is open.
 */
const expect_: Record<TruthEdgeClass, EdgeClass | null> = { wall: 'wall', 'wall-thin': 'thin', 'wall-glass': 'window', window: 'window', 'window-solid': 'wall', door: 'door', passage: 'open', none: null }
export const expectedClass = (t: TruthEdgeClass) => expect_[t]
/** the same against the hand trace alone (a hand-traced window is a window, a hand-traced solid wall is no window, however drawn) */
const strict_: Record<TruthEdgeClass, EdgeClass | null> = { ...expect_, 'window-solid': 'window', 'wall-glass': 'thin' }

export interface EdgeReport {
  /** metres of fitted edge: truth class → our class (outside the ±0.1 m band around each change of the truth class) */
  confusion: Record<TruthEdgeClass, Record<EdgeClass, number>>
  /** the same inside that band (the start / stop zone) */
  band: Record<TruthEdgeClass, Record<EdgeClass, number>>
  /** truth items (a wall piece, an opening) on fitted edges: count, class right (≥ 50 % of it), and both ends within 0.1 m */
  items: Record<TruthEdgeClass, { n: number; classOk: number; endsOk: number }>
  /** every stretch with the truth class under most of it (for failure lists) */
  details: { room: string; side: Side; kind: EdgeClass; truth: TruthEdgeClass; mix: Partial<Record<TruthEdgeClass, number>>; a: Px; b: Px; lenM: number }[]
}

/**
 * Walk every edge of the given fits; at each pixel find the registered hand-traced wall lying along it (parallel, its
 * centre line half its thickness outward of the face ± 0.12 m) and what the hand trace has there: an opening's kind,
 * or a solid wall — 'wall' when the drawing has a dark band there, 'wall-thin' when the hand trace closes the room
 * with a wall the drawing shows only as thin lines (railing, glass, shaft).
 */
export function edgeReport(gray: Gray, truth: Unit, xf: TruthXf, fits: RoomFit[], darkMax: number, rgb?: RgbImage): EdgeReport {
  const k = xf.k
  const V = new Map(truth.vertices.map((v) => [v.id, v]))
  const W = truth.walls.map((w) => {
    const a = V.get(w.a)!, b = V.get(w.b)!
    return { w, a: applyXf(xf, a.x, a.y), b: applyXf(xf, b.x, b.y), L: Math.hypot(b.x - a.x, b.y - a.y) }
  })
  const { confusion, items, details, band: bandM } = emptyEdgeReport()
  const dark = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y)
    return xi >= 0 && yi >= 0 && xi < gray.width && yi < gray.height && gray.data[yi * gray.width + xi] <= darkMax
  }
  for (const f of fits)
    for (const e of f.edges) {
      const horiz = e.side === 'top' || e.side === 'bottom'
      const face = e.c - 0.5
      const tc: TruthEdgeClass[] = []
      const ours: EdgeClass[] = []
      for (let u = e.u0; u < e.u1; u++) {
        ours.push(e.stretches.find((s) => u >= s.u0 && u < s.u1)?.kind ?? 'unsure')
        let best: { cls: TruthEdgeClass; d: number } | null = null
        for (const t of W) {
          const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y, len = Math.hypot(dx, dy)
          if (len < 1) continue
          if (horiz ? Math.abs(dy) > 0.05 * len : Math.abs(dx) > 0.05 * len) continue
          const s = horiz ? (u - t.a.x) / dx : (u - t.a.y) / dy
          if (s < 0 || s > 1) continue
          const cLine = horiz ? t.a.y + dy * s : t.a.x + dx * s
          const off = (cLine - face) * e.out
          const want = (t.w.thicknessM * k) / 2
          const d = Math.abs(off - want)
          if (d > Math.max(4, 0.12 * k) || (best && d >= best.d)) continue
          const m = s * t.L
          const op = t.w.openings.find((o) => m >= o.offsetM && m <= o.offsetM + o.widthM)
          // a dark band across the hand-traced wall's line here (± half its thickness + 0.08 m)?
          const r = Math.round(want + 0.08 * k)
          let run = 0, bestRun = 0
          for (let q = -r; q <= r; q++) {
            const on = horiz ? dark(u, cLine + q) : dark(cLine + q, u)
            run = on ? run + 1 : 0
            bestRun = Math.max(bestRun, run)
          }
          const band = bestRun >= Math.max(2, Math.round(0.07 * k))
          let glass = false
          if (rgb && !band && !op)
            for (let q = -r; q <= r && !glass; q++) {
              const x = Math.round(horiz ? u : cLine + q), y = Math.round(horiz ? cLine + q : u)
              const i = (y * rgb.width + x) * 4
              glass = x >= 0 && y >= 0 && x < rgb.width && y < rgb.height && rgb.data[i + 2] - Math.max(rgb.data[i], rgb.data[i + 1]) >= 25
            }
          const cls: TruthEdgeClass = op ? (op.kind === 'door' ? 'door' : op.kind === 'passage' ? 'passage' : band ? 'window-solid' : 'window') : band ? 'wall' : glass ? 'wall-glass' : 'wall-thin'
          best = { cls, d }
        }
        tc.push(best?.cls ?? 'none')
      }
      // pixels within 0.1 m of a change of the hand-traced class are the start / stop question (items below), not class
      // confusion: the hand trace's ends sit a few cm off the drawing
      const band = Math.round(0.1 * k)
      tc.forEach((t, i) => {
        const nearChange = tc.slice(Math.max(0, i - band), i + band + 1).some((x) => x !== t)
        if (nearChange) bandM[t][ours[i]] += 1 / k
        else confusion[t][ours[i]] += 1 / k
      })
      for (const s of e.stretches) {
        const n: Partial<Record<TruthEdgeClass, number>> = {}
        for (let u = s.u0; u < s.u1; u++) n[tc[u - e.u0]] = (n[tc[u - e.u0]] ?? 0) + 1
        const top = (Object.entries(n) as [TruthEdgeClass, number][]).sort((p, q) => q[1] - p[1])[0]
        const mix = Object.fromEntries(Object.entries(n).map(([t, c]) => [t, c / k])) as Partial<Record<TruthEdgeClass, number>>
        details.push({ room: f.label.text.split('\n')[0], side: e.side, kind: s.kind, truth: top[0], mix, a: horiz ? { x: s.u0, y: face } : { x: face, y: s.u0 }, b: horiz ? { x: s.u1, y: face } : { x: face, y: s.u1 }, lenM: (s.u1 - s.u0) / k })
      }
      // items = runs of one truth class along the edge
      for (let i = 0; i < tc.length; ) {
        let j = i
        while (j < tc.length && tc[j] === tc[i]) j++
        const want = expect_[tc[i]]
        if (want) {
          const it = items[tc[i]]
          it.n++
          let same = 0
          for (let q = i; q < j; q++) if (ours[q] === want) same++
          if (same >= 0.5 * (j - i)) it.classOk++
          const s = e.stretches.find((x) => x.kind === want && Math.abs(x.u0 - (e.u0 + i)) <= 0.1 * k && Math.abs(x.u1 - (e.u0 + j)) <= 0.1 * k)
          if (s) it.endsOk++
        }
        i = j
      }
    }
  return { confusion, items, details, band: bandM }
}

export function emptyEdgeReport(): EdgeReport {
  const table = () => Object.fromEntries(TRUTH_CLASSES.map((t) => [t, Object.fromEntries(OUR_CLASSES.map((o) => [o, 0]))])) as EdgeReport['confusion']
  return {
    confusion: table(),
    band: table(),
    items: Object.fromEntries(TRUTH_CLASSES.map((t) => [t, { n: 0, classOk: 0, endsOk: 0 }])) as EdgeReport['items'],
    details: [],
  }
}

export function addEdgeReports(a: EdgeReport, b: EdgeReport): EdgeReport {
  for (const t of TRUTH_CLASSES) {
    for (const o of OUR_CLASSES) (a.confusion[t][o] += b.confusion[t][o]), (a.band[t][o] += b.band[t][o])
    a.items[t].n += b.items[t].n
    a.items[t].classOk += b.items[t].classOk
    a.items[t].endsOk += b.items[t].endsOk
  }
  a.details.push(...b.details)
  return a
}

/**
 * Precision of our class X: its length on a truth item that should get X ÷ its length on any hand-traced boundary
 * ('none' excluded: the fitted edge is off every hand-traced wall). `strict`: against the hand trace alone.
 */
export function precision(r: EdgeReport, ours: EdgeClass, o: { strict?: boolean; withBand?: boolean } = {}): { p: number; on: number; offTruth: number } {
  const m = (t: TruthEdgeClass) => r.confusion[t][ours] + (o.withBand ? r.band[t][ours] : 0)
  const good = TRUTH_CLASSES.filter((t) => (o.strict ? strict_ : expect_)[t] === ours)
  const on = TRUTH_CLASSES.filter((t) => t !== 'none').reduce((s, t) => s + m(t), 0)
  const hit = good.reduce((s, t) => s + m(t), 0)
  return { p: on ? hit / on : NaN, on, offTruth: m('none') }
}

export function recall(r: EdgeReport, truthCls: TruthEdgeClass): number {
  const tot = OUR_CLASSES.reduce((s, o) => s + r.confusion[truthCls][o], 0)
  const want = expect_[truthCls]
  return want && tot ? r.confusion[truthCls][want] / tot : NaN
}

export function formatEdgeReport(r: EdgeReport): string {
  const pad = (s: string, n: number) => s.padStart(n)
  const lines = [`truth \\ ours (m, ±0.1 m band at truth changes excluded)  ${OUR_CLASSES.map((o) => pad(o, 7)).join(' ')}   items: n  class-ok  ends≤0.1m`]
  for (const t of TRUTH_CLASSES)
    lines.push(`${t.padEnd(55)} ${OUR_CLASSES.map((o) => pad(r.confusion[t][o].toFixed(1), 7)).join(' ')}   ${pad(String(r.items[t].n), 7)} ${pad(String(r.items[t].classOk), 9)} ${pad(String(r.items[t].endsOk), 10)}`)
  const P = (o: EdgeClass, x: { strict?: boolean; withBand?: boolean }) => `${(precision(r, o, x).p * 100).toFixed(1)}%`
  lines.push(
    `precision vs the drawing: ${(['wall', 'window', 'door', 'thin'] as EdgeClass[]).map((o) => `${o} ${P(o, {})} of ${precision(r, o).on.toFixed(1)} m (+${precision(r, o).offTruth.toFixed(1)} m on no hand-traced wall)`).join(' · ')}`,
  )
  lines.push(`  incl. the ±0.1 m bands: ${(['wall', 'window', 'door'] as EdgeClass[]).map((o) => `${o} ${P(o, { withBand: true })}`).join(' · ')}   vs the hand trace alone: ${(['wall', 'window', 'door'] as EdgeClass[]).map((o) => `${o} ${P(o, { strict: true })}`).join(' · ')}`)
  lines.push(`recall: ${(['wall', 'window', 'door', 'wall-thin', 'wall-glass', 'passage'] as TruthEdgeClass[]).map((t) => `${t} ${(recall(r, t) * 100).toFixed(1)}%`).join(' · ')}`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────── overlay

type RGB = [number, number, number]
export const STRETCH_RGB: Record<EdgeClass, RGB | null> = { wall: [150, 0, 0], window: [0, 200, 220], door: [0, 60, 255], thin: [255, 140, 0], open: null, unsure: [240, 210, 0] }

/**
 * The plan faded; truth rooms thin green; each fitted rectangle drawn by its edge stretches (wall dark red, window cyan,
 * door blue — with a hinge→swing tick —, thin orange, unsure yellow, open not drawn); seeds as crosses, green when the
 * room matched, magenta when not. With `walls`: the derived walls as bands (dark red outline, centre line black),
 * openings door blue / window cyan, unwalled stretches thin orange / open grey / unsure yellow.
 */
export function roomsOverlay(gray: Gray, crop: RectPx, s: number, o: { fits?: RoomFit[]; ok?: boolean[]; truth?: Px[][]; walls?: RoomWalls }): { w: number; h: number; rgb: Uint8Array } {
  const W = Math.round((crop.x1 - crop.x0) * s), H = Math.round((crop.y1 - crop.y0) * s)
  const px = new Uint8Array(W * H * 3)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(crop.x0 + x / s), sy = Math.floor(crop.y0 + y / s)
      const v = sx >= 0 && sy >= 0 && sx < gray.width && sy < gray.height ? 100 + (gray.data[sy * gray.width + sx] * 155) / 255 : 128
      px[(y * W + x) * 3] = px[(y * W + x) * 3 + 1] = px[(y * W + x) * 3 + 2] = v
    }
  const dot = (x: number, y: number, c: RGB) => {
    const xi = Math.round(x), yi = Math.round(y)
    if (xi >= 0 && yi >= 0 && xi < W && yi < H) px.set(c, (yi * W + xi) * 3)
  }
  // image coordinates are pixel centres: pixel i spans i−0.5 … i+0.5
  const to = (p: Px) => ({ x: (p.x + 0.5 - crop.x0) * s, y: (p.y + 0.5 - crop.y0) * s })
  const line = (p: Px, q: Px, c: RGB, r = 0, dash = 0) => {
    const a = to(p), b = to(q)
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)) + 1
    for (let i = 0; i <= n; i++) {
      if (dash && Math.floor(i / dash) % 2) continue
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) dot(x + dx, y + dy, c)
    }
  }
  for (const poly of o.truth ?? []) poly.forEach((p, i) => line(p, poly[(i + 1) % poly.length], [0, 170, 0]))
  if (o.walls) {
    for (const w of o.walls.walls) {
      const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy) || 1
      const n = { x: (-dy / L) * (w.thicknessPx / 2), y: (dx / L) * (w.thicknessPx / 2) }
      const c1 = { x: w.a.x + n.x, y: w.a.y + n.y }, c2 = { x: w.b.x + n.x, y: w.b.y + n.y }, c3 = { x: w.b.x - n.x, y: w.b.y - n.y }, c4 = { x: w.a.x - n.x, y: w.a.y - n.y }
      ;[c1, c2, c3, c4].forEach((p, i, a) => line(p, a[(i + 1) % 4], [170, 0, 0], 0))
      line(w.a, w.b, [0, 0, 0], 0)
      for (const p of [w.a, w.b]) {
        const q = to(p)
        for (let d = -3; d <= 3; d++) (dot(q.x + d, q.y, [0, 0, 0]), dot(q.x, q.y + d, [0, 0, 0]))
      }
    }
    for (const op of o.walls.openings) {
      line(op.a, op.b, op.kind === 'door' ? [0, 60, 255] : [0, 200, 220], 2)
      if (op.hingeAt && op.swingTo) line(op.hingeAt, op.swingTo, [0, 60, 255], 0)
    }
    for (const u of o.walls.unwalled) line(u.a, u.b, u.kind === 'thin' ? [255, 140, 0] : u.kind === 'open' ? [110, 110, 110] : [240, 210, 0], 1, u.kind === 'open' ? 4 : 0)
  }
  ;(o.fits ?? []).forEach((f, i) => {
    for (const e of f.edges) {
      const horiz = e.side === 'top' || e.side === 'bottom'
      const c = e.c - 0.5
      for (const st of e.stretches) {
        const col = STRETCH_RGB[st.kind]
        const a = horiz ? { x: st.u0 - 0.5, y: c } : { x: c, y: st.u0 - 0.5 }, b = horiz ? { x: st.u1 - 0.5, y: c } : { x: c, y: st.u1 - 0.5 }
        if (col) line(a, b, col, 1)
        else line(a, b, [90, 90, 90], 0, 3)
        if (st.hingeAt && st.swingTo) line(st.hingeAt, st.swingTo, [0, 60, 255], 0)
      }
    }
    const q = to(f.at)
    const col: RGB = o.ok?.[i] ? [0, 190, 0] : [230, 0, 230]
    for (let d = -6; d <= 6; d++) for (const w of [-1, 0, 1]) (dot(q.x + d, q.y + w, col), dot(q.x + w, q.y + d, col))
  })
  return { w: W, h: H, rgb: px }
}
