/**
 * Plotline core data model — THE contract every module builds against.
 *
 * Invariants (see CLAUDE.md):
 *  - The wall graph (vertices + walls) is the single source of truth.
 *  - Rooms are DERIVED faces of the graph; a RoomLabel only names a face.
 *  - All lengths are meters. Pixels exist only inside the Studio.
 *  - Money is integer BDT.
 *  - Every entity has a stable unique id (crypto.randomUUID()).
 *
 * Plan space: x → right, y → down (image convention). 3D maps (x, y) → (X, Z),
 * with Y up. A wall's "a→b" direction defines its local axis; opening offsets
 * are measured along that axis from vertex a.
 */

export type Id = string

export interface Vertex {
  id: Id
  x: number // m
  y: number // m
}

export type OpeningKind = 'door' | 'window' | 'passage'

export interface Opening {
  id: Id
  kind: OpeningKind
  offsetM: number // distance along wall from vertex a to the opening's start edge
  widthM: number
  heightM: number
  sillM: number // 0 for doors/passages
  /** door swing/hinge side hint; purely visual */
  hinge?: 'a' | 'b'
  swing?: 'in' | 'out'
}

export interface Wall {
  id: Id
  a: Id // vertex id
  b: Id // vertex id — arbitrary angle, never assume axis-aligned
  thicknessM: number // partition ≈ 0.127 (5"), exterior/shear ≈ 0.254 (10")
  heightM: number
  openings: Opening[]
}

export type RoomKind =
  | 'bed'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bath'
  | 'balcony'
  | 'study'
  | 'closet'
  | 'utility'
  | 'shaft'
  | 'other'

/** Authored: a point inside a face plus what to call it. Rooms are derived. */
export interface RoomLabel {
  id: Id
  name: string // e.g. "Bed-1"
  kind: RoomKind
  x: number // m — any point strictly inside the intended face
  y: number
  /** printed on the plan, e.g. "14'-0\" × 16'-0\"" — display only */
  printedSize?: string
}

/** DERIVED by core.deriveRooms — never authored, never persisted. */
export interface Room {
  id: Id // == RoomLabel.id when labelled, else generated
  name: string
  kind: RoomKind
  /** counter-clockwise loop of vertex ids along wall centerlines */
  loop: Id[]
  /** the walls bounding this face, in loop order */
  wallIds: Id[]
  areaSqm: number
  centroid: { x: number; y: number }
  printedSize?: string
}

export type MaterialRef =
  | { kind: 'color'; color: string; roughness?: number; metalness?: number }
  | {
      kind: 'pbr'
      /** public/ paths, e.g. "/assets/textures/wood_floor/albedo.jpg" */
      albedo: string
      normal?: string
      roughness?: string
      ao?: string
      /** real-world size of one texture tile, meters */
      repeatM: number
    }

export interface FinishOption {
  id: Id
  brand: string
  sku: string
  label: string
  priceDeltaBdt: number // integer taka; 0 = included
  material: MaterialRef
}

/** A buyer-selectable slot: "Bedroom floors", "Living walls", … */
export interface FinishSlot {
  id: Id
  label: string
  target: 'floor' | 'wall' | 'ceiling'
  /** room ids (RoomLabel ids) this slot applies to, or 'all' */
  roomIds: Id[] | 'all'
  options: FinishOption[]
  defaultOptionId: Id
}

export interface FurniturePlacement {
  id: Id
  assetId: string // key in the furniture kit registry (src/furnish/kit.ts)
  roomId: Id
  x: number // m, plan space
  y: number
  rotationDeg: number // clockwise in plan space, 0 = asset's front faces +y
  scale?: number
}

export interface Unit {
  id: Id
  projectName: string
  name: string // "Type A · 2662 sft"
  floor?: number
  /** Compass: degrees, clockwise from plan-up (−y), pointing to true north. */
  northDeg: number
  vertices: Vertex[]
  walls: Wall[]
  roomLabels: RoomLabel[]
  furniture: FurniturePlacement[]
  finishSlots: FinishSlot[]
  /** printed on the plan */
  areaSqft: number
  /** optional; intentionally NOT rendered in the demo */
  priceBdt?: number
  /** the source drawing (public/ path) — used by the Studio as a tracing layer */
  planImage?: { src: string; pxPerM: number; originPx: { x: number; y: number } }
}

/** Buyer's chosen option per slot — what "share this configuration" encodes. */
export type Configuration = Record<Id /* slotId */, Id /* optionId */>

export interface ValidationIssue {
  level: 'error' | 'warning'
  code:
    | 'dangling-vertex'
    | 'zero-length-wall'
    | 'duplicate-wall'
    | 'opening-out-of-bounds'
    | 'openings-overlap'
    | 'unlabelled-room'
    | 'label-outside-any-room'
    | 'walls-intersect'
  message: string
  ids: Id[]
}
