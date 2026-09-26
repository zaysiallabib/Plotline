/**
 * Frame coverage (pure, Vitest-covered): the share of a first frame each wall, door leaf and piece of furniture
 * fills — a coarse ray grid through the viewer's camera, first hit wins. Distance rules cannot see a wardrobe 3 m
 * off that fills 40 % of the frame, or an ajar leaf beside the eye; this can.
 */
import * as core from '../core'
import type { Opening, Pt, Unit, Wall } from '../core'
import { heightRange, kitAsset } from '../furnish/kit'

/** Eye height (PlotlineScene). */
export const EYE = 1.6
/** PlotlineScene's camera: 65° vertical FOV; the frame is 16:9 (a laptop, the score shots). */
const TAN_V = Math.tan((32.5 * Math.PI) / 180)
const TAN_H = (16 / 9) * TAN_V
const NX = 32
const NY = 18
/** openings.ts buildDoor: a swinging leaf renders ajar 20°, hinged on its jamb, on the swing face. */
const AJAR = (20 * Math.PI) / 180

/** A vertical rectangle: from o along the unit plan direction d, u ∈ [u0, u1], height ∈ [h0, h1]. */
type Quad = { id: string; o: Pt; d: Pt; u0: number; u1: number; h0: number; h1: number }
/** A piece's box: centre c, local axes ex (width) / ey (front), half sizes hx / hy, height ∈ [h0, h1]. */
type Box = { id: string; c: Pt; ex: Pt; ey: Pt; hx: number; hy: number; h0: number; h1: number }

/** A swinging door (hinged, or narrower than a slider as openings.ts builds it): the only openings with a leaf. */
export const swings = (o: Opening) => o.kind === 'door' && (!!o.hinge || o.widthM < 1.2)

/** The leaf of a swinging door as openings.ts builds it: pivot at the hinge jamb on the swing face, ajar 20° toward it. */
function leafQuad(o: Opening, w: Wall, unit: Unit): Quad {
  const f = core.wallFrame(w, unit.vertices)
  const sx = o.hinge === 'b' ? -1 : 1
  const sw = o.swing === 'in' ? -1 : 1
  const at = (u: number, n: number): Pt => ({ x: f.origin.x + f.dir.x * u + f.normal.x * n, y: f.origin.y + f.dir.y * u + f.normal.y * n })
  const d = { x: sx * Math.cos(AJAR) * f.dir.x + sw * Math.sin(AJAR) * f.normal.x, y: sx * Math.cos(AJAR) * f.dir.y + sw * Math.sin(AJAR) * f.normal.y }
  return { id: o.id, o: at(o.hinge === 'b' ? o.offsetM + o.widthM : o.offsetM, (sw * w.thicknessM) / 2), d, u0: 0.03, u1: o.widthM - 0.03, h0: o.sillM, h1: o.sillM + o.heightM - 0.03 }
}

type Scene = { walls: Unit['walls']; furniture: Unit['furniture']; quads: Quad[]; boxes: Box[]; top: number }
const cache = new WeakMap<Unit, Scene>()
const scene = (unit: Unit): Scene => {
  const hit = cache.get(unit)
  if (hit && hit.walls === unit.walls && hit.furniture === unit.furniture) return hit
  const quads: Quad[] = []
  for (const w of unit.walls) {
    const f = core.wallFrame(w, unit.vertices)
    for (const p of core.wallPieces(w, f.lengthM)) quads.push({ id: w.id, o: f.origin, d: f.dir, u0: p.u0, u1: p.u1, h0: p.v0, h1: p.v1 })
    for (const o of w.openings) if (swings(o)) quads.push(leafQuad(o, w, unit))
  }
  const boxes = unit.furniture.flatMap((f) => {
    const k = kitAsset(f.assetId)
    if (!k || k.mount === 'ceiling' || k.category === 'rug') return []
    const r = (f.rotationDeg * Math.PI) / 180
    const s = f.scale ?? 1
    const [h0, h1] = heightRange(k)
    return [{ id: f.id, c: f, ex: { x: Math.cos(r), y: Math.sin(r) }, ey: { x: -Math.sin(r), y: Math.cos(r) }, hx: (k.sizeM.x * s) / 2, hy: (k.sizeM.z * s) / 2, h0, h1 }]
  })
  const s = { walls: unit.walls, furniture: unit.furniture, quads, boxes, top: Math.max(...unit.walls.map((w) => w.heightM)) }
  cache.set(unit, s)
  return s
}

/** One ray's share of the frame. */
export const RAY = 1 / (NX * NY)

/**
 * Share of the frame (0–1) whose first hit is each wall (by wall id), door leaf (by opening id) or piece (by
 * placement id), seen from p at eye height looking along the plan direction `face`, `pitch` radians up (< 0 down).
 * Hits farther than `within` m don't count.
 */
