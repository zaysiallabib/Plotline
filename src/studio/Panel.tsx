import { useEffect, useState } from 'react'
import { FT, formatFeetInches, parseLength, sqmToSqft, wallFrame } from '../core'
import type { Opening, OpeningKind, Room, RoomKind } from '../core'
import { EXTERIOR_M, PARTITION_M, findEntity, type Action, type StudioIssue, type StudioState } from './model'

export const ROOM_KINDS: RoomKind[] = ['bed', 'living', 'dining', 'kitchen', 'bath', 'balcony', 'study', 'closet', 'utility', 'shaft', 'other']
export const formatArea = (sqm: number): string => `Area ${sqm.toFixed(1)} m² · ${Math.round(sqmToSqft(sqm))} sqft`

/** Feet-inch text input; commits meters on Enter/blur, red when unparseable. */
export function LenInput({ valueM, onCommit, placeholder }: { valueM: number; onCommit: (m: number) => void; placeholder?: string }) {
  const [text, setText] = useState(formatFeetInches(valueM))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(formatFeetInches(valueM))
    setBad(false)
  }, [valueM])
  const commit = () => {
    const m = parseLength(text)
    if (m == null || m < 0 || m > 100) return setBad(true)
    setBad(false)
    onCommit(m)
  }
  return (
    <input
      className={bad ? 'bad' : ''}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        e.stopPropagation()
      }}
    />
  )
}

interface Props {
  state: StudioState
  dispatch: (a: Action) => void
  rooms: Room[]
  issues: StudioIssue[]
  onFocusIssue: (i: StudioIssue) => void
}

