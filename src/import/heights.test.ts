/**
 * Heights from sections and elevations (heights.ts): a test per rule. Fixtures: the farmhouse set's "SECTION LOOKING
 * NORTH" and "SIDE ELEVATION (WEST)" as the PDF holds them (every text of the view, its horizontal lines at the level
 * marks; Farmhouse Drawing Set V-001 by Amatect, CC BY-SA 3.0, Wikimedia Commons), Elemental's Quinta Monroy CORTE B-B's
 * level marks as printed, and made-up sections in the ways Dhaka and European architects print levels. The real sets are
 * scored in Docs/SETS_SCOREBOARD.md "Stage 3".
 */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { FT } from '../core'
import type { Seg } from './plan2d'
import type { SheetText } from './sheets'
import { heightsOf, levelValue, markOf, parseStoreys, readHeights, setHeights, splitMark, storeysOf, storeysWords, towerHeights, type Heights } from './heights'

type Fx = { title: string; scale: number; texts: [string, number, number, number, number, number, number][]; segs: [number, number, number, number][] }
const fixture = (f: string): { texts: SheetText[]; segs: Seg[]; mPerUnit: number } => {
  const fx = JSON.parse(readFileSync(`${__dirname}/fixtures/${f}.json`, 'utf8')) as Fx
  return {
    texts: fx.texts.map(([text, x, y, height, width, dx, dy]) => ({ text, at: { x, y }, height, width, dir: { x: dx, y: dy } })),
    segs: fx.segs.map(([ax, ay, bx, by]) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer: '' })),
    mPerUnit: (fx.scale * 0.0254) / 72,
  }
}
/** a text starting at (x, y) on its baseline, as wide as its letters */
const T = (text: string, x: number, y: number, h = 9, dir = { x: 1, y: 0 }): SheetText => {
  const width = 0.6 * h * text.length
  return { text, at: { x: x + (dir.x * width) / 2, y: y + (dir.y * width) / 2 }, height: h, width, dir }
}
const line = (x0: number, x1: number, y: number): Seg => ({ a: { x: x0, y }, b: { x: x1, y }, layer: '' })
const near = (a: number, b: number, d = 0.005) => Math.abs(a - b) <= d
const ft = (f: number, i = 0) => (f + i / 12) * FT

describe('a level value as printed', () => {
  test.each([
    [`+10'-0"`, ft(10)],
    [`+29'-2"`, ft(29, 2)],
    [`+0'-0"`, 0],
    [`-4'-6"`, -ft(4, 6)],
    [`+12'-3 1/2"`, ft(12, 3.5)],
    ['+2.34', 2.34],
    ['+ 4.7', 4.7],
    ['±0.00', 0],
    ['+/- 0.0', 0],
    ['-4.10', -4.1],
    ['+3,05', 3.05],
    ['EL. 103.05', 103.05],
    ['F.F.L. +3.05', 3.05],
    ['+3050', 3.05],
  ])('%s → %f m', (s, m) => expect(near(levelValue(s)!, m)).toBe(true))
  test.each([`9'-6"`, '2', '-20', '4.68', '1:50', 'A2.1', '+'])('%s is no level value (a dimension, a number)', (s) => expect(levelValue(s)).toBeNull())
})

