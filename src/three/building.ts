/**
 * Building view: the whole tower around the current flat (data/building: towerOf picks BTI's or Sheltech's). Every
 * other flat is a SHELL — its traced walls (wallGeometry: openings cut) and a floor plate, merged into one mesh per flat
 * per floor; windows and sliders are real glass (paneMaterial: frames, sashes, the haze mirrored — one merged mesh) with
 * the flat's rooms behind them (interiors.ts: floors, ceilings, painted walls and the presets' furniture, built a flat at
 * a time after the tower shows, by tier); doors stay as voids. The ground floor and rooftop are boxes and planes
 * (data/building/*-tower.ts); the lift/stair core walls run through both.
 *
 * Frame: the current flat stays where it is (its floor at y = 0, plan = world X/Z), the tower is placed around it:
 * a flat's plan point p lands at p + offset(flat) − offset(current), floor k at (k − current floor) · FLOOR_M.
 * The current flat itself is the furnished unit; here it only gets an invisible pick proxy and the bit of plate
 * under Look's slab.
 *
 * The picked flat is told by light, not lines (founder 2026-11-21: "the walls and everything should be a bit bright upon
 * selection"): everything of it seen from outside — walls, balcony fronts, frames, the rooms through its glass — a fifth
 * brighter (the lift), its lamps on at night; the storey under the pointer a little brighter (the hover).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { MaterialRef, Opening, Pt, Room, Unit, Wall } from '../core'
import { floorIn, stemIn, streetOf, topFloor, towerOf, voidsOver, type Tower } from '../data/building'
import { keptAt } from '../data/building/apartments'
import type { Rect } from '../data/building/demo-tower'
import { finishSlotsFor } from '../furnish/finishes'
import { bottomOf, layoutFor } from '../studio/furniture'
import { buildStreet, haze } from './context'
import { KERB_M, bayLineGeometry, bayMarkings, floorGeometry, liftWall, liftedWall, poolBasin, roomCeiling, stepFaces, stepGeometry, storeyTop, wallGeometry, wallLift } from './details'
import { lightPiece } from './daylight'
import { buildFurniture } from './furniture'
import { furnitureGeometry, indoor, inside, interiorMaterial, lampTable, roomsGeometry, setLamp } from './interiors'
import { SITE_REACH_M, type Quality } from './render'
import { CONCRETE, EXTERIOR_PLASTER, PAINT as BAY_PAINT, materialFor, resolveFinishRef, zoneFinishRef } from './materials'
import { WATER, meterUVs } from './openings'

/** the traced flats' walls are 3.0 m: the plate fills the storey above them */
const WALL_M = 3
/** the roof's parapet over the top floor's outer walls (no traced rooftop) */
const PARAPET_M = 1.1
/** Look's slab under the current flat (render.ts SLAB_M) */
const LOOK_SLAB = 0.15
/**
 * A traced level drawn in full stands on a plate whose top is this far under its floors (screed + tile): a plate top in
 * the floors' own plane fought them in stripes from the Building view's distance (the roof deck read as a moiré).
 */
export const UNDER_LEVEL_M = 0.05
const UP = new THREE.Vector3(0, 1, 0)
const HIT = new THREE.Vector3()
const PAVING: MaterialRef = { kind: 'color', color: '#9d988f', roughness: 0.9 }
/** lawn strips on the ground floor and the roof: the turf scan (furnish, wave 11), metre UVs so it tiles at its real size */
const GREEN: MaterialRef = { kind: 'pbr', textureId: 'turf' }
const ASPHALT: MaterialRef = { kind: 'color', color: '#5b5955', roughness: 0.95 }
const PAINT: MaterialRef = { kind: 'color', color: '#e8e6e0', roughness: 0.8 }
const TANK: MaterialRef = { kind: 'color', color: '#2a2b2c', roughness: 0.6 }
/** the haze the glass mirrors by day (setSun: × the day's share), mostly at a slant (Fresnel) */
const PANE_HAZE = 2
/** how much of the room behind the glass shows through: Dhaka's grey-tinted float glass, as the walk's panes (openings.ts) */
const PANE_THROUGH = 0.7
/** a room lit at night whatever the pattern says: a common level's (a lobby, a gym, the stair head) and the picked flat's while its lamps are on — a little under a home's brightest */
const ALWAYS_LIT = 0.85
/**
 * The picked flat's lift: everything of it seen from outside × (1 + PICK_LIFT) — an exposure lift, by day and by night (about
 * a fifth brighter on screen once tone-mapped) — and at night, when its walls are near black, a faint light added
 * (PICK_NIGHT, as seen on screen) so they still read. The storey under the pointer: HOVER_LIFT / HOVER_NIGHT, quieter. Never
 * a wash of colour: every face keeps its own colour and contrast.
 */
export const PICK_LIFT = 0.25
export const PICK_NIGHT = 0.1
export const HOVER_LIFT = 0.1
export const HOVER_NIGHT = 0.04
/** the storeys nearest the camera that show their furniture on Low (High: every storey, Lite: none) */
export const LOW_STOREYS = 3

/**
 * The tower's panes: real glass (session 31 glow; founder 2026-11-21: "all of them should show, not all of them should
 * hide") — the room behind it shows through (interiors.ts), dimmed as Dhaka's grey-tinted float glass dims it (PANE_THROUGH),
 * less at a slant where the glass mirrors more; by day it mirrors the haze (context.ts `haze`), mostly at a slant (Fresnel).
 * The aluminium frame and its sashes' meeting stiles are drawn on the pane from its own data (paneGeo), solid, lit as any
 * surface; edges fade under a pixel (fwidth): no shimmer as the tower turns. Blending: what the pane draws + what is behind ×
 * its alpha (a frame: 0, it covers). No texture, no extra draw: one program for every pane of the tower, on every tier.
 */
