/**
 * How tall the building is, read from its sections and elevations (session 31, Stage 3 of Docs/PLAN_DRAWING_SETS.md:
 * until now every storey was 3.0 m). Pure and deterministic, no AI.
 *
 *  marks    a level mark is a horizontal line with its words beside it: a name ("1ST FLOOR (FINISH)", "CEILING (T.O.
 *           PLATE)", "ROOF RIDGE", "PARAPET", "B1", "N.P.T", "F.F.L.") and / or its value ("+10'-0"", "+2.34", "±0.00",
 *           "EL. 103.05", "+3050"). A name and the value printed under (or over) it are one mark; a value alone is a mark
 *           with no name (Elemental prints only "+2.34" at its level triangles).
 *  height   the value printed on it; else its line measured with the view's scale from a printed mark (or from the ground
 *           floor's line). The scale: the printed one, else two printed marks', else a dimension string printed between two
 *           level lines ("9'-1"").
 *  storeys  the marks as the building's heights (heightsOf): floor to floor per level, the top floor's ceiling, the slab
 *           (a ceiling mark under the next floor), a flat roof's parapet or a pitched roof's eave and ridge. Several views of
 *           one set vote (setHeights): sections first, elevations confirm; more than 5 cm apart is a question for the person.
 *
 * Frame: the view's own (a PDF page's points, y up); `mPerUnit` turns its lengths into metres.
 */
import { FT, parseLength } from '../core'
import type { Seg } from './plan2d'
import type { Pt } from '../core'
import { levelOf, norm, type SheetPage, type SheetText, type View } from './sheets'
import type { Heights } from '../data/building/storeys'
export type { Heights } from '../data/building/storeys'

/** what a mark marks: a floor (as printed: 0 the ground, n, −n basement n; 'floor' a finished floor with no number), a top or 'level' (a value alone) */
export type MarkAt = number | 'floor' | 'level' | 'plate' | 'eave' | 'ridge' | 'roof' | 'parapet' | 'grade'

export interface Mark {
  /** as printed ("2ND FLOOR (FINISH)", "N.P.T"); '' for a value alone */
  name: string
  at: MarkAt
  /** m, on the drawing's own datum (the ground floor's mark is usually 0) */
  heightM: number
  /** its height printed on it; else measured from its line */
  printed: boolean
  /** its line's height on the view (view units) */
  y: number
}

export interface HeightsRead {
  marks: Mark[]
  /** 0–1: 1 every height printed and, where the scale is known, its line agrees with it */
  confidence: number
  /** the roof's outline between its eave and ridge lines (an elevation's): flat to the ridge along it (the long side of a gable), a triangle (a gable or hip end), a trapezoid (the long side of a hip) */
  outline?: RoofOutline
}
export type RoofOutline = 'rectangle' | 'triangle' | 'trapezoid'

/**
 * The roof's outline seen on an elevation, between the eave's line `eaveY` and the ridge's `ridgeY` (view units, y up): its
 * slopes are the long slanted lines in that band (each rising over half of it). None: the ridge runs along this side
 * (a rectangle). Both ways: where they reach the top — together (a triangle: a gable's or a hip's end) or apart (a
 * trapezoid: a hip's long side, the ridge between them). Null when the band is too thin to say.
 */
export function roofOutline(segs: Seg[], eaveY: number, ridgeY: number): RoofOutline | null {
  const H = ridgeY - eaveY
  if (!(H > 0)) return null
  const tops: { x: number; up: 1 | -1 }[] = []
  let x0 = Infinity, x1 = -Infinity
  for (const g of segs) {
    const [lo, hi] = g.a.y < g.b.y ? [g.a, g.b] : [g.b, g.a]
    const dx = hi.x - lo.x, dy = hi.y - lo.y
    if (dy < 0.5 * H || Math.abs(dx) < 0.2 * dy || lo.y < eaveY - 0.15 * H || hi.y > ridgeY + 0.15 * H) continue
    tops.push({ x: hi.x, up: dx > 0 ? 1 : -1 })
    ;(x0 = Math.min(x0, lo.x, hi.x)), (x1 = Math.max(x1, lo.x, hi.x))
  }
  const r = tops.filter((t) => t.up === 1), l = tops.filter((t) => t.up === -1)
  if (!r.length || !l.length) return tops.length ? null : 'rectangle'
  // (the rising-right slope's top against the rising-left one's: the ridge between them)
  const gap = Math.min(...l.map((t) => t.x)) - Math.max(...r.map((t) => t.x))
  return gap > 0.15 * (x1 - x0) ? 'trapezoid' : 'triangle'
}

