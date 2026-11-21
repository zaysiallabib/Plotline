/**
 * DXF export: Plotline's own DXF reader reads the export back to the same drawing — untouched, exactly (the comment copy);
 * and from its lines alone, as a CAD program saves it (the comments dropped): the same walls (length per thickness and
 * height), zone lines, openings (per kind), closed rooms with the same names, raised floors — for every built-in flat and
 * level, all 20 (formats3: each wall's centre line rides along on PLOTLINE_AXES_<thickness>, read while it agrees with the
 * outlines; a wall moved in a CAD program is read from its outlines). And the file is a plain R12 DXF.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deriveRooms, wallFrame } from '../core'
import type { Unit } from '../core'
import { normalizeUnit } from '../studio/model'
import { importDxf } from './dxf'
import { writeDxf } from './dxfWrite'

const DIR = `${__dirname}/../data/units`
const units = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), normalizeUnit(JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Unit)] as const)

/** what a person sees of a drawing: wall length per thickness and height, zone lines, openings per kind, named rooms, raised floors */
function looks(u: Unit) {
  const len: Record<string, number> = {}
  for (const w of u.walls) {
    const k = w.heightM <= 0 ? 'zone lines' : `${Math.round(w.thicknessM * 100)} cm walls ${Math.round(w.heightM * 100)} cm high`
    len[k] = (len[k] ?? 0) + wallFrame(w, u.vertices).lengthM
  }
  const openings: Record<string, number> = {}
  for (const o of u.walls.flatMap((w) => w.openings)) openings[o.kind] = (openings[o.kind] ?? 0) + 1
  const rooms = deriveRooms(u)
  return { len, openings, rooms: rooms.length, names: rooms.filter((r) => u.roomLabels.some((l) => l.id === r.id)).map((r) => r.name).sort(), raised: u.roomLabels.filter((l) => l.levelM).map((l) => `${l.name} ${l.levelM!.toFixed(2)}`).sort() }
}
/** the differences, in words: none when the two look the same (wall lengths within 1 % + 5 cm) */
function differences(a: Unit, b: Unit): string[] {
  const A = looks(a), B = looks(b)
  const out: string[] = []
  for (const k of new Set([...Object.keys(A.len), ...Object.keys(B.len)])) {
    const x = A.len[k] ?? 0, y = B.len[k] ?? 0
    if (Math.abs(x - y) > 0.01 * Math.max(x, y) + 0.05) out.push(`${k}: ${x.toFixed(2)} → ${y.toFixed(2)} m`)
  }
  for (const k of new Set([...Object.keys(A.openings), ...Object.keys(B.openings)])) if ((A.openings[k] ?? 0) !== (B.openings[k] ?? 0)) out.push(`${k}: ${A.openings[k] ?? 0} → ${B.openings[k] ?? 0}`)
  if (A.rooms !== B.rooms) out.push(`closed rooms: ${A.rooms} → ${B.rooms}`)
  if (A.names.join('|') !== B.names.join('|')) out.push(`named rooms lost: ${A.names.filter((n) => !B.names.includes(n)).join(', ')}; gained: ${B.names.filter((n) => !A.names.includes(n)).join(', ')}`)
  if (A.raised.join('|') !== B.raised.join('|')) out.push(`raised floors: ${A.raised.join(', ')} → ${B.raised.join(', ')}`)
  return out
}
/** the file as a CAD program saves it: the comment copy dropped */
const linesOnly = (dxf: string) => dxf.slice(dxf.indexOf('PLOTLINE-END') + 'PLOTLINE-END'.length).trimStart()

