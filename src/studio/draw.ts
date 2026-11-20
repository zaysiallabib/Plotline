/** Imperative canvas rendering. Transform: metres → plan px (originPx + m·pxPerM) → screen (·zoom + pan); see transform.ts. */
import { formatFeetInches, pillarCorners, roomAt, roomPolygon, signedArea, unitBounds, wallFrame } from '../core'
import type { Flat, FurniturePlacement, Id, Opening, Pt, Room, RoomKind, Vertex, Wall } from '../core'
import { GRID_M, layerOf, pieceLabel, pieceQuad, sideDots, type Move } from './furniture'
import { formatLevel, rampArrow, wallTypeOf, type StudioState } from './model'
import { HARD, type OpeningSnap, type Snap } from './snap'
import { mToScreen, pxToScreen, screenToM, type Frame } from './transform'

/**
 * The marble language's colours and font (src/index.css tokens), read from the page once: a canvas cannot read a CSS
 * variable. Ink walls on paper, the picked thing in the accent, a refusal in terracotta.
 */
let C = { paper: '', ink: '', ink2: '', muted: '', accent: '', red: '', font: '' }
function tokens(): typeof C {
  if (C.ink) return C
  const css = getComputedStyle(document.documentElement)
  const v = (n: string, or: string) => css.getPropertyValue(n).trim() || or
  C = { paper: v('--surface', '#ffffff'), ink: v('--ink', '#17191c'), ink2: v('--ink-2', '#4b4f55'), muted: v('--muted', '#6b7077'), accent: v('--accent', '#2458a6'), red: v('--danger', '#b5432b'), font: v('--font', 'system-ui, sans-serif') }
  return C
}
/** a token's colour at alpha `a` (the tokens are #rrggbb) */
const fade = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
/** how strongly the plan picture shows on its paper: enough to read its print, faint enough for the ink walls on it */
const PICTURE_ALPHA = 0.5
/** Wall length labels only when the wall is at least this long on screen. */
export const MIN_LABEL_PX = 40
/** zones tinted by kind so a ground floor reads at a glance, as a landscape plan colours them (data colours, not the
 *  interface's: grass, water, stone, timber); rooms keep a faint stone wash */
const ZONE_TINT: Partial<Record<RoomKind, string>> = {
  lawn: 'rgba(104,148,84,0.22)',
  planter: 'rgba(74,120,70,0.32)',
  pool: 'rgba(86,140,186,0.28)',
  driveway: 'rgba(120,120,116,0.16)',
  parking: 'rgba(98,112,140,0.16)',
  paving: 'rgba(176,160,128,0.20)',
  deck: 'rgba(150,108,70,0.24)',
  play: 'rgba(196,128,84,0.20)',
}
/** one colour per flat of a whole-floor drawing (core.deriveFlats), in its order — earth tones that never read as the
 *  accent (the picked thing); the core and loose rooms keep the wash */
const FLAT_RGB = ['176,132,52', '92,136,96', '170,96,80', '96,112,140', '128,94,138', '62,126,126']
const flatRgb = (i: number) => FLAT_RGB[i % FLAT_RGB.length]

export type Hit = { kind: 'vertex' | 'wall' | 'opening' | 'label' | 'furniture' | 'pillar'; id: Id }
export interface Hover {
  m: Pt
  px: Pt
  snap: Snap | null
  hit: Hit | null
  /** O tool over a wall: the opening a click there creates (model.openingAt); red when the click is refused */
  ghost?: { wallId: Id; t: number; opening: Opening; snapped: OpeningSnap; error: string | null }
  /** Select drag: the corners moving — every wall at them gets a live length label */
  moving?: Id[]
  /** C tool drag: the new column's box (plan m) */
  box?: { a: Pt; b: Pt }
  /** V drag on empty plan: the box select (plan m) */
  marquee?: { a: Pt; b: Pt }
  /** A tool: the walls a click would lay (their corners, plan m) */
  arc?: Pt[]
}
type WallFrame = ReturnType<typeof wallFrame>

