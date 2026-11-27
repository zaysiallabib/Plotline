/**
 * A building's roof (session 31 roof lane; Docs/review/outside/INVENTORY.md §3 items 1, 7, 19, 20 and §5.4): what stands over
 * its top floor — flat with its parapet (what every building had before), or pitched: a gable, a hip, a shed (one slope) or
 * a mansard — its pitch, which way its ridge runs, its eaves' overhang, its covering (a finish option over a texture set,
 * furnish/finishes.ts ROOF_COVERINGS), its edge (a coping cap on the parapet, a cornice band) and its roof windows.
 *
 * ONE roof model: a set's sections and elevations fill a pitched roof's kind, eave and ridge (storeys.ts Heights: `hip`,
 * `eaveM`, `ridgeM`); the person's setting (Project.roof; a built-in tower's kept in this browser) comes over what they read.
 * Absent: today's flat roof and parapet, vertex for vertex. Pure but the store at the bottom.
 */
import type { FinishOption } from '../../core'
import { ROOF_COVERINGS } from '../../furnish/finishes'
import type { Heights } from './storeys'

export type RoofKind = 'flat' | 'gable' | 'hip' | 'shed' | 'mansard'

/** The kinds as a person reads them, in the order offered. */
export const ROOF_KINDS: [RoofKind, string][] = [
  ['flat', 'Flat'],
  ['gable', 'Gable'],
  ['hip', 'Hip'],
  ['shed', 'Shed'],
  ['mansard', 'Mansard'],
]

/**
 * A roof window (on a flat roof: a skylight on its deck): on slope `side` (0 the front, 1 the back; a shed's one slope and a
 * flat deck: either), its middle `along` the ridge and `up` the slope from the eave (0–1 of each), `wM` wide × `hM` up the slope.
 */
export interface RoofWindow {
  side: 0 | 1
  along: number
  up: number
  wM: number
  hM: number
}

/**
 * A piece on the roof the tower draws (session 31 pieces): solar panels or a chimney, placed as a roof window is (`side`,
 * `along`, `up`): on a flat roof standing on its deck, on a slope lying on it (a chimney upright through it).
 */
export interface RoofPiece {
  kind: 'solar' | 'chimney'
  side: 0 | 1
  along: number
  up: number
}
/** the library piece each draws as (furnish/procedural.meta.ts) */
export const ROOF_PIECE_ASSET: Record<RoofPiece['kind'], string> = { solar: 'solar_panel', chimney: 'chimney' }

export interface Roof {
  kind: RoofKind
  /** degrees; absent: what the set's eave and ridge make, else DEFAULT_PITCH */
  pitchDeg?: number
  /** which way the ridge runs: along the building's longer side (absent) or across it */
  ridge?: 'long' | 'short'
  /** how far the roof reaches past the walls (m), with a fascia board along its edge and a soffit under it; absent: none */
  overhangM?: number
  /** a ROOF_COVERINGS option id; absent: the first of the kind's list (the roof as it was drawn before) */
  covering?: string
  /** a cap on a flat roof's parapet; absent: none */
  coping?: 'plaster' | 'metal' | 'stone'
  /** a band round the building under the roof line */
  cornice?: boolean
  windows?: RoofWindow[]
  /** solar panels and chimneys on it */
  pieces?: RoofPiece[]
}

export const DEFAULT_PITCH = 30
/** a roof window as a typical one comes (78 × 118 cm) */
export const WINDOW_SIZE = { wM: 0.78, hM: 1.18 }
export const COPINGS: [NonNullable<Roof['coping']> | '', string][] = [
  ['', 'None'],
  ['plaster', 'Plaster'],
  ['metal', 'Metal'],
  ['stone', 'Stone'],
]

export const isPitched = (r: Roof | undefined): boolean => !!r && r.kind !== 'flat'

/** The roof a project draws: its setting, else what its set read (a ridge printed: a gable, or a hip when its elevations show one), else none (flat, as before). */
export const roofOf = (roof: Roof | undefined, h: Heights | undefined): Roof | undefined =>
  roof ?? (h?.ridgeM !== undefined ? { kind: h.hip ? 'hip' : 'gable' } : undefined)

/** The coverings a roof of this kind can take (a flat deck's, a slope's); the first is the roof as drawn before any was chosen. */
export const coveringsFor = (r: Roof | undefined): FinishOption[] => (isPitched(r) ? ROOF_COVERINGS.pitched : ROOF_COVERINGS.flat)
/** The roof's covering (one its kind cannot take, after a change of kind: the kind's first). */
export const coveringOf = (r: Roof | undefined): FinishOption => coveringsFor(r).find((o) => o.id === r?.covering) ?? coveringsFor(r)[0]

/**
 * The roof in plain words for the floor list: "Gable · 30° · Clay tiles · eaves 0.60 m · 2 roof windows" — a pitch not typed
 * reads "as the drawings print it" when the set read a ridge (`read`), else the default.
 */
