/**
 * Building view: the whole tower around the current flat (data/building: towerOf picks BTI's or Sheltech's). Every
 * other flat is a SHELL — its traced walls (wallGeometry: openings cut) and a floor plate, merged into one mesh per flat
 * per floor; windows and sliders are panes with a room behind them (paneMaterial: curtains, blinds, a light at night — one
 * merged mesh), doors stay as voids. No furniture, lights or ceilings. The ground floor and rooftop are boxes and planes (data/building/*-tower.ts); the lift/stair core
 * walls run through both.
 *
 * Frame: the current flat stays where it is (its floor at y = 0, plan = world X/Z), the tower is placed around it:
 * a flat's plan point p lands at p + offset(flat) − offset(current), floor k at (k − current floor) · FLOOR_M.
 * The current flat itself is the furnished unit; here it only gets an invisible pick proxy and the bit of plate
 * under Look's slab.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { MaterialRef, Opening, Pt, Room, Unit, Wall } from '../core'
import { floorIn, stemIn, streetOf, topFloor, towerOf, voidsOver, type Tower } from '../data/building'
import type { Rect } from '../data/building/demo-tower'
import { finishSlotsFor } from '../furnish/finishes'
import { bottomOf, layoutFor } from '../studio/furniture'
import { buildStreet, haze } from './context'
import { KERB_M, bayLineGeometry, bayMarkings, floorGeometry, liftWall, liftedWall, poolBasin, roomCeiling, stepFaces, stepGeometry, storeyTop, wallGeometry, wallLift } from './details'
import { lightPiece } from './daylight'
import { buildFurniture } from './furniture'
import { DAY_EXPOSURE, SITE_REACH_M } from './render'
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
/** --accent and --bg (src/index.css): the picked floor's bands, the hover's wash */
const ACCENT = new THREE.Color('#2458a6')
const MARBLE = new THREE.Color('#f5f3ef')
const PAVING: MaterialRef = { kind: 'color', color: '#9d988f', roughness: 0.9 }
/** lawn strips on the ground floor and the roof: the turf scan (furnish, wave 11), metre UVs so it tiles at its real size */
const GREEN: MaterialRef = { kind: 'pbr', textureId: 'turf' }
const ASPHALT: MaterialRef = { kind: 'color', color: '#5b5955', roughness: 0.95 }
const PAINT: MaterialRef = { kind: 'color', color: '#e8e6e0', roughness: 0.8 }
const TANK: MaterialRef = { kind: 'color', color: '#2a2b2c', roughness: 0.6 }
/** the haze the glass mirrors by day (setSun: × the day's share), mostly at a slant (Fresnel) */
const PANE_HAZE = 2
/** a lit room's light through its window at night (setSun: × night), scene units before the night's exposure */
const PANE_GLOW = 0.2
/** a room lit at night whatever the pattern says: a common level's (a lobby, a gym, the stair head) and the current flat's (its lamps are on) — a little under a home's brightest */
const ALWAYS_LIT = 0.85

/**
 * The tower's panes as lived-in windows (session 31 pick; founder 2026-11-21: "the entire building's windows are dark except
 * for the selected floor. that is a buzzkill. we need realism"). Each pane draws, from its own data (paneGeo), what stands
 * behind float glass: the room (dim, its ceiling a little lighter), the room's curtains in one colour a room — drawn to the
 * sides, across as a sheer, or a blind part way down, or none — and the aluminium frame with its sashes' meeting stiles. By
 * day the card takes the daylight as any wall does and the glass mirrors the haze (context.ts `haze`) over it, more at a
 * slant; at night a lit room (roomLight) glows warm, neutral or cool from a ceiling light near the pane's head, its curtains
 * glowing their own colour. Edges, folds and slats fade under a pixel (fwidth): no shimmer as the tower turns. No texture,
 * no extra draw: one program for every pane of the tower, on every tier.
 */
