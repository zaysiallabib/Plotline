/**
 * The key plan on a brochure's flat page (session 31 polish3): its mark read from the page's fills, and the flats of a floor
 * put where their marks say — one scale, each slid to cover its mark, a flat its key shows twice drawn twice, a key that a
 * page moves still read from its own corner.
 */
import { describe, expect, it } from 'vitest'
import type { Pt } from '../core'
import type { Seg } from './plan2d'
import type { SheetPage } from './sheets'
import { keyPlace, readKey, turnOf } from './keyplan'

const ring = (q: Pt[], layer: string): Seg[] => q.map((a, i) => ({ a, b: q[(i + 1) % q.length], layer }))
const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const POCHE = 'fill #231f20', FLOOR = 'fill #e6e7e8', MARK = 'fill #005725', KEY = 'pen 0.33 #1b512e'
/** a flat's page: its plan (w × h points: four walls of poché round a floor) at (300, 300); the key (60 × 30) at `kx, ky` with its marks */
function page(w: number, h: number, marks: Pt[][], kx = 20, ky = 20): SheetPage {
  const [x0, y0, x1, y1] = [300, 300, 300 + w, 300 + h]
  const t = 4
  const walls = [rect(x0, y0, x1, y0 + t), rect(x0, y1 - t, x1, y1), rect(x0, y0, x0 + t, y1), rect(x1 - t, y0, x1, y1)]
  const key = [...ring(rect(kx, ky, kx + 60, ky + 30), KEY), ...ring(rect(kx + 30, ky, kx + 30.01, ky + 30), KEY)]
  return {
    box: { x0: 0, y0: 0, x1: 720, y1: 720 },
    texts: [],
    arcs: [],
    segs: [...ring(rect(x0, y0, x1, y1), FLOOR), ...walls.flatMap((q) => ring(q, POCHE)), ...key, ...marks.flatMap((m) => ring(m.map((p) => ({ x: p.x + kx, y: p.y + ky })), MARK))],
  }
}

describe('a brochure flat page: its key plan', () => {
  it("reads the plan's box and the mark from the key's own corner (a page that moves its key reads the same)", () => {
    const a = readKey(page(200, 100, [rect(0, 0, 20, 10)]))!
    expect(a.plan).toEqual({ x0: 300, y0: 300, x1: 500, y1: 400 })
    expect(a.marks).toHaveLength(1)
    expect(a.key).toEqual({ w: 60, h: 30 })
    const moved = readKey(page(200, 100, [rect(0, 0, 20, 10)], 41, 20))!
    expect(moved.marks).toEqual(a.marks)
    // (a page with no mark: no key)
    expect(readKey(page(200, 100, []))).toBeNull()
  })

  it('puts the flats of a floor where their marks say: B beside A, a plan shown twice drawn twice', () => {
    const A = readKey(page(200, 100, [rect(0, 0, 20, 10)]))!
    const B = readKey(page(100, 100, [rect(20, 0, 30, 10), rect(40, 20, 50, 30)]))!
    const p = keyPlace([A, B])!
    expect(p).toHaveLength(3)
    const [a, b1, b2] = p
    // one scale (10 page points a key point): A's middle at key (10, 5), B's at (25, 5) and (45, 25) — y down
    expect([a.flat, a.x, a.y]).toEqual([0, 100, -50])
    expect([b1.flat, b1.x - a.x, b1.y - a.y]).toEqual([1, 150, 0])
    expect([b2.x - a.x, b2.y - a.y]).toEqual([350, -200])
    expect(p.every((x) => x.deg === 0 && x.fit > 0.9)).toBe(true)
  })

  it("a tower set at an angle: its mark's turn from its edges, the flat turned with it (clockwise on the picture)", () => {
    const turn = (q: Pt[], deg: number) => q.map((p) => ({ x: p.x * Math.cos((deg * Math.PI) / 180) - p.y * Math.sin((deg * Math.PI) / 180), y: p.x * Math.sin((deg * Math.PI) / 180) + p.y * Math.cos((deg * Math.PI) / 180) }))
    expect(turnOf([turn(rect(0, 0, 20, 10), 7)])).toBe(7)
    expect(turnOf([turn(rect(0, 0, 20, 10), -9)])).toBe(-9)
    const A = readKey(page(200, 100, [rect(0, 0, 20, 10)]))!
    const T = readKey(page(200, 100, [turn(rect(0, 0, 20, 10), 7).map((p) => ({ x: p.x + 30, y: p.y + 12 }))]))!
    const [, t] = keyPlace([A, T])!
    expect(t.deg).toBe(-7)
    expect(t.fit).toBeGreaterThan(0.85)
  })

  it('keys that disagree (another size of key on one page) place nothing: the flats go side by side', () => {
    const A = readKey(page(200, 100, [rect(0, 0, 20, 10)]))!
    const odd = { ...A, key: { w: 80, h: 30 } }
    expect(keyPlace([A, odd, A])).toBeNull()
  })
})
