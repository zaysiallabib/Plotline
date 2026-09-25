/** Geometry invariants of the hand-authored Type B unit (src/data/units/type-b.json, upper flat of img_2.webp). */
import { describe, expect, test } from 'vitest'
import typeB from '../data/units/type-b.json'
import * as core from './index'
import type { Unit } from './index'

const unit = typeB as unknown as Unit
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

describe('type-b.json', () => {
  test('22 labelled rooms, no validation errors', () => {
    expect(rooms).toHaveLength(22)
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(unit.roomLabels.map((l) => l.id)))
    expect(core.validate(unit).filter((i) => i.level === 'error')).toEqual([])
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

  test('openings fit their wall; doors ≥ 0.7 m; only one shaft and the living planter lack an opening', () => {
    const reached = new Set<string>()
    for (const w of unit.walls) {
      const f = core.wallFrame(w, unit.vertices)
      for (const o of w.openings) {
        expect(o.sillM + o.heightM, o.id).toBeLessThanOrEqual(w.heightM + 1e-9)
        expect(o.offsetM + o.widthM, o.id).toBeLessThanOrEqual(f.lengthM + 1e-9)
        if (o.kind === 'door') expect(o.widthM, o.id).toBeGreaterThanOrEqual(0.7)
        const at = add(f.origin, f.dir, o.offsetM + o.widthM / 2)
        for (const s of [1, -1]) {
          const r = core.roomAt(add(at, f.normal, s * (w.thicknessM / 2 + 0.05)), rooms, unit)
          if (r) reached.add(r.id)
        }
      }
    }
    const unreachable = rooms.filter((r) => !reached.has(r.id)).map((r) => r.id).sort()
    expect(unreachable).toEqual(['r_aod_htoilet', 'r_planter_living'])
  })

  test('the first door in walls[] is the main entrance: lift lobby → living', () => {
    const w = unit.walls.find((x) => x.openings.some((o) => o.kind === 'door'))!
    expect(w.openings[0].id).toBe('o_main_door')
  })

  // The common areas' printed rectangles follow the stair/lift core, not the open lobby face; the Bed-1 veranda
  // is printed to its parapet's outer faces (5'-0" × 10'-0" = glass line to the outside of the parapet).
  const NOT_CLEAR = new Set(['r_lobby', 'r_stair', 'r_veranda_bed1'])
  test('traced clear size through each label matches the printed size within 2"', () => {
    const labelled = unit.roomLabels.filter((l) => l.printedSize && !NOT_CLEAR.has(l.id))
    expect(labelled.length).toBe(13)
    for (const l of labelled) {
      const r = rooms.find((x) => x.id === l.id)!
      const inner = core.roomInnerPolygon(r, unit)
      const [pw, ph] = l.printedSize!.split('×').map((t) => core.parseLength(t.trim())!)
      expect(Math.abs(chord(inner, l, 'x') - pw), `${l.name} width`).toBeLessThan(2 * 0.0254)
      expect(Math.abs(chord(inner, l, 'y') - ph), `${l.name} depth`).toBeLessThan(2 * 0.0254)
    }
  })
})
