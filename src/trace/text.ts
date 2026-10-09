/**
 * Text stage of auto-trace: plan raster → TextTrace (room labels + printed dims, area, north), pixel space.
 * Local first: tesseract.js (Apache-2.0), lazily imported inside `readText` only, so nothing reaches a bundle
 * that does not call it. Everything above `readText` is pure (no DOM) and Vitest-covered in text.test.ts.
 */
import { FT, parseLength, pointInPolygon, polygonCentroid } from '../core'
import type { RoomKind } from '../core'
import { capBand, readSizes, topMarks } from './sizes'
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

/** Short plan abbreviations, and the letter pairs small print confuses: one such swap is read as the word ("POR" → PDR). */
const SHORT = 'PDR BED VER AOD ODU WIC KIT'.split(' ')
const LOOKALIKE = new Set(['OD', 'DO', 'OQ', 'QO', 'DQ', 'QD', 'EF', 'FE', 'IL', 'LI', 'ER', 'RE', 'BE', 'EB', 'BR', 'RB', 'UV', 'VU', 'CG', 'GC', 'PR', 'RP', 'EI', 'IE'])
function snapShort(tok: string): string {
  const core = tok.replace(/\.+$/, '') // "POR." → PDR.
  if (core.length !== 3 || SHORT.includes(core)) return tok
  const w = SHORT.find((s) => [...s].filter((c, i) => c !== core[i]).length === 1 && [...s].every((c, i) => c === core[i] || LOOKALIKE.has(c + core[i])))
  return w ? w + tok.slice(3) : tok
}

/** Words of room names, for the loose snap below (incl. plan spellings like DINNING). */
const LEXICON = [...WORDS, ...SHORT, 'BEDROOM', 'ROOM', 'HELP', 'OPEN', 'DRY', 'FORMAL', 'DINNING', 'TOILET', 'VERANDA']
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}

/**
 * A line that sits right over a size is a room name, so its words may be snapped harder than anywhere else: each word of
 * ≥ 4 letters to the one lexicon word within ⌊len / 3⌋ edits ("KRTEHEN" → KITCHEN, "STAR" → STAIR); a tie snaps nothing.
 */
export function snapRoomWords(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9.&/ -]+/g, ' ')
    .split(/\s+/)
    .map((tok) => {
      const w = tok.replace(/[^A-Z]/g, '')
      if (w.length < 4 || LEXICON.includes(w)) return tok
      const max = Math.floor(w.length / 3)
      const hits = LEXICON.map((l) => ({ l, d: levenshtein(w, l) })).filter((h) => h.d <= max)
      const best = Math.min(...hits.map((h) => h.d))
      const at = hits.filter((h) => h.d === best)
      return at.length === 1 ? at[0].l : tok
    })
    .join(' ')
    .trim()
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
      return snapShort(tok)
    })
    .join(' ')
    .trim()
}

/**
 * A read name's stray letters at its ends dropped — "I TOILET" → TOILET, "BED LQ" → BED, "HELP RO RS" → HELP (scoreboard:
 * "Help Ro Rs"): a token of 1–3 letters that is no plan word; M / S / H / K / C stay (M BED, S TOILET, K VER). Only when a
 * plan word is left; anything else is returned as read.
 */
export function trimName(n: string): string {
  const keep = (t: string) => !/^[A-Z]{1,3}$/.test(t) || LEXICON.includes(t) || /^[MSHKC]$/.test(t) || t === 'WC'
  const toks = n.split(' ').filter(Boolean)
  let a = 0
  let b = toks.length
  while (a < b && !keep(toks[a])) a++
  while (b > a && !keep(toks[b - 1])) b--
  const out = toks.slice(a, b)
  return out.some((t) => LEXICON.includes(t.replace(/[^A-Z]/g, ''))) ? out.join(' ') : n
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
  /** a size line by the size reader: 'sure' (text = the reading), 'unsure' (never parsed; `guess` = best guess) */
  size?: 'sure' | 'unsure'
  guess?: string
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
  size?: 'sure' | 'unsure'
  guess?: string
}

