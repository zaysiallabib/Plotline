/**
 * s27 rows: the marks' fixes worked out off the main thread (issues.ts fixesOf, one mark at a time) — every fix is
 * checked by applying it, and a six-flat floor's 755 rows take a minute or more of that; the page stays live meanwhile.
 * A `job` replaces the one before (`seq` comes back with each answer); `first` moves the mark open on the plan (and a row
 * on its spot) to the front; `stop`: the plan changed, the job is dropped.
 */
import type { PrintedRoom } from '../trace/types'
import type { Room, Unit } from '../core'
import { fixesOf, type Mark, type MarkFixes } from './issues'
import type { StudioIssue } from './model'

export type FixesIn = { type: 'job'; seq: number; unit: Unit; marks: Mark[]; issues: StudioIssue[]; printed?: PrintedRoom[]; rooms: Room[] } | { type: 'first'; key: string } | { type: 'stop' }
export type FixesOut = { seq: number; key: string; got: MarkFixes }

let job: Extract<FixesIn, { type: 'job' }> | null = null
let todo: Mark[] = []
let busy = false

const run = () => {
  const m = todo.shift()
  if (!job || !m) return void (busy = false)
  postMessage({ seq: job.seq, key: m.key, got: fixesOf(job.unit, [m], job.issues, job.printed, job.rooms).get(m.key) ?? { fixes: [] } } satisfies FixesOut)
  setTimeout(run, 0) // (a newer job or `first` gets in between two marks)
}

onmessage = ({ data }: MessageEvent<FixesIn>) => {
  if (data.type === 'stop') return void (todo = [])
  if (data.type === 'first') {
    const mine = todo.filter((m) => (m.twinOf ?? m.key) === data.key)
    todo = [...mine, ...todo.filter((m) => !mine.includes(m))]
    return
  }
  job = data
  todo = [...data.marks]
  if (!busy) (busy = true), setTimeout(run, 0)
}
