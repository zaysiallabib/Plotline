/**
 * SVG import: the two-room plan of the DXF fixtures drawn as an SVG sheet at 1:50 (one user unit = one paper millimetre =
 * 50 real mm), y down as SVG is. Layered (Inkscape labels: walls, door arc as an arc command, window lines, columns, texts,
 * three printed dimensions for the scale) and flat (no layers, the door as a bezier, under a group transform).
 */
import { describe, expect, test } from 'vitest'
import { deriveRooms, validate } from '../core'
import { importSvg, parseTransform, parseXml, readSvg } from './svg'

// real millimetres (the DXF fixture's, y up) → paper millimetres, y down
const X = (mm: number) => +(mm / 50).toFixed(3)
const Y = (mm: number) => +(120 - mm / 50).toFixed(3)
const line = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${X(x1)}" y1="${Y(y1)}" x2="${X(x2)}" y2="${Y(y2)}"/>`
const walls = [
  // the outer face with the window's gap, the inner face, the partition with the door's gap
  `<polyline points="${X(1000)},${Y(-125)} ${X(-125)},${Y(-125)} ${X(-125)},${Y(5125)} ${X(8125)},${Y(5125)} ${X(8125)},${Y(-125)} ${X(2500)},${Y(-125)}"/>`,
  line(125, 125, 125, 4875), line(125, 4875, 7875, 4875), line(7875, 4875, 7875, 125), line(125, 125, 1000, 125), line(2500, 125, 3937.5, 125), line(4062.5, 125, 7875, 125),
  line(3937.5, 125, 3937.5, 1000), line(3937.5, 1900, 3937.5, 4875), line(4062.5, 125, 4062.5, 1000), line(4062.5, 1900, 4062.5, 4875),
].join('')
const windowLines = [line(1000, -50, 2500, -50), line(1000, 0, 2500, 0), line(1000, 50, 2500, 50), line(1000, -125, 1000, 125), line(2500, -125, 2500, 125)].join('')
const texts = (k = 1) =>
  `<text x="${X(1500)}" y="${Y(2500)}" font-size="${4 * k}">LIVING<tspan x="${X(1500)}" dy="5" font-size="${3 * k}">12'-6" x 16'-0"</tspan></text>` +
  `<text x="${X(6000)}" y="${Y(2600)}" style="font-size:${4 * k}px">BED ROOM</text><text x="${X(6000)}" y="${Y(2300)}" font-size="${3 * k}">13'-0" x 16'-0"</text>`
// three printed dimensions under / beside the plan, each on its own dimension line
const dims = [
  line(-125, -900, 8125, -900) + `<text x="${X(4000)}" y="${Y(-850)}" font-size="3" text-anchor="middle">8250 mm</text>`,
  line(-900, -125, -900, 5125) + `<text transform="translate(${X(-950)} ${Y(2500)}) rotate(-90)" font-size="3" text-anchor="middle">5250 mm</text>`,
  line(-125, 5900, 4000, 5900) + `<text x="${X(1937)}" y="${Y(5950)}" font-size="3" text-anchor="middle">4125 mm</text>`,
].join('')

const layered = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with Inkscape -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="297mm" height="210mm" viewBox="0 0 297 210">
  <defs><symbol id="col"><rect x="0" y="0" width="8" height="8"/></symbol></defs>
  <g inkscape:groupmode="layer" id="layer1" inkscape:label="A-WALL" style="fill:none;stroke:#000">${walls}</g>
  <g inkscape:groupmode="layer" id="layer2" inkscape:label="A-DOOR">${line(4000, 1000, 4900, 1000)}<path d="M ${X(4900)},${Y(1000)} A ${X(900)} ${X(900)} 0 0 0 ${X(4000)},${Y(1900)}"/></g>
  <g inkscape:groupmode="layer" id="layer3" inkscape:label="A-GLAZ">${windowLines}</g>
  <g id="A-COLS"><use href="#col" x="${X(7475)}" y="${Y(4875)}"/></g>
  <g id="A-ANNO">${texts()}</g>
  <g id="A-DIMS">${dims}</g>
  <g id="hidden" style="display:none">${line(0, 0, 9000, 9000)}</g>
