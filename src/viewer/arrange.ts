/**
 * Arrange (staff only; CLAUDE.md Decisions 2026-09-27): move, turn and resize the flat's furniture in the 3D view with
 * the Studio's rules (src/studio/furniture.ts). Pure glue: who is staff, the layout saved for the apartment (one drawing
 * in one place: data/building/apartments.ts — the Studio's tool F arranges the drawing's own), the undo stack, and where a
 * drag in the 3D view puts a piece.
 */
import { newId, takesLowKind, vertexById, wallFrame, type FurniturePlacement, type Id, type LowWallKind, type Pt, type RailColor, type Room, type Unit } from '../core'
import { finishesKey, keptAt, layoutKey, placesIn, saveLayout } from '../data/building/apartments'
import type { Tower } from '../data/building'
import { PROJECTS_KEY, forkFloor, keepApartments, parseProjects, sharedAt, stemOf, syncUnit } from '../data/building/projects'
import { kitAsset, objectKind, placementRange } from '../furnish/kit'
import { baseOf, deletePiece, hangOn, layoutFor, movePiece, placePiece, surfaceOf, type Move, type WallFace } from '../studio/furniture'
import { endAlong, initialState, isUnit, normalizeUnit, reducer, type StudioState } from '../studio/model'
import { snapMove } from '../studio/snap'
import type { OpeningEvent } from '../three/PlotlineScene'
import { pinsKey } from './storage'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const STAFF_KEY = 'plotline.staff'

/**
 * Staff = the Studio has run in this browser (it sets the flag), or `?staff=1` (the load screen's "Staff mode" link),
 * which sets it too; `?staff=0` forgets it (see what a buyer sees). Share links never carry it (share.ts shareUrl).
 * A published link (`/s/<token>`; `path` = the route) is never staff, whatever this browser remembers: staff edit a flat
 * on its own `/u/` address (CLAUDE.md: nothing staff-only on a buyer link).
 */
export function isStaff(search: string, path: string, store?: Store): boolean {
  if (path.startsWith('/s/')) return false
  try {
    const s = store ?? localStorage
    const q = new URLSearchParams(search).get('staff')
    if (q === '1') s.setItem(STAFF_KEY, '1')
    if (q === '0') s.removeItem(STAFF_KEY)
    return s.getItem(STAFF_KEY) === '1'
  } catch {
    return false // storage blocked: nobody is staff
  }
}

/** A buyer's link (Share: `?c=`) never offers staff mode: its load screen has no "Staff mode" or Studio link. */
export const isShareLink = (search: string): boolean => new URLSearchParams(search).has('c')

/** The arranged layout and the finishes, per apartment (data/building/apartments.ts): one drawing in one place of its building. */
export { finishesKey, layoutKey, readFinishes, readLayout, saveFinishes, saveLayout } from '../data/building/apartments'

/**
 * Who writes an apartment's finishes (founder 2026-11-21): staff on the flat's own page. Never a buyer, never a buyer's
 * link (`/s/…`, or an address carrying `?c=`: its choice rides in the address and wins there, share.ts startFinishes).
 */
export const keepsFinishes = (staff: boolean, search: string, path: string): boolean => staff && !path.startsWith('/s/') && !isShareLink(search)

/** The committed layout and the ones before it (Ctrl+Z). */
export interface Steps {
  pieces: FurniturePlacement[]
  past: FurniturePlacement[][]
}
const UNDO_MAX = 50
export const pushStep = (h: Steps, pieces: FurniturePlacement[]): Steps => ({ pieces, past: [...h.past, h.pieces].slice(-UNDO_MAX) })
export const undoStep = (h: Steps): Steps => (h.past.length ? { pieces: h.past[h.past.length - 1], past: h.past.slice(0, -1) } : h)

/** Where a drag slides a piece (studio/furniture.ts): walls, ceiling or floor. */
export { surfaceOf }

/**
 * The pointer during a drag (plan metres): `at` = where the piece's centre goes on the horizontal plane it was grabbed
 * at (grab offset kept); `wall` = the wall face under the pointer, `n` its normal toward the viewer's side.
 */
export interface DragTarget {
  at: Pt | null
  wall: WallFace | null
  /** the face of the opening whose hole the pointer looks through (a doorway, a passage): where new curtains hang */
  hole?: WallFace | null
}

/** What a drag of piece `id` moves (3D and Studio tool F): studio/furniture.ts baseOf. */
export { baseOf }

