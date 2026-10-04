import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'vitest'
import { deriveRooms, isOutdoor, pointInPolygon, roomInnerPolygon, type FurniturePlacement, type Room, type RoomKind, type Unit } from '../core'
import { GROUND_SAMPLE } from '../data/fixtures/ground-sample'
import { kitAsset, objectKind } from './kit'
import { doorClearZones, footprint, furnish, quadsOverlap } from './presets'
import { parsePlanter, TRUNK_CLEAR } from './procedural.meta'

/** Every hand-authored level (session 19) plus the fixture: whatever has landed in src/data/units. */
const levels = [
  GROUND_SAMPLE,
  ...Object.values(import.meta.glob('../data/units/{sheltech,banani,dmd}-{ground,b1,b2,roof,l1,typical}.json', { eager: true, import: 'default' }) as Record<string, Unit>),
]
const NEW_KINDS: RoomKind[] = ['lawn', 'paving', 'driveway', 'parking', 'deck', 'pool', 'planter', 'play', 'lobby', 'gym', 'community', 'guard']
const quad = (p: FurniturePlacement) => {
  const s = kitAsset(p.assetId)!.sizeM
  const k = p.scale ?? 1
  return footprint(p, p.rotationDeg, { x: s.x * k, z: s.z * k })
}
const isTree = (p: FurniturePlacement) => kitAsset(p.assetId)!.category === 'rug' && objectKind(kitAsset(p.assetId)!) === 'plant' && !parsePlanter(p.assetId)

describe('presets for the levels: by kind and geometry (session 19)', () => {
  const all = levels.map((u) => {
    const rooms = deriveRooms(u)
    return { u, rooms, ps: furnish(u, rooms) }
  })
  const byKind = (k: RoomKind) => all.flatMap(({ rooms, ps }) => ps.filter((p) => rooms.find((r) => r.id === p.roomId)?.kind === k))

  test('every piece in a zone or common room stands inside its face, off the door zones (a tree: its trunk), and the layout is deterministic', () => {
    expect(levels.length).toBeGreaterThan(1)
    for (const { u, rooms, ps } of all) {
      expect(furnish(u, deriveRooms(u)), u.id).toEqual(ps)
      for (const p of ps) {
        const room = rooms.find((r) => r.id === p.roomId) as Room
        if (!NEW_KINDS.includes(room.kind)) continue
        const inner = roomInnerPolygon(room, u)
        const bed = parsePlanter(p.assetId)
        const a = kitAsset(p.assetId)!
        if (!bed) for (const c of quad(p)) expect(pointInPolygon(c, inner), `${u.id} ${room.name}: ${p.id} outside`).toBe(true)
        if (a.mount === 'ceiling' || bed || a.mount === 'wall') continue
        const q = isTree(p) ? footprint(p, 0, { x: TRUNK_CLEAR, z: TRUNK_CLEAR }) : quad(p)
        for (const z of doorClearZones(room, u)) expect(quadsOverlap(q, z), `${u.id} ${room.name}: ${p.id} in a door zone`).toBe(false)
      }
    }
  })

  test('driveways, parking bays, pools and ramps get nothing; no zone gets a ceiling light or an AC', () => {
    for (const { rooms, ps } of all)
      for (const r of rooms) {
        const mine = ps.filter((p) => p.roomId === r.id)
        if (['driveway', 'parking', 'pool'].includes(r.kind) || (r.slope && isOutdoor(r.kind))) expect(mine, r.name).toEqual([])
        if (isOutdoor(r.kind)) expect(mine.filter((p) => ['ceiling_light', 'ceiling_light_large', 'ac_split'].includes(p.assetId)), r.name).toEqual([])
      }
  })

  test('each kind gets what it is for, on the real levels', () => {
    const ids = (k: RoomKind) => new Set(byKind(k).map((p) => p.assetId))
    expect([...ids('lawn')].some((id) => id.startsWith('tree_'))).toBe(true)
    expect(ids('lawn').has('shrub_round')).toBe(true)
    expect(ids('planter').size).toBeGreaterThan(0)
    expect(ids('deck').has('lounger') || ids('deck').has('outdoor_table_chair_set_01')).toBe(true)
    expect(['swing_frame', 'slide', 'seesaw'].every((id) => ids('play').has(id))).toBe(true)
    expect(ids('lobby').has('reception_desk')).toBe(true)
    expect(ids('gym').has('treadmill') && ids('gym').has('mirror_panel')).toBe(true)
    expect(ids('community').has('dining_table')).toBe(true)
    expect(ids('guard').has('desk_oak')).toBe(true)
  })

  test('a lap pool gets loungers facing it from its deck; a squarish water feature does not', () => {
    for (const { u, rooms, ps } of all)
      for (const deck of rooms.filter((r) => r.kind === 'deck')) {
        const loungers = ps.filter((p) => p.roomId === deck.id && p.assetId === 'lounger')
        const pool = rooms.find((r) => r.kind === 'pool' && r.wallIds.some((id) => deck.wallIds.includes(id)))
        if (!loungers.length) continue
        expect(pool, `${u.id} ${deck.name}`).toBeDefined()
        // each lounger's front (feet) points toward the pool
        for (const l of loungers) {
          const t = (l.rotationDeg * Math.PI) / 180
          const f = { x: -Math.sin(t), y: Math.cos(t) }
          expect(f.x * (pool!.centroid.x - l.x) + f.y * (pool!.centroid.y - l.y), l.id).toBeGreaterThan(0)
        }
      }
  })

  test('the same zone traced anywhere furnishes the same: a lawn moved and relabelled keeps its layout, shifted', () => {
    const dx = 37.5
    const moved: Unit = { ...GROUND_SAMPLE, id: 'elsewhere', vertices: GROUND_SAMPLE.vertices.map((v) => ({ ...v, x: v.x + dx })), roomLabels: GROUND_SAMPLE.roomLabels.map((l) => ({ ...l, name: `Zone ${l.id.length}`, x: l.x + dx })) }
    const a = furnish(GROUND_SAMPLE, deriveRooms(GROUND_SAMPLE))
    const b = furnish(moved, deriveRooms(moved))
    expect(b.map((p) => [p.assetId, +(p.x - dx).toFixed(6), +p.y.toFixed(6), p.rotationDeg, p.scale])).toEqual(a.map((p) => [p.assetId, +p.x.toFixed(6), +p.y.toFixed(6), p.rotationDeg, p.scale]))
  })
})

