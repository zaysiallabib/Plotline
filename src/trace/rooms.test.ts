/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { pointInPolygon } from '../core'
import type { Unit } from '../core'
import { evalTrace, registerTruth } from './eval'
import { SHOTS, loadPgm, loadPpm, writePng } from './evalio'
import { calibrateScale, classifyProfile, darkMaxOf, deriveWallsFromRooms, fitRooms, type RectPx, type RoomFit, type Side } from './rooms'
import { addEdgeReports, centreRect, edgeReport, emptyEdgeReport, expectedClass, formatEdgeReport, oracleLabels, roomsOverlay, scoreRooms, truthRoomsPx } from './roomsEval'
import type { Gray, Px, TextItem, TextTrace } from './types'

// ---------- synthetic plans: 50 px/m, walls grey 70, thin lines grey 120, paper 255 ----------
const K = 50
const O = { x: 60, y: 60 }
const P = (x: number, y: number): Px => ({ x: O.x + x * K, y: O.y + y * K })

function sheet(wM: number, hM: number): Gray {
  const width = Math.round(wM * K + 2 * O.x), height = Math.round(hM * K + 2 * O.y)
  return { width, height, data: new Uint8Array(width * height).fill(255) }
}
/** axis-aligned wall a→b (metres, centre line), th metres thick, square ends */
function wall(g: Gray, a: [number, number], b: [number, number], th: number): void {
  const p = P(...a), q = P(...b), h = (th * K) / 2
  const r = a[1] === b[1] ? { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), y0: p.y - h, y1: p.y + h } : { x0: p.x - h, x1: p.x + h, y0: Math.min(p.y, q.y), y1: Math.max(p.y, q.y) }
  for (let y = Math.round(r.y0); y < Math.round(r.y1); y++) for (let x = Math.round(r.x0); x < Math.round(r.x1); x++) g.data[y * g.width + x] = 70
}
/** 1 px line, grey 120 */
function thin(g: Gray, a: [number, number], b: [number, number]): void {
  const p = P(...a), q = P(...b)
  const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y))
  for (let i = 0; i <= n; i++) g.data[Math.round(p.y + ((q.y - p.y) * i) / n) * g.width + Math.round(p.x + ((q.x - p.x) * i) / n)] = 120
}
/** quarter arc around c (metres), radius r m, angles a0 → a1 (radians, y down), 1 px grey 120 */
function arc(g: Gray, c: [number, number], r: number, a0: number, a1: number): void {
  const p = P(...c)
  for (let i = 0; i <= 400; i++) {
    const t = a0 + ((a1 - a0) * i) / 400
    g.data[Math.round(p.y + r * K * Math.sin(t)) * g.width + Math.round(p.x + r * K * Math.cos(t))] = 120
  }
}
const label = (name: string, cx: number, cy: number, aM?: number, bM?: number): TextItem => {
  const c = P(cx, cy)
  return { text: name, box: { x: c.x - 25, y: c.y - 8, w: 50, h: 16 }, kind: 'room', ...(aM ? { dims: { aM, bM: bM! } } : {}), conf: 0.9, source: 'ocr' }
}
const edge = (f: RoomFit, s: Side) => f.edges.find((e) => e.side === s)!
const m = (px: number, o: number) => (px - o) / K

/**
 * 8 × 5 m (centre lines), 0.25 m outer walls, 0.125 m partitions. A (living) 0–4 × 0–5; B (bed) 4–8 × 0–2.5 with a
 * window 5.5–7.0 m in its top wall (two thin lines inside the wall's thickness); C (study) 4–8 × 2.5–5. A | B: a
 * partition with a 0.9 m door (1.0–1.9 m) whose arc swings into A; A | C: nothing drawn (open plan).
 */
function flat(): { g: Gray; labels: TextItem[] } {
  const g = sheet(8, 5)
  wall(g, [-0.125, 0], [5.5, 0], 0.25)
  wall(g, [7.0, 0], [8.125, 0], 0.25)
  thin(g, [5.5, -0.06], [7.0, -0.06])
  thin(g, [5.5, 0.06], [7.0, 0.06])
  wall(g, [-0.125, 5], [8.125, 5], 0.25)
  wall(g, [0, 0], [0, 5], 0.25)
  wall(g, [8, 0], [8, 5], 0.25)
  wall(g, [4, 0], [4, 1.0], 0.125)
  wall(g, [4, 1.9], [4, 2.5625], 0.125)
  wall(g, [3.9375, 2.5], [8, 2.5], 0.125)
  arc(g, [3.9375, 1.0], 0.9, Math.PI / 2, Math.PI) // hinge on A's face at the top jamb, swinging into A
  const labels = [
    label('LIVING', 2, 2.5, 4 - 0.125 - 0.0625, 5 - 0.25),
    label('BED', 6, 1.25, 4 - 0.0625 - 0.125, 2.5 - 0.125 - 0.0625),
    label('STUDY', 6, 3.75, 4 - 0.0625 - 0.125, 2.5 - 0.0625 - 0.125),
  ]
  return { g, labels }
}

