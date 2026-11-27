/**
 * Material + texture cache. Convention: ALL geometry has UVs in METERS, so a
 * texture set tiles at `1 / repeatM` regardless of surface size — one material
 * per MaterialRef, shared by every surface that uses it.
 * A missing texture file (404) never breaks the scene: the material keeps a
 * flat fallback colour and only receives the map once it actually loads.
 */
import * as THREE from 'three'
import type { Configuration, FinishSlot, Id, MaterialRef, RoomKind } from '../core'
import { OUTSIDE_PLASTER, roomKey, slotFor, wallKey } from '../furnish/finishes'
import { textureSet, type TextureSet } from '../furnish/textures'
import { daylit as daylitPatch, mottleMap, nightPatch } from './daylight'

/**
 * The flat's lamps (render.ts's pool of spot lights) light its own rooms only. What is outside them — the street and its
 * blocks and ground (context.ts hazed), and in the Building view the tower: the other flats' shells, their rooms behind the
 * glass (interiors.ts), the panes (building.ts) — takes none of them: they lit the block across the lane and a neighbour's
 * rooms through the walls, and every such pixel paid for all of them (session 31 perf: 12 lamps on High). three writes the
 * scene's spot-light count into a shader's light chunks when it builds the program; the chunks that name spot lights are
 * written out here with none, before it does.
 */
export const noSpots = (src: string): string =>
  src.replace(/#include <(\w+)>/g, (inc, k: string) => {
    const c = (THREE.ShaderChunk as Record<string, string>)[k]
    return c && /NUM_SPOT_LIGHT/.test(c) ? c.replace(/NUM_SPOT_LIGHT\w*/g, '0') : inc
  })

const images = new Map<string, Promise<THREE.Texture>>()
const texCache = new Map<string, Promise<THREE.Texture>>()

/**
 * Every picture or scan still on its way (texture(), procedural.ts's plant scans): a floor reached by the stair waits for them
 * before it shows (PlotlineScene.arrive) — its shaders are compiled with their maps, nothing pops in after.
 */
export const loading = new Set<Promise<unknown>>()
export function track<T>(p: Promise<T>): Promise<T> {
  loading.add(p)
  const done = () => void loading.delete(p)
  p.then(done, done)
  return p
}
const matCache = new Map<string, THREE.MeshStandardMaterial>()
let maxAnisotropy = 1

export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n
}

/**
 * Lite (render.ts Quality, set by PlotlineScene; procedural.ts re-exports it): the models' pictures are decoded at half
 * size, the street is plain boxes (context.ts), and (session 31) a texture set gives its colour picture only — no relief
 * (normal), ambient-occlusion or roughness / metal pictures, their numbers instead: fewer pictures and one material program
 * where there were four (procedural.ts pbr and furniture.ts's models follow it).
 */
export const lite = { on: false }
/**
 * Lite and Low (render.ts TIERS.extras off; procedural.ts re-exports it): the two costliest extras left out — the scanned
 * plants (1.2–6.3 MB files each, ~290k of Low's 510k triangles a frame on type-a, alpha-tested leaves) are not loaded — a
 * pot keeps its soil, a planter bed its earth, a kit plant model is left out (furniture.ts) — and a mirror is plain
 * silvery glass, never a live reflection (that pass draws the whole flat again).
 */
export const lean = { on: false }