/**
 * A TV standing on its unit, pointed up onto the wall above it (the wall under the pointer more than 10 cm over the TV's
 * top: the pointer has left the TV for the wall), is refused with why — never left in hand without a word. The kit
 * decides: a piece that can hang (kit `mount: 'wall'`, or `mountY` ≥ 0.9 m: the wall TV tv_55_wall) is a wall piece,
 * dragged on its own along the walls (hangOn), and never rides on a unit; the TV that rides on one (tv_55, "TV on
 * stand", `mountY` = the unit's top) has its stand foot modelled, so it can only stand. Pointed back down, the drag moves
 * the unit with it again. Cushions or a lamp on a piece, pointed at a wall, carry their piece as before.
 */
export const TV_STANDS = 'A TV on its stand cannot hang (Add has a wall-mounted TV)'

/**
 * Piece `id` (or what it rests on, baseOf) dragged to `t`, on the Studio's rules (movePiece: 3" grid, wall snap,
 * refusals, riders along), turned to `rotationDeg` (default: as it stands). A wall piece goes onto the wall under the
 * pointer — back to it, front into the room, sliding in 3" steps along it and up and down in 1" steps (its middle at the
 * pointer's height + `lift`) — so it hops walls; curtains slide along their own wall only (onto another window of it);
 * the others slide on their plane.
 */
export function dragTo(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], id: Id, t: DragTarget, rotationDeg?: number, grab?: Pt, lift = 0): Move | null {
  const g = pieces.find((x) => x.id === id)
  const p = baseOf(pieces, id)
  if (!g || !p) return null
  if (g.id !== p.id && objectKind(kitAsset(g.assetId)!) === 'tv' && (t.wall?.y ?? 0) > placementRange(g)[1] + 0.1)
    return { furniture: pieces, piece: g, ids: [g.id], snapped: null, error: TV_STANDS } // TV_STANDS: the kit's TV on its stand
  if (p.openingId) {
    // curtains slide along their own wall with the point under the pointer (+ where they were grabbed: Held.grab)
    const to = t.wall?.p ?? t.at
    return to && movePiece(unit, rooms, pieces, p.id, { x: to.x + (grab?.x ?? 0), y: to.y + (grab?.y ?? 0) }, p.rotationDeg)
  }
  if (surfaceOf(p) !== 'wall') return t.at && movePiece(unit, rooms, pieces, p.id, { x: t.at.x + p.x - g.x, y: t.at.y + p.y - g.y }, rotationDeg ?? p.rotationDeg)
  return t.wall && hangOn(unit, rooms, pieces, id, t.wall.y === undefined ? t.wall : { ...t.wall, y: t.wall.y + lift })
}

/**
 * A piece in hand (founder 2026-10-04: "where it does not fit, don't put it back — red and a warning, but I can still
 * move it, turn it, and place it where it fits"): a dragged piece, one picked up with G (also while walking with the
 * mouse locked), or a new one from the library (`assetId`). It follows the pointer on the Studio's rules; where they
 * refuse it, its candidate stays shown (red, `move.error` = why) and is never committed; it drops only where it fits;
 * Esc = the committed layout, where it was picked up. The rules themselves are dragTo / placePiece, unchanged.
 */
export interface Held {
  /** the piece the pointer holds (dragTo moves what it rests on); a library piece's new id */
  id: Id
  /** a library piece, not in the layout yet */
  assetId?: string
  /** its turn: R adds 90° */
  rot: number
  /** the last pointer target that put it somewhere (R turns it there) */
  at: DragTarget | null
  /** where it is now: the candidate layout; `error` = why it may not stay (null: it may); null = nowhere yet */
  move: Move | null
  /** curtains: their middle less the wall point first pointed at, so they slide with the hand, not jump to it */
  grab?: Pt
  /** a wall piece: its middle's height less the wall point's first pointed at, so it goes up and down with the hand, not jump to it */
  lift?: number
}

/** Piece `id` (a drag's first frame, or G) picked up as it stands. */
export const pickUp = (pieces: FurniturePlacement[], id: Id): Held => ({ id, rot: baseOf(pieces, id)?.rotationDeg ?? 0, at: null, move: null })

/**
 * The held piece at pointer target `t` turned `rot`, on the rules (a refused spot is kept, with its reason); a target
 * that puts it nowhere (the sky out of a window, no wall under a TV) keeps it where it was.
 */
