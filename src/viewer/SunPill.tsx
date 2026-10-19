/**
 * Bottom-centre sun bar: the compass (turned by northDeg), the day at its left end, the time of day — a sun mark and the
 * 00:00–24:00 slider (15-min steps) with its hour marks — and its label, Lights and Wind at its right end. Wind on: a thin line above
 * it, the twelve months (a click picks one) and the month in words with its season ("June · monsoon · steady
 * south-south-east breeze, 3.5 m/s · hot and humid …"), and Rose (the wind rose, small, bottom left; remembered). The sun is
 * drawn where it stands at the site on that day and hour (PlotlineScene.setTimeOfDay); the wind is the date's month.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as core from '../core'
import type { Room, Unit, WindMonth } from '../core'
import type { PlotlineScene } from '../three/PlotlineScene'

interface Props {
  hour: number
  /** YYYY-MM-DD */
  date: string
  northDeg: number
  onChange: (hour: number) => void
  /** the flat's lamps shown on (render.ts lightsOn), and whether that is the automatic choice; a click flips them */
  lights: boolean
  lightsAuto: boolean
  onLights: () => void
  onDate: (date: string) => void
  wind: boolean
  onWind: () => void
  /** Wind on: the month picked (0 = January), its line in words, its season's note, the rose shown or not */
  month: number
  onMonth: (m: number) => void
  windLine: string
  windNote: string | null
  rose: boolean
  onRose: () => void
}

export const period = (h: number) => (h < 5 || h >= 21 ? 'night' : h < 11 ? 'morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : 'evening')
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
/** the hour marks under the slider: where (hour) and what */
const MARKS: [number, string][] = [
  [0, '0'],
  [6, '6'],
  [12, 'noon'],
  [18, '18'],
  [24, '24'],
]

export default function SunPill(p: Props) {
  return (
    <div className="glass sun-pill">
      {p.wind && (
        <div className="wind-line">
          <div className="months" role="group" aria-label="month">
            {MONTHS.map((m, i) => (
              <button key={m} className={i === p.month ? 'on' : ''} title={m} onClick={() => p.onMonth(i)}>
                {m[0]}
              </button>
            ))}
          </div>
          <span className="wind-words">
            {p.windLine}
            {p.windNote && <span className="muted"> · {p.windNote}</span>}
          </span>
          <button className={`link rose-toggle${p.rose ? ' on' : ''}`} onClick={p.onRose} title="The wind rose: every month at once">
            Rose
          </button>
        </div>
      )}
      <div className="sun-row">
        <svg className="compass" width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${p.northDeg}deg)` }} aria-label="north">
          <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 3.5 L11 9 L9 8 L7 9 Z" fill="currentColor" />
        </svg>
        <input type="date" className="sun-date" value={p.date} onChange={(e) => e.target.value && p.onDate(e.target.value)} aria-label="day" title="The day the sun (and the wind's month) is shown for" />
        <svg className="sun-mark" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3.2" />
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k * Math.PI) / 4
            return <line key={k} x1={8 + Math.cos(a) * 5.2} y1={8 + Math.sin(a) * 5.2} x2={8 + Math.cos(a) * 7} y2={8 + Math.sin(a) * 7} />
          })}
        </svg>
        <div className="sun-track">
          <input type="range" min={0} max={24} step={0.25} value={p.hour} onChange={(e) => p.onChange(Number(e.target.value))} aria-label="time of day" />
          <div className="sun-marks" aria-hidden="true">
            {MARKS.map(([h, t]) => (
              <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <span className="sun-label">
          {hhmm(p.hour)} · {period(p.hour)}
        </span>
        <button
          className={`btn${p.lights ? ' active' : ''}`}
          onClick={p.onLights}
          title={`The flat's lights are ${p.lights ? 'on' : 'off'}${p.lightsAuto ? ' (automatic: on while the sun is down)' : ' (your choice; click again for automatic)'}`}
        >
          Lights
        </button>
        <button className={`btn${p.wind ? ' active' : ''}`} onClick={p.onWind} title="The wind through the flat this month: where it comes in and where it goes out">
          Wind
        </button>
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const point16 = core.point16
/** the 16 tick marks */
const POINTS = Array.from({ length: 16 })
const C = 90
/** the rose on screen, px (drawn in a 2C box) */
const SHOWN = 120
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

/**
 * The wind by month as a rose (turned like the compass: plan-up at the top): thin rings 1 m/s apart, 16 ticks, N E S W;
 * one slim spoke per month toward where the wind comes FROM, as long as it is strong, all one quiet blue; the date's month
 * deeper, with its line "June · SSE · 3.5 m/s". A click on a spoke (or near it) picks that month.
 */
export function WindRose({ months, month, northDeg, source, onMonth }: { months: WindMonth[]; month: number; northDeg: number; source: string; onMonth: (m: number) => void }) {
  const top = Math.max(4, Math.ceil(Math.max(...months.map((m) => m.speedMs))))
  const at = (deg: number, r: number) => {
    const a = ((deg + northDeg) * Math.PI) / 180
    return { x: C + Math.sin(a) * r, y: C - Math.cos(a) * r }
  }
  const w = months[month]
  const tip = (m: WindMonth) => at(m.fromDeg, (R * m.speedMs) / top)
  const pick = tip(w)
  return (
    <div className="glass wind-rose" onKeyDown={(e) => e.stopPropagation()}>
      <svg
        className="rose"
        width={SHOWN}
        height={SHOWN}
        viewBox={`0 0 ${2 * C} ${2 * C}`}
        aria-label="wind rose"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const i = nearestSpoke({ x: ((e.clientX - r.left) / r.width) * 2 * C, y: ((e.clientY - r.top) / r.height) * 2 * C }, months.map(tip))
          if (i >= 0) onMonth(i)
        }}
      >
        <title>{`Rings: 1 m/s apart. Each line: a month, from where the wind comes.`}</title>
        {Array.from({ length: top }, (_, k) => (
          <circle key={k} className="ring" cx={C} cy={C} r={(R * (k + 1)) / top} />
        ))}
        {POINTS.map((_, k) => {
          const [a, b] = [at(k * 22.5, R), at(k * 22.5, R + (k % 4 ? 4 : 8))]
          return <line key={k} className={`tick${k % 4 ? '' : ' major'}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        {['N', 'E', 'S', 'W'].map((t, k) => {
          const p = at(k * 90, R + 15)
          return (
            <text key={t} className="cardinal" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
              {t}
            </text>
          )
        })}
        {months.map((m, i) => {
          const p = tip(m)
          return (
            <g key={i} className="hit">
              <title>{`${MONTHS[i]} · ${point16(m.fromDeg)} · ${m.speedMs} m/s`}</title>
              <line x1={C} y1={C} x2={p.x} y2={p.y} className="grab" />
              {i !== month && <line x1={C} y1={C} x2={p.x} y2={p.y} className="spoke" />}
            </g>
          )
        })}
        <line x1={C} y1={C} x2={pick.x} y2={pick.y} className="spoke on" />
        <circle cx={pick.x} cy={pick.y} r={3} className="spoke-end" />
        <circle cx={C} cy={C} r={2} className="spoke-end" />
      </svg>
      <div className="wind-text">
        <div className="wind-pick">
          {MONTHS[month]} · {point16(w.fromDeg)} · {w.speedMs} m/s
        </div>
        <div className="muted small">{w.steady < 0.5 ? 'It turns a lot this month: no steady direction.' : 'Steady most days of the month.'}</div>
        <div className="muted small">{source}. A guide, not a wind simulation.</div>
      </div>
    </div>
  )
}
