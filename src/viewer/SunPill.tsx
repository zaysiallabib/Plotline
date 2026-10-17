/**
 * Bottom-centre sun pill: compass rotated by northDeg, the day (date field) and the 06:00–18:00 slider in 15-min steps,
 * period label, and Wind: the month's wind rose (WindRose) and its arrows through the flat. The sun is drawn where it
 * stands at the site on that day and hour (PlotlineScene.setTimeOfDay); the wind is the date's month.
 */
import type { WindMonth } from '../core'

interface Props {
  hour: number
  /** YYYY-MM-DD */
  date: string
  northDeg: number
  onChange: (hour: number) => void
  onDate: (date: string) => void
  wind: boolean
  onWind: () => void
}

export const period = (h: number) => (h < 11 ? 'morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : 'evening')
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

export default function SunPill({ hour, date, northDeg, onChange, onDate, wind, onWind }: Props) {
  return (
    <div className="glass sun-pill">
      <svg className="compass" width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${northDeg}deg)` }} aria-label="north">
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 3.5 L11 9 L9 8 L7 9 Z" fill="currentColor" />
      </svg>
      <input type="date" className="sun-date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} aria-label="day" title="The day the sun (and the wind's month) is shown for" />
      <input type="range" min={6} max={18} step={0.25} value={hour} onChange={(e) => onChange(Number(e.target.value))} aria-label="time of day" />
      <span className="sun-label">
        {hhmm(hour)} · {period(hour)}
      </span>
      <button className={`btn${wind ? ' active' : ''}`} onClick={onWind} title="Where the wind comes from this month: a wind rose, and arrows through the windows and doors">
        Wind
      </button>
    </div>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
/** a bearing as one of the 16 compass points ("SSW") */
export const point16 = (deg: number): string => POINTS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]
const C = 70
const R = 52

/**
 * The wind by month as a rose (turned like the compass: plan-up at the top): thin rings 1 m/s apart, 16 ticks, N E S W;
 * one slim spoke per month toward where the wind comes FROM, as long as it is strong, all one quiet blue; the date's month
 * deeper, with its line "June · SSE · 3.5 m/s". A click on a spoke (or near it) picks that month.
 */
export function WindRose({ months, month, northDeg, source, crossRooms, onMonth }: { months: WindMonth[]; month: number; northDeg: number; source: string; crossRooms: string[]; onMonth: (m: number) => void }) {
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
      <svg className="rose" width={2 * C} height={2 * C} viewBox={`0 0 ${2 * C} ${2 * C}`} aria-label="wind rose">
        <title>{`Rings: 1 m/s apart. Each line: a month, from where the wind comes.`}</title>
        {Array.from({ length: top }, (_, k) => (
          <circle key={k} className="ring" cx={C} cy={C} r={(R * (k + 1)) / top} />
        ))}
        {POINTS.map((_, k) => {
          const [a, b] = [at(k * 22.5, R), at(k * 22.5, R + (k % 4 ? 3 : 6))]
          return <line key={k} className={`tick${k % 4 ? '' : ' major'}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        {['N', 'E', 'S', 'W'].map((t, k) => {
          const p = at(k * 90, R + 13)
          return (
            <text key={t} className="cardinal" x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central">
              {t}
            </text>
          )
        })}
        {months.map((m, i) => {
          const p = tip(m)
          return (
            <g key={i} onClick={() => onMonth(i)} className="hit">
              <title>{`${MONTHS[i]} · ${point16(m.fromDeg)} · ${m.speedMs} m/s`}</title>
              <line x1={C} y1={C} x2={p.x} y2={p.y} className="grab" />
              {i !== month && <line x1={C} y1={C} x2={p.x} y2={p.y} className="spoke" />}
            </g>
          )
        })}
        <line x1={C} y1={C} x2={pick.x} y2={pick.y} className="spoke on" />
        <circle cx={pick.x} cy={pick.y} r={2.2} className="spoke-end" />
        <circle cx={C} cy={C} r={1.6} className="spoke-end" />
      </svg>
      <div className="wind-text">
        <div className="wind-pick">
          {MONTHS[month]} · {point16(w.fromDeg)} · {w.speedMs} m/s
        </div>
        <div className="muted small">{w.steady < 0.5 ? 'It turns a lot this month: no steady direction.' : 'Steady most days of the month.'}</div>
        <div className="muted small">{crossRooms.length ? `Cross ventilation: ${crossRooms.join(', ')}` : 'No room has the wind in and out.'}</div>
        <div className="muted small">{source}. A guide, not a wind simulation.</div>
      </div>
    </div>
  )
}
