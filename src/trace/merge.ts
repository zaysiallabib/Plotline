/**
 * ROOMS ON TRACKS — the wave-19 integration step: one draft from the walls on tracks (tracks.ts) and the rooms fitted
 * from their printed sizes (rooms.ts). Pure, sheet pixels (pixel centres, like tracks.ts).
 *
 * Tracks are the truth for wall geometry: where a track wall is, it wins (position, thickness, ends). The fitted rooms'
 * edges (deriveWallsFromRooms: one line per room boundary, split into wall / door / window / thin / open / unsure
 * stretches) only add what no track has:
 *  - an UNDECIDED track gap (nothing drawn the tracer could read) that the room edges on its line call door / window
 *    over most of its width becomes that opening (two independent readings agree); nothing drawn by either → a passage
 *    (the hand traces' open-plan convention: a wall that is all opening); a dark band across all of it → wall (a
 *    light-grey wall the ink cut missed); a thin line or a mix → stays open, review item. A gap the tracer DID decide
 *    is kept; room edges reading another kind there → review item;
 *  - room-edge stretches on no track wall and no track gap: wall → a wall (light-grey walls, walls between columns);
 *    door / window → an opening on a piece of wall of that extent; thin (one thin line: railing / parapet) → a LOW wall
 *    (WallSeg.heightM 1.1, like the hand traces' railings; core Wall.heightM carries it); plant green beyond a one-sided
 *    face → the planter's edge, a 0.45 m low wall (the hand traces' planter edge); an undecided stretch whose whole
 *    length shows a glazing profile → a window (on a veranda's open side: its railing); open between two fitted rooms →
 *    a passage piece (an open-plan boundary, so both rooms stay separate labelled rooms); one-sided open / unsure →
 *    nothing, review item. Every low wall and passage is a review item too;
 *  - added pieces' ends snap onto the track walls: collinear onto a track wall's end, else onto a perpendicular wall's
 *    centre line (an opening keeps its face-to-face span; a short connector carries the wall into the corner); then
 *    `closeCorners` carries free ends a few cm onto the wall they obviously meet.
 * Never a wall over a window or an undecided gap: those are openings, or left open.
 */
import { darkMaxOf, deriveWallsFromRooms, type EdgeClass, type RgbImage, type RoomFit } from './rooms'
import { trackWalls, type Gap, type TrackTrace } from './tracks'
import type { Gray, OpeningGuess, Px, WallSeg } from './types'
import { glazing } from './walls'

/** what the rooms said about one stretch of a line (pixel-centre coordinates along it) */
interface Item {
  horiz: boolean
  c: number
  u0: number
  u1: number
  /** drawn thickness (px); 0 for stretches that make no wall */
  th: number
  /** + re-read 'unsure' / 'thin' stretches: plant green beyond the face, or a glazing profile (light band / ≥ 2 lines) */
  kind: EdgeClass | 'planter' | 'glazing'
  hingeAt?: Px
  swingTo?: Px
  /** fits it bounds (two = shared by facing rooms) */
  rooms: number[]
  /** one-sided stretches: outward from the room (−1 top / left, +1 bottom / right); `c` is then the room's face line */
  out?: 1 | -1
}

interface Img {
  /** every room label / seed point on the sheet (px): what lies beyond an open side */
  labels?: Px[]
  gray: Gray
  rgb?: RgbImage
}

/** an added axis-aligned piece, px */
interface Piece {
  horiz: boolean
  c: number
  u0: number
  u1: number
  th: number
  kind: 'wall' | 'low' | 'door' | 'window' | 'passage'
  /** a low piece's height, m */
  heightM?: number
  hingeAt?: Px
  swingTo?: Px
  pinned?: boolean
}

export interface MergeReview {
  a: Px
  b: Px
  kind: 'thin' | 'open' | 'unsure' | 'conflict' | 'low' | 'gap-thin'
  message: string
}

export interface RoomsOnTracks {
  /** the whole wall stage again: the track walls (gaps the rooms decided now carry their opening), the angled walls, the added pieces (`low` = railing / parapet) and their connectors, px */
  walls: WallSeg[]
  /** every opening: the tracks' (decided gaps included, undecided ones as 'unknown') and the added pieces', px */
  openings: OpeningGuess[]
  /** stretches left for the human */
  review: MergeReview[]
  /** for the eval: every added piece by kind, px */
  added: { a: Px; b: Px; kind: Piece['kind'] | 'gap-door' | 'gap-window' | 'gap-passage' | 'gap-wall' | 'corner' | 'dropped'; th: number }[]
  stats: { unknownGaps: number; decided: Record<string, number> }
  /** for the eval: every track gap, what the room edges read along it (share of its width per class), what it became */
  gapReads: { a: Px; b: Px; was: string; now: string; read: Record<string, number> }[]
}

const P = (horiz: boolean, c: number, u: number): Px => (horiz ? { x: u, y: c } : { x: c, y: u })
/** low walls as the hand traces have them: a railing / parapet, a planter's edge (m) */
const RAILING_M = 1.1, PLANTER_M = 0.45

