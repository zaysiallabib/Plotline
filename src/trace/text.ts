/**
 * Text stage of auto-trace: plan raster → TextTrace (room labels + printed dims, area, north), pixel space.
 * Local first: tesseract.js (Apache-2.0), lazily imported inside `readText` only, so nothing reaches a bundle
 * that does not call it. Everything above `readText` is pure (no DOM) and Vitest-covered in text.test.ts.
 */
import { FT, parseLength, pointInPolygon, polygonCentroid } from '../core'
import type { RoomKind } from '../core'
import { capBand, readSizes, topMarks } from './sizes'
import type { Dims, Gray, SizeTable, TableRow, TextItem, TextKind, TextTrace } from './types'

type Box = TextItem['box']

// ---------------------------------------------------------------- printed dimensions

const MIN_M = 0.6 // 2 ft: nothing narrower gets a printed size
const MAX_M = 20 // 65 ft: a longer "room" is an OCR misread

/** OCR look-alikes of digits, fixed only inside a dimension string (never in room names). */
const DIGIT_LOOKALIKES: Record<string, string> = { l: '1', I: '1', i: '1', '|': '1', '!': '1', O: '0', o: '0', Q: '0', D: '0', S: '5', s: '5', $: '5', B: '8', Z: '2', z: '2', G: '6' }

