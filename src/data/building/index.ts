/** The towers the Building view knows: the ones built in, and the projects made in the Studio (this browser). */
import * as core from '../../core'
import type { Pt, Room, Unit } from '../../core'
import * as banani from './banani-tower'
import * as bti from './demo-tower'
import * as dmd from './dmd-tower'
import { PROJECTS_KEY, parseProjects, projectTower } from './projects'
import * as sheltech from './sheltech-tower'

/**
 * A built-in tower module's shape; LEVELS: the stems of its traced ground floor / basements / rooftop (stand-ins on
 * their own floors in FLOORS) and the floor each stands on.
 */
export type Tower = typeof bti & { LEVELS?: Record<string, number> }

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
 * and adds only ledges (a sunshade planter 20 m up is no soffit over the drive). [] for a flat (its Look roofs it) and
 * for the rooftop (open sky). Studio project towers get the same.
 */
export function coverOf(t: Tower, stem: string): Pt[][] {
  const k = t.LEVELS?.[stem]
  if (k === undefined) return []
  const me = t.FLATS[stem].offset
  const top = topFloor(t)
  const above = new Set(t.FLOORS.filter((f) => f.floor > k && f.floor <= top).flatMap((f) => [...f.flats, ...(f.standIns ?? [])]))
  return [...above].flatMap((s) => {
    const { unit, offset } = t.FLATS[s]
    const rooms = core.deriveRooms(unit)
    const base = baseLevel(unit, rooms)
    return rooms
      .filter((r) => r.kind !== 'shaft' && lowestOf(r) >= base - 1e-6)
      .map((r) => core.roomPolygon(r, unit).map((p) => ({ x: p.x + offset.x - me.x, y: p.y + offset.y - me.y })))
  })
}
