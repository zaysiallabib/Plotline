import { describe, expect, test } from 'vitest'
import { furnitureMask, hatchMask, normalPolarity } from './raster'
import type { Gray } from './types'

const K = 50 // px per m
/** a blank 10 × 8 m sheet; fill(x0, y0, x1, y1) in metres, grey 0 */
function sheet(): { g: Gray; fill: (x0: number, y0: number, x1: number, y1: number) => void; at: (x: number, y: number) => number } {
  const width = 10 * K, height = 8 * K
  const g: Gray = { width, height, data: new Uint8Array(width * height).fill(255) }
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.round(y0 * K); y < Math.round(y1 * K); y++) for (let x = Math.round(x0 * K); x < Math.round(x1 * K); x++) g.data[y * width + x] = 0
  }
  return { g, fill, at: (x: number, y: number) => Math.round(y * K) * width + Math.round(x * K) }
}
/** a 1 px pen rectangle x0..x1 × y0..y1 (m) */
const outline = (fill: ReturnType<typeof sheet>['fill'], x0: number, y0: number, x1: number, y1: number) => {
  fill(x0, y0, x1, y0 + 0.02), fill(x0, y1 - 0.02, x1, y1), fill(x0, y0, x0 + 0.02, y1), fill(x1 - 0.02, y0, x1, y1)
}

describe('furnitureMask (founder 2026-10-15: furniture is not building)', () => {
  test('a chair blob and a bed outline standing free are furniture; the walls, a wall stub with a basin hung on it and an open door swing are not', () => {
    const { g, fill, at } = sheet()
    // a 8 × 6 m room of 0.2 m walls
    fill(1, 1, 9, 1.2), fill(1, 6.8, 9, 7), fill(1, 1, 1.2, 7), fill(8.8, 1, 9, 7)
    fill(6, 2, 6.45, 2.45) // the chair
    outline(fill, 2, 2, 3.6, 4) // the bed…
    outline(fill, 2.2, 2.2, 2.7, 2.5) // …and a pillow on it
    fill(5, 5, 6.2, 5.13), outline(fill, 5.2, 5.13, 6, 5.63) // a 1.2 m wall stub between two doors with a basin hung on it
    fill(7, 4, 7.9, 4.02), fill(7, 4, 7.02, 4.9) // an open door leaf + jamb line (an L: closes nothing)
    const m = furnitureMask(g, K, 128)!
    expect(m[at(6.2, 2.2)]).toBe(1) // the chair
    expect(m[at(2.01, 3)]).toBe(1) // the bed's edge…
    expect(m[at(3, 3.5)]).toBe(1) // …and what it closes in
    expect(m[at(1.1, 3)]).toBe(0) // a wall
    expect(m[at(5.5, 5.06)]).toBe(0) // the stub (and its basin): a wall's band, not furniture
    expect(m[at(7.5, 4.01)]).toBe(0) // the door's L
  })
})

describe('hatchMask (founder 2026-10-15: hatch is texture, never a wall)', () => {
  test('thin lines close together are hatch; a hollow wall\'s two outlines, a window\'s three panes and a dashed line are not', () => {
    const { g, at } = sheet()
    const px = (x: number, y: number) => (g.data[y * g.width + x] = 0)
    // hatch: 8 vertical 1 px lines 3 px (6 cm) apart, 0.6 m long
    for (let i = 0; i < 8; i++) for (let y = 100; y < 130; y++) px(100 + 3 * i, y)
    // a hollow wall: two horizontal lines 6 px apart; a window: three lines 3 px apart
    for (let x = 200; x < 300; x++) px(x, 100), px(x, 106), px(x, 200), px(x, 203), px(x, 206)
    // a dashed line: 4 px dashes, 3 px gaps
    for (let x = 200; x < 300; x++) if (x % 7 < 4) px(x, 300)
    const m = hatchMask(g, K, 128)!
    expect(m[115 * g.width + 109]).toBe(1)
    expect(m[100 * g.width + 250]).toBe(0)
    expect(m[203 * g.width + 250]).toBe(0)
    expect(m[300 * g.width + 201]).toBe(0)
    expect(m[at(1, 1)]).toBe(0)
  })
})

describe('normalPolarity: a plan printed as a light panel on a dark page', () => {
  test('the page is made paper; the plan and its black outer walls keep their tones', () => {
    const { g, fill, at } = sheet()
    g.data.fill(100) // a grey card
    for (let y = Math.round(1 * K); y < Math.round(5 * K); y++) for (let x = Math.round(1 * K); x < Math.round(5 * K); x++) g.data[y * g.width + x] = 235 // the plan's floor
    fill(1, 1, 5, 1.25), fill(1, 4.75, 5, 5), fill(1, 1, 1.25, 5), fill(4.75, 1, 5, 5), fill(3, 1, 3.12, 4) // its walls
    const p = normalPolarity(g)
    expect(p.data[at(0.5, 0.5)]).toBe(255) // the page
    expect(p.data[at(1.1, 3)]).toBe(0) // an outer wall
    expect(p.data[at(2, 3)]).toBe(235) // the floor
  })
})