function normaliseQuotes(s: string): string {
  return s
    .replace(/[‘’′`´™]/g, "'") // (™: a foot mark white on dark ground, Ena legends)
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

/** "±2,736 SFT", "2736 sft", "2023 SQT (Approx.)", "2703 SFT & 674 SFT" (first one), "254 sqm" → m². Else null. */
export function parseArea(raw: string): number | null {
  const m = /(\d[\d,]{2,6}(?:\.\d+)?)\s*(S\.?\s*F\.?\s*T|SQ\.?\s*FT|SQ\.?\s*T|FT2|FT²|SQ\.?\s*M|SQM|M2|M²)\b/i.exec(raw.replace(/²/g, '2'))
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  const sqm = /M/i.test(m[2].replace(/FT/i, '')) && !/F/i.test(m[2]) ? v : v * FT * FT
  return sqm >= 10 && sqm <= 10000 ? sqm : null
}

/**
 * A size exactly in the printed grammar, else null: F'-I"xF'-I" (inches 0–11, optional ½, feet 1–39, x / X / ×), a side
 * may be bare feet (15X18'-3") when the other carries marks. Stricter than parseDims on purpose: the model's text is
 * trusted only when it is a well-formed size.
 */
export function strictSize(raw: string): Dims | null {
  const s = raw
    .replace(/[‘’′`´]/g, "'")
    .replace(/[“”″]|''/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, '')
  const side = String.raw`(\d{1,2})(?:'(?:-?(\d{1,2})(½|1\/2)?")?)?`
  const m = new RegExp(`^${side}[xX×]${side}$`).exec(s)
  if (!m || !/['"]/.test(s)) return null
  const one = (f: string, i?: string, half?: string) => {
    const ft = +f
    const inch = i === undefined ? 0 : +i
    return ft >= 1 && ft <= 39 && inch <= 11 ? (ft + (inch + (half ? 0.5 : 0)) / 12) * FT : null
  }
  const a = one(m[1], m[2], m[3])
  const b = one(m[4], m[5], m[6])
  return a !== null && b !== null && a >= 0.6 && b >= 0.6 ? { aM: a, bM: b } : null
}

// ---------------------------------------------------------------- room names

/** Words a room name is made of; a token one edit away from one of these (length ≥ 5) is read as it ("KlTCHEN", "T0ILET"). */
const WORDS = 'KITCHEN TOILET VERANDA VERANDAH BALCONY LIVING DINING DRAWING FAMILY STUDY LOBBY STAIR FOYER PASSAGE STORE SERVANT CLOSET PLANTER SUNSHADE POWDER PRAYER UTILITY LAUNDRY MASTER GUEST CHILD SHAFT LANDSCAPE GREEN WALK LIFT BATH SUITE PANTRY LOUNGE ENTRY TERRACE DRESSING CORRIDOR OFFICE GARDEN SERVICE'.split(' ')
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
const LOOKALIKE = new Set(['OD', 'DO', 'OQ', 'QO', 'DQ', 'QD', 'EF', 'FE', 'IL', 'LI', 'ER', 'RE', 'BE', 'EB', 'BR', 'RB', 'UV', 'VU', 'CG', 'GC', 'PR', 'RP', 'EI', 'IE', 'EL', 'LE'])
function snapShort(tok: string): string {
  const core = tok.replace(/\.+$/, '') // "POR." → PDR.
  if (core.length !== 3 || SHORT.includes(core)) return tok
  const w = SHORT.find((s) => [...s].filter((c, i) => c !== core[i]).length === 1 && [...s].every((c, i) => c === core[i] || LOOKALIKE.has(c + core[i])))
  return w ? w + tok.slice(3) : tok
}

/** Words of room names, for the loose snap below (incl. plan spellings like DINNING). */
const LEXICON = [...WORDS, ...SHORT, 'BEDROOM', 'ROOM', 'HELP', 'OPEN', 'DRY', 'FORMAL', 'DINNING', 'TOILET', 'VERANDA', 'MAID', 'STAFF', 'TOI', 'TLT', 'TOIL', 'TO', 'AC', 'PUJA', 'DUCT', 'VOID', 'DRESS']
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
    .replace(/([A-Z])['’]S\b/g, '$1S') // MAID'S ROOM → MAIDS ROOM
    .replace(/[^A-Z0-9.&/]+/g, ' ')
    .split(' ')
    .flatMap((tok) => {
      const m = /^([A-Z]{2,})(\d+)$/.exec(tok) // BED1 → BED 1
      return m ? [m[1], m[2]] : [tok]
    })
    // (each side of a "/" on its own: "BED-04/HOME OFFICE" keeps its 04 — read as one token it came out "O4/HOME")
    .map((tok) =>
      tok
        .split('/')
        .map((tok) => {
          if (/[A-Z]/.test(tok) && /\d/.test(tok) && tok.replace(/[^A-Z]/g, '').length >= 2) tok = tok.replace(/\d/g, (d) => DIGIT_AS_LETTER[d] ?? d)
          // a room's number with its 0 / 1 read as a letter: "BED D4" → BED 04, "TOILET O3" → TOILET 03
          if (/^[ODQIL0-9]{2,3}$/.test(tok) && /\d/.test(tok)) tok = tok.replace(/[ODQ]/g, '0').replace(/[IL]/g, '1')
          if (tok.length >= 5 && !WORDS.includes(tok)) tok = WORDS.find((w) => w.length >= 5 && editDistanceAtMost1(tok, w)) ?? tok
          return snapShort(tok)
        })
        .join('/'),
    )
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
  return out.some((t) => t.split(/[^A-Z]+/).some((w) => LEXICON.includes(w))) ? out.join(' ') : n
}

type Rule = [RegExp, RoomKind, boolean?]
/**
 * First match wins; specific compounds before the generic words they contain ("K. VERANDA" before "KITCHEN", "SERVICE
 * VER" before "SERVICE", "S.TOILET" before "S.BED", "FIRE CORRIDOR" before "CORRIDOR"). SPECIAL beats the living /
 * dining words wherever they stand; a RULES word only when it stands before them ("ENTRY LOUNGE" → living).
 */
const SPECIAL: Rule[] = [
  [/\b(SUN ?SHADE|PLANTER|PLANT|PLANTATION|GREEN|LANDSCAPE|GARDEN|LAWN)\b/, 'balcony', true],
  [/\b(K\.? ?VER(ANDAH?)?|KIT\.? ?VER|KITCHEN VER|SERVICE VER)/, 'balcony'],
  [/\b((SERVANT|HELP|MAID|DRIVER|STAFF)S? ?(TOILET|TOI|TO|TLT|BATH|WC)|[HS]\. ?(TOILET|BATH))\b/, 'bath'],
  [/\b((SERVANT|HELP|MAID)S?|DRIVERS? (ROOM|RM|BED)|STAFF BED|S\. ?BED|SBED)\b/, 'maid'],
  [/\b(LOBBY|STAIRS?|LIFTS?|HOISTWAY|FIRE CORRIDOR)\b/, 'other'], // the building's core, in no flat (core/flats.ts isCore)
  [/^A[./]?C\b|\b(O\.?D\.?U|LEDGE)\b/, 'shaft'], // AC / outdoor-unit ledge: open to the sky, never furnished
]
const RULES: Rule[] = [
  [/\b(W\.? ?I\.? ?C\.?|WALK ?-?IN|CLOSET|DRESS|DRESSER|DRESSING)\b/, 'closet'],
  [/\b(TOILET|TOIL|TOI|S?TLT|BATH|BATHROOM|WC|W\.C|PDR|POWDER|WASH ?ROOM)\b/, 'bath'],
  [/\b(VERANDAH?|VER|BALCONY|BALC|TERRACE|DECK)\b/, 'balcony'],
  // (dotless / room-for-bed: MBED, GBED, CBED, "M. ROOM" = master / guest / child; SBED = servant is the maid rule above)
  [/\b(BED|BEDROOM|MASTER|GUEST|CHILD|SUITE|[MGC]BED|[MGC]\. ?ROOM)\b/, 'bed'],
  [/\b(PANTRY|DRY ?KIT(CHEN)?|FOOD STORE)\b/, 'pantry'],
  [/\b(KITCHEN|KIT)\b/, 'kitchen'],
  [/\b(STUDY|LIBRARY|OFFICE|PAINTING)\b/, 'study'],
  [/\b(PRAYER|WORSHIP|PUJA)\b/, 'prayer'],
  [/\b(FOYER|ENTRY(?! LOUNGE)|ENTRANCE|PASSAGE|CORRIDOR)\b/, 'foyer'],
  [/\b(AOD|DUCT|SHAFT|VOID|CHUTE|OPEN TO SKY)\b/, 'shaft'],
  [/\b(STORE|UTILITY|LAUNDRY|SERVICE|CLOTH|DRYING|IRON|SHOE|DISH ?WASH)\b/, 'utility'],
]
const LIVING_DINING = /\b(DRAWING|LIVING|FAMILY|LOUNGE|DINING)\b/g
/** Appliance / fixture tags printed inside rooms: text, not room names (a LIFT MACHINE ROOM is the core all the same). */
const NOT_A_ROOM = /\b(MACHINE(?! ROOM)|FRIDGE|FREEZER|D\.?W|F\.?H\.?B|UP|DN|BEAM|SLAB|PIT)\b/

/** A label → RoomKind (+ green for planter strips), or null when the text names no room. */
export function classifyRoom(raw: string): { kind: RoomKind; green: boolean } | null {
  const n = normaliseName(raw)
  if (NOT_A_ROOM.test(n) && !/\b(BED|TOILET|BATH|KITCHEN|LIVING|DINING|GREEN)\b/.test(n)) return null
  const special = SPECIAL.find(([re]) => re.test(n))
  if (special) return { kind: special[1], green: !!special[2] }
  const first = [...n.matchAll(LIVING_DINING)][0] // "LIVING, DINING & FAMILY" → living, "DINING & FAMILY LIVING" → dining
  const rule = RULES.find(([re]) => re.test(n))
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
  return roomName(text) ? 'room' : 'other'
}

/**
 * Two name lines stacked are ONE name ("DINING &" / "FAMILY LIVING", "MASTER" / "BED", "WALK IN" / "CLOSET") — unless
 * each names a room of its own: another kind, or both numbered ("BED 1" over "VER 1" over "TOILET 1" in three rooms
 * printed close; s26, AUTOTRACE_100 §3 #5). A connector (& / AND / CUM / , / -) at the seam always joins.
 */
function oneName(upper: string, lower: string): boolean {
  const a = roomName(upper), b = roomName(lower)
  if (!a || !b || /(&|\bAND|\bCUM|[,/-])\s*$/i.test(upper) || /^\s*(&|AND\b|CUM\b|\/)/i.test(lower)) return true
  return !(/\d/.test(upper) && /\d/.test(lower))
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
      if (kinds[i] === 'room' && kinds[j] === 'room' && !oneName(chunks[j].text, chunks[i].text)) continue
      // a garbled line over a name never changes its kind ("Bed) A a ASSAY," over LIVING made it a bedroom, Assure Phera)
      if (kinds[i] === 'room' && kinds[j] === 'other' && roomName(`${chunks[j].text} ${chunks[i].text}`)?.kind !== roomName(chunks[i].text)?.kind) continue
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
  for (let idx of blocks.values()) {
    let dimsIdx = idx.find((i) => kinds[i] === 'dims')
    const last = idx[idx.length - 1]
    // a trailing line under a name that names no room is the size line OCR garbled ("LOBBY" / "Irs"): keep it as the size
    if (dimsIdx === undefined && idx.length >= 2 && kinds[last] === 'other' && roomName(idx.slice(0, -1).map((i) => chunks[i].text).join(' '))) dimsIdx = last
    let names = idx.filter((i) => i !== dimsIdx && kinds[i] !== 'area')
    // a garbled line stacked on a name ("I 1" over "TOILET 3"): the name is the run of lines that reads as one, nearest the size
    if (names.length >= 2 && !roomName(names.map((i) => chunks[i].text).join(' '))) {
      const runs = names.flatMap((_, a) => names.slice(a).map((__, b) => names.slice(a, a + b + 1))).filter((r) => roomName(r.map((i) => chunks[i].text).join(' ')))
      const best = runs.sort((p, q) => q[q.length - 1] - p[p.length - 1] || q.length - p.length)[0]
      if (best) {
        for (const i of names) if (!best.includes(i)) items.push({ text: chunks[i].text, box: chunks[i].box, kind: 'other', conf: chunks[i].conf, source: 'ocr' })
        idx = idx.filter((i) => !names.includes(i) || best.includes(i))
        names = best
      }
    }
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
    const room = name ? roomName(name) : null
    const text = [name, dimsText].filter(Boolean).join('\n')
    if (room) items.push({ text, box, kind: 'room', roomKind: room.kind, green: room.green || undefined, dims, conf, source: 'ocr', ...unread })
    else if (kinds[idx[0]] === 'north') items.push({ text, box, kind: 'north', conf, source: 'ocr' })
    else if (!name && dimsIdx !== undefined) items.push({ text, box, kind: 'dims', dims, conf, source: 'ocr', ...unread })
    else items.push({ text, box, kind: 'other', dims, conf, source: 'ocr', ...unread })
  }
  return items
}

// ---------------------------------------------------------------- size tables beside the plan (s25)

/** a table row's name: a room name, a numbered legend's number apart ("01. LIVING" → 1, LIVING) */
function rowName(raw: string): { name: string; num?: number; roomKind: string } | null {
  // (a stray bracket before the number, the dot after it lost: "[06 CHILD BED", "(04 MASTER BATH" — s26, Ena legends)
  const m = /^\W{0,2}([1-9]|\d[1-9]|[1-9]\d)\s*(?:[.)]\s*|\s+)(.*)$/.exec(raw)
  const name = (m ? m[2] : raw).trim()
  const c = /[A-Za-z]{2}/.test(name) ? classifyRoom(name) : null
  return c ? { name, ...(m ? { num: +m[1] } : {}), roomKind: c.kind } : null
}

/** one read line that is a whole row ("Bed 3 10-8\"x10-0\"", "01. LIVING 10'-00\" x 09'-06\""): its name + size, or null */
function splitRow(line: string): { name: string; num?: number; roomKind: string; sizeText: string; dims?: Dims } | null {
  const toks = line.trim().split(/\s+/)
  let loose: ReturnType<typeof splitRow> = null
  for (let i = 1; i < toks.length; i++) {
    const right = toks.slice(i).join(' ')
    const n = /^\d/.test(right) && LOOKS_LIKE_DIMS.test(right) ? rowName(toks.slice(0, i).join(' ')) : null
    if (!n) continue
    // (a well-formed size only — a wrong size is worse than none; "13-6\"x14-6\"": the feet marks lost, both sides whole)
    const dims = strictSize(right) ?? (/^\d{1,2}'?-\d{1,2}["”]?\s*[xX×]\s*\d{1,2}'?-\d{1,2}["”]?$/.test(right) ? parseDims(right) : null)
    if (dims) return { ...n, sizeText: right, dims }
    loose ??= { ...n, sizeText: right }
  }
  return loose
}

/** a floor-stack chart's row number: 19 … 01, G, B1 */
const FLOOR_NO = /^(B ?\d{1,2}|\d{1,2}|G|GF|LG|UG)$/i

/**
 * Size tables printed beside / under the plan (s25: about half the brochure sheets print the sizes there, not in the
 * rooms): ≥ 3 rows, each a room name with a size on its baseline to its right (or one line holding both), stacked in a
 * column (names' left, right or centre within 2 letter heights, ≤ 6 heights apart), where no wall ink is (`gray`: dark
 * ink outside the read text under 3 % of the box); and floor-stack charts (≥ 5 floor numbers stacked in a column), whose
 * box reaches 4 heights right over the chart's cells. Their text is no plan label; their box is no plan.
 */
export function findTables(items: TextItem[], gray?: Gray): SizeTable[] {
  const cy = (b: Box) => b.y + b.h / 2
  type Row = TableRow & { nameBox: Box }
  const rows: Row[] = []
  items.forEach((it, i) => {
    if (it.kind === 'area') return
    for (const line of it.text.split('\n')) {
      const one = splitRow(line)
      if (one) {
        rows.push({ ...one, box: it.box, nameBox: it.box })
        return
      }
    }
    const n = it.text.includes('\n') ? null : rowName(it.text)
    if (!n) return
    const h = it.box.h
    const sameRow = (o: TextItem) => o !== it && Math.abs(cy(o.box) - cy(it.box)) < 0.6 * Math.max(h, o.box.h) && o.box.x >= it.box.x + it.box.w - 0.5 * h
    const next = Math.min(...items.filter((o, j) => j !== i && sameRow(o) && !o.text.includes('\n') && rowName(o.text) && !LOOKS_LIKE_DIMS.test(o.text)).map((o) => o.box.x))
    const size = items.filter((o) => sameRow(o) && o.kind !== 'area' && o.box.x < next && o.box.x - (it.box.x + it.box.w) < 20 * h && /\d/.test(o.text) && !(o.kind === 'room' && !LOOKS_LIKE_DIMS.test(o.text))).sort((p, q) => p.box.x - q.box.x)
    // (a numbered legend's row names its room by the number alone: its size, when unread, is not needed for the column)
    if (!size.length) return void (n.num !== undefined && rows.push({ ...n, sizeText: '', box: it.box, nameBox: it.box }))
    const sizeText = size.map((o) => o.text).join(' ')
    // (the size reader's sure reading of one line, else the pieces only as a well-formed size: never an unsure line parsed)
    const dims = (size.length === 1 && !size[0].sizeUnread ? size[0].dims : undefined) ?? strictSize(sizeText) ?? undefined
    rows.push({ ...n, sizeText, ...(dims ? { dims } : {}), box: [it.box, ...size.map((o) => o.box)].reduce(union), nameBox: it.box })
  })
  // stacked in a column: each row joins the nearest aligned row above it
  const column = <T extends { nameBox: Box }>(rs: T[], maxGap: number, aligned: (p: Box, q: Box, h: number) => boolean, min: number): T[][] => {
    const s = [...rs].sort((p, q) => cy(p.nameBox) - cy(q.nameBox))
    const parent = s.map((_, i) => i)
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
    s.forEach((r, i) => {
      const h = r.nameBox.h
      let best = -1
      for (let j = i - 1; j >= 0; j--) {
        const d = cy(r.nameBox) - cy(s[j].nameBox)
        if (d > maxGap * h) break
        if (d > 0.5 * h && aligned(s[j].nameBox, r.nameBox, h)) {
          best = j
          break
        }
      }
      if (best >= 0) parent[find(i)] = find(best)
    })
    const groups = new Map<number, T[]>()
    s.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]))
    return [...groups.values()].filter((g) => g.length >= min)
  }
  const near = (p: number, q: number, h: number) => Math.abs(p - q) <= 2 * h
  const tables: SizeTable[] = column(rows, 6, (p, q, h) => near(p.x, q.x, h) || near(p.x + p.w, q.x + q.w, h) || near(p.x + p.w / 2, q.x + q.w / 2, h), 3)
    .map((g) => ({ box: g.map((r) => r.box).reduce(union), rows: g.map(({ nameBox: _, ...r }) => r) }))
    .filter((t) => !gray || darkOutside(gray, t.box, items) < 0.03)
  const floors = items.filter((it) => FLOOR_NO.test(it.text.trim())).map((it) => ({ nameBox: it.box }))
  for (const g of column(floors, 4, (p, q, h) => near(p.x, q.x, h / 2) || near(p.x + p.w, q.x + q.w, h / 2), 5)) {
    const b = g.map((r) => r.nameBox).reduce(union)
    const h = Math.max(...g.map((r) => r.nameBox.h))
    tables.push({ box: { ...b, w: b.w + 4 * h }, rows: [] })
  }
  return tables
}

/** the share of a box's pixels that are dark (wall ink) and in no read text's box */
function darkOutside(g: Gray, b: Box, items: TextItem[]): number {
  const inText = items.filter((it) => it.box.x < b.x + b.w && it.box.x + it.box.w > b.x && it.box.y < b.y + b.h && it.box.y + it.box.h > b.y).map((it) => it.box)
  let dark = 0, n = 0
  for (let y = Math.max(0, Math.floor(b.y)); y < Math.min(g.height, b.y + b.h); y++)
    for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(g.width, b.x + b.w); x++) {
      n++
      if (g.data[y * g.width + x] < 80 && !inText.some((t) => x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h)) dark++
    }
  return n ? dark / n : 0
}

