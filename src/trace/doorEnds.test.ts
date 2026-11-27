/** Double-action doors at a wall's tip (doorEnds.ts; from Maheer's Plotline 2.0, his test). */
import { expect, test } from 'vitest'
import { endDoors } from './doorEnds'
import type { WallTrace } from './types'

test.each([0, Math.PI / 5])('a half-circle swing about a structural wall tip is a door (turned %s rad); a ring, a quarter, several rings, low walls, a closed gap or no jamb are not', (angle) => {
  const c = Math.cos(angle), s = Math.sin(angle), k = 40
  const p = (x: number, y: number) => ({ x: 200 + (x * c - y * s) * k, y: 200 + (x * s + y * c) * k })
  const local = (x: number, y: number) => ({ x: ((x - 200) * c + (y - 200) * s) / k, y: (-(x - 200) * s + (y - 200) * c) / k })
  const trace: WallTrace = { walls: [{ a: p(0, 0), b: p(2, 0), thicknessPx: 5, conf: 1 }, { a: p(0, -1.2), b: p(-2, -1.2), thicknessPx: 5, conf: 1 }], openings: [] }
  const ink = (shape: 'swing' | 'circle' | 'quarter' | 'rings' | 'none') => (x: number, y: number) => {
    const q = local(x, y)
    const r = Math.hypot(q.x, q.y)
    return shape !== 'none' && [1.2, ...(shape === 'rings' ? [1.02, 1.38] : [])].some((R) => Math.abs(r - R) < 0.022) && (shape === 'circle' || q.x >= 0) && (shape !== 'quarter' || q.y <= 0)
  }
  const read = (shape: Parameters<typeof ink>[0]) => endDoors(trace, k, [ink(shape), ink(shape)])
  expect(read('swing')).toHaveLength(1)
  expect(read('circle')).toEqual([])
  expect(read('none')).toEqual([])
  expect(read('quarter')).toEqual([])
  expect(read('rings')).toEqual([])
  expect(endDoors({ ...trace, walls: trace.walls.map((w) => ({ ...w, heightM: 0 })) }, k, [ink('swing'), ink('swing')])).toEqual([])
  expect(endDoors({ ...trace, walls: [...trace.walls, { a: p(0, 0), b: p(0, -1.2), thicknessPx: 5, conf: 1 }] }, k, [ink('swing'), ink('swing')])).toEqual([])
  expect(endDoors({ ...trace, walls: trace.walls.slice(0, 1) }, k, [ink('swing'), ink('swing')])).toEqual([])
})
