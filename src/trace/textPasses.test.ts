/// <reference types="node" />
/**
 * The s26 reading passes (text.ts readText): text at several heights on one sheet, white print on dark ground, labels
 * printed sideways, and the gate that keeps a garbled read from naming a room. Pure parts always; the reads themselves
 * with node tesseract when its data is on this machine (E:/dev/tmp/wave19/reader/tess).
 */
import { existsSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { Gray } from './types'
import { boxBack, cleanForOcr, cropGray, darkGround, findTables, findTextLines, groupWords, nameOk, normaliseName, parseArea, readText, roomName, rotateCCW, rotateCW, splitNames, STRICT_DELTA, textHeights, uprightStrip, type OcrWord } from './text'

// ---------------------------------------------------------------- a 5 × 7 block font, enough for plan labels
const F: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110', C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110', E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001', I: '01110 00100 00100 00100 00100 00100 01110',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111', M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001', O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  R: '11110 10001 10001 11110 10100 10010 10001', S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100', W: '10001 10001 10001 10101 10101 10101 01010',
  X: '10001 10001 01010 00100 01010 10001 10001', Y: '10001 10001 01010 00100 00100 00100 00100', x: '00000 00000 10001 01010 00100 01010 10001',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110', 2: '01110 10001 00001 00010 00100 01000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000', 8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100', '-': '00000 00000 00000 11111 00000 00000 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
  '"': '01010 01010 10100 00000 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100', ' ': '00000 00000 00000 00000 00000 00000 00000',
}
/** `text` at `capPx` px letters, top-left (x, y), ink `ink` on whatever is there (box-filtered, so the edges are grey) */
function print(g: Gray, text: string, x: number, y: number, capPx: number, ink = 30): number {
  const s = capPx / 7
  let cx = x
  for (const ch of text) {
    const rows = F[ch].split(' ')
    for (let yy = 0; yy < Math.ceil(7 * s); yy++)
      for (let xx = 0; xx < Math.ceil(5 * s); xx++) {
        let sum = 0, n = 0
        for (let v = Math.floor(yy / s); v < Math.min(7, Math.ceil((yy + 1) / s)); v++)
          for (let u = Math.floor(xx / s); u < Math.min(5, Math.ceil((xx + 1) / s)); u++) (sum += +rows[v][u]), n++
        const px = Math.round(cx + xx), py = Math.round(y + yy)
        if (n && sum && px >= 0 && px < g.width && py >= 0 && py < g.height) {
          const i = py * g.width + px
          g.data[i] = Math.round(g.data[i] + (ink - g.data[i]) * (sum / n))
        }
      }
    cx += 6.2 * s
  }
  return cx
}
const paper = (w: number, h: number, v = 245): Gray => ({ width: w, height: h, data: new Uint8Array(w * h).fill(v) })
const fill = (g: Gray, x0: number, y0: number, w: number, h: number, v: number) => {
  for (let y = y0; y < y0 + h; y++) g.data.fill(v, y * g.width + x0, y * g.width + x0 + w)
}

