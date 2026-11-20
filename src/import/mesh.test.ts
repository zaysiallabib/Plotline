import { describe, expect, it } from 'vitest'
import { framing, guessUnit, inFrame, isGlb, isGltfJson, missingBuffers, rhinoUnitScale } from './mesh'

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
