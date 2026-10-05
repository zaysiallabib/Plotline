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

/**
 * Line a plan picture up with a drawing that already exists: picture pixels p1, p2 are the drawing's points m1, m2.
 * Same way up only — `turnDeg` says how far the two pairs disagree (a wrong click, or a turned picture).
 */
export const fitSheet = (p1: Pt, m1: Pt, p2: Pt, m2: Pt): { pxPerM: number; originPx: Pt; turnDeg: number } | null => {
  const dp = { x: p2.x - p1.x, y: p2.y - p1.y }
  const dm = { x: m2.x - m1.x, y: m2.y - m1.y }
  const lp = Math.hypot(dp.x, dp.y)
  const lm = Math.hypot(dm.x, dm.y)
  if (lp < 2 || lm < 0.5) return null
  const pxPerM = lp / lm
  const turn = ((Math.atan2(dp.y, dp.x) - Math.atan2(dm.y, dm.x)) * 180) / Math.PI
  // the midpoints coincide: each click's error is halved
  return {
    pxPerM,
    originPx: { x: (p1.x + p2.x) / 2 - ((m1.x + m2.x) / 2) * pxPerM, y: (p1.y + p2.y) / 2 - ((m1.y + m2.y) / 2) * pxPerM },
    turnDeg: Math.abs(((turn + 540) % 360) - 180),
  }
}
