/**
 * The 2D drawing engine shared by DXF (dxf.ts) and vector PDF (pdf.ts): the file's EXACT lines, arcs and texts, in the
 * file's own frame (y up, file units) → one Unit draft in plan metres (x right, y down, origin at the walls' top-left).
 * No guessing engine (that is src/trace, for pictures): direct geometry.
 *
 *  walls     two parallel lines 5–60 cm apart with overlapping extents = one wall on their centre line, as thick as the gap
 *            (snapped to PARTITION_M / EXTERIOR_M within 2 cm); collinear pieces merge; a gap of 0.3–3.5 m between two
 *            pieces on one line is an opening; wall ends reach the crossing wall's centre line (an L or a T); then the
 *            Studio's own joinOverlaps (shared corners, T-splits, crossings) + normalizeUnit.
 *  openings  a quarter-circle arc hinged on a wall = a door as wide as its radius (hinge at the arc's centre, swing toward
 *            the arc); a door / window block (DOOR*, WIN*, D-xx, W-xx, …SLID… = slider) over a wall = that opening; lines
 *            along the wall inside a gap = a window; a bare gap = a passage.
 *  columns   a closed small (0.2–1.2 m) rectangle / solid / circle on a column layer, or on a wall layer = a pillar.
 *  labels    a text inside a closed room names it (guessKind); the size text in the room ("14'-0\" x 16'-0\"", "4200 x
 *            3600") = printedSize; a flat-name text ("TYPE-A ±2736 SFT") = a label of kind 'other' (core.flatTypeOf).
 * The layer → meaning table (roleOf) is what the notes show staff.
 */
import { FT, deriveRooms, flatTypeOf, newId, pointInPolygon, roomPolygon, validate } from '../core'
import type { Opening, OpeningKind, Pillar, Pt, Room, RoomLabel, Unit, ValidationIssue } from '../core'
import { EXTERIOR_M, PARTITION_M, WALL_HEIGHT_M, emptyUnit, guessKind, joinOverlaps, normalizeUnit, openingDefaults } from '../studio/model'
import { parseArea, parseDims } from '../trace/text'

export type Role = 'wall' | 'door' | 'window' | 'column' | 'text' | 'dim' | 'ignore' | 'unknown'

/** What a layer name means. The block a primitive came from (door / window blocks) wins over its layer. */
export function roleOf(layer: string, block?: string): Role {
  if (block) {
    if (/SLID|DOOR|^D[-_]?\d|^DR\b/i.test(block)) return 'door'
    if (/WIN|GLAZ|^W[-_]?\d/i.test(block)) return 'window'
    if (/COL|PILLAR/i.test(block)) return 'column'
  }
  const L = layer.toUpperCase()
  if (/HATCH|FURN|FIX|SANIT|ELEC|GRID|AXIS|TITLE|BORDER|SHEET|VIEWPORT|DEFPOINTS|DEFPOINT|PLUMB|LIGHT|STAIR|RAIL/.test(L)) return 'ignore'
  if (/DIM/.test(L)) return 'dim'
  if (/COL|PILLAR|STRUCT-COL|A-COLS/.test(L)) return 'column'
  if (/DOOR|A-DOOR|PORTE|TUR|\bDR\b|^DR$|[-_]DR$/.test(L)) return 'door'
  if (/WIND|GLAZ|A-GLAZ|FEN|FENSTER|WIN/.test(L)) return 'window'
  if (/WALL|A-WALL|MUR|PARED|WAND|BRICK|CONC|STRUCT/.test(L)) return 'wall'
  if (/TEXT|ROOM|NAME|LABEL|ANNO/.test(L)) return 'text'
  return 'unknown'
}

/** A line of the file (file frame, file units); `block` / `inst` = the block it came from and which insert of it. */
export interface Seg {
  a: Pt
  b: Pt
  layer: string
  block?: string
  inst?: number
}
/** An arc, counter-clockwise from a0 to a1 (radians, file frame). */
export interface ArcPrim {
  c: Pt
  r: number
  a0: number
  a1: number
  layer: string
  block?: string
  inst?: number
}
export interface TextPrim {
  at: Pt
  text: string
  layer: string
  height: number
}
/** A closed shape (polyline, solid, circle): a column candidate. */
export interface Loop {
  pts: Pt[]
  layer: string
}

