/**
 * Building view: the whole tower around the current flat (data/building: towerOf picks BTI's or Sheltech's). Every
 * other flat is a SHELL — its traced walls (wallGeometry: openings cut) and a floor plate, merged into one mesh per flat
 * per floor; windows and sliders are plain dark panes (one merged mesh, no shadows), doors stay as voids. No furniture,
 * lights or ceilings. The ground floor and rooftop are boxes and planes (data/building/*-tower.ts); the lift/stair core
 * walls run through both.
 *
 * Frame: the current flat stays where it is (its floor at y = 0, plan = world X/Z), the tower is placed around it:
 * a flat's plan point p lands at p + offset(flat) − offset(current), floor k at (k − current floor) · FLOOR_M.
 * The current flat itself is the furnished unit; here it only gets an invisible pick proxy and the bit of plate
 * under Look's slab.
 *
 * Round the flat (session 31, founder: "i went to the 1st floor and i couldn't see the playground on the ground floor"):
 * the same tower stands round it in the walk and the Dollhouse too (frame: which floors by tier, render.ts towerLevel; no
 * shadows from it on Low), and its street is the walk's. What the flat draws itself the tower leaves out — a neighbour's
 * shared lobby walls and floor (sharedWith), and over the flat the floor above starts on top of Look's roof (lid) — so no
 * two surfaces ever lie in one place.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { Id, MaterialRef, Pt, Room, Unit, Wall } from '../core'
import { floorIn, stemIn, streetOf, topFloor, towerOf, voidsOver, type Tower } from '../data/building'
import type { Rect } from '../data/building/demo-tower'
import { finishSlotsFor } from '../furnish/finishes'
import { bottomOf, layoutFor } from '../studio/furniture'
import { buildStreet, haze } from './context'
import { KERB_M, bayLineGeometry, bayMarkings, floorGeometry, liftWall, liftedWall, poolBasin, roomCeiling, stepFaces, stepGeometry, storeyTop, wallGeometry, wallLift } from './details'
import { lightPiece } from './daylight'
import { batch, CELL_M } from './batch'
import { buildFurniture } from './furniture'
import { ROOF_M, SITE_REACH_M, TIERS, towerLevel, type Quality } from './render'
import { CONCRETE, EXTERIOR_PLASTER, PAINT as BAY_PAINT, materialFor, resolveFinishRef, zoneFinishRef } from './materials'
import { WATER, meterUVs } from './openings'

/** the traced flats' walls are 3.0 m: the plate fills the storey above them */
const WALL_M = 3
/** Look's slab under the current flat (render.ts SLAB_M) */
const LOOK_SLAB = 0.15
/**
 * A traced level drawn in full stands on a plate whose top is this far under its floors (screed + tile): a plate top in
 * the floors' own plane fought them in stripes from the Building view's distance (the roof deck read as a moiré).
 */
export const UNDER_LEVEL_M = 0.05
const UP = new THREE.Vector3(0, 1, 0)
const PAVING: MaterialRef = { kind: 'color', color: '#9d988f', roughness: 0.9 }
/** lawn strips on the ground floor and the roof: the turf scan (furnish, wave 11), metre UVs so it tiles at its real size */
const GREEN: MaterialRef = { kind: 'pbr', textureId: 'turf' }
const ASPHALT: MaterialRef = { kind: 'color', color: '#5b5955', roughness: 0.95 }
const PAINT: MaterialRef = { kind: 'color', color: '#e8e6e0', roughness: 0.8 }
const TANK: MaterialRef = { kind: 'color', color: '#2a2b2c', roughness: 0.6 }
/**
 * The tower's panes (session 31 polish, qa2 V1): mirrors of the haze the tower stands in — context.ts `haze`, the colour the
 * screen shows round it by day and at dusk — as the neighbours' painted panes read, never the photo sky's blue (a navy
 * beside the picked flat's blue outline). A metal-like mirror (no light of its own, Fresnel brighter at a slant) whose
 * reflection is the haze × PANE_HAZE × the day's share (setSun): PANE its own darkness, the glass's grey, paler toward each
 * pane's head (paneBox: the upper glass mirrors the haze over the street, the lower the street) as the neighbours' are; a lit
 * one's glow too (its ceiling light bright, the room's foot in shade: no flat card).
 */
const PANE = '#8a8e93'
const PANE_HAZE = 2
function hazePane(sky: { value: number }, emissive?: string): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: PANE, roughness: 0.08, metalness: 1, vertexColors: true, ...(emissive && { emissive, emissiveIntensity: 0 }) })
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    s.uniforms.paneSky = sky
    s.fragmentShader = `uniform vec3 hazeColor;\nuniform float paneSky;\n${s.fragmentShader}`.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance = hazeColor * paneSky;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.r;')
  }
  m.customProgramCacheKey = () => 'haze-pane'
  return m
}
/** A pane's box (alongWall) shaded from 0.55 at its foot to 1 at its head, in vertex colours. */
function paneBox(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position
  g.computeBoundingBox()
  const { min, max } = g.boundingBox!
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) c.fill(0.55 + (0.45 * (p.getY(i) - min.y)) / (max.y - min.y || 1), i * 3, i * 3 + 3)
  return g.setAttribute('color', new THREE.BufferAttribute(c, 3))
}

