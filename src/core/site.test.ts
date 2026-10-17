/** The site's pure rules: the sun at a place and time, the map's answer in metres, the wind by month and through a room. */
import { describe, expect, test } from 'vitest'
import saved from '../data/fixtures/overpass-banani.json'
import { deriveRooms } from './graph'
import { roomWind, sheltered, siteFromOverpass, sitePlan, siteToPlan, sunAt, waysFromOsmMap, windFromDaily } from './site'
import type { Site, Unit } from './types'

/** a real Overpass answer round Banani, trimmed to 13 ways (heights, floors, none, roads, a footway) */
const osm = saved as unknown as { elements: { type: string; id: number; tags: Record<string, string>; geometry: { lat: number; lon: number }[] }[] }
const DHAKA = { lat: 23.81, lon: 90.41, utcOffsetH: 6 }

describe('sunAt', () => {
  test('Dhaka at noon: 21 June nearly overhead (≈ 89°), 21 December low in the south (≈ 43°)', () => {
    const june = sunAt(DHAKA, '2026-06-21', 12)
    const dec = sunAt(DHAKA, '2026-12-21', 12)
    expect(june.altDeg).toBeGreaterThan(88)
    expect(june.altDeg).toBeLessThan(90)
    expect(dec.altDeg).toBeCloseTo(42.8, 0)
    expect(dec.azDeg).toBeGreaterThan(175) // due south, a minute or so after the clock's noon
    expect(dec.azDeg).toBeLessThan(185)
  })

  test('morning in the east, afternoon in the west; under the horizon at night', () => {
    expect(sunAt(DHAKA, '2026-06-21', 9).azDeg).toBeGreaterThan(60)
    expect(sunAt(DHAKA, '2026-06-21', 9).azDeg).toBeLessThan(110)
    expect(sunAt(DHAKA, '2026-12-21', 15).azDeg).toBeGreaterThan(200)
    expect(sunAt(DHAKA, '2026-12-21', 15).azDeg).toBeLessThan(240)
    expect(sunAt(DHAKA, '2026-12-21', 22).altDeg).toBeLessThan(0)
    // no site: Dhaka, its clock from the longitude (UTC+6)
    expect(sunAt(undefined, '2026-06-21', 12).altDeg).toBeGreaterThan(88)
  })
})

/** a 4 m square room, a 1 m window in its top (plan-up) wall and one in its bottom wall */
const box = (): Unit => ({
  id: 'box',
  projectName: '',
  name: 'box',
  northDeg: 0,
  floor: 2,
  vertices: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 4, y: 0 },
    { id: 'c', x: 4, y: 4 },
    { id: 'd', x: 0, y: 4 },
  ],
  walls: [
    { id: 'top', a: 'a', b: 'b', thicknessM: 0.25, heightM: 3, openings: [{ id: 'wn', kind: 'window', offsetM: 1.5, widthM: 1, heightM: 1.2, sillM: 0.9 }] },
    { id: 'right', a: 'b', b: 'c', thicknessM: 0.25, heightM: 3, openings: [] },
    { id: 'bottom', a: 'c', b: 'd', thicknessM: 0.25, heightM: 3, openings: [{ id: 'ws', kind: 'window', offsetM: 1.5, widthM: 1, heightM: 1.2, sillM: 0.9 }] },
    { id: 'left', a: 'd', b: 'a', thicknessM: 0.25, heightM: 3, openings: [] },
  ],
  roomLabels: [{ id: 'bed', name: 'Bed', kind: 'bed', x: 2, y: 2 }],
  furniture: [],
  finishSlots: [],
  areaSqft: 172,
})

describe('site frame → plan', () => {
  test('plan-up is north by default; northDeg turns the site about the unit centre', () => {
    const u = box()
    expect(siteToPlan(u, { x: 10, y: 0 })).toEqual({ x: 12, y: 2 }) // 10 m east = plan right
    const p = siteToPlan({ ...u, northDeg: 90 }, { x: 0, y: -10 }) // north is plan-right: 10 m north lands right
    expect(p.x).toBeCloseTo(12)
    expect(p.y).toBeCloseTo(2)
  })
})

