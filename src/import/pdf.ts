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
import { buildPlan, quarterArc, sheetScale, type ArcPrim, type Drawing, type Seg, type TextPrim } from './plan2d'
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
              const q = quarterArc(turn(cur), turn(pts[0]), turn(pts[1]), turn(p3))
              if (q) arcs.push({ ...q, layer: '' })
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

export async function importPdf(bytes: ArrayBuffer, name: string): Promise<ImportResult> {
  const { segs, arcs, texts, pictures, pages } = await readPage(bytes)
  if (!segs.length) throw new Error('This PDF is a picture, not a drawing — use the picture itself')
  const notes: string[] = [`PDF: ${pages} page(s); page 1 read: ${segs.length} lines, ${texts.length} texts${pictures ? `, ${pictures} picture(s) ignored` : ''}.`]
  if (pages > 1) notes.push('Only page 1 is read; split the PDF for the other floors.')
  const { scale, note } = sheetScale(segs, texts, (ptPerM) => ` — 1 : ${(1 / (ptPerM * PT)).toFixed(0)} on the sheet`)
  notes.push(note)
  const drawing: Drawing = { segs, arcs, texts, loops: [], scale }
  const plan = buildPlan(drawing, name.replace(/\.pdf$/i, ''))
  notes.push('Layers: a PDF has none — walls are any parallel line pair 5–60 cm apart; a door is a quarter-circle swing drawn as a curve.')
  notes.push(...plan.notes)
  return { format: 'pdf', storeys: [{ name: 'Floor', elevationM: 0, unit: plan.unit }], notes, unitScale: scale, origin: plan.origin }
}
