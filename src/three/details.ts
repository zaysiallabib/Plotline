/**
 * Architectural finishing: the wall solids (crack-free faces, reveals, L-corner fill), skirting,
 * thresholds (via buildOpening), curtains. Plan (x, y) → world (X, Z), Y up.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { FinishSlot, Graph, Id, Opening, Pt, Room, RoomKind, Unit, Wall } from '../core'
import { materialFor } from './materials'
import { buildOpening, meterUVs } from './openings'

export const SKIRTING_H = 0.09
const SKIRTING_T = 0.012
const NO_SKIRTING: RoomKind[] = ['bath', 'balcony', 'shaft']
const CURTAIN_ROOMS: RoomKind[] = ['bed', 'living', 'dining', 'study']
const SKIRTING_PAINT = { kind: 'color', color: '#f2f0ea', roughness: 0.35 } as const
const CURTAIN_FABRIC = { kind: 'pbr', textureId: 'fabric_curtain', tint: '#efe6d8' } as const

/** Along inner-polygon edge `edge` (from its start vertex, metres): skirting runs over [s0, s1]; the edge is `len` long. */
export interface SkirtingSpan {
  edge: number
  s0: number
  s1: number
  len: number
}

/**
 * Which stretches of a room's finished inner faces get skirting: every inner edge minus the spans of
 * its wall's doors/passages (and windows that reach below skirting height). None in bath/balcony/shaft.
 */
export function skirtingSpans(room: Room, graph: Graph): SkirtingSpan[] {
  if (NO_SKIRTING.includes(room.kind)) return []
  const inner = core.roomInnerPolygon(room, graph)
  const out: SkirtingSpan[] = []
  inner.forEach((p, i) => {
    const q = inner[(i + 1) % inner.length]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const wall = graph.walls.find((w) => w.id === room.wallIds[i])
    if (len < 1e-3 || !wall) return
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const f = core.wallFrame(wall, graph.vertices)
    const along = (u: number) => (f.origin.x + f.dir.x * u - p.x) * d.x + (f.origin.y + f.dir.y * u - p.y) * d.y
    const cuts = wall.openings
      .filter((o) => o.kind !== 'window' || o.sillM < SKIRTING_H)
      .map((o) => [along(o.offsetM), along(o.offsetM + o.widthM)].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0])
    let s = 0
    for (const [a, b] of cuts) {
      if (Math.min(a, len) - s > 0.01) out.push({ edge: i, s0: s, s1: Math.min(a, len), len })
      s = Math.max(s, b)
    }
    if (len - s > 0.01) out.push({ edge: i, s0: s, s1: len, len })
  })
  return out
}

/** 90 × 12 mm painted skirting, one merged mesh per room (non-pickable decoration). */
export function buildSkirting(room: Room, graph: Graph): THREE.Mesh | null {
  const spans = skirtingSpans(room, graph)
  if (!spans.length) return null
  const inner = core.roomInnerPolygon(room, graph)
  const geoms = spans.map(({ edge, s0, s1, len }) => {
    const p = inner[edge]
    const q = inner[(edge + 1) % inner.length]
    const d = { x: (q.x - p.x) / len, y: (q.y - p.y) / len }
    const n = { x: -d.y, y: d.x } // room interior (loops are positive)
    // run past a corner by the skirting depth: hidden in the wall at inside corners, closes outside corners
    const a = s0 < 1e-6 ? -SKIRTING_T : s0
    const b = s1 > len - 1e-6 ? len + SKIRTING_T : s1
    const g = new THREE.BoxGeometry(b - a, SKIRTING_H, SKIRTING_T)
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(d.x, 0, d.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(n.x, 0, n.y))
    const mid = (a + b) / 2
    m.setPosition(p.x + d.x * mid + (n.x * SKIRTING_T) / 2, SKIRTING_H / 2, p.y + d.y * mid + (n.y * SKIRTING_T) / 2)
    return g.applyMatrix4(m)
  })
  const mesh = new THREE.Mesh(mergeGeometries(geoms)!, materialFor(SKIRTING_PAINT))
  geoms.forEach((g) => g.dispose())
  mesh.receiveShadow = true
  return mesh
}

/** The floor finish slot a room belongs to (a slot naming the room beats an 'all' slot); null outside the unit. */
export function floorSlotId(slots: FinishSlot[], roomId: Id | undefined): Id | null {
  if (!roomId) return null
  const floor = slots.filter((s) => s.target === 'floor')
  return (floor.find((s) => s.roomIds !== 'all' && s.roomIds.includes(roomId)) ?? floor.find((s) => s.roomIds === 'all'))?.id ?? null
}

/**
 * Everything that dresses one opening, in the wall's local frame: the joinery (picked as the opening),
 * plus curtains on each window side that faces a bed/living/dining/study room.
 */
