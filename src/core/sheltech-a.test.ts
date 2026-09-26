/**
 * Geometry invariants of the hand-authored Sheltech Type A unit (src/data/units/sheltech-a.json, right-hand flat of
 * "Demo drawings/Sheltech/Level 2.jpg") — the first plan from a second developer.
 */
import { describe, expect, test } from 'vitest'
import sheltechA from '../data/units/sheltech-a.json'
import * as core from './index'
import type { Unit } from './index'

const unit = sheltechA as unknown as Unit
const rooms = core.deriveRooms(unit)
const add = (a: core.Pt, b: core.Pt, s: number) => ({ x: a.x + b.x * s, y: a.y + b.y * s })

/** Length of the chord of `poly` through p along x (or y): the clear span a tape measure would give at p. */
function chord(poly: core.Pt[], p: core.Pt, axis: 'x' | 'y'): number {
  const [u, v] = axis === 'x' ? (['x', 'y'] as const) : (['y', 'x'] as const)
  const hits: number[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    if ((a[v] - p[v]) * (b[v] - p[v]) < 0) hits.push(a[u] + ((p[v] - a[v]) / (b[v] - a[v])) * (b[u] - a[u]))
  })
  return Math.min(...hits.filter((h) => h > p[u])) - Math.max(...hits.filter((h) => h < p[u]))
}

/** Rooms either side of every door/passage/slider (windows excluded). */
function links(): [string, string, string][] {
  const out: [string, string, string][] = []
  for (const w of unit.walls) {
    const f = core.wallFrame(w, unit.vertices)
    for (const o of w.openings) {
      if (o.kind === 'window') continue
      const at = add(f.origin, f.dir, o.offsetM + o.widthM / 2)
      const [p, q] = [1, -1].map((s) => core.roomAt(add(at, f.normal, s * (w.thicknessM / 2 + 0.05)), rooms, unit))
      if (p && q) out.push([p.id, q.id, o.id])
    }
  }
  return out
}

const COMMON = new Set(['r_lobby', 'r_stair'])

describe('sheltech-a.json', () => {
  test('21 labelled rooms, no validation issues', () => {
    expect(rooms).toHaveLength(21)
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(unit.roomLabels.map((l) => l.id)))
    expect(core.validate(unit)).toEqual([])
  })

  test('roomInnerPolygon: positive, smaller than the centerline polygon, inside it, finite', () => {
    for (const r of rooms) {
      const outer = core.roomPolygon(r, unit)
      const inner = core.roomInnerPolygon(r, unit)
      expect(inner, r.name).toHaveLength(outer.length)
      for (const p of inner) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), r.name).toBe(true)
        expect(core.pointInPolygon(p, outer), `${r.name} ${p.x},${p.y}`).toBe(true)
      }
      const A = core.signedArea(outer)
      const B = core.signedArea(inner)
      expect(B, r.name).toBeGreaterThan(0)
      expect(B, r.name).toBeLessThan(A)
    }
  })

  test('openings fit their wall; doors ≥ 0.7 m; every room but the two planters is reachable from the lobby', () => {
    for (const w of unit.walls) {
      const f = core.wallFrame(w, unit.vertices)
      for (const o of w.openings) {
        expect(o.sillM + o.heightM, o.id).toBeLessThanOrEqual(w.heightM + 1e-9)
        expect(o.offsetM + o.widthM, o.id).toBeLessThanOrEqual(f.lengthM + 1e-9)
        if (o.kind === 'door') expect(o.widthM, o.id).toBeGreaterThanOrEqual(0.7)
      }
    }
    const ls = links()
    const reached = new Set(['r_lobby'])
    for (let grew = true; grew; ) {
      grew = false
      for (const [a, b] of ls) {
        if (reached.has(a) !== reached.has(b)) {
          reached.add(a)
          reached.add(b)
          grew = true
        }
      }
    }
    expect(rooms.filter((r) => !reached.has(r.id)).map((r) => r.id).sort()).toEqual(['r_planter_east', 'r_planter_south'])
  })

  test('the first door in walls[] is the main entrance, on the flat boundary: lobby → foyer', () => {
    const w = unit.walls.find((x) => x.openings.some((o) => o.kind === 'door'))!
    expect(w.openings[0].id).toBe('o_main_door')
    const sides = rooms.filter((r) => r.wallIds.includes(w.id)).map((r) => r.id).sort()
    expect(sides).toEqual(['r_foyer', 'r_lobby'])
    // the flat is entered only from the common core: no other opening joins a flat room to the lobby or stair
    const fromCommon = links().filter(([a, b]) => COMMON.has(a) !== COMMON.has(b)).map(([, , id]) => id)
    expect(fromCommon).toEqual(['o_main_door'])
  })

  test('every printed size matches the traced clear size through its label within 2"', () => {
    const labelled = unit.roomLabels.filter((l) => l.printedSize)
    expect(labelled.length).toBe(17)
    for (const l of labelled) {
      const r = rooms.find((x) => x.id === l.id)!
      const inner = core.roomInnerPolygon(r, unit)
      const [pw, ph] = l.printedSize!.split('×').map((t) => core.parseLength(t.trim())!)
      expect(Math.abs(chord(inner, l, 'x') - pw), `${l.name} width`).toBeLessThan(2 * 0.0254)
      expect(Math.abs(chord(inner, l, 'y') - ph), `${l.name} depth`).toBeLessThan(2 * 0.0254)
    }
  })

  // Printed ±2736 sft is a sales figure (outer walls + a share of lobby, stair and lifts); the traced centerline faces of
  // the flat come to ~2100 sft (BTI's Type A: 2363 traced vs 2703 printed).
  test('traced outline of the flat (centerline faces, lobby and stair excluded) is 70–90 % of the printed area', () => {
    const sqft = core.sqmToSqft(rooms.filter((r) => !COMMON.has(r.id)).reduce((s, r) => s + r.areaSqm, 0))
    expect(sqft / unit.areaSqft).toBeGreaterThan(0.7)
    expect(sqft / unit.areaSqft).toBeLessThan(0.9)
  })
})
