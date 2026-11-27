/** What a low wall is made of (rails.ts): railings, glass fronts, fences from the wall's line; caps; a balcony's slab edge. */
import * as THREE from 'three'
import { expect, test } from 'vitest'
import * as core from '../core'
import type { LowWallKind, Unit, Wall } from '../core'
import { GLAZING_GLASS } from './openings'
import { BAND_DOWN, BAND_P, BAND_UP, CAP_H, CAP_P, CHAIN_MESH, GRILLE_PAINT, RAIL_COLOR, RAIL_STEEL, RAIL_TIMBER, balconyEdges, block, capGeometry, faceUvs, railParts } from './rails'

/** A bed (3 × 3 m) and its balcony (3 × 1.5 m) in front of it: the balcony's three sides are 1.1 m low walls, `front` its front. */
function balcony(front: Partial<Wall> = {}, sides: Partial<Wall> = {}): Unit {
  const v = (id: string, x: number, y: number) => ({ id, x, y })
  const w = (id: string, a: string, b: string, heightM: number, extra: Partial<Wall> = {}): Wall => ({ id, a, b, thicknessM: 0.127, heightM, openings: [], ...extra })
  return {
    id: 'balcony-test', projectName: '', name: 'Balcony', northDeg: 0, areaSqft: 0, furniture: [], finishSlots: [],
    vertices: [v('p', 0, -3), v('q', 3, -3), v('r', 3, 0), v('s', 0, 0), v('t', 0, 1.5), v('u', 3, 1.5)],
    walls: [
      w('top', 'p', 'q', 3), w('east', 'q', 'r', 3), w('west', 's', 'p', 3),
      w('back', 'r', 's', 3, { openings: [{ id: 'sl', kind: 'slider', offsetM: 0.5, widthM: 2, heightM: 2.1, sillM: 0 }] }),
      w('bw', 's', 't', 1.1, sides), w('front', 't', 'u', 1.1, front), w('be', 'u', 'r', 1.1, sides),
    ],
    roomLabels: [
      { id: 'bed', name: 'Bed', kind: 'bed', x: 1.5, y: -1.5 },
      { id: 'bal', name: 'Balcony', kind: 'balcony', x: 1.5, y: 0.75 },
    ],
  }
}
const bounds = (g: THREE.BufferGeometry) => (g.computeBoundingBox(), g.boundingBox!)
const wallOf = (u: Unit, id: string) => u.walls.find((w) => w.id === id)!
const KINDS: LowWallKind[] = ['glass', 'railing', 'grille', 'timber', 'fence', 'chainlink']

test('faceUvs (session 31 outside2): any box in metres along its faces and up, as block() lays them; a BoxGeometry turned 30° as a block at that angle', () => {
  const B = new THREE.BoxGeometry(2, 0.2, 0.25).rotateY(Math.PI / 6).translate(3, -0.1, 1)
  const uvs = (g: THREE.BufferGeometry) => {
    const n = g.attributes.normal, p = g.attributes.position, uv = g.attributes.uv
    const out = new Map<string, [number, number]>()
    for (let i = 0; i < p.count; i++) out.set([p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)].map((v) => v.toFixed(3)).join(), [uv.getX(i), uv.getY(i)])
    return out
  }
  const got = uvs(faceUvs(B.clone()))
  // the same corners as a block(): their coordinates the block's own
  const c = (u: number, v: number, w: number): [number, number, number] => {
    const [cs, sn] = [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6)]
    return [3 + u * cs + w * sn, -0.1 + v, 1 - u * sn + w * cs]
  }
  const P: [number, number, number][] = []
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) P.push(c(i ? 1 : -1, j ? 0.1 : -0.1, k ? 0.125 : -0.125))
  for (const [key, uv] of uvs(block(P))) {
    const mine = got.get(key)
    if (!mine) continue
    expect(mine[0]).toBeCloseTo(uv[0], 4)
    expect(mine[1]).toBeCloseTo(uv[1], 4)
  }
  // a brick course stays level: an upright face's v is the height
  const p = B.attributes.position
  const f = faceUvs(B.clone()).attributes.uv
  for (let i = 0; i < p.count; i++) if (Math.abs(B.attributes.normal.getY(i)) < 0.5) expect(f.getY(i)).toBeCloseTo(p.getY(i), 6)
})

