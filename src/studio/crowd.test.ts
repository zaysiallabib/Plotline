import { describe, expect, it } from 'vitest'
import { AROUND, NAME_LOOKS, nameLooks, overlaps, placeBadges, type NameBox, type Rect } from './crowd'

/** a name centred at (x, y): `w` wide in the full look, narrower in each next one (as dropping the tracking, then a size, does) */
const name = (x: number, y: number, w: number, rank = 1): NameBox => ({
  rank,
  rects: NAME_LOOKS.map((_, k) => {
    const hw = (w * [1, 0.85, 0.7][k]) / 2
    return { x0: x - hw, x1: x + hw, y0: y - 10, y1: y + (k < 2 ? 18 : 2) }
  }),
})
const shownRects = (ns: NameBox[], looks: number[]) => ns.flatMap((n, i) => (looks[i] < 0 ? [] : [n.rects[looks[i]]]))
const noTwoOverlap = (rs: Rect[]) => rs.every((a, i) => rs.every((b, j) => i === j || !overlaps(a, b)))

describe('s31 crowd: room names on a zoomed-out plan never sit on top of each other', () => {
  it('names far apart keep the full look (tracked capitals and the printed size)', () => {
    expect(nameLooks([name(0, 0, 80), name(200, 0, 80), name(0, 100, 80)])).toEqual([0, 0, 0])
  })

  it('two that touch drop the tracking together; closer, a size too; closer still, the bigger room keeps its name', () => {
    expect(nameLooks([name(0, 0, 100), name(90, 0, 100)])).toEqual([1, 1]) // 100 px apart in full, 85 without tracking
    expect(nameLooks([name(0, 0, 100), name(75, 0, 100)])).toEqual([2, 2]) // 70 in the last look
    expect(nameLooks([name(0, 0, 100, 5), name(40, 0, 100, 9)])).toEqual([-1, 2])
    expect(nameLooks([name(0, 0, 100, 5), name(40, 0, 100, 5)])).toEqual([2, -1]) // a tie: list order
  })

  it('a name under the mouse keeps its full look; its neighbours make room', () => {
    const ns = [name(0, 0, 100, 9), name(40, 0, 100, 5)]
    expect(nameLooks(ns, 1)).toEqual([-1, 0])
  })

  it('a crowded row: only the crowded ones step down, and no two shown names overlap', () => {
    const ns = [name(0, 0, 100), name(95, 0, 100), name(150, 0, 100, 3), name(400, 0, 60), name(0, 30, 100)]
    const looks = nameLooks(ns)
    expect(looks[3]).toBe(0)
    expect(noTwoOverlap(shownRects(ns, looks))).toBe(true)
    expect(looks.filter((k) => k >= 0).length).toBeGreaterThanOrEqual(3)
    // same answer every time (deterministic)
    expect(nameLooks(ns)).toEqual(looks)
  })
})

describe('s31 crowd: a badge never covers a room name', () => {
  const box = (at: { x: number; y: number }, o: { x: number; y: number }, h = 10): Rect => ({ x0: at.x + o.x - h, y0: at.y + o.y - h, x1: at.x + o.x + h, y1: at.y + o.y + h })
  it('a badge whose spot is on a name goes beside it, clear of it; with nothing there, up-right of the spot', () => {
    const nm: Rect = { x0: -50, y0: -10, x1: 50, y1: 18 } // a name with its printed size under it
    const at = { x: 0, y: 0 }
    const [o] = placeBadges([{ at, hw: 10, hh: 10, dot: false }], [nm])
    expect(overlaps(box(at, o), nm)).toBe(false)
    expect(placeBadges([{ at, hw: 10, hh: 10, dot: false }], [])).toEqual([AROUND[0]])
  })

  it('a dot stays on its spot when no name is there, else moves off the name; badges never cover each other', () => {
    const nm: Rect = { x0: -50, y0: -10, x1: 50, y1: 4 }
    expect(placeBadges([{ at: { x: 200, y: 0 }, hw: 5, hh: 5, dot: true }], [nm])).toEqual([{ x: 0, y: 0 }])
    const [o] = placeBadges([{ at: { x: 0, y: 0 }, hw: 5, hh: 5, dot: true }], [nm])
    expect(overlaps(box({ x: 0, y: 0 }, o, 5), nm)).toBe(false)
    const bs = [0, 2, 4].map((x) => ({ at: { x, y: 0 }, hw: 10, hh: 10, dot: false }))
    const os = placeBadges(bs, [])
    const rs = bs.map((b, i) => box(b.at, os[i]))
    expect(noTwoOverlap(rs)).toBe(true)
  })
})