function paneMaterial(sky: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true, depthWrite: false })
  Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor })
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    s.uniforms.paneSky = sky
    s.vertexShader = `attribute vec4 pane;\nvarying vec4 vPane;\n${s.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPane = pane;')
    s.fragmentShader = `uniform vec3 hazeColor;\nuniform float paneSky;\nvarying vec4 vPane;\n${s.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PANE_FRAME}`)
      .replace('#include <opaque_fragment>', `${PANE_GLASS}\n#include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'tower-pane'
  return m
}
/** vPane: across / up the pane 0–1, its width and height (m). The frame round it and the stile between its sashes: solid aluminium. */
const PANE_FRAME = /* glsl */ `
vec2 pm = vPane.xy * vPane.zw;
vec2 paneAa = fwidth(pm) + 1e-4;
float paneN = vPane.z > 1.8 ? 3.0 : 2.0;
vec2 paneEdge = min(pm, vPane.zw - pm);
float paneFrame = max(1.0 - smoothstep(0.05 - paneAa.x, 0.05 + paneAa.x, paneEdge.x), 1.0 - smoothstep(0.05 - paneAa.y, 0.05 + paneAa.y, paneEdge.y));
paneFrame = max(paneFrame, 1.0 - smoothstep(0.02 - paneAa.x, 0.02 + paneAa.x, abs(fract(vPane.x * paneN + 0.5) - 0.5) * vPane.z / paneN));
diffuseColor.rgb = vec3(0.5, 0.51, 0.52) * paneFrame;
`
/** The glass: the haze it mirrors added; what is behind it × PANE_THROUGH less what the mirror takes; a frame covers it. */
const PANE_GLASS = /* glsl */ `
float paneFr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0);
outgoingLight += (1.0 - paneFrame) * hazeColor * paneSky * (0.05 + 0.95 * paneFr) * (0.55 + 0.45 * vPane.y);
diffuseColor.a = (1.0 - paneFrame) * ${PANE_THROUGH.toFixed(2)} * (1.0 - paneFr);
`

/** FNV-1a of a key, 0–1: the same key, the same number, on every visit. */
const hash01 = (key: string): number => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/**
 * How lit room `room` of flat `flat` (its stem and floor) is at night, the same on every visit (no flicker, no re-roll):
 * about one flat in eight has nobody home; in the others about six rooms in ten have a light on, at 55–100 % of a lit
 * room's brightness; 0: dark. Every window of a room shares it, as a lit room lights all of its windows.
 */
export function roomLight(flat: string, room: string): number {
  if (hash01(`${flat}|home`) < 0.12) return 0
  return hash01(`${flat}|${room}`) < 0.6 ? 0.55 + 0.45 * hash01(`${room}|${flat}|b`) : 0
}

/** A wall's frame as a matrix: x along a→b from vertex a, y up, z along the normal. */
function wallMatrix(w: Wall, unit: Unit): THREE.Matrix4 {
  const f = core.wallFrame(w, unit.vertices)
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), UP, new THREE.Vector3(-f.dir.y, 0, f.dir.x)).setPosition(f.origin.x, 0, f.origin.y)
}

/** Opening o's pane (2 cm thick at the wall's middle) with its frame's data on every vertex (paneMaterial): across / up it, its size. Glass only: the room behind is the room's own (interiors.ts). */
function paneGeo(w: Wall, unit: Unit, o: Opening): THREE.BufferGeometry {
  const g = box(o.offsetM, -0.01, o.offsetM + o.widthM, 0.01, o.sillM, o.sillM + o.heightM)
  const p = g.attributes.position
  const a = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) a.set([(p.getX(i) - o.offsetM) / o.widthM, (p.getY(i) - o.sillM) / o.heightM, o.widthM, o.heightM], i * 4)
  return g.setAttribute('pane', new THREE.BufferAttribute(a, 4)).applyMatrix4(wallMatrix(w, unit))
}

/**
 * The floor under height y (scene metres, the tower's frame): of `levels` ([floor, its finished floor's y]), the highest one
 * at or under y (+1 cm: a floor's own top face counts as its own); under them all, the lowest. null: no levels.
 */
export function floorAtY(y: number, levels: [number, number][]): number | null {
  const under = levels.filter((l) => l[1] <= y + 0.01)
  const pick = under.length ? under.reduce((a, b) => (b[1] > a[1] ? b : a)) : levels.reduce<[number, number] | null>((a, b) => (!a || b[1] < a[1] ? b : a), null)
  return pick?.[0] ?? null
}

export interface FlatRef {
  stem: string
  floor: number
}

/** What the pointer is over on the tower (pickAt): floor k (0 = ground, top + 1 = roof, < 0 a basement) and the flat there, if it is one. */
export interface TowerHit {
  k: number
  flat: FlatRef | null
}

/** Axis-aligned box, plan x/z and height y ranges (any order), non-indexed so it merges with wallGeometry. */
function box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
  return g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).toNonIndexed()
}
const rectBox = ([x0, y0, x1, y1]: Rect, h0: number, h1: number) => box(x0, y0, x1, y1, h0, h1)

/** Box in a wall's frame: u along a→b from vertex a, v up, w along the normal (any order). */
const alongWall = (w: Wall, unit: Unit, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): THREE.BufferGeometry =>
  box(u0, w0, u1, w1, v0, v1).applyMatrix4(wallMatrix(w, unit))

/**
 * A flat's floor plate, top at `top`, `h` thick: room polygons (not shafts: open to the sky) + a strip under every wall
 * to its faces (`walls`: only those — a rooftop's slab over its closed rooms must not lay a beam over every parapet).
 */
