import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { cleanPath, findSibling, mainFile, siblingsOf, unzipFiles } from './bundle'

const blob = (s: string) => new Blob([s])

describe('a drop of several files', () => {
  it('opens the file that holds the most: IFC over a model over a drawing; arc over str / mep; the top of the folder', () => {
    expect(mainFile(['plan.pdf', 'house.gltf', 'house.bin', 'Textures/a.png'])).toBe('house.gltf')
    expect(mainFile(['a.dxf', 'b.svg'])).toBe('a.dxf')
    expect(mainFile(['x/str.ifc', 'x/mep.ifc', 'x/arc.ifc', 'model.glb'])).toBe('x/arc.ifc')
    expect(mainFile(['deep/inner/b.glb', 'a.glb'])).toBe('a.glb')
    expect(mainFile(['photo.jpg', 'notes.txt'])).toBeNull()
    expect(mainFile(['building.IFCZIP'])).toBe('building.IFCZIP')
  })

  it('finds what a loader asks for: from the main file\'s folder, %-escaped, Windows paths, by name as a fallback', () => {
    const files = [
      { path: 'Models/house.gltf', data: blob('{}') },
      { path: 'Models/house data.bin', data: blob('bin') },
      { path: 'Models/Textures/colormap.png', data: blob('png') },
      { path: 'other/wood.jpg', data: blob('jpg') },
    ]
    const s = siblingsOf(files, 'Models/house.gltf')
    expect(findSibling(s, 'house%20data.bin')).toBe(files[1].data)
    expect(findSibling(s, './Textures/colormap.png')).toBe(files[2].data)
    expect(findSibling(s, 'textures\\COLORMAP.png')).toBe(files[2].data)
    expect(findSibling(s, 'C:\\Users\\artist\\maps\\wood.jpg')).toBe(files[3].data)
    expect(findSibling(s, 'missing.png')).toBeNull()
    expect(findSibling(s, 'data:image/png;base64,AAAA')).toBeNull()
    expect(cleanPath('.\\a\\b.png')).toBe('a/b.png')
  })

  it('unzips: Windows\' backslashes become slashes, folders and Mac shadow files are left out', () => {
    const z = zipSync({ 'house.gltf': strToU8('{}'), 'Textures\\colormap.png': strToU8('png'), '__MACOSX/._house.gltf': strToU8('x'), 'sub/': new Uint8Array(0) })
    const files = unzipFiles(z)
    expect(files.map((f) => f.path).sort()).toEqual(['Textures/colormap.png', 'house.gltf'])
  })
})