describe('a mark: its name and its value', () => {
  test.each([
    ['N.P.T+2.34', 'N.P.T', 2.34],
    ['N.P.T.+ 2.34', 'N.P.T.', 2.34],
    [`+10'-0"`, '', ft(10)],
    ['1ST FLOOR (FINISH)', '1ST FLOOR (FINISH)', null],
    [`ROOF LVL. +30'-6"`, 'ROOF LVL.', ft(30, 6)],
    ['N.P.T -20', 'N.P.T -20', null],
  ])('%s', (s, name, value) => {
    const r = splitMark(s)
    expect(r.name).toBe(name)
    if (value === null) expect(r.value).toBeNull()
    else expect(near(r.value!, value)).toBe(true)
  })
  test.each([
    ['1ST FLOOR (FINISH)', 1],
    ['2ND FLOOR (FINISH)', 2],
    ['GROUND FLOOR', 0],
    ['B1', -1],
    ['BASEMENT 2', -2],
    ['LEVEL 3', 3],
    ['CEILING (T.O. PLATE)', 'plate'],
    ['TOP PLATE', 'plate'],
    ['ROOF RIDGE', 'ridge'],
    ['ROOF EAVE', 'eave'],
    ['EAVE / T.O. FASCIA', 'eave'],
    ['T.O. PARAPET', 'parapet'],
    ['ROOF', 'roof'],
    ['ROOF LVL.', 'roof'],
    ['FINISH GRADE', 'grade'],
    ['N.P.T', 'floor'],
    ['F.F.L.', 'floor'],
    ['MEZZANINE', 'floor'],
    ['OKFF', 'floor'],
  ])('%s marks %s', (s, at) => expect(markOf(s)).toBe(at))
  test.each(['PORCH FLOOR', '2X12 FLOOR JOISTS @ 16" OC', '5V METAL ROOF PANELS', 'BULBED RIDGE CAP', 'SECTION LOOKING NORTH', 'HARDWOOD FLOOR', 'CLAPBOARD RAINSCREEN SIDING'])(
    '%s marks no level',
    (s) => expect(markOf(s)).toBeNull(),
  )
})

describe('the marks of a view', () => {
  test('the farmhouse section: four marks, each name with the value under it, all printed and on their lines', () => {
    const r = readHeights(fixture('farmhouse-section'))
    expect(r.marks.map((m) => [m.at, +m.heightM.toFixed(3)])).toEqual([
      [1, 0],
      [2, 3.048],
      ['plate', 5.791],
      ['ridge', 8.89],
    ])
    expect(r.marks.every((m) => m.printed)).toBe(true)
    expect(r.confidence).toBe(1) // (each printed height agrees with its line at 1/4" = 1'-0")
  })
  test('with its values gone, the heights are measured from the lines at the printed scale (within 5 cm)', () => {
    const fx = fixture('farmhouse-section')
    const r = readHeights({ ...fx, texts: fx.texts.filter((t) => !/^\+/.test(t.text)) })
    expect(r.marks.map((m) => m.at)).toEqual([1, 2, 'plate', 'ridge'])
    expect(r.marks.every((m) => !m.printed)).toBe(true)
    r.marks.forEach((m, i) => expect(near(m.heightM, [0, ft(10), ft(19), ft(29, 2)][i], 0.05)).toBe(true))
    expect(r.confidence).toBe(0.8)
  })
  test('with no scale printed either, a dimension string between two level lines gives it', () => {
    const fx = fixture('farmhouse-section')
    // "10'-0"" written up the page between the 1st floor's line (153.7) and the 2nd floor's (335.8)
    const texts = [...fx.texts.filter((t) => !/^\+/.test(t.text)), T(`10'-0"`, 120, 230, 6.2, { x: 0, y: 1 })]
    const r = readHeights({ segs: fx.segs, texts })
    r.marks.forEach((m, i) => expect(near(m.heightM, [0, ft(10), ft(19), ft(29, 2)][i], 0.05)).toBe(true))
    expect(r.confidence).toBe(0.6)
  })
  test("a note's small words are no mark (the west elevation's EAVE / T.O. FASCIA of the bracket roof, GRADE (APPROX.))", () => {
    const r = readHeights(fixture('farmhouse-west'))
    expect(r.marks.map((m) => [m.at, +m.heightM.toFixed(3)])).toEqual([
      [1, 0],
      ['eave', 2.896], // (the porch roof's, printed: under the top floor, heightsOf leaves it out)
      [2, 3.048],
      ['eave', 6.096],
      ['ridge', 8.89],
    ])
  })
  test('values alone at level triangles (Quinta Monroy CORTE B-B): N.P.T names a floor, a value printed twice is one', () => {
    const tri = (x: number, y: number): Seg[] => [line(x - 10.5, x + 10.5, y + 9.2), line(x, x + 25.6, y)] // the triangle's top, the line's stub at its point
    const marks: [string, number, number][] = [
      ['N.P.T+/- 0.0', -873.3, 1020.1],
      ['N.P.T.+ 2.34', -870.6, 1152.8],
      ['N.P.T+4.72', -873.9, 1287.2],
      ['+ 4.7', -486.6, 1286.2],
      ['+ 7.32', -879.2, 1434.6],
      ['+7.48', -487.2, 1443.8],
    ]
    const texts = [...marks.map(([s, x, y]) => T(s, x - 15, y, 5.9)), T('CORTE B-B', -989.4, 792.5, 15.2), T('ESTAR', -700, 1100, 5.9)]
    const r = readHeights({ texts, segs: marks.flatMap(([, x, y]) => tri(x, y - 10.8)), mPerUnit: (50 * 0.0254) / 72 })
    expect(heightsOf(r)).toEqual({ floors: { 0: 0, 1: 2.34, 2: 4.72 }, roofM: 7.32, parapetM: expect.closeTo(0.16, 5) })
  })
})

