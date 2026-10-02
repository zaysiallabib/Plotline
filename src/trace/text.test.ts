/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { FT } from '../core'
import type { Unit } from '../core'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import type { Gray, TextItem, TextTrace } from './types'
import { askAi, buildMontage, parseAiAnswer, parseMontageAnswer, strictSize } from './ai'
import { FIXTURES, loadPgm } from './evalio'
import { sameLabel, scoreText } from './textEval'
import { H as SIZE_H, band, capBand, confirmed, decode, lcsMatches, readSizes, renderFont, tessConfirms } from './sizes'
import { chunkWords, classifyRoom, cleanForOcr, findTextLines, groupWords, itemFromAi, parseArea, parseDims, readText, reaskList, reaskReason, type OcrWord } from './text'

const ft = (f: number, i = 0) => (f + i / 12) * FT
const INCH = 0.0254

describe('parseDims', () => {
  test.each([
    [`14'-5" x 14'-4"`, ft(14, 5), ft(14, 4)],
    [`14'5"x14'4"`, ft(14, 5), ft(14, 4)],
    [`14'-5"X14'-4"`, ft(14, 5), ft(14, 4)],
    [`14'-0"×16'-0"`, ft(14), ft(16)],
    [`14'-0" × 16'-0"`, ft(14), ft(16)],
    [`5'-11 1/2" X 7'-0"`, ft(5, 11.5), ft(7)],
    [`5'-11½"x7'`, ft(5, 11.5), ft(7)],
    [`15'X18'-3"`, ft(15), ft(18, 3)],
    [`6'-10"X6'-10"`, ft(6, 10), ft(6, 10)],
    [`4.4m x 3.2m`, 4.4, 3.2],
    [`4.4 x 3.2m`, 4.4, 3.2],
    [`14.4 x 12`, ft(14.4), ft(12)],
    // OCR-mangled
    [`14'-5"x 14'-4`, ft(14, 5), ft(14, 4)],
    [`l4'-5"X14'-4"`, ft(14, 5), ft(14, 4)],
    [`14'-S"X14'-4"`, ft(14, 5), ft(14, 4)],
    [`14’-5”X14’-4”`, ft(14, 5), ft(14, 4)],
    [`14'-5''X14'-4''`, ft(14, 5), ft(14, 4)],
    [`14'-5'X14'-4'`, ft(14, 5), ft(14, 4)],
    [`14-5"X14-4"`, ft(14, 5), ft(14, 4)],
    [`14'-5"14'-4"`, ft(14, 5), ft(14, 4)],
    [`3'-0"X    5'-5"`, ft(3), ft(5, 5)],
    [`(12'-O"X14'-2").`, ft(12), ft(14, 2)],
    [`13'-10"X12'-0"`, ft(13, 10), ft(12)],
    // marks lost by OCR on 6–8 px print (seen on the BTI / Sheltech sheets)
    [`362X120"`, ft(36, 2), ft(12)],
    [`50X70"`, ft(5), ft(7)],
    [`14-5%14-4"`, ft(14, 5), ft(14, 4)],
    [`136" 160"`, ft(13, 6), ft(16)],
    [`511X5'-11"`, ft(5, 11), ft(5, 11)],
    [`110"X9'-0"`, ft(11), ft(9)],
    [`9.0'X50"`, ft(9), ft(5)],
    [`14'-5" X 12`, ft(14, 5), ft(12)],
  ])('%s', (s, a, b) => {
    const d = parseDims(s)!
    expect(d).not.toBeNull()
    expect(Math.abs(d.aM - a)).toBeLessThan(INCH / 4)
    expect(Math.abs(d.bM - b)).toBeLessThan(INCH / 4)
  })
  test.each([`BED-1`, `14'-5"`, `2736 SFT`, `14'-15"X12'-0"`, `1'-0"X1'-0"`, `99'-0"X12'-0"`, `KITCHEN`, ``, `x`, `12x`])('%s → null', (s) => {
    expect(parseDims(s)).toBeNull()
  })
})

