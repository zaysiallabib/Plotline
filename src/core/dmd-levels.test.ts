/**
 * The Sheltech dmd tower's levels, hand-authored from `Demo drawings/Sheltech dmd/` (src/data/units/dmd-*.json): one
 * building frame (origin = the fire stair's inner NW corner), the core and the columns shared level to level.
 */
import { describe, expect, test } from 'vitest'
import b1 from '../data/units/dmd-b1.json'
import b2 from '../data/units/dmd-b2.json'
import ground from '../data/units/dmd-ground.json'
import roof from '../data/units/dmd-roof.json'
import typical from '../data/units/dmd-typical.json'
import type { Tower } from '../data/building'
import * as dmd from '../data/building/dmd-tower'
import * as core from './index'
import type { Unit } from './index'

const BAYS = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, '0'))
const LEVELS: Record<string, { unit: Unit; zones: string[] }> = {
  'dmd-b2': {
    unit: b2 as unknown as Unit,
    zones: ['Driveway', 'Pump room', 'Fire stair', 'Lift pit', "Drivers' waiting", 'Ramp up to Basement 1', 'Under the ramp', ...BAYS(36, 72)],
  },
  'dmd-b1': {
    unit: b1 as unknown as Unit,
    zones: ['Driveway', 'Underground water reservoir', 'Fire stair', 'Lift pit', "Driver's waiting", "Drivers' waiting", 'Ramp up to the ground level', 'Ramp down to Basement 2', ...BAYS(1, 35)],
  },
  'dmd-ground': {
    unit: ground as unknown as Unit,
    zones: ['Substation & generator', 'HT meter room', 'Ramp down to the basements', 'Lounge', 'Lift lobby', 'Fire stair', 'Stair', 'Lift', 'Lift 2', 'Car drop & pick up area', 'Entry & exit', 'Guard room', 'Children play area', 'Fountain', 'Deck', 'Green area'],
  },
  'dmd-typical': {
    unit: typical as unknown as Unit,
    zones: ['Typical floor', 'Fire stair', 'Stair', 'Lift', 'Lift 2', 'Lift lobby'],
  },
  'dmd-roof': {
    unit: roof as unknown as Unit,
    zones: ['Swimming pool', 'Pool deck', 'Shower & change room', 'Fire stair', 'Stair', 'Lift machine room', 'Overhead water tank', 'Roof terrace', 'Roof terrace (south)', 'Roof garden (west)', 'Roof garden (east)', 'Roof garden (south)'],
  },
}

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

const components = (u: Unit): number => {
  const parent = new Map(u.vertices.map((v) => [v.id, v.id]))
  const find = (id: string): string => (parent.get(id) === id ? id : find(parent.get(id)!))
  for (const w of u.walls) parent.set(find(w.a), find(w.b))
  return new Set(u.vertices.map((v) => find(v.id))).size
}

describe.each(Object.entries(LEVELS))('%s', (_, { unit, zones }) => {
  const rooms = core.deriveRooms(unit)

  test('every face is labelled and named as printed; no validation errors, no islands; one connected graph', () => {
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(unit.roomLabels.map((l) => l.id)))
    for (const z of zones) expect(rooms.map((r) => r.name), z).toContain(z)
    const issues = core.validate(unit)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
    expect(issues.filter((i) => i.code === 'island-in-room' || i.code === 'unlabelled-room')).toEqual([])
    expect(components(unit)).toBe(1)
  })

  test('printed sizes match the clear size through the label within 3 %', () => {
    for (const l of unit.roomLabels.filter((l) => l.printedSize)) {
      const inner = core.roomInnerPolygon(rooms.find((r) => r.id === l.id)!, unit)
      const [pw, ph] = l.printedSize!.split('×').map((t) => core.parseLength(t.trim())!)
      expect(Math.abs(chord(inner, l, 'x') / pw - 1), `${l.name} width`).toBeLessThan(0.03)
      expect(Math.abs(chord(inner, l, 'y') / ph - 1), `${l.name} depth`).toBeLessThan(0.03)
    }
  })

  test('openings fit their walls; no opening on a flush line', () => {
    for (const w of unit.walls) {
      const f = core.wallFrame(w, unit.vertices)
      for (const o of w.openings) {
        expect(w.heightM, o.id).toBeGreaterThan(0)
        expect(o.sillM + o.heightM, o.id).toBeLessThanOrEqual(w.heightM + 1e-9)
        expect(o.offsetM + o.widthM, o.id).toBeLessThanOrEqual(f.lengthM + 1e-9)
      }
    }
  })
})

describe('the core and the columns coincide level to level (within 5 cm)', () => {
  const units = Object.values(LEVELS).map((l) => l.unit)
  test('fire stair', () => {
    const boxes = units.map((u) => {
      const p = core.roomInnerPolygon(core.deriveRooms(u).find((r) => r.name === 'Fire stair')!, u)
      return [Math.min(...p.map((q) => q.x)), Math.min(...p.map((q) => q.y)), Math.max(...p.map((q) => q.x)), Math.max(...p.map((q) => q.y))]
    })
    for (const b of boxes.slice(1)) b.forEach((v, i) => expect(Math.abs(v - boxes[0][i])).toBeLessThan(0.05))
  })
  test('columns with the same id stand in the same place', () => {
    const at = new Map<string, core.Pt>()
    for (const u of units)
      for (const c of u.pillars ?? []) {
        const seen = at.get(c.id)
        if (seen) expect(Math.hypot(seen.x - c.x, seen.y - c.y), c.id).toBeLessThan(0.05)
        else at.set(c.id, c)
      }
  })
})

describe('dmd-tower.ts', () => {
  const tower: Tower = dmd
  test('every level stands on its floor once, the typical shell on floors 1–13, all in one frame', () => {
    expect(tower.LEVELS).toEqual({ 'dmd-b2': -2, 'dmd-b1': -1, 'dmd-ground': 0, 'dmd-roof': 14 })
    for (const [stem, floor] of Object.entries(tower.LEVELS!)) expect(tower.FLOORS.filter((f) => f.standIns?.includes(stem)).map((f) => f.floor)).toEqual([floor])
    expect(tower.FLOORS.filter((f) => f.standIns?.includes('dmd-typical')).map((f) => f.floor)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1))
    for (const [stem, f] of Object.entries(tower.FLATS)) {
      expect(f.offset, stem).toEqual({ x: 0, y: 0 })
      expect(LEVELS[f.unit.id], stem).toBeDefined()
    }
  })
  test('the plot is the boundary wall of the ground level', () => {
    const xs = ground.vertices.map((v) => v.x), ys = ground.vertices.map((v) => v.y)
    expect(tower.GROUND.plot).toEqual([
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      { x: Math.min(...xs), y: Math.max(...ys) },
    ].map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })))
  })
})
