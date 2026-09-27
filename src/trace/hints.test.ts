/// <reference types="node" />
import { describe, expect, test } from 'vitest'
import type { Unit } from '../core/types'
import { registerTruth } from './eval'
import { loadPgm, loadPpm, SHOTS, writePng } from './evalio'
import { estimatePxPerM, findHints, propagateByColour, type Rgba } from './hints'
import { traceWalls } from './walls'
import { formatHintScores, scoreHints, truthRooms, type HintScore } from './hintsEval'
import type { Gray, HintTrace, Px } from './types'

// ---------- synthetic rasters (k px per metre) ----------
const K = 50

function sheet(wM: number, hM: number): { g: Gray; rgb: Rgba } {
  const width = Math.round(wM * K), height = Math.round(hM * K)
  return { g: { width, height, data: new Uint8Array(width * height).fill(255) }, rgb: { width, height, data: new Uint8Array(width * height * 4).fill(255) } }
}
function put(s: { g: Gray; rgb: Rgba }, x: number, y: number, c: [number, number, number]) {
  if (x < 0 || y < 0 || x >= s.g.width || y >= s.g.height) return
  const i = y * s.g.width + x
  s.rgb.data.set(c, i * 4)
  s.g.data[i] = Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
}
/** thin line (metres), 1 px wide */
function line(s: { g: Gray; rgb: Rgba }, a: Px, b: Px, c: [number, number, number] = [90, 90, 90]) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * K * 2) + 1
  for (let i = 0; i <= n; i++) put(s, Math.round((a.x + ((b.x - a.x) * i) / n) * K), Math.round((a.y + ((b.y - a.y) * i) / n) * K), c)
}
const rect = (s: { g: Gray; rgb: Rgba }, x: number, y: number, w: number, h: number) => {
  line(s, { x, y }, { x: x + w, y }), line(s, { x: x + w, y }, { x: x + w, y: y + h }), line(s, { x: x + w, y: y + h }, { x, y: y + h }), line(s, { x, y: y + h }, { x, y })
}
function ellipse(s: { g: Gray; rgb: Rgba }, cx: number, cy: number, rx: number, ry: number) {
  const n = 96
  for (let i = 0; i < n; i++) {
    const t0 = (i / n) * 2 * Math.PI, t1 = ((i + 1) / n) * 2 * Math.PI
    line(s, { x: cx + rx * Math.cos(t0), y: cy + ry * Math.sin(t0) }, { x: cx + rx * Math.cos(t1), y: cy + ry * Math.sin(t1) })
  }
}
function fill(s: { g: Gray; rgb: Rgba }, x: number, y: number, w: number, h: number, c: [number, number, number]) {
  for (let py = Math.round(y * K); py < Math.round((y + h) * K); py++) for (let px = Math.round(x * K); px < Math.round((x + w) * K); px++) put(s, px, py, c)
}
/** a thick wall band (metres) */
const wall = (s: { g: Gray; rgb: Rgba }, x: number, y: number, w: number, h: number) => fill(s, x, y, w, h, [20, 20, 20])
const near = (p: Px, x: number, y: number, tolM: number) => Math.hypot(p.x / K - x, p.y / K - y) <= tolM

