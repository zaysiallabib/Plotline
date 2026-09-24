/** Bottom-centre sun pill: compass rotated by northDeg, 06:00–18:00 slider in 15-min steps, period label. */
interface Props {
  hour: number
  northDeg: number
  onChange: (hour: number) => void
}

export const period = (h: number) => (h < 11 ? 'morning' : h < 14 ? 'midday' : h < 17 ? 'afternoon' : 'evening')
export const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

export default function SunPill({ hour, northDeg, onChange }: Props) {
  return (
    <div className="glass sun-pill">
      <svg className="compass" width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${northDeg}deg)` }} aria-label="north">
        <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 3.5 L11 9 L9 8 L7 9 Z" fill="currentColor" />
      </svg>
      <input type="range" min={6} max={18} step={0.25} value={hour} onChange={(e) => onChange(Number(e.target.value))} aria-label="time of day" />
      <span className="sun-label">
        {hhmm(hour)} · {period(hour)}
      </span>
    </div>
  )
}
