/// <reference types="node" />
/**
 * Sheltech Level 2, Type A, auto-traced the way the Studio does it with the founder's scale (26.864 px/m — HANDOFF session
 * 22 task 3): what the SHEET shows, pinned against the drawing itself, not the hand trace.
 * - West of the Dining there are TWO 5" walls 8 px (0.31 m) apart: the stair core's east wall (sheet px x ≈ 624.7,
 *   y 344–430) and Bed 4's west wall (px x ≈ 632.9, y 465–607), Toilet 2's door between them. The session-22 reading
 *   ("one 10" wall traced on its two faces") was wrong; the hand-traced sheltech-a draws ONE wall at x 5.144 m (px ≈ 629.3),
 *   on the paper between the two.
 * - The kitchen's south block is one wall ≈ 0.34 m thick on its ink. The face runs into the door recess east of the
 *   block: its whole outline reads 8'-5" × 13'-0", its main rectangle 6'-5" × 12'-3", against a printed 8'-5" × 12'-2" —
 *   neither measure matches.
 * - Every long full-height axis wall sits on its own drawn band (a wall on a face line would be off by half its width).
 * - The sheet's printed sizes (the hand-traced labels carry them) against the draft's rooms, a room passing when its
 *   main rectangle OR its whole outline matches (founder 2026-10-09): 6 of the 12 closed ones differ by more than 2"
 *   (8 with the outline alone); Level 1 closes two more (Bed 4, Veranda 4), both 4–6" off — 8 of 14. See the table the
 *   test prints and the causes listed at the count. A tracer change should move that number down, never up.
 */
import { describe, expect, test } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { deriveRooms, outlineBox, pointInPolygon, printedSizeCheck, roomInnerPolygon, roomPolygon } from '../core'
import type { Unit } from '../core'
import truthJson from '../data/units/sheltech-a.json'
import { parsePrintedSize, sheetAxis } from '../studio/review'
import { FIXTURES, loadPgm, loadPpm } from './evalio'
import { findHints, greenMask } from './hints'
import { solveTraces } from './solve'
import { truthPick } from './solveEval'
import { inkThreshold } from './walls'
import type { Gray, TextTrace } from './types'

const truth = truthJson as unknown as Unit
const PGM = `${FIXTURES}assets__plan-sheltech-l2.pgm`
const PPM = `${process.env.TRACE_RGB ?? 'E:/dev/tmp/wave16/hints/fixtures/'}assets__plan-sheltech-l2.ppm`
const TEXT = `${process.env.TRACE_NEW_TEXT ?? 'E:/dev/tmp/wave19/reader/final/'}assets__plan-sheltech-l2.json`
const have = existsSync(PGM) && existsSync(PPM) && existsSync(TEXT)
/** the founder's fit of this sheet (his exported draft, src/data/fixtures/founder-autotrace-type-a-2026-10-06.json) */
const PX_PER_M = 26.864289022695694
const SIZE_TOL_M = 2 * 0.0254

/** The ink band across line c at u (sheet px, pixel centres): the run holding c (or the nearest within 3 px), sub-pixel faces as tracks.ts reads them. */
function band(g: Gray, horiz: boolean, c: number, u: number, dark: number): { c: number; w: number } | null {
  const at = (v: number) => (v < 0 ? 255 : horiz ? g.data[v * g.width + Math.round(u)] ?? 255 : g.data[Math.round(u) * g.width + v] ?? 255)
  let v = -1
  for (let d = 0; d <= 3 && v < 0; d++) for (const q of [Math.round(c) - d, Math.round(c) + d]) if (at(q) <= dark) (v = q), (d = 9)
  if (v < 0) return null
  let a = v, b = v
  while (at(a - 1) <= dark) a--
  while (at(b + 1) <= dark) b++
  let min = 255
  for (let q = a; q <= b; q++) min = Math.min(min, at(q))
  const pLo = Math.max(at(a - 2), at(a - 3), min + 1), pHi = Math.max(at(b + 2), at(b + 3), min + 1)
  const cLo = Math.max(0, Math.min(1, (pLo - at(a - 1)) / (pLo - min))), cHi = Math.max(0, Math.min(1, (pHi - at(b + 1)) / (pHi - min)))
  return { c: (a + b + cHi - cLo) / 2, w: b - a + 1 + cLo + cHi }
}

