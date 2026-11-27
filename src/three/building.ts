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
 * Round the flat (session 31, founder: "i went to the 1st floor and i couldn't see the playground on the ground floor"):
 * the same tower stands round it in the walk and the Dollhouse too (frame: which floors by tier, render.ts towerLevel; no
 * shadows from it on Low; the other flats' rooms behind their glass, their furniture once the Building view has been
 * opened), and its street is the walk's. What the flat draws itself the tower leaves out — a neighbour's shared lobby
 * walls, floor and rooms (sharedWith), and over the flat the floor above starts on top of Look's roof (lid) — so no two
 * surfaces ever lie in one place. Built a floor at a time (make), a flat's ordinary shell once for every floor.
 *
 * The picked flat is told by light, not lines (founder 2026-11-21: "the walls and everything should be a bit bright upon
 * selection"): everything of it seen from outside — walls, balcony fronts, frames, the rooms through its glass — a fifth
 * brighter (the lift), its lamps on at night; the storey under the pointer a little brighter (the hover).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import * as core from '../core'
import type { Id, MaterialRef, Opening, Pt, Room, Unit, Wall } from '../core'
import { floorIn, roofIn, stemIn, streetOf, topFloor, towerOf, voidsOver, type Tower } from '../data/building'
import { coveringOf, coveringsFor, isPitched, ROOF_PIECE_ASSET, type Roof } from '../data/building/roof'
import { buildProcedural } from '../furnish/procedural'
import { SOLAR } from '../furnish/procedural.meta'
import { keptAt } from '../data/building/apartments'
import { storeyUnit } from '../data/building/storeys'
import type { Rect } from '../data/building/demo-tower'
import { finishSlotsFor, outerRuns, outsideOf, type Outside } from '../furnish/finishes'
import { bottomOf, layoutFor } from '../studio/furniture'
import { buildStreet, haze } from './context'
import { KERB_M, bayLineGeometry, bayMarkings, floorGeometry, liftWall, liftedWall, poolBasin, roomCeiling, stepFaces, stepGeometry, storeyTop, wallGeometry, wallLift } from './details'
import { lightPiece } from './daylight'
import { buildFurniture, preloadModels } from './furniture'
import { furnitureGeometry, indoor, inside, interiorMaterial, lampTable, roomsGeometry, setLamp } from './interiors'
import { ROOF_M, SITE_REACH_M, TIERS, towerLevel, wideOnly, type Quality } from './render'
import { batch, CELL_M, HIDDEN } from './batch'
import { CONCRETE, EXTERIOR_PLASTER, PAINT as BAY_PAINT, fallbackColor, materialFor, noSpots, resolveFinishRef, zoneFinishRef } from './materials'
import { SPANDREL, WATER, glassOf, meterUVs, spandrelBands } from './openings'
import { balconyEdgeParts, capGeometry, faceUvs, railParts, type RailPart } from './rails'
import { roofGeometry } from './roof'

/** every drawing's rooms (interiors.ts roomsGeometry) per tower and key, for the page: built once, whichever floor is walked */
const ROOMS = new WeakMap<Tower, Map<string, Promise<THREE.BufferGeometry | null>>>()
const KEPT = new WeakSet<THREE.BufferGeometry>()
/**
 * Per tower, for the page, what every tower a stair builds for its next floor has alike (the walked floor only moves the
 * tower round the flat): a flat's ordinary shell, each traced level's meshes (addLevel; not the one right over the walked
 * floor, whose plate starts on its roof) and the street, as built at its first street level. Session 31: a stair's floor
 * built them again each time, ~150 of its ~350 ms of tower.
 */
const SHELLS = new WeakMap<Tower, Map<string, THREE.BufferGeometry>>()
const LEVELS = new WeakMap<Tower, Map<string, [MaterialRef | THREE.Material | 'panes', THREE.BufferGeometry][]>>()
const STREETS = new WeakMap<Tower, Map<string, { group: THREE.Group; y: number }>>()
/**
 * Each traced level's outdoor pieces as the page's first tower built them (furnishPieces): a later tower (a stair's floor)
 * shows copies sharing their shapes. Built again for every floor a stair reached, their code-built trees and benches were
 * new shapes each time, never freed — Sheltech A on High held ~350–600 more after every stair (session 31 open lane).
 */
const PIECES = new WeakMap<Tower, Map<string, THREE.Object3D[]>>()
const keptIn = <T>(m: WeakMap<Tower, Map<string, T>>, t: Tower): Map<string, T> => m.get(t) ?? m.set(t, new Map()).get(t)!
const keep = (o: THREE.Object3D) => o.traverse((x) => void ((x as THREE.Mesh).geometry && KEPT.add((x as THREE.Mesh).geometry)))
/** round the flat the tower is batched this long after the last thing came in (batchAround) */
const AROUND_MS = 400
/** the traced flats' walls are 3.0 m: the plate fills the storey above them */
const WALL_M = 3
/** the roof's parapet over the top floor's outer walls (no traced rooftop) */
const PARAPET_M = 1.1
/** a flat roof's covering (gravel, a green roof, terrace tiles) over its slab; a parapet cap's depth by what it is made of */
const DECK_M = 0.03
const CAP_M = { plaster: 0.06, metal: 0.03, stone: 0.08 }
/** Look's slab under the current flat (render.ts SLAB_M) */
const LOOK_SLAB = 0.15
/** the least of a plate left over the walked flat (plate's lid): the slab's top face, seen from outside */
const SKIN_M = 0.02
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
/** an overhang's fascia board and soffit, a roof window's flashing: painted white over the plaster (they cast the eaves' shadow) */
const TRIM: MaterialRef = { kind: 'pbr', textureId: 'plaster_white', tint: '#ece8e0' }
/** a flat roof's parapet cap (Roof.coping): metal, stone, or the walls' own plaster a little wider */
const COPING: Record<NonNullable<Roof['coping']>, MaterialRef> = {
  plaster: EXTERIOR_PLASTER,
  metal: { kind: 'pbr', textureId: 'metal_brushed', tint: '#a9aeb2' },
  stone: { kind: 'pbr', textureId: 'concrete', tint: '#e2dccf' },
}
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
 * `tint.on` (a frame colour chosen for the building or a window, furnish/finishes.ts FRAMES_SLOT): each pane's frame in its
 * own colour (its `paneTint` attribute, paneGeo) — a second program, only in a tower that has one.
 */
function paneMaterial(sky: { value: number }, tint: { on: boolean }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, transparent: true, depthWrite: false })
  Object.assign(m, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor })
  m.onBeforeCompile = (s) => {
    s.uniforms.hazeColor = haze
    s.uniforms.paneSky = sky
    const [a, v] = tint.on ? ['attribute vec3 paneTint;\nvarying vec3 vPaneTint;\n', 'varying vec3 vPaneTint;\n'] : ['', '']
    s.vertexShader = `${a}attribute vec4 pane;\nvarying vec4 vPane;\n${s.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>\nvPane = pane;${tint.on ? '\nvPaneTint = paneTint;' : ''}`)
    s.fragmentShader = `${v}uniform vec3 hazeColor;\nuniform float paneSky;\nvarying vec4 vPane;\n${s.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>\n${tint.on ? PANE_FRAME.replace(PANE_ALU, 'vPaneTint') : PANE_FRAME}`)
      .replace('#include <opaque_fragment>', `${PANE_GLASS}\n#include <opaque_fragment>`)
    s.vertexShader = noSpots(s.vertexShader) // the walked flat's lamps are not the tower's (materials.ts noSpots)
    s.fragmentShader = noSpots(s.fragmentShader)
  }
  m.customProgramCacheKey = () => (tint.on ? 'tower-pane-tint' : 'tower-pane')
  m.userData.merge = true // round the flat its panes are one batch (batchAround): each adds the haze it mirrors over what is behind
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
/** the frame's own grey in PANE_FRAME (linear): a tinted pane reads its colour instead */
const PANE_ALU = 'vec3(0.5, 0.51, 0.52)'
const PANE_GREY = new THREE.Color(0.5, 0.51, 0.52)
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
function paneGeo(w: Wall, unit: Unit, o: Opening, tint?: THREE.Color): THREE.BufferGeometry {
  const g = box(o.offsetM, -0.01, o.offsetM + o.widthM, 0.01, o.sillM, o.sillM + o.heightM)
  const p = g.attributes.position
  const a = new Float32Array(p.count * 4)
  for (let i = 0; i < p.count; i++) a.set([(p.getX(i) - o.offsetM) / o.widthM, (p.getY(i) - o.sillM) / o.heightM, o.widthM, o.heightM], i * 4)
  // its frame's colour (a tower with a frame chosen: paneMaterial's tint), linear, on every vertex
  if (tint) g.setAttribute('paneTint', new THREE.BufferAttribute(new Float32Array(p.count * 3).map((_, i) => [tint.r, tint.g, tint.b][i % 3]), 3))
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
  /** the wall it is on (a wall, a parapet, a window's): its drawing's id and its run (finishes.ts outerRuns) — Finishes' outside card;
   *  the wall itself and the stem it stands in — a balcony edge's Made of card (qa4fix) */
  wall?: { drawing: Id; run: Id; id?: Id; stem?: string }
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

/** Over the walked flat (its plan point `over`, the unit's own frame) a plate of the floor above stops at `y` (its own frame): Look's roof is there. */
export type Lid = { over: (p: Pt) => boolean; y: number }

/**
 * A flat's floor plate, top at `top`, `h` thick: room polygons (not shafts: open to the sky) + a strip under every wall
 * to its faces (`walls`: only those — a rooftop's slab over its closed rooms must not lay a beam over every parapet). A
 * piece over the walked flat (`lid`, by its room's middle or its wall's) starts no lower than the lid, but keeps its top
 * SKIN_M: a flat whose walls reach the slab (the Studio's 10 ft walls under a 3.198 m storey) had no roof over it from outside.
 */
export function plate(unit: Unit, rooms: Room[], top: number, h: number, walls: Wall[] = unit.walls, lid?: Lid): THREE.BufferGeometry[] {
  const bottom = (p: Pt) => (lid?.over(p) ? Math.min(Math.max(top - h, lid.y), top - SKIN_M) : top - h)
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
    if (top - b >= 0.005) out.push(edgeOf(alongWall(w, unit, -t, f.lengthM + t, b, top, -t, t), w.id)) // (its outer side: the slab's edge)
  }
  return out
}

