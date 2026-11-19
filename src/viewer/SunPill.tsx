/**
 * Sun & wind, bottom centre (session 30). Closed: a slim pill — the time, the month and a small compass; a click opens the
 * card. Open: one glass card — the compass rose on the left (true north as you look now: the top of the rose is straight
 * ahead; with Wind on, one slim spoke per month toward where its wind comes FROM, a click on one picks it), the time large
 * with its part of the day, the day, Lights and Wind; the hour slider over the site's own day (night, dawn, day, dusk,
 * from the sun's height at each hour); the twelve months as buttons; with Wind on the month in words and its season. The
 * sun is drawn where it stands at the site on that day and hour (PlotlineScene.setTimeOfDay); the wind is the date's month.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as core from '../core'
import type { Room, Site, Unit, WindMonth } from '../core'
import type { PlotlineScene } from '../three/PlotlineScene'

interface Props {
  scene: PlotlineScene
  /** the card open (true) or the pill (false) */
  open: boolean
  onOpen: () => void
  hour: number
  /** YYYY-MM-DD */
  date: string
  northDeg: number
  /** the site's sun for the slider's day colours (undefined: Dhaka) */
  site: Site | undefined
  onChange: (hour: number) => void
  /** the flat's lamps shown on (render.ts lightsOn), and whether that is the automatic choice; a click flips them */
  lights: boolean
  lightsAuto: boolean
  onLights: () => void
  onDate: (date: string) => void
  wind: boolean
  onWind: () => void
  /** the month picked (0 = January), the twelve months' wind, Wind on: its line in words, its season's note, where it comes from */
  month: number
  months: WindMonth[]
  onMonth: (m: number) => void
  windLine: string
  windNote: string | null
  windSource: string
}

