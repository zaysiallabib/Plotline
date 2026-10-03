/**
 * The founder's own auto-traced + hand-fixed Sheltech Level 2 Type-A draft (exported 2026-10-03, 102 walls, 88 corners,
 * 9 pillars) as the Studio loads it: normalizeUnit + Join walls (load-unit). Before: Bed 3's north wall a 1.1 m railing
 * carrying a window (open to the sky in 3D), 13 loose ends, 15 closed rooms, all 9 labels inside one.
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms, roomAt, validate } from '../core'
import type { Unit } from '../core'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import typeA from '../data/units/type-a.json'
import typeB from '../data/units/type-b.json'
import typeC from '../data/units/type-c.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import { initialState, normalizeUnit, reducer } from './model'

const looseEnds = (u: Unit) => u.vertices.filter((v) => u.walls.filter((w) => w.a === v.id || w.b === v.id).length === 1).map((v) => v.id.slice(0, 8)).sort()

/**
 * The loose ends Join walls leaves, and why (none points at a wall within its reach, max(0.15 m, 1.5 × its thickness),
 * except the two that end on a slider: an opening on the split point refuses the join).
 */
const STAY: Record<string, string> = {
  c2ea6959: '(4.06, 5.43) 0.21 m nib of the 13.5" run past the Living / Foyer corner, nothing ahead',
  '25f55f7c': '(5.23, 5.43) 0.27 m nib of the same run past the Kitchen corner, alongside the Kitchen wall, nothing ahead',
  '945811df': '(0.00, 5.49) 0.27 m nib past the Living\'s SW corner, nothing ahead',
  db553a9c: '(0.14, 5.49) a second 0.27 m nib beside it (parallel: never merged — that would tilt both)',
  '791e5dbd': '(1.38, 17.98) Bed 2\'s west wall 0.65 m past its south wall: the sunshade line 0.55 m ahead > reach 0.40',
  '179fac4e': '(5.20, 17.98) Bed 2\'s east wall, the same 0.55 m short of the sunshade line',
  '6643a976': '(12.69, 0.06) Bed 3\'s east wall 0.59 m past its north wall, inside a pillar, outside the building ahead',
  '05c6f946': '(10.52, 0.00) Bed 3\'s west wall 0.65 m past its north wall to the sheet\'s outline, nothing ahead',
  '9f4f74b7': '(3.54, 12.08) the toilet\'s east wall 0.75 m short of Bed 2\'s north wall > reach 0.21',
  f3165b85: '(12.52, 10.81) 0.47 m stub inside a pillar beside the exterior wall, nothing ahead on its line',
  '8516f94c': '(-12.14, 18.66) the far end of the 24.8 m sunshade line running through the next flat',
  f6d7b875: '(10.35, 16.14) a 0.45 m planter edge ending inside Bed 1\'s 0.52 m south wall, on its 3.70 m slider: refused',
  cf797dfa: '(7.58, 15.36) a 0.45 m planter edge 1.6 cm short of Bed 4\'s south wall, on its 2.94 m slider: refused',
}

describe("founder's Sheltech Type-A draft, loaded in the Studio", () => {
  const raw = draft as unknown as Unit
  const s = reducer(initialState(), { type: 'load-unit', unit: raw })
  const u = s.unit
  const rooms = deriveRooms(u)

  it('no low wall carries an opening (Bed 3\'s north wall is full height again)', () => {
    expect(raw.walls.filter((w) => w.heightM < 2 && w.openings.length).map((w) => w.id.slice(0, 8))).toEqual(['48fa08a5'])
    expect(u.walls.filter((w) => w.heightM < 2 && w.openings.length)).toEqual([])
    expect(u.walls.find((w) => w.id.startsWith('48fa08a5'))!.heightM).toBe(3.048)
    expect(u.walls.filter((w) => w.heightM < 2)).toHaveLength(8) // the planter edges (0.45 / 0.457 m) stay low
  })

  it('loose ends: 13 before, the 13 listed (and why) after — none within reach of a wall without an opening there', () => {
    expect(looseEnds(raw)).toHaveLength(13)
    expect(looseEnds(u)).toEqual(Object.keys(STAY).sort())
    expect(s.toast?.text).toMatch(/opening/i) // the slider refusals
  })

  it('rooms: none lost, every label inside a closed room, validate has no errors', () => {
    expect(rooms.length).toBeGreaterThanOrEqual(deriveRooms(raw).length)
    expect(rooms).toHaveLength(15)
    for (const l of u.roomLabels) expect(roomAt(l, rooms, u), l.name).toBeTruthy()
    expect(u.roomLabels.map((l) => l.name).sort()).toEqual(['Bed 1', 'Bed 3', 'Kitchen', 'Living', 'Planter', 'Room', 'Room', 'Toilet 1', 'Toilet 2'])
    expect(validate(u).filter((i) => i.level === 'error')).toEqual([])
  })

  it('the five hand-traced units are unchanged by Join walls (already clean)', () => {
    for (const h of [typeA, typeB, typeC, sheltechA, sheltechB] as unknown as Unit[]) {
      const n = normalizeUnit(h)
      expect(n.walls.map((w) => w.heightM)).toEqual(h.walls.map((w) => w.heightM))
      const j = reducer({ ...initialState(), unit: n }, { type: 'join-walls' })
      expect(j.unit).toBe(n)
      expect(j.unit.vertices).toEqual(h.vertices)
      expect(j.unit.walls.map(({ id, a, b, thicknessM, heightM }) => ({ id, a, b, thicknessM, heightM }))).toEqual(h.walls.map(({ id, a, b, thicknessM, heightM }) => ({ id, a, b, thicknessM, heightM })))
    }
  })
})
