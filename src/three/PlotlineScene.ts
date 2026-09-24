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
import { VRButton } from 'three/addons/webxr/VRButton.js'
import * as core from '../core'
import type { Configuration, FinishSlot, Id, Opening, Pt, Room, Unit, Wall } from '../core'
import { HDRI } from '../furnish/textures'
import { buildFurniture } from './furniture'
import { EXTERIOR_PLASTER, materialFor, resolveFinish, setMaxAnisotropy } from './materials'
import { Look, type Quality } from './render'

export type PickKind = 'wall' | 'floor' | 'ceiling' | 'opening' | 'furniture'
export interface PickHit {
  kind: PickKind
  id: Id
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
    this.sun.intensity = 3.5 * Math.min(1, alt * 3)
    this.sun.color.set('#ffb070').lerp(new THREE.Color('#fff7ec'), Math.min(1, alt * 2.5))
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

  /** Walker to plan point p looking along yawRad (0 = plan −y, i.e. world −Z; positive turns left). Switches to walk mode. */
  spawnAt(p: Pt, yawRad: number): void {
    this.walker = { ...p }
    this.yaw = yawRad
    this.moveTarget = null
    this.setMode('walk')
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

  /** Returns the VRButton to append somewhere. Controller "select" teleports to the floor hit. */
  enableXR(): HTMLElement {
    this.renderer.xr.enabled = true
    this.renderer.xr.addEventListener('sessionstart', () => this.setMode('walk'))
    for (let i = 0; i < 2; i++) {
      const c = this.renderer.xr.getController(i)
      c.addEventListener('selectstart', () => {
        const m = new THREE.Matrix4().extractRotation(c.matrixWorld)
        this.raycaster.ray.origin.setFromMatrixPosition(c.matrixWorld)
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(m)
        const hit = this.raycaster.intersectObjects(this.floors, false)[0]
        if (hit) this.walker = { x: hit.point.x, y: hit.point.z }
      })
      this.rig.add(c)
    }
    return VRButton.createButton(this.renderer)
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

    const pieces = core.wallPieces(wall, f.lengthM)
    if (pieces.length) {
      const geoms = pieces.map((p) => {
        const g = new THREE.BoxGeometry(p.u1 - p.u0, p.v1 - p.v0, wall.thicknessM)
        g.translate((p.u0 + p.u1) / 2, (p.v0 + p.v1) / 2, 0)
        return meterUVs(g)
      })
      const merged = mergeGeometries(geoms)
      geoms.forEach((g) => g.dispose())
      if (merged) {
        // BoxGeometry index layout: px,nx,py,ny,pz,nz × 6 → groups: 0 = front (+n), 1 = back, 2 = edges/reveals
        merged.clearGroups()
        pieces.forEach((_, i) => {
          merged.addGroup(i * 36, 24, 2)
          merged.addGroup(i * 36 + 24, 6, 0)
          merged.addGroup(i * 36 + 30, 6, 1)
        })
        const mesh = new THREE.Mesh(merged)
        mesh.castShadow = mesh.receiveShadow = true
        mesh.userData = { kind: 'wall', id: wall.id, front, back }
        local.add(mesh)
        this.surfaces.push({
          mesh,
          sides: [{ roomId: front, target: 'wall' }, { roomId: back, target: 'wall' }, null],
        })
      }
    }
    for (const o of wall.openings) local.add(buildOpening(o, wall))
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
    floor.userData = { kind: 'floor', id: room.id, roomId: room.id }
    this.staticGroup.add(floor)
    this.floors.push(floor)
    this.surfaces.push({ mesh: floor, sides: [{ roomId: room.id, target: 'floor' }] })

    const height = Math.max(...room.wallIds.map((id) => unit.walls.find((w) => w.id === id)?.heightM ?? 3))
    const ceilGeo = floorGeo.clone()
    ceilGeo.setIndex([...idx].reverse())
    ceilGeo.translate(0, height, 0)
    ceilGeo.computeVertexNormals()
    const ceiling = new THREE.Mesh(ceilGeo)
    ceiling.userData = { kind: 'ceiling', id: room.id, roomId: room.id }
    this.ceilingGroup.add(ceiling)
    this.surfaces.push({ mesh: ceiling, sides: [{ roomId: room.id, target: 'ceiling' }] })
  }

  private applyMaterials(): void {
    if (!this.unit) return
    const plaster = materialFor(EXTERIOR_PLASTER)
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
      this.furnitureGroup.add(obj)
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
    this.scene.environment = hdr ? pmrem.fromEquirectangular(hdr).texture : pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    hdr?.dispose()
    pmrem.dispose()
    if (sky) {
      sky.mapping = THREE.EquirectangularReflectionMapping // windows + dollhouse see a real sky; lighting stays on the interior HDRI
      this.scene.background = sky
    }
  }

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
    const hits = this.raycaster.intersectObjects([this.staticGroup, this.ceilingGroup, this.furnitureGroup], true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o && !o.userData.kind) o = o.parent
      if (!o) continue
      const { kind, id, roomId, wallId, front, back } = o.userData as {
        kind: PickKind; id: Id; roomId?: Id; wallId?: Id; front?: Id | null; back?: Id | null
      }
      const P = h.point
      const hit: PickHit = { kind, id, point: { x: P.x, y: P.y, z: P.z } }
      if (roomId) hit.roomId = roomId
      const f = this.wallFrames.get(kind === 'wall' ? id : (wallId ?? ''))
      if (f) {
        const dx = P.x - f.origin.x
        const dz = P.z - f.origin.y
        hit.localOffset = { u: dx * f.dir.x + dz * f.dir.y, v: P.y }
        if (kind === 'wall') hit.roomId = (dx * f.normal.x + dz * f.normal.y >= 0 ? front : back) ?? undefined
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

// ───────────────────────────── helpers ─────────────────────────────

/** Rewrites BoxGeometry UVs so each face maps its own plane in metres (positions must already be in metres). */
function meterUVs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = g.attributes.uv
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i))
    const nz = Math.abs(n.getZ(i))
    if (nz > 0.5) uv.setXY(i, p.getX(i), p.getY(i))
    else if (nx > 0.5) uv.setXY(i, p.getZ(i), p.getY(i))
    else uv.setXY(i, p.getX(i), p.getZ(i))
  }
  uv.needsUpdate = true
  return g
}