export const period = (h: number) => (h < 5 || h >= 21 ? 'night' : h < 11 ? 'morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : 'evening')
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** the hour marks under the slider: where (hour) and what */
const MARKS: [number, string][] = [
  [0, '0'],
  [6, '6'],
  [12, 'noon'],
  [18, '18'],
  [24, '24'],
]

/** the sky's colour for the sun at this height (°): night, twilight, golden hour, day — the slider's track */
const SKY: [number, [number, number, number]][] = [
  [-8, [38, 43, 61]],
  [-2, [92, 84, 114]],
  [4, [212, 146, 94]],
  [16, [233, 213, 166]],
]
export function skyColor(altDeg: number): string {
  const i = SKY.findIndex(([a]) => altDeg < a)
  if (i === 0) return `rgb(${SKY[0][1].join(', ')})`
  if (i < 0) return `rgb(${SKY[SKY.length - 1][1].join(', ')})`
  const [[a0, c0], [a1, c1]] = [SKY[i - 1], SKY[i]]
  const t = (altDeg - a0) / (a1 - a0)
  return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * t)).join(', ')})`
}
/** the day at the site as a CSS gradient, one stop per hour 0–24 */
export const dayGradient = (site: Site | undefined, date: string): string =>
  `linear-gradient(90deg, ${Array.from({ length: 25 }, (_, h) => `${skyColor(core.sunAt(site, date, h).altDeg)} ${((h / 24) * 100).toFixed(2)}%`).join(', ')})`

/**
 * Where true north is as you look now, degrees clockwise from straight ahead (the top of the rose): the camera's
 * horizontal direction (dx, dz in the plan: x, y) against the plan's north (northDeg, clockwise from plan-up).
 */
export const roseTurn = (northDeg: number, dx: number, dz: number): number => {
  const heading = (Math.atan2(dx, -dz) * 180) / Math.PI
  return ((((northDeg - heading) % 360) + 360) % 360)
}

/** the rose's own frame: a 2C box, the ring at R */
const C = 90
const R = 70

/**
 * The spoke (centre → tip, the rose's own units) running nearest the point, within `reach`; -1 = none. Months blowing
 * from nearly the same way lie on top of each other (Dhaka: Nov–Jan NW, May–Sep SSE): the click goes to the line under
 * the pointer, not to the month drawn last (bug hunt 2026-10-18: January's line picked December).
 */
export function nearestSpoke(p: { x: number; y: number }, tips: { x: number; y: number }[], reach = 6): number {
  let best = -1
  let bd = reach
  tips.forEach((t, i) => {
    const dx = t.x - C, dy = t.y - C
    const k = Math.max(0, Math.min(1, ((p.x - C) * dx + (p.y - C) * dy) / (dx * dx + dy * dy || 1)))
    const d = Math.hypot(p.x - C - k * dx, p.y - C - k * dy)
    if (d < bd) (bd = d), (best = i)
  })
  return best
}

/** a point `r` out from the centre toward bearing `deg` (clockwise from the rose's north, which is up inside the turned group) */
const at = (deg: number, r: number) => ({ x: C + Math.sin((deg * Math.PI) / 180) * r, y: C - Math.cos((deg * Math.PI) / 180) * r })

/**
 * The compass rose, turned so its north is true north as you look now (the top = straight ahead), kept turning with the
 * camera by one cheap DOM write when the heading changes (no React render). `wind`: the month spokes (a click picks one).
 */
function Rose({ scene, northDeg, size, wind }: { scene: PlotlineScene; northDeg: number; size: number; wind?: { months: WindMonth[]; month: number; onMonth: (m: number) => void } }) {
  const g = useRef<SVGGElement>(null)
  const letters = useRef<(SVGTextElement | null)[]>([])
  const turn = useRef(0)
  useEffect(() => {
    const d = new THREE.Vector3()
    let raf = 0
    let last = NaN
    const tick = () => {
      scene.camera.getWorldDirection(d)
      if (Math.hypot(d.x, d.z) > 1e-3) {
        const a = Math.round(roseTurn(northDeg, d.x, d.z) * 2) / 2
        if (a !== last) {
          last = turn.current = a
          g.current?.setAttribute('transform', `rotate(${a} ${C} ${C})`)
          letters.current.forEach((el, k) => {
            const p = at(a + k * 90, R + 13)
            el?.setAttribute('x', p.x.toFixed(1))
            el?.setAttribute('y', p.y.toFixed(1))
          })
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scene, northDeg, wind !== undefined])
  /** the pill's tiny one: ring and needle only */
  const mini = size < 40
  /** the letters about 9.5 px on screen whatever the rose's size */
  const fs = (9.5 * (2 * C + 12)) / size
  const top = wind ? Math.max(4, Math.ceil(Math.max(...wind.months.map((m) => m.speedMs)))) : 0
  const tip = (m: WindMonth) => at(m.fromDeg, (R * m.speedMs) / (top || 1))
  const pick = wind && tip(wind.months[wind.month])
  return (
    <svg
      className={`rose${wind ? ' rose-wind' : ''}${mini ? ' mini' : ''}`}
      width={size}
      height={size}
      viewBox={`-6 -6 ${2 * C + 12} ${2 * C + 12}`}
      aria-label="compass: north as you look now"
      onClick={
        wind &&
        ((e) => {
          // the click in the rose's own frame, turned back by the rose's turn, then the nearest month's line
          const b = e.currentTarget.getBoundingClientRect()
          const [x, y] = [((e.clientX - b.left) / b.width) * (2 * C + 12) - 6 - C, ((e.clientY - b.top) / b.height) * (2 * C + 12) - 6 - C]
          const a = (-turn.current * Math.PI) / 180
          const i = nearestSpoke({ x: C + x * Math.cos(a) - y * Math.sin(a), y: C + x * Math.sin(a) + y * Math.cos(a) }, wind.months.map(tip), 9)
          if (i >= 0) wind.onMonth(i)
        })
      }
    >
      <title>{wind ? 'True north as you look now. Each line: a month, toward where its wind comes from; rings 1 m/s apart. Click a line to pick its month.' : 'True north as you look now (the top is straight ahead)'}</title>
      <circle className="face" cx={C} cy={C} r={R + 4} />
      <g ref={g}>
        {Array.from({ length: top }, (_, k) => (
          <circle key={k} className="ring" cx={C} cy={C} r={(R * (k + 1)) / top} />
        ))}
        {!mini && Array.from({ length: 16 }, (_, k) => {
          const [a, b] = [at(k * 22.5, R - (k % 4 ? 5 : 10)), at(k * 22.5, R + 4)]
          return <line key={k} className={`tick${k % 4 ? '' : ' major'}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        {wind ? (
          <>
            {wind.months.map((m, i) => {
              const p = tip(m)
              return (
                <g key={i} className="hit">
                  <title>{`${MONTHS[i]} · ${core.point16(m.fromDeg)} · ${m.speedMs} m/s`}</title>
                  <line x1={C} y1={C} x2={p.x} y2={p.y} className="grab" />
                  {i !== wind.month && <line x1={C} y1={C} x2={p.x} y2={p.y} className="spoke" />}
                </g>
              )
            })}
            <line x1={C} y1={C} x2={pick!.x} y2={pick!.y} className="spoke on" />
            <circle cx={pick!.x} cy={pick!.y} r={5} className="spoke-end" />
          </>
        ) : (
          <>
            <polygon className="needle-s" points={`${C - (mini ? 16 : 9)},${C} ${C + (mini ? 16 : 9)},${C} ${C},${C + (mini ? 62 : 52)}`} />
            <polygon className="needle-n" points={`${C - (mini ? 16 : 9)},${C} ${C + (mini ? 16 : 9)},${C} ${C},${C - (mini ? 62 : 52)}`} />
          </>
        )}
        {!mini && <circle className="hub" cx={C} cy={C} r={wind ? 4 : 6} />}
      </g>
      {!mini && ['N', 'E', 'S', 'W'].map((t, k) => {
        const p = at(k * 90, R + 13)
        return (
          <text key={t} ref={(el) => void (letters.current[k] = el)} className={k ? 'cardinal' : 'cardinal north'} fontSize={fs} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
            {t}
          </text>
        )
      })}
    </svg>
  )
}

