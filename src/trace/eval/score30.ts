/**
 * The 30-sheet scorer (session 26, step 0): on real brochure sheets, how many PRINTED rooms Auto-trace closes and names
 * right — what the founder counts in the Studio after drop sheet → S on a printed size → Auto-trace. Pure: the runner
 * (score30.test.ts, `npm run score30`) does the reading, tracing and files. How to run / add a sheet: Docs/AUTOTRACE_SCORER.md.
 */
import { deriveRooms, pointInPolygon, roomPolygon } from '../../core'
import type { Unit } from '../../core'
import { isUnnamed } from '../../studio/review'
import { KNOBS } from '../solve'
import { classifyRoom, normaliseName } from '../text'
import type { AutoTraceStats, Px } from '../types'

/** One room printed on the sheet: its own words, its printed size, a point well inside it (IMAGE px). */
export interface Expected {
  name: string
  size?: string
  at: [number, number]
  /** the building core: lobby, lift, stair, corridor */
  core?: true
  /** multi-flat sheets: the flat it belongs to (a `flats[].name` on flat-click sheets) */
  flat?: string
}

export interface Sheet {
  file: string
  w: number
  h: number
  /** the S tool: two image-px points and the printed length between them */
  scale: { a: [number, number]; b: [number, number]; len: string; what?: string }
  /** flat clicks (image px); traced one by one when `floor === false`, else Whole floor only */
  flats?: { name: string; at: [number, number] }[]
  floor?: false
  style: string
  expected: Expected[]
}

/**
 * right = closed, named for it; wrong = closed, another name; unnamed = closed "Space N"; merged = its room holds another
 * printed room too (and carries that one's name, or none); open = no closed room there (or one over KNOBS.maxRoomSqm).
 */
export type State = 'right' | 'wrong' | 'unnamed' | 'merged' | 'open'
export interface RoomResult extends Expected {
  state: State
  /** the traced room's name and area there */
  got?: string
  gotSqm?: number
  /** its name is among the names Auto-trace read (stats.printed) */
  read: boolean
}
export interface SheetScore {
  rooms: RoomResult[]
  /** closed rooms of 1 m² … maxRoomSqm holding no printed room */
  falseRooms: { name: string; areaSqm: number; at: Px }[]
  /**
   * pillars touching no wall that bounds a closed room (a chair, a sofa, a table taken for a column: the tracer keeps only
   * pillars some draft wall runs into, so "touches no wall at all" never happens — the walls a chair touches are its own
   * table / sofa lines, which close no room)
   */
  pillarsInRooms: Px[]
}

const tokens = (s: string) => normaliseName(s).split(/[^A-Z0-9]+/).filter(Boolean)
const numbers = (s: string) => new Set(tokens(s).filter((t) => /^\d{1,2}$/.test(t)).map(Number))
const stems = (s: string) => new Set(tokens(s).filter((t) => /^[A-Z]{3,}$/.test(t)).map((t) => t.slice(0, 4)))

/**
 * The traced name is right for the printed one: the tracer's own kind of both (text.ts classifyRoom) is the same, and the
 * number when the print carries one ("Suite 2" on SUITE-2 or BED-2 is right, "Bed 1" or "Bed" on BED-2 is wrong). Kind
 * 'other' is the whole core, so there a word is shared too (Lobby is no Stair).
 */
export function nameRight(printed: string, got: { name: string; kind: string }): boolean {
  const want = classifyRoom(printed)
  if (!want || want.kind !== got.kind) return false
  const n = numbers(printed)
  if (n.size && ![...numbers(got.name)].some((x) => n.has(x))) return false
  const w = stems(got.name)
  return want.kind !== 'other' || [...stems(printed)].some((x) => w.has(x))
}

/** distance from p to the box (0 inside) */
const toBox = (p: Px, x0: number, y0: number, x1: number, y1: number) => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1))

