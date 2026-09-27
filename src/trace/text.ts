/**
 * Text stage of auto-trace: plan raster → TextTrace (room labels + printed dims, area, north), pixel space.
 * Local first: tesseract.js (Apache-2.0), lazily imported inside `readText` only, so nothing reaches a bundle
 * that does not call it. Everything above `readText` is pure (no DOM) and Vitest-covered in text.test.ts.
 */
import { FT, parseLength } from '../core'
import type { RoomKind } from '../core'
import type { Dims, Gray, TextItem, TextKind, TextTrace } from './types'

type Box = TextItem['box']

// ---------------------------------------------------------------- printed dimensions

const MIN_M = 0.6 // 2 ft: nothing narrower gets a printed size
const MAX_M = 20 // 65 ft: a longer "room" is an OCR misread

/** OCR look-alikes of digits, fixed only inside a dimension string (never in room names). */
const DIGIT_LOOKALIKES: Record<string, string> = { l: '1', I: '1', i: '1', '|': '1', '!': '1', O: '0', o: '0', Q: '0', D: '0', S: '5', s: '5', $: '5', B: '8', Z: '2', z: '2', G: '6' }

function normaliseQuotes(s: string): string {
  return s
    .replace(/[‘’′`´]/g, "'")
    .replace(/[“”″]|''/g, '"')
    .replace(/[–—~_]/g, '-')
    .replace(/½/g, ' 1/2')
}

/** Marks lost by OCR in a feet-inch size: "362" → 36'-2", "511" → 5'-11", "120" → 12'-0", "50" → 5'-0" (inches < 12). */
function splitFeetInches(d: string): number {
  const two = d.length >= 3 && +d.slice(-2) >= 10 && +d.slice(-2) <= 11 && +d.slice(0, -2) >= 2
  return (+d.slice(0, two ? -2 : -1) + +d.slice(two ? -2 : -1) / 12) * FT
}

/**
 * One side of a "W x L" pair → metres, or null. Feet are the default unit (as core parseLength).
 * `marksLost`: the pair shows feet-inch marks elsewhere, so a bare digit run is a feet-inch value whose marks OCR dropped.
 */
export function parseSide(raw: string, marksLost = false): number | null {
  let t = normaliseQuotes(raw)
    .trim()
    .replace(/^[^0-9A-Za-z|!$]+|[^0-9A-Za-z'"]+$/g, '')
  const metric = /^(.*\d.*?)\s*(m|cm|mm)$/i.exec(t)
  const unit = metric ? metric[2].toLowerCase() : ''
  if (metric) t = metric[1]
  t = t.replace(/[lIi|!OoQDSs$BZzG]/g, (c) => DIGIT_LOOKALIKES[c]).replace(/(\d+)\s+(\d+)\/(\d+)/, (_, a, b, c) => String(+a + +b / +c))
  let v: number | null
  const bare = marksLost ? /^(\d{2,4})"?$/.exec(t) : null
  const fi = /^(\d{1,3})\s*(?:'\s*-?|-)\s*(\d{1,2}(?:\.\d+)?)\s*["']?$/.exec(t) // 14'-5"  14'5  14-5"  14'-5' (inch mark read as ')
  if (fi) v = +fi[2] < 12 ? (+fi[1] + +fi[2] / 12) * FT : null
  else if (bare) {
    v = splitFeetInches(bare[1])
    if (v < MIN_M) v = parseLength(bare[1]) // 14'-5" X 12: plain feet after all
  } else v = parseLength(unit ? t + unit : t)
  return v !== null && v >= MIN_M && v <= MAX_M ? v : null
}

/**
 * A printed room size → metres: `14'-5" x 14'-4"`, `14'5"x14'4"`, `14'-0"×16'-0"`, `5'-11 1/2" X 7'`, `4.4m x 3.2m`,
 * `14.4 x 12` (feet), and OCR-mangled variants (`l4'-5"`, `14'-S"`, `14'-5"x 14'-4`, `14'-5"14'-4"`, `14-5%14-4"`,
 * `362X120"` = 36'-2" × 12'-0" with the marks lost). Else null.
 */
export function parseDims(raw: string): Dims | null {
  const s = normaliseQuotes(raw).trim()
  let parts = s.split(/\s*[x×X*%]\s*/).filter((p) => /\d/.test(p)) // % = an X misread
  if (parts.length === 1) {
    const m = /^(.*?\d\s*")\s*(\d.*)$/.exec(s) // separator lost: 14'-5"14'-4"
    if (m) parts = [m[1], m[2]]
  }
  if (parts.length !== 2) return null
  let [a, b] = parts
  const metric = /m\s*$/i.test(s) && !/['"]/.test(s) // "4.4 x 3.2m": the unit printed once
  if (metric && /\d$/.test(a.trim())) a += 'm'
  const marksLost = /['"-]/.test(s)
  const aM = parseSide(a, marksLost)
  const bM = parseSide(b, marksLost)
  return aM === null || bM === null ? null : { aM, bM }
}

/** "±2,736 SFT", "2736 sft", "2703 SFT & 674 SFT" (first one), "254 sqm" → m². Else null. */
export function parseArea(raw: string): number | null {
  const m = /(\d[\d,]{2,6}(?:\.\d+)?)\s*(S\.?\s*F\.?\s*T|SQ\.?\s*FT|FT2|FT²|SQ\.?\s*M|SQM|M2|M²)\b/i.exec(raw.replace(/²/g, '2'))
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  const sqm = /M/i.test(m[2].replace(/FT/i, '')) && !/F/i.test(m[2]) ? v : v * FT * FT
  return sqm >= 10 && sqm <= 10000 ? sqm : null
}

// ---------------------------------------------------------------- room names

/** Words a room name is made of; a token one edit away from one of these (length ≥ 5) is read as it ("KlTCHEN", "T0ILET"). */
const WORDS = 'KITCHEN TOILET VERANDA VERANDAH BALCONY LIVING DINING DRAWING FAMILY STUDY LOBBY STAIR FOYER PASSAGE STORE SERVANT CLOSET PLANTER SUNSHADE POWDER PRAYER UTILITY LAUNDRY MASTER GUEST CHILD SHAFT LANDSCAPE GREEN WALK LIFT BATH'.split(' ')
const DIGIT_AS_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '6': 'G', '2': 'Z' }

function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** Upper-case, OCR digit/letter confusions inside words undone, near-miss words snapped to the vocabulary. */
export function normaliseName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9.&/]+/g, ' ')
    .split(' ')
    .flatMap((tok) => {
      const m = /^([A-Z]{2,})(\d+)$/.exec(tok) // BED1 → BED 1
      return m ? [m[1], m[2]] : [tok]
    })
    .map((tok) => {
      if (/[A-Z]/.test(tok) && /\d/.test(tok) && tok.replace(/[^A-Z]/g, '').length >= 2) tok = tok.replace(/\d/g, (d) => DIGIT_AS_LETTER[d] ?? d)
      if (tok.length >= 5 && !WORDS.includes(tok)) tok = WORDS.find((w) => w.length >= 5 && editDistanceAtMost1(tok, w)) ?? tok
      return tok
    })
    .join(' ')
    .trim()
}

type Rule = [RegExp, RoomKind, boolean?]
/** First match wins; specific compounds before the generic words they contain ("K. VERANDA" before "KITCHEN"). */
const RULES: Rule[] = [
  [/\b(SUN ?SHADE|PLANTER|PLANT|GREEN|LANDSCAPE|GARDEN|LAWN)\b/, 'balcony', true],
  [/\b(K\.? ?VER(ANDAH?)?|KITCHEN VER|SERVICE VER)/, 'balcony'],
  [/\b((SERVANT|HELP|MAID|DRIVER)S? ?(TOILET|BATH|WC)|[HS]\. ?(TOILET|BATH))\b/, 'bath'],
  [/\b((SERVANT|HELP|MAID|DRIVER)S?|S\. ?BED)\b/, 'utility'], // help bed / help room / S.BED: the Phase-0 units trace them as utility
  [/\b(LOBBY|FOYER|PASSAGE|CORRIDOR|STAIRS?|LIFT|HOISTWAY|ENTRY|ENTRANCE|PRAYER|WORSHIP)\b/, 'other'], // no core kind for these; 'shaft' would render open to the sky
  [/\bODU\b/, 'shaft'], // outdoor AC-unit ledge: open to the sky, never furnished — closest core kind
  [/\b(W\.? ?I\.? ?C\.?|WALK ?-?IN|CLOSET|DRESS|DRESSING)\b/, 'closet'],
  [/\b(TOILET|BATH|BATHROOM|WC|W\.C|PDR|POWDER|WASH ?ROOM)\b/, 'bath'],
  [/\b(VERANDAH?|VER|BALCONY|BALC|TERRACE|DECK)\b/, 'balcony'],
  [/\b(BED|BEDROOM|MASTER|GUEST|CHILD)\b/, 'bed'],
  [/\b(KITCHEN|KIT)\b/, 'kitchen'],
  [/\b(STUDY|LIBRARY|OFFICE)\b/, 'study'],
  [/\b(AOD|DUCT|SHAFT|VOID)\b/, 'shaft'],
  [/\b(STORE|UTILITY|LAUNDRY)\b/, 'utility'],
]
const LIVING_DINING = /\b(DRAWING|LIVING|FAMILY|LOUNGE|DINING)\b/g
/** Appliance / fixture tags printed inside rooms: text, not room names. */
const NOT_A_ROOM = /\b(MACHINE|FRIDGE|FREEZER|D\.?W|F\.?H\.?B|UP|DN|BEAM|SLAB|PIT)\b/

/** A label → core RoomKind (+ green for planter strips), or null when the text names no room. */
export function classifyRoom(raw: string): { kind: RoomKind; green: boolean } | null {
  const n = normaliseName(raw)
  if (NOT_A_ROOM.test(n) && !/\b(BED|TOILET|BATH|KITCHEN|LIVING|DINING)\b/.test(n)) return null
  const special = RULES.slice(0, 6).find(([re]) => re.test(n))
  if (special) return { kind: special[1], green: !!special[2] }
  const first = [...n.matchAll(LIVING_DINING)][0] // "LIVING, DINING & FAMILY" → living, "DINING & FAMILY LIVING" → dining
  const rule = RULES.slice(6).find(([re]) => re.test(n))
  if (first && (!rule || n.search(rule[0]) > first.index!)) return { kind: first[1] === 'DINING' ? 'dining' : 'living', green: false }
  return rule ? { kind: rule[1], green: false } : null
}

// ---------------------------------------------------------------- grouping OCR words into labels

/** One OCR word (tesseract word), source-image pixels, conf 0..1. */
export interface OcrWord {
  text: string
  box: Box
  conf: number
}

const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

const LOOKS_LIKE_DIMS = /\d.*['"].*[x×X*%]|[x×X*%].*\d.*['"]|\d\s*['"]\s*-?\s*\d/

/** A line chunk: name and/or dims on one baseline. */
interface Chunk {
  text: string
  box: Box
  conf: number
}

function kindOf(text: string): TextKind {
  if (parseArea(text) !== null) return 'area'
  if (parseDims(text) || LOOKS_LIKE_DIMS.test(text)) return 'dims'
  if (/^N$/.test(text.trim())) return 'north'
  return classifyRoom(text) ? 'room' : 'other'
}

/** Words → chunks: same baseline, gap < 1.2 × text height; a dims pair split by a wide gap ("3'-0\"X   5'-5\"") is kept whole. */
export function chunkWords(words: OcrWord[]): Chunk[] {
  const ws = words.filter((w) => w.text.trim()).sort((p, q) => p.box.y + p.box.h / 2 - (q.box.y + q.box.h / 2) || p.box.x - q.box.x)
  const rows: OcrWord[][] = []
  for (const w of ws) {
    const cy = w.box.y + w.box.h / 2
    const row = rows.find((r) => {
      const last = r[r.length - 1]
      const h = Math.max(last.box.h, w.box.h)
      return Math.abs(last.box.y + last.box.h / 2 - cy) < 0.45 * h && w.box.x - (last.box.x + last.box.w) < 2.5 * h && w.box.x >= last.box.x
    })
    if (row) row.push(w)
    else rows.push([w])
  }
  const chunks: Chunk[] = []
  for (const row of rows) {
    let cur: OcrWord[] = [row[0]]
    const flush = () => {
      chunks.push({
        text: cur.map((w) => w.text).join(' '),
        box: cur.map((w) => w.box).reduce(union),
        conf: Math.min(...cur.map((w) => w.conf)),
      })
    }
    for (let i = 1; i < row.length; i++) {
      const a = cur[cur.length - 1]
      const b = row[i]
      const gap = b.box.x - (a.box.x + a.box.w)
      const h = Math.max(a.box.h, b.box.h)
      const pair = /[x×X*]$/.test(a.text) || /^[x×X*]/.test(b.text)
      if (gap > 1.2 * h && !pair) {
        flush()
        cur = [b]
      } else cur.push(b)
    }
    flush()
  }
  return chunks
}

/**
 * Chunks → TextItems. A label block = name line(s) stacked and centred, ending with at most one dims line below
 * ("DINING &" / "FAMILY LIVING" / "12'-11\"X23'-10\""). Dims with no name above → a 'dims' item; area strings → 'area'.
 */
export function groupWords(words: OcrWord[]): TextItem[] {
  const chunks = chunkWords(words).sort((a, b) => a.box.y - b.box.y)
  const kinds = chunks.map((c) => kindOf(c.text))
  const parent = chunks.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const hasDims = new Set<number>() // block roots already closed by a dims line
  for (let i = 0; i < chunks.length; i++) {
    if (kinds[i] === 'area' || kinds[i] === 'north') continue
    const c = chunks[i].box
    let best = -1
    let bestGap = Infinity
    for (let j = 0; j < i; j++) {
      if (kinds[j] === 'dims' || kinds[j] === 'area' || kinds[j] === 'north' || hasDims.has(find(j))) continue
      const p = chunks[j].box
      const h = Math.max(p.h, c.h)
      const gap = c.y - (p.y + p.h)
      const overlap = Math.min(p.x + p.w, c.x + c.w) - Math.max(p.x, c.x)
      const centred = Math.abs(p.x + p.w / 2 - (c.x + c.w / 2)) < 0.6 * Math.max(p.w, c.w)
      if (gap > -0.3 * h && gap < 1.1 * h && overlap > 0.3 * Math.min(p.w, c.w) && centred && gap < bestGap) {
        best = j
        bestGap = gap
      }
    }
    if (best >= 0) {
      parent[i] = find(best)
      if (kinds[i] === 'dims') hasDims.add(find(best))
    }
  }
  const blocks = new Map<number, number[]>()
  chunks.forEach((_, i) => {
    const r = find(i)
    blocks.set(r, [...(blocks.get(r) ?? []), i])
  })
  const items: TextItem[] = []
  for (const idx of blocks.values()) {
    let dimsIdx = idx.find((i) => kinds[i] === 'dims')
    const last = idx[idx.length - 1]
    // a trailing line under a name that names no room is the size line OCR garbled ("LOBBY" / "Irs"): keep it as the size
    if (dimsIdx === undefined && idx.length >= 2 && kinds[last] === 'other' && classifyRoom(idx.slice(0, -1).map((i) => chunks[i].text).join(' '))) dimsIdx = last
    const names = idx.filter((i) => i !== dimsIdx && kinds[i] !== 'area')
    const box = idx.map((i) => chunks[i].box).reduce(union)
    const dimsOk = dimsIdx !== undefined && parseDims(chunks[dimsIdx].text)
    const confs = idx.filter((i) => i !== dimsIdx || dimsOk).map((i) => chunks[i].conf) // a garbled size is flagged by its missing dims, not here
    const conf = Math.min(...(confs.length ? confs : idx.map((i) => chunks[i].conf)))
    if (kinds[idx[0]] === 'area') {
      items.push({ text: chunks[idx[0]].text, box, kind: 'area', areaSqm: parseArea(chunks[idx[0]].text)!, conf, source: 'ocr' })
      continue
    }
    const name = names.map((i) => chunks[i].text).join(' ')
    const dims = dimsIdx === undefined ? undefined : (parseDims(chunks[dimsIdx].text) ?? undefined)
    const dimsText = dimsIdx === undefined ? '' : chunks[dimsIdx].text
    const room = name ? classifyRoom(name) : null
    const text = [name, dimsText].filter(Boolean).join('\n')
    if (room) items.push({ text, box, kind: 'room', roomKind: room.kind, green: room.green || undefined, dims, conf, source: 'ocr' })
    else if (kinds[idx[0]] === 'north') items.push({ text, box, kind: 'north', conf, source: 'ocr' })
    else if (!name && dimsIdx !== undefined) items.push({ text, box, kind: 'dims', dims, conf, source: 'ocr' })
    else items.push({ text, box, kind: 'other', dims, conf, source: 'ocr' })
  }
  return items
}

// ---------------------------------------------------------------- what to re-ask the backup AI reader

/** Rooms that never carry a printed size on Dhaka plans: shafts, planter strips, lift/stair/lobby. */
const NO_SIZE_EXPECTED = /\b(AOD|DUCT|SHAFT|VOID|LIFT|STAIRS?|LOBBY|PASSAGE|CORRIDOR)\b/

export type ReaskReason = 'low-confidence' | 'room-without-dims' | 'unparsed-dims'

/**
 * Which items the local pass is unsure of → re-read by the AiReader on a padded crop:
 * low OCR confidence, a room label with no size under it (unless the kind never has one), a size that did not parse.
 */
export function reaskReason(item: TextItem, minConf = 0.6): ReaskReason | null {
  if (item.source === 'ai') return null
  if (item.kind === 'dims' && !item.dims) return 'unparsed-dims'
  if ((item.kind === 'room' || item.kind === 'other') && item.text.includes('\n') && !item.dims) return 'unparsed-dims'
  if (item.kind === 'room' && !item.dims && !item.green && !NO_SIZE_EXPECTED.test(normaliseName(item.text))) return 'room-without-dims'
  if (item.kind !== 'other' && item.conf < minConf) return 'low-confidence'
  return null
}

/** The crop to send for an item: its box grown by `pad` × its height on every side (a missing size sits just below). */
export function reaskCrop(item: TextItem, pad = 1.5): Box {
  const p = item.box.h * pad
  return { x: item.box.x - p, y: item.box.y - p, w: item.box.w + 2 * p, h: item.box.h + 3 * p }
}

export function reaskList(trace: TextTrace, minConf = 0.6): { item: TextItem; reason: ReaskReason; crop: Box }[] {
  return trace.items.flatMap((item) => {
    const reason = reaskReason(item, minConf)
    return reason ? [{ item, reason, crop: reaskCrop(item) }] : []
  })
}

/** A backup-reader answer (text + crop-relative box) → a TextItem in image pixels, parsed with the same rules as OCR. */
export function itemFromAi(text: string, box: Box, offset: { x: number; y: number }): TextItem {
  const b = { x: box.x + offset.x, y: box.y + offset.y, w: box.w, h: box.h }
  const lines = text.split(/\n+/)
  const dimsLine = lines.find((l) => parseDims(l))
  const dims = dimsLine ? parseDims(dimsLine)! : undefined
  const name = lines.filter((l) => l !== dimsLine).join(' ')
  const area = parseArea(text)
  const room = name ? classifyRoom(name) : null
  if (area !== null && !room) return { text, box: b, kind: 'area', areaSqm: area, conf: 0.9, source: 'ai' }
  if (room) return { text, box: b, kind: 'room', roomKind: room.kind, green: room.green || undefined, dims, conf: 0.9, source: 'ai' }
  return { text, box: b, kind: dims ? 'dims' : 'other', dims, conf: 0.9, source: 'ai' }
}

// ---------------------------------------------------------------- preprocessing (pure, on Gray)

/** Max of each pixel's (2r+1)² neighbourhood: the local paper / floor-fill tone under thin strokes. */
export function localMax(g: Gray, r: number): Uint8Array {
  const { width: W, height: H, data } = g
  const tmp = new Uint8Array(W * H)
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r); k++) m = Math.max(m, data[y * W + k])
      tmp[y * W + x] = m
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r); k++) m = Math.max(m, tmp[k * W + x])
      out[y * W + x] = m
    }
  return out
}

