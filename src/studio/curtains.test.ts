/**
 * Curtains are a piece hung on their window (founder 2026-10-13, on Bed 2 of his Banani draft, looking up at the corner
 * window: "look at the curtains. they are goddamn hilarious. empty, all over the place, cannot move or delete. they need
 * to be separate items as well as being connected with windows. no weird gaps like this").
 * Before: two 8 cm strips far inside each window (a rod shrunk by the window next door), rods running on past the window,
 * not a piece — no click, no G, no Delete. Now: furnish/presets.ts hangCurtains, studio/furniture.ts (one rule for tool F
 * and the 3D view).
 */
import { describe, expect, it } from 'vitest'
import { deriveRooms, wallFrame, type FurniturePlacement, type Unit } from '../core'
import draft from '../data/fixtures/founder-banani-unit-a-2026-10-09.json'
import { placementSize } from '../furnish/kit'
import { CURTAIN_OVER, curtainSides, footprint, quadsOverlap } from '../furnish/presets'
import { CURTAIN_D, CURTAINS } from '../furnish/procedural.meta'
import { dragTo, holdAt, pickUp } from '../viewer/arrange'
import { layoutFor, library, movePiece, pieceAt, pieceLabel, placePiece, resizeAxes, resizePiece, sideDots, whyNot } from './furniture'
import { initialState, reducer } from './model'

const his = draft as unknown as Unit
const SLIDER = '435e070b-cf15-42fe-bbca-1119a476bb05' // Bed 2, 1.95 m sliding door onto its balcony
const WINDOW = '279a76b3-3ac9-42c1-a45e-f33df2446c1f' // Bed 2, 0.53 m window beside it, in the room's corner

const curtains = (u: Unit) => layoutFor(u, deriveRooms(u)).filter((p) => p.assetId === CURTAINS && !p.removed)
const on = (u: Unit, id: string) => curtains(u).find((p) => p.openingId === id)
/** where a curtain hangs along its window's wall (from the wall's end a), and how far off the wall's centre line */
const span = (u: Unit, p: FurniturePlacement) => {
  const w = u.walls.find((x) => x.openings.some((o) => o.id === p.openingId))!
  const o = w.openings.find((x) => x.id === p.openingId)!
  const f = wallFrame(w, u.vertices)
  const c = (p.x - f.origin.x) * f.dir.x + (p.y - f.origin.y) * f.dir.y
  const half = placementSize(p).x / 2
  return { o, w, lo: c - half, hi: c + half, mid: c, off: Math.abs((p.x - f.origin.x) * f.normal.x + (p.y - f.origin.y) * f.normal.y) }
}
const stored = (u: Unit): Unit => ({ ...u, furniture: layoutFor(u, deriveRooms(u)) })