function plate(unit: Unit, rooms: Room[], top: number, h: number, walls: Wall[] = unit.walls): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = rooms
    .filter((r) => r.kind !== 'shaft')
    .map((r) =>
      new THREE.ExtrudeGeometry(new THREE.Shape(core.roomPolygon(r, unit).map((p) => new THREE.Vector2(p.x, p.y))), { depth: h, bevelEnabled: false })
        .rotateX(Math.PI / 2) // plan (x, y) → world (x, z), extruded down from 0
        .translate(0, top, 0),
    )
  for (const w of walls) {
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

const KEEP = new Set(['position', 'normal', 'uv', 'pane'])
/** A geometry as a merge takes it: non-indexed, position + normal + uv (none: zeros) + a pane's card (paneGeo), no groups. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g
  if (n !== g) g.dispose()
  for (const k of Object.keys(n.attributes)) if (!KEEP.has(k)) n.deleteAttribute(k)
  if (!n.attributes.normal) n.computeVertexNormals()
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2))
  n.clearGroups()
  return n
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
  private furnishing: { s: string; group: THREE.Group }[] = []
  private disposed = false
  private readonly stem: string
  private readonly street: THREE.Group
  /** the picked flat's lift and the hover's (liftMeshes): everything of it seen from outside brighter, their skins per floor once made */
  private readonly lift = liftMeshes(1000)
  private readonly hoverLift = liftMeshes(1000)
  /** both lifts: drawn over the tower, never cut, never picked */
  private readonly overlay = new THREE.Group()
  private readonly washes = new Map<number, THREE.BufferGeometry>()
  private washed: number | null = null
  /** the floor picked (highlight) and its flats (their lamps are on); under the street only a picked basement is seen (the street plane hides the rest) */
  private picked: number
  private pickedStems: string[] = []
  /** every floor from the lowest basement to the roof with its finished floor's y (pickAt's floorAtY) */
  private readonly levels: [number, number][] = []
  /** each piece's box (pickAt), once: the tower does not move */
  private readonly boxes = new Map<THREE.Object3D, THREE.Box3>()
  /** the haze in the panes by day (setSun) */
  private readonly paneSky = { value: PANE_HAZE }
  /** every pane of the tower: real glass with the room behind it (paneMaterial) */
  private readonly panes = paneMaterial(this.paneSky)
  /** the merged panes (pickAt: a ray through a window names the flat behind it) and what each of its triangles belongs to */
  private paneMesh: THREE.Mesh | null = null
  private readonly paneOwner: TowerHit[] = []
  private readonly own: THREE.Material[] = [this.panes, ...this.lift.materials, ...this.hoverLift.materials]
  private readonly rooms = new Map<string, Room[]>()
  private readonly t: Tower
  /** what the tier draws inside (furnishes): rooms everywhere; furniture on every storey (High), the nearest (Low), none (Lite) */
  private readonly tier: Quality
  /** the flats with rooms behind their windows (every one but the walked flat), each with its meshes once built */
  private readonly flats: Inside[] = []
  /** a drawing's rooms and furniture, once (interiors.ts), shared by every floor it stands on */
  private readonly drawn = new Map<string, { rooms?: Promise<THREE.BufferGeometry | null>; things?: Promise<THREE.BufferGeometry | null> }>()
  /** where the camera is (update): the nearest flats are built first, and on Low furnished */
  private readonly eye = new THREE.Vector3()
  private furnishedFloors: Set<number> | null = null
  private lampsOn = false
  private night = 0
  /** something new to draw (a flat built): the scene wakes its sleeping frame loop (Low, Lite) */
  onChange: () => void = () => {}
  /** when the tower was made, its rooms all in, its furniture all in (performance.now; measured in the browser) */
  readonly progress = { start: performance.now(), rooms: 0, furnished: 0 }
  /** still filling in its rooms and furniture: the scene does not judge the machine's speed meanwhile (PlotlineScene.sample) */
  get busy(): boolean {
    return !this.progress.furnished && !this.disposed
  }

  /** null when `unit` is not a flat of a tower; it sits on unit.floor (the viewer sets that from ?floor=), else the first floor listing it. */
  static for(unit: Unit, tier: Quality = 'high'): Building | null {
    const t = towerOf(unit)
    const stem = t && stemIn(t, unit)
    return t && stem ? new Building(unit, t, stem, floorIn(t, stem, unit.floor), tier) : null
  }

  private constructor(unit: Unit, t: Tower, stem: string, floor: number, tier: Quality) {
    super()
    this.t = t
    this.stem = stem
    this.tier = tier
    this.floor = this.picked = floor
    this.minCameraY = Math.max(...unit.walls.map((w) => w.heightM)) + 0.3
    const { FLATS, FLOORS, CORE, GROUND, ROOF, FLOOR_M } = t
    const PLATE_M = FLOOR_M - WALL_M
    // the architect's outside shape (core Shell: the scene draws it round the flat in every mode) stands in for the box
    // massing — the other flats' shells, plates, panes, the roof, plinth and ground pieces are left out so nothing draws
    // twice; the flats keep their invisible pick proxies, traced levels still draw in full
    const hasShell = !!unit.shell
    const lists = new Map<MaterialRef | 'glass', THREE.BufferGeometry[]>()
    const put = (m: MaterialRef | 'glass', ...g: THREE.BufferGeometry[]) => {
      if (g.length) lists.set(m, [...(lists.get(m) ?? []), ...g]) // an empty list (no tanks, no bays) must not reach merge
    }
    const top = topFloor(t) // a Studio project's traced rooftop is listed one floor above it
    for (let k = Math.min(0, ...FLOORS.map((f) => f.floor)); k <= top + 1; k++) this.levels.push([k, this.levelOf(k)])
    const G = this.levelOf(0)
    const R = this.levelOf(top + 1)
    const groundLevel = FLOORS.find((f) => f.floor === 0)?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
    const groundLow = groundLevel ? lowestFloor(FLATS[groundLevel].unit, this.roomsOf(groundLevel)) : 0
    this.streetY = Math.min(-floor * 3.2 - 0.2, groundLevel ? G + groundLow - 0.05 : Infinity)
    /** his traced rooftop (a Studio project): its own walls stand on the roof slab instead of the automatic parapet */
    const roofLevel = FLOORS.find((f) => f.floor === top + 1)?.standIns ?? []
    /** a shell's walls with its openings cut, and its columns, storey high (a basement's: no higher than `cap`, under the street) */
    const shellWalls = (u: Unit, cap = Infinity) => {
      const g = { vertices: u.vertices, walls: u.walls.map((w) => (w.heightM > cap ? { ...w, heightM: cap } : w)) }
      return [
        ...g.walls.map((w) => wallGeometry(w, g)).filter((x) => !!x),
        ...(u.pillars ?? []).map((p) => box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, 0, Math.min(WALL_M, cap))),
      ]
    }

    // floors 0..top: a shell per flat (and his traced ground floor); the roof (top + 1): the top floor's plates and parapet
    // (its flats, or the massing standing in for them: a tower of levels and typical shells has no flats)
    const topF = FLOORS.find((f) => f.floor === top)
    const roofOn = topF ? [...topF.flats, ...(topF.standIns ?? []).filter((s) => t.LEVELS?.[s] === undefined)] : []
    for (const { floor: k, flats, standIns = [] } of [...FLOORS.filter((f) => f.floor >= 0 && f.floor <= top), { floor: top + 1, flats: [], standIns: roofOn }]) {
      const y = this.levelOf(k)
      const roof = k === top + 1
      for (const s of [...flats, ...standIns]) {
        const { unit: u } = FLATS[s]
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        const rooms = this.roomsOf(s)
        if (roof) {
          if (hasShell) continue
          put(EXTERIOR_PLASTER, ...plate(u, rooms, roofLevel.length ? -UNDER_LEVEL_M : 0, PLATE_M).map(at))
          if (roofLevel.length) continue
          // parapet: the walls with open air on one side (outside every flat of the floor below), 1.1 m, no openings
          const others = standIns.filter((o) => o !== s)
          const outside = (p: Pt) => !core.roomAt(p, rooms, u) && !others.some((o) => this.inFlat(o, { x: p.x + this.shift(s).x - this.shift(o).x, y: p.y + this.shift(s).y - this.shift(o).y }))
          const walls = u.walls.filter((w) => outerSide(w, u, (p) => !outside(p)) !== 0).map((w) => ({ ...w, heightM: PARAPET_M, openings: [] }))
          const graph = { vertices: u.vertices, walls }
          put(EXTERIOR_PLASTER, ...walls.map((w) => wallGeometry(w, graph)).filter((g) => !!g).map(at))
          continue
        }
        const mine = k === floor && s === stem
        if (!mine) this.flats.push({ s, k, home: `${s}|${k}`, level: t.LEVELS?.[s] !== undefined, at: this.middleOf(s, k), lamps: lampTable(rooms.length), scale: { value: 0 }, material: null, rooms: null, things: null })
        if (t.LEVELS?.[s] !== undefined) {
          if (!mine) this.addLevel(s, k) // a traced level (ground, a common floor) in full; the one walked: the scene draws it
          continue
        }
        const walls = shellWalls(u).map(at)
        // the current flat: Look's 0.15 m slab is there already, the plate only closes the gap under it; a ground-floor
        // shell (a Studio building whose flat has no column drawn) stands on the plinth: its top is the plate (no z-fight)
        const slab = k === 0 || hasShell ? [] : plate(u, rooms, mine ? -LOOK_SLAB : 0, mine ? PLATE_M - LOOK_SLAB : PLATE_M).map(at)
        if (mine) put(EXTERIOR_PLASTER, ...slab)
        const mesh = new THREE.Mesh(merge(mine ? walls : [...walls, ...slab]), materialFor(EXTERIOR_PLASTER))
        mesh.castShadow = mesh.receiveShadow = true
        mesh.visible = !mine && !hasShell // the furnished flat is drawn by the scene; this one is only its pick proxy (every flat's, under the architect's shape)
        if (flats.includes(s)) mesh.userData.flat = { stem: s, floor: k } satisfies FlatRef
        mesh.userData.level = k // a cut at a lower floor hides it (highlight)
        this.add(mesh)
        // every window real glass with its flat's rooms behind it (the walked flat: its own glass, drawn by the scene); the
        // architect's shape has its own windows
        if (mine || hasShell) continue
        const owner: TowerHit = { k, flat: flats.includes(s) ? { stem: s, floor: k } : null }
        for (const w of u.walls)
          for (const o of w.openings) {
            if (o.kind !== 'window' && o.kind !== 'slider') continue
            const g = at(paneGeo(w, u, o))
            for (let i = g.attributes.position.count / 3; i > 0; i--) this.paneOwner.push(owner)
            put('glass', g)
          }
      }
    }

    // the core, ground to roof head: its traced walls at the ground and as the stair head + lift machine room
    for (const [s, name] of hasShell ? [] : CORE) {
      const { unit: u } = FLATS[s]
      const room = this.roomsOf(s).find((r) => r.name === name)
      if (!room) continue
      for (const y of [G, R]) {
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        put(EXTERIOR_PLASTER, ...[...new Set(room.wallIds)].flatMap((id) => u.walls.filter((w) => w.id === id)).map((w) => wallGeometry(w, u)).filter((g) => !!g).map(at))
      }
      put(EXTERIOR_PLASTER, ...plate(u, [room], R + FLOOR_M, PLATE_M).map((g) => g.translate(this.shift(s).x, 0, this.shift(s).y)))
    }

    // his traced rooftop on the roof slab, in full (the one walked: the scene draws it)
    for (const s of roofLevel) {
      if (s === stem && floor === top + 1) continue
      this.addLevel(s, top + 1)
      this.flats.push({ s, k: top + 1, home: `${s}|${top + 1}`, level: true, at: this.middleOf(s, top + 1), lamps: lampTable(this.roomsOf(s).length), scale: { value: 0 }, material: null, rooms: null, things: null })
    }

    // ground floor: plinth, gardens, ramp, bays, blocks, columns; roads at street level. Under a traced ground floor the
    // plinth sits just under its lowest floor (a sunken lawn, the car ramp's foot), as the street does
    const c = this.shift() // building frame → scene: + c
    const plan = (r: Rect): Rect => [r[0] + c.x, r[1] + c.y, r[2] + c.x, r[3] + c.y]
    const flat = (r: Rect, y: number) => rectBox(plan(r), y, y + 0.01)
    const plot = new THREE.Shape(GROUND.plot.map((p) => new THREE.Vector2(p.x + c.x, p.y + c.y)))
    const plinthTop = groundLevel ? G + groundLow - 0.03 : G
    if (!hasShell) put(PAVING, new THREE.ExtrudeGeometry(plot, { depth: 0.6, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, plinthTop, 0))
    if (!hasShell) put(GREEN, ...[...GROUND.gardens.map((r) => flat(r, G)), ...ROOF.gardens.map((r) => flat(r, R))].map(meterUVs))
    if (!hasShell) put(ASPHALT, ...GROUND.ramp.map((r) => flat(r, G)))
    for (const [x0, y0, x1, y1] of hasShell ? [] : GROUND.bays) {
      const e = 0.08
      put(PAINT, ...[[x0, y0, x1, y0 + e], [x0, y1 - e, x1, y1], [x0, y0, x0 + e, y1], [x1 - e, y0, x1, y1]].map((r) => flat(r as Rect, G)))
    }
    if (!hasShell) put(EXTERIOR_PLASTER, ...[...GROUND.blocks, ...GROUND.columns].map((r) => rectBox(plan(r), G, G + WALL_M)))
    if (!hasShell) put(TANK, ...ROOF.tanks.map((r) => rectBox(plan(r), R + FLOOR_M, R + FLOOR_M + 1.2)))

    for (const [m, geos] of lists) {
      const pane = m === 'glass'
      const mesh = new THREE.Mesh(merge(geos), m === 'glass' ? this.panes : materialFor(m))
      mesh.castShadow = !pane && m !== GREEN && m !== PAINT && m !== ASPHALT
      mesh.receiveShadow = true // a pane too: its frame in the facade's shade
      if (pane) this.paneMesh = mesh // picked: a ray through a window names the flat behind it (paneOwner)
      if (m === PAVING) mesh.userData.level = 0 // the plinth: his traced ground floor stands on it when cut there
      this.add(mesh)
    }
    this.box.setFromObject(this)

    // his traced basements (after the box: the view frames the tower above ground), in full, each its own group so picking
    // one in the floor picker can hide everything that stands above it (cut); under the street: a basement reaching past
    // the plinth must not show its wall tops on the road
    for (const { floor: k, standIns = [] } of FLOORS.filter((f) => f.floor < 0))
      for (const s of standIns) if (!(k === floor && s === stem)) this.addLevel(s, k, this.streetY - this.levelOf(k) - 0.01)

    // the street (context.ts, the same as the walk's): the drawing's roads and the neighbours round the plot, a few metres
    // off; a unit with a site (Studio → Site): the map's own roads and blocks instead
    this.street = buildStreet(unit, streetOf(t, stem), this.streetY)
    this.add(this.street)

    // the picked flat's lift and the hover's: drawn last, over everything of theirs that is seen (liftMeshes)
    this.overlay.add(...this.lift.meshes, ...this.hoverLift.meshes)
    this.overlay.userData.overlay = true
    this.add(this.overlay)
    this.hoverLift.show(false)
    this.eye.copy(this.view(floor).eye)
    this.highlight(floor)
    void this.furnish().finally(() => (this.progress.furnished ||= performance.now())) // (a failed piece: the tower is no longer busy)
  }

  /** Flat s on floor k's middle, 1.5 m over its floor, in the scene: which flats are nearest the camera (insideOrder). */
  private middleOf(s: string, k: number): THREE.Vector3 {
    const b = core.unitBounds(this.t.FLATS[s].unit)
    const d = this.shift(s)
    return new THREE.Vector3((b.minX + b.maxX) / 2 + d.x, this.levelOf(k) + 1.5, (b.minY + b.maxY) / 2 + d.y)
  }

  /** y of floor k's finished floor (0 = ground, top + 1 = roof): an imported building's own storey heights (ELEVATIONS) where it has them, else FLOOR_M a floor. */
  levelOf(k: number): number {
    const e = this.t.ELEVATIONS
    const at = (f: number) => e?.[f] ?? f * this.t.FLOOR_M
    return at(k) - at(this.floor)
  }


  /** building-frame offset of a flat relative to the current one (plan x, y); no stem = the building frame's origin */
  private shift(stem?: string): Pt {
    const o = stem ? this.t.FLATS[stem].offset : { x: 0, y: 0 }
    const c = this.t.FLATS[this.stem].offset
    return { x: o.x - c.x, y: o.y - c.y }
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
        put(this.panes, paneGeo(w, u, o).translate(0, l.foot[0] + t * (l.foot[1] - l.foot[0]), 0)) // bare glass: its rooms lit at night (interiors)
      })
    }
    const storey = Math.min(storeyTop(u, rooms) || WALL_M, cap)
    for (const p of u.pillars ?? []) put(EXTERIOR_PLASTER, box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, core.floorLevelAt(u, p.x, p.y, rooms), storey))
    if (k >= 1 && k <= top) put(EXTERIOR_PLASTER, ...plate(u, rooms, -UNDER_LEVEL_M, PLATE_M))
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
      const flatOnly = m === BAY_PAINT || m === WATER || m === this.panes
      mesh.castShadow = !flatOnly
      mesh.receiveShadow = true
      if (flatOnly) mesh.raycast = () => {}
      group.add(mesh)
    }
    this.add(group)
    // what a buyer sees of it from outside: a ground floor's and a rooftop's outdoor pieces (trees, planters, deck furniture)
    if (k === 0 || k > top) this.furnishing.push({ s, group })
  }

  /**
   * After the tower is shown, a little a frame (it opens as fast as the shells did and fills in): every flat's rooms behind
   * its windows, nearest the camera first, a flat at a time (a drawing's geometry made once for every floor it is on:
   * interiors.ts); then the levels' outdoor pieces (their own layout by kind: furnish presets, studio/furniture.ts layoutFor)
   * through the walk view's furniture loader; then — not on Lite — every flat's furniture by the walk's presets, nearest
   * first (on Low shown on the storeys nearest the camera only: update).
   */
  private async furnish(): Promise<void> {
    let t = performance.now()
    const frame = () => new Promise<void>((ok) => requestAnimationFrame(() => ok()))
    /** a frame's share of the work done: wait for the next one; true: the tower is gone */
    const pause = async () => {
      if (performance.now() - t > 8) {
        await frame()
        t = performance.now()
      }
      return this.disposed
    }
    for (const f of insideOrder(this.flats, this.eye)) {
      const g = await this.drawing(f).rooms
      if (this.disposed) return
      if (g) this.show(f, 'rooms', g)
      if (await pause()) return
    }
    this.progress.rooms = performance.now()
    for (const { s, group } of this.furnishing) {
      const { unit: u } = this.t.FLATS[s]
      const rooms = this.roomsOf(s)
      const byId = new Map(rooms.map((r) => [r.id, r]))
      const ps = layoutFor(u, rooms)
      for (const p of ps) {
        const r = byId.get(p.roomId)
        if (p.removed || !r || !core.isOutdoor(r.kind)) continue
        const obj = await buildFurniture(p, roomCeiling(r, u, rooms), core.roomLevelAt(r, u, p.x, p.y), bottomOf(ps, p))
        if (this.disposed) return
        obj.traverse((o) => (o.raycast = () => {})) // not a flat: a click goes through
        lightPiece(obj, [0, 0]) // its materials read the daylight atlas (the walk's pieces share them): here its neutral corner, lit as before
        group.add(obj)
        this.onChange()
        if (await pause()) return
      }
    }
    if (this.tier !== 'lite')
      for (const f of insideOrder(this.flats, this.eye)) {
        const g = await this.drawing(f, pause).things
        if (this.disposed) return
        if (g) this.show(f, 'things', g)
        if (await pause()) return
      }
    this.progress.furnished = performance.now()
  }

  /** Flat f's rooms (and, given `pause`, its furniture), made once for every floor that keeps the same; a level draws its own floors. */
  private drawing(f: Inside, pause?: () => Promise<boolean>): { rooms?: Promise<THREE.BufferGeometry | null>; things?: Promise<THREE.BufferGeometry | null> } {
    const { unit: u } = this.t.FLATS[f.s]
    // as the walk opens that floor (ViewerApp prepare): its own furniture and finishes staff left there, else the drawing's,
    // else the plan's — floors that keep the same share one geometry
    const k = keptAt(u, f.k, this.t)
    const key = `${f.s}|${JSON.stringify([k.layout, k.finishes])}`
    let d = this.drawn.get(key)
    if (!d) this.drawn.set(key, (d = {}))
    d.rooms ??= roomsGeometry(u, this.roomsOf(f.s), WALL_M, this.t.LEVELS?.[f.s] === undefined, k.finishes)
    if (pause) d.things ??= furnitureGeometry(k.layout ? { ...u, furniture: k.layout } : u, this.roomsOf(f.s), pause)
    return d
  }

  /** Flat f's rooms or furniture on screen at its place, in its own material (its lamps), cut and tiered as the rest. */
  private show(f: Inside, which: 'rooms' | 'things', g: THREE.BufferGeometry): void {
    if (!f.material) this.own.push((f.material = interiorMaterial(f.lamps, f.scale)))
    const mesh = new THREE.Mesh(g, f.material)
    const d = this.shift(f.s)
    mesh.position.set(d.x, this.levelOf(f.k), d.y)
    mesh.receiveShadow = true // a sun patch on its floor; the shells and slabs cast
    mesh.raycast = () => {} // a ray through a window is the pane's (pickAt)
    mesh.userData = { level: f.k, inside: true }
    if (this.cuts(this.picked) && f.k > this.picked) (mesh.visible = false), (mesh.userData.cut = true)
    f[which] = mesh
    this.add(mesh)
    this.lightFlat(f)
    this.placeInside()
    this.onChange()
  }

  /** Every flat's furniture shown as the tier says (furnishes; on Low the picked floor too), unless a cut hides its floor. */
  private placeInside(): void {
    for (const f of this.flats) if (f.things) f.things.visible = !f.things.userData.cut && furnishes(this.tier, f.k, this.furnishedFloors, this.picked)
  }

  /** Flat f's lamps (flatLamps): the picked flat's while the Lights are on, a common level's at night, the others the night pattern. */
  private lightFlat(f: Inside): void {
    const how = f.k === this.picked && this.pickedStems.includes(f.s) ? 'picked' : f.level ? 'level' : 'home'
    const rooms = this.roomsOf(f.s)
    flatLamps(f.home, rooms, how).forEach((v, i) => setLamp(f.lamps, i, v, hash01(`${f.home}|${rooms[i].id}|tint`)))
    f.scale.value = how === 'picked' ? (this.lampsOn ? 1 : 0) : this.night
  }

  /** The camera moved (PlotlineScene, every frame in this view): the nearest flats are built first; on Low the storeys nearest it show their furniture. */
  update(eye: THREE.Vector3): void {
    this.eye.copy(eye)
    if (this.tier !== 'low') return
    const near = nearestStoreys(this.flats.map((f) => ({ k: f.k, d: f.at.distanceTo(eye) })), LOW_STOREYS)
    if (this.furnishedFloors && near.size === this.furnishedFloors.size && [...near].every((k) => this.furnishedFloors!.has(k))) return
    this.furnishedFloors = near
    this.placeInside()
    this.onChange()
  }

  /**
   * Thin skins just outside the outer walls of what stands on floor k (stems; outer to all of them), in the tower's frame:
   * the whole storey from the slab under it to the one over it — over a balcony's parapet too, so a balcony front lifts as a
   * wall does (and the balcony seen through it); a level's walls to their own height (a rooftop's parapet), its kerbs and zone
   * lines have no face. `off`: how far out (m) past the wall's face, so the picked flat's lift lies over the hover's.
   */
  private skins(k: number, stems: string[], off: number): THREE.BufferGeometry[] {
    const PLATE_M = this.t.FLOOR_M - WALL_M
    const y = this.levelOf(k)
    const roof = k > topFloor(this.t) // the top floor's flats standing in for the roof: the slab and its parapet
    const geos: THREE.BufferGeometry[] = []
    for (const s of stems) {
      const { unit: u } = this.t.FLATS[s]
      const rooms = this.roomsOf(s)
      const level = this.t.LEVELS?.[s] !== undefined
      const sh = this.shift(s)
      // outside means outside all of them: no skin along the wall two flats share (it would cross the roof)
      const inside = (p: Pt) => !!core.roomAt(p, rooms, u) || stems.some((o) => o !== s && this.inFlat(o, { x: p.x + sh.x - this.shift(o).x, y: p.y + sh.y - this.shift(o).y }))
      for (const w of u.walls) {
        if (!(w.heightM >= (level ? 0.9 : 0.01))) continue // a zone line; on a level a kerb too
        const side = outerSide(w, u, inside)
        if (!side) continue
        const L = core.wallFrame(w, u.vertices).lengthM
        const t = w.thicknessM / 2
        geos.push(alongWall(w, u, -t, L + t, level ? -UNDER_LEVEL_M : -PLATE_M, level ? Math.min(w.heightM, this.t.FLOOR_M) : roof ? PARAPET_M : WALL_M, side * (t + off), side * (t + off + 0.005)).translate(sh.x, y, sh.y))
      }
    }
    return geos
  }

  /** What stands on floor k: its flats and stand-ins (a traced level, massing); the roof without a traced rooftop: the top floor's, with their parapets. */
  private onFloor(k: number): string[] {
    const { FLOORS, LEVELS } = this.t
    const entry = FLOORS.find((f) => f.floor === k)
    if (entry) return [...entry.flats, ...(entry.standIns ?? [])]
    const top = topFloor(this.t)
    const under = k === top + 1 && FLOORS.find((f) => f.floor === top)
    return under ? [...under.flats, ...(under.standIns ?? []).filter((s) => LEVELS?.[s] === undefined)] : []
  }

  /** What is picked on floor k: the current type if it is on that floor, else all its flats; on a floor without flats its stand-ins (a traced level: ground, basement, rooftop; massing). */
  private pickedOn(k: number): string[] {
    const entry = this.t.FLOORS.find((f) => f.floor === k)
    return !entry ? [] : entry.flats.includes(this.stem) ? [this.stem] : entry.flats.length ? entry.flats : (entry.standIns ?? [])
  }

  /**
   * Floor k picked: its flat(s) (pickedOn) lifted — everything of theirs seen from outside brighter (the lift) and their
   * lamps on while the Lights are — and the lift taken off the flat picked before. A cut floor (cuts(k)): everything standing
   * above it is hidden so it can be seen (the scene hides the furnished flat, and the street plane under ground) — but the
   * street, its roads and the neighbour blocks stay: they stand round the plot, not over the floor looked at.
   */
  highlight(k: number): void {
    this.picked = k
    this.pickedStems = this.pickedOn(k)
    const cut = this.cuts(k)
    for (const o of this.children) {
      if (o === this.street || o.userData.overlay) continue
      const hide = cut && !(typeof o.userData.level === 'number' && o.userData.level <= k)
      if (hide && o.visible) (o.visible = false), (o.userData.cut = true)
      else if (!hide && o.userData.cut) (o.visible = true), delete o.userData.cut
    }
    this.placeInside()
    const geos = this.skins(k, this.pickedStems, 0.03)
    this.lift.meshes[0].geometry.dispose()
    this.lift.shape(geos.length ? merge(geos) : new THREE.BufferGeometry())
    for (const f of this.flats) this.lightFlat(f)
    if (this.washed !== null) this.hover(this.washed) // a cut may hide the floor hovered
  }

  /**
   * The storey under the pointer (or the floor list's row under it) a little brighter: everything on it, its walls to their
   * own height — quieter than the picked flat's lift; null takes it away. A floor the cut hides is not lifted.
   */
  hover(k: number | null): void {
    this.washed = k
    const hidden = k === null || (this.cuts(this.picked) && k > this.picked) || (k < 0 && this.picked >= 0)
    this.hoverLift.show(!hidden)
    if (hidden) return
    let g = this.washes.get(k)
    if (!g) {
      const geos = this.skins(k, this.onFloor(k), 0.02)
      this.washes.set(k, (g = geos.length ? merge(geos) : new THREE.BufferGeometry()))
    }
    this.hoverLift.shape(g)
  }

  /** Picking floor k hides what stands above it: a basement, or the ground floor he traced (the built-in towers: never). */
  cuts(k: number): boolean {
    return k < 0 || (k === 0 && Object.values(this.t.LEVELS ?? {}).includes(0))
  }

  /**
   * What a ray points at on the tower: the floor (a shell's or a level's own, else the height of the hit: the core, the roof,
   * the ground's pieces) and the flat, if it is one (a stand-in, a level, the core: none). Walls, plates, proxies and the
   * flats' panes occlude (a window names the flat behind it); the rooms behind the glass and the furniture let it through;
   * what a cut hides is not there, nor what lies under the street (the street plane is in front of it) unless a basement is
   * picked. null: nothing of the tower.
   */
  pickAt(ray: THREE.Raycaster): TowerHit | null {
    // nearest box first, and no further once a hit is nearer than the next box: the same hit, a few meshes tested instead of
    // every flat of the column (a mouse over the tower picks once a frame: ≈ 2.5 ms → a fraction)
    const r = ray.ray
    const near = this.children
      .filter((o) => o !== this.street && !o.userData.overlay && !o.userData.inside && (o.visible || !o.userData.cut))
      .map((o) => {
        let b = this.boxes.get(o)
        if (!b) this.boxes.set(o, (b = new THREE.Box3().setFromObject(o)))
        return { o, d: b.containsPoint(r.origin) ? 0 : (r.intersectBox(b, HIT)?.distanceTo(r.origin) ?? Infinity) }
      })
      .filter((x) => x.d < Infinity)
      .sort((a, b) => a.d - b.d)
    let hit: THREE.Intersection | undefined
    for (const { o, d } of near) {
      if (hit && hit.distance < d) break
      const h = ray.intersectObject(o, true)[0]
      if (h && (!hit || h.distance < hit.distance)) hit = h
    }
    if (!hit || (hit.point.y < this.streetY - 0.02 && this.picked >= 0)) return null
    if (hit.object === this.paneMesh) return this.paneOwner[hit.faceIndex ?? -1] ?? null
    let o: THREE.Object3D | null = hit.object
    while (o && o !== this && typeof o.userData.level !== 'number') o = o.parent
    const k = o && o !== this ? (o.userData.level as number) : floorAtY(hit.point.y, this.levels)
    return k === null ? null : { k, flat: (hit.object.userData.flat as FlatRef | undefined) ?? null }
  }

  /**
   * After Look.setHour: the sun's shadow frustum around the whole tower (Look's covers the flat only), reaching the street
   * behind it; the panes dim with the haze at dusk; the rooms' lamps come on as the sky goes (the picked flat's: `lamps`, the
   * Lights button's state — render.ts lightsOn); no shadow maps (`shadows` false, Lite): no sun inside, it would pour through
   * the ceilings. The lifts' night light is set as seen on screen: `linear` (High draws into a linear target, exposed after)
   * takes the exposure and the screen's curve back out of it.
   */
  setSun(sun: THREE.DirectionalLight, night = 0, exposure = 1, lamps = false, linear = false, shadows = true): void {
    this.paneSky.value = PANE_HAZE * (1 - night) // the haze they mirror goes with the light
    this.night = night
    this.lampsOn = lamps
    inside.sun.value = shadows ? 1 : 0
    for (const f of this.flats) this.lightFlat(f)
    const seen = (v: number) => (linear ? new THREE.Color().setRGB(v, v, v, THREE.SRGBColorSpace).r / exposure : v)
    const times = (v: number) => (linear ? v : Math.pow(1 + v, 1 / 2.2) - 1) // on screen: the same lift as High's once its picture is encoded
    this.lift.strength(times(PICK_LIFT), seen(PICK_NIGHT * night))
    this.hoverLift.strength(times(HOVER_LIFT), seen(HOVER_NIGHT * night))
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
    for (const { group } of this.furnishing) group.children.filter((o) => o.userData.kind === 'furniture').forEach((o) => o.removeFromParent())
    this.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.washes.forEach((g) => g.dispose())
    this.street.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose())
    this.own.forEach((m) => m.dispose())
    for (const f of this.flats) f.lamps.dispose()
    this.removeFromParent()
  }
}

