/// <reference types="node" />
/**
 * `npm run score30` — the 30-sheet scorer (Docs/AUTOTRACE_SCORER.md). Per sheet, what the Studio does: the fixture decoded as
 * rastersOf does (scripts/trace-fixtures.mjs --rgb --sheets), the S tool's scale, `prepare` → Whole floor (`pickFloor`) or one
 * `pick` per flat click, the result imported as the Studio imports it (studioReducer 'auto-trace': walls joined, names standing
 * in unnamed rooms name them), then scored against the printed rooms (score30.ts). The text reading is cached per sheet
 * (keyed by the text-stage sources + the page it reads); everything after it runs every time.
 * Env: SCORE30_SHEETS=key,key (a subset) · SCORE30_FRESH=1 (read the text again) · SCORE30_FIXTURES / SCORE30_OUT / SCORE30_TEXT /
 * SCORE30_TESS (folders; defaults below) · the Firefox agreement check: SCORE30_PXPERM=<n> (one sheet: the scale the browser's
 * clicks gave) and SCORE30_BROWSER=<dir> (the harness's exported units, <key>-floor.unit.json / <key>-<flat>.unit.json, scored
 * the same way beside the node row). Plain `npm test` skips the run (only the rule checks at the bottom run).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { parseLength } from '../../core'
import type { Unit } from '../../core'
import { initialState } from '../../studio/model'
import { studioReducer } from '../../studio/review'
import { loadPgm, loadPpm, writeUnitOverlay } from '../evalio'
import { normalPolarity } from '../raster'
import { pick, pickFloor, prepare } from '../solve'
import { classifyRoom, readText } from '../text'
import type { Gray, TextTrace } from '../types'
import SHEETS from './sheets30.json'
import { formatTable, nameRight, rowOf, scoreUnit, type Row, type Sheet, type SheetScore } from './score30'

const env = process.env
const RUN = env.npm_lifecycle_event === 'score30' || !!env.SCORE30
const FIX = env.SCORE30_FIXTURES ?? 'E:/dev/tmp/s26/fixtures/'
const OUT = env.SCORE30_OUT ?? 'E:/dev/tmp/s26/out/'
const TEXT = env.SCORE30_TEXT ?? 'E:/dev/tmp/s26/text/'
const TESS = env.SCORE30_TESS ?? 'E:/dev/tmp/wave19/reader/tess/'

/** what the text stage is made of: a change to any of these reads every sheet again */
const TEXT_SOURCES = ['../text.ts', '../sizes.ts'].map((f) => readFileSync(new URL(f, import.meta.url)))
const TESS_VERSION = RUN ? JSON.parse(readFileSync('node_modules/tesseract.js/package.json', 'utf8')).version : ''

/** = solve.ts prepare's read (normalPolarity, then readText), cached on disk */
async function textOf(key: string, gray: Gray): Promise<{ text: TextTrace; cached: boolean }> {
  const page = normalPolarity(gray)
  const h = createHash('sha1')
  for (const s of TEXT_SOURCES) h.update(s)
  h.update(TESS_VERSION).update(page.data)
  const path = `${TEXT}${key}-${h.digest('hex').slice(0, 12)}.json`
  if (!env.SCORE30_FRESH && existsSync(path)) return { text: JSON.parse(readFileSync(path, 'utf8')), cached: true }
  const text = await readText(page, { cachePath: TESS })
  mkdirSync(TEXT, { recursive: true })
  writeFileSync(path, JSON.stringify(text))
  return { text, cached: false }
}

/** the Studio's import of a trace result: the unit he then sees */
const imported = (result: Awaited<ReturnType<typeof pickFloor>>) => studioReducer(initialState(), { type: 'auto-trace', result })

