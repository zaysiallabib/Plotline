/**
 * The hand-authored common levels of the Sheltech tower (session 19): Ground floor, Basement 1, Basement 2 and Rooftop
 * (src/data/units/sheltech-{ground,b1,b2,roof}.json, read off `Demo drawings/Sheltech/`), in the flats' building frame.
 */
import { describe, expect, test } from 'vitest'
import b1 from '../data/units/sheltech-b1.json'
import b2 from '../data/units/sheltech-b2.json'
import roof from '../data/units/sheltech-roof.json'
import sheltechA from '../data/units/sheltech-a.json'
import sheltechB from '../data/units/sheltech-b.json'
import founderA from '../data/fixtures/founder-sheltech-a-draft.json'
import * as core from './index'
import type { Unit } from './index'

const LEVELS: Record<string, Unit> = {
  b1: b1 as unknown as Unit,
  b2: b2 as unknown as Unit,
  roof: roof as unknown as Unit,
}

/** every face each level must have (as printed on its sheet), by name → kind */
const NAMES: Record<string, Record<string, core.RoomKind>> = {
  ground: {
    "Driver's waiting": 'guard',
    Toilet: 'bath',
    'EME room': 'utility',
    'Meter room': 'utility',
    Lobby: 'lobby',
    Reception: 'lobby',
    'Guard room': 'guard',
    Lift: 'other',
    Stair: 'other',
    Driveway: 'driveway',
    '1:8 ramp': 'driveway',
    '1:20 ramp': 'paving',
    Pavers: 'paving',
    Lawn: 'lawn',
  },
  b1: { Lobby: 'lobby', Lift: 'other', Stair: 'other', Driveway: 'driveway', '1:8 ramp (north)': 'driveway', '1:8 ramp (west)': 'driveway', '1:8 ramp (east)': 'driveway', ...bays(1, 11) },
  b2: { Lobby: 'lobby', 'Lift pit': 'other', Stair: 'other', Driveway: 'driveway', '1:8 ramp (north)': 'driveway', '1:8 ramp (west)': 'driveway', UGWR: 'pool', 'Pump room': 'utility', ...bays(12, 24) },
  roof: {
    Lobby: 'lobby',
    'Lift mech. room': 'utility',
    'Stair case': 'other',
    'Deck (west)': 'deck',
    'Deck (east)': 'deck',
    'Void (north)': 'shaft',
    'Void (south)': 'shaft',
    'Planter (east)': 'planter',
    'Sunshade / planter (south)': 'planter',
  },
}
function bays(from: number, to: number): Record<string, core.RoomKind> {
  return Object.fromEntries([...Array(to - from + 1)].map((_, i) => [String(from + i), 'parking' as core.RoomKind]))
}

/** Length of the chord of `poly` through p along x (or y). */
function chord(poly: core.Pt[], p: core.Pt, axis: 'x' | 'y'): number {
  const [u, v] = axis === 'x' ? (['x', 'y'] as const) : (['y', 'x'] as const)
  const hits: number[] = []
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]
    if ((a[v] - p[v]) * (b[v] - p[v]) < 0) hits.push(a[u] + ((p[v] - a[v]) / (b[v] - a[v])) * (b[u] - a[u]))
  })
  return Math.min(...hits.filter((h) => h > p[u])) - Math.max(...hits.filter((h) => h < p[u]))
}

/** connected components of the graph's walls (free-standing walls left out: they may stand on their own) */
function components(u: Unit): number {
  const parent = new Map(u.vertices.map((v) => [v.id, v.id]))
  const find = (a: string): string => (parent.get(a) === a ? a : find(parent.get(a)!))
  for (const w of u.walls) if (!w.standsAlone) parent.set(find(w.a), find(w.b))
  const used = new Set(u.walls.filter((w) => !w.standsAlone).flatMap((w) => [w.a, w.b]))
  return new Set([...used].map(find)).size
}

/** the founder's Level-2 trace of Type A put into the building frame (its own plan-image fit → Type A's) */
function founderPillars(): core.Pillar[] {
  const f = founderA.planImage, a = sheltechA.planImage
  return (founderA.pillars as core.Pillar[]).map((p) => ({
    ...p,
    x: (f.originPx.x + p.x * f.pxPerM - a.originPx.x) / a.pxPerM,
    y: (f.originPx.y + p.y * f.pxPerM - a.originPx.y) / a.pxPerM,
  }))
}

