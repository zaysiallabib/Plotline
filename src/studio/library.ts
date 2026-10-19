/**
 * The staff library's listing, one for Studio tool F and the 3D view's Add (LibraryPanel.tsx): a search over name, kind, room
 * and tags; the pieces by room (furniture.ts library() tabs), then by kind, with counts; the pieces used last first. Pure.
 */
import { formatFeetInches } from '../core'
import { library, type LibraryItem } from './furniture'

/** Group headings for the kinds (ObjectKind); the rest read as their kind, capitalised. */
const KIND_LABEL: Record<string, string> = {
  bed: 'Beds', bedside: 'Bedside tables', wardrobe: 'Wardrobes', sofa: 'Sofas', armchair: 'Armchairs', 'coffee-table': 'Coffee tables',
  'tv-unit': 'TV units', 'dining-table': 'Dining tables', 'dining-chair': 'Dining chairs', desk: 'Desks', chair: 'Chairs', shelf: 'Shelves',
  rug: 'Rugs', plant: 'Plants', tv: 'TVs', art: 'Pictures', curtain: 'Curtains', cushions: 'Cushions', ottoman: 'Ottomans', decor: 'Decor',
  'ceiling-light': 'Lights', 'ceiling-fan': 'Fans', ac: 'Air conditioning', 'kitchen-cabinet': 'Cabinets', sink: 'Sinks', hob: 'Cooking',
  hood: 'Hoods', fridge: 'Fridges', toilet: 'Toilets', vanity: 'Vanities', basin: 'Basins', shower: 'Showers', mirror: 'Mirrors',
  bench: 'Benches', lounger: 'Loungers', 'table-set': 'Table sets', pergola: 'Pergolas', play: 'Play', gym: 'Gym', 'reception-desk': 'Reception',
  car: 'Cars', clock: 'Clocks', lamp: 'Lamps', appliance: 'Appliances', 'prayer-mat': 'Prayer',
}

/** Words a kind is also found by (Dhaka words too: almirah, chula, jaynamaz). */
const KIND_WORDS: Record<string, string> = {
  bed: 'bed', bedside: 'nightstand side table', wardrobe: 'almirah closet cupboard storage', sofa: 'couch settee seating',
  armchair: 'chair seating', 'coffee-table': 'table centre center', 'tv-unit': 'tv media console cabinet', 'dining-table': 'table',
  'dining-chair': 'chair seating', desk: 'table study work', chair: 'seating', shelf: 'shelves bookcase storage', rug: 'carpet',
  plant: 'plants green pot', 'ceiling-light': 'light lamp', 'ceiling-fan': 'fan', ac: 'air conditioner aircon cooling',
  tv: 'television screen', art: 'picture painting print frame wall', curtain: 'curtains drapes window', mirror: 'glass',
  'kitchen-cabinet': 'cabinet counter cupboard', sink: 'basin', hob: 'stove cooker chula gas', hood: 'chimney exhaust',
  fridge: 'refrigerator', toilet: 'wc commode', vanity: 'basin sink mirror', basin: 'sink washbasin wash hand', shower: 'bath',
  bench: 'seating', lounger: 'sunbed', 'table-set': 'table chairs', play: 'kids children', gym: 'fitness exercise', car: 'parking',
  cushions: 'pillows', ottoman: 'pouf stool', clock: 'time', lamp: 'light', 'prayer-mat': 'namaz jaynamaz prayer mat',
}

/** Room words per group, matched only whole: "bed" finds the beds, not every bedroom piece. */
const ROOM_WORDS: Record<string, string> = {
  Living: 'living drawing lounge', Dining: 'dining', Bedroom: 'bedroom', Office: 'office study', Kitchen: 'kitchen',
  Bath: 'bath bathroom toilet washroom', 'Lights & AC': 'lights lighting ac', Greenery: 'greenery garden balcony',
  Outdoor: 'outdoor balcony garden rooftop roof terrace', 'Lobby & gym': 'lobby gym common', Decor: 'decor',
}

/** Words a piece is also found by, beyond its name and kind. */
const TAGS: Record<string, string> = {
  modern_wooden_cabinet: 'tv unit sideboard', modern_ceiling_lamp_01: 'pendant', ceiling_light: 'ceiling', ceiling_light_large: 'ceiling',
  covered_car: 'parking', side_table_01: 'nightstand', throw_pillows_01: 'cushions', hook_rail: 'towel', ac_split: 'split',
}

