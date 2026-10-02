import { describe, expect, test } from 'vitest'
import { axisLines, thinFaces } from './faces'
import type { Gray, OpeningGuess, Px, WallSeg } from './types'

const K = 50 // px per m
const TH = 6 // wall thickness, px

/** a blank sheet with these walls drawn black (centre lines, TH thick) */
function sheet(walls: WallSeg[], w = 460, h = 400): Gray {
  const g: Gray = { width: w, height: h, data: new Uint8Array(w * h).fill(255) }
  for (const s of walls) {
    const x0 = Math.round(Math.min(s.a.x, s.b.x) - s.thicknessPx / 2), x1 = Math.round(Math.max(s.a.x, s.b.x) + s.thicknessPx / 2)
    const y0 = Math.round(Math.min(s.a.y, s.b.y) - s.thicknessPx / 2), y1 = Math.round(Math.max(s.a.y, s.b.y) + s.thicknessPx / 2)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.data[y * w + x] = 0
  }
  return g
}
const W = (ax: number, ay: number, bx: number, by: number): WallSeg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessPx: TH, conf: 1 })
/** a 1 px grey pen line (every `on` of `on + off` pixels inked: a dashed grille when off > 0) */
function pen(g: Gray, a: Px, b: Px, grey = 150, on = 1, off = 0): void {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  for (let i = 0; i <= n; i++) if (i % (on + off) < on) g.data[Math.round(a.y + ((b.y - a.y) * i) / n) * g.width + Math.round(a.x + ((b.x - a.x) * i) / n)] = grey
}
/** a 4 × 4 m room (100 … 300 px), a 1.2 × 2 m shaft on its right between two wall stubs, open to the right */
const box = [W(100, 100, 300, 100), W(300, 100, 300, 300), W(300, 300, 100, 300), W(100, 300, 100, 100)]
const stubs = [W(300, 150, 360, 150), W(300, 250, 360, 250)]

describe('axisLines', () => {
  test('a dashed grille is one line, inked about half; a light 8 px band is one line 8 px thick', () => {
    const g = sheet([])
    pen(g, { x: 20, y: 50 }, { x: 220, y: 50 }, 90, 3, 2)
    pen(g, { x: 20, y: 51 }, { x: 220, y: 51 }, 90, 3, 2)
    for (let y = 100; y < 108; y++) pen(g, { x: 20, y }, { x: 220, y }, 180)
    const C = Uint8Array.from(g.data, (v) => (v <= 215 ? 1 : 0))
    const ls = axisLines(C, g.width, g.height, true, 20, 3, 18)
    expect(ls.length).toBe(2)
    const [dash, band] = ls.sort((p, q) => p.c - q.c)
    expect(dash.c).toBeCloseTo(50.5, 1)
    expect(dash.fill).toBeLessThan(0.8)
    expect(band.th).toBe(8)
    expect(band.fill).toBeGreaterThan(0.95)
    expect([band.u0, band.u1]).toEqual([20, 220])
  })
})

describe('thinFaces', () => {
  test('a shaft closed by one thin line between two wall stubs: a 1.1 m low wall on the wall stubs\' ends, the face offered as an AOD', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    pen(g, { x: 360, y: 150 }, { x: 360, y: 250 })
    const r = thinFaces(g, { k: K, walls, openings: [], labels: [{ at: { x: 200, y: 200 }, name: 'BED 1' }] })
    expect(r.walls.length).toBe(1)
    expect(r.walls[0]).toMatchObject({ a: { x: 360, y: 150 }, b: { x: 360, y: 250 }, heightM: 1.1 })
    expect(r.faces.length).toBe(1)
    expect(r.faces[0].aod).toBe(true)
    expect(r.faces[0].areaSqm).toBeGreaterThan(2)
    expect(r.faces[0].areaSqm).toBeLessThan(2.5)
    expect(r.review.length).toBe(2) // the low wall + the AOD offered
  })

  test('beside plant green the line is a planter edge (0.45 m); a green face with no label is no AOD', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    pen(g, { x: 360, y: 150 }, { x: 360, y: 250 })
    const green = new Uint8Array(g.width * g.height)
    for (let y = 154; y < 247; y++) for (let x = 304; x < 358; x++) green[y * g.width + x] = 1
    const r = thinFaces(g, { k: K, walls, openings: [], green })
    expect(r.walls.map((w) => w.heightM)).toEqual([0.45])
    expect(r.faces[0]).toMatchObject({ planter: true, aod: false })
  })

  test('a planter box with no edge line drawn (foliage over it): the green\'s own edge closes it, a 0.45 m planter edge', () => {
    const walls = [...box, ...stubs]
    const g = sheet(walls)
    const green = new Uint8Array(g.width * g.height)
    for (let y = 154; y < 247; y++) for (let x = 304; x < 351; x++) green[y * g.width + x] = 1
    const r = thinFaces(g, { k: K, walls, openings: [], green })
    expect(r.walls.length).toBe(1)
    expect(r.walls[0]).toMatchObject({ a: { x: 350.5, y: 150 }, b: { x: 350.5, y: 250 }, heightM: 0.45 })
    expect(r.faces[0]).toMatchObject({ planter: true, aod: false })
  })

  test('furniture: a line across a fitted room, or a bed drawn against a wall, closes nothing', () => {
    const g = sheet(box)
    pen(g, { x: 104, y: 200 }, { x: 296, y: 200 })
    const fit = thinFaces(g, { k: K, walls: box, openings: [], fits: [{ x0: 103, y0: 103, x1: 297, y1: 297 }], labels: [{ at: { x: 200, y: 150 }, name: 'BED 1' }] })
    expect(fit.walls).toEqual([])
    expect(fit.lines.find((l) => l.horiz && Math.abs(l.c - 200) < 1)?.fate).toBe('inside a fitted room')
    const bed = sheet(box)
    pen(bed, { x: 150, y: 200 }, { x: 150, y: 297 })
    pen(bed, { x: 250, y: 200 }, { x: 250, y: 297 })
    pen(bed, { x: 150, y: 200 }, { x: 250, y: 200 })
    expect(thinFaces(bed, { k: K, walls: box, openings: [], labels: [{ at: { x: 200, y: 150 }, name: 'BED 1' }] }).walls).toEqual([])
  })

  test('an undecided gap stays open under a solid thin line; a dashed grille across it closes the room', () => {
    const walls = [W(100, 100, 170, 100), W(230, 100, 300, 100), W(300, 100, 300, 300), W(300, 300, 100, 300), W(100, 300, 100, 100)]
    const gap: OpeningGuess = { a: { x: 170, y: 100 }, b: { x: 230, y: 100 }, kind: 'unknown', conf: 0.2, thicknessPx: TH }
    const labels = [{ at: { x: 200, y: 200 }, name: 'AOD' }]
    const solid = sheet(walls)
    pen(solid, { x: 170, y: 100 }, { x: 230, y: 100 })
    const s = thinFaces(solid, { k: K, walls, openings: [gap], labels })
    expect(s.walls).toEqual([])
    expect(s.lines.some((l) => l.fate === 'solid line on an undecided gap')).toBe(true)
    const dashed = sheet(walls)
    for (const y of [99, 100, 101]) pen(dashed, { x: 170, y }, { x: 230, y }, 90, 2, 2)
    const d = thinFaces(dashed, { k: K, walls, openings: [gap], labels })
    expect(d.walls.length, JSON.stringify(d.lines)).toBe(1)
    expect(d.faces[0]).toMatchObject({ labelled: true, aod: false })
  })
})
