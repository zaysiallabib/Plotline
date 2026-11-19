/**
 * The HUD over the 3D (session 30: less on screen, the 3D is the product). Top left: the room you stand in with its floor —
 * click it for the Rooms list. Top right: one glass bar — the view switch (Walk · Dollhouse · Building), the buyer's
 * Finishes, Comment and Share, staff's Edit ▾, and ⋯ (Quality). Bottom centre: a slim hint that fades after a few seconds
 * (it comes back when it changes or under the mouse) above the Sun & wind pill. Building view: the floor rail on the right
 * with Walk this level. Esc closes an open list or menu. Staff: the dot and the piece in hand.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sqmToSqft, type Room } from '../core'
import type { SceneMode } from '../three/PlotlineScene'
import { KEYS, local, NAME, QUALITIES, read, write, type Quality } from './quality'

/** The piece in hand (ViewerApp, arrange.ts Held): its name, why it may not stay here (null: it may), whether it is anywhere yet, new from the library or not. */
export interface HandInfo {
  label: string
  error: string | null
  ready: boolean
  adding: boolean
}

/** where the free mouse last was: the hand's tag starts there (guarded: the tests load this file without a window) */
const pointer = { x: globalThis.innerWidth / 2 || 0, y: globalThis.innerHeight / 2 || 0 }
globalThis.addEventListener?.('pointermove', (e) => Object.assign(pointer, { x: e.clientX, y: e.clientY }))

/** The piece in hand, said where it is: under the dot while the mouse is locked, else beside the pointer. */
function HandTag({ hand, locked }: { hand: HandInfo; locked: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const place = () => ref.current && (ref.current.style.transform = locked ? '' : `translate(${pointer.x + 18}px, ${pointer.y + 18}px)`)
    place()
    addEventListener('pointermove', place)
    return () => removeEventListener('pointermove', place)
  }, [locked])
  return (
    <div ref={ref} className={`glass hand-tag${locked ? ' at-dot' : ''}`}>
      <div>
        {hand.adding ? 'Placing' : 'Moving'}: {hand.label}
      </div>
      {hand.error && <div className="refused">{hand.error} — move it on, or R to turn it</div>}
      <div className="muted small">
        {hand.ready ? `${locked ? 'Click or G' : 'Click'} puts it down · R turns · Esc ${hand.adding ? 'cancels' : 'puts it back'}` : 'Point at the floor, a wall or the ceiling'}
      </div>
    </div>
  )
}

/** Quality (quality.ts) as the ⋯ menu and its first-time toast show it */
export interface QualityInfo {
  tier: Quality
  /** the device check's pick (marked "recommended") */
  rec: Quality
  /** one line: why this tier ("This device can show the full look.", "Set by this link." …) */
  why: string
  /** an automatic switch's note ("Switched to Lite: …"): the toast shows it once */
  note: string | null
  /** the graphics chip's name (hover) */
  gpu: string
  onPick: (q: Quality) => void
}

