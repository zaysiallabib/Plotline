/**
 * CLOSE OPEN ROOMS (session 26 step 2, founder 2026-10-09 §5 + 2026-10-15): a printed room whose name stands in no closed
 * face is closed by the fewest guessed pieces, each drawn only on evidence, and kept only when the room it closes is that
 * printed room — its printed size where one was read. Pure: metres (the draft's frame), the sheet's grey for the evidence.
 *
 * Pieces, from the walls around the name (the sheet's axes only):
 *  - a LOOSE wall end carried on along its own wall to the wall ahead: under 0.5 m a wall (a corner the trace left open);
 *    0.5 – 1.8 m a DOORWAY — the wall line continues with an opening in it, never a solid wall (a door ≤ 1.1 m, else a
 *    passage; glass when two / three pane lines run across it); a short sideways jog (≤ 0.45 m) onto a wall beside it;
 *  - an OPEN SIDE — a longer carry, a corner's ray to the wall ahead, a line between two corners: what is drawn along it
 *    says what it is: two / three parallel thin lines = a GLASS wall (full-height glazing), one thin line on a room printed
 *    VER / balcony / terrace = a LOW wall (railing; 0.45 m planter edge on a green one), else a ZONE line (nothing in 3D,
 *    open plan) — and a zone line only where a printed size pins the room.
 * The gate (all of it, else the room stays open with its row): the name's face is closed, holds no other printed name,
 * matches its printed size within `rejectM` (none read: only drawn evidence — no zone line — and a size its kind can have),
 * and every room that was closed around one name before is the same room after. Loose ends a room does not need stay as
 * they were (each piece is left out again when the room closes the same without it).
 */
import { deriveRooms, newId, pointInPolygon, printedSizeCheck, roomInnerPolygon, roomPolygon } from '../core'
import type { Opening, Pt, Room, Vertex, Wall } from '../core'
import { darkMaxOf } from './rooms'
import { glazing } from './walls'
import type { Gray } from './types'

export interface CloseLabel {
  at: Pt
  name: string
  /** the reader's room kind ('balcony' for VER / BALCONY / TERRACE …) */
  kind?: string
  dims?: { aM: number; bM: number }
  /** the reader's guess at a size line it could not read for sure: it pins the room only where the room closed matches it */
  guess?: { aM: number; bM: number }
  /** a plant-green name (planter): its railing is a 0.45 m planter edge */
  green?: boolean
  /** a core / no-room name (lobby, lift, stair): never closed here, but a face holding it is no room of another name */
  only?: boolean
}

export type PieceKind = 'wall' | 'door' | 'glass' | 'low' | 'zone'
export interface Piece {
  a: Pt
  b: Pt
  /** a wall on the same line but a few cm to the side: the piece runs straight to `via`, a short jog of wall to `b` */
  via?: Pt
  kind: PieceKind
  thM: number
  heightM: number
}
export interface Closed {
  room: string
  /** where its name is printed */
  at: Pt
  pieces: Piece[]
  /** the printed size: within tolM, within rejectM, the reader's unsure reading matched within tolM, none read */
  size: 'match' | 'near' | 'guess' | 'none'
}

export interface CloseOpts {
  /** the sheet (px), its scale; the draft's metres are its px / k */
  gray: Gray
  k: number
  /** the sheet's axis (rad) */
  th0: number
  /** a closed room is no bigger than this (m²) */
  maxSqm: number
  tolM: number
  rejectM: number
  wallHeightM: number
}

/** metres */
export const CLOSE = {
  /** a loose end carried on: under this a wall, up to doorM a doorway, beyond a side line */
  wallM: 0.5,
  /** a doorway is at least this wide (2'): between wallM and this, a wall only where its dark band runs across */
  minDoorM: 0.55,
  doorM: 1.8,
  /** a doorway up to this wide is a door, wider a passage */
  doorLeafM: 1.1,
  jogM: 0.45,
  /** a wall end this far beside a line (m) is carried on to it: the trace stopped it short of the wall it meets */
  nearM: 0.4,
  /** a jog onto a wall's end this short (m) that would end inside another wall's window: the piece runs straight onto the end */
  hairM: 0.06,
  sideM: 6,
  minSideM: 0.4,
  /** candidates around a name: this far, and at most this many side lines */
  radiusM: 7,
  tries: 60,
  /** …and the walls looked at around a name reach this much further (m): a room closed there is closed in the whole draft */
  boxM: 1,
  /** a room closed with no printed size read: its kind's largest plausible size (m²) */
  capSqm: { bath: 9, balcony: 15, kitchen: 16, utility: 8, closet: 8, pantry: 8, maid: 10, prayer: 12, foyer: 15, study: 20, bed: 30, dining: 40, living: 50 } as Record<string, number>,
  capOtherSqm: 20,
  /** a run of joined walls shorter than this (m) is furniture drawn as lines */
  mainM: 6,
  /** the room kinds a zone line may close: open plan */
  openPlan: ['living', 'dining', 'foyer', 'kitchen', 'pantry'],
  /** a printed side lies this much further than the printed length from the wall behind the name (two half walls, m) */
  faceM: 0.1,
  /** two open sides at once: tried among this many lines, only for a room whose size pins it */
  pairs: 16,
  /** …and the lines that close an open-plan room round its print with another open-plan name still in it: this many */
  held: 4,
  /** pieces of half a metre or more a room with no printed size read may need */
  maxGuesses: 3,
  /** the name stands within this share of the closed room's half-width from its middle */
  midShare: 0.65,
  /** a nameless space the pieces shut off smaller than this (m²) is a leftover, no room */
  leftoverSqm: 4,
  /** the narrowest a room of the kind is (m): a printed size narrower is a misread */
  narrowM: { bed: 2.1, living: 2.4, dining: 2.1, kitchen: 1.4, study: 1.8 } as Record<string, number>,
  /** the kinds no low wall ever divides, and the height under which a wall is low (m: core/flats.ts LOW_WALL_M) */
  noLowWall: ['bed', 'bath', 'kitchen', 'maid', 'study', 'closet', 'utility', 'pantry', 'prayer'],
  lowM: 1.2,
  railingM: 1.1,
  planterM: 0.45,
  lowThM: 0.0635,
  zoneThM: 0.05,
  glassThM: 0.127,
}

const d2 = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)
const crs = (u: Pt, v: Pt) => u.x * v.y - u.y * v.x
const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y })
const EPS = 1e-4

/** the point's distance to segment a–b and where along it (m from a) */
function along(p: Pt, a: Pt, b: Pt): { d: number; s: number; L: number } {
  const L = d2(a, b) || 1e-9, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
  const s = (p.x - a.x) * ux + (p.y - a.y) * uy
  const t = Math.max(0, Math.min(L, s))
  return { d: Math.hypot(p.x - a.x - ux * t, p.y - a.y - uy * t), s, L }
}

