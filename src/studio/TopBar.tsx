/**
 * The Studio's top bar (session 31, marble): the wordmark (Plotline in the serif, STUDIO — staff mode — beside it), the
 * drawing's own fields (quiet until the mouse is over one) with the cloud's save word; on the right Undo / Redo,
 * Auto-trace (with a plan picture), Preview 3D (the one blue button; plain while the Studio is empty), Building, and ⋯ — Import, Export, Export answers, New project, Site, Share link, Change list
 * and the account. Esc or a click anywhere else closes ⋯; Esc closes the account card too. The keys (Ctrl+Z / Y / S /
 * O) are StudioApp's, unchanged.
 */
import { useEffect, useState, type ComponentProps } from 'react'
import type { Unit } from '../core'
import { useSession } from '../lib/auth'
import { configured } from '../lib/supabase'
import CloudBar from './CloudBar'

type Meta = 'name' | 'projectName' | 'floor' | 'areaSqft'

interface Props {
  unit: Unit
  onMeta: (k: Meta) => (e: React.ChangeEvent<HTMLInputElement>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** only with a plan picture (null: no button); disabled while the picture loads or a trace runs */
  autoTrace: { disabled: boolean; onClick: () => void } | null
  /** errors in Issues: Preview 3D says so on hover (it never locks) */
  errors: number
  /** the Studio is empty: its own Choose plan image… is the one blue button, Preview 3D waits plain */
  quiet: boolean
  onPreview: () => void
  building: boolean
  onBuilding: () => void
  onNewProject: () => void
  site: boolean
  onSite: () => void
  onImport: () => void
  onExport: () => void
  onExportAnswers: () => void
  /** the database is set up: Share link (busy while it publishes) and Change list; null: neither shows */
  share: { busy: boolean; onShare: () => void } | null
  cloud: Omit<ComponentProps<typeof CloudBar>, 'open' | 'onClose'>
}

const Icon = ({ d }: { d: string }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Item({ label, keys, on, title, disabled, onClick }: { label: string; keys?: string; on?: boolean; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`menu-row${on ? ' on' : ''}`} role="menuitem" title={title} disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {(keys || on) && <span className="keys">{on ? 'open' : keys}</span>}
    </button>
  )
}

export default function TopBar(p: Props) {
  const [menu, setMenu] = useState(false)
  const [account, setAccount] = useState(false)
  const session = useSession()
  // Esc (that one step only: caught first, so the Studio's own Esc does not also unpick) closes ⋯, else the account card
  // (also from its email box); a press elsewhere closes ⋯
  useEffect(() => {
    if (!menu && !account) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (menu) setMenu(false)
      else setAccount(false)
    }
    const down = (e: PointerEvent) => menu && !(e.target as Element).closest?.('.more') && setMenu(false)
    addEventListener('keydown', key, true)
    addEventListener('pointerdown', down)
    return () => {
      removeEventListener('keydown', key, true)
      removeEventListener('pointerdown', down)
    }
  }, [menu, account])
  const { unit, onMeta } = p

