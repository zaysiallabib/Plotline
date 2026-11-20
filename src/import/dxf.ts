/**
 * DXF import (session 29): a 2D architectural floor-plan DXF → one storey (elevation 0) as an editable Unit draft, no
 * shell. dxf-parser reads the file; this flattens every entity (blocks recursed with their insert transform) into the
 * lines / arcs / texts / closed loops of plan2d.ts, which does the walls, openings, columns and labels. The notes tell
 * staff the DXF version, the units found or guessed, each layer and what it was taken as, the counts, what was skipped.
 */
import DxfParser from 'dxf-parser'
import type IGeometry from 'dxf-parser/dist/entities/geomtry'
import type { IArcEntity, ICircleEntity, IDimensionEntity, IDxf, IEllipseEntity, IEntity, IInsertEntity, ILineEntity, ILwpolylineEntity, IMtextEntity, IPolylineEntity, ISolidEntity, ISplineEntity, ITextEntity } from 'dxf-parser'
import type { Pt } from '../core'
import { buildPlan, roleOf, type ArcPrim, type Drawing, type Loop, type Role, type Seg, type TextPrim } from './plan2d'
import { parseDims } from '../trace/text'
import type { ImportResult } from './types'

/** $INSUNITS → metres per unit (0 = unitless: guessed from the extent) */
const INSUNITS: Record<number, [number, string]> = { 1: [0.0254, 'inches'], 2: [0.3048, 'feet'], 3: [1609.344, 'miles'], 4: [0.001, 'millimetres'], 5: [0.01, 'centimetres'], 6: [1, 'metres'], 7: [1000, 'kilometres'], 8: [0.0254 / 1000, 'microinches'], 9: [0.0254 / 1000, 'mils'], 10: [0.9144, 'yards'], 14: [0.1, 'decimetres'] }

/** a 2D affine transform: p' = o + M·p */
interface Xf {
  m: [number, number, number, number]
  o: Pt
}
const apply = (x: Xf, p: Pt): Pt => ({ x: x.o.x + x.m[0] * p.x + x.m[1] * p.y, y: x.o.y + x.m[2] * p.x + x.m[3] * p.y })
const compose = (outer: Xf, inner: Xf): Xf => ({
  m: [outer.m[0] * inner.m[0] + outer.m[1] * inner.m[2], outer.m[0] * inner.m[1] + outer.m[1] * inner.m[3], outer.m[2] * inner.m[0] + outer.m[3] * inner.m[2], outer.m[2] * inner.m[1] + outer.m[3] * inner.m[3]],
  o: apply(outer, inner.o),
})
const IDENT: Xf = { m: [1, 0, 0, 1], o: { x: 0, y: 0 } }

