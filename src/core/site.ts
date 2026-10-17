/**
 * The site (founder 2026-10-18): the sun at the plot, the map's neighbours in the plan, the wind through the flat.
 * Pure — the Studio fetches (OpenStreetMap / Overpass, Open-Meteo) and hands the answers here; src/three draws.
 */
import { cross, pointInPolygon, unitBounds, wallFrame, roomAt, type Pt } from './geometry'
import { isOutdoor } from './index'
import type { Id, Room, RoomKind, Site, SiteBuilding, SiteRoad, Unit, WindMonth } from './types'

const RAD = Math.PI / 180
/** metres per degree of latitude (WGS84 sphere of the web map) */
const M_PER_DEG = (6378137 * Math.PI) / 180

/** Dhaka (Farmgate), when a unit has no site: the sun and the wind of the city */
export const DHAKA = { lat: 23.79, lon: 90.4 }

/**
 * Dhaka's prevailing wind by month, January first: Open-Meteo's archive (ERA5) at 23.79 N 90.40 E, daily mean speed and
 * dominant direction 2015–2024, averaged per month as vectors (fetched 2026-10-18). From the north-west in winter, the
 * south / south-east in the monsoon; March and October have no steady direction (steady 0.31 / 0.18).
 */
export const DHAKA_WIND: WindMonth[] = [
  [324, 2.0, 0.82],
  [301, 2.1, 0.4],
  [230, 2.2, 0.31],
  [178, 2.9, 0.76],
  [166, 2.9, 0.8],
  [165, 3.5, 0.91],
  [154, 3.7, 0.9],
  [152, 3.3, 0.89],
  [152, 2.5, 0.75],
  [95, 1.9, 0.18],
  [346, 1.8, 0.69],
  [332, 1.9, 0.8],
].map(([fromDeg, speedMs, steady]) => ({ fromDeg, speedMs, steady }))

// ───────────────────────────── sun ─────────────────────────────

/**
 * Where the sun stands at `lat`, `lon` (degrees) at instant `t`: altitude above the horizon and azimuth clockwise from
 * true north, degrees. NOAA's solar position equations (Meeus, low precision: well under 0.1°); no refraction.
 */
export function sunPosition(lat: number, lon: number, t: Date): { altDeg: number; azDeg: number } {
  const jc = (t.getTime() / 86400000 + 2440587.5 - 2451545) / 36525 // Julian centuries since J2000
  const L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc)
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc)
  const C = Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) + Math.sin(3 * M * RAD) * 0.000289
  const omega = 125.04 - 1934.136 * jc
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD)
  const eps = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(omega * RAD)
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD))
  const y = Math.tan((eps / 2) * RAD) ** 2
  const eqTime =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD)) // minutes
  const minutes = t.getUTCHours() * 60 + t.getUTCMinutes() + t.getUTCSeconds() / 60
  const H = ((((minutes + eqTime + 4 * lon) / 4 - 180) % 360) + 540) % 360 - 180 // hour angle, degrees, + after noon
  const phi = lat * RAD
  const h = H * RAD
  const alt = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h))
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180
  return { altDeg: alt / RAD, azDeg: ((az % 360) + 360) % 360 }
}

/** The sun at the site on `date` (YYYY-MM-DD) at `hour` on its clock (site.utcOffsetH, else round(lon / 15)); Dhaka without a site. */
export function sunAt(site: Pick<Site, 'lat' | 'lon' | 'utcOffsetH'> | undefined, date: string, hour: number): { altDeg: number; azDeg: number } {
  const { lat, lon } = site ?? DHAKA
  const tz = site?.utcOffsetH ?? Math.round(lon / 15) // ponytail: no time-zone table; the API's offset when fetched
  const [y, m, d] = date.split('-').map(Number)
  return sunPosition(lat, lon, new Date(Date.UTC(y, m - 1, d) + (hour - tz) * 3600000))
}

// ───────────────────────────── site frame ↔ plan ─────────────────────────────