const SunMark = () => (
  <svg className="sun-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="3.2" />
    {Array.from({ length: 8 }, (_, k) => {
      const a = (k * Math.PI) / 4
      return <line key={k} x1={8 + Math.cos(a) * 5.2} y1={8 + Math.sin(a) * 5.2} x2={8 + Math.cos(a) * 7} y2={8 + Math.sin(a) * 7} />
    })}
  </svg>
)

export default function SunPill(p: Props) {
  if (!p.open)
    return (
      <button className="glass sun-pill" title="Sun & wind: the day, the hour, the lights, the wind" onClick={p.onOpen}>
        <SunMark />
        <span className="sun-time">{hhmm(p.hour)}</span>
        <span className="muted">{MONTHS[p.month].slice(0, 3)}</span>
        {p.wind && <span className="wind-on">Wind</span>}
        <Rose scene={p.scene} northDeg={p.northDeg} size={26} />
      </button>
    )
  const w = p.months[p.month]
  return (
    <div className={`glass sun-card${p.wind ? ' with-wind' : ''}`}>
      <Rose scene={p.scene} northDeg={p.northDeg} size={p.wind ? 124 : 72} wind={p.wind ? { months: p.months, month: p.month, onMonth: p.onMonth } : undefined} />
      <div className="sun-body">
        <div className="sun-head">
          <div className="sun-clock">
            <span className="sun-time big">{hhmm(p.hour)}</span>
            <span className="muted">{period(p.hour)}</span>
          </div>
          <input type="date" className="sun-date" value={p.date} onChange={(e) => e.target.value && p.onDate(e.target.value)} aria-label="day" title="The day the sun (and the wind's month) is shown for" />
          <span className="grow" />
          <button
            className={`pill-btn${p.lights ? ' on' : ''}`}
            aria-pressed={p.lights}
            onClick={p.onLights}
            title={`The flat's lights are ${p.lights ? 'on' : 'off'}${p.lightsAuto ? ' (automatic: on while the sun is down)' : ' (your choice; click again for automatic)'}`}
          >
            Lights
          </button>
          <button className={`pill-btn${p.wind ? ' on' : ''}`} aria-pressed={p.wind} onClick={p.onWind} title="The wind through the flat this month: where it comes in and where it goes out (P)">
            Wind
          </button>
          <button className="x" aria-label="Close Sun & wind" title="Close (Esc)" onClick={p.onOpen}>
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="sun-track" style={{ '--day': dayGradient(p.site, p.date) } as React.CSSProperties}>
          <input type="range" min={0} max={24} step={0.25} value={p.hour} onChange={(e) => p.onChange(Number(e.target.value))} aria-label="time of day" aria-valuetext={`${hhmm(p.hour)}, ${period(p.hour)}`} />
          <div className="sun-marks" aria-hidden="true">
            {MARKS.map(([h, t]) => (
              <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="months" role="group" aria-label="month">
          {MONTHS.map((m, i) => (
            <button key={m} className={i === p.month ? 'on' : ''} aria-pressed={i === p.month} title={m} onClick={() => p.onMonth(i)}>
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
        {p.wind && (
          <div className="wind-line">
            <div className="wind-words">
              {p.windLine}
              {p.windNote && <span className="muted"> · {p.windNote}</span>}
            </div>
            <div className="muted small">
              {w.steady < 0.5 ? 'It turns a lot this month: no steady direction. ' : ''}
              {p.windSource}. A guide, not a wind simulation.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Wind on, walking: a quiet chip at each opening of the room where the wind comes in ("Wind in · SSE") and at the one it
 * leaves by ("Out"), floating just over the opening's head, kept on it as the walker moves (projected every frame).
 */
export function WindChips({ scene, unit, room, rw, fromDeg }: { scene: PlotlineScene; unit: Unit; room: Room; rw: core.RoomWind | undefined; fromDeg: number }) {
  const els = useRef<(HTMLDivElement | null)[]>([])
  const chips = rw ? [...rw.inlets.map((o) => ({ o, text: `Wind in · ${core.point16(fromDeg)}` })), ...(rw.exit ? [{ o: rw.exit, text: 'Out' }] : [])] : []
  const at = chips.map(({ o }) => {
    const x = o.at.x - o.out.x * 0.3
    const z = o.at.y - o.out.y * 0.3
    return new THREE.Vector3(x, core.roomLevelAt(room, unit, x, z) + Math.min(o.headM, 2.3) + 0.12, z)
  })
  useEffect(() => {
    const v = new THREE.Vector3()
    let raf = 0
    const tick = () => {
      at.forEach((p, i) => {
        const el = els.current[i]
        if (!el) return
        v.copy(p).project(scene.camera)
        const shown = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
        el.style.display = shown ? '' : 'none'
        if (shown) el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px) translate(-50%, -100%)`
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  })
  return (
    <div className="pin-layer">
      {chips.map((c, i) => (
        <div key={c.o.openingId + c.text} ref={(el) => void (els.current[i] = el)} className={`glass wind-chip${c.text === 'Out' ? ' out' : ''}`}>
          {c.text}
        </div>
      ))}
    </div>
  )
}
