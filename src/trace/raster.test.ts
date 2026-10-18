import { describe, expect, test } from 'vitest'
import { colourPage, dashMask, furnitureMask, hatchMask, lightWalls, normalPolarity, outlinedWalls } from './raster'
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

describe('outlinedWalls (step 4): walls that are not solid ink', () => {
  // a 10 × 8 m flat at K px/m: hollow 0.15 m walls (two 1 px lines, `fill` between) around four rooms, `floor` inside, `page` outside
  const hollow = (line: number, fill: number, floor: number, page: number) => {
    const { g, at } = sheet()
    g.data.fill(page)
    const box = (x0: number, y0: number, x1: number, y1: number, v: number) => {
      for (let y = Math.round(y0 * K); y < Math.round(y1 * K); y++) for (let x = Math.round(x0 * K); x < Math.round(x1 * K); x++) g.data[y * g.width + x] = v
    }
    box(1, 1, 9, 7, floor)
    // walls as centre lines: outer box, a cross inside
    const wall = (x0: number, y0: number, x1: number, y1: number) => {
      const t = 0.15 / 2
      box(x0 - t, y0 - t, x1 + t, y1 + t, line)
      box(x0 - t + 0.02, y0 - t + 0.02, x1 + t - 0.02, y1 + t - 0.02, fill)
    }
    for (const [a, b, c, d] of [[1, 1, 9, 1], [1, 7, 9, 7], [1, 1, 1, 7], [9, 1, 9, 7], [5, 1, 5, 7], [1, 4, 9, 4]]) wall(a, b, c, d)
    // the corners and crossings: the fill runs through (no line across a T)
    return { g, at, box }
  }
  test('paper between two thin grey lines on white: painted solid', () => {
    const { g, at } = hollow(150, 250, 235, 255)
    const s = outlinedWalls(g, K)!
    expect(s).not.toBeNull()
    expect(s.data[at(3, 1)]).toBe(0) // a wall's middle
    expect(s.data[at(1, 3)]).toBe(0)
    expect(s.data[at(3, 2.5)]).toBe(235) // a floor
    expect(s.halfPx).toBeGreaterThan(3)
  })
  test('paper between two thin dark lines on a grey page (the CAD look): painted solid', () => {
    const { g, at } = hollow(60, 250, 250, 140)
    const s = outlinedWalls(g, K)!
    expect(s.data[at(7, 4)]).toBe(0)
    expect(s.data[at(0.5, 0.5)]).toBe(140)
  })
  test('a grey furniture block drawn the same way, short and closed, is not painted; solid black walls are left alone', () => {
    const { g, at, box } = hollow(60, 250, 235, 255)
    // a 0.9 × 0.9 m armchair in the top-left room: same lines, same fill, a 0.15 m frame
    box(2, 2, 2.9, 2.9, 60), box(2.02, 2.02, 2.88, 2.88, 250), box(2.15, 2.15, 2.75, 2.75, 60), box(2.17, 2.17, 2.73, 2.73, 235)
    const s = outlinedWalls(g, K)!
    expect(s.data[at(3, 1)]).toBe(0)
    expect(s.data[at(2.5, 2.08)]).toBe(250) // the chair's frame stays (ponytail: a frame ≥ 1 m long, a sofa's, is read as wall)
    const solid = sheet()
    solid.fill(1, 1, 9, 1.15), solid.fill(1, 6.85, 9, 7), solid.fill(1, 1, 1.15, 7), solid.fill(8.85, 1, 9, 7)
    expect(outlinedWalls(solid.g, K)).toBeNull()
  })
})

