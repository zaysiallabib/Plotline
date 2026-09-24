/**
 * Node-only checks of the pure parts of the engine: finish resolution, furniture
 * rotation convention (presets.ts is the contract), procedural asset bounds,
 * door-leaf swing side and the BoxGeometry face layout buildWall relies on.
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
import { buildOpening } from './PlotlineScene'

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
    expect(resolveFinishRef(unit.finishSlots, {}, 'r_closet', 'floor')).toMatchObject({ kind: 'color' })
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
    const pivot = g.children.find((c) => c.type === 'Group')!
    const leaf = pivot.children[0] as THREE.Mesh
    const hw = ((leaf.geometry as THREE.BoxGeometry).parameters.width) / 2
    const tip = leaf.localToWorld(new THREE.Vector3(hinge === 'b' ? -hw : hw, 0, 0))
    expect(Math.sign(tip.z)).toBe(sign)
    expect(pivot.position.x).toBeCloseTo(hinge === 'b' ? 1.9 : 1, 6) // hinge at that vertex end, measured from a
  })
})

test('BoxGeometry face layout used by buildWall: indices 24..29 = +z, 30..35 = −z', () => {
  const g = new THREE.BoxGeometry(2, 3, 0.2)
  const n = g.attributes.normal
  expect(n.getZ(g.index!.getX(24))).toBe(1)
  expect(n.getZ(g.index!.getX(30))).toBe(-1)
})