/** About 45 % of the other flats' windows are lit at night: a fixed hash of the flat, floor and opening. */
export function litWindow(key: string): boolean {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) % 100 < 45
}

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

/** Over the walked flat (its plan point `over`, the unit's own frame) a plate of the floor above stops at `y` (its own frame): Look's roof is there. */
export type Lid = { over: (p: Pt) => boolean; y: number }

/**
 * A flat's floor plate, top at `top`, `h` thick: room polygons (not shafts: open to the sky) + a strip under every wall
 * to its faces (`walls`: only those — a rooftop's slab over its closed rooms must not lay a beam over every parapet). A
 * piece over the walked flat (`lid`, by its room's middle or its wall's) starts no lower than the lid; none left: no piece.
 */
export function plate(unit: Unit, rooms: Room[], top: number, h: number, walls: Wall[] = unit.walls, lid?: Lid): THREE.BufferGeometry[] {
  const bottom = (p: Pt) => (lid?.over(p) ? Math.max(top - h, lid.y) : top - h)
  const out: THREE.BufferGeometry[] = []
  for (const r of rooms) {
    const b = r.kind === 'shaft' ? top : bottom(r.centroid)
    if (top - b < 0.005) continue
    out.push(
      new THREE.ExtrudeGeometry(new THREE.Shape(core.roomPolygon(r, unit).map((p) => new THREE.Vector2(p.x, p.y))), { depth: top - b, bevelEnabled: false })
        .rotateX(Math.PI / 2) // plan (x, y) → world (x, z), extruded down from 0
        .translate(0, top, 0),
    )
  }
  for (const w of walls) {
    const f = core.wallFrame(w, unit.vertices)
    const t = w.thicknessM / 2
    const b = bottom({ x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 })
    if (top - b >= 0.005) out.push(alongWall(w, unit, -t, f.lengthM + t, b, top, -t, t))
  }
  return out
}

/** Is plan point p on flat `unit` (in a room, or in a wall's body), its own frame. */
export function onFlat(p: Pt, unit: Unit, rooms: Room[]): boolean {
  if (core.roomAt(p, rooms, unit)) return true
  const n = core.nearestWall(p, unit)
  return !!n && n.distanceM <= n.wall.thicknessM / 2 + 0.05
}

/**
 * What a neighbour on the walked floor shares with the walked flat (Sheltech A and B trace one lobby; a party wall): its
 * walls lying in one of the flat's (both ends within that wall's body, 5 cm slack), its rooms whose middle is in one of the
 * flat's rooms, its columns on one of the flat's — the neighbour's plan moved into the flat's frame by `shift`. The flat
 * draws those; the tower leaves them out (two walls in one place fight in stripes).
 */