describe('parseArea', () => {
  const sft = (n: number) => n * FT * FT
  test.each([
    [`2736 sft`, sft(2736)],
    [`±2,736 SFT`, sft(2736)],
    [`±2736 SFT`, sft(2736)],
    [`2383sft`, sft(2383)],
    [`UNIT A 2956 SFT`, sft(2956)],
    [`2703 SFT & 674 SFT`, sft(2703)],
    [`2662 S.F.T`, sft(2662)],
    [`1450 sq ft`, sft(1450)],
    [`254 sqm`, 254],
  ])('%s', (s, v) => expect(parseArea(s)).toBeCloseTo(v, 3))
  test.each([`BED-1`, `12 SFT`, `14'-5"X14'-4"`, `SFT`])('%s → null', (s) => expect(parseArea(s)).toBeNull())
})

describe('classifyRoom', () => {
  test.each([
    ['BED-1', 'bed'],
    ['BED -02', 'bed'],
    ['MASTER BED', 'bed'],
    ['M BED', 'bed'],
    ['CHILD BED', 'bed'],
    ['GUEST BED', 'bed'],
    ['8ED-2', 'bed'],
    ['DRAWING', 'living'],
    ['LIVING', 'living'],
    ['FORMAL LIVING', 'living'],
    ['FAMILY LIVING', 'living'],
    ['LIVING CUM DINING', 'living'],
    ['LIVING,DINING & FAMILY LIVING', 'living'],
    ['DINING', 'dining'],
    ['DINING-FAMILY', 'dining'],
    ['DINING & FAMILY LIVING', 'dining'],
    ['DINING CUM LIVING', 'dining'],
    ['KITCHEN', 'kitchen'],
    ['DRY KITCHEN', 'kitchen'],
    ['KlTCHEN', 'kitchen'],
    ['K. VERANDA', 'balcony'],
    ['K.VERANDA', 'balcony'],
    ['K.VER', 'balcony'],
    ['KITCHEN VERANDA', 'balcony'],
    ['TOILET', 'bath'],
    ['T0ILET 1', 'bath'],
    ['BATH-3', 'bath'],
    ['M. TOILET', 'bath'],
    ['C.TOILET', 'bath'],
    ['PDR', 'bath'],
    ['PDR.', 'bath'],
    ['POWDER', 'bath'],
    ['H. TOILET', 'bath'],
    ['H.TOILET', 'bath'],
    ['S.TOILET', 'bath'],
    ['SERVANT TOILET', 'bath'],
    ['VERANDA', 'balcony'],
    ['VERANDAH', 'balcony'],
    ['VER.', 'balcony'],
    ['BALCONY', 'balcony'],
    ['BALC.', 'balcony'],
    ['LIFT', 'other'],
    ['LIFT LOBBY', 'other'],
    ['LOBBY', 'other'],
    ['STAIR', 'other'],
    ['FIRE STAIR', 'other'],
    ['12 person Hoistway', 'other'],
    ['FOYER', 'other'],
    ['PASSAGE', 'other'],
    ['PRAYER', 'other'],
    ['STORE', 'utility'],
    ['SERVANT BED', 'utility'],
    ['S.BED', 'utility'],
    ['HELP BED', 'utility'],
    ['HELP ROOM', 'utility'],
    ['MAID BED', 'utility'],
    ['STUDY', 'study'],
    ['STUDY ROOM', 'study'],
    ['W.I.C', 'closet'],
    ['WALK IN CLOSET', 'closet'],
    ['WALK-IN CLOSET', 'closet'],
    ['AOD', 'shaft'],
    ['DUCT', 'shaft'],
    ['SHAFT', 'shaft'],
    ['ODU', 'shaft'],
    ['UTILITY', 'utility'],
    ['LAUNDRY', 'utility'],
  ])('%s → %s', (s, kind) => {
    expect(classifyRoom(s)).toEqual({ kind, green: false })
  })
  test.each(['SUNSHADE/PLANTER', 'SUNSHADE', 'PLANTER', 'GREEN', 'LANDSCAPE', 'PLANTAR'])('%s → balcony + green', (s) => {
    expect(classifyRoom(s)).toEqual({ kind: 'balcony', green: true })
  })
  test.each(['WASHING MACHINE', 'FREEZER', 'FRIDGE', 'D.W', 'UP', 'DN', 'BEAM BOTTOM SLAB', 'F.H.B', 'LIFT PIT', '2662', 'N', 'TYPE-A'])('%s → not a room', (s) => {
    expect(classifyRoom(s)).toBeNull()
  })
})

