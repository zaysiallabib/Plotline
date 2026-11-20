/**
 * DXF export: Plotline's own DXF reader reads the export back to the same drawing — the built-in flats and levels, wall
 * for wall, opening for opening (kind and width), the same closed rooms and names. And the file is a plain R12 DXF.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { deriveRooms } from '../core'
import type { Unit } from '../core'
import { normalizeUnit } from '../studio/model'
import { importDxf } from './dxf'
import { writeDxf } from './dxfWrite'


const DIR = `${__dirname}/../data/units`
const units = readdirSync(DIR).filter((f) => f.endsWith('.json')).map((f) => [f.replace('.json', ''), normalizeUnit(JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')) as Unit)] as const)

const count = (u: Unit) => {
  const ops = u.walls.flatMap((w) => w.openings)
  const kinds = (k: string) => ops.filter((o) => o.kind === k).length
  return { walls: u.walls.filter((w) => w.heightM > 0).length, doors: kinds('door'), windows: kinds('window'), sliders: kinds('slider'), rooms: deriveRooms(u).filter((r) => r.areaSqm >= 1).length }
}

describe('DXF export', () => {
  it('writes a plain R12 file in metres with the five layers', () => {
    const text = writeDxf(units.find(([n]) => n === 'type-a')![1])
    expect(text).toMatch(/\$ACADVER\r\n1\r\nAC1009/)
    expect(text).toMatch(/\$INSUNITS\r\n70\r\n6/)
    for (const l of ['WALLS', 'DOORS', 'WINDOWS', 'COLUMNS', 'TEXT', 'ZONES']) expect(text).toContain(`LAYER\r\n2\r\n${l}`)
    expect(text.trimEnd().endsWith('EOF')).toBe(true)
  })

  for (const [name, u] of units)
    it(`${name}: an untouched export opens exactly as it was; its lines alone read back close`, async () => {
      const text = writeDxf(u)
      const r = await importDxf(text, `${name}.dxf`)
      expect(r.notes[0]).toMatch(/not changed since/)
      expect(r.storeys[0].unit).toEqual(u)
      // a CAD program drops the comments when it saves: then the lines alone — the walls a plan reader finds
      const lines = await importDxf(text.slice(text.indexOf('PLOTLINE-END') + 'PLOTLINE-END'.length).trimStart(), `${name}.dxf`)
      expect(lines.notes[0]).not.toMatch(/not changed since/)
      const a = count(u), b = count(lines.storeys[0].unit)
      rows.push(`| ${name} | ${a.walls} → ${b.walls} | ${a.doors + a.windows + a.sliders} → ${b.doors + b.windows + b.sliders} | ${a.rooms} → ${b.rooms} |`)
      expect(b.walls).toBeGreaterThan(0.4 * a.walls)
    })

  it('an edited file (one wall moved in CAD, the comments kept) breaks the seal: read from its lines', async () => {
    const text = writeDxf(units.find(([n]) => n === 'type-a')![1])
    const edited = text.replace(/(POLYLINE[\s\S]*?VERTEX[\s\S]*?\r\n10\r\n)([-\d.]+)/, (_, a: string, x: string) => `${a}${Number(x) + 0.5}`)
    expect(edited).not.toBe(text)
    expect((await importDxf(edited, 'a.dxf')).notes[0]).not.toMatch(/not changed since/)
  })

  it('table', () => console.log(['| drawing | walls | openings | closed rooms (from its lines alone) |', '|---|---|---|---|', ...rows].join('\n')))
})
const rows: string[] = []