/** made-up marks, each a name over its value, a level line under the name; 50 points apart */
const view = (marks: [string, string][]): Heights | null =>
  heightsOf(readHeights({ texts: marks.flatMap(([name, v], i) => [T(name, 100, 1000 + i * 50 + 3), T(v, 100, 1000 + i * 50 - 6, 6)]), segs: marks.map((_, i) => line(90, 400, 1000 + i * 50)) }))

describe('the building from the marks', () => {
  test('the farmhouse: a pitched roof — eave from the elevation, ceiling and ridge from the section; a porch eave under the top floor is no part of it', () => {
    expect(heightsOf(readHeights(fixture('farmhouse-section')))).toEqual({ floors: { 0: 0, 1: ft(10) }, ceilingM: ft(19), ridgeM: ft(29, 2) })
    expect(heightsOf(readHeights(fixture('farmhouse-west')))).toEqual({ floors: { 0: 0, 1: ft(10) }, eaveM: ft(20), ridgeM: ft(29, 2) })
  })
  test('a Dhaka tower section: basement, ground, typical floors, a flat roof and its parapet', () => {
    const h = view([
      ['BASEMENT', '-3.05'],
      ['GROUND FLOOR', '±0.00'],
      ['1ST FLOOR', '+4.27'],
      ['2ND FLOOR', '+7.32'],
      ['3RD FLOOR', '+10.37'],
      ['ROOF', '+13.42'],
      ['PARAPET', '+14.49'],
    ])
    expect(h).toEqual({ floors: { [-1]: -3.05, 0: 0, 1: 4.27, 2: 7.32, 3: 10.37 }, roofM: 13.42, parapetM: expect.closeTo(1.07, 5) })
    expect(storeysWords(storeysOf(h!))).toBe('B1 3.05, G 4.27, 1–2 3.05')
  })
  test('a ceiling under the next floor gives the slab', () => {
    const h = view([
      ['GROUND FLOOR', '+0.00'],
      ['CEILING', '+2.90'],
      ['1ST FLOOR', '+3.10'],
      ['ROOF', '+6.20'],
    ])
    expect(h?.slabM).toBeCloseTo(0.2, 5)
    expect(h?.floors).toEqual({ 0: 0, 1: 3.1 })
  })
  test('a set with no ground floor named: its 1st floor is the ground (as its plans are numbered)', () => {
    expect(view([['1ST FLOOR', '+0.00'], ['2ND FLOOR', '+3.00'], ['ROOF', '+6.10']])?.floors).toEqual({ 0: 0, 1: 3 })
  })
})

