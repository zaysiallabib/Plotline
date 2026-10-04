/**
 * Studio state + pure reducer. No DOM, no React: Vitest-covered.
 * Every coordinate in here is plan METERS. Pixels stay in StudioApp/draw.
 */
import { FT, deriveRooms, formatFeetInches, isOutdoor, nearestWall, newId, parseLength, roomAt, roomPolygon, validate, vertexById, wallFrame } from '../core'
import type { Id, Opening, OpeningKind, Pillar, Pt, Room, RoomKind, RoomLabel, Unit, ValidationIssue, Vertex, Wall } from '../core'
import { snapOpeningOffset, type OpeningSnap } from './snap'
import { furnish } from '../furnish/presets'
import { deletePiece, forgetPresets, layoutFor, movePiece, placePiece, resizePiece } from './furniture'
import type { Review } from './review'

export const PARTITION_M = 0.127
export const EXTERIOR_M = 0.254
export const WALL_HEIGHT_M = 3.048
const EPS = 1e-6
const HISTORY_CAP = 200
const IDLE_MS = 3 * 60_000

export type Tool = 'select' | 'scale' | 'wall' | 'opening' | 'room' | 'furniture' | 'pillar'

/** The W tool's wall types (session 19: picked before placing, remembered until changed); a type IS a height. */
export type WallType = 'wall' | 'low' | 'kerb' | 'zone'
export const WALL_TYPES: Record<WallType, { label: string; heightM: number }> = {
  wall: { label: 'Wall', heightM: WALL_HEIGHT_M },
  low: { label: 'Low wall', heightM: 1.1 }, // a parapet, a screen: its height typed after
  kerb: { label: 'Kerb', heightM: 0.15 },
  zone: { label: 'Zone line', heightM: 0 }, // a zone's edge (lawn | paving …): drawn as nothing in 3D
}
/** a zone line's plan width (a graph edge, never a wall in 3D) */
export const ZONE_LINE_M = 0.05
/** up to this a wall is a kerb (core: ≤ ~0.2) */
export const KERB_M = 0.2
/** the type a height reads as: 0 a zone line, ≤ KERB_M a kerb, under LOW_M a low wall */
export const wallTypeOf = (heightM: number): WallType => (heightM === 0 ? 'zone' : heightM <= KERB_M ? 'kerb' : heightM < LOW_M ? 'low' : 'wall')
/** the C tool's click: a 12" × 20" column */
export const PILLAR_M = { wM: FT, hM: (20 / 12) * FT }
const MIN_PILLAR_M = 0.1
export interface View {
  panX: number
  panY: number
  zoom: number
}
export interface PlanImage {
  dataUrl: string
  naturalW: number
  naturalH: number
  name: string
}
/** A plan point plus the snap tolerance (m) the reducer uses to merge onto vertices / split walls. */
export interface Target extends Pt {
  tolM: number
}
export interface Timer {
  elapsedMs: number
  started: boolean
  stopped: boolean
  lastInputAt: number
  lastTickAt: number
}
export interface Chain {
  ids: Id[]
  thicknessM: number
  /** the walls it draws: the W tool's type (WALL_TYPES) */
  heightM: number
}
export interface StudioState {
  unit: Unit
  planImage: PlanImage | null
  view: View
  tool: Tool
  chain: Chain | null
  selection: Id[]
  history: { past: Unit[]; future: Unit[] }
  timer: Timer
  lastOpeningKind: OpeningKind
  /** the O tool's picked width for lastOpeningKind; absent = the kind's default (openingDefaults: a door on a bath wall 2'-6") */
  lastOpeningWidthM?: number
  /** the W tool's picked wall type; absent = 'wall' */
  wallType?: WallType
  /** the W tool's low-wall height typed before drawing (a 6' boundary wall, a 7' screen); absent = WALL_TYPES.low */
  lowWallM?: number
  toast: { text: string; key: number } | null
  dragBlocked: boolean
  exported: boolean
  /** the "Drag any corner with V" tip after the first closed loop, once per session (not in the Draft) */
  loopTipShown: boolean
  /** the last auto-trace's "Check these" list (review.ts: studioReducer sets it; absent = none) */
  review?: Review | null
}
export interface Draft {
  unit: Unit
  planImage: PlanImage | null
  view: View
  timer: Timer
  review?: Review | null
}

export type Action =
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-view'; view: View }
  | { type: 'set-plan-image'; image: PlanImage | null }
  | { type: 'set-scale'; pxPerM: number }
  | { type: 'set-meta'; patch: Partial<Pick<Unit, 'name' | 'projectName' | 'floor' | 'areaSqft' | 'northDeg'>> }
  | { type: 'select'; ids: Id[]; add?: boolean }
  /** `wall`: this chain's type instead of the W tool's pick (an Issues fix's zone line) */
  | { type: 'chain-start'; at: Target; wall?: WallType }
  /** the W tool's type picker (keys 1–4): what the next walls are, the chain being drawn too; `lowWallM` = the low wall's typed height */
  | { type: 'pick-wall'; wall: WallType; lowWallM?: number }
  /**
   * walls to another type: its height, or `heightM` (the typed Height of one or several walls); a zone line 0.05 thin, out of
   * one back to a partition; refused onto a zone line while they have openings. One undo.
   */
  | { type: 'set-wall-type'; ids: Id[]; wall: WallType; heightM?: number }
  /** "Stands alone (screen / decoration)" / "Keep — it stands alone": its loose ends are meant (Wall.standsAlone); one undo */
  | { type: 'stand-alone'; ids: Id[]; on: boolean }
  /** the C tool: a column centred at (x, y) (Unit.pillars), selected */
  | { type: 'add-pillar'; x: number; y: number; wM: number; hM: number }
  /** a column moved / resized; `live` = mid-drag (drag-begin holds the undo entry) */
  | { type: 'set-pillar'; id: Id; patch: Partial<Omit<Pillar, 'id'>>; live?: boolean }
  /** mid-drag (drag-begin holds the undo entry): a ramp label's arrow aimed (slope.dirDeg) */
  | { type: 'aim-ramp'; id: Id; dirDeg: number }
  | { type: 'chain-add'; at: Target }
  | { type: 'chain-typed'; lengthM: number; dirDeg: number; tolM: number }
  | { type: 'chain-back' }
  | { type: 'chain-end' }
  | { type: 'toggle-thickness' }
  /** tolM: edge-snap tolerance (10 screen px); absent = centred on t. No kind / widthM = the O tool's pick (lastOpeningKind / lastOpeningWidthM) */
  | { type: 'add-opening'; wallId: Id; t: number; kind?: OpeningKind; widthM?: number; tolM?: number }
  /** the O tool's picker (Panel, keys 1–4): what the next click places; no widthM = the kind's default */
  | { type: 'pick-opening'; kind: OpeningKind; widthM?: number }
  | { type: 'update-opening'; id: Id; patch: Partial<Omit<Opening, 'id'>> }
  /** `standsAlone: true` = "Keep — it stands alone" on a loose end (issues.ts): its free ends are meant */
  | { type: 'update-wall'; id: Id; patch: Partial<Pick<Wall, 'thicknessM' | 'heightM' | 'standsAlone'>> }
  | { type: 'set-wall-length'; id: Id; lengthM: number }
  /** mid-drag (no history of its own): wall `wallId`'s end at `vertexId` moves to a new corner `newId` at the same spot */
  | { type: 'detach'; wallId: Id; vertexId: Id; newId: Id }
  | { type: 'move-vertex'; id: Id; x: number; y: number }
  | { type: 'drag-begin' }
  | { type: 'drag'; vertices: { id: Id; x: number; y: number }[] }
  | { type: 'drag-end'; ids: Id[] }
  | { type: 'drag-opening'; id: Id; offsetM: number; tolM?: number }
  /** mid-drag like drag-opening: the opening's `end` handle to uM (m from corner A), the other end stays; edge snap, min 0.3 m, refused past the wall end or over a sibling */
  /** end a / b: uM along the wall. top / sill (the 3D's top and bottom dots): uM is the height above the floor. */
  | { type: 'resize-opening'; id: Id; end: 'a' | 'b' | 'top' | 'sill'; uM: number; tolM?: number }
  | { type: 'drag-label'; id: Id; x: number; y: number }
  /** arrow keys: move the selection by (dx, dy) m; openings slide along their wall by dx + dy. No snapping. */
  | { type: 'nudge'; dx: number; dy: number }
  /** the whole unit: every wall end inside another wall's body joined there, every crossing split (joinOverlaps), bent straight runs healed (settle); one undo entry + a toast */
  | { type: 'join-walls' }
  | { type: 'delete'; ids?: Id[] }
  | { type: 'add-label'; label: Omit<RoomLabel, 'id'> }
  | { type: 'update-label'; id: Id; patch: Partial<Omit<RoomLabel, 'id'>> }
  /** Ctrl+D: selected walls copied 1 ft along their normal (same thickness / height / openings, corners shared only among the copies), labels 0.5 m off; the copies are the selection */
  | { type: 'duplicate' }
  | { type: 'flip'; what: 'hinge' | 'swing' }
  /** Furniture tool: piece to centre (x, y) on the 3" grid + wall snap (furniture.movePiece), turned to rotationDeg (default: as it stands); refused → toast, nothing moves */
  | { type: 'move-piece'; id: Id; x: number; y: number; rotationDeg?: number }
  /** 90° clockwise about its centre, then out of / flush to a wall it pokes into */
  | { type: 'rotate-piece'; id: Id }
  /** a resizable piece to width x, height y, depth z (m; 5 cm step, kit limits); the back stays on its wall (furniture.resizePiece) */
  | { type: 'resize-piece'; id: Id; sizeM: { x: number; y: number; z: number } }
  /** the piece and what rests on it deleted (tombstones: its room is not re-furnished); undo / reset bring it back */
  | { type: 'delete-piece'; id: Id }
  /** a new piece `id` of kit asset `assetId` from the library, dropped at (x, y) turned `rotationDeg` (furniture.placePiece); refused → toast */
  | { type: 'place-piece'; id: Id; assetId: string; x: number; y: number; rotationDeg: number }
  /** one room back to its preset pieces (its deletions cleared); no room = all of them (an empty array: the layout follows the walls again) */
  | { type: 'reset-furniture'; roomId?: Id }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load-unit'; unit: Unit }
  | { type: 'restore'; draft: Draft }
  | { type: 'reset' }
  | { type: 'timer-start'; now: number }
  | { type: 'timer-input'; now: number }
  | { type: 'timer-tick'; now: number; hidden: boolean }
  | { type: 'exported' }
  | { type: 'toast'; text: string }
  | { type: 'clear-toast' }

export function emptyUnit(): Unit {
  return {
    id: newId(),
    projectName: '',
    name: '',
    northDeg: 0,
    vertices: [],
    walls: [],
    roomLabels: [],
    furniture: [],
    finishSlots: [],
    areaSqft: 0,
  }
}

export function initialState(): StudioState {
  return {
    unit: emptyUnit(),
    planImage: null,
    view: { panX: 0, panY: 0, zoom: 1 },
    tool: 'select',
    chain: null,
    selection: [],
    history: { past: [], future: [] },
    timer: { elapsedMs: 0, started: false, stopped: false, lastInputAt: 0, lastTickAt: 0 },
    lastOpeningKind: 'door',
    toast: null,
    dragBlocked: false,
    exported: false,
    loopTipShown: false,
  }
}

// ---------- graph helpers ----------

const wallKey = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Two corners closer than this after a move are one corner (under half an inch). */
export const MERGE_M = 0.01

/** Corner `id` becomes corner `to`: its walls rewire, a wall collapsed to nothing goes, a doubled wall keeps the one with openings. */
function rewire(u: Unit, id: Id, to: Id): Unit {
  const end = (x: Id) => (x === id ? to : x)
  const seen = new Map<string, Wall>()
  for (const w0 of u.walls) {
    const w = w0.a === id || w0.b === id ? { ...w0, a: end(w0.a), b: end(w0.b) } : w0
    if (w.a === w.b) continue
    const key = wallKey(w.a, w.b)
    const dup = seen.get(key)
    if (!dup || w.openings.length > dup.openings.length) seen.set(key, w)
  }
  return { ...u, walls: u.walls.flatMap((w0) => { const w = seen.get(wallKey(end(w0.a), end(w0.b))); return w && w.id === w0.id ? [w] : [] }), vertices: u.vertices.filter((x) => x.id !== id) }
}

