/** Pure span logic behind the skirting mesh (details.ts). */
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import typeC from '../data/units/type-c.json'
import * as core from '../core'
import type { Unit } from '../core'
import { buildPlaster, curtainSides, pillarParts, plasterPolygon, PLASTER_M, raiseHeads, skirtingSpans, wallGeometry } from './details'
import { TEST_UNIT } from './testUnit'

test('a window on a 1.1 m wall (sill 0.9, h 1.2): the wall reaches the storey, past the 2.1 m head; a low wall with a passage stays low', () => {
  const walls = TEST_UNIT.walls.map((w) =>
    w.id === 'w2' ? { ...w, heightM: 1.1, openings: [{ id: 'win', kind: 'window' as const, offsetM: 1, widthM: 1.5, sillM: 0.9, heightM: 1.2 }] }
    : w.id === 'w4' ? { ...w, heightM: 0.45, openings: [{ id: 'gap', kind: 'passage' as const, offsetM: 1, widthM: 1, sillM: 0, heightM: 2.1 }] }
    : w,
  )
  const unit = raiseHeads({ ...TEST_UNIT, walls })
  const top = (id: string) => {
    const g = wallGeometry(unit.walls.find((w) => w.id === id)!, unit)!
    g.computeBoundingBox()
    return g.boundingBox!.max.y
  }
  expect(top('w2')).toBeCloseTo(3, 6) // ≥ 2.1: closed above the window
  expect(top('w4')).toBeCloseTo(0.45, 6)
  expect(raiseHeads(TEST_UNIT)).toBe(TEST_UNIT)
})

test('a pillar in the living / bed wall: each side in the finish of the room it faces, skirted there; 1 mm proud, top 1 cm over the walls', () => {
  const rooms = core.deriveRooms(TEST_UNIT)
  const parts = pillarParts({ id: 'p', x: 5, y: 1, wM: 0.4, hM: 0.6 }, 3, TEST_UNIT, rooms)
  const box = new THREE.Box3()
  for (const x of parts.filter((x) => x.part !== 'skirting')) box.union((x.geo.computeBoundingBox(), x.geo.boundingBox!))
  expect([box.min.x, box.max.x, box.min.z, box.max.z, box.min.y, box.max.y].map((v) => +v.toFixed(4))).toEqual([4.799, 5.201, 0.699, 1.301, 0, 3.01])
  const face = (nx: number) => parts.find((x) => x.part === 'face' && Math.round(x.geo.attributes.normal.getX(0)) === nx)?.room?.id
  expect([face(1), face(-1)]).toEqual(['bed', 'living'])
  const strips = parts.filter((x) => x.part === 'skirting')
  expect(strips).toHaveLength(4)
  expect(strips.every((x) => x.room?.id === 'bed' || x.room?.id === 'living')).toBe(true)
})

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

describe('buildPlaster', () => {
  const rooms = core.deriveRooms(TEST_UNIT)
  const living = rooms.find((r) => r.id === 'living')!
  const pieces = buildPlaster(living, TEST_UNIT)
  const w8 = pieces.find((p) => p.wallId === 'w8')!
  const pos = w8.geo.attributes.position
  const pts = Array.from({ length: pos.count }, (_, i) => ({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) }))

  test('one coat per wall of the room, every face looking into it', () => {
    expect(pieces.map((p) => p.wallId).sort()).toEqual([...living.wallIds].sort())
    for (const p of pieces) {
      const n = p.geo.attributes.normal
      const c = p.geo.attributes.position
      // the normal points from the surface toward the centroid
      const toC = { x: living.centroid.x - c.getX(0), y: living.centroid.y - c.getZ(0) }
      expect(n.getX(0) * toC.x + n.getZ(0) * toC.y, p.wallId).toBeGreaterThan(0)
    }
  })

  test('sits PLASTER_M in front of the wall face: a 5 mm wall end poking into the room is under it, the 15 mm door casing is not', () => {
    // w8 is x = 5, 0.127 thick, living on its −x side: its face is at x = 4.9365
    const face = 5 - 0.127 / 2
    const xs = pts.map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(face - PLASTER_M, 6) // the coat
    expect(Math.max(...xs)).toBeCloseTo(face, 6) // its returns reach the brick
    expect(pts.filter((p) => Math.abs(p.x - (face - PLASTER_M)) < 1e-6).length).toBeGreaterThan(pts.length / 3)
    expect(face - 0.005).toBeGreaterThan(face - PLASTER_M)
    expect(face - 0.015).toBeLessThan(face - PLASTER_M)
  })

  test('the door is cut out: nothing covers y ∈ (2.4, 3.3) below 2.1 m; the wall above the door and beside it is coated', () => {
    const tri = (i: number) => [pts[i], pts[i + 1], pts[i + 2]]
    const covers = (y: number, h: number) => {
      for (let i = 0; i < pts.length; i += 3) {
        const t = tri(i)
        const zs = t.map((p) => p.z), ys = t.map((p) => p.y)
        if (Math.min(...zs) < y && y < Math.max(...zs) && Math.min(...ys) < h && h < Math.max(...ys)) return true
      }
      return false
    }
    expect(covers(2.85, 1)).toBe(false)
    expect(covers(2.85, 2.5)).toBe(true)
    expect(covers(1, 1)).toBe(true)
    expect(covers(3.6, 1)).toBe(true)
  })

  test('the skirting sits on the same polygon', () => {
    expect(plasterPolygon(living, TEST_UNIT)[0]).not.toEqual(core.roomInnerPolygon(living, TEST_UNIT)[0])
  })
})

describe('skirtingSpans', () => {
  const rooms = core.deriveRooms(TEST_UNIT)

  test.each(['living', 'bed'])('%s: skirting stops exactly at the door jambs of the shared wall', (id) => {
    const room = rooms.find((r) => r.id === id)!
    const inner = plasterPolygon(room, TEST_UNIT)
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
