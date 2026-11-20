/**
 * Vector-PDF import: the hand-made fixture (the two-rooms plan drawn at 1:48 with four printed dimensions) must get its
 * scale from the dimensions and come out as walls, a door, a window and two named rooms; the real samples in
 * `E:/dev/ALTERNATIVE FORMAT TEST/samples/pdf-vector/` (skipped when missing) must parse without throwing, with a table.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { deriveRooms, validate } from '../core'
import { importPdf, penRoles, readsAsPlan } from './pdf'

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
  test('the heaviest stroked pen and a grey fill draw the walls; thin lines, white and coloured fills do not', () => {
    const segs = [seg('pen 0.24 0,0,0', 500), seg('pen 0.48 0,0,0', 100), seg('pen 1.32 0,0,0', 300), seg('fill #c0c0c0', 200), seg('fill #ffffff', 200), seg('fill #4d5b89', 200), seg('pen 2.00 0,0,0', 1)]
    expect([...penRoles(segs).walls].sort()).toEqual(['fill #c0c0c0', 'pen 1.32 0,0,0'])
  })
  test('one pen for everything: nothing is sorted (every line pair counts, as before)', () => {
    expect(penRoles([seg('pen 0.24 0,0,0', 500)]).walls.size).toBe(0)
  })
})