const word = (text: string, x: number, y: number, h = 10, conf = 0.9): OcrWord => ({ text, box: { x, y, w: text.length * h * 0.6, h }, conf })

describe('grouping', () => {
  test('a name above its dims line is one room item', () => {
    const items = groupWords([word('BED-1', 100, 100), word(`14'-0"X16'-0"`, 88, 113)])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'room', roomKind: 'bed', text: `BED-1\n14'-0"X16'-0"` })
    expect(items[0].dims!.aM).toBeCloseTo(ft(14), 4)
    expect(items[0].box).toEqual({ x: 88, y: 100, w: 13 * 6, h: 23 })
  })
  test('a multi-line name stacks; the dims line closes the block', () => {
    const items = groupWords([
      word('DINING', 100, 100),
      word('&', 140, 100),
      word('FAMILY', 96, 113),
      word('LIVING', 140, 113),
      word(`12'-11"X23'-10"`, 90, 126),
      word('BED-3', 100, 139), // right below the dims: a new label, not the same block
      word(`11'-0"X10'-6"`, 92, 152),
    ])
    expect(items.map((i) => [i.kind, i.roomKind, i.text])).toEqual([
      ['room', 'dining', `DINING & FAMILY LIVING\n12'-11"X23'-10"`],
      ['room', 'bed', `BED-3\n11'-0"X10'-6"`],
    ])
  })
  test('two labels side by side on one baseline stay apart', () => {
    const chunks = chunkWords([word('HELP', 100, 100), word('ROOM', 130, 100), word('K.VERANDA', 200, 100)])
    expect(chunks.map((c) => c.text)).toEqual(['HELP ROOM', 'K.VERANDA'])
  })
  test('a dims pair split by a wide gap is kept whole', () => {
    const chunks = chunkWords([word(`3'-0"X`, 100, 100), word(`5'-5"`, 160, 100)])
    expect(chunks.map((c) => c.text)).toEqual([`3'-0"X 5'-5"`])
    expect(parseDims(chunks[0].text)).not.toBeNull()
  })
  test('area strings, stray dims, planters, other text', () => {
    const items = groupWords([
      word('±2736', 500, 500, 12),
      word('SFT', 540, 500, 12),
      word(`5'-0"X7'-0"`, 800, 300),
      word('SUNSHADE/', 300, 700),
      word('PLANTER', 305, 712),
      word('LANDOWNER', 900, 900),
    ])
    const byKind = Object.fromEntries(items.map((i) => [i.kind, i]))
    expect(byKind.area.areaSqm).toBeCloseTo(2736 * FT * FT, 3)
    expect(byKind.dims.dims!.bM).toBeCloseTo(ft(7), 4)
    expect(byKind.room).toMatchObject({ roomKind: 'balcony', green: true, text: 'SUNSHADE/ PLANTER' })
    expect(byKind.other.text).toBe('LANDOWNER')
  })
  test('the block keeps its weakest word confidence', () => {
    const items = groupWords([word('KITCHEN', 100, 100, 10, 0.95), word(`8'-0"X11'-0"`, 95, 113, 10, 0.4)])
    expect(items[0].conf).toBe(0.4)
  })
})

const item = (over: Partial<TextItem>): TextItem => ({ text: 'BED-1', box: { x: 0, y: 0, w: 30, h: 10 }, kind: 'room', roomKind: 'bed', conf: 0.9, source: 'ocr', ...over })

