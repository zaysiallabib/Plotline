/**
 * Vector-PDF import (session 29): page 1's drawn paths (pdf.js operator list: moveTo / lineTo / curveTo / closePath under
 * the current transform) become lines, its text runs become texts, and the same engine as DXF (plan2d.ts) makes the walls,
 * openings and labels. A PDF has no layers, so walls are any parallel line pair 5–60 cm apart. PDF units are points
 * (1/72 in) and the drawing's scale is not in the file: the printed dimensions ("14'-0\"") are measured against the line
 * they sit on; when three or more agree within 2 % that is the scale, else the printed room sizes give a rough one, else
 * unitScale 1 with a "scale not set" note for the Studio's S tool. A PDF whose page is only a picture is refused in
 * plain words.
 */
import { deriveRooms, type Pt } from '../core'
import { bezierArc, buildPlan, penRoles, sheetScale, sheetSymbols, type ArcPrim, type Drawing, type Fills, type Seg, type TextPrim } from './plan2d'
import { emptyUnit } from '../studio/model'
import type { ImportResult } from './types'
import type { Box, SheetPage, SheetText } from './sheets'

const CHORDS = 8
const PT = 0.0254 / 72

type M = [number, number, number, number, number, number]
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const ap = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })

/** an open PDF: its pages are read or drawn one by one (the Studio's page picker keeps it open; doc.loadingTask.destroy() closes it) */
export type PdfDoc = import('pdfjs-dist').PDFDocumentProxy

/** the browser takes the normal build with its worker; Node (the tests) the legacy build, which carries its own polyfills */
async function lib() {
  const pdfjs = await (typeof window === 'undefined' ? import('pdfjs-dist/legacy/build/pdf.mjs') : import('pdfjs-dist'))
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  }
  return pdfjs
}

/** Opens a PDF (a copy of the bytes: pdf.js moves what it is given to its worker). */
export async function openPdf(bytes: ArrayBuffer): Promise<PdfDoc> {
  return (await lib()).getDocument({ data: new Uint8Array(bytes.slice(0)), verbosity: 0 }).promise as Promise<PdfDoc>
}

/**
 * A page drawn on a white canvas, its longer side `longPx` pixels (browser only): the page picker's small pictures, and a
 * brochure page that is a picture becoming the plan picture to trace.
 */
export async function renderPage(doc: PdfDoc, pageNo: number, longPx: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNo)
  const one = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: longPx / Math.max(one.width, one.height) })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  page.cleanup()
  return canvas
}

/**
 * One view of a page (`frame`: sheets.ts, page points as the page is shown; null = the whole page) drawn on a white canvas,
 * its longer side `longPx` pixels (browser only): the Set panel's small pictures, and a view kept with the project or traced
 * as a picture. `pxPerPt`: canvas pixels per page point, so a printed scale gives the picture's pixels per metre.
 */
export async function renderView(doc: PdfDoc, pageNo: number, frame: Box | null, longPx: number): Promise<{ canvas: HTMLCanvasElement; pxPerPt: number }> {
  const page = await doc.getPage(pageNo)
  const one = page.getViewport({ scale: 1 })
  const rot = ((page.rotate % 360) + 360) % 360
  // the frame's corners back in PDF user space (pdf.ts turns a rotated page: undo it), then on the scale-1 viewport
  const unturn = (p: Pt): Pt => (rot === 90 ? { x: -p.y, y: p.x } : rot === 180 ? { x: -p.x, y: -p.y } : rot === 270 ? { x: p.y, y: -p.x } : p)
  const px = frame
    ? [{ x: frame.x0, y: frame.y0 }, { x: frame.x1, y: frame.y0 }, { x: frame.x0, y: frame.y1 }, { x: frame.x1, y: frame.y1 }].map((p) => {
        const q = unturn(p)
        const [x, y] = one.convertToViewportPoint(q.x, q.y)
        return { x, y }
      })
    : [{ x: 0, y: 0 }, { x: one.width, y: one.height }]
  const x0 = Math.max(0, Math.min(...px.map((p) => p.x))), y0 = Math.max(0, Math.min(...px.map((p) => p.y)))
  const x1 = Math.min(one.width, Math.max(...px.map((p) => p.x))), y1 = Math.min(one.height, Math.max(...px.map((p) => p.y)))
  const s = longPx / Math.max(1, x1 - x0, y1 - y0)
  const viewport = page.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -y0 * s })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((x1 - x0) * s))
  canvas.height = Math.max(1, Math.ceil((y1 - y0) * s))
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  page.cleanup()
  return { canvas, pxPerPt: s }
}

