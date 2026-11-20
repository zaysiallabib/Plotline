/**
 * The plan sheet: wall pieces stop at their openings and close their corners; doors swing as the Studio draws them; the
 * printed sheet is the paper's size in millimetres with the drawing at its scale.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Unit } from '../core'
import { normalizeUnit } from '../studio/model'
import { fits, layoutOf, sheetOf, sheetSvg } from './sheet'

// a 4 x 3 m room: 25 cm walls, a 0.9 m door in the bottom wall (hinge a, swinging in), a 1.2 m window in the top wall
const room: Unit = normalizeUnit({
  id: 'u',
  name: 'Room',
  projectName: 'Test',
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 4, y: 0 },
    { id: 'c', x: 4, y: 3 },
    { id: 'd', x: 0, y: 3 },
  ],
  walls: [
    { id: 'w1', a: 'a', b: 'b', thicknessM: 0.25, heightM: 3, openings: [{ id: 'win', kind: 'window', offsetM: 1.4, widthM: 1.2, heightM: 1.2, sillM: 0.9 }] },
    { id: 'w2', a: 'b', b: 'c', thicknessM: 0.25, heightM: 3, openings: [] },
    { id: 'w3', a: 'c', b: 'd', thicknessM: 0.25, heightM: 3, openings: [{ id: 'door', kind: 'door', offsetM: 0.5, widthM: 0.9, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' }] },
    { id: 'w4', a: 'd', b: 'a', thicknessM: 0.25, heightM: 3, openings: [] },
  ],
  roomLabels: [{ id: 'l', name: 'BED', kind: 'bed', x: 2, y: 1.5, printedSize: `13'-0" x 9'-10"` }],
  pillars: [],
  furniture: [],
  finishSlots: [],
  areaSqft: 0,
} as unknown as Unit)

describe('the plan sheet', () => {
  it('walls stop at their openings and reach into each other at the corners', () => {
    const s = sheetOf(room)
    expect(s.walls).toHaveLength(6) // two walls in two pieces each, two whole
    const xs = s.walls.flat().map((p) => p.x)
    expect(Math.min(...xs)).toBeCloseTo(-0.125, 6) // the outside corner is filled
    expect(Math.max(...xs)).toBeCloseTo(4.125, 6)
    expect(s.openings.map((o) => o.kind).sort()).toEqual(['door', 'window'])
    const door = s.openings.find((o) => o.kind === 'door')!
    expect(door.arc!.r).toBeCloseTo(0.9, 6)
    expect(s.texts.map((t) => t.text)).toEqual(['BED', `13'-0" x 9'-10"`])
  })

  it('prints on the paper at its scale: A3 landscape, a 4 m wall 40 mm long at 1 : 100; too big is refused', () => {
    const s = sheetOf(room)
    expect(layoutOf(s, 'A3')).toMatchObject({ w: 420, h: 297 })
    expect(fits(s, 'A4', 50)).toBe(true)
    const type = normalizeUnit(JSON.parse(readFileSync(`${__dirname}/../data/units/type-a.json`, 'utf8')) as Unit)
    const t = sheetOf(type)
    expect(fits(t, 'A3', 100)).toBe(true)
    expect(fits(t, 'A4', 50)).toBe(false)
    const svg = sheetSvg(s, 'A3', 100, { project: 'Test', name: 'Room', date: '2026-11-20' })
    expect(svg).toMatch(/width="420mm" height="297mm" viewBox="0 0 420 297"/)
    const xs = [...svg.matchAll(/<polygon points="([^"]+)"/g)].flatMap((m) => m[1].split(' ').map((p) => Number(p.split(',')[0])))
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(42.5, 1) // 4.25 m outside to outside
    expect(svg).toContain('1 : 100 on A3')
    expect(svg).not.toMatch(/fill="#|stroke="#/) // painted by the stylesheet's tokens only
  })
})
