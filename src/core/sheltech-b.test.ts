/**
 * Sheltech Type B (src/data/units/sheltech-b.json) = Type A mirrored about the traced lobby's centre line, generated
 * by E:\dev\tmp\wave11\mirror\gen-b.mjs. Same checks as sheltech-a.test.ts on the mirror, and B must still be the
 * mirror of the current A (re-run the generator after A is retraced).
 */
import { describe, expect, test } from 'vitest'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import * as core from './index'
import type { Unit } from './index'

const A = sheltechA as unknown as Unit
const unit = sheltechB as unknown as Unit
const rooms = core.deriveRooms(unit)
const add = (a: core.Pt, b: core.Pt, s: number) => ({ x: a.x + b.x * s, y: a.y + b.y * s })
const m = (id: string) => `${id}-m`

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

const COMMON = new Set(['r_lobby', 'r_stair'].map(m))

describe('sheltech-b.json', () => {
  test('is Type A mirrored about the lobby centre line (regenerate after A changes)', () => {
    const x = (id: string) => A.vertices.find((v) => v.id === id)!.x
    const axis = (x('v_low_ls') + x('v_md_ls')) / 2
    const round = (u: Unit) => JSON.parse(JSON.stringify(u, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)))
    expect(round(unit)).toEqual(round({ ...core.mirrorUnit(A, axis), id: 'unit_sheltech_b_2736', name: 'Sheltech Type B · 2736 sft' }))
    // the lobby maps onto itself (same outline, its walls split at other points): B's main door is in A's lobby west wall
    const box = (u: Unit, id: string) => {
      const p = core.roomPolygon(core.deriveRooms(u).find((r) => r.id === id)!, u)
      return [Math.min(...p.map((q) => q.x)), Math.max(...p.map((q) => q.x)), Math.min(...p.map((q) => q.y)), Math.max(...p.map((q) => q.y))]
    }
    box(unit, m('r_lobby')).forEach((v, i) => expect(v).toBeCloseTo(box(A, 'r_lobby')[i], 6))
  })

  test('21 labelled rooms, no validation issues', () => {
    expect(rooms).toHaveLength(21)
    expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(unit.roomLabels.map((l) => l.id)))
    expect(core.validate(unit)).toEqual([])
  })

  test('every room but the two planters is reachable from the lobby', () => {
    const ls = links()
    const reached = new Set([m('r_lobby')])
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
    expect(rooms.filter((r) => !reached.has(r.id)).map((r) => r.id).sort()).toEqual(['r_planter_east', 'r_planter_south'].map(m))
  })

  test('the first door in walls[] is the main entrance, on the flat boundary: lobby → foyer', () => {
    const w = unit.walls.find((x) => x.openings.some((o) => o.kind === 'door'))!
    expect(w.openings[0].id).toBe(m('o_main_door'))
    expect(rooms.filter((r) => r.wallIds.includes(w.id)).map((r) => r.id).sort()).toEqual([m('r_foyer'), m('r_lobby')])
    const fromCommon = links().filter(([a, b]) => COMMON.has(a) !== COMMON.has(b)).map(([, , id]) => id)
    expect(fromCommon).toEqual([m('o_main_door')])
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
})
