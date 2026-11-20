/**
 * The drawing as a DXF (session 31) — what a developer's architect asks back for: AutoCAD R12 text (the version every CAD
 * program reads), in metres ($INSUNITS 6), y up as CAD draws. Layers: WALLS (each solid wall piece a closed polyline, its
 * ends reaching into the wall it meets so the corners close), DOORS (each door a block DOOR-n: its leaf and its swing arc;
 * a slider a block SLIDER-n), WINDOWS (a block WIN-n: three glass lines and the jambs), COLUMNS (closed polylines), TEXT
 * (room names, printed sizes under them), ZONES (the flush lines between zones: parking bays, lawn edges).
 *
 * Plain CAD lines cannot hold all of a Plotline drawing (a parapet's height, a zone line, which T-joint split which wall),
 * so the drawing itself rides along as DXF comments (group 999, which every CAD program skips and drops when it saves),
 * sealed with a fingerprint of the drawn entities. A file that comes back untouched opens exactly as it was exported;
 * one changed in CAD has lost the comments or broken the seal, and is read from its lines like any DXF (ownDrawingOf).
 */
import type { Pt, Unit } from '../core'
import { sheetOf } from './sheet'

/** FNV-1a over the ENTITIES section (line endings evened out): any change to what is drawn changes it */
const seal = (dxf: string): string => {
  const at = dxf.indexOf('ENTITIES')
  const body = (at < 0 ? '' : dxf.slice(at, dxf.indexOf('ENDSEC', at))).replace(/\r\n/g, '\n')
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
  const m = /^999\r?\nPLOTLINE-DRAWING 1 ([0-9a-f]+)\r?\n([\s\S]*?)999\r?\nPLOTLINE-END/.exec(dxf)
  if (!m || m[1] !== seal(dxf)) return null
  try {
    const bin = atob(m[2].split(/\r?\n/).filter((_, i) => i % 2 === 1).join(''))
    const unit = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Unit
    return unit && Array.isArray(unit.walls) && Array.isArray(unit.vertices) ? unit : null
  } catch {
    return null
  }
}

const LAYERS: [string, number][] = [
  ['WALLS', 7],
  ['DOORS', 3],
  ['WINDOWS', 4],
  ['COLUMNS', 8],
  ['TEXT', 7],
  ['ZONES', 8],
]
const NAME_H = 0.2
const NOTE_H = 0.14

export function writeDxf(unit: Unit): string {
  const sheet = sheetOf(unit)
  const out: (string | number)[] = []
  const g = (code: number, value: string | number) => out.push(code, typeof value === 'number' ? +value.toFixed(6) : value)
  const X = (p: Pt) => p.x
  const Y = (p: Pt) => -p.y // plan y down → CAD y up
  const line = (layer: string, a: Pt, b: Pt) => (g(0, 'LINE'), g(8, layer), g(10, X(a)), g(20, Y(a)), g(30, 0), g(11, X(b)), g(21, Y(b)), g(31, 0))
  const poly = (layer: string, pts: Pt[]) => {
    g(0, 'POLYLINE'), g(8, layer), g(66, 1), g(10, 0), g(20, 0), g(30, 0), g(70, 1)
    for (const p of pts) g(0, 'VERTEX'), g(8, layer), g(10, X(p)), g(20, Y(p)), g(30, 0)
    g(0, 'SEQEND'), g(8, layer)
  }
  const text = (at: Pt, s: string, h: number) => (g(0, 'TEXT'), g(8, 'TEXT'), g(10, X(at)), g(20, Y(at)), g(30, 0), g(40, h), g(1, s.replace(/[\r\n]+/g, ' ')), g(72, 1), g(73, 2), g(11, X(at)), g(21, Y(at)), g(31, 0))

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
  g(0, 'TABLE'), g(2, 'LAYER'), g(70, LAYERS.length)
  for (const [name, colour] of LAYERS) g(0, 'LAYER'), g(2, name), g(70, 0), g(62, colour), g(6, 'CONTINUOUS')
  g(0, 'ENDTAB')
  g(0, 'ENDSEC')
  // blocks: one per opening, drawn where it stands (base point 0,0, inserted at 0,0)
  g(0, 'SECTION'), g(2, 'BLOCKS')
  const inserts: [string, string][] = []
  let n = 0
  for (const o of sheet.openings) {
    const name = `${o.kind === 'door' ? 'DOOR' : o.kind === 'slider' ? 'SLIDER' : 'WIN'}-${++n}`
    const layer = o.kind === 'window' ? 'WINDOWS' : 'DOORS'
    g(0, 'BLOCK'), g(8, layer), g(2, name), g(70, 0), g(10, 0), g(20, 0), g(30, 0), g(3, name)
    for (const [a, c] of o.lines) line(layer, a, c)
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
  for (const w of sheet.walls) poly('WALLS', w)
  for (const c of sheet.columns) poly('COLUMNS', c)
  for (const [a, c] of sheet.zones) line('ZONES', a, c)
  for (const [name, layer] of inserts) g(0, 'INSERT'), g(8, layer), g(2, name), g(10, 0), g(20, 0), g(30, 0)
  for (const t of sheet.texts) text(t.at, t.text, t.size === 'name' ? NAME_H : NOTE_H)
  g(0, 'ENDSEC')
  g(0, 'EOF')
  const dxf = out.join('\r\n') + '\r\n'
  // the drawing itself, as comments before the first section (see the top)
  const data = b64(JSON.stringify(unit))
  const lines = ['999', `PLOTLINE-DRAWING 1 ${seal(dxf)}`]
  for (let i = 0; i < data.length; i += CHUNK) lines.push('999', data.slice(i, i + CHUNK))
  lines.push('999', 'PLOTLINE-END')
  return lines.join('\r\n') + '\r\n' + dxf
}