describe('re-ask rule', () => {
  test('confident room with dims: keep', () => {
    expect(reaskReason(item({ dims: { aM: 4, bM: 5 } }))).toBeNull()
  })
  test('room with no dims → ask; shafts / lifts / planters never carry a size', () => {
    expect(reaskReason(item({}))).toBe('room-without-dims')
    expect(reaskReason(item({ text: 'AOD', roomKind: 'shaft' }))).toBeNull()
    expect(reaskReason(item({ text: 'LIFT LOBBY', roomKind: 'other' }))).toBeNull()
    expect(reaskReason(item({ text: 'SUNSHADE/PLANTER', roomKind: 'balcony', green: true }))).toBeNull()
  })
  test('unparsed dims → ask', () => {
    expect(reaskReason(item({ kind: 'dims', text: `14'-?"X1`, roomKind: undefined }))).toBe('unparsed-dims')
    expect(reaskReason(item({ text: `BED-1\n14'-?"X1` }))).toBe('unparsed-dims')
  })
  test('low confidence → ask; answers from the AI are final', () => {
    expect(reaskReason(item({ dims: { aM: 4, bM: 5 }, conf: 0.3 }))).toBe('low-confidence')
    expect(reaskReason(item({ conf: 0.3, source: 'ai' }))).toBeNull()
  })
  test('reaskList pads the crop, more below (where a size sits)', () => {
    const list = reaskList({ items: [item({ box: { x: 100, y: 100, w: 30, h: 10 } }), item({ dims: { aM: 4, bM: 5 } })] })
    expect(list).toHaveLength(1)
    expect(list[0].crop).toEqual({ x: 85, y: 85, w: 60, h: 55 })
  })
  test('the reader JSON (fenced, 0–1000 boxes) → image-space items; junk → []', () => {
    const answer = '```json\n[{"text": "KITCHEN\\n8\'-0\\"X11\'-0\\"", "box": [100, 200, 500, 800], "kind": "room"}, {"text": 5}, {"text": "x", "box": [1]}]\n```'
    const items = parseAiAnswer(answer, { w: 200, h: 100, offset: { x: 1000, y: 2000 } })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'room', roomKind: 'kitchen', source: 'ai', box: { x: 1040, y: 2010, w: 120, h: 40 } })
    expect(items[0].dims!.bM).toBeCloseTo(ft(11), 4)
    expect(parseAiAnswer('Sorry, I cannot read that.', { w: 1, h: 1, offset: { x: 0, y: 0 } })).toEqual([])
    expect(parseAiAnswer('{"text": "BED"}', { w: 1, h: 1, offset: { x: 0, y: 0 } })).toEqual([])
  })
  test('an AI answer parses like OCR text, box moved to image space', () => {
    const it = itemFromAi(`BED-1\n14'-0"X16'-0"`, { x: 5, y: 5, w: 40, h: 20 }, { x: 100, y: 200 })
    expect(it).toMatchObject({ kind: 'room', roomKind: 'bed', source: 'ai', box: { x: 105, y: 205, w: 40, h: 20 } })
    expect(it.dims!.bM).toBeCloseTo(ft(16), 4)
  })
})