/** g is an edge of wall `id` ('': of no wall, a ground column): the building's Edges and caps dress it (Building.edgesBy). */
const edgeOf = (g: THREE.BufferGeometry, id: Id): THREE.BufferGeometry => ((g.userData.edgeOf = id), g)
/** lists of [material, geometries] as one, a material's geometries together (one group, one draw each) */
const joined = (...lists: [MaterialRef, THREE.BufferGeometry[]][][]): [MaterialRef, THREE.BufferGeometry[]][] => {
  const m = new Map<MaterialRef, THREE.BufferGeometry[]>()
  for (const l of lists) for (const [r, gs] of l) m.set(r, [...(m.get(r) ?? []), ...gs])
  return [...m]
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

// (none — a floor still a picture to trace, nothing drawn on it yet — is an empty geometry, not a crash)
const merge = (geos: THREE.BufferGeometry[]) => {
  const g = geos.length ? mergeGeometries(geos)! : new THREE.BufferGeometry()
  geos.forEach((x) => x.dispose())
  return g
}

/**
 * A shell's geometry: `base` (in the plaster: walls, columns, plate) and, where an outside finish is chosen (Building.dressed),
 * each finish's walls — a group each, their refs in group order (userData.refs). Nothing dressed: merge's one geometry, as always.
 */
function grouped(base: THREE.BufferGeometry[], dressed?: [MaterialRef, THREE.BufferGeometry[]][] | false): THREE.BufferGeometry {
  if (!dressed || !dressed.length) return merge(base)
  const parts: [MaterialRef, THREE.BufferGeometry[]][] = [...(base.length ? [[EXTERIOR_PLASTER, base] as [MaterialRef, THREE.BufferGeometry[]]] : []), ...dressed]
  const g = mergeGeometries(parts.map(([, gs]) => merge(gs)), true)!
  g.userData.refs = parts.map(([r]) => r)
  return g
}

const KEEP = new Set(['position', 'normal', 'uv', 'pane', 'paneTint'])
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

/**
 * A flat as its project's set prints its storey (Tower.STOREYS, session 31 heights): its full walls as tall as its floor's
 * walls — its ceiling where the tower draws that floor's slab (a traced ground floor or basement too: its parapets and low
 * walls keep theirs; the rooftop has no storey); every flat of a tower with no storeys read as it is. Only what the 3D draws:
 * the drawing itself keeps its walls.
 */
export function onStorey(unit: Unit): Unit {
  const t = towerOf(unit)
  const stem = t?.STOREYS && stemIn(t, unit)
  return t?.STOREYS && stem ? storeyUnit(unit, t.STOREYS.walls[floorIn(t, stem, unit.floor)]) : unit
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
  /** make(): the street round the tower */
  private street = new THREE.Group()
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
  /** a frame colour chosen (Outside.framed): the panes carry theirs (paneMaterial) — set in the constructor, before any is drawn */
  private readonly paneTint = { on: false }
  /** every pane of the tower: real glass with the room behind it (paneMaterial) */
  private readonly panes = paneMaterial(this.paneSky, this.paneTint)
  /** the building's outside as staff chose it (furnish/finishes.ts outsideOf): what its walls and frames wear; nothing chosen, as always drawn */
  private readonly out: Outside
  /** each floor's merged panes (pickAt: a ray through a window names the flat behind it) and what each of its triangles belongs to */
  private readonly paneOwners = new Map<THREE.Object3D, TowerHit[]>()
  private readonly own: THREE.Material[] = [this.panes, ...this.lift.materials, ...this.hoverLift.materials]
  private readonly rooms = new Map<string, Room[]>()
  private readonly t: Tower
  /** the roof over the top floor as set (data/building/roof.ts), read once: none, the flat roof and its parapet */
  private readonly roof: Roof | undefined
  private readonly place: ReturnType<typeof frameOf>
  /** the walked flat as the scene draws it (unit, rooms): what of the tower it already covers (sharedWith, lid) */
  private readonly walked: { unit: Unit; rooms: Room[] }
  /** Look's roof over the walked flat reaches this high (y, scene): the floor above starts on it (lid) */
  private readonly lidY: number
  /** frame(): the tower and its levels' pieces cast the sun's shadow; the floors shown (frame's rule; the Building view: all) */
  private shadows = true
  private pieceShadows = true
  private shows: (k: number) => boolean = () => true
  /** frame(): the levels' outdoor pieces shown; the Building view opened (the flats' furniture comes then); what has started */
  private piecesShown = true
  private seen = false
  private readonly started = { rooms: false, pieces: false, things: false }
  /** framed once (on screen, or round the flat under the start screen): what waits for it (furnishPieces) */
  private onScreen: () => void = () => {}
  private readonly framedOnce = new Promise<void>((ok) => (this.onScreen = ok))
  /** what the tier draws inside (furnishes): rooms everywhere; furniture on every storey (High), the nearest (Low), none (Lite) */
  private readonly tier: Quality
  /** the flats with rooms behind their windows (every one but the walked flat), each with its meshes once built */
  private readonly flats: Inside[] = []
  /** a drawing's rooms and furniture, once (interiors.ts), shared by every floor it stands on */
  private readonly drawn = new Map<string, { rooms?: Promise<THREE.BufferGeometry | null>; things?: Promise<THREE.BufferGeometry | null> }>()
  /** this tower's drawings' rooms, kept for the page (ROOMS): the tower a stair builds for the next floor has them at once */
  private get roomsKept(): Map<string, Promise<THREE.BufferGeometry | null>> {
    let m = ROOMS.get(this.t)
    if (!m) ROOMS.set(this.t, (m = new Map()))
    return m
  }
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
  static for(unit: Unit, tier: Quality = 'high', outside: Outside = outsideOf({})): Building | null {
    const t = towerOf(unit)
    const stem = t && stemIn(t, unit)
    return t && stem ? new Building(unit, t, stem, floorIn(t, stem, unit.floor), tier, outside) : null
  }

  private constructor(unit: Unit, t: Tower, stem: string, floor: number, tier: Quality, outside: Outside = outsideOf({})) {
    super()
    this.out = outside
    this.paneTint.on = outside.framed
    this.t = t
    this.roof = roofIn(t)
    this.stem = stem
    this.tier = tier
    this.floor = this.picked = floor
    this.place = frameOf(t, stem, floor)
    this.minCameraY = Math.max(...unit.walls.map((w) => w.heightM)) + 0.3
    const walkedRooms = core.deriveRooms(unit)
    this.walked = { unit, rooms: walkedRooms }
    this.lidY = storeyTop(unit, walkedRooms) + ROOF_M
    const groundLevel = t.FLOORS.find((f) => f.floor === 0)?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
    const groundLow = groundLevel ? lowestFloor(t.FLATS[groundLevel].unit, this.roomsOf(groundLevel)) : 0
    this.streetY = Math.min(t.STOREYS ? this.levelOf(0) - 0.2 : -floor * 3.2 - 0.2, groundLevel ? this.levelOf(0) + groundLow - 0.05 : Infinity)
  }

  /** floor k's full walls: the project's own storey (Tower.STOREYS, read from its set's sections), else WALL_M */
  private wallsOf(k: number): number {
    return this.t.STOREYS?.walls[k] ?? WALL_M
  }
  /** the plate under each floor: the project's own slab, else what fills FLOOR_M over WALL_M */
  private get plateM(): number {
    return this.t.STOREYS?.slabM ?? this.t.FLOOR_M - WALL_M
  }
  /** the parapet round the roof: the project's own (its sections print it; under a pitched roof none), else PARAPET_M */
  private get parapetM(): number {
    return isPitched(this.roof) ? 0.01 : (this.t.STOREYS?.parapetM ?? PARAPET_M)
  }

  /**
   * The tower itself, a floor (a basement, the street) a step: a stair's floor takes them a slice a frame (PlotlineScene
   * arrive; ~300 ms of building in one go froze the floor still shown), everything else runs it to the end at once.
   */
  *make(): Generator<void> {
    const { unit, rooms: walkedRooms } = this.walked
    const { t, stem, floor } = this
    const { FLATS, FLOORS, CORE, GROUND, ROOF, FLOOR_M } = t
    const PLATE_M = this.plateM
    /** the roof as set (roof.ts; a set's sections may say gable or hip) */
    const shape = this.roof
    const pitched = isPitched(shape)
    /** the box the roof stands over (a pitched roof, a flat one's skylights): the top floor's outer walls' corners, the scene's plan frame, and their longest wall's direction */
    const over = pitched || shape?.windows?.length || shape?.pieces?.length ? { pts: [] as Pt[], dir: { x: 1, y: 0 }, len: 0 } : null
    /** a flat roof's covering over its slab (gravel, a green roof, terrace tiles): none for the plain slab */
    const deck = shape && !pitched && coveringOf(shape) !== coveringsFor(shape)[0] ? coveringOf(shape).material : null
    // the architect's outside shape (core Shell: the scene draws it round the flat in every mode) stands in for the box
    // massing — the other flats' shells, plates, panes, the roof, plinth and ground pieces are left out so nothing draws
    // twice; the flats keep their invisible pick proxies, traced levels still draw in full. Its windows' glass solid in the
    // file (glass 'opaque': the shape leaves them out, three/shell.ts): the tower's own panes in the flats' window openings,
    // the rooms behind them and their lights at night, as round any tower
    const hasShell = !!unit.shell
    const ownPanes = !hasShell || unit.shell!.glass === 'opaque'
    /** per floor (one mesh per material per floor: frame shows floors by tier), per material */
    const lists = new Map<number, Map<MaterialRef | THREE.Material | 'glass', THREE.BufferGeometry[]>>()
    const put = (k: number, m: MaterialRef | THREE.Material | 'glass', ...g: THREE.BufferGeometry[]) => {
      if (!g.length) return // an empty list (no tanks, no bays) must not reach merge
      const l = lists.get(k) ?? lists.set(k, new Map()).get(k)!
      l.set(m, [...(l.get(m) ?? []), ...g])
    }
    /** each floor's panes' owners, a triangle each (pickAt) */
    const owners = new Map<number, TowerHit[]>()
    const top = topFloor(t) // a Studio project's traced rooftop is listed one floor above it
    for (let k = Math.min(0, ...FLOORS.map((f) => f.floor)); k <= top + 1; k++) this.levels.push([k, this.levelOf(k)])
    const G = this.levelOf(0)
    const R = this.levelOf(top + 1)
    const groundLevel = FLOORS.find((f) => f.floor === 0)?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
    const groundLow = groundLevel ? lowestFloor(FLATS[groundLevel].unit, this.roomsOf(groundLevel)) : 0
    /** his traced rooftop (a Studio project): its own walls stand on the roof slab instead of the automatic parapet */
    const roofLevel = FLOORS.find((f) => f.floor === top + 1)?.standIns ?? []
    /** a shell's walls with its openings cut, and its columns, storey high; not what the walked flat shares (sharedWith) */
    const none = { walls: new Set<Id>(), rooms: new Set<Id>(), pillars: new Set<Id>() }
    const shellWalls = (u0: Unit, skip = none, h = WALL_M, dressed?: Map<Id, MaterialRef>) => {
      const u = t.STOREYS ? storeyUnit(u0, h) : u0 // (a project's own storeys: its full walls that tall)
      return [
        // (a railing, a glass front: its own parts, railsOf; a solid low wall with its cap — a wall in an outside finish of its own:
        // dressedWalls, its cap here)
        ...u.walls.filter((w) => !skip.walls.has(w.id) && !core.railOf(w)).flatMap((w) => {
          const c = capGeometry(w, u)
          return [dressed?.has(w.id) ? null : wallGeometry(w, u), c && edgeOf(c, w.id)]
        }).filter((x) => !!x),
        ...(u.pillars ?? []).filter((p) => !skip.pillars.has(p.id)).map((p) => box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, 0, h)),
      ]
    }
    /** a shell's walls in an outside finish of their own (dressed), by that finish */
    const dressedWalls = (u0: Unit, skip: typeof none, h: number, dressed: Map<Id, MaterialRef>) => {
      const u = t.STOREYS ? storeyUnit(u0, h) : u0
      const by = new Map<MaterialRef, THREE.BufferGeometry[]>()
      for (const w of u.walls) {
        const r = dressed.get(w.id)
        const g = r && !skip.walls.has(w.id) && !core.railOf(w) ? wallGeometry(w, u) : null // (a railing, a glass front: its own parts)
        if (r && g) by.set(r, [...(by.get(r) ?? []), g])
      }
      return [...by]
    }
    /** a flat's ordinary shell (walls, columns, plate; nothing left out, no lid), its own frame: built once and placed on each floor it stands on (SHELLS) */
    const ordinary = keptIn(SHELLS, t)
    /** a flat's railings and glass fronts (rails.ts), its own frame, once: a copy on each floor it stands on */
    const rails = new Map<string, { id: Id; parts: RailPart[] }[]>()
    const railsOf = (s: string, u: Unit) => rails.get(s) ?? rails.set(s, u.walls.flatMap((w) => (core.railOf(w) ? [{ id: w.id, parts: railParts(w, u) }] : []))).get(s)!
    /** a flat's balconies' slab edges (rails.ts balconyEdgeParts: one a front wall, tagged with it), its own frame */
    const edges = (u: Unit, rooms: Room[]) => balconyEdgeParts(u, rooms).map(([id, g]) => edgeOf(g, id))

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
          for (const [r, gs] of this.edgesBy(s, k, plate(u, rooms, roofLevel.length ? -UNDER_LEVEL_M : 0, PLATE_M, u.walls, this.lid(s, k)).map(at))) put(k, r, ...gs)
          if (roofLevel.length) continue
          // parapet: the walls with open air on one side (outside every flat of the floor below), 1.1 m (or as the set prints it), no openings
          const others = standIns.filter((o) => o !== s)
          const outside = (p: Pt) => !core.roomAt(p, rooms, u) && !others.some((o) => this.inFlat(o, { x: p.x + this.shift(s).x - this.shift(o).x, y: p.y + this.shift(s).y - this.shift(o).y }))
          const outer = u.walls.filter((w) => outerSide(w, u, (p) => !outside(p)) !== 0)
          if (over) {
            // the roof's box: its corners, to the walls' outer faces (a pitched roof over the whole floor — its eaves on the faces,
            // the slab's edge under them — a flat one's skylights: after this loop)
            for (const w of outer) {
              const f = core.wallFrame(w, u.vertices)
              const t = w.thicknessM / 2
              for (const id of [w.a, w.b])
                for (const side of [t, -t]) {
                  const q = u.vertices.find((x) => x.id === id)!
                  over.pts.push({ x: q.x + f.normal.x * side + this.shift(s).x, y: q.y + f.normal.y * side + this.shift(s).y })
                }
              if (f.lengthM > over.len) Object.assign(over, { len: f.lengthM, dir: f.dir })
            }
          }
          if (pitched) continue // under a pitched roof: no parapet
          const walls = outer.map((w) => ({ ...w, heightM: this.parapetM, openings: [] }))
          const graph = { vertices: u.vertices, walls }
          for (const w of walls) {
            const g = wallGeometry(w, graph)
            if (g) put(k, this.outRef(s, w.id, k) ?? EXTERIOR_PLASTER, at(g)) // (the wall below's outside, or the roof's band)
          }
          // its edge as set: a cap a little wider than the parapet, a cornice band round the outside just under the roof line
          const coping = shape?.coping
          if (coping)
            put(k, COPING[coping], ...walls.map((w) => {
              const t = w.thicknessM / 2 + 0.03
              return at(alongWall(w, u, -t, core.wallFrame(w, graph.vertices).lengthM + t, this.parapetM, this.parapetM + CAP_M[coping], -t, t))
            }))
          if (shape?.cornice) {
            const cornice = walls.map((w) => {
              const side = outerSide(w, u, (p) => !outside(p))
              const t = w.thicknessM / 2
              return edgeOf(at(alongWall(w, u, -t - 0.15, core.wallFrame(w, graph.vertices).lengthM + t + 0.15, -0.35, -0.05, side * t, side * (t + 0.15))), w.id)
            })
            for (const [r, gs] of this.edgesBy(s, k, cornice)) put(k, r, ...gs)
          }
          // a covering over the slab, its rooms' outline (not a shaft's: open to the sky), 3 cm thick
          if (deck) put(k, deck, ...plate(u, rooms.filter((r) => r.kind !== 'shaft'), DECK_M, DECK_M, []).map((g) => at(meterUVs(g))))
          continue
        }
        const mine = k === floor && s === stem
        const level = t.LEVELS?.[s] !== undefined
        // a neighbour on the walked floor: not what the walked flat draws itself (a shared lobby: sharedWith)
        const skip = k === floor && !mine && !level ? sharedWith(unit, walkedRooms, u, rooms, this.shift(s)) : none
        if (!mine) this.flats.push({ s, k, home: `${s}|${k}`, level, at: this.middleOf(s, k), lamps: lampTable(rooms.length), scale: { value: 0 }, material: null, rooms: null, things: null, skip: skip.rooms })
        if (level) {
          // a traced level (ground, a common floor) in full; the one walked: the scene draws it, this its pick proxy (the Building
          // view names its floor and its walls — Finishes' outside card — as a walked flat's proxy does)
          this.addLevel(s, k, Infinity, mine)
          continue
        }
        const wallH = this.wallsOf(k)
        // its walls in the building's outside finish where one is chosen (the walked flat's are the scene's own)
        const dressed = mine || hasShell ? undefined : this.dressed(s, k)
        const sig = mine || hasShell ? '' : this.outSig(s, k)
        const key = (t.STOREYS ? `${s}|${wallH}` : s) + sig // (a project's storeys may differ floor by floor)
        const plateWalls = (t.STOREYS ? storeyUnit(u, wallH) : u).walls.filter((w) => !skip.walls.has(w.id)) // (its panes as tall as its storey lets them)
        const lid = this.lid(s, k)
        let geo: THREE.BufferGeometry
        if (!mine && !lid && k !== 0 && !hasShell && !skip.walls.size && !skip.rooms.size && !skip.pillars.size) {
          geo = ordinary.get(key) ?? ordinary.set(key, this.shellOf(s, k, [...shellWalls(u, none, wallH, dressed), ...plate(u, rooms, 0, PLATE_M), ...edges(u, rooms)], dressed && dressedWalls(u, none, wallH, dressed))).get(key)!
          KEPT.add(geo)
        } else {
          const walls = shellWalls(u, skip, wallH, dressed).map(at)
          // the current flat: Look's 0.15 m slab is there already, the plate only closes the gap under it; a ground-floor
          // shell (a Studio building whose flat has no column drawn) stands on the plinth: its top is the plate (no z-fight).
          // Its balconies' slab edges with the plate (the walked flat's: Look's, with its slab)
          const slab = k === 0 || hasShell ? [] : [...plate(u, rooms.filter((r) => !skip.rooms.has(r.id)), mine ? -LOOK_SLAB : 0, mine ? PLATE_M - LOOK_SLAB : PLATE_M, plateWalls, lid), ...(mine ? [] : edges(u, rooms))].map(at)
          if (mine) for (const [r, gs] of this.edgesBy(s, k, slab)) put(k, r, ...gs)
          const shell = mine ? walls : [...walls, ...slab]
          const clad = dressed && dressedWalls(u, skip, wallH, dressed).map(([r, gs]): [MaterialRef, THREE.BufferGeometry[]] => [r, gs.map(at)])
          if (!shell.length && !clad?.length) continue // all of it the walked flat's
          geo = this.shellOf(s, k, shell, clad)
        }
        // one material, or (an outside chosen) the plaster's and each finish's, a group each (grouped)
        const refs = (geo.userData.refs as MaterialRef[] | undefined) ?? [EXTERIOR_PLASTER]
        const mesh = new THREE.Mesh(geo, refs.length > 1 ? refs.map((r) => materialFor(r, false, false, true)) : materialFor(refs[0], false, false, true))
        if (geo === ordinary.get(key)) mesh.position.set(this.shift(s).x, y, this.shift(s).y)
        mesh.castShadow = mesh.receiveShadow = true
        mesh.visible = !mine && !hasShell // the furnished flat is drawn by the scene; this one is only its pick proxy (every flat's, under the architect's shape)
        mesh.userData.proxy = !mesh.visible // (frame keeps it so)
        if (flats.includes(s)) mesh.userData.flat = { stem: s, floor: k } satisfies FlatRef
        mesh.userData.level = k // a cut at a lower floor hides it (highlight)
        this.add(mesh)
        // its railings and glass fronts in their own materials (the walked flat's: the scene's; under the architect's shape: its own)
        if (!mine && !hasShell) for (const r of railsOf(s, u)) if (!skip.walls.has(r.id)) for (const p of r.parts) put(k, p.m, at(p.geo.clone()))
        // every window real glass with its flat's rooms behind it (the walked flat: its own glass, drawn by the scene); the
        // architect's shape has its own windows (unless their glass came solid: ownPanes)
        if (mine || !ownPanes) continue
        const owner: TowerHit = { k, flat: flats.includes(s) ? { stem: s, floor: k } : null }
        const own = owners.get(k) ?? owners.set(k, []).get(k)!
        for (const w of plateWalls)
          for (const o of w.openings) {
            if (o.kind !== 'window' && o.kind !== 'slider') continue
            const p = this.paneParts(s, k, w, u, o)
            const g = at(p.glass)
            for (let i = g.attributes.position.count / 3; i > 0; i--) own.push(owner)
            put(k, 'glass', g)
            for (const g of p.band?.[1] ?? []) put(k, p.band![0], at(g)) // (a glass wall's spandrel)
          }
      }
    }

    // a pitched roof over the top floor (as set, or as its set's sections and elevations print it); a top floor still a picture
    // to trace (nothing drawn on it yet): over the highest floor that has walls, so the building stands as tall as its set says
    for (let k = top; over && !over.pts.length && k >= 0; k--)
      for (const s of [...(FLOORS.find((f) => f.floor === k)?.flats ?? []), ...(FLOORS.find((f) => f.floor === k)?.standIns ?? [])]) {
        const { unit: u } = FLATS[s]
        for (const w of u.walls) {
          const f = core.wallFrame(w, u.vertices)
          if (f.lengthM > over.len) Object.assign(over, { len: f.lengthM, dir: f.dir })
        }
        over.pts.push(...u.vertices.map((q) => ({ x: q.x + this.shift(s).x, y: q.y + this.shift(s).y })))
      }
    // (a traced rooftop with walls is its own flat roof — its parapets, its zones: no skylights over it — but a pitched roof is
    // drawn over the top floor whatever stands on the slab; a rooftop still a picture to trace is no roof yet)
    const roofTraced = roofLevel.some((s) => FLATS[s].unit.walls.length > 0)
    let roofPieces: ReturnType<typeof roofGeometry>['spots'] = []
    if (shape && over?.pts.length && !hasShell && (pitched || !roofTraced)) {
      // the eave as the set prints it, else on the roof slab; the ridge as printed (when no pitch is set)
      const eave = t.STOREYS?.eaveM !== undefined ? G + t.STOREYS.eaveM : R
      const r = roofGeometry(over.pts, over.dir, shape, pitched ? R : R + (deck ? DECK_M : 0), eave, t.STOREYS?.ridgeM !== undefined ? G + t.STOREYS.ridgeM : undefined)
      const some = (g: THREE.BufferGeometry) => (g.attributes.position.count ? [g] : (g.dispose(), [])) // (a part this roof has none of)
      put(top + 1, coveringOf(shape).material, ...some(r.cover))
      put(top + 1, this.outRef(null, null, top + 1) ?? EXTERIOR_PLASTER, ...some(r.walls)) // (its gables: the roof floor's outside, or the building's)
      put(top + 1, TRIM, ...some(r.trim))
      if (r.panes.attributes.position.count) {
        // the roof windows: the tower's glass (a ray through one names the roof)
        const own = owners.get(top + 1) ?? owners.set(top + 1, []).get(top + 1)!
        for (let i = r.panes.attributes.position.count / 3; i > 0; i--) own.push({ k: top + 1, flat: null })
        put(top + 1, 'glass', r.panes)
      } else r.panes.dispose()
      roofPieces = r.spots
    }

    // the core, ground to roof head: its traced walls at the ground and as the stair head + lift machine room
    for (const [s, name] of hasShell || pitched ? [] : CORE) { // (under a pitched roof no head room: the roof is the top)
      const { unit: u } = FLATS[s]
      const room = this.roomsOf(s).find((r) => r.name === name)
      if (!room) continue
      for (const [k, y] of [[0, G], [top + 1, R]]) {
        if (k === 0 && FLOORS.some((f) => f.floor === 0)) continue // a traced ground floor or the flats' shells stand there: they draw their own stair
        const at = (g: THREE.BufferGeometry) => g.translate(this.shift(s).x, y, this.shift(s).y)
        for (const w of [...new Set(room.wallIds)].flatMap((id) => u.walls.filter((w) => w.id === id))) {
          const g = wallGeometry(w, u)
          if (g) put(k, this.outRef(s, w.id, k) ?? EXTERIOR_PLASTER, at(g))
        }
      }
      // its lid: the room and its own walls only (plate's default, every wall of the flat, laid a lattice of beams 3 m over the
      // whole roof — qa3 P9: "the top floor has no roof", it read as a cut-away)
      const own = new Set(room.wallIds)
      const lid = plate(u, [room], R + FLOOR_M, PLATE_M, u.walls.filter((w) => own.has(w.id))).map((g) => g.translate(this.shift(s).x, 0, this.shift(s).y))
      for (const [r, gs] of this.edgesBy(s, top + 1, lid)) put(top + 1, r, ...gs)
    }

    // his traced rooftop on the roof slab, in full (the one walked: the scene draws it)
    for (const s of roofLevel) {
      if (s === stem && floor === top + 1) continue
      this.addLevel(s, top + 1)
      this.flats.push({ s, k: top + 1, home: `${s}|${top + 1}`, level: true, at: this.middleOf(s, top + 1), lamps: lampTable(this.roomsOf(s).length), scale: { value: 0 }, material: null, rooms: null, things: null, skip: none.rooms })
    }

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
    if (!hasShell && !pitched) put(top + 1, GREEN, ...ROOF.gardens.map((r) => meterUVs(flat(r, R + (deck ? DECK_M : 0)))))
    if (!hasShell) put(0, ASPHALT, ...GROUND.ramp.map((r) => flat(r, G)))
    for (const [x0, y0, x1, y1] of hasShell ? [] : GROUND.bays) {
      const e = 0.08
      put(0, PAINT, ...[[x0, y0, x1, y0 + e], [x0, y1 - e, x1, y1], [x0, y0, x0 + e, y1], [x1 - e, y0, x1, y1]].map((r) => flat(r as Rect, G)))
    }
    if (!hasShell) put(0, this.outRef(null, null, 0) ?? EXTERIOR_PLASTER, ...GROUND.blocks.map((r) => rectBox(plan(r), G, G + this.wallsOf(0)))) // (the ground floor's outside)
    const columns = this.edgeRef(null, null, 0) // (the building's edges: their picture at its real size)
    if (!hasShell) put(0, columns ?? EXTERIOR_PLASTER, ...GROUND.columns.map((r) => rectBox(plan(r), G, G + this.wallsOf(0))).map((g) => (columns ? faceUvs(g) : g)))
    if (!hasShell && !pitched) put(top + 1, TANK, ...ROOF.tanks.map((r) => rectBox(plan(r), R + FLOOR_M, R + FLOOR_M + 1.2))) // (water tanks on a flat roof only)

    // (the roof's covering keeps its own pictures' lay, along the eaves and up the slope: materials.ts faceUvPatch 'cover')
    const covers = new Set<unknown>(shape ? [coveringOf(shape).material, deck] : [])
    for (const [k, byMaterial] of lists)
      for (const [m, geos] of byMaterial) {
        const pane = m === 'glass'
        const mesh = new THREE.Mesh(merge(geos), pane ? this.panes : m instanceof THREE.Material ? m : materialFor(m, false, false, true, false, covers.has(m) ? 'cover' : ''))
        mesh.castShadow = !pane && m !== GREEN && m !== PAINT && m !== ASPHALT && !(m instanceof THREE.Material && m.transparent)
        mesh.receiveShadow = true // a pane too: its frame in the facade's shade
        if (pane) this.paneOwners.set(mesh, owners.get(k) ?? []) // picked: a ray through a window names the flat behind it
        mesh.userData.level = k // its floor: a cut under it hides it (highlight; the plinth: his traced ground floor stands on it), the walk shows floors by tier (frame)
        this.add(mesh)
      }
    // the roof's solar panels and chimneys (Roof.pieces): the library's pieces, code-built, on the deck as they stand; on a slope
    // a solar frame turned to it, its modules 12 cm over the covering (ponytail: its legs go into the roof unseen), a chimney
    // upright with its foot in the slope
    for (const s of roofPieces) {
      const g = buildProcedural(ROOF_PIECE_ASSET[s.kind])
      if (!g) continue
      const solar = s.kind === 'solar'
      const tip = solar && s.tilt ? s.tilt - (SOLAR.tiltDeg * Math.PI) / 180 : 0
      const sink = !s.tilt ? 0 : solar ? 0.39 : 0.3 * Math.tan(s.tilt)
      g.position.set(s.at[0], s.at[1] - sink, s.at[2])
      g.rotation.set(tip, s.yaw, 0, 'YXZ')
      g.userData.level = top + 1
      g.traverse((o) => ((o as THREE.Mesh).isMesh && ((o.castShadow = o.receiveShadow = true), (o.raycast = () => {}))))
      this.add(g)
    }
    this.box.setFromObject(this)
    // nothing of the tower drawn — an architect's outside shape stands in for it and no other storey has walls (an IFC flat of one
    // storey): the walked flat is what the view frames, else the eye sat on its own target (a black screen, qa4)
    if (this.box.isEmpty()) {
      const r = core.unitBounds(unit)
      const y = this.levelOf(floor)
      this.box.set(new THREE.Vector3(r.minX, y, r.minY), new THREE.Vector3(r.maxX, y + this.wallsOf(floor), r.maxY))
    }

    // his traced basements (after the box: the view frames the tower above ground), in full, each its own group so picking
    // one in the floor picker can hide everything that stands above it (cut); under the street: a basement reaching past
    // the plinth must not show its wall tops on the road
    for (const { floor: k, standIns = [] } of FLOORS.filter((f) => f.floor < 0))
      for (const s of standIns) if (!(k === floor && s === stem)) yield this.addLevel(s, k, this.streetY - this.levelOf(k) - 0.01)
    yield

    // the street (context.ts, the same as the walk's): the drawing's roads and the neighbours round the plot, a few metres
    // off; a unit with a site (Studio → Site): the map's own roads and blocks instead
    const streets = keptIn(STREETS, t)
    const key = `${stem}|${unit.id}|${this.tier}`
    let st = streets.get(key)
    if (!st) streets.set(key, (st = { group: buildStreet(unit, streetOf(t, stem), this.streetY), y: this.streetY })), keep(st.group)
    this.street = st.group.clone() // (its geometry and materials shared: the floor he leaves still draws its own copy)
    this.street.position.y = this.streetY - st.y
    this.add(this.street)

    // the picked flat's lift and the hover's: drawn last, over everything of theirs that is seen (liftMeshes)
    this.overlay.add(...this.lift.meshes, ...this.hoverLift.meshes)
    this.overlay.userData.overlay = true
    this.add(this.overlay)
    this.hoverLift.show(false)
    this.eye.copy(this.view(floor).eye)
    this.highlight(floor)
  }

  /** Flat s on floor k's middle, 1.5 m over its floor, in the scene: which flats are nearest the camera (insideOrder). */
  private middleOf(s: string, k: number): THREE.Vector3 {
    const b = core.unitBounds(this.t.FLATS[s].unit)
    const d = this.shift(s)
    return new THREE.Vector3((b.minX + b.maxX) / 2 + d.x, this.levelOf(k) + 1.5, (b.minY + b.maxY) / 2 + d.y)
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
   * TIERS.towerShadows says, no lifts; the other flats' rooms behind their glass, never their furniture (made once the Building
   * view has been opened, shown only there: placeInside). The Building view: all of it, casting as built (highlight cuts).
   */
  frame(mode: 'walk' | 'orbit' | 'building', tier: Quality): void {
    // the same view again, settled (Enter or a Rooms jump places him: PlotlineScene.setMode): nothing changes — its batches
    // stand. Unmade and made again they held the page 150–190 ms, 0.4 s after Enter (session 31 start lane)
    this.onScreen() // (a later tower's copies of the grounds' pieces come now: furnishPieces)
    if (this.batched && this.framed === `${mode}|${tier}`) return
    this.framed = `${mode}|${tier}`
    const around = mode !== 'building'
    this.unbatchAround()
    this.around = around
    // the trees' leaves merged per 8 m square in the Dollhouse only (leavesTogether): from inside the flat each tree is culled
    // on its own and few are in sight — merged, Walk / High on Sheltech A drew 1.2 → 1.8 M triangles for no fewer draws
    this.leavesMerged = mode === 'orbit'
    this.visible = true // (built hidden for a stair's floor: shown with it)
    this.shadows = !around || TIERS[tier].towerShadows
    // its trees and deck pieces never shade the flat (the roof's are over its slab; a tree's shadow falls on the ground, outside
    // the flat's shadow box): round the flat they cast into the sun's wide map only (High: the lawn, the play area and the road
    // in their shade, render.ts wideOnly), none without one (Low, Lite) — High's sun-shadow redraw round Sheltech A on floor 2
    // was 875 calls with them in both maps, 474 with none
    this.pieceShadows = !around || TIERS[tier].wide > 0
    this.piecesWide = around
    // the levels' pieces (trees, benches, play things): not round the flat on Lite, its zones only — they were ~1.5 ms of a
    // Lite frame at 9× pixels round a Sheltech flat (Firefox pays per draw call: ~150 leaf clusters); the Building view has them
    this.piecesShown = !(around && tier === 'lite')
    this.seen ||= !around
    this.shows = around ? (k) => towerLevel(k, { tier, floor: this.floor, dollhouse: mode === 'orbit' }) : () => true
    for (const { pieces } of this.furnishing) if (pieces) pieces.visible = this.piecesShown
    // the made-up street round Lite's Dollhouse: none, as before (~2 ms of a frame at 9× pixels); the site's real one stays
    this.street.visible = !(mode === 'orbit' && tier === 'lite') || !!this.street.userData.site
    for (const o of this.children) {
      if (o === this.street) continue
      delete o.userData.cut
      o.visible = o.userData.overlay ? !around : !o.userData.proxy && this.shows(o.userData.level)
      this.casts(o)
      for (const f of this.furnishing) if (f.group === o && f.pieces) this.casts(f.pieces, true)
    }
    if (around) this.eye.set(0, 1.5, 0) // the walked flat's neighbours first
    this.placeInside()
    this.want()
    this.batchAround()
  }

  /** round the flat (walk, Dollhouse): the tower is drawn as one mesh per material (batchAround) */
  private around = false
  private leavesMerged = false
  private batched: { batches: THREE.Mesh[]; leaves: THREE.InstancedMesh[]; moved: THREE.Object3D[] } | null = null
  private batchTimer: ReturnType<typeof setTimeout> | undefined
  /** the view and tier frame() last set */
  private framed = ''

  /**
   * Round the flat the tower does not change while it is looked at (the Building view's cut, lift and picking need its pieces
   * one by one; round the flat nothing picks it): once it has settled (AROUND_MS after the last flat's rooms or pieces came
   * in), everything of it that shows is drawn as one mesh per material (batch.ts) — its shells, plates, panes, levels and
   * street in a handful of draws instead of one per flat and floor; each flat's rooms stay its own (their lamps). Session 31
   * perf: the context lane's tower round the flat took Walk / High from 94 to 127 draws (Type A), 90 to 168 (Sheltech A).
   */
  private batchAround(): void {
    clearTimeout(this.batchTimer)
    this.pending = false
    if (!this.around || this.disposed) return
    this.pending = true
    this.batchTimer = setTimeout(this.batchNow, AROUND_MS)
  }
  /** a batchAround waiting for its AROUND_MS */
  private pending = false
  /** furnishPieces is adding a level's pieces (batchNow waits) */
  private addingPieces = false
  private batchNow = (): void => {
    this.pending = false
    if (!this.around || this.disposed) return
    // a level's pieces still coming in: merged into the whole tower now, they missed their own 8 m batches (batched away from
    // them) and ended in the tower's one uncullable mesh — Sheltech's Walk drew 29 k triangles more (session 31 start lane)
    if (this.addingPieces) return this.batchAround()
    this.unbatchAround()
    const before: THREE.Object3D[] = []
    this.traverse((o) => void (o.layers.mask === 1 && before.push(o)))
    const leaves = this.leavesMerged ? this.leavesTogether() : []
    const batches = batch(this, Infinity)
    this.batched = { batches, leaves, moved: before.filter((o) => o.layers.mask === 1 << HIDDEN) }
    this.onChange()
  }
  /** A batchAround waiting: made now (PlotlineScene, before the frame drawn behind the start screen: its buffers sent there). */
  settleNow(): void {
    if (this.pending) (clearTimeout(this.batchTimer), this.batchNow())
  }

  /** the tower one by one again (frame, a flat's rooms or pieces coming in, the Building view) */
  private unbatchAround(): void {
    clearTimeout(this.batchTimer)
    this.pending = false
    const b = this.batched
    if (!b) return
    this.batched = null
    for (const m of b.batches) (m.removeFromParent(), m.geometry.dispose())
    for (const m of b.leaves) (m.removeFromParent(), m.dispose()) // (their card geometry is the trees' own)
    for (const o of b.moved) o.layers.set(0)
  }

  /**
   * In the Dollhouse: the grounds' instanced leaves (trees, shrubs, planter blades) of one card and one atlas, every tree's
   * in one 8 m square (as the pieces' batches: a square out of sight is not drawn — the whole ground's leaves in one mesh
   * took Walk / High on Sheltech from 1.2 to 3.2 M triangles), as ONE instanced mesh (the originals hidden) — Sheltech's
   * ground was ~150 draws of leaves. Only matrices are copied (a few ms), not leaves laid out as plain geometry: that froze
   * the page for 2–3 s after a stair.
   */
  private leavesTogether(): THREE.InstancedMesh[] {
    // one card = the same vertices: each tree's geometry is its own only for its daylight corner (daylight.ts own), over the
    // card's shared attributes
    const same = (p: THREE.InstancedMesh, q: THREE.InstancedMesh) => {
      const [g, h] = [p.geometry, q.geometry]
      const [du, dv] = [g.getAttribute('dayUv'), h.getAttribute('dayUv')]
      return g.attributes.position === h.attributes.position && g.index === h.index && p.material === q.material && p.castShadow === q.castShadow && p.intersectsFrustum === q.intersectsFrustum &&
        !p.instanceColor === !q.instanceColor && du?.getX(0) === dv?.getX(0) && du?.getY(0) === dv?.getY(0)
    }
    const groups: { cell: string; list: THREE.InstancedMesh[] }[] = []
    this.updateMatrixWorld(true)
    const inv = this.matrixWorld.clone().invert()
    this.traverseVisible((o) => {
      const im = o as THREE.InstancedMesh
      if (!im.isInstancedMesh || im.layers.mask !== 1 || !im.count || Array.isArray(im.material)) return
      if (!im.boundingSphere) im.computeBoundingSphere()
      const at = im.boundingSphere!.center.clone().applyMatrix4(im.matrixWorld).applyMatrix4(inv)
      const cell = `${Math.floor(at.x / CELL_M)},${Math.floor(at.z / CELL_M)}`
      const g = groups.find((x) => x.cell === cell && same(x.list[0], im))
      if (g) g.list.push(im)
      else groups.push({ cell, list: [im] })
    })
    const w = new THREE.Matrix4(), m = new THREE.Matrix4(), c = new THREE.Color()
    const out: THREE.InstancedMesh[] = []
    for (const { list } of groups) {
      if (list.length < 2) continue
      const all = new THREE.InstancedMesh(list[0].geometry, list[0].material, list.reduce((n, im) => n + im.count, 0))
      let j = 0
      for (const im of list) {
        w.multiplyMatrices(inv, im.matrixWorld)
        for (let i = 0; i < im.count; i++, j++) {
          im.getMatrixAt(i, m)
          all.setMatrixAt(j, m.premultiply(w))
          if (im.instanceColor) (im.getColorAt(i, c), all.setColorAt(j, c))
        }
        im.layers.set(HIDDEN)
      }
      all.castShadow = list[0].castShadow
      all.receiveShadow = list[0].receiveShadow
      if (Object.hasOwn(list[0], 'intersectsFrustum')) all.intersectsFrustum = list[0].intersectsFrustum // (a tree's: the wide map only)
      all.computeBoundingSphere()
      this.add(all)
      out.push(all)
    }
    return out
  }

  /** The tower's meshes in `o` (`pieces`: a level's outdoor pieces) cast the sun's shadow as built, or none (frame). */
  private casts(o: THREE.Object3D, pieces = false): void {
    const on = pieces ? this.pieceShadows : this.shadows
    o.traverse((m) => {
      if (!(m as THREE.Mesh).isMesh) return
      m.userData.casts ??= m.castShadow
      m.castShadow = on && m.userData.casts
    })
    if (pieces) wideOnly(o, this.piecesWide)
  }
  /** frame(): the levels' pieces cast into the sun's wide map only (round the flat) */
  private piecesWide = false


  /** building-frame offset of a flat relative to the current one (plan x, y); no stem = the building frame's origin (frameOf) */
  private shift(stem?: string): Pt {
    return this.place.shift(stem)
  }

  /** What wall `wallId` of flat s (null: a block of the ground, a gable) wears outside on floor k (furnish/finishes.ts outsideOf: its run's choice, its floor's, the building's); null: nothing chosen — the plaster, as always. */
  private outRef(s: string | null, wallId: Id | null, k: number): MaterialRef | null {
    if (!this.out.sig) return null
    const u = s ? this.t.FLATS[s].unit : null
    return this.out.wall(u?.id, u && wallId ? (outerRuns(u).get(wallId) ?? wallId) : null, k)
  }

  /** What the edges of wall `wallId` of flat s (null: a ground column) wear on floor k (finishes.ts Outside.edge: the building's Edges and caps, else as outRef); null: nothing chosen — the plaster. */
  private edgeRef(s: string | null, wallId: Id | null, k: number): MaterialRef | null {
    if (!this.out.sig) return null
    const u = s ? this.t.FLATS[s].unit : null
    return this.out.edge(u?.id, u && wallId ? (outerRuns(u).get(wallId) ?? wallId) : null, k)
  }

  /** `geos` by what each wears: an edge (edgeOf: a slab's strip, a cap, a balcony's band, the cornice) its edgeRef, the rest — and all with nothing chosen — the plaster, in their order. */
  private edgesBy(s: string, k: number, geos: THREE.BufferGeometry[]): [MaterialRef, THREE.BufferGeometry[]][] {
    const by = new Map<MaterialRef, THREE.BufferGeometry[]>()
    for (const g of geos) {
      const id = g.userData.edgeOf as Id | undefined
      const r = (id !== undefined && this.edgeRef(s, id || null, k)) || EXTERIOR_PLASTER
      by.set(r, [...(by.get(r) ?? []), r === EXTERIOR_PLASTER ? g : faceUvs(g)]) // (dressed: its picture at its real size, not one a face)
    }
    return [...by]
  }

  /** A shell's geometry (grouped): `base` in the plaster but its edges in theirs (edgesBy), and `dressed`'s walls; one group a material. */
  private shellOf(s: string, k: number, base: THREE.BufferGeometry[], dressed?: [MaterialRef, THREE.BufferGeometry[]][] | false): THREE.BufferGeometry {
    const parts = this.edgesBy(s, k, base)
    const plain = parts.find(([r]) => r === EXTERIOR_PLASTER)?.[1] ?? []
    return grouped(plain, joined(dressed || [], parts.filter(([r]) => r !== EXTERIOR_PLASTER)))
  }

  /** Flat s on floor k's outside as its walls and edges wear it, as a key ('': nothing chosen): two floors alike share one shell (SHELLS). */
  private outSig(s: string, k: number): string {
    if (!this.out.sig) return ''
    const refs = this.t.FLATS[s].unit.walls.map((w) => w.id + JSON.stringify([this.outRef(s, w.id, k), this.edgeRef(s, w.id, k)]))
    return `|${Math.round(hash01(refs.join()) * 2 ** 32).toString(36)}`
  }

  /** Flat s's walls on floor k in an outside finish of their own (not the plaster), by id; undefined: none (its shell built as always). */
  private dressed(s: string, k: number): Map<Id, MaterialRef> | undefined {
    if (!this.out.sig) return undefined
    const m = new Map<Id, MaterialRef>()
    for (const w of this.t.FLATS[s].unit.walls) {
      const r = this.outRef(s, w.id, k)
      if (r && r !== EXTERIOR_PLASTER) m.set(w.id, r)
    }
    return m.size ? m : undefined
  }

  /**
   * Opening o's glass on the tower (paneGeo) and, a glass wall with a spandrel (openings.ts spandrelBands), its opaque bands at
   * the foot and / or head of the glass: [what they are — dark glass, metal, or the wall's outside on floor k — their geometry]; none: null.
   */
  private paneParts(s: string, k: number, w: Wall, u: Unit, o: Opening): { glass: THREE.BufferGeometry; band: [MaterialRef, THREE.BufferGeometry[]] | null } {
    const bands = spandrelBands(o)
    const [c0, c1] = glassOf(o)
    const glass = paneGeo(w, u, bands.length ? { ...o, sillM: o.sillM + c0, heightM: c1 - c0 } : o, this.frameTint(s, o.id))
    if (!bands.length) return { glass, band: null }
    const ref = o.spandrel === 'outside' ? (this.outRef(s, w.id, k) ?? EXTERIOR_PLASTER) : SPANDREL[o.spandrel === 'metal' ? 'metal' : 'dark']
    return { glass, band: [ref, bands.map(([z0, z1]) => alongWall(w, u, o.offsetM, o.offsetM + o.widthM, o.sillM + z0, o.sillM + z1, -0.012, 0.012))] }
  }

  /** Window `openingId` of flat s: its frame's colour on its pane (linear; none chosen for it: the panes' own grey); undefined: no frame chosen anywhere (paneMaterial untinted). */
  private frameTint(s: string, openingId: Id): THREE.Color | undefined {
    if (!this.out.framed) return undefined
    const r = this.out.frame(this.t.FLATS[s].unit.id, openingId)
    return r ? new THREE.Color(r.kind === 'color' ? r.color : (r.tint ?? fallbackColor(r.textureId))) : PANE_GREY
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
  private addLevel(s: string, k: number, cap = Infinity, proxy = false): void {
    const top = topFloor(this.t)
    const lid = this.lid(s, k)
    const levels = keptIn(LEVELS, this.t)
    const key = lid ? null : `${s}|${k}|${Number.isFinite(cap) ? cap.toFixed(3) : ''}${this.out.sig ? `|${this.out.sig}` : ''}`
    let parts = key ? levels.get(key) : undefined
    if (!parts) {
      parts = this.levelParts(s, k, cap, lid)
      if (key) levels.set(key, parts), parts.forEach(([, g]) => KEPT.add(g))
    }
    const group = new THREE.Group()
    group.position.set(this.shift(s).x, this.levelOf(k), this.shift(s).y)
    group.userData.level = k // a cut at a lower floor hides it (highlight)
    group.visible = !proxy
    group.userData.proxy = proxy // (frame and highlight keep it so)
    for (const [m, geo] of parts) {
      const mesh = new THREE.Mesh(geo, m === 'panes' ? this.panes : m instanceof THREE.Material ? m : materialFor(m, false, false, true))
      const flatOnly = m === BAY_PAINT || m === WATER || m === 'panes'
      mesh.castShadow = !flatOnly && !(m instanceof THREE.Material && m.transparent) // (a glass front, a wire mesh: no solid shadow)
      mesh.receiveShadow = true
      if (flatOnly) mesh.raycast = () => {}
      group.add(mesh)
    }
    this.add(group)
    // what a buyer sees of it from outside: a ground floor's and a rooftop's outdoor pieces (trees, planters, deck furniture)
    if (!proxy && (k === 0 || k > top)) this.furnishing.push({ s, group })
  }

  /** addLevel's meshes' geometry, in the level's own frame, one per material ('panes': the tower's glass) */
  private levelParts(s: string, k: number, cap: number, lid: Lid | undefined): [MaterialRef | THREE.Material | 'panes', THREE.BufferGeometry][] {
    const u = this.t.STOREYS ? storeyUnit(this.t.FLATS[s].unit, this.t.STOREYS.walls[k]) : this.t.FLATS[s].unit // (its full walls as tall as its storey)
    const rooms = this.roomsOf(s)
    const top = topFloor(this.t)
    const PLATE_M = this.plateM
    const slots = finishSlotsFor(u, rooms)
    const lists = new Map<MaterialRef | THREE.Material | 'panes', THREE.BufferGeometry[]>()
    const put = (m: MaterialRef | THREE.Material | 'panes', ...gs: (THREE.BufferGeometry | null)[]) => {
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
      if (core.railOf(capped)) {
        // a railing, a glass front, a fence (rails.ts), on its floor as the wall would stand
        for (const p of railParts(capped, u)) liftWall(p.geo, capped, u, l), put(p.m, p.geo)
        continue
      }
      const built = liftedWall(capped, u, l)
      const geo = wallGeometry(built, u)
      if (!geo) continue
      liftWall(geo, capped, u, l)
      const planter = w.heightM <= 0.6 && rooms.some((r) => r.kind === 'planter' && r.wallIds.includes(w.id))
      put(w.heightM <= KERB_M || planter ? CONCRETE : (this.outRef(s, w.id, k) ?? EXTERIOR_PLASTER), geo)
      const top = capGeometry(capped, u) // a solid low wall's cap, as its wall
      if (top) liftWall(top, capped, u, l), put(planter ? CONCRETE : (this.edgeRef(s, w.id, k) ?? EXTERIOR_PLASTER), top)
      const L = core.wallFrame(w, u.vertices).lengthM || 1
      built.openings.forEach((o) => {
        if (o.kind !== 'window' && o.kind !== 'slider') return
        const t = (o.offsetM + o.widthM / 2) / L
        const p = this.paneParts(s, k, w, u, o)
        const up = l.foot[0] + t * (l.foot[1] - l.foot[0])
        put('panes', p.glass.translate(0, up, 0)) // bare glass: its rooms lit at night (interiors)
        for (const g of p.band?.[1] ?? []) put(p.band![0], g.translate(0, up, 0)) // (a glass wall's spandrel)
      })
    }
    const storey = Math.min(storeyTop(u, rooms) || WALL_M, cap)
    const column = (k === 0 && this.edgeRef(s, null, 0)) || EXTERIOR_PLASTER // (the ground floor's columns: the building's edges)
    for (const p of u.pillars ?? []) {
      const g = box(p.x - p.wM / 2, p.y - p.hM / 2, p.x + p.wM / 2, p.y + p.hM / 2, core.floorLevelAt(u, p.x, p.y, rooms), storey)
      put(column, column === EXTERIOR_PLASTER ? g : faceUvs(g))
    }
    if (k >= 1 && k <= top) for (const [r, gs] of this.edgesBy(s, k, plate(u, rooms, -UNDER_LEVEL_M, PLATE_M, u.walls, lid))) put(r, ...gs)
    if (k > top) {
      const full = new Set(u.walls.filter((w) => w.heightM >= 2).map((w) => w.id))
      const ids = new Set(u.walls.map((w) => w.id)) // (a room going round a column has edges that are no wall)
      const caps = rooms.filter((r) => r.kind !== 'shaft' && r.wallIds.every((id) => full.has(id) || !ids.has(id)))
      const capWalls = new Set(caps.flatMap((r) => r.wallIds))
      for (const [r, gs] of this.edgesBy(s, k, plate(u, caps, WALL_M + PLATE_M, PLATE_M, u.walls.filter((w) => capWalls.has(w.id))))) put(r, ...gs)
    }
    return [...lists].map(([m, geos]) => [m, merge(geos.map(plain))])
  }

  /**
   * After the tower is shown, a little a frame (it opens as fast as the shells did and fills in), each part once, when first
   * wanted (frame), one after another: every flat's rooms behind its windows, nearest the camera first (a drawing's geometry
   * made once for every floor it is on: interiors.ts); the levels' outdoor pieces (their own layout by kind: furnish presets,
   * studio/furniture.ts layoutFor) through the walk view's furniture loader, batched once all in — round the flat not on
   * Lite; every flat's furniture by the walk's presets, nearest first (on Low shown on the storeys nearest the camera only:
   * update) — not on Lite, and only once the Building view has been opened: the walk starts as fast as before.
   */
  private want(all = true): void {
    const need = (k: keyof Building['started'], ok: boolean, run: () => Promise<void>) => {
      if (!ok || this.started[k]) return
      this.started[k] = true
      this.work = this.work.then(run)
    }
    need('rooms', true, () => this.furnishRooms())
    this.roomsWork ??= this.work
    // the pieces' models downloaded meanwhile, not after the rooms: Sheltech's grounds waited ~0.3–1.9 s for theirs (session 31 open lane)
    if (this.piecesShown && !this.started.pieces) this.preloadPieces()
    need('pieces', this.piecesShown, () => this.furnishPieces())
    if (!all) return
    need('things', this.seen && this.tier !== 'lite', () => this.furnishThings())
    if (this.seen) this.work = this.work.catch((e: unknown) => console.warn('[plotline] tower', e)).finally(() => void (this.progress.furnished ||= performance.now())) // (a failed piece: the tower is no longer busy)
  }
  private work: Promise<void> = Promise.resolve()
  /** the rooms, pieces and furniture start once `p` settles (PlotlineScene: a page's flat's own furniture in first) */
  after(p: Promise<unknown>): void {
    this.work = Promise.all([this.work, p.catch(() => {})]).then(() => {})
  }
  /**
   * Every other flat's rooms and (not on Lite) the levels' pieces in now: a stair's floor getting ready shows them with it,
   * made ready to draw (PlotlineScene.arrive warm), not in a hitch after — a first visit's trees compiling took 0.4–0.9 s.
   */
  ready(): Promise<void> {
    this.piecesShown = this.tier !== 'lite'
    this.want(false)
    return (this.roomsWork ?? this.work).catch((e: unknown) => console.warn('[plotline] tower', e))
  }
  /** the other flats' rooms in (want): what a stair's floor waits for — its grounds' pieces come in after it shows (their programs were compiled for the floor before: the same pieces, the same tier) */
  private roomsWork: Promise<void> | null = null
  private t0 = performance.now()
  /** ms of a frame the tower's filling in may take (pause): 8 while the 3D is drawn; more under the start screen, nothing drawn then (PlotlineScene) */
  budgetMs = 8
  /**
   * Nothing drawn yet (under the start screen, PlotlineScene): a share of the work done waits for the page's next task, not the
   * next frame — there, while Firefox makes the flat's programs, a frame came every 0.1–0.3 s and the grounds' pieces waited
   * 0.3–1.2 s for four or five of them (session 31 open lane).
   */
  unseen = false
  /** a frame's share of the work done: wait for the next one; true: the tower is gone */
  private pause = async (): Promise<boolean> => {
    if (performance.now() - this.t0 > this.budgetMs) {
      await new Promise<void>((ok) => (this.unseen ? setTimeout(ok, 0) : requestAnimationFrame(() => ok())))
      this.t0 = performance.now()
    }
    return this.disposed
  }

  private async furnishRooms(): Promise<void> {
    for (const f of insideOrder(this.flats, this.eye)) {
      const g = await this.drawing(f).rooms
      if (this.disposed) return
      if (g) this.show(f, 'rooms', g)
      if (await this.pause()) return
    }
    this.progress.rooms = performance.now()
  }

  /** the levels' outdoor pieces all in (or none to show here): the start screen waits for them (PlotlineScene.drawable) */
  get piecesIn(): boolean {
    return !this.piecesShown || this.piecesDone
  }
  private piecesDone = false

  /** every level's pieces' models on their way at once (each piece still goes in in order, once the flat's furniture is in) */
  private preloadPieces(): void {
    void preloadModels(
      this.furnishing.flatMap(({ s }) => {
        const rooms = this.roomsOf(s)
        return layoutFor(this.t.FLATS[s].unit, rooms).filter((p) => core.isOutdoor(rooms.find((r) => r.id === p.roomId)?.kind ?? 'shaft'))
      }),
    )
  }

  private async furnishPieces(): Promise<void> {
    this.preloadPieces() // (asked for already: want)
    for (const f of this.furnishing) {
      const { s, group } = f
      this.addingPieces = true
      const pieces = (f.pieces = new THREE.Group())
      pieces.visible = this.piecesShown
      group.add(pieces)
      const made = keptIn(PIECES, this.t).get(s)
      if (made) await this.framedOnce // as their building did, after a stair's floor shows: sent with it (warm), its trip took ~0.2 s longer
      if (this.disposed) return
      if (made)
        for (const o of made) {
          const c = o.clone() // (its shapes and materials shared; the first tower's were batched away: shown again)
          c.traverse((x) => ((x.raycast = () => {}), x.layers.mask === 1 << HIDDEN && x.layers.set(0)))
          pieces.add(c)
          this.casts(c, true)
          if (await this.pause()) return // (a stair's floor still coming in: its frames stay short)
        }
      else {
        const { unit: u } = this.t.FLATS[s]
        const rooms = this.roomsOf(s)
        const byId = new Map(rooms.map((r) => [r.id, r]))
        const ps = layoutFor(u, rooms)
        const built: THREE.Object3D[] = []
        for (const p of ps) {
          const r = byId.get(p.roomId)
          if (p.removed || !r || !core.isOutdoor(r.kind)) continue
          const obj = await buildFurniture(p, roomCeiling(r, u, rooms), core.roomLevelAt(r, u, p.x, p.y), bottomOf(ps, p))
          if (this.disposed) return
          obj.traverse((o) => (o.raycast = () => {})) // not a flat: a click goes through
          lightPiece(obj, [0, 0]) // its materials read the daylight atlas (the walk's pieces share them): here its neutral corner, lit as before
          pieces.add(obj)
          built.push(obj)
          this.casts(obj, true)
          this.onChange()
          if (await this.pause()) return
        }
        keptIn(PIECES, this.t).set(s, built)
      }
      this.onChange()
      // one mesh per material per 8 m square (batch.ts, as the flat's furniture; Sheltech's ground: ~220 meshes → ~55, the
      // leaf clusters stay their own), with the shadow flags they were built with; frame's rule on top (casts)
      pieces.traverse((o) => void (o.userData.casts !== undefined && (o.castShadow = o.userData.casts)))
      batch(pieces, CELL_M)
      this.casts(pieces, true)
      this.addingPieces = false
      this.batchAround()
    }
    this.piecesDone = true
  }

  private async furnishThings(): Promise<void> {
    for (const f of insideOrder(this.flats, this.eye)) {
      const g = await this.drawing(f, this.pause).things
      if (this.disposed) return
      if (g) this.show(f, 'things', g)
      if (await this.pause()) return
    }
  }

  /** Flat f's rooms (and, given `pause`, its furniture), made once for every floor that keeps the same; a level draws its own floors. */
  private drawing(f: Inside, pause?: () => Promise<boolean>): { rooms?: Promise<THREE.BufferGeometry | null>; things?: Promise<THREE.BufferGeometry | null> } {
    const { unit: u } = this.t.FLATS[f.s]
    // as the walk opens that floor (ViewerApp prepare): its own furniture and finishes staff left there, else the drawing's,
    // else the plan's — floors that keep the same share one geometry
    const k = keptAt(u, f.k, this.t)
    const wallH = this.wallsOf(f.k)
    const key = `${f.s}|${JSON.stringify([k.layout, k.finishes])}|${[...f.skip].join()}${this.t.STOREYS ? `|${wallH}` : ''}`
    let d = this.drawn.get(key)
    if (!d) this.drawn.set(key, (d = {}))
    const rooms = f.skip.size ? this.roomsOf(f.s).map((r) => (f.skip.has(r.id) ? { ...r, kind: 'shaft' as const } : r)) : this.roomsOf(f.s)
    if (!d.rooms) {
      const kept = this.roomsKept
      d.rooms = kept.get(key) ?? kept.set(key, roomsGeometry(u, rooms, wallH, this.t.LEVELS?.[f.s] === undefined, k.finishes)).get(key)!
      void d.rooms.then((g) => g && KEPT.add(g))
    }
    if (pause) d.things ??= furnitureGeometry(k.layout ? { ...u, furniture: k.layout } : u, rooms, pause)
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
    mesh.renderOrder = 1 // after the shells, whose faces hide most of it; and left out of batchAround (one mesh a flat already)
    mesh.userData = { level: f.k, inside: true }
    if (this.cuts(this.picked) && f.k > this.picked) (mesh.visible = false), (mesh.userData.cut = true)
    else mesh.visible = this.shows(f.k) // round the flat: the floors the tier shows
    f[which] = mesh
    this.unbatchAround()
    this.add(mesh)
    this.lightFlat(f)
    this.placeInside()
    this.onChange()
    this.batchAround()
  }

  /**
   * Every flat's furniture shown as the tier says (furnishes; on Low the picked floor too), unless a cut hides its floor — in
   * the Building view only: back in Walk or the Dollhouse it is put away (qa4fix: 0.42 M triangles, 8 draws and twice the
   * frame time stayed on Type A after a visit); kept made, so the Building view shows it again at once.
   */
  private placeInside(): void {
    for (const f of this.flats) if (f.things) f.things.visible = !this.around && !f.things.userData.cut && this.shows(f.k) && furnishes(this.tier, f.k, this.furnishedFloors, this.picked)
  }

  /** Flat f's lamps (flatLamps): the picked flat's while the Lights are on, a common level's at night, the others the night pattern. */
  private lightFlat(f: Inside): void {
    const how = f.k === this.picked && this.pickedStems.includes(f.s) ? 'picked' : f.level ? 'level' : 'home'
    const rooms = this.roomsOf(f.s)
    flatLamps(f.home, rooms, how).forEach((v, i) => setLamp(f.lamps, i, v, hash01(`${f.home}|${rooms[i].id}|tint`), rooms[i].kind === 'balcony'))
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
    const PLATE_M = this.plateM
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
        geos.push(alongWall(w, u, -t, L + t, level ? -UNDER_LEVEL_M : -PLATE_M, level ? Math.min(w.heightM, this.t.FLOOR_M) : roof ? this.parapetM : this.wallsOf(k), side * (t + off), side * (t + off + 0.005)).translate(sh.x, y, sh.y))
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
      else if (!hide && o.userData.cut) (o.visible = !o.userData.proxy), delete o.userData.cut // (a pick proxy stays unseen)
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

  /** the floor picked (highlight): PlotlineScene.retower picks it again on the new tower */
  get pickedFloor(): number {
    return this.picked
  }

  /**
   * Finishes' "This wall" (qa4fix): the outer face of wall run `run` of drawing `drawing` on every floor it stands on — each
   * wall's face a rectangle 2 cm proud of it, as line segments (scene frame, x y z per point, two points a segment) for the
   * scene to outline until the card closes.
   */
  runFaces(drawing: Id, run: Id): number[] {
    const out: number[] = []
    const top = topFloor(this.t)
    for (const [k, y] of this.levels.filter(([k]) => k <= top)) // (the roof's parapet: not a storey of it)
      for (const s of this.onFloor(k)) {
        const u = this.t.FLATS[s].unit
        if (u.id !== drawing) continue
        const runs = outerRuns(u)
        const rooms = this.roomsOf(s)
        const d = this.shift(s)
        for (const w of u.walls) {
          if ((runs.get(w.id) ?? w.id) !== run) continue
          const f = core.wallFrame(w, u.vertices)
          const n = { x: -f.dir.y, y: f.dir.x } // (outerSide's side)
          const off = (outerSide(w, u, (p) => !!core.roomAt(p, rooms, u)) || 1) * (w.thicknessM / 2 + 0.02)
          const [ax, az] = [f.origin.x + n.x * off + d.x, f.origin.y + n.y * off + d.y]
          const [bx, bz] = [ax + f.dir.x * f.lengthM, az + f.dir.y * f.lengthM]
          const top = y + Math.min(w.heightM, this.wallsOf(k))
          out.push(ax, y, az, bx, y, bz, bx, y, bz, bx, top, bz, bx, top, bz, ax, top, az, ax, top, az, ax, y, az)
        }
      }
    return out
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
    const owners = this.paneOwners.get(hit.object)
    const pane = owners?.[hit.faceIndex ?? -1]
    if (owners) return pane ? { ...pane, ...this.wallNear(hit.point, pane.k) } : null
    let o: THREE.Object3D | null = hit.object
    while (o && o !== this && typeof o.userData.level !== 'number') o = o.parent
    const k = o && o !== this ? (o.userData.level as number) : floorAtY(hit.point.y, this.levels)
    return k === null ? null : { k, flat: (hit.object.userData.flat as FlatRef | undefined) ?? null, ...this.wallNear(hit.point, k) }
  }

  /**
   * What wears the outside at scene point p (an architect's shape dressed a wall at a time: PlotlineScene.dressShell): the floor
   * whose storey holds it and the drawing's wall within 40 cm of its face (a cladding stands proud of it), if one.
   */
  outsideAt(p: THREE.Vector3): { k: number; drawing?: Id; run?: Id } | null {
    const k = floorAtY(p.y, this.levels)
    if (k === null) return null
    const w = this.wallNear(p, k, 0.4).wall
    return { k, ...(w ? { drawing: w.drawing, run: w.run } : {}) }
  }

  /** The wall of what stands on floor k nearest scene point p, if p is on it (its face, 15 cm slack): `{ wall }`, else nothing. */
  private wallNear(p: THREE.Vector3, k: number, slack = 0.15): Pick<TowerHit, 'wall'> {
    let best: { d: number; drawing: Id; run: Id; id: Id; stem: string } | null = null
    for (const s of this.onFloor(k)) {
      const u = this.t.FLATS[s].unit
      const sh = this.shift(s)
      const n = core.nearestWall({ x: p.x - sh.x, y: p.z - sh.y }, u)
      if (n && n.distanceM <= n.wall.thicknessM / 2 + slack && (!best || n.distanceM < best.d)) best = { d: n.distanceM, drawing: u.id, run: outerRuns(u).get(n.wall.id) ?? n.wall.id, id: n.wall.id, stem: s }
    }
    return best ? { wall: { drawing: best.drawing, run: best.run, id: best.id, stem: best.stem } } : {}
  }

  /**
   * After Look.setHour: the sun's shadow frustum around the whole tower (Look's covers the flat only), reaching the street
   * behind it; the panes dim with the haze at dusk; the rooms' lamps come on as the sky goes (the picked flat's: `lamps`, the
   * Lights button's state — render.ts lightsOn); no shadow maps (`shadows` false, Lite): no sun inside, it would pour through
   * the ceilings. The lifts' night light is set as seen on screen: `linear` (High draws into a linear target, exposed after)
   * takes the exposure and the screen's curve back out of it.
   */
  setSun(sun: THREE.DirectionalLight, night = 0, exposure = 1, lamps = false, linear = false, shadows = true): void {
    this.setNight(night, exposure, lamps, linear, shadows)
    this.fitSun(sun)
  }

  /** The panes, the rooms' lamps and the lifts by the hour (every mode; setSun's words). */
  setNight(night: number, exposure = 1, lamps = false, linear = false, shadows = true): void {
    this.paneSky.value = PANE_HAZE * (1 - night) // the haze they mirror goes with the light
    this.night = night
    this.lampsOn = lamps
    inside.sun.value = shadows ? 1 : 0
    for (const f of this.flats) this.lightFlat(f)
    const seen = (v: number) => (linear ? new THREE.Color().setRGB(v, v, v, THREE.SRGBColorSpace).r / exposure : v)
    const times = (v: number) => (linear ? v : Math.pow(1 + v, 1 / 2.2) - 1) // on screen: the same lift as High's once its picture is encoded
    this.lift.strength(times(PICK_LIFT), seen(PICK_NIGHT * night))
    this.hoverLift.strength(times(HOVER_LIFT), seen(HOVER_NIGHT * night))
  }

  /** The Building view: the sun's shadow frustum round the whole tower and the street behind it (Look fits the flat's). */
  private fitSun(sun: THREE.DirectionalLight): void {
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

  /** No more rooms or pieces: a stair was taken, this tower goes once the next floor shows (its work would only slow that floor's getting ready). */
  halt(): void {
    this.disposed = true
  }

  /**
   * This tower built again round the same flat (its outside or its roof changed: PlotlineScene.retower): the rooms and furniture behind
   * the glass made for `old` are this one's too (drawing: the same keys) — `old` lets go of them unfreed.
   */
  adopt(old: Building): void {
    for (const [k, d] of old.drawn) this.drawn.set(k, d)
    old.handedOver = true
  }
  private handedOver = false

  dispose(): void {
    this.disposed = true
    // the furniture shares its models' geometry with the loader's cache (and the walk view): not ours to free
    for (const { pieces } of this.furnishing) pieces?.children.filter((o) => o.userData.kind === 'furniture').forEach((o) => o.removeFromParent())
    this.traverse((o) => {
      const g = (o as THREE.Mesh).geometry
      if (g && !KEPT.has(g) && !(this.handedOver && o.userData.inside)) g.dispose() // (a kept drawing's rooms: the next tower shows them; three uploads them again if it was freed; handed over: adopt)
    })
    this.washes.forEach((g) => g.dispose()) // (the street's materials: kept with it for the page, STREETS)
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
  /** on the walked floor: its rooms the walked flat has too (sharedWith: a shared lobby), drawn by the flat, not here */
  skip: Set<Id>
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
  const lit = rooms.map((r) => (!indoor(r) ? 0 : how === 'home' ? roomLight(home, r.id) : ALWAYS_LIT))
  // a balcony: a little of the light of the lit room it opens from (qa3 P10: the lamps' light spilling onto it)
  return rooms.map((r, i) => (r.kind !== 'balcony' ? lit[i] : SPILL * Math.max(0, ...rooms.map((o, j) => (o.wallIds.some((id) => r.wallIds.includes(id)) ? lit[j] : 0)))))
}
/** how much of the brightest lit room next to it a balcony gets at night: its light through the door and windows onto the floor outside */
export const SPILL = 0.35

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