/** A flat with rooms behind its windows: its drawing and floor, its key (roomLight), a common level (lit at night), its middle, its lamps' table and their strength, its material and meshes once built. */
interface Inside {
  s: string
  k: number
  home: string
  level: boolean
  at: THREE.Vector3
  lamps: THREE.DataTexture
  scale: { value: number }
  material: THREE.MeshStandardMaterial | null
  rooms: THREE.Mesh | null
  things: THREE.Mesh | null
}

/** The flats nearest `eye` first (by their middles; ties keep the list's order). */
export function insideOrder<T extends { at: THREE.Vector3 }>(flats: T[], eye: THREE.Vector3): T[] {
  return flats.map((f, i) => ({ f, i, d: f.at.distanceTo(eye) })).sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.f)
}

/** The `n` storeys whose nearest flat (`d`: its distance to the camera) is nearest: Low's furnished storeys. */
export function nearestStoreys(flats: { k: number; d: number }[], n: number): Set<number> {
  const best = new Map<number, number>()
  for (const f of flats) best.set(f.k, Math.min(best.get(f.k) ?? Infinity, f.d))
  return new Set([...best].sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, n).map((x) => x[0]))
}

/** Does a flat on floor k show its furniture: High every one, Low the storeys nearest the camera (`near`; not yet known: none) and the picked floor, Lite none. */
export const furnishes = (tier: Quality, k: number, near: Set<number> | null, picked?: number): boolean => tier === 'high' || (tier === 'low' && (k === picked || !!near?.has(k)))

