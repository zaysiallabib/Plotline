/**
 * Node-only checks of the pure parts of the engine: finish resolution, furniture
 * rotation convention (presets.ts is the contract), procedural asset bounds,
 * and door-leaf swing side.
 * No WebGL: nothing here instantiates PlotlineScene.
 */
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import typeA from '../data/units/type-a.json'
import type { Opening, Unit, Wall } from '../core'
import { footprint } from '../furnish/presets'
import { buildProcedural, PROCEDURAL } from '../furnish/procedural'
import { buildFurniture } from './furniture'
import { resolveFinishRef } from './materials'
import { buildOpening } from './openings'
import { clampSun, evenBearings } from './PlotlineScene'

// TextureLoader → ImageLoader wants a DOM element; the tests never await a load.
;(globalThis as { document?: unknown }).document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) }
;(globalThis as { self?: unknown }).self ??= globalThis

const unit = typeA as unknown as Unit

describe('resolveFinishRef on type-a.json', () => {
  const ref = (roomId: string, target: 'floor' | 'wall' | 'ceiling') => resolveFinishRef(unit.finishSlots, {}, roomId, target)
  test.each([
    ['r_bath2', 'floor', 'tile_floor_ceramic', undefined],
    ['r_bed1', 'floor', 'wood_floor_oak', undefined],
    ['r_living', 'floor', 'marble_floor_white', undefined],
    ['r_bath2', 'wall', 'tile_wall_white', undefined],
    ['r_bed1', 'wall', 'plaster_white', '#f4f1ea'],
    ['r_bed1', 'ceiling', 'plaster_white', '#ffffff'],
  ] as const)('%s %s → %s', (room, target, textureId, tint) => {
    expect(ref(room, target)).toMatchObject(tint ? { kind: 'pbr', textureId, tint } : { kind: 'pbr', textureId })
  })

  test('configuration overrides the default; unknown option falls back to the default', () => {
    expect(resolveFinishRef(unit.finishSlots, { s_floor_wet: 'fo_wet_marble' }, 'r_bath2', 'floor')).toMatchObject({ textureId: 'marble_floor_white' })
    expect(resolveFinishRef(unit.finishSlots, { s_floor_wet: 'fo_beds_oak' }, 'r_bath2', 'floor')).toMatchObject({ textureId: 'tile_floor_ceramic' })
  })

  test('exterior side of a wall is plaster, unslotted room floor is the flat default', () => {
    expect(resolveFinishRef(unit.finishSlots, {}, null, 'wall')).toMatchObject({ kind: 'color' })
    expect(resolveFinishRef(unit.finishSlots, {}, 'r_lifts', 'floor')).toMatchObject({ kind: 'color' })
    expect(resolveFinishRef(unit.finishSlots, {}, 'r_closet', 'floor')).toMatchObject({ kind: 'pbr', textureId: 'wood_floor_oak' })
  })
})

describe('furniture', () => {
  test('rotationDeg follows presets.ts: front f(θ) = (−sin θ, cos θ), bbox = footprint', async () => {
    for (const deg of [0, 90, 180, 270]) {
      const g = await buildFurniture({ id: 'p', assetId: 'fridge', roomId: 'r', x: 5, y: 7, rotationDeg: deg })
      g.updateMatrixWorld(true)
      const q = g.children[0].getWorldQuaternion(new THREE.Quaternion())
      const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      const t = (deg * Math.PI) / 180
      expect(front.x).toBeCloseTo(-Math.sin(t), 6)
      expect(front.z).toBeCloseTo(Math.cos(t), 6)
      const box = new THREE.Box3().setFromObject(g)
      const fp = footprint({ x: 5, y: 7 }, deg, PROCEDURAL.fridge.sizeM)
      expect(Math.min(...fp.map((p) => p.x))).toBeCloseTo(box.min.x, 1)
      expect(Math.max(...fp.map((p) => p.y))).toBeCloseTo(box.max.z, 1)
      expect(box.min.y).toBeCloseTo(0, 6)
    }
  })

  test('every procedural asset builds within ±10 % of its sizeM, grounded and centred', () => {
    for (const [id, meta] of Object.entries(PROCEDURAL)) {
      const g = buildProcedural(id)
      expect(g, id).not.toBeNull()
      g!.updateMatrixWorld(true)
      const b = new THREE.Box3().setFromObject(g!)
      const s = b.getSize(new THREE.Vector3())
      for (const k of ['x', 'y', 'z'] as const) expect(Math.abs(s[k] - meta.sizeM[k]) / meta.sizeM[k], `${id}.${k}`).toBeLessThan(0.1)
      expect(Math.abs(b.min.y), id).toBeLessThan(1e-3)
      expect(Math.abs(b.min.x + b.max.x), id).toBeLessThan(0.05)
    }
  })
})