export function dressOpening(o: Opening, wall: Wall, unit: Unit, rooms: Room[]): THREE.Object3D[] {
  const f = core.wallFrame(wall, unit.vertices)
  const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
  const off = wall.thicknessM / 2 + 0.05
  const probe = (s: number) => core.roomAt({ x: c.x + f.normal.x * off * s, y: c.y + f.normal.y * off * s }, rooms, unit)
  const front = probe(1)
  const back = probe(-1)
  const firstDoor = unit.walls.flatMap((w) => w.openings).find((x) => x.kind === 'door')
  const out: THREE.Object3D[] = [
    buildOpening(o, wall, {
      main: o.kind === 'door' && (o === firstDoor || o.widthM >= 1),
      front: !!front,
      back: !!back,
      threshold: floorSlotId(unit.finishSlots, front?.id) !== floorSlotId(unit.finishSlots, back?.id),
    }),
  ]
  if (o.kind === 'window') {
    for (const [room, side] of [
      [front, 1],
      [back, -1],
    ] as const) {
      if (room && CURTAIN_ROOMS.includes(room.kind)) out.push(buildCurtain(o, wall, side, room, unit))
    }
  }
  return out
}

/**
 * Floor-to-ceiling curtain pair drawn open to the sides of a window, on a slim rod, 0.1 m in front of the
 * `side` face and hung 0.1 m below the wall top. The rod reaches 0.24 m past each reveal (≈0.15 m of curtain
 * overhang + finial), less where a side wall is closer; each panel then covers 30 % of the window, so the middle
 * 40 % stays open. One mesh (rod coloured via vertex colours), picked as furniture.
 */
export function buildCurtain(o: Opening, wall: Wall, side: 1 | -1, room: Room, graph: Graph): THREE.Mesh {
  const wc = side * (wall.thicknessM / 2 + 0.1)
  const top = wall.heightM - 0.1
  const bottom = 0.015
  const ph = top - bottom
  const f = core.wallFrame(wall, graph.vertices)
  const inner = core.roomInnerPolygon(room, graph)
  const inside = (u: number) =>
    core.pointInPolygon({ x: f.origin.x + f.dir.x * u + f.normal.x * wc, y: f.origin.y + f.dir.y * u + f.normal.y * wc }, inner)
  const reach = (from: number, dir: number) => {
    let d = 0
    while (d < 0.24 && inside(from + dir * (d + 0.04))) d += 0.01
    return d
  }
  const left = o.offsetM - reach(o.offsetM, -1)
  const right = o.offsetM + o.widthM + reach(o.offsetM + o.widthM, 1)
  const geoms: THREE.BufferGeometry[] = []
  const paint = (g: THREE.BufferGeometry, v: number) => {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(v), 3))
    return g
  }
  for (const [u0, u1, phase] of [
    [left + 0.07, o.offsetM + 0.3 * o.widthM, 0],
    [o.offsetM + 0.7 * o.widthM, right - 0.07, 1.7],
  ]) {
    const pw = u1 - u0
    const folds = Math.max(3, Math.round(pw / 0.11))
    const g = new THREE.PlaneGeometry(pw, ph, folds * 10, 8)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + pw / 2
      const hang = (ph / 2 - p.getY(i)) / ph // 0 at the rod, 1 at the hem: folds flare slightly toward the floor
      const k = (2 * Math.PI * folds * x) / pw + 0.5 * Math.sin((2 * Math.PI * x) / (0.43 * pw) + phase) // uneven fold spacing
      p.setZ(i, 0.028 * (1 + 0.35 * hang) * (Math.sin(k) + 0.2 * Math.sin(2.3 * k + phase)))
    }
    g.computeVertexNormals()
    g.translate(u0 + pw / 2, bottom + ph / 2, wc)
    geoms.push(paint(meterUVs(g), 1))
  }
  // rod with finials, two wall brackets
  const rodY = top + 0.035
  const rod = new THREE.CylinderGeometry(0.011, 0.011, right - left, 12).rotateZ(Math.PI / 2).translate((left + right) / 2, rodY, wc)
  const ends = [left, right].map((u) => new THREE.SphereGeometry(0.02, 12, 8).translate(u, rodY, wc))
  const brackets = [left + 0.05, right - 0.05].map((u) =>
    new THREE.CylinderGeometry(0.006, 0.006, 0.1, 8).rotateX(Math.PI / 2).translate(u, rodY, wc - side * 0.05),
  )
  for (const g of [rod, ...ends, ...brackets]) geoms.push(paint(meterUVs(g), 0.07))
  const mat = materialFor(CURTAIN_FABRIC)
  mat.side = THREE.DoubleSide
  mat.vertexColors = true
  const mesh = new THREE.Mesh(mergeGeometries(geoms)!, mat)
  geoms.forEach((g) => g.dispose())
  mesh.castShadow = mesh.receiveShadow = true
  mesh.userData = { kind: 'furniture', id: `${o.id}:curtain`, roomId: room.id }
  return mesh
}

