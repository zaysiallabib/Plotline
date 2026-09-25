/**
 * Procedural assets Poly Haven lacks (upholstered beds, a fabric sofa, a contemporary
 * dining set and desk, a fitted kitchen run, wall-hung bathroom fixtures, rugs, TVs)
 * from three primitives with CC0 PBR textures (textures.data.ts). Metadata (sizes,
 * ids, mountY) is in procedural.meta.ts so presets/tests never import three.
 * Every builder returns a Group grounded at y = 0, centred in x, front = +z. Parts are
 * merged per material (a handful of draw calls per piece) and get box-projected UVs
 * in METRES, the same convention as src/three/materials.ts.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TEXTURES } from './textures'
import { ART } from './procedural.meta'

export { PROCEDURAL } from './procedural.meta'

// ───────────────────────────── materials ─────────────────────────────

const loader = new THREE.TextureLoader()
const texCache = new Map<string, Promise<THREE.Texture>>()
function tex(url: string, repeatM: number, srgb: boolean): Promise<THREE.Texture> {
  const key = `${url}|${repeatM}`
  let p = texCache.get(key)
  if (!p) {
    p = loader.loadAsync(url).then((t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(1 / repeatM, 1 / repeatM)
      t.anisotropy = 8 // WebGLTextures clamps to the GPU max
      if (srgb) t.colorSpace = THREE.SRGBColorSpace
      return t
    })
    p.catch(() => console.warn(`[plotline] texture missing: ${url}`))
    texCache.set(key, p)
  }
  return p
}

type PbrOpt = { tint?: string; roughness?: number; metalness?: number; scale?: number }
const matCache = new Map<string, THREE.MeshStandardMaterial>()
/** Textured material; maps attach once loaded (a 404 keeps the flat tint). roughness scales the roughness map. */
function pbr(textureId: string, o: PbrOpt = {}): THREE.MeshStandardMaterial {
  const key = `${textureId}|${o.tint}|${o.roughness}|${o.metalness}|${o.scale}`
  let m = matCache.get(key)
  if (m) return m
  m = new THREE.MeshStandardMaterial({ color: o.tint ?? '#ffffff', roughness: o.roughness ?? 1, metalness: o.metalness ?? 0 })
  const set = TEXTURES[textureId]
  if (set) {
    const r = set.repeatM * (o.scale ?? 1)
    const mat = m
    const slot = (k: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', url: string | undefined, srgb = false) =>
      url &&
      tex(url, r, srgb)
        .then((t) => {
          mat[k] = t
          mat.needsUpdate = true
        })
        .catch(() => {})
    slot('map', set.albedo, true)
    slot('normalMap', set.normal)
    slot('roughnessMap', set.roughness)
    slot('aoMap', set.ao)
  }
  matCache.set(key, m)
  return m
}
const flat = (color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })

// one material per kind, shared by every instance
let mats: ReturnType<typeof makeMats> | null = null
function makeMats() {
  return {
    oak: pbr('wood_veneer_light'),
    stone: pbr('marble_floor_white', { scale: 0.6 }),
    // full metalness mirrors the dark studio HDRI and reads black; partly metallic reads as steel
    steel: pbr('metal_brushed', { metalness: 0.85 }),
    fridge: flat('#d8dadb', 0.32, 0.35), // brushed map at fridge scale read as dark streaks
    upholstery: pbr('fabric_upholstery', { tint: '#d2c8b8' }), // warm taupe: headboard, bed base
    sofa: pbr('fabric_upholstery', { tint: '#e6e1d8' }), // oatmeal
    chair: pbr('fabric_upholstery', { tint: '#b3ae9c' }), // sage-grey dining seats
    duvet: pbr('fabric_upholstery', { tint: '#ffffff', scale: 0.7 }),
    linen: pbr('fabric_curtain', { tint: '#ffffff' }),
    throw: pbr('fabric_upholstery', { tint: '#b4623e' }), // terracotta accent
    cushion: pbr('fabric_curtain', { tint: '#d9b98c' }), // ochre accent
    rugIvory: pbr('rug_wool', { tint: '#f3eee6' }),
    rugOat: pbr('rug_wool', { tint: '#e3d8c6' }),
    rugStone: pbr('rug_wool', { tint: '#d6cfc4' }),
    rugBorder: pbr('rug_wool', { tint: '#8f8272' }),
    mattress: flat('#f1efe9', 0.9),
    ceramic: flat('#fbfbf9', 0.12),
    ceramicIn: flat('#f4f4f2', 0.15, 0, { side: THREE.DoubleSide }),
    blackGlass: flat('#070707', 0.06), // glass is a dielectric: metalness mirrored the HDRI as silver
    hoodSteel: flat('#cdd0d2', 0.3, 0.5),
    blackSteel: flat('#1e1e1e', 0.45, 0.6),
    dark: flat('#262320', 0.7),
    ring: flat('#3a3a3a', 0.35),
    // ponytail: no real reflection (Reflector costs a render pass per mirror, per eye in XR); pale silver instead
    mirror: flat('#cfd7d9', 0.06, 0.4),
    mat: flat('#f7f5f0', 0.9),
    glass: flat('#dfe9e6', 0.05, 0, { transparent: true, opacity: 0.18, depthWrite: false }),
    led: flat('#fff4dc', 0.5, 0, { emissive: '#ffe9c4', emissiveIntensity: 1.2 }),
  }
}
const M = () => (mats ??= makeMats())

