/**
 * A whole-floor sheet zoomed out stays readable (s31 crowd): which look each room name takes on the plan, and where an
 * issue badge goes so it covers no name. Screen px, pure: draw.ts measures the names, IssueLayer places the badges.
 */
import type { Pt } from '../core'

export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
export const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * A room name's looks, the full one first: tracked capitals with the printed size under them; the tracking dropped; one
 * size smaller with the printed size left out. Past the last the name shows only while the mouse is over its room.
 */
export const NAME_LOOKS = [
  { px: 10, track: 0.1, size: true },
  { px: 10, track: 0, size: true },
  { px: 9, track: 0, size: false },
] as const

export interface NameBox {
  /** its rectangle in each of NAME_LOOKS, each inside the one before */
  rects: Rect[]
  /** two that cannot both show: the higher keeps its name (the room's area) */
  rank: number
}

/**
 * Each name's look (a NAME_LOOKS index; -1 = shown only under the mouse). Every name that overlaps another steps down a
 * look, together with it, until none does or it is in the last look; two that still overlap there: the higher rank shows,
 * the other waits for the mouse. `first` (the room under the mouse) keeps the full look and its neighbours make room.
 * Never two shown names overlap. Ties go by list order.
 */
export function nameLooks(names: NameBox[], first = -1): number[] {
  const last = NAME_LOOKS.length - 1
  const look = names.map(() => 0)
  const r = (i: number) => names[i].rects[look[i]]
  for (;;) {
    const down = names.map((_, i) => i !== first && look[i] < last && names.some((_, j) => j !== i && overlaps(r(i), r(j))))
    if (!down.includes(true)) break
    down.forEach((d, i) => d && look[i]++)
  }
  const order = names.map((_, i) => i).sort((a, b) => Number(b === first) - Number(a === first) || names[b].rank - names[a].rank || a - b)
  const shown: number[] = []
  for (const i of order) {
    if (shown.some((j) => overlaps(r(i), r(j)))) look[i] = -1
    else shown.push(i)
  }
  return look
}

/** where a badge may go from its spot, in order: beside it (up-right first), then above / below / aside further out */
export const AROUND: Pt[] = [
  { x: 12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: -12 }, { x: -12, y: 12 },
  { x: 0, y: -26 }, { x: 0, y: 26 }, { x: 26, y: 0 }, { x: -26, y: 0 },
  { x: 0, y: -40 }, { x: 0, y: 40 }, { x: 40, y: -26 }, { x: -40, y: -26 }, { x: 40, y: 26 }, { x: -40, y: 26 },
]

export interface BadgeBox {
  /** its spot, screen px */
  at: Pt
  /** half its width and height */
  hw: number
  hh: number
  /** a dot may sit on its spot itself */
  dot: boolean
}

/**
 * Each badge's offset from its spot (list order): the first place in AROUND (a dot: its spot first) that covers no room
 * name and no badge placed before it; none free: the first that covers no name, else the first.
 */
export function placeBadges(badges: BadgeBox[], names: Rect[]): Pt[] {
  const placed: Rect[] = []
  return badges.map((b) => {
    const tries = b.dot ? [{ x: 0, y: 0 }, ...AROUND] : AROUND
    const box = (o: Pt): Rect => ({ x0: b.at.x + o.x - b.hw, y0: b.at.y + o.y - b.hh, x1: b.at.x + o.x + b.hw, y1: b.at.y + o.y + b.hh })
    const free = (o: Pt) => !names.some((n) => overlaps(n, box(o)))
    const o = tries.find((t) => free(t) && !placed.some((p) => overlaps(p, box(t)))) ?? tries.find(free) ?? tries[0]
    placed.push(box(o))
    return o
  })
}
