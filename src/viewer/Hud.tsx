/**
 * The HUD over the 3D (session 31, "Marble": the 3D is the product, the chrome a thin frame round it — Docs/DESIGN.md).
 * Top left: the room you stand in — its floor in small capitals over its name in the serif and its size, no box; click
 * it for the Rooms list (Building view: the floor picked, floorTitle). Top right: one pill — the view switch, Finishes ·
 * Comment · Share, staff's Edit ▾, ⋯ (Clean view, Quality) and the eye (Clean view). Bottom centre: a toast, the hint
 * (fades after a few seconds), a stair's Up / Down, the Sun & wind pill. Building: the floor rail on the right.
 * Rest: 3 s without the mouse in Walk and everything but the room's name fades (chromeOf). Clean view (H, the eye, ⋯):
 * nothing but a faint dot top right — H, Esc or the dot brings it all back; remembered for the tab. Esc closes an open
 * list or menu. Staff: the dot and the piece in hand. Phones (under 720 px): the pill is a bottom bar, the lists and panels
 * bottom sheets with a grip to pull them down (Grip); under a finger the hint says finger words, never keys (useFinger).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { sqmToSqft, type Room } from '../core'
import { levelName, topFloor, type Tower } from '../data/building'
import type { SceneMode } from '../three/PlotlineScene'
import { NAME, QUALITIES, read, tab, write, type Quality } from './quality'

/** The piece in hand (ViewerApp, arrange.ts Held): its name, why it may not stay here (null: it may), whether it is anywhere yet, new from the library or not. */
export interface HandInfo {
  label: string
  error: string | null
  ready: boolean
  adding: boolean
}

/**
 * A finger is in use: the screen's main pointer is a finger (a phone, a tablet), or the last press was one (a touch
 * laptop). Then the hints say what a finger does and never name a key.
 */
export function useFinger(): boolean {
  const [finger, setFinger] = useState(() => !!globalThis.matchMedia?.('(pointer: coarse)').matches)
  useEffect(() => {
    const down = (e: PointerEvent) => setFinger(e.pointerType !== 'mouse')
    addEventListener('pointerdown', down, true)
    return () => removeEventListener('pointerdown', down, true)
  }, [])
  return finger
}

/** how far a sheet's grip is pulled down before the sheet closes, px */
const SWIPE_PX = 64
/**
 * A bottom sheet's grip (phones; viewer.css hides it on a desktop): pull it down and the sheet follows the finger; let
 * go past SWIPE_PX and the sheet closes, else it settles back.
 */
export function Grip({ onClose }: { onClose: () => void }) {
  const y0 = useRef<number | null>(null)
  const pull = (el: HTMLElement, dy: number) => (el.parentElement!.style.transform = dy > 0 ? `translateY(${dy}px)` : '')
  return (
    <div
      className="grip"
      aria-hidden="true"
      onPointerDown={(e) => {
        y0.current = e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => y0.current !== null && pull(e.currentTarget, e.clientY - y0.current)}
      onPointerUp={(e) => {
        const dy = y0.current === null ? 0 : e.clientY - y0.current
        y0.current = null
        pull(e.currentTarget, 0)
        if (dy > SWIPE_PX) onClose()
      }}
      onPointerCancel={(e) => {
        y0.current = null
        pull(e.currentTarget, 0)
      }}
    />
  )
}

/** where the free mouse last was: the hand's tag starts there (guarded: the tests load this file without a window) */
const pointer = { x: globalThis.innerWidth / 2 || 0, y: globalThis.innerHeight / 2 || 0 }
globalThis.addEventListener?.('pointermove', (e) => Object.assign(pointer, { x: e.clientX, y: e.clientY }))

/** The piece in hand, said where it is: under the dot while the mouse is locked, else beside the pointer. */
function HandTag({ hand, locked, finger }: { hand: HandInfo; locked: boolean; finger: boolean }) {
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
      {hand.error && <div className="refused">{hand.error} — move it on, or {finger ? 'turn it in the panel' : 'R to turn it'}</div>}
      <div className="muted small">
        {finger
          ? hand.ready
            ? 'Tap puts it down · the panel turns or removes it'
            : 'Drag it to the floor, a wall or the ceiling'
          : hand.ready
            ? `${locked ? 'Click or G' : 'Click'} puts it down · R turns · Esc ${hand.adding ? 'cancels' : 'puts it back'}`
            : 'Point at the floor, a wall or the ceiling'}
      </div>
    </div>
  )
}

