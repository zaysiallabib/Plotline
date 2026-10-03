/**
 * Material + texture cache. Convention: ALL geometry has UVs in METERS, so a
 * texture set tiles at `1 / repeatM` regardless of surface size — one material
 * per MaterialRef, shared by every surface that uses it.
 * A missing texture file (404) never breaks the scene: the material keeps a
 * flat fallback colour and only receives the map once it actually loads.
 */
import * as THREE from 'three'
import type { Configuration, FinishSlot, Id, MaterialRef } from '../core'
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
  if (/wood|oak|teak/.test(textureId)) return '#8a6a4a'
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
      apply('roughnessMap', set.roughness)
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
const DEFAULTS: Record<FinishSlot['target'], MaterialRef> = {
  floor: { kind: 'color', color: '#b8a58c', roughness: 0.7 },
  wall: { kind: 'color', color: '#f1efe9', roughness: 0.95 },
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