// ───────────────────────────── geometry helpers ─────────────────────────────

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  o.castShadow = o.receiveShadow = true
  return o
}
/** Box of w × h × d with its CENTRE at (x, y, z). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z)
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z)
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r, open = false) =>
  mesh(new THREE.CylinderGeometry(rTop, r, h, 40, 1, open), m, x, y, z)
/** Tilt a part about x (radians, + tips its top toward +z) and return it. */
const tilt = (o: THREE.Mesh, a: number) => ((o.rotation.x = a), o)

/** UVs in metres by box projection on the dominant normal axis (fabrics, veneer, stone tile the same on every part). */
function boxUV(geo: THREE.BufferGeometry): void {
  const p = geo.attributes.position
  const n = geo.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    const [u, v] = ax >= ay && ax >= az ? [p.getZ(i), p.getY(i)] : ay >= az ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)]
    uv[2 * i] = u
    uv[2 * i + 1] = v
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

/** Bake every part into one mesh per material. */
function finish(parts: THREE.Mesh[]): THREE.Group {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
  for (const o of parts) {
    o.updateMatrix()
    const list = byMat.get(o.material as THREE.Material) ?? []
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry // RoundedBox is non-indexed, Box/Cylinder are not
    list.push(geo.applyMatrix4(o.matrix))
    byMat.set(o.material as THREE.Material, list)
  }
  const g = new THREE.Group()
  for (const [m, geos] of byMat) {
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos)!
    if (!m.userData.ownUV) boxUV(geo)
    g.add(mesh(geo, m))
  }
  return g
}

const printCache = new Map<string, THREE.MeshStandardMaterial>()
/** A photographic print: the image spans the part's front face (own 0..1 UVs, not metre-projected). */
function print(url: string): THREE.MeshStandardMaterial {
  let m = printCache.get(url)
  if (!m) {
    const mat = (m = new THREE.MeshStandardMaterial({ color: '#b9b4ab', roughness: 0.55 }))
    mat.userData.ownUV = true
    tex(url, 1, true)
      .then((t) => {
        mat.map = t
        mat.color.set('#ffffff')
        mat.needsUpdate = true
      })
      .catch(() => {})
    printCache.set(url, m)
  }
  return m
}

// ───────────────────────────── builders ─────────────────────────────

