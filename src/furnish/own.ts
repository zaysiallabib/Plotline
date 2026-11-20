/**
 * The staff's own library (session 31, founder: "whatever models you make I can make the same with least difficulty"):
 * furniture models, finish options and texture pictures a developer's staff add in the product — Studio tool F or the
 * 3D view's Add → "Add your own…", Finishes → "Add option". PURE (Vitest): the records, their rules (the size a model
 * reads, one side typed scales the rest, what is refused and why), what each becomes — a kit item (kit.ts kitAsset), a
 * finish option in its slot, a texture set (textures.ts textureSet) — and the registry those lookups read.
 * Where the records and files are kept (this browser, Supabase): lib/library.ts.
 */
import type { FinishOption, FinishSlot, MaterialRef } from '../core'
import { OWN_KIT, type KitAsset, type KitCategory, type Lamp } from './kit'
import { OWN_TEXTURES, type TextureSet } from './textures'

type Size3 = { x: number; y: number; z: number }
export type Front = KitAsset['frontAxis']
/** where a piece sits: on the floor, hung on a wall, from the ceiling, or on a table / desk / bedside (kit `onTop`) */
export type Sits = 'floor' | 'wall' | 'ceiling' | 'table'

/** A file of the library: by its SHA-256 in this browser, and online at `path` (`<org>/<sha-256>.<ext>`, bucket `library`). */
export interface OwnFile {
  hash: string
  ext: 'glb' | 'jpg' | 'png'
  bytes: number
  path?: string
}
export interface OwnModel {
  /** `own_<uuid>`: the kit asset id a placement stores */
  id: string
  type: 'model'
  label: string
  category: KitCategory
  /** which side of the file's model is its front (glTF axes; +z = the side facing you as it loaded) */
  front: Front
  sits: Sits
  /** its real size, m: x width, y height, z depth, facing its front */
  sizeM: Size3
  /** it gives light (a lamp): kit.ts lightOf */
  light?: boolean
  triangles: number
  file: OwnFile
  /** taken out of the library: no longer listed; pieces already placed still draw */
  removed?: true
  /** ISO time of its last change: the newer copy wins between this browser and online */
  at: string
}
/** A colour, a texture of the list (tinted or not), or a picture of the staff's own tiled at its real size. */
export type Look = { color: string } | { textureId: string; tint?: string } | { file: OwnFile; tileM: { x: number; y: number } }
export interface OwnFinish {
  id: string
  type: 'finish'
  /** the slot it is offered in (finishes.ts FINISH_CATALOG ids: Bedroom floors, Wall paint, Bath walls…) */
  slotId: string
  label: string
  brand: string
  sku: string
  /** integer BDT (invariant 3) */
  priceDeltaBdt: number
  look: Look
  removed?: true
  at: string
}
export type OwnItem = OwnModel | OwnFinish

export const OWN_PREFIX = 'own_'
export const isOwnId = (id: string): boolean => id.startsWith(OWN_PREFIX)

/** The kit's categories in plain words, in the order the dialog lists them. */
export const CATEGORIES: { id: KitCategory; label: string }[] = [
  { id: 'sofa', label: 'Sofa' },
  { id: 'armchair', label: 'Armchair' },
  { id: 'coffee-table', label: 'Coffee table' },
  { id: 'tv-unit', label: 'TV unit' },
  { id: 'dining-table', label: 'Dining table' },
  { id: 'dining-chair', label: 'Dining chair' },
  { id: 'bed', label: 'Bed' },
  { id: 'bedside', label: 'Bedside table' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'desk', label: 'Desk' },
  { id: 'chair', label: 'Chair' },
  { id: 'shelf', label: 'Shelf' },
  { id: 'lamp', label: 'Lamp or light' },
  { id: 'rug', label: 'Rug' },
  { id: 'plant', label: 'Plant' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'bath', label: 'Bath' },
  { id: 'other', label: 'Other' },
]

// ── what is refused, and the plain tip ───────────────────────────────────────────────────────────────────────────

