/**
 * Poly Haven + ambientCG (all CC0) — see public/assets/MANIFEST.md. 1k jpg maps.
 * repeatM = real-world size of ONE texture repeat (Poly Haven "dimensions"[0] mm / 1000;
 * ambientCG sets are sized from what they depict, e.g. 8 tiles across → 8 × 0.6 m).
 */
import type { TextureSet } from './textures'

const ACG = (id: string, label: string, asset: string, repeatM: number, maps: { ao?: boolean; normal?: boolean } = {}): TextureSet => ({
  id,
  label,
  albedo: `/assets/textures/${id}/albedo.jpg`,
  ...(maps.normal !== false ? { normal: `/assets/textures/${id}/normal.jpg` } : {}),
  roughness: `/assets/textures/${id}/roughness.jpg`,
  ...(maps.ao ? { ao: `/assets/textures/${id}/ao.jpg` } : {}),
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
  // white polished marble, grey veining, seamless slab. No normal map: polished stone has no relief,
  // and at this gloss the map's pitting mirrored the HDRI as a crumpled-foil look.
  marble_floor_white: ACG('marble_floor_white', 'White marble', 'Marble001', 2.0, { normal: false }),
  // glossy white porcelain, thin grey grout; the map is 8 × 8 tiles → 600 × 600 mm tiles
  // tint: the map averages 0.94 linear (84 % of texels ≥ 250); glazed white tile is ≈ 0.8 and blew out to white in baths
  tile_floor_ceramic: { ...ACG('tile_floor_ceramic', 'White porcelain floor tiles 600 × 600', 'Tiles105', 4.8, { ao: true }), tint: '#ebebeb' },
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
    // no ao: the stucco scan's pits multiplied the fill (≈ 75 % of a wall's light) into dark speckle up close; painted putty has none
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
    repeatM: 1.27,
    tint: '#efefef', // the map averages 0.90 linear; glazed white tile ≈ 0.8
    source: "https://polyhaven.com/a/long_white_tiles",
    author: "Jenelle van Heerden, Sergej Majboroda",
    license: 'CC0',
  },
}
