/** A wall that changes thickness keeps its short thick riser (tracks.ts side contrast; from Maheer's Plotline 2.0, his tests). */
import { describe, expect, test } from 'vitest'
import { fileURLToPath } from 'node:url'
import { traceWalls } from './walls'
import { loadPgm } from './evalio'
import { normalPolarity } from './raster'
import type { Gray } from './types'

function stepped(k: number, ink: number) {
  const width = Math.round(10 * k), height = Math.round(7 * k)
  const g: Gray = { width, height, data: new Uint8Array(width * height).fill(245) }
  const box = (x0: number, y0: number, x1: number, y1: number, value = ink) => {
    for (let y = Math.round(y0 * k); y < Math.round(y1 * k); y++) for (let x = Math.round(x0 * k); x < Math.round(x1 * k); x++) g.data[y * width + x] = value
  }
  // offset walls round a shaft: a short thick riser going on as a thinner nib; long runs set both thickness classes
  box(4, 1, 8, 1.34)
  box(1, 1.71, 4.34, 2.05)
  box(4, 1, 4.34, 2.05)
  box(4.14, 2.05, 4.27, 2.75)
  box(1, 4, 8, 4.13)
  box(1, 5, 8, 5.34)
  return { g, box }
}

describe('a wall that changes thickness', () => {
  test('a pale scan is stretched to full contrast; paper grain and a solid grey panel keep their tones (from Maheer\'s Plotline 2.0)', () => {
    const width = 300, height = 200
    const panel = { width, height, data: new Uint8Array(width * height).fill(250) }
    for (let y = 40; y < 160; y++) panel.data.fill(180, y * width + 90, y * width + 210)
    expect(normalPolarity(panel)).toBe(panel)
    const noise = { width, height, data: panel.data.map((_, i) => 235 + (i % 20)) }
    expect(normalPolarity(noise)).toBe(noise)
  })
  test.each(['original', 'faded'])('the %s Sheltech Level 2 crop keeps the short wall at the lift junction (the toilet is not joined to the lift)', (variant) => {
    // Firefox-decoded crop of Demo drawings/Sheltech/Level 2.jpg, x355..515, y330..475: the wall at x434..444 joins y404
    // to y423, then goes on as a thin jamb; faded = his own fade (grey 180..250: no ink under the 160 cap at all)
    const g = loadPgm(fileURLToPath(new URL('../data/fixtures/stepped-junction.pgm', import.meta.url)))!
    const input = variant === 'faded' ? { ...g, data: g.data.map((v) => Math.round(180 + (v * 70) / 255)) } : g
    const normalized = normalPolarity(input)
    if (variant === 'original') expect(normalized).toBe(g)
    const result = traceWalls(normalized, { tracker: 'tracks', halfPx: (0.127 * 27.075658723705732) / 2 })
    const riser = result.walls.filter((w) => Math.abs(w.a.x - w.b.x) < 2 && w.a.x > 79 && w.a.x < 90 && Math.min(w.a.y, w.b.y) < 80 && Math.max(w.a.y, w.b.y) > 93)
    expect(riser.length).toBe(1)
  })
  test.each([27, 50, 80])('the ink-backed short riser is kept at %i px/m, on its drawn band', (k) => {
    const { g } = stepped(k, 10)
    const result = traceWalls(g, { tracker: 'tracks', halfPx: (0.127 * k) / 2 })
    const riser = result.walls.filter((w) => Math.abs(w.a.x - w.b.x) < k * 0.04 && Math.abs(w.a.x / k - 4.17) < 0.09 && Math.min(w.a.y, w.b.y) / k < 1.5 && Math.max(w.a.y, w.b.y) / k > 1.7)
    expect(riser.length).toBe(1)
    // its centre on the drawn band: no diagonal short cut across the dogleg
    expect(riser[0].a.x / k).toBeGreaterThan(4)
    expect(riser[0].a.x / k).toBeLessThan(4.34)
  })
  test('a low-contrast fill is still no wall', () => {
    const { g } = stepped(50, 220)
    expect(traceWalls(g, { tracker: 'tracks', halfPx: (0.127 * 50) / 2, darkMax: 230 }).walls).toEqual([])
  })
  test('a paper gap in a stepped wall is not filled', () => {
    const k = 50, { g, box } = stepped(k, 10)
    box(4, 1.4, 4.34, 1.85, 245)
    const result = traceWalls(g, { tracker: 'tracks', halfPx: (0.127 * k) / 2 })
    expect(result.walls.some((w) => Math.abs(w.a.x / k - 4.17) < 0.09 && Math.abs(w.b.x / k - 4.17) < 0.09 && Math.min(w.a.y, w.b.y) / k < 1.4 && Math.max(w.a.y, w.b.y) / k > 1.85)).toBe(false)
  })
})
