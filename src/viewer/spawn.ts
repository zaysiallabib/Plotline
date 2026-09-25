/** Pure spawn/camera helpers for the viewer (no Three, no DOM) — Vitest-covered. */
import * as core from '../core'
import type { FurniturePlacement, Opening, Pt, Room, Unit } from '../core'
import { heightRange, kitAsset, objectKind } from '../furnish/kit'
import { isCommonCore } from '../furnish/presets'

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

/** Eye height (PlotlineScene). */
const EYE = 1.6
/** Distance from the room to spawn away from the two walls meeting at the chosen corner. */
export const VIEW_INSET = 0.4
/** Minimum distance from a stand point to a door/passage (a door needs max(this, widthM + 0.3) from its whole span). */
export const DOOR_CLEAR = 1.2
/** Anything reaching above 1.2 m (wall cabinets, wardrobe, TV) stays this far from the eye; glass only must not enclose it. */
const EYE_CLEAR = 0.5
const GLASS = new Set(['shower_screen'])
/** The piece the first view frames, by room kind; other rooms (and rooms without it) face the furniture centroid. */
const HERO: Partial<Record<Room['kind'], RegExp>> = { bed: /^bed_/, bath: /^(vanity|basin)$/, kitchen: /^kitchen_sink$/, dining: /^dining_table$/ }
/** No hero and empty or smaller than this (closet, help room, lobby, small veranda): look along the longest clear sightline. */
const SIGHT_MAX_SQM = 8
/** A wardrobe/shelf/tall (> 1.6 m) piece this close to the stand point fills the first view with a slab… */
const SLAB_NEAR = 1.5
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
/** A wardrobe/shelf/tall piece in the frame (±FRAME_DEG) this close fills a third of it. */
export const TALL_IN_VIEW = 1
/** A bath is framed from a spot this far from its vanity/basin, else from its door. */
export const BATH_BACK = 1.5
/** A spot with a pendant in its frame (or an AC over it) loses to every spot without (only when all have one does the best win). */
const HANG_PENALTY = 100
/** An enclosed room whose best spot 0.4 m off the walls sees less than this (help bed, WC, store) is framed from its door. */
const TINY_SIGHT = 2.2
/** Bath and tiny-room views stand this far inside the door (first that fits), clear of its leaf (ajar 20°, ≤ 0.26 m in). */
const DOOR_STEP = [0.5, 0.6, 0.4]
/** A piece this far off the view axis is in frame with margin (the horizontal half-FOV is ~48° at 16:9). */
const FRAME_DEG = 40
/** Door views look down 20°: 1 m ahead the frame then reaches down to 0.3 m, so the vanity, WC or cot of a small room shows. */
export const DOOR_PITCH = (-20 * Math.PI) / 180

/**
 * Something overhead spoils the frame from p looking along face — a piece of ANY room in sight (`inSight`), by plan
 * distance to its centre: a pendant (a ceiling piece hanging more than HANG_DROP) within HANG_CLEAR, or within HANG_IN_VIEW
 * and in the frame (within ~53° of the view); a fan within FAN_CLEAR / FAN_IN_VIEW; a wall AC within AC_NEAR / AC_IN_VIEW.
 */
const hangs = (unit: Unit, p: Pt, face: Pt): boolean =>
  unit.furniture.some((f) => {
    const k = kitAsset(f.assetId)
    if (!k) return false
    const kind = objectKind(k)
    const [near, inView] =
      kind === 'ac' ? [AC_NEAR, AC_IN_VIEW]
      : kind === 'ceiling-fan' ? [FAN_CLEAR, FAN_IN_VIEW]
      : k.mount === 'ceiling' && k.mountY === undefined && k.sizeM.y > HANG_DROP ? [HANG_CLEAR, HANG_IN_VIEW]
      : [0, 0]
    const d = Math.hypot(f.x - p.x, f.y - p.y)
    return (d < near || (d < inView && (f.x - p.x) * face.x + (f.y - p.y) * face.y > 0.6 * d)) && inSight(unit, p, f)
  })