/** derived room boundaries → line items (a wall split at its openings) */
function itemsOf(fits: RoomFit[], k: number, img: Img): Item[] {
  const rw = deriveWallsFromRooms(fits, k)
  const out: Item[] = []
  const line = (a: Px, b: Px) => {
    const horiz = Math.abs(a.y - b.y) < 1e-6
    return { horiz, c: horiz ? a.y : a.x, u0: Math.min(horiz ? a.x : a.y, horiz ? b.x : b.y), u1: Math.max(horiz ? a.x : a.y, horiz ? b.x : b.y) }
  }
  rw.walls.forEach((w, i) => {
    const l = line(w.a, w.b)
    const ops = rw.openings.filter((o) => o.wall === i).map((o) => ({ o, ...line(o.a, o.b) })).sort((p, q) => p.u0 - q.u0)
    let u = l.u0
    for (const op of ops) {
      if (op.u0 > u) out.push({ ...l, u0: u, u1: op.u0, th: w.thicknessPx, kind: 'wall', rooms: [] })
      out.push({ ...l, u0: Math.max(u, op.u0), u1: op.u1, th: w.thicknessPx, kind: op.o.kind as EdgeClass, hingeAt: op.o.hingeAt, swingTo: op.o.swingTo, rooms: [] })
      u = Math.max(u, op.u1)
    }
    if (l.u1 > u) out.push({ ...l, u0: u, u1: l.u1, th: w.thicknessPx, kind: 'wall', rooms: [] })
  })
  for (const x of rw.unwalled) {
    const l = line(x.a, x.b)
    let side: 1 | -1 | undefined
    if (x.rooms.length === 1) {
      const r = fits[x.rooms[0]].rect
      const [lo, hi] = l.horiz ? [r.y0 - 0.5, r.y1 - 0.5] : [r.x0 - 0.5, r.x1 - 0.5]
      side = Math.abs(l.c - lo) <= Math.abs(l.c - hi) ? -1 : 1
    }
    out.push({ ...l, th: 0, kind: x.kind, rooms: x.rooms, ...(side ? { out: side } : {}) })
  }
  // a room side drawn in bits (glazing with mullions, a tile grid crossing an open-plan line, a frame's short dark jambs)
  // comes out as alternating short stretches: such a run — undecided stretches of one side (or of one shared boundary)
  // with short wall bits (< 0.3 m) between them — is read again as one
  const und = (it: Item) => it.kind === 'open' || it.kind === 'thin' || it.kind === 'unsure'
  const bits = (it: Item, c: number, horiz: boolean) => it.kind === 'wall' && it.horiz === horiz && it.u1 - it.u0 < 0.3 * k && Math.abs(it.c - c) <= it.th / 2 + 2
  // (grouped by the rooms they bound first: another room's stretch on a near line never cuts a run)
  const lines = out.filter(und).sort((p, q) => Number(p.horiz) - Number(q.horiz) || p.rooms.join().localeCompare(q.rooms.join()) || Math.round(p.c) - Math.round(q.c) || p.u0 - q.u0)
  const drop = new Set<Item>()
  const merged: Item[] = []
  for (let i = 0; i < lines.length; ) {
    const run = [lines[i]], walls: Item[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      const a = run[run.length - 1], b = lines[j]
      if (b.horiz !== a.horiz || Math.abs(b.c - a.c) > 0.5 || b.rooms.join() !== a.rooms.join()) break
      if (b.u0 - a.u1 > 2) {
        // only short wall bits may fill the space between
        const fill = out.filter((w) => bits(w, a.c, a.horiz) && w.u0 >= a.u1 - 2 && w.u1 <= b.u0 + 2)
        const covered = fill.reduce((t, w) => t + w.u1 - w.u0, 0)
        if (b.u0 - a.u1 > 0.3 * k || covered < b.u0 - a.u1 - 4) break
        walls.push(...fill)
      }
      run.push(b)
    }
    i = j
    if (run.length + walls.length < 2) {
      const it = run[0]
      if (it.kind === 'unsure' || it.kind === 'thin') it.kind = reread(it, k, img) ?? it.kind
      continue
    }
    const M: Item = { ...run[0], u1: run[run.length - 1].u1, kind: 'unsure', hingeAt: undefined, swingTo: undefined }
    const L = M.u1 - M.u0
    const f = (kd: string) => run.filter((x) => x.kind === kd).reduce((t, x) => t + x.u1 - x.u0, 0) / L
    // between two fitted rooms with nothing on it that makes a wall (open, a thin line, doubts: furniture drawn against
    // the line) the boundary is open plan: a passage — no wall drawn, both rooms keep their name, flagged
    // (one-sided, 'open' too: whether another named space lies beyond decides passage or review, below)
    const say = f('open') + f('thin') >= 0.4 && f('wall') + f('window') + f('door') < 0.1 && (M.rooms.length === 2 || f('open') >= 0.4) ? 'open' : reread(M, k, img)
    if (!say) {
      for (const it of run) if (it.kind === 'unsure' || it.kind === 'thin') it.kind = reread(it, k, img) ?? it.kind
      continue
    }
    M.kind = say
    for (const x of [...run, ...walls]) drop.add(x)
    merged.push(M)
  }
  return [...out.filter((it) => !drop.has(it)), ...merged].filter((it) => it.u1 - it.u0 > 0.5)
}

