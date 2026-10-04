/**
 * The hand-authored levels of the Sheltech Banani tower (`Demo drawings/Sheltech Banani/`): every printed room / zone is
 * its own face, printed sizes hold, nothing fails validation, each level is one connected graph (no face with a hole),
 * and the columns + the lift core stand in the same place on every level (one building frame).
 */
import { describe, expect, test } from 'vitest'
import b1 from '../data/units/banani-b1.json'
import b2 from '../data/units/banani-b2.json'
import ground from '../data/units/banani-ground.json'
import roof from '../data/units/banani-roof.json'
import * as core from './index'
import type { Unit } from './index'

const LEVELS: Unit[] = [ground, b1, b2, roof].map((u) => u as unknown as Unit)

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

/** Number of connected components of the wall graph. */
function components(u: Unit): number {
  const parent = new Map(u.vertices.map((v) => [v.id, v.id]))
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!))
  for (const w of u.walls) parent.set(find(w.a), find(w.b))
  return new Set(u.vertices.map((v) => find(v.id))).size
}

describe.each(LEVELS.map((u) => [u.name, u] as const))('%s', (_, unit) => {
  const rooms = core.deriveRooms(unit)

  test('every label names its own face, and every face is named', () => {
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(unit.roomLabels.map((l) => l.id)))
  })

  test('no validation errors; one connected graph', () => {
    expect(core.validate(unit).filter((i) => i.level === 'error')).toEqual([])
    expect(components(unit)).toBe(1)
  })

  test('printed sizes match the clear size through the label within 3 %', () => {
    for (const l of unit.roomLabels.filter((x) => x.printedSize)) {
      const inner = core.roomInnerPolygon(rooms.find((r) => r.id === l.id)!, unit)
      const [pw, ph] = l.printedSize!.split('×').map((t) => core.parseLength(t.trim())!)
      expect(Math.abs(chord(inner, l, 'x') / pw - 1), `${l.name} width`).toBeLessThan(0.03)
      expect(Math.abs(chord(inner, l, 'y') / ph - 1), `${l.name} depth`).toBeLessThan(0.03)
    }
  })
})

test('columns and the lift core coincide level to level within 5 cm', () => {
  const seen = new Map<string, core.Pt>()
  for (const u of LEVELS) {
    const hoists = core.deriveRooms(u).filter((r) => r.id === 'r_hoist1' || r.id === 'r_hoist2')
    expect(hoists, u.name).toHaveLength(2)
    for (const p of [...(u.pillars ?? []), ...hoists.map((r) => ({ id: r.id, ...r.centroid }))]) {
      const q = seen.get(p.id)
      if (q) expect(Math.hypot(p.x - q.x, p.y - q.y), `${u.name} ${p.id}`).toBeLessThan(0.05)
      else seen.set(p.id, { x: p.x, y: p.y })
    }
  }
})