/** two readings of one height this close agree */
export const AGREE_M = 0.05

// ---------- words ----------

const PREFIX = /^(?:EL(?:EV)?|LVL|LEVEL|N\.?\s?P\.?\s?T|F\.?\s?F\.?\s?L|S\.?S\.?L|T\.?O\.?S|OKFF|OKRD|NIVEL|COTA|NIV)\.?\s*:?\s*/i

/**
 * A level's printed value in metres: `+10'-0"`, `+29'-2"`, `±0.00`, `+/- 0.0`, `+ 4.7`, `-4.10`, `+3,05`, `EL. 103.05`,
 * `+3050` (millimetres); null for anything else. A value carries a sign or a level word (a bare "9'-6"" is a dimension).
 */
export function levelValue(raw: string): number | null {
  let t = raw.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"').replace(/[−–]/g, '-').trim()
  const prefixed = PREFIX.test(t)
  t = t.replace(PREFIX, '')
  const m = /^(\+\s*\/\s*-|\+-|±|\+|-)?\s*(.+?)\s*(mm|m)?$/i.exec(t)
  if (!m) return null
  const [, sign = '', body, unit = ''] = m
  if (!sign && !prefixed) return null
  let v: number | null = null
  const fi = /^(\d{1,3})\s*'(?:\s*-?\s*(\d{1,2}(?:\.\d+)?)(?:\s+(\d{1,2})\/(\d{1,2}))?\s*"?)?$/.exec(body)
  if (fi) {
    const inch = Number(fi[2] ?? 0) + (fi[3] ? Number(fi[3]) / Number(fi[4]) : 0)
    v = inch < 12 ? (Number(fi[1]) + inch / 12) * FT : null
  } else if (/^\d{1,3}[.,]\d{1,3}$/.test(body)) v = Number(body.replace(',', '.')) * (unit.toLowerCase() === 'mm' ? 0.001 : 1)
  else if (/^0+$/.test(body)) v = 0
  else if (/^\d{4,5}$/.test(body)) v = Number(body) / 1000 // (millimetres, as European sections print them)
  if (v === null) return null
  return sign === '-' ? -v : v // (± and +/- are zero's)
}

