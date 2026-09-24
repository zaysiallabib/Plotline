/**
 * Architectural finishing: skirting, thresholds (via buildOpening), curtains, and the corner fill
 * that closes the notch two box walls leave at an L-corner. Plan (x, y) → world (X, Z), Y up.
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

/**
 * Two box walls meeting at a degree-2, non-collinear vertex leave a notch on the outside of the turn.
 * Returns the prism that fills it (its two outer faces + top) in `wall`'s local frame (u along a→b, v up,
 * w along the normal), emitted only by the earlier of the two walls in unit order. Index layout:
 * 12 indices of outer faces (material group `side`: 0 = +normal face, 1 = −normal), then 6 of top.
 */
export function cornerFills(wall: Wall, graph: Pick<Unit, 'vertices' | 'walls'>): { geometry: THREE.BufferGeometry; side: 0 | 1 }[] {
  const out: { geometry: THREE.BufferGeometry; side: 0 | 1 }[] = []
  const f = core.wallFrame(wall, graph.vertices)
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
    const h = Math.min(wall.heightM, other.heightM)
    const pos: number[] = []
    const nor: number[] = []
    const quad = (P: Pt, Q: Pt, m: Pt) => {
      // vertical face P→Q facing m; triangle (P0, Q0, Q1) faces (−e.w, e.u)
      if (-(Q.y - P.y) * m.x + (Q.x - P.x) * m.y < 0) [P, Q] = [Q, P]
      pos.push(P.x, 0, P.y, Q.x, 0, Q.y, Q.x, h, Q.y, P.x, h, P.y)
      for (let i = 0; i < 4; i++) nor.push(m.x, 0, m.y)
    }
    quad(P1, P2, { x: sA * nA.x, y: sA * nA.y })
    quad(P2, P3, { x: sB * nB.x, y: sB * nB.y })
    // top (V, P1, P2, P3), wound to face +v
    const ring = [V, P1, P2, P3]
    const up = (P1.y - V.y) * (P2.x - V.x) - (P1.x - V.x) * (P2.y - V.y) > 0
    for (const P of up ? ring : [...ring].reverse()) pos.push(P.x, h, P.y)
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(24).fill(0), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11])
    out.push({ geometry: meterUVs(geometry), side: sA * nA.y > 0 ? 0 : 1 })
  }
  return out
}
