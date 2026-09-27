import { describe, expect, it, vi } from 'vitest'
import { deriveRooms } from '../core'
import type { FurniturePlacement, Opening, Unit, Wall } from '../core'
import { pieceQuad, resizePiece } from '../studio/furniture'
import { initialState, reducer, type StudioState } from '../studio/model'
import { dragTo, isStaff, layoutKey, pushStep, readLayout, saveLayout, surfaceOf, undoStep, type Steps } from './arrange'
import { shareUrl } from './share'

// resizeLimits is empty until the resize work fills it: one resizable asset for these tests
vi.mock('../furnish/kit', async (orig) => ({
  ...(await orig<typeof import('../furnish/kit')>()),
  resizeLimits: (id: string) => (id === 'wardrobe_2door' ? { min: { x: 0.8, y: 1.8, z: 0.5 }, max: { x: 2.4, y: 2.4, z: 0.65 } } : null),
}))

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
