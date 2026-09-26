/**
 * Studio state + pure reducer. No DOM, no React: Vitest-covered.
 * Every coordinate in here is plan METERS. Pixels stay in StudioApp/draw.
 */
import { FT, deriveRooms, formatFeetInches, nearestWall, newId, roomPolygon, validate, vertexById, wallFrame } from '../core'
import type { Id, Opening, OpeningKind, Pt, Room, RoomKind, RoomLabel, Unit, ValidationIssue, Vertex, Wall } from '../core'
import { snapOpeningOffset, type OpeningSnap } from './snap'
import { furnish } from '../furnish/presets'
import { movePiece, piecesOf } from './furniture'

export const PARTITION_M = 0.127
export const EXTERIOR_M = 0.254
export const WALL_HEIGHT_M = 3.048
const EPS = 1e-6
const HISTORY_CAP = 200
const IDLE_MS = 3 * 60_000

export type Tool = 'select' | 'scale' | 'wall' | 'opening' | 'room' | 'furniture'
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
  toast: { text: string; key: number } | null
  dragBlocked: boolean
  exported: boolean
  /** the "Drag any corner with V" tip after the first closed loop, once per session (not in the Draft) */
  loopTipShown: boolean
}
export interface Draft {
  unit: Unit
  planImage: PlanImage | null
  view: View
  timer: Timer
}

export type Action =
  | { type: 'set-tool'; tool: Tool }
  | { type: 'set-view'; view: View }
  | { type: 'set-plan-image'; image: PlanImage | null }
  | { type: 'set-scale'; pxPerM: number }
  | { type: 'set-meta'; patch: Partial<Pick<Unit, 'name' | 'projectName' | 'floor' | 'areaSqft' | 'northDeg'>> }
  | { type: 'select'; ids: Id[]; add?: boolean }
  | { type: 'chain-start'; at: Target }
  | { type: 'chain-add'; at: Target }
  | { type: 'chain-typed'; lengthM: number; dirDeg: number; tolM: number }
  | { type: 'chain-back' }
  | { type: 'chain-end' }
  | { type: 'toggle-thickness' }
  /** tolM: edge-snap tolerance (10 screen px); absent = centred on t */
  | { type: 'add-opening'; wallId: Id; t: number; kind?: OpeningKind; tolM?: number }
  | { type: 'update-opening'; id: Id; patch: Partial<Omit<Opening, 'id'>> }
  | { type: 'update-wall'; id: Id; patch: Partial<Pick<Wall, 'thicknessM' | 'heightM'>> }
  | { type: 'set-wall-length'; id: Id; lengthM: number }
  | { type: 'move-vertex'; id: Id; x: number; y: number }
  | { type: 'drag-begin' }
  | { type: 'drag'; vertices: { id: Id; x: number; y: number }[] }
  | { type: 'drag-end'; ids: Id[] }
  | { type: 'drag-opening'; id: Id; offsetM: number; tolM?: number }
  | { type: 'drag-label'; id: Id; x: number; y: number }
  /** arrow keys: move the selection by (dx, dy) m; openings slide along their wall by dx + dy. No snapping. */
  | { type: 'nudge'; dx: number; dy: number }
  | { type: 'delete'; ids?: Id[] }
  | { type: 'add-label'; label: Omit<RoomLabel, 'id'> }
  | { type: 'update-label'; id: Id; patch: Partial<Omit<RoomLabel, 'id'>> }
  | { type: 'duplicate-label' }
  | { type: 'flip'; what: 'hinge' | 'swing' }
  /** Furniture tool: piece to centre (x, y) on the 1 ft grid + wall snap (furniture.movePiece); refused → toast, nothing moves */
  | { type: 'move-piece'; id: Id; x: number; y: number }
  /** 90° clockwise about its centre, then out of / flush to a wall it pokes into */
  | { type: 'rotate-piece'; id: Id }
  /** one room back to its preset pieces; no room = all of them (an empty array: the layout follows the walls again) */
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

/**
 * A corner moved onto another corner becomes that corner: its walls rewire, a wall collapsed to
 * nothing goes, a doubled wall keeps the one with openings. Without this a drag or nudge onto a
 * neighbour left a zero-length wall plus a corner "not joined to anything" sitting on the same spot.
 * Returns the same unit when nothing merged; `merged` maps each removed corner to its survivor.
 */
