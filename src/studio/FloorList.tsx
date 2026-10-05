/**
 * Project first (founder 2026-10-05): the project's floors, always beside the plan — rooftop at the top, floors N..1,
 * ground, basements. Each floor takes a drawing (a "type": one whole-floor drawing); one drawing may serve any floors.
 * He works down the list: Draw (a new drawing for that floor) or Use drawing… (one he has), Open, Clear; "Also on floors"
 * puts the open drawing on more floors; Show building stacks them. Saved in this browser (data/building/projects.ts).
 */
import { useState } from 'react'
import type { Id, Unit } from '../core'
import { drawingName, parseFloors, planOf, removeDrawing, setSlot, slotsOf, type Project, type ProjectPlan, type Slot } from '../data/building/projects'
import { emptyUnit } from './model'
import { deletePicture } from './pictures'

const nameOf = (u: Pick<Unit, 'name'> | undefined) => u?.name.trim() || 'Untitled drawing'
/** a number box kept as typed (a cleared box is not a 0 yet), clamped when used */
const num = (s: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(s) || 0)))

/** The "New project" card: its name and shape (a ground floor always). */
export function NewProject({ onCreate }: { onCreate: (name: string, plan: ProjectPlan) => void }) {
  const [name, setName] = useState('')
  const [basements, setBasements] = useState('0')
  const [floors, setFloors] = useState('6')
  const [rooftop, setRooftop] = useState(true)
  const create = () => onCreate(name.trim() || 'New project', { basements: num(basements, 0, 5), floors: num(floors, 1, 60), rooftop })
  return (
    <div className="new-project">
      <strong>New project</strong>
      <label>
        <span>Name</span>
        <input value={name} placeholder="e.g. Sheltech Banani" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
      </label>
      <div className="pair">
        <label>
          <span>Basements</span>
          <input type="number" min={0} max={5} value={basements} onChange={(e) => setBasements(e.target.value)} />
        </label>
        <label>
          <span>Floors above ground</span>
          <input type="number" min={1} max={60} value={floors} onChange={(e) => setFloors(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={rooftop} onChange={(e) => setRooftop(e.target.checked)} /> Rooftop
      </label>
      <p className="muted">A ground floor is always there.</p>
      <button className="primary" onClick={create}>
        Create project
      </button>
    </div>
  )
}

interface Props {
  projects: Project[]
  project: Project | null
  /** the drawing open in the Studio (its id in the project), and the Studio's unit as it is now */
  drawing: Id | undefined
  unit: Unit
  /** the stored projects with the open drawing as it is now (a drawing in no project joins this one: never lost) */
  fresh: () => Project[]
  onStore: (ps: Project[]) => boolean
  onCreate: (name: string, plan: ProjectPlan) => void
  onActivate: (id: Id | null) => void
  /** store, then open drawing `id` in the Studio (null: an empty Studio) */
  onOpen: (ps: Project[], id: Id | null) => void
  onRename: (name: string) => void
  onShow: () => void
  onOldWay: () => void
  onClose: () => void
  onToast: (text: string) => void
}

export function FloorList({ projects, project, drawing, unit, fresh, onStore, onCreate, onActivate, onOpen, onRename, onShow, onOldWay, onClose, onToast }: Props) {
  const [also, setAlso] = useState('')
  // a clicked button lets go of the keys (Enter / Space on it again must not draw another floor)
  const blur = (e: React.MouseEvent) => e.target instanceof HTMLButtonElement && e.target.blur()

  if (!project)
    return (
      <aside className="floors" onClick={blur}>
        <div className="head">
          <strong>Building</strong>
          <button className="link" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <NewProject onCreate={onCreate} />
        {projects.length > 0 && (
          <label>
            <span>Or open a project</span>
            <select value="" onChange={(e) => e.target.value && onActivate(e.target.value)}>
              <option value="">Pick one…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="link" title="Today's way: this one plan as a flat on floors N to M, or as a ground floor / basement / rooftop" onClick={onOldWay}>
          Put only this plan into a building…
        </button>
      </aside>
    )

  const pid = project.id
  const named = (id: Id) => (id === drawing ? nameOf(unit) : nameOf(project.units[id]))
  const drawings = Object.keys(project.units).sort((a, b) => named(a).localeCompare(named(b)))
  const mine = (ps: Project[]) => ps.find((p) => p.id === pid)
  const change = (f: (p: Project) => Project) => {
    const ps = fresh()
    return onStore(ps.map((p) => (p.id === pid ? f(p) : p)))
  }
  const draw = (slot: Slot) => {
    const ps = fresh()
    const p = mine(ps)
    if (!p) return
    const u: Unit = { ...emptyUnit(), name: drawingName(p, slot), projectName: p.name, ...(slot !== 'R' && slot > 0 ? { floor: slot } : {}) }
    onOpen(
      ps.map((x) => (x === p ? setSlot(x, slot, u) : x)),
      u.id,
    )
  }
  const applyAlso = () => {
    const ks = parseFloors(also)
    if (!ks) return onToast('Type floor numbers, like 2, 4, 6-8')
    const top = planOf(project).floors
    const ok = ks.filter((k) => k >= 1 && k <= top)
    if (ok.length < ks.length) onToast(`This project has floors 1 to ${top} (the ground floor, basements and rooftop: use their own rows)`)
    if (drawing && ok.length && change((p) => ok.reduce((q, k) => setSlot(q, k, q.units[drawing] ?? null), p))) setAlso('')
  }
  const deleteDrawing = () => {
    if (!drawing || !window.confirm(`Delete the drawing "${nameOf(unit)}"? It leaves every floor it is on. This cannot be undone.`)) return
    void deletePicture(drawing).catch(() => {})
    onOpen(
      fresh().map((p) => (p.id === pid ? removeDrawing(p, drawing) : p)),
      null,
    )
  }
  const rename = () => {
    const name = window.prompt('Project name', project.name)?.trim()
    if (name) change((p) => ({ ...p, name }))
  }
  const remove = () => {
    if (!window.confirm(`Delete the project "${project.name}" and all its drawings? This cannot be undone.`)) return
    for (const id of Object.keys(project.units)) void deletePicture(id).catch(() => {})
    if (onStore(fresh().filter((p) => p.id !== pid))) onActivate(null)
  }
  const inProject = !!drawing && !!project.units[drawing]

  return (
    <aside className="floors" onClick={blur}>
      <div className="head">
        <strong title={project.name}>{project.name}</strong>
        <span>
          <button className="link" onClick={rename}>
            Rename
          </button>
          <button className="link" onClick={remove}>
            Delete
          </button>
          <button className="link" title="Close the project (nothing is lost; open it again from Building)" onClick={() => onActivate(null)}>
            Close
          </button>
        </span>
      </div>
      <button className="primary" title="All the floors stacked, in a new tab" onClick={onShow}>
        Show building
      </button>
      <ul className="slots">
        {slotsOf(project).map((r) => {
          const id = r.unitIds[0]
          const here = !!id && id === drawing
          return (
            <li key={String(r.slot)} className={here ? 'here' : ''}>
              <span className="lbl">{r.label}</span>
              <span className={id ? 'dwg' : 'dwg muted'}>{id ? `${named(id)}${r.unitIds.length > 1 ? ` + ${r.unitIds.length - 1} more` : ''}` : 'empty'}</span>
              <span className="acts">
                {!id ? (
                  <button title={`A new drawing for ${r.label.toLowerCase()}`} onClick={() => draw(r.slot)}>
                    Draw
                  </button>
                ) : (
                  !here && (
                    <button title="Open this drawing in the Studio" onClick={() => onOpen(fresh(), id)}>
                      Open
                    </button>
                  )
                )}
                {drawings.length > 0 && (
                  <select value="" title="Put one of your drawings on this floor" onChange={(e) => e.target.value && change((p) => setSlot(p, r.slot, p.units[e.target.value] ?? null))}>
                    <option value="">Use drawing…</option>
                    {drawings.map((d) => (
                      <option key={d} value={d}>
                        {named(d)}
                      </option>
                    ))}
                  </select>
                )}
                {id && (
                  <button className="link" title="This floor is empty again (the drawing is kept)" onClick={() => change((p) => setSlot(p, r.slot, null))}>
                    Clear
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {inProject ? (
        <section className="open-drawing">
          <label>
            <span>Open now</span>
            <input
              value={unit.name}
              placeholder="Name of this drawing"
              onChange={(e) => onRename(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </label>
          <label>
            <span>Also on floors</span>
            <div className="pair">
              <input
                value={also}
                placeholder="2, 4, 6-8"
                onChange={(e) => setAlso(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  applyAlso()
                  e.currentTarget.blur()
                }}
              />
              <button onClick={applyAlso}>Apply</button>
            </div>
          </label>
          <button className="link" onClick={deleteDrawing}>
            Delete this drawing
          </button>
        </section>
      ) : (
        <p className="muted">
          {unit.vertices.length
            ? "The plan open now is not one of this project's drawings yet: it is kept as one when you open a floor (then Use drawing… puts it on floors)."
            : 'Pick a floor: Draw makes a new drawing for it.'}
        </p>
      )}
    </aside>
  )
}
