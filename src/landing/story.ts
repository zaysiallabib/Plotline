/**
 * The front page's story, drawn on one 2D canvas (never three.js: `/` stays small). The real Type A unit is the data:
 * act I draws it as the architect's sheet, act II lifts its walls in an axonometric view, act III stacks floors of the
 * same plan into an abstract tower on a colonnade. The scroll position is the timeline (`moment(p)`); nothing moves by
 * itself.
 *
 * One rule draws every solid: thin horizontal courses, swept from the ground up. Seen from above in an axonometric, of
 * two points that land on the same pixel the higher one is always the nearer, so drawing the scene in layers, lowest
 * first, hides what is behind with no sorting. Each course is outlined (stroked twice as wide, then filled), so walls read
 * as stone courses and columns as drums, the way a Greek temple is built.
 */
import { deriveRooms, formatFeetInches, pointInPolygon, roomInnerPolygon, roomPolygon, unitBounds, wallFrame, wallPieces } from '../core'
import type { Bounds, Opening, Pt, Unit } from '../core'

type Frame = ReturnType<typeof wallFrame>

/** A solid piece of wall: its plan quad, standing from v0 to v1 above its floor (m); `outside` = on the flat's outer edge. */
export interface Piece {
  q: Pt[]
  v0: number
  v1: number
  outside: boolean
}

export interface Plan {
  pieces: Piece[]
  /** the walls cut through as the sheet draws them: full walls solid, low walls (parapets, planter edges) outlined */
  cut: { q: Pt[]; low: boolean }[]
  openings: { f: Frame; t: number; o: Opening }[]
  /** the slab under a floor: the rooms' polygons and the outer walls' rectangles grown by OVER (their union) */
  slab: Pt[][]
  /** printed rooms: name (as the sheet prints it), size ('' when the sheet gives none), and the room's inner outline */
  labels: { x: number; y: number; name: string; size: string; room: Pt[] }[]
  b: Bounds
  c: Pt
  /** the colonnade under the first floor */
  columns: Pt[]
  /** the walls' full height (m) */
  h: number
  title: string
  project: string
  floor: number
  northDeg: number
}

/** The slab's overhang beyond the outer walls (m). */
const OVER = 0.12
/** A wall lower than this is drawn on the sheet as an outline, the way a plan draws a parapet. */
const LOW = 1.2

/** The rectangle along a wall from u0 to u1, half-width h either side of its centreline. */
const strip = ({ origin: o, dir: d, normal: n }: Frame, u0: number, u1: number, h: number): Pt[] => {
  const at = (u: number, v: number) => ({ x: o.x + d.x * u + n.x * v, y: o.y + d.y * u + n.y * v })
  return [at(u0, -h), at(u1, -h), at(u1, h), at(u0, h)]
}

export function planOf(u: Pick<Unit, 'vertices' | 'walls' | 'roomLabels' | 'name' | 'projectName' | 'floor' | 'northDeg'>): Plan {
  const rooms = deriveRooms(u)
  const sides = new Map<string, number>()
  for (const r of rooms) for (const id of r.wallIds) sides.set(id, (sides.get(id) ?? 0) + 1)
  const ends = new Map<string, number>()
  for (const w of u.walls) if (w.heightM > 0) for (const v of [w.a, w.b]) ends.set(v, (ends.get(v) ?? 0) + 1)
  const pieces: Piece[] = []
  const cut: Plan['cut'] = []
  const openings: Plan['openings'] = []
  const slab = rooms.map((r) => roomPolygon(r, u))
  let h = 0
  for (const w of u.walls) {
    if (w.heightM <= 0) continue // a zone line is drawn as nothing
    h = Math.max(h, w.heightM)
    const f = wallFrame(w, u.vertices)
    const L = f.lengthM
    const t = w.thicknessM / 2
    // a wall end meeting another wall runs on by half its thickness, so corners close (a free end stops where it stops)
    const ea = (ends.get(w.a) ?? 0) > 1 ? t : 0
    const eb = (ends.get(w.b) ?? 0) > 1 ? t : 0
    const outside = sides.get(w.id) === 1
    for (const p of wallPieces(w, L)) pieces.push({ q: strip(f, p.u0 < 1e-6 ? -ea : p.u0, p.u1 > L - 1e-6 ? L + eb : p.u1, t), v0: p.v0, v1: p.v1, outside })
    let u0 = -ea
    for (const o of [...w.openings].sort((a, b) => a.offsetM - b.offsetM)) {
      if (o.offsetM > u0) cut.push({ q: strip(f, u0, o.offsetM, t), low: w.heightM < LOW })
      u0 = Math.max(u0, o.offsetM + o.widthM)
      openings.push({ f, t, o })
    }
    if (L + eb > u0) cut.push({ q: strip(f, u0, L + eb, t), low: w.heightM < LOW })
    if (outside) slab.push(strip(f, -ea - OVER, L + eb + OVER, t + OVER))
  }
  const inner = new Map(rooms.map((r) => [r.id, roomInnerPolygon(r, u)]))
  const labels = u.roomLabels.filter((l) => inner.has(l.id)).map((l) => ({ x: l.x, y: l.y, name: sheetName(l.name), size: l.printedSize?.replace(/ × /, ' x ') ?? '', room: inner.get(l.id)! }))
  const b = unitBounds(u)
  const c = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  // a peristyle: columns round the plan's edge, about every 2.6 m, kept where a floor stands over them
  const columns: Pt[] = []
  const IN = 0.7
  const x0 = b.minX + IN, x1 = b.maxX - IN, y0 = b.minY + IN, y1 = b.maxY - IN
  const nx = Math.round((x1 - x0) / 2.6), ny = Math.round((y1 - y0) / 2.6)
  for (let i = 0; i <= nx; i++) for (const y of [y0, y1]) columns.push({ x: x0 + ((x1 - x0) * i) / nx, y })
  for (let j = 1; j < ny; j++) for (const x of [x0, x1]) columns.push({ x, y: y0 + ((y1 - y0) * j) / ny })
  const under = (p: Pt) => slab.slice(0, rooms.length).some((poly) => pointInPolygon(p, poly))
  return { pieces, cut, openings, slab, labels, b, c, columns: columns.filter(under), h, title: u.name, project: u.projectName, floor: u.floor ?? 1, northDeg: u.northDeg }
}

