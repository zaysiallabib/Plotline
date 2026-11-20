/**
 * SVG plans (session 31): a floor plan saved as SVG — from a drawing program (AutoCAD / ArchiCAD / Revit through a PDF,
 * Illustrator, Inkscape, LibreCAD, QCAD) or a floor-plan app — read by the same engine as DXF and PDF (plan2d.ts): its
 * lines, polylines, polygons, rectangles, circles, ellipses, paths (lines, curves, arcs) and <use> copies of symbols, under
 * their transforms. A group's Inkscape label / id / class is its layer ("A-WALL", "Doors"…), so a layered SVG reads like
 * a DXF; a flat one like a PDF (parallel line pairs). Texts become room names and printed sizes.
 *
 * SVG is y-down; plan2d reads the file frame y-up, so every point goes in with y negated. An SVG has no drawing scale
 * (its mm size is the paper's): as for a PDF, the printed dimensions measured on their lines give it, else the printed room
 * sizes, else "set it with S". A pure reader — a small XML tokenizer, no DOM — so it runs in the tests and anywhere.
 */
import type { Pt } from '../core'
import { ROLE_WORDS, buildPlan, guessScale, quarterArc, roleOf, sheetScale, type ArcPrim, type Drawing, type LayerRoles, type Loop, type Seg, type TextPrim } from './plan2d'
import type { ImportResult } from './types'

// ---------- XML ----------

interface El {
  name: string
  attrs: Record<string, string>
  children: El[]
  /** text directly inside (for <text> / <tspan>) */
  text: string
}

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITY[e] ?? m)))

/** An XML document → its element tree (comments, <?…?>, DOCTYPE dropped; CDATA kept as text). Lenient: a stray close tag is skipped. */
export function parseXml(src: string): El {
  const root: El = { name: '#root', attrs: {}, children: [], text: '' }
  const stack: El[] = [root]
  const s = src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;'))
  const tag = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  const attr = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  for (let m = tag.exec(s); m; m = tag.exec(s)) {
    const top = stack[stack.length - 1]
    if (m[5] !== undefined) {
      top.text += decode(m[5])
      continue
    }
    const [, close, name, rest, self] = m
    if (close) {
      const i = stack.map((e) => e.name).lastIndexOf(name)
      if (i > 0) stack.length = i
      continue
    }
    const el: El = { name, attrs: {}, children: [], text: '' }
    for (let a = attr.exec(rest); a; a = attr.exec(rest)) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? '')
    attr.lastIndex = 0
    top.children.push(el)
    if (!self) stack.push(el)
  }
  return root
}

// ---------- transforms (a, b, c, d, e, f: x' = a x + c y + e, y' = b x + d y + f) ----------

type M = [number, number, number, number, number, number]
const I: M = [1, 0, 0, 1, 0, 0]
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]
const ap = (m: M, x: number, y: number): Pt => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] })
const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi
const nums = (s: string | undefined): number[] => (s ?? '').match(NUM)?.map(Number) ?? []

/** a `transform` attribute → one matrix (the list applied left to right, as SVG says) */
export function parseTransform(s: string | undefined): M {
  let m = I
  for (const t of (s ?? '').matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = nums(t[2])
    const r = ((v[0] ?? 0) * Math.PI) / 180
    let n: M = I
    switch (t[1]) {
      case 'matrix': n = v.length >= 6 ? (v.slice(0, 6) as M) : I; break
      case 'translate': n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0]; break
      case 'scale': n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]; break
      case 'rotate': {
        const R: M = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]
        n = v.length >= 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], R), [1, 0, 0, 1, -v[1], -v[2]]) : R
        break
      }
      case 'skewX': n = [1, 0, Math.tan(r), 1, 0, 0]; break
      case 'skewY': n = [1, Math.tan(r), 0, 1, 0, 0]; break
    }
    m = mul(m, n)
  }
  return m
}

// ---------- the drawing ----------

