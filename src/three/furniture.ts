/**
 * Furniture loading: glTF via GLTFLoader, one network load per URL, cloned
 * per placement. Unknown asset / failed load → grey placeholder box so the
 * layout still reads.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { FurniturePlacement } from '../core'
import { kitAsset } from '../furnish/kit'
import { buildProcedural } from '../furnish/procedural'

const loader = new GLTFLoader()
const gltfCache = new Map<string, Promise<THREE.Group>>()
const warned = new Set<string>()

function loadModel(url: string): Promise<THREE.Group> {
  let p = gltfCache.get(url)
  if (!p) {
    p = loader.loadAsync(url).then((g) => g.scene)
    gltfCache.set(url, p)
  }
  return p
}

/** Rotation about Y that turns the asset's declared front axis into +Z (see kit.ts frontAxis). */
const FRONT_FIX: Record<string, number> = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 }

function placeholder(size: { x: number; y: number; z: number }): THREE.Object3D {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshStandardMaterial({ color: '#8d8d8d', roughness: 0.9, transparent: true, opacity: 0.6 }),
  )
  m.position.y = size.y / 2
  return m
}

/**
 * Builds the placed object: pivot at (x, 0, y) in world; model grounded (min y = 0)
 * and centred on its bbox in xz; front → +Z; then rotationDeg applied.
 * rotationDeg is CLOCKWISE in plan (x right, y down = world X right, Z "down"
 * when viewed from +Y). Seen from +Y, a positive rotation about +Y is
 * counter-clockwise, so clockwise-in-plan = NEGATIVE angle about Y.
 * `mount` (kit.ts): 'ceiling' hangs the asset with its top at ceilingM,
 * 'wall' centres it at 1.5 m; 'procedural:<id>' urls come from buildProcedural.
 */
export async function buildFurniture(p: FurniturePlacement, ceilingM = 3.048): Promise<THREE.Group> {
  const pivot = new THREE.Group()
  pivot.position.set(p.x, 0, p.y)
  pivot.rotation.y = -THREE.MathUtils.degToRad(p.rotationDeg)
  pivot.userData = { kind: 'furniture', id: p.id, roomId: p.roomId }

  const asset = kitAsset(p.assetId)
  let model: THREE.Object3D | null = null
  if (asset) {
    try {
      model = asset.url.startsWith('procedural:') ? buildProcedural(asset.id) : (await loadModel(asset.url)).clone()
      if (!model) throw new Error('no procedural builder')
      model.rotation.y = FRONT_FIX[asset.frontAxis] ?? 0
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      // Some Poly Haven exports carry vertex data in the wrong unit (steel_frame_shelves_01 is 10×).
      // Largest extent is axis-swap-proof; if it is off by > 25 % scale so the height matches the kit.
      const size = box.getSize(new THREE.Vector3())
      const want = asset.sizeM
      const ratio = Math.max(size.x, size.y, size.z) / Math.max(want.x, want.y, want.z)
      if (Math.abs(ratio - 1) > 0.25 && size.y > 1e-6) {
        if (!warned.has(asset.id)) {
          warned.add(asset.id)
          console.warn(`[plotline] "${asset.id}" loads at ${ratio.toFixed(2)}× its kit size — rescaling to sizeM.y`)
        }
        model.scale.multiplyScalar(want.y / size.y)
        model.updateMatrixWorld(true)
        box.setFromObject(model)
      }
      const c = box.getCenter(new THREE.Vector3())
      model.position.set(-c.x, -box.min.y, -c.z)
      if (asset.mount === 'ceiling') pivot.position.y = ceilingM - (box.max.y - box.min.y)
      else if (asset.mount === 'wall') pivot.position.y = 1.5 - (box.max.y - box.min.y) / 2
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
    } catch (e) {
      console.warn(`[plotline] furniture "${p.assetId}" failed to load`, e)
      model = null
    }
  } else {
    console.warn(`[plotline] unknown assetId "${p.assetId}" — placeholder`)
  }
  pivot.add(model ?? placeholder(asset?.sizeM ?? { x: 1, y: 1, z: 1 }))
  if (p.scale) pivot.scale.setScalar(p.scale)
  return pivot
}