describe('siteFromOverpass (a saved Banani answer)', () => {
  const lat = 23.7903
  const lon = 90.4077
  const s = siteFromOverpass(osm, lat, lon)

  test('buildings: footprints in metres round the plot, heights from the tags, else floors × 3, else 9 m guessed', () => {
    expect(s.buildings.length).toBeGreaterThan(3)
    for (const b of s.buildings) {
      expect(b.pts.length).toBeGreaterThanOrEqual(3)
      for (const p of b.pts) expect(Math.hypot(p.x, p.y)).toBeLessThan(400)
      const tags = osm.elements.find((e) => `osm-${e.id}` === b.id)!.tags
      if (tags['building:levels']) expect(b).toMatchObject({ from: 'levels', heightM: 3 * parseFloat(tags['building:levels']) })
      else expect(b).toMatchObject({ from: 'guess', heightM: 9 })
    }
  })

  test('a height tag is taken when it fits its floors; one far off them (Banani: 60 m on 5 floors, 35 m on 3) gives way to the floors', () => {
    const sq = (d: number) => [{ lat: lat + d, lon: lon + d }, { lat: lat + d, lon: lon + d + 1e-4 }, { lat: lat + d + 1e-4, lon: lon + d + 1e-4 }, { lat: lat + d, lon: lon + d }]
    const way = (id: number, tags: Record<string, string>) => ({ type: 'way', id, tags: { building: 'yes', ...tags }, geometry: sq(id * 1e-3) })
    const t = siteFromOverpass({ elements: [way(1, { height: '18 m', 'building:levels': '6' }), way(2, { height: '12' }), way(3, { height: '60', 'building:levels': '5' })] }, lat, lon)
    expect(t.buildings.map((b) => [b.from, b.heightM])).toEqual([['height', 18], ['height', 12], ['levels', 15]])
    const kabir = s.buildings.find((b) => b.id === 'osm-' + osm.elements.find((e) => e.tags.height === '60')!.id)
    expect(kabir).toMatchObject({ from: 'levels', heightM: 15 })
  })

  test('the old house on the plot (a footprint round the plot point) is left out', () => {
    const around = [{ lat: lat - 1e-4, lon: lon - 1e-4 }, { lat: lat - 1e-4, lon: lon + 1e-4 }, { lat: lat + 1e-4, lon: lon + 1e-4 }, { lat: lat + 1e-4, lon: lon - 1e-4 }, { lat: lat - 1e-4, lon: lon - 1e-4 }]
    const t = siteFromOverpass({ elements: [...osm.elements, { type: 'way', id: 9, tags: { building: 'house' }, geometry: around }] }, lat, lon)
    expect(t.buildings.length).toBe(s.buildings.length)
    expect(t.buildings.some((b) => b.id === 'osm-9')).toBe(false)
  })

  test('roads: vehicle roads only (no footways), a width each', () => {
    expect(s.roads.length).toBeGreaterThan(0)
    const kinds = new Map(osm.elements.map((e) => [`osm-${e.id}`, e.tags.highway]))
    for (const r of s.roads) {
      expect(['footway', 'path', 'steps', 'cycleway']).not.toContain(kinds.get(r.id))
      expect(r.widthM).toBeGreaterThan(2)
    }
  })

  test('one degree of latitude ≈ 111 km: a point 0.001° north is ≈ 111 m up (y south is negative)', () => {
    const one = siteFromOverpass({ elements: [{ type: 'way', id: 1, tags: { highway: 'residential' }, geometry: [{ lat, lon }, { lat: lat + 0.001, lon: lon + 0.001 }] }] }, lat, lon)
    const [p0, p1] = one.roads[0].pts
    expect(p0).toEqual({ x: 0, y: 0 })
    expect(p1.y).toBeCloseTo(-111.3, 0)
    expect(p1.x).toBeCloseTo(111.3 * Math.cos((lat * Math.PI) / 180), 0)
  })
})

describe('waysFromOsmMap (the fallback: OpenStreetMap own box read)', () => {
  test('ways get their nodes as points, so the same reader takes them; a node outside the box is skipped', () => {
    const ways = waysFromOsmMap({
      elements: [
        { type: 'node', id: 1, lat: 23.79, lon: 90.4 },
        { type: 'node', id: 2, lat: 23.791, lon: 90.4 },
        { type: 'way', id: 7, nodes: [1, 2, 3], tags: { highway: 'residential' } },
      ],
    })
    expect(ways.elements).toEqual([{ type: 'way', id: 7, tags: { highway: 'residential' }, geometry: [{ lat: 23.79, lon: 90.4 }, { lat: 23.791, lon: 90.4 }] }])
    expect(siteFromOverpass(ways, 23.79, 90.4).roads[0].pts[1].y).toBeCloseTo(-111.3, 0)
  })
})