describe('the set: views vote', () => {
  const a: Heights = { floors: { 0: 0, 1: 3.05, 2: 6.1 }, roofM: 9.15, parapetM: 1 }
  test('views that agree within 5 cm: no question; the section first', () => {
    const s = setHeights([
      { title: 'EAST ELEVATION', kind: 'elevation', heights: { floors: { 0: 0, 1: 3.07 }, roofM: 9.14 } },
      { title: 'SECTION A-A', kind: 'section', heights: a },
    ])
    expect(s.differ).toEqual([])
    expect(s.floors).toEqual(a.floors)
    expect(s.from).toEqual(['SECTION A-A', 'EAST ELEVATION'])
  })
  test('a floor more than 5 cm apart: one question with both', () => {
    const s = setHeights([
      { title: 'SECTION A-A', kind: 'section', heights: a },
      { title: 'EAST ELEVATION', kind: 'elevation', heights: { floors: { 0: 0, 1: 3.2 } } },
    ])
    expect(s.differ).toEqual([{ key: '1', options: [{ title: 'SECTION A-A', m: 3.05 }, { title: 'EAST ELEVATION', m: 3.2 }] }])
    expect(s.floors[1]).toBe(3.05)
  })
  test('a pitched roof and a flat one: the first view says which', () => {
    const s = setHeights([
      { title: 'SECTION', kind: 'section', heights: { floors: { 0: 0, 1: 3 }, ceilingM: 5.8, ridgeM: 8.9 } },
      { title: 'NORTH', kind: 'elevation', heights: { floors: { 0: 0, 1: 3 }, eaveM: 6.1, ridgeM: 8.9 } },
      { title: 'SOUTH', kind: 'elevation', heights: { floors: { 0: 0, 1: 3 }, roofM: 6.2 } },
    ])
    expect([s.ceilingM, s.eaveM, s.ridgeM, s.roofM]).toEqual([5.8, 6.1, 8.9, undefined])
  })
})

describe('the tower from the heights', () => {
  test('the farmhouse: G and 1 as printed, the roof on the ceiling and a slab, walls a slab under the next floor', () => {
    const t = towerHeights({ floors: { 0: 0, 1: ft(10) }, ceilingM: ft(19), eaveM: ft(20), ridgeM: ft(29, 2) }, 0, 1, 3.2)
    expect(t.levels[0]).toBe(0)
    expect(t.levels[1]).toBeCloseTo(ft(10), 6)
    expect(t.levels[2]).toBeCloseTo(ft(19) + 0.15, 6)
    expect(t.walls[0]).toBeCloseTo(ft(10) - 0.15, 6)
    expect(t.walls[1]).toBeCloseTo(ft(9), 6)
    expect([t.eaveM, t.ridgeM]).toEqual([ft(20), ft(29, 2)])
  })
  test('a building taller than its section: the floors over it repeat the last storey, the top keeps the section\'s top storey', () => {
    const t = towerHeights({ floors: { 0: 0, 1: 4.5, 2: 7.55 }, roofM: 10.7, parapetM: 1 }, -1, 5, 3.2)
    expect([t.levels[-1], t.levels[3], t.levels[5]].map((x) => +x.toFixed(2))).toEqual([-4.5, 10.6, 16.7])
    expect(+t.levels[6].toFixed(2)).toBe(19.85)
    expect(t.parapetM).toBe(1)
  })
  test('a floor in a gap takes its share of it', () => {
    expect(towerHeights({ floors: { 0: 0, 3: 9 } }, 0, 3, 3).levels[1]).toBe(3)
  })
})

describe('floor to floor in words', () => {
  test('one height, runs, and back', () => {
    expect(storeysWords({ 0: 3.05, 1: 3.05 })).toBe('3.05')
    expect(storeysWords({ 0: 4.5, 1: 3.05, 2: 3.05, 3: 3.05 })).toBe('G 4.50, 1–3 3.05')
    expect(parseStoreys('3.2', [0, 1, 2])).toEqual({ 0: 3.2, 1: 3.2, 2: 3.2 })
    expect(parseStoreys('G 4.5, 1-3 3.05', [])).toEqual({ 0: 4.5, 1: 3.05, 2: 3.05, 3: 3.05 })
    expect(parseStoreys(`10'-0"`, [0])).toEqual({ 0: ft(10) })
    expect(parseStoreys('G four', [])).toBeNull()
  })
})
