/**
 * Poly Haven + ambientCG (all CC0) — see public/assets/MANIFEST.md. 1k jpg maps.
 * repeatM = real-world size of ONE texture repeat (Poly Haven "dimensions"[0] mm / 1000;
 * ambientCG sets are sized from what they depict, e.g. 8 tiles across → 8 × 0.6 m).
 */
import type { TextureSet } from './textures'

const ACG = (id: string, label: string, asset: string, repeatM: number, ao = false): TextureSet => ({
  id,
  label,
  albedo: `/assets/textures/${id}/albedo.jpg`,
  normal: `/assets/textures/${id}/normal.jpg`,
  roughness: `/assets/textures/${id}/roughness.jpg`,
  ...(ao ? { ao: `/assets/textures/${id}/ao.jpg` } : {}),
  repeatM,
  source: `https://ambientcg.com/view?id=${asset}`,
  author: 'ambientCG (Lennart Demes)',
  license: 'CC0',
})

export const TEXTURES: Record<string, TextureSet> = {
  wood_floor_oak: {
    id: "wood_floor_oak",
    label: "Oak plank floor",
    albedo: "/assets/textures/wood_floor_oak/albedo.jpg",
    normal: "/assets/textures/wood_floor_oak/normal.jpg",
    roughness: "/assets/textures/wood_floor_oak/roughness.jpg",
    ao: "/assets/textures/wood_floor_oak/ao.jpg",
    repeatM: 2.08,
    source: "https://polyhaven.com/a/laminate_floor_03",
    author: "Dario Barresi, Charlotte Baglioni",
    license: 'CC0',
  },
  // white polished marble, grey veining, seamless slab (no joints)
  marble_floor_white: ACG('marble_floor_white', 'White marble', 'Marble001', 2.0),
  // glossy white porcelain, thin grey grout; the map is 8 × 8 tiles → 600 × 600 mm tiles
  tile_floor_ceramic: ACG('tile_floor_ceramic', 'White porcelain floor tiles 600 × 600', 'Tiles105', 4.8, true),
  fabric_curtain: ACG('fabric_curtain', 'Light linen weave', 'Fabric036', 0.3),
  fabric_upholstery: ACG('fabric_upholstery', 'Woven upholstery fabric', 'Fabric062', 0.4),
  rug_wool: ACG('rug_wool', 'Wool loop-pile rug', 'Carpet014', 0.4),
  wood_veneer_light: ACG('wood_veneer_light', 'Light oak veneer', 'Wood095', 1.2),
  // metalness is not in TextureSet: a MaterialRef user gets a non-metal; procedural.ts sets metalness 1
  metal_brushed: ACG('metal_brushed', 'Brushed steel', 'Metal009', 0.5),
  tile_floor_outdoor: {
    id: "tile_floor_outdoor",
    label: "Grey outdoor paving tiles",
    albedo: "/assets/textures/tile_floor_outdoor/albedo.jpg",
    normal: "/assets/textures/tile_floor_outdoor/normal.jpg",
    roughness: "/assets/textures/tile_floor_outdoor/roughness.jpg",
    ao: "/assets/textures/tile_floor_outdoor/ao.jpg",
    repeatM: 2.2,
    source: "https://polyhaven.com/a/grey_tiles",
    author: "Amal Kumar",
    license: 'CC0',
  },
  plaster_white: {
    id: "plaster_white",
    label: "White plaster wall",
    albedo: "/assets/textures/plaster_white/albedo.jpg",
    normal: "/assets/textures/plaster_white/normal.jpg",
    roughness: "/assets/textures/plaster_white/roughness.jpg",
    ao: "/assets/textures/plaster_white/ao.jpg",
    repeatM: 1.998,
    source: "https://polyhaven.com/a/white_stucco",
    author: "Amal Kumar",
    license: 'CC0',
  },
  tile_wall_white: {
    id: "tile_wall_white",
    label: "White wall tiles",
    albedo: "/assets/textures/tile_wall_white/albedo.jpg",
    normal: "/assets/textures/tile_wall_white/normal.jpg",
    roughness: "/assets/textures/tile_wall_white/roughness.jpg",
    ao: "/assets/textures/tile_wall_white/ao.jpg",
    repeatM: 1.27,
    source: "https://polyhaven.com/a/long_white_tiles",
    author: "Jenelle van Heerden, Sergej Majboroda",
    license: 'CC0',
  },
}
