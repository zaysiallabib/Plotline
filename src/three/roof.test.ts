/** The roof (session 31 roof lane): one roof model over the top floor — flat with its parapet, gable, hip, shed, mansard. */
import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import type { Group, Mesh } from 'three'
import type { Pt, Unit } from '../core'
import { topFloor, type Tower } from '../data/building'
import * as bti from '../data/building/demo-tower'
import * as sheltech from '../data/building/sheltech-tower'
import { makeProject, parseProjects, projectTower } from '../data/building/projects'
import { DEFAULT_PITCH, ROOFS_KEY, coveringOf, keepRoof, keptRoofs, parseRoof, roofOf, roofWords, spread } from '../data/building/roof'
import { ROOF_COVERINGS } from '../furnish/finishes'
import { TEXTURES } from '../furnish/textures'
import { roofGeometry } from './roof'

const g = globalThis as unknown as Record<string, unknown>
const stop = { addColorStop: () => {} }
const draw = new Proxy({}, { get: (_, k) => (k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : k === 'measureText' ? () => ({ width: 1 }) : () => stop), set: () => true })
g.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => draw }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) }
g.requestAnimationFrame ??= () => 0

/** the tower round flat `stem` on floor `k` of tower `t`, made in full */
const built = async (t: Tower, stem: string, k: number) => {
  const { Building } = await import('./building')
  const b = new (Building as unknown as new (u: Unit, t: Tower, s: string, k: number, q: string) => Group & { make(): Generator<void>; levelOf(k: number): number; dispose(): void })(t.FLATS[stem].unit, t, stem, k, 'high')
  for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
  b.updateMatrixWorld(true)
  return b
}
/** every vertex the tower draws, where it draws it, folded into one number (and how many) — building.test.ts's print */
const print = (b: Group) => {
  let n = 0
  let sum = 0
  b.traverse((o) => {
    const geo = (o as Mesh).geometry
    if (!geo?.attributes.position) return
    const p = geo.attributes.position
    const e = o.matrixWorld.elements
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = [p.getX(i) + e[12], p.getY(i) + e[13], p.getZ(i) + e[14]]
      sum += ((x * 3.1 + y * 1.7 + z * 0.9) * ((i % 7) + 1)) % 1000
      n++
    }
  })
  return `${n}:${sum.toFixed(1)}`
}
/** a test's own localStorage (a built-in tower's roof is kept there) */
function storage(): Map<string, string> {
  const m = new Map<string, string>()
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } })
  return m
}
const ys = (geo: THREE.BufferGeometry) => [...Array(geo.attributes.position.count).keys()].map((i) => geo.attributes.position.getY(i))
const box = (geo: THREE.BufferGeometry) => (geo.computeBoundingBox(), geo.boundingBox!)
const BOX: Pt[] = [{ x: 0, y: 0 }, { x: 4, y: 10 }, { x: 0, y: 10 }, { x: 4, y: 0 }] // 4 m wide, 10 m long (along y)
const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)
/** each mesh of floor k as [its foot, its top] over y0 */
const spans = (b: Group, k: number, y0: number) => {
  const out: number[][] = []
  b.traverse((o) => {
    const m = o as Mesh
    if (!m.isMesh || o.userData.level !== k || !m.geometry.attributes.position.count) return
    const x = new THREE.Box3().setFromObject(m)
    out.push([+(x.min.y - y0).toFixed(3) || 0, +(x.max.y - y0).toFixed(3) || 0]) // (no −0)
  })
  return out
}

describe('no roof set: the very same tower as before the roof lane', () => {
  test('the demo tower (Type A on floor 2): vertex for vertex', async () => {
    storage()
    const b = await built(bti as Tower, 'type-a', 2)
    expect(print(b)).toBe(BTI_UNCHANGED)
    b.dispose()
  })
  test('Sheltech (a traced rooftop on the roof slab): vertex for vertex', async () => {
    const b = await built(sheltech as unknown as Tower, 'sheltech-a', 2)
    expect(print(b)).toBe(SHELTECH_UNCHANGED)
    b.dispose()
  })
})