test("a railing's own colour (session 31 outside2): every part of it but a glass front's panes; none chosen, the material it always had", () => {
  const mats = (front: Partial<Wall>) => railParts(wallOf(balcony(front), 'front'), balcony(front)).map((p) => p.m)
  expect(mats({ lowKind: 'railing' })).toEqual([RAIL_STEEL])
  expect(mats({ lowKind: 'grille' })).toEqual([GRILLE_PAINT])
  expect(mats({ lowKind: 'timber' })).toEqual([RAIL_TIMBER])
  expect(mats({ lowKind: 'railing', railColor: 'black' })).toEqual([RAIL_COLOR.black])
  expect(mats({ lowKind: 'grille', railColor: 'white' })).toEqual([RAIL_COLOR.white])
  expect(mats({ lowKind: 'timber', railColor: 'walnut' })).toEqual([RAIL_COLOR.walnut])
  expect(mats({ lowKind: 'glass', railColor: 'anthracite' })).toEqual([RAIL_COLOR.anthracite, GLAZING_GLASS])
  expect(mats({ lowKind: 'railing', railColor: 'teak' })).toEqual([RAIL_STEEL]) // not a metal's colour: its own
})

test('every kind is built along its own wall, as tall as it, a few cm either side of its line; a solid wall is no railing', () => {
  for (const kind of KINDS) {
    const u = balcony({ lowKind: kind }, { lowKind: kind })
    const parts = railParts(wallOf(u, 'front'), u)
    expect(parts.length, kind).toBeGreaterThan(0)
    const b = new THREE.Box3()
    for (const p of parts) b.union(bounds(p.geo))
    expect(b.min.y, kind).toBeCloseTo(0, 6)
    expect(b.max.y, kind).toBeCloseTo(1.1, 6)
    expect(b.min.z, kind).toBeGreaterThan(1.5 - 0.07)
    expect(b.max.z, kind).toBeLessThan(1.5 + 0.07)
    expect(b.min.x, kind).toBeGreaterThan(-0.07)
    expect(b.max.x, kind).toBeLessThan(3.07)
  }
  expect(railParts(wallOf(balcony(), 'front'), balcony())).toEqual([])
  expect(railParts({ ...wallOf(balcony(), 'front'), heightM: 3, lowKind: 'glass' }, balcony())).toEqual([]) // a storey wall: plaster
})

test('glass: panes no wider than 1.25 m between a steel base channel and cap rail; it stops at the face of the wall it meets', () => {
  const u = balcony({ lowKind: 'glass' })
  const parts = railParts(wallOf(u, 'front'), u)
  expect(parts.map((p) => (p.m === GLAZING_GLASS ? 'glass' : p.m === RAIL_STEEL ? 'steel' : '?')).sort()).toEqual(['glass', 'steel'])
  const glass = parts.find((p) => p.m === GLAZING_GLASS)!.geo
  const panes = glass.attributes.position.count / 36 // (a block: 12 triangles)
  // the front meets the two solid low sides (capped): it runs between their caps' faces, 3 m less 2 × (6.35 cm + 2.5 cm)
  const run = 3 - 2 * (0.127 / 2 + CAP_P)
  expect(panes).toBe(Math.ceil(run / 1.25))
  const b = bounds(glass)
  expect(b.max.x - b.min.x).toBeLessThan(run)
  expect(b.min.x).toBeGreaterThan(0.127 / 2 + CAP_P - 1e-6)
})