/**
 * Insert `p` into the graph: each end on a vertex there, else on the wall whose centre line runs through it (split there:
 * the first half keeps the wall's id, its openings re-offset; null when the point is inside an opening), else a new
 * vertex. `make` builds the new wall (`from` set: the second half of a split wall). Returns the arrays, or null.
 */
export function insertPiece<W extends Wall>(vertices: Vertex[], walls: W[], p: Piece, make: (base: Wall, from?: W) => W): { vertices: Vertex[]; walls: W[]; id: string } | null {
  let vs = vertices.slice(), ws = walls.slice()
  const endAt = (q: Pt): string | null => {
    const v = vs.find((x) => d2(x, q) < 1e-3)
    if (v) return v.id
    const V = new Map(vs.map((x) => [x.id, x]))
    for (const w of ws) {
      const a = V.get(w.a)!, b = V.get(w.b)!, r = along(q, a, b)
      if (r.d > 1e-3 || r.s <= 1e-3 || r.s >= r.L - 1e-3) continue
      if (w.openings.some((o) => r.s > o.offsetM + EPS && r.s < o.offsetM + o.widthM - EPS)) return null
      const x: Vertex = { id: newId(), x: q.x, y: q.y }
      vs = [...vs, x]
      const first = { ...w, b: x.id, openings: w.openings.filter((o) => o.offsetM + o.widthM <= r.s + EPS) }
      const second = make({ id: newId(), a: x.id, b: w.b, thicknessM: w.thicknessM, heightM: w.heightM, openings: w.openings.filter((o) => o.offsetM >= r.s - EPS).map((o) => ({ ...o, offsetM: o.offsetM - r.s })) }, w)
      ws = ws.flatMap((y) => (y === w ? [first as W, second] : [y]))
      return x.id
    }
    const x: Vertex = { id: newId(), x: q.x, y: q.y }
    vs = [...vs, x]
    return x.id
  }
  const a = endAt(p.a)
  if (!a) return null
  const b = endAt(p.b)
  if (!b || a === b) return null
  if (p.via) {
    // (straight on to the point beside the wall's end, then a jog of plain wall onto it)
    const x: Vertex = { id: newId(), x: p.via.x, y: p.via.y }
    const main = insertPiece([...vs, x], ws, { ...p, b: p.via, via: undefined }, make)
    // (the point beside the end inside another wall's window: a hair off, the piece runs straight onto the end)
    if (!main) return d2(p.via, p.b) <= CLOSE.hairM ? insertPiece(vertices, walls, { ...p, via: undefined }, make) : null
    const jog = make({ id: newId(), a: x.id, b, thicknessM: p.thM, heightM: p.heightM, openings: [] })
    return { vertices: main.vertices, walls: [...main.walls, jog], id: main.id }
  }
  // (never across or along another wall: a wall's end on the piece, the piece's end on a wall it does not share)
  const V = new Map(vs.map((x) => [x.id, x]))
  const A = V.get(a)!, B = V.get(b)!
  for (const w of ws) {
    if (w.a === a || w.a === b || w.b === a || w.b === b) {
      // (one shared end: never folded back along the other wall)
      const s = w.a === a || w.b === a ? a : b, o = V.get(w.a === s ? w.b : w.a)!, q = s === a ? B : A, S = V.get(s)!
      if (w.a !== (s === a ? b : a) && w.b !== (s === a ? b : a) && along(o, S, q).d < 1e-3 && along(o, S, q).s > 0) return null
      continue
    }
    const P = V.get(w.a)!, Q = V.get(w.b)!
    if ([P, Q].some((x) => along(x, A, B).d < 1e-3) || [A, B].some((x) => along(x, P, Q).d < 1e-3)) return null
    const d = sub(B, A), e = sub(Q, P), den = crs(d, e)
    if (Math.abs(den) > 1e-12) {
      const r = sub(P, A), t = crs(r, e) / den, s = crs(r, d) / den
      if (t > 0 && t < 1 && s > 0 && s < 1) return null
    }
  }
  const L = d2(p.a, p.b)
  const op = (kind: Opening['kind']): Opening => ({ id: newId(), kind, offsetM: 0, widthM: L, heightM: kind === 'window' ? 2.7 : 2.1, sillM: 0 })
  const openings = p.kind === 'door' ? [op(L <= CLOSE.doorLeafM ? 'door' : 'passage')] : p.kind === 'glass' ? [op('window')] : []
  const w = make({ id: newId(), a, b, thicknessM: p.thM, heightM: p.heightM, openings })
  return { vertices: vs, walls: [...ws, w], id: w.id }
}

interface Hit {
  t: number
  at: Pt
  /** the point straight ahead when `at` is a wall's end a few cm to the side of the line */
  via?: Pt
}

/** the first wall centre line `d` meets from `from` within `max` m (never a wall at `skip`, never inside an opening unless `through`) */
function rayHit(vs: Map<string, Vertex>, walls: Wall[], from: Pt, d: Pt, max: number, skip: string, through = false, near = false): Hit | null {
  let best: Hit | null = null, bestKey = Infinity
  for (const w of walls) {
    if (w.a === skip || w.b === skip) continue
    const A = vs.get(w.a)!, B = vs.get(w.b)!, L = d2(A, B)
    if (L < 1e-6) continue
    const e = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }
    const den = crs(d, e)
    let t: number, s: number
    if (Math.abs(den) < 0.17) {
      // (along the ray: a wall on its line ahead — its near end)
      const off = Math.abs(crs(sub(A, from), d))
      if (off > Math.max(0.02, w.thicknessM / 2)) continue
      const ta = (A.x - from.x) * d.x + (A.y - from.y) * d.y, tb = (B.x - from.x) * d.x + (B.y - from.y) * d.y
      t = Math.min(ta, tb)
      if (t <= 1e-3) continue
      s = ta < tb ? 0 : L
      const at = ta < tb ? A : B
      const via = { x: from.x + d.x * t, y: from.y + d.y * t }
      if (t <= max && t < bestKey) (best = { t, at: { x: at.x, y: at.y }, ...(d2(via, at) > 0.01 ? { via } : {}) }), (bestKey = t)
      continue
    }
    const r = sub(A, from)
    t = crs(r, e) / den
    s = crs(r, d) / den
    // (past a wall's end, but within its body: it ends there — the ray goes on straight, a jog onto the end; …a wall
    // stopping up to nearM short of the ray is carried on to it — taken only where nothing is hit within a metre further)
    const body = Math.max(0.1, w.thicknessM / 2), reach = near ? Math.max(body, CLOSE.nearM) : body
    if (t <= 1e-3 || t > max || s < -reach || s > L + reach) continue
    const past = s < 0 || s > L, key = s < -body || s > L + body ? t + 1 : t
    s = Math.max(0, Math.min(L, s))
    if (!through && w.openings.some((o) => s > o.offsetM + 0.02 && s < o.offsetM + o.widthM - 0.02)) continue
    const at = s < 1e-3 ? { x: A.x, y: A.y } : s > L - 1e-3 ? { x: B.x, y: B.y } : { x: A.x + e.x * s, y: A.y + e.y * s }
    const via = { x: from.x + d.x * t, y: from.y + d.y * t }
    if (key < bestKey) (best = { t, at, ...(past && d2(via, at) > 0.01 ? { via } : {}) }), (bestKey = key)
  }
  return best
}

