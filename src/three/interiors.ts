/**
 * The rooms behind the tower's windows (session 31 glow; founder 2026-11-21: "all of them should show, not all of them
 * should hide"). Every other flat of the tower (building.ts) is built as rooms: each room's floor and ceiling and the room
 * side of its walls (a lining 1 cm in front of the shell's own face) in the room's default finishes (furnish/finishes.ts
 * finishSlotsFor), and the walk's furniture by the same presets (studio/furniture.ts layoutFor, furniture.ts buildFurniture).
 * Seen through glass from the street a room is its colours and shapes, not its pictures: each surface's colour — its
 * finish, a piece's picture sampled at every vertex — is baked into the vertices, so every interior of the tower is ONE
 * program, one geometry per drawing (stem) shared by every floor it stands on, one mesh for the rooms and one for the
 * furniture per flat.
 *
 * Light (interiorMaterial): the scene's sun (shadowed by the shells and slabs: a sun patch on a floor) and sky, the sky's
 * share × DAY_INSIDE (a room reads darker than the street, as a real one does from outside); at night each room's lamp from
 * the flat's small table (lampTable: a level and a colour per room, building.ts roomLight) — the night pattern is a flat's
 * own while the geometry is shared.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { Configuration, MaterialRef, Room, Unit } from '../core'
import { finishSlotsFor } from '../furnish/finishes'
import { kitAsset, placementSize } from '../furnish/kit'
import { textureSet } from '../furnish/textures'
import { bottomOf, layoutFor } from '../studio/furniture'
import { KERB_M, floorGeometry, liftWall, liftedWall, roomCeiling, wallGeometry, wallLift } from './details'
import { buildFurniture } from './furniture'
import { EXTERIOR_PLASTER, fallbackColor, noSpots, resolveFinishRef, texture } from './materials'
import { nightPatch } from './daylight'

/** the sky's light inside a room as seen from the street, × the street's (the eye outside is adapted to the street) */
export const DAY_INSIDE = 0.35
/** a lit room's lamp (scene units, × its surfaces' colour): the pick lane's lit windows' strength (building.ts) */
export const LAMP_GLOW = 0.2
/**
 * The lining in front of each wall face (m): the shell's own face behind it is never seen, no two faces in one plane. Seen
 * from the street 100 m off one depth step is ≈ 1 cm: 2 cm, and the ceiling GAP_M under the slab, keep them apart; the
 * floors, in the plate's own top, win by the material's depth offset (interiorMaterial).
 */
const LINING_M = 0.02
const GAP_M = 0.04
/** pieces smaller than this every way are left out (a vase, a book, a cushion's bolster): not seen from the street; and a rug or a mat (FLAT_M high): it would flicker against its floor from afar */
const SMALL_M = 0.25 // ponytail: a size cut, not a view-dependent level of detail; per-piece LOD if close orbits show the gap
const FLAT_M = 0.05
/** a scanned piece behind a window: its stand-in at about this many triangles (furniture.ts standIn; session 31 perf — the scans themselves were 2 of a High tower's 4.7 M triangles) */
export const INSIDE_TRIS = 500
/** a scanned plant (furnish/kit.ts category 'plant', not code-built): ~70k triangles a pot — 9 in 10 of a flat's — for a few leaves seen through a window (Low and Lite never load it anyway) */
const scannedPlant = (assetId: string) => {
  const a = kitAsset(assetId)
  return !!a && a.category === 'plant' && !a.url.startsWith('procedural:')
}

/** every flat's sky share and sun inside (building.ts setSun): the sun 0 without shadow maps (Lite: it would pour through every ceiling) */
export const inside = { day: { value: DAY_INSIDE }, sun: { value: 1 } }

/** A room that is inside a flat: its walls lined, a ceiling, lamps (not a balcony, a shaft or an open zone: they are the shell's). */
export const indoor = (r: Room | null | undefined): r is Room => !!r && r.kind !== 'shaft' && r.kind !== 'balcony' && !core.isOutdoor(r.kind)

// ───────────────────────────── colours ─────────────────────────────