export function holdAt(unit: Unit, rooms: Room[], pieces: FurniturePlacement[], h: Held, t: DragTarget | null = h.at, rot = h.rot): Held {
  const p = t && (t.at ?? t.wall?.p)
  const c = !h.assetId && pieces.find((x) => x.id === h.id && x.openingId)
  const w = t && (t.wall?.p ?? t.at)
  if (c && w && !h.grab) h = { ...h, grab: { x: c.x - w.x, y: c.y - w.y } }
  const hung = !h.assetId && h.lift === undefined && t?.wall?.y !== undefined && pieces.find((x) => x.id === h.id && !x.openingId && surfaceOf(x) === 'wall')
  if (hung) h = { ...h, lift: placementRange(hung).reduce((a, b) => a + b) / 2 - t!.wall!.y! }
  const move = !t ? null : h.assetId ? p && placePiece(unit, rooms, pieces, h.assetId, p, rot, h.id, t.wall, t.hole) : dragTo(unit, rooms, pieces, h.id, t, rot, h.grab, h.lift)
  return move ? { ...h, at: t, rot, move } : { ...h, rot }
}

/** R: a quarter turn on, where it is (a backed piece by a wall still turns its back to it, as any move). */
export const turnHeld = (unit: Unit, rooms: Room[], pieces: FurniturePlacement[], h: Held): Held => holdAt(unit, rooms, pieces, h, h.at, h.rot + 90)

/** Delete with a piece in hand (G, a drag): what moves with it goes, and what rests on that (deletePiece: one undo step); a library piece in hand is only let go (null). */
export const deleteHeld = (pieces: FurniturePlacement[], h: Held): FurniturePlacement[] | null => (h.assetId ? null : deletePiece(pieces, baseOf(pieces, h.id)?.id ?? h.id))

/** What a click / G / release commits: the layout with the piece where it is — only where it fits (null: it stays in hand). */
export const dropHeld = (h: Held): FurniturePlacement[] | null => (h.move && !h.move.error ? h.move.furniture : null)

// ── Edit openings (staff, founder 2026-10-04): a door / window / passage changed in the 3D view is a change to the plan
// the Studio opens — written into the Studio draft and the preview, so plan and 3D never disagree.
export const DRAFT_KEY = 'plotline.studio.draft'
export const PREVIEW_KEY = 'plotline.preview'
export const planOf = (u: Unit): string => JSON.stringify([u.vertices, u.walls])
/** a stored draft is a Draft `{ unit, … }` or a bare Unit (StudioApp init accepts both) */
const unitIn = (x: unknown): Unit | null => (isUnit(x) ? x : isUnit((x as { unit?: unknown } | null)?.unit) ? (x as { unit: Unit }).unit : null)
/** the stored draft holds unit `id`: its own, or the project drawing it is open as (a drawing traced again — Auto-trace — keeps
 *  its project id in `drawing` while the Studio's unit takes a new one; StudioApp synced writes it back under that id) */
const holds = (d: unknown, u: Unit | null, id: string): boolean => !!u && (u.id === id || (d as { drawing?: unknown } | null)?.drawing === id)

/** Can this page's opening edits go into the Studio draft? 'ok': it holds this unit, its plan as shown here; 'other': another unit, or none; 'changed': this unit, its plan edited in the Studio since. */
export function draftState(unit: Unit, store?: Store): 'ok' | 'other' | 'changed' {
  try {
    const d: unknown = JSON.parse((store ?? localStorage).getItem(DRAFT_KEY) ?? 'null')
    const u = unitIn(d)
    if (!u || !holds(d, u, unit.id)) return 'other'
    return planOf(normalizeUnit(u)) === planOf(unit) ? 'ok' : 'changed'
  } catch {
    return 'other'
  }
}

/**
 * A committed opening / low wall edit: `after`'s corners and walls (their openings) into the Studio draft and the preview,
 * every other field of theirs kept — only while the draft still holds `before`'s plan; else why not, and nothing is written.
 * A project drawing takes it at once too (the Building view draws the other floors from the projects), as the Studio's
 * autosave would.
 */
