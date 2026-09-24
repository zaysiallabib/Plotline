/** Geometry invariants of the hand-authored Type A unit (src/data/units/type-a.json). */
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import * as core from './index'
import type { Unit } from './index'

const unit = typeA as unknown as Unit
const rooms = core.deriveRooms(unit)
const add = (a: core.Pt, b: core.Pt, s: number) => ({ x: a.x + b.x * s, y: a.y + b.y * s })

describe('type-a.json', () => {
  test('27 labelled rooms, no validation errors', () => {
    expect(rooms).toHaveLength(27)
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

  test('openings fit their wall; doors ≥ 0.7 m; only shafts/lift core lack an opening', () => {
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
    expect(unreachable).toEqual(['r_aod_service', 'r_lifts'])
  })
})
