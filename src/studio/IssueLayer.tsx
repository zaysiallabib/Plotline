/**
 * The Issues and "Check these" rows drawn ON the plan (issues.ts): a badge at each spot in its severity's colour, the
 * open one's fix ghosts with its fix buttons (or the room's name field) beside it. SVG over the canvas: only the badges
 * take the pointer, so the corner under a mark stays draggable — and only in V (`clickable`): with a drawing tool picked
 * (W, O, R, C, S, F) the marks stay visible but the click goes to the tool (C on a marked corner places a column).
 * s31 calm (founder: "the screen reads as an error list, not a drawing"): red (breaks the 3D) is a numbered badge; amber a
 * small dot with no number until the mouse comes near or its row is picked; grey is not drawn (the list holds it); rows
 * at one spot share one badge with their count (issues.ts spotsOf); the picked row's badge is the accent.
 */
import { useEffect, useRef, useState } from 'react'
import type { Pt } from '../core'
import { spotsOf, type Fix, type Ghost, type Mark, type MarkFixes, type Spot } from './issues'

/** a fixless mark: what to do by hand */
const BY_HAND: Partial<Record<string, string>> = {
  'dangling-vertex': 'Drag the end onto the wall it should meet (V), or select its wall and press Del if it is not a wall.',
  'walls-intersect': 'Drag one wall end onto the other wall.',
  'duplicate-wall': 'Delete one of the two walls (both carry openings).',
  'label-outside-any-room': 'Close the room around this name: join its loose wall ends.',
}

/** an amber dot shows its badge while the mouse is this close (px) */
const NEAR_PX = 40

interface Props {
  marks: Mark[]
  /** per mark key, an entry once worked out; null while the plan is still changing (a drag): no fix is offered from a stale plan */
  fixes: Map<string, MarkFixes> | null
  toScreen: (m: Pt) => Pt
  width: number
  height: number
  active: string | null
  hot: string | null
  /** the row picked in the list (↑ / ↓): its badge is the accent */
  picked?: string | null
  onActivate: (key: string | null) => void
  onFix: (fix: Fix) => void
  onName: (at: Pt, name: string) => void
  /** the badges take clicks (V); false while a drawing tool is picked */
  clickable: boolean
}

/** where a mark's numbered badge goes, from its spot: up-right, else the first other corner no earlier badge sits on */
const OFFSETS: Pt[] = [{ x: 12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: -12 }, { x: -12, y: 12 }, { x: 0, y: -26 }, { x: 0, y: 26 }, { x: 26, y: 0 }, { x: -26, y: 0 }]

