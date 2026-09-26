/** mirrorUnit: the reflected unit derives the same rooms, puts every opening at its reflection, and round-trips. */
import { describe, expect, test } from 'vitest'
import * as core from './index'
import type { Opening, Pt, Room, Unit, Wall } from './index'

const files = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })

/** Two rooms and a 45° chamfer carrying a door: the angled case the traced units don't have. */
const chamfer: Unit = {
  id: 'chamfer',
  projectName: 'p',
  name: 'n',
  northDeg: 30,
  floor: 3,
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 4, y: 0 },
    { id: 'c', x: 7, y: 0 },
    { id: 'd', x: 7, y: 2 },
    { id: 'e', x: 5, y: 4 },
    { id: 'f', x: 4, y: 4 },
    { id: 'g', x: 0, y: 4 },
  ],
  walls: [
    ['ab', 'a', 'b', []],
    ['bc', 'b', 'c', [{ id: 'win', kind: 'window', offsetM: 0.5, widthM: 1.2, heightM: 1.4, sillM: 0.9 }]],
    ['cd', 'c', 'd', []],
    ['de', 'd', 'e', [{ id: 'door_ch', kind: 'door', offsetM: 0.6, widthM: 0.9, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'out' }]],
    ['ef', 'e', 'f', []],
    ['fg', 'f', 'g', []],
    ['ga', 'g', 'a', []],
    ['bf', 'b', 'f', [{ id: 'door_mid', kind: 'door', offsetM: 1.2, widthM: 0.8, heightM: 2.1, sillM: 0, hinge: 'b', swing: 'in' }]],
  ].map(([id, a, b, openings]) => ({ id, a, b, thicknessM: 0.125, heightM: 3, openings }) as Wall),
  roomLabels: [
    { id: 'west', name: 'Bed', kind: 'bed', x: 2, y: 2, printedSize: `12'-0" × 13'-0"` },
    { id: 'east', name: 'Living', kind: 'living', x: 5.5, y: 1.5 },
  ],
  furniture: [],
  finishSlots: [
    { id: 's', label: 'Floors', target: 'floor', roomIds: ['west', 'east'], options: [], defaultOptionId: 'o' },
    { id: 't', label: 'Walls', target: 'wall', roomIds: 'all', options: [], defaultOptionId: 'o' },
  ],
  areaSqft: 300,
}

const AX = 1.3 // any vertical line
const m = (id: string) => `${id}-m`
const refl = (p: Pt): Pt => ({ x: 2 * AX - p.x, y: p.y })
const near = (p: Pt, q: Pt, tol = 1e-9) => Math.hypot(p.x - q.x, p.y - q.y) < tol
/** plan point `along` m from vertex a and `side` m along the wall's +normal */
function at(u: Unit, w: Wall, along: number, side: number): Pt {
  const f = core.wallFrame(w, u.vertices)
  return { x: f.origin.x + f.dir.x * along + f.normal.x * side, y: f.origin.y + f.dir.y * along + f.normal.y * side }
}
const hingeU = (o: Opening) => (o.hinge === 'b' ? o.offsetM + o.widthM : o.offsetM)
const sw = (o: Opening) => (o.swing === 'in' ? -1 : 1)

describe.each([...Object.entries(files), ['chamfer', chamfer] as const])('mirrorUnit(%s)', (_, unit) => {
  const mu = core.mirrorUnit(unit, AX)
  const rooms = core.deriveRooms(unit)
  const mrooms = core.deriveRooms(mu)

  test('same rooms: ids + -m, names, kinds, printed sizes, areas; centroids reflected', () => {
    expect(mrooms).toHaveLength(rooms.length)
    for (const r of rooms) {
      const q = mrooms.find((x) => near(x.centroid, refl(r.centroid), 1e-6))
      expect(q, r.name).toBeDefined()
      expect(Math.abs(q!.areaSqm - r.areaSqm), r.name).toBeLessThan(1e-6)
      expect(new Set(q!.loop), r.name).toEqual(new Set(r.loop.map(m)))
      if (r.id.startsWith('space-')) expect(q!.id).toMatch(/^space-/)
      else expect([q!.id, q!.name, q!.kind, q!.printedSize]).toEqual([m(r.id), r.name, r.kind, r.printedSize])
    }
  })

  test('every opening at its reflection; doors keep hinge jamb, leaf and the room they swing into', () => {
    const into = (u: Unit, rs: Room[], w: Wall, o: Opening) =>
      core.roomAt(at(u, w, o.offsetM + o.widthM / 2, sw(o) * (w.thicknessM / 2 + 0.05)), rs, u)?.name
    unit.walls.forEach((w, i) => {
      const mw = mu.walls[i]
      expect(mw.id).toBe(m(w.id))
      w.openings.forEach((o, j) => {
        const mo = mw.openings[j]
        expect([mo.id, mo.kind, mo.widthM, mo.heightM, mo.sillM]).toEqual([m(o.id), o.kind, o.widthM, o.heightM, o.sillM])
        expect(near(at(mu, mw, mo.offsetM + mo.widthM / 2, 0), refl(at(unit, w, o.offsetM + o.widthM / 2, 0))), o.id).toBe(true)
        if (!o.hinge) return
        expect(near(at(mu, mw, hingeU(mo), 0), refl(at(unit, w, hingeU(o), 0))), `${o.id} hinge`).toBe(true)
        // the leaf opened 90° toward its swing side
        expect(near(at(mu, mw, hingeU(mo), sw(mo) * mo.widthM), refl(at(unit, w, hingeU(o), sw(o) * o.widthM))), `${o.id} leaf`).toBe(true)
        expect(into(mu, mrooms, mw, mo), o.id).toBe(into(unit, rooms, w, o))
      })
    })
  })

  test('validate() reports the same issues', () => {
    const codes = (u: Unit) => core.validate(u).map((i) => `${i.level} ${i.code}`).sort()
    expect(codes(mu)).toEqual(codes(unit))
  })

  test('ids suffixed and unique; slots follow; north, floor, name, image unchanged; no furniture', () => {
    const ids = [mu.id, ...mu.vertices.map((v) => v.id), ...mu.walls.flatMap((w) => [w.id, ...w.openings.map((o) => o.id)]), ...mu.roomLabels.map((l) => l.id)]
    expect(ids.filter((id) => !id.endsWith('-m'))).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)
    expect(mu.finishSlots.map((s) => s.roomIds)).toEqual(unit.finishSlots.map((s) => (s.roomIds === 'all' ? 'all' : s.roomIds.map(m))))
    expect([mu.northDeg, mu.floor, mu.name, mu.planImage]).toEqual([unit.northDeg, unit.floor, unit.name, unit.planImage])
    expect(mu.furniture).toEqual([])
  })

  test('round trip: mirrorUnit twice = the unit, up to ids and float noise', () => {
    const norm = (u: Unit) =>
      JSON.parse(JSON.stringify(u, (_, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : typeof v === 'string' ? v.replace(/-m-m$/, '') : v)))
    expect(norm(core.mirrorUnit(mu, AX))).toEqual(norm({ ...unit, furniture: [] }))
  })
})