interface Props {
  room: Room | null
  rooms: Room[]
  mode: SceneMode
  /** the flat's floor (?floor= or the unit's own) */
  floor?: number
  /** over the room's name: "Floor 3", or a level's name ("Ground floor", "Basement 1", "Rooftop") */
  floorLabel?: string
  /** the room's wind while Wind is on ("Cross ventilation" …), else null */
  roomNote?: string | null
  /** Building view floor picker, top down; null: the flat is not part of a tower (no Building button) */
  floors: { k: number; label: string }[] | null
  picked: number
  onPickFloor: (k: number) => void
  /** Building view: the picked floor is a level (ground, basement, rooftop): walk it; null: no button */
  onWalkLevel: (() => void) | null
  finishesOpen: boolean
  commenting: boolean
  locked: boolean
  /** set when immersive-vr is supported: shows "Enter VR" */
  onEnterVR: (() => void) | null
  toast: string | null
  onJump: (room: Room) => void
  onMode: (mode: SceneMode) => void
  onToggleFinishes: () => void
  onToggleComment: () => void
  onShare: () => void
  /** staff only: opens this unit in the Studio, new tab (the Studio makes its user staff, so buyers never see it) */
  onEditPlan: (() => void) | null
  /** staff only (arrange.ts isStaff): toggles Arrange ("Edit furniture"); null hides the button (every buyer link) */
  onArrange: (() => void) | null
  arranging: boolean
  /** the piece in hand, if any (staff) */
  hand: HandInfo | null
  /** staff (arrange.ts isStaff): G picks up furniture; the dot and the keys show in walk */
  staff: boolean
  /** the unit has a site with the map's blocks or roads in the 3D: their credit in the footer */
  osm?: boolean
  /** staff only: toggles Edit openings (doors, windows, sliders, passages in 3D); null hides the button */
  onOpenings: (() => void) | null
  editingOpenings: boolean
  quality: QualityInfo
  /** the Sun & wind pill / card (SunPill), docked bottom centre under the hint */
  sun: ReactNode
  /** a stair room's Up to … / Down to … (ViewerApp stairWays), docked over the pill; null: none */
  ways?: ReactNode
}

const sqft = (sqm: number) => Math.round(sqmToSqft(sqm))
/** the Building rail's words: R → Roof, G → Ground; floors and basements as they are (8, B1) */
export const floorWord = (label: string): string => (label === 'R' ? 'Roof' : label === 'G' ? 'Ground' : label)