/** Upholstered bed: channel-tufted headboard at −z, duvet, pillows, throw across the foot (+z). */
function bed(w: number): THREE.Mesh[] {
  const m = M()
  const W = w + 0.16
  const D = 2.16
  const zH = -D / 2
  const out: THREE.Mesh[] = []
  out.push(rbox(W, 1.1, 0.07, 0.02, m.upholstery, 0, 0.6, zH + 0.035)) // headboard backing, 0.05–1.15
  const n = Math.max(3, Math.round(W / 0.29))
  const cw = W / n
  for (let i = 0; i < n; i++) out.push(rbox(cw - 0.012, 0.66, 0.06, 0.028, m.upholstery, -W / 2 + cw * (i + 0.5), 0.8, zH + 0.1))
  const L = D - 0.1
  out.push(rbox(w + 0.1, 0.28, L, 0.03, m.upholstery, 0, 0.2, zH + 0.1 + L / 2)) // base 0.06–0.34
  for (const x of [-w / 2, w / 2]) for (const z of [zH + 0.2, D / 2 - 0.1]) out.push(box(0.05, 0.06, 0.05, m.dark, x, 0.03, z))
  const zm = zH + 0.13 // mattress head
  out.push(rbox(w, 0.22, 2.0, 0.05, m.mattress, 0, 0.45, zm + 1.0)) // 0.34–0.56
  const zd0 = zm + 0.55
  const zd1 = D / 2 - 0.035
  out.push(rbox(w + 0.08, 0.3, zd1 - zd0, 0.06, m.duvet, 0, 0.45, (zd0 + zd1) / 2)) // drapes to 0.30, top 0.60
  out.push(rbox(w + 0.09, 0.05, 0.3, 0.024, m.duvet, 0, 0.61, zd0 + 0.15)) // turn-down
  const sleep = w > 1.3 ? [-w / 4, w / 4] : [0]
  const pw = w > 1.3 ? 0.68 : w - 0.3
  for (const x of sleep) out.push(tilt(rbox(pw, 0.13, 0.46, 0.045, m.linen, x, 0.64, zm + 0.27), -0.35))
  const accents = w > 1.3 ? [-0.27, 0.27] : [0]
  accents.forEach((x, i) => out.push(tilt(rbox(0.44, 0.4, 0.12, 0.05, i ? m.throw : m.cushion, x, 0.74, zm + 0.52), -0.3)))
  out.push(rbox(w + 0.12, 0.03, 0.5, 0.012, m.throw, 0, 0.615, D / 2 - 0.28)) // throw on top
  out.push(rbox(w + 0.12, 0.28, 0.03, 0.012, m.throw, 0, 0.48, D / 2 - 0.015)) // throw hanging over the foot
  return out
}

/** Seat cushions top out at 0.45 m: throw_pillows_01's mountY in kit.ts sits them on it. */
function sofa(): THREE.Mesh[] {
  const m = M()
  const W = 2.2
  const D = 0.92
  const zB = -D / 2
  const inner = W - 0.4
  const out: THREE.Mesh[] = []
  for (const x of [-(W / 2 - 0.08), W / 2 - 0.08]) for (const z of [zB + 0.08, D / 2 - 0.08]) out.push(cyl(0.016, 0.12, m.oak, x, 0.06, z, 0.022))
  for (const x of [-(W / 2 - 0.1), W / 2 - 0.1]) out.push(rbox(0.2, 0.62, D, 0.06, m.sofa, x, 0.43, 0)) // arms 0.12–0.74
  out.push(rbox(inner + 0.04, 0.7, 0.2, 0.05, m.sofa, 0, 0.47, zB + 0.1)) // back frame 0.12–0.82
  out.push(rbox(inner, 0.2, D - 0.2, 0.03, m.sofa, 0, 0.22, zB + 0.2 + (D - 0.2) / 2)) // seat base
  const cw = inner / 3
  for (let i = 0; i < 3; i++) {
    const x = -inner / 2 + cw * (i + 0.5)
    out.push(rbox(cw - 0.012, 0.13, D - 0.22, 0.05, m.sofa, x, 0.385, zB + 0.21 + (D - 0.22) / 2)) // seat cushions to 0.45
    out.push(tilt(rbox(cw - 0.012, 0.4, 0.17, 0.07, m.sofa, x, 0.61, zB + 0.29), -0.1)) // back cushions
  }
  return out
}

function diningTable(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(1.6, 0.04, 0.9, 0.012, m.oak, 0, 0.73, 0), box(1.42, 0.07, 0.72, m.oak, 0, 0.675, 0)]
  for (const x of [-0.71, 0.71]) for (const z of [-0.36, 0.36]) out.push(box(0.045, 0.71, 0.045, m.blackSteel, x, 0.355, z))
  return out
}

function diningChair(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(0.47, 0.07, 0.46, 0.03, m.chair, 0, 0.435, 0.03)] // seat top 0.47
  for (const x of [-0.2, 0.2]) {
    out.push(cyl(0.013, 0.43, m.oak, x, 0.215, 0.2, 0.017)) // front legs
    out.push(box(0.03, 0.84, 0.03, m.oak, x, 0.42, -0.25)) // back posts
  }
  out.push(tilt(rbox(0.44, 0.3, 0.05, 0.02, m.chair, 0, 0.66, -0.215), -0.1))
  return out
}

function desk(): THREE.Mesh[] {
  const m = M()
  const out = [rbox(1.4, 0.03, 0.7, 0.008, m.oak, 0, 0.735, 0), box(1.29, 0.03, 0.03, m.blackSteel, 0, 0.6, -0.3)]
  for (const x of [-0.66, 0.66]) {
    for (const z of [-0.3, 0.3]) out.push(box(0.03, 0.72, 0.03, m.blackSteel, x, 0.36, z))
    for (const y of [0.015, 0.705]) out.push(box(0.03, 0.03, 0.63, m.blackSteel, x, y, 0))
  }
  return out
}

