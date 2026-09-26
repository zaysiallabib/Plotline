/** Pure spawn/camera helpers for the viewer (no Three, no DOM) — Vitest-covered. */
import * as core from '../core'
import type { FurniturePlacement, Pt, Room, Unit, Wall } from '../core'
import { heightRange, kitAsset, objectKind, type KitAsset } from '../furnish/kit'
import { footprint, isCommonCore } from '../furnish/presets'
import { EYE, RAY, frameHits, swings } from './frame'

const add = (a: Pt, b: Pt, s: number): Pt => ({ x: a.x + b.x * s, y: a.y + b.y * s })
const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/**
 * PlotlineScene.spawnAt yaw for a plan-space facing direction: 0 = plan −y (world −Z),
 * positive turns left. Camera forward for yaw θ is world (−sin θ, 0, −cos θ) = plan (−sin θ, −cos θ).
 */
export const yawFor = (dir: Pt): number => Math.atan2(-dir.x, -dir.y)

const enterable = (r: Room | null): r is Room => !!r && r.kind !== 'other' && r.kind !== 'shaft'

/**
 * Rooms-list rooms: ones you can walk into (a door or passage on their walls) of at least 2 m²; no shafts, planters or
 * common core (stair, lift, lobby: they stay in 3D). In walk-through order: the entry room (and any foyer), living,
 * dining, kitchen + the veranda it opens onto, each bedroom by name (Bed-1, Bed-2…) followed by the bath/closet it shares
 * a door with (and a bath behind that closet), the other baths (largest first), study/utility, verandas, the rest; by
 * name within a group.
 */
export function listedRooms(unit: Unit, rooms: Room[]): Room[] {
  const walls = new Map(unit.walls.map((w) => [w.id, w]))
  const doorWalls = (r: Room) => r.wallIds.filter((id) => walls.get(id)?.openings.some((o) => o.kind !== 'window'))
  const listed = rooms
    .filter((r) => r.kind !== 'shaft' && !isCommonCore(r) && r.areaSqm >= 2 && doorWalls(r).length)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
  const e = entrySpawn(unit, rooms)
  const entry = e && core.roomAt(e.p, rooms, unit)
  const of = (...kinds: Room['kind'][]) => kinds.flatMap((k) => listed.filter((r) => r.kind === k))
  const opensOnto = (a: Room, kinds: Room['kind'][]) => of(...kinds).filter((b) => doorWalls(a).some((id) => b.wallIds.includes(id)))
  const out = new Set<Room>(listed.filter((r) => r.id === entry?.id || /foyer|entr/i.test(r.name)))
  const take = (rs: Room[]) => rs.forEach((r) => out.add(r))
  take(of('living', 'dining'))
  for (const k of of('kitchen')) take([k, ...opensOnto(k, ['balcony'])])
  for (const b of of('bed')) {
    const suite = [b] // + the bath/closet it opens onto, and a bath reached through that closet (dressing room → toilet)
    for (const r of suite) for (const x of opensOnto(r, r === b || r.kind === 'closet' ? ['bath', 'closet'] : [])) if (!suite.includes(x) && !out.has(x)) suite.push(x)
    take(suite)
  }
  take(of('bath').sort((a, b) => b.areaSqm - a.areaSqm)) // the powder room before the servant's WC
  take(of('study', 'utility'))
  take(of('balcony'))
  take(listed)
  return [...out]
}

/**
 * Entry spawn (PM rule): the FIRST `door` in walls[] order; stand 1.2 m from the door centre on the
 * side whose room is not 'other'/'shaft' (larger room wins when both qualify), facing that room's centre —
 * a long room is seen down its length, not across into the nearest wall — or straight in from the door
 * when the centre is not ahead. A pendant, fan or wall AC spoiling that frame (see `hangs`) turns the view up to 25° (an
 * AC at the frame's edge) and slides the stand point along the view, the smallest shift back or forward past it,
 * staying VIEW_INSET off the walls and clear of furniture.
 * Falls back to the centroid of the largest living room (then any room).
 */
