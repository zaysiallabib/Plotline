/**
 * Architectural finishing: the wall solids (crack-free faces, reveals, L-corner fill), skirting,
 * thresholds (via buildOpening), curtains. Plan (x, y) → world (X, Z), Y up.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { FinishSlot, Graph, Id, Opening, Pillar, Pt, Room, RoomKind, Unit, Wall } from '../core'
import { materialFor } from './materials'
import { buildOpening, meterUVs } from './openings'

export const SKIRTING_H = 0.09
const SKIRTING_T = 0.012
const NO_SKIRTING: RoomKind[] = ['bath', 'balcony', 'shaft']
const CURTAIN_ROOMS: RoomKind[] = ['bed', 'living', 'dining', 'study']
/** Rooms that are open to the sky: a window onto one is an outside window. */
const OPEN_AIR: RoomKind[] = ['balcony', 'shaft']
const CURTAIN_FABRIC = { kind: 'pbr', textureId: 'fabric_curtain', tint: '#efe6d8' } as const

/**
 * One run of skirting (skirtingRuns): along the foot of a wall face, from world point `p` in direction `d` over
 * [s0, s1] metres, `n` pointing into the room whose floor tile it is. Runs on one plane never overlap (unioned per
 * room, clipped between rooms), so coplanar strips never fight.
 */
export interface SkirtingRun {
  room: Room
  p: Pt
  d: Pt
  n: Pt
  s0: number
  s1: number
}

const ROOM_PROBE_M = 0.05

/**
 * Skirting follows what is BUILT, not the room outline (founder, 2026-10-03: a traced jog that pokes 1 cm into a room
 * past the outline left a bare wall foot — "the tile places are left empty"). Every wall face, wall end and doorless
 * passage reveal that looks into a room (probed 5 cm out from its middle) gets a run of that room's floor tile, minus
 * the spans of doors / sliders (their frames reach the floor) and windows below skirting height; a passage keeps its
 * run on the face up to the jamb and the reveal carries it through, each half in its own room's tile. Runs are
 * extended past the face ends by the skirting depth (hidden in the wall at inside corners, closing outside ones), then
 * unioned per room and plane; where two rooms' runs overlap on one plane the longer room keeps the overlap. None in
 * bath / balcony / shaft. Low walls (below skirting height) and walls in no room get none.
 */
export function skirtingRuns(unit: Unit, rooms: Room[]): SkirtingRun[] {
  const raw: SkirtingRun[] = []
  const roomOf = (p: Pt) => {
    const r = core.roomAt(p, rooms, unit)
    return r && !NO_SKIRTING.includes(r.kind) ? r : null
  }
  for (const w of unit.walls) {
    if (w.heightM < SKIRTING_H) continue
    const f = core.wallFrame(w, unit.vertices)
    if (f.lengthM < 1e-3) continue
    const T2 = w.thicknessM / 2
    const at = (u: number, v: number): Pt => ({ x: f.origin.x + f.dir.x * u + f.normal.x * v, y: f.origin.y + f.dir.y * u + f.normal.y * v })
    const span = (o: Opening): [number, number] => [Math.max(0, o.offsetM), Math.min(f.lengthM, o.offsetM + o.widthM)]
    const cuts = w.openings
      .filter((o) => o.kind !== 'passage' && (o.kind !== 'window' || o.sillM < SKIRTING_H))
      .map(span)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0])
    const holes = w.openings.map(span).filter(([a, b]) => b > a)
    // the two faces, cut by doors / low windows; a passage leaves the face run (the jamb is where it turns)
    for (const side of [1, -1] as const) {
      const n = { x: f.normal.x * side, y: f.normal.y * side }
      const room = roomOf(at(f.lengthM / 2, side * (T2 + ROOM_PROBE_M)))
      if (!room) continue
      const p = at(0, side * T2)
      let s = -SKIRTING_T
      for (const [a, b] of cuts) {
        if (a - s > 0.01) raw.push({ room, p, d: f.dir, n, s0: s, s1: a })
        s = Math.max(s, b)
      }
      if (f.lengthM + SKIRTING_T - s > 0.01) raw.push({ room, p, d: f.dir, n, s0: s, s1: f.lengthM + SKIRTING_T })
    }
    // the two ends, across the thickness (an end that stands in a room: a stub, a jog, a wall ending at a passage)
    for (const end of [0, 1] as const) {
      const u = end ? f.lengthM : 0
      const out = { x: f.dir.x * (end ? 1 : -1), y: f.dir.y * (end ? 1 : -1) }
      const room = roomOf(at(u + (end ? 1 : -1) * ROOM_PROBE_M, 0))
      if (!room) continue
      raw.push({ room, p: at(u, -T2), d: f.normal, n: out, s0: -SKIRTING_T, s1: w.thicknessM + SKIRTING_T })
    }
    // passage reveals: the tile runs through, each half in the room on that side of the wall
    for (const o of w.openings) {
      if (o.kind !== 'passage') continue
      const [u0, u1] = span(o)
      for (const [u, into] of [[u0, 1], [u1, -1]] as const) {
        if (holes.some(([a, b]) => a < u - 1e-6 && u + 1e-6 < b)) continue // inside another opening: no reveal there
        const n = { x: f.dir.x * into, y: f.dir.y * into }
        for (const side of [1, -1] as const) {
          const room = roomOf(at(u + into * ROOM_PROBE_M, side * (T2 + ROOM_PROBE_M)))
          if (!room) continue
          // from the centre line to that face and past it by the depth (closes the outside corner with the face run)
          raw.push({ room, p: at(u, 0), d: { x: f.normal.x * side, y: f.normal.y * side }, n, s0: 0, s1: T2 + SKIRTING_T })
        }
      }
    }
  }
  return unionRuns(raw)
}

