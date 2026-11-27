/**
 * The roof's fields (session 31 roof lane, data/building/roof.ts): its kind, pitch, which way its ridge runs, its eaves'
 * overhang, its covering, its edge (a coping on a flat roof's parapet, a cornice band) and its roof windows (skylights on a flat
 * roof). One component for both places a person changes the roof: the Studio's project column (Building → ROOF → Change) and
 * the 3D view's Finishes (staff, a click on the roof in the Building view). A typed number goes in on Enter or leaving the
 * field, a window's place when the slider is let go — each change rebuilds the roof once.
 */
import { useState } from 'react'
import { COPINGS, DEFAULT_PITCH, ROOF_KINDS, WINDOW_SIZE, coveringOf, coveringsFor, isPitched, spread, type Roof, type RoofKind, type RoofPiece, type RoofWindow } from '../data/building/roof'

interface Props {
  /** the roof as drawn now (absent: the flat roof and its parapet) */
  roof: Roof | undefined
  /** the drawing set printed its eave and ridge: an empty pitch is "as drawn" */
  read?: boolean
  /** the covering as a list here (the Studio); the 3D view shows its own swatches */
  covering?: boolean
  onChange: (r: Roof) => void
}

/** a number field kept as typed, committed on Enter or leaving it (empty: the default) */
function Num({ value, placeholder, min, max, step, onCommit, label }: { value: number | undefined; placeholder: string; min: number; max: number; step: number; onCommit: (v: number | undefined) => void; label: string }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const v = text.trim() === '' ? undefined : Number(text.replace(',', '.'))
    if (v === undefined || Number.isFinite(v)) onCommit(v === undefined ? undefined : Math.min(max, Math.max(min, v)))
    setText(null)
  }
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={text ?? (value ?? '')}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

