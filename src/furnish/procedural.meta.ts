/**
 * Metadata for procedurally built assets (no three import — presets.ts and
 * Vitest read this). Builders live in procedural.ts; url 'procedural:<id>'
 * tells src/three/furniture.ts to call buildProcedural(id) instead of GLTFLoader.
 * All fronts face +z: a bed's foot, a counter's doors, a toilet's seat.
 * Wall-hung pieces (toilet bowl, vanity, upper cabinets) are built from their
 * lowest point at y = 0 and lifted by mountY.
 */
import type { Pt } from '../core'
import type { KitAsset } from './kit'

const P = (id: string, label: string, category: KitAsset['category'], x: number, y: number, z: number, mountY?: number): KitAsset => ({
  id,
  label,
  category,
  url: `procedural:${id}`,
  sizeM: { x, y, z },
  frontAxis: '+z',
  source: 'procedural',
  author: 'Plotline',
  license: 'CC0',
  ...(mountY !== undefined ? { mountY } : {}),
})

/**
 * Framed prints, ART_W × ART_H, hung alone or as a 0.77 m diptych (`<set>_l` left, `<set>_r` right as you face
 * them). ART_PHOTO sets are crops of Poly Haven tonemapped HDRIs (CC0), public/assets/art/<id>.jpg; the rest are
 * painted at runtime (procedural.ts paintArt), one calm palette. Bottom at 1.25 m clears a headboard / sofa back.
 */
const ART_LABEL = {
  art_sea: 'sea at sunrise',
  art_dawn: 'mountains at dawn',
  art_blocks: 'abstract colour blocks',
  art_botanical: 'botanical line drawing',
  art_city: 'city in grey',
  art_stripes: 'warm stripes',
  art_arches: 'terracotta arches',
  art_hills: 'layered hills',
  art_sun: 'low sun over still water',
} as const
export const ART_SETS = Object.keys(ART_LABEL) as (keyof typeof ART_LABEL)[]
export const ART_PHOTO: readonly string[] = ['art_sea', 'art_dawn']
export const ART = ART_SETS.flatMap((s) => [`${s}_l`, `${s}_r`])
export const ART_W = 0.36
export const ART_H = 0.5

/** Bed linen styles, by bedroom size rank: '' terracotta throw over the foot, '_b' sage throw on one corner, '_c' no throw. */
export const BED_STYLES = ['', '_b', '_c'] as const

/**
 * Dog-leg stair (common core): two flights side by side with a 0.1 m well, 8 treads of 0.25 m each (2.0 m run), a
 * 1.1 m half landing at the back (−z) at half the rise; you step on at the front (+z). Widths: presets pick the widest
 * that fits the room. Rise = floor to ceiling (3.0 m, both demo units); the upper flight runs up into the ceiling.
 */
export const STAIR_W = [3.6, 3.2, 2.8, 2.4]
export const STAIR_RISE = 3.0
export const STAIR_D = 3.1
export const stairId = (w: number) => `stair_${Math.round(w * 10)}`

/**
 * Planter bed: one piece filling a planter strip, sized per room like the stair by width, except that the whole shape is
 * in its id: `planter_bed@` + one `x,y,h,t` per vertex of the room's inner polygon (cm, relative to the polygon's bbox
 * centre = the placement's x, y at rotation 0), where h, t are the height and thickness of the parapet along the edge
 * from that vertex if plants trail over it (an outer edge), else 0. Kerb top at PLANTER_KERB (the curbs' height).
 */
export const PLANTER = 'planter_bed@'
export const PLANTER_KERB = 0.45
export const PLANTER_TOP = 1.15
export type PlanterEdge = { h: number; t: number }
const cm = (v: number) => Math.round(v * 100)

export function planterId(poly: Pt[], edges: PlanterEdge[]): { id: string; c: Pt } {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
  return { id: PLANTER + poly.map((p, i) => [cm(p.x - c.x), cm(p.y - c.y), cm(edges[i].h), cm(edges[i].t)].join(',')).join(';'), c }
}

export function parsePlanter(id: string): { poly: Pt[]; edges: PlanterEdge[] } | null {
  if (!id.startsWith(PLANTER)) return null
  const v = id.slice(PLANTER.length).split(';').map((s) => s.split(',').map((n) => Number(n) / 100))
  return { poly: v.map(([x, y]) => ({ x, y })), edges: v.map(([, , h, t]) => ({ h, t })) }
}

/**
 * kit entry for a planter id. ponytail: category 'rug' so the engine treats it as floor-level (no contact shadow, never a
 * view blocker: an L-shaped strip's bbox covers the verandas it wraps); give it its own category once context.ts,
 * frame.ts and spawn.ts learn one.
 */