describe('findHints on drawn symbols', () => {
  test('a WC (oval bowl + cistern) → bath, a basin oval → bath', () => {
    const s = sheet(4, 3)
    wall(s, 0.2, 0.2, 3.6, 0.13)
    ellipse(s, 1, 0.9, 0.19, 0.27) // bowl, long axis vertical
    rect(s, 0.75, 0.38, 0.5, 0.17) // cistern across the bowl's top end
    ellipse(s, 2.5, 0.7, 0.25, 0.18) // basin
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    const bath = t.hints.filter((h) => h.kind === 'bath')
    expect(bath.map((h) => h.what).sort()).toEqual(['wc', 'wc/basin'])
    const wc = bath.find((h) => h.what === 'wc')!
    expect(wc.at.y / K).toBeGreaterThan(0.9) // moved off the cistern, into the room
    expect(t.hints.every((h) => h.kind === 'bath')).toBe(true)
  })

  test('a double bed (two pillows at the headboard) → bed on the mattress; a row of cushions is not a bed', () => {
    const s = sheet(6, 4)
    wall(s, 0.2, 0.2, 0.13, 3.5) // headboard wall, west
    rect(s, 0.4, 0.5, 2.0, 1.8) // bed
    rect(s, 0.5, 0.6, 0.35, 0.7), rect(s, 0.5, 1.5, 0.35, 0.7) // pillows, long axis along the headboard
    for (let i = 0; i < 3; i++) rect(s, 3.2 + i * 0.75, 3, 0.7, 0.4) // a sofa's three back cushions in a row
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    const beds = t.hints.filter((h) => h.kind === 'bed')
    expect(beds).toHaveLength(1)
    expect(beds[0].at.x / K).toBeGreaterThan(1.1) // pushed away from the headboard wall
    expect(near(beds[0].at, 1.45, 1.4, 0.6)).toBe(true)
  })

  test('a hob (two burners on a counter) → kitchen; two bedside lamps 2 m apart are not', () => {
    const s = sheet(5, 3)
    wall(s, 0.2, 0.2, 4.5, 0.13)
    rect(s, 0.4, 0.35, 0.8, 0.5)
    ellipse(s, 0.6, 0.6, 0.1, 0.1), ellipse(s, 1.0, 0.6, 0.1, 0.1)
    ellipse(s, 2.4, 2, 0.12, 0.12), ellipse(s, 4.4, 2, 0.12, 0.12) // lamps
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    const k = t.hints.filter((h) => h.kind === 'kitchen')
    expect(k).toHaveLength(1)
    expect(near(k[0].at, 0.8, 0.95, 0.5)).toBe(true)
    expect(t.hints).toHaveLength(1)
  })

  test('a dining table ringed by four chairs → dining', () => {
    const s = sheet(5, 4)
    rect(s, 1.5, 1.5, 1.6, 0.9)
    for (const [x, y] of [[1.7, 1.0], [2.5, 1.0], [1.7, 2.55], [2.5, 2.55]]) rect(s, x, y, 0.42, 0.4)
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    expect(t.hints.map((h) => h.kind)).toEqual(['dining'])
  })

  test('a green planter strip → balcony + green with its area; a pot plant and a pale tinted room are not', () => {
    const s = sheet(8, 6)
    fill(s, 0.5, 0.5, 4, 0.9, [120, 150, 70]) // planter strip 3.6 m²
    fill(s, 6, 1, 0.4, 0.4, [60, 110, 40]) // pot plant 0.16 m²
    fill(s, 1, 2.5, 5, 3, [208, 235, 202]) // pale green tint over a whole room (DMD Type B)
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    const green = t.hints.filter((h) => h.source === 'green')
    expect(green).toHaveLength(1)
    expect(green[0]).toMatchObject({ kind: 'balcony', green: true })
    expect(green[0].areaPx! / (K * K)).toBeCloseTo(3.6, 0)
    expect(near(green[0].at, 2.5, 0.95, 0.3)).toBe(true)
  })

  test('two colour fills cluster; propagateByColour spreads read labels to unread rooms of the same fill', () => {
    const s = sheet(12, 4)
    const grey: [number, number, number] = [202, 193, 185], blue: [number, number, number] = [205, 228, 240]
    const rooms: { poly: Px[]; kind?: string }[] = []
    for (let i = 0; i < 6; i++) {
      const x = 0.2 + i * 1.95
      fill(s, x, 0.3, 1.8, 3.4, i < 4 ? grey : blue)
      const k = [0, 1, 2].includes(i) ? 'bed' : i === 4 ? 'bath' : undefined
      rooms.push({ poly: [{ x: x * K, y: 0.3 * K }, { x: (x + 1.8) * K, y: 0.3 * K }, { x: (x + 1.8) * K, y: 3.7 * K }, { x: x * K, y: 3.7 * K }], kind: k })
    }
    rooms.push({ poly: [{ x: 0, y: 3.75 * K }, { x: 12 * K, y: 3.75 * K }, { x: 12 * K, y: 3.95 * K }, { x: 0, y: 3.95 * K }] }) // paper strip
    const t = findHints(s.g, s.rgb, { pxPerM: K })
    expect(t.clusters).toHaveLength(2)
    expect(new Set(t.fills!.map((f) => f.cluster)).size).toBe(2)
    const p = propagateByColour(s.rgb, t, rooms)
    expect(p[3]).toMatchObject({ kind: 'bed', source: 'colour' }) // grey: 3 of 3 labelled say bed
    expect(p[5]).toBeNull() // blue: only one labelled room — not enough
    expect(p[6]).toBeNull() // paper
    expect(p.slice(0, 3).every((h) => h === null)).toBe(true) // labelled rooms keep their label
  })
})