export function sharedWith(flat: Unit, flatRooms: Room[], other: Unit, otherRooms: Room[], shift: Pt): { walls: Set<Id>; rooms: Set<Id>; pillars: Set<Id> } {
  const at = (p: Pt): Pt => ({ x: p.x + shift.x, y: p.y + shift.y })
  const frames = flat.walls.map((v) => ({ v, f: core.wallFrame(v, flat.vertices) }))
  const inWall = (p: Pt) =>
    frames.some(({ v, f }) => {
      const [u, n] = [(p.x - f.origin.x) * f.dir.x + (p.y - f.origin.y) * f.dir.y, (p.x - f.origin.x) * f.normal.x + (p.y - f.origin.y) * f.normal.y]
      return u >= -0.05 && u <= f.lengthM + 0.05 && Math.abs(n) <= v.thicknessM / 2 + 0.05
    })
  const vs = new Map(other.vertices.map((v) => [v.id, at(v)]))
  return {
    walls: new Set(other.walls.filter((w) => inWall(vs.get(w.a)!) && inWall(vs.get(w.b)!)).map((w) => w.id)),
    rooms: new Set(otherRooms.filter((r) => core.roomAt(at(r.centroid), flatRooms, flat)).map((r) => r.id)),
    pillars: new Set((other.pillars ?? []).filter((q) => (flat.pillars ?? []).some((p) => Math.hypot(p.x - q.x - shift.x, p.y - q.y - shift.y) < 0.05)).map((q) => q.id)),
  }
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

/** A geometry as a merge takes it: non-indexed, position + normal + uv (none: zeros) + a pane's colour, no groups. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g
  if (n !== g) g.dispose()
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') n.deleteAttribute(k)
  if (!n.attributes.normal) n.computeVertexNormals()
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2))
  n.clearGroups()
  return n
}

/**
 * Where tower t stands round its flat `stem` on `floor` (the header's frame): flat s's plan point p lands at p + shift(s)
 * (no s: the building frame's origin), floor k's finished floor at levelOf(k) — 0 for the flat's own, an imported building's
 * own storey heights (ELEVATIONS) where it has them, else FLOOR_M a floor.
 */
export function frameOf(t: Tower, stem: string, floor: number): { shift: (s?: string) => Pt; levelOf: (k: number) => number } {
  const c = t.FLATS[stem].offset
  const at = (f: number) => t.ELEVATIONS?.[f] ?? f * t.FLOOR_M
  return {
    shift: (s) => {
      const o = s ? t.FLATS[s].offset : { x: 0, y: 0 }
      return { x: o.x - c.x, y: o.y - c.y }
    },
    levelOf: (k) => at(k) - at(floor),
  }
}

/** A unit's lowest floor (m from its datum): 0, or its lowest face's lowest corner (render.ts's `lowest`). */
const lowestFloor = (u: Unit, rooms: Room[]): number => Math.min(0, ...rooms.flatMap((r) => core.roomPolygon(r, u).map((p) => core.roomLevelAt(r, u, p.x, p.y))))

export class Building extends THREE.Group {
  readonly floor: number
  /** the tower without the street: framing and the sun's shadow box */
  readonly box = new THREE.Box3()
  /** Look shows the walk-mode street and the slab above while the camera is under the flat's wall top: stay above it */
  readonly minCameraY: number
  /**
   * The street (y, scene): where render.ts puts a flat's — −floor · 3.2 − 0.2 — or, under a traced ground floor, just under
   * its lowest floor (render.ts's rule for a ground level walked), so its sunken lawn and car ramp stay above the street
   * plane; the scene moves Look's ground plane here while the tower is shown.
   */
  readonly streetY: number
  /** the level groups still to furnish, and whether the tower was disposed meanwhile */
  private furnishing: { s: string; group: THREE.Group; pieces?: THREE.Group }[] = []
  private disposed = false
  private readonly stem: string
  /** make(): the street round the tower, the accent bands */
  private street = new THREE.Group()
  private mark = new THREE.Mesh()
  /** the haze's share in the panes (setSun) */
  private readonly paneSky = { value: PANE_HAZE }
  /** haze-mirroring panes (hazePane): the empty shells behind them stay unseen (the unit's own GLASS is 70 % clear) */
  private readonly glass = hazePane(this.paneSky)
  /** the panes of the windows lit at night (litWindow: about 45 %, the same ones every time), warm behind the curtains */
  private readonly lit = hazePane(this.paneSky, '#ffc27e')
  private readonly own: THREE.Material[] = [this.glass, this.lit]
  private readonly rooms = new Map<string, Room[]>()
  private readonly t: Tower
  private readonly place: ReturnType<typeof frameOf>
  /** the walked flat as the scene draws it (unit, rooms): what of the tower it already covers (sharedWith, lid) */
  private readonly walked: { unit: Unit; rooms: Room[] }
  /** Look's roof over the walked flat reaches this high (y, scene): the floor above starts on it (lid) */
  private readonly lidY: number
  /** frame(): the tower casts the sun's shadow (furniture loaded later follows) */
  private shadows = true
  private pieceShadows = true
  /** frame(): the levels' outdoor pieces are shown; furnish() has started */
  private piecesShown = true
  private furnished = false

  /** null when `unit` is not a flat of a tower; it sits on unit.floor (the viewer sets that from ?floor=), else the first floor listing it. Not built yet: run make(). */
  static for(unit: Unit): Building | null {
    const t = towerOf(unit)
    const stem = t && stemIn(t, unit)
    return t && stem ? new Building(unit, t, stem, floorIn(t, stem, unit.floor)) : null
  }

  private constructor(unit: Unit, t: Tower, stem: string, floor: number) {
    super()
    this.t = t
    this.stem = stem
    this.floor = floor
    this.place = frameOf(t, stem, floor)
    this.minCameraY = Math.max(...unit.walls.map((w) => w.heightM)) + 0.3
    const walkedRooms = core.deriveRooms(unit)
    this.walked = { unit, rooms: walkedRooms }
    this.lidY = storeyTop(unit, walkedRooms) + ROOF_M
    const groundLevel = t.FLOORS.find((f) => f.floor === 0)?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
    const groundLow = groundLevel ? lowestFloor(t.FLATS[groundLevel].unit, this.roomsOf(groundLevel)) : 0
    this.streetY = Math.min(-floor * 3.2 - 0.2, groundLevel ? this.levelOf(0) + groundLow - 0.05 : Infinity)
  }

  /**
   * The tower itself, a floor (a basement, the street) a step: a stair's floor takes them a slice a frame (PlotlineScene
   * arrive; ~300 ms of building in one go froze the floor still shown), everything else runs it to the end at once.
   */
  *make(): Generator<void> {
    const { unit, rooms: walkedRooms } = this.walked
    const { t, stem, floor } = this
    const { FLATS, FLOORS, CORE, GROUND, ROOF, FLOOR_M } = t
    const PLATE_M = FLOOR_M - WALL_M
    // the architect's outside shape (core Shell: the scene draws it round the flat in every mode) stands in for the box
    // massing — the other flats' shells, plates, panes, the roof, plinth and ground pieces are left out so nothing draws
    // twice; the flats keep their invisible pick proxies, traced levels still draw in full
    const hasShell = !!unit.shell
    /** per floor (one mesh per material per floor: frame shows floors by tier), per material */
    const lists = new Map<number, Map<MaterialRef | 'glass' | 'lit', THREE.BufferGeometry[]>>()
    const put = (k: number, m: MaterialRef | 'glass' | 'lit', ...g: THREE.BufferGeometry[]) => {
      if (!g.length) return // an empty list (no tanks, no bays) must not reach merge
      const l = lists.get(k) ?? lists.set(k, new Map()).get(k)!
      l.set(m, [...(l.get(m) ?? []), ...g])
    }
    const top = topFloor(t) // a Studio project's traced rooftop is listed one floor above it
    const G = this.levelOf(0)
    const R = this.levelOf(top + 1)
    const groundLevel = FLOORS.find((f) => f.floor === 0)?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
    const groundLow = groundLevel ? lowestFloor(FLATS[groundLevel].unit, this.roomsOf(groundLevel)) : 0
    /** his traced rooftop (a Studio project): its own walls stand on the roof slab instead of the automatic parapet */
    const roofLevel = FLOORS.find((f) => f.floor === top + 1)?.standIns ?? []
    /** a shell's walls with its openings cut, and its columns, storey high; not what the walked flat shares (sharedWith) */
    const none = { walls: new Set<Id>(), rooms: new Set<Id>(), pillars: new Set<Id>() }
    const shellWalls = (u: Unit, skip = none) => [
      ...u.walls.filter((w) => !skip.walls.has(w.id)).map((w) => wallGeometry(w, u)).filter((x) => !!x),
      ...(u.pillars ?? []).filter((p) => !skip.pillars.has(p.id)).map((p) => box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, 0, WALL_M)),
    ]
    /**
     * A flat's ordinary shell (walls, columns, plate; nothing left out, no lid), its own frame: built once and placed on each
     * floor it stands on (one geometry, sent to the graphics chip once).
     */
    const ordinary = new Map<string, THREE.BufferGeometry>()

    // floors 0..top: a shell per flat (and his traced ground floor); the roof (top + 1): the top floor's plates and parapet
    // (its flats, or the massing standing in for them: a tower of levels and typical shells has no flats)
    const topF = FLOORS.find((f) => f.floor === top)
    const roofOn = topF ? [...topF.flats, ...(topF.standIns ?? []).filter((s) => t.LEVELS?.[s] === undefined)] : []
    for (const { floor: k, flats, standIns = [] } of [...FLOORS.filter((f) => f.floor >= 0 && f.floor <= top), { floor: top + 1, flats: [], standIns: roofOn }]) {
      yield
      const y = this.levelOf(k)
      const roof = k === top + 1
      for (const s of [...flats, ...standIns]) {
        const { unit: u } = FLATS[s]
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        const rooms = this.roomsOf(s)
        if (roof) {
          if (hasShell) continue
          put(k, EXTERIOR_PLASTER, ...plate(u, rooms, roofLevel.length ? -UNDER_LEVEL_M : 0, PLATE_M, u.walls, this.lid(s, k)).map(at))
          if (roofLevel.length) continue
          // parapet: the walls with open air on one side (outside every flat of the floor below), 1.1 m, no openings
          const others = standIns.filter((o) => o !== s)
          const outside = (p: Pt) => !core.roomAt(p, rooms, u) && !others.some((o) => this.inFlat(o, { x: p.x + this.shift(s).x - this.shift(o).x, y: p.y + this.shift(s).y - this.shift(o).y }))
          const walls = u.walls.filter((w) => outerSide(w, u, (p) => !outside(p)) !== 0).map((w) => ({ ...w, heightM: 1.1, openings: [] }))
          const graph = { vertices: u.vertices, walls }
          put(k, EXTERIOR_PLASTER, ...walls.map((w) => wallGeometry(w, graph)).filter((g) => !!g).map(at))
          continue
        }
        const mine = k === floor && s === stem
        if (t.LEVELS?.[s] !== undefined) {
          if (!mine) this.addLevel(s, k) // a traced level (ground, a common floor) in full; the one walked: the scene draws it
          continue
        }
        // a neighbour on the walked floor: not what the walked flat draws itself (a shared lobby: sharedWith)
        const skip = k === floor && !mine ? sharedWith(unit, walkedRooms, u, rooms, this.shift(s)) : none
        const plateWalls = u.walls.filter((w) => !skip.walls.has(w.id))
        const lid = this.lid(s, k)
        let geo: THREE.BufferGeometry
        if (!mine && !lid && k !== 0 && !hasShell && !skip.walls.size && !skip.rooms.size && !skip.pillars.size) {
          geo = ordinary.get(s) ?? ordinary.set(s, merge([...shellWalls(u), ...plate(u, rooms, 0, PLATE_M)])).get(s)!
        } else {
          const walls = shellWalls(u, skip).map(at)
          // the current flat: Look's 0.15 m slab is there already, the plate only closes the gap under it; a ground-floor
          // shell (a Studio building whose flat has no column drawn) stands on the plinth: its top is the plate (no z-fight)
          const slab = k === 0 || hasShell ? [] : plate(u, rooms.filter((r) => !skip.rooms.has(r.id)), mine ? -LOOK_SLAB : 0, mine ? PLATE_M - LOOK_SLAB : PLATE_M, plateWalls, lid).map(at)
          if (mine) put(k, EXTERIOR_PLASTER, ...slab)
          const shell = mine ? walls : [...walls, ...slab]
          if (!shell.length) continue // all of it the walked flat's
          geo = merge(shell)
        }
        const mesh = new THREE.Mesh(geo, materialFor(EXTERIOR_PLASTER))
        if (geo === ordinary.get(s)) mesh.position.set(this.shift(s).x, y, this.shift(s).y)
        mesh.castShadow = mesh.receiveShadow = true
        mesh.visible = !mine && !hasShell // the furnished flat is drawn by the scene; this one is only its pick proxy (every flat's, under the architect's shape)
        mesh.userData.proxy = !mesh.visible // (frame keeps it so)
        if (flats.includes(s)) mesh.userData.flat = { stem: s, floor: k } satisfies FlatRef
        mesh.userData.level = k // a cut at a lower floor hides it (highlight)
        this.add(mesh)
        if (mine || hasShell) continue
        for (const w of plateWalls) {
          for (const o of w.openings) {
            if (o.kind === 'window' || o.kind === 'slider') {
              put(k, litWindow(`${s}|${k}|${o.id}`) ? 'lit' : 'glass', paneBox(at(alongWall(w, u, o.offsetM, o.offsetM + o.widthM, o.sillM, o.sillM + o.heightM, -0.01, 0.01))))
            }
          }
        }
      }
    }

    // the core, ground to roof head: its traced walls at the ground and as the stair head + lift machine room
    for (const [s, name] of hasShell ? [] : CORE) {
      const { unit: u } = FLATS[s]
      const room = this.roomsOf(s).find((r) => r.name === name)
      if (!room) continue
      for (const [k, y] of [[0, G], [top + 1, R]]) {
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        put(k, EXTERIOR_PLASTER, ...[...new Set(room.wallIds)].flatMap((id) => u.walls.filter((w) => w.id === id)).map((w) => wallGeometry(w, u)).filter((g) => !!g).map(at))
      }
      put(top + 1, EXTERIOR_PLASTER, ...plate(u, [room], R + FLOOR_M, PLATE_M).map((g) => g.translate(this.shift(s).x, 0, this.shift(s).y)))
    }

    // his traced rooftop on the roof slab, in full (the one walked: the scene draws it)
    for (const s of roofLevel) if (!(s === stem && floor === top + 1)) this.addLevel(s, top + 1)

    // ground floor: plinth, gardens, ramp, bays, blocks, columns; roads at street level. Under a traced ground floor the
    // plinth sits just under its lowest floor (a sunken lawn, the car ramp's foot), as the street does
    const c = this.shift() // building frame → scene: + c
    const plan = (r: Rect): Rect => [r[0] + c.x, r[1] + c.y, r[2] + c.x, r[3] + c.y]
    const flat = (r: Rect, y: number) => rectBox(plan(r), y, y + 0.01)
    const plot = new THREE.Shape(GROUND.plot.map((p) => new THREE.Vector2(p.x + c.x, p.y + c.y)))
    const plinthTop = groundLevel ? G + groundLow - 0.03 : G
    // (a basement walked under it: the plinth starts on its roof, as the floor above any walked flat does — lid)
    const plinth = floor === -1 ? Math.min(0.6, plinthTop - this.lidY) : 0.6
    if (!hasShell && plinth > 0.005) put(0, PAVING, new THREE.ExtrudeGeometry(plot, { depth: plinth, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, plinthTop, 0))
    if (!hasShell) put(0, GREEN, ...GROUND.gardens.map((r) => meterUVs(flat(r, G))))
    if (!hasShell) put(top + 1, GREEN, ...ROOF.gardens.map((r) => meterUVs(flat(r, R))))
    if (!hasShell) put(0, ASPHALT, ...GROUND.ramp.map((r) => flat(r, G)))
    for (const [x0, y0, x1, y1] of hasShell ? [] : GROUND.bays) {
      const e = 0.08
      put(0, PAINT, ...[[x0, y0, x1, y0 + e], [x0, y1 - e, x1, y1], [x0, y0, x0 + e, y1], [x1 - e, y0, x1, y1]].map((r) => flat(r as Rect, G)))
    }
    if (!hasShell) put(0, EXTERIOR_PLASTER, ...[...GROUND.blocks, ...GROUND.columns].map((r) => rectBox(plan(r), G, G + WALL_M)))
    if (!hasShell) put(top + 1, TANK, ...ROOF.tanks.map((r) => rectBox(plan(r), R + FLOOR_M, R + FLOOR_M + 1.2)))

    for (const [k, byMaterial] of lists)
      for (const [m, geos] of byMaterial) {
        const pane = m === 'glass' || m === 'lit'
        const mesh = new THREE.Mesh(merge(geos), m === 'glass' ? this.glass : m === 'lit' ? this.lit : materialFor(m))
        mesh.castShadow = !pane && m !== GREEN && m !== PAINT && m !== ASPHALT
        mesh.receiveShadow = !pane
        if (pane) mesh.raycast = () => {}
        mesh.userData.level = k // its floor: a cut under it hides it (highlight; the plinth: his traced ground floor stands on it), the walk shows floors by tier (frame)
        this.add(mesh)
      }
    this.box.setFromObject(this)

    // his traced basements (after the box: the view frames the tower above ground), in full, each its own group so picking
    // one in the floor picker can hide everything that stands above it (cut); under the street: a basement reaching past
    // the plinth must not show its wall tops on the road
    for (const { floor: k, standIns = [] } of FLOORS.filter((f) => f.floor < 0))
      for (const s of standIns) if (!(k === floor && s === stem)) yield this.addLevel(s, k, this.streetY - this.levelOf(k) - 0.01)
    yield

    // the street (context.ts, the same as the walk's): the drawing's roads and the neighbours round the plot, a few metres
    // off; a unit with a site (Studio → Site): the map's own roads and blocks instead
    this.street = buildStreet(unit, streetOf(t, stem), this.streetY)
    this.add(this.street)

    const markMat = new THREE.MeshBasicMaterial({ color: '#2458a6' }) // --accent (src/index.css)
    this.own.push(markMat)
    this.mark = new THREE.Mesh(new THREE.BufferGeometry(), markMat)
    this.mark.raycast = () => {}
    this.add(this.mark)
    this.highlight(floor)
  }

  /** y of floor k's finished floor (0 = ground, top + 1 = roof): frameOf. */
  levelOf(k: number): number {
    return this.place.levelOf(k)
  }

  /** Floor k's plates over the walked flat start on Look's roof (plate's lid): only the floor right above it. */
  private lid(s: string, k: number): Lid | undefined {
    return k === this.floor + 1 ? { over: (p) => this.overWalked(s, p), y: this.lidY - this.levelOf(k) } : undefined
  }

  /** Is plan point p of flat `s` (its own frame) over the walked flat (in one of its rooms or walls)? */
  private overWalked(s: string, p: Pt): boolean {
    const d = this.shift(s)
    return onFlat({ x: p.x + d.x, y: p.y + d.y }, this.walked.unit, this.walked.rooms)
  }

  /**
   * Round the walked flat (walk, Dollhouse): the floors render.ts towerLevel picks for the tier, the sun's shadow from them as
   * TIERS.towerShadows says, no accent bands. The Building view: all of it, casting as built (highlight cuts).
   */
  frame(mode: 'walk' | 'orbit' | 'building', tier: Quality): void {
    const around = mode !== 'building'
    this.visible = true // (built hidden for a stair's floor: shown with it)
    this.shadows = !around || TIERS[tier].towerShadows
    // its trees and deck pieces never shade the flat (the roof's are over its slab; a tree's shadow falls on the ground, outside
    // the flat's shadow box): round the flat they cast none — High's sun-shadow redraw round a Sheltech flat 271 → 899 → ?
    this.pieceShadows = !around
    // the levels' pieces (trees, benches, play things): not round the flat on Lite, its zones only — they were ~1.5 ms of a
    // Lite frame at 9× pixels round a Sheltech flat (Firefox pays per draw call: ~150 leaf clusters); the Building view has them
    this.piecesShown = !(around && tier === 'lite')
    if (this.piecesShown && !this.furnished) void this.furnish()
    for (const { pieces } of this.furnishing) if (pieces) pieces.visible = this.piecesShown
    // the made-up street round Lite's Dollhouse: none, as before (~2 ms of a frame at 9× pixels); the site's real one stays
    this.street.visible = !(mode === 'orbit' && tier === 'lite') || !!this.street.userData.site
    for (const o of this.children) {
      if (o === this.street) continue
      delete o.userData.cut
      o.visible = o === this.mark ? !around : !o.userData.proxy && (!around || towerLevel(o.userData.level, { tier, floor: this.floor, dollhouse: mode === 'orbit' }))
      this.casts(o)
      for (const f of this.furnishing) if (f.group === o && f.pieces) this.casts(f.pieces, true)
    }
  }

  /** The tower's meshes in `o` (`pieces`: a level's outdoor pieces) cast the sun's shadow as built, or none (frame). */
  private casts(o: THREE.Object3D, pieces = false): void {
    const on = pieces ? this.pieceShadows : this.shadows
    o.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return
      m.userData.casts ??= m.castShadow
      m.castShadow = on && m.userData.casts
    })
  }

  /** building-frame offset of a flat relative to the current one (plan x, y); no stem = the building frame's origin (frameOf) */
  private shift(stem?: string): Pt {
    return this.place.shift(stem)
  }

  private roomsOf(stem: string): Room[] {
    let r = this.rooms.get(stem)
    if (!r) this.rooms.set(stem, (r = core.deriveRooms(this.t.FLATS[stem].unit)))
    return r
  }

  private inFlat(stem: string, p: Pt): boolean {
    return !!core.roomAt(p, this.roomsOf(stem), this.t.FLATS[stem].unit)
  }

  /**
   * A traced level (ground, basement, common floor, rooftop) of floor k as the walk view builds it, with its builders
   * (details.ts) and finishes (materials.ts): floors by kind at their levels — ramps, flights of steps, a pool's sunk
   * basin and water, the risers between levels, the bay lines — walls standing on their floors at their real heights (a
   * kerb or a planter's edge concrete, the rest the exterior render), columns up to the storey's top; windows, sliders and
   * glass walls as the shells' dark panes; a floor plate under a common floor among the flats; a slab over a rooftop's
   * closed rooms. A ramp face rising into the void of the level above is that level's (drawn once). One mesh per
   * material in a group at the level's place, cut with its floor (userData.level); its outdoor pieces load later
   * (furnish). `cap`: no wall above it (a basement under the street).
   */
  private addLevel(s: string, k: number, cap = Infinity): void {
    const { unit: u } = this.t.FLATS[s]
    const rooms = this.roomsOf(s)
    const top = topFloor(this.t)
    const PLATE_M = this.t.FLOOR_M - WALL_M
    const slots = finishSlotsFor(u, rooms)
    const lists = new Map<MaterialRef | THREE.Material, THREE.BufferGeometry[]>()
    const put = (m: MaterialRef | THREE.Material, ...gs: (THREE.BufferGeometry | null)[]) => {
      for (const g of gs) if (g) lists.set(m, [...(lists.get(m) ?? []), g])
    }
    const off = this.t.FLATS[s].offset
    const voids = voidsOver(this.t, k)
    const rises = (r: Room) => Math.max(r.levelM ?? 0, r.slope?.toLevelM ?? 0) > 0
    const floorRef = (r: Room) => (core.isOutdoor(r.kind) ? zoneFinishRef(r.kind, 'floor') : resolveFinishRef(slots, {}, r.id, 'floor'))
    for (const r of rooms) {
      if (r.kind === 'shaft') continue
      if (rises(r) && voids.some((v) => core.pointInPolygon({ x: r.centroid.x + off.x, y: r.centroid.y + off.y }, v))) continue
      if (r.kind === 'pool') {
        const { depth, walls, water } = poolBasin(r, u)
        put(floorRef(r), floorGeometry(r, u).translate(0, -depth, 0), walls)
        put(WATER, water)
      } else put(floorRef(r), stepGeometry(r, u) ?? floorGeometry(r, u))
    }
    for (const { room, geo } of stepFaces(u, rooms)) put(core.isOutdoor(room.kind) ? CONCRETE : floorRef(room), geo)
    put(BAY_PAINT, bayLineGeometry(bayMarkings(u, rooms).lines))
    for (const w of u.walls) {
      if (!(w.heightM > 0)) continue
      const l = wallLift(w, u, rooms)
      const foot = Math.max(...l.foot)
      const capped = foot + w.heightM > cap ? { ...w, heightM: Math.max(0.01, cap - foot) } : w
      const built = liftedWall(capped, u, l)
      const geo = wallGeometry(built, u)
      if (!geo) continue
      liftWall(geo, capped, u, l)
      const planter = w.heightM <= 0.6 && rooms.some((r) => r.kind === 'planter' && r.wallIds.includes(w.id))
      put(w.heightM <= KERB_M || planter ? CONCRETE : EXTERIOR_PLASTER, geo)
      const L = core.wallFrame(w, u.vertices).lengthM || 1
      built.openings.forEach((o) => {
        if (o.kind !== 'window' && o.kind !== 'slider') return
        const t = (o.offsetM + o.widthM / 2) / L
        put(this.glass, paneBox(alongWall(w, u, o.offsetM, o.offsetM + o.widthM, o.sillM, o.sillM + o.heightM, -0.01, 0.01).translate(0, l.foot[0] + t * (l.foot[1] - l.foot[0]), 0)))
      })
    }
    const storey = Math.min(storeyTop(u, rooms) || WALL_M, cap)
    for (const p of u.pillars ?? []) put(EXTERIOR_PLASTER, box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, core.floorLevelAt(u, p.x, p.y, rooms), storey))
    if (k >= 1 && k <= top) put(EXTERIOR_PLASTER, ...plate(u, rooms, -UNDER_LEVEL_M, PLATE_M, u.walls, this.lid(s, k)))
    if (k > top) {
      const full = new Set(u.walls.filter((w) => w.heightM >= 2).map((w) => w.id))
      const ids = new Set(u.walls.map((w) => w.id)) // (a room going round a column has edges that are no wall)
      const caps = rooms.filter((r) => r.kind !== 'shaft' && r.wallIds.every((id) => full.has(id) || !ids.has(id)))
      const capWalls = new Set(caps.flatMap((r) => r.wallIds))
      put(EXTERIOR_PLASTER, ...plate(u, caps, WALL_M + PLATE_M, PLATE_M, u.walls.filter((w) => capWalls.has(w.id))))
    }
    const group = new THREE.Group()
    group.position.set(this.shift(s).x, this.levelOf(k), this.shift(s).y)
    group.userData.level = k // a cut at a lower floor hides it (highlight)
    for (const [m, geos] of lists) {
      const mesh = new THREE.Mesh(merge(geos.map(plain)), m instanceof THREE.Material ? m : materialFor(m))
      const flatOnly = m === BAY_PAINT || m === WATER || m === this.glass
      mesh.castShadow = !flatOnly
      mesh.receiveShadow = m !== this.glass
      if (flatOnly) mesh.raycast = () => {}
      group.add(mesh)
    }
    this.add(group)
    // what a buyer sees of it from outside: a ground floor's and a rooftop's outdoor pieces (trees, planters, deck furniture)
    if (k === 0 || k > top) this.furnishing.push({ s, group })
  }

  /**
   * The outdoor pieces of the levels drawn in full (their own layout by kind: furnish presets, studio/furniture.ts
   * layoutFor) through the walk view's furniture loader, one at a time after the tower is shown: it opens as fast as the
   * shells did and fills in. Interiors stay empty (not seen from outside). A level's pieces, all in, are drawn as one mesh
   * per material per 8 m square (batch.ts, as the flat's furniture): Sheltech's ground floor's trees, benches and planters
   * are ~220 meshes, ~55 batches (their leaf clusters stay their own draws).
   */
  private async furnish(): Promise<void> {
    this.furnished = true
    for (const f of this.furnishing) {
      const { s, group } = f
      const pieces = (f.pieces = new THREE.Group())
      pieces.visible = this.piecesShown
      group.add(pieces)
      const { unit: u } = this.t.FLATS[s]
      const rooms = this.roomsOf(s)
      const byId = new Map(rooms.map((r) => [r.id, r]))
      const ps = layoutFor(u, rooms)
      let t0 = performance.now()
      for (const p of ps) {
        const r = byId.get(p.roomId)
        if (p.removed || !r || !core.isOutdoor(r.kind)) continue
        // a frame between slices: models already loaded build at once (a stair's second visit: ~200 pieces in one 0.5–1 s frame)
        if (performance.now() - t0 > 12) (await new Promise((ok) => requestAnimationFrame(ok)), (t0 = performance.now()))
        if (this.disposed) return
        const obj = await buildFurniture(p, roomCeiling(r, u, rooms), core.roomLevelAt(r, u, p.x, p.y), bottomOf(ps, p))
        if (this.disposed) return
        obj.traverse((o) => (o.raycast = () => {})) // not a flat: a click goes through
        lightPiece(obj, [0, 0]) // its materials read the daylight atlas (the walk's pieces share them): here its neutral corner, lit as before
        pieces.add(obj)
        this.casts(obj, true)
      }
      // batched with the shadow flags they were built with; frame's rule on top (casts)
      pieces.traverse((o) => void (o.userData.casts !== undefined && (o.castShadow = o.userData.casts)))
      batch(pieces, CELL_M)
      this.casts(pieces, true)
    }
  }

  /**
   * Accent bands on the slab edges above and below floor k's flat(s): the current type if it is on that floor, else all of
   * them; on a floor without flats its stand-ins' outline (a traced level: ground, basement, rooftop; massing). A cut floor (cuts(k)): everything
   * standing above it is hidden so it can be seen (the scene hides the furnished flat, and the street plane under ground) —
   * but the street, its roads and the neighbour blocks stay: they stand round the plot, not over the floor looked at.
   */
  highlight(k: number): void {
    const { FLATS, FLOORS, FLOOR_M } = this.t
    const PLATE_M = FLOOR_M - WALL_M
    const entry = FLOORS.find((f) => f.floor === k)
    const stems = !entry ? [] : entry.flats.includes(this.stem) ? [this.stem] : entry.flats.length ? entry.flats : (entry.standIns ?? [])
    const cut = this.cuts(k)
    for (const o of this.children) {
      if (o === this.mark || o === this.street) continue
      const hide = cut && !(typeof o.userData.level === 'number' && o.userData.level <= k)
      if (hide && o.visible) (o.visible = false), (o.userData.cut = true)
      else if (!hide && o.userData.cut) (o.visible = true), delete o.userData.cut
    }
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

  /** Picking floor k hides what stands above it: a basement, or the ground floor he traced (the built-in towers: never). */
  cuts(k: number): boolean {
    return k < 0 || (k === 0 && Object.values(this.t.LEVELS ?? {}).includes(0))
  }

  /** The flat under a ray (walls, plates and proxies occlude; stand-ins, the core, ground and roof give null; what a basement's cut hides is not there). */
  flatAt(ray: THREE.Raycaster): FlatRef | null {
    const hit = ray.intersectObjects(this.children.filter((o) => o !== this.street && (o.visible || !o.userData.cut)), false)[0]
    return (hit?.object.userData.flat as FlatRef | undefined) ?? null
  }

  /** The panes dim with the haze at dusk and the lit ones come on (every mode; Look.setAltitude's night). */
  setNight(night: number): void {
    this.paneSky.value = PANE_HAZE * (1 - night) // the haze they mirror goes with the light
    this.lit.emissiveIntensity = 0.18 * night // the neighbours' lights come on as the sky goes
  }

  /** After Look.setHour, the Building view: the sun's shadow frustum around the whole tower (Look's covers the flat only), reaching the street behind it; the panes (setNight). */
  setSun(sun: THREE.DirectionalLight, night = 0): void {
    this.setNight(night)
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
    cam.near = -c.z - s.radius - SITE_REACH_M // the neighbours toward the sun (the site's, or the made-up street's) shade the tower
    cam.far = -c.z + s.radius + 150 // a low sun throws the tower's shadow far down the street
    sun.shadow.bias = -0.1 / (cam.far - cam.near) // ≈ 10 cm, as tuned for the tower (−0.0005 of its ≈ 200 m range before the reach); Look sets its own for the flat
    cam.updateProjectionMatrix()
  }

  /** Orbit target on floor k (the tower's plan centre, 1.5 m up) and the street-corner eye (+x, +y: roads 10/A and 9/A), steep; a neighbour between it and the tower is left out (context.ts siteCut). */
  view(k: number): { target: THREE.Vector3; eye: THREE.Vector3 } {
    const c = this.box.getCenter(new THREE.Vector3())
    const size = this.box.getSize(new THREE.Vector3())
    const target = new THREE.Vector3(c.x, this.levelOf(k) + 1.5, c.z)
    const eye = new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(1.25 * Math.hypot(size.x, size.z)).add(target)
    return { target, eye }
  }

  dispose(): void {
    this.disposed = true
    // the furniture shares its models' geometry with the loader's cache (and the walk view): not ours to free
    for (const { pieces } of this.furnishing) pieces?.children.filter((o) => o.userData.kind === 'furniture').forEach((o) => o.removeFromParent())
    this.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.street.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose())
    this.own.forEach((m) => m.dispose())
    this.removeFromParent()
  }
}