/** The unit's anchor: the plot point lands on its centre (the bounds of its corners). */
export function siteAnchor(unit: Pick<Unit, 'vertices'>): Pt {
  if (!unit.vertices.length) return { x: 0, y: 0 }
  const b = unitBounds(unit)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** A site-frame point (x east, y south, m from the plot) in the unit's plan: turned by northDeg about the anchor. */
export function siteToPlan(unit: Pick<Unit, 'vertices' | 'northDeg'>, q: Pt, anchor = siteAnchor(unit)): Pt {
  const [c, s] = [Math.cos(unit.northDeg * RAD), Math.sin(unit.northDeg * RAD)]
  return { x: anchor.x + q.x * c - q.y * s, y: anchor.y + q.x * s + q.y * c }
}

/** A compass bearing (degrees clockwise from true north) as a unit vector in the plan (plan-up = −y). */
export function bearingInPlan(northDeg: number, deg: number): Pt {
  const r = (northDeg + deg) * RAD
  return { x: Math.sin(r), y: -Math.cos(r) }
}

/**
 * The site's neighbours and roads in the unit's plan frame. A neighbour reaching onto the drawing's box (1 m round it) is
 * what stood on the plot before: left out (the map keeps it; Fetch again brings it back if the plot moves).
 */
export function sitePlan(unit: Unit): { buildings: (SiteBuilding & { plan: Pt[] })[]; roads: (SiteRoad & { plan: Pt[] })[] } {
  const site = unit.site
  if (!site) return { buildings: [], roads: [] }
  const a = siteAnchor(unit)
  const b0 = unit.vertices.length ? unitBounds(unit) : { minX: a.x, minY: a.y, maxX: a.x, maxY: a.y }
  const box = [
    { x: b0.minX - 1, y: b0.minY - 1 },
    { x: b0.maxX + 1, y: b0.minY - 1 },
    { x: b0.maxX + 1, y: b0.maxY + 1 },
    { x: b0.minX - 1, y: b0.maxY + 1 },
  ]
  const onPlot = (poly: Pt[]) =>
    poly.some((p) => pointInPolygon(p, box)) || box.some((p) => pointInPolygon(p, poly)) || poly.some((p, i) => box.some((q, j) => meets(p, poly[(i + 1) % poly.length], q, box[(j + 1) % 4])))
  return {
    buildings: site.buildings.map((b) => ({ ...b, plan: b.pts.map((p) => siteToPlan(unit, p, a)) })).filter((b) => !onPlot(b.plan)),
    roads: site.roads.map((r) => ({ ...r, plan: r.pts.map((p) => siteToPlan(unit, p, a)) })),
  }
}

// ───────────────────────────── the map's answers ─────────────────────────────

/** An Overpass `out geom` element (only what is read). */
interface OsmWay {
  type: string
  id: number
  tags?: Record<string, string>
  geometry?: { lat: number; lon: number }[]
}

/** vehicle roads only (no footways, paths, steps), with their usual width in Dhaka when the map gives none (m) */
const ROAD_M: Record<string, number> = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8, tertiary: 7, unclassified: 6, residential: 6, living_street: 5, road: 6, service: 4, track: 3,
  motorway_link: 7, trunk_link: 7, primary_link: 7, secondary_link: 6, tertiary_link: 6,
}
export const STOREY_GUESS_M = 3
export const HEIGHT_GUESS_M = 9

/** "12", "12 m", "12.5m" → 12.5; feet ("40'", "40 ft") → m; else null. */
const metres = (v?: string): number | null => {
  const n = v ? parseFloat(v) : NaN
  if (!(n > 0)) return null
  return /'|ft/.test(v!) ? n * 0.3048 : n
}

/**
 * An Overpass answer (`way[building]` + `way[highway]`, `out geom`) as the site's neighbours and roads, metres from the
 * plot at lat / lon (x east, y south; equirectangular — exact enough within 250 m). Height: the `height` tag (unless it is
 * under 2 m or over 6 m a floor of its `building:levels`), else `building:levels` × 3 m, else 9 m (a guess, three floors). A footprint holding the plot point is the plot's own old
 * house: left out. Coordinates to the decimetre.
 */