export interface Drawing {
  segs: Seg[]
  arcs: ArcPrim[]
  texts: TextPrim[]
  loops: Loop[]
  /** file units → metres */
  scale: number
}

export interface Counts {
  lines: number
  walls: number
  openings: number
  columns: number
  labels: number
  rooms: number
  closedRooms: number
  textsOutside: number
  singleLines: number
}

export interface Plan2dResult {
  unit: Unit
  rooms: Room[]
  issues: ValidationIssue[]
  counts: Counts
  /** file x / y of the plan origin (the walls' top-left corner) */
  origin: Pt
  notes: string[]
}

const WALL_MIN = 0.04
const WALL_MAX = 0.6
const SNAP_THICK = 0.02
const MIN_GAP = 0.3
const MAX_GAP = 3.5
const PAR = Math.sin((1.5 * Math.PI) / 180)

interface Piece {
  a: Pt
  b: Pt
  thick: number
  dir: Pt
  n: Pt
  /** perpendicular coordinate of its line (p · n) and its extent along dir */
  c: number
  t0: number
  t1: number
}

interface WallDraft extends Piece {
  openings: { kind: OpeningKind; t0: number; t1: number; hinge?: 'a' | 'b'; swing?: 'in' | 'out' }[]
}

const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y })
const dot = (p: Pt, q: Pt): number => p.x * q.x + p.y * q.y
const crossZ = (p: Pt, q: Pt): number => p.x * q.y - p.y * q.x
const len = (p: Pt): number => Math.hypot(p.x, p.y)

/** direction folded to the half plane (angle in [0, π)), so parallel lines share it whichever way they were drawn */
function folded(a: Pt, b: Pt): { dir: Pt; n: Pt } {
  const L = len(sub(b, a))
  let dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
  if (dir.y < 0 || (dir.y === 0 && dir.x < 0)) dir = { x: -dir.x, y: -dir.y }
  return { dir, n: { x: -dir.y, y: dir.x } }
}

const snapThick = (d: number): number => (Math.abs(d - PARTITION_M) <= SNAP_THICK ? PARTITION_M : Math.abs(d - EXTERIOR_M) <= SNAP_THICK ? EXTERIOR_M : Math.round(d * 1000) / 1000)

function piece(a: Pt, b: Pt, thick: number): Piece {
  const { dir, n } = folded(a, b)
  const ta = dot(a, dir), tb = dot(b, dir)
  return { a: ta <= tb ? a : b, b: ta <= tb ? b : a, thick, dir, n, c: dot(a, n), t0: Math.min(ta, tb), t1: Math.max(ta, tb) }
}

/**
 * Parallel line pairs → centre-line pieces. ponytail: O(n²) within an angle bucket; bucket by offset if a 50k-line
 * plan ever shows up.
 */
