import { describe, expect, it, vi } from 'vitest'
import { deriveRooms } from '../core'
import type { FurniturePlacement, Opening, Unit, Wall } from '../core'
import { movePiece, pieceQuad, resizePiece } from '../studio/furniture'
import { placementLabel } from '../furnish/kit'
import { initialState, reducer, type StudioState } from '../studio/model'
import { baseOf, dragTo, isStaff, layoutKey, pushStep, readLayout, saveLayout, surfaceOf, undoStep, type Steps } from './arrange'
import { shareUrl } from './share'
import typeA from '../data/units/type-a.json'
import sheltechA from '../data/units/sheltech-a.json'
import { chairSpots, furnish } from '../furnish/presets'

// test limits for the wardrobe, the real ones for the dining table, nothing else resizes
vi.mock('../furnish/kit', async (orig) => {
  const kit = await orig<typeof import('../furnish/kit')>()
  return {
    ...kit,
    resizeLimits: (id: string) => (id === 'wardrobe_2door' ? { min: { x: 0.8, y: 1.8, z: 0.5 }, max: { x: 2.4, y: 2.4, z: 0.65 } } : id === 'dining_table' ? kit.resizeLimits(id) : null),
  }
})

const memStore = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m }
}

/**
 * The Studio's furniture fixture: 8 × 5 m, 0.2 m walls, partition at x = 5: Living (inner 0.1..4.9) | Bed (inner
 * 5.1..7.9), y inner 0.1..4.9; the entrance on the left wall at y 0.5..1.5, the partition door at y 3.0..3.8.
 */
const V = [[0, 0], [5, 0], [8, 0], [8, 5], [5, 5], [0, 5]].map(([x, y], i) => ({ id: `v${i}`, x, y }))
const wall = (id: string, a: number, b: number, openings: Opening[] = []): Wall => ({ id, a: `v${a}`, b: `v${b}`, thicknessM: 0.2, heightM: 3, openings })
const door = (id: string, offsetM: number, widthM: number): Opening => ({ id, kind: 'door', offsetM, widthM, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'in' })
const piece = (id: string, assetId: string, roomId: string, x: number, y: number, rotationDeg = 0): FurniturePlacement => ({ id, assetId, roomId, x, y, rotationDeg })
const unit: Unit = {
  ...initialState().unit,
  id: 'u1',
  vertices: V,
  walls: [wall('wL', 5, 0, [door('entry', 3.5, 1)]), wall('wT1', 0, 1), wall('wT2', 1, 2), wall('wR', 2, 3), wall('wB2', 3, 4), wall('wB1', 4, 5), wall('wP', 1, 4, [door('d', 3, 0.8)])],
  roomLabels: [
    { id: 'A', name: 'Living', kind: 'living', x: 2.5, y: 2.5 },
    { id: 'B', name: 'Bed', kind: 'bed', x: 6.5, y: 2.5 },
  ],
  furniture: [
    piece('sofa', 'sofa_3seat', 'A', 2.5, 4.39, 180),
    piece('cush', 'cushions_plain', 'A', 3.05, 4.27, 180), // on the sofa
    piece('tv', 'tv_55_wall', 'A', 2.5, 0.135), // on the top wall, facing down into the room
    piece('fan', 'ceiling_fan', 'A', 2.5, 2.5),
    piece('robe', 'wardrobe_2door', 'B', 6.5, 0.45), // 1.2 × 0.6, back 5 cm off the top wall
    piece('side', 'bedside_oak', 'B', 7.0, 0.95), // 0.5 × 0.4, touching the wardrobe's front
  ],
}
const rooms = deriveRooms(unit)
const ps = unit.furniture
const at = (f: FurniturePlacement[], id: string) => f.find((p) => p.id === id)!

