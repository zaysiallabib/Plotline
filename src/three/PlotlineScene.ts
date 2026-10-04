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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { XRControls } from './xr'
import { Building, type FlatRef } from './building'
import * as core from '../core'
import type { Configuration, FinishSlot, FurniturePlacement, Id, MaterialRef, Pillar, Pt, Room, Unit, Wall } from '../core'
import { kitAsset, type ObjectKind } from '../furnish/kit'
import { HDRI } from '../furnish/textures'
import { GAP_PREFIX, KERB_M, bayMarkings, buildSkirtings, closeGaps, dressOpening, liftWall, liftedWall, pillarParts, poolBasin, raiseHeads, roomCeiling, stepFaces, storeyTop, wallGeometry, wallLift, type WallLift } from './details'
import { bakeDaylight, mapDaylight, setDaylight, type Daylight } from './daylight'
import { buildFurniture } from './furniture'
import { CONCRETE, EDGE_PLASTER, materialFor, resolveFinish, setMaxAnisotropy, zoneFinishRef } from './materials'
import { PANES, WATER } from './openings'
import { Look, type Quality } from './render'

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
}
/** orbit = the dollhouse; building = the whole tower from outside (building.ts) */
export type SceneMode = 'walk' | 'orbit' | 'building'
/**
 * Arrange (staff, src/viewer/arrange.ts): what the pointer does to a piece, in plan metres. `drag`: `at` = the piece's
 * centre on the horizontal plane it was grabbed at, `wall` = the wall face under the pointer (normal toward the viewer).
 * `resize`: a handle dragged — the new size along `axis`, the `sign` face moving.
 */
export type ArrangeEvent =
  | { kind: 'select'; id: Id | null }
  | { kind: 'drag'; id: Id; at: Pt | null; wall: { p: Pt; n: Pt } | null }
  | { kind: 'resize'; id: Id; axis: 'x' | 'y' | 'z'; sign: 1 | -1; sizeM: number }
  | { kind: 'drop'; id: Id }
/**
 * Edit openings (staff): `select` a door / window / slider / passage (null: empty space); `slide` = its body dragged, the
 * offset (m from its wall's corner A) the pointer asks for; `resize` = an end dot dragged to uM along the wall; `drop` ends
 * the gesture. The Studio reducer (model.ts drag-opening / resize-opening) applies its rules to these.
 */
export type OpeningEvent =
  | { kind: 'select'; id: Id | null }
  | { kind: 'slide'; id: Id; offsetM: number }
  | { kind: 'resize'; id: Id; end: 'a' | 'b' | 'top' | 'sill'; uM: number }
  | { kind: 'drop'; id: Id }
type Handle = { axis: 'x' | 'y' | 'z'; sign: 1 | -1 }
/** Without deleted pieces (tombstones: built hidden, so an undo shows them again; never lit, shadowed or picked). */
const present = (u: Unit): Unit => (u.furniture.some((p) => p.removed) ? { ...u, furniture: u.furniture.filter((p) => !p.removed) } : u)
const SEL = '#39a0ff'
const REFUSED = '#ff4d4d'

/** Eye height (m): a Dhaka buyer's standing eye and the real-estate camera height; viewer/frame.ts EYE mirrors it. Was 1.6: rooms read cramped. */
const EYE = 1.45
const WALK_RADIUS = 0.3
/** A wall this tall is a storey wall (not a parapet, a screen, a planter edge): under the slab above it reaches it. */
const STOREY_WALL_M = 2.4
/** The tallest step the walker takes, up or down (canStep). */
const MAX_STEP_M = 0.8
const UP = new THREE.Vector3(0, 1, 0)
const DHAKA_LAT = THREE.MathUtils.degToRad(23.8)

/**
 * The interior HDRI is a photo studio lit from one side: a wall facing world +X got irradiance 1.29, −X 0.78,
 * +Z 0.81, −Z 1.03, so a room's walls went light or dark with their compass bearing, not with their windows
 * (Type A at 15:30: Bed-1 walls 214–225 sRGB, living 186–193). Averaged over four quarter turns about the
 * vertical (half-float RGBA equirect, in place), every wall bearing gets the same fill; floor vs ceiling stays.
 */
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