export function planterAsset(id: string): KitAsset | undefined {
  const s = parsePlanter(id)
  if (!s) return undefined
  const ext = (k: 'x' | 'y') => Math.max(...s.poly.map((p) => p[k])) - Math.min(...s.poly.map((p) => p[k]))
  return { ...P(id, 'Planter bed, trailing plants', 'rug', ext('x'), PLANTER_TOP, ext('y')), kind: 'plant' }
}

/** Doors the wardrobe builder hangs across W: one per ≤ 0.6 m (procedural.ts wardrobe). */
export const wardrobeDoors = (W: number): number => Math.max(1, Math.ceil(W / 0.6 - 1e-3))
/** Chairs a W-long dining table seats: one per 0.6 m along each long side, one at each head from 1.4 m (0.9 m = 2, 1.6 m = 6, 2.6 m = 10). */
export const tableSeats = (W: number): number => 2 * Math.max(1, Math.floor(W / 0.6 + 1e-6)) + (W >= 1.4 ? 2 : 0)

// ───────────────────────────── greenery + common levels (session 19) ─────────────────────────────

type V3 = [number, number, number]
/**
 * Poly Haven CC0 plant scans the greenery is built from (public/assets/models, MANIFEST.md): the file, the variant's
 * nodes (laid out side by side in the file; their root is the node origin) and its extent there (m, glTF axes, root at
 * 0). `alpha`: the leaf-card mask the 1k glTF's JPG base colour cannot carry (MASK materials; procedural.ts adds it).
 */
const SCAN_FILE = {
  money: { url: '/assets/models/pachira_aquatica_01/pachira_aquatica_01_1k.gltf' },
  calathea: { url: '/assets/models/calathea_orbifolia_01/calathea_orbifolia_01_1k.gltf', alpha: '/assets/models/calathea_orbifolia_01/textures/calathea_orbifolia_01_alpha_1k.png' },
  anthurium: { url: '/assets/models/anthurium_botany_01/anthurium_botany_01_1k.gltf', alpha: '/assets/models/anthurium_botany_01/textures/anthurium_botany_01_alpha_1k.png' },
  fern: { url: '/assets/models/fern_02/fern_02_1k.gltf', alpha: '/assets/models/fern_02/textures/fern_02_alpha_1k.png' },
}
export interface Scan {
  url: string
  alpha?: string
  nodes: string[]
  min: V3
  max: V3
}
const scan = (f: keyof typeof SCAN_FILE, nodes: string[], min: V3, max: V3): Scan => ({ ...SCAN_FILE[f], nodes, min, max })
export const SCANS = {
  money_c: scan('money', ['pachira_aquatica_01_bark_c', 'pachira_aquatica_01_leaves_c'], [-0.36, 0, -0.56], [0.62, 1.15, 0.37]),
  money_d: scan('money', ['pachira_aquatica_01_bark_d', 'pachira_aquatica_01_leaves_d'], [-0.49, 0, -0.59], [0.56, 1.89, 0.41]),
  calathea_a: scan('calathea', ['calathea_orbifolia_01_a'], [-0.29, 0, -0.32], [0.31, 0.42, 0.21]),
  calathea_b: scan('calathea', ['calathea_orbifolia_01_b'], [-0.18, 0, -0.2], [0.17, 0.3, 0.24]),
  anthurium_b: scan('anthurium', ['anthurium_botany_01_b'], [-0.38, 0, -0.3], [0.38, 0.46, 0.27]),
  anthurium_c: scan('anthurium', ['anthurium_botany_01_c'], [-0.22, 0, -0.34], [0.38, 0.35, 0.32]),
  fern_b: scan('fern', ['fern_02_b'], [-0.53, 0, -0.42], [0.46, 0.4, 0.47]),
  fern_c: scan('fern', ['fern_02_c'], [-0.43, 0, -0.42], [0.44, 0.32, 0.35]),
} satisfies Record<string, Scan>
export type ScanId = keyof typeof SCANS