/** Wall `w`'s end `end` moved to `to` along its own line: openings keep their place on the plan. */
function moveEnd(u: Unit, w: Wall, end: Id, to: Pt): Unit {
  const f = wallFrame(w, u.vertices)
  const shift = w.a === end ? (to.x - f.origin.x) * f.dir.x + (to.y - f.origin.y) * f.dir.y : 0 // a moved start re-bases the offsets
  const L = f.lengthM - (w.a === end ? shift : f.lengthM - ((to.x - f.origin.x) * f.dir.x + (to.y - f.origin.y) * f.dir.y))
  const openings = w.openings.map((o) => ({ ...o, offsetM: Math.max(0, Math.min(L - o.widthM, o.offsetM - shift)) }))
  return { ...u, vertices: u.vertices.map((x) => (x.id === end ? { ...x, x: to.x, y: to.y } : x)), walls: u.walls.map((x) => (x.id === w.id ? { ...x, openings } : x)) }
}

/**
 * A join at `s` (m from w.a) inside an opening of `w` (founder 2026-10-03: a planter edge meeting a slider): the opening
 * is cut back to the joining wall's near face (`half` m either side of s), the longer side kept — or dropped when under
 * MIN_OPENING_M. A door too: no leaf spans a partition. `trimmed` = 1 when one was cut / dropped.
 */
function trimAt(u: Unit, w: Wall, s: number, half: number): { unit: Unit; wall: Wall; trimmed: number } {
  const o = w.openings.find((x) => x.offsetM < s - EPS && x.offsetM + x.widthM > s + EPS)
  if (!o) return { unit: u, wall: w, trimmed: 0 }
  const left = s - half - o.offsetM, right = o.offsetM + o.widthM - s - half
  const keep = left >= right ? { ...o, widthM: left } : { ...o, offsetM: s + half, widthM: right }
  const wall = { ...w, openings: w.openings.flatMap((x) => (x !== o ? [x] : keep.widthM >= MIN_OPENING_M ? [keep] : [])) }
  return { unit: { ...u, walls: u.walls.map((x) => (x.id === w.id ? wall : x)) }, wall, trimmed: 1 }
}

/**
 * Overlap = joined (founder 2026-10-03: "if a wall ends inside another — not necessarily at the middle point — it has
 * ended there"). A corner moved onto another corner (≤ MERGE_M) becomes that corner (rewire: no zero-length wall, no
 * stray corner). A corner inside another wall W's BODY — perpendicular distance to its centre line ≤ half its
 * thickness + MERGE_M, projecting onto the segment — has ended there, and NO wall ever tilts to make it so:
 *  - its walls cross W (an axis wall meeting W square): the corner moves onto W's centre line along them (they only
 *    change length) and T-splits W at that projection; inside W's end block (within half W's thickness of an end — or
 *    just past it) a free end of W comes to the meeting point instead (an L, no stub);
 *  - one of its walls runs along W (two widths meeting END TO END on offset centre lines, or overlapping): the corner
 *    stays and a hidden piece joins it to W — from W's end when it is in W's end block (the junction is W's end), else
 *    from W split at the projection — as thick as the thicker of the two (founder: never a visible thin connector);
 *  - only oblique walls: onto W's end corner when in the end block, else onto the projection (T-split).
 * Two walls that cross split each other at the crossing and share the corner. A wall one step away (it shares a corner
 * with one of this corner's walls) counts only when the corner lies on its centre line: else it is the corner's own
 * short piece, not an overlap. `ids` = the corners that moved (checked against every wall, and every corner against
 * their walls); absent = the whole unit (load / auto-trace / join-walls). An opening on the split point is cut back to
 * the joining wall's face (trimAt; `trimmed` counts them). Returns the same unit when nothing changed; `merged` maps each
 * removed corner to its survivor. Snapping (snap.ts) is untouched: this only decides what a dropped end is joined to.
 */
export function joinOverlaps(unit: Unit, ids?: Id[]): { unit: Unit; merged: Map<Id, Id>; joined: number; trimmed: number } {
  const merged = new Map<Id, Id>()
  const scope = ids && new Set(ids)
  const touches = (w: Wall) => !scope || scope.has(w.a) || scope.has(w.b)
  let u = unit
  let joined = 0
  let trimmed = 0
  /** split `w` at s (m) where a wall `half` m wide (along w) joins it, an opening there trimmed first */
  const split = (w: Wall, s: number, half: number) => {
    const t = trimAt(u, w, s, half)
    trimmed += t.trimmed
    return splitWall(t.unit, t.wall, s / wallFrame(t.wall, t.unit.vertices).lengthM) as { unit: Unit; vertexId: Id } // (nothing straddles s now)
  }
  // the moved corners first (they join onto what stands still), then the corners inside a moved wall's body
  for (const id of new Set([...(ids ?? []), ...u.vertices.map((v) => v.id)])) {
    const V = new Map(u.vertices.map((v) => [v.id, v]))
    const v = V.get(id)
    if (!v) continue
    const mine = !scope || scope.has(id)
    // (the whole unit: a tiny wall between two corners — a traced jog a hair long — is geometry, not a corner to merge)
    const linked = (x: Id) => !!scope || !u.walls.some((w) => wallKey(w.a, w.b) === wallKey(id, x))
    const other = mine && u.vertices.find((x) => x.id !== id && Math.hypot(x.x - v.x, x.y - v.y) <= MERGE_M && linked(x.id))
    if (other) {
      u = rewire(u, id, other.id)
      merged.set(id, other.id)
      scope?.add(other.id)
      joined++
      continue
    }
    const mineWalls = u.walls.filter((w) => w.a === id || w.b === id)
    if (!mineWalls.length) continue // a corner of no wall ends nothing
    const near = new Set(mineWalls.map((w) => (w.a === id ? w.b : w.a)))
    // corners this one already reaches along its own short walls (≤ 0.3 m of path): a wall at one of them is joined
    // to it already (a traced jog, a nib inside a junction) — another piece there would only close a sliver
    const hops = new Map<Id, number>([[id, 0]])
    for (const q = [id]; q.length; ) {
      const x = q.shift()!
      for (const w of u.walls) {
        if (w.a !== x && w.b !== x) continue
        const y = w.a === x ? w.b : w.a
        const h = hops.get(x)! + Math.hypot(V.get(y)!.x - V.get(x)!.x, V.get(y)!.y - V.get(x)!.y)
        if (h <= 0.3 && h < (hops.get(y) ?? Infinity)) hops.set(y, h), q.push(y)
      }
    }
    let best: { w: Wall; s: number; d: number; L: number; dir: Pt; end: Id; toEnd: number; free: boolean } | null = null
    for (const w of u.walls) {
      if (w.a === id || w.b === id || (!mine && !touches(w))) continue
      const a = V.get(w.a)!, b = V.get(w.b)!
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L <= EPS) continue
      const dir = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const s = (v.x - a.x) * dir.x + (v.y - a.y) * dir.y
      const d = Math.abs((v.y - a.y) * dir.x - (v.x - a.x) * dir.y)
      const step = Math.min(hops.get(w.a) ?? Infinity, hops.get(w.b) ?? Infinity) <= w.thicknessM + MERGE_M || near.has(w.a) || near.has(w.b)
      if (d > (step ? MERGE_M : w.thicknessM / 2 + MERGE_M) || (best && d >= best.d)) continue
      const end = s < L / 2 ? w.a : w.b
      const toEnd = s < L / 2 ? s : L - s
      if (step && toEnd <= Math.max(MERGE_M, w.thicknessM / 2)) continue // joined already: only a wall folded back over its middle
      const free = !step && degree(u, end) === 1
      // past W's end only by a hair — or within its end block when that end is free to come over
      if (toEnd < -MERGE_M && !(free && toEnd >= -w.thicknessM / 2)) continue
      best = { w, s, d, L, dir, end, toEnd, free }
    }
    if (!best) continue
    const { w, s, dir, end, toEnd, free } = best
    const cap = Math.max(MERGE_M, w.thicknessM / 2)
    const a = V.get(w.a)!
    const Q = { x: a.x + dir.x * s, y: a.y + dir.y * s }
    const dirs = mineWalls.map((x) => dirFrom(u, x, id))
    const along = dirs.some((p) => Math.abs(p.x * dir.y - p.y * dir.x) < Math.sin((10 * Math.PI) / 180))
    const square = dirs.every((p) => Math.abs(p.x * dir.x + p.y * dir.y) < 0.01)
    let at: Id | null = null // the corner v becomes (null: v stays, a hidden piece joins it)
    let J: Id = end // where the hidden piece starts
    if (!along && (square || toEnd > cap)) {
      // onto W's centre line along its own walls: W's free end comes to meet it, else W splits at the projection
      // (a hair from W's corner: a hair-long piece of W, never the corner — that would tilt the walls at v)
      if (toEnd <= cap && free) (u = moveEnd(u, w, end, Q)), (at = end)
      else if (toEnd <= EPS) at = end
      else {
        const r = split(w, s, Math.max(...mineWalls.map((x, i) => x.thicknessM / 2 / Math.max(SIN10, Math.abs(dirs[i].x * dir.y - dirs[i].y * dir.x)))))
        u = { ...r.unit, vertices: r.unit.vertices.map((x) => (x.id === id ? { ...x, x: Q.x, y: Q.y } : x)) }
        u = rewire(u, r.vertexId, id)
        joined++
        continue
      }
    } else if (!along) at = end // oblique walls in W's end block: onto its end corner
    else if (free && toEnd <= cap && (toEnd <= MERGE_M || dirs.some((p) => (p.x * dir.x + p.y * dir.y) * (end === w.b ? 1 : -1) > 0.9)))
      u = moveEnd(u, w, end, Q) // end to end: W's free end comes to the projection (≤ its end block, along its own line), the piece is square
    else if (toEnd > EPS) {
      const r = split(w, s, Math.max(w.thicknessM, ...mineWalls.map((x) => x.thicknessM)) / 2) // the hidden piece's width
      ;(u = r.unit), (J = r.vertexId)
    }
    // (on W's line already: the same corner; a hair off it stays a hair-long piece — merging would tilt the wall along W)
    if (at === null && Math.hypot(vertexById(u.vertices, J).x - v.x, vertexById(u.vertices, J).y - v.y) <= EPS) at = J
    if (at !== null) {
      u = rewire(u, id, at)
      merged.set(id, at)
      scope?.add(at)
    } else {
      // the hidden piece: the thicker wall's thickness, never above the lower of the two (a railing meeting a wall)
      const piece: Wall = { id: newId(), a: J, b: id, thicknessM: Math.max(w.thicknessM, ...mineWalls.map((x) => x.thicknessM)), heightM: Math.min(w.heightM, Math.max(...mineWalls.map((x) => x.heightM))), openings: [] }
      u = { ...u, walls: [...u.walls, piece] }
    }
    joined++
  }
  // crossings: both walls split at the crossing (an opening there trimmed to the other's face), one shared corner
  for (let guard = 0; guard < 1000; guard++) {
    const V = new Map(u.vertices.map((v) => [v.id, v]))
    let hit: { P: Wall; Q: Wall; t: number; s: number; Lp: number; Lq: number; sin: number } | null = null
    for (let i = 0; i < u.walls.length && !hit; i++) {
      const P = u.walls[i]
      const a = V.get(P.a)!, b = V.get(P.b)!
      const Lp = Math.hypot(b.x - a.x, b.y - a.y)
      for (let j = i + 1; j < u.walls.length && !hit; j++) {
        const Q = u.walls[j]
        if ((!touches(P) && !touches(Q)) || [Q.a, Q.b].some((x) => x === P.a || x === P.b)) continue
        const c = V.get(Q.a)!, e = V.get(Q.b)!
        const Lq = Math.hypot(e.x - c.x, e.y - c.y)
        const den = (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x)
        if (Math.abs(den) <= EPS * Lp * Lq) continue // parallel
        const t = ((c.x - a.x) * (e.y - c.y) - (c.y - a.y) * (e.x - c.x)) / den
        const s = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den
        if (t * Lp > MERGE_M && (1 - t) * Lp > MERGE_M && s * Lq > MERGE_M && (1 - s) * Lq > MERGE_M) hit = { P, Q, t, s, Lp, Lq, sin: Math.abs(den) / (Lp * Lq) }
      }
    }
    if (!hit) break
    const r1 = split(hit.P, hit.t * hit.Lp, hit.Q.thicknessM / 2 / hit.sin)
    u = r1.unit
    const r2 = split(hit.Q, hit.s * hit.Lq, hit.P.thicknessM / 2 / hit.sin)
    u = rewire(r2.unit, r2.vertexId, r1.vertexId)
    scope?.add(r1.vertexId)
    joined++
  }
  return { unit: u, merged, joined, trimmed }
}

