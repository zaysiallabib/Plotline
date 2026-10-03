/**
 * Auto-trace off the main thread (tesseract.js starts its own OCR workers from here — checked in dev and in a
 * production build). The trace code, tesseract.js and the dev mock live only in this worker's bundle, never in the
 * Studio chunk. Pick mode: `prepare` (the sheet's text + walls + graph, once, with progress) → `ready`; each `hover` →
 * `preview` (the flat a click there picks); `pick` → `done` (the click's draft from the same prepared sheet). A bare
 * TraceJob (no `type`) is the old single shot: progress, then the result.
 */
import { autoTrace, pick, prepare, preview } from '../trace'
import { geminiReader } from '../trace/ai'
import type { AutoTraceOpts, AutoTraceResult, Gray, Px } from '../trace/types'

export interface TraceJob {
  gray: Gray
  /** the sheet in colour (RGBA, same size): planter greens, blue glazing, colour fills */
  rgb?: { width: number; height: number; data: Uint8ClampedArray }
  pickPx: Px
  /** the Scale tool's, when it was set */
  pxPerM?: number
  /** the Gemini key from this browser (workers have no localStorage) */
  aiKey?: string
  /** the wall stage (AutoTraceOpts.tracker): the wall tracks (default), the band tracker, or the skeleton */
  tracker?: 'skeleton' | 'bands' | 'tracks'
  /** dev only (/studio?mock-trace): the fixed Sheltech A result instead of the solver */
  mock?: boolean
}
export type TraceIn = TraceJob | { type: 'prepare'; job: Omit<TraceJob, 'pickPx'> } | { type: 'hover'; px: Px; seq: number } | { type: 'pick'; px: Px }
export type Preview = { polys: Px[][]; names: { at: Px; text: string }[] }
export type TraceMsg =
  | { type: 'progress'; stage: string; fraction: number }
  | { type: 'ready' }
  | ({ type: 'preview'; seq: number } & Preview)
  | { type: 'done'; result: AutoTraceResult }
  | { type: 'error'; message: string }

const post = (m: TraceMsg) => postMessage(m)
const optsOf = (job: Omit<TraceJob, 'pickPx'>): AutoTraceOpts => ({ pxPerM: job.pxPerM, rgb: job.rgb, tracker: job.tracker, ai: job.aiKey ? geminiReader(job.aiKey) : undefined, onProgress: (stage, fraction) => post({ type: 'progress', stage, fraction }) })
const mockOf = async () => (await import('./autotraceMock')).mockAutoTrace

let job: Omit<TraceJob, 'pickPx'> | null = null
let prepared: ReturnType<typeof prepare> | null = null
let ready: Awaited<ReturnType<typeof prepare>> | null = null

onmessage = async ({ data }: MessageEvent<TraceIn>) => {
  try {
    if (!('type' in data)) {
      const trace = import.meta.env.DEV && data.mock ? await mockOf() : autoTrace
      return post({ type: 'done', result: await trace(data.gray, { ...optsOf(data), pickPx: data.pickPx }) })
    }
    if (data.type === 'prepare') {
      job = data.job
      // (the dev mock has nothing to prepare: its pick is the fixed result)
      if (!(import.meta.env.DEV && job.mock)) ready = await (prepared = prepare(job.gray, optsOf(job)))
      return post({ type: 'ready' })
    }
    // (a spot no flat can be picked from previews nothing — the click there still reports why)
    if (data.type === 'hover') return void (ready && post({ type: 'preview', seq: data.seq, ...(await preview(ready, data.px).catch(() => ({ polys: [], names: [] }))) }))
    // a click before the sheet is ready waits for it (its progress keeps coming)
    if (import.meta.env.DEV && job?.mock) return post({ type: 'done', result: await (await mockOf())(job.gray, { ...optsOf(job), pickPx: data.px }) })
    post({ type: 'done', result: await pick(await prepared!, data.px) })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