/** does a–b cross a wall's centre line (not at its ends) */
function crosses(vs: Map<string, Vertex>, walls: Wall[], a: Pt, b: Pt): boolean {
  const d = sub(b, a)
  return walls.some((w) => {
    const A = vs.get(w.a)!, B = vs.get(w.b)!, e = sub(B, A), den = crs(d, e)
    if (Math.abs(den) < 1e-9) return false
    const r = sub(A, a), t = crs(r, e) / den, s = crs(r, d) / den
    return t > 0.01 && t < 0.99 && s > 0.01 && s < 0.99
  })
}

/** one name per room: a name read twice (or its size beside it) within 1 m is one; a printed size no room of its kind
 * can have — a dining 3 ft wide — is a misread: as good as none */
function namesOf(labels: CloseLabel[]): CloseLabel[] {
  const names: CloseLabel[] = []
  const plausible = (d: CloseLabel['dims'], l: CloseLabel) => !d || Math.min(d.aM, d.bM) >= (CLOSE.narrowM[l.kind ?? ''] ?? 0)
  for (const l0 of labels) {
    const l = { ...l0, dims: plausible(l0.dims, l0) ? l0.dims : undefined, guess: !l0.dims && plausible(l0.guess, l0) ? l0.guess : undefined }
    if (!names.some((m) => d2(m.at, l.at) < 1 && !!m.only === !!l.only)) names.push(l)
  }
  return names
}