/**
 * Why `p` lies in no closed room, nearest spot first (for the Room tool's "Is a corner not joined?"): a loose wall end
 * within 0.3 m of another wall ("Wall end 4 cm short of the wall"), two walls crossing without a shared corner, two
 * corners within 5 cm of each other that are not one. [] when `p` is inside a room.
 */
export function openSpotsNear(unit: Unit, rooms: Room[], p: Pt): { at: Pt; why: string }[] {
  if (roomAt(p, rooms, unit)) return []
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  const cm = (m: number) => `${Math.max(1, Math.round(m * 100))} cm`
  const out: { at: Pt; why: string }[] = []
  const segs = unit.walls.flatMap((w) => {
    const a = V.get(w.a), b = V.get(w.b)
    const L = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
    return a && b && L > EPS ? [{ w, a, b, L, dir: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } }] : []
  })
  for (const v of unit.vertices) {
    if (degree(unit, v.id) !== 1) continue
    let gap = Infinity
    for (const { w, a, L, dir } of segs) {
      if (w.a === v.id || w.b === v.id) continue
      const s = (v.x - a.x) * dir.x + (v.y - a.y) * dir.y
      const d = Math.abs((v.y - a.y) * dir.x - (v.x - a.x) * dir.y)
      gap = Math.min(gap, Math.hypot(Math.max(0, -s, s - L), Math.max(0, d - w.thicknessM / 2)))
    }
    if (gap <= 0.3) out.push({ at: { x: v.x, y: v.y }, why: gap > 0.005 ? `Wall end ${cm(gap)} short of the wall` : 'Wall end on a wall but not joined to it (an opening there?)' })
  }
  for (let i = 0; i < segs.length; i++)
    for (let j = i + 1; j < segs.length; j++) {
      const P = segs[i], Q = segs[j]
      if ([Q.w.a, Q.w.b].some((x) => x === P.w.a || x === P.w.b)) continue
      const den = P.dir.x * Q.dir.y - P.dir.y * Q.dir.x
      if (Math.abs(den) < 1e-9) continue
      const t = ((Q.a.x - P.a.x) * Q.dir.y - (Q.a.y - P.a.y) * Q.dir.x) / den
      const s = ((Q.a.x - P.a.x) * P.dir.y - (Q.a.y - P.a.y) * P.dir.x) / den
      if (t > EPS && t < P.L - EPS && s > EPS && s < Q.L - EPS) out.push({ at: { x: P.a.x + P.dir.x * t, y: P.a.y + P.dir.y * t }, why: 'Walls cross without a shared corner' })
    }
  for (let i = 0; i < unit.vertices.length; i++)
    for (let j = i + 1; j < unit.vertices.length; j++) {
      const v = unit.vertices[i], q = unit.vertices[j]
      const d = Math.hypot(q.x - v.x, q.y - v.y)
      if (d <= 0.05 && !unit.walls.some((w) => wallKey(w.a, w.b) === wallKey(v.id, q.id))) out.push({ at: { x: (v.x + q.x) / 2, y: (v.y + q.y) / 2 }, why: `Two corners ${cm(d)} apart, not one corner` })
    }
  return out.sort((m, n) => Math.hypot(m.at.x - p.x, m.at.y - p.y) - Math.hypot(n.at.x - p.x, n.at.y - p.y))
}

/** Unit direction of wall `w` leaving its end `from`. */
function dirFrom(u: Unit, w: Wall, from: Id): Pt {
  const f = wallFrame(w, u.vertices)
  return w.a === from ? f.dir : { x: -f.dir.x, y: -f.dir.y }
}
/** Two directions within ~0.6° of the same line. */
const parallel = (p: Pt, q: Pt): boolean => Math.abs(p.x * q.y - p.y * q.x) < 0.01

/**
 * Corner moves that give wall `wallId` the length `lengthM` by sliding its end `endId` along the wall
 * (the other end is the anchor). Keep-neighbours-straight rule: every OTHER wall at that end that is
 * not collinear with the edited wall moves rigidly with it — together with the straight run it belongs
 * to (walls collinear with it, chained through their shared corners, e.g. a long wall split at
 * T-junctions), all shifted by the same delta. So a rectangle stays a rectangle (the lobby's long wall
 * shifts 10" instead of tilting). A wall collinear with the edited one just stretches. Walls attached
 * to a moved run but not part of it keep their far end: they stretch when parallel to the delta,
 * otherwise tilt as before — nothing cascades further. Openings keep offsets (the drag clamps them).
 */
export function lengthMoves(u: Unit, wallId: Id, endId: Id, lengthM: number): { id: Id; x: number; y: number }[] {
  const w = u.walls.find((x) => x.id === wallId)
  if (!w || (w.a !== endId && w.b !== endId)) return []
  const anchorId = w.a === endId ? w.b : w.a
  const anchor = vertexById(u.vertices, anchorId)
  const end = vertexById(u.vertices, endId)
  const L = Math.hypot(end.x - anchor.x, end.y - anchor.y)
  if (L <= EPS) return []
  const dir = { x: (end.x - anchor.x) / L, y: (end.y - anchor.y) / L }
  const moved = new Set([endId])
  for (const n of u.walls) {
    if (n.id === w.id || (n.a !== endId && n.b !== endId)) continue
    const nd = dirFrom(u, n, endId)
    if (parallel(nd, dir)) continue
    // walk the straight run away from the end
    let at = endId
    let cur: Wall | undefined = n
    while (cur) {
      const next: Id = cur.a === at ? cur.b : cur.a
      if (next === anchorId || moved.has(next)) break
      moved.add(next)
      at = next
      const prev: Wall = cur
      cur = u.walls.find((x) => x.id !== prev.id && (x.a === next || x.b === next) && parallel(dirFrom(u, x, next), nd) && dirFrom(u, x, next).x * nd.x + dirFrom(u, x, next).y * nd.y > 0)
    }
  }
  const dx = dir.x * (lengthM - L)
  const dy = dir.y * (lengthM - L)
  return [...moved].map((id) => {
    const v = vertexById(u.vertices, id)
    return { id, x: v.x + dx, y: v.y + dy }
  })
}

type Frame = ReturnType<typeof wallFrame>
/**
 * Opening `o` of a wall with frame `f` moved onto a wall along the same line (frame `fc`) at the same plan position,
 * clamped inside it; on a reversed wall its hinge and swing are mirrored so the door stays put.
 */
function rebase(o: Opening, f: Frame, fc: Frame): Opening {
  const at = (m: number) => (f.origin.x + f.dir.x * m - fc.origin.x) * fc.dir.x + (f.origin.y + f.dir.y * m - fc.origin.y) * fc.dir.y
  const fit = (m: number) => Math.max(0, Math.min(fc.lengthM - o.widthM, m))
  if (f.dir.x * fc.dir.x + f.dir.y * fc.dir.y > 0) return { ...o, offsetM: fit(at(o.offsetM)) }
  return { ...o, offsetM: fit(at(o.offsetM + o.widthM)), hinge: o.hinge === 'b' ? 'a' : 'b', swing: o.swing === 'out' ? 'in' : 'out' }
}

/** sin 1.5°: two walls through a corner this close to one line, the corner ≤ 2 cm off it, are one wall drawn by hand */
const NEAR = 0.0262

/**
 * A corner (of `ids`) left joining exactly two walls along one line — within 1.5°, the corner ≤ 2 cm off the line
 * through their far ends (founder 2026-10-03: hand fixes without millimetre control left a 179° corner, a wedge in
 * 3D) — goes onto that line; of the same thickness and height the two become one wall (the first keeps its id and
 * direction). Openings keep their plan positions (a door on a reversed piece gets its hinge and swing mirrored).
 * `bentOnly`: a corner already exactly on the line stays (a whole-unit pass: no wedge there, its walls keep their ids).
 */
function healStraight(unit: Unit, ids: Iterable<Id>, bentOnly = false): Unit {
  let u = unit
  for (const id of ids) {
    const at = u.walls.filter((w) => w.a === id || w.b === id)
    if (at.length !== 2) continue
    const [w1, w2] = at
    const d1 = dirFrom(u, w1, id)
    const d2 = dirFrom(u, w2, id)
    if (Math.abs(d1.x * d2.y - d1.y * d2.x) >= NEAR || d1.x * d2.x + d1.y * d2.y > 0) continue
    const far2 = w2.a === id ? w2.b : w2.a
    const c: Wall = { ...w1, a: w1.a === id ? far2 : w1.a, b: w1.b === id ? far2 : w1.b }
    const vs = u.vertices.filter((v) => v.id !== id)
    const fc = wallFrame(c, vs)
    const v = vertexById(u.vertices, id)
    const off = (v.x - fc.origin.x) * fc.normal.x + (v.y - fc.origin.y) * fc.normal.y
    if (Math.abs(off) > 0.02 || fc.lengthM <= EPS || (bentOnly && Math.abs(off) <= EPS)) continue
    const same = w1.thicknessM === w2.thicknessM && w1.heightM === w2.heightM && !w1.standsAlone === !w2.standsAlone
    if (!same || u.walls.some((w) => w.id !== w1.id && w.id !== w2.id && wallKey(w.a, w.b) === wallKey(c.a, c.b))) {
      // two widths (or a merge that would double a wall): only straightened, each keeps its own
      if (Math.abs(off) <= EPS) continue
      const moved = u.vertices.map((x) => (x.id === id ? { ...x, x: v.x - fc.normal.x * off, y: v.y - fc.normal.y * off } : x))
      const old = u.vertices
      u = { ...u, vertices: moved, walls: u.walls.map((w) => (w === w1 || w === w2 ? { ...w, openings: w.openings.map((o) => rebase(o, wallFrame(w, old), wallFrame(w, moved))) } : w)) }
      continue
    }
    const openings = [w1, w2].flatMap((w) => w.openings.map((o) => rebase(o, wallFrame(w, u.vertices), fc)))
    u = { ...u, vertices: vs, walls: u.walls.flatMap((w) => (w.id === w1.id ? [{ ...c, openings }] : w.id === w2.id ? [] : [w])) }
  }
  return u
}

/**
 * A wall drawn over another (founder 2026-10-03: a hand-drawn piece laid over a traced one): two walls of one height
 * along each other (within 5°), the shorter's two ends within half the thinner's thickness of the longer's centre line
 * and inside its end blocks, at least half of it beside the longer — the shorter goes (a tie: the one at `ids`), its
 * openings onto the longer where they fit, its corners with it when nothing else ends there. A low railing beside a
 * full wall is never a duplicate. `ids`: only pairs with a wall at one of these corners; absent = the whole unit.
 * Returns the same unit when nothing went; `corners` = the dropped walls' corners still standing.
 */
