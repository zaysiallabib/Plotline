/**
 * Furniture loading: glTF via GLTFLoader, one network load per URL, cloned
 * per placement. Unknown asset / failed load → grey placeholder box so the
 * layout still reads.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import type { FurniturePlacement } from '../core'
import { kitAsset, objectKind, placementLabel, rebuildsAtSize } from '../furnish/kit'
import { buildProcedural, lean, lite } from '../furnish/procedural'

const loader = new GLTFLoader()
// Lite: the models' pictures decoded at half their 1k size (createImageBitmap's resize; where a browser ignores it, three
// halves them on upload — PlotlineScene's maxTextureSize). Most of a model's memory is its four 1k maps.
loader.register((parser) => {
  const t = parser.textureLoader as THREE.ImageBitmapLoader
  if (lite.on && t.isImageBitmapLoader) t.setOptions({ ...t.options, resizeWidth: 512, resizeHeight: 512, resizeQuality: 'medium' })
  return { name: 'plotline_lite' }
})
const gltfCache = new Map<string, Promise<THREE.Group>>()
const warned = new Set<string>()

function loadModel(url: string): Promise<THREE.Group> {
  let p = gltfCache.get(url)
  if (!p) {
    p = loader.loadAsync(url).then((g) => (lite.on ? colourOnly(plainGlass(g.scene)) : plainGlass(g.scene)))
    gltfCache.set(url, p)
  }
  return p
}

const triangles = (g: THREE.BufferGeometry): number => (g.index ?? g.attributes.position).count / 3
const standIns = new Map<string, Promise<THREE.Group>>()
const simplifier = new SimplifyModifier()
/** a part this small keeps its own triangles: a knob, a leg's foot (cutting it would only make holes) */
const SMALL_PART = 64

/**
 * A model with about `tris` triangles at most (session 31 perf: a scanned sofa is 20–60 thousand; where it is seen from a
 * street or on Lite, hundreds read the same): meshoptimizer through three's SimplifyModifier collapses the edges where the
 * shape, its normals and its picture's seams move least; every part cut by the same share, a small part kept whole. Made once
 * per model and budget when the model first loads, kept beside it in this page (every piece of that model shares it). A model
 * already within the budget is the model.
 */
export function standIn(url: string, tris: number): Promise<THREE.Group> {
  const key = `${url}|${tris}`
  let p = standIns.get(key)
  if (!p) {
    p = loadModel(url).then((g) => simplified(g, tris))
    standIns.set(key, p)
  }
  return p
}

/** standIn's work on a loaded model: a clone with its parts simplified (their materials shared), or the model itself if within `tris`. */
export async function simplified<T extends THREE.Object3D>(g: T, tris: number): Promise<T> {
  const meshes: THREE.Mesh[] = []
  g.traverse((o) => void ((o as THREE.Mesh).isMesh && meshes.push(o as THREE.Mesh)))
  const n = meshes.reduce((a, m) => a + triangles(m.geometry), 0)
  if (n <= tris) return g
  const c = g.clone()
  const parts: THREE.Mesh[] = []
  c.traverse((o) => void ((o as THREE.Mesh).isMesh && parts.push(o as THREE.Mesh)))
  for (const m of parts) {
    const t = triangles(m.geometry)
    if (t < SMALL_PART || m.geometry.groups.length) continue
    const geo = m.geometry.index ? m.geometry : mergeVertices(m.geometry)
    const keep = Math.max(SMALL_PART / 4, Math.round((t * tris) / n))
    m.geometry = await simplifier.modify(geo, Math.round(geo.attributes.position.count * (1 - keep / t)))
  }
  return c
}

/**
 * Every model these pieces need, downloaded and decoded (a stair's next floor waits on this while the floor it leaves stays
 * on screen): buildFurniture then takes them from the cache in the same moment, so the new floor shows whole, not piece by
 * piece. A model that fails is left to buildFurniture's placeholder.
 */
export const preloadModels = (ps: FurniturePlacement[]): Promise<unknown> =>
  Promise.all(
    [...new Set(ps.flatMap((p) => kitAsset(p.assetId) ?? []).filter((a) => !a.url.startsWith('procedural:') && !(lean.on && a.category === 'plant')))].map((a) =>
      loadModel(a.url).catch(() => null),
    ),
  )

/**
 * A scan's see-through glass (KHR_materials_transmission: the wall clock's face) as plain glass, once per model: while one
 * transmissive surface is in view three draws everything opaque a second time each frame for its refraction picture — the
 * whole flat, and the tower round it in the Building view, twice for a clock face (session 31 glow: 2 draws of every
 * mesh on every tier). The walk's panes made the same choice (openings.ts GLASS).
 */