/** a window's place along its slope: dragged freely, committed when let go */
function Along({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState<number | null>(null)
  const done = () => v !== null && (onCommit(v), setV(null))
  return <input type="range" aria-label="Where along the roof" min={0} max={1} step={0.01} value={v ?? value} onChange={(e) => setV(Number(e.target.value))} onPointerUp={done} onKeyUp={done} onBlur={done} />
}

export function RoofFields({ roof, read, covering, onChange }: Props) {
  const r: Roof = roof ?? { kind: 'flat' }
  const pitched = isPitched(r)
  const set = (patch: Partial<Roof>) => {
    const next: Roof = { ...r, ...patch }
    for (const k of Object.keys(next) as (keyof Roof)[]) if (next[k] === undefined || next[k] === false || (Array.isArray(next[k]) && !(next[k] as unknown[]).length)) delete next[k]
    onChange(next)
  }
  const kind = (k: RoofKind) => {
    // a flat deck's covering is no slope's (and back): the new kind's own first; its skylights stay, now on the slope
    const flip = isPitched({ kind: k }) !== pitched
    set({ kind: k, ...(flip ? { covering: undefined } : {}), ...(k === 'shed' ? { windows: r.windows?.map((w) => ({ ...w, side: 0 as const })), pieces: r.pieces?.map((p) => ({ ...p, side: 0 as const })) } : {}) })
  }
  const ws = r.windows ?? []
  const setWindows = (next: RoofWindow[]) => set({ windows: next })
  const ps = r.pieces ?? []
  const setPieces = (next: RoofPiece[]) => set({ pieces: next })
  const addPiece = (kind: RoofPiece['kind']) => setPieces(spread([...ps, { kind, side: 0, along: 0.5, up: 0.5 }], 0))
  const sides = pitched && r.kind !== 'shed'
  return (
    <div className="roof-fields">
      <label>
        <span className="label">Kind</span>
        <select value={r.kind} onChange={(e) => kind(e.target.value as RoofKind)}>
          {ROOF_KINDS.map(([k, words]) => (
            <option key={k} value={k}>
              {words}
            </option>
          ))}
        </select>
      </label>
      {pitched && (
        <>
          <label title={read ? 'Empty: as steep as the drawings’ eave and ridge make it' : `Degrees; empty: ${DEFAULT_PITCH}°`}>
            <span className="label">Pitch °</span>
            <Num label="Pitch in degrees" value={r.pitchDeg} placeholder={read ? 'as drawn' : String(DEFAULT_PITCH)} min={5} max={75} step={1} onCommit={(v) => set({ pitchDeg: v })} />
          </label>
          <label>
            <span className="label">Ridge</span>
            <select value={r.ridge ?? 'long'} onChange={(e) => set({ ridge: e.target.value === 'short' ? 'short' : undefined })}>
              <option value="long">Lengthwise</option>
              <option value="short">Crosswise</option>
            </select>
          </label>
          <label title="How far the roof reaches past the walls, with a fascia board along its edge and a soffit under it">
            <span className="label">Eaves m</span>
            <Num label="Eaves overhang in metres" value={r.overhangM} placeholder="0" min={0} max={3} step={0.1} onCommit={(v) => set({ overhangM: v || undefined })} />
          </label>
        </>
      )}
      {covering && (
        <label>
          <span className="label">Covering</span>
          <select value={coveringOf(r).id} onChange={(e) => set({ covering: e.target.value })}>
            {coveringsFor(r).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {!pitched && (
        <label title="A cap along the top of the parapet">
          <span className="label">Coping</span>
          <select value={r.coping ?? ''} onChange={(e) => set({ coping: (e.target.value || undefined) as Roof['coping'] })}>
            {COPINGS.map(([k, words]) => (
              <option key={k} value={k}>
                {words}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="check" title="A band round the building just under the roof line">
        <input type="checkbox" checked={!!r.cornice} onChange={(e) => set({ cornice: e.target.checked })} /> A cornice band under the roof
      </label>
      <div className="roof-windows">
        <div className="name">
          <span className="label">{pitched ? 'Roof windows' : 'Skylights'}</span>
          <button className="link" title={pitched ? 'A roof window on the front slope (spread evenly; drag it along after)' : 'A skylight on the roof (spread evenly; drag it along after)'} onClick={() => setWindows(spread([...ws, { side: 0, along: 0.5, up: 0.5, ...WINDOW_SIZE }], 0))}>
            + Add
          </button>
        </div>
        {ws.map((w, i) => (
          <div key={i} className="roof-window">
            {sides ? (
              <select aria-label="Which slope" value={w.side} onChange={(e) => setWindows(spread(ws.map((x, j) => (j === i ? { ...x, side: Number(e.target.value) as 0 | 1 } : x)), Number(e.target.value) as 0 | 1))}>
                <option value={0}>Front</option>
                <option value={1}>Back</option>
              </select>
            ) : (
              <span className="muted">{i + 1}</span>
            )}
            <Along value={w.along} onCommit={(v) => setWindows(ws.map((x, j) => (j === i ? { ...x, along: v } : x)))} />
            <button className="link" aria-label={`Take roof window ${i + 1} away`} title="Take it away" onClick={() => setWindows(spread(ws.filter((_, j) => j !== i), w.side))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="roof-windows">
        <div className="name">
          <span className="label">On the roof</span>
          <button className="link" title="A frame of two solar panels (spread evenly; drag it along after)" onClick={() => addPiece('solar')}>
            + Solar panels
          </button>
          <button className="link" title="A chimney stack (spread evenly; drag it along after)" onClick={() => addPiece('chimney')}>
            + Chimney
          </button>
        </div>
        {ps.map((p, i) => (
          <div key={i} className="roof-window">
            <span className="muted">{p.kind === 'solar' ? 'Solar' : 'Chimney'}</span>
            {sides && (
              <select aria-label="Which slope" value={p.side} onChange={(e) => setPieces(spread(ps.map((x, j) => (j === i ? { ...x, side: Number(e.target.value) as 0 | 1 } : x)), Number(e.target.value) as 0 | 1))}>
                <option value={0}>Front</option>
                <option value={1}>Back</option>
              </select>
            )}
            <Along value={p.along} onCommit={(v) => setPieces(ps.map((x, j) => (j === i ? { ...x, along: v } : x)))} />
            <button className="link" aria-label={`Take ${p.kind === 'solar' ? 'the solar panels' : 'the chimney'} ${i + 1} away`} title="Take it away" onClick={() => setPieces(spread(ps.filter((_, j) => j !== i), p.side))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
