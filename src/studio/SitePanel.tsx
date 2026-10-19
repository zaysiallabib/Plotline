/**
 * Top bar → Site (founder 2026-10-18): where the building stands. Type an address (OpenStreetMap's Nominatim, one request)
 * or "lat, lon" → a map picture (3 × 3 OpenStreetMap tiles); click the plot → the buildings and roads within 250 m
 * (Overpass) and the wind by month (Open-Meteo), fetched ONCE and saved on the drawing (Unit.site): the 3D, a buyer link
 * and the Building view never fetch. All free, no key, no card. A block or road clicked on the map: type its height or
 * delete it. True north is the drawing's own (Unit.northDeg): the arrow on the plan (NorthArrow) or typed here.
 */
import { useRef, useState } from 'react'
import * as core from '../core'
import type { Pt, Site, Unit } from '../core'

const Z = 18
const TILE = 256
/** the 768 px tile grid is shown this much smaller */
const SHOW = 0.625
const RAD = Math.PI / 180
/**
 * the free map query server; when it does not answer within 20 s, OpenStreetMap's own read of the box round the plot (one
 * request). TEMPORARY: that editing-API read is against OpenStreetMap's usage policy for read-only use ("to edit the map
 * data, not for read-only purposes") — replace it with a second Overpass mirror, or Geofabrik's Bangladesh extract served
 * from our own files (Docs/SOURCES.md §4, row 1).
 */
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const OSM_MAP = 'https://api.openstreetmap.org/api/0.6/map.json'
export const RADIUS_M = 250

/** web-mercator pixels at zoom Z */
const toPx = (lat: number, lon: number): Pt => {
  const n = TILE * 2 ** Z
  const s = Math.sin(lat * RAD)
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n }
}
const toLatLon = (p: Pt) => {
  const n = TILE * 2 ** Z
  return { lat: Math.atan(Math.sinh(Math.PI * (1 - (2 * p.y) / n))) / RAD, lon: (p.x / n) * 360 - 180 }
}
/** metres per map pixel at a latitude */
const mpp = (lat: number) => (Math.cos(lat * RAD) * 2 * Math.PI * 6378137) / (TILE * 2 ** Z)