export function plainGlass<T extends THREE.Object3D>(model: T): T {
  model.traverse((o) => {
    for (const m of [(o as THREE.Mesh).material ?? []].flat() as THREE.MeshPhysicalMaterial[]) {
      if (!(m.transmission > 0)) continue
      Object.assign(m, { transmission: 0, transparent: true, opacity: Math.min(m.opacity, 0.15), depthWrite: false })
      m.needsUpdate = true
    }
  })
  return model
}

/**
 * Lite (three/materials.ts lite): a model's colour picture only, once per model (its clones share its materials) — its relief,
 * ambient-occlusion, roughness and metal pictures left off (never uploaded; the decoded pictures go with the garbage): its
 * roughness the material's own number, no metal (a scan's metal picture marks a chrome foot or a handle: a dull grey on Lite).
 * A scan's "physical" material (sheen, clearcoat: its own shader program) becomes a standard one with the same colour and
 * picture, and its see-through glass is drawn from the front only (two-sided glass is two programs and two draws): Lite's
 * furniture shares the rooms' few programs.
 */
export function colourOnly<T extends THREE.Object3D>(model: T): T {
  const plain = new Map<THREE.Material, THREE.MeshStandardMaterial>()
  const standard = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    if (!(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return m
    let s = plain.get(m)
    if (!s) {
      s = new THREE.MeshStandardMaterial().copy(m) // the standard half of it: colour, pictures, roughness, see-through, sides
      plain.set(m, s)
    }
    return s
  }
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => standard(x as THREE.MeshStandardMaterial)) : standard(mesh.material as THREE.MeshStandardMaterial)
    for (const m of [mesh.material].flat() as THREE.MeshStandardMaterial[]) {
      if (m.transparent && m.side === THREE.DoubleSide) (m.side = THREE.FrontSide), (m.needsUpdate = true)
      if (!m.normalMap && !m.aoMap && !m.roughnessMap && !m.metalnessMap) continue
      if (m.metalnessMap) m.metalness = 0
      m.normalMap = m.aoMap = m.roughnessMap = m.metalnessMap = null
      m.needsUpdate = true
    }
  })
  return model
}

/** Rotation about Y that turns the asset's declared front axis into +Z (see kit.ts frontAxis). */
export const FRONT_FIX: Record<string, number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }

/** a piece whose model could not be had (a buyer link whose own piece never went online): a plain block of its size, in a
 * quiet stone tone — it keeps the room's layout honest and says nothing */
function placeholder(size: { x: number; y: number; z: number }): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial({ color: '#cfc9bf', roughness: 0.9 }))
  m.position.y = size.y / 2
  m.userData.placeholder = true
  m.castShadow = m.receiveShadow = true
  return m
}

/**
 * Builds the placed object: pivot at (x, 0, y) in world; model grounded (min y = 0)
 * and centred on its bbox in xz; front → +Z; then rotationDeg applied.
 * rotationDeg is CLOCKWISE in plan (x right, y down = world X right, Z "down"
 * when viewed from +Y). Seen from +Y, a positive rotation about +Y is
 * counter-clockwise, so clockwise-in-plan = NEGATIVE angle about Y.
 * `mount` (kit.ts): 'ceiling' hangs the asset with its top at ceilingM,
 * 'wall' centres it at 1.5 m; `mountY` puts its bottom at that height instead
 * (TV on its unit, pillows on the sofa), and the placement's own `mountY` (a wall piece staff moved up or down) wins over
 * both — an `onTop` piece (a table lamp) at `restM`, the top it stands on (studio/furniture.ts bottomOf);
 * 'procedural:<id>' urls come from buildProcedural. `floorM`: the floor level it
 * stands on (a raised lobby, a sunken lawn); `ceilingM` is absolute. `tris`: a scanned model's stand-in at about that many
 * triangles (standIn), not the scan itself.
 */