/** Same plane (normal + offset, to the mm) and canonical direction: runs there are intervals on one line. */
function unionRuns(raw: SkirtingRun[]): SkirtingRun[] {
  const q = (x: number) => Math.round(x * 1000)
  type Line = { d: Pt; n: Pt; o: Pt; byRoom: Map<Room, [number, number][]> }
  const lines = new Map<string, Line>()
  for (const r of raw) {
    const c = r.p.x * r.n.x + r.p.y * r.n.y // the plane's offset along its normal
    const key = `${q(r.n.x)},${q(r.n.y)},${q(c)}`
    let line = lines.get(key)
    // one direction per plane, from the first run's normal; every run's ends are projected onto it (a wall a hair off
    // axis must not pick a different direction than an exact one on the same plane: that mirrored its run)
    if (!line) lines.set(key, (line = { d: { x: -r.n.y, y: r.n.x }, n: r.n, o: { x: r.n.x * c, y: r.n.y * c }, byRoom: new Map() }))
    const t = (s: number) => (r.p.x + r.d.x * s) * line!.d.x + (r.p.y + r.d.y * s) * line!.d.y
    const [a, b] = [t(r.s0), t(r.s1)].sort((x, y) => x - y) as [number, number]
    line.byRoom.set(r.room, [...(line.byRoom.get(r.room) ?? []), [a, b]])
  }
  const out: SkirtingRun[] = []
  for (const line of lines.values()) {
    const merged = [...line.byRoom].map(([room, iv]) => {
      iv.sort((x, y) => x[0] - y[0])
      const u: [number, number][] = []
      for (const [a, b] of iv) {
        const last = u[u.length - 1]
        if (last && a <= last[1] + 1e-6) last[1] = Math.max(last[1], b)
        else u.push([a, b])
      }
      return { room, iv: u, total: u.reduce((s, [a, b]) => s + b - a, 0) }
    })
    merged.sort((x, y) => y.total - x.total)
    const taken: [number, number][] = []
    for (const { room, iv } of merged) {
      for (const [a0, b0] of iv) {
        // clip against what longer rooms already hold on this plane
        let parts: [number, number][] = [[a0, b0]]
        for (const [ta, tb] of taken) {
          parts = parts.flatMap(([a, b]): [number, number][] => (tb <= a || ta >= b ? [[a, b]] : ([[a, ta], [tb, b]] as [number, number][]).filter(([x, y]) => y - x > 0.005)))
        }
        for (const [x, y] of parts) {
          taken.push([x, y])
          out.push({ room, p: { x: line.o.x + line.d.x * x, y: line.o.y + line.d.y * x }, d: line.d, n: line.n, s0: 0, s1: y - x })
        }
      }
    }
  }
  return out
}

/**
 * 90 × 12 mm skirting, one merged mesh per room (non-pickable decoration), in metre UVs. No material: the caller gives it
 * the room's floor finish, as a Dhaka flat's skirting is a strip of its floor tile / stone / laminate. The white painted
 * trim it had vanished against white walls on a marble floor, so the wall–floor junction did not read.
 */
