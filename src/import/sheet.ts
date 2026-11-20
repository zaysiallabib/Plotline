/**
 * A drawing as the shapes of a plan sheet (session 31), in plan metres (x right, y down): what the DXF export
 * (dxfWrite.ts) and the printed plan (the Studio's Print) both draw, so the two never disagree with the Studio.
 *
 *  walls     each wall's solid pieces between its openings, as closed outlines (centre line ± half the thickness); an end
 *            that meets another wall reaches into it by that wall's half thickness (`joinEnds`), so filled walls close
 *            their corners. Zone lines (height 0) are drawn as nothing, as in the 3D.
 *  openings  per opening: a door's leaf and quarter swing (hinge and side as the Studio draws them), a window's three glass
 *            lines and two jambs, a slider's two panes; each with the jambs at its two ends (so an opening says how
 *            thick its wall is even where nothing else of the wall is drawn: a wall that is all glass, all passage).
 *  columns   each pillar's outline. texts: each room name at its label, its printed size under it.
 */
import { pillarCorners, wallFrame } from '../core'
import type { OpeningKind, Pt, Unit } from '../core'

export interface SheetOpening {
  kind: OpeningKind
  /** straight lines (the leaf, glass lines, panes' edges) */
  lines: [Pt, Pt][]
  /** the two jambs, across the wall at the opening's ends: how thick and (heightM) how high its wall is */
  jambs: [[Pt, Pt], [Pt, Pt]]
  heightM: number
  /** a door's swing: centre on the hinge, radius = the door's width, from angle a0 to a1 going the short way (plan frame) */
  arc?: { c: Pt; r: number; a0: number; a1: number }
}

export interface Sheet {
  walls: Pt[][]
  /** each wall piece's height, m, in the order of `walls` (a low wall, a parapet, a kerb) */
  wallHeights: number[]
  /** zone lines (a wall of height 0: parking bays, lawn edges): a single thin line */
  zones: [Pt, Pt][]
  openings: SheetOpening[]
  columns: Pt[][]
  /** levelM: a name's floor level when it is not the storey's (a raised terrace, a pool's water surface) */
  texts: { at: Pt; text: string; size: 'name' | 'note'; levelM?: number }[]
  /** the box round everything, metres */
  box: { x0: number; y0: number; x1: number; y1: number }
}

const add = (p: Pt, d: Pt, k: number): Pt => ({ x: p.x + d.x * k, y: p.y + d.y * k })

