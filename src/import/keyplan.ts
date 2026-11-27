/**
 * The key plan on a brochure's flat page (session 31 polish3). A Dhaka brochure prints a page a flat ("TYPE-A", "TYPE-C/G/K",
 * all "LEVEL 1 to 11") and, in a corner, a small diagram of the whole floor — the towers' outlines with this flat's place
 * filled in a colour (Rangs Torukabbo: dark green in thin green outlines; a flat used in three towers is filled three times).
 * Read from the page's own fills: the plan (its walls' dark poché and its floor's fill), the mark (one saturated fill colour,
 * small, outside the plan). Then the flats of one floor are put where their marks say: one scale for the brochure (its flats
 * are drawn alike), each mark's turn from its edges (a tower set at an angle), each flat slid until its footprint covers
 * its mark best. Pure; the Studio's set build draws the pictures (or the drawings) there.
 */
import type { Pt } from '../core'
import type { Box, SheetPage } from './sheets'

/** what a flat's page says of where it stands: its plan's box and footprint (page points, y up) and its marks (key points) */
export interface KeyPlan {
  /** the plan's box on its page: what is drawn (and what the picture shows) */
  plan: Box
  /** the plan's filled shapes — walls and floor — its footprint */
  foot: Pt[][]
  /** each place the key shows it, as the outline(s) filled there: key points from the key's own corner */
  marks: Pt[][][]
  /** the key's size (key points): the same key on every page of a brochure */
  key: { w: number; h: number }
}

/** a fill's colour as 0–255 r g b: '#005725', '0,87,37', a gray level */
function rgbOf(layer: string): [number, number, number] | null {
  const c = layer.replace(/^fill /, '')
  if (/^#[0-9a-f]{6}$/i.test(c)) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]
  const n = c.split(',').map(Number)
  if (n.every(Number.isFinite) && (n.length === 3 || n.length === 1)) return (n.length === 1 ? [n[0], n[0], n[0]] : n) as [number, number, number]
  return null
}
const lum = ([r, g, b]: number[]) => 0.3 * r + 0.59 * g + 0.11 * b
const boxOf = (pts: Pt[]): Box => ({ x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) })
const area = (q: Pt[]) => Math.abs(q.reduce((a, p, i) => a + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0)) / 2
const apart = (a: Box, b: Box, gap = 0) => a.x1 + gap < b.x0 || b.x1 + gap < a.x0 || a.y1 + gap < b.y0 || b.y1 + gap < a.y0

/**
 * A flat page's key plan, or null: the page's fills chained into polygons by colour; the plan is the darkest grey fill that
 * spreads widest (its walls' poché) with the light fills inside its box (the floor); the mark the one saturated colour whose
 * fills lie outside the plan, small (under a third of the page each way) — its polygons that touch each other one mark.
 */