type Pix = { w: number; h: number; d: ArrayLike<number> }
const pixCache = new WeakMap<object, Pix | null>()
const SIDE = 64
/** A picture's pixels, SIDE × SIDE (an RGBA byte texture as it is); null: not readable here (no page: the tests). */
function pixels(tex: THREE.Texture): Pix | null {
  const src = tex.source
  if (pixCache.has(src)) return pixCache.get(src)!
  const img = src.data as (CanvasImageSource & { width?: number; height?: number; data?: ArrayLike<number> }) | null
  if (!img?.width) return null // not loaded yet: asked again next time
  let out: Pix | null = null
  try {
    if ((img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray) && img.height && img.data.length >= img.width * img.height * 4) out = { w: img.width, h: img.height, d: img.data }
    else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas')
      c.width = c.height = SIDE
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, SIDE, SIDE)
      out = { w: SIDE, h: SIDE, d: g.getImageData(0, 0, SIDE, SIDE).data }
    }
  } catch {
    out = null // a picture the page may not read: its material's colour alone
  }
  pixCache.set(src, out)
  return out
}

const UV = new THREE.Vector2()
/** The picture's colour (linear) at (u, v), as three samples it: the texture's tiling and turn, its wrap, its flip. */
function texel(p: Pix, tex: THREE.Texture, u: number, v: number, out: THREE.Color): THREE.Color {
  tex.transformUv(UV.set(u, v))
  const i = (Math.min(p.h - 1, Math.max(0, Math.floor(UV.y * p.h))) * p.w + Math.min(p.w - 1, Math.max(0, Math.floor(UV.x * p.w)))) * 4
  return out.setRGB(p.d[i] / 255, p.d[i + 1] / 255, p.d[i + 2] / 255, tex.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace)
}

/** A picture's mean colour (linear), or null. */
function mean(tex: THREE.Texture): THREE.Color | null {
  const p = pixels(tex)
  if (!p) return null
  const sum = new THREE.Color(0, 0, 0)
  const c = new THREE.Color()
  const n = p.w * p.h
  for (let i = 0; i < n; i++) sum.add(c.setRGB(p.d[i * 4] / 255, p.d[i * 4 + 1] / 255, p.d[i * 4 + 2] / 255, tex.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace))
  return sum.multiplyScalar(1 / n)
}

const refColours = new Map<string, Promise<THREE.Color>>()
/** A finish's colour from afar (linear): a flat colour's own; a picture's mean × its tints, as materials.ts colours it. */
export function refColour(ref: MaterialRef): Promise<THREE.Color> {
  const key = JSON.stringify(ref)
  let p = refColours.get(key)
  if (!p) {
    if (ref.kind === 'color') p = Promise.resolve(new THREE.Color(ref.color))
    else {
      const set = textureSet(ref.textureId)
      const flat = new THREE.Color(ref.tint ?? fallbackColor(ref.textureId))
      p = !set
        ? Promise.resolve(flat)
        : texture(set.albedo, set.repeatM, true, set.repeatYM).then(
            (t) => {
              const m = mean(t)
              return m ? new THREE.Color(ref.tint ?? '#ffffff').multiply(new THREE.Color(set.tint ?? '#ffffff')).multiply(m) : flat
            },
            () => flat,
          )
    }
    refColours.set(key, p)
  }
  return p
}

// ───────────────────────────── geometry ─────────────────────────────

const q16 = (x: number) => Math.round(THREE.MathUtils.clamp(x, 0, 1) * 65535)

/** An interior part: positions, normals (16 bits each), colours (linear, 16 bits), its room's number (16 bits), indexed — what every part merges as: 26 bytes a vertex. */
function part(P: Float32Array, N: Float32Array, C: Uint16Array, room: number, index: ArrayLike<number> | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  const n = P.length / 3
  g.setAttribute('position', new THREE.BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(Int16Array.from(N, (v) => Math.round(THREE.MathUtils.clamp(v, -1, 1) * 32767)), 3, true))
  g.setAttribute('color', new THREE.BufferAttribute(C, 3, true))
  g.setAttribute('towerRoom', new THREE.BufferAttribute(new Uint16Array(n).fill(room), 1))
  g.setIndex(index ? Array.from(index) : Array.from({ length: n }, (_, i) => i))
  return g
}