/** A swinging door (hinged, or narrower than a slider); it renders ajar 20°, so it blocks the view and the leaf takes room. */
const swings = (o: Opening) => o.kind === 'door' && (!!o.hinge || o.widthM < 1.2)

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
export const footprintDist =(p: Pt, f: FurniturePlacement, size: { x: number; z: number }): number => {
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
 * piece is within SLAB_NEAR, minus HANG_PENALTY when the room's pendant hangs in the frame or its AC is overhead (`hangs`).
 * A room with no hero that is empty or under SIGHT_MAX_SQM has no target: each stand point faces the farthest inner
 * corner it can see and scores that sightline (a narrow lobby or a closet facing its near wall is a wall of plaster).
 * Baths, help rooms (a cot) and tiny rooms (TINY_SIGHT) skip all that: they are seen from just inside a door (see below).
 * Nothing qualifies: 0.9 m in from the first door/passage on its centreline. Always faces the target.
 */
export function roomView(room: Room, unit: Unit): { p: Pt; face: Pt; pitch?: number } {
  const inner = core.roomInnerPolygon(room, unit)
  const n = inner.length
  // ceiling lights and ACs are overhead: they neither frame the view nor block a stand point
  const items = unit.furniture.filter((f) => f.roomId === room.id && kitAsset(f.assetId)?.mount !== 'ceiling')
  let target: Pt
  // a cot (help room) is the hero wherever it stands
  const hero = items.find((f) => f.assetId === 'cot') ?? (HERO[room.kind] && items.find((f) => HERO[room.kind]!.test(f.assetId)))
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
  const clearOfDoors = (p: Pt) =>
    doors.every(({ o, a, b, c }) =>
      // slider as openings.ts builds it: no hinge, ≥ 1.2 m
      o.kind === 'door' && (o.hinge || o.widthM < 1.2)
        ? segDist(p, a, b) >= Math.max(DOOR_CLEAR, o.widthM + 0.3)
        : Math.hypot(p.x - c.x, p.y - c.y) >= DOOR_CLEAR,
    )
  const pieces = items.flatMap((f) => {
    const k = kitAsset(f.assetId)
    return k ? [{ f, k, top: heightRange(k)[1] }] : []
  })

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

  const sight = !hero && (!items.length || room.areaSqm < SIGHT_MAX_SQM)
  // p→q stays inside the room, checked every 5 cm (an L-shaped room's far corner may be round the bend)
  const visible = (p: Pt, q: Pt) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y)
    for (let s = 0.05; s < L - 0.05; s += 0.05) if (!core.pointInPolygon(add(p, { x: q.x - p.x, y: q.y - p.y }, s / L), inner)) return false
    return true
  }
  const farthest = (p: Pt): Pt =>
    inner.reduce((a, v) => (visible(p, v) && Math.hypot(v.x - p.x, v.y - p.y) > Math.hypot(a.x - p.x, a.y - p.y) ? v : a), target)
  // eye (1.6 m) in or against a cabinet/wardrobe/TV
  const eyeBlocked = (p: Pt, clear = EYE_CLEAR) => pieces.some(({ f, k, top }) => top > 1.2 && footprintDist(p, f, k.sizeM) < (GLASS.has(f.assetId) ? 0.15 : clear))
  const seen = (p: Pt) => {
    const q = farthest(p)
    return Math.hypot(q.x - p.x, q.y - p.y)
  }

  // A bath, a help room (its cot is the hero) or an enclosed room too small to frame from inside (no spot VIEW_INSET off
  // the walls sees TINY_SIGHT): from just inside a door (DOOR_STEP; from outside, the leaf ajar 20° hides the room), the
  // door whose spot sees farthest, looking down DOOR_PITCH. It looks in (≤ 70° off the door's normal, never along the door
  // wall; 5° steps): the hero in frame (±FRAME_DEG) first, then the most other pieces in frame, then the deepest
  // sightline — vanity, shower and a wall meet in a diagonal instead of the mirror head-on.
  if (room.kind === 'bath' || hero?.assetId === 'cot' || (room.kind !== 'balcony' && Math.max(...candidates.filter((p) => core.pointInPolygon(p, inner)).map(seen)) < TINY_SIGHT)) {
    let door = null as { p: Pt; n: Pt; d: number } | null
    for (const { w, f, c } of doors) {
      const s = core.pointInPolygon(add(c, f.normal, w.thicknessM / 2 + 0.1), inner) ? 1 : -1
      const p = DOOR_STEP.map((m) => add(c, f.normal, s * (w.thicknessM / 2 + m))).find((q) => core.pointInPolygon(q, inner) && !eyeBlocked(q, 0.3))
      if (p && (!door || seen(p) > door.d)) door = { p, n: { x: f.normal.x * s, y: f.normal.y * s }, d: seen(p) }
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
      return { p, face: pick.face, pitch: DOOR_PITCH }
    }
  }

  let best = null as { p: Pt; t: Pt; score: number } | null // set inside consider(): no narrowing to null
  const consider = (p: Pt) => {
    if (!core.pointInPolygon(p, inner)) return
    if (inner.some((a, j) => segDist(p, a, inner[(j + 1) % n]) < VIEW_INSET - 0.02)) return // a third edge (wall-thickness step) crowds it
    if (!clearOfDoors(p)) return
    if (eyeBlocked(p)) return
    const t = sight ? farthest(p) : target
    const d = Math.hypot(t.x - p.x, t.y - p.y)
    if (d < 0.2) return // target sits here: faces nothing useful
    const slab = pieces.some(({ f, k }) => (k.category === 'wardrobe' || k.category === 'shelf' || k.sizeM.y > 1.6) && footprintDist(p, f, k.sizeM) < SLAB_NEAR)
    const hung = hangs(unit, p, { x: (t.x - p.x) / d, y: (t.y - p.y) / d })
    const score = (front ? (p.x - t.x) * front.x + (p.y - t.y) * front.y : d) - (slab ? SLAB_PENALTY : 0) - (hung ? HANG_PENALTY : 0)
    if (!best || score > best.score) best = { p, t, score }
  }
  candidates.forEach(consider)
  if (!best || hero) {
    // a hero wants the best spot in front of it, not just a corner or wall midpoint (a door or wardrobe often takes
    // those); a small room whose door clearance eats every corner and midpoint (Bath-1) needs one at all: 0.25 m grid
    const xs = inner.map((p) => p.x)
    const ys = inner.map((p) => p.y)
    for (let x = Math.min(...xs) + VIEW_INSET; x <= Math.max(...xs) - VIEW_INSET; x += 0.25)
      for (let y = Math.min(...ys) + VIEW_INSET; y <= Math.max(...ys) - VIEW_INSET; y += 0.25) consider({ x, y })
  }
  if (best) return look(best.p, best.t)

  for (const { w, f, c } of doors) {
    for (const s of [1, -1]) {
      const p = add(c, f.normal, s * (w.thicknessM / 2 + 0.9))
      if (core.pointInPolygon(p, inner)) return look(p, sight ? farthest(p) : target)
    }
  }
  return look(room.centroid, target)
}
