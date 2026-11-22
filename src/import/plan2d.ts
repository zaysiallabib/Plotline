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
import type { Opening, OpeningKind, Pillar, Pt, Room, RoomLabel, Unit, ValidationIssue, Vertex, Wall } from '../core'
import { EXTERIOR_M, PARTITION_M, WALL_HEIGHT_M, ZONE_LINE_M, emptyUnit, guessKind, initialState, normalizeUnit, openingDefaults, reducer } from '../studio/model'
import { parseArea, parseDims, parseSide } from '../trace/text'

export type Role = 'wall' | 'kerb' | 'zone' | 'door' | 'window' | 'column' | 'text' | 'dim' | 'ignore' | 'unknown'

/**
 * The names CAD templates give their layers → what they hold: the US National CAD Standard / AIA names (A-WALL, A-DOOR,
 * A-GLAZ, S-COLS, A-ANNO-TEXT, A-ANNO-DIMS, A-FURN, A-FLOR-STRS…), the plain English ones, the German, French, Spanish,
 * Italian and Dutch words of architects' templates, and Plotline's own export. Read case-insensitively anywhere in the
 * name; the first row that matches wins (a wall's hatch before any hatch, furniture before a door word inside it).
 */
const LAYER_TABLE: [RegExp, Role][] = [
  [/^PLOTLINE_AXES/, 'ignore'], // Plotline's own walls' centre lines: read apart (buildPlan), never as lines to pair
  [/ZONES?$|ZONE[-_ ]?LINE/, 'zone'], // Plotline's PLOTLINE_ZONES: flush lines between zones
  [/KERB|CURB/, 'kerb'], // Plotline's PLOTLINE_KERBS
  [/(WALL|WAND|MUR|PARED|MUUR).*(HATCH|PATT|POCHE|SCHRAFF)|(HATCH|PATT|POCHE|SCHRAFF).*(WALL|WAND|MUR)/, 'wall'], // the walls' hatching: its edges are the faces
  [/HATCH|SCHRAFF|FURN|M(OE|Ö)BEL|MOBILIER|MUEBLE|ARRED|MEUBILAIR|FIX|EQPM|EQUIP|SANIT|PLUMB|ELEC|LIGHT|GRID|AXIS|ACHSE|TITLE|BORDER|SHEET|VIEWPORT|DEFPOINT|STAIR|STRS|TREPPE|ESCALIER|ESCALERA|SCALA|TRAP\b|RAIL|NPLT|CASE|CABINET|DETL|DETAIL|FLOR/, 'ignore'],
  [/DIM|BEMA(SS|ß)|COTE|COTA|QUOT|MAATV/, 'dim'],
  [/COL|PILLAR|ST(UE|Ü)TZ|POTEAU|PILAR|PILASTR|KOLOM/, 'column'],
  [/DOOR|PORTE|PORTA\b|PUERTA|T(Ü|UE)R|DEUR|\bDR\b|^DR$|[-_]DR$/, 'door'],
  [/WIND|GLAZ|GLAS|FENSTER|FEN(E|Ê)TRE|VENTANA|FINESTR|RAAM|WIN/, 'window'],
  [/WALL|W(Ä|AE)NDE|WAND|MAUER|MUR|PARED|PARETE|MUUR|BRICK|CONC|BETON|STRUCT|PARTITION|CLOISON|TABIQUE/, 'wall'],
  [/TEXT|TXT|TEKST|ROOM|RAUM|NAME|LABEL|ANNO|BESCHRIFT|AREA/, 'text'],
]

/** a person's correction: a layer's name (in capitals) → what it holds, kept for the next file (the Studio's layer list) */
export type LayerRoles = Record<string, Role>

/** What a layer name means. The block a primitive came from (door / window blocks) wins, then the person's correction, then the table. */
export function roleOf(layer: string, block?: string, mine?: LayerRoles): Role {
  if (block) {
    if (/SLID|DOOR|^D[-_]?\d|^DR\b/i.test(block)) return 'door'
    if (/WIN|GLAZ|^W[-_]?\d/i.test(block)) return 'window'
    if (/COL|PILLAR/i.test(block)) return 'column'
  }
  const L = layer.toUpperCase()
  return mine?.[L] ?? LAYER_TABLE.find(([re]) => re.test(L))?.[1] ?? 'unknown'
}

/** What each meaning is called in the notes staff read */
export const ROLE_WORDS: Record<Role, string> = { wall: 'walls', kerb: 'kerbs (walls of 20 cm or less)', zone: 'zone lines (flush, drawn as nothing)', door: 'doors', window: 'windows', column: 'columns', text: 'room names', dim: 'dimensions', ignore: 'ignored', unknown: 'unknown (parallel pairs count as walls)' }

/** A line of the file (file frame, file units); `block` / `inst` = the block it came from and which insert of it. */
export interface Seg {
  a: Pt
  b: Pt
  layer: string
  block?: string
  inst?: number
  /** its entity's thickness (DXF group 39, file units): an extruded outline's height — a wall's, in Plotline's own export */
  h?: number
  /** a side of loops[loop] (a closed polyline) */
  loop?: number
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
  /** its elevation (file units): a room name's raised floor, in Plotline's own export */
  z?: number
}
/** A closed shape (polyline, solid, circle): a column, or a wall piece drawn as its outline. */
export interface Loop {
  pts: Pt[]
  layer: string
  h?: number
}

export interface Drawing {
  segs: Seg[]
  arcs: ArcPrim[]
  texts: TextPrim[]
  loops: Loop[]
  /** file units → metres */
  scale: number
  /** a person's corrections of what a layer holds (roleOf) */
  layerRoles?: LayerRoles
  /** the file has a column layer (a DXF's layer table names one): then only its shapes are columns */
  columnLayer?: boolean
  /**
   * Plotline's own export (its PLOTLINE_ layers are in the file, saved by a CAD program or not): every wall piece is its
   * exact outline, every opening a block with jambs, every wall of one thickness and height — read to the letter
   */
  own?: boolean
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
/** a kerb with no height of its own in the file stands this high */
const KERB_M = 0.15

interface Piece {
  a: Pt
  b: Pt
  thick: number
  /** its height, m, when the file gives one (an extruded outline); a zone line's is 0 */
  h?: number
  dir: Pt
  n: Pt
  /** perpendicular coordinate of its line (p · n) and its extent along dir */
  c: number
  t0: number
  t1: number
}

interface WallDraft extends Piece {
  /** gap: a bare gap between two pieces, not yet confirmed by a block, a swing or glass lines */
  openings: { kind: OpeningKind; t0: number; t1: number; hinge?: 'a' | 'b'; swing?: 'in' | 'out'; gap?: boolean; exact?: boolean }[]
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

function piece(a: Pt, b: Pt, thick: number, h?: number): Piece {
  const { dir, n } = folded(a, b)
  const ta = dot(a, dir), tb = dot(b, dir)
  return { a: ta <= tb ? a : b, b: ta <= tb ? b : a, thick, ...(h === undefined ? {} : { h }), dir, n, c: dot(a, n), t0: Math.min(ta, tb), t1: Math.max(ta, tb) }
}

/**
 * A closed four-sided outline with square corners, 4–60 cm across one way: one wall piece on its long axis, as thick as
 * its short side (Plotline's own DXF export draws every wall piece so: read for such a file only). Both sides under 60 cm:
 * `axis` picks which way it runs (null: neither).
 */
function rectPiece(raw: Pt[], h: number | undefined, axis?: (a: Piece, b: Piece) => Piece | null): Piece | null {
  let v = raw.filter((p, i) => i === 0 || len(sub(p, raw[i - 1])) > 1e-6)
  if (v.length === 5 && len(sub(v[4], v[0])) <= 1e-6) v = v.slice(0, 4)
  if (v.length !== 4) return null
  const e = [0, 1, 2, 3].map((i) => sub(v[(i + 1) % 4], v[i]))
  if (e.some((x, i) => Math.abs(dot(x, e[(i + 1) % 4])) > 0.01 * len(x) * len(e[(i + 1) % 4]))) return null
  const mid = (i: number): Pt => ({ x: (v[i].x + v[(i + 1) % 4].x) / 2, y: (v[i].y + v[(i + 1) % 4].y) / 2 })
  const along0 = piece(mid(3), mid(1), len(e[1]), h) // runs along sides 0 and 2
  const along1 = piece(mid(0), mid(2), len(e[0]), h)
  const fits = (p: Piece) => p.thick >= WALL_MIN && p.thick <= WALL_MAX
  const long = len(e[0]) >= len(e[1]) ? along0 : along1, short = long === along0 ? along1 : along0
  if (!fits(long)) return null
  if (fits(short)) return axis ? axis(long, short) : null
  return { ...long, thick: snapThick(long.thick) }
}

/**
 * Parallel line pairs → centre-line pieces. ponytail: O(n²) within an angle bucket; bucket by offset if a 50k-line
 * plan ever shows up.
 */
function pairWalls(lines: { a: Pt; b: Pt; h?: number }[]): Piece[] {
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
        out.push(piece(A, Bp, snapThick(ad), li.h ?? lj.h))
      }
    }
  }
  return out
}