/** Road-marking paint on a parking floor: pulled forward in depth so it never fights the floor under it. */
const PAINT = new THREE.MeshStandardMaterial({ color: '#e9e7e1', roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
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

interface Surface {
  mesh: THREE.Mesh
  /** one entry per material slot; null = fixed edge plaster; `edge` = the finish in its depth-offset variant (wall ends and tops) */
  /** `ref`: a fixed material by rule (a kerb's concrete, a zone's riser), not the room's finish */
  sides: ({ roomId: Id | null; target: FinishSlot['target']; edge?: true; ref?: MaterialRef } | null)[]
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
  private unit: Unit | null = null
  private rooms: Room[] = []
  private cfg: Configuration = {}
  private ready = false
  private buildToken = 0
  private mode: SceneMode = 'walk'
  private hour = 13
  private walker: Pt = { x: 0, y: 0 }
  /** the floor under the walker, eased toward levelAt(walker): a step is climbed like a stair, not a jump */
  private floorY = 0
  /** the storey's top (details.ts storeyTop): the slab above, where a covered storey wall reaches */
  private top = 3.048
  /** each wall's floors (details.ts wallLift) */
  private lifts = new Map<Id, WallLift>()
  /** the walls that stop the walker (not the flush lines and kerbs): what a blocked step slides along */
  private solid: Pick<Unit, 'vertices' | 'walls'> = { vertices: [], walls: [] }
  private yaw = 0
  private moveTarget: Pt | null = null
  private center = new THREE.Vector3()
  private radius = 10
  private pickCb: ((hit: PickHit | null) => void) | null = null
  private pointerDown: { x: number; y: number } | null = null
  /** built on the first switch to the Building view; hidden in walk / dollhouse */
  private building: Building | null = null
  private flatCb: ((flat: FlatRef | null) => void) | null = null
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
  private readonly selMat = new THREE.MeshBasicMaterial({ color: SEL, depthTest: false, transparent: true, opacity: 0.9 })
  private readonly selFoot = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: SEL, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }))
  // Edit openings (staff): the mouse stays free as in Arrange; a grab slides the opening along its wall or moves one end
  private editingOpenings = false
  private openingCb: ((e: OpeningEvent) => void) | null = null
  private opGrab: { id: Id; wallId: Id; end?: 'a' | 'b' | 'top' | 'sill'; off: number; moved: boolean } | null = null
  /** the selected opening's outline and its two end dots, in its wall's frame (seen through walls) */
  private readonly opBox = new THREE.Group()
  /**
   * Where a slab hangs over this unit (plan polygons in the unit's frame, at its storey height): the footprint of the
   * floor above when the unit is a level of a tower (a basement under the ground floor, a ground floor under the flats).
   * Set BEFORE setUnit. Under it an outdoor zone is covered: a soffit, no sky in the daylight, lit by rule. Empty = open sky.
   */
  cover: Pt[][] = []

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: { quality?: Quality } = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy())

    this.camera = new THREE.PerspectiveCamera(65, 1, 0.05, 300)
    this.camera.position.y = EYE
    this.rig.add(this.camera)
    this.scene.add(this.rig, this.staticGroup, this.ceilingGroup, this.furnitureGroup)

    // tone mapping, shadows, hemisphere, post, exterior: see render.ts
    this.look = new Look(this.renderer, this.scene, this.camera, this.sun, opts.quality ?? 'high')
    this.scene.add(this.sun, this.sun.target)
    void this.loadEnvironment()
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)

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
    this.scene.add(this.selFoot, this.opBox)

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
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
    unit = raiseHeads(unit) // a window on a 1.1 m wall: the wall reaches the storey, as the bake, the curtains and the ceiling see it
    unit = closeGaps(unit) // two wall ends in line with a gap: a cased opening on a stand-in wall (same rooms)
    this.ready = false
    const kept = keepView ? [this.furnitureGroup, this.ceilingGroup].flatMap((g) => g.children.filter((o) => o.userData.kind === 'furniture').map((o) => [g, o] as const)) : []
    for (const [, o] of kept) o.removeFromParent() // out of clearStatic's reach
    this.clearStatic()
    this.unit = unit
    this.rooms = core.deriveRooms(unit)
    const b = core.unitBounds(unit)
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2)
    this.radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 1

    this.lifts = new Map(unit.walls.map((w) => [w.id, wallLift(w, unit, this.rooms)]))
    this.solid = { vertices: unit.vertices, walls: unit.walls.filter((w) => w.heightM > KERB_M) }
    this.top = storeyTop(unit, this.rooms) || 3.048
    for (const wall of unit.walls) this.buildWall(wall, unit)
    for (const room of this.rooms) this.buildRoom(room, unit)
    this.buildMarkings(unit)
    // skirting follows the built wall feet (details.ts skirtingRuns), one mesh per room in its floor finish, on its floor
    for (const [roomId, mesh] of buildSkirtings(unit, this.rooms)) {
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
    // indirect light × where the sky reaches (daylight.ts)
    const day = bakeDaylight(unit, this.rooms, this.cover)
    for (const s of this.surfaces) {
      const kind = s.mesh.userData.kind as 'wall' | 'floor' | 'ceiling' | undefined // skirting has none: it follows its floor
      mapDaylight(day, s.mesh.geometry, unit, kind ?? 'floor', kind ? s.mesh.userData.id : s.sides[0]!.roomId!)
      // the bake reads a wall on 0; then it stands on its floors (details.ts liftWall)
      const w = kind === 'wall' ? unit.walls.find((x) => x.id === s.mesh.userData.id) : undefined
      if (w) liftWall(s.mesh.geometry, w, unit, this.lifts.get(w.id)!, this.reachesSlab(w) ? this.top : undefined)
    }
    const storey = this.top
    for (const p of unit.pillars ?? []) this.buildPillar(p, unit, day, storey) // after the loop: each part maps its own daylight
    setDaylight(day)
    this.applyMaterials()
    this.look.setUnit(present(unit), this.rooms, this.cover) // fixtures, lights, slab, shadow fit box
    this.setTimeOfDay(this.hour)

    this.ready = true
    if (keepView) {
      for (const [g, o] of kept) g.add(o)
      return
    }
    const first = this.rooms[0]
    this.walker = first ? { ...first.centroid } : { x: this.center.x, y: this.center.z }
    this.floorY = this.levelAt(this.walker)
    this.moveTarget = null
    this.setMode(this.mode)
    void this.loadFurniture(unit)
  }

  /** slotId → optionId. Swaps materials only. */
  setConfiguration(cfg: Configuration): void {
    this.cfg = cfg
    this.applyMaterials()
  }

  /** 6..18. Simple equinox solar model at Dhaka latitude, rotated by unit.northDeg. */
  setTimeOfDay(hour: number): void {
    this.hour = hour
    const H = THREE.MathUtils.degToRad((hour - 12) * 15) // hour angle, + after noon
    // declination 0 (equinox): local ENU sun vector
    const e = -Math.sin(H)
    const n = -Math.sin(DHAKA_LAT) * Math.cos(H)
    const u = Math.cos(DHAKA_LAT) * Math.cos(H)
    // plan-up (−y) is world −Z; north = plan-up rotated clockwise by northDeg (plan y down)
    const th = THREE.MathUtils.degToRad(this.unit?.northDeg ?? 0)
    const N = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th))
    const E = new THREE.Vector3(Math.cos(th), 0, Math.sin(th))
    const dir = N.multiplyScalar(n).addScaledVector(E, e).addScaledVector(UP, u).normalize()
    const alt = THREE.MathUtils.clamp(u, 0, 1)
    this.sun.position.copy(this.center).addScaledVector(dir, 2 * this.radius + 30)
    this.sun.target.position.copy(this.center)
    // 10: direct sun ≈ 3× the ENV/HEMI fill on a floor. At 5.5 (before wave 6 lifted the fill) a patch added only
    // ≈ 1.8× and Neutral mapped it to a slightly lighter floor, not sun
    this.sun.intensity = 10 * Math.min(1, alt * 3)
    this.sun.color.set('#ff9a4a').lerp(new THREE.Color('#fff7ec'), Math.min(1, alt * 2.5))
    this.look.setHour(hour)
    if (this.mode === 'building') this.building?.setSun(this.sun)
  }

  setMode(mode: SceneMode): void {
    if (this.mode === 'walk' && mode !== 'walk') {
      this.yaw = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ').y
    }
    const tower = mode === 'building' || this.mode === 'building'
    this.mode = mode
    this.cutAbove(false) // a basement shown in the Building view: what stood above it is back
    this.ceilingGroup.visible = mode === 'walk'
    this.orbit.enabled = mode !== 'walk'
    if (mode !== 'walk') this.orbit.connect(this.canvas)
    else if (this.orbit.domElement) this.orbit.disconnect()
    if (mode === 'building' && this.unit && !this.building) {
      this.building = Building.for(this.unit)
      if (this.building) this.scene.add(this.building)
    }
    if (this.building) this.building.visible = mode === 'building'
    // Look's shadow catcher lies at this flat's slab: around the tower it would hang in mid-air
    const catcher = this.scene.children.find((o) => (o as THREE.Mesh).material instanceof THREE.ShadowMaterial) as THREE.Mesh | undefined
    if (catcher) (catcher.material as THREE.Material).visible = mode !== 'building'
    if (tower) this.setTimeOfDay(this.hour) // shadow box: the tower's, or back to the flat's
    if (mode !== 'walk') {
      if (this.plc.isLocked) this.plc.unlock()
      this.rig.position.set(0, 0, 0)
      const b = mode === 'building' ? this.building : null
      const v = b?.view(b.floor)
      b?.highlight(b.floor)
      this.camera.position.copy(v?.eye ?? this.center.clone().add(new THREE.Vector3(this.radius, this.radius * 1.3, this.radius)))
      this.orbit.target.copy(v?.target ?? this.center)
      this.orbit.update()
    } else {
      this.rig.position.set(this.walker.x, this.floorY, this.walker.y)
      this.camera.position.set(0, EYE, 0)
      this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'))
    }
  }

  /** Walker to the room centroid (eye height EYE). Switches to walk mode. */
  teleportTo(roomId: Id): void {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return
    this.walker = { ...room.centroid }
    this.floorY = this.levelAt(this.walker)
    this.moveTarget = null
    this.setMode('walk')
  }

  /** Walker to plan point p looking along yawRad (0 = plan −y, i.e. world −Z; positive turns left), pitchRad down when < 0. Switches to walk mode. */
  spawnAt(p: Pt, yawRad: number, pitchRad = 0): void {
    this.walker = { ...p }
    this.floorY = this.levelAt(p)
    this.yaw = yawRad
    this.moveTarget = null
    this.setMode('walk')
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitchRad, yawRad, 0, 'YXZ'))
  }

  /** Shuts the leaf of door `openingId` (a first frame's `closeLeaf`) and reopens the one shut before; null reopens only. */
  shutLeaf(openingId: Id | null): void {
    this.staticGroup.traverse((o) => {
      const pivot = o.userData.id?.endsWith('/leaf') ? o.parent : null // openings.ts: the leaf part hangs on its hinge pivot
      if (!pivot) return
      pivot.userData.ajar ??= pivot.rotation.y
      pivot.rotation.y = o.userData.id === `${openingId}/leaf` ? 0 : pivot.userData.ajar
    })
  }

  onPick(cb: (hit: PickHit | null) => void): void {
    this.pickCb = cb
  }

  /** Building view: a click on a flat (null: anything else). Replaces onPick there. */
  onFlat(cb: (flat: FlatRef | null) => void): void {
    this.flatCb = cb
  }

  /** Building view: highlight floor k (0 = ground, top + 1 = roof) and lift the orbit to it. */
  showFloor(k: number): void {
    const b = this.building
    if (!b || this.mode !== 'building') return
    const dy = b.levelOf(k) + 1.5 - this.orbit.target.y
    this.orbit.target.y += dy
    this.camera.position.y += dy
    b.highlight(k)
    this.cutAbove(b.cuts(k) && k < b.floor, k < 0)
  }

  /** A basement / his traced ground floor picked in the Building view: the furnished flat above it hidden, and under ground the street plane (building.ts hides its own floors above it). */
  private cutAbove(on: boolean, street = on): void {
    this.staticGroup.visible = this.furnitureGroup.visible = !on
    this.look.showGround(!street, !on)
  }

  currentRoomId(): Id | null {
    if (!this.ready || !this.unit) return null
    return core.roomAt(this.walker, this.rooms, this.unit)?.id ?? null
  }

  /** Enter pointer lock (mouse look). Must be called from a user gesture; dblclick on the canvas does this too. Never while arranging or editing openings. */
  lockPointer(): void {
    if (this.mode === 'walk' && !this.arranging && !this.editingOpenings) this.plc.lock()
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
    if (!h && this.grab && !this.grab.handle) this.grab = null // Esc mid-drag: the button's release must not pick it up again
    if (this.hand && this.mode !== 'building') this.aimHand()
  }

  /** The piece under the crosshair (mouse locked) or the pointer, as G picks it up; null: none, or something nearer hides it. */
  pieceUnderPointer(): Id | null {
    const hit = this.pick(this.aimNdc())
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
    for (const m of [this.selMat, this.selFoot.material, (this.selBox.userData.lines as THREE.LineSegments).material] as THREE.MeshBasicMaterial[]) m.color.set(color)
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
    if (all) {
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
      const size = JSON.stringify(p.sizeM ?? null)
      if (o.userData.size !== size) {
        void this.rebuildPiece(o, p, size)
        continue
      }
      o.position.x = p.x
      o.position.z = p.y
      const floor = this.floorOf(p) // moved onto another level: up or down with it
      o.position.y += floor - (o.userData.floorM ?? 0)
      o.userData.floorM = floor
      o.rotation.y = -THREE.MathUtils.degToRad(p.rotationDeg)
      o.userData.roomId = p.roomId
      o.visible = !p.removed
    }
  }

  /** Pieces being built for placePieces → where they should stand when done (null: left out of the layout since). */
  private readonly adding = new Map<Id, FurniturePlacement | null>()
  private async addPiece(p: FurniturePlacement): Promise<void> {
    const building = this.adding.has(p.id)
    this.adding.set(p.id, p)
    if (building) return
    const token = this.buildToken
    const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p))
    const now = this.adding.get(p.id)
    this.adding.delete(p.id)
    if (token !== this.buildToken || this.pieceObject(p.id)) return
    this.mountPiece(obj, p)
    obj.visible = false
    if (now) this.placePieces([now])
  }

  /** A committed layout (drop, turn, delete, undo, reset): every piece where it says, and the contact shadows and room lights follow. */
  setLayout(all: FurniturePlacement[]): void {
    this.placePieces(all, true)
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
    const [p, q, k] = [o.position.clone(), o.quaternion.clone(), o.scale.clone()]
    o.position.set(0, 0, 0)
    o.quaternion.identity()
    o.scale.set(1, 1, 1)
    o.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(o)
    o.position.copy(p)
    o.quaternion.copy(q)
    o.scale.copy(k)
    o.updateMatrixWorld(true)
    const lines = new THREE.Box3Helper(box, SEL)
    const lm = lines.material as THREE.LineBasicMaterial
    lm.depthTest = false // seen through the piece, the walls and the ceiling
    lm.transparent = true
    lines.renderOrder = 10
    lines.raycast = () => {} // a Line's 1 m pick threshold would catch every click near it
    this.selBox.add(lines)
    const c = box.getCenter(new THREE.Vector3())
    const at: [Handle, THREE.Vector3][] = [
      [{ axis: 'x', sign: 1 }, new THREE.Vector3(box.max.x, c.y, c.z)],
      [{ axis: 'x', sign: -1 }, new THREE.Vector3(box.min.x, c.y, c.z)],
      [{ axis: 'z', sign: 1 }, new THREE.Vector3(c.x, c.y, box.max.z)],
      [{ axis: 'z', sign: -1 }, new THREE.Vector3(c.x, c.y, box.min.z)],
      [{ axis: 'y', sign: 1 }, new THREE.Vector3(c.x, box.max.y, c.z)],
    ]
    for (const [h, v] of at.filter(([h]) => axes.includes(h.axis))) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8), this.selMat)
      m.position.copy(v)
      m.renderOrder = 11
      m.userData.handle = h
      this.selBox.add(m)
    }
    this.selBox.userData = { axes: axes.join(), axesList: axes, box, lines }
    o.add(this.selBox)
  }

  private async rebuildPiece(old: THREE.Object3D, p: FurniturePlacement, size: string): Promise<void> {
    old.userData.size = size // a newer size supersedes this build
    const token = this.buildToken
    const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p))
    const parent = old.parent
    if (token !== this.buildToken || !parent || old.userData.size !== size) return
    obj.userData.size = size
    obj.userData.floorM = this.floorOf(p)
    obj.visible = !p.removed
    const selected = this.selBox.parent === old
    if (selected) this.selBox.removeFromParent()
    parent.add(obj)
    old.removeFromParent()
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

  /** Outlines opening `id` (u from its wall's corner A, heights in m) with a dot on each end and on its head (a dot drag resizes it; a window's sill has one too); red while refused. null clears. */
  showOpening(s: { id: Id; wallId: Id; offsetM: number; widthM: number; heightM: number; sillM: number; refused: boolean } | null): void {
    this.opBox.traverse((o) => {
      ;(o as THREE.Mesh).geometry?.dispose()
      ;((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.()
    })
    this.opBox.clear()
    const f = s && this.wallFrames.get(s.wallId)
    const w = s && this.unit?.walls.find((x) => x.id === s.wallId)
    this.opBox.userData = { id: f && w ? s.id : undefined, wallId: s?.wallId }
    if (!s || !f || !w) return
    // the wall's own frame (any angle): u along it, v up, w across (buildWall's basis)
    this.opBox.matrixAutoUpdate = false
    this.opBox.matrix.makeBasis(new THREE.Vector3(f.dir.x, 0, f.dir.y), UP, new THREE.Vector3(f.normal.x, 0, f.normal.y)).setPosition(f.origin.x, 0, f.origin.y)
    const mat = { color: s.refused ? REFUSED : SEL, depthTest: false, transparent: true }
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.widthM, s.heightM, w.thicknessM + 0.04)), new THREE.LineBasicMaterial(mat))
    box.position.set(s.offsetM + s.widthM / 2, s.sillM + s.heightM / 2, 0)
    box.raycast = () => {}
    this.opBox.add(box)
    const window = w.openings.find((o) => o.id === s.id)?.kind === 'window' // only a window's bottom is off the floor
    for (const end of ['a', 'b', 'top', ...(window ? (['sill'] as const) : [])] as const) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 8), new THREE.MeshBasicMaterial({ ...mat, opacity: 0.9 }))
      const mid = s.offsetM + s.widthM / 2
      if (end === 'top' || end === 'sill') dot.position.set(mid, end === 'top' ? s.sillM + s.heightM : s.sillM, 0)
      else dot.position.set(end === 'a' ? s.offsetM : s.offsetM + s.widthM, s.sillM + s.heightM / 2, 0)
      dot.userData.end = end
      this.opBox.add(dot)
    }
    for (const c of this.opBox.children) c.renderOrder = 11
  }

  /** The vertical plane through wall `wallId`'s centre line, and u along it where the ray at `ndc` meets it (null: it does not). */
  private alongWall(ndc: THREE.Vector2, wallId: Id): { u: number; v: number; d: number } | null {
    const f = this.wallFrames.get(wallId)
    if (!f) return null
    this.raycaster.setFromCamera(ndc, this.camera)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(f.normal.x, 0, f.normal.y), new THREE.Vector3(f.origin.x, 0, f.origin.y))
    const P = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3())
    return P && { u: (P.x - f.origin.x) * f.dir.x + (P.z - f.origin.y) * f.dir.y, v: P.y, d: this.raycaster.ray.origin.distanceTo(P) }
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

  /** Edit openings: an end dot of the selected opening (resize), else an opening (selects it, slide), else empty space (walk: look around). */
  private openingDown(e: PointerEvent): void {
    const ndc = this.ndcOf(e)
    this.raycaster.setFromCamera(ndc, this.camera)
    const sel = this.opBox.userData as { id?: Id; wallId?: Id }
    const dot = sel.id && this.opBox.children.length ? this.raycaster.intersectObjects(this.opBox.children.filter((c) => c.userData.end), false)[0] : undefined
    if (dot && sel.id && sel.wallId) this.opGrab = { id: sel.id, wallId: sel.wallId, end: dot.object.userData.end, off: 0, moved: false }
    else {
      const o = this.openingAt(ndc)
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

  resize(): void {
    if (this.renderer.xr.isPresenting) return
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.look.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.ro.disconnect()
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('keyup', this.onKey)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    if (this.orbit.domElement) this.orbit.dispose()
    this.plc.dispose()
    this.showOpening(null)
    this.clearStatic()
    this.selFoot.geometry.dispose()
    ;(this.selFoot.material as THREE.Material).dispose()
    this.selMat.dispose()
    this.look.dispose()
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
    const geo = wallGeometry(liftedWall(wall, unit, lift), unit, back === null && front !== null ? 1 : 0) // its openings on the higher floor
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
      this.surfaces.push({
        mesh,
        sides: [
          { roomId: front, target: 'wall', ...kerb },
          { roomId: back, target: 'wall', ...kerb },
          { roomId: front ?? back, target: 'wall', edge: true, ...(planter ? { ref: CONCRETE } : kerb) },
        ],
      })
    }
    for (const o of wall.openings) {
      const t = (o.offsetM + o.widthM / 2) / (f.lengthM || 1) // on the wall's floor at its middle
      const parts = dressOpening(o, wall, unit, this.rooms)
      for (const p of parts) p.position.y += lift.base[0] + t * (lift.base[1] - lift.base[0])
      local.add(...parts)
    }
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
      this.surfaces.push({ mesh, sides: list.map((x) => (x.part === 'top' ? null : { roomId: x.room?.id ?? null, target: skirting ? 'floor' : 'wall' })) })
    }
  }

  private buildRoom(room: Room, unit: Unit): void {
    const poly = core.roomPolygon(room, unit)
    const tri = core.triangulate(poly)
    const pos = new Float32Array(poly.length * 3)
    const uv = new Float32Array(poly.length * 2)
    poly.forEach((p, i) => {
      pos.set([p.x, core.roomLevelAt(room, unit, p.x, p.y), p.y], i * 3) // its level; a ramp's vertices on its plane
      uv.set([p.x, p.y], i * 2)
    })
    const idx: number[] = []
    for (let i = 0; i < tri.length; i += 3) {
      const [a, b, c] = [tri[i], tri[i + 1], tri[i + 2]]
      const cross = (poly[b].x - poly[a].x) * (poly[c].y - poly[a].y) - (poly[b].y - poly[a].y) * (poly[c].x - poly[a].x)
      // world normal Y = -cross (plan y → world Z); keep it facing up
      idx.push(a, cross > 0 ? c : b, cross > 0 ? b : c)
    }
    const floorGeo = new THREE.BufferGeometry()
    floorGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    floorGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    floorGeo.setIndex(idx)
    floorGeo.computeVertexNormals()
    const floor = new THREE.Mesh(floorGeo)
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
    ceilGeo.setIndex([...idx].reverse())
    const top = this.ceilingOf(room.id) // flat, at its walls' top
    for (let i = 0; i < poly.length; i++) ceilGeo.attributes.position.setY(i, top)
    ceilGeo.computeVertexNormals()
    const ceiling = new THREE.Mesh(ceilGeo)
    ceiling.userData = { kind: 'ceiling', id: room.id, roomId: room.id, label: `${room.name} ceiling`, objectKind: 'ceiling' }
    this.ceilingGroup.add(ceiling)
    this.surfaces.push({ mesh: ceiling, sides: [{ roomId: room.id, target: 'ceiling' }] })
  }

  /** A parking level's paint (details.ts bayMarkings): the bay lines (one mesh) and each bay's number, flat on its floor. */
  private buildMarkings(unit: Unit): void {
    const { lines, numbers } = bayMarkings(unit, this.rooms)
    const pos: number[] = []
    for (const { a, b } of lines) {
      const [dx, dz] = [b[0] - a[0], b[2] - a[2]]
      const L = Math.hypot(dx, dz)
      if (L < 1e-3) continue
      const [nx, nz] = [(-dz / L) * 0.05, (dx / L) * 0.05] // 100 mm wide
      const up = 0.004
      const q = [[a[0] + nx, a[1] + up, a[2] + nz], [b[0] + nx, b[1] + up, b[2] + nz], [b[0] - nx, b[1] + up, b[2] - nz], [a[0] - nx, a[1] + up, a[2] - nz]]
      for (const t of [[0, 1, 2], [0, 2, 3]]) pos.push(...t.flatMap((k) => q[k])) // n is d turned left: facing up
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.computeVertexNormals()
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

  private applyMaterials(): void {
    if (!this.unit) return
    // wall ends and tops: pushed back in depth so they lose ties to the faces they meet (an end cap at a
    // junction sits edge-on against the room face and won the tie along it: a one-pixel hairline)
    const plaster = materialFor(EDGE_PLASTER, true, true)
    const zones = new Map(this.rooms.filter((r) => core.isOutdoor(r.kind)).map((r) => [r.id, r.kind]))
    for (const s of this.surfaces) {
      const mats = s.sides.map((side) => {
        if (!side) return plaster
        if (side.ref) return materialFor(side.ref, side.edge, true)
        const zone = side.roomId && zones.get(side.roomId) // an outdoor zone: no buyer finish, its look by kind (materials.ts)
        return zone ? materialFor(zoneFinishRef(zone, side.target), side.edge, true) : resolveFinish(this.unit!.finishSlots, this.cfg, side.roomId, side.target, true, side.edge)
      })
      s.mesh.material = mats.length === 1 ? mats[0] : mats
    }
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

  /** A storey wall (≥ STOREY_WALL_M) under the slab above (`cover`, by its middle) goes up to it, wherever it stands. */
  private reachesSlab(w: Wall): boolean {
    if (w.heightM < STOREY_WALL_M || !this.cover.length) return false
    const [a, b] = [core.vertexById(this.unit!.vertices, w.a), core.vertexById(this.unit!.vertices, w.b)]
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    return this.cover.some((c) => core.pointInPolygon(mid, c))
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

  private async loadFurniture(unit: Unit): Promise<void> {
    const token = this.buildToken
    const byDistance = [...unit.furniture].sort(
      (a, b) => Math.hypot(a.x - this.walker.x, a.y - this.walker.y) - Math.hypot(b.x - this.walker.x, b.y - this.walker.y),
    )
    for (const p of byDistance) {
      const obj = await buildFurniture(p, this.ceilingOf(p.roomId), this.floorOf(p))
      if (token !== this.buildToken) return // unit changed mid-load
      this.mountPiece(obj, p)
      obj.visible = !p.removed
    }
  }

  private mountPiece(obj: THREE.Object3D, p: FurniturePlacement): void {
    obj.userData.size = JSON.stringify(p.sizeM ?? null) // Arrange rebuilds a piece when this changes
    obj.userData.floorM = this.floorOf(p)
    // lights, fans and pendants hang from the ceiling: they go (hidden in the dollhouse) with it; a wall AC (mountY) stays
    const a = kitAsset(p.assetId)
    ;(a?.mount === 'ceiling' && a.mountY === undefined ? this.ceilingGroup : this.furnitureGroup).add(obj)
  }

  private async loadEnvironment(): Promise<void> {
    const load = (url: string) =>
      new HDRLoader().loadAsync(url).catch(() => {
        console.warn(`[plotline] HDRI missing: ${url}`)
        return null
      })
    const [hdr, sky] = await Promise.all([load(HDRI.interior), load(HDRI.sky)])
    if (this.disposed) return // a disposed renderer must not touch the shared GL context again
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    if (hdr) evenBearings(hdr)
    this.scene.environment = hdr ? pmrem.fromEquirectangular(hdr).texture : pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    hdr?.dispose()
    if (sky) {
      clampSun(sky)
      const env = pmrem.fromEquirectangular(sky).texture
      for (const m of PANES) m.envMap = env // panes reflect the sky; no sky: they keep scene.environment
      this.look.setSky(sky) // windows + dollhouse see a real sky; lighting stays on the interior HDRI
    }
    pmrem.dispose()
  }

  /** The PMREM environment lives only on the GPU: after a context loss it comes back empty and every room goes dark. */
  private onContextRestored = (): void => void this.loadEnvironment()

  // ───────────────────────────── controls ─────────────────────────────

  private onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return
    if (e.type === 'keydown') this.keys.add(e.key.toLowerCase())
    else this.keys.delete(e.key.toLowerCase())
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDown = { x: e.clientX, y: e.clientY }
    if (this.editingOpenings && this.mode !== 'building') return this.openingDown(e)
    if (this.arranging && this.mode !== 'building') {
      if (!this.hand) this.arrangeDown(e)
      else if (this.mode === 'walk') this.look2 = { x: e.clientX, y: e.clientY }
    }
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
    const h = pivot && this.raycaster.intersectObjects(this.selBox.children.filter((c) => c.userData.handle), false)[0]
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
      const hit = this.pick(ndc)
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
      if (!og.moved && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 3) return
      og.moved = true
      const p = this.alongWall(this.ndcOf(e), og.wallId) // along ITS wall, at any angle
      if (p) this.openingCb?.(og.end ? { kind: 'resize', id: og.id, end: og.end, uM: og.end === 'top' || og.end === 'sill' ? p.v : p.u } : { kind: 'slide', id: og.id, offsetM: p.u - og.off })
      return
    }
    if (this.hand) {
      if (!e.buttons && this.mode !== 'building') this.aimHand()
      return
    }
    const g = this.grab
    const d = this.pointerDown
    if (!g || (!g.moved && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 3)) return
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
    let wall: { p: Pt; n: Pt } | null = null
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
      wall = { p: { x: h.point.x + n.x * k, y: h.point.z + n.y * k }, n }
      dist = h.distance
      break
    }
    let at = P && { x: P.x + off.x, y: P.z + off.y }
    if (stopAtWalls && wall && (!P || dist < ray.origin.distanceTo(P))) at = { x: wall.p.x + wall.n.x * 0.3, y: wall.p.y + wall.n.y * 0.3 }
    this.arrangeCb?.({ kind: 'drag', id, at, wall })
  }

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.pointerDown
    this.pointerDown = null
    if (this.editingOpenings && this.mode !== 'building') {
      const g = this.opGrab
      this.opGrab = this.look2 = null
      this.orbit.enabled = this.mode !== 'walk'
      if (g?.moved) this.openingCb?.({ kind: 'drop', id: g.id })
      else if (!g && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6) this.openingCb?.({ kind: 'select', id: null })
      return
    }
    if (this.hand && this.mode !== 'building') {
      this.look2 = null
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6) {
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
      else if (!g && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6) this.arrangeCb?.({ kind: 'select', id: null })
      return
    }
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return // a drag, not a click
    const ndc = new THREE.Vector2(0, 0)
    if (!this.plc.isLocked) {
      const r = this.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    if (this.mode === 'building') {
      this.raycaster.setFromCamera(ndc, this.camera)
      this.flatCb?.(this.building?.flatAt(this.raycaster) ?? null)
      return
    }
    const hit = this.pick(ndc)
    this.pickCb?.(hit)
    if (hit?.kind === 'floor' && this.mode === 'walk' && !this.plc.isLocked) {
      this.moveTarget = { x: hit.point.x, y: hit.point.z }
    }
  }

  private onDblClick = (): void => this.lockPointer()

  private pick(ndc: THREE.Vector2): PickHit | null {
    this.raycaster.setFromCamera(ndc, this.camera)
    // three's raycaster ignores `visible`: skip the hidden ceilings (and what hangs from them) in the dollhouse
    const targets = [this.staticGroup, this.ceilingGroup, this.furnitureGroup].filter((g) => g.visible)
    const hits = this.raycaster.intersectObjects(targets, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      let hidden = false // a deleted piece (Arrange) is built but hidden
      for (let v: THREE.Object3D | null = o; v; v = v.parent) hidden ||= !v.visible
      if (hidden) continue
      while (o && !o.userData.kind) o = o.parent
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
    return Math.abs(this.levelAt(p) - this.levelAt(this.walker)) <= MAX_STEP_M
  }

  private tryMove(vx: number, vz: number): void {
    const next = { x: this.walker.x + vx, y: this.walker.y + vz }
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
    const dt = Math.min(this.timer.getDelta(), 0.1)
    if (this.mode !== 'walk') {
      this.orbit.update()
      if (this.mode === 'building' && this.building) this.camera.position.y = Math.max(this.camera.position.y, this.building.minCameraY)
    } else if (this.ready) {
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
      this.floorY += (this.levelAt(this.walker) - this.floorY) * (1 - Math.exp(-dt / 0.1))
      this.rig.position.set(this.walker.x, this.floorY, this.walker.y)
    }
    WATER.normalMap!.offset.x += dt * 0.012 // the pools' ripple drifts
    if (this.hand && this.mode !== 'building') this.aimHand() // the piece in hand stays under the crosshair / pointer as he walks and looks
    this.look.render()
  }
}
