/**
 * Building view: the whole demo tower around the current flat. Every other flat is a SHELL — its traced walls
 * (wallGeometry: openings cut) and a floor plate, merged into one mesh per flat per floor; windows and sliders are
 * plain dark panes (one merged mesh, no shadows), doors stay as voids. No furniture, lights or ceilings. The ground
 * floor and rooftop are boxes and planes (data/building/demo-tower.ts); the lift/stair core walls run through both.
 *
 * Frame: the current flat stays where it is (its floor at y = 0, plan = world X/Z), the tower is placed around it:
 * a flat's plan point p lands at p + offset(flat) − offset(current), floor k at (k − current floor) · FLOOR_M.
 * The current flat itself is the furnished unit; here it only gets an invisible pick proxy and the bit of plate
 * under Look's slab.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { MaterialRef, Pt, Room, Unit, Wall } from '../core'
import { CORE, FLATS, FLOOR_M, FLOORS, GROUND, ROOF, type Rect } from '../data/building/demo-tower'
import { buildStreet } from './context'
import { wallGeometry } from './details'
import { EXTERIOR_PLASTER, materialFor } from './materials'
import { GLASS } from './openings'

/** the traced flats' walls are 3.0 m: the plate fills the storey above them */
const WALL_M = 3
const PLATE_M = FLOOR_M - WALL_M
/** Look's slab under the current flat (render.ts SLAB_M) */
const LOOK_SLAB = 0.15
const UP = new THREE.Vector3(0, 1, 0)
const PAVING: MaterialRef = { kind: 'color', color: '#9d988f', roughness: 0.9 }
const GREEN: MaterialRef = { kind: 'color', color: '#56703d', roughness: 1 }
const ASPHALT: MaterialRef = { kind: 'color', color: '#5b5955', roughness: 0.95 }
const PAINT: MaterialRef = { kind: 'color', color: '#e8e6e0', roughness: 0.8 }
const TANK: MaterialRef = { kind: 'color', color: '#2a2b2c', roughness: 0.6 }

export interface FlatRef {
  stem: string
  floor: number
}

/** Axis-aligned box, plan x/z and height y ranges (any order), non-indexed so it merges with wallGeometry. */
function box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
  return g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed()
}
const rectBox = ([x0, y0, x1, y1]: Rect, h0: number, h1: number) => box(x0, y0, x1, y1, h0, h1)

/** Box in a wall's frame: u along a→b from vertex a, v up, w along the normal (any order). */
function alongWall(w: Wall, unit: Unit, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): THREE.BufferGeometry {
  const f = core.wallFrame(w, unit.vertices)
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), UP, new THREE.Vector3(-f.dir.y, 0, f.dir.x))
  m.setPosition(f.origin.x, 0, f.origin.y)
  return box(u0, w0, u1, w1, v0, v1).applyMatrix4(m)
}

/** A flat's floor plate, top at `top`, `h` thick: room polygons (not shafts: open to the sky) + a strip under every wall to its faces. */
function plate(unit: Unit, rooms: Room[], top: number, h: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = rooms
    .filter((r) => r.kind !== 'shaft')
    .map((r) =>
      new THREE.ExtrudeGeometry(new THREE.Shape(core.roomPolygon(r, unit).map((p) => new THREE.Vector2(p.x, p.y))), { depth: h, bevelEnabled: false })
        .rotateX(Math.PI / 2) // plan (x, y) → world (x, z), extruded down from 0
        .translate(0, top, 0),
    )
  for (const w of unit.walls) {
    const L = core.wallFrame(w, unit.vertices).lengthM
    const t = w.thicknessM / 2
    out.push(alongWall(w, unit, -t, L + t, top - h, top, -t, t))
  }
  return out
}

/** Which side of a wall lies outside the flat (+1 front, −1 back, 0 neither); `inside` says whether a plan point is in. */
function outerSide(w: Wall, unit: Unit, inside: (p: Pt) => boolean): number {
  const f = core.wallFrame(w, unit.vertices)
  const n = { x: -f.dir.y, y: f.dir.x }
  const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
  const off = w.thicknessM / 2 + 0.05
  const probe = (s: number) => inside({ x: mid.x + n.x * off * s, y: mid.y + n.y * off * s })
  return !probe(1) ? 1 : !probe(-1) ? -1 : 0
}