test('a metal railing: no two bars further apart than 11.5 cm, posts no further than 1.5 m; a passage in it is a gate', () => {
  const gate = { id: 'g', kind: 'passage' as const, offsetM: 1, widthM: 1, heightM: 2.1, sillM: 0 }
  const u = balcony({ lowKind: 'railing', openings: [gate] }, { lowKind: 'railing' })
  const [steel] = railParts(wallOf(u, 'front'), u)
  expect(steel.m).toBe(RAIL_STEEL)
  const p = steel.geo.attributes.position
  // nothing stands in the gate (x 1 → 2 on this wall)
  for (let i = 0; i < p.count; i++) expect(p.getX(i) > 1 + 1e-6 && p.getX(i) < 2 - 1e-6).toBe(false)
  // the uprights' middles at knee height, left of the gate: never more than 11.5 cm apart
  const xs = new Set<number>()
  for (let i = 0; i < p.count; i += 36) {
    let [lo, hi, top] = [Infinity, -Infinity, 0]
    for (let j = i; j < i + 36; j++) (lo = Math.min(lo, p.getX(j))), (hi = Math.max(hi, p.getX(j))), (top = Math.max(top, p.getY(j)))
    if (hi - lo < 0.05 && top > 0.9 && hi < 1) xs.add(+((lo + hi) / 2).toFixed(4))
  }
  const sorted = [...xs].sort((a, b) => a - b)
  expect(sorted.length).toBeGreaterThan(5)
  for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeLessThanOrEqual(0.115 + 1e-6)
})

test('the grille is the dark enamel with crossed flats at mid-height; chain-link is posts and a see-through mesh', () => {
  const g = balcony({ lowKind: 'grille' })
  expect(railParts(wallOf(g, 'front'), g).map((p) => p.m)).toEqual([GRILLE_PAINT])
  const [paint] = railParts(wallOf(g, 'front'), g)
  // a crossed flat leans: its block's corners are not all at four u's of one box
  const p = paint.geo.attributes.position
  let leaning = 0
  for (let i = 0; i < p.count; i += 36) {
    const ys = new Set<string>()
    for (let j = i; j < i + 36; j++) ys.add(p.getY(j).toFixed(4))
    if (ys.size > 2) leaning++
  }
  expect(leaning).toBeGreaterThan(20)
  const c = balcony({ lowKind: 'chainlink' })
  const mesh = railParts(wallOf(c, 'front'), c).find((x) => x.m === CHAIN_MESH)!
  expect(mesh.geo.attributes.position.count).toBe(6) // one sheet, drawn both sides
  expect(CHAIN_MESH.transparent && CHAIN_MESH.side === THREE.DoubleSide).toBe(true)
})

test('a solid low wall wears a cap CAP_P proud of both faces, 5 mm over its top; two caps at a corner meet on the mitre; a free end is capped too', () => {
  const u = balcony()
  const cap = capGeometry(wallOf(u, 'front'), u)!
  const b = bounds(cap)
  expect(b.max.y).toBeCloseTo(1.105, 6)
  expect(b.min.y).toBeCloseTo(1.105 - CAP_H, 6)
  expect(b.max.z - b.min.z).toBeCloseTo(0.127 + 2 * CAP_P, 6)
  // the front (t → u, along +x) and the west side (s → t, along +y) meet at t (0, 1.5): the front's cap on the front's
  // side of the line halving the corner, the side's on the other, both reaching the cap's outer corner
  const side = capGeometry(wallOf(u, 'bw'), u)!
  const near = (g: THREE.BufferGeometry, f: (x: number, z: number) => void) => {
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) if (p.getX(i) < 0.5 && p.getZ(i) > 1) f(p.getX(i), p.getZ(i) - 1.5)
  }
  near(cap, (x, z) => expect(x + z).toBeGreaterThan(-1e-6)) // (the corner's halving line: x = −z here)
  near(side, (x, z) => expect(x + z).toBeLessThan(1e-6))
  expect(b.min.x).toBeCloseTo(-(0.127 / 2 + CAP_P), 6)
  // a railing, a kerb, a storey wall: no cap
  expect(capGeometry({ ...wallOf(u, 'front'), lowKind: 'glass' }, u)).toBeNull()
  expect(capGeometry({ ...wallOf(u, 'front'), heightM: 0.15 }, u)).toBeNull()
  expect(capGeometry(wallOf(u, 'back'), u)).toBeNull()
  // a free end: the cap runs CAP_P past it
  const lone = { ...balcony(), walls: [wallOf(u, 'front')] }
  const lb = bounds(capGeometry(lone.walls[0], lone)!)
  expect([lb.min.x, lb.max.x].map((x) => +x.toFixed(4))).toEqual([-CAP_P, 3 + CAP_P])
  // a cornice: its cap further out, two steps under it
  const cb = bounds(capGeometry({ ...wallOf(u, 'front'), cornice: true }, u)!)
  expect(cb.max.z - cb.min.z).toBeCloseTo(0.127 + 2 * 0.06, 6)
  expect(cb.min.y).toBeCloseTo(1.1 - 0.115, 6)
})