describe('windFromDaily', () => {
  test('a month of days from the east at 2 m/s: from 90°, 2 m/s, steady 1; a month of opposite days: steady 0', () => {
    const time: string[] = []
    const speed: number[] = []
    const dir: number[] = []
    for (let m = 1; m <= 12; m++)
      for (let d = 1; d <= 4; d++) {
        time.push(`2024-${String(m).padStart(2, '0')}-0${d}`)
        speed.push(2)
        dir.push(m === 7 ? (d % 2 ? 0 : 180) : 90)
      }
    const w = windFromDaily({ daily: { time, wind_speed_10m_mean: speed, wind_direction_10m_dominant: dir } })!
    expect(w[0]).toEqual({ fromDeg: 90, speedMs: 2, steady: 1 })
    expect(w[6].steady).toBe(0)
    expect(windFromDaily({})).toBeNull()
  })
})

describe('roomWind', () => {
  const u = box()
  const rooms = deriveRooms(u)

  test('wind from the south: in at the bottom window, out at the top one — cross ventilation', () => {
    const [r] = roomWind(u, rooms, 180)
    expect(r.inlets.map((o) => o.openingId)).toEqual(['ws'])
    expect(r.outlets.map((o) => o.openingId)).toEqual(['wn'])
    expect(r.cross).toBe(true)
    expect(r.inlets[0].out.y).toBeCloseTo(1) // its outside faces plan-down = south
  })

  test('wind from the east: both windows side-on, nothing comes in — no cross ventilation', () => {
    const [r] = roomWind(u, rooms, 90)
    expect(r.inlets).toEqual([])
    expect(r.cross).toBe(false)
  })

  test('within 60° takes the wind in (from 235° the south window still does, from 245° no longer)', () => {
    expect(roomWind(u, rooms, 235)[0].inlets.length).toBe(1)
    expect(roomWind(u, rooms, 245)[0].inlets.length).toBe(0)
  })

  test('true north turned to plan-right: the wind from the east comes in at the bottom window', () => {
    const [r] = roomWind({ ...u, northDeg: 90 }, rooms, 90) // north = plan-right, so east = plan-down
    expect(r.inlets.map((o) => o.openingId)).toEqual(['ws'])
  })
})

describe('sitePlan', () => {
  test('a neighbour reaching onto the drawing (the old house, a block the map puts on the plot) is left out; one 20 m off stays', () => {
    const sq = (x: number, y: number, s = 4) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
    const site: Site = { lat: 23.79, lon: 90.4, roads: [], buildings: [{ id: 'on', heightM: 9, from: 'guess', pts: sq(1, 1) }, { id: 'edge', heightM: 9, from: 'guess', pts: sq(2.5, -1) }, { id: 'off', heightM: 9, from: 'guess', pts: sq(20, 0) }] }
    expect(sitePlan({ ...box(), site }).buildings.map((b) => b.id)).toEqual(['off'])
  })
})

describe('sheltered', () => {
  const site = (dy: number, heightM: number): Site => ({
    lat: 23.79,
    lon: 90.4,
    roads: [],
    buildings: [{ id: 'k', heightM, from: 'typed', pts: [{ x: -10, y: dy }, { x: 10, y: dy }, { x: 10, y: dy + 10 }, { x: -10, y: dy + 10 }] }],
  })
  const at = { x: 2, y: 4 } // the bottom (south) window

  test('a block 20 m south, taller than floor 2, shelters the south window from a south wind; a low one does not', () => {
    expect(sheltered({ ...box(), site: site(20, 30) }, at, 180)).toBe(true)
    expect(sheltered({ ...box(), site: site(20, 6) }, at, 180)).toBe(false) // 6 m < floor 2's 6.6 m
  })

  test('farther than 30 m, or downwind: no shelter', () => {
    expect(sheltered({ ...box(), site: site(40, 30) }, at, 180)).toBe(false)
    expect(sheltered({ ...box(), site: site(20, 30) }, at, 0)).toBe(false)
  })
})
