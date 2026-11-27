/**
 * PlotlineScene — the whole 3D engine behind one canvas. Plain class, no React.
 *
 * Coordinates: plan (x, y) metres → world (X, Y=up, Z=y). Wall-local frame from
 * core.wallFrame: u along a→b, v up, w along the wall normal (dir rotated +90°
 * in plan = (-dir.y, dir.x)); world basis e_u=(dir.x,0,dir.y), e_v=(0,1,0),
 * e_w=(n.x,0,n.y) is right-handed, so BoxGeometry faces keep their winding.
 *
 * Assumptions about core: roomPolygon has any winding (we fix triangle winding
 * per triangle); wallPieces are in the wall-local (u, v) frame and never overlap;
 * roomAt uses centerline polygons so a point ±(thickness/2 + 5 cm) from a wall's
 * midpoint lands in the adjacent room.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { XRControls } from './xr'
import { Building, onStorey, type TowerHit } from './building'
import { LITE_MAX_TRIANGLES, dressShell, loadShell, type Dress } from './shell'
import * as core from '../core'
import type { Configuration, FinishSlot, FurniturePlacement, Id, MaterialRef, Pillar, Pt, Room, Shell, Unit, Wall } from '../core'
import { faceWallId, outerRuns, outsideOf, roomKey, wallKey, type Outside } from '../furnish/finishes'
import { floorIn, roofIn, stemIn, towerOf } from '../data/building'
import { coveringOf } from '../data/building/roof'
import { kitAsset, lightOf, type ObjectKind } from '../furnish/kit'
import { LANDING_M, isStair, stairHole, stairSpot, treadBelow } from '../furnish/stairs'
import { buildProcedural, lean, lite } from '../furnish/procedural'
import { STAIR_RISE } from '../furnish/procedural.meta'
import { HDRI } from '../furnish/textures'
import { GAP_PREFIX, KERB_M, bayLineGeometry, bayMarkings, buildSkirtings, closeGaps, dressOpening, floorGeometry, liftWall, liftedWall, pillarParts, poolBasin, raiseHeads, roomCeiling, stepFaces, stepGeometry, storeyCeiling, storeyTop, STOREY_WALL_M, wallGeometry, wallLift, wellParts, type WallLift } from './details'
import { bakeSteps, daylit, isCovered, lightPiece, mapDaylight, pieceDayUv, setDaylight, type BakeKeep, type Daylight } from './daylight'
import { buildFurniture, preloadModels, warmStandins } from './furniture'
import { bottomOf } from '../studio/furniture'
import { CONCRETE, EDGE_PLASTER, EXTERIOR_PLASTER, MORE_PICTURES, PAINT, PICTURES, SOLID_CUT, isBlank, litePlain, loading, materialFor, resolveFinish, samePictures, setMaxAnisotropy, zoneFinishRef } from './materials'
import { PANES, WATER } from './openings'
import { capGeometry, railParts } from './rails'
import { Look, type LookKept, SITE_REACH_M, TIERS, forcedScale, lensFov, lightsOn, needsFrame, pixelRatioFor, skyLight, slowFrames, type LightsMode, type Quality, type Well } from './render'
import { batch, HIDDEN, unbatch } from './batch'
import { SEASON_TINT, WindFlow } from './wind'
import { neighbours, siteCut } from './context'
import type { Street } from '../data/building'

export type PickKind = 'wall' | 'floor' | 'ceiling' | 'opening' | 'furniture'
export interface PickHit {
  /** the anchor frame (see localOffset); what the thing IS is objectKind */
  kind: PickKind
  /** placement / wall / room / opening id; a part of one (vanity mirror, door handle, window glass) is `${parentId}/${part}` */
  id: Id
  /** buyer-facing name tag: "3-seat fabric sofa", "Bed-1 floor", "Door handle" */
  label: string
  objectKind: ObjectKind
  roomId?: Id
  point: { x: number; y: number; z: number }
  /** wall/opening: (u along wall from vertex a, v height); floor/ceiling: plan (x, y); furniture: local (x, z) */
  localOffset?: { u: number; v: number }
  /** a piece: the room's floor the same ray reaches behind it (floorBehind) — a Dollhouse click on a bed or a rug drops you there */
  under?: { x: number; y: number; z: number }
}
/** orbit = the dollhouse; building = the whole tower from outside (building.ts) */
export type SceneMode = 'walk' | 'orbit' | 'building'
/**
 * Arrange (staff, src/viewer/arrange.ts): what the pointer does to a piece, in plan metres. `drag`: `at` = the piece's
 * centre on the horizontal plane it was grabbed at, `wall` = the wall face under the pointer (normal toward the viewer; `y` the point's height above the floor),
 * `hole` = the face of the opening the pointer looks through (a doorway), when nearer than what it meets beyond.
 * `resize`: a handle dragged — the new size along `axis`, the `sign` face moving.
 */
export type ArrangeEvent =
  | { kind: 'select'; id: Id | null }
  | { kind: 'drag'; id: Id; at: Pt | null; wall: { p: Pt; n: Pt; y?: number } | null; hole?: { p: Pt; n: Pt } | null }
  | { kind: 'resize'; id: Id; axis: 'x' | 'y' | 'z'; sign: 1 | -1; sizeM: number }
  | { kind: 'drop'; id: Id }
/**
 * Edit openings (staff): `select` a door / window / slider / passage, or a low wall (null: empty space); `slide` = its body
 * dragged, the offset (m from its wall's corner A) the pointer asks for; `resize` = an end dot dragged to uM along the wall;
 * a low wall's `wall-end` = its end dot dragged to `at` on the wall's line (plan m; `rigid`: Alt held), `wall-move` = its
 * body dragged `dM` across its line (along its normal as picked); `drop` ends the gesture. The Studio reducer applies its
 * rules to these (model.ts drag-opening / resize-opening; arrange.ts wallDrag).
 */
export type OpeningEvent =
  | { kind: 'select'; id: Id | null }
  | { kind: 'slide'; id: Id; offsetM: number }
  | { kind: 'resize'; id: Id; end: 'a' | 'b' | 'top' | 'sill'; uM: number }
  | { kind: 'wall-end'; id: Id; end: 'a' | 'b'; at: Pt; rigid: boolean }
  | { kind: 'wall-move'; id: Id; dM: number }
  | { kind: 'drop'; id: Id }
type Handle = { axis: 'x' | 'y' | 'z'; sign: 1 | -1 }
/** Without deleted pieces (tombstones: built hidden, so an undo shows them again; never lit, shadowed or picked). */
const present = (u: Unit): Unit => (u.furniture.some((p) => p.removed) ? { ...u, furniture: u.furniture.filter((p) => !p.removed) } : u)
const SEL = '#2458a6' // --accent (src/index.css): the one blue, as everywhere else
const REFUSED = '#b5432b' // --danger: terracotta, only for a refusal
/**
 * What a picked piece, opening or low wall is outlined with, seen through everything: its colour 2 px wide over a 4 px
 * white halo, and dots of its colour on a white rim — the edge reads on a black TV and on a white wardrobe alike, whatever
 * the hue (session 31: the old bright sky blue read on dark wood, the deep accent alone would not).
 */
const lineMat = (color: string): LineMaterial => new LineMaterial({ color, linewidth: 2, depthTest: false, transparent: true })
const haloMat = (): LineMaterial => new LineMaterial({ color: '#ffffff', linewidth: 4, depthTest: false, transparent: true, opacity: 0.85 })
const dotMat = (color: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true })
/** the segments of `edges` as a halo and a line over it (never picked: a click goes to what is under them) */
function outline(edges: THREE.BufferGeometry, line: LineMaterial, halo: LineMaterial): LineSegments2[] {
  const geo = new LineSegmentsGeometry().setPositions(edges.getAttribute('position').array as Float32Array)
  edges.dispose()
  return [halo, line].map((m, i) => Object.assign(new LineSegments2(geo, m), { renderOrder: 10 + i, raycast: () => {} }))
}
/** a drag dot's rim, m (its core 0.058) */
const DOT_M = 0.075
/**
 * The most a drag dot measures across on screen, CSS px: 7 % of the view's short side, never over a fingertip's 44 (the
 * --touch size) — on a phone, near a picture on the wall, the 15 cm balls hid the piece (session 31 tidy).
 */
export const dotMaxPx = (w: number, h: number): number => Math.min(44, 0.07 * Math.min(w, h))
/** The scale that keeps a ball of `radiusM` at `distM` from a `fovDeg` (vertical) camera on a view `viewPx` tall at most `maxPx` across; 1 when it is smaller already. */
export function dotScale(radiusM: number, distM: number, fovDeg: number, viewPx: number, maxPx: number): number {
  const across = (radiusM * viewPx) / (Math.max(distM, 1e-3) * Math.tan((fovDeg * Math.PI) / 360))
  return across > maxPx ? maxPx / across : 1
}
const dotSeen = { at: new THREE.Vector3(), eye: new THREE.Vector3(), k: new THREE.Vector3(), view: new THREE.Vector2() }
/** a drag dot at `at`: the white rim is what a click finds, the coloured core is drawn over it; up close it shrinks (dotMaxPx) */
function dragDot(at: THREE.Vector3, core: THREE.Material, rim: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(DOT_M, 16, 8), rim)
  m.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.058, 16, 8), core), { renderOrder: 13, raycast: () => {} }))
  m.position.copy(at)
  m.renderOrder = 12
  // drawn rim first (renderOrder), so its core is drawn with the size set here; a click finds the dot as it is drawn
  m.onBeforeRender = (renderer, _scene, camera) => {
    const { at, eye, k, view } = dotSeen
    m.scale.setScalar(1)
    m.updateMatrixWorld(true)
    const cam = camera as THREE.PerspectiveCamera
    if (!cam.isPerspectiveCamera || renderer.xr.isPresenting) return
    renderer.getSize(view)
    k.setFromMatrixScale(m.matrixWorld) // the piece's own scale, carried by the dot
    const d = at.setFromMatrixPosition(m.matrixWorld).distanceTo(eye.setFromMatrixPosition(cam.matrixWorld))
    m.scale.setScalar(dotScale(DOT_M * Math.max(k.x, k.y, k.z), d, cam.fov, view.y, dotMaxPx(view.x, view.y)))
    m.updateMatrixWorld(true)
  }
  return m
}
/** what a built piece is built at: its own size, and a staff's own model's library size (changed there: built again) */
const sizeKey = (p: FurniturePlacement): string => JSON.stringify([p.sizeM ?? null, kitAsset(p.assetId)?.own ? kitAsset(p.assetId)!.sizeM : null])

/** Eye height (m): a Dhaka buyer's standing eye and the real-estate camera height; viewer/frame.ts EYE mirrors it. Was 1.6: rooms read cramped. */
const EYE = 1.45
/**
 * Vertical field of view (°) walking: 50 = 79° across a 16:9 screen, 73° across 16:10 — a 22 mm lens, the common
 * walkthrough choice. Was 65 (97° across 16:9, a 16 mm lens): the centre of the view shrank to 0.73 of this, so rooms
 * and furniture read small and far, and the edges stretched 2.3× (1.7× now) (founder 2026-10-19: "make the flats look a bit
 * bigger"). The dollhouse and the Building view keep VIEW_FOV. viewer/frame.ts and spawn.ts still frame first views for 65.
 */
const WALK_FOV = 50
const VIEW_FOV = 65
const WALK_RADIUS = 0.3
/** A wall this tall is a storey wall (not a parapet, a screen, a planter edge): under the slab above it reaches it. */
/** The tallest step the walker takes, up or down (canStep). */
const MAX_STEP_M = 0.8
const UP = new THREE.Vector3(0, 1, 0)
/** a frame's material as openings.ts built it (applyMaterials: back to it when no frame colour is chosen) */
const BUILT = new WeakMap<THREE.Mesh, THREE.Material>()
const SIZE = new THREE.Vector3()
/** a press that drifts at most this far is a click: it selects, never moves a piece or an opening (a hand's click drifts 3–5 px; Studio tool F the same) */
const CLICK_PX = 6
/** a finger's tap may drift this far (a fingertip rolls more than a mouse) and must end within LONG_PRESS_MS: held longer it is a long press, which does nothing */
const TAP_PX = 12
const LONG_PRESS_MS = 500
/** what wakes Lite's drawing for WAKE_MS (render.ts needsFrame): any input on the page — a button, the sun slider, a key */
const WAKE = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup'] as const
const WAKE_MS = 1000
/** the machine is judged (render.ts slowFrames) from this long after the furniture has loaded: its shaders and pictures settle first */
const WARM_MS = 1000
/** a frame longer than this is the page coming back (a tab switch, a sleeping laptop), not a slow machine */
const LOST_FRAME_MS = 2000
/** a group is batched again (batch.ts) once nothing in it has changed for this long */
const BATCH_MS = 400
/**
 * Firefox makes each new shader program on its graphics process, one after another (session 31, GTX 980: 0.1 s for the
 * tower's, 0.3 s for a surface lit by the flat's 12 lamps), and the page waits only when one is first drawn (no
 * KHR_parallel_shader_compile to ask whether it is done). Under the load screen (prepare) every program is asked for every
 * PREP_MS as the flat comes in — made while the page is busy with its models and the tower — and the frame is drawn once
 * behind the screen once everything is in (each round asks only for what is new: askedAs).
 */
const PREP_MS = 250
/** the most of a frame under the load screen the pictures may take on their way to the graphics chip (sendPictures) */
const SEND_MS = 12
/**
 * One stand-in of each kind of lit surface a flat draws (materials.ts samePictures, daylight.ts daylit): a room's surface (the
 * plain ones share its program); on High and Low also a two-sided piece or leaf, the glass and the instanced leaves — their
 * programs asked for by Look.prewarm as the first flat is built. Never freed: a program goes with its last material.
 */
function standIns(isLite: boolean): THREE.Group {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
  // materials of their own, never the shared ones (materialFor's): three draws opaque surfaces in the order their materials
  // were made — a tower wall's made first drew the tower behind the flat's walls before them (Lite's Walk +0.5 ms, measured)
  const room = new THREE.MeshStandardMaterial()
  samePictures(room)
  daylit(room)
  const g = new THREE.Group().add(new THREE.Mesh(geo, room))
  if (isLite) return g // (Lite's pieces and glass are drawn as the rooms or plainer: no stand-in of theirs would match)
  const two = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide })
  const glass = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false })
  for (const m of [two, glass]) samePictures(m)
  const leaves = new THREE.InstancedMesh(geo, two, 1)
  leaves.setColorAt(0, new THREE.Color())
  return g.add(new THREE.Mesh(geo, two), new THREE.Mesh(geo, glass), leaves)
}

/**
 * What a part's program is made from, as far as it can change while the flat comes in (PlotlineScene.prepare asks again only
 * when it does): its shape (a plant's leaves given theirs, a simplified copy), its instance colours, its materials and their
 * versions (a picture arrived, a setting changed).
 */
export const askedAs = (o: { geometry: { id: number }; material: { uuid: string; version: number } | { uuid: string; version: number }[]; instanceColor?: unknown }): string =>
  `${o.geometry.id}|${o.instanceColor ? 1 : 0}|${[o.material].flat().map((m) => `${m.uuid}.${m.version}`).join()}`

/** the longest the light map waits for the rest of the 3D under the load screen (loadEnvironment): a stuck download must not hold the sky */
const ENV_WAIT_MS = 15_000

/** The GPU gave up: its context lost, out of memory, or not back LOST_MS after a loss. */
export type GpuFailure = 'lost' | 'memory' | 'gone'
const LOST_MS = 5000

/**
 * A press let go: was it a click? A mouse: it drifted at most CLICK_PX (as before). A finger or a pen: at most TAP_PX,
 * let go within LONG_PRESS_MS, and never part of a two-finger gesture (a pinch's last finger up is no tap).
 */
export function isClick(p: { dx: number; dy: number; ms: number; finger: boolean; multi: boolean }): boolean {
  const d = Math.hypot(p.dx, p.dy)
  return p.finger ? !p.multi && p.ms < LONG_PRESS_MS && d <= TAP_PX : d <= CLICK_PX
}

/** how far from a drag dot's centre a finger still takes it, CSS px: half a fingertip (the --touch size, 44) — the dot is drawn smaller */
export const FINGER_REACH_PX = 22
/** Of the screen points `at` (CSS px; null = behind the camera), the index of the nearest within `reachPx` of `p`, else -1. */
export function nearestWithin(at: ({ x: number; y: number } | null)[], p: { x: number; y: number }, reachPx: number): number {
  let best = -1
  let bd = reachPx
  at.forEach((q, i) => {
    const d = q ? Math.hypot(q.x - p.x, q.y - p.y) : Infinity
    if (d <= bd) (bd = d), (best = i)
  })
  return best
}

/**
 * The interior HDRI is a photo studio lit from one side: a wall facing world +X got irradiance 1.29, −X 0.78,
 * +Z 0.81, −Z 1.03, so a room's walls went light or dark with their compass bearing, not with their windows
 * (Type A at 15:30: Bed-1 walls 214–225 sRGB, living 186–193). Averaged over four quarter turns about the
 * vertical (half-float RGBA equirect, in place), every wall bearing gets the same fill; floor vs ceiling stays.
 */
/**
 * What ray hit `h` picks: the object it belongs to (the nearest ancestor with a `kind`), null when hidden or nothing.
 * `piece` (Edit furniture, G): a pane that is not part of a piece — window / slider glass, water — is seen through, so a
 * bed seen through the balcony's sliding door is picked, not the glass (founder 2026-10-09 "sometimes doesn't").
 */
export function pickedAt(h: THREE.Intersection, piece = false): THREE.Object3D | null {
  for (let v: THREE.Object3D | null = h.object; v; v = v.parent) if (!v.visible) return null // a deleted piece (Arrange) is built but hidden
  let o: THREE.Object3D | null = h.object
  while (o && !o.userData.kind) o = o.parent
  if (piece && o?.userData.kind !== 'furniture' && PANES.includes((h.object as THREE.Mesh).material as THREE.MeshStandardMaterial)) return null
  return o
}

/** Behind the piece hits[i] (a bed, a rug): the first room floor further along the same ray, or null (qa3 P16: a Dollhouse click there did nothing). */
export function floorBehind(hits: THREE.Intersection[], i: number, piece = false): THREE.Vector3 | null {
  for (let j = i + 1; j < hits.length; j++) if (pickedAt(hits[j], piece)?.userData.kind === 'floor') return hits[j].point
  return null
}

export function evenBearings(t: THREE.DataTexture): void {
  const { data, width: w, height: h } = t.image as { data: Uint16Array; width: number; height: number }
  const q = Math.floor(w / 4)
  const { fromHalfFloat: f, toHalfFloat: t16 } = THREE.DataUtils
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < q; x++) {
      for (let c = 0; c < 3; c++) {
        const i = [0, 1, 2, 3].map((k) => (y * w + x + k * q) * 4 + c)
        const m = t16(i.reduce((s, j) => s + f(data[j]), 0) / 4)
        for (const j of i) data[j] = m
      }
    }
  }
}

/** what askPmrem reaches inside three's PMREMGenerator (engine.test checks a three upgrade still has them) */
export interface PmremInside {
  _setSize(cubeSize: number): void
  _allocateTargets(): THREE.WebGLRenderTarget
  _compileMaterial(m: THREE.Material): void
  _ggxMaterial: THREE.ShaderMaterial | null
}
/**
 * The light map's two programs (an equirect HDRI `width` wide into its cube, then the GGX filter) asked for, never drawn —
 * as fromEquirectangular will draw them, into its half-float target. Drawn on a blank sky (session 31 ready lane), the page
 * stood still 0.4 s while Firefox made the filter's program (session 31 open lane: every tier's start); asked for, it is made
 * while the page builds the flat. A three without these parts: drawn on a blank sky, as before.
 */
export function askPmrem(renderer: THREE.WebGLRenderer, pmrem: THREE.PMREMGenerator, width: number): void {
  const p = pmrem as unknown as PmremInside
  if (typeof p._setSize !== 'function' || typeof p._allocateTargets !== 'function' || typeof p._compileMaterial !== 'function') {
    const blankSky = new THREE.DataTexture(new Uint16Array(width * 4), width, 1, THREE.RGBAFormat, THREE.HalfFloatType) // (one row high: the same programs)
    pmrem.fromEquirectangular(blankSky).dispose()
    return blankSky.dispose()
  }
  p._setSize(width / 4) // (fromEquirectangular's size for an equirect this wide)
  const target = p._allocateTargets()
  const rt = renderer.getRenderTarget()
  renderer.setRenderTarget(target) // a program knows the target it draws into: its colour space and tone mapping
  // and the shape it draws: three's own asks on a shape with no position, another program than the one it draws (r186)
  const shape = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  const cam = new THREE.OrthographicCamera()
  const ask = (m: THREE.Material) => void renderer.compile(new THREE.Mesh(shape, m), cam)
  p._compileMaterial = ask
  pmrem.compileEquirectangularShader()
  Reflect.deleteProperty(p, '_compileMaterial') // (three's own again)
  if (p._ggxMaterial) ask(p._ggxMaterial)
  renderer.setRenderTarget(rt)
  target.dispose()
  shape.dispose()
}

/** The interior HDRI's width (public/assets/hdri/interior.hdr: engine.test reads it from the file) and Lite's 1/k of it (shrinkHdr). */
export const HDRI_WIDTH = 1024
const LITE_HDR_K = 4
/**
 * How tall three makes the light map of an equirect HDRI `width` wide (PMREMGenerator: a cube 2^⌊log2(width / 4)⌋ a side,
 * four of them high) — every lit program is keyed by it. Under the load screen a blank of that kind and size stands in
 * until the HDRI is in (prepare makes the programs meanwhile); a different size only means those are made twice.
 */
export const lightMapHeight = (width: number): number => 4 * 2 ** Math.floor(Math.log2(width / 4))

/**
 * Lite (session 31): the HDRI at 1/k of its width and height (a k × k box mean), so its PMREM is k× smaller — the 1k
 * interior's 256 px cube (≈ 8 MB on the graphics chip) becomes a 64 px one: the room's light is the same, its reflections
 * softer. Half-float RGBA equirect, replaced in place.
 */