/** the key two printings of one room name share: "LIVING & DINING" = "LIVING+DINING", "Ver2" = "VER 2" */
const nameKey = (s: string) => normaliseName(s).replace(/\bAND\b|[^A-Z0-9]/g, '')

/**
 * A table row's size given to the plan label of its name (s25), as if printed under it: "SUITE 1" in the room ↔ the row
 * SUITE 1; a numbered legend's row ↔ the bare number printed in the room ("1" → MASTER BED, its kind and size). Several
 * labels of one name (two flats, two tables): the nearest pairs first, one row per label. A label that read its own size
 * keeps it.
 */
export function applyTables(items: TextItem[], tables: SizeTable[]): void {
  const pairs: { r: TableRow; it: TextItem; d: number }[] = []
  for (const t of tables)
    for (const r of t.rows) {
      if (!r.dims && r.num === undefined) continue
      for (const it of items) {
        const ok = r.num !== undefined ? it.kind === 'other' && /^\d{1,2}\.?$/.test(it.text.trim()) && parseInt(it.text, 10) === r.num : it.kind === 'room' && !it.dims && nameKey(it.text.split('\n')[0]) === nameKey(r.name)
        const x = it.box.x + it.box.w / 2, y = it.box.y + it.box.h / 2
        if (ok) pairs.push({ r, it, d: Math.hypot(Math.max(t.box.x - x, 0, x - t.box.x - t.box.w), Math.max(t.box.y - y, 0, y - t.box.y - t.box.h)) })
      }
    }
  const took = new Set<TextItem>()
  for (const { r, it } of pairs.sort((p, q) => p.d - q.d)) {
    if (r.onPlan || took.has(it)) continue
    took.add(it)
    r.onPlan = true
    if (r.num !== undefined) Object.assign(it, { text: r.name, kind: 'room', roomKind: r.roomKind })
    if (r.dims) {
      it.dims = r.dims
      delete it.sizeUnread, delete it.sizeBox, delete it.sizeGuess
    }
  }
}

/** the read text lying in a table (its centre in a table's box): no plan label */
export const inTable = (tables: SizeTable[], it: TextItem): boolean =>
  tables.some((t) => { const x = it.box.x + it.box.w / 2, y = it.box.y + it.box.h / 2; return x >= t.box.x && x <= t.box.x + t.box.w && y >= t.box.y && y <= t.box.y + t.box.h })

// ---------------------------------------------------------------- what to re-ask the backup AI reader

/** Rooms that never carry a printed size on Dhaka plans: shafts and AC ledges, planter strips, lift/stair/lobby. */
const NO_SIZE_EXPECTED = /^A[./]?C\b|\b(AOD|DUCT|SHAFT|VOID|CHUTE|O\.?D\.?U|LEDGE|LIFT|STAIRS?|LOBBY|PASSAGE|CORRIDOR)\b/

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