describe('colourPage (step 5B): a plan on a coloured page whose grey is the walls grey', () => {
  // a 10 × 8 m sheet: a dark green border, a grey-green card from 0.5 m in, the plan (white floor, 0.2 m neutral grey walls
  // whose grey is the card's) from 1 m in, and a white title letter on the border
  const mir = (turned = false) => {
    const w = 10 * K, h = 8 * K, rgb = { width: w, height: h, data: new Uint8Array(w * h * 4) }
    const paint = (x0: number, y0: number, x1: number, y1: number, c: number[]) => {
      for (let y = Math.round(y0 * K); y < Math.round(y1 * K); y++) for (let x = Math.round(x0 * K); x < Math.round(x1 * K); x++) rgb.data.set([...c, 255], 4 * (y * w + x))
    }
    paint(0, 0, 10, 8, [0, 62, 21]), paint(0.5, 0.5, 9.5, 7.5, [99, 143, 110]), paint(1, 1, 9, 7, [235, 235, 235])
    paint(3, 0.1, 3.3, 0.4, [255, 255, 255]) // the letter
    for (const [x0, y0, x1, y1] of [[1, 1, 9, 1.2], [1, 6.8, 9, 7], [1, 1, 1.2, 7], [8.8, 1, 9, 7], [5, 1, 5.2, 7]]) paint(x0, y0, x1, y1, [149, 144, 140])
    const g: Gray = { width: w, height: h, data: new Uint8Array(w * h) }
    for (let i = 0; i < w * h; i++) {
      const l = Math.round(0.299 * rgb.data[4 * i] + 0.587 * rgb.data[4 * i + 1] + 0.114 * rgb.data[4 * i + 2])
      g.data[i] = turned ? 255 - l : l
    }
    return { g, rgb, at: (x: number, y: number) => Math.round(y * K) * w + Math.round(x * K) }
  }
  test('the border and the card are made paper; the walls, the floor and the letter keep their greys', () => {
    const { g, rgb, at } = mir()
    const p = colourPage(g, rgb)!
    expect(p.data[at(0.2, 0.2)]).toBe(255) // the border
    expect(p.data[at(0.7, 3)]).toBe(255) // the card
    expect(p.data[at(1.1, 3)]).toBe(g.data[at(1.1, 3)]) // an outer wall, the card's grey
    expect(p.data[at(5.1, 3)]).toBe(g.data[at(5.1, 3)]) // an inner wall
    expect(p.data[at(3, 3)]).toBe(235) // the floor
    expect(p.data[at(3.15, 0.25)]).toBe(255) // the letter (white already)
  })
  test('null on a paper border, and on a grey turned over from its colours', () => {
    const { g, rgb } = mir()
    const white = { ...g, data: new Uint8Array(g.data).fill(255) }
    expect(colourPage(white, rgb)).toBeNull()
    expect(colourPage(mir(true).g, rgb)).toBeNull()
  })
})

describe('dashMask (s27: a dashed plot line is never a wall)', () => {
  test('a dash-dot line is marked; a wall with doors and windows in it, and a solid wall, are not', () => {
    const { g, fill, at } = sheet()
    // a dash-dot plot line at y 0.5: 1 m dashes, 0.2 m dots, 0.2 m gaps, 0.1 m thick
    for (let x = 0.2; x + 1 < 9.8; x += 1.6) fill(x, 0.45, x + 1, 0.55), fill(x + 1.2, 0.45, Math.min(9.8, x + 1.4), 0.55)
    // a 0.2 m wall at y 3 with a 0.9 m door, a 1.5 m window gap and a 0.8 m door: pieces 1.2, 2.3, 1.5, 1.6 m
    fill(0.5, 2.9, 1.7, 3.1), fill(2.6, 2.9, 4.9, 3.1), fill(6.4, 2.9, 7.9, 3.1), fill(8.7, 2.9, 9.8, 3.1)
    fill(0.5, 6, 9.5, 6.2) // a solid wall
    // (fix 2, UPL Mridha) a wall's outline broken into 0.4 m pieces by what crosses it (stair treads), its other outline
    // solid 0.15 m beside it: a double line, no plot line
    fill(0.5, 4.5, 9.5, 4.52)
    for (let x = 0.5; x + 0.4 < 9.5; x += 0.5) fill(x, 4.65, x + 0.4, 4.67)
    const m = dashMask(g, K, 128)!
    expect(m[at(0.7, 4.66)]).toBe(0)
    expect(m[at(5.2, 4.66)]).toBe(0)
    expect(m[at(0.9, 0.5)]).toBe(1)
    expect(m[at(4.7, 0.5)]).toBe(1)
    expect(m[at(1, 3)]).toBe(0)
    expect(m[at(3.5, 3)]).toBe(0)
    expect(m[at(5, 6.1)]).toBe(0)
  })
})

describe('lightWalls (s27 fix 2: walls drawn lighter than the floor)', () => {
  test('a white wall between beige floors comes out dark ink; the floor, a wide white bed and dark print come out paper', () => {
    const { g, at } = sheet()
    const paint = (x0: number, y0: number, x1: number, y1: number, v: number) => {
      for (let y = Math.round(y0 * K); y < Math.round(y1 * K); y++) for (let x = Math.round(x0 * K); x < Math.round(x1 * K); x++) g.data[y * g.width + x] = v
    }
    paint(0, 0, 10, 8, 200) // the floor
    paint(5, 0, 5.2, 8, 255) // a 0.2 m white wall
    paint(1, 1, 3, 3, 255) // a 2 × 2 m white bed
    paint(7, 4, 7.6, 4.15, 30) // a dark name
    const L = lightWalls(g, K)
    expect(L.data[at(5.1, 4)]).toBeLessThan(60)
    expect(L.data[at(2.5, 6)]).toBe(255)
    expect(L.data[at(2, 2)]).toBeGreaterThan(230)
    expect(L.data[at(7.3, 4.07)]).toBe(255)
  })
})
