/**
 * Vector-PDF import: the hand-made fixture (the two-rooms plan drawn at 1:48 with four printed dimensions) must get its
 * scale from the dimensions and come out as walls, a door, a window and two named rooms; the real samples in
 * `E:/dev/ALTERNATIVE FORMAT TEST/samples/pdf-vector/` (skipped when missing) must parse without throwing, with a table.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { deriveRooms, validate } from '../core'
import { importPdf, readsAsPlan } from './pdf'
import { bezierArc, bigTexts, buildPlan, penRoles, previewPath, printedScale, sheetScale, sheetSymbols, type ArcPrim, type Seg } from './plan2d'

const bytes = (path: string): ArrayBuffer => {
  const b = readFileSync(path)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('pdf fixture', () => {
  test('two rooms at 1:48: scale from the printed dimensions, walls, door, window, labels', async () => {
    const r = await importPdf(bytes(`${__dirname}/fixtures/two-rooms.pdf`), 'two-rooms.pdf')
    expect(r.format).toBe('pdf')
    // 1:48 → one point is 48/72 inch
    expect(r.unitScale).toBeCloseTo((48 * 0.0254) / 72, 4)
    expect(r.notes.some((n) => n.includes('1 : 48'))).toBe(true)
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(7)
    const openings = u.walls.flatMap((w) => w.openings)
    expect(openings.map((o) => o.kind).sort()).toEqual(['door', 'window'])
    expect(openings.find((o) => o.kind === 'door')!.widthM).toBeCloseTo(0.9, 2)
    expect(u.roomLabels.map((l) => [l.name, l.kind, l.printedSize])).toEqual([
      ['LIVING', 'living', `12'-6" x 16'-0"`],
      ['BED ROOM', 'bed', `13'-0" x 16'-0"`],
    ])
    expect(deriveRooms(u)).toHaveLength(2)
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
    expect(readsAsPlan(r)).toBe(true) // two closed rooms: opened as a drawing, not as a picture
    expect(readsAsPlan({ ...r, storeys: [{ ...r.storeys[0], unit: { ...u, walls: u.walls.slice(0, 2) } }] })).toBe(false)
    // 2 rooms but 60 walls (a hatched print: a wall per hatch line): traced better as a picture
    const many = Array.from({ length: 60 }, (_, i) => ({ ...u.walls[i % u.walls.length], id: `w${i}` }))
    expect(readsAsPlan({ ...r, storeys: [{ ...r.storeys[0], unit: { ...u, walls: [...u.walls, ...many] } }] })).toBe(false)
  })

  test('one drawing of a page (a frame): only its lines, texts and fills are read; the page as sheets.ts sees it', async () => {
    const { openPdf, readSheetPage } = await import('./pdf')
    const doc = await openPdf(bytes(`${__dirname}/fixtures/two-rooms.pdf`))
    const page = await readSheetPage(doc, 1)
    expect(page.box.x1 - page.box.x0).toBeGreaterThan(0)
    const living = page.texts.find((t) => t.text === 'LIVING')!
    expect(living.dir).toEqual({ x: 1, y: 0 })
    expect(living.width).toBeGreaterThan(living.height)
    const all = await importPdf(doc, 'two-rooms.pdf', 1, page.box)
    const whole = await importPdf(doc, 'two-rooms.pdf', 1)
    expect(all.storeys[0].unit.walls).toHaveLength(whole.storeys[0].unit.walls.length) // the whole page as its frame: the same
    // the scale its title prints (its scale line may lie outside the frame) is the scale
    const at50 = await importPdf(doc, 'two-rooms.pdf', 1, page.box, 50)
    expect(at50.unitScale).toBeCloseTo((50 * 0.0254) / 72, 6)
    expect(at50.notes.some((n) => n.includes('as printed under the drawing, 1 : 50'))).toBe(true)
    // a frame round the living room's name only: no wall pair, its name alone
    const only = await importPdf(doc, 'two-rooms.pdf', 1, { x0: living.at.x - 40, y0: living.at.y - 20, x1: living.at.x + 40, y1: living.at.y + 20 }).catch((e: Error) => e)
    expect(only instanceof Error ? only.message : only.storeys[0].unit.walls.length).toSatisfy((x: unknown) => x === 'This PDF is a picture, not a drawing — use the picture itself' || x === 0)
    await doc.loadingTask.destroy()
  })

  test('a PDF with no drawn lines is refused as a picture', async () => {
    const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`
    await expect(importPdf(new TextEncoder().encode(pdf).buffer as ArrayBuffer, 'scan.pdf')).rejects.toThrow('This PDF is a picture')
  })

  test('a page with lines but no scale printed as words (a brochure page whose words are outlines): its lines are not read', async () => {
    const ink = '0 0 m 400 0 l 400 300 l 0 300 l h S 10 10 m 390 10 l S'
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 500 500] /Contents 4 0 R >> endobj
4 0 obj << /Length ${ink.length} >> stream
${ink}
endstream endobj
trailer << /Root 1 0 R >>
%%EOF
`
    const r = await importPdf(new TextEncoder().encode(pdf).buffer as ArrayBuffer, 'brochure.pdf')
    expect(r.notes.some((n) => /lines were not read/.test(n))).toBe(true)
    expect(r.storeys[0].unit.walls).toEqual([])
    expect(readsAsPlan(r)).toBe(false) // the Studio opens it as the plan picture, with no "Read its lines instead"
  })
})

const SAMPLES = 'E:/dev/ALTERNATIVE FORMAT TEST/samples/pdf-vector'
const TABLE = 'E:/tmp/win/claude/9e3172d7f121e575/ff4d7c29-aad6-4e91-a50d-b60af8e47464/scratchpad/pdf-eval.md'

describe.skipIf(!existsSync(SAMPLES))('real vector PDFs', () => {
  const files = existsSync(SAMPLES) ? readdirSync(SAMPLES).filter((f) => /\.pdf$/i.test(f)) : []
  const rows: string[] = []
  test.each(files)('%s parses', async (f) => {
    const t0 = performance.now()
    let line: string
    try {
      const r = await importPdf(bytes(`${SAMPLES}/${f}`), f)
      const ms = Math.round(performance.now() - t0)
      const u = r.storeys[0].unit
      const errors = validate(u).filter((i) => i.level === 'error').length
      const closed = deriveRooms(u).filter((x) => x.areaSqm >= 1).length
      const scale = /Scale[^.]*\./.exec(r.notes.join(' '))?.[0] ?? '?'
      const lines = /(\d+) lines/.exec(r.notes[0])?.[1] ?? '?'
      line = `| ${f} | ${scale} | ${lines} | ${u.walls.length} | ${u.walls.reduce((a, w) => a + w.openings.length, 0)} | ${u.roomLabels.length} | ${closed} | ${errors} | ${ms} ms |`
    } catch (e) {
      line = `| ${f} | refused: ${String((e as Error).message)} | | | | | | | ${Math.round(performance.now() - t0)} ms |`
    }
    rows.push(line)
  }, 120_000)
  test('table', () => {
    const table = ['| file | scale | lines | walls | openings | labels | closed rooms | validate errors | time |', '|---|---|---|---|---|---|---|---|---|', ...rows].join('\n')
    console.log(table)
    writeFileSync(TABLE, table)
  })
})

describe('a PDF has no layers: its pens', () => {
  const seg = (layer: string, L: number) => ({ a: { x: 0, y: 0 }, b: { x: L, y: 0 }, layer })
  test('the heaviest stroked pen and a wall-thin grey fill draw the walls; thin lines, white, coloured and room-wide fills do not', () => {
    const segs = [seg('pen 0.24 0,0,0', 500), seg('pen 0.48 0,0,0', 100), seg('pen 1.32 0,0,0', 300), seg('fill #c0c0c0', 200), seg('fill #808080', 200), seg('fill #ffffff', 200), seg('fill #4d5b89', 200), seg('pen 2.00 0,0,0', 1)]
    // at 1 cm a point: the light grey shapes are 10 cm wide on average (walls), the darker ones 1 m (rooms shaded grey)
    const fills = new Map([['fill #c0c0c0', { area: 100, outline: 200 }], ['fill #808080', { area: 10000, outline: 200 }], ['fill #ffffff', { area: 100, outline: 200 }], ['fill #4d5b89', { area: 100, outline: 200 }]])
    expect([...penRoles(segs, fills, 0.01).walls].sort()).toEqual(['fill #c0c0c0', 'pen 1.32 0,0,0'])
    // no scale on the page: a fill says nothing about walls
    expect([...penRoles(segs, fills, null).walls]).toEqual(['pen 1.32 0,0,0'])
  })
  test('one pen for everything: nothing is sorted (every line pair counts, as before)', () => {
    expect(penRoles([seg('pen 0.24 0,0,0', 500)]).walls.size).toBe(0)
  })
})

describe('a scale printed on the sheet', () => {
  test('reads the usual ways of printing it; anything else is no scale', () => {
    expect(printedScale(`1/4" = 1'-0"`)).toBe(48)
    expect(printedScale(`Scale: 1/8"=1'-0"`)).toBe(96)
    expect(printedScale(`1 1/2" = 1'-0"`)).toBe(8)
    expect(printedScale(`1" = 10'`)).toBe(120)
    expect(printedScale('1:100')).toBe(100)
    expect(printedScale('SCALE 1 : 50')).toBe(50)
    for (const t of [`10'-8 1/2"`, '12:30', 'Room-1', `1/4"`, '1:1']) expect(printedScale(t)).toBeNull()
  })
  test("a European sheet's word for scale, and a scale that runs on into the title block's next words", () => {
    expect(printedScale('Scala 1:100')).toBe(100) // Casa Steiner (Archicad, Italian)
    expect(printedScale('M 1:50')).toBe(50)
    expect(printedScale('Maßstab: 1:200')).toBe(200)
    expect(printedScale('Échelle 1:50')).toBe(50)
    expect(printedScale('Escala 1:75')).toBe(75)
    expect(printedScale('1 : 100 Datum: 09.04.2013')).toBe(100) // Pagenstraße 2, Hannover
    for (const t of ['11:22:02', '1:100/50', 'Room 1:1', 'Scala', 'Maßstab 1:1', 'Datum 1:100']) expect(printedScale(t)).toBeNull()
  })
  test('a sheet that prints one scale is read at it, before its dimensions; two different scales say nothing', () => {
    const pt = 0.0254 / 72
    const seg = (x0: number, x1: number, y: number) => ({ a: { x: x0, y }, b: { x: x1, y }, layer: '' })
    // three dimensions that say a unit is 2.54 cm (10'-0" on 120 units), and the sheet's note that says 1 : 48
    const segs = [seg(0, 120, 0), seg(0, 60, 50), seg(0, 30, 100)]
    const dims = [`10'-0"`, `5'-0"`, `2'-6"`].map((text, i) => ({ at: { x: [60, 30, 15][i], y: i * 50 + 3 }, text, layer: '', height: 6 }))
    const note = { at: { x: 0, y: -50 }, text: `1/4" = 1'-0"`, layer: '', height: 6 }
    expect(sheetScale(segs, [...dims, note], () => '', pt).scale).toBeCloseTo(48 * pt, 9)
    expect(sheetScale(segs, dims, () => '', pt).scale).toBeCloseTo(0.0254, 6)
    expect(sheetScale(segs, [...dims, note, { ...note, text: '1:100' }], () => '', pt).scale).toBeCloseTo(0.0254, 6)
    // no paper unit (an SVG): the note is not read
    expect(sheetScale(segs, [...dims, note]).scale).toBeCloseTo(0.0254, 6)
  })
})

describe('texts that name no room', () => {
  test("a stair's UP and a door or window tag in a room do not take its name", () => {
    // one 4 × 3 m room, walls 20 cm thick (each wall its two faces), the names in it biggest first
    const box = (d: number) => [[d, d, 4 - d, d], [4 - d, d, 4 - d, 3 - d], [4 - d, 3 - d, d, 3 - d], [d, 3 - d, d, d]].map(([x0, y0, x1, y1]) => ({ a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, layer: 'WALL' }))
    const text = (t: string, height: number) => ({ at: { x: 2, y: 1.5 }, text: t, layer: 'TEXT', height })
    const r = buildPlan({ segs: [...box(-0.1), ...box(0.1)], arcs: [], loops: [], scale: 1, texts: [text('UP', 0.3), text('Win-18', 0.2), text('D-3', 0.2), text('Room-4', 0.1)] }, 'tags')
    expect(r.unit.roomLabels.map((l) => l.name)).toEqual(['Room-4'])
  })
})

describe("the sheet's symbols are not walls (session 31 levels: the farmhouse set's markers and stair break became wall pieces)", () => {
  const PT = 0.0254 / 72
  const mm = 0.001 / PT // a paper millimetre in points
  const seg = (ax: number, ay: number, bx: number, by: number, layer = 'pen 1.08 0'): Seg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, layer })
  /** a polyline: each line starts where the last one ended (one drawn path) */
  const path = (...p: [number, number][]): Seg[] => p.slice(1).map((q, i) => seg(p[i][0], p[i][1], q[0], q[1]))
  /** a circle as four quarter arcs, centre (x, y), radius r */
  const circle = (x: number, y: number, r: number): ArcPrim[] => [0, 1, 2, 3].map((k) => ({ c: { x, y }, r, a0: (k * Math.PI) / 2, a1: ((k + 1) * Math.PI) / 2, layer: '' }))
  const text = (t: string, x: number, y: number) => ({ at: { x, y }, text: t, layer: '', height: 2 * mm })
  test('a curve that is an arc of a circle: a quarter, a door drawn open at 45°; a curve that is not, none', () => {
    const k = 0.5523
    expect(bezierArc({ x: 10, y: 0 }, { x: 10, y: 10 * k }, { x: 10 * k, y: 10 }, { x: 0, y: 10 })).toMatchObject({ c: { x: expect.closeTo(0, 3), y: expect.closeTo(0, 3) }, r: expect.closeTo(10, 3) })
    // a 45° arc (the farmhouse WC door): tangents 4/3·tan(θ/4)·r long
    const h = (4 / 3) * Math.tan(Math.PI / 16) * 36
    const e = { x: 36 * Math.cos(Math.PI / 4), y: 36 * Math.sin(Math.PI / 4) }
    const a = bezierArc({ x: 36, y: 0 }, { x: 36, y: h }, { x: e.x + h * Math.sin(Math.PI / 4), y: e.y - h * Math.cos(Math.PI / 4) }, e)!
    expect(a.r).toBeCloseTo(36, 1)
    expect(a.a1 - a.a0).toBeCloseTo(Math.PI / 4, 2)
    expect(bezierArc({ x: 0, y: 0 }, { x: 5, y: 8 }, { x: 10, y: -8 }, { x: 15, y: 0 })).toBeNull() // an S
  })
  test('an elevation marker (a circle with its number, its two triangle sides) goes; a column (a square with its X) stays', () => {
    const r = 4 * mm
    const marker = path([-1.41 * r, 0], [0, 1.41 * r], [1.41 * r, 0]) // the diamond's top half round the bubble
    const column = path([100, 100], [103, 100], [103, 103], [100, 103], [100, 100]).concat(seg(100, 100, 103, 103), seg(103, 100, 100, 103))
    const wall = [seg(-60, -5, 60, -5), seg(-60, 5, 60, 5)] // a wall passing the bubble: its lines run far past it
    const segs = [...marker, ...column, ...wall]
    const out = sheetSymbols(segs, circle(0, 0, r), [text('A3.1', 0, -r / 3), text('1', 0, r / 3)], PT)
    expect([...out.segs].sort((p, q) => p - q)).toEqual([0, 1])
    expect(out.arcs.size).toBe(4)
    // the same circle with nothing written in it (a round column, a woodstove): kept
    expect(sheetSymbols(segs, circle(0, 0, r), [], PT).segs.size).toBe(0)
  })
  test("a stair's arrow (its head and the run of lines behind it) goes; a wall's corner does not look like one", () => {
    const head = [seg(0, 0, -1.5 * mm, -2 * mm), seg(0, 0, 1.5 * mm, -2 * mm)] // the farmhouse's: 90° open, 2 mm barbs
    const shaft = path([0, 0], [0, -20 * mm], [10 * mm, -30 * mm]) // with a bend
    // (a chamfered wall corner: two short faces from one point, a long line between them — but the faces go on)
    const corner = path([50 + 20 * mm, 3 * mm], [50 + 3 * mm, 0], [50, 0], [50, 3 * mm], [50 + 3 * mm, 20 * mm]).concat(path([50, 0], [50 + 20 * mm, 20 * mm]))
    const out = sheetSymbols([...head, ...shaft, ...corner], [], [text('UP', 0, -25 * mm)], PT)
    expect([...out.segs].sort((p, q) => p - q)).toEqual([0, 1, 2, 3])
    expect(out.why.get(2)).toBe('arrow')
  })
  test('a break line (a long line, a slanted zigzag across it, the line again) goes; a wall end cap (square to it) stays', () => {
    const brk = path([0, 0], [30 * mm, 0], [32 * mm, 3 * mm], [34 * mm, -3 * mm], [36 * mm, 0], [70 * mm, 0])
    const cap = path([0, 50], [30 * mm, 50], [30 * mm, 50 + 2 * mm], [29 * mm, 50 + 2 * mm], [29 * mm, 50 + 4 * mm], [0, 50 + 4 * mm])
    const out = sheetSymbols([...brk, ...cap], [], [], PT)
    expect([...out.segs].sort((p, q) => p - q)).toEqual([0, 1, 2, 3, 4])
    expect(out.why.get(0)).toBe('break')
  })
  test('a door drawn open at 45° is a door (its swing hinged on the wall), not a passage', () => {
    // a 4 m wall, 20 cm thick, with a 0.9 m gap at 1–1.9 m; its leaf drawn 45° open, hinged at (1, 0.1) on the wall's face
    const face = (y: number): Seg[] => [seg(0, y, 1, y, 'WALL'), seg(1.9, y, 4, y, 'WALL')]
    const swing: ArcPrim = { c: { x: 1, y: 0.1 }, r: 0.9, a0: 0, a1: Math.PI / 4, layer: '' }
    const r = buildPlan({ segs: [...face(-0.1), ...face(0.1)], arcs: [swing], loops: [], texts: [], scale: 1 }, 'door45')
    expect(r.unit.walls.flatMap((w) => w.openings).map((o) => o.kind)).toEqual(['door'])
  })
})

describe('a DXF / SVG of a set: its words and its picture', () => {
  test('its words biggest first, dimensions left out, one line each; its lines as one path in the plan frame', () => {
    const t = (text: string, height: number, layer = 'TEXT') => ({ at: { x: 0, y: 0 }, text, height, layer })
    expect(bigTexts([t('209_Kitchen', 0.12), t('Internal walls,\nground floor', 0.16), t('3200', 0.5, 'DIM:A-DIMS')])).toEqual([
      { text: 'Internal walls,', height: 0.16 },
      { text: 'ground floor', height: 0.16 },
      { text: '209_Kitchen', height: 0.12 },
    ])
    // a line from (2, 5) to (4, 5) in millimetres from the origin (1, 6): plan metres, y down
    expect(previewPath([{ a: { x: 2000, y: 5000 }, b: { x: 4000, y: 5000 }, layer: '' }], [], 0.001, { x: 1000, y: 6000 })).toBe('M1 1L3 1')
  })
})
