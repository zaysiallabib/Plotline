/**
 * Vector-PDF import: the hand-made fixture (the two-rooms plan drawn at 1:48 with four printed dimensions) must get its
 * scale from the dimensions and come out as walls, a door, a window and two named rooms; the real samples in
 * `E:/dev/ALTERNATIVE FORMAT TEST/samples/pdf-vector/` (skipped when missing) must parse without throwing, with a table.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { deriveRooms, validate } from '../core'
import { importPdf, readsAsPlan } from './pdf'
import { buildPlan, penRoles, printedScale, sheetScale } from './plan2d'

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

  test('a PDF with no drawn lines is refused as a picture', async () => {
    const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`
    await expect(importPdf(new TextEncoder().encode(pdf).buffer as ArrayBuffer, 'scan.pdf')).rejects.toThrow('This PDF is a picture')
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
