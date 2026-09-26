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
 * (img_5: 57.8 px/m like img_2; img_1: 78.6 px/m): rough, ±0.2 m.
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

/** img_5, rough. Roads 9/A (south) and 10/A (east) are 12.19 m wide. */
export const GROUND = {
  /** the plot: a paved plinth 0.2 m above the street */
  plot: [
    { x: -1.6, y: -3.2 },
    { x: 19.4, y: -3.9 },
    { x: 19.4, y: 25.5 },
    { x: 15.0, y: 29.9 },
    { x: -1.6, y: 29.4 },
  ] as Pt[],
  roads: [
    [-40, 29.9, 60, 42.1],
    [19.4, -40, 31.6, 29.9],
  ] as Rect[],
  gardens: [
    [-1.6, -3.2, 19.4, -0.3],
    [-1.6, -0.3, 0, 26.6],
    [17.8, -0.3, 19.4, 25.5],
    [13.8, 16.8, 17.8, 26.4],
  ] as Rect[],
  /** down to the basement, slope 1:8 */
  ramp: [13.8, -0.3, 17.8, 16.8] as Rect,
  /** parking bays C-01..C-08 (painted outlines) */
  bays: [
    [0, 13.9, 4.5, 16.2],
    [0, 16.2, 4.5, 18.5],
    [0, 19.0, 4.5, 21.3],
    [0, 21.3, 4.5, 23.6],
    [0, 23.6, 4.5, 25.9],
    [8.8, 5.2, 13.3, 7.5],
    [8.8, 7.9, 13.3, 10.2],
    [8.8, 10.2, 13.3, 12.5],
  ] as Rect[],
  /** caretaker / driver's waiting / E.M.R. block, waiting lounge: solid storey-high boxes */
  blocks: [
    [0, -0.3, 13.5, 4.4],
    [8.8, 16.9, 13.8, 20.2],
  ] as Rect[],
  columns: [
    [8.8, 7.6, 9.6, 7.9],
    [12.5, 7.6, 13.3, 7.9],
    [8.8, 12.6, 9.6, 12.9],
    [12.5, 12.6, 13.3, 12.9],
    [0, 18.6, 0.9, 18.9],
    [3.6, 18.6, 4.5, 18.9],
    [17.4, 4.5, 17.8, 5.5],
    [17.4, 12.3, 17.8, 13.2],
    [17.4, 16.4, 17.8, 16.8],
    [0, 25.9, 0.5, 26.6],
    [13.3, 25.9, 13.8, 26.6],
  ] as Rect[],
}

/** img_1, rough: the garden strip along the north parapet, two water tanks on the lift machine room */
export const ROOF = {
  gardens: [[0.8, 0.2, 17.2, 4.2]] as Rect[],
  tanks: [
    [0.4, 12.2, 1.9, 13.7],
    [2.3, 12.2, 3.8, 13.7],
  ] as Rect[],
}