/** A 1 × 1 picture of one value (floats: 0.5 is exactly a flat relief). */
function blank(r: number, g: number, b: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array([r, g, b, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  t.needsUpdate = true
  return t
}
/** samePictures' blanks: white multiplies a colour, roughness, metal or shading by 1; the flat relief is the surface's own normal */
const BLANK = { white: blank(1, 1, 1), flat: blank(0.5, 0.5, 1) }
export const isBlank = (t: unknown): boolean => t === BLANK.white || t === BLANK.flat
/** the white blank (× 1): the street's roads and ground in its program's picture slots (context.ts streetMaterial) */
export const WHITE_PICTURE = BLANK.white
export const PICTURES = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const
/** Past the five, on High and Low (samePictures): the glow picture of every lit surface, a cut-out's mask, a physical scan's shine. */
export const MORE_PICTURES = ['emissiveMap', 'alphaMap', 'specularIntensityMap'] as const
/** A two-sided solid piece's alpha test (samePictures): above 0, so it is drawn with the leaves' program, and never cutting (daylight.ts dayCut). */
export const SOLID_CUT = 1e-6
/** the most pictures a lit surface reads (samePictures): 16 a program may, 9 of them the light's on High */
export const PICTURE_ROOM = 7
/** a picture that may be see-through somewhere (a .png): an alpha test, even the solid one, would cut its shadow there */
const seeThrough = (t: THREE.Texture | null): boolean => !!t && !isBlank(t) && (t.userData.mimeType === 'image/png' || /\.png(\?|$)/i.test((t.image as { src?: string } | null)?.src ?? ''))

/**
 * Every lit surface and piece draws with the same set of pictures — colour, relief, roughness, metal, shading — a blank one
 * where it has none of its own (Lite: the colour picture only, its only one): the shader programs no longer split by which
 * pictures a surface happens to have, and a picture coming in later changes no program. Session 31 ready lane: Firefox makes
 * a new program in 0.1–0.3 s and the first frame waits for every one of them — High's Building view on Sheltech had 24 lit
 * programs; the blanks change nothing on screen (× 1, and the flat relief bends no normal). Once per material.
 * Session 31 start lane, High and Low: also a glow picture, and the rooms' patch with its daylight left out (daylight.ts
 * daylit, `on` false) where it has no shader of its own — a door frame, the glass, a scan drew with programs of their own; a
 * two-sided solid one (a lamp's shade, a curtain, a trunk) gets an alpha test that never cuts and a mask, as the leaves
 * have; a physical one (the fan, a scan's shiny leaves) also a shine picture: one program for the flat's one-sided surfaces,
 * one for its two-sided ones and leaves, one for the physical scans, one for its glass — Walk on High made 14, 0.3 s each.
 * A program may read 16 pictures and on High the light takes 9 (the sky's, the daylight, the plaster's cloud, the sun's two
 * shadows, three lamps' and one more of three's own: measured, a physical program of 8 would not build): a surface keeps 7 —
 * a physical one no blank shading picture (no scan here has one), and past 7 the blanks give way (PICTURE_ROOM).
 * Called again once a material turns two-sided (procedural.ts drape): only that part is looked at again.
 */
export function samePictures(m: THREE.Material, also: readonly ('emissiveMap' | 'alphaMap')[] = []): void {
  const s = m as THREE.MeshPhysicalMaterial
  if (!s.isMeshStandardMaterial) return
  const blank = (k: (typeof PICTURES)[number] | (typeof MORE_PICTURES)[number]) => !s[k] && ((s[k] = k === 'normalMap' ? BLANK.flat : BLANK.white), (s.needsUpdate = true))
  if (!lite.on && s.side === THREE.DoubleSide && !s.transparent && !(s.alphaTest > 0) && !seeThrough(s.map)) (s.alphaTest = SOLID_CUT), (s.userData.solid = true)
  if (!lite.on && s.alphaTest > 0) blank('alphaMap')
  if (s.userData.samePictures) return
  s.userData.samePictures = true
  // `also`: a glow or a cut-out picture still to come (a leaf's): a blank holds its place until it does
  if (lite.on) return void [...(['map'] as const), ...also].forEach(blank)
  for (const k of [...PICTURES, 'emissiveMap', ...also] as const) if (!(s.isMeshPhysicalMaterial && k === 'aoMap')) blank(k)
  if (s.isMeshPhysicalMaterial) blank('specularIntensityMap')
  // a surface with more pictures of its own than that (none here yet): its blanks give way, the glow's first
  for (const k of ['emissiveMap', 'specularIntensityMap', 'alphaMap'] as const)
    if ([...PICTURES, ...MORE_PICTURES].filter((x) => s[x]).length > PICTURE_ROOM && isBlank(s[k])) (s[k] = null), k === 'alphaMap' && s.userData.solid && ((s.alphaTest = 0), (s.userData.solid = false))
  if (s.onBeforeCompile === THREE.Material.prototype.onBeforeCompile) daylitPatch(s, false)
}

/**
 * One texture per (url, tile size), every one of a url sharing its picture: one download, one decode and one upload to
 * the graphics chip (three shares a Source across textures with the same sampling), whatever the tile size — the rooms
 * and the code-built furniture (procedural.ts) used to load the same picture once each, per tile size. `repeatYM`: a
 * tile that is no square (a staff's own 60 × 30 cm picture).
 */
export function texture(url: string, repeatM: number, srgb: boolean, repeatYM = repeatM): Promise<THREE.Texture> {
  const key = `${url}|${repeatM}|${repeatYM}`
  let p = texCache.get(key)
  if (!p) {
    let base = images.get(url)
    if (!base) {
      base = new THREE.TextureLoader().loadAsync(url).then((tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.anisotropy = maxAnisotropy
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace
        return tex
      })
      base.catch(() => console.warn(`[plotline] texture missing: ${url}`))
      images.set(url, base)
    }
    p = base.then((b) => {
      const tex = b.clone() // the same picture (Source); its own tiling
      tex.repeat.set(1 / repeatM, 1 / repeatYM)
      return tex
    })
    p.catch(() => {})
    texCache.set(key, track(p))
  }
  return p
}

/**
 * Painted plaster (session 31: "flat grey-beige walls"): the walls', ceilings' and columns' paint over the plaster scan
 * gets a faint cloudiness under the indirect light (daylight.ts mottleMap) — the concrete scan's roughness picture, one
 * tile every 3.5 m, ±≈ 6 % — so a wall is not one flat colour; its paint colour and its mean brightness stay the finish's.
 * Lite: none (colour only). One more picture, one more lookup per wall pixel.
 */
const MOTTLE = { url: '/assets/textures/concrete/roughness.jpg', tileM: 3.5, k: 1 }
function mottle(m: THREE.MeshStandardMaterial, set: TextureSet): void {
  m.userData.mottle = { k: MOTTLE.k, uv: Number((set.repeatM / MOTTLE.tileM).toFixed(4)) } // numbers (daylight.ts daylit): the rooms' program; no picture yet reads as none
  texture(MOTTLE.url, 1, false).then(
    (t) => void (mottleMap.value = t),
    () => {}, // already warned; a plain wall
  )
}

/**
 * The plaster scan's colour picture has pores — dark specks 2–6 mm wide (1–3 of its 2 mm texels) that a wall at arm's length
 * under the lamps showed as pitted stucco (qa2 V3: with the scan's relief switched off in the page the specks stayed, with
 * its colour picture off they went). There the picture is magnified (4 screen pixels a texel at 0.5 m), so a painted wall
 * reads it this many mip levels softer than the screen asks (daylight.ts mapBias): at arm's length 3 levels down (16 mm a
 * texel), the pits melt into the paint; farther off the picture is all but even at any level. Its mean colour stays; every
 * tier; a smaller level is no dearer to read.
 */
const PORE_BLUR = 5

/** Flat colour that stands in for a texture set that is not on disk yet. */
export function fallbackColor(textureId: string): string {
  if (/wood|oak|teak|deck|timber/.test(textureId)) return '#8a6a4a'
  if (/brick_red/.test(textureId)) return '#a5583f'
  if (/metal/.test(textureId)) return '#8f9396'
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
 * `outside`: the Building view's tower variant: none of the walked flat's lamps (noSpots) and the city's night light. On Lite,
 * whose shader has no lamp at all, the tower's and the flat's own plain ones are one program, the night light switched on
 * for the tower's only (one program, not two). `outer`: a walked flat's outer face in the building's outside finish
 * (furnish/finishes.ts outsideOf): the city's night light, as the plaster outside always had. `own`: a caller that changes the
 * material after (the outside shape's Dollhouse cut, three/shell.ts) keeps a copy of its own under that name.
 */
export function materialFor(ref: MaterialRef, edge = false, daylit = false, outside = false, outer = false, own = ''): THREE.MeshStandardMaterial {
  const key = JSON.stringify(ref) + (edge ? '|edge' : '') + (daylit ? '|day' : '') + (outside ? '|out' : '') + (outer ? '|outer' : '') + (own ? `|${own}` : '')
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
    const set = textureSet(ref.textureId)
    m = new THREE.MeshStandardMaterial({ color: ref.tint ?? fallbackColor(ref.textureId), roughness: 0.9 })
    if (!set) {
      console.warn(`[plotline] unknown textureId "${ref.textureId}" — using flat colour`)
    } else {
      const mat = m
      const apply = (slot: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', url: string | undefined, srgb = false) => {
        if (!url || (lite.on && slot !== 'map')) return
        texture(url, set.repeatM, srgb, set.repeatYM)
          .then((t) => {
            mat[slot] = t // in a blank's place (samePictures): the same program
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
      if (daylit && !lite.on && set.id === 'plaster_white') mottle(m, set)
      if (daylit && set.id === 'plaster_white') m.userData.mapBias = PORE_BLUR
    }
  }
  samePictures(m)
  if (edge) Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  m.userData.nightOut = outer || key.startsWith(OUTER) // the walked flat's outer faces take the city's night light, as the tower's (daylight.ts nightOut)
  if (daylit) daylitPatch(m)
  if (outside && !lite.on) {
    m.onBeforeCompile = (s) => {
      nightPatch(s) // the tower at night: the sky's glow and the street's lamps (qa3 P10)
      s.vertexShader = noSpots(s.vertexShader)
      s.fragmentShader = noSpots(s.fragmentShader)
    }
    m.customProgramCacheKey = () => 'outside'
  } else if (lite.on && !daylit) litePlain(m, outside)
  matCache.set(key, m)
  return m
}

/** Lite: a plain surface's one program, the city's night light on (the tower's: `outside`) or off (the flat's own) — materialFor's and the bay paint's. */
export function litePlain(m: THREE.MeshStandardMaterial, outside: boolean): void {
  const on = { value: outside ? 1 : 0 }
  m.onBeforeCompile = (s) => nightPatch(s, on)
  m.customProgramCacheKey = () => 'plain-night'
}

/** Rendered outer walls, slab edges, the tower: the interior plaster scan, warmer and darker than the warm-white paint (#f4f1ea) so the
 * outside face reads as a different, weathered surface through a window. Flat #d9d4cb read as a cream sheet in every pane (wave 10). */
export const EXTERIOR_PLASTER: MaterialRef = OUTSIDE_PLASTER // (furnish/finishes.ts: the outside's first option)
const OUTER = JSON.stringify(EXTERIOR_PLASTER)
/** Wall ends and tops (edge variant): the warm-white paint. A thick outer wall's end cap shows inside the room it stops at
 * (Bath-1 beside its thinner wall); in the weathered exterior tint it read as a dirty tan strip. */
export const EDGE_PLASTER: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#f4f1ea' }
/** Bare smooth concrete: parking floors, kerbs, the riser where two zones meet at different levels, a pool's coping. */
export const CONCRETE: MaterialRef = { kind: 'pbr', textureId: 'concrete', tint: '#c8d0d6' } // cools the scan's brown: it read as earth
/** Road-marking paint on a parking floor: pulled forward in depth so it never fights the floor under it. */
export const PAINT = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
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
  deck: { kind: 'pbr', textureId: 'deck_boards' },
  play: { kind: 'pbr', textureId: 'turf' }, // artificial grass: the CC0 rubber surface came out a heavy maroon slab
  planter: { kind: 'pbr', textureId: 'soil' },
  pool: POOL_TILE,
}
/** A parking deck's walls and columns: cool grey paint on concrete, under the warm soffit (the garage concrete scan on a wall read as mud). */
export const DECK_PAINT: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#c4c8cb' }
/**
 * A face toward an outdoor zone: its floor by kind; every wall face, end and top the exterior render — but on a parking
 * deck (`deck`: a level whose every zone is under the slab above, a basement) the cool grey paint: walls, columns and
 * soffit in one beige render read as a cardboard model; overhead the cover's concrete.
 */
export function zoneFinishRef(kind: RoomKind, target: FinishSlot['target'], deck = false): MaterialRef {
  if (target === 'wall') return deck ? DECK_PAINT : EXTERIOR_PLASTER
  return target === 'floor' ? (ZONE_FLOOR[kind] ?? CONCRETE) : CONCRETE
}

const DEFAULTS: Record<FinishSlot['target'], MaterialRef> = {
  floor: { kind: 'color', color: '#b8a58c', roughness: 0.7 },
  // the hand-authored units' warm-white paint: a flat #f1efe9 was the white casing's own colour, so a Studio draft's cased
  // openings vanished into their walls (founder, 2026-10-04)
  wall: EDGE_PLASTER,
  ceiling: { kind: 'color', color: '#f7f5f0', roughness: 1 },
}

/**
 * Finish resolution: the slot whose roomIds names this room beats a slot with roomIds 'all' (finishes.ts slotFor);
 * chosen option = this wall face's key ?? this room's key ?? cfg[slot.id] ?? slot.defaultOptionId (finishes.ts roomKey /
 * wallKey), skipping any that is not an option of that slot.
 * roomId null = a face no closed room claims: the interior paint, never the weathered exterior tint — a wall end or
 * jog poking a few mm into a room read as a grey strip (founder, 2026-10-03); the tower shells (building.ts) tint
 * their own outside. A true outer face is only ever seen through a window at a slant.
 */
export function resolveFinishRef(
  slots: FinishSlot[],
  cfg: Configuration,
  roomId: Id | null,
  target: FinishSlot['target'],
  /** a wall surface: the wall its face is chosen by (finishes.ts faceWallId) — its own choice beats the room's */
  wallId?: Id,
): MaterialRef {
  if (roomId === null) return DEFAULTS[target]
  const slot = slotFor(slots, roomId, target)
  if (!slot) return DEFAULTS[target]
  // the first of: this wall face's choice, this room's, the group's, the default — that is an option of this slot
  const picks = [wallId && cfg[wallKey(wallId, roomId)], cfg[roomKey(roomId, target)], cfg[slot.id], slot.defaultOptionId]
  const opt = picks.map((id) => slot.options.find((o) => o.id === id)).find(Boolean)
  return opt?.material ?? DEFAULTS[target]
}

export function resolveFinish(
  slots: FinishSlot[],
  cfg: Configuration,
  roomId: Id | null,
  target: FinishSlot['target'],
  daylit = false,
  edge = false,
  wallId?: Id,
): THREE.MeshStandardMaterial {
  return materialFor(resolveFinishRef(slots, cfg, roomId, target, wallId), edge, daylit)
}
