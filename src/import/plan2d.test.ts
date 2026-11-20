/**
 * The last pass over an imported floor (session 31, formats2): a corner left touching another wall mid-way becomes a T,
 * twins after it are one wall, zone lines end on the wall they meet, and the Studio's own load path leaves the result as
 * it is (no crossing comes back when the floor is opened again).
 */
import { describe, expect, it } from 'vitest'
import { validate } from '../core'
import type { Unit, Wall } from '../core'
import { emptyUnit, initialState, reducer } from '../studio/model'
import { nodeGraph, settleImport, zonesOntoWalls } from './plan2d'

/** walls as [x0, y0, x1, y1, thickness, height]; corners within a millimetre are one */
function unitOf(walls: [number, number, number, number, number, number][], openings: Record<number, Wall['openings']> = {}): Unit {
  const u = emptyUnit()
  const at = (x: number, y: number) => {
    let v = u.vertices.find((q) => Math.hypot(q.x - x, q.y - y) < 0.001)
    if (!v) u.vertices.push((v = { id: `v${u.vertices.length}`, x, y }))
    return v.id
  }
  u.walls = walls.map(([x0, y0, x1, y1, t, h], i) => ({ id: `w${i}`, a: at(x0, y0), b: at(x1, y1), thicknessM: t, heightM: h, openings: openings[i] ?? [] }))
  return u
}
const crossings = (u: Unit) => validate(u).filter((i) => i.code === 'walls-intersect').length

describe('nodeGraph', () => {
  it('a wall end touching another wall mid-way splits it there; its window stays where it was', () => {
    const u = unitOf(
      [
        [0, 0, 4, 0, 0.2, 3],
        [2, 0, 2, 3, 0.1, 3],
      ],
      { 0: [{ id: 'win', kind: 'window', offsetM: 2.5, widthM: 0.9, heightM: 1.2, sillM: 0.9 }] },
    )
    expect(crossings(u)).toBe(1)
    const r = nodeGraph(u)
    expect(crossings(r.unit)).toBe(0)
    expect(r.joined).toBe(1)
    expect(r.unit.walls).toHaveLength(3)
    const win = r.unit.walls.find((w) => w.openings.length)!
    expect(r.unit.vertices.find((v) => v.id === win.a)).toMatchObject({ x: 2, y: 0 })
    expect(win.openings[0].offsetM).toBeCloseTo(0.5, 6)
  })

  it('a short piece laid along a wall, its end on that wall: one wall there, the taller and thicker', () => {
    // a parapet inside a thick wall's body reaches the cross wall: the join left a piece along the cross wall
    const u = unitOf([
      [0, 0, 0, 1, 0.267, 3.26],
      [0, 0, 0, 0.084, 0.267, 2.87],
      [-4, 0.084, 0, 0.084, 0.15, 2.87],
    ])
    expect(crossings(u)).toBeGreaterThan(0)
    const r = nodeGraph(u)
    expect(crossings(r.unit)).toBe(0)
    const V = new Map(r.unit.vertices.map((v) => [v.id, v]))
    const short = r.unit.walls.filter((w) => Math.abs(V.get(w.a)!.y - V.get(w.b)!.y) < 0.1 && V.get(w.a)!.x === 0 && V.get(w.b)!.x === 0)
    expect(short).toHaveLength(1)
    expect(short[0]).toMatchObject({ heightM: 3.26, thicknessM: 0.267 })
  })

  it('a clean plan is left as it was', () => {
    const u = unitOf([
      [0, 0, 4, 0, 0.2, 3],
      [4, 0, 4, 3, 0.2, 3],
      [4, 3, 0, 3, 0.2, 3],
      [0, 3, 0, 0, 0.2, 3],
    ])
    expect(nodeGraph(u)).toEqual({ unit: u, joined: 0 })
  })
})

describe('zonesOntoWalls', () => {
  it('a zone line ending on the face of a wall comes onto its centre line; near a wall end, onto that end; the walls stay', () => {
    const u = unitOf([
      [0, 0, 6, 0, 0.3, 3], // a thick wall
      [0, 3, 2, 3, 0.1, 3], // a short wall ending at (2, 3)
      [3, 0.15, 3, 2, 0.05, 0], // a zone line from the thick wall's face
      [3, 2, 2.06, 3, 0.05, 0], // a zone line ending 6 cm short of the short wall's end
    ])
    const z = zonesOntoWalls(u)
    const V = new Map(z.vertices.map((v) => [v.id, v]))
    const zone = z.walls.filter((w) => w.heightM === 0)
    expect(V.get(zone[0].a)).toMatchObject({ x: 3, y: 0 })
    expect(zone[1].b).toBe(u.walls[1].b) // the short wall's own end
    for (const w of z.walls.filter((x) => x.heightM > 0)) expect([V.get(w.a), V.get(w.b)]).toEqual([u.vertices.find((v) => v.id === w.a), u.vertices.find((v) => v.id === w.b)])
  })
})

describe('settleImport', () => {
  it('leaves a floor that the Studio opens without bringing a crossing back', () => {
    // from the dental clinic's roof: a 15 cm parapet runs inside a 27 cm wall's body up to the cross wall
    const u = unitOf([
      [-26.539, -27.54, -22.263, -27.54, 0.267, 3.4],
      [-22.263, -27.54, -21.62, -27.54, 0.267, 3.4],
      [-22.263, -27.54, -22.263, -26.54, 0.267, 3.26],
      [-26.35, -27.456, -22.46, -27.456, 0.15, 2.87],
    ])
    const plain = reducer(initialState(), { type: 'load-unit', unit: u }).unit
    expect(crossings(plain)).toBeGreaterThan(0) // the Studio's load alone leaves the piece along the cross wall
    const s = settleImport(u).unit
    expect(crossings(s)).toBe(0)
    const again = reducer(initialState(), { type: 'load-unit', unit: s }).unit
    expect(crossings(again)).toBe(0)
    expect(again.walls).toHaveLength(s.walls.length)
  })
})