/** Collinear pieces (same line within 2 cm) merged: overlaps and gaps < MIN_GAP become one, gaps of MIN_GAP–MAX_GAP an opening. */
function mergeCollinear(pieces: Piece[], maxGap = MAX_GAP, strict = false): WallDraft[] {
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
    const runs = g.map((p) => ({ t0: dot(p.a, ref.dir), t1: dot(p.b, ref.dir), thick: p.thick, h: p.h })).sort((p, q) => p.t0 - q.t0)
    let cur: WallDraft | null = null
    const at = (t: number): Pt => ({ x: ref.a.x + ref.dir.x * (t - dot(ref.a, ref.dir)), y: ref.a.y + ref.dir.y * (t - dot(ref.a, ref.dir)) })
    for (const r of runs) {
      const gap = cur ? r.t0 - cur.t1 : Infinity
      // another height is another wall, from where it starts and across a gap (between a wall and a parapet a gap is where
      // one ends and the other begins, not an opening); so is another thickness in an exact drawing (strict) — else a
      // thicker / thinner run takes over only when it is the longer (a drawing's measured thickness wavers)
      const thicker = !!cur && Math.abs(r.thick - cur.thick) > SNAP_THICK
      const other = !!cur && ((strict && thicker) || Math.abs((r.h ?? -1) - (cur.h ?? -1)) > 0.01)
      if (cur && gap <= maxGap && !(other && gap >= MIN_GAP)) {
        if (gap >= MIN_GAP) cur.openings.push({ kind: 'passage', t0: cur.t1, t1: r.t0, gap: true })
        if ((other || (thicker && r.t1 - r.t0 > cur.t1 - cur.t0)) && gap < MIN_GAP && r.t0 > cur.t0 + 0.05) {
          // a thicker / thinner / higher / lower run on the same line: its own wall from here
          cur.b = at(r.t0)
          cur.t1 = r.t0
          walls.push(cur)
          cur = null
        } else {
          if (r.t1 > cur.t1) (cur.t1 = r.t1), (cur.b = at(r.t1))
          continue
        }
      } else if (cur) walls.push(cur)
      cur = { ...ref, a: at(r.t0), b: at(r.t1), t0: r.t0, t1: r.t1, thick: r.thick, h: r.h, c: dot(at(r.t0), ref.n), openings: [] }
    }
    if (cur) walls.push(cur)
  }
  return walls
}

/**
 * Two wall ends facing each other across a doorway, on offset centre lines (a thick outer wall meeting a thin partition at
 * a door: the gap is on no single line, so mergeCollinear saw no opening): a bridge piece between them, as thin as the
 * thinner, carrying a passage over its whole length (a door block or arc there turns it into a door).
 */
function bridgeGaps(walls: WallDraft[]): number {
  const free = (w: WallDraft, E: Pt) =>
    !walls.some((v) => v !== w && ([v.a, v.b].some((F) => len(sub(F, E)) <= 0.05) || (Math.abs(dot(sub(E, v.a), v.n)) <= v.thick / 2 + 0.02 && dot(E, v.dir) >= v.t0 - 0.02 && dot(E, v.dir) <= v.t1 + 0.02)))
  const ends = walls.flatMap((w) => (['a', 'b'] as const).map((end) => ({ w, end, E: w[end], out: end === 'b' ? w.dir : { x: -w.dir.x, y: -w.dir.y } }))).filter((e) => free(e.w, e.E))
  const used = new Set<(typeof ends)[number]>()
  let bridges = 0
  for (const e of ends) {
    if (used.has(e)) continue
    let best: { f: (typeof ends)[number]; along: number } | null = null
    for (const f of ends) {
      if (f === e || used.has(f) || f.w === e.w || Math.abs(crossZ(e.w.dir, f.w.dir)) > Math.sin(Math.PI / 36)) continue
      const d = sub(f.E, e.E)
      const along = dot(d, e.out)
      const lateral = Math.abs(crossZ(d, e.out))
      if (along < MIN_GAP || along > MAX_GAP || lateral > 0.2 || dot(f.out, e.out) > -0.9) continue
      if (!best || along < best.along) best = { f, along }
    }
    if (!best) continue
    const thick = Math.min(e.w.thick, best.f.w.thick)
    const b: WallDraft = { ...piece(e.E, best.f.E, thick), openings: [] }
    b.openings.push({ kind: 'passage', t0: b.t0, t1: b.t1 })
    walls.push(b)
    used.add(e)
    used.add(best.f)
    bridges++
  }
  return bridges
}

/**
 * A wall end within the other's thickness of a crossing wall's centre line comes onto it (an L stops short, a T meets);
 * two FREE ends (nothing else there) reach each other's crossing from up to a metre (faces that stopped at a door's jambs
 * beside a corner; the door arc / block then cuts its opening there).
 */
function meetEnds(walls: WallDraft[]): void {
  const free = (w: WallDraft, E: Pt) => !walls.some((v) => v !== w && Math.abs(dot(sub(E, v.a), v.n)) <= v.thick / 2 + 0.05 && dot(E, v.dir) >= v.t0 - 0.05 && dot(E, v.dir) <= v.t1 + 0.05)
  for (const w of walls) {
    for (const end of ['a', 'b'] as const) {
      const E = w[end]
      const loose = free(w, E)
      let best: { P: Pt; d: number } | null = null
      for (const v of walls) {
        if (v === w || Math.abs(crossZ(w.dir, v.dir)) <= PAR) continue
        const den = crossZ(w.dir, v.dir)
        const s = crossZ(sub(v.a, E), v.dir) / den // E + w.dir·s = P
        const P = { x: E.x + w.dir.x * s, y: E.y + w.dir.y * s }
        const tv = dot(P, v.dir)
        // v's end nearest the crossing, and whether it is loose too: then both may reach further
        const vEnd = tv - v.t0 < v.t1 - tv ? v.a : v.b
        const both = loose && Math.abs(tv - dot(vEnd, v.dir)) <= 1 && free(v, vEnd)
        const reach = both ? 1 : w.thick / 2 + 0.03
        if (tv < v.t0 - reach || tv > v.t1 + reach) continue
        const towardIn = end === 'a' ? s > 0 : s < 0 // the move shortens w
        if (Math.abs(s) > (both ? 1 : Math.max(v.thick, w.thick) + 0.05) || (towardIn && Math.abs(s) > w.t1 - w.t0 - 0.05)) continue
        if (!best || Math.abs(s) < best.d) best = { P, d: Math.abs(s) }
      }
      if (!best) continue
      w[end] = best.P
      w.t0 = dot(w.a, w.dir)
      w.t1 = dot(w.b, w.dir)
    }
  }
}

/** The wall whose band holds point p (within half thickness + slack), closest first; `along`: one whose length holds p before one it only reaches past its end. */
function wallAt(walls: WallDraft[], p: Pt, slack = 0.05, along = false): WallDraft | null {
  let best: { w: WallDraft; d: number } | null = null
  for (const w of walls) {
    const d = Math.abs(dot(sub(p, w.a), w.n))
    const t = dot(p, w.dir)
    if (d > w.thick / 2 + slack || t < w.t0 - slack || t > w.t1 + slack) continue
    const score = d + (along && (t < w.t0 || t > w.t1) ? 1 : 0)
    if (!best || score < best.d) best = { w, d: score }
  }
  return best?.w ?? null
}

/**
 * An opening put on `w` over [t0, t1]: joins an existing one there (keeps the surer kind) or adds; clamped inside the wall.
 * `exact` (a block with its jambs, in Plotline's own export): it keeps its own extent — the gap it fills may run on to a
 * corner where the wall's last piece was too short to draw (a door 1–3 cm from a corner), and that stays wall.
 */
function putOpening(w: WallDraft, o: WallDraft['openings'][number], exact = false): boolean {
  const t0 = Math.max(w.t0, o.t0), t1 = Math.min(w.t1, o.t1)
  if (t1 - t0 < (exact ? 0.01 : MIN_GAP)) return false
  const hit = w.openings.find((x) => x.t0 < t1 && t0 < x.t1)
  if (hit) {
    if (hit.kind === 'passage' || (hit.kind === 'window' && o.kind !== 'passage')) Object.assign(hit, { ...o, gap: false, exact, t0: exact ? t0 : Math.min(hit.t0, t0), t1: exact ? t1 : Math.max(hit.t1, t1) })
    return true
  }
  w.openings.push({ ...o, t0, t1, exact })
  return true
}


