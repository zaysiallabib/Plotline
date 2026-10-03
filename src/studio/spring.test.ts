import { describe, expect, it } from 'vitest'
import { initialState, reducer, type Action, type StudioState } from './model'

const TOL = 0.05
const run = (s: StudioState, ...actions: Action[]) => actions.reduce(reducer, s)
/** a 4×3 rectangle, Select tool, its top and right walls selected */
const rect = () => {
  const s = run(
    reducer(initialState(), { type: 'set-scale', pxPerM: 100 }),
    { type: 'chain-start', at: { x: 0, y: 0, tolM: TOL } },
    { type: 'chain-typed', lengthM: 4, dirDeg: 0, tolM: TOL },
    { type: 'chain-typed', lengthM: 3, dirDeg: 90, tolM: TOL },
    { type: 'chain-typed', lengthM: 4, dirDeg: 180, tolM: TOL },
    { type: 'chain-add', at: { x: 0, y: 0, tolM: TOL } },
    { type: 'set-tool', tool: 'select' },
  )
  return reducer(s, { type: 'select', ids: [s.unit.walls[0].id, s.unit.walls[1].id] })
}

describe('spring-loaded tools (held W / O / R)', () => {
  it('held W: one wall top to bottom, then back to Select with the selection minus the split wall', () => {
    const s0 = rect()
    const [top, right] = s0.selection
    const s = run(
      s0,
      { type: 'set-tool', tool: 'wall' },
      { type: 'chain-start', at: { x: 2, y: 0, tolM: TOL } }, // T-splits the top wall
      { type: 'chain-add', at: { x: 2, y: 3, tolM: TOL } },
      { type: 'chain-end' },
      { type: 'spring-back', tool: 'select', selection: s0.selection },
    )
    expect(s.tool).toBe('select')
    expect(s.chain).toBeNull()
    expect(s.unit.walls).toHaveLength(7) // 4 + one each split + the new one
    const ids = new Set(s.unit.walls.map((w) => w.id))
    expect(s.selection).toEqual([top, right].filter((id) => ids.has(id)))
    expect(s.selection).toContain(right)
  })

  it('chain-thickness sets the traced walls width; ignored with no chain', () => {
    let s = run(reducer(initialState(), { type: 'set-scale', pxPerM: 100 }), { type: 'chain-start', at: { x: 0, y: 0, tolM: TOL } })
    s = reducer(s, { type: 'chain-thickness', thicknessM: (7 / 12) * 0.3048 })
    s = reducer(s, { type: 'chain-typed', lengthM: 2, dirDeg: 0, tolM: TOL })
    expect(s.unit.walls[0].thicknessM).toBeCloseTo(0.1778)
    const done = reducer(s, { type: 'chain-end' })
    expect(reducer(done, { type: 'chain-thickness', thicknessM: 0.3 })).toBe(done)
  })
})
