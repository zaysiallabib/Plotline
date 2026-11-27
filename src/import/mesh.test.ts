import { describe, expect, it } from 'vitest'
import { framing, guessUnit, inFrame, isGlb, isGltfJson, missingBuffers, modelOffset, rhinoUnitScale, zUpGuess } from './mesh'

describe('a model stands upright and by its own origin (session 31 polish3)', () => {
  it('a file that names no up axis is Z up when its header says so, or when read as Y up it lies on its side', () => {
    // the 3DBAG Delft tile: 1132 × 1178 m of city, 108 m of heights along Z, "# Created by Geoflow"
    const delft = { min: [84500, 445805, -12.7] as [number, number, number], max: [85632, 446983, 94.9] as [number, number, number] }
    expect(zUpGuess(delft, '# Created by Geoflow')).toBe(true)
    expect(zUpGuess(delft)).toBe(true) // (its box alone: a slab 108 m deep standing 1178 m tall)
    expect(zUpGuess({ min: [0, 0, 0], max: [10, 1, 10] }, '# Blender 4.2 OBJ')).toBe(false)
    // a Y-up building (Kenney's): 1.5 wide, 1.3 tall, 1.2 deep — upright as read
    expect(zUpGuess({ min: [-0.75, 0, -0.6], max: [0.75, 1.3, 0.6] })).toBe(false)
    expect(zUpGuess({ min: [0, 0, 0], max: [30, 20, 60] }, 'exported from Revit, Z up')).toBe(true)
  })
  it('a model on a CAD drawing stands by their shared origin; centred when its origin is nowhere near the drawing or the drawing has none', () => {
    // a 20 × 10 m model whose origin is its south-west corner: in the centred frame the origin sits at (−10, +5)
    const box = { min: [-10, 0, -5] as [number, number, number], max: [10, 18, 5] as [number, number, number] }
    const at = { x: -10, y: 5 }
    const drawing = { minX: 2, minY: 0, maxX: 22, maxY: 10 } // the DXF's walls; the file's 0, 0 is at plan (2, 10)
    expect(modelOffset(box, at, drawing, { x: 2, y: 10 })).toEqual({ x: 12, y: 5, byOrigin: true })
    expect(modelOffset(box, at, drawing)).toEqual({ x: 12, y: 5, byOrigin: false }) // (a drawing traced on a picture: centred, as before)
    expect(modelOffset(box, { x: -84000, y: 445000 }, drawing, { x: 2, y: 10 })).toEqual({ x: 12, y: 5, byOrigin: false }) // (a survey point km away)
    expect(modelOffset(box, at, null, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, byOrigin: false })
  })
})

describe('mesh import: the pure parts', () => {
  it('guesses the unit from the extent: metres for a building, millimetres for a big number', () => {
    expect(guessUnit(42).scale).toBe(1)
    expect(guessUnit(300).scale).toBe(1) // feet or a big site: metres, said in the note
    expect(guessUnit(300).note).toMatch(/feet/)
    expect(guessUnit(450).scale).toBe(0.001)
    expect(guessUnit(42000).scale).toBe(0.001)
    expect(guessUnit(0).scale).toBe(1)
  })

  it('a .gltf dropped without its .bin is refused with what is missing; embedded buffers need nothing', () => {
    const gltf = { buffers: [{ uri: 'house.bin' }, { uri: 'data:application/octet-stream;base64,AAAA' }, {}] }
    expect(missingBuffers(gltf, () => false)).toEqual(['house.bin'])
    expect(missingBuffers(gltf, (u) => u === 'house.bin')).toEqual([])
    expect(missingBuffers({}, () => false)).toEqual([])
  })

  it('reads Rhino unit systems', () => {
    expect(rhinoUnitScale(4)).toBe(1)
    expect(rhinoUnitScale(2)).toBe(0.001)
    expect(rhinoUnitScale(9)).toBe(0.3048)
    expect(rhinoUnitScale(0)).toBeNull()
    expect(rhinoUnitScale(undefined)).toBeNull()
  })

  it('checks the glTF magic and the .gltf JSON', () => {
    const b = new ArrayBuffer(12)
    const v = new DataView(b)
    v.setUint32(0, 0x46546c67, true)
    v.setUint32(4, 2, true)
    expect(isGlb(b)).toBe(true)
    v.setUint32(4, 1, true)
    expect(isGlb(b)).toBe(false)
    expect(isGlb(new ArrayBuffer(4))).toBe(false)
    expect(isGltfJson('{"asset":{"version":"2.0"}}')).toBe(true)
    expect(isGltfJson('{"walls":[]}')).toBe(false)
    expect(isGltfJson('not json')).toBe(false)
  })

  it('frames the shell: lowest point to Y = 0, footprint centred, after the scale', () => {
    const box = { min: [10, -3, 20] as [number, number, number], max: [30, 27, 40] as [number, number, number] }
    expect(framing(box)).toEqual({ dx: -20, dy: 3, dz: -30 })
    expect(framing(box, 0.001)).toEqual({ dx: -0.02, dy: 0.003, dz: -0.03 })
    expect(inFrame(box)).toBe(false)
    expect(inFrame({ min: [-10, 0.004, -10], max: [10, 30, 10] })).toBe(true)
  })
})