const DOOR_WOOD = { kind: 'color', color: '#3a2a20', roughness: 0.55 } as const
const LEAF_WOOD = { kind: 'color', color: '#5b3f2e', roughness: 0.5 } as const
const ALU = { kind: 'color', color: '#d6d6d6', roughness: 0.35, metalness: 0.7 } as const
let glass: THREE.MeshPhysicalMaterial | null = null

function box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  mesh.castShadow = mesh.receiveShadow = true
  return mesh
}

/** Door/passage/window dressing in wall-local coordinates (u, v, w). Exported for engine.test.ts. */
export function buildOpening(o: Opening, wall: Wall): THREE.Group {
  const g = new THREE.Group()
  g.userData = { kind: 'opening', id: o.id, wallId: wall.id }
  const d = wall.thicknessM + 0.02
  const cu = o.offsetM + o.widthM / 2
  const frame = materialFor(o.kind === 'window' ? ALU : DOOR_WOOD)
  // jambs + head
  g.add(box(0.06, o.heightM + 0.03, d, o.offsetM - 0.03, o.sillM + (o.heightM + 0.03) / 2, 0, frame))
  g.add(box(0.06, o.heightM + 0.03, d, o.offsetM + o.widthM + 0.03, o.sillM + (o.heightM + 0.03) / 2, 0, frame))
  g.add(box(o.widthM + 0.12, 0.06, d, cu, o.sillM + o.heightM + 0.03, 0, frame))

  if (o.kind === 'door') {
    // leaf hinged on the 'hinge' side, ajar 20°. Leaf extends +u from hinge a, −u from hinge b.
    const hingeB = o.hinge === 'b'
    const pivot = new THREE.Group()
    pivot.position.set(hingeB ? o.offsetM + o.widthM : o.offsetM, o.sillM, 0)
    const sx = hingeB ? -1 : 1
    pivot.add(box(o.widthM - 0.02, o.heightM - 0.02, 0.04, (sx * (o.widthM - 0.02)) / 2, (o.heightM - 0.02) / 2, 0, materialFor(LEAF_WOOD)))
    // rotating +u about Y by +φ moves it toward −w. Unit JSON convention: 'in' = leaf on the
    // LEFT of a→b in image coords = −normal side (normal = (−dir.y, dir.x) is the right-hand side on screen).
    pivot.rotation.y = sx * (o.swing === 'in' ? 1 : -1) * THREE.MathUtils.degToRad(20)
    g.add(pivot)
  } else if (o.kind === 'window') {
    glass ??= new THREE.MeshPhysicalMaterial({ transmission: 0.9, roughness: 0.05, thickness: 0.01, ior: 1.5 })
    g.add(box(o.widthM + 0.12, 0.06, d, cu, o.sillM - 0.03, 0, frame)) // bottom rail
    g.add(box(o.widthM + 0.2, 0.03, d + 0.1, cu, o.sillM - 0.075, 0, materialFor({ kind: 'color', color: '#e9e6df', roughness: 0.4 }))) // sill
    const pane = box(o.widthM, o.heightM, 0.008, cu, o.sillM + o.heightM / 2, 0, glass)
    pane.castShadow = false
    g.add(pane)
    if (o.widthM > 1.2) g.add(box(0.04, o.heightM, 0.04, cu, o.sillM + o.heightM / 2, 0, frame)) // mullion
  }
  return g
}