export function saveOpenings(before: Unit, after: Unit, store?: Store): 'ok' | 'other' | 'changed' | 'full' {
  const s = store ?? localStorage
  const why = draftState(before, s)
  if (why !== 'ok') return why
  try {
    for (const key of [DRAFT_KEY, PREVIEW_KEY]) {
      const d: unknown = JSON.parse(s.getItem(key) ?? 'null')
      const u = unitIn(d)
      if (!u || !holds(d, u, after.id)) continue
      const v = { ...u, vertices: after.vertices, walls: after.walls }
      s.setItem(key, JSON.stringify(isUnit(d) ? v : { ...(d as object), unit: v }))
      const ps = key === DRAFT_KEY && syncUnit(parseProjects(s.getItem(PROJECTS_KEY)), { ...v, id: after.id })
      if (ps) s.setItem(PROJECTS_KEY, JSON.stringify(ps))
    }
    return 'ok'
  } catch {
    return 'full' // ponytail: the draft may be written and the preview not; the Studio warns the same way when a draft outgrows storage
  }
}

/**
 * Edit openings → a low wall dragged in 3D (founder 2026-10-19), with the Studio's V rules, on `s` (the plan mid-drag;
 * `start` = it at drag-begin). `wall-end`: that end toward `at` along the wall's own line (model.endAlong: snapped, the
 * walls at it straight), off a shared corner first as a picked wall's end leaves it in the Studio — `rigid` (Alt) keeps the
 * corner instead. `wall-move`: both ends `dM` across the line from where they were, snapped as a dragged wall is, only
 * across. Returns the plan and the corners the drop (drag-end) joins.
 */
export function wallDrag(s: StudioState, start: Unit, e: Extract<OpeningEvent, { kind: 'wall-end' | 'wall-move' }>, tolM: number): { s: StudioState; ids: Id[] } {
  const w0 = start.walls.find((w) => w.id === e.id)
  const w = s.unit.walls.find((x) => x.id === e.id)
  if (!w0 || !w) return { s, ids: [] }
  if (e.kind === 'wall-move') {
    const n = wallFrame(w0, start.vertices).normal
    const at = (d: number) => [w0.a, w0.b].map((id) => ({ id, x: vertexById(start.vertices, id).x + n.x * d, y: vertexById(start.vertices, id).y + n.y * d }))
    const { dx, dy } = snapMove(at(e.dM), s.unit, tolM)
    return { s: reducer(s, { type: 'drag', vertices: at(e.dM + dx * n.x + dy * n.y) }), ids: [w0.a, w0.b] }
  }
  let t = s
  let end = w[e.end]
  if (!e.rigid && end === w0[e.end] && s.unit.walls.filter((x) => x.a === end || x.b === end).length >= 2) {
    end = newId()
    t = reducer(t, { type: 'detach', wallId: w.id, vertexId: w[e.end], newId: end })
  }
  const r = endAlong(t.unit, w.id, end, e.at, { tolM })
  return r ? { s: reducer(t, { type: 'drag', vertices: r.moves }), ids: r.ids } : { s: t, ids: [end] }
}

/** `unit` as this page shows it becomes the Studio draft and the preview (a built-in unit, or not the draft) — what Edit openings then edits. */
export function makeDraft(unit: Unit, store?: Store): boolean {
  try {
    const s = store ?? localStorage
    s.setItem(DRAFT_KEY, JSON.stringify({ unit }))
    s.setItem(PREVIEW_KEY, JSON.stringify(unit))
    return true
  } catch {
    return false
  }
}

// ── One floor or all (founder 2026-11-20: "change a few designs on just one every duplicate changes"): a project floor whose
// drawing is on other floors too shares that drawing's walls and openings. The first opening edit there asks: this floor
// only — it gets its own copy of the drawing (projects.ts forkFloor) — or every floor with it. Furniture and finishes never
// ask: they are each apartment's own (founder 2026-11-21, data/building/apartments.ts).
export type FloorAnswer = 'one' | 'all'
/** the answer per project, until "Ask again" (Studio → Building list) */
export const FLOOR_ANSWER_KEY = 'plotline.floorAnswer'

export function floorAnswer(projectId: Id, store?: Store): FloorAnswer | undefined {
  try {
    const a = (JSON.parse((store ?? localStorage).getItem(FLOOR_ANSWER_KEY) ?? '{}') as Record<string, unknown>)[projectId]
    return a === 'one' || a === 'all' ? a : undefined
  } catch {
    return undefined
  }
}