describe('the gate: a garbled read never names a room (AUTOTRACE_100 §3 #5)', () => {
  test('plan words, a prefix and one number pass; a size glued on, two rooms in one, junk do not', () => {
    for (const ok of ['BED-3', 'BED-04/HOME OFFICE', 'DINING & F. LOUNGE', 'LIVING CUM DINING', 'M.BED', 'K. VER', 'BATH 1 1', 'S.TOI', 'AC OUT DOOR', 'WALK IN CLOSET', 'TOILET 03']) expect(nameOk(ok)).toBe(true)
    for (const bad of ['BATH 3 21050X 10 67', 'BED 1 VER 1 TD 1', 'ACO. | AOU | ACOU.', 'JER 3 TOILET 4| Y JO]', 'WDEAFECLED FOR ROAD ZEWE LIDE VER']) expect(nameOk(bad)).toBe(false)
    expect(roomName('BATH 3 21050X 10 67')).toBeNull()
    expect(roomName('BED-3')?.kind).toBe('bed')
  })
  test('a garbled line names nothing: it stays text, the room stays "Space N"', () => {
    const w = (text: string, x: number, y: number): OcrWord => ({ text, box: { x, y, w: 9 * text.length, h: 12 }, conf: 0.8 })
    const items = groupWords([w('BATH 3 21050X 10 67', 100, 100)])
    expect(items.map((it) => it.kind)).toEqual(['other'])
    // …and a garbled line stacked over a name never changes its kind (Assure Phera: "Bed) A a ASSAY," over LIVING)
    const two = groupWords([w('Bed) A a ASSAY,', 90, 100), w('LIVING', 100, 115)])
    expect(two.find((it) => it.kind === 'room')).toMatchObject({ roomKind: 'living' })
  })
  test('numbers in names are kept: BATH-01 → number 1, "BED D4" → BED 04, "TOILET O3" → TOILET 03', () => {
    expect(normaliseName('BATH-01')).toBe('BATH 01')
    expect(normaliseName('BED D4')).toBe('BED 04')
    expect(normaliseName('TOILET O3')).toBe('TOILET 03')
    expect(normaliseName('BATH-0I')).toBe('BATH 01')
  })
  test('a title\'s "SIZE 2152" read without its unit is the flat area in square feet; a room size is not', () => {
    expect(parseArea('SIZE £2152; KEY PI')! / 0.3048 ** 2).toBeCloseTo(2152, 0)
    expect(parseArea(`SIZE 12'-0" x 14'-0"`)).toBeNull()
    expect(parseArea('BED 2152')).toBeNull()
  })
  test('two labels read as one line split at the gap; stacked labels of three rooms stay three', () => {
    expect(splitNames('VER 3 TOILET 4')).toMatchObject({ a: 'VER 3', b: 'TOILET 4' })
    expect(splitNames('DINING & FAMILY LIVING')).toBeNull()
    const w = (text: string, x: number, y: number): OcrWord => ({ text, box: { x, y, w: 8 * text.length, h: 12 }, conf: 0.9 })
    const three = groupWords([w('BED 1', 100, 100), w('VER 1', 100, 115), w('TOILET 1', 92, 130)])
    expect(three.map((it) => it.text).sort()).toEqual(['BED 1', 'TOILET 1', 'VER 1'])
    const one = groupWords([w('DINING &', 100, 100), w('FAMILY LIVING', 80, 115)])
    expect(one).toHaveLength(1)
    expect(one[0]).toMatchObject({ kind: 'room', roomKind: 'dining' })
    expect(groupWords([w('MASTER', 100, 100), w('BED', 108, 115)])).toHaveLength(1)
    // a prefix word of another kind still joins (Finlay Nirvana's SERVANT over BED)
    expect(groupWords([w('SERVANT', 100, 100), w('BED', 112, 115)])).toMatchObject([{ kind: 'room', roomKind: 'maid' }])
  })
  test('a numbered legend read white on dark: a stray bracket, the dot lost, a row with no size still counts', () => {
    const w = (text: string, x: number, y: number, wd = 9 * text.length): OcrWord => ({ text, box: { x, y, w: wd, h: 11 }, conf: 0.8 })
    const items = groupWords([w('[06 CHILD BED', 600, 1220), w('07. CHILD VER.', 600, 1251), w('(08 CHILD BATH', 600, 1282), w("07'-06\" x 05™-00\"", 760, 1282), w('09 KITCHEN', 600, 1313)])
    const t = findTables(items)
    expect(t).toHaveLength(1)
    expect(t[0].rows.map((r) => r.num)).toEqual([6, 7, 8, 9])
  })
})