/** 8-connected blobs of `m` (W × H): label per pixel, x0, y0, x1, y1, count per blob */
function inkBlobs(m: Uint8Array, W: number, H: number) {
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

/** ink runs along a row or a column at least `L` long (wall edges, floor-tile lines, dimension lines) */
function rules(mask: Uint8Array, W: number, H: number, L: number): Uint8Array {
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
  return rule
}

/** a reading pass's glyph mask: `charH` = the text height it keeps (else the page's median), `orphans` = a piece cut off a
 * dropped blob (a name touching a floor-tile line or a fill's speckle) is judged by its own shape, not the blob's */
export interface CleanOpts {
  charH?: number
  orphans?: boolean
  /** the page's localMax(g, 5), when the caller has it already */
  bg?: Uint8Array
}

/**
 * Keep only glyph-sized dark blobs (walls, furniture outlines, fills, foliage go). A pixel is ink when it is `delta`
 * darker than its local paper tone (so black text on a brown lobby fill and grey text on white both count, light
 * hatching does not). 8-connected ink blobs; glyph height = median height of blobs 4–40 px tall; a blob stays when
 * it is at most 1.6 × that tall and 8 × wide (touching glyphs in small print merge into flat runs). Kept blobs grow by
 * `grow` px into half-contrast pixels (thin grey strokes, anti-aliased rims) and are redrawn as dark-on-white by their
 * contrast; everything else turns white. Returns the cleaned raster, the glyph height and the kept blobs' boxes.
 */
export function cleanForOcr(g: Gray, delta = 40, grow = 1, opt: CleanOpts = {}): { gray: Gray; charH: number; glyphs: Box[] } {
  const { width: W, height: H, data } = g
  const bg = opt.bg ?? localMax(g, 5)
  const ink = (p: number, d: number) => data[p] < bg[p] - d
  const mask = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) mask[p] = +ink(p, delta)
  const blobs = (m: Uint8Array) => inkBlobs(m, W, H)
  // (a height pass keeping cut-off pieces needs neither the page's median nor the blobs before the cut: not labelled)
  const first = opt.charH && opt.orphans ? { label: new Int32Array(0), boxes: [] as number[], n: 0 } : blobs(mask)
  const heights: number[] = []
  for (let i = 0; i < first.n; i++) {
    const h = first.boxes[i * 5 + 3] - first.boxes[i * 5 + 1] + 1
    const w = first.boxes[i * 5 + 2] - first.boxes[i * 5] + 1
    if (h >= 4 && h <= 40 && w <= 3 * h) heights.push(h)
  }
  heights.sort((a, b) => a - b)
  const charH = opt.charH ?? (heights.length ? heights[heights.length >> 1] : 10)
  // rules: ink runs along a row or a column longer than the tallest glyph kept below (5 × charH: wall edges, floor-tile
  // lines, dimension lines). A glyph touching one (a size printed on the floor pattern) merged into it and was dropped
  // with it; cut them apart first.
  const rule = rules(mask, W, H, Math.max(12, Math.round(5 * charH) + 1))
  const glyphLike = (bx: number[], i: number) => {
    const w = bx[i * 5 + 2] - bx[i * 5] + 1
    const h = bx[i * 5 + 3] - bx[i * 5 + 1] + 1
    // glyph runs, vertical glyph runs, and big title glyphs ("2662 SFT" under the plan)
    return bx[i * 5 + 4] >= 2 && ((h <= 1.6 * charH && w <= 8 * charH) || (w <= 1.6 * charH && w >= 0.6 * charH && h <= 8 * charH) || (!opt.charH && h <= 5 * charH && w <= 1.5 * h))
  }
  const keep1 = Uint8Array.from({ length: first.n }, (_, i) => +glyphLike(first.boxes, i))
  for (let p = 0; p < W * H; p++) if (rule[p]) mask[p] = 0
  const { label, boxes, n } = blobs(mask)
  const parent = new Int32Array(n).fill(-1)
  if (first.n) for (let p = 0; p < W * H; p++) if (label[p] >= 0 && parent[label[p]] < 0) parent[label[p]] = first.label[p]
  const keep = new Uint8Array(n)
  const box = (i: number): Box => ({ x: boxes[i * 5], y: boxes[i * 5 + 1], w: boxes[i * 5 + 2] - boxes[i * 5] + 1, h: boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1 })
  const rescue: number[] = []
  for (let i = 0; i < n; i++) {
    if (opt.orphans || keep1[parent[i]]) keep[i] = +glyphLike(boxes, i)
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

/** contrast a pass's ink needs: twice the page pass's, so a fill's speckle or a tile line never glues letters together */
export const STRICT_DELTA = 64

/**
 * The heights the page prints text at (s26: names ~8–25 px, sizes ~6–9 px, title figures 30–50 px on one sheet; the
 * median glyph height alone dropped the names and titles). Ink blobs at `delta` contrast, long rules cut (twice: 24 px for
 * small print on floor-tile lines, 80 px for the big type), that stand in a word — a blob of about the same height on
 * the same baseline at most one height beside it — vote for their height; the peaks with at least `min` votes, the
 * most voted first, none within 20 % of a bigger peak.
 */
export function textHeights(g: Gray, delta = STRICT_DELTA, min = 6, bg = localMax(g, 5), votesOut: number[] = []): number[] {
  const { width: W, height: H, data } = g
  const mask = new Uint8Array(W * H)
  for (let p = 0; p < W * H; p++) mask[p] = +(data[p] < bg[p] - delta)
  const votes = new Float64Array(64)
  for (const [L, lo, hi] of [[24, 5, 18], [80, 19, 60]]) {
    const cut = rules(mask, W, H, L)
    const m = Uint8Array.from(mask, (v, p) => v & (1 - cut[p]))
    const { boxes, n } = inkBlobs(m, W, H)
    const cells = new Map<number, number[]>()
    const ok: number[] = []
    for (let i = 0; i < n; i++) {
      const w = boxes[i * 5 + 2] - boxes[i * 5] + 1, h = boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1
      if (h < lo || h > hi || w > 1.5 * h || boxes[i * 5 + 4] < 3) continue
      ok.push(i)
      const k = Math.floor(boxes[i * 5 + 3] / 16) * 100000 + Math.floor(boxes[i * 5] / 16)
      cells.set(k, [...(cells.get(k) ?? []), i])
    }
    const inWord = new Set<number>()
    for (const i of ok) {
      const x1 = boxes[i * 5 + 2], y1 = boxes[i * 5 + 3], h = y1 - boxes[i * 5 + 1] + 1
      let mate = false
      for (let cy = Math.floor((y1 - 0.2 * h) / 16); cy <= Math.floor((y1 + 0.2 * h) / 16) && !mate; cy++)
        for (let cx = Math.floor((x1 - 0.3 * h) / 16); cx <= Math.floor((x1 + h) / 16) && !mate; cx++)
          for (const j of cells.get(cy * 100000 + cx) ?? []) {
            if (j === i) continue
            const hj = boxes[j * 5 + 3] - boxes[j * 5 + 1] + 1
            const gap = boxes[j * 5] - x1
            if (gap > -0.3 * h && gap <= h && Math.abs(hj - h) <= 0.15 * Math.max(h, hj) + 0.5 && Math.abs(boxes[j * 5 + 3] - y1) <= 0.15 * h + 0.5) {
              mate = true
              inWord.add(i).add(j)
              break
            }
          }
    }
    for (const i of inWord) votes[boxes[i * 5 + 3] - boxes[i * 5 + 1] + 1]++
  }
  // votes within ±8 % (at least ±1 px) of a height
  const near = (h: number) => {
    const r = Math.max(1, Math.round(0.08 * h))
    let t = 0
    for (let k = h - r; k <= h + r; k++) t += votes[k] ?? 0
    return t
  }
  const peaks = Array.from({ length: 56 }, (_, i) => i + 5)
    .map((h) => ({ h, v: near(h) }))
    .filter((p, i, a) => p.v >= min && (i === 0 || p.v >= a[i - 1].v) && (i === a.length - 1 || p.v > a[i + 1].v))
    .sort((p, q) => q.v - p.v)
  const out: number[] = []
  for (const p of peaks) if (out.every((h) => Math.max(h, p.h) / Math.min(h, p.h) >= 1.2)) out.push(p.h), votesOut.push(p.v)
  return out
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
  /** its glyphs as tall as a letter (a vertical line: its letters) */
  tall?: number
}

/**
 * Glyph blobs → text lines, no OCR yet: a blob joins the line whose glyph band (tall glyphs only, so ' " - marks don't
 * stretch it) holds its centre and whose right end is within 1.2 glyph heights. Two lines printed nearly touching
 * (a name over its size) stay apart. Lone upright glyphs stacked in a column form a vertical line; other loners go.
 */
export function findTextLines(glyphs: Box[], charH: number, strict = false): TextLine[] {
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
      // (strict: a mark or a speck joins only right beside the line — chained floor-tile stubs made one line of a room)
      if (strict && !tall(g) && g.x - (l.box.x + l.box.w) > 0.6 * charH) continue
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
  const out: TextLine[] = lines.filter((l) => (l.n >= 2 || l.box.w >= 1.5 * l.box.h) && l.tall >= 1 && l.box.w >= 1.2 * charH).map((l) => ({ box: l.box, vertical: false, tall: l.tall }))
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
      out.push({ box: col, vertical: true, tall: members.length })
    }
  }
  return out
}

// ---------------------------------------------------------------- the OCR stage (browser; tesseract.js loaded on first call)

export interface ReadTextOptions {
  /** OCR workers in parallel; default half the machine's cores, 3 to 6 (s26: the passes read 3–6 × the lines they used to) */
  workers?: number
  /** where eng.traineddata comes from; default = tesseract.js's own jsdelivr CDN (4.0.0_best_int, ≈ 2.9 MB gz, cached in IndexedDB) */
  langPath?: string
  /** node only (the eval): the folder holding eng.traineddata, so no download */
  cachePath?: string
  onProgress?: (done: number, total: number) => void
}

