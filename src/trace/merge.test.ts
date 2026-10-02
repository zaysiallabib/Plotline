import { describe, expect, test } from 'vitest'
import { closeCorners } from './merge'
import type { OpeningGuess, WallSeg } from './types'

const W = (ax: number, ay: number, bx: number, by: number, th = 6): WallSeg => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, thicknessPx: th, conf: 1 })

describe('closeCorners (k = 50 px/m)', () => {
  test('a free end 4 px short of a perpendicular wall is carried on to its centre line, along its own axis', () => {
    const walls = [W(0, 0, 0, 100), W(7, 50, 100, 50)]
    closeCorners(walls, [], 50)
    expect(walls[1].a).toEqual({ x: 0, y: 50 })
  })

  test('an opening ending short of a wall gets a connector; the opening keeps its span', () => {
    const walls = [W(0, 0, 0, 100)]
    const ops: OpeningGuess[] = [{ a: { x: 6, y: 50 }, b: { x: 60, y: 50 }, kind: 'window', conf: 0.6, thicknessPx: 6 }]
    const added = closeCorners(walls, ops, 50)
    expect(added).toEqual([expect.objectContaining({ a: { x: 6, y: 50 }, b: { x: 0, y: 50 } })])
    expect(ops[0].a).toEqual({ x: 6, y: 50 })
  })

  test('0.4 m short: left open — unless solid ink (a column) fills the gap', () => {
    const open = [W(0, 0, 0, 100), W(23, 50, 100, 50)]
    closeCorners(open, [], 50)
    expect(open[1].a).toEqual({ x: 23, y: 50 })
    const column = [W(0, 0, 0, 100), W(23, 50, 100, 50)]
    closeCorners(column, [], 50, () => 1)
    expect(column[1].a).toEqual({ x: 0, y: 50 })
  })

  test('an undecided gap is no edge: the wall ends beside it stay free and are not joined across it', () => {
    const walls = [W(0, 0, 0, 100), W(40, 50, 100, 50)]
    const ops: OpeningGuess[] = [{ a: { x: 3, y: 50 }, b: { x: 40, y: 50 }, kind: 'unknown', conf: 0 }]
    closeCorners(walls, ops, 50)
    expect(walls[1].a).toEqual({ x: 40, y: 50 })
  })
})