/** A pot (fibre-cement or terracotta, code-built) and the scan growing in it, its root on the soil 4 cm under the rim. */
export interface Potted {
  plant: ScanId
  pot: 'tall' | 'bowl' | 'clay'
  /** pot rim diameter and height, m */
  d: number
  h: number
}
export const POTTED: Record<string, Potted> = {
  pot_money_tree: { plant: 'money_c', pot: 'tall', d: 0.44, h: 0.48 },
  pot_money_tree_tall: { plant: 'money_d', pot: 'tall', d: 0.5, h: 0.55 },
  pot_calathea: { plant: 'calathea_a', pot: 'bowl', d: 0.5, h: 0.32 },
  pot_anthurium: { plant: 'anthurium_b', pot: 'clay', d: 0.38, h: 0.38 },
  pot_fern: { plant: 'fern_b', pot: 'bowl', d: 0.46, h: 0.36 },
}
/** Plan size and height of a potted piece: the pot and the plant's extent over it (the plant's root at the pot's centre). */
function pottedSize({ plant, d, h }: Potted): { x: number; y: number; z: number } {
  const s = SCANS[plant]
  const ext = (k: 0 | 2) => Math.max(d / 2, s.max[k]) - Math.min(-d / 2, s.min[k])
  return { x: ext(0), y: h - 0.04 + s.max[1], z: ext(2) }
}

/** Planter box (code-built, rebuilds at its length): a fibre-cement trough PLANTER_BOX_H tall, PLANTER_BOX_D deep, scans along it. */
export const PLANTER_BOX_H = 0.5
export const PLANTER_BOX_D = 0.45
export const PLANTER_BOXES = { planter_box_90: 0.9, planter_box_150: 1.5, planter_box_240: 2.4 }
/** The plants down a planter box, in order (every ~0.45 m). */
export const BOX_PLANTS: ScanId[] = ['anthurium_b', 'calathea_a', 'fern_c', 'anthurium_c', 'calathea_b', 'fern_b']

/**
 * Trees (code-built: bark and compound leaves of Poly Haven's jacaranda_tree, CC0): `crown` across, `h` tall, first fork
 * at `fork`, trunk radius `r` at chest height; `seed` shapes the limbs. Category 'rug' like the planter bed: the engine
 * gives them no contact shadow (the sun casts their real one) and pieces may stand under the crown; presets keep their
 * trunks (TRUNK_CLEAR square) clear.
 */
export const TREES = {
  tree_small: { label: 'Small tree, compound leaves (3.5 m)', crown: 3.2, h: 3.6, fork: 1.6, r: 0.07, seed: 3 },
  tree_medium: { label: 'Shade tree (6 m)', crown: 5.6, h: 6, fork: 2.2, r: 0.13, seed: 7 },
  tree_large: { label: 'Big shade tree (9 m)', crown: 8.6, h: 8.5, fork: 2.6, r: 0.2, seed: 11 },
}
export type TreeId = keyof typeof TREES
export const TRUNK_CLEAR = 1.0

/** Shrubs (code-built mounds of Poly Haven island_tree_02's leaves, CC0): diameter and height. */
export const SHRUBS = { shrub_round: { d: 0.9, h: 0.8, label: 'Shrub, clipped (0.9 m)' }, shrub_large: { d: 1.5, h: 1.25, label: 'Shrub, large (1.5 m)' } }

/** Pergola posts: square section, inset from the footprint's corners (presets keep them clear). */
export const PERGOLA_POST = 0.12

/** Top of modern_wooden_cabinet (the TV unit), where tv_55's stand sits. */
export const TV_UNIT_TOP = 0.68
/** Worktop height; upper cabinets and the hood start here (splashback) and their boxes at 1.45. */
export const WORKTOP = 0.9

