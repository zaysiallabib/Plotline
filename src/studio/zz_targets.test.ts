// TEMPORARY (not committed): where the Firefox proof aims — outer-face windows, the entrance door, balconies' walls.
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { deriveRooms, roomAt, wallFrame, type Unit } from '../core'
import typeA from '../data/units/type-a.json'
import founder from '../data/fixtures/founder-sheltech-a-draft.json'
import { entryZone, outerFace } from './furniture'

function targets(unit: Unit) {
  const rooms = deriveRooms(unit)
  const out: Record<string, unknown[]> = { windows: [], doors: [], balconyWalls: [], parapets: [] }
  for (const w of unit.walls) {
    if (w.heightM <= 0) continue
    const f = wallFrame(w, unit.vertices)
    for (const s of [1, -1]) {
      const n = { x: f.normal.x * s, y: f.normal.y * s }
      const at = (u: number) => ({ x: f.origin.x + f.dir.x * u + (n.x * w.thicknessM) / 2, y: f.origin.y + f.dir.y * u + (n.y * w.thicknessM) / 2 })
      const front = (p: { x: number; y: number }) => roomAt({ x: p.x + n.x * 0.15, y: p.y + n.y * 0.15 }, rooms, unit)
      for (const o of w.openings) {
        const p = at(o.offsetM + o.widthM / 2)
        const of = outerFace(unit, rooms, { p, n })
        const r = front(p)
        const rec = { wall: w.id, opening: o.id, kind: o.kind, p, n, sill: o.sillM, head: o.sillM + o.heightM, width: o.widthM, outer: !!of, room: of ? rooms.find((x) => x.id === of.roomId)?.name : r?.name, roomKind: r?.kind }
        if (o.kind === 'window' && of) out.windows.push(rec)
        if (o.kind !== 'window') out.doors.push(rec)
      }
      const r = front(at(f.lengthM / 2))
      if (r?.kind === 'balcony') {
        const rec = { wall: w.id, p: at(f.lengthM / 2), n, len: f.lengthM, h: w.heightM, openings: w.openings.length, room: r.name }
        if (w.heightM < 1.2) out.parapets.push(rec)
        else out.balconyWalls.push(rec)
      }
    }
  }
  return { ...out, entry: entryZone(unit), bounds: { minX: Math.min(...unit.vertices.map((v) => v.x)), maxX: Math.max(...unit.vertices.map((v) => v.x)), minY: Math.min(...unit.vertices.map((v) => v.y)), maxY: Math.max(...unit.vertices.map((v) => v.y)) } }
}

it('targets', () => {
  const draft = founder as unknown as { unit?: Unit } & Unit
  writeFileSync('E:/dev/tmp/s31/pieces/targets.json', JSON.stringify({ typeA: targets(typeA as unknown as Unit), founder: targets(draft.unit ?? draft) }, null, 1))
})
