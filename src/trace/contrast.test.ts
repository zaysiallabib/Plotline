/** A pale scan stretched to full contrast before anything is read (raster.ts restoreFadedInk; from Maheer's Plotline 2.0, his tests). */
import { describe, expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import { traceWalls } from './walls'
import { loadPgm } from './evalio'
import { normalPolarity } from './raster'

describe('a pale scan', () => {
  test('paper grain and a solid grey panel keep their tones', () => {
    const width = 300, height = 200
    const panel = { width, height, data: new Uint8Array(width * height).fill(250) }
    for (let y = 40; y < 160; y++) panel.data.fill(180, y * width + 90, y * width + 210)
    expect(normalPolarity(panel)).toBe(panel)
    const noise = { width, height, data: panel.data.map((_, i) => 235 + (i % 20)) }
    expect(normalPolarity(noise)).toBe(noise)
  })
  test('his faded copy of a Sheltech Level 2 crop (grey 180..250: no ink under the wall cap) is stretched and traces its walls again; a normal sheet is left as it is', () => {
    // Firefox-decoded crop of Demo drawings/Sheltech/Level 2.jpg, x355..515, y330..475 (the lift / toilet junction)
    const g = loadPgm(fileURLToPath(new URL('../data/fixtures/stepped-junction.pgm', import.meta.url)))!
    expect(normalPolarity(g)).toBe(g)
    const faded = { ...g, data: g.data.map((v) => Math.round(180 + (v * 70) / 255)) }
    const opts = { tracker: 'tracks' as const, halfPx: (0.127 * 27.075658723705732) / 2 }
    const restored = normalPolarity(faded)
    expect(Math.min(...restored.data)).toBeLessThan(60)
    expect(traceWalls(faded, opts).walls).toEqual([])
    const walls = traceWalls(restored, opts).walls.length
    expect(walls).toBeGreaterThan(0)
    expect(walls).toBeGreaterThanOrEqual(0.8 * traceWalls(g, opts).walls.length)
  })
})