describe('scoreText (eval vs a hand-traced unit)', () => {
  const unit = typeB as unknown as Unit
  const pi = unit.planImage!
  test('a perfect reading scores full marks; an empty one misses everything', () => {
    const items: TextItem[] = unit.roomLabels.map((l) => ({
      text: l.printedSize ? `${l.name}\n${l.printedSize}` : l.name,
      box: { x: pi.originPx.x + l.x * pi.pxPerM - 20, y: pi.originPx.y + l.y * pi.pxPerM - 5, w: 40, h: 10 },
      kind: 'room',
      roomKind: l.kind,
      green: /planter/i.test(l.name) || undefined,
      dims: l.printedSize ? parseDims(l.printedSize)! : undefined,
      conf: 1,
      source: 'ocr',
    }))
    const s = scoreText({ items }, unit)
    expect([s.found, s.kindOk, s.dimsExact, s.greenFound, s.dimsMisread]).toEqual([s.labels, s.labels, s.dimsTotal, s.greenTotal, 0])
    const none = scoreText({ items: [] }, unit)
    expect([none.found, none.missed.length]).toEqual([0, none.labels])
  })
  test('label matching: plan abbreviations, conflicting numbers', () => {
    expect(sameLabel('Veranda (kitchen)', 'K.VERANDA')).toBe(true)
    expect(sameLabel('Veranda 1', `VER.\n7'-9"x5'-2"`)).toBe(true)
    expect(sameLabel('Powder room', 'PDR.')).toBe(true)
    expect(sameLabel('Bed-1', 'BED-2')).toBe(false)
    expect(sameLabel('Kitchen', 'BED-2')).toBe(false)
  })
})

// ---------------------------------------------------------------- the size reader (sizes.ts)

/** A plan-like raster with `text` printed in the stroke font at `capPx` px glyphs, top-left at (x, y). */
function printSize(g: Gray, text: string, x: number, y: number, capPx: number, sw = 0.14, ws = 0.85): void {
  const T = renderFont(sw, ws)
  const s = capPx / SIZE_H
  let cx = x
  for (const ch of text) {
    const t = T[ch === 'X' ? 'xX' : ch]
    const rows = t.d.length / t.w
    for (let yy = 0; yy < Math.ceil(rows * s); yy++)
      for (let xx = 0; xx < Math.ceil(t.w * s); xx++) {
        // box-filter the template cell under this pixel
        let sum = 0
        let n = 0
        for (let v = Math.floor(yy / s); v < Math.min(rows, Math.ceil((yy + 1) / s)); v++)
          for (let u = Math.floor(xx / s); u < Math.min(t.w, Math.ceil((xx + 1) / s)); u++) (sum += t.d[v * t.w + u]), n++
        const px = Math.round(cx + xx)
        const py = Math.round(y - 3 * s + yy) // the template's 3 pad rows sit above the cap
        if (n && px < g.width && py >= 0 && py < g.height) g.data[py * g.width + px] = Math.min(g.data[py * g.width + px], Math.round(240 - 200 * (sum / n)))
      }
    cx += t.w * s + 0.12 * capPx
  }
}
const paper = (w: number, h: number): Gray => ({ width: w, height: h, data: new Uint8Array(w * h).fill(240) })

