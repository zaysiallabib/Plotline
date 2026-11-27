/**
 * Project first (founder 2026-10-05): the project's floors, always beside the plan — rooftop at the top, floors N..1,
 * ground, basements. Each floor takes a drawing (a "type": one whole-floor drawing); one drawing may serve any floors.
 * He works down the list: Draw (a new drawing for that floor) or Use drawing… (one he has), Open, Clear; "Also on floors"
 * puts the open drawing on more floors; Show building stacks them. Saved in this browser (data/building/projects.ts).
 * Session 31 frame: the column IS the project, whatever was dropped — its floors first, each saying where its drawing came
 * from (Project.from: "from page 7 · 2ND FLOOR PLAN · 1 : 48", "from Flat-A.dxf", "traced on img_3.webp"), then the open
 * drawing, the floor plans, the views kept from the set by kind, the site, and (signed in) members and links.
 */
import { useState } from 'react'
import { deriveFlats, deriveRooms, newId } from '../core'
import type { Id, Unit } from '../core'
import { drawingName, forkFloor, parseFloors, planOf, removeDrawing, setSlot, slotsOf, slotsText, slotsWith, type Project, type ProjectPlan, type Slot } from '../data/building/projects'
import { copyKept, floorAnswer, setFloorAnswer } from '../viewer/arrange'
import { titleOf } from '../viewer/defaults'
import type { SheetKind } from '../import/sheets'
import { emptyUnit } from './model'
import { copyPicture, deletePicture } from './pictures'
import { ask, askText } from '../lib/ask'
import { roofOf, roofWords } from '../data/building/roof'
import { RoofFields } from './RoofFields'

/** a drawing's name: its own, else what Preview 3D calls it ("Floor plan A", "Type A"); per unit object (the list re-renders every second) */
const titleCache = new WeakMap<Unit, string>()
const nameOf = (u: Unit | undefined): string => {
  const own = u?.name.trim()
  if (!u || own || !u.walls.length) return own || 'Untitled drawing'
  return titleCache.get(u) ?? titleCache.set(u, titleOf(u, deriveRooms(u))).get(u)!
}
/** a drawing's flats, "Type A, Type B" (derived, never stored); per unit object: the list re-renders every second */
const flatCache = new WeakMap<Unit, string>()
const flatsOf = (u: Unit | undefined): string => {
  if (!u) return ''
  if (!flatCache.has(u)) flatCache.set(u, deriveFlats(u, deriveRooms(u)).map((f) => f.name).join(', '))
  return flatCache.get(u)!
}
/** a drawing's flats by name, west → east (derived, never stored; per unit object) — the 3D's "Furnish in 3D" picks */
const nameCache = new WeakMap<Unit, string[]>()
const flatNames = (u: Unit): string[] => nameCache.get(u) ?? nameCache.set(u, deriveFlats(u, deriveRooms(u)).map((f) => f.name)).get(u)!
/** a number box kept as typed (a cleared box is not a 0 yet), clamped when used */
const num = (s: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(s) || 0)))
/** the floor menu's "This floor only" (never a unit id: ids have no spaces) */
const OWN = ' own'

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
        <input autoFocus value={name} placeholder="e.g. Sheltech Banani" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
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
  /** s31 bigifc: the flats of the open drawing the 3D furnishes (undefined: all of them) */
  onFurnish: (names: string[] | undefined) => void
  onShow: () => void
  onOldWay: () => void
  onClose: () => void
  onToast: (text: string) => void
  /** a kept drawing of the set (Project.sheets), shown big */
  onSheet: (id: Id, title: string) => void
  /** where the building stands (one site for the project): its line, and the Site panel opened / closed (as ⋯ → Site) */
  site: { line: string; open: boolean; onToggle: () => void }
  /** signed in to a company: the account card on its Members or Links (as ⋯ → your email); absent: neither shows */
  onAccount?: (pane: 'members' | 'links') => void
  /** the open drawing's name while none is typed, as the top bar shows it ("Floor plan A"): worked out once, by the Studio */
  untitled: string
}