describe.skipIf(!have)('Sheltech L2 Type A auto-traced at the founder\'s scale: walls on the drawing', () => {
  const g = have ? loadPgm(PGM)! : (null as unknown as Gray)
  const rgb = have ? loadPpm(PPM)! : null
  const text: TextTrace = have ? JSON.parse(readFileSync(TEXT, 'utf8')) : { items: [] }
  const res = have ? solveTraces(g, { text, green: greenMask(rgb!), findHints: (pxPerM, walls) => findHints(g, rgb!, { pxPerM, walls }) }, { pickPx: truthPick(truth), rgb: rgb!, pxPerM: PX_PER_M }) : null
  const u = res?.unit as Unit
  const pi = u?.planImage
  const dark = have ? inkThreshold(g, {}) : 0
  /** the draft's axis walls in sheet px */
  const axis = () =>
    u.walls.flatMap((w) => {
      const A = u.vertices.find((v) => v.id === w.a)!, B = u.vertices.find((v) => v.id === w.b)!
      const a = { x: pi!.originPx.x + A.x * pi!.pxPerM, y: pi!.originPx.y + A.y * pi!.pxPerM }, b = { x: pi!.originPx.x + B.x * pi!.pxPerM, y: pi!.originPx.y + B.y * pi!.pxPerM }
      const horiz = Math.abs(a.y - b.y) < 0.5
      if (!horiz && Math.abs(a.x - b.x) >= 0.5) return []
      return [{ w, horiz, c: horiz ? a.y : a.x, u0: Math.min(horiz ? a.x : a.y, horiz ? b.x : b.y), u1: Math.max(horiz ? a.x : a.y, horiz ? b.x : b.y), th: w.thicknessM * pi!.pxPerM }]
    })
  /** a wall's median offset from its drawn band (samples where the band is the wall's own: as wide as it ± 2 px — not a column beside it) */
  const offInk = (l: ReturnType<typeof axis>[number]) => {
    const offs: number[] = []
    for (let s = Math.ceil(l.u0 + 3); s <= l.u1 - 3; s += 2) {
      const b = band(g, l.horiz, l.c, s, dark)
      if (b && Math.abs(b.w - l.th) <= 2) offs.push(b.c - l.c)
    }
    offs.sort((p, q) => p - q)
    return offs.length >= 3 ? offs[offs.length >> 1] : null
  }

  test('west of the Dining: two 5" walls, each on its own ink (stair core x ≈ 624.7, Bed 4 x ≈ 632.9) — nothing on the paper between', () => {
    const vert = axis().filter((l) => !l.horiz && l.c > 615 && l.c < 640)
    const stair = vert.find((l) => l.u0 <= 360 && l.u1 >= 420), bed4 = vert.find((l) => l.u0 <= 480 && l.u1 >= 540)
    expect(stair && bed4).toBeTruthy()
    for (const [l, at] of [[stair!, 390], [bed4!, 510]] as const) {
      const b = band(g, false, l.c, at, dark)!
      expect(Math.abs(b.c - l.c), `wall at x ${l.c.toFixed(1)}`).toBeLessThan(0.75)
      expect(l.w.thicknessM).toBeGreaterThan(0.12)
      expect(l.w.thicknessM).toBeLessThan(0.16)
    }
    expect(bed4!.c - stair!.c).toBeGreaterThan(6) // 8 px on the sheet: two walls, not one wall's faces
    // the hand trace's single spine (x 5.144 m) lies on paper: no draft wall there
    const handX = truth.planImage!.originPx.x + 5.144 * truth.planImage!.pxPerM
    expect(vert.filter((l) => Math.abs(l.c - handX) < 1.5)).toEqual([])
  })

  test("the kitchen's south block: one wall 0.30–0.37 m thick, on its ink", () => {
    const k = axis().find((l) => l.horiz && l.c > 280 && l.c < 292 && l.u0 <= 612 && l.u1 >= 620)!
    expect(k).toBeTruthy()
    expect(k.w.thicknessM).toBeGreaterThan(0.3)
    expect(k.w.thicknessM).toBeLessThan(0.37)
    expect(Math.abs(band(g, true, k.c, 615, dark)!.c - k.c)).toBeLessThan(0.75)
  })

  test('every full-height axis wall at least 0.5 m long without openings sits on its drawn band (within 0.75 px)', () => {
    const long = axis().filter((l) => l.w.heightM >= 2.5 && !l.w.openings.length && l.u1 - l.u0 >= 0.5 * PX_PER_M)
    expect(long.length).toBeGreaterThan(20)
    const off = long.map((l) => ({ l, o: offInk(l) })).filter((x) => x.o !== null && Math.abs(x.o) >= 0.75)
    expect(off.map(({ l, o }) => `${l.horiz ? 'H' : 'V'} ${l.c.toFixed(1)} (${l.u0.toFixed(0)}–${l.u1.toFixed(0)}): ${o!.toFixed(2)} px`)).toEqual([])
  })

  test('the names read on the flat go to the Studio (its live room count): those with no closed room among them', () => {
    const printed = res!.stats.printed ?? []
    const rooms = deriveRooms(u)
    const open = printed.filter((p) => !rooms.some((r) => pointInPolygon(p.at, roomPolygon(r, u)))).map((p) => p.name)
    // Level 1 (2026-10-09): Bed 4's window line carried on to Bed 1's wall closes Bed 4, and the veranda behind it joins;
    // the kitchen's veranda closes on its railing. Open: the VER south of Bed 1 (its size not read: no fitted room, and
    // its three thin sides close no face the thin-line pass keeps)
    expect(open).toEqual(['Ver'])
    expect(res!.stats.wantSqm).toBeCloseTo(2736 * 0.3048 ** 2 * 0.88, 0)
  })

  test("the sheet's printed sizes against the draft's rooms: 8 of the 14 closed ones off by more than 2\" (never more)", () => {
    const tp = truth.planImage!, ax = sheetAxis(u), rooms = deriveRooms(u)
    const rows: string[] = []
    let n = 0, off = 0
    for (const l of truth.roomLabels) {
      const pr = parsePrintedSize(l.printedSize)
      if (!pr) continue
      // the hand-traced label's point on the sheet → the draft's smallest closed room there
      const m = { x: (tp.originPx.x + l.x * tp.pxPerM - pi!.originPx.x) / pi!.pxPerM, y: (tp.originPx.y + l.y * tp.pxPerM - pi!.originPx.y) / pi!.pxPerM }
      const r = rooms.filter((x) => pointInPolygon(m, roomPolygon(x, u))).sort((p, q) => p.areaSqm - q.areaSqm)[0]
      if (!r) {
        rows.push(`--  ${l.name}: no closed room`)
        continue
      }
      const poly = roomInnerPolygon(r, u), c = printedSizeCheck(poly, ax, pr[0], pr[1], SIZE_TOL_M), o = outlineBox(poly, ax)
      const ft = (e: { w: number; h: number }) => `${(e.w / 0.3048).toFixed(2)}' × ${(e.h / 0.3048).toFixed(2)}'`
      n++
      off += c.off ? 1 : 0
      rows.push(`${(c.off ? 'OFF' : `ok (${c.by})`).padEnd(12)} ${l.name}: printed ${l.printedSize}, main rectangle ${ft(c.drawn)}, outline ${ft(o)}`)
    }
    console.log(`\nSheltech L2 Type A, printed sizes vs the draft (founder's scale):\n${rows.join('\n')}\n${off} of ${n} closed rooms off\n`)
    // Why, on the sheet (2026-10-09): Toilet 1 and Bed 3 pass by the main rectangle (their entry recesses left out), PDR
    // by its outline (an L; the sheet prints the whole L). Still off — Kitchen: outline 13'-0" deep (the door recess),
    // main rectangle 6'-5" wide (the L's narrow leg), printed 8'-5" × 12'-2". Foyer: outline 5" narrow, main rectangle
    // 4'-5" deep (an L). Living: outline open to the outside, main rectangle 7" short. Dining: outline 21'-3" (the unnamed
    // passage beyond the dashed line joins it, solve.ts mergeUnread, founder 2026-10-03), main rectangle 1'-2" short.
    // Bed 1: main rectangle 3" short, outline takes in the wardrobe strip. Bed 2: main rectangle 4" narrow, outline open
    // to the space east of Toilet 2. Closed by Level 1, off by 4–6": Bed 4 (its window on the fitted face line, the glass
    // drawn 2 px further out — the glass-front placement the founder parked), Veranda 4 (6'-11" wide on the sheet's planter
    // edge, printed 7'-5").
    expect(n).toBeGreaterThanOrEqual(14)
    expect(off).toBeLessThanOrEqual(8)
  })
})
