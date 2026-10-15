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
  /** the printed size: within tolM, within rejectM, none read */
  size: 'match' | 'near' | 'none'
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
  sideM: 6,
  minSideM: 0.4,
  /** candidates around a name: this far, and at most this many side lines */
  radiusM: 7,
  tries: 60,
  /** a room closed with no printed size read: its kind's largest plausible size (m²) */
  capSqm: { bath: 9, balcony: 15, kitchen: 16, utility: 8, closet: 8, pantry: 8, maid: 10, prayer: 12, foyer: 15, study: 20, bed: 30, dining: 40, living: 50 } as Record<string, number>,
  capOtherSqm: 20,
  /** a run of joined walls shorter than this (m) is furniture drawn as lines */
  mainM: 6,
  /** the room kinds a zone line may close: open plan */
  openPlan: ['living', 'dining', 'foyer', 'kitchen', 'pantry'],
  /** pieces of half a metre or more a room with no printed size read may need */
  maxGuesses: 3,
  /** the name stands within this share of the closed room's half-width from its middle */
  midShare: 0.65,
  /** a nameless space the pieces shut off smaller than this (m²) is a leftover, no room */
  leftoverSqm: 4,
  /** the narrowest a room of the kind is (m): a printed size narrower is a misread */
  narrowM: { bed: 2.1, living: 2.4, dining: 2.1, kitchen: 1.4, study: 1.8 } as Record<string, number>,
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
    if (!main) return null
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

