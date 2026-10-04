/**
 * Whole-building projects made in the Studio (founder 2026-10-04: "we have the drawings of whole projects … I cannot
 * duplicate types and create the whole building"). Stage 1: floors of traced flats. A Project is what the Studio saves
 * in this browser (`plotline.projects`, like the draft); `projectTower` turns it into the same Tower the Building view
 * draws for the two built-in towers (demo-tower.ts / sheltech-tower.ts), so nothing downstream knows the difference.
 *
 * Frame: the building frame is the plan frame the flats were traced in (flats auto-traced from one sheet share it:
 * offset 0); a flat placed elsewhere carries its offset. A mirrored neighbour is the flat reflected about its own west
 * or east wall line (core mirrorUnit, ids + `-m`) — so a unit stands at most once as itself and once mirrored.
 * Pure: storage is read / written only by the helpers at the bottom.
 */
import { deriveRooms, mirrorUnit, roomPolygon, unitBounds } from '../../core'
import type { Id, Pillar, Pt, Unit } from '../../core'
import { FLOOR_M, type Rect } from './demo-tower'
import type { Tower } from './index'

export const PROJECTS_KEY = 'plotline.projects'

/**
 * One flat's place: the traced unit — reflected about its own left / right wall line first when `mirror` is set (taken
 * from the unit as it is now: an edited outer wall moves the axis with it) — then moved by `offset` (building frame).
 */
export interface ProjectFlat {
  unitId: Id
  offset: Pt
  mirror?: 'left' | 'right'
}

export interface Project {
  id: Id
  name: string
  /** the traced flats (and levels) as the Studio last saved them */
  units: Record<Id, Unit>
  /** by stem: the unit's id, its mirrored copy's `<id>-m` (= mirrorUnit's id, so a stem is always its unit's id) */
  flats: Record<string, ProjectFlat>
  /** "repeat this floor on floors from–to": the flats (stems) standing on each of those floors */
  floors: { from: number; to: number; flats: string[] }[]
  /** stage 2: the ground, basements and rooftop he traced, drawn as shells (no furnishing); absent in older projects */
  levels?: ProjectLevel[]
}

/**
 * A level besides the flats: the ground floor (floor 0), basement n (floor −n), a common floor on floor n among the flats
 * (a community / gym level, the built-in Sheltech Level 1: it takes that floor's place), the rooftop (on the roof slab, top + 1).
 */
export type LevelKind = 'ground' | 'basement' | 'common' | 'rooftop'
/** how a level's offset was found (the Studio says which): its columns on the flats', the same drawing, or typed by him */
export type Placement = 'columns' | 'drawing' | 'typed'
export interface ProjectLevel {
  unitId: Id
  kind: LevelKind
  /** basements: 1 = the first below ground; a common floor: its floor number */
  n?: number
  /** the level's plan frame → the building frame */
  offset: Pt
  by: Placement
}

/** where the mirrored copy goes: none, or reflected about the flat's own left (west on the plan) / right wall line */
export type Neighbour = 'none' | 'left' | 'right'

export const stemOf = (unitId: Id, mirrored: boolean): string => (mirrored ? `${unitId}-m` : unitId)

/** The flat's extent: its closed rooms' centre-line outline (a stray line traced past the flat does not count), else every corner. */
export function flatBounds(u: Unit): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = deriveRooms(u).flatMap((r) => roomPolygon(r, u))
  if (!pts.length) return unitBounds(u)
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

/** The flats on floor k (stems that resolve), in order. */
const onFloor = (p: Project, k: number): string[] => [...new Set(p.floors.filter((g) => g.from <= k && k <= g.to).flatMap((g) => g.flats))].filter((s) => p.flats[s] && p.units[p.flats[s].unitId])

/**
 * `u` placed in `p` on floors from–to (replacing where it stood before: editing = placing again), with its mirrored
 * neighbour or none; groups with the same floors merge. The unit is stored as it is now.
 */
