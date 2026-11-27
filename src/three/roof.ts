/**
 * The roof over the top floor (session 31 roof lane; the setting is data/building/roof.ts, building.ts puts what this makes on
 * the roof floor). Over the box of the top floor's outer walls' corners `pts` (plan, the scene's frame) along their longest
 * wall's direction `dir`: the ridge down the box's long middle (or across it: Roof.ridge 'short'), slopes from the eaves at
 * `eave` (y) up to it — a gable (a gable end at each short end from the roof slab `base` up to the slopes), a hip (slopes at
 * the ends too, the ridge shorter by the box's width), a shed (one slope, high along the back), a mansard (steep lower slopes
 * all round, a low hip over them). Pitch: the setting's, else what the set's `ridge` (y) makes, else DEFAULT_PITCH. A knee wall
 * from `base` to the eave all round. An overhang carries the slopes past the walls at the same pitch, a fascia board along
 * the edge and a soffit under it. Roof windows: the tower's own panes (building.ts paneMaterial: glass, frame and sashes drawn
 * from each vertex's `pane` card) lying on a slope over a small curb; on a flat roof a skylight on a curb on the deck.
 * ponytail: one box over the whole floor (an L-shaped house gets one roof over its box), every slope alike, no dormers.
 */
import * as THREE from 'three'
import type { Pt } from '../core'
import { DEFAULT_PITCH, type Roof } from '../data/building/roof'

export interface RoofParts {
  /** the slopes, in the covering: u along the eaves, v up the slope (metres) */
  cover: THREE.BufferGeometry
  /** gable ends, knee walls, a mansard's walls, a skylight's curb, the cornice: the outer walls' plaster */
  walls: THREE.BufferGeometry
  /** under an overhang: the fascia along the edge, the soffit under it, the roof windows' flashing (painted) */
  trim: THREE.BufferGeometry
  /** the roof windows' glass, with building.ts paneMaterial's `pane` card */
  panes: THREE.BufferGeometry
  /**
   * Its solar panels and chimneys (Roof.pieces): where each stands — `at` its base's middle (scene: x, y up, z), turned `yaw`
   * (about up: its front, +z, down the slope) and tipped `tilt` down toward its front (the slope's angle; 0 on a flat deck).
   */
  spots: { kind: 'solar' | 'chimney'; at: [number, number, number]; yaw: number; tilt: number }[]
}

/** a roof piece's plan size (the kit's solar_panel and chimney, procedural.meta.ts) */
const PIECE_PLAN = { solar: { w: 2.1, h: 1.8 }, chimney: { w: 0.6, h: 0.6 } }

/** a point in the roof's own frame: along the ridge, across it, up */
type P = [number, number, number]
/** the fascia board's depth under the roof's edge; the soffit's gap under the slope */
const FASCIA_M = 0.18
const SOFFIT_M = 0.03
/** a mansard's lower slopes: this steep, this high (an attic storey) */
const MANSARD_DEG = 70
const MANSARD_M = 2.4
/** a roof window's glass over its slope, and how far in from the roof's edges it must stay */
const RAISE_M = 0.05
const MARGIN_M = 0.4