function paneMaterial(sky: { value: number }, night: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 })
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    s.uniforms.paneSky = sky
    s.uniforms.paneNight = night
    s.vertexShader = `attribute vec4 pane;\nattribute vec4 paneLook;\nvarying vec4 vPane;\nflat varying vec4 vLook;\n${s.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvPane = pane;\nvLook = paneLook;',
    )
    s.fragmentShader = `${PANE_PARS}${s.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>\n${PANE_CARD}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${PANE_LIGHT}`)
      .replace('#include <opaque_fragment>', 'outgoingLight += paneRefl;\n#include <opaque_fragment>')
  }
  m.customProgramCacheKey = () => 'tower-pane'
  return m
}
const PANE_PARS = /* glsl */ `uniform vec3 hazeColor;
uniform float paneSky;
uniform float paneNight;
varying vec4 vPane;
flat varying vec4 vLook;
`
/**
 * vPane: across / up the pane 0–1, its width and height (m); vLook (paneGeo's look, the same over the whole pane: `flat`,
 * never a per-pixel hash — a constant interpolated across a triangle wobbles in its last bits and a hash turned that into
 * speckle): the room's curtain colour, how this window is dressed (< 0: bare glass), the room's light colour and brightness.
 */
const PANE_CARD = /* glsl */ `
vec2 pm = vPane.xy * vPane.zw;
vec2 paneAa = fwidth(pm) + 1e-4;
float paneRa = vLook.x, paneRb = vLook.y, paneRc = fract(vLook.y * 7.31);
vec3 paneRoom = mix(vec3(0.028, 0.026, 0.024), vec3(0.07, 0.066, 0.06), smoothstep(0.15, 0.95, vPane.y));
vec3 paneCloth = paneRa < 0.24 ? vec3(0.6, 0.54, 0.42) : paneRa < 0.44 ? vec3(0.66, 0.66, 0.63) : paneRa < 0.6 ? vec3(0.42, 0.35, 0.26) : paneRa < 0.73 ? vec3(0.3, 0.33, 0.26) : paneRa < 0.86 ? vec3(0.26, 0.3, 0.37) : vec3(0.4, 0.22, 0.15);
float paneFold = 1.0 - 0.2 * (0.5 + 0.5 * sin(pm.x * 38.0 + paneRb * 6.283)) * (1.0 - smoothstep(0.03, 0.08, paneAa.x));
float paneCover = 0.0;
if (paneRb >= 0.0) {
  if (paneRb < 0.42) paneCover = smoothstep(-paneAa.x, paneAa.x, abs(pm.x - 0.5 * vPane.z) - (0.1 + 0.3 * paneRc) * vPane.z);
  else if (paneRb < 0.68) paneCover = 0.82;
  else if (paneRb < 0.86) {
    paneCover = smoothstep(-paneAa.y, paneAa.y, pm.y - (0.45 - 0.4 * paneRc) * vPane.w);
    paneFold = mix(0.91, 0.82 + 0.18 * step(0.45, fract(pm.y * 12.0)), 1.0 - smoothstep(0.03, 0.06, paneAa.y));
    paneCloth = mix(paneCloth, vec3(0.58, 0.56, 0.52), 0.65);
  }
}
float paneN = vPane.z > 1.8 ? 3.0 : 2.0;
vec2 paneEdge = min(pm, vPane.zw - pm);
float paneFrame = max(1.0 - smoothstep(0.05 - paneAa.x, 0.05 + paneAa.x, paneEdge.x), 1.0 - smoothstep(0.05 - paneAa.y, 0.05 + paneAa.y, paneEdge.y));
paneFrame = max(paneFrame, 1.0 - smoothstep(0.02 - paneAa.x, 0.02 + paneAa.x, abs(fract(vPane.x * paneN + 0.5) - 0.5) * vPane.z / paneN));
diffuseColor.rgb = mix(mix(paneRoom, paneCloth * paneFold, paneCover) * 0.7, vec3(0.5, 0.51, 0.52), paneFrame);
vec3 paneRefl = vec3(0.0);
`
const PANE_LIGHT = /* glsl */ `
{
  float rt = vLook.z;
  vec3 paneTint = rt < 0.5 ? vec3(1.0, 0.62, 0.3) : rt < 0.84 ? vec3(1.0, 0.78, 0.52) : vec3(0.88, 0.86, 0.8);
  float paneLamp = 0.25 + 0.75 * exp(-(pow((vPane.x - 0.5) * 1.6, 2.0) + pow((vPane.y - 0.92) * 1.9, 2.0)));
  vec3 paneThrough = mix(vec3(paneLamp), paneCloth * (1.2 + 0.4 * paneLamp) * paneFold, paneCover);
  totalEmissiveRadiance = (1.0 - paneFrame) * vLook.w * paneNight * paneTint * paneThrough;
  float paneFr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 5.0);
  paneRefl = (1.0 - paneFrame) * hazeColor * paneSky * (0.05 + 0.95 * paneFr) * (0.55 + 0.45 * vPane.y);
}
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