function dropOverlaid(unit: Unit, ids?: Id[]): { unit: Unit; dropped: number; corners: Id[] } {
  const at = (w: Wall) => !!ids && (ids.includes(w.a) || ids.includes(w.b))
  let u = unit
  let dropped = 0
  const corners: Id[] = []
  for (let again = true; again; ) {
    again = false
    const F = new Map(u.walls.map((w) => [w.id, wallFrame(w, u.vertices)]))
    pairs: for (const [i, K] of u.walls.entries()) {
      for (const [j, S] of u.walls.entries()) {
        if (i === j || (ids && !at(K) && !at(S)) || Math.abs(K.heightM - S.heightM) > 0.01) continue
        const fk = F.get(K.id)!
        const fs = F.get(S.id)!
        const tie = at(S) === at(K) ? i < j : at(S)
        if (fs.lengthM > fk.lengthM || (fs.lengthM === fk.lengthM && !tie) || Math.abs(fk.dir.x * fs.dir.y - fk.dir.y * fs.dir.x) > 0.087) continue
        const ends = [fs.origin, { x: fs.origin.x + fs.dir.x * fs.lengthM, y: fs.origin.y + fs.dir.y * fs.lengthM }]
        const s = ends.map((p) => (p.x - fk.origin.x) * fk.dir.x + (p.y - fk.origin.y) * fk.dir.y)
        const block = K.thicknessM / 2 + MERGE_M
        const [lo, hi] = [Math.min(...s), Math.max(...s)]
        const beside = ends.every((p) => Math.abs((p.x - fk.origin.x) * fk.normal.x + (p.y - fk.origin.y) * fk.normal.y) <= Math.min(K.thicknessM, S.thicknessM) / 2 + EPS)
        if (!beside || lo < -block || hi > fk.lengthM + block || Math.min(hi, fk.lengthM) - Math.max(lo, 0) < fs.lengthM / 2) continue
        let k = K
        for (const o of S.openings) {
          const p = placeOpening(k, fk.lengthM, rebase(o, fs, fk))
          if (typeof p !== 'string') k = { ...k, openings: [...k.openings, p] }
        }
        const walls = u.walls.flatMap((w) => (w === S ? [] : w === K ? [k] : [w]))
        const used = new Set(walls.flatMap((w) => [w.a, w.b]))
        corners.push(...[S.a, S.b].filter((id) => used.has(id)))
        u = { ...u, walls, vertices: u.vertices.filter((v) => used.has(v.id) || (v.id !== S.a && v.id !== S.b)) }
        dropped++
        again = true
        break pairs
      }
    }
  }
  return { unit: u, dropped, corners }
}

const STUB_TOAST = 'Door wider than its wall — removed; redraw it on the long wall'
/** A wall holds a door with 5 cm to spare and is ≥ 0.6 m; any other opening (a vent, glazing or a passage filling a piece) only has to fit. */
const holds = (o: Opening, lengthM: number): boolean => (o.kind === 'door' ? o.widthM <= lengthM - 0.05 && lengthM >= 0.6 : o.widthM <= lengthM + EPS)

/**
 * A door on a stub (founder 2026-10-03: a wall split / shortened under it left an oversized leaf on a short piece): an
 * opening its wall no longer holds goes onto the wall continuing it straight through either corner — the end it hangs
 * toward first; same plan place, clamped, never over another opening — else it is removed. `ids`: the walls at these
 * corners; absent = all. Returns the same unit when nothing moved; `dropped` = openings removed (the toast).
 */
function fixStubs(unit: Unit, ids?: Iterable<Id>): { unit: Unit; dropped: number } {
  const scope = ids && new Set(ids)
  let u = unit
  let dropped = 0
  for (const w of unit.walls) {
    if (scope && !scope.has(w.a) && !scope.has(w.b)) continue
    const f = wallFrame(w, u.vertices)
    const bad = w.openings.filter((o) => !holds(o, f.lengthM))
    if (!bad.length) continue
    u = { ...u, walls: u.walls.map((x) => (x.id === w.id ? { ...x, openings: x.openings.filter((o) => !bad.includes(o)) } : x)) }
    for (const o of bad) {
      const on = (o.offsetM + o.widthM / 2 > f.lengthM / 2 ? [w.b, w.a] : [w.a, w.b]).flatMap((end) => {
        const d = dirFrom(u, w, end)
        return u.walls.filter((x) => {
          if (x.id === w.id || (x.a !== end && x.b !== end)) return false
          const e = dirFrom(u, x, end)
          return Math.abs(d.x * e.y - d.y * e.x) < NEAR && d.x * e.x + d.y * e.y < 0
        })
      })
      let home: { id: Id; o: Opening } | null = null
      for (const x of on) {
        const fx = wallFrame(x, u.vertices)
        const p = holds(o, fx.lengthM) ? placeOpening(x, fx.lengthM, rebase(o, f, fx)) : ''
        if (typeof p === 'string') continue
        home = { id: x.id, o: p }
        break
      }
      if (!home) dropped++
      else {
        const h = home
        u = { ...u, walls: u.walls.map((x) => (x.id === h.id ? { ...x, openings: [...x.openings, h.o] } : x)) }
      }
    }
  }
  return { unit: u, dropped }
}

/** Below this a wall is a railing / parapet / planter edge (the 1.1 / 0.45 m convention), m. */
const LOW_M = 2
/**
 * A wall carrying an opening is a full-height wall (founder 2026-10-03: a window placed on a 1.1 m railing left Bed 3
 * open to the sky above it in 3D). Returns the same unit when no low wall has one.
 */
export function fullHeightIfOpenings(u: Unit): Unit {
  const low = (w: Wall) => w.openings.length > 0 && w.heightM < LOW_M
  return u.walls.some(low) ? { ...u, walls: u.walls.map((w) => (low(w) ? { ...w, heightM: WALL_HEIGHT_M } : w)) } : u
}

/** sin 10°: a wall closer than this to parallel is met end to end, not crossed */
const SIN10 = 0.1736
const cross = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x
/** how far a loose end of `w` looks ahead for a wall to join */
const reachOf = (w: Wall) => Math.max(0.15, 1.5 * w.thicknessM)

/**
 * What the loose end `id` of wall `w` reaches ahead (founder 2026-10-03: an unjoined wall leaves its room open — no
 * skirting, wrong daylight in 3D), within reachOf(w), looking along its own wall: the first wall whose near face is within
 * reach and whose centre line it crosses on its segment → `to` on that centre line (`inside` when the end is in that
 * wall's body already); another wall's end on its line ahead → that end; a FREE end of a crossing wall within its own
 * reach of where the two lines cross → there, that end coming too (`also`). The nearest wins: never through a wall.
 * `reach`: how far to look instead (the Issues list's "Extend" fix looks further: the founder sees its ghost first).
 */
export function ahead(u: Unit, id: Id, w: Wall, reach = reachOf(w)): { r: number; to: Pt; also?: { w: Wall; end: Id }; inside?: boolean } | null {
  const V = new Map(u.vertices.map((v) => [v.id, v]))
  const v = V.get(id)!
  const far = w.a === id ? w.b : w.a
  const d = dirFrom(u, w, far) // ahead: away from its own wall
  let best: ReturnType<typeof ahead> = null
  for (const x of u.walls) {
    if (x === w) continue
    const f = wallFrame(x, u.vertices)
    const den = cross(d, f.dir)
    const rel = { x: f.origin.x - v.x, y: f.origin.y - v.y }
    const r = Math.abs(den) >= SIN10 ? cross(rel, f.dir) / den : NaN // ahead to x's centre line
    if (r > EPS && (!best || r < best.r)) {
      const s = cross(rel, d) / den
      const face = r - x.thicknessM / 2 / Math.abs(den)
      if (s >= -EPS && s <= f.lengthM + EPS && face <= reach) best = { r, to: { x: v.x + d.x * r, y: v.y + d.y * r }, inside: face <= 0 }
    }
    for (const end of [x.a, x.b]) {
      if (end === far) continue
      const q = V.get(end)!
      const free = degree(u, end) === 1 && r > EPS
      // a free end comes to where the lines cross (beyond it, within its own reach); any other only when on this line
      const to = free ? { x: v.x + d.x * r, y: v.y + d.y * r } : q
      const out = dirFrom(u, x, end === x.a ? x.b : x.a)
      if (free ? (to.x - q.x) * out.x + (to.y - q.y) * out.y <= EPS || Math.hypot(to.x - q.x, to.y - q.y) > reachOf(x) : Math.abs(cross({ x: q.x - v.x, y: q.y - v.y }, d)) > MERGE_M) continue
      const rq = (to.x - v.x) * d.x + (to.y - v.y) * d.y
      if (rq > EPS && rq <= reach && (!best || rq < best.r)) best = { r: rq, to, ...(free ? { also: { w: x, end } } : {}) }
    }
  }
  return best
}

/**
 * Loose ends short of a wall slide along their own lines to what they reach (ahead); joinOverlaps then T-splits / makes
 * the L (an opening on the split point is trimmed there). Nothing tilts; an end already inside a wall's body is
 * joinOverlaps' own. `ids`: only these corners; absent = every loose end. Returns the same unit when nothing moved;
 * `moved` = the corners that slid.
 */
function reachEnds(unit: Unit, ids?: Id[]): { unit: Unit; moved: Id[] } {
  let u = unit
  const moved: Id[] = []
  for (const id of ids ?? unit.vertices.map((v) => v.id)) {
    const mine = u.walls.filter((w) => w.a === id || w.b === id)
    // a kept free end (standsAlone) stays put on a whole-unit pass (load / Join walls); dragged, it still joins
    const best = mine.length === 1 && !(mine[0].standsAlone && !ids) ? ahead(u, id, mine[0]) : null
    if (!best || best.inside) continue
    u = moveEnd(u, mine[0], id, best.to)
    moved.push(id)
    if (best.also) (u = moveEnd(u, best.also.w, best.also.end, best.to)), moved.push(best.also.end)
  }
  return { unit: moved.length ? u : unit, moved }
}

/** a nib longer than this is a wall someone meant, m */
const STUB_M = 0.35
/**
 * Junk stubs (founder 2026-10-03; Join walls / load / auto-trace only): a wall with one free end and no opening, off a
 * corner where ≥ 2 other walls meet (no new loose end), that lies inside a pillar's block, or is ≤ STUB_M long with
 * nothing ahead within its reach — removed with its free corner. A low wall ≥ STUB_M stays. (A wall with a free end never
 * bounds a room.) Returns the same unit when none went.
 */
function dropStubs(unit: Unit): { unit: Unit; dropped: number } {
  let u = unit
  let dropped = 0
  for (const { id } of unit.walls) {
    const w = u.walls.find((x) => x.id === id)!
    const free = [w.a, w.b].filter((v) => degree(u, v) === 1)
    if (w.standsAlone || w.openings.length || free.length !== 1 || degree(u, free[0] === w.a ? w.b : w.a) < 3) continue
    const L = wallLen(u, w)
    const ends = [vertexById(u.vertices, w.a), vertexById(u.vertices, w.b)]
    const inPillar = (u.pillars ?? []).some((p) => ends.every((q) => Math.abs(q.x - p.x) <= p.wM / 2 + MERGE_M && Math.abs(q.y - p.y) <= p.hM / 2 + MERGE_M))
    if ((w.heightM < LOW_M && L >= STUB_M) || !(inPillar || (L <= STUB_M && !ahead(u, free[0], w)))) continue
    u = { ...u, walls: u.walls.filter((x) => x !== w), vertices: u.vertices.filter((v) => v.id !== free[0]) }
    dropped++
  }
  return { unit: u, dropped }
}

/**
 * After a drop / nudge / new wall / Join walls (founder 2026-10-03, hand-fix precision): a wall drawn over another goes
 * (dropOverlaid), with `reach` a loose end short of a wall slides onto it (reachEnds: the whole unit and drag-end),
 * overlaps join (joinOverlaps; an opening on the split point trimmed), on the whole unit junk stubs go (dropStubs), a
 * corner left between two walls on one line heals into one wall (healStraight), a door left on a stub moves to the long
 * wall or goes (fixStubs), a low wall with an opening is full height. `ids` = the corners that moved — healed / checked:
 * they, what they merged into, the dropped walls' corners and the far ends of their walls; absent = the whole unit,
 * where only bent corners heal. Returns the same unit when nothing changed; `notes` = the toasts (the whole unit's
 * trimmed count rides on the join toast).
 */