  return (
    <header className="topbar">
      <a className="brand" href="/" title="Plotline's front page">
        <b>Plotline</b>
        <span className="label" title="Staff mode is on in this browser: the 3D viewer (Preview 3D, or any unit) shows Edit furniture — move, turn, resize, delete, add — and Edit plan. Buyer links never do.">
          Studio
        </span>
      </a>
      <span className="sep" />
      <div className="tb-fields">
        <input className="meta name" placeholder="Unit name" aria-label="Unit name" title="Unit name" value={unit.name} onChange={onMeta('name')} />
        <input className="meta project" placeholder="Project" aria-label="Project" title="Project" value={unit.projectName} onChange={onMeta('projectName')} />
        <label className="meta-num" title="The floor this drawing is on (numbers only)">
          <span className="label">Floor</span>
          <input type="number" placeholder="–" value={unit.floor ?? ''} onChange={onMeta('floor')} />
        </label>
        <label className="meta-num area" title="The flat's area as the sheet prints it (sqft)">
          <span className="label">Area</span>
          <input type="number" placeholder="–" value={unit.areaSqft || ''} onChange={onMeta('areaSqft')} />
          <span className="unit">sft</span>
        </label>
        <CloudBar {...p.cloud} open={account} onClose={() => setAccount(false)} />
      </div>

      <div className="tb-right">
        <button className="icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}>
          <Icon d="M7.5 4.5 4 8l3.5 3.5M4 8h8.25a3.75 3.75 0 0 1 0 7.5H10" />
        </button>
        <button className="icon" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo}>
          <Icon d="M12.5 4.5 16 8l-3.5 3.5M16 8H7.75a3.75 3.75 0 0 0 0 7.5H10" />
        </button>
        <span className="sep" />
        {p.autoTrace && (
          <button disabled={p.autoTrace.disabled} title="Trace the plan automatically: click inside a flat, then check what it lists on the right. Everything stays editable." onClick={p.autoTrace.onClick}>
            Auto-trace
          </button>
        )}
        {/* never locked on a draft (founder, 2026-10-03): the 3D shows the plan as it is, open rooms have no floor yet */}
        <button className={p.quiet ? '' : 'primary'} title={p.errors ? `${p.errors} error${p.errors > 1 ? 's' : ''} in Issues — the 3D shows the plan as it is` : 'Your drawing in the 3D view, in a new tab'} onClick={p.onPreview}>
          Preview 3D
        </button>
        <button className={p.building ? 'on' : ''} aria-pressed={p.building} title="Your project's floors: make a project, draw each floor, then Show building" onClick={p.onBuilding}>
          Building
        </button>
        <div className="more">
          <button className={`icon${menu ? ' on' : ''}`} aria-label="More" aria-expanded={menu} title="Import, export, new project, site, share, account" onClick={() => setMenu((v) => !v)}>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="4.5" cy="10" r="1.25" fill="currentColor" />
              <circle cx="10" cy="10" r="1.25" fill="currentColor" />
              <circle cx="15.5" cy="10" r="1.25" fill="currentColor" />
            </svg>
          </button>
          {menu && (
            <div className="menu" role="menu" onClick={() => setMenu(false)}>
              <div className="menu-title">Drawing</div>
              <Item label="Import…" keys="Ctrl+O" title="Open a drawing file, or the architect's own (IFC, DXF, PDF, a 3D model)" onClick={p.onImport} />
              <Item label="Export" keys="Ctrl+S" title="Save the drawing as a file" onClick={p.onExport} />
              <Item label="Export answers" title="Download every Check-these answer clicked in this browser (row, answer, sheet, time) — the test set for an AI helper later" onClick={p.onExportAnswers} />
              <div className="menu-title">Building</div>
              <Item label="New project" title="Start a new project: its name, basements, floors, rooftop" onClick={p.onNewProject} />
              <Item label="Site" on={p.site} title="Where the building stands: find it on the map, click the plot (neighbour blocks, roads, wind), set true north" onClick={p.onSite} />
              {p.share && (
                <>
                  <div className="menu-title">Buyers</div>
                  <Item label={p.share.busy ? 'Sharing…' : 'Share link'} disabled={p.share.busy} title="Publish this draft and copy a buyer link (/s/…) — every click makes a new link" onClick={p.share.onShare} />
                  <Item label="Change list" keys="↗" title="What buyers noted and chose on your share links: who, when, which finish, the price" onClick={() => window.open('/changes', '_blank')} />
                </>
              )}
              {configured && session !== undefined && (
                <>
                  <div className="menu-title">Account</div>
                  <Item
                    label={session ? (session.user.email ?? 'Account') : 'Sign in'}
                    on={account}
                    title={session ? 'Your account and your company’s projects in the cloud' : 'Sign in to keep your work in the cloud for your company'}
                    onClick={() => setAccount((v) => !v)}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
