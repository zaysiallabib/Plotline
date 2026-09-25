/**
 * PBR texture registry — CC0 (Poly Haven, ambientCG), recorded in public/assets/MANIFEST.md.
 * Unit JSON references these by id (MaterialRef.textureId).
 * Filled by the assets agent in textures.data.ts.
 */
export interface TextureSet {
  id: string
  label: string
  /** public paths */
  albedo: string
  normal?: string // OpenGL-convention normal map (Poly Haven "nor_gl")
  roughness?: string
  ao?: string
  /** real-world size of one tile, meters (Poly Haven "dimensions" in mm / 1000) */
  repeatM: number
  /** × the albedo map, under any MaterialRef tint: calibrates a scan whose white is hotter than the real surface */
  tint?: string
  source: string
  author: string
  license: 'CC0'
}

/**
 * FIXED ids — the unit-data agent references these, the assets agent fulfils them:
 *  floors:   wood_floor_oak, marble_floor_white, tile_floor_ceramic, tile_floor_outdoor
 *  walls:    plaster_white (tinted for paint colours), tile_wall_white
 *  ceiling:  plaster_white
 *  soft:     fabric_curtain (curtains), fabric_upholstery, rug_wool
 *  joinery:  wood_veneer_light (door leaves, cabinets), metal_brushed
 */
export { TEXTURES } from './textures.data'

/** HDRI environment maps (public paths). */
export const HDRI = {
  interior: '/assets/hdri/interior.hdr',
  sky: '/assets/hdri/sky.hdr',
} as const