function settle(unit: Unit, ids?: Id[], reach = !ids): { unit: Unit; merged: Map<Id, Id>; joined: number; trimmed: number; notes: string[] } {
  const o = dropOverlaid(unit, ids)
  const e = reach ? reachEnds(o.unit, ids) : { unit: o.unit, moved: [] as Id[] }
  const j = joinOverlaps(e.unit, ids && [...ids, ...e.moved])
  const s = ids ? { unit: j.unit, dropped: 0 } : dropStubs(j.unit)
  const near = ids && new Set([...ids, ...e.moved, ...o.corners].map((id) => j.merged.get(id) ?? id))
  const touched = near ? new Set(s.unit.walls.filter((w) => near.has(w.a) || near.has(w.b)).flatMap((w) => [w.a, w.b])) : s.unit.vertices.map((v) => v.id)
  const t = fixStubs(healStraight(s.unit, touched, !ids), near && touched)
  const notes = [
    ...(o.dropped ? ['Removed a wall drawn over another'] : []),
    ...(ids && j.trimmed ? [`${j.trimmed} opening${j.trimmed === 1 ? '' : 's'} trimmed to the wall joined there`] : []),
    ...(s.dropped ? [`Removed ${s.dropped} stub${s.dropped === 1 ? '' : 's'} (short wall ends sticking out)`] : []),
    ...(t.dropped ? [STUB_TOAST] : []),
  ]
  return { unit: fullHeightIfOpenings(t.unit), merged: j.merged, joined: j.joined, trimmed: j.trimmed, notes }
}
const wallLen = (u: Unit, w: Wall): number => wallFrame(w, u.vertices).lengthM
const degree = (u: Unit, id: Id): number => u.walls.filter((w) => w.a === id || w.b === id).length

export function findOpening(u: Unit, id: Id): { wall: Wall; opening: Opening } | null {
  for (const wall of u.walls) {
    const opening = wall.openings.find((o) => o.id === id)
    if (opening) return { wall, opening }
  }
  return null
}

export type Entity =
  | { kind: 'vertex'; v: Vertex }
  | { kind: 'wall'; w: Wall }
  | { kind: 'opening'; o: Opening; w: Wall }
  | { kind: 'label'; l: RoomLabel }
  | { kind: 'pillar'; p: Pillar }

export function findEntity(u: Unit, id: Id): Entity | null {
  const v = u.vertices.find((x) => x.id === id)
  if (v) return { kind: 'vertex', v }
  const w = u.walls.find((x) => x.id === id)
  if (w) return { kind: 'wall', w }
  const o = findOpening(u, id)
  if (o) return { kind: 'opening', o: o.opening, w: o.wall }
  const l = u.roomLabels.find((x) => x.id === id)
  if (l) return { kind: 'label', l }
  const p = u.pillars?.find((x) => x.id === id)
  if (p) return { kind: 'pillar', p }
  return null
}

/** Selected ids still in `u`: graph entities, or pieces of its furniture layer (preset ids are deterministic). */
function stillThere(u: Unit, ids: Id[]): Id[] {
  let pieces: Set<Id> | undefined
  return ids.filter((id) => findEntity(u, id) || (pieces ??= new Set(layoutFor(u, deriveRooms(u)).map((p) => p.id))).has(id))
}

/** Plan points that stand for an entity (for pan-to / bounds). */
export function entityPoints(u: Unit, id: Id): Pt[] {
  const e = findEntity(u, id)
  if (!e) return []
  if (e.kind === 'vertex') return [e.v]
  if (e.kind === 'label') return [e.l]
  if (e.kind === 'pillar') return [e.p]
  const w = e.kind === 'wall' ? e.w : e.w
  const f = wallFrame(w, u.vertices)
  if (e.kind === 'wall') return [f.origin, { x: f.origin.x + f.dir.x * f.lengthM, y: f.origin.y + f.dir.y * f.lengthM }]
  const c = e.o.offsetM + e.o.widthM / 2
  return [{ x: f.origin.x + f.dir.x * c, y: f.origin.y + f.dir.y * c }]
}

/** Split `wall` at parameter t. Fails when an opening straddles the split point. */
function splitWall(unit: Unit, wall: Wall, t: number): { unit: Unit; vertexId: Id } | string {
  const { origin, dir, lengthM } = wallFrame(wall, unit.vertices)
  const u = t * lengthM
  if (wall.openings.some((o) => o.offsetM < u - EPS && o.offsetM + o.widthM > u + EPS)) {
    return 'An opening sits on that spot — move it first'
  }
  const v: Vertex = { id: newId(), x: origin.x + dir.x * u, y: origin.y + dir.y * u }
  const w1: Wall = { ...wall, b: v.id, openings: wall.openings.filter((o) => o.offsetM + o.widthM <= u + EPS) }
  const w2: Wall = {
    ...wall,
    id: newId(),
    a: v.id,
    openings: wall.openings.filter((o) => o.offsetM >= u - EPS).map((o) => ({ ...o, offsetM: o.offsetM - u })),
  }
  const walls = unit.walls.flatMap((w) => (w.id === wall.id ? [w1, w2] : [w]))
  return { unit: { ...unit, vertices: [...unit.vertices, v], walls }, vertexId: v.id }
}

/** Resolve a plan point to a vertex id: an existing vertex within tol, a split of a wall within tol, or a new vertex. */
function resolveTarget(unit: Unit, at: Target): { unit: Unit; id: Id; existing: boolean } | string {
  const near = unit.vertices.find((v) => Math.hypot(v.x - at.x, v.y - at.y) <= at.tolM)
  if (near) return { unit, id: near.id, existing: true }
  const nw = nearestWall(at, unit)
  if (nw && nw.distanceM <= at.tolM) {
    const len = wallLen(unit, nw.wall)
    if (nw.t * len > at.tolM && (1 - nw.t) * len > at.tolM) {
      const r = splitWall(unit, nw.wall, nw.t)
      if (typeof r === 'string') return r
      return { unit: r.unit, id: r.vertexId, existing: true }
    }
  }
  const v: Vertex = { id: newId(), x: at.x, y: at.y }
  return { unit: { ...unit, vertices: [...unit.vertices, v] }, id: v.id, existing: false }
}

/** Add wall a→b, split at any vertex it passes through. Refuses zero-length and duplicates. */
function addWall(unit: Unit, aId: Id, bId: Id, thicknessM: number, tolM: number, heightM = WALL_HEIGHT_M): Unit | string {
  if (aId === bId) return 'Wall has no length'
  const a = vertexById(unit.vertices, aId)
  const b = vertexById(unit.vertices, bId)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len <= EPS) return 'Wall has no length'
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const through = unit.vertices
    .filter((v) => v.id !== aId && v.id !== bId)
    .map((v) => ({ v, u: (v.x - a.x) * ux + (v.y - a.y) * uy, d: Math.abs(-(v.x - a.x) * uy + (v.y - a.y) * ux) }))
    .filter((p) => p.d <= tolM && p.u > tolM && p.u < len - tolM)
    .sort((p, q) => p.u - q.u)
  const ids = [aId, ...through.map((p) => p.v.id), bId]
  const walls = [...unit.walls]
  for (let i = 0; i + 1 < ids.length; i++) {
    const key = wallKey(ids[i], ids[i + 1])
    if (walls.some((w) => wallKey(w.a, w.b) === key)) return 'That wall already exists'
    walls.push({ id: newId(), a: ids[i], b: ids[i + 1], thicknessM, heightM, openings: [] })
  }
  return { ...unit, walls }
}

export function openingDefaults(kind: OpeningKind, bath: boolean): Pick<Opening, 'widthM' | 'heightM' | 'sillM'> {
  if (kind === 'window') return { widthM: 4 * FT, heightM: 4 * FT, sillM: 3 * FT }
  if (kind === 'passage') return { widthM: 4 * FT, heightM: 2.7, sillM: 0 } // the hand-authored passages' head (lintel below a 3 m slab)
  if (kind === 'slider') return { widthM: 6 * FT, heightM: 7 * FT, sillM: 0 }
  return { widthM: (bath ? 2.5 : 3) * FT, heightM: 7 * FT, sillM: 0 }
}

/** Clamp an opening inside its wall; refuse overlaps with siblings. */
function placeOpening(wall: Wall, lengthM: number, o: Opening): Opening | string {
  if (o.widthM > lengthM + EPS) return 'Opening is wider than the wall'
  const offsetM = Math.max(0, Math.min(lengthM - o.widthM, o.offsetM))
  const placed = { ...o, offsetM }
  const overlaps = wall.openings.some(
    (x) => x.id !== o.id && x.offsetM < placed.offsetM + placed.widthM - EPS && placed.offsetM < x.offsetM + x.widthM - EPS,
  )
  if (overlaps) return 'Two openings overlap on this wall'
  return placed
}

const replaceOpening = (u: Unit, wallId: Id, o: Opening): Unit => ({
  ...u,
  walls: u.walls.map((w) => (w.id === wallId ? { ...w, openings: w.openings.map((x) => (x.id === o.id ? o : x)) } : w)),
})

const bordersBath = (rooms: Room[], wallId: Id): boolean => rooms.some((r) => r.kind === 'bath' && r.wallIds.includes(wallId))

/** The O tool's smallest opening (a resize stops here). */
export const MIN_OPENING_M = 0.3

/** The opening a click at `t` on `wall` creates; the O tool's ghost draws the same. `error` = the click is refused. No widthM = the kind's default. */
export function openingAt(
  u: Unit,
  wall: Wall,
  t: number,
  kind: OpeningKind,
  tolM: number,
  rooms: Room[],
  widthM?: number,
): { opening: Opening; snapped: OpeningSnap; error: string | null } {
  const len = wallLen(u, wall)
  const d = { ...openingDefaults(kind, kind === 'door' && bordersBath(rooms, wall.id)), ...(widthM !== undefined && { widthM }) }
  const { offsetM, snapped } = snapOpeningOffset(wall, len, t * len, d.widthM, tolM)
  const opening: Opening = { id: newId(), kind, ...d, offsetM, hinge: 'a', swing: 'in' }
  if (wall.heightM <= KERB_M) return { opening, snapped, error: wall.heightM === 0 ? 'A zone line takes no doors or windows (it is not a wall)' : 'A kerb takes no doors or windows — leave a gap in it instead' }
  const placed = placeOpening(wall, len, opening)
  return typeof placed === 'string' ? { opening, snapped, error: placed } : { opening: placed, snapped, error: null }
}

// ---------- reducer ----------

function commit(s: StudioState, unit: Unit, extra: Partial<StudioState> = {}): StudioState {
  return {
    ...s,
    ...extra,
    unit,
    history: { past: [...s.history.past.slice(-(HISTORY_CAP - 1)), s.unit], future: [] },
  }
}
const withToast = (s: StudioState, text: string): StudioState => ({ ...s, toast: { text, key: (s.toast?.key ?? 0) + 1 } })
const noted = (s: StudioState, notes: string[]): StudioState => (notes.length ? withToast(s, notes.join(' · ')) : s)
/** a wall of type `wall` (`heightM` instead of the type's own) from one `thicknessM` wide: a zone line is ZONE_LINE_M thin, a wall out of one a partition again */
const chainType = (thicknessM: number, wall: WallType, heightM?: number): { thicknessM: number; heightM: number } =>
  wall === 'zone' ? { thicknessM: ZONE_LINE_M, heightM: 0 } : { thicknessM: thicknessM <= ZONE_LINE_M + EPS ? PARTITION_M : thicknessM, heightM: heightM ?? WALL_TYPES[wall].heightM }
const joinedToast = (n: number, trimmed = 0) =>
  `Joined ${n} overlapping / crossing wall${n === 1 ? '' : 's'}${trimmed ? ` (${trimmed} opening${trimmed === 1 ? '' : 's'} trimmed)` : ''} — Ctrl+Z undoes`

function chainAdd(s: StudioState, at: Target): StudioState {
  if (!s.chain) return s
  const r = resolveTarget(s.unit, at)
  if (typeof r === 'string') return withToast(s, r)
  const last = s.chain.ids[s.chain.ids.length - 1]
  if (r.id === last) return s
  const u = addWall(r.unit, last, r.id, s.chain.thicknessM, at.tolM, s.chain.heightM)
  if (typeof u === 'string') return withToast(s, u)
  // overlap = joined: an end inside another wall's body ends there, a crossed wall is split; a straight run heals (settle)
  const j = settle(u, [last, r.id])
  const all = [...s.chain.ids, r.id].map((id) => j.merged.get(id) ?? id)
  const closes = all[all.length - 1] === all[0]
  const ids = all.filter((id) => j.unit.vertices.some((v) => v.id === id)) // a healed corner is no chain corner any more
  const end = ids[ids.length - 1]
  const stop = r.existing || closes || !end || degree(j.unit, end) > 1
  const next = noted(commit(s, j.unit, { chain: stop ? null : { ...s.chain, ids }, selection: [] }), j.notes)
  return closes && !s.loopTipShown ? { ...withToast(next, 'Drag any corner with V to adjust it'), loopTipShown: true } : next
}