/**
 * A window's look (paneMaterial's vLook), fixed by its keys: its room's curtain colour and light colour (one a room), how
 * this window is dressed (`pane` null: bare glass, a common level's) and how lit its room is at night.
 */
const paneLook = (room: string, pane: string | null, light: number): number[] => [hash01(room), pane === null ? -1 : hash01(pane), hash01(`${room}|tint`), light]

/** Opening o's pane (2 cm thick at the wall's middle) with its card's data on every vertex (paneMaterial): across / up it, its size, its look. */
function paneGeo(w: Wall, unit: Unit, o: Opening, look: number[]): THREE.BufferGeometry {
  const g = box(o.offsetM, -0.01, o.offsetM + o.widthM, 0.01, o.sillM, o.sillM + o.heightM)
  const p = g.attributes.position
  const a = new Float32Array(p.count * 4)
  const b = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) {
    a.set([(p.getX(i) - o.offsetM) / o.widthM, (p.getY(i) - o.sillM) / o.heightM, o.widthM, o.heightM], i * 4)
    b.set(look, i * 4)
  }
  return g.setAttribute('pane', new THREE.BufferAttribute(a, 4)).setAttribute('paneLook', new THREE.BufferAttribute(b, 4)).applyMatrix4(wallMatrix(w, unit))
}