function kindOf(text: string, size?: Chunk['size']): TextKind {
  if (size) return 'dims'
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
        size: cur[0].size, // a size word is a chunk of its own
        guess: cur[0].guess,
      })
    }
    for (let i = 1; i < row.length; i++) {
      const a = cur[cur.length - 1]
      const b = row[i]
      const gap = b.box.x - (a.box.x + a.box.w)
      const h = Math.max(a.box.h, b.box.h)
      const pair = /[x×X*]$/.test(a.text) || /^[x×X*]/.test(b.text)
      if ((gap > 1.2 * h && !pair) || a.size || b.size) {
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
  const kinds = chunks.map((c) => kindOf(c.text, c.size))
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
    const sizeChunk = dimsIdx === undefined ? undefined : chunks[dimsIdx]
    // an unsure size is never parsed: the item carries the flag + the line's box instead (the Studio asks for it)
    const unread = sizeChunk?.size === 'unsure' ? { sizeUnread: true, sizeBox: sizeChunk.box, ...(sizeChunk.guess ? { sizeGuess: sizeChunk.guess } : {}) } : {}
    const dims = !sizeChunk || sizeChunk.size === 'unsure' ? undefined : (parseDims(sizeChunk.text) ?? undefined)
    const dimsText = sizeChunk?.text ?? ''
    const room = name ? classifyRoom(name) : null
    const text = [name, dimsText].filter(Boolean).join('\n')
    if (room) items.push({ text, box, kind: 'room', roomKind: room.kind, green: room.green || undefined, dims, conf, source: 'ocr', ...unread })
    else if (kinds[idx[0]] === 'north') items.push({ text, box, kind: 'north', conf, source: 'ocr' })
    else if (!name && dimsIdx !== undefined) items.push({ text, box, kind: 'dims', dims, conf, source: 'ocr', ...unread })
    else items.push({ text, box, kind: 'other', dims, conf, source: 'ocr', ...unread })
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
  const mask = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) mask[p] = +ink(p, delta)
  /** 8-connected blobs of `m`: label per pixel, x0, y0, x1, y1, count per blob */
  const blobs = (m: Uint8Array) => {
    const label = new Int32Array(W * H).fill(-1)
    const boxes: number[] = []
    const stack: number[] = []
    for (let s = 0; s < W * H; s++) {
      if (!m[s] || label[s] >= 0) continue
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
            if (label[q] < 0 && m[q]) {
              label[q] = id
              stack.push(q)
            }
          }
        }
      }
      boxes.push(x0, y0, x1, y1, count)
    }
    return { label, boxes, n: boxes.length / 5 }
  }
  const first = blobs(mask)
  const heights: number[] = []
  for (let i = 0; i < first.n; i++) {
    const h = first.boxes[i * 5 + 3] - first.boxes[i * 5 + 1] + 1
    const w = first.boxes[i * 5 + 2] - first.boxes[i * 5] + 1
    if (h >= 4 && h <= 40 && w <= 3 * h) heights.push(h)
  }
  heights.sort((a, b) => a - b)
  const charH = heights.length ? heights[heights.length >> 1] : 10
  // rules: ink runs along a row or a column longer than the tallest glyph kept below (5 × charH: wall edges, floor-tile
  // lines, dimension lines). A glyph touching one (a size printed on the floor pattern) merged into it and was dropped
  // with it; cut them apart first.
  const L = Math.max(12, Math.round(5 * charH) + 1)
  const rule = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; ) {
      if (!mask[y * W + x]) {
        x++
        continue
      }
      let e = x
      while (e < W && mask[y * W + e]) e++
      if (e - x >= L) rule.fill(1, y * W + x, y * W + e)
      x = e
    }
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; ) {
      if (!mask[y * W + x]) {
        y++
        continue
      }
      let e = y
      while (e < H && mask[e * W + x]) e++
      if (e - y >= L) for (let k = y; k < e; k++) rule[k * W + x] = 1
      y = e
    }
  const glyphLike = (bx: number[], i: number) => {
    const w = bx[i * 5 + 2] - bx[i * 5] + 1
    const h = bx[i * 5 + 3] - bx[i * 5 + 1] + 1
    // glyph runs, vertical glyph runs, and big title glyphs ("2662 SFT" under the plan)
    return bx[i * 5 + 4] >= 2 && ((h <= 1.6 * charH && w <= 8 * charH) || (w <= 1.6 * charH && w >= 0.6 * charH && h <= 8 * charH) || (h <= 5 * charH && w <= 1.5 * h))
  }
  const keep1 = Uint8Array.from({ length: first.n }, (_, i) => +glyphLike(first.boxes, i))
  for (let p = 0; p < W * H; p++) if (rule[p]) mask[p] = 0
  const { label, boxes, n } = blobs(mask)
  const parent = new Int32Array(n).fill(-1)
  for (let p = 0; p < W * H; p++) if (label[p] >= 0 && parent[label[p]] < 0) parent[label[p]] = first.label[p]
  const keep = new Uint8Array(n)
  const box = (i: number): Box => ({ x: boxes[i * 5], y: boxes[i * 5 + 1], w: boxes[i * 5 + 2] - boxes[i * 5] + 1, h: boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1 })
  const rescue: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep1[parent[i]]) keep[i] = +glyphLike(boxes, i)
    else if (boxes[i * 5 + 4] >= 2 && box(i).h <= 1.6 * charH && box(i).w <= 3 * charH) rescue.push(i)
  }
  // a fragment cut off a dropped blob comes back only when it sits on a kept glyph's band right next to it ("3'" of
  // "3'-9\"X4'-5\"" touching the floor line); repeated so a chain of them ("3'" → "3") returns
  const cell = 4 * charH
  const grid = new Map<number, number[]>()
  const addGrid = (i: number) => {
    const b = box(i)
    for (let cy = Math.floor(b.y / cell); cy <= Math.floor((b.y + b.h) / cell); cy++)
      for (let cx = Math.floor(b.x / cell); cx <= Math.floor((b.x + b.w) / cell); cx++) {
        const k = cy * 100000 + cx
        grid.set(k, [...(grid.get(k) ?? []), i])
      }
  }
  for (let i = 0; i < n; i++) if (keep[i]) addGrid(i)
  for (let round = 0, added = 1; round < 4 && added; round++) {
    added = 0
    for (const i of rescue) {
      if (keep[i]) continue
      const b = box(i)
      const near = grid.get(Math.floor((b.y + b.h / 2) / cell) * 100000 + Math.floor((b.x + b.w / 2) / cell)) ?? []
      const ok = [...near, ...(grid.get(Math.floor((b.y + b.h / 2) / cell) * 100000 + Math.floor((b.x + b.w / 2) / cell) - 1) ?? []), ...(grid.get(Math.floor((b.y + b.h / 2) / cell) * 100000 + Math.floor((b.x + b.w / 2) / cell) + 1) ?? [])].some((j) => {
        const k = box(j)
        if (k.h < 0.6 * charH || k.h > 1.6 * charH) return false
        const gap = Math.max(k.x - (b.x + b.w), b.x - (k.x + k.w))
        const overlap = Math.min(b.y + b.h, k.y + k.h) - Math.max(b.y, k.y)
        return gap <= 0.8 * charH && overlap >= 0.5 * Math.min(b.h, k.h) && b.y >= k.y - 0.4 * k.h && b.y + b.h <= k.y + k.h + 0.4 * k.h
      })
      if (ok) {
        keep[i] = 1
        addGrid(i)
        added++
      }
    }
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
        if (q < 0 || q >= W * H || Math.abs((q % W) - x) > 1 || out[q] !== 255 || rule[q] || !ink(q, delta / 2)) continue
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

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
const KERNELS = {
  lanczos: { r: 3, f: (x: number) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0) },
  cubic: { r: 2, f: (x: number) => ((x = Math.abs(x)), x < 1 ? 1.5 * x ** 3 - 2.5 * x ** 2 + 1 : x < 2 ? -0.5 * x ** 3 + 2.5 * x ** 2 - 4 * x + 2 : 0) },
}

