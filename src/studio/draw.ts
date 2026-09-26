/** Imperative canvas rendering. Transform: metres → plan px (originPx + m·pxPerM) → screen (·zoom + pan); see transform.ts. */
import { formatFeetInches, roomAt, roomPolygon, unitBounds, wallFrame } from '../core'
import type { FurniturePlacement, Id, Opening, Pt, Room } from '../core'
import { GRID_M, layerOf, pieceLabel, pieceQuad, type Move } from './furniture'
import type { StudioState } from './model'
import type { OpeningSnap, Snap } from './snap'
import { mToScreen, screenToM, type Frame } from './transform'

const C = { bg: '#0f0f10', ink: '#f2f2f0', muted: '#9a9a94', accent: '#e8c170', line: '#2a2b2f', red: '#e5534b' }
/** Wall length labels only when the wall is at least this long on screen. */
export const MIN_LABEL_PX = 40

export type Hit = { kind: 'vertex' | 'wall' | 'opening' | 'label' | 'furniture'; id: Id }
export interface Hover {
  m: Pt
  px: Pt
  snap: Snap | null
  hit: Hit | null
  /** O tool over a wall: the opening a click there creates (model.openingAt); red when the click is refused */
  ghost?: { wallId: Id; t: number; opening: Opening; snapped: OpeningSnap; error: string | null }
}
type WallFrame = ReturnType<typeof wallFrame>

/** Wall slab path: centreline origin → origin + dir·L, h to each side. */
function slab(ctx: CanvasRenderingContext2D, { origin: o, dir: d, normal: n, lengthM: L }: WallFrame, h: number): void {
  ctx.beginPath()
  ctx.moveTo(o.x + n.x * h, o.y + n.y * h)
  ctx.lineTo(o.x + d.x * L + n.x * h, o.y + d.y * L + n.y * h)
  ctx.lineTo(o.x + d.x * L - n.x * h, o.y + d.y * L - n.y * h)
  ctx.lineTo(o.x - n.x * h, o.y - n.y * h)
  ctx.closePath()
}

/** One opening in wall-local (u along, v across) coordinates: door leaf + swing arc, window triple line, passage dashed gap. */
function drawOpening(ctx: CanvasRenderingContext2D, f: WallFrame, h: number, op: Opening, color: string, lineWidth: number, px: (n: number) => number): void {
  const { origin: o, dir: d, normal: n } = f
  ctx.save()
  ctx.transform(d.x, d.y, n.x, n.y, o.x, o.y)
  const u0 = op.offsetM
  const u1 = op.offsetM + op.widthM
  ctx.fillStyle = C.bg
  ctx.fillRect(u0, -h - px(0.5), op.widthM, 2 * h + px(1))
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
    ctx.stroke()
  } else if (op.kind === 'window') {
    ctx.beginPath()
    for (const v of [-h, 0, h]) {
      ctx.moveTo(u0, v)
      ctx.lineTo(u1, v)
    }
    ctx.stroke()
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
}

/** Draw order: rugs, floor pieces, what rests on them, ceiling fixtures (layerOf 3, 0, 1, 2). */
const LAYER_ORDER = [1, 2, 3, 0]

/** Footprints at true size, front edge marked; the 1 ft grid faintly while dragging. Metres space. */
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
    ctx.strokeStyle = 'rgba(242,242,240,0.08)'
    ctx.lineWidth = px(1)
    ctx.stroke()
  }
  const moving = new Set(drag?.ids)
  const hot = drag?.error ? C.red : C.accent
  const shown = [...(drag?.furniture ?? pieces)].sort((p, q) => LAYER_ORDER[layerOf(p)] - LAYER_ORDER[layerOf(q)])
  for (const p of shown) {
    const q = pieceQuad(p)
    const on = moving.has(p.id) || (!drag && sel.has(p.id))
    const layer = layerOf(p)
    ctx.beginPath()
    q.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
    ctx.closePath()
    if (on || layer < 2) {
      ctx.fillStyle = on ? (hot === C.red ? 'rgba(229,83,75,0.35)' : 'rgba(232,193,112,0.3)') : 'rgba(242,242,240,0.07)'
      ctx.fill()
    }
    ctx.setLineDash(layer >= 2 ? [px(3), px(3)] : [])
    ctx.strokeStyle = on ? hot : 'rgba(242,242,240,0.5)'
    ctx.lineWidth = px(1)
    ctx.stroke()
    ctx.setLineDash([])
    if (layer === 2 || layer === 3) continue
    ctx.beginPath() // front edge (local +y side: footprint corners 2 → 3)
    ctx.moveTo(q[2].x, q[2].y)
    ctx.lineTo(q[3].x, q[3].y)
    ctx.strokeStyle = on ? hot : C.ink
    ctx.lineWidth = px(2.5)
    ctx.stroke()
  }
}