// ── the timeline ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Floors in the tower (the plan's own floor first). */
export const FLOORS = 9
const DEG = Math.PI / 180
/** The sheet lies turned a little on the desk, like a photo of it; the axonometric turns the other way and tips back. */
const SHEET_TURN = -3 * DEG
export const AXO_TURN = 32 * DEG
export const AXO_TILT = 54 * DEG
/** Each floor of the tower turns a little more than the one under it: a slow twist. */
export const TWIST = 2.5 * DEG

const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a))
const smooth = (t: number) => t * t * (3 - 2 * t)

export interface Moment {
  /** camera: turn about the vertical and tilt back from straight down (radians) */
  th: number
  ph: number
  /** framing: 0 = the sheet, 1 = the one floor in axonometric (follows the tilt); then 0 → 1 to the whole tower */
  tilt: number
  zoom: number
  /** the paper sheet's opacity; the plan's names, doors and windows on the floor */
  sheet: number
  notes: number
  /** how far each floor's walls stand (0–1), floor 0 first */
  grow: number[]
  /** 0–1: the first floor rises onto its colonnade and steps */
  lift: number
  roof: number
  sun: number
}

/** Where the story is at scroll position p (0–1). */
export function moment(p: number): Moment {
  const tilt = smooth(seg(p, 0.12, 0.34))
  const stack = (i: number) => smooth(seg(p, 0.58 + (i - 1) * 0.032, 0.58 + (i + 0.4) * 0.032))
  return {
    th: SHEET_TURN * (1 - smooth(seg(p, 0, 0.1))) + AXO_TURN * tilt,
    ph: AXO_TILT * tilt,
    tilt,
    zoom: smooth(seg(p, 0.42, 0.64)),
    sheet: 1 - seg(p, 0.13, 0.3),
    notes: 1 - seg(p, 0.36, 0.5),
    grow: Array.from({ length: FLOORS }, (_, i) => (i ? stack(i) : smooth(seg(p, 0.17, 0.42)))),
    lift: smooth(seg(p, 0.44, 0.6)),
    roof: seg(p, 0.86, 0.9),
    sun: smooth(seg(p, 0.88, 1)),
  }
}

// ── the projection ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Cam {
  th: number
  ph: number
  /** px per m */
  s: number
  /** where the plan's centre c at height 0 lands on screen (px) */
  ox: number
  oy: number
  c: Pt
}

/** Plan point (m, y down) at height z (m) → screen (px): turned by th + `turn` about c, tipped back by ph, scaled by s. */
export function project(k: Cam, p: Pt, z: number, turn = 0): Pt {
  const th = k.th + turn
  const dx = p.x - k.c.x
  const dy = p.y - k.c.y
  const yr = dx * Math.sin(th) + dy * Math.cos(th)
  return { x: k.ox + k.s * (dx * Math.cos(th) - dy * Math.sin(th)), y: k.oy + k.s * (yr * Math.cos(k.ph) - z * Math.sin(k.ph)) }
}

