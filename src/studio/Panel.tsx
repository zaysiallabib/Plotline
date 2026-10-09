import { useEffect, useState } from 'react'
import { FT, flatTypeOf, formatFeetInches, parseLength, sqmToSqft, wallFrame } from '../core'
import type { Flat, FurniturePlacement, Opening, OpeningKind, Room, RoomKind, Slope } from '../core'
import { placementLabel, placementSize } from '../furnish/kit'
import { library, resizeAxes } from './furniture'
import { EXTERIOR_M, PARTITION_M, WALL_TYPES, findEntity, formatLevel, openingDefaults, parseLevel, rampDirs, wallTypeOf, type StudioIssue, type StudioState, type WallType } from './model'
import { AI_KEY, TRACKER_KEY, type StudioAction as Action } from './review'
import type { Fix, Mark, MarkFixes, Severity } from './issues'
import type { AutoTraceStats, ReviewItem } from '../trace/types'

const SEVERITY: Record<Severity, string> = { red: 'Breaks the 3D', amber: 'Worth a look', grey: 'Cosmetic' }

/** what a review row is about, per kind (its number's tooltip) */
const REVIEW_KIND: Record<ReviewItem['kind'], string> = {
  'size-mismatch': 'Size differs from the printed size',
  unclosed: 'Outline not closed',
  unlabelled: 'Room has no name',
  'opening-guess': 'Opening kind is a guess',
  'low-confidence': 'Not sure about this',
  scale: 'Scale',
  other: 'Check this',
}
const SCALE_FROM: Record<AutoTraceStats['scaleFrom'], string> = { dims: 'printed dims', area: 'the printed area', thickness: 'wall thickness', given: 'your scale' }
const statsLine = (s: AutoTraceStats) =>
  `Traced ${s.walls} walls, ${s.rooms} rooms, ${s.labelled} labelled · scale from ${SCALE_FROM[s.scaleFrom]}${s.tracker === 'tracks' ? ' · wall tracks' : s.tracker === 'bands' ? ' · band tracker' : ''} · ${(s.ms / 1000).toFixed(1)} s`

/** the O tool's picker: kind + width in one click (no width = the kind's default) */
const PICKS: [OpeningKind, string, number?, boolean?][] = [
  ['door', `Door 2'-6"`, 2.5 * FT],
  ['door', `Door 3'-0"`, 3 * FT],
  ['window', "Window 4'", 4 * FT],
  ['window', "Window 6'", 6 * FT],
  ['slider', "Slider 6'", 6 * FT],
  ['slider', "Slider 8'", 8 * FT],
  ['passage', 'Passage'],
  ['window', 'Glass wall', undefined, true],
]

/** every kind in its picker group (a Record: a new RoomKind cannot be left out of the picker) */
const KIND_GROUP: Record<RoomKind, 'Rooms' | 'Common rooms' | 'Outdoor zones'> = {
  bed: 'Rooms', living: 'Rooms', dining: 'Rooms', kitchen: 'Rooms', bath: 'Rooms', balcony: 'Rooms', study: 'Rooms', closet: 'Rooms', utility: 'Rooms', shaft: 'Rooms', other: 'Rooms',
  lobby: 'Common rooms', gym: 'Common rooms', community: 'Common rooms', guard: 'Common rooms',
  lawn: 'Outdoor zones', paving: 'Outdoor zones', driveway: 'Outdoor zones', parking: 'Outdoor zones', deck: 'Outdoor zones', pool: 'Outdoor zones', planter: 'Outdoor zones', play: 'Outdoor zones',
}
const KIND_GROUPS = (['Rooms', 'Common rooms', 'Outdoor zones'] as const).map((g) => [g, (Object.keys(KIND_GROUP) as RoomKind[]).filter((k) => KIND_GROUP[k] === g)] as const)