/** a model's file and its triangles: over these the walk stutters on an ordinary laptop (a Poly Haven scan is 10–300k) */
export const MAX_MODEL_BYTES = 30 * 1024 * 1024
export const MAX_TRIANGLES = 2_000_000
export const MAX_PICTURE_BYTES = 4 * 1024 * 1024
/** a texture picture is kept at most this many pixels across (CLAUDE.md: ≤ 2k textures) */
export const PICTURE_PX = 2048
const DECIMATE =
  'Make it lighter in Blender (free): select the model → Modifiers → Add Modifier → Decimate, Ratio 0.5 (lower until it fits) → Apply, then File → Export → glTF 2.0, Format "glTF Binary (.glb)".'
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

/** Why a model cannot join the library (its file size, then its triangles once read), with the tip; null = it can. */
export function modelRefusal(m: { bytes?: number; triangles?: number }): string | null {
  if (m.bytes !== undefined && m.bytes > MAX_MODEL_BYTES) return `This file is ${mb(m.bytes)}: Plotline takes models up to 30 MB, so the walk stays smooth. ${DECIMATE}`
  if (m.triangles !== undefined && m.triangles > MAX_TRIANGLES)
    return `This model has ${(m.triangles / 1e6).toFixed(1)} million triangles: Plotline takes up to 2 million, so the walk stays smooth. ${DECIMATE}`
  return null
}
/** Why a texture picture cannot be used; null = it can. */
export function pictureRefusal(p: { bytes: number; type: string }): string | null {
  if (!/^image\/(jpeg|png)$/.test(p.type)) return 'Use a JPG or PNG picture of the surface (a photo of one tile, a scan of the stone).'
  if (p.bytes > MAX_PICTURE_BYTES) return `This picture is ${mb(p.bytes)}: Plotline takes texture pictures up to 4 MB. Save it as a JPG about 2000 pixels across.`
  return null
}

// ── sizes ────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Metres per unit of a model's measured size. A model file that names no unit (OBJ, STL) is read as metres or
 * millimetres for a building (import/mesh.ts); no piece of furniture is 12 m across, so a bigger one was drawn in
 * centimetres, and one over 1200 "m" in millimetres. The size is only prefilled: the person types the real one.
 */
export const furnitureScale = (maxM: number): number => (maxM <= 12 ? 1 : maxM <= 1200 ? 0.01 : 0.001)

/** The box measured in the file's axes (x, y up, z) as the piece's own size facing `front`: width, height, depth. */
export const facing = (box: Size3, front: Front): Size3 => (front.endsWith('x') ? { x: box.z, y: box.y, z: box.x } : { ...box })

const mm = (v: number) => Math.round(v * 1000) / 1000
/** One side typed (`axis` to `m` metres): the other two follow, the proportions kept; a size that is no size changes nothing. */
export function scaledTo(size: Size3, axis: keyof Size3, m: number): Size3 {
  if (!(m > 0) || !Number.isFinite(m) || !(size[axis] > 0)) return size
  const k = m / size[axis]
  return { x: mm(size.x * k), y: mm(size.y * k), z: mm(size.z * k) }
}

/** "Modern_Sofa-02.final.glb" → "Modern sofa 02 final" */
export const nameOf = (file: string): string => {
  const s = file.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : 'My piece'
}

// ── what a record becomes ─────────────────────────────────────────────────────────────────────────────────────────

/** where a lamp's bulb is, as a part of its height (the kit's floor lamp 1.36 of 1.6 m, table lamp 0.34 of 0.5) */
const BULB = { floor: 0.85, table: 0.68 }
/** where a piece on a table sits until it stands on one (studio/furniture.ts bottomOf): a desk's top */
const TABLE_TOP_M = 0.75

