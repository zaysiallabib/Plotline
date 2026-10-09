/**
 * Dev / test stand-in for autoTrace until the wave-16 solver lands: the hand trace of Sheltech Type A (it sits on
 * /assets/plan-sheltech-l2.jpg) plus three review items. Dev: /studio?mock-trace. Never in a production bundle
 * (autotrace.ts imports it behind import.meta.env.DEV).
 */
import { deriveRooms, unitBounds, wallFrame } from '../core'
import type { Unit } from '../core'
import sheltechA from '../data/units/sheltech-a.json'
import type { AutoTraceOpts, AutoTraceResult, Gray } from '../trace/types'

export function mockTraceResult(): AutoTraceResult {
  const unit = { ...(sheltechA as unknown as Unit), name: '', furniture: [] }
  // the one room of the hand trace whose size check fails (main rectangle 2½" narrow, outline far off): a real size row
  const living = unit.roomLabels.find((l) => l.name === 'Bed 3')!
  const wall = unit.walls.find((w) => w.openings.some((o) => o.kind === 'window'))!
  const win = wall.openings.find((o) => o.kind === 'window')!
  const f = wallFrame(wall, unit.vertices)
  const c = win.offsetM + win.widthM / 2
  const b = unitBounds(unit)
  return {
    unit,
    review: [
      { id: 'r-size', kind: 'size-mismatch', at: living, entityId: living.id, message: `${living.name}: printed ${living.printedSize ?? "14'-0\" × 16'-0\""}, traced 4 in shorter` },
      { id: 'r-open', kind: 'opening-guess', at: { x: f.origin.x + f.dir.x * c, y: f.origin.y + f.dir.y * c }, entityId: win.id, message: 'Window or sliding door? Guessed a window' },
      { id: 'r-scale', kind: 'scale', at: { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }, message: 'Scale from 3 printed sizes — check one long wall' },
    ],
    stats: { ms: 3200, pxPerM: unit.planImage!.pxPerM, scaleFrom: 'dims', walls: unit.walls.length, rooms: deriveRooms(unit).length, labelled: unit.roomLabels.length },
  }
}

/** autoTrace's shape, with ~3 s of staged progress so the UI can be seen working. */
export async function mockAutoTrace(_gray: Gray, opts: AutoTraceOpts = {}): Promise<AutoTraceResult> {
  const stages: [string, number][] = [['Finding walls', 0.1], ['Finding walls', 0.35], ['Reading labels', 0.5], ['Reading labels', 0.8], ['Building rooms', 0.95]]
  for (const [stage, f] of stages) {
    opts.onProgress?.(stage, f)
    await new Promise((r) => setTimeout(r, 600))
  }
  return mockTraceResult()
}
