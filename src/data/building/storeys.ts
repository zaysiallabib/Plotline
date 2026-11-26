/**
 * A building's storeys (session 31, Stage 3 of Docs/PLAN_DRAWING_SETS.md): its heights as its drawings print them
 * (src/import/heights.ts reads them from the set's sections and elevations, the Set panel lets a person type them) and the
 * tower the Building view and the walk draw from them. Pure; kept apart from the sheet reader so the viewer never loads it.
 */
import type { Unit } from '../../core'

/** the slab when no drawing prints it: a Dhaka RCC floor slab (and the 3D's own, render.ts SLAB_M) */
export const SLAB_M = 0.15
/**
 * A building's heights as one view (or the set, or the person) says them, in metres over the ground floor's finished
 * floor — as a drawing prints its levels. Floors: 0 the ground floor, n ≥ 1, −n basement n.
 */
export interface Heights {
  /** each floor's finished floor */
  floors: Record<number, number>
  /** the top floor's ceiling (a ceiling or top-plate mark): its walls stop there */
  ceilingM?: number
  /** a flat roof's slab top (a roof mark) */
  roofM?: number
  /** a pitched roof's eave and ridge */
  eaveM?: number
  ridgeM?: number
  /** a pitched roof hipped at its ends (else a gable) */
  hip?: boolean
  /** a flat roof's parapet: how high it stands over the roof slab */
  parapetM?: number
  /** the floor slab's thickness: each storey's walls stop this far under the next floor */
  slabM?: number
}

/** the tower's storeys as a project draws them (towerHeights) */
export interface TowerHeights {
  /** each floor's finished floor, from the lowest to the roof (top + 1), m over the ground floor's */
  levels: Record<number, number>
  /** each floor's walls, from its floor up to the slab over it (the top floor's: to its ceiling) */
  walls: Record<number, number>
  slabM: number
  /** a flat roof's parapet over the roof slab */
  parapetM?: number
  /** a pitched roof's eave and ridge, m over the ground floor, and whether it is hipped (else a gable) */
  eaveM?: number
  ridgeM?: number
  hip?: boolean
}

/**
 * Heights as the tower draws them, floor `lowest` (a basement, or 0) to `top` and the roof over it: a floor the drawings
 * list stands at its level; one past the highest listed takes the storey under it again (a typical floor), one under the
 * lowest the storey over it, one in a gap between two listed ones a share of the gap; `typical` when no storey is known.
 * The roof stands on the top floor's ceiling (or the eave) plus the slab, else on a flat roof's slab, else a storey over
 * the top floor — a building taller than its section keeps the section's top storey. Walls stop a slab under the next floor.
 */
export function towerHeights(h: Heights, lowest: number, top: number, typical: number): TowerHeights {
  const slabM = h.slabM ?? SLAB_M
  const ks = Object.keys(h.floors).map(Number).sort((a, b) => a - b)
  if (!ks.length) ks.push(0), (h = { ...h, floors: { 0: 0 } })
  const lo = ks[0], hi = ks[ks.length - 1]
  const step = (k: number) => (h.floors[k + 1] !== undefined && h.floors[k] !== undefined ? h.floors[k + 1] - h.floors[k] : undefined)
  const up = step(hi - 1) ?? typical
  const down = step(lo) ?? typical
  const levels: Record<number, number> = {}
  for (let k = Math.min(lowest, lo); k <= Math.max(top, hi); k++) {
    if (h.floors[k] !== undefined) levels[k] = h.floors[k]
    else if (k > hi) levels[k] = h.floors[hi] + (k - hi) * up
    else if (k < lo) levels[k] = h.floors[lo] - (lo - k) * down
    else {
      const a = ks.filter((f) => f < k).pop()!, b = ks.find((f) => f > k)!
      levels[k] = h.floors[a] + ((h.floors[b] - h.floors[a]) * (k - a)) / (b - a)
    }
  }
  // the top storey: the drawings' own (their top floor to its ceiling or eave and the slab, or to the roof slab), carried up to the project's top floor
  const ceiling = h.ceilingM ?? (h.ridgeM !== undefined ? h.eaveM : undefined)
  const roofOver = ceiling !== undefined ? ceiling + slabM - h.floors[hi] : h.roofM !== undefined ? h.roofM - h.floors[hi] : up
  const shift = levels[top] - h.floors[hi]
  levels[top + 1] = levels[top] + roofOver
  const walls: Record<number, number> = {}
  for (let k = Math.min(lowest, lo); k <= top; k++) walls[k] = levels[k + 1] - levels[k] - slabM
  const pitched = h.ridgeM !== undefined ? { ridgeM: h.ridgeM + shift, eaveM: (h.eaveM ?? h.floors[hi] + roofOver - slabM) + shift, ...(h.hip ? { hip: true } : {}) } : null
  return { levels, walls, slabM, ...(pitched ?? (h.parapetM !== undefined ? { parapetM: h.parapetM } : {})) }
}

/** a full wall reaches the slab over its storey (the Studio's walls are 3.048 m, the built-in flats' 3.0); a lower one (a parapet, a planter edge, a wall a person set lower) keeps its own height */
const FULL_M = 2.99

/**
 * `u` with its full walls as tall as storey `wallM` (m): its ceiling there; an opening up to the wall's top (glass from floor
 * to ceiling) still reaches it, one whose head the lower wall would cut stops under it. `u` itself when no height is known.
 */
export const storeyUnit = (u: Unit, wallM: number | undefined): Unit =>
  wallM === undefined || !u.walls.some((w) => w.heightM >= FULL_M && w.heightM !== wallM)
    ? u
    : {
        ...u,
        walls: u.walls.map((w) =>
          w.heightM < FULL_M
            ? w
            : { ...w, heightM: wallM, openings: w.openings.map((o) => (o.sillM + o.heightM >= Math.min(w.heightM - 0.01, wallM) ? { ...o, heightM: Math.max(0.1, wallM - o.sillM) } : o)) },
        ),
      }