export function placeFlat(p: Project, u: Unit, from: number, to: number, neighbour: Neighbour, offset: Pt = { x: 0, y: 0 }): Project {
  const lo = Math.max(1, Math.round(Math.min(from, to)))
  const hi = Math.max(lo, Math.round(Math.max(from, to)))
  const out = removeFlat(p, u.id) ?? { ...p, units: {}, flats: {}, floors: [] }
  const stems = [stemOf(u.id, false), ...(neighbour === 'none' ? [] : [stemOf(u.id, true)])]
  const flats: Record<string, ProjectFlat> = { ...out.flats, [stems[0]]: { unitId: u.id, offset } }
  if (neighbour !== 'none') flats[stems[1]] = { unitId: u.id, offset, mirror: neighbour }
  const same = out.floors.find((g) => g.from === lo && g.to === hi)
  const floors = same ? out.floors.map((g) => (g === same ? { ...g, flats: [...g.flats, ...stems] } : g)) : [...out.floors, { from: lo, to: hi, flats: stems }]
  return { ...out, units: { ...out.units, [u.id]: u }, flats, floors: floors.sort((g, q) => g.from - q.from) }
}

/** A new project: this flat (and its mirrored neighbour) on floors from–to. */
export function makeProject(id: Id, u: Unit, from: number, to: number, neighbour: Neighbour): Project {
  return placeFlat({ id, name: u.projectName.trim() || u.name.trim() || 'Building', units: {}, flats: {}, floors: [] }, u, from, to, neighbour)
}

/** `p` without unit `unitId` (and its mirrored copy); null when no flat is left. */
export function removeFlat(p: Project, unitId: Id): Project | null {
  const gone = new Set([stemOf(unitId, false), stemOf(unitId, true)])
  const flats = Object.fromEntries(Object.entries(p.flats).filter(([s]) => !gone.has(s)))
  if (!Object.keys(flats).length) return null
  const units = Object.fromEntries(Object.entries(p.units).filter(([id]) => id !== unitId))
  const floors = p.floors.map((g) => ({ ...g, flats: g.flats.filter((s) => !gone.has(s)) })).filter((g) => g.flats.length)
  return { ...p, units, flats, floors }
}

/** Where `unitId` stands in `p`: its floors and neighbour (for the Studio's form), or null. */
export function placementOf(p: Project, unitId: Id): { from: number; to: number; neighbour: Neighbour; offset: Pt } | null {
  const f = p.flats[stemOf(unitId, false)]
  const g = p.floors.find((x) => x.flats.includes(stemOf(unitId, false)))
  if (!f || !g) return null
  return { from: g.from, to: g.to, neighbour: p.flats[stemOf(unitId, true)]?.mirror ?? 'none', offset: f.offset }
}

/**
 * Where a flat traced from the same drawing as the building's first flat lands in the building frame (founder: both
 * Sheltech flats are auto-traced off one Level 2 sheet, each draft with its own metre origin and its own read of the
 * scale): the flat's centre goes through the drawing's pixels into the first flat's metres (a scale read 1 % apart
 * moves its far walls by centimetres, not its middle), plus that flat's own offset. {0, 0} for another drawing, or
 * scales more than 5 % apart (one of the two is wrong) — the flat keeps its own frame.
 */
export function sheetOffset(p: Project, u: Unit): Pt {
  return sameDrawing(p, u) ?? { x: 0, y: 0 }
}

/** sheetOffset, or null when `u` was not traced off the building's first flat's drawing (another image, or scales > 5 % apart). */
function sameDrawing(p: Project, u: Unit): Pt | null {
  const ref = Object.values(p.flats).find((f) => !f.mirror && f.unitId !== u.id && p.units[f.unitId])
  const a = ref && p.units[ref.unitId].planImage
  const b = u.planImage
  if (!ref || !a || !b || a.src !== b.src || Math.abs(a.pxPerM - b.pxPerM) > a.pxPerM * 0.05) return null
  const fb = flatBounds(u)
  const c = { x: (fb.minX + fb.maxX) / 2, y: (fb.minY + fb.maxY) / 2 }
  const px = { x: b.originPx.x + c.x * b.pxPerM, y: b.originPx.y + c.y * b.pxPerM }
  return { x: ref.offset.x + (px.x - a.originPx.x) / a.pxPerM - c.x, y: ref.offset.y + (px.y - a.originPx.y) / a.pxPerM - c.y }
}

