/**
 * The drawing as a DXF (session 31) — what a developer's architect asks back for: AutoCAD R12 text (the version every CAD
 * program reads), in metres ($INSUNITS 6), y up as CAD draws. Layers: WALLS (each solid wall piece a closed polyline, its
 * ends reaching into the wall it meets so the corners close), DOORS (each door a block DOOR-n: its leaf and its swing arc;
 * a slider a block SLIDER-n, a passage a block PASSAGE-n: its two jambs), WINDOWS (a block WIN-n: three glass lines and the
 * jambs), COLUMNS (closed polylines), TEXT
 * (room names, printed sizes under them; a name's raised floor as the text's elevation), PLOTLINE_ZONES (the flush lines
 * between zones: parking bays, lawn edges), PLOTLINE_KERBS (walls of 20 cm or less, outlined like walls),
 * PLOTLINE_AXES_<thickness in tenths of a mm> (each wall's centre line, its height as the line's thickness: read to the
 * letter while it still agrees with the outlines — a curved ramp's chords, a short wall at a T, a door at a corner). Every wall
 * outline carries its height as its thickness (group 39, the extrusion CAD keeps), so a file saved by a CAD program reads
 * back to the same walls, heights, zone lines, openings and named rooms (dxfWrite.test.ts, the 20 built-in drawings).
 *
 * What lines cannot hold (which T-joint split which wall, a ramp's slope, a wall kept standing alone) rides along too:
 * the drawing itself as DXF comments (group 999, which every CAD program skips and drops when it saves),
 * sealed with a fingerprint of the drawn entities. A file that comes back untouched opens exactly as it was exported;
 * one changed in CAD has lost the comments or broken the seal, and is read from its lines like any DXF (ownDrawingOf).
 */
import type { Pt, Unit } from '../core'
import { sheetOf } from './sheet'

/**
 * FNV-1a over what is drawn (line endings evened out): any change to it changes the seal. Version 2 (session 31, formats2)
 * seals the whole file after the comments, the blocks too (a door's jambs and swing); version 1, the first exports, sealed
 * the ENTITIES section only — they still open exactly.
 */
const seal = (dxf: string, version = 2): string => {
  const at = version === 1 ? dxf.indexOf('ENTITIES') : dxf.indexOf('PLOTLINE-END')
  const body = (at < 0 ? '' : version === 1 ? dxf.slice(at, dxf.indexOf('ENDSEC', at)) : dxf.slice(at)).replace(/\r\n/g, '\n')
  let h = 0x811c9dc5
  for (let i = 0; i < body.length; i++) h = Math.imul(h ^ body.charCodeAt(i), 0x01000193) >>> 0
  return h.toString(16)
}
const CHUNK = 240
const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** The drawing Plotline wrote into this DXF, when the file is untouched since (the seal holds); else null. */
export function ownDrawingOf(dxf: string): Unit | null {
  if (!dxf.startsWith('999')) return null
  const m = /^999\r?\nPLOTLINE-DRAWING ([12]) ([0-9a-f]+)\r?\n([\s\S]*?)999\r?\nPLOTLINE-END/.exec(dxf)
  if (!m || m[2] !== seal(dxf, Number(m[1]))) return null
  try {
    const bin = atob(m[3].split(/\r?\n/).filter((_, i) => i % 2 === 1).join(''))
    const unit = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Unit
    return unit && Array.isArray(unit.walls) && Array.isArray(unit.vertices) ? unit : null
  } catch {
    return null
  }
}

/** a wall this low is a kerb (core: ≤ 0.2 m), drawn on its own layer */
const KERB_M = 0.2
const LAYERS: [string, number][] = [
  ['WALLS', 7],
  ['DOORS', 3],
  ['WINDOWS', 4],
  ['COLUMNS', 8],
  ['TEXT', 7],
  ['PLOTLINE_ZONES', 8],
  ['PLOTLINE_KERBS', 8],
]
const NAME_H = 0.2
const NOTE_H = 0.14