/** the room / zone kind picker, grouped (the panel and the R tool's popover) */
export function KindSelect({ value, onChange }: { value: RoomKind; onChange: (k: RoomKind) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as RoomKind)}>
      {KIND_GROUPS.map(([g, kinds]) => (
        <optgroup key={g} label={g}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

/** A signed level text input (+3'-6", −1.5m, ±0); commits on Enter / blur; '' = no level; red when unreadable. */
function LevelInput({ valueM, onCommit, placeholder }: { valueM?: number; onCommit: (m: number | undefined) => void; placeholder: string }) {
  const show = (m?: number) => (m === undefined ? '' : formatLevel(m))
  const [text, setText] = useState(show(valueM))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(show(valueM))
    setBad(false)
  }, [valueM])
  const commit = () => {
    const m = parseLevel(text)
    if (m === null || (m !== undefined && Math.abs(m) > 100)) return setBad(true)
    setBad(false)
    if (m !== valueM) onCommit(m)
  }
  return <input className={bad ? 'bad' : ''} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => (e.key === 'Enter' && e.currentTarget.blur(), e.stopPropagation())} />
}

const ARROWS = ['↑', '→', '↓', '←']
/**
 * A label's floor level and ramp (panel and R popover): Floor level typed as printed; Ramp on → "to level" + one of the
 * four directions along its zone's edges (`dirs`, model.rampDirs) — or drag the arrow's head on the plan (V).
 */