/** a page's lines (the clip paths left out) and texts, in PDF user space turned the way the page is shown */
async function readPage(doc: PdfDoc, pageNo: number): Promise<{ segs: Seg[]; arcs: ArcPrim[]; texts: TextPrim[]; words: SheetText[]; pictures: number; pages: number; shapes: Shape[]; box: Box }> {
  const pdfjs = await lib()
  const page = await doc.getPage(pageNo)
  const rot = ((page.rotate % 360) + 360) % 360
  const turn = (p: Pt): Pt => (rot === 90 ? { x: p.y, y: -p.x } : rot === 180 ? { x: -p.x, y: -p.y } : rot === 270 ? { x: -p.y, y: p.x } : p)
  const ops = await page.getOperatorList()
  const segs: Seg[] = []
  const arcs: ArcPrim[] = []
  // the pen: a PDF has no layers, but a CAD print draws each kind of line with its own weight and colour — every line
  // keeps them as its "layer" (`pen`), sorted into walls and the rest by penRoles
  let g = { ctm: [1, 0, 0, 1, 0, 0] as M, width: 1, stroke: '0', fill: '0' }
  const stack: (typeof g)[] = []
  let pictures = 0
  let pen = ''
  const shapes: Shape[] = []
  let shape: Pt[] = [] // the filled subpath being drawn: its area and outline length go to its pen (penRoles), with where it is
  const closeShape = () => {
    if (shape.length >= 3) {
      let a = 0, l = 0
      shape.forEach((q, i) => {
        const r = shape[(i + 1) % shape.length]
        a += q.x * r.y - r.x * q.y
        l += Math.hypot(r.x - q.x, r.y - q.y)
      })
      shapes.push({ pen, area: Math.abs(a) / 2, outline: l, at: turn(shape[0]) })
    }
    shape = []
  }
  const line = (a: Pt, b: Pt) => {
    segs.push({ a: turn(a), b: turn(b), layer: pen })
    if (pen.startsWith('fill ')) shape.push(b)
  }
  const colour = (a: unknown[]) => (typeof a[0] === 'string' ? a[0] : a.map((x) => Math.round(Number(x) * 255)).join(','))
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[]
    if (fn === pdfjs.OPS.save) stack.push({ ...g })
    else if (fn === pdfjs.OPS.restore) g = stack.pop() ?? g
    else if (fn === pdfjs.OPS.transform) g = { ...g, ctm: mul(g.ctm, args as M) }
    else if (fn === pdfjs.OPS.setLineWidth) g = { ...g, width: Number(args[0]) }
    else if (fn === pdfjs.OPS.setStrokeRGBColor || fn === pdfjs.OPS.setStrokeGray || fn === pdfjs.OPS.setStrokeCMYKColor || fn === pdfjs.OPS.setStrokeColor) g = { ...g, stroke: colour(args) }
    else if (fn === pdfjs.OPS.setFillRGBColor || fn === pdfjs.OPS.setFillGray || fn === pdfjs.OPS.setFillCMYKColor || fn === pdfjs.OPS.setFillColor) g = { ...g, fill: colour(args) }
    else if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject || fn === pdfjs.OPS.paintImageMaskXObject) pictures++
    else if (fn === pdfjs.OPS.constructPath) {
      const [paint, paths] = args as [number, (Float32Array | number[])[]]
      if (paint === pdfjs.OPS.endPath) continue // a clip, not a drawing
      const filled = paint === pdfjs.OPS.fill || paint === pdfjs.OPS.eoFill
      const ctm = g.ctm
      // (the weight in page points: a line 0.5 pt wide under a 2× transform is 1 pt)
      pen = filled ? `fill ${g.fill}` : `pen ${(g.width * Math.hypot(ctm[0], ctm[1])).toFixed(2)} ${g.stroke}`
      for (const d of paths) {
        let cur: Pt | null = null
        let start: Pt | null = null
        for (let k = 0; k < d.length; ) {
          const op = d[k++]
          if (op === 0) {
            closeShape()
            cur = start = ap(ctm, d[k], d[k + 1])
            if (filled) shape.push(cur)
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
              const q = bezierArc(turn(cur), turn(pts[0]), turn(pts[1]), turn(p3))
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
            closeShape()
          } else break
        }
        closeShape()
      }
    }
  }
  // texts: pdf.js splits a line into runs; runs on one baseline that nearly touch are one text
  const tc = await page.getTextContent()
  const runs = (tc.items as { str: string; transform: number[]; width: number }[]).filter((t) => t.str && t.str.trim() && t.transform).map((t) => {
    const [a, b, , , e, f] = t.transform
    const h = Math.hypot(a, b) || 1
    const dir = { x: a / h, y: b / h }
    return { str: t.str, at: { x: e, y: f }, end: { x: e + dir.x * t.width, y: f + dir.y * t.width }, dir, h, words: t.str }
  })
  const merged: (typeof runs)[number][] = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    const gap = last ? Math.hypot(r.at.x - last.end.x, r.at.y - last.end.y) : Infinity
    if (last && Math.abs(last.dir.x * r.dir.y - last.dir.y * r.dir.x) < 0.01 && gap < 0.6 * r.h) {
      last.str += r.str
      // (the words keep the gap between two runs as a space: "GROUND" "FLOOR PLAN" is "GROUND FLOOR PLAN" to sheets.ts)
      last.words += gap > 0.12 * r.h && !/\s$/.test(last.words) && !/^\s/.test(r.str) ? ` ${r.str}` : r.str
      last.end = r.end
    } else merged.push({ ...r })
  }
  // (a label's point is the middle of its text, so it lands in its room)
  // (fonts print the foot mark as a curly quote)
  const texts: TextPrim[] = merged.map((r) => ({ layer: '', at: turn({ x: (r.at.x + r.end.x) / 2, y: (r.at.y + r.end.y) / 2 }), text: r.str.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'), height: r.h }))
  // the same texts with their length and direction, for what kind of sheet this is (sheets.ts)
  const words: SheetText[] = merged.map((r, i) => ({ text: r.words.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'), at: texts[i].at, height: r.h, width: Math.hypot(r.end.x - r.at.x, r.end.y - r.at.y), dir: turn(r.dir) }))
  const [vx0, vy0, vx1, vy1] = page.view
  const corners = [turn({ x: vx0, y: vy0 }), turn({ x: vx1, y: vy1 })]
  const box: Box = { x0: Math.min(corners[0].x, corners[1].x), y0: Math.min(corners[0].y, corners[1].y), x1: Math.max(corners[0].x, corners[1].x), y1: Math.max(corners[0].y, corners[1].y) }
  page.cleanup()
  return { segs, arcs, texts, words, pictures, pages: doc.numPages, shapes, box }
}

/** a filled subpath: its pen, area and outline length (page points) and one of its corners (page frame) */
interface Shape {
  pen: string
  area: number
  outline: number
  at: Pt
}

/** What is on a page for sheets.ts: its box, texts and lines, in the page frame (turned as shown) — and how many pictures it holds. */
export async function readSheetPage(doc: PdfDoc, pageNo: number): Promise<SheetPage & { pictures: number }> {
  const r = await readPage(doc, pageNo)
  return { box: r.box, texts: r.words, segs: r.segs, arcs: r.arcs, pictures: r.pictures }
}

/**
 * Whether a page read as a drawing makes a plan: two or more closed rooms, and no more than 20 walls a room. A brochure
 * page drawn in vectors (a photo frame, words turned into outlines) gives lines but no rooms; a CAD print whose walls are
 * hatched gives a wall for every hatch line (measured: twindo's print 50 walls a room, real plans 3–9). Such a page is
 * better traced as a picture.
 */
export const readsAsPlan = (r: ImportResult): boolean =>
  r.storeys.some((s) => {
    const rooms = deriveRooms(s.unit).filter((x) => x.areaSqm >= 1).length
    return rooms >= 2 && s.unit.walls.length <= 20 * rooms
  })

/**
 * One page of a PDF (the file's bytes, or a PDF already open) read as a drawing; a page with no lines is refused. `frame`
 * (page frame, sheets.ts): only the lines, texts and fills inside it — one view of a page of several. `printed`: the view's
 * scale as its title prints it (1 : printed; its scale line may lie outside the frame).
 */
export async function importPdf(src: ArrayBuffer | PdfDoc, name: string, pageNo = 1, frame?: Box, printed?: number): Promise<ImportResult> {
  const doc = src instanceof ArrayBuffer ? await openPdf(src) : src
  const read = await readPage(doc, pageNo).finally(() => src instanceof ArrayBuffer && doc.loadingTask.destroy())
  const { pictures, pages } = read
  const ok = (p: Pt) => !frame || (p.x >= frame.x0 && p.x <= frame.x1 && p.y >= frame.y0 && p.y <= frame.y1)
  const inFrame = read.segs.filter((g) => ok({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 }))
  const arcsInFrame = read.arcs.filter((a) => ok(a.c))
  const texts = read.texts.filter((t) => ok(t.at))
  // the sheet's symbols (markers, bubbles, arrows, break lines) are no part of the building
  const symbols = sheetSymbols(inFrame, arcsInFrame, texts, PT)
  const segs = inFrame.filter((_, i) => !symbols.segs.has(i))
  const arcs = arcsInFrame.filter((_, i) => !symbols.arcs.has(i))
  const fills: Fills = new Map()
  for (const s of read.shapes) {
    if (!ok(s.at)) continue
    const f = fills.get(s.pen) ?? fills.set(s.pen, { area: 0, outline: 0 }).get(s.pen)!
    f.area += s.area
    f.outline += s.outline
  }
  if (!segs.length) throw new Error('This PDF is a picture, not a drawing — use the picture itself')
  const notes: string[] = [`PDF: ${pages} page(s); page ${pageNo}${frame ? ' (one of its drawings)' : ''} read: ${segs.length} lines, ${texts.length} texts${pictures ? `, ${pictures} picture(s) ignored` : ''}.`]
  const { scale, note } = printed ? { scale: printed * PT, note: `Scale: as printed under the drawing, 1 : ${+printed.toFixed(1)}.` } : sheetScale(segs, texts, (ptPerM) => ` — 1 : ${(1 / (ptPerM * PT)).toFixed(0)} on the sheet`, PT)
  notes.push(note)
  if (symbols.segs.size) notes.push(`${symbols.segs.size} lines of the sheet's symbols (markers and bubbles, arrows, break lines) left out of the walls.`)
  if (/not set/.test(note)) {
    // no scale on the page (no dimension, scale or room size printed as words: a brochure page whose words are drawn as
    // outlines): its lines read as metres make no walls — and a page of outlined words is tens of thousands of them (a
    // Dhaka brochure's plan page: minutes). It is a picture to trace; nothing more is read
    notes.push('Its lines were not read: with no scale printed as words on the page they make no walls — trace it as a picture (S, then Auto-trace).')
    return { format: 'pdf', storeys: [{ name: 'Floor', elevationM: 0, unit: { ...emptyUnit(), name: name.replace(/\.pdf$/i, '') } }], notes, unitScale: 1, origin: { x: 0, y: 0 } }
  }
  const pens = penRoles(segs, fills, scale)
  const drawing: Drawing = { segs: segs.map((g) => ({ ...g, layer: pens.walls.has(g.layer) ? 'WALL' : '' })), arcs, texts, loops: [], scale }
  const plan = buildPlan(drawing, name.replace(/\.pdf$/i, ''))
  notes.push(pens.walls.size ? `Layers: a PDF has none — its lines were sorted by pen: the heaviest (${pens.words}) taken as walls, the rest as doors, windows and the like.` : 'Layers: a PDF has none and its lines are all one pen — walls are any parallel line pair 5–60 cm apart; a door is a quarter-circle swing drawn as a curve.')
  notes.push(...plan.notes)
  return { format: 'pdf', storeys: [{ name: 'Floor', elevationM: 0, unit: plan.unit }], notes, unitScale: scale, origin: plan.origin }
}