describe('rooms first on a synthetic flat', () => {
  const { g, labels } = flat()
  const fits = fitRooms(g, labels, { pxPerM: K })
  const by = (n: string) => fits.find((f) => f.label.text === n)!

  test('every sized label gets its drawn inner rectangle', () => {
    expect(fits.length).toBe(3)
    const A = by('LIVING').rect, B = by('BED').rect
    expect(Math.abs(A.x0 - P(0.125, 0).x)).toBeLessThanOrEqual(1)
    expect(Math.abs(A.y0 - P(0, 0.125).y)).toBeLessThanOrEqual(1)
    expect(Math.abs(A.y1 - P(0, 4.875).y)).toBeLessThanOrEqual(1)
    expect(Math.abs(B.x1 - P(7.875, 0).x)).toBeLessThanOrEqual(1)
    expect(Math.abs(B.y1 - P(0, 2.4375).y)).toBeLessThanOrEqual(1)
  })

  test('edges split into what is drawn: the door with its arc, the window, the open side', () => {
    const door = edge(by('LIVING'), 'right').stretches.find((s) => s.kind === 'door')!
    expect(door).toBeTruthy()
    expect(Math.abs(m(door.u0, O.y) - 1.0)).toBeLessThan(0.1)
    expect(Math.abs(m(door.u1, O.y) - 1.9)).toBeLessThan(0.1)
    const win = edge(by('BED'), 'top').stretches.find((s) => s.kind === 'window')!
    expect(win).toBeTruthy()
    expect(Math.abs(m(win.u0, O.x) - 5.5)).toBeLessThan(0.1)
    expect(Math.abs(m(win.u1, O.x) - 7.0)).toBeLessThan(0.1)
    // outer walls measured outward: 0.25 m
    const top = edge(by('LIVING'), 'top').stretches
    expect(top.map((s) => s.kind)).toEqual(['wall'])
    expect(Math.abs(top[0].thPx! / K - 0.25)).toBeLessThan(0.03)
    // the study's left side has nothing drawn: never a wall
    const left = edge(by('STUDY'), 'left').stretches
    expect(left.some((s) => s.kind === 'wall')).toBe(false)
    expect(left.filter((s) => s.kind === 'open').reduce((t, s) => t + s.u1 - s.u0, 0)).toBeGreaterThan(0.8 * (edge(by('STUDY'), 'left').u1 - edge(by('STUDY'), 'left').u0))
  })

  test('walls from rooms: one wall per boundary, door and window as its children, nothing on the open side', () => {
    const rw = deriveWallsFromRooms(fits, K)
    const vertAt = (xM: number) => rw.walls.filter((w) => Math.abs(w.a.x - w.b.x) < 0.5 && Math.abs(m(w.a.x, O.x) - xM) < 0.1)
    const horAt = (yM: number) => rw.walls.filter((w) => Math.abs(w.a.y - w.b.y) < 0.5 && Math.abs(m(w.a.y, O.y) - yM) < 0.1)
    // the A | B partition: one wall, 0–2.5 m, ~0.125 m thick (the gap between the rooms), with the door as its opening
    const part = vertAt(4)
    expect(part.length).toBe(1)
    const [y0, y1] = [m(Math.min(part[0].a.y, part[0].b.y), O.y), m(Math.max(part[0].a.y, part[0].b.y), O.y)]
    expect(Math.abs(y0 - 0)).toBeLessThan(0.06)
    expect(Math.abs(y1 - 2.5)).toBeLessThan(0.06)
    expect(Math.abs(part[0].thicknessPx / K - 0.125)).toBeLessThan(0.03)
    const iPart = rw.walls.indexOf(part[0])
    const doors = rw.openings.filter((o) => o.wall === iPart)
    expect(doors.map((o) => o.kind)).toEqual(['door'])
    // the top outer wall: ONE wall 0–8 m with the window
    const top = horAt(0)
    expect(top.length).toBe(1)
    expect(Math.abs(m(Math.min(top[0].a.x, top[0].b.x), O.x) - 0)).toBeLessThan(0.06)
    expect(Math.abs(m(Math.max(top[0].a.x, top[0].b.x), O.x) - 8)).toBeLessThan(0.06)
    expect(rw.openings.filter((o) => o.wall === rw.walls.indexOf(top[0])).map((o) => o.kind)).toEqual(['window'])
    // A | C: no wall below 2.6 m on x = 4, it is listed as open instead
    expect(part.every((w) => Math.max(m(w.a.y, O.y), m(w.b.y, O.y)) < 2.6)).toBe(true)
    expect(rw.unwalled.some((u) => u.kind === 'open' && Math.abs(m(u.a.x, O.x) - 4) < 0.15 && m(u.b.y, O.y) - m(u.a.y, O.y) > 1.5)).toBe(true)
    // corners meet exactly: the partition's top end lies on the top wall's centre line
    const pTop = part[0].a.y < part[0].b.y ? part[0].a : part[0].b
    expect(Math.abs(pTop.y - top[0].a.y)).toBeLessThan(1e-6)
  })

  test('scale from the rooms alone (no scale, no guess)', () => {
    const s = calibrateScale(g, labels)!
    expect(Math.abs(s.pxPerM / K - 1)).toBeLessThan(0.02)
  })
})