export function sheetOf(unit: Unit, { joinEnds = true }: { joinEnds?: boolean } = {}): Sheet {
  const vs = new Set(unit.vertices.map((v) => v.id))
  const walls = unit.walls.filter((w) => w.heightM > 0 && vs.has(w.a) && vs.has(w.b))
  // a corner (exactly two walls meeting at an angle): each end reaches into the other wall by its half thickness, so the
  // outside corner is filled; at a T or a cross the through wall is whole already
  const reach = new Map<string, number>()
  const P = new Map(unit.vertices.map((v) => [v.id, v]))
  const dirAt = (w: (typeof walls)[number], v: string) => {
    const a = P.get(v)!, b = P.get(w.a === v ? w.b : w.a)!
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  }
  for (const v of unit.vertices) {
    const at = walls.filter((w) => w.a === v.id || w.b === v.id)
    if (at.length !== 2) continue
    const [p, q] = at, dp = dirAt(p, v.id), dq = dirAt(q, v.id)
    if (Math.abs(dp.x * dq.y - dp.y * dq.x) < 0.1) continue // straight on: nothing to fill
    reach.set(`${p.id}|${v.id}`, q.thicknessM / 2)
    reach.set(`${q.id}|${v.id}`, p.thicknessM / 2)
  }
  const out: Sheet = { walls: [], wallHeights: [], zones: [], openings: [], columns: [], texts: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } }
  for (const w of walls) {
    const f = wallFrame(w, unit.vertices)
    const L = f.lengthM
    if (L < 1e-6) continue
    const h = w.thicknessM / 2
    const gaps = w.openings.map((o) => [Math.max(0, o.offsetM), Math.min(L, o.offsetM + o.widthM)] as const).filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0])
    let u = 0
    const piece = (u0: number, u1: number) => {
      if (u1 - u0 < 1e-6) return
      const e0 = joinEnds && u0 < 1e-6 ? (reach.get(`${w.id}|${w.a}`) ?? 0) : 0
      const e1 = joinEnds && u1 > L - 1e-6 ? (reach.get(`${w.id}|${w.b}`) ?? 0) : 0
      const s = add(f.origin, f.dir, u0 - e0), t = add(f.origin, f.dir, u1 + e1)
      out.walls.push([add(s, f.normal, -h), add(t, f.normal, -h), add(t, f.normal, h), add(s, f.normal, h)])
      out.wallHeights.push(w.heightM)
    }
    for (const [a, b] of gaps) {
      piece(u, a)
      u = Math.max(u, b)
    }
    piece(u, L)
    // the openings, in the wall's own frame (u along, v across: +v = the normal side)
    const at = (uu: number, vv: number): Pt => add(add(f.origin, f.dir, uu), f.normal, vv)
    for (const o of w.openings) {
      const u0 = Math.max(0, o.offsetM), u1 = Math.min(L, o.offsetM + o.widthM)
      const jambs: SheetOpening['jambs'] = [[at(u0, -h), at(u0, h)], [at(u1, -h), at(u1, h)]]
      const heightM = w.heightM
      if (o.kind === 'door') {
        const hu = o.hinge === 'b' ? u1 : u0
        const sign = o.swing === 'in' ? -1 : 1
        const c = at(hu, sign * h)
        const leafEnd = at(hu, sign * (h + o.widthM))
        const jamb = at(o.hinge === 'b' ? u0 : u1, sign * h)
        const a0 = Math.atan2(leafEnd.y - c.y, leafEnd.x - c.x), a1 = Math.atan2(jamb.y - c.y, jamb.x - c.x)
        out.openings.push({ kind: 'door', lines: [[c, leafEnd]], jambs, heightM, arc: { c, r: o.widthM, a0, a1 } })
      } else if (o.kind === 'window') {
        out.openings.push({ kind: 'window', lines: [[at(u0, -h), at(u1, -h)], [at(u0, 0), at(u1, 0)], [at(u0, h), at(u1, h)]], jambs, heightM })
      } else if (o.kind === 'slider') {
        const m = (u1 - u0) * 0.55
        const pane = (p0: number, p1: number, v0: number, v1: number): [Pt, Pt][] => [[at(p0, v0), at(p1, v0)], [at(p1, v0), at(p1, v1)], [at(p1, v1), at(p0, v1)], [at(p0, v1), at(p0, v0)]]
        out.openings.push({ kind: 'slider', lines: [...pane(u0, u0 + m, -h * 0.6, -h * 0.1), ...pane(u1 - m, u1, h * 0.1, h * 0.6)], jambs, heightM })
      } else out.openings.push({ kind: 'passage', lines: [], jambs, heightM })
    }
  }
  for (const w of unit.walls) {
    if (w.heightM > 0 || !vs.has(w.a) || !vs.has(w.b)) continue
    const f = wallFrame(w, unit.vertices)
    out.zones.push([f.origin, add(f.origin, f.dir, f.lengthM)])
  }
  for (const p of unit.pillars ?? []) out.columns.push(pillarCorners(p))
  for (const l of unit.roomLabels) {
    out.texts.push({ at: { x: l.x, y: l.y }, text: l.name, size: 'name', ...(l.levelM ? { levelM: l.levelM } : {}) })
    if (l.printedSize) out.texts.push({ at: { x: l.x, y: l.y + 0.35 }, text: l.printedSize, size: 'note' })
  }
  const grow = (p: Pt) => ((out.box.x0 = Math.min(out.box.x0, p.x)), (out.box.y0 = Math.min(out.box.y0, p.y)), (out.box.x1 = Math.max(out.box.x1, p.x)), (out.box.y1 = Math.max(out.box.y1, p.y)))
  for (const poly of [...out.walls, ...out.columns, ...out.zones]) poly.forEach(grow)
  for (const o of out.openings) [...o.lines, ...o.jambs].flat().forEach(grow)
  if (!Number.isFinite(out.box.x0)) out.box = { x0: 0, y0: 0, x1: 1, y1: 1 }
  return out
}

