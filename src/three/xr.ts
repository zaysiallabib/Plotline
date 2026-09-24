/**
 * WebXR controls (PRODUCT_SPEC §3.8). PlotlineScene.enableXR() owns one; tick() calls update() before rendering.
 *
 * - Each controller: a thin ray and a cursor where it meets the walls/floors (no downloaded controller models).
 * - Trigger held: a floor ring where the ray lands (accent = OK, red = outside / within 0.3 m of a wall).
 *   Release: teleport so the HEAD (not the rig origin) lands on the ring.
 * - Thumbstick x past ±0.6: 45° snap turn about the head; re-arms under 0.3.
 * - Left controller: a room chip (name / printed size / area), redrawn only when the room changes.
 * - In session: 'local-floor' space (the headset supplies eye height), foveation 1, sun shadow map 1024.
 * - Session end: walk mode at the last head position and yaw.
 *
 * Rig convention: rig.position.y = 0 and only rig.rotation.y is used; three.js applies the headset pose to the
 * camera inside the rig. The walker follows the rig via hooks.moved (tick() sets rig.position from the walker).
 */
import * as THREE from 'three'
import { sqmToSqft, type Pt, type Room } from '../core'

export const SNAP_RAD = Math.PI / 4
const FIRE = 0.6
const REARM = 0.3
const RAY_M = 8
const XR_SHADOW = 1024
const RECHECK_M2 = 0.05 * 0.05 // canStand walks every room and wall: re-run only when the target moved 5 cm
const CHIP_M2 = 0.2 * 0.2 // room chip: re-check the head's room after it moved 20 cm

export interface XRHooks {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  rig: THREE.Group
  sun: THREE.DirectionalLight
  /** what the rays hit: walls, openings, floors (floor meshes carry userData.kind === 'floor') */
  targets: THREE.Object3D
  /** inside a room and clear of walls (the desktop walker's rule) */
  canStand: (p: Pt) => boolean
  roomAt: (p: Pt) => Room | null
  /** session starting: walk mode, rig at the walker */
  start: () => void
  /** the rig moved to plan point p (teleport / snap turn) */
  moved: (p: Pt) => void
  /** session ended: walk mode at p facing yaw */
  exit: (p: Pt, yaw: number) => void
}

export type Verdict = 'none' | 'ok' | 'blocked'

/** Rig position (plan x, y = world x, z) that puts the head on target: target − (head − rig). */
export const rigForHead = (target: Pt, head: Pt, rig: Pt): Pt => ({ x: target.x - head.x + rig.x, y: target.y - head.y + rig.y })

/** Rig position after rotating the rig by `angle` about world +Y through the head (plan x, y = world x, z). */
export function turnAbout(rig: Pt, head: Pt, angle: number): Pt {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = rig.x - head.x
  const dz = rig.y - head.y
  // three.js rotation about +Y: x' = x cos + z sin, z' = −x sin + z cos
  return { x: head.x + dx * c + dz * s, y: head.y - dx * s + dz * c }
}

/** Thumbstick x → yaw step. Fires once past ±FIRE (stick right = turn right = −45°), re-arms under REARM. */
export function snapTurn(stick: { armed: boolean }, x: number): number {
  if (Math.abs(x) < REARM) stick.armed = true
  else if (stick.armed && Math.abs(x) > FIRE) {
    stick.armed = false
    return x > 0 ? -SNAP_RAD : SNAP_RAD
  }
  return 0
}

/** The ray's NEAREST hit decides: not a floor (wall, door, window, nothing) → 'none'; a floor → canStand. */
export function teleportVerdict(hit: THREE.Intersection | undefined, canStand: (p: THREE.Vector3) => boolean): Verdict {
  if (!hit || hit.object.userData.kind !== 'floor') return 'none'
  return canStand(hit.point) ? 'ok' : 'blocked'
}

interface Hand {
  ctrl: THREE.XRTargetRaySpace
  line: THREE.Line
  cursor: THREE.Mesh
  source: XRInputSource | null
  selecting: boolean
  stick: { armed: boolean }
  verdict: Verdict
  target: THREE.Vector3
}

export class XRControls {
  /** the room drawn on the chip */
  chipRoom: Room | null = null
  readonly chipCanvas = document.createElement('canvas')
  private readonly hands: Hand[] = []
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private readonly chip: THREE.Mesh
  private readonly chipTex: THREE.CanvasTexture
  private readonly raycaster = new THREE.Raycaster()
  private readonly hits: THREE.Intersection[] = []
  private readonly head = new THREE.Vector3()
  private readonly roomCheckedAt = new THREE.Vector3(Infinity, 0, 0)
  private readonly standAt = new THREE.Vector3(Infinity, 0, 0)
  private standOk = false
  private readonly pt: Pt = { x: 0, y: 0 }
  private readonly q = new THREE.Quaternion()
  private readonly euler = new THREE.Euler()
  private readonly okColor = new THREE.Color('#e8c170')
  private readonly badColor = new THREE.Color('#e0604f')
  /** last known standable head spot: exit falls back to it if the player walked into a wall */
  private safe: Pt = { x: 0, y: 0 }
  private shadowSize = 0