export interface Entry extends LibraryItem {
  /** the groups it is listed in */
  rooms: string[]
  tags: string[]
  /** its footprint in feet: width × depth */
  feet: string
}
export interface Group {
  name: string
  count: number
  /** by kind (no query) — a single unnamed one while searching (best match first) or for Recent */
  kinds: { name: string; items: Entry[] }[]
}

export const RECENT_MAX = 6
export const RECENT_KEY = 'plotline.library.recent'
/** The piece just picked first, then the others, at most RECENT_MAX. */
export const pushRecent = (recent: string[], id: string): string[] => [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_MAX)

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const kindLabel = (k: string) => KIND_LABEL[k] ?? k[0].toUpperCase() + k.slice(1).replace(/-/g, ' ')

let cache: { tabs: { tab: string; items: Entry[] }[]; byId: Map<string, Entry> } | null = null
/** library() with each piece's groups, tags and feet; built once (the kit never changes while the page runs). */
function entries() {
  if (cache) return cache
  const tabs = library()
  const rooms = new Map<string, string[]>()
  for (const t of tabs) for (const i of t.items) rooms.set(i.id, [...(rooms.get(i.id) ?? []), t.tab])
  const byId = new Map<string, Entry>()
  const entry = (i: LibraryItem): Entry => {
    let e = byId.get(i.id)
    if (!e) {
      const tags = [...new Set(words(`${i.kind} ${KIND_WORDS[i.kind] ?? ''} ${TAGS[i.id] ?? ''}`))]
      e = { ...i, rooms: rooms.get(i.id)!, tags, feet: `${formatFeetInches(i.size.x)} × ${formatFeetInches(i.size.z)}` }
      byId.set(i.id, e)
    }
    return e
  }
  cache = { tabs: tabs.map((t) => ({ tab: t.tab, items: t.items.map(entry) })), byId }
  return cache
}
export const entry = (id: string): Entry | undefined => entries().byId.get(id)

const stem = (w: string) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)
/**
 * How well `e` answers every query word (0: it does not): a word of its name 4, the start of one 3, a tag or kind word 2,
 * the start of one 1, a room word (whole) 1. Plurals count ("lamps" = "lamp").
 */
export function score(e: Entry, q: string[]): number {
  const name = words(e.label)
  const room = words(e.rooms.map((r) => ROOM_WORDS[r] ?? r).join(' '))
  let total = 0
  for (const w of q) {
    const s = stem(w)
    const is = (t: string) => t === w || t === s
    const s1 = name.some(is) ? 4 : name.some((t) => t.startsWith(s)) ? 3 : e.tags.some(is) ? 2 : e.tags.some((t) => t.startsWith(s)) ? 1 : room.some(is) ? 1 : 0
    if (!s1) return 0
    total += s1
  }
  return total
}

/**
 * The list under the search box. No query: Recent (the ids in `recent`), then every group with its pieces by kind (kit
 * order). A query: the groups holding a match, each best match first, the group with the best match first.
 */
export function listing(query: string, recent: string[] = []): Group[] {
  const { tabs, byId } = entries()
  const q = words(query)
  if (!q.length) {
    const rec = recent.map((id) => byId.get(id)).filter((e): e is Entry => !!e)
    const byKind = (items: Entry[]) => {
      const m = new Map<string, Entry[]>()
      for (const i of items) m.set(i.kind, [...(m.get(i.kind) ?? []), i])
      return [...m].map(([k, items]) => ({ name: kindLabel(k), items }))
    }
    const rest = tabs.filter((t) => t.items.length).map((t) => ({ name: t.tab, count: t.items.length, kinds: byKind(t.items) }))
    return rec.length ? [{ name: 'Recent', count: rec.length, kinds: [{ name: '', items: rec }] }, ...rest] : rest
  }
  return tabs
    .map((t) => {
      const hits = t.items.map((e) => ({ e, s: score(e, q) })).filter((h) => h.s > 0)
      hits.sort((a, b) => b.s - a.s) // stable: kit order among equals
      return { name: t.tab, count: hits.length, kinds: [{ name: '', items: hits.map((h) => h.e) }], best: hits[0]?.s ?? 0 }
    })
    .filter((g) => g.count)
    .sort((a, b) => b.best - a.best)
    .map(({ best: _, ...g }) => g)
}

/** What Enter picks: the first piece listed for `query` (none without one). */
export const firstMatch = (query: string): Entry | null => (words(query).length ? (listing(query)[0]?.kinds[0].items[0] ?? null) : null)