type V3 = [number, number, number]

/**
 * World point (plan x, y → X, Z) at u along `wall` from vertex a, height v, w along its normal. (1 − t)·a + t·b
 * is exact at both ends, so every wall at a shared vertex computes that corner from the same numbers.
 */
function wallPoint(wall: Wall, graph: Pick<Unit, 'vertices'>): (u: number, v: number, w: number) => V3 {
  const f = core.wallFrame(wall, graph.vertices)
  const [a, b] = [core.vertexById(graph.vertices, wall.a), core.vertexById(graph.vertices, wall.b)]
  return (u, v, w) => {
    const t = u / f.lengthM
    return [(1 - t) * a.x + t * b.x + w * f.normal.x, v, (1 - t) * a.y + t * b.y + w * f.normal.y]
  }
}

/**
 * One wall's solid in WORLD space, crack-free where it meets itself and its neighbours: faces are a grid over
 * the wall's opening edges (u) × every sill/head/wall height in the unit (v), so no cell corner ever sits
 * mid-edge of another cell (T-junction) — within the wall or across a shared vertex — and corners are
 * bit-identical between walls (wallPoint; all walls share the identity transform). A per-piece box in a
 * per-wall frame left sub-pixel gaps that showed the end caps behind as hairlines.
 * Also: reveals/soffits, end caps, top, and the prism closing the notch two walls leave at an L-corner
 * (emitted by the earlier wall). UVs in metres, world-aligned, so textures run on across walls.
 * Non-indexed; groups: 0 = +normal face, 1 = −normal face, 2 = edges/reveals/tops.
 */
