/**
 * Wind in the 3D view (founder 2026-10-18: "don't make them sloppy and tacky … be classy"): a breeze of thin streamlines —
 * 6 to 10 per outside opening facing within 60° of the month's wind, spread across it, each a gently curved line that
 * fades in at the window, crosses the room and fades out past the opening on its far side (core.roomWind), or fades out
 * in the room when it has none. Long soft dashes drift along them, slowly. One quiet blue, low opacity, no arrowheads.
 * Lines at a window behind a taller block upwind (core.sheltered) are fainter. A guide, not a flow model.
 */
import * as THREE from 'three'
import * as core from '../core'
import type { Room, Unit, WindMonth } from '../core'

/** metres outside an opening where a line starts (and fades in) / ends past the far one (and fades out) */
const OUT_M = 1.6
/** one dash and its gap along a line, m */
const PERIOD_M = 2.2
/** a calm, desaturated blue, as the wind rose's */
const COLOR = '#4a6f94'
const OPACITY = 0.9
/** a line at a sheltered window: this much of the others' opacity */
const SHELTERED = 0.35

const VERT = /* glsl */ `
attribute float aS;
attribute float aLen;
attribute float aK;
attribute float aSeed;
varying float vS;
varying float vLen;
varying float vK;
varying float vSeed;
void main() {
  vS = aS; vLen = aLen; vK = aK; vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const FRAG = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float time;
uniform float speed;
varying float vS;
varying float vLen;
varying float vK;
varying float vSeed;
void main() {
  float edge = smoothstep(0.0, ${OUT_M.toFixed(2)}, vS) * smoothstep(0.0, ${OUT_M.toFixed(2)}, vLen - vS);
  float ph = fract((vS - time * speed) / ${PERIOD_M.toFixed(2)} + vSeed);
  float dash = smoothstep(0.0, 0.18, ph) * (1.0 - smoothstep(0.42, 0.62, ph));
  gl_FragColor = vec4(color, opacity * vK * edge * dash);
}`

export class WindFlow extends THREE.Group {
  private readonly mat: THREE.ShaderMaterial
  private readonly lines: THREE.LineSegments

  constructor(unit: Unit, rooms: Room[], month: WindMonth) {
    super()
    const blocks = core.sitePlan(unit).buildings
    const byId = new Map(rooms.map((r) => [r.id, r]))
    const travel = core.bearingInPlan(unit.northDeg, month.fromDeg + 180)
    const pos: number[] = []
    const att: Record<'s' | 'len' | 'k' | 'seed', number[]> = { s: [], len: [], k: [], seed: [] }
    let lane = 0
    for (const rw of core.roomWind(unit, rooms, month.fromDeg)) {
      const r = byId.get(rw.roomId)!
      // where it leaves: the outlet farthest downwind
      const exit = rw.outlets.reduce<core.WindOpening | null>((best, e) => (!best || dot(e.at, travel) > dot(best.at, travel) ? e : best), null)
      for (const o of rw.inlets) {
        const k = core.sheltered(unit, o.at, month.fromDeg, blocks) ? SHELTERED : 1
        const side = { x: -o.out.y, y: o.out.x }
        // the far opening's across, turned the same way as this one's so the lines never cross over
        const xs = exit && dot({ x: -exit.out.y, y: exit.out.x }, side) < 0 ? -1 : 1
        const n = THREE.MathUtils.clamp(Math.round(o.widthM * 4), 6, 10)
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n - 0.5 // across the opening
          const up = i % 2 ? 0.35 : 0.65 // two heights, alternating
          const on = (w: core.WindOpening, s: number) => {
            const across = { x: -w.out.y * s, y: w.out.x * s }
            const x = w.at.x + across.x * f * Math.max(0.1, w.widthM - 0.2)
            const y = w.at.y + across.y * f * Math.max(0.1, w.widthM - 0.2)
            const h = Math.min(2.2, w.sillM + up * (Math.min(w.headM, 2.4) - w.sillM))
            return { x, y, h: core.roomLevelAt(r, unit, x, y) + h }
          }
          const a = on(o, 1)
          const V = (p: { x: number; y: number; h: number }, d = { x: 0, y: 0 }, m = 0) => new THREE.Vector3(p.x + d.x * m, p.h, p.y + d.y * m)
          const pts = [V(a, o.out, OUT_M), V(a)]
          if (exit) {
            const b = on(exit, xs)
            // a gentle bow half-way, the same way for every line of the opening: a breeze, not a ruler
            const mid = { x: (a.x + b.x) / 2 + side.x * 0.25, y: (a.y + b.y) / 2 + side.y * 0.25, h: (a.h + b.h) / 2 }
            pts.push(V(mid), V(b), V(b, exit.out, OUT_M))
          } else {
            // no way out: it runs in toward the room's middle and dies there
            const d = Math.min(3.5, Math.hypot(r.centroid.x - a.x, r.centroid.y - a.y) + 0.5)
            pts.push(V(a, { x: -o.out.x + side.x * 0.12, y: -o.out.y + side.y * 0.12 }, d * 0.55), V(a, { x: -o.out.x + side.x * 0.3, y: -o.out.y + side.y * 0.3 }, d))
          }
          const P = new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(64)
          const s = [0]
          for (let j = 1; j < P.length; j++) s.push(s[j - 1] + P[j].distanceTo(P[j - 1]))
          const len = s.at(-1)!
          const seed = (lane++ * 0.618) % 1
          for (let j = 1; j < P.length; j++) {
            for (const q of [j - 1, j]) {
              pos.push(P[q].x, P[q].y, P[q].z)
              att.s.push(s[q])
              att.len.push(len)
              att.k.push(k)
              att.seed.push(seed)
            }
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('aS', new THREE.Float32BufferAttribute(att.s, 1))
    geo.setAttribute('aLen', new THREE.Float32BufferAttribute(att.len, 1))
    geo.setAttribute('aK', new THREE.Float32BufferAttribute(att.k, 1))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(att.seed, 1))
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      // a slow, steady drift: 0.25–0.45 m/s on screen for 1.5–4 m/s outside
      uniforms: { color: { value: new THREE.Color(COLOR) }, opacity: { value: OPACITY }, time: { value: 0 }, speed: { value: 0.15 + 0.075 * month.speedMs } },
      transparent: true,
      depthWrite: false,
    })
    this.lines = new THREE.LineSegments(geo, this.mat)
    this.lines.raycast = () => {} // a click goes through to the room
    this.lines.frustumCulled = false
    this.lines.renderOrder = 2
    this.add(this.lines)
  }

  /** The dashes drift on by dt seconds. */
  update(dt: number): void {
    this.mat.uniforms.time.value += dt
  }

  dispose(): void {
    this.lines.geometry.dispose()
    this.mat.dispose()
    this.removeFromParent()
  }
}

const dot = (p: { x: number; y: number }, d: { x: number; y: number }) => p.x * d.x + p.y * d.y
