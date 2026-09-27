/**
 * Auto-trace entry (wave 16). The Studio calls this; the solver agent implements it in solve.ts.
 * Plan image in, an editable core Unit draft + review list out.
 */
import type { AutoTraceOpts, AutoTraceResult, Gray } from './types'

export type { AutoTraceOpts, AutoTraceResult, ReviewItem } from './types'

export async function autoTrace(gray: Gray, opts: AutoTraceOpts = {}): Promise<AutoTraceResult> {
  const { solve } = await import('./solve')
  return solve(gray, opts)
}
