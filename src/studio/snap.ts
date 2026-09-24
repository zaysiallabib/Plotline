/** Pure snapping in plan meters. `tolM` = 10 screen px converted by the caller. */
import { nearestWall, wallFrame } from '../core'
import type { Id, Pt, Unit } from '../core'

export interface Snap extends Pt {
  kind: 'vertex' | 'wall' | 'aligned x' | 'aligned y' | 'angle' | 'free'
  vertexId?: Id
  wallId?: Id
  /** direction from `from`, degrees, 0 = plan-right, clockwise on screen */
  angleDeg?: number
  guides: { axis: 'x' | 'y'; at: number }[]
}

const deg = (from: Pt, to: Pt): number => ((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 360) % 360

export function snapPoint(
  p: Pt,
  unit: Unit,
  o: { tolM: number; from?: Pt; free?: boolean; exclude?: Id[] },
): Snap {
  const ex = new Set(o.exclude ?? [])
  const nearVertex = (q: Pt) => {
    let best: (typeof unit.vertices)[number] | null = null
    let bd = o.tolM
    for (const v of unit.vertices) {
      if (ex.has(v.id)) continue
      const d = Math.hypot(v.x - q.x, v.y - q.y)
      if (d <= bd) {
        bd = d
        best = v
      }
    }
    return best
  }
  const asVertex = (v: { id: Id; x: number; y: number }): Snap => ({
    x: v.x,
    y: v.y,
    kind: 'vertex',
    vertexId: v.id,
    angleDeg: o.from ? deg(o.from, v) : undefined,
    guides: [],
  })

  const v0 = nearVertex(p)
  if (v0) return asVertex(v0)

  let q: Pt = { x: p.x, y: p.y }
  let kind: Snap['kind'] = 'free'
  const guides: Snap['guides'] = []
  let ray: Pt | null = null

  const alignX = () => {
    const v = unit.vertices.find((v) => !ex.has(v.id) && Math.abs(v.x - q.x) <= o.tolM && Math.abs(v.y - q.y) > o.tolM)
    if (v) {
      q = { x: v.x, y: q.y }
      guides.push({ axis: 'x', at: v.x })
      kind = 'aligned x'
    }
  }
  const alignY = () => {
    const v = unit.vertices.find((v) => !ex.has(v.id) && Math.abs(v.y - q.y) <= o.tolM && Math.abs(v.x - q.x) > o.tolM)
    if (v) {
      q = { x: q.x, y: v.y }
      guides.push({ axis: 'y', at: v.y })
      kind = kind === 'aligned x' ? 'aligned x' : 'aligned y'
    }
  }

  if (o.from && !o.free) {
    const dx = p.x - o.from.x
    const dy = p.y - o.from.y
    const step = Math.PI / 4
    const ang = Math.round(Math.atan2(dy, dx) / step) * step
    ray = { x: Math.cos(ang), y: Math.sin(ang) }
    const d = Math.max(0, dx * ray.x + dy * ray.y)
    q = { x: o.from.x + ray.x * d, y: o.from.y + ray.y * d }
    kind = 'angle'
    if (Math.abs(ray.y) < 1e-9) alignX()
    else if (Math.abs(ray.x) < 1e-9) alignY()
  } else if (!o.from) {
    alignX()
    alignY()
  }

  const walls = { vertices: unit.vertices, walls: unit.walls.filter((w) => !ex.has(w.a) && !ex.has(w.b)) }
  const nw = nearestWall(q, walls)
  if (nw && nw.distanceM <= o.tolM) {
    const f = wallFrame(nw.wall, unit.vertices)
    let hit: Pt = { x: f.origin.x + f.dir.x * nw.t * f.lengthM, y: f.origin.y + f.dir.y * nw.t * f.lengthM }
    if (ray && o.from) {
      // intersect the snapped ray with the wall line so the angle stays exact
      const den = ray.x * f.dir.y - ray.y * f.dir.x
      if (Math.abs(den) > 1e-9) {
        const wx = f.origin.x - o.from.x
        const wy = f.origin.y - o.from.y
        const s = (wx * f.dir.y - wy * f.dir.x) / den
        const u = (wx * ray.y - wy * ray.x) / den
        if (s > 0 && u > o.tolM && u < f.lengthM - o.tolM) hit = { x: o.from.x + ray.x * s, y: o.from.y + ray.y * s }
      }
    }
    const u = (hit.x - f.origin.x) * f.dir.x + (hit.y - f.origin.y) * f.dir.y
    if (u > o.tolM && u < f.lengthM - o.tolM) {
      q = hit
      kind = 'wall'
      const v1 = nearVertex(q)
      if (v1) return asVertex(v1)
      return { ...q, kind, wallId: nw.wall.id, angleDeg: o.from ? deg(o.from, q) : undefined, guides }
    }
  }
  const v1 = nearVertex(q)
  if (v1) return asVertex(v1)
  return { ...q, kind, angleDeg: o.from ? deg(o.from, q) : undefined, guides }
}
