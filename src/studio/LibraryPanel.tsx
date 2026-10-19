/**
 * The staff library (Studio tool F, the 3D view's Add): a search box over the pieces grouped by room, then by kind,
 * with counts, the groups folding; the pieces picked last on top. Typing goes to the box, Enter picks the first match,
 * Esc clears it (again: lets go of the box, so the app's keys work). Listing and search: library.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { firstMatch, listing, pushRecent, RECENT_KEY, type Entry } from './library'
import './library.css'

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function LibraryPanel({ onPick, picked }: { onPick: (assetId: string) => void; picked?: string | null }) {
  const [q, setQ] = useState('')
  const [recent, setRecent] = useState(readRecent)
  const box = useRef<HTMLInputElement>(null)
  const groups = useMemo(() => listing(q, recent), [q, recent])
  // after the key that opened it (F in the Studio) has landed: else that letter would be typed into the box
  useEffect(() => {
    const t = setTimeout(() => box.current?.focus({ preventScroll: true }))
    return () => clearTimeout(t)
  }, [])
  const pick = (e: Entry) => {
    const next = pushRecent(recent, e.id)
    setRecent(next)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
      /* private window: Recent lasts this page only */
    }
    ;(document.activeElement as HTMLElement | null)?.blur() // R / Esc now turn and cancel the piece in hand
    onPick(e.id)
  }
  return (
    <div className="lib">
      <input
        ref={box}
        type="search"
        className="lib-search"
        placeholder="Search: sofa, lamp, balcony, plant…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const m = firstMatch(q)
            if (m) pick(m)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            if (q) setQ('')
            else box.current?.blur()
          }
        }}
      />
      <div className="lib-list">
        {groups.map((g) => (
          <details key={`${g.name}${q ? '?' : ''}`} open={!!q || g.name === 'Recent'}>
            <summary>
              {g.name} <span className="muted">{g.count}</span>
            </summary>
            {g.kinds.map((k) => (
              <div key={k.name}>
                {k.name && g.kinds.length > 1 && (
                  <div className="lib-kind">
                    {k.name} <span className="muted">{k.items.length}</span>
                  </div>
                )}
                {k.items.map((i) => (
                  <button key={i.id} className={`lib-row${i.id === picked ? ' on' : ''}`} title={i.label} onClick={() => pick(i)}>
                    <span className="lib-name">{i.label}</span>
                    <span className="muted lib-feet">{i.feet}</span>
                    <span className={`lib-mark${i.scan ? ' scan' : ''}`} title={i.scan ? 'Scanned model: photo-real, loads when placed' : 'Built in code: no download, resizes cleanly'}>
                      {i.scan ? 'scan' : 'built'}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </details>
        ))}
        {!groups.length && <p className="muted">Nothing called “{q}”. Try another word: chair, table, light, plant.</p>}
      </div>
    </div>
  )
}