const CHORDS = 8
/** what a style attribute or the attribute itself says (style wins, as in a browser) */
const prop = (el: El, k: string): string | undefined => new RegExp(`(?:^|;)\\s*${k}\\s*:\\s*([^;]+)`).exec(el.attrs.style ?? '')?.[1]?.trim() ?? el.attrs[k]
/** an Illustrator layer id spells its spaces and dashes as _x20_ / _x2D_ */
const unIllustrator = (s: string) => s.replace(/_x([0-9a-f]{2,4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
/** a group's layer name: its Inkscape label, else a meaningful id or class (not Inkscape's own "g123" / "layer1") */
const layerName = (el: El): string | null => {
  const named = [el.attrs['inkscape:label'], el.attrs.id, el.attrs.class, el.attrs['data-name']].find((v) => v && !/^(g|layer|svg|path|group)[-_]?\d+$/i.test(v))
  return named ? unIllustrator(named) : null
}
const NOT_DRAWN = new Set(['defs', 'symbol', 'clipPath', 'mask', 'pattern', 'marker', 'style', 'script', 'metadata', 'title', 'desc', 'linearGradient', 'radialGradient', 'filter', 'foreignObject', 'sodipodi:namedview'])

interface Out {
  segs: Seg[]
  arcs: ArcPrim[]
  texts: TextPrim[]
  loops: Loop[]
  pictures: number
}

/** an SVG document → its lines, door arcs, closed shapes and texts in the file frame (y up, user units) */
export function readSvg(src: string): Out & { layers: Map<string, number> } {
  const root = parseXml(src)
  const svg = root.children.find((e) => e.name === 'svg' || e.name.endsWith(':svg'))
  if (!svg) throw new Error('This file is not an SVG drawing')
  const byId = new Map<string, El>()
  const index = (e: El) => {
    if (e.attrs.id) byId.set(e.attrs.id, e)
    e.children.forEach(index)
  }
  index(svg)
  const out: Out = { segs: [], arcs: [], texts: [], loops: [], pictures: 0 }
  const layers = new Map<string, number>()
  // y up: the whole drawing flipped once
  const FLIP: M = [1, 0, 0, -1, 0, 0]

  const walk = (el: El, m: M, layer: string, fontSize: number, depth: number) => {
    if (depth > 32 || NOT_DRAWN.has(el.name)) return
    if (prop(el, 'display') === 'none' || prop(el, 'visibility') === 'hidden') return
    const here = mul(m, parseTransform(el.attrs.transform))
    const fs = nums(prop(el, 'font-size'))[0] ?? fontSize
    const name = el.name.replace(/^svg:/, '')
    const seg = (a: Pt, b: Pt) => {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return
      out.segs.push({ a, b, layer })
      layers.set(layer, (layers.get(layer) ?? 0) + 1)
    }
    const poly = (pts: Pt[], closed: boolean) => {
      for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1])
      if (closed && pts.length > 2) seg(pts[pts.length - 1], pts[0]), out.loops.push({ pts, layer })
    }
    const P = (x: number, y: number) => ap(here, x, y)
    const a = (k: string) => Number(el.attrs[k] ?? 0) || 0
    switch (name) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch': {
        const own = name === 'g' ? layerName(el) : null
        const inner = name === 'svg' && depth > 0 ? mul(here, [1, 0, 0, 1, a('x'), a('y')]) : here
        for (const c of el.children) walk(c, inner, own ?? layer, fs, depth + 1)
        return
      }
      case 'use': {
        const ref = byId.get((el.attrs.href ?? el.attrs['xlink:href'] ?? '').replace(/^#/, ''))
        if (!ref) return
        const at = mul(here, [1, 0, 0, 1, a('x'), a('y')])
        const kids = ref.name === 'symbol' ? ref.children : [ref]
        const own = layerName(ref) ?? layer
        for (const c of kids) walk(c, at, own, fs, depth + 1)
        return
      }
      case 'line':
        return seg(P(a('x1'), a('y1')), P(a('x2'), a('y2')))
      case 'polyline':
      case 'polygon': {
        const v = nums(el.attrs.points)
        const pts: Pt[] = []
        for (let i = 0; i + 1 < v.length; i += 2) pts.push(P(v[i], v[i + 1]))
        return poly(pts, name === 'polygon')
      }
      case 'rect': {
        const x = a('x'), y = a('y'), w = a('width'), h = a('height')
        if (w > 0 && h > 0) poly([P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], true)
        return
      }
      case 'circle':
      case 'ellipse': {
        const rx = name === 'circle' ? a('r') : a('rx'), ry = name === 'circle' ? a('r') : a('ry')
        if (rx > 0 && ry > 0) poly(Array.from({ length: 4 * CHORDS }, (_, i) => P(a('cx') + rx * Math.cos((i * Math.PI) / (2 * CHORDS)), a('cy') + ry * Math.sin((i * Math.PI) / (2 * CHORDS)))), true)
        return
      }
      case 'path':
        return path(el.attrs.d ?? '', here, poly, (arc) => out.arcs.push({ ...arc, layer }))
      case 'text':
        return text(el, here, layer, fs)
      case 'image':
        out.pictures++
        return
    }
  }

  /** a <text>: one text per line (a tspan with its own x / y starts a line), its point the middle of the words */
  const text = (el: El, m: M, layer: string, fs0: number) => {
    const lines: { x: number; y: number; s: string; fs: number; anchor: string }[] = []
    const anchorOf = (e: El, up: string) => prop(e, 'text-anchor') ?? up
    let x = nums(el.attrs.x)[0] ?? 0, y = nums(el.attrs.y)[0] ?? 0
    const start = (e: El, fs: number, anchor: string) => {
      if (e.attrs.x !== undefined) x = nums(e.attrs.x)[0] ?? x
      if (e.attrs.y !== undefined) y = nums(e.attrs.y)[0] ?? y
      if (e.attrs.dx !== undefined) x += nums(e.attrs.dx)[0] ?? 0
      if (e.attrs.dy !== undefined) y += nums(e.attrs.dy)[0] ?? 0
      lines.push({ x, y, s: '', fs, anchor })
    }
    const anchor0 = anchorOf(el, 'start')
    lines.push({ x, y, s: el.text, fs: fs0, anchor: anchor0 })
    for (const t of el.children) {
      if (t.name !== 'tspan' || prop(t, 'display') === 'none') continue
      const fs = nums(prop(t, 'font-size'))[0] ?? fs0
      const newLine = t.attrs.y !== undefined || t.attrs.dy !== undefined || t.attrs.x !== undefined
      if (newLine && lines[lines.length - 1].s.trim()) start(t, fs, anchorOf(t, anchor0))
      else if (newLine) {
        lines.pop()
        start(t, fs, anchorOf(t, anchor0))
      }
      lines[lines.length - 1].s += t.text + t.children.map((c) => c.text).join('')
    }
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1
    for (const l of lines) {
      const s = l.s.replace(/\s+/g, ' ').trim()
      if (!s) continue
      // the words' middle: half their width along the line (≈ 0.55 em a letter), a third of a letter above the baseline
      const w = 0.55 * l.fs * s.length
      const along = l.anchor === 'middle' ? 0 : l.anchor === 'end' ? -w / 2 : w / 2
      const at = ap(m, l.x + along, l.y - 0.35 * l.fs)
      out.texts.push({ at, text: s.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'), height: l.fs * k, layer })
    }
  }

  walk(svg, FLIP, '', 16, 0)
  return { ...out, layers }
}

/**
 * A path's `d` → lines (curves cut into chords), a door's quarter circle (an arc command, or a bezier that is one) as an
 * arc too, closed sub-paths as closed shapes. Points through `m` (which already flips y).
 */
function path(d: string, m: M, poly: (pts: Pt[], closed: boolean) => void, arc: (a: { c: Pt; r: number; a0: number; a1: number }) => void): void {
  const toks = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []
  let i = 0
  let cmd = ''
  let cx = 0, cy = 0, sx = 0, sy = 0
  let lastCtrl: Pt | null = null // for S / T
  let pts: Pt[] = []
  const P = (x: number, y: number) => ap(m, x, y)
  const flush = (closed: boolean) => {
    if (pts.length >= 2) poly(pts, closed)
    pts = []
  }
  const num = () => Number(toks[i++])
  /** an arc flag: '0' / '1', which writers often run into the next number ("a1 1 0 01 2 3") */
  const flag = () => {
    const t = toks[i]
    if (t === '0' || t === '1') return i++, Number(t)
    toks[i] = t.slice(1)
    return Number(t[0])
  }
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const p0 = P(cx, cy), p1 = P(x1, y1), p2 = P(x2, y2), p3 = P(x, y)
    const q = quarterArc(p0, p1, p2, p3)
    if (q) arc(q)
    for (let k = 1; k <= CHORDS; k++) {
      const t = k / CHORDS, u = 1 - t
      pts.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y })
    }
  }
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++]
    else if (!cmd) {
      i++
      continue
    }
    const rel = cmd === cmd.toLowerCase()
    const ox = rel ? cx : 0, oy = rel ? cy : 0
    switch (cmd.toUpperCase()) {
      case 'M': {
        flush(false)
        cx = ox + num(), cy = oy + num()
        sx = cx, sy = cy
        pts.push(P(cx, cy))
        cmd = rel ? 'l' : 'L' // more pairs after a moveto are linetos
        lastCtrl = null
        break
      }
      case 'L':
        cx = ox + num(), cy = oy + num()
        pts.push(P(cx, cy))
        lastCtrl = null
        break
      case 'H':
        cx = ox + num()
        pts.push(P(cx, cy))
        lastCtrl = null
        break
      case 'V':
        cy = oy + num()
        pts.push(P(cx, cy))
        lastCtrl = null
        break
      case 'C': {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num()
        cubic(x1, y1, x2, y2, x, y)
        lastCtrl = { x: x2, y: y2 }
        cx = x, cy = y
        break
      }
      case 'S': {
        const x1 = lastCtrl ? 2 * cx - lastCtrl.x : cx, y1 = lastCtrl ? 2 * cy - lastCtrl.y : cy
        const x2 = ox + num(), y2 = oy + num(), x = ox + num(), y = oy + num()
        cubic(x1, y1, x2, y2, x, y)
        lastCtrl = { x: x2, y: y2 }
        cx = x, cy = y
        break
      }
      case 'Q':
      case 'T': {
        const q: Pt = cmd.toUpperCase() === 'Q' ? { x: ox + num(), y: oy + num() } : lastCtrl ? { x: 2 * cx - lastCtrl.x, y: 2 * cy - lastCtrl.y } : { x: cx, y: cy }
        const x = ox + num(), y = oy + num()
        // a quadratic as the cubic it is
        cubic(cx + (2 / 3) * (q.x - cx), cy + (2 / 3) * (q.y - cy), x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), x, y)
        lastCtrl = q
        cx = x, cy = y
        break
      }
      case 'A': {
        let rx = Math.abs(num()), ry = Math.abs(num())
        const phi = (num() * Math.PI) / 180
        const large = flag(), sweep = flag()
        const x = ox + num(), y = oy + num()
        // SVG's endpoint arc → centre form (SVG 1.1 F.6.5)
        const dx = (cx - x) / 2, dy = (cy - y) / 2
        const x1 = Math.cos(phi) * dx + Math.sin(phi) * dy, y1 = -Math.sin(phi) * dx + Math.cos(phi) * dy
        const lam = (x1 * x1) / (rx * rx || 1) + (y1 * y1) / (ry * ry || 1)
        if (lam > 1) (rx *= Math.sqrt(lam)), (ry *= Math.sqrt(lam))
        if (!rx || !ry) {
          cx = x, cy = y
          pts.push(P(x, y))
          break
        }
        const sign = large === sweep ? -1 : 1
        const co = sign * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1) / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
        const ccx = co * ((rx * y1) / ry), ccy = co * (-(ry * x1) / rx)
        const ex = Math.cos(phi) * ccx - Math.sin(phi) * ccy + (cx + x) / 2, ey = Math.sin(phi) * ccx + Math.cos(phi) * ccy + (cy + y) / 2
        const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        const t0 = ang(1, 0, (x1 - ccx) / rx, (y1 - ccy) / ry)
        let dt = ang((x1 - ccx) / rx, (y1 - ccy) / ry, (-x1 - ccx) / rx, (-y1 - ccy) / ry)
        if (!sweep && dt > 0) dt -= 2 * Math.PI
        if (sweep && dt < 0) dt += 2 * Math.PI
        const n = Math.max(2, Math.ceil((Math.abs(dt) / (Math.PI / 2)) * CHORDS))
        const at = (t: number) => P(ex + rx * Math.cos(phi) * Math.cos(t) - ry * Math.sin(phi) * Math.sin(t), ey + rx * Math.sin(phi) * Math.cos(t) + ry * Math.cos(phi) * Math.sin(t))
        for (let k = 1; k <= n; k++) pts.push(at(t0 + (dt * k) / n))
        // a circular quarter (± 10°): a door swing, in the file frame (counter-clockwise from a0 to a1 there)
        const k2 = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
        if (Math.abs(rx - ry) < 0.02 * rx && Math.abs(Math.abs(dt) - Math.PI / 2) < Math.PI / 18) {
          const C = P(ex, ey), E0 = at(t0), E1 = at(t0 + dt)
          const b0 = Math.atan2(E0.y - C.y, E0.x - C.x), b1 = Math.atan2(E1.y - C.y, E1.x - C.x)
          const ccw = (E0.x - C.x) * (E1.y - C.y) - (E0.y - C.y) * (E1.x - C.x) > 0
          arc({ c: C, r: rx * k2, a0: ccw ? b0 : b1, a1: ccw ? b1 : b0 })
        }
        cx = x, cy = y
        lastCtrl = null
        break
      }
      case 'Z':
        if (pts.length) pts.push(P(sx, sy))
        flush(true)
        cx = sx, cy = sy
        pts.push(P(cx, cy))
        lastCtrl = null
        break
      default:
        i++
    }
  }
  flush(false)
}