describe('the roof setting (data/building/roof.ts): one model with what the set reads', () => {
  test('a set that prints a ridge reads as a gable, or a hip; the person’s setting comes over it; none is the flat roof', () => {
    expect(roofOf(undefined, { floors: { 0: 0 }, eaveM: 6.1, ridgeM: 8.89 })).toEqual({ kind: 'gable' })
    expect(roofOf(undefined, { floors: { 0: 0 }, eaveM: 6.1, ridgeM: 8.89, hip: true })).toEqual({ kind: 'hip' })
    expect(roofOf({ kind: 'shed', pitchDeg: 12 }, { floors: { 0: 0 }, ridgeM: 8.89 })).toEqual({ kind: 'shed', pitchDeg: 12 })
    expect(roofOf(undefined, { floors: { 0: 0 }, roofM: 7.3 })).toBeUndefined()
    expect(roofOf(undefined, undefined)).toBeUndefined()
  })
  test('a stored roof is checked: wrong kinds refused, numbers kept in sane limits, a window’s missing size the usual one', () => {
    expect(parseRoof({ kind: 'dome' })).toBeNull()
    expect(parseRoof(null)).toBeNull()
    expect(parseRoof({ kind: 'gable', pitchDeg: 120, overhangM: -1, coping: 'gold', windows: [{ side: 1, along: 3 }] })).toEqual({ kind: 'gable', pitchDeg: 75, windows: [{ side: 1, along: 1, up: 0.5, wM: 0.78, hM: 1.18 }] })
    // a project with a broken roof is not read (the store's shape check), one with a good roof is
    const p = makeProject('p', bti.FLATS['type-a'].unit, 1, 2, 'none')
    expect(parseProjects(JSON.stringify([{ ...p, roof: { kind: 'gable' } }]))).toHaveLength(1)
    expect(parseProjects(JSON.stringify([{ ...p, roof: { kind: 7 } }]))).toHaveLength(0)
  })
  test('coverings: real finish options over registered textures; a flat deck’s and a slope’s lists; one the kind cannot take falls back', () => {
    for (const o of [...ROOF_COVERINGS.flat, ...ROOF_COVERINGS.pitched]) {
      expect([o.brand, o.sku, o.label].every((x) => x.trim() !== ''), o.id).toBe(true)
      expect(Number.isInteger(o.priceDeltaBdt)).toBe(true)
      if (o.material.kind === 'pbr') expect(TEXTURES[o.material.textureId], o.id).toBeDefined()
    }
    expect(coveringOf({ kind: 'gable', covering: 'rc_clay' }).label).toBe('Clay tiles')
    expect(coveringOf({ kind: 'flat', covering: 'rc_clay' }).id).toBe('rc_slab') // (clay tiles on a flat deck: no)
    expect(coveringOf(undefined).id).toBe('rc_slab')
    expect(coveringOf({ kind: 'hip' }).id).toBe('rc_sheet') // (the grey sheet the heights lane drew)
  })
  test('in plain words, and windows spread evenly along their slope', () => {
    expect(roofWords(undefined)).toBe('Flat, with its parapet · Plain roof slab')
    expect(roofWords({ kind: 'flat', covering: 'rc_gravel', coping: 'metal' })).toBe('Flat, with its parapet · Gravel · metal coping')
    expect(roofWords({ kind: 'gable', pitchDeg: 35, covering: 'rc_clay', overhangM: 0.6 })).toBe('Gable · 35° · Clay tiles · eaves 0.60 m')
    expect(roofWords({ kind: 'hip' }, true)).toBe('Hip · pitch as drawn · Grey metal sheet')
    expect(roofWords({ kind: 'shed' })).toBe(`Shed · ${DEFAULT_PITCH}° · Grey metal sheet`)
    const w = { up: 0.2, wM: 0.78, hM: 1.18 }
    expect(spread([{ side: 0, along: 0.1, ...w }, { side: 1, along: 0.9, ...w }, { side: 0, along: 0.1, ...w }], 0).map((x) => [x.side, x.along, x.up])).toEqual([[0, 1 / 3, 0.5], [1, 0.9, 0.2], [0, 2 / 3, 0.5]])
  })
  test('a built-in tower’s roof is kept in this browser; a project’s goes in the project (and a pitched one has no stair head room)', () => {
    const m = storage()
    expect(keepRoof('type-a', { kind: 'hip', covering: 'rc_zinc' })).toBe(true)
    expect(keptRoofs()).toEqual({ 'type-a': { kind: 'hip', covering: 'rc_zinc' } })
    m.set(ROOFS_KEY, '{"type-a":{"kind":"spire"}}')
    expect(keptRoofs()).toEqual({})
    expect(keepRoof('type-a', null)).toBe(true)
    const u = bti.FLATS['type-a'].unit
    const t = projectTower({ ...makeProject('p', u, 2, 4, 'none'), roof: { kind: 'gable', covering: 'rc_clay' } })
    expect(t.ROOF_SHAPE).toEqual({ kind: 'gable', covering: 'rc_clay' })
    expect(t.CORE).toEqual([])
    expect(projectTower(makeProject('p', u, 2, 4, 'none')).CORE.length).toBeGreaterThan(0) // (flat: the stair runs up to its head room)
  })
  test('staff change the roof in the 3D view: a built-in building’s kept in this browser, a project’s written into the project', async () => {
    const m = storage()
    const { roofIn, saveRoof, towerOf } = await import('../data/building')
    expect(saveRoof(bti.FLATS['type-a'].unit, { kind: 'shed', pitchDeg: 10 })).toBe(true)
    expect(roofIn(towerOf(bti.FLATS['type-a'].unit)!)).toEqual({ kind: 'shed', pitchDeg: 10 })
    const u = { ...bti.FLATS['type-b'].unit, id: 'mine' }
    m.set('plotline.projects', JSON.stringify([makeProject('p', u, 1, 3, 'none')]))
    expect(saveRoof(u, { kind: 'hip', covering: 'rc_slate' })).toBe(true)
    expect(JSON.parse(m.get('plotline.projects')!)[0].roof).toEqual({ kind: 'hip', covering: 'rc_slate' })
    expect(roofIn(towerOf(u)!)).toEqual({ kind: 'hip', covering: 'rc_slate' })
    expect(saveRoof({ ...u, id: 'nowhere' }, { kind: 'flat' })).toBe(false) // (no building: nothing kept)
  })
})