describe('buildOpening door leaf', () => {
  const wall: Wall = { id: 'w', a: 'a', b: 'b', thicknessM: 0.127, heightM: 3.048, openings: [] }
  test.each([
    ['a', 'in', -1],
    ['a', 'out', 1],
    ['b', 'in', -1],
    ['b', 'out', 1],
  ] as const)('hinge %s swing %s → free edge on %d·normal side', (hinge, swing, sign) => {
    const o: Opening = { id: 'o', kind: 'door', offsetM: 1, widthM: 0.9, heightM: 2.1, sillM: 0, hinge, swing }
    const g = buildOpening(o, wall)
    g.updateMatrixWorld(true)
    const part = g.getObjectsByProperty('type', 'Group').find((c) => c.userData.id === 'o/leaf')!
    const pivot = part.parent!
    const leaf = part.children[0] as THREE.Mesh // the leaf slab (its grooves are the second mesh)
    const bb = new THREE.Box3().setFromBufferAttribute(leaf.geometry.attributes.position as THREE.BufferAttribute)
    const tip = leaf.localToWorld(new THREE.Vector3(hinge === 'b' ? bb.min.x : bb.max.x, 0, (bb.min.z + bb.max.z) / 2))
    expect(Math.sign(tip.z)).toBe(sign)
    expect(pivot.position.x).toBeCloseTo(hinge === 'b' ? 1.9 : 1, 6) // hinge at that vertex end, measured from a
  })
})

/** Every object PlotlineScene.pick can stop at (userData.kind), by id → objectKind. */
const pickable = (root: THREE.Object3D) => {
  const out: Record<string, string> = {}
  root.traverse((o) => {
    if (!o.userData.kind) return
    expect(o.userData.id in out, `duplicate ${o.userData.id}`).toBe(false)
    expect(o.userData.label, o.userData.id).toBeTruthy()
    out[o.userData.id] = o.userData.objectKind
  })
  return out
}

