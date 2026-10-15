import { describe, expect, test } from 'vitest'
import { bandWalls } from './bands'
import { normalPolarity, outlinedWalls } from './raster'
import { traceWalls } from './walls'
import type { Gray } from './types'

/** a white sheet with filled axis-aligned rectangles (x, y, w, h) in `dark` grey */
const sheet = (w: number, h: number, rects: [number, number, number, number][], dark = 30): Gray => {
  const data = new Uint8Array(w * h).fill(255)
  for (const [x, y, rw, rh] of rects) for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) data[yy * w + xx] = dark
  return { width: w, height: h, data }
}
const ink = (g: Gray) => g.data.map((v) => (v < 128 ? 1 : 0))
const O = { minThPx: 4, maxThPx: 40, minLenPx: 15 }

describe('bandWalls: straight bands of exactly the drawn thickness', () => {
  test('a room of 8 px walls with a 16 px front: four bands, each as thick as drawn, dead straight', () => {
    const g = sheet(300, 200, [
      [20, 20, 260, 16], // front, 16 px
      [20, 20, 8, 160], // left
      [272, 20, 8, 160], // right
      [20, 172, 260, 8], // back
    ])
    const bands = bandWalls(g, ink(g), O)
    const horiz = bands.filter((b) => b.a.y === b.b.y), vert = bands.filter((b) => b.a.x === b.b.x)
    expect(horiz.length).toBe(2)
    expect(vert.length).toBe(2)
    const front = horiz.find((b) => b.a.y < 100)!, back = horiz.find((b) => b.a.y > 100)!
    expect(front.thicknessPx).toBeCloseTo(16, 5)
    expect(back.thicknessPx).toBeCloseTo(8, 5)
    expect(front.a.y).toBeCloseTo(27.5, 5) // the middle of rows 20..35
    expect(back.a.y).toBeCloseTo(175.5, 5)
    for (const v of vert) expect(v.thicknessPx).toBeCloseTo(8, 5)
    // each band runs the wall's whole length, through the corner blocks (the front is the widest: the sides stop at it)
    expect(Math.min(front.a.x, front.b.x)).toBeLessThanOrEqual(21)
    expect(Math.max(front.a.x, front.b.x)).toBeGreaterThanOrEqual(278)
    for (const v of vert) expect(Math.max(v.a.y, v.b.y)).toBeGreaterThanOrEqual(178)
  })

  test('a column widening a wall is the same wall; a lone square block is none', () => {
    const g = sheet(300, 120, [
      [20, 50, 260, 8], // the wall
      [140, 46, 16, 16], // a column on it, 16 × 16
      [40, 90, 14, 14], // a lone block
    ])
    const bands = bandWalls(g, ink(g), O)
    expect(bands.length).toBe(1)
    expect(bands[0].thicknessPx).toBeCloseTo(8, 5)
    expect(Math.abs(bands[0].b.x - bands[0].a.x)).toBeGreaterThanOrEqual(258)
  })

  test('an anti-aliased edge counts by its coverage: a 7.5 px wall reads 7.5, not 8', () => {
    const g = sheet(200, 100, [[20, 40, 160, 8]])
    for (let x = 20; x < 180; x++) g.data[47 * 200 + x] = 120 // the last row 60 % covered: (255 − 120) / (255 − 30)
    const [b] = bandWalls(g, ink(g), O)
    expect(b.thicknessPx).toBeCloseTo(7.6, 1)
  })

  test('traceWalls with the band tracker keeps the skeleton only where no band covers it (a chamfer)', () => {
    const g = sheet(240, 200, [
      [20, 20, 200, 8],
      [20, 20, 8, 160],
      [20, 172, 200, 8],
      [212, 60, 8, 120],
    ])
    // a 45° chamfer from (212, 60) up-left to (172, 20), 8 px wide
    for (let t = 0; t <= 40; t++) for (let d = 0; d < 8; d++) for (let e = 0; e < 8; e++) g.data[(20 + t + d) * 240 + (212 - t + e)] = 30
    const t = traceWalls(g, { tracker: 'bands', halfPx: 4 })
    const axis = t.walls.filter((w) => w.a.x === w.b.x || w.a.y === w.b.y)
    const angled = t.walls.filter((w) => w.a.x !== w.b.x && w.a.y !== w.b.y)
    expect(axis.length).toBeGreaterThanOrEqual(4)
    expect(angled.length).toBeGreaterThanOrEqual(1)
    for (const w of axis) expect(Math.abs(w.thicknessPx - 8)).toBeLessThan(1.5)
  })
})

