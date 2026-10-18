/**
 * Auto-trace entry (wave 16). The Studio calls this; the solver agent implements it in solve.ts.
 * Plan image in, an editable core Unit draft + review list out. Pick mode: `prepare` the sheet once, then `preview`
 * (per hover) and `pick` (the click) on it — `autoTrace` = both in one go.
 */
import type { PreparedSolve } from './solve'
import type { AutoTraceOpts, AutoTraceResult, Gray, Px } from './types'

export type { AutoTraceOpts, AutoTraceResult, ReviewItem } from './types'

export async function autoTrace(gray: Gray, opts: AutoTraceOpts = {}): Promise<AutoTraceResult> {
  const { solve } = await import('./solve')
  return solve(gray, opts)
}
export const prepare = async (gray: Gray, opts: AutoTraceOpts = {}): Promise<PreparedSolve> => (await import('./solve')).prepare(gray, opts)
/** s27 AI-prep: the sheet's rejected print rides along with every pick (the Studio keeps it beside the draft) */
const withStrips = (p: PreparedSolve, r: AutoTraceResult): AutoTraceResult => (p.traces.text.rejected ? { ...r, rejectedText: p.traces.text.rejected } : r)
export const pick = async (p: PreparedSolve, px: Px): Promise<AutoTraceResult> => withStrips(p, (await import('./solve')).pick(p, px))
/** Level 4: the whole floor — every flat and the core between them — on the prepared sheet */
export const pickFloor = async (p: PreparedSolve): Promise<AutoTraceResult> => withStrips(p, (await import('./solve')).pickFloor(p))
export const preview = async (p: PreparedSolve, px: Px) => (await import('./solve')).preview(p, px)