describe.skipIf(!RUN)('score30: the 30 sheets', () => {
  test('closed and named right', async () => {
    const sheets = SHEETS as unknown as Record<string, Sheet>
    const keys = Object.keys(sheets).filter((k) => !env.SCORE30_SHEETS || env.SCORE30_SHEETS.split(',').includes(k))
    mkdirSync(OUT, { recursive: true })
    const rows: Row[] = []
    const t00 = performance.now()
    for (const key of keys) {
      const S = sheets[key]
      const gray = loadPgm(`${FIX}${key}.pgm`)
      if (!gray) {
        console.log(`${key}: no fixture in ${FIX} (node scripts/trace-fixtures.mjs --rgb --sheets src/trace/eval/sheets30.json)`)
        continue
      }
      const rgb = loadPpm(`${FIX}${key}.ppm`) ?? undefined
      const t0 = performance.now()
      const { text, cached } = await textOf(key, gray)
      const tText = performance.now()
      const [a, b] = [S.scale.a, S.scale.b]
      const pxPerM = Number(env.SCORE30_PXPERM) || Math.hypot(b[0] - a[0], b[1] - a[1]) / parseLength(S.scale.len)!
      const prep = await prepare(gray, { pxPerM, rgb, text, ocr: { cachePath: TESS } })
      const picks =
        S.floor === false
          ? (S.flats ?? []).map((f, i) => ({ name: f.name, i, result: pick(prep, { x: f.at[0], y: f.at[1] }) }))
          : [{ name: 'floor', i: 0, result: pickFloor(prep) }]
      const score: SheetScore = { rooms: [], falseRooms: [], pillarsInRooms: [] }
      const traced: { name: string; walls: number; rooms: number; labelled: number; review: number }[] = []
      for (const p of picks) {
        const st = imported(p.result)
        const unit: Unit = st.unit
        const mine = S.expected.filter((e) => (S.floor === false ? e.flat === p.name || (!e.flat && p.i === 0) : true))
        const s = scoreUnit(unit, p.result.stats, mine)
        score.rooms.push(...s.rooms)
        score.falseRooms.push(...s.falseRooms)
        score.pillarsInRooms.push(...s.pillarsInRooms)
        const { walls, rooms, labelled } = p.result.stats
        traced.push({ name: p.name, walls, rooms, labelled, review: st.review?.items.length ?? 0 })
        const bf = env.SCORE30_BROWSER && `${env.SCORE30_BROWSER}/${key}-${p.name}.unit.json`
        if (bf && existsSync(bf)) {
          const bu: Unit = JSON.parse(readFileSync(bf, 'utf8'))
          const bs = scoreUnit(bu, {}, mine), r = rowOf(bs)
          const diff = s.rooms.flatMap((x, j) => (x.state !== bs.rooms[j].state ? [`${x.name}: node ${x.state} (${x.got ?? '-'}), browser ${bs.rooms[j].state} (${bs.rooms[j].got ?? '-'})`] : []))
          const same = diff.length ? `\n  differs: ${diff.join(' · ')}` : ' — same states as node'
          console.log(`${key} ${p.name} BROWSER (${bu.planImage?.pxPerM.toFixed(3)} px/m, ${bu.walls.length} walls): ${r.right} of ${r.printed} right (core ${r.coreRight}/${r.core}), ${r.wrong} wrong, ${r.unnamed} unnamed, ${r.merged} merged, ${r.open} open; ${r.falseRooms} false rooms${same}`)
        }
        const png = `${OUT}${key}${picks.length > 1 ? `-${p.name.replace(/\W+/g, '_')}` : ''}.png`
        // the draft as imported, for a later look (load it in the Studio with Import)
        writeFileSync(png.replace(/\.png$/, '.unit.json'), JSON.stringify(unit))
        writeUnitOverlay(png, gray, unit, st.review?.items ?? [], undefined, s.rooms.map((r) => ({ at: { x: r.at[0], y: r.at[1] }, ok: r.state === 'right' })))
      }
      const sec = (performance.now() - t0) / 1000
      const row: Row = { sheet: key, ...rowOf(score), s: sec }
      rows.push(row)
      writeFileSync(
        `${OUT}${key}.json`,
        JSON.stringify({ key, style: S.style, pxPerM, s: sec, textS: (tText - t0) / 1000, textCached: cached, traced, row, ...score }, null, 1),
      )
      console.log(`${key}: ${row.right} of ${row.printed} right (core ${row.coreRight}/${row.core}), ${row.wrong} wrong, ${row.unnamed} unnamed, ${row.merged} merged, ${row.open} open; ${row.falseRooms} false rooms, ${row.pillars} pillars in rooms; ${sec.toFixed(0)} s (text ${cached ? 'cached' : `read ${((tText - t0) / 1000).toFixed(0)} s`})`)
    }
    const unknown = keys.flatMap((k) => (sheets[k]?.expected ?? []).filter((e) => !classifyRoom(e.name)).map((e) => `${k}: ${e.name}`))
    const table = `${formatTable(rows)}\nrun: ${((performance.now() - t00) / 60000).toFixed(1)} min for ${rows.length} sheets${unknown.length ? `\nprinted names the tracer has no kind for (never "right"): ${unknown.join(' · ')}` : ''}`
    console.log(`\n${table}`)
    if (!env.SCORE30_SHEETS) writeFileSync(`${OUT}score30.txt`, table + '\n')
    writeFileSync(`${OUT}score30${env.SCORE30_SHEETS ? '-part' : ''}.json`, JSON.stringify(rows, null, 1))
    expect(rows.length).toBeGreaterThan(0)
  }, 6 * 3600_000)
})