/** OCR workers in parallel: half the machine's cores, 3 to 6 */
const ocrWorkers = () => Math.min(6, Math.max(3, Math.floor((globalThis.navigator?.hardwareConcurrency ?? 6) / 2)))

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
const NAME_VIEWS: { from: 'raw' | 'clean' | 'own'; px: number; kernel: 'lanczos' | 'cubic'; wide?: number }[] = [
  { from: 'own', px: 48, kernel: 'lanczos' },
  { from: 'raw', px: 40, kernel: 'cubic' },
  { from: 'clean', px: 48, kernel: 'lanczos' },
  // s26: the raw crop a letter and a half wider each side ("STAFF BATH" lost its S to a basin's arc and TH to the WC: the
  // line found was "AFF BA")
  { from: 'raw', px: 44, kernel: 'lanczos', wide: 1.5 },
]

/** the building core's names: they decide where a flat ends (solve.ts), so a second look never adds one */
const CORE_WORDS = /\b(L[O0][B8]{2}Y|LIFTS?|STAIRS?|HOISTWAY|CORE)\b/
/**
 * A room name a second look may add: any room name over a size line (as before Level 3), elsewhere a flat's room only —
 * on Sheltech L2 a second look read the west LIFT, and the core rules then cut Type B's foyer and Bed 2 off its draft.
 */
const flatRoom = (t: string, overSize: boolean) => !!roomName(t) && (overSize || !CORE_WORDS.test(normaliseName(t)))

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
export function lineImage(g: Gray, l: TextLine, px: number, kernel: 'lanczos' | 'cubic', cap?: { y0: number; y1: number }, own?: Box[], wide = 0): Blob {
  const ch = cap ? cap.y1 - cap.y0 : l.vertical ? l.box.w : l.box.h
  const p = cap ? 0.6 * ch : 0.4 * Math.min(l.box.w, l.box.h)
  // (`wide`: that many letter heights more each side along the line — a letter glued to a basin or a door arc was
  // dropped from the line's glyphs, but it is on the sheet right there)
  const q = p + wide * (l.vertical ? l.box.w : l.box.h)
  const at = cap ? { x: l.box.x - p, y: cap.y0 - 0.5 * ch, w: l.box.w + 2 * p, h: 2 * ch } : l.vertical ? { x: l.box.x - p, y: l.box.y - q, w: l.box.w + 2 * p, h: l.box.h + 2 * q } : { x: l.box.x - q, y: l.box.y - p, w: l.box.w + 2 * q, h: l.box.h + 2 * p }
  let c = cropGray(g, at)
  if (own) c = ownGlyphs(c, at, l.box, own)
  if (l.vertical) c = rotateCW(c)
  c = pad(stretch(resample(c, Math.max(1, Math.min(8, px / ch)), kernel)), 12)
  // raw image bytes are fine for tesseract.js (its loadImage wraps them in a Uint8Array); its types only list Blob & co.
  return toPgm(c) as unknown as Blob
}

/** Rotate 90° counter-clockwise: text printed top-to-bottom reads left-to-right. Pixel (x, y) → (y, W-1-x). */
export function rotateCCW(g: Gray): Gray {
  const { width: W, height: H } = g
  const out = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[(W - 1 - x) * H + y] = g.data[y * W + x]
  return { width: H, height: W, data: out }
}

/** A box in a turned page (`rotateCW` / `rotateCCW` of a W × H page) → the same box on the page. */
export function boxBack(b: Box, turn: 'cw' | 'ccw', W: number, H: number): Box {
  return turn === 'cw' ? { x: b.y, y: H - b.x - b.w, w: b.h, h: b.w } : { x: W - b.y - b.h, y: b.x, w: b.h, h: b.w }
}

/**
 * White print on dark ground (a legend in a dark box; a light plan on a dark page, which the polarity check turned over
 * whole) as dark print on white: the page inverted where its ground is dark (the mean over ~80 px under 100), white
 * elsewhere. Null when under 1 % of the page is dark ground.
 */
export function darkGround(g: Gray): Gray | null {
  const { width: W, height: H, data } = g
  const C = 16
  const cw = Math.ceil(W / C), ch = Math.ceil(H / C)
  const sum = new Float64Array(cw * ch), cnt = new Float64Array(cw * ch)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = Math.floor(y / C) * cw + Math.floor(x / C)
      sum[c] += data[y * W + x]
      cnt[c]++
    }
  const dark = new Uint8Array(cw * ch)
  let n = 0
  for (let cy = 0; cy < ch; cy++)
    for (let cx = 0; cx < cw; cx++) {
      let s = 0, k = 0
      for (let yy = Math.max(0, cy - 2); yy <= Math.min(ch - 1, cy + 2); yy++)
        for (let xx = Math.max(0, cx - 2); xx <= Math.min(cw - 1, cx + 2); xx++) (s += sum[yy * cw + xx]), (k += cnt[yy * cw + xx])
      if (s < 100 * k) (dark[cy * cw + cx] = 1), n++
    }
  if (n < 0.01 * cw * ch) return null
  const out = new Uint8Array(W * H).fill(255)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dark[Math.floor(y / C) * cw + Math.floor(x / C)]) out[y * W + x] = 255 - data[y * W + x]
  return { width: W, height: H, data: out }
}

/** Words a printed room name may hold besides the room lexicon (the s26 gate below). */
const NAME_WORDS = new Set([
  ...LEXICON,
  ...'AND CUM AREA UNIT OUT DOOR OUTDOOR HOME SITTING RACK CABINET CORNER ZONE MAIN FIRE FRONT BACK SIDE UPSTAND BEAM BOTTOM PARENT PARENTS LUGGAGE CLOTH DRYING WASH TEA WET MACHINE SERVANTS NOS OPEN SKY SPACE CHILDREN KIDS WORK MEDIA GYM POOL SWIMMING HALL COMMON PLAY STAIRCASE WITH LEDGE GRAVEL WC RM KVER SBED MBED GBED CBED STLT BALC DRESSER BATHROOM WASHROOM SUNSHADE SHADE SUN PLANT PLANTATION LAWN HOISTWAY LIFTS STAIRS DRIVER DRIVERS LIBRARY PAINTING WORSHIP ENTRANCE CHUTE IRON SHOE DISH DECK FOOD BEDROOM ELECT ELECTRIC GARBAGE MRL STRETCHER SER SERV GEN GENERAL MULTIPURPOSE WAITING GUARD RECEPTION READING SITOUT SIT TV FAMILY'.split(' '),
])

/**
 * A read room name to trust (s26, AUTOTRACE_100 §3 #5): its words are plan words (one edit away at most, as
 * normaliseName snaps them), a room's prefix letters (M. / K. / S.) or ONE number. A size's digits glued to it
 * ("BATH 3 21050X 10 67" on BED-3), two numbers (labels of two rooms read as one: "BED 1 VER 1 TD 1") or more unknown
 * words than plan words ("ACO AOU ACOU") make it garbage: no name — the room stays "Space N" with its row.
 */
export function nameOk(raw: string): boolean {
  // (one number, once per run of plan words: "BED 1" — "BED 1 VER 1" and "3 TOILET 4" are two rooms; "BATH 1 1" is one, read twice)
  let named = 0, run = 0, known = 0, unknown = 0
  const nums: string[] = []
  for (const t of trimName(normaliseName(raw)).split(/[\s./&-]+/).filter(Boolean)) {
    if (/^\d{1,2}$/.test(t)) (named += +(run > 0)), (run = 0), nums.push(t)
    else if (/\d/.test(t)) return false
    else if (NAME_WORDS.has(t)) known++, run++
    // (a word a letter off a plan word is a misread of it — STAIR LUFT; junk is not — "FOM" stacked over S.BED)
    else if (t.length >= 3 && ![...NAME_WORDS].some((w) => w.length >= 3 && editDistanceAtMost1(t, w))) unknown++
  }
  // (one number read twice, once cut short — "BED-0" and "04/HOME OFFICE" side by side — is still one number)
  const longest = nums.reduce((a, b) => (b.length > a.length ? b : a), '')
  return named <= 1 && nums.every((n) => longest.startsWith(n) || +n === +longest) && known >= 1 && unknown <= Math.floor(known / 2)
}

/** a read holds a plan word as printed (or a long one a letter off: KITCHEM) — not only one a letter swap makes (RED → BED) */
const verbatim = (t: string) => t.toUpperCase().split(/[^A-Z]+/).some((w) => NAME_WORDS.has(w) || (w.length >= 5 && WORDS.some((v) => editDistanceAtMost1(w, v))))

/** a read line as a room name: its kind (classifyRoom) when the name passes the gate, else null */
export const roomName = (t: string) => (nameOk(t) ? classifyRoom(t) : null)

/**
 * Two room names read as one line ("VER 3 TOILET 4": two labels printed on one baseline across a wall) → the two names
 * and where the line splits (a fraction of its width, by letters), else null.
 */