/** The light a lamp of the staff's own gives (kit.ts Lamp), from where it sits. */
export function lampOf(m: Pick<OwnModel, 'light' | 'sits' | 'sizeM'>): Lamp | undefined {
  if (!m.light) return undefined
  if (m.sits === 'ceiling' || m.sits === 'wall') return { kind: 'ceiling' }
  return m.sits === 'table' ? { kind: 'table', lumens: 350, bulbM: mm(m.sizeM.y * BULB.table) } : { kind: 'floor', lumens: 800, bulbM: mm(m.sizeM.y * BULB.floor) }
}

/** A model record as a kit item like any other: it drops, moves, turns, resizes, deletes and lights by the kit's rules. */
export function kitOf(m: OwnModel, url: string): KitAsset {
  const light = lampOf(m)
  return {
    id: m.id,
    label: m.label,
    category: m.category,
    url,
    sizeM: m.sizeM,
    frontAxis: m.front,
    source: 'Added by staff',
    author: 'Staff',
    license: 'own',
    bytes: m.file.bytes,
    ...(m.sits === 'wall' ? { mount: 'wall' as const } : m.sits === 'ceiling' ? { mount: 'ceiling' as const } : m.sits === 'table' ? { onTop: true as const, mountY: TABLE_TOP_M } : {}),
    // a lamp that gives no light is no ceiling fixture (kit.ts objectKind would make a 'lamp' one)
    ...(m.category === 'lamp' ? { kind: light?.kind === 'ceiling' ? ('ceiling-light' as const) : ('lamp' as const) } : {}),
    ...(light ? { light } : {}),
    own: true,
  }
}

/** A picture finish's texture set: the picture as its colour, one picture = one tile of its real size. */
export const textureOf = (f: OwnFinish, url: string, tileM: { x: number; y: number }): TextureSet => ({
  id: f.id,
  label: f.label,
  albedo: url,
  repeatM: tileM.x,
  repeatYM: tileM.y,
  source: 'Added by staff',
  author: 'Staff',
  license: 'own',
})

export function materialOf(look: Look, id: string): MaterialRef {
  if ('color' in look) return { kind: 'color', color: look.color, roughness: 0.85 }
  if ('textureId' in look) return { kind: 'pbr', textureId: look.textureId, ...(look.tint ? { tint: look.tint } : {}) }
  return { kind: 'pbr', textureId: id } // its own texture set, registered under the option's id
}

/** The structured option (invariant 5): brand, sku, label, integer BDT, material. */
export const optionOf = (f: OwnFinish): FinishOption => ({ id: f.id, brand: f.brand, sku: f.sku, label: f.label, priceDeltaBdt: Math.round(f.priceDeltaBdt), material: materialOf(f.look, f.id) })

// ── the records as they come from outside (a share link's JSON, the company's table): checked before use ─────────

const PATH = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.(glb|jpg|png)$/
const ID = /^own_[0-9a-f-]{36}$/
const COLOR = /^#[0-9a-f]{6}$/i
const str = (s: unknown, max = 120): s is string => typeof s === 'string' && s.length <= max
const pos = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max
const isFile = (f: unknown): f is OwnFile => {
  const x = f as OwnFile
  return !!x && /^[0-9a-f]{64}$/.test(x.hash) && ['glb', 'jpg', 'png'].includes(x.ext) && pos(x.bytes, MAX_MODEL_BYTES) && (x.path === undefined || (PATH.test(x.path) && x.path.endsWith(`${x.hash}.${x.ext}`)))
}
const isSize = (s: unknown): s is Size3 => !!s && pos((s as Size3).x, 20) && pos((s as Size3).y, 20) && pos((s as Size3).z, 20)
const isLook = (l: unknown): l is Look => {
  const x = l as Record<string, unknown>
  if (!x || typeof x !== 'object') return false
  if ('color' in x) return typeof x.color === 'string' && COLOR.test(x.color)
  if ('textureId' in x) return str(x.textureId, 64) && !isOwnId(x.textureId) && (x.tint === undefined || (typeof x.tint === 'string' && COLOR.test(x.tint)))
  const t = x.tileM as { x: unknown; y: unknown } | undefined
  return isFile(x.file) && x.file.ext !== 'glb' && !!t && pos(t.x, 20) && pos(t.y, 20)
}
/** A record Plotline can use as it is: every field of the right kind and size, a file only ever by its hash in the bucket. */
export function isOwnItem(v: unknown): v is OwnItem {
  const x = v as OwnItem
  if (!x || typeof x !== 'object' || !ID.test(x.id) || !str(x.label) || !x.label.trim() || !str(x.at, 40) || (x.removed !== undefined && x.removed !== true)) return false
  if (x.type === 'model')
    return CATEGORIES.some((c) => c.id === x.category) && ['+z', '-z', '+x', '-x'].includes(x.front) && ['floor', 'wall', 'ceiling', 'table'].includes(x.sits) && isSize(x.sizeM) && (x.light === undefined || typeof x.light === 'boolean') && Number.isInteger(x.triangles) && x.triangles >= 0 && x.triangles <= MAX_TRIANGLES && isFile(x.file) && x.file.ext === 'glb'
  if (x.type === 'finish') return str(x.slotId, 64) && str(x.brand) && str(x.sku, 64) && Number.isInteger(x.priceDeltaBdt) && Math.abs(x.priceDeltaBdt) <= 1e9 && isLook(x.look)
  return false
}