/** the views kept from the set, by kind, in the order an architect's set binds them: "Elevations 4" */
const KEPT_GROUPS: [SheetKind, string][] = [
  ['site', 'Site'],
  ['elevation', 'Elevations'],
  ['section', 'Sections'],
  ['schedule', 'Schedules'],
  ['interior', 'Interior elevations'],
  ['detail', 'Details'],
  ['title', 'Title pages'],
  ['other', 'Other drawings'],
  ['plan', 'Plans'],
]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function FloorList({ projects, project, drawing, unit, fresh, onStore, onCreate, onActivate, onOpen, onRename, onFurnish, onShow, onOldWay, onClose, onToast, onSheet, site, onAccount, untitled }: Props) {
  const [also, setAlso] = useState<Record<Id, string>>({})
  /** the roof's fields open under its line */
  const [roofOpen, setRoofOpen] = useState(false)
  // a clicked button lets go of the keys (Enter / Space on it again must not draw another floor)
  const blur = (e: React.MouseEvent) => e.target instanceof HTMLButtonElement && e.target.blur()

  if (!project)
    return (
      <aside className="floors" onClick={blur}>
        <div className="head">
          <strong>Building</strong>
          <button className="x" title="Close" onClick={onClose}>
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
  const named = (id: Id) => (id === drawing ? unit.name.trim() || untitled : nameOf(project.units[id]))
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
  /** drawing `id` goes on the floors typed for it ("2, 4, 6-8"): one floor plan on many floors, any pattern (founder 2026-10-05, -19) */
  const applyAlso = async (id: Id) => {
    const ks = parseFloors(also[id] ?? '')
    if (!ks) return onToast('Type floor numbers, like 2, 4, 6-8')
    const top = planOf(project).floors
    const ok = ks.filter((k) => k >= 1 && k <= top)
    if (ok.length < ks.length) onToast(`This project has floors 1 to ${top} (the ground floor, basements and rooftop: use their own rows)`)
    if (!ok.length) return
    // never a silent swap: a floor that carries another drawing is named first (user test, session 21)
    const taken = slotsOf(project).filter((r) => typeof r.slot === 'number' && ok.includes(r.slot) && r.unitIds.length && !r.unitIds.includes(id))
    if (taken.length && !(await ask(`${taken.map((r) => `${r.label} has "${named(r.unitIds[0])}"`).join(', ')}. Put "${named(id)}" there instead? (The other drawing is kept.)`, 'Put it there'))) return
    if (change((p) => ok.reduce((q, k) => setSlot(q, k, q.units[id] ?? null), p))) setAlso((a) => ({ ...a, [id]: '' }))
  }
  /** a copy of drawing `id` as a new floor plan (for the floor that differs a little), with its picture; on no floor yet */
  const copyDrawing = (id: Id) => {
    const src = id === drawing ? unit : project.units[id]
    if (!src) return
    const u: Unit = { ...src, id: newId(), name: `${nameOf(src)} copy` }
    void copyPicture(id, u.id)
    if (change((p) => ({ ...p, units: { ...p.units, [u.id]: u }, ...(p.from?.[id] ? { from: { ...p.from, [u.id]: p.from[id] } } : {}) }))) onToast(`${u.name}: type its floors under Floor plans, or Use drawing… on a floor`)
  }
  /** where drawing `id` stands now, bottom up: "B1, G, 2, 4, 6, Roof" */
  const floorsOf = (id: Id) => slotsText(slotsWith(project, id))
  /** where drawing `id` came from, as said when it came in; an older project's picture drawing: the picture it was traced on */
  const sourceOf = (id: Id): string => {
    const u = id === drawing ? unit : project.units[id]
    return project.from?.[id]?.line ?? (u?.planImage?.src ? `traced on ${u.planImage.src}` : '')
  }
  /**
   * "This floor only" (founder 2026-11-20): floor `slot` gets its own copy of drawing `id` (forkFloor: the others keep it),
   * with its picture, arranged layout and notes, and the copy opens — what he changes then stays on this floor.
   */
  const ownFloor = (slot: Slot, id: Id, label: string) => {
    const ps = fresh()
    const p = mine(ps)
    const f = newId()
    const q = p && forkFloor(p, slot, id, f)
    if (!p || !q || q === p) return
    copyKept(id, f, typeof slot === 'number' ? slot : undefined) // that floor's furniture and finishes go with it
    void copyPicture(id, f).then(() => {
      onOpen(
        ps.map((x) => (x === p ? q : x)),
        f,
      )
      onToast(`${label} has its own drawing now: what you change on it stays on this floor`)
    })
  }
  const said = floorAnswer(pid)
  const deleteDrawing = async () => {
    if (!drawing || !(await ask(`Delete the drawing "${nameOf(unit)}"? It leaves every floor it is on. This cannot be undone.`, 'Delete', true))) return
    void deletePicture(drawing).catch(() => {})
    onOpen(
      fresh().map((p) => (p.id === pid ? removeDrawing(p, drawing) : p)),
      null,
    )
  }
  const rename = async () => {
    const name = (await askText('The project’s name', { value: project.name }, 'Rename'))?.trim()
    if (name) change((p) => ({ ...p, name }))
  }
  const remove = async () => {
    if (!(await ask(`Delete the project "${project.name}" and all its drawings? This cannot be undone.`, 'Delete', true))) return
    for (const id of [...Object.keys(project.units), ...(project.sheets ?? []).map((s) => s.id)]) void deletePicture(id).catch(() => {})
    if (onStore(fresh().filter((p) => p.id !== pid))) onActivate(null)
  }
  const inProject = !!drawing && !!project.units[drawing]
  // a whole floor of many flats (an architect's storey): which of them the 3D furnishes — the others stand bare
  const flatsHere = inProject ? flatNames(unit) : []
  const furnished = (f: string) => !unit.furnishFlats || unit.furnishFlats.includes(f)
  const pick = (on: Set<string>) => onFurnish(flatsHere.every((f) => on.has(f)) ? undefined : flatsHere.filter((f) => on.has(f)))

  return (
    <aside className="floors" onClick={blur}>
      <div className="head">
        <strong title={project.name}>{project.name}</strong>
        <span>
          <button className="link" onClick={rename}>
            Rename
          </button>
          <button className="link danger" onClick={remove}>
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
      {said && (
        <p className="muted">
          Furniture and openings changed in 3D on a floor that shares its drawing: {said === 'one' ? 'that floor only (it gets its own copy)' : 'every floor with that drawing'}, as you answered.{' '}
          <button className="link" title="The 3D view asks again the next time" onClick={() => (setFloorAnswer(pid, null), onToast('The 3D view asks again'))}>
            Ask again
          </button>
        </p>
      )}
      <h4 className="floors-h">Floors</h4>
      <ul className="slots" aria-label="Floors">
        {slotsOf(project).map((r) => {
          const id = r.unitIds[0]
          const here = !!id && id === drawing
          /** its drawing is on other floors too: the menu offers "This floor only" */
          const shared = !!id && r.unitIds.length === 1 && slotsWith(project, id).length > 1
          // a whole-floor drawing's flats under its name: "Floor 2 — Type A, Type B"
          const flats = r.unitIds.length === 1 ? flatsOf(here ? unit : project.units[id]) : ''
          const from = id ? sourceOf(id) : ''
          return (
            <li key={String(r.slot)} className={here ? 'here' : ''}>
              <span className="lbl">{r.label}</span>
              <span className={id ? 'dwg' : 'dwg muted'}>{id ? `${named(id)}${r.unitIds.length > 1 ? ` + ${r.unitIds.length - 1} more` : ''}` : 'empty'}</span>
              {flats && (
                <span className="flats" title="The flats in this drawing (rooms joined by doors)">
                  — {flats}
                </span>
              )}
              {from && (
                <span className="from" title={from}>
                  {from}
                </span>
              )}
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
                  <select
                    value=""
                    title={`Put one of your drawings on this floor${shared ? `, or give ${r.label.toLowerCase()} its own copy of "${named(id)}" (This floor only): what you change on it then stays on this floor` : ''}`}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === OWN) ownFloor(r.slot, id, r.label)
                      else if (v) change((p) => setSlot(p, r.slot, p.units[v] ?? null))
                    }}
                  >
                    <option value="">Use drawing…</option>
                    {drawings.map((d) => (
                      <option key={d} value={d}>
                        {named(d)}
                      </option>
                    ))}
                    {shared && <option value={OWN}>This floor only — its own copy</option>}
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
      <section className="roof-line" aria-label="Roof">
        <div className="site-line">
          <span className="label">Roof</span>
          <span className="muted" title={roofWords(roofOf(project.roof, project.heights), project.heights?.ridgeM !== undefined)}>
            {roofWords(roofOf(project.roof, project.heights), project.heights?.ridgeM !== undefined)}
          </span>
          <button className="link" title="The roof over the top floor: flat with its parapet, gable, hip, shed or mansard; its pitch, eaves, covering, edge and roof windows" onClick={() => setRoofOpen((o) => !o)}>
            {roofOpen ? 'Close' : 'Change'}
          </button>
        </div>
        {roofOpen && <RoofFields roof={roofOf(project.roof, project.heights)} read={project.heights?.ridgeM !== undefined} covering onChange={(roof) => change((p) => ({ ...p, roof }))} />}
      </section>
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
          {flatsHere.length > 1 && (
            <div className="furnish-flats">
              <div className="name">
                <span className="label">Furnish in 3D</span>
                <span>
                  <button className="link" title="Every flat of this drawing furnished and lit" onClick={() => pick(new Set(flatsHere))}>
                    All
                  </button>
                  <button className="link" title="No flat furnished: the floor stands bare (its lobby and stairs as ever)" onClick={() => pick(new Set())}>
                    None
                  </button>
                </span>
              </div>
              <div className="ticks">
                {flatsHere.map((f) => (
                  <label key={f} className="check">
                    <input
                      type="checkbox"
                      checked={furnished(f)}
                      onChange={(e) => {
                        const on = new Set(flatsHere.filter(furnished))
                        if (e.target.checked) on.add(f)
                        else on.delete(f)
                        pick(on)
                      }}
                    />
                    {f}
                  </label>
                ))}
              </div>
              <p className="muted">
                {flatsHere.filter(furnished).length} of {flatsHere.length} flats furnished and lit in Preview 3D, the walk and the Building view; the others stand bare — walls, floors, doors and windows.
              </p>
            </div>
          )}
          <button className="link danger" onClick={deleteDrawing}>
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
      {drawings.length > 0 && (
        <section className="types">
          <h4 title="Each drawing is a floor plan (a type): draw it once, put it on any floors">Floor plans — draw once, use on many floors</h4>
          {drawings.map((d) => (
            <div key={d} className={`type${d === drawing ? ' here' : ''}`}>
              <div className="name">
                <strong title={named(d)}>{named(d)}</strong>
                <span className="muted">{floorsOf(d) ? `on ${floorsOf(d)}` : 'on no floor'}</span>
              </div>
              <div className="pair">
                <input
                  value={also[d] ?? ''}
                  placeholder="on floors: 2, 4, 6-8"
                  title="The floors this plan goes on (any pattern, like 1, 3, 5); Enter or Apply"
                  onChange={(e) => setAlso((a) => ({ ...a, [d]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.repeat) return // (a key held under the question must not ask twice)
                    applyAlso(d)
                    e.currentTarget.blur()
                  }}
                />
                <button onClick={() => applyAlso(d)}>Apply</button>
                <button className="link" title="A copy of this plan as a new one, for a floor that differs a little" onClick={() => copyDrawing(d)}>
                  Copy
                </button>
              </div>
            </div>
          ))}
        </section>
      )}
      {!!project.sheets?.length && (
        <section className="kept">
          <h4 title="The set's elevations, sections, site plan and schedules, kept as they are: nothing is traced on them">Kept from the drawing set</h4>
          {KEPT_GROUPS.map(([kind, words]) => {
            const these = project.sheets!.filter((x) => x.kind === kind)
            if (!these.length) return null
            return (
              // a long group (a set's ten interior elevations) starts folded; a click on its name opens it
              <details key={kind} open={these.length <= 4}>
                <summary>
                  <span className="lbl">{words}</span>
                  <span className="muted">{these.length}</span>
                </summary>
                <ul>
                  {these.map((x) => (
                    <li key={x.id}>
                      <button title={`${x.title} — ${x.file}, page ${x.page}${x.scale ? `, 1 : ${x.scale}` : ''}`} onClick={() => onSheet(x.id, x.title)}>
                        {x.which && <span className="lbl">{cap(x.which)}</span>}
                        <span className={x.which ? 'muted' : ''}>{x.title || `Page ${x.page}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
        </section>
      )}
      <section className="site-line">
        <span className="label">Site</span>
        <span className="muted" title={site.line}>
          {site.line}
        </span>
        <button className="link" title="Where the building stands: the map, the plot, true north (as ⋯ → Site)" onClick={site.onToggle}>
          {site.open ? 'Close' : 'Open'}
        </button>
      </section>
      {onAccount && (
        <section className="site-line">
          <span className="label">Team</span>
          <span>
            <button className="link" title="Everyone in your company and those invited (your account card)" onClick={() => onAccount('members')}>
              Members
            </button>
            <button className="link" title="Every buyer link made from this project: opens, notes, choices, turn one off (your account card)" onClick={() => onAccount('links')}>
              Links
            </button>
          </span>
        </section>
      )}
    </aside>
  )
}
