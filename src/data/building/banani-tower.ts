/**
 * The Sheltech Banani tower (`Demo drawings/Sheltech Banani/`) for the Building view, in the shape `projectTower` emits:
 * its levels are hand-authored units standing on their own floors (LEVELS), the flats' floors are massing only.
 *
 * Building frame = the ground level's: origin at the core column between the two lift doors, metres, plan y down, no
 * north arrow on the sheets (northDeg 0). Every sheet was placed on the ground's column grid (fits in banani-*.json's
 * commit notes): Ground 24.66 px/m, Basement 1 25.92, Basement 2 25.48, Roof 27.10, Level 2-6 30.00 — so every offset is 0
 * and the lift core + columns coincide level to level (banani-levels.test.ts).
 *
 * Floors: the sheets are Ground level (= Level 1), Level 2-6, Level 7, Level 8, Level 9-13 and the Roof level → floors
 * 1–12 here are Levels 2–13, all drawn with the Level 2-6 shell (Level 8 drops unit B for an open terrace and Levels 9–13
 * have unit A only — not modelled), the roof level on floor 13. The real storey heights differ from FLOOR_M (printed:
 * B1 −4100, B2 −7100 mm under the reception ±0); each basement's levels are relative to its own driveway.
 */
import type { Pt, Unit } from '../../core'
import b1 from '../units/banani-b1.json'
import b2 from '../units/banani-b2.json'
import ground from '../units/banani-ground.json'
import roof from '../units/banani-roof.json'
import typical from '../units/banani-typical.json'
import type { Rect } from './demo-tower'

export { FLOOR_M } from './demo-tower'

const at0 = (u: unknown) => ({ unit: u as Unit, offset: { x: 0, y: 0 } })

export const FLATS: Record<string, { unit: Unit; offset: Pt }> = {
  'banani-ground': at0(ground),
  'banani-b1': at0(b1),
  'banani-b2': at0(b2),
  'banani-roof': at0(roof),
  'banani-typical': at0(typical),
}

/** Levels 2–13 = floors 1–12 (the Level 2-6 shell), the levels on their own floors. */
const TOP = 12
export const FLOORS: { floor: number; flats: string[]; standIns?: string[] }[] = [
  { floor: -2, flats: [], standIns: ['banani-b2'] },
  { floor: -1, flats: [], standIns: ['banani-b1'] },
  { floor: 0, flats: [], standIns: ['banani-ground'] },
  ...Array.from({ length: TOP }, (_, i) => ({ floor: i + 1, flats: [], standIns: ['banani-typical'] })),
  { floor: TOP + 1, flats: [], standIns: ['banani-roof'] },
]

export const LEVELS: Record<string, number> = { 'banani-b2': -2, 'banani-b1': -1, 'banani-ground': 0, 'banani-roof': TOP + 1 }

/** the core is in every level's own walls */
export const CORE: [stem: string, room: string][] = []

/** the plot = the boundary wall's centre line on Ground level.jpg; the real ground level replaces the other lists */
export const GROUND = {
  plot: [
    { x: -13.3096, y: -14.859 },
    { x: 13.2588, y: -14.859 },
    { x: 13.2588, y: 7.8994 },
    { x: -13.3096, y: 7.8994 },
  ] as Pt[],
  roads: [] as Rect[],
  gardens: [] as Rect[],
  ramp: [] as Rect[],
  bays: [] as Rect[],
  blocks: [] as Rect[],
  columns: [] as Rect[],
}

export const ROOF = { gardens: [] as Rect[], tanks: [] as Rect[] }
