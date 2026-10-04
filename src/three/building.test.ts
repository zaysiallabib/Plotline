/** The towers' data (data/building/*-tower.ts): alignment offsets re-derived from the traced core, floor maps, towerOf; Studio projects (projects.ts). */
import { describe, expect, test } from 'vitest'
import * as core from '../core'
import type { Pt, Unit } from '../core'
import { floorIn, towerOf } from '../data/building'
import * as bti from '../data/building/demo-tower'
import { CORE, FLATS, FLOORS } from '../data/building/demo-tower'
import { flatBounds, makeProject, parseProjects, placeFlat, placementOf, projectTower, removeFlat, sheetOffset, syncUnit } from '../data/building/projects'
import * as sheltech from '../data/building/sheltech-tower'
import draft from '../data/fixtures/founder-sheltech-a-draft.json'
import { initialState, reducer } from '../studio/model'

const roomsOf = (u: Unit) => core.deriveRooms(u)

/** The lift-core anchor as the data module documents it: west face of the core rooms, lobby↔lifts wall line. */
function coreAnchor(u: Unit): Pt {
  const box = (name: string) => {
    const r = roomsOf(u).find((x) => x.name === name)
    if (!r) return null
    const p = core.roomPolygon(r, u)
    return { minX: Math.min(...p.map((q) => q.x)), minY: Math.min(...p.map((q) => q.y)), maxY: Math.max(...p.map((q) => q.y)) }
  }
  const [lobby, lifts, stair] = ['Lift lobby', 'Lift core', 'Stair'].map(box)
  return { x: Math.min(...[lobby, lifts, stair].flatMap((b) => (b ? [b.minX] : []))), y: lifts ? lifts.minY : lobby!.maxY }
}