export function buildSkirtings(unit: Unit, rooms: Room[]): Map<Id, THREE.Mesh> {
  const byRoom = new Map<Id, THREE.BufferGeometry[]>()
  for (const r of skirtingRuns(unit, rooms)) {
    const len = r.s1 - r.s0
    const g = new THREE.BoxGeometry(len, SKIRTING_H, SKIRTING_T)
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(r.d.x, 0, r.d.y), new THREE.Vector3(0, 1, 0), new THREE.Vector3(r.n.x, 0, r.n.y))
    const mid = (r.s0 + r.s1) / 2
    m.setPosition(r.p.x + r.d.x * mid + (r.n.x * SKIRTING_T) / 2, SKIRTING_H / 2, r.p.y + r.d.y * mid + (r.n.y * SKIRTING_T) / 2)
    byRoom.set(r.room.id, [...(byRoom.get(r.room.id) ?? []), meterUVs(g.applyMatrix4(m))])
  }
  const out = new Map<Id, THREE.Mesh>()
  for (const [id, geoms] of byRoom) {
    const mesh = new THREE.Mesh(mergeGeometries(geoms)!)
    geoms.forEach((g) => g.dispose())
    mesh.receiveShadow = true
    out.set(id, mesh)
  }
  return out
}

/**
 * A window or door whose head is above its wall (a 1.1 m "railing" carrying a window, in older drafts) left the room
 * open to the sky above it: such a wall goes up to the storey (the unit's tallest wall, at least the head). A passage
 * is only a gap, so a low wall with one stays low. Unchanged units come back as the same object.
 */
export function raiseHeads(unit: Unit): Unit {
  const head = (w: Wall) => Math.max(0, ...w.openings.filter((o) => o.kind !== 'passage').map((o) => o.sillM + o.heightM))
  if (!unit.walls.some((w) => head(w) > w.heightM + 1e-6)) return unit
  const storey = Math.max(...unit.walls.map((w) => w.heightM))
  return { ...unit, walls: unit.walls.map((w) => (head(w) > w.heightM + 1e-6 ? { ...w, heightM: Math.max(storey, head(w)) } : w)) }
}

/** One part of a column (pillarParts): world-space geometry with metre UVs, and the room it faces (null: outside, the top). */
export interface PillarPart {
  geo: THREE.BufferGeometry
  room: Room | null
  part: 'face' | 'top' | 'skirting'
}

/**
 * A column (Unit.pillars): a box from the floor to `heightM`, 1 mm proud of its plan size so a face flush with a wall's
 * never z-fights it, and 1 cm over the wall tops (its top is edge plaster, pushed back in depth like theirs: at 1 mm the
 * walls' face edges below showed through it as hairlines in the dollhouse). Its four upright faces are each
 * finished as the room they look into (probed 5 cm out from the face's middle) and skirted there like buildSkirting
 * (none in bath / balcony / shaft); where the column stands in a wall, the faces and strips inside it are simply hidden.
 */
export function pillarParts(p: Pillar, heightM: number, unit: Unit, rooms: Room[]): PillarPart[] {
  const [hx, hy, top] = [p.wM / 2 + 0.001, p.hM / 2 + 0.001, heightM + 0.01]
  const out: PillarPart[] = [{ geo: meterUVs(new THREE.PlaneGeometry(2 * hx, 2 * hy).rotateX(-Math.PI / 2).translate(p.x, top, p.y)), room: null, part: 'top' }]
  for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const [half, off] = nx ? [hy, hx] : [hx, hy]
    const c = { x: p.x + nx * off, y: p.y + ny * off }
    const room = core.roomAt({ x: c.x + nx * 0.05, y: c.y + ny * 0.05 }, rooms, unit)
    const yaw = Math.atan2(nx, ny) // a plane facing +Z turned to face (nx, 0, ny)
    out.push({ geo: meterUVs(new THREE.PlaneGeometry(2 * half, top).rotateY(yaw).translate(c.x, top / 2, c.y)), room, part: 'face' })
    if (!room || NO_SKIRTING.includes(room.kind)) continue
    const strip = new THREE.BoxGeometry(2 * (half + SKIRTING_T), SKIRTING_H, SKIRTING_T).rotateY(yaw) // past both corners: closes them
    out.push({ geo: meterUVs(strip.translate(c.x + (nx * SKIRTING_T) / 2, SKIRTING_H / 2, c.y + (ny * SKIRTING_T) / 2)), room, part: 'skirting' })
  }
  return out
}