export function shrinkHdr(t: THREE.DataTexture, k: number): void {
  const { data, width: w, height: h } = t.image as { data: Uint16Array; width: number; height: number }
  const [W, H] = [Math.floor(w / k), Math.floor(h / k)]
  const out = new Uint16Array(W * H * 4)
  const { fromHalfFloat: f, toHalfFloat: t16 } = THREE.DataUtils
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let c = 0; c < 4; c++) {
        let s = 0
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += f(data[((y * k + j) * w + x * k + i) * 4 + c])
        out[(y * W + x) * 4 + c] = t16(s / (k * k))
      }
  t.image = { data: out, width: W, height: H }
  t.needsUpdate = true
}

/**
 * sky.hdr has the sun baked in: a 2 × 2-texel disc at ~7·10⁴ (half-float stops at 65504) inside a diffraction star
 * whose rays reach ~8°. The dome showed it at one fixed spot whatever the hour, and the window glass (the sky's PMREM)
 * would mirror it as a hot spot. Within 9° of the brightest texel each channel gets a grey-scale opening by a 21-texel
 * disc (min, then max): whatever is thinner than the disc (the sun, the rays) takes the sky around it, the broad glow
 * stays; feathered over the outer 30 %. Everything else, sunlit clouds included, is untouched. A global ceiling can't
 * do it: clouds 12–20° off reach 6, rays 4–8° off 2–4, and a ceiling at the 99.5th percentile (2.0) left the rays and
 * turned those clouds orange at dusk. Half-float RGBA equirect, in place.
 */
export function clampSun(t: THREE.DataTexture): void {
  const { data, width: w, height: h } = t.image as { data: Uint16Array; width: number; height: number }
  const { fromHalfFloat: f, toHalfFloat: t16 } = THREE.DataUtils
  let sun = 0
  for (let i = 0, best = 0; i < w * h; i++) {
    const l = 0.2126 * f(data[4 * i]) + 0.7152 * f(data[4 * i + 1]) + 0.0722 * f(data[4 * i + 2])
    if (l > best) [best, sun] = [l, i]
  }
  const K = 10 // disc radius, texels
  const ry = Math.ceil(h / 20) // 9°; rx: the same angle across at the sun's latitude
  const rx = Math.ceil(ry / Math.max(0.2, Math.cos(Math.PI * (0.5 - (Math.floor(sun / w) + 0.5) / h))))
  // box around the sun: ±(r + 2K), as the max pass reads the min pass K out, which reads K further
  const W = 2 * (rx + 2 * K) + 1
  const H = 2 * (ry + 2 * K) + 1
  const x0 = (sun % w) - rx - 2 * K
  const y0 = Math.floor(sun / w) - ry - 2 * K
  const at = (i: number, j: number) => 4 * (THREE.MathUtils.clamp(y0 + j, 0, h - 1) * w + ((((x0 + i) % w) + w) % w))
  const disc: number[] = []
  for (let dy = -K; dy <= K; dy++) for (let dx = -K; dx <= K; dx++) if (dx * dx + dy * dy <= K * K) disc.push(dy * W + dx)
  for (let c = 0; c < 3; c++) {
    const v = new Float32Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) v[j * W + i] = f(data[at(i, j) + c])
    const ero = v.slice()
    for (let j = K; j < H - K; j++) {
      for (let i = K; i < W - K; i++) {
        let m = Infinity
        for (const o of disc) m = Math.min(m, v[j * W + i + o])
        ero[j * W + i] = m
      }
    }
    for (let j = 2 * K; j < H - 2 * K; j++) {
      for (let i = 2 * K; i < W - 2 * K; i++) {
        const d = Math.hypot((i - rx - 2 * K) / rx, (j - ry - 2 * K) / ry) // 0 at the sun, 1 at 9°
        if (d >= 1) continue
        let m = 0
        for (const o of disc) m = Math.max(m, ero[j * W + i + o])
        const k = j * W + i
        if (m < v[k]) data[at(i, j) + c] = t16(m + (v[k] - m) * THREE.MathUtils.smoothstep(d, 0.7, 1))
      }
    }
  }
}

/**
 * Two units of one drawing — a flat on two floors of its tower (data/building places the one drawing on every floor it stands
 * on): the same walls, rooms, columns, north and site, the same objects. A floor given its own walls (an opening kept for
 * that floor only) is another drawing; one with the architect's outside shape never counts (the shape stands per floor).
 */
export const sameDrawing = (a: Unit, b: Unit): boolean =>
  a.vertices === b.vertices && a.walls === b.walls && a.pillars === b.pillars && a.roomLabels === b.roomLabels && a.northDeg === b.northDeg && a.site === b.site && !a.shell && !b.shell

/**
 * A flat built from `from` (its unit, its stairs down) and furnished with `layout` serves `unit` with `down` as it stands: the
 * same drawing, the same stairs down, the same furniture — re-placed for another floor of it (arrive's again) or shown again
 * when it was kept (back). Its slab above is checked apart (the rooms it covers, or the slab itself).
 */
export const servesFloor = (from: { unit: Unit; down: string }, layout: FurniturePlacement[], unit: Unit, down: string): boolean =>
  sameDrawing(from.unit, unit) && from.down === down && JSON.stringify(unit.furniture) === JSON.stringify(layout)

/**
 * The flats a page holds after a stair from one drawing to another (session 31 open lane): the one on screen and the one it
 * left (`left`; null: not whole, or another floor of the same drawing), the one kept before let go — unless that one was just
 * shown again (`restored`: it is the one on screen now). Two at most, the older dropped.
 */
export function afterTrip<T>(kept: T | null, left: T | null, restored: boolean): { keep: T | null; free: T | null } {
  if (!left) return { keep: restored ? null : kept, free: null }
  return { keep: left, free: restored ? null : kept }
}

/** Each room under the slab above (by its middle) or not: all the daylight bake reads of `cover` (daylight.ts isCovered, openToSky). */
export const roomsUnder = (rooms: Room[], cover: Pt[][]): string => rooms.map((r) => +cover.some((c) => core.pointInPolygon(r.centroid, c))).join('')

/** Two configurations alike: the same choice for every slot (the viewer hands a new object on every render of a new floor). */
export const sameConfig = (a: Configuration, b: Configuration): boolean => {
  const k = Object.keys(a)
  return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x])
}

