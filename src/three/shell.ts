/**
 * The architect's outside shape (core Shell, src/import): the GLB kept in this browser (studio/shells.ts) as a group
 * placed in the unit's frame — moved by `offset`, turned by `rotDeg` (clockwise in plan), lowered by `baseY` so the
 * unit's floor datum sits at world Y = 0. Materials as they came, front faces only, shadows both ways, the scene's own
 * environment; drawn a hair behind everything else (polygonOffset 1 / 1) so the unit's own exterior walls, which lie in
 * the same planes, win instead of z-fighting. One parsed model is kept (the last id); the scene gets a clone of it.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Shell } from '../core'
import { WINDOW } from '../import/glb'
import { getShell } from '../studio/shells'

/** more triangles than this and the lite tier leaves the shape out */
export const LITE_MAX_TRIANGLES = 500_000

let cached: { id: string; group: THREE.Group; materials: THREE.Material[] } | null = null
let pending: { id: string; p: Promise<void> } | null = null

/** The shell's model as a group in the unit's frame, or null when this browser no longer holds its GLB. */
export async function loadShell(shell: Shell, clip?: THREE.Plane): Promise<THREE.Group | null> {
  if (cached?.id !== shell.id) {
    if (pending?.id !== shell.id) {
      pending = {
        id: shell.id,
        p: (async () => {
          const glb = await getShell(shell.id)
          if (!glb) return
          const gltf = await new GLTFLoader().parseAsync(glb, '')
          dispose()
          const seen = new Map<THREE.Material, THREE.Material>()
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh
            if (!m.isMesh) return
            m.castShadow = m.receiveShadow = true
            const mats = Array.isArray(m.material) ? m.material : [m.material]
            const out = mats.map((mat) => {
              let c = seen.get(mat)
              if (!c) {
                c = mat.clone()
                c.side = THREE.FrontSide
                c.polygonOffset = true
                c.polygonOffsetFactor = 1
                c.polygonOffsetUnits = 1
                seen.set(mat, c)
              }
              return c
            })
            m.material = Array.isArray(m.material) ? out : out[0]
          })
          cached = { id: shell.id, group: gltf.scene, materials: [...seen.values()] }
        })(),
      }
    }
    await pending.p
    if (cached?.id !== shell.id) return null
  }
  for (const m of cached.materials) m.clippingPlanes = clip ? [clip] : null
  const g = new THREE.Group()
  g.name = 'shell'
  g.add(cached.group.clone())
  if (shell.glass === 'opaque') solidWindowsOut(g)
  place(g, shell)
  return g
}

/**
 * The file's windows (their GLB material named WINDOW) left out of the shape: their glass came solid, so the tower draws its
 * own glass in the flats' window openings, the rooms behind it (three/building.ts, core Shell.glass). Returns how many.
 */
export function solidWindowsOut(g: THREE.Object3D): number {
  let n = 0
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && [m.material].flat().some((x) => x.name === WINDOW)) (m.visible = false), n++
  })
  return n
}

/** Where the shell stands: by its offset, turn and floor height (also after the Studio changes one). */
export function place(g: THREE.Object3D, shell: Shell): void {
  g.position.set(shell.offset?.x ?? 0, -shell.baseY, shell.offset?.y ?? 0)
  g.rotation.y = (-(shell.rotDeg ?? 0) * Math.PI) / 180 // clockwise on the plan (y down the page)
}

/** Frees the kept model (its geometries and the cloned materials). */
export function dispose(): void {
  cached?.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
  cached?.materials.forEach((m) => m.dispose())
  cached = null
}