/**
 * Keep only glyph-sized dark blobs (walls, furniture outlines, fills, foliage go). A pixel is ink when it is `delta`
 * darker than its local paper tone (so black text on a brown lobby fill and grey text on white both count, light
 * hatching does not). 8-connected ink blobs; glyph height = median height of blobs 4–40 px tall; a blob stays when
 * it is at most 1.6 × that tall and 8 × wide (touching glyphs in small print merge into flat runs). Kept blobs grow by
 * `grow` px into half-contrast pixels (thin grey strokes, anti-aliased rims) and are redrawn as dark-on-white by their
 * contrast; everything else turns white. Returns the cleaned raster, the glyph height and the kept blobs' boxes.
 */
export function cleanForOcr(g: Gray, delta = 40, grow = 1): { gray: Gray; charH: number; glyphs: Box[] } {
  const { width: W, height: H, data } = g
  const bg = localMax(g, 5)
  const ink = (p: number, d: number) => data[p] < bg[p] - d
  const label = new Int32Array(W * H).fill(-1)
  const boxes: number[] = [] // x0, y0, x1, y1, count per component
  const stack: number[] = []
  for (let s = 0; s < W * H; s++) {
    if (!ink(s, delta) || label[s] >= 0) continue
    const id = boxes.length / 5
    let x0 = W
    let y0 = H
    let x1 = 0
    let y1 = 0
    let count = 0
    label[s] = id
    stack.push(s)
    while (stack.length) {
      const p = stack.pop()!
      const x = p % W
      const y = (p - x) / W
      count++
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= H) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= W) continue
          const q = yy * W + xx
          if (label[q] < 0 && ink(q, delta)) {
            label[q] = id
            stack.push(q)
          }
        }
      }
    }
    boxes.push(x0, y0, x1, y1, count)
  }
  const n = boxes.length / 5
  const heights: number[] = []
  for (let i = 0; i < n; i++) {
    const h = boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1
    const w = boxes[i * 5 + 2] - boxes[i * 5] + 1
    if (h >= 4 && h <= 40 && w <= 3 * h) heights.push(h)
  }
  heights.sort((a, b) => a - b)
  const charH = heights.length ? heights[heights.length >> 1] : 10
  const keep = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const w = boxes[i * 5 + 2] - boxes[i * 5] + 1
    const h = boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1
    // glyph runs, vertical glyph runs, and big title glyphs ("2662 SFT" under the plan)
    keep[i] = +(boxes[i * 5 + 4] >= 2 && ((h <= 1.6 * charH && w <= 8 * charH) || (w <= 1.6 * charH && w >= 0.6 * charH && h <= 8 * charH) || (h <= 5 * charH && w <= 1.5 * h)))
  }
  const out = new Uint8Array(W * H).fill(255)
  const draw = (p: number) => (out[p] = Math.max(0, Math.min(254, 255 - 2 * (bg[p] - data[p]))))
  let front: number[] = []
  for (let p = 0; p < W * H; p++) {
    if (label[p] >= 0 && keep[label[p]]) {
      draw(p)
      front.push(p)
    }
  }
  for (let step = 0; step < grow; step++) {
    const next: number[] = []
    for (const p of front) {
      const x = p % W
      for (const q of [p - 1, p + 1, p - W, p + W, p - W - 1, p - W + 1, p + W - 1, p + W + 1]) {
        if (q < 0 || q >= W * H || Math.abs((q % W) - x) > 1 || out[q] !== 255 || !ink(q, delta / 2)) continue
        if (label[q] >= 0 && !keep[label[q]]) continue // never bleed into a dropped wall / line
        draw(q)
        next.push(q)
      }
    }
    front = next
  }
  const glyphs: Box[] = []
  for (let i = 0; i < n; i++) if (keep[i]) glyphs.push({ x: boxes[i * 5], y: boxes[i * 5 + 1], w: boxes[i * 5 + 2] - boxes[i * 5] + 1, h: boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1 })
  return { gray: { width: W, height: H, data: out }, charH, glyphs }
}

