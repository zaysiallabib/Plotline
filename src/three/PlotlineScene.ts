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
import { XRControls } from './xr'
import * as core from '../core'
import type { Configuration, FinishSlot, Id, Pt, Room, Unit, Wall } from '../core'
import { kitAsset, type ObjectKind } from '../furnish/kit'
import { HDRI } from '../furnish/textures'
import { buildSkirting, dressOpening, wallGeometry } from './details'
import { buildFurniture } from './furniture'
import { EXTERIOR_PLASTER, materialFor, resolveFinish, setMaxAnisotropy } from './materials'
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
export type SceneMode = 'walk' | 'orbit'

const EYE = 1.6
const WALK_RADIUS = 0.3
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

interface Surface {
  mesh: THREE.Mesh
  /** one entry per material slot; null = fixed material (edges/reveals) */
  sides: ({ roomId: Id | null; target: FinishSlot['target'] } | null)[]
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
  private edgeMat: THREE.MeshStandardMaterial | null = null
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
  private yaw = 0
  private moveTarget: Pt | null = null
  private center = new THREE.Vector3()
  private radius = 10
  private pickCb: ((hit: PickHit | null) => void) | null = null
  private pointerDown: { x: number; y: number } | null = null

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

    window.addEventListener('keydown', this.onKey)
    window.addEventListener('keyup', this.onKey)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('dblclick', this.onDblClick)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.renderer.setAnimationLoop(this.tick)
  }

  // ───────────────────────────── public API ─────────────────────────────

  /** Rebuilds all static geometry (walls, openings, floors, ceilings) and reloads furniture. */
  setUnit(unit: Unit): void {
    this.ready = false
    this.clearStatic()
    this.unit = unit
    this.rooms = core.deriveRooms(unit)
    const b = core.unitBounds(unit)
    this.center.set((b.minX + b.maxX) / 2, 0, (b.minY + b.maxY) / 2)
    this.radius = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 1

    for (const wall of unit.walls) this.buildWall(wall, unit)
    for (const room of this.rooms) this.buildRoom(room, unit)
    this.applyMaterials()
    this.look.setUnit(unit, this.rooms) // fixtures, lights, slab, shadow fit box
    this.setTimeOfDay(this.hour)

    const first = this.rooms[0]
    this.walker = first ? { ...first.centroid } : { x: this.center.x, y: this.center.z }
    this.moveTarget = null
    this.ready = true
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
  }

  setMode(mode: SceneMode): void {
    if (this.mode === 'walk' && mode === 'orbit') {
      this.yaw = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ').y
    }
    this.mode = mode
    this.ceilingGroup.visible = mode === 'walk'
    this.orbit.enabled = mode === 'orbit'
    if (mode === 'orbit') this.orbit.connect(this.canvas)
    else if (this.orbit.domElement) this.orbit.disconnect()
    if (mode === 'orbit') {
      if (this.plc.isLocked) this.plc.unlock()
      this.rig.position.set(0, 0, 0)
      this.camera.position.copy(this.center).add(new THREE.Vector3(this.radius, this.radius * 1.3, this.radius))
      this.orbit.target.copy(this.center)
      this.orbit.update()
    } else {
      this.rig.position.set(this.walker.x, 0, this.walker.y)
      this.camera.position.set(0, EYE, 0)
      this.camera.quaternion.setFromEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'))
    }
  }

  /** Walker to the room centroid (eye height 1.6). Switches to walk mode. */
  teleportTo(roomId: Id): void {
    const room = this.rooms.find((r) => r.id === roomId)
    if (!room) return
    this.walker = { ...room.centroid }
    this.moveTarget = null
    this.setMode('walk')
  }

  /** Walker to plan point p looking along yawRad (0 = plan −y, i.e. world −Z; positive turns left), pitchRad down when < 0. Switches to walk mode. */
  spawnAt(p: Pt, yawRad: number, pitchRad = 0): void {
    this.walker = { ...p }
    this.yaw = yawRad
    this.moveTarget = null
    this.setMode('walk')
    this.camera.quaternion.setFromEuler(new THREE.Euler(pitchRad, yawRad, 0, 'YXZ'))
  }

  onPick(cb: (hit: PickHit | null) => void): void {
    this.pickCb = cb
  }

  currentRoomId(): Id | null {
    if (!this.ready || !this.unit) return null
    return core.roomAt(this.walker, this.rooms, this.unit)?.id ?? null
  }

  /** Enter pointer lock (mouse look). Must be called from a user gesture; dblclick on the canvas does this too. */
  lockPointer(): void {
    if (this.mode === 'walk') this.plc.lock()
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
      canStand: (p) => !!this.unit && !!core.roomAt(p, this.rooms, this.unit) && !this.blocked(p),
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
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    if (this.orbit.domElement) this.orbit.dispose()
    this.plc.dispose()
    this.clearStatic()
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
    const front = side(1)
    const back = side(-1)

    // world space, groups 0 = front (+n), 1 = back, 2 = edges/reveals: every wall shares the identity transform,
    // so a corner two walls share reaches the GPU as the same numbers (no hairline crack between them)
    const geo = wallGeometry(wall, unit)
    if (geo) {
      const mesh = new THREE.Mesh(geo)
      mesh.castShadow = mesh.receiveShadow = true
      mesh.userData = { kind: 'wall', id: wall.id, front, back, label: 'Wall', objectKind: 'wall' }
      this.staticGroup.add(mesh)
      this.surfaces.push({
        mesh,
        sides: [{ roomId: front, target: 'wall' }, { roomId: back, target: 'wall' }, null],
      })
    }
    for (const o of wall.openings) local.add(...dressOpening(o, wall, unit, this.rooms))
  }

  private buildRoom(room: Room, unit: Unit): void {
    const poly = core.roomPolygon(room, unit)
    const tri = core.triangulate(poly)
    const pos = new Float32Array(poly.length * 3)
    const uv = new Float32Array(poly.length * 2)
    poly.forEach((p, i) => {
      pos.set([p.x, 0, p.y], i * 3)
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
    const skirting = buildSkirting(room, unit)
    if (skirting) this.staticGroup.add(skirting)

    const height = Math.max(...room.wallIds.map((id) => unit.walls.find((w) => w.id === id)?.heightM ?? 3))
    const ceilGeo = floorGeo.clone()
    ceilGeo.setIndex([...idx].reverse())
    ceilGeo.translate(0, height, 0)
    ceilGeo.computeVertexNormals()
    const ceiling = new THREE.Mesh(ceilGeo)
    ceiling.userData = { kind: 'ceiling', id: room.id, roomId: room.id, label: `${room.name} ceiling`, objectKind: 'ceiling' }
    this.ceilingGroup.add(ceiling)
    this.surfaces.push({ mesh: ceiling, sides: [{ roomId: room.id, target: 'ceiling' }] })
  }

  private applyMaterials(): void {
    if (!this.unit) return
    // wall ends, reveals, tops: pushed back in depth so they lose ties to the faces they meet (an end cap at a
    // junction sits edge-on against the room face and won the tie along it: a one-pixel hairline)
    const plaster = (this.edgeMat ??= Object.assign(materialFor(EXTERIOR_PLASTER).clone(), { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
    for (const s of this.surfaces) {
      const mats = s.sides.map((side) =>
        side ? resolveFinish(this.unit!.finishSlots, this.cfg, side.roomId, side.target) : plaster,
      )
      s.mesh.material = mats.length === 1 ? mats[0] : mats
    }
  }

  private async loadFurniture(unit: Unit): Promise<void> {
    const token = this.buildToken
    const byDistance = [...unit.furniture].sort(
      (a, b) => Math.hypot(a.x - this.walker.x, a.y - this.walker.y) - Math.hypot(b.x - this.walker.x, b.y - this.walker.y),
    )
    const heights = new Map(unit.walls.map((w) => [w.id, w.heightM]))
    const ceilingOf = (roomId: Id) => {
      const hs = this.rooms.find((r) => r.id === roomId)?.wallIds.map((id) => heights.get(id) ?? 3.048) ?? []
      return hs.length ? Math.max(...hs) : 3.048
    }
    for (const p of byDistance) {
      const obj = await buildFurniture(p, ceilingOf(p.roomId))
      if (token !== this.buildToken) return // unit changed mid-load
      // lights, fans and pendants hang from the ceiling: they go (hidden in the dollhouse) with it; a wall AC (mountY) stays
      const a = kitAsset(p.assetId)
      ;(a?.mount === 'ceiling' && a.mountY === undefined ? this.ceilingGroup : this.furnitureGroup).add(obj)
    }
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
  }

  private onPointerUp = (e: PointerEvent): void => {
    const d = this.pointerDown
    this.pointerDown = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return // a drag, not a click
    const ndc = new THREE.Vector2(0, 0)
    if (!this.plc.isLocked) {
      const r = this.canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
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
      while (o && !o.userData.kind) o = o.parent
      if (!o) continue
      const { kind, id, roomId, wallId, front, back, label, objectKind } = o.userData as {
        kind: PickKind; id: Id; roomId?: Id; wallId?: Id; front?: Id | null; back?: Id | null; label: string; objectKind: ObjectKind
      }
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

  private tryMove(vx: number, vz: number): void {
    const next = { x: this.walker.x + vx, y: this.walker.y + vz }
    if (!this.blocked(next)) {
      this.walker = next
      return
    }
    // slide: project the step onto the nearest wall's direction
    const nw = core.nearestWall(next, this.unit!)
    if (!nw) return
    const { dir } = core.wallFrame(nw.wall, this.unit!.vertices)
    const along = vx * dir.x + vz * dir.y
    const slide = { x: this.walker.x + dir.x * along, y: this.walker.y + dir.y * along }
    if (!this.blocked(slide)) this.walker = slide
  }

  private tick = (): void => {
    this.xr?.update()
    this.timer.update()
    const dt = Math.min(this.timer.getDelta(), 0.1)
    if (this.mode === 'orbit') {
      this.orbit.update()
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
      this.rig.position.set(this.walker.x, 0, this.walker.y)
    }
    this.look.render()
  }
}