const ROOM_GAP = 0.35
const DOOR_JOG = 1.5

interface RoomMode {
  pieces: Piece[]
  doors: { a: Pt; b: Pt }[]
  rooms: number
}

/**
 * A plan drawn as ROOM OUTLINES (a scan product: one closed polygon per room on the wall layer, 5–35 cm apart, the
 * polygon stepping toward its neighbour at each door): each loop is a room face. A door-sized step out and back in an
 * outline is a doorway and is flattened; then every edge is moved onto its wall line — the centre line between it and
 * the facing edge of another loop within ROOM_GAP (one wall, as thick as the gap, min PARTITION_M), else the edge itself
 * (EXTERIOR_M when nothing runs parallel within 0.5 m, else PARTITION_M) — and the loop's corners are re-cut where the
 * lines cross, so each loop is a closed ring of walls and two loops' shared wall is one wall. Null when under 60 % of
 * the wall-layer length is in room-sized closed loops.
 * ponytail: O(edges²) over all loops; bucket by direction if a 500-room floor ever shows up.
 */
function roomPolygons(loops: Pt[][], wallLength: number): RoomMode | null {
  const area = (pts: Pt[]) => Math.abs(pts.reduce((acc, p, i) => acc + crossZ(p, pts[(i + 1) % pts.length]), 0)) / 2
  const perim = (pts: Pt[]) => pts.reduce((acc, p, i) => acc + len(sub(pts[(i + 1) % pts.length], p)), 0)
  const rooms = loops.filter((pts) => {
    const A = area(pts), Pm = perim(pts)
    return A >= 0.5 && A <= 200 && A / (Pm * Pm) >= 0.02
  })
  if (!rooms.length || rooms.reduce((acc, pts) => acc + perim(pts), 0) < 0.6 * wallLength) return null
  const doors: { a: Pt; b: Pt }[] = []
  const parallel = (p: Pt, q: Pt, r: Pt, s: Pt) => Math.abs(crossZ(folded(p, q).dir, folded(r, s).dir)) <= PAR
  // the outlines cleaned: points under 1 cm apart and corners on a straight run dropped, door jogs flattened
  const rings = rooms.map((raw) => {
    let v = raw.filter((p, i) => i === 0 || len(sub(p, raw[i - 1])) > 0.01)
    if (len(sub(v[v.length - 1], v[0])) <= 0.01) v = v.slice(0, -1)
    const straighten = () => {
      v = v.filter((p, i) => !parallel(v[(i + v.length - 1) % v.length], p, p, v[(i + 1) % v.length]))
    }
    straighten()
    for (let i = 0; i < v.length && v.length >= 6; i++) {
      const at = (k: number) => v[(i + k) % v.length]
      const L = (k: number) => len(sub(at(k + 1), at(k)))
      // edges i (step), i+1 (the doorway), i+2 (step back), with i-1 and i+3 on the same line
      if (L(0) > ROOM_GAP || L(2) > ROOM_GAP || L(1) < MIN_GAP || L(1) > DOOR_JOG) continue
      if (!parallel(at(-1), at(0), at(1), at(2)) || !parallel(at(1), at(2), at(3), at(4))) continue
      if (dot(sub(at(1), at(0)), sub(at(3), at(2))) > 0) continue
      doors.push({ a: at(1), b: at(2) })
      const drop = new Set([(i + 1) % v.length, (i + 2) % v.length])
      v = v.filter((_, k) => !drop.has(k))
      straighten()
      i = -1
    }
    return v
  })
  interface Edge {
    loop: number
    a: Pt
    b: Pt
    dir: Pt
    n: Pt
    c: number
    t0: number
    t1: number
  }
  const edges: Edge[][] = rings.map((v, loop) =>
    v.map((a, i) => {
      const b = v[(i + 1) % v.length]
      const { dir, n } = folded(a, b)
      const ta = dot(a, dir), tb = dot(b, dir)
      return { loop, a, b, dir, n, c: dot(a, n), t0: Math.min(ta, tb), t1: Math.max(ta, tb) }
    }),
  )
  const all = edges.flat()
  const overlap = (e: Edge, f: Edge) => Math.min(e.t1, Math.max(dot(f.a, e.dir), dot(f.b, e.dir))) - Math.max(e.t0, Math.min(dot(f.a, e.dir), dot(f.b, e.dir)))
  // each edge's wall line (c along its normal) and thickness
  const lines = edges.map((es) =>
    es.map((e) => {
      let best: { f: Edge; gap: number; o: number } | null = null
      let near = false
      for (const f of all) {
        if (f.loop === e.loop || Math.abs(crossZ(e.dir, f.dir)) > PAR) continue
        const gap = Math.abs(dot(sub(f.a, e.a), e.n))
        const o = overlap(e, f)
        if (o < 0.05 || gap > 0.5) continue
        near = true
        if (gap <= ROOM_GAP && (!best || o > best.o)) best = { f, gap, o }
      }
      if (!best) return { c: e.c, thick: near ? PARTITION_M : EXTERIOR_M }
      return { c: (e.c + dot(best.f.a, e.n)) / 2, thick: snapThick(Math.max(best.gap, PARTITION_M)) }
    }),
  )
  // the ring re-cut: each corner where its two edges' wall lines cross
  const pieces: Piece[] = []
  edges.forEach((es, loop) => {
    const corner = (k: number): Pt => {
      const e = es[(k + es.length - 1) % es.length], f = es[k]
      const le = lines[loop][(k + es.length - 1) % es.length], lf = lines[loop][k]
      const den = crossZ(e.dir, f.dir)
      if (Math.abs(den) < 0.02) return { x: f.n.x * lf.c + f.dir.x * dot(f.a, f.dir), y: f.n.y * lf.c + f.dir.y * dot(f.a, f.dir) }
      // p · e.n = le.c, p · f.n = lf.c
      const d = e.n.x * f.n.y - e.n.y * f.n.x
      return { x: (le.c * f.n.y - lf.c * e.n.y) / d, y: (e.n.x * lf.c - f.n.x * le.c) / d }
    }
    es.forEach((_, k) => {
      const A = corner(k), B = corner((k + 1) % es.length)
      if (len(sub(B, A)) >= 0.02) pieces.push(piece(A, B, lines[loop][k].thick))
    })
  })
  return { pieces, doors, rooms: rooms.length }
}

const stripText = (s: string): string => s.replace(/\s+/g, ' ').trim()
/** Plotline's own export: a wall's centre line, on a layer named for its thickness in tenths of a millimetre */
const AXES = /^PLOTLINE_AXES_(\d+)$/i

/**
 * Whether the centre lines of Plotline's own export still agree with the wall outlines (no wall moved, added or taken
 * away in a CAD program): every outline lies on a centre line — each corner of it within half that wall's thickness
 * across and no further past an end than the reach into the wall it meets (the thickest half thickness) — and every
 * centre line is drawn all along (each 5 cm of it inside an outline or under an opening's block): a wall moved, made
 * longer or shorter in CAD breaks it. File units; `s` file units → metres.
 */
function axesAgree(axes: Seg[], outlines: Loop[], blocks: Seg[], s: number): boolean {
  const thick = (g: Seg) => Number(AXES.exec(g.layer)![1]) / 1e4 / s
  const reach = Math.max(...axes.map(thick)) / 2 + 0.01 / s
  const holds = (g: Seg, p: Pt) => {
    const L = len(sub(g.b, g.a))
    if (L < 1e-9) return false
    const d = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L }
    const t = dot(sub(p, g.a), d)
    return Math.abs(crossZ(d, sub(p, g.a))) <= thick(g) / 2 + 0.01 / s && t >= -reach && t <= L + reach
  }
  for (const l of outlines) if (!axes.some((g) => l.pts.every((p) => holds(g, p)))) return false
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>()
  for (const g of blocks) {
    const k = `${g.block}#${g.inst}`
    const b = boxes.get(k) ?? boxes.set(k, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }).get(k)!
    for (const p of [g.a, g.b]) (b.x0 = Math.min(b.x0, p.x)), (b.y0 = Math.min(b.y0, p.y)), (b.x1 = Math.max(b.x1, p.x)), (b.y1 = Math.max(b.y1, p.y))
  }
  const e = 0.01 / s
  const shapes = [...outlines.map((l) => ({ l, ...l.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) })), ...[...boxes.values()].map((b) => ({ l: null, ...b }))]
  // (on an outline's edge counts: two pieces meet there)
  const onEdge = (p: Pt, pts: Pt[]) =>
    pts.some((q, i) => {
      const r = pts[(i + 1) % pts.length], L = len(sub(r, q))
      const t = L ? Math.max(0, Math.min(1, dot(sub(p, q), sub(r, q)) / (L * L))) : 0
      return len(sub(p, { x: q.x + (r.x - q.x) * t, y: q.y + (r.y - q.y) * t })) <= e
    })
  const covered = (p: Pt) => shapes.some((x) => p.x >= x.x0 - e && p.x <= x.x1 + e && p.y >= x.y0 - e && p.y <= x.y1 + e && (!x.l || pointInPolygon(p, x.l.pts) || onEdge(p, x.l.pts)))
  return axes.every((g) => {
    const n = Math.max(1, Math.ceil(len(sub(g.b, g.a)) / (0.05 / s)))
    return Array.from({ length: n + 1 }, (_, i) => ({ x: g.a.x + ((g.b.x - g.a.x) * i) / n, y: g.a.y + ((g.b.y - g.a.y) * i) / n })).every(covered)
  })
}
/** texts in a room that are no room's name: a stair's arrow, a door / window tag */
const NOT_A_NAME = /^(UP|DN|DOWN)$|^(D|W|WIN|WN)\s*[-_]?\s*\d{1,3}[A-Z]?$/i