/** a level's column lands on a flat's column when their centres are this close after the shift (m) and their sizes this alike */
const COLUMN_TOL_M = 0.25
/** fewer matched columns than this is chance on a column grid, not an alignment */
export const MIN_COLUMNS = 3

/**
 * The shift that puts the most of `mine` (a level's columns, its own frame) on `ref` (the flats' columns, building
 * frame): every pair proposes one; the one matching the most columns wins (ties: the tighter fit), refined to the mean
 * of its matched pairs. Columns run down through every level, so a traced ground floor / basement / rooftop finds the
 * flats' columns this way whatever its own drawing's origin. Translation only: a level is traced the way up its flats are.
 */
export function alignColumns(ref: Pillar[], mine: Pillar[]): { offset: Pt; matched: number; errM: number } | null {
  let best: { offset: Pt; matched: number; errM: number } | null = null
  const alike = (a: Pillar, b: Pillar) => Math.abs(a.wM - b.wM) <= 0.15 && Math.abs(a.hM - b.hM) <= 0.15
  const fit = (d: Pt) => {
    const pairs = mine.flatMap((q) => {
      const r = ref.filter((x) => alike(x, q)).reduce<{ x: Pillar; e: number } | null>((b, x) => {
        const e = Math.hypot(q.x + d.x - x.x, q.y + d.y - x.y)
        return e <= COLUMN_TOL_M && (!b || e < b.e) ? { x, e } : b
      }, null)
      return r ? [{ q, x: r.x }] : []
    })
    if (!pairs.length) return null
    const offset = { x: pairs.reduce((s, p) => s + p.x.x - p.q.x, 0) / pairs.length, y: pairs.reduce((s, p) => s + p.x.y - p.q.y, 0) / pairs.length }
    const errM = Math.sqrt(pairs.reduce((s, p) => s + (p.q.x + offset.x - p.x.x) ** 2 + (p.q.y + offset.y - p.x.y) ** 2, 0) / pairs.length)
    return { offset, matched: pairs.length, errM }
  }
  for (const r of ref)
    for (const q of mine) {
      if (!alike(r, q)) continue
      const f = fit({ x: r.x - q.x, y: r.y - q.y })
      if (f && (!best || f.matched > best.matched || (f.matched === best.matched && f.errM < best.errM))) best = f
    }
  return best && best.matched >= MIN_COLUMNS ? best : null
}

/**
 * Where a traced level goes in `p`: on the flats' columns when at least MIN_COLUMNS of its columns match theirs (the
 * lowest floor's flats, mirrored ones too), else where the same drawing puts it, else null — he types the shift.
 */
export function placeOfLevel(p: Project, u: Unit): { offset: Pt; by: Exclude<Placement, 'typed'>; matched?: number; errM?: number } | null {
  const t = projectTower(p)
  const base = t.FLOORS.find((f) => f.floor >= 1 && f.flats.length)?.flats ?? []
  const ref = base.flatMap((s) => (t.FLATS[s].unit.pillars ?? []).map((q) => ({ ...q, x: q.x + t.FLATS[s].offset.x, y: q.y + t.FLATS[s].offset.y })))
  const cols = ref.length && u.pillars?.length ? alignColumns(ref, u.pillars) : null
  if (cols) return { offset: cols.offset, by: 'columns', matched: cols.matched, errM: cols.errM }
  const d = sameDrawing(p, u)
  return d ? { offset: d, by: 'drawing' } : null
}

/** The floor a level stands on: ground 0, basement n at −n, a common floor on floor n, the rooftop on the roof slab above floor `top`. */
export const levelFloor = (l: Pick<ProjectLevel, 'kind' | 'n'>, top: number): number =>
  l.kind === 'ground' ? 0 : l.kind === 'basement' ? -Math.max(1, l.n ?? 1) : l.kind === 'common' ? Math.max(1, l.n ?? 1) : top + 1