export const PROCEDURAL: Record<string, KitAsset> = {
  ...Object.fromEntries(
    BED_STYLES.flatMap((st) => [
      [`bed_queen${st}`, P(`bed_queen${st}`, 'Queen bed, upholstered', 'bed', 1.76, 1.15, 2.16)],
      [`bed_single${st}`, P(`bed_single${st}`, 'Single bed, upholstered', 'bed', 1.16, 1.15, 2.16)],
    ]),
  ),
  bedside_oak: P('bedside_oak', 'Bedside table, oak, one drawer', 'bedside', 0.5, 0.52, 0.4),
  // sits on sofa_3seat's seat cushions like throw_pillows_01
  cushions_plain: { ...P('cushions_plain', 'Two plain linen cushions', 'other', 0.78, 0.42, 0.26, 0.44), kind: 'cushions' },
  sofa_3seat: P('sofa_3seat', '3-seat fabric sofa', 'sofa', 2.2, 0.82, 0.92),
  sofa_2seat: P('sofa_2seat', '2-seat fabric sofa', 'sofa', 1.6, 0.82, 0.92), // a narrow living room (presets.ts)
  dining_table: P('dining_table', 'Dining table, oak, 6 seats', 'dining-table', 1.6, 0.75, 0.9),
  dining_chair: P('dining_chair', 'Upholstered dining chair', 'dining-chair', 0.47, 0.84, 0.54),
  desk_oak: P('desk_oak', 'Oak desk, steel legs', 'desk', 1.4, 0.75, 0.7),
  tv_55: { ...P('tv_55', '55" TV on stand', 'other', 1.23, 0.78, 0.24, TV_UNIT_TOP), kind: 'tv' },
  tv_55_wall: { ...P('tv_55_wall', '55" TV, wall-mounted', 'other', 1.23, 0.71, 0.06, 0.95), kind: 'tv' },
  rug_rect_large: P('rug_rect_large', 'Wool rug 3.0 × 2.0 m', 'rug', 3.0, 0.012, 2.0),
  rug_rect_small: P('rug_rect_small', 'Wool rug 2.3 × 1.6 m', 'rug', 2.3, 0.012, 1.6),
  rug_round: P('rug_round', 'Round wool rug Ø2.0 m', 'rug', 2.0, 0.012, 2.0),
  kitchen_counter: P('kitchen_counter', 'Kitchen base cabinet (0.6 m)', 'kitchen', 0.6, 0.9, 0.62),
  kitchen_counter_styled: P('kitchen_counter_styled', 'Base cabinet + kettle, board, fruit bowl', 'kitchen', 0.6, 1.28, 0.62),
  kitchen_tall: P('kitchen_tall', 'Tall larder unit, oak (0.6 m)', 'kitchen', 0.6, 2.15, 0.62),
  kitchen_sink: { ...P('kitchen_sink', 'Kitchen sink cabinet (0.6 m)', 'kitchen', 0.6, 1.2, 0.62), kind: 'sink' },
  kitchen_hob: { ...P('kitchen_hob', 'Hob + oven cabinet (0.6 m)', 'kitchen', 0.6, 0.91, 0.62), kind: 'hob' },
  kitchen_upper: P('kitchen_upper', 'Wall cabinet + splashback (0.6 m)', 'kitchen', 0.6, 1.25, 0.35, WORKTOP),
  kitchen_hood: { ...P('kitchen_hood', 'Chimney hood + splashback (0.6 m)', 'kitchen', 0.6, 2.1, 0.5, WORKTOP), kind: 'hood' }, // duct cover up to 3.0 m
  fridge: { ...P('fridge', 'Fridge (brushed steel)', 'kitchen', 0.7, 1.8, 0.7), kind: 'fridge' },
  toilet: { ...P('toilet', 'Wall-hung toilet', 'bath', 0.37, 0.93, 0.54, 0.2), kind: 'toilet' }, // bowl 0.2–0.45, flush plate to 1.13
  vanity: { ...P('vanity', 'Vanity, vessel basin + mirror', 'bath', 0.8, 1.5, 0.5, 0.45), kind: 'vanity' }, // cabinet 0.45, mirror top 1.95
  basin: { ...P('basin', 'Pedestal basin', 'bath', 0.5, 0.97, 0.45), kind: 'basin' }, // rim 0.85, tap spout 0.97
  shower_screen: { ...P('shower_screen', 'Shower tray, glass screen, rain head', 'bath', 0.9, 2.05, 0.9), kind: 'shower' },
  // flush ceiling lights by room size (presets.ts); a split AC 2.3 m up ('ceiling': overhead, casts no sun shadow)
  ceiling_light: { ...P('ceiling_light', 'Flush ceiling light, opal diffuser Ø38 cm', 'lamp', 0.38, 0.085, 0.38), mount: 'ceiling' },
  ceiling_light_large: { ...P('ceiling_light_large', 'Flush ceiling light, opal diffuser Ø50 cm', 'lamp', 0.5, 0.09, 0.5), mount: 'ceiling' },
  ac_split: { ...P('ac_split', 'Split AC, wall-mounted indoor unit', 'other', 0.9, 0.3, 0.22, 2.3), mount: 'ceiling', kind: 'ac' },
  wardrobe_tall: P('wardrobe_tall', 'Tall wardrobe (oak, 3 doors)', 'wardrobe', 1.8, 2.2, 0.6),
  wardrobe_2door: P('wardrobe_2door', 'Wardrobe (oak, 2 doors)', 'wardrobe', 1.2, 2.2, 0.6),
  closet_rail: P('closet_rail', 'Open closet unit: rail, shelf, clothes (1.8 m)', 'wardrobe', 1.8, 2.1, 0.55),
  closet_rail_s: P('closet_rail_s', 'Open closet unit: rail, shelf, clothes (1.2 m)', 'wardrobe', 1.2, 2.1, 0.55),
  // help room: a cot and a hook rail (a folded gamchha on it), nothing else
  cot: P('cot', 'Single cot, cotton mattress', 'bed', 1.9, 0.58, 0.7), // long side is its front: it stands along a wall
  cot_s: P('cot_s', 'Short single cot, cotton mattress', 'bed', 1.7, 0.58, 0.65), // a help room under 1.9 m long
  hook_rail: { ...P('hook_rail', 'Hook rail with a towel', 'other', 0.6, 0.55, 0.09, 1.2), kind: 'decor' },
  ...Object.fromEntries(STAIR_W.map((w) => [stairId(w), { ...P(stairId(w), `Dog-leg stair, ${((w - 0.1) / 2).toFixed(2)} m flights`, 'other', w, STAIR_RISE, STAIR_D), kind: 'stair' as const }])),
  // greenery: potted scans, planter boxes, shrubs, trees (the library's Greenery tab)
  ...Object.fromEntries(
    Object.entries({
      pot_money_tree: 'Money tree, fibre-cement pot (1.6 m)',
      pot_money_tree_tall: 'Money tree, tall, fibre-cement pot (2.4 m)',
      pot_calathea: 'Calathea, low bowl planter',
      pot_anthurium: 'Anthurium, terracotta pot',
      pot_fern: 'Fern, low bowl planter',
    }).map(([id, label]) => {
      const s = pottedSize(POTTED[id])
      return [id, P(id, label, 'plant', s.x, s.y, s.z)]
    }),
  ),
  ...Object.fromEntries(Object.entries(PLANTER_BOXES).map(([id, L]) => [id, { ...P(id, `Planter box with plants (${L.toFixed(1)} m)`, 'other', L, 0.95, 0.5), kind: 'plant' as const }])),
  ...Object.fromEntries(Object.entries(SHRUBS).map(([id, s]) => [id, P(id, s.label, 'plant', s.d, s.h, s.d)])),
  ...Object.fromEntries(Object.entries(TREES).map(([id, t]) => [id, { ...P(id, t.label, 'rug', t.crown, t.h, t.crown), kind: 'plant' as const }])),
  // outdoor (decks, roofs, lawns, play areas) and common rooms (lobby, gym, guard room)
  lounger: { ...P('lounger', 'Sun lounger, teak', 'chair', 0.7, 0.88, 2.0), kind: 'lounger' }, // backrest at the back (−z): you face +z
  bench_timber: { ...P('bench_timber', 'Timber bench, backless (1.5 m)', 'chair', 1.5, 0.45, 0.4), kind: 'bench' },
  pergola: { ...P('pergola', 'Timber pergola 3 × 3 m', 'rug', 3.0, 2.6, 3.0), kind: 'pergola' }, // walk-under: no contact shadow, pieces stand under it
  reception_desk: { ...P('reception_desk', 'Reception desk, oak + stone (2.4 m)', 'other', 2.4, 1.1, 0.8), kind: 'reception-desk' }, // visitors' side +z
  treadmill: { ...P('treadmill', 'Treadmill', 'other', 0.85, 1.45, 1.9), kind: 'gym' }, // console at the back (−z): you step on at +z
  gym_rack: { ...P('gym_rack', 'Squat rack, bench + barbell', 'other', 2.2, 2.2, 1.4), kind: 'gym' }, // open side +z
  dumbbell_rack: { ...P('dumbbell_rack', 'Dumbbell rack + dumbbells', 'other', 1.4, 0.85, 0.55), kind: 'gym' },
  gym_mat: { ...P('gym_mat', 'Exercise mat 1.8 × 0.6 m', 'rug', 0.6, 0.012, 1.8), kind: 'gym' },
  mirror_panel: { ...P('mirror_panel', 'Wall mirror 2.0 × 1.8 m', 'other', 2.0, 1.8, 0.03), mount: 'wall', kind: 'mirror' }, // 0.6–2.4 m
  swing_frame: { ...P('swing_frame', 'Swing set, 2 seats (steel + rubber)', 'chair', 3.4, 2.3, 1.9), kind: 'play' },
  slide: { ...P('slide', 'Slide tower, stainless chute', 'chair', 1.0, 2.2, 3.6), kind: 'play' }, // ladder at −z, chute down to +z
  seesaw: { ...P('seesaw', 'Seesaw, timber + steel', 'chair', 0.5, 0.89, 3.0), kind: 'play' },
  ...Object.fromEntries(
    ART_SETS.flatMap((s) =>
      (['l', 'r'] as const).map((k) => [
        `${s}_${k}`,
        { ...P(`${s}_${k}`, `Framed print, ${ART_LABEL[s]} (${k === 'l' ? 'left' : 'right'})`, 'other', ART_W, ART_H, 0.03, 1.25), kind: 'art' as const },
      ]),
    ),
  ),
}
