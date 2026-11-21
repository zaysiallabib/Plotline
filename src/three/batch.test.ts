/** Lite / Low's batches (batch.ts): one mesh per material, the meshes kept on HIDDEN for picking. */
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { batch, CELL_M, HIDDEN, unbatch } from './batch'

const red = new THREE.MeshStandardMaterial({ color: 'red' })
const blue = new THREE.MeshStandardMaterial({ color: 'blue' })
const box = (m: THREE.Material | THREE.Material[], x = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m)
  mesh.position.x = x
  return mesh
}
const tris = (m: THREE.Mesh) => m.geometry.index!.count / 3

describe('batch', () => {
  test('meshes of one material become one mesh in the group’s frame; the meshes move to HIDDEN', () => {
    const g = new THREE.Group()
    g.position.set(10, 0, 0)
    const [a, b, c] = [box(red, 0), box(red, 3), box(blue, 6)]
    g.add(a, b, c)
    const out = batch(g)
    expect(out).toHaveLength(2)
    const r = out.find((m) => m.material === red)!
    expect(tris(r)).toBe(24)
    r.geometry.computeBoundingBox()
    expect([r.geometry.boundingBox!.min.x, r.geometry.boundingBox!.max.x]).toEqual([-0.5, 3.5]) // the group's frame, not world
    expect([a, b, c].every((m) => m.layers.mask === 1 << HIDDEN)).toBe(true)
    expect(out.every((m) => m.parent === g && m.userData.batch)).toBe(true)
  })
  test('meshes far apart (another CELL_M square of the plan) stay in separate batches, so the camera can leave one out', () => {
    const out = batch(new THREE.Group().add(box(red, 0), box(red, CELL_M * 2)))
    expect(out).toHaveLength(2)
  })
  test('a mesh with several materials splits by its groups', () => {
    const g = new THREE.Group().add(box([red, blue, red, blue, red, blue]))
    const out = batch(g)
    expect(out.map((m) => [m.material === red ? 'red' : 'blue', tris(m)]).sort()).toEqual([['blue', 6], ['red', 6]])
  })
  test('glass (transparent), hidden pieces and a mirror (its own render pass) stay as they are', () => {
    const glass = box(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 }))
    const hidden = box(red)
    hidden.visible = false
    const mirror = box(red)
    mirror.onBeforeRender = () => {}
    const g = new THREE.Group().add(glass, hidden, mirror)
    expect(batch(g)).toEqual([])
    expect([glass, hidden, mirror].every((m) => m.layers.mask === 1)).toBe(true)
  })
  test('shadow flags are kept: casting and non-casting meshes of one material are separate batches', () => {
    const [a, b] = [box(red), box(red, 2)]
    a.castShadow = true
    const out = batch(new THREE.Group().add(a, b))
    expect(out.map((m) => m.castShadow).sort()).toEqual([false, true])
  })
  test('a mirrored piece keeps its faces outward', () => {
    const m = box(red)
    m.scale.x = -1
    const [out] = batch(new THREE.Group().add(m))
    // the +x face of the box (now at −x): its triangles' winding normal points away from the centre
    const p = out.geometry.attributes.position
    const idx = out.geometry.index!
    const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx.getX(k)))
    const n = new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]), v[2].clone().sub(v[0]))
    const centre = v[0].clone().add(v[1]).add(v[2]).divideScalar(3)
    expect(n.dot(centre)).toBeGreaterThan(0)
  })
  test('picking still finds the piece, never the batch; unbatch brings the pieces back', () => {
    const piece = box(red)
    const g = new THREE.Group().add(piece)
    batch(g)
    const ray = new THREE.Raycaster(new THREE.Vector3(0.2, 0.1, 5), new THREE.Vector3(0, 0, -1)) // off the face's diagonal (two hits there)
    expect(ray.intersectObjects(g.children, true)).toEqual([])
    ray.layers.enable(HIDDEN)
    expect(ray.intersectObjects(g.children, true).map((h) => h.object)).toEqual([piece])
    unbatch(g)
    expect(g.children).toEqual([piece])
    expect(piece.layers.mask).toBe(1)
  })
})

describe('the panes join a batch (session 31 perf: a flat’s 20 windows were 20 draws a frame)', () => {
  test('glass marked to merge becomes one mesh; other see-through things stay as they are', () => {
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 })
    glass.userData.merge = true
    const sheer = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })
    const g = new THREE.Group().add(box(glass, 0), box(glass, 2), box(sheer, 4))
    const out = batch(g, Infinity)
    expect(out.map((m) => m.material)).toEqual([glass])
    expect(tris(out[0])).toBe(24)
  })
})
