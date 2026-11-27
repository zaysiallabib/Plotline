/**
 * An architect's IFC arrives dressed (session 31 ifcmap): the outside finish from the walls' outer material layers and
 * IsExternal, railings as what the low wall is made of, the roof setting from IfcRoof and the slopes, a glass front's mullion
 * spacing and frames, the ground storey, the outside shape's surfaces named for Plotline's own pictures. Two small fixtures:
 * `outside.ifc` written by hand with names cut from the real files (Nordic housing's layers, Kleine Wohnung's railings),
 * `ifcopenhouse.ifc` (IfcOpenHouse, CC0, the 0.1 MB sample whose gable walls stood through its roof).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { importIfc, railRuns, roofSetting } from './ifc'
import { finishesOn } from './plan2d'
import { dressUvs, parseDress, readGlbJson } from './glb'
import { outerRuns } from '../furnish/finishes'

const read = async (name: string) => {
  const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
  return importIfc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), name)
}
const shellMaterials = (glb: ArrayBuffer) => {
  const { json } = readGlbJson(glb)
  const mats = json.materials as { name?: string }[]
  const prims = (json.meshes as { primitives: { material: number; attributes: Record<string, number> }[] }[])[0].primitives
  return prims.map((p) => ({ name: mats[p.material].name ?? '', uv: 'TEXCOORD_0' in p.attributes }))
}

describe('outside.ifc: a storey of timber-clad walls over an empty datum storey', () => {
  test('the street is the first storey that holds something; the empty one under it is left out', async () => {
    const r = await read('outside.ifc')
    expect(r.storeys.map((s) => [s.name, s.elevationM])).toEqual([
      ['Level_01', 0],
      ['Level_02', 3],
    ])
    expect(r.notes.some((n) => /street is at Level_01.*"Sea_Level".*left out/.test(n))).toBe(true)
  })

  test("the outer layer dresses each outer wall: the commonest is the building's, the one that differs is kept by its run", async () => {
    const r = await read('outside.ifc')
    expect(r.outside?.s_outside).toBe('fo_out_timber_slats')
    const g = r.storeys[0].unit
    const runs = outerRuns(g)
    const own = Object.entries(r.outside!).filter(([k]) => k.startsWith(`out:${g.id}:`))
    expect(own.map(([, v]) => v)).toContain('fo_out_concrete') // the one wall of "Betoniverhous"
    expect(own.every(([k]) => [...runs.values()].includes(k.split(':')[2]))).toBe(true)
    expect(r.materials?.map((m) => [m.name, m.finish])).toEqual([
      ['Puuverhous', 'fo_out_timber_slats'],
      ['Betoniverhous', 'fo_out_concrete'],
    ]) // (the inner "Gipskarton" wall is no outer wall: never listed)
  })

  test("a railing makes the low wall under it glass; one with nothing under it is a glass low wall of its own on its line", async () => {
    const r = await read('outside.ifc')
    const u = r.storeys[1].unit
    const low = u.walls.filter((w) => w.lowKind)
    expect(low.map((w) => w.lowKind)).toEqual(['glass', 'glass'])
    // its rails' colour from the railing's material names: polished stainless is a glass front's own (nothing kept), "Steel, Paint Finish, Dark Gray" anthracite
    expect(low.map((w) => [w.standsAlone ?? false, w.railColor])).toEqual([
      [false, undefined],
      [true, 'anthracite'],
    ])
    const alone = low.find((w) => w.standsAlone)!
    const [a, b] = [u.vertices.find((v) => v.id === alone.a)!, u.vertices.find((v) => v.id === alone.b)!]
    expect(Math.abs(b.x - a.x)).toBeCloseTo(6, 1)
    expect(a.y).toBeCloseTo(1.5, 2) // (plan y is the file's −y)
    expect(alone.heightM).toBeCloseTo(1, 1)
  })

  test("the roof slab's gravel is the roof setting; the glass front keeps its 1.2 m mullions and their anthracite frame", async () => {
    const r = await read('outside.ifc')
    expect(r.roof).toEqual({ kind: 'flat', covering: 'rc_gravel' })
    const glazing = r.storeys[1].unit.walls.flatMap((w) => w.openings).find((o) => o.bayM)
    expect(glazing?.bayM).toBeCloseTo(1.2, 2)
    expect(r.outside?.s_frames ?? Object.values(r.outside!).find((v) => v.startsWith('fo_frame_'))).toBe('fo_frame_anthracite')
  })

  test("the outside shape's dressed surfaces are named for their option, the building's own marked, with texture coordinates", async () => {
    const r = await read('outside.ifc')
    const mats = shellMaterials(r.shell!.glb).filter((m) => parseDress(m.name))
    expect(mats.map((m) => m.name).sort()).toEqual(['plotline:out:fo_out_concrete', 'plotline:out:fo_out_timber_slats:main', 'plotline:roof:rc_gravel:main'])
    expect(mats.every((m) => m.uv)).toBe(true)
  })

  test('a material name the person mapped is read their way', async () => {
    const b = readFileSync(new URL('./fixtures/outside.ifc', import.meta.url))
    const r = await importIfc(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 'outside.ifc', () => {}, { puuverhous: 'fo_out_clapboard' })
    expect(r.outside?.s_outside).toBe('fo_out_clapboard')
    expect(r.materials?.find((m) => m.name === 'Puuverhous')).toMatchObject({ finish: 'fo_out_clapboard', yours: true })
  })
})

describe('ifcopenhouse.ifc: brick under a gable roof', () => {
  test('its "Brick" walls are red brick (the file says nothing of IsExternal: every wall wears it); the roof a 45° gable', async () => {
    const r = await read('ifcopenhouse.ifc')
    expect(r.outside).toEqual({ s_outside: 'fo_out_brick_red' })
    expect(r.roof).toEqual({ kind: 'gable', pitchDeg: 45 })
  })

  test('its gable walls stop at the eaves instead of standing up to the peak through the roof', async () => {
    const r = await read('ifcopenhouse.ifc')
    const hs = r.storeys[0].unit.walls.map((w) => w.heightM)
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05) // all four as tall as the eave walls
    expect(r.notes.some((n) => /2 walls stop at their eaves/.test(n))).toBe(true)
  })
})

describe('the rules, on their own', () => {
  const face = (nx: number, ny: number, nz: number, x: number, y: number, area = 1) => ({ n: [nx, ny, nz] as [number, number, number], area, at: { x, y } })
  const s = Math.sin(Math.PI / 6), c = Math.cos(Math.PI / 6) // 30° slopes
  // a 10 × 4 m roof, long along plan x: faces spread over it
  const spread = (f: (x: number, y: number) => ReturnType<typeof face>[]) => [0, 5, 10].flatMap((x) => [0, 4].flatMap((y) => f(x, y)))
  test('roofSetting: two slopes facing across the long side are a gable along it, along it a gable across; one a shed; four a hip; level a flat roof', () => {
    expect(roofSetting([], spread((x, y) => [face(0, c, y ? s : -s, x, y)]))).toEqual({ kind: 'gable', pitchDeg: 30 })
    expect(roofSetting([], spread((x, y) => [face(x > 5 ? s : -s, c, 0, x, y)]))).toEqual({ kind: 'gable', pitchDeg: 30, ridge: 'short' })
    expect(roofSetting([], spread((x, y) => [face(0, c, s, x, y)]))).toMatchObject({ kind: 'shed', pitchDeg: 30 })
    expect(roofSetting([], spread((x, y) => [face(0, c, s, x, y), face(0, c, -s, x, y), face(s, c, 0, x, y), face(-s, c, 0, x, y)]))).toMatchObject({ kind: 'hip' })
    expect(roofSetting([], spread((x, y) => [face(0, 1, 0, x, y)]), 'rc_green')).toEqual({ kind: 'flat', covering: 'rc_green' })
  })
  test("roofSetting: the IfcRoof's own kind wins (by area); a freeform roof is the file's own shape; a covering of the other kind is dropped", () => {
    expect(roofSetting([{ kind: 'HIP_ROOF', area: 50 }, { kind: 'FLAT_ROOF', area: 5 }], spread((x, y) => [face(0, c, y ? s : -s, x, y)]))).toMatchObject({ kind: 'hip' })
    expect(roofSetting([{ kind: 'FREEFORM', area: 50 }], spread((x, y) => [face(0, c, s, x, y)]))).toBeNull()
    expect(roofSetting([], spread((x, y) => [face(0, 1, 0, x, y)]), 'rc_clay')).toEqual({ kind: 'flat' })
  })
  test("railRuns: a thin railing is one run; a balcony's U is its three sides, never the open one along the facade", () => {
    const thin = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.05 }, { x: 0, y: 0.05 }]
    expect(railRuns(thin, [])).toHaveLength(1)
    // a U open toward y = 0: sides x = 0, y = 2, x = 3, each a panel of two upright triangles
    const panel = (a: { x: number; y: number }, b: { x: number; y: number }): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }][] => [
      [a, b, b],
      [a, a, b],
    ]
    const u = [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 0 }]
    const runs = railRuns(u, [...panel(u[0], u[1]), ...panel(u[1], u[2]), ...panel(u[2], u[3])])
    expect(runs).toHaveLength(3)
    expect(runs.some(([a, b]) => a.y === 0 && b.y === 0)).toBe(false)
  })
  test('finishesOn: a wall of the joined plan takes the finish of the draft it lies on, a wall elsewhere none', () => {
    const unit = {
      vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }, { id: 'c', x: 5, y: 0 }, { id: 'd', x: 5, y: 3 }],
      walls: [
        { id: 'w1', a: 'a', b: 'b', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w2', a: 'b', b: 'c', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'w3', a: 'c', b: 'd', thicknessM: 0.25, heightM: 3, openings: [] },
      ],
    }
    const got = finishesOn(unit, [{ pts: [{ x: 0, y: 0.02 }, { x: 5, y: 0.02 }], thicknessM: 0.25, finish: 'fo_out_brick_red' }])
    expect([...got]).toEqual([
      ['w1', 'fo_out_brick_red'],
      ['w2', 'fo_out_brick_red'],
    ])
  })
  test('dressUvs: a wall face runs along and up in metres, a level face by X / Z', () => {
    const P = new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 1, 5, 7]), N = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0])
    const uv = dressUvs(P, N)
    expect(Math.abs(uv[2] - uv[0])).toBeCloseTo(2) // along the wall
    expect(uv[5] - uv[3]).toBeCloseTo(3) // up it, the right way up
    expect([uv[6], uv[7]]).toEqual([1, 7])
  })
})