export function entrySpawn(unit: Unit, rooms: Room[]): { p: Pt; face: Pt } | null {
  for (const w of unit.walls) {
    const door = w.openings.find((o) => o.kind === 'door')
    if (!door) continue
    const f = core.wallFrame(w, unit.vertices)
    const at = add(f.origin, f.dir, door.offsetM + door.widthM / 2)
    const off = w.thicknessM / 2 + 0.05
    const front = core.roomAt(add(at, f.normal, off), rooms, unit)
    const back = core.roomAt(add(at, f.normal, -off), rooms, unit)
    let side = 0
    if (enterable(front) && enterable(back)) side = front.areaSqm >= back.areaSqm ? 1 : -1
    else if (enterable(front)) side = 1
    else if (enterable(back)) side = -1
    if (!side) break // first door only; a door between two shafts/lobbies means the unit has no usable entry
    const n = { x: f.normal.x * side, y: f.normal.y * side }
    const p = add(at, n, w.thicknessM / 2 + 1.2)
    const room = (side > 0 ? front : back)!
    const c = room.centroid
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    const toC = { x: (c.x - p.x) / d, y: (c.y - p.y) / d }
    const face = d > 1 && toC.x * n.x + toC.y * n.y > 0 ? toC : n
    const inner = core.roomInnerPolygon(room, unit)
    const standable = (q: Pt) =>
      core.pointInPolygon(q, inner) &&
      inner.every((a, j) => segDist(q, a, inner[(j + 1) % inner.length]) >= VIEW_INSET) &&
      unit.furniture.every((pl) => {
        const k = pl.roomId === room.id && kitAsset(pl.assetId)
        return !k || k.mount === 'ceiling' || k.category === 'rug' || footprintDist(q, pl, k.sizeM) >= 0.3
      })
    const turn = (deg: number): Pt => {
      const r = (deg * Math.PI) / 180
      return { x: face.x * Math.cos(r) - face.y * Math.sin(r), y: face.x * Math.sin(r) + face.y * Math.cos(r) }
    }
    for (let s = 0; s < 12; s += 0.1)
      for (const q of s ? [add(p, face, -s), add(p, face, s)] : [p])
        for (let a = 0; a <= 25; a += 5)
          for (const t of a ? [turn(a), turn(-a)] : [face]) if ((!s || standable(q)) && !hangs(unit, q, t)) return { p: q, face: t }
    return { p, face }
  }
  const living = rooms.filter((r) => r.kind === 'living').sort((a, b) => b.areaSqm - a.areaSqm)[0] ?? rooms[0]
  return living ? { p: living.centroid, face: { x: 0, y: -1 } } : null
}

/** Distance from the room to spawn away from the two walls meeting at the chosen corner. */
export const VIEW_INSET = 0.4
/** Minimum distance from a stand point to a door/passage (a door needs max(this, widthM + 0.3) from its whole span). */
export const DOOR_CLEAR = 1.2
/** A kitchen's run faces its door wall across a narrow galley, a veranda is 2 m deep: there a stand point only keeps this far from a swinging door (out of the doorway and the leaf, ajar 20°, ≤ 0.26 m in); a slider or passage just VIEW_INSET, like a wall. */
export const GALLEY_DOOR_CLEAR = 0.6
const GALLEY_DEPTH = 2.5
/** Anything reaching above 1.2 m (wall cabinets, wardrobe, TV) stays this far from the eye; glass only must not enclose it. */
const EYE_CLEAR = 0.5
const GLASS = new Set(['shower_screen'])
/** The piece the first view frames, by room kind; other rooms (and rooms without it) face the furniture centroid. */
const HERO: Partial<Record<Room['kind'], RegExp>> = { bed: /^bed_/, bath: /^(vanity|basin)$/, kitchen: /^kitchen_sink$/, dining: /^dining_table$/ }
/** No hero and empty or smaller than this (closet, help room, lobby, small veranda): look along the longest clear sightline. */
const SIGHT_MAX_SQM = 8
/** A wardrobe/shelf/tall (> 1.6 m) piece this close to the stand point fills the first view with a slab… */
const SLAB_NEAR = 1.5
const isSlab = (id: string, k: KitAsset) => !GLASS.has(id) && k.mount !== 'ceiling' && (k.category === 'wardrobe' || k.category === 'shelf' || k.sizeM.y > 1.6)
/** …so that candidate loses this much of its distance-to-target score. */
const SLAB_PENALTY = 1.5
/** A ceiling piece reaching more than this below the ceiling (a pendant; not a fan, flush light or wall AC) hangs at head height. */
const HANG_DROP = 0.6
/** A stand point keeps a hanging piece this far away (plan)… */
export const HANG_CLEAR = 1.5
/** …and this far when it is in the frame (within ~53° of the view): 2 m ahead, a pendant fills the top third. */
export const HANG_IN_VIEW = 3
/** A wall AC closer than this (plan) looms over the stand point… */
export const AC_NEAR = 1
/** …and closer than this in the frame it looms in a top corner (its top is 1 m above the eye; the A/C entry AC sat at 2.21 m). */
export const AC_IN_VIEW = 2.5
/** A ceiling fan (~0.5 m drop, under HANG_DROP) keeps this far away… */
export const FAN_CLEAR = 1.5
/** …and this far in the frame: nearer, its 1.46 m blades fill the top of the view. */
export const FAN_IN_VIEW = 2.5
/** A wardrobe/shelf/tall piece with any corner in the frame (±FRAME_DEG) this close fills a third of it: the spot is out (like a pendant). */
export const TALL_IN_VIEW = 1
/** A bath is framed from a spot this far from its vanity/basin, else from its door. */
export const BATH_BACK = 1.5
/** …with its back to a wall (in a 1.5 m bath VIEW_INSET leaves a 0.7 m band). */
const BATH_INSET = 0.3
/** A spot with a pendant in its frame (or an AC over it) loses to every spot without (only when all have one does the best win). */
const HANG_PENALTY = 100
/** An enclosed room whose best spot 0.4 m off the walls sees less than this (help bed, WC, store) is framed from its door. */
const TINY_SIGHT = 2.2
/** Bath and tiny-room views stand this far inside the door (first that fits), clear of its leaf (ajar 20°, ≤ 0.26 m in). */
const DOOR_STEP = [0.5, 0.6, 0.4]
/** A piece this far off the view axis is in frame with margin (the horizontal half-FOV is ~48° at 16:9). */
const FRAME_DEG = 40
const inFrame = (p: Pt, face: Pt, q: Pt) => (q.x - p.x) * face.x + (q.y - p.y) * face.y > Math.cos((FRAME_DEG * Math.PI) / 180) * Math.hypot(q.x - p.x, q.y - p.y)
/** Door views look down 20°: 1 m ahead the frame then reaches down to 0.3 m, so the vanity, WC or cot of a small room shows. */
export const DOOR_PITCH = (-20 * Math.PI) / 180
/** A bath framed from inside looks down 10°: 1.5 m off, the vanity top and the WC bowl are in the frame. */
export const BATH_PITCH = (-10 * Math.PI) / 180
/** Half the vertical field of view of PlotlineScene's camera (65°). */
const HALF_VFOV = (32.5 * Math.PI) / 180
/**
 * A door leaf (ajar 20°) or a slab (wardrobe, shelf or other tall piece — not a kitchen's run, not a closet's own rails)
 * filling more than this share of a first frame (frameShares) hides the room: the frame is out. Measured on the wave-9
 * frames: B Bath-3's leaf 31 %, B K. veranda's two leaves 28 + 13 %, B Bed-2's wardrobe 24 %, C Bed-1's 16 %.
 */