const isGreen = (rgb: RgbImage, p: Px) => {
  const x = Math.round(p.x), y = Math.round(p.y)
  if (x < 0 || y < 0 || x >= rgb.width || y >= rgb.height) return false
  const i = (y * rgb.width + x) * 4
  return rgb.data[i + 1] - rgb.data[i] >= 12 && rgb.data[i + 1] - rgb.data[i + 2] >= 20
}

/**
 * What an 'unsure' / 'thin' stretch is after all, read again with the whole stretch at once: plant green beyond a
 * one-sided face along most of it → 'planter' (its edge, under the foliage); a glazing profile across it — a light band
 * at least 5 cm (3 px) wide or ≥ 2 lines running along 80 % of it (walls.ts `glazing`, the wall stage's window rule),
 * within the wall depth beyond the face — → 'glazing' (a window, or on a veranda's open side its parapet). Else null.
 */
function reread(it: Item, k: number, img: Img): 'planter' | 'glazing' | null {
  const len = it.u1 - it.u0
  if (len < 0.3 * k) return null
  if (it.out && img.rgb) {
    let n = 0, hit = 0
    for (let u = it.u0 + 1; u < it.u1 - 1; u += 2) {
      let g = 0, m = 0
      for (let d = 1; d <= 0.3 * k; d++, m++) if (isGreen(img.rgb, P(it.horiz, it.c + it.out * d, u))) g++
      n++
      if (g >= 0.4 * m) hit++
    }
    if (n && hit >= 0.6 * n) return 'planter'
  }
  if (it.kind !== 'unsure') return null
  const { width: W, height: H, data } = img.gray
  const grayAt = (x: number, y: number) => data[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))]
  const c = it.out ? it.c + it.out * 0.1 * k : it.c
  const gz = glazing(P(it.horiz, c, it.u0), it.horiz ? 1 : 0, it.horiz ? 0 : 1, len, it.out ? 0.2 * k : 0.25 * k, grayAt)
  return gz.lines >= 2 || gz.band >= Math.max(3, 0.05 * k) ? 'glazing' : null
}

/**
 * Corner holes: a free end (a wall's, or an opening's whose far jamb met no wall) that stops a few centimetres short of
 * the wall it obviously meets — under the tracks' own smallest gap (0.3 m), so it is no opening — is carried on along its
 * own axis (never tilted): onto a perpendicular wall's (or opening's) centre line ahead (≤ 0.1 m past its face; when that
 * wall stops a hair short of this line — ≤ 0.04 m — it carries on to meet it: its own free end moves, else a stub on its
 * own line), across ≤ 0.15 m to the next wall of the same track, or, where a wall steps sideways (≤ 0.4 m) and carries on
 * from right here (its end within 0.1 m along), by a jog onto it. An opening's end gets a connector wall (the opening
 * keeps its jamb-to-jamb span). Mutates `walls`, returns the connectors / stubs / jogs added. Axis walls only.
 */
