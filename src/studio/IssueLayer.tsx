/**
 * The Issues and "Check these" rows drawn ON the plan (issues.ts): a numbered mark at each spot in its severity's
 * colour, the first fix's ghost faintly under every mark that has one, the open one's ghosts in full with its fix
 * buttons (or the room's name field) beside it. SVG over the canvas: only the numbered badges take the pointer, so the
 * corner under a mark stays draggable.
 */
import type { Pt } from '../core'
import type { Fix, Ghost, Mark, MarkFixes } from './issues'

/** a fixless mark: what to do by hand */
const BY_HAND: Partial<Record<string, string>> = {
  'dangling-vertex': 'Drag the end onto the wall it should meet (V), or select its wall and press Del if it is not a wall.',
  'walls-intersect': 'Drag one wall end onto the other wall.',
  'duplicate-wall': 'Delete one of the two walls (both carry openings).',
  'label-outside-any-room': 'Close the room around this name: join its loose wall ends.',
}

interface Props {
  marks: Mark[]
  /** per mark key; null while the plan is still changing (a drag): no fix is offered from a stale plan */
  fixes: Map<string, MarkFixes> | null
  toScreen: (m: Pt) => Pt
  width: number
  height: number
  active: string | null
  hot: string | null
  onActivate: (key: string | null) => void
  onFix: (fix: Fix) => void
  onName: (at: Pt, name: string) => void
}

/** where a mark's numbered badge goes, from its spot: up-right, else the first other corner no earlier badge sits on */
const OFFSETS: Pt[] = [{ x: 12, y: -12 }, { x: 12, y: 12 }, { x: -12, y: -12 }, { x: -12, y: 12 }, { x: 0, y: -26 }, { x: 0, y: 26 }, { x: 26, y: 0 }, { x: -26, y: 0 }]

export function IssueLayer({ marks, fixes, toScreen, width, height, active, hot, onActivate, onFix, onName }: Props) {
  const pts = (ps: Pt[]) => ps.map((p) => toScreen(p)).map((p) => `${p.x},${p.y}`).join(' ')
  // badges never cover each other (two issues a few cm apart, e.g. a loose end inside an unnamed space)
  const placed: Pt[] = []
  const badgeAt = new Map<string, Pt>()
  for (const m of marks) {
    if (!m.at || m.twinOf) continue
    const p = toScreen(m.at)
    const o = OFFSETS.find((d) => placed.every((q) => Math.hypot(p.x + d.x - q.x, p.y + d.y - q.y) >= 18)) ?? OFFSETS[0]
    placed.push({ x: p.x + o.x, y: p.y + o.y })
    badgeAt.set(m.key, o)
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
  const open = marks.find((m) => m.key === active && m.at)
  const f = open && fixes?.get(open.key)
  const at = open?.at && toScreen(open.at)
  return (
    <>
      <svg className="issue-layer" width={width} height={height}>
        {/* unnamed rooms: tinted, the open one strongly */}
        {marks.map((m) => m.outline && m.at && (m.severity === 'amber' || m.key === active || m.key === hot) && <polygon key={`t${m.key}`} className={`tint${m.key === active || m.key === hot ? ' on' : ''}`} points={pts(m.outline)} />)}
        {/* every fix's first ghost faintly; the open / hovered one's in full */}
        {marks.map((m) => {
          const on = m.key === active || m.key === hot
          const list = fixes?.get(m.key)?.fixes ?? []
          return list.length > 0 && m.at && <g key={`g${m.key}`} className={`ghost${on ? ' on' : ''}`}>{(on ? list.flatMap((x) => x.ghost) : list[0].ghost).map(ghost)}</g>
        })}
        {open?.hint && (() => {
          const p = toScreen(open.hint.at)
          return <circle className="g-ring hint" cx={p.x} cy={p.y} r={14} />
        })()}
        {marks.map((m) => {
          if (!m.at || m.twinOf) return null // a "Check these" row on an issue's spot: the issue's mark stands for both
          const p = toScreen(m.at)
          return (
            <g key={m.key} className={`mark ${m.severity}${m.key === active ? ' on' : ''}${m.key === hot ? ' hot' : ''}`} transform={`translate(${p.x} ${p.y})`}>
              <circle className="ring" r={m.severity === 'grey' ? 6 : 9} />
              <circle className="pulse" r={9} />
              <g
                className="badge"
                transform={`translate(${badgeAt.get(m.key)!.x} ${badgeAt.get(m.key)!.y})`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  onActivate(m.key === active ? null : m.key)
                }}
              >
                <title>{m.message}</title>
                <circle r={m.severity === 'grey' ? 7 : 9} />
                <text>{m.n}</text>
              </g>
            </g>
          )
        })}
      </svg>
      {open && at && (
        <div className="issue-pop" style={{ left: Math.max(4, Math.min(at.x + 26, width - 264)), top: Math.max(4, Math.min(at.y - 8, height - 150)) }} onPointerDown={(e) => e.stopPropagation()}>
          <div className="head">
            <span className={`num ${open.severity}`}>{open.n}</span>
            <span className="grow">{open.message}</span>
            <button className="link" title="Close (Esc)" onClick={() => onActivate(null)}>
              ×
            </button>
          </div>
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
            <div className="seg">
              {f.fixes.map((x) => (
                <button key={x.label} className="primary" title={x.title} onClick={() => onFix(x)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {!f && open.issue && fixes && <p className="muted">{BY_HAND[open.issue.code] ?? 'No one-click fix for this one.'}</p>}
          {open.review && <p className="muted">From Auto-trace: check it, then “Looks right” in the list.</p>}
        </div>
      )}
    </>
  )
}
