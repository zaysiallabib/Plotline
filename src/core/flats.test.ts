/** deriveFlats: rooms joined by doors are one flat, the core is in none, a pin moves a room (founder 2026-10-06). */
import { describe, expect, test } from 'vitest'
import * as core from './index'
import type { OpeningKind, RoomKind, RoomLabel, Unit, Wall } from './index'

/**
 * A floor of seven 4 m boxes in a row, west → east: flat A (bath, bed, living), the lift lobby, flat B (living, bed,
 * bath). `links[i]` is what the wall between box i and box i + 1 carries (null: a plain wall; 'zone': a zone line).
 */
const ROW: [string, RoomKind][] = [['A bath', 'bath'], ['A bed', 'bed'], ['A living', 'living'], ['Lift lobby', 'other'], ['B living', 'living'], ['B bed', 'bed'], ['B bath', 'bath']]
function floor(links: (OpeningKind | 'zone' | null)[] = ['door', 'door', 'door', 'door', 'door', 'door'], labels: Partial<RoomLabel>[] = []): Unit {
  const n = ROW.length
  const vertices = [...Array(n + 1)].flatMap((_, i) => [
    { id: `t${i}`, x: 4 * i, y: 0 },
    { id: `b${i}`, x: 4 * i, y: 4 },
  ])
  const wall = (id: string, a: string, b: string, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.127, heightM: 3, openings: [], ...extra })
  const walls = [
    ...[...Array(n)].flatMap((_, i) => [wall(`top${i}`, `t${i}`, `t${i + 1}`), wall(`bot${i}`, `b${i}`, `b${i + 1}`)]),
    wall('x0', 't0', 'b0'),
    wall(`x${n}`, `t${n}`, `b${n}`),
    ...links.map((k, i) =>
      wall(`x${i + 1}`, `t${i + 1}`, `b${i + 1}`, k === 'zone' ? { heightM: 0 } : k ? { openings: [{ id: `o${i + 1}`, kind: k, offsetM: 1.5, widthM: 0.9, heightM: 2.1, sillM: k === 'window' ? 0.9 : 0 }] } : {}),
    ),
  ]
  const roomLabels: RoomLabel[] = ROW.map(([name, kind], i) => ({ id: `r${i}`, name, kind, x: 4 * i + 2, y: 2, ...labels[i] }))
  return { id: 'floor', projectName: 'p', name: 'Type A', northDeg: 0, vertices, walls, roomLabels, furniture: [], finishSlots: [], areaSqft: 0 }
}
const flatsOf = (u: Unit) => core.deriveFlats(u, core.deriveRooms(u)).map((f) => [f.name, f.roomIds])

