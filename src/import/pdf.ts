/**
 * Vector-PDF import (session 29): page 1's drawn paths (pdf.js operator list: moveTo / lineTo / curveTo / closePath under
 * the current transform) become lines, its text runs become texts, and the same engine as DXF (plan2d.ts) makes the walls,
 * openings and labels. A PDF has no layers, so walls are any parallel line pair 5–60 cm apart. PDF units are points
 * (1/72 in) and the drawing's scale is not in the file: the printed dimensions ("14'-0\"") are measured against the line
 * they sit on; when three or more agree within 2 % that is the scale, else the printed room sizes give a rough one, else
 * unitScale 1 with a "scale not set" note for the Studio's S tool. A PDF whose page is only a picture is refused in
 * plain words.
 */
import type { Pt } from '../core'
import { parseDims, parseSide } from '../trace/text'
import { buildPlan, type ArcPrim, type Drawing, type Seg, type TextPrim } from './plan2d'
import type { ImportResult } from './types'

const CHORDS = 8
const PT = 0.0254 / 72

type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const ap = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** page 1's lines (the clip paths left out) and texts, in PDF user space turned the way the page is shown */
async function readPage(bytes: ArrayBuffer): Promise<{ segs: Seg[]; arcs: ArcPrim[]; texts: TextPrim[]; pictures: number; pages: number }> {
  // the browser takes the normal build with its worker; Node (the tests) the legacy build, which carries its own polyfills
  const pdfjs = await (typeof window === 'undefined' ? import('pdfjs-dist/legacy/build/pdf.mjs') : import('pdfjs-dist'))
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise
  const page = await doc.getPage(1)
  const rot = ((page.rotate % 360) + 360) % 360
  const turn = (p: Pt): Pt => (rot === 90 ? { x: p.y, y: -p.x } : rot === 180 ? { x: -p.x, y: -p.y } : rot === 270 ? { x: -p.y, y: p.x } : p)
  const ops = await page.getOperatorList()
  const segs: Seg[] = []
  const arcs: ArcPrim[] = []
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stack: M[] = []
  let pictures = 0
  const line = (a: Pt, b: Pt) => segs.push({ a: turn(a), b: turn(b), layer: '' })
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[]
    if (fn === pdfjs.OPS.save) stack.push(ctm)
    else if (fn === pdfjs.OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === pdfjs.OPS.transform) ctm = mul(ctm, args as M)
    else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject || fn === pdfjs.OPS.paintImageMaskXObject) pictures++
    else if (fn === pdfjs.OPS.constructPath) {
      const [paint, paths] = args as [number, (Float32Array | number[])[]]
      if (paint === pdfjs.OPS.endPath) continue // a clip, not a drawing
      for (const d of paths) {
        let cur: Pt | null = null
        let start: Pt | null = null
        for (let k = 0; k < d.length; ) {
          const op = d[k++]
          if (op === 0) {
            cur = start = ap(ctm, d[k], d[k + 1])
            k += 2
          } else if (op === 1) {
            const p = ap(ctm, d[k], d[k + 1])
            k += 2
            if (cur) line(cur, p)
            cur = p
          } else if (op === 2 || op === 3) {
            const n = op === 2 ? 3 : 2
            const pts = Array.from({ length: n }, (_, j) => ap(ctm, d[k + 2 * j], d[k + 2 * j + 1]))
            k += 2 * n
            const p3 = pts[n - 1]
            if (cur && op === 2) {
              // a bezier that is a quarter circle (a door swing): its centre is the far corner of the tangents' box
              const p0 = cur, p1 = pts[0], p2 = pts[1]
              const corner = { x: p0.x + (p1.x - p0.x) / 0.5523, y: p0.y + (p1.y - p0.y) / 0.5523 }
              const c = { x: p0.x + p3.x - corner.x, y: p0.y + p3.y - corner.y }
              const r0 = Math.hypot(p0.x - c.x, p0.y - c.y), r3 = Math.hypot(p3.x - c.x, p3.y - c.y)
              const t3 = { x: p3.x + (p2.x - p3.x) / 0.5523, y: p3.y + (p2.y - p3.y) / 0.5523 }
              const dotT = (p0.x - c.x) * (p3.x - c.x) + (p0.y - c.y) * (p3.y - c.y)
              if (r0 > 0 && Math.abs(r3 - r0) < 0.03 * r0 && Math.hypot(t3.x - corner.x, t3.y - corner.y) < 0.05 * r0 && Math.abs(dotT) < 0.1 * r0 * r0) {
                const C = turn(c), E0 = turn(p0), E3 = turn(p3)
                const b0 = Math.atan2(E0.y - C.y, E0.x - C.x), b3 = Math.atan2(E3.y - C.y, E3.x - C.x)
                const ccw = (E0.x - C.x) * (E3.y - C.y) - (E0.y - C.y) * (E3.x - C.x) > 0
                arcs.push({ c: C, r: r0, a0: ccw ? b0 : b3, a1: ccw ? b3 : b0, layer: '' })
              }
            }
            if (cur) {
              const p0 = cur, p1 = pts[0], p2 = op === 2 ? pts[1] : pts[0]
              let prev = p0
              for (let j = 1; j <= CHORDS; j++) {
                const t = j / CHORDS, u = 1 - t
                const q = { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }
                line(prev, q)
                prev = q
              }
            }
            cur = p3
          } else if (op === 4) {
            if (cur && start) line(cur, start)
            cur = start
          } else break
        }
      }
    }
  }
  // texts: pdf.js splits a line into runs; runs on one baseline that nearly touch are one text
  const tc = await page.getTextContent()
  const runs = (tc.items as { str: string; transform: number[]; width: number }[]).filter((t) => t.str && t.str.trim() && t.transform).map((t) => {
    const [a, b, , , e, f] = t.transform
    const h = Math.hypot(a, b) || 1
    const dir = { x: a / h, y: b / h }
    return { str: t.str, at: { x: e, y: f }, end: { x: e + dir.x * t.width, y: f + dir.y * t.width }, dir, h }
  })
  const merged: (typeof runs)[number][] = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.dir.x * r.dir.y - last.dir.y * r.dir.x) < 0.01 && Math.hypot(r.at.x - last.end.x, r.at.y - last.end.y) < 0.6 * r.h) {
      last.str += r.str
      last.end = r.end
    } else merged.push({ ...r })
  }
  // (a label's point is the middle of its text, so it lands in its room)
  // (fonts print the foot mark as a curly quote)
  const texts: TextPrim[] = merged.map((r) => ({ layer: '', at: turn({ x: (r.at.x + r.end.x) / 2, y: (r.at.y + r.end.y) / 2 }), text: r.str.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'), height: r.h }))
  const pages = doc.numPages
  await doc.cleanup()
  return { segs, arcs, texts, pictures, pages }
}

/**
 * Points per metre from the printed dimensions: each dimension text ("14'-0\"", "10'-8 1/2\"") against the line it sits on
 * (parallel to the text, passing under its middle); the median ratio when ≥ 3 agree within 2 %, else null.
 */
function scaleFromDimensions(segs: Seg[], texts: TextPrim[]): { ptPerM: number; agreed: number } | null {
  const ratios: number[] = []
  for (const t of texts) {
    if (!/['"]|\bmm\b|\bm\b/.test(t.text) || parseDims(t.text)) continue
    const m = parseSide(t.text)
    if (!m) continue
    for (const g of segs) {
      const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
      if (L < 4 * t.height) continue
      const dir = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L }
      const d = { x: t.at.x - g.a.x, y: t.at.y - g.a.y }
      const s = d.x * dir.x + d.y * dir.y
      const perp = Math.abs(d.x * dir.y - d.y * dir.x)
      if (perp > 2.5 * t.height || s < -t.height || s > L + t.height) continue
      ratios.push(L / m)
    }
  }
  if (ratios.length < 3) return null
  ratios.sort((p, q) => p - q)
  let best: { r: number; n: number } = { r: 0, n: 0 }
  for (const r of ratios) {
    const n = ratios.filter((x) => Math.abs(x - r) <= 0.02 * r).length
    if (n > best.n) best = { r, n }
  }
  if (best.n < 3) return null
  const agree = ratios.filter((x) => Math.abs(x - best.r) <= 0.02 * best.r)
  return { ptPerM: agree[Math.floor(agree.length / 2)], agreed: agree.length }
}

export async function importPdf(bytes: ArrayBuffer, name: string): Promise<ImportResult> {
  const { segs, arcs, texts, pictures, pages } = await readPage(bytes)
  if (!segs.length) throw new Error('This PDF is a picture, not a drawing — use the picture itself')
  const notes: string[] = [`PDF: ${pages} page(s); page 1 read: ${segs.length} lines, ${texts.length} texts${pictures ? `, ${pictures} picture(s) ignored` : ''}.`]
  if (pages > 1) notes.push('Only page 1 is read; split the PDF for the other floors.')
  let scale: number
  const dims = scaleFromDimensions(segs, texts)
  if (dims) {
    scale = 1 / dims.ptPerM
    notes.push(`Scale: from ${dims.agreed} printed dimensions that agree — 1 : ${(1 / (dims.ptPerM * PT)).toFixed(0)} on the sheet.`)
  } else {
    // the printed room sizes against the drawing's box (as a unitless DXF): rooms take about half a plan
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (const g of segs) for (const p of [g.a, g.b]) (box.x0 = Math.min(box.x0, p.x)), (box.y0 = Math.min(box.y0, p.y)), (box.x1 = Math.max(box.x1, p.x)), (box.y1 = Math.max(box.y1, p.y))
    const sizeArea = texts.reduce((acc, t) => {
      const d = parseDims(t.text)
      return acc + (d ? d.aM * d.bM : 0)
    }, 0)
    if (sizeArea > 0) {
      scale = Math.sqrt((0.5 * sizeArea) / ((box.x1 - box.x0) * (box.y1 - box.y0)))
      notes.push('Scale: no three printed dimensions agree — guessed from the printed room sizes; check it with the Studio\'s S tool.')
    } else {
      scale = 1
      notes.push('Scale not set: no printed dimensions or room sizes to measure against — set it with the Studio\'s S tool.')
    }
  }
  const drawing: Drawing = { segs, arcs, texts, loops: [], scale }
  const plan = buildPlan(drawing, name.replace(/\.pdf$/i, ''))
  notes.push('Layers: a PDF has none — walls are any parallel line pair 5–60 cm apart; a door is a quarter-circle swing drawn as a curve.')
  notes.push(...plan.notes)
  return { format: 'pdf', storeys: [{ name: 'Floor', elevationM: 0, unit: plan.unit }], notes, unitScale: scale, origin: plan.origin }
}