export function frameShares(unit: Unit, p: Pt, face: Pt, pitch = 0, within = Infinity): Map<string, number> {
  const out = new Map<string, number>()
  for (const h of frameHits(unit, p, face, pitch)) if (h.t <= within) out.set(h.id, (out.get(h.id) ?? 0) + RAY)
  return out
}

/**
 * The first hit (id, distance in m) of each ray of a 32 × 18 grid through the frame; floor, ceiling and the view out of
 * a window or passage are no hit. Walls are their centre planes, pieces their bounding boxes (overhead pieces and rugs
 * left out).
 */
export function frameHits(unit: Unit, p: Pt, face: Pt, pitch = 0): { id: string; t: number }[] {
  const { quads, boxes, top } = scene(unit)
  const L = Math.hypot(face.x, face.y) || 1
  const fx = face.x / L
  const fy = face.y / L
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // cull what lies wholly outside the frame's plan wedge (every ray heads within ±atan(tanA) of face in plan)
  const minFwd = cp - TAN_V * Math.abs(sp)
  const tanA = minFwd > 0.05 ? TAN_H / minFwd : Infinity
  const outside = (pts: Pt[]) => {
    let l = true
    let r = true
    let b = true
    for (const q of pts) {
      const fw = (q.x - p.x) * fx + (q.y - p.y) * fy
      const rt = (q.y - p.y) * fx - (q.x - p.x) * fy
      l &&= -rt > tanA * fw
      r &&= rt > tanA * fw
      b &&= fw < 0
    }
    return l || r || b
  }
  const qs = quads.filter((q) => !outside([q.u0, q.u1].map((u) => ({ x: q.o.x + q.d.x * u, y: q.o.y + q.d.y * u }))))
  const bs = boxes.filter((b) => !outside([-1, 1].flatMap((i) => [-1, 1].map((k) => ({ x: b.c.x + b.ex.x * b.hx * i + b.ey.x * b.hy * k, y: b.c.y + b.ex.y * b.hx * i + b.ey.y * b.hy * k })))))
  const out: { id: string; t: number }[] = []
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const sx = (((i + 0.5) / NX) * 2 - 1) * TAN_H
      const sy = (1 - ((j + 0.5) / NY) * 2) * TAN_V
      // forward (f cos, sin) + sx · right (−f.y, f.x, 0) + sy · up (−f sin, cos)
      let dx = fx * cp - sx * fy - sy * fx * sp
      let dy = fy * cp + sx * fx - sy * fy * sp
      let dz = sp + sy * cp
      const n = Math.hypot(dx, dy, dz)
      dx /= n
      dy /= n
      dz /= n
      // floor / ceiling bound the ray
      let best = dz < 0 ? -EYE / dz : dz > 0 ? (top - EYE) / dz : Infinity
      let id: string | null = null
      for (const q of qs) {
        const den = dx * -q.d.y + dy * q.d.x
        if (Math.abs(den) < 1e-9) continue
        const t = ((q.o.x - p.x) * -q.d.y + (q.o.y - p.y) * q.d.x) / den
        if (t <= 0.05 || t >= best) continue
        const u = (p.x + dx * t - q.o.x) * q.d.x + (p.y + dy * t - q.o.y) * q.d.y
        const h = EYE + dz * t
        if (u >= q.u0 && u <= q.u1 && h >= q.h0 && h <= q.h1) {
          best = t
          id = q.id
        }
      }
      for (const b of bs) {
        // slab test in the box's frame: across its width, its depth, its height
        const rx = p.x - b.c.x
        const ry = p.y - b.c.y
        const [a0, a1] = slabT(rx * b.ex.x + ry * b.ex.y, dx * b.ex.x + dy * b.ex.y, b.hx)
        const [c0, c1] = slabT(rx * b.ey.x + ry * b.ey.y, dx * b.ey.x + dy * b.ey.y, b.hy)
        const [e0, e1] = slabT(EYE - (b.h0 + b.h1) / 2, dz, (b.h1 - b.h0) / 2)
        const t0 = Math.max(0.05, a0, c0, e0)
        if (t0 < Math.min(best, a1, c1, e1)) {
          best = t0
          id = b.id
        }
      }
      if (id) out.push({ id, t: best })
    }
  return out
}

/** Entry and exit distance of a ray (origin o, direction v, along one axis) through the slab |x| ≤ h. */
const slabT = (o: number, v: number, h: number): [number, number] => {
  if (Math.abs(v) < 1e-12) return Math.abs(o) <= h ? [-Infinity, Infinity] : [Infinity, -Infinity]
  const a = (-h - o) / v
  const c = (h - o) / v
  return a < c ? [a, c] : [c, a]
}