describe('the passes (pure)', () => {
  test('a box on a turned page turns back to where it was printed', () => {
    const g = paper(300, 200)
    fill(g, 40, 120, 30, 10, 0) // a mark at x 40–70, y 120–130
    for (const [turned, turn] of [[rotateCW(g), 'cw'], [rotateCCW(g), 'ccw']] as const) {
      expect(turned.width).toBe(200)
      // find the mark on the turned page
      let x0 = 1e9, y0 = 1e9, x1 = 0, y1 = 0
      for (let y = 0; y < turned.height; y++)
        for (let x = 0; x < turned.width; x++)
          if (!turned.data[y * turned.width + x]) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y))
      expect(boxBack({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, turn, 300, 200)).toEqual({ x: 40, y: 120, w: 30, h: 10 })
    }
  })
  test('s27 AI-prep: a rejected strip on a turned page comes out upright, at full size (uprightStrip)', () => {
    const g = paper(300, 200)
    fill(g, 40, 120, 30, 10, 0)
    fill(g, 40, 120, 5, 4, 128) // (a corner of another grey: the way up shows)
    const box = { x: 100, y: 20, w: 40, h: 90 } // a strip on the turned page
    for (const [turned, turn, angle] of [[rotateCCW(g), 'ccw', 90], [rotateCW(g), 'cw', -90]] as const)
      expect(uprightStrip(turned, { box, angle, reason: 'garbage' })).toEqual(cropGray(g, boxBack(box, turn, 300, 200)))
    expect(uprightStrip(g, { box: { x: 40, y: 120, w: 30, h: 10 }, angle: 0, reason: 'size-unread' })).toEqual(cropGray(g, { x: 40, y: 120, w: 30, h: 10 }))
  })
  test('text heights: room names at 9 px and a title figure at 45 px on one sheet are both found', () => {
    const g = paper(900, 300)
    for (let i = 0; i < 4; i++) print(g, ['BED 1', 'KITCHEN', 'TOILET 2', 'LIVING'][i], 30 + 200 * i, 40, 9)
    print(g, '2279 SFT', 60, 150, 45)
    const hs = textHeights(g)
    expect(hs.some((h) => Math.abs(h - 9) <= 1)).toBe(true)
    expect(hs.some((h) => Math.abs(h - 45) <= 4)).toBe(true)
    // the median glyph height alone (the reader before s26) keeps the names and drops the title's glyph runs
    const big = cleanForOcr(g, STRICT_DELTA, 1, { charH: hs.find((h) => h > 30)!, orphans: true })
    const lines = findTextLines(big.glyphs, big.charH, true)
    expect(lines.some((l) => l.box.y >= 140 && l.box.h >= 40 && l.box.w > 200)).toBe(true)
  })
  test('white print on dark ground comes back dark on white; a light page has none', () => {
    const g = paper(600, 300)
    fill(g, 300, 50, 280, 200, 40) // a dark legend box
    print(g, '01 LIVING', 320, 100, 12, 235)
    const d = darkGround(g)!
    expect(d).not.toBeNull()
    expect(d.data[60 * 600 + 100]).toBe(255) // the light page: white
    expect(d.data[200 * 600 + 500]).toBe(215) // the dark ground: light
    expect(Math.min(...Array.from({ length: 12 }, (_, k) => d.data[(103 + k) * 600 + 322]))).toBeLessThan(80) // the print: dark
    expect(darkGround(paper(600, 300))).toBeNull()
  })
  test('a name on floor tiles: the strict pass keeps its letters, the tile lines go', () => {
    const g = paper(400, 200, 235)
    for (let x = 0; x < 400; x += 40) fill(g, x, 0, 1, 200, 150) // tile lines, light grey
    for (let y = 0; y < 200; y += 40) fill(g, 0, y, 400, 1, 150)
    print(g, 'KITCHEN', 115, 62, 12, 20) // crosses the tile lines at x 120 and 160
    print(g, 'BED 3', 300, 150, 12, 20)
    const c = cleanForOcr(g, STRICT_DELTA, 1, { charH: 12, orphans: true })
    const lines = findTextLines(c.glyphs, 12, true)
    expect(lines.some((l) => l.box.x <= 117 && l.box.x + l.box.w >= 175 && l.box.y >= 58 && l.box.y + l.box.h <= 78)).toBe(true)
  })
})