/** Bilinear resize by `s`. */
export function scaleGray(g: Gray, s: number): Gray {
  const W = Math.round(g.width * s)
  const H = Math.round(g.height * s)
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    const fy = Math.min(g.height - 1, Math.max(0, (y + 0.5) / s - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(g.height - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < W; x++) {
      const fx = Math.min(g.width - 1, Math.max(0, (x + 0.5) / s - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(g.width - 1, x0 + 1)
      const tx = fx - x0
      const top = g.data[y0 * g.width + x0] * (1 - tx) + g.data[y0 * g.width + x1] * tx
      const bot = g.data[y1 * g.width + x0] * (1 - tx) + g.data[y1 * g.width + x1] * tx
      out[y * W + x] = top * (1 - ty) + bot * ty
    }
  }
  return { width: W, height: H, data: out }
}

/** Rotate 90° clockwise: text printed bottom-to-top reads left-to-right. Pixel (x, y) → (H-1-y, x). */
export function rotateCW(g: Gray): Gray {
  const { width: W, height: H } = g
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[x * H + (H - 1 - y)] = g.data[y * W + x]
  return { width: H, height: W, data: out }
}

/** A sub-rectangle (clamped to the raster), white outside. */
export function cropGray(g: Gray, b: Box): Gray {
  const x0 = Math.round(b.x)
  const y0 = Math.round(b.y)
  const W = Math.max(1, Math.round(b.w))
  const H = Math.max(1, Math.round(b.h))
  const out = new Uint8Array(W * H).fill(255)
  for (let y = 0; y < H; y++) {
    const sy = y0 + y
    if (sy < 0 || sy >= g.height) continue
    for (let x = 0; x < W; x++) {
      const sx = x0 + x
      if (sx >= 0 && sx < g.width) out[y * W + x] = g.data[sy * g.width + sx]
    }
  }
  return { width: W, height: H, data: out }
}

export interface TextLine {
  box: Box
  /** printed bottom-to-top (AOD / E-SHAFT on a shaft) */
  vertical: boolean
}

/**
 * Glyph blobs → text lines, no OCR yet: a blob joins the line whose glyph band (tall glyphs only, so ' " - marks don't
 * stretch it) holds its centre and whose right end is within 1.2 glyph heights. Two lines printed nearly touching
 * (a name over its size) stay apart. Lone upright glyphs stacked in a column form a vertical line; other loners go.
 */
export function findTextLines(glyphs: Box[], charH: number): TextLine[] {
  const gap = 1.2 * charH
  const tall = (b: Box) => b.h >= 0.6 * charH
  interface L {
    box: Box
    y0: number
    y1: number
    n: number
    tall: number
  }
  const lines: L[] = []
  let active: L[] = []
  for (const g of [...glyphs].sort((a, b) => a.x - b.x)) {
    active = active.filter((l) => g.x - (l.box.x + l.box.w) <= Math.max(gap, 1.2 * (l.y1 - l.y0)))
    const cy = g.y + g.h / 2
    let best: L | undefined
    let bestD = Infinity
    for (const l of active) {
      const band = l.y1 - l.y0
      if (cy < l.y0 - 0.25 * band || cy > l.y1 + 0.25 * band || g.h > 1.6 * Math.max(band, 0.6 * charH)) continue
      const d = Math.abs(cy - (l.y0 + l.y1) / 2)
      if (d < bestD) {
        best = l
        bestD = d
      }
    }
    if (best) {
      best.box = union(best.box, g)
      best.n++
      if (tall(g)) {
        best.y0 = best.tall ? Math.min(best.y0, g.y) : g.y
        best.y1 = best.tall ? Math.max(best.y1, g.y + g.h) : g.y + g.h
        best.tall++
      }
    } else {
      const l = { box: g, y0: g.y, y1: g.y + g.h, n: 1, tall: +tall(g) }
      lines.push(l)
      active.push(l)
    }
  }
  const out: TextLine[] = lines.filter((l) => (l.n >= 2 || l.box.w >= 1.5 * l.box.h) && l.tall >= 1 && l.box.w >= 1.2 * charH).map((l) => ({ box: l.box, vertical: false }))
  // vertical: loners (one blob as wide as a glyph is tall: a rotated letter or a rotated merged word) stacked in a column
  const loners = lines
    .filter((l) => l.n === 1 && l.box.w < 1.5 * l.box.h && l.box.w >= 0.6 * charH && l.box.w <= 1.6 * charH)
    .map((l) => l.box)
    .sort((a, b) => a.y - b.y)
  const used = new Set<Box>()
  for (const s of loners) {
    if (used.has(s)) continue
    let col = s
    const members = [s]
    for (const t of loners) {
      if (used.has(t) || t === s || t.y < col.y) continue
      if (t.y - (col.y + col.h) <= 0.8 * charH && Math.abs(t.x + t.w / 2 - (col.x + col.w / 2)) < 0.35 * col.w) {
        col = union(col, t)
        members.push(t)
      }
    }
    if (col.h >= 1.5 * col.w) {
      members.forEach((m) => used.add(m))
      out.push({ box: col, vertical: true })
    }
  }
  return out
}

// ---------------------------------------------------------------- the OCR stage (browser; tesseract.js loaded on first call)

export interface ReadTextOptions {
  /** OCR workers in parallel; default 3 */
  workers?: number
  /** where eng.traineddata comes from; default = tesseract.js's own jsdelivr CDN (4.0.0_best_int, ≈ 2.9 MB gz, cached in IndexedDB) */
  langPath?: string
  onProgress?: (done: number, total: number) => void
}

async function toGray(src: ImageBitmapSource): Promise<Gray> {
  const bmp = await createImageBitmap(src)
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const rgba = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  const data = new Uint8Array(bmp.width * bmp.height)
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return { width: bmp.width, height: bmp.height, data }
}

export function toCanvas(g: Gray): OffscreenCanvas {
  const c = new OffscreenCanvas(g.width, g.height)
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(g.width, g.height)
  for (let i = 0; i < g.data.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g.data[i]
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

const GLYPH_PX = 32 // tesseract's LSTM reads best around this glyph height
const DIMS_CHARS = `0123456789'"-xX/. `

/**
 * Plan raster → every printed label / size / area it can read, in the source image's pixels.
 * Glyph-only mask → text lines found from the blobs → each line cropped, upscaled to ~32 px glyphs and read as one
 * line (vertical ones rotated first) → a line that looks like a size but does not parse is re-read with a digits-only
 * alphabet → grouped into labels.
 */
export async function readText(src: Gray | ImageBitmapSource, opts: ReadTextOptions = {}): Promise<TextTrace> {
  const gray = 'data' in src && 'width' in src && src.data instanceof Uint8Array ? (src as Gray) : await toGray(src as ImageBitmapSource)
  const { gray: clean, charH, glyphs } = cleanForOcr(gray)
  const lines = findTextLines(glyphs, charH)
  const T = await import('tesseract.js')
  const scheduler = T.createScheduler()
  const workers = await Promise.all(
    Array.from({ length: opts.workers ?? 3 }, () => T.createWorker('eng', T.OEM.LSTM_ONLY, opts.langPath ? { langPath: opts.langPath } : {})),
  )
  workers.forEach((w) => scheduler.addWorker(w))
  const setAll = (params: Record<string, string>) => Promise.all(workers.map((w) => w.setParameters(params)))
  try {
    const crop = (i: number, from: Gray, glyphPx: number) => {
      const l = lines[i]
      const pad = 0.4 * Math.min(l.box.w, l.box.h)
      let g = cropGray(from, { x: l.box.x - pad, y: l.box.y - pad, w: l.box.w + 2 * pad, h: l.box.h + 2 * pad })
      if (l.vertical) g = rotateCW(g)
      return toCanvas(scaleGray(g, Math.max(1, Math.min(8, glyphPx / (l.vertical ? l.box.w : l.box.h)))))
    }
    let done = 0
    const readAll = (idx: number[], from = clean, glyphPx = GLYPH_PX) =>
      Promise.all(
        idx.map(async (i) => {
          const { data } = await scheduler.addJob('recognize', crop(i, from, glyphPx))
          opts.onProgress?.(++done, lines.length)
          return { text: data.text.replace(/\s+/g, ' ').trim(), conf: data.confidence / 100 }
        }),
      )
    await setAll({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE, user_defined_dpi: '300' })
    const read = await readAll(lines.map((_, i) => i))
    // every line that is not a room name, an area or a size already — most are a size line OCR garbled (glyphs 6–8 px):
    // re-read digits-only from the masked and the raw raster at two sizes; the first reading that parses wins
    let retry = read.flatMap((r, i) => (!classifyRoom(r.text) && !parseDims(r.text) && parseArea(r.text) === null ? [i] : []))
    if (retry.length) await setAll({ tessedit_char_whitelist: DIMS_CHARS })
    for (const [from, px] of [[clean, GLYPH_PX], [gray, GLYPH_PX], [clean, 24]] as const) {
      if (!retry.length) break
      const again = await readAll(retry, from, px)
      retry = retry.filter((i, k) => !(parseDims(again[k].text) && (read[i] = again[k])))
    }
    const words = (vertical: boolean): OcrWord[] => read.flatMap((r, i) => (r.text && lines[i].vertical === vertical ? [{ text: r.text, conf: r.conf, box: lines[i].box }] : []))
    return { items: [...groupWords(words(false)), ...words(true).flatMap((w) => groupWords([w]))] } // a vertical word stands alone
  } finally {
    await scheduler.terminate()
  }
}