export function roofWords(r: Roof | undefined, read = false): string {
  if (!r || r.kind === 'flat')
    return [
      'Flat, with its parapet',
      coveringOf(r).label,
      r?.coping ? `${r.coping} coping` : '',
      r?.cornice ? 'cornice' : '',
      r?.windows?.length ? `${r.windows.length} skylight${r.windows.length === 1 ? '' : 's'}` : '',
      ...pieceWords(r),
    ]
      .filter(Boolean)
      .join(' · ')
  const name = ROOF_KINDS.find(([k]) => k === r.kind)![1]
  return [
    name,
    r.pitchDeg !== undefined ? `${r.pitchDeg}°` : read ? 'pitch as drawn' : `${DEFAULT_PITCH}°`,
    coveringOf(r).label,
    r.overhangM ? `eaves ${r.overhangM.toFixed(2)} m` : '',
    r.cornice ? 'cornice' : '',
    r.windows?.length ? `${r.windows.length} roof window${r.windows.length === 1 ? '' : 's'}` : '',
    ...pieceWords(r),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "2 solar panel frames · 1 chimney" */
const pieceWords = (r: Roof | undefined): string[] =>
  (['solar', 'chimney'] as const).flatMap((k) => {
    const n = r?.pieces?.filter((p) => p.kind === k).length ?? 0
    return n ? [`${n} ${k === 'solar' ? 'solar panel frame' : 'chimney'}${n === 1 ? '' : 's'}`] : []
  })

/**
 * Windows (or pieces) on one slope spread evenly along it after one is added or taken away (the person drags one along
 * afterwards): the `side` slope's at 1/(n+1), 2/(n+1) …, half way up; the other slope's as they were.
 */
export function spread<T extends { side: 0 | 1; along: number; up: number }>(ws: T[], side: 0 | 1): T[] {
  const mine = ws.filter((w) => w.side === side)
  let i = 0
  return ws.map((w) => (w.side === side ? { ...w, along: ++i / (mine.length + 1), up: 0.5 } : w))
}

/** A stored roof, shape-checked: null when it is not one (a corrupt store, an older browser's). */
export function parseRoof(x: unknown): Roof | null {
  const r = x as Roof | null
  if (!r || typeof r !== 'object' || !ROOF_KINDS.some(([k]) => k === r.kind)) return null
  const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined)
  const pitchDeg = num(r.pitchDeg, 5, 75)
  const overhangM = num(r.overhangM, 0, 3)
  const windows = Array.isArray(r.windows)
    ? r.windows.filter((w) => w && typeof w === 'object').map((w) => ({ side: w.side === 1 ? (1 as const) : (0 as const), along: num(w.along, 0, 1) ?? 0.5, up: num(w.up, 0, 1) ?? 0.5, wM: num(w.wM, 0.3, 4) ?? WINDOW_SIZE.wM, hM: num(w.hM, 0.3, 4) ?? WINDOW_SIZE.hM }))
    : undefined
  const pieces = Array.isArray(r.pieces)
    ? r.pieces.filter((p) => p && (p.kind === 'solar' || p.kind === 'chimney')).map((p) => ({ kind: p.kind, side: p.side === 1 ? (1 as const) : (0 as const), along: num(p.along, 0, 1) ?? 0.5, up: num(p.up, 0, 1) ?? 0.5 }))
    : undefined
  return {
    kind: r.kind,
    ...(pitchDeg !== undefined ? { pitchDeg } : {}),
    ...(r.ridge === 'short' ? { ridge: 'short' as const } : {}),
    ...(overhangM ? { overhangM } : {}),
    ...(typeof r.covering === 'string' ? { covering: r.covering } : {}),
    ...(r.coping === 'plaster' || r.coping === 'metal' || r.coping === 'stone' ? { coping: r.coping } : {}),
    ...(r.cornice ? { cornice: true } : {}),
    ...(windows?.length ? { windows } : {}),
    ...(pieces?.length ? { pieces } : {}),
  }
}

/** a built-in tower's roof as staff set it in the 3D view, kept in this browser by the tower's first flat (its stems never change) */
export const ROOFS_KEY = 'plotline.roofs'

export function keptRoofs(): Record<string, Roof> {
  try {
    const all = JSON.parse(localStorage.getItem(ROOFS_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(all).flatMap(([k, v]) => (parseRoof(v) ? [[k, parseRoof(v)!]] : [])))
  } catch {
    return {} // no storage (tests, blocked) or a corrupt one: none
  }
}

/** false when the browser refused (storage full / blocked); null takes the kept roof away (the tower's own again) */
export function keepRoof(key: string, r: Roof | null): boolean {
  try {
    const all = keptRoofs()
    if (r) all[key] = r
    else delete all[key]
    localStorage.setItem(ROOFS_KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}