/** MTEXT formatting codes stripped: \P = new line, {\fArial|b0;…}, \A1;, \H2.5x;, \C1;, \W, \Q, \T, \L \O \K, %%d %%p %%c, ^J */
export function stripMtext(s: string): string {
  return s
    .replace(/\\P|\^J/g, '\n')
    .replace(/\\[ACFHQTWfpc][^;]*;/g, '')
    .replace(/\\[LlOoKkNn~]/g, '')
    .replace(/\\S([^;^]*)[\^/#]([^;]*);/g, '$1/$2')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[uUoO]/g, '')
    .replace(/%%%/g, '%')
    .replace(/[{}]/g, '')
}

interface Flat {
  segs: Seg[]
  arcs: ArcPrim[]
  texts: TextPrim[]
  loops: Loop[]
  skipped: Map<string, number>
  inserts: number
}

const CHORD_PER_QUARTER = 8

/**
 * HATCH, which dxf-parser leaves out: its boundary paths (a polyline path, or edges: lines, arcs, ellipses, splines as
 * their control polygon) as closed loops. A hatched wall's edges are its faces; a solid hatch on a column layer is a column.
 */
interface IHatchEntity extends IEntity {
  type: 'HATCH'
  paths: Pt[][]
  pattern: string
}
class Hatch {
  ForEntityName = 'HATCH' as const
  parseEntity(scanner: { next(): { code: number; value: unknown }; isEOF(): boolean }, curr: { code: number; value: unknown }): IHatchEntity {
    const groups: { code: number; value: unknown }[] = []
    const entity = { type: 'HATCH', paths: [], pattern: '', layer: '0' } as unknown as IHatchEntity
    curr = scanner.next()
    while (!scanner.isEOF() && curr.code !== 0) {
      if (curr.code === 8) entity.layer = String(curr.value)
      else if (curr.code === 2) entity.pattern = String(curr.value)
      else if (curr.code === 67) entity.inPaperSpace = Number(curr.value) === 1
      groups.push(curr)
      curr = scanner.next()
    }
    // the boundary data runs from the first 91 group on, in order
    let i = groups.findIndex((g) => g.code === 91)
    if (i < 0) return entity
    const num = (code: number): number => {
      while (i < groups.length && groups[i].code !== code) i++
      return i < groups.length ? Number(groups[i++].value) : NaN
    }
    const nPaths = num(91)
    for (let p = 0; p < nPaths && i < groups.length; p++) {
      const flags = num(92)
      const pts: Pt[] = []
      if (flags & 2) {
        num(72) // has bulge
        num(73) // closed
        const n = num(93)
        const raw: { x: number; y: number; bulge?: number }[] = []
        for (let k = 0; k < n; k++) {
          const x = num(10), y = num(20)
          const v: { x: number; y: number; bulge?: number } = { x, y }
          if (i < groups.length && groups[i].code === 42) v.bulge = Number(groups[i++].value)
          raw.push(v)
        }
        raw.forEach((v, k) => {
          const w = raw[(k + 1) % raw.length]
          pts.push({ x: v.x, y: v.y })
          if (!v.bulge) return
          const th = 4 * Math.atan(v.bulge)
          const chord = Math.hypot(w.x - v.x, w.y - v.y)
          if (chord < 1e-9) return
          const r = chord / (2 * Math.sin(Math.abs(th) / 2))
          const mid = { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 }
          const h = r * Math.cos(th / 2) * Math.sign(v.bulge)
          const perp = { x: -(w.y - v.y) / chord, y: (w.x - v.x) / chord }
          const c = { x: mid.x - perp.x * h, y: mid.y - perp.y * h }
          const s0 = Math.atan2(v.y - c.y, v.x - c.x), s1 = Math.atan2(w.y - c.y, w.x - c.x)
          const ch = arcChords(c, r, th > 0 ? s0 : s1, th > 0 ? s1 : s0).slice(1, -1)
          pts.push(...(th > 0 ? ch : ch.reverse()))
        })
      } else {
        const n = num(93)
        for (let k = 0; k < n; k++) {
          const type = num(72)
          if (type === 1) pts.push({ x: num(10), y: num(20) }, { x: num(11), y: num(21) })
          else if (type === 2) {
            const c = { x: num(10), y: num(20) }, r = num(40), a0 = (num(50) * Math.PI) / 180, a1 = (num(51) * Math.PI) / 180, ccw = num(73)
            const ch = arcChords(c, r, a0, a1)
            pts.push(...(ccw ? ch : ch.reverse()))
          } else if (type === 3) {
            const c = { x: num(10), y: num(20) }, mx = num(11), my = num(21), ratio = num(40), a0 = (num(50) * Math.PI) / 180, a1 = (num(51) * Math.PI) / 180
            num(73)
            const ra = Math.hypot(mx, my), rot = Math.atan2(my, mx)
            let sweep = a1 - a0
            while (sweep <= 0) sweep += 2 * Math.PI
            const m = Math.max(4, Math.ceil((sweep / (Math.PI / 2)) * CHORD_PER_QUARTER))
            for (let j = 0; j <= m; j++) {
              const t = a0 + (sweep * j) / m
              const x = ra * Math.cos(t), y = ra * ratio * Math.sin(t)
              pts.push({ x: c.x + x * Math.cos(rot) - y * Math.sin(rot), y: c.y + x * Math.sin(rot) + y * Math.cos(rot) })
            }
          } else if (type === 4) {
            num(94)
            num(73)
            num(74)
            const nk = num(95), nc = num(96)
            for (let j = 0; j < nk; j++) num(40)
            for (let j = 0; j < nc; j++) {
              pts.push({ x: num(10), y: num(20) })
              if (i < groups.length && groups[i].code === 42) i++
            }
            const nf = num(97)
            for (let j = 0; j < nf; j++) (num(11), num(21))
          } else break
        }
      }
      const nSrc = num(97)
      for (let k = 0; k < nSrc; k++) num(330)
      // (consecutive duplicate points dropped)
      const clean = pts.filter((q, k) => k === 0 || Math.hypot(q.x - pts[k - 1].x, q.y - pts[k - 1].y) > 1e-9)
      if (clean.length >= 3) entity.paths.push(clean)
    }
    return entity
  }
}

/**
 * MLINE (AutoCAD's multiline: a wall drawn as two or more parallel lines at once), which dxf-parser leaves out. Each vertex
 * carries its miter direction and, per element, the element's distance along that miter (scale and justification already
 * in), so each element's own polyline is vertex + miter × distance — the walls' two faces, without the style table.
 */
interface IMlineEntity extends IEntity {
  type: 'MLINE'
  elements: Pt[][]
  closed: boolean
}
class Mline {
  ForEntityName = 'MLINE' as const
  parseEntity(scanner: { next(): { code: number; value: unknown }; isEOF(): boolean }, curr: { code: number; value: unknown }): IMlineEntity {
    const e = { type: 'MLINE', elements: [], closed: false, layer: '0' } as unknown as IMlineEntity
    let vertex: Pt | null = null
    let miter: Pt = { x: 0, y: 1 }
    let element = -1
    let firstParam = false
    curr = scanner.next()
    while (!scanner.isEOF() && curr.code !== 0) {
      const v = Number(curr.value)
      switch (curr.code) {
        case 8: e.layer = String(curr.value); break
        case 67: e.inPaperSpace = v === 1; break
        case 71: e.closed = (v & 2) !== 0; break
        case 11: vertex = { x: v, y: 0 }; element = -1; break
        case 21: if (vertex) vertex.y = v; break
        case 13: miter = { x: v, y: 0 }; break
        case 23: miter.y = v; break
        case 74: element++; firstParam = true; break
        case 41:
          if (firstParam && vertex && element >= 0) (e.elements[element] ??= []).push({ x: vertex.x + miter.x * v, y: vertex.y + miter.y * v })
          firstParam = false
          break
      }
      curr = scanner.next()
    }
    return e
  }
}

/**
 * A SPLINE's curve (non-rational B-spline by de Boor, 8 points per span); its fit points, else its control polygon, when
 * the knots do not match. ponytail: weights (group 41) are not read by dxf-parser — a rational spline (rare in plans: a
 * true circle drawn as a spline) comes out slightly off; read them in a handler like Mline's if one ever matters.
 */
export function splinePoints(ctrl: Pt[], knots: number[] | undefined, degree: number | undefined, fit?: Pt[]): Pt[] {
  const p = degree ?? 3
  if (!knots || ctrl.length <= p || knots.length !== ctrl.length + p + 1) return fit && fit.length >= 2 ? fit : ctrl
  const at = (t: number): Pt => {
    let k = p
    while (k < ctrl.length - 1 && t >= knots[k + 1]) k++
    const d = Array.from({ length: p + 1 }, (_, j) => ({ ...ctrl[k - p + j] }))
    for (let r = 1; r <= p; r++)
      for (let j = p; j >= r; j--) {
        const i = k - p + j
        const den = knots[i + p - r + 1] - knots[i]
        const a = den ? (t - knots[i]) / den : 0
        d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y }
      }
    return d[p]
  }
  const t0 = knots[p], t1 = knots[ctrl.length]
  const n = Math.max(2, (ctrl.length - p) * 8)
  return Array.from({ length: n + 1 }, (_, i) => at(t0 + ((t1 - t0) * i) / n))
}

function arcChords(c: Pt, r: number, a0: number, a1: number): Pt[] {
  let sweep = a1 - a0
  while (sweep <= 0) sweep += 2 * Math.PI
  const n = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * CHORD_PER_QUARTER))
  return Array.from({ length: n + 1 }, (_, i) => ({ x: c.x + r * Math.cos(a0 + (sweep * i) / n), y: c.y + r * Math.sin(a0 + (sweep * i) / n) }))
}