const Chevron = () => (
  <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** The bottom hint: the keys of what is on (staff: the editors'); null while a piece is in hand (its tag says it) */
export function hintOf(p: { mode: SceneMode; locked: boolean; staff: boolean; arranging: boolean; editingOpenings: boolean; holding: boolean }): string | null {
  const walk = p.mode === 'walk'
  if (p.mode === 'building') return 'Click a flat to open it · drag to turn · scroll to zoom · O back to Walk'
  if (p.holding) return null
  if (p.editingOpenings) return `Click a door, window, passage or low wall · drag it · drag a dot to resize · Del removes · Ctrl+Z undoes${walk ? ' · drag the room to look' : ''}`
  if (p.arranging) return `Drag a piece, or G on it · R turns · Ctrl+Z undoes · Esc lets go${walk ? ' · drag the room to look, WASD to walk' : ''}`
  if (!walk) return 'Drag to turn · scroll to zoom · click a room’s floor to walk in it · O back to Walk'
  if (p.locked) return `The mouse looks around · WASD to walk${p.staff ? ' · G picks up the piece at the dot' : ''} · Esc frees the mouse`
  return `Double-click to look with the mouse · click the floor to walk there · WASD to walk${p.staff ? ' · G picks up the piece under the mouse' : ''}`
}

export default function Hud(p: Props) {
  /** the one list or menu open: Rooms (the room chip), Edit (staff), ⋯ (Quality) */
  const [open, setOpen] = useState<'rooms' | 'edit' | 'more' | null>(null)
  const toggle = (k: typeof open) => setOpen((v) => (v === k ? null : k))
  // Esc (that one step only: caught first, so the panels behind stay), or a press anywhere else, closes it
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(null)
    }
    const down = (e: PointerEvent) => !(e.target as Element).closest?.('.hud-tl, .hud-tr') && setOpen(null)
    addEventListener('keydown', key, true)
    addEventListener('pointerdown', down)
    return () => {
      removeEventListener('keydown', key, true)
      removeEventListener('pointerdown', down)
    }
  }, [open])
  // Quality's toast: by itself only the first time the 3D opens in this browser, or with an automatic switch's note
  const [qToast, setQToast] = useState(() => !!p.quality.note || read(local, KEYS.seen) !== '1')
  useEffect(() => void (p.quality.note && setQToast(true)), [p.quality.note])
  useEffect(() => {
    if (!qToast) return
    write(local, KEYS.seen, '1')
    const t = setTimeout(() => setQToast(false), 12000)
    return () => clearTimeout(t)
  }, [qToast])

  const staffEdit = p.onArrange || p.onOpenings || p.onEditPlan
  const hint = hintOf({ ...p, holding: !!p.hand })
  const r = p.room
  const modes: [SceneMode, string, string][] = [
    ['walk', 'Walk', 'O'],
    ['orbit', 'Dollhouse', 'O'],
    ...(p.floors ? [['building', 'Building', 'B'] as [SceneMode, string, string]] : []),
  ]

  return (
    <>
      <div className="hud-tl">
        <button className={`glass room-chip${open === 'rooms' ? ' on' : ''}`} aria-expanded={open === 'rooms'} title="Rooms: jump to another room" onClick={() => toggle('rooms')}>
          {p.floorLabel && <span className="eyebrow">{p.floorLabel}</span>}
          <span className="room-name">
            {r?.name ?? 'Rooms'}
            <Chevron />
          </span>
          {r && (
            <span className="room-size">
              {r.printedSize && `${r.printedSize} · `}
              {r.areaSqm.toFixed(1)} m² · {sqft(r.areaSqm)} sqft
            </span>
          )}
          {p.roomNote && <span className="wind-note">{p.roomNote}</span>}
        </button>
        {open === 'rooms' && (
          <div className="glass menu rooms-list" role="menu">
            <div className="menu-title">Rooms</div>
            {p.rooms.map((x) => (
              <button
                key={x.id}
                className={`menu-row${x.id === r?.id ? ' on' : ''}`}
                role="menuitem"
                onClick={() => {
                  p.onJump(x)
                  setOpen(null)
                }}
              >
                <span>{x.name}</span>
                <span className="muted">{x.printedSize ?? `${x.areaSqm.toFixed(1)} m²`}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hud-tr">
        <nav className="glass toolbar">
          <div className="seg" role="group" aria-label="View">
            {modes.map(([m, label, key]) => (
              <button key={m} className={p.mode === m ? 'on' : ''} aria-pressed={p.mode === m} title={`${label} (${key})`} onClick={() => p.onMode(m)}>
                {label}
              </button>
            ))}
          </div>
          <span className="sep" />
          <button className={`tb${p.finishesOpen ? ' on' : ''}`} aria-pressed={p.finishesOpen} title="Choose floors, walls and ceilings — your notes are there too (F)" onClick={p.onToggleFinishes}>
            Finishes
          </button>
          <button className={`tb${p.commenting ? ' on' : ''}`} aria-pressed={p.commenting} title="Click anything to leave a note (C)" onClick={p.onToggleComment}>
            Comment
          </button>
          <button className="tb" title="Copy a link that opens with your finishes" onClick={p.onShare}>
            Share
          </button>
          {p.onEnterVR && (
            <button className="tb" onClick={p.onEnterVR}>
              Enter VR
            </button>
          )}
          <span className="sep" />
          {staffEdit && (
            <button className={`tb${p.arranging || p.editingOpenings || open === 'edit' ? ' on' : ''}`} aria-expanded={open === 'edit'} title="Staff only: furniture, openings, the plan" onClick={() => toggle('edit')}>
              Edit
              <Chevron />
            </button>
          )}
          <button className={`tb icon${open === 'more' ? ' on' : ''}`} aria-label="More" aria-expanded={open === 'more'} title="More: quality" onClick={() => toggle('more')}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3" cy="8" r="1.4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="13" cy="8" r="1.4" fill="currentColor" />
            </svg>
          </button>
        </nav>
        {open === 'edit' && (
          <div className="glass menu" role="menu" onClick={() => setOpen(null)}>
            <div className="menu-title">Staff</div>
            {p.onArrange && (
              <button className="menu-row" role="menuitem" title="Move, turn, resize, delete or add furniture" onClick={p.onArrange}>
                <span>Furniture</span>
                <span className="state">{p.arranging ? 'on' : ''}</span>
              </button>
            )}
            {p.onOpenings && (
              <button className="menu-row" role="menuitem" title="Move, resize, change or remove a door, window, slider, passage or low wall" onClick={p.onOpenings}>
                <span>Openings</span>
                <span className="state">{p.editingOpenings ? 'on' : ''}</span>
              </button>
            )}
            {p.onEditPlan && (
              <button className="menu-row" role="menuitem" title="This plan in the Studio (new tab)" onClick={p.onEditPlan}>
                <span>Plan (Studio)</span>
                <span className="muted">↗</span>
              </button>
            )}
          </div>
        )}
        {open === 'more' && (
          <div className="glass menu menu-wide" title={p.quality.gpu && `Graphics: ${p.quality.gpu}`}>
            <div className="menu-title">Quality</div>
            <div className="seg seg-fill" role="group" aria-label="Quality">
              {QUALITIES.map((q) => (
                <button key={q} className={q === p.quality.tier ? 'on' : ''} aria-pressed={q === p.quality.tier} onClick={() => q !== p.quality.tier && p.quality.onPick(q)}>
                  {NAME[q]}
                  {q === p.quality.rec && <span className="rec" title="Recommended for this device" />}
                </button>
              ))}
            </div>
            <p className="menu-note">
              {p.quality.why} The dot marks the one recommended for this device. Lite is lighter on the computer: fewer pixels, simpler pictures, no potted plants. A new choice reloads the page.
            </p>
          </div>
        )}
      </div>

      {p.hand && p.mode !== 'building' && <HandTag hand={p.hand} locked={p.locked} />}
      {p.staff && p.locked && p.mode === 'walk' && <div className="dot" />}
      {p.mode === 'building' && p.floors && (
        <div className="floor-rail">
          <div className="glass rail" role="group" aria-label="Floors">
            <div className="menu-title">Floors</div>
            {p.floors.map(({ k, label }) => (
              <button key={k} className={`rail-item${p.picked === k ? ' on' : ''}`} aria-pressed={p.picked === k} title={p.floor === k ? 'Your flat’s floor' : undefined} onClick={() => p.onPickFloor(k)}>
                {floorWord(label)}
                {p.floor === k && <span className="own" aria-label="your flat" />}
              </button>
            ))}
          </div>
          {p.onWalkLevel && (
            <button className="btn primary" onClick={p.onWalkLevel}>
              Walk this level
            </button>
          )}
        </div>
      )}

      <div className="dock">
        {/* keyed by its text: a new hint shows again, then fades (CSS only); the mouse over it brings it back */}
        {p.commenting ? (
          <div className="glass hint keep">Click anything to leave a note · Esc stops</div>
        ) : (
          hint && (
            <div key={hint} className="glass hint">
              {hint}
            </div>
          )
        )}
        {p.ways}
        {p.sun}
      </div>

      {qToast && !p.arranging && !p.editingOpenings && (
        <div className="glass q-toast" role="status">
          <span>
            <b>{NAME[p.quality.tier]} quality.</b> {p.quality.note ?? p.quality.why}
          </span>
          <button
            className="link"
            onClick={() => {
              setQToast(false)
              setOpen('more')
            }}
          >
            Change
          </button>
          <button className="x" aria-label="Close" onClick={() => setQToast(false)}>
            ×
          </button>
        </div>
      )}
      {p.toast && <div className="glass toast">{p.toast}</div>}
      {/* the map's neighbours and roads are OpenStreetMap's (ODbL): their credit shows wherever they do, also while walking */}
      {(!p.locked || p.osm) && (
        <div className="footer">
          {!p.locked && 'Powered by Plotline'}
          {p.osm && (
            <>
              {!p.locked && ' · '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © OpenStreetMap contributors
              </a>
            </>
          )}
        </div>
      )}
    </>
  )
}