export function wallGeometry(wall: Wall, graph: Pick<Unit, 'vertices' | 'walls'>): THREE.BufferGeometry | null {
  const f = core.wallFrame(wall, graph.vertices)
  const pieces = core.wallPieces(wall, f.lengthM)
  if (!pieces.length) return null
  const H = wall.heightM
  const T2 = wall.thicknessM / 2
  const at = wallPoint(wall, graph)
  const levels = graph.walls.flatMap((w) => [w.heightM, ...w.openings.flatMap((o) => [o.sillM, o.sillM + o.heightM])])
  const cuts = (top: number) => [...new Set([0, top, ...levels.filter((v) => v > 0 && v < top)])].sort((a, b) => a - b)
  const us = [...new Set(pieces.flatMap((p) => [p.u0, p.u1]))].sort((a, b) => a - b)
  const vs = cuts(H)
  const pos: number[][] = [[], [], []]
  const nor: number[][] = [[], [], []]
  const quad = (g: number, m: V3, ...q: V3[]) => {
    const [e, k] = [0, 1].map((i) => q[i + 1].map((c, j) => c - q[0][j]))
    if ((e[1] * k[2] - e[2] * k[1]) * m[0] + (e[2] * k[0] - e[0] * k[2]) * m[1] + (e[0] * k[1] - e[1] * k[0]) * m[2] < 0) q.reverse()
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos[g].push(...q[i])
      nor[g].push(...m)
    }
  }
  const solid = (i: number, j: number) => {
    const u = (us[i] + us[i + 1]) / 2
    const v = (vs[j] + vs[j + 1]) / 2
    return i >= 0 && j >= 0 && i < us.length - 1 && j < vs.length - 1 && pieces.some((p) => p.u0 < u && u < p.u1 && p.v0 < v && v < p.v1)
  }
  const [n, d]: V3[] = [[f.normal.x, 0, f.normal.y], [f.dir.x, 0, f.dir.y]]
  const neg = (m: V3): V3 => [-m[0], -m[1], -m[2]]
  for (let i = 0; i + 1 < us.length; i++) {
    for (let j = 0; j + 1 < vs.length; j++) {
      if (!solid(i, j)) continue
      const [u0, u1, v0, v1] = [us[i], us[i + 1], vs[j], vs[j + 1]]
      quad(0, n, at(u0, v0, T2), at(u1, v0, T2), at(u1, v1, T2), at(u0, v1, T2))
      quad(1, neg(n), at(u0, v0, -T2), at(u1, v0, -T2), at(u1, v1, -T2), at(u0, v1, -T2))
      if (!solid(i - 1, j)) quad(2, neg(d), at(u0, v0, T2), at(u0, v0, -T2), at(u0, v1, -T2), at(u0, v1, T2))
      if (!solid(i + 1, j)) quad(2, d, at(u1, v0, T2), at(u1, v0, -T2), at(u1, v1, -T2), at(u1, v1, T2))
      if (!solid(i, j - 1) && v0 > 0) quad(2, [0, -1, 0], at(u0, v0, T2), at(u1, v0, T2), at(u1, v0, -T2), at(u0, v0, -T2))
      if (!solid(i, j + 1)) quad(2, [0, 1, 0], at(u0, v1, T2), at(u1, v1, T2), at(u1, v1, -T2), at(u0, v1, -T2))
    }
  }

  // L-corner notch: two box walls meeting at a degree-2, non-collinear vertex leave it open on the outside of the turn
  const me = graph.walls.indexOf(wall)
  for (const end of ['a', 'b'] as const) {
    const vid = wall[end]
    const others = graph.walls.filter((w) => w !== wall && (w.a === vid || w.b === vid))
    if (others.length !== 1 || graph.walls.indexOf(others[0]) < me) continue
    const other = others[0]
    const g = core.wallFrame(other, graph.vertices)
    // local 2D (u, w): this wall runs along (1, 0), its normal is (0, 1)
    const V: Pt = { x: end === 'a' ? 0 : f.lengthM, y: 0 }
    const dA: Pt = { x: end === 'a' ? -1 : 1, y: 0 } // into the vertex
    const away = other.a === vid ? 1 : -1
    const dB: Pt = { x: away * (g.dir.x * f.dir.x + g.dir.y * f.dir.y), y: away * (g.dir.x * f.normal.x + g.dir.y * f.normal.y) }
    const cr = dA.x * dB.y - dA.y * dB.x
    if (Math.abs(cr) < 0.05) continue // collinear: no notch
    const rot = (v: Pt): Pt => ({ x: -v.y, y: v.x })
    const nA = rot(dA)
    const nB = rot(dB)
    const sA = dB.x * nA.x + dB.y * nA.y > 0 ? -1 : 1 // outer side of this wall: away from the other wall
    const sB = dA.x * nB.x + dA.y * nB.y > 0 ? 1 : -1 // outer side of the other wall: away from this one
    const P1 = { x: V.x + (sA * nA.x * wall.thicknessM) / 2, y: V.y + (sA * nA.y * wall.thicknessM) / 2 }
    const P3 = { x: V.x + (sB * nB.x * other.thicknessM) / 2, y: V.y + (sB * nB.y * other.thicknessM) / 2 }
    const t = ((P3.x - P1.x) * dB.y - (P3.y - P1.y) * dB.x) / cr
    if (Math.abs(t) > 1) continue // hairpin angle: the mitre would spike
    const P2 = { x: P1.x + t * dA.x, y: P1.y + t * dA.y }
    // world: P1 on this wall's face, P3 on the other's (its own wallPoint, nB = away · its normal): exact seams
    const atB = wallPoint(other, graph)
    const uB = other.a === vid ? 0 : g.lengthM
    const wB = (sB * away * other.thicknessM) / 2
    const side = sA * nA.y > 0 ? 0 : 1
    const mA: V3 = [sA * nA.y * f.normal.x, 0, sA * nA.y * f.normal.y]
    const mB: V3 = [sB * away * g.normal.x, 0, sB * away * g.normal.y]
    const fv = cuts(Math.min(H, other.heightM))
    for (let j = 0; j + 1 < fv.length; j++) {
      const [v0, v1] = [fv[j], fv[j + 1]]
      quad(side, mA, at(P1.x, v0, P1.y), at(P2.x, v0, P2.y), at(P2.x, v1, P2.y), at(P1.x, v1, P1.y))
      quad(side, mB, at(P2.x, v0, P2.y), atB(uB, v0, wB), atB(uB, v1, wB), at(P2.x, v1, P2.y))
    }
    const h = fv[fv.length - 1]
    quad(2, [0, 1, 0], at(V.x, h, 0), at(P1.x, h, P1.y), at(P2.x, h, P2.y), atB(uB, h, wB))
  }

  const geo = new THREE.BufferGeometry()
  const P = pos.flat()
  const N = nor.flat()
  const uv: number[] = []
  for (let i = 0; i < P.length; i += 3) {
    // horizontal faces map plan (X, Z); vertical ones (along-face axis · plan, Y), axis sign fixed so coplanar faces agree
    let [ax, az] = [-N[i + 2], N[i]]
    if (ax < 0 || (ax === 0 && az < 0)) [ax, az] = [-ax, -az]
    if (Math.abs(N[i + 1]) > 0.5) uv.push(P[i], P[i + 2])
    else uv.push(ax * P[i] + az * P[i + 2], P[i + 1])
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  let start = 0
  pos.forEach((p, g) => {
    geo.addGroup(start, p.length / 3, g)
    start += p.length / 3
  })
  return geo
}