describe('deriveFlats', () => {
  test('two flats either side of the lobby; the lobby is in none', () => {
    const u = floor()
    expect(flatsOf(u)).toEqual([
      ['Flat 1', ['r0', 'r1', 'r2']],
      ['Flat 2', ['r4', 'r5', 'r6']],
    ])
    const f = core.deriveFlats(u, core.deriveRooms(u))[0]
    expect(f.key).toBe('r0')
    expect(f.areaSqm).toBeCloseTo(48)
    expect(f.printedSqft).toBeUndefined()
  })

  test('a slider joins, a zone line joins, a window does not; a lone room is in no flat', () => {
    expect(flatsOf(floor(['slider', 'zone', 'door', 'passage', 'door', 'door']))[0]).toEqual(['Flat 1', ['r0', 'r1', 'r2']])
    // the bath behind a window only: loose; a window between bed and living: bath + bed stay a flat, the living alone is loose
    expect(flatsOf(floor(['window', 'door', 'door', 'door', 'door', 'door']))).toEqual([['Flat 1', ['r1', 'r2']], ['Flat 2', ['r4', 'r5', 'r6']]])
    expect(flatsOf(floor(['door', 'window', 'door', 'door', 'door', 'door']))).toEqual([['Flat 1', ['r0', 'r1']], ['Flat 2', ['r4', 'r5', 'r6']]])
    // a bedroom alone (its door missing) is no flat of its own
    expect(flatsOf(floor(['window', 'window', 'door', 'door', 'door', 'door']))).toEqual([['Flat 1', ['r4', 'r5', 'r6']]])
  })

  test('the core as the levels name it: lobby / stair / lift rooms of kind other, shafts, common and outdoor kinds', () => {
    for (const [name, kind] of [['Stair', 'other'], ['Lifts', 'other'], ['Hoistway 1', 'other'], ['Lobby', 'lobby'], ['Duct', 'shaft'], ['Gym', 'gym'], ['Deck', 'deck']] as const)
      expect(flatsOf(floor(undefined, [{}, {}, {}, { name, kind }])).length, name).toBe(2)
    // a lobby not named as one joins both flats into one — "Not a flat" ('') on it splits them again
    expect(flatsOf(floor(undefined, [{}, {}, {}, { name: 'Hall' }]))).toEqual([['Flat 1', ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']]])
    expect(flatsOf(floor(undefined, [{}, {}, {}, { name: 'Hall', flat: '' }])).length).toBe(2)
  })

  test('a pin moves its room to the named flat whatever its doors; a new name makes a flat', () => {
    expect(flatsOf(floor(undefined, [{ flat: 'Flat 2' }]))).toEqual([
      ['Flat 1', ['r1', 'r2']],
      ['Flat 2', ['r0', 'r4', 'r5', 'r6']],
    ])
    expect(flatsOf(floor(undefined, [{}, {}, {}, {}, {}, {}, { flat: 'Flat 3' }]))).toEqual([
      ['Flat 1', ['r0', 'r1', 'r2']],
      ['Flat 2', ['r4', 'r5']],
      ['Flat 3', ['r6']],
    ])
    expect(flatsOf(floor(undefined, [{ flat: '' }]))[0]).toEqual(['Flat 1', ['r1', 'r2']])
  })

  test('a "TYPE-B ±2,736 SFT" label inside a flat names it and gives its printed area; it names no room, first or last', () => {
    const u = floor()
    u.roomLabels.unshift({ id: 'tb', name: 'TYPE-B ±2,736 SFT', kind: 'other', x: 17, y: 1 })
    const rooms = core.deriveRooms(u)
    expect(rooms.find((r) => r.id === 'r4')?.name).toBe('B living')
    expect(rooms.some((r) => r.id === 'tb')).toBe(false)
    expect(core.validate(u)).toEqual([])
    const fs = core.deriveFlats(u, rooms)
    expect(fs.map((f) => [f.name, f.printedSqft])).toEqual([['Flat 1', undefined], ['Type B', 2736]])
    // in an unnamed room it still names no face; outside every room it is the usual stray label
    expect(core.flatTypeOf({ name: 'Type c', kind: 'other' })).toBe('Type C')
    expect(core.flatTypeOf({ name: 'Type A bed', kind: 'bed' })).toBeNull()
    // the sheet's own word: Foysal Smart Garden prints 'Unit A:1375 Sft' (bug hunt 2026-10-18: it came out 'Flat 1'); a room word is not one
    expect(core.flatTypeOf({ name: 'Unit A:1375 Sft', kind: 'other' })).toBe('Unit A')
    expect(core.flatTypeOf({ name: 'UNIT-B', kind: 'other' })).toBe('Unit B')
    expect(core.flatTypeOf({ name: 'AC unit', kind: 'other' })).toBeNull()
    expect(core.flatTypeOf({ name: 'Community', kind: 'other' })).toBeNull()
    // two units sold joined are one flat (Sheltech Banani Level 7, s27 flats 2); a word after "and" is no unit
    expect(core.flatTypeOf({ name: 'UNIT A & B 3925 SFT', kind: 'other' })).toBe('Unit A & B')
    expect(core.flatTypeOf({ name: 'Type A and Bed', kind: 'other' })).toBe('Type A')
    u.roomLabels[0] = { ...u.roomLabels[0], x: 40 }
    expect(core.validate(u).map((i) => i.code)).toEqual(['label-outside-any-room'])
  })

  test('pins and the type label come along through mirrorUnit, and keep their rooms', () => {
    const u = floor(undefined, [{ flat: 'Type B' }])
    u.roomLabels.push({ id: 'tb', name: 'Type B', kind: 'other', x: 17, y: 1 })
    const mu = core.mirrorUnit(u, 0)
    expect(mu.roomLabels[0].flat).toBe('Type B')
    const rooms = (x: Unit) => core.deriveFlats(x, core.deriveRooms(x)).map((f) => [f.name, f.roomIds.map((id) => id.replace(/-m$/, '')).sort()] as const)
    expect(rooms(u)).toEqual([['Flat 1', ['r1', 'r2']], ['Type B', ['r0', 'r4', 'r5', 'r6']]])
    // the reflected floor: the same two groups, now Type B to the west
    expect(rooms(mu)).toEqual([['Type B', ['r0', 'r4', 'r5', 'r6']], ['Flat 1', ['r1', 'r2']]])
  })

  test('Level 4, one flat traced: every room pinned to its name is ONE flat, even where a door came out as a plain wall', () => {
    // every door missing (the door walk alone: seven loose rooms, no flat); flat A pinned as Auto-trace pins it: one flat
    const pins = ['Flat 1', 'Flat 1', 'Flat 1'].map((flat) => ({ flat }))
    expect(flatsOf(floor([null, null, null, null, null, null]))).toEqual([])
    expect(flatsOf(floor([null, null, null, null, null, null], pins))).toEqual([['Flat 1', ['r0', 'r1', 'r2']]])
  })

  test('Level 4, the whole floor: each flat pinned to its name, the lobby to none; a pinned flat takes its printed area from its type label; the flats come west → east whatever the room order', () => {
    const u = floor([null, null, 'door', 'door', null, null], [{ flat: 'Type A' }, { flat: 'Type A' }, { flat: 'Type A' }, {}, { flat: 'Flat 1' }, { flat: 'Flat 1' }, { flat: 'Flat 1' }])
    u.roomLabels.push({ id: 'ta', name: 'Type A ±2736 sft', kind: 'other', x: 9, y: 1 })
    const rooms = core.deriveRooms(u)
    const fs = core.deriveFlats(u, rooms)
    expect(fs.map((f) => [f.name, f.roomIds, f.printedSqft])).toEqual([
      ['Type A', ['r0', 'r1', 'r2'], 2736],
      ['Flat 1', ['r4', 'r5', 'r6'], undefined],
    ])
    expect(core.deriveFlats(u, [...rooms].reverse()).map((f) => f.name)).toEqual(['Type A', 'Flat 1'])
  })

  test('Level 4: a room added later beside a pinned flat (no pin of its own) joins it by its door; one whose doors lead into two pinned flats stays loose', () => {
    // r0 (the bath) unpinned, its door into pinned r1: joins Type A; the lobby (r3) is core, not loose
    const u = floor(undefined, [{ kind: 'balcony' }, { flat: 'Type A' }, { flat: 'Type A' }, {}, { flat: 'Type B' }, { flat: 'Type B' }, { flat: 'Type B' }])
    expect(flatsOf(u)).toEqual([
      ['Type A', ['r0', 'r1', 'r2']],
      ['Type B', ['r4', 'r5', 'r6']],
    ])
    // a space between the two flats with a door into each: in neither
    const v = floor(undefined, [{ flat: 'Type A' }, { flat: 'Type A' }, { flat: 'Type A' }, { name: 'Hall' }, { flat: 'Type B' }, { flat: 'Type B' }, { flat: 'Type B' }])
    expect(flatsOf(v)).toEqual([
      ['Type A', ['r0', 'r1', 'r2']],
      ['Type B', ['r4', 'r5', 'r6']],
    ])
  })

  test('the same unit gives the same flats, whatever order its rooms come in', () => {
    const u = floor()
    const rooms = core.deriveRooms(u)
    expect(core.deriveFlats(u, [...rooms].reverse()).map((f) => [f.name, [...f.roomIds].sort()])).toEqual(core.deriveFlats(u, rooms).map((f) => [f.name, [...f.roomIds].sort()]))
  })
})
