/**
 * Wind in the 3D view (founder 2026-10-18: "don't make them sloppy and tacky … be classy"): a breeze of thin streamlines —
 * a sheet of them at each outside opening facing within 60° of the month's wind, across its width and up its height
 * (windLanes; founder 2026-11-20: "make the lines taller"), each a gently curved line that fades in at the window, crosses
 * the room and fades out past the opening on its far side (core.roomWind), or fades out in the room when it has none.
 * Long soft dashes drift along them, slowly. 2 px, the season's tint, no arrowheads. Lines at a window behind a taller
 * block upwind (core.sheltered: the site's, or the made-up street's) are fainter. A guide, not a flow model.
 */
import * as THREE from 'three'
import * as core from '../core'
import type { Room, Unit, WindMonth } from '../core'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js'

/** metres outside an opening where a line starts (and fades in) / ends past the far one (and fades out) */
const OUT_M = 1.6
/** one dash and its gap along a line, m */
const PERIOD_M = 1.4
/**
 * The lines' tint by season, quiet: the monsoon a cool blue, winter a pale grey-blue, the hot months a muted terracotta, the
 * months between a slate.
 */
export const SEASON_TINT: Record<core.Season, string> = {
  monsoon: '#46709a',
  winter: '#7d8fa3',
  'pre-monsoon': '#b06f45',
  summer: '#b06f45',
  'post-monsoon': '#5c7286',
  spring: '#5c7286',
  autumn: '#5c7286',
}
const OPACITY = 0.95
/** screen pixels (CSS) */
const WIDTH_PX = 2
/** a line at a sheltered window: this much of the others' opacity */
const SHELTERED = 0.5

export class WindFlow extends THREE.Group {
  private readonly mat: LineMaterial
  private readonly lines: LineSegments2
  private readonly speed: number