// ── the registry: what this page knows (kit.ts OWN_KIT, textures.ts OWN_TEXTURES and the slots read it) ──────────

const items = new Map<string, OwnItem>()
let version = 0
const listeners = new Set<() => void>()

/**
 * These records known from now on, their files at `urlOf(file)` ('' = nowhere: a buyer link's piece whose file never went
 * online draws as the box of its size, furniture.ts placeholder): a model joins the kit, a picture finish its texture.
 * A removed model stays in the kit (pieces placed before still draw), only the listing leaves it out.
 */
export function registerOwn(list: OwnItem[], urlOf: (f: OwnFile) => string): void {
  for (const it of list) {
    items.set(it.id, it)
    if (it.type === 'model') OWN_KIT[it.id] = kitOf(it, urlOf(it.file))
    else if ('file' in it.look) OWN_TEXTURES[it.id] = textureOf(it, urlOf(it.look.file), it.look.tileM)
  }
  if (!list.length) return
  version++
  for (const f of listeners) f()
}
export const ownItem = (id: string): OwnItem | undefined => items.get(id)
export const ownItems = (): OwnItem[] => [...items.values()]
/** the models the library lists (not removed), oldest first */
export const ownModels = (): OwnModel[] => ownItems().filter((i): i is OwnModel => i.type === 'model' && !i.removed)
export const ownFinishes = (): OwnFinish[] => ownItems().filter((i): i is OwnFinish => i.type === 'finish' && !i.removed)
/** bumps whenever a record is added or changed (React: useSyncExternalStore) */
export const ownVersion = (): number => version
export const onOwnChange = (f: () => void): (() => void) => (listeners.add(f), () => void listeners.delete(f))
/** tests: an empty page */
export function forgetOwn(): void {
  for (const id of items.keys()) delete OWN_KIT[id], delete OWN_TEXTURES[id]
  items.clear()
  version++
}

/** Slots with the staff's own options of each at the end (new slot objects: the unit's own copy, never the catalog's). */
export const withOwnOptions = (slots: FinishSlot[], finishes: OwnFinish[] = ownFinishes()): FinishSlot[] =>
  slots.map((s) => ({ ...s, options: [...s.options.filter((o) => !isOwnId(o.id)), ...finishes.filter((f) => f.slotId === s.id).map(optionOf)] }))
/**
 * The same, IN PLACE on slots made by withOwnOptions: the 3D view holds them (PlotlineScene's unit), so an option added
 * while it runs is in every lookup at once — the panel, the materials, a buyer's choice — without building the flat again.
 */
export function refreshOwnOptions(slots: FinishSlot[], finishes: OwnFinish[] = ownFinishes()): void {
  const next = withOwnOptions(slots, finishes)
  slots.forEach((s, i) => (s.options = next[i].options))
}
