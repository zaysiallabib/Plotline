import { afterEach, describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import typeA from '../data/units/type-a.json'
import type { Unit } from '../core'
import { listing, OWN_GROUP } from '../studio/library'
import { library, placePiece } from '../studio/furniture'
import { FINISH_CATALOG } from './finishes'
import { kitAsset, lightOf, placementSize, resizeLimits } from './kit'
import {
  facing,
  forgetOwn,
  furnitureScale,
  isOwnItem,
  kitOf,
  MAX_TRIANGLES,
  modelRefusal,
  nameOf,
  optionOf,
  ownModels,
  pictureRefusal,
  refreshOwnOptions,
  registerOwn,
  scaledTo,
  unitReadings,
  withOwnOptions,
  type OwnFinish,
  type OwnModel,
} from './own'
import { textureSet } from './textures'

const H = 'a'.repeat(64)
const ORG = '0e1e0000-0000-4000-8000-0000000000aa'
const model = (over: Partial<OwnModel> = {}): OwnModel => ({
  id: 'own_11111111-1111-4111-8111-111111111111',
  type: 'model',
  label: 'Rahim sofa',
  category: 'sofa',
  front: '+z',
  sits: 'floor',
  sizeM: { x: 2.1, y: 0.8, z: 0.9 },
  triangles: 40_000,
  file: { hash: H, ext: 'glb', bytes: 2_000_000 },
  at: '2026-11-20T10:00:00.000Z',
  ...over,
})
const finish = (over: Partial<OwnFinish> = {}): OwnFinish => ({
  id: 'own_22222222-2222-4222-8222-222222222222',
  type: 'finish',
  slotId: 's_floor_beds',
  label: 'Teak parquet',
  brand: 'Akij',
  sku: 'AK-TEAK-60',
  priceDeltaBdt: 52000,
  look: { file: { hash: 'b'.repeat(64), ext: 'jpg', bytes: 900_000 }, tileM: { x: 0.6, y: 0.3 } },
  at: '2026-11-20T10:00:00.000Z',
  ...over,
})
afterEach(forgetOwn)

describe('a model of the staff own: what is refused, the size it reads, one side typed', () => {
  it('refuses a file over 30 MB or a model over 2 million triangles, with the reason and the Blender tip', () => {
    expect(modelRefusal({ bytes: 30 * 1024 * 1024, triangles: MAX_TRIANGLES })).toBeNull()
    const big = modelRefusal({ bytes: 41 * 1024 * 1024 })!
    expect(big).toMatch(/41\.0 MB.*up to 30 MB/)
    expect(big).toMatch(/Blender.*Decimate.*\.glb/)
    expect(modelRefusal({ bytes: 1000, triangles: 3_100_000 })).toMatch(/3\.1 million triangles.*up to 2 million.*Decimate/)
    expect(pictureRefusal({ bytes: 5 * 1024 * 1024, type: 'image/jpeg' })).toMatch(/5\.0 MB.*up to 4 MB/)
    expect(pictureRefusal({ bytes: 1000, type: 'image/webp' })).toMatch(/JPG or PNG/)
    expect(pictureRefusal({ bytes: 1000, type: 'image/png' })).toBeNull()
  })

  it('reads a file drawn in centimetres or millimetres as metres (no piece of furniture is 12 m across)', () => {
    expect(furnitureScale(2.1)).toBe(1)
    expect(furnitureScale(210)).toBe(0.01) // a 210 cm sofa read as 210 m
    expect(furnitureScale(2100)).toBe(0.001) // millimetres
  })

  it('an OBJ / STL whose size cannot be metres offers the units it could be in, never a silent wrong number', () => {
    const units = (n: number) => unitReadings(n)?.map((r) => r.unit)
    expect(unitReadings(2.1)).toBeNull() // metres, as before
    expect(unitReadings(0.3)).toBeNull()
    expect(units(84)).toEqual(['Inches', 'Centimetres']) // an 84" sofa (2.13 m) or an 84 cm chair
    expect(units(18)).toEqual(['Inches', 'Centimetres']) // an 18" stool: was read as 18 cm
    expect(units(210)).toEqual(['Centimetres', 'Millimetres']) // 2.1 m in cm, 21 cm in mm; 5.3 m in inches is no piece
    expect(units(2100)).toEqual(['Millimetres'])
    expect(units(0.02)).toEqual([]) // 2 cm across: no unit makes it furniture — the person types it
    expect(units(90000)).toEqual([])
    const inch = unitReadings(84)![0]
    expect(84 * inch.m).toBeCloseTo(2.1336, 4)
  })

  it('turns the measured box to the piece facing its front, and typing one side scales the rest', () => {
    const box = { x: 0.9, y: 0.8, z: 2.1 }
    expect(facing(box, '+z')).toEqual(box)
    expect(facing(box, '-x')).toEqual({ x: 2.1, y: 0.8, z: 0.9 }) // its front along x: the width was along z
    expect(scaledTo({ x: 2, y: 0.8, z: 0.9 }, 'x', 2.5)).toEqual({ x: 2.5, y: 1, z: 1.125 })
    expect(scaledTo({ x: 2, y: 0.8, z: 0.9 }, 'y', 0)).toEqual({ x: 2, y: 0.8, z: 0.9 }) // no size: unchanged
    expect(nameOf('Modern_Sofa-02.final.glb')).toBe('Modern sofa 02 final')
  })
})

describe('a record becomes a kit item like any other', () => {
  it('floor / wall / ceiling / on a table set its mount; a lamp lights only with "it gives light"', () => {
    expect(kitOf(model(), 'blob:x')).toMatchObject({ id: model().id, url: 'blob:x', sizeM: model().sizeM, frontAxis: '+z', license: 'own', own: true })
    expect(kitOf(model({ sits: 'wall' }), '').mount).toBe('wall')
    expect(kitOf(model({ sits: 'ceiling' }), '').mount).toBe('ceiling')
    expect(kitOf(model({ sits: 'table' }), '')).toMatchObject({ onTop: true, mountY: 0.75 })
    const lamp = (o: Partial<OwnModel>) => model({ category: 'lamp', sizeM: { x: 0.4, y: 1.5, z: 0.4 }, ...o })
    registerOwn([lamp({ light: true })], () => 'blob:l')
    expect(lightOf(model().id)).toEqual({ kind: 'floor', lumens: 800, bulbM: 1.275 })
    registerOwn([lamp({ light: true, sits: 'table' })], () => 'blob:l')
    expect(lightOf(model().id)).toMatchObject({ kind: 'table', lumens: 350 })
    registerOwn([lamp({ light: true, sits: 'ceiling' })], () => 'blob:l')
    expect(lightOf(model().id)).toEqual({ kind: 'ceiling' })
    registerOwn([lamp({ sits: 'ceiling' })], () => 'blob:l')
    expect(lightOf(model().id)).toBeNull() // a ceiling lamp that gives no light is no fixture
  })

  it('registered: in the library (its room tab and "Your own"), found by name, dropped by the kit rules, resizable', () => {
    registerOwn([model()], () => 'blob:s')
    expect(kitAsset(model().id)?.label).toBe('Rahim sofa')
    expect(library().find((t) => t.tab === 'Living')!.items.find((i) => i.id === model().id)).toMatchObject({ own: true, scan: true })
    expect(listing('')[0]).toMatchObject({ name: OWN_GROUP, count: 1 })
    expect(listing('rahim')[0].kinds[0].items[0].id).toBe(model().id)
    expect(placementSize({ assetId: model().id })).toEqual(model().sizeM)
    expect(resizeLimits(model().id)).not.toBeNull()
    const unit = typeA as unknown as Unit
    const rooms = deriveRooms(unit)
    const living = rooms.find((r) => r.kind === 'living')!
    const drop = placePiece(unit, rooms, [], model().id, living.centroid, 0)!
    expect(drop.error).toBeFalsy()
    expect(drop.piece.roomId).toBe(living.id)
    // removed: no longer listed, still a kit item (a piece placed before still draws)
    registerOwn([model({ removed: true })], () => 'blob:s')
    expect(ownModels()).toEqual([])
    expect(listing('rahim')).toEqual([])
    expect(kitAsset(model().id)).toBeDefined()
  })
})

describe('a finish option of the staff own', () => {
  it('is a structured option in its slot: a colour, a texture of the list, or its own picture tiled at its size', () => {
    expect(optionOf(finish({ look: { color: '#c0ffee' } })).material).toEqual({ kind: 'color', color: '#c0ffee', roughness: 0.85 })
    expect(optionOf(finish({ look: { textureId: 'marble_floor_white', tint: '#eeeeee' } })).material).toEqual({ kind: 'pbr', textureId: 'marble_floor_white', tint: '#eeeeee' })
    const f = finish()
    expect(optionOf(f)).toEqual({ id: f.id, brand: 'Akij', sku: 'AK-TEAK-60', label: 'Teak parquet', priceDeltaBdt: 52000, material: { kind: 'pbr', textureId: f.id } })
    registerOwn([f], () => 'blob:t')
    expect(textureSet(f.id)).toMatchObject({ albedo: 'blob:t', repeatM: 0.6, repeatYM: 0.3, license: 'own' })
  })

  it('joins the slot it was added in, after the catalog options; the catalog itself never changes; refreshed in place', () => {
    const catalog = FINISH_CATALOG.map((s) => s.options.length)
    const slots = withOwnOptions(FINISH_CATALOG.map(({ kinds: _k, levelKinds: _l, ...s }) => ({ ...s, roomIds: 'all' as const })), [finish()])
    const beds = slots.find((s) => s.id === 's_floor_beds')!
    expect(beds.options.at(-1)!.id).toBe(finish().id)
    expect(slots.filter((s) => s.options.some((o) => o.id === finish().id))).toHaveLength(1)
    expect(FINISH_CATALOG.map((s) => s.options.length)).toEqual(catalog)
    refreshOwnOptions(slots, [finish({ label: 'Teak, renamed' })])
    expect(beds.options.at(-1)!.label).toBe('Teak, renamed') // the same slot object the 3D view holds
    refreshOwnOptions(slots, [])
    expect(beds.options.some((o) => o.id === finish().id)).toBe(false)
  })
})

describe('records from outside (a share link, the company table) are checked before use', () => {
  it('takes well-formed records only; a file only ever by its hash in a company folder', () => {
    expect(isOwnItem(model())).toBe(true)
    expect(isOwnItem(finish())).toBe(true)
    expect(isOwnItem(model({ file: { hash: H, ext: 'glb', bytes: 10, path: `${ORG}/${H}.glb` } }))).toBe(true)
    expect(isOwnItem(model({ file: { hash: H, ext: 'glb', bytes: 10, path: `../${H}.glb` } }))).toBe(false)
    expect(isOwnItem(model({ file: { hash: H, ext: 'glb', bytes: 10, path: `${ORG}/${'c'.repeat(64)}.glb` } }))).toBe(false) // not its own file
    expect(isOwnItem(model({ id: 'sofa_02' }))).toBe(false) // never a kit id
    expect(isOwnItem(model({ sizeM: { x: 2, y: 0, z: 1 } }))).toBe(false)
    expect(isOwnItem(model({ category: 'spaceship' as never }))).toBe(false)
    expect(isOwnItem(model({ triangles: MAX_TRIANGLES + 1 }))).toBe(false)
    expect(isOwnItem(finish({ priceDeltaBdt: 1.5 }))).toBe(false) // integer BDT
    expect(isOwnItem(finish({ look: { color: 'red' } }))).toBe(false)
    expect(isOwnItem(finish({ look: { textureId: finish().id } }))).toBe(false) // a texture of the list, not another own one
    expect(isOwnItem({ ...model(), type: 'script' })).toBe(false)
    expect(isOwnItem(null)).toBe(false)
  })
})
