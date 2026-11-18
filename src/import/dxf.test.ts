/**
 * DXF import: the hand-written fixtures (a 2-room plan in mm with a door arc, a window and a column; the same in feet with
 * door / window blocks) must come out as the right walls, openings, labels and closed rooms; the real samples in
 * `E:/dev/ALTERNATIVE FORMAT TEST/samples/dxf/` (skipped when the folder is missing) must parse without throwing, and a
 * table says what each gave (also written to the scratch file named below).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { deriveRooms, validate } from '../core'
import { EXTERIOR_M, PARTITION_M } from '../studio/model'
import { importDxf } from './dxf'
import { stripMtext } from './dxf'

const fixture = (f: string) => readFileSync(`${__dirname}/fixtures/${f}.dxf`, 'utf8')

describe('dxf fixtures', () => {
  test('two rooms in mm: paired wall lines, a door arc, window lines, a column, texts', async () => {
    const r = await importDxf(fixture('two-rooms-mm'), 'two-rooms-mm.dxf')
    expect(r.format).toBe('dxf')
    expect(r.unitScale).toBe(0.001)
    expect(r.storeys).toHaveLength(1)
    const u = r.storeys[0].unit
    // 4 outer walls, the bottom and top ones split by the partition's T, the partition itself
    expect(u.walls).toHaveLength(7)
    expect(u.walls.filter((w) => w.thicknessM === EXTERIOR_M)).toHaveLength(6)
    expect(u.walls.filter((w) => w.thicknessM === PARTITION_M)).toHaveLength(1)
    const openings = u.walls.flatMap((w) => w.openings)
    expect(openings.map((o) => o.kind).sort()).toEqual(['door', 'window'])
    const door = openings.find((o) => o.kind === 'door')!
    expect(door.widthM).toBeCloseTo(0.9, 3)
    expect(door.hinge).toBeDefined()
    expect(openings.find((o) => o.kind === 'window')!.widthM).toBeCloseTo(1.5, 3)
    expect(u.pillars).toHaveLength(1)
    expect(u.pillars![0].wM).toBeCloseTo(0.4, 3)
    expect(u.roomLabels.map((l) => [l.name, l.kind, l.printedSize])).toEqual([
      ['LIVING', 'living', `12'-6" x 16'-0"`],
      ['BED ROOM', 'bed', `13'-0" x 16'-0"`],
      ['TYPE-A ±2736 SFT', 'other', undefined],
    ])
    expect(u.areaSqft).toBe(2736)
    const rooms = deriveRooms(u)
    expect(rooms.map((x) => x.name).sort()).toEqual(['BED ROOM', 'LIVING'])
    expect(rooms.every((x) => Math.abs(x.areaSqm - 20) < 0.01)).toBe(true)
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
    expect(r.notes.some((n) => n.includes('millimetres'))).toBe(true)
    expect(r.notes.some((n) => n.includes('"TITLE": ignored'))).toBe(true)
    expect(r.origin).toEqual({ x: 0, y: 5000 })
  })

  test('two rooms in feet: a turned, mirrored door block and a window block', async () => {
    const r = await importDxf(fixture('two-rooms-ft'), 'two-rooms-ft.dxf')
    expect(r.unitScale).toBe(0.3048)
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(7)
    expect(u.walls.every((w) => Math.abs(w.thicknessM - 0.1524) < 0.001)).toBe(true)
    const openings = u.walls.flatMap((w) => w.openings)
    expect(openings.map((o) => o.kind).sort()).toEqual(['door', 'window'])
    expect(openings.find((o) => o.kind === 'door')!.widthM).toBeCloseTo(0.9144, 3)
    expect(openings.find((o) => o.kind === 'window')!.widthM).toBeCloseTo(1.2192, 3)
    expect(u.roomLabels.map((l) => l.kind).sort()).toEqual(['bed', 'dining'])
    expect(deriveRooms(u)).toHaveLength(2)
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
    expect(r.notes.some((n) => n.includes('DOOR36'))).toBe(true)
  })

  test('mtext formatting codes are stripped', () => {
    expect(stripMtext(`{\\fArial|b1;BED ROOM}\\P13'-0" x 16'-0"`)).toBe(`BED ROOM\n13'-0" x 16'-0"`)
    expect(stripMtext('\\A1;\\H2.5x;LIVING %%p 2 %%d')).toBe('LIVING ± 2 °')
  })

  test('a file that is not a DXF is refused in plain words', async () => {
    await expect(importDxf('hello', 'x.dxf')).rejects.toThrow()
  })
})

const SAMPLES = 'E:/dev/ALTERNATIVE FORMAT TEST/samples'
const FOLDERS = ['dxf', 'dwg/converted']
const TABLE = 'E:/tmp/win/claude/9e3172d7f121e575/ff4d7c29-aad6-4e91-a50d-b60af8e47464/scratchpad/dxf-eval.md'

describe.skipIf(!existsSync(SAMPLES))('real DXF samples', () => {
  const files = FOLDERS.flatMap((d) => (existsSync(`${SAMPLES}/${d}`) ? readdirSync(`${SAMPLES}/${d}`).filter((f) => /.dxf$/i.test(f)).map((f) => `${d}/${f}`) : []))
  const rows: string[] = []
  test.each(files)('%s parses', async (f) => {
    const t0 = performance.now()
    const r = await importDxf(readFileSync(`${SAMPLES}/${f}`, 'utf8'), f)
    const ms = Math.round(performance.now() - t0)
    const u = r.storeys[0].unit
    const errors = validate(u).filter((i) => i.level === 'error').length
    const closed = deriveRooms(u).filter((x) => x.areaSqm >= 1).length
    const version = /DXF version ([^.(]+)/.exec(r.notes[0])?.[1]?.trim() ?? '?'
    const units = /Units: ([^;(]+)/.exec(r.notes[1])?.[1]?.trim() ?? '?'
    const lines = /(\d+) lines read/.exec(r.notes.join('\n'))?.[1] ?? '?'
    rows.push(`| ${f.split('/').pop()} | ${version} | ${units} | ${lines} | ${u.walls.length} | ${u.walls.reduce((a, w) => a + w.openings.length, 0)} | ${u.pillars?.length ?? 0} | ${u.roomLabels.length} | ${closed} | ${errors} | ${ms} ms |`)
    expect(u).toBeDefined()
  }, 120_000)
  test('table', () => {
    const table = ['| file | DXF | units | lines | walls | openings | columns | labels | closed rooms | validate errors | time |', '|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n')
    console.log(table)
    writeFileSync(TABLE, table)
  })
})
