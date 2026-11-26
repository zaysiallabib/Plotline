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
import { MAX_DXF_ENTITIES, importDxf } from './dxf'
import { plainMtext, splinePoints } from './dxf'
import { MAX_DXF_BYTES, importFile } from './index'
import { roleOf } from './plan2d'

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
    expect(plainMtext(`{\\fArial|b1;BED ROOM}\\P13'-0" x 16'-0"`)).toBe(`BED ROOM\n13'-0" x 16'-0"`)
    expect(plainMtext('\\A1;\\H2.5x;LIVING %%p 2 %%d')).toBe('LIVING ± 2 °')
    expect(plainMtext('%%c600 %%%')).toBe('Ø600 %')
  })

  // Maheer's Plotline 2.0 (src/dxf/dxf.test.ts), on our decoder
  test('unicode escapes, escaped braces and backslashes survive; a TEXT keeps its own braces', () => {
    expect(plainMtext(String.raw`{\C1;BEDROOM}\P12´-0\U+00B4`)).toBe('BEDROOM\n12´-0´')
    expect(plainMtext(String.raw`{\pxqc;\L\U+0042ED\l}\P\{A\} \\P \S1#2;`)).toBe('BED\n{A} \\P 1/2')
    expect(plainMtext(String.raw`{A} \U+0042ED`, true)).toBe('{A} BED')
    expect(plainMtext(String.raw`%%c100 \P`, true)).toBe(String.raw`Ø100 \P`)
  })

  test('a Bangla room name written as \\U+ codes (a file older than AutoCAD 2007) names its room in Bangla', async () => {
    const r = await importDxf(fixture('bangla-room'), 'bangla-room.dxf')
    const u = r.storeys[0].unit
    expect(u.roomLabels.map((l) => [l.name, l.printedSize])).toEqual([['শয়ন কক্ষ', `13'-0" x 9'-10"`]])
    expect(deriveRooms(u).map((x) => x.name)).toEqual(['শয়ন কক্ষ'])
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

  test('too big, too many things, binary: refused at once, saying why and what to do (from Maheer\'s Plotline 2.0)', async () => {
    const big = new File([new Uint8Array(MAX_DXF_BYTES + 1)], 'plans.dxf')
    await expect(importFile(big)).rejects.toThrow('it is 15.0 MB, and Plotline reads a DXF of up to 15.0 MB — save only the floor plan')
    await expect(importDxf('AutoCAD Binary DXF\r\n\x1a\0\0\0', 'b.dxf')).rejects.toThrow('it is a binary DXF — save it as ASCII DXF in your CAD program')
    const points = Array.from({ length: MAX_DXF_ENTITIES + 1 }, () => ['0', 'POINT', '8', '0', '10', 0, '20', 0]).flat()
    await expect(importDxf(dxfOf([], points), 'p.dxf')).rejects.toThrow('it holds 50,001 drawn things, and Plotline reads up to 50,000')
    // a block put in a 1000 × 1001 array opens into too many lines
    const blocks = ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '2', 'TICK', '10', 0, '20', 0, '0', 'LINE', '8', '0', '10', 0, '20', 0, '11', 1, '21', 0, '0', 'ENDBLK', '0', 'ENDSEC']
    const many = dxfOf([], ['0', 'INSERT', '2', 'TICK', '8', '0', '10', 0, '20', 0, '70', 1000, '71', 1001, '44', 2, '45', 2]).replace('0\nSECTION\n2\nENTITIES', [...blocks, '0', 'SECTION', '2', 'ENTITIES'].join('\n'))
    await expect(importDxf(many, 'm.dxf')).rejects.toThrow('its blocks open into more than 1,000,000 lines')
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

describe('layer names', () => {
  test('the names CAD templates use, in any case and several languages; a wall structure is no door', () => {
    const cases: [string, string][] = [
      ['A-WALL', 'wall'], ['a-wall-full', 'wall'], ['WALLS', 'wall'], ['Wände', 'wall'], ['MURS_EXT', 'wall'], ['MUROS', 'wall'], ['S-STRUCTURE', 'wall'],
      ['A-WALL-PATT', 'wall'], ['A-DOOR', 'door'], ['PORTES', 'door'], ['Türen', 'door'], ['A-GLAZ', 'window'], ['FENSTER', 'window'], ['VENTANAS', 'window'],
      ['S-COLS', 'column'], ['Stützen', 'column'], ['A-ANNO-TEXT', 'text'], ['A-AREA-IDEN', 'text'], ['A-ANNO-DIMS', 'dim'], ['COTATION', 'dim'],
      ['A-FURN', 'ignore'], ['Möbel', 'ignore'], ['Q-CASE', 'ignore'], ['S-STRS', 'ignore'], ['A-FLOR-PATT', 'ignore'],
      ['PLOTLINE_ZONES', 'zone'], ['PLOTLINE_KERBS', 'kerb'], ['Layer 7', 'unknown'],
    ]
    for (const [name, role] of cases) expect([name, roleOf(name)]).toEqual([name, role])
  })

  test("a person's correction wins over the table (a block still wins over both), and changes what is read", async () => {
    expect(roleOf('Layer 7', undefined, { 'LAYER 7': 'wall' })).toBe('wall')
    expect(roleOf('A-WALL', undefined, { 'A-WALL': 'ignore' })).toBe('ignore')
    expect(roleOf('Layer 7', 'DOOR-1', { 'LAYER 7': 'wall' })).toBe('door')
    // a 4 x 3 m room drawn as two outlines (faces 20 cm apart) on "Layer 7", and a 60 cm deep cupboard on "Layer 8"
    const rect = (layer: string, x0: number, y0: number, x1: number, y1: number) => ['0', 'LWPOLYLINE', '8', layer, '90', 4, '70', 1, '10', x0, '20', y0, '10', x1, '20', y0, '10', x1, '20', y1, '10', x0, '20', y1]
    const text = dxfOf(['9', '$INSUNITS', '70', 6], [...rect('Layer 7', 0, 0, 4.4, 3.4), ...rect('Layer 7', 0.2, 0.2, 4.2, 3.2), ...rect('Layer 8', 0.4, 0.4, 2.4, 0.85)])
    const plain = await importDxf(text, 'a.dxf')
    expect(plain.layers!.map((l) => [l.name, l.role])).toEqual([['Layer 7', 'unknown'], ['Layer 8', 'unknown']])
    expect(plain.notes.some((n) => /could not place: "Layer 7", "Layer 8"/.test(n))).toBe(true)
    const mine = await importDxf(text, 'a.dxf', { 'LAYER 7': 'wall', 'LAYER 8': 'ignore' })
    expect(mine.layers!.map((l) => [l.name, l.role, l.yours])).toEqual([['Layer 7', 'wall', true], ['Layer 8', 'ignore', true]])
    expect(mine.notes.some((n) => /could not place/.test(n))).toBe(false)
    expect(deriveRooms(mine.storeys[0].unit)).toHaveLength(1)
    expect(mine.storeys[0].unit.walls.every((w) => Math.abs(w.thicknessM - 0.2) < 0.01)).toBe(true)
  })
})
