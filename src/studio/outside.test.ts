import { describe, expect, it } from 'vitest'
import { deriveRooms, type Opening, type Unit, type Wall } from '../core'
import { initialState } from './model'
import { hangOn, layoutFor, liftPiece, movePiece, nearestOuterFace, outerFace, placePiece, resizePiece, type WallFace } from './furniture'

/**
 * A living room 6 × 4 m (walls 0.2 m) with a window in its top wall (x 2.0..3.5, sill 0.9, head 2.1) and a door in its left
 * wall; a balcony 2 × 1.5 m under its bottom-right corner behind a slider, its three parapets 1.0 m high.
 */
const V = [[0, 0], [6, 0], [6, 4], [4, 4], [0, 4], [6, 5.5], [4, 5.5]].map(([x, y], i) => ({ id: `v${i}`, x, y }))
const wall = (id: string, a: number, b: number, openings: Opening[] = [], heightM = 3): Wall => ({ id, a: `v${a}`, b: `v${b}`, thicknessM: 0.2, heightM, openings })
const unit: Unit = {
  ...initialState().unit,
  id: 'out',
  vertices: V,
  walls: [
    wall('wT', 0, 1, [{ id: 'win', kind: 'window', offsetM: 2, widthM: 1.5, heightM: 1.2, sillM: 0.9 }]),
    wall('wR', 1, 2),
    wall('wS', 2, 3, [{ id: 'sl', kind: 'slider', offsetM: 0.3, widthM: 1.4, heightM: 2.1, sillM: 0 }]),
    wall('wB', 3, 4),
    wall('wL', 4, 0, [{ id: 'door', kind: 'door', offsetM: 1.5, widthM: 1, heightM: 2.1, sillM: 0, hinge: 'a', swing: 'out' }]),
    wall('pR', 2, 5, [], 1),
    wall('pB', 5, 6, [], 1),
    wall('pL', 6, 3, [], 1),
  ],
  roomLabels: [
    { id: 'L', name: 'Living', kind: 'living', x: 3, y: 2 },
    { id: 'B', name: 'Balcony', kind: 'balcony', x: 5, y: 4.75 },
  ],
  furniture: [],
}
const rooms = deriveRooms(unit)
const top: WallFace = { p: { x: 2.75, y: -0.1 }, n: { x: 0, y: -1 } } // the window wall's outer face, seen from outside

