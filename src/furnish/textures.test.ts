import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import type { Unit } from '../core'
import { TEXTURES } from './textures'

const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
// lazy glob: only the keys (files on disk) are used, nothing is loaded
const onDisk = new Set(Object.keys(import.meta.glob('../../public/assets/textures/*/*.jpg')).map((k) => k.replace('../../public', '')))

describe('finish options (every unit JSON)', () => {
  for (const [file, unit] of Object.entries(units))
    it(`${file}: options are structured and reference registered textures`, () => {
      for (const slot of unit.finishSlots) {
        expect(slot.options.some((o) => o.id === slot.defaultOptionId), `${slot.id} default`).toBe(true)
        for (const o of slot.options) {
          expect(Number.isInteger(o.priceDeltaBdt), `${o.id} price`).toBe(true)
          expect([o.brand, o.sku, o.label].every((s) => typeof s === 'string' && s.trim() !== ''), `${o.id} brand/sku/label`).toBe(true)
          if (o.material.kind === 'pbr') expect(TEXTURES[o.material.textureId], `${o.id} → ${o.material.textureId}`).toBeDefined()
        }
      }
    })

  it('every registered texture file is on disk', () => {
    for (const t of Object.values(TEXTURES))
      for (const p of [t.albedo, t.normal, t.roughness, t.ao]) if (p) expect(onDisk.has(p), p).toBe(true)
  })
})

describe('the outside sets (session 31 facade)', () => {
  const OUTSIDE = ['brick_red', 'brick_painted', 'stone_blocks', 'timber_slats', 'timber_clapboard', 'metal_seam', 'metal_corrugated', 'concrete_fair', 'concrete_precast', 'panel_grid']
  it('each: CC0, its source page and folder in MANIFEST.md, its real size, three maps on disk — under 6 MB together', () => {
    const manifest = readFileSync('public/assets/MANIFEST.md', 'utf8')
    let bytes = 0
    for (const id of OUTSIDE) {
      const t = TEXTURES[id]
      expect(t, id).toBeDefined()
      expect(t.license).toBe('CC0')
      expect(t.repeatM, id).toBeGreaterThanOrEqual(1)
      expect(manifest, id).toContain(`| ${id} | texture | ${t.source} |`)
      for (const p of [t.albedo, t.normal, t.roughness]) bytes += statSync(`public${p}`).size
    }
    expect(bytes).toBeLessThan(6 * 1024 * 1024)
  })
})