/** A surface of room `room` in one colour: its positions and normals (computed if it has none) as an interior part. */
function plainPart(g: THREE.BufferGeometry, room: number, c: THREE.Color): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals()
  const n = g.attributes.position.count
  const C = new Uint16Array(n * 3)
  for (let i = 0; i < n; i++) C.set([q16(c.r), q16(c.g), q16(c.b)], i * 3)
  const out = part(new Float32Array(g.attributes.position.array), new Float32Array(g.attributes.normal.array), C, room, g.index?.array ?? null)
  g.dispose()
  return out
}

/** Triangles start … start + count of a non-indexed geometry (a face group of wallGeometry) as its own. */
function slice(g: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry()
  for (const k of ['position', 'normal']) out.setAttribute(k, new THREE.BufferAttribute((g.attributes[k].array as Float32Array).slice(start * 3, (start + count) * 3), 3))
  return out
}

const merge = (gs: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
  if (!gs.length) return null
  const g = mergeGeometries(gs)
  gs.forEach((x) => x.dispose())
  return g
}

/**
 * A drawing's rooms (its own frame, floor at 0): each indoor room's floor (`floors`: a level draws its own, building.ts
 * addLevel), its ceiling GAP_M under the slab above (`wallM`: where the shell's plate starts) and the room side of
 * every wall — each a lining LINING_M in front of the wall's face, its openings cut, standing on its floors as the level's
 * walls do — in the finishes `cfg` picks (a floor's own record: data/building/apartments.ts; none: the plan's defaults), a wall
 * face by its own pick; the room's number (its index in `rooms`) on every vertex. null: no indoor room.
 */
export async function roomsGeometry(u: Unit, rooms: Room[], wallM: number, floors = true, cfg: Configuration = {}): Promise<THREE.BufferGeometry | null> {
  const slots = finishSlotsFor(u, rooms)
  const colour = (r: Room, t: 'floor' | 'wall' | 'ceiling', wallId?: string) => refColour(resolveFinishRef(slots, cfg, r.id, t, wallId))
  const cols = await Promise.all(rooms.map((r) => Promise.all([colour(r, 'floor'), colour(r, 'ceiling')])))
  const slab = await refColour(EXTERIOR_PLASTER)
  const out: THREE.BufferGeometry[] = []
  rooms.forEach((r, i) => {
    // a balcony: its floor only, in the slab's own colour (by day it reads as the shell did), lit as outdoors by day and at
    // night a little by the room it opens from (setLamp `outdoor`, building.ts SPILL)
    if (floors && r.kind === 'balcony') out.push(plainPart(floorGeometry(r, u), i, slab))
    if (!indoor(r)) return
    if (floors) out.push(plainPart(floorGeometry(r, u), i, cols[i][0]))
    const c = floorGeometry(r, u)
    const p = c.attributes.position
    const y = Math.min(roomCeiling(r, u, rooms), wallM) - GAP_M
    for (let k = 0; k < p.count; k++) p.setY(k, y)
    const idx = Array.from(c.index!.array)
    for (let k = 0; k + 2 < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]] // facing down
    c.setIndex(idx)
    c.deleteAttribute('normal')
    out.push(plainPart(c, i, cols[i][1]))
  })
  const lined = { vertices: u.vertices, walls: u.walls.map((w) => ({ ...w, thicknessM: w.thicknessM + 2 * LINING_M })) }
  for (const w of lined.walls) {
    if (!(w.heightM > KERB_M)) continue
    const f = core.wallFrame(w, u.vertices)
    const off = w.thicknessM / 2 + 0.05
    const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
    const [front, back] = [1, -1].map((s) => core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, u))
    const [a, b] = [indoor(front), indoor(back)]
    if (!a && !b) continue
    const l = wallLift(w, u, rooms)
    const built = liftedWall(w, u, l)
    // the reveals go with the outside face (left out: the shell's own reveals show) or, between two rooms, the front's
    const g = wallGeometry(built, lined, a && !b ? 1 : 0)
    if (!g) continue
    liftWall(g, w, u, l)
    for (const grp of g.groups) {
      const r = grp.materialIndex === 0 && a ? front : grp.materialIndex === 1 && b ? back : null
      if (r && grp.count) out.push(plainPart(slice(g, grp.start, grp.count), rooms.indexOf(r), await colour(r, 'wall', w.id)))
    }
    g.dispose()
  }
  return merge(out)
}