function flatten(dxf: IDxf, entities: IEntity[], xf: Xf, out: Flat, block: string | undefined, inst: number | undefined, depth: number, frozen: Set<string>): void {
  const det = xf.m[0] * xf.m[3] - xf.m[1] * xf.m[2]
  const rscale = Math.sqrt(Math.abs(det))
  const skip = (what: string) => out.skipped.set(what, (out.skipped.get(what) ?? 0) + 1)
  const base = (e: IEntity) => ({ layer: e.layer ?? '0', block, inst })
  const line = (e: IEntity, a: Pt, b: Pt) => out.segs.push({ ...base(e), a: apply(xf, a), b: apply(xf, b) })
  const poly = (e: IEntity, pts: Pt[], closed: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) line(e, pts[i], pts[i + 1])
    if (closed && pts.length > 2) line(e, pts[pts.length - 1], pts[0])
    if (closed && pts.length > 2) out.loops.push({ layer: e.layer ?? '0', pts: pts.map((p) => apply(xf, p)) })
  }
  const arc = (e: IEntity, c: Pt, r: number, a0: number, a1: number) => {
    // under the insert's transform: centre and end points mapped, the radius scaled, a mirrored insert runs the other way
    const C = apply(xf, c)
    const E0 = apply(xf, { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) })
    const E1 = apply(xf, { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) })
    const b0 = Math.atan2(E0.y - C.y, E0.x - C.x), b1 = Math.atan2(E1.y - C.y, E1.x - C.x)
    const A: ArcPrim = det < 0 ? { ...base(e), c: C, r: r * rscale, a0: b1, a1: b0 } : { ...base(e), c: C, r: r * rscale, a0: b0, a1: b1 }
    out.arcs.push(A)
    const pts = arcChords(A.c, A.r, A.a0, A.a1)
    for (let i = 0; i + 1 < pts.length; i++) out.segs.push({ ...base(e), a: pts[i], b: pts[i + 1] })
  }
  /** a polyline with bulges: chords, and a bulge of ≥ 60° also as an arc (a door swing drawn as a polyline) */
  const bulged = (e: IEntity, vs: { x: number; y: number; bulge?: number }[], closed: boolean) => {
    const pts: Pt[] = []
    const n = vs.length
    for (let i = 0; i < n; i++) {
      const v = vs[i]
      const w = vs[(i + 1) % n]
      pts.push({ x: v.x, y: v.y })
      if (!v.bulge || (i === n - 1 && !closed)) continue
      const th = 4 * Math.atan(v.bulge)
      const chord = Math.hypot(w.x - v.x, w.y - v.y)
      if (chord < 1e-9) continue
      const r = chord / (2 * Math.sin(Math.abs(th) / 2))
      const mid = { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 }
      const h = r * Math.cos(th / 2) * Math.sign(v.bulge)
      const perp = { x: -(w.y - v.y) / chord, y: (w.x - v.x) / chord }
      const c = { x: mid.x - perp.x * h, y: mid.y - perp.y * h }
      const s0 = Math.atan2(v.y - c.y, v.x - c.x), s1 = Math.atan2(w.y - c.y, w.x - c.x)
      const [a0, a1] = th > 0 ? [s0, s1] : [s1, s0]
      if (Math.abs(th) >= Math.PI / 3) arc(e, c, r, a0, a1)
      else {
        const ch = arcChords(c, r, a0, a1)
        pts.push(...(th > 0 ? ch.slice(1, -1) : ch.slice(1, -1).reverse()))
      }
    }
    poly(e, pts, closed)
  }
  for (const e of entities) {
    if (e.inPaperSpace || frozen.has(e.layer)) {
      skip(e.inPaperSpace ? 'paper space entities' : 'entities on frozen / hidden layers')
      continue
    }
    switch (e.type) {
      case 'LINE': {
        const l = e as ILineEntity
        if (l.vertices?.length >= 2) line(e, l.vertices[0], l.vertices[1])
        break
      }
      case 'LWPOLYLINE': {
        const p = e as ILwpolylineEntity
        bulged(e, p.vertices ?? [], !!p.shape)
        break
      }
      case 'POLYLINE': {
        const p = e as IPolylineEntity
        if (p.is3dPolygonMesh || p.isPolyfaceMesh) {
          skip('3D polygon meshes')
          break
        }
        bulged(e, p.vertices ?? [], !!p.shape)
        break
      }
      case 'ARC': {
        const a = e as IArcEntity
        arc(e, a.center, a.radius, a.startAngle, a.endAngle)
        break
      }
      case 'CIRCLE': {
        const c = e as ICircleEntity
        const pts = arcChords(c.center, c.radius, 0, 2 * Math.PI).slice(0, -1)
        poly(e, pts, true)
        break
      }
      case 'ELLIPSE': {
        const el = e as IEllipseEntity
        const mx = el.majorAxisEndPoint.x, my = el.majorAxisEndPoint.y
        const ra = Math.hypot(mx, my), rb = ra * el.axisRatio
        const rot = Math.atan2(my, mx)
        const a0 = el.startAngle ?? 0, a1 = el.endAngle ?? 2 * Math.PI
        let sweep = a1 - a0
        while (sweep <= 0) sweep += 2 * Math.PI
        const n = Math.max(4, Math.ceil((sweep / (Math.PI / 2)) * CHORD_PER_QUARTER))
        const pts = Array.from({ length: n + 1 }, (_, i) => {
          const t = a0 + (sweep * i) / n
          const x = ra * Math.cos(t), y = rb * Math.sin(t)
          return { x: el.center.x + x * Math.cos(rot) - y * Math.sin(rot), y: el.center.y + x * Math.sin(rot) + y * Math.cos(rot) }
        })
        poly(e, pts, sweep >= 2 * Math.PI - 1e-6)
        break
      }
      case 'SOLID': {
        const s = e as ISolidEntity
        const p = s.points ?? []
        // a DXF SOLID's corners come 1-2-4-3
        const pts = p.length >= 4 ? [p[0], p[1], p[3], p[2]] : p
        if (pts.length >= 3) poly(e, pts, true)
        break
      }
      case 'HATCH': {
        const h = e as IHatchEntity
        const r = roleOf(e.layer ?? '0', block)
        if (r !== 'wall' && r !== 'column') {
          skip('hatches off the wall / column layers')
          break
        }
        for (const path of h.paths) poly(e, path, true)
        break
      }
      case 'SPLINE': {
        const s = e as ISplineEntity
        const pts = splinePoints(s.controlPoints ?? [], s.knotValues, s.degreeOfSplineCurve, s.fitPoints)
        if (pts.length >= 2) poly(e, pts, !!s.closed)
        break
      }
      case 'MLINE': {
        const m = e as IMlineEntity
        for (const el of m.elements) if (el.length >= 2) poly(e, el, m.closed)
        break
      }
      case 'TEXT': {
        const t = e as ITextEntity
        if (t.text) out.texts.push({ layer: e.layer ?? '0', at: apply(xf, t.startPoint ?? { x: 0, y: 0, z: 0 }), text: stripMtext(t.text), height: (t.textHeight ?? 1) * rscale })
        break
      }
      case 'MTEXT': {
        const t = e as IMtextEntity
        if (t.text) out.texts.push({ layer: e.layer ?? '0', at: apply(xf, t.position ?? { x: 0, y: 0, z: 0 }), text: stripMtext(t.text), height: (t.height ?? 1) * rscale })
        break
      }
      case 'DIMENSION': {
        const d = e as IDimensionEntity
        const text = d.text && d.text !== '<>' ? d.text : d.actualMeasurement != null ? String(Math.round(d.actualMeasurement * 100) / 100) : ''
        if (text) out.texts.push({ layer: `DIM:${e.layer ?? '0'}`, at: apply(xf, d.middleOfText ?? d.anchorPoint ?? { x: 0, y: 0, z: 0 }), text, height: 1 })
        // its block holds the drawn lines (extension lines, arrows): read as 'dim' layer lines
        if (d.block && dxf.blocks?.[d.block] && depth < 8) flatten(dxf, dxf.blocks[d.block].entities ?? [], xf, { ...out, texts: [] }, undefined, undefined, depth + 1, frozen)
        break
      }
      case 'INSERT': {
        const ins = e as IInsertEntity
        const b = dxf.blocks?.[ins.name]
        if (!b || depth >= 8) {
          skip(`block ${ins.name} (not in the file)`)
          break
        }
        const rot = ((ins.rotation ?? 0) * Math.PI) / 180
        const sx = ins.xScale ?? 1, sy = ins.yScale ?? 1
        const cos = Math.cos(rot), sin = Math.sin(rot)
        const bp = b.position ?? { x: 0, y: 0, z: 0 }
        // p' = pos + R·S·(p − base)
        const local: Xf = { m: [cos * sx, -sin * sy, sin * sx, cos * sy], o: { x: 0, y: 0 } }
        local.o = { x: (ins.position?.x ?? 0) - (local.m[0] * bp.x + local.m[1] * bp.y), y: (ins.position?.y ?? 0) - (local.m[2] * bp.x + local.m[3] * bp.y) }
        const cols = Math.max(1, ins.columnCount ?? 1), rows = Math.max(1, ins.rowCount ?? 1)
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            const cell: Xf = { ...local, o: { x: local.o.x + c * (ins.columnSpacing ?? 0), y: local.o.y + r * (ins.rowSpacing ?? 0) } }
            out.inserts++
            flatten(dxf, b.entities ?? [], compose(xf, cell), out, block ?? ins.name, inst ?? out.inserts, depth + 1, frozen)
          }
        break
      }
      case 'POINT':
      case 'ATTDEF':
      case 'VERTEX':
        break
      default:
        skip(`${e.type} entities`)
    }
  }
}

