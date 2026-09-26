/**
 * The Sheltech tower (`Demo drawings/Sheltech/`) for the Building view, same shape as demo-tower.ts.
 *
 * Building frame = Type A's plan frame. Type B is traced in that same frame (A's plan-image fit and A's lobby lines),
 * so both offsets are 0 and the lobby walls coincide. Every Sheltech drawing is 1000×833 px with the same framing, so
 * the ground floor and the rooftop were read off with the same fit: x = (px − 492.3) / 26.64, y = (py − 140.7) / 26.64
 * (rough, ±0.5 m; the brochure scale drifts 25–28 px/m).
 */
import type { Pt, Unit } from '../../core'
import sheltechA from '../units/sheltech-a.json'
import sheltechB from '../units/sheltech-b.json'
import type { Rect } from './demo-tower'

export { FLOOR_M } from './demo-tower'

export const FLATS: Record<string, { unit: Unit; offset: Pt }> = {
  'sheltech-a': { unit: sheltechA as unknown as Unit, offset: { x: 0, y: 0 } },
  'sheltech-b': { unit: sheltechB as unknown as Unit, offset: { x: 0, y: 0 } },
}

/** Level 1 is the community lounge + gym (not flats): the flats' shells stand in for its massing. Levels 2–6: A + B. */
export const FLOORS: { floor: number; flats: string[]; standIns?: string[] }[] = [
  { floor: 1, flats: [], standIns: ['sheltech-a', 'sheltech-b'] },
  ...[2, 3, 4, 5, 6].map((floor) => ({ floor, flats: ['sheltech-a', 'sheltech-b'] })),
]

/** Lobby, stair and lift shaft, ground to roof head (Rooftop.jpg: lobby 6.71 × 2.08 m, stair 4.50 × 2.69 m, lift machine room 4.36 × 2.49 m). */
export const CORE: [stem: string, room: string][] = [
  ['sheltech-a', 'Lobby'],
  ['sheltech-a', 'Stair'],
  ['sheltech-b', 'Lifts'],
]

/** Ground floor.jpg: lawn all round, the 1:8 driveway ramp down along the north-east, the gate at the south-east. */
export const GROUND = {
  plot: [
    { x: -13.7, y: -2.1 },
    { x: 14.2, y: -2.1 },
    { x: 14.2, y: 22.7 },
    { x: -13.7, y: 22.7 },
  ] as Pt[],
  roads: [[-40, 23.2, 60, 35.4]] as Rect[],
  gardens: [
    [-13.7, -2.1, 14.2, 0],
    [-13.7, 0, -12.4, 22.7],
    [-12.4, 14.1, 5.2, 22.7],
    [-12.4, 7.9, -9.1, 14.1],
    [12.7, 0, 14.2, 14.1],
    [7.6, 18, 10.2, 22.7],
  ] as Rect[],
  /** the driveway: 1:8 ramp down to the basements (drawn flat), then round to the gate */
  ramp: [
    [-1.2, 0, 7.6, 5],
    [7.6, 5, 12.7, 11.4],
    [7.4, 11.4, 12.7, 18],
    [10.2, 18, 14.2, 22.7],
  ] as Rect[],
  /** parking is in the two basements */
  bays: [] as Rect[],
  /** driver's waiting + toilet, meter room, E.M.E. room, lobby west of the core, toilet, reception, guard room (the lift shaft is CORE) */
  blocks: [
    [-12.4, 0, -5.5, 2.6],
    [-4, 0, -1.2, 2.8],
    [-12.4, 2.6, -6.8, 7.7],
    [-6.8, 5.1, -4.3, 7.9],
    [-9.1, 6.2, -6.8, 7.9],
    [-9.1, 7.9, -4.4, 14.1],
    [12.3, 14.1, 14, 17.4],
  ] as Rect[],
  /** the free-standing columns under the upper floors' south half (Level 1.jpg) */
  columns: [
    [-12.4, 11.95, -11.91, 12.96],
    [-12.4, 17.92, -11.91, 18.89],
    [-4.67, 16.57, -4.22, 17.58],
    [1, 15.82, 1.45, 16.79],
    [4.83, 15.82, 5.32, 16.79],
    [12.41, 10.33, 12.87, 11.35],
    [12.41, 15.82, 12.87, 16.79],
  ] as Rect[],
}

/** Rooftop.jpg: planters along the parapets and the south sunshade; no tanks drawn */
export const ROOF = {
  gardens: [
    [-12.5, 0, -11.7, 8.6],
    [-11, 8.8, -9.7, 11.4],
    [-12.5, 11.4, -11.7, 18.9],
    [11.9, 0, 12.7, 5.6],
    [9.3, 5.4, 11.9, 8.8],
    [11.9, 8.8, 12.7, 16.7],
    [1.4, 16.7, 12.7, 18.4],
  ] as Rect[],
  tanks: [] as Rect[],
}