/** The floor finish slot a room belongs to (a slot naming the room beats an 'all' slot); null outside the unit. */
export function floorSlotId(slots: FinishSlot[], roomId: Id | undefined): Id | null {
  if (!roomId) return null
  const floor = slots.filter((s) => s.target === 'floor')
  return (floor.find((s) => s.roomIds !== 'all' && s.roomIds.includes(roomId)) ?? floor.find((s) => s.roomIds === 'all'))?.id ?? null
}

/** The rooms on either face of an opening: [front (+normal), back]; null = outside the unit. */
function openingRooms(o: Opening, wall: Wall, unit: Unit, rooms: Room[]): [Room | null, Room | null] {
  const f = core.wallFrame(wall, unit.vertices)
  const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
  const off = wall.thicknessM / 2 + 0.05
  const probe = (s: number) => core.roomAt({ x: c.x + f.normal.x * off * s, y: c.y + f.normal.y * off * s }, rooms, unit)
  return [probe(1), probe(-1)]
}

/**
 * The faces of a window that get curtains: a bed/living/dining/study face whose other side is open air (outside
 * the unit, a balcony or a shaft) — never an interior glass partition between two rooms.
 */
export function curtainSides(o: Opening, wall: Wall, unit: Unit, rooms: Room[]): [Room, 1 | -1][] {
  if (o.kind !== 'window') return []
  const [front, back] = openingRooms(o, wall, unit, rooms)
  const open = (r: Room | null) => !r || OPEN_AIR.includes(r.kind)
  const out: [Room, 1 | -1][] = []
  if (front && CURTAIN_ROOMS.includes(front.kind) && open(back)) out.push([front, 1])
  if (back && CURTAIN_ROOMS.includes(back.kind) && open(front)) out.push([back, -1])
  return out
}

/**
 * Everything that dresses one opening, in the wall's local frame: the joinery (picked as the opening),
 * plus curtains (curtainSides).
 */
export function dressOpening(o: Opening, wall: Wall, unit: Unit, rooms: Room[]): THREE.Object3D[] {
  const [front, back] = openingRooms(o, wall, unit, rooms)
  const firstDoor = unit.walls.flatMap((w) => w.openings).find((x) => x.kind === 'door')
  const out: THREE.Object3D[] = [
    buildOpening(o, wall, {
      main: o.kind === 'door' && (o === firstDoor || o.widthM >= 1),
      front: !!front,
      back: !!back,
      threshold: floorSlotId(unit.finishSlots, front?.id) !== floorSlotId(unit.finishSlots, back?.id),
    }),
  ]
  for (const [room, side] of curtainSides(o, wall, unit, rooms)) out.push(buildCurtain(o, wall, side, room, unit))
  return out
}

/**
 * Floor-to-ceiling curtain pair drawn open to the sides of a window, on a slim rod, 0.1 m in front of the
 * `side` face and hung 0.1 m below the wall top. The rod reaches 0.24 m past each reveal (≈0.15 m of curtain
 * overhang + finial), less where a side wall or another window's rod is closer (see reach); ball finials and an end
 * bracket (wall rose, arm, cradle) at each end. Each panel is stacked back over 18 % of the window, so the
 * middle 64 % stays open (at 30 % the panels cut every sun patch to a strip). One mesh (rod coloured via vertex
 * colours), picked as furniture.
 */
