/**
 * What kind of drawing is this page (sheets.ts): a test per rule on small made-up pages — the words of view titles in the
 * languages the layer table reads, the floors they name, the sheet number, the shape when nothing is written, a page of
 * several drawings split by its titles, and the set's floors and ticks. The real sets are scored in Docs/SETS_SCOREBOARD.md.
 */
import { describe, expect, test } from 'vitest'
import type { Pt } from '../core'
import type { ArcPrim, Seg } from './plan2d'
import { drawingArea, fileView, kindOfNumber, kindOfTitle, levelOf, parseSlots, readSheet, setChoices, sheetNumberOf, shapeKind, slotsFor, slotsWords, storeysOf, type SheetPage, type SheetText } from './sheets'

/** a text: its start at (x, y) on its baseline, as wide as its letters */
const T = (text: string, x: number, y: number, h = 12): SheetText => {
  const width = 0.6 * h * text.length
  return { text, at: { x: x + width / 2, y }, height: h, width, dir: { x: 1, y: 0 } }
}
const seg = (ax: number, ay: number, bx: number, by: number): Seg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer: '' })
const rect = (x0: number, y0: number, x1: number, y1: number): Seg[] => [seg(x0, y0, x1, y0), seg(x1, y0, x1, y1), seg(x1, y1, x0, y1), seg(x0, y1, x0, y0)]
/** a drawing: a box with lines across it, so it is one island of lines */
const drawing = (x0: number, y0: number, x1: number, y1: number): Seg[] => [...rect(x0, y0, x1, y1), ...Array.from({ length: 6 }, (_, i) => seg(x0, y0 + ((i + 1) * (y1 - y0)) / 7, x1, y0 + ((i + 1) * (y1 - y0)) / 7))]
const BOX = { x0: 0, y0: 0, x1: 1224, y1: 792 }
const page = (texts: SheetText[], segs: Seg[] = [], arcs: ArcPrim[] = []): SheetPage => ({ box: BOX, texts, segs, arcs })
/** a door swing: a quarter arc hinged at (x, y) with its leaf */
const swing = (x: number, y: number, r = 20): { arc: ArcPrim; leaf: Seg } => ({ arc: { c: { x, y }, r, a0: 0, a1: Math.PI / 2, layer: '' }, leaf: seg(x, y, x + r, y) })
const inBox = (p: Pt, b: { x0: number; y0: number; x1: number; y1: number }) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1