describe('curtains on his Banani draft', () => {
  it('every window face the rule dresses has exactly one curtain piece, on that window, about as wide as it, floor to ceiling', () => {
    const rooms = deriveRooms(his)
    const faces = his.walls.flatMap((w) => w.openings.flatMap((o) => curtainSides(o, w, his, rooms).map(([r]) => `${o.id} ${r.name}`)))
    expect(faces.sort()).toEqual([`${SLIDER} Bed 2`, `${WINDOW} Bed 2`, '7a2a122e-f7b5-4c6c-a18a-b7ad6a4c4c3a Master bed'].sort())
    for (const u of [his, stored(his)]) {
      const cs = curtains(u)
      expect(cs.map((p) => `${p.openingId} ${rooms.find((r) => r.id === p.roomId)!.name}`).sort()).toEqual(faces.sort())
      for (const p of cs) {
        const { o, w, lo, hi, off } = span(u, p)
        // the window's width, up to CURTAIN_OVER past each reveal; less only where a side wall or the next opening is
        expect(hi - lo, p.id).toBeGreaterThan(o.widthM - 0.08)
        expect(hi - lo, p.id).toBeLessThanOrEqual(o.widthM + 2 * CURTAIN_OVER + 1e-9)
        expect(lo, p.id).toBeGreaterThanOrEqual(o.offsetM - CURTAIN_OVER - 1e-9)
        expect(hi, p.id).toBeLessThanOrEqual(o.offsetM + o.widthM + CURTAIN_OVER + 1e-9)
        expect(off, p.id).toBeCloseTo(w.thicknessM / 2 + 0.005 + CURTAIN_D / 2, 6) // on the wall face, not off in the room
        expect(placementSize(p).y, p.id).toBeCloseTo(w.heightM - 0.065, 6) // rod under the ceiling, hem 1.5 cm off the floor
        expect(pieceLabel(p)).toBe('Curtains')
        expect(whyNot(u, rooms.find((r) => r.id === p.roomId)!, cs.filter((x) => x !== p), p), p.id).toBeNull()
      }
      // Bed 2's window and sliding door side by side: a rod each, end to end, never one into the other
      const [a, b] = [on(u, SLIDER)!, on(u, WINDOW)!]
      expect(quadsOverlap(footprint(a, a.rotationDeg, placementSize(a)), footprint(b, b.rotationDeg, placementSize(b)))).toBe(false)
    }
  })

  it('narrowing, moving or deleting the window (Studio or Edit openings: one reducer) resizes, moves or drops its curtain — stored layouts too', () => {
    for (const u of [his, stored(his)]) {
      let s = { ...initialState(), unit: u }
      const before = span(s.unit, on(s.unit, SLIDER)!)
      s = reducer(s, { type: 'update-opening', id: SLIDER, patch: { widthM: 1.5 } })
      const narrow = span(s.unit, on(s.unit, SLIDER)!)
      expect(narrow.o.widthM).toBeCloseTo(1.5, 6)
      expect(narrow.hi - narrow.lo).toBeLessThan(before.hi - before.lo - 0.2)
      expect(narrow.lo).toBeLessThanOrEqual(narrow.o.offsetM + 0.006) // still covers the reveals (5 mm short where the next opening starts)
      expect(narrow.hi).toBeGreaterThanOrEqual(narrow.o.offsetM + narrow.o.widthM - 0.006)
      s = reducer(s, { type: 'drag-opening', id: SLIDER, offsetM: narrow.o.offsetM + 0.25 })
      const moved = span(s.unit, on(s.unit, SLIDER)!)
      expect(moved.o.offsetM).toBeCloseTo(narrow.o.offsetM + 0.25, 6)
      expect(Math.abs(moved.mid - narrow.mid - 0.25)).toBeLessThan(0.1) // with it (its rod ends re-cut by the openings now nearer)
      expect(moved.lo).toBeLessThanOrEqual(moved.o.offsetM + 0.006)
      expect(moved.hi).toBeGreaterThanOrEqual(moved.o.offsetM + moved.o.widthM - 0.006)
      s = reducer(s, { type: 'delete', ids: [SLIDER] })
      expect(on(s.unit, SLIDER)).toBeUndefined()
      expect(on(s.unit, WINDOW)).toBeDefined()
    }
  })

  it("an older draft's switched-off window (curtains: false) hangs none — and staff can still hang a pair there from the library", () => {
    const u: Unit = { ...his, walls: his.walls.map((w) => ({ ...w, openings: w.openings.map((o) => (o.id === SLIDER ? { ...o, curtains: false } : o)) })) }
    expect(on(u, SLIDER)).toBeUndefined()
    const rooms = deriveRooms(u)
    const w = u.walls.find((x) => x.openings.some((o) => o.id === SLIDER))!
    const f = wallFrame(w, u.vertices)
    const o = w.openings.find((x) => x.id === SLIDER)!
    // a click on the plan just inside Bed 2, in front of the sliding door (Studio tool F: the nearest wall face)
    const at = { x: f.origin.x + f.dir.x * (o.offsetM + 0.6) - f.normal.x * 0.3, y: f.origin.y + f.dir.y * (o.offsetM + 0.6) - f.normal.y * 0.3 }
    const m = placePiece(u, rooms, layoutFor(u, rooms), CURTAINS, at, 0, 'new')!
    expect(m.error).toBeNull()
    expect(m.piece.openingId).toBe(SLIDER)
    expect(placementSize(m.piece).x).toBeGreaterThan(o.widthM - 0.08)
    // nowhere near a window: refused, said why
    expect(placePiece(u, rooms, layoutFor(u, rooms), CURTAINS, rooms.find((r) => r.name === 'Bed 2')!.centroid, 0, 'n2')!.error).toBe('Point at an opening')
    expect(library().filter((t) => t.items.some((i) => i.id === CURTAINS)).map((t) => t.tab)).toEqual(['Living', 'Bedroom'])
  })

  it('a click picks them, a drag slides them along their wall only (they stay their window\'s), Delete is one undo step and they stay deleted', () => {
    let s = { ...initialState(), unit: his }
    const rooms = deriveRooms(his)
    const all = layoutFor(his, rooms)
    const p = on(his, SLIDER)!
    expect(pieceAt(all, p)?.id).toBe(p.id)
    // dragged 0.3 m along the wall (away from the window beside it) and 2 m into the room: it stays on the wall, slid 4 × 3"
    const { w, mid, off } = span(his, p)
    const f = wallFrame(w, his.vertices)
    expect(on(his, WINDOW)).toBeDefined()
    const toward = Math.sign((on(his, WINDOW)!.x - p.x) * f.dir.x + (on(his, WINDOW)!.y - p.y) * f.dir.y)
    const k = -toward * 0.3
    const m = movePiece(his, rooms, all, p.id, { x: p.x + f.dir.x * k - f.normal.x * 2, y: p.y + f.dir.y * k - f.normal.y * 2 }, 0)!
    expect(m.error).toBeNull()
    expect(span(his, m.piece).off).toBeCloseTo(off, 6)
    expect(span(his, m.piece).mid - mid).toBeCloseTo(-toward * 4 * 0.0762, 3)
    expect(m.piece.rotationDeg).toBe(p.rotationDeg)
    // the 3D drag: the wall face under the pointer, even another wall's — still slides along its own
    const g = dragTo(his, rooms, all, p.id, { at: null, wall: { p: { x: p.x - 3, y: p.y + 2 }, n: { x: 1, y: 0 } } })!
    expect(span(his, g.piece).off).toBeCloseTo(off, 6)
    // slid 0.4 m toward the window beside it: still the sliding door's (its width), and refused — that window has its own
    const onto = movePiece(his, rooms, all, p.id, { x: p.x + f.dir.x * 0.4 * toward, y: p.y + f.dir.y * 0.4 * toward }, 0)!
    expect(onto.piece.openingId).toBe(SLIDER)
    expect(placementSize(onto.piece).x).toBeCloseTo(placementSize(p).x, 6)
    expect(onto.error).toBe('Overlaps the curtains')
    // the 3D hand: grabbed by its right panel, the pointer 0.3 m further along the wall — the curtains go 0.3 m, not to the pointer
    const right = { x: p.x - f.dir.x * toward * 0.8 + f.normal.x * 0.1, y: p.y - f.dir.y * toward * 0.8 + f.normal.y * 0.1 }
    const held = holdAt(his, rooms, all, holdAt(his, rooms, all, pickUp(all, p.id), { at: null, wall: { p: right, n: f.normal } }), {
      at: null,
      wall: { p: { x: right.x + f.dir.x * k, y: right.y + f.dir.y * k }, n: f.normal },
    })
    expect(held.move!.error).toBeNull()
    expect(span(his, held.move!.piece).mid - mid).toBeCloseTo(-toward * 4 * 0.0762, 3)
    // the move committed (Studio), then saved and re-laid: the same place
    s = reducer(s, { type: 'move-piece', id: p.id, x: m.piece.x, y: m.piece.y })
    expect(on(s.unit, SLIDER)!.x).toBeCloseTo(m.piece.x, 9)
    expect(on(s.unit, SLIDER)!.y).toBeCloseTo(m.piece.y, 9)
    // Delete: gone, one undo step brings it back where it was
    const steps = s.history.past.length
    s = reducer(s, { type: 'delete-piece', id: p.id })
    expect(on(s.unit, SLIDER)).toBeUndefined()
    expect(s.history.past.length).toBe(steps + 1)
    expect(layoutFor(s.unit, rooms).some((x) => x.id === p.id && x.removed)).toBe(true) // stays deleted, not hung again
    s = reducer(s, { type: 'undo' })
    expect(on(s.unit, SLIDER)!.x).toBeCloseTo(m.piece.x, 9)
  })

  it('a sofa may stand against a curtained window: curtains stop only curtains', () => {
    const rooms = deriveRooms(his)
    const all = layoutFor(his, rooms)
    const p = on(his, SLIDER)!
    const bed2 = rooms.find((r) => r.id === p.roomId)!
    const chair = { id: 'chair', assetId: 'dining_chair', roomId: bed2.id, x: p.x, y: p.y + 0.2, rotationDeg: 0 }
    expect(quadsOverlap(footprint(chair, 0, placementSize(chair)), footprint(p, p.rotationDeg, placementSize(p)))).toBe(true)
    expect(whyNot(his, bed2, all, chair)).toBeNull()
  })
})