function tv(stand: boolean): THREE.Mesh[] {
  const m = M()
  if (!stand) return [box(1.23, 0.71, 0.03, m.blackGlass, 0, 0.355, 0.015), box(0.5, 0.35, 0.03, m.dark, 0, 0.355, -0.015)]
  return [
    box(1.23, 0.71, 0.03, m.blackGlass, 0, 0.425, 0), // 0.07–0.78
    box(1.1, 0.55, 0.025, m.dark, 0, 0.45, -0.027),
    rbox(0.4, 0.015, 0.24, 0.006, m.blackSteel, 0, 0.0075, 0),
    box(0.06, 0.08, 0.03, m.blackSteel, 0, 0.055, -0.02),
  ]
}

function rug(w: number, d: number, fill: THREE.Material): THREE.Mesh[] {
  const m = M()
  const out = [rbox(w, 0.012, d, 0.005, fill, 0, 0.006, 0)]
  // woven border band 6 cm inside the edge, a hair proud of the field
  const b = 0.05
  const t = 0.05
  for (const s of [-1, 1]) {
    out.push(box(w - 2 * b, 0.0125, t, m.rugBorder, 0, 0.00625, s * (d / 2 - b - t / 2)))
    out.push(box(t, 0.0125, d - 2 * b - 2 * t, m.rugBorder, s * (w / 2 - b - t / 2), 0.00625, 0))
  }
  return out
}

/** Base cabinet carcass + door + worktop; `open` leaves the top 0.2 m hollow for a sink bowl. */
function base(open = false, door = true): THREE.Mesh[] {
  const m = M()
  const out = [box(0.6, 0.1, 0.54, m.dark, 0, 0.05, -0.02)] // recessed plinth
  out.push(open ? box(0.6, 0.56, 0.56, m.oak, 0, 0.38, -0.03) : box(0.6, 0.76, 0.56, m.oak, 0, 0.48, -0.03))
  if (open) for (const x of [-0.291, 0.291]) out.push(box(0.018, 0.2, 0.56, m.oak, x, 0.76, -0.03))
  if (door) {
    out.push(box(0.594, 0.74, 0.02, m.oak, 0, 0.48, 0.26)) // door, 3 mm shadow gaps to the next module
    out.push(box(0.3, 0.012, 0.02, m.steel, 0, 0.8, 0.28)) // bar handle
  }
  return out
}

function counter(): THREE.Mesh[] {
  return [...base(), box(0.6, 0.04, 0.62, M().stone, 0, 0.88, 0)]
}

function sink(): THREE.Mesh[] {
  const m = M()
  const out = base(true)
  // worktop around a 0.44 × 0.36 hole (hole centre z = 0.03)
  out.push(box(0.08, 0.04, 0.62, m.stone, -0.26, 0.88, 0), box(0.08, 0.04, 0.62, m.stone, 0.26, 0.88, 0))
  out.push(box(0.44, 0.04, 0.16, m.stone, 0, 0.88, -0.23), box(0.44, 0.04, 0.1, m.stone, 0, 0.88, 0.26))
  // steel bowl: floor + four walls, 0.2 deep, a thin rim on the worktop
  out.push(box(0.44, 0.01, 0.36, m.steel, 0, 0.705, 0.03))
  for (const s of [-1, 1]) {
    out.push(box(0.01, 0.2, 0.36, m.steel, s * 0.215, 0.8, 0.03), box(0.44, 0.2, 0.01, m.steel, 0, 0.8, 0.03 + s * 0.175))
    out.push(box(0.48, 0.004, 0.02, m.steel, 0, 0.902, 0.03 + s * 0.19), box(0.02, 0.004, 0.36, m.steel, s * 0.23, 0.902, 0.03))
  }
  out.push(cyl(0.03, 0.004, m.dark, 0, 0.712, 0.03))
  // gooseneck-ish mixer
  out.push(cyl(0.025, 0.04, m.steel, 0, 0.92, -0.22), cyl(0.012, 0.26, m.steel, 0, 1.05, -0.22))
  out.push(box(0.024, 0.024, 0.2, m.steel, 0, 1.18, -0.13), cyl(0.012, 0.06, m.steel, 0, 1.15, -0.04))
  return out
}

