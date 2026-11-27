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

/** A Poly Haven set fetched as its 1k jpgs (Diffuse → albedo, nor_gl → normal, Rough → roughness, AO → ao); repeatM = its dimensions. */
const PH = (id: string, label: string, asset: string, repeatM: number, author: string): TextureSet => ({
  id,
  label,
  albedo: `/assets/textures/${id}/albedo.jpg`,
  normal: `/assets/textures/${id}/normal.jpg`,
  roughness: `/assets/textures/${id}/roughness.jpg`,
  ao: `/assets/textures/${id}/ao.jpg`,
  repeatM,
  source: `https://polyhaven.com/a/${asset}`,
  author,
  license: 'CC0',
})

/**
 * An outside set (session 31 facade): colour, relief and roughness 1k jpgs re-encoded small (albedo q80, normal q82, roughness
 * q70; no ambient-occlusion picture — a facade is seen from the street, the sky's light does that), `repeatM` its source's
 * real size; `from`: its source page (Poly Haven, ambientCG; a generated set names the scan it was drawn over).
 */
const OUT = (id: string, label: string, from: string, repeatM: number, author: string): TextureSet => ({
  id,
  label,
  albedo: `/assets/textures/${id}/albedo.jpg`,
  normal: `/assets/textures/${id}/normal.jpg`,
  roughness: `/assets/textures/${id}/roughness.jpg`,
  repeatM,
  source: from,
  author,
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
  // tint: the map averages 0.72 linear; at 15:30 a sun patch (≈ 1.77 × albedo + the window-zone fill) mapped to sRGB ≥ 250 and the veining
  // vanished (Neutral compresses 25 : 1 there). × #ebebeb (0.83) = 0.6, level with the warm-white paint (0.59); #e6e6e6 (0.57) read grey in shade (sRGB 145–170).
  marble_floor_white: { ...ACG('marble_floor_white', 'White marble', 'Marble001', 2.0, { normal: false }), tint: '#ebebeb' },
  // glossy white porcelain, thin grey grout; the map is 8 × 8 tiles → 600 × 600 mm tiles
  // tint: the map averages 0.93 linear (84 % of texels ≥ 250); × #d7d7d7 = 0.63, just above the warm-white paint (0.59).
  // At #ebebeb (0.77) a white bath was one near-white sheet at 15:30 (tile walls sRGB 231, painted walls 212).
  tile_floor_ceramic: { ...ACG('tile_floor_ceramic', 'White porcelain floor tiles 600 × 600', 'Tiles105', 4.8, { ao: true }), tint: '#d7d7d7' },
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
    tint: '#dbdbdb', // the map averages 0.91 linear; × this = 0.65, a hair above the paint (0.59) + the glaze; #efefef (0.79) blew baths white
    source: "https://polyhaven.com/a/long_white_tiles",
    author: "Jenelle van Heerden, Sergej Majboroda",
    license: 'CC0',
  },
  // dark walnut strip boards, 8 rows per map → ~175 mm boards; albedo re-encoded ×1.4 (the scan averages sRGB 65, oiled walnut ≈ 90)
  wood_floor_walnut: ACG('wood_floor_walnut', 'Dark walnut plank floor', 'WoodFloor008', 1.4),
  // grey veined marble-look wall tile: Marble012 albedo over tile_wall_white's grout relief + glaze (its 2 × 4 tiles per 1.27 m → 635 × 318 mm);
  // tint: the scan is bluish (sRGB 172,173,182), this lands it on a neutral light grey
  tile_wall_marble_grey: {
    ...ACG('tile_wall_marble_grey', 'Grey marble-look wall tiles', 'Marble012', 1.27),
    normal: '/assets/textures/tile_wall_white/normal.jpg',
    roughness: '/assets/textures/tile_wall_white/roughness.jpg',
    tint: '#f6f2ea',
  },
  // warm clay quarry tiles, 6 × 6 per map → 300 × 300 mm
  tile_floor_terracotta: ACG('tile_floor_terracotta', 'Terracotta floor tiles 300 × 300', 'Tiles027', 1.8, { ao: true }),
  // mown lawn for ground-floor and rooftop green strips (turf; storey-height planters get a planter_bed instead), 1.4 m a repeat
  turf: { ...ACG('turf', 'Lawn (turf)', 'Grass004', 1.4), matte: true },
  // session 19, the levels' zones and common rooms (materials.ts ZONE_FLOOR, finishes.ts): Poly Haven 1k maps as downloaded
  paving_pavers: PH('paving_pavers', 'Concrete brick pavers', 'concrete_pavers_02', 2, 'Amal Kumar'),
  asphalt: PH('asphalt', 'Clean asphalt', 'clean_asphalt', 2.1, 'Dimitrios Savva'),
  // smooth troweled garage concrete: parking, kerbs, risers, the pool's coping
  concrete: PH('concrete', 'Garage floor concrete', 'garage_floor', 1.886, 'Jenelle van Heerden'),
  deck_boards: PH('deck_boards', 'Timber deck boards', 'wooden_planks', 2, 'Dario Barresi, Charlotte Baglioni'),
  rubber_gym: PH('rubber_gym', 'Rubber gym floor tiles', 'rubber_tiles', 2, 'Amal Kumar'),
  soil: { ...PH('soil', 'Planter soil', 'farm_soil', 2, 'Amal Kumar'), matte: true },
  // a lobby's polished porcelain, 800 × 800 (8 × 8 per map): the porcelain tile's AO map as the colour — white with a
  // FINE LIGHT grout line — and the polished marble's gloss (no grout in it). At 800 mm every grout cue of the tile's own
  // maps is 12–19 mm wide: its groove (normal), matte grout (roughness) and AO each drew it as a dark line in the shade;
  // its albedo at 1200 mm read as grey slabs with 2–3 cm dark grout; the marble's veins stretched to the tile, a dirty floor.
  tile_floor_large: {
    ...ACG('tile_floor_large', 'Polished porcelain floor tiles 800 × 800', 'Tiles105', 6.4, { normal: false }),
    albedo: '/assets/textures/tile_floor_ceramic/ao.jpg',
    roughness: '/assets/textures/marble_floor_white/roughness.jpg',
    tint: '#d7d7d7',
  },
  // session 31 facade: what an outer wall can be clad in (furnish/finishes.ts OUTSIDE_SLOT), public/assets/MANIFEST.md
  brick_red: OUT('brick_red', 'Red brick', 'https://polyhaven.com/a/large_red_bricks', 2, 'Rob Tuytel'),
  // whitewashed brick, its colour taken out (grey-white bricks and mortar): the options tint it white, grey or any paint
  brick_painted: OUT('brick_painted', 'Painted brick', 'https://polyhaven.com/a/whitewashed_brick', 2, 'Rob Tuytel'),
  stone_blocks: OUT('stone_blocks', 'Light stone blocks', 'https://polyhaven.com/a/stone_tile_wall', 2, 'Charlotte Baglioni'),
  // vertical composite slats with dark gaps, ~77 mm (26 a repeat): Dhaka's "timber-look" panels
  timber_slats: OUT('timber_slats', 'Timber slats', 'https://polyhaven.com/a/synthetic_wood', 2, 'Dario Barresi, Charlotte Baglioni'),
  // lap siding, 13 boards a repeat (~150 mm exposure: ambientCG gives no size)
  timber_clapboard: OUT('timber_clapboard', 'Timber clapboard', 'https://ambientcg.com/view?id=WoodSiding007', 2, 'ambientCG (Lennart Demes)'),
  // the box-profile sheet's red taken out and lightened to a zinc grey: ribs every ~220 mm
  metal_seam: OUT('metal_seam', 'Zinc rib panels', 'https://polyhaven.com/a/box_profile_metal_sheet', 2, 'Amal Kumar'),
  metal_corrugated: OUT('metal_corrugated', 'Corrugated metal', 'https://polyhaven.com/a/corrugated_iron_02', 2.7, 'Jenelle van Heerden, Sergej Majboroda'),
  concrete_fair: OUT('concrete_fair', 'Fair-faced concrete', 'https://polyhaven.com/a/concrete_wall_008', 2.71, 'Dario Barresi, Charlotte Baglioni'),
  // the same concrete with a 13 mm joint every 2.71 × 1.355 m drawn in (colour, relief, roughness): precast panels
  concrete_precast: OUT('concrete_precast', 'Precast concrete panels', 'https://polyhaven.com/a/concrete_wall_008', 2.71, 'Dario Barresi, Charlotte Baglioni'),
  // flat panels 1.2 × 0.8 m with 10 mm joints, drawn over the concrete scan flattened to an even light grey: fibre-cement and
  // aluminium composite panels (the options tint it white, charcoal…)
  panel_grid: OUT('panel_grid', 'Flat facade panels', 'https://polyhaven.com/a/concrete_wall_008', 2.4, 'Dario Barresi, Charlotte Baglioni'),
  // session 31 roof lane: a roof's coverings (finishes.ts ROOF_COVERINGS), Poly Haven 1k maps re-encoded small (albedo + normal
  // 1024, roughness 512, no AO; MANIFEST.md); u along the eaves, v up the slope (three/roof.ts); a zinc or corrugated roof wears the outside sets metal_seam / metal_corrugated below
  roof_clay: { ...PH('roof_clay', 'Clay roof tiles', 'clay_roof_tiles_02', 2.5, 'Amal Kumar'), ao: undefined },
  roof_slate: { ...PH('roof_slate', 'Slate roof tiles', 'grey_roof_01', 8, 'Rob Tuytel'), ao: undefined },
  roof_shingles: { ...PH('roof_shingles', 'Timber roof shingles', 'roof_slates_02', 3, 'Rob Tuytel'), ao: undefined },
  roof_gravel: { ...PH('roof_gravel', 'Roof gravel', 'gravel_floor_02', 2, 'Jenelle van Heerden, Dimitrios Savva'), ao: undefined },
}