/** Quality (quality.ts) as the ⋯ menu shows it (the start screen says it too: ViewerApp) */
export interface QualityInfo {
  tier: Quality
  /** the device check's pick (marked "recommended") */
  rec: Quality
  /** one line: why this tier ("This device can show the full look.", "Set by this link." …) */
  why: string
  /** an automatic step's note ("Shadows off: …"): said in the menu in place of `why` */
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
  /** the Building view's floor picked (floorTitle): the room's place says it in place of the walk's room */
  pickedFloor?: FloorTitle | null
  /** Building view floor picker, top down; null: the flat is not part of a tower (no Building button) */
  floors: { k: number; label: string }[] | null
  picked: number
  onPickFloor: (k: number) => void
  /** Building view: the picked floor is a level (ground, basement, rooftop): walk it; null: no button */
  onWalkLevel: (() => void) | null
  finishesOpen: boolean
  commenting: boolean
  /** the Sun & wind card open (not just its pill): a panel, so the chrome does not rest */
  sunOpen: boolean
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
  /** staff only: saves the flat as a 3D model file (.glb); null hides it */
  onDownloadGlb?: (() => void) | null
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

export interface FloorTitle {
  /** over the name: the floor ("Floor 2", "Ground floor"); none when the name says it already */
  label?: string
  name: string
  /** the flat's area when its name does not give it */
  size?: string
}

/**
 * The room's place in the Building view: floor k of tower `t` — its word (Floor 2, Ground floor, Basement 1, Rooftop) over
 * what is on it: flat `stem` when it is there, else that floor's flats, else its traced level (ground, basement, rooftop),
 * else the word alone (a floor of massing only). Never the room the walk stood in.
 */
export function floorTitle(t: Tower, k: number, stem: string): FloorTitle {
  const word = k <= 0 || k > topFloor(t) ? levelName(t, k) : `Floor ${k}`
  const f = t.FLOORS.find((x) => x.floor === k)
  const level = f?.standIns?.find((s) => t.LEVELS?.[s] !== undefined)
  const on = f?.flats.includes(stem) ? [stem] : (f?.flats ?? [])
  const units = (on.length ? on : level ? [level] : []).map((s) => t.FLATS[s].unit)
  const name = units.map((u) => u.name).join(', ')
  if (!name || name === word) return { name: word }
  const u = units.length === 1 && !level ? units[0] : null
  return { label: word, name, size: u && u.areaSqft > 0 && !/sft/i.test(u.name) ? `${u.areaSqft} sft` : undefined }
}

/** The bottom hint: the keys of what is on (staff: the editors'); null while a piece is in hand (its tag says it). `finger`: what a finger does, no keys. */
export function hintOf(p: { mode: SceneMode; locked: boolean; staff: boolean; arranging: boolean; editingOpenings: boolean; holding: boolean; finger?: boolean }): string | null {
  const walk = p.mode === 'walk'
  if (p.finger) {
    if (p.mode === 'building') return 'Tap a flat to open it · drag to turn · pinch to zoom'
    if (p.holding) return null
    if (p.editingOpenings) return `Tap a door, window, passage or low wall · drag it · drag a dot to resize${walk ? ' · drag the room to look' : ''}`
    if (p.arranging) return `Drag a piece to move it · the panel turns, removes and undoes${walk ? ' · drag the room to look' : ''}`
    if (!walk) return 'Drag to turn · pinch to zoom · tap a room’s floor to walk in it'
    return 'Drag to look · tap the floor to walk there'
  }
  if (p.mode === 'building') return 'Click a flat to open it · drag to turn · scroll to zoom · O back to Walk'
  if (p.holding) return null
  if (p.editingOpenings) return `Click a door, window, passage or low wall · drag it · drag a dot to resize · Del removes · Ctrl+Z undoes${walk ? ' · drag the room to look' : ''}`
  if (p.arranging) return `Drag a piece, or G on it · R turns · Ctrl+Z undoes · Esc lets go${walk ? ' · drag the room to look, WASD to walk' : ''}`
  if (!walk) return 'Drag to turn · scroll to zoom · click a room’s floor to walk in it · O back to Walk'
  if (p.locked) return `The mouse looks around · WASD to walk${p.staff ? ' · G picks up the piece at the dot' : ''} · Esc frees the mouse`
  return `Double-click to look with the mouse · click the floor to walk there · WASD to walk${p.staff ? ' · G picks up the piece under the mouse' : ''}`
}

/** how long the mouse may rest in Walk before the chrome fades, ms */
const REST_MS = 3000
/** Clean view, remembered for the tab (sessionStorage) */
const CLEAN_KEY = 'plotline.clean'

/** What the chrome shows: `all`; `room` — resting, the room's name alone; `none` — Clean view, only its dot. */
export type Chrome = 'all' | 'room' | 'none'
/**
 * Clean view shows nothing; a mouse at rest in Walk leaves the room's name alone — never in the Dollhouse or the
 * Building view, never with a panel or a menu open (`busy`) or a piece in hand (also `busy`).
 */
export const chromeOf = (s: { clean: boolean; idle: boolean; mode: SceneMode; busy: boolean }): Chrome =>
  s.clean ? 'none' : s.idle && s.mode === 'walk' && !s.busy ? 'room' : 'all'

/** keys that walk: they never wake the resting chrome (the person is looking at the room, not reaching for a button) */
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])
export const wakes = (key: string): boolean => !WALK_KEYS.has(key.toLowerCase())

