/** The wind lines' layout at an opening (wind.ts windLanes). */
import { describe, expect, test } from 'vitest'
import { LANE_UP, windLanes } from './wind'

describe('windLanes: a sheet of lines up the opening, not two threads', () => {
  const heights = (l: { up: number }[]) => [...new Set(l.map((x) => x.up))].sort((a, b) => a - b)

  test.each([
    // width, height (sill → head), rows, columns
    ['a 1.5 × 1.4 m window', 1.5, 1.4, 4, 3],
    ['a 0.75 m door, 2.1 m leaf', 0.75, 2.1, 5, 2],
    ['a 2.4 m sliding door', 2.4, 2.1, 5, 4],
    ['a 0.45 × 0.6 m bath window', 0.45, 0.6, 3, 2],
    ['a 3.6 m ribbon window', 3.6, 1.4, 4, 5],
  ])('%s: %i heights × %i across', (_, w, h, rows, cols) => {
    const l = windLanes(w, h)
    expect(heights(l)).toHaveLength(rows)
    expect(l).toHaveLength(rows * cols)
    const ups = heights(l)
    // from a quarter of the opening's height to nine tenths, evenly
    expect(ups[0]).toBeCloseTo(LANE_UP[0], 9)
    expect(ups.at(-1)).toBeCloseTo(LANE_UP[1], 9)
    for (let i = 2; i < ups.length; i++) expect(ups[i] - ups[i - 1]).toBeCloseTo(ups[1] - ups[0], 9)
    // the same columns at every height, inside the opening and centred on it
    for (const up of ups) {
      const fs = l.filter((x) => x.up === up).map((x) => x.f)
      expect(fs).toEqual(l.filter((x) => x.up === ups[0]).map((x) => x.f))
      expect(Math.abs(fs.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9)
      for (const f of fs) expect(Math.abs(f)).toBeLessThan(0.5)
    }
  })
})