/** `mine`: the person's corrections of what a layer (a named group) holds */
export async function importSvg(src: string, name: string, mine?: LayerRoles): Promise<ImportResult> {
  const r = readSvg(src)
  if (!r.segs.length) throw new Error(r.pictures ? 'This SVG holds only a picture, no lines: drop the picture itself and trace it' : 'This SVG has no lines to read')
  const notes: string[] = [`SVG: ${r.segs.length} lines, ${r.texts.length} texts${r.pictures ? `, ${r.pictures} picture(s) ignored` : ''}.`]
  const named = [...r.layers].filter(([l]) => l)
  const list = named.sort((p, q) => q[1] - p[1]).map(([l, n]) => ({ name: l, role: roleOf(l, undefined, mine), count: n, yours: !!mine?.[l.toUpperCase()] }))
  for (const l of list.slice(0, 12)) notes.push(`Layer "${l.name}": ${ROLE_WORDS[l.role]}${l.yours ? ' (as you set it)' : ''} (${l.count}).`)
  if (!named.length) notes.push('Layers: none named — walls are any parallel line pair 5–60 cm apart.')
  let { scale, note } = sheetScale(r.segs, r.texts)
  if (/not set/.test(note)) {
    // no printed size at all: a CAD export keeps the drawing's own units — the size says which (a plan is 3–200 m wide)
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (const g of r.segs) for (const p of [g.a, g.b]) (box.x0 = Math.min(box.x0, p.x)), (box.y0 = Math.min(box.y0, p.y)), (box.x1 = Math.max(box.x1, p.x)), (box.y1 = Math.max(box.y1, p.y))
    const g = guessScale({ w: box.x1 - box.x0, h: box.y1 - box.y0 }, 0)
    scale = g.scale
    note = `Scale: no printed dimensions or room sizes — the drawing's units read as ${g.words}; check it with the Studio's S tool.`
  }
  notes.push(note)
  const drawing: Drawing = { segs: r.segs, arcs: r.arcs, texts: r.texts, loops: r.loops, scale, layerRoles: mine }
  const plan = buildPlan(drawing, name.replace(/\.svg$/i, ''))
  notes.push(...plan.notes)
  return { format: 'svg', storeys: [{ name: 'Floor', elevationM: 0, unit: plan.unit }], notes, unitScale: scale, origin: plan.origin, ...(list.length ? { layers: list } : {}) }
}
