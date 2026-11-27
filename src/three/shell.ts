/**
 * The architect's outside shape (core Shell, src/import): the GLB kept in this browser (studio/shells.ts) as a group
 * placed in the unit's frame — moved by `offset`, turned by `rotDeg` (clockwise in plan), lowered by `baseY` so the
 * unit's floor datum sits at world Y = 0. Materials as they came, front faces only, shadows both ways, the scene's own
 * environment; drawn a hair behind everything else (polygonOffset 1 / 1) so the unit's own exterior walls, which lie in
 * the same planes, win instead of z-fighting. One parsed model is kept (the last id); the scene gets a clone of it.
 * Its dressed surfaces (an IFC's outer walls, roof and frames, named for the option their materials say: import/glb.ts
 * dressName) wear Plotline's own pictures (dressShell).
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { MaterialRef, Shell } from '../core'
import { FRAMES_SLOT, OUTSIDE_SLOT, ROOF_COVERINGS } from '../furnish/finishes'
import { WINDOW, parseDress } from '../import/glb'
import { getShell } from '../studio/shells'
import { materialFor } from './materials'

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
    if (m.isMesh && [m.material].flat().some((x) => x.name === WINDOW || parseDress(x.name)?.slot === 'frame')) (m.visible = false), n++
  })
  return n
}

/** a dressed surface's option among Plotline's own (the outside finishes, frames, roof coverings) */
const OPTIONS = new Map([...OUTSIDE_SLOT.options, ...FRAMES_SLOT.options, ...ROOF_COVERINGS.flat, ...ROOF_COVERINGS.pitched].map((o) => [o.id, o.material]))
export type Dress = NonNullable<ReturnType<typeof parseDress>>

/**
 * The shape's dressed surfaces in Plotline's own materials (three/materials.ts, the tower's outside variant, a copy of its own
 * so the Dollhouse cut `clip` stays its own): `choose` first — the building's choice for a surface that is its own (`main`:
 * the outside finish, the frames, the roof's covering as staff set them) — else the option its file's names said. A surface
 * with neither keeps the file's colour. Again after each change of the building's outside (PlotlineScene). Returns how many.
 */
export function dressShell(g: THREE.Object3D, choose: (d: Dress) => MaterialRef | null = () => null, clip?: THREE.Plane, at?: (p: THREE.Vector3) => MaterialRef | null): number {
  let n = 0
  const shellMat = (ref: MaterialRef) => {
    const mat = materialFor(ref, true, false, true, false, 'shell')
    mat.clippingPlanes = clip ? [clip] : null
    return mat
  }
  if (at) g.updateMatrixWorld(true)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const file = (m.userData.fileMaterial ??= m.material) as THREE.Material
    const d = parseDress(file.name)
    if (!d) return
    const ref = choose(d) ?? OPTIONS.get(d.option)
    const split = at && d.slot === 'out' && d.main ? wallByWall(m, at, ref) : null
    if (split) return void ((m.material = split.map(shellMat)), n++)
    unsplit(m)
    if (!ref) return void (m.material = file)
    m.material = shellMat(ref)
    n++
  })
  return n
}

/** a dressed surface split a wall at a time (wallByWall) back as the file gave it: one material, its index as read */
function unsplit(m: THREE.Mesh): void {
  const g = m.geometry
  const index0 = g.userData.index0 as ArrayLike<number> | undefined
  if (!index0 || !g.groups.length) return
  g.clearGroups()
  ;(g.index!.array as Uint32Array).set(index0)
  g.index!.needsUpdate = true
}

/**
 * The building's own outside on an architect's shape, a wall and a floor at a time (session 31 outside2: ifcmap dressed only
 * the building's default): each upright triangle of mesh `m` wears what `at` says at its middle in the scene (the floor's and
 * the wall's choice, else the building's: Building.outsideAt) — its index rearranged into one run per material, as Look's slab
 * (render.ts edgeGroups); a flat or sloped one (a sill, a soffit) the building's (`base`). Looked up once per 40 cm cell.
 * Null: every triangle the same (one material, as before).
 */
function wallByWall(m: THREE.Mesh, at: (p: THREE.Vector3) => MaterialRef | null, base: MaterialRef | null | undefined): MaterialRef[] | null {
  const g = m.geometry
  const pos = g.attributes.position
  if (!g.index) g.setIndex([...Array(pos.count).keys()])
  const index0 = (g.userData.index0 ??= Array.from(g.index!.array)) as number[]
  const [a, b, c, e1, e2, mid] = [0, 0, 0, 0, 0, 0].map(() => new THREE.Vector3())
  const cells = new Map<string, MaterialRef | null>()
  const by = new Map<MaterialRef | null, number[]>()
  for (let t = 0; t + 2 < index0.length; t += 3) {
    a.fromBufferAttribute(pos, index0[t]).applyMatrix4(m.matrixWorld)
    b.fromBufferAttribute(pos, index0[t + 1]).applyMatrix4(m.matrixWorld)
    c.fromBufferAttribute(pos, index0[t + 2]).applyMatrix4(m.matrixWorld)
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a))
    const upright = Math.abs(n.y) < 0.7 * n.length()
    mid.copy(a).add(b).add(c).divideScalar(3)
    let r: MaterialRef | null = base ?? null
    if (upright) {
      const key = `${Math.round(mid.x / 0.4)},${Math.round(mid.y / 0.4)},${Math.round(mid.z / 0.4)}`
      if (!cells.has(key)) cells.set(key, at(mid))
      r = cells.get(key) ?? base ?? null
    }
    const l = by.get(r) ?? by.set(r, []).get(r)!
    l.push(index0[t], index0[t + 1], index0[t + 2])
  }
  if (by.size < 2 || [...by.keys()].some((r) => !r)) return null
  const out = g.index!.array as Uint32Array | Uint16Array
  let i = 0
  g.clearGroups()
  const refs: MaterialRef[] = []
  for (const [r, list] of by) {
    g.addGroup(i, list.length, refs.length)
    out.set(list, i)
    i += list.length
    refs.push(r!)
  }
  g.index!.needsUpdate = true
  return refs
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
