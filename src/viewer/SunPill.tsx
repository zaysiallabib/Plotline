/**
 * Bottom-centre sun pill: compass rotated by northDeg, the day (date field) and the 06:00–18:00 slider in 15-min steps,
 * period label, and Wind: the month's wind rose (WindRose) and its arrows through the flat. The sun is drawn where it
 * stands at the site on that day and hour (PlotlineScene.setTimeOfDay); the wind is the date's month.
 */
import { compassName, type WindMonth } from '../core'

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
const R = 58

/**
 * The wind by month as a rose (turned like the compass: plan-up at the top): one spoke per month toward where the wind
 * comes FROM, as long as it is strong, as solid as it is steady; the date's month picked. A click on a spoke picks it.
 */
export function WindRose({ months, month, northDeg, source, crossRooms, onMonth }: { months: WindMonth[]; month: number; northDeg: number; source: string; crossRooms: string[]; onMonth: (m: number) => void }) {
  const max = Math.max(...months.map((m) => m.speedMs))
  const at = (deg: number, r: number) => {
    const a = ((deg + northDeg) * Math.PI) / 180
    return { x: 75 + Math.sin(a) * r, y: 75 - Math.cos(a) * r }
  }
  const w = months[month]
  const n = at(0, R + 11)
  return (
    <div className="glass wind-rose" onKeyDown={(e) => e.stopPropagation()}>
      <svg width="150" height="150" viewBox="0 0 150 150" aria-label="wind rose">
        <circle cx="75" cy="75" r={R} fill="none" stroke="currentColor" strokeOpacity="0.25" />
        <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="11" fill="currentColor">
          N
        </text>
        {months.map((m, i) => {
          const tip = at(m.fromDeg, 12 + ((R - 12) * m.speedMs) / max)
          const on = i === month
          return (
            <g key={i} className="spoke" onClick={() => onMonth(i)} opacity={on ? 1 : 0.25 + 0.6 * m.steady}>
              <title>{`${MONTHS[i]}: from the ${compassName(m.fromDeg)}, ${m.speedMs} m/s`}</title>
              <line x1="75" y1="75" x2={tip.x} y2={tip.y} stroke={on ? 'var(--accent)' : 'currentColor'} strokeWidth={on ? 4 : 2} strokeLinecap="round" />
              <circle cx={tip.x} cy={tip.y} r={on ? 5 : 3.5} fill={on ? 'var(--accent)' : 'currentColor'} />
            </g>
          )
        })}
      </svg>
      <div className="wind-text">
        <strong>{MONTHS[month]}</strong>: from the {compassName(w.fromDeg)} ({w.fromDeg}°), {w.speedMs} m/s
        {w.steady < 0.5 && <div className="muted small">It changes a lot this month: no steady direction.</div>}
        <div className="muted small">{crossRooms.length ? `Cross ventilation: ${crossRooms.join(', ')}` : 'No room has the wind in and out.'}</div>
        <div className="muted small">{source}. A guide, not a wind simulation.</div>
      </div>
    </div>
  )
}