export function writeDxf(unit: Unit): string {
  const sheet = sheetOf(unit)
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  const axes = unit.walls.filter((w) => w.heightM > 0 && V.has(w.a) && V.has(w.b)).map((w) => ({ w, layer: `PLOTLINE_AXES_${Math.round(w.thicknessM * 1e4)}` }))
  const layers: [string, number][] = [...LAYERS, ...[...new Set(axes.map((x) => x.layer))].sort().map((l): [string, number] => [l, 8])]
  const out: (string | number)[] = []
  const g = (code: number, value: string | number) => out.push(code, typeof value === 'number' ? +value.toFixed(6) : value)
  const X = (p: Pt) => p.x
  const Y = (p: Pt) => -p.y // plan y down → CAD y up
  const line = (layer: string, a: Pt, b: Pt) => (g(0, 'LINE'), g(8, layer), g(10, X(a)), g(20, Y(a)), g(30, 0), g(11, X(b)), g(21, Y(b)), g(31, 0))
  // (a wall's height rides as the outline's thickness, group 39: the extrusion every CAD program keeps and shows in 3D)
  const poly = (layer: string, pts: Pt[], heightM?: number, closed = true) => {
    g(0, 'POLYLINE'), g(8, layer), g(66, 1), g(10, 0), g(20, 0), g(30, 0)
    if (heightM !== undefined) g(39, heightM)
    g(70, closed ? 1 : 0)
    for (const p of pts) g(0, 'VERTEX'), g(8, layer), g(10, X(p)), g(20, Y(p)), g(30, 0)
    g(0, 'SEQEND'), g(8, layer)
  }
  // (a name's floor level, when it is not the storey's, is the text's elevation)
  const open = (layer: string, pts: Pt[], heightM: number) => poly(layer, pts, heightM, false)
  const text = (at: Pt, s: string, h: number, z = 0) => (g(0, 'TEXT'), g(8, 'TEXT'), g(10, X(at)), g(20, Y(at)), g(30, z), g(40, h), g(1, s.replace(/[\r\n]+/g, ' ')), g(72, 1), g(73, 2), g(11, X(at)), g(21, Y(at)), g(31, z))

  // header: version, units, extent
  const b = sheet.box
  g(0, 'SECTION'), g(2, 'HEADER')
  g(9, '$ACADVER'), g(1, 'AC1009')
  g(9, '$INSUNITS'), g(70, 6)
  g(9, '$EXTMIN'), g(10, b.x0), g(20, -b.y1), g(30, 0)
  g(9, '$EXTMAX'), g(10, b.x1), g(20, -b.y0), g(30, 0)
  g(0, 'ENDSEC')
  // tables: the line type and the layers
  g(0, 'SECTION'), g(2, 'TABLES')
  g(0, 'TABLE'), g(2, 'LTYPE'), g(70, 1)
  g(0, 'LTYPE'), g(2, 'CONTINUOUS'), g(70, 0), g(3, 'Solid line'), g(72, 65), g(73, 0), g(40, 0)
  g(0, 'ENDTAB')
  g(0, 'TABLE'), g(2, 'LAYER'), g(70, layers.length)
  for (const [name, colour] of layers) g(0, 'LAYER'), g(2, name), g(70, 0), g(62, colour), g(6, 'CONTINUOUS')
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')
  // blocks: one per opening, drawn where it stands (base point 0,0, inserted at 0,0)
  g(0, 'SECTION'), g(2, 'BLOCKS')
  const inserts: [string, string][] = []
  let n = 0
  for (const o of sheet.openings) {
    const name = `${o.kind === 'door' ? 'DOOR' : o.kind === 'slider' ? 'SLIDER' : o.kind === 'passage' ? 'PASSAGE' : 'WIN'}-${++n}`
    const layer = o.kind === 'window' ? 'WINDOWS' : 'DOORS'
    g(0, 'BLOCK'), g(8, layer), g(2, name), g(70, 0), g(10, 0), g(20, 0), g(30, 0), g(3, name)
    for (const [a, c] of o.lines) line(layer, a, c)
    // (the jambs as two-point polylines: their thickness, group 39, is the wall's height — a wall all of glass keeps it)
    for (const j of o.jambs) open(layer, j, o.heightM)
    if (o.arc) {
      // CAD arcs run counter-clockwise (y up): the plan's angles flip, the short way between them
      let s = -o.arc.a0, e = -o.arc.a1
      let sweep = (((e - s) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      if (sweep > Math.PI) ([s, e] = [e, s]), (sweep = 2 * Math.PI - sweep)
      g(0, 'ARC'), g(8, layer), g(10, X(o.arc.c)), g(20, Y(o.arc.c)), g(30, 0), g(40, o.arc.r), g(50, (s * 180) / Math.PI), g(51, (e * 180) / Math.PI)
    }
    g(0, 'ENDBLK'), g(8, layer)
    inserts.push([name, layer])
  }
  g(0, 'ENDSEC')
  // the drawing
  g(0, 'SECTION'), g(2, 'ENTITIES')
  sheet.walls.forEach((w, i) => poly(sheet.wallHeights[i] <= KERB_M ? 'PLOTLINE_KERBS' : 'WALLS', w, sheet.wallHeights[i]))
  for (const c of sheet.columns) poly('COLUMNS', c)
  for (const [a, c] of sheet.zones) line('PLOTLINE_ZONES', a, c)
  // (each wall's centre line: a two-point polyline, its height as its thickness, group 39)
  for (const { w, layer } of axes) open(layer, [V.get(w.a)!, V.get(w.b)!], w.heightM)
  for (const [name, layer] of inserts) g(0, 'INSERT'), g(8, layer), g(2, name), g(10, 0), g(20, 0), g(30, 0)
  for (const t of sheet.texts) text(t.at, t.text, t.size === 'name' ? NAME_H : NOTE_H, t.levelM)
  g(0, 'ENDSEC')
  g(0, 'EOF')
  const dxf = out.join('\r\n') + '\r\n'
  // the drawing itself, as comments before the first section (see the top)
  const data = b64(JSON.stringify(unit))
  const lines = ['999', `PLOTLINE-DRAWING 2 ${seal(`PLOTLINE-END\r\n${dxf}`)}`]
  for (let i = 0; i < data.length; i += CHUNK) lines.push('999', data.slice(i, i + CHUNK))
  lines.push('999', 'PLOTLINE-END')
  return lines.join('\r\n') + '\r\n' + dxf
}
