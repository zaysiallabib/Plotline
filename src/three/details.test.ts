/** Pure span logic behind the skirting mesh (details.ts). */
import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import { GAP_PREFIX, WATER_DROP_M, bayMarkings, carriesRoof, isSteps, stepGeometry, buildSkirtings, casingPlan, closeGaps, curtainSides, liftWall, liftedWall, roomCeiling, pillarParts, poolBasin, raiseHeads, skirtingRuns, stepFaces, storeyTop, wallGeometry, wallLift, type SkirtingRun } from './details'
import sheltechRoof from '../data/units/sheltech-roof.json'
import bananiRoof from '../data/units/banani-roof.json'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import { initialState, reducer } from '../studio/model'
import { TEST_UNIT } from './testUnit'
import { GROUND_SAMPLE } from '../data/fixtures/ground-sample'
import { bakeDaylight } from './daylight'
import { furnish } from '../furnish/presets'
import { finishSlotsFor } from '../furnish/finishes'
import { entrySpawn } from '../viewer/spawn'
import { CONCRETE, DECK_PAINT, EXTERIOR_PLASTER, ZONE_FLOOR, zoneFinishRef } from './materials'
import { buildOpening } from './openings'

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

  const founder = () => reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const local = (f: ReturnType<typeof core.wallFrame>, q: Pt) => {
    const [x, y] = [q.x - f.origin.x, q.y - f.origin.y]
    return [x * f.dir.x + y * f.dir.y, x * f.normal.x + y * f.normal.y]
  }
  /** How far `q` is from anything standing on the floor: every wall's solid pieces from v = 0, and the columns. */
  const gapTo = (u: Unit) => {
    const solids = u.walls.flatMap((w) => {
      const f = core.wallFrame(w, u.vertices)
      return core.wallPieces(w, f.lengthM).filter((p) => p.v0 <= 0).map((p) => ({ f, p, T2: w.thicknessM / 2 }))
    })
    return (q: Pt) =>
      Math.min(
        ...solids.map(({ f, p, T2 }) => {
          const [uu, ww] = local(f, q)
          return Math.hypot(Math.max(p.u0 - uu, 0, uu - p.u1), Math.max(Math.abs(ww) - T2, 0))
        }),
        ...(u.pillars ?? []).map((p) => Math.hypot(Math.max(Math.abs(q.x - p.x) - p.wM / 2, 0), Math.max(Math.abs(q.y - p.y) - p.hM / 2, 0))),
      )
  }
  /** Points along the middle of a strip (6 mm off its wall face), every 4 mm. */
  const along = (r: SkirtingRun) => Array.from({ length: Math.floor((r.s1 - r.s0) / 0.004) + 1 }, (_, i) => ({ x: r.p.x + r.d.x * (r.s0 + i * 0.004) + r.n.x * 0.006, y: r.p.y + r.d.y * (r.s0 + i * 0.004) + r.n.y * 0.006 }))

  test.each([
    ['type-a', () => typeA as unknown as Unit],
    ['the founder draft', founder],
  ])('%s: no skirting run crosses a passage span (the tile only turns round its jambs)', (_, load) => {
    const u = load()
    const rs = skirtingRuns(u, core.deriveRooms(u))
    const gap = gapTo(u)
    let passages = 0
    const bad: string[] = []
    for (const w of u.walls) {
      const f = core.wallFrame(w, u.vertices)
      for (const o of w.openings.filter((o) => o.kind === 'passage')) {
        passages++
        // a strip inside the opening's floor footprint must hug something built (a jamb, a wall end), never span the gap
        const [a, b, h] = [o.offsetM, o.offsetM + o.widthM, w.thicknessM / 2 + 0.012]
        for (const r of rs) {
          const q = along(r).find((q) => {
            const [uu, ww] = local(f, q)
            return uu > a && uu < b && Math.abs(ww) < h && gap(q) > 0.025
          })
          if (q) bad.push(`${r.room.name} across ${o.id} at u=${local(f, q)[0].toFixed(2)}`)
        }
      }
    }
    expect(passages).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })

  test.each([
    ['type-a', typeA],
    ['type-b', typeB],
    ['type-c', typeC],
    ['sheltech-a', sheltechA],
    ['sheltech-b', sheltechB],
    ['the founder draft', null],
  ])('%s: every strip stands against something built — none floats (a passage at its wall end has no jamb there)', (_, json) => {
    const u = json ? (json as unknown as Unit) : founder()
    const gap = gapTo(u)
    const floating = skirtingRuns(u, core.deriveRooms(u)).filter((r) => along(r).some((q) => gap(q) > 0.02))
    expect(floating.map((r) => `${r.room.name} at ${r.p.x.toFixed(2)},${r.p.y.toFixed(2)}`)).toEqual([])
  })

  test.each([
    ['type-a', () => typeA as unknown as Unit],
    ['the founder draft', founder],
  ])('%s: every skirting strip is built right side out — each triangle winds the way its normal points, its face 12 mm off the wall', (_, load) => {
    // a mirrored basis turned the strips inside out: only their back faces drew, on the wall face, z-fighting it (2026-10-04)
    const u = load()
    const meshes = [...buildSkirtings(u, core.deriveRooms(u)).values()]
    expect(meshes.length).toBeGreaterThan(5)
    let bad = 0
    let tris = 0
    for (const m of meshes) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
      const [p, n] = [g.attributes.position, g.attributes.normal]
      for (let i = 0; i < p.count; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, i + k))
        const wind = b.sub(a).cross(c.sub(a))
        if (wind.dot(new THREE.Vector3().fromBufferAttribute(n, i)) <= 0) bad++
        tris++
      }
    }
    expect(tris).toBeGreaterThan(1000)
    expect(bad).toBe(0)
  })

  test.each([
    ['type-a', typeA],
    ['type-b', typeB],
    ['type-c', typeC],
    ['sheltech-a', sheltechA],
    ['sheltech-b', sheltechB],
    ['the founder draft', null],
  ])("%s: no two rooms' strips overlap where it shows (coplanar faces in two tiles z-fight: the founder's tiny brown upright)", (_, json) => {
    const u = json ? (json as unknown as Unit) : founder()
    const gap = gapTo(u)
    const rs = skirtingRuns(u, core.deriveRooms(u))
    // each strip as its 12 mm footprint in plan: points in it, and an inside test
    const box = (r: SkirtingRun) => ({ r, lo: Math.min(r.p.x + r.d.x * r.s0, r.p.x + r.d.x * r.s1) - 0.02, hi: Math.max(r.p.x + r.d.x * r.s0, r.p.x + r.d.x * r.s1) + 0.02, lo2: Math.min(r.p.y + r.d.y * r.s0, r.p.y + r.d.y * r.s1) - 0.02, hi2: Math.max(r.p.y + r.d.y * r.s0, r.p.y + r.d.y * r.s1) + 0.02 })
    // 0.5 mm in from every side: a thinner sliver is below a pixel from anywhere one can stand
    const inside = (r: SkirtingRun, q: Pt) => {
      const [x, y] = [q.x - r.p.x, q.y - r.p.y]
      const [s, t] = [x * r.d.x + y * r.d.y, x * r.n.x + y * r.n.y]
      return s > r.s0 + 5e-4 && s < r.s1 - 5e-4 && t > 5e-4 && t < 0.012 - 5e-4
    }
    const bs = rs.map(box)
    const bad: string[] = []
    for (const A of bs)
      for (const B of bs) {
        if (A.r.room === B.r.room || A.lo > B.hi || B.lo > A.hi || A.lo2 > B.hi2 || B.lo2 > A.hi2) continue
        let n = 0
        for (let s = A.r.s0; s <= A.r.s1; s += 0.002)
          for (let t = 0.001; t < 0.012; t += 0.002) {
            const q = { x: A.r.p.x + A.r.d.x * s + A.r.n.x * t, y: A.r.p.y + A.r.d.y * s + A.r.n.y * t }
            if (inside(B.r, q) && gap(q) > 1e-4) n++
          }
        if (n) bad.push(`${A.r.room.name} × ${B.r.room.name} at ${A.r.p.x.toFixed(2)},${A.r.p.y.toFixed(2)}`)
      }
    expect(bad).toEqual([])
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

describe('the white cased opening, however the partition was drawn (founder, 2026-10-04)', () => {
  /** TEST_UNIT with the living / bed wall w8 (x = 5, y 0 → 4, 0.127 thick, between the 0.25 m outer walls) given `openings` */
  const withW8 = (openings: Unit['walls'][number]['openings']): Unit => ({ ...TEST_UNIT, walls: TEST_UNIT.walls.map((w) => (w.id === 'w8' ? { ...w, openings } : w)) })
  const plan = (u: Unit, id: string) => {
    const w = u.walls.find((x) => x.openings.some((o) => o.id === id))!
    return casingPlan(w.openings.find((o) => o.id === id)!, w, u)
  }
  const passage = (offsetM: number, widthM: number) => ({ id: 'p', kind: 'passage' as const, offsetM, widthM, sillM: 0, heightM: 2.7 })
  const mm = (xs: number[]) => xs.map((x) => Math.round(x * 1000))

  test('mid-wall (the Passage tool): legs 7 cm wide on both faces at both jambs, a head on each face, no lining', () => {
    const c = plan(withW8([passage(1.5, 1.2)]), 'p')
    expect(c.legs.map(([a, b, s]) => [...mm([a, b]), s])).toEqual([[1430, 1500, 1], [1430, 1500, -1], [2700, 2770, 1], [2700, 2770, -1]])
    expect(c.heads.map(([a, b]) => mm([a, b]))).toEqual([[1430, 2770], [1430, 2770]])
    expect(c.linings).toEqual([])
    expect(c.top).toBe(2.7)
  })

  test('dragged out to both wall ends (between the outer walls): no leg hangs or hides — each jamb, the outer wall face, is lined over the depth', () => {
    const c = plan(withW8([passage(0, 4)]), 'p')
    expect(c.legs).toEqual([])
    // jambs at the 0.25 m outer walls' faces (y = 0.125, 3.875), 15 mm boards over 0.127 + 2 × 15 mm (±78.5), within 1 mm
    expect(c.linings.map((l) => mm(l))).toEqual([
      [124, 139, -78, 79],
      [3861, 3876, -78, 79],
    ])
    expect(c.heads).toHaveLength(2)
  })

  test("the founder's draft: both passages framed at every jamb (a leg on a face, or a lining where a crossing wall / the next wall forms it)", () => {
    const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
    const ps = u.walls.flatMap((w) => w.openings.filter((o) => o.kind === 'passage').map((o) => ({ w, o })))
    expect(ps).toHaveLength(2)
    for (const { w, o } of ps) {
      const c = casingPlan(o, w, u)
      for (const jamb of [o.offsetM, o.offsetM + o.widthM]) {
        const framed = c.legs.some(([a, b]) => Math.abs(a - jamb) < 1e-6 || Math.abs(b - jamb) < 1e-6) || c.linings.some(([a, b]) => Math.abs(a - jamb) < 0.08 || Math.abs(b - jamb) < 0.08)
        expect(framed, `${o.id.slice(0, 8)} at ${jamb.toFixed(3)}`).toBe(true)
      }
      expect(c.heads).toHaveLength(2)
    }
  })

  test("type-a's 4.66 m passage keeps its look: legs on the faces (one buried in Living's crossing wall is dropped), no lining", () => {
    const c = plan(typeA as unknown as Unit, 'o_liv_din_open')
    expect(c.legs).toHaveLength(3)
    expect(c.linings).toEqual([])
    expect(c.heads).toHaveLength(2)
  })

  describe('closeGaps', () => {
    // w8 split into two walls with a 1.2 m gap and no opening: y 0 → 1.4 and 2.6 → 4
    const w8 = TEST_UNIT.walls.find((w) => w.id === 'w8')!
    const gapped: Unit = {
      ...TEST_UNIT,
      vertices: [...TEST_UNIT.vertices, { id: 'ga', x: 5, y: 1.4 }, { id: 'gb', x: 5, y: 2.6 }],
      walls: [...TEST_UNIT.walls.filter((w) => w !== w8), { ...w8, id: 'w8a', b: 'ga', openings: [] }, { ...w8, id: 'w8b', a: 'gb', openings: [] }],
    }

    test('two wall ends in line with a gap: a stand-in wall with a full-width 2.7 m passage, cased on both walls; rooms unchanged', () => {
      const u = closeGaps(gapped)
      const stand = u.walls.filter((w) => w.id.startsWith(GAP_PREFIX))
      expect(stand.map((w) => [w.id, w.thicknessM, w.heightM, w.openings.map((o) => [o.kind, o.offsetM, +o.widthM.toFixed(3), o.heightM])])).toEqual([['gap:w8a|w8b', 0.127, 3, [['passage', 0, 1.2, 2.7]]]])
      expect(core.deriveRooms(u)).toEqual(core.deriveRooms(gapped))
      const c = casingPlan(stand[0].openings[0], stand[0], u)
      expect(c.legs).toHaveLength(4) // on w8a's and w8b's faces, 7 cm each
      expect(c.legs.every(([a, b]) => Math.abs(b - a - 0.07) < 1e-9)).toBe(true)
      expect(c.heads.map(([a, b]) => +(b - a).toFixed(3))).toEqual([1.34, 1.34])
    })

    test('nothing to close: unchanged units come back as the same object (a railing gap, a wall standing in the gap, no gap)', () => {
      expect(closeGaps(TEST_UNIT)).toBe(TEST_UNIT)
      const low = { ...gapped, walls: gapped.walls.map((w) => (w.id.startsWith('w8') ? { ...w, heightM: 1.1 } : w)) }
      expect(closeGaps(low)).toBe(low)
      const crossed = { ...gapped, vertices: [...gapped.vertices, { id: 'gs', x: 6, y: 2 }, { id: 'gt', x: 4, y: 2 }], walls: [...gapped.walls, { ...w8, id: 'cross', a: 'gs', b: 'gt', openings: [] }] }
      expect(closeGaps(crossed)).toBe(crossed)
      for (const u of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) expect(closeGaps(u), u.id).toBe(u)
    })
  })
})

/**
 * Session 19, core lane: a level with flush lines (heightM 0), the new zone / common kinds, a ramp and a screen standing
 * alone goes through the pure 3D / furnish / viewer parts without tripping, and a flush line builds nothing. The look
 * (zone floors, no ceiling outdoors, daylight, kerbs, the ramp's slope) is the 3D lane's.
 */
test('the roof lays a beam only over a wall that carries it: a room beside it, or reaching the storey top (never over a rooftop parapet by a void, a free-standing fin)', () => {
  const sides = (u: Unit, rooms: core.Room[], w: Unit['walls'][number]) => {
    const f = core.wallFrame(w, u.vertices)
    const off = w.thicknessM / 2 + 0.05
    const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
    return [1, -1].map((s) => core.roomAt({ x: mid.x + f.normal.x * off * s, y: mid.y + f.normal.y * off * s }, rooms, u))
  }
  /** walls the roof laid a beam over before (render.ts: not only among open zones; no cover over a flat or a rooftop) that carry none */
  const loose = (u: Unit) => {
    const rooms = core.deriveRooms(u)
    const top = storeyTop(u, rooms)
    const open = (r: core.Room | null) => !r || r.kind === 'shaft' || core.isOutdoor(r.kind)
    return u.walls
      .filter((w) => {
        const s = sides(u, rooms, w)
        return w.heightM > 0 && !(s.some((r) => r && core.isOutdoor(r.kind)) && s.every(open)) && !carriesRoof(w, s, u, rooms, top)
      })
      .map((w) => w.id)
  }
  // the flats keep every beam they had (a veranda's 1.1 m rail is the slab edge of the storey above)
  for (const u of [typeA, typeB, typeC, sheltechA, sheltechB]) expect(loose(u as unknown as Unit), (u as unknown as Unit).id).toEqual([])
  expect(loose(sheltechRoof as unknown as Unit)).toContain('w_parapet_n_3') // 1.1 m, between the north void and the open
  expect(loose(bananiRoof as unknown as Unit)).toEqual(expect.arrayContaining(['w_screen_w_1', 'w_fin_n_1', 'w_fin_n_2'])) // 2.1 m fins in the open
  expect(loose(bananiRoof as unknown as Unit)).not.toContain('w_fin_e') // 3 m: it reaches the storey top
  expect(loose(sheltechRoof as unknown as Unit).filter((id) => !/parapet|screen/.test(id))).toEqual([]) // the lobby, stair, machine room walls carry it
})

describe('a level with zones, flush lines and a free-standing screen', () => {
  const u = GROUND_SAMPLE
  const rooms = core.deriveRooms(u)
  const flush = u.walls.filter((w) => w.heightM === 0)

  test('a flush line has no solid (no mesh, no collision quad); the screen and the boundary wall do, at their heights', () => {
    expect(flush).toHaveLength(4)
    for (const w of flush) {
      expect(wallGeometry(w, u), w.id).toBeNull()
      expect(core.wallPieces(w, core.wallFrame(w, u.vertices).lengthM)).toEqual([])
    }
    const top = (id: string) => {
      const g = wallGeometry(u.walls.find((w) => w.id === id)!, u)!
      g.computeBoundingBox()
      return g.boundingBox!.max.y
    }
    expect(top('screen')).toBeCloseTo(2, 6)
    expect(top('b1')).toBeCloseTo(1.8, 6)
  })

  test('the pure passes run: nothing raised or gap-closed, skirting / daylight bake, furnish / finishes / spawn run', () => {
    expect(raiseHeads(u)).toBe(u)
    expect(closeGaps(u)).toBe(u)
    expect(skirtingRuns(u, rooms).length).toBeGreaterThan(0) // a flush line itself gets none (below SKIRTING_H)
    expect(() => bakeDaylight(u, rooms)).not.toThrow()
    expect(() => furnish(u, rooms)).not.toThrow()
    expect(() => finishSlotsFor(u, rooms)).not.toThrow()
    expect(() => entrySpawn(u, rooms)).not.toThrow()
  })

  test('levels: a wall stands on its LOWER floor, heightM from there; its openings on the higher floor (the riser under the door); a flat unit is untouched', () => {
    const lob = u.walls.find((w) => w.id === 'lob4')! // the lobby (+1.067) over the lawn (0), its door
    const l = wallLift(lob, u, rooms)
    expect(l.base[0]).toBeCloseTo(1.067, 6)
    expect(l.foot[0]).toBeCloseTo(0, 6)
    const lifted = liftedWall(lob, u, l)
    expect(lifted.openings[0].sillM).toBeCloseTo(1.067, 6) // the door opens at the lobby's floor
    const g = wallGeometry(lifted, u)!
    liftWall(g, lob, u, l)
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 6)
    expect(g.boundingBox!.max.y).toBeCloseTo(3, 6)
    liftWall(g, lob, u, l, 3.5) // under the slab above: its top reaches it
    expect(g.boundingBox!.max.y).toBeCloseTo(3.5, 6)
    // glazing to the wall's top between the two floors, under a slab higher than the wall: wall fills up to the slab (no open band)
    const glass = { ...lob, openings: [{ ...lob.openings[0], offsetM: 0, widthM: core.wallFrame(lob, u.vertices).lengthM, sillM: 0, heightM: 3 }] }
    const under = liftedWall(glass, u, l, 3.5)
    expect(under.heightM).toBeCloseTo(3.5, 6)
    expect(under.openings[0].sillM + under.openings[0].heightM).toBeCloseTo(3.5, 6) // the glass reaches the slab (it stopped at 3: an open band)
    expect(liftedWall(glass, u, l).heightM).toBe(3) // not under a slab: as before
    // glass shorter than the storey: the wall over it is really there (its head is a cut of the wall's own grid)
    const short = liftedWall({ ...glass, openings: [{ ...glass.openings[0], heightM: 2 }] }, u, l, 3.5)
    const sg = wallGeometry(short, u)!
    liftWall(sg, short, u, l, 3.5)
    expect(sg.boundingBox!.max.y).toBeCloseTo(3.5, 6)
    expect(roomCeiling(rooms.find((r) => r.id === 'Lobby')!, u, rooms)).toBeCloseTo(3, 6)
    const a = TEST_UNIT.walls[0]
    expect(wallLift(a, TEST_UNIT, core.deriveRooms(TEST_UNIT))).toEqual({ base: [0, 0], foot: [0, 0] })
    expect(storeyTop(TEST_UNIT, core.deriveRooms(TEST_UNIT))).toBe(Math.max(...TEST_UNIT.walls.map((w) => w.heightM)))
    expect(storeyTop(u, rooms)).toBeCloseTo(3, 6)
  })

  test('levels: a step along a flush line gets a riser on the line, from the lower floor to the upper, facing down-side', () => {
    const steps = stepFaces(u, rooms)
    // the lawn (0) beside the ramp (0 at its top → −1 at the far end): one triangle, the lawn above
    expect(steps).toHaveLength(1)
    const [{ room, geo }] = steps
    expect(room.id).toBe('Lawn')
    geo.computeBoundingBox()
    expect(geo.boundingBox!.max.y).toBeCloseTo(0, 6)
    expect(geo.boundingBox!.min.y).toBeCloseTo(-1, 6)
    const n = geo.attributes.normal
    expect(n.getX(0)).toBeGreaterThan(0.99) // toward the ramp (+x of the line x = 9)
    expect(stepFaces(TEST_UNIT, core.deriveRooms(TEST_UNIT))).toEqual([])
  })

  test.each([1.2, 2.1])("a %s m wall standing alone in type-a's living room: no issue, painted and skirted on both faces and both ends, its top capped", (h) => {
    const a = typeA as unknown as Unit
    const living = core.deriveRooms(a).find((r) => r.kind === 'living')!
    const c = living.centroid
    const u: Unit = {
      ...a,
      vertices: [...a.vertices, { id: 'fs1', x: c.x - 0.8, y: c.y }, { id: 'fs2', x: c.x + 0.8, y: c.y }],
      walls: [...a.walls, { id: 'fs', a: 'fs1', b: 'fs2', thicknessM: 0.127, heightM: h, openings: [], standsAlone: true }],
    }
    const issues = (x: Unit) => core.validate(x).map((i) => `${i.level} ${i.code}`).sort()
    expect(issues(u)).toEqual(issues(a))
    const rs = core.deriveRooms(u)
    const w = u.walls.find((x) => x.id === 'fs')!
    // both faces (probed as buildWall does) are the living room: its paint on each, its finish on the ends and the top
    const f = core.wallFrame(w, u.vertices)
    for (const s of [1, -1]) expect(core.roomAt({ x: c.x + f.normal.x * 0.12 * s, y: c.y + f.normal.y * 0.12 * s }, rs, u)?.id).toBe(living.id)
    const g = wallGeometry(w, u)!
    const edge = g.groups.find((x) => x.materialIndex === 2)!
    const p = g.attributes.position
    const ys: number[] = []
    const xs: number[] = []
    for (let i = edge.start; i < edge.start + edge.count; i++) [ys[ys.length], xs[xs.length]] = [p.getY(i), p.getX(i)]
    expect(ys.filter((y) => Math.abs(y - h) < 1e-6).length).toBeGreaterThanOrEqual(6) // the cap: a quad at the top
    expect(Math.min(...xs)).toBeCloseTo(c.x - 0.8, 6) // an end cap at each end
    expect(Math.max(...xs)).toBeCloseTo(c.x + 0.8, 6)
    const runs = skirtingRuns(u, rs).filter((r) => r.room.id === living.id && Math.abs(r.p.y + r.d.y * r.s0 - c.y) < 0.1 && Math.abs(r.p.x + r.d.x * ((r.s0 + r.s1) / 2) - c.x) < 0.9)
    expect(new Set(runs.map((r) => `${Math.round(r.n.x)},${Math.round(r.n.y)}`))).toEqual(new Set(['0,1', '0,-1', '1,0', '-1,0']))
  })

  test('a window to the floor ≥ 1.5 m tall is a glass wall: equal bays ≤ 1.4 m between mullions, no sill board, no curtain; a door ≥ 1.5 m is a pair of leaves', () => {
    const wall = { id: 'gw', a: 'p1', b: 'p2', thicknessM: 0.25, heightM: 3, openings: [] }
    const glass = { id: 'g', kind: 'window' as const, offsetM: 0.5, widthM: 6, heightM: 2.7, sillM: 0 }
    const g = buildOpening(glass, wall)
    const parts = g.children.map((c) => c.userData.id)
    expect(parts).toEqual(['g/frame', 'g/glass']) // no stone sill mesh
    const panes = (g.children[1].children[0] as THREE.Mesh).geometry.attributes.position.count / 24 // a box: 24 vertices
    expect(panes).toBe(Math.ceil((6 - 0.1) / 1.4))
    const living = core.deriveRooms(TEST_UNIT).find((r) => r.kind === 'living')!
    expect(curtainSides(glass, wall, TEST_UNIT, [living])).toEqual([])
    const leaves = (w: number) => {
      const d = buildOpening({ id: 'd', kind: 'door', offsetM: 0, widthM: w, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' }, wall)
      const n: string[] = []
      d.traverse((o) => o.userData.id === 'd/leaf' && n.push(o.userData.id))
      return n.length
    }
    expect(leaves(0.9)).toBe(1)
    expect(leaves(1.8)).toBe(2)
  })

  test('a gate: a passage in a 1.8 m boundary wall keeps the wall low (raiseHeads), is a clear gap to its top, no casing; a window there still raises it', () => {
    const gate = { id: 'gate', kind: 'passage' as const, offsetM: 3, widthM: 3, heightM: 2.1, sillM: 0 }
    const walls = u.walls.map((w) => (w.id === 'b7' ? { ...w, openings: [gate] } : w)) // b7: the 1.8 m boundary along the lawn
    const gated = { ...u, walls }
    expect(raiseHeads(gated)).toBe(gated)
    const b7 = walls.find((w) => w.id === 'b7')!
    expect(buildOpening(gate, b7).children).toHaveLength(0)
    expect(core.wallPieces(b7, core.wallFrame(b7, u.vertices).lengthM).every((p) => p.u1 <= 3 + 1e-9 || p.u0 >= 6 - 1e-9)).toBe(true)
    const win = { ...gated, walls: walls.map((w) => (w.id === 'b7' ? { ...w, openings: [{ ...gate, kind: 'window' as const, sillM: 0.9, heightM: 1.2 }] } : w)) }
    expect(raiseHeads(win).walls.find((w) => w.id === 'b7')!.heightM).toBeGreaterThan(1.8)
  })

  /** a w × d rectangle of flush lines (x right, y down) and extra faces / labels */
  const rect = (w: number, d: number, kind: core.RoomKind, name = 'P'): Unit => ({
    ...GROUND_SAMPLE,
    id: 'r',
    vertices: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: w, y: 0 }, { id: 'c', x: w, y: d }, { id: 'd', x: 0, y: d }],
    walls: (['ab', 'bc', 'cd', 'da'] as const).map((k) => ({ id: k, a: k[0], b: k[1], thicknessM: 0.2, heightM: 0, openings: [] })),
    roomLabels: [{ id: name, name, kind, x: w / 2, y: d / 2, levelM: -0.5 }],
    pillars: [],
  })

  test('a pool: 1.2 m deep when it is ≥ 1.5 m wide on average (2 × area / perimeter), else a 0.45 m water body; tiled walls facing in, water just under the rim', () => {
    for (const [w, d, deep] of [[4, 10, 1.2], [1, 6, 0.45], [3, 3, 1.2], [2, 2, 0.45]] as const) {
      const u = rect(w, d, 'pool')
      const [room] = core.deriveRooms(u)
      const { depth, walls, water } = poolBasin(room, u)
      expect(depth, `${w} × ${d}`).toBe(deep)
      walls.computeBoundingBox()
      expect(walls.boundingBox!.min.y).toBeCloseTo(-0.5 - deep, 6)
      expect(walls.boundingBox!.max.y).toBeCloseTo(-0.5, 6)
      const p = walls.attributes.position
      const n = walls.attributes.normal
      for (let i = 0; i < p.count; i += 3) {
        // every wall triangle faces the pool's middle
        const toC = { x: w / 2 - p.getX(i), z: d / 2 - p.getZ(i) }
        expect(n.getX(i) * toC.x + n.getZ(i) * toC.z).toBeGreaterThan(0)
      }
      water.computeBoundingBox()
      expect(water.boundingBox!.max.y).toBeCloseTo(-0.5 - WATER_DROP_M, 6)
      expect(water.attributes.normal.getY(0)).toBeCloseTo(1, 6)
    }
  })

  test('a sloped face steeper than 1:3 is a flight of steps (risers ≈ 0.16 m, first tread on the low floor, last on the high); a 1:8 ramp stays a plane', () => {
    const steps = (run: number, rise: number) => {
      const u = rect(3, run, 'paving')
      u.roomLabels = [{ ...u.roomLabels[0], levelM: 0, slope: { toLevelM: rise, dirDeg: 180 } }]
      const [room] = core.deriveRooms(u)
      return { flight: isSteps(room, u), g: stepGeometry(room, u) }
    }
    const { flight, g } = steps(2, 1)
    expect(flight).toBe(true)
    g!.computeBoundingBox()
    expect(g!.boundingBox!.min.y).toBeCloseTo(0, 6)
    expect(g!.boundingBox!.max.y).toBeCloseTo(1, 6)
    const p = g!.attributes.position
    const treads = new Set<number>()
    for (let i = 0; i < p.count; i++) if (g!.attributes.normal.getY(i) > 0.99) treads.add(+p.getY(i).toFixed(4))
    expect(treads.size).toBe(Math.round(1 / 0.16) + 1)
    expect(steps(8, 1)).toEqual({ flight: false, g: null })
  })

  test('parking paint: a line on every flush line bounding a bay; each numbered bay its number, reading from the aisle', () => {
    const u: Unit = {
      ...rect(7.5, 11, 'driveway', 'Drive'),
      vertices: [
        ...[0, 2.5, 5, 7.5].flatMap((x, i) => [{ id: `t${i}`, x, y: 0 }, { id: `m${i}`, x, y: 5 }]),
        { id: 'c', x: 7.5, y: 11 }, { id: 'd', x: 0, y: 11 },
      ],
      walls: [
        ...[0, 1, 2].map((i) => ({ id: `top${i}`, a: `t${i}`, b: `t${i + 1}`, thicknessM: 0.25, heightM: 3, openings: [] })),
        ...[0, 1, 2].map((i) => ({ id: `front${i}`, a: `m${i}`, b: `m${i + 1}`, thicknessM: 0.1, heightM: 0, openings: [] })),
        ...[1, 2].map((i) => ({ id: `sep${i}`, a: `t${i}`, b: `m${i}`, thicknessM: 0.1, heightM: 0, openings: [] })),
        { id: 'l0', a: 't0', b: 'm0', thicknessM: 0.25, heightM: 3, openings: [] }, { id: 'r0', a: 't3', b: 'm3', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'l1', a: 'm0', b: 'd', thicknessM: 0.25, heightM: 3, openings: [] }, { id: 'r1', a: 'm3', b: 'c', thicknessM: 0.25, heightM: 3, openings: [] },
        { id: 'bot', a: 'c', b: 'd', thicknessM: 0.25, heightM: 3, openings: [] },
      ],
      roomLabels: [
        { id: 'drive', name: 'Driveway', kind: 'driveway', x: 3.75, y: 8 },
        ...['12', 'B-7', 'Visitor'].map((name, i) => ({ id: `bay${i}`, name, kind: 'parking' as const, x: 1.25 + 2.5 * i, y: 2.5 })),
      ],
    }
    const { lines, numbers } = bayMarkings(u, core.deriveRooms(u))
    expect(lines).toHaveLength(5) // two separators + the three bays' fronts; the 3 m walls carry none
    expect(numbers.map((n) => n.text)).toEqual(['12', 'B-7']) // "Visitor" is no number
    for (const n of numbers) {
      expect(n.up.x).toBeCloseTo(0, 6)
      expect(n.up.y).toBeCloseTo(-1, 6) // from the aisle (y = 5) into the bay
    }
  })

  test('zones: no skirting in an outdoor zone (the lobby has its own), the lawn floor turf, its wall faces the exterior render', () => {
    const runs = skirtingRuns(u, rooms)
    expect(runs.some((r) => r.room.id === 'Lobby')).toBe(true)
    expect(runs.filter((r) => core.isOutdoor(r.room.kind))).toEqual([])
    expect(zoneFinishRef('lawn', 'floor')).toEqual({ kind: 'pbr', textureId: 'turf' })
    expect(zoneFinishRef('lawn', 'wall')).toBe(EXTERIOR_PLASTER)
    // a parking deck (a level whose every zone is under the slab above): cool grey painted walls and columns; else the render
    expect([zoneFinishRef('parking', 'wall', true), zoneFinishRef('driveway', 'wall', true)]).toEqual([DECK_PAINT, DECK_PAINT])
    expect([zoneFinishRef('parking', 'wall'), zoneFinishRef('parking', 'floor', true)]).toEqual([EXTERIOR_PLASTER, CONCRETE])
    for (const k of ['lawn', 'paving', 'driveway', 'parking', 'deck', 'pool', 'planter', 'play'] as const) expect(ZONE_FLOOR[k], k).toBeDefined()
  })
})