/** Separable resize by `s` with a Lanczos-3 or Keys-cubic kernel (sharper glyph edges than bilinear for the OCR). */
export function resample(g: Gray, s: number, kernel: keyof typeof KERNELS): Gray {
  const { r, f } = KERNELS[kernel]
  const W = Math.round(g.width * s)
  const H = Math.round(g.height * s)
  const pass = (src: Float32Array, sw: number, sh: number, dw: number, dh: number, horiz: boolean) => {
    const out = new Float32Array(dw * dh)
    const n = horiz ? dw : dh
    for (let i = 0; i < n; i++) {
      const c = (i + 0.5) / s - 0.5
      const lo = Math.floor(c) - r + 1
      const ws = Array.from({ length: 2 * r }, (_, k) => f(c - (lo + k)))
      const sum = ws.reduce((a, b) => a + b, 0)
      for (let j = 0; j < (horiz ? dh : dw); j++) {
        let acc = 0
        for (let k = 0; k < 2 * r; k++) {
          const t = Math.min((horiz ? sw : sh) - 1, Math.max(0, lo + k))
          acc += ws[k] * (horiz ? src[j * sw + t] : src[t * sw + j])
        }
        out[horiz ? j * dw + i : i * dw + j] = acc / sum
      }
    }
    return out
  }
  const across = pass(Float32Array.from(g.data), g.width, g.height, W, g.height, true)
  const both = pass(across, W, g.height, W, H, false)
  return { width: W, height: H, data: Uint8Array.from(both, (v) => Math.max(0, Math.min(255, Math.round(v)))) }
}

