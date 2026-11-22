import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SAMPLES, sampleLine } from './samples'

const DIR = new URL('../../public/samples/', import.meta.url)

describe('Try a sample: the list, public/samples and its MANIFEST agree', () => {
  it('every listed file is in the folder at its size, named in the manifest; nothing else is in the folder', () => {
    const manifest = readFileSync(new URL('MANIFEST.md', DIR), 'utf8')
    for (const s of SAMPLES) {
      expect(statSync(new URL(s.file, DIR)).size, s.file).toBe(s.bytes)
      expect(s.bytes, `${s.file} is a one-click sample: at most 3 MB`).toBeLessThanOrEqual(3e6)
      expect(manifest, `${s.file} in MANIFEST.md`).toContain(`| ${s.file} |`)
      expect(s.credit, `${s.file} names its maker and licence`).toMatch(/CC0|CC BY|public domain|Open Government/i)
    }
    expect(readdirSync(DIR).filter((f) => f !== 'MANIFEST.md').sort()).toEqual(SAMPLES.map((s) => s.file).sort())
  })
  it('at least one sample of every kind of file Plotline reads', () => {
    const kinds = new Set(SAMPLES.map((s) => s.file.split('.').pop()))
    for (const k of ['ifc', 'dxf', 'pdf', 'svg']) expect(kinds, k).toContain(k)
    expect([...kinds].some((k) => /^(glb|gltf|obj|stl|zip)$/.test(k!)), 'a 3D model').toBe(true)
  })
  it('the size line', () => {
    expect(sampleLine({ file: 'a.ifc', name: '', bytes: 1_234_567, credit: '' })).toBe('IFC · 1.2 MB')
    expect(sampleLine({ file: 'b.dxf', name: '', bytes: 48_200, credit: '' })).toBe('DXF · 48 KB')
  })
})