  constructor(private readonly h: XRHooks) {
    const xr = h.renderer.xr
    xr.enabled = true
    xr.setReferenceSpaceType('local-floor') // three's default; explicit because the rig puts the floor at y = 0
    xr.setFoveation(1)
    xr.addEventListener('sessionstart', this.onStart)
    xr.addEventListener('sessionend', this.onEnd)
    this.raycaster.far = RAY_M

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.26, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.okColor, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    )
    this.ring.visible = false
    h.scene.add(this.ring)

    this.chipCanvas.width = 512
    this.chipCanvas.height = 256
    this.chipTex = new THREE.CanvasTexture(this.chipCanvas)
    this.chipTex.colorSpace = THREE.SRGBColorSpace
    this.chip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.08),
      new THREE.MeshBasicMaterial({ map: this.chipTex, transparent: true, toneMapped: false }),
    )
    // above the left controller, tilted back toward the eyes
    this.chip.position.set(0, 0.07, 0.02)
    this.chip.rotation.x = -0.6
    this.chip.visible = false

    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)])
    const lineMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 })
    const cursorGeo = new THREE.SphereGeometry(0.012, 12, 8)
    const cursorMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })
    for (let i = 0; i < 2; i++) {
      const ctrl = xr.getController(i)
      const hand: Hand = {
        ctrl,
        line: new THREE.Line(lineGeo, lineMat),
        cursor: new THREE.Mesh(cursorGeo, cursorMat),
        source: null,
        selecting: false,
        stick: { armed: true },
        verdict: 'none',
        target: new THREE.Vector3(),
      }
      hand.line.scale.z = RAY_M
      hand.cursor.visible = false
      ctrl.add(hand.line, hand.cursor)
      ctrl.addEventListener('connected', (e) => {
        hand.source = e.data
        if (e.data.handedness === 'left') ctrl.add(this.chip)
      })
      ctrl.addEventListener('disconnected', () => {
        hand.source = null
        hand.selecting = false
      })
      ctrl.addEventListener('selectstart', () => (hand.selecting = true))
      ctrl.addEventListener('selectend', () => this.release(hand))
      h.rig.add(ctrl)
      this.hands.push(hand)
    }
  }

  /** Enter or leave VR. Call from a click (requestSession needs the user gesture); rejects if the session can't start. */
  async toggle(): Promise<void> {
    const xr = this.h.renderer.xr
    const current = xr.getSession()
    if (current) return current.end()
    const session = await navigator.xr!.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['layers'] })
    await xr.setSession(session)
  }

  /** Per frame, before rendering. Allocation-free except inside three's raycaster and on teleport/turn events. */
  update(): void {
    if (!this.h.renderer.xr.isPresenting) return
    this.h.rig.updateMatrixWorld(true) // controllers were posed for this frame after the last render
    this.readHead()
    let aiming: Hand | null = null
    for (const hand of this.hands) {
      if (!hand.source) continue
      const axes = hand.source.gamepad?.axes
      const turn = axes ? snapTurn(hand.stick, axes[2] ?? axes[0] ?? 0) : 0 // xr-standard: thumbstick = axes 2/3
      if (turn) this.turn(turn)
      this.aim(hand)
      if (hand.selecting) aiming = hand
    }
    this.ring.visible = !!aiming && aiming.verdict !== 'none'
    if (aiming && this.ring.visible) {
      this.ring.position.copy(aiming.target).y += 0.01
      this.ring.material.color.copy(aiming.verdict === 'ok' ? this.okColor : this.badColor)
    }
    if (this.head.distanceToSquared(this.roomCheckedAt) > CHIP_M2) {
      this.roomCheckedAt.copy(this.head)
      this.pt.x = this.head.x
      this.pt.y = this.head.z
      const room = this.h.roomAt(this.pt)
      if (room && room.id !== this.chipRoom?.id) this.drawChip(room)
    }
  }

  /** Casts the hand's ray: sizes the line, places the cursor and, while the trigger is held, resolves the teleport target. */
  private aim(hand: Hand): void {
    const m = hand.ctrl.matrixWorld
    this.raycaster.ray.origin.setFromMatrixPosition(m)
    this.raycaster.ray.direction.set(0, 0, -1).transformDirection(m)
    this.hits.length = 0
    // ponytail: rays ignore furniture, so a ring can land under a table; add the furniture group to targets
    // (while selecting only: its meshes are dense) if headset testing shows buyers teleporting into furniture.
    this.raycaster.intersectObject(this.h.targets, true, this.hits)
    const hit = this.hits[0]
    hand.line.scale.z = hit ? hit.distance : RAY_M
    hand.cursor.visible = !!hit
    if (hit) hand.cursor.position.z = -hit.distance
    if (!hand.selecting) return
    hand.verdict = teleportVerdict(hit, this.stand)
    if (hit) hand.target.copy(hit.point)
  }

  /** hooks.canStand, cached while the target stays within 5 cm */
  private readonly stand = (p: THREE.Vector3): boolean => {
    if (p.distanceToSquared(this.standAt) > RECHECK_M2) {
      this.standAt.copy(p)
      this.pt.x = p.x
      this.pt.y = p.z
      this.standOk = this.h.canStand(this.pt)
    }
    return this.standOk
  }

  private release(hand: Hand): void {
    if (!hand.selecting) return
    hand.selecting = false
    this.ring.visible = false
    // re-aim with the pose delivered with selectend, so a press + release inside one frame still works
    this.h.rig.updateMatrixWorld(true)
    this.readHead()
    this.aim(hand)
    if (hand.verdict !== 'ok') return
    const { rig } = this.h
    const t = hand.target
    this.safe = { x: t.x, y: t.z }
    this.moveRig(rigForHead(this.safe, { x: this.head.x, y: this.head.z }, { x: rig.position.x, y: rig.position.z }))
  }

  private turn(angle: number): void {
    const { rig } = this.h
    rig.rotation.y += angle
    this.moveRig(turnAbout({ x: rig.position.x, y: rig.position.z }, { x: this.head.x, y: this.head.z }, angle))
  }

  /**
   * this.head = the centre eye in world space: the mean of the per-eye cameras, which three poses rig-locally for
   * the current frame before tick(). (Our camera sits a few cm behind it so one frustum covers both eyes.)
   */
  private readHead(): void {
    const eyes = this.h.renderer.xr.getCamera().cameras
    if (!eyes.length) return void this.h.camera.getWorldPosition(this.head)
    this.head.set(0, 0, 0)
    for (const e of eyes) this.head.add(e.position)
    this.h.rig.localToWorld(this.head.divideScalar(eyes.length))
  }

  private moveRig(p: Pt): void {
    this.h.rig.position.set(p.x, 0, p.y)
    this.h.rig.updateMatrixWorld(true)
    this.readHead()
    this.h.moved(p)
  }

  private drawChip(room: Room): void {
    const c = this.chipCanvas.getContext('2d')!
    const { width: W, height: H } = this.chipCanvas
    c.clearRect(0, 0, W, H)
    c.fillStyle = 'rgba(23,24,26,0.86)'
    c.strokeStyle = 'rgba(255,255,255,0.14)'
    c.lineWidth = 3
    c.beginPath()
    c.roundRect(4, 4, W - 8, H - 8, 36)
    c.fill()
    c.stroke()
    c.fillStyle = '#f2f2f0'
    c.font = '400 56px Inter, system-ui, sans-serif'
    c.fillText(room.name, 36, 88, W - 72)
    c.fillStyle = '#9a9a94'
    c.font = '300 38px Inter, system-ui, sans-serif'
    const area = `${room.areaSqm.toFixed(1)} m² · ${Math.round(sqmToSqft(room.areaSqm))} sqft`
    const lines = room.printedSize ? [room.printedSize, area] : [area]
    lines.forEach((t, i) => c.fillText(t, 36, 150 + i * 50, W - 72))
    this.chipTex.needsUpdate = true
    this.chip.visible = true
    this.chipRoom = room
  }

  private setShadow(size: number): void {
    const s = this.h.sun.shadow
    if (s.mapSize.x === size) return
    s.mapSize.set(size, size)
    s.map?.dispose()
    s.map = null // three re-allocates it at the new size on the next shadow pass
  }

  private onStart = (): void => {
    const { camera, rig } = this.h
    const yaw = this.euler.setFromQuaternion(camera.quaternion, 'YXZ').y // keep looking where the desktop view looked
    this.h.start()
    rig.rotation.set(0, yaw, 0)
    this.safe = { x: rig.position.x, y: rig.position.z }
    this.shadowSize = this.h.sun.shadow.mapSize.x
    this.setShadow(XR_SHADOW)
    this.roomCheckedAt.set(Infinity, 0, 0)
  }

  private onEnd = (): void => {
    const { camera, rig } = this.h
    this.setShadow(this.shadowSize)
    this.ring.visible = false
    rig.updateMatrixWorld(true)
    this.readHead()
    const yaw = this.euler.setFromQuaternion(camera.getWorldQuaternion(this.q), 'YXZ').y
    rig.rotation.set(0, 0, 0)
    const p = { x: this.head.x, y: this.head.z }
    this.h.exit(this.h.canStand(p) ? p : this.safe, yaw)
  }
}