/** Contrast stretch: the darkest 2 % → black, the paper (60th percentile) → white. */
export function stretch(g: Gray): Gray {
  const v = Uint8Array.from(g.data).sort()
  const a = v[Math.floor(0.02 * (v.length - 1))]
  const b = Math.max(a + 1, v[Math.floor(0.6 * (v.length - 1))])
  return { ...g, data: Uint8Array.from(g.data, (x) => Math.max(0, Math.min(255, Math.round(((x - a) * 255) / (b - a))))) }
}

/** `p` px of white around. */
export function pad(g: Gray, p: number): Gray {
  const W = g.width + 2 * p
  const out = new Uint8Array(W * (g.height + 2 * p)).fill(255)
  for (let y = 0; y < g.height; y++) out.set(g.data.subarray(y * g.width, (y + 1) * g.width), (y + p) * W + p)
  return { width: W, height: g.height + 2 * p, data: out }
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
    /** height of the line's first tall glyph */
    ref: number
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
      // a tall blob joins only lines of its own glyph height: a door-arc piece or a wall-end bar next to a label used to
      // stretch the band until the name and the size line under it were one "line"
      if (tall(g) && l.ref && (g.h > 1.6 * l.ref || g.h < 0.6 * l.ref)) continue
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
        best.ref ||= g.h
        best.tall++
      }
    } else {
      const l = { box: g, y0: g.y, y1: g.y + g.h, n: 1, tall: +tall(g), ref: tall(g) ? g.h : 0 }
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
  /** node only (the eval): the folder holding eng.traineddata, so no download */
  cachePath?: string
  onProgress?: (done: number, total: number) => void
}