describe('curtains in a corner', () => {
  // a 3.6 × 3.2 m bedroom, a window from the corner on two walls
  const u: Unit = {
    id: 'u', projectName: 'T', name: 'T', northDeg: 0, areaSqft: 0, furniture: [], finishSlots: [],
    vertices: [{ id: 'v1', x: 0, y: 0 }, { id: 'v2', x: 3.6, y: 0 }, { id: 'v3', x: 3.6, y: 3.2 }, { id: 'v4', x: 0, y: 3.2 }],
    walls: [['v1', 'v2'], ['v2', 'v3'], ['v3', 'v4'], ['v4', 'v1']].map(([a, b], i) => ({
      id: `w${i}`, a, b, thicknessM: 0.127, heightM: 3,
      openings: i === 0 ? [{ id: 'n', kind: 'window' as const, offsetM: 2.4, widthM: 1.2, heightM: 1.2, sillM: 0.9 }] : i === 1 ? [{ id: 'e', kind: 'window' as const, offsetM: 0, widthM: 1.0, heightM: 1.2, sillM: 0.9 }] : [],
    })),
    roomLabels: [{ id: 'r', name: 'Bed', kind: 'bed', x: 1.8, y: 1.6 }],
  }
  it('two windows meeting at a corner: two rods, each stopping short of the side wall, never round the corner or into the other', () => {
    const cs = curtains(u)
    expect(cs.map((p) => p.openingId).sort()).toEqual(['e', 'n'])
    const [a, b] = cs.map((p) => footprint(p, p.rotationDeg, placementSize(p)))
    expect(quadsOverlap(a, b)).toBe(false)
    const rooms = deriveRooms(u)
    for (const p of cs) {
      expect(whyNot(u, rooms[0], cs.filter((x) => x !== p), p), p.id).toBeNull()
      const { o, lo, hi } = span(u, p)
      expect(hi - lo, p.id).toBeGreaterThan(o.widthM - CURTAIN_D - 0.1) // the corner's side wall (and the other rod) cut it, nothing else
    }
  })
})