function pairWalls(lines: { a: Pt; b: Pt }[]): Piece[] {
  // (a wall face is seldom under 15 cm; shorter strokes are hatching, text outlines, arrow heads)
  const ls = lines.map((l) => ({ ...l, ...folded(l.a, l.b), L: len(sub(l.b, l.a)) })).filter((l) => l.L >= 0.15)
  const ang = (l: { dir: Pt }) => Math.atan2(l.dir.y, l.dir.x)
  const buckets = new Map<number, number[]>()
  const B = 3 * (Math.PI / 180)
  const NB = Math.round(Math.PI / B)
  ls.forEach((l, i) => {
    const k = Math.floor(ang(l) / B) % NB
    ;(buckets.get(k) ?? buckets.set(k, []).get(k)!).push(i)
  })
  const out: Piece[] = []
  for (const [k, ids] of buckets) {
    const near = [...ids, ...(buckets.get((k + 1) % NB) ?? [])]
    const same = new Set(ids)
    for (const i of ids) {
      const li = ls[i]
      for (const j of near) {
        if (j <= i && same.has(j)) continue // each pair once inside a bucket
        const lj = ls[j]
        if (Math.abs(crossZ(li.dir, lj.dir)) > PAR) continue
        const d0 = dot(sub(lj.a, li.a), li.n), d1 = dot(sub(lj.b, li.a), li.n)
        if (Math.abs(d0 - d1) > 0.02) continue
        const d = (d0 + d1) / 2
        const ad = Math.abs(d)
        if (ad < WALL_MIN || ad > WALL_MAX) continue
        const ti = [dot(li.a, li.dir), dot(li.b, li.dir)].sort((p, q) => p - q)
        const tj = [dot(lj.a, li.dir), dot(lj.b, li.dir)].sort((p, q) => p - q)
        const o0 = Math.max(ti[0], tj[0]), o1 = Math.min(ti[1], tj[1])
        if (o1 - o0 < Math.max(0.15, 1.2 * ad)) continue
        // nothing parallel between them over the overlap: the two are the faces of ONE wall
        const between = near.some((m) => {
          if (m === i || m === j) return false
          const lm = ls[m]
          if (Math.abs(crossZ(li.dir, lm.dir)) > PAR) return false
          const dm = dot(sub(lm.a, li.a), li.n)
          if (!(Math.min(0, d) + 0.02 < dm && dm < Math.max(0, d) - 0.02)) return false
          const tm = [dot(lm.a, li.dir), dot(lm.b, li.dir)].sort((p, q) => p - q)
          return Math.min(o1, tm[1]) - Math.max(o0, tm[0]) > 0.5 * (o1 - o0)
        })
        if (between) continue
        const base = { x: li.a.x + (li.n.x * d) / 2, y: li.a.y + (li.n.y * d) / 2 }
        const s0 = dot(li.a, li.dir)
        const A = { x: base.x + li.dir.x * (o0 - s0), y: base.y + li.dir.y * (o0 - s0) }
        const Bp = { x: base.x + li.dir.x * (o1 - s0), y: base.y + li.dir.y * (o1 - s0) }
        out.push(piece(A, Bp, snapThick(ad)))
      }
    }
  }
  return out
}

/** Collinear pieces (same line within 2 cm) merged: overlaps and gaps < MIN_GAP become one, gaps of MIN_GAP–MAX_GAP an opening. */
function mergeCollinear(pieces: Piece[]): WallDraft[] {
  const groups: Piece[][] = []
  const sorted = [...pieces].sort((p, q) => Math.atan2(p.dir.y, p.dir.x) - Math.atan2(q.dir.y, q.dir.x) || p.c - q.c)
  for (const p of sorted) {
    const g = groups.find((g) => Math.abs(crossZ(g[0].dir, p.dir)) <= PAR && Math.abs(dot(sub(p.a, g[0].a), g[0].n)) <= 0.02)
    if (g) g.push(p)
    else groups.push([p])
  }
  const walls: WallDraft[] = []
  for (const g of groups) {
    const ref = g[0]
    const runs = g.map((p) => ({ t0: dot(p.a, ref.dir), t1: dot(p.b, ref.dir), thick: p.thick })).sort((p, q) => p.t0 - q.t0)
    let cur: WallDraft | null = null
    const at = (t: number): Pt => ({ x: ref.a.x + ref.dir.x * (t - dot(ref.a, ref.dir)), y: ref.a.y + ref.dir.y * (t - dot(ref.a, ref.dir)) })
    for (const r of runs) {
      if (cur && r.t0 <= cur.t1 + MAX_GAP) {
        const gap = r.t0 - cur.t1
        if (gap >= MIN_GAP) cur.openings.push({ kind: 'passage', t0: cur.t1, t1: r.t0 })
        if (r.t1 - r.t0 > cur.t1 - cur.t0 && Math.abs(r.thick - cur.thick) > SNAP_THICK && gap < MIN_GAP && r.t0 > cur.t0 + 0.05) {
          // a thicker / thinner run on the same line: its own wall from here
          cur.b = at(r.t0)
          cur.t1 = r.t0
          walls.push(cur)
          cur = null
        } else {
          if (r.t1 > cur.t1) (cur.t1 = r.t1), (cur.b = at(r.t1))
          continue
        }
      } else if (cur) walls.push(cur)
      cur = { ...ref, a: at(r.t0), b: at(r.t1), t0: r.t0, t1: r.t1, thick: r.thick, c: dot(at(r.t0), ref.n), openings: [] }
    }
    if (cur) walls.push(cur)
  }
  return walls
}