/** A room's name as the architect's sheet prints it: Plotline's "which one" in brackets left off ("Veranda (living)" → "Veranda"). */
export const sheetName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '') || name

/** The scale and offset that fit these points (plan, height, turn) into a w × h box seen at (th, ph), centred. */
export function fit(c: Pt, pts: [Pt, number, number][], th: number, ph: number, w: number, h: number): { s: number; dx: number; dy: number; h: number } {
  const k: Cam = { th, ph, s: 1, ox: 0, oy: 0, c }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [p, z, turn] of pts) {
    const q = project(k, p, z, turn)
    x0 = Math.min(x0, q.x), x1 = Math.max(x1, q.x), y0 = Math.min(y0, q.y), y1 = Math.max(y1, q.y)
  }
  const s = Math.min(w / (x1 - x0), h / (y1 - y0))
  return { s, dx: (-(x0 + x1) / 2) * s, dy: (-(y0 + y1) / 2) * s, h: (y1 - y0) * s }
}

/** Convex hull (monotone chain) of a few points; positive signed area, like every subpath a course fills. */
export function hull(ps: Pt[]): Pt[] {
  const p = [...ps].sort((a, b) => a.x - b.x || a.y - b.y)
  const cr = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lo: Pt[] = []
  const up: Pt[] = []
  for (const q of p) {
    while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
    lo.push(q)
  }
  for (let i = p.length - 1; i >= 0; i--) {
    while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop()
    up.push(p[i])
  }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}

/** Dhaka's latitude, and the June morning the story's sun sweeps through (hour angles: 0 = solar noon). */
const LAT = 23.8 * DEG
const DECLINATION = 23.4 * DEG
const SUN_FROM = -40 * DEG
const SUN_TO = -22 * DEG

/**
 * Where a shadow falls, per metre of height, in the plan (m, y down): away from the sun at hour angle H on the June
 * solstice in Dhaka, with true north `northDeg` clockwise from plan-up (Unit.northDeg).
 */
export function shadowOf(northDeg: number, H: number, dec = DECLINATION): Pt {
  const e = -Math.cos(dec) * Math.sin(H)
  const n = Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.cos(H) * Math.sin(LAT)
  const u = Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(H) * Math.cos(LAT)
  const N = { x: Math.sin(northDeg * DEG), y: -Math.cos(northDeg * DEG) }
  const E = { x: -N.y, y: N.x }
  return { x: -(e * E.x + n * N.x) / u, y: -(e * E.y + n * N.y) / u }
}

/** p turned by a about c (plan, y down: positive turns clockwise on screen, like the camera's turn). */
const turnAbout = (p: Pt, c: Pt, a: number): Pt => {
  const dx = p.x - c.x, dy = p.y - c.y
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) }
}

// ── drawing ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The page's tokens, read once from the stylesheet (no colour is typed here). */
export interface Inks {
  ink: string
  ink2: string
  muted: string
  line: string
  hairline: string
  paper: string
  sans: string
  serif: string
}

/** The area the drawing fits in (px, CSS) and the canvas's device-pixel ratio. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
  dpr: number
  /** the drawing hangs from the box's top instead of standing in its middle (a phone: right under the words) */
  top?: boolean
}

/** Heights in the tower (m): three steps, the colonnade, a slab, a course of wall, the roof plate. */
const STEP = 0.18
const COLONNADE = 4.2
const SLAB = 0.25
const COURSE = 0.5
const ROOF = 0.45

type G = CanvasRenderingContext2D

/** Draws the plan's floor plane at height z with the canvas's own transform: what is drawn after it is in plan metres. */
function plane(g: G, k: Cam, z: number, dpr: number, turn = 0): void {
  const th = k.th + turn
  const cs = Math.cos(th), sn = Math.sin(th), cp = Math.cos(k.ph)
  const a = k.s * cs, b = k.s * cp * sn, c = -k.s * sn, d = k.s * cp * cs
  const e = k.ox - a * k.c.x - c * k.c.y
  const f = k.oy - b * k.c.x - d * k.c.y - k.s * z * Math.sin(k.ph)
  g.setTransform(dpr * a, dpr * b, dpr * c, dpr * d, dpr * e, dpr * f)
}

const poly = (g: G, ps: Pt[]) => {
  g.moveTo(ps[0].x, ps[0].y)
  for (let i = 1; i < ps.length; i++) g.lineTo(ps[i].x, ps[i].y)
  g.closePath()
}