describe('normalPolarity: white lines on a dark page', () => {
  const room = (): Gray =>
    sheet(300, 200, [
      [20, 20, 260, 10],
      [20, 20, 10, 160],
      [270, 20, 10, 160],
      [20, 170, 260, 10],
      [120, 90, 40, 3], // a thin furniture line
    ])
  test('the dark sheet is turned over and traces the same walls as the light one; a light sheet is left alone', () => {
    const light = room()
    const dark: Gray = { ...light, data: light.data.map((v) => Math.round(70 + ((255 - v) * 170) / 255)) } // grey page, white lines
    const back = normalPolarity(dark)
    expect(back).not.toBe(dark)
    expect(normalPolarity(light)).toBe(light)
    const walls = (g: Gray) => traceWalls(g, { tracker: 'tracks', halfPx: 5 }).walls.map((w) => [w.a, w.b, Math.round(w.thicknessPx)])
    expect(walls(back)).toEqual(walls({ ...light, data: light.data.map((v) => 255 - Math.round(70 + ((255 - v) * 170) / 255)) }))
    expect(walls(back).length).toBe(4)
  })
  test('a white panel on a dark page (a plan printed on a card) is no line work: left alone', () => {
    const data = new Uint8Array(300 * 200).fill(40)
    for (let y = 30; y < 170; y++) for (let x = 30; x < 150; x++) data[y * 300 + x] = 250
    const p = normalPolarity({ width: 300, height: 200, data })
    expect(p.data[100 * 300 + 100]).toBe(250) // not turned over (its page is made paper: raster.test)
  })
})

describe('outlinedWalls: a grey band between two thin dark outlines is wall ink', () => {
  // a room of 10 px walls (k = 70 px/m: 0.14 m) drawn bti's way: two 2 px dark outlines, a 6 px grey fill between, a grey
  // floor inside, white paper outside; a black column at one corner
  const outlined = (fill = 155): Gray => {
    const w = 300, h = 220, d = new Uint8Array(w * h).fill(255)
    const box = (x0: number, y0: number, x1: number, y1: number, v: number) => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) d[y * w + x] = v
    }
    box(20, 20, 280, 200, 30) // outer outline
    box(22, 22, 278, 198, fill) // the band's fill
    box(28, 28, 272, 192, 30) // inner outline
    box(30, 30, 270, 190, 218) // the floor
    box(20, 20, 40, 40, 10) // a column
    return { width: w, height: h, data: d }
  }
  test('the band is painted solid: four walls the band thick, no breaks; the floor and the paper stay', () => {
    const g = outlined()
    const s = outlinedWalls(g, 70)!
    expect(s).not.toBeNull()
    expect(s.data[25 * 300 + 150]).toBe(0) // the fill
    expect(s.data[195 * 300 + 275]).toBe(0) // the corner's fill (no clean crossing there)
    expect(s.data[100 * 300 + 150]).toBe(218)
    expect(s.data[5 * 300 + 150]).toBe(255)
    const walls = traceWalls(s, { tracker: 'tracks', halfPx: 4.5 }).walls
    expect(walls.length).toBe(4)
    for (const x of walls) expect(x.thicknessPx).toBeGreaterThan(9)
  })
  test('solid walls or a tile floor: left alone (a hollow wall is read since step 4: raster.test)', () => {
    expect(outlinedWalls(sheet(300, 200, [[20, 20, 260, 10], [20, 20, 10, 160], [270, 20, 10, 160], [20, 170, 260, 10]]), 70)).toBeNull()
    // tiles: 6 px squares of the floor's own tone between 2 px dark joints — the same tone across every joint
    const w = 300, h = 200, d = new Uint8Array(w * h).fill(200)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x % 8 < 2 || y % 8 < 2) d[y * w + x] = 40
    expect(outlinedWalls({ width: w, height: h, data: d }, 70)).toBeNull()
  })
})
