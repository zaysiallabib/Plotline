/**
 * Pure screen ↔ plan-px ↔ metres transforms (PRODUCT_SPEC §2.1).
 *   plan px = originPx + m × pxPerM          (originPx = image pixel where plan-metre (0,0) sits)
 *   screen  = plan px × zoom + pan
 * Before the scale is set the Studio uses pxPerM = 100, originPx = (0,0).
 */
import type { Pt, Unit } from '../core'
import type { View } from './model'

export interface Frame extends View {
  pxPerM: number
  originPx: Pt
}

export const frameOf = (view: View, planImage: Unit['planImage'] | undefined): Frame => ({
  ...view,
  pxPerM: planImage?.pxPerM ?? 100,
  originPx: planImage?.originPx ?? { x: 0, y: 0 },
})

export const mToPx = (f: Frame, m: Pt): Pt => ({ x: f.originPx.x + m.x * f.pxPerM, y: f.originPx.y + m.y * f.pxPerM })
export const pxToM = (f: Frame, p: Pt): Pt => ({ x: (p.x - f.originPx.x) / f.pxPerM, y: (p.y - f.originPx.y) / f.pxPerM })
export const pxToScreen = (f: Frame, p: Pt): Pt => ({ x: p.x * f.zoom + f.panX, y: p.y * f.zoom + f.panY })
export const screenToPx = (f: Frame, s: Pt): Pt => ({ x: (s.x - f.panX) / f.zoom, y: (s.y - f.panY) / f.zoom })
export const mToScreen = (f: Frame, m: Pt): Pt => pxToScreen(f, mToPx(f, m))
export const screenToM = (f: Frame, s: Pt): Pt => pxToM(f, screenToPx(f, s))