function hob(): THREE.Mesh[] {
  const m = M()
  const out = base(false, false)
  out.push(box(0.594, 0.12, 0.02, m.oak, 0, 0.79, 0.26), box(0.3, 0.012, 0.02, m.steel, 0, 0.77, 0.28)) // drawer
  out.push(box(0.594, 0.6, 0.02, m.blackGlass, 0, 0.42, 0.26), box(0.46, 0.015, 0.03, m.steel, 0, 0.66, 0.285)) // oven
  out.push(box(0.6, 0.04, 0.62, m.stone, 0, 0.88, 0))
  out.push(box(0.56, 0.008, 0.5, m.blackGlass, 0, 0.904, 0))
  for (const [x, z, r] of [[-0.14, -0.12, 0.1], [0.14, -0.12, 0.08], [-0.14, 0.12, 0.08], [0.14, 0.12, 0.1]])
    out.push(cyl(r, 0.002, m.ring, x, 0.909, z))
  return out
}

/** Wall cabinet 1.45–2.15 m over a stone splashback from the worktop; built from y = 0 = worktop. */
function upper(): THREE.Mesh[] {
  const m = M()
  return [
    box(0.6, 0.55, 0.012, m.stone, 0, 0.275, -0.169),
    box(0.6, 0.7, 0.33, m.oak, 0, 0.9, -0.01),
    box(0.594, 0.69, 0.02, m.oak, 0, 0.9, 0.165),
    box(0.3, 0.012, 0.02, m.steel, 0, 0.58, 0.185),
    box(0.56, 0.005, 0.02, m.led, 0, 0.548, 0.12), // under-cabinet LED strip
  ]
}

function hood(): THREE.Mesh[] {
  const m = M()
  return [
    box(0.6, 0.7, 0.012, m.stone, 0, 0.35, -0.244),
    box(0.6, 0.08, 0.5, m.hoodSteel, 0, 0.74, 0), // canopy 1.6–1.68 m
    box(0.26, 0.47, 0.24, m.hoodSteel, 0, 1.015, -0.13), // chimney to 2.15 m
  ]
}

function fridge(): THREE.Mesh[] {
  const m = M()
  return [
    rbox(0.7, 1.8, 0.7, 0.015, m.fridge, 0, 0.9, 0),
    box(0.66, 0.006, 0.01, m.dark, 0, 1.2, 0.35), // freezer / fridge seam
    box(0.02, 0.5, 0.025, m.steel, -0.28, 0.85, 0.365),
    box(0.02, 0.35, 0.025, m.steel, -0.28, 1.45, 0.365),
  ]
}

/** Wall-hung bowl + in-wall cistern flush plate; y = 0 is the bowl's underside (mountY 0.2). */
function toilet(): THREE.Mesh[] {
  const m = M()
  return [
    rbox(0.3, 0.12, 0.44, 0.06, m.ceramic, 0, 0.06, -0.04),
    rbox(0.37, 0.13, 0.54, 0.06, m.ceramic, 0, 0.145, 0),
    rbox(0.37, 0.03, 0.46, 0.015, m.ceramic, 0, 0.225, 0.03), // seat + lid, top 0.44 m
    box(0.24, 0.16, 0.012, m.ceramic, 0, 0.85, -0.264), // flush plate 0.97–1.13 m
    box(0.1, 0.12, 0.006, m.steel, -0.055, 0.85, -0.255),
    box(0.1, 0.12, 0.006, m.steel, 0.055, 0.85, -0.255),
  ]
}

/** Floating oak vanity, stone top, vessel basin, tall mixer, frameless mirror; y = 0 is the cabinet underside (mountY 0.45). */
function vanity(): THREE.Mesh[] {
  const m = M()
  const bowl = cyl(0.14, 0.13, m.ceramicIn, 0, 0.465, 0.03, 0.2, true)
  bowl.scale.z = 0.8
  const inside = cyl(0.14, 0.004, m.ceramic, 0, 0.405, 0.03)
  inside.scale.z = 0.8
  return [
    box(0.8, 0.36, 0.46, m.oak, 0, 0.18, -0.02),
    box(0.8, 0.012, 0.005, m.dark, 0, 0.3, 0.212), // finger-pull groove
    rbox(0.8, 0.04, 0.5, 0.008, m.stone, 0, 0.38, 0), // top 0.81–0.85 m
    bowl,
    inside,
    cyl(0.014, 0.32, m.steel, 0, 0.56, -0.18),
    box(0.024, 0.024, 0.15, m.steel, 0, 0.71, -0.115),
    box(0.72, 0.82, 0.008, m.dark, 0, 1.09, -0.246),
    box(0.7, 0.8, 0.008, m.mirror, 0, 1.09, -0.238), // mirror 1.14–1.94 m
  ]
}