/**
 * Each room's lamp (0–1) in flat `home` (its stem and floor): the picked flat's indoor rooms all lit (its lamps on, as the
 * walked flat's are at night in the walk), a common level's indoor rooms lit (a lobby, a gym, the stair head), any other
 * flat's by the night pattern (roomLight, the same on every visit); a balcony, a shaft, an open zone: none.
 */
export function flatLamps(home: string, rooms: Room[], how: 'picked' | 'level' | 'home'): number[] {
  return rooms.map((r) => (!indoor(r) ? 0 : how === 'home' ? roomLight(home, r.id) : ALWAYS_LIT))
}

/**
 * A lift (the picked flat's, the hover's): its skins drawn three times after everything else — their depth (nothing drawn),
 * then where that depth is theirs what is already on screen × (1 + mul), and a faint warm light (at night). Each pixel once,
 * the nearest skin's (two skins meeting at a corner are not lifted twice; over the picked flat the hover gives way to its
 * lift); what is behind the skin is what is lifted — the wall, the frame, the room through the glass — never a tree or a
 * neighbour in front of it (the depth test). Three tiny draws; no material of the tower changes, no program per flat.
 */
function liftMeshes(order: number) {
  const pass = (kind: 0 | 1 | 2) => {
    // (all three pulled the same way toward the eye: the skin wins the wall it lies 2 cm off from the street too, and the
    // colour passes still meet the depth pass exactly)
    const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, toneMapped: false, depthWrite: kind === 0, colorWrite: kind !== 0, depthFunc: kind === 0 ? THREE.LessEqualDepth : THREE.EqualDepth, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })
    if (kind) {
      Object.assign(m, { blending: THREE.CustomBlending, blendSrc: kind === 1 ? THREE.DstColorFactor : THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor })
      m.onBeforeCompile = (s) => void (s.fragmentShader = s.fragmentShader.replace('#include <colorspace_fragment>', '')) // its colour is a factor, not a colour to show
      m.customProgramCacheKey = () => 'tower-lift'
    }
    return m
  }
  const materials = [pass(0), pass(1), pass(2)]
  const geo = new THREE.BufferGeometry()
  const meshes = materials.map((m, i) => {
    const x = new THREE.Mesh(geo, m)
    x.renderOrder = order + i // both lifts' depths before either's colour
    x.raycast = () => {}
    return x
  })
  let on = true
  let add = 0
  const show = (v: boolean) => {
    on = v
    meshes.forEach((x, i) => (x.visible = v && (i < 2 || add > 0)))
  }
  return {
    meshes,
    materials,
    shape: (g: THREE.BufferGeometry) => meshes.forEach((x) => (x.geometry = g)),
    show,
    strength: (mul: number, light: number) => {
      materials[1].color.setScalar(mul)
      materials[2].color.setRGB(light, light * 0.86, light * 0.7) // warm: the flat's own lamplight on its walls, not a grey veil
      add = light
      show(on)
    },
  }
}
