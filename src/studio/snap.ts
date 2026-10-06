/** Pure snapping in plan meters. `tolM` = 10 screen px converted by the caller. */
import { nearestWall, wallFrame } from '../core'
import type { Id, OpeningKind, Pt, Unit, Wall } from '../core'

/** faces and columns pull this much of the corner / centre-line reach (founder 2026-10-06: weaker still) */
export const WEAK = 0.7

export interface Snap extends Pt {
  kind: 'vertex' | 'wall' | 'wall face' | 'column' | 'in line' | 'aligned x' | 'aligned y' | 'angle' | 'free'
  vertexId?: Id
  wallId?: Id
  /** direction from `from`, degrees, 0 = plan-right, clockwise on screen */
  angleDeg?: number
  guides: { axis: 'x' | 'y'; at: number }[]
}

/** snaps that fix a point in both axes (a dragged wall / a stretched end takes them whole) */
export const HARD = new Set<Snap['kind']>(['vertex', 'wall', 'wall face', 'column'])

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

  // the nearest coordinate within tolerance (the first one found could be a neighbour's a few cm off: a 179° corner)
  const nearest = (k: 'x' | 'y') => {
    const j = k === 'x' ? 'y' : 'x'
    let best: (typeof unit.vertices)[number] | undefined
    for (const v of unit.vertices)
      if (!ex.has(v.id) && Math.abs(v[k] - q[k]) <= o.tolM && Math.abs(v[j] - q[j]) > o.tolM && (!best || Math.abs(v[k] - q[k]) < Math.abs(best[k] - q[k]))) best = v
    return best
  }
  const alignX = () => {
    const v = nearest('x')
    if (v) {
      q = { x: v.x, y: q.y }
      guides.push({ axis: 'x', at: v.x })
      kind = 'aligned x'
    }
  }
  const alignY = () => {
    const v = nearest('y')
    if (v) {
      q = { x: q.x, y: v.y }
      guides.push({ axis: 'y', at: v.y })
      kind = kind === 'aligned x' ? 'aligned x' : 'aligned y'
    }
  }

  const walls = { vertices: unit.vertices, walls: unit.walls.filter((w) => !ex.has(w.a) && !ex.has(w.b)) }
  // in line (founder 2026-10-03: hand fixes without millimetre control left two walls meeting at 179°, a wedge in 3D):
  // within 3 cm of a wall's centre line past one of its ends, the point continues that wall — onto its line
  let line: { x: number; y: number; dir: Pt } | null = null
  let ld = Math.min(o.tolM, 0.03)
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  for (const w of walls.walls) {
    const a = V.get(w.a)!
    const b = V.get(w.b)!
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const s = (p.x - a.x) * dir.x + (p.y - a.y) * dir.y
    if (!(L > 1e-9) || (s >= 0 && s <= L)) continue // beside the wall itself: its corners / body snap
    const x = a.x + dir.x * s
    const y = a.y + dir.y * s
    const d = Math.hypot(p.x - x, p.y - y)
    if (d <= ld) (ld = d), (line = { x, y, dir })
  }
  const onLine = (l: NonNullable<typeof line>) => {
    q = { x: l.x, y: l.y }
    // an axis line keeps its guide and still aligns across (a diagonal one has no guide: nothing else may move it)
    if (Math.abs(l.dir.y) < 1e-9) guides.push({ axis: 'y', at: l.y }), alignX()
    else if (Math.abs(l.dir.x) < 1e-9) guides.push({ axis: 'x', at: l.x }), alignY()
    kind = 'in line'
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
    // drawing on from a wall's end along its line (the line runs through `from`): that line, not the rounded angle
    const l = line
    if (l && Math.abs((o.from.x - l.x) * l.dir.y - (o.from.y - l.y) * l.dir.x) < 1e-3) {
      onLine(l)
      ray = null
    } else if (Math.abs(ray.y) < 1e-9) alignX()
    else if (Math.abs(ray.x) < 1e-9) alignY()
  } else if (!o.from) {
    if (line) onLine(line)
    else {
      alignX()
      alignY()
    }
  }

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

  // weaker magnets (founder 2026-10-06): a column (centre, corners, faces) and a wall's two face lines
  const weak = o.tolM * WEAK
  const segHit = (A: Pt, B: Pt): Pt | null => {
    const L = Math.hypot(B.x - A.x, B.y - A.y)
    if (L < 1e-9) return null
    const dir = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }
    let hit: Pt | null = null
    if (ray && o.from) {
      // keep the angle exact: the ray meets the face line
      const den = ray.x * dir.y - ray.y * dir.x
      if (Math.abs(den) > 1e-9) {
        const wx = A.x - o.from.x
        const wy = A.y - o.from.y
        const s = (wx * dir.y - wy * dir.x) / den
        const u = (wx * ray.y - wy * ray.x) / den
        if (s > 0 && u >= 0 && u <= L) hit = { x: o.from.x + ray.x * s, y: o.from.y + ray.y * s }
      }
    }
    if (!hit) {
      const u = Math.max(0, Math.min(L, (q.x - A.x) * dir.x + (q.y - A.y) * dir.y))
      hit = { x: A.x + dir.x * u, y: A.y + dir.y * u }
    }
    return Math.hypot(hit.x - q.x, hit.y - q.y) <= weak ? hit : null
  }
  let best: { d: number; s: Snap } | null = null
  const take = (hit: Pt | null, kind: Snap['kind']) => {
    if (!hit) return
    const d = Math.hypot(hit.x - q.x, hit.y - q.y)
    if (!best || d < best.d) best = { d, s: { x: hit.x, y: hit.y, kind, angleDeg: o.from ? deg(o.from, hit) : undefined, guides: [] } }
  }
  for (const c of unit.pillars ?? []) {
    if (ex.has(c.id)) continue
    const cs = [
      { x: c.x - c.wM / 2, y: c.y - c.hM / 2 },
      { x: c.x + c.wM / 2, y: c.y - c.hM / 2 },
      { x: c.x + c.wM / 2, y: c.y + c.hM / 2 },
      { x: c.x - c.wM / 2, y: c.y + c.hM / 2 },
    ]
    for (const pt of [{ x: c.x, y: c.y }, ...cs]) take(Math.hypot(pt.x - q.x, pt.y - q.y) <= weak ? pt : null, 'column')
    for (let i = 0; i < 4; i++) take(segHit(cs[i], cs[(i + 1) % 4]), 'column')
  }
  for (const w of walls.walls) {
    const f = wallFrame(w, unit.vertices)
    const n = { x: (-f.dir.y * w.thicknessM) / 2, y: (f.dir.x * w.thicknessM) / 2 }
    const end = { x: f.origin.x + f.dir.x * f.lengthM, y: f.origin.y + f.dir.y * f.lengthM }
    for (const sg of [1, -1]) take(segHit({ x: f.origin.x + n.x * sg, y: f.origin.y + n.y * sg }, { x: end.x + n.x * sg, y: end.y + n.y * sg }), 'wall face')
  }
  if (best) {
    const b = (best as { s: Snap }).s
    const v1 = nearVertex(b)
    return v1 ? asVertex(v1) : b
  }
  const v1 = nearVertex(q)
  if (v1) return asVertex(v1)
  return { ...q, kind, angleDeg: o.from ? deg(o.from, q) : undefined, guides }
}