const TESS = 'E:/dev/tmp/wave19/reader/tess/'
describe.skipIf(!existsSync(`${TESS}eng.traineddata`))('the passes read (node tesseract)', () => {
  const names = (t: Awaited<ReturnType<typeof readText>>) => t.items.filter((it) => it.kind === 'room').map((it) => normaliseName(it.text.split('\n')[0]))
  test('a 45 px title figure beside 9 px room names: both read', async () => {
    const g = paper(1000, 360)
    print(g, 'BED 1', 40, 40, 10)
    print(g, "11'-0\"x12'-6\"", 25, 56, 8)
    print(g, 'KITCHEN', 300, 40, 10)
    print(g, "8'-0\"x9'-6\"", 300, 56, 8)
    print(g, 'TOILET 2', 560, 40, 10)
    print(g, "5'-0\"x7'-0\"", 565, 56, 8)
    print(g, '2279 SFT', 200, 200, 45)
    const t = await readText(g, { cachePath: TESS })
    expect(names(t)).toEqual(expect.arrayContaining(['BED 1', 'KITCHEN', 'TOILET 2']))
    const area = t.items.find((it) => it.kind === 'area')
    // (the block font's 9 reads as a 3 now and then: the figure is read, within 10 sft)
    expect(Math.abs(area!.areaSqm! / 0.3048 ** 2 - 2279)).toBeLessThan(10)
  }, 120_000)
  test('labels printed sideways, both ways, are read, their boxes where they are printed', async () => {
    const g = paper(500, 500)
    print(g, 'KITCHEN', 40, 40, 11)
    // printed on a page turned each way, turned back: VERANDAH reads top-to-bottom at x 188…199, y 150…252 (the reader
    // before s26 read only bottom-to-top columns of single letters), STORE bottom-to-top at x 400…411, y 300…355
    const down = paper(500, 500), up = paper(500, 500)
    print(down, 'VERANDAH', 150, 300, 11)
    print(up, 'STORE', 145, 400, 11)
    const a = rotateCW(down), b = rotateCCW(up)
    for (let i = 0; i < g.data.length; i++) g.data[i] = Math.min(g.data[i], a.data[i], b.data[i])
    const t = await readText(g, { cachePath: TESS })
    const ver = t.items.find((it) => it.kind === 'room' && it.roomKind === 'balcony')!
    expect(ver.box.x).toBeGreaterThan(175)
    expect(ver.box.x + ver.box.w).toBeLessThan(215)
    expect(ver.box.y).toBeGreaterThan(130)
    expect(ver.box.y + ver.box.h).toBeLessThan(275)
    const store = t.items.find((it) => it.kind === 'room' && it.roomKind === 'utility')!
    expect(store.box.x).toBeGreaterThan(385)
    expect(store.box.y).toBeGreaterThan(280)
    expect(store.box.y + store.box.h).toBeLessThan(375)
    // s27 AI-prep: none prints a size — each one's size strip is kept, with the turn that reads it upright
    const kitchen = t.items.find((it) => it.kind === 'room' && it.roomKind === 'kitchen')!
    const strip = (b: typeof kitchen.box) => t.rejected?.find((r) => r.reason === 'size-unread' && r.box.x <= b.x && r.box.y <= b.y && r.box.x + r.box.w >= b.x + b.w && r.box.y + r.box.h >= b.y + b.h)
    expect([kitchen, ver, store].map((it) => strip(it.box)?.angle)).toEqual([0, -90, 90])
  }, 120_000)
  test('s27 AI-prep: a room word the name gate refuses is kept as a garbage strip, where it is printed', async () => {
    const g = paper(500, 160)
    print(g, 'BED 1 VER 2 4', 40, 60, 11)
    const t = await readText(g, { cachePath: TESS })
    expect(names(t)).toEqual([])
    const r = t.rejected?.find((x) => x.reason === 'garbage')
    expect(r?.angle).toBe(0)
    expect(r?.text).toMatch(/BED/)
    expect(r!.box.x).toBeLessThan(60)
    expect(r!.box.y).toBeGreaterThan(40)
    expect(r!.box.y + r!.box.h).toBeLessThan(90)
  }, 120_000)
  test('a big page with 6 px print: read at its own size', async () => {
    const g = paper(5000, 900)
    for (let x = 0; x < 5000; x += 400) fill(g, x, 0, 6, 900, 30) // walls
    print(g, 'MASTER BED', 4430, 420, 7)
    print(g, "14'-0\"x16'-6\"", 4426, 432, 6)
    print(g, 'KITCHEN', 200, 420, 7)
    const t = await readText(g, { cachePath: TESS })
    expect(names(t)).toEqual(expect.arrayContaining(['MASTER BED', 'KITCHEN']))
  }, 180_000)
  test('white print in a dark legend box is read', async () => {
    const g = paper(700, 300)
    print(g, 'KITCHEN', 40, 40, 11)
    fill(g, 300, 60, 380, 160, 40)
    print(g, '01. LIVING', 320, 100, 11, 235)
    print(g, '02. DINING', 320, 140, 11, 235)
    const t = await readText(g, { cachePath: TESS })
    const all = t.items.map((it) => normaliseName(it.text.split('\n')[0]))
    expect(all.some((n) => /LIVING/.test(n))).toBe(true)
    expect(all.some((n) => /DINING/.test(n))).toBe(true)
  }, 120_000)
})
