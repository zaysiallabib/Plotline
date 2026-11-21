/**
 * Every apartment keeps its own (founder 2026-11-21: "suppose my parents want all the rooms in white but i want just mine in
 * beige … if the same room on a different floor gets a different colour that is a different apartment … this applies to
 * furniture as well"). An apartment is one drawing in one place of its building — a floor of flats or a level; the
 * mirrored neighbour is its own drawing (`<id>-m`). Its record (core Apartment) is what staff picked in Finishes and how
 * they arranged the furniture: kept in this browser under its key, and carried in the project JSON the cloud saves
 * (`apartments`, StudioApp's cloud snapshot).
 *
 * The key is the drawing's id while the drawing stands in one place (a level, a one-floor flat, a flat in no building —
 * the key every arranged layout had before, so the Studio's tool F, Preview 3D and the 3D view stay one layout), and
 * `<id>:<floor>` once it stands on several: each floor its own; what a floor never changed it takes from the drawing's
 * record (what the Studio arranged, what Preview 3D picked).
 */
import type { Apartment, Configuration, FurniturePlacement, Id, Unit } from '../../core'
import type { Tower } from './index'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
/** a store whose keys can be listed (the cloud gathers a project's records) */
type Scan = Store & Pick<Storage, 'length' | 'key'>

const LAYOUT = 'plotline.layout.'
const FINISHES = 'plotline.finishes.'
/** The arranged layout: the apartment's whole FurniturePlacement[] (the 3D view's Edit furniture, the Studio's tool F). */
export const layoutKey = (key: string): string => `${LAYOUT}${key}`
/** The finishes staff picked: the apartment's Configuration (slot ids and one-room / one-wall keys). */
export const finishesKey = (key: string): string => `${FINISHES}${key}`

/** Drawing `id` on floor `floor`, standing in `places` places of its building: its id alone in one place, else `<id>:<floor>`. */
export const apartmentKey = (id: Id, floor: number | undefined, places: number): string => (places > 1 && floor !== undefined ? `${id}:${floor}` : id)
/** The drawing an apartment key belongs to (`<id>:<floor>` → `<id>`). */
export const drawingOf = (key: string): Id => key.replace(/:-?\d+$/, '')

/** The floors of tower `t` that show drawing `id` (its mirrored copy has its own id): a floor listing it as a flat, or its level — never massing. */
export const placesIn = (t: Pick<Tower, 'FLATS' | 'FLOORS' | 'LEVELS'>, id: Id): number[] =>
  t.FLOORS.filter((f) => [...f.flats, ...(f.standIns ?? []).filter((s) => t.LEVELS?.[s] !== undefined)].some((s) => t.FLATS[s]?.unit.id === id)).map((f) => f.floor)

export function readLayout(key: string, store?: Store): FurniturePlacement[] | null {
  try {
    const v = JSON.parse((store ?? localStorage).getItem(layoutKey(key)) ?? 'null') as FurniturePlacement[] | null
    const ok = (p: FurniturePlacement) => p && typeof p.id === 'string' && typeof p.assetId === 'string' && [p.x, p.y, p.rotationDeg].every(Number.isFinite)
    return Array.isArray(v) && v.length && v.every(ok) ? v : null
  } catch {
    return null
  }
}

/** Saves the layout; none, or the one it falls back to (`base`: the drawing's, its JSON's, else the presets) removes the key, so it follows that again. */
export function saveLayout(key: string, pieces: FurniturePlacement[] | null, base?: FurniturePlacement[], store?: Store): void {
  try {
    const s = store ?? localStorage
    if (!pieces?.length || (base && JSON.stringify(pieces) === JSON.stringify(base))) s.removeItem(layoutKey(key))
    else s.setItem(layoutKey(key), JSON.stringify(pieces))
  } catch (e) {
    console.warn('[plotline] could not save the layout', e)
  }
}

export function readFinishes(key: string, store?: Store): Configuration | null {
  try {
    const v = JSON.parse((store ?? localStorage).getItem(finishesKey(key)) ?? 'null') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'string') ? (v as Configuration) : null
  } catch {
    return null
  }
}