export function readKey(page: SheetPage): KeyPlan | null {
  // (the whole page: the key sits in the title's corner, outside the plan's frame)
  const frame = page.box
  const inFrame = (p: Pt) => p.x >= frame.x0 && p.x <= frame.x1 && p.y >= frame.y0 && p.y <= frame.y1
  const polys = new Map<string, Pt[][]>()
  let last: { layer: string; b: Pt } | null = null
  for (const g of page.segs) {
    if (!g.layer.startsWith('fill ') || !inFrame(g.a)) continue
    const list = polys.get(g.layer) ?? polys.set(g.layer, []).get(g.layer)!
    if (last && last.layer === g.layer && Math.hypot(last.b.x - g.a.x, last.b.y - g.a.y) < 0.01 && list.length) list[list.length - 1].push(g.b)
    else list.push([g.a, g.b])
    last = { layer: g.layer, b: g.b }
  }
  const fills = [...polys].map(([layer, ps]) => ({ layer, rgb: rgbOf(layer), ps: ps.filter((q) => q.length >= 3 && area(q) > 0.5) })).filter((f) => f.rgb && f.ps.length)
  const greyish = (c: number[]) => Math.max(...c) - Math.min(...c) <= 40
  const spread = (ps: Pt[][]) => {
    const b = boxOf(ps.flat())
    return (b.x1 - b.x0) * (b.y1 - b.y0)
  }
  const walls = fills.filter((f) => greyish(f.rgb!) && lum(f.rgb!) < 100 && f.ps.length >= 4).sort((a, b) => spread(b.ps) - spread(a.ps))[0]
  if (!walls) return null
  const plan = boxOf(walls.ps.flat())
  const W = page.box.x1 - page.box.x0, H = page.box.y1 - page.box.y0
  const marks = fills.filter((f) => {
    const c = f.rgb!
    if (f === walls || greyish(c)) return false
    const b = boxOf(f.ps.flat())
    return apart(b, plan) && b.x1 - b.x0 <= W / 3 && b.y1 - b.y0 <= H / 3 && f.ps.length <= 40
  })
  if (marks.length !== 1) return null
  // its polygons that touch one another (within half a point) are one place
  const ps = marks[0].ps
  const group = ps.map((_, i) => i)
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])))
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) if (!apart(boxOf(ps[i]), boxOf(ps[j]), 0.5)) group[root(i)] = root(j)
  const by = new Map<number, Pt[][]>()
  ps.forEach((q, i) => (by.get(root(i)) ?? by.set(root(i), []).get(root(i))!).push(q))
  // the key's own frame: the lines round the marks, gathered outwards while each comes within 3 points of what is gathered
  // (a brochure moves its key from page to page: Torukabbo's TYPE-E page sits 22 points right) — marks are kept from its corner
  let k = boxOf(ps.flat())
  const strokes = page.segs.filter((g) => g.layer.startsWith('pen '))
  for (let grew = true; grew; ) {
    grew = false
    for (const g of strokes) {
      const b = boxOf([g.a, g.b])
      if (apart(b, k, 3) || (b.x0 >= k.x0 && b.x1 <= k.x1 && b.y0 >= k.y0 && b.y1 <= k.y1)) continue
      k = { x0: Math.min(k.x0, b.x0), y0: Math.min(k.y0, b.y0), x1: Math.max(k.x1, b.x1), y1: Math.max(k.y1, b.y1) }
      grew = true
    }
  }
  const from = (q: Pt[]) => q.map((p) => ({ x: p.x - k.x0, y: p.y - k.y0 }))
  // the plan's footprint: the walls' poché and the lighter fills inside its box (its floor), not white
  const inPlan = (q: Pt[]) => { const b = boxOf(q); return b.x0 >= plan.x0 - 1 && b.x1 <= plan.x1 + 1 && b.y0 >= plan.y0 - 1 && b.y1 <= plan.y1 + 1 }
  const foot = fills.filter((f) => f === walls || (greyish(f.rgb!) && lum(f.rgb!) < 245)).flatMap((f) => f.ps.filter(inPlan))
  return { plan, foot, marks: [...by.values()].map((m) => m.map(from)), key: { w: k.x1 - k.x0, h: k.y1 - k.y0 } }
}

/** a polygon's turn from its edges, degrees in (−45, 45]: the longest run of edges of one direction (mod 90°) */
export function turnOf(polys: Pt[][]): number {
  const w = new Map<number, number>()
  for (const q of polys)
    q.forEach((p, i) => {
      const r = q[(i + 1) % q.length]
      const L = Math.hypot(r.x - p.x, r.y - p.y)
      const a = ((((Math.atan2(r.y - p.y, r.x - p.x) * 180) / Math.PI) % 90) + 90) % 90
      const k = Math.round(a) % 90
      w.set(k, (w.get(k) ?? 0) + L)
    })
  let best = 0
  for (const [k, v] of w) if (v > (w.get(best) ?? 0)) best = k
  return best > 45 ? best - 90 : best
}

const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) }
}
/** whether p lies in polygon q (even-odd) */
const inside = (p: Pt, q: Pt[]) => {
  let c = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) if (q[i].y > p.y !== q[j].y > p.y && p.x < ((q[j].x - q[i].x) * (p.y - q[i].y)) / (q[j].y - q[i].y) + q[i].x) c = !c
  return c
}

/** one flat drawn at one place of the floor: its plan's centre there and its turn (both y DOWN, the picture's frame: units of the plan's page) */
export interface KeyPlace {
  /** which flat (its index in keyPlace's list) */
  flat: number
  x: number
  y: number
  /** degrees clockwise on the picture (a tower set at an angle) */
  deg: number
  /** how much of its mark the footprint covers there, 0–1 */
  fit: number
}

/**
 * Where each flat of one floor goes (its plan's centre and turn in one frame, the plans' own units, y down), or null when
 * the keys disagree: one scale (key → page units) for the brochure, the median of every flat's height and width over its
 * mark's (an upright mark; a flat drawn turned a quarter against its mark leaves it to the person — side by side); then each
 * mark: its turn from its edges, and the flat slid (±3 key points) to where its footprint covers the mark best.
 * ponytail: a quarter-turned flat and a mirrored one are not read; add the turn search when a brochure needs it.
 */
