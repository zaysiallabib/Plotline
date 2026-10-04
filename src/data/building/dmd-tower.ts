/**
 * The Sheltech dmd tower (`Demo drawings/Sheltech dmd/`) for the Building view, in the shape projectTower emits: every
 * level is a hand-authored unit drawn as a stand-in on its floor (LEVELS), the typical floors a shell (dmd-typical.json:
 * the plate's outer walls + the core of "Level 3-14"; the three flats are not traced).
 *
 * One building frame for every sheet: origin = the fire stair's inner NW corner, metres, plan y down, all offsets 0.
 * The sheets are scaled copies of one drawing (the dashed plot is 50.15 m wide on each: 16.01 px/m roof, 16.05 B1,
 * 16.25 B2, 16.45 Level 3-14; the ground sheet 15.19, fitted on 9 columns shared with Basement 1), aligned on the fire
 * stair; core and columns coincide level to level (src/core/dmd-levels.test.ts). No north arrow on the sheets: north 0.
 *
 * Floors: Ground level = floor 0 (the sheets' "Level 1"), Level 2 = floor 1 (community space + gym, not traced: the
 * typical shell stands in), Levels 3–14 = floors 2–13, the roof on 14; Basements 1–2 on −1 / −2.
 */
import type { Pt, Unit } from '../../core'
import b1 from '../units/dmd-b1.json'
import b2 from '../units/dmd-b2.json'
import ground from '../units/dmd-ground.json'
import roof from '../units/dmd-roof.json'
import typical from '../units/dmd-typical.json'
import type { Rect } from './demo-tower'

export { FLOOR_M } from './demo-tower'

const at0 = (u: unknown) => ({ unit: u as Unit, offset: { x: 0, y: 0 } })

export const FLATS: Record<string, { unit: Unit; offset: Pt }> = {
  'dmd-typical': at0(typical),
  'dmd-ground': at0(ground),
  'dmd-b1': at0(b1),
  'dmd-b2': at0(b2),
  'dmd-roof': at0(roof),
}

const TOP = 13

export const FLOORS: { floor: number; flats: string[]; standIns?: string[] }[] = [
  { floor: -2, flats: [], standIns: ['dmd-b2'] },
  { floor: -1, flats: [], standIns: ['dmd-b1'] },
  { floor: 0, flats: [], standIns: ['dmd-ground'] },
  ...Array.from({ length: TOP }, (_, i) => ({ floor: i + 1, flats: [], standIns: ['dmd-typical'] })),
  { floor: TOP + 1, flats: [], standIns: ['dmd-roof'] },
]

export const CORE: [stem: string, room: string][] = []

/** the plot = the ground level's boundary wall (50.16 × 28.14 m); the real ground level replaces the other lists */
export const GROUND = {
  plot: [
    { x: -19.787, y: -10.389 },
    { x: 30.378, y: -10.389 },
    { x: 30.378, y: 17.755 },
    { x: -19.787, y: 17.755 },
  ] as Pt[],
  roads: [] as Rect[],
  gardens: [] as Rect[],
  ramp: [] as Rect[],
  bays: [] as Rect[],
  blocks: [] as Rect[],
  columns: [] as Rect[],
}

export const ROOF = { gardens: [] as Rect[], tanks: [] as Rect[] }

export const LEVELS: Record<string, number> = { 'dmd-b2': -2, 'dmd-b1': -1, 'dmd-ground': 0, 'dmd-roof': TOP + 1 }
