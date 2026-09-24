/**
 * Furniture loading: glTF via GLTFLoader, one network load per URL, cloned
 * per placement. Unknown asset / failed load → grey placeholder box so the
 * layout still reads.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { FurniturePlacement } from '../core'
import { KIT } from '../furnish/kit'

const loader = new GLTFLoader()
const gltfCache = new Map<string, Promise<THREE.Group>>()

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
 */
export async function buildFurniture(p: FurniturePlacement): Promise<THREE.Group> {
  const pivot = new THREE.Group()
  pivot.position.set(p.x, 0, p.y)
  pivot.rotation.y = -THREE.MathUtils.degToRad(p.rotationDeg)
  pivot.userData = { kind: 'furniture', id: p.id, roomId: p.roomId }

  const asset = KIT[p.assetId]
  let model: THREE.Object3D | null = null
  if (asset) {
    try {
      model = (await loadModel(asset.url)).clone()
      model.rotation.y = FRONT_FIX[asset.frontAxis] ?? 0
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      const c = box.getCenter(new THREE.Vector3())
      model.position.set(-c.x, -box.min.y, -c.z)
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