/** Triangles of polygons (fans), both windings unless `up` faces them one way only (+1 up, −1 down); uv by `uvOf`. */
function faces(polys: number[][][], uvOf: (q: number[], poly: number[][]) => [number, number], up = 0): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  for (const poly of polys) {
    const [a, b, c] = poly
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) // (b − a) × (c − a), its y
    const flip = up !== 0 && Math.sign(ny) !== up
    for (let i = 1; i + 1 < poly.length; i++) {
      const tris = up === 0 ? [[poly[0], poly[i], poly[i + 1]], [poly[0], poly[i + 1], poly[i]]] : [flip ? [poly[0], poly[i + 1], poly[i]] : [poly[0], poly[i], poly[i + 1]]]
      for (const tri of tris) for (const q of tri) pos.push(...q), uv.push(...uvOf(q, poly))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

/** a wall's uv: metres along it in plan (x + z), metres up (building.ts's old pitched roof) */
const wallUv = (q: number[]): [number, number] => [q[0] + q[2], q[1]]
/** a slope's uv: metres along its eave edge (its first two corners), metres up the slope from that edge */
function slopeUv(q: number[], poly: number[][]): [number, number] {
  const [e0, e1] = poly
  const l = Math.hypot(e1[0] - e0[0], e1[2] - e0[2]) || 1
  const [dx, dz] = [(e1[0] - e0[0]) / l, (e1[2] - e0[2]) / l]
  const along = (q[0] - e0[0]) * dx + (q[2] - e0[2]) * dz
  const inward = Math.abs((q[0] - e0[0]) * -dz + (q[2] - e0[2]) * dx)
  return [along, Math.hypot(inward, q[1] - e0[1])]
}

/**
 * The roof `roof` over the top floor (see the header): `base` the roof slab's top, `eave` the eaves' height (a set's printed
 * eave, else the slab), `ridge` the ridge's height as a set prints it (used when no pitch is set). A flat roof: its skylights.
 */
export function roofGeometry(pts: Pt[], dir: Pt, roof: Roof, base: number, eave: number, ridge?: number): RoofParts {
  let u = { x: dir.x, y: dir.y }
  let v = { x: -u.y, y: u.x }
  const span = (d: Pt) => {
    const t = pts.map((p) => p.x * d.x + p.y * d.y)
    return [Math.min(...t), Math.max(...t)]
  }
  let [a0, a1] = span(u)
  let [b0, b1] = span(v)
  const turn = () => ([u, v, a0, a1, b0, b1] = [v, { x: -u.x, y: -u.y }, b0, b1, -a1, -a0])
  if (a1 - a0 < b1 - b0) turn() // (the ridge runs down the long side)
  if (roof.ridge === 'short') turn() // (… or across it)
  const at = ([a, b, y]: P): number[] => [a * u.x + b * v.x, y, a * u.y + b * v.y]
  const W = b1 - b0
  const L = a1 - a0
  const bm = (b0 + b1) / 2
  const o = roof.kind === 'flat' ? 0 : (roof.overhangM ?? 0)
  const shed = roof.kind === 'shed'
  // the pitch: as set, else as the set's eave and ridge make it, else the default
  const tan = roof.pitchDeg !== undefined || ridge === undefined || roof.kind === 'mansard' ? Math.tan(((roof.pitchDeg ?? DEFAULT_PITCH) * Math.PI) / 180) : (ridge - eave) / (shed ? W : W / 2)
  const top = roof.pitchDeg === undefined && ridge !== undefined && roof.kind !== 'mansard' ? ridge : eave + (shed ? W : W / 2) * tan
  // the eaves' edge, the overhang past the walls at the slope's pitch (a mansard's kicks out level)
  const E = roof.kind === 'mansard' ? eave : eave - o * tan
  const [A0, A1, B0, B1] = [a0 - o, a1 + o, b0 - o, b1 + o]

  const slopes: P[][] = []
  const walls: P[][] = []
  const knee = (sides: ('a0' | 'a1' | 'b0' | 'b1')[]) => {
    if (eave - base <= 0.01) return
    for (const s of sides)
      walls.push(
        s === 'b0' || s === 'b1'
          ? [a0, a1].map((a) => [a, s === 'b0' ? b0 : b1, base] as P).concat([[a1, s === 'b0' ? b0 : b1, eave], [a0, s === 'b0' ? b0 : b1, eave]])
          : [b0, b1].map((b) => [s === 'a0' ? a0 : a1, b, base] as P).concat([[s === 'a0' ? a0 : a1, b1, eave], [s === 'a0' ? a0 : a1, b0, eave]]),
      )
  }
  /** a hip over the box x0..x1 × y0..y1 from its eaves at e up to the ridge at r (both main slopes first, then the ends) */
  const hip = (x0: number, x1: number, y0: number, y1: number, e: number, r: number) => {
    const d = Math.min((y1 - y0) / 2, (x1 - x0) / 2)
    const m = (y0 + y1) / 2
    slopes.push(
      [[x0, y0, e], [x1, y0, e], [x1 - d, m, r], [x0 + d, m, r]],
      [[x1, y1, e], [x0, y1, e], [x0 + d, m, r], [x1 - d, m, r]],
      [[x0, y1, e], [x0, y0, e], [x0 + d, m, r]],
      [[x1, y0, e], [x1, y1, e], [x1 - d, m, r]],
    )
  }
  if (roof.kind === 'gable') {
    slopes.push([[A0, B0, E], [A1, B0, E], [A1, bm, top], [A0, bm, top]], [[A1, B1, E], [A0, B1, E], [A0, bm, top], [A1, bm, top]])
    knee(['b0', 'b1'])
    walls.push(...[a0, a1].map((a): P[] => [[a, b0, base], [a, b1, base], [a, b1, eave], [a, bm, top], [a, b0, eave]]))
  } else if (roof.kind === 'hip') {
    hip(A0, A1, B0, B1, E, top)
    knee(['b0', 'b1', 'a0', 'a1'])
  } else if (shed) {
    slopes.push([[A0, B0, E], [A1, B0, E], [A1, B1, E + (W + 2 * o) * tan], [A0, B1, E + (W + 2 * o) * tan]])
    knee(['b0'])
    walls.push([[a0, b1, base], [a1, b1, base], [a1, b1, top], [a0, b1, top]], ...[a0, a1].map((a): P[] => [[a, b0, base], [a, b1, base], [a, b1, top], [a, b0, eave]]))
  } else if (roof.kind === 'mansard') {
    // the lower slopes: steep, an attic storey high, in from the walls by what that steepness takes (less on a narrow house)
    const m = Math.min(MANSARD_M / Math.tan((MANSARD_DEG * Math.PI) / 180), Math.min(W, L) * 0.22)
    const h = m * Math.tan((MANSARD_DEG * Math.PI) / 180)
    const [i0, i1, j0, j1] = [a0 + m, a1 - m, b0 + m, b1 - m]
    slopes.push(
      [[A0, B0, E], [A1, B0, E], [i1, j0, E + h], [i0, j0, E + h]],
      [[A1, B1, E], [A0, B1, E], [i0, j1, E + h], [i1, j1, E + h]],
      [[A0, B1, E], [A0, B0, E], [i0, j0, E + h], [i0, j1, E + h]],
      [[A1, B0, E], [A1, B1, E], [i1, j1, E + h], [i1, j0, E + h]],
    )
    hip(i0, i1, j0, j1, E + h, E + h + ((j1 - j0) / 2) * tan)
    knee(['b0', 'b1', 'a0', 'a1'])
  }

  const trim: P[][] = []
  const lid: P[][] = []
  // under an overhang: the fascia along each edge lying on the eaves' outline (eaves and rakes, never a ridge or a hip), the
  // soffit: each slope again just under itself, facing down
  if (o > 0) {
    const on = (p: P, q: P) => [[0, A0], [0, A1], [1, B0], [1, B1]].some(([i, x]) => Math.abs(p[i] - x) < 1e-6 && Math.abs(q[i] - x) < 1e-6)
    for (const s of slopes.slice(0, roof.kind === 'mansard' ? 4 : undefined))
      s.forEach((p, i) => {
        const q = s[(i + 1) % s.length]
        if (on(p, q)) trim.push([p, q, [q[0], q[1], q[2] - FASCIA_M], [p[0], p[1], p[2] - FASCIA_M]])
      })
    for (const s of slopes) lid.push(s.map(([a, b, y]): P => [a, b, y - SOFFIT_M]))
  }

  // roof windows: on the front (0) or back (1) slope — a shed's one, a mansard's lower ones — its middle along and up the slope
  const glass: { quad: P[]; w: number; h: number }[] = []
  const slopeOf = (side: 0 | 1) => slopes[shed ? 0 : side]
  for (const w of roof.windows ?? []) {
    if (roof.kind === 'flat') {
      // a skylight on the deck: a curb 15 cm high, the glass on it
      const [ca, cb] = [a0 + MARGIN_M + w.wM / 2 + w.along * Math.max(0, L - 2 * MARGIN_M - w.wM), b0 + MARGIN_M + w.hM / 2 + w.up * Math.max(0, W - 2 * MARGIN_M - w.hM)]
      const [x0, x1, y0, y1] = [ca - w.wM / 2, ca + w.wM / 2, cb - w.hM / 2, cb + w.hM / 2]
      const c = base + 0.15
      walls.push([[x0, y0, base], [x1, y0, base], [x1, y0, c], [x0, y0, c]], [[x1, y0, base], [x1, y1, base], [x1, y1, c], [x1, y0, c]], [[x1, y1, base], [x0, y1, base], [x0, y1, c], [x1, y1, c]], [[x0, y1, base], [x0, y0, base], [x0, y0, c], [x0, y1, c]])
      glass.push({ quad: [[x0, y0, c], [x1, y0, c], [x1, y1, c], [x0, y1, c]], w: w.wM, h: w.hM })
      continue
    }
    const s = slopeOf(w.side)
    // the slope as its eave edge (e0 → e1) and the line up to its top: along a, up the fall line
    const [e0, e1] = s
    const sgn = Math.sign(s[2][1] - e0[1]) || 1 // which way across the box it rises
    const rise = s[2][2] - e0[2]
    const run = Math.abs(s[2][1] - e0[1])
    const len = Math.hypot(rise, run)
    if (len < w.hM + 2 * MARGIN_M) continue // (no room up this slope)
    const vc = MARGIN_M + w.hM / 2 + w.up * (len - 2 * MARGIN_M - w.hM)
    // a hip's or mansard's slope narrows as it rises: the window stays inside it at its top edge
    const narrow = ((vc + w.hM / 2) / len) * Math.max(0, Math.abs(e1[0] - e0[0]) - Math.abs(s[2][0] - (s[3] ?? s[2])[0]) ) / 2
    const lo = Math.min(e0[0], e1[0]) + narrow + MARGIN_M + w.wM / 2
    const hi = Math.max(e0[0], e1[0]) - narrow - MARGIN_M - w.wM / 2
    if (hi < lo) continue
    const ac = lo + w.along * (hi - lo)
    const [cos, sin] = [run / len, rise / len]
    const pt = (a: number, vv: number, lift: number): P => [a, e0[1] + sgn * (vv * cos - lift * sin), e0[2] + vv * sin + lift * cos]
    const [v0, v1, x0, x1] = [vc - w.hM / 2, vc + w.hM / 2, ac - w.wM / 2, ac + w.wM / 2]
    glass.push({ quad: [pt(x0, v0, RAISE_M), pt(x1, v0, RAISE_M), pt(x1, v1, RAISE_M), pt(x0, v1, RAISE_M)], w: w.wM, h: w.hM })
    // its flashing: the four sides from the slope up to the glass
    for (const [p, q] of [[[x0, v0], [x1, v0]], [[x1, v0], [x1, v1]], [[x1, v1], [x0, v1]], [[x0, v1], [x0, v0]]])
      trim.push([pt(p[0], p[1], 0), pt(q[0], q[1], 0), pt(q[0], q[1], RAISE_M), pt(p[0], p[1], RAISE_M)])
  }
  // solar panels and chimneys: placed as a roof window, standing on a flat roof's deck, on a slope lying on it (building.ts)
  const spots: RoofParts['spots'] = []
  const yawOf = (p: P, q: P) => {
    const [a, b] = [at(p), at(q)]
    return Math.atan2(b[0] - a[0], b[2] - a[2])
  }
  for (const w of roof.pieces ?? []) {
    const { w: pw, h: ph } = PIECE_PLAN[w.kind]
    if (roof.kind === 'flat') {
      const [ca, cb] = [a0 + MARGIN_M + pw / 2 + w.along * Math.max(0, L - 2 * MARGIN_M - pw), b0 + MARGIN_M + ph / 2 + w.up * Math.max(0, W - 2 * MARGIN_M - ph)]
      spots.push({ kind: w.kind, at: at([ca, cb, base]) as [number, number, number], yaw: yawOf([ca, cb, 0], [ca, cb - 1, 0]), tilt: 0 })
      continue
    }
    const s = slopeOf(w.side)
    const [e0, e1] = s
    const sgn = Math.sign(s[2][1] - e0[1]) || 1
    const rise = s[2][2] - e0[2]
    const run = Math.abs(s[2][1] - e0[1])
    const len = Math.hypot(rise, run)
    if (len < ph + 2 * MARGIN_M) continue
    const vc = MARGIN_M + ph / 2 + w.up * (len - 2 * MARGIN_M - ph)
    const lo = Math.min(e0[0], e1[0]) + MARGIN_M + pw / 2 + ((vc / len) * Math.max(0, Math.abs(e1[0] - e0[0]) - Math.abs(s[2][0] - (s[3] ?? s[2])[0]))) / 2
    const hi = Math.max(e0[0], e1[0]) - (lo - Math.min(e0[0], e1[0]))
    if (hi < lo) continue
    const ac = lo + w.along * (hi - lo)
    const bc = e0[1] + sgn * vc * (run / len)
    spots.push({ kind: w.kind, at: at([ac, bc, e0[2] + vc * (rise / len)]) as [number, number, number], yaw: yawOf([ac, bc, 0], [ac, bc - sgn, 0]), tilt: Math.atan2(rise, run) })
  }

  // the cornice: a band 30 cm deep round the walls just under the eaves (a flat roof's is drawn with its parapet, building.ts)
  if (roof.cornice && roof.kind !== 'flat')
    for (const [p, q, n] of [[[a0, b0], [a1, b0], [0, -1]], [[a1, b0], [a1, b1], [1, 0]], [[a1, b1], [a0, b1], [0, 1]], [[a0, b1], [a0, b0], [-1, 0]]] as [number[], number[], number[]][]) {
      // out from the wall by d, on past each corner by d (the next side's band meets it there)
      const d = 0.15
      const t = [-n[1], n[0]] // (along the side, p → q: the outward normal turned a quarter)
      const [pa, pb, qa, qb] = [p[0] + (n[0] - t[0]) * d, p[1] + (n[1] - t[1]) * d, q[0] + (n[0] + t[0]) * d, q[1] + (n[1] + t[1]) * d]
      const [y0, y1] = [eave - 0.4, eave - 0.1]
      walls.push([[pa, pb, y0], [qa, qb, y0], [qa, qb, y1], [pa, pb, y1]], [[p[0], p[1], y1], [q[0], q[1], y1], [qa, qb, y1], [pa, pb, y1]], [[p[0], p[1], y0], [q[0], q[1], y0], [qa, qb, y0], [pa, pb, y0]])
    }

  const cover = faces(slopes.map((s) => s.map(at)), slopeUv, o > 0 ? 1 : 0)
  const paint = faces([...trim.map((s) => s.map(at))], wallUv)
  const soffit = lid.length ? faces(lid.map((s) => s.map(at)), wallUv, -1) : null
  const panes = new THREE.BufferGeometry()
  {
    const pos: number[] = []
    const card: number[] = []
    for (const { quad, w, h } of glass) {
      const c = quad.map(at)
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]]
      // facing the sky (the pane's material is one-sided): (c1 − c0) × (c2 − c0) pointing down takes the other winding
      const ny = (c[1][2] - c[0][2]) * (c[2][0] - c[0][0]) - (c[1][0] - c[0][0]) * (c[2][2] - c[0][2])
      for (const i of ny < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) pos.push(...c[i]), card.push(uv[i][0], uv[i][1], w, h)
    }
    panes.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    panes.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2))
    panes.setAttribute('pane', new THREE.Float32BufferAttribute(card, 4))
    panes.computeVertexNormals()
  }
  const wallGeo = faces(walls.map((s) => s.map(at)), wallUv)
  return { cover, walls: wallGeo, trim: soffit ? merged(paint, soffit) : paint, panes, spots }
}

/** two non-indexed geometries of the same attributes as one */
function merged(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  for (const k of ['position', 'normal', 'uv']) {
    const [x, y] = [a.attributes[k], b.attributes[k]]
    const arr = new Float32Array(x.array.length + y.array.length)
    arr.set(x.array as Float32Array)
    arr.set(y.array as Float32Array, x.array.length)
    g.setAttribute(k, new THREE.BufferAttribute(arr, x.itemSize))
  }
  a.dispose()
  b.dispose()
  return g
}