export function reducer(s: StudioState, a: Action): StudioState {
  switch (a.type) {
    case 'set-tool': {
      // pieces and graph entities are never selected together
      const selection = (a.tool === 'furniture') === (s.tool === 'furniture') ? s.selection : []
      return { ...s, tool: a.tool, chain: a.tool === 'wall' ? s.chain : null, selection }
    }
    case 'set-view':
      return { ...s, view: a.view }
    case 'set-plan-image': {
      const planImage = s.unit.planImage && a.image ? { ...s.unit.planImage, src: a.image.name } : s.unit.planImage
      return { ...s, planImage: a.image, unit: { ...s.unit, planImage } }
    }
    case 'set-scale':
      // originPx stays put: re-scaling only changes the image mapping (spec §2.2 step 2)
      return commit(s, {
        ...s.unit,
        planImage: { src: s.planImage?.name ?? s.unit.planImage?.src ?? '', pxPerM: a.pxPerM, originPx: s.unit.planImage?.originPx ?? { x: 0, y: 0 } },
      })
    case 'set-meta':
      return { ...s, unit: { ...s.unit, ...a.patch } }
    case 'select':
      return { ...s, selection: a.add ? [...new Set([...s.selection, ...a.ids])] : a.ids }

    case 'chain-start': {
      const r = resolveTarget(s.unit, a.at)
      if (typeof r === 'string') return withToast(s, r)
      const wall = a.wall ?? s.wallType ?? 'wall'
      const chain = { ids: [r.id], ...chainType(s.chain?.thicknessM ?? PARTITION_M, wall, wall === 'low' ? s.lowWallM : undefined) }
      return r.unit === s.unit ? { ...s, chain, selection: [] } : commit(s, r.unit, { chain, selection: [] })
    }
    case 'pick-wall': {
      const lowWallM = a.lowWallM ?? s.lowWallM
      return { ...s, wallType: a.wall, lowWallM, chain: s.chain && { ...s.chain, ...chainType(s.chain.thicknessM, a.wall, a.wall === 'low' ? lowWallM : undefined) } }
    }
    case 'set-wall-type': {
      const ids = new Set(a.ids)
      const walls = s.unit.walls.filter((w) => ids.has(w.id))
      if (!walls.length) return s
      if (a.wall === 'zone' && walls.some((w) => w.openings.length)) return withToast(s, 'Remove its doors / windows first: a zone line carries none')
      const t = (w: Wall) => chainType(w.thicknessM, a.wall, a.heightM)
      return commit(s, { ...s.unit, walls: s.unit.walls.map((w) => (ids.has(w.id) ? { ...w, ...t(w) } : w)) })
    }
    case 'stand-alone': {
      const ids = new Set(a.ids)
      if (!s.unit.walls.some((w) => ids.has(w.id) && !w.standsAlone === a.on)) return s
      const walls = s.unit.walls.map((w) => {
        if (!ids.has(w.id)) return w
        const { standsAlone: _, ...rest } = w
        return a.on ? { ...rest, standsAlone: true as const } : rest
      })
      return commit(s, { ...s.unit, walls })
    }
    case 'add-pillar': {
      const p: Pillar = { id: newId(), x: a.x, y: a.y, wM: Math.max(MIN_PILLAR_M, a.wM), hM: Math.max(MIN_PILLAR_M, a.hM) }
      return commit(s, { ...s.unit, pillars: [...(s.unit.pillars ?? []), p] }, { selection: [p.id] })
    }
    case 'set-pillar': {
      const p = s.unit.pillars?.find((x) => x.id === a.id)
      if (!p) return s
      const q = { ...p, ...a.patch, id: p.id }
      q.wM = Math.max(MIN_PILLAR_M, q.wM)
      q.hM = Math.max(MIN_PILLAR_M, q.hM)
      const unit = { ...s.unit, pillars: s.unit.pillars!.map((x) => (x.id === p.id ? q : x)) }
      return a.live ? { ...s, unit } : commit(s, unit)
    }
    case 'aim-ramp':
      return { ...s, unit: { ...s.unit, roomLabels: s.unit.roomLabels.map((l) => (l.id === a.id && l.slope ? { ...l, slope: { ...l.slope, dirDeg: a.dirDeg } } : l)) } }
    case 'chain-add':
      return chainAdd(s, a.at)
    case 'chain-typed': {
      if (!s.chain || a.lengthM <= 0 || a.lengthM > 100) return s
      const last = vertexById(s.unit.vertices, s.chain.ids[s.chain.ids.length - 1])
      const rad = (a.dirDeg * Math.PI) / 180
      return chainAdd(s, { x: last.x + Math.cos(rad) * a.lengthM, y: last.y + Math.sin(rad) * a.lengthM, tolM: a.tolM })
    }
    case 'chain-back': {
      if (!s.chain) return s
      const ids = s.chain.ids
      const lastId = ids[ids.length - 1]
      if (ids.length === 1) {
        const u = degree(s.unit, lastId) ? s.unit : { ...s.unit, vertices: s.unit.vertices.filter((v) => v.id !== lastId) }
        return u === s.unit ? { ...s, chain: null } : commit(s, u, { chain: null })
      }
      const prevId = ids[ids.length - 2]
      const walls = s.unit.walls.filter((w) => wallKey(w.a, w.b) !== wallKey(prevId, lastId))
      const u = { ...s.unit, walls }
      const vertices = degree(u, lastId) ? u.vertices : u.vertices.filter((v) => v.id !== lastId)
      return commit(s, { ...u, vertices }, { chain: { ...s.chain, ids: ids.slice(0, -1) } })
    }
    case 'chain-end':
      return { ...s, chain: null }
    case 'toggle-thickness': {
      if (s.chain) {
        const thicknessM = s.chain.thicknessM === PARTITION_M ? EXTERIOR_M : PARTITION_M
        return { ...s, chain: { ...s.chain, thicknessM } }
      }
      const sel = new Set(s.selection)
      if (!s.unit.walls.some((w) => sel.has(w.id))) return s
      const walls = s.unit.walls.map((w) =>
        sel.has(w.id) ? { ...w, thicknessM: w.thicknessM === PARTITION_M ? EXTERIOR_M : PARTITION_M } : w,
      )
      return commit(s, { ...s.unit, walls })
    }

    case 'add-opening': {
      const wall = s.unit.walls.find((w) => w.id === a.wallId)
      if (!wall) return s
      const kind = a.kind ?? s.lastOpeningKind
      const widthM = a.widthM ?? (kind === s.lastOpeningKind ? s.lastOpeningWidthM : undefined)
      const { opening: placed, error } = openingAt(s.unit, wall, a.t, kind, a.tolM ?? 0, deriveRooms(s.unit), widthM)
      if (error) return withToast(s, error)
      const walls = s.unit.walls.map((w) => (w.id === wall.id ? { ...w, openings: [...w.openings, placed] } : w))
      return commit(s, fullHeightIfOpenings({ ...s.unit, walls }), { selection: [placed.id], lastOpeningKind: kind, lastOpeningWidthM: widthM })
    }
    case 'pick-opening':
      return { ...s, lastOpeningKind: a.kind, lastOpeningWidthM: a.widthM === undefined ? undefined : Math.max(MIN_OPENING_M, a.widthM) }
    case 'update-opening': {
      const f = findOpening(s.unit, a.id)
      if (!f) return s
      let next: Opening = { ...f.opening, ...a.patch }
      if (a.patch.kind && a.patch.kind !== f.opening.kind) {
        next = { ...next, ...openingDefaults(a.patch.kind, a.patch.kind === 'door' && bordersBath(deriveRooms(s.unit), f.wall.id)) }
      }
      const placed = placeOpening(f.wall, wallLen(s.unit, f.wall), next)
      if (typeof placed === 'string') return withToast(s, placed)
      return commit(s, replaceOpening(s.unit, f.wall.id, placed)) // editing one never changes the O tool's pick
    }
    case 'drag-opening': {
      const f = findOpening(s.unit, a.id)
      if (!f) return s
      const len = wallLen(s.unit, f.wall)
      const w = f.opening.widthM
      const { offsetM } = snapOpeningOffset(f.wall, len, a.offsetM + w / 2, w, a.tolM ?? 0, a.id)
      const placed = placeOpening(f.wall, len, { ...f.opening, offsetM })
      if (typeof placed === 'string') return { ...s, dragBlocked: true }
      return { ...s, unit: replaceOpening(s.unit, f.wall.id, placed), dragBlocked: false }
    }
    case 'resize-opening': {
      const f = findOpening(s.unit, a.id)
      if (!f) return s
      const o = f.opening
      if (a.end === 'top' || a.end === 'sill') {
        // the head or the sill dragged, the other stays; whole inches; between the floor and the wall's top, 0.3 m at least
        const v = Math.round((a.uM * 12) / FT) * (FT / 12)
        const top = o.sillM + o.heightM
        const sillM = a.end === 'sill' ? Math.min(Math.max(0, v), top - MIN_OPENING_M) : o.sillM
        const heightM = a.end === 'sill' ? top - sillM : Math.min(Math.max(MIN_OPENING_M, v - o.sillM), f.wall.heightM - o.sillM)
        return { ...s, unit: replaceOpening(s.unit, f.wall.id, { ...o, sillM, heightM }), dragBlocked: false }
      }
      const len = wallLen(s.unit, f.wall)
      const far = a.end === 'a' ? o.offsetM + o.widthM : o.offsetM
      // the dragged edge snaps as an opening 0 wide would: flush to a wall end or a neighbour's edge
      const { offsetM: e } = snapOpeningOffset(f.wall, len, a.uM, 0, a.tolM ?? 0, o.id)
      const widthM = Math.max(MIN_OPENING_M, a.end === 'a' ? far - e : e - far)
      const offsetM = a.end === 'a' ? far - widthM : far
      const placed = placeOpening(f.wall, len, { ...o, offsetM, widthM })
      // placeOpening shifting it (no room for the 0.3 m) would move the far end: refused like an overlap
      if (typeof placed === 'string' || Math.abs(placed.offsetM - offsetM) > EPS) return { ...s, dragBlocked: true }
      return { ...s, unit: replaceOpening(s.unit, f.wall.id, placed), dragBlocked: false }
    }
    case 'update-wall': {
      const w0 = s.unit.walls.find((w) => w.id === a.id)
      if (!w0) return s
      if (a.patch.heightM === 0 && w0.openings.length) return withToast(s, 'Remove its doors / windows first: a zone line (height 0) carries none')
      return commit(s, { ...s.unit, walls: s.unit.walls.map((w) => (w.id === a.id ? { ...w, ...a.patch } : w)) })
    }
    case 'set-wall-length': {
      // a is the anchor, b slides; the walls at b stay straight (lengthMoves), openings clamp; a door left on a stub moves / goes
      const wall = s.unit.walls.find((w) => w.id === a.id)
      if (!wall || a.lengthM <= 0 || a.lengthM > 100) return s
      const moves = lengthMoves(s.unit, wall.id, wall.b, a.lengthM)
      const r = fixStubs(reducer(s, { type: 'drag', vertices: moves }).unit, moves.map((m) => m.id))
      return noted(commit(s, r.unit), r.dropped ? [STUB_TOAST] : [])
    }
    case 'detach': {
      // Alt-drag: the wall's end leaves the shared corner for a new corner of its own; drag-begin holds the undo entry
      const v = s.unit.vertices.find((x) => x.id === a.vertexId)
      if (!v || degree(s.unit, v.id) < 2) return s
      const walls = s.unit.walls.map((w) => (w.id === a.wallId ? { ...w, a: w.a === v.id ? a.newId : w.a, b: w.b === v.id ? a.newId : w.b } : w))
      return { ...s, unit: { ...s.unit, vertices: [...s.unit.vertices, { id: a.newId, x: v.x, y: v.y }], walls }, selection: [a.wallId] }
    }
    case 'move-vertex':
      return commit(s, { ...s.unit, vertices: s.unit.vertices.map((v) => (v.id === a.id ? { ...v, x: a.x, y: a.y } : v)) })
    case 'drag-begin':
      return { ...s, history: { past: [...s.history.past.slice(-(HISTORY_CAP - 1)), s.unit], future: [] }, dragBlocked: false }
    case 'drag': {
      const moves = new Map(a.vertices.map((m) => [m.id, m]))
      const vertices = s.unit.vertices.map((v) => {
        const m = moves.get(v.id)
        return m ? { ...v, x: m.x, y: m.y } : v
      })
      // openings keep offsetM, clamped inside the (possibly shorter) wall
      const walls = s.unit.walls.map((w) => {
        if (!moves.has(w.a) && !moves.has(w.b) || !w.openings.length) return w
        const len = wallFrame(w, vertices).lengthM
        return { ...w, openings: w.openings.map((o) => ({ ...o, offsetM: Math.max(0, Math.min(len - o.widthM, o.offsetM)) })) }
      })
      return { ...s, unit: { ...s.unit, vertices, walls } }
    }
    case 'drag-end': {
      // drag-begin already put the pre-drag unit in history; only the join (settle) is applied here
      const r = settle(s.unit, a.ids, true)
      const t = noted(s, r.notes)
      if (r.unit === s.unit) return t
      return { ...t, unit: r.unit, selection: stillThere(r.unit, s.selection.map((id) => r.merged.get(id) ?? id)) }
    }
    case 'drag-label':
      return { ...s, unit: { ...s.unit, roomLabels: s.unit.roomLabels.map((l) => (l.id === a.id ? { ...l, x: a.x, y: a.y } : l)) } }
    case 'nudge': {
      if (!s.selection.length) return s
      const sel = new Set(s.selection)
      const moved = new Set([...s.selection, ...s.unit.walls.filter((w) => sel.has(w.id)).flatMap((w) => [w.a, w.b])])
      const vertices = s.unit.vertices.filter((v) => moved.has(v.id)).map((v) => ({ id: v.id, x: v.x + a.dx, y: v.y + a.dy }))
      let u = reducer(s, { type: 'drag', vertices }).unit // walls follow, their openings clamp
      u = { ...u, roomLabels: u.roomLabels.map((l) => (sel.has(l.id) ? { ...l, x: l.x + a.dx, y: l.y + a.dy } : l)) }
      if (u.pillars?.some((p) => sel.has(p.id))) u = { ...u, pillars: u.pillars.map((p) => (sel.has(p.id) ? { ...p, x: p.x + a.dx, y: p.y + a.dy } : p)) }
      for (const id of s.selection) {
        const f = findOpening(u, id)
        if (!f) continue
        const placed = placeOpening(f.wall, wallLen(u, f.wall), { ...f.opening, offsetM: f.opening.offsetM + a.dx + a.dy })
        if (typeof placed === 'string') return withToast(s, placed)
        u = replaceOpening(u, f.wall.id, placed)
      }
      const r = settle(u, [...moved])
      return noted(commit(s, r.unit, r.unit !== u ? { selection: stillThere(r.unit, s.selection.map((id) => r.merged.get(id) ?? id)) } : {}), r.notes)
    }

    case 'join-walls': {
      const r = settle(s.unit)
      const notes = [...(r.joined ? [joinedToast(r.joined, r.trimmed)] : []), ...r.notes]
      if (r.unit === s.unit) return noted(s, notes)
      return noted(commit(s, r.unit, { selection: stillThere(r.unit, s.selection.map((id) => r.merged.get(id) ?? id)), chain: null }), notes)
    }

    case 'delete': {
      const ids = new Set(a.ids ?? s.selection)
      if (!ids.size) return s
      const walls = s.unit.walls
        .filter((w) => !ids.has(w.id) && !ids.has(w.a) && !ids.has(w.b))
        .map((w) => ({ ...w, openings: w.openings.filter((o) => !ids.has(o.id)) }))
      // corners joined to nothing go; a corner left between two collinear walls joins them into one
      const used = new Set(walls.flatMap((w) => [w.a, w.b]))
      const vertices = s.unit.vertices.filter((v) => !ids.has(v.id) && used.has(v.id))
      const roomLabels = s.unit.roomLabels.filter((l) => !ids.has(l.id))
      const touched = s.unit.walls.filter((w) => !walls.some((x) => x.id === w.id)).flatMap((w) => [w.a, w.b])
      const pillars = s.unit.pillars?.some((p) => ids.has(p.id)) ? { pillars: s.unit.pillars.filter((p) => !ids.has(p.id)) } : {}
      return commit(s, healStraight({ ...s.unit, walls, vertices, roomLabels, ...pillars }, touched), { selection: [], chain: null })
    }

    case 'add-label': {
      const label: RoomLabel = { id: newId(), ...a.label }
      return commit(s, { ...s.unit, roomLabels: [...s.unit.roomLabels, label] }, { selection: [label.id] })
    }
    case 'update-label': {
      // a field cleared (no level, no ramp, no printed size) leaves the label, not an `undefined` in it
      const set = (l: RoomLabel): RoomLabel => {
        const n = { ...l, ...a.patch }
        for (const k of ['levelM', 'slope', 'printedSize'] as const) if (n[k] === undefined) delete n[k]
        return n
      }
      const roomLabels = s.unit.roomLabels.map((l) => (l.id === a.id ? set(l) : l))
      // another kind: a room still holding only its presets gets the new kind's (furniture.forgetPresets)
      const relabel = a.patch.kind && a.patch.kind !== s.unit.roomLabels.find((l) => l.id === a.id)?.kind
      return commit(s, { ...s.unit, roomLabels, ...(relabel ? { furniture: forgetPresets(s.unit, deriveRooms(s.unit), a.id) } : {}) })
    }
    case 'duplicate': {
      const sel = new Set(s.selection)
      const labels = s.unit.roomLabels.filter((l) => sel.has(l.id)).map((l) => ({ ...l, id: newId(), x: l.x + 0.5, y: l.y + 0.5 }))
      const walls = s.unit.walls.filter((w) => sel.has(w.id))
      if (!labels.length && !walls.length) return s
      // one offset for all the copied walls (the first one's normal), so a copied corner stays a corner
      const n = walls.length ? wallFrame(walls[0], s.unit.vertices).normal : { x: 0, y: 0 }
      const corner = new Map<Id, Vertex>()
      for (const id of new Set(walls.flatMap((w) => [w.a, w.b]))) {
        const v = vertexById(s.unit.vertices, id)
        corner.set(id, { id: newId(), x: v.x + n.x * FT, y: v.y + n.y * FT })
      }
      const copies = walls.map((w) => ({ ...w, id: newId(), a: corner.get(w.a)!.id, b: corner.get(w.b)!.id, openings: w.openings.map((o) => ({ ...o, id: newId() })) }))
      return commit(
        s,
        { ...s.unit, vertices: [...s.unit.vertices, ...corner.values()], walls: [...s.unit.walls, ...copies], roomLabels: [...s.unit.roomLabels, ...labels] },
        { selection: [...copies, ...labels].map((c) => c.id) },
      )
    }
    case 'flip': {
      const sel = new Set(s.selection)
      let changed = false
      const walls = s.unit.walls.map((w) => ({
        ...w,
        openings: w.openings.map((o): Opening => {
          if (!sel.has(o.id) || o.kind !== 'door') return o // only a door has a hinge and a swing
          changed = true
          return a.what === 'hinge' ? { ...o, hinge: o.hinge === 'b' ? 'a' : 'b' } : { ...o, swing: o.swing === 'out' ? 'in' : 'out' }
        }),
      }))
      return changed ? commit(s, { ...s.unit, walls }) : s
    }

    case 'move-piece':
    case 'rotate-piece':
    case 'resize-piece': {
      const rooms = deriveRooms(s.unit)
      const pieces = layoutFor(s.unit, rooms)
      const p = pieces.find((x) => x.id === a.id)
      if (!p) return s
      const r =
        a.type === 'resize-piece'
          ? resizePiece(s.unit, rooms, pieces, p.id, a.sizeM)
          : a.type === 'rotate-piece'
            ? movePiece(s.unit, rooms, pieces, p.id, p, p.rotationDeg + 90, false)
            : movePiece(s.unit, rooms, pieces, p.id, { x: a.x, y: a.y }, a.rotationDeg ?? p.rotationDeg)
      if (!r) return s
      if (r.error) return withToast(s, r.error)
      const q = r.piece
      if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-9 && q.rotationDeg === p.rotationDeg && JSON.stringify(q.sizeM) === JSON.stringify(p.sizeM)) return s
      // the first move writes the whole preset layout: that is what Export and Preview 3D then carry
      return commit(s, { ...s.unit, furniture: r.furniture })
    }
    case 'delete-piece': {
      const pieces = layoutFor(s.unit, deriveRooms(s.unit))
      const furniture = deletePiece(pieces, a.id)
      return furniture === pieces ? s : commit(s, { ...s.unit, furniture }, { selection: [] })
    }
    case 'place-piece': {
      const rooms = deriveRooms(s.unit)
      const r = placePiece(s.unit, rooms, layoutFor(s.unit, rooms), a.assetId, a, a.rotationDeg, a.id)
      if (!r) return s
      return r.error ? withToast(s, r.error) : commit(s, { ...s.unit, furniture: r.furniture }, { selection: [a.id] })
    }
    case 'reset-furniture': {
      if (!s.unit.furniture.length) return s
      if (!a.roomId) return commit(s, { ...s.unit, furniture: [] })
      const preset = furnish(s.unit, deriveRooms(s.unit)).filter((p) => p.roomId === a.roomId)
      const ids = new Set(preset.map((p) => p.id)) // a piece moved to another room comes home too
      return commit(s, { ...s.unit, furniture: [...s.unit.furniture.filter((p) => p.roomId !== a.roomId && !ids.has(p.id)), ...preset] })
    }

    case 'undo': {
      const past = s.history.past
      if (!past.length) return s
      const unit = past[past.length - 1]
      return {
        ...s,
        unit,
        history: { past: past.slice(0, -1), future: [s.unit, ...s.history.future] },
        chain: null,
        selection: stillThere(unit, s.selection),
      }
    }
    case 'redo': {
      const future = s.history.future
      if (!future.length) return s
      const unit = future[0]
      return {
        ...s,
        unit,
        history: { past: [...s.history.past, s.unit], future: future.slice(1) },
        chain: null,
        selection: stillThere(unit, s.selection),
      }
    }

    case 'load-unit':
      // overlapping / crossing walls are joined once (join-walls); Ctrl+Z gives the file as it was
      return reducer({ ...initialState(), unit: normalizeUnit(a.unit), planImage: s.planImage, view: s.view, timer: s.timer, tool: 'select' }, { type: 'join-walls' })
    case 'restore': {
      // a draft may be just `{ unit }` (older drafts, hand-injected JSON): every other field is optional
      const init = initialState()
      const d = a.draft as Partial<Draft>
      const restored = {
        ...init,
        unit: normalizeUnit(a.draft.unit),
        planImage: d.planImage ?? null,
        view: d.view ?? init.view,
        timer: { ...init.timer, ...d.timer, lastTickAt: 0 },
      }
      // a draft autosaved before the join rules existed (founder 2026-10-03: the live preview still showed its stubs and
      // loose ends) is joined once here too — a no-op on every later open, Ctrl+Z gives the draft as autosaved
      return reducer(restored, { type: 'join-walls' })
    }
    case 'reset':
      return initialState()

    case 'timer-start':
      return s.timer.started ? s : { ...s, timer: { ...s.timer, started: true, lastInputAt: a.now, lastTickAt: a.now } }
    case 'timer-input':
      // any first input starts the clock (it used to start only from the Scale tool: an auto-traced draft never ran it)
      return { ...s, timer: s.timer.started ? { ...s.timer, lastInputAt: a.now } : { ...s.timer, started: true, lastInputAt: a.now, lastTickAt: a.now } }
    case 'timer-tick': {
      const t = s.timer
      const active = t.started && !t.stopped && !a.hidden && a.now - t.lastInputAt <= IDLE_MS
      const dt = active && t.lastTickAt ? Math.min(a.now - t.lastTickAt, 2000) : 0
      return { ...s, timer: { ...t, elapsedMs: t.elapsedMs + dt, lastTickAt: a.now } }
    }
    case 'exported':
      return { ...s, exported: true, timer: { ...s.timer, stopped: true } }
    case 'toast':
      return withToast(s, a.text)
    case 'clear-toast':
      return { ...s, toast: null }
  }
}