const V = new THREE.Vector3()
const NM = new THREE.Matrix3()
const C1 = new THREE.Color()
const C2 = new THREE.Color()

/** A material whose colour stands for the surface: drawn solid (not glass, a see-through sheer, an alpha-cut leaf or a mirror's own shader). */
const solid = (m: THREE.Material | undefined): m is THREE.MeshStandardMaterial =>
  !!m && m.visible && !!(m as THREE.MeshStandardMaterial).color && !(m.transparent && m.opacity < 0.9) && !m.alphaTest && !(m as THREE.MeshStandardMaterial).alphaMap && !(m as THREE.MeshPhysicalMaterial).transmission

/** Mesh m (world matrix set: the drawing's frame) into interior parts of room `room`: every solid material's triangles, its colour × its picture at each vertex × its vertex colours. */
function bake(m: THREE.Mesh, room: number, out: THREE.BufferGeometry[]): void {
  const g = m.geometry
  const pos = g.attributes.position
  if (!pos?.count || (m as THREE.InstancedMesh).isInstancedMesh) return
  const nor = g.attributes.normal
  const mats = [m.material].flat()
  const total = (g.index ?? pos).count
  const ranges = Array.isArray(m.material) && g.groups.length ? g.groups.map((r) => [r.start, Math.min(r.count, total - r.start), r.materialIndex ?? 0]) : [[0, total, 0]]
  NM.getNormalMatrix(m.matrixWorld)
  const flip = m.matrixWorld.determinant() < 0
  for (const [start, count, mi] of ranges) {
    const mat = mats[mi]
    if (!solid(mat) || count < 3) continue
    const ids = new Map<number, number>()
    const index: number[] = []
    for (let i = start; i < start + count; i++) {
      const v = g.index ? g.index.getX(i) : i
      let n = ids.get(v)
      if (n === undefined) ids.set(v, (n = ids.size))
      index.push(n)
    }
    if (flip) for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
    const map = mat.map
    const pix = map ? pixels(map) : null
    if (map?.matrixAutoUpdate) map.updateMatrix()
    const uv = pix && map ? g.getAttribute(map.channel ? `uv${map.channel}` : 'uv') : undefined
    const vc = mat.vertexColors ? g.getAttribute('color') : undefined
    const P = new Float32Array(ids.size * 3)
    const N = new Float32Array(ids.size * 3)
    const C = new Uint16Array(ids.size * 3)
    for (const [v, k] of ids) {
      V.fromBufferAttribute(pos, v).applyMatrix4(m.matrixWorld)
      P.set([V.x, V.y, V.z], k * 3)
      if (nor) V.fromBufferAttribute(nor, v).applyMatrix3(NM).normalize()
      else V.set(0, 1, 0)
      N.set([V.x, V.y, V.z], k * 3)
      C1.copy(mat.color)
      if (pix && uv) C1.multiply(texel(pix, map!, uv.getX(v), uv.getY(v), C2))
      if (vc) C1.multiply(C2.fromBufferAttribute(vc as THREE.BufferAttribute, v))
      C.set([q16(C1.r), q16(C1.g), q16(C1.b)], k * 3)
    }
    out.push(part(P, N, C, room, index))
  }
}

/**
 * A drawing's furniture (its own frame) by the walk's presets, indoor rooms only (a level's outdoor pieces are its own:
 * building.ts furnish), pieces under SMALL_M, rugs and scanned plants left out, the scans as their stand-ins (INSIDE_TRIS), baked as interior parts — a piece at a time, `pause` between them (the
 * caller's frame budget; true: stop, the tower is gone). null: nothing to show.
 */
