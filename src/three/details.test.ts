/** Pure span logic behind the skirting mesh (details.ts). */
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import typeC from '../data/units/type-c.json'
import * as core from '../core'
import type { Unit } from '../core'
import { curtainSides, skirtingSpans, wallGeometry } from './details'
import { TEST_UNIT } from './testUnit'

test('type-a wall faces are crack-free: a corner on a coplanar face edge is that edge’s end, bit for bit', () => {
  const unit = typeA as unknown as Unit
  const geos = new Map(unit.walls.map((w) => [w, wallGeometry(w, unit)!]))
  const segDist = (r: number[], a: number[], b: number[]) => {
    const ab = b.map((c, j) => c - a[j])
    const t = Math.min(1, Math.max(0, ab.reduce((s, c, j) => s + c * (r[j] - a[j]), 0) / ab.reduce((s, c) => s + c * c, 0)))
    return Math.hypot(...r.map((c, j) => c - a[j] - t * ab[j]))
  }
  let checked = 0
  const bad: string[] = []
  for (const v of unit.vertices) {
    // room-facing triangles (groups 0/1) of every wall at v, near v, by plane normal
    const planes = new Map<string, number[][][]>()
    for (const w of unit.walls.filter((w) => w.a === v.id || w.b === v.id)) {
      const g = geos.get(w)!
      const [p, n] = [g.attributes.position, g.attributes.normal]
      for (const gr of g.groups.filter((gr) => gr.materialIndex! < 2)) {
        for (let i = gr.start; i < gr.start + gr.count; i += 3) {
          const tri = [0, 1, 2].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)])
          if (!tri.some((q) => Math.hypot(q[0] - v.x, q[2] - v.y) < 0.3)) continue
          const key = [n.getX(i), n.getY(i), n.getZ(i)].join()
          planes.set(key, [...(planes.get(key) ?? []), tri])
        }
      }
    }
    for (const tris of planes.values()) {
      const pts = tris.flat()
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const [a, b] = [t[k], t[(k + 1) % 3]]
          for (const r of pts) {
            if (r.every((c, j) => c === a[j]) || r.every((c, j) => c === b[j])) continue
            if (segDist(r, a, b) < 1e-6) bad.push(`${v.id}: ${r}`) // T-junction, or a corner off by float noise
            checked++
          }
        }
      }
    }
  }
  expect(bad).toEqual([])
  expect(checked).toBeGreaterThan(1000)
})

test('type-a/c reveals (jambs, heads, sills) move with the face group asked for; ends and tops stay in group 2 (3 groups: no extra draw call)', () => {
  const area = (g: THREE.BufferGeometry, m: number) => {
    const p = g.attributes.position
    let s = 0
    for (const gr of g.groups.filter((gr) => gr.materialIndex === m))
      for (let i = gr.start; i < gr.start + gr.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k))
        s += b.sub(a).cross(c.sub(a)).length() / 2
      }
    return s
  }
  for (const unit of [typeA, typeC] as unknown as Unit[]) {
    for (const w of unit.walls) {
      const [g0, g1] = [wallGeometry(w, unit, 0), wallGeometry(w, unit, 1)]
      if (!g0 || !g1) continue
      const L = core.wallFrame(w, unit.vertices).lengthM
      const want = w.openings.reduce(
        (s, o) =>
          s +
          w.thicknessM *
            (o.heightM * ((o.offsetM > 1e-9 ? 1 : 0) + (o.offsetM + o.widthM < L - 1e-9 ? 1 : 0)) +
              o.widthM * ((o.sillM > 0 ? 1 : 0) + (o.sillM + o.heightM < w.heightM ? 1 : 0))),
        0,
      )
      expect(g0.groups.length, w.id).toBe(3)
      expect(area(g0, 0) - area(g1, 0), w.id).toBeCloseTo(want, 4) // float32 world positions
      expect(area(g1, 1) - area(g0, 1), w.id).toBeCloseTo(want, 4)
      expect(area(g0, 2), w.id).toBeCloseTo(area(g1, 2), 6)
    }
  }
})

describe('skirtingSpans', () => {
  const rooms = core.deriveRooms(TEST_UNIT)

  test.each(['living', 'bed'])('%s: skirting stops exactly at the door jambs of the shared wall', (id) => {
    const room = rooms.find((r) => r.id === id)!
    const inner = core.roomInnerPolygon(room, TEST_UNIT)
    const edge = room.wallIds.indexOf('w8') // v2 (5,0) → v3 (5,4); door1 spans y ∈ [2.4, 3.3]
    const ys = skirtingSpans(room, TEST_UNIT)
      .filter((s) => s.edge === edge)
      .map((s) => {
        const p = inner[edge]
        const q = inner[(edge + 1) % inner.length]
        const at = (t: number) => p.y + ((q.y - p.y) * t) / s.len
        return [at(s.s0), at(s.s1)].sort((a, b) => a - b)
      })
      .sort((a, b) => a[0] - b[0])
    expect(ys).toHaveLength(2)
    expect(ys[0][1]).toBeCloseTo(2.4, 9)
    expect(ys[1][0]).toBeCloseTo(3.3, 9)
  })

  test('windows above skirting height do not interrupt it', () => {
    const living = rooms.find((r) => r.id === 'living')!
    expect(skirtingSpans(living, TEST_UNIT).filter((s) => s.edge === living.wallIds.indexOf('w1'))).toHaveLength(1)
  })

  test('type-a: none in baths, balconies or shafts; every bedroom has some', () => {
    const unit = typeA as unknown as Unit
    for (const r of core.deriveRooms(unit)) {
      const n = skirtingSpans(r, unit).length
      if (['bath', 'balcony', 'shaft'].includes(r.kind)) expect(n, r.name).toBe(0)
      if (r.kind === 'bed') expect(n, r.name).toBeGreaterThan(3)
    }
  })
})

test('curtains only where the other side is open air: never on the study/dining glass partition (A, C)', () => {
  for (const u of [typeA, typeC] as unknown as Unit[]) {
    const rooms = core.deriveRooms(u)
    const sides = (id: string) => {
      const wall = u.walls.find((w) => w.openings.some((o) => o.id === id))!
      return curtainSides(wall.openings.find((o) => o.id === id)!, wall, u, rooms).map(([r, s]) => `${r.name}:${s}`)
    }
    expect(sides('o_study_glass'), `${u.id} interior glass`).toEqual([])
    expect(sides('o_study_win'), `${u.id} outside wall`).toEqual(['Study room:-1'])
    expect(sides('o_bed2_win_e'), `${u.id} onto a veranda`).toEqual(['Bed-2:1'])
    expect(sides('o_bed3_win'), `${u.id} onto an air shaft`).toEqual(['Bed-3:-1'])
  }
})