describe('the flats are unchanged but for a balcony planter set', () => {
  const flats = Object.values(import.meta.glob('../data/units/{type-a,type-b,type-c,sheltech-a,sheltech-b}.json', { eager: true, import: 'default' }) as Record<string, Unit>)
  /** FNV-1a of the preset layout without the planter boxes (session 19's only addition to a flat), locked on the pre-session-19 output. */
  const hash = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)
  const LOCK: Record<string, [number, number]> = {
    unit_sheltech_a_2736: [97, 1328157010],
    unit_sheltech_b_2736: [95, 26069719],
    unit_type_a_2703: [103, 2589603506],
    unit_type_b_1747: [82, 635063143],
    unit_type_c_2254: [107, 3523187327],
  }
  test.each(flats.map((u) => [u.id, u] as const))('%s: byte-same presets; planter boxes only on a balcony', (id, u) => {
    const rooms = deriveRooms(u)
    const ps = furnish(u, rooms)
    const rest = ps.filter((p) => !p.assetId.startsWith('planter_box_'))
    expect([rest.length, hash(JSON.stringify(rest))]).toEqual(LOCK[id])
    for (const p of ps.filter((p) => p.assetId.startsWith('planter_box_'))) expect(rooms.find((r) => r.id === p.roomId)!.kind).toBe('balcony')
  })
})

describe('the benchmark rule: no code that draws or furnishes knows a level, unit or project', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
  test('src/three and src/furnish name no level, unit or project (comments, tests and data imports aside)', () => {
    const NAMES = /\b(sheltech|banani|dmd|bti)\b|\btype-[abc]\b|ground-sample|unit_(type|sheltech)/i
    for (const f of [...files('src/three'), ...files('src/furnish')].filter((f) => /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f))) {
      const code = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
        .replace(/^import .* from '\.\.\/data\/.*$/gm, '')
      const hit = code.split('\n').find((l) => NAMES.test(l))
      expect(hit, f).toBeUndefined()
    }
  })
})