export function LevelFields({ levelM, slope, dirs, onChange }: { levelM?: number; slope?: Slope; dirs: number[]; onChange: (p: { levelM?: number; slope?: Slope }) => void }) {
  return (
    <>
      <Row label={slope ? 'Floor level (at the arrow tail)' : 'Floor level'}>
        <LevelInput valueM={levelM} placeholder={`±0 · e.g. +3'-6"`} onCommit={(m) => onChange({ levelM: m, slope })} />
      </Row>
      <label className="check">
        <input type="checkbox" checked={!!slope} onChange={(e) => onChange({ levelM, slope: e.target.checked ? { toLevelM: levelM ?? 0, dirDeg: dirs[0] ?? 0 } : undefined })} /> Ramp
      </label>
      {slope && (
        <>
          <Row label="To level (at the arrow head)">
            <LevelInput valueM={slope.toLevelM} placeholder={`e.g. -5'-0"`} onCommit={(m) => onChange({ levelM, slope: { ...slope, toLevelM: m ?? 0 } })} />
          </Row>
          <div className="seg" title="Which way the ramp runs (from its floor level to its to level) — or drag the arrow's head on the plan with V">
            {dirs.map((d) => (
              <button key={d} className={Math.abs(d - slope.dirDeg) < 0.5 ? 'on' : ''} onClick={() => onChange({ levelM, slope: { ...slope, dirDeg: d } })}>
                {ARROWS[Math.round(d / 90) % 4]}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/** the W tool's wall types, keys 1–4 (Panel picker, the selected walls' type) */
export const WALL_KEYS: WallType[] = ['wall', 'low', 'kerb', 'zone']
const WALL_TIPS: Record<WallType, string> = {
  wall: 'Wall: storey height',
  low: "Low wall 1.1 m: a parapet, a screen — type its exact height after (select it, Height)",
  kerb: 'Kerb 0.15 m: a planter edge, a lawn kerb (no doors or windows)',
  zone: 'Zone line: the edge between two zones (lawn | paving | parking bay …) — drawn as nothing in 3D, no doors or windows',
}
function WallTypes({ value, onPick }: { value: WallType | null; onPick: (t: WallType) => void }) {
  return (
    <div className="seg">
      {WALL_KEYS.map((t, i) => (
        <button key={t} className={value === t ? 'on' : ''} title={`${WALL_TIPS[t]} (key ${i + 1})`} onClick={() => onPick(t)}>
          {WALL_TYPES[t].label}
        </button>
      ))}
    </div>
  )
}

export const formatArea = (sqm: number): string => `Area ${sqm.toFixed(1)} m² · ${Math.round(sqmToSqft(sqm))} sqft`

/** Feet-inch text input; commits meters on Enter/blur, red when unparseable. */
export function LenInput({ valueM, onCommit, placeholder }: { valueM: number; onCommit: (m: number) => void; placeholder?: string }) {
  const fmt = (m: number) => (Number.isFinite(m) ? formatFeetInches(m) : '') // NaN: a mixed selection
  const [text, setText] = useState(fmt(valueM))
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setText(fmt(valueM))
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
        if (e.key === 'Enter') e.currentTarget.blur() // commits (onBlur) and gives the keys back to the tools
        e.stopPropagation()
      }}
    />
  )
}

interface Props {
  state: StudioState
  dispatch: (a: Action) => void
  rooms: Room[]
  /** the drawing's flats (core.deriveFlats): a selected room's Flat pick */
  flats: Flat[]
  issues: StudioIssue[]
  /** the "Check these" rows, then the Issues, as marked on the plan (issues.ts markIssues) */
  marks: Mark[]
  /** working fixes per mark key; null while the plan is still changing */
  fixes: Map<string, MarkFixes> | null
  /** the mark open on the plan */
  active: string | null
  /** a row hovered: its mark pulses (null: none) */
  onHot: (key: string | null) => void
  /** a row clicked: the plan goes to its mark and opens it */
  onOpen: (m: Mark) => void
  onFix: (f: Fix) => void
  /** the furniture layer while tool F is on */
  pieces?: FurniturePlacement[] | null
  /** tool F's library: the kit asset being placed; pick one ('' stops) */
  placing?: string | null
  onPlace?: (assetId: string) => void
}

export function Panel({ state, dispatch, rooms, flats, issues, marks, fixes, active, onHot, onOpen, onFix, pieces, placing, onPlace }: Props) {
  const piece = pieces?.find((p) => state.selection.length === 1 && p.id === state.selection[0])
  const { unit } = state
  const review = marks.filter((m) => m.review)
  const listed = marks.filter((m) => m.issue)
  // a mark opened on the plan: its row comes into view once (not on every render: the timer re-renders each second)
  useEffect(() => {
    if (active) document.querySelector('.panel .issues li.on')?.scrollIntoView({ block: 'nearest' })
  }, [active])
  /** one row of either list: its number in its severity's colour (= the mark on the plan), the message, the working fixes */
  const row = (m: Mark, extra?: React.ReactNode) => {
    const key = m.twinOf ?? m.key // a "Check these" row on an issue's spot is that issue's mark
    const f = fixes?.get(key)
    const acts = !!(f?.fixes.length || f?.nameAt || extra)
    return (
      <li
        key={m.key}
        className={`${m.at ? 'find' : ''}${key === active ? ' on' : ''}${m.severity === 'grey' ? ' grey' : ''}`}
        title={m.at ? 'Click to go to it on the plan' : undefined}
        onMouseEnter={() => m.at && onHot(key)}
        onMouseLeave={() => onHot(null)}
        onClick={() => m.at && onOpen(m)}
      >
        <span className={`num ${m.severity}`} title={m.review ? REVIEW_KIND[m.review.kind] : SEVERITY[m.severity]}>
          {m.n ?? ''}
        </span>
        <span className="grow">
          {m.message}
          {acts && (
            <span className="acts">
              {f?.fixes.map((x) => (
                <button
                  key={x.label}
                  className="link"
                  title={x.title}
                  onClick={(e) => {
                    e.stopPropagation()
                    onFix(x)
                  }}
                >
                  {x.label}
                </button>
              ))}
              {f?.nameAt && (
                <button className="link" title="Type the name on the plan">
                  Name it
                </button>
              )}
              {extra}
            </span>
          )}
        </span>
      </li>
    )
  }
  const stats = state.review?.unitId === unit.id ? state.review.stats : null
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
      {state.tool === 'opening' && <OpeningPick state={state} dispatch={dispatch} />}
      {state.tool === 'wall' && (
        <section>
          <h3>Draw a</h3>
          <WallTypes value={state.wallType ?? 'wall'} onPick={(t) => dispatch({ type: 'pick-wall', wall: t })} />
          {state.wallType === 'low' && (
            <Row label="Low wall height">
              <LenInput valueM={state.lowWallM ?? WALL_TYPES.low.heightM} onCommit={(m) => m > 0 && dispatch({ type: 'pick-wall', wall: 'low', lowWallM: m })} />
            </Row>
          )}
          <p className="muted">{WALL_TIPS[state.wallType ?? 'wall']} · keys 1–4 (not while typing a length)</p>
        </section>
      )}
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
        {piece ? (
          <PieceProps p={piece} rooms={rooms} dispatch={dispatch} edited={unit.furniture.length > 0} />
        ) : pieces ? (
          <p className="muted">Nothing selected. Click a piece of furniture.</p>
        ) : (
          <Selection state={state} dispatch={dispatch} rooms={rooms} flats={flats} />
        )}
      </section>
      {pieces && onPlace && (
        <section>
          <h3>Add a piece</h3>
          <select value={placing ?? ''} onChange={(e) => onPlace(e.target.value)}>
            <option value="">Pick from the library…</option>
            {library().map((t) => (
              <optgroup key={t.tab} label={t.tab}>
                {t.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label} · {i.size.x.toFixed(2)} × {i.size.z.toFixed(2)} m
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {placing && <p className="muted">Click the plan to put it there · R turns · Esc cancels</p>}
        </section>
      )}
      {state.planImage && (
        <section>
          <h3>{review.length ? `Check these (${review.length})` : 'Check these'}</h3>
          {stats && <p className="muted">{statsLine(stats)}</p>}
          {/* never a silent guess, and it stays on screen (a toast was gone before it was read — user test, session 21) */}
          {stats && stats.labelled < 2 && <p className="warn">Auto-trace is made for flats. On a ground floor, basement or rooftop it finds little: draw it with W and name the areas with R.</p>}
          {stats?.scaleFrom === 'thickness' && <p className="warn">No printed size was found, so the scale is a GUESS. Press S and click the two ends of anything whose length you know (the plot's width is best).</p>}
          {review.length ? (
            <ul className="issues">
              {review.map((m) =>
                row(
                  m,
                  <button
                    className="link"
                    title="Take it off the list"
                    onClick={(e) => {
                      e.stopPropagation()
                      dispatch({ type: 'dismiss-review', id: m.review!.id })
                    }}
                  >
                    Looks right
                  </button>,
                ),
              )}
            </ul>
          ) : (
            <p className="muted">{stats ? 'Nothing left to check.' : 'Auto-trace (top bar) lists here what it is unsure of.'}</p>
          )}
          <TrackerField />
          <AiKeyField />
        </section>
      )}
      <section>
        <h3>{issues.length ? `Issues (${issues.length})` : 'Issues'}</h3>
        {unit.walls.length > 1 && (
          <button className="link" title="Every wall end inside another wall's body is joined there and every crossing is split — one undo step" onClick={() => dispatch({ type: 'join-walls' })}>
            Join walls (overlaps and crossings)
          </button>
        )}
        {listed.length === 0 ? (
          <p className="muted">No issues. Ready to export.</p>
        ) : (
          <>
            <p className="muted legend">
              <span className="num red" /> breaks the 3D <span className="num amber" /> worth a look <span className="num grey" /> cosmetic
            </p>
            <ul className="issues">{listed.map((m) => row(m))}</ul>
          </>
        )}
      </section>
    </aside>
  )
}

/** O tool: what the next click on a wall places (kind + width); the ghost on the wall shows exactly this */
function OpeningPick({ state, dispatch }: { state: StudioState; dispatch: (a: Action) => void }) {
  const kind = state.lastOpeningKind
  const auto = state.lastOpeningWidthM === undefined
  const widthM = state.lastOpeningWidthM ?? openingDefaults(kind, false).widthM
  return (
    <section>
      <h3>Place an opening</h3>
      <div className="props">
        <div className="seg">
          {PICKS.map(([k, label, w, glass]) => (
            <button key={label} className={!!glass === !!state.glassPick && k === kind && (w === undefined || Math.abs(w - widthM) < 1e-6) ? 'on' : ''} onClick={() => dispatch({ type: 'pick-opening', kind: k, widthM: w, glass })}>
              {label}
            </button>
          ))}
        </div>
        <Row label="Width">
          <LenInput valueM={widthM} onCommit={(m) => dispatch({ type: 'pick-opening', kind, widthM: m })} />
        </Row>
        <p className="muted">
          {state.glassPick ? 'Click a wall: all of it becomes glass, floor to top. Shorter glass? Drag its end, or split the wall first (W, click on it)' : 'Click a wall to place it'} · keys 1 door, 2 window, 3 slider, 4 passage{auto && kind === 'door' ? ` · a door on a bath wall is 2'-6"` : ''}
        </p>
      </div>
    </section>
  )
}

function Selection({ state, dispatch, rooms, flats }: { state: StudioState; dispatch: (a: Action) => void; rooms: Room[]; flats: Flat[] }) {
  const { unit, selection, chain } = state
  const ents = selection.map((id) => findEntity(unit, id)).filter((e) => e !== null)

  if (chain) {
    return (
      <div className="props">
        <p className="muted">Tracing · {chain.ids.length} corner{chain.ids.length === 1 ? '' : 's'}</p>
        <Thickness value={chain.thicknessM} onChange={(t) => dispatch({ type: 'chain-thickness', thicknessM: t })} />
      </div>
    )
  }
  if (!ents.length) return <p className="muted">Nothing selected. Click a corner, wall, opening or room label.</p>

  if (ents.length > 1) {
    const walls = ents.filter((e) => e.kind === 'wall')
    const ids = walls.map((w) => w.w.id)
    const type = walls.length && walls.every((w) => wallTypeOf(w.w.heightM) === wallTypeOf(walls[0].w.heightM)) ? wallTypeOf(walls[0].w.heightM) : null
    return (
      <div className="props">
        <p className="muted">{ents.length} selected</p>
        {walls.length > 0 && (
          <>
            <WallTypes value={type} onPick={(t) => dispatch({ type: 'set-wall-type', ids, wall: t })} />
            <Row label="Height (all of them)">
              <LenInput placeholder="mixed" valueM={walls.every((w) => w.w.heightM === walls[0].w.heightM) ? walls[0].w.heightM : NaN} onCommit={(m) => dispatch({ type: 'set-wall-type', ids, wall: wallTypeOf(m), heightM: m })} />
            </Row>
            <Thickness
              value={walls.every((w) => w.kind === 'wall' && w.w.thicknessM === walls[0].w.thicknessM) ? walls[0].w.thicknessM : NaN}
              onChange={(t) => walls.forEach((w) => dispatch({ type: 'update-wall', id: w.w.id, patch: { thicknessM: t } }))}
            />
            <StandsAlone ids={ids} on={walls.every((w) => w.w.standsAlone)} dispatch={dispatch} />
          </>
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
          {WALL_TYPES[wallTypeOf(w.heightM)].label} · {formatFeetInches(len)} · {len.toFixed(2)} m
        </p>
        <WallTypes value={wallTypeOf(w.heightM)} onPick={(t) => dispatch({ type: 'set-wall-type', ids: [w.id], wall: t })} />
        <Thickness value={w.thicknessM} onChange={(t) => dispatch({ type: 'update-wall', id: w.id, patch: { thicknessM: t } })} />
        <Row label="Height (0 = zone line)">
          <LenInput valueM={w.heightM} onCommit={(m) => dispatch({ type: 'set-wall-type', ids: [w.id], wall: wallTypeOf(m), heightM: m })} />
        </Row>
        <StandsAlone ids={[w.id]} on={!!w.standsAlone} dispatch={dispatch} />
        <Row label="Length (moves B)">
          <LenInput valueM={len} onCommit={(m) => dispatch({ type: 'set-wall-length', id: w.id, lengthM: m })} />
        </Row>
        <p className="muted">Typed length: walls at B stay straight. Drag an end handle to extend this wall alone until it meets a wall (Alt: neighbours follow).</p>
        <button className="link" onClick={() => dispatch({ type: 'duplicate' })}>
          Copy wall (Ctrl+D)
        </button>
        <button className="link" onClick={() => dispatch({ type: 'delete', ids: [w.id] })}>
          Delete wall (Del)
        </button>
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
          {(
            [
              ['door', 'Door'],
              ['slider', 'Sliding door'],
              ['window', 'Window'],
              ['passage', 'Passage'],
            ] as [OpeningKind, string][]
          ).map(([k, label]) => (
            <button key={k} className={o.kind === k ? 'on' : ''} onClick={() => patch({ kind: k })}>
              {label}
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
        {(o.kind === 'window' || o.kind === 'slider') && (
          <Row label="Curtains">
            <label className="check">
              <input type="checkbox" checked={o.curtains !== false} onChange={(e) => patch({ curtains: e.target.checked ? undefined : false })} /> in bed / living / dining / study
            </label>
          </Row>
        )}
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
  if (e.kind === 'pillar') {
    const p = e.p
    return (
      <div className="props">
        <p className="muted">
          Column · {formatFeetInches(p.wM)} × {formatFeetInches(p.hM)}
        </p>
        <Row label="Width (across)">
          <LenInput valueM={p.wM} onCommit={(m) => dispatch({ type: 'set-pillar', id: p.id, patch: { wM: m } })} />
        </Row>
        <Row label="Depth (up–down)">
          <LenInput valueM={p.hM} onCommit={(m) => dispatch({ type: 'set-pillar', id: p.id, patch: { hM: m } })} />
        </Row>
        <p className="muted">Drag it to move it (it snaps to walls and corners), drag a corner dot to size it, arrows nudge 1".</p>
        <button className="link" onClick={() => dispatch({ type: 'delete', ids: [p.id] })}>
          Delete column (Del)
        </button>
      </div>
    )
  }
  const l = e.l
  const room = rooms.find((r) => r.id === l.id)
  // the Flat pick: the flats its doors give (core.deriveFlats); picking another pins the room there by name, "Not in a
  // flat" pins '' (the lobby a door joined to both flats), "By its doors" takes the pin away
  const inFlat = flats.find((f) => f.roomIds.includes(l.id))
  let k = flats.length + 1
  while (flats.some((f) => f.name === `Flat ${k}`)) k++
  const pickFlat = (v: string) =>
    dispatch({ type: 'update-label', id: l.id, patch: { flat: v === 'auto' ? undefined : v === 'none' ? '' : v === 'new' ? `Flat ${k}` : v.slice(2) } })
  return (
    <div className="props">
      <Row label="Room name">
        <input value={l.name} onChange={(ev) => dispatch({ type: 'update-label', id: l.id, patch: { name: ev.target.value } })} />
      </Row>
      <Row label="Kind">
        <KindSelect value={l.kind} onChange={(kind) => dispatch({ type: 'update-label', id: l.id, patch: { kind } })} />
      </Row>
      {room && (
        <Row label={l.flat === undefined ? 'Flat (by its doors)' : 'Flat (moved by hand)'}>
          <select value={inFlat ? `f:${inFlat.name}` : 'none'} onChange={(ev) => pickFlat(ev.target.value)}>
            {flats.map((f) => (
              <option key={f.key} value={`f:${f.name}`}>
                {f.name}
              </option>
            ))}
            <option value="none">Not in a flat</option>
            <option value="new">New flat (Flat {k})</option>
            {l.flat !== undefined && <option value="auto">Back to: by its doors</option>}
          </select>
        </Row>
      )}
      <Row label="Printed size">
        <input value={l.printedSize ?? ''} onChange={(ev) => dispatch({ type: 'update-label', id: l.id, patch: { printedSize: ev.target.value } })} />
      </Row>
      <LevelFields levelM={l.levelM} slope={l.slope} dirs={room ? rampDirs(room, unit) : [0, 90, 180, 270]} onChange={(patch) => dispatch({ type: 'update-label', id: l.id, patch })} />
      <p className="muted">{room ? formatArea(room.areaSqm) : typeLine(l, flats)}</p>
      <button className="link" onClick={() => dispatch({ type: 'delete', ids: [l.id] })}>
        Remove
      </button>
    </div>
  )
}

/** A label that names no room: a flat's "Type A ±2736 sft" (its rooms' area against the printed one), else a stray label. */
function typeLine(l: { name: string; kind: RoomKind }, flats: Flat[]): string {
  const name = flatTypeOf(l)
  const f = name && flats.find((x) => x.name === name)
  if (!name) return 'Label is not inside a closed room'
  if (!f) return `Names a flat (${name}) — put it inside one of that flat's rooms`
  return `Names the flat ${name}: its ${f.roomIds.length} rooms add up to ${Math.round(sqmToSqft(f.areaSqm))} sft${f.printedSqft ? `, printed ±${f.printedSqft} sft (walls and a share of the lobby are in that)` : ''}`
}

/** A selected piece (tool F). X/Y go through the same grid + wall snap as a drag; no free placement. */
function PieceProps({ p, rooms, dispatch, edited }: { p: FurniturePlacement; rooms: Room[]; dispatch: (a: Action) => void; edited: boolean }) {
  const room = rooms.find((r) => r.id === p.roomId)
  const move = (x: number, y: number) => dispatch({ type: 'move-piece', id: p.id, x, y })
  const size = placementSize(p)
  return (
    <div className="props">
      <p>{placementLabel(p)}</p>
      <p className="muted">
        {room?.name ?? 'No room'} · turned {Math.round(p.rotationDeg)}°
      </p>
      <Row label="X (m)">
        <NumInput value={p.x} onCommit={(x) => move(x, p.y)} />
      </Row>
      <Row label="Y (m)">
        <NumInput value={p.y} onCommit={(y) => move(p.x, y)} />
      </Row>
      <Row label="Rotation">
        <div className="seg">
          <button onClick={() => dispatch({ type: 'rotate-piece', id: p.id })}>Turn 90° (R)</button>
          <button title="Delete this piece (and what rests on it); Undo or Reset to preset brings it back" onClick={() => dispatch({ type: 'delete-piece', id: p.id })}>
            Delete
          </button>
        </div>
      </Row>
      {resizeAxes(p.assetId).length ? (
        resizeAxes(p.assetId).map((k) => (
          <Row key={k} label={`${{ x: 'W', z: 'D', y: 'H' }[k]} (m)`}>
            <NumInput value={size[k]} onCommit={(v) => dispatch({ type: 'resize-piece', id: p.id, sizeM: { ...size, [k]: v } })} />
          </Row>
        ))
      ) : (
        <p className="muted">This piece can be moved and turned</p>
      )}
      <div className="seg">
        <button disabled={!edited} title={`Put ${room?.name ?? 'this room'} back to the preset layout`} onClick={() => dispatch({ type: 'reset-furniture', roomId: p.roomId })}>
          Reset to preset
        </button>
        <button disabled={!edited} title="Every room back to the preset layout" onClick={() => dispatch({ type: 'reset-furniture' })}>
          Reset all
        </button>
      </div>
    </div>
  )
}

/** Auto-trace's wall stage (wave 19): the wall tracks — straight walls of exactly their drawn thickness, stopping where the ink stops — or the skeleton. This browser only. */
function TrackerField() {
  const [bands, setBands] = useState(() => {
    try {
      return localStorage.getItem(TRACKER_KEY) !== 'skeleton'
    } catch {
      return true
    }
  })
  const save = (on: boolean) => {
    setBands(on)
    try {
      if (on) localStorage.removeItem(TRACKER_KEY)
      else localStorage.setItem(TRACKER_KEY, 'skeleton')
    } catch {
      /* storage blocked: the choice lives until reload */
    }
  }
  return (
    <label className="tracker" title="On: one straight wall per drawn wall, exactly as thick as drawn, stopping where its ink stops; a door or window only where a swing or glazing is drawn (wave 19). Off: the older skeleton tracer, walls classed 5&quot; or 10&quot;.">
      <input type="checkbox" checked={bands} onChange={(e) => save(e.target.checked)} /> Wall tracks (exact walls, drawn openings only)
    </label>
  )
}

/** The optional Gemini key for auto-trace's backup label reader: this browser's localStorage only, never exported. */
function AiKeyField() {
  const [key, setKey] = useState(() => {
    try {
      return localStorage.getItem(AI_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const save = (v: string) => {
    setKey(v)
    try {
      if (v.trim()) localStorage.setItem(AI_KEY, v.trim())
      else localStorage.removeItem(AI_KEY)
    } catch {
      /* storage blocked: the key lives until reload */
    }
  }
  return (
    <details className="ai-key">
      <summary>AI helper (optional){key ? ' · key set' : ''}</summary>
      <input type="password" placeholder="Gemini API key" value={key} onChange={(e) => save(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <p className="muted">
        Only used to re-read labels the built-in reader could not; free keys work (
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          get one
        </a>
        ). Stays in this browser.
      </p>
    </details>
  )
}

/** said up front: its loose ends are meant (no "Loose wall end" marks) — "Keep — it stands alone" on a mark does the same */
function StandsAlone({ ids, on, dispatch }: { ids: string[]; on: boolean; dispatch: (a: Action) => void }) {
  return (
    <label className="check" title="A screen, fin, parapet length, decorative or wind wall: its free ends are meant, never an issue">
      <input type="checkbox" checked={on} onChange={(e) => dispatch({ type: 'stand-alone', ids, on: e.target.checked })} /> Stands alone (screen / decoration)
    </label>
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
        if (e.key === 'Enter') e.currentTarget.blur() // commits (onBlur) and gives the keys back to the tools
        e.stopPropagation()
      }}
    />
  )
}

/** Wall width: the inches field (Enter / leaving it applies) with the two usual widths as presets; NaN = mixed selection */
function Thickness({ value, onChange }: { value: number; onChange: (t: number) => void }) {
  const show = (m: number) => (Number.isFinite(m) ? String(+((m / FT) * 12).toFixed(1)) : '')
  const [inches, setInches] = useState(() => show(value))
  useEffect(() => setInches(show(value)), [value])
  const commitInches = () => {
    const n = Number(inches)
    const m = (n / 12) * FT
    if (inches.trim() && n > 0 && n < 60 && !(Math.abs(m - value) < 1e-6)) onChange(m)
    else setInches(show(value)) // bad or unchanged text: the field shows the wall's width again
  }
  const is = (m: number) => Math.abs(value - m) < 1e-6
  return (
    <Row label="Width (inches)">
      <input
        value={inches}
        inputMode="decimal"
        onChange={(e) => setInches(e.target.value)}
        onBlur={commitInches}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur() // applies (onBlur) and gives the keys back to the tools
          e.stopPropagation()
        }}
        placeholder={Number.isFinite(value) ? 'inches' : 'mixed'}
      />
      <div className="seg">
        <button className={is(PARTITION_M) ? 'on' : ''} onClick={() => onChange(PARTITION_M)}>
          Partition 5"
        </button>
        <button className={is(EXTERIOR_M) ? 'on' : ''} onClick={() => onChange(EXTERIOR_M)}>
          Exterior 10"
        </button>
      </div>
    </Row>
  )
}
