/**
 * A building's storeys (session 31, Stage 3 of Docs/PLAN_DRAWING_SETS.md): its heights as its drawings print them
 * (src/import/heights.ts reads them from the set's sections and elevations, the Set panel lets a person type them) and the
 * tower the Building view and the walk draw from them. Pure; kept apart from the sheet reader so the viewer never loads it.
 */
import { parseLength, type Unit } from '../../core'

/** the slab when no drawing prints it: a Dhaka RCC floor slab (and the 3D's own, render.ts SLAB_M) */
export const SLAB_M = 0.15
/**
 * A building's heights as one view (or the set, or the person) says them, in metres over the ground floor's finished
 * floor — as a drawing prints its levels. Floors: 0 the ground floor, n ≥ 1, −n basement n.
 */
export interface Heights {
  /** each floor's finished floor */
  floors: Record<number, number>
  /** the top floor's ceiling (a ceiling or top-plate mark): its walls stop there */
  ceilingM?: number
  /** a flat roof's slab top (a roof mark) */
  roofM?: number
  /** a pitched roof's eave and ridge */
  eaveM?: number
  ridgeM?: number
  /** a pitched roof hipped at its ends (else a gable) */
  hip?: boolean
  /** a flat roof's parapet: how high it stands over the roof slab */
  parapetM?: number
  /** the floor slab's thickness: each storey's walls stop this far under the next floor */
  slabM?: number
}

/** the tower's storeys as a project draws them (towerHeights) */
export interface TowerHeights {
  /** each floor's finished floor, from the lowest to the roof (top + 1), m over the ground floor's */
  levels: Record<number, number>
  /** each floor's walls, from its floor up to the slab over it (the top floor's: to its ceiling) */
  walls: Record<number, number>
  slabM: number
  /** a flat roof's parapet over the roof slab */
  parapetM?: number
  /** a pitched roof's eave and ridge, m over the ground floor, and whether it is hipped (else a gable) */
  eaveM?: number
  ridgeM?: number
  hip?: boolean
}

/**
 * Heights as the tower draws them, floor `lowest` (a basement, or 0) to `top` and the roof over it: a floor the drawings
 * list stands at its level; one past the highest listed takes the storey under it again (a typical floor), one under the
 * lowest the storey over it, one in a gap between two listed ones a share of the gap; `typical` when no storey is known.
 * The roof stands on the top floor's ceiling (or the eave) plus the slab, else on a flat roof's slab, else a storey over
 * the top floor — a building taller than its section keeps the section's top storey. Walls stop a slab under the next floor.
 */
export function towerHeights(h: Heights, lowest: number, top: number, typical: number): TowerHeights {
  const slabM = h.slabM ?? SLAB_M
  const ks = Object.keys(h.floors).map(Number).sort((a, b) => a - b)
  if (!ks.length) ks.push(0), (h = { ...h, floors: { 0: 0 } })
  const lo = ks[0], hi = ks[ks.length - 1]
  const step = (k: number) => (h.floors[k + 1] !== undefined && h.floors[k] !== undefined ? h.floors[k + 1] - h.floors[k] : undefined)
  const up = step(hi - 1) ?? typical
  const down = step(lo) ?? typical
  const levels: Record<number, number> = {}
  for (let k = Math.min(lowest, lo); k <= Math.max(top, hi); k++) {
    if (h.floors[k] !== undefined) levels[k] = h.floors[k]
    else if (k > hi) levels[k] = h.floors[hi] + (k - hi) * up
    else if (k < lo) levels[k] = h.floors[lo] - (lo - k) * down
    else {
      const a = ks.filter((f) => f < k).pop()!, b = ks.find((f) => f > k)!
      levels[k] = h.floors[a] + ((h.floors[b] - h.floors[a]) * (k - a)) / (b - a)
    }
  }
  // the top storey: the drawings' own (their top floor to its ceiling or eave and the slab, or to the roof slab), carried up to the project's top floor
  const ceiling = h.ceilingM ?? (h.ridgeM !== undefined ? h.eaveM : undefined)
  const roofOver = ceiling !== undefined ? ceiling + slabM - h.floors[hi] : h.roofM !== undefined ? h.roofM - h.floors[hi] : up
  const shift = levels[top] - h.floors[hi]
  levels[top + 1] = levels[top] + roofOver
  const walls: Record<number, number> = {}
  for (let k = Math.min(lowest, lo); k <= top; k++) walls[k] = levels[k + 1] - levels[k] - slabM
  const pitched = h.ridgeM !== undefined ? { ridgeM: h.ridgeM + shift, eaveM: (h.eaveM ?? h.floors[hi] + roofOver - slabM) + shift, ...(h.hip ? { hip: true } : {}) } : null
  return { levels, walls, slabM, ...(pitched ?? (h.parapetM !== undefined ? { parapetM: h.parapetM } : {})) }
}

/** a full wall reaches the slab over its storey (the Studio's walls are 3.048 m, the built-in flats' 3.0); a lower one (a parapet, a planter edge, a wall a person set lower) keeps its own height */
const FULL_M = 2.99

