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
import { splinePoints, stripMtext } from './dxf'

/** a DXF from group code / value pairs */
const dxfOf = (header: (string | number)[], entities: (string | number)[]) =>
  ['0', 'SECTION', '2', 'HEADER', ...header, '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...entities, '0', 'ENDSEC', '0', 'EOF'].join('\n')

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

  test('MLINE walls (two lines drawn as one): a closed 4 x 3 m room of 20 cm walls', async () => {
    // vertices of the outer face, miter pointing in; element 1 on the vertex, element 2 0.2 m in along the miter
    const corners = [[0, 0], [4, 0], [4, 3], [0, 3]]
    const vertex = ([x, y]: number[]) => {
      const mx = x === 0 ? 1 : -1, my = y === 0 ? 1 : -1
      const k = Math.SQRT2 * 0.2
      return [11, x, 21, y, 31, 0, 12, 1, 22, 0, 32, 0, 13, mx / Math.SQRT2, 23, my / Math.SQRT2, 33, 0, 74, 1, 41, 0, 75, 0, 74, 1, 41, k, 75, 0]
    }
    const text = dxfOf(['9', '$INSUNITS', '70', 6], ['0', 'MLINE', '8', 'A-WALL', '2', 'STANDARD', '40', 1, '70', 0, '71', 3, '72', 4, '73', 2, '10', 0, '20', 0, '30', 0, ...corners.flatMap(vertex)])
    const r = await importDxf(text, 'mline.dxf')
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(4)
    expect(u.walls.every((w) => Math.abs(w.thicknessM - 0.2) < 0.005)).toBe(true)
    const rooms = deriveRooms(u)
    expect(rooms).toHaveLength(1)
    expect(rooms[0].areaSqm).toBeCloseTo(3.8 * 2.8, 1)
  })

  test('a spline follows its curve: a clamped cubic starts and ends on its end points, bends toward the others', () => {
    const ctrl = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 0 }]
    const pts = splinePoints(ctrl, [0, 0, 0, 0, 1, 1, 1, 1], 3)
    expect(pts[0]).toEqual({ x: 0, y: 0 })
    expect(pts.at(-1)!.x).toBeCloseTo(4, 9)
    const mid = pts[Math.floor(pts.length / 2)]
    expect(mid.x).toBeCloseTo(2, 6)
    expect(mid.y).toBeCloseTo(1.5, 6) // a Bezier's middle: (0 + 3·2 + 3·2 + 0) / 8
    expect(splinePoints(ctrl, [0, 1], 3)).toBe(ctrl) // knots that do not match: the control polygon
    expect(splinePoints(ctrl, undefined, 3, [{ x: 0, y: 0 }, { x: 4, y: 0 }])).toHaveLength(2) // or its fit points
  })

  test('a file that is not a DXF is refused in plain words', async () => {
    await expect(importDxf('hello', 'x.dxf')).rejects.toThrow()
  })
})

const SAMPLES = 'E:/dev/ALTERNATIVE FORMAT TEST/samples'
const FOLDERS = ['dxf', 'dwg/converted']
const TABLE = 'E:/dev/tmp/dxf-eval.md'

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
    if (existsSync('E:/dev/tmp')) writeFileSync(TABLE, table)
  })
})