// ---------- the real plans (fixtures: node scripts/trace-fixtures.mjs --rgb E:/dev/tmp/wave16/hints/fixtures) ----------
const FIX = process.env.HINT_FIXTURES ?? 'E:/dev/tmp/wave16/hints/fixtures/'
const units = import.meta.glob<Unit>('../data/units/*.json', { eager: true, import: 'default' })
const stem = (u: Unit) => `${FIX}assets__${u.planImage!.src.split('/').pop()!.replace(/\.\w+$/, '')}`
const haveFixtures = Object.values(units).every((u) => loadPpm(stem(u) + '.ppm') !== null)

type RGB = [number, number, number]
const KIND_COL: Record<string, RGB> = { bath: [0, 90, 255], bed: [150, 0, 200], kitchen: [255, 120, 0], living: [200, 160, 0], dining: [200, 160, 0], balcony: [0, 150, 0] }

/** Faded plan; truth rooms outlined; hints as squares in their kind's colour, ringed green (right) / red (wrong) / grey (in no room). */
function overlay(path: string, rgb: Rgba, t: HintTrace, marks?: HintScore['marks'], rooms?: { poly: Px[] }[]) {
  const { width: W, height: H, data } = rgb
  const px = new Uint8Array(W * H * 3)
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) px[i * 3 + c] = 110 + (data[i * 4 + c] * 145) / 255
  const dot = (x: number, y: number, col: RGB) => {
    x = Math.round(x), y = Math.round(y)
    if (x >= 0 && y >= 0 && x < W && y < H) px.set(col, (y * W + x) * 3)
  }
  const r = Math.max(4, Math.round(Math.max(W, H) / 250))
  for (const room of rooms ?? [])
    room.poly.forEach((a, i) => {
      const b = room.poly[(i + 1) % room.poly.length], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y))
      for (let k = 0; k <= n; k++) dot(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, [0, 200, 200])
    })
  for (const f of t.fills ?? []) {
    const col = t.clusters![f.cluster].map((v) => Math.max(0, v - 60)) as RGB
    for (let d = -r; d <= r; d++) for (let e = -(r - Math.abs(d)); e <= r - Math.abs(d); e++) dot(f.at.x + d, f.at.y + e, col)
  }
  for (const h of t.hints) {
    const m = marks?.find((q) => q.at === h.at)
    const ring: RGB = !m ? [40, 40, 40] : m.ok === null ? [150, 150, 150] : m.ok ? [0, 220, 0] : [255, 0, 0]
    for (let d = -r - 2; d <= r + 2; d++) for (let e = -r - 2; e <= r + 2; e++) dot(h.at.x + d, h.at.y + e, Math.max(Math.abs(d), Math.abs(e)) > r ? ring : KIND_COL[h.kind ?? ''] ?? [0, 0, 0])
  }
  writePng(path, W, H, px)
}