describe('clickable parts', () => {
  test('vanity and shower: parts `${placementId}/${part}`, stable across builds', async () => {
    const vanity = { id: 'r_bath1:vanity:1', assetId: 'vanity', roomId: 'r_bath1', x: 0, y: 0, rotationDeg: 0 }
    const ids = pickable(await buildFurniture(vanity))
    expect(ids).toEqual({
      'r_bath1:vanity:1': 'vanity',
      'r_bath1:vanity:1/cabinet': 'vanity',
      'r_bath1:vanity:1/basin': 'basin',
      'r_bath1:vanity:1/mixer': 'mixer',
      'r_bath1:vanity:1/mirror': 'mirror',
    })
    expect(pickable(await buildFurniture(vanity))).toEqual(ids)
    const shower = pickable(await buildFurniture({ ...vanity, id: 's', assetId: 'shower_screen' }))
    expect(shower).toEqual({ s: 'shower', 's/tray': 'shower-tray', 's/glass': 'shower-glass', 's/head': 'shower-head', 's/mixer': 'mixer' })
  })

  test('doors, sliders and windows: parts `${openingId}/${part}`; the rest of the opening stays the opening', () => {
    const wall: Wall = { id: 'w', a: 'a', b: 'b', thicknessM: 0.127, heightM: 3.048, openings: [] }
    const at = { offsetM: 1, heightM: 2.1, sillM: 0 }
    const door = buildOpening({ id: 'd', kind: 'door', widthM: 0.9, hinge: 'a', swing: 'in', ...at }, wall, { threshold: true })
    expect(pickable(door)).toEqual({ d: 'door', 'd/frame': 'door-frame', 'd/leaf': 'door-leaf', 'd/handle': 'door-handle' })
    // a click on the threshold (no part) still reaches the door group itself
    expect(door.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(1)
    expect(pickable(buildOpening({ id: 's', kind: 'door', widthM: 2.4, ...at }, wall))).toEqual({ s: 'door', 's/frame': 'door-frame', 's/glass': 'window-glass' })
    expect(pickable(buildOpening({ id: 'w', kind: 'window', widthM: 1.5, ...at, sillM: 0.9 }, wall))).toEqual({
      w: 'window',
      'w/frame': 'window-frame',
      'w/glass': 'window-glass',
    })
    door.traverse((o) => o.userData.kind && expect(o.userData.wallId).toBe('w')) // parts anchor in the wall's frame
  })
})

describe('evenBearings', () => {
  test('each texel becomes the mean of its four quarter turns about the vertical; rows and alpha stay', () => {
    const [w, h] = [8, 3]
    const { toHalfFloat: t16, fromHalfFloat: f } = THREE.DataUtils
    const src = Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 1 : (i * 7) % 5))
    const tex = new THREE.DataTexture(new Uint16Array(src.map(t16)), w, h)
    evenBearings(tex)
    const out = tex.image.data as Uint16Array
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          const at = (xx: number) => (y * w + (xx % w)) * 4 + c
          const want = c === 3 ? 1 : [0, 2, 4, 6].reduce((s, k) => s + src[at(x + k)], 0) / 4
          expect(f(out[at(x)])).toBeCloseTo(want, 2)
        }
      }
    }
  })
})

describe('clampSun', () => {
  test('the sun disc and its rays take the sky around them; the sky gradient and a sunlit cloud stay bit-identical', () => {
    const { toHalfFloat: t16, fromHalfFloat: f } = THREE.DataUtils
    const [w, h] = [512, 256]
    const sky = (y: number) => [0.3, 0.4, 0.7].map((v) => f(t16(v * (1 + y / h)))) // brighter toward the horizon
    const data = new Uint16Array(w * h * 4)
    const set = (x: number, y: number, rgb: number[]) => data.set([...rgb, 1].map(t16), 4 * (y * w + x))
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, sky(y))
    const sun = [[100, 64], [101, 64], [100, 65], [101, 65]]
    const ray = [102, 103, 104, 105, 106].map((x) => [x, 64])
    for (const [x, y] of sun) set(x, y, [60000, 56000, 50000])
    for (const [x, y] of ray) set(x, y, [5, 4.6, 4])
    for (let y = 180; y < 200; y++) for (let x = 300; x < 330; x++) set(x, y, [5, 5, 5]) // a cloud, far off the sun
    const before = data.slice()
    clampSun(new THREE.DataTexture(data, w, h))
    const changed = new Set<number>()
    for (let i = 0; i < data.length; i++) if (data[i] !== before[i]) changed.add(Math.floor(i / 4))
    expect([...changed].sort((a, b) => a - b)).toEqual([...sun, ...ray].map(([x, y]) => y * w + x).sort((a, b) => a - b))
    for (const [x, y] of [...sun, ...ray]) {
      const got = [0, 1, 2].map((c) => f(data[4 * (y * w + x) + c]))
      got.forEach((v, c) => expect(v, `${x},${y}`).toBeCloseTo(sky(y)[c], 2))
    }
  })
})