describe('the floors a title names', () => {
  test.each([
    ['GROUND FLOOR PLAN', [0]],
    ['2ND FLOOR PLAN', [2]],
    ['SECOND FLOOR', [2]],
    ['PLANTA PRIMER NIVEL', [1]],
    ['PLANTA SEGUNDO Y TERCER NIVEL', [2, 3]],
    ['Planta baja', [0]],
    ['BASEMENT 02', [-2]],
    ['BASEMENT_1', [-1]],
    ['Basement 01', [-1]],
    ['ROOF PLAN', ['R']],
    ['Rooftop', ['R']],
    ['Level-02, Level-03, Level-05, Level-07 & Level-09 Plan', [2, 3, 5, 7, 9]],
    ['5/7/9/11 FLOOR PLAN', [5, 7, 9, 11]],
    ['4th & 10th floor plan', [4, 10]],
    ['LEVEL 1 to 11', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
    ['FLOOR : 2', [2]],
    ['Floor Plan Measurements, L1', [1]],
    ['2ND-4TH FLOOR', [2, 3, 4]],
    ['ATTIC FLOOR PLAN', ['attic']],
    ['MEZZANINE FLOOR', ['mezz']],
    ['PRESENTATION PLAN- 2A, 3A, 5A', [2, 3, 5]],
    ['Primary School GA Plan Level 00', [0]],
  ])('%s', (title, at) => expect(levelOf(title)?.at).toEqual(at))
  test('counted from the ground up whatever the set does: 1. OG, R+1, 1er étage, primo piano', () => {
    for (const t of ['GRUNDRISS 1. OG', 'PLAN R+1', '1ER ETAGE', 'PIANTA PRIMO PIANO', '1E VERDIEPING']) expect(levelOf(t)).toMatchObject({ at: [1], above: true })
  })
  test('a typical floor names no floor unless it lists them', () => {
    expect(levelOf('TYPICAL FLOOR PLAN')).toEqual({ at: [], typical: true })
    expect(levelOf('Typical Floor 2nd, 4th & 6th')).toEqual({ at: [2, 4, 6], typical: true })
  })
  test('nothing named: null; a level mark on an elevation is not a floor of the roof', () => {
    expect(levelOf('KITCHEN ELEVATION')).toBeNull()
    expect(levelOf('ROOF RIDGE')).toBeNull()
  })
})

describe('the kind a title names', () => {
  test.each([
    ['2ND FLOOR PLAN', 'plan'],
    ['GRUNDRISS 1. OG', 'plan'],
    ['PLANTA SEGUNDO NIVEL', 'plan'],
    ['GROUND FLOOR', 'plan'],
    ['FRONT ELEVATION (SOUTH)', 'elevation'],
    ['ELEVACION POSTERIOR', 'elevation'],
    ['NORDANSICHT', 'elevation'],
    ['KITCHEN ELEVATION', 'interior'],
    ['WATER CLOSET ELEVATION', 'interior'],
    ['CORTE A-A', 'section'],
    ['SECTION @ LIVING ROOM & MAIN BEDROOM', 'section'],
    ['SCHNITT B-B', 'section'],
    ['SITE / LANDSCAPE PLAN', 'site'],
    ['VICINITY MAP', 'site'],
    ['LAGEPLAN', 'site'],
    ['DOOR SCHEDULE', 'schedule'],
    ['ROOM FINISHES SCHEDULE', 'schedule'],
    ['WINDER STAIRS - PLAN DETAIL', 'detail'],
    ['STAIRCASE ELEVATION DETAIL', 'detail'],
    ['DETAIL SECTION THROUGH CHIMNEY', 'detail'],
    ['SHEET INDEX', 'title'],
    ['KEY NOTES', 'title'],
    ['GENERAL NOTES', 'title'],
  ])('%s → %s', (title, kind) => expect(kindOfTitle(title)?.kind).toBe(kind))
  test("an elevation's side (the bracketed compass first), a section's mark, a plan's use", () => {
    expect(kindOfTitle('FRONT ELEVATION (SOUTH)')?.facade).toBe('south')
    expect(kindOfTitle('BACK ELEVATION')?.facade).toBe('back')
    expect(kindOfTitle('ELEVACION FRONTAL')?.facade).toBe('front')
    expect(kindOfTitle('CORTE A-A')?.mark).toBe('A-A')
    expect(kindOfTitle('SECTION 2')?.mark).toBe('2')
    expect(kindOfTitle('1ST FLOOR - REFLECTED CEILING PLAN & ELECTRICAL PLAN')).toMatchObject({ kind: 'plan', use: 'ceiling', level: { at: [1] } })
    expect(kindOfTitle('FOUNDATION PLAN')?.use).toBe('foundation')
  })
  test('no title: level marks, scale bars, notes about a floor', () => {
    for (const t of ['1ST FLOOR (FINISH)', 'F.F.L. +3.00', 'PLAN GRAPHIC SCALE', 'Metric scale - to match plan exports @ 1:100', 'DUCT OPEN TO BASEMENT', 'TO FIRST FLOOR CONDITIONED', 'Unit Per Floor: 01', 'Roof top view', 'FAMILY ROOM']) expect(kindOfTitle(t)).toBeNull()
  })
})

describe('the sheet number', () => {
  test('the biggest A2.5 / A-201 in the title block, else a plot stamp\'s drawing file', () => {
    expect(sheetNumberOf([T('A2.5', 1117, 18, 25), T('KITCHEN ELEVATION', 200, 400, 12), T('SCALE', 300, 300, 6)])).toBe('A2.5')
    expect(sheetNumberOf([T('A2', 100, 100, 6), T('NOTE', 200, 100, 6)])).toBeNull() // as small as the rest: a grid bubble, not the sheet's number
    expect(sheetNumberOf([T('G:\\projects\\cadd\\M-101-A1.dwg,', 25, 400, 9)])).toBe('M-101')
  })
  test('its first digit: 0 general, 1 plans, 2 elevations, 3 sections, 4–5 details, 6 schedules', () => {
    expect(['A0.0', 'A-101', 'A2.5', 'A-301', 'A4.2', 'M-501', 'E-601', 'A-701'].map(kindOfNumber)).toEqual(['title', 'plan', 'elevation', 'section', 'detail', 'detail', 'schedule', null])
  })
})

describe('a roof plan of slopes is the roof, kept — never a floor (qa4fix)', () => {
  test('ROOF PLAN with its slopes and ridge: kind roof, kept; a rooftop with its stair and tanks: a floor', () => {
    const slopes = readSheet(page([T('ROOF PLAN', 400, 60, 14), T('4/12', 300, 400, 8), T('SLOPE', 300, 390, 8), T('BULBED RIDGE CAP', 500, 500, 8), T('HALF ROUND GUTTER', 600, 300, 8)], drawing(100, 100, 900, 700)))
    expect(slopes.views).toHaveLength(1)
    expect(slopes.views[0].kind).toBe('roof')
    const top = readSheet(page([T('Roof Level Plan', 400, 60, 14), T('STAIR', 300, 400, 8), T('MACHINE ROOM', 500, 500, 8), T('SLOPE', 600, 300, 8), T('4/12', 600, 320, 8)], drawing(100, 100, 900, 700)))
    expect(top.views[0]).toMatchObject({ kind: 'plan', level: { at: ['R'] } })
    // built: the roof kept with the project, no floor for it
    const c = setChoices([{ kind: 'plan', level: { at: [0] } }, { kind: 'roof', level: { at: ['R'] } }])
    expect(c.map((x) => [x.tick, x.slots])).toEqual([[true, [0]], [true, []]])
  })
})

describe('a page', () => {
  test('one title: one view, its kind, floor and scale; framed inside the border and the title block', () => {
    const border = [...rect(20, 10, 1204, 782), seg(1100, 10, 1100, 782)] // the sheet's frame and its title block's rule
    const r = readSheet(page([T('2ND FLOOR PLAN', 73, 38, 12.5), T('SCALE: 1/4" =1\'-0"', 74, 24, 6), T('A1.3', 1117, 18, 25)], [...border, ...drawing(100, 100, 900, 700)]))
    expect(r.number).toBe('A1.3')
    expect(r.views).toHaveLength(1)
    expect(r.views[0]).toMatchObject({ kind: 'plan', level: { at: [2] }, scale: 48, by: 'words' })
    const b = r.views[0].box
    expect(b.x1).toBeLessThan(1100) // the title block left out
    expect(b.x0).toBeGreaterThan(20) // and the border
    expect(b.y0).toBeGreaterThan(38) // and its own title, underline and scale line under the drawing
    expect(b.y0).toBeLessThan(100)
    expect(drawingArea(page([], border))).toEqual({ x0: 20, y0: 10, x1: 1100, y1: 782 })
  })
  test('a cover sheet is one title page, whatever small plans it shows', () => {
    const r = readSheet(page([T('SHEET INDEX', 700, 313, 12.5), T('FIRST FLOOR PLAN', 214, 877, 12.5), T('SECOND FLOOR PLAN', 214, 597, 12.5)], [...drawing(200, 620, 400, 860), ...drawing(200, 340, 400, 580)]))
    expect(r.views.map((v) => v.kind)).toEqual(['title'])
  })
  test('several titled drawings under their titles: split, each frame holding its own lines', () => {
    const left = drawing(100, 450, 500, 750), right = drawing(650, 450, 1050, 750), low = drawing(100, 60, 500, 360)
    const r = readSheet(page([T('KITCHEN ELEVATION', 110, 425, 12.5), T('BATHROOM ELEVATION', 660, 425, 12.5), T('WC ELEVATION', 110, 35, 12.5)], [...left, ...right, ...low]))
    expect(r.views.map((v) => v.kind)).toEqual(['interior', 'interior', 'interior'])
    const [a, b, c] = r.views.map((v) => v.box)
    expect(inBox({ x: 300, y: 600 }, a) && !inBox({ x: 300, y: 600 }, b) && !inBox({ x: 300, y: 600 }, c)).toBe(true)
    expect(inBox({ x: 850, y: 600 }, b) && !inBox({ x: 850, y: 600 }, a)).toBe(true)
    expect(inBox({ x: 300, y: 200 }, c) && !inBox({ x: 300, y: 200 }, a)).toBe(true)
  })
  test('titles over their drawings (a brochure): each drawing goes to the title over it', () => {
    const r = readSheet(page([T('BASEMENT 1', 150, 700, 12), T('BASEMENT 2', 750, 700, 12)], [...drawing(100, 100, 500, 680), ...drawing(700, 100, 1100, 680)]))
    expect(r.views.map((v) => v.level?.at)).toEqual([[-1], [-2]])
    expect(inBox({ x: 300, y: 300 }, r.views[0].box) && !inBox({ x: 900, y: 300 }, r.views[0].box)).toBe(true)
    expect(inBox({ x: 900, y: 300 }, r.views[1].box)).toBe(true)
  })
  test('one floor drawn as two halves under the same title is one view, the whole floor', () => {
    const r = readSheet(page([T('FLOOR : 2', 120, 690, 12), T('FLOOR : 2', 720, 690, 12)], [...drawing(100, 100, 500, 680), ...drawing(700, 100, 1100, 680)]))
    expect(r.views).toHaveLength(1)
    expect(inBox({ x: 300, y: 300 }, r.views[0].box) && inBox({ x: 900, y: 300 }, r.views[0].box)).toBe(true)
  })
  test('a floor in halves titled by their parts is one view; two ways to build one floor stay two', () => {
    const two = (a: string, b: string) => readSheet(page([T(a, 120, 690, 12), T(b, 720, 690, 12)], [...drawing(100, 100, 500, 680), ...drawing(700, 100, 1100, 680)])).views
    expect(two('GROUND FLOOR PLAN (LEFT PART)', 'GROUND FLOOR PLAN (RIGHT PART)')).toHaveLength(1)
    expect(two('2ND FLOOR PLAN - PART A', '2ND FLOOR PLAN - PART B')).toHaveLength(1)
    expect(two('Ground Floor', 'Ground Floor – Enhanced Accessible (U2a)')).toHaveLength(2) // the Canadian fourplex: its accessible unit
    expect(two('5/7/9 FLOOR PLAN', '6/8/10 FLOOR PLAN')).toHaveLength(2)
  })
  test('a sheet of details (most of its titles say so) or of schedules is one page, not split', () => {
    const r = readSheet(page([T('FOUNDATION DETAIL', 300, 33, 12.5), T('WAINSCOT DETAIL', 300, 600, 12.5), T('TYPICAL INTERIOR WALL', 60, 285, 12.5)], [...drawing(300, 60, 500, 300), ...drawing(300, 620, 500, 780), ...drawing(60, 300, 250, 560)]))
    expect(r.views.map((v) => v.kind)).toEqual(['detail'])
    expect(readSheet(page([T('DOOR SCHEDULE', 60, 700, 9), T('WINDOW SCHEDULE', 600, 700, 9)])).views.map((v) => v.kind)).toEqual(['schedule'])
  })
  test("a sheet numbered as details (M-501) whose words are a detail's labels is a detail", () => {
    expect(readSheet(page([T('M-501', 1117, 18, 25), T('BEDROOM DOOR ELEVATION', 100, 100, 9)])).views.map((v) => v.kind)).toEqual(['detail'])
  })
  test('nothing written: the sheet number, else the shape', () => {
    expect(readSheet(page([T('P-104', 1117, 18, 25)])).views[0]).toMatchObject({ kind: 'plan', by: 'number' })
    const doors = [swing(200, 200), swing(400, 200), swing(600, 300)]
    expect(readSheet(page([], [...drawing(100, 100, 800, 600), ...doors.map((d) => d.leaf)], doors.map((d) => d.arc))).views[0]).toMatchObject({ kind: 'plan', by: 'shape' })
  })
  test('a drawing stacked over two lines is one title: "GROUND" over "FLOOR PLAN"; "Typical Floor" over its floors', () => {
    expect(readSheet(page([T('GROUND', 100, 700, 14), T('FLOOR PLAN', 100, 684, 14)])).views[0]).toMatchObject({ kind: 'plan', level: { at: [0] } })
    expect(readSheet(page([T('Typical Floor', 100, 632, 35), T('2nd, 4th & 6th', 100, 607, 15)])).views[0].level?.at).toEqual([2, 4, 6])
  })
  test("the value of a label is no title: \"Parking Location:\" over \"Ground Floor\"", () => {
    expect(readSheet(page([T('Parking Location:', 250, 445, 13), T('Ground Floor', 250, 429, 13)])).views[0].kind).not.toBe('plan')
  })
})

describe('the shape when nothing is written', () => {
  test('door swings (an arc with its leaf) make a plan; a circle of four quarters does not', () => {
    const doors = [swing(200, 200), swing(400, 200), swing(600, 300)]
    expect(shapeKind(doors.map((d) => d.leaf), doors.map((d) => d.arc), [], BOX)).toBe('plan')
    const circle: ArcPrim[] = [0, 1, 2, 3].map((i) => ({ c: { x: 300, y: 300 }, r: 20, a0: (i * Math.PI) / 2, a1: ((i + 1) * Math.PI) / 2, layer: '' }))
    expect(shapeKind([], circle, [], BOX)).toBe('other')
  })
  test("a table's ruled rows make a schedule; a page mostly of words a general sheet", () => {
    const rows = Array.from({ length: 20 }, (_, i) => seg(100, 100 + i * 20, 700, 100 + i * 20))
    expect(shapeKind(rows, [], [], BOX)).toBe('schedule')
    const words = Array.from({ length: 60 }, (_, i) => T('ALL WORK SHALL CONFORM TO THE CODE', 60 + (i % 2) * 560, 60 + Math.floor(i / 2) * 22, 12))
    expect(shapeKind([], [], words, BOX)).toBe('title')
  })
})

describe('the set', () => {
  test('a set naming no ground floor starts its 1st floor on the ground (US, "PRIMER NIVEL", "Level-01")', () => {
    expect(slotsFor([levelOf('1ST FLOOR PLAN'), levelOf('2ND FLOOR PLAN'), levelOf('ROOF PLAN')])).toEqual([[0], [1], ['R']])
    expect(slotsFor([levelOf('Level-01 Plan'), levelOf('Level-04, Level-06 Plan')])).toEqual([[0], [3, 5]])
  })
  test('a set with a ground floor numbers its upper floors from 1 (Dhaka, the UK); words counted from the ground never move', () => {
    expect(slotsFor([levelOf('GROUND FLOOR'), levelOf('1ST FLOOR'), levelOf('BASEMENT 1')])).toEqual([[0], [1], [-1]])
    expect(slotsFor([levelOf('GRUNDRISS 1. OG')])).toEqual([[1]])
    // a house of a ground floor and its "2ND FLOOR" (no 1st, nothing higher: the Canadian fourplex) counts its ground as the 1st
    expect(slotsFor([levelOf('GROUND FLOOR'), levelOf('2ND FLOOR')])).toEqual([[0], [1]])
    // a tower whose brochure skips the 1st floor's page keeps its numbers (Rangs Noorani Heights: 2nd & 4th, 3rd & 7th)
    expect(slotsFor([levelOf('Ground Floor'), levelOf('2nd & 4th Floor'), levelOf('3rd & 7th Floor')])).toEqual([[0], [2, 4], [3, 7]])
  })
  test('a mezzanine takes floor 1 when free, an attic the floor over the highest, a typical floor every floor left up to the highest', () => {
    expect(slotsFor([levelOf('GROUND FLOOR'), levelOf('MEZZANINE'), levelOf('3RD FLOOR PLAN')])).toEqual([[0], [1], [3]])
    expect(slotsFor([levelOf('BASEMENT'), levelOf('1ST FLOOR'), levelOf('2ND FLOOR'), levelOf('ATTIC FLOOR PLAN')])).toEqual([[-1], [0], [1], [2]])
    expect(slotsFor([levelOf('GROUND FLOOR'), levelOf('1ST FLOOR'), levelOf('TYPICAL FLOOR PLAN'), levelOf('8TH FLOOR')])).toEqual([[0], [1], [2, 3, 4, 5, 6, 7], [8]])
    expect(slotsFor([levelOf('GROUND FLOOR'), levelOf('TYPICAL FLOOR PLAN'), levelOf('ROOF')])).toEqual([[0], [1], ['R']])
  })
  test('how tall the building is, as the brochure says it: a typical floor with no numbers runs up to its top floor', () => {
    expect(storeysOf('2B+G+12')).toMatchObject({ basements: 2, floors: 12 }) // Rangs The Sanctuary
    expect(storeysOf('B+G+M+12')).toMatchObject({ basements: 1, floors: 13 }) // The Majestic: the mezzanine is floor 1
    expect(storeysOf('G + 9')).toMatchObject({ basements: 0, floors: 9 })
    expect(storeysOf('Basement + Ground Floor + 9 (10 storied')).toMatchObject({ basements: 1, floors: 9 }) // Akter Aleena
    expect(storeysOf(': 10 Storied')).toMatchObject({ floors: 9 }) // Eastern Housing Pearl: the ground is a storey
    expect(storeysOf('Floors: 09')).toMatchObject({ floors: 8 }) // Noboneer
    expect(storeysOf('14-STOREY')).toMatchObject({ floors: 13 })
    for (const t of ['Storey', 'UP TO BASEMENT-01', 'Unit Per Floor: 01', 'FLOOR : 2', `TOILET 5'-0" x 8'-0"`]) expect(storeysOf(t)).toBeNull()
    expect(slotsFor([levelOf('GROUND FLOOR PLAN'), levelOf('TYPICAL FLOOR PLAN'), levelOf('ROOF FLOOR PLAN')], 8)).toEqual([[0], [1, 2, 3, 4, 5, 6, 7, 8], ['R']])
    expect(setChoices([{ kind: 'plan', level: levelOf('GROUND FLOOR PLAN') }, { kind: 'plan', level: levelOf('TYPICAL FLOOR PLAN') }], 8).map((x) => x.slots)).toEqual([[0], [1, 2, 3, 4, 5, 6, 7, 8]])
  })
  test("a typical floor's floors in a run of their own, and the Spanish planta tipo (not planta tipo A, a flat)", () => {
    expect(levelOf('TYPICAL FLOOR PLAN 3RD–8TH')).toEqual({ at: [3, 4, 5, 6, 7, 8], typical: true })
    expect(levelOf('TYPICAL FLOOR PLAN (2ND-9TH)')?.at).toEqual([2, 3, 4, 5, 6, 7, 8, 9])
    expect(levelOf('Typical Floor Plan (1st to 13th)')?.at).toHaveLength(13)
    expect(levelOf('FLOORS 2-8')?.at).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(levelOf('PLANTA TIPO')).toEqual({ at: [], typical: true })
    expect(levelOf('PLANTA TIPO A')).toBeNull()
  })
  test('ticks: the first floor plan of each floor becomes its drawing; a ceiling plan of the same floor is kept out; elevations and sections are kept, details left out; the person decides last', () => {
    const c = setChoices([
      { kind: 'plan', level: levelOf('1ST FLOOR PLAN') },
      { kind: 'plan', level: levelOf('1ST FLOOR - REFLECTED CEILING PLAN'), use: 'ceiling' },
      { kind: 'plan', level: levelOf('2ND FLOOR PLAN') },
      { kind: 'plan', level: levelOf('2ND FLOOR LAYOUT') },
      { kind: 'elevation' },
      { kind: 'section' },
      { kind: 'detail' },
      { kind: 'detail', tick: true },
    ])
    expect(c.map((x) => x.tick)).toEqual([true, false, true, false, true, true, false, true])
    expect(c.map((x) => x.slots)).toEqual([[0], [0], [1], [1], [], [], [], []])
  })
  test('a plan naming no floor: left out where the others name theirs; where none does, the first goes on the ground; ticked by the person, on the lowest floor still free; typed floors win', () => {
    expect(setChoices([{ kind: 'plan', level: levelOf('GROUND FLOOR') }, { kind: 'plan', level: null }])).toEqual([{ slots: [0], tick: true }, { slots: [], tick: false }])
    expect(setChoices([{ kind: 'plan', level: null }, { kind: 'plan', level: null }])).toEqual([{ slots: [0], tick: true }, { slots: [], tick: false }])
    expect(setChoices([{ kind: 'plan', level: levelOf('GROUND FLOOR') }, { kind: 'plan', level: null, tick: true }]).map((x) => x.slots)).toEqual([[0], [1]])
    expect(setChoices([{ kind: 'plan', level: levelOf('GROUND FLOOR'), slots: [2, 3] }]).map((x) => x.slots)).toEqual([[2, 3]])
  })
  test('a folder of DXF / SVG files: each file by its title inside or its name (GF, 1F, RF, TYP, B1, E-1, S-2, A-201)', () => {
    const fv = (name: string, words: string[] = [], rooms = 0) => fileView(name, words.map((text) => ({ text })), rooms)
    // Loughborough's matched pair of houses: words drawn in the file, the name says the side
    expect(fv('Internal_Ground.dxf', ['West House (209)', 'East House (207)', 'Internal walls, ground floor', '209_Kitchen'])).toMatchObject({ kind: 'plan', level: { at: [0] } })
    expect(fv('External_First.dxf', ['West', 'House', 'External walls, first floor', '1:50'])).toMatchObject({ kind: 'plan', level: { at: [1] } })
    expect(fv('Elevation_East.dxf', ['East', 'House', '(207)', 'Elevation'])).toMatchObject({ kind: 'elevation', facade: 'east' })
    expect(fv('Siteplan.dxf', ['Site plan, neighbouring dwellings,'])).toMatchObject({ kind: 'site' })
    expect(['GF', '1F', 'RF', 'TYP', 'B1', 'tower 3F plan', 'Level 2'].map((n) => fv(`${n}.dxf`).level)).toEqual([{ at: [0] }, { at: [1] }, { at: ['R'] }, { at: [], typical: true }, { at: [-1] }, { at: [3] }, { at: [2] }])
    expect(['E-1', 'S-2', 'A-101', 'A-201'].map((n) => fv(`${n}.dxf`).kind)).toEqual(['elevation', 'section', 'plan', 'elevation'])
    // nothing said: its lines decide
    expect([fv('drawing.dxf', [], 5).kind, fv('drawing.dxf', [], 1).kind]).toEqual(['plan', 'other'])
  })
  test("a brochure's page a flat (TYPE-A, TYPE-B … all LEVEL 1 to 11): named on the page, joined to the first flat's floor when asked", () => {
    const flatPage = (flat: string) => readSheet(page([T(flat, 300, 120, 30), T('TOWER-1', 300, 90, 12), T('LEVEL 1 to 11', 300, 75, 12)], drawing(100, 200, 900, 700))).views
    expect(flatPage('TYPE-A')).toMatchObject([{ kind: 'plan', flat: 'TYPE-A', level: { at: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } }])
    expect(flatPage('TYPE-C/G/K')[0].flat).toBe('TYPE-C/G/K')
    const picks = ['TYPE-A', 'TYPE-B', 'TYPE-C/G/K'].map((flat) => ({ kind: 'plan' as const, level: levelOf('LEVEL 1 to 11'), flat }))
    expect(setChoices(picks).map((x) => x.tick)).toEqual([true, false, false]) // as before: the first flat on the floors
    expect(setChoices(picks, 0, true).map((x) => [x.tick, x.with])).toEqual([[true, undefined], [true, 0], [true, 0]])
    // the same flat twice (a page and its larger copy) never joins itself
    expect(setChoices([...picks.slice(0, 1), ...picks.slice(0, 1)], 0, true).map((x) => x.tick)).toEqual([true, false])
  })
  test('of two plans of one floor read already, the one with more rooms becomes its drawing', () => {
    const c = setChoices([
      { kind: 'plan', level: levelOf('External walls, first floor'), rooms: 0 },
      { kind: 'plan', level: levelOf('Internal walls, first floor'), rooms: 11 },
    ])
    expect(c.map((x) => x.tick)).toEqual([false, true])
  })
  test('floors in short and back: "B1, G, 2–8, Roof"', () => {
    const ss = [-1, 0, 2, 3, 4, 5, 6, 7, 8, 'R'] as const
    expect(slotsWords([...ss])).toBe('B1, G, 2–8, Roof')
    expect(slotsWords([-2, -1, 0, 1, 2, 3])).toBe('B2, B1, G, 1–3') // never a run across the ground
    expect(parseSlots('B1, G, 2–8, Roof')).toEqual([...ss])
    expect(parseSlots('G-2')).toEqual([0, 1, 2])
    expect(parseSlots('the second')).toBeNull()
  })
})