/** A wall's (or low wall's) two face dots, on the middle of each long face: [its normal's side, the other]; none on a kerb / zone line */
export function wallFaceDots(w: Wall, vs: Vertex[]): [Pt, Pt] | null {
  if (wallTypeOf(w.heightM) === 'zone' || wallTypeOf(w.heightM) === 'kerb') return null
  const f = wallFrame(w, vs)
  const at = (k: number) => ({ x: f.origin.x + (f.dir.x * f.lengthM) / 2 + (f.normal.x * k * w.thicknessM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 + (f.normal.y * k * w.thicknessM) / 2 })
  return [at(1), at(-1)]
}

/** Wall slab path: centreline origin → origin + dir·L, h to each side. */
function slab(ctx: CanvasRenderingContext2D, { origin: o, dir: d, normal: n, lengthM: L }: WallFrame, h: number): void {
  ctx.beginPath()
  ctx.moveTo(o.x + n.x * h, o.y + n.y * h)
  ctx.lineTo(o.x + d.x * L + n.x * h, o.y + d.y * L + n.y * h)
  ctx.lineTo(o.x + d.x * L - n.x * h, o.y + d.y * L - n.y * h)
  ctx.lineTo(o.x - n.x * h, o.y - n.y * h)
  ctx.closePath()
}

/** One opening in wall-local (u along, v across) coordinates: door leaf + swing arc, slider two offset panes, window triple line, passage dashed gap. */
function drawOpening(ctx: CanvasRenderingContext2D, f: WallFrame, h: number, op: Opening, color: string, lineWidth: number, px: (n: number) => number, paper: boolean): void {
  const { origin: o, dir: d, normal: n } = f
  ctx.save()
  ctx.transform(d.x, d.y, n.x, n.y, o.x, o.y)
  const u0 = op.offsetM
  const u1 = op.offsetM + op.widthM
  // the wall stops at the opening: paper under it on a picture, else the bare sheet
  ctx.fillStyle = C.paper
  if (paper) ctx.fillRect(u0, -h - px(0.5), op.widthM, 2 * h + px(1))
  else ctx.clearRect(u0, -h - px(0.5), op.widthM, 2 * h + px(1))
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash([])
  if (op.kind === 'door') {
    const hu = op.hinge === 'b' ? u1 : u0
    const sign = op.swing === 'in' ? -1 : 1 // 'in' = −normal side, as src/three/openings.ts builds the leaf
    const leafAng = sign > 0 ? Math.PI / 2 : -Math.PI / 2
    const jambAng = op.hinge === 'b' ? Math.PI : 0
    ctx.beginPath()
    ctx.moveTo(hu, sign * h)
    ctx.lineTo(hu, sign * (h + op.widthM))
    ctx.stroke()
    ctx.beginPath()
    const ccw = ((jambAng - leafAng + 2 * Math.PI) % (2 * Math.PI)) > Math.PI
    ctx.arc(hu, sign * h, op.widthM, leafAng, jambAng, ccw)
    ctx.lineWidth = lineWidth * 0.6 // the swing is drawn lighter than the leaf, as on a sheet
    ctx.stroke()
  } else if (op.kind === 'slider') {
    // the plan symbol: two panes, each a little over half the span, offset across the wall and overlapping mid-span
    const m = op.widthM * 0.55
    ctx.strokeRect(u0, -h * 0.6, m, h * 0.5)
    ctx.strokeRect(u1 - m, h * 0.1, m, h * 0.5)
    jambs(ctx, u0, u1, h)
  } else if (op.kind === 'window') {
    ctx.beginPath()
    for (const v of [-h, 0, h]) {
      ctx.moveTo(u0, v)
      ctx.lineTo(u1, v)
    }
    ctx.stroke()
    jambs(ctx, u0, u1, h)
  } else {
    ctx.setLineDash([px(4), px(3)])
    ctx.beginPath()
    ctx.moveTo(u0, -h)
    ctx.lineTo(u1, -h)
    ctx.moveTo(u0, h)
    ctx.lineTo(u1, h)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.restore()
}
/** a window's or slider's two jambs: the wall's ends across its thickness */
function jambs(ctx: CanvasRenderingContext2D, u0: number, u1: number, h: number): void {
  ctx.beginPath()
  ctx.moveTo(u0, -h)
  ctx.lineTo(u0, h)
  ctx.moveTo(u1, -h)
  ctx.lineTo(u1, h)
  ctx.stroke()
}
export interface DrawArgs {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  state: StudioState
  img: HTMLImageElement | null
  rooms: Room[]
  /** closed walls → side (±wallFrame.normal) for the length label; see model.wallLabelSides */
  labelSides: Map<Id, 1 | -1>
  hover: Hover | null
  scaleStart: Pt | null // plan px
  frame: Frame
  /** F tool: the layer (unit.furniture or the preset layout); while dragging, the candidate layout (red when refused) */
  furniture?: { pieces: FurniturePlacement[]; drag: Move | null }
  /** a review row's spot (plan m), ringed */
  mark?: Pt | null
  /** Auto-trace pick mode: the flat a click at the pointer picks (plan px), tinted, its room names faint; `region`: the floor
   *  its flood reached (plan px rectangles), tinted with the rooms as one area, open or closed */
  preview?: { polys: Pt[][]; names: { at: Pt; text: string }[]; region?: { x: number; y: number; w: number; h: number }[] } | null
  /** the drawing's flats: each tinted in its colour, its name once above it */
  flats?: Flat[]
}

/** Draw order: rugs, floor pieces, what rests on them, ceiling fixtures (layerOf 3, 0, 1, 2); the smaller over the bigger — what pieceAt picks is on top. */
const LAYER_ORDER = [1, 2, 3, 0]

/** Footprints at true size, front edge marked; the 3" grid faintly while dragging. Metres space. */
function drawFurniture(ctx: CanvasRenderingContext2D, a: DrawArgs, sel: Set<Id>, px: (n: number) => number): void {
  const { pieces, drag } = a.furniture!
  if (drag) {
    const b = unitBounds(a.state.unit)
    ctx.beginPath()
    for (let x = b.minX; x <= b.maxX + 1e-9; x += GRID_M) {
      ctx.moveTo(x, b.minY)
      ctx.lineTo(x, b.maxY)
    }
    for (let y = b.minY; y <= b.maxY + 1e-9; y += GRID_M) {
      ctx.moveTo(b.minX, y)
      ctx.lineTo(b.maxX, y)
    }
    ctx.strokeStyle = fade(C.ink, 0.07)
    ctx.lineWidth = px(1)
    ctx.stroke()
  }
  const moving = new Set(drag?.ids)
  const hot = drag?.error ? C.red : C.accent
  const area = (p: FurniturePlacement) => Math.abs(signedArea(pieceQuad(p)))
  const shown = [...(drag?.furniture ?? pieces)].sort((p, q) => LAYER_ORDER[layerOf(p)] - LAYER_ORDER[layerOf(q)] || area(q) - area(p))
  for (const p of shown) {
    const q = pieceQuad(p)
    const on = moving.has(p.id) || (!drag && sel.has(p.id))
    const layer = layerOf(p)
    ctx.beginPath()
    q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
    ctx.closePath()
    if (on || layer < 2) {
      // opaque enough to hide the plan's own printed furniture under a piece
      ctx.fillStyle = on ? fade(hot, 0.22) : fade(C.paper, 0.88)
      ctx.fill()
    }
    ctx.setLineDash(layer >= 2 ? [px(3), px(3)] : [])
    ctx.strokeStyle = on ? hot : layer >= 2 ? fade(C.ink, 0.4) : C.ink2
    ctx.lineWidth = px(1)
    ctx.stroke()
    ctx.setLineDash([])
    if (layer === 2 || layer === 3) continue
    ctx.beginPath() // front edge (local +y side: footprint corners 2 → 3)
    ctx.moveTo(q[2].x, q[2].y)
    ctx.lineTo(q[3].x, q[3].y)
    ctx.strokeStyle = on ? hot : C.ink
    ctx.lineWidth = px(2)
    ctx.stroke()
  }
}

/** Floor pieces' short labels where they fit (the selected one always). Screen space. */
function labelFurniture(ctx: CanvasRenderingContext2D, a: DrawArgs, sel: Set<Id>, toScreen: (m: Pt) => Pt): void {
  const { pieces, drag } = a.furniture!
  ctx.font = `400 11px ${C.font}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of drag?.furniture ?? pieces) {
    const on = drag ? drag.ids[0] === p.id : sel.has(p.id)
    if (layerOf(p) !== 0 && !on) continue
    const name = pieceLabel(p)
    const q = pieceQuad(p).map(toScreen)
    const w = Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x))
    const h = Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y))
    if (!on && (ctx.measureText(name).width > w - 6 || h < 14)) continue
    const c = toScreen(p)
    ctx.fillStyle = on ? (drag?.error ? C.red : C.accent) : C.ink2
    ctx.fillText(name, c.x, c.y)
  }
  ctx.textBaseline = 'alphabetic'
}

export function draw(a: DrawArgs): void {
  const { ctx, state, dpr, frame, width, height } = a
  const { panX, panY, zoom, pxPerM } = frame
  const s = zoom * pxPerM
  const px = (n: number) => n / s // screen px → meters
  const toScreen = (m: Pt): Pt => mToScreen(frame, m)
  const sel = new Set(state.selection)
  const chainIds = new Set(state.chain?.ids ?? [])
  const vs = state.unit.vertices

  tokens()
  // the sheet itself is the page's marble with its grain (studio.css); the canvas draws only what lies on it
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  if (a.img) {
    // the plan picture as paper on the marble: a white sheet with the raised card's shadow, the print on it faded
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY)
    ctx.save()
    ctx.shadowColor = fade(C.ink, 0.1)
    ctx.shadowBlur = 3 * dpr
    ctx.shadowOffsetY = dpr
    ctx.fillStyle = C.paper
    ctx.fillRect(0, 0, a.img.naturalWidth, a.img.naturalHeight)
    ctx.restore()
    ctx.globalAlpha = PICTURE_ALPHA
    ctx.drawImage(a.img, 0, 0)
    ctx.globalAlpha = 1
  }

  // meters space: metre (0,0) sits at plan px originPx
  const m0 = mToScreen(frame, { x: 0, y: 0 })
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * m0.x, dpr * m0.y)
  ctx.lineJoin = 'round'

  const hotRoom = state.tool === 'room' && a.hover ? roomAt(a.hover.m, a.rooms, state.unit) : null
  const flatOf = new Map((a.flats ?? []).flatMap((f, i) => f.roomIds.map((id) => [id, i] as const)))
  /** each flat's extent (m), for its name */
  const flatBox = (a.flats ?? []).map(() => ({ x0: Infinity, x1: -Infinity, y0: Infinity }))
  for (const r of a.rooms) {
    const poly = roomPolygon(r, state.unit)
    ctx.beginPath()
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    const fi = flatOf.get(r.id)
    ctx.fillStyle = fi !== undefined ? `rgba(${flatRgb(fi)},0.14)` : (ZONE_TINT[r.kind] ?? fade(C.ink, 0.035))
    ctx.fill()
    if (fi !== undefined) for (const p of poly) Object.assign(flatBox[fi], { x0: Math.min(flatBox[fi].x0, p.x), x1: Math.max(flatBox[fi].x1, p.x), y0: Math.min(flatBox[fi].y0, p.y) })
    if (r === hotRoom) {
      ctx.fillStyle = fade(C.accent, 0.1)
      ctx.fill()
    }
  }

  // guides
  const guides = a.hover?.snap?.guides ?? []
  if (guides.length) {
    ctx.setLineDash([px(4), px(4)])
    ctx.strokeStyle = fade(C.accent, 0.45)
    ctx.lineWidth = px(1)
    const { x: x0, y: y0 } = screenToM(frame, { x: 0, y: 0 })
    for (const g of guides) {
      ctx.beginPath()
      if (g.axis === 'x') {
        ctx.moveTo(g.at, y0)
        ctx.lineTo(g.at, y0 + px(height))
      } else {
        ctx.moveTo(x0, g.at)
        ctx.lineTo(x0 + px(width), g.at)
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // columns: a filled block in the wall ink, under the walls (walls keep their own lines through / into them)
  for (const p of state.unit.pillars ?? []) {
    ctx.fillStyle = sel.has(p.id) ? C.accent : C.ink
    ctx.beginPath()
    pillarCorners(p).forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)))
    ctx.fill()
  }
  // C tool drag: the new column's box
  const box = a.hover?.box
  if (box) {
    ctx.fillStyle = fade(C.accent, 0.3)
    ctx.fillRect(Math.min(box.a.x, box.b.x), Math.min(box.a.y, box.b.y), Math.abs(box.b.x - box.a.x), Math.abs(box.b.y - box.a.y))
  }
  // A tool: the chain of straight walls the click lays, 5" wide
  const arc = a.hover?.arc
  if (arc && arc.length > 1) {
    ctx.beginPath()
    arc.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.strokeStyle = fade(C.accent, 0.45)
    ctx.lineWidth = 0.127
    ctx.stroke()
  }

  // walls, by type (model.wallTypeOf): a zone line dashed on its centre line (nothing in 3D), a kerb a thin solid line, a
  // low wall hollow, a full wall solid ink (a partition a shade lighter); the one under the mouse ringed in the accent
  const hot = a.hover?.hit
  for (const w of state.unit.walls) {
    const f = wallFrame(w, vs)
    const h = w.thicknessM / 2
    const selected = sel.has(w.id)
    const type = wallTypeOf(w.heightM)
    if (type === 'zone' || type === 'kerb') {
      ctx.beginPath()
      ctx.moveTo(f.origin.x, f.origin.y)
      ctx.lineTo(f.origin.x + f.dir.x * f.lengthM, f.origin.y + f.dir.y * f.lengthM)
      ctx.setLineDash(type === 'zone' ? [px(6), px(4)] : [])
      if (!selected && hot?.kind === 'wall' && hot.id === w.id) {
        ctx.strokeStyle = fade(C.accent, 0.4)
        ctx.lineWidth = px(6)
        ctx.stroke()
      }
      ctx.strokeStyle = selected ? C.accent : type === 'zone' ? fade(C.ink, 0.55) : C.ink
      ctx.lineWidth = px(selected ? 2.5 : type === 'zone' ? 1.25 : 1.5)
      ctx.stroke()
      ctx.setLineDash([])
      continue // (never an opening: the O tool refuses them)
    }
    slab(ctx, f, h)
    const exterior = w.thicknessM >= 0.2
    ctx.fillStyle = selected ? C.accent : type === 'low' ? fade(C.ink, 0.06) : exterior ? C.ink : C.ink2
    ctx.fill()
    ctx.strokeStyle = selected ? C.accent : type === 'low' ? C.ink2 : exterior ? C.ink : C.ink2
    ctx.lineWidth = px(1)
    ctx.stroke()
    if (!selected && hot?.kind === 'wall' && hot.id === w.id) {
      ctx.strokeStyle = fade(C.accent, 0.4)
      ctx.lineWidth = px(6)
      ctx.stroke()
    }

    for (const op of w.openings) {
      const osel = sel.has(op.id)
      if (!osel && hot?.kind === 'opening' && hot.id === op.id) {
        // the opening under the mouse: its footprint washed in the accent's line colour
        ctx.save()
        ctx.transform(f.dir.x, f.dir.y, f.normal.x, f.normal.y, f.origin.x, f.origin.y)
        ctx.fillStyle = fade(C.accent, 0.4)
        ctx.fillRect(op.offsetM, -h - px(2), op.widthM, 2 * h + px(4))
        ctx.restore()
      }
      drawOpening(ctx, f, h, op, osel && state.dragBlocked ? C.red : osel ? C.accent : C.ink, px(osel ? 1.75 : 1), px, !!a.img)
      if (osel) {
        // the picked opening: its footprint in the accent's wash, so a window's thin lines read as picked too
        ctx.save()
        ctx.transform(f.dir.x, f.dir.y, f.normal.x, f.normal.y, f.origin.x, f.origin.y)
        ctx.fillStyle = fade(state.dragBlocked ? C.red : C.accent, 0.16)
        ctx.fillRect(op.offsetM, -h, op.widthM, 2 * h)
        ctx.restore()
      }
    }
  }

  // ghost opening: exactly what an O-tool click here creates
  const og = state.tool === 'opening' ? a.hover?.ghost : undefined
  const ogWall = og && state.unit.walls.find((w) => w.id === og.wallId)
  if (og && ogWall) {
    const f = wallFrame(ogWall, vs)
    const h = ogWall.thicknessM / 2
    const color = og.error ? C.red : C.accent
    ctx.globalAlpha = 0.6
    drawOpening(ctx, f, h, og.opening, color, px(2), px, !!a.img)
    // tint the footprint too: a window's triple line alone vanishes in a 5" wall at fit zoom
    ctx.globalAlpha = 0.35
    ctx.save()
    ctx.transform(f.dir.x, f.dir.y, f.normal.x, f.normal.y, f.origin.x, f.origin.y)
    ctx.fillStyle = color
    ctx.fillRect(og.opening.offsetM, -h, og.opening.widthM, 2 * h)
    ctx.restore()
    ctx.globalAlpha = 1
  }

  // ghost wall: the true-thickness slab the next click creates
  const snap = a.hover?.snap
  const chain = state.chain
  let ghostWall: WallFrame | null = null
  if (chain && snap && state.tool === 'wall') {
    const last = vs.find((v) => v.id === chain.ids[chain.ids.length - 1])
    const L = last ? Math.hypot(snap.x - last.x, snap.y - last.y) : 0
    if (last && L > 1e-6) {
      const dir = { x: (snap.x - last.x) / L, y: (snap.y - last.y) / L }
      ghostWall = { origin: last, dir, normal: { x: -dir.y, y: dir.x }, lengthM: L }
      if (chain.heightM <= 0.2) {
        // a zone line / kerb: drawn as it will be
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(snap.x, snap.y)
        ctx.setLineDash(chain.heightM === 0 ? [px(6), px(4)] : [])
        ctx.strokeStyle = C.accent
        ctx.lineWidth = px(2)
        ctx.stroke()
        ctx.setLineDash([])
      } else {
        slab(ctx, ghostWall, chain.thicknessM / 2)
        ctx.fillStyle = fade(C.accent, 0.35)
        ctx.fill()
        ctx.strokeStyle = C.accent
        ctx.lineWidth = px(1)
        ctx.stroke()
      }
    }
  }

  if (a.furniture) drawFurniture(ctx, a, sel, px)

  // vertices; a selected wall's ends are its drag handles (ringed so they show on an ink-filled wall)
  const ends = new Set(state.unit.walls.filter((w) => sel.has(w.id)).flatMap((w) => [w.a, w.b]))
  const dot = (p: Pt, active: boolean, ring: boolean) => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, px(active ? 4 : 2), 0, Math.PI * 2)
    ctx.fillStyle = active ? C.accent : C.ink
    ctx.fill()
    if (ring) {
      ctx.strokeStyle = C.paper
      ctx.lineWidth = px(1.5)
      ctx.stroke()
    }
  }
  for (const v of vs) {
    if (hot?.kind === 'vertex' && hot.id === v.id && !sel.has(v.id)) {
      ctx.beginPath()
      ctx.arc(v.x, v.y, px(7), 0, Math.PI * 2)
      ctx.fillStyle = fade(C.accent, 0.4)
      ctx.fill()
    }
    dot(v, sel.has(v.id) || chainIds.has(v.id) || ends.has(v.id), ends.has(v.id))
  }
  // a selected opening's two ends (on its wall's centre line) are its resize handles, ringed the same
  for (const w of state.unit.walls) {
    for (const op of w.openings.filter((o) => sel.has(o.id))) {
      const f = wallFrame(w, vs)
      for (const u of [op.offsetM, op.offsetM + op.widthM]) dot({ x: f.origin.x + f.dir.x * u, y: f.origin.y + f.dir.y * u }, true, true)
    }
  }
  // a single selected wall's two faces: drag the dot on one to make the wall thicker / thinner on that side
  const one = state.selection.length === 1 ? state.unit.walls.find((w) => w.id === state.selection[0]) : undefined
  for (const p of (one && wallFaceDots(one, vs)) || []) dot(p, true, true)
  // a selected column's four corners and four side middles are its handles (a corner alone, or that side alone)
  for (const p of state.unit.pillars ?? []) {
    if (!sel.has(p.id)) continue
    const cs = pillarCorners(p)
    for (const [i, c] of cs.entries()) {
      dot(c, true, true)
      dot({ x: (c.x + cs[(i + 1) % 4].x) / 2, y: (c.y + cs[(i + 1) % 4].y) / 2 }, true, true)
    }
  }

  // a selected curtain's two sides (tool F): drag one to make it wider or narrower on that side
  for (const p of a.furniture ? (a.furniture.drag?.furniture ?? a.furniture.pieces) : []) if (p.openingId && sel.has(p.id)) for (const c of sideDots(p)) dot(c, true, true)

  // ramps: an arrow across the zone from its floor level (tail) to its to level (head); selected, the head is a handle
  const ramps = state.unit.roomLabels.flatMap((l) => {
    const r = l.slope && a.rooms.find((x) => x.id === l.id)
    return r && l.slope ? [{ l, ...rampArrow(r, state.unit, l, l.slope.dirDeg) }] : []
  })
  for (const { l, from, to } of ramps) {
    const on = sel.has(l.id)
    const L = Math.hypot(to.x - from.x, to.y - from.y) || 1
    const d = { x: (to.x - from.x) / L, y: (to.y - from.y) / L }
    const k = px(12)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.moveTo(to.x - d.x * k - d.y * k * 0.5, to.y - d.y * k + d.x * k * 0.5)
    ctx.lineTo(to.x, to.y)
    ctx.lineTo(to.x - d.x * k + d.y * k * 0.5, to.y - d.y * k - d.x * k * 0.5)
    ctx.strokeStyle = on ? C.accent : C.ink
    ctx.lineWidth = px(on ? 2.5 : 1.5)
    ctx.stroke()
    if (on) dot(to, true, true)
  }

  // snap ring
  if (snap && (state.tool === 'wall' || state.tool === 'arc' || a.hover?.hit?.kind === 'vertex' || HARD.has(snap.kind))) {
    ctx.beginPath()
    ctx.arc(snap.x, snap.y, px(HARD.has(snap.kind) ? 8 : 4), 0, Math.PI * 2)
    ctx.strokeStyle = C.accent
    ctx.lineWidth = px(1.5)
    ctx.stroke()
  }
  // V box select: a thin dashed rectangle
  const mq = a.hover?.marquee
  if (mq) {
    ctx.fillStyle = fade(C.accent, 0.06)
    ctx.fillRect(Math.min(mq.a.x, mq.b.x), Math.min(mq.a.y, mq.b.y), Math.abs(mq.b.x - mq.a.x), Math.abs(mq.b.y - mq.a.y))
    ctx.strokeStyle = C.accent
    ctx.lineWidth = px(1)
    ctx.setLineDash([px(5), px(4)])
    ctx.strokeRect(Math.min(mq.a.x, mq.b.x), Math.min(mq.a.y, mq.b.y), Math.abs(mq.b.x - mq.a.x), Math.abs(mq.b.y - mq.a.y))
    ctx.setLineDash([])
  }

  // screen space: wall lengths, labels, scale line
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const lengthLabel = (f: WallFrame, side: number, thicknessM: number) => {
    const mid = toScreen({ x: f.origin.x + (f.dir.x * f.lengthM) / 2, y: f.origin.y + (f.dir.y * f.lengthM) / 2 })
    const nx = f.normal.x * side
    const ny = f.normal.y * side
    const off = thicknessM * s * 0.5 + 5
    ctx.textAlign = Math.abs(nx) < 0.3 ? 'center' : nx > 0 ? 'left' : 'right'
    ctx.textBaseline = Math.abs(ny) < 0.3 ? 'middle' : ny > 0 ? 'top' : 'bottom'
    ctx.fillText(formatFeetInches(f.lengthM), mid.x + nx * off, mid.y + ny * off)
  }
  ctx.font = `400 11px ${C.font}`
  ctx.fillStyle = C.muted
  const moving = new Set(a.hover?.moving)
  const live = (w: { a: Id; b: Id }) => moving.has(w.a) || moving.has(w.b)
  for (const [id, side] of a.labelSides) {
    const w = state.unit.walls.find((x) => x.id === id)
    if (!w || live(w)) continue
    const f = wallFrame(w, vs)
    if (f.lengthM * s >= MIN_LABEL_PX) lengthLabel(f, side, w.thicknessM)
  }
  // dragging: every wall at a moving corner, however short, in the ghost wall's style
  ctx.font = `500 12px ${C.font}`
  ctx.fillStyle = C.accent
  for (const w of moving.size ? state.unit.walls : []) if (live(w)) lengthLabel(wallFrame(w, vs), a.labelSides.get(w.id) ?? 1, w.thicknessM)
  if (ghostWall && chain) {
    ctx.font = `500 12px ${C.font}`
    ctx.fillStyle = C.accent
    lengthLabel(ghostWall, 1, chain.thicknessM)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  // room names as inscriptions (tracked capitals), the printed size under them; a paper edge so they read over the print
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = fade(C.paper, 0.85)
  const inscribe = (text: string, x: number, y: number) => {
    ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
  }
  for (const l of state.unit.roomLabels) {
    const p = toScreen(l)
    const active = sel.has(l.id)
    ctx.font = `500 10px ${C.font}`
    ctx.letterSpacing = '0.1em'
    ctx.fillStyle = active ? C.accent : C.ink
    // a floor level beside the name, as the sheets print it (a ramp's two levels sit at its arrow's ends instead)
    inscribe(`${(l.name || 'Room').toUpperCase()}${l.levelM !== undefined && !l.slope ? `  ${formatLevel(l.levelM)}` : ''}`, p.x, p.y)
    ctx.letterSpacing = '0px'
    if (l.printedSize) {
      ctx.font = `400 11px ${C.font}`
      ctx.fillStyle = active ? C.accent : C.ink2
      inscribe(l.printedSize, p.x, p.y + 14)
    }
  }
  // each flat's name once, above its top edge, in its colour on a paper edge (it sits over the sheet)
  ctx.font = `500 12px ${C.font}`
  ctx.letterSpacing = '0.12em'
  ctx.lineWidth = 4
  ;(a.flats ?? []).forEach((f, i) => {
    const b = flatBox[i]
    if (!Number.isFinite(b.x0)) return
    const p = toScreen({ x: (b.x0 + b.x1) / 2, y: b.y0 })
    ctx.fillStyle = `rgb(${flatRgb(i)})`
    inscribe(f.name.toUpperCase(), p.x, p.y - 12)
  })
  ctx.letterSpacing = '0px'
  ctx.font = `400 11px ${C.font}`
  for (const { l, from, to } of ramps) {
    ctx.fillStyle = sel.has(l.id) ? C.accent : C.ink
    for (const [at, m] of [[from, l.levelM ?? 0], [to, l.slope!.toLevelM]] as const) {
      const q = toScreen(at)
      ctx.fillText(formatLevel(m), q.x, q.y - 8)
    }
  }
  if (a.furniture) labelFurniture(ctx, a, sel, toScreen)

  if (a.mark) {
    const p = toScreen(a.mark)
    ctx.strokeStyle = C.accent
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.arc(p.x, p.y, 22, 0, Math.PI * 2)
    ctx.stroke()
  }

  if (a.preview) {
    // one path, one fill: the rooms and the flood's rectangles tint as one area (all wound the same way, so nonzero
    // never cuts a hole where they overlap); only the rooms are outlined
    const rooms = new Path2D()
    for (const poly of a.preview.polys) {
      const ps = signedArea(poly) < 0 ? [...poly].reverse() : poly
      ps.forEach((p, i) => {
        const q = pxToScreen(frame, p)
        if (i) rooms.lineTo(q.x, q.y)
        else rooms.moveTo(q.x, q.y)
      })
      rooms.closePath()
    }
    const area = new Path2D(rooms)
    for (const r of a.preview.region ?? []) {
      const p = pxToScreen(frame, { x: r.x, y: r.y }), q = pxToScreen(frame, { x: r.x + r.w, y: r.y + r.h })
      area.rect(p.x, p.y, q.x - p.x, q.y - p.y)
    }
    ctx.fillStyle = fade(C.accent, 0.12)
    ctx.fill(area)
    ctx.strokeStyle = C.accent
    ctx.lineWidth = 1.5
    ctx.stroke(rooms)
    ctx.font = `500 11px ${C.font}`
    ctx.fillStyle = C.accent
    for (const n of a.preview.names) {
      const q = pxToScreen(frame, n.at)
      ctx.fillText(n.text, q.x, q.y)
    }
  }

  if (state.tool === 'scale' && a.scaleStart && a.hover) {
    const p0 = { x: a.scaleStart.x * zoom + panX, y: a.scaleStart.y * zoom + panY }
    const p1 = { x: a.hover.px.x * zoom + panX, y: a.hover.px.y * zoom + panY }
    ctx.strokeStyle = C.accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
    for (const p of [p0, p1]) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = C.accent
      ctx.fill()
    }
  }
}
