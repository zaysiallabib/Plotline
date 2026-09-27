/**
 * Score hints.ts against a hand-traced unit: a hint is right when its kind is the kind of the truth room it falls in
 * (hint px → plan metres through the registered TruthXf of eval.ts). Hints outside the unit's bounds (the other flat,
 * the core) are ignored; hints inside the bounds but in no room count as `outside`. Pure.
 */
import { deriveRooms, roomAt, roomPolygon, unitBounds } from '../core'
import type { Unit } from '../core'
import type { TruthXf } from './eval'
import type { Px, RoomHint } from './types'

export const GROUPS: Record<string, string[]> = { bed: ['bed'], bath: ['bath'], kitchen: ['kitchen'], 'living/dining': ['living', 'dining'], 'balcony/green': ['balcony'] }

export interface HintScore {
  unitId: string
  /** hints that fall in a truth room */
  hints: number
  correct: number
  /** living ≡ dining (open plan) */
  correctLoose: number
  outside: number
  /** per `what`: [correct, total] */
  byWhat: Record<string, [number, number]>
  rooms: number
  /** truth rooms with ≥ 1 correct hint (loose) */
  covered: number
  /** per GROUPS key: [rooms covered, rooms] */
  groups: Record<string, [number, number]>
  wrong: string[]
  /** for overlays: every scored hint and whether it was right (null = outside any room) */
  marks: { at: Px; kind?: string; ok: boolean | null }[]
}

export const toMetres = (xf: TruthXf, p: Px): Px => ({ x: xf.mid.x + (p.x - xf.c.x) / (xf.k * (1 + xf.ex)), y: xf.mid.y + (p.y - xf.c.y) / (xf.k * (1 + xf.ey)) })
export const toPx = (xf: TruthXf, p: Px): Px => ({ x: xf.c.x + (p.x - xf.mid.x) * xf.k * (1 + xf.ex), y: xf.c.y + (p.y - xf.mid.y) * xf.k * (1 + xf.ey) })

const same = (a: string | undefined, b: string, loose: boolean) => a === b || (loose && a !== undefined && GROUPS['living/dining'].includes(a) && GROUPS['living/dining'].includes(b))

export function scoreHints(hints: RoomHint[], unit: Unit, xf: TruthXf): HintScore {
  const rooms = deriveRooms(unit).filter((r) => unit.roomLabels.some((l) => l.id === r.id))
  const b = unitBounds(unit)
  const s: HintScore = { unitId: unit.id, hints: 0, correct: 0, correctLoose: 0, outside: 0, byWhat: {}, rooms: rooms.length, covered: 0, groups: {}, wrong: [], marks: [] }
  const hit = new Set<string>()
  for (const h of hints) {
    const m = toMetres(xf, h.at)
    if (m.x < b.minX - 0.3 || m.x > b.maxX + 0.3 || m.y < b.minY - 0.3 || m.y > b.maxY + 0.3) continue
    const r = roomAt(m, rooms, unit)
    const what = h.what ?? h.source
    if (!r) {
      s.outside++
      s.marks.push({ at: h.at, kind: h.kind, ok: null })
      continue
    }
    s.hints++
    const ok = same(h.kind, r.kind, false), okLoose = same(h.kind, r.kind, true)
    if (ok) s.correct++
    if (okLoose) (s.correctLoose++), hit.add(r.id)
    else s.wrong.push(`${what}→${h.kind} in ${r.name} (${r.kind}) @${Math.round(h.at.x)},${Math.round(h.at.y)}`)
    const bw = (s.byWhat[what] ??= [0, 0])
    bw[1]++
    if (okLoose) bw[0]++
    s.marks.push({ at: h.at, kind: h.kind, ok: okLoose })
  }
  s.covered = hit.size
  for (const [g, kinds] of Object.entries(GROUPS)) {
    const rs = rooms.filter((r) => kinds.includes(r.kind))
    s.groups[g] = [rs.filter((r) => hit.has(r.id)).length, rs.length]
  }
  return s
}

/** Truth room outlines in image px (for overlays and the colour-propagation eval). */
export function truthRooms(unit: Unit, xf: TruthXf): { name: string; kind: string; poly: Px[] }[] {
  return deriveRooms(unit)
    .filter((r) => unit.roomLabels.some((l) => l.id === r.id))
    .map((r) => ({ name: r.name, kind: r.kind, poly: roomPolygon(r, unit).map((p) => toPx(xf, p)) }))
}

export function formatHintScores(rows: HintScore[]): string {
  const head = `${'unit'.padEnd(22)} hints right(strict/loose) outside  rooms-covered  ${Object.keys(GROUPS).map((g) => g.padEnd(14)).join('')} by detector`
  const lines = rows.map((r) => {
    const g = Object.keys(GROUPS).map((k) => `${r.groups[k][0]}/${r.groups[k][1]}`.padEnd(14)).join('')
    const bw = Object.entries(r.byWhat).map(([w, [c, n]]) => `${w} ${c}/${n}`).join(', ')
    return `${r.unitId.padEnd(22)} ${String(r.hints).padStart(5)} ${`${r.correct}/${r.correctLoose}`.padStart(9)}              ${String(r.outside).padStart(4)}  ${`${r.covered}/${r.rooms}`.padStart(8)}       ${g} ${bw}`
  })
  return [head, ...lines].join('\n')
}
