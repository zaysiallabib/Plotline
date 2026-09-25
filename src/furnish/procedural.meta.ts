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
 * Framed prints, hung as diptychs (`<set>_l` left, `<set>_r` right as you face them): crops of Poly Haven
 * tonemapped HDRIs (CC0), public/assets/art/<id>.jpg. Bottom at 1.25 m clears a headboard / sofa back.
 */
export const ART_SETS = ['art_sea', 'art_dawn'] as const
export const ART = ART_SETS.flatMap((s) => [`${s}_l`, `${s}_r`])
const ART_LABEL: Record<(typeof ART_SETS)[number], string> = { art_sea: 'sea at sunrise', art_dawn: 'mountains at dawn' }

/** Top of modern_wooden_cabinet (the TV unit), where tv_55's stand sits. */
export const TV_UNIT_TOP = 0.68
/** Worktop height; upper cabinets and the hood start here (splashback) and their boxes at 1.45. */
export const WORKTOP = 0.9

export const PROCEDURAL: Record<string, KitAsset> = {
  bed_queen: P('bed_queen', 'Queen bed, upholstered', 'bed', 1.76, 1.15, 2.16),
  bed_single: P('bed_single', 'Single bed, upholstered', 'bed', 1.16, 1.15, 2.16),
  sofa_3seat: P('sofa_3seat', '3-seat fabric sofa', 'sofa', 2.2, 0.82, 0.92),
  dining_table: P('dining_table', 'Dining table, oak, 6 seats', 'dining-table', 1.6, 0.75, 0.9),
  dining_chair: P('dining_chair', 'Upholstered dining chair', 'dining-chair', 0.47, 0.84, 0.54),
  desk_oak: P('desk_oak', 'Oak desk, steel legs', 'desk', 1.4, 0.75, 0.7),
  tv_55: P('tv_55', '55" TV on stand', 'other', 1.23, 0.78, 0.24, TV_UNIT_TOP),
  tv_55_wall: P('tv_55_wall', '55" TV, wall-mounted', 'other', 1.23, 0.71, 0.06, 0.95),
  rug_rect_large: P('rug_rect_large', 'Wool rug 3.0 × 2.0 m', 'rug', 3.0, 0.012, 2.0),
  rug_rect_small: P('rug_rect_small', 'Wool rug 2.3 × 1.6 m', 'rug', 2.3, 0.012, 1.6),
  rug_round: P('rug_round', 'Round wool rug Ø2.0 m', 'rug', 2.0, 0.012, 2.0),
  kitchen_counter: P('kitchen_counter', 'Kitchen base cabinet (0.6 m)', 'kitchen', 0.6, 0.9, 0.62),
  kitchen_sink: P('kitchen_sink', 'Kitchen sink cabinet (0.6 m)', 'kitchen', 0.6, 1.2, 0.62),
  kitchen_hob: P('kitchen_hob', 'Hob + oven cabinet (0.6 m)', 'kitchen', 0.6, 0.91, 0.62),
  kitchen_upper: P('kitchen_upper', 'Wall cabinet + splashback (0.6 m)', 'kitchen', 0.6, 1.25, 0.35, WORKTOP),
  kitchen_hood: P('kitchen_hood', 'Chimney hood + splashback (0.6 m)', 'kitchen', 0.6, 1.25, 0.5, WORKTOP),
  fridge: P('fridge', 'Fridge (brushed steel)', 'kitchen', 0.7, 1.8, 0.7),
  toilet: P('toilet', 'Wall-hung toilet', 'bath', 0.37, 0.93, 0.54, 0.2), // bowl 0.2–0.45, flush plate to 1.13
  vanity: P('vanity', 'Vanity, vessel basin + mirror', 'bath', 0.8, 1.5, 0.5, 0.45), // cabinet 0.45, mirror top 1.95
  basin: P('basin', 'Pedestal basin', 'bath', 0.5, 0.97, 0.45), // rim 0.85, tap spout 0.97
  shower_screen: P('shower_screen', 'Shower tray, glass screen, rain head', 'bath', 0.9, 2.05, 0.9),
  wardrobe_tall: P('wardrobe_tall', 'Tall wardrobe (oak, 3 doors)', 'wardrobe', 1.8, 2.2, 0.6),
  ...Object.fromEntries(
    ART_SETS.flatMap((s) =>
      (['l', 'r'] as const).map((k) => [`${s}_${k}`, P(`${s}_${k}`, `Framed print, ${ART_LABEL[s]} (${k === 'l' ? 'left' : 'right'})`, 'other', 0.5, 0.7, 0.03, 1.25)]),
    ),
  ),
}
