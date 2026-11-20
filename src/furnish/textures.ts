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
  /** its height when it is no square (a staff's own 60 × 30 cm tile picture); absent = repeatM */
  repeatYM?: number
  /** × the albedo map, under any MaterialRef tint: calibrates a scan whose white is hotter than the real surface */
  tint?: string
  /** grass / soil: its roughness map is left off (roughness 1) and its relief halved — in the sun the scan glittered white */
  matte?: true
  source: string
  author: string
  /** 'own': a picture the developer's staff added (furnish/own.ts), theirs */
  license: 'CC0' | 'own'
}

/**
 * FIXED ids — the unit-data agent references these, the assets agent fulfils them:
 *  floors:   wood_floor_oak, marble_floor_white, tile_floor_ceramic, tile_floor_outdoor
 *  walls:    plaster_white (tinted for paint colours), tile_wall_white
 *  ceiling:  plaster_white
 *  soft:     fabric_curtain (curtains), fabric_upholstery, rug_wool
 *  joinery:  wood_veneer_light (door leaves, cabinets), metal_brushed
 */
import { TEXTURES } from './textures.data'

export { TEXTURES }
/** The staff's own texture pictures, by their finish option's id (furnish/own.ts registerOwn). */
export const OWN_TEXTURES: Record<string, TextureSet> = {}
/** A texture set by id: the library's, else the staff's own. */
export const textureSet = (id: string): TextureSet | undefined => TEXTURES[id] ?? OWN_TEXTURES[id]

/** HDRI environment maps (public paths). */
export const HDRI = {
  interior: '/assets/hdri/interior.hdr',
  sky: '/assets/hdri/sky.hdr',
} as const