/** the first wall centre line `d` meets from `from` within `max` m (never a wall at `skip`, never inside an opening) */
function rayHit(vs: Map<string, Vertex>, walls: Wall[], from: Pt, d: Pt, max: number, skip: string): Hit | null {
  let best: Hit | null = null
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
      if (t <= max && (!best || t < best.t)) best = { t, at: { x: at.x, y: at.y }, ...(d2(via, at) > 0.01 ? { via } : {}) }
      continue
    }
    const r = sub(A, from)
    t = crs(r, e) / den
    s = crs(r, d) / den
    // (past a wall's end, but within its body: it ends there — the ray goes on straight, a jog onto the end)
    const reach = Math.max(0.1, w.thicknessM / 2)
    if (t <= 1e-3 || t > max || s < -reach || s > L + reach) continue
    const past = s < 0 || s > L
    s = Math.max(0, Math.min(L, s))
    if (w.openings.some((o) => s > o.offsetM + 0.02 && s < o.offsetM + o.widthM - 0.02)) continue
    const at = s < 1e-3 ? { x: A.x, y: A.y } : s > L - 1e-3 ? { x: B.x, y: B.y } : { x: A.x + e.x * s, y: A.y + e.y * s }
    const via = { x: from.x + d.x * t, y: from.y + d.y * t }
    if (!best || t < best.t) best = { t, at, ...(past && d2(via, at) > 0.01 ? { via } : {}) }
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
  // one name per room: a name read twice (or its size beside it) within 1 m is one
  const names: CloseLabel[] = []
  // (a printed size no room of its kind can have — a dining 3 ft wide — is a misread: as good as none)
  const plausible = (l: CloseLabel) => !l.dims || Math.min(l.dims.aM, l.dims.bM) >= (CLOSE.narrowM[l.kind ?? ''] ?? 0)
  for (const l0 of labels) {
    const l = plausible(l0) ? l0 : { ...l0, dims: undefined }
    if (!names.some((m) => d2(m.at, l.at) < 1 && !!m.only === !!l.only)) names.push(l)
  }
  let vs = vertices, ws = walls
  const closed: Closed[] = []

  const roomsOf = (vv: Vertex[], ww: Wall[], at: Pt, R: number) => {
    // (the walls near the name only: a face closed there is closed in the whole draft too)
    const V = new Map(vv.map((v) => [v.id, v]))
    const near = ww.filter((w) => {
      const a = V.get(w.a)!, b = V.get(w.b)!
      return Math.max(a.x, b.x) >= at.x - R && Math.min(a.x, b.x) <= at.x + R && Math.max(a.y, b.y) >= at.y - R && Math.min(a.y, b.y) <= at.y + R
    })
    const used = new Set(near.flatMap((w) => [w.a, w.b]))
    const g = { vertices: vv.filter((v) => used.has(v.id)), walls: near, roomLabels: [] }
    return { rooms: deriveRooms(g), g }
  }
  const faceAt = (rooms: Room[], g: { vertices: Vertex[]; walls: Wall[] }, p: Pt) =>
    rooms.filter((r) => r.areaSqm <= o.maxSqm && pointInPolygon(p, roomPolygon(r, g))).sort((x, y) => x.areaSqm - y.areaSqm)[0]

  const tryLabel = (L: CloseLabel): boolean => {
    const R = Math.max(CLOSE.radiusM, L.dims ? Math.max(L.dims.aM, L.dims.bM) + 2 : 0)
    const base = roomsOf(vs, ws, L.at, 2 * R)
    // closed already — around this name alone; a room it shares with another name (open plan: DINING in LIVING's room) is
    // closed apart from it the same way
    const f0 = faceAt(base.rooms, base.g, L.at)
    const shared = f0 ? names.filter((m) => m !== L && pointInPolygon(m.at, roomPolygon(f0, base.g))) : []
    if (f0 && !shared.length) return false
    const others = names.filter((m) => m !== L && d2(m.at, L.at) < 2 * R)
    // the rooms closed around one name now: they stay the same room
    // (…and no new small closed space without a name: a leftover the pieces shut off — a bigger one is a room whose name
    // was not read, and its name may be read once it is closed)
    const nameless = (x: ReturnType<typeof roomsOf>) => x.rooms.filter((r) => r.areaSqm >= 1 && r.areaSqm < CLOSE.leftoverSqm && !names.some((m) => pointInPolygon(m.at, roomPolygon(r, x.g)))).length
    const nameless0 = nameless(base)
    const before = new Map<CloseLabel, number>()
    for (const m of others) {
      const f = faceAt(base.rooms, base.g, m.at)
      if (f && !names.some((n) => n !== m && pointInPolygon(n.at, roomPolygon(f, base.g)))) before.set(m, f.areaSqm)
    }
    const cap = L.dims ? o.maxSqm : (CLOSE.capSqm[L.kind ?? ''] ?? CLOSE.capOtherSqm)
    /** the pieces applied (null: one cannot be), the rooms near the name */
    const apply = (ps: Piece[]) => {
      let vv: Vertex[] = vs, ww: W[] = ws
      for (const p of ps) {
        const r = insertPiece(vv, ww, p, make)
        if (!r) return null
        ;(vv = r.vertices), (ww = r.walls)
      }
      return roomsOf(vv, ww, L.at, 2 * R)
    }
    /** a room closed around one name before is another room now */
    const harmed = (x: ReturnType<typeof roomsOf>) =>
      nameless(x) > nameless0 ||
      [...before].some(([m, a]) => {
        const h = faceAt(x.rooms, x.g, m.at)
        return !h || Math.abs(h.areaSqm - a) > 0.01 * a + 0.05
      })
    /** the pieces applied: the name's room, or null when a check fails */
    const evalSet = (ps: Piece[]): { area: number; err: number; size: Closed['size'] } | null => {
      // (a zone line is an open-plan edge: living, dining, foyer, an open kitchen — a bedroom, a toilet, a veranda is
      // closed by what is drawn, never by nothing)
      if (ps.some((p) => p.kind === 'zone') && !CLOSE.openPlan.includes(L.kind ?? '')) return null
      const x = apply(ps)
      if (!x || harmed(x)) return null
      const f = faceAt(x.rooms, x.g, L.at)
      if (!f || f.areaSqm > cap || f.areaSqm < 0.8) return null
      const poly = roomPolygon(f, x.g)
      if (names.some((m) => m !== L && pointInPolygon(m.at, poly))) return null
      // (a zone line — nothing drawn there — only where the name stands near the middle of the room it closes: a name in
      // a corner of the closed space is another room's, or a misread)
      const ux = Math.cos(o.th0), uy = Math.sin(o.th0), us = poly.map((p) => p.x * ux + p.y * uy), vs2 = poly.map((p) => -p.x * uy + p.y * ux)
      const lu = L.at.x * ux + L.at.y * uy, lv = -L.at.x * uy + L.at.y * ux
      // (no piece runs on far past the room it closes: it would be another room's side)
      const ext = (d: Pt) => { const t = poly.map((q) => q.x * d.x + q.y * d.y); return Math.max(...t) - Math.min(...t) }
      const onRim = (q: Pt) => poly.some((c, i) => along(q, c, poly[(i + 1) % poly.length]).d < 0.15)
      if (ps.some((p) => { const l = d2(p.a, p.b); return onRim({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 }) && l > ext({ x: (p.b.x - p.a.x) / l, y: (p.b.y - p.a.y) / l }) + 0.3 })) return null
      const mid = (lo: number, hi: number, t: number) => Math.abs(t - (lo + hi) / 2) <= (CLOSE.midShare * (hi - lo)) / 2
      if (ps.some((p) => p.kind === 'zone') && (!mid(Math.min(...us), Math.max(...us), lu) || !mid(Math.min(...vs2), Math.max(...vs2), lv))) return null
      if (!L.dims) return ps.some((p) => p.kind === 'zone') ? null : { area: f.areaSqm, err: f.areaSqm, size: 'none' }
      const inner = roomInnerPolygon(f, x.g)
      const c = printedSizeCheck(inner, o.th0, L.dims.aM, L.dims.bM, o.rejectM)
      if (c.off) return null
      const err = Math.abs(c.drawn.w - c.printed[0]) + Math.abs(c.drawn.h - c.printed[1])
      return { area: f.areaSqm, err, size: printedSizeCheck(inner, o.th0, L.dims.aM, L.dims.bM, o.tolM).off ? 'near' : 'match' }
    }

    // ── candidates around the name
    const V = new Map(vs.map((v) => [v.id, v]))
    const deg = new Map<string, number>()
    for (const w of ws) for (const id of [w.a, w.b]) deg.set(id, (deg.get(id) ?? 0) + 1)
    const wallOf = new Map<string, W>()
    for (const w of ws) for (const id of [w.a, w.b]) if (deg.get(id) === 1) wallOf.set(id, w)
    // (the building's walls only — joined into a run of at least mainM: ink on its own, a table's edges, a bed's headboard
    // line, is furniture, never where a wall goes on nor what one meets)
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
    const main = (id: string) => (runM.get(root(id)) ?? 0) >= CLOSE.mainM
    const mw = ws.filter((w) => main(w.a))
    const sure: Piece[] = [], side: Piece[] = [], carried: Piece[] = []
    const piece = (a: Pt, b: Pt, kind: PieceKind, thM: number, via?: Pt): Piece => ({
      a,
      b,
      ...(via ? { via } : {}),
      kind,
      thM: kind === 'zone' ? CLOSE.zoneThM : kind === 'low' ? CLOSE.lowThM : kind === 'glass' ? CLOSE.glassThM : thM,
      heightM: kind === 'zone' ? 0 : kind === 'low' ? (L.green ? CLOSE.planterM : CLOSE.railingM) : o.wallHeightM,
    })
    /** an open side a–b: glass / low wall / zone line by what is drawn along it */
    const sideKind = (a: Pt, b: Pt): PieceKind => {
      const s = drawn(a, b)
      return s === 'glass' ? 'glass' : s === 'line' && L.kind === 'balcony' ? 'low' : 'zone'
    }
    for (const v of vs) {
      if (deg.get(v.id) !== 1 || d2(v, L.at) > R || !main(v.id)) continue
      const w = wallOf.get(v.id)!, other = V.get(w.a === v.id ? w.b : w.a)!
      const len = d2(v, other)
      if (len < 1e-6) continue
      const d = { x: (v.x - other.x) / len, y: (v.y - other.y) / len }
      const h = rayHit(V, mw, v, d, CLOSE.sideM, v.id)
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
    for (const m of names.filter((x) => x !== L && !x.only && d2(x.at, L.at) <= CLOSE.sideM && (shared.includes(x) || !f0))) {
      const rel = sub(m.at, L.at), dist = Math.hypot(rel.x, rel.y)
      const ax = axes.slice(0, 2).sort((p, q) => Math.abs(q.x * rel.x + q.y * rel.y) - Math.abs(p.x * rel.x + p.y * rel.y))[0]
      const toward = ax.x * rel.x + ax.y * rel.y > 0 ? ax : { x: -ax.x, y: -ax.y }, across = { x: -toward.y, y: toward.x }
      const offs = [dist / 2, ...(L.dims ? [L.dims.aM / 2, L.dims.bM / 2] : [])].filter((x) => x > 0.3 && x < dist - 0.3)
      for (const t of offs) {
        const c = { x: L.at.x + toward.x * t, y: L.at.y + toward.y * t }
        const p = rayHit(V, mw, c, across, CLOSE.sideM, ''), q = rayHit(V, mw, c, { x: -across.x, y: -across.y }, CLOSE.sideM, '')
        if (p && q) side.push(piece(p.at, q.at, 'zone', 0))
      }
    }
    // corners' rays to the wall ahead, lines between two corners on one axis
    const near = vs.filter((v) => d2(v, L.at) <= R && deg.has(v.id) && main(v.id))
    const own = (v: Vertex, d: Pt) =>
      ws.some((w) => {
        if (w.a !== v.id && w.b !== v.id) return false
        const q = V.get(w.a === v.id ? w.b : w.a)!, l = d2(v, q)
        return l > 1e-6 && ((q.x - v.x) * d.x + (q.y - v.y) * d.y) / l > 0.98
      })
    // (a corner: a wall end, or walls meeting at an angle — not a point a straight wall runs through, a window's jamb)
    const corner = (v: Vertex) => {
      const ds = ws.filter((w) => w.a === v.id || w.b === v.id).map((w) => sub(V.get(w.a === v.id ? w.b : w.a)!, v))
      return ds.length === 1 || ds.some((p, i) => ds.some((q, j) => j > i && Math.abs(crs(p, q)) > 0.05 * Math.hypot(p.x, p.y) * Math.hypot(q.x, q.y)))
    }
    for (const v of near.filter(corner))
      for (const d of axes) {
        if (own(v, d)) continue
        const h = rayHit(V, mw, v, d, CLOSE.sideM, v.id)
        if (!h || h.t < CLOSE.minSideM) continue
        // (a wall line going on past the corner at a door's width: a doorway, as from a loose end)
        // (…from either end: the wall it meets may go on in the ray's direction)
        const along1 = (p: Pt, dir: Pt) =>
          ws.find((w) => {
            const e = [V.get(w.a)!, V.get(w.b)!].find((x) => d2(x, p) < 1e-3)
            if (!e) return false
            const q = V.get(e.id === w.a ? w.b : w.a)!, l = d2(e, q)
            return l > 1e-6 && ((q.x - e.x) * dir.x + (q.y - e.y) * dir.y) / l > 0.98
          })
        const back = along1(v, { x: -d.x, y: -d.y }) ?? along1(h.at, d)
        const to = h.via ?? h.at
        if (back && h.t >= CLOSE.minDoorM && h.t <= CLOSE.doorM) side.push(piece(v, h.at, solid(v, to) >= 0.8 ? 'wall' : drawn(v, to) === 'glass' ? 'glass' : 'door', back.thicknessM, h.via))
        else side.push(piece(v, h.at, 'zone', 0))
      }
    near.forEach((a, i) =>
      near.slice(i + 1).forEach((b) => {
        const l = d2(a, b)
        if (l < CLOSE.minSideM || l > CLOSE.sideM || !onAxis({ x: (b.x - a.x) / l, y: (b.y - a.y) / l })) return
        if (ws.some((w) => (w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id))) return
        side.push(piece(a, b, 'zone', 0))
      }),
    )
    // (a side of the name's room lies within its half-diagonal of the name; what is drawn along it read last)
    const reach = L.dims ? Math.hypot(L.dims.aM, L.dims.bM) / 2 + 0.3 : 0.75 * Math.sqrt(cap)
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
    const sides = [...carried, ...side.sort((p, q) => Math.round(100 * (d2(p.a, p.b) - d2(q.a, q.b))) || Number(p.kind === 'zone') - Number(q.kind === 'zone'))]
      .filter((p, i, all) => along(L.at, p.a, p.b).d <= reach && !all.slice(0, i).some((q) => (d2(p.a, q.a) < 0.05 && d2(p.b, q.b) < 0.05) || (d2(p.a, q.b) < 0.05 && d2(p.b, q.a) < 0.05)) && !crosses(V, ws, p.a, p.b) && !beside(p))
      .slice(0, CLOSE.tries)
      .map((p) => (p.kind === 'zone' ? { ...p, ...piece(p.a, p.b, sideKind(p.a, p.via ?? p.b), p.thM, p.via) } : p))
    // the sure pieces, nearest the name first, one per loose end (the carry before a jog), each kept only when it changes
    // no room closed around one name
    const S0: Piece[] = []
    for (const p of sure.sort((x, y) => d2(x.a, L.at) - d2(y.a, L.at))) {
      if (S0.some((q) => d2(q.a, p.a) < 1e-6)) continue
      const x = apply([...S0, p])
      if (x && !harmed(x)) S0.push(p)
    }

    // ── the sure pieces alone, else with one side line: the tightest room wins
    let best: { ps: Piece[]; r: NonNullable<ReturnType<typeof evalSet>> } | null = null
    const r0 = evalSet(S0)
    if (r0) best = { ps: S0, r: r0 }
    else
      for (const s of sides) {
        const r = evalSet([...S0, s])
        if (r && (!best || r.err < best.r.err - 0.02)) best = { ps: [...S0, s], r }
      }
    if (!best) return false
    // a sure piece the room does not need is left out
    let ps = best.ps
    for (const p of best.ps) {
      if (!S0.includes(p)) continue
      const fewer = ps.filter((q) => q !== p)
      const r = evalSet(fewer)
      if (r && Math.abs(r.area - best.r.area) <= 0.02 * best.r.area) ps = fewer
    }
    const r = evalSet(ps)
    // (no printed size to check them: a few guesses at most — more is a drawing the tracer has not read)
    if (!r || (!L.dims && ps.filter((p) => d2(p.a, p.b) >= CLOSE.wallM).length > CLOSE.maxGuesses)) return false
    for (const p of ps) {
      const x = insertPiece(vs, ws, p, make)!
      ;(vs = x.vertices), (ws = x.walls)
    }
    closed.push({ room: L.name, at: L.at, pieces: ps, size: r.size })
    return true
  }
  // small rooms first (a veranda before the bedroom it opens off); twice — a room can close once its neighbour has
  const order = names.filter((l) => !l.only).sort((p, q) => (p.dims ? p.dims.aM * p.dims.bM : (CLOSE.capSqm[p.kind ?? ''] ?? CLOSE.capOtherSqm) / 2) - (q.dims ? q.dims.aM * q.dims.bM : (CLOSE.capSqm[q.kind ?? ''] ?? CLOSE.capOtherSqm) / 2))
  for (let round = 0; round < 2; round++) {
    let any = false
    for (const L of order) if (tryLabel(L)) any = true
    if (!any) break
  }
  return { vertices: vs, walls: ws, closed }
}