describe('arrange: staff only, never on a buyer link', () => {
  it('staff = ?staff=1 (remembered) or the flag the Studio sets', () => {
    const s = memStore()
    expect(isStaff('', s)).toBe(false)
    expect(isStaff('?staff=0', s)).toBe(false)
    expect(isStaff('?c=abc&staff=1', s)).toBe(true)
    expect(isStaff('', s)).toBe(true) // remembered in this browser
  })

  it('the Share link keeps the route, the picked floor and the finishes only', () => {
    const loc = { origin: 'https://plotline.test', pathname: '/u/type-a', search: '?staff=1&floor=5&c=old&quality=low' }
    const url = shareUrl(loc, 5, { s1: 'o2' })
    expect(url).not.toMatch(/staff/)
    expect(url).toMatch(/^https:\/\/plotline\.test\/u\/type-a\?floor=5&c=[\w-]+$/)
    expect(shareUrl({ ...loc, search: '?staff=1' }, 2, {})).not.toMatch(/staff|floor/)
  })
})

describe('arrange: layout saved in the browser, undo', () => {
  it('round-trips the layout; the unit’s own layout or none removes the key; garbage reads as none', () => {
    const s = memStore()
    const moved = ps.map((p) => (p.id === 'fan' ? { ...p, x: 3 } : p))
    saveLayout('u1', moved, ps, s)
    expect(readLayout('u1', s)).toEqual(moved)
    saveLayout('u1', ps, ps, s)
    expect(s.m.has(layoutKey('u1'))).toBe(false)
    saveLayout('u1', moved, undefined, s)
    saveLayout('u1', [], undefined, s) // the Studio's "Reset all"
    expect(readLayout('u1', s)).toBeNull()
    for (const junk of ['{', '{"a":1}', '[]', '[{"id":"x"}]']) {
      s.setItem(layoutKey('u1'), junk)
      expect(readLayout('u1', s)).toBeNull()
    }
  })

  it('undo walks back one committed step at a time, 50 deep', () => {
    let h: Steps = { pieces: ps, past: [] }
    const a = [{ ...ps[0], x: 1 }]
    const b = [{ ...ps[0], x: 2 }]
    h = pushStep(pushStep(h, a), b)
    expect(h.pieces).toBe(b)
    h = undoStep(h)
    expect(h.pieces).toBe(a)
    h = undoStep(undoStep(h))
    expect(h).toEqual({ pieces: ps, past: [] })
    for (let i = 0; i < 60; i++) h = pushStep(h, [{ ...ps[0], x: i }])
    expect(h.past).toHaveLength(50)
  })
})