describe.skipIf(!haveFixtures)('findHints vs the hand-traced units (eval report)', () => {
  test('hint precision + room coverage per unit; colour propagation (half the labels read)', () => {
    const rows: HintScore[] = [], rowsK: HintScore[] = []
    const prop: string[] = []
    const seen = new Map<string, { g: Gray; rgb: Rgba; t: HintTrace; tK: HintTrace; ms: number; k: number }>()
    for (const u of Object.values(units)) {
      const f = stem(u)
      let run = seen.get(f)
      if (!run) {
        const g = loadPgm(f + '.pgm')!, rgb = loadPpm(f + '.ppm')!
        const t0 = performance.now()
        const t = findHints(g, rgb) // scale estimated from the walls
        const ms = performance.now() - t0
        run = { g, rgb, t, tK: findHints(g, rgb, { pxPerM: u.planImage!.pxPerM }), ms, k: estimatePxPerM(traceWalls(g)) }
        seen.set(f, run)
      }
      const xf = registerTruth(run.g, u)
      const s = scoreHints(run.t.hints, u, xf)
      rows.push(s)
      rowsK.push(scoreHints(run.tK.hints, u, xf))
      const rooms = truthRooms(u, xf)
      // colour propagation: label every other room, predict the rest, then swap
      let made = 0, right = 0
      for (const half of [0, 1]) {
        const p = propagateByColour(run.rgb, run.t, rooms.map((r, i) => ({ poly: r.poly, kind: i % 2 === half ? r.kind : undefined })))
        p.forEach((h, i) => {
          if (!h) return
          made++
          if (h.kind === rooms[i].kind) right++
        })
      }
      prop.push(`${u.id.padEnd(22)} scale est ${run.k.toFixed(1)} vs true ${u.planImage!.pxPerM} px/m; colour propagation: ${right}/${made} right over ${rooms.length} rooms (${run.t.clusters?.length ?? 0} fill clusters, ${run.t.fills?.length ?? 0} fills) ${Math.round(run.ms)} ms`)
      if (s.wrong.length) prop.push(`   wrong: ${s.wrong.join('; ')}`)
      if (SHOTS) overlay(`${SHOTS}/eval-${u.id}.png`, run.rgb, run.t, s.marks, rooms)
      expect(run.ms, u.id).toBeLessThan(8000)
    }
    console.log(`\nscale estimated from the walls:\n${formatHintScores(rows)}\nscale known (the solver's pxPerM):\n${formatHintScores(rowsK)}\n${prop.join('\n')}\n`)
  }, 180000)

  test('smoke: Banani Level 2-6 and DMD Level 3-14 (no truth — judge the overlays)', () => {
    // scale read off the drawings by hand (Banani Bed-02 12'-4" ≈ 97 px, DMD Bed-2 ≈ 15' ≈ 83 px); the wall estimate is shown beside
    for (const [f, k] of [['Sheltech_Banani__Level_2-6', 26], ['Sheltech_dmd__Level_3-14', 18]] as const) {
      const g = loadPgm(FIX + f + '.pgm'), rgb = loadPpm(FIX + f + '.ppm')
      if (!g || !rgb) continue
      const t0 = performance.now()
      const t = findHints(g, rgb, { pxPerM: k })
      const by = t.hints.reduce<Record<string, number>>((m, h) => ((m[h.what ?? h.source] = (m[h.what ?? h.source] ?? 0) + 1), m), {})
      console.log(`${f} (k ${k}, wall estimate ${estimatePxPerM(traceWalls(g)).toFixed(1)}): ${t.hints.length} hints ${JSON.stringify(by)}; ${t.clusters?.length} fill clusters ${JSON.stringify(t.clusters)}; ${Math.round(performance.now() - t0)} ms`)
      console.log(`   ${t.hints.map((h) => `${h.what}@${Math.round(h.at.x)},${Math.round(h.at.y)}`).join(" ")}`)
      if (SHOTS) overlay(`${SHOTS}/smoke-${f}.png`, rgb, t)
    }
  }, 120000)
})