const same = (a: Configuration, b: Configuration) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())
/** Saves the finishes; the same as the ones it falls back to (`base`: the drawing's picks, else none) removes the key — so "Reset to included" over a drawing's picks is kept as `{}`. */
export function saveFinishes(key: string, cfg: Configuration, base: Configuration = {}, store?: Store): void {
  try {
    const s = store ?? localStorage
    if (same(cfg, base)) s.removeItem(finishesKey(key))
    else s.setItem(finishesKey(key), JSON.stringify(cfg))
  } catch (e) {
    console.warn('[plotline] could not save the finishes', e)
  }
}

/**
 * What apartment `u` on `floor` of tower `t` opens with, as this browser keeps it: its key; its layout — its own, else
 * the drawing's (`base`, where Reset layout goes back to; null = the unit's own JSON / presets); its finishes, else the
 * drawing's (`baseFinishes`). A drawing standing in one place IS its apartment: no fallback.
 */
export function keptAt(u: Pick<Unit, 'id'>, floor: number | undefined, t: Pick<Tower, 'FLATS' | 'FLOORS' | 'LEVELS'> | null, store?: Store) {
  const key = apartmentKey(u.id, floor, t ? placesIn(t, u.id).length : 1)
  const drawing = key !== u.id
  const base = drawing ? readLayout(u.id, store) : null
  const baseFinishes = (drawing && readFinishes(u.id, store)) || {}
  return { key, layout: readLayout(key, store) ?? base, base, finishes: readFinishes(key, store) ?? baseFinishes, baseFinishes }
}

/** Drawing `id` is left standing in one place, floor `floor`: that floor's own record becomes the drawing's, so it shows what it had. */
export function settleOn(id: Id, floor: number, store?: Store): void {
  const s = store ?? localStorage
  for (const k of [layoutKey, finishesKey]) {
    const v = s.getItem(k(`${id}:${floor}`))
    if (v === null) continue
    s.setItem(k(id), v)
    s.removeItem(k(`${id}:${floor}`))
  }
}

/** this browser's record keys (layout / finishes) of drawings `ids` and their mirrored neighbours: [storage key, apartment key, part] */
function kept(ids: Id[], s: Scan): [string, string, keyof Apartment][] {
  const mine = new Set(ids.flatMap((id) => [id, `${id}-m`]))
  const out: [string, string, keyof Apartment][] = []
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i) ?? ''
    const part = k.startsWith(LAYOUT) ? 'furniture' : k.startsWith(FINISHES) ? 'finishes' : null
    const key = part && k.slice((part === 'furniture' ? LAYOUT : FINISHES).length)
    if (part && key && mine.has(drawingOf(key))) out.push([k, key, part])
  }
  return out
}

/** The records of drawings `ids` (a project's, or one drawing's) as this browser keeps them: what the project JSON carries to the cloud. */
export function keptFor(ids: Id[], store?: Scan): Record<string, Apartment> {
  const out: Record<string, Apartment> = {}
  try {
    const s = store ?? localStorage
    for (const [, key, part] of kept(ids, s)) {
      const v = part === 'furniture' ? readLayout(key, s) : readFinishes(key, s)
      if (v) out[key] = { ...out[key], [part]: v }
    }
  } catch {
    /* no storage: nothing kept */
  }
  return out
}

/** A project / drawing opened from the cloud: its records `recs` in place of this browser's for drawings `ids` (one reset elsewhere stays reset). */
export function putKept(ids: Id[], recs: Record<string, Apartment>, store?: Scan): void {
  try {
    const s = store ?? localStorage
    for (const [k] of kept(ids, s)) s.removeItem(k)
    const mine = new Set(ids.flatMap((id) => [id, `${id}-m`]))
    for (const [key, r] of Object.entries(recs)) {
      if (!mine.has(drawingOf(key))) continue
      if (Array.isArray(r?.furniture)) saveLayout(key, r.furniture, undefined, s)
      if (r?.finishes && typeof r.finishes === 'object') s.setItem(finishesKey(key), JSON.stringify(r.finishes))
    }
  } catch {
    /* storage full / blocked: this browser keeps what it had */
  }
}

/** A project / drawing as the cloud keeps it: its records split off (`apartments`; absent in a copy saved before them). */
export function splitKept(data: unknown): { data: unknown; apartments?: Record<string, Apartment> } {
  if (!data || typeof data !== 'object' || !('apartments' in data)) return { data }
  const { apartments, ...rest } = data as { apartments?: unknown }
  return { data: rest, apartments: apartments && typeof apartments === 'object' ? (apartments as Record<string, Apartment>) : {} }
}