/** One opening as the sheet draws it, in the wall's own frame (u along, v across): leaf and swing, panes, glass, lintel. */
function opening(g: G, { f, t, o }: Plan['openings'][number], lw: number): void {
  const { origin: c, dir: d, normal: n } = f
  g.save()
  g.transform(d.x, d.y, n.x, n.y, c.x, c.y)
  const u0 = o.offsetM
  const u1 = o.offsetM + o.widthM
  g.beginPath()
  if (o.kind === 'door') {
    const hu = o.hinge === 'b' ? u1 : u0
    const sign = o.swing === 'in' ? -1 : 1 // 'in' = the wall's −normal side, as the Studio and the 3D draw it
    const leaf = sign * (Math.PI / 2)
    const jamb = o.hinge === 'b' ? Math.PI : 0
    g.moveTo(hu, sign * t)
    g.lineTo(hu, sign * (t + o.widthM))
    g.stroke()
    g.beginPath()
    g.setLineDash([lw * 3, lw * 3])
    g.arc(hu, sign * t, o.widthM, leaf, jamb, (jamb - leaf + 2 * Math.PI) % (2 * Math.PI) > Math.PI)
    g.stroke()
    g.setLineDash([])
  } else if (o.kind === 'slider') {
    const m = o.widthM * 0.55
    g.rect(u0, -t * 0.7, m, t * 0.6)
    g.rect(u1 - m, t * 0.1, m, t * 0.6)
    g.stroke()
  } else if (o.kind === 'window') {
    for (const v of [-t, 0, t]) g.moveTo(u0, v), g.lineTo(u1, v)
    g.stroke()
  } else {
    g.setLineDash([lw * 4, lw * 3])
    for (const v of [-t, t]) g.moveTo(u0, v), g.lineTo(u1, v)
    g.stroke()
    g.setLineDash([])
  }
  g.restore()
}

/** The sheet's margin round the plan, and its foot with the title block (m). */
const SIDE = 2.6
const FOOT = 5.2

/** The paper sheet the plan is drawn on, with its frame, overall sizes, north point and title block (plan metres). */
function sheet(g: G, P: Plan, ink: Inks, s: number, dpr: number, alpha: number): void {
  const { b } = P
  const x0 = b.minX - SIDE, x1 = b.maxX + SIDE, y0 = b.minY - SIDE, y1 = b.maxY + FOOT
  const lw = 1 / s
  g.save()
  g.globalAlpha = alpha
  g.shadowColor = ink.line
  g.shadowBlur = 28 * dpr
  g.shadowOffsetY = 10 * dpr
  g.fillStyle = ink.paper
  g.fillRect(x0, y0, x1 - x0, y1 - y0)
  g.shadowBlur = 0
  g.shadowOffsetY = 0
  g.strokeStyle = ink.hairline
  g.lineWidth = lw
  g.strokeRect(x0, y0, x1 - x0, y1 - y0)
  g.strokeStyle = ink.line
  g.strokeRect(x0 + 0.7, y0 + 0.7, x1 - x0 - 1.4, y1 - y0 - 1.4)
  // the title block: a hairline across the foot of the sheet, the name in the serif, the rest as inscriptions
  const tb = y1 - 2.9
  g.beginPath()
  g.moveTo(x0 + 0.7, tb)
  g.lineTo(x1 - 0.7, tb)
  g.stroke()
  // overall sizes: a dimension line over the plan and one down its left side, ticked at the ends
  g.strokeStyle = ink.muted
  g.beginPath()
  const dy = b.minY - 1.2, dx = b.minX - 1.2, tk = 0.18
  g.moveTo(b.minX, dy), g.lineTo(b.maxX, dy)
  g.moveTo(dx, b.minY), g.lineTo(dx, b.maxY)
  for (const x of [b.minX, b.maxX]) g.moveTo(x - tk, dy + tk), g.lineTo(x + tk, dy - tk)
  for (const y of [b.minY, b.maxY]) g.moveTo(dx - tk, y + tk), g.lineTo(dx + tk, y - tk)
  g.stroke()
  // north: a thin arrow in a circle, pointing where the unit says north is
  const nx = x1 - 1.9, ny = y0 + 1.9, r = 0.6
  g.beginPath()
  g.arc(nx, ny, r, 0, Math.PI * 2)
  g.stroke()
  const na = P.northDeg * DEG
  const ax = Math.sin(na), ay = -Math.cos(na)
  g.beginPath()
  g.moveTo(nx + ax * r * 1.35, ny + ay * r * 1.35)
  g.lineTo(nx - ay * r * 0.32 - ax * r * 0.7, ny + ax * r * 0.32 - ay * r * 0.7)
  g.lineTo(nx - ax * r * 0.35, ny - ay * r * 0.35)
  g.closePath()
  g.fillStyle = ink.muted
  g.fill()
  // words, drawn at px size (the transform scaled back out) so the type is crisp at any zoom
  g.scale(1 / s, 1 / s)
  const px = (m: number) => Math.max(m * s, 9)
  g.fillStyle = ink.muted
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.font = `500 ${px(0.3)}px ${ink.sans}`
  g.letterSpacing = `${px(0.3) * 0.12}px`
  g.fillText(formatFeetInches(b.maxX - b.minX), ((b.minX + b.maxX) / 2) * s, (dy - 0.32) * s)
  g.save()
  g.translate((dx - 0.32) * s, ((b.minY + b.maxY) / 2) * s)
  g.rotate(-Math.PI / 2)
  g.fillText(formatFeetInches(b.maxY - b.minY), 0, 0)
  g.restore()
  g.fillText('N', nx * s, (ny + r + 0.42) * s)
  g.textAlign = 'left'
  g.fillStyle = ink.ink
  g.letterSpacing = '0px'
  g.font = `400 ${px(0.95)}px ${ink.serif}`
  const [type, area] = P.title.split(' · ')
  g.fillText(type, (x0 + 1.4) * s, (tb + 1.0) * s)
  g.fillStyle = ink.muted
  g.font = `500 ${px(0.3)}px ${ink.sans}`
  g.letterSpacing = `${px(0.3) * 0.12}px`
  g.fillText(`${area ?? ''} · FLOOR ${P.floor}`.toUpperCase(), (x0 + 1.4) * s, (tb + 1.75) * s)
  g.textAlign = 'right'
  g.fillText(P.project.toUpperCase(), (x1 - 1.4) * s, (tb + 1.0) * s)
  g.fillText('SCALE 1:100', (x1 - 1.4) * s, (tb + 1.75) * s)
  g.restore()
}