export function buildPlan(d: Drawing, name: string): Plan2dResult {
  const notes: string[] = []
  const s = d.scale
  // the plan frame: x right, y DOWN; the origin is set once the walls are known (everything shifts together)
  const P = (p: Pt): Pt => ({ x: p.x * s, y: -p.y * s })
  const role = (x: { layer: string; block?: string }): Role => roleOf(x.layer, x.block, d.layerRoles)

  // columns first: their outlines are no walls. A file with a column layer draws its columns there: then a small closed
  // shape on the wall layer is a short wall piece (Plotline's own DXF export draws every wall piece closed)
  const pillars: Pillar[] = []
  const columnBoxes: { x0: number; y0: number; x1: number; y1: number }[] = []
  const columnsKnown = d.columnLayer || d.loops.some((l) => role(l) === 'column')
  for (const l of d.loops) {
    const r = role(l)
    if (r !== 'column' && (columnsKnown || (r !== 'wall' && r !== 'unknown'))) continue
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

  // Plotline's own export: a wall drawn as its closed outline (a thin rectangle on a wall or kerb layer) is that wall piece, its lines not paired
  // again; a kerb with no height of its own stands KERB_M
  const heightOf = (x: { h?: number; layer: string; block?: string }) => (x.h ? x.h * s : role(x) === 'kerb' ? KERB_M : undefined)
  const rects: Piece[] = []
  const used = new Set<number>()
  const unsure: { i: number; long: Piece; short: Piece }[] = []
  d.loops.forEach((l, i) => {
    if (!d.own || (role(l) !== 'wall' && role(l) !== 'kerb')) return
    const p = rectPiece(l.pts.map(P), heightOf(l), (long, short) => (unsure.push({ i, long, short }), null))
    if (p) rects.push(p), used.add(i)
  })
  // (an outline under 60 cm both ways runs the way a wall it lines up with runs, else it is left to the pairs)
  for (const { i, long, short } of unsure) {
    const line = (r: Piece, p: Piece) => Math.abs(crossZ(r.dir, p.dir)) <= PAR && Math.abs(dot(sub(p.a, r.a), r.n)) <= 0.01 && Math.abs(snapThick(r.thick) - snapThick(p.thick)) <= SNAP_THICK
    const on = (p: Piece) => rects.some((r) => line(r, p)) || unsure.some((u) => u.i !== i && (line(u.long, p) || line(u.short, p)))
    const pick = on(long) ? long : on(short) ? short : null
    if (pick) rects.push({ ...pick, thick: snapThick(pick.thick) }), used.add(i)
  }
  const segs = d.segs.filter((g) => g.loop === undefined || !used.has(g.loop)).map((g) => ({ a: P(g.a), b: P(g.b), h: heightOf(g), role: role(g), layer: g.layer, block: g.block, inst: g.inst }))
  // Plotline's own export draws each wall's centre line too (PLOTLINE_AXES_<thickness, 0.1 mm>, its height as the line's
  // thickness): while they agree with the outlines (no wall moved in a CAD program) the walls are those lines to the letter
  // — a curved ramp's chords, a short wall at a T, a door at a corner come back exactly; else the outlines are read
  const axisLines = d.own ? d.segs.filter((g) => AXES.test(g.layer)) : []
  const axes =
    axisLines.length && axesAgree(axisLines, d.loops.filter((l) => role(l) === 'wall' || role(l) === 'kerb'), d.segs.filter((g) => g.inst !== undefined), s)
      ? axisLines.map((g) => piece(P(g.a), P(g.b), Number(AXES.exec(g.layer)![1]) / 1e4, heightOf(g)))
      : null
  if (axisLines.length) notes.push(axes ? `${axes.length} walls read from their centre lines, exactly as exported.` : 'Walls were changed in a CAD program since the export: read from their outlines.')
  // (a line on a text / room layer is geometry too: a plan drawn as room polygons)
  const wallLines = segs.filter((g) => (g.role === 'wall' || g.role === 'kerb' || g.role === 'unknown' || g.role === 'text') && !(inColumn(g.a) && inColumn(g.b)))
  const explicit = wallLines.filter((g) => g.role === 'wall' || g.role === 'kerb')
  if (rects.length) notes.push(`${rects.length} wall pieces drawn as their own outlines.`)
  const wallLoops = d.loops.filter((l, i) => !used.has(i) && (explicit.length || rects.length ? role(l) === 'wall' : ['wall', 'unknown', 'text'].includes(role(l))))
  const roomMode = roomPolygons(
    wallLoops.map((l) => l.pts.map(P)),
    (explicit.length ? explicit : wallLines).reduce((acc, g) => acc + len(sub(g.b, g.a)), 0) + rects.reduce((acc, p) => acc + 2 * (p.t1 - p.t0), 0),
  )
  let pieces = axes ?? (roomMode ? roomMode.pieces : [...rects, ...pairWalls(explicit.length ? explicit : wallLines)])
  if (roomMode && !axes) notes.push(`Read as room outlines (${roomMode.rooms} rooms): one wall between neighbouring outlines, the outer edges as exterior walls.`)
  if (!explicit.length && !rects.length && !roomMode && !axes) {
    // no layer says which pairs are walls (a PDF, a one-layer DXF): keep the plan's main thicknesses — the ones whose
    // total length is at least a tenth of the longest-running one, and the two standard ones; furniture, stairs and hatching pair at odd gaps
    const total = new Map<number, number>()
    for (const p of pieces) total.set(p.thick, (total.get(p.thick) ?? 0) + (p.t1 - p.t0))
    const top = Math.max(0, ...total.values())
    const main = new Set([...total].filter(([t, L]) => L >= 0.1 * top || t === PARTITION_M || t === EXTERIOR_M).map(([t]) => t))
    pieces = pieces.filter((p) => main.has(p.thick))
    notes.push(`No wall layer found: walls were taken from parallel line pairs 5–60 cm apart of the plan's main thicknesses (${[...main].sort((p, q) => q - p).map((t) => `${Math.round(t * 1000)} mm`).join(', ') || 'none'}).`)
  }
  // (centre lines are the walls as they were: each its own, none merged — a curve's chords stay chords)
  let walls: WallDraft[] = axes ? axes.map((p) => ({ ...p, openings: [] })) : mergeCollinear(pieces, roomMode ? MIN_GAP : MAX_GAP, d.own)

  // wall-layer lines no pair covered (the outer face of a plan drawn as room polygons): walls of PARTITION_M on the
  // line itself, merged with the paired pieces so fragments of one edge become one wall
  let singles = 0
  const singlePieces: Piece[] = []
  for (const g of roomMode || axes ? [] : explicit) {
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
  if (singles) walls = mergeCollinear([...pieces, ...singlePieces], MAX_GAP, d.own)
  if (singles) notes.push(`${singles} wall-layer line(s) had no parallel partner: taken as ${(PARTITION_M / FT) * 12}" walls on the line itself.`)

  // a thin wall lying inside a thicker wall's band is that wall's own detail (window lines, a plaster line)
  const inside = new Set<WallDraft>()
  for (const w of walls)
    for (const v of walls) {
      if (v === w || v.thick <= w.thick || Math.abs(crossZ(w.dir, v.dir)) > PAR) continue
      if (Math.abs(dot(sub(w.a, v.a), v.n)) + w.thick / 2 <= v.thick / 2 + 0.01 && dot(w.a, v.dir) >= v.t0 - 0.01 && dot(w.b, v.dir) <= v.t1 + 0.01) inside.add(w)
    }
  const kept = axes ? walls : walls.filter((w) => !inside.has(w))
  // zone lines (a zone layer: Plotline's own export) are the line itself — flush, drawn as nothing, no faces to pair
  const zonePieces = segs.filter((g) => g.role === 'zone').map((g) => piece(g.a, g.b, ZONE_LINE_M, 0))
  const zones = (axes ? zonePieces : mergeCollinear(zonePieces, MIN_GAP)).map((w) => ({ ...w, openings: [] }))
  if (zones.length) notes.push(`${zones.length} zone lines (flush, drawn as nothing) from the zone layer.`)
  const bridges = axes ? 0 : bridgeGaps(kept)
  if (bridges) notes.push(`${bridges} doorway(s) between walls of different thickness bridged.`)
  if (!axes) meetEnds(kept)
  let jogDoors = 0
  for (const j of roomMode?.doors ?? []) {
    const w = wallAt(kept, { x: (j.a.x + j.b.x) / 2, y: (j.a.y + j.b.y) / 2 }, 0.1)
    if (!w) continue
    const t = [dot(j.a, w.dir), dot(j.b, w.dir)].sort((p, q) => p - q)
    if (putOpening(w, { kind: 'door', t0: t[0], t1: t[1], hinge: 'a', swing: 'in' })) jogDoors++
  }
  if (jogDoors) notes.push(`${jogDoors} doorway(s) where a room outline steps toward its neighbour.`)

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
      if (glass) (o.kind = 'window'), (o.gap = false)
    }
  const arcPt = (a: ArcPrim, th: number): Pt => P({ x: a.c.x + a.r * Math.cos(th), y: a.c.y + a.r * Math.sin(th) })
  /** a door swing on wall `w`: hinge, swing side and extent from the arc (null when the arc does not hinge on it) */
  const swingOn = (a: ArcPrim, w: WallDraft) => {
    const r = a.r * s
    const C = P(a.c)
    const ends = [arcPt(a, a.a0), arcPt(a, a.a1)]
    const along = ends.findIndex((e) => Math.abs(crossZ(sub(e, C), w.dir)) / r < Math.sin(Math.PI / 18))
    if (along < 0) return null
    const tC = dot(C, w.dir)
    const toB = dot(sub(ends[along], C), w.dir) > 0
    const open = ends[1 - along]
    return { kind: 'door' as const, t0: toB ? tC : tC - r, t1: toB ? tC + r : tC, hinge: (toB ? 'a' : 'b') as 'a' | 'b', swing: (dot(sub(open, C), w.n) < 0 ? 'in' : 'out') as 'in' | 'out' }
  }
  const isSwing = (a: ArcPrim) => {
    let sweep = a.a1 - a.a0
    while (sweep < 0) sweep += 2 * Math.PI
    return a.r * s >= 0.5 && a.r * s <= 1.6 && sweep >= Math.PI / 3 && sweep <= (2 * Math.PI) / 3
  }
  // blocks: a door / window / passage block over a wall is that opening. Its two jambs — two equal lines across, as far
  // apart as it is wide — say exactly where it stands (its leaf and swing reach off the wall); a block without them, by
  // its extent along the wall. A block in no wall (a wall all of glass, all passage, one door wide): its jambs give a wall
  // piece with that opening.
  const insts = new Map<string, { role: Role; block: string; pts: Pt[]; tall: Pt[]; arc?: ArcPrim; h?: number }>()
  for (const g of segs) {
    if (g.inst === undefined || (g.role !== 'door' && g.role !== 'window')) continue
    const k = `${g.block}#${g.inst}`
    const b = insts.get(k) ?? insts.set(k, { role: g.role, block: g.block ?? '', pts: [], tall: [] }).get(k)!
    b.pts.push(g.a, g.b)
    if (g.h) (b.h = Math.max(b.h ?? 0, g.h)), b.tall.push(g.a, g.b) // (its jambs' thickness: the wall's height)
  }
  for (const a of d.arcs) {
    const b = a.inst !== undefined ? insts.get(`${a.block}#${a.inst}`) : undefined
    if (b && isSwing(a)) b.arc = a
  }
  const jambsOf = (pts: Pt[], minSpan = MIN_GAP): [Pt, Pt, number] | null => {
    const jambs: { m: Pt; L: number; dir: Pt }[] = []
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const L = len(sub(pts[i + 1], pts[i]))
      if (L >= WALL_MIN && L <= WALL_MAX) jambs.push({ m: { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }, L, dir: folded(pts[i], pts[i + 1]).dir })
    }
    let pair: [Pt, Pt, number] | null = null
    for (const [i, j] of jambs.entries())
      for (const k of jambs.slice(i + 1)) {
        const span = sub(k.m, j.m)
        if (Math.abs(j.L - k.L) > 0.01 || Math.abs(crossZ(j.dir, k.dir)) > PAR || Math.abs(dot(span, j.dir)) > 0.01 || len(span) < minSpan) continue
        if (!pair || len(span) > len(sub(pair[1], pair[0]))) pair = [j.m, k.m, j.L]
      }
    return pair
  }
  let blockOpenings = 0
  let glassWalls = 0
  const placed = new Set<ArcPrim>()
  for (const b of insts.values()) {
    // (Plotline's own export: the jambs are the lines carrying the wall's height — an opening of any width)
    const jambs = d.own && b.tall.length >= 4 ? jambsOf(b.tall, 0.01) : jambsOf(b.pts)
    const at = jambs ? { x: (jambs[0].x + jambs[1].x) / 2, y: (jambs[0].y + jambs[1].y) / 2 } : { x: b.pts.reduce((acc, p) => acc + p.x, 0) / b.pts.length, y: b.pts.reduce((acc, p) => acc + p.y, 0) / b.pts.length }
    let w = jambs ? wallAt(kept, at, 0.05, !!d.own) : wallAt(kept, at, 0.3)
    if (w && jambs && Math.abs(crossZ(w.dir, sub(jambs[1], jambs[0]))) > 0.05 * len(sub(jambs[1], jambs[0]))) w = null // (a wall across it, not along)
    if (!w && jambs && d.own) {
      // a wall on the block's line that ends at one of its jambs runs on through it (a door right at a corner: the wall's
      // last piece beyond it was too short to draw); else the jambs make a wall of their own (all glass, all passage)
      const J = [jambs[0], jambs[1]]
      const on = kept.find((v) => Math.abs(snapThick(jambs[2]) - v.thick) <= SNAP_THICK && Math.abs((v.h ?? -1) - (b.h ?? -1)) <= 0.01 && J.every((p) => Math.abs(dot(sub(p, v.a), v.n)) <= 0.01) && J.some((p) => [v.a, v.b].some((E) => len(sub(E, p)) <= 0.05)))
      if (on) {
        const ts = [on.t0, on.t1, ...J.map((p) => dot(p, on.dir))]
        const at = (t: number): Pt => ({ x: on.a.x + on.dir.x * (t - on.t0), y: on.a.y + on.dir.y * (t - on.t0) })
        const [a, c] = [at(Math.min(...ts)), at(Math.max(...ts))]
        Object.assign(on, { a, b: c, t0: dot(a, on.dir), t1: dot(c, on.dir) })
        w = on
      } else {
        w = { ...piece(jambs[0], jambs[1], snapThick(jambs[2]), b.h), openings: [] }
        kept.push(w)
        glassWalls++
      }
    }
    if (!w) continue
    const ts = (jambs ? [jambs[0], jambs[1]] : b.pts).map((p) => dot(p, w.dir))
    const t0 = Math.min(...ts), t1 = Math.max(...ts)
    const kind: OpeningKind = /SLID/i.test(b.block) ? 'slider' : /PASS/i.test(b.block) ? 'passage' : b.role === 'window' ? 'window' : 'door'
    // (an exact block — Plotline's own, with its jambs — may be narrow: a curved glass wall's pane on each chord)
    const exact = !!jambs && !!d.own
    if ((kind === 'door' && t1 - t0 > 4) || t1 - t0 < (exact ? 0.01 : MIN_GAP)) continue
    const swing = kind === 'door' && b.arc ? swingOn(b.arc, w) : null
    if (swing) placed.add(b.arc!)
    if (putOpening(w, { kind, t0, t1, ...(swing ? { hinge: swing.hinge, swing: swing.swing } : {}) }, exact)) blockOpenings++
  }
  // door swings drawn on their own (not in a block that placed them): a quarter arc hinged on a wall
  let doorArcs = 0
  for (const a of d.arcs) {
    if (placed.has(a) || role(a) === 'ignore' || role(a) === 'window' || !isSwing(a)) continue
    const w = wallAt(kept, P(a.c), 0.1)
    const o = w && swingOn(a, w)
    if (w && o && putOpening(w, o)) doorArcs++
  }

  if (glassWalls) notes.push(`${glassWalls} door / window / passage block(s) standing in no wall taken as walls of that opening (a wall all of glass, all passage).`)

  // → the Unit
  if (!kept.length) notes.push('No walls found: no parallel line pairs 5–60 cm apart.')
  let ox = Infinity, oy = Infinity
  for (const w of kept) (ox = Math.min(ox, w.a.x, w.b.x)), (oy = Math.min(oy, w.a.y, w.b.y))
  if (!kept.length) ox = oy = 0
  const shift = (p: Pt): Pt => ({ x: Math.round((p.x - ox) * 1e4) / 1e4, y: Math.round((p.y - oy) * 1e4) / 1e4 })
  const unit0: Unit = { ...emptyUnit(), name, pillars: pillars.map((p) => ({ ...p, ...shift(p) })) }
  const tally = new Map<number, number>()
  for (const w of kept) if (w.h) tally.set(Math.round(w.h * 100) / 100, (tally.get(Math.round(w.h * 100) / 100) ?? 0) + (w.t1 - w.t0))
  const usualH = [...tally].sort((p, q) => q[1] - p[1])[0]?.[0] ?? WALL_HEIGHT_M
  // Plotline's own export marks every opening with a block: there a bare gap between two pieces of a wall is where one
  // wall ends and another begins, not an opening
  const marked = !!d.own
  // a corner: its own for each wall end, but the walls read from centre lines share theirs where they met (a curve's chords)
  const at = new Map<string, Vertex>()
  const corner = (p: Pt): Vertex => {
    const k = `${p.x},${p.y}`
    const v = (axes && at.get(k)) || { id: newId(), ...p }
    if (!at.has(k) || !axes) unit0.vertices.push(v), at.set(k, v)
    return v
  }
  for (const w0 of [...kept, ...zones]) {
    const gaps = marked ? w0.openings.filter((o) => o.gap) : []
    const cuts = [w0.t0, ...gaps.flatMap((o) => [o.t0, o.t1]), w0.t1]
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const at = (t: number): Pt => ({ x: w0.a.x + w0.dir.x * (t - w0.t0), y: w0.a.y + w0.dir.y * (t - w0.t0) })
      const w = { ...w0, a: at(cuts[k]), b: at(cuts[k + 1]), t0: cuts[k], t1: cuts[k + 1] }
      if (Math.abs(w.t1 - w.t0) < 1e-3) continue // (a wall whose ends a join moved past each other runs the other way: kept)
      const a = corner(shift(w.a)), b = corner(shift(w.b))
      const openings: Opening[] = []
      for (const o of w0.openings.filter((x) => !gaps.includes(x)).sort((p, q) => p.t0 - q.t0)) {
        const defaults = openingDefaults(o.kind, false)
        const t0 = Math.max(w.t0, o.t0), t1 = Math.min(w.t1, o.t1)
        if (t1 - t0 < (o.exact ? 0.01 : MIN_GAP) || (openings.length && openings[openings.length - 1].offsetM + openings[openings.length - 1].widthM > t0 - w.t0)) continue
        openings.push({ id: newId(), kind: o.kind, offsetM: t0 - w.t0, widthM: t1 - t0, heightM: defaults.heightM, sillM: defaults.sillM, ...(o.kind === 'door' ? { hinge: o.hinge, swing: o.swing } : {}) })
      }
      unit0.walls.push({ id: newId(), a: a.id, b: b.id, thicknessM: w.thick, heightM: w.h ?? usualH, openings })
    }
  }
  // the Studio's own load path (join walls, drop stubs, heal straight runs), then no wall end left touching another (nodeGraph)
  const settled = settleImport(normalizeUnit(unit0))
  let unit = settled.unit
  if (settled.joined) notes.push(`${settled.joined} wall ends that touched another wall without a shared corner were joined to it.`)

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
    .flatMap((t) => t.text.split('\n').map((line, i) => ({ at: shift(P({ x: t.at.x, y: t.at.y - i * t.height * 1.6 })), text: stripText(line), height: t.height, levelM: (t.z ?? 0) * s })))
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
    // a name has letters; a measurement with a word on it ("8'-5\" CLG", "Sill H=3'-0\"", "2.4 m") names no room; a bare
    // number ("12", "P-3": a parking bay, a room number) does (core guessKind reads a bay)
    const number = /^\s*([A-Z]-?)?\d{1,4}\s*$/i.test(t.text)
    if ((!/[A-Za-z]{2}/.test(t.text) || /\d\s*['"′″’]|\d\s*(mm|cm|m|ft|in)\b/i.test(t.text)) && !flat && !number) continue
    // a stair's arrow ("UP", "DN") and a door / window tag ("D-16", "Win-18", "W3") name no room
    if (NOT_A_NAME.test(t.text)) continue
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
    const l: RoomLabel = { id: newId(), name: t.text, kind: guessKind(t.text), x: t.at.x, y: t.at.y, ...(Math.abs(t.levelM) > 0.005 ? { levelM: Math.round(t.levelM * 1e4) / 1e4 } : {}) }
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

/** a corner this close to another wall's centre line lies on it (MERGE_M: the Studio's "one corner") */
const ON_LINE_M = 0.01

/**
 * The last pass over an imported floor (session 31): a corner left lying on another wall's centre line — the joining rules
 * keep a corner one short step from a junction as "joined already", and a file's wall drawn into another's body leaves its
 * end on a third wall — splits that wall there (a T); a corner within ON_LINE_M of a wall's end becomes that end; two
 * walls then between the same corners are one (the thicker, the taller, the openings of the one that has them); a wall of
 * no length goes. After it no wall end touches another wall mid-way (core validate's walls-intersect). The Studio's own
 * load path leaves the result as it is (tested). `joined` = how many touches were joined.
 * ponytail: O(walls × corners in their box) per pass, corners in a 1 m grid; a sweep line if a 10 000-wall floor shows up.
 */
export function nodeGraph(unit: Unit): { unit: Unit; joined: number } {
  let u = unit
  let joined = 0
  for (let pass = 0; pass < 6; pass++) {
    const V = new Map(u.vertices.map((v) => [v.id, v]))
    const used = new Set(u.walls.flatMap((w) => [w.a, w.b]))
    const grid = new Map<string, Id[]>()
    const cell = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`
    for (const id of used) {
      const v = V.get(id)
      if (v) (grid.get(cell(v.x, v.y)) ?? grid.set(cell(v.x, v.y), []).get(cell(v.x, v.y))!).push(id)
    }
    const alias = new Map<Id, Id>()
    const root = (id: Id): Id => (alias.has(id) ? root(alias.get(id)!) : id)
    const walls: Wall[] = []
    let changed = false
    for (const w of u.walls) {
      const a = V.get(w.a), b = V.get(w.b)
      if (!a || !b) continue
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 1e-9) {
        walls.push(w)
        continue
      }
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const cuts: { s: number; id: Id }[] = []
      for (let gx = Math.floor(Math.min(a.x, b.x) - ON_LINE_M); gx <= Math.floor(Math.max(a.x, b.x) + ON_LINE_M); gx++)
        for (let gy = Math.floor(Math.min(a.y, b.y) - ON_LINE_M); gy <= Math.floor(Math.max(a.y, b.y) + ON_LINE_M); gy++)
          for (const id of grid.get(`${gx},${gy}`) ?? []) {
            if (id === w.a || id === w.b) continue
            const v = V.get(id)!
            const s = (v.x - a.x) * d.x + (v.y - a.y) * d.y
            if (s < -ON_LINE_M || s > L + ON_LINE_M || Math.abs((v.y - a.y) * d.x - (v.x - a.x) * d.y) > ON_LINE_M) continue
            if (s <= ON_LINE_M || s >= L - ON_LINE_M) {
              const end = s <= ON_LINE_M ? w.a : w.b
              if (root(id) !== root(end) && Math.hypot(v.x - V.get(end)!.x, v.y - V.get(end)!.y) <= 2 * ON_LINE_M) alias.set(root(id), root(end))
            } else cuts.push({ s, id })
          }
      if (!cuts.length) {
        walls.push(w)
        continue
      }
      changed = true
      joined += cuts.length
      cuts.sort((p, q) => p.s - q.s)
      const stops = [{ s: 0, id: w.a }, ...cuts, { s: L, id: w.b }]
      const pieces: Wall[] = stops.slice(1).map((t, i) => ({ ...w, id: i === 0 ? w.id : newId(), a: stops[i].id, b: t.id, openings: [] }))
      // an opening across a cut stays on the piece holding most of it, cut back to the corner (gone when under 30 cm)
      for (const o of w.openings) {
        const part = (i: number) => Math.min(o.offsetM + o.widthM, stops[i + 1].s) - Math.max(o.offsetM, stops[i].s)
        const i = pieces.reduce((best, _, k) => (part(k) > part(best) ? k : best), 0)
        const o0 = Math.max(o.offsetM, stops[i].s), o1 = Math.min(o.offsetM + o.widthM, stops[i + 1].s)
        if (o1 - o0 >= Math.min(0.3, o.widthM) - 1e-9) pieces[i].openings.push({ ...o, offsetM: o0 - stops[i].s, widthM: o1 - o0 })
      }
      walls.push(...pieces)
    }
    if (alias.size) changed = true
    joined += alias.size
    // corners merged; a wall of no length goes; two walls between the same corners are one
    const byKey = new Map<string, Wall>()
    for (const w0 of walls) {
      const w = { ...w0, a: root(w0.a), b: root(w0.b) }
      if (w.a === w.b) continue
      const k = w.a < w.b ? `${w.a}|${w.b}` : `${w.b}|${w.a}`
      const twin = byKey.get(k)
      if (!twin) {
        byKey.set(k, w)
        continue
      }
      changed = true
      const keep = twin.openings.length >= w.openings.length ? twin : w
      byKey.set(k, { ...keep, thicknessM: Math.max(twin.thicknessM, w.thicknessM), heightM: Math.max(twin.heightM, w.heightM) })
    }
    if (!changed) break
    const live = new Set([...byKey.values()].flatMap((w) => [w.a, w.b]))
    u = { ...u, walls: [...byKey.values()], vertices: u.vertices.filter((v) => live.has(v.id) || !used.has(v.id)) }
  }
  return { unit: u, joined }
}

const shape = (u: Unit) => `${u.walls.length}/${u.vertices.length}/${u.vertices.reduce((a, v) => a + v.x * 3.1 + v.y * 1.7, 0).toFixed(4)}`

/** a zone line's corner this close to a wall is ON it (a room outline runs along a wall's face: half a thickness, a lining) */
const ZONE_REACH_M = 0.3

/**
 * Zone lines (height 0, drawn as nothing: a file's room outlines where no wall stands) end on the inner FACE of the wall
 * they meet, up to half a thickness (and a lining) off its centre line, where nothing joins them: a corner of zone lines
 * only within ZONE_REACH_M of a wall is moved onto it — its nearest corner or the nearest point of its
 * centre line — within ZONE_REACH_M (nodeGraph then makes the T). Only the invisible lines move: no wall moves or tilts.
 */
export function zonesOntoWalls(unit: Unit): Unit {
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  const real = unit.walls.filter((w) => w.heightM > 0)
  const onReal = new Set(real.flatMap((w) => [w.a, w.b]))
  const zoneOnly = new Set(unit.walls.filter((w) => w.heightM <= 0).flatMap((w) => [w.a, w.b]).filter((id) => !onReal.has(id)))
  if (!zoneOnly.size || !real.length) return unit
  const moved = new Map<Id, Pt>()
  const merge = new Map<Id, Id>()
  for (const id of zoneOnly) {
    const z = V.get(id)!
    let best: { d: number; p: Pt; to?: Id } | null = null
    for (const w of real) {
      const a = V.get(w.a), b = V.get(w.b)
      if (!a || !b) continue
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 1e-9) continue
      const s = Math.max(0, Math.min(L, ((z.x - a.x) * (b.x - a.x) + (z.y - a.y) * (b.y - a.y)) / L))
      const p = { x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L }
      const d = Math.hypot(p.x - z.x, p.y - z.y)
      if (d > ZONE_REACH_M || (best && d >= best.d)) continue
      best = { d, p, ...(s <= ON_LINE_M ? { to: w.a } : s >= L - ON_LINE_M ? { to: w.b } : {}) }
    }
    if (!best || best.d <= 1e-6) continue
    if (best.to) merge.set(id, best.to)
    else moved.set(id, best.p)
  }
  if (!moved.size && !merge.size) return unit
  const end = (x: Id) => merge.get(x) ?? x
  return {
    ...unit,
    vertices: unit.vertices.filter((v) => !merge.has(v.id)).map((v) => (moved.has(v.id) ? { ...v, ...moved.get(v.id)! } : v)),
    walls: unit.walls.map((w) => (merge.has(w.a) || merge.has(w.b) ? { ...w, a: end(w.a), b: end(w.b) } : w)).filter((w) => w.a !== w.b),
  }
}

/**
 * An imported floor as the Studio opens it — its own load path (join walls, drop stubs, heal straight runs) — and as it
 * stays when opened again: the load and nodeGraph by turns until a load changes nothing (at most four rounds; a file's
 * junction of three thick walls at odd angles can take two). `joined`: the touches nodeGraph joined.
 */
export function settleImport(unit: Unit): { unit: Unit; joined: number } {
  const load = (u: Unit) => reducer(initialState(), { type: 'load-unit', unit: u }).unit
  let u = load(unit)
  let joined = 0
  for (let round = 0; round < 4; round++) {
    const z = zonesOntoWalls(u)
    const n = nodeGraph(z)
    joined += n.joined
    if (n.unit === u) return { unit: u, joined } // (nothing left to join: what the load gave stays — no second load)
    const again = load(n.unit)
    if (shape(again) === shape(n.unit)) return { unit: n.unit, joined }
    u = again
  }
  const n = nodeGraph(u)
  return { unit: n.unit, joined: joined + n.joined }
}

/**
 * Which pens draw the walls (session 31, formats2; SVG too since formats3). A layerless CAD print (a PDF, a flat SVG) draws walls with its heaviest pen and often fills them grey
 * or black: the stroked pens at least PEN_HEAVY times as wide as the plan's usual line (the length-weighted median) that
 * draw at least PEN_SHARE of all its lines, and the fills of a grey (not white, not a colour) that do — when the page's
 * scale is known and the filled shapes are wall-thin (on average under FILL_THIN_M across: a room shaded grey is no wall).
 * None (one pen for everything, a coloured drawing): nothing is sorted, every line pair counts as before.
 */
const PEN_HEAVY = 2.5
const PEN_SHARE = 0.03
const FILL_THIN_M = 0.6
/** per fill pen: the filled shapes' area and outline length, page points */
export type Fills = Map<string, { area: number; outline: number }>
/** a grey or black, not white: '#c0c0c0', '64,64,64', a gray level */
const grey = (c: string): boolean => {
  const rgb = /^#?([0-9a-f]{6})$/i.test(c) ? [0, 2, 4].map((i) => parseInt(c.replace('#', '').slice(i, i + 2), 16)) : c.split(',').map(Number)
  if (rgb.some((x) => !Number.isFinite(x))) return false
  const [r, g, b] = rgb.length === 1 ? [rgb[0], rgb[0], rgb[0]] : rgb
  return Math.max(r, g, b) - Math.min(r, g, b) <= 16 && Math.max(r, g, b) < 240
}
export function penRoles(segs: Seg[], fills: Fills = new Map(), scale: number | null = null, unit = 'pt'): { walls: Set<string>; words: string } {
  const length = new Map<string, number>()
  for (const g of segs) length.set(g.layer, (length.get(g.layer) ?? 0) + Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y))
  const total = [...length.values()].reduce((a, b) => a + b, 0)
  const strokes = [...length].filter(([p]) => p.startsWith('pen ')).map(([p, L]) => ({ p, L, w: Number(p.split(' ')[1]) })).sort((a, b) => a.w - b.w)
  const strokeTotal = strokes.reduce((a, x) => a + x.L, 0)
  let acc = 0
  const median = strokes.find((x) => (acc += x.L) >= strokeTotal / 2)?.w ?? 0
  const walls = new Set<string>()
  for (const x of strokes) if (median > 0 && x.w >= PEN_HEAVY * median && x.L >= PEN_SHARE * total) walls.add(x.p)
  // (a long thin shape's mean width is twice its area over its outline)
  const thin = (p: string) => {
    const f = fills.get(p)
    return !!scale && !!f && f.outline > 0 && ((2 * f.area) / f.outline) * scale <= FILL_THIN_M
  }
  for (const [p, L] of length) if (p.startsWith('fill ') && grey(p.slice(5)) && L >= PEN_SHARE * total && thin(p)) walls.add(p)
  const words = [...walls].map((p) => (p.startsWith('fill') ? `filled ${p.split(' ')[1]}` : `${p.split(' ')[1]} ${unit} ${p.split(' ')[2]}`)).join(', ')
  return { walls, words }
}

// ---------- what PDF and SVG share: a sheet with no scale, door swings drawn as curves ----------

/**
 * A scale printed on the sheet — `1/4" = 1'-0"`, `1" = 10'`, `1:100`, `SCALE 1 : 50` — as how many times smaller the
 * paper draws it (48, 120, 100, 50); else null. The word may be a European sheet's (`Scala 1:100`, `M 1:50`, `Maßstab`,
 * `Échelle`, `Escala`, `Schaal`, `Skala`: the languages the layer table reads) and a metric scale may run on into the title
 * block's next words (`1 : 100 Datum: 09.04.2013`). Of 888 PDF pages (the format corpus, the Dhaka brochures, the
 * 2026-11-22 samples) only those two sheets read differently for it (session 31 samples lane).
 */
export function printedScale(text: string): number | null {
  const t = text.replace(/^\s*(?:scale|scala|escala|[eé]chelle|ma(?:ß|ss)stab|m|schaal|skala)\.?\s*:?\s*/i, '').trim()
  const metric = /^1\s*:\s*(\d{1,4})(?:\s+\D.*)?$/.exec(t)
  const imperial = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*"\s*=\s*(\d+)\s*'(?:\s*-?\s*0\s*")?$/.exec(t)
  const inches = (s: string) => s.split(/\s+/).reduce((a, p) => a + (p.includes('/') ? +p.split('/')[0] / +p.split('/')[1] : +p), 0)
  const n = metric ? +metric[1] : imperial ? (+imperial[2] * 12) / inches(imperial[1]) : null
  return n !== null && Number.isFinite(n) && n >= 2 ? n : null
}

/**
 * A drawing without a scale (a PDF, an SVG): the scale printed on the sheet, when the file's unit on paper is known
 * (`paperM`: a PDF point is 1/72 inch) and the sheet prints one value (a sheet of several scales says nothing; a page's
 * tables can fool the dimensions — twindo's room pages measured 1 : 31–64 for their printed 1 : 16 / 1 : 24); else the
 * printed dimensions measured against their lines when three agree; else the printed room sizes against the drawing's
 * box (rooms take about half a plan); else 1 with a "set it with S" note. `sheet`: what the found ratio means on paper.
 */
export function sheetScale(segs: Seg[], texts: TextPrim[], sheet: (unitsPerM: number) => string = () => '', paperM = 0): { scale: number; note: string } {
  const printed = paperM ? [...new Set(texts.map((t) => printedScale(t.text)).filter((n) => n !== null))] : []
  if (printed.length === 1) return { scale: printed[0] * paperM, note: `Scale: as printed on the sheet, 1 : ${+printed[0].toFixed(1)}.` }
  const dims = scaleFromDimensions(segs, texts)
  if (dims) return { scale: 1 / dims.ptPerM, note: `Scale: from ${dims.agreed} printed dimensions that agree${sheet(dims.ptPerM)}.` }
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const g of segs) for (const p of [g.a, g.b]) (box.x0 = Math.min(box.x0, p.x)), (box.y0 = Math.min(box.y0, p.y)), (box.x1 = Math.max(box.x1, p.x)), (box.y1 = Math.max(box.y1, p.y))
  const sizeArea = texts.reduce((acc, t) => {
    const d = parseDims(t.text)
    return acc + (d ? d.aM * d.bM : 0)
  }, 0)
  if (sizeArea > 0) return { scale: Math.sqrt((0.5 * sizeArea) / ((box.x1 - box.x0) * (box.y1 - box.y0))), note: "Scale: no three printed dimensions agree — guessed from the printed room sizes; check it with the Studio's S tool." }
  return { scale: 1, note: "Scale not set: no printed dimensions or room sizes to measure against — set it with the Studio's S tool." }
}

/**
 * A cubic bezier that is a quarter circle (a door swing drawn as a curve, as PDF and SVG writers do): its centre is the far
 * corner of the tangents' box. The arc counter-clockwise from a0 to a1, or null.
 */
export function quarterArc(p0: Pt, p1: Pt, p2: Pt, p3: Pt): { c: Pt; r: number; a0: number; a1: number } | null {
  const corner = { x: p0.x + (p1.x - p0.x) / 0.5523, y: p0.y + (p1.y - p0.y) / 0.5523 }
  const c = { x: p0.x + p3.x - corner.x, y: p0.y + p3.y - corner.y }
  const r0 = Math.hypot(p0.x - c.x, p0.y - c.y), r3 = Math.hypot(p3.x - c.x, p3.y - c.y)
  const t3 = { x: p3.x + (p2.x - p3.x) / 0.5523, y: p3.y + (p2.y - p3.y) / 0.5523 }
  const dotT = (p0.x - c.x) * (p3.x - c.x) + (p0.y - c.y) * (p3.y - c.y)
  if (!(r0 > 0 && Math.abs(r3 - r0) < 0.03 * r0 && Math.hypot(t3.x - corner.x, t3.y - corner.y) < 0.05 * r0 && Math.abs(dotT) < 0.1 * r0 * r0)) return null
  const b0 = Math.atan2(p0.y - c.y, p0.x - c.x), b3 = Math.atan2(p3.y - c.y, p3.x - c.x)
  const ccw = (p0.x - c.x) * (p3.y - c.y) - (p0.y - c.y) * (p3.x - c.x) > 0
  return { c, r: r0, a0: ccw ? b0 : b3, a1: ccw ? b3 : b0 }
}

/**
 * Points per metre from the printed dimensions: each dimension text ("14'-0\"", "10'-8 1/2\"") against the line it sits on
 * (parallel to the text, passing under its middle); the median ratio when ≥ 3 agree within 2 %, else null.
 */
function scaleFromDimensions(segs: Seg[], texts: TextPrim[]): { ptPerM: number; agreed: number } | null {
  const ratios: number[] = []
  for (const t of texts) {
    if (!/['"]|\bmm\b|\bm\b/.test(t.text) || parseDims(t.text)) continue
    const m = parseSide(t.text)
    if (!m) continue
    for (const g of segs) {
      const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y)
      if (L < 4 * t.height) continue
      const dir = { x: (g.b.x - g.a.x) / L, y: (g.b.y - g.a.y) / L }
      const d = { x: t.at.x - g.a.x, y: t.at.y - g.a.y }
      const s = d.x * dir.x + d.y * dir.y
      const perp = Math.abs(d.x * dir.y - d.y * dir.x)
      if (perp > 2.5 * t.height || s < -t.height || s > L + t.height) continue
      ratios.push(L / m)
    }
  }
  if (ratios.length < 3) return null
  ratios.sort((p, q) => p - q)
  let best: { r: number; n: number } = { r: 0, n: 0 }
  for (const r of ratios) {
    const n = ratios.filter((x) => Math.abs(x - r) <= 0.02 * r).length
    if (n > best.n) best = { r, n }
  }
  if (best.n < 3) return null
  const agree = ratios.filter((x) => Math.abs(x - best.r) <= 0.02 * best.r)
  return { ptPerM: agree[Math.floor(agree.length / 2)], agreed: agree.length }
}

/**
 * A unitless file's unit, guessed: of millimetres / centimetres / inches / feet / metres, the ones that make the plan
 * 3–200 m across; among those, when the file prints room sizes ("12'0'' x 7'11''"), the one where the rooms' summed
 * area is the most plausible share (~ half) of the plan's box — else the usual one for that extent.
 */
export function guessScale(box: { w: number; h: number }, sizeAreaSqm: number): { scale: number; words: string } {
  const C: [number, string][] = [
    [0.001, 'millimetres'],
    [0.01, 'centimetres'],
    [0.0254, 'inches'],
    [0.3048, 'feet'],
    [1, 'metres'],
  ]
  const extent = Math.max(box.w, box.h)
  const fits = C.filter(([k]) => extent * k >= 3 && extent * k <= 200)
  if (!fits.length) return { scale: 1, words: 'unknown — taken as metres; set the scale in the Studio (S)' }
  if (sizeAreaSqm > 0 && fits.length > 1) {
    const best = fits.map(([k, w]) => ({ k, w, off: Math.abs(Math.log((sizeAreaSqm / (box.w * k * box.h * k)) / 0.5)) })).sort((p, q) => p.off - q.off)[0]
    return { scale: best.k, words: `${best.w} (guessed: the printed room sizes fit the plan's size)` }
  }
  // without sizes: the usual unit for that extent (mm for thousands, inches for hundreds, feet for 15–150, metres under)
  const usual = extent >= 5000 ? 0.001 : extent >= 500 ? 0.0254 : extent >= 150 ? 0.3048 : extent >= 15 ? 0.3048 : 1
  const pick = fits.find(([k]) => k === usual) ?? fits[0]
  return { scale: pick[0], words: `${pick[1]} (guessed from the extent)` }
}