export function siteFromOverpass(json: { elements?: OsmWay[] }, lat: number, lon: number): Pick<Site, 'buildings' | 'roads'> {
  const kx = M_PER_DEG * Math.cos(lat * RAD)
  const r1 = (v: number) => Math.round(v * 10) / 10 || 0 // (never −0)
  const toM = (g: { lat: number; lon: number }) => ({ x: r1((g.lon - lon) * kx), y: r1(-(g.lat - lat) * M_PER_DEG) })
  const buildings: SiteBuilding[] = []
  const roads: SiteRoad[] = []
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {}
    if (e.type !== 'way' || !e.geometry || e.geometry.length < 2) continue
    const pts = e.geometry.map(toM)
    if (t.building && t.building !== 'no') {
      if (pts.length > 2 && pts[0].x === pts.at(-1)!.x && pts[0].y === pts.at(-1)!.y) pts.pop() // closed way: drop the repeat
      if (pts.length < 3 || pointInPolygon({ x: 0, y: 0 }, pts)) continue
      const lv = parseFloat(t['building:levels'] ?? '')
      // a height far off its floor count (60 m on 5 floors, 35 m on 3: both in Banani's map) is a typo — the floors win
      const tagged = metres(t.height)
      const h = tagged && !(lv > 0 && (tagged > lv * 6 || tagged < lv * 2)) ? tagged : null
      buildings.push({ id: `osm-${e.id}`, pts, ...(h ? { heightM: r1(h), from: 'height' } : lv > 0 ? { heightM: r1(lv * STOREY_GUESS_M), from: 'levels' } : { heightM: HEIGHT_GUESS_M, from: 'guess' }) })
    } else if (t.highway && ROAD_M[t.highway]) {
      const lanes = parseFloat(t.lanes ?? '')
      roads.push({ id: `osm-${e.id}`, pts, widthM: r1(metres(t.width) ?? (lanes > 0 ? lanes * 3.5 : ROAD_M[t.highway])), ...(t.name ? { name: t['name:en'] ?? t.name } : {}) })
    }
  }
  return { buildings, roads }
}

/**
 * OpenStreetMap's own `map.json` answer (the editing API's bounding-box read: nodes, then ways by node id) as Overpass
 * `out geom` ways, so siteFromOverpass reads both.
 */
export function waysFromOsmMap(json: { elements?: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Record<string, string> }[] }): { elements: OsmWay[] } {
  const els = json.elements ?? []
  const at = new Map(els.filter((e) => e.type === 'node').map((n) => [n.id, { lat: n.lat!, lon: n.lon! }]))
  return { elements: els.filter((e) => e.type === 'way').map((w) => ({ type: 'way', id: w.id, tags: w.tags, geometry: (w.nodes ?? []).flatMap((id) => at.get(id) ?? []) })) }
}

/**
 * Open-Meteo's archive answer (`daily=wind_speed_10m_mean,wind_direction_10m_dominant`) as the prevailing wind by month:
 * each day a vector (its speed, from its dominant direction), summed per month; direction = the sum's, speed = the mean,
 * steady = |sum| / Σ speed. null when a month has no day.
 */
export function windFromDaily(json: { daily?: { time: string[]; wind_speed_10m_mean: (number | null)[]; wind_direction_10m_dominant: (number | null)[] } }): WindMonth[] | null {
  const d = json.daily
  if (!d) return null
  const acc = Array.from({ length: 12 }, () => ({ u: 0, v: 0, s: 0, n: 0 }))
  d.time.forEach((t, i) => {
    const [s, dir] = [d.wind_speed_10m_mean[i], d.wind_direction_10m_dominant[i]]
    if (s == null || dir == null) return
    const a = acc[Number(t.slice(5, 7)) - 1]
    a.u += s * Math.sin(dir * RAD)
    a.v += s * Math.cos(dir * RAD)
    a.s += s
    a.n++
  })
  if (acc.some((a) => !a.n || !a.s)) return null
  return acc.map((a) => ({
    fromDeg: Math.round((Math.atan2(a.u, a.v) / RAD + 360) % 360),
    speedMs: Math.round((10 * a.s) / a.n) / 10,
    steady: Math.round((100 * Math.hypot(a.u, a.v)) / a.s) / 100,
  }))
}

/** A new site at the spot, nothing fetched yet. */
export const emptySite = (lat: number, lon: number): Site => ({ lat, lon, buildings: [], roads: [] })

/** A block's height typed by staff. */
export const setBlockHeight = (site: Site, id: Id, heightM: number): Site => ({
  ...site,
  buildings: site.buildings.map((b) => (b.id === id ? { ...b, heightM, from: 'typed' } : b)),
})

/** A block or a road taken away by staff. */
export const removeFromSite = (site: Site, id: Id): Site => ({ ...site, buildings: site.buildings.filter((b) => b.id !== id), roads: site.roads.filter((r) => r.id !== id) })

// ───────────────────────────── wind through the flat ─────────────────────────────

/** an opening whose outside faces within this of where the wind comes from takes it in (cos 60°) */
const INLET_COS = 0.5

