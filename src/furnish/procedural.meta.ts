/**
 * Metadata for procedurally built assets (no three import — presets.ts and
 * Vitest read this). Builders live in procedural.ts; url 'procedural:<id>'
 * tells src/three/furniture.ts to call buildProcedural(id) instead of GLTFLoader.
 * All fronts face +z: a bed's foot, a counter's doors, a toilet's seat.
 * Wall-hung pieces (toilet bowl, vanity, upper cabinets) are built from their
 * lowest point at y = 0 and lifted by mountY.
 */
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
 * them): crops of Poly Haven tonemapped HDRIs (CC0), public/assets/art/<id>.jpg. Bottom at 1.25 m clears a
 * headboard / sofa back.
 */
export const ART_SETS = ['art_sea', 'art_dawn'] as const
export const ART = ART_SETS.flatMap((s) => [`${s}_l`, `${s}_r`])
const ART_LABEL: Record<(typeof ART_SETS)[number], string> = { art_sea: 'sea at sunrise', art_dawn: 'mountains at dawn' }
export const ART_W = 0.36
export const ART_H = 0.5

/** Bed linen styles, by bedroom size rank: '' terracotta throw over the foot, '_b' sage throw on one corner, '_c' no throw. */
export const BED_STYLES = ['', '_b', '_c'] as const

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
  kitchen_hood: { ...P('kitchen_hood', 'Chimney hood + splashback (0.6 m)', 'kitchen', 0.6, 1.25, 0.5, WORKTOP), kind: 'hood' },
  fridge: { ...P('fridge', 'Fridge (brushed steel)', 'kitchen', 0.7, 1.8, 0.7), kind: 'fridge' },
  toilet: { ...P('toilet', 'Wall-hung toilet', 'bath', 0.37, 0.93, 0.54, 0.2), kind: 'toilet' }, // bowl 0.2–0.45, flush plate to 1.13
  vanity: { ...P('vanity', 'Vanity, vessel basin + mirror', 'bath', 0.8, 1.5, 0.5, 0.45), kind: 'vanity' }, // cabinet 0.45, mirror top 1.95
  basin: { ...P('basin', 'Pedestal basin', 'bath', 0.5, 0.97, 0.45), kind: 'basin' }, // rim 0.85, tap spout 0.97
  shower_screen: { ...P('shower_screen', 'Shower tray, glass screen, rain head', 'bath', 0.9, 2.05, 0.9), kind: 'shower' },
  // flush ceiling lights by room size (presets.ts); a split AC whose top hangs 0.2 m under the ceiling
  ceiling_light: { ...P('ceiling_light', 'Flush ceiling light, opal diffuser Ø38 cm', 'lamp', 0.38, 0.085, 0.38), mount: 'ceiling' },
  ceiling_light_large: { ...P('ceiling_light_large', 'Flush ceiling light, opal diffuser Ø50 cm', 'lamp', 0.5, 0.09, 0.5), mount: 'ceiling' },
  ac_split: { ...P('ac_split', 'Split AC, wall-mounted indoor unit', 'other', 0.9, 0.3, 0.22), mount: 'ceiling', dropM: 0.2, kind: 'ac' },
  wardrobe_tall: P('wardrobe_tall', 'Tall wardrobe (oak, 3 doors)', 'wardrobe', 1.8, 2.2, 0.6),
  ...Object.fromEntries(
    ART_SETS.flatMap((s) =>
      (['l', 'r'] as const).map((k) => [
        `${s}_${k}`,
        { ...P(`${s}_${k}`, `Framed print, ${ART_LABEL[s]} (${k === 'l' ? 'left' : 'right'})`, 'other', ART_W, ART_H, 0.03, 1.25), kind: 'art' as const },
      ]),
    ),
  ),
}
