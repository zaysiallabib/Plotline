/**
 * The demo tower (developer BTI, `Demo drawings/Btibd/`) for the Building view: which traced flat sits on which
 * floor, where each trace sits in one building frame, and a rough ground floor (img_5) and rooftop (img_1).
 *
 * Building frame = Type B's plan frame (img_2, metres, plan y down, north 304° like every unit).
 * ALIGNMENT: A, B and C were traced from two drawings at different scales and origins, all with north 304°, so a
 * translation is enough. Each trace's lift-core anchor = (west face of its core rooms, the wall line between the lift
 * lobby and the lifts): x = min x over its "Lift lobby" / "Lift core" / "Stair" room polygons, y = the "Lift core"
 * room's min y, or the "Lift lobby" room's max y where the lifts were not traced (B). Anchors: A (0, 1.981),
 * B (0, 11.202), C (0, 1.990) → offset = anchor(B) − anchor(flat). Cross-check: B and C share img_2, whose headers give
 * C's origin at (+0.061, +9.196) from B's; the anchors say (0, +9.212): 6 cm / 1.6 cm apart, i.e. tracing error.
 * building.test.ts re-derives the anchors, so a re-trace that moves the core fails there. Overlay:
 * E:\dev\plotline-shots\wave10\building\overlay.png.
 *
 * Ground floor and rooftop rectangles were read off the drawings by hand, placed by the same core anchor
 * (img_5: 57.8 px/m like img_2; img_1: 79.2 px/m; overlays in E:\dev\tmp\wave10\building\): rough, ±0.2 m.
 */
import type { Pt, Unit } from '../../core'
import typeA from '../units/type-a.json'
import typeB from '../units/type-b.json'
import typeC from '../units/type-c.json'

/** floor to floor: 10'-0" clear + the slab */
export const FLOOR_M = 3.048 + 0.15

/** route stem → traced flat + its offset into the building frame */
export const FLATS: Record<string, { unit: Unit; offset: Pt }> = {
  'type-a': { unit: typeA as unknown as Unit, offset: { x: 0, y: 9.221 } },
  'type-b': { unit: typeB as unknown as Unit, offset: { x: 0, y: 0 } },
  'type-c': { unit: typeC as unknown as Unit, offset: { x: 0, y: 9.212 } },
}

/**
 * Floors above the ground (0). `standIns` are massing only (shells nobody can open): floor 1 has no drawing (the
 * typical plate stands in), and floor 2's upper part (stair + the 674 sft landowner flats of img_3) is not traced.
 * Floors 4/6/8 have no drawing either: founder's decision, the 3rd/5th/7th plan repeats.
 */
export const FLOORS: { floor: number; flats: string[]; standIns?: string[] }[] = [
  { floor: 1, flats: [], standIns: ['type-b', 'type-c'] },
  { floor: 2, flats: ['type-a'], standIns: ['type-b'] },
  ...[3, 4, 5, 6, 7, 8].map((floor) => ({ floor, flats: ['type-b', 'type-c'] })),
]

/** The stair + lift core that runs from the ground to the roof head: these traced rooms' walls. */
export const CORE: [stem: string, room: string][] = [
  ['type-b', 'Stair'],
  ['type-b', 'Lift lobby'],
  ['type-c', 'Lift core'],
]

/** [x0, y0, x1, y1] in the building frame, metres */
export type Rect = [number, number, number, number]


/**
 * img_5 (57.8 px/m, core anchor at px (220.5, 1023)), read off gridded crops, ±0.2 m. The ground floor's north wall
 * sits 0.9 m inside the typical floors' (they cantilever). Roads 9/A (south) and 10/A (east) are 12.19 m wide.
 */
export const GROUND = {
  /** the plot: a paved plinth 0.2 m above the street */
  plot: [
    { x: -1.6, y: -3.2 },
    { x: 19.4, y: -3.9 },
    { x: 19.4, y: 25.3 },
    { x: 15.8, y: 28.8 },
    { x: -1.6, y: 28.8 },
  ] as Pt[],
  roads: [
    [-40, 28.8, 60, 41],
    [19.4, -40, 31.6, 28.8],
  ] as Rect[],
  gardens: [
    [-1.6, -3.2, 19.4, 0.9],
    [-1.6, 0.9, 0, 28.8],
    [17.8, 0.9, 19.4, 25.3],
    [13.8, 19.07, 17.8, 25.3],
    [13.8, 25.3, 15.8, 28.8],
    [0, 26.72, 4.9, 28.3],
  ] as Rect[],
  /** down to the basement, slope 1:8 (drawn flat) */
  ramp: [
    [13.4, 0.9, 17.55, 14.18],
    [8.73, 14.18, 17.55, 18.76],
  ] as Rect[],
  /** parking bays C-01..C-08 (painted outlines) */
  bays: [
    [0, 14.23, 4.59, 16.48],
    [0, 16.48, 4.59, 18.73],
    [0, 19.08, 4.59, 21.27],
    [0, 21.27, 4.59, 23.52],
    [0, 23.52, 4.59, 25.82],
    [8.73, 6.45, 13.3, 9.16],
    [8.73, 9.42, 13.3, 11.67],
    [8.73, 11.67, 13.3, 13.92],
  ] as Rect[],
  /** storey-high boxes: caretaker / driver's waiting / E.M.R., waiting lounge, the wall along the ramp, the south wall, the guard booth */
  blocks: [
    [0, 0.9, 13.4, 5.6],
    [8.73, 19.07, 13.75, 22.25],
    [8.73, 18.76, 17.8, 19.07],
    [0, 26.46, 4.9, 26.72],
    [8.73, 25.3, 11, 26.7],
  ] as Rect[],
  columns: [
    [0, 18.76, 0.95, 19.07],
    [3.54, 18.76, 4.58, 19.07],
    [8.73, 9.16, 9.68, 9.42],
    [12.36, 9.16, 13.31, 9.42],
    [8.73, 13.92, 9.68, 14.18],
    [12.36, 13.92, 13.31, 14.18],
    [17.55, 1.9, 17.8, 3.9],
    [17.55, 5.4, 17.8, 6.3],
    [17.55, 13.2, 17.8, 14.3],
  ] as Rect[],
}

/** img_1 (79.2 px/m, core anchor at px (157.5, 930)), rough: the garden strip along the north parapet and the central lawn; two water tanks on the lift machine room */
export const ROOF = {
  gardens: [
    [0.2, 0.3, 16.9, 4.9],
    [4.8, 14.8, 10.4, 19.2],
  ] as Rect[],
  tanks: [
    [0.4, 12.2, 1.9, 13.7],
    [2.3, 12.2, 3.8, 13.7],
  ] as Rect[],
}