export function mergeCoincident(unit: Unit, ids: Id[], tolM = MERGE_M): { unit: Unit; merged: Map<Id, Id> } {
  const merged = new Map<Id, Id>()
  let u = unit
  for (const id of ids) {
    const v = u.vertices.find((x) => x.id === id)
    if (!v) continue
    const other = u.vertices.find((x) => x.id !== id && Math.hypot(x.x - v.x, x.y - v.y) <= tolM)
    if (!other) continue
    const seen = new Map<string, Wall>()
    for (const w0 of u.walls) {
      const w = w0.a === id || w0.b === id ? { ...w0, a: w0.a === id ? other.id : w0.a, b: w0.b === id ? other.id : w0.b } : w0
      if (w.a === w.b) continue
      const key = wallKey(w.a, w.b)
      const dup = seen.get(key)
      if (!dup || w.openings.length > dup.openings.length) seen.set(key, w)
    }
    u = { ...u, walls: u.walls.flatMap((w0) => { const w = seen.get(wallKey(w0.a === id ? other.id : w0.a, w0.b === id ? other.id : w0.b)); return w && w.id === w0.id ? [w] : [] }), vertices: u.vertices.filter((x) => x.id !== id) }
    merged.set(id, other.id)
  }
  return merged.size ? { unit: u, merged } : { unit, merged }
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

export function findEntity(u: Unit, id: Id): Entity | null {
  const v = u.vertices.find((x) => x.id === id)
  if (v) return { kind: 'vertex', v }
  const w = u.walls.find((x) => x.id === id)
  if (w) return { kind: 'wall', w }
  const o = findOpening(u, id)
  if (o) return { kind: 'opening', o: o.opening, w: o.wall }
  const l = u.roomLabels.find((x) => x.id === id)
  if (l) return { kind: 'label', l }
  return null
}

/** Selected ids still in `u`: graph entities, or pieces of its furniture layer (preset ids are deterministic). */
function stillThere(u: Unit, ids: Id[]): Id[] {
  let pieces: Set<Id> | undefined
  return ids.filter((id) => findEntity(u, id) || (pieces ??= new Set(piecesOf(u, deriveRooms(u)).map((p) => p.id))).has(id))
}

/** Plan points that stand for an entity (for pan-to / bounds). */
export function entityPoints(u: Unit, id: Id): Pt[] {
  const e = findEntity(u, id)
  if (!e) return []
  if (e.kind === 'vertex') return [e.v]
  if (e.kind === 'label') return [e.l]
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
function addWall(unit: Unit, aId: Id, bId: Id, thicknessM: number, tolM: number): Unit | string {
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
    walls.push({ id: newId(), a: ids[i], b: ids[i + 1], thicknessM, heightM: WALL_HEIGHT_M, openings: [] })
  }
  return { ...unit, walls }
}

export function openingDefaults(kind: OpeningKind, bath: boolean): Pick<Opening, 'widthM' | 'heightM' | 'sillM'> {
  if (kind === 'window') return { widthM: 4 * FT, heightM: 4 * FT, sillM: 3 * FT }
  if (kind === 'passage') return { widthM: 4 * FT, heightM: 7 * FT, sillM: 0 }
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

/** The opening a click at `t` on `wall` creates; the O tool's ghost draws the same. `error` = the click is refused. */
export function openingAt(
  u: Unit,
  wall: Wall,
  t: number,
  kind: OpeningKind,
  tolM: number,
  rooms: Room[],
): { opening: Opening; snapped: OpeningSnap; error: string | null } {
  const len = wallLen(u, wall)
  const d = openingDefaults(kind, kind === 'door' && bordersBath(rooms, wall.id))
  const { offsetM, snapped } = snapOpeningOffset(wall, len, t * len, d.widthM, tolM)
  const opening: Opening = { id: newId(), kind, ...d, offsetM, hinge: 'a', swing: 'in' }
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

function chainAdd(s: StudioState, at: Target): StudioState {
  if (!s.chain) return s
  const r = resolveTarget(s.unit, at)
  if (typeof r === 'string') return withToast(s, r)
  const last = s.chain.ids[s.chain.ids.length - 1]
  if (r.id === last) return s
  const u = addWall(r.unit, last, r.id, s.chain.thicknessM, at.tolM)
  if (typeof u === 'string') return withToast(s, u)
  const closes = r.id === s.chain.ids[0]
  const next = commit(s, u, { chain: r.existing || closes ? null : { ...s.chain, ids: [...s.chain.ids, r.id] }, selection: [] })
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
      const chain = { ids: [r.id], thicknessM: s.chain?.thicknessM ?? PARTITION_M }
      return r.unit === s.unit ? { ...s, chain, selection: [] } : commit(s, r.unit, { chain, selection: [] })
    }
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
      const { opening: placed, error } = openingAt(s.unit, wall, a.t, kind, a.tolM ?? 0, deriveRooms(s.unit))
      if (error) return withToast(s, error)
      const walls = s.unit.walls.map((w) => (w.id === wall.id ? { ...w, openings: [...w.openings, placed] } : w))
      return commit(s, { ...s.unit, walls }, { selection: [placed.id], lastOpeningKind: kind })
    }
    case 'update-opening': {
      const f = findOpening(s.unit, a.id)
      if (!f) return s
      let next: Opening = { ...f.opening, ...a.patch }
      if (a.patch.kind && a.patch.kind !== f.opening.kind) {
        next = { ...next, ...openingDefaults(a.patch.kind, a.patch.kind === 'door' && bordersBath(deriveRooms(s.unit), f.wall.id)) }
      }
      const placed = placeOpening(f.wall, wallLen(s.unit, f.wall), next)
      if (typeof placed === 'string') return withToast(s, placed)
      return commit(s, replaceOpening(s.unit, f.wall.id, placed), { lastOpeningKind: placed.kind })
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
    case 'update-wall': {
      if (!s.unit.walls.some((w) => w.id === a.id)) return s
      return commit(s, { ...s.unit, walls: s.unit.walls.map((w) => (w.id === a.id ? { ...w, ...a.patch } : w)) })
    }
    case 'set-wall-length': {
      const wall = s.unit.walls.find((w) => w.id === a.id)
      if (!wall || a.lengthM <= 0 || a.lengthM > 100) return s
      const f = wallFrame(wall, s.unit.vertices)
      const b = { x: f.origin.x + f.dir.x * a.lengthM, y: f.origin.y + f.dir.y * a.lengthM }
      return commit(s, { ...s.unit, vertices: s.unit.vertices.map((v) => (v.id === wall.b ? { ...v, ...b } : v)) })
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
      // drag-begin already put the pre-drag unit in history; only the merge is applied here
      const r = mergeCoincident(s.unit, a.ids)
      if (r.unit === s.unit) return s
      return { ...s, unit: r.unit, selection: s.selection.map((id) => r.merged.get(id) ?? id) }
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
      for (const id of s.selection) {
        const f = findOpening(u, id)
        if (!f) continue
        const placed = placeOpening(f.wall, wallLen(u, f.wall), { ...f.opening, offsetM: f.opening.offsetM + a.dx + a.dy })
        if (typeof placed === 'string') return withToast(s, placed)
        u = replaceOpening(u, f.wall.id, placed)
      }
      const r = mergeCoincident(u, [...moved])
      return commit(s, r.unit, r.merged.size ? { selection: s.selection.map((id) => r.merged.get(id) ?? id) } : {})
    }

    case 'delete': {
      const ids = new Set(a.ids ?? s.selection)
      if (!ids.size) return s
      const walls = s.unit.walls
        .filter((w) => !ids.has(w.id) && !ids.has(w.a) && !ids.has(w.b))
        .map((w) => ({ ...w, openings: w.openings.filter((o) => !ids.has(o.id)) }))
      const used = new Set(walls.flatMap((w) => [w.a, w.b]))
      const vertices = s.unit.vertices.filter((v) => !ids.has(v.id) && used.has(v.id))
      const roomLabels = s.unit.roomLabels.filter((l) => !ids.has(l.id))
      return commit(s, { ...s.unit, walls, vertices, roomLabels }, { selection: [], chain: null })
    }

    case 'add-label': {
      const label: RoomLabel = { id: newId(), ...a.label }
      return commit(s, { ...s.unit, roomLabels: [...s.unit.roomLabels, label] }, { selection: [label.id] })
    }
    case 'update-label':
      return commit(s, { ...s.unit, roomLabels: s.unit.roomLabels.map((l) => (l.id === a.id ? { ...l, ...a.patch } : l)) })
    case 'duplicate-label': {
      const sel = new Set(s.selection)
      const copies = s.unit.roomLabels.filter((l) => sel.has(l.id)).map((l) => ({ ...l, id: newId(), x: l.x + 0.5, y: l.y + 0.5 }))
      if (!copies.length) return s
      return commit(s, { ...s.unit, roomLabels: [...s.unit.roomLabels, ...copies] }, { selection: copies.map((c) => c.id) })
    }
    case 'flip': {
      const sel = new Set(s.selection)
      let changed = false
      const walls = s.unit.walls.map((w) => ({
        ...w,
        openings: w.openings.map((o): Opening => {
          if (!sel.has(o.id)) return o
          changed = true
          return a.what === 'hinge' ? { ...o, hinge: o.hinge === 'b' ? 'a' : 'b' } : { ...o, swing: o.swing === 'out' ? 'in' : 'out' }
        }),
      }))
      return changed ? commit(s, { ...s.unit, walls }) : s
    }

    case 'move-piece':
    case 'rotate-piece': {
      const rooms = deriveRooms(s.unit)
      const pieces = piecesOf(s.unit, rooms)
      const p = pieces.find((x) => x.id === a.id)
      if (!p) return s
      const r =
        a.type === 'rotate-piece'
          ? movePiece(s.unit, rooms, pieces, p.id, p, p.rotationDeg + 90, false)!
          : movePiece(s.unit, rooms, pieces, p.id, { x: a.x, y: a.y }, p.rotationDeg)!
      if (r.error) return withToast(s, r.error)
      const q = r.piece
      if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-9 && q.rotationDeg === p.rotationDeg) return s
      // the first move writes the whole preset layout: that is what Export and Preview 3D then carry
      return commit(s, { ...s.unit, furniture: r.furniture })
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
      return { ...initialState(), unit: normalizeUnit(a.unit), planImage: s.planImage, view: s.view, timer: s.timer, tool: 'select' }
    case 'restore': {
      // a draft may be just `{ unit }` (older drafts, hand-injected JSON): every other field is optional
      const init = initialState()
      const d = a.draft as Partial<Draft>
      return {
        ...init,
        unit: normalizeUnit(a.draft.unit),
        planImage: d.planImage ?? null,
        view: d.view ?? init.view,
        timer: { ...init.timer, ...d.timer, lastTickAt: 0 },
      }
    }
    case 'reset':
      return initialState()

    case 'timer-start':
      return s.timer.started ? s : { ...s, timer: { ...s.timer, started: true, lastInputAt: a.now, lastTickAt: a.now } }
    case 'timer-input':
      return { ...s, timer: { ...s.timer, lastInputAt: a.now } }
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
    const outer = unit.walls.filter((w) => (count.get(w.id) ?? 0) < 2 || rooms.some((r) => r.kind === 'other' && r.wallIds.includes(w.id))) // a traced lobby is still outside
    if (!outer.some((w) => w.openings.some((o) => o.kind === 'door'))) {
      out.push({ level: 'warning', code: 'no-entry-door', message: 'No entry door on an outer wall', ids: [] })
    }
  }
  return out
}

export function guessKind(name: string): RoomKind {
  const n = name.toLowerCase()
  const has = (...ws: string[]) => ws.some((w) => n.includes(w))
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
  return true
}

/** Fill any fields a hand-edited JSON left out; drop a planImage without a usable scale. */
export const normalizeUnit = (u: Unit): Unit => {
  const pi = u.planImage
  const planImage =
    pi && num(pi.pxPerM) && pi.pxPerM > 0 ? { src: typeof pi.src === 'string' ? pi.src : '', pxPerM: pi.pxPerM, originPx: pi.originPx ?? { x: 0, y: 0 } } : undefined
  return {
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
      heightM: num(w.heightM) && w.heightM > 0 ? w.heightM : WALL_HEIGHT_M,
      openings: (w.openings ?? []).map((o) => ({ ...o, heightM: num(o.heightM) ? o.heightM : 7 * FT, sillM: num(o.sillM) ? o.sillM : 0 })),
    })),
    planImage,
  }
}