/** A wall end within the other's half thickness of a crossing wall's centre line comes onto it (an L stops short, a T meets). */
function meetEnds(walls: WallDraft[]): void {
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      const E = w[end]
      let best: { P: Pt; d: number } | null = null
      for (const v of walls) {
        if (v === w || Math.abs(crossZ(w.dir, v.dir)) <= PAR) continue
        const den = crossZ(w.dir, v.dir)
        const s = crossZ(sub(v.a, E), v.dir) / den // E + w.dir·s = P
        const P = { x: E.x + w.dir.x * s, y: E.y + w.dir.y * s }
        const tv = dot(P, v.dir)
        if (tv < v.t0 - w.thick / 2 - 0.03 || tv > v.t1 + w.thick / 2 + 0.03) continue
        const towardIn = end === 'a' ? s > 0 : s < 0 // the move shortens w
        if (Math.abs(s) > Math.max(v.thick, w.thick) + 0.05 || (towardIn && Math.abs(s) > w.t1 - w.t0 - 0.05)) continue
        if (!best || Math.abs(s) < best.d) best = { P, d: Math.abs(s) }
      }
      if (!best) continue
      w[end] = best.P
      w.t0 = dot(w.a, w.dir)
      w.t1 = dot(w.b, w.dir)
    }
  }
}

/** The wall whose band holds point p (within half thickness + slack), closest first. */
function wallAt(walls: WallDraft[], p: Pt, slack = 0.05): WallDraft | null {
  let best: { w: WallDraft; d: number } | null = null
  for (const w of walls) {
    const d = Math.abs(dot(sub(p, w.a), w.n))
    const t = dot(p, w.dir)
    if (d <= w.thick / 2 + slack && t >= w.t0 - slack && t <= w.t1 + slack && (!best || d < best.d)) best = { w, d }
  }
  return best?.w ?? null
}

/** An opening put on `w` over [t0, t1]: joins an existing one there (keeps the surer kind) or adds; clamped inside the wall. */
function putOpening(w: WallDraft, o: WallDraft['openings'][number]): boolean {
  const t0 = Math.max(w.t0, o.t0), t1 = Math.min(w.t1, o.t1)
  if (t1 - t0 < MIN_GAP) return false
  const hit = w.openings.find((x) => x.t0 < t1 && t0 < x.t1)
  if (hit) {
    if (hit.kind === 'passage' || (hit.kind === 'window' && o.kind !== 'passage')) Object.assign(hit, { ...o, t0: Math.min(hit.t0, t0), t1: Math.max(hit.t1, t1) })
    return true
  }
  w.openings.push({ ...o, t0, t1 })
  return true
}