export function buildCurtain(o: Opening, wall: Wall, side: 1 | -1, room: Room, graph: Graph): THREE.Mesh {
  const wc = side * (wall.thicknessM / 2 + 0.1)
  const top = wall.heightM - 0.1
  const bottom = 0.015
  const ph = top - bottom
  const f = core.wallFrame(wall, graph.vertices)
  const inner = core.roomInnerPolygon(room, graph)
  const at = (u: number) => ({ x: f.origin.x + f.dir.x * u + f.normal.x * wc, y: f.origin.y + f.dir.y * u + f.normal.y * wc })
  // every other window of the room carries a rod 0.1 m off its wall face, reaching ≤ 0.24 m past its reveals (finial
  // included, 0.4 m of reach counted): keep 6 cm off its line, so two corner rods end apart, not finial to finial
  const rods = room.wallIds.flatMap((id) => {
    const w = graph.walls.find((x) => x.id === id)
    return w ? w.openings.filter((x) => x.kind === 'window' && x !== o).map((x) => ({ x, w, g: core.wallFrame(w, graph.vertices) })) : []
  })
  const nearRod = (p: Pt) =>
    rods.some(({ x, w, g }) => {
      const v = { x: p.x - g.origin.x, y: p.y - g.origin.y }
      const along = v.x * g.dir.x + v.y * g.dir.y
      return Math.abs(v.x * g.normal.x + v.y * g.normal.y) < w.thicknessM / 2 + 0.16 && along > x.offsetM - 0.4 && along < x.offsetM + x.widthM + 0.4
    })
  // the rod end stops 10 cm short of a side wall (its finial 8 cm) and clear of the next rod, back inside the reveal if it must
  const reach = (from: number, dir: number) => {
    let d = -Math.min(0.3, 0.3 * o.widthM)
    while (d < 0.24 && core.pointInPolygon(at(from + dir * (d + 0.11)), inner) && !nearRod(at(from + dir * (d + 0.01)))) d += 0.01
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
    [left + 0.07, Math.max(left + 0.15, o.offsetM + 0.18 * o.widthM), 0],
    [Math.min(right - 0.15, o.offsetM + 0.82 * o.widthM), right - 0.07, 1.7],
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
  // rod with ball finials on collars, and an end bracket just inside each finial: wall rose, arm, cradle
  const rodY = top + 0.035
  const along = (g: THREE.BufferGeometry, u: number, w: number) => g.rotateZ(Math.PI / 2).translate(u, rodY, w)
  const toWall = (g: THREE.BufferGeometry, u: number, w: number) => g.rotateX(Math.PI / 2).translate(u, rodY, w)
  const rodParts = [along(new THREE.CylinderGeometry(0.011, 0.011, right - left, 12), (left + right) / 2, wc)]
  for (const [u, s] of [
    [left, 1],
    [right, -1],
  ]) {
    rodParts.push(
      new THREE.SphereGeometry(0.024, 14, 10).translate(u, rodY, wc),
      along(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), u + s * 0.03, wc),
      toWall(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), u + s * 0.07, side * (wall.thicknessM / 2 + 0.006)),
      toWall(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), u + s * 0.07, wc - side * 0.05),
      along(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 12), u + s * 0.07, wc),
    )
  }
  for (const g of rodParts) geoms.push(paint(meterUVs(g), 0.07))
  const mat = materialFor(CURTAIN_FABRIC)
  mat.side = THREE.DoubleSide
  mat.vertexColors = true
  const mesh = new THREE.Mesh(mergeGeometries(geoms)!, mat)
  geoms.forEach((g) => g.dispose())
  mesh.castShadow = mesh.receiveShadow = true
  mesh.userData = { kind: 'furniture', id: `${o.id}:curtain`, roomId: room.id, label: 'Curtains', objectKind: 'curtain' }
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
 * Non-indexed; groups: 0 = +normal face, 1 = −normal face, 2 = wall ends and tops. Opening reveals (jambs, heads,
 * sills) go into face group `reveals` (the caller passes the exterior side's, so they stay exterior plaster): unlike
 * an end cap they share every edge with the faces and have no depth tie to lose, and no extra group = no extra draw call.
 */
export function wallGeometry(wall: Wall, graph: Pick<Unit, 'vertices' | 'walls'>, reveals: 0 | 1 = 0): THREE.BufferGeometry | null {
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
      if (!solid(i - 1, j)) quad(i ? reveals : 2, neg(d), at(u0, v0, T2), at(u0, v0, -T2), at(u0, v1, -T2), at(u0, v1, T2))
      if (!solid(i + 1, j)) quad(i + 2 < us.length ? reveals : 2, d, at(u1, v0, T2), at(u1, v0, -T2), at(u1, v1, -T2), at(u1, v1, T2))
      if (!solid(i, j - 1) && v0 > 0) quad(reveals, [0, -1, 0], at(u0, v0, T2), at(u1, v0, T2), at(u1, v0, -T2), at(u0, v0, -T2))
      if (!solid(i, j + 1)) quad(v1 < H ? reveals : 2, [0, 1, 0], at(u0, v1, T2), at(u1, v1, T2), at(u1, v1, -T2), at(u0, v1, -T2))
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
