/**
 * Session 19 (ground floors, basements, rooftops): free-standing walls, zones bounded by flush lines (heightM 0), floor
 * levels and ramps — all on the one wall graph (deriveRooms unchanged).
 */
import { describe, expect, test } from 'vitest'
import * as core from './index'
import type { RoomKind, RoomLabel, Unit, Wall } from './index'
import typeA from '../data/units/type-a.json'
import { GROUND_SAMPLE as ground } from '../data/fixtures/ground-sample'

const wall = (id: string, a: string, b: string, heightM = 3, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.25, heightM, openings: [], ...extra })
const label = (id: string, kind: RoomKind, x: number, y: number, extra: Partial<RoomLabel> = {}): RoomLabel => ({ id, name: id, kind, x, y, ...extra })

describe('zones on the wall graph', () => {
  const rooms = core.deriveRooms(ground)
  const by = (id: string) => rooms.find((r) => r.id === id)!

  test('flush lines bound faces like walls: lobby, lawn round it (keyhole), driveway, ramp — with their kinds', () => {
    expect(rooms.map((r) => [r.id, r.kind, +r.areaSqm.toFixed(3)]).sort()).toEqual([
      ['Driveway', 'driveway', 6],
      ['Lawn', 'lawn', 74], // 9 × 10 minus the 4 × 4 lobby
      ['Lobby', 'lobby', 16],
      ['Ramp', 'driveway', 24],
    ])
    expect(core.roomAt({ x: 4, y: 4 }, rooms, ground)!.id).toBe('Lobby')
    expect(core.roomAt({ x: 1, y: 1 }, rooms, ground)!.id).toBe('Lawn')
    // the keyhole triangulates to the lawn alone (the 3D floor never runs under the lobby)
    const poly = core.roomPolygon(by('Lawn'), ground)
    const tri = core.triangulate(poly)
    let a = 0
    for (let i = 0; i < tri.length; i += 3) a += Math.abs(core.signedArea([poly[tri[i]], poly[tri[i + 1]], poly[tri[i + 2]]]))
    expect(a).toBeCloseTo(74, 6)
    // its finished inside (skirting, daylight, furniture) goes round the lobby too: the bridge opens into a slit
    const inner = core.roomInnerPolygon(by('Lawn'), ground)
    expect(core.pointInPolygon({ x: 1, y: 1 }, inner)).toBe(true)
    expect(core.pointInPolygon({ x: 4, y: 4 }, inner)).toBe(false)
    expect(core.pointInPolygon({ x: 2, y: 1 }, inner)).toBe(false) // on the bridge: inside its slit
  })

  test('a level with a free-standing screen, flush lines and the new kinds validates clean', () => {
    expect(core.validate(ground)).toEqual([])
  })

  test("a building joined to nothing inside a face: deriveRooms keeps the face whole, validate warns 'island-in-room'", () => {
    const loose = { ...ground, walls: ground.walls.filter((w) => w.id !== 'bridge') }
    const r = core.deriveRooms(loose)
    expect(+r.find((x) => x.id === 'Lawn')!.areaSqm.toFixed(3)).toBe(90) // the lobby not cut out
    const issues = core.validate(loose)
    expect(issues.map((i) => [i.level, i.code, i.ids[0]])).toEqual([['warning', 'island-in-room', 'Lawn']])
    expect(issues[0].ids.slice(1).sort()).toEqual(['lob1', 'lob2', 'lob3', 'lob4'])
  })

  test('isOutdoor: exactly the eight zone kinds', () => {
    const all: RoomKind[] = ['bed', 'living', 'dining', 'kitchen', 'bath', 'balcony', 'study', 'closet', 'utility', 'shaft', 'other', 'lobby', 'gym', 'community', 'guard', 'lawn', 'paving', 'driveway', 'parking', 'deck', 'pool', 'planter', 'play']
    expect(all.filter(core.isOutdoor)).toEqual(['lawn', 'paving', 'driveway', 'parking', 'deck', 'pool', 'planter', 'play'])
  })
})

describe('free-standing walls', () => {
  const u = typeA as unknown as Unit
  const living = core.deriveRooms(u).sort((p, q) => q.areaSqm - p.areaSqm)[0]
  const c = living.centroid
  const withScreen = (standsAlone?: true): Unit => ({
    ...u,
    vertices: [...u.vertices, { id: 'f1', x: c.x - 0.6, y: c.y }, { id: 'f2', x: c.x + 0.6, y: c.y }],
    walls: [...u.walls, { id: 'fin', a: 'f1', b: 'f2', thicknessM: 0.1, heightM: 1.8, openings: [], ...(standsAlone ? { standsAlone } : {}) }],
  })

  test('a loose wall in type-A: two dangling ends; kept standing alone: no issue at all, the rooms unchanged', () => {
    expect(core.validate(withScreen()).filter((i) => i.code === 'dangling-vertex').map((i) => i.ids[0]).sort()).toEqual(['f1', 'f2'])
    expect(core.validate(withScreen(true))).toEqual(core.validate(u))
    expect(core.deriveRooms(withScreen(true)).map((r) => [r.id, r.areaSqm])).toEqual(core.deriveRooms(u).map((r) => [r.id, r.areaSqm]))
  })

  test('a stray corner (no wall at all) is still an error', () => {
    const stray = { ...withScreen(true), vertices: [...withScreen(true).vertices, { id: 'lost', x: 0, y: 0 }] }
    expect(core.validate(stray).filter((i) => i.code === 'dangling-vertex')).toMatchObject([{ level: 'error', ids: ['lost'] }])
  })
})