describe('classifyProfile', () => {
  const cx = { k: 50, darkMax: 115, tol: 2, minWall: 4, lineW: 2 }
  const prof = (f: (d: number) => number) => Array.from({ length: 30 }, (_, i) => f(i - 2))
  test('a dark band at the face is a wall of its drawn thickness', () => {
    expect(classifyProfile(prof((d) => (d >= 0 && d < 12 ? 70 : 250)), null, cx)).toEqual({ kind: 'wall', th: 12 })
  })
  test('two thin lines within a wall thickness are a window; one is a thin line; nothing is open', () => {
    expect(classifyProfile(prof((d) => (d === 0 || d === 6 ? 150 : 250)), null, cx).kind).toBe('window')
    expect(classifyProfile(prof((d) => (d === 1 ? 150 : 250)), null, cx).kind).toBe('thin')
    expect(classifyProfile(prof(() => 250), null, cx).kind).toBe('open')
  })
  test('a wall that starts away from the face is not claimed', () => {
    expect(classifyProfile(prof((d) => (d >= 8 && d < 20 ? 70 : 250)), null, cx).kind).toBe('unsure')
  })
  test('blue glass is a window, a blue floor fill is not', () => {
    const v = prof(() => 250)
    expect(classifyProfile(v, prof((d) => (d === 2 ? 1 : 0)), cx).kind).toBe('window')
    expect(classifyProfile(v, prof((d) => (d >= 0 ? 1 : 0)), cx).kind).not.toBe('window')
  })
})

// ---------- the real plans vs the hand-traced units (fixtures + cached OCR; skipped when absent) ----------
const FIXT = process.env.TRACE_FIXTURES ?? 'E:/dev/tmp/wave15/walls/fixtures/'
const TEXT = process.env.TRACE_TEXT ?? 'E:/dev/tmp/wave16/solver/text/'
const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
const sheetOf = (u: Unit) => u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')
const haveFixtures = Object.values(units).every((u) => existsSync(`${FIXT}assets__${sheetOf(u)}.pgm`) && existsSync(`${TEXT}${sheetOf(u)}.json`))
/** TRACE_RGB=<dir of trace-fixtures.mjs --rgb PPMs> (default the wave-16 ones): blue glass lines for windows; TRACE_RGB=none = grey only */
const RGBD = process.env.TRACE_RGB ?? 'E:/dev/tmp/wave16/hints/fixtures/'
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
/** ROOMS_ONLY=type-a,sheltech-b · ROOMS_PARTS=ocr,scale (default all) · ROOMS_FAIL=window,door (list those stretches the hand trace disagrees with) */
const ONLY = process.env.ROOMS_ONLY ?? ''
const part = (p: string) => !process.env.ROOMS_PARTS || process.env.ROOMS_PARTS.split(',').includes(p)
const FAIL = (process.env.ROOMS_FAIL ?? '').split(',').filter(Boolean)

