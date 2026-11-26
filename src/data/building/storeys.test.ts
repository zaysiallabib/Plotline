/** A building's storeys as the tower draws them (storeys.ts): from the heights its drawings print to each floor's level and walls. */
import { describe, expect, test } from 'vitest'
import { FT, type Unit } from '../../core'
import { storeyUnit, towerHeights } from './storeys'

const ft = (f: number, i = 0) => (f + i / 12) * FT

describe('the tower from the heights', () => {
  test('the farmhouse: G and 1 as printed, the roof on the ceiling and a slab, walls a slab under the next floor', () => {
    const t = towerHeights({ floors: { 0: 0, 1: ft(10) }, ceilingM: ft(19), eaveM: ft(20), ridgeM: ft(29, 2) }, 0, 1, 3.2)
    expect(t.levels[0]).toBe(0)
    expect(t.levels[1]).toBeCloseTo(ft(10), 6)
    expect(t.levels[2]).toBeCloseTo(ft(19) + 0.15, 6)
    expect(t.walls[0]).toBeCloseTo(ft(10) - 0.15, 6)
    expect(t.walls[1]).toBeCloseTo(ft(9), 6)
    expect([t.eaveM, t.ridgeM]).toEqual([ft(20), ft(29, 2)])
  })
  test('a building taller than its section: the floors over it repeat the last storey, the top keeps the section\'s top storey', () => {
    const t = towerHeights({ floors: { 0: 0, 1: 4.5, 2: 7.55 }, roofM: 10.7, parapetM: 1 }, -1, 5, 3.2)
    expect([t.levels[-1], t.levels[3], t.levels[5]].map((x) => +x.toFixed(2))).toEqual([-4.5, 10.6, 16.7])
    expect(+t.levels[6].toFixed(2)).toBe(19.85)
    expect(t.parapetM).toBe(1)
  })
  test('a floor in a gap takes its share of it', () => {
    expect(towerHeights({ floors: { 0: 0, 3: 9 } }, 0, 3, 3).levels[1]).toBe(3)
  })
})

describe('a flat on its storey', () => {
  const u = { walls: [3.048, 3, 1.1, 0].map((heightM, i) => ({ id: String(i), a: 'a', b: 'b', thicknessM: 0.2, heightM, openings: [] })) } as unknown as Unit
  test("its full walls take the storey's height, a parapet and a zone line keep theirs", () => {
    expect(storeyUnit(u, 2.9).walls.map((w) => w.heightM)).toEqual([2.9, 2.9, 1.1, 0])
  })
  test('glass from floor to ceiling still reaches the ceiling; a window under it keeps its head unless the wall would cut it', () => {
    const op = (sillM: number, heightM: number) => ({ id: 'o', kind: 'window' as const, offsetM: 1, widthM: 1, sillM, heightM })
    const v = { walls: [{ id: 'w', a: 'a', b: 'b', thicknessM: 0.2, heightM: 3.048, openings: [op(0, 3.048), op(0.9, 1.2), op(1, 2)] }] } as unknown as Unit
    expect(storeyUnit(v, 4).walls[0].openings.map((o) => o.heightM)).toEqual([4, 1.2, 2])
    expect(storeyUnit(v, 2.7).walls[0].openings.map((o) => +o.heightM.toFixed(3))).toEqual([2.7, 1.2, 1.7])
  })
  test('no height known: the very same flat', () => {
    expect(storeyUnit(u, undefined)).toBe(u)
  })
})