/** Gray → binary PGM bytes. tesseract.js decodes it (leptonica) in the browser worker and in node alike — no canvas. */
export function toPgm(g: Gray): Uint8Array {
  const head = new TextEncoder().encode(`P5\n${g.width} ${g.height}\n255\n`)
  const out = new Uint8Array(head.length + g.data.length)
  out.set(head)
  out.set(g.data, head.length)
  return out
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

/** Above this per-pixel residual a line is not taken for a size at all (name lines read as sizes fit ≥ ~0.06). */
const UNSURE_FIT = 0.05
/** A full two-sided reading this close is a size line even with no separate mark blobs (names forced through: ≥ 0.013, never full form). */
const FULL_FORM_FIT = 0.03
/** The size line's alphabet (tesseract whitelist for the size passes). */
const SIZE_CHARS = `0123456789'"-xX`
/**
 * Tesseract's views of a size line (wave 19 eval, sizes confirmed of 87: these four 51, the first three 48, cap-only
 * views 46–49): raw crop Lanczos to 48 px glyphs / cubic to 40 px; the glyph-only mask cubic 40 px; the raw crop cut to
 * the digits' cap band, Lanczos 48 px.
 */
const SIZE_VIEWS: { from: 'raw' | 'clean'; px: number; kernel: 'lanczos' | 'cubic'; cap?: boolean }[] = [
  { from: 'raw', px: 48, kernel: 'lanczos' },
  { from: 'raw', px: 40, kernel: 'cubic' },
  { from: 'clean', px: 40, kernel: 'cubic' },
  { from: 'raw', px: 48, kernel: 'lanczos', cap: true },
]

/**
 * Second looks at a line tesseract did not read as a room name nor a size: capitals only, three other views — 'own' = the
 * raw crop with only the line's own glyph blobs kept (the size line under it, a bed's edge above, a wall beside it
 * white). Level 3 (2026-10-09): on Sheltech L2 the plain crop read "" for LIVING, FOYER, PDR and VER, the own-glyph
 * crop read them all.
 */
const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-&/ '
const NAME_VIEWS: { from: 'raw' | 'clean' | 'own'; px: number; kernel: 'lanczos' | 'cubic' }[] = [
  { from: 'own', px: 48, kernel: 'lanczos' },
  { from: 'raw', px: 40, kernel: 'cubic' },
  { from: 'clean', px: 48, kernel: 'lanczos' },
]

/** the building core's names: they decide where a flat ends (solve.ts), so a second look never adds one */
const CORE_WORDS = /\b(L[O0][B8]{2}Y|LIFTS?|STAIRS?|HOISTWAY|CORE)\b/
/**
 * A room name a second look may add: any room name over a size line (as before Level 3), elsewhere a flat's room only —
 * on Sheltech L2 a second look read the west LIFT, and the core rules then cut Type B's foyer and Bed 2 off its draft.
 */
const flatRoom = (t: string, overSize: boolean) => !!classifyRoom(t) && (overSize || !CORE_WORDS.test(normaliseName(t)))

/** The crop `c` (cut at `at`) with only the glyph blobs whose centre is inside `line` kept (grown by 1 px); the rest white. */
export function ownGlyphs(c: Gray, at: Box, line: Box, glyphs: Box[]): Gray {
  const out = new Uint8Array(c.data.length).fill(255)
  const x0 = Math.round(at.x), y0 = Math.round(at.y)
  for (const q of glyphs) {
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2
    if (cx < line.x || cx > line.x + line.w || cy < line.y || cy > line.y + line.h) continue
    for (let y = Math.max(0, q.y - 1 - y0); y < Math.min(c.height, q.y + q.h + 1 - y0); y++)
      for (let x = Math.max(0, q.x - 1 - x0); x < Math.min(c.width, q.x + q.w + 1 - x0); x++) out[y * c.width + x] = c.data[y * c.width + x]
  }
  return { ...c, data: out }
}

/**
 * A text line as tesseract gets it: cropped (vertical ones turned upright), resampled to ~`px` glyphs, stretched, padded.
 * With `cap` (a size line's cap band) the crop and the scale follow the digits, not the line box — a box swollen by a wall
 * stub or the name above made the digits small and the crop noisy, and tesseract read nothing.
 */
export function lineImage(g: Gray, l: TextLine, px: number, kernel: 'lanczos' | 'cubic', cap?: { y0: number; y1: number }, own?: Box[]): Blob {
  const ch = cap ? cap.y1 - cap.y0 : l.vertical ? l.box.w : l.box.h
  const p = cap ? 0.6 * ch : 0.4 * Math.min(l.box.w, l.box.h)
  const at = cap ? { x: l.box.x - p, y: cap.y0 - 0.5 * ch, w: l.box.w + 2 * p, h: 2 * ch } : { x: l.box.x - p, y: l.box.y - p, w: l.box.w + 2 * p, h: l.box.h + 2 * p }
  let c = cropGray(g, at)
  if (own) c = ownGlyphs(c, at, l.box, own)
  if (l.vertical) c = rotateCW(c)
  c = pad(stretch(resample(c, Math.max(1, Math.min(8, px / ch)), kernel)), 12)
  // raw image bytes are fine for tesseract.js (its loadImage wraps them in a Uint8Array); its types only list Blob & co.
  return toPgm(c) as unknown as Blob
}

/**
 * Plan raster → every printed label / size / area it can read, in the source image's pixels.
 * Glyph-only mask → text lines found from the blobs → every line read by tesseract (raw crop, Lanczos-upscaled to ~48 px
 * glyphs) → the lines that could be a size (not a room name / area, wide enough) read again with the size alphabet in
 * three views and by the template size reader (sizes.ts), which decides: sure size, unsure size (flagged, never
 * parsed), or no size → grouped into labels.
 */
export async function readText(src: Gray | ImageBitmapSource, opts: ReadTextOptions = {}): Promise<TextTrace> {
  const gray = 'data' in src && 'width' in src && src.data instanceof Uint8Array ? (src as Gray) : await toGray(src as ImageBitmapSource)
  const { gray: clean, charH, glyphs } = cleanForOcr(gray)
  const lines = findTextLines(glyphs, charH)
  const T = await import('tesseract.js')
  const scheduler = T.createScheduler()
  const workers = await Promise.all(
    Array.from({ length: opts.workers ?? 3 }, () =>
      T.createWorker('eng', T.OEM.LSTM_ONLY, { ...(opts.langPath ? { langPath: opts.langPath } : {}), ...(opts.cachePath ? { cachePath: opts.cachePath } : {}) }),
    ),
  )
  workers.forEach((w) => scheduler.addWorker(w))
  const setAll = (params: Record<string, string>) => Promise.all(workers.map((w) => w.setParameters(params)))
  try {
    let done = 0
    let total = lines.length
    const readAll = (idx: number[], image: (l: TextLine) => Blob) =>
      Promise.all(
        idx.map(async (i) => {
          const { data } = await scheduler.addJob('recognize', image(lines[i]))
          opts.onProgress?.(++done, total)
          return { text: data.text.replace(/\s+/g, ' ').trim(), conf: data.confidence / 100 }
        }),
      )
    await setAll({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE, user_defined_dpi: '300' })
    const read = await readAll(
      lines.map((_, i) => i),
      (l) => lineImage(gray, l, 48, 'lanczos'),
    )
    // size candidates: horizontal, ≥ 2.5 line heights wide, not read as a room name or an area
    const cand = lines.flatMap((l, i) => (!l.vertical && l.box.w > 2.5 * l.box.h && !classifyRoom(read[i].text) && parseArea(read[i].text) === null ? [i] : []))
    total += cand.length * SIZE_VIEWS.length
    await setAll({ tessedit_char_whitelist: SIZE_CHARS })
    const views: string[][] = cand.map(() => [])
    const caps = new Map(cand.map((i) => [lines[i], capBand(glyphs, lines[i].box)]))
    for (const v of SIZE_VIEWS) (await readAll(cand, (l) => lineImage(v.from === 'raw' ? gray : clean, l, v.px, v.kernel, v.cap ? caps.get(l) : undefined))).forEach((r, k) => views[k].push(r.text))
    const sizes = readSizes(
      clean,
      glyphs,
      cand.map((i, k) => ({ box: lines[i].box, tess: views[k] })),
    )
    const size = new Map(cand.map((i, k) => [i, { read: sizes[k], views: views[k] }]))
    // looks like a size line at all: fits the size templates and shows foot / inch marks or reads digit-heavy — a room name
    // forced through the grammar ("TOILET 2" → 10'x41) has neither
    const isSize = (i: number) => {
      const r = size.get(i)?.read
      if (!r || r.fit > UNSURE_FIT) return false
      const t = read[i].text
      const digits = t.replace(/\D/g, '').length
      // or the matcher reads the full F'-I"xF'-I" form closely (marks merged into the digits on 6–7 px print)
      const full = /^\d{1,2}'-\d{1,2}"x\d{1,2}'-\d{1,2}"$/.test(r.text) && r.fit <= FULL_FORM_FIT
      return r.sure || full || topMarks(glyphs, lines[i].box) > 0 || (digits > 0 && digits >= t.replace(/[^A-Za-z]/g, '').length)
    }
    // a line read as no room name, no size, no area: three more views of it (a name the plain crop missed). The line right
    // above a size is a room name, so its words may then be snapped hard to the room lexicon
    const over = (j: number) =>
      lines.some((s, i) => {
        if (!isSize(i)) return false
        const n = lines[j]
        const gap = s.box.y - (n.box.y + n.box.h)
        return gap > -0.3 * s.box.h && gap < 1.1 * Math.max(s.box.h, n.box.h) && Math.abs(n.box.x + n.box.w / 2 - (s.box.x + s.box.w / 2)) < 0.6 * Math.max(n.box.w, s.box.w)
      })
    const names = lines.flatMap((n, j) => (n.vertical || isSize(j) || classifyRoom(read[j].text) || parseArea(read[j].text) !== null ? [] : [j]))
    if (names.length) {
      total += NAME_VIEWS.length * names.length
      // (tesseract's own notes on odd crops — "Image too small to scale", "Detected 3 diacritics" — go nowhere)
      await setAll({ tessedit_char_whitelist: NAME_CHARS, debug_file: '/dev/null' })
      const seen = names.map((j) => [read[j].text])
      for (const v of NAME_VIEWS) {
        const again = await readAll(names, (l) => lineImage(v.from === 'clean' ? clean : gray, l, v.px, v.kernel, undefined, v.from === 'own' ? glyphs : undefined))
        names.forEach((j, k) => (seen[k].push(again[k].text), !classifyRoom(read[j].text) && flatRoom(again[k].text, over(j)) && (read[j] = again[k])))
      }
      // still no room name over a size: the views' words snapped hard to the room lexicon
      names.forEach((j, k) => {
        if (classifyRoom(read[j].text) || !over(j)) return
        const snapped = seen[k].map(snapRoomWords).find((t) => classifyRoom(t))
        if (snapped) read[j] = { text: snapped, conf: 0.5 }
      })
    }
    const words = (vertical: boolean): OcrWord[] =>
      lines.flatMap((l, i): OcrWord[] => {
        if (l.vertical !== vertical) return []
        const s = size.get(i)
        if (s?.read?.sure) return [{ text: s.read.text, conf: 0.95, box: l.box, size: 'sure' }]
        // a size line nobody can confirm: flagged, never parsed
        if (isSize(i)) return [{ text: read[i].text || s!.read!.text, conf: 0.3, box: l.box, size: 'unsure', guess: s!.read!.text }]
        return read[i].text ? [{ text: read[i].text, conf: read[i].conf, box: l.box }] : []
      })
    const items = [...groupWords(words(false)), ...words(true).flatMap((w) => groupWords([w]))] // a vertical word stands alone
    // a room that should carry a printed size and has none read: the Studio asks for it (unless the AI reads it first)
    for (const it of items) if (!it.dims && (reaskReason(it) === 'room-without-dims' || (it.kind === 'room' && reaskReason(it) === 'unparsed-dims'))) it.sizeUnread = true
    return { items, glyphPx: charH }
  } finally {
    await scheduler.terminate()
  }
}

/**
 * Two whole-face views (tesseract's own page layout on the raw crop, capitals only): one block at ~40 px letters, sparse
 * text at ~32 px. Level 3 (2026-10-09): on Sheltech L2 / L4 they read TOILET 1 (grey, a door arc through it), PDR (its
 * size touching the basin), TOILET 2 and VER where the line finder had lost the glyphs; on BTI and Banani nothing false.
 */
const FACE_VIEWS: { px: number; psm: 'SINGLE_BLOCK' | 'SPARSE_TEXT' }[] = [
  { px: 40, psm: 'SINGLE_BLOCK' },
  { px: 32, psm: 'SPARSE_TEXT' },
]

/**
 * Level 3: the closed faces (sheet px polygons) no room name was read in, read whole — a name the line finder lost
 * (glyphs glued to a fixture, a door arc, a counter line) still names its room. A face whose read names a room gives a
 * room item at a point inside it (no size: a size is only ever taken from a size line); one the sheet's reading already
 * has nearby (the same name within 1 m of the face) is not read twice. Faces of 0.8–40 m² only.
 */
export async function readInFaces(g: Gray, faces: { x: number; y: number }[][], trace: TextTrace, pxPerM: number, opts: Pick<ReadTextOptions, 'langPath' | 'cachePath'> = {}): Promise<TextItem[]> {
  const ch = trace.glyphPx ?? 8
  const rooms = trace.items.filter((it) => it.kind === 'room')
  const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const todo = faces.flatMap((poly) => {
    if (rooms.some((it) => pointInPolygon(centre(it.box), poly))) return []
    const area = Math.abs(poly.reduce((t, p, i) => t + p.x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * p.y, 0)) / 2 / pxPerM ** 2
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
    const box = { x: Math.min(...xs) + 3, y: Math.min(...ys) + 3, w: Math.max(...xs) - Math.min(...xs) - 6, h: Math.max(...ys) - Math.min(...ys) - 6 }
    const at = polygonCentroid(poly)
    return area >= 0.8 && area <= 40 && box.w >= 2 * ch && box.h >= ch && pointInPolygon(at, poly) ? [{ poly, box, at }] : []
  })
  if (!todo.length) return []
  const T = await import('tesseract.js')
  const worker = await T.createWorker('eng', T.OEM.LSTM_ONLY, { ...(opts.langPath ? { langPath: opts.langPath } : {}), ...(opts.cachePath ? { cachePath: opts.cachePath } : {}) })
  const out: TextItem[] = []
  try {
    const found = new Map<number, string>()
    for (const v of FACE_VIEWS) {
      await worker.setParameters({ tessedit_pageseg_mode: T.PSM[v.psm], user_defined_dpi: '300', tessedit_char_whitelist: NAME_CHARS, debug_file: '/dev/null' })
      for (const [i, f] of todo.entries()) {
        if (found.has(i)) continue
        const img = pad(stretch(resample(cropGray(g, f.box), Math.max(1, Math.min(8, v.px / ch)), 'lanczos')), 12)
        const { data } = await worker.recognize(toPgm(img) as unknown as Blob)
        const name = data.text.split('\n').map((l) => l.trim()).find((l) => flatRoom(l, false))
        if (name) found.set(i, name)
      }
    }
    for (const [i, name] of found) {
      const f = todo[i]
      const n = normaliseName(name)
      const grown = { x: f.box.x - pxPerM, y: f.box.y - pxPerM, w: f.box.w + 2 * pxPerM, h: f.box.h + 2 * pxPerM }
      const inGrown = (b: Box) => { const c = centre(b); return c.x >= grown.x && c.x <= grown.x + grown.w && c.y >= grown.y && c.y <= grown.y + grown.h }
      if (rooms.some((it) => inGrown(it.box) && normaliseName(it.text.split('\n')[0]) === n)) continue
      const room = classifyRoom(name)!
      out.push({ text: name, box: { x: f.at.x - ch, y: f.at.y - ch / 2, w: 2 * ch, h: ch }, kind: 'room', roomKind: room.kind, green: room.green || undefined, conf: 0.5, source: 'ocr' })
    }
  } finally {
    await worker.terminate()
  }
  return out
}