/** the walls near a point (their box within R of it) and their corners: a face closed there is closed in the whole draft too */
function local<X extends Wall>(vv: Vertex[], ww: X[], at: Pt, R: number): { vertices: Vertex[]; walls: X[] } {
  const V = new Map(vv.map((v) => [v.id, v]))
  const near = ww.filter((w) => {
    const a = V.get(w.a)!, b = V.get(w.b)!
    return Math.max(a.x, b.x) >= at.x - R && Math.min(a.x, b.x) <= at.x + R && Math.max(a.y, b.y) >= at.y - R && Math.min(a.y, b.y) <= at.y + R
  })
  const used = new Set(near.flatMap((w) => [w.a, w.b]))
  return { vertices: vv.filter((v) => used.has(v.id)), walls: near }
}
type Face = { r: Room; poly: Pt[]; x0: number; y0: number; x1: number; y1: number }
/** the rooms of a (local) graph, each with its outline and box worked out once */
function roomsOf(vv: Vertex[], ww: Wall[]): { faces: Face[]; g: { vertices: Vertex[]; walls: Wall[]; roomLabels: [] } } {
  const g = { vertices: vv, walls: ww, roomLabels: [] as [] }
  const faces: Face[] = deriveRooms(g).map((r) => {
    const poly = roomPolygon(r, g), xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
    return { r, poly, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
  })
  return { faces, g }
}
const inFace = (f: Face, p: Pt) => p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1 && pointInPolygon(p, f.poly)
/** the smallest closed room (≤ maxSqm) around p */
const faceAtOf = (x: { faces: Face[] }, p: Pt, maxSqm: number) => x.faces.filter((f) => f.r.areaSqm <= maxSqm && inFace(f, p)).sort((a, b) => a.r.areaSqm - b.r.areaSqm)[0]

/**
 * A space with no name of its own, cut off a named room by a wall with no door in it, is part of that room when the room
 * alone is off its printed size and with it matches (founder 2026-10-03: an unread space next to a room stays joined to
 * it; 2026-10-09: a room's size is its main rectangle as printed) — a shower area behind its curtain line, a strip split
 * off by a stray line, or the room itself when the line cut the name off in a strip of its own (a tile line read as a
 * low wall in front of a wardrobe). The walls between them go; nothing else changes. Returns the walls left and the
 * rooms joined.
 */
export function joinLeftovers<W extends Wall>(vertices: Vertex[], walls: W[], labels: CloseLabel[], o: CloseOpts): { vertices: Vertex[]; walls: W[]; joined: { room: string; at: Pt; areaSqm: number }[] } {
  const names = namesOf(labels)
  let vs = vertices, ws = walls
  const joined: { room: string; at: Pt; areaSqm: number }[] = []
  const deg = (ww: Wall[]) => {
    const m = new Map<string, number>()
    for (const w of ww) for (const id of [w.a, w.b]) m.set(id, (m.get(id) ?? 0) + 1)
    return [...m.values()].filter((n) => n === 1).length
  }
  for (const L of names) {
    // (no printed size read: only a LOW wall goes — a tile line or a rug's edge read as one across a room no low wall ever
    // divides: a bedroom, a bath, a kitchen)
    const low = !L.dims && CLOSE.noLowWall.includes(L.kind ?? '')
    if (L.only || (!L.dims && !low)) continue
    const box = (L.dims ? Math.max(L.dims.aM, L.dims.bM) : Math.sqrt(CLOSE.capSqm[L.kind!])) + CLOSE.boxM + 2
    const loc = local(vs, ws, L.at, box)
    const base = roomsOf(loc.vertices, loc.walls)
    const F = faceAtOf(base, L.at, o.maxSqm)
    const here = names.filter((m) => m !== L && Math.abs(m.at.x - L.at.x) <= box && Math.abs(m.at.y - L.at.y) <= box)
    if (!F || here.some((m) => inFace(F, m.at))) continue
    const check = (f: Face, g: typeof base.g, tol: number) => !printedSizeCheck(roomInnerPolygon(f.r, g), o.th0, L.dims!.aM, L.dims!.bM, tol).off
    if (L.dims && check(F, base.g, o.tolM)) continue
    const mine = new Set(F.r.wallIds)
    const loose0 = deg(loc.walls)
    for (const N of base.faces) {
      if (N === F || N.r.areaSqm > o.maxSqm || here.some((m) => inFace(N, m.at)) || inFace(N, L.at)) continue
      const between = new Set(N.r.wallIds.filter((id) => mine.has(id)))
      if (!between.size || loc.walls.some((w) => between.has(w.id) && (w.openings.some((op) => op.kind !== 'window') || (low && !(w.heightM > 0 && w.heightM < CLOSE.lowM))))) continue
      const ww = loc.walls.filter((w) => !between.has(w.id))
      const used = new Set(ww.flatMap((w) => [w.a, w.b]))
      const x = roomsOf(loc.vertices.filter((v) => used.has(v.id)), ww)
      const J = faceAtOf(x, L.at, o.maxSqm)
      if (!J || Math.abs(J.r.areaSqm - F.r.areaSqm - N.r.areaSqm) > 0.02 * J.r.areaSqm + 0.05 || here.some((m) => inFace(J, m.at)) || (low ? J.r.areaSqm > CLOSE.capSqm[L.kind!] : !check(J, x.g, o.tolM)) || deg(ww) > loose0) continue
      ws = ws.filter((w) => !between.has(w.id))
      const keep = new Set(ws.flatMap((w) => [w.a, w.b]))
      vs = vs.filter((v) => keep.has(v.id))
      joined.push({ room: L.name, at: L.at, areaSqm: N.r.areaSqm })
      break
    }
  }
  return { vertices: vs, walls: ws, joined }
}

export function closeRooms<W extends Wall>(vertices: Vertex[], walls: W[], labels: CloseLabel[], o: CloseOpts, make: (base: Wall, from?: W) => W): { vertices: Vertex[]; walls: W[]; closed: Closed[] } {
  const { gray, k } = o
  const W0 = gray.width, H0 = gray.height
  const grayAt = (x: number, y: number) => gray.data[Math.min(H0 - 1, Math.max(0, Math.round(y))) * W0 + Math.min(W0 - 1, Math.max(0, Math.round(x)))]
  const axes = [0, 1, 2, 3].map((q) => ({ x: Math.cos(o.th0 + (q * Math.PI) / 2), y: Math.sin(o.th0 + (q * Math.PI) / 2) }))
  const onAxis = (d: Pt) => axes.some((x) => x.x * d.x + x.y * d.y > Math.cos((3 * Math.PI) / 180))
  /** what is drawn along a–b: two or more pane lines (or a glass band), one line, nothing */
  const drawn = (a: Pt, b: Pt): 'glass' | 'line' | 'none' => {
    const L = d2(a, b) * k
    const at = { x: a.x * k, y: a.y * k }, ux = (b.x - a.x) / (L / k), uy = (b.y - a.y) / (L / k)
    const g = glazing(at, ux, uy, L, Math.max(4, 0.25 * k), grayAt)
    // (lines repeating beyond a wall's width — a tiled floor's grid, hatch — are texture: nothing drawn there)
    if (g.lines && glazing(at, ux, uy, L, 0.8 * k, grayAt).lines > g.lines + 1) return 'none'
    return g.lines >= 2 || g.band >= Math.max(3, 0.05 * k) ? 'glass' : g.lines === 1 ? 'line' : 'none'
  }
  /** the share of a–b with the sheet's wall grey on it (within 1 px): a wall's band carried on */
  const dark = darkMaxOf(gray)
  const solid = (a: Pt, b: Pt): number => {
    const n = Math.max(2, Math.ceil(d2(a, b) * k))
    let hit = 0
    for (let i = 1; i < n; i++) {
      const x = (a.x + ((b.x - a.x) * i) / n) * k, y = (a.y + ((b.y - a.y) * i) / n) * k
      if ([-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => grayAt(x + dx, y + dy) <= dark))) hit++
    }
    return hit / (n - 1)
  }
  const names = namesOf(labels)
  let vs = vertices, ws = walls
  const closed: Closed[] = []

  const faceAt = (x: { faces: Face[] }, p: Pt) => faceAtOf(x, p, o.maxSqm)

  // (the building's walls only — joined into a run of at least mainM: ink on its own, a table's edges, a bed's headboard
  // line, is furniture, never where a wall goes on nor what one meets. Worked out once per draft, again only after pieces
  // went in)
  let runsOf: W[] | null = null
  let mainCache: (id: string) => boolean = () => true
  const mainOf = () => {
    if (runsOf === ws) return mainCache
    const V = new Map(vs.map((v) => [v.id, v]))
    const deg = new Map<string, number>()
    for (const w of ws) for (const id of [w.a, w.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
    const up = new Map<string, string>()
    const root = (x: string): string => {
      while (up.has(x) && up.get(x) !== x) x = up.get(x)!
      return x
    }
    const join = (x: string, y: string) => {
      const p = root(x), q = root(y)
      up.set(p, p)
      if (p !== q) up.set(q, p)
    }
    for (const w of ws) join(w.a, w.b)
    // (…and an end at another wall: touching its body, or a corner the trace left open)
    for (const w of ws)
      for (const id of [w.a, w.b]) {
        if (deg.get(id) !== 1) continue
        const p = V.get(id)!
        const t = ws.find((x) => x !== w && along(p, V.get(x.a)!, V.get(x.b)!).d <= x.thicknessM / 2 + CLOSE.wallM / 2)
        if (t) join(id, t.a)
      }
    const runM = new Map<string, number>()
    for (const w of ws) runM.set(root(w.a), (runM.get(root(w.a)) ?? 0) + d2(V.get(w.a)!, V.get(w.b)!))
    runsOf = ws
    mainCache = (id: string) => (runM.get(root(id)) ?? 0) >= CLOSE.mainM
    return mainCache
  }

  /** how far around a name its pieces are looked for (m) */
  const reachOf = (L: CloseLabel) => {
    const sz = L.dims ?? L.guess
    return Math.max(CLOSE.radiusM, sz ? Math.max(sz.aM, sz.bM) + 2 : 0)
  }

  const tryLabel = (L: CloseLabel): boolean => {
    const R = reachOf(L)
    // (everything below on the walls near the name: the whole draft only takes the pieces kept)
    const loc = local(vs, ws, L.at, R + CLOSE.boxM)
    const lv = loc.vertices, lw = loc.walls
    const here = names.filter((m) => Math.abs(m.at.x - L.at.x) <= R + CLOSE.boxM && Math.abs(m.at.y - L.at.y) <= R + CLOSE.boxM)
    const base = roomsOf(lv, lw)
    // closed already — around this name alone; a room it shares with another name (open plan: DINING in LIVING's room) is
    // closed apart from it the same way
    const f0 = faceAt(base, L.at)
    const shared = f0 ? here.filter((m) => m !== L && inFace(f0, m.at)) : []
    if (f0 && !shared.length) return false
    const others = here.filter((m) => m !== L)
    // the rooms closed around one name now: they stay the same room
    // (…and no new small closed space without a name: a leftover the pieces shut off — a bigger one is a room whose name
    // was not read, and its name may be read once it is closed)
    const nameless = (x: ReturnType<typeof roomsOf>) => x.faces.filter((f) => f.r.areaSqm >= 1 && f.r.areaSqm < CLOSE.leftoverSqm && !here.some((m) => inFace(f, m.at))).length
    const nameless0 = nameless(base)
    const before = new Map<CloseLabel, number>()
    for (const m of others) {
      const f = faceAt(base, m.at)
      if (f && !here.some((n) => n !== m && inFace(f, n.at))) before.set(m, f.r.areaSqm)
    }
    const cap = L.dims ? o.maxSqm : (CLOSE.capSqm[L.kind ?? ''] ?? CLOSE.capOtherSqm)
    /** the pieces applied (null: one cannot be), the rooms near the name */
    const apply = (ps: Piece[]) => {
      let vv: Vertex[] = lv, ww: W[] = lw
      for (const p of ps) {
        const r = insertPiece(vv, ww, p, make)
        if (!r) return null
        ;(vv = r.vertices), (ww = r.walls)
      }
      return roomsOf(vv, ww)
    }
    /** a room closed around one name before is another room now */
    const harmed = (x: ReturnType<typeof roomsOf>) =>
      nameless(x) > nameless0 ||
      [...before].some(([m, a]) => {
        const h = faceAt(x, m.at)
        return !h || Math.abs(h.r.areaSqm - a) > 0.01 * a + 0.05
      })
    /** the pieces applied: the name's room, or null when a check fails */
    const evalSet = (ps: Piece[], several = false, holding = false, shared?: Piece): { area: number; err: number; size: Closed['size'] } | null => {
      // (a zone line is an open-plan edge: living, dining, foyer, an open kitchen — a bedroom, a toilet, a veranda is
      // closed by what is drawn, never by nothing)
      if (ps.some((p) => p.kind === 'zone') && !CLOSE.openPlan.includes(L.kind ?? '')) return null
      const x = apply(ps)
      if (!x || harmed(x)) return null
      const F = faceAt(x, L.at)
      if (!F || F.r.areaSqm < 0.8) return null
      const f = F.r, poly = F.poly
      // (a size the reader only guessed pins the room where the room closed comes within rejectM of it: two readings agree)
      const inner = L.dims || L.guess ? roomInnerPolygon(f, x.g) : []
      const pin = L.dims ?? (L.guess && !printedSizeCheck(inner, o.th0, L.guess.aM, L.guess.bM, o.rejectM).off ? L.guess : undefined)
      if (F.r.areaSqm > (pin ? o.maxSqm : cap)) return null
      // (`holding`: the room closed holds other open-plan names only — DINING with FAMILY LIVING beside it — and its main
      // rectangle matches the print: a candidate for a second line between them)
      const others = here.filter((m) => m !== L && inFace(F, m.at))
      if (holding ? !others.length || !others.every((m) => !m.only && CLOSE.openPlan.includes(m.kind ?? '')) : others.length) return null
      // (a zone line — nothing drawn there — only where the name stands near the middle of the room it closes: a name in
      // a corner of the closed space is another room's, or a misread)
      const ux = Math.cos(o.th0), uy = Math.sin(o.th0), us = poly.map((p) => p.x * ux + p.y * uy), vs2 = poly.map((p) => -p.x * uy + p.y * ux)
      const lu = L.at.x * ux + L.at.y * uy, lv = -L.at.x * uy + L.at.y * ux
      // (no piece runs on far past the room it closes: it would be another room's side — `shared` is both rooms' side)
      const ext = (d: Pt) => { const t = poly.map((q) => q.x * d.x + q.y * d.y); return Math.max(...t) - Math.min(...t) }
      const onRim = (q: Pt) => poly.some((c, i) => along(q, c, poly[(i + 1) % poly.length]).d < 0.15)
      if (ps.some((p) => { const l = d2(p.a, p.b); return p !== shared && onRim({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }) && l > ext({ x: (p.b.x - p.a.x) / l, y: (p.b.y - p.a.y) / l }) + 0.3 })) return null
      const mid = (lo: number, hi: number, t: number) => Math.abs(t - (lo + hi) / 2) <= (CLOSE.midShare * (hi - lo)) / 2
      // (…and wherever two or more sides are guessed at once)
      if (!holding && (several || ps.some((p) => p.kind === 'zone')) && (!mid(Math.min(...us), Math.max(...us), lu) || !mid(Math.min(...vs2), Math.max(...vs2), lv))) return null
      if (!pin) return holding || ps.some((p) => p.kind === 'zone') ? null : { area: f.areaSqm, err: f.areaSqm, size: 'none' }
      const c = printedSizeCheck(inner, o.th0, pin.aM, pin.bM, o.rejectM)
      if (c.off) return null
      const err = Math.abs(c.drawn.w - c.printed[0]) + Math.abs(c.drawn.h - c.printed[1])
      return { area: f.areaSqm, err, size: pin !== L.dims ? 'guess' : printedSizeCheck(inner, o.th0, pin.aM, pin.bM, o.tolM).off ? 'near' : 'match' }
    }

    /** where `hit` holds over a run of t from t0 to t1 (a drawn line seen across the profile's width): each run's middle */
    const runs = (t0: number, t1: number, hit: (t: number) => boolean): number[] => {
      const out: number[] = [], st = Math.max(1 / k, 0.03)
      let a: number | null = null
      for (let t = t0; t <= t1 + 1e-9; t += st)
        if (hit(t)) a ??= t
        else if (a !== null) out.push((a + t - st) / 2), (a = null)
      if (a !== null) out.push((a + t1) / 2)
      return out
    }
    /** the boxes a printed size draws against each wall near the name (see below): their pieces */
    const boxes = (sz: { aM: number; bM: number }): Piece[][] => {
      const out: Piece[][] = []
      // (a veranda's outer sides are its railing however they are drawn; another room's only a glass front)
      const kindAt = (a: Pt, b: Pt): PieceKind | null => {
        const s = drawn(a, b)
        return s !== 'none' && L.kind === 'balcony' ? 'low' : s === 'glass' ? 'glass' : null
      }
      for (const d of axes) {
        const nd = { x: -d.x, y: -d.y }, n = { x: -d.y, y: d.x }
        const back = rayHit(V, mw, L.at, nd, Math.max(sz.aM, sz.bM) + 0.3, '', true)
        if (!back) continue
        const at = (u: number, v: number): Pt => ({ x: L.at.x + d.x * u + n.x * v, y: L.at.y + d.y * u + n.y * v })
        const u0 = -back.t
        for (const [dep, wid] of [[sz.aM, sz.bM], [sz.bM, sz.aM]]) {
          const uf = u0 + dep + CLOSE.faceM
          // each side: the wall across the name's line within the width, or a line drawn out from the wall before it
          const sideOf = (sg: number) => {
            const h = rayHit(V, mw, L.at, { x: n.x * sg, y: n.y * sg }, wid + 0.3, '')
            // (a line within a hand's width of that wall is its face)
            const ls = runs(0.1, h ? h.t - 0.3 : wid + 0.3, (v) => !!kindAt(at(u0, sg * v), at(uf, sg * v)))
            return [...ls.map((v) => ({ v: sg * v, kind: kindAt(at(u0, sg * v), at(uf, sg * v)) })), ...(h ? [{ v: sg * h.t, kind: null }] : [])]
          }
          let pair: [{ v: number; kind: PieceKind | null }, { v: number; kind: PieceKind | null }] | null = null
          for (const a of sideOf(-1)) for (const b of sideOf(1)) if (Math.abs(b.v - a.v - wid) <= 0.4 && (!pair || Math.abs(b.v - a.v - wid) < Math.abs(pair[1].v - pair[0].v - wid))) pair = [a, b]
          if (!pair) continue
          const [s1, s2] = pair
          // the far side: the line drawn nearest where the printed depth puts it
          const fu = runs(uf - 0.35, uf + 0.35, (u) => !!kindAt(at(u, s1.v), at(u, s2.v))).sort((p, q) => Math.abs(p - uf) - Math.abs(q - uf))[0]
          const fk = fu === undefined ? null : kindAt(at(fu, s1.v), at(fu, s2.v))
          if (fu === undefined || !fk) continue
          const ps: Piece[] = []
          const corner = (s: { v: number; kind: PieceKind | null }, sg: number): Pt | null => {
            const c = at(fu, s.v)
            if (!s.kind) {
              // (the far side ends on the wall standing there — or, the wall stopping short of it, a jog onto its end)
              const h = rayHit(V, mw, at(fu, (s1.v + s2.v) / 2), { x: n.x * sg, y: n.y * sg }, wid, '')
              if (h && !h.via) return h.at
              const e = h ? h.at : lv.filter((x) => main(x.id) && Math.abs((x.x - L.at.x) * n.x + (x.y - L.at.y) * n.y - s.v) < 0.05 && d2(x, c) < CLOSE.jogM + 0.15).sort((p, q) => d2(p, c) - d2(q, c))[0]
              if (!e) return null
              ps.push(piece({ x: e.x, y: e.y }, c, fk, 0))
              return c
            }
            const w = rayHit(V, mw, c, nd, dep + 0.5, '')
            if (!w || w.via) return null
            ps.push(piece(w.at, c, s.kind, 0))
            return c
          }
          const c1 = corner(s1, -1), c2 = corner(s2, 1)
          if (!c1 || !c2) continue
          ps.push(piece(c1, c2, fk, 0))
          out.push(ps)
        }
      }
      return out
    }
    // ── candidates around the name
    const V = new Map(lv.map((v) => [v.id, v]))
    const deg = new Map<string, number>()
    for (const w of lw) for (const id of [w.a, w.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
    const wallOf = new Map<string, W>()
    for (const w of lw) for (const id of [w.a, w.b]) if (deg.get(id) === 1) wallOf.set(id, w)
    const main = mainOf()
    const mw = lw.filter((w) => main(w.a))
    const sure: Piece[] = [], side: Piece[] = [], carried: Piece[] = [], late: Piece[] = []
    const piece = (a: Pt, b: Pt, kind: PieceKind, thM: number, via?: Pt): Piece => ({
      a,
      b,
      ...(via ? { via } : {}),
      kind,
      thM: kind === 'zone' ? CLOSE.zoneThM : kind === 'low' ? CLOSE.lowThM : kind === 'glass' ? CLOSE.glassThM : thM,
      heightM: kind === 'zone' ? 0 : kind === 'low' ? (L.green ? CLOSE.planterM : CLOSE.railingM) : o.wallHeightM,
    })
    /** an open side a–b: glass / low wall / zone line by what is drawn along it */
    // (s27, founder 2026-10-09 "non-wall edges": ONE thin line on a wall's own line, from its loose end to the wall ahead, is a
    // window drawn as a single line in that wall — glass, as two lines are; across a veranda's open side it is its railing)
    const sideKind = (a: Pt, b: Pt, onLine = false): PieceKind => {
      const s = drawn(a, b)
      return s === 'glass' ? 'glass' : s === 'line' && L.kind === 'balcony' ? 'low' : s === 'line' && onLine ? 'glass' : 'zone'
    }
    for (const v of lv) {
      if (deg.get(v.id) !== 1 || d2(v, L.at) > R || !main(v.id)) continue
      const w = wallOf.get(v.id)!, other = V.get(w.a === v.id ? w.b : w.a)!
      const len = d2(v, other)
      if (len < 1e-6) continue
      const d = { x: (v.x - other.x) / len, y: (v.y - other.y) / len }
      const h = rayHit(V, mw, v, d, CLOSE.sideM, v.id, false, true)
      const to = h && (h.via ?? h.at)
      // (a wall's dark band carried on, a corner under a door's width: wall; glass across a door's width: glass; paper: a doorway)
      if (h && (h.t < CLOSE.wallM || (h.t <= CLOSE.doorM && solid(v, to!) >= 0.8))) sure.push(piece(v, h.at, 'wall', w.thicknessM, h.via))
      else if (h && h.t >= CLOSE.minDoorM && h.t <= CLOSE.doorM) sure.push(piece(v, h.at, drawn(v, to!) === 'glass' ? 'glass' : 'door', w.thicknessM, h.via))
      else if (!h || h.t > CLOSE.doorM) {
        if (h && onAxis(d)) carried.push(piece(v, h.at, 'zone', w.thicknessM, h.via))
        // (a short sideways step onto a wall beside it: the trace's two halves of one wall)
        for (const n of [{ x: -d.y, y: d.x }, { x: d.y, y: -d.x }]) {
          const j = rayHit(V, mw, v, n, CLOSE.jogM, v.id)
          if (j) sure.push(piece(v, j.at, 'wall', w.thicknessM))
        }
      }
    }
    // across the floor between this name and another near it (in its room, or open beside it): halfway, and where its
    // printed size puts its side — each from wall to wall along a sheet axis
    for (const m of here.filter((x) => x !== L && !x.only && d2(x.at, L.at) <= CLOSE.sideM && (shared.includes(x) || !f0))) {
      const rel = sub(m.at, L.at), dist = Math.hypot(rel.x, rel.y)
      const ax = axes.slice(0, 2).sort((p, q) => Math.abs(q.x * rel.x + q.y * rel.y) - Math.abs(p.x * rel.x + p.y * rel.y))[0]
      const toward = ax.x * rel.x + ax.y * rel.y > 0 ? ax : { x: -ax.x, y: -ax.y }, across = { x: -toward.y, y: toward.x }
      const sz = L.dims ?? L.guess
      const offs = [dist / 2, ...(sz ? [sz.aM / 2, sz.bM / 2] : [])].filter((x) => x > 0.3 && x < dist - 0.3)
      for (const t of offs) {
        const c = { x: L.at.x + toward.x * t, y: L.at.y + toward.y * t }
        const p = rayHit(V, mw, c, across, CLOSE.sideM, '', false, true), q = rayHit(V, mw, c, { x: -across.x, y: -across.y }, CLOSE.sideM, '', false, true)
        if (p && q) side.push(piece(p.at, q.at, 'zone', 0))
      }
    }
    // corners' rays to the wall ahead, lines between two corners on one axis
    const near = lv.filter((v) => d2(v, L.at) <= R && deg.has(v.id) && main(v.id))
    const own = (v: Vertex, d: Pt) =>
      lw.some((w) => {
        if (w.a !== v.id && w.b !== v.id) return false
        const q = V.get(w.a === v.id ? w.b : w.a)!, l = d2(v, q)
        return l > 1e-6 && ((q.x - v.x) * d.x + (q.y - v.y) * d.y) / l > 0.98
      })
    // (a corner: a wall end, or walls meeting at an angle — not a point a straight wall runs through, a window's jamb)
    const corner = (v: Vertex) => {
      const ds = lw.filter((w) => w.a === v.id || w.b === v.id).map((w) => sub(V.get(w.a === v.id ? w.b : w.a)!, v))
      return ds.length === 1 || ds.some((p, i) => ds.some((q, j) => j > i && Math.abs(crs(p, q)) > 0.05 * Math.hypot(p.x, p.y) * Math.hypot(q.x, q.y)))
    }
    for (const v of near.filter(corner))
      for (const d of axes) {
        if (own(v, d)) continue
        const h0 = rayHit(V, mw, v, d, CLOSE.sideM, v.id)
        // (…and carried on to a wall end stopping short of the ray: tried last, only where nothing else closes the room)
        for (const h of [h0, rayHit(V, mw, v, d, CLOSE.sideM, v.id, false, true)]) {
          if (!h || h.t < CLOSE.minSideM || (h !== h0 && h0 && d2(h.at, h0.at) < 1e-6)) continue
          const side1 = h === h0 ? side : late
          // (a wall line going on past the corner at a door's width: a doorway, as from a loose end)
          // (…from either end: the wall it meets may go on in the ray's direction)
          const along1 = (p: Pt, dir: Pt) =>
            lw.find((w) => {
              const e = [V.get(w.a)!, V.get(w.b)!].find((x) => d2(x, p) < 1e-3)
              if (!e) return false
              const q = V.get(e.id === w.a ? w.b : w.a)!, l = d2(e, q)
              return l > 1e-6 && ((q.x - e.x) * dir.x + (q.y - e.y) * dir.y) / l > 0.98
            })
          const back = along1(v, { x: -d.x, y: -d.y }) ?? along1(h.at, d)
          const to = h.via ?? h.at
          if (back && h.t >= CLOSE.minDoorM && h.t <= CLOSE.doorM) side1.push(piece(v, h.at, solid(v, to) >= 0.8 ? 'wall' : drawn(v, to) === 'glass' ? 'glass' : 'door', back.thicknessM, h.via))
          else side1.push(piece(v, h.at, 'zone', 0))
        }
      }
    near.forEach((a, i) =>
      near.slice(i + 1).forEach((b) => {
        const l = d2(a, b)
        if (l < CLOSE.minSideM || l > CLOSE.sideM || !onAxis({ x: (b.x - a.x) / l, y: (b.y - a.y) / l })) return
        if (lw.some((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))) return
        side.push(piece(a, b, 'zone', 0))
      }),
    )
    // (a side of the name's room lies within its half-diagonal of the name; what is drawn along it read last)
    const sz = L.dims ?? L.guess
    const reach = sz ? Math.hypot(sz.aM, sz.bM) / 2 + 0.3 : 0.75 * Math.sqrt(cap)
    // …where its printed size puts a side, from the wall across the room (the name between), and the first line drawn
    // across the floor each way (a railing, a glass front): each from wall to wall
    const fresh = new Set<Piece>()
    const across = (c: Pt, d: Pt) => {
      const n = { x: -d.y, y: d.x }
      const p = rayHit(V, mw, c, n, CLOSE.sideM, '', false, true), q = p && rayHit(V, mw, c, { x: -n.x, y: -n.y }, CLOSE.sideM, '', false, true)
      return p && q ? piece(p.at, q.at, 'zone', 0) : null
    }
    for (const d of axes) {
      const back = sz && rayHit(V, mw, L.at, { x: -d.x, y: -d.y }, CLOSE.sideM, '')
      if (back)
        for (const len of [sz.aM, sz.bM]) {
          const t = len - back.t + CLOSE.faceM, pc = t > CLOSE.minSideM ? across({ x: L.at.x + d.x * t, y: L.at.y + d.y * t }, d) : null
          if (pc) side.push(pc), fresh.add(pc)
        }
      const t = !sz ? undefined : runs(CLOSE.minSideM, reach, (t) => { const pc = across({ x: L.at.x + d.x * t, y: L.at.y + d.y * t }, d); return !!pc && drawn(pc.a, pc.b) !== 'none' })[0]
      const pc = t === undefined ? null : across({ x: L.at.x + d.x * t, y: L.at.y + d.y * t }, d)
      if (pc) side.push(pc), fresh.add(pc)
    }
    /** a line along a wall a hand's width beside it, over half its length: that wall, already there */
    const beside = (p: Piece) => {
      const L0 = d2(p.a, p.b), u = { x: (p.b.x - p.a.x) / L0, y: (p.b.y - p.a.y) / L0 }
      let cov = 0
      for (const w of mw) {
        const A = V.get(w.a)!, B = V.get(w.b)!
        if (Math.abs(crs(u, sub(B, A))) > 0.09 * d2(A, B)) continue
        if (Math.abs(crs(u, sub(A, p.a))) > Math.max(0.3, w.thicknessM)) continue
        const s0 = (A.x - p.a.x) * u.x + (A.y - p.a.y) * u.y, s1 = (B.x - p.a.x) * u.x + (B.y - p.a.y) * u.y
        cov += Math.max(0, Math.min(L0, Math.max(s0, s1)) - Math.max(0, Math.min(s0, s1)))
      }
      return cov > 0.5 * L0
    }
    // (the loose ends' carries first — a wall line going on is the likeliest side — then the shortest; one of each line)
    const byLength = (p: Piece, q: Piece) => Math.round(100 * (d2(p.a, p.b) - d2(q.a, q.b))) || Number(p.kind === 'zone') - Number(q.kind === 'zone')
    const sidesOf = (list: Piece[]) => list
      .filter((p, i, all) => along(L.at, p.a, p.b).d <= reach && !all.slice(0, i).some((q) => (d2(p.a, q.a) < 0.05 && d2(p.b, q.b) < 0.05) || (d2(p.a, q.b) < 0.05 && d2(p.b, q.a) < 0.05)) && !crosses(V, lw, p.a, p.b) && !beside(p))
      .slice(0, CLOSE.tries)
      .map((p) => {
        const q = p.kind === 'zone' ? { ...p, ...piece(p.a, p.b, sideKind(p.a, p.via ?? p.b, carried.includes(p)), p.thM, p.via) } : p
        if (fresh.has(p)) fresh.add(q)
        return q
      })
    const sides = sidesOf([...carried, ...side.sort(byLength)])
    // the sure pieces, nearest the name first, one per loose end (the carry before a jog), each kept only when it changes
    // no room closed around one name
    const S0: Piece[] = []
    for (const p of sure.sort((x, y) => d2(x.a, L.at) - d2(y.a, L.at))) {
      if (S0.some((q) => d2(q.a, p.a) < 1e-6)) continue
      const x = apply([...S0, p])
      if (x && !harmed(x)) S0.push(p)
    }

    // ── the sure pieces alone, else with one side line: the tightest room wins
    let best: { ps: Piece[]; r: NonNullable<ReturnType<typeof evalSet>>; shared?: Piece } | null = null
    const r0 = evalSet(S0)
    if (r0) best = { ps: S0, r: r0 }
    else
      for (const s of sides) {
        const r = evalSet([...S0, s])
        // (a line found only from the printed size, or the first drawn across the floor, is kept only where a size pins the room)
        if (r && (!fresh.has(s) || r.size !== 'none') && (!best || r.err < best.r.err - 0.02)) best = { ps: [...S0, s], r }
      }
    // (two open sides at once — a veranda between two walls, its railing and its glass front — one of them a line its
    // printed size or a drawn line put there; only where a size pins the room)
    if (!best && sz) {
      const few = [...new Set([...sides.slice(0, CLOSE.pairs), ...sides.filter((s) => fresh.has(s))])]
      for (let i = 0; i < few.length; i++)
        for (let j = i + 1; j < few.length; j++) {
          if (!fresh.has(few[i]) && !fresh.has(few[j])) continue
          const r = evalSet([...S0, few[i], few[j]], true)
          if (r && r.size !== 'none' && (!best || r.err < best.r.err - 0.02)) best = { ps: [...S0, few[i], few[j]], r }
        }
    }
    // (an open-plan room whose print the space closed matches — its main rectangle — but which holds another open-plan
    // name: a second line between them, from the lines around; L's room then matches alone)
    if (!best && sz && CLOSE.openPlan.includes(L.kind ?? '')) {
      const held = sides.filter((s) => evalSet([...S0, s], false, true)).slice(0, CLOSE.held)
      for (const h of held)
        for (const s0 of sides) {
          if (s0 === h) continue
          // (a line across the first one: the half each side of it)
          const d = sub(s0.b, s0.a), e = sub(h.b, h.a), den = crs(d, e), q = sub(h.a, s0.a)
          const t = Math.abs(den) > 1e-9 ? crs(q, e) / den : -1, u = Math.abs(den) > 1e-9 ? crs(q, d) / den : -1
          const X = { x: s0.a.x + d.x * t, y: s0.a.y + d.y * t }
          for (const s of t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99 ? [piece(s0.a, X, s0.kind, s0.thM), piece(X, s0.b, s0.kind, s0.thM)] : [s0]) {
            const r = evalSet([...S0, h, s], true, false, h)
            if (r && r.size !== 'none' && (!best || r.err < best.r.err - 0.02)) best = { ps: [...S0, h, s], r, shared: h }
          }
        }
    }
    // (a room drawn in thin lines against one wall — a veranda's railing on three sides: its printed size out from that
    // wall, each side on the line drawn there or the wall standing there; only where a size pins the room)
    if (!best && sz)
      for (const g of boxes(sz)) {
        const r = evalSet([...S0, ...g], true) ?? evalSet(g, true)
        if (r && r.size !== 'none' && (!best || r.err < best.r.err - 0.02)) best = { ps: evalSet([...S0, ...g], true) ? [...S0, ...g] : g, r }
      }
    if (!best)
      for (const s of sidesOf(late.sort(byLength))) {
        const r = evalSet([...S0, s])
        if (r && (!best || r.err < best.r.err - 0.02)) best = { ps: [...S0, s], r }
      }
    if (!best) return false
    // a sure piece the room does not need is left out
    let ps = best.ps
    for (const p of best.ps) {
      if (!S0.includes(p)) continue
      const fewer = ps.filter((q) => q !== p)
      const r = evalSet(fewer, false, false, best.shared)
      if (r && Math.abs(r.area - best.r.area) <= 0.02 * best.r.area) ps = fewer
    }
    const r = evalSet(ps, false, false, best.shared)
    // (no printed size to check them: a few guesses at most — more is a drawing the tracer has not read)
    if (!r || (r.size === 'none' && ps.filter((p) => d2(p.a, p.b) >= CLOSE.wallM).length > CLOSE.maxGuesses)) return false
    // (into the whole draft — a piece that runs past the walls looked at and meets one there is no piece)
    let gv = vs, gw = ws
    for (const p of ps) {
      const x = insertPiece(gv, gw, p, make)
      if (!x) return false
      ;(gv = x.vertices), (gw = x.walls)
    }
    ;(vs = gv), (ws = gw)
    closed.push({ room: L.name, at: L.at, pieces: ps, size: r.size })
    return true
  }
  // small rooms first (a veranda before the bedroom it opens off); twice — a room can close once its neighbour has
  const order = names.filter((l) => !l.only).sort((p, q) => (p.dims ? p.dims.aM * p.dims.bM : (CLOSE.capSqm[p.kind ?? ''] ?? CLOSE.capOtherSqm) / 2) - (q.dims ? q.dims.aM * q.dims.bM : (CLOSE.capSqm[q.kind ?? ''] ?? CLOSE.capOtherSqm) / 2))
  // (the second time only where pieces went in near it since: elsewhere its walls are as they were, so is the answer)
  const tried = new Map<CloseLabel, number>()
  const near = (L: CloseLabel, c: Closed) => {
    const R = reachOf(L) + CLOSE.boxM
    return c.pieces.some((p) => Math.max(p.a.x, p.b.x) >= L.at.x - R && Math.min(p.a.x, p.b.x) <= L.at.x + R && Math.max(p.a.y, p.b.y) >= L.at.y - R && Math.min(p.a.y, p.b.y) <= L.at.y + R)
  }
  for (let round = 0; round < 2; round++) {
    let any = false
    for (const L of order) {
      if (tried.has(L) && !closed.slice(tried.get(L)).some((c) => near(L, c))) continue
      tried.set(L, closed.length)
      if (tryLabel(L)) any = true
    }
    if (!any) break
  }
  return { vertices: vs, walls: ws, closed }
}