export function splitNames(t: string): { a: string; b: string; at: number } | null {
  if (nameOk(t)) return null
  const toks = t.trim().split(/\s+/)
  for (let k = 1; k < toks.length; k++) {
    // (a room's number stays with its word; a connector joins: "DINING & FAMILY LIVING" is one name)
    if (/^\d{1,2}\W*$/.test(toks[k]) || /^(&|AND|CUM|\/|-)$/i.test(toks[k]) || /^(&|AND|CUM|\/|-)$/i.test(toks[k - 1])) continue
    const a = toks.slice(0, k).join(' '), b = toks.slice(k).join(' ')
    if (roomName(a) && roomName(b)) return { a, b, at: a.length / (a.length + b.length + 1) }
  }
  return null
}

/**
 * The reading passes (s26: the founder's "read text at full resolution, including rotated labels and the big title
 * figures"). Each pass is a glyph mask of a view of the page and the text lines found on it:
 * - the page as drawn, its median glyph height (the reader before s26);
 * - one pass per height the page prints text at (`textHeights`: room names 8–25 px, sizes 6–9 px, titles 30–50 px),
 *   at twice the contrast and keeping the pieces a floor-tile line or a fill's speckle cut off a name;
 * - white print on dark ground, inverted (`darkGround`: a legend in a dark box, a plan on a dark page);
 * - the page turned a quarter each way (labels printed sideways), the same passes on it.
 * Lines a later pass finds again (same box) are not read twice.
 */
interface Pass {
  /** the image the lines are read from, its glyph mask, glyph blobs, height */
  img: Gray
  clean: Gray
  glyphs: Box[]
  charH: number
  lines: TextLine[]
  /** 0 = the page, 1 = turned clockwise, 2 = turned counter-clockwise */
  frame: 0 | 1 | 2
  /** a height pass (strict contrast, own glyphs read) */
  strict: boolean
  /** reads names only (no sizes) */
  names?: boolean
}

const iou = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w <= 0 || h <= 0 ? 0 : (w * h) / (a.w * a.h + b.w * b.h - w * h)
}
/** the share of the smaller box that the two boxes share */
const overlapOfSmaller = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w <= 0 || h <= 0 ? 0 : (w * h) / Math.min(a.w * a.h, b.w * b.h)
}

/** a view's passes: its own glyph height, then each height it prints text at (strict contrast, cut-off pieces kept) */
function passesOf(img: Gray, frame: Pass['frame'], first: boolean, minVotes = 0, top: { votes: number } = { votes: 0 }, minH = 0): Pass[] {
  const out: Pass[] = []
  const bg = localMax(img, 5)
  if (first) {
    const c = cleanForOcr(img, 40, 1, { bg })
    out.push({ img, clean: c.gray, glyphs: c.glyphs, charH: c.charH, lines: findTextLines(c.glyphs, c.charH), frame, strict: false })
  }
  const votes: number[] = []
  const hs = textHeights(img, STRICT_DELTA, 6, bg, votes)
  top.votes = votes[0] ?? 0
  for (const [k, h] of hs.entries()) {
    if (votes[k] < minVotes || h < minH) continue
    // (print well under the page's own height is dimension notes and fixture tags: the first pass reads it as it is)
    if (first && h < 0.8 * out[0].charH) continue
    const c = cleanForOcr(img, STRICT_DELTA, 1, { charH: h, orphans: true, bg })
    // (small print: three or more letters, or long; a turned page — mostly the page's own text standing on end, furniture
    // and hatch — likewise at every height)
    const lines = findTextLines(c.glyphs, h, true).filter((l) => !l.vertical && ((h > 7 && frame === 0) || (l.tall ?? 0) >= (h <= 7 ? 4 : 3) || l.box.w >= 3 * h))
    // (at the page's own glyph height the first pass reads the sizes: read again strict, they came out a digit off — Amabilia)
    const names = first && Math.abs(h - out[0].charH) <= Math.max(1, 0.15 * out[0].charH)
    out.push({ img, clean: c.gray, glyphs: c.glyphs, charH: h, lines, frame, strict: true, ...(names ? { names } : {}) })
  }
  return out
}

/** how much a read is worth when two passes read one spot: a room name, a sure size, an area over a garbled line */
function worth(w: OcrWord): number {
  // a room name and a size on one line is a size table's row read whole: it beats its pieces read apart (a height pass
  // read Joljhiri's "Bed 2" alone and its size garbled; the row line held both)
  // (a whole row: one name, then a well-formed size and nothing after it — a line across two of a legend's columns is not)
  if (w.size !== 'sure' && splitRow(w.text)?.dims) return 4
  if (w.size === 'sure') return 3
  if (parseArea(w.text) !== null) return 3
  const r = roomName(w.text)
  if (r) return /\d/.test(w.text) ? 3.5 : 3
  if (w.size === 'unsure' || parseDims(w.text)) return 2
  return LOOKS_LIKE_DIMS.test(w.text) ? 1 : 0
}

/**
 * Plan raster → every printed label / size / area it can read, in the source image's pixels.
 * The passes above → every line read by tesseract (raw crop, Lanczos-upscaled to ~48 px glyphs) → the lines that could
 * be a size (not a room name / area, wide enough) read again with the size alphabet in three views and by the template
 * size reader (sizes.ts), which decides: sure size, unsure size (flagged, never parsed), or no size → where two passes
 * read one spot the better read stays (a room name or a size over a garbled line; the page's own pass on a tie) →
 * grouped into labels, each turned page's on its own and its labels' boxes turned back.
 */