describe('floor levels and ramps', () => {
  const rooms = core.deriveRooms(ground)

  test('deriveRooms carries levelM / slope from the label; absent stays absent', () => {
    const lobby = rooms.find((r) => r.id === 'Lobby')!
    expect(lobby.levelM).toBe(1.067)
    expect(rooms.find((r) => r.id === 'Ramp')!.slope).toEqual({ toLevelM: -1, dirDeg: 180 })
    expect('levelM' in rooms.find((r) => r.id === 'Lawn')!).toBe(false)
    expect(core.deriveRooms(typeA as unknown as Unit).some((r) => 'levelM' in r || 'slope' in r)).toBe(false)
  })

  test('floorLevelAt: a flat level, a 1:8 ramp (0 → −1 m over 8 m, run along +y), 0 outside every face', () => {
    expect(core.floorLevelAt(ground, 4, 4)).toBe(1.067) // the lobby
    expect(core.floorLevelAt(ground, 1, 1)).toBe(0) // the lawn
    expect(core.floorLevelAt(ground, 10.5, 1)).toBe(0) // the driveway before the ramp
    expect(core.floorLevelAt(ground, 10.5, 2, rooms)).toBeCloseTo(0, 9)
    expect(core.floorLevelAt(ground, 10.5, 6, rooms)).toBeCloseTo(-0.5, 9)
    expect(core.floorLevelAt(ground, 10.5, 10 - 1e-6, rooms)).toBeCloseTo(-1, 5)
    expect(core.floorLevelAt(ground, 20, 20)).toBe(0)
    // the run's direction only: the same across the ramp's width
    expect(core.floorLevelAt(ground, 9.2, 4, rooms)).toBeCloseTo(core.floorLevelAt(ground, 11.8, 4, rooms), 9)
  })

  test('roomLevelAt: a ramp running east (dirDeg 90), 1:8 up; mirrored, it runs west (dirDeg 270) with the same levels', () => {
    const ramp: Unit = {
      ...ground,
      vertices: [['a', 0, 0], ['b', 8, 0], ['c', 8, 3], ['d', 0, 3]].map(([id, x, y]) => ({ id: id as string, x: x as number, y: y as number })),
      walls: [wall('ab', 'a', 'b', 1.1), wall('bc', 'b', 'c', 0), wall('cd', 'c', 'd', 1.1), wall('da', 'd', 'a', 0)],
      roomLabels: [label('R', 'driveway', 4, 1.5, { levelM: 0.2, slope: { toLevelM: 1.2, dirDeg: 90 } })],
    }
    const r = core.deriveRooms(ramp)[0]
    expect(core.roomLevelAt(r, ramp, 0, 1.5)).toBeCloseTo(0.2, 9)
    expect(core.roomLevelAt(r, ramp, 2, 0.5)).toBeCloseTo(0.45, 9)
    expect(core.roomLevelAt(r, ramp, 8, 2.5)).toBeCloseTo(1.2, 9)
    expect(core.roomLevelAt(r, ramp, -5, 1)).toBeCloseTo(0.2, 9) // clamped
    const m = core.mirrorUnit(ramp, 0)
    expect(m.roomLabels[0]).toMatchObject({ levelM: 0.2, slope: { toLevelM: 1.2, dirDeg: 270 } })
    for (const [x, y] of [[0.01, 1.5], [2, 0.5], [6, 2], [7.99, 2.5]]) expect(core.floorLevelAt(m, -x, y)).toBeCloseTo(core.floorLevelAt(ramp, x, y), 9)
  })

  test('the whole ground level mirrored: same zones, same levels at reflected points, a screen still standing alone', () => {
    const m = core.mirrorUnit(ground, 6)
    expect(core.validate(m)).toEqual([])
    expect(m.walls.find((w) => w.id === 'screen-m')!.standsAlone).toBe(true)
    expect(m.walls.find((w) => w.id === 'bridge-m')!.heightM).toBe(0)
    for (const [x, y] of [[4, 4], [1, 1], [10.5, 6], [10.5, 9]]) expect(core.floorLevelAt(m, 12 - x, y)).toBeCloseTo(core.floorLevelAt(ground, x, y), 9)
  })
})