/** A mark's text as its name and its value: "N.P.T+2.34" → N.P.T, 2.34; "+10'-0"" → '', 3.048; "1ST FLOOR (FINISH)" → it, null. */
export function splitMark(raw: string): { name: string; value: number | null } {
  const t = raw.trim()
  const whole = levelValue(t)
  if (whole !== null) {
    const word = PREFIX.exec(t)?.[0].trim() ?? ''
    return { name: word, value: whole }
  }
  const m = /^(.*?[^\s+±-])?\s*((?:\+\s*\/\s*-|\+-|±|\+|[-−])\s*[\d'".,\s/-]+?(?:mm|m)?)\s*$/i.exec(t)
  const v = m ? levelValue(m[2]) : null
  return v !== null && m ? { name: (m[1] ?? '').trim(), value: v } : { name: t, value: null }
}

/**
 * What a mark's name marks, or null when it is no level's name ("PORCH FLOOR", "2X12 FLOOR JOISTS @ 16" OC"): a ridge,
 * an eave, a parapet, a ceiling / top plate, the ground outside (grade), a roof, a floor by its number ("GROUND FLOOR" 0,
 * "2ND FLOOR (FINISH)" 2, "B1" −1, "LEVEL 3" 3) or a finished floor with none ("F.F.L.", "N.P.T", "OKFF", "MEZZANINE").
 */
export function markOf(raw: string): MarkAt | null {
  const t = norm(raw).replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!t || t.split(' ').length > 6 || /@|\bJOISTS?\b|\bRAFTERS?\b|\bTRUSS|\bPANELS?\b|\bCAP\b|\bBOARD\b|\bSIDING\b|\bSEE\b/.test(t)) return null
  if (/\bRIDGE\b|\bCUMBRERA\b|\bCOLMO\b|\bFAITAGE\b|\bFIRSTHOHE\b/.test(t)) return 'ridge'
  if (/\bEAVES?\b|\bFASCIA\b|\bALERO\b|\bTRAUFE\b|\bGOUTTIERE\b/.test(t)) return 'eave'
  if (/\bPARAPET\b|\bPARAPETO\b|\bPRETIL\b|\bATTIKA\b|\bACROTERE\b/.test(t)) return 'parapet'
  if (/\bPLATE\b|\bCEILING\b|\bCIELO\b|\bSOFFIT\b|\bB\.?\s?O\.?\s?SLAB\b|\bU\.?\s?K\.?\s?(?:ROH)?DECKE\b|\bPLAFOND\b/.test(t)) return 'plate'
  if (/\bGRADE\b|\bGROUND (?:LINE|LEVEL)\b|\bN\.?\s?G\.?\s?L\b|\bN\.?\s?T\.?\s?N\b|\bTERRENO\b|\bGELANDE\b|\bEXISTING GROUND\b/.test(t)) return 'grade'
  if (/\bROOF\b|\bROOFTOP\b|\bTERRACE\b|\bAZOTEA\b|\bCUBIERTA\b|\bTECHO\b|\bDACH\b|\bTOITURE\b/.test(t)) return 'roof'
  const nums = levelOf(t)?.at.filter((f): f is number => typeof f === 'number') ?? []
  if (nums.length === 1) return nums[0]
  if (/\bF\.?\s?F\.?\s?L\b|\bN\.?\s?P\.?\s?T\b|\bFINISH(?:ED)? FLOOR\b|\bFLOOR (?:LEVEL|FINISH)\b|\bO\.?\s?K\.?\s?F\.?\s?F\b|\bT\.?\s?O\.?\s?SLAB\b|\bS\.?\s?S\.?\s?L\b|\bMEZZ/.test(t)) return 'floor'
  return null
}

// ---------- the view ----------

interface Run {
  y: number
  x0: number
  x1: number
}
/** the view's horizontal lines, collinear pieces that nearly touch joined (a dashed level line is one) */
function runsOf(segs: Seg[], gap: number): Run[] {
  const hs = segs
    .filter((g) => Math.abs(g.a.y - g.b.y) < 0.3 && Math.abs(g.a.x - g.b.x) > 0.3)
    .map((g) => ({ y: (g.a.y + g.b.y) / 2, x0: Math.min(g.a.x, g.b.x), x1: Math.max(g.a.x, g.b.x) }))
    .sort((p, q) => p.y - q.y || p.x0 - q.x0)
  const out: Run[] = []
  for (let i = 0; i < hs.length; ) {
    let j = i
    while (j + 1 < hs.length && hs[j + 1].y - hs[i].y < 0.3) j++
    const row = hs.slice(i, j + 1).sort((p, q) => p.x0 - q.x0)
    let cur = { ...row[0] }
    for (const r of row.slice(1)) {
      if (r.x0 <= cur.x1 + gap) cur.x1 = Math.max(cur.x1, r.x1)
      else out.push(cur), (cur = { ...r })
    }
    out.push(cur)
    i = j + 1
  }
  return out
}

interface Word {
  t: SheetText
  x0: number
  x1: number
  name: string
  at: MarkAt | null
  value: number | null
}

/**
 * The level marks of one section or elevation: `segs` and `texts` are the view's own (its frame, y up), `mPerUnit` its
 * scale (metres per view unit) when printed. Names pair with the value beside them; a name with no value counts only when
 * it is set like the view's valued names and stands on a level line; each mark's line is the longest horizontal line at
 * its words. Heights: printed, else measured.
 */
export function readHeights(view: { segs: Seg[]; texts: SheetText[]; mPerUnit?: number }): HeightsRead {
  const words: Word[] = []
  for (const t of view.texts) {
    if (Math.abs(t.dir.x) < 0.95 || t.text.length > 48) continue
    const s = splitMark(t.text)
    const at = s.name ? markOf(s.name) : null
    if (at === null && s.value === null) continue
    if (s.name && at === null && !PREFIX.test(s.name)) continue // (a value inside a note is no mark)
    const w = t.width / 2
    words.push({ t, x0: t.at.x - w, x1: t.at.x + w, name: s.name, at: at ?? (s.value !== null ? 'level' : null), value: s.value })
  }
  const hs = words.map((w) => w.t.height).sort((a, b) => a - b)
  const runs = runsOf(view.segs, Math.max(1, hs[Math.floor(hs.length / 2)] ?? 1) * 0.6)
  /** the longest horizontal line with y in [lo, hi] reaching the words (x0–x1, h their height) */
  const lineAt = (lo: number, hi: number, x0: number, x1: number, h: number): Run | null => {
    let best: Run | null = null
    for (const r of runs) {
      if (r.y < lo || r.y > hi || r.x1 < x0 - h || r.x0 > x1 + h || r.x1 - r.x0 < 1.5 * h) continue
      if (!best || r.x1 - r.x0 > best.x1 - best.x0) best = r
    }
    return best
  }
  // a value under (or over) a name is that name's: the nearest, each name one
  const names = words.filter((w) => w.value === null)
  const values = words.filter((w) => w.value !== null && !w.name)
  const pairs: [Word, Word][] = []
  const cost = (n: Word, v: Word) => {
    const h = Math.max(n.t.height, v.t.height)
    const dy = Math.abs(n.t.at.y - v.t.at.y)
    const near = v.x1 >= n.x0 - 2 * n.t.height && v.x0 <= n.x1 + 2 * n.t.height
    return dy <= 2.5 * h && near ? dy + 0.1 * Math.abs(n.x0 - v.x0) : Infinity
  }
  const all = names.flatMap((n) => values.map((v) => ({ n, v, c: cost(n, v) }))).filter((p) => p.c < Infinity).sort((a, b) => a.c - b.c)
  const used = new Set<Word>()
  for (const { n, v } of all) if (!used.has(n) && !used.has(v)) used.add(n), used.add(v), pairs.push([n, v])
  // a name with no value: set like the valued names (a note is smaller), standing on a level line well past its words
  const valuedH = pairs.map(([n]) => n.t.height)
  const marks: (Omit<Mark, 'heightM' | 'printed'> & { value: number | null; h: number })[] = []
  for (const [n, v] of pairs) {
    const h = n.t.height
    const lo = Math.min(n.t.at.y, v.t.at.y + 0.7 * v.t.height) - 0.3 * h, hi = Math.max(n.t.at.y, v.t.at.y) + 0.2 * h
    const r = lineAt(lo, hi, Math.min(n.x0, v.x0), Math.max(n.x1, v.x1), h)
    marks.push({ name: n.name, at: n.at!, y: r ? r.y : (n.t.at.y + v.t.at.y + 0.7 * v.t.height) / 2, value: v.value, h })
  }
  for (const n of names) {
    if (used.has(n) || n.at === null) continue
    const h = n.t.height
    if (valuedH.length && !valuedH.some((x) => Math.abs(x - h) <= 0.15 * x)) continue
    const r = lineAt(n.t.at.y - 1.2 * h, n.t.at.y + 0.2 * h, n.x0, n.x1, h)
    if (r && r.x1 - r.x0 >= n.x1 - n.x0 + h) marks.push({ name: n.name, at: n.at, y: r.y, value: null, h })
  }
  for (const w of words) {
    if (used.has(w) || w.value === null) continue
    const h = w.t.height
    const r = lineAt(w.t.at.y - 2.2 * h, w.t.at.y + 1.5 * h, w.x0, w.x1, h) // (under the value, or over it)
    marks.push({ name: w.name, at: w.at!, y: r ? r.y : w.t.at.y - 0.3 * h, value: w.value, h })
  }
  // the scale: printed, else two printed marks', else a dimension string between two marks' lines
  const printed = marks.filter((m) => m.value !== null)
  let m = view.mPerUnit
  let how: 'given' | 'marks' | 'dimension' | null = m ? 'given' : null
  if (!m) {
    const ks: number[] = []
    for (const a of printed) for (const b of printed) if (b.y - a.y > 5 * a.h && b.value! - a.value! > 0.5) ks.push((b.value! - a.value!) / (b.y - a.y))
    ks.sort((a, b) => a - b)
    const mid = ks[Math.floor(ks.length / 2)]
    if (ks.length && ks.every((k) => Math.abs(k - mid) <= 0.03 * mid)) (m = mid), (how = 'marks')
  }
  if (!m && marks.length >= 2) {
    const ks: number[] = []
    for (const t of view.texts) {
      if (Math.abs(t.dir.y) < 0.95 || !/['"]|\d[.,]\d+\s*m?$/.test(t.text)) continue
      const len = parseLength(t.text.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'))
      if (!len || len < 0.5) continue
      const below = marks.filter((x) => x.y < t.at.y).sort((a, b) => b.y - a.y)[0]
      const above = marks.filter((x) => x.y > t.at.y).sort((a, b) => a.y - b.y)[0]
      // (a dimension's words stand in the middle of its line: one off the middle measures something else, a 3' rail)
      if (below && above && Math.abs(t.at.y - (below.y + above.y) / 2) < 0.15 * (above.y - below.y)) ks.push(len / (above.y - below.y))
    }
    ks.sort((a, b) => a - b)
    const mid = ks[Math.floor(ks.length / 2)]
    if (ks.length && ks.filter((k) => Math.abs(k - mid) <= 0.03 * mid).length * 2 > ks.length) (m = mid), (how = 'dimension')
  }
  // heights: printed; else from the nearest printed mark's line, else from the ground floor's (or the lowest floor's) line
  const datum = printed.length ? null : (marks.find((x) => x.at === 0) ?? marks.filter((x) => typeof x.at === 'number' || x.at === 'floor').sort((a, b) => a.y - b.y)[0])
  const out: Mark[] = []
  let agree = 0
  let checked = 0
  for (const x of marks) {
    const ref = printed.filter((p) => p !== x).sort((a, b) => Math.abs(a.y - x.y) - Math.abs(b.y - x.y))[0]
    const measured = m ? (ref ? ref.value! + (x.y - ref.y) * m : datum ? (x.y - datum.y) * m : null) : null
    if (x.value !== null && measured !== null && how === 'given') (checked++, Math.abs(measured - x.value) <= AGREE_M && agree++)
    const heightM = x.value ?? measured
    if (heightM === null) continue
    out.push({ name: x.name, at: x.at, heightM, printed: x.value !== null, y: x.y })
  }
  out.sort((a, b) => a.heightM - b.heightM || a.y - b.y)
  const confidence = !out.length ? 0 : out.every((x) => x.printed) ? (checked ? 0.5 + (0.5 * agree) / checked : 0.9) : how === 'given' || how === 'marks' ? 0.8 : 0.6
  // the roof's outline between the highest eave and the ridge (a pitched roof's elevation)
  const ridge = out.filter((x) => x.at === 'ridge').sort((a, b) => b.y - a.y)[0]
  const eave = out.filter((x) => x.at === 'eave' && ridge && x.y < ridge.y).sort((a, b) => b.y - a.y)[0]
  const outline = ridge && eave ? roofOutline(view.segs, eave.y, ridge.y) : null
  return { marks: out, confidence: Math.round(confidence * 100) / 100, ...(outline ? { outline } : {}) }
}

/** One view of a page (sheets.ts): its own lines and words, at its printed scale (`unitM`: metres a page unit on paper — a PDF point). */
export function viewHeights(page: SheetPage, view: View, unitM = 0.0254 / 72): HeightsRead {
  const b = view.box
  const inB = (q: Pt) => q.x >= b.x0 && q.x <= b.x1 && q.y >= b.y0 && q.y <= b.y1
  return readHeights({ segs: page.segs.filter((g) => inB(g.a) && inB(g.b)), texts: page.texts.filter((t) => inB(t.at)), mPerUnit: view.scale ? view.scale * unitM : undefined })
}

// ---------- the building's heights ----------

/** a pitched roof rises at least this much from its eave to its ridge; less, two marks at the top are a flat roof's slab and its parapet */
const PITCH_M = 1.3

/**
 * One view's marks as the building's heights (null when they say nothing of it). The ground floor is the floor mark
 * named so, else the one at 0, else the lowest; floors over it are numbered up in their order (as a set's plans are: the
 * "1ST FLOOR" of a set with no ground floor is the ground), basements down. A top under the top floor is a lower roof's (a
 * porch's eave) — but a ceiling under the next floor gives the slab. Values alone over the named floors: under a named
 * eave or ridge the highest is the top floor's ceiling; with no top named the highest is the roof, and a second within
 * 1.3 m under it makes that the roof's slab and the higher its parapet.
 */
export function heightsOf(read: HeightsRead): Heights | null {
  const ms = read.marks
  const isTop = (x: Mark) => x.at === 'plate' || x.at === 'eave' || x.at === 'ridge' || x.at === 'roof' || x.at === 'parapet'
  const tops = ms.filter(isTop)
  const lv = ms.filter((x) => typeof x.at === 'number' || x.at === 'floor' || x.at === 'level')
  const named = lv.filter((x) => x.at !== 'level')
  const over = lv.filter((x) => x.at === 'level' && x.heightM > Math.max(-Infinity, ...named.map((n) => n.heightM)) + 0.5).sort((a, b) => b.heightM - a.heightM)
  let roofAt: number | undefined, rimAt: number | undefined, plateAt: number | undefined
  const pitch = tops.filter((x) => x.at === 'eave' || x.at === 'ridge').map((x) => x.heightM)
  if (!tops.length && over.length && lv.length >= 2) {
    roofAt = over[0].heightM
    if (over[1] && roofAt - over[1].heightM < PITCH_M) (rimAt = roofAt), (roofAt = over[1].heightM)
  } else if (pitch.length && named.length && !tops.some((x) => x.at === 'plate')) plateAt = over.find((x) => x.heightM < Math.min(...pitch))?.heightM
  const skip = new Set([roofAt, rimAt, plateAt].filter((x) => x !== undefined))
  // one floor per height (+7.3 and +7.32, a plan printed twice): a named one before a value alone
  const uniq: Mark[] = []
  for (const x of lv.filter((x) => !skip.has(x.heightM)).sort((a, b) => +(a.at === 'level') - +(b.at === 'level'))) if (!uniq.some((u) => Math.abs(u.heightM - x.heightM) <= AGREE_M)) uniq.push(x)
  uniq.sort((a, b) => a.heightM - b.heightM)
  const below = (x: Mark) => typeof x.at === 'number' && x.at < 0
  const ground = uniq.find((x) => x.at === 0) ?? uniq.find((x) => Math.abs(x.heightM) < 0.01 && !below(x)) ?? uniq.find((x) => !below(x))
  if (!ground) return null
  const g = uniq.indexOf(ground)
  const out: Heights = { floors: {} }
  uniq.forEach((x, i) => (out.floors[i - g] = x.heightM - ground.heightM))
  const top = uniq.length - 1 - g
  const at = (k: number) => out.floors[k]
  const rel = (h: number) => h - ground.heightM
  const above = (kind: MarkAt) => [...tops.filter((x) => x.at === kind).map((x) => x.heightM), ...(kind === 'plate' && plateAt !== undefined ? [plateAt] : [])].map(rel).filter((h) => h > at(top) + 0.5)
  // a ceiling under the next floor: the slab between them
  for (const c of tops.filter((x) => x.at === 'plate').map((x) => rel(x.heightM))) {
    const k = Object.keys(out.floors).map(Number).filter((f) => f < top && at(f) < c && c < at(f + 1)).pop()
    if (k !== undefined && at(k + 1) - c > 0.05 && at(k + 1) - c < 1) out.slabM ??= at(k + 1) - c
  }
  const plate = Math.min(...above('plate'))
  const eave = Math.max(...above('eave'))
  const ridge = Math.max(...above('ridge'))
  const roof = roofAt !== undefined ? rel(roofAt) : Math.min(...above('roof'))
  const parapet = rimAt !== undefined ? rel(rimAt) : Math.max(...above('parapet'))
  if (Number.isFinite(plate)) out.ceilingM = plate
  if (Number.isFinite(ridge) && ridge - (Number.isFinite(eave) ? eave : Number.isFinite(plate) ? plate : at(top)) >= PITCH_M) {
    if (Number.isFinite(eave)) out.eaveM = eave
    out.ridgeM = ridge
    if (read.outline === 'trapezoid') out.hip = true // (a hip's long side: the ridge shorter than the eave; a gable shows a rectangle)
  } else if (Number.isFinite(roof)) {
    out.roofM = roof
    if (Number.isFinite(parapet) && parapet > roof) out.parapetM = parapet - roof
  }
  return Object.keys(out.floors).length > 1 || out.ceilingM !== undefined || out.roofM !== undefined || out.ridgeM !== undefined ? out : null
}

/** what the set's views say together, and where two of them differ by more than 5 cm (a question for the person) */
export interface SetHeights extends Heights {
  differ: { key: string; options: { title: string; m: number }[] }[]
  /** the views that gave a height, as titled */
  from: string[]
}

const TOPS = ['ceilingM', 'roofM', 'eaveM', 'ridgeM', 'parapetM', 'slabM'] as const

/**
 * The set's heights from its views' (what a person typed on a drawing first, then sections, then elevations, each in the
 * set's order): each height from the first view that gives it; another view more than 5 cm off it makes a question
 * (`differ`, by key: a floor's number, 'ceilingM', 'roofM' …) — never against a typed one. A roof read pitched by one view
 * and flat by another: the first's. `answers`: the person's answer to a question (which option, by key).
 */
export function setHeights(views: { title: string; kind: string; heights: Heights | null; typed?: boolean }[], answers: Record<string, number> = {}): SetHeights {
  const out: SetHeights = { floors: {}, differ: [], from: [] }
  const seen = new Map<string, { title: string; m: number }[]>()
  const put = (key: string, m: number, title: string) => {
    const had = seen.get(key)
    if (!had) seen.set(key, [{ title, m }])
    else if (!had.some((h) => Math.abs(h.m - m) <= AGREE_M)) had.push({ title, m })
  }
  let pitched: boolean | null = null
  const typed = new Set(views.filter((v) => v.typed).map((v) => v.title))
  for (const v of [...views].sort((a, b) => +!!b.typed - +!!a.typed || rank(a.kind) - rank(b.kind))) {
    const h = v.heights
    if (!h) continue
    out.from.push(v.title)
    for (const [k, m] of Object.entries(h.floors)) put(k, m, v.title)
    const p = h.ridgeM !== undefined ? true : h.roofM !== undefined ? false : null
    pitched ??= p
    for (const key of TOPS) if (h[key] !== undefined && (key === 'ceilingM' || key === 'slabM' || p === pitched)) put(key, h[key]!, v.title)
  }
  // a hipped roof: an elevation shows a hip's long side (a trapezoid) — and none shows a gable's (a rectangle) unless typed so
  const said = views.find((v) => v.typed && v.heights?.ridgeM !== undefined)
  const hip = said ? !!said.heights!.hip : views.some((v) => v.heights?.hip)
  if (pitched && hip) out.hip = true
  for (const [key, options] of seen) {
    const m = options[answers[key] ?? 0]?.m ?? options[0].m
    if (/^-?\d+$/.test(key)) out.floors[Number(key)] = m
    else out[key as (typeof TOPS)[number]] = m
    if (options.length > 1 && !typed.has(options[0].title)) out.differ.push({ key, options })
  }
  out.from = [...new Set(out.from)]
  return out
}
const rank = (kind: string) => (kind === 'section' ? 0 : kind === 'elevation' ? 1 : 2)

/** a person's typed heights over what was read: each typed one wins, the rest as read */
export const withTyped = (read: Heights | null, typed: Partial<Heights> | undefined): Heights | null =>
  !typed || !Object.keys(typed).length ? read : { ...(read ?? { floors: {} }), ...typed, floors: { ...(read?.floors ?? {}), ...(typed.floors ?? {}) } }

export { floorsOf, heightFields, parseHeight, parseStoreys, storeysOf, storeysWords, typedHeights, type HeightField, type RoofKind } from '../data/building/storeys'