/** The sizes a room's name is tried at before it is left out: as printed, then smaller twice (a bath, a shaft). */
export const NAME_SCALES = [1, 0.8, 0.64]
/** A room name at the first of `scales` where it fits on one line or two (fitName); null when it fits at none. */
export function fitLabel(text: string, scales: number[], fits: (lines: string[], k: number) => boolean): { lines: string[]; k: number } | null {
  for (const k of scales) {
    const lines = fitName(text, (l) => fits(l, k))
    if (lines) return { lines, k }
  }
  return null
}

/** A room name in one line, else in two (the most even break first), the first way that `fits`; null when none does. */
export function fitName(text: string, fits: (lines: string[]) => boolean): string[] | null {
  const w = text.split(' ')
  const twos = w.slice(1).map((_, k) => [w.slice(0, k + 1).join(' '), w.slice(k + 1).join(' ')])
  twos.sort((a, b) => Math.abs(a[0].length - a[1].length) - Math.abs(b[0].length - b[1].length))
  return [[text], ...twos].find(fits) ?? null
}

/** The plan on its floor: the cut walls, the openings, the room names with their printed sizes (plan metres). */
function floorPlan(g: G, P: Plan, ink: Inks, s: number, notes: number): void {
  const lw = 0.9 / s
  g.fillStyle = ink.ink
  g.beginPath()
  for (const c of P.cut) if (!c.low) poly(g, c.q)
  g.fill()
  g.lineWidth = lw
  g.strokeStyle = ink.ink
  g.beginPath()
  for (const c of P.cut) if (c.low) poly(g, c.q)
  g.stroke()
  if (notes <= 0) return
  g.save()
  g.globalAlpha = notes
  g.lineWidth = 0.7 / s
  g.strokeStyle = ink.ink2
  for (const o of P.openings) opening(g, o, 0.7 / s)
  g.scale(1 / s, 1 / s)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const name0 = Math.max(0.3 * s, 8.5)
  const size0 = Math.max(0.26 * s, 8)
  const fonts = (k: number) => ({ name: name0 * k, size: size0 * k, nameFont: `500 ${name0 * k}px ${ink.sans}`, sizeFont: `400 ${size0 * k}px ${ink.sans}` })
  for (const l of P.labels) {
    const tall = (n: number, k: number) => n * name0 * k * 1.2 + (l.size ? size0 * k * 1.2 : 0)
    // the words (names over the size) must sit inside the room with a little air; a small room tries smaller letters
    const fits = (lines: string[], k: number) => {
      const F = fonts(k)
      g.font = F.sizeFont
      g.letterSpacing = '0px'
      const sw = l.size ? g.measureText(l.size).width : 0
      g.font = F.nameFont
      g.letterSpacing = `${F.name * 0.12}px`
      const hw = Math.max(sw, ...lines.map((t) => g.measureText(t).width)) / 2 / s + 0.1
      const hh = tall(lines.length, k) / 2 / s + 0.05
      return [-1, 1].every((a) => [-1, 1].every((b2) => pointInPolygon({ x: l.x + a * hw, y: l.y + b2 * hh }, l.room)))
    }
    const got = fitLabel(l.name.toUpperCase(), NAME_SCALES, fits)
    if (!got) continue
    const { lines, k } = got
    const F = fonts(k)
    const y = l.y * s - tall(lines.length, k) / 2
    g.font = F.nameFont
    g.letterSpacing = `${F.name * 0.12}px`
    g.fillStyle = ink.ink
    lines.forEach((t, i) => g.fillText(t, l.x * s, y + (i + 0.5) * F.name * 1.2))
    if (!l.size) continue
    g.font = F.sizeFont
    g.letterSpacing = '0px'
    g.fillStyle = ink.muted
    g.fillText(l.size, l.x * s, y + lines.length * F.name * 1.2 + F.size * 0.6)
  }
  g.restore()
}

