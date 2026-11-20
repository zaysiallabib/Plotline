/**
 * Lite and Low (render.ts TIERS.batch): a group's meshes drawn as one mesh per material. Type-a's walls, floors, ceilings,
 * skirtings, door frames and furniture are ~600 meshes in ~80 materials — ~310 draw calls a frame, each paid for on the
 * CPU (Firefox sends every one to its graphics process). The meshes themselves stay where they are, moved to the HIDDEN
 * layer: the camera never draws it, the raycasters pick it — so picking, finishes, comments and Arrange see the same
 * objects as before. PlotlineScene drops a group's batches the moment anything in it changes and batches it again once
 * it has settled.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** the layer a batched mesh moves to: never drawn, still picked (PlotlineScene's and xr.ts's raycasters enable it) */
export const HIDDEN = 30

/**
 * The furniture's batches hold one CELL_M × CELL_M square of the plan each (by each piece's middle), so the pieces behind
 * the camera are still left out: one batch per material for the whole flat drew every scanned sofa every frame (type-a:
 * 114k → 292k triangles a frame). The walls and floors are light enough to batch whole (cell Infinity).
 */
export const CELL_M = 8

const noop = (): void => {}
const centre = new THREE.Vector3()

/** a mesh that may join a batch: plain, opaque, drawn as it is (no mirror pass, no skinning, no morphs, no own layer or depth material) */
function plain(m: THREE.Mesh): boolean {
  const g = m.geometry
  const mats = [m.material].flat()
  return (
    !(m as THREE.InstancedMesh).isInstancedMesh &&
    !(m as THREE.SkinnedMesh).isSkinnedMesh &&
    !m.morphTargetInfluences &&
    m.layers.mask === 1 &&
    m.renderOrder === 0 &&
    m.onBeforeRender === THREE.Object3D.prototype.onBeforeRender &&
    !m.customDepthMaterial &&
    !m.customDistanceMaterial &&
    !!g.attributes.position?.count &&
    !Object.keys(g.morphAttributes).length &&
    g.drawRange.start === 0 &&
    g.drawRange.count === Infinity &&
    mats.every((x) => x && x.visible && !x.transparent)
  )
}

/**
 * Triangles start … start + count of `g` (index order) as their own geometry: only the vertices they use, every
 * attribute as plain floats, through `matrix` (winding kept when it mirrors).
 */
function part(g: THREE.BufferGeometry, start: number, count: number, matrix: THREE.Matrix4, names: string[]): THREE.BufferGeometry {
  const ids = new Map<number, number>()
  const index: number[] = []
  for (let i = start; i < start + count; i++) {
    const v = g.index ? g.index.getX(i) : i
    let n = ids.get(v)
    if (n === undefined) ids.set(v, (n = ids.size))
    index.push(n)
  }
  const out = new THREE.BufferGeometry()
  for (const name of names) {
    const a = g.getAttribute(name)
    const arr = new Float32Array(ids.size * a.itemSize)
    for (const [v, n] of ids) for (let k = 0; k < a.itemSize; k++) arr[n * a.itemSize + k] = a.getComponent(v, k)
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize))
  }
  if (matrix.determinant() < 0) for (let i = 0; i + 2 < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
  out.setIndex(index)
  return out.applyMatrix4(matrix)
}

/**
 * Every visible plain mesh under `root` into one mesh per material (and shadow flags and attribute set), added to `root`
 * in its frame; the meshes batched move to HIDDEN. Returns the batches.
 */
export function batch(root: THREE.Object3D, cellM = CELL_M): THREE.Mesh[] {
  root.updateMatrixWorld(true)
  const inv = root.matrixWorld.clone().invert()
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }>()
  const moved: THREE.Mesh[] = []
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.batch || !plain(m)) return
    const g = m.geometry
    const total = (g.index ?? g.attributes.position).count
    const mats = [m.material].flat()
    const ranges = Array.isArray(m.material) ? g.groups.map((r) => [r.start, Math.min(r.count, total - r.start), r.materialIndex ?? 0]) : [[0, total, 0]]
    if (ranges.some(([, , i]) => !mats[i])) return
    const matrix = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)
    const names = Object.keys(g.attributes).sort()
    if (!g.boundingSphere) g.computeBoundingSphere()
    centre.copy(g.boundingSphere!.center).applyMatrix4(matrix)
    const sig = `${names.map((n) => `${n}${g.attributes[n].itemSize}`).join()}|${Math.floor(centre.x / cellM) || 0},${Math.floor(centre.z / cellM) || 0}`
    for (const [start, count, i] of ranges) {
      if (count < 3) continue
      const mat = mats[i]
      const key = `${mat.uuid}|${m.castShadow}|${m.receiveShadow}|${sig}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, receive: m.receiveShadow, parts: [] }))
      b.parts.push(part(g, start, count, matrix, names))
    }
    moved.push(m)
  })
  const out: THREE.Mesh[] = []
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.parts)!, b.mat)
    b.parts.forEach((p) => p.dispose())
    Object.assign(mesh, { castShadow: b.cast, receiveShadow: b.receive, raycast: noop })
    mesh.userData.batch = true
    out.push(mesh)
  }
  for (const m of moved) m.layers.set(HIDDEN)
  if (out.length) root.add(...out)
  return out
}

/** `root`'s batches gone, its meshes drawn one by one again. */
export function unbatch(root: THREE.Object3D): void {
  for (const c of [...root.children]) {
    if (!c.userData.batch) continue
    c.removeFromParent()
    ;(c as THREE.Mesh).geometry.dispose()
  }
  root.traverse((o) => {
    if (o.layers.mask === 1 << HIDDEN) o.layers.set(0)
  })
}