describe('the pitched roof (three/roof.ts)', () => {
  test('a gable at its pitch: the ridge down the long middle, half the width × tan(pitch) over the eaves; gables from the slab', () => {
    const r = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 40 }, 5, 5)
    expect(Math.max(...ys(r.cover))).toBeCloseTo(5 + 2 * tan(40), 6)
    expect(box(r.cover).min.x).toBeCloseTo(0)
    expect(box(r.cover).max.z).toBeCloseTo(10)
    expect(box(r.walls).max.y).toBeCloseTo(5 + 2 * tan(40), 6)
    expect(r.trim.attributes.position.count).toBe(0) // (no overhang: no fascia, no soffit)
    // no pitch set: the default; the set's ridge when there is one
    expect(Math.max(...ys(roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable' }, 5, 5).cover))).toBeCloseTo(5 + 2 * tan(DEFAULT_PITCH), 6)
    expect(Math.max(...ys(roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable' }, 5, 5.5, 8).cover))).toBe(8)
  })
  test('the ridge across the building when asked, along its long side by default', () => {
    const along = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 30 }, 0, 0)
    const across = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 30, ridge: 'short' }, 0, 0)
    expect(Math.max(...ys(along.cover))).toBeCloseTo(2 * tan(30), 6) // 4 m wide: 2 m to the ridge
    expect(Math.max(...ys(across.cover))).toBeCloseTo(5 * tan(30), 6) // 10 m: 5 m to the ridge
  })
  test('an overhang: the slopes run on past the walls at the same pitch, a fascia along the edge and a soffit under them', () => {
    const r = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 30, overhangM: 0.6 }, 5, 5)
    const b = box(r.cover)
    expect([b.min.x, b.max.x, b.min.z, b.max.z].map((x) => +x.toFixed(6))).toEqual([-0.6, 4.6, -0.6, 10.6])
    expect(b.min.y).toBeCloseTo(5 - 0.6 * tan(30), 6) // the eave's edge lower by the overhang's fall
    expect(b.max.y).toBeCloseTo(5 + 2 * tan(30), 6) // the ridge where it was
    expect(box(r.trim).min.y).toBeCloseTo(5 - 0.6 * tan(30) - 0.18, 6) // the fascia's foot
    // the slopes face the sky only (the soffit under them faces down)
    const n = r.cover.attributes.normal
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0)
  })
  test('a hip: slopes at the ends too, the ridge shorter by the width; a shed: one slope, high along the back; a mansard: steep lower slopes', () => {
    const h = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'hip', pitchDeg: 30 }, 0, 0)
    const pos = h.cover.attributes.position
    const ridge = [...Array(pos.count).keys()].filter((i) => Math.abs(pos.getY(i) - 2 * tan(30)) < 1e-6).map((i) => pos.getZ(i))
    expect([Math.min(...ridge), Math.max(...ridge)].map((z) => +z.toFixed(6))).toEqual([2, 8])
    const s = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'shed', pitchDeg: 10 }, 0, 0)
    expect(Math.max(...ys(s.cover))).toBeCloseTo(4 * tan(10), 6) // one slope across the whole width
    expect(s.cover.attributes.position.count).toBe(12) // (one quad, both sides)
    const m = roofGeometry([{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 0, y: 10 }], { x: 1, y: 0 }, { kind: 'mansard', pitchDeg: 20 }, 0, 0)
    // the lower slopes rise 2.4 m over 0.87 m (70°), the hip over them at 20° from there
    expect(Math.max(...ys(m.cover))).toBeCloseTo(2.4 + (10 / 2 - 2.4 / tan(70)) * tan(20), 3)
  })
  test('roof windows: the tower’s panes lying on the slope, facing the sky; on a flat roof a skylight on a curb', () => {
    const w = { up: 0.5, wM: 0.78, hM: 1.18 }
    const r = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 35, windows: [{ side: 0, along: 0.5, ...w }, { side: 1, along: 0.2, ...w }] }, 3, 3)
    expect(r.panes.attributes.position.count).toBe(12)
    expect(r.panes.attributes.pane.itemSize).toBe(4)
    const n = r.panes.attributes.normal
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeCloseTo(Math.cos((35 * Math.PI) / 180), 5) // (on the slope, facing up)
    const f = roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'flat', windows: [{ side: 0, along: 0.5, up: 0.5, wM: 1, hM: 1 }] }, 3, 3)
    expect(Math.min(...ys(f.panes))).toBeCloseTo(3.15)
    expect(Math.max(...ys(f.walls))).toBeCloseTo(3.15)
    expect(f.cover.attributes.position.count).toBe(0)
    // a window too big for its slope is left out, not drawn hanging off it
    expect(roofGeometry(BOX, { x: 1, y: 0 }, { kind: 'gable', pitchDeg: 30, windows: [{ side: 0, along: 0.5, up: 0.5, wM: 0.78, hM: 4 }] }, 0, 0).panes.attributes.position.count).toBe(0)
  })
})