// ---------- studio-only derived data ----------

export const ISSUE_COPY: Record<ValidationIssue['code'], string> = {
  'dangling-vertex': 'Corner is not joined to anything — click to find it',
  'zero-length-wall': 'Wall has no length',
  'duplicate-wall': 'Two walls lie on top of each other',
  'opening-out-of-bounds': 'Opening runs past the end of its wall',
  'openings-overlap': 'Two openings overlap on this wall',
  'unlabelled-room': 'Room has no name',
  'label-outside-any-room': 'Label is not inside a closed room',
  'walls-intersect': 'Walls cross — end one wall on the other instead',
  'island-in-room': 'Walls stand inside a room joined to nothing (its floor runs under them) — join them with a zone line',
}

export interface StudioIssue {
  level: 'error' | 'warning'
  code: ValidationIssue['code'] | 'scale-not-set' | 'no-rooms' | 'no-entry-door'
  message: string
  ids: Id[]
}

export function studioIssues(unit: Unit, rooms: Room[]): StudioIssue[] {
  const out: StudioIssue[] = []
  if (!unit.planImage) {
    out.push({ level: unit.walls.length ? 'warning' : 'error', code: 'scale-not-set', message: 'Scale is not set (S)', ids: [] })
  }
  for (const i of validate(unit)) out.push({ ...i, message: ISSUE_COPY[i.code] })
  if (unit.walls.length && !rooms.length) out.push({ level: 'warning', code: 'no-rooms', message: 'No closed rooms yet', ids: [] })
  if (rooms.length) {
    const count = new Map<Id, number>()
    for (const r of rooms) for (const id of r.wallIds) count.set(id, (count.get(id) ?? 0) + 1)
    // a traced lobby is still outside; so is a zone (a lobby's door onto its lawn is a level's entry)
    const outer = unit.walls.filter((w) => (count.get(w.id) ?? 0) < 2 || rooms.some((r) => (r.kind === 'other' || isOutdoor(r.kind)) && r.wallIds.includes(w.id)))
    if (!outer.some((w) => w.openings.some((o) => o.kind === 'door'))) {
      out.push({ level: 'warning', code: 'no-entry-door', message: 'No entry door on an outer wall', ids: [] })
    }
  }
  return out
}

