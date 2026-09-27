/** Pure spawn/camera helpers for the viewer (no Three, no DOM) — Vitest-covered. */
import * as core from '../core'
import type { FurniturePlacement, Pt, Room, Unit, Wall } from '../core'
import { heightRange, kitAsset, objectKind, placementSize, type KitAsset } from '../furnish/kit'
import { footprint, isCommonCore } from '../furnish/presets'
import { EYE, RAY, boxInFrame, frameHits, project, swings } from './frame'

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

/** A side of the entry door to walk into: not a shaft, lobby or other common space — but a foyer (Sheltech labels it 'other'). */
const enterable = (r: Room | null): r is Room => !!r && r.kind !== 'shaft' && (r.kind !== 'other' || /foyer|entr/i.test(r.name))

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
    // a foyer looks on into the flat through its widest opening (Sheltech: the living room, off to the side)
    const into = room.kind === 'other' ? through(room, unit, rooms) : null
    const c = into ?? room.centroid
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    const toC = { x: (c.x - p.x) / d, y: (c.y - p.y) / d }
    const face = d > 1 && (into || toC.x * n.x + toC.y * n.y > 0) ? toC : n
    const inner = core.roomInnerPolygon(room, unit)
    const standable = (q: Pt) =>
      core.pointInPolygon(q, inner) &&
      inner.every((a, j) => segDist(q, a, inner[(j + 1) % inner.length]) >= VIEW_INSET) &&
      unit.furniture.every((pl) => {
        const k = pl.roomId === room.id && kitAsset(pl.assetId)
        return !k || k.mount === 'ceiling' || k.category === 'rug' || footprintDist(q, pl) >= 0.3
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

/**
 * Where an empty foyer or passage looks: through its widest opening that has no leaf (a passage or slider) at the room
 * beyond — its hero piece, else its furniture's centroid, else its centre. Null: no such opening.
 */
function through(room: Room, unit: Unit, rooms: Room[]): Pt | null {
  let best: { w: number; r: Room } | null = null
  for (const id of room.wallIds) {
    const w = unit.walls.find((x) => x.id === id)!
    const f = core.wallFrame(w, unit.vertices)
    for (const o of w.openings) {
      if (o.kind === 'window' || swings(o) || (best && o.widthM <= best.w)) continue
      const c = add(f.origin, f.dir, o.offsetM + o.widthM / 2)
      for (const s of [1, -1]) {
        const r = core.roomAt(add(c, f.normal, s * (w.thicknessM / 2 + 0.1)), rooms, unit)
        if (r && r.id !== room.id) best = { w: o.widthM, r }
      }
    }
  }
  if (!best) return null
  const r = best.r
  const items = unit.furniture.filter((f) => f.roomId === r.id && kitAsset(f.assetId)?.mount !== 'ceiling')
  const hero = HERO[r.kind] && items.find((f) => HERO[r.kind]!.test(f.assetId))
  if (hero) return hero
  return items.length ? { x: items.reduce((t, f) => t + f.x, 0) / items.length, y: items.reduce((t, f) => t + f.y, 0) / items.length } : r.centroid
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
const isSlab = (f: FurniturePlacement, k: KitAsset) => !GLASS.has(f.assetId) && k.mount !== 'ceiling' && (k.category === 'wardrobe' || k.category === 'shelf' || placementSize(f).y > 1.6)
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
/** A bath's stand points keep this far off its walls (in a 1.5 m bath VIEW_INSET leaves a 0.7 m band). */
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
 * A door leaf (ajar 20°) or a slab (wardrobe, shelf or other tall piece — not a kitchen's run)
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
/** A fitting's band tops out here (m; a shower screen's glass and a mirror run on to ~2 m, above a 10°-down frame 1 m off). */
export const WET_TOP = 1.9
/**
 * Where a fitting's band starts (m): a vanity at its counter (the cabinet under the basin may leave the frame), a WC at its
 * bowl's rim, a pedestal basin under its bowl, a shower's glass above its tray. At 1.6 m eye height and 65° FOV nothing
 * lower shows from 1–1.5 m off at 10° down (a WC's bowl underside, 0.2 m, needs 1.5 m).
 */
export const WET_FOOT: Record<string, number> = { vanity: 0.85, basin: 0.6, toilet: 0.4, shower: 0.6 }
/**
 * The part of a wet-room fitting that must be wholly inside a bath's frame (heights, m): WET_FOOT up to its top, WET_TOP
 * at most (a vanity to its mirror, a WC to its flush plate, a shower's glass); null: not a fitting (a towel rail, a plant).
 */
export const wetBand = (k: KitAsset, size: { x: number; y: number; z: number }): { h0: number; h1: number } | null => {
  const foot = WET_FOOT[objectKind(k)]
  if (foot === undefined) return null
  const [h0, h1] = heightRange({ ...k, sizeM: size })
  return { h0: Math.max(h0, foot), h1: Math.min(h1, WET_TOP) }
}
/** A bath's pitches are tried in these steps (rad). */
const WET_STEP = (5 * Math.PI) / 180
/** A walk-in closet is seen from just inside a door down its aisle, looking down this little (the rails' tops stay in frame). */
export const CLOSET_PITCH = (-5 * Math.PI) / 180
/** A general room's best spot may turn this far (°) off its target to clear its frame before the next spot is tried. */
const TURN_MAX = 20
/**
 * A wet room under this (m²: a WC, a powder room) may look down as far as WET_PITCH so its WC enters the frame with the
 * basin (founder 2026-09-27); larger baths no more than BATH_PITCH.
 */
export const SMALL_WET = 3
export const WET_PITCH = (-25 * Math.PI) / 180
const THRESHOLD = 0.15
/** A door view (a help room, a closet, a tiny room) fails when a leaf fills more than this (it is exempt from FLAT_MAX). */
export const DOOR_LEAF_MAX = 0.25
/**
 * The largest leaf in the chosen frame is shut for the shot (`closeLeaf`) when that takes back at least this share of it: a
 * leaf standing into the view goes flat; a door seen along its own wall fills the same, shut or ajar, and stays ajar.
 */
export const LEAF_GAIN = 0.02
type View = { p: Pt; face: Pt; pitch?: number; closeLeaf?: string }

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
    if (isSlab(f, k))
      return footprintDist(p, f) < TALL_IN_VIEW && [f, ...footprint(f, f.rotationDeg, placementSize(f))].some((q) => inFrame(p, face, q)) && inSight(unit, p, f)
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

/** Distance from p to a placement's plan footprint (0 inside), its real size (kit.ts placementSize) unless given. rotationDeg is clockwise in y-down plan space. */
export const footprintDist = (p: Pt, f: FurniturePlacement, size: { x: number; z: number } = placementSize(f)): number => {
  const r = (f.rotationDeg * Math.PI) / 180
  const dx = p.x - f.x
  const dy = p.y - f.y
  const u = Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) - size.x / 2
  const v = Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) - size.z / 2
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
 * (an empty foyer or passage: the anchor of the room through its widest leafless opening, `through`; fallback: the longest
 * wall's midpoint). Best = farthest from the target — for a hero, farthest in FRONT of it
 * (a bed from its foot, a kitchen run from across the room; a table has no front) — minus SLAB_PENALTY when a wardrobe/shelf/tall
 * piece of any room in sight is within SLAB_NEAR, plus SLAB_NEAR − its distance when it is in the frame (a corner within ±FRAME_DEG),
 * minus HANG_PENALTY when a pendant, fan, AC or slab spoils the frame (`hangs`) — and the best whose frame no door leaf or
 * slab fills beyond FLAT_MAX nor near plaster beyond NEAR_WALL_MAX (`clear`; the spot may turn TURN_MAX for it; none clears:
 * the same frames with their largest leaf shut). Every spot left stands on the hero (a bed filling its room): just inside its door.
 * A room with no hero that is empty or under SIGHT_MAX_SQM, and every balcony, has no target: each stand point faces the farthest
 * inner corner it can see (a balcony: its rail, slider or a corner of two open walls; one with nothing to sit on: its
 * slider back into the flat) and scores that sightline (a narrow lobby or a closet facing its near wall is a wall of plaster).
 * Baths, help rooms (a cot) and tiny rooms (TINY_SIGHT) skip all that: a vanity/basin is framed from BATH_BACK inside the
 * room, else from the spot (the doorway or inside) where it shows at eye height; a cot lengthwise from its foot; else
 * they are seen from just inside a door (see below).
 * Nothing qualifies: 0.9 m in from the first door/passage on its centreline. Always faces the target.
 * `closeLeaf`: the door leaf the viewer shuts for this frame (the largest, when shutting it takes back LEAF_GAIN of it).
 */
export function roomView(room: Room, unit: Unit): View {
  const inner = core.roomInnerPolygon(room, unit)
  const n = inner.length
  // ceiling lights and ACs are overhead: they neither frame the view nor block a stand point
  const items = unit.furniture.filter((f) => f.roomId === room.id && kitAsset(f.assetId)?.mount !== 'ceiling')
  let target: Pt
  // a cot (help room) is the hero wherever it stands
  const hero = items.find((f) => f.assetId.startsWith('cot')) ?? (HERO[room.kind] && items.find((f) => HERO[room.kind]!.test(f.assetId)))
  const cot = !!hero && hero.assetId.startsWith('cot') // cot, cot_s (a help room under 1.9 m)
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
  // an empty foyer or passage looks on into the flat through its widest opening, not at its own walls or front door
  const into = room.kind === 'other' && !items.length && !isCommonCore(room) ? through(room, unit, core.deriveRooms(unit)) : null
  if (into) target = into

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
  const tight = room.kind === 'balcony' || (room.kind === 'kitchen' && ahead < GALLEY_DEPTH)
  const clearOfDoors = (p: Pt) =>
    doors.every(({ o, a, b, c }) =>
      tight ? !swings(o) || segDist(p, a, b) >= GALLEY_DOOR_CLEAR
      : swings(o) ? segDist(p, a, b) >= Math.max(DOOR_CLEAR, o.widthM + 0.3)
      : Math.hypot(p.x - c.x, p.y - c.y) >= DOOR_CLEAR,
    )
  const pieces = items.flatMap((f) => {
    const k = kitAsset(f.assetId)
    return k ? [{ f, k, top: heightRange({ ...k, sizeM: placementSize(f) })[1] }] : []
  })

  // what may not fill a frame beyond FLAT_MAX: every ajar leaf, every slab but a kitchen's run (a free-standing fridge is
  // a slab: Sheltech's filled 30 % of its kitchen frame); nor near plaster beyond NEAR_WALL_MAX (together: fill ≤ 1)
  const leafIds = new Set(unit.walls.flatMap((w) => w.openings.filter(swings).map((o) => o.id)))
  const flatIds = new Set([
    ...leafIds,
    ...unit.furniture
      .filter((f) => {
        const k = kitAsset(f.assetId)
        return !!k && isSlab(f, k) && (k.category !== 'kitchen' || f.assetId === 'fridge')
      })
      .map((f) => f.id),
  ])
  const wallIds = new Set(unit.walls.map((w) => w.id))
  type Fill = { leaf: number; leafId?: string; slab: number; wall: number }
  // by frame, not object: the same spot and heading ranked twice (a bath's far and near lists) is traced once
  const fills = new Map<string, Fill>()
  const tried: View[] = []
  /** The largest share of one leaf (and which; a shut one counts: still a door) and of one slab in v's frame, and of plaster within NEAR_WALL. */
  const measure = (v: View): Fill => {
    const key = `${v.p.x},${v.p.y},${v.face.x},${v.face.y},${v.pitch},${v.closeLeaf}`
    let m = fills.get(key)
    if (!m) {
      const by = new Map<string, number>()
      let wall = 0
      for (const { id, t } of frameHits(unit, v.p, v.face, v.pitch, v.closeLeaf)) {
        if (flatIds.has(id)) by.set(id, (by.get(id) ?? 0) + RAY)
        else if (t <= NEAR_WALL && wallIds.has(id)) wall += RAY
      }
      const f: Fill = { leaf: 0, slab: 0, wall }
      for (const [id, s] of by)
        if (!leafIds.has(id)) f.slab = Math.max(f.slab, s)
        else if (s > f.leaf) Object.assign(f, { leaf: s, leafId: id })
      fills.set(key, (m = f))
      tried.push(v)
    }
    return m
  }
  const flat = (v: View) => {
    const m = measure(v)
    return Math.max(m.leaf / FLAT_MAX, m.slab / FLAT_MAX, m.wall / NEAR_WALL_MAX)
  }
  // ponytail: the first FLAT_TRIES frames only (~0.3 s worst case); rank smarter if a room needs more
  /** The best-ranked view that no leaf or slab fills beyond FLAT_MAX, nor near plaster beyond NEAR_WALL_MAX. */
  const clear = <V extends View>(ranked: V[]) => ranked.slice(0, FLAT_TRIES).find((v) => flat(v) <= 1)
  /** …else the least filled frame tried (the first of equals). */
  const leastFilled = () => tried.reduce<View | undefined>((m, v) => (!m || flat(v) < flat(m) ? v : m), undefined)
  /** v with its largest leaf shut, when that takes back LEAF_GAIN of the frame (else v). */
  const shut = (v: View): View => {
    const { leaf, leafId } = measure(v)
    const s = { ...v, closeLeaf: leafId }
    return leafId && measure(s).leaf <= leaf - LEAF_GAIN ? s : v
  }
  /** The view to return (one shut leaf at most). */
  const done = (v: View): View => {
    const closeLeaf = v.closeLeaf ?? shut(v).closeLeaf
    return { p: v.p, face: v.face, ...(v.pitch !== undefined && { pitch: v.pitch }), ...(closeLeaf && { closeLeaf }) }
  }

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
  /** The spot m in from a door's wall face on its centreline, on this room's side. */
  const stepIn = (d: (typeof doors)[number], m: number) => add(d.c, d.f.normal, inSide(d) * (d.w.thicknessM / 2 + m))

  const sight = room.kind === 'balcony' || (!hero && !into && (!items.length || room.areaSqm < SIGHT_MAX_SQM))
  // p→q stays inside the room, checked every 5 cm (an L-shaped room's far corner may be round the bend)
  const visible = (p: Pt, q: Pt) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y)
    for (let s = 0.05; s < L - 0.05; s += 0.05) if (!core.pointInPolygon(add(p, { x: q.x - p.x, y: q.y - p.y }, s / L), inner)) return false
    return true
  }
  // a sightline ends on an inner corner; a balcony's on its rail/curb (a wall below the eye: the street) or its slider /
  // passage (back into the flat), on the inner face — never a blank corner, a hinged door (ajar 20°) or a window (a
  // neighbour room's). A balcony with nothing to sit on (a service veranda: a plant at most) only looks back into the
  // flat: out over its rail there is nothing but the neighbours' facades.
  const wallOf = (id: string) => unit.walls.find((x) => x.id === id)!
  const open = (w: Wall) => w.heightM < EYE || w.openings.some((o) => !swings(o))
  const sides =
    room.kind !== 'balcony'
      ? []
      : room.wallIds.map((id) => {
          const w = wallOf(id)
          const f = core.wallFrame(w, unit.vertices)
          const s = core.pointInPolygon(add(add(f.origin, f.dir, f.lengthM / 2), f.normal, w.thicknessM / 2 + 0.05), inner) ? 1 : -1
          const on = (u: number) => add(add(f.origin, f.dir, u), f.normal, s * (w.thicknessM / 2 + 0.02))
          return { rail: w.heightM < EYE ? [on(f.lengthM / 2)] : [], ways: w.openings.filter((o) => o.kind !== 'window' && !swings(o)).map((o) => on(o.offsetM + o.widthM / 2)) }
        })
  const ways = sides.flatMap((x) => x.ways)
  const ends =
    room.kind !== 'balcony' ? inner
    : ways.length && items.every((f) => kitAsset(f.assetId)?.category === 'plant') ? ways
    : [
        // …or a corner where two open walls meet (the slider and the rail: the flat and the street in one frame)
        ...inner.filter((_, i) => open(wallOf(room.wallIds[(i - 1 + n) % n])) && open(wallOf(room.wallIds[i]))),
        ...sides.flatMap((x) => [...x.rail, ...x.ways]),
      ]
  const farthest = (p: Pt): Pt =>
    ends.reduce((a, v) => (visible(p, v) && Math.hypot(v.x - p.x, v.y - p.y) > Math.hypot(a.x - p.x, a.y - p.y) ? v : a), target)
  // eye (1.6 m) in or against a cabinet/wardrobe/TV
  const eyeBlocked = (p: Pt, clear = EYE_CLEAR) => pieces.some(({ f, top }) => top > 1.2 && footprintDist(p, f) < (GLASS.has(f.assetId) ? 0.15 : clear))
  const seen = (p: Pt) => {
    const q = farthest(p)
    return Math.hypot(q.x - p.x, q.y - p.y)
  }

  // A bath, a help room (its cot is the hero), a walk-in closet (from a door down its aisle: from inside, 1.2 m off a
  // rail, it is a wall of clothes) or an enclosed room too small to frame from inside (no spot VIEW_INSET off the walls
  // sees TINY_SIGHT).
  if (room.kind === 'bath' || room.kind === 'closet' || cot || (room.kind !== 'balcony' && Math.max(...candidates.filter((p) => core.pointInPolygon(p, inner)).map(seen)) < TINY_SIGHT)) {
    // spots: corners, wall midpoints, a 0.25 m grid and 0.4–0.6 m inside each door, BATH_INSET off the walls, clear of the
    // pieces and of a swinging door's leaf (ajar 20°, ≤ 0.26 m in); a wet room also from each doorway (THRESHOLD in, its
    // leaf shut when it swings in: the door corner photographers shoot a bath from)
    const small = room.kind === 'bath' && room.areaSqm < SMALL_WET
    const clearOf = (p: Pt, inset: number, but?: (typeof doors)[number]) =>
      core.pointInPolygon(p, inner) &&
      inner.every((a, j) => segDist(p, a, inner[(j + 1) % n]) >= inset - 0.02) &&
      pieces.every(({ f }) => footprintDist(p, f) >= 0.2) &&
      doors.every((d) => d === but || !swings(d.o) || segDist(p, d.a, d.b) >= DOOR_STEP[2])
    const spots: { p: Pt; closeLeaf?: string }[] = [
      ...[...candidates, ...grid(BATH_INSET), ...doors.flatMap((d) => DOOR_STEP.map((m) => stepIn(d, m)))].filter((p) => clearOf(p, BATH_INSET)).map((p) => ({ p })),
      ...(room.kind === 'bath' ? doors : []).flatMap((d) => {
        // a leaf swinging in is shut behind the eye; one swinging away (or none) leaves the doorway itself free
        const shut = swings(d.o) && (d.o.swing === 'in' ? -1 : 1) === inSide(d)
        const p = stepIn(d, shut ? THRESHOLD : 0.02)
        return clearOf(p, 0, d) ? [{ p, ...(shut && { closeLeaf: d.o.id }) }] : []
      }),
    ]
    const dir = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) })
    // A bath (or tiny room) with a vanity/basin: every spot × heading (5°) × pitch (level to BATH_PITCH; a small wet room to
    // WET_PITCH), ranked by what the projector shows of each fitting's band (`wetBand`, `boxInFrame`: whole = 1, half its
    // corners = ½): the vanity/basin whole, else half (no spot shows both: the vanity, not a WC), then the most fittings
    // (WC, shower), then the pitch nearest BATH_PITCH (shallower first), the fittings centred, the farthest back. The first
    // clear frame (FLAT_MAX / NEAR_WALL_MAX) of those wins; none clears (a WC is all near tile): the least filled frame of the
    // top rank. No fitting half in frame from anywhere: the door view below.
    if (hero && !cot) {
      const low = small ? WET_PITCH : BATH_PITCH
      const bands = items.flatMap((f) => {
        const k = kitAsset(f.assetId)!
        const b = wetBand(k, placementSize(f))
        return b ? [{ f, s: placementSize(f), ...b }] : []
      })
      const pitches: number[] = []
      for (let a = 0; a >= low - 1e-9; a -= WET_STEP) pitches.push(a)
      pitches.sort((a, b) => Math.abs(a - BATH_PITCH) - Math.abs(b - BATH_PITCH) || b - a)
      type Pick = View & { hero: number; count: number; pref: number; spread: number; back: number }
      const picks: Pick[] = []
      for (const { p, closeLeaf } of spots)
        for (let deg = 0; deg < 360; deg += 5) {
          const face = dir(deg)
          pitches.forEach((pitch, pref) => {
            // a fitting counts 1 whole, ½ with half its corners in frame (a WC's bowl front cut off)
            const shown = bands.map((b) => ({ b, s: boxInFrame(b.f, b.s, b.h0, b.h1, p, face, pitch) })).filter((x) => x.s >= 0.5)
            if (!shown.length) return
            const spread = Math.max(...shown.map(({ b }) => Math.abs(project(p, face, pitch, b.f, (b.h0 + b.h1) / 2).x)))
            const back = Math.min(...shown.map(({ b }) => Math.hypot(b.f.x - p.x, b.f.y - p.y)))
            const count = shown.reduce((t, x) => t + (x.s === 1 ? 1 : 0.5), 0)
            picks.push({ p, face, pitch, closeLeaf, hero: Math.max(0, ...shown.map((x) => (x.b.f !== hero ? 0 : x.s === 1 ? 1 : 0.5))), count, pref, spread, back })
          })
        }
      picks.sort((a, b) => b.hero - a.hero || b.count - a.count || a.pref - b.pref || a.spread - b.spread || b.back - a.back)
      // the best 3 frames per spot: FLAT_TRIES frames then span ~50 spots, not one spot's headings and pitches
      const per = new Map<Pt, number>()
      const ranked = picks.filter((v) => per.set(v.p, (per.get(v.p) ?? 0) + 1).get(v.p)! <= 3)
      const top = ranked[0]
      const tier = top && ranked.filter((v) => v.hero === top.hero && v.count === top.count).slice(0, FLAT_TRIES)
      const pick = top && (clear(ranked) ?? tier.reduce((m, v) => (flat(v) < flat(m) ? v : m)))
      if (pick) return done({ p: pick.p, face: pick.face, pitch: pick.pitch, closeLeaf: pick.closeLeaf })
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
        .map(({ p }) => {
          const along = (p.x - hero.x) * axis.x + (p.y - hero.y) * axis.y
          const side = Math.abs((p.x - hero.x) * axis.y - (p.y - hero.y) * axis.x)
          const d = Math.hypot(aim.x - p.x, aim.y - p.y)
          return { p, face: { x: (aim.x - p.x) / d, y: (aim.y - p.y) / d }, pitch: Math.max(HELP_PITCH, Math.atan2((y0 + y1) / 2 - EYE, d) + Math.atan((2 / 3) * Math.tan(HALF_VFOV))), along, off: Math.atan2(side, along) }
        })
        .filter((v) => v.along >= k.sizeM.x / 2)
        .sort((a, b) => a.off - b.off || b.along - a.along)
      const pick = clear(ends) ?? leastFilled()
      if (pick) return done({ p: pick.p, face: pick.face, pitch: pick.pitch })
    }
    // From just inside a door (DOOR_STEP; from outside, the leaf ajar 20° hides the room), the door whose spot sees
    // farthest, looking down DOOR_PITCH (at a cot: to put it in the lower third). It looks in (≤ 70°
    // off the door's normal, never along the door wall; 5° steps): the hero in frame (±FRAME_DEG) first, then the most
    // other pieces in frame, then the deepest sightline. A leaf filling more than DOOR_LEAF_MAX fails that frame: the
    // same spot turned up to TURN_MAX (the hero kept in frame), then the next step in, then the next door; nothing clears
    // it: the first frame with that leaf shut.
    const cos = Math.cos((FRAME_DEG * Math.PI) / 180)
    const tries: View[] = []
    for (const d of doors
      .map((d) => ({ d, ps: DOOR_STEP.map((m) => stepIn(d, m)).filter((q) => core.pointInPolygon(q, inner) && !eyeBlocked(q, 0.3)) }))
      .filter((x) => x.ps.length)
      .sort((a, b) => seen(b.ps[0]) - seen(a.ps[0]))) {
      const s = inSide(d.d)
      const dn = { x: d.d.f.normal.x * s, y: d.d.f.normal.y * s }
      for (const p of d.ps) {
        const faces: { a: number; face: Pt; score: number }[] = []
        for (let a = -70; a <= 70; a += 5) {
          const r = (a * Math.PI) / 180
          const face = { x: dn.x * Math.cos(r) - dn.y * Math.sin(r), y: dn.x * Math.sin(r) + dn.y * Math.cos(r) }
          const framed = (q: Pt) => (q.x - p.x) * face.x + (q.y - p.y) * face.y > cos * Math.hypot(q.x - p.x, q.y - p.y)
          let depth = 0
          while (depth < 20 && core.pointInPolygon(add(p, face, depth + 0.05), inner)) depth += 0.05
          faces.push({ a, face, score: (hero && framed(hero) ? 1000 : 0) + items.filter((f) => f !== hero && framed(f)).length * 100 + depth })
        }
        const top = faces.reduce((m, f) => (f.score > m.score ? f : m))
        for (const { face } of faces
          .filter((f) => Math.abs(f.a - top.a) <= TURN_MAX && (top.score < 1000 || f.score >= 1000))
          .sort((a, b) => Math.abs(a.a - top.a) - Math.abs(b.a - top.a))) {
          // a cot: its centre in the middle of the frame's lower third, from its depth along the view and the eye height
          const [y0, y1] = cot && hero ? heightRange(kitAsset(hero.assetId)!) : [0, 0]
          const pitch =
            cot && hero ? Math.atan2((y0 + y1) / 2 - EYE, (hero.x - p.x) * face.x + (hero.y - p.y) * face.y) + Math.atan((2 / 3) * Math.tan(HALF_VFOV))
            : room.kind === 'closet' ? CLOSET_PITCH
            : DOOR_PITCH
          tries.push({ p, face, pitch })
        }
      }
    }
    if (tries.length) return done(tries.find((v) => measure(v).leaf <= DOOR_LEAF_MAX) ?? tries.map(shut).find((v) => measure(v).leaf <= DOOR_LEAF_MAX) ?? tries[0])
  }

  const views: (View & { score: number })[] = []
  const onHero = (p: Pt) => !!hero && footprintDist(p, hero) < 0.2
  const consider = (p: Pt, atDoor = false) => {
    if (!core.pointInPolygon(p, inner)) return
    if (inner.some((a, j) => segDist(p, a, inner[(j + 1) % n]) < VIEW_INSET - 0.02)) return // a third edge (wall-thickness step) crowds it
    if (!atDoor && !clearOfDoors(p)) return
    if (eyeBlocked(p)) return
    // a veranda's corners are where its plant and chair stand: not in them (the chair back would fill the foot of the frame)
    if (room.kind === 'balcony' && pieces.some(({ f, k }) => k.category !== 'rug' && footprintDist(p, f) < 0.3)) return
    const t = sight ? farthest(p) : target
    const d = Math.hypot(t.x - p.x, t.y - p.y)
    if (d < 0.2) return // target sits here: faces nothing useful
    const face = { x: (t.x - p.x) / d, y: (t.y - p.y) / d }
    let slab = 0
    for (const f of unit.furniture) {
      const k = kitAsset(f.assetId)
      const g = k && isSlab(f, k) ? footprintDist(p, f) : SLAB_NEAR
      if (g < SLAB_NEAR && inSight(unit, p, f))
        slab = Math.max(slab, SLAB_PENALTY + ([f, ...footprint(f, f.rotationDeg, placementSize(f))].some((q) => inFrame(p, face, q)) ? SLAB_NEAR - g : 0))
    }
    const hang = hangs(unit, p, face)
    // on the hero (a bed) only when nothing else qualifies
    const score = (front ? (p.x - t.x) * front.x + (p.y - t.y) * front.y : d) - slab - (hang ? HANG_PENALTY : 0) - (onHero(p) ? 2 * HANG_PENALTY : 0)
    // …and the same spot turned up to TURN_MAX (5° steps, the target stays in frame) when a leaf or slab fills that frame:
    // ranked right after it, so it never beats a clear frame of its own spot
    for (let a = 0; a <= TURN_MAX; a += 5)
      for (const s of a ? [1, -1] : [0]) {
        const r = (s * a * Math.PI) / 180
        const turned = { x: face.x * Math.cos(r) - face.y * Math.sin(r), y: face.x * Math.sin(r) + face.y * Math.cos(r) }
        views.push({ p, face: turned, score: score - (a && !hang && hangs(unit, p, turned) ? HANG_PENALTY : 0) })
      }
  }
  candidates.forEach((p) => consider(p))
  // a hero wants the best spot in front of it, not just a corner or wall midpoint (a door or wardrobe often takes those);
  // a small room whose door clearance eats every corner and midpoint (Bath-1) needs one at all
  if (!views.length || hero) grid(VIEW_INSET).forEach((p) => consider(p))
  // the bed fills the room (Sheltech Bed 4: slider to wardrobe) and every spot left stands on it: stand just inside its
  // door instead and look at it, like a small room's door view
  if (hero && views.every((v) => onHero(v.p))) for (const d of doors) if (swings(d.o)) DOOR_STEP.forEach((m) => consider(stepIn(d, m), true))
  views.sort((a, b) => b.score - a.score) // stable: the first of equals, as before
  // nothing clears: the same frames with their largest leaf shut, then the least filled
  const best = clear(views) ?? clear(views.slice(0, FLAT_TRIES).map(shut)) ?? leastFilled()
  if (best) return done(best)

  for (const { w, f, c } of doors) {
    for (const s of [1, -1]) {
      const p = add(c, f.normal, s * (w.thicknessM / 2 + 0.9))
      if (core.pointInPolygon(p, inner)) return done(look(p, sight ? farthest(p) : target))
    }
  }
  return done(look(room.centroid, target))
}
