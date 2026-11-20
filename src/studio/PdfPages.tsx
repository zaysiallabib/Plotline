/**
 * "Which page is the floor plan?" (session 31): a PDF of several pages (a developer's brochure, an architect's set) shows
 * its pages as small pictures; a click picks one (StudioApp reads it as a drawing when its lines make a plan, else it
 * becomes the plan picture to trace). The pictures are drawn one after another, first page first, so the first ones show
 * at once on a 50-page brochure. Esc or × closes it.
 */
import { useEffect, useState } from 'react'

interface Props {
  name: string
  count: number
  /** a page as a picture (a data URL), its longer side `px` pixels */
  thumb: (page: number, px: number) => Promise<string>
  /** the page being read after a click (its card says so), or null */
  busy: number | null
  onPick: (page: number) => void
  onClose: () => void
}

export default function PdfPages({ name, count, thumb, busy, onPick, onClose }: Props) {
  const [pics, setPics] = useState<Record<number, string>>({})
  useEffect(() => {
    let live = true
    void (async () => {
      for (let p = 1; p <= count && live; p++) {
        const url = await thumb(p, 320).catch(() => '')
        if (live) setPics((x) => ({ ...x, [p]: url }))
      }
    })()
    return () => {
      live = false
    }
  }, [count, thumb])
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <div className="pages-sheet" role="dialog" aria-label="Which page is the floor plan?">
      <div className="head">
        <strong>
          {name} · {count} pages
        </strong>
        <button className="x" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </div>
      <h2 className="display">Which page is the floor plan?</h2>
      <p className="muted">Click it. A page drawn in lines opens as the drawing; a page that is a picture becomes the plan picture to trace.</p>
      <ol className="pages">
        {Array.from({ length: count }, (_, i) => i + 1).map((p) => (
          <li key={p}>
            <button className={busy === p ? 'on' : ''} disabled={busy !== null} onClick={() => onPick(p)} title={`Page ${p}`}>
              <span className="page">{pics[p] ? <img src={pics[p]} alt="" /> : <span className="spin" />}</span>
              <span className="label">{busy === p ? 'Reading…' : `Page ${p}`}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