export async function furnitureGeometry(u: Unit, rooms: Room[], pause: () => Promise<boolean>): Promise<THREE.BufferGeometry | null> {
  const index = new Map(rooms.map((r, i) => [r.id, i]))
  const ps = layoutFor(u, rooms)
  const out: THREE.BufferGeometry[] = []
  for (const p of ps) {
    const i = index.get(p.roomId)
    const r = i === undefined ? undefined : rooms[i]
    const size = placementSize(p)
    if (p.removed || !indoor(r) || Math.max(size.x, size.y, size.z) < SMALL_M || size.y < FLAT_M || scannedPlant(p.assetId)) continue
    const obj = await buildFurniture(p, roomCeiling(r, u, rooms), core.roomLevelAt(r, u, p.x, p.y), bottomOf(ps, p), INSIDE_TRIS)
    obj.updateMatrixWorld(true)
    obj.traverseVisible((o) => void ((o as THREE.Mesh).isMesh && bake(o as THREE.Mesh, i!, out)))
    if (await pause()) return merge(out)
  }
  return merge(out)
}

// ───────────────────────────── light ─────────────────────────────

/** A flat's lamps, one texel a room: red = how lit (0–1), green = its light's colour (0–1: warm, neutral, cool). */
export function lampTable(rooms: number): THREE.DataTexture {
  const n = Math.max(1, rooms)
  const t = new THREE.DataTexture(new Uint8Array(n * 4), n, 1)
  t.magFilter = t.minFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

/** Room i's lamp in the table: lit `level` (0–1), its colour `tint` (0–1); `outdoor` (a balcony): the sky's whole light, not a room's share. */
export function setLamp(t: THREE.DataTexture, i: number, level: number, tint: number, outdoor = false): void {
  const d = t.image.data as Uint8Array
  d[i * 4] = Math.round(255 * THREE.MathUtils.clamp(level, 0, 1))
  d[i * 4 + 1] = Math.round(255 * THREE.MathUtils.clamp(tint, 0, 1))
  d[i * 4 + 2] = outdoor ? 255 : 0
  t.needsUpdate = true
}

/**
 * A flat's interior material: the vertices' colours, lit by the scene with the sky's share × inside.day and the sun ×
 * inside.sun; its room's lamp (`lamps`, × `scale`: the night, or 1 for a flat whose lamps are on) added — most on the floor,
 * less on the walls, least on the ceiling. Both faces (a curtain's back). Every flat's is the same program.
 */
export function interiorMaterial(lamps: THREE.DataTexture, scale: { value: number }): THREE.MeshStandardMaterial {
  // pulled a little toward the eye: a floor lies in its plate's top, and must win it from the street too
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
  m.onBeforeCompile = (s) => {
    nightPatch(s, undefined, 'vTowerOut') // a balcony at night: the city's light as on the shell round it (daylight.ts nightOut)
    Object.assign(s.uniforms, { towerLamps: { value: lamps }, towerLampScale: scale, towerDay: inside.day, towerSun: inside.sun })
    s.vertexShader = `attribute float towerRoom;\nuniform sampler2D towerLamps;\nuniform float towerLampScale;\nvarying vec3 vTowerLamp;\nvarying float vTowerOut;\n${s.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 towerL = texelFetch(towerLamps, ivec2(int(towerRoom + 0.5), 0), 0);
      vTowerOut = towerL.b;
      vTowerLamp = towerLampScale * towerL.r * (towerL.g < 0.5 ? vec3(1.0, 0.62, 0.3) : towerL.g < 0.84 ? vec3(1.0, 0.78, 0.52) : vec3(0.88, 0.86, 0.8));`,
    )
    s.fragmentShader = `uniform float towerDay;\nuniform float towerSun;\nvarying vec3 vTowerLamp;\nvarying float vTowerOut;\n${s.fragmentShader}`
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float towerUp = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
        totalEmissiveRadiance += diffuseColor.rgb * vTowerLamp * ${LAMP_GLOW.toFixed(3)} * (0.75 + 0.25 * towerUp);`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        reflectedLight.indirectDiffuse *= mix(towerDay, 1.0, vTowerOut); // a balcony is outdoors: the sky's whole light
        reflectedLight.indirectSpecular *= mix(towerDay, 1.0, vTowerOut);
        reflectedLight.directDiffuse *= towerSun;
        reflectedLight.directSpecular *= towerSun;`,
      )
    s.vertexShader = noSpots(s.vertexShader)
    s.fragmentShader = noSpots(s.fragmentShader)
  }
  m.customProgramCacheKey = () => 'tower-room'
  return m
}
