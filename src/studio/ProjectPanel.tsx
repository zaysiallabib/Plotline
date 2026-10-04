/**
 * Top bar → Building (ask 2): from a traced plan to the whole tower in a few clicks. "Use this plan as": a flat (stage 1:
 * floors from–to, a mirrored neighbour or none) or the building's ground floor / a basement / the rooftop (stage 2: a
 * shell, no furnishing — placed on the flats' columns, else where the same drawing puts it, else by the shift he types;
 * the panel says which) → Show building (the viewer's Building view). Saved in this browser (data/building/projects.ts,
 * like the draft); a plan already in a building shows where it stands there and can be changed, moved or taken out.
 */
import { useMemo, useState } from 'react'
import { formatFeetInches, newId, parseLength } from '../core'
import type { Pt, Unit } from '../core'
import { floorIn } from '../data/building'
import {
  levelOf,
  makeProject,
  placeFlat,
  placeLevel,
  placeOfLevel,
  placementOf,
  projectTower,
  readProjects,
  removeFlat,
  removeLevel,
  saveProjects,
  sheetOffset,
  type LevelKind,
  type Neighbour,
  type Placement,
  type Project,
} from '../data/building/projects'

interface Props {
  unit: Unit
  /** closed rooms in the draft (a building needs a flat) */
  roomCount: number
  /** saved: open the Building view of this draft, which stands on floors from–to */
  onShow: (from: number, to: number) => void
  /** saved as a level: open this Building view address (one of the building's flats, the level's floor picked) */
  onOpen: (url: string) => void
  onClose: () => void
  onToast: (text: string) => void
}

type Role = 'flat' | LevelKind
const ROLES: [Role, string][] = [
  ['flat', 'A flat'],
  ['ground', 'Ground floor'],
  ['basement', 'Basement'],
  ['common', 'Common floor'],
  ['rooftop', 'Rooftop'],
]
const SIDES: [Neighbour, string][] = [
  ['none', 'None'],
  ['left', 'Mirrored, left'],
  ['right', 'Mirrored, right'],
]
const levelName = (kind: LevelKind, n = 1) => (kind === 'ground' ? 'ground floor' : kind === 'rooftop' ? 'rooftop' : kind === 'common' ? `common floor ${n}` : `basement ${n}`)

/** A shift in feet-inches (14'-5", 4.4m …), negative allowed; commits metres on Enter / leaving the field. */
function ShiftInput({ valueM, onCommit }: { valueM: number; onCommit: (m: number) => void }) {
  const show = (m: number) => `${m < -0.0005 ? '-' : ''}${formatFeetInches(Math.abs(m))}`
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const t = text.trim()
    const m = parseLength(t.replace(/^-/, ''))
    if (m !== null) onCommit(t.startsWith('-') ? -m : m)
    setText(null)
  }
  return <input value={text ?? show(valueM)} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
}