export const FLAT_MAX = 0.15
/**
 * Plaster within NEAR_WALL (m) of the eye filling more than this share of a first frame is a close-up of a wall: the frame
 * is out like a leaf's (wave-9 A H. toilet 44 %; the a/c Bath-2 frames the director liked 15 %).
 */
export const NEAR_WALL_MAX = 0.2
export const NEAR_WALL = 1.2
/** frameHits costs ~1 ms: this many best-ranked frames are tried before the least filled of them is taken. */
const FLAT_TRIES = 150
/** A help room is seen lengthwise from its cot's foot, looking down no more than this. */
export const HELP_PITCH = (-15 * Math.PI) / 180
/**
 * A fitting shows in a wet room's frame within this (°) of the view: basin and WC facing each other across a 1.8 m powder
 * room are 74° apart from its door — aimed between them, both sit on the frame's edges round a blank wall.
 */
export const SHOW_DEG = 30
/** …and its part at counter height (m; its top if lower) above the frame's bottom tenth: a vanity's mirror in frame over a basin under it is no view of the basin. */
export const SHOW_H = 0.85
/** A closet's stand point keeps this far from its rails (EYE_CLEAR would leave no aisle). */
const RAIL_CLEAR = 0.3
/** A general room's best spot may turn this far (°) off its target to clear its frame before the next spot is tried. */
const TURN_MAX = 20
type View = { p: Pt; face: Pt; pitch?: number }

/**
 * Something spoils the frame from p looking along face — a piece of ANY room in sight (`inSight`), by plan distance to
 * its centre: a pendant (a ceiling piece hanging more than HANG_DROP) within HANG_CLEAR, or within HANG_IN_VIEW and in
 * the frame (within ~53° of the view); a fan within FAN_CLEAR / FAN_IN_VIEW; a wall AC within AC_NEAR / AC_IN_VIEW;
 * a slab (wardrobe, shelf, tall piece) whose footprint is within TALL_IN_VIEW with a corner within ±FRAME_DEG.
 */
const hangs = (unit: Unit, p: Pt, face: Pt): boolean =>
  unit.furniture.some((f) => {
    const k = kitAsset(f.assetId)
    if (!k) return false
    const d = Math.hypot(f.x - p.x, f.y - p.y)
    const ahead = (f.x - p.x) * face.x + (f.y - p.y) * face.y
    if (isSlab(f.assetId, k))
      return footprintDist(p, f, k.sizeM) < TALL_IN_VIEW && [f, ...footprint(f, f.rotationDeg, k.sizeM)].some((q) => inFrame(p, face, q)) && inSight(unit, p, f)
    const kind = objectKind(k)
    const [near, inView] =
      kind === 'ac' ? [AC_NEAR, AC_IN_VIEW]
      : kind === 'ceiling-fan' ? [FAN_CLEAR, FAN_IN_VIEW]
      : k.mount === 'ceiling' && k.mountY === undefined && k.sizeM.y > HANG_DROP ? [HANG_CLEAR, HANG_IN_VIEW]
      : [0, 0]
    return (d < near || (d < inView && ahead > 0.6 * d)) && inSight(unit, p, f)
  })

/** Nothing at eye height between p and q: p→q crosses full-height walls only through a passage, window or slider (rails and curbs are lower). */
export const inSight = (unit: Unit, p: Pt, q: Pt): boolean =>
  unit.walls.every((w) => {
    if (w.heightM < EYE) return true
    const { origin: o, dir: d, lengthM } = core.wallFrame(w, unit.vertices)
    const r = { x: q.x - p.x, y: q.y - p.y }
    const den = r.x * d.y - r.y * d.x
    if (Math.abs(den) < 1e-9) return true
    const t = ((o.x - p.x) * d.y - (o.y - p.y) * d.x) / den // along p→q
    const u = ((o.x - p.x) * r.y - (o.y - p.y) * r.x) / den // along the wall
    return t < 0 || t > 1 || u < 0 || u > lengthM || w.openings.some((x) => !swings(x) && u >= x.offsetM && u <= x.offsetM + x.widthM)
  })