describe('curtains on any opening, wider or narrower by a side (founder 2026-10-19)', () => {
  // "i cannot put the curtain on the opening but i need to. also the curtain sizes should be changable by dragging on the sides"
  // a 6 × 3.2 m flat: a living room and a bedroom either side of a wall with a door and a passage in it
  const u: Unit = {
    id: 'u', projectName: 'T', name: 'T', northDeg: 0, areaSqft: 0, furniture: [], finishSlots: [],
    vertices: [{ id: 'v1', x: 0, y: 0 }, { id: 'v5', x: 3, y: 0 }, { id: 'v2', x: 6, y: 0 }, { id: 'v3', x: 6, y: 3.2 }, { id: 'v6', x: 3, y: 3.2 }, { id: 'v4', x: 0, y: 3.2 }],
    walls: [['v1', 'v5'], ['v5', 'v2'], ['v2', 'v3'], ['v3', 'v6'], ['v6', 'v4'], ['v4', 'v1'], ['v5', 'v6']].map(([a, b], i) => ({
      id: `w${i}`, a, b, thicknessM: 0.127, heightM: 3,
      openings: i === 6 ? [{ id: 'door', kind: 'door' as const, offsetM: 0.4, widthM: 0.9, heightM: 2.1, sillM: 0 }, { id: 'pass', kind: 'passage' as const, offsetM: 1.8, widthM: 1.0, heightM: 2.1, sillM: 0 }] : [],
    })),
    roomLabels: [{ id: 'l', name: 'Living', kind: 'living', x: 1.5, y: 1.6 }, { id: 'b', name: 'Bed', kind: 'bed', x: 4.5, y: 1.6 }],
  }
  const rooms = deriveRooms(u)
  const living = rooms.find((r) => r.name === 'Living')!
  const bed = rooms.find((r) => r.name === 'Bed')!
  /** a point on the middle wall at y, d metres into the living room (−) or the bedroom (+) */
  const mid = (y: number, d: number) => ({ x: 3 + d, y })
  const hang = (at = mid(0.85, -0.3), hole?: { p: { x: number; y: number }; n: { x: number; y: number } }) => placePiece(u, rooms, layoutFor(u, rooms), CURTAINS, at, 0, 'c', null, hole)!

  it('nothing hangs on a door or passage by itself; staff hang a pair on either, centred, a little wider, floor to ceiling', () => {
    expect(curtains(u)).toEqual([])
    // the Studio's click just inside the living room in front of the door (its nearest wall face)
    const m = hang()
    expect(m.error).toBeNull()
    expect(m.piece.openingId).toBe('door')
    expect(m.piece.roomId).toBe(living.id)
    const s = span({ ...u, furniture: m.furniture }, m.piece)
    expect(s.lo).toBeCloseTo(0.4 - CURTAIN_OVER, 3) // the window rule's margin past each edge
    expect(s.hi).toBeCloseTo(1.3 + CURTAIN_OVER, 3)
    expect(s.off).toBeCloseTo(0.127 / 2 + 0.005 + CURTAIN_D / 2, 6) // on the living room's face of the wall
    expect(placementSize(m.piece).y).toBeCloseTo(3 - 0.065, 6) // above the door's head, to the floor
    // the 3D pointer looking through the passage from the bedroom (the wall it meets is the living room's far wall)
    const g = hang(mid(1.6, 0.6), { p: mid(2.3, 0.127 / 2), n: { x: 1, y: 0 } })
    expect(g.error).toBeNull()
    expect(g.piece.openingId).toBe('pass')
    expect(g.piece.roomId).toBe(bed.id)
    const t = span({ ...u, furniture: g.furniture }, g.piece)
    expect(t.lo).toBeCloseTo(1.8 - CURTAIN_OVER, 3)
    expect(t.hi).toBeCloseTo(2.8 + CURTAIN_OVER, 3)
    // nowhere near an opening: said so
    expect(hang(mid(2.95, -0.3)).error).toBe('Point at an opening')
    // saved and laid out again: still there, as hung
    expect(on({ ...u, furniture: m.furniture }, 'door')).toMatchObject({ x: m.piece.x, y: m.piece.y, sizeM: m.piece.sizeM })
  })

  it("a side dragged moves that side only, on 5 cm steps from the opening's edge; the typed width moves both; limits hold", () => {
    const m = hang()
    const v: Unit = { ...u, furniture: m.furniture }
    const p = on(v, 'door')!
    const before = span(v, p)
    const plus = sideDots(p)[0] // its +x side: which end of the wall that is depends on how it faces
    const right = plus.y > p.y ? 'hi' : 'lo'
    const keep = right === 'hi' ? 'lo' : 'hi'
    const w = placementSize(p).x
    // dragged 0.47 m wider: lands 0.6 m past the edge (0.15 + 0.47 → 0.6 on the 5 cm step)
    const a = resizePiece(v, rooms, v.furniture, p.id, { ...placementSize(p), x: w + 0.47 }, { x: 1, z: 0 })!
    expect(a.error).toBeNull()
    const sa = span({ ...v, furniture: a.furniture }, a.piece)
    expect(sa[keep]).toBeCloseTo(before[keep], 3)
    expect(Math.abs(sa[right] - before[right])).toBeCloseTo(0.45, 3)
    expect(Math.abs(sa[right] - (right === 'hi' ? 1.3 : 0.4))).toBeCloseTo(0.6, 3)
    // kept: the next layout hangs it the same, and the Studio reducer commits the same drag as one step
    const after = layoutFor({ ...v, furniture: a.furniture }, rooms).find((x) => x.id === p.id)!
    expect(placementSize(after).x).toBeCloseTo(placementSize(a.piece).x, 6)
    let st = reducer({ ...initialState(), unit: v }, { type: 'resize-piece', id: p.id, sizeM: { ...placementSize(p), x: w + 0.47 }, grow: { x: 1, z: 0 } })
    expect(placementSize(on(st.unit, 'door')!).x).toBeCloseTo(placementSize(a.piece).x, 6)
    // the other side, narrower: its end goes in to the door's edge, the first side stays
    const b = resizePiece(st.unit, rooms, layoutFor(st.unit, rooms), p.id, { ...placementSize(a.piece), x: placementSize(a.piece).x - 0.15 }, { x: -1, z: 0 })!
    const sb = span({ ...st.unit, furniture: b.furniture }, b.piece)
    expect(sb[right]).toBeCloseTo(sa[right], 3)
    expect(sb[keep]).toBeCloseTo(right === 'hi' ? 0.4 : 1.3, 3)
    // limits: never narrower than 0.4 m; never round the room's corner (the rod stops short of the side wall), still allowed
    expect(placementSize(resizePiece(v, rooms, v.furniture, p.id, { ...placementSize(p), x: 0.1 }, { x: 1, z: 0 })!.piece).x).toBeCloseTo(0.4, 3)
    const far = resizePiece(v, rooms, v.furniture, p.id, { ...placementSize(p), x: 9 }, { x: 1, z: 0 })!
    expect(far.error).toBeNull()
    expect(placementSize(far.piece).x).toBeLessThan(3.2)
    const sf = span({ ...v, furniture: far.furniture }, far.piece)
    expect(Math.min(sf.lo, sf.hi)).toBeGreaterThanOrEqual(0.127 / 2 - 1e-6)
    expect(Math.max(sf.lo, sf.hi)).toBeLessThanOrEqual(3.2 - 0.127 / 2 + 1e-6)
    // the typed width (the Studio's W field): both halves
    st = reducer({ ...initialState(), unit: v }, { type: 'resize-piece', id: p.id, sizeM: { ...placementSize(p), x: w + 0.2 } })
    const sc = span(st.unit, on(st.unit, 'door')!)
    expect(sc.lo).toBeCloseTo(before.lo - 0.1, 3)
    expect(sc.hi).toBeCloseTo(before.hi + 0.1, 3)
    expect(resizeAxes(CURTAINS)).toEqual(['x'])
  })
})