/**
 * A rigid move of `pts` (a dragged wall's ends, already moved with the cursor): each end snaps as
 * snapPoint does with the same tolerance. A corner/wall snap of either end wins (the smaller shift);
 * else each axis takes its smallest guide shift. Returns that shift and the Snap to draw.
 */
export function snapMove(pts: (Pt & { id: Id })[], unit: Unit, tolM: number): { dx: number; dy: number; snap: Snap } {
  const exclude = pts.map((p) => p.id)
  const snaps = pts.map((p) => ({ p, s: snapPoint(p, unit, { tolM, exclude }) }))
  const hard = snaps
    .filter(({ s }) => HARD.has(s.kind))
    .sort((m, n) => Math.hypot(m.s.x - m.p.x, m.s.y - m.p.y) - Math.hypot(n.s.x - n.p.x, n.s.y - n.p.y))[0]
  if (hard) return { dx: hard.s.x - hard.p.x, dy: hard.s.y - hard.p.y, snap: hard.s }
  const best: Record<'x' | 'y', { d: number; g: Snap['guides'][number] } | undefined> = { x: undefined, y: undefined }
  for (const { p, s } of snaps) {
    for (const g of s.guides) {
      const d = g.at - p[g.axis]
      if (!best[g.axis] || Math.abs(d) < Math.abs(best[g.axis]!.d)) best[g.axis] = { d, g }
    }
  }
  const dx = best.x?.d ?? 0
  const dy = best.y?.d ?? 0
  const guides = [best.x?.g, best.y?.g].filter((g) => g !== undefined)
  return { dx, dy, snap: { x: pts[0].x + dx, y: pts[0].y + dy, kind: best.x ? 'aligned x' : best.y ? 'aligned y' : 'free', guides } }
}

export type OpeningSnap = 'corner' | OpeningKind | null

/**
 * Edge snap for an opening `widthM` wide centred on `uM` along a wall `lengthM` long: its nearer
 * edge goes flush to a wall end or to a neighbouring opening's edge (not `excludeId`) when that
 * shift is the smallest and within `tolM`; otherwise it stays centred. Clamped inside the wall
 * like placeOpening, so an opening pushed against a wall end reports 'corner'.
 */
export function snapOpeningOffset(
  wall: Wall,
  lengthM: number,
  uM: number,
  widthM: number,
  tolM: number,
  excludeId?: Id,
): { offsetM: number; snapped: OpeningSnap } {
  const max = lengthM - widthM
  const c = Math.max(0, Math.min(max, uM - widthM / 2))
  let best: { offsetM: number; snapped: OpeningSnap } = { offsetM: c, snapped: null }
  let bd = tolM
  const at = (offsetM: number, snapped: OpeningSnap) => {
    const d = Math.abs(offsetM - c)
    if (offsetM < -1e-9 || offsetM > max + 1e-9 || d > bd) return
    bd = d
    best = { offsetM, snapped }
  }
  at(0, 'corner')
  at(max, 'corner')
  for (const o of wall.openings) {
    if (o.id === excludeId) continue
    at(o.offsetM + o.widthM, o.kind)
    at(o.offsetM - widthM, o.kind)
  }
  return best
}
