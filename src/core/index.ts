/**
 * Core geometry API — pure functions, no Three.js, no DOM. Vitest-covered.
 * SIGNATURES ARE THE CONTRACT: other modules code against these. Extend, don't change.
 *
 * Implementations live in:
 *  - geometry.ts  polygon math, wall frame/pieces, nearestWall, roomAt
 *  - graph.ts     deriveRooms (planar face traversal), validate
 *  - units.ts     parseLength, formatFeetInches
 *
 * Winding: plan space is y-down; loops with signedArea > 0 look clockwise on
 * screen. See geometry.ts header. Walls only meet at shared vertices (no
 * T-junctions mid-wall) — see graph.ts header.
 */
import type { Id, RoomKind, Vertex } from './types'

export * from './types'
export { newId } from './ids'

export type { Pt, Bounds, Graph, WallPiece } from './geometry'

/**
 * Enclosed faces of the planar wall graph (centerlines), outer face excluded.
 * A face containing a RoomLabel point takes that label's id/name/kind;
 * unlabelled faces get a generated id and name "Space N".
 * Loops are ordered so that `signedArea(loop) > 0`.
 */
export { deriveRooms } from './graph'

/**
 * Dangling vertices (never a `standsAlone` wall's free ends), zero-length/duplicate walls, openings out of
 * bounds/overlapping, labels outside faces, crossing walls; warnings: unlabelled faces, an island inside a face.
 */
export { validate, MIN_LABELLED_AREA_SQM } from './graph'

/** Wall local frame: origin at vertex a, `dir` unit vector a→b, `normal` = dir rotated +90°. */
export { wallFrame } from './geometry'

/**
 * Solid rectangles remaining after openings are subtracted, in wall-local
 * coordinates: u along the wall from vertex a (m), v vertical from floor (m).
 * Every piece spans the full thickness. Pieces never overlap.
 */
export { wallPieces } from './geometry'

/** Centerline polygon of a derived room, in plan meters, same order as room.loop. */
export { roomPolygon } from './geometry'

/** Room polygon shrunk inward by each bounding wall's half thickness (the finished inner face). */
export { roomInnerPolygon } from './geometry'

/** Ear-clipping triangulation of a simple polygon (any winding). Returns index triples into `poly`. */
export { triangulate } from './geometry'

export { signedArea, pointInPolygon, unitBounds, polygonCentroid } from './geometry'

/** Closest wall to a plan point: t ∈ [0,1] along a→b, perpendicular distance in m. */
export { nearestWall } from './geometry'

/** Which derived room contains a plan point (by centerline polygon), if any. */
export { roomAt } from './geometry'

/**
 * Floor height (m) of a room at a plan point: its label's `levelM` (default 0); a ramp (`slope`) runs linearly from
 * `levelM` at the face's near extent along `dirDeg` to `toLevelM` at its far extent (a plane). The 3D floor mesh and the
 * walker both use this.
 */
export { roomLevelAt } from './geometry'

/** Floor height (m) at a plan point: the smallest face around it (roomAt) by roomLevelAt; 0 outside every face. */
export { floorLevelAt } from './graph'

/** The eight outdoor / non-room zone kinds: no ceiling, no walls-to-slab assumptions, no flat auto-furnish. */
const OUTDOOR: ReadonlySet<RoomKind> = new Set<RoomKind>(['lawn', 'paving', 'driveway', 'parking', 'deck', 'pool', 'planter', 'play'])
export const isOutdoor = (kind: RoomKind): boolean => OUTDOOR.has(kind)

/**
 * Parse a printed dimension to meters. Accepts 14'-5", 14'5", 14' 5", 14'5, 14.4 (feet),
 * 14.4ft, 4.4m, 440cm. Returns null when unparseable. Feet are the default unit.
 */
export { parseLength } from './units'
/** 4.394 → 14'-5" */
export { formatFeetInches, FT, sqmToSqft } from './units'

/** The unit reflected about x = axisX: a/b swapped per wall (normals keep their room), offsets re-measured, ids + `-m`. */
export { mirrorUnit } from './mirror'

/** Lookup helpers */
export const vertexById = (vs: Vertex[], id: Id): Vertex => {
  const v = vs.find((x) => x.id === id)
  if (!v) throw new Error(`vertex ${id} not found`)
  return v
}