export async function readText(src: Gray | ImageBitmapSource, opts: ReadTextOptions = {}): Promise<TextTrace> {
  const gray = 'data' in src && 'width' in src && src.data instanceof Uint8Array ? (src as Gray) : await toGray(src as ImageBitmapSource)
  const top = { votes: 0 }
  const passes: Pass[] = passesOf(gray, 0, true, 0, top)
  const charH = passes[0].charH
  const dark = darkGround(gray)
  if (dark) passes.push(...passesOf(dark, 0, false))
  // (the page as the dark-ground pass sees it: white print on dark ground dark on paper, the rest as drawn — a sideways
  // KITCHEN printed white on a granite floor)
  const ground = dark ? { ...gray, data: Uint8Array.from(gray.data, (v, i) => (dark.data[i] === 255 ? v : dark.data[i])) } : gray
  // (a turned page is read at the heights where its words stand as thick as a fifth of the page's own: sideways room
  // labels, Finlay Palm Spring / Accept Aftabnagar; a few turned dimension notes on a CAD sheet are not worth the time)
  const sideways = Math.max(12, 0.2 * top.votes)
  passes.push(...passesOf(rotateCW(ground), 1, false, sideways, undefined, 0.75 * charH))
  passes.push(...passesOf(rotateCCW(ground), 2, false, sideways, undefined, 0.75 * charH))
  // a line a pass of its kind found again (the same box in the same frame) is read once; a turned page's upright lines are the page's
  for (const [k, p] of passes.entries()) {
    const before = passes.slice(0, k).filter((q) => q.frame === p.frame && q.strict === p.strict).flatMap((q) => q.lines)
    p.lines = p.lines.filter((l) => (p.frame === 0 || !l.vertical) && !before.some((m) => iou(m.box, l.box) >= 0.6))
  }
  const T = await import('tesseract.js')
  const scheduler = T.createScheduler()
  const workers = await Promise.all(
    Array.from({ length: opts.workers ?? ocrWorkers() }, () =>
      T.createWorker('eng', T.OEM.LSTM_ONLY, { ...(opts.langPath ? { langPath: opts.langPath } : {}), ...(opts.cachePath ? { cachePath: opts.cachePath } : {}) }),
    ),
  )
  workers.forEach((w) => scheduler.addWorker(w))
  const setAll = (params: Record<string, string>) => Promise.all(workers.map((w) => w.setParameters(params)))
  try {
    let done = 0
    let total = passes.reduce((t, p) => t + p.lines.length, 0)
    /** every pass's lines `idx[k]` read, the image of each made by `image` */
    const readAll = (idx: number[][], image: (p: Pass, l: TextLine) => Blob) =>
      Promise.all(
        passes.map((p, k) =>
          Promise.all(
            idx[k].map(async (i) => {
              const { data } = await scheduler.addJob('recognize', image(p, p.lines[i]))
              opts.onProgress?.(++done, total)
              return { text: data.text.replace(/\s+/g, ' ').trim(), conf: data.confidence / 100 }
            }),
          ),
        ),
      )
    await setAll({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE, user_defined_dpi: '300' })
    const read = await readAll(
      passes.map((p) => p.lines.map((_, i) => i)),
      (p, l) => lineImage(p.img, l, 48, 'lanczos'),
    )
    // a height pass's line read as nothing useful: once more from its glyph mask (the crop holds the furniture and floor
    // lines the pass cut away)
    // (the better of the two: a room name or an area, then a size, then digits)
    const rank = (t: string) => (roomName(t) || parseArea(t) !== null ? 3 : parseDims(t) || LOOKS_LIKE_DIMS.test(t) ? 2 : /\d.*\d/.test(t) ? 1 : 0)
    // (only where the first read shows two letters or digits in a row: a line read as nothing or "|" is furniture)
    const again = passes.map((p, k) => (p.strict ? p.lines.flatMap((_, i) => (rank(read[k][i].text) === 3 || !/[A-Za-z0-9]{2}/.test(read[k][i].text) ? [] : [i])) : []))
    total += again.flat().length
    ;(await readAll(again, (p, l) => lineImage(p.clean, l, 48, 'lanczos'))).forEach((rs, k) => rs.forEach((r, j) => rank(r.text) > rank(read[k][again[k][j]].text) && (read[k][again[k][j]] = r)))
    // size candidates: horizontal, ≥ 2.5 line heights wide, not read as a room name or an area
    // (a later pass's line only when its plain read shows two digits: most of them are furniture and hatch, read for nothing)
    const cand = passes.map((p, k) => p.lines.flatMap((l, i) => (!p.names && !l.vertical && l.box.w > 2.5 * l.box.h && !classifyRoom(read[k][i].text) && parseArea(read[k][i].text) === null && (!p.strict || /\d.*\d/.test(read[k][i].text)) ? [i] : [])))
    // (a height pass's size is read and confirmed only in views of the page itself: its mask turns a 6 into a 0 — BED-3
    // 13'-6" read sure as 13'-0" on bti Amabilia — and a wrong size is worse than none)
    const viewsOf = (v: (typeof SIZE_VIEWS)[number]) => cand.map((c, k) => (v.from === 'clean' && passes[k].strict ? [] : c))
    total += SIZE_VIEWS.reduce((t, v) => t + viewsOf(v).flat().length, 0)
    await setAll({ tessedit_char_whitelist: SIZE_CHARS })
    const views: string[][][] = cand.map((c) => c.map(() => []))
    const caps = passes.map((p, k) => new Map(cand[k].map((i) => [p.lines[i], capBand(p.glyphs, p.lines[i].box)])))
    for (const v of SIZE_VIEWS)
      (await readAll(viewsOf(v), (p, l) => lineImage(v.from === 'raw' ? p.img : p.clean, l, v.px, v.kernel, v.cap ? caps[passes.indexOf(p)].get(l) : undefined))).forEach((rs, k) => rs.forEach((r, j) => views[k][j].push(r.text)))
    const size = passes.map((p, k) => {
      const sizes = readSizes(p.clean, p.glyphs, cand[k].map((i, j) => ({ box: p.lines[i].box, tess: views[k][j] })))
      return new Map(cand[k].map((i, j) => [i, { read: sizes[j], views: views[k][j] }]))
    })
    // looks like a size line at all: fits the size templates and shows foot / inch marks or reads digit-heavy — a room name
    // forced through the grammar ("TOILET 2" → 10'x41) has neither
    const isSize = (k: number, i: number) => {
      const r = size[k].get(i)?.read
      if (!r || r.fit > UNSURE_FIT) return false
      const t = read[k][i].text
      const digits = t.replace(/\D/g, '').length
      // or the matcher reads the full F'-I"xF'-I" form closely (marks merged into the digits on 6–7 px print)
      const full = /^\d{1,2}'-\d{1,2}"x\d{1,2}'-\d{1,2}"$/.test(r.text) && r.fit <= FULL_FORM_FIT
      return r.sure || full || topMarks(passes[k].glyphs, passes[k].lines[i].box) > 0 || (digits > 0 && digits >= t.replace(/[^A-Za-z]/g, '').length)
    }
    // a line read as no room name, no size, no area: three more views of it (a name the plain crop missed). The line right
    // above a size is a room name, so its words may then be snapped hard to the room lexicon
    const over = (k: number, j: number) =>
      passes[k].lines.some((s, i) => {
        if (!isSize(k, i)) return false
        const n = passes[k].lines[j]
        const gap = s.box.y - (n.box.y + n.box.h)
        return gap > -0.3 * s.box.h && gap < 1.1 * Math.max(s.box.h, n.box.h) && Math.abs(n.box.x + n.box.w / 2 - (s.box.x + s.box.w / 2)) < 0.6 * Math.max(n.box.w, s.box.w)
      })
    // (a later pass's line only when its plain read shows a word of three letters)
    const names = passes.map((p, k) => p.lines.flatMap((n, j) => (n.vertical || isSize(k, j) || roomName(read[k][j].text) || parseArea(read[k][j].text) !== null || (k > 0 && !/[A-Za-z]{3}/.test(read[k][j].text)) ? [] : [j])))
    if (names.some((n) => n.length)) {
      total += NAME_VIEWS.length * names.flat().length
      // (tesseract's own notes on odd crops — "Image too small to scale", "Detected 3 diacritics" — go nowhere)
      await setAll({ tessedit_char_whitelist: NAME_CHARS, debug_file: '/dev/null' })
      const seen = names.map((n, k) => n.map((j) => [read[k][j].text]))
      for (const v of NAME_VIEWS) {
        // (a height pass's line on the page was read raw and from its mask already: only its own glyphs and the wider crop
        // again; a turned page's line gets every view — sideways TOILET labels came through on those)
        const idx = names.map((n, k) => (passes[k].strict && passes[k].frame === 0 && !v.wide && v.from !== 'own' ? [] : n))
        const again = await readAll(idx, (p, l) => lineImage(v.from === 'clean' ? p.clean : p.img, l, v.px, v.kernel, undefined, v.from === 'own' ? p.glyphs : undefined, v.wide))
        idx.forEach((n, k) => n.forEach((j, m) => (seen[k][m].push(again[k][m].text), !roomName(read[k][j].text) && flatRoom(again[k][m].text, over(k, j)) && (read[k][j] = again[k][m]))))
      }
      // still no room name over a size: the views' words snapped hard to the room lexicon
      names.forEach((n, k) =>
        n.forEach((j, m) => {
          if (roomName(read[k][j].text) || !over(k, j)) return
          const snapped = seen[k][m].map(snapRoomWords).find((t) => roomName(t))
          if (snapped) read[k][j] = { text: snapped, conf: 0.5 }
        }),
      )
    }
    /** a pass's words; two room names read as one line are split at the glyph gap nearest the letters' split */
    const wordsOf = (k: number): (OcrWord & { vertical: boolean; worth: number; pass: number })[] =>
      passes[k].lines.flatMap((l, i) => {
        const s = size[k].get(i)
        // (a height pass names a room only in the sheet's own words: its letter-swap snaps — "RED" → BED on a marble floor — are noise)
        const one = (w: OcrWord) => ({ ...w, vertical: l.vertical, worth: passes[k].strict && roomName(w.text) && !verbatim(w.text) ? 0 : worth(w), pass: k })
        if (s?.read?.sure) return [one({ text: s.read.text, conf: 0.95, box: l.box, size: 'sure' })]
        // a size line nobody can confirm: flagged, never parsed
        if (isSize(k, i)) return [one({ text: read[k][i].text || s!.read!.text, conf: 0.3, box: l.box, size: 'unsure', guess: s!.read!.text })]
        const t = read[k][i].text
        if (!t) return []
        // a height pass's size the size reader did not confirm is flagged, never parsed: read loosely, "|s-6x66"" came out
        // 15'-6" × 6'-6" for 5'-6" × 6'-6" and the room fitted to it took its neighbours (Sheltech Water Lily)
        if (passes[k].strict && (parseDims(t) || LOOKS_LIKE_DIMS.test(t))) return [one({ text: t, conf: 0.3, box: l.box, size: 'unsure', ...(s?.read ? { guess: s.read.text } : {}) })]
        const two = !l.vertical && classifyRoom(t) && !nameOk(t) ? splitNames(t) : null
        if (!two) return [one({ text: t, conf: read[k][i].conf, box: l.box })]
        const xs = passes[k].glyphs.filter((g) => g.x + g.w / 2 >= l.box.x && g.x + g.w / 2 <= l.box.x + l.box.w && g.y + g.h / 2 >= l.box.y && g.y + g.h / 2 <= l.box.y + l.box.h).sort((p, q) => p.x - q.x)
        const want = l.box.x + two.at * l.box.w
        let cut = want, best = Infinity
        for (let g = 1; g < xs.length; g++) {
          const gap = xs[g].x - (xs[g - 1].x + xs[g - 1].w)
          const mid = xs[g].x - gap / 2
          if (gap > 0 && Math.abs(mid - want) < best) (best = Math.abs(mid - want)), (cut = mid)
        }
        return [
          one({ text: two.a, conf: read[k][i].conf, box: { ...l.box, w: cut - l.box.x } }),
          one({ text: two.b, conf: read[k][i].conf, box: { ...l.box, x: cut, w: l.box.x + l.box.w - cut } }),
        ]
      })
    /**
     * One frame's words: where two reads share a spot (half the smaller box), the better one stays — a room name or a size
     * over a garbled line; on a tie the earlier pass: the page's own; a garbled read of a later pass is dropped
     */
    const frameWords = (frame: number) => {
      const all = passes.flatMap((p, k) => (p.frame === frame ? wordsOf(k) : [])).sort((a, b) => b.worth - a.worth || a.pass - b.pass)
      const kept: typeof all = []
      for (const w of all) {
        if (w.worth === 0 && w.pass !== 0) continue
        if (!kept.some((o) => o.vertical === w.vertical && overlapOfSmaller(o.box, w.box) >= 0.5)) kept.push(w)
      }
      return kept.sort((a, b) => a.pass - b.pass)
    }
    const page = frameWords(0)
    const all = [...groupWords(page.filter((w) => !w.vertical)), ...page.filter((w) => w.vertical).flatMap((w) => groupWords([w]))] // a vertical word stands alone
    // a turned page's labels, grouped in its own frame and turned back; one stays where it reads better than the page there
    const itemWorth = (it: TextItem) => (it.kind === 'room' ? (it.dims ? 3.5 : 3) : it.kind === 'area' ? 3 : it.kind === 'dims' && it.dims ? 2 : 0)
    for (const [frame, turn] of [[1, 'cw'], [2, 'ccw']] as const) {
      for (const it of groupWords(frameWords(frame))) {
        const w = itemWorth(it)
        if (!w) continue
        it.box = boxBack(it.box, turn, gray.width, gray.height)
        if (it.sizeBox) it.sizeBox = boxBack(it.sizeBox, turn, gray.width, gray.height)
        const rivals = all.filter((o) => overlapOfSmaller(o.box, it.box) >= 0.3)
        if (rivals.some((o) => itemWorth(o) >= w)) continue
        for (const o of rivals) all.splice(all.indexOf(o), 1)
        all.push(it)
      }
    }
    // a size table beside the plan: its text is no plan label (s25)
    // (a legend in a dark box is a table too: its ground taken as paper, as the dark-ground pass read it)
    const tables = findTables(all, ground)
    const items = all.filter((it) => !inTable(tables, it))
    // a size read with no name over it: the sheet prints the name there, no pass read it — the strip just above the size
    // read once more, name alphabet, two scales; a room name in the sheet's own words names the size (s26)
    const bare = items.filter((it) => it.kind === 'dims' && (it.dims || it.sizeUnread) && !it.text.includes('\n'))
    if (bare.length) {
      await setAll({ tessedit_pageseg_mode: T.PSM.SINGLE_LINE, tessedit_char_whitelist: NAME_CHARS, debug_file: '/dev/null' })
      const strips = bare.map((it) => {
        const h = it.box.h, w = Math.max(1.3 * it.box.w, 5 * h)
        return { x: it.box.x + it.box.w / 2 - w / 2, y: it.box.y - 1.6 * h, w, h: 1.6 * h }
      })
      for (const px of [44, 34]) {
        const todo = bare.flatMap((it, i) => (it.kind === 'dims' ? [i] : []))
        const reads = await Promise.all(todo.map((i) => scheduler.addJob('recognize', toPgm(pad(stretch(resample(cropGray(gray, strips[i]), Math.max(1, Math.min(8, px / bare[i].box.h)), 'lanczos')), 12)) as unknown as Blob)))
        todo.forEach((i, k) => {
          const name = reads[k].data.text.replace(/\s+/g, ' ').trim()
          const room = verbatim(name) && flatRoom(name, true) ? roomName(name)! : null
          if (!room) return
          const it = bare[i]
          Object.assign(it, { text: `${name}\n${it.text}`, box: union(strips[i], it.box), kind: 'room', roomKind: room.kind, green: room.green || undefined, conf: 0.5 })
        })
      }
    }
    // one label read twice (two passes, their boxes a little apart): the read with a size stays — a name printed twice is
    // the next flat's to the floor tracer (solve.ts), so a twin would split a flat
    const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
    const rooms = items.filter((it) => it.kind === 'room').sort((a, b) => Number(!!b.dims) - Number(!!a.dims) || b.conf - a.conf)
    for (const [i, a] of rooms.entries())
      if (rooms.slice(0, i).some((b) => items.includes(b) && nameKey(b.text.split('\n')[0]) === nameKey(a.text.split('\n')[0]) && Math.hypot(centre(a.box).x - centre(b.box).x, centre(a.box).y - centre(b.box).y) < 3 * Math.min(a.box.h, b.box.h)))
        items.splice(items.indexOf(a), 1)
    // a room that should carry a printed size and has none read: the Studio asks for it (unless the AI reads it first)
    for (const it of items) if (!it.dims && (reaskReason(it) === 'room-without-dims' || (it.kind === 'room' && reaskReason(it) === 'unparsed-dims'))) it.sizeUnread = true
    // …unless the table beside the plan prints it
    applyTables(items, tables)
    return { items, glyphPx: charH, ...(tables.length ? { tables } : {}) }
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
  // (the faces read in parallel, as many workers as readText uses — s26: one worker made big sheets wait)
  const scheduler = T.createScheduler()
  const workers = await Promise.all(Array.from({ length: Math.min(todo.length, ocrWorkers()) }, () => T.createWorker('eng', T.OEM.LSTM_ONLY, { ...(opts.langPath ? { langPath: opts.langPath } : {}), ...(opts.cachePath ? { cachePath: opts.cachePath } : {}) })))
  workers.forEach((w) => scheduler.addWorker(w))
  const out: TextItem[] = []
  try {
    const found = new Map<number, string>()
    for (const v of FACE_VIEWS) {
      await Promise.all(workers.map((w) => w.setParameters({ tessedit_pageseg_mode: T.PSM[v.psm], user_defined_dpi: '300', tessedit_char_whitelist: NAME_CHARS, debug_file: '/dev/null' })))
      await Promise.all(
        [...todo.entries()].map(async ([i, f]) => {
          if (found.has(i)) return
          const img = pad(stretch(resample(cropGray(g, f.box), Math.max(1, Math.min(8, v.px / ch)), 'lanczos')), 12)
          const { data } = await scheduler.addJob('recognize', toPgm(img) as unknown as Blob)
          const name = data.text.split('\n').map((l) => l.trim()).find((l) => flatRoom(l, false))
          if (name) found.set(i, name)
        }),
      )
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
    await scheduler.terminate()
  }
  return out
}

/** a flat's type as its stamp prints it: "TYPE-A", "TYPE B" */
const TYPE_RE = /\bTYPE[\s-]*([A-Z0-9]{1,2})\b/i

/**
 * Level 4: a flat's printed area ("±2736 SFT") read with no TYPE beside it — Sheltech L2's red "TYPE-B (L/O)" the line
 * finder loses in its red box — gets the block around it read whole (one block at 4×, then 6× and 3×); a "TYPE-B" found
 * is added just above the area as text of kind 'other', where the solver looks for a flat's type. Nothing else is added.
 */
export async function readTypes(g: Gray, trace: TextTrace, opts: Pick<ReadTextOptions, 'langPath' | 'cachePath'> = {}): Promise<TextItem[]> {
  const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const todo = trace.items.filter((it) => {
    if (it.kind !== 'area' || !it.areaSqm) return false
    const c = centre(it.box)
    return !trace.items.some((o) => TYPE_RE.test(o.text) && Math.hypot(centre(o.box).x - c.x, centre(o.box).y - c.y) < 3 * it.box.h)
  })
  if (!todo.length) return []
  const T = await import('tesseract.js')
  const worker = await T.createWorker('eng', T.OEM.LSTM_ONLY, { ...(opts.langPath ? { langPath: opts.langPath } : {}), ...(opts.cachePath ? { cachePath: opts.cachePath } : {}) })
  const out: TextItem[] = []
  try {
    await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SINGLE_BLOCK, user_defined_dpi: '300', debug_file: '/dev/null' })
    for (const it of todo) {
      const c = centre(it.box), h = it.box.h
      const box = { x: Math.round(c.x - it.box.w), y: Math.round(c.y - 3.5 * h), w: Math.round(2 * it.box.w), h: Math.round(4.5 * h) }
      // (a letter read at any size wins over a digit: the red B reads "8" at some sizes)
      let got: string | null = null
      for (const s of [4, 6, 3]) {
        const { data } = await worker.recognize(toPgm(pad(stretch(resample(cropGray(g, box), s, 'lanczos')), 12)) as unknown as Blob)
        const m = TYPE_RE.exec(data.text)?.[1].toUpperCase()
        if (m && (!got || /^\d+$/.test(got))) got = m
        if (got && !/^\d+$/.test(got)) break
      }
      if (got) out.push({ text: `TYPE-${got}`, box: { x: c.x - it.box.w / 2, y: c.y - 2 * h, w: it.box.w, h }, kind: 'other', conf: 0.5, source: 'ocr' })
    }
  } finally {
    await worker.terminate()
  }
  return out
}
