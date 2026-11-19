/** The towers the Building view knows: the ones built in, and the projects made in the Studio (this browser). */
import * as core from '../../core'
import type { Pt, Room, Unit } from '../../core'
import { isStairRoom } from '../../furnish/stairs'
import * as banani from './banani-tower'
import * as bti from './demo-tower'
import * as dmd from './dmd-tower'
import { PROJECTS_KEY, parseProjects, projectTower } from './projects'
import * as sheltech from './sheltech-tower'

/**
 * A built-in tower module's shape; LEVELS: the stems of its traced ground floor / basements / rooftop (stand-ins on
 * their own floors in FLOORS) and the floor each stands on; ELEVATIONS: an imported building's floor heights by floor
 * number (m above the lowest floor; a floor not listed stands at floor × FLOOR_M).
 */
export type Tower = typeof bti & { LEVELS?: Record<string, number>; ELEVATIONS?: Record<number, number> }

const TOWERS: Tower[] = [bti, sheltech, banani, dmd]

let made: { raw: string | null; towers: Tower[] } = { raw: null, towers: [] }
/** The Studio's projects as towers, rebuilt only when the stored list changes (the same objects otherwise). */
export function projectTowers(): Tower[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(PROJECTS_KEY)
  } catch {
    /* no storage (tests, blocked): none */
  }
  if (raw !== made.raw) made = { raw, towers: parseProjects(raw).map(projectTower) }
  return made.towers
}

/**
 * The tower that holds this unit (by id) — as a flat, a level or a stand-in shell — or null: no Building view. A
 * project made in the Studio comes first: a flat the founder built a building from shows his building, also for a
 * built-in unit.
 */
export const towerOf = (unit: Unit, towers: Tower[] = [...projectTowers(), ...TOWERS]): Tower | null =>
  towers.find((t) => Object.values(t.FLATS).some((f) => f.unit.id === unit.id)) ?? null

/** `/u/<stem>` of a flat or level in a Studio project (a click on it in the Building view), or null. */
export const projectUnit = (stem: string): Unit | null => projectTowers().find((t) => t.FLATS[stem])?.FLATS[stem].unit ?? null

/** The unit's stem in tower `t`. */
export const stemIn = (t: Tower, unit: Unit): string | undefined => Object.keys(t.FLATS).find((s) => t.FLATS[s].unit.id === unit.id)

/**
 * The floor a unit stands on in its tower: a level's own floor; a flat on `floor` when it is listed there, else the
 * first floor listing it; a stand-in shell the first floor it stands in for.
 */
export const floorIn = (t: Tower, stem: string, floor?: number): number =>
  t.LEVELS?.[stem] ??
  t.FLOORS.find((f) => f.floor === floor && f.flats.includes(stem))?.floor ??
  t.FLOORS.find((f) => f.flats.includes(stem))?.floor ??
  t.FLOORS.find((f) => f.standIns?.includes(stem))?.floor ??
  floor ??
  2

/** What a unit is in its tower: a flat (opened, furnished), a level (ground / basement / rooftop: walked), or massing only (a stand-in shell nobody opens). */
export const roleIn = (t: Tower, stem: string): 'flat' | 'level' | 'massing' =>
  t.LEVELS?.[stem] !== undefined ? 'level' : t.FLOORS.some((f) => f.flats.includes(stem)) ? 'flat' : 'massing'

/**
 * The top floor of the tower's flats and massing (never its levels): the roof slab sits on it, a rooftop level one
 * floor higher. 0 for a tower of levels only.
 */
export const topFloor = (t: Tower): number =>
  Math.max(0, ...t.FLOORS.filter((f) => [...f.flats, ...(f.standIns ?? [])].some((s) => t.LEVELS?.[s] === undefined)).map((f) => f.floor))

/** A level's name by its floor in tower `t`: Basement n, Ground floor, Level k (a common floor among the flats), Rooftop. */
export const levelName = (t: Tower, k: number): string => (k < 0 ? `Basement ${-k}` : k === 0 ? 'Ground floor' : k > topFloor(t) ? 'Rooftop' : `Level ${k}`)

