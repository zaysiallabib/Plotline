/**
 * Text stage of auto-trace: plan raster → TextTrace (room labels + printed dims, area, north), pixel space.
 * Local first: tesseract.js (Apache-2.0), lazily imported inside `readText` only, so nothing reaches a bundle
 * that does not call it. Everything above `readText` is pure (no DOM) and Vitest-covered in text.test.ts.
 */
import { FT, parseLength } from '../core'
import type { RoomKind } from '../core'
import type { Dims, TextItem, TextKind, TextTrace } from './types'

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

/** One side of a "W x L" pair → metres, or null. Feet are the default unit (as core parseLength). */
export function parseSide(raw: string): number | null {
  let t = normaliseQuotes(raw)
    .trim()
    .replace(/^[^0-9A-Za-z|!$]+|[^0-9A-Za-z'"]+$/g, '')
  const metric = /^(.*\d.*?)\s*(m|cm|mm)$/i.exec(t)
  const unit = metric ? metric[2].toLowerCase() : ''
  if (metric) t = metric[1]
  t = t.replace(/[lIi|!OoQDSs$BZzG]/g, (c) => DIGIT_LOOKALIKES[c]).replace(/(\d+)\s+(\d+)\/(\d+)/, (_, a, b, c) => String(+a + +b / +c))
  let v: number | null
  const fi = /^(\d{1,3})\s*(?:'\s*-?|-)\s*(\d{1,2}(?:\.\d+)?)\s*["']?$/.exec(t) // 14'-5"  14'5  14-5"  14'-5' (inch mark read as ')
  if (fi) v = +fi[2] < 12 ? (+fi[1] + +fi[2] / 12) * FT : null
  else v = parseLength(unit ? t + unit : t)
  return v !== null && v >= MIN_M && v <= MAX_M ? v : null
}

/**
 * A printed room size → metres: `14'-5" x 14'-4"`, `14'5"x14'4"`, `14'-0"×16'-0"`, `5'-11 1/2" X 7'`, `4.4m x 3.2m`,
 * `14.4 x 12` (feet), and OCR-mangled variants (`l4'-5"`, `14'-S"`, `14'-5"x 14'-4`, `14'-5"14'-4"`). Else null.
 */
export function parseDims(raw: string): Dims | null {
  const s = normaliseQuotes(raw).trim()
  let parts = s.split(/\s*[x×X*]\s*/).filter((p) => /\d/.test(p))
  if (parts.length === 1) {
    const m = /^(.*?\d\s*")\s*(\d.*)$/.exec(s) // separator lost: 14'-5"14'-4"
    if (m) parts = [m[1], m[2]]
  }
  if (parts.length !== 2) return null
  let [a, b] = parts
  const metric = /m\s*$/i.test(s) && !/['"]/.test(s) // "4.4 x 3.2m": the unit printed once
  if (metric && /\d$/.test(a.trim())) a += 'm'
  const aM = parseSide(a)
  const bM = parseSide(b)
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

const LOOKS_LIKE_DIMS = /\d.*['"].*[x×X*]|[x×X*].*\d.*['"]|\d\s*['"]\s*-?\s*\d/

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
    const names = idx.filter((i) => kinds[i] !== 'dims' && kinds[i] !== 'area')
    const dimsIdx = idx.find((i) => kinds[i] === 'dims')
    const box = idx.map((i) => chunks[i].box).reduce(union)
    const conf = Math.min(...idx.map((i) => chunks[i].conf))
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