export function setFloorAnswer(projectId: Id, a: FloorAnswer | null, store?: Store): void {
  try {
    const s = store ?? localStorage
    const all = JSON.parse(s.getItem(FLOOR_ANSWER_KEY) ?? '{}') as Record<string, FloorAnswer>
    if (a) all[projectId] = a
    else delete all[projectId]
    s.setItem(FLOOR_ANSWER_KEY, JSON.stringify(all))
  } catch {
    /* storage blocked: it asks again */
  }
}

/**
 * What this browser keeps for drawing `from` — its notes, and the furniture and finishes of its apartment on `floor`
 * (that floor's own, else the drawing's: apartments.ts), as itself and mirrored — copied to drawing `to`, a copy for that
 * one floor ("This floor only"). The floor's own record goes with it: floor `floor` is the copy's now.
 */
export function copyKept(from: Id, to: Id, floor?: number, store?: Store): void {
  const s = store ?? localStorage
  for (const m of [false, true]) {
    const [a, b] = [stemOf(from, m), stemOf(to, m)]
    const notes = s.getItem(pinsKey(a))
    if (notes !== null) s.setItem(pinsKey(b), notes)
    for (const key of [layoutKey, finishesKey]) {
      const own = floor === undefined ? null : s.getItem(key(`${a}:${floor}`))
      const v = own ?? s.getItem(key(a))
      if (v !== null) s.setItem(key(b), v)
      if (own !== null) s.removeItem(key(`${a}:${floor}`))
    }
  }
}

/**
 * "This floor only" in the 3D view: floor `k` of the project holding flat `stem` gets its own copy of the drawing, with
 * what copyKept copies. Returns the copy's stem on floor `k` (mirrored when `stem` is), the copy, and the drawing it was
 * copied from; null when the drawing is on no other floor any more, or the browser would not save.
 */
export function forkHere(stem: string, k: number, store?: Store): { stem: string; unit: Unit; from: Id } | null {
  const s = store ?? localStorage
  try {
    const ps = parseProjects(s.getItem(PROJECTS_KEY))
    const sh = sharedAt(ps, stem, k)
    if (!sh) return null
    const id = newId()
    const p = forkFloor(sh.p, k, sh.unitId, id)
    const after = ps.map((x) => (x === sh.p ? p : x))
    copyKept(sh.unitId, id, k, s) // (first: keepApartments may move what is left onto the drawing)
    s.setItem(PROJECTS_KEY, JSON.stringify(after))
    keepApartments(ps, after, s)
    return { stem: stemOf(id, stem !== sh.unitId), unit: p.units[id], from: sh.unitId }
  } catch {
    return null
  }
}

// ── Outside pieces on every floor (qa4fix, problem 5: "Kept for floor 1 only" — nine floors, nine placings). A sunshade, an AC
// outdoor unit, a canopy, a planter (the library's Outside pieces: kit `outdoor`, or hung on an outer face / a cap) placed,
// moved or deleted on a floor whose drawing stands on others too: the 3D view asks once a visit "This floor only / All N
// floors with this drawing"; all = the same change in every other floor's layout (each apartment still its own record).
// The question comes when such a piece is picked up (from the library, or with G), so the first one lands as answered.
export const outsideOf = (p: Pick<FurniturePlacement, 'assetId' | 'outside' | 'onCap'>): boolean => !!(p.outside || p.onCap || kitAsset(p.assetId)?.outdoor)
/** The answer for drawing `id` this visit (sessionStorage: a reload keeps it, a new tab asks again). */
export const OUTSIDE_ANSWER_KEY = 'plotline.outsideAnswer'
export function outsideAnswer(id: Id, store?: Store): FloorAnswer | undefined {
  try {
    const a = (JSON.parse((store ?? sessionStorage).getItem(OUTSIDE_ANSWER_KEY) ?? '{}') as Record<string, unknown>)[id]
    return a === 'one' || a === 'all' ? a : undefined
  } catch {
    return undefined
  }
}
export function setOutsideAnswer(id: Id, a: FloorAnswer, store?: Store): void {
  try {
    const s = store ?? sessionStorage
    s.setItem(OUTSIDE_ANSWER_KEY, JSON.stringify({ ...(JSON.parse(s.getItem(OUTSIDE_ANSWER_KEY) ?? '{}') as object), [id]: a }))
  } catch {
    /* storage blocked: it asks again */
  }
}