export interface WindOpening {
  wallId: Id
  openingId: Id
  /** the opening's middle on the wall's centre line (plan m) */
  at: Pt
  /** unit normal from the room to the outside */
  out: Pt
  /** its width, sill and head heights (m) */
  widthM: number
  sillM: number
  headM: number
}

export interface RoomWind {
  roomId: Id
  /** outside openings facing within 60° of the wind */
  inlets: WindOpening[]
  /** outside openings facing away from it (90° or more): where it leaves */
  outlets: WindOpening[]
  /** both: the wind crosses the room */
  cross: boolean
}

/** a room the wind is shown through: not a zone, a balcony (open already) or a shaft */
const SKIP: RoomKind[] = ['balcony', 'shaft']
const outside = (r: Room | null) => !r || r.kind === 'balcony' || isOutdoor(r.kind)

/**
 * Which outside openings of each room take the wind from `fromDeg` (true bearing) and which let it out. "Outside" = the
 * wall's other side is no room, a balcony or an outdoor zone; a door into the next room does not count (a guide, not a
 * flow model: the room only).
 */
export function roomWind(unit: Unit, rooms: Room[], fromDeg: number): RoomWind[] {
  const from = bearingInPlan(unit.northDeg, fromDeg)
  const out: RoomWind[] = []
  for (const r of rooms) {
    if (SKIP.includes(r.kind) || isOutdoor(r.kind)) continue
    const rw: RoomWind = { roomId: r.id, inlets: [], outlets: [], cross: false }
    for (const id of new Set(r.wallIds)) {
      const w = unit.walls.find((x) => x.id === id)
      if (!w?.openings.length) continue
      const f = wallFrame(w, unit.vertices)
      for (const o of w.openings) {
        const u = o.offsetM + o.widthM / 2
        const at = { x: f.origin.x + f.dir.x * u, y: f.origin.y + f.dir.y * u }
        const off = w.thicknessM / 2 + 0.05
        const side = (s: number) => roomAt({ x: at.x + f.normal.x * off * s, y: at.y + f.normal.y * off * s }, rooms, unit)
        const [a, b] = [side(1), side(-1)]
        const s = a?.id === r.id ? -1 : b?.id === r.id ? 1 : 0 // toward the other side
        if (!s || !outside(s > 0 ? a : b)) continue
        const n = { x: f.normal.x * s, y: f.normal.y * s }
        const c = n.x * from.x + n.y * from.y
        const wo = { wallId: w.id, openingId: o.id, at, out: n, widthM: o.widthM, sillM: o.sillM, headM: o.sillM + o.heightM }
        if (c >= INLET_COS - 1e-9) rw.inlets.push(wo)
        else if (c <= 1e-9) rw.outlets.push(wo)
      }
    }
    rw.cross = rw.inlets.length > 0 && rw.outlets.length > 0
    if (rw.inlets.length || rw.outlets.length) out.push(rw)
  }
  return out
}

/** a block shelters a window when it stands this close upwind */
export const SHELTER_M = 30

/** Does segment ab cross segment cd (touching counts)? */
const meets = (a: Pt, b: Pt, c: Pt, d: Pt) => {
  const [d1, d2, d3, d4] = [cross(c, d, a), cross(c, d, b), cross(a, b, c), cross(a, b, d)]
  return d1 * d2 <= 0 && d3 * d4 <= 0
}

/**
 * Is the opening at `at` (plan) behind a neighbour block for the wind from `fromDeg`: a block within SHELTER_M upwind
 * (on the line from the opening toward the wind) whose top is above the flat's floor (floor k stands k × 3.2 m + 0.2 m
 * over the street, as the 3D does; no floor = 2). A plain rule: the block's whole height, no gaps, no wind round it.
 */
export function sheltered(unit: Unit, at: Pt, fromDeg: number, blocks = sitePlan(unit).buildings): boolean {
  const d = bearingInPlan(unit.northDeg, fromDeg)
  const end = { x: at.x + d.x * SHELTER_M, y: at.y + d.y * SHELTER_M }
  const floorM = (unit.floor ?? 2) * 3.2 + 0.2
  return blocks.some((b) => b.heightM > floorM && (pointInPolygon(end, b.plan) || b.plan.some((p, i) => meets(at, end, p, b.plan[(i + 1) % b.plan.length]))))
}

/** "N", "NE" … for a bearing. */
export const compassName = (deg: number): string => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((deg % 360) + 360) % 360) / 45) % 8]
