/**
 * Core geometry API — pure functions, no Three.js, no DOM. Vitest-covered.
 * SIGNATURES ARE THE CONTRACT: other modules code against these. Extend, don't change.
 */
import type { Id, Room, Unit, ValidationIssue, Vertex, Wall } from './types'

export * from './types'
export { newId } from './ids'

export interface Pt {
  x: number
  y: number
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Graph-only view of a unit (what geometry needs). */
export type Graph = Pick<Unit, 'vertices' | 'walls' | 'roomLabels'>

/**
 * Enclosed faces of the planar wall graph (centerlines), outer face excluded.
 * A face containing a RoomLabel point takes that label's id/name/kind;
 * unlabelled faces get a generated id and name "Space N".
 * Loops are ordered so that `signedArea(loop) > 0`.
 */
export function deriveRooms(_graph: Graph): Room[] {
  throw new Error('TODO: implemented by core agent')
}

/** Dangling vertices, zero-length/duplicate walls, openings out of bounds/overlapping, labels outside faces, crossing walls. */
export function validate(_unit: Unit): ValidationIssue[] {
  throw new Error('TODO: implemented by core agent')
}

/** Wall local frame: origin at vertex a, `dir` unit vector a→b, `normal` = dir rotated +90°. */
export function wallFrame(
  _wall: Wall,
  _vertices: Vertex[],
): { origin: Pt; dir: Pt; normal: Pt; lengthM: number } {
  throw new Error('TODO')
}

/**
 * Solid rectangles remaining after openings are subtracted, in wall-local
 * coordinates: u along the wall from vertex a (m), v vertical from floor (m).
 * Every piece spans the full thickness. Pieces never overlap.
 */
export interface WallPiece {
  u0: number
  u1: number
  v0: number
  v1: number
}
export function wallPieces(_wall: Wall, _lengthM: number): WallPiece[] {
  throw new Error('TODO')
}

/** Centerline polygon of a derived room, in plan meters, same order as room.loop. */
export function roomPolygon(_room: Room, _graph: Graph): Pt[] {
  throw new Error('TODO')
}

/** Room polygon shrunk inward by each bounding wall's half thickness (the finished inner face). */
export function roomInnerPolygon(_room: Room, _graph: Graph): Pt[] {
  throw new Error('TODO')
}

/** Ear-clipping triangulation of a simple polygon (any winding). Returns index triples into `poly`. */
export function triangulate(_poly: Pt[]): number[] {
  throw new Error('TODO')
}

export function signedArea(_poly: Pt[]): number {
  throw new Error('TODO')
}
export function pointInPolygon(_p: Pt, _poly: Pt[]): boolean {
  throw new Error('TODO')
}
export function unitBounds(_graph: Pick<Unit, 'vertices'>): Bounds {
  throw new Error('TODO')
}

/** Closest wall to a plan point: t ∈ [0,1] along a→b, perpendicular distance in m. */
export function nearestWall(
  _p: Pt,
  _graph: Pick<Unit, 'vertices' | 'walls'>,
): { wall: Wall; t: number; distanceM: number } | null {
  throw new Error('TODO')
}

/** Which derived room contains a plan point (by centerline polygon), if any. */
export function roomAt(_p: Pt, _rooms: Room[], _graph: Graph): Room | null {
  throw new Error('TODO')
}

/**
 * Parse a printed dimension to meters. Accepts 14'-5", 14'5", 14' 5", 14'5, 14.4 (feet),
 * 14.4ft, 4.4m, 440cm. Returns null when unparseable. Feet are the default unit.
 */
export function parseLength(_s: string): number | null {
  throw new Error('TODO')
}
/** 4.394 → 14'-5" */
export function formatFeetInches(_m: number): string {
  throw new Error('TODO')
}
export const FT = 0.3048
export const sqmToSqft = (sqm: number): number => sqm / (FT * FT)

/** Lookup helpers */
export const vertexById = (vs: Vertex[], id: Id): Vertex => {
  const v = vs.find((x) => x.id === id)
  if (!v) throw new Error(`vertex ${id} not found`)
  return v
}
