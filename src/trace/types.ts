/**
 * Auto-trace contract (wave 15; founder 2026-09-28: "a clever system and AI do 95 %, me the 5 %").
 * Everything here is in the SOURCE IMAGE's pixel space (x → right, y → down), before any scale is known;
 * the solver (wave 16) turns it into a core Unit via printed dimensions. Pure data: no DOM, no Three.
 * Stages: walls.ts (image → WallTrace, no AI) · text.ts (image → TextTrace: local OCR, AI only as a backup reader)
 * · solve.ts (both → Unit draft + Review items) · the Studio shows the review list (the human 5 %).
 */

export interface Px {
  x: number
  y: number
}

/** A grey-scale plan raster, row-major, 0 = black … 255 = white. */
export interface Gray {
  width: number
  height: number
  data: Uint8Array
}

/** A wall's centre line. Straight: a → b. Arc: a → b through `mid` (a curved wall; the solver splits it into short segments). */
export interface WallSeg {
  a: Px
  b: Px
  mid?: Px
  thicknessPx: number
  /** 0..1: how sure the extractor is this is a wall (not furniture, hatching, text, a dimension line) */
  conf: number
}

/** A gap in a wall run (future door / window / slider / passage). `kind` is a guess the solver may overrule. */
export interface OpeningGuess {
  a: Px
  b: Px
  kind: 'door' | 'window' | 'slider' | 'passage' | 'unknown'
  /** door: which side the leaf swings to (the arc's centre), when an arc was seen */
  hingeAt?: Px
  swingTo?: Px
  conf: number
}

export interface WallTrace {
  walls: WallSeg[]
  openings: OpeningGuess[]
  /** the building outline / unit boundary if the extractor found one (closed polygon) */
  outline?: Px[]
}

/** Parsed printed dimension, metres: "14'-5\" x 14'-4\"" → { aM: 4.394, bM: 4.369 }. */
export interface Dims {
  aM: number
  bM: number
}

export type TextKind = 'room' | 'dims' | 'area' | 'north' | 'other'

export interface TextItem {
  text: string
  box: { x: number; y: number; w: number; h: number }
  kind: TextKind
  /** kind 'room': the core RoomKind guessed from the label ("BED-1" → bedroom, "SUNSHADE/PLANTER" → balcony + green) */
  roomKind?: string
  green?: boolean
  dims?: Dims
  /** kind 'area': the printed area in m² ("±2,736 SFT" → 254.2) — extension (text agent, wave 15) */
  areaSqm?: number
  conf: number
  /** who read it: the local OCR or the backup AI reader */
  source: 'ocr' | 'ai'
}

export interface TextTrace {
  items: TextItem[]
  /**
   * Median printed-glyph height the text stage measured, px — extension (text agent, wave 15). Below ~7 px OCR reads
   * little (Sheltech L2 ≈ 7, Sheltech dmd ≈ 4): ask for a larger export / the PDF before trusting an empty trace.
   */
  glyphPx?: number
}

/**
 * The backup reader: any vision model (free tier first) behind one function. It gets a crop and returns plain JSON
 * matching TextItem[] (box relative to the crop). Keep prompts tiny and the task small: read what is printed, nothing else.
 */
export type AiReader = (crop: { png: Blob; offset: Px }, question: string) => Promise<TextItem[]>

// ── wave 16: hints, solver, review (manager contract, 2026-09-28) ─────────────────────────────────────────────────────
// Strategy (founder asked for honesty after low text scores): GEOMETRY FIRST, text only as hints. Walls come from the
// ink; ONE scale anchor is enough (an area label like "2956 SFT", 2–3 legible dims, or the 5"/10" wall prior); room kinds
// come from a label OR the drawn fixtures OR a sheet's colour fills; printed sizes become checks that feed the review list.

/** A non-text clue about the room at `at` (pixel space). */
export interface RoomHint {
  at: Px
  kind?: string // core RoomKind
  green?: boolean
  /** what produced it: a fixture symbol (WC, basin, bed, stove, shower, bath), a colour-fill cluster, a green mask blob */
  source: 'fixture' | 'colour' | 'green'
  /** e.g. 'wc', 'bed', 'stove' — for the review list / debugging */
  what?: string
  conf: number
  /** source 'green': the blob's area in px² — extension (hints agent, wave 16) */
  areaPx?: number
}

/**
 * One flat-coloured region of the sheet (a room's floor fill) — extension (hints agent, wave 16). Regions of one
 * `cluster` share a fill colour (Banani: grey = bedrooms, blue = wet rooms); hints.ts `propagateByColour` turns the
 * labels the OCR did read into kinds for the unread rooms of the same fill.
 */
export interface ColourFill {
  /** a point well inside the region (its deepest pixel) */
  at: Px
  areaPx: number
  rgb: [number, number, number]
  cluster: number
}

export interface HintTrace {
  hints: RoomHint[]
  /** plan-up → north, degrees clockwise, when a north arrow was found */
  northDeg?: number
  /** flat colour fills, when a colour image was given — extension (hints agent, wave 16) */
  fills?: ColourFill[]
  /** colour of each fill cluster (index = ColourFill.cluster) — extension (hints agent, wave 16) */
  clusters?: [number, number, number][]
}

/** One thing the human should look at (the 5 %). `at` is in PLAN metres (the draft's space). */
export interface ReviewItem {
  id: string
  at: { x: number; y: number }
  kind: 'size-mismatch' | 'unclosed' | 'unlabelled' | 'opening-guess' | 'low-confidence' | 'scale' | 'other'
  message: string
  /** the entity it concerns in the draft, when there is one */
  entityId?: string
}

export interface AutoTraceStats {
  ms: number
  pxPerM: number
  scaleFrom: 'dims' | 'area' | 'thickness' | 'given'
  /** which wall stage ran (AutoTraceOpts.tracker) */
  tracker?: 'skeleton' | 'bands'
  walls: number
  rooms: number
  labelled: number
  /**
   * Fixtures found outside wet rooms, plan metres — e.g. the hand-wash basin a Bangladeshi dining area has — for a later
   * wave to place a piece there. Extension (solver, wave 16).
   */
  fixtures?: { what: string; at: { x: number; y: number }; roomId?: string }[]
}

export interface AutoTraceResult {
  /** a normal core Unit (walls, vertices, openings, roomLabels, planImage) — the Studio edits it like any trace */
  unit: import('../core').Unit
  review: ReviewItem[]
  stats: AutoTraceStats
}

export interface AutoTraceOpts {
  /** a click inside the flat to trace (sheets show several flats + the core); pixel space */
  pickPx?: Px
  /** known scale, skips the scale solve */
  pxPerM?: number
  /** backup AI reader for labels the OCR could not read (only when the user configured a key) */
  ai?: AiReader
  onProgress?: (stage: string, fraction: number) => void
  /** the sheet in colour (ImageData-like, the layout hints.ts findHints / propagateByColour take) — colour fills name rooms — extension (solver, wave 16) */
  rgb?: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }
  /**
   * The wall stage (wave 18): 'bands' (default) = the founder's tracker — straight bands of exactly the drawn
   * thickness, carried into the draft as measured; 'skeleton' = the wave-15 skeleton, walls classed 5" / 10".
   */
  tracker?: 'skeleton' | 'bands'
}