export function keyPlace(keys: KeyPlan[]): KeyPlace[] | null {
  if (!keys.length) return null
  // (one key on every page: a page whose key differs in size by over 5 % is another drawing — the person places them)
  const kw = keys.map((k) => k.key.w).sort((a, b) => a - b)[Math.floor(keys.length / 2)]
  if (keys.some((k) => Math.abs(k.key.w / kw - 1) > 0.05)) return null
  const ratios: number[] = []
  for (const k of keys) {
    const up = k.marks.find((m) => Math.abs(turnOf(m)) < 2)
    if (!up) continue
    const b = boxOf(up.flat())
    const [mw, mh] = [b.x1 - b.x0, b.y1 - b.y0], [fw, fh] = [k.plan.x1 - k.plan.x0, k.plan.y1 - k.plan.y0]
    // (a quarter-turned flat: its shape the other way round)
    if (Math.abs(Math.log(fw / fh / (mh / mw))) < 0.15 && Math.abs(Math.log(fw / fh / (mw / mh))) > 0.3) return null
    ratios.push(fw / mw, fh / mh)
  }
  if (!ratios.length) return null
  ratios.sort((a, b) => a - b)
  const s = ratios[Math.floor(ratios.length / 2)]
  const out: KeyPlace[] = []
  keys.forEach((k, flat) => {
    const c = { x: (k.plan.x0 + k.plan.x1) / 2, y: (k.plan.y0 + k.plan.y1) / 2 }
    // the footprint in the key's frame (unturned, centred on 0)
    const foot = k.foot.map((q) => q.map((p) => ({ x: (p.x - c.x) / s, y: (p.y - c.y) / s })))
    const fb = boxOf(foot.flat())
    // (the footprint as a grid of 0.25 key points, worked out once: a slide then only looks cells up)
    const step = 0.25
    const nx = Math.ceil((fb.x1 - fb.x0) / step) + 1, ny = Math.ceil((fb.y1 - fb.y0) / step) + 1
    const grid = new Uint8Array(nx * ny)
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) grid[i * ny + j] = foot.some((q) => inside({ x: fb.x0 + i * step, y: fb.y0 + j * step }, q)) ? 1 : 0
    const onFoot = (p: Pt) => {
      const i = Math.round((p.x - fb.x0) / step), j = Math.round((p.y - fb.y0) / step)
      return i >= 0 && j >= 0 && i < nx && j < ny && grid[i * ny + j] === 1
    }
    for (const m of k.marks) {
      const deg = turnOf(m)
      // the mark unturned about its box's middle (in its own frame): where the plan's middle goes, before sliding
      const flatM = m.flat()
      const mb0 = boxOf(flatM.map((p) => rot(p, -deg)))
      const mid = rot({ x: (mb0.x0 + mb0.x1) / 2, y: (mb0.y0 + mb0.y1) / 2 }, deg)
      // slide: the footprint (turned by deg) over the mark, scored on a 0.25-point grid over the mark's box
      const mb = boxOf(flatM)
      const cells: Pt[] = []
      for (let x = Math.min(mb.x0, mid.x + fb.x0) - 1; x <= Math.max(mb.x1, mid.x + fb.x1) + 1; x += step) for (let y = Math.min(mb.y0, mid.y + fb.y0) - 1; y <= Math.max(mb.y1, mid.y + fb.y1) + 1; y += step) cells.push({ x, y })
      const inMark = cells.map((p) => m.some((q) => inside(p, q)))
      const marked = inMark.filter(Boolean).length || 1
      const score = (dx: number, dy: number) => {
        let both = 0, any = 0
        cells.forEach((p, i) => {
          const local = rot({ x: p.x - mid.x - dx, y: p.y - mid.y - dy }, -deg)
          const f = onFoot(local)
          if (f && inMark[i]) both++
          if (f || inMark[i]) any++
        })
        return { iou: any ? both / any : 0, cover: both / marked }
      }
      let best = { dx: 0, dy: 0, ...score(0, 0) }
      for (const span of [3, 0.75]) {
        const at = best
        for (let dx = -span; dx <= span + 1e-9; dx += span / 4)
          for (let dy = -span; dy <= span + 1e-9; dy += span / 4) {
            const r = score(at.dx + dx, at.dy + dy)
            if (r.iou > best.iou) best = { dx: at.dx + dx, dy: at.dy + dy, ...r }
          }
      }
      // (the key is y up, the picture y down: its turn is clockwise there)
      out.push({ flat, x: (mid.x + best.dx) * s, y: -(mid.y + best.dy) * s, deg: -deg, fit: Math.round(best.iou * 100) / 100 })
    }
  })
  return out
}