/** The room a window lights: the one on its inner side (a bedroom before its balcony), or null. */
function roomBehind(w: Wall, unit: Unit, rooms: Room[], o: Opening): Room | null {
  const f = core.wallFrame(w, unit.vertices)
  const t = o.offsetM + o.widthM / 2
  const off = w.thicknessM / 2 + 0.05
  const at = (s: number) => core.roomAt({ x: f.origin.x + f.dir.x * t - f.dir.y * off * s, y: f.origin.y + f.dir.y * t + f.dir.x * off * s }, rooms, unit)
  const both = [at(1), at(-1)].filter((r): r is Room => !!r && !core.isOutdoor(r.kind))
  return both.find((r) => r.kind !== 'balcony') ?? both[0] ?? null
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

const KEEP = new Set(['position', 'normal', 'uv', 'pane', 'paneLook'])
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
  private readonly mark: THREE.Mesh
  /** the pale wash over the storey under the pointer (hover), its geometry per floor once made */
  private readonly wash: THREE.Mesh
  private readonly washes = new Map<number, THREE.BufferGeometry>()
  private washed: number | null = null
  /** the floor picked (highlight): under the street only a picked basement is seen (the street plane hides the rest) */
  private picked: number
  /** every floor from the lowest basement to the roof with its finished floor's y (pickAt's floorAtY) */
  private readonly levels: [number, number][] = []
  /** each piece's box (pickAt), once: the tower does not move */
  private readonly boxes = new Map<THREE.Object3D, THREE.Box3>()
  /** the haze in the panes by day, the rooms' light at night (setSun) */
  private readonly paneSky = { value: PANE_HAZE }
  private readonly paneNight = { value: 0 }
  /** every pane of the tower: a window with a room behind it (paneMaterial) */
  private readonly panes = paneMaterial(this.paneSky, this.paneNight)
  private readonly own: THREE.Material[] = [this.panes]
  private readonly rooms = new Map<string, Room[]>()
  private readonly t: Tower

  /** null when `unit` is not a flat of a tower; it sits on unit.floor (the viewer sets that from ?floor=), else the first floor listing it. */
  static for(unit: Unit): Building | null {
    const t = towerOf(unit)
    const stem = t && stemIn(t, unit)
    return t && stem ? new Building(unit, t, stem, floorIn(t, stem, unit.floor)) : null
  }

  private constructor(unit: Unit, t: Tower, stem: string, floor: number) {
    super()
    this.t = t
    this.stem = stem
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
        if (hasShell) continue // the architect's shape has its own windows; the current flat gets cards too: in this view it is lit like the rest, never darker
        // every window a room's: its curtains in that room's colour, its light that room's (roomLight), on every floor; the
        // current flat's rooms all lit, as its lamps are at night in the walk (never darker than the rest)
        const home = `${s}|${k}`
        for (const w of u.walls)
          for (const o of w.openings) {
            if (o.kind !== 'window' && o.kind !== 'slider') continue
            const r = roomBehind(w, u, rooms, o)
            put('glass', at(paneGeo(w, u, o, paneLook(`${home}|${r?.id ?? o.id}`, `${home}|${o.id}`, !r ? 0 : mine ? ALWAYS_LIT : roomLight(home, r.id)))))
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
    for (const s of roofLevel) if (!(s === stem && floor === top + 1)) this.addLevel(s, top + 1)

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
      mesh.receiveShadow = true // a pane too: its curtains in the facade's shade
      if (pane) mesh.raycast = () => {}
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

    // the picked floor's bands and the hover's wash (frosted marble, the faces behind it show through) look the same by day
    // and by night: setSun takes the camera's exposure back out of them, or at night they burned white and neon
    this.mark = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: ACCENT }))
    this.wash = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: MARBLE, transparent: true, opacity: 0.45, depthWrite: false }))
    this.own.push(this.mark.material as THREE.Material, this.wash.material as THREE.Material)
    this.wash.visible = false
    for (const m of [this.mark, this.wash]) (m.raycast = () => {}), this.add(m)
    this.highlight(floor)
    void this.furnish()
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
        const r = roomBehind(w, u, rooms, o) // a common room: bare glass, lit at night
        put(this.panes, paneGeo(w, u, o, paneLook(`${s}|${k}|${r?.id ?? o.id}`, null, r ? ALWAYS_LIT : 0)).translate(0, l.foot[0] + t * (l.foot[1] - l.foot[0]), 0))
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
   * The outdoor pieces of the levels drawn in full (their own layout by kind: furnish presets, studio/furniture.ts
   * layoutFor) through the walk view's furniture loader, one at a time after the tower is shown: it opens as fast as the
   * shells did and fills in. Interiors stay empty (not seen from outside).
   */
  private async furnish(): Promise<void> {
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
      }
    }
  }

  /**
   * Thin skins just outside the outer walls of what stands on floor k (stems; outer to all of them), in the tower's frame: `band` — accent bands on
   * the slab edges above and below its flats (the picked floor's mark); else the whole storey from the slab under it to the
   * one over it — over a balcony's parapet too, so a balcony front washes as a wall does (the hover's wash); a level's walls
   * to their own height (a rooftop's parapet), its kerbs and zone lines have no face.
   */
  private skins(k: number, stems: string[], band: boolean): THREE.BufferGeometry[] {
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
        if (!band && !(w.heightM >= (level ? 0.9 : 0.01))) continue // a zone line; on a level a kerb too
        const side = outerSide(w, u, inside)
        if (!side) continue
        const L = core.wallFrame(w, u.vertices).lengthM
        const t = w.thicknessM / 2
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        if (band) for (const v of [-PLATE_M, WALL_M]) geos.push(at(alongWall(w, u, -t, L + t, v, v + PLATE_M, side * t, side * (t + 0.03))))
        else geos.push(at(alongWall(w, u, -t, L + t, level ? -UNDER_LEVEL_M : -PLATE_M, level ? Math.min(w.heightM, this.t.FLOOR_M) : roof ? PARAPET_M : WALL_M, side * (t + 0.02), side * (t + 0.025))))
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

  /**
   * Accent bands on the slab edges above and below floor k's flat(s): the current type if it is on that floor, else all of
   * them; on a floor without flats its stand-ins' outline (a traced level: ground, basement, rooftop; massing). A cut floor (cuts(k)): everything
   * standing above it is hidden so it can be seen (the scene hides the furnished flat, and the street plane under ground) —
   * but the street, its roads and the neighbour blocks stay: they stand round the plot, not over the floor looked at.
   */
  highlight(k: number): void {
    this.picked = k
    const entry = this.t.FLOORS.find((f) => f.floor === k)
    const stems = !entry ? [] : entry.flats.includes(this.stem) ? [this.stem] : entry.flats.length ? entry.flats : (entry.standIns ?? [])
    const cut = this.cuts(k)
    for (const o of this.children) {
      if (o === this.mark || o === this.wash || o === this.street) continue
      const hide = cut && !(typeof o.userData.level === 'number' && o.userData.level <= k)
      if (hide && o.visible) (o.visible = false), (o.userData.cut = true)
      else if (!hide && o.userData.cut) (o.visible = true), delete o.userData.cut
    }
    const geos = this.skins(k, stems, true)
    this.mark.geometry.dispose()
    this.mark.geometry = geos.length ? merge(geos) : new THREE.BufferGeometry()
    if (this.washed !== null) this.hover(this.washed) // a cut may hide the floor washed
  }

  /**
   * The storey under the pointer (or the floor list's row under it), washed pale: everything on it, its walls to their own
   * height, never darker than the rest; null takes the wash away. A floor the cut hides is not washed.
   */
  hover(k: number | null): void {
    this.washed = k
    const hidden = k === null || (this.cuts(this.picked) && k > this.picked) || (k < 0 && this.picked >= 0)
    this.wash.visible = !hidden
    if (hidden) return
    let g = this.washes.get(k)
    if (!g) {
      const geos = this.skins(k, this.onFloor(k), false)
      this.washes.set(k, (g = geos.length ? merge(geos) : new THREE.BufferGeometry()))
    }
    this.wash.geometry = g
  }

  /** Picking floor k hides what stands above it: a basement, or the ground floor he traced (the built-in towers: never). */
  cuts(k: number): boolean {
    return k < 0 || (k === 0 && Object.values(this.t.LEVELS ?? {}).includes(0))
  }

  /**
   * What a ray points at on the tower: the floor (a shell's or a level's own, else the height of the hit: the core, the roof,
   * the ground's pieces) and the flat, if it is one (a stand-in, a level, the core: none). Walls, plates and proxies occlude;
   * the panes and the furniture let it through; what a cut hides is not there, nor what lies under the street (the street
   * plane is in front of it) unless a basement is picked. null: nothing of the tower.
   */
  pickAt(ray: THREE.Raycaster): TowerHit | null {
    // nearest box first, and no further once a hit is nearer than the next box: the same hit, a few meshes tested instead of
    // every flat of the column (a mouse over the tower picks once a frame: ≈ 2.5 ms → a fraction)
    const r = ray.ray
    const near = this.children
      .filter((o) => o !== this.street && o !== this.mark && o !== this.wash && (o.visible || !o.userData.cut))
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
    let o: THREE.Object3D | null = hit.object
    while (o && o !== this && typeof o.userData.level !== 'number') o = o.parent
    const k = o && o !== this ? (o.userData.level as number) : floorAtY(hit.point.y, this.levels)
    return k === null ? null : { k, flat: (hit.object.userData.flat as FlatRef | undefined) ?? null }
  }

  /**
   * After Look.setHour: the sun's shadow frustum around the whole tower (Look's covers the flat only), reaching the
   * street behind it; the panes dim with the haze at dusk, the rooms light up; the bands and the wash keep their day look.
   */
  setSun(sun: THREE.DirectionalLight, night = 0, exposure = 1): void {
    this.paneSky.value = PANE_HAZE * (1 - night) // the haze they mirror goes with the light
    this.paneNight.value = PANE_GLOW * night // the rooms' lights come on as the sky goes
    ;(this.mark.material as THREE.MeshBasicMaterial).color.copy(ACCENT).multiplyScalar(DAY_EXPOSURE / exposure)
    ;(this.wash.material as THREE.MeshBasicMaterial).color.copy(MARBLE).multiplyScalar((DAY_EXPOSURE / exposure) * (1 - 0.6 * night)) // at night a veil, not a white band
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
    this.removeFromParent()
  }
}