/**
 * One course: every quad in `qs` (already on screen at the course's bottom) swept up by `h` px, as one path; stroked
 * twice as wide and then filled, so only the outline of their union shows.
 */
function course(g: G, qs: Pt[][], lift: number[], h: number[], ink: Inks, lw: number): void {
  if (!qs.length) return
  g.beginPath()
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i]
    const up = q.map((p) => ({ x: p.x, y: p.y - lift[i] - h[i] }))
    poly(g, hull(q.map((p) => ({ x: p.x, y: p.y - lift[i] })).concat(up)))
  }
  g.lineWidth = lw * 2
  g.strokeStyle = ink.ink2
  g.stroke()
  g.fillStyle = ink.paper
  g.fill()
}

/** A plate (a slab, a roof, a step) of arbitrary polygons from z0 to z1: its sides and its top, outlined. */
function plate(g: G, k: Cam, polys: Pt[][], z0: number, z1: number, turn: number, ink: Inks, lw: number): void {
  const S = k.s * Math.sin(k.ph) * (z1 - z0)
  const lows = polys.map((ps) => ps.map((p) => project(k, p, z0, turn)))
  g.beginPath()
  for (const lo of lows) {
    const up = lo.map((p) => ({ x: p.x, y: p.y - S }))
    for (const sub of [lo, up]) poly(g, area(sub) > 0 ? sub : [...sub].reverse())
    for (let i = 0; i < lo.length; i++) {
      const j = (i + 1) % lo.length
      const q = [lo[i], lo[j], up[j], up[i]]
      poly(g, area(q) > 0 ? q : q.reverse())
    }
  }
  g.lineWidth = lw * 2
  g.strokeStyle = ink.ink2
  g.stroke()
  g.fillStyle = ink.paper
  g.fill()
  // the top face's own edge (its front arris is inside the swept outline)
  g.beginPath()
  for (const lo of lows) {
    const up = lo.map((p) => ({ x: p.x, y: p.y - S }))
    poly(g, area(up) > 0 ? up : [...up].reverse())
  }
  g.stroke()
  g.fill()
}

const area = (ps: Pt[]) => {
  let a = 0
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]
    const q = ps[(i + 1) % ps.length]
    a += p.x * q.y - q.x * p.y
  }
  return a
}

/**
 * A floor's walls from height base, standing `grow` of their height, in courses. `inside` = the inner walls too (only the
 * top of the stack shows them); `cut` = the tops are the cut through the walls (ink), not a finished top (paper).
 */
function walls(g: G, k: Cam, P: Plan, base: number, grow: number, turn: number, inside: boolean, ink: Inks, lw: number): void {
  const top = grow * P.h
  if (top <= 1e-3) return
  const S = k.s * Math.sin(k.ph)
  const ps = P.pieces.filter((p) => inside || p.outside)
  const at0 = ps.map((p) => p.q.map((q) => project(k, q, base, turn)))
  for (let za = 0; za < top - 1e-6; za += COURSE) {
    const zb = Math.min(za + COURSE, top)
    const qs: Pt[][] = []
    const lift: number[] = []
    const h: number[] = []
    const tops: { q: Pt[]; cut: boolean }[] = []
    ps.forEach((p, i) => {
      const v1 = Math.min(p.v1, top)
      if (p.v0 >= zb || v1 <= za) return
      const a = Math.max(p.v0, za)
      const b = Math.min(v1, zb)
      qs.push(at0[i])
      lift.push(a * S)
      h.push((b - a) * S)
      if (v1 <= zb) tops.push({ q: at0[i].map((q) => ({ x: q.x, y: q.y - v1 * S })), cut: inside && v1 >= top - 1e-6 })
    })
    course(g, qs, lift, h, ink, lw)
    if (!tops.length) continue
    g.beginPath()
    for (const t of tops) if (t.cut) poly(g, t.q)
    g.fillStyle = ink.ink
    g.fill()
    g.beginPath()
    for (const t of tops) if (!t.cut) poly(g, t.q)
    g.lineWidth = lw
    g.strokeStyle = ink.ink2
    g.stroke()
  }
}