describe('arrange: dragging in the 3D view runs the Studio rules', () => {
  it('knows which surface a piece slides on', () => {
    expect(['sofa', 'tv', 'fan', 'robe'].map((id) => surfaceOf(at(ps, id)))).toEqual(['floor', 'wall', 'ceiling', 'floor'])
    expect(surfaceOf(piece('ac', 'ac_split', 'A', 0, 0))).toBe('wall')
  })

  it('a wall piece hops to the wall under the pointer: back to it, front into the room, 1 ft steps along it', () => {
    const m = dragTo(unit, rooms, ps, 'tv', { at: null, wall: { p: { x: 0.1, y: 2.5 }, n: { x: 1, y: 0 } } })!
    expect(m.error).toBeNull()
    expect(m.piece).toMatchObject({ x: expect.closeTo(0.1 + 0.005 + 0.03, 6), y: expect.closeTo(8 * 0.3048, 6), rotationDeg: 270, roomId: 'A' })
    expect(dragTo(unit, rooms, ps, 'tv', { at: { x: 2, y: 2 }, wall: null })).toBeNull() // no wall under the pointer
  })

  it('grabbing what rests on a piece picks up the piece (cushions → the sofa), moved by the pointer’s travel', () => {
    expect(baseOf(ps, 'cush')?.id).toBe('sofa')
    expect(baseOf(ps, 'tv')?.id).toBe('tv') // wall-hung: itself
    const cush = at(ps, 'cush')
    const m = dragTo(unit, rooms, ps, 'cush', { at: { x: cush.x - 0.5, y: cush.y }, wall: null })!
    expect(m.error).toBeNull()
    expect(m.ids).toEqual(['sofa', 'cush'])
    expect(m.piece.x).toBeCloseTo(2.5 - 0.5, 0) // on the grid
    expect(at(m.furniture, 'cush').x - cush.x).toBeCloseTo(m.piece.x - 2.5, 9)
  })

  it('drops follow the Studio rules: the TV unit turns its back to the east wall, a veranda chair stops at the slider strip', () => {
    const a = typeA as unknown as Unit
    const ra = deriveRooms(a)
    const pa = furnish(a, ra).filter((p) => !['r_living:modern_arm_chair_01:1', 'r_living:potted_plant_01:1'].includes(p.id))
    const tv = pa.find((p) => p.id === 'r_living:tv_55:1')!
    expect(dragTo(a, ra, pa, tv.id, { at: { x: 13.0, y: 6.4 }, wall: null })!.piece).toMatchObject({ id: 'r_living:modern_wooden_cabinet:1', rotationDeg: 90 })
    const s = sheltechA as unknown as Unit
    const rs = deriveRooms(s)
    const ps2 = furnish(s, rs)
    const chair = ps2.find((p) => p.roomId === rs.find((r) => r.name === 'Veranda 1')!.id && /chair/.test(p.assetId))!
    expect(dragTo(s, rs, ps2, chair.id, { at: { x: chair.x, y: chair.y - 0.3048 }, wall: null })!.error).toBeNull()
  })

  it('floor and ceiling pieces slide on their plane; a refused spot says why', () => {
    const fan = dragTo(unit, rooms, ps, 'fan', { at: { x: 1.9, y: 3.1 }, wall: null })!
    expect(fan.error).toBeNull()
    expect(fan.piece.roomId).toBe('A')
    expect(dragTo(unit, rooms, ps, 'side', { at: { x: 2.5, y: 4.3 }, wall: null })!.error).toBe('Overlaps the 3-seat fabric sofa')
    expect(dragTo(unit, rooms, ps, 'side', { at: { x: 0.6, y: 1.0 }, wall: null })!.error).toBe('Blocks the entrance')
  })
})

describe('resizePiece: 5 cm steps, kit limits, the same refusals', () => {
  const size = (m: ReturnType<typeof resizePiece>) => m!.piece.sizeM
  it('snaps to 5 cm and clamps to the limits; width grows both ways, depth grows out of the wall', () => {
    const w = resizePiece(unit, rooms, ps, 'robe', { x: 1.53, y: 2.2, z: 0.6 })!
    expect(w.error).toBeNull()
    expect(size(w)).toEqual({ x: expect.closeTo(1.55, 9), y: 2.2, z: expect.closeTo(0.6, 9) })
    expect(w.piece.x).toBeCloseTo(6.5, 9)
    expect(size(resizePiece(unit, rooms, ps, 'robe', { x: 9, y: 1, z: 0.6 }))).toMatchObject({ x: 2.4, y: 1.8 })
    // a side handle (+x face) moves that face only
    const r = resizePiece(unit, rooms, ps, 'robe', { x: 1.5, y: 2.2, z: 0.6 }, { x: 1, z: 0 })!
    expect(Math.min(...pieceQuad(r.piece).map((p) => p.x))).toBeCloseTo(6.5 - 0.6, 6)
  })

  it('refuses what a move refuses (here the bedside in front); non-resizable pieces return null', () => {
    const d = resizePiece(unit, rooms, ps, 'robe', { x: 1.2, y: 2.2, z: 0.65 })!
    expect(d.piece.y).toBeCloseTo(0.475, 9) // the back stays 5 cm off the wall
    expect(d.error).toBe('Overlaps the bedside table')
    expect(resizePiece(unit, rooms, ps, 'side', { x: 1, y: 1, z: 1 })).toBeNull()
  })

  it('Studio: resize-piece commits one undo step, a refusal toasts and keeps the layout', () => {
    const s0: StudioState = { ...initialState(), tool: 'furniture', unit }
    const s = reducer(s0, { type: 'resize-piece', id: 'robe', sizeM: { x: 1.6, y: 2.0, z: 0.6 } })
    expect(at(s.unit.furniture, 'robe').sizeM).toEqual({ x: expect.closeTo(1.6, 9), y: 2, z: expect.closeTo(0.6, 9) })
    expect(s.history.past).toHaveLength(1)
    const bad = reducer(s0, { type: 'resize-piece', id: 'robe', sizeM: { x: 1.2, y: 2.2, z: 0.65 } })
    expect(bad.unit).toBe(s0.unit)
    expect(bad.toast?.text).toBe('Overlaps the bedside table')
  })
})