export function IssueLayer({ marks, fixes, toScreen, width, height, active, hot, picked, onActivate, onFix, onName, clickable }: Props) {
  const pts = (ps: Pt[]) => ps.map((p) => toScreen(p)).map((p) => `${p.x},${p.y}`).join(' ')
  const spots = spotsOf(marks, toScreen)
  /** a spot holding the open / hovered / picked row (a twin row: its issue's) */
  const has = (s: Spot, k: string | null | undefined) => !!k && s.marks.some((m) => m.key === k)
  const lit = (s: Spot) => has(s, active) || has(s, hot) || has(s, picked)
  // the amber dots the mouse is near (keys, joined): only a change re-renders
  const svg = useRef<SVGSVGElement>(null)
  const spotsRef = useRef(spots)
  spotsRef.current = spots
  const [near, setNear] = useState('')
  useEffect(() => {
    const el = svg.current?.parentElement
    if (!el) return
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      const keys = spotsRef.current.filter((s) => s.severity === 'amber' && Math.hypot(s.at.x - x, s.at.y - y) <= NEAR_PX).map((s) => s.key).join(',')
      setNear((k) => (k === keys ? k : keys))
    }
    const leave = () => setNear('')
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
    }
  }, [])
  const nearSet = new Set(near.split(','))
  /** an amber spot stays a dot unless the mouse is near or one of its rows is open / hovered / picked */
  const dot = (s: Spot) => s.severity === 'amber' && !lit(s) && !nearSet.has(s.key)
  // badges never cover each other (two issues a few cm apart, e.g. a loose end inside an unnamed space)
  const placed: Pt[] = []
  const badgeAt = new Map<string, Pt>()
  for (const s of spots) {
    if (dot(s)) continue
    const o = OFFSETS.find((d) => placed.every((q) => Math.hypot(s.at.x + d.x - q.x, s.at.y + d.y - q.y) >= 18)) ?? OFFSETS[0]
    placed.push({ x: s.at.x + o.x, y: s.at.y + o.y })
    badgeAt.set(s.key, o)
  }
  const ghost = (g: Ghost, k: number) => {
    if (g.kind === 'area') return <polygon key={k} className="g-area" points={pts(g.pts)} />
    if (g.kind === 'ring') {
      const p = toScreen(g.at)
      return <circle key={k} className="g-ring" cx={p.x} cy={p.y} r={7} />
    }
    const [a, b] = [toScreen(g.from), toScreen(g.to)]
    return (
      <g key={k} className={g.kind === 'cut' ? 'g-cut' : 'g-line'}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        {g.kind === 'line' && <circle cx={b.x} cy={b.y} r={4} />}
      </g>
    )
  }
  // (a spot's lead mark opens; a spot holding the open row keeps it open)
  const lead = (s: Spot) => s.marks.find((m) => m.key === active) ?? s.marks[0]
  const shown = new Set(spots.filter((s) => !dot(s)).flatMap((s) => s.marks.map((m) => m.key)))
  const open = marks.find((m) => m.key === active && m.at)
  const f = open && fixes?.get(open.key)
  const at = open?.at && toScreen(open.at)
  return (
    <>
      <svg ref={svg} className={`issue-layer${clickable ? '' : ' passive'}`} width={width} height={height}>
        {/* unnamed rooms: the open / hovered one tinted (a dot's room stays untinted until then) */}
        {marks.map((m) => m.outline && m.at && (m.key === active || m.key === hot || (m.severity === 'amber' && shown.has(m.key))) && <polygon key={`t${m.key}`} className={`tint${m.key === active || m.key === hot ? ' on' : ''}`} points={pts(m.outline)} />)}
        {/* the first fix's ghost faintly under each badge shown; the open / hovered one's in full */}
        {marks.map((m) => {
          const on = m.key === active || m.key === hot
          const list = fixes?.get(m.key)?.fixes ?? []
          return list.length > 0 && m.at && (on || shown.has(m.key)) && <g key={`g${m.key}`} className={`ghost${on ? ' on' : ''}`}>{(on ? list.flatMap((x) => x.ghost) : list[0].ghost).map(ghost)}</g>
        })}
        {open?.hint && (() => {
          const p = toScreen(open.hint.at)
          return <circle className="g-ring hint" cx={p.x} cy={p.y} r={14} />
        })()}
        {spots.map((s) => {
          const m = lead(s)
          const pick = (e: React.PointerEvent) => {
            e.stopPropagation()
            onActivate(m.key === active ? null : m.key)
          }
          const title = s.marks.map((x) => (x.n ? `${x.n}. ${x.message}` : x.message)).join('\n')
          const cls = `mark ${s.severity}${has(s, active) ? ' on' : ''}${has(s, hot) ? ' hot' : ''}${has(s, picked) ? ' picked' : ''}`
          if (dot(s))
            return (
              <g key={s.key} className={`${cls} dot`} transform={`translate(${s.at.x} ${s.at.y})`}>
                <g className="badge" onPointerDown={pick}>
                  <title>{title}</title>
                  <circle className="hit" r={8} />
                  <circle r={4} />
                </g>
              </g>
            )
          const o = badgeAt.get(s.key)!
          return (
            <g key={s.key} className={`${cls}${s.marks.length > 1 ? ' many' : ''}`} transform={`translate(${s.at.x} ${s.at.y})`}>
              <circle className="ring" r={9} />
              <circle className="pulse" r={9} />
              <g className="badge" transform={`translate(${o.x} ${o.y})`} onPointerDown={pick}>
                <title>{title}</title>
                <circle r={9} />
                <text>{s.marks.length > 1 ? s.marks.length : m.n}</text>
              </g>
            </g>
          )
        })}
      </svg>
      {open && at && (
        <div className="issue-pop" style={{ left: Math.max(4, Math.min(at.x + 26, width - 264)), top: Math.max(4, Math.min(at.y - 8, height - 260)) }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="head">
            <span className={`num ${open.severity}`}>{open.n}</span>
            <span className="grow">{open.message}</span>
            <button className="x" title="Close (Esc)" onClick={() => onActivate(null)}>
              ×
            </button>
          </div>
          {(() => {
            // the other rows at this spot: one click opens each
            const s = spots.find((x) => has(x, open.key))
            const others = s ? s.marks.filter((x) => x.key !== open.key) : []
            return others.length > 0 && (
              <p className="muted at-spot">
                Also here:{' '}
                {others.map((x) => (
                  <button key={x.key} className="link" title={x.message} onClick={() => onActivate(x.key)}>
                    {x.n}
                  </button>
                ))}
              </p>
            )
          })()}
          {open.hint && <p className="muted">Ringed: {open.hint.why}</p>}
          {f?.nameAt && (
            <input
              key={open.key}
              autoFocus
              placeholder="Name this room, Enter"
              onKeyDown={(e) => {
                e.stopPropagation()
                const name = e.currentTarget.value.trim()
                if (e.key === 'Enter' && name) onName(f.nameAt!, name)
                if (e.key === 'Escape') onActivate(null)
              }}
            />
          )}
          {!!f?.fixes.length && (
            <div className="fixes">
              {f.fixes.map((x, i) => (
                <button key={x.label} className={i ? '' : 'primary'} title={x.title} onClick={() => onFix(x)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {!f && <p className="muted">Working out its fixes…</p>}
          {f && !f.fixes.length && !f.nameAt && open.issue && <p className="muted">{BY_HAND[open.issue.code] ?? 'No one-click fix for this one.'}</p>}
          {open.review &&
            (open.review.room !== undefined && f && !f.fixes.length ? (
              <p className="muted">Nothing closes it in one click: draw its open sides with W (keys 1–4: wall, low wall, kerb, zone line). Once it is closed the row offers its name.</p>
            ) : (
              <p className="muted">From Auto-trace: check it, then “Looks right” in the list.</p>
            ))}
        </div>
      )}
    </>
  )
}