/** levels numbered by `n` (one per number): basements and common floors */
const numbered = (kind: LevelKind): boolean => kind === 'basement' || kind === 'common'

/** `p` with only the units its flats and levels use. */
const prune = (p: Project): Project => {
  const used = new Set([...Object.values(p.flats).map((f) => f.unitId), ...(p.levels ?? []).map((l) => l.unitId)])
  return { ...p, units: Object.fromEntries(Object.entries(p.units).filter(([id]) => used.has(id))) }
}

/**
 * `u` as the building's ground floor / basement n / common floor n / rooftop, at `offset` (found `by`). It leaves the
 * flats if it stood there, and takes the place of the level already in that slot (one ground, one rooftop, one basement
 * or common floor per number). The unit is stored as it is now. Unchanged when it is the building's only flat (a building needs one).
 */
export function placeLevel(p: Project, u: Unit, kind: LevelKind, n: number | undefined, offset: Pt, by: Placement): Project {
  const out = p.flats[stemOf(u.id, false)] ? removeFlat(p, u.id) : p
  if (!out) return p
  const k = Math.max(1, Math.round(n ?? 1))
  const slot = (l: ProjectLevel) => l.kind === kind && (!numbered(kind) || (l.n ?? 1) === k)
  const levels = (out.levels ?? []).filter((l) => l.unitId !== u.id && !slot(l))
  const level: ProjectLevel = { unitId: u.id, kind, ...(numbered(kind) ? { n: k } : {}), offset, by }
  return prune({ ...out, units: { ...out.units, [u.id]: u }, levels: [...levels, level] })
}

/** `p` without level `unitId`. */
export const removeLevel = (p: Project, unitId: Id): Project => prune({ ...p, levels: (p.levels ?? []).filter((l) => l.unitId !== unitId) })

/** The level `unitId` is in `p`, if it is one. */
export const levelOf = (p: Project, unitId: Id): ProjectLevel | undefined => p.levels?.find((l) => l.unitId === unitId)

/** `ps` with `u` as it is now wherever it stands (the Studio's autosave); null when nothing changed. */
export function syncUnit(ps: Project[], u: Unit): Project[] | null {
  const now = JSON.stringify(u)
  let changed = false
  const out = ps.map((p) => {
    if (!p.units[u.id] || JSON.stringify(p.units[u.id]) === now) return p
    changed = true
    return { ...p, units: { ...p.units, [u.id]: u } }
  })
  return changed ? out : null
}