/** The whole scene at moment m, into a canvas whose drawing area is `box`. */
export function draw(g: G, P: Plan, m: Moment, box: Box, ink: Inks): void {
  const { dpr } = box
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, g.canvas.width, g.canvas.height)
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const { b, c, h } = P
  const lw = 0.5
  // heights in the tower
  const ground = 3 * STEP
  const firstBase = m.lift * (ground + COLONNADE + SLAB)
  const storey = h + SLAB
  const roofAt = ground + COLONNADE + SLAB + FLOORS * storey - SLAB
  // the three framings the camera moves between: the sheet from above, the floor in axonometric, the tower
  const sheetPts: [Pt, number, number][] = [
    [{ x: b.minX - SIDE, y: b.minY - SIDE }, 0, 0],
    [{ x: b.maxX + SIDE, y: b.maxY + FOOT }, 0, 0],
  ]
  const corners = [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ]
  const floorPts: [Pt, number, number][] = corners.flatMap((p) => [[p, -SLAB, 0] as [Pt, number, number], [p, h, 0] as [Pt, number, number]])
  const wide = (d: number) => corners.map((p) => ({ x: p.x + Math.sign(p.x - c.x) * d, y: p.y + Math.sign(p.y - c.y) * d }))
  const towerPts: [Pt, number, number][] = [...wide(2.4).map((p) => [p, 0, 0] as [Pt, number, number]), ...corners.map((p) => [p, roofAt + ROOF, (FLOORS - 1) * TWIST] as [Pt, number, number])]
  // …and where the last shadow lands, so the sun's line stays in the picture
  const dEnd = shadowOf(P.northDeg, SUN_TO)
  for (const q of corners) {
    const t = turnAbout(q, c, (FLOORS - 1) * TWIST)
    towerPts.push([{ x: t.x + dEnd.x * (roofAt + ROOF), y: t.y + dEnd.y * (roofAt + ROOF) }, 0, 0])
  }
  const fill = box.w < 600 ? 0.94 : 0.9
  const F1 = fit(c, sheetPts, 0, 0, box.w * fill, box.h * fill)
  const F2 = fit(c, floorPts, AXO_TURN, AXO_TILT, box.w * 0.86, box.h * 0.86)
  const F3 = fit(c, towerPts, AXO_TURN, AXO_TILT, box.w * 0.92, box.h * 0.9)
  const mix = (a: number, b2: number, t: number) => a + (b2 - a) * t
  const at = (f: (F: ReturnType<typeof fit>) => number) => mix(mix(f(F1), f(F2), m.tilt), f(F3), m.zoom)
  // hung from the top: the box as tall as the drawing needs (its own margins kept), so no gap opens under the words
  const midY = box.top ? Math.min(box.h, at((F) => F.h) / 0.9) / 2 : box.h / 2
  const k: Cam = { th: m.th, ph: m.ph, s: at((F) => F.s), ox: box.x + box.w / 2 + at((F) => F.dx), oy: box.y + midY + at((F) => F.dy), c }
  const screen = () => g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const A3 = clamp01(m.lift * 1.6)
  // act III's ground: the plot, a hairline round the steps
  if (A3 > 0) {
    plane(g, k, 0, dpr)
    g.globalAlpha = A3
    g.strokeStyle = ink.line
    g.lineWidth = 0.8 / k.s
    const plot = wide(5.5)
    g.beginPath()
    poly(g, plot)
    g.stroke()
    g.globalAlpha = 1
    // the sun's line: the tower's shadow on the ground through one June morning, true to the unit's north (hatched, as a
    // drawing casts it), and the ray from the roof's far corner to where its shadow lands
    screen()
    if (m.sun > 0) {
      const d = shadowOf(P.northDeg, SUN_FROM + (SUN_TO - SUN_FROM) * m.sun)
      const pts: Pt[] = []
      for (let i = 0; i <= FLOORS; i++) {
        const z = ground + COLONNADE + i * storey + (i === FLOORS ? ROOF : 0)
        for (const q of corners) {
          const t = turnAbout(q, c, Math.min(i, FLOORS - 1) * TWIST)
          pts.push(project(k, t, 0), project(k, { x: t.x + d.x * z, y: t.y + d.y * z }, 0))
        }
      }
      const sh = hull(pts)
      g.save()
      g.globalAlpha = Math.min(1, m.sun * 4)
      g.beginPath()
      poly(g, sh)
      g.clip()
      // hatched at 45° on screen, the way a drawing casts a shadow
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const q of sh) (x0 = Math.min(x0, q.x)), (x1 = Math.max(x1, q.x)), (y0 = Math.min(y0, q.y)), (y1 = Math.max(y1, q.y))
      g.beginPath()
      for (let t = x0 - (y1 - y0); t < x1; t += 6) g.moveTo(t, y1), g.lineTo(t + (y1 - y0), y0)
      g.strokeStyle = ink.muted
      g.lineWidth = 0.5
      g.stroke()
      g.restore()
    }
    // the steps, rising out of the ground one after another, widest first
    for (let i = 0; i < 3; i++) {
      const t = clamp01(m.lift * 3 - i * 0.6)
      if (t > 0) plate(g, k, [wide(2.4 - i * 0.6)], i * STEP, i * STEP + STEP * t, 0, ink, lw)
    }
    // the colonnade: square columns in drums, a capital (abacus) at the top
    const colTop = firstBase - SLAB
    if (colTop > ground + 0.05) {
      const S = k.s * Math.sin(k.ph)
      const sq = (p: Pt, r: number) => [
        { x: p.x - r, y: p.y - r },
        { x: p.x + r, y: p.y - r },
        { x: p.x + r, y: p.y + r },
        { x: p.x - r, y: p.y + r },
      ]
      const shaft = P.columns.map((p) => sq(p, 0.15).map((q) => project(k, q, ground, 0)))
      const capAt = ground + COLONNADE - 0.14
      const DRUM = 0.7
      for (let za = ground; za < Math.min(colTop, capAt) - 1e-6; za += DRUM) {
        const zb = Math.min(za + DRUM, colTop, capAt)
        course(g, shaft, shaft.map(() => (za - ground) * S), shaft.map(() => (zb - za) * S), ink, lw)
      }
      if (colTop > capAt) plate(g, k, P.columns.map((p) => sq(p, 0.26)), capAt, colTop, 0, ink, lw)
    }
  }
  // the floors, lowest first
  for (let i = 0; i < FLOORS; i++) {
    const grow = m.grow[i]
    if (i > 0 && grow <= 0) break
    const base = i ? ground + COLONNADE + SLAB + i * storey : firstBase
    const turn = i * TWIST
    const inside = i === FLOORS - 1 ? m.roof <= 0 : m.grow[i + 1] <= 0
    if (i === 0 && m.sheet > 0) {
      plane(g, k, base, dpr)
      sheet(g, P, ink, k.s, dpr, m.sheet)
      screen()
    }
    if (i > 0 || m.sheet < 1) {
      g.globalAlpha = i ? 1 : clamp01((1 - m.sheet) * 3)
      plate(g, k, P.slab, base - SLAB * (i ? 1 : clamp01((1 - m.sheet) * 3)), base, turn, ink, lw)
      g.globalAlpha = 1
    }
    if (i === 0 && inside) {
      plane(g, k, base, dpr)
      floorPlan(g, P, ink, k.s, m.notes)
      screen()
    }
    walls(g, k, P, base, i ? grow : m.grow[0], turn, inside, ink, lw)
  }
  if (m.roof > 0) plate(g, k, P.slab, roofAt, roofAt + ROOF * m.roof, (FLOORS - 1) * TWIST, ink, lw)
  if (m.sun > 0) {
    const d = shadowOf(P.northDeg, SUN_FROM + (SUN_TO - SUN_FROM) * m.sun)
    const top = roofAt + ROOF
    const far = corners.map((q) => turnAbout(q, c, (FLOORS - 1) * TWIST)).reduce((best, q) => ((q.x - best.x) * d.x + (q.y - best.y) * d.y > 0 ? q : best))
    const from = project(k, far, top)
    const to = project(k, { x: far.x + d.x * top, y: far.y + d.y * top }, 0)
    g.beginPath()
    g.moveTo(from.x, from.y)
    g.lineTo(to.x, to.y)
    g.setLineDash([3, 4])
    g.lineWidth = 0.75
    g.strokeStyle = ink.ink2
    g.globalAlpha = Math.min(1, m.sun * 4)
    g.stroke()
    g.beginPath()
    g.arc(to.x, to.y, 2.5, 0, Math.PI * 2)
    g.fillStyle = ink.ink2
    g.fill()
    g.setLineDash([])
    g.globalAlpha = 1
  }

}
