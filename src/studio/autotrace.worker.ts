/**
 * Auto-trace off the main thread (tesseract.js starts its own OCR workers from here — checked in dev and in a
 * production build). One TraceJob in; progress messages, then the result or an error message out. The trace code,
 * tesseract.js and the dev mock live only in this worker's bundle, never in the Studio chunk.
 */
import { autoTrace } from '../trace'
import { geminiReader } from '../trace/ai'
import type { AutoTraceResult, Gray, Px } from '../trace/types'

export interface TraceJob {
  gray: Gray
  /** the sheet in colour (RGBA, same size): planter greens, blue glazing, colour fills */
  rgb?: { width: number; height: number; data: Uint8ClampedArray }
  pickPx: Px
  /** the Scale tool's, when it was set */
  pxPerM?: number
  /** the Gemini key from this browser (workers have no localStorage) */
  aiKey?: string
  /** the wall stage (AutoTraceOpts.tracker): the founder's band tracker, or the skeleton */
  tracker?: 'skeleton' | 'bands'
  /** dev only (/studio?mock-trace): the fixed Sheltech A result instead of the solver */
  mock?: boolean
}
export type TraceMsg = { type: 'progress'; stage: string; fraction: number } | { type: 'done'; result: AutoTraceResult } | { type: 'error'; message: string }

const post = (m: TraceMsg) => postMessage(m)

onmessage = async ({ data: job }: MessageEvent<TraceJob>) => {
  try {
    const trace = import.meta.env.DEV && job.mock ? (await import('./autotraceMock')).mockAutoTrace : autoTrace
    const onProgress = (stage: string, fraction: number) => post({ type: 'progress', stage, fraction })
    post({ type: 'done', result: await trace(job.gray, { pickPx: job.pickPx, pxPerM: job.pxPerM, rgb: job.rgb, tracker: job.tracker, ai: job.aiKey ? geminiReader(job.aiKey) : undefined, onProgress }) })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
