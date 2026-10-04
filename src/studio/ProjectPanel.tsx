/**
 * Top bar → Building (ask 2, stage 1): from a traced flat to the whole tower in a few clicks — floors from–to, a mirrored
 * neighbour or none, Show building (the viewer's Building view of this draft). Saved in this browser
 * (data/building/projects.ts, like the draft); a flat already in a building shows its floors there and can be changed,
 * added to another building traced off the same drawing (placed automatically), or taken out.
 */
import { useState } from 'react'
import { newId } from '../core'
import type { Unit } from '../core'
import { makeProject, placeFlat, placementOf, readProjects, removeFlat, saveProjects, sheetOffset, type Neighbour, type Project } from '../data/building/projects'

interface Props {
  unit: Unit
  /** closed rooms in the draft (a building needs a flat) */
  roomCount: number
  /** saved: open the Building view of this draft, which stands on floors from–to */
  onShow: (from: number, to: number) => void
  onClose: () => void
  onToast: (text: string) => void
}

const SIDES: [Neighbour, string][] = [
  ['none', 'None'],
  ['left', 'Mirrored, left'],
  ['right', 'Mirrored, right'],
]

export function ProjectPanel({ unit, roomCount, onShow, onClose, onToast }: Props) {
  const [projects, setProjects] = useState(readProjects)
  const mine = projects.find((p) => p.units[unit.id])
  const at = mine && placementOf(mine, unit.id)
  const own = unit.floor && unit.floor > 0 ? unit.floor : 2
  const [target, setTarget] = useState(mine?.id ?? 'new')
  const [name, setName] = useState(mine?.name ?? (unit.projectName.trim() || 'Building'))
  const [from, setFrom] = useState(at?.from ?? own)
  const [to, setTo] = useState(at?.to ?? own + 5)
  const [neighbour, setNeighbour] = useState<Neighbour>(at?.neighbour ?? 'none')
  const into = projects.find((p) => p.id === target)

  const store = (ps: Project[]): boolean => {
    if (!saveProjects(ps)) {
      onToast('This browser refused to save the building (storage full?)')
      return false
    }
    setProjects(ps)
    return true
  }
  const show = () => {
    const lo = Math.max(1, Math.min(from, to))
    const hi = Math.min(99, Math.max(from, to, lo))
    // the flat stands in one building: out of any other first; into the chosen one (placed off the same drawing) or a new one
    const rest = projects.flatMap((p) => (p.id === target || !p.units[unit.id] ? [p] : (removeFlat(p, unit.id) ?? [])))
    const base = rest.find((p) => p.id === target)
    const offset = base && (placementOf(base, unit.id)?.offset ?? sheetOffset(base, unit)) // where it stood, else where its drawing puts it
    const made = base ? placeFlat({ ...base, name: name.trim() || base.name }, unit, lo, hi, neighbour, offset) : { ...makeProject(newId(), unit, lo, hi, neighbour), name: name.trim() || 'Building' }
    if (store([...rest.filter((p) => p !== base), made])) onShow(lo, hi)
  }
  const leave = () => {
    if (!mine) return
    const left = removeFlat(mine, unit.id)
    if (store(projects.flatMap((p) => (p !== mine ? [p] : left ? [left] : [])))) {
      setTarget('new')
      onToast(left ? `Taken out of ${mine.name}` : `${mine.name} removed (it had no other flat)`)
    }
  }
  const flats = into ? Object.keys(into.flats).length : 0

  return (
    <div className="popover project" onKeyDown={(e) => e.stopPropagation()}>
      <div className="head">
        <strong>{mine ? `Building · ${mine.name}` : 'Make a building from this flat'}</strong>
        <button className="link" title="Close" onClick={onClose}>
          ×
        </button>
      </div>
      {!roomCount ? (
        <p className="muted">Close at least one room first: the building repeats this flat floor by floor.</p>
      ) : (
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
            {into && !into.units[unit.id] ? ` · joins the ${flats} flat${flats === 1 ? '' : 's'} already there (same drawing: placed where it was traced)` : ''}
            {' · floors below are filled with the same shells, the ground with its columns'}
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
      )}
    </div>
  )
}
