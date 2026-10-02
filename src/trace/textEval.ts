/**
 * Score a TextTrace against a hand-traced unit (its roomLabels + planImage give pixel ground truth:
 * px = originPx + m × pxPerM). Pure; used by the real-image eval run in a browser and by text.test.ts.
 */
import { FT, deriveRooms, pointInPolygon, roomPolygon } from '../core'
import type { Unit } from '../core'
import { parseDims } from './text'
import type { TextItem, TextTrace } from './types'

const INCH = 0.0254
const SYNONYM: Record<string, string> = { VER: 'VERANDA', VERANDAH: 'VERANDA', PDR: 'POWDER', SUNSHADE: 'PLANTER', LIFTS: 'LIFT', TOILETS: 'TOILET' }
const IGNORE = new Set(['ROOM', 'AND', 'THE', 'CUM'])

function tokens(s: string): { words: Set<string>; nums: Set<number> } {
  const raw = s.toUpperCase().replace(/\(.*?\)/g, ' ').split(/[^A-Z0-9]+/).filter(Boolean)
  const words = new Set(raw.filter((t) => /^[A-Z]{3,}$/.test(t) && !IGNORE.has(t)).map((t) => SYNONYM[t] ?? t))
  const nums = new Set(raw.filter((t) => /^\d{1,2}$/.test(t)).map(Number))
  return { words, nums }
}

/** Same label? A shared name word (with plan abbreviations: VER. = veranda, PDR = powder) and no conflicting number. */
export function sameLabel(truthName: string, ocrText: string): boolean {
  const a = tokens(truthName)
  const b = tokens(ocrText.split('\n')[0])
  if (![...a.words].some((w) => b.words.has(w))) return false
  return !(a.nums.size && b.nums.size && ![...a.nums].some((n) => b.nums.has(n)))
}

export interface TextScore {
  labels: number
  found: number
  dimsTotal: number
  /** labels with a printed size that were found (the rooms-first fit needs these) — wave 19 */
  sizedFound: number
  dimsExact: number
  /** parsed, but not the printed value (worse than no reading: the solver would trust it) */
  dimsMisread: number
  kindOk: number
  greenTotal: number
  greenFound: number
  areaFound: boolean
  missed: string[]
  wrongDims: string[]
  wrongKind: string[]
}

/** A room item matches a truth label when the text agrees and its centre is within `tolM` of the label point or inside its room. */
export function scoreText(trace: TextTrace, unit: Unit, tolM = 1.5): TextScore {
  const pi = unit.planImage!
  const toPx = (p: { x: number; y: number }) => ({ x: pi.originPx.x + p.x * pi.pxPerM, y: pi.originPx.y + p.y * pi.pxPerM })
  const rooms = new Map(deriveRooms(unit).map((r) => [r.id, roomPolygon(r, unit).map(toPx)]))
  const used = new Set<TextItem>()
  const s: TextScore = { labels: 0, found: 0, dimsTotal: 0, sizedFound: 0, dimsExact: 0, dimsMisread: 0, kindOk: 0, greenTotal: 0, greenFound: 0, areaFound: false, missed: [], wrongDims: [], wrongKind: [] }
  for (const label of unit.roomLabels) {
    const p = toPx(label)
    const poly = rooms.get(label.id)
    const truthDims = label.printedSize ? parseDims(label.printedSize) : null
    const green = /planter/i.test(label.name)
    s.labels++
    if (truthDims) s.dimsTotal++
    if (green) s.greenTotal++
    let best: TextItem | undefined
    let bestD = Infinity
    for (const it of trace.items) {
      if (it.kind !== 'room' || used.has(it) || !sameLabel(label.name, it.text)) continue
      const c = { x: it.box.x + it.box.w / 2, y: it.box.y + it.box.h / 2 }
      const d = Math.hypot(c.x - p.x, c.y - p.y) / pi.pxPerM
      if ((d <= tolM || (poly && pointInPolygon(c, poly))) && d < bestD) {
        best = it
        bestD = d
      }
    }
    if (!best) {
      s.missed.push(label.name)
      continue
    }
    used.add(best)
    s.found++
    if (best.roomKind === label.kind) s.kindOk++
    else s.wrongKind.push(`${label.name}: ${best.roomKind} (truth ${label.kind})`)
    if (green && best.green) s.greenFound++
    if (truthDims) {
      s.sizedFound++
      const d = best.dims
      if (d && Math.abs(d.aM - truthDims.aM) <= INCH && Math.abs(d.bM - truthDims.bM) <= INCH) s.dimsExact++
      else {
        if (d) s.dimsMisread++
        s.wrongDims.push(`${label.name}: ${JSON.stringify(best.text)} (truth ${label.printedSize})`)
      }
    }
  }
  const area = unit.areaSqft * FT * FT
  s.areaFound = trace.items.some((it) => it.kind === 'area' && Math.abs(it.areaSqm! - area) < FT * FT * 1.5)
  return s
}