export async function buildFurniture(p: FurniturePlacement, ceilingM = 3.048, floorM = 0, restM?: number, tris?: number): Promise<THREE.Group> {
  const pivot = new THREE.Group()
  pivot.position.set(p.x, floorM, p.y)
  pivot.rotation.y = -THREE.MathUtils.degToRad(p.rotationDeg)
  const asset = kitAsset(p.assetId)
  pivot.userData = { kind: 'furniture', id: p.id, roomId: p.roomId, label: placementLabel(p), objectKind: asset ? objectKind(asset) : 'decor' }

  // Lite and Low: a scanned plant model (2–6 MB) is left out; the piece stays in the layout (Arrange, the load count), nothing drawn
  if (lean.on && asset?.category === 'plant' && !asset.url.startsWith('procedural:')) return pivot
  let model: THREE.Object3D | null = null
  if (asset) {
    try {
      const rebuilt = rebuildsAtSize(asset.id)
      model = asset.url.startsWith('procedural:') ? buildProcedural(asset.id, rebuilt ? p.sizeM : undefined) : (await (tris ? standIn(asset.url, tris) : loadModel(asset.url))).clone()
      if (!model) throw new Error('no procedural builder')
      // a code-built piece is made for each placement (a 3.9 m curtain's pleats, a bed's quilting: 4–11 thousand triangles):
      // its stand-in made here, the same way
      if (tris && asset.url.startsWith('procedural:')) model = await simplified(model, tris)
      model.rotation.y = FRONT_FIX[asset.frontAxis] ?? 0
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      // Some Poly Haven exports carry vertex data in the wrong unit (steel_frame_shelves_01 is 10×).
      // Largest extent is axis-swap-proof; if it is off by > 25 % scale so the height matches the kit.
      const size = box.getSize(new THREE.Vector3())
      const want = (rebuilt && p.sizeM) || asset.sizeM
      const ratio = Math.max(size.x, size.y, size.z) / Math.max(want.x, want.y, want.z)
      const side = asset.frontAxis.endsWith('x') // FRONT_FIX turned it 90°: its own x is the piece's depth
      if (asset.own && size.x > 1e-6 && size.y > 1e-6 && size.z > 1e-6) {
        // the staff's own model (furnish/own.ts): fitted to the size they typed, whatever unit its file was drawn in
        const f = { x: want.x / size.x, y: want.y / size.y, z: want.z / size.z }
        model.scale.multiply(new THREE.Vector3(side ? f.z : f.x, f.y, side ? f.x : f.z))
        model.updateMatrixWorld(true)
        box.setFromObject(model)
      } else if (Math.abs(ratio - 1) > 0.25 && size.y > 1e-6) {
        if (!warned.has(asset.id)) {
          warned.add(asset.id)
          console.warn(`[plotline] "${asset.id}" loads at ${ratio.toFixed(2)}× its kit size — rescaling to sizeM.y`)
        }
        model.scale.multiplyScalar(want.y / size.y)
        model.updateMatrixWorld(true)
        box.setFromObject(model)
      }
      if (p.sizeM && !rebuilt) {
        // resized scan (or a builder that does not rebuild): the mesh scaled by sizeM / kit size in the piece's frame (kit.ts resizeLimits)
        const f = { x: p.sizeM.x / asset.sizeM.x, y: p.sizeM.y / asset.sizeM.y, z: p.sizeM.z / asset.sizeM.z }
        model.scale.multiply(new THREE.Vector3(side ? f.z : f.x, f.y, side ? f.x : f.z))
        model.updateMatrixWorld(true)
        box.setFromObject(model)
      }
      const c = box.getCenter(new THREE.Vector3())
      model.position.set(-c.x, -box.min.y, -c.z)
      if (asset.mountY !== undefined) pivot.position.y = floorM + (asset.onTop && restM !== undefined ? restM : asset.mountY)
      else if (asset.mount === 'ceiling') pivot.position.y = ceilingM - (box.max.y - box.min.y)
      else if (asset.mount === 'wall') pivot.position.y = floorM + 1.5 - (box.max.y - box.min.y) / 2
      pivot.userData.kitY = pivot.position.y - floorM // where its kit hangs it: a lift undone goes back there (PlotlineScene.placePieces)
      if (p.mountY !== undefined) pivot.position.y = floorM + p.mountY // moved up or down the wall by staff
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          // ceiling pieces (lights, fan, pendant, AC) sit in the roof's sun shadow and the room lights cast none:
          // out of the shadow pass (a draw call per material per fixture)
          o.castShadow = asset.mount !== 'ceiling'
          o.receiveShadow = true
        }
        // a sub-part (procedural.ts part()): picked on its own as `${placementId}/${name}`
        const t = o.userData.part
        if (t) o.userData = { kind: 'furniture', id: `${p.id}/${t.name}`, roomId: p.roomId, label: t.label, objectKind: t.kind }
      })
    } catch (e) {
      console.warn(`[plotline] furniture "${p.assetId}" failed to load`, e)
      model = null
    }
  } else {
    console.warn(`[plotline] unknown assetId "${p.assetId}" — placeholder`)
  }
  pivot.add(model ?? placeholder(p.sizeM ?? asset?.sizeM ?? { x: 1, y: 1, z: 1 }))
  if (p.scale && !p.sizeM) pivot.scale.setScalar(p.scale) // sizeM wins (kit.ts placementSize): the piece is built at it
  return pivot
}