/** Distance from p to a placement's plan footprint (0 inside). rotationDeg is clockwise in y-down plan space. */
export const footprintDist = (p: Pt, f: FurniturePlacement, size: { x: number; z: number }): number => {
  const r = (f.rotationDeg * Math.PI) / 180
  const s = f.scale ?? 1
  const dx = p.x - f.x
  const dy = p.y - f.y
  const u = Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) - (size.x * s) / 2
  const v = Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) - (size.z * s) / 2
  return Math.hypot(Math.max(u, 0), Math.max(v, 0))
}

const look = (p: Pt, target: Pt): { p: Pt; face: Pt } => {
  const d = Math.hypot(target.x - p.x, target.y - p.y) || 1
  return { p, face: { x: (target.x - p.x) / d, y: (target.y - p.y) / d } }
}

/**
 * Rooms-list jump. Candidates: every convex inner corner (VIEW_INSET from both walls), then every wall
 * midpoint (VIEW_INSET in). A candidate is out when it is outside the inner polygon, crowded by a third
 * edge, within EYE_CLEAR of anything reaching above 1.2 m (wall cabinets, wardrobe, TV), or near a door:
 * a door's whole span must be max(DOOR_CLEAR, widthM + 0.3) away — that covers its centre, its hinge
 * and the leaf's swing arc (radius widthM around the hinge); a passage or a sliding door (no swinging leaf,
 * may be a whole glazed wall) only needs its centre DOOR_CLEAR away. Target = the room's HERO piece, else the furniture centroid
 * (fallback: the longest wall's midpoint). Best = farthest from the target — for a hero, farthest in FRONT of it
 * (a bed from its foot, a kitchen run from across the room; a table has no front) — minus SLAB_PENALTY when a wardrobe/shelf/tall
 * piece of any room in sight is within SLAB_NEAR, plus SLAB_NEAR − its distance when it is in the frame (a corner within ±FRAME_DEG),
 * minus HANG_PENALTY when a pendant, fan, AC or slab spoils the frame (`hangs`) — and the best whose frame no door leaf or
 * slab fills beyond FLAT_MAX nor near plaster beyond NEAR_WALL_MAX (`clear`; the spot may turn TURN_MAX for it).
 * A room with no hero that is empty or under SIGHT_MAX_SQM, and every balcony, has no target: each stand point faces the farthest
 * inner corner it can see (a balcony: its rail, slider or a corner of two open walls) and scores that sightline (a narrow lobby or a closet facing its near wall is a wall of plaster).
 * A walk-in closet looks along its rails (`alongRails`: the middle of their far halves, from the farthest spot — an end of
 * its aisle), RAIL_CLEAR off them and GALLEY_DOOR_CLEAR off a door (its leaves are measured in the frame instead).
 * Baths, help rooms (a cot) and tiny rooms (TINY_SIGHT) skip all that: a vanity/basin is framed from BATH_BACK inside the
 * room, else from the spot (the doorway or inside) where it shows at eye height; a cot lengthwise from its foot; else
 * they are seen from just inside a door (see below).
 * Nothing qualifies: 0.9 m in from the first door/passage on its centreline. Always faces the target.
 */
