/**
 * Wind in the 3D view (founder 2026-10-18): light arrows that come in through the outside openings facing within 60° of
 * the month's wind, cross the room and leave through an opening on its far side (core.roomWind) — or stop in the room
 * when it has none. Arrows at a window behind a taller block upwind (core.sheltered) are dimmed. A guide, not a flow model.
 */
import * as THREE from 'three'
import * as core from '../core'
import type { Room, Unit, WindMonth } from '../core'

/** metres outside an opening where its arrows start / end */
const OUT_M = 2
/** metres between two arrows on a path */
const GAP_M = 0.9

interface Path {
  pts: THREE.Vector3[]
  /** running length at each point */
  at: number[]
  dim: boolean
}

export class WindFlow extends THREE.Group {
  private readonly paths: Path[] = []
  private readonly bright: THREE.InstancedMesh
  private readonly faint: THREE.InstancedMesh
  private readonly speed: number
  private t = 0
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly v = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly X = new THREE.Vector3(1, 0, 0)

  constructor(unit: Unit, rooms: Room[], month: WindMonth) {
    super()
    const blocks = core.sitePlan(unit).buildings
    const byId = new Map(rooms.map((r) => [r.id, r]))
    const travel = core.bearingInPlan(unit.northDeg, month.fromDeg + 180)
    for (const rw of core.roomWind(unit, rooms, month.fromDeg)) {
      const r = byId.get(rw.roomId)!
      for (const o of rw.inlets) {
        const y = core.roomLevelAt(r, unit, o.at.x, o.at.y) + THREE.MathUtils.clamp((o.sillM + o.headM) / 2, 0.6, 1.6)
        const P = (x: number, z: number) => new THREE.Vector3(x, y, z)
        // where it leaves: the outlet farthest downwind; none — it stops at the room's middle
        const exit = rw.outlets.reduce<core.WindOpening | null>((best, e) => (!best || dot(e.at, travel) > dot(best.at, travel) ? e : best), null)
        const pts = [P(o.at.x + o.out.x * OUT_M, o.at.y + o.out.y * OUT_M), P(o.at.x, o.at.y)]
        if (exit) pts.push(P(exit.at.x, exit.at.y), P(exit.at.x + exit.out.x * OUT_M, exit.at.y + exit.out.y * OUT_M))
        else pts.push(P(r.centroid.x, r.centroid.y))
        const at = [0]
        for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + pts[i].distanceTo(pts[i - 1]))
        this.paths.push({ pts, at, dim: core.sheltered(unit, o.at, month.fromDeg, blocks) })
      }
    }
    // 0.5–1.4 m/s on screen for 1–5 m/s outside: faster wind, faster arrows
    this.speed = 0.3 + 0.22 * month.speedMs
    const geo = new THREE.ConeGeometry(0.06, 0.28, 8).rotateZ(-Math.PI / 2) // tip along +X
    const count = (dim: boolean) => this.paths.filter((p) => p.dim === dim).reduce((n, p) => n + Math.max(1, Math.floor(p.at.at(-1)! / GAP_M)), 0)
    const mat = (opacity: number) => new THREE.MeshBasicMaterial({ color: '#8fd8ff', transparent: true, opacity, depthWrite: false })
    this.bright = new THREE.InstancedMesh(geo, mat(0.9), Math.max(1, count(false)))
    this.faint = new THREE.InstancedMesh(geo, mat(0.25), Math.max(1, count(true)))
    for (const mesh of [this.bright, this.faint]) {
      mesh.raycast = () => {} // a click goes through to the room
      mesh.frustumCulled = false
      this.add(mesh)
    }
    this.update(0)
  }

  /** Moves every arrow along its path by dt seconds. */
  update(dt: number): void {
    this.t += dt
    const n = [0, 0]
    for (const p of this.paths) {
      const len = p.at.at(-1)!
      const k = Math.max(1, Math.floor(len / GAP_M))
      const mesh = p.dim ? this.faint : this.bright
      for (let i = 0; i < k; i++) {
        const s = (this.t * this.speed + (i * len) / k) % len
        let j = 1
        while (j < p.at.length - 1 && p.at[j] < s) j++
        const [a, b] = [p.pts[j - 1], p.pts[j]]
        const f = (s - p.at[j - 1]) / Math.max(1e-6, p.at[j] - p.at[j - 1])
        this.v.subVectors(b, a).normalize()
        this.q.setFromUnitVectors(this.X, this.v)
        this.m.compose(this.p.copy(a).lerp(b, f), this.q, ONE)
        mesh.setMatrixAt(n[p.dim ? 1 : 0]++, this.m)
      }
    }
    this.bright.count = n[0]
    this.faint.count = n[1]
    this.bright.instanceMatrix.needsUpdate = this.faint.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.bright.geometry.dispose()
    for (const mesh of [this.bright, this.faint]) {
      ;(mesh.material as THREE.Material).dispose()
      mesh.dispose()
    }
    this.removeFromParent()
  }
}

const ONE = new THREE.Vector3(1, 1, 1)
const dot = (p: { x: number; y: number }, d: { x: number; y: number }) => p.x * d.x + p.y * d.y