  /** `blocks`: what stands round the flat (context.ts neighbours) — a window behind one upwind gets the fainter lines */
  constructor(unit: Unit, rooms: Room[], month: WindMonth, tint = SEASON_TINT.monsoon, blocks: { plan: core.Pt[]; heightM: number }[] = core.sitePlan(unit).buildings) {
    super()
    const byId = new Map(rooms.map((r) => [r.id, r]))
    const pos: number[] = []
    /** per segment end: its distance along its line; its colour carries (fade × shelter, the line's dash phase, 0) */
    const dist: number[] = []
    const cols: number[] = []
    let lane = 0
    for (const rw of core.roomWind(unit, rooms, month.fromDeg)) {
      const r = byId.get(rw.roomId)!
      const exit = rw.exit // where it leaves: the outlet farthest downwind (core.roomWind)
      for (const o of rw.inlets) {
        const k = core.sheltered(unit, o.at, month.fromDeg, blocks) ? SHELTERED : 1
        const side = { x: -o.out.y, y: o.out.x }
        // the far opening's across, turned the same way as this one's so the lines never cross over
        const xs = exit && dot({ x: -exit.out.y, y: exit.out.x }, side) < 0 ? -1 : 1
        for (const { f, up } of windLanes(o.widthM, Math.min(o.headM, 2.4) - o.sillM)) {
          const on = (w: core.WindOpening, s: number) => {
            const across = { x: -w.out.y * s, y: w.out.x * s }
            const x = w.at.x + across.x * f * Math.max(0.1, w.widthM - 0.2)
            const y = w.at.y + across.y * f * Math.max(0.1, w.widthM - 0.2)
            const h = w.sillM + up * (Math.min(w.headM, 2.4) - w.sillM) // the same share of each opening's height
            return { x, y, h: core.roomLevelAt(r, unit, x, y) + h }
          }
          const a = on(o, 1)
          const V = (p: { x: number; y: number; h: number }, d = { x: 0, y: 0 }, m = 0) => new THREE.Vector3(p.x + d.x * m, p.h, p.y + d.y * m)
          const pts = [V(a, o.out, OUT_M), V(a)]
          if (exit) {
            const b = on(exit, xs)
            // a gentle bow half-way, the same way for every line of the opening: a breeze, not a ruler
            // half-way they fan out (the lane × 1.2 m) and bow a little, the same way: dense at the two openings, a breeze between
            // (scaled down on a short way across, a corner: a full fan there tied the lines in knots)
            const fan = Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 4) * (0.25 + f * 1.2)
            const mid = { x: (a.x + b.x) / 2 + side.x * fan, y: (a.y + b.y) / 2 + side.y * fan, h: (a.h + b.h) / 2 }
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
              dist.push(s[q])
              cols.push(k * THREE.MathUtils.smoothstep(s[q], 0, OUT_M) * THREE.MathUtils.smoothstep(len - s[q], 0, OUT_M), seed, 0)
            }
          }
        }
      }
    }
    const geo = new LineSegmentsGeometry().setPositions(pos).setColors(cols)
    const d = new THREE.InstancedInterleavedBuffer(new Float32Array(dist), 2, 1)
    geo.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(d, 1, 0))
    geo.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(d, 1, 1))
    // three's screen-width lines; their hard dash swapped for a soft one that drifts, faded by the colour's red (above)
    this.mat = new LineMaterial({ color: tint, linewidth: WIDTH_PX, dashed: true, vertexColors: true, transparent: true, opacity: OPACITY, depthWrite: false })
    this.mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX', '')
        .replace(
          'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
          `float ph = fract( ( vLineDistance + dashOffset ) / ${PERIOD_M.toFixed(2)} + vColor.g );
          alpha *= vColor.r * smoothstep( 0.0, 0.15, ph ) * ( 1.0 - smoothstep( 0.6, 0.8, ph ) );
          gl_FragColor = vec4( diffuse, alpha );`,
        )
    }
    // a slow, steady drift: 0.25–0.45 m/s on screen for 1.5–4 m/s outside
    this.speed = 0.15 + 0.075 * month.speedMs
    this.lines = new LineSegments2(geo, this.mat)
    const size = new THREE.Vector2()
    this.lines.onBeforeRender = (renderer) => {
      this.mat.resolution.copy(renderer.getDrawingBufferSize(size))
      this.mat.linewidth = WIDTH_PX * renderer.getPixelRatio()
    }
    this.lines.raycast = () => {} // a click goes through to the room
    this.lines.frustumCulled = false
    this.lines.renderOrder = 2
    this.add(this.lines)
  }

  /** The dashes drift on by dt seconds. */
  update(dt: number): void {
    this.mat.dashOffset -= this.speed * dt
  }

  dispose(): void {
    this.lines.geometry.dispose()
    this.mat.dispose()
    this.removeFromParent()
  }
}

const dot = (p: { x: number; y: number }, d: { x: number; y: number }) => p.x * d.x + p.y * d.y

/** the lines' share of an opening's height: from a quarter up to nine tenths (a window: sill → head; a door: the leaf) */
export const LANE_UP: [number, number] = [0.25, 0.9]

/**
 * Where an opening's lines cross it (founder 2026-11-20: "make the lines taller"): a sheet of air, not two threads —
 * `rows` heights spread evenly over LANE_UP of the opening's height (`heightM`: a 1.2 m window 3, a door 5), the same
 * `cols` across its width in every row (one every 0.6 m, 2–5): each column a stack of lines, one above the other. f: across
 * the opening, −0.5..0.5 of its width; up: share of its height.
 */
export function windLanes(widthM: number, heightM: number): { f: number; up: number }[] {
  const rows = THREE.MathUtils.clamp(Math.round(heightM / 0.35), 3, 5)
  const cols = THREE.MathUtils.clamp(Math.round(widthM / 0.6), 2, 5)
  const out: { f: number; up: number }[] = []
  for (let j = 0; j < rows; j++) {
    const up = LANE_UP[0] + ((LANE_UP[1] - LANE_UP[0]) * j) / (rows - 1)
    for (let i = 0; i < cols; i++) out.push({ f: (i + 0.5) / cols - 0.5, up })
  }
  return out
}
