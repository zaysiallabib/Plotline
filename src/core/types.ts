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

/** 'slider' = a sliding door (glazed panels, no swinging leaf): its own kind, never guessed from width or hinge. */
export type OpeningKind = 'door' | 'window' | 'passage' | 'slider'

export interface Opening {
  id: Id
  kind: OpeningKind
  offsetM: number // distance along wall from vertex a to the opening's start edge
  widthM: number
  heightM: number
  sillM: number // 0 for doors/passages
  /** door swing/hinge side hint (kind 'door' only; ignored on sliders); purely visual */
  hinge?: 'a' | 'b'
  swing?: 'in' | 'out'
}

export interface Wall {
  id: Id
  a: Id // vertex id
  b: Id // vertex id — arbitrary angle, never assume axis-aligned
  thicknessM: number // partition ≈ 0.127 (5"), exterior/shear ≈ 0.254 (10")
  /**
   * 0 = a FLUSH LINE: a graph edge that bounds a zone (lawn | paving, …) and is drawn as nothing — no mesh, skirting,
   * collision or daylight blocking; carries no openings. Up to ~0.2 = a kerb; 0.45 / 1.1 = planter edge / parapet.
   */
  heightM: number
  openings: Opening[]
  /**
   * Its loose ends are meant (a screen, fin, parapet length, decorative or wind wall — any level, also inside a flat):
   * a free end of it is never an issue. Once both its ends join other walls it is an ordinary wall anyway.
   */
  standsAlone?: true
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
  // common rooms (ground floors, rooftops)
  | 'lobby'
  | 'gym'
  | 'community'
  | 'guard'
  // outdoor / non-room zones (core.isOutdoor): no ceiling, no walls-to-slab, no flat auto-furnish
  | 'lawn'
  | 'paving'
  | 'driveway'
  | 'parking'
  | 'deck'
  | 'pool'
  | 'planter'
  | 'play'

/** A ramp's floor: from the label's `levelM` at the face's near extent, along `dirDeg`, to `toLevelM` at its far extent. */
export interface Slope {
  toLevelM: number
  /** the uphill-or-downhill run direction: degrees clockwise from plan-up (−y), like Unit.northDeg */
  dirDeg: number
}

/** Authored: a point inside a face plus what to call it. Rooms are derived. */
export interface RoomLabel {
  id: Id
  name: string // e.g. "Bed-1"
  kind: RoomKind
  x: number // m — any point strictly inside the intended face
  y: number
  /** printed on the plan, e.g. "14'-0\" × 16'-0\"" — display only */
  printedSize?: string
  /** the face's floor level relative to the unit's datum, m (default 0; printed +3'-6" → 1.067) */
  levelM?: number
  /** a ramp: the floor runs from `levelM` to `slope.toLevelM` (core.roomLevelAt) */
  slope?: Slope
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
  /** from its label (absent = 0) */
  levelM?: number
  slope?: Slope
}

export type MaterialRef =
  | { kind: 'color'; color: string; roughness?: number; metalness?: number }
  | {
      kind: 'pbr'
      /** key into src/furnish/textures.ts TEXTURES registry (paths + repeatM live there) */
      textureId: string
      /** optional multiply color, e.g. "#f3ead9" — one plaster texture, many paint colors */
      tint?: string
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
  /**
   * Per-axis size override in metres (x width, y height, z depth), set by Arrange / the Studio when a resizable
   * (procedural) piece is stretched. Absent = the kit size × scale. Scanned glTF models are never resized.
   */
  sizeM?: { x: number; y: number; z: number }
  /**
   * Deleted by staff (Arrange / the Studio's tool F): a tombstone kept in the stored layout so its room is not
   * re-furnished with presets. Never rendered, picked, shadowed or framed.
   */
  removed?: true
}

/**
 * A structural column drawn on the plan (founder 2026-10-03): its own block, axis-aligned, centre + size in plan metres.
 * Walls keep their own centre lines and thicknesses — the wall graph carries a wall through / into the column under its
 * block; the column changes no room (deriveRooms / validate ignore it). Its centre, and where a wall's centre line meets
 * its faces, are snap points.
 */
export interface Pillar {
  id: Id
  x: number
  y: number
  wM: number
  hM: number
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
  /** columns (optional — older units have none) */
  pillars?: Pillar[]
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
    /** a closed group of walls inside a face, joined to nothing: that face's floor runs under it (join it with a flush line) */
    | 'island-in-room'
  message: string
  ids: Id[]
}
