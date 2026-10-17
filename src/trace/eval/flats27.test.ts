/// <reference types="node" />
// s27 flats harness (NOT committed): FLATS27=<sheets.json> [FLATS27_KEYS=a,b] npx vitest run src/trace/eval/flats27.test.ts
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { deriveFlats, deriveRooms, parseLength, pointInPolygon, roomPolygon } from '../../core'
import { initialState } from '../../studio/model'
import { studioReducer } from '../../studio/review'
import { loadPgm, loadPpm, writeUnitOverlay } from '../evalio'
import { normalPolarity } from '../raster'
import { floorParts, pick, pickFloor, prepare, previewFlat } from '../solve'
import { readText } from '../text'
import type { Gray, TextTrace } from '../types'

const env = process.env
const FIX = env.FLATS27_FIX ?? 'E:/dev/tmp/s27/flats/fixtures/'
const OUT = env.FLATS27_OUT ?? 'E:/dev/tmp/s27/flats/out/'
const TEXT = 'E:/dev/tmp/s27/flats/text/'
const TESS = 'E:/dev/tmp/wave19/reader/tess/'
const TEXT_SOURCES = ['../text.ts', '../sizes.ts'].map((f) => readFileSync(new URL(f, import.meta.url)))

async function textOf(key: string, gray: Gray): Promise<TextTrace> {
  const page = normalPolarity(gray)
  const h = createHash('sha1')
  for (const s of TEXT_SOURCES) h.update(s)
  h.update(page.data)
  const path = `${TEXT}${key}-${h.digest('hex').slice(0, 12)}.json`
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'))
  const text = await readText(page, { cachePath: TESS })
  mkdirSync(TEXT, { recursive: true })
  writeFileSync(path, JSON.stringify(text))
  return text
}

type S = { file: string; w: number; h: number; scale: { a: number[]; b: number[]; len: string }; flats?: { name: string; at: number[] }[]; floor?: boolean }

describe.skipIf(!env.FLATS27)('s27 flats', () => {
  test('flats', async () => {
    const sheets: Record<string, S> = JSON.parse(readFileSync(env.FLATS27!, 'utf8'))
    const keys = env.FLATS27_KEYS ? env.FLATS27_KEYS.split(',') : Object.keys(sheets)
    mkdirSync(OUT, { recursive: true })
    for (const key of keys) {
      const Sh = sheets[key]
      const gray = loadPgm(`${FIX}${key}.pgm`)
      if (!gray) { console.log(`${key}: no fixture`); continue }
      const rgb = loadPpm(`${FIX}${key}.ppm`) ?? undefined
      const text = await textOf(key, gray)
      const [a, b] = [Sh.scale.a, Sh.scale.b]
      const pxPerM = Math.hypot(b[0] - a[0], b[1] - a[1]) / parseLength(Sh.scale.len)!
      const t0 = performance.now()
      const prep = await prepare(gray, { pxPerM, rgb, text, ocr: { cachePath: TESS } })
      const tPrep = performance.now() - t0
      const lines: string[] = [`===== ${key} (prepare ${(tPrep / 1000).toFixed(0)} s)`]
      lines.push('  stamps/labels: ' + prep.traces.text.items.filter((it) => it.kind === 'area' || /\b(UNIT|TYPE|FLAT|APARTMENT)\b/i.test(it.text)).map((it) => `${it.kind}:${JSON.stringify(it.text.replace(/\n/g, ' '))}@${Math.round(it.box.x + it.box.w / 2)},${Math.round(it.box.y + it.box.h / 2)}`).join(' | '))
      const tp = prep.traces, st = tp.stampsAt(tp.pxPerM)
      for (const [i, q] of floorParts(tp).entries()) lines.push(`  part ${i}: at ${q.at ? `${Math.round(q.at.x * tp.pxPerM)},${Math.round(q.at.y * tp.pxPerM)}` : '-'} fits ${q.fits.length} rooms ${q.rooms.size} holds stamps [${st.map((p) => (q.has(p) ? 1 : 0)).join('')}]`)
      if (env.FLATS27_DEBUG) lines.push('    stamps out: ' + st.map((q) => (tp.inOutside(q) ? 1 : 0)).join(''))
      if (env.FLATS27_DEBUG) for (const it of tp.text.items.filter((x) => x.kind === 'room')) {
        const q = { x: (it.box.x + it.box.w / 2) / tp.pxPerM, y: (it.box.y + it.box.h / 2) / tp.pxPerM }
        const f = tp.draft.rooms.filter((r) => pointInPolygon(q, roomPolygon(r, tp.draft.unit))).sort((a, b) => a.areaSqm - b.areaSqm)[0]
        lines.push(`    name ${JSON.stringify(it.text.split('\n')[0])}: face ${f ? f.areaSqm.toFixed(1) : '-'} out ${tp.inOutside(q) ? 1 : 0} parts [${floorParts(tp).map((p) => (p.has(q) ? 1 : 0) + (f && p.rooms.has(f) ? 'r' : '')).join(',')}]`)
      }
      const runs: { name: string; at?: { x: number; y: number } }[] = [...(Sh.floor === false ? [] : [{ name: 'floor' }]), ...(Sh.flats ?? []).map((f) => ({ name: f.name, at: { x: f.at[0], y: f.at[1] } }))]
      for (const r of runs) {
        const t1 = performance.now()
        const res = r.at ? pick(prep, r.at) : pickFloor(prep)
        const st = studioReducer(initialState(), { type: 'auto-trace', result: res })
        const u = st.unit
        const rooms = deriveRooms(u)
        const flats = deriveFlats(u, rooms)
        const pv = r.at ? previewFlat(prep.traces, r.at) : null
        const pvA = pv && 'region' in pv ? (pv as { region: { w: number; h: number }[] }).region.reduce((t, q) => t + q.w * q.h, 0) / (prep.traces.pxPerM * prep.traces.pxPerM) : 0
        lines.push(`  ${r.name}: ${res.stats.walls} walls, ${res.stats.rooms} rooms, ${res.stats.labelled} labelled; flats ${JSON.stringify(res.stats.flats?.map((f) => f.name + (f.wantSqm ? `~${Math.round(f.wantSqm / 0.0929)}` : '')))}; ${((performance.now() - t1) / 1000).toFixed(1)} s${pv ? `; preview ${pv.polys.length} faces, region ${pvA.toFixed(0)} m²` : ''}`)
        for (const f of flats) lines.push(`     ${f.name}: ${rooms.filter((x) => f.roomIds.includes(x.id)).map((x) => x.name).sort().join(', ')}`)
        const printedBy = new Map<string, string[]>()
        for (const p of res.stats.printed ?? []) printedBy.set(p.flat ?? '-', [...(printedBy.get(p.flat ?? '-') ?? []), p.name])
        for (const [f, ns] of printedBy) lines.push(`     printed on ${f}: ${ns.join(', ')}`)
        const png = `${OUT}${key}-${r.name}.png`
        writeFileSync(png.replace(/\.png$/, '.unit.json'), JSON.stringify(u))
        writeUnitOverlay(png, gray, u, st.review?.items ?? [])
      }
      console.log(lines.join('\n'))
      writeFileSync(`${OUT}${key}.txt`, lines.join('\n') + '\n')
    }
    expect(1).toBe(1)
  }, 6 * 3600_000)
})