export function Panel({ state, dispatch, rooms, issues, onFocusIssue }: Props) {
  const { unit } = state
  const errors = issues.filter((i) => i.level === 'error').length
  const steps: [string, boolean][] = [
    ['1 Load plan', !!state.planImage],
    ['2 Set scale', !!unit.planImage],
    ['3 Trace walls', unit.walls.length > 0],
    ['4 Wall thickness', unit.walls.some((w) => w.thicknessM >= 0.2)],
    ['5 Openings', unit.walls.some((w) => w.openings.length > 0)],
    ['6 Rooms', unit.roomLabels.length > 0],
    ['7 Check', unit.walls.length > 0 && errors === 0],
    ['8 Export', state.exported],
  ]
  return (
    <aside className="panel">
      <section>
        <h3>Steps</h3>
        <ol className="steps">
          {steps.map(([label, done]) => (
            <li key={label} className={done ? 'done' : ''}>
              <span className="tick">{done ? '✓' : ''}</span>
              {label}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Selection</h3>
        <Selection state={state} dispatch={dispatch} rooms={rooms} />
      </section>
      <section>
        <h3>{issues.length ? `Issues (${issues.length})` : 'Issues'}</h3>
        {issues.length === 0 ? (
          <p className="muted">No issues. Ready to export.</p>
        ) : (
          <ul className="issues">
            {issues.map((i, k) => (
              <li key={k} className={i.ids.length ? 'find' : undefined} title={i.ids.length ? 'Click to find it' : undefined} onClick={() => onFocusIssue(i)}>
                <span className={`dot ${i.level}`} />
                {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}

function Selection({ state, dispatch, rooms }: { state: StudioState; dispatch: (a: Action) => void; rooms: Room[] }) {
  const { unit, selection, chain } = state
  const ents = selection.map((id) => findEntity(unit, id)).filter((e) => e !== null)

  if (chain) {
    return (
      <div className="props">
        <p className="muted">Tracing · {chain.ids.length} corner{chain.ids.length === 1 ? '' : 's'}</p>
        <Thickness value={chain.thicknessM} onChange={(t) => t !== chain.thicknessM && dispatch({ type: 'toggle-thickness' })} custom={false} />
      </div>
    )
  }
  if (!ents.length) return <p className="muted">Nothing selected. Click a corner, wall, opening or room label.</p>

  if (ents.length > 1) {
    const walls = ents.filter((e) => e.kind === 'wall')
    return (
      <div className="props">
        <p className="muted">{ents.length} selected</p>
        {walls.length > 0 && (
          <Thickness
            value={walls.every((w) => w.kind === 'wall' && w.w.thicknessM === walls[0].w.thicknessM) ? walls[0].w.thicknessM : NaN}
            onChange={(t) => walls.forEach((w) => dispatch({ type: 'update-wall', id: w.w.id, patch: { thicknessM: t } }))}
            custom
          />
        )}
      </div>
    )
  }

  const e = ents[0]
  if (e.kind === 'vertex') {
    const v = e.v
    const set = (k: 'x' | 'y') => (m: number) => dispatch({ type: 'move-vertex', id: v.id, x: k === 'x' ? m : v.x, y: k === 'y' ? m : v.y })
    return (
      <div className="props">
        <p className="muted">Corner</p>
        <Row label="X (m)">
          <NumInput value={v.x} onCommit={set('x')} />
        </Row>
        <Row label="Y (m)">
          <NumInput value={v.y} onCommit={set('y')} />
        </Row>
      </div>
    )
  }
  if (e.kind === 'wall') {
    const w = e.w
    const len = wallFrame(w, unit.vertices).lengthM
    return (
      <div className="props">
        <p className="muted">
          Wall · {formatFeetInches(len)} · {len.toFixed(2)} m
        </p>
        <Thickness value={w.thicknessM} onChange={(t) => dispatch({ type: 'update-wall', id: w.id, patch: { thicknessM: t } })} custom />
        <Row label="Height">
          <LenInput valueM={w.heightM} onCommit={(m) => dispatch({ type: 'update-wall', id: w.id, patch: { heightM: m } })} />
        </Row>
        <Row label="Length (moves B)">
          <LenInput valueM={len} onCommit={(m) => dispatch({ type: 'set-wall-length', id: w.id, lengthM: m })} />
        </Row>
      </div>
    )
  }
  if (e.kind === 'opening') {
    const o = e.o
    const patch = (p: Partial<Omit<Opening, 'id'>>) => dispatch({ type: 'update-opening', id: o.id, patch: p })
    const L = wallFrame(e.w, unit.vertices).lengthM
    const toB = L - o.widthM - o.offsetM
    return (
      <div className="props">
        <p className="muted">
          {formatFeetInches(o.offsetM)} from corner A · {formatFeetInches(toB)} from corner B
        </p>
        <div className="seg">
          {(['door', 'window', 'passage'] as OpeningKind[]).map((k) => (
            <button key={k} className={o.kind === k ? 'on' : ''} onClick={() => patch({ kind: k })}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <Row label="Width">
          <LenInput valueM={o.widthM} onCommit={(m) => patch({ widthM: m })} />
        </Row>
        <Row label="Height">
          <LenInput valueM={o.heightM} onCommit={(m) => patch({ heightM: m })} />
        </Row>
        <Row label="Sill">
          <LenInput valueM={o.sillM} onCommit={(m) => patch({ sillM: m })} />
        </Row>
        <Row label="From corner A">
          <LenInput valueM={o.offsetM} onCommit={(m) => patch({ offsetM: m })} />
        </Row>
        <Row label="From corner B">
          <LenInput valueM={toB} onCommit={(m) => patch({ offsetM: L - o.widthM - m })} />
        </Row>
        {o.kind === 'door' && (
          <>
            <Row label="Hinge">
              <div className="seg">
                <button className={o.hinge !== 'b' ? 'on' : ''} onClick={() => patch({ hinge: 'a' })}>
                  A
                </button>
                <button className={o.hinge === 'b' ? 'on' : ''} onClick={() => patch({ hinge: 'b' })}>
                  B
                </button>
              </div>
            </Row>
            <Row label="Swing">
              <div className="seg">
                <button className={o.swing !== 'out' ? 'on' : ''} onClick={() => patch({ swing: 'in' })}>
                  in
                </button>
                <button className={o.swing === 'out' ? 'on' : ''} onClick={() => patch({ swing: 'out' })}>
                  out
                </button>
              </div>
            </Row>
          </>
        )}
      </div>
    )
  }
  const l = e.l
  const room = rooms.find((r) => r.id === l.id)
  return (
    <div className="props">
      <Row label="Room name">
        <input value={l.name} onChange={(ev) => dispatch({ type: 'update-label', id: l.id, patch: { name: ev.target.value } })} />
      </Row>
      <Row label="Kind">
        <select value={l.kind} onChange={(ev) => dispatch({ type: 'update-label', id: l.id, patch: { kind: ev.target.value as RoomKind } })}>
          {ROOM_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Printed size">
        <input value={l.printedSize ?? ''} onChange={(ev) => dispatch({ type: 'update-label', id: l.id, patch: { printedSize: ev.target.value } })} />
      </Row>
      <p className="muted">{room ? formatArea(room.areaSqm) : 'Label is not inside a closed room'}</p>
      <button className="link" onClick={() => dispatch({ type: 'delete', ids: [l.id] })}>
        Remove
      </button>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="row">
      <span>{label}</span>
      {children}
    </label>
  )
}

function NumInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(value.toFixed(3))
  useEffect(() => setText(value.toFixed(3)), [value])
  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n)) onCommit(n)
  }
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        e.stopPropagation()
      }}
    />
  )
}

function Thickness({ value, onChange, custom }: { value: number; onChange: (t: number) => void; custom: boolean }) {
  const isCustom = custom && value !== PARTITION_M && value !== EXTERIOR_M
  const [inches, setInches] = useState(() => (Number.isFinite(value) ? ((value / FT) * 12).toFixed(1) : ''))
  useEffect(() => {
    if (Number.isFinite(value)) setInches(((value / FT) * 12).toFixed(1))
  }, [value])
  const commitInches = () => {
    const n = Number(inches)
    if (n > 0 && n < 60) onChange((n / 12) * FT)
  }
  return (
    <Row label="Thickness">
      <div className="seg">
        <button className={value === PARTITION_M ? 'on' : ''} onClick={() => onChange(PARTITION_M)}>
          Partition 5"
        </button>
        <button className={value === EXTERIOR_M ? 'on' : ''} onClick={() => onChange(EXTERIOR_M)}>
          Exterior 10"
        </button>
        {custom && (
          <button className={isCustom ? 'on' : ''} onClick={() => onChange(0.2)}>
            Custom…
          </button>
        )}
      </div>
      {isCustom && (
        <input
          value={inches}
          onChange={(e) => setInches(e.target.value)}
          onBlur={commitInches}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInches()
            e.stopPropagation()
          }}
          placeholder="inches"
        />
      )}
    </Row>
  )
}