// ── the scoring rules (run with every npm test) ───────────────────────────────────────────────────────────────────────
describe('score30 rules', () => {
  test('a name is right by kind and number', () => {
    expect(nameRight('SUITE-2', { name: 'Bed 2', kind: 'bed' })).toBe(true)
    expect(nameRight('BED-2', { name: 'Suite 2', kind: 'bed' })).toBe(true)
    expect(nameRight('BED-2', { name: 'Bed 1', kind: 'bed' })).toBe(false)
    expect(nameRight('BED-2', { name: 'Bed', kind: 'bed' })).toBe(false)
    expect(nameRight('M.BED', { name: 'Master Bed', kind: 'bed' })).toBe(true)
    expect(nameRight('BED-4/STUDY', { name: 'Bed 4', kind: 'bed' })).toBe(true)
    expect(nameRight('VER 02', { name: 'Ver 2', kind: 'balcony' })).toBe(true)
    expect(nameRight('KITCHEN', { name: 'Bath 3', kind: 'bath' })).toBe(false)
    expect(nameRight('STAIR/ LIFT LOBBY', { name: 'Lobby', kind: 'other' })).toBe(true)
    expect(nameRight('LOBBY', { name: 'Stair', kind: 'other' })).toBe(false)
  })
  test('right, merged, unnamed, open, false rooms, pillars in rooms', () => {
    // a 6 × 3 m box split at x 2 and x 4: left room "Bed 1", middle unnamed, right "Kitchen"; a pillar in the middle room, one on a wall
    const v = (id: string, x: number, y: number) => ({ id, x, y })
    const w = (id: string, a: string, b: string) => ({ id, a, b, thicknessM: 0.1, heightM: 3, openings: [] })
    const unit = {
      id: 'u', projectName: '', name: '', northDeg: 0, furniture: [], finishSlots: [], areaSqft: 0,
      vertices: [v('a', 0, 0), v('b', 2, 0), v('c', 4, 0), v('d', 6, 0), v('e', 6, 3), v('f', 4, 3), v('g', 2, 3), v('h', 0, 3)],
      walls: [w('1', 'a', 'b'), w('2', 'b', 'c'), w('3', 'c', 'd'), w('4', 'd', 'e'), w('5', 'e', 'f'), w('6', 'f', 'g'), w('7', 'g', 'h'), w('8', 'h', 'a'), w('9', 'b', 'g'), w('10', 'c', 'f')],
      roomLabels: [
        { id: 'L', x: 1, y: 1.5, name: 'Bed 1', kind: 'bed' as const },
        { id: 'K', x: 5, y: 1.5, name: 'Kitchen', kind: 'kitchen' as const },
      ],
      pillars: [{ id: 'p', x: 3, y: 1.5, wM: 0.3, hM: 0.3 }, { id: 'q', x: 4, y: 0.2, wM: 0.3, hM: 0.3 }],
      planImage: { src: '', pxPerM: 100, originPx: { x: 0, y: 0 } },
    } as Unit
    const s = scoreUnit(unit, { printed: [{ name: 'Bed 1', at: { x: 1, y: 1.4 }, kind: 'bed' }] }, [
      { name: 'BED-1', at: [100, 150] },
      { name: 'DRESS', at: [150, 250] },
      { name: 'TOILET', at: [300, 150] },
      { name: 'VER', at: [800, 150] },
    ])
    expect(s.rooms.map((r) => r.state)).toEqual(['right', 'merged', 'unnamed', 'open'])
    expect(s.rooms.map((r) => r.read)).toEqual([true, false, false, false])
    expect(s.falseRooms.map((r) => r.name)).toEqual(['Kitchen'])
    expect(s.pillarsInRooms).toEqual([{ x: 300, y: 150 }])
    expect(rowOf(s)).toMatchObject({ printed: 4, right: 1, merged: 1, unnamed: 1, open: 1, falseRooms: 1, pillars: 1, read: 1 })
  })
})
