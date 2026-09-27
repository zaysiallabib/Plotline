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