for (const [key, u] of Object.entries(LEVELS)) {
  describe(`sheltech-${key}.json`, () => {
    const rooms = core.deriveRooms(u)

    test('validates clean: no errors, no warnings (every face labelled, no island, no stray end)', () => {
      expect(core.validate(u)).toEqual([])
    })

    test('every face is a named room or zone, each label owns one; one connected graph', () => {
      expect(rooms.length).toBe(u.roomLabels.length)
      expect(new Set(rooms.map((r) => r.id))).toEqual(new Set(u.roomLabels.map((l) => l.id)))
      expect(components(u)).toBe(1)
    })

    test('the names printed on the sheet are there, with their kinds', () => {
      for (const [name, kind] of Object.entries(NAMES[key])) {
        const r = rooms.find((x) => x.name === name)
        expect(r, name).toBeDefined()
        expect(r!.kind, name).toBe(kind)
      }
    })

    test('printed sizes match the clear size through the label within 2 cm', () => {
      for (const l of u.roomLabels.filter((x) => x.printedSize)) {
        const inner = core.roomInnerPolygon(rooms.find((r) => r.id === l.id)!, u)
        const [pw, ph] = l.printedSize!.split('×').map((t) => core.parseLength(t.trim())!)
        expect(Math.abs(chord(inner, l, 'x') - pw), `${l.name} width`).toBeLessThan(0.02)
        expect(Math.abs(chord(inner, l, 'y') - ph), `${l.name} depth`).toBeLessThan(0.02)
      }
    })

    test('openings fit their walls; none on a flush line', () => {
      for (const w of u.walls) {
        const f = core.wallFrame(w, u.vertices)
        if (w.heightM === 0) expect(w.openings, w.id).toEqual([])
        for (const o of w.openings) {
          expect(o.sillM + o.heightM, o.id).toBeLessThanOrEqual(w.heightM + 1e-9)
          expect(o.offsetM + o.widthM, o.id).toBeLessThanOrEqual(f.lengthM + 1e-9)
        }
      }
    })

    test('its columns are the building columns: the same on every level, on the founder’s Type A columns (≤ 5 cm)', () => {
      const ref = founderPillars()
      for (const p of u.pillars ?? []) {
        for (const other of Object.values(LEVELS)) {
          const q = other.pillars?.find((x) => x.id === p.id)
          if (q) expect(Math.hypot(q.x - p.x, q.y - p.y), p.id).toBeLessThan(0.01)
        }
        const near = ref.find((r) => Math.hypot(r.x - p.x, r.y - p.y) < 0.3)
        if (near) expect(Math.hypot(near.x - p.x, near.y - p.y), p.id).toBeLessThan(0.05)
      }
    })
  })
}

/** p lies on the polygon's outline (within 5 mm) */
const onBoundary = (p: core.Pt, poly: core.Pt[]) =>
  poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length]
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2)))
    return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)) < 0.005
  })

describe('the common levels sit on the flats’ core', () => {
  const B = sheltechB as unknown as Unit
  const lifts = core.deriveRooms(B).find((r) => r.id === 'r_lifts')!
  const shaft = core.roomPolygon(lifts, B)
  const xs = shaft.map((p) => p.x), ys = shaft.map((p) => p.y)

  test.each(Object.keys(LEVELS).filter((k) => k !== 'roof'))('%s: its lift face is Type B’s lift shaft', (key) => {
    const u = LEVELS[key]
    const r = core.deriveRooms(u).find((x) => x.name === 'Lift' || x.name === 'Lift pit')!
    const poly = core.roomPolygon(r, u)
    expect(Math.abs(core.signedArea(poly) - core.signedArea(shaft))).toBeLessThan(0.01)
    for (const p of shaft) expect(onBoundary(p, poly), `${p.x},${p.y}`).toBe(true)
    for (const p of poly) expect(onBoundary(p, shaft), `${p.x},${p.y}`).toBe(true)
  })

  test('roof: the lift machine room stands on the shaft’s side walls', () => {
    const u = LEVELS.roof
    const r = core.deriveRooms(u).find((x) => x.name === 'Lift mech. room')!
    const px = core.roomPolygon(r, u).map((p) => p.x)
    expect(Math.min(...px)).toBeCloseTo(Math.min(...xs), 3)
    expect(Math.max(...px)).toBeCloseTo(Math.max(...xs), 3)
    expect(Math.min(...ys)).toBeLessThan(Math.min(...core.roomPolygon(r, u).map((p) => p.y)))
  })
})