/**
 * A unitless file's unit, guessed: of millimetres / centimetres / inches / feet / metres, the ones that make the plan
 * 3–200 m across; among those, when the file prints room sizes ("12'0'' x 7'11''"), the one where the rooms' summed
 * area is the most plausible share (~ half) of the plan's box — else the usual one for that extent.
 */
function guessScale(box: { w: number; h: number }, sizeAreaSqm: number): { scale: number; words: string } {
  const C: [number, string][] = [
    [0.001, 'millimetres'],
    [0.01, 'centimetres'],
    [0.0254, 'inches'],
    [0.3048, 'feet'],
    [1, 'metres'],
  ]
  const extent = Math.max(box.w, box.h)
  const fits = C.filter(([k]) => extent * k >= 3 && extent * k <= 200)
  if (!fits.length) return { scale: 1, words: 'unknown — taken as metres; set the scale in the Studio (S)' }
  if (sizeAreaSqm > 0 && fits.length > 1) {
    const best = fits.map(([k, w]) => ({ k, w, off: Math.abs(Math.log((sizeAreaSqm / (box.w * k * box.h * k)) / 0.5)) })).sort((p, q) => p.off - q.off)[0]
    return { scale: best.k, words: `${best.w} (guessed: the printed room sizes fit the plan's size)` }
  }
  // without sizes: the usual unit for that extent (mm for thousands, inches for hundreds, feet for 15–150, metres under)
  const usual = extent >= 5000 ? 0.001 : extent >= 500 ? 0.0254 : extent >= 150 ? 0.3048 : extent >= 15 ? 0.3048 : 1
  const pick = fits.find(([k]) => k === usual) ?? fits[0]
  return { scale: pick[0], words: `${pick[1]} (guessed from the extent)` }
}