/** The Building view's tower for `p`: the same shape as the built-in towers. */
export function projectTower(p: Project): Tower {
  const FLATS = Object.fromEntries(
    Object.entries(p.flats)
      .filter(([, f]) => p.units[f.unitId])
      .map(([stem, f]) => {
        const u = p.units[f.unitId]
        const b = f.mirror && flatBounds(u)
        return [stem, { unit: b ? mirrorUnit(u, f.mirror === 'left' ? b.minX : b.maxX) : u, offset: f.offset }]
      }),
  )
  const top = Math.max(0, ...p.floors.map((g) => g.to))
  const lowest = [...Array(top)].map((_, i) => i + 1).find((k) => onFloor(p, k).length) ?? 1
  const base = onFloor(p, lowest)
  // stage 2: his traced levels on their own floors (a common floor only under the top flats: the top floor carries the roof)
  const levels = (p.levels ?? []).filter((l) => p.units[l.unitId] && (l.kind !== 'common' || levelFloor(l, top) < top))
  const common = new Map(levels.filter((l) => l.kind === 'common').map((l) => [levelFloor(l, top), l.unitId]))
  // floors 1..top; a common floor takes its floor's place; a floor without flats (below the first one listed, or a gap)
  // stands in with the nearest listed floor below it, else above
  const FLOORS: Tower['FLOORS'] = []
  for (let k = 1; k <= top; k++) {
    const flats = onFloor(p, k)
    let near = k
    while (near > 0 && !onFloor(p, near).length) near--
    const c = common.get(k)
    FLOORS.push(c ? { floor: k, flats: [], standIns: [c] } : flats.length ? { floor: k, flats } : { floor: k, flats: [], standIns: near > 0 ? onFloor(p, near) : base })
  }
  for (const l of levels) FLATS[l.unitId] = { unit: p.units[l.unitId], offset: l.offset }
  const LEVELS = Object.fromEntries(levels.map((l) => [l.unitId, levelFloor(l, top)]))
  const ground = levels.find((l) => l.kind === 'ground')
  // the ground: his traced ground floor; else the lowest flats' columns carry the tower and a flat with no column drawn
  // stands in with its shell (never a floating flat)
  const columns: Rect[] = ground
    ? []
    : base.flatMap((s) => {
        const { unit, offset: o } = FLATS[s]
        return (unit.pillars ?? []).map((q): Rect => [q.x - q.wM / 2 + o.x, q.y - q.hM / 2 + o.y, q.x + q.wM / 2 + o.x, q.y + q.hM / 2 + o.y])
      })
  const shells = ground ? [ground.unitId] : base.filter((s) => !FLATS[s].unit.pillars?.length)
  if (shells.length) FLOORS.unshift({ floor: 0, flats: [], standIns: shells })
  for (const b of levels.filter((l) => l.kind === 'basement').sort((l, m) => (l.n ?? 1) - (m.n ?? 1))) FLOORS.unshift({ floor: LEVELS[b.unitId], flats: [], standIns: [b.unitId] })
  const roof = levels.find((l) => l.kind === 'rooftop')
  if (roof) FLOORS.push({ floor: top + 1, flats: [], standIns: [roof.unitId] })
  // the plot: the flats' (and his ground floor's) extent and 2 m round it
  const bs = [...base, ...(ground ? [ground.unitId] : [])].map((s) => {
    const b = flatBounds(FLATS[s].unit)
    const o = FLATS[s].offset
    return [b.minX + o.x, b.minY + o.y, b.maxX + o.x, b.maxY + o.y]
  })
  const [x0, y0, x1, y1] = [Math.min(...bs.map((b) => b[0])) - 2, Math.min(...bs.map((b) => b[1])) - 2, Math.max(...bs.map((b) => b[2])) + 2, Math.max(...bs.map((b) => b[3])) + 2]
  const plot: Pt[] = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  return { FLOOR_M, FLATS, FLOORS, CORE: [], GROUND: { plot, roads: [], gardens: [], ramp: [], bays: [], blocks: [], columns }, ROOF: { gardens: [], tanks: [] }, LEVELS }
}

/** A stored project list, shape-checked (a corrupt store reads as none). */
export function parseProjects(raw: string | null): Project[] {
  try {
    const ps = JSON.parse(raw ?? '[]') as unknown
    if (!Array.isArray(ps)) return []
    return ps.filter(
      (p): p is Project =>
        !!p &&
        typeof p.id === 'string' &&
        typeof p.units === 'object' &&
        Object.values(p.units as Record<string, Unit>).every((u) => Array.isArray(u?.vertices) && Array.isArray(u?.walls) && Array.isArray(u?.roomLabels)) &&
        typeof p.flats === 'object' &&
        Array.isArray(p.floors) &&
        (p.levels === undefined || Array.isArray(p.levels)),
    )
  } catch {
    return []
  }
}

export function readProjects(): Project[] {
  try {
    return parseProjects(localStorage.getItem(PROJECTS_KEY))
  } catch {
    return [] // no storage (tests, blocked)
  }
}

/** false when the browser refused (storage full / blocked) */
export function saveProjects(ps: Project[]): boolean {
  try {
    if (ps.length) localStorage.setItem(PROJECTS_KEY, JSON.stringify(ps))
    else localStorage.removeItem(PROJECTS_KEY)
    return true
  } catch {
    return false
  }
}