/**
 * `u` with its full walls as tall as storey `wallM` (m): its ceiling there; an opening up to the wall's top (glass from floor
 * to ceiling) still reaches it, one whose head the lower wall would cut stops under it. `u` itself when no height is known.
 */
export const storeyUnit = (u: Unit, wallM: number | undefined): Unit =>
  wallM === undefined || !u.walls.some((w) => w.heightM >= FULL_M && w.heightM !== wallM)
    ? u
    : {
        ...u,
        walls: u.walls.map((w) =>
          w.heightM < FULL_M
            ? w
            : { ...w, heightM: wallM, openings: w.openings.map((o) => (o.sillM + o.heightM >= Math.min(w.heightM - 0.01, wallM) ? { ...o, heightM: Math.max(0.1, wallM - o.sillM) } : o)) },
        ),
      }

/** floor to floor of the floors listed (k → k + 1, both listed), by k */
export function storeysOf(h: Heights): Record<number, number> {
  const out: Record<number, number> = {}
  for (const k of Object.keys(h.floors).map(Number)) if (h.floors[k + 1] !== undefined) out[k] = h.floors[k + 1] - h.floors[k]
  return out
}
/** floors from floor to floor (k → k + 1), the ground floor at its level (0): a run broken by a missing storey stops there */
export function floorsOf(storeys: Record<number, number>, ground = 0): Record<number, number> {
  const out: Record<number, number> = { 0: ground }
  for (let k = 0; storeys[k] !== undefined; k++) out[k + 1] = out[k] + storeys[k]
  for (let k = -1; storeys[k] !== undefined; k--) out[k] = out[k + 1] - storeys[k]
  return out
}

// ---------- words for the Set panel (and the project's Heights line) ----------

const TOPS = ['ceilingM', 'roofM', 'eaveM', 'ridgeM', 'parapetM', 'slabM'] as const

/** a drawing's heights as the Set panel's fields: floor to floor in short (storeysWords), the tops as levels as printed ("+5.79"), the slab and a parapet as heights */
export type HeightField = 'storeys' | 'ceiling' | 'slab' | 'roof' | 'parapet' | 'eave' | 'ridge' | 'kind'
/** the roof's kind as the Set panel's box says it */
export type RoofKind = 'flat' | 'pitched' | 'hip'
export function heightFields(h: Heights | null): Record<HeightField, string> {
  const lv = (m: number | undefined) => (m === undefined ? '' : `${m < 0 ? '−' : '+'}${Math.abs(m).toFixed(2)}`)
  const ht = (m: number | undefined) => (m === undefined ? '' : m.toFixed(2))
  return {
    storeys: h ? storeysWords(storeysOf(h)) : '',
    ceiling: lv(h?.ceilingM),
    slab: ht(h?.slabM),
    roof: lv(h?.roofM),
    parapet: ht(h?.parapetM),
    eave: lv(h?.eaveM),
    ridge: lv(h?.ridgeM),
    kind: h?.ridgeM !== undefined ? (h.hip ? 'hip' : 'pitched') : 'flat',
  }
}

