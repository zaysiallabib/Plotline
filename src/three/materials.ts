/**
 * Material + texture cache. Convention: ALL geometry has UVs in METERS, so a
 * texture set tiles at `1 / repeatM` regardless of surface size — one material
 * per MaterialRef, shared by every surface that uses it.
 * A missing texture file (404) never breaks the scene: the material keeps a
 * flat fallback colour and only receives the map once it actually loads.
 */
import * as THREE from 'three'
import type { Configuration, FinishSlot, Id, MaterialRef, RoomKind } from '../core'
import { TEXTURES } from '../furnish/textures'
import { daylit as daylitPatch } from './daylight'

const texCache = new Map<string, Promise<THREE.Texture>>()
const matCache = new Map<string, THREE.MeshStandardMaterial>()
let maxAnisotropy = 1

export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n
}

function loadTex(url: string, repeatM: number, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${repeatM}`
  let p = texCache.get(key)
  if (!p) {
    p = new THREE.TextureLoader().loadAsync(url).then((tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.repeat.set(1 / repeatM, 1 / repeatM)
      tex.anisotropy = maxAnisotropy
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace
      return tex
    })
    p.catch(() => console.warn(`[plotline] texture missing: ${url}`))
    texCache.set(key, p)
  }
  return p
}

/** Flat colour that stands in for a texture set that is not on disk yet. */
function fallbackColor(textureId: string): string {
  if (/wood|oak|teak|deck/.test(textureId)) return '#8a6a4a'
  if (/turf|grass/.test(textureId)) return '#5d7040'
  if (/asphalt|rubber/.test(textureId)) return '#3c3c3c'
  if (/soil/.test(textureId)) return '#4a3a2c'
  if (/paving/.test(textureId)) return '#9b9891'
  if (/marble/.test(textureId)) return '#e6e2da'
  if (/tile/.test(textureId)) return '#d8d5cf'
  if (/concrete|stone/.test(textureId)) return '#9b9891'
  return '#efe9df' // plaster
}

/**
 * One shared material per ref. `edge`: its own copy pushed back in depth (polygon offset), for wall ends and tops that sit
 * edge-on against a face and must lose the depth tie; a clone of the plain one made before its maps load never gets them.
 * `daylit`: the room-surface variant (daylight.ts: indirect light × the unit's daylight atlas); its meshes carry `dayUv`.
 */
export function materialFor(ref: MaterialRef, edge = false, daylit = false): THREE.MeshStandardMaterial {
  const key = JSON.stringify(ref) + (edge ? '|edge' : '') + (daylit ? '|day' : '')
  const cached = matCache.get(key)
  if (cached) return cached
  let m: THREE.MeshStandardMaterial
  if (ref.kind === 'color') {
    m = new THREE.MeshStandardMaterial({
      color: ref.color,
      roughness: ref.roughness ?? 0.85,
      metalness: ref.metalness ?? 0,
    })
  } else {
    const set = TEXTURES[ref.textureId]
    m = new THREE.MeshStandardMaterial({ color: ref.tint ?? fallbackColor(ref.textureId), roughness: 0.9 })
    if (!set) {
      console.warn(`[plotline] unknown textureId "${ref.textureId}" — using flat colour`)
    } else {
      const mat = m
      const apply = (slot: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', url: string | undefined, srgb = false) => {
        if (!url) return
        loadTex(url, set.repeatM, srgb)
          .then((t) => {
            mat[slot] = t
            if (slot === 'map') mat.color.set(ref.tint ?? '#ffffff').multiply(new THREE.Color(set.tint ?? '#ffffff'))
            if (slot === 'roughnessMap') mat.roughness = 1
            mat.needsUpdate = true
          })
          .catch(() => {}) // already warned; keep the flat colour
      }
      apply('map', set.albedo, true)
      apply('normalMap', set.normal)
      if (set.matte) Object.assign(m, { roughness: 1, normalScale: new THREE.Vector2(0.5, 0.5) })
      else apply('roughnessMap', set.roughness)
      apply('aoMap', set.ao)
    }
  }
  if (edge) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  if (daylit) daylitPatch(m)
  matCache.set(key, m)
  return m
}

/** Rendered outer walls, slab edges, the tower: the interior plaster scan, warmer and darker than the warm-white paint (#f4f1ea) so the
 * outside face reads as a different, weathered surface through a window. Flat #d9d4cb read as a cream sheet in every pane (wave 10). */
export const EXTERIOR_PLASTER: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#dbd3c6' }
/** Wall ends and tops (edge variant): the warm-white paint. A thick outer wall's end cap shows inside the room it stops at
 * (Bath-1 beside its thinner wall); in the weathered exterior tint it read as a dirty tan strip. */
export const EDGE_PLASTER: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#f4f1ea' }
/** Bare smooth concrete: parking floors, kerbs, the riser where two zones meet at different levels, a pool's coping. */
export const CONCRETE: MaterialRef = { kind: 'pbr', textureId: 'concrete', tint: '#c8d0d6' } // cools the scan's brown: it read as earth
/** A pool's basin: aqua-glazed tiles (the wall tile's grout relief and glaze). */
export const POOL_TILE: MaterialRef = { kind: 'pbr', textureId: 'tile_wall_white', tint: '#8ccad0' }
/**
 * The outdoor zones' floors (core.isOutdoor): a rule by kind, no buyer finish. A play area is the soft rubber surface, a
 * planter its soil (the greenery is furniture), a pool its tiled basin (the water is its own mesh).
 */
export const ZONE_FLOOR: Partial<Record<RoomKind, MaterialRef>> = {
  lawn: { kind: 'pbr', textureId: 'turf' },
  paving: { kind: 'pbr', textureId: 'paving_pavers', tint: '#d6d2cc' },
  driveway: { kind: 'pbr', textureId: 'asphalt' },
  parking: CONCRETE,
  deck: { kind: 'pbr', textureId: 'deck_boards', tint: '#c9b6a2' },
  play: { kind: 'pbr', textureId: 'turf' }, // artificial grass: the CC0 rubber surface came out a heavy maroon slab
  planter: { kind: 'pbr', textureId: 'soil' },
  pool: POOL_TILE,
}
/** A face toward an outdoor zone: its floor by kind; every wall face, end and top the exterior render; overhead the cover's concrete. */
export function zoneFinishRef(kind: RoomKind, target: FinishSlot['target']): MaterialRef {
  return target === 'floor' ? (ZONE_FLOOR[kind] ?? CONCRETE) : target === 'wall' ? EXTERIOR_PLASTER : CONCRETE
}

const DEFAULTS: Record<FinishSlot['target'], MaterialRef> = {
  floor: { kind: 'color', color: '#b8a58c', roughness: 0.7 },
  // the hand-authored units' warm-white paint: a flat #f1efe9 was the white casing's own colour, so a Studio draft's cased
  // openings vanished into their walls (founder, 2026-10-04)
  wall: EDGE_PLASTER,
  ceiling: { kind: 'color', color: '#f7f5f0', roughness: 1 },
}

/**
 * Finish resolution: the slot whose roomIds names this room beats a slot
 * with roomIds 'all'; chosen option = cfg[slot.id] ?? slot.defaultOptionId.
 * roomId null = a face no closed room claims: the interior paint, never the weathered exterior tint — a wall end or
 * jog poking a few mm into a room read as a grey strip (founder, 2026-10-03); the tower shells (building.ts) tint
 * their own outside. A true outer face is only ever seen through a window at a slant.
 */
export function resolveFinishRef(
  slots: FinishSlot[],
  cfg: Configuration,
  roomId: Id | null,
  target: FinishSlot['target'],
): MaterialRef {
  if (roomId === null) return DEFAULTS[target]
  let slot: FinishSlot | undefined
  for (const s of slots) {
    if (s.target !== target) continue
    if (s.roomIds === 'all') slot ??= s
    else if (s.roomIds.includes(roomId)) slot = s
  }
  if (!slot) return DEFAULTS[target]
  const chosen = cfg[slot.id] ?? slot.defaultOptionId
  const opt = slot.options.find((o) => o.id === chosen) ?? slot.options.find((o) => o.id === slot.defaultOptionId)
  return opt?.material ?? DEFAULTS[target]
}

export function resolveFinish(
  slots: FinishSlot[],
  cfg: Configuration,
  roomId: Id | null,
  target: FinishSlot['target'],
  daylit = false,
  edge = false,
): THREE.MeshStandardMaterial {
  return materialFor(resolveFinishRef(slots, cfg, roomId, target), edge, daylit)
}