describe("a piece on a wall's outer face (session 31 pieces: sunshades, canopies, AC units outside the flat)", () => {
  it('knows an outer face: no room out of it, its room behind; a room face or a zone line is not one', () => {
    expect(outerFace(unit, rooms, top)).toMatchObject({ wallId: 'wT', roomId: 'L' })
    expect(outerFace(unit, rooms, { p: { x: 2.75, y: 0.1 }, n: { x: 0, y: 1 } })).toBeNull() // the living room's side
    expect(outerFace(unit, rooms, { p: { x: 5, y: 4.1 }, n: { x: 0, y: 1 } })).toBeNull() // the slider wall: the balcony is there
    expect(outerFace(unit, rooms, { p: { x: 6.1, y: 4.75 }, n: { x: 1, y: 0 } })).toMatchObject({ wallId: 'pR', roomId: 'B' }) // a parapet's street side
    expect(nearestOuterFace(unit, rooms, { x: 2.75, y: -0.6 })).toMatchObject({ wallId: 'wT', p: { x: 2.75, y: -0.1 } })
    expect(nearestOuterFace(unit, rooms, { x: 3, y: 2 })).toBeNull() // inside a room
  })

  it('a sunshade dropped on a window from outside: fitted to it — as wide plus 15 cm a side, on its head, back to the wall', () => {
    const m = placePiece(unit, rooms, [], 'sunshade', top.p, 0, 'ss', { ...top, y: 2.5 })!
    expect(m.error).toBeNull()
    expect(m.piece).toMatchObject({ outside: true, roomId: 'L', rotationDeg: 180, sizeM: { x: 1.8, y: 0.1, z: 0.6 }, mountY: 2.1 })
    expect(m.piece.x).toBeCloseTo(36 * 0.0762, 6) // the window's middle, on the 3" step
    expect(m.piece.y).toBeCloseTo(-0.1 - 0.3 - 0.005, 6) // flush on the face, out of the flat
    expect(layoutFor({ ...unit, furniture: m.furniture }, rooms).map((p) => p.id)).toContain('ss') // kept with its room
  })

  it('the Studio: a click outside the flat by a wall hangs it on that outer face', () => {
    const m = placePiece(unit, rooms, [], 'sunshade', { x: 2.75, y: -0.5 }, 0, 'ss')!
    expect(m.error).toBeNull()
    expect(m.piece).toMatchObject({ outside: true, mountY: 2.1, sizeM: { x: 1.8 } })
    expect(placePiece(unit, rooms, [], 'sunshade', { x: 2.75, y: -3 }, 0, 'far')!.error).toBe('Outside the room') // too far from any wall
  })

  it('only pieces made for the outside go there; the rest are refused as before', () => {
    expect(placePiece(unit, rooms, [], 'tv_55_wall', top.p, 0, 'tv', { ...top, y: 1.5 })!.error).toBe('Outside the room')
  })

  it('the same refusals: a window or doorway it is not made for, past the wall end, into another wall, over another piece', () => {
    const sign = (p: WallFace, y: number) => placePiece(unit, rooms, [], 'name_sign', p.p, 0, 'sign', { ...p, y })!
    expect(sign(top, 1.5).error).toBe('Covers the window')
    expect(sign({ ...top, p: { x: 1, y: -0.1 } }, 1.5).error).toBeNull() // beside it
    expect(sign(top, 2.6).error).toBeNull() // over its head
    const left: WallFace = { p: { x: -0.1, y: 2 }, n: { x: -1, y: 0 } } // the door's outer face (door y 2.5..1.5 along wL from v4)
    expect(sign(left, 1).error).toBe('Covers the doorway')
    expect(sign(left, 2.6).error).toBeNull()
    expect(sign({ ...top, p: { x: 5.8, y: -0.1 } }, 2.6).error).toBe('Past the end of the wall')
    const under: WallFace = { p: { x: 3.35, y: 4.1 }, n: { x: 0, y: 1 } } // the living room's bottom wall, its end at the balcony's parapet
    expect(sign(under, 0.5).error).toBe('Runs into a wall') // the parapet's body (x 3.9..4.1, 1.0 m high)
    expect(sign(under, 1.5).error).toBeNull() // above it
    const ss = placePiece(unit, rooms, [], 'sunshade', top.p, 0, 'ss', { ...top, y: 2.5 })!
    expect(placePiece(unit, rooms, ss.furniture, 'canopy_slab', top.p, 0, 'c2', { ...top, y: 2.5 })!.error).toMatch(/^Overlaps the sunshade/)
  })

  it('moved (Studio, 3D), lifted, turned and resized on the same face rules; moved into a room it is in the room', () => {
    const ss = placePiece(unit, rooms, [], 'sunshade', top.p, 0, 'ss', { ...top, y: 2.5 })!
    const hop = movePiece(unit, rooms, ss.furniture, 'ss', { x: -0.5, y: 0.9 }, 0)! // dragged round the corner, by the left wall
    expect(hop.error).toBeNull()
    expect(hop.piece).toMatchObject({ outside: true, rotationDeg: 90, mountY: 2.1 })
    expect(hop.piece.x).toBeCloseTo(-0.405, 6)
    const sign = placePiece(unit, rooms, [], 'name_sign', top.p, 0, 'sign', { ...top, y: 2.6 })!
    expect(sign.error).toBeNull()
    expect(liftPiece(unit, rooms, sign.furniture, 'sign', 1.3)!.error).toBe('Covers the window')
    const beside = placePiece(unit, rooms, [], 'name_sign', top.p, 0, 'sign', { ...top, p: { x: 1, y: -0.1 }, y: 1.5 })!
    expect(liftPiece(unit, rooms, beside.furniture, 'sign', -1)!.piece.mountY).toBe(0) // no skirting outside: down to the floor
    const turned = movePiece(unit, rooms, ss.furniture, 'ss', ss.piece, ss.piece.rotationDeg + 90, false)! // R
    expect(turned.piece).toMatchObject({ outside: true, rotationDeg: 180 })
    const wide = resizePiece(unit, rooms, ss.furniture, 'ss', { x: 2.4, y: 0.1, z: 0.9 })!
    expect(wide.error).toBeNull()
    expect(wide.piece.sizeM).toEqual({ x: 2.4, y: 0.1, z: 0.9 })
    expect(wide.piece.y).toBeCloseTo(-0.1 - 0.45 - 0.005, 6) // the back stays on the wall, the front comes out
    const inside = movePiece(unit, rooms, sign.furniture, 'sign', { x: 1, y: 0.2 }, 0)!
    expect(inside.piece.outside).toBeUndefined()
    expect(inside.piece.roomId).toBe('L')
  })

  it("a sunshade dragged near a window's head goes onto it; a screen is fitted in front of the window", () => {
    const ss = placePiece(unit, rooms, [], 'sunshade', { x: 1, y: -0.1 }, 0, 'ss', { p: { x: 1, y: -0.1 }, n: top.n, y: 2.6 })!
    expect(ss.piece.mountY).toBeCloseTo(100 * 0.0254, 6) // no opening there: where the hand put it (1" steps)
    const near = movePiece(unit, rooms, ss.furniture, 'ss', { x: 2.75, y: -0.5 }, 0)!
    expect(near.piece.mountY).toBeCloseTo(100 * 0.0254, 6) // the Studio's drag keeps its height
    const onIt = hangOn(unit, rooms, ss.furniture, 'ss', { ...top, y: 2.3 })! // the 3D drag, its bottom asked 15 cm over the head
    expect(onIt.piece.mountY).toBe(2.1) // onto the head, exactly (not the 1" step next to it)
    expect(hangOn(unit, rooms, ss.furniture, 'ss', { ...top, y: 2.5 })!.piece.mountY).toBeCloseTo(96 * 0.0254, 6) // 35 cm over it: left there
    const screen = placePiece(unit, rooms, [], 'jaali_screen', top.p, 0, 'j', { ...top, y: 1.5 })!
    expect(screen.error).toBeNull()
    expect(screen.piece).toMatchObject({ sizeM: { x: 1.6, y: 1.35 }, mountY: 0.85 }) // 5 cm past each side, from the sill
  })

  it('on the balcony side of a wall it is an ordinary wall piece of the balcony, a sunshade over the slider never "covers" it', () => {
    const face: WallFace = { p: { x: 5, y: 4.1 }, n: { x: 0, y: 1 } }
    const m = placePiece(unit, rooms, [], 'sunshade', face.p, 0, 'ss', { ...face, y: 2.3 })!
    expect(m.error).toBeNull()
    expect(m.piece).toMatchObject({ roomId: 'B', mountY: 2.1 })
    expect(m.piece.outside).toBeUndefined()
  })
})