/** plan m, x0 < x1, y0 < y1 */
type Box = { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Where a building stands, in its unit's plan frame: what context.ts lays the made-up street round (neighbours a few
 * metres off, a road along one or two sides). With only `walls` (a flat of no tower): its own walls' box.
 */
export interface Street {
  /** the box of the building's walls: what its windows look out of */
  walls: Box
  /** its plot: no neighbour on it, a road along its edge */
  plot?: Box
  /** the drawing's roads; none: one or two are made up */
  roads?: Box[]
  /** its storeys over the street (the neighbours: ± 2) */
  storeys?: number
  /** one made-up street for the whole building: every flat of it sees the same */
  seed?: string
}

/**
 * Tower t's street (Street) in the plan frame of its unit `stem`, the same for the walk and the Building view: the box of
 * its flats and upper levels (floor 1 up), its plot, the drawing's roads, its storeys (the ground floor to the top floor).
 */
export function streetOf(t: Tower, stem: string): Street {
  const o = t.FLATS[stem].offset
  const box = (pts: Pt[]): Box => ({
    minX: Math.min(...pts.map((p) => p.x)) - o.x,
    minY: Math.min(...pts.map((p) => p.y)) - o.y,
    maxX: Math.max(...pts.map((p) => p.x)) - o.x,
    maxY: Math.max(...pts.map((p) => p.y)) - o.y,
  })
  const up = new Set(t.FLOORS.filter((f) => f.floor >= 1).flatMap((f) => [...f.flats, ...(f.standIns ?? [])]))
  const pts = [...up].flatMap((s) => t.FLATS[s].unit.vertices.map((v) => ({ x: v.x + t.FLATS[s].offset.x, y: v.y + t.FLATS[s].offset.y })))
  const plot = box(t.GROUND.plot)
  return {
    walls: pts.length ? box(pts) : plot,
    plot,
    roads: t.GROUND.roads.map(([x0, y0, x1, y1]) => box([{ x: x0, y: y0 }, { x: x1, y: y1 }])),
    storeys: topFloor(t) + 1,
    seed: Object.keys(t.FLATS)[0],
  }
}

/** The lowest floor of a face (m from its unit's datum): a ramp's lower end. */
const lowestOf = (r: Room): number => Math.min(r.levelM ?? 0, r.slope?.toLevelM ?? r.levelM ?? 0)

/**
 * Where a unit's walking floor starts (m from its datum): the floor just inside its lowest GATE — an opening (not a
 * window) with no face on one side, i.e. from outside the traced level into it (the street at a ground floor's gate,
 * Banani's −1.5 m under the reception's ±0) — else 0 (a basement, a flat, a typical floor: no gate).
 */
export function baseLevel(unit: Unit, rooms: Room[]): number {
  let base = 0
  for (const w of unit.walls) {
    const f = core.wallFrame(w, unit.vertices)
    for (const o of w.openings) {
      if (o.kind === 'window') continue
      const c = { x: f.origin.x + f.dir.x * (o.offsetM + o.widthM / 2), y: f.origin.y + f.dir.y * (o.offsetM + o.widthM / 2) }
      const off = w.thicknessM / 2 + 0.05
      const [a, b] = [1, -1].map((s) => {
        const p = { x: c.x + f.normal.x * off * s, y: c.y + f.normal.y * off * s }
        return { p, r: core.roomAt(p, rooms, unit) }
      })
      const inside = !a.r ? b : !b.r ? a : null
      if (inside?.r) base = Math.min(base, core.roomLevelAt(inside.r, unit, c.x, c.y)) // a ramp's level at the gate's line
    }
  }
  return base
}

/**
 * The slab over level `stem` (PlotlineScene.cover), in the level's own plan frame: the faces of what stands on the floors
 * above it (their units and stand-ins, each once, building frame → this level's frame) — but shafts (open to the sky)
 * and faces whose floor drops below that unit's base (baseLevel: a ramp going down through its slab is the void over
 * the level below; a ramp of that level rising into it passes up through it). Every floor above, not only the next: a
 * ground floor's porch under flats that overhang a smaller level 1 is under a slab, so is a basement-2 ramp under the
 * basement-1 ramp's void under the ground's lawn — up to the top floor: a rooftop level stands on the top floor's slab
 * and adds only ledges (a sunshade planter 20 m up is no soffit over the drive). [] for the rooftop (open sky). Studio
 * project towers get the same.
 * A flat on `floor` (founder 2026-11-20: "a gap in the ceiling that is supposed to be covered by the floor above is getting
 * sunlight in"): the same, the top floor under the rooftop's floor too, but only the faces over its own rooms — a
 * neighbour's slab would float outside its windows. No floor given: [] (its Look roofs it, small verandas open).
 */
