import { describe, expect, it } from 'vitest'
import { pointInPolygon, type Unit } from '../core'
import typeA from '../data/units/type-a.json'
import { AXO_TILT, AXO_TURN, FLOORS, fitLabel, fitName, hull, moment, NAME_SCALES, planOf, project, shadowOf, sheetName } from './story'

const plan = planOf(typeA as unknown as Unit)

describe('the story reads the real Type A plan', () => {
  it('turns every wall into solid pieces, outer and inner, at the walls height', () => {
    expect(plan.h).toBe(3)
    expect(plan.pieces.some((p) => p.outside)).toBe(true)
    expect(plan.pieces.some((p) => !p.outside)).toBe(true)
    // a window leaves a piece under its sill and one over its head: some pieces start above the floor
    expect(plan.pieces.some((p) => p.v0 > 0)).toBe(true)
  })
  it('prints the rooms the sheet names, each point inside its own room', () => {
    const names = plan.labels.map((l) => l.name)
    for (const n of ['Living room', 'Kitchen', 'Bed-1', 'Dining & family living']) expect(names).toContain(n)
    for (const l of plan.labels) expect(pointInPolygon(l, l.room)).toBe(true)
  })
  it('stands the colonnade under the floor', () => {
    expect(plan.columns.length).toBeGreaterThan(8)
    for (const c of plan.columns) expect(plan.slab.some((poly) => pointInPolygon(c, poly))).toBe(true)
  })
})

describe('the timeline is the scroll', () => {
  it('starts on the sheet, seen from straight above, nothing built', () => {
    const m = moment(0)
    expect(m.ph).toBe(0)
    expect(m.sheet).toBe(1)
    expect(m.grow.every((g) => g === 0)).toBe(true)
    expect(m.roof + m.sun + m.lift + m.zoom).toBe(0)
  })
  it('ends on the whole tower in axonometric, roofed, with the sun', () => {
    const m = moment(1)
    expect(m.th).toBeCloseTo(AXO_TURN)
    expect(m.ph).toBeCloseTo(AXO_TILT)
    expect(m.grow).toEqual(Array(FLOORS).fill(1))
    expect([m.sheet, m.notes]).toEqual([0, 0])
    expect([m.lift, m.zoom, m.roof, m.sun]).toEqual([1, 1, 1, 1])
  })
  it('only ever builds up as the page scrolls down, each floor after the one under it', () => {
    let prev = moment(0)
    for (let i = 1; i <= 200; i++) {
      const m = moment(i / 200)
      m.grow.forEach((g, f) => {
        expect(g).toBeGreaterThanOrEqual(prev.grow[f])
        if (f > 0) expect(g).toBeLessThanOrEqual(m.grow[f - 1])
      })
      expect(m.lift).toBeGreaterThanOrEqual(prev.lift)
      prev = m
    }
  })
})

describe('the drawing maths', () => {
  const c = { x: 5, y: 5 }
  it('from straight above, a plan point is only scaled (its height does not show)', () => {
    expect(project({ th: 0, ph: 0, s: 2, ox: 10, oy: 20, c }, { x: 6, y: 7 }, 9)).toEqual({ x: 12, y: 24 })
  })
  it('tipped back, a higher point moves up the screen', () => {
    const k = { th: AXO_TURN, ph: AXO_TILT, s: 10, ox: 0, oy: 0, c }
    const lo = project(k, { x: 6, y: 7 }, 0)
    const hi = project(k, { x: 6, y: 7 }, 3)
    expect(hi.x).toBeCloseTo(lo.x)
    expect(lo.y - hi.y).toBeCloseTo(30 * Math.sin(AXO_TILT))
  })
  it('a hull keeps the outside points, with a positive area', () => {
    const h = hull([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }])
    expect(h).toHaveLength(4)
    let a = 0
    h.forEach((p, i) => (a += p.x * h[(i + 1) % h.length].y - h[(i + 1) % h.length].x * p.y))
    expect(a).toBeGreaterThan(0)
  })
  it('a room name goes on one line, else on two broken evenly, else nowhere', () => {
    const upTo = (n: number) => (lines: string[]) => lines.every((t) => t.length <= n)
    expect(fitName('LIVING ROOM', upTo(20))).toEqual(['LIVING ROOM'])
    expect(fitName('DINING & FAMILY LIVING', upTo(14))).toEqual(['DINING &', 'FAMILY LIVING'])
    expect(fitName('BATH-3', upTo(4))).toBeNull()
  })
  it('a name that fits at no size is tried smaller twice before it is left out (Bath-3, a shaft on a phone)', () => {
    const upTo = (n: number) => (lines: string[], k: number) => lines.every((t) => t.length * k <= n)
    expect(fitLabel('LIVING ROOM', NAME_SCALES, upTo(20))).toEqual({ lines: ['LIVING ROOM'], k: 1 })
    expect(fitLabel('BATH-3', NAME_SCALES, upTo(5))).toEqual({ lines: ['BATH-3'], k: 0.8 })
    expect(fitLabel('BATH-3', NAME_SCALES, upTo(4))).toEqual({ lines: ['BATH-3'], k: 0.64 })
    expect(fitLabel('DINING & FAMILY LIVING', NAME_SCALES, upTo(10))).toEqual({ lines: ['DINING &', 'FAMILY LIVING'], k: 0.64 })
    expect(fitLabel('BATH-3', NAME_SCALES, upTo(3))).toBeNull()
  })
  it('names a room as the sheet prints it, and the rooms the sheet gives no size too', () => {
    expect(sheetName('Veranda (living)')).toBe('Veranda')
    expect(sheetName('AOD (west)')).toBe('AOD')
    expect(sheetName('Dining & family living')).toBe('Dining & family living')
    expect(sheetName('(west)')).toBe('(west)')
    const names = plan.labels.map((l) => l.name)
    expect(names).toContain('AOD')
    expect(plan.labels.find((l) => l.name === 'AOD')!.size).toBe('')
  })
  it('the sun: at noon on the equinox in Dhaka a shadow points due north, tan(latitude) long per metre', () => {
    const d = shadowOf(0, 0, 0) // north straight up the plan
    expect(d.x).toBeCloseTo(0)
    expect(d.y).toBeCloseTo(-Math.tan((23.8 * Math.PI) / 180))
    // turned with the unit's north: the same shadow, along its north
    const t = shadowOf(90, 0, 0)
    expect(t.x).toBeCloseTo(Math.tan((23.8 * Math.PI) / 180))
    expect(t.y).toBeCloseTo(0)
  })
})