describe('DXF export', () => {
  it('writes a plain R12 file in metres with its layers, zone lines and kerbs on their own', () => {
    const text = writeDxf(units.find(([n]) => n === 'type-a')![1])
    expect(text).toMatch(/\$ACADVER\r\n1\r\nAC1009/)
    expect(text).toMatch(/\$INSUNITS\r\n70\r\n6/)
    for (const l of ['WALLS', 'DOORS', 'WINDOWS', 'COLUMNS', 'TEXT', 'PLOTLINE_ZONES', 'PLOTLINE_KERBS', 'PLOTLINE_AXES_1270', 'PLOTLINE_AXES_2540']) expect(text).toContain(`LAYER\r\n2\r\n${l}`)
    expect(text).toMatch(/POLYLINE\r\n8\r\nWALLS\r\n66\r\n1\r\n10\r\n0\r\n20\r\n0\r\n30\r\n0\r\n39\r\n3\r\n/) // a wall's height as its thickness
    expect(text.trimEnd().endsWith('EOF')).toBe(true)
    const level = writeDxf(units.find(([n]) => n === 'sheltech-ground')![1])
    expect(level).toContain('LINE\r\n8\r\nPLOTLINE_ZONES')
    expect(level).toContain('POLYLINE\r\n8\r\nPLOTLINE_KERBS')
  })

  for (const [name, u] of units)
    it(`${name}: untouched, it opens exactly as it was; saved by a CAD program (its lines alone), it reads back the same`, async () => {
      const text = writeDxf(u)
      const r = await importDxf(text, `${name}.dxf`)
      expect(r.notes[0]).toMatch(/not changed since/)
      expect(r.storeys[0].unit).toEqual(u)
      const lines = await importDxf(linesOnly(text), `${name}.dxf`)
      expect(lines.notes[0]).not.toMatch(/not changed since/)
      const diff = differences(u, lines.storeys[0].unit)
      expect(diff).toEqual([])
    })

  it('a door block changed in CAD breaks the seal too; a first-version export (its seal over the entities only) still opens exactly', async () => {
    const u = units.find(([n]) => n === 'type-a')![1]
    const text = writeDxf(u)
    const block = text.indexOf('BLOCK\r\n8\r\nDOORS')
    const moved = text.slice(0, block) + text.slice(block).replace(/\r\n10\r\n([-\d.]+)/, (_, x: string) => `\r\n10\r\n${Number(x) + 0.2}`)
    expect((await importDxf(moved, 'a.dxf')).notes[0]).not.toMatch(/not changed since/)
    // version 1: FNV-1a over the ENTITIES section
    const at = text.indexOf('ENTITIES')
    const body = text.slice(at, text.indexOf('ENDSEC', at)).replace(/\r\n/g, '\n')
    let h = 0x811c9dc5
    for (let i = 0; i < body.length; i++) h = Math.imul(h ^ body.charCodeAt(i), 0x01000193) >>> 0
    const v1 = text.replace(/PLOTLINE-DRAWING 2 [0-9a-f]+/, `PLOTLINE-DRAWING 1 ${h.toString(16)}`)
    expect((await importDxf(v1, 'a.dxf')).storeys[0].unit).toEqual(u)
  })

  it('an edited file (one wall moved in CAD, the comments kept) breaks the seal: read from its lines', async () => {
    const text = writeDxf(units.find(([n]) => n === 'type-a')![1])
    const edited = text.replace(/(POLYLINE[\s\S]*?VERTEX[\s\S]*?\r\n10\r\n)([-\d.]+)/, (_, a: string, x: string) => `${a}${Number(x) + 0.5}`)
    expect(edited).not.toBe(text)
    expect((await importDxf(edited, 'a.dxf')).notes[0]).not.toMatch(/not changed since/)
    // a wall moved 30 cm in CAD (its outline's corners): the centre lines no longer agree — every wall is read from its outline
    const wall = text.indexOf('POLYLINE\r\n8\r\nWALLS'), end = text.indexOf('SEQEND', wall)
    const moved = text.slice(0, wall) + text.slice(wall, end).replace(/(VERTEX\r\n8\r\nWALLS\r\n10\r\n[-\d.]+\r\n20\r\n)([-\d.]+)/g, (_, v: string, y: string) => `${v}${Number(y) + 0.3}`) + text.slice(end)
    expect(moved).not.toBe(text)
    expect((await importDxf(linesOnly(moved), 'a.dxf')).notes).toContain('Walls were changed in a CAD program since the export: read from their outlines.')
    expect((await importDxf(linesOnly(text), 'a.dxf')).notes.some((n) => /walls read from their centre lines/.test(n))).toBe(true)
  })
})