/** overlays at 3×, tiled ≤ 700 source px so every tile can be looked at */
function shots(path: string, g: Gray, region: RectPx, o: Parameters<typeof roomsOverlay>[3]): void {
  if (!SHOTS) return
  const nx = Math.ceil((region.x1 - region.x0) / 700), ny = Math.ceil((region.y1 - region.y0) / 700)
  const tw = (region.x1 - region.x0) / nx, th = (region.y1 - region.y0) / ny
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const crop = { x0: Math.round(region.x0 + i * tw), y0: Math.round(region.y0 + j * th), x1: Math.round(region.x0 + (i + 1) * tw), y1: Math.round(region.y0 + (j + 1) * th) }
      const img = roomsOverlay(g, crop, 3, o)
      writePng(`${SHOTS}/${path}${nx * ny > 1 ? `-${j}${i}` : ''}.png`, img.w, img.h, img.rgb)
    }
}

describe.skipIf(!haveFixtures)('rooms first vs the hand-traced units (eval report)', () => {
  test('rooms matched (oracle labels, real OCR), scale from the rooms, edge classes, walls from rooms', () => {
    const rows: string[] = [], scaleRows: string[] = [], wallRows: string[] = [], edgeText: string[] = []
    const tot = { oracle: 0, oracleSized: 0, sized: 0, rooms: 0, ocr: 0, ocrFlat: 0, ocrSelf: 0 }
    const allEdges = emptyEdgeReport()
    for (const u of Object.values(units).filter((x) => !ONLY || ONLY.split(',').some((o) => x.id.includes(o)))) {
      const name = sheetOf(u)
      const g = loadPgm(`${FIXT}assets__${name}.pgm`)!
      const rgb = (RGBD !== 'none' && loadPpm(`${RGBD}assets__${name}.ppm`)) || undefined
      const k = u.planImage!.pxPerM
      const T = truthRoomsPx(u)
      const xf = registerTruth(g, u)
      const text: TextTrace = JSON.parse(readFileSync(`${TEXT}${name}.json`, 'utf8'))
      const inFlat = text.items.filter((i) => T.some((t) => pointInPolygon({ x: i.box.x + i.box.w / 2, y: i.box.y + i.box.h / 2 }, t.poly)))
      // oracle labels at the truth scale
      let t0 = performance.now()
      const oracle = oracleLabels(u)
      const fo = fitRooms(g, oracle, { pxPerM: k, rgb })
      const msO = performance.now() - t0
      const so = scoreRooms(u, fo.map(centreRect))
      const sized = T.filter((t) => t.r.printedSize).length
      const oSized = T.filter((t, i) => t.r.printedSize && so.per[i].iou >= 0.6).length
      // real OCR at the truth scale: the whole sheet's labels, and (the spike's B1j) only the labels inside the flat
      const fr = part('ocr') ? fitRooms(g, text.items, { pxPerM: k, rgb }) : []
      const sr = scoreRooms(u, fr.map(centreRect))
      const frF = part('ocr') ? fitRooms(g, inFlat, { pxPerM: k, rgb }) : []
      const srF = scoreRooms(u, frF.map(centreRect))
      // scale from the rooms alone (no scale, no guess): oracle labels, and the real OCR
      t0 = performance.now()
      const cO = part('scale') ? calibrateScale(g, oracle) : null
      const msC = performance.now() - t0
      const cR = part('scale') ? calibrateScale(g, text.items) : null
      // end to end without a scale: real OCR, scale from its own rooms
      const fe = cR && part('ocr') ? fitRooms(g, text.items, { pxPerM: cR.pxPerM, rgb }) : []
      const se = scoreRooms(u, fe.map(centreRect))
      tot.oracle += so.matched, tot.oracleSized += oSized, tot.sized += sized, tot.rooms += T.length, tot.ocr += sr.matched, tot.ocrFlat += srF.matched, tot.ocrSelf += se.matched
      rows.push(`${u.id.padEnd(11)} | ${String(so.matched).padStart(2)}/${T.length} (sized ${oSized}/${sized}) mIoU ${so.meanIoU.toFixed(2)} | ${String(sr.matched).padStart(2)} | ${String(srF.matched).padStart(2)} | ${String(se.matched).padStart(2)} | fits ${fo.length}/${fr.length} | ${Math.round(msO)} ms`)
      const sc = (c: ReturnType<typeof calibrateScale>) => (c ? `${c.pxPerM.toFixed(2)} (${c.pxPerM / k - 1 >= 0 ? '+' : ''}${pct(c.pxPerM / k - 1)}, ${c.rooms} rooms, spread ${pct(c.spread)}, bracket ${c.bracket.map((b) => b.toFixed(0)).join('–')})` : 'none (< 3 sized labels)')
      scaleRows.push(`${u.id.padEnd(11)} truth ${k.toFixed(2)} | oracle labels ${sc(cO)} ${Math.round(msC)} ms | real OCR ${sc(cR)}`)
      // edge classes on the oracle fits that matched (the classifier given a right rectangle)
      const okIdx = new Set(so.per.filter((p) => p.iou >= 0.6).map((p) => p.d))
      const er = edgeReport(g, u, xf, fo.filter((_, i) => okIdx.has(i)), darkMaxOf(g))
      addEdgeReports(allEdges, er)
      edgeText.push(`-- ${u.id} (edges of the ${okIdx.size} matched oracle rooms)\n${formatEdgeReport(er)}`)
      for (const d of er.details.filter((x) => FAIL.includes(x.kind) && expectedClass(x.truth) !== x.kind && x.truth !== 'none' && x.lenM >= 0.1))
        edgeText.push(`   ✗ ${d.kind} on ${d.truth}: ${d.room} ${d.side} ${d.lenM.toFixed(2)} m  (${Math.round(d.a.x)},${Math.round(d.a.y)})→(${Math.round(d.b.x)},${Math.round(d.b.y)})`)
      // walls from the oracle rooms vs the hand-traced walls (eval.ts, centre lines within 0.15 m)
      const rw = deriveWallsFromRooms(fo, k)
      const ev = evalTrace({ walls: rw.walls, openings: rw.openings }, u, {}, xf)
      const kinds = rw.openings.reduce<Record<string, number>>((a, o) => ((a[o.kind] = (a[o.kind] ?? 0) + 1), a), {})
      const unw = rw.unwalled.reduce<Record<string, number>>((a, o) => ((a[o.kind] = (a[o.kind] ?? 0) + Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) / k), a), {})
      wallRows.push(`${u.id.padEnd(11)} walls ${rw.walls.length} (truth ${u.walls.length}) | precision ${pct(ev.precision)} recall ${pct(ev.recall)} (loose ${pct(ev.precisionLoose)} / ${pct(ev.recallLoose)}) | thickness err ${ev.thicknessErrM.toFixed(3)} m bias ${ev.thicknessBiasM.toFixed(3)} | openings ${JSON.stringify(kinds)} recall ${pct(ev.openingRecall)} precision ${pct(ev.openingPrecision)} kind ${pct(ev.openingKindAcc)} | unwalled m ${Object.entries(unw).map(([a, b]) => `${a} ${b.toFixed(1)}`).join(', ')}`)
      // overlays
      const bx = T.flatMap((t) => [t.box[0], t.box[2]]), by = T.flatMap((t) => [t.box[1], t.box[3]])
      const region = { x0: Math.max(0, Math.floor(Math.min(...bx) - k)), y0: Math.max(0, Math.floor(Math.min(...by) - k)), x1: Math.min(g.width, Math.ceil(Math.max(...bx) + k)), y1: Math.min(g.height, Math.ceil(Math.max(...by) + k)) }
      const okO = fo.map((_, i) => okIdx.has(i))
      const okR = new Set(sr.per.filter((p) => p.iou >= 0.6).map((p) => p.d))
      shots(`oracle-${u.id}`, g, region, { fits: fo, ok: okO, truth: T.map((t) => t.poly) })
      shots(`ocr-${u.id}`, g, region, { fits: fr, ok: fr.map((_, i) => okR.has(i)), truth: T.map((t) => t.poly) })
      shots(`walls-${u.id}`, g, region, { walls: rw, truth: T.map((t) => t.poly) })
    }
    console.log(
      [
        `\nROOMS MATCHED (IoU ≥ 0.6, scoreSolve rule)  unit | oracle labels @ truth scale | OCR sheet | OCR flat-only | OCR @ own scale | fits | ms`,
        ...rows,
        `TOTAL oracle ${tot.oracle}/${tot.rooms} (sized ${tot.oracleSized}/${tot.sized}) · OCR sheet ${tot.ocr} · OCR flat-only ${tot.ocrFlat} · OCR @ own scale ${tot.ocrSelf}`,
        `\nSCALE FROM ROOMS (no scale, no guess)`,
        ...scaleRows,
        `\nEDGE CLASSES`,
        ...edgeText,
        `-- ALL\n${formatEdgeReport(allEdges)}`,
        `\nWALLS FROM ROOMS (oracle fits)`,
        ...wallRows,
      ].join('\n'),
    )
    expect(tot.oracle).toBeGreaterThan(0)
  }, 900000)
})