export function closeCorners(walls: WallSeg[], openings: OpeningGuess[], k: number, solid: (a: Px, b: Px) => number = () => 0): WallSeg[] {
  type L = { s: WallSeg | OpeningGuess; wall: boolean; horiz: boolean; c: number; th: number }
  const key = (p: Px) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  const deg = new Map<string, number>()
  const lines: L[] = []
  // (an undecided gap is no graph edge: the wall ends beside it are free)
  for (const [s, wall] of [...walls.map((w) => [w, true] as const), ...openings.filter((o) => o.kind !== 'unknown').map((o) => [o, false] as const)]) {
    if (s.a.x === s.b.x && s.a.y === s.b.y) continue
    for (const p of [s.a, s.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1)
    const horiz = Math.abs(s.a.y - s.b.y) < 1e-6, vert = Math.abs(s.a.x - s.b.x) < 1e-6
    if ((horiz || vert) && (wall || (s as OpeningGuess).kind !== 'unknown')) lines.push({ s, wall, horiz, c: horiz ? s.a.y : s.a.x, th: (wall ? (s as WallSeg).thicknessPx : (s as OpeningGuess).thicknessPx) ?? 0.127 * k })
  }
  const along = (l: L, p: Px) => (l.horiz ? p.x : p.y)
  const span = (l: L) => [Math.min(along(l, l.s.a), along(l, l.s.b)), Math.max(along(l, l.s.a), along(l, l.s.b))]
  const R = Math.max(3, 0.1 * k), Rc = Math.max(3, 0.15 * k), Rs = Math.max(3, 0.15 * k), Rj = 0.4 * k, Rh = Math.max(2, 0.04 * k)
  const added: WallSeg[] = []
  const bump = (p: Px, n: number) => deg.set(key(p), (deg.get(key(p)) ?? 0) + n)
  /** a wall beside S's line (bodies touching) over u … v: the ink there is that wall's, not S's to run on */
  const alongside = (S: L, u: number, v: number) =>
    lines.some((W) => W.wall && W.s !== S.s && W.horiz === S.horiz && Math.abs(W.c - S.c) > 0.01 && Math.abs(W.c - S.c) < (W.th + S.th) / 2 && Math.min(span(W)[1], Math.max(u, v)) - Math.max(span(W)[0], Math.min(u, v)) > 1)
  // a connector / stub / jog joins the lines at once, so the ends handled after it meet it (degrees: the caller bumps)
  const addWall = (w: WallSeg) => {
    added.push(w)
    const horiz = Math.abs(w.a.y - w.b.y) < 1e-6
    if (horiz || Math.abs(w.a.x - w.b.x) < 1e-6) lines.push({ s: w, wall: true, horiz, c: horiz ? w.a.y : w.a.x, th: w.thicknessPx })
  }
  // twice: a connector made for a later end can be what an earlier end meets
  for (let pass = 0; pass < 2; pass++)
  for (const S of lines)
    for (const e of ['a', 'b'] as const) {
      const E = S.s[e]
      if (deg.get(key(E)) !== 1) continue
      const o = S.s[e === 'a' ? 'b' : 'a']
      const u = along(S, E), dir = Math.sign(u - along(S, o))
      const P = (U: number, C: number): Px => (S.horiz ? { x: U, y: C } : { x: C, y: U })
      let best: { cost: number; go: () => void } | null = null
      const offer = (cost: number, go: () => void) => {
        if (!best || cost < best.cost) best = { cost, go }
      }
      for (const Q of lines) {
        if (Q.s === S.s) continue
        const [q0, q1] = span(Q)
        if (Q.horiz !== S.horiz) {
          // a wall (or a decided opening) across this end, its body just ahead
          const s = (Q.c - u) * dir
          if (s < -Q.th / 2 || S.c < q0 - R - S.th / 2 || S.c > q1 + R + S.th / 2) continue
          // farther only across solid ink (a column or a junction block the wall runs through), up to 0.6 m
          if (s > Q.th / 2 + R && (s > Q.th / 2 + 0.6 * k || solid(E, P(Q.c - (dir * Q.th) / 2, S.c)) < 0.9 || alongside(S, u, Q.c))) continue
          if (S.wall && Math.abs(Q.c - along(S, o)) < 1) continue
          const lo = S.c < q0, hi = S.c > q1
          let qe: 'a' | 'b' | null = null
          if (lo || hi) {
            // past its end: only a wall, and then by a hair unless its end is free to come over
            const at = lo ? q0 : q1
            qe = Math.abs(along(Q, Q.s.a) - at) < 1e-6 ? 'a' : 'b'
            if (!Q.wall || (deg.get(key(Q.s[qe])) !== 1 && Math.abs(S.c - at) > Rh)) continue
          }
          offer(Math.abs(s) + (qe ? Math.abs(S.c - along(Q, Q.s[qe])) : 0), () => {
            const X = P(Q.c, S.c)
            if (qe && deg.get(key(Q.s[qe])) === 1) {
              deg.set(key(Q.s[qe]), 0)
              ;(Q.s as WallSeg)[qe] = X
              bump(X, 1)
            } else if (qe) {
              addWall({ a: { ...Q.s[qe] }, b: X, thicknessPx: Q.th, conf: 0.6 })
              bump(Q.s[qe], 1)
              bump(X, 1)
            }
            reach(X)
          })
        } else if (Math.abs(Q.c - S.c) < 0.01) {
          // the next wall of this track, a hair away
          for (const qe of ['a', 'b'] as const) {
            const g = (along(Q, Q.s[qe]) - u) * dir
            if (g > 0 && (g <= Rc || (g <= 0.6 * k && solid(E, Q.s[qe]) >= 0.9))) offer(g, () => reach(Q.s[qe]))
          }
        } else if (Q.wall && Math.abs(Q.c - S.c) <= Rj) {
          // a stepped wall carrying on from right here: a jog across, at its end
          for (const qe of ['a', 'b'] as const) {
            const F = Q.s[qe], fo = Q.s[qe === 'a' ? 'b' : 'a']
            const uf = along(Q, F)
            if (Math.abs(uf - u) > Rs || (along(Q, fo) - uf) * dir <= 0) continue
            offer(Math.abs(Q.c - S.c) + Math.abs(uf - u), () => {
              const X = P(uf, S.c)
              reach(X)
              addWall({ a: { ...X }, b: { ...F }, thicknessPx: Math.min(S.th, Q.th), conf: 0.6 })
              bump(F, 1)
            })
          }
        }
      }
      // carry E to X: a wall's end moves (along its own axis), an opening's end gets a connector
      function reach(X: Px) {
        if (S.wall) {
          deg.set(key(E), 0)
          ;(S.s as WallSeg)[e] = X
        } else {
          addWall({ a: { ...E }, b: X, thicknessPx: S.th, conf: 0.6 })
          deg.set(key(E), 2)
        }
        deg.set(key(X), (deg.get(key(X)) ?? 0) + 2)
      }
      ;(best as { go: () => void } | null)?.go()
    }
  return added
}

/** spans [a, b] minus the union of `cut` spans */
function subtract(a: number, b: number, cut: [number, number][]): [number, number][] {
  let out: [number, number][] = [[a, b]]
  for (const [c0, c1] of cut) out = out.flatMap(([p, q]) => (c1 <= p || c0 >= q ? [[p, q]] : ([[p, Math.min(q, c0)], [Math.max(p, c1), q]] as [number, number][]).filter(([x, y]) => y - x > 1e-6)))
  return out
}

/** The rooms' edges onto the tracks (`angled`: the wall stage's off-axis walls, kept as they are): one wall trace again. */
export function roomsOnTracks(tt: Pick<TrackTrace, 'tracks' | 'joins' | 'gaps'>, angled: WallSeg[], fits: RoomFit[], k: number, img: Img): RoomsOnTracks {
  const tol = Math.max(2, 0.03 * k)
  const items = itemsOf(fits, k, img)
  const review: MergeReview[] = []
  const added: RoomsOnTracks['added'] = []
  const decided: Record<string, number> = {}
  const len = (it: { u0: number; u1: number }) => it.u1 - it.u0
  const on = (it: Item, horiz: boolean, c: number, th: number) => it.horiz === horiz && Math.abs(it.c - c) <= (it.th + th) / 2 + tol

  // ── gaps: what the room edges on the gap's line say along it
  const gaps = tt.gaps.map((g) => ({ ...g }))
  const extraWalls: WallSeg[] = []
  const walled = new Set<Gap>()
  const gapReads: RoomsOnTracks['gapReads'] = []
  for (const g of gaps) {
    const here = items.filter((it) => on(it, g.horiz, g.c, g.thPx) && it.u1 > g.u0 && it.u0 < g.u1)
    const n = Math.max(1, Math.round(g.u1 - g.u0))
    const cnt: Record<string, number> = {}
    for (let i = 0; i < n; i++) {
      const u = g.u0 + (i + 0.5) * ((g.u1 - g.u0) / n)
      const ks = new Set(here.filter((it) => it.u0 <= u && u < it.u1).map((it) => (it.kind === 'glazing' ? 'window' : it.kind === 'planter' ? 'unsure' : it.kind)))
      const pos = ['door', 'window', 'wall'].filter((x) => ks.has(x as EdgeClass))
      const c = pos.length > 1 ? 'conflict' : pos.length ? pos[0] : ks.has('thin') ? 'thin' : ks.has('unsure') ? 'unsure' : ks.has('open') ? 'open' : 'none'
      cnt[c] = (cnt[c] ?? 0) + 1 / n
    }
    const door = here.find((it) => it.kind === 'door' && it.hingeAt)
    const f = (x: string) => cnt[x] ?? 0
    const other = (x: string) => ['door', 'window', 'wall', 'conflict'].filter((y) => y !== x).reduce((t, y) => t + f(y), 0)
    const say = (['door', 'window', 'wall'] as const).find((x) => f(x) >= 0.6 && other(x) <= 0.25) ?? (f('open') >= 0.8 ? 'passage' : null)
    const a = P(g.horiz, g.c, g.u0), b = P(g.horiz, g.c, g.u1)
    const w = `${((g.u1 - g.u0) / k).toFixed(2)} m`
    gapReads.push({ a, b, was: g.kind, now: g.kind === 'unknown' ? (say ?? 'unknown') : g.kind, read: cnt })
    if (g.kind !== 'unknown') {
      if (say && say !== g.kind && say !== 'passage') review.push({ a, b, kind: 'conflict', message: `The drawing reads as a ${g.kind} here, the room edges as a ${say} — check this ${w} opening` })
      continue
    }
    if (say === 'door' || say === 'window' || say === 'passage') {
      g.kind = say as Gap['kind']
      g.conf = say === 'passage' ? 0.3 : 0.6
      if (say === 'door' && door) (g.hingeAt = door.hingeAt), (g.swingTo = door.swingTo)
      decided[say] = (decided[say] ?? 0) + 1
      added.push({ a, b, kind: `gap-${say}`, th: g.thPx })
    } else if (say === 'wall') {
      // a dark band the room edges see all across, which the tracer's ink cut did not: one wall node to node
      extraWalls.push({ a: P(g.horiz, g.c, g.node0), b: P(g.horiz, g.c, g.node1), thicknessPx: g.thPx, conf: 0.6 })
      if (g.jog) extraWalls.push({ a: P(g.horiz, g.c, g.jog.u), b: P(g.horiz, g.jog.c, g.jog.u), thicknessPx: g.thPx, conf: 0.6 })
      walled.add(g)
      decided.wall = (decided.wall ?? 0) + 1
      added.push({ a, b, kind: 'gap-wall', th: g.thPx })
    } else if (f('thin') >= 0.6) review.push({ a, b, kind: 'gap-thin', message: `A ${w} gap with one thin line across it — a door leaf, a railing or glass? Nothing traced` })
  }
  const unknownGaps = tt.gaps.filter((g) => g.kind === 'unknown').length

  // ── room-edge stretches on no track wall and no track gap
  const pieces: Piece[] = []
  /** a room label 0.3–4 m beyond a one-sided stretch, facing it (along its span ± 0.3 m), with no track wall between */
  const labelBeyond = (it: Item, u0: number, u1: number) => {
    const own = fits[it.rooms[0]]?.at
    return (img.labels ?? []).some((L) => {
      if (own && Math.hypot(L.x - own.x, L.y - own.y) < 2) return false
      const lu = it.horiz ? L.x : L.y, lc = it.horiz ? L.y : L.x
      const d = (lc - it.c) * it.out!
      if (lu < u0 - 0.3 * k || lu > u1 + 0.3 * k || d < 0.3 * k || d > 4 * k) return false
      const u = Math.min(u1, Math.max(u0, lu))
      return !tt.tracks.some((T) => T.horiz === it.horiz && (T.c - it.c) * it.out! > 2 && (T.c - it.c) * it.out! < d && T.intervals.some((iv) => iv.u0 <= u && u <= iv.u1))
    })
  }
  const minLen: Record<Item['kind'], number> = { wall: 0.1, door: 0.45, window: 0.45, thin: 0.5, open: 0.5, unsure: 0.3, glazing: 0.45, planter: 0.5 }
  for (const it of items) {
    const cut: [number, number][] = []
    for (const T of tt.tracks) for (const iv of T.intervals) if (on(it, T.horiz, T.c, iv.thPx)) cut.push([iv.u0, iv.u1])
    for (const g of tt.gaps) if (on(it, g.horiz, g.c, g.thPx)) cut.push([g.u0, g.u1])
    const rest = subtract(it.u0, it.u1, cut).filter(([p, q]) => q - p >= minLen[it.kind] * k)
    // a window / door stretch on a solid track wall: the two readings disagree
    if ((it.kind === 'window' || it.kind === 'door') && len(it) - rest.reduce((t, [p, q]) => t + q - p, 0) >= 0.3 * k) {
      const onWall = subtract(it.u0, it.u1, tt.gaps.filter((g) => on(it, g.horiz, g.c, g.thPx)).map((g) => [g.u0, g.u1] as [number, number]))
      const covered = onWall.reduce((t, [p, q]) => t + q - p, 0) - rest.reduce((t, [p, q]) => t + q - p, 0)
      if (covered >= 0.3 * k) review.push({ a: P(it.horiz, it.c, it.u0), b: P(it.horiz, it.c, it.u1), kind: 'conflict', message: `The room edge reads a ${it.kind} where a solid wall is drawn — check` })
    }
    for (const [u0, u1] of rest) {
      const a = P(it.horiz, it.c, u0), b = P(it.horiz, it.c, u1), w = `${((u1 - u0) / k).toFixed(1)} m`
      if (it.kind === 'wall' || it.kind === 'door' || it.kind === 'window') pieces.push({ horiz: it.horiz, c: it.c, u0, u1, th: it.th, kind: it.kind, hingeAt: it.hingeAt, swingTo: it.swingTo })
      // a thin line between two labelled rooms: no railing indoors — an open-plan boundary (passage), flagged
      else if (it.kind === 'thin' && it.rooms.length === 2) pieces.push({ horiz: it.horiz, c: it.c, u0, u1, th: 0.127 * k, kind: 'passage' })
      else if (it.kind === 'thin') pieces.push({ horiz: it.horiz, c: it.c, u0, u1, th: 0.0635 * k, kind: 'low', heightM: RAILING_M })
      else if (it.kind === 'planter') pieces.push({ horiz: it.horiz, c: it.c, u0, u1, th: 0.0635 * k, kind: 'low', heightM: PLANTER_M })
      // glazing: a window — on a veranda's open side (no room beyond) its parapet / railing
      else if (it.kind === 'glazing' && it.out && fits[it.rooms[0]].label.roomKind === 'balcony') pieces.push({ horiz: it.horiz, c: it.c + it.out * 0.03 * k, u0, u1, th: 0.0635 * k, kind: 'low', heightM: RAILING_M })
      else if (it.kind === 'glazing') pieces.push({ horiz: it.horiz, c: it.out ? it.c + it.out * 0.0635 * k : it.c, u0, u1, th: 0.127 * k, kind: 'window' })
      else if (it.kind === 'open' && it.rooms.length === 2) pieces.push({ horiz: it.horiz, c: it.c, u0, u1, th: 0.127 * k, kind: 'passage' })
      // open toward another labelled space (a name printed beyond it, no wall between): the same open-plan boundary
      else if (it.kind === 'open' && it.out && labelBeyond(it, u0, u1)) pieces.push({ horiz: it.horiz, c: it.c + it.out * 0.0635 * k, u0, u1, th: 0.127 * k, kind: 'passage' })
      else if (it.kind === 'open') review.push({ a, b, kind: 'open', message: `${w} of a room's side has nothing drawn on it — open to the next space, or a wall missing?` })
      else review.push({ a, b, kind: 'unsure', message: `${w} of a room's side: not sure what is drawn (wall, window, door, open?) — nothing traced` })
    }
  }
  // two rooms' readings of one boundary (not paired as facing edges): the longer piece keeps a body both claim (again
  // once the ends are snapped: snapping can bring two readings onto one line)
  const dedupe = () => {
    pieces.sort((p, q) => len(q) - len(p))
    for (let i = 0; i < pieces.length; i++)
      for (let j = i + 1; j < pieces.length; j++) {
        const p = pieces[i], q = pieces[j]
        if (p.horiz !== q.horiz || Math.abs(p.c - q.c) >= (p.th + q.th) / 2 + 1) continue
        const ov = Math.min(p.u1, q.u1) - Math.max(p.u0, q.u0)
        if (ov >= 0.5 * len(q)) pieces.splice(j--, 1)
      }
  }
  dedupe()

  // ── ends: onto the track walls (collinear ends first, else a perpendicular centre line), then onto each other
  const traced = trackWalls({ ...tt, gaps: gaps.filter((g) => !walled.has(g)) })
  const trackSegs = traced.walls
  type Line = { horiz: boolean; c: number; u0: number; u1: number; th: number; seg?: WallSeg }
  const lineOf = (s: WallSeg): Line | null => {
    const horiz = Math.abs(s.a.y - s.b.y) < 1e-6, vert = Math.abs(s.a.x - s.b.x) < 1e-6
    if (!horiz && !vert) return null
    return { horiz, c: horiz ? s.a.y : s.a.x, u0: Math.min(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y), u1: Math.max(horiz ? s.a.x : s.a.y, horiz ? s.b.x : s.b.y), th: s.thicknessPx, seg: s }
  }
  const tracks = [...trackSegs, ...extraWalls].map(lineOf).filter((l): l is Line => !!l)
  const endKey = (p: Px) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  const ends = new Map<string, number>()
  for (const s of [...trackSegs, ...extraWalls]) for (const p of [s.a, s.b]) ends.set(endKey(p), (ends.get(endKey(p)) ?? 0) + 1)
  const reachOf = (p: Piece) => p.th / 2 + Math.max(2, 0.05 * k)
  const faces = new Map<Piece, [number | null, number | null]>()
  for (const p of pieces) {
    const fc: [number | null, number | null] = [null, null]
    for (const end of [0, 1] as const) {
      const e = end ? p.u1 : p.u0
      const reach = reachOf(p)
      const all: Line[] = [...tracks, ...pieces.filter((q) => q !== p)]
      // collinear: a wall on this line ending near here (a passage has no ink of its own: it takes the line of a wall
      // whose body touches its line — the open-plan boundary carries that wall on)
      let best: { L: Line; at: number } | null = null
      // (never past the piece's own middle: a thick piece's reach could fold it onto its other end)
      const mid = (p.u0 + p.u1) / 2
      for (const L of all) {
        // (a wall: a room-edge wall piece or a traced wall — not an opening's short connector)
        const wallish = L.seg ? L.u1 - L.u0 >= 0.3 * k : (L as Piece).kind === 'wall'
        const lat = p.kind === 'passage' && !p.pinned && wallish ? (L.th + p.th) / 2 : Math.max(1.5, 0.35 * Math.max(L.th, p.th))
        if (L.horiz !== p.horiz || Math.abs(L.c - p.c) > lat || (p.pinned && Math.abs(L.c - p.c) > 0.5)) continue
        for (const q of [L.u0, L.u1]) if (Math.abs(q - e) <= reach + p.th && (end ? q > mid : q < mid) && (!best || Math.abs(q - e) < Math.abs(best.at - e))) best = { L, at: q }
      }
      if (best) {
        if (end) p.u1 = best.at
        else p.u0 = best.at
        // on a traced wall's line it carries that wall on: its thickness too (the graph then makes them one wall)
        if (!p.pinned) (p.c = best.L.c), (p.pinned = true), p.kind !== 'low' && best.L.seg && (p.th = best.L.th)
        continue
      }
      // perpendicular: a wall across this end (its body within reach), whose span reaches this line
      let perp: Line | null = null
      for (const L of all) {
        if (L.horiz === p.horiz || Math.abs(L.c - e) > L.th / 2 + reach) continue
        if (p.c < L.u0 - reach || p.c > L.u1 + reach) continue
        if (!perp || Math.abs(L.c - e) < Math.abs(perp.c - e)) perp = L
      }
      if (!perp) continue
      fc[end] = perp.c + (end ? -1 : 1) * (perp.th / 2)
      if (end) p.u1 = perp.c
      else p.u0 = perp.c
      if (p.c < perp.u0 || p.c > perp.u1) {
        const lo = p.c < perp.u0, at = lo ? perp.u0 : perp.u1
        if (!p.pinned) (p.c = at), (p.pinned = true)
        else {
          // the perpendicular wall stops just short of this line: its end carries on to it (a free end only)
          const s = perp.seg
          const key = s && (Math.abs((perp.horiz ? s.a.x : s.a.y) - at) < 1e-6 ? 'a' : 'b')
          if (s && key && (ends.get(endKey(s[key])) ?? 0) > 1) continue
          if (s && key) s[key] = P(perp.horiz, perp.c, p.c)
          if (lo) perp.u0 = p.c
          else perp.u1 = p.c
        }
      }
    }
    faces.set(p, fc)
  }

  dedupe()

  // ── out: walls (low ones marked), openings with connectors from the jamb face into the corner
  const walls: WallSeg[] = [...trackSegs, ...angled, ...extraWalls]
  const openings: OpeningGuess[] = [...traced.openings]
  const passages: { ends: Px[]; segs: (WallSeg | OpeningGuess)[]; at: number }[] = []
  // a piece whose body lies mostly alongside a traced wall / opening (bodies touching) reads that wall's own line from a
  // room face a little off it: it is that wall, already there
  const traced2 = [...trackSegs, ...traced.openings.filter((o) => o.kind !== 'unknown')].map((x) => ({ l: lineOf({ ...x, thicknessPx: 'thicknessPx' in x ? (x.thicknessPx ?? 0) : 0, conf: 1 }), th: x.thicknessPx ?? 0 }))
  const besideTraced = (p: Piece) => {
    let cov = 0
    for (const { l, th } of traced2) if (l && l.horiz === p.horiz && Math.abs(l.c - p.c) > 0.01 && Math.abs(l.c - p.c) < (p.th + th) / 2 + 2) cov += Math.max(0, Math.min(l.u1, p.u1) - Math.max(l.u0, p.u0))
    return cov >= 0.5 * (p.u1 - p.u0)
  }
  for (const p of pieces) {
    if (p.u1 - p.u0 < 1 || besideTraced(p)) continue
    const a = P(p.horiz, p.c, p.u0), b = P(p.horiz, p.c, p.u1)
    if (p.kind === 'passage') passages.push({ ends: [a, b], segs: [], at: added.length })
    added.push({ a, b, kind: p.kind, th: p.th })
    if (p.kind === 'wall' || p.kind === 'low') {
      walls.push({ a, b, thicknessPx: p.th, conf: 0.6, ...(p.heightM ? { heightM: p.heightM } : {}) })
      const L = `${((p.u1 - p.u0) / k).toFixed(1)} m`
      if (p.heightM === PLANTER_M) review.push({ a, b, kind: 'low', message: `Planter edge traced as a ${PLANTER_M} m low wall where the foliage starts, ${L} — check` })
      else if (p.kind === 'low') review.push({ a, b, kind: 'low', message: `Traced as a ${RAILING_M} m low wall (railing / parapet) along what is drawn there, ${L} — or a thin full-height partition / glazing? Check` })
      continue
    }
    const [f0, f1] = faces.get(p)!
    const o0 = f0 !== null && f0 < p.u1 ? f0 : p.u0, o1 = f1 !== null && f1 > o0 ? f1 : p.u1
    const group = p.kind === 'passage' ? passages[passages.length - 1].segs : []
    for (const [x, y] of [[p.u0, o0], [o1, p.u1]] as const)
      if (y - x > 0.25) {
        const w = { a: P(p.horiz, p.c, x), b: P(p.horiz, p.c, y), thicknessPx: p.th, conf: 0.6 }
        walls.push(w)
        group.push(w)
      }
    const op: OpeningGuess = { a: P(p.horiz, p.c, o0), b: P(p.horiz, p.c, o1), kind: p.kind, conf: p.kind === 'passage' ? 0.3 : 0.6, thicknessPx: p.th, ...(p.hingeAt ? { hingeAt: p.hingeAt, swingTo: p.swingTo } : {}) }
    openings.push(op)
    group.push(op)
  }
  // solid ink between two points: the share of samples with a pixel of the sheet's wall grey within 1 px
  const dark = darkMaxOf(img.gray)
  const solid = (a: Px, b: Px) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)))
    let hit = 0
    for (let i = 1; i < n; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / n), y = Math.round(a.y + ((b.y - a.y) * i) / n)
      let on = false
      for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) on = img.gray.data[Math.min(img.gray.height - 1, Math.max(0, y + dy)) * img.gray.width + Math.min(img.gray.width - 1, Math.max(0, x + dx))] <= dark
      if (on) hit++
    }
    return hit / Math.max(1, n - 1)
  }
  for (const w of closeCorners(walls, openings, k, solid)) {
    walls.push(w)
    added.push({ a: w.a, b: w.b, kind: 'corner', th: w.thicknessPx })
  }
  // a passage is no drawn thing — only a boundary between two spaces: one left dangling (an end meeting nothing) goes
  const key = (p: Px) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`
  const deg = new Map<string, number>()
  for (const s of [...walls, ...openings.filter((o) => o.kind !== 'unknown')]) for (const p of [s.a, s.b]) deg.set(key(p), (deg.get(key(p)) ?? 0) + 1)
  const gone = new Set<WallSeg | OpeningGuess>()
  const all = [...walls, ...openings.filter((o) => o.kind !== 'unknown')]
  const onSome = (p: Px, own: (WallSeg | OpeningGuess)[]) =>
    all.some((s) => {
      if (own.includes(s)) return false
      const vx = s.b.x - s.a.x, vy = s.b.y - s.a.y, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((p.x - s.a.x) * vx + (p.y - s.a.y) * vy) / L2))
      return Math.hypot(p.x - s.a.x - vx * t, p.y - s.a.y - vy * t) < 0.5
    })
  for (const g of passages) {
    const ends = g.segs.flatMap((s) => [s.a, s.b]).filter((p) => (deg.get(key(p)) ?? 0) === 1 && !onSome(p, g.segs))
    if (!ends.length) continue
    g.segs.forEach((s) => gone.add(s))
    added[g.at] = { ...added[g.at], kind: 'dropped' }
  }
  return { walls: walls.filter((w) => !gone.has(w)), openings: openings.filter((o) => !gone.has(o)), review, added: added.filter((x) => x.kind !== 'dropped'), stats: { unknownGaps, decided }, gapReads }
}