describe('size reader', () => {
  test('decode reads a clean band exactly, with the runner-up string far behind', () => {
    const g = paper(400, 60)
    printSize(g, `13'-0"x15'-6"`, 40, 20, 20)
    const { gray: clean, glyphs, charH } = cleanForOcr(g)
    const [line] = findTextLines(glyphs, charH)
    const b = band(clean, line.box, capBand(glyphs, line.box))!
    const d = decode(b.D, b.W, renderFont(0.14, 0.85))!
    expect(d.text).toBe(`13'-0"x15'-6"`)
    expect(d.margin).toBeGreaterThan(6)
  })
  test('the grammar: inches 0–11, feet ≤ 39 — a misprint cannot come out as text the grammar forbids', () => {
    const g = paper(400, 60)
    printSize(g, `13'-0"x15'-6"`, 40, 20, 20)
    const { gray: clean, glyphs, charH } = cleanForOcr(g)
    const [line] = findTextLines(glyphs, charH)
    const b = band(clean, line.box, capBand(glyphs, line.box))!
    // only templates for 4 and 9 among the digits: nothing grammatical fits better than "49" feet? no: feet ≤ 39
    const T = renderFont(0.14, 0.85)
    const only = Object.fromEntries(Object.entries(T).filter(([k]) => !/[0-35-8]/.test(k[0])))
    const d = decode(b.D, b.W, only)
    expect(d === null || !/4\d|9\d|\D1[2-9]"/.test(d.text)).toBe(true)
  })
  test('readSizes on small print: sure when tesseract agrees, unsure (not sure) when nothing confirms a far-behind runner-up', () => {
    const g = paper(900, 200)
    const texts = [`13'-0"x15'-6"`, `11'-0"x7'-8"`, `9'-3"x7'-1"`, `12'-0"x14'-2"`, `10'-5"x11'-6"`, `6'-0"x6'-8"`, `18'-8"x6'-0"`, `7'-9"x5'-2"`]
    texts.forEach((t, i) => printSize(g, t, 30 + (i % 2) * 420, 20 + Math.floor(i / 2) * 45, 9))
    const { gray: clean, glyphs, charH } = cleanForOcr(g)
    const lines = findTextLines(glyphs, charH).sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
    expect(lines).toHaveLength(texts.length)
    // tesseract "agrees" on every line but the last, where it read junk
    const reads = readSizes(clean, glyphs, lines.map((l, i) => ({ box: l.box, tess: i < texts.length - 1 ? [texts[i].replace(/'/g, '')] : ['7I9xS2'] })))
    reads.forEach((r, i) => expect(r?.text).toBe(texts[i]))
    expect(reads.slice(0, -1).every((r) => r!.sure && r!.agree)).toBe(true)
    expect(reads[texts.length - 1]!.agree).toBe(false)
  }, 30_000)
  test('tesseract confirms a reading: whole, side by side across views, or digit by digit — else not', () => {
    const d = { aM: ft(13), bM: ft(15, 6) }
    expect(tessConfirms(`13'-0"x15'-6"`, d, [`13-0"X15'-6"`])).toBe(true)
    expect(tessConfirms(`13'-0"x15'-6"`, d, [`13'-0"x16'`, `1'-0"x15'-6"`, `13'-0"X15-0"`])).toBe(true) // side A in one view, B in another
    expect(tessConfirms(`13'-0"x15'-6"`, d, [`1301566`])).toBe(true) // every digit on the LCS
    expect(tessConfirms(`13'-0"x15'-6"`, d, [`13-0"x16-6"`, `15'-0"X16'`])).toBe(false) // the 5 of side B never seen there
  })
  test('confirmed glyphs: LCS of the digit strings, marks only on a well-confirmed line', () => {
    expect(lcsMatches('130156', '1301565')).toEqual([0, 1, 2, 3, 4, 5])
    expect(lcsMatches('130156', '1906')).toEqual([0, 2, 5])
    const d = { text: `13'-0"x15'-6"`, cost: 0, margin: 9, fit: 0.01, glyphs: [...`13'-0"x15'-6"`].map((k, x) => ({ k, x, dy: 0 })) }
    expect(confirmed(d, ['130156'])!.map((g) => g.k).join('')).toBe(`13'-0"x15'-6"`)
    expect(confirmed(d, ['13x1'])).toBeNull() // 3 of 6 digits: under 60 %
    expect(confirmed(d, ['13x15']!)!.map((g) => g.k).join('')).toBe(`13'-"x15'-"`) // 4 of 6: digits matched + the marks
  })
})

describe('AI montage (no key in tests: the reader is mocked)', () => {
  test('strictSize: only well-formed sizes', () => {
    expect(strictSize(`12'-0"X14'-6"`)).toEqual({ aM: ft(12), bM: ft(14, 6) })
    expect(strictSize(`5'-11½" x 7'-0"`)!.aM).toBeCloseTo(ft(5, 11.5), 6)
    expect(strictSize(`15X18'-3"`)).toEqual({ aM: ft(15), bM: ft(18, 3) })
    expect(strictSize(`13’-0”×15’-6”`)).toEqual({ aM: ft(13), bM: ft(15, 6) })
    for (const bad of [`12'-0"`, `12-0X14-6`, `1x2`, `12'-13"X14'-6"`, `52'-0"X14'-6"`, `12'-0"X14'-6" approx`, `l2'-0"X14'-6"`, `?`]) expect(strictSize(bad)).toBeNull()
  })
  test('parseMontageAnswer: tile numbers in range, sizes through the strict grammar, junk ignored', () => {
    const a = parseMontageAnswer('```json\n[{"n":1,"name":"BED-2","size":"12\'-0\\"X14\'-6\\""},{"n":2,"name":"TOILET","size":"6-4x6-7"},{"n":9,"name":"X","size":""},{"n":"3"},{"n":1,"name":"dup"}]\n```', 3)
    expect([...a.keys()]).toEqual([1, 2])
    expect(a.get(1)).toMatchObject({ name: 'BED-2', dims: { aM: ft(12), bM: ft(14, 6) } })
    expect(a.get(2)!.dims).toBeUndefined() // not well-formed: no size
    expect(parseMontageAnswer('I cannot read this', 3).size).toBe(0)
  })
  const sheet = () => {
    const g = paper(400, 200)
    printSize(g, `11'-0"x7'-8"`, 60, 40, 9)
    printSize(g, `9'-3"x7'-1"`, 60, 120, 9)
    return g
  }
  const unsure = (y: number, over: Partial<TextItem> = {}): TextItem => ({ text: `BED 3\n1-619`, box: { x: 60, y, w: 90, h: 22 }, kind: 'room', roomKind: 'bed', conf: 0.5, source: 'ocr', sizeUnread: true, sizeBox: { x: 60, y: y + 12, w: 90, h: 9 }, ...over })
  test('the montage: one image, a numbered tile per label, upscaled', () => {
    const m = buildMontage(sheet(), [unsure(28), unsure(108)], 9)
    expect(m.height).toBeGreaterThan(2 * 28 * 2) // two tiles of ≥ 2 upscaled lines each
    expect(m.width).toBeGreaterThan(14 * 9 * 3)
    expect(Math.min(...m.data.subarray(0, 30 * m.width))).toBeLessThan(80) // the tile number is drawn
  })
  test('askAi: ONE call for the unsure labels; a strict answer fills the size, a garbled one leaves the flag', async () => {
    const items = [unsure(28), unsure(108, { text: 'KITCHEN', roomKind: 'kitchen', sizeBox: undefined }), item({ dims: { aM: 4, bM: 5 } })]
    const calls: string[] = []
    const ask = async (_png: Blob, prompt: string) => {
      calls.push(prompt)
      return JSON.stringify([
        { n: 1, name: 'BED 3', size: `11'-0"x7'-8"` },
        { n: 2, name: 'KITCHEN', size: `9-3 x 7-1` },
      ])
    }
    const reader = Object.assign(async () => [], { ask })
    const out = await askAi({ items, glyphPx: 9 }, sheet(), reader, { encode: async () => new Blob([]) })
    expect(calls).toHaveLength(1)
    expect(out.items[0]).toMatchObject({ source: 'ai', dims: { aM: ft(11), bM: ft(7, 8) } })
    expect(out.items[0].sizeUnread).toBeUndefined()
    expect(out.items[1]).toMatchObject({ source: 'ocr', sizeUnread: true })
    expect(out.items[2]).toBe(items[2])
    // a reader with no montage support changes nothing
    expect(await askAi({ items }, sheet(), async () => [])).toEqual({ items })
  })
})

describe('glyph mask', () => {
  test('a size printed onto a floor line comes back (the line is cut away, the glyphs touching it return)', () => {
    const g = paper(300, 120)
    printSize(g, `3'-9"X4'-5"`, 40, 20, 10)
    printSize(g, `12'-0"X13'-8"`, 40, 60, 10) // more print on the sheet, so the glyph height is the digits'
    printSize(g, `10'-6"X8'-0"`, 40, 90, 10)
    for (let x = 0; x < 60; x++) for (const y of [30, 31]) g.data[y * 300 + x] = 60 // a floor line under the "3'", touching it
    const { glyphs, charH } = cleanForOcr(g)
    const lines = findTextLines(glyphs, charH).filter((l) => l.box.y < 40)
    expect(lines).toHaveLength(1)
    expect(lines[0].box.x).toBeLessThanOrEqual(41)
  })
})

// ---------------------------------------------------------------- the reader eval on the real sheets (node tesseract)
/**
 * TRACE_OCR=1 npx vitest run src/trace/text.test.ts --disableConsoleIntercept
 * Reads the three Phase-0 sheets (five hand-traced units) + Banani L2-6 + DMD L3-14 with the app's own `readText`.
 * TRACE_TESS = folder with eng.traineddata (no download); TRACE_TEXT_OUT = write each sheet's TextTrace JSON there.
 */
const TESS = process.env.TRACE_TESS ?? 'E:/dev/tmp/wave19/reader/tess'
const TEXT_OUT = process.env.TRACE_TEXT_OUT ?? ''
const SHEETS: { sheet: string; units: Unit[] }[] = [
  { sheet: 'assets__plan-2nd-floor', units: [typeA as unknown as Unit] },
  { sheet: 'assets__plan-3rd-floor', units: [typeB as unknown as Unit, typeC as unknown as Unit] },
  { sheet: 'assets__plan-sheltech-l2', units: [sheltechA as unknown as Unit, sheltechB as unknown as Unit] },
  { sheet: 'Sheltech_Banani__Level_2-6', units: [] },
  { sheet: 'Sheltech_dmd__Level_3-14', units: [] },
]

describe.skipIf(!process.env.TRACE_OCR || !existsSync(`${FIXTURES}assets__plan-2nd-floor.pgm`))('readText on the demo sheets (eval report)', () => {
  test('sized labels found / sizes read / misreads', async () => {
    const rows: Record<string, string | number>[] = []
    const misses: string[] = []
    const tot = { sized: 0, found: 0, parsed: 0, exact: 0, misread: 0, unsure: 0 }
    for (const { sheet, units } of SHEETS) {
      const g = loadPgm(`${FIXTURES}${sheet}.pgm`)
      if (!g) continue
      const t0 = performance.now()
      const trace: TextTrace = await readText(g, { cachePath: TESS })
      const ms = Math.round(performance.now() - t0)
      if (TEXT_OUT) {
        mkdirSync(TEXT_OUT, { recursive: true })
        writeFileSync(`${TEXT_OUT}${sheet}.json`, JSON.stringify(trace, null, 1))
      }
      const rooms = trace.items.filter((i) => i.kind === 'room')
      const base = {
        sheet: sheet.replace(/^assets__/, ''),
        glyphPx: trace.glyphPx ?? 0,
        rooms: rooms.length,
        sized: rooms.filter((i) => i.dims).length,
        'unsure (sheet)': trace.items.filter((i) => i.sizeUnread).length,
        'to AI (sheet)': reaskList(trace).length,
        ms,
      }
      if (!units.length) rows.push({ unit: '(no truth)', ...base })
      for (const u of units) {
        const s = scoreText(trace, u)
        tot.sized += s.dimsTotal
        tot.found += s.sizedFound
        tot.exact += s.dimsExact
        tot.misread += s.dimsMisread
        tot.parsed += s.dimsExact + s.dimsMisread
        tot.unsure += s.dimsUnsure
        rows.push({ unit: u.id, ...base, 'labels found': `${s.found}/${s.labels}`, 'sized found': `${s.sizedFound}/${s.dimsTotal}`, 'size right': s.dimsExact, misread: s.dimsMisread, unsure: s.dimsUnsure })
        misses.push(`${u.id}: missed ${s.missed.join(', ')}\n  wrong/none: ${s.wrongDims.join(' · ')}`)
      }
    }
    console.table(rows)
    console.log(`TOTAL sized labels ${tot.sized}: found ${tot.found}, size parsed ${tot.parsed}, right ${tot.exact}, MISREAD ${tot.misread}, unsure (flagged) ${tot.unsure}\n${misses.join('\n')}`)
  }, 3_600_000)
})