const merge = (geos: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(geos)!
  geos.forEach((x) => x.dispose())
  return g
}

export class Building extends THREE.Group {
  readonly floor: number
  /** the tower without the street: framing and the sun's shadow box */
  readonly box = new THREE.Box3()
  /** Look shows the walk-mode street and the slab above while the camera is under the flat's wall top: stay above it */
  readonly minCameraY: number
  private readonly stem: string
  private readonly street: THREE.Group
  private readonly mark: THREE.Mesh
  /** dark, sky-reflecting panes: the empty shells behind them stay unseen (the unit's own GLASS is 90 % clear) */
  private readonly glass = new THREE.MeshStandardMaterial({ color: '#27303a', roughness: 0.06, metalness: 0.2, envMap: GLASS.envMap })
  private readonly own: THREE.Material[] = [this.glass]
  private readonly rooms = new Map<string, Room[]>()

  /** null when `unit` is not a flat of the demo tower; it sits on unit.floor (the viewer sets that from ?floor=). */
  static for(unit: Unit): Building | null {
    const stem = Object.keys(FLATS).find((s) => FLATS[s].unit.id === unit.id)
    return stem ? new Building(unit, stem, unit.floor ?? 2) : null
  }

  private constructor(unit: Unit, stem: string, floor: number) {
    super()
    this.stem = stem
    this.floor = floor
    this.minCameraY = Math.max(...unit.walls.map((w) => w.heightM)) + 0.3
    const lists = new Map<MaterialRef | 'glass', THREE.BufferGeometry[]>()
    const put = (m: MaterialRef | 'glass', ...g: THREE.BufferGeometry[]) => lists.set(m, [...(lists.get(m) ?? []), ...g])
    const top = Math.max(...FLOORS.map((f) => f.floor))
    const G = this.levelOf(0)
    const R = this.levelOf(top + 1)

    // floors 1..top: a shell per flat; the roof (top + 1): the top floor's plates and parapet
    for (const { floor: k, flats, standIns = [] } of [...FLOORS, { floor: top + 1, flats: [], standIns: FLOORS.at(-1)!.flats }]) {
      const y = this.levelOf(k)
      const roof = k === top + 1
      for (const s of [...flats, ...standIns]) {
        const { unit: u } = FLATS[s]
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        const rooms = this.roomsOf(s)
        if (roof) {
          put(EXTERIOR_PLASTER, ...plate(u, rooms, 0, PLATE_M).map(at))
          // parapet: the walls with open air on one side (outside every flat of the floor below), 1.1 m, no openings
          const others = standIns.filter((o) => o !== s)
          const outside = (p: Pt) => !core.roomAt(p, rooms, u) && !others.some((o) => this.inFlat(o, { x: p.x + this.shift(s).x - this.shift(o).x, y: p.y + this.shift(s).y - this.shift(o).y }))
          const walls = u.walls.filter((w) => outerSide(w, u, (p) => !outside(p)) !== 0).map((w) => ({ ...w, heightM: 1.1, openings: [] }))
          const graph = { vertices: u.vertices, walls }
          put(EXTERIOR_PLASTER, ...walls.map((w) => wallGeometry(w, graph)).filter((g) => !!g).map(at))
          continue
        }
        const mine = k === floor && s === stem
        const walls = u.walls.map((w) => wallGeometry(w, u)).filter((g) => !!g).map(at)
        // the current flat: Look's 0.15 m slab is there already, the plate only closes the gap under it
        const slab = plate(u, rooms, mine ? -LOOK_SLAB : 0, mine ? PLATE_M - LOOK_SLAB : PLATE_M).map(at)
        if (mine) put(EXTERIOR_PLASTER, ...slab)
        const mesh = new THREE.Mesh(merge(mine ? walls : [...walls, ...slab]), materialFor(EXTERIOR_PLASTER))
        mesh.castShadow = mesh.receiveShadow = true
        mesh.visible = !mine // the furnished flat is drawn by the scene; this one is only its pick proxy
        if (flats.includes(s)) mesh.userData.flat = { stem: s, floor: k } satisfies FlatRef
        this.add(mesh)
        if (mine) continue
        for (const w of u.walls) {
          for (const o of w.openings) {
            if (o.kind === 'window' || (o.kind === 'door' && !o.hinge && o.widthM >= 1.2)) {
              put('glass', at(alongWall(w, u, o.offsetM, o.offsetM + o.widthM, o.sillM, o.sillM + o.heightM, -0.01, 0.01)))
            }
          }
        }
      }
    }

    // the core, ground to roof head: its traced walls at the ground and as the stair head + lift machine room
    for (const [s, name] of CORE) {
      const { unit: u } = FLATS[s]
      const room = this.roomsOf(s).find((r) => r.name === name)
      if (!room) continue
      for (const y of [G, R]) {
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        put(EXTERIOR_PLASTER, ...room.wallIds.map((id) => wallGeometry(u.walls.find((w) => w.id === id)!, u)).filter((g) => !!g).map(at))
      }
      put(EXTERIOR_PLASTER, ...plate(u, [room], R + FLOOR_M, PLATE_M).map((g) => g.translate(this.shift(s).x, 0, this.shift(s).y)))
    }

    // ground floor: plinth, gardens, ramp, bays, blocks, columns; roads at street level
    const c = this.shift() // building frame → scene: + c
    const plan = (r: Rect): Rect => [r[0] + c.x, r[1] + c.y, r[2] + c.x, r[3] + c.y]
    const flat = (r: Rect, y: number) => rectBox(plan(r), y, y + 0.01)
    const plot = new THREE.Shape(GROUND.plot.map((p) => new THREE.Vector2(p.x + c.x, p.y + c.y)))
    put(PAVING, new THREE.ExtrudeGeometry(plot, { depth: 0.6, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, G, 0))
    put(GREEN, ...GROUND.gardens.map((r) => flat(r, G)), ...ROOF.gardens.map((r) => flat(r, R)))
    put(ASPHALT, flat(GROUND.ramp, G))
    for (const [x0, y0, x1, y1] of GROUND.bays) {
      const e = 0.08
      put(PAINT, ...[[x0, y0, x1, y0 + e], [x0, y1 - e, x1, y1], [x0, y0, x0 + e, y1], [x1 - e, y0, x1, y1]].map((r) => flat(r as Rect, G)))
    }
    put(EXTERIOR_PLASTER, ...[...GROUND.blocks, ...GROUND.columns].map((r) => rectBox(plan(r), G, G + WALL_M)))
    put(TANK, ...ROOF.tanks.map((r) => rectBox(plan(r), R + FLOOR_M, R + FLOOR_M + 1.2)))

    for (const [m, geos] of lists) {
      const mesh = new THREE.Mesh(merge(geos), m === 'glass' ? this.glass : materialFor(m))
      mesh.castShadow = m !== 'glass' && m !== GREEN && m !== PAINT && m !== ASPHALT
      mesh.receiveShadow = m !== 'glass'
      if (m === 'glass') mesh.raycast = () => {}
      this.add(mesh)
    }
    this.box.setFromObject(this)

    // the street: the site's two roads, and neighbour blocks (context.ts) around the plot and the roads
    const roads = new THREE.Mesh(merge(GROUND.roads.map((r) => flat(r, this.streetY))), materialFor(ASPHALT))
    roads.receiveShadow = true
    const b = this.box
    this.street = buildStreet(unit, { minX: b.min.x - 12, maxX: b.max.x + 12, minY: b.min.z - 12, maxY: b.max.z + 12 }, this.streetY)
    this.add(roads, this.street)

    const markMat = new THREE.MeshBasicMaterial({ color: '#e8c170' }) // --accent
    this.own.push(markMat)
    this.mark = new THREE.Mesh(new THREE.BufferGeometry(), markMat)
    this.mark.raycast = () => {}
    this.add(this.mark)
    this.highlight(floor)
  }

  /** y of floor k's finished floor (0 = ground, top + 1 = roof). */
  levelOf(k: number): number {
    return (k - this.floor) * FLOOR_M
  }

  /** render.ts puts the street (Look's ground) at −floor · 3.2 − 0.2 */
  private get streetY(): number {
    return -this.floor * 3.2 - 0.2
  }

  /** building-frame offset of a flat relative to the current one (plan x, y); no stem = the building frame's origin */
  private shift(stem?: string): Pt {
    const o = stem ? FLATS[stem].offset : { x: 0, y: 0 }
    const c = FLATS[this.stem].offset
    return { x: o.x - c.x, y: o.y - c.y }
  }

  private roomsOf(stem: string): Room[] {
    let r = this.rooms.get(stem)
    if (!r) this.rooms.set(stem, (r = core.deriveRooms(FLATS[stem].unit)))
    return r
  }

  private inFlat(stem: string, p: Pt): boolean {
    return !!core.roomAt(p, this.roomsOf(stem), FLATS[stem].unit)
  }

  /** Accent bands on the slab edges above and below floor k's flat(s): the current type if it is on that floor, else all of them. */
  highlight(k: number): void {
    const entry = FLOORS.find((f) => f.floor === k)
    const stems = !entry ? [] : entry.flats.includes(this.stem) ? [this.stem] : entry.flats
    const y = this.levelOf(k)
    const geos: THREE.BufferGeometry[] = []
    for (const s of stems) {
      const { unit: u } = FLATS[s]
      const rooms = this.roomsOf(s)
      for (const w of u.walls) {
        const side = outerSide(w, u, (p) => !!core.roomAt(p, rooms, u))
        if (!side) continue
        const L = core.wallFrame(w, u.vertices).lengthM
        const t = w.thicknessM / 2
        for (const v of [-PLATE_M, WALL_M]) geos.push(alongWall(w, u, -t, L + t, v, v + PLATE_M, side * t, side * (t + 0.03)).translate(this.shift(s).x, y, this.shift(s).y))
      }
    }
    this.mark.geometry.dispose()
    this.mark.geometry = geos.length ? merge(geos) : new THREE.BufferGeometry()
  }

  /** The flat under a ray (walls, plates and proxies occlude; stand-ins, the core, ground and roof give null). */
  flatAt(ray: THREE.Raycaster): FlatRef | null {
    const hit = ray.intersectObjects(this.children.filter((o) => o !== this.street), false)[0]
    return (hit?.object.userData.flat as FlatRef | undefined) ?? null
  }

  /**
   * After Look.setHour: the sun's shadow frustum around the whole tower (Look's covers the flat only), reaching the
   * street behind it; the panes dim with the sky at dusk like GLASS.
   */
  setSun(sun: THREE.DirectionalLight): void {
    this.glass.envMapIntensity = 0.12 * GLASS.envMapIntensity
    const cam = sun.shadow.camera
    cam.position.copy(sun.position)
    cam.lookAt(sun.target.position)
    cam.updateMatrixWorld()
    const s = this.box.getBoundingSphere(new THREE.Sphere())
    const c = s.center.applyMatrix4(cam.matrixWorldInverse)
    cam.left = c.x - s.radius
    cam.right = c.x + s.radius
    cam.bottom = c.y - s.radius
    cam.top = c.y + s.radius
    cam.near = -c.z - s.radius
    cam.far = -c.z + s.radius + 150 // a low sun throws the tower's shadow far down the street
    cam.updateProjectionMatrix()
  }

  /** Orbit target on floor k (the tower's plan centre, 1.5 m up) and the street-corner eye (+x, +y: roads 10/A and 9/A). */
  view(k: number): { target: THREE.Vector3; eye: THREE.Vector3 } {
    const c = this.box.getCenter(new THREE.Vector3())
    const size = this.box.getSize(new THREE.Vector3())
    const target = new THREE.Vector3(c.x, this.levelOf(k) + 1.5, c.z)
    const eye = new THREE.Vector3(1, 0.6, 1).normalize().multiplyScalar(1.5 * Math.hypot(size.x, size.z)).add(target)
    return { target, eye }
  }

  dispose(): void {
    this.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.street.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose())
    this.own.forEach((m) => m.dispose())
    this.removeFromParent()
  }
}