/** The draft as the Studio holds it (after its import) against the sheet's printed rooms. */
export function scoreUnit(unit: Unit, stats: Pick<AutoTraceStats, 'printed'>, expected: Expected[]): SheetScore {
  const { pxPerM: k, originPx: o } = unit.planImage!
  const toM = (p: Px): Px => ({ x: (p.x - o.x) / k, y: (p.y - o.y) / k })
  const toPx = (p: Px): Px => ({ x: o.x + p.x * k, y: o.y + p.y * k })
  const rooms = deriveRooms(unit)
  const polys = rooms.map((r) => roomPolygon(r, unit))
  // the smallest room around the point (deriveRooms' own rule for a label)
  const face = expected.map((e) => {
    const p = toM({ x: e.at[0], y: e.at[1] })
    let f = -1
    rooms.forEach((r, i) => {
      if (pointInPolygon(p, polys[i]) && (f < 0 || r.areaSqm < rooms[f].areaSqm)) f = i
    })
    return f >= 0 && rooms[f].areaSqm <= KNOBS.maxRoomSqm ? f : -1
  })
  const printed = (stats.printed ?? []).map((p) => ({ ...p, px: toPx(p.at), used: false }))
  const dist = (p: { px: Px }, e: Expected) => Math.hypot(p.px.x - e.at[0], p.px.y - e.at[1])
  const out = expected.map((e, i): RoomResult => {
    // names read: the nearest unused read name that is right for it, within 3 m
    const near = printed.filter((p) => !p.used && nameRight(e.name, p) && dist(p, e) <= 3 * k).sort((p, q) => dist(p, e) - dist(q, e))[0]
    if (near) near.used = true
    const f = face[i]
    if (f < 0) return { ...e, state: 'open', read: !!near }
    const r = rooms[f]
    const base = { ...e, got: r.name, gotSqm: Math.round(r.areaSqm * 10) / 10, read: !!near }
    const mates = face.flatMap((g, j) => (g === f ? [j] : []))
    if (mates.length > 1) {
      // one room, several printed rooms: right only for the first one whose name it carries
      const own = mates.find((j) => !isUnnamed(r) && nameRight(expected[j].name, r))
      return { ...base, state: own === i ? 'right' : 'merged' }
    }
    return { ...base, state: isUnnamed(r) ? 'unnamed' : nameRight(e.name, r) ? 'right' : 'wrong' }
  })
  const held = new Set(face)
  const falseRooms = rooms.flatMap((r, i) => (!held.has(i) && r.areaSqm >= 1 && r.areaSqm <= KNOBS.maxRoomSqm ? [{ name: r.name, areaSqm: Math.round(r.areaSqm * 10) / 10, at: toPx(r.centroid) }] : []))
  const V = new Map(unit.vertices.map((v) => [v.id, v]))
  const bounding = new Set(rooms.filter((r) => r.areaSqm >= 0.5).flatMap((r) => r.wallIds))
  const walls = unit.walls.filter((w) => bounding.has(w.id)).map((w) => ({ a: V.get(w.a)!, b: V.get(w.b)!, half: w.thicknessM / 2 }))
  // ponytail: each wall's centre line sampled every 2 cm, not an exact segment–box distance
  const touches = (x0: number, y0: number, x1: number, y1: number) =>
    walls.some(({ a, b, half }) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.02))
      for (let s = 0; s <= n; s++) if (toBox({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n }, x0, y0, x1, y1) <= half + 0.02) return true
      return false
    })
  const pillarsInRooms = (unit.pillars ?? []).filter((c) => !touches(c.x - c.wM / 2, c.y - c.hM / 2, c.x + c.wM / 2, c.y + c.hM / 2)).map((c) => toPx(c))
  return { rooms: out, falseRooms, pillarsInRooms }
}

/** One table row's figures: flat rooms (the core apart), the core's right / printed, the rest. */
export function rowOf(s: SheetScore) {
  const flat = s.rooms.filter((r) => !r.core), core = s.rooms.filter((r) => r.core)
  const n = (st: State) => flat.filter((r) => r.state === st).length
  return {
    printed: flat.length,
    right: n('right'),
    wrong: n('wrong'),
    unnamed: n('unnamed'),
    merged: n('merged'),
    open: n('open'),
    coreRight: core.filter((r) => r.state === 'right').length,
    core: core.length,
    falseRooms: s.falseRooms.length,
    pillars: s.pillarsInRooms.length,
    read: flat.filter((r) => r.read).length,
  }
}
export type Row = ReturnType<typeof rowOf> & { sheet: string; s: number }

const COLS: [keyof Row, string][] = [
  ['sheet', 'sheet'],
  ['printed', 'printed'],
  ['right', 'closed+named right'],
  ['wrong', 'wrong name'],
  ['unnamed', 'unnamed'],
  ['merged', 'merged'],
  ['open', 'open'],
  ['core', 'core right/printed'],
  ['falseRooms', 'false rooms'],
  ['pillars', 'pillars in rooms'],
  ['read', 'names read'],
  ['s', 's'],
]

/** The table (one row per sheet + the total) and the headline. */
export function formatTable(rows: Row[]): string {
  const sum = (f: keyof Row) => rows.reduce((t, r) => t + (r[f] as number), 0)
  const total = { ...Object.fromEntries(COLS.slice(1).map(([f]) => [f, sum(f)])), coreRight: sum('coreRight'), sheet: 'TOTAL' } as Row
  const cell = (r: Row, f: keyof Row) => (f === 'core' ? `${r.coreRight}/${r.core}` : f === 's' ? r.s.toFixed(0) : String(r[f]))
  const all = [...rows, total]
  const width = COLS.map(([f, h]) => Math.max(h.length, ...all.map((r) => cell(r, f).length)))
  const line = (cells: string[]) => `| ${cells.map((c, i) => (i ? c.padStart(width[i]) : c.padEnd(width[i]))).join(' | ')} |`
  const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) : '0.0')
  return [
    line(COLS.map(([, h]) => h)),
    `|${width.map((w, i) => (i ? '-'.repeat(w + 1) + ':' : '-'.repeat(w + 2))).join('|')}|`,
    ...rows.map((r) => line(COLS.map(([f]) => cell(r, f)))),
    line(COLS.map(([f]) => cell(total, f))),
    '',
    `${total.right} of ${total.printed} printed rooms closed and named right = ${pct(total.right, total.printed)} %`,
    `with the core: ${total.right + total.coreRight} of ${total.printed + total.core} = ${pct(total.right + total.coreRight, total.printed + total.core)} %`,
    `names read: ${total.read} of ${total.printed} = ${pct(total.read, total.printed)} %`,
  ].join('\n')
}