describe('the demo tower under a roof set by staff (kept in this browser)', () => {
  const K = topFloor(bti as Tower) + 1
  test('a gable in clay tiles: no parapet, no head room or tanks over it, the ridge at its pitch; back to flat: the tower as it was', async () => {
    storage()
    keepRoof('type-a', { kind: 'gable', pitchDeg: 30, covering: 'rc_clay', overhangM: 0.6 })
    const b = await built(bti as Tower, 'type-a', 2)
    const tops = spans(b, K, b.levelOf(K)).map((s) => s[1])
    expect(Math.max(...tops)).toBeGreaterThan(3) // (the tower is ~20 m deep: its ridge ~6 m over the slab)
    expect(Math.max(...tops)).toBeLessThan(12)
    expect(tops).not.toContainEqual(1.1) // no parapet
    b.dispose()
    keepRoof('type-a', null)
    const flat = await built(bti as Tower, 'type-a', 2)
    expect(print(flat)).toBe(BTI_UNCHANGED)
    flat.dispose()
  })
  test('a flat roof with gravel and a metal coping: the parapet stands as before, its cap on it, the gravel over the slab', async () => {
    storage()
    keepRoof('type-a', { kind: 'flat', covering: 'rc_gravel', coping: 'metal' })
    const b = await built(bti as Tower, 'type-a', 2)
    const s = spans(b, K, b.levelOf(K))
    expect(s).toContainEqual([1.1, 1.13]) // the cap on the 1.1 m parapet
    expect(s).toContainEqual([0, 0.03]) // the gravel over the slab
    b.dispose()
    keepRoof('type-a', null)
  })
})

describe('a project’s roof: the set’s gable, with the person’s setting over it', () => {
  test('a rooftop drawing still a picture to trace does not take the set’s roof away; the person’s covering and overhang go on it', async () => {
    storage()
    const { placeLevel } = await import('../data/building/projects')
    const { emptyUnit } = await import('../studio/model')
    const u = bti.FLATS['type-b'].unit
    const roofPicture = { ...emptyUnit(), name: 'Rooftop' }
    const p = placeLevel({ ...makeProject('p', u, 1, 1, 'none'), heights: { floors: { 0: 0, 1: 3.05 }, ceilingM: 5.79, eaveM: 6.1, ridgeM: 8.89 } }, roofPicture, 'rooftop', undefined, { x: 0, y: 0 }, 'typed')
    const top = async (q: typeof p) => {
      const t = projectTower(q)
      const b = await built(t, u.id, 1)
      const y = Math.max(...spans(b, 2, b.levelOf(0)).map((x) => x[1]))
      b.dispose()
      return y
    }
    expect(await top(p)).toBeCloseTo(8.89, 2) // the ridge as printed
    expect(await top({ ...p, roof: { kind: 'gable', covering: 'rc_clay', overhangM: 0.45 } })).toBeCloseTo(8.89, 2) // (the pitch still the set's)
    expect(await top({ ...p, roof: { kind: 'flat' } })).toBeLessThan(7) // flat after all: no ridge
  })
})

/** the demo tower round Type A on floor 2 as it was before the roof lane (s31/redesign e9ecd3e) */
const BTI_UNCHANGED = '682418:120722159.0'
const SHELTECH_UNCHANGED = '511354:46972180.7'