/** "23.79, 90.41" (or with a space) → the spot; anything else → null (an address) */
export function parseLatLon(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const [lat, lon] = [Number(m[1]), Number(m[2])]
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

/** The buildings and roads (Overpass, else OpenStreetMap's own box read) and the wind (Open-Meteo) at the plot, once; what failed is said in `problems`. */
export async function fetchSite(lat: number, lon: number): Promise<{ site: Site; problems: string[] }> {
  ;[lat, lon] = [Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6] // a decimetre
  const q = `[out:json][timeout:60];(way["building"](around:${RADIUS_M},${lat},${lon});way["highway"](around:${RADIUS_M},${lat},${lon}););out geom;`
  const year = new Date().getFullYear()
  const meteo = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${year - 10}-01-01&end_date=${year - 1}-12-31&daily=wind_speed_10m_mean,wind_direction_10m_dominant,temperature_2m_mean,relative_humidity_2m_mean&wind_speed_unit=ms&timezone=auto`
  const dLat = RADIUS_M / 111320
  const dLon = dLat / Math.cos(lat * RAD)
  const box = [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(',')
  const [osm, wind] = await Promise.all([
    (async () => {
      try {
        const r = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: q }), signal: AbortSignal.timeout(20000) })
        const j = r.ok ? await r.json() : null
        if (j && !/error/i.test(j.remark ?? '')) return j // a busy server answers 200 with "runtime error: … timed out" and nothing
      } catch {
        /* busy or unreachable: the other source */
      }
      try {
        const r = await fetch(`${OSM_MAP}?bbox=${box}`, { signal: AbortSignal.timeout(30000) })
        return r.ok ? core.waysFromOsmMap(await r.json()) : null
      } catch {
        return null
      }
    })(),
    fetch(meteo)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ])
  const problems: string[] = []
  if (!osm) problems.push('the map server did not answer: no buildings or roads — try Fetch again in a minute')
  const months = wind && core.windFromDaily(wind)
  if (!months) problems.push('the wind server did not answer: the Dhaka wind table is used')
  const site: Site = {
    ...core.emptySite(lat, lon),
    ...(osm ? core.siteFromOverpass(osm, lat, lon) : {}),
    ...(months ? { wind: months } : {}),
    ...(typeof wind?.utc_offset_seconds === 'number' ? { utcOffsetH: wind.utc_offset_seconds / 3600 } : {}),
    fetchedAt: new Date().toISOString(),
  }
  return { site, problems }
}

const FROM: Record<core.SiteBuilding['from'], string> = {
  height: "the map's height",
  levels: "the map's floor count × 3 m",
  guess: 'guessed: the map has no height (3 floors)',
  typed: 'typed here',
}

interface Props {
  unit: Unit
  onSite: (site: Site | undefined) => void
  onNorth: (deg: number) => void
  onClose: () => void
}

export function SitePanel({ unit, onSite, onNorth, onClose }: Props) {
  const site = unit.site
  const [query, setQuery] = useState('')
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(site ? { lat: site.lat, lon: site.lon } : null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<string | null>(null)

  const find = async () => {
    const ll = parseLatLon(query)
    if (ll) return setCenter(ll), setStatus('Click your plot on the map')
    if (!query.trim()) return
    setBusy(true)
    setStatus('Looking for it…')
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query.trim())}`)
      const [hit] = r.ok ? ((await r.json()) as { lat: string; lon: string; display_name: string }[]) : []
      if (!hit) return setStatus('Not found — try another spelling, or paste "lat, lon" (in Google Maps: right-click the plot)')
      setCenter({ lat: Number(hit.lat), lon: Number(hit.lon) })
      setStatus(`Found ${hit.display_name}. Click your plot on the map.`)
    } catch {
      setStatus('The address server did not answer — paste "lat, lon" instead')
    } finally {
      setBusy(false)
    }
  }

  const pick = async (lat: number, lon: number) => {
    setBusy(true)
    setSel(null)
    setStatus('Getting the buildings, roads and wind round the plot…')
    const { site: s, problems } = await fetchSite(lat, lon)
    setBusy(false)
    onSite(s)
    setStatus(problems.length ? `Plot set, but ${problems.join('; ')}.` : `Plot set: ${s.buildings.length} buildings and ${s.roads.length} roads within ${RADIUS_M} m, the wind by month. Saved with the drawing.`)
  }

  // the map: 3 × 3 tiles round the spot's tile, origin = the grid's top-left in map pixels
  const c = center && toPx(center.lat, center.lon)
  const tx = c ? Math.floor(c.x / TILE) - 1 : 0
  const ty = c ? Math.floor(c.y / TILE) - 1 : 0
  const scr = (p: Pt): Pt => ({ x: (p.x - tx * TILE) * SHOW, y: (p.y - ty * TILE) * SHOW })
  const plot = site && toPx(site.lat, site.lon)
  /** a site point (m east / south of the plot) on the map picture */
  const fromSite = (q: Pt) => scr({ x: plot!.x + q.x / mpp(site!.lat), y: plot!.y + q.y / mpp(site!.lat) })
  const pts = (ps: Pt[]) => ps.map((q) => { const p = fromSite(q); return `${p.x.toFixed(1)},${p.y.toFixed(1)}` }).join(' ') // prettier-ignore
  // the drawing on the plot, turned by its north: plan → site frame (the inverse of core.siteToPlan)
  const anchor = core.siteAnchor(unit)
  const [cs, sn] = [Math.cos(unit.northDeg * RAD), Math.sin(unit.northDeg * RAD)]
  const toSite = (p: Pt): Pt => ({ x: (p.x - anchor.x) * cs + (p.y - anchor.y) * sn, y: -(p.x - anchor.x) * sn + (p.y - anchor.y) * cs })
  const vs = new Map(unit.vertices.map((v) => [v.id, v]))
  const block = site?.buildings.find((b) => b.id === sel)
  /** the neighbours the 3D draws (one on the drawing's own spot is left out) */
  const kept = new Set(core.sitePlan(unit).buildings.map((b) => b.id))
  const road = site?.roads.find((r) => r.id === sel)

  return (
    <div className="popover project site" onKeyDown={(e) => e.stopPropagation()}>
      <div className="head">
        <strong>Site · where the building stands</strong>
        <button className="link" title="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <form
        className="site-find"
        onSubmit={(e) => {
          e.preventDefault()
          void find()
        }}
      >
        <input value={query} placeholder='Address, or "lat, lon"' onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={busy}>
          Find
        </button>
      </form>
      {c && (
        <div
          className="site-map"
          style={{ width: 3 * TILE * SHOW, height: 3 * TILE * SHOW }}
          onClick={(e) => {
            if (busy) return
            if (site && !window.confirm('Move the plot here? Its blocks, roads and wind are fetched again (typed heights and deletions are lost).')) return
            const r = e.currentTarget.getBoundingClientRect()
            const ll = toLatLon({ x: tx * TILE + (e.clientX - r.left) / SHOW, y: ty * TILE + (e.clientY - r.top) / SHOW })
            void pick(ll.lat, ll.lon)
          }}
        >
          {[0, 1, 2].flatMap((j) => [0, 1, 2].map((i) => <img key={`${i}${j}`} alt="" draggable={false} src={`https://tile.openstreetmap.org/${Z}/${tx + i}/${ty + j}.png`} style={{ left: i * TILE * SHOW, top: j * TILE * SHOW, width: TILE * SHOW, height: TILE * SHOW }} />))}
          <svg width={3 * TILE * SHOW} height={3 * TILE * SHOW}>
            {site && plot && (
              <>
                {site.roads.map((r) => (
                  <polyline key={r.id} className={`site-road${sel === r.id ? ' on' : ''}`} points={pts(r.pts)} strokeWidth={Math.max(3, (r.widthM / mpp(site.lat)) * SHOW)} onClick={(e) => (e.stopPropagation(), setSel(r.id))}>
                    <title>{`${r.name ?? 'Road'}, ${r.widthM} m wide`}</title>
                  </polyline>
                ))}
                {site.buildings.map((b) => (
                  <polygon key={b.id} className={`site-block${b.from === 'guess' ? ' guess' : ''}${kept.has(b.id) ? '' : ' gone'}${sel === b.id ? ' on' : ''}`} points={pts(b.pts)} onClick={(e) => (e.stopPropagation(), setSel(b.id))}>
                    <title>{kept.has(b.id) ? `${b.heightM} m high — ${FROM[b.from]}` : 'Stands where your drawing is: left out of the 3D'}</title>
                  </polygon>
                ))}
                {unit.walls.map((w) => {
                  const [a, b] = [fromSite(toSite(vs.get(w.a)!)), fromSite(toSite(vs.get(w.b)!))]
                  return <line key={w.id} className="site-flat" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                })}
                {(() => {
                  const p = scr(plot)
                  return <circle className="site-plot" cx={p.x} cy={p.y} r={5} />
                })()}
              </>
            )}
          </svg>
        </div>
      )}
      {c && (
        <div className="muted small">
          Map ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>
          {site ? ' · grey: blocks (dashed: height guessed), dark: roads, gold: your drawing — click one to change it' : ''}
        </div>
      )}
      {status && <p>{status}</p>}
      {block && (
        <div className="site-sel">
          <span>Block · {FROM[block.from]}</span>
          <label className="row">
            Height (m)
            <input
              type="number"
              min={1}
              step={0.5}
              value={block.heightM}
              onChange={(e) => Number(e.target.value) > 0 && onSite(core.setBlockHeight(site!, block.id, Number(e.target.value)))}
            />
          </label>
          <button onClick={() => (onSite(core.removeFromSite(site!, block.id)), setSel(null))}>Delete block</button>
        </div>
      )}
      {road && (
        <div className="site-sel">
          <span>
            {road.name ?? 'Road'} · {road.widthM} m wide
          </span>
          <button onClick={() => (onSite(core.removeFromSite(site!, road.id)), setSel(null))}>Delete road</button>
        </div>
      )}
      <label className="row">
        True north (°)
        <input type="number" step={1} value={Math.round(unit.northDeg)} onChange={(e) => onNorth(((Number(e.target.value) % 360) + 360) % 360)} />
      </label>
      <p className="muted">Drag the arrow on the plan until it points where the sheet's own north arrow points (0° = up the page).</p>
      {site && (
        <>
          <p className="muted">
            Plot {site.lat.toFixed(5)}, {site.lon.toFixed(5)} · {site.buildings.length} blocks · {site.roads.length} roads · wind: {site.wind ? 'Open-Meteo, this spot' : 'the Dhaka table'} · fetched {site.fetchedAt ? new Date(site.fetchedAt).toLocaleDateString('en-CA') : '—'}
          </p>
          <div className="actions">
            <button disabled={busy} onClick={() => void pick(site.lat, site.lon)} title="Fetch the buildings, roads and wind again (your deletions and typed heights are lost)">
              Fetch again
            </button>
            <button onClick={() => (onSite(undefined), setSel(null), setStatus('Site removed: the 3D shows a made-up street again'))}>Remove site</button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * True north on the plan (the Site panel open): a long arrow from a dot, pointing at north. Drag the arrow (anywhere on
 * it) to turn it till it lies along the sheet's own north arrow; drag the dot to move it over that arrow. Whole degrees.
 */
export function NorthArrow({ northDeg, width, height, onChange }: { northDeg: number; width: number; height: number; onChange: (deg: number) => void }) {
  const ref = useRef<SVGSVGElement>(null)
  const [at, setAt] = useState<Pt | null>(null)
  const drag = useRef<'turn' | 'move' | null>(null)
  const o = at ?? { x: width / 2, y: height / 2 }
  const L = 0.3 * Math.min(width, height)
  const move = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const p = { x: e.clientX - r.left, y: e.clientY - r.top }
    if (drag.current === 'move') setAt(p)
    else if (drag.current === 'turn') onChange(((Math.round(Math.atan2(p.x - o.x, -(p.y - o.y)) / RAD) % 360) + 360) % 360)
  }
  const grab = (kind: 'turn' | 'move') => (e: React.PointerEvent) => {
    e.stopPropagation()
    drag.current = kind
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const end = () => void (drag.current = null)
  return (
    <svg ref={ref} className="north-arrow">
      <g transform={`translate(${o.x} ${o.y}) rotate(${northDeg})`} onPointerDown={grab('turn')} onPointerMove={move} onPointerUp={end} className="turn">
        <title>True north — drag to turn</title>
        <line x1={0} y1={0} x2={0} y2={-L} className="grip" />
        <line x1={0} y1={0} x2={0} y2={-L} className="shaft" />
        <path d={`M0 ${-L - 18} L10 ${-L + 4} L0 ${-L - 2} L-10 ${-L + 4} Z`} className="head" />
        <text x={0} y={-L - 24} textAnchor="middle" transform={`rotate(${-northDeg} 0 ${-L - 28})`}>
          N {Math.round(northDeg)}°
        </text>
      </g>
      <circle cx={o.x} cy={o.y} r={9} className="dot" onPointerDown={grab('move')} onPointerMove={move} onPointerUp={end}>
        <title>Drag to move the arrow</title>
      </circle>
    </svg>
  )
}