const bayNumbers = new Map<string, THREE.MeshStandardMaterial>()
/** A bay number's paint (one canvas per number, shared by every level that has it). */
function bayNumber(text: string): THREE.MeshStandardMaterial {
  let m = bayNumbers.get(text)
  if (m) return m
  const c = document.createElement('canvas')
  ;[c.width, c.height] = [256, 128]
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.font = `bold ${text.length > 3 ? 72 : 96}px Arial, Helvetica, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 68)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  m = new THREE.MeshStandardMaterial({ color: '#e9e7e1', map, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  bayNumbers.set(text, m)
  return m
}

/** A flat of another drawing kept whole and hidden after a stair left it (PlotlineScene.kept, afterTrip): its parts and everything built with them. */
interface KeptFlat {
  from: { unit: Unit; cover: Pt[][]; down: string }
  layout: FurniturePlacement[]
  cfg: Configuration
  /** the building's outside it was dressed in (Outside.sig) */
  outSig: string
  /** its static, ceiling and furniture groups' children, each in a group of its own, in that order (arrive's `leaving`) */
  parts: THREE.Group
  shell: THREE.Group | null
  unit: Unit
  rooms: Room[]
  stairs: FurniturePlacement[]
  wells: (Well & { stair: FurniturePlacement })[]
  lifts: Map<Id, WallLift>
  solid: Pick<Unit, 'vertices' | 'walls'>
  top: number
  floors: THREE.Mesh[]
  surfaces: Surface[]
  wallFrames: Map<Id, { origin: Pt; dir: Pt; normal: Pt; lengthM: number }>
  center: THREE.Vector3
  radius: number
  days: Map<string, Daylight>
  dayKeep: Map<string, BakeKeep>
  day: Daylight | null
  look: LookKept
}

interface Surface {
  mesh: THREE.Mesh
  /** one entry per material slot; null = fixed edge plaster; `edge` = the finish in its depth-offset variant (wall ends and tops) */
  /** `ref`: a fixed material by rule (a kerb's concrete, a zone's riser), not the room's finish */
  /** `wallId`: a wall's side — the wall its face is chosen by (finishes.ts faceWallId), for a buyer's one-wall choice */
  /** `outer`: a side outside (toward no room, a balcony or an outdoor zone) — the wall run its outside finish is chosen by (finishes.ts outerRuns) */
  /** `cap`: an edge of the building (a low wall's cap, a ground column): it wears the building's Edges and caps (finishes.ts Outside.edge) */
  sides: ({ roomId: Id | null; target: FinishSlot['target']; edge?: true; ref?: MaterialRef; wallId?: Id; outer?: Id; cap?: true } | null)[]
}

export class PlotlineScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  /** holds the camera; in XR the headset pose is applied relative to this */
  private readonly rig = new THREE.Group()
  private readonly sun = new THREE.DirectionalLight('#ffffff', 3)
  private readonly staticGroup = new THREE.Group()
  private readonly ceilingGroup = new THREE.Group()
  private readonly furnitureGroup = new THREE.Group()
  private readonly floors: THREE.Mesh[] = []
  private readonly surfaces: Surface[] = []
  private readonly wallFrames = new Map<Id, { origin: Pt; dir: Pt; normal: Pt; lengthM: number }>()

  private readonly look: Look
  private readonly orbit: OrbitControls
  private readonly plc: PointerLockControls
  private readonly ro: ResizeObserver
  private readonly keys = new Set<string>()
  private readonly timer = new THREE.Timer()
  private readonly raycaster = new THREE.Raycaster()

  private disposed = false
  private readonly tier: Quality
  /** Lite's share of its pixel budget (render.ts pixelRatioFor): halved when still slow (lighter) */
  private budget = 1
  /** what changed since the groups were last batched (rebatch), and the timer that batches them once it settles */
  private readonly unsettled = new Set<'static' | 'furniture'>()
  private batchTimer = 0
  /** Lite / Low draw until then (performance.now) or while the camera moves; input, a load or a change pushes it on */
  private wakeUntil = 0
  /** Lite / Low with nothing to draw: the frame loop is off (no callback every frame at all) until wake() */
  private sleeping = false
  private lastPose = NaN
  private drewLast = false
  /** frame times (ms), from WARM_MS after the furniture loaded (render.ts slowFrames); null once judged */
  private frameMs: number[] | null = []
  /** when the unit's furniture finished loading (performance.now; 0: not yet) */
  private loadedAt = 0
  private slowCb: (() => void) | null = null
  private failCb: ((why: GpuFailure) => void) | null = null
  private lostTimer = 0
  private nextErrorCheck = 0
  private unit: Unit | null = null
  private rooms: Room[] = []
  private cfg: Configuration = {}
  /** the building's outside as staff chose it (setOutside; furnish/finishes.ts outsideOf): its outer faces, frames and tower */
  private outside: Outside = outsideOf({})
  private ready = false
  private buildToken = 0
  private mode: SceneMode = 'walk'
  private hour = 13
  /** the flat's lamps: auto (on after sunset) or the person's pick (render.ts lightsOn) */
  private lightsMode: LightsMode = 'auto'
  /** the day the sun is drawn for (YYYY-MM-DD): today until the view picks another */
  private date = new Date().toLocaleDateString('en-CA')
  /** the wind arrows (null: off) and the month they show */
  private wind: WindFlow | null = null
  private windMonth: core.WindMonth | null = null
  private windSeason: core.Season = 'monsoon'
  private walker: Pt = { x: 0, y: 0 }
  /** the floor under the walker, eased toward walkLevel(walker): a step is climbed like a stair, not a jump */
  private floorY = 0
  /** the layout's stairs (furnish/stairs.ts): their treads carry the walker; their flight B is the way to the next floor */
  private stairs: FurniturePlacement[] = []
  private stairCb: ((dir: 'up' | 'down', stair: FurniturePlacement) => boolean) | null = null
  /** the last time the walker was turned back at a flight with no floor that way (asked at most once a second) */
  private stairAsked = 0
  /** the storey's top (details.ts storeyTop): the slab above, where a covered storey wall reaches */
  private top = 3.048
  /** the storey's ceiling (details.ts storeyCeiling): where the Dollhouse cuts the outside shape */
  private ceiling = 3.048
  /** each wall's floors (details.ts wallLift) */
  private lifts = new Map<Id, WallLift>()
  /** the walls that stop the walker (not the flush lines and kerbs): what a blocked step slides along */
  private solid: Pick<Unit, 'vertices' | 'walls'> = { vertices: [], walls: [] }
  private yaw = 0
  private moveTarget: Pt | null = null
  private center = new THREE.Vector3()
  private radius = 10
  /** a click's hit; true back: the click was used (a pin, a finish) and the walker does not walk there */
  private pickCb: ((hit: PickHit | null) => boolean | void) | null = null
  private pointerDown: { x: number; y: number; t: number } | null = null
  /** the last press was a finger or a pen (then no pointer lock: one finger looks, a tap walks); before any press, a phone's screen */
  private finger = !!globalThis.matchMedia?.('(pointer: coarse)').matches
  /** the fingers on the canvas now; `multi`: this gesture has had two (a pinch, a two-finger drag): no look, no tap */
  private fingers = new Set<number>()
  private multi = false
  /**
   * The flat's own tower round it (building.ts) with its street, built with the unit: in the walk and the Dollhouse the floors
   * its tier draws (frame), in the Building view all of it. Null: a flat of no tower.
   */
  private building: Building | null = null
  /** the tower round the floor a stair left (arrive), shown until the new floor is */
  private leavingTower: Building | null = null
  /** the architect's outside shape round the flat (three/shell.ts), in every mode; the dollhouse cuts it at the storey's top */
  private shell: THREE.Group | null = null
  private readonly shellClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6)
  private flatCb: ((hit: TowerHit | null) => void) | null = null
  /**
   * Building view: what the mouse is over (the storey washed, the card beside it: onTowerHover), worked out once a frame at
   * the latest pointer spot; a finger's first tap names what it touched (armed), a second tap on the same opens it.
   */
  private towerHover: TowerHit | null = null
  private hoverCb: ((h: (TowerHit & { x: number; y: number }) | null) => void) | null = null
  private hoverAt: { x: number; y: number } | null = null
  private armed: TowerHit | null = null
  // Arrange: the mouse stays free; a grab holds the piece (or handle) under the pointer, a look-drag turns the walker
  private arranging = false
  private arrangeCb: ((e: ArrangeEvent) => void) | null = null
  private grab: { id: Id; y: number; off: Pt; moved: boolean; handle?: Handle & { inv: THREE.Matrix4; half: number; plane: THREE.Plane } } | null = null
  private look2: { x: number; y: number } | null = null
  /**
   * The piece in hand (staff; arrange.ts Held): a refused drop, a G pick-up or a library piece. It follows the pointer —
   * the crosshair while the mouse is locked — on the plane at height y (grab offset `off`), also as the camera moves,
   * until a click sends `drop`; the drop's handler lets go (setHand(null)) once the spot fits.
   */
  private hand: { id: Id; y: number; off: Pt } | null = null
  /** the free pointer's last spot (NDC): what G picks up and the hand aims at when the mouse is not locked */
  private pointerNdc: THREE.Vector2 | null = null
  /** the camera the hand was last aimed from (it re-aims when the camera moves) */
  private aimedFrom = ''
  /** the selected piece's box and resize handles, parented to its pivot; its footprint on the floor */
  private readonly selBox = new THREE.Group()
  private readonly selMat = dotMat(SEL)
  private readonly selRim = dotMat('#ffffff')
  private readonly selLine = lineMat(SEL)
  private readonly selHalo = haloMat()
  private readonly selFoot = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: SEL, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }))
  // Edit openings (staff): the mouse stays free as in Arrange; a grab slides the opening along its wall or moves one end
  private editingOpenings = false
  private openingCb: ((e: OpeningEvent) => void) | null = null
  /** `line`: a low wall's grab — the pointer is read where its ray passes closest to this line (its end: the wall's line; its body: across it) */
  private opGrab: { id: Id; wallId: Id; end?: 'a' | 'b' | 'top' | 'sill'; off: number; moved: boolean; line?: { o: THREE.Vector3; d: THREE.Vector3 }; rigid?: boolean } | null = null
  /** the selected opening's outline and its two end dots, in its wall's frame (seen through walls) */
  private readonly opBox = new THREE.Group()
  /** the outer wall Finishes' outside card is open on (Building view): its run outlined on every floor (showWallStack) */
  private readonly stackBox = new THREE.Group()
  /**
   * Where a slab hangs over this unit (plan polygons in the unit's frame, at its storey height): the footprint of the
   * floor above when the unit is a level of a tower (a basement under the ground floor, a ground floor under the flats).
   * Set BEFORE setUnit. Under it an outdoor zone is covered: a soffit, no sky in the daylight, lit by rule. Empty = open sky.
   */
  cover: Pt[][] = []
  /**
   * Where the building stands (data/building streetOf: its walls' box, plot, roads, storeys), in the unit's frame, for the
   * made-up street round it. Set BEFORE setUnit. Null: a flat of no tower — the street goes round its own walls.
   */
  street: Street | null = null
  /**
   * The stairs of this unit that lead down (data/building stairsDown): each gets a hole in its floor with the flight below
   * and the stair core under it drawn, and walking down that flight is the way down. Set BEFORE setUnit. Empty: none.
   */
  down: Id[] = []
  /** under the load screen (until unveil): nothing drawn, its programs made ahead (prepare) */
  private veiled = true
  /** the first flat's programs asked for (build: Look.prewarm) */
  private prewarmed = false
  private prepAt = 0
  /** when a program was last new (prepare), and when the frame was last drawn behind the load screen */
  private grewAt = 0
  private rehearsedAt = -1
  /** the sky's light and reflections in (loadEnvironment): the frame behind the load screen waits for it */
  private envIn = false
  private pmrem: THREE.PMREMGenerator | null = null
  /** a stair being taken (arrive): the next floor builds hidden while the one he leaves (`leaving`) stays drawn; he looks, not walks */
  private holding = false
  private leaving: THREE.Group | null = null
  /** the furniture of the unit last built, all mounted (loadFurniture) */
  private furnished: Promise<void> = Promise.resolve()
  /** what the flat on screen was built from (build): the next floor of its drawing is re-placed, not built again (arrive) */
  private builtFrom: { unit: Unit; cover: Pt[][]; down: string } | null = null
  /**
   * The drawing on screen's daylight, each floor's own (the neighbours shade a lower floor more), under its cover: a floor
   * visited again bakes nothing; per cover, what one bake leaves the next (BakeKeep). Both go when the drawing changes.
   */
  private days = new Map<string, Daylight>()
  private dayKeep = new Map<string, BakeKeep>()
  /** the flat of another drawing shown before this one, kept whole and hidden (KeptFlat); the one a stair is leaving, if whole */
  private kept: KeptFlat | null = null
  private leavingFlat: Omit<KeptFlat, 'look'> | null = null
  /** the holes setUnit opened (down, where the hole lies inside its room's floor), with the stair as it stood then */
  private wells: (Well & { stair: FurniturePlacement })[] = []
  /** the neighbours round the flat (context.ts neighbours), outline + height: the daylight bake and the wind's shelter read them */
  private blocks: { plan: Pt[]; heightM: number }[] = []

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: { quality?: Quality } = {},
  ) {
    this.tier = opts.quality ?? 'high'
    warmStandins() // (the light copies this browser keeps: their keys read before the first model is in)
    const isLite = (lite.on = this.tier === 'lite')
    lean.on = !TIERS[this.tier].extras
    for (const m of [...PANES, PAINT]) samePictures(m) // the glass, the water and the bay paint (made before the tier is known) drawn as every surface is
    if (isLite) litePlain(PAINT, false) // (Lite: the bay paint the flat's plain surfaces' program)
    // high-performance: a two-chip laptop draws on its graphics card, not the chip built into the processor
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLite, powerPreference: 'high-performance' })
    this.renderer.localClippingEnabled = true // the outside shape's dollhouse cut
    // ponytail: three's own upload path halves a bigger picture (WebGLTextures resizeImage: Lite's 1k ones, Low's 2k ones);
    // real smaller files on disk if the decoded originals in memory ever matter
    const cap = TIERS[this.tier].maxTexture
    if (cap) this.renderer.capabilities.maxTextureSize = Math.min(cap, this.renderer.capabilities.maxTextureSize)
    if (isLite) this.renderer.capabilities.getMaxAnisotropy = () => 1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.info.autoReset = false // counted a whole frame at a time (tick): the stats card
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy())

    this.raycaster.layers.enable(HIDDEN) // batched meshes (batch.ts) are picked as before
    this.camera = new THREE.PerspectiveCamera(WALK_FOV, 1, 0.05, 300) // the scene opens walking
    this.camera.position.y = EYE
    this.rig.add(this.camera)
    this.scene.add(this.rig, this.staticGroup, this.ceilingGroup, this.furnitureGroup)

    // tone mapping, shadows, hemisphere, post, exterior: see render.ts
    this.look = new Look(this.renderer, this.scene, this.camera, this.sun, opts.quality ?? 'high')
    this.scene.add(this.sun, this.sun.target)
    const h = lightMapHeight(HDRI_WIDTH / (isLite ? LITE_HDR_K : 1))
    this.scene.environment = Object.assign(new THREE.DataTexture(null, 3 * Math.max(h / 4, 112), h), { mapping: THREE.CubeUVReflectionMapping }) // (never drawn: the frame waits for the HDRI)
    // the light map's own programs made now, while nothing else waits on the graphics chip: made when the HDRI came in, behind
    // the flat's, they held the page still for 2–3 s (the programs of a size are kept: loadEnvironment makes none)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    askPmrem(this.renderer, this.pmrem, HDRI_WIDTH / (isLite ? LITE_HDR_K : 1))
    void this.loadEnvironment()
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    for (const e of WAKE) window.addEventListener(e, this.wake, { passive: true })
    window.addEventListener('pointerdown', this.notePointer, { capture: true, passive: true })
    THREE.DefaultLoadingManager.onProgress = this.loaded // a texture, model or sky arrived (every loader here uses the default manager)
    this.wake()

    // no domElement: the orbit listeners are attached only while in orbit mode (setMode), so a click that
    // reaches the canvas in walk mode never hits OrbitControls' setPointerCapture
    this.orbit = new OrbitControls(this.camera, null)
    this.orbit.enableDamping = true
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.05
    this.plc = new PointerLockControls(this.camera, canvas)
    this.setMode('walk')

    this.selFoot.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3))
    this.selFoot.geometry.setIndex([0, 1, 2, 0, 2, 3])
    this.selFoot.frustumCulled = false
    this.selFoot.visible = false
    this.scene.add(this.selFoot, this.opBox, this.stackBox)

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('dblclick', this.onDblClick)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.renderer.setAnimationLoop(this.tick)
  }

  // ───────────────────────────── public API ─────────────────────────────

  /**
   * Rebuilds all static geometry (walls, openings, floors, ceilings) and reloads furniture. `keepView` (an opening edited
   * in 3D): the camera stays, and the furniture — unchanged — keeps its built objects (reloading them blinked every piece
   * out for ~150 ms on top of the 190–300 ms rebuild, measured 2026-10-04 on type-a and the founder's draft).
   */
  setUnit(unit: Unit, keepView = false): void {
    this.holding = false // a stair's floor not shown yet: this unit came first
    this.drop()
    const steps = this.build(unit, keepView)
    while (!steps.next().done); // all at once (a floor reached by the stair: a step a frame, arrive)
  }

  /** setUnit's work in steps a stair's floor takes a frame apart (arrive): walls and rooms · the daylight bake · its maps and finishes · the slab, lights and street · the furniture. */
  private *build(unit: Unit, keepView: boolean): Generator<void> {
    this.wake()
    if (!this.builtFrom || !sameDrawing(this.builtFrom.unit, unit)) (this.days = new Map()), (this.dayKeep = new Map()) // (a kept flat keeps the old)
    this.asked = new WeakMap() // (its lamps: every program's)
    this.builtFrom = { unit, cover: this.cover, down: this.down.join() }
    unit = onStorey(unit) // a project whose set prints its storeys: its full walls as tall as this floor's (its ceiling there)
    unit = raiseHeads(unit) // a window on a 1.1 m wall: the wall reaches the storey, as the bake, the curtains and the ceiling see it
    unit = closeGaps(unit) // two wall ends in line with a gap: a cased opening on a stand-in wall (same rooms)
    // the page's first flat: its programs asked for now, made while it is built and its models come in (Look.prewarm) — the
    // sun's wide shadow counted as it will be (on round a flat in its tower). Not in the constructor: a scene let go at once
    // (React mounts the viewer twice in development) held the next one up 2.5 s with its own
    if (!this.prewarmed) (this.prewarmed = true), this.look.prewarm(standIns(lite.on), this.street !== null)
    // its models on their way while it is built (0.85 s on Lite; loadFurniture asked for them only after)
    if (!keepView) void preloadModels(unit.furniture)
    this.ready = false
    const kept = keepView ? [this.furnitureGroup, this.ceilingGroup].flatMap((g) => g.children.filter((o) => o.userData.kind === 'furniture').map((o) => [g, o] as const)) : []
    for (const [, o] of kept) o.removeFromParent() // out of clearStatic's reach
    const tower = keepView ? this.building : null // an opening edited: the same building round it (out of clearStatic's reach)
    this.building = null
    this.clearStatic()
    this.unit = unit
    this.rooms = core.deriveRooms(unit)
    this.stairs = unit.furniture.filter(isStair)
    // a stair that leads down: a hole in its room's floor, the stair's footprint out to the walls beside it (inside the
    // room's floor, else no hole: the step under flight B takes him down as before)
    this.wells = this.stairs.flatMap((s) => {
      const room = this.rooms.find((r) => r.id === s.roomId)
      const poly = room && stairHole(s, core.roomInnerPolygon(room, unit))
      if (!room || !poly || !this.down.includes(s.id) || !poly.every((p) => core.pointInPolygon(p, core.roomPolygon(room, unit)))) return []
      return [{ id: s.id, roomId: room.id, poly, bottom: this.floorOf(s) - STAIR_RISE, stair: s }]
    })
    const b = core.unitBounds(unit)
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2)
    this.radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 1
    const street = this.street ?? { walls: b }
    this.blocks = neighbours(unit, street)

    this.lifts = new Map(unit.walls.map((w) => [w.id, wallLift(w, unit, this.rooms)]))
    this.solid = { vertices: unit.vertices, walls: unit.walls.filter((w) => w.heightM > KERB_M) }
    this.top = storeyTop(unit, this.rooms) || 3.048
    this.ceiling = storeyCeiling(unit, this.rooms) || this.top
    if (unit.shell) void this.showShell(unit.shell, this.buildToken)
    for (const wall of unit.walls) this.buildWall(wall, unit)
    for (const room of this.rooms) this.buildRoom(room, unit)
    this.buildMarkings(unit)
    // skirting follows the built wall feet (details.ts skirtingRuns), one mesh per room in its floor finish, on its floor
    for (const [roomId, mesh] of buildSkirtings(unit, this.rooms, this.wells.map((w) => w.poly))) {
      const r = this.rooms.find((x) => x.id === roomId)!
      mesh.position.y = core.roomLevelAt(r, unit, r.centroid.x, r.centroid.y)
      this.staticGroup.add(mesh)
      this.surfaces.push({ mesh, sides: [{ roomId, target: 'floor' }] })
    }
    // a step between two faces at different levels along a flush line: its riser, in the upper face's floor
    for (const { room, geo } of stepFaces(unit, this.rooms)) {
      const mesh = new THREE.Mesh(geo)
      mesh.receiveShadow = true
      this.staticGroup.add(mesh)
      this.surfaces.push({ mesh, sides: [{ roomId: room.id, target: 'floor', ...(core.isOutdoor(room.kind) ? { ref: CONCRETE } : {}) }] }) // a zone's edge: concrete
    }
    yield
    // indirect light × where the sky reaches (daylight.ts)
    const day = yield* this.bake(unit)
    yield
    for (const s of this.surfaces) {
      const kind = s.mesh.userData.kind as 'wall' | 'floor' | 'ceiling' | undefined // skirting has none: it follows its floor
      mapDaylight(day, s.mesh.geometry, unit, kind ?? 'floor', kind ? s.mesh.userData.id : s.sides[0]!.roomId!)
      // the bake reads a wall on 0; then it stands on its floors (details.ts liftWall)
      const w = kind === 'wall' ? unit.walls.find((x) => x.id === s.mesh.userData.id) : undefined
      if (w) {
        const top = this.slabOver(w)
        liftWall(s.mesh.geometry, liftedWall(w, unit, this.lifts.get(w.id)!, top), unit, this.lifts.get(w.id)!, top)
      }
    }
    const storey = this.top
    for (const p of unit.pillars ?? []) this.buildPillar(p, unit, day, storey) // after the loop: each part maps its own daylight
    for (const w of this.wells) this.buildWell(w, unit, day) // the same
    if (!this.holding) setDaylight(day) // (a stair's floor: shown with it — the floor still on screen keeps its own)
    this.day = day
    for (const w of this.wells) this.buildFlightBelow(w.stair, w.bottom)
    this.applyMaterials()
    yield
    // the rest of the building round it, a floor a step, its street the street (a stair's floor: shown with it, arrive)
    this.building = tower ?? Building.for(unit, this.tier, this.outside)
    let flatIn = (): void => {}
    if (this.building && !tower) {
      // a page's first floor: its tower's other flats' rooms and its grounds' pieces come once this flat's furniture is in —
      // built alongside (8 ms a frame for ~8 s on Sheltech) they held its models' loading back, and the load screen with it
      if (!this.holding) this.building.after(new Promise<void>((ok) => (flatIn = ok)))
      // nothing drawn under the start screen: its rooms and trees in larger steps — its frames are ~50 ms there while Firefox
      // makes the flat's programs, and the grounds' pieces waited 9 of them (0.45 s on Sheltech A; session 31 open lane)
      if (this.veiled) (this.building.budgetMs = 100), (this.building.unseen = true)
      this.building.onChange = this.wake // a flat's rooms or furniture in: a sleeping frame loop (Low, Lite) draws it
      this.building.visible = false
      this.scene.add(this.building)
      yield* this.building.make()
    }
    yield
    this.look.setUnit(present(unit), this.rooms, this.cover, this.building ? null : street, this.wells, this.holding) // fixtures, lights, slab, shadow fit box, the street
    this.dressSlab()
    if (!this.holding) this.aroundFlat() // (a stair's floor: as it shows, spawnAt)
    this.setTimeOfDay(this.hour)
    if (this.windMonth && !this.holding) this.setWind(this.windMonth) // an opening edited: the arrows go through it as it is now

    this.ready = true
    this.rebatch('static')
    if (keepView) {
      for (const [g, o] of kept) {
        g.add(o)
        this.readDaylight(o) // the new bake's atlas
      }
      this.rebatch('furniture')
      return
    }
    if (this.holding) {
      this.staticGroup.visible = this.ceilingGroup.visible = this.furnitureGroup.visible = false // until arrive shows them
      this.furnished = this.loadFurniture(unit)
      return
    }
    const first = this.rooms[0]
    this.walker = first ? { ...first.centroid } : { x: this.center.x, y: this.center.z }
    this.floorY = this.walkLevel(this.walker)
    this.moveTarget = null
    this.stairAsked = 0 // a floor reached by the stair (the same scene): its own stair can be taken again
    this.setMode(this.mode)
    this.furnished = this.loadFurniture(unit)
    void this.furnished.finally(flatIn)
  }

  /**
   * A floor reached by the stair (ViewerApp travel) with no freeze on a first visit (session 31): built hidden while the
   * floor he leaves stays on screen and he can look round, its furniture mounted and batched, then made ready to draw a
   * little a frame (warm), then shown in one frame with him at `at`, facing `yaw`, in `mode` (a flat picked in the
   * Building view: its Dollhouse; Back to the tower: the Building view). Resolves once shown, or once another unit came first.
   */
  async arrive(unit: Unit, at: Pt, yaw: number, mode: SceneMode = 'walk'): Promise<void> {
    this.drop()
    // the next floor of the drawing on screen, furnished alike (a stair between typical floors, another floor of it picked on
    // its tower): its walls, rooms, furniture and lamps stay as built and batched — only its daylight and the tower round it
    // are made (replace). Session 31: a typical floor's own build was ~1 s of a 1.8 s trip
    const from = this.builtFrom
    const settled = this.ready && !this.adding.size && !this.arranging && !this.hand
    const again = settled && !!from && servesFloor(from, this.layout, unit, this.down.join()) && this.coverPrint(from.cover) === this.coverPrint(this.cover)
    const whole = settled && !this.holding // the flat on screen as built, no other floor coming in: a stair may keep it
    // the last other drawing's flat, kept (rooftop → floor 6, Level 1 → floor 2): shown again as it was, under the same slab
    const back = !again && whole && !!this.kept && servesFloor(this.kept.from, this.kept.layout, unit, this.down.join()) && JSON.stringify(this.kept.from.cover) === JSON.stringify(this.cover)
    if (!again) {
      const g = (this.leaving = new THREE.Group())
      for (const x of [this.staticGroup, this.ceilingGroup, this.furnitureGroup]) g.add(Object.assign(new THREE.Group().add(...x.children), { visible: x.visible }))
      this.leavingFlat = whole && this.builtFrom ? this.flatNow(g) : null
      // the next floor is built into these: hidden from its first wall on (drop shows them) — drawn meanwhile in the old
      // floor's daylight, its walls flashed white over the floor he leaves (session 31 QA3)
      this.staticGroup.visible = this.ceilingGroup.visible = this.furnitureGroup.visible = false
      if (this.shell) g.add(this.shell)
      this.shell = null
      this.scene.add(g)
    }
    this.leavingTower = this.building // stays round the floor he leaves until the new one shows, as it is
    this.leavingTower?.halt()
    this.building = null
    this.holding = true
    this.walker = { ...at } // the furniture nearest him first; his eye stays where it is until the floor shows (tick)
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    const token = ++this.buildToken // (a unit given meanwhile wins: clearStatic counts on)
    await frame() // the page's own work for the new floor (its rooms, its HUD) in a frame of its own
    if (token !== this.buildToken) return
    const steps = again ? this.replace(unit) : back ? this.restore(unit) : this.build(unit, false)
    steps.next()
    const built = this.buildToken
    // the rest ~30 ms a frame (the daylight bake pauses after each surface it lights)
    for (let done = false; !done && built === this.buildToken; ) {
      await frame()
      const t = performance.now()
      while (!(done = !!steps.next().done) && performance.now() - t < 30);
    }
    if (again || back) {
      // (its finishes changed meanwhile — a floor kept in another colour: the groups unbatched for it batched again; a kept
      // flat's hidden, so shown for it: batch.ts reads only what is visible)
      clearTimeout(this.batchTimer)
      const batchSeen = (x: THREE.Group, cell: number) => {
        const v = x.visible
        x.visible = true
        batch(x, cell)
        x.visible = v
      }
      if (this.unsettled.has('static')) batchSeen(this.staticGroup, Infinity)
      if (this.unsettled.size) for (const x of [this.furnitureGroup, this.ceilingGroup]) batchSeen(x, TIERS[this.tier].cell)
    } else {
      await this.furnished
      // and every picture and scan its rooms and pieces asked for: it shows whole (15 s at most, as takeStair's models)
      await Promise.race([Promise.allSettled([...loading]), new Promise((r) => setTimeout(r, 15_000))])
      // batched now as it will be drawn, a group a frame (batch.ts reads only what is visible)
      clearTimeout(this.batchTimer)
      for (const x of [this.staticGroup, this.furnitureGroup, this.ceilingGroup]) {
        if (built !== this.buildToken) return
        x.visible = true
        batch(x, x === this.staticGroup ? Infinity : TIERS[this.tier].cell)
        x.visible = false
        await frame()
      }
    }
    this.unsettled.clear()
    await (this.building as Building | null)?.ready() // its other flats' rooms and its grounds' pieces in before it shows (warm sends them too)
    if (built !== this.buildToken) return
    await this.warm(built, again || back ? [this.look.unitGroup] : [this.staticGroup, this.ceilingGroup, this.furnitureGroup, this.look.unitGroup]) // (re-placed or kept: the flat was drawn before)
    if (built !== this.buildToken) return
    this.holding = false
    this.drop(this.look.swap(!!this.leavingFlat), back) // the floor he leaves: kept whole if it was (another drawing), else freed
    setDaylight(this.day)
    if (this.windMonth) this.setWind(this.windMonth)
    this.stairAsked = 0 // its own stair can be taken again
    this.spawnAt(at, yaw)
    if (mode !== 'walk') this.setMode(mode)
  }

  /**
   * arrive's work for the next floor of the drawing on screen (sameDrawing, furnished alike): the flat's walls, rooms, furniture
   * and lamps stay as they were built and batched; its daylight (each floor its own: bake) and the tower round it are new.
   */
  private *replace(unit: Unit): Generator<void> {
    this.wake()
    this.unit = closeGaps(raiseHeads(onStorey(unit))) // (as build: its floor is what changed)
    if (this.outside.sig) (this.applyMaterials(), this.rebatch('static')) // (its outside may differ floor by floor: a plinth band)
    this.blocks = neighbours(this.unit, this.street ?? { walls: core.unitBounds(this.unit) })
    this.day = yield* this.bake(this.unit)
    yield
    this.building = Building.for(this.unit, this.tier, this.outside)
    if (this.building) {
      this.building.onChange = this.wake
      this.building.visible = false
      this.scene.add(this.building)
      yield* this.building.make()
    }
    yield
    // under another slab (the top floor under the roof): its own roof, soffits and lights over it (Look; the walls and rooms
    // are built alike: coverPrint)
    if (JSON.stringify(this.cover) !== JSON.stringify(this.builtFrom!.cover)) {
      this.look.setUnit(present(this.unit), this.rooms, this.cover, this.building ? null : (this.street ?? { walls: core.unitBounds(this.unit) }), this.wells, true)
      this.builtFrom = { ...this.builtFrom!, cover: this.cover }
      this.dressSlab()
    }
    this.setTimeOfDay(this.hour) // the new tower lit for the hour (the sun stays fitted to the one on screen)
  }

  /** `unit`'s daylight (daylight.ts): kept for the drawing on screen per floor and the rooms under the slab above (days), else baked a region a step. */
  private *bake(unit: Unit): Generator<void, Daylight> {
    const cover = roomsUnder(this.rooms, this.cover) // (all the bake reads of the slab above)
    const key = `${unit.floor}|${cover}`
    const kept = this.days.get(key)
    if (kept) return kept
    const keep = this.dayKeep.get(cover) ?? this.dayKeep.set(cover, {}).get(cover)!
    const day = yield* bakeSteps(unit, this.rooms, this.cover, this.blocks, keep)
    this.days.set(key, day)
    return day
  }

  /** the tower on screen: while a floor gets ready (arrive), the one round the floor still shown */
  private get shown(): Building | null {
    return this.holding ? this.leavingTower : this.building
  }

  /**
   * The floor arrive() built, ready to draw before it shows: every program its meshes need (its lights, the target it is
   * drawn into) compiled and linked, its pictures uploaded — a little a frame, the floor he leaves drawn in between.
   * Firefox has no parallel shader compiling: a program is 0.2–0.5 s of the graphics process (GTX 980), so one a frame at
   * most — the 15–27 new ones all in the first frame were the 3–6 s freeze. A see-through two-sided material is two programs
   * (three draws its back faces, then its front): one side a frame. Nothing new (a floor like the last): one frame.
   */
  private async warm(token: number, groups: THREE.Object3D[]): Promise<void> {
    const twoPass = (m: THREE.Material) => m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass
    const todo: { o: THREE.Mesh; side?: THREE.Side }[] = []
    for (const g of [...groups, ...(this.building ? [this.building] : [])]) // (the tower: its street's facades too)
      g.traverse((o) => {
        const m = (o as THREE.Mesh).material
        if (!m || !o.layers.test(this.camera.layers)) return
        if ([m].flat().some(twoPass)) todo.push({ o: o as THREE.Mesh, side: THREE.BackSide }, { o: o as THREE.Mesh, side: THREE.FrontSide })
        else todo.push({ o: o as THREE.Mesh })
      })
    const programs = this.renderer.info.programs ?? []
    const sent = new Set<THREE.Texture>()
    for (let i = 0; i < todo.length; ) {
      const [t0, n0] = [performance.now(), programs.length]
      while (i < todo.length && programs.length === n0 && performance.now() - t0 < 30) {
        const { o, side } = todo[i++]
        const flip = side === undefined ? [] : [o.material].flat().filter(twoPass)
        for (const m of flip) (m.side = side!), (m.needsUpdate = true)
        this.look.compile(o)
        for (const m of flip) (m.side = THREE.DoubleSide), (m.needsUpdate = true)
        for (const m of [o.material].flat()) for (const v of Object.values(m)) if (v instanceof THREE.Texture && !sent.has(v)) (sent.add(v), this.renderer.initTexture(v))
      }
      for (const p of programs.slice(n0)) p.getUniforms() // linked in this frame, never in the first one it is drawn in
      await new Promise((r) => requestAnimationFrame(r))
      if (token !== this.buildToken) return
    }
    // the tower's buffers too: a first draw sent a traced level's whole geometry at once (Sheltech, High: a 0.7–1.3 s swap
    // frame). Each part drawn once, plain, into one pixel, a slice a frame
    const b = this.building
    if (!b) return
    const one = (this.onePixel ??= { rt: new THREE.WebGLRenderTarget(1, 1), scene: new THREE.Scene(), cam: new THREE.OrthographicCamera(-1e4, 1e4, 1e4, -1e4, -1e4, 1e4) })
    one.scene.overrideMaterial ??= new THREE.MeshBasicMaterial()
    const rt = this.renderer.getRenderTarget()
    for (const parts = [...b.children]; parts.length; ) {
      const t0 = performance.now()
      while (parts.length && performance.now() - t0 < 30) {
        const c = parts.pop()!
        one.scene.add(c)
        this.renderer.setRenderTarget(one.rt)
        this.renderer.render(one.scene, one.cam)
        b.add(c)
      }
      this.renderer.setRenderTarget(rt)
      await new Promise((r) => requestAnimationFrame(r))
      if (token !== this.buildToken) return
    }
  }
  /** warm's one-pixel target: what draws a part once so its buffers are on the graphics chip before it shows */
  private onePixel: { rt: THREE.WebGLRenderTarget; scene: THREE.Scene; cam: THREE.OrthographicCamera } | null = null

  /** The floor a stair left (arrive), if still on screen: gone, its geometry freed but for what the floor shown now shares (a piece's model). */
  private drop(look: LookKept | null = null, restored = false): void {
    this.leavingTower?.dispose()
    this.leavingTower = null
    const g = this.leaving
    const left = this.leavingFlat && look ? { ...this.leavingFlat, look } : null
    this.leavingFlat = null
    if (!g) return
    this.leaving = null
    g.removeFromParent()
    // two flats at most: the one shown and the last other drawing's (afterTrip)
    const { keep, free } = afterTrip(this.kept, left, restored)
    this.kept = keep
    if (free) this.free(free)
    if (!left) this.freeParts(g)
    this.staticGroup.visible = this.furnitureGroup.visible = true
    this.ceilingGroup.visible = this.mode === 'walk'
    if (this.shell) this.shell.visible = true
  }

  /** The flat on screen as it is (its parts moved into `parts` by arrive): what a stair back to its drawing shows again (restore). */
  private flatNow(parts: THREE.Group): Omit<KeptFlat, 'look'> {
    return {
      from: this.builtFrom!, layout: this.layout, cfg: this.cfg, outSig: this.outside.sig, parts, shell: this.shell, unit: this.unit!, rooms: this.rooms, stairs: this.stairs,
      wells: this.wells, lifts: this.lifts, solid: this.solid, top: this.top, floors: [...this.floors], surfaces: [...this.surfaces],
      wallFrames: new Map(this.wallFrames), center: this.center.clone(), radius: this.radius, days: this.days, dayKeep: this.dayKeep, day: this.day,
    }
  }

  /**
   * arrive's work for the kept flat's drawing (session 31 open lane: rooftop → floor 6, Level 1 → floor 2 built the flat in
   * full, 1.4–1.95 s): its parts back, hidden, as they were built and batched, its lamps and slab (Look.restore); then as a
   * stair between floors of one drawing (replace) — its daylight (kept per floor) and the tower round it.
   */
  private *restore(unit: Unit): Generator<void> {
    this.wake()
    const k = this.kept!
    this.kept = null // (on screen soon: afterTrip)
    const [s, c, f] = k.parts.children
    this.staticGroup.add(...s.children)
    this.ceilingGroup.add(...c.children)
    this.furnitureGroup.add(...f.children)
    this.shell = k.shell
    if (k.shell) this.scene.add(Object.assign(k.shell, { visible: false })) // (shown with it: drop)
    ;[this.unit, this.rooms, this.stairs, this.wells, this.lifts, this.solid, this.top, this.radius] = [k.unit, k.rooms, k.stairs, k.wells, k.lifts, k.solid, k.top, k.radius]
    this.floors.splice(0, Infinity, ...k.floors)
    this.surfaces.splice(0, Infinity, ...k.surfaces)
    this.wallFrames.clear()
    for (const [id, w] of k.wallFrames) this.wallFrames.set(id, w)
    this.center.copy(k.center)
    ;[this.days, this.dayKeep, this.day, this.builtFrom, this.layout] = [k.days, k.dayKeep, k.day, k.from, k.layout]
    this.look.restore(k.look)
    this.asked = new WeakMap()
    if (!sameConfig(k.cfg, this.cfg) || k.outSig !== this.outside.sig) (this.applyMaterials(), this.rebatch('static')) // (kept in other finishes than this floor's, or the outside changed since)
    yield
    yield* this.replace(unit)
  }

  /** A kept flat let go: its parts' geometry (but what a flat still held shares), its lamps, slab and street (Look.free). */
  private free(k: KeptFlat): void {
    this.freeParts(k.parts)
    this.look.free(k.look)
  }

  /** `g`'s geometry freed, but for what the flat shown or the one kept shares with it (a piece's model, cloned per piece). */
  private freeParts(g: THREE.Object3D): void {
    const held = new Set<THREE.BufferGeometry>()
    for (const x of [this.staticGroup, this.ceilingGroup, this.furnitureGroup, this.kept?.parts]) x?.traverse((o) => void ((o as THREE.Mesh).geometry && held.add((o as THREE.Mesh).geometry)))
    g.traverse((o) => {
      const geo = (o as THREE.Mesh).geometry
      if (geo && !held.has(geo)) geo.dispose()
    })
  }

  /** slotId (or a room / wall-face key, finishes.ts roomKey / wallKey) → optionId. Swaps materials only. */
  setConfiguration(cfg: Configuration): void {
    // the same choices (a new floor's render hands a new object): nothing to swap, and the batches stay (a stair's floor
    // re-placed keeps them: arrive)
    if (sameConfig(cfg, this.cfg)) return
    this.wake()
    this.cfg = cfg
    this.applyMaterials()
    this.rebatch('static')
  }

  /**
   * The building's outside as staff chose it (furnish/finishes.ts outsideOf; set before setUnit, as `cover`): the flat's outer
   * faces and frames wear it, and the tower round it. A change: the flat's materials swapped, the tower built again round it
   * (its rooms and furniture behind the glass kept: Building.adopt) — a staff click, a few hundred ms.
   */
  setOutside(o: Outside): void {
    const same = o.sig === this.outside.sig
    this.outside = o
    if (same || !this.unit || !this.ready) return
    this.wake()
    this.applyMaterials()
    this.rebatch('static')
    this.dressShell()
    this.retower() // (a floor on its way builds its tower with it)
  }

  /**
   * hour 0..24 on the site's clock, on `date` (YYYY-MM-DD; default: the last one given, at first today): the sun where it
   * stands at the unit's site (core.sunAt; Dhaka without one), by its true north (unit.northDeg).
   */
  setTimeOfDay(hour: number, date = this.date): void {
    this.wake()
    this.hour = hour
    this.date = date
    const { altDeg, azDeg } = core.sunAt(this.unit?.site, date, hour)
    const h = core.bearingInPlan(this.unit?.northDeg ?? 0, azDeg) // plan-up (−y) is world −Z
    const a = THREE.MathUtils.degToRad(Math.max(altDeg, 1)) // under the horizon: dark (below), never lit from beneath
    const dir = new THREE.Vector3(h.x * Math.cos(a), Math.sin(a), h.y * Math.cos(a))
    const alt = altDeg > 0 ? Math.sin(a) : 0
    // far enough out that the shadow box can reach back to a site's blocks (render.ts SITE_REACH_M)
    this.sun.position.copy(this.center).addScaledVector(dir, 2 * this.radius + 30 + SITE_REACH_M)
    this.sun.target.position.copy(this.center)
    // 10: direct sun ≈ 3× the ENV/HEMI fill on a floor. At 5.5 (before wave 6 lifted the fill) a patch added only
    // ≈ 1.8× and Neutral mapped it to a slightly lighter floor, not sun
    this.sun.intensity = 10 * Math.min(1, alt * 3)
    this.sun.color.set('#ff9a4a').lerp(new THREE.Color('#fff7ec'), Math.min(1, alt * 2.5))
    this.look.setAltitude(altDeg)
    this.look.setLights(lightsOn(this.lightsMode, altDeg))
    const sky = skyLight(altDeg)
    const how = [sky.night, sky.exposure, lightsOn(this.lightsMode, altDeg), TIERS[this.tier].ao, this.renderer.shadowMap.enabled] as const
    const b = this.shown
    if (b !== this.building) this.building?.setNight(...how) // a floor getting ready: its tower lit for the hour; the sun stays fitted to the one on screen
    if (this.mode === 'building') b?.setSun(this.sun, ...how)
    else b?.setNight(...how) // round the flat: its panes, rooms and lamps by the hour (Look fits the shadow)
  }

  /** The flat's lamps: auto (on once the sun is under 5°), on or off (render.ts lightsOn). */
  setLightsMode(mode: LightsMode): void {
    this.lightsMode = mode
    this.setTimeOfDay(this.hour)
  }

  /** The month's wind as streamlines through the flat (wind.ts), tinted by its season, or none. */
  setWind(month: core.WindMonth | null, season: core.Season = this.windSeason): void {
    this.wind?.dispose()
    this.windMonth = month
    this.windSeason = season
    this.wind = month && this.unit ? new WindFlow(this.unit, this.rooms, month, SEASON_TINT[season], this.blocks) : null
    if (this.wind) this.scene.add(this.wind)
    this.wake()
  }

  setMode(mode: SceneMode): void {
    this.wake()
    this.asked = new WeakMap() // (its lights and shadows: every program's)
    if (this.mode === 'walk' && mode !== 'walk') {
      this.yaw = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ').y
    }
    const tower = mode === 'building' || this.mode === 'building'
    this.mode = mode
    this.lens = null
    this.camera.fov = mode === 'walk' ? WALK_FOV : VIEW_FOV
    this.camera.updateProjectionMatrix()
    if (mode === 'walk') siteCut.value = 0 // inside the flat: every block stands
    this.cutAbove(false) // a basement shown in the Building view: what stood above it is back
    this.armed = null
    this.setTowerHover(null)
    if (!this.holding) this.ceilingGroup.visible = mode === 'walk'
    this.shellClip.constant = mode === 'orbit' ? this.ceiling + 0.05 : 1e6 // the dollhouse looks in from above: the shape stops at the storey's ceiling (its slab above goes)
    this.orbit.enabled = mode !== 'walk'
    if (mode !== 'walk') this.orbit.connect(this.canvas)
    else if (this.orbit.domElement) this.orbit.disconnect()
    this.aroundFlat()
    this.look.outside = mode === 'building'
    if (tower) this.setTimeOfDay(this.hour) // shadow box: the tower's, or back to the flat's; the lamps' bounce
    if (mode !== 'walk') {
      if (this.plc.isLocked) this.plc.unlock()
      this.rig.position.set(0, 0, 0)
      const b = mode === 'building' ? this.shown : null
      const v = b?.view(b.floor)
      b?.highlight(b.floor)
      this.camera.position.copy(v?.eye ?? this.center.clone().add(new THREE.Vector3(this.radius, this.radius * 1.3, this.radius)))
      this.orbit.target.copy(v?.target ?? this.center)
      // a screen taller than wide (a phone): back off until the flat / the tower fits its width (a wide screen, an iPad upright: as before)
      this.camera.position.sub(this.orbit.target).multiplyScalar(Math.max(1, 0.75 / this.camera.aspect)).add(this.orbit.target)
      this.orbit.update()
    } else {
      this.rig.position.set(this.walker.x, this.floorY, this.walker.y)
      this.camera.position.set(0, EYE, 0)
      this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'))
    }
  }

  /**
   * The tower round the flat in every mode (building.ts frame): the floors the tier draws in the walk and the Dollhouse, all of
   * it in the Building view; its street (a traced ground floor's) in place of the flat's own; Look's shadow catcher, at this
   * flat's slab, would hang in mid-air in it (the floor below takes the shadow).
   */
  private aroundFlat(): void {
    const b = this.shown
    b?.frame(this.mode, this.tier)
    this.look.setStreetY(b?.streetY ?? null)
    const catcher = this.scene.children.find((o) => (o as THREE.Mesh).material instanceof THREE.ShadowMaterial) as THREE.Mesh | undefined
    if (catcher) (catcher.material as THREE.Material).visible = !b
  }

  /** Walker to the room centroid (eye height EYE). Switches to walk mode. */
  teleportTo(roomId: Id): void {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return
    this.walker = { ...room.centroid }
    this.floorY = this.walkLevel(this.walker)
    this.moveTarget = null
    this.setMode('walk')
  }

  /** Walker to plan point p looking along yawRad (0 = plan −y, i.e. world −Z; positive turns left), pitchRad down when < 0. Switches to walk mode. */
  spawnAt(p: Pt, yawRad: number, pitchRad = 0, hfovDeg?: number): void {
    this.walker = { ...p }
    this.floorY = this.walkLevel(p)
    this.yaw = yawRad
    this.moveTarget = null
    this.setMode('walk')
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitchRad, yawRad, 0, 'YXZ'))
    // a narrower lens for this view (a WC under 2 m², spawn.ts TINY_HFOV): that many degrees across a wide screen, never wider
    // than the walk's; eased back to the walk's as he leaves the room (tick)
    this.lens = hfovDeg && this.unit ? { roomId: core.roomAt(p, this.rooms, this.unit)?.id ?? null, hfovDeg } : null
    this.camera.fov = this.lens ? lensFov(this.lens.hfovDeg, this.camera.aspect, WALK_FOV) : WALK_FOV
    this.camera.updateProjectionMatrix()
  }

  /** a view's narrower lens (spawnAt), the room it is for and how wide it is across: walking out of it eases the walk's back; a resize in it keeps it (resize) */
  private lens: { roomId: Id | null; hfovDeg: number } | null = null

  /** Shuts the leaf of door `openingId` (a first frame's `closeLeaf`) and reopens the one shut before; null reopens only. */
  shutLeaf(openingId: Id | null): void {
    this.staticGroup.traverse((o) => {
      const pivot = o.userData.id?.endsWith('/leaf') ? o.parent : null // openings.ts: the leaf part hangs on its hinge pivot
      if (!pivot) return
      pivot.userData.ajar ??= pivot.rotation.y
      pivot.rotation.y = o.userData.id === `${openingId}/leaf` ? 0 : pivot.userData.ajar
    })
    this.rebatch('static')
  }

  /** A click (a tap) on the flat; the callback returns true when it used it (a pin, a finish): a floor click then does not walk. */
  onPick(cb: (hit: PickHit | null) => boolean | void): void {
    this.pickCb = cb
  }

  /** Building view: a click (a finger's second tap) on the tower — the floor, and the flat if it is one; null: anything else. Replaces onPick there. */
  onFlat(cb: (hit: TowerHit | null) => void): void {
    this.flatCb = cb
  }

  /** Building view: the floor (and flat) under the pointer changed, with where the pointer is (client px); null: none. */
  onTowerHover(cb: (h: (TowerHit & { x: number; y: number }) | null) => void): void {
    this.hoverCb = cb
  }

  /** Building view: the floor list's row under the mouse washes its storey on the tower too (null: back to what the mouse is over there, if anything). */
  hoverFloor(k: number | null): void {
    this.shown?.hover(k ?? this.towerHover?.k ?? null)
    this.wake()
  }

  /** What the tower has under client point (x, y), or null. */
  private towerAt(x: number, y: number): TowerHit | null {
    const r = this.canvas.getBoundingClientRect()
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera)
    return this.shown?.pickAt(this.raycaster) ?? null
  }

  /** The hover's wash and card follow h; the card hears every change of floor or flat (with the pointer's spot), nothing else. */
  private setTowerHover(h: TowerHit | null, at?: { x: number; y: number }): void {
    const was = this.towerHover
    this.towerHover = h
    if (h?.k === was?.k && h?.flat?.stem === was?.flat?.stem) return
    this.shown?.hover(h?.k ?? null)
    this.wake()
    this.hoverCb?.(h && at ? { ...h, ...at } : null)
  }

  /** a mouse over the tower: one pick a frame, at the latest spot */
  private queueHover(x: number, y: number): void {
    const queued = this.hoverAt
    this.hoverAt = { x, y }
    if (queued) return
    requestAnimationFrame(() => {
      const p = this.hoverAt
      this.hoverAt = null
      if (p && this.mode === 'building' && !this.disposed) this.setTowerHover(this.towerAt(p.x, p.y), p)
    })
  }

  private onPointerLeave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && this.mode === 'building') {
      this.hoverAt = null
      this.setTowerHover(null)
    }
  }

  /** Frames were slow (render.ts slowFrames), judged once per scene, within ~3 s of the flat's furniture loading (or of the first move on Lite / Low). */
  onSlow(cb: () => void): void {
    this.slowCb = cb
  }

  /** The GPU gave up (GpuFailure). */
  onFail(cb: (why: GpuFailure) => void): void {
    this.failCb = cb
  }

  /** Lite and still slow: half the pixels (render.ts pixelRatioFor's budget). */
  lighter(): void {
    this.budget = 0.5
    this.resize()
  }

  /** Lite / Low: draw for the next WAKE_MS (something changed that the camera does not show); a sleeping frame loop starts again. */
  wake = (): void => {
    this.wakeUntil = performance.now() + WAKE_MS
    if (!this.sleeping || this.disposed) return
    this.sleeping = false
    this.renderer.setAnimationLoop(this.tick)
  }

  /**
   * The building's roof changed (staff, data/building/roof.ts): the tower round the flat made again in place — the flat, the
   * camera and the picked floor as they were (a tower is ~0.1–0.3 s to make; the rooms and furniture behind its glass are the
   * old tower's: Building.adopt). Its outside changed (setOutside) the same way.
   */
  retower(): void {
    const was = this.building
    if (!was || this.holding || !this.unit) return
    const b = Building.for(this.unit, this.tier, this.outside)
    if (!b) return
    b.adopt(was)
    this.wake()
    this.dressShell() // (the roof's covering, on the outside shape too)
    b.onChange = this.wake
    this.building = b
    this.scene.add(b)
    for (const _ of b.make()); // eslint-disable-line @typescript-eslint/no-unused-vars
    was.dispose()
    this.aroundFlat()
    this.setTimeOfDay(this.hour)
    if (this.mode === 'building') b.highlight(was.pickedFloor)
  }

  /** Building view: highlight floor k (0 = ground, top + 1 = roof) and lift the orbit to it. */
  showFloor(k: number): void {
    this.wake()
    const b = this.building
    if (!b || this.mode !== 'building' || this.holding) return // (a floor getting ready: the tower shown stays as it is)
    const dy = b.levelOf(k) + 1.5 - this.orbit.target.y
    this.orbit.target.y += dy
    this.camera.position.y += dy
    b.highlight(k)
    this.cutAbove(b.cuts(k) && k < b.floor, k < 0)
  }

  /** A basement / his traced ground floor picked in the Building view: the furnished flat above it hidden, and under ground the street plane (building.ts hides its own floors above it). */
  private cutAbove(on: boolean, street = on): void {
    if (!this.holding) this.staticGroup.visible = this.furnitureGroup.visible = !on // (a floor getting ready stays hidden: drop shows it)
    this.look.showGround(!street, !on)
  }

  /** when a texture, model or the sky last arrived */
  private lastLoad = 0
  private loaded = () => {
    this.lastLoad = performance.now()
    this.wake()
  }

  /**
   * Under the load screen (session 31 ready lane: drawing the 3D behind it as it came in made every program in the moment it
   * was first drawn — 12 of Sheltech's 18 s on High): nothing drawn; every PREP_MS the programs of everything built so far
   * are asked for (Look.compile, none waited on) — the whole scene, hidden floors and other views' parts too, so the first
   * switch to another view finds them made — and once the flat's furniture, its pictures and plant scans (materials.ts loading)
   * and its grounds' trees and benches are in, the frame is drawn once behind the screen — at once, not at the next round — (the shadow maps' and the corner shading's programs, the pictures and buffers
   * sent): the first frame shown has nothing left to make.
   */
  private prepare(now: number): void {
    if (!this.ready) return // (before the flat is built its lamps are not there: every program would be made again)
    this.sendPictures()
    const built = !!this.loadedAt && (this.building?.piecesIn ?? true)
    if (built) this.envGo() // (the light map once all but the last pictures are in: loadEnvironment)
    const allIn = this.envIn && built && !loading.size
    // everything in and not drawn since a program was new: drawn now, not at the next round (up to PREP_MS later)
    if (now < this.prepAt && !(allIn && this.rehearsedAt <= this.grewAt)) return
    this.prepAt = now + PREP_MS
    // the batches made as soon as what they batch is in, not BATCH_MS / AROUND_MS on (nothing moves under the screen): the
    // flat's once its furniture is, the tower's once its rooms and pieces are — drawn behind the screen, their buffers go to
    // the graphics chip there (made after it, the first frame after Enter sent ~150 of them: 95 ms, session 31 start lane)
    if (this.loadedAt && this.unsettled.size) (clearTimeout(this.batchTimer), this.settle())
    const b = this.building
    if (b?.piecesIn && b.progress.rooms) b.settleNow()
    const n = this.renderer.info.programs?.length ?? 0
    // what has a shape (a plant's leaves before their file is read have none: a program of their own, never drawn), and only
    // what is new or changed since the last round (askedAs): asking three again for every part of the flat and the tower each
    // round held the page ~0.1 s a round (session 31 open lane)
    const parts: THREE.Object3D[] = []
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.geometry?.attributes.position?.count || !mesh.material) return
      const as = askedAs(mesh)
      if (this.asked.get(o) === as) return
      this.asked.set(o, as)
      parts.push(o)
      for (const m of [mesh.material].flat()) for (const v of Object.values(m)) if (v instanceof THREE.Texture) this.unsent.add(v)
    })
    if (parts.length) this.look.compile({ traverse: (f: (o: THREE.Object3D) => void) => parts.forEach(f), traverseVisible: () => {} } as unknown as THREE.Object3D)
    if ((this.renderer.info.programs?.length ?? 0) !== n) this.grewAt = now
    if (!allIn || this.rehearsedAt > this.grewAt) return
    this.sendPictures(Infinity) // (the last few, just in)
    this.building?.settleNow() // (its rooms still coming: what is in, batched for this frame)
    this.renderer.info.reset()
    this.look.render(true)
    this.rehearsedAt = performance.now()
  }

  /** what prepare asked three for, each part as it was then (askedAs); all asked again after a view or a flat changed the lights */
  private asked = new WeakMap<THREE.Object3D, string>()
  /** the pictures of what prepare asked for, not yet on the graphics chip (sendPictures) */
  private readonly unsent = new Set<THREE.Texture>()
  /**
   * Under the load screen, SEND_MS a frame: the pictures of what prepare asked for to the graphics chip as they come in (one
   * still loading waits for its next frame). Sent with the frame behind the screen they were its 0.4–0.75 s on High (Sheltech
   * A: 186 pictures; session 31 open lane), after everything else.
   */
  private sendPictures(ms = SEND_MS): void {
    const t0 = performance.now()
    for (const t of this.unsent) {
      if (performance.now() - t0 > ms) return
      if (!t.version) continue // (its picture not in yet; a drawn target's never: three draws it, it is not sent)
      this.unsent.delete(t)
      this.renderer.initTexture(t)
    }
  }

  /** The load screen may go (ViewerApp): the flat's furniture in, the frame drawn behind it with every program made (prepare). */
  get drawable(): boolean {
    return !this.veiled || this.rehearsedAt > this.grewAt
  }

  /** The load screen went: drawn from now on. */
  unveil(): void {
    this.veiled = false
    this.envGo() // (Enter pressed before it was drawn: the 20 s cap of a stuck download)
    if (this.building) (this.building.budgetMs = 8), (this.building.unseen = false)
    this.wake()
  }

  /** The flat built and nothing arrived for `quietMs` (its furniture and pictures are in), or `maxMs` passed. */
  async settled(quietMs = 1500, maxMs = 60_000): Promise<void> {
    const t0 = performance.now()
    while (performance.now() - t0 < maxMs && !(this.ready && performance.now() - this.lastLoad > quietMs)) await new Promise((r) => setTimeout(r, 250))
  }

  /**
   * The flat as one binary glTF (session 31, staff → Edit → Download 3D model): its walls, floors, ceilings, doors, windows
   * and furniture with their pictures (at most 1024 px: a furnished flat stays near 20 MB), in metres, Y up — not the street, the sky, the sun or what only
   * edits show. For a developer's render artist or another 3D program. Each mesh once: the batches (batch.ts) are a second
   * copy of the meshes they draw, and the exporter does not know the layer that hides the originals (session 31: 106 MB).
   */
  async exportGlb(): Promise<ArrayBuffer> {
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js')
    const ceilings = this.ceilingGroup.visible
    this.ceilingGroup.visible = true // the dollhouse hides them; the model has them
    this.exporting = true // no batch comes back while the exporter walks the groups (settle)
    for (const g of [this.staticGroup, this.ceilingGroup, this.furnitureGroup]) unbatch(g)
    // pictures as JPEG where nothing shows through (PNG for the rest): 133 pictures of a furnished flat, 116 MB → ~20 MB
    const marked: THREE.Texture[] = []
    // a roughness picture with no metalness one: the exporter bakes a new metal-rough picture for every material using it
    // (six copies of one marble's, ~7 MB on type-a); with metalness 0 that picture's blue (metalness) is never read, so the
    // roughness picture goes as it is, once — lent as the metalness map for the export only
    const lent: THREE.MeshStandardMaterial[] = []
    // a blank picture (materials.ts samePictures: it only keeps programs shared) is no picture in the file
    const blanks: [THREE.MeshPhysicalMaterial, (typeof PICTURES)[number] | (typeof MORE_PICTURES)[number], THREE.Texture][] = []
    // and a two-sided solid piece's alpha test that never cuts (samePictures): no alpha test in the file
    const solid: THREE.Material[] = []
    // where each surface and piece reads the daylight atlas (dayUv) means nothing outside Plotline: left out of the file
    const day: [THREE.BufferGeometry, THREE.BufferAttribute][] = []
    for (const g of [this.staticGroup, this.ceilingGroup, this.furnitureGroup])
      g.traverse((o) => {
        const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
        const a = geo?.getAttribute?.('dayUv') as THREE.BufferAttribute | undefined
        if (geo && a) (day.push([geo, a]), geo.deleteAttribute('dayUv'))
        for (const m of [(o as THREE.Mesh).material ?? []].flat() as THREE.Material[]) {
          const st = m as THREE.MeshPhysicalMaterial
          for (const k of [...PICTURES, ...MORE_PICTURES]) if (isBlank(st[k])) (blanks.push([st, k, st[k]!]), (st[k] = null))
          if (m.userData.solid && m.alphaTest === SOLID_CUT) (solid.push(m), (m.alphaTest = 0))
          if (st.roughnessMap && !st.metalnessMap && st.metalness === 0) lent.push(Object.assign(st, { metalnessMap: st.roughnessMap }))
          if (m.transparent || m.alphaTest > 0) continue
          for (const v of Object.values(m)) if (v instanceof THREE.Texture && !v.userData.mimeType && v.image) (v.userData.mimeType = 'image/jpeg'), marked.push(v)
        }
      })
    try {
      const out = await new GLTFExporter().parseAsync([this.staticGroup, this.ceilingGroup, this.furnitureGroup], { binary: true, onlyVisible: true, maxTextureSize: 1024 })
      if (!(out instanceof ArrayBuffer)) throw new Error('the 3D model could not be written')
      return out
    } finally {
      this.ceilingGroup.visible = ceilings
      for (const t of marked) delete t.userData.mimeType
      for (const m of lent) m.metalnessMap = null
      for (const [m, k, t] of blanks) m[k] = t
      for (const m of solid) m.alphaTest = SOLID_CUT
      for (const [geo, a] of day) geo.setAttribute('dayUv', a)
      this.exporting = false
      this.rebatch('static')
      this.rebatch('furniture')
    }
  }
  private exporting = false

  currentRoomId(): Id | null {
    if (!this.ready || !this.unit) return null
    // (asked every frame by the minimap and the room name: answered again only when the walker moved — from Maheer's Plotline 2.0)
    const { x, y } = this.walker, last = this.roomQuery
    if (last && last.token === this.buildToken && last.x === x && last.y === y) return last.id
    const id = core.roomAt(this.walker, this.rooms, this.unit)?.id ?? null
    this.roomQuery = { token: this.buildToken, x, y, id }
    return id
  }
  private roomQuery: { token: number; x: number; y: number; id: Id | null } | null = null

  /** The camera's eye and heading in plan metres (x, y = world x, z): the minimap and the viewer read these, not three.js. */
  viewEye(): Pt {
    const p = this.camera.getWorldPosition(this.viewVector)
    return { x: p.x, y: p.z }
  }
  viewHeading(): Pt {
    const d = this.camera.getWorldDirection(this.viewVector)
    return { x: d.x, y: d.z }
  }
  /** A world point on screen (normalised device coordinates, z < 1 in front): pins and chips. The vector is reused by the next call. */
  projectPoint(p: { x: number; y: number; z: number }): Readonly<{ x: number; y: number; z: number }> {
    return this.viewVector.set(p.x, p.y, p.z).project(this.camera)
  }
  private readonly viewVector = new THREE.Vector3()

  /** Enter pointer lock (mouse look). Must be called from a user gesture; dblclick on the canvas does this too. Never while arranging or editing openings, never under a finger. */
  lockPointer(): void {
    if (this.mode === 'walk' && !this.arranging && !this.editingOpenings && !this.finger) this.plc.lock()
  }

  // ───────────────────────────── arrange (staff) ─────────────────────────────

  /** The mouse stays free (no pointer lock; dragging empty space looks around in walk mode); clicks pick pieces, not floors or pins. */
  setArrange(on: boolean): void {
    this.arranging = on
    if (on && this.plc.isLocked) this.plc.unlock()
    if (!on) {
      this.showSelection(null)
      this.hand = null
    }
    this.rebatch('furniture') // the pieces one by one while they may move; batched again after
  }

  onArrange(cb: (e: ArrangeEvent) => void): void {
    this.arrangeCb = cb
  }

  /**
   * Piece `id` in hand (staff): it follows the pointer — the crosshair while the mouse is locked — as `drag` events on
   * the plane at height `y` (floor 0, ceiling) plus `off`, with the wall under the pointer, never past the wall in view;
   * it is aimed at once and again whenever the camera moves. A click sends `drop` (a drag-look in walk mode just looks).
   * null lets go. Works in Arrange and in plain walk (G).
   */
  setHand(h: { id: Id; y: number; off?: Pt } | null): void {
    this.hand = h && { ...h, off: h.off ?? { x: 0, y: 0 } }
    this.aimedFrom = ''
    if (h && this.finger && !this.plc.isLocked) this.pointerNdc = new THREE.Vector2(0, 0) // a finger has no pointer to follow: a new piece starts mid-view
    this.rebatch('furniture')
    if (!h && this.grab && !this.grab.handle) this.grab = null // Esc mid-drag: the button's release must not pick it up again
    if (this.hand) this.aimHand() // (also the Building view: a library piece onto the flat's outside, session 31)
  }

  /** The piece under the crosshair (mouse locked) or the pointer, as G picks it up; null: none, or something nearer hides it. */
  pieceUnderPointer(): Id | null {
    const hit = this.pick(this.aimNdc(), true)
    const o = hit?.kind === 'furniture' ? this.pieceObject(hit.id.split('/')[0]) : undefined // a part → its piece
    return (o?.userData.id as Id | undefined) ?? null
  }

  private aimNdc(): THREE.Vector2 {
    return this.plc.isLocked || !this.pointerNdc ? new THREE.Vector2(0, 0) : this.pointerNdc
  }

  /** The hand to where the crosshair / pointer meets its plane (or the wall in front): a `drag` event, when the view changed. */
  private aimHand(): void {
    const h = this.hand!
    this.camera.updateWorldMatrix(true, false)
    const from = `${this.camera.matrixWorld.elements.join()}|${this.plc.isLocked || this.pointerNdc?.toArray()}`
    if (from === this.aimedFrom) return
    this.aimedFrom = from
    this.dragEvent(this.aimNdc(), h.id, h.y, h.off, true)
  }

  /** Highlights piece `id`: its box, resize handles for `axes`, its footprint `quad` on the floor; red while refused. null clears. */
  showSelection(s: { id: Id; quad: Pt[]; refused: boolean; axes: Handle['axis'][] } | null): void {
    const o = s && this.pieceObject(s.id)
    if (!s || !o) {
      this.selBox.removeFromParent()
      this.selFoot.visible = false
      return
    }
    if (this.selBox.parent !== o || this.selBox.userData.axes !== s.axes.join()) this.fitSelection(o, s.axes)
    const color = s.refused ? REFUSED : SEL
    for (const m of [this.selMat, this.selFoot.material as THREE.MeshBasicMaterial, this.selLine]) m.color.set(color)
    const pos = this.selFoot.geometry.getAttribute('position') as THREE.BufferAttribute
    const floor = (o.userData.floorM as number | undefined) ?? 0
    s.quad.forEach((p, i) => pos.setXYZ(i, p.x, floor + 0.015, p.y)) // over the 14 mm contact shadows and 12 mm rugs
    pos.needsUpdate = true
    this.selFoot.visible = true
  }

  /**
   * Live: these placements where they say (a transform each); one whose size changed is rebuilt, alone; one not built
   * yet (a chair a longer dining table gained) is built. `all`: ps is the whole layout, pieces left out of it are hidden.
   */
  placePieces(ps: FurniturePlacement[], all = false): void {
    this.rebatch('furniture')
    if (all) {
      this.layout = ps
      const ids = new Set(ps.map((p) => p.id))
      for (const o of [...this.furnitureGroup.children, ...this.ceilingGroup.children]) if (o.userData.kind === 'furniture' && !ids.has(o.userData.id)) o.visible = false
      for (const id of this.adding.keys()) if (!ids.has(id)) this.adding.set(id, null)
    }
    for (const p of ps) {
      const o = this.pieceObject(p.id)
      if (!o) {
        if (!p.removed || this.adding.has(p.id)) void this.addPiece(p)
        continue
      }
      const size = sizeKey(p)
      if (o.userData.size !== size) {
        void this.rebuildPiece(o, p, size)
        continue
      }
      o.position.x = p.x
      o.position.z = p.y
      const floor = this.floorOf(p) // moved onto another level: up or down with it; a wall piece also up or down its wall
      const kitY = o.userData.kitY as number | undefined
      // a table lamp: on the top of what is under it now (a desk, a bedside), else on the floor
      o.position.y = kitAsset(p.assetId)?.onTop ? floor + bottomOf(this.layout, p) : kitY === undefined ? o.position.y + floor - (o.userData.floorM ?? 0) : floor + (p.mountY ?? kitY)
      o.userData.floorM = floor
      o.rotation.set(0, -THREE.MathUtils.degToRad(p.rotationDeg), 0) // about the vertical only (fitSelection)
      o.userData.roomId = p.roomId
      o.userData.outside = p.outside || p.onCap // (on a cap: lit as the open air too)
      this.readDaylight(o) // moved to a darker or a brighter spot, another room: lit as it, at once
      o.visible = !p.removed
    }
  }

  /** the unit's daylight bake (setUnit): the furniture reads it (readDaylight) */
  private day: Daylight | null = null
  /** A piece is lit as the room its middle stands in (daylight.ts pieceDayUv / lightPiece), wherever it is put; one hung outside the flat as the open air. */
  private readDaylight(o: THREE.Object3D): void {
    if (this.day && this.unit) lightPiece(o, pieceDayUv(this.day, this.rooms, this.unit, { x: o.position.x, y: o.position.z }, o.userData.outside ? '' : o.userData.roomId))
  }

  /** the whole layout as last placed (placePieces `all`, loadFurniture): what a table lamp stands on */
  private layout: FurniturePlacement[] = []
  /** Pieces being built for placePieces → where they should stand when done (null: left out of the layout since). */
  private readonly adding = new Map<Id, FurniturePlacement | null>()
  private async addPiece(p: FurniturePlacement): Promise<void> {
    const building = this.adding.has(p.id)
    this.adding.set(p.id, p)
    if (building) return
    const token = this.buildToken
    const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p), bottomOf(this.layout, p), TIERS[this.tier].standIn)
    const now = this.adding.get(p.id)
    this.adding.delete(p.id)
    if (token !== this.buildToken || this.pieceObject(p.id)) return
    this.mountPiece(obj, p)
    obj.visible = false
    if (now) this.placePieces([now])
  }

  /** A committed layout (drop, turn, delete, undo, reset): every piece where it says, and the contact shadows and room lights follow. */
  setLayout(all: FurniturePlacement[]): void {
    // a stair over a hole moved, turned or deleted (Arrange): the floor is built again, the hole where the stair now stands
    const moved = this.wells.some(({ stair: w }) => {
      const s = all.find((p) => p.id === w.id)
      return !s || s.removed || s.x !== w.x || s.y !== w.y || s.rotationDeg !== w.rotationDeg
    })
    if (moved && this.unit) this.setUnit({ ...this.unit, furniture: all }, true)
    this.placePieces(all, true)
    this.stairs = all.filter(isStair) // a stair moved or deleted in Arrange: the walker climbs it where it now stands
    if (this.unit) this.look.setFurniture(present({ ...this.unit, furniture: all }))
  }

  private pieceObject(id: Id): THREE.Object3D | undefined {
    return [...this.furnitureGroup.children, ...this.ceilingGroup.children].find((o) => o.userData.id === id)
  }

  /** The box in the piece's own frame (measured with its pivot at the origin), handles on the sides and top `axes` may move. */
  private fitSelection(o: THREE.Object3D, axes: Handle['axis'][]): void {
    this.selBox.removeFromParent()
    this.selBox.traverse((c) => (c as THREE.Mesh).geometry?.dispose())
    this.selBox.clear()
    // the Euler, not the quaternion: a half turn copied back as a quaternion reads as (180°, 0°, 180°), and the next
    // placePieces set y alone on that — the piece stood backwards (the TV cabinet showed its plain back, session 31 QA V7)
    const [p, r, k] = [o.position.clone(), o.rotation.clone(), o.scale.clone()]
    o.position.set(0, 0, 0)
    o.rotation.set(0, 0, 0)
    o.scale.set(1, 1, 1)
    o.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(o)
    o.position.copy(p)
    o.rotation.copy(r)
    o.scale.copy(k)
    o.updateMatrixWorld(true)
    const c = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    // seen through the piece, the walls and the ceiling
    this.selBox.add(...outline(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z).translate(c.x, c.y, c.z)), this.selLine, this.selHalo))
    const at: [Handle, THREE.Vector3][] = [
      [{ axis: 'x', sign: 1 }, new THREE.Vector3(box.max.x, c.y, c.z)],
      [{ axis: 'x', sign: -1 }, new THREE.Vector3(box.min.x, c.y, c.z)],
      [{ axis: 'z', sign: 1 }, new THREE.Vector3(c.x, c.y, box.max.z)],
      [{ axis: 'z', sign: -1 }, new THREE.Vector3(c.x, c.y, box.min.z)],
      [{ axis: 'y', sign: 1 }, new THREE.Vector3(c.x, box.max.y, c.z)],
    ]
    for (const [h, v] of at.filter(([h]) => axes.includes(h.axis))) {
      const m = dragDot(v, this.selMat, this.selRim)
      m.userData.handle = h
      this.selBox.add(m)
    }
    this.selBox.userData = { axes: axes.join(), axesList: axes, box }
    o.add(this.selBox)
  }

  private async rebuildPiece(old: THREE.Object3D, p: FurniturePlacement, size: string): Promise<void> {
    old.userData.size = size // a newer size supersedes this build
    const token = this.buildToken
    const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p), bottomOf(this.layout, p), TIERS[this.tier].standIn)
    const parent = old.parent
    if (token !== this.buildToken || !parent || old.userData.size !== size) return
    obj.userData.size = size
    obj.userData.floorM = this.floorOf(p)
    obj.visible = !p.removed
    this.readDaylight(obj)
    const selected = this.selBox.parent === old
    if (selected) this.selBox.removeFromParent()
    parent.add(obj)
    old.removeFromParent()
    this.wake()
    this.rebatch('furniture')
    // procedural geometry is per build (glTF clones share theirs, and never resize)
    if (kitAsset(p.assetId)?.url.startsWith('procedural:')) old.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    if (selected) this.fitSelection(obj, this.selBox.userData.axesList)
  }

  // ───────────────────────────── openings (staff) ─────────────────────────────

  /**
   * Edit openings (staff, founder 2026-10-04): the mouse stays free (no pointer lock; dragging empty space looks around in
   * walk mode); a click picks a door / window / slider / passage — its frame, leaf or glass, or the hole itself; a drag slides
   * it along its wall, an end dot resizes it (`OpeningEvent`s; the caller runs the Studio's rules).
   */
  setOpeningEdit(on: boolean): void {
    this.editingOpenings = on
    if (on && this.plc.isLocked) this.plc.unlock()
    if (!on) this.showOpening(null)
  }

  onOpening(cb: (e: OpeningEvent) => void): void {
    this.openingCb = cb
  }

  private clearOpBox(box = this.opBox): void {
    box.traverse((o) => {
      ;(o as THREE.Mesh).geometry?.dispose()
      ;((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.()
    })
    box.clear()
  }

  /**
   * Finishes' outside card open on an outer wall in the Building view (qa4fix): what "This wall" dresses — that wall run on
   * every floor its drawing stands on (Building.runFaces) — outlined as a picked thing is (the accent over a white halo),
   * until the card closes (null).
   */
  showWallStack(spot: { drawing: Id; run: Id } | null): void {
    this.clearOpBox(this.stackBox)
    const pts = spot && this.building?.runFaces(spot.drawing, spot.run)
    if (pts?.length) this.stackBox.add(...outline(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)), lineMat(SEL), haloMat()))
    this.wake()
  }

  /**
   * Outlines low wall `id` as the plan has it now (`a` → `b`, its height from its foot) with a dot on each end (a dot drag
   * moves that end along the wall, a drag on the wall moves it across). null clears.
   */
  showWall(s: { id: Id; a: Pt; b: Pt; heightM: number; thicknessM: number } | null): void {
    this.clearOpBox()
    const L = s ? Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) : 0
    this.opBox.userData = { id: s && L > 1e-6 ? s.id : undefined, wallId: s?.id, wall: true }
    if (!s || L <= 1e-6) return
    const dir = new THREE.Vector3((s.b.x - s.a.x) / L, 0, (s.b.y - s.a.y) / L)
    const foot = Math.min(...(this.lifts.get(s.id)?.foot ?? [0])) // a wall's height is from its lower floor
    this.opBox.matrixAutoUpdate = false
    this.opBox.matrix.makeBasis(dir, UP, new THREE.Vector3(-dir.z, 0, dir.x)).setPosition(s.a.x, foot, s.a.y)
    this.opBox.add(...outline(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, s.heightM, s.thicknessM + 0.04).translate(L / 2, s.heightM / 2, 0)), lineMat(SEL), haloMat()))
    const [core, rim] = [dotMat(SEL), dotMat('#ffffff')]
    for (const end of ['a', 'b'] as const) {
      const dot = dragDot(new THREE.Vector3(end === 'a' ? 0 : L, s.heightM, 0), core, rim)
      dot.userData.end = end
      this.opBox.add(dot)
    }
  }

  /** Outlines opening `id` (u from its wall's corner A, heights in m) with a dot on each end and on its head (a dot drag resizes it; a window's sill has one too); red while refused. null clears. */
  showOpening(s: { id: Id; wallId: Id; offsetM: number; widthM: number; heightM: number; sillM: number; refused: boolean } | null): void {
    this.clearOpBox()
    const f = s && this.wallFrames.get(s.wallId)
    const w = s && this.unit?.walls.find((x) => x.id === s.wallId)
    this.opBox.userData = { id: f && w ? s.id : undefined, wallId: s?.wallId }
    if (!s || !f || !w) return
    // the wall's own frame (any angle): u along it, v up, w across (buildWall's basis)
    this.opBox.matrixAutoUpdate = false
    // …standing on the higher floor beside the wall, as the opening is built (liftedWall)
    const base = this.openingBase(s.wallId, s.offsetM + s.widthM / 2)
    this.opBox.matrix.makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), UP, new THREE.Vector3(f.normal.x, 0, f.normal.y)).setPosition(f.origin.x, base, f.origin.y)
    const color = s.refused ? REFUSED : SEL
    const mid = s.offsetM + s.widthM / 2
    this.opBox.add(...outline(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.widthM, s.heightM, w.thicknessM + 0.04).translate(mid, s.sillM + s.heightM / 2, 0)), lineMat(color), haloMat()))
    const [core, rim] = [dotMat(color), dotMat('#ffffff')]
    const window = w.openings.find((o) => o.id === s.id)?.kind === 'window' // only a window's bottom is off the floor
    for (const end of ['a', 'b', 'top', ...(window ? (['sill'] as const) : [])] as const) {
      const at =
        end === 'top' || end === 'sill'
          ? new THREE.Vector3(mid, end === 'top' ? s.sillM + s.heightM : s.sillM, 0)
          : new THREE.Vector3(end === 'a' ? s.offsetM : s.offsetM + s.widthM, s.sillM + s.heightM / 2, 0)
      const dot = dragDot(at, core, rim)
      dot.userData.end = end
      this.opBox.add(dot)
    }
  }

  /** The vertical plane through wall `wallId`'s centre line, and u along it where the ray at `ndc` meets it (null: it does not). */
  private alongWall(ndc: THREE.Vector2, wallId: Id): { u: number; v: number; d: number } | null {
    const f = this.wallFrames.get(wallId)
    if (!f) return null
    this.raycaster.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(f.normal.x, 0, f.normal.y), new THREE.Vector3(f.origin.x, 0, f.origin.y))
    const P = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    if (!P) return null
    const u = (P.x - f.origin.x) * f.dir.x + (P.z - f.origin.y) * f.dir.y
    return { u, v: P.y - this.openingBase(wallId, u), d: this.raycaster.ray.origin.distanceTo(P) }
  }

  /** The floor a wall's openings stand on at u along it (details.ts wallLift: the higher side's level), 0 on a flat floor. */
  private openingBase(wallId: Id, u: number): number {
    const l = this.lifts.get(wallId)
    const t = THREE.MathUtils.clamp(u / (this.wallFrames.get(wallId)?.lengthM || 1), 0, 1)
    return l ? l.base[0] + t * (l.base[1] - l.base[0]) : 0
  }

  /** The opening under the pointer: one of its parts (frame, leaf, glass), else its hole when nothing nearer hides it. */
  private openingAt(ndc: THREE.Vector2): { id: Id; wallId: Id; u: number } | null {
    const hit = this.pick(ndc)
    const direct = hit?.kind === 'opening' ? hit.id.split('/')[0] : null
    const seen = hit ? this.camera.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z)) : Infinity
    let best: { id: Id; wallId: Id; u: number; d: number } | null = null
    for (const w of this.unit?.walls ?? []) {
      if (!w.openings.length || w.id.startsWith(GAP_PREFIX)) continue // a gap's stand-in passage (closeGaps) is not in the plan: nothing to edit
      const p = this.alongWall(ndc, w.id)
      if (!p) continue
      for (const o of w.openings) {
        const inside = p.u >= o.offsetM && p.u <= o.offsetM + o.widthM && p.v >= o.sillM - 0.05 && p.v <= o.sillM + o.heightM + 0.05
        if ((o.id === direct || (inside && p.d <= seen + w.thicknessM)) && (!best || p.d < best.d)) best = { id: o.id, wallId: w.id, u: p.u, d: p.d }
      }
    }
    return best
  }

  /** A low wall under the pointer (a parapet, railing, planter edge, kerb — under core.LOW_WALL_M; a zone line is drawn as nothing) and where it was hit. */
  private lowWallAt(ndc: THREE.Vector2): { id: Id; point: THREE.Vector3 } | null {
    const hit = this.pick(ndc)
    const w = hit?.kind === 'wall' ? this.unit?.walls.find((x) => x.id === hit.id) : undefined
    return hit && w && w.heightM > 0 && w.heightM < core.LOW_WALL_M ? { id: w.id, point: new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) } : null
  }

  /** Edit openings: an end dot of the selected opening or low wall (resize), else an opening (selects it, slide), else a low wall (selects it, moves it across), else empty space (walk: look around). */
  private openingDown(e: PointerEvent): void {
    const ndc = this.ndcOf(e)
    this.raycaster.setFromCamera(ndc, this.camera)
    const sel = this.opBox.userData as { id?: Id; wallId?: Id; wall?: boolean }
    const ends = this.opBox.children.filter((c) => c.userData.end)
    const dot = sel.id && ends.length ? (this.raycaster.intersectObjects(ends, false)[0] ?? this.dotInReach(e, ends)) : undefined
    if (dot && sel.id && sel.wallId) {
      this.opGrab = { id: sel.id, wallId: sel.wallId, end: dot.object.userData.end, off: 0, moved: false, rigid: e.altKey }
      // a low wall's end moves along the wall's own line (as the plan has it now), at the dot's height
      if (sel.wall) this.opGrab.line = { o: dot.object.getWorldPosition(new THREE.Vector3()), d: new THREE.Vector3(1, 0, 0).transformDirection(this.opBox.matrixWorld) }
    } else {
      const o = this.openingAt(ndc)
      const lw = o ? null : this.lowWallAt(ndc)
      if (lw) {
        // its body: moved across its line, from where it was grabbed
        const f = this.wallFrames.get(lw.id)!
        this.openingCb?.({ kind: 'select', id: lw.id })
        this.opGrab = { id: lw.id, wallId: lw.id, off: 0, moved: false, line: { o: lw.point, d: new THREE.Vector3(f.normal.x, 0, f.normal.y) } }
        this.orbit.enabled = false
        this.canvas.setPointerCapture(e.pointerId)
        return
      }
      if (!o) {
        if (this.mode === 'walk') this.look2 = { x: e.clientX, y: e.clientY }
        return
      }
      const at = this.unit?.walls.find((w) => w.id === o.wallId)?.openings.find((x) => x.id === o.id)
      this.openingCb?.({ kind: 'select', id: o.id })
      this.opGrab = { id: o.id, wallId: o.wallId, off: o.u - (at?.offsetM ?? o.u), moved: false }
    }
    this.orbit.enabled = false // the opening moves, not the dollhouse camera
    this.canvas.setPointerCapture(e.pointerId)
  }

  private xr: XRControls | null = null

  /** Turns WebXR on (once isSessionSupported('immersive-vr') is true). Rays, teleport, snap turn, room chip: xr.ts. */
  enableXR(): XRControls {
    this.xr ??= new XRControls({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      rig: this.rig,
      sun: this.sun,
      targets: this.staticGroup,
      canStand: (p) => !!this.unit && !!core.roomAt(p, this.rooms, this.unit) && core.roomAt(p, this.rooms, this.unit)!.kind !== 'pool' && !this.blocked(p),
      roomAt: (p) => (this.unit ? core.roomAt(p, this.rooms, this.unit) : null),
      start: () => this.setMode('walk'),
      moved: (p) => (this.walker = p),
      exit: (p, yaw) => this.spawnAt(p, yaw),
    })
    return this.xr
  }

  /**
   * The batches (batch.ts, every tier): `kind`'s groups — the walls, floors and openings, or the furniture — and the
   * ceilings (room ceilings and the fixtures on them) are drawn mesh by mesh again at once, so the change shows on the next
   * frame, and batched again once nothing has changed for BATCH_MS; the furniture and ceilings never while a piece is in
   * hand or Arrange is on (pieces move under the pointer).
   */
  private rebatch(kind: 'static' | 'furniture'): void {
    for (const g of kind === 'static' ? [this.staticGroup, this.ceilingGroup] : [this.furnitureGroup, this.ceilingGroup]) unbatch(g)
    this.unsettled.add(kind)
    clearTimeout(this.batchTimer)
    this.batchTimer = window.setTimeout(this.settle, BATCH_MS)
  }

  private settle = (): void => {
    if (this.disposed || !this.ready || this.exporting) return // exportGlb batches them again when it is done
    if (this.holding) return void (this.batchTimer = window.setTimeout(this.settle, BATCH_MS)) // a stair's floor, hidden: batched as it shows
    const still = !this.arranging && !this.hand
    const groups = [this.unsettled.has('static') && this.staticGroup, still && this.unsettled.has('furniture') && this.furnitureGroup, still && this.ceilingGroup]
    for (const g of groups) if (g) batch(g, g === this.staticGroup ? Infinity : TIERS[this.tier].cell)
    this.unsettled.clear()
    this.wake()
  }

  resize(): void {
    if (this.renderer.xr.isPresenting) return
    this.wake()
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    // the drawing buffer at the tier's pixels; the canvas keeps its CSS size (setSize's false): the browser scales it up
    this.renderer.setPixelRatio(pixelRatioFor(this.tier, devicePixelRatio, w, h, forcedScale(), this.budget))
    this.renderer.setSize(w, h, false)
    this.look.setSize(w, h)
    this.camera.aspect = w / h
    // standing in the room a narrower lens is for (a WC under 2 m²): the same width across at the new shape
    if (this.lens && this.unit && core.roomAt(this.walker, this.rooms, this.unit)?.id === this.lens.roomId) this.camera.fov = lensFov(this.lens.hfovDeg, w / h, WALK_FOV)
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    clearTimeout(this.batchTimer)
    this.pmrem?.dispose()
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    window.removeEventListener('pointerdown', this.notePointer, true)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    for (const e of WAKE) window.removeEventListener(e, this.wake)
    if (THREE.DefaultLoadingManager.onProgress === this.loaded) THREE.DefaultLoadingManager.onProgress = () => {}
    clearTimeout(this.lostTimer)
    if (this.orbit.domElement) this.orbit.dispose()
    this.plc.dispose()
    this.showOpening(null)
    this.wind?.dispose()
    this.drop()
    if (this.kept) this.free(this.kept)
    this.kept = null
    this.clearStatic()
    this.selFoot.geometry.dispose()
    ;(this.selFoot.material as THREE.Material).dispose()
    for (const m of [this.selMat, this.selRim, this.selLine, this.selHalo]) m.dispose()
    this.look.dispose()
    this.onePixel?.rt.dispose()
    ;(this.onePixel?.scene.overrideMaterial as THREE.Material | undefined)?.dispose()
    // A canvas keeps its GL context across renderers (React StrictMode / HMR re-create us on the same canvas).
    // Leave unpack state at defaults so the next WebGLState's 3D/array empty textures don't upload with FLIP_Y set.
    this.renderer.state.reset()
    this.renderer.dispose()
  }

  // ───────────────────────────── geometry ─────────────────────────────

  private clearStatic(): void {
    this.buildToken++
    for (const g of [this.staticGroup, this.ceilingGroup, this.furnitureGroup]) {
      g.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.())
      g.clear()
    }
    this.floors.length = 0
    this.surfaces.length = 0
    this.wallFrames.clear()
    this.building?.dispose()
    this.building = null
    this.shell?.removeFromParent()
    this.shell = null
  }

  /** The architect's outside shape round the flat, once loaded and while this build is still the one shown; the lite tier leaves a heavy one out. */
  private async showShell(s: Shell, token: number): Promise<void> {
    if (this.tier === 'lite' && (s.triangles ?? 0) > LITE_MAX_TRIANGLES) return console.info(`[plotline] Lite: the outside shape (${s.triangles} triangles) is left out`)
    const g = await loadShell(s, this.shellClip).catch((e: unknown) => (console.warn('[plotline] outside shape', e), null))
    if (!g || token !== this.buildToken || this.disposed) return
    this.shell = g
    this.dressShell()
    g.visible = !this.holding // a stair's floor: shown with it (arrive)
    this.scene.add(g)
    this.wake()
  }

  /**
   * The outside shape's dressed surfaces (three/shell.ts dressShell): the building's own outside finish, frames and roof
   * covering follow what staff chose for the building (Finishes, the roof); the others keep what their file's names said.
   */
  private dressShell(): void {
    if (!this.shell || !this.unit) return
    const t = towerOf(this.unit)
    const roof = t ? roofIn(t) : undefined
    const choose = (d: Dress): MaterialRef | null =>
      !d.main ? null : d.slot === 'out' ? this.outside.wall(null, null) : d.slot === 'frame' ? this.outside.frame(null, null) : roof?.covering ? coveringOf(roof).material : null
    dressShell(this.shell, choose, this.shellClip)
  }

  private buildWall(wall: Wall, unit: Unit): void {
    const f = core.wallFrame(wall, unit.vertices)
    const n = { x: -f.dir.y, y: f.dir.x } // == f.normal by contract; derived so the basis is right-handed
    this.wallFrames.set(wall.id, { ...f, normal: n })
    const local = new THREE.Group()
    local.matrix.makeBasis(
      new THREE.Vector3(f.dir.x, 0, f.dir.y),
      UP,
      new THREE.Vector3(n.x, 0, n.y),
    )
    local.matrix.setPosition(f.origin.x, 0, f.origin.y)
    local.matrix.decompose(local.position, local.quaternion, local.scale)
    this.staticGroup.add(local)

    // which room is on each side (front = +normal)
    const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
    const off = wall.thicknessM / 2 + 0.05
    const side = (s: number) =>
      core.roomAt({ x: mid.x + n.x * off * s, y: mid.y + n.y * off * s }, this.rooms, unit)?.id ?? null
    // a face toward nothing beside an outdoor zone (a boundary wall's street face, a screen's far side) is outdoors too
    const zone = (r: Id | null) => (r && core.isOutdoor(this.rooms.find((x) => x.id === r)!.kind) ? r : null)
    const [f0, b0] = [side(1), side(-1)]
    const front = f0 ?? zone(b0)
    const back = b0 ?? zone(f0)

    // world space, groups 0 = front (+n), 1 = back, 2 = ends/tops: every wall shares the identity transform,
    // so a corner two walls share reaches the GPU as the same numbers (no hairline crack between them).
    // Reveals ride with the exterior face (front if both are rooms), not the depth-offset edge material: GTAO read
    // the offset depth as a groove along a slim reveal beside a window frame (the dashed outline on the study glass).
    const lift = this.lifts.get(wall.id)!
    if (core.railOf(wall)) {
      // a railing, a glass front, a fence (rails.ts): its own parts in their own materials, picked as the low wall it is
      const rail = new THREE.Group()
      rail.userData = { kind: 'wall', id: wall.id, front, back, label: 'Railing', objectKind: 'wall' }
      for (const { m, geo } of railParts(wall, unit)) {
        liftWall(geo, wall, unit, lift)
        const mesh = new THREE.Mesh(geo, m instanceof THREE.Material ? m : materialFor(m))
        mesh.castShadow = !mesh.material.transparent // (glass, a wire mesh: no solid shadow)
        mesh.receiveShadow = true
        rail.add(mesh)
      }
      this.staticGroup.add(rail)
      return
    }
    const built = liftedWall(wall, unit, lift, this.slabOver(wall)) // on its foot, its openings on the higher floor
    const geo = wallGeometry(built, unit, back === null && front !== null ? 1 : 0)
    if (geo) {
      const mesh = new THREE.Mesh(geo)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData = { kind: 'wall', id: wall.id, front, back, label: 'Wall', objectKind: 'wall' }
      this.staticGroup.add(mesh)
      // ends and tops: the finish of the room the wall stands in (its front room, else back), not a fixed white — an end cap
      // beside a coloured wall read as a strip (founder, 2026-10-03); still the depth-offset variant (see applyMaterials)
      // a kerb is concrete all over; a planter's low edge (≤ 0.6 m) a rendered box with a concrete coping on top
      const kerb = wall.heightM <= KERB_M ? { ref: CONCRETE } : {}
      const planter = wall.heightM <= 0.6 && [front, back].some((id) => this.rooms.find((r) => r.id === id)?.kind === 'planter')
      // a buyer's one-wall choice: each side by the wall its face is chosen by in that room (a gap's stand-in: the wall it continues, as pick())
      const planWall = wall.id.startsWith(GAP_PREFIX) ? wall.id.slice(GAP_PREFIX.length).split('|')[0] : wall.id
      const face = (r: Id | null) => {
        const room = this.rooms.find((x) => x.id === r)
        return room ? { wallId: faceWallId(unit, room, planWall) } : {}
      }
      // a side outside (toward no room, a balcony, an outdoor zone): the building's outside finish, by the run of the drawing as
      // given (the tower's is: raised heads and gap stand-ins are the 3D's own)
      const run = outerRuns(this.builtFrom!.unit).get(planWall) ?? planWall
      const outer = (r: Id | null) => {
        const k = r && this.rooms.find((x) => x.id === r)?.kind
        return wall.heightM > KERB_M && (!k || k === 'balcony' || core.isOutdoor(k)) ? { outer: run } : {}
      }
      this.surfaces.push({
        mesh,
        sides: [
          { roomId: front, target: 'wall', ...face(front), ...kerb, ...outer(front) },
          { roomId: back, target: 'wall', ...face(back), ...kerb, ...outer(back) },
          { roomId: front ?? back, target: 'wall', edge: true, ...face(front ?? back), ...(planter ? { ref: CONCRETE } : { ...outer(back), ...outer(front), ...kerb }) },
        ],
      })
      // a solid low wall's cap (rails.ts), finished as its top — daylit and stood on its floor as the wall is (build)
      const cap = capGeometry(wall, unit)
      if (cap) {
        const top = new THREE.Mesh(cap)
        top.castShadow = top.receiveShadow = true
        top.userData = { ...mesh.userData }
        this.staticGroup.add(top)
        // (outside: the building's Edges and caps once an outside is chosen — a brick parapet's cap brick)
        const out = { ...outer(back), ...outer(front) }
        this.surfaces.push({ mesh: top, sides: [{ roomId: front ?? back, target: 'wall', edge: true, ...face(front ?? back), ...(planter ? { ref: CONCRETE } : { ...out, ...(out.outer ? { cap: true as const } : {}) }) }] })
      }
    }
    wall.openings.forEach((o, i) => {
      // on the higher floor at its middle (its sill as drawn: a glass wall stays a glass wall), its head within the wall
      const t = (o.offsetM + o.widthM / 2) / (f.lengthM || 1)
      const h = built.openings[i].heightM
      const parts = dressOpening(h === o.heightM ? o : { ...o, heightM: h }, wall, unit, this.rooms) // the same object: dressOpening knows the main door by it
      for (const p of parts) p.position.y += lift.base[0] + t * (lift.base[1] - lift.base[0])
      // a window's, a slider's or a glass wall's frame: its colour chosen with the outside (applyMaterials)
      for (const p of parts) p.traverse((x) => void (x.userData.id === `${o.id}/frame` && x.userData.label !== 'Door frame' && x.children.forEach((m) => (m.userData.frame = o.id))))
      local.add(...parts)
    })
  }

  /**
   * A column (details.ts pillarParts): one mesh finished, shadowed and picked like a wall (no wall frame: a comment
   * anchors at its plan point), each upright face in its own room's wall finish; its skirting in the floor finish.
   * Every part reads the daylight at its foot in the room it faces.
   */
  private buildPillar(p: Pillar, unit: Unit, day: Daylight, heightM: number): void {
    const level = this.levelAt(p) // on its face's floor, up to the storey's top
    const parts = pillarParts(p, heightM - level, unit, this.rooms)
    for (const x of parts) {
      mapDaylight(day, x.geo, unit, 'floor', x.room?.id ?? '') // no room: neutral
      x.geo.translate(0, level, 0)
    }
    const room = (core.roomAt(p, this.rooms, unit) ?? parts.find((x) => x.room)?.room)?.id ?? null
    for (const skirting of [false, true]) {
      const list = parts.filter((x) => (x.part === 'skirting') === skirting)
      if (!list.length) continue
      const mesh = new THREE.Mesh(mergeGeometries(list.map((x) => x.geo), true)!)
      list.forEach((x) => x.geo.dispose())
      mesh.receiveShadow = true
      mesh.castShadow = !skirting
      if (!skirting) mesh.userData = { kind: 'wall', id: p.id, front: room, back: room, roomId: room, label: 'Column', objectKind: 'wall' }
      this.staticGroup.add(mesh)
      // (a ground-floor column's face toward the open air or a zone: the building's Edges and caps once an outside is chosen)
      const open = (r: Room | null) => !r || core.isOutdoor(r.kind)
      const cap = !skirting && this.storeyOf() === 0 ? { outer: '', cap: true as const } : {}
      this.surfaces.push({ mesh, sides: list.map((x) => (x.part === 'top' ? null : { roomId: x.room?.id ?? null, target: skirting ? 'floor' : 'wall', ...(open(x.room ?? null) ? cap : {}) })) })
    }
  }

  private buildRoom(room: Room, unit: Unit): void {
    const floorGeo = floorGeometry(room, unit) // its level; a ramp's vertices on its plane (details.ts)
    const holes = this.wells.filter((w) => w.roomId === room.id).map((w) => w.poly) // a stair that leads down (its ceiling stays whole)
    const floor = new THREE.Mesh(stepGeometry(room, unit) ?? (holes.length ? floorGeometry(room, unit, holes) : floorGeo)) // a steep slope: a flight of steps (details.ts)
    floor.receiveShadow = true
    floor.userData = { kind: 'floor', id: room.id, roomId: room.id, label: `${room.name} floor`, objectKind: 'floor' }
    this.staticGroup.add(floor)
    this.floors.push(floor)
    this.surfaces.push({ mesh: floor, sides: [{ roomId: room.id, target: 'floor' }] })

    if (room.kind === 'pool') {
      // a sunk basin (details.ts poolBasin): its floor down by the depth, tiled walls up to the rim, the water below it
      const { depth, walls, water } = poolBasin(room, unit)
      floorGeo.translate(0, -depth, 0)
      const basin = new THREE.Mesh(walls)
      basin.receiveShadow = true
      this.staticGroup.add(basin)
      this.surfaces.push({ mesh: basin, sides: [{ roomId: room.id, target: 'floor' }] })
      const w = new THREE.Mesh(water, WATER)
      w.receiveShadow = true
      w.userData = { kind: 'floor', id: room.id, roomId: room.id, label: `${room.name} water`, objectKind: 'floor' }
      this.staticGroup.add(w)
    }
    if (core.isOutdoor(room.kind)) return // a zone is open to the sky (a covered one: render.ts's roof is its soffit)
    const ceilGeo = floorGeo.clone()
    ceilGeo.setIndex([...floorGeo.index!.array].reverse())
    const top = this.ceilingOf(room.id) // flat, at its walls' top
    for (let i = 0; i < ceilGeo.attributes.position.count; i++) ceilGeo.attributes.position.setY(i, top)
    ceilGeo.computeVertexNormals()
    const ceiling = new THREE.Mesh(ceilGeo)
    ceiling.userData = { kind: 'ceiling', id: room.id, roomId: room.id, label: `${room.name} ceiling`, objectKind: 'ceiling' }
    this.ceilingGroup.add(ceiling)
    this.surfaces.push({ mesh: ceiling, sides: [{ roomId: room.id, target: 'ceiling' }] })
  }

  /**
   * The stair core under a hole (details.ts wellParts), down to the floor below: a side along a wall of its room goes on
   * down that wall — its finish, its daylight — the others and its floor are the room's. Not picked: decoration of the hole.
   */
  private buildWell(w: Well, unit: Unit, day: Daylight): void {
    const room = this.rooms.find((r) => r.id === w.roomId)!
    for (const { edge, geo } of wellParts(w.poly, w.bottom + STAIR_RISE, w.bottom)) {
      const m = edge && { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 }
      const along =
        m &&
        unit.walls.find((x) => {
          if (!room.wallIds.includes(x.id)) return false
          const f = core.wallFrame(x, unit.vertices)
          const [u, n] = [(m.x - f.origin.x) * f.dir.x + (m.y - f.origin.y) * f.dir.y, (m.x - f.origin.x) * f.normal.x + (m.y - f.origin.y) * f.normal.y]
          return u > 0 && u < f.lengthM && Math.abs(Math.abs(n) - x.thicknessM / 2) < 0.03
        })
      mapDaylight(day, geo, unit, along ? 'wall' : 'floor', along ? along.id : room.id)
      const mesh = new THREE.Mesh(geo)
      mesh.receiveShadow = true
      this.staticGroup.add(mesh)
      this.surfaces.push({ mesh, sides: [{ roomId: room.id, target: edge ? 'wall' : 'floor', ...(along ? { wallId: along.id } : {}) }] })
    }
  }

  /**
   * The flight below a hole (stairHole): stair `s` itself one storey down, its floor at `floorM` — seen and walked down
   * (walkLevel, treadBelow), never picked or arranged. Its middle reads its room's daylight, as the stair above does.
   */
  private buildFlightBelow(s: FurniturePlacement, floorM: number): void {
    const model = buildProcedural(s.assetId)
    if (!model) return
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    model.position.set(-c.x, -box.min.y, -c.z) // grounded and centred as buildFurniture places the stair above
    model.traverse((o) => ((o.castShadow = false), (o.receiveShadow = true))) // under the slab: nothing there to shade
    const pivot = new THREE.Group()
    pivot.position.set(s.x, floorM, s.y)
    pivot.rotation.y = -THREE.MathUtils.degToRad(s.rotationDeg)
    pivot.userData.roomId = s.roomId
    pivot.add(model)
    this.staticGroup.add(pivot)
    this.readDaylight(pivot)
  }

  /** A parking level's paint (details.ts bayMarkings): the bay lines (one mesh) and each bay's number, flat on its floor. */
  private buildMarkings(unit: Unit): void {
    const { lines, numbers } = bayMarkings(unit, this.rooms)
    const g = bayLineGeometry(lines)
    if (g) {
      const m = new THREE.Mesh(g, PAINT)
      m.receiveShadow = true
      this.staticGroup.add(m)
    }
    for (const { text, at, up } of numbers) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45).rotateX(-Math.PI / 2).rotateY(Math.atan2(-up.x, -up.y)), bayNumber(text))
      m.position.set(at[0], at[1] + 0.005, at[2])
      m.receiveShadow = true
      this.staticGroup.add(m)
    }
  }

  /** The walked flat's floor in its building (the outside's floor bands): its tower's floor for it, else its own. */
  private storeyOf(): number | undefined {
    const u = this.builtFrom?.unit ?? this.unit
    const t = u && towerOf(u)
    const stem = t && stemIn(t, u)
    return t && stem ? floorIn(t, stem, this.unit!.floor) : this.unit?.floor
  }

  /**
   * The walked flat's slab (Look) in the building's Edges and caps: each wall's stretch of the slab's edge and a balcony's band
   * as that wall's edges (finishes.ts Outside.edge, by its run of the drawing as given); nothing chosen: the plaster, as built.
   */
  private dressSlab(): void {
    const u = this.builtFrom?.unit ?? this.unit
    if (!u) return
    const runs = outerRuns(u)
    const floor = this.storeyOf()
    this.look.dressEdges((id) => {
      if (!this.outside.sig) return null
      const plan = id.startsWith(GAP_PREFIX) ? id.slice(GAP_PREFIX.length).split('|')[0] : id
      const r = this.outside.edge(u.id, runs.get(plan) ?? plan, floor)
      return r === EXTERIOR_PLASTER ? null : r
    })
  }

  private applyMaterials(): void {
    if (!this.unit) return
    this.dressSlab()
    // wall ends and tops: pushed back in depth so they lose ties to the faces they meet (an end cap at a
    // junction sits edge-on against the room face and won the tie along it: a one-pixel hairline)
    const plaster = materialFor(EDGE_PLASTER, true, true)
    const zones = new Map(this.rooms.filter((r) => core.isOutdoor(r.kind)).map((r) => [r.id, r.kind]))
    // a parking deck: every zone of the level under the slab above (a basement)
    const outdoor = this.rooms.filter((r) => core.isOutdoor(r.kind))
    const deck = outdoor.length > 0 && outdoor.every((r) => isCovered(r, this.cover))
    // the building's outside (setOutside) on the flat's outer sides — a balcony's too, unless a buyer picked that wall or the
    // whole balcony; not a parking deck's (its grey paint); nothing chosen: as always
    const u = this.builtFrom?.unit ?? this.unit // (the drawing as given: its runs, as the tower's)
    const t = towerOf(u)
    const stem = t && stemIn(t, u)
    const floor = t && stem ? floorIn(t, stem, this.unit.floor) : this.unit.floor // (a stair's next floor of it: that floor's band)
    const outer = (side: NonNullable<Surface['sides'][number]>): THREE.MeshStandardMaterial | null => {
      if (side.outer === undefined || !this.outside.sig || (side.roomId && zones.has(side.roomId) && deck)) return null
      const r = side.roomId && this.rooms.find((x) => x.id === side.roomId)
      if (r && r.kind === 'balcony' && ((side.wallId && this.cfg[wallKey(side.wallId, r.id)]) || this.cfg[roomKey(r.id, 'wall')])) return null
      const ref = side.cap ? this.outside.edge(u.id, side.outer || null, floor) : this.outside.wall(u.id, side.outer, floor)
      return ref && materialFor(ref, side.edge, true, false, true)
    }
    for (const s of this.surfaces) {
      const mats = s.sides.map((side) => {
        if (!side) return plaster
        if (side.ref) return materialFor(side.ref, side.edge, true)
        const out = outer(side)
        if (out) return out
        const zone = side.roomId && zones.get(side.roomId) // an outdoor zone: no buyer finish, its look by kind (materials.ts)
        return zone ? materialFor(zoneFinishRef(zone, side.target, deck), side.edge, true) : resolveFinish(this.unit!.finishSlots, this.cfg, side.roomId, side.target, true, side.edge, side.wallId)
      })
      s.mesh.material = mats.length === 1 ? mats[0] : mats
    }
    // the frames: their colour chosen (one window's, the building's), else as built
    this.staticGroup.traverse((o) => {
      const id = o.userData.frame as Id | undefined
      if (!id) return
      const m = o as THREE.Mesh
      if (!BUILT.has(m)) BUILT.set(m, m.material as THREE.Material)
      const ref = this.outside.frame(u.id, id)
      m.material = ref ? materialFor(ref) : BUILT.get(m)!
    })
    // a glass wall's spandrel panels in the outside finish (openings.ts): its wall's, as the wall's outer face wears it
    const runs = outerRuns(u)
    this.staticGroup.traverse((o) => {
      if (!o.userData.spandrel) return
      const wallId = o.parent?.userData.wallId as Id | undefined
      const ref = wallId ? this.outside.wall(u.id, runs.get(wallId) ?? wallId, floor) : null
      ;(o as THREE.Mesh).material = materialFor(ref ?? EXTERIOR_PLASTER)
    })
  }

  /**
   * The ceiling over a room, m above the datum: its tallest wall's top (details.ts roomCeiling); a room under the slab
   * above (`cover`) with storey walls: that slab, the storey's top.
   */
  private ceilingOf(roomId: Id): number {
    const r = this.rooms.find((x) => x.id === roomId)
    if (!r || !this.unit) return 3.048
    const own = roomCeiling(r, this.unit, this.rooms)
    return own >= STOREY_WALL_M && this.cover.some((c) => core.pointInPolygon(r.centroid, c)) ? this.top : own
  }

  /**
   * How high a storey wall is built when something is over it: the slab above (reachesSlab), else the ceiling of an indoor
   * room it borders when that is higher than its own top — a wall standing on a lower floor outside (glazing between a
   * room and a sunken lawn) goes up to the room's ceiling, never an open band under it. undefined: its own height.
   */
  private slabOver(w: Wall): number | undefined {
    if (w.heightM < STOREY_WALL_M || !this.unit) return undefined
    if (this.reachesSlab(w)) return this.top
    const ceil = Math.max(0, ...this.rooms.filter((r) => !core.isOutdoor(r.kind) && r.wallIds.includes(w.id)).map((r) => this.ceilingOf(r.id)))
    return ceil > Math.max(...this.lifts.get(w.id)!.foot) + w.heightM + 1e-6 ? ceil : undefined
  }

  /** A storey wall (≥ STOREY_WALL_M) under the slab above (`cover`, by its middle) goes up to it, wherever it stands. */
  private reachesSlab(w: Wall): boolean {
    if (w.heightM < STOREY_WALL_M || !this.cover.length) return false
    // a step to either side of its middle: a wall ON the slab's edge (a glazed front under it) is under it too
    const f = core.wallFrame(w, this.unit!.vertices)
    const off = w.thicknessM / 2 + 0.05
    return [1, -1].some((s) => {
      const p = { x: f.origin.x + (f.dir.x * f.lengthM) / 2 + f.normal.x * off * s, y: f.origin.y + (f.dir.y * f.lengthM) / 2 + f.normal.y * off * s }
      return this.cover.some((c) => core.pointInPolygon(p, c))
    })
  }

  /**
   * What the slab above (`cover`) changes in the flat's own walls, rooms and furniture (build): each room under it or not (its
   * ceiling, a zone covered), each wall's top (slabOver). Two floors of a drawing with the same print are built alike —
   * the top floor under the roof as the ones under it, where its walls stop at the storey's top anyway (arrive re-places it).
   */
  private coverPrint(cover: Pt[][]): string {
    const shown = this.cover
    this.cover = cover
    // a wall's top as built: the slab's, else its own — the same where it stops at the storey's top anyway (a level foot)
    const top = (w: Wall) => {
      const t = this.slabOver(w)
      const [a, b] = this.lifts.get(w.id)!.foot
      return t !== undefined ? t.toFixed(3) : a === b ? (a + w.heightM).toFixed(3) : 'own'
    }
    const print = roomsUnder(this.rooms, cover) + '|' + this.unit!.walls.map(top).join()
    this.cover = shown
    return print
  }

  /** The floor level at a plan point (core.floorLevelAt: the smallest face round it; 0 outside every face). */
  private levelAt(p: Pt): number {
    return this.unit && this.rooms.some((r) => r.levelM || r.slope) ? core.floorLevelAt(this.unit, p.x, p.y, this.rooms) : 0
  }

  /** The floor a piece stands on: its room's level at its spot (its room gone: whatever face it is in). */
  private floorOf(p: FurniturePlacement): number {
    const r = this.rooms.find((x) => x.id === p.roomId)
    return r && this.unit ? core.roomLevelAt(r, this.unit, p.x, p.y) : this.levelAt(p)
  }

  /** The stair whose footprint holds p, and where on it p is (furnish/stairs.ts), or null. */
  private stairAt(p: Pt): { stair: FurniturePlacement; spot: NonNullable<ReturnType<typeof stairSpot>> } | null {
    for (const stair of this.stairs) {
      const spot = stairSpot(stair, p)
      if (spot) return { stair, spot }
    }
    return null
  }

  /** What the walker stands on at p: the floor (levelAt), or a stair's tread or half landing over its floor. */
  private walkLevel(p: Pt): number {
    const s = this.stairAt(p)
    if (!s) return this.levelAt(p)
    if (s.spot.part !== 'between') return this.floorOf(s.stair) + s.spot.h
    // flight B's side: over a hole, the flight below's treads (walked down); else this floor, under flight B
    return this.wells.some((w) => w.id === s.stair.id) ? this.floorOf(s.stair) + treadBelow(s.stair, p) : this.levelAt(p)
  }

  /**
   * Walking up or down a stair to the next floor (founder 2026-11-20): `cb(dir, stair)` loads that floor and puts the
   * walker on its stair (ViewerApp), true; false when there is no floor that way (the step is refused there).
   */
  onStair(cb: (dir: 'up' | 'down', stair: FurniturePlacement) => boolean): void {
    this.stairCb = cb
  }

  private async loadFurniture(unit: Unit): Promise<void> {
    const token = this.buildToken
    this.layout = unit.furniture
    // (a deleted piece is not built at all — placePieces builds it if it comes back; from Maheer's Plotline 2.0)
    const kept = unit.furniture.filter((p) => !p.removed)
    const byDistance = kept.sort((a, b) => Math.hypot(a.x - this.walker.x, a.y - this.walker.y) - Math.hypot(b.x - this.walker.x, b.y - this.walker.y))
    void preloadModels(kept) // every model on its way at once; each piece still goes in nearest first
    let t = performance.now()
    for (const p of byDistance) {
      const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p), bottomOf(unit.furniture, p), TIERS[this.tier].standIn)
      if (token !== this.buildToken) return // unit changed mid-load
      if (this.pieceObject(p.id)) continue // (built meanwhile by placePieces: a piece brought back while loading)
      this.mountPiece(obj, p)
      // a stair's floor (arrive): a frame every ~30 ms of building, the floor he leaves drawn in between
      if (this.holding && performance.now() - t > 30) {
        await new Promise((r) => requestAnimationFrame(r))
        if (token !== this.buildToken) return
        t = performance.now()
      }
    }
    this.loadedAt ||= performance.now()
  }
  /** the light map may be drawn (loadEnvironment): everything else under the load screen in (prepare), or the screen gone */
  private envGo: () => void = () => {}
  private readonly envMay = new Promise<void>((ok) => (this.envGo = ok))

  private mountPiece(obj: THREE.Object3D, p: FurniturePlacement): void {
    this.wake()
    this.rebatch('furniture')
    obj.userData.size = sizeKey(p) // Arrange rebuilds a piece when this changes
    obj.userData.floorM = this.floorOf(p)
    this.readDaylight(obj)
    // lights, fans and pendants hang from the ceiling: they go (hidden in the dollhouse) with it; a wall AC (mountY) stays
    const a = kitAsset(p.assetId)
    ;(a?.mount === 'ceiling' && a.mountY === undefined ? this.ceilingGroup : this.furnitureGroup).add(obj)
    if (lightOf(p.assetId)) this.look.addGlows(obj) // its diffuser, globe or shade glows while the lamps are on
  }

  private async loadEnvironment(): Promise<void> {
    const load = (url: string) =>
      new HDRLoader().loadAsync(url).catch(() => {
        console.warn(`[plotline] HDRI missing: ${url}`)
        return null
      })
    // Lite: no photo sky (the dome a plain colour, the panes mirror the room's light) and the room's light at a quarter size
    const isLite = this.tier === 'lite'
    const [hdr, sky] = await Promise.all([load(HDRI.interior), isLite ? null : load(HDRI.sky)])
    if (this.disposed) return // a disposed renderer must not touch the shared GL context again
    if (hdr && isLite) shrinkHdr(hdr, LITE_HDR_K)
    if (hdr) evenBearings(hdr)
    if (sky) clampSun(sky)
    // the light map drawn once everything else under the load screen is in (prepare): a draw waits for every program asked
    // before it, and Firefox is making the flat's and the tower's meanwhile (2–3 s on High) — drawn as the HDRI came in, the
    // page stood still 0.3 s on Lite, 1.1–1.5 s on High, instead of reading the models and building the tower's rooms
    // (session 31 open lane)
    await Promise.race([this.envMay, new Promise((ok) => setTimeout(ok, ENV_WAIT_MS))])
    if (this.disposed) return
    const standIn = this.scene.environment
    const pmrem = this.pmrem ?? new THREE.PMREMGenerator(this.renderer)
    this.pmrem = null
    this.scene.environment = hdr ? pmrem.fromEquirectangular(hdr).texture : pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    hdr?.dispose()
    if (standIn !== this.scene.environment) standIn?.dispose()
    if (sky) {
      const env = pmrem.fromEquirectangular(sky).texture
      for (const m of PANES) m.envMap = env // panes reflect the sky; no sky: they keep scene.environment
      Object.assign(this.look.paneEnvs, { sky: env, room: this.scene.environment ?? undefined })
      this.setTimeOfDay(this.hour) // at night the panes take the room's
      this.look.setSky(sky) // windows + dollhouse see a real sky; lighting stays on the interior HDRI
    }
    pmrem.dispose()
    this.envIn = true
    this.wake()
  }

  /** The PMREM environment lives only on the GPU: after a context loss it comes back empty and every room goes dark. */
  private onContextRestored = (): void => {
    clearTimeout(this.lostTimer)
    this.wake()
    void this.loadEnvironment()
  }
  /** three keeps the canvas and waits for the browser to restore it; not back in LOST_MS: gone (the viewer says so) */
  private onContextLost = (): void => {
    this.failCb?.('lost')
    clearTimeout(this.lostTimer)
    this.lostTimer = window.setTimeout(() => this.failCb?.('gone'), LOST_MS)
  }

  // ───────────────────────────── controls ─────────────────────────────

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
    if (e.type === 'keydown') this.keys.add(e.key.toLowerCase())
    else this.keys.delete(e.key.toLowerCase())
  }

  private notePointer = (e: PointerEvent): void => {
    this.finger = e.pointerType !== 'mouse'
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      this.fingers.add(e.pointerId)
      if (this.fingers.size > 1) {
        this.multi = true // a second finger: the dollhouse pinches (OrbitControls); nothing here looks, taps or grabs
        this.look2 = null
        return
      }
    }
    this.pointerDown = { x: e.clientX, y: e.clientY, t: e.timeStamp }
    if (!this.plc.isLocked) this.pointerNdc = this.ndcOf(e) // a tap has no move before it: the piece in hand aims where the finger lands
    if (this.editingOpenings && this.mode !== 'building') return this.openingDown(e)
    if (this.arranging && this.mode !== 'building') {
      if (!this.hand) this.arrangeDown(e)
      else if (this.mode === 'walk') this.look2 = { x: e.clientX, y: e.clientY }
    } else if (e.pointerType !== 'mouse' && this.mode === 'walk') this.look2 = { x: e.clientX, y: e.clientY } // one finger looks round (the grab-the-room look)
  }

  /** the browser took a finger back (a system gesture): it ends, nothing clicks */
  private onPointerCancel = (e: PointerEvent): void => {
    this.fingers.delete(e.pointerId)
    if (!this.fingers.size) this.multi = false
    if (!this.arranging && !this.editingOpenings) this.pointerDown = this.look2 = null
  }

  /** A finger's press that missed the drawn drag dots: the one within FINGER_REACH_PX of it (a mouse aims at the dot itself). */
  private dotInReach(e: PointerEvent, dots: THREE.Object3D[]): { object: THREE.Object3D; point: THREE.Vector3 } | undefined {
    if (e.pointerType === 'mouse') return undefined
    const r = this.canvas.getBoundingClientRect()
    const at = dots.map((d) => {
      const p = d.getWorldPosition(new THREE.Vector3()).project(this.camera)
      return p.z > 1 ? null : { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }
    })
    const i = nearestWithin(at, { x: e.clientX, y: e.clientY }, FINGER_REACH_PX)
    return i < 0 ? undefined : { object: dots[i], point: dots[i].getWorldPosition(new THREE.Vector3()) }
  }

  private ndcOf(e: PointerEvent): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect()
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  }

  /** Arrange: a handle of the selected piece, else a piece (selects it), else empty space (walk: look around). */
  private arrangeDown(e: PointerEvent): void {
    const ndc = this.ndcOf(e)
    this.raycaster.setFromCamera(ndc, this.camera)
    const pivot = this.selBox.parent
    const dots = this.selBox.children.filter((c) => c.userData.handle)
    const h = pivot && (this.raycaster.intersectObjects(dots, false)[0] ?? this.dotInReach(e, dots))
    if (pivot && h) {
      const handle = h.object.userData.handle as Handle
      const box = this.selBox.userData.box as THREE.Box3
      // measured in the piece's frame as it was grabbed (it shifts while one face moves); sides on their level, the top on an upright plane facing us
      const n = handle.axis === 'y' ? this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize() : UP
      this.grab = {
        id: pivot.userData.id,
        y: h.point.y,
        off: { x: 0, y: 0 },
        moved: false,
        handle: {
          ...handle,
          inv: pivot.matrixWorld.clone().invert(),
          half: handle.axis === 'y' ? -box.min.y : (box.max[handle.axis] - box.min[handle.axis]) / 2,
          plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, h.point),
        },
      }
    } else {
      const hit = this.pick(ndc, true)
      const o = hit?.kind === 'furniture' ? this.pieceObject(hit.id.split('/')[0]) : undefined // a part → its piece
      if (!hit || !o) {
        if (this.mode === 'walk') this.look2 = { x: e.clientX, y: e.clientY }
        return
      }
      this.arrangeCb?.({ kind: 'select', id: o.userData.id })
      this.grab = { id: o.userData.id, y: hit.point.y, off: { x: o.position.x - hit.point.x, y: o.position.z - hit.point.z }, moved: false }
    }
    this.orbit.enabled = false // the piece moves, not the dollhouse camera
    this.canvas.setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.plc.isLocked) this.pointerNdc = this.ndcOf(e) // locked: the client position is frozen, the crosshair aims
    if (this.mode === 'building' && e.pointerType === 'mouse' && !this.hand) {
      if (e.buttons) this.setTowerHover(null) // turning or sliding the tower: no card
      else this.queueHover(e.clientX, e.clientY)
    }
    if (this.look2) {
      // grab-the-room look (no pointer lock while arranging)
      const eu = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
      eu.y += (e.clientX - this.look2.x) * 0.004
      eu.x = THREE.MathUtils.clamp(eu.x + (e.clientY - this.look2.y) * 0.004, -1.4, 1.4)
      this.camera.quaternion.setFromEuler(eu)
      this.look2 = { x: e.clientX, y: e.clientY }
      return
    }
    const og = this.opGrab
    if (og) {
      const d = this.pointerDown
      if (!og.moved && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= CLICK_PX) return
      og.moved = true
      if (og.line) {
        // a low wall: the point on the line nearest the pointer's ray (any view angle; ±100 m of line)
        this.raycaster.setFromCamera(this.ndcOf(e), this.camera)
        const { o, d } = og.line
        const P = new THREE.Vector3()
        this.raycaster.ray.distanceSqToSegment(o.clone().addScaledVector(d, -100), o.clone().addScaledVector(d, 100), undefined, P)
        if (og.end === 'a' || og.end === 'b') this.openingCb?.({ kind: 'wall-end', id: og.id, end: og.end, at: { x: P.x, y: P.z }, rigid: !!og.rigid })
        else this.openingCb?.({ kind: 'wall-move', id: og.id, dM: P.sub(o).dot(d) })
        return
      }
      const p = this.alongWall(this.ndcOf(e), og.wallId) // along ITS wall, at any angle
      if (p) this.openingCb?.(og.end ? { kind: 'resize', id: og.id, end: og.end, uM: og.end === 'top' || og.end === 'sill' ? p.v : p.u } : { kind: 'slide', id: og.id, offsetM: p.u - og.off })
      return
    }
    if (this.hand) {
      if (!e.buttons) this.aimHand() // the Building view too: a piece from the library onto the flat's outside (session 31)
      return
    }
    const g = this.grab
    const d = this.pointerDown
    if (!g || (!g.moved && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= CLICK_PX)) return
    g.moved = true
    if (g.handle) {
      this.raycaster.setFromCamera(this.ndcOf(e), this.camera)
      const P = this.raycaster.ray.intersectPlane(g.handle.plane, new THREE.Vector3())?.applyMatrix4(g.handle.inv)
      const { axis, sign, half } = g.handle
      if (P) this.arrangeCb?.({ kind: 'resize', id: g.id, axis, sign, sizeM: axis === 'y' ? P.y + half : sign * P[axis] + half })
      return
    }
    this.dragEvent(this.ndcOf(e), g.id, g.y, g.off)
  }

  /**
   * A `drag` of piece `id` to the pointer at `ndc`: `at` on the plane at height y (plus the grab offset), `wall` the face
   * toward us of the wall under it — its window, door or reveal counts as the wall (the TV never goes through a window
   * onto the veranda's wall). `stopAtWalls` (the hand): a wall nearer than the plane point stops `at` 0.3 m before it.
   */
  private dragEvent(ndc: THREE.Vector2, id: Id, y: number, off: Pt, stopAtWalls = false): void {
    this.raycaster.setFromCamera(ndc, this.camera)
    const ray = this.raycaster.ray
    const P = ray.intersectPlane(new THREE.Plane(UP, -y), new THREE.Vector3())
    let wall: { p: Pt; n: Pt; y: number } | null = null
    let dist = Infinity
    for (const h of this.raycaster.intersectObjects(this.staticGroup.children, true)) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.kind) o = o.parent
      const wallId = o?.userData.kind === 'wall' ? o.userData.id : o?.userData.kind === 'opening' ? o.userData.wallId : null
      const f = wallId && this.wallFrames.get(wallId)
      const w = wallId && this.unit?.walls.find((x) => x.id === wallId)
      if (!f || !w) continue
      const s = f.normal.x * ray.direction.x + f.normal.y * ray.direction.z < 0 ? 1 : -1
      const n = { x: s * f.normal.x, y: s * f.normal.y }
      const k = w.thicknessM / 2 - ((h.point.x - f.origin.x) * n.x + (h.point.z - f.origin.y) * n.y) // onto the face
      const p = { x: h.point.x + n.x * k, y: h.point.z + n.y * k }
      wall = { p, n, y: h.point.y - this.levelAt({ x: p.x + n.x * 0.1, y: p.y + n.y * 0.1 }) } // y: above the floor in front of it
      dist = h.distance
      break
    }
    // the doorway / passage the pointer looks through, nearer than what it meets beyond: new curtains hang on it
    let hole: { p: Pt; n: Pt } | null = null
    let near = dist
    for (const w of this.unit?.walls ?? []) {
      const a = w.openings.length && !w.id.startsWith(GAP_PREFIX) ? this.alongWall(ndc, w.id) : null
      const f = this.wallFrames.get(w.id)
      if (!a || !f || a.d >= near || !w.openings.some((o) => a.u >= o.offsetM && a.u <= o.offsetM + o.widthM && a.v >= o.sillM && a.v <= o.sillM + o.heightM)) continue
      const s = f.normal.x * ray.direction.x + f.normal.y * ray.direction.z < 0 ? 1 : -1
      const k = (s * w.thicknessM) / 2
      hole = { p: { x: f.origin.x + f.dir.x * a.u + f.normal.x * k, y: f.origin.y + f.dir.y * a.u + f.normal.y * k }, n: { x: s * f.normal.x, y: s * f.normal.y } }
      near = a.d
    }
    let at = P && { x: P.x + off.x, y: P.z + off.y }
    if (stopAtWalls && wall && (!P || dist < ray.origin.distanceTo(P))) at = { x: wall.p.x + wall.n.x * 0.3, y: wall.p.y + wall.n.y * 0.3 }
    // a table lamp in hand goes where the pointer meets the top of a piece (a desk, a bedside: it stands on it, bottomOf),
    // not the floor point far behind that top
    if (this.hand?.id === id && kitAsset(this.layout.find((p) => p.id === id)?.assetId ?? '')?.onTop) {
      const top = this.raycaster.intersectObjects(this.furnitureGroup.children, true).find((h) => {
        let o: THREE.Object3D | null = h.object
        while (o && o.userData.kind !== 'furniture') o = o.parent
        const mine = o?.userData.id === id || String(o?.userData.id).startsWith(`${id}/`)
        return !mine && h.face && h.distance < dist && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.7
      })
      if (top) at = { x: top.point.x, y: top.point.z }
    }
    this.arrangeCb?.({ kind: 'drag', id, at, wall, hole })
  }

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.pointerDown
    const click = !!d && isClick({ dx: e.clientX - d.x, dy: e.clientY - d.y, ms: e.timeStamp - d.t, finger: e.pointerType !== 'mouse', multi: this.multi })
    this.fingers.delete(e.pointerId)
    if (!this.fingers.size) this.multi = false
    this.pointerDown = null
    if (this.editingOpenings && this.mode !== 'building') {
      const g = this.opGrab
      this.opGrab = this.look2 = null
      this.orbit.enabled = this.mode !== 'walk'
      if (g?.moved) this.openingCb?.({ kind: 'drop', id: g.id })
      else if (!g && click) this.openingCb?.({ kind: 'select', id: null })
      return
    }
    if (this.hand) {
      this.look2 = null
      if (click) {
        this.aimHand() // where the click is (the crosshair while locked), then drop there
        this.arrangeCb?.({ kind: 'drop', id: this.hand.id })
      }
      return
    }
    if (this.arranging && this.mode !== 'building') {
      const g = this.grab
      this.grab = this.look2 = null
      this.orbit.enabled = this.mode !== 'walk'
      // a dragged piece stays in hand until the drop fits (ask 10: a refused spot keeps it, red); the handler lets go
      if (g?.moved && !g.handle) this.hand = { id: g.id, y: g.y, off: g.off }
      if (g?.moved) this.arrangeCb?.({ kind: 'drop', id: g.id })
      else if (!g && click) this.arrangeCb?.({ kind: 'select', id: null })
      return
    }
    this.look2 = null // a finger's look ends
    if (!click) return // a drag, a long press or a pinch: not a click
    const ndc = new THREE.Vector2(0, 0)
    if (!this.plc.isLocked) {
      const r = this.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    if (this.mode === 'building') {
      const at = { x: e.clientX, y: e.clientY }
      const hit = this.towerAt(at.x, at.y)
      // a finger: the first tap shows the card (and the wash), a second on the same floor and flat opens it
      if (e.pointerType !== 'mouse' && !(hit && hit.k === this.armed?.k && hit.flat?.stem === this.armed.flat?.stem)) {
        this.armed = hit
        this.setTowerHover(hit, at)
        return
      }
      this.armed = null
      this.flatCb?.(hit)
      return
    }
    const hit = this.pick(ndc)
    const used = this.pickCb?.(hit)
    if (!used && hit?.kind === 'floor' && this.mode === 'walk' && !this.plc.isLocked) {
      this.moveTarget = { x: hit.point.x, y: hit.point.z }
    }
  }

  private onDblClick = (): void => this.lockPointer()

  /** `piece`: looking for a piece of furniture (Edit furniture, G) — through a window's or a door's glass, as the eye sees it. */
  private pick(ndc: THREE.Vector2, piece = false): PickHit | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    // three's raycaster ignores `visible`: skip the hidden ceilings (and what hangs from them) in the dollhouse
    const targets = [this.staticGroup, this.ceilingGroup, this.furnitureGroup].filter((g) => g.visible)
    const hits = this.raycaster.intersectObjects(targets, true)
    for (const [i, h] of hits.entries()) {
      const o = pickedAt(h, piece)
      if (!o) continue
      let { kind, id, wallId, objectKind } = o.userData as { kind: PickKind; id: Id; wallId?: Id; objectKind: ObjectKind }
      const { roomId, front, back, label } = o.userData as { roomId?: Id; front?: Id | null; back?: Id | null; label: string }
      // a gap's stand-in wall and its casing (details.ts closeGaps) are no entity of the plan: picked as the wall the gap continues
      const gap = [id, wallId].find((x) => x?.startsWith(GAP_PREFIX))
      if (gap) [kind, id, wallId, objectKind] = ['wall', gap.slice(GAP_PREFIX.length).split('|')[0], undefined, 'wall']
      const P = h.point
      const hit: PickHit = { kind, id, label, objectKind, point: { x: P.x, y: P.y, z: P.z } }
      if (roomId) hit.roomId = roomId
      const f = this.wallFrames.get(kind === 'wall' ? id : (wallId ?? ''))
      if (f) {
        const dx = P.x - f.origin.x
        const dz = P.z - f.origin.y
        hit.localOffset = { u: dx * f.dir.x + dz * f.dir.y, v: P.y }
        if (kind === 'wall') {
          hit.roomId = (dx * f.normal.x + dz * f.normal.y >= 0 ? front : back) ?? undefined
          const room = this.rooms.find((r) => r.id === hit.roomId)
          if (room) hit.label = `${room.name} wall`
        }
      } else if (kind === 'furniture') {
        const l = o.worldToLocal(P.clone())
        hit.localOffset = { u: l.x, v: l.z }
        const f = floorBehind(hits, i, piece)
        if (f) hit.under = { x: f.x, y: f.y, z: f.z }
      } else {
        hit.localOffset = { u: P.x, v: P.z }
      }
      return hit
    }
    return null
  }

  /** True when p is within WALK_RADIUS of any wall segment outside a door/passage. */
  private blocked(p: Pt): boolean {
    const unit = this.unit!
    for (const w of unit.walls) {
      if (w.heightM <= KERB_M) continue // a flush line (a zone's edge) is walked across, a kerb stepped over
      const a = core.vertexById(unit.vertices, w.a)
      const b = core.vertexById(unit.vertices, w.b)
      const dx = b.x - a.x
      const dy = b.y - a.y
      const L2 = dx * dx + dy * dy || 1e-9
      const t = THREE.MathUtils.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1)
      const dist = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
      if (dist >= WALK_RADIUS) continue
      const u = t * Math.sqrt(L2)
      const passable = w.openings.some((o) => o.kind !== 'window' && u >= o.offsetM && u <= o.offsetM + o.widthM)
      if (!passable) return true
    }
    return false
  }

  /**
   * A step from the walker to p across floor levels: up or down a step of at most MAX_STEP_M (a kerb, a plinth, the lobby's
   * steps — climbed like a stair), never further (a sunken generator yard, a retaining edge), never into a pool.
   */
  private canStep(p: Pt): boolean {
    if (core.roomAt(p, this.rooms, this.unit!)?.kind === 'pool') return false
    return Math.abs(this.walkLevel(p) - this.walkLevel(this.walker)) <= MAX_STEP_M
  }

  /**
   * A step onto a stair's flight B (stairs.ts 'between'): from its half landing he goes up, from its floor down — the next
   * floor loads (stairCb). With no floor that way, or over the rail from mid-flight, the step is refused. True: handled.
   * Over a hole (wells) the way down is walked: onto the flight below from this floor, down it tread by tread (canStep), and
   * the step off its foot toward its half landing takes him to the floor below.
   */
  private toNextFloor(next: Pt): boolean {
    const to = this.stairAt(next)
    const from = this.stairAt(this.walker)
    const well = (s: FurniturePlacement) => this.wells.some((w) => w.id === s.id)
    const below = from?.spot.part === 'between' && well(from.stair)
    if (below ? to?.stair !== from.stair || to.spot.part !== 'landing' : to?.spot.part !== 'between' || from?.spot.part === 'between') return false
    const stair = to!.stair
    const h = this.walkLevel(this.walker) - this.floorOf(stair)
    if (!below && h < 0.05 && well(stair)) return false // from this floor onto the flight below: walked
    // the way the flight runs: up toward its front from the landing, down toward its back from the floor (not a step in from its side)
    const t = (stair.rotationDeg * Math.PI) / 180
    const ahead = ((next.x - this.walker.x) * -Math.sin(t) + (next.y - this.walker.y) * Math.cos(t)) / (Math.hypot(next.x - this.walker.x, next.y - this.walker.y) || 1)
    const dir = below ? (ahead < -0.3 ? 'down' : null) : h > LANDING_M - 0.05 && ahead > 0.3 ? 'up' : h < 0.05 && ahead < -0.3 ? 'down' : null
    const now = performance.now()
    if (dir && now - this.stairAsked > 1000) this.stairAsked = this.stairCb?.(dir, stair) ? Infinity : now // going: not asked again until that floor is in (setUnit)
    return true
  }

  private tryMove(vx: number, vz: number): void {
    const next = { x: this.walker.x + vx, y: this.walker.y + vz }
    if (this.toNextFloor(next)) return
    const ok = (p: Pt) => !this.blocked(p) && this.canStep(p)
    if (ok(next)) {
      this.walker = next
      return
    }
    // slide: project the step onto the nearest wall's direction (a wall that stops him: never a flush line or a kerb)
    const nw = core.nearestWall(next, this.solid)
    if (!nw) return
    const { dir } = core.wallFrame(nw.wall, this.unit!.vertices)
    const along = vx * dir.x + vz * dir.y
    const slide = { x: this.walker.x + dir.x * along, y: this.walker.y + dir.y * along }
    if (ok(slide)) this.walker = slide
  }

  private tick = (): void => {
    this.xr?.update()
    this.timer.update()
    const raw = this.timer.getDelta()
    const dt = Math.min(raw, 0.1)
    if (this.mode !== 'walk') {
      this.orbit.update()
      const b = this.mode === 'building' ? this.shown : null
      if (b) {
        this.camera.position.y = Math.max(this.camera.position.y, b.minCameraY)
        b.update(this.camera.position) // the nearest flats first; Low's furnished storeys
      }
      // the site's blocks between the camera and the tower / the flat are cut away (context.siteCut)
      const reach = b ? b.box.getSize(SIZE).length() / 2 : this.radius
      siteCut.value = Math.max(0, this.camera.position.distanceTo(this.orbit.target) - reach)
    } else if (this.ready && !this.holding) {
      const k = this.keys
      if (!this.plc.isLocked) {
        // arrows turn when the mouse isn't captured (tablet keyboards / no-lock use)
        const turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0)
        if (turn) {
          const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
          e.y += turn * 1.8 * dt
          this.camera.quaternion.setFromEuler(e)
        }
      }
      const fwd = this.camera.getWorldDirection(new THREE.Vector3())
      fwd.y = 0
      fwd.normalize()
      const right = new THREE.Vector3().crossVectors(fwd, UP)
      const v = new THREE.Vector3()
      if (k.has('w') || k.has('arrowup')) v.add(fwd)
      if (k.has('s') || k.has('arrowdown')) v.sub(fwd)
      if (k.has('a') || (this.plc.isLocked && k.has('arrowleft'))) v.sub(right)
      if (k.has('d') || (this.plc.isLocked && k.has('arrowright'))) v.add(right)
      if (v.lengthSq() > 0) {
        this.moveTarget = null
        v.normalize().multiplyScalar((k.has('shift') ? 4 : 1.8) * dt)
        this.tryMove(v.x, v.z)
      } else if (this.moveTarget) {
        const dx = this.moveTarget.x - this.walker.x
        const dz = this.moveTarget.y - this.walker.y
        const d = Math.hypot(dx, dz)
        if (d < 0.05) this.moveTarget = null
        else {
          const step = Math.min(d, 3 * dt)
          const before = this.walker
          this.tryMove((dx / d) * step, (dz / d) * step)
          if (before === this.walker) this.moveTarget = null // stuck against a wall
        }
      }
      // the eye follows the floor: eased (≈ 0.1 s), so a step is climbed like a stair and a ramp is walked, never a jump
      this.floorY += (this.walkLevel(this.walker) - this.floorY) * (1 - Math.exp(-dt / 0.1))
      this.rig.position.set(this.walker.x, this.floorY, this.walker.y)
      // out of the room a narrower lens was for (spawnAt): the walk's again, eased over ~0.3 s
      if (this.lens && this.unit && core.roomAt(this.walker, this.rooms, this.unit)?.id !== this.lens.roomId) {
        const c = this.camera
        c.fov += (WALK_FOV - c.fov) * (1 - Math.exp(-dt / 0.1))
        if (WALK_FOV - c.fov < 0.05) (c.fov = WALK_FOV), (this.lens = null)
        c.updateProjectionMatrix()
        this.wake()
      }
    }
    WATER.normalMap!.offset.x += dt * 0.012 // the pools' ripple drifts
    this.wind?.update(dt)
    if (this.hand) this.aimHand() // the piece in hand stays under the crosshair / pointer as he walks and looks (or turns the tower)
    const now = performance.now()
    if (this.veiled) return this.prepare(now)
    const pose = this.poseKey()
    const moved = pose !== this.lastPose
    this.lastPose = pose
    const xr = this.renderer.xr.isPresenting
    if (!needsFrame({ tier: this.tier, xr, moved, now, wakeUntil: this.wakeUntil, animating: !!this.wind })) {
      this.drewLast = false
      // asleep: no frame callback at all until wake() — not with VR switched on (three's loop hands over to the headset's)
      if (!this.renderer.xr.enabled) {
        this.sleeping = true
        this.renderer.setAnimationLoop(null)
      }
      return
    }
    if (this.drewLast && !xr && this.ready && !this.holding) this.sample(raw * 1000, now) // (a stair's floor getting ready: frames slow on purpose)
    if (this.drewLast) this.recent.push(raw * 1000) > 60 && this.recent.shift() // the stats card: frames drawn back to back
    this.renderer.info.reset() // a frame's whole count (High's composer draws in several passes; the shadow maps' too)
    this.look.render()
    this.drewLast = true
    if (now > this.nextErrorCheck) {
      // a texture or buffer the GPU had no room for: three never asks, the picture just goes missing
      this.nextErrorCheck = now + 1000
      const gl = this.renderer.getContext()
      if (gl.getError() === gl.OUT_OF_MEMORY) this.failCb?.('memory')
    }
  }

  /** the last 60 frame times (ms) drawn back to back: the stats card's median */
  private readonly recent: number[] = []

  /**
   * What the stats card (`?stats=1`, ⋯ → How fast is it here?) shows: the median of the last 60 frames drawn back to back
   * (ms; null before two), and the last frame's draw calls and triangles (shadow maps included), the shader programs, the
   * pictures on the graphics chip (MB, about: each one's pixels × 4 bytes, + a third for its smaller copies; the lighting's
   * at 8 bytes a pixel), the pixels drawn.
   */
  stats(): { ms: number | null; calls: number; triangles: number; programs: number; textureMB: number; width: number; height: number } {
    const r = this.renderer
    const v = [...this.recent].sort((a, b) => a - b)
    const seen = new Set<THREE.Texture>()
    const add = (t: unknown) => t instanceof THREE.Texture && seen.add(t)
    this.scene.traverse((o) => {
      for (const m of [(o as THREE.Mesh).material ?? []].flat()) for (const x of Object.values(m)) add(x)
    })
    add(this.scene.environment)
    let bytes = 0
    const cap = r.capabilities.maxTextureSize
    for (const t of seen) {
      const img = t.image as { width?: number; height?: number } | null
      if (!img?.width || !img.height) continue
      const k = Math.min(1, cap / Math.max(img.width, img.height))
      const px = img.width * k * img.height * k * ((t as THREE.CubeTexture).isCubeTexture ? 6 : 1)
      bytes += px * (t.type === THREE.HalfFloatType || t.type === THREE.FloatType ? 8 : 4) * (t.generateMipmaps || t.mipmaps?.length ? 4 / 3 : 1)
    }
    const size = r.getDrawingBufferSize(new THREE.Vector2())
    return { ms: v.length > 1 ? v[v.length >> 1] : null, calls: r.info.render.calls, triangles: r.info.render.triangles, programs: r.info.programs?.length ?? 0, textureMB: bytes / 1048576, width: size.x, height: size.y }
  }

  /** The camera's world pose and lens, rounded (0.1 mm, 1e-4): an eased step or orbit damping settles instead of drawing on. */
  private poseKey(): number {
    this.camera.updateWorldMatrix(true, false)
    const e = this.camera.matrixWorld.elements
    const p = this.camera.projectionMatrix.elements
    let k = Math.round(p[0] * 1e4) + 3 * Math.round(p[5] * 1e4)
    for (let i = 0; i < 16; i++) k += (i + 5) * Math.round(e[i] * 1e4)
    return k
  }

  /**
   * one frame time (drawn right after another, the page in view), from WARM_MS after the furniture loaded, not while the
   * Building view's tower is still filling in its rooms (loading work, not drawing); judged once (render.ts slowFrames)
   */
  private sample(ms: number, now: number): void {
    if (!this.frameMs || !this.loadedAt || now < this.loadedAt + WARM_MS || ms > LOST_FRAME_MS || document.visibilityState === 'hidden') return
    if (this.mode === 'building' && this.building?.busy) return
    this.frameMs.push(ms)
    const slow = slowFrames(this.frameMs)
    if (slow === null) return
    this.frameMs = null
    if (slow) this.slowCb?.()
  }
}
