/** Pure span logic behind the skirting mesh (details.ts). */
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import typeC from '../data/units/type-c.json'
import * as core from '../core'
import type { Unit } from '../core'
import { curtainSides, pillarParts, raiseHeads, skirtingRuns, wallGeometry, type SkirtingRun } from './details'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import { initialState, reducer } from '../studio/model'
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

describe('skirtingRuns', () => {
  const rooms = core.deriveRooms(TEST_UNIT)
  const runs = skirtingRuns(TEST_UNIT, rooms)
  /** runs of `room` on the plane x = `x` whose normal points along ±x, as sorted y-intervals */
  const onPlaneX = (rs: SkirtingRun[], roomId: string, x: number) =>
    rs
      .filter((r) => r.room.id === roomId && Math.abs(r.n.y) < 1e-6 && Math.abs(r.p.x - x) < 1e-6)
      .map((r) => [r.p.y + r.d.y * r.s0, r.p.y + r.d.y * r.s1].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0])

  test.each(['living', 'bed'])('%s: the tile stops exactly at the door jambs of the shared wall w8', (id) => {
    // w8: v2 (5,0) → v3 (5,4), 0.127 thick; door1 spans y ∈ [2.4, 3.3]; living on −x, bed on +x
    const face = id === 'living' ? 5 - 0.0635 : 5 + 0.0635
    const ys = onPlaneX(runs, id, face)
    expect(ys.some(([, b]) => Math.abs(b - 2.4) < 1e-9), JSON.stringify(ys)).toBe(true)
    expect(ys.some(([a]) => Math.abs(a - 3.3) < 1e-9), JSON.stringify(ys)).toBe(true)
    expect(ys.some(([a, b]) => a < 2.85 && 2.85 < b)).toBe(false) // nothing under the door
  })

  test('a window above skirting height does not interrupt the run; one plane holds one unioned run per room', () => {
    const living = rooms.find((r) => r.id === 'living')!
    const w1 = TEST_UNIT.walls.find((w) => w.id === 'w1')!
    const f = core.wallFrame(w1, TEST_UNIT.vertices)
    const n = { x: -f.normal.x, y: -f.normal.y } // living side of w1 (its first room) — probe either side
    const side = core.roomAt({ x: f.origin.x + f.normal.x * 0.2, y: f.origin.y + f.normal.y * 0.2 }, rooms, TEST_UNIT)?.id === 'living' ? 1 : -1
    void n
    const mine = runs.filter((r) => r.room === living && Math.abs(r.n.x - f.normal.x * side) < 1e-6 && Math.abs(r.n.y - f.normal.y * side) < 1e-6)
    expect(mine).toHaveLength(1)
    expect(mine[0].s1 - mine[0].s0).toBeGreaterThanOrEqual(f.lengthM)
  })

  test('runs never overlap on one plane: coplanar strips of different walls or rooms are unioned / clipped', () => {
    const key = (r: SkirtingRun) => `${Math.round(r.n.x * 1000)},${Math.round(r.n.y * 1000)},${Math.round((r.p.x * r.n.x + r.p.y * r.n.y) * 1000)}`
    const byPlane = new Map<string, [number, number][]>()
    for (const r of runs) {
      const t = r.p.x * r.d.x + r.p.y * r.d.y
      byPlane.set(key(r), [...(byPlane.get(key(r)) ?? []), [t + r.s0, t + r.s1]])
    }
    for (const [k, iv] of byPlane) {
      iv.sort((a, b) => a[0] - b[0])
      for (let i = 1; i < iv.length; i++) expect(iv[i][0], k).toBeGreaterThanOrEqual(iv[i - 1][1] - 1e-6)
    }
  })

  test('a doorless passage: the tile turns into the reveal, each half in its own room', () => {
    const walls = TEST_UNIT.walls.map((w) => (w.id === 'w8' ? { ...w, openings: w.openings.map((o) => (o.id === 'door1' ? { ...o, kind: 'passage' as const } : o)) } : w))
    const unit = { ...TEST_UNIT, walls }
    const rs = skirtingRuns(unit, core.deriveRooms(unit))
    // reveal runs: along ±x (the wall normal) at y = 2.4 and 3.3
    const reveals = rs.filter((r) => Math.abs(r.d.y) < 1e-6 && (Math.abs(r.p.y - 2.4) < 1e-6 || Math.abs(r.p.y - 3.3) < 1e-6))
    expect(reveals.map((r) => r.room.id).sort()).toEqual(['bed', 'bed', 'living', 'living'])
    for (const r of reveals) {
      const xs = [r.p.x + r.d.x * r.s0, r.p.x + r.d.x * r.s1].sort((a, b) => a - b)
      // from the centre line (x = 5) out past that face by the skirting depth
      if (r.room.id === 'living') expect(xs).toEqual([expect.closeTo(5 - 0.0635 - 0.012, 9), expect.closeTo(5, 9)])
      else expect(xs).toEqual([expect.closeTo(5, 9), expect.closeTo(5 + 0.0635 + 0.012, 9)])
    }
  })

  test('type-a: none in baths, balconies or shafts; every bedroom has some', () => {
    const unit = typeA as unknown as Unit
    const rooms = core.deriveRooms(unit)
    const rs = skirtingRuns(unit, rooms)
    for (const r of rooms) {
      const n = rs.filter((x) => x.room === r).length
      if (['bath', 'balcony', 'shaft'].includes(r.kind)) expect(n, r.name).toBe(0)
      if (r.kind === 'bed') expect(n, r.name).toBeGreaterThan(3)
    }
  })

  test("the founder's draft: no run leaves the unit (a wall a hair off axis once mirrored its run across the origin)", () => {
    const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
    const b = core.unitBounds(u)
    const rs = skirtingRuns(u, core.deriveRooms(u))
    expect(rs.length).toBeGreaterThan(200)
    const bad = rs.filter((r) => [r.p, { x: r.p.x + r.d.x * r.s1, y: r.p.y + r.d.y * r.s1 }].some((p) => p.x < b.minX - 0.5 || p.x > b.maxX + 0.5 || p.y < b.minY - 0.5 || p.y > b.maxY + 0.5))
    expect(bad.map((r) => `${r.room.name} ${r.p.x.toFixed(2)},${r.p.y.toFixed(2)}`)).toEqual([])
  })

  test("the founder's jamb: the 13 cm jog that pokes 1.25 cm into Space 1 past its outline gets Space 1's tile on its face", () => {
    // his draft as the Studio loads it (normalizeUnit + Join walls); the jog e420befe runs x = 4.958, y 7.584 → 7.716, 0.152 thick
    const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
    const rooms = core.deriveRooms(u)
    const space1 = core.roomAt({ x: 4.83, y: 7.65 }, rooms, u)!
    expect(space1).toBeTruthy()
    const rs = skirtingRuns(u, rooms)
    const west = rs.filter((r) => r.room === space1 && Math.abs(r.n.x + 1) < 1e-6 && Math.abs(r.p.x - (4.958 - 0.076)) < 1e-3)
    expect(west.length, 'a run on the jog west face').toBeGreaterThan(0)
    const ys = west.map((r) => [r.p.y + r.d.y * r.s0, r.p.y + r.d.y * r.s1].sort((a, b) => a - b))
    expect(ys.some(([a, b]) => a <= 7.6 && b >= 7.7), JSON.stringify(ys)).toBe(true)
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