export function roomView(room: Room, unit: Unit): { p: Pt; face: Pt; pitch?: number } {
  const inner = core.roomInnerPolygon(room, unit)
  const n = inner.length
  // ceiling lights and ACs are overhead: they neither frame the view nor block a stand point
  const items = unit.furniture.filter((f) => f.roomId === room.id && kitAsset(f.assetId)?.mount !== 'ceiling')
  let target: Pt
  // a cot (help room) is the hero wherever it stands
  const hero = items.find((f) => f.assetId.startsWith('cot')) ?? (HERO[room.kind] && items.find((f) => HERO[room.kind]!.test(f.assetId)))
  const cot = !!hero && hero.assetId.startsWith('cot') // cot, cot_s (a help room under 1.9 m)
  const closet = room.kind === 'closet' && items.length > 0
  // presets.ts convention: rotation θ (clockwise, y-down) faces (−sin θ, cos θ)
  const front = hero && room.kind !== 'dining' && { x: -Math.sin((hero.rotationDeg * Math.PI) / 180), y: Math.cos((hero.rotationDeg * Math.PI) / 180) }
  if (hero) target = hero
  else if (items.length) {
    target = { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length }
  } else {
    let best = { len: -1, mid: room.centroid }
    inner.forEach((a, i) => {
      const b = inner[(i + 1) % n]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len > best.len) best = { len, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
    })
    target = best.mid
  }

  const doors = room.wallIds.flatMap((id) => {
    const w = unit.walls.find((x) => x.id === id)
    if (!w) return []
    const f = core.wallFrame(w, unit.vertices)
    return w.openings
      .filter((o) => o.kind !== 'window')
      .map((o) => ({ o, w, f, a: add(f.origin, f.dir, o.offsetM), b: add(f.origin, f.dir, o.offsetM + o.widthM), c: add(f.origin, f.dir, o.offsetM + o.widthM / 2) }))
  })
  // a galley: less than GALLEY_DEPTH of floor in front of its sink (A/C 2.0 m; B's 3.2 m keeps the full door zone and its diagonal)
  let ahead = 0
  if (front && room.kind === 'kitchen') while (ahead < GALLEY_DEPTH && core.pointInPolygon(add(target, front, ahead + 0.05), inner)) ahead += 0.05
  const tight = room.kind === 'balcony' || closet || (room.kind === 'kitchen' && ahead < GALLEY_DEPTH)
  const clearOfDoors = (p: Pt) =>
    doors.every(({ o, a, b, c }) =>
      tight ? !swings(o) || segDist(p, a, b) >= GALLEY_DOOR_CLEAR
      : swings(o) ? segDist(p, a, b) >= Math.max(DOOR_CLEAR, o.widthM + 0.3)
      : Math.hypot(p.x - c.x, p.y - c.y) >= DOOR_CLEAR,
    )
  const pieces = items.flatMap((f) => {
    const k = kitAsset(f.assetId)
    return k ? [{ f, k, top: heightRange(k)[1] }] : []
  })

  // what may not fill a frame beyond FLAT_MAX: every ajar leaf, every slab but a kitchen's run and this closet's rails;
  // nor near plaster beyond NEAR_WALL_MAX (together: fill ≤ 1)
  const flatIds = new Set([
    ...unit.walls.flatMap((w) => w.openings.filter(swings).map((o) => o.id)),
    ...unit.furniture
      .filter((f) => {
        const k = kitAsset(f.assetId)
        return !!k && isSlab(f.assetId, k) && k.category !== 'kitchen' && !(closet && f.roomId === room.id)
      })
      .map((f) => f.id),
  ])
  const wallIds = new Set(unit.walls.map((w) => w.id))
  const fill = new Map<View, number>()
  const flat = (v: View) => {
    if (!fill.has(v)) {
      const leaves = new Map<string, number>()
      let wall = 0
      for (const { id, t } of frameHits(unit, v.p, v.face, v.pitch)) {
        if (flatIds.has(id)) leaves.set(id, (leaves.get(id) ?? 0) + RAY)
        else if (t <= NEAR_WALL && wallIds.has(id)) wall += RAY
      }
      fill.set(v, Math.max(Math.max(0, ...leaves.values()) / FLAT_MAX, wall / NEAR_WALL_MAX))
    }
    return fill.get(v)!
  }
  // ponytail: the first FLAT_TRIES frames only (~0.3 s worst case); rank smarter if a room needs more
  /** The best-ranked view that no leaf or slab fills beyond FLAT_MAX, nor near plaster beyond NEAR_WALL_MAX. */
  const clear = <V extends View>(ranked: V[]) => ranked.slice(0, FLAT_TRIES).find((v) => flat(v) <= 1)
  /** …else the least filled frame tried (the first of equals). */
  const leastFilled = () => [...fill].reduce<[View, number] | undefined>((m, e) => (!m || e[1] < m[1] ? e : m), undefined)?.[0]

  // inward normal of edge a→b (loops are positive: n = (−d.y, d.x))
  const inward = (a: Pt, b: Pt): Pt => {
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
  }
  const candidates: Pt[] = []
  inner.forEach((v, i) => {
    const n1 = inward(inner[(i - 1 + n) % n], v)
    const n2 = inward(v, inner[(i + 1) % n])
    // convex corners turning > 20° only: a straight-through or reflex vertex is no corner to stand in.
    // (n1 + n2) / (1 + n1·n2) is exactly VIEW_INSET from both walls at any angle.
    if (n1.x * n2.y - n1.y * n2.x > 0.34) candidates.push(add(v, { x: n1.x + n2.x, y: n1.y + n2.y }, VIEW_INSET / (1 + n1.x * n2.x + n1.y * n2.y)))
  })
  inner.forEach((a, i) => {
    const b = inner[(i + 1) % n]
    candidates.push(add({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, inward(a, b), VIEW_INSET))
  })
  const xs = inner.map((q) => q.x)
  const ys = inner.map((q) => q.y)
  /** 0.25 m grid points `inset` in from the room's bounding box. */
  const grid = (inset: number) => {
    const out: Pt[] = []
    for (let x = Math.min(...xs) + inset; x <= Math.max(...xs) - inset; x += 0.25) for (let y = Math.min(...ys) + inset; y <= Math.max(...ys) - inset; y += 0.25) out.push({ x, y })
    return out
  }
  /** The side of a door's wall this room is on. */
  const inSide = ({ w, f, c }: (typeof doors)[number]) => (core.pointInPolygon(add(c, f.normal, w.thicknessM / 2 + 0.1), inner) ? 1 : -1)

  const sight = room.kind === 'balcony' || (!hero && !closet && (!items.length || room.areaSqm < SIGHT_MAX_SQM))
  // a closet looks along its rails, not into them: at the middle of each piece's far half (as at a cot's), their mean;
  // the farthest spot from that is an end of the aisle
  const alongRails = (p: Pt): Pt => {
    const qs = items.map((f) => {
      const ax = { x: Math.cos((f.rotationDeg * Math.PI) / 180), y: Math.sin((f.rotationDeg * Math.PI) / 180) }
      return add(f, ax, ((f.x - p.x) * ax.x + (f.y - p.y) * ax.y >= 0 ? 1 : -1) * (kitAsset(f.assetId)!.sizeM.x / 4))
    })
    return { x: qs.reduce((s, q) => s + q.x, 0) / qs.length, y: qs.reduce((s, q) => s + q.y, 0) / qs.length }
  }
  // p→q stays inside the room, checked every 5 cm (an L-shaped room's far corner may be round the bend)
  const visible = (p: Pt, q: Pt) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y)
    for (let s = 0.05; s < L - 0.05; s += 0.05) if (!core.pointInPolygon(add(p, { x: q.x - p.x, y: q.y - p.y }, s / L), inner)) return false
    return true
  }
  // a sightline ends on an inner corner; a balcony's on its rail/curb (a wall below the eye: the street) or its slider /
  // passage (back into the flat), on the inner face — never a blank corner, a hinged door (ajar 20°) or a window (a
  // neighbour room's)
  const wallOf = (id: string) => unit.walls.find((x) => x.id === id)!
  const open = (w: Wall) => w.heightM < EYE || w.openings.some((o) => !swings(o))
  const ends =
    room.kind !== 'balcony'
      ? inner
      : [
          // …or a corner where two open walls meet (the slider and the rail: the flat and the street in one frame)
          ...inner.filter((_, i) => open(wallOf(room.wallIds[(i - 1 + n) % n])) && open(wallOf(room.wallIds[i]))),
          ...room.wallIds.flatMap((id) => {
            const w = wallOf(id)
            const f = core.wallFrame(w, unit.vertices)
            const s = core.pointInPolygon(add(add(f.origin, f.dir, f.lengthM / 2), f.normal, w.thicknessM / 2 + 0.05), inner) ? 1 : -1
            const on = (u: number) => add(add(f.origin, f.dir, u), f.normal, s * (w.thicknessM / 2 + 0.02))
            return [...(w.heightM < EYE ? [on(f.lengthM / 2)] : []), ...w.openings.filter((o) => o.kind !== 'window' && !swings(o)).map((o) => on(o.offsetM + o.widthM / 2))]
          }),
        ]
  const farthest = (p: Pt): Pt =>
    ends.reduce((a, v) => (visible(p, v) && Math.hypot(v.x - p.x, v.y - p.y) > Math.hypot(a.x - p.x, a.y - p.y) ? v : a), target)
  // eye (1.6 m) in or against a cabinet/wardrobe/TV
  const eyeBlocked = (p: Pt, clear = EYE_CLEAR) => pieces.some(({ f, k, top }) => top > 1.2 && footprintDist(p, f, k.sizeM) < (GLASS.has(f.assetId) ? 0.15 : clear))
  const seen = (p: Pt) => {
    const q = farthest(p)
    return Math.hypot(q.x - p.x, q.y - p.y)
  }

  // A bath, a help room (its cot is the hero) or an enclosed room too small to frame from inside (no spot VIEW_INSET off
  // the walls sees TINY_SIGHT).
  if (room.kind === 'bath' || cot || (room.kind !== 'balcony' && Math.max(...candidates.filter((p) => core.pointInPolygon(p, inner)).map(seen)) < TINY_SIGHT)) {
    // spots: corners, wall midpoints, a 0.25 m grid and 0.4–0.6 m inside each door, BATH_INSET off the walls, clear of the
    // pieces and of a swinging door's leaf (ajar 20°, ≤ 0.26 m in)
    const spots = [...candidates, ...grid(BATH_INSET), ...doors.flatMap((d) => DOOR_STEP.map((m) => add(d.c, d.f.normal, inSide(d) * (d.w.thicknessM / 2 + m))))].filter(
      (p) =>
        core.pointInPolygon(p, inner) &&
        inner.every((a, j) => segDist(p, a, inner[(j + 1) % n]) >= BATH_INSET - 0.02) &&
        pieces.every(({ f, k }) => footprintDist(p, f, k.sizeM) >= 0.2) &&
        doors.every(({ o, a, b }) => !swings(o) || segDist(p, a, b) >= DOOR_STEP[2]),
    )
    const dir = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) })
    // A bath (or tiny room) with a vanity/basin is framed from inside (the wave-7 Bath-3 frame), at BATH_PITCH: the spot
    // BATH_BACK or more from the hero that frames the most fittings (hero included, each ≥ 1 m off so it is in the frame),
    // farthest from the hero, the fittings centred. No such spot, or none whose frame is clear (an ajar leaf by the
    // vanity): the spot — the doorway or inside — that shows the hero, then the most fittings (`shows`: within SHOW_DEG of
    // the view and its counter above the frame's bottom tenth — at BATH_PITCH 1 m off or more), the nearest of them farthest off,
    // the fittings centred: aimed between basin and toilet when both show. Nothing shows from anywhere (a 1.5 m WC), or no
    // such frame is clear: the door view below.
    if (hero && !cot) {
      // the tangent of the steepest look down to a counter above the frame's bottom tenth (37° at BATH_PITCH)
      const tanFoot = Math.tan(Math.atan(0.8 * Math.tan(HALF_VFOV)) - BATH_PITCH)
      const shows = (p: Pt, face: Pt, f: FurniturePlacement) => {
        const h1 = heightRange(kitAsset(f.assetId)!)[1]
        const fwd = (f.x - p.x) * face.x + (f.y - p.y) * face.y
        return fwd > Math.cos((SHOW_DEG * Math.PI) / 180) * Math.hypot(f.x - p.x, f.y - p.y) && EYE - Math.min(h1, SHOW_H) <= fwd * tanFoot
      }
      type Pick = View & { hero: number; count: number; back: number; spread: number }
      const far: Pick[] = []
      const near: Pick[] = []
      for (const p of spots) {
        const back = Math.hypot(hero.x - p.x, hero.y - p.y)
        for (let deg = 0; deg < 360; deg += 5) {
          const face = dir(deg)
          const off = (f: Pt) => Math.abs(Math.atan2((f.x - p.x) * face.y - (f.y - p.y) * face.x, (f.x - p.x) * face.x + (f.y - p.y) * face.y))
          const framed = (min: number) => items.filter((f) => Math.hypot(f.x - p.x, f.y - p.y) >= min && inFrame(p, face, f))
          const f1 = framed(1)
          if (back >= BATH_BACK && f1.includes(hero)) far.push({ p, face, pitch: BATH_PITCH, hero: 1, count: f1.length, back, spread: Math.max(...f1.map(off)) })
          const f2 = items.filter((f) => shows(p, face, f))
          if (f2.length) near.push({ p, face, pitch: BATH_PITCH, hero: +f2.includes(hero), count: f2.length, back: Math.min(...f2.map((f) => Math.hypot(f.x - p.x, f.y - p.y))), spread: Math.max(...f2.map(off)) })
        }
      }
      const rank = (a: Pick, b: Pick) => b.hero - a.hero || b.count - a.count || b.back - a.back || a.spread - b.spread
      far.sort(rank)
      near.sort(rank)
      const pick = clear(far) ?? clear(near)
      if (pick) return { p: pick.p, face: pick.face, pitch: BATH_PITCH }
    }
    // A cot lengthwise from its foot (presets: its length is local x, the pillow at −x): a spot past the line of its foot
    // end, the one looking most nearly along the cot, tilted to put what it aims at in the lower third but never more than
    // HELP_PITCH down; a clear frame first. A cot filling its room's length (A/C: 1.7 m in 1.8 m, a leaf swinging into each
    // end of the aisle beside it) has no such spot: the door view below, looking down at it (from the foot-end door at
    // HELP_PITCH the far leaf fills 29 % and the cot drops out of the frame).
    if (cot) {
      const k = kitAsset(hero.assetId)!
      const t = (hero.rotationDeg * Math.PI) / 180
      const axis = { x: Math.cos(t), y: Math.sin(t) }
      const [y0, y1] = heightRange(k)
      // aimed at the middle of its far (pillow) half: at HELP_PITCH, 1–1.5 m off, the near half is under the frame
      const aim = add(hero, axis, -k.sizeM.x / 4)
      const ends = spots
        .map((p) => {
          const along = (p.x - hero.x) * axis.x + (p.y - hero.y) * axis.y
          const side = Math.abs((p.x - hero.x) * axis.y - (p.y - hero.y) * axis.x)
          const d = Math.hypot(aim.x - p.x, aim.y - p.y)
          return { p, face: { x: (aim.x - p.x) / d, y: (aim.y - p.y) / d }, pitch: Math.max(HELP_PITCH, Math.atan2((y0 + y1) / 2 - EYE, d) + Math.atan((2 / 3) * Math.tan(HALF_VFOV))), along, off: Math.atan2(side, along) }
        })
        .filter((v) => v.along >= k.sizeM.x / 2)
        .sort((a, b) => a.off - b.off || b.along - a.along)
      const pick = clear(ends) ?? leastFilled()
      if (pick) return { p: pick.p, face: pick.face, pitch: pick.pitch }
    }
    // From just inside a door (DOOR_STEP; from outside, the leaf ajar 20° hides the room), the door whose spot sees
    // farthest, looking down DOOR_PITCH (at a cot: to put it in the lower third). It looks in (≤ 70°
    // off the door's normal, never along the door wall; 5° steps): the hero in frame (±FRAME_DEG) first, then the most
    // other pieces in frame, then the deepest sightline.
    let door = null as { p: Pt; n: Pt; d: number } | null
    for (const d of doors) {
      const s = inSide(d)
      const p = DOOR_STEP.map((m) => add(d.c, d.f.normal, s * (d.w.thicknessM / 2 + m))).find((q) => core.pointInPolygon(q, inner) && !eyeBlocked(q, 0.3))
      if (p && (!door || seen(p) > door.d)) door = { p, n: { x: d.f.normal.x * s, y: d.f.normal.y * s }, d: seen(p) }
    }
    if (door) {
      const { p, n: dn } = door
      const cos = Math.cos((FRAME_DEG * Math.PI) / 180)
      let pick = { score: -1, face: dn }
      for (let a = -70; a <= 70; a += 5) {
        const r = (a * Math.PI) / 180
        const face = { x: dn.x * Math.cos(r) - dn.y * Math.sin(r), y: dn.x * Math.sin(r) + dn.y * Math.cos(r) }
        const framed = (q: Pt) => (q.x - p.x) * face.x + (q.y - p.y) * face.y > cos * Math.hypot(q.x - p.x, q.y - p.y)
        let depth = 0
        while (depth < 20 && core.pointInPolygon(add(p, face, depth + 0.05), inner)) depth += 0.05
        const score = (hero && framed(hero) ? 1000 : 0) + items.filter((f) => f !== hero && framed(f)).length * 100 + depth
        if (score > pick.score) pick = { score, face }
      }
      if (!hero || !cot) return { p, face: pick.face, pitch: DOOR_PITCH }
      // a cot: its centre in the middle of the frame's lower third, from its depth along the view and the eye height
      const [y0, y1] = heightRange(kitAsset(hero.assetId)!)
      const depth = (hero.x - p.x) * pick.face.x + (hero.y - p.y) * pick.face.y
      return { p, face: pick.face, pitch: Math.atan2((y0 + y1) / 2 - EYE, depth) + Math.atan((2 / 3) * Math.tan(HALF_VFOV)) }
    }
  }

  const views: (View & { score: number })[] = []
  const consider = (p: Pt) => {
    if (!core.pointInPolygon(p, inner)) return
    if (inner.some((a, j) => segDist(p, a, inner[(j + 1) % n]) < VIEW_INSET - 0.02)) return // a third edge (wall-thickness step) crowds it
    if (!clearOfDoors(p)) return
    if (eyeBlocked(p, closet ? RAIL_CLEAR : EYE_CLEAR)) return
    // not on the hero (the bed, once the frame test has turned the far spots down)
    if (hero && footprintDist(p, hero, kitAsset(hero.assetId)!.sizeM) < 0.2) return
    // a veranda's corners are where its plant and chair stand: not in them (the chair back would fill the foot of the frame)
    if (room.kind === 'balcony' && pieces.some(({ f, k }) => k.category !== 'rug' && footprintDist(p, f, k.sizeM) < 0.3)) return
    const t = sight ? farthest(p) : closet ? alongRails(p) : target
    const d = Math.hypot(t.x - p.x, t.y - p.y)
    if (d < 0.2) return // target sits here: faces nothing useful
    const face = { x: (t.x - p.x) / d, y: (t.y - p.y) / d }
    let slab = 0
    for (const f of unit.furniture) {
      const k = kitAsset(f.assetId)
      const g = k && isSlab(f.assetId, k) && !(closet && f.roomId === room.id) ? footprintDist(p, f, k.sizeM) : SLAB_NEAR // a closet's rails are what it shows
      if (g < SLAB_NEAR && inSight(unit, p, f))
        slab = Math.max(slab, SLAB_PENALTY + ([f, ...footprint(f, f.rotationDeg, k!.sizeM)].some((q) => inFrame(p, face, q)) ? SLAB_NEAR - g : 0))
    }
    const hang = hangs(unit, p, face)
    const score = (front ? (p.x - t.x) * front.x + (p.y - t.y) * front.y : d) - slab - (hang ? HANG_PENALTY : 0)
    // …and the same spot turned up to TURN_MAX (5° steps, the target stays in frame) when a leaf or slab fills that frame:
    // ranked right after it, so it never beats a clear frame of its own spot
    for (let a = 0; a <= TURN_MAX; a += 5)
      for (const s of a ? [1, -1] : [0]) {
        const r = (s * a * Math.PI) / 180
        const turned = { x: face.x * Math.cos(r) - face.y * Math.sin(r), y: face.x * Math.sin(r) + face.y * Math.cos(r) }
        views.push({ p, face: turned, score: score - (a && !hang && hangs(unit, p, turned) ? HANG_PENALTY : 0) })
      }
  }
  candidates.forEach(consider)
  // a hero (or a closet's rails) wants the best spot in front of it, not just a corner or wall midpoint (a door or wardrobe
  // often takes those); a small room whose door clearance eats every corner and midpoint (Bath-1) needs one at all
  if (!views.length || hero || closet) grid(VIEW_INSET).forEach(consider)
  views.sort((a, b) => b.score - a.score) // stable: the first of equals, as before
  const best = clear(views) ?? leastFilled()
  if (best) return { p: best.p, face: best.face }

  for (const { w, f, c } of doors) {
    for (const s of [1, -1]) {
      const p = add(c, f.normal, s * (w.thicknessM / 2 + 0.9))
      if (core.pointInPolygon(p, inner)) return look(p, sight ? farthest(p) : target)
    }
  }
  return look(room.centroid, target)
}