</svg>`

describe('svg import', () => {
  test('a layered sheet at 1:50: scale from three printed dimensions, walls, a door arc, a window, a column, names and sizes', async () => {
    const r = await importSvg(layered, 'two-rooms.svg')
    expect(r.format).toBe('svg')
    expect(r.unitScale).toBeCloseTo(0.05, 3) // one paper mm = 50 real mm
    expect(r.notes.some((n) => /3 printed dimensions/.test(n))).toBe(true)
    expect(r.notes.some((n) => n.includes('Layer "A-WALL": walls'))).toBe(true)
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(7)
    const openings = u.walls.flatMap((w) => w.openings)
    expect(openings.map((o) => o.kind).sort()).toEqual(['door', 'window'])
    expect(openings.find((o) => o.kind === 'door')!.widthM).toBeCloseTo(0.9, 2)
    expect(openings.find((o) => o.kind === 'window')!.widthM).toBeCloseTo(1.5, 2)
    expect(u.pillars).toHaveLength(1)
    expect(u.pillars![0].wM).toBeCloseTo(0.4, 2)
    expect(u.roomLabels.map((l) => [l.name, l.kind, l.printedSize])).toEqual([
      ['LIVING', 'living', `12'-6" x 16'-0"`],
      ['BED ROOM', 'bed', `13'-0" x 16'-0"`],
    ])
    const rooms = deriveRooms(u)
    expect(rooms.map((x) => x.name).sort()).toEqual(['BED ROOM', 'LIVING'])
    expect(rooms.every((x) => Math.abs(x.areaSqm - 20) < 0.05)).toBe(true)
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
  })

  test('a flat sheet (no layers) under a group transform, the door as a bezier: the same plan', async () => {
    const k = 0.5523
    const door = `<path d="M${X(4900)} ${Y(1000)}C${X(4900)} ${Y(1000 + 900 * k)} ${X(4000 + 900 * k)} ${Y(1900)} ${X(4000)} ${Y(1900)}"/>${line(4000, 1000, 4900, 1000)}`
    const flat = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><g transform="scale(2) translate(10,5)">${walls}${door}${windowLines}${texts()}${dims}</g></svg>`
    const r = await importSvg(flat, 'flat.svg')
    expect(r.unitScale).toBeCloseTo(0.025, 3) // the group doubles every length
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(7)
    expect(u.walls.flatMap((w) => w.openings).map((o) => o.kind).sort()).toEqual(['door', 'window'])
    expect(deriveRooms(u)).toHaveLength(2)
  })

  test('a flat sheet drawn with pens (a CAD print as SVG): the heavy pen is the walls; thin floor tiles and a wardrobe are not', async () => {
    // the living room tiled every 45 cm and a 2 × 0.5 m wardrobe in the bedroom, in thin lines: in one pen their lines pair into walls
    const tiles = Array.from({ length: 9 }, (_, i) => line(300, 300 + 450 * i, 3800, 300 + 450 * i) + line(300 + 400 * i, 300, 300 + 400 * i, 4700)).join('')
    const wardrobe = line(5000, 4200, 7000, 4200) + line(7000, 4200, 7000, 4700) + line(7000, 4700, 5000, 4700) + line(5000, 4700, 5000, 4200)
    const k = 0.5523
    const door = `<path d="M${X(4900)} ${Y(1000)}C${X(4900)} ${Y(1000 + 900 * k)} ${X(4000 + 900 * k)} ${Y(1900)} ${X(4000)} ${Y(1900)}"/>${line(4000, 1000, 4900, 1000)}`
    const sheet = (heavy: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 210"><g style="stroke:#000;fill:none;stroke-width:${heavy}">${walls}</g><g stroke="rgb(0,0,0)" stroke-width="0.18" fill="none">${tiles}${wardrobe}${door}${windowLines}${dims}</g>${texts()}</svg>`
    const r = await importSvg(sheet(0.7), 'pens.svg')
    expect(r.notes.some((n) => n.includes('sorted by pen: the heaviest (0.70 units wide, #000000)'))).toBe(true)
    const u = r.storeys[0].unit
    expect(u.walls).toHaveLength(7)
    expect(u.walls.flatMap((w) => w.openings).map((o) => o.kind).sort()).toEqual(['door', 'window'])
    expect(deriveRooms(u).map((x) => x.name).sort()).toEqual(['BED ROOM', 'LIVING'])
    // one pen for everything: nothing to sort by — the tiles and the wardrobe make walls, as before
    expect((await importSvg(sheet(0.18), 'one-pen.svg')).storeys[0].unit.walls.length).toBeGreaterThan(7)
  })

  test('paths: relative commands, H / V, Z closes a shape, arc flags run together', () => {
    const r = readSvg(`<svg><path d="m10,10h20v10H10z"/><path d="M0 0a5 5 0 015 5"/></svg>`)
    expect(r.loops).toHaveLength(1)
    expect(r.loops[0].pts.map((p) => [p.x, -p.y])).toEqual([[10, 10], [30, 10], [30, 20], [10, 20], [10, 10]])
    expect(r.arcs).toHaveLength(1) // the quarter circle (0 0 → 5 5, radius 5)
    expect(r.arcs[0].r).toBeCloseTo(5, 6)
  })

  test('transforms compose left to right; entities and CDATA decode; a picture-only SVG is refused', async () => {
    const m = parseTransform('translate(10 20) rotate(90)')
    expect(m[0]).toBeCloseTo(0, 9)
    expect(m[4]).toBe(10)
    expect(parseXml('<a t="x &amp; y"><![CDATA[1 < 2]]></a>').children[0]).toMatchObject({ attrs: { t: 'x & y' }, text: '1 < 2' })
    await expect(importSvg('<svg><image href="plan.png" width="10" height="10"/></svg>', 'p.svg')).rejects.toThrow(/only a picture/)
  })
})
