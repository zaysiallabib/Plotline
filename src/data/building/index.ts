/** The towers the Building view knows: the two built in, and the projects made in the Studio (this browser). */
import type { Unit } from '../../core'
import * as bti from './demo-tower'
import { PROJECTS_KEY, parseProjects, projectTower } from './projects'
import * as sheltech from './sheltech-tower'

export type Tower = typeof bti

const TOWERS: Tower[] = [bti, sheltech]

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
 * The tower whose FLATS hold this unit (by id), or null: no Building view. A project made in the Studio comes first:
 * a flat the founder built a building from shows his building, also for a built-in unit.
 */
export const towerOf = (unit: Unit, towers: Tower[] = [...projectTowers(), ...TOWERS]): Tower | null =>
  towers.find((t) => Object.values(t.FLATS).some((f) => f.unit.id === unit.id)) ?? null

/** `/u/<stem>` of a flat in a Studio project (a click on it in the Building view), or null. */
export const projectUnit = (stem: string): Unit | null => projectTowers().find((t) => t.FLATS[stem])?.FLATS[stem].unit ?? null

/** The floor a flat stands on in its tower: `floor` when it is listed there, else the first floor that lists it. */
export const floorIn = (t: Tower, stem: string, floor?: number): number =>
  t.FLOORS.find((f) => f.floor === floor && f.flats.includes(stem))?.floor ?? t.FLOORS.find((f) => f.flats.includes(stem))?.floor ?? floor ?? 2