/** Floor pieces' short labels where they fit (the selected one always). Screen space. */
function labelFurniture(ctx: CanvasRenderingContext2D, a: DrawArgs, sel: Set<Id>, toScreen: (m: Pt) => Pt): void {
  const { pieces, drag } = a.furniture!
  ctx.font = '300 11px Inter, system-ui, sans-serif'
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
    ctx.fillStyle = on ? (drag?.error ? C.red : C.accent) : C.ink
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

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, width, height)

  if (a.img) {
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * panX, dpr * panY)
    ctx.globalAlpha = 0.55
    ctx.drawImage(a.img, 0, 0)
    ctx.globalAlpha = 1
  }

  // meters space: metre (0,0) sits at plan px originPx
  const m0 = mToScreen(frame, { x: 0, y: 0 })
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * m0.x, dpr * m0.y)
  ctx.lineJoin = 'round'

  const hotRoom = state.tool === 'room' && a.hover ? roomAt(a.hover.m, a.rooms, state.unit) : null
  for (const r of a.rooms) {
    const poly = roomPolygon(r, state.unit)
    ctx.beginPath()
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fillStyle = r === hotRoom ? 'rgba(232,193,112,0.16)' : 'rgba(232,193,112,0.05)'
    ctx.fill()
  }

  // guides
  const guides = a.hover?.snap?.guides ?? []
  if (guides.length) {
    ctx.setLineDash([px(4), px(4)])
    ctx.strokeStyle = C.muted
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

  // walls
  for (const w of state.unit.walls) {
    const f = wallFrame(w, vs)
    const h = w.thicknessM / 2
    slab(ctx, f, h)
    const selected = sel.has(w.id)
    const exterior = w.thicknessM >= 0.2
    ctx.fillStyle = selected ? 'rgba(232,193,112,0.35)' : exterior ? C.ink : 'rgba(242,242,240,0.22)'
    ctx.fill()
    ctx.strokeStyle = selected ? C.accent : C.ink
    ctx.lineWidth = px(selected ? 2 : 1)
    ctx.stroke()

    for (const op of w.openings) {
      const osel = sel.has(op.id)
      drawOpening(ctx, f, h, op, osel && state.dragBlocked ? C.red : osel ? C.accent : C.ink, px(osel ? 1.5 : 1), px)
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
    drawOpening(ctx, f, h, og.opening, color, px(2), px)
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
      slab(ctx, ghostWall, chain.thicknessM / 2)
      ctx.fillStyle = 'rgba(232,193,112,0.45)'
      ctx.fill()
      ctx.strokeStyle = C.accent
      ctx.lineWidth = px(1)
      ctx.stroke()
    }
  }

  if (a.furniture) drawFurniture(ctx, a, sel, px)

  // vertices
  for (const v of vs) {
    const active = sel.has(v.id) || chainIds.has(v.id)
    ctx.beginPath()
    ctx.arc(v.x, v.y, px(active ? 4 : 2.5), 0, Math.PI * 2)
    ctx.fillStyle = active ? C.accent : C.ink
    ctx.fill()
  }

  // snap ring
  if (snap && (state.tool === 'wall' || a.hover?.hit?.kind === 'vertex')) {
    ctx.beginPath()
    ctx.arc(snap.x, snap.y, px(snap.kind === 'vertex' || snap.kind === 'wall' ? 8 : 4), 0, Math.PI * 2)
    ctx.strokeStyle = C.accent
    ctx.lineWidth = px(1.5)
    ctx.stroke()
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
  ctx.font = '300 10px Inter, system-ui, sans-serif'
  ctx.fillStyle = C.muted
  for (const [id, side] of a.labelSides) {
    const w = state.unit.walls.find((x) => x.id === id)
    if (!w) continue
    const f = wallFrame(w, vs)
    if (f.lengthM * s >= MIN_LABEL_PX) lengthLabel(f, side, w.thicknessM)
  }
  if (ghostWall && chain) {
    ctx.font = '400 12px Inter, system-ui, sans-serif'
    ctx.fillStyle = C.accent
    lengthLabel(ghostWall, 1, chain.thicknessM)
  }
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'center'
  for (const l of state.unit.roomLabels) {
    const p = toScreen(l)
    const active = sel.has(l.id)
    ctx.font = '300 13px Inter, system-ui, sans-serif'
    ctx.fillStyle = active ? C.accent : C.ink
    ctx.fillText(l.name || 'Room', p.x, p.y)
    if (l.printedSize) {
      ctx.font = '300 11px Inter, system-ui, sans-serif'
      ctx.fillStyle = active ? C.accent : C.muted
      ctx.fillText(l.printedSize, p.x, p.y + 14)
    }
  }
  if (a.furniture) labelFurniture(ctx, a, sel, toScreen)

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