describe('a dining set: the table carries its chairs, a resized one re-lays them (presets\' chairSpots)', () => {
  // 1.6 × 0.9 table in the Living fixture, its 6 chairs laid as presets lay them
  const table = piece('table', 'dining_table', 'A', 2.3, 2.2)
  const set = [...ps, table, ...chairSpots(table, 0, { x: 1.6, z: 0.9 }, 6).map((s, i) => piece(`c${i + 1}`, 'dining_chair', 'A', s.c.x, s.c.y, s.rot))]
  const live = (f: FurniturePlacement[]) => f.filter((p) => p.assetId === 'dining_chair' && !p.removed)
  /** every chair touches an edge of the table (its back half-depth 0.27 m off it) and faces it */
  const seated = (f: FurniturePlacement[], t: FurniturePlacement) => {
    const q = pieceQuad(t)
    for (const c of live(f)) {
      const d = Math.min(...q.map((a, i) => segDist(c, a, q[(i + 1) % 4])))
      expect(d, c.id).toBeCloseTo(0.27, 6)
    }
  }

  it('moving or turning the table takes its chairs along (a refused chair refuses the set)', () => {
    const m = movePiece(unit, rooms, set, 'table', { x: 2.6, y: 2.2 }, 0)!
    expect(m.error).toBeNull()
    expect(m.ids).toEqual(['table', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    seated(m.furniture, m.piece)
    const r = movePiece(unit, rooms, set, 'table', table, 90, false)!
    expect(r.error).toBeNull()
    // sides faced 0 / 180, heads 270 / 90: all a quarter turn on
    expect(live(r.furniture).map((c) => c.rotationDeg).sort((a, b) => a - b)).toEqual([0, 90, 90, 180, 270, 270])
    seated(r.furniture, r.piece)
    expect(movePiece(unit, rooms, set, 'table', { x: 2.3, y: 3.1 }, 0)!.error).toBe('A chair overlaps the 3-seat fabric sofa')
  })

  it('a longer table gains chairs, a shorter one drops them as tombstones; ids stay; the label follows', () => {
    const g = resizePiece(unit, rooms, set, 'table', { x: 2.2, y: 0.75, z: 0.9 })!
    expect(g.error).toBeNull()
    expect(live(g.furniture).map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'table:chair:1', 'table:chair:2']) // seats 8: two more
    seated(g.furniture, g.piece)
    expect(placementLabel(g.piece)).toBe('Dining table, oak, 8 seats')
    const s = resizePiece(unit, rooms, g.furniture, 'table', { x: 0.9, y: 0.75, z: 0.9 })!
    expect(s.error).toBeNull()
    expect(live(s.furniture)).toHaveLength(2)
    expect(s.furniture.filter((p) => p.removed)).toHaveLength(6)
    seated(s.furniture, s.piece)
    // a deeper table keeps its six: the chairs step out with its edges
    const d = resizePiece(unit, rooms, set, 'table', { x: 1.6, y: 0.75, z: 1.1 })!
    expect(live(d.furniture).map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3', 'c4', 'c5', 'c6'])
    seated(d.furniture, d.piece)
  })

  it('Studio tool F resizes the set the same way (one shared function)', () => {
    const s0: StudioState = { ...initialState(), tool: 'furniture', unit: { ...unit, furniture: set } }
    const s = reducer(s0, { type: 'resize-piece', id: 'table', sizeM: { x: 2.2, y: 0.75, z: 0.9 } })
    expect(live(s.unit.furniture)).toHaveLength(8)
    expect(s.history.past).toHaveLength(1)
  })
})

/** Distance from p to segment ab. */
function segDist(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const [dx, dy] = [b.x - a.x, b.y - a.y]
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