// ---------- the printed plan ----------

/** paper sizes, millimetres, the long side first */
export const PAPERS = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] } as const
export type Paper = keyof typeof PAPERS
/** the scales a plan is printed at (1 : n) */
export const SCALES = [50, 100, 200] as const
const MARGIN = 10
const TITLE = 22

/** the paper turned the way the plan is (landscape for a wide plan), and the drawing area left above the title block, mm */
export function layoutOf(sheet: Sheet, paper: Paper): { w: number; h: number; area: { w: number; h: number } } {
  const [a, b] = PAPERS[paper]
  const wide = sheet.box.x1 - sheet.box.x0 >= sheet.box.y1 - sheet.box.y0
  const w = wide ? a : b, h = wide ? b : a
  return { w, h, area: { w: w - 2 * MARGIN, h: h - 2 * MARGIN - TITLE } }
}

/** whether the plan fits that paper at 1 : scale */
export function fits(sheet: Sheet, paper: Paper, scale: number): boolean {
  const { area } = layoutOf(sheet, paper)
  const k = 1000 / scale
  return (sheet.box.x1 - sheet.box.x0) * k <= area.w && (sheet.box.y1 - sheet.box.y0) * k <= area.h
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface PrintInfo {
  project: string
  name: string
  floor?: number
  areaSqft?: number
  /** degrees clockwise from the sheet's up (Unit.northDeg) */
  northDeg?: number
  date: string
}

/**
 * The plan as an SVG sheet in millimetres: the drawing at 1 : scale centred in its area, walls filled, openings as the
 * architect draws them, columns, zone lines, names; a title block along the foot — project in the serif, the drawing, the
 * floor and area, the scale and paper, the date — a scale bar and a north arrow. Classes only (no colours): the Studio's
 * stylesheet paints them with the tokens, on screen (the Print box) and on paper alike.
 */
export function sheetSvg(sheet: Sheet, paper: Paper, scale: number, info: PrintInfo): string {
  const { w, h, area } = layoutOf(sheet, paper)
  const k = 1000 / scale
  const bw = (sheet.box.x1 - sheet.box.x0) * k, bh = (sheet.box.y1 - sheet.box.y0) * k
  const ox = MARGIN + (area.w - bw) / 2 - sheet.box.x0 * k, oy = MARGIN + (area.h - bh) / 2 - sheet.box.y0 * k
  const X = (p: Pt) => +(ox + p.x * k).toFixed(2)
  const Y = (p: Pt) => +(oy + p.y * k).toFixed(2)
  const pts = (ps: Pt[]) => ps.map((p) => `${X(p)},${Y(p)}`).join(' ')
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" class="plan-sheet" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" data-scale="${scale}">`)
  out.push(`<rect class="ps-paper" x="0" y="0" width="${w}" height="${h}"/>`)
  out.push(`<g class="ps-zones">${sheet.zones.map(([a, b]) => `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>`).join('')}</g>`)
  out.push(`<g class="ps-walls">${sheet.walls.map((p) => `<polygon points="${pts(p)}"/>`).join('')}</g>`)
  out.push(`<g class="ps-columns">${sheet.columns.map((p) => `<polygon points="${pts(p)}"/>`).join('')}</g>`)
  const lines: string[] = [], swings: string[] = []
  for (const o of sheet.openings) {
    for (const [a, b] of [...o.lines, ...o.jambs]) lines.push(`<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}"/>`)
    if (o.arc) {
      const { c, r, a0, a1 } = o.arc
      let d = a1 - a0
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      const s = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, e = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }
      swings.push(`<path d="M${X(s)} ${Y(s)} A${(r * k).toFixed(2)} ${(r * k).toFixed(2)} 0 0 ${d > 0 ? 1 : 0} ${X(e)} ${Y(e)}"/>`)
    }
  }
  out.push(`<g class="ps-openings">${lines.join('')}</g><g class="ps-swings">${swings.join('')}</g>`)
  out.push(`<g class="ps-names">${sheet.texts.map((t) => `<text x="${X(t.at)}" y="${Y(t.at)}" class="${t.size === 'name' ? 'ps-name' : 'ps-size'}">${esc(t.text)}</text>`).join('')}</g>`)
  // the title block: a hairline over it, the words in columns, the scale bar and the north arrow at the right
  const ty = h - MARGIN - TITLE + 4
  const col = (x: number, label: string, value: string, cls = 'ps-value') => `<text x="${x}" y="${ty + 5}" class="ps-label">${esc(label)}</text><text x="${x}" y="${ty + 12}" class="${cls}">${esc(value)}</text>`
  out.push(`<g class="ps-title"><line class="ps-rule" x1="${MARGIN}" y1="${ty}" x2="${w - MARGIN}" y2="${ty}"/>`)
  // the words share what the scale bar and the north arrow (80 mm at the right) leave, in proportion; the date when it fits
  const free = w - 2 * MARGIN - 80
  const dated = free >= 260
  const parts = dated ? [0.34, 0.26, 0.12, 0.15, 0.13] : [0.38, 0.3, 0.14, 0.18]
  const at = parts.map((_, i) => MARGIN + free * parts.slice(0, i).reduce((a, b) => a + b, 0))
  out.push(col(at[0], 'Project', info.project || '—', 'ps-project'))
  out.push(col(at[1], 'Drawing', [info.name || 'Plan', info.floor !== undefined ? `floor ${info.floor}` : ''].filter(Boolean).join(' · ')))
  out.push(col(at[2], 'Area', info.areaSqft ? `${info.areaSqft.toLocaleString('en')} sft` : '—'))
  out.push(col(at[3], 'Scale', `1 : ${scale} on ${paper}`))
  if (dated) out.push(col(at[4], 'Date', info.date))
  // scale bar: 0–5 m (0–2 m at 1 : 50 on small paper is still 40 mm), in metre steps
  const m = scale >= 200 ? 10 : scale <= 50 ? 2 : 5
  const sx = w - MARGIN - 18 - m * k, sy = ty + 9
  out.push(`<g class="ps-bar">${Array.from({ length: m }, (_, i) => `<rect x="${(sx + i * k).toFixed(2)}" y="${sy}" width="${k.toFixed(2)}" height="1.4" class="${i % 2 ? 'ps-bar-b' : 'ps-bar-a'}"/>`).join('')}<text x="${sx}" y="${sy - 1.5}" class="ps-label">0</text><text x="${(sx + m * k).toFixed(2)}" y="${sy - 1.5}" class="ps-label" text-anchor="end">${m} m</text></g>`)
  // north arrow: the needle points to true north (northDeg clockwise from the sheet's up)
  const nx = w - MARGIN - 6, ny = ty + 9
  out.push(`<g class="ps-north" transform="translate(${nx} ${ny}) rotate(${(info.northDeg ?? 0).toFixed(1)})"><circle r="5"/><path d="M0 -4.2 L2 2.6 L0 1.2 L-2 2.6 Z"/><text y="-6.2" text-anchor="middle" class="ps-label">N</text></g>`)
  out.push('</g></svg>')
  return out.join('')
}