/** a length as typed: metres ("3.05", "+6.10", "−3,05"), or feet and inches with their marks ("10'-0"", "+20'-0""); null else */
export function parseHeight(raw: string): number | null {
  const t = raw.trim().replace(/[−–]/g, '-').replace(/^\+\s*/, '')
  const neg = t.startsWith('-')
  const body = t.replace(/^-\s*/, '')
  const v = /^\d+(?:[.,]\d+)?$/.test(body) ? Number(body.replace(',', '.')) : parseLength(body.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'))
  return v === null || !Number.isFinite(v) ? null : neg ? -v : v
}

/**
 * A drawing's heights with what the person typed over them (a field as shown changes nothing; an empty one takes the
 * height away): floor to floor rebuilds the floors from the ground floor's and the tops (ceiling, roof, eave, ridge) move
 * with the top floor — a top field typed over that is where typed; a pitched roof keeps no flat roof's slab and parapet and
 * the other way round. `bad`: the fields that do not read as a length.
 */
export function typedHeights(read: Heights | null, typed: Partial<Record<HeightField, string>> = {}): { heights: Heights | null; bad: HeightField[] } {
  let shown = heightFields(read)
  const bad: HeightField[] = []
  const h: Heights = read ? { ...read, floors: { ...read.floors } } : { floors: {} }
  // floor to floor first: the roof stays on the top floor — its ceiling, roof, eave and ridge move with it (else a taller
  // storey ran into the roof), and a top typed over after that is where it was typed
  const st = typed.storeys
  if (st !== undefined && st !== shown.storeys) {
    const ks = Object.keys(storeysOf(h)).map(Number)
    const s = parseStoreys(st, ks.length ? ks : [0])
    if (s === null) bad.push('storeys')
    else {
      const top = Math.max(...Object.keys(h.floors).map(Number))
      const was = h.floors[top]
      h.floors = floorsOf(s, h.floors[0] ?? 0)
      const by = was !== undefined && h.floors[top] !== undefined ? h.floors[top] - was : 0
      for (const k of ['ceilingM', 'roofM', 'eaveM', 'ridgeM'] as const) if (by && h[k] !== undefined) h[k] += by
      shown = { ...heightFields(h), storeys: st, kind: shown.kind }
    }
  }
  for (const f of Object.keys(typed) as HeightField[]) {
    const text = typed[f] ?? ''
    if (text === shown[f] || f === 'kind' || f === 'storeys') continue
    const key = (f + 'M') as 'ceilingM' | 'slabM' | 'roofM' | 'parapetM' | 'eaveM' | 'ridgeM'
    if (!text.trim()) {
      delete h[key]
      continue
    }
    const v = parseHeight(text)
    if (v === null || ((f === 'slab' || f === 'parapet') && (v < 0 || v > 3))) bad.push(f)
    else h[key] = v
  }
  const kind = typed.kind ?? shown.kind
  if (kind === 'flat') delete h.eaveM, delete h.ridgeM, delete h.hip
  else {
    delete h.roofM, delete h.parapetM
    if (kind === 'hip') h.hip = true
    else delete h.hip
  }
  const some = Object.keys(h.floors).length > 1 || TOPS.some((k) => h[k] !== undefined)
  return { heights: some ? h : null, bad }
}

const floorWord = (k: number) => (k === 0 ? 'G' : k < 0 ? `B${-k}` : String(k))

/** floor to floor in short: "3.05" (one height for every storey), "G 4.50, 1–9 3.05" (runs of one height); '' none */
export function storeysWords(storeys: Record<number, number>): string {
  const ks = Object.keys(storeys).map(Number).sort((a, b) => a - b)
  if (!ks.length) return ''
  const v = (k: number) => storeys[k].toFixed(2)
  if (ks.every((k) => v(k) === v(ks[0]))) return v(ks[0])
  const parts: string[] = []
  for (let i = 0; i < ks.length; ) {
    let j = i
    while (j + 1 < ks.length && ks[j + 1] === ks[j] + 1 && v(ks[j + 1]) === v(ks[i])) j++
    parts.push(`${j > i ? `${floorWord(ks[i])}–${floorWord(ks[j])}` : floorWord(ks[i])} ${v(ks[i])}`)
    i = j + 1
  }
  return parts.join(', ')
}

/**
 * What a person types for floor to floor back to heights by floor: "3.05" (every storey `floors` lists), "G 4.5, 1-9 3.05",
 * "10'-0"" (feet and inches as parseLength reads them). Null when a piece is no floor or no length.
 */
export function parseStoreys(text: string, floors: number[]): Record<number, number> | null {
  const t = text.trim()
  if (!t) return {}
  const len = (s: string) => {
    // (a bare number is metres here; feet and inches carry their marks)
    const v = /^\d+(?:[.,]\d+)?$/.test(s.trim()) ? Number(s.trim().replace(',', '.')) : parseLength(s.replace(/[‘’′]/g, "'").replace(/[“”″]/g, '"'))
    return v !== null && v >= 1.5 && v <= 12 ? v : null
  }
  const one = len(t)
  if (one !== null) return Object.fromEntries(floors.map((k) => [k, one]))
  const out: Record<number, number> = {}
  for (const part of t.split(/\s*[,;]\s*/).filter(Boolean)) {
    const m = /^(G|B\d{1,2}|\d{1,3})(?:\s*[-–]\s*(G|B\d{1,2}|\d{1,3}))?\s+(.+)$/i.exec(part)
    const k = (s: string) => (/^G$/i.test(s) ? 0 : /^B/i.test(s) ? -Number(s.slice(1)) : Number(s))
    const v = m ? len(m[3]) : null
    if (!m || v === null) return null
    const [a, b] = [k(m[1]), k(m[2] ?? m[1])]
    for (let f = Math.min(a, b); f <= Math.max(a, b); f++) out[f] = v
  }
  return out
}

/**
 * A project's heights in one short line, as the Studio's project column says them under the drawings kept from the set:
 * "Floor to floor 3.05 m · slab 0.15 · gable, eave +6.10, ridge +8.89". A slab or parapet not printed reads as built
 * (0.15, 1.10); nothing known: every storey `typical` floor to floor, as before.
 */
export function heightsLine(h: Heights | null | undefined, typical: number): string {
  const lv = (m: number) => `${m < 0 ? '−' : '+'}${Math.abs(m).toFixed(2)}`
  if (!h) return `Floor to floor ${typical.toFixed(2)} m, as usual`
  const s = storeysWords(storeysOf(h))
  return [
    s ? `Floor to floor ${s} m` : `Floor to floor ${typical.toFixed(2)} m`,
    h.ceilingM !== undefined ? `ceiling ${lv(h.ceilingM)}` : '',
    `slab ${(h.slabM ?? SLAB_M).toFixed(2)}`,
    h.ridgeM !== undefined
      ? `${h.hip ? 'hip' : 'gable'}${h.eaveM !== undefined ? `, eave ${lv(h.eaveM)}` : ''}, ridge ${lv(h.ridgeM)}`
      : h.roofM !== undefined
        ? `flat roof ${lv(h.roofM)}, parapet ${(h.parapetM ?? 1.1).toFixed(2)}`
        : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