export async function importDxf(text: string, name: string): Promise<ImportResult> {
  const parser = new DxfParser()
  parser.registerEntityHandler(Hatch as unknown as new () => IGeometry)
  parser.registerEntityHandler(Mline as unknown as new () => IGeometry)
  const dxf = parser.parseSync(text)
  if (!dxf) throw new Error('This file is not a DXF Plotline can read')
  const notes: string[] = []
  const h = dxf.header ?? {}
  const ver = String(h['$ACADVER'] ?? 'unknown')
  const VERSIONS: Record<string, string> = { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018' }
  notes.push(`DXF version ${VERSIONS[ver] ?? ver}${ver !== 'unknown' ? ` (${ver})` : ''}.`)

  const frozen = new Set(
    Object.values(dxf.tables?.layer?.layers ?? {})
      .filter((l) => l.frozen || l.visible === false)
      .map((l) => l.name),
  )
  const flat: Flat = { segs: [], arcs: [], texts: [], loops: [], skipped: new Map(), inserts: 0 }
  flatten(dxf, dxf.entities ?? [], IDENT, flat, undefined, undefined, 0, frozen)

  // units
  const ins = Number(h['$INSUNITS'] ?? 0)
  const wallish = flat.segs.filter((g) => roleOf(g.layer, g.block) === 'wall')
  const ext = (gs: Seg[]) => {
    if (!gs.length) return { w: 0, h: 0 }
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
    for (const g of gs)
      for (const p of [g.a, g.b]) (b.x0 = Math.min(b.x0, p.x)), (b.y0 = Math.min(b.y0, p.y)), (b.x1 = Math.max(b.x1, p.x)), (b.y1 = Math.max(b.y1, p.y))
    return { w: b.x1 - b.x0, h: b.y1 - b.y0 }
  }
  const box = ext(wallish.length ? wallish : flat.segs)
  const extent = Math.max(box.w, box.h)
  const sizeArea = flat.texts.reduce((acc, t) => {
    const d = parseDims(stripMtext(t.text))
    return acc + (d ? d.aM * d.bM : 0)
  }, 0)
  let scale: number
  if (INSUNITS[ins]) {
    scale = INSUNITS[ins][0]
    const m = extent * scale
    if (extent && (m < 3 || m > 500)) {
      const g = guessScale(box, sizeArea)
      notes.push(`Units: the file says ${INSUNITS[ins][1]} but the plan would be ${m.toFixed(1)} m across — ${g.words} instead.`)
      scale = g.scale
    } else notes.push(`Units: ${INSUNITS[ins][1]} ($INSUNITS ${ins}); the plan is ${m.toFixed(1)} m across.`)
  } else {
    const g = guessScale(box, sizeArea)
    scale = g.scale
    notes.push(`Units: ${ins ? `$INSUNITS ${ins} is not a length Plotline knows — ` : 'none in the file — '}${g.words}; the plan is ${(extent * scale).toFixed(1)} m across.`)
  }

  // layers → meaning
  const layers = new Map<string, number>()
  for (const g of [...flat.segs, ...flat.texts]) layers.set(g.layer.replace(/^DIM:/, ''), (layers.get(g.layer.replace(/^DIM:/, '')) ?? 0) + 1)
  const WORDS: Record<Role, string> = { wall: 'walls', door: 'doors', window: 'windows', column: 'columns', text: 'room names', dim: 'dimensions', ignore: 'ignored', unknown: 'unknown (parallel pairs count as walls)' }
  for (const [l, n] of [...layers].sort((p, q) => q[1] - p[1])) notes.push(`Layer "${l}": ${WORDS[roleOf(l)]} (${n}).`)
  const blocks = new Set(flat.segs.filter((g) => g.block && roleOf('', g.block) !== 'unknown').map((g) => g.block!))
  if (blocks.size) notes.push(`Door / window blocks: ${[...blocks].join(', ')}.`)
  if (frozen.size) notes.push(`Frozen / hidden layers left out: ${[...frozen].join(', ')}.`)

  const drawing: Drawing = { segs: flat.segs, arcs: flat.arcs, texts: flat.texts, loops: flat.loops, scale }
  const plan = buildPlan(drawing, name.replace(/\.dxf$/i, ''))
  const north = Number(h['$NORTHDIRECTION'] ?? 0)
  plan.unit.northDeg = Number.isFinite(north) ? ((north % 360) + 360) % 360 : 0
  if (plan.unit.northDeg) notes.push(`True north: ${plan.unit.northDeg}° clockwise from the drawing's up ($NORTHDIRECTION).`)
  else notes.push('True north: not in the file — taken as the drawing\'s up.')
  notes.push(...plan.notes)
  for (const [what, n] of flat.skipped) notes.push(`Skipped ${n} ${what}.`)
  if (plan.issues.some((i) => i.level === 'error')) notes.push(`${plan.issues.filter((i) => i.level === 'error').length} thing(s) to check in the Studio (loose wall ends, labels outside rooms).`)
  return { format: 'dxf', storeys: [{ name: 'Floor', elevationM: 0, unit: plan.unit }], notes, unitScale: scale, origin: plan.origin }
}