test('a balcony stands out: its front slab edge BAND_P past the low walls, BAND_DOWN under its floor, outside only; no balcony, no edge', () => {
  const u = balcony({ lowKind: 'glass' })
  const rooms = core.deriveRooms(u)
  const g = balconyEdges(u, rooms)!
  const b = bounds(g)
  expect(b.max.y).toBeCloseTo(BAND_UP, 6)
  expect(b.min.y).toBeCloseTo(-BAND_DOWN - 0.015, 6)
  // round the front and its two sides, never into the bed (y < 0) and never over the balcony's floor past the wall lines
  expect(b.max.z).toBeCloseTo(1.5 + 0.127 / 2 + BAND_P, 6)
  expect(b.min.x).toBeCloseTo(-(0.127 / 2 + BAND_P), 6)
  expect(b.max.x).toBeCloseTo(3 + 0.127 / 2 + BAND_P, 6)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const [x, z] = [p.getX(i), p.getZ(i)]
    expect(x > 1e-6 && x < 3 - 1e-6 && z > 1e-6 && z < 1.5 - 1e-6).toBe(false) // nothing over the balcony's own floor
    expect(z).toBeGreaterThan(-1e-6) // nothing along the bed's walls
  }
  const plain = { ...u, roomLabels: u.roomLabels.map((l) => ({ ...l, kind: 'bed' as const })) }
  expect(balconyEdges(plain, core.deriveRooms(plain))).toBeNull()
})

test('a curved balcony (its front: six short walls on an arc) gets one unbroken slab edge round it — no gap, no overlap at a joint', () => {
  const u0 = balcony()
  const R = Math.hypot(1.5, 0.5)
  const a0 = Math.atan2(0.5, -1.5)
  const a1 = Math.atan2(0.5, 1.5)
  const arc = [...Array(7)].map((_, i) => ({ id: `c${i}`, x: 1.5 + R * Math.cos(a0 + ((a1 - a0) * i) / 6), y: 1 + R * Math.sin(a0 + ((a1 - a0) * i) / 6) }))
  arc[0] = { ...arc[0], id: 't' }
  arc[6] = { ...arc[6], id: 'u' }
  const front = arc.slice(0, 6).map((p, i): Wall => ({ id: `f${i}`, a: p.id, b: arc[i + 1].id, thicknessM: 0.127, heightM: 1.1, openings: [], lowKind: 'glass' }))
  const u: Unit = { ...u0, vertices: [...u0.vertices.filter((v) => v.id !== 't' && v.id !== 'u'), ...arc], walls: [...u0.walls.filter((w) => w.id !== 'front'), ...front] }
  const g = balconyEdges(u, core.deriveRooms(u))!
  // its top face's area against the exact area of a mitred strip d wide outside the chain s → t → the arc → u → r
  const d = 0.127 / 2 + BAND_P
  const chain = ['s', 't', ...arc.slice(1, 6).map((p) => p.id), 'u', 'r'].map((id) => u.vertices.find((v) => v.id === id)!)
  const dirs = chain.slice(1).map((p, i) => { const L = Math.hypot(p.x - chain[i].x, p.y - chain[i].y); return { x: (p.x - chain[i].x) / L, y: (p.y - chain[i].y) / L, L } })
  const turns = dirs.slice(1).map((e, i) => Math.acos(Math.min(1, dirs[i].x * e.x + dirs[i].y * e.y)))
  const want = dirs.reduce((s, e) => s + e.L, 0) * d + d * d * turns.reduce((s, a) => s + Math.tan(a / 2), 0)
  const p = g.attributes.position
  const n = g.attributes.normal
  let area = 0
  for (let i = 0; i < p.count; i += 3) {
    if (n.getY(i) < 0.99 || Math.abs(p.getY(i) - BAND_UP) > 1e-6) continue
    const [ax, az, bx, bz, cx, cz] = [p.getX(i), p.getZ(i), p.getX(i + 1), p.getZ(i + 1), p.getX(i + 2), p.getZ(i + 2)]
    area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
  }
  expect(area).toBeCloseTo(want, 6)
})