export function ProjectPanel({ unit, roomCount, onShow, onOpen, onClose, onToast }: Props) {
  const [projects, setProjects] = useState(readProjects)
  const mine = projects.find((p) => p.flats[unit.id]) // the building this plan is a flat of
  const asLevel = projects.find((p) => levelOf(p, unit.id)) // … or a level of
  const lv = asLevel && levelOf(asLevel, unit.id)
  const at = mine && placementOf(mine, unit.id)
  const own = unit.floor && unit.floor > 0 ? unit.floor : 2
  const [role, setRole] = useState<Role>(lv?.kind ?? 'flat')
  const [target, setTarget] = useState(mine?.id ?? 'new')
  const [name, setName] = useState(mine?.name ?? (unit.projectName.trim() || 'Building'))
  const [from, setFrom] = useState(at?.from ?? own)
  const [to, setTo] = useState(at?.to ?? own + 5)
  const [neighbour, setNeighbour] = useState<Neighbour>(at?.neighbour ?? 'none')
  const into = projects.find((p) => p.id === target)
  // a level goes into a building that has a flat besides this plan
  const hosts = projects.filter((p) => Object.values(p.flats).some((f) => f.unitId !== unit.id))
  const [host, setHost] = useState(asLevel?.id ?? mine?.id ?? hosts[0]?.id ?? '')
  const [n, setN] = useState(lv?.n ?? 1)
  const [typed, setTyped] = useState<Pt | null>(lv?.by === 'typed' ? lv.offset : null)
  const hostP = hosts.find((p) => p.id === host) ?? hosts[0]
  /** the host's top floor of flats: a common floor goes under it */
  const topOf = hostP ? Math.max(1, ...hostP.floors.map((g) => g.to)) : 1
  const auto = useMemo(() => (hostP && role !== 'flat' ? placeOfLevel(removeFlat(hostP, unit.id) ?? hostP, unit) : null), [hostP, unit, role])
  const offset = typed ?? auto?.offset ?? { x: 0, y: 0 }
  const by: Placement = typed || !auto ? 'typed' : auto.by

  const store = (ps: Project[]): boolean => {
    if (!saveProjects(ps)) {
      onToast('This browser refused to save the building (storage full?)')
      return false
    }
    setProjects(ps)
    return true
  }
  /** every other building without this plan (it stands in one); null when he keeps a building that would lose its only flat */
  const others = (keep: string): Project[] | null => {
    const lost = projects.find((p) => p.id !== keep && p.flats[unit.id] && !removeFlat(p, unit.id))
    if (lost && !window.confirm(`This plan is the only flat of ${lost.name}: that building and its levels go. Continue?`)) return null
    return projects.flatMap((p) => (p.id === keep ? [] : p.flats[unit.id] ? (removeFlat(p, unit.id) ?? []) : [levelOf(p, unit.id) ? removeLevel(p, unit.id) : p]))
  }
  const show = () => {
    const lo = Math.max(1, Math.min(from, to))
    const hi = Math.min(99, Math.max(from, to, lo))
    const rest = others(target)
    if (!rest) return
    // into the chosen building (where it stood, else where its drawing puts it) or a new one
    const b = into && (levelOf(into, unit.id) ? removeLevel(into, unit.id) : into)
    const made = b ? placeFlat({ ...b, name: name.trim() || b.name }, unit, lo, hi, neighbour, placementOf(b, unit.id)?.offset ?? sheetOffset(b, unit)) : { ...makeProject(newId(), unit, lo, hi, neighbour), name: name.trim() || 'Building' }
    if (store([...rest, made])) onShow(lo, hi)
  }
  const showLevel = () => {
    if (!hostP || role === 'flat') return
    if (role === 'common' && topOf < 2) return onToast('A common floor goes under the flats: put the flats on higher floors first')
    const rest = others(hostP.id)
    if (!rest) return
    const made = placeLevel(hostP, unit, role, role === 'common' ? Math.min(n, topOf - 1) : n, offset, by)
    if (made === hostP) return onToast(`This plan is the only flat of ${hostP.name}: add another flat first`)
    if (!store([...rest, made])) return
    // the Building view of the building's first flat, this level's floor picked (a basement: what stands above it hidden)
    const t = projectTower(made)
    const flat = Object.keys(made.flats).find((s) => !made.flats[s].mirror) ?? Object.keys(made.flats)[0]
    onOpen(`/u/${encodeURIComponent(flat)}?floor=${floorIn(t, flat)}&view=building&pick=${t.LEVELS?.[unit.id] ?? 0}`)
  }
  const leave = () => {
    if (mine) {
      const left = removeFlat(mine, unit.id)
      if ((mine.levels ?? []).length && !left && !window.confirm(`${mine.name} has no other flat: it goes, with its ${mine.levels!.length} level(s). Continue?`)) return
      if (store(projects.flatMap((p) => (p !== mine ? [p] : left ? [left] : [])))) {
        setTarget('new')
        onToast(left ? `Taken out of ${mine.name}` : `${mine.name} removed (it had no other flat)`)
      }
    } else if (asLevel && store(projects.map((p) => (p === asLevel ? removeLevel(p, unit.id) : p)))) onToast(`Taken out of ${asLevel.name}`)
  }
  const flats = into ? Object.keys(into.flats).length : 0
  const pillars = unit.pillars?.length ?? 0
  const how = !auto
    ? `Not placed automatically: ${pillars ? 'its columns do not line up with the flats\'' : 'it has no columns (draw them with C)'} and it is another drawing. Move it right / down until it sits under the flats, then Show building to check.`
    : auto.by === 'columns'
      ? `Placed on the flats' columns: ${auto.matched} of its ${pillars} line up (within ${Math.max(1, Math.round((auto.errM ?? 0) * 100))} cm).`
      : 'Placed where the same drawing puts it.'

  return (
    <div className="popover project" onKeyDown={(e) => e.stopPropagation()}>
      <div className="head">
        <strong>{mine ? `Building · ${mine.name}` : asLevel && lv ? `${asLevel.name} · its ${levelName(lv.kind, lv.n)}` : 'Make a building'}</strong>
        <button className="link" title="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <label>
        <span>Use this plan as</span>
        <div className="seg">
          {ROLES.map(([k, label]) => (
            <button key={k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>
              {label}
            </button>
          ))}
        </div>
      </label>
      {!roomCount && role === 'flat' ? (
        <p className="muted">Close at least one room first: the building repeats this flat floor by floor.</p>
      ) : role === 'flat' ? (
        <>
          {projects.length > 0 && (
            <label>
              <span>Building</span>
              <select
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value)
                  setName(projects.find((p) => p.id === e.target.value)?.name ?? (unit.projectName.trim() || 'Building'))
                }}
              >
                <option value="new">A new building</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({Object.keys(p.flats).length} flat{Object.keys(p.flats).length === 1 ? '' : 's'} a floor)
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          </label>
          <div className="pair">
            <label>
              <span>This flat on floors</span>
              <input type="number" min={1} max={99} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} />
            </label>
            <label>
              <span>to</span>
              <input type="number" min={1} max={99} value={to} onChange={(e) => setTo(Number(e.target.value) || 1)} />
            </label>
          </div>
          <label>
            <span>Next to it on each floor</span>
            <div className="seg">
              {SIDES.map(([k, label]) => (
                <button key={k} className={neighbour === k ? 'on' : ''} onClick={() => setNeighbour(k)}>
                  {label}
                </button>
              ))}
            </div>
          </label>
          <p className="muted">
            {Math.abs(to - from) + 1} floor{to === from ? '' : 's'} × {neighbour === 'none' ? 1 : 2} flat{neighbour === 'none' ? '' : 's'}
            {into && !into.flats[unit.id] ? ` · joins the ${flats} flat${flats === 1 ? '' : 's'} already there (same drawing: placed where it was traced)` : ''}
            {' · floors below are filled with the same shells, the ground with its columns (or your traced ground floor)'}
          </p>
          <div className="actions">
            <button className="primary" onClick={show}>
              Show building
            </button>
            {mine && (
              <button title="This flat leaves the building (the others stay)" onClick={leave}>
                Take this flat out
              </button>
            )}
          </div>
        </>
      ) : !hostP ? (
        <p className="muted">Make the building from a typical flat first: open that flat here, Building → Show building. Then open this plan again and add it as its {levelName(role)}.</p>
      ) : (
        <>
          <label>
            <span>Building</span>
            <select value={hostP.id} onChange={(e) => setHost(e.target.value)}>
              {hosts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {role === 'basement' && (
            <label>
              <span>Basement number (1 = just below the ground floor)</span>
              <input type="number" min={1} max={9} value={n} onChange={(e) => setN(Math.max(1, Math.min(9, Number(e.target.value) || 1)))} />
            </label>
          )}
          {role === 'common' && (
            <label>
              <span>On floor (it takes that floor's place; under the top flats)</span>
              <input type="number" min={1} max={topOf - 1} value={Math.min(n, topOf - 1)} onChange={(e) => setN(Math.max(1, Math.min(topOf - 1, Number(e.target.value) || 1)))} />
            </label>
          )}
          <p className="muted">
            {typed ? 'Placed by your shift.' : how}
            {typed && auto && (
              <button className="link" onClick={() => setTyped(null)}>
                Back to the automatic place
              </button>
            )}
          </p>
          <div className="pair">
            <label>
              <span>Move it right</span>
              <ShiftInput valueM={offset.x} onCommit={(x) => setTyped({ ...offset, x })} />
            </label>
            <label>
              <span>Move it down</span>
              <ShiftInput valueM={offset.y} onCommit={(y) => setTyped({ ...offset, y })} />
            </label>
          </div>
          <p className="muted">Drawn in full and walkable (Building view → its floor → Walk this level), furnished by its rooms' and zones' kinds. Columns run through every level: auto-trace this plan after setting its scale (S) and its columns place it.</p>
          <div className="actions">
            <button className="primary" onClick={showLevel}>
              Show building
            </button>
            {asLevel && (
              <button title="This plan leaves the building" onClick={leave}>
                Take this plan out
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