describe('on a real flat (BTI Type A)', () => {
  it("a sunshade over the living room's window beside the shaft wall overhangs on the open side only", async () => {
    const typeA = (await import('../data/units/type-a.json')).default as unknown as Unit
    const r = deriveRooms(typeA)
    const m = placePiece(typeA, r, [], 'sunshade', { x: 12.67, y: 4.85 }, 0, 'ss', { p: { x: 12.67, y: 4.85 }, n: { x: 0, y: -1 }, y: 2.45 })!
    expect(m.error).toBeNull()
    expect(m.piece).toMatchObject({ outside: true, roomId: 'r_living', mountY: 2.3, sizeM: { x: 1.35 } }) // 1.2 m window + 15 cm away from the shaft
    expect(m.piece.x).toBeGreaterThan(12.67) // shifted off the shaft wall (x 11.75..12.0)
  })
})

describe('a piece held at its limits beside a wall', () => {
  it('a roller shutter (no narrower than 1.47 m) on a 0.8 m window by the corner starts at the window, not past the wall', () => {
    const narrow: Unit = { ...unit, walls: unit.walls.map((w) => (w.id === 'wT' ? { ...w, openings: [{ id: 'nw', kind: 'window', offsetM: 0.15, widthM: 0.8, heightM: 1.2, sillM: 0.9 }] } : w)) }
    const m = placePiece(narrow, deriveRooms(narrow), [], 'rollershutter_window_01', { x: 0.55, y: -0.1 }, 0, 's', { p: { x: 0.55, y: -0.1 }, n: { x: 0, y: -1 }, y: 1.6 })!
    expect(m.error).toBeNull()
    expect(m.piece.sizeM!.x).toBeCloseTo(1.47, 6)
    expect(m.piece.x - 1.47 / 2).toBeGreaterThan(0.1) // its end off the corner wall's body (x ≤ 0.1), over the window's start
    expect(m.piece.x - 1.47 / 2).toBeLessThan(0.25)
  })
})