const stripText = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function buildPlan(d: Drawing, name: string): Plan2dResult {
  const notes: string[] = []
  const s = d.scale
  // the plan frame: x right, y DOWN; the origin is set once the walls are known (everything shifts together)
  const P = (p: Pt): Pt => ({ x: p.x * s, y: -p.y * s })
  const role = (x: { layer: string; block?: string }): Role => roleOf(x.layer, x.block)

  // columns first: their outlines are no walls
  const pillars: Pillar[] = []
  const columnBoxes: { x0: number; y0: number; x1: number; y1: number }[] = []
  for (const l of d.loops) {
    const r = role(l)
    if (r !== 'column' && r !== 'wall' && r !== 'unknown') continue
    const pts = l.pts.map(P)
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
    if (w < 0.2 || h < 0.2 || w > 1.2 || h > 1.2) continue
    if (r !== 'column' && (pts.length > 5 || pts.length < 3)) continue
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
    if (columnBoxes.some((b) => Math.abs(b.x0 - box.x0) < 0.02 && Math.abs(b.y0 - box.y0) < 0.02 && Math.abs(b.x1 - box.x1) < 0.02)) continue
    columnBoxes.push(box)
    pillars.push({ id: newId(), x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, wM: w, hM: h })
  }
  const inColumn = (p: Pt) => columnBoxes.some((b) => p.x >= b.x0 - 0.01 && p.x <= b.x1 + 0.01 && p.y >= b.y0 - 0.01 && p.y <= b.y1 + 0.01)

  const segs = d.segs.map((g) => ({ a: P(g.a), b: P(g.b), role: role(g), layer: g.layer, block: g.block, inst: g.inst }))
  // (a line on a text / room layer is geometry too: a plan drawn as room polygons)
  const wallLines = segs.filter((g) => (g.role === 'wall' || g.role === 'unknown' || g.role === 'text') && !(inColumn(g.a) && inColumn(g.b)))
  const explicit = wallLines.filter((g) => g.role === 'wall')
  let pieces = pairWalls(explicit.length ? explicit : wallLines)
  if (!explicit.length) {
    // no layer says which pairs are walls (a PDF, a one-layer DXF): keep the plan's main thicknesses — the ones whose
    // total length is at least a tenth of the longest-running one, and the two standard ones; furniture, stairs and hatching pair at odd gaps
    const total = new Map<number, number>()
    for (const p of pieces) total.set(p.thick, (total.get(p.thick) ?? 0) + (p.t1 - p.t0))
    const top = Math.max(0, ...total.values())
    const main = new Set([...total].filter(([t, L]) => L >= 0.1 * top || t === PARTITION_M || t === EXTERIOR_M).map(([t]) => t))
    pieces = pieces.filter((p) => main.has(p.thick))
    notes.push(`No wall layer found: walls were taken from parallel line pairs 5–60 cm apart of the plan's main thicknesses (${[...main].sort((p, q) => q - p).map((t) => `${Math.round(t * 1000)} mm`).join(', ') || 'none'}).`)
  }
  let walls = mergeCollinear(pieces)

  // wall-layer lines no pair covered (the outer face of a plan drawn as room polygons): walls of PARTITION_M on the
  // line itself, merged with the paired pieces so fragments of one edge become one wall
  let singles = 0
  const singlePieces: Piece[] = []
  for (const g of explicit) {
    const L = len(sub(g.b, g.a))
    if (L < 0.4) continue // (a shorter one is a jamb / end cap)
    const { dir, n } = folded(g.a, g.b)
    const t = [dot(g.a, dir), dot(g.b, dir)].sort((p, q) => p - q)
    const covered = walls
      .filter((w) => Math.abs(crossZ(w.dir, dir)) <= PAR && Math.abs(dot(sub(g.a, w.a), n)) <= w.thick / 2 + 0.03)
      .reduce((acc, w) => acc + Math.max(0, Math.min(t[1], w.t1) - Math.max(t[0], w.t0)), 0)
    if (covered > 0.3 * L) continue
    singlePieces.push(piece(g.a, g.b, PARTITION_M))
    singles++
  }
  if (singles) walls = mergeCollinear([...pieces, ...singlePieces])
  if (singles) notes.push(`${singles} wall-layer line(s) had no parallel partner: taken as ${(PARTITION_M / FT) * 12}" walls on the line itself.`)

  // a thin wall lying inside a thicker wall's band is that wall's own detail (window lines, a plaster line)
  const inside = new Set<WallDraft>()
  for (const w of walls)
    for (const v of walls) {
      if (v === w || v.thick <= w.thick || Math.abs(crossZ(w.dir, v.dir)) > PAR) continue
      if (Math.abs(dot(sub(w.a, v.a), v.n)) + w.thick / 2 <= v.thick / 2 + 0.01 && dot(w.a, v.dir) >= v.t0 - 0.01 && dot(w.b, v.dir) <= v.t1 + 0.01) inside.add(w)
    }
  const kept = walls.filter((w) => !inside.has(w))

  // openings: window lines in a gap; door arcs; door / window blocks
  const windowLines = segs.filter((g) => g.role === 'window' || g.role === 'wall' || g.role === 'unknown')
  for (const w of kept)
    for (const o of w.openings) {
      const glass = windowLines.some((g) => {
        const { dir } = folded(g.a, g.b)
        if (Math.abs(crossZ(dir, w.dir)) > PAR || Math.abs(dot(sub(g.a, w.a), w.n)) > w.thick / 2 + 0.02) return false
        const t = [dot(g.a, w.dir), dot(g.b, w.dir)].sort((p, q) => p - q)
        return Math.min(t[1], o.t1) - Math.max(t[0], o.t0) >= 0.5 * (o.t1 - o.t0)
      })
      if (glass) o.kind = 'window'
    }
  const arcPt = (a: ArcPrim, th: number): Pt => P({ x: a.c.x + a.r * Math.cos(th), y: a.c.y + a.r * Math.sin(th) })
  let doorArcs = 0
  for (const a of d.arcs) {
    if (role(a) === 'ignore' || role(a) === 'window') continue
    const r = a.r * s
    let sweep = a.a1 - a.a0
    while (sweep < 0) sweep += 2 * Math.PI
    if (r < 0.5 || r > 1.6 || sweep < Math.PI / 3 || sweep > (2 * Math.PI) / 3) continue
    const C = P(a.c)
    const w = wallAt(kept, C, 0.1)
    if (!w) continue
    const ends = [arcPt(a, a.a0), arcPt(a, a.a1)]
    const along = ends.findIndex((e) => Math.abs(crossZ(sub(e, C), w.dir)) / r < Math.sin(Math.PI / 18))
    if (along < 0) continue
    const tC = dot(C, w.dir)
    const toB = dot(sub(ends[along], C), w.dir) > 0
    const open = ends[1 - along]
    const o = { kind: 'door' as const, t0: toB ? tC : tC - r, t1: toB ? tC + r : tC, hinge: (toB ? 'a' : 'b') as 'a' | 'b', swing: (dot(sub(open, C), w.n) < 0 ? 'in' : 'out') as 'in' | 'out' }
    if (putOpening(w, o)) doorArcs++
  }
  // blocks: the extent of a door / window block along the wall it sits on
  const insts = new Map<string, { role: Role; block: string; pts: Pt[] }>()
  for (const g of segs) {
    if (g.inst === undefined || (g.role !== 'door' && g.role !== 'window')) continue
    const k = `${g.block}#${g.inst}`
    ;(insts.get(k) ?? insts.set(k, { role: g.role, block: g.block ?? '', pts: [] }).get(k)!).pts.push(g.a, g.b)
  }
  let blockOpenings = 0
  for (const b of insts.values()) {
    const cx = b.pts.reduce((acc, p) => acc + p.x, 0) / b.pts.length, cy = b.pts.reduce((acc, p) => acc + p.y, 0) / b.pts.length
    const w = wallAt(kept, { x: cx, y: cy }, 0.3)
    if (!w) continue
    const ts = b.pts.map((p) => dot(p, w.dir))
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    if (t1 - t0 > 4 || t1 - t0 < MIN_GAP) continue
    const kind: OpeningKind = /SLID/i.test(b.block) ? 'slider' : b.role === 'window' ? 'window' : 'door'
    const hit = w.openings.find((x) => x.t0 < t1 && t0 < x.t1)
    if (hit && hit.kind === 'door' && kind === 'door') continue // the arc placed it already
    if (putOpening(w, { kind, t0, t1 })) blockOpenings++
  }
  meetEnds(kept)

  // → the Unit
  if (!kept.length) notes.push('No walls found: no parallel line pairs 5–60 cm apart.')
  let ox = Infinity, oy = Infinity
  for (const w of kept) (ox = Math.min(ox, w.a.x, w.b.x)), (oy = Math.min(oy, w.a.y, w.b.y))
  if (!kept.length) ox = oy = 0
  const shift = (p: Pt): Pt => ({ x: Math.round((p.x - ox) * 1e4) / 1e4, y: Math.round((p.y - oy) * 1e4) / 1e4 })
  const unit0: Unit = { ...emptyUnit(), name, pillars: pillars.map((p) => ({ ...p, ...shift(p) })) }
  for (const w of kept) {
    const a = { id: newId(), ...shift(w.a) }, b = { id: newId(), ...shift(w.b) }
    unit0.vertices.push(a, b)
    const openings: Opening[] = []
    for (const o of w.openings.sort((p, q) => p.t0 - q.t0)) {
      const bath = false
      const defaults = openingDefaults(o.kind, bath)
      const t0 = Math.max(w.t0, o.t0), t1 = Math.min(w.t1, o.t1)
      if (t1 - t0 < MIN_GAP || (openings.length && openings[openings.length - 1].offsetM + openings[openings.length - 1].widthM > t0 - w.t0)) continue
      openings.push({ id: newId(), kind: o.kind, offsetM: t0 - w.t0, widthM: t1 - t0, heightM: defaults.heightM, sillM: defaults.sillM, ...(o.kind === 'door' ? { hinge: o.hinge, swing: o.swing } : {}) })
    }
    unit0.walls.push({ id: newId(), a: a.id, b: b.id, thicknessM: w.thick, heightM: WALL_HEIGHT_M, openings })
  }
  let unit = normalizeUnit(joinOverlaps(unit0).unit)

  // labels: texts inside closed rooms
  let rooms = deriveRooms(unit)
  const polys = rooms.map((r) => ({ r, poly: roomPolygon(r, unit) }))
  const roomOf = (p: Pt): Room | null => {
    let best: { r: Room; poly: Pt[] } | null = null
    for (const x of polys) if (pointInPolygon(p, x.poly) && (!best || x.r.areaSqm < best.r.areaSqm)) best = x
    return best?.r ?? null
  }
  const texts = d.texts
    .filter((t) => role(t) !== 'ignore' && role(t) !== 'dim' && stripText(t.text))
    .flatMap((t) => t.text.split('\n').map((line, i) => ({ at: shift(P({ x: t.at.x, y: t.at.y - i * t.height * 1.6 })), text: stripText(line), height: t.height })))
    .filter((t) => t.text)
    .sort((p, q) => q.height - p.height)
  const labels: RoomLabel[] = []
  const taken = new Map<Id, RoomLabel>()
  const sizes: { at: Pt; text: string; room: Room | null }[] = []
  let outside = 0
  let areaSqft = 0
  for (const t of texts) {
    const room = roomOf(t.at)
    if (parseDims(t.text)) {
      sizes.push({ at: t.at, text: t.text, room })
      continue
    }
    const area = parseArea(t.text)
    const flat = flatTypeOf({ name: t.text, kind: 'other' })
    // a name has letters; a measurement with a word on it ("8'-5\" CLG", "Sill H=3'-0\"", "2.4 m") names no room
    if ((!/[A-Za-z]{2}/.test(t.text) || /\d\s*['"′″’]|\d\s*(mm|cm|m|ft|in)\b/i.test(t.text)) && !flat) continue
    if (!room) {
      outside++
      continue
    }
    if (flat) {
      labels.push({ id: newId(), name: t.text, kind: 'other', x: t.at.x, y: t.at.y })
      if (area && !areaSqft) areaSqft = Math.round(area / (FT * FT))
      continue
    }
    if (area) {
      if (!areaSqft) areaSqft = Math.round(area / (FT * FT))
      continue
    }
    if (taken.has(room.id)) continue
    const l: RoomLabel = { id: newId(), name: t.text, kind: guessKind(t.text), x: t.at.x, y: t.at.y }
    taken.set(room.id, l)
    labels.push(l)
  }
  for (const [roomId, l] of taken) {
    const near = sizes
      .filter((z) => (z.room && z.room.id === roomId) || len(sub(z.at, l)) < 1)
      .sort((p, q) => len(sub(p.at, l)) - len(sub(q.at, l)))[0]
    if (near) l.printedSize = near.text
  }
  // the room's name first, its flat's name after (deriveRooms gives the first label the face)
  unit = { ...unit, roomLabels: [...labels.filter((l) => !flatTypeOf(l)), ...labels.filter((l) => flatTypeOf(l))], areaSqft }
  rooms = deriveRooms(unit)
  const issues = validate(unit)
  const counts: Counts = {
    lines: d.segs.length,
    walls: unit.walls.length,
    openings: unit.walls.reduce((acc, w) => acc + w.openings.length, 0),
    columns: unit.pillars?.length ?? 0,
    labels: unit.roomLabels.length,
    rooms: rooms.length,
    closedRooms: rooms.filter((r) => r.areaSqm >= 1).length,
    textsOutside: outside,
    singleLines: singles,
  }
  notes.push(`${counts.lines} lines read → ${counts.walls} walls (${doorArcs} door arcs, ${blockOpenings} door / window blocks → ${counts.openings} openings), ${counts.columns} columns, ${counts.labels} labels, ${counts.closedRooms} closed rooms.`)
  if (outside) notes.push(`${outside} text(s) stood in no closed room and were left out.`)
  return { unit, rooms, issues, counts, origin: { x: ox / s, y: -oy / s }, notes }
}

type Id = string
