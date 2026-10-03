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
export const pick = async (p: PreparedSolve, px: Px): Promise<AutoTraceResult> => (await import('./solve')).pick(p, px)
export const preview = async (p: PreparedSolve, px: Px) => (await import('./solve')).previewFlat(p.traces, px)