function basin(): THREE.Mesh[] {
  const m = M()
  const bowl = cyl(0.2, 0.13, m.ceramic, 0, 0.72 + 0.065, 0, 0.25)
  bowl.scale.z = 0.9
  return [
    cyl(0.1, 0.72, m.ceramic, 0, 0.36, -0.03, 0.08),
    bowl,
    cyl(0.012, 0.12, m.steel, 0, 0.85 + 0.06, -0.17),
    box(0.024, 0.02, 0.1, m.steel, 0, 0.96, -0.12),
  ]
}

/** Shower tray in a corner: the wall corner is at local (−x, −z); fixed glass along +x; rain head on the back wall. */
function shower(): THREE.Mesh[] {
  const m = M()
  return [
    rbox(0.9, 0.04, 0.9, 0.01, m.ceramic, 0, 0.02, 0),
    box(0.5, 0.004, 0.05, m.steel, 0, 0.041, 0.36), // linear drain
    box(0.008, 1.95, 0.88, m.glass, 0.446, 1.015, 0.01),
    box(0.02, 1.95, 0.02, m.steel, 0.446, 1.015, -0.44), // wall channel
    box(0.02, 0.02, 0.32, m.steel, 0, 2.03, -0.29), // arm 2.02–2.04 m
    cyl(0.11, 0.012, m.steel, 0, 2.01, -0.15), // rain head
    box(0.14, 0.14, 0.012, m.steel, 0, 1.1, -0.444),
    box(0.02, 0.02, 0.08, m.steel, 0.03, 1.1, -0.4),
  ]
}

/** 0.5 × 0.7 oak frame, white mat, 5:7 print; back at z = −0.015, y = 0 is the frame's bottom (mountY). */
function artFrame(url: string): THREE.Mesh[] {
  const m = M()
  const W = 0.5
  const H = 0.7
  const b = 0.025 // moulding
  return [
    box(W, b, 0.03, m.oak, 0, b / 2, 0),
    box(W, b, 0.03, m.oak, 0, H - b / 2, 0),
    box(b, H - 2 * b, 0.03, m.oak, -W / 2 + b / 2, H / 2, 0),
    box(b, H - 2 * b, 0.03, m.oak, W / 2 - b / 2, H / 2, 0),
    box(W - 2 * b, H - 2 * b, 0.01, m.mat, 0, H / 2, -0.005),
    box(0.34, 0.476, 0.002, print(url), 0, H / 2 + 0.01, 0.001),
  ]
}

function wardrobe(): THREE.Mesh[] {
  const m = M()
  const out = [box(1.8, 2.14, 0.58, m.oak, 0, 1.13, -0.01), box(1.76, 0.06, 0.52, m.dark, 0, 0.03, -0.02)]
  for (const x of [-0.6, 0, 0.6]) out.push(box(0.596, 2.12, 0.02, m.oak, x, 1.13, 0.29))
  for (const x of [-0.33, -0.27, 0.33]) out.push(box(0.012, 0.6, 0.02, m.steel, x, 1.1, 0.31))
  return out
}

const BUILDERS: Record<string, () => THREE.Mesh[]> = {
  bed_queen: () => bed(1.6),
  bed_single: () => bed(1.0),
  sofa_3seat: sofa,
  dining_table: diningTable,
  dining_chair: diningChair,
  desk_oak: desk,
  tv_55: () => tv(true),
  tv_55_wall: () => tv(false),
  rug_rect_large: () => rug(3.0, 2.0, M().rugIvory),
  rug_rect_small: () => rug(2.3, 1.6, M().rugOat),
  rug_round: () => [cyl(1.0, 0.012, M().rugStone, 0, 0.006, 0)],
  kitchen_counter: counter,
  kitchen_sink: sink,
  kitchen_hob: hob,
  kitchen_upper: upper,
  kitchen_hood: hood,
  fridge,
  toilet,
  vanity,
  basin,
  shower_screen: shower,
  wardrobe_tall: wardrobe,
  ...Object.fromEntries(ART.map((id) => [id, () => artFrame(`/assets/art/${id}.jpg`)])),
}

export function buildProcedural(id: string): THREE.Group | null {
  const parts = BUILDERS[id]?.()
  return parts ? finish(parts) : null
}
