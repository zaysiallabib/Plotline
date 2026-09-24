/**
 * Procedural assets Poly Haven lacks (beds, bath fixtures, fridge, counters,
 * a tall wardrobe) from three primitives with PBR-ish materials. Metadata
 * (sizes, ids) is in procedural.meta.ts so presets/tests never import three.
 * Every builder returns a Group grounded at y = 0, centred in xz, front = +z.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { TEXTURES } from './textures'

export { PROCEDURAL } from './procedural.meta'

const texLoader = new THREE.TextureLoader()
function albedo(textureId: string, repeat: number): THREE.Texture | null {
  const set = TEXTURES[textureId]
  if (!set) return null
  const t = texLoader.load(set.albedo)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  return t
}

// one material per kind, shared by every instance
let mats: Record<'oak' | 'stone' | 'fabric' | 'duvet' | 'pillow' | 'ceramic' | 'steel' | 'dark', THREE.MeshStandardMaterial> | null = null
function M() {
  if (mats) return mats
  const oakMap = albedo('wood_floor_oak', 0.5)
  const stoneMap = albedo('marble_floor_white', 0.7)
  mats = {
    oak: new THREE.MeshStandardMaterial({ color: oakMap ? '#d9c4a4' : '#a07850', map: oakMap, roughness: 0.6 }),
    stone: new THREE.MeshStandardMaterial({ color: stoneMap ? '#ffffff' : '#e6e2da', map: stoneMap, roughness: 0.25 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#7d8a92', roughness: 0.9 }),
    duvet: new THREE.MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.92 }),
    pillow: new THREE.MeshStandardMaterial({ color: '#f1f0ec', roughness: 0.9 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c9cbcd', metalness: 0.8, roughness: 0.35 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6 }),
  }
  return mats
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(geo, m)
  o.position.set(x, y, z)
  o.castShadow = o.receiveShadow = true
  return o
}
/** Box of w × h × d with its CENTRE at (x, y, z). */
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z)
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 4, r), m, x, y, z)
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, rTop = r) =>
  mesh(new THREE.CylinderGeometry(rTop, r, h, 32), m, x, y, z)

/** Platform bed: headboard at −z, foot (front) at +z. Total depth 2.1 (2.0 + headboard). */
function bed(w: number): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  const L = 2.0
  const z0 = -1.05 + 0.08 // mattress starts after the 8 cm headboard
  const zc = z0 + L / 2
  g.add(box(w + 0.1, 1.0, 0.08, m.oak, 0, 0.5, -1.05 + 0.04)) // headboard frame
  g.add(rbox(w - 0.02, 0.5, 0.06, 0.02, m.fabric, 0, 0.7, -1.05 + 0.09)) // padded panel
  g.add(box(w + 0.06, 0.25, L + 0.04, m.oak, 0, 0.125, zc)) // platform
  g.add(rbox(w, 0.22, L, 0.03, m.pillow, 0, 0.25 + 0.11, zc)) // mattress
  g.add(rbox(w + 0.04, 0.08, L - 0.55, 0.03, m.duvet, 0, 0.47 + 0.04, zc + 0.3)) // duvet
  const pw = w > 1.3 ? 0.62 : w - 0.2
  for (const x of w > 1.3 ? [-w / 4, w / 4] : [0]) g.add(rbox(pw, 0.13, 0.42, 0.05, m.pillow, x, 0.47 + 0.065, z0 + 0.3))
  return g
}

function counter(): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  g.add(box(1.0, 0.08, 0.5, m.dark, 0, 0.04, -0.04)) // plinth (recessed toe kick)
  g.add(box(1.0, 0.78, 0.58, m.oak, 0, 0.08 + 0.39, 0)) // cabinet
  g.add(box(0.005, 0.72, 0.01, m.dark, 0, 0.5, 0.29)) // door seam
  for (const x of [-0.18, 0.18]) g.add(box(0.12, 0.012, 0.012, m.steel, x, 0.78, 0.3)) // handles
  g.add(box(1.02, 0.04, 0.62, m.stone, 0, 0.88, 0.01)) // stone top
  return g
}

function fridge(): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  g.add(rbox(0.7, 1.8, 0.7, 0.015, m.steel, 0, 0.9, 0))
  g.add(box(0.66, 0.006, 0.01, m.dark, 0, 1.2, 0.35)) // freezer / fridge seam
  g.add(box(0.02, 0.5, 0.025, m.steel, -0.28, 0.85, 0.365)) // door handle
  g.add(box(0.02, 0.35, 0.025, m.steel, -0.28, 1.45, 0.365)) // freezer handle
  return g
}

function toilet(): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  g.add(box(0.4, 0.35, 0.18, m.ceramic, 0, 0.4 + 0.175, -0.26)) // tank
  g.add(box(0.05, 0.02, 0.05, m.steel, 0.12, 0.76, -0.26)) // flush button
  g.add(rbox(0.36, 0.4, 0.5, 0.05, m.ceramic, 0, 0.2, 0.0)) // base
  const seat = cyl(0.19, 0.06, m.ceramic, 0, 0.42, 0.07)
  seat.scale.z = 1.25
  g.add(seat)
  return g
}

function basin(): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  g.add(cyl(0.1, 0.72, m.ceramic, 0, 0.36, -0.03, 0.08)) // pedestal
  const bowl = cyl(0.2, 0.13, m.ceramic, 0, 0.72 + 0.065, 0, 0.25)
  bowl.scale.z = 0.9
  g.add(bowl)
  g.add(cyl(0.012, 0.12, m.steel, 0, 0.85 + 0.06, -0.17)) // tap
  g.add(box(0.024, 0.02, 0.1, m.steel, 0, 0.96, -0.12))
  return g
}

function wardrobe(): THREE.Group {
  const m = M()
  const g = new THREE.Group()
  g.add(box(1.8, 2.2, 0.6, m.oak, 0, 1.1, 0))
  g.add(box(0.006, 2.1, 0.01, m.dark, 0, 1.1, 0.3)) // centre seam
  for (const x of [-0.88, 0.88]) g.add(box(0.006, 2.1, 0.01, m.dark, x, 1.1, 0.3)) // door edges
  for (const x of [-0.06, 0.06]) g.add(box(0.015, 0.25, 0.02, m.steel, x, 1.05, 0.31)) // handles
  g.add(box(1.8, 0.06, 0.55, m.dark, 0, 0.03, -0.02)) // plinth
  return g
}

const BUILDERS: Record<string, () => THREE.Group> = {
  bed_queen: () => bed(1.6),
  bed_single: () => bed(1.0),
  kitchen_counter: counter,
  fridge,
  toilet,
  basin,
  wardrobe_tall: wardrobe,
}

export function buildProcedural(id: string): THREE.Group | null {
  return BUILDERS[id]?.() ?? null
}
