/**
 * The Sheltech tower (`Demo drawings/Sheltech/`) for the Building view, same shape as demo-tower.ts.
 *
 * Building frame = Type A's plan frame. Type B is traced in that same frame (A's plan-image fit and A's lobby lines),
 * so both offsets are 0 and the lobby walls coincide. Every Sheltech drawing is 1000×833 px with the same framing, so
 * the common levels (sheltech-ground / -b1 / -b2 / -roof, hand-authored session 19) were read off with the same fit:
 * x = (px − 492.3) / 26.64, y = (py − 140.7) / 26.64 (±0.1 m on these sheets: G / B1 / B2 / L1 / L2 put the building's
 * columns within 4 cm of each other), anchored where they must coincide on the flats' lift shaft and stair walls.
 */
import type { Pt, Unit } from '../../core'
import sheltechA from '../units/sheltech-a.json'
import sheltechB from '../units/sheltech-b.json'
import sheltechGround from '../units/sheltech-ground.json'
import sheltechB1 from '../units/sheltech-b1.json'
import sheltechB2 from '../units/sheltech-b2.json'
import sheltechRoof from '../units/sheltech-roof.json'
import type { Rect } from './demo-tower'

export { FLOOR_M } from './demo-tower'

/**
 * The flats, and the common levels hand-authored from the same sheets (session 19) — in the building frame (offset 0),
 * the same shape projectTower emits for a Studio project's traced levels: FLATS entries, FLOORS stand-ins, LEVELS.
 */
export const FLATS: Record<string, { unit: Unit; offset: Pt }> = {
  'sheltech-a': { unit: sheltechA as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-b': { unit: sheltechB as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-ground': { unit: sheltechGround as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-b1': { unit: sheltechB1 as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-b2': { unit: sheltechB2 as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-roof': { unit: sheltechRoof as unknown as Unit, offset: { x: 0, y: 0 } },
}

/**
 * Basements 2 and 1 (−2, −1), the ground floor (0); level 1 is the community lounge + gym (not flats): the flats'
 * shells stand in for its massing; levels 2–6: A + B; the rooftop on the roof slab (7).
 */
export const FLOORS: { floor: number; flats: string[]; standIns?: string[] }[] = [
  { floor: -2, flats: [], standIns: ['sheltech-b2'] },
  { floor: -1, flats: [], standIns: ['sheltech-b1'] },
  { floor: 0, flats: [], standIns: ['sheltech-ground'] },
  { floor: 1, flats: [], standIns: ['sheltech-a', 'sheltech-b'] },
  ...[2, 3, 4, 5, 6].map((floor) => ({ floor, flats: ['sheltech-a', 'sheltech-b'] })),
  { floor: 7, flats: [], standIns: ['sheltech-roof'] },
]

/** The common levels and the floor each stands on (as projectTower's LEVELS). */
export const LEVELS: Record<string, number> = { 'sheltech-b2': -2, 'sheltech-b1': -1, 'sheltech-ground': 0, 'sheltech-roof': 7 }

/** The core (lobby, stair, lift shaft) at the ground and the roof head: the real levels draw their own (as projectTower). */
export const CORE: [stem: string, room: string][] = []

/**
 * Ground floor.jpg is the real level sheltech-ground (lawns, driveway, ramps, rooms, columns are its own zones, walls and
 * pillars): the hand-typed rects it replaced are empty, as projectTower leaves them when a ground floor is traced. The plot
 * is its boundary wall's outside; the street south of it stays.
 */
export const GROUND = {
  plot: [
    { x: -13.843, y: -2.184 },
    { x: 14.275, y: -2.184 },
    { x: 14.275, y: 22.784 },
    { x: -13.843, y: 22.784 },
  ] as Pt[],
  roads: [[-40, 23.2, 60, 35.4]] as Rect[],
  gardens: [] as Rect[],
  ramp: [] as Rect[],
  bays: [] as Rect[],
  blocks: [] as Rect[],
  columns: [] as Rect[],
}

/** Rooftop.jpg is the real level sheltech-roof (its planters, screens and voids are its own zones and walls) */
export const ROOF = {
  gardens: [] as Rect[],
  tanks: [] as Rect[],
}