/** The outside pieces a committed step changed (`before` → `after`): added, moved, turned, resized, deleted (a tombstone, or gone — an undone add). */
export function outsideChanges(before: FurniturePlacement[], after: FurniturePlacement[]): FurniturePlacement[] {
  const was = new Map(before.map((p) => [p.id, JSON.stringify(p)]))
  const now = new Set(after.map((p) => p.id))
  return [
    ...after.filter((p) => outsideOf(p) && was.get(p.id) !== JSON.stringify(p)),
    ...before.filter((p) => outsideOf(p) && !p.removed && !now.has(p.id)).map((p) => ({ ...p, removed: true as const })),
  ]
}

/** Layout `pieces` with the outside pieces `changed` as they are now: each replaces its own (same id), a new one joins, a deleted one never placed here is not added. */
export const withOutside = (pieces: FurniturePlacement[], changed: FurniturePlacement[]): FurniturePlacement[] => {
  const by = new Map(changed.map((p) => [p.id, p]))
  const have = new Set(pieces.map((p) => p.id))
  return [...pieces.map((p) => by.get(p.id) ?? p), ...changed.filter((p) => !have.has(p.id) && !p.removed)]
}

/**
 * "All N floors with this drawing": drawing `u` (its `rooms`) on every floor of tower `t` but `here` takes the outside pieces
 * `changed` — into that floor's layout as it opens (its own, else the drawing's, else the presets: layoutFor), kept as that
 * floor's own. The floors written.
 */
export function outsideOnEveryFloor(u: Unit, rooms: Room[], changed: FurniturePlacement[], t: Pick<Tower, 'FLATS' | 'FLOORS' | 'LEVELS'>, here: number, store?: Store): number[] {
  const floors = placesIn(t, u.id).filter((k) => k !== here)
  for (const k of floors) {
    const kept = keptAt(u, k, t, store)
    const base = layoutFor(kept.base ? { ...u, furniture: kept.base } : u, rooms)
    const now = kept.layout ? layoutFor({ ...u, furniture: kept.layout }, rooms) : base
    saveLayout(kept.key, withOutside(now, changed), base, store)
  }
  return floors
}

/**
 * A balcony's edge clicked on the tower in the Building view (qa4fix: a glass front took ~6 clicks through Edit ▾ →
 * Openings): low wall `wallId` of the drawing flat `stem` stands in on floor `k` made of `patch` (the Studio's one reducer,
 * 'low-wall') — in the drawing itself, so on every floor it stands on, or (`one`, "This floor only") in a copy of it for
 * floor `k` alone (forkHere). Kept in the project, and in the Studio draft and preview when they hold that drawing (else the
 * Studio would write the old one back). Returns the drawing as it is now and its stem on floor `k`; null when `stem` is no
 * project flat, the wall takes no Made of, or the browser would not save.
 */
export function madeOfOnTower(stem: string, k: number, wallId: Id, patch: { kind?: LowWallKind | 'solid'; cornice?: boolean; color?: RailColor | null }, one: boolean, store?: Store): { unit: Unit; stem: string } | null {
  const s = store ?? localStorage
  try {
    let ps = parseProjects(s.getItem(PROJECTS_KEY))
    let at = stem
    let id = ps.find((x) => x.flats[stem])?.flats[stem].unitId
    if (!id) return null
    if (one) {
      const f = forkHere(stem, k, s)
      if (f) ((at = f.stem), (id = f.unit.id), (ps = parseProjects(s.getItem(PROJECTS_KEY))))
    }
    const u = ps.find((x) => x.units[id!])?.units[id]
    const w = u?.walls.find((x) => x.id === wallId)
    if (!u || !w || !takesLowKind(w)) return null
    const v = reducer({ ...initialState(), unit: u }, { type: 'low-wall', ids: [wallId], ...patch }).unit
    const synced = syncUnit(ps, v)
    if (synced) s.setItem(PROJECTS_KEY, JSON.stringify(synced))
    for (const key of [DRAFT_KEY, PREVIEW_KEY]) {
      const d: unknown = JSON.parse(s.getItem(key) ?? 'null')
      const du = unitIn(d)
      if (!du || !holds(d, du, id)) continue
      const x = { ...du, walls: du.walls.map((q) => (q.id === wallId ? v.walls.find((y) => y.id === wallId)! : q)) }
      s.setItem(key, JSON.stringify(isUnit(d) ? x : { ...(d as object), unit: x }))
    }
    return { unit: v, stem: at }
  } catch {
    return null
  }
}
