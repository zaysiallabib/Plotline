/**
 * Metadata for procedurally built assets (no three import — presets.ts and
 * Vitest read this). Builders live in procedural.ts; url 'procedural:<id>'
 * tells src/three/furniture.ts to call buildProcedural(id) instead of GLTFLoader.
 * All fronts face +z: a bed's foot, a counter's doors, a toilet's seat.
 */
import type { KitAsset } from './kit'

const P = (id: string, label: string, category: KitAsset['category'], x: number, y: number, z: number): KitAsset => ({
  id,
  label,
  category,
  url: `procedural:${id}`,
  sizeM: { x, y, z },
  frontAxis: '+z',
  source: 'procedural',
  author: 'Plotline',
  license: 'CC0',
})

export const PROCEDURAL: Record<string, KitAsset> = {
  bed_queen: P('bed_queen', 'Queen bed (oak platform)', 'bed', 1.7, 1.0, 2.1),
  bed_single: P('bed_single', 'Single bed (oak platform)', 'bed', 1.1, 1.0, 2.1),
  kitchen_counter: P('kitchen_counter', 'Kitchen counter module (1 m)', 'kitchen', 1.0, 0.9, 0.62),
  fridge: P('fridge', 'Fridge (brushed steel)', 'kitchen', 0.7, 1.8, 0.7),
  toilet: P('toilet', 'Toilet (white ceramic)', 'bath', 0.4, 0.75, 0.7),
  basin: P('basin', 'Pedestal basin', 'bath', 0.5, 0.97, 0.45), // rim 0.85, tap spout 0.97
  wardrobe_tall: P('wardrobe_tall', 'Tall wardrobe (oak, 2 doors)', 'wardrobe', 1.8, 2.2, 0.6),
}