/**
 * Clean view and a key: H turns it on or off; Esc only turns it off (nothing else happens with that press); F, C and G
 * turn it off and do their own job (a panel, a note, a piece in hand — things the person must see). `stop`: the key is used up.
 */
export function cleanKey(clean: boolean, key: string): { clean: boolean; stop: boolean } {
  const k = key.toLowerCase()
  if (k === 'h') return { clean: !clean, stop: true }
  if (clean && k === 'escape') return { clean: false, stop: true }
  return { clean: clean && !['f', 'c', 'g'].includes(k), stop: false }
}

/** the chrome a resting mouse may hover without the chrome fading under it */
const CHROME = '.hud-tl, .hud-tr, .dock, .floor-rail, .minimap, .map-show, .panel, .arrange, .library, .ask-floor'

const Chevron = () => (
  <svg className="chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const Eye = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M1.5 9S4.2 3.8 9 3.8 16.5 9 16.5 9 13.8 14.2 9 14.2 1.5 9 1.5 9Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="9" cy="9" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)

export default function Hud(p: Props) {
  /** the one list or menu open: Rooms (the room's name), Edit (staff), ⋯ (Clean view, Quality) */
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

  // Clean view: H, the eye or ⋯ → on; H, Esc or the dot → off (cleanKey). Caught first, so Esc leaving it does nothing else.
  const [clean, setClean] = useState(() => read(tab, CLEAN_KEY) === '1')
  useEffect(() => write(tab, CLEAN_KEY, clean ? '1' : null), [clean])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || (t?.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t?.tagName === 'TEXTAREA') return
      const r = cleanKey(clean, e.key)
      if (r.stop) e.stopPropagation()
      if (r.clean !== clean) {
        setClean(r.clean)
        setOpen(null)
      }
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [clean])

  // Rest: one timer — any free-mouse move, click, wheel or key (but the walking keys) starts it again; over the chrome it waits
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    let t = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(t)
      t = window.setTimeout(() => setIdle(true), REST_MS)
    }
    const move = (e: PointerEvent) => {
      if (document.pointerLockElement || e.pointerType === 'touch') return // the mouse turns the head, a finger drags the view: looking, not reaching for a button
      if (!(e.target as Element).closest?.(CHROME)) return wake()
      setIdle(false)
      clearTimeout(t)
    }
    const key = (e: KeyboardEvent) => wakes(e.key) && wake()
    wake()
    addEventListener('pointermove', move)
    addEventListener('pointerdown', wake)
    addEventListener('wheel', wake)
    addEventListener('keydown', key, true) // caught first too: the Esc that leaves Clean view (used up there) still wakes it all
    document.addEventListener('pointerlockchange', wake)
    return () => {
      clearTimeout(t)
      removeEventListener('pointermove', move)
      removeEventListener('pointerdown', wake)
      removeEventListener('wheel', wake)
      removeEventListener('keydown', key, true)
      document.removeEventListener('pointerlockchange', wake)
    }
  }, [])
  const busy = !!open || p.finishesOpen || p.commenting || p.sunOpen || p.arranging || p.editingOpenings || !!p.hand
  const chrome = chromeOf({ clean, idle, mode: p.mode, busy })
  const goClean = () => {
    setClean(true)
    setOpen(null)
  }

  // at rest a phone's faded chrome still takes a finger (viewer.css): that first tap only brings it back, it presses nothing
  const resting = useRef(false)
  // the floors list: the picked floor scrolled into sight (a phone shows only part of a tall tower's list)
  const rail = useRef<HTMLDivElement>(null)
  useEffect(() => rail.current?.querySelector('.rail-item.on')?.scrollIntoView({ block: 'nearest' }), [p.picked, p.mode])
  const finger = useFinger()
  const staffEdit = p.onArrange || p.onOpenings || p.onEditPlan
  const hint = hintOf({ ...p, holding: !!p.hand, finger })
  const r = p.room
  const b = p.mode === 'building' ? p.pickedFloor : null
  const eyebrow = b ? b.label : p.floorLabel
  const modes: [SceneMode, string, string][] = [
    ['walk', 'Walk', 'O'],
    ['orbit', 'Dollhouse', 'O'],
    ...(p.floors ? [['building', 'Building', 'B'] as [SceneMode, string, string]] : []),
  ]

  return (
    <div
      className={`hud${chrome === 'room' ? ' rest' : chrome === 'none' ? ' clean' : ''}`}
      onPointerDownCapture={() => (resting.current = chrome === 'room')}
      onClickCapture={(e) => resting.current && !(e.target as Element).closest('.hud-tl') && e.stopPropagation()}
    >
      <div className="hud-tl">
        <button className={`room-title${open === 'rooms' ? ' on' : ''}`} aria-expanded={open === 'rooms'} title="Rooms: jump to another room" onClick={() => toggle('rooms')}>
          {eyebrow && <span className="label">{eyebrow}</span>}
          <span className="room-name display">
            {b ? b.name : (r?.name ?? 'Rooms')}
            <Chevron />
          </span>
          {b ? (
            b.size && <span className="room-size">{b.size}</span>
          ) : (
            r && (
              <span className="room-size">
                {r.printedSize && `${r.printedSize} · `}
                {r.areaSqm.toFixed(1)} m² · {sqft(r.areaSqm)} sqft
              </span>
            )
          )}
          {!b && p.roomNote && <span className="wind-note">{p.roomNote}</span>}
        </button>
        {open === 'rooms' && (
          <div className="glass menu rooms-list" role="menu">
            <Grip onClose={() => setOpen(null)} />
            <div className="menu-head label">
              Rooms
              <button className="x" aria-label="Close Rooms" onClick={() => setOpen(null)}>
                ×
              </button>
            </div>
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
        <nav className="glass toolbar" aria-label="Views and tools">
          <div className="seg" role="group" aria-label="View">
            {modes.map(([m, label, key]) => (
              <button key={m} className={p.mode === m ? 'on' : ''} aria-pressed={p.mode === m} title={`${label} (${key})`} onClick={() => p.onMode(m)}>
                {label}
              </button>
            ))}
          </div>
          <span className="sep" />
          <button className={`tb${p.finishesOpen ? ' on' : ''}`} aria-pressed={p.finishesOpen} title="Choose floors, walls and ceilings (F)" onClick={p.onToggleFinishes}>
            Finishes
          </button>
          <button className={`tb${p.commenting ? ' on' : ''}`} aria-pressed={p.commenting} title="Click anything to leave a note — your notes are listed there (C)" onClick={p.onToggleComment}>
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
          <button className={`tb icon${open === 'more' ? ' on' : ''}`} aria-label="More" aria-expanded={open === 'more'} title="More: Clean view, quality" onClick={() => toggle('more')}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="3" cy="8" r="1.3" fill="currentColor" />
              <circle cx="8" cy="8" r="1.3" fill="currentColor" />
              <circle cx="13" cy="8" r="1.3" fill="currentColor" />
            </svg>
          </button>
          <button className="tb icon" aria-label="Clean view" title="Clean view: hide everything and just look (H)" onClick={goClean}>
            <Eye />
          </button>
        </nav>
        {open === 'edit' && (
          <div className="glass menu" role="menu" onClick={() => setOpen(null)}>
            <Grip onClose={() => setOpen(null)} />
            <div className="menu-head label">Staff</div>
            {p.onArrange && (
              <button className={`menu-row${p.arranging ? ' on' : ''}`} role="menuitem" title="Move, turn, resize, delete or add furniture" onClick={p.onArrange}>
                <span>Furniture</span>
                <span className="state">{p.arranging ? 'on' : ''}</span>
              </button>
            )}
            {p.onOpenings && (
              <button className={`menu-row${p.editingOpenings ? ' on' : ''}`} role="menuitem" title="Move, resize, change or remove a door, window, slider, passage or low wall" onClick={p.onOpenings}>
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
            {p.onDownloadGlb && (
              <button className="menu-row" role="menuitem" title="The flat as one 3D model file (.glb): walls, floors, doors, windows and furniture with their pictures, for a render artist or another 3D program" onClick={p.onDownloadGlb}>
                <span>Download 3D model</span>
                <span className="muted">.glb</span>
              </button>
            )}
          </div>
        )}
        {open === 'more' && (
          <div className="glass menu menu-wide" title={p.quality.gpu && `Graphics: ${p.quality.gpu}`}>
            <Grip onClose={() => setOpen(null)} />
            <button className="menu-row" role="menuitem" title="Hide everything on screen; H, Esc or the dot top right brings it back" onClick={goClean}>
              <span>Clean view</span>
              {!finger && <kbd>H</kbd>}
            </button>
            <div className="menu-rule" />
            <div className="menu-head label">Quality</div>
            <div className="seg seg-fill" role="group" aria-label="Quality">
              {QUALITIES.map((q) => (
                <button key={q} className={q === p.quality.tier ? 'on' : ''} aria-pressed={q === p.quality.tier} onClick={() => q !== p.quality.tier && p.quality.onPick(q)}>
                  {NAME[q]}
                  {q === p.quality.rec && <span className="rec" title="Recommended for this device" />}
                </button>
              ))}
            </div>
            <p className="menu-note">
              {p.quality.note ?? p.quality.why} The dot marks the one recommended for this device. Lite is lighter on the computer: fewer pixels, simpler pictures, no potted plants. A new choice reloads the page.
            </p>
          </div>
        )}
      </div>

      {p.hand && p.mode !== 'building' && <HandTag hand={p.hand} locked={p.locked} finger={finger} />}
      {p.staff && p.locked && p.mode === 'walk' && <div className="dot" />}
      {p.mode === 'building' && p.floors && (
        <div className="floor-rail">
          <div ref={rail} className="glass rail" role="group" aria-label="Floors">
            <div className="menu-head label">Floors</div>
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
        {/* an answer to what the person just did: fades in where it stands, keyed so a new one shows again */}
        {p.toast && (
          <div key={p.toast} className="glass toast" role="status">
            {p.toast}
          </div>
        )}
        {/* keyed by its text: a new hint shows again, then fades (CSS only); the mouse over it brings it back. Comment says its own in its panel */}
        {hint && !p.commenting && (
          <div key={hint} className="glass hint">
            {hint}
          </div>
        )}
        {p.ways}
        {p.sun}
      </div>

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
      {chrome === 'none' && <button className="clean-dot" aria-label="Show the controls" title="Show the controls (H or Esc)" onClick={() => setClean(false)} />}
    </div>
  )
}