describe('demo tower', () => {
  test('offsets put every trace’s lift core on Type B’s (within 1 cm)', () => {
    const b = coreAnchor(FLATS['type-b'].unit)
    for (const [stem, { unit, offset }] of Object.entries(FLATS)) {
      const a = coreAnchor(unit)
      expect(offset.x, stem).toBeCloseTo(b.x - a.x, 2)
      expect(offset.y, stem).toBeCloseTo(b.y - a.y, 2)
    }
  })

  test('aligned, Type A (2nd floor) and Type C (3rd) cover the same flat: bounds within 0.8 m', () => {
    const bounds = (stem: string) => {
      const { unit, offset } = FLATS[stem]
      const b = core.unitBounds(unit)
      return [b.minX + offset.x, b.maxX + offset.x, b.minY + offset.y, b.maxY + offset.y]
    }
    const [a, c] = [bounds('type-a'), bounds('type-c')]
    // A's east edge stops at its veranda (15.5 m); C's planter reaches 18.3 m: compare the other three sides
    for (const i of [0, 2, 3]) expect(Math.abs(a[i] - c[i])).toBeLessThan(0.8)
  })

  test('floor map: 2 = Type A, 3–8 = Type B + C; every flat sits on its own JSON floor; stems resolve', () => {
    expect(FLOORS.find((f) => f.floor === 2)!.flats).toEqual(['type-a'])
    for (let k = 3; k <= 8; k++) expect(FLOORS.find((f) => f.floor === k)!.flats).toEqual(['type-b', 'type-c'])
    for (const f of FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(FLATS[s], s).toBeDefined()
    for (const { unit } of Object.values(FLATS)) {
      expect(FLOORS.some((f) => f.floor === unit.floor && f.flats.some((s) => FLATS[s].unit.id === unit.id)), unit.name).toBe(true)
    }
  })

  test('the core rooms that run ground to roof exist in their traces', () => {
    for (const [stem, name] of CORE) expect(roomsOf(FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})

describe('Sheltech tower', () => {
  const T = sheltech

  test('towerOf: BTI for type-a/b/c, Sheltech for sheltech-a/b, null for a unit in no tower', () => {
    for (const { unit } of Object.values(FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(FLATS)
    for (const { unit } of Object.values(T.FLATS)) expect(towerOf(unit)?.FLATS, unit.id).toBe(T.FLATS)
    expect(towerOf({ ...FLATS['type-a'].unit, id: 'elsewhere' })).toBeNull()
  })

  test('A and B share the core walls (the lobby) within 1 cm after offsets', () => {
    /** a flat's walls around its Lobby, as segments in the building frame */
    const lobbyWalls = (stem: string) => {
      const { unit, offset } = T.FLATS[stem]
      const lobby = roomsOf(unit).find((r) => r.name === 'Lobby')!
      const vs = new Map(unit.vertices.map((v) => [v.id, { x: v.x + offset.x, y: v.y + offset.y }]))
      return lobby.wallIds.map((id) => unit.walls.find((w) => w.id === id)!).map((w) => [vs.get(w.a)!, vs.get(w.b)!] as const)
    }
    const dist = (p: Pt, [a, b]: readonly [Pt, Pt]) => {
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)))
      return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y))
    }
    // every point along one flat's lobby walls lies on the other flat's lobby walls
    for (const [s, o] of [['sheltech-a', 'sheltech-b'], ['sheltech-b', 'sheltech-a']]) {
      const other = lobbyWalls(o)
      for (const [a, b] of lobbyWalls(s)) {
        for (const f of [0, 0.25, 0.5, 0.75, 1]) {
          const p = { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
          expect(Math.min(...other.map((seg) => dist(p, seg))), `${s} ${p.x},${p.y}`).toBeLessThan(0.01)
        }
      }
    }
  })

  test('floor map: 1 = stand-ins (lounge + gym), 2–6 = A + B; flats sit on their JSON floor; core rooms exist', () => {
    expect(T.FLOORS.map((f) => [f.floor, f.flats.length])).toEqual([[1, 0], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]])
    for (const f of T.FLOORS) for (const s of [...f.flats, ...(f.standIns ?? [])]) expect(T.FLATS[s], s).toBeDefined()
    for (const { unit } of Object.values(T.FLATS)) {
      expect(T.FLOORS.some((f) => f.floor === unit.floor && f.flats.some((s) => T.FLATS[s].unit.id === unit.id)), unit.name).toBe(true)
    }
    for (const [stem, name] of T.CORE) expect(roomsOf(T.FLATS[stem].unit).some((r) => r.name === name), `${stem} ${name}`).toBe(true)
  })
})

describe('a building made in the Studio (projects.ts): floors of traced flats', () => {
  // the founder's draft as the Studio holds it (Import → Join walls)
  const u = reducer(initialState(), { type: 'load-unit', unit: draft as unknown as Unit }).unit
  const xs = (x: Unit) => roomsOf(x).flatMap((r) => core.roomPolygon(r, x).map((p) => p.x))

  test('his draft on floors 2–7 with a mirrored neighbour: 6 floors × 2 flats, floor 1 stands in, the ground stands on his columns', () => {
    const t = projectTower(makeProject('p', u, 2, 7, 'left'))
    const m = `${u.id}-m`
    expect(Object.keys(t.FLATS).sort()).toEqual([u.id, m].sort())
    expect(t.FLOORS.map((f) => [f.floor, f.flats.length, f.standIns?.length ?? 0])).toEqual([[1, 0, 2], [2, 2, 0], [3, 2, 0], [4, 2, 0], [5, 2, 0], [6, 2, 0], [7, 2, 0]])
    expect(t.FLATS[u.id].unit).toBe(u)
    expect(t.GROUND.columns).toHaveLength(2 * (u.pillars ?? []).length)
    expect(t.GROUND.plot).toHaveLength(4)
    expect(t.FLOOR_M).toBe(bti.FLOOR_M)
    // the neighbour is the mirror image on the left: it ends on the flat's own west wall line, never inside it
    const mine = flatBounds(u)
    expect(Math.max(...xs(t.FLATS[m].unit))).toBeCloseTo(mine.minX, 6)
    expect(roomsOf(t.FLATS[m].unit).map((r) => r.areaSqm.toFixed(2)).sort()).toEqual(roomsOf(u).map((r) => r.areaSqm.toFixed(2)).sort())
    // right: the other side
    const r = projectTower(makeProject('p', u, 2, 7, 'right'))
    expect(Math.min(...xs(r.FLATS[m].unit))).toBeCloseTo(mine.maxX, 6)
  })

  test('towerOf / floorIn: the project for his draft (first, before a built-in tower), the floor it is listed on', () => {
    const t = projectTower(makeProject('p', u, 3, 8, 'none'))
    expect(towerOf(u, [t, bti, sheltech])).toBe(t)
    expect(towerOf(u, [bti, sheltech])).toBeNull()
    expect(floorIn(t, u.id, 5)).toBe(5)
    expect(floorIn(t, u.id, undefined)).toBe(3)
    expect(floorIn(t, u.id, 12)).toBe(3)
    // a hand-authored unit he built a building from: his building wins in his browser; without it the built-in one
    const sa = sheltech.FLATS['sheltech-a'].unit
    const his = projectTower(makeProject('q', sa, 2, 3, 'none'))
    expect(towerOf(sa, [his, bti, sheltech])).toBe(his)
    expect(towerOf(sa)).toBe(sheltech) // no stored projects here: the built-in tower, as before
    expect(floorIn(sheltech, 'sheltech-a', sa.floor)).toBe(sa.floor)
  })

  test('a flat with no column drawn: its shells stand in for the ground floor (the tower never floats)', () => {
    const t = projectTower(makeProject('p', FLATS['type-b'].unit, 2, 4, 'none'))
    expect(t.GROUND.columns).toEqual([])
    expect(t.FLOORS[0]).toEqual({ floor: 0, flats: [], standIns: [FLATS['type-b'].unit.id] })
  })

  test('two traced flats off one drawing land where they were traced; editing a flat re-places it; taking it out', () => {
    const a = sheltech.FLATS['sheltech-a'].unit
    const pi = a.planImage!
    // type B traced off the same sheet with its metre origin 1 m right and 2 m down of A's
    const b = { ...sheltech.FLATS['sheltech-b'].unit, planImage: { ...pi, originPx: { x: pi.originPx.x + pi.pxPerM, y: pi.originPx.y + 2 * pi.pxPerM } } }
    let p = makeProject('p', a, 2, 6, 'none')
    const off = sheetOffset(p, b)
    expect(off.x).toBeCloseTo(1, 9)
    expect(off.y).toBeCloseTo(2, 9)
    expect(sheetOffset(p, { ...b, planImage: { ...b.planImage, src: 'another.jpg' } })).toEqual({ x: 0, y: 0 })
    p = placeFlat(p, b, 2, 6, 'none', off)
    expect(p.floors).toEqual([{ from: 2, to: 6, flats: [a.id, b.id] }])
    expect(projectTower(p).FLATS[b.id].offset).toEqual(off)
    // B again on floors 3–4 with a mirror: it leaves the 2–6 group, a new group holds it and its mirror
    p = placeFlat(p, b, 4, 3, 'right', off)
    expect(p.floors).toEqual([{ from: 2, to: 6, flats: [a.id] }, { from: 3, to: 4, flats: [b.id, `${b.id}-m`] }])
    expect(placementOf(p, b.id)).toEqual({ from: 3, to: 4, neighbour: 'right', offset: off })
    expect(projectTower(p).FLOORS.find((f) => f.floor === 3)!.flats).toEqual([a.id, b.id, `${b.id}-m`])
    expect(removeFlat(p, b.id)!.floors).toEqual([{ from: 2, to: 6, flats: [a.id] }])
    expect(removeFlat(removeFlat(p, b.id)!, a.id)).toBeNull()
  })

  test('the Studio autosave keeps the stored flat current; the mirror axis follows an edited outer wall; a corrupt store reads as none', () => {
    const p = makeProject('p', u, 2, 7, 'right')
    expect(syncUnit([p], u)).toBeNull()
    const east = flatBounds(u).maxX
    const moved = { ...u, vertices: u.vertices.map((v) => (Math.abs(v.x - east) < 1e-6 ? { ...v, x: v.x + 0.5 } : v)) }
    const [q] = syncUnit([p], moved)!
    expect(q.units[u.id]).toBe(moved)
    expect(Math.min(...xs(projectTower(q).FLATS[`${u.id}-m`].unit))).toBeCloseTo(east + 0.5, 6)
    expect(parseProjects('not json')).toEqual([])
    expect(parseProjects(JSON.stringify([{ id: 1 }, p]))).toEqual([p])
  })
})
