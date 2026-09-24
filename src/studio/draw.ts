/** Imperative canvas rendering. Transform: meters → screen via s = zoom * pxPerM. */
import { roomPolygon, wallFrame } from '../core'
import type { Id, Pt, Room } from '../core'
import type { StudioState } from './model'
import type { Snap } from './snap'

const C = { bg: '#0f0f10', ink: '#f2f2f0', muted: '#9a9a94', accent: '#e8c170', line: '#2a2b2f', red: '#e5534b' }

export type Hit = { kind: 'vertex' | 'wall' | 'opening' | 'label'; id: Id }
export interface Hover {
  m: Pt
  px: Pt
  snap: Snap | null
  hit: Hit | null
}
export interface DrawArgs {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dpr: number
  state: StudioState
  img: HTMLImageElement | null
  rooms: Room[]
  hover: Hover | null
  scaleStart: Pt | null // plan px
  pxPerM: number
}

export function draw(a: DrawArgs): void {
  const { ctx, state, dpr, pxPerM, width, height } = a
  const { panX, panY, zoom } = state.view
  const s = zoom * pxPerM
  const px = (n: number) => n / s // screen px → meters
  const toScreen = (m: Pt): Pt => ({ x: m.x * s + panX, y: m.y * s + panY })
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

  // meters space
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * panX, dpr * panY)
  ctx.lineJoin = 'round'

  for (const r of a.rooms) {
    const poly = roomPolygon(r, state.unit)
    ctx.beginPath()
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fillStyle = 'rgba(232,193,112,0.05)'
    ctx.fill()
  }

  // guides
  const guides = a.hover?.snap?.guides ?? []
  if (guides.length) {
    ctx.setLineDash([px(4), px(4)])
    ctx.strokeStyle = C.muted
    ctx.lineWidth = px(1)
    const x0 = px(-panX)
    const y0 = px(-panY)
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
    const { origin: o, dir: d, normal: n, lengthM: L } = f
    ctx.beginPath()
    ctx.moveTo(o.x + n.x * h, o.y + n.y * h)
    ctx.lineTo(o.x + d.x * L + n.x * h, o.y + d.y * L + n.y * h)
    ctx.lineTo(o.x + d.x * L - n.x * h, o.y + d.y * L - n.y * h)
    ctx.lineTo(o.x - n.x * h, o.y - n.y * h)
    ctx.closePath()
    const selected = sel.has(w.id)
    const exterior = w.thicknessM >= 0.2
    ctx.fillStyle = selected ? 'rgba(232,193,112,0.35)' : exterior ? C.ink : 'rgba(242,242,240,0.22)'
    ctx.fill()
    ctx.strokeStyle = selected ? C.accent : C.ink
    ctx.lineWidth = px(selected ? 2 : 1)
    ctx.stroke()

    // openings, in wall-local (u along, v across) coordinates
    for (const op of w.openings) {
      ctx.save()
      ctx.transform(d.x, d.y, n.x, n.y, o.x, o.y)
      const u0 = op.offsetM
      const u1 = op.offsetM + op.widthM
      const osel = sel.has(op.id)
      const color = osel && state.dragBlocked ? C.red : osel ? C.accent : C.ink
      ctx.fillStyle = C.bg
      ctx.fillRect(u0, -h - px(0.5), op.widthM, 2 * h + px(1))
      ctx.strokeStyle = color
      ctx.lineWidth = px(osel ? 1.5 : 1)
      ctx.setLineDash([])
      if (op.kind === 'door') {
        const hu = op.hinge === 'b' ? u1 : u0
        const sign = op.swing === 'out' ? -1 : 1
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
  }

  // ghost wall
  const snap = a.hover?.snap
  const chain = state.chain
  if (chain && snap && state.tool === 'wall') {
    const last = vs.find((v) => v.id === chain.ids[chain.ids.length - 1])
    if (last) {
      ctx.setLineDash([px(6), px(4)])
      ctx.strokeStyle = C.accent
      ctx.lineWidth = Math.max(px(1), chain.thicknessM)
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(snap.x, snap.y)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.setLineDash([])
    }
  }

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

  // screen space: labels, scale line
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