export function coverOf(t: Tower, stem: string, floor?: number): Pt[][] {
  const level = t.LEVELS?.[stem]
  const k = level ?? floor
  if (k === undefined) return []
  const me = t.FLATS[stem].offset
  const top = topFloor(t)
  const last = level === undefined ? Math.max(top, k + 1) : top
  const above = new Set(t.FLOORS.filter((f) => f.floor > k && f.floor <= last).flatMap((f) => [...f.flats, ...(f.standIns ?? [])]))
  const cover = [...above].flatMap((s) => {
    const { unit, offset } = t.FLATS[s]
    const rooms = core.deriveRooms(unit)
    const sinks = sinking(unit, rooms)
    return rooms.filter((r) => r.kind !== 'shaft' && !sinks(r)).map((r) => core.roomPolygon(r, unit).map((p) => ({ x: p.x + offset.x - me.x, y: p.y + offset.y - me.y })))
  })
  if (level !== undefined) return cover
  const { unit } = t.FLATS[stem]
  const mine = core.deriveRooms(unit).map((r) => ({ c: r.centroid, poly: core.roomPolygon(r, unit) }))
  return cover.filter((c) => mine.some((m) => core.pointInPolygon(m.c, c) || core.pointInPolygon(core.polygonCentroid(c), m.poly)))
}

/** Does a face's floor drop below its unit's base (a ramp going down through the slab to the level below)? */
const sinking = (unit: Unit, rooms: Room[]) => {
  const base = baseLevel(unit, rooms)
  return (r: Room) => lowestOf(r) < base - 1e-6
}

/**
 * The voids in the slab over floor k, building frame: the faces on floor k + 1 that drop below their unit's base (a ramp
 * going down). The Building view draws such a ramp once: the upper level's face wins, a face of floor k rising into the
 * void (the same ramp on the lower sheet) is skipped.
 */
export function voidsOver(t: Tower, k: number): Pt[][] {
  const f = t.FLOORS.find((x) => x.floor === k + 1)
  return (f ? [...f.flats, ...(f.standIns ?? [])] : []).flatMap((s) => {
    const { unit, offset } = t.FLATS[s]
    const rooms = core.deriveRooms(unit)
    const sinks = sinking(unit, rooms)
    return rooms.filter(sinks).map((r) => core.roomPolygon(r, unit).map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })))
  })
}

/**
 * Where a stair leads (founder 2026-11-20: climbing a stair must reach the floor above): from unit `stem` on floor `k`, at
 * plan point `at` (its own frame: the stair), one floor `dir` (+1 up, −1 down) — the unit on that floor with a stair room
 * at that point (its flats first, then its levels and stand-ins; else the nearest stair room, its middle within 3 m) and
 * the point in that unit's frame. null: no floor there, or no stair on it.
 */
export function stairTo(t: Tower, stem: string, k: number, at: Pt, dir: 1 | -1): { stem: string; floor: number; at: Pt } | null {
  const f = t.FLOORS.find((x) => x.floor === k + dir)
  const me = t.FLATS[stem]?.offset
  if (!f || !me) return null
  let best: { d: number; stem: string; at: Pt } | null = null
  for (const s of [...f.flats, ...(f.standIns ?? [])]) {
    const { unit, offset } = t.FLATS[s]
    const p = { x: at.x + me.x - offset.x, y: at.y + me.y - offset.y }
    for (const r of core.deriveRooms(unit).filter(isStairRoom)) {
      const d = core.pointInPolygon(p, core.roomPolygon(r, unit)) ? 0 : Math.hypot(r.centroid.x - p.x, r.centroid.y - p.y)
      if (d <= 3 && (!best || d < best.d)) best = { d, stem: s, at: p }
    }
  }
  return best && { stem: best.stem, floor: k + dir, at: best.at }
}