export function guessKind(name: string): RoomKind {
  const n = name.toLowerCase()
  const has = (...ws: string[]) => ws.some((w) => n.includes(w))
  if (/^\s*(p-?)?\d+\s*$/.test(n) || has('parking', 'car park')) return 'parking' // a bay's number: "1", "12", "P-3"
  if (has('pool', 'water body', 'swimming')) return 'pool'
  if (has('planter')) return 'planter'
  if (has('lawn', 'garden')) return 'lawn'
  if (has('driveway', 'drive way', 'ramp')) return 'driveway'
  if (has('paver', 'paving', 'paved')) return 'paving'
  if (has('deck')) return 'deck'
  if (has('play')) return 'play'
  if (has('gym')) return 'gym'
  if (has('community')) return 'community'
  if (has('guard', 'security')) return 'guard'
  if (has('reception') || (has('lobby') && !has('lift'))) return 'lobby' // a lift lobby stays 'other' (a flat's way in)
  if (has('bed')) return 'bed'
  if (has('bath', 'toilet', 'pdr', 'wc')) return 'bath'
  if (has('veranda', 'balcony')) return 'balcony'
  if (has('kitchen')) return 'kitchen'
  if (has('dining')) return 'dining'
  if (has('living', 'family', 'drawing')) return 'living'
  if (has('study')) return 'study'
  if (has('closet', 'walk in', 'walk-in')) return 'closet'
  if (has('shaft', 'aod', 'duct')) return 'shaft' // lift lobby / stair / lift core stay 'other': 'shaft' renders open to the sky
  if (has('utility', 'store', 'help')) return 'utility'
  return 'other'
}

/** Face bounding box as `14'-0" × 16'-0"`. */
export function printedSizeOf(room: Room, unit: Unit): string {
  const poly = roomPolygon(room, unit)
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  return `${formatFeetInches(Math.max(...xs) - Math.min(...xs))} × ${formatFeetInches(Math.max(...ys) - Math.min(...ys))}`
}

/** A typed floor level → m (signed, as a sheet prints it: +3'-6", -1.5m, −10', ±0); '' = none; null = unreadable. */
export function parseLevel(text: string): number | null | undefined {
  const m = text.trim().match(/^([+\-−±]?)\s*(.*)$/)!
  if (!m[1] && !m[2]) return undefined
  const v = m[1] === '±' && /^0*(\.0*)?$/.test(m[2]) ? 0 : parseLength(m[2])
  return v == null ? null : m[1] === '-' || m[1] === '−' ? -v : v
}
/** A floor level as sheets print it: +3'-6", −10'-0", ±0. */
export const formatLevel = (m: number): string => (Math.abs(m) < 0.0127 ? '±0' : `${m > 0 ? '+' : '−'}${formatFeetInches(Math.abs(m))}`)

/** A plan direction → degrees clockwise from plan-up (−y), [0, 360): Slope.dirDeg, like Unit.northDeg. */
export const dirDegOf = (d: Pt): number => ((((Math.atan2(d.x, -d.y) * 180) / Math.PI) % 360) + 360) % 360
const dirOf = (deg: number): Pt => ({ x: Math.sin((deg * Math.PI) / 180), y: -Math.cos((deg * Math.PI) / 180) })
const r2 = (deg: number) => (Math.round(deg * 100) / 100) % 360
const turn = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180)
const edgeDirs = (room: Room, unit: Unit): { deg: number; L: number }[] => {
  const poly = roomPolygon(room, unit)
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]
    return { deg: dirDegOf({ x: q.x - p.x, y: q.y - p.y }), L: Math.hypot(q.x - p.x, q.y - p.y) }
  })
}

/** A ramp's four quick directions: along its zone's longest edge, then a quarter turn on each time (↑ → ↓ ← on an upright zone). */
export function rampDirs(room: Room, unit: Unit): number[] {
  const base = edgeDirs(room, unit).reduce((p, q) => (q.L > p.L ? q : p), { deg: 0, L: -1 }).deg % 90
  return [0, 90, 180, 270].map((k) => r2(base + k))
}

/** A dragged ramp arrow's direction: one of its zone's edge directions within 8°, else whole 5°. */
export function snapRampDir(room: Room, unit: Unit, deg: number): number {
  const edges = edgeDirs(room, unit).flatMap((e) => [e.deg, (e.deg + 180) % 360])
  const near = edges.reduce((p, q) => (turn(q, deg) < turn(p, deg) ? q : p), edges[0] ?? deg)
  return turn(near, deg) <= 8 ? r2(near) : (Math.round(deg / 5) * 5) % 360
}

/** A ramp label's arrow: through the label along `dirDeg`, across its zone 15 % in from each end — tail = levelM, head = toLevelM. */
export function rampArrow(room: Room, unit: Unit, at: Pt, dirDeg: number): { from: Pt; to: Pt } {
  const d = dirOf(dirDeg)
  const along = roomPolygon(room, unit).map((p) => (p.x - at.x) * d.x + (p.y - at.y) * d.y)
  const lo = Math.min(...along), hi = Math.max(...along), pad = (hi - lo) * 0.15
  return { from: { x: at.x + d.x * (lo + pad), y: at.y + d.y * (lo + pad) }, to: { x: at.x + d.x * (hi - pad), y: at.y + d.y * (hi - pad) } }
}

/**
 * Which side of each closed wall its length label goes on: the side with no room (outside the
 * loop), else the side whose room centroid is farther from the wall. +1 = along wallFrame.normal.
 * Walls in no room (an open chain) are absent — their length is live in the status bar.
 */
export function wallLabelSides(unit: Unit, rooms: Room[]): Map<Id, 1 | -1> {
  const walls = new Map(unit.walls.map((w) => [w.id, w]))
  const near = new Map<Id, [number, number]>() // wallId → [distance to room centroid on −normal side, on +normal side]
  for (const r of rooms) {
    r.wallIds.forEach((id, i) => {
      const w = walls.get(id)
      if (!w) return
      const f = wallFrame(w, unit.vertices)
      const mid = { x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 }
      // positive loops: a wall traversed a→b has its room on the +normal side
      const side = w.a === r.loop[i] ? 1 : 0
      const d = near.get(id) ?? [Infinity, Infinity]
      d[side] = Math.min(d[side], Math.hypot(r.centroid.x - mid.x, r.centroid.y - mid.y))
      near.set(id, d)
    })
  }
  return new Map([...near].map(([id, [neg, pos]]) => [id, neg > pos ? -1 : 1]))
}

export const formatTimer = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const slug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unit'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0

/**
 * Structural check strict enough that deriveRooms/validate cannot throw on what passes:
 * every vertex has an id and finite x/y, every wall has an id and references existing
 * vertices, every opening (if any) has an id and finite offset/width. Optional fields
 * (planImage, roomLabels, furniture, finishSlots) are only checked when present.
 */
export const isUnit = (x: unknown): x is Unit => {
  const u = x as Partial<Unit> | null
  if (!u || typeof u !== 'object' || !Array.isArray(u.vertices) || !Array.isArray(u.walls) || typeof u.name !== 'string') return false
  const vs = new Set<Id>()
  for (const v of u.vertices as Partial<Vertex>[]) {
    if (!v || !str(v.id) || !num(v.x) || !num(v.y)) return false
    vs.add(v.id)
  }
  for (const w of u.walls as Partial<Wall>[]) {
    if (!w || !str(w.id) || !str(w.a) || !str(w.b) || !vs.has(w.a) || !vs.has(w.b)) return false
    if (w.openings !== undefined) {
      if (!Array.isArray(w.openings)) return false
      for (const o of w.openings as Partial<Opening>[]) if (!o || !str(o.id) || !num(o.offsetM) || !num(o.widthM)) return false
    }
  }
  if (u.roomLabels !== undefined) {
    if (!Array.isArray(u.roomLabels)) return false
    for (const l of u.roomLabels as Partial<RoomLabel>[]) if (!l || !str(l.id) || !num(l.x) || !num(l.y)) return false
  }
  if (u.pillars !== undefined) {
    if (!Array.isArray(u.pillars)) return false
    for (const p of u.pillars as Partial<Pillar>[]) if (!p || !str(p.id) || !num(p.x) || !num(p.y) || !num(p.wM) || !num(p.hM)) return false
  }
  return true
}

/** Fill any fields a hand-edited JSON left out; drop a planImage without a usable scale; a low wall with an opening is full height. */
export const normalizeUnit = (u: Unit): Unit => {
  const pi = u.planImage
  const planImage =
    pi && num(pi.pxPerM) && pi.pxPerM > 0 ? { src: typeof pi.src === 'string' ? pi.src : '', pxPerM: pi.pxPerM, originPx: pi.originPx ?? { x: 0, y: 0 } } : undefined
  return fullHeightIfOpenings({
    ...emptyUnit(),
    ...u,
    id: str(u.id) ? u.id : newId(),
    projectName: u.projectName ?? '',
    northDeg: num(u.northDeg) ? u.northDeg : 0,
    areaSqft: num(u.areaSqft) ? u.areaSqft : 0,
    roomLabels: u.roomLabels ?? [],
    furniture: u.furniture ?? [],
    finishSlots: u.finishSlots ?? [],
    walls: u.walls.map((w) => ({
      ...w,
      thicknessM: num(w.thicknessM) && w.thicknessM > 0 ? w.thicknessM : PARTITION_M,
      heightM: num(w.heightM) && w.heightM >= 0 ? w.heightM : WALL_HEIGHT_M, // 0 = a flush line (a zone's edge)
      openings: (w.openings ?? []).map((o) => ({
        ...o,
        // before 'slider' was a kind, a hingeless door ≥ 1.2 m rendered as one: old exports keep their sliders
        ...(o.kind === 'door' && !o.hinge && o.widthM >= 1.2 ? { kind: 'slider' as const } : {}),
        heightM: num(o.heightM) ? o.heightM : 7 * FT,
        sillM: num(o.sillM) ? o.sillM : 0,
      })),
    })),
    planImage,
  })
}
