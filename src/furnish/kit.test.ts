import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { entry } from '../studio/library'
import { library } from '../studio/furniture'
import { KIT, kitAsset, placementLabel, resizeLimits } from './kit'
import { PROCEDURAL } from './procedural.meta'

const ids = [...Object.keys(KIT), ...Object.keys(PROCEDURAL)]
const pieces = ids.filter((id) => kitAsset(id)!.kind !== 'stair') // stairs are building, not furniture

describe('kit integrity (the library)', () => {
  it('no id twice; every piece is in the library with a size, a kind, a room, tags and a footprint', () => {
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of pieces) {
      const e = entry(id)
      expect(e, id).toBeDefined()
      for (const k of ['x', 'y', 'z'] as const) expect(e!.size[k], `${id}.${k}`).toBeGreaterThan(0)
      expect(e!.kind, id).toBeTruthy()
      expect(e!.rooms.length, id).toBeGreaterThan(0)
      expect(e!.tags.length, id).toBeGreaterThan(0)
      expect(e!.feet, id).toMatch(/^\d+'-\d+" × \d+'-\d+"$/)
    }
    // no two rows alike in one group
    for (const t of library()) expect(new Set(t.items.map((i) => i.label)).size, t.tab).toBe(t.items.length)
  })

  it('every scanned model is on disk and in public/assets/MANIFEST.md (its folder and its Poly Haven page), CC0', () => {
    const manifest = readFileSync('public/assets/MANIFEST.md', 'utf8')
    for (const a of Object.values(KIT)) {
      expect(existsSync(`public${a.url}`), a.url).toBe(true)
      expect(manifest, a.id).toContain(`models/${a.url.split('/')[3]}/`)
      expect(manifest, a.id).toContain(a.source)
      expect(a.license).toBe('CC0')
    }
  })

  it('every piece but the stairs and curtains resizes; at its kit size it is called by its kit label', () => {
    for (const id of pieces) {
      if (id === 'curtains') continue
      expect(resizeLimits(id), id).not.toBeNull()
      expect(placementLabel({ assetId: id }), id).toBe(kitAsset(id)!.label)
    }
  })
})
