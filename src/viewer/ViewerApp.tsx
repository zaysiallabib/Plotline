/**
 * Buyer-facing viewer (PRODUCT_SPEC §3): routing, load screen, HUD, finishes,
 * sun, comment pins, share, VR. No router lib, no state lib.
 * Routes: `/` → replaceState `/u/<first unit>`; `/u/preview` ← localStorage
 * `plotline.preview`; `/u/:id` by Unit.id or the JSON's filename stem;
 * `/s/<token>` ← Supabase (a link the Studio's Share published).
 */
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as THREE from 'three'
import * as core from '../core'
import type { Configuration, FinishSlot, FurniturePlacement, Id, Opening, OpeningKind, Pt, Room, Unit, Wall } from '../core'
import { coverOf, levelName, projectUnit, roleIn, stemIn, topFloor, towerOf, type Tower } from '../data/building'
import { faceWallId, roomKey, wallKey } from '../furnish/finishes'
import { placementLabel, placementSize } from '../furnish/kit'
import { deletePiece, layoutFor, movePiece, pieceQuad, refurnish, resizeAxes, resizePiece, surfaceOf, type Move } from '../studio/furniture'
import { buyer, flushOutbox, selectionPayload, sendEvent, setBuyerName } from '../lib/events'
import { fetchSharedUnit } from '../lib/supabase'
import { WALL_TYPES, findOpening, initialState, isUnit, normalizeUnit, reducer, wallTypeOf, type Action, type StudioState } from '../studio/model'
import { PlotlineScene, type ArrangeEvent, type OpeningEvent, type PickHit, type SceneMode } from '../three/PlotlineScene'
import { lightsOn, type LightsMode } from '../three/render'
import { TEST_UNIT } from '../three/testUnit'
import type { XRControls } from '../three/xr'
import { deleteHeld, draftState, dropHeld, holdAt, isShareLink, isStaff, makeDraft, pickUp, planOf, pushStep, readLayout, saveLayout, saveOpenings, turnHeld, undoStep, wallDrag, type Held, type Steps } from './arrange'
import FinishesPanel, { type Surface } from './FinishesPanel'
import Hud, { type HandInfo } from './Hud'
import Minimap, { mapOf } from './Minimap'
import { NotesList, PinLayer, tagOf, type Draft } from './Notes'
import { entrySpawn, listedRooms, roomView, yawFor } from './spawn'
import SunPill, { WindChips, WindRose } from './SunPill'
import { withDefaults } from './defaults'
import { chosen, KEYS, local, lower, NAME, probeDevice, QUALITIES, read, recommend, tab, write, type Quality } from './quality'
import { decodeConfig, encodeConfig, finishKeys, shareUrl } from './share'
import { appendPin, readPins, removePin, type Pin } from './storage'
import { LibraryPanel } from '../studio/LibraryPanel'
import './viewer.css'

const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
const UNITS = Object.entries(files).map(([path, unit]) => ({ stem: path.split('/').pop()!.replace(/\.json$/, ''), unit }))
if (!UNITS.length) UNITS.push({ stem: TEST_UNIT.id, unit: TEST_UNIT }) // dev only: no unit JSON on disk yet

const NOT_FOUND = "This unit isn't available. Ask your sales contact for a fresh link."
const NO_3D = 'This browser or machine cannot draw 3D. Try another browser, or open on a PC.'
const DEFAULT_HOUR = 15.5

/** the ten full years before the site was fetched (SitePanel asks for those) */
const windYears = (at?: string): string => (at ? `${Number(at.slice(0, 4)) - 10}–${Number(at.slice(0, 4)) - 1}` : 'ten years')
/** the wind rose shown (Wind on, Rose): remembered in this browser */
const ROSE_KEY = 'plotline.windRose'
const roseSaved = (): boolean => {
  try {
    return localStorage.getItem(ROSE_KEY) === '1'
  } catch {
    return false
  }
}
/** the flat's lights: automatic (on after sunset) or the person's pick (render.ts lightsOn), remembered in this browser */
const LIGHTS_KEY = 'plotline.lights'
const lightsSaved = (): LightsMode => {
  try {
    const v = localStorage.getItem(LIGHTS_KEY)
    return v === 'on' || v === 'off' ? v : 'auto'
  } catch {
    return 'auto'
  }
}
const VR_FAILED = "Couldn't start VR. Is the headset connected?"
const params = new URLSearchParams(location.search)
/** Arrange is staff only (arrange.ts): `?staff=1` is remembered, then dropped from the address bar so a copied URL doesn't carry it. */
const STAFF = isStaff(location.search)
/** a published link's token (`/s/<token>`): the unit comes from Supabase */
const TOKEN = location.pathname.match(/^\/s\/([^/]+)/)?.[1]
/** a buyer's link: no way into staff mode from it (no "Staff mode" / Studio link) */
const SHARED = isShareLink(location.search) || !!TOKEN
/** this address with `staff=` 1 (the load screen's Staff mode link) or 0 (leave it) */
const staffHref = (v: string): string => {
  const q = new URLSearchParams(params)
  q.set('staff', v)
  return `?${q}`
}
/** the one-line Edit furniture hint shows once per browser */
const HINTED = 'plotline.hint.furniture'
const stored = (k: string): boolean => {
  try {
    return localStorage.getItem(k) === '1'
  } catch {
    return true
  }
}
const store = (k: string): void => {
  try {
    localStorage.setItem(k, '1')
  } catch {
    /* storage blocked */
  }
}
/** Quality (quality.ts): the device check once per page, the tier and who set it; a note left by an automatic switch, shown once */
const DEVICE = probeDevice()
const REC = recommend(DEVICE, read(local, KEYS.slow))
const TIER = chosen({ fallback: read(tab, KEYS.fallback), link: params.get('quality'), picked: read(local, KEYS.picked), rec: REC.tier })
const SWITCHED = read(tab, KEYS.note)
write(tab, KEYS.note, null)
/** A new tier takes a fresh page (antialias is fixed when the 3D starts); the finishes chosen ride along in the address. */
const restart = (cfg: Configuration): void => {
  const q = new URLSearchParams(location.search)
  q.delete('quality')
  if (Object.keys(cfg).length) q.set('c', encodeConfig(cfg))
  location.replace(`${location.pathname}${q.size ? `?${q}` : ''}`)
}
if (params.has('staff')) {
  params.delete('staff')
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
}
/** Building view floor picker of the unit's tower, top down: roof, every floor with flats or massing, ground, basements */
function PICKER(u: Unit) {
  const t = towerOf(u)
  const FLOORS = t?.FLOORS ?? []
  const top = t ? topFloor(t) : 0 // (a rooftop level is listed above it: R)
  const basements = FLOORS.filter((f) => f.floor < 0).map((f) => ({ k: f.floor, label: `B${-f.floor}` })).reverse()
  const floors = FLOORS.filter((f) => f.floor >= 1 && f.floor <= top && (f.flats.length || f.standIns?.length)).map((f) => ({ k: f.floor, label: String(f.floor) })).reverse()
  return [{ k: top + 1, label: 'R' }, ...floors, { k: 0, label: 'G' }, ...basements]
}
/** the unit's route stem in its tower, if it is in one */
const towerStem = (u: Unit) => {
  const t = towerOf(u)
  return t ? stemIn(t, u) : undefined
}
/**
 * `?floor=N` (a flat picked in the Building view) puts the flat on floor N if the tower has it there; the JSON keeps its
 * own. A level (ground, basement, rooftop) stands on its tower's floor for it.
 */
function onFloor(u: Unit | null): Unit | null {
  const t = u && towerOf(u)
  const stem = t && stemIn(t, u)
  if (!u || !t || !stem) return u
  const level = t.LEVELS?.[stem]
  if (level !== undefined) return { ...u, floor: level }
  const n = Number(params.get('floor'))
  return t.FLOORS.some((f) => f.floor === n && f.flats.includes(stem)) ? { ...u, floor: n } : u
}
/**
 * The load screen's list: the flats as they are; each tower's levels (ground, basements, rooftop) under its name, top
 * down; a unit that only stands in for massing (a typical-floor shell) not at all.
 */
const NAV = (() => {
  const flats: typeof UNITS = []
  const towers = new Map<Tower, { name: string; levels: { stem: string; label: string; k: number }[] }>()
  for (const x of UNITS) {
    const t = towerOf(x.unit)
    const stem = t && stemIn(t, x.unit)
    const role = t && stem ? roleIn(t, stem) : 'flat'
    if (role === 'flat') flats.push(x)
    else if (role === 'level') {
      const g = towers.get(t!) ?? { name: x.unit.projectName, levels: [] }
      const k = t!.LEVELS![stem!]
      g.levels.push({ stem: x.stem, label: levelName(t!, k), k })
      towers.set(t!, g)
    }
  }
  return { flats, towers: [...towers.values()].map((g) => ({ ...g, levels: g.levels.sort((a, b) => b.k - a.k) })) }
})()

/**
 * Dev only (stripped from production builds): `?xr=emulate` installs Meta's IWER as an emulated Quest 3 before the
 * viewer asks isSessionSupported, and exposes it as window.__xrDevice so Playwright can pose the headset/controllers.
 */
const xrEmulation =
  import.meta.env.DEV && new URLSearchParams(location.search).get('xr') === 'emulate'
    ? import('iwer').then(({ XRDevice, metaQuest3 }) => {
        const device = new XRDevice(metaQuest3, { stereoEnabled: true })
        device.installRuntime({ forceInstall: true }) // Chromium ships a native navigator.xr
        Object.assign(window, { __xrDevice: device })
      })
    : null

/** a published unit as the viewer shows it; anything but a Unit (no such link, garbage) is "not available" */
const asUnit = (u: unknown): Unit | null => (isUnit(u) ? normalizeUnit(u) : null)

function resolveUnit(): Unit | null {
  const m = location.pathname.match(/^\/u\/([^/]+)/)
  if (!m) {
    history.replaceState(null, '', `/u/${UNITS[0].stem}${location.search}`)
    return UNITS[0].unit
  }
  const id = decodeURIComponent(m[1])
  if (id === 'preview') {
    try {
      return asUnit(JSON.parse(localStorage.getItem('plotline.preview') ?? 'null')) // a stale/garbage preview must not crash deriveRooms
    } catch {
      return null
    }
  }
  return UNITS.find((u) => u.stem === id || u.unit.id === id)?.unit ?? projectUnit(id) // a flat of a building made in the Studio (this browser)
}

const spawn = (scene: PlotlineScene, p: Pt, face: Pt, pitch = 0): void => scene.spawnAt(p, yawFor(face), pitch)
/** Plan-space eye position (rig + camera): the walker in walk mode, the orbit camera in dollhouse. */
const eyeOf = (scene: PlotlineScene): Pt => {
  const w = scene.camera.getWorldPosition(new THREE.Vector3())
  return { x: w.x, y: w.z }
}
const headingOf = (scene: PlotlineScene): Pt => {
  const d = scene.camera.getWorldDirection(new THREE.Vector3())
  return { x: d.x, y: d.z }
}

export default function ViewerApp() {
  // a published link: undefined while it loads, null when it fails (the load screen says so)
  const [fetched, setFetched] = useState<Unit | null | undefined>(TOKEN ? undefined : null)
  useEffect(() => {
    if (TOKEN)
      fetchSharedUnit(TOKEN)
        .then(asUnit)
        .catch((e) => (console.warn('[plotline] share link', e), null))
        .then(setFetched)
  }, [])
  // `base` = the unit's own layout (its JSON's, presets for rooms without pieces); a layout arranged in this browser
  // (Arrange, Studio F) wins; both through layoutFor, so a room added since gets its presets
  const [unit, base] = useMemo(() => {
    const u = onFloor(TOKEN ? (fetched ?? null) : resolveUnit())
    if (!u) return [null, []]
    const rooms = core.deriveRooms(u)
    const base = layoutFor(u, rooms)
    const saved = readLayout(u.id)
    // what a Studio draft / auto-trace / its share link lacks (finishes, area, name): defaults.ts
    return [{ ...withDefaults(u, rooms), furniture: saved ? layoutFor({ ...u, furniture: saved }, rooms) : base }, base]
  }, [fetched])
  if (TOKEN && fetched === undefined) return <div className="boot">Loading…</div>
  if (!unit) return <div className="boot">{NOT_FOUND}</div>
  if (!DEVICE.webgl2)
    return (
      <div className="viewer">
        <NoThreeD unit={unit} />
      </div>
    )
  return <Viewer unit={unit} base={base} />
}

const dims = (s: { x: number; y: number; z: number }) => `${s.x.toFixed(2)} × ${s.z.toFixed(2)} m, ${s.y.toFixed(2)} m high`

/** No 3D here (no WebGL 2, the 3D could not start, or the graphics gave up): a plain message and the flat's plan. */
function NoThreeD({ unit }: { unit: Unit }) {
  const rooms = useMemo(() => core.deriveRooms(unit), [unit])
  const map = useMemo(() => mapOf(unit, rooms), [unit, rooms])
  const { x, y, w, h } = map.box
  return (
    <div className="no3d">
      <p>{NO_3D}</p>
      <div className="muted">
        {unit.projectName} · {unit.name}
      </div>
      <div className="minimap">
        <svg viewBox={`${x} ${y} ${w} ${h}`} aria-label="floor plan">
          {map.rooms.map((r) => (
            <polygon key={r.id} className={r.zone ? `room zone z-${r.zone}` : 'room'} points={r.points} />
          ))}
          {map.walls.map((s, i) => (
            <path key={i} className={s.low ? `wall ${s.low}` : 'wall'} d={s.d} strokeWidth={s.w} />
          ))}
          {rooms.map((r) => (
            <text key={r.id} x={r.centroid.x} y={r.centroid.y} fontSize={0.32} textAnchor="middle">
              {r.name}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

/**
 * Quality (quality.ts, everyone): Lite / Low / High, the device's recommendation marked. Open — the reason and OK — the
 * first time 3D opens in this browser and after an automatic switch; then just the menu. A pick is kept for good.
 */
function QualityChip({ note, onPick }: { note: string | null; onPick: (q: Quality) => void }) {
  const [open, setOpen] = useState(() => !!note || read(local, KEYS.seen) !== '1')
  useEffect(() => void (note && setOpen(true)), [note])
  const close = () => {
    write(local, KEYS.seen, '1')
    setOpen(false)
  }
  const why = TIER.by === 'link' ? 'Set by this link.' : TIER.by === 'fallback' ? 'Lite since the 3D failed on this device.' : REC.why ? `Recommended for this device: ${REC.why}.` : 'This device can show the full look.'
  return (
    <div className={`glass quality${open ? ' open' : ''}`} title={DEVICE.gpu && `Graphics: ${DEVICE.gpu}`}>
      <label>
        <span className="label">Quality</span>
        <select value={TIER.tier} onChange={(e) => (close(), onPick(e.target.value as Quality))}>
          {QUALITIES.map((q) => (
            <option key={q} value={q}>
              {NAME[q]}
              {q === REC.tier ? ' (recommended for this device)' : ''}
            </option>
          ))}
        </select>
      </label>
      {open && (
        <>
          <div className="small muted">
            {note ?? why} Lite is lighter on the computer: fewer pixels, simpler pictures, no potted plants.
          </div>
          <button className="link" onClick={close}>
            OK
          </button>
        </>
      )}
    </div>
  )
}

/** The staff library (studio/LibraryPanel.tsx, the Studio's too): search, pieces by room and kind; pick one, then point where it goes. */
function AddPanel({ onPick }: { onPick: (assetId: string) => void }) {
  return (
    <aside className="glass library">
      <LibraryPanel onPick={onPick} focus />
    </aside>
  )
}

/** Arrange (staff): the selected piece, what it allows, turn / delete / undo / reset; Add opens the library; a piece in hand: what and why not. */
function ArrangePanel(p: {
  piece: FurniturePlacement | null
  held: HandInfo | null
  adding: boolean
  canUndo: boolean
  onTurn: () => void
  onDelete: () => void
  onUndo: () => void
  onReset: () => void
  onAdd: () => void
}) {
  const s = p.piece && placementSize(p.piece)
  return (
    <aside className="glass arrange">
      {p.held ? (
        <>
          <div className="arrange-name">
            {p.held.adding ? 'Placing' : 'Moving'}: {p.held.label}
          </div>
          <div className={`small ${p.held.error ? 'refused' : 'muted'}`}>
            {p.held.error ?? (p.held.ready ? `Click to put it here · R turns · Esc ${p.held.adding ? 'cancels' : 'puts it back'}` : 'Point at the floor, a wall or the ceiling')}
          </div>
        </>
      ) : p.piece && s ? (
        <>
          <div className="arrange-name">{placementLabel(p.piece)}</div>
          <div className="muted small">
            {p.piece.openingId
              ? 'Hangs on its opening and follows it: drag it along the wall, drag a side dot to make it wider or narrower, or Delete it'
              : resizeAxes(p.piece.assetId).length
                ? `${dims(s)} · drag a dot to resize`
                : 'This piece can be moved and turned'}
          </div>
        </>
      ) : (
        <div className="muted small">Click a piece, then drag it. The TV, art and AC slide along the walls, curtains along their opening's wall, lights and fans on the ceiling. Add puts a new one in.</div>
      )}
      <div className="arrange-row">
        <button className={`btn${p.adding ? ' active' : ''}`} title="Add a piece from the library" onClick={p.onAdd}>
          Add
        </button>
        <button className="btn" disabled={!p.piece && !p.held} onClick={p.onTurn}>
          Turn 90° (R)
        </button>
        <button className="btn" disabled={!p.piece && !p.held} title="Delete this piece (and what rests on it) — also the one in your hand (Del)" onClick={p.onDelete}>
          Delete
        </button>
        <button className="btn" disabled={!p.canUndo} onClick={p.onUndo}>
          Undo
        </button>
        <button className="btn" title="Back to the unit’s own layout (undo brings yours back)" onClick={p.onReset}>
          Reset layout
        </button>
      </div>
    </aside>
  )
}

/** Edit openings: why a change could not go into the Studio draft (arrange.ts saveOpenings / draftState) */
const OPENINGS_WHY = {
  other: 'Not saved: the Studio has another unit open now. Click Edit openings again to make this one the draft.',
  changed: 'The plan was changed in the Studio after this preview. Click Preview 3D in the Studio again, then edit the openings here.',
  full: 'Not saved: this browser’s storage is full. Export the Studio draft, then try again.',
}
/** the Studio's 10 px edge snap (flush to a wall end / a neighbour), in metres: about 4" */
const OPENING_SNAP_M = 0.1
const KINDS: [OpeningKind, string][] = [
  ['door', 'Door'],
  ['window', 'Window'],
  ['slider', 'Slider'],
  ['passage', 'Passage'],
]

/** A length typed in feet-inches (core parseLength: 3'-6", 3.5, 1.07m), set on Enter (which leaves the field, so Del / Ctrl+Z act on the opening again) or when the field is left. */
function FtIn({ label, m, onSet }: { label: string; m: number; onSet: (m: number) => void }) {
  const [text, setText] = useState(core.formatFeetInches(m))
  const [bad, setBad] = useState(false)
  useEffect(() => setText(core.formatFeetInches(m)), [m])
  const set = () => {
    const v = core.parseLength(text)
    if (v === null || v < 0) return setBad(true)
    setBad(false)
    if (Math.abs(v - m) > 1e-4) onSet(v)
  }
  return (
    <label className="ftin">
      {label}
      <input value={text} className={bad ? 'bad' : ''} onChange={(e) => (setText(e.target.value), setBad(false))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} onBlur={set} />
    </label>
  )
}

/** Edit openings (staff): the selected opening — kind, width / height / sill in feet-inches — or low wall — length, height — delete, undo, and where it saves. */
function OpeningPanel(p: {
  opening: Opening | null
  wall: { w: Wall; lengthM: number } | null
  where: string
  refused: boolean
  canUndo: boolean
  onKind: (k: OpeningKind) => void
  onSize: (patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM'>>) => void
  onWall: (patch: { lengthM?: number; heightM?: number }) => void
  onDelete: () => void
  onUndo: () => void
}) {
  const o = p.opening
  const lw = p.wall
  return (
    <aside className="glass arrange">
      {lw ? (
        <>
          <div className="arrange-name">
            {WALL_TYPES[wallTypeOf(lw.w.heightM)].label} · {core.formatFeetInches(lw.lengthM)} long · {core.formatFeetInches(lw.w.heightM)} high
          </div>
          <div className="small muted">{p.where}</div>
          <div className="arrange-row">
            <FtIn label="Length" m={lw.lengthM} onSet={(lengthM) => p.onWall({ lengthM })} />
            <FtIn label="Height" m={lw.w.heightM} onSet={(heightM) => p.onWall({ heightM })} />
          </div>
        </>
      ) : o ? (
        <>
          <div className="arrange-name">
            {KINDS.find(([k]) => k === o.kind)?.[1]} · {core.formatFeetInches(o.widthM)} wide
          </div>
          <div className={`small ${p.refused ? 'refused' : 'muted'}`}>{p.refused ? 'Not there: another opening is in the way' : p.where}</div>
          <div className="arrange-row">
            {KINDS.map(([k, label]) => (
              <button key={k} className={`btn${o.kind === k ? ' active' : ''}`} onClick={() => k !== o.kind && p.onKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="arrange-row">
            <FtIn label="Width" m={o.widthM} onSet={(widthM) => p.onSize({ widthM })} />
            <FtIn label="Height" m={o.heightM} onSet={(heightM) => p.onSize({ heightM })} />
            <FtIn label="Sill" m={o.sillM} onSet={(sillM) => p.onSize({ sillM })} />
          </div>
        </>
      ) : (
        <div className="muted small">
          Click a door, window, slider or passage. Drag it along its wall; drag a dot to resize it — the side dots for width, the top dot for height, a window's bottom dot for its sill. Or click a low wall (railing, planter edge, kerb): drag an end dot to make it longer or shorter, drag the wall to move it across.
        </div>
      )}
      <div className="arrange-row">
        <button className="btn" disabled={!o && !lw} title="Remove it (Del)" onClick={p.onDelete}>
          Delete
        </button>
        <button className="btn" disabled={!p.canUndo} title="Ctrl+Z" onClick={p.onUndo}>
          Undo
        </button>
      </div>
      <div className="muted small">Saved into your Studio draft — the floor plan shows it too.</div>
    </aside>
  )
}

function Viewer({ unit: given, base }: { unit: Unit; base: FurniturePlacement[] }) {
  // the plan as the 3D shows it: `given`, then whatever Edit openings commits (the scene is rebuilt in place, not re-made)
  const [unit, setPlanUnit] = useState(given)
  const rooms = useMemo(() => core.deriveRooms(unit), [unit])
  const listed = useMemo(() => listedRooms(unit, rooms), [unit, rooms])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scene, setScene] = useState<PlotlineScene | null>(null)
  /** the 3D could not start, or the graphics gave up for good: the message and the plan */
  const [no3d, setNo3d] = useState(false)
  /** an automatic quality step (QualityChip): after a reload, or Lite's shadows going off */
  const [qNote, setQNote] = useState(SWITCHED)
  const [loaded, setLoaded] = useState(0)
  const [entered, setEntered] = useState(false)
  const [mode, setMode] = useState<SceneMode>('walk')
  const [hour, setHour] = useState(DEFAULT_HOUR)
  /** the sun's day (the scene starts on today too) and the wind: its month's rose and arrows, on or off */
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [windOn, setWindOn] = useState(false)
  const [roseOn, setRoseOn] = useState(roseSaved)
  const [lightsMode, setLightsMode] = useState(lightsSaved)
  const alt = core.sunAt(unit.site, date, hour).altDeg
  const lit = lightsOn(lightsMode, alt)
  /** a click flips the lights; flipped back to what automatic would show, it is automatic again */
  const flipLights = () => {
    const mode: LightsMode = lit === lightsOn('auto', alt) ? (lit ? 'off' : 'on') : 'auto'
    setLightsMode(mode)
    scene?.setLightsMode(mode)
    try {
      localStorage.setItem(LIGHTS_KEY, mode)
    } catch {
      /* this browser keeps nothing: the lights stay as clicked for now */
    }
  }
  const months = unit.site?.wind ?? core.DHAKA_WIND
  const month = Number(date.slice(5, 7)) - 1
  const windRooms = useMemo(() => (windOn ? core.roomWind(unit, rooms, months[month].fromDeg) : []), [windOn, unit, rooms, months, month])
  /** a month picked (the strip or the rose): the same day of it, the sun moves with it */
  const pickMonth = (m: number) => {
    const d = `${date.slice(0, 5)}${String(m + 1).padStart(2, '0')}-${String(Math.min(28, Number(date.slice(8, 10)))).padStart(2, '0')}`
    setDate(d)
    scene?.setTimeOfDay(hour, d)
  }
  /** the one-room / one-wall finish keys this plan offers, with their slot and name (share.ts) */
  const keys = useMemo(() => finishKeys(unit, rooms), [unit, rooms])
  const [cfg, setCfg] = useState<Configuration>(() => decodeConfig(new URLSearchParams(location.search).get('c'), unit.finishSlots, keys))
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  /** the floor / wall / ceiling clicked while the Finishes panel is open */
  const [surface, setSurface] = useState<Surface | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [finishesOpen, setFinishesOpen] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [xr, setXr] = useState<XRControls | null>(null)
  const [inVR, setInVR] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pins, setPins] = useState<Pin[]>(() => readPins(unit.id))
  const [draft, setDraft] = useState<(Draft & { hit: PickHit }) | null>(null)
  const [picked, setPicked] = useState(unit.floor ?? 0)
  // Arrange (staff): the committed layout and its undo steps; a resize's candidate lives in `live` until the drop
  const [arranging, setArranging] = useState(false)
  const [sel, setSel] = useState<Id | null>(null)
  const steps = useRef<Steps>({ pieces: unit.furniture, past: [] })
  const live = useRef<Move | null>(null)
  // the library: open or not
  const [adding, setAdding] = useState(false)
  // the piece in hand (arrange.ts Held): dragged, picked up with G, or new from the library; committed only where it fits
  const held = useRef<Held | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const stem = towerStem(unit)
  const tower = stem ? towerOf(unit) : null
  /** a common level of its tower (ground, basement, rooftop): its floor */
  const level = stem ? tower?.LEVELS?.[stem] : undefined
  /** the level the Building view's picked floor holds (the "Walk this level" button), if any */
  const levelAt = (k: number) => (tower?.FLOORS.find((f) => f.floor === k)?.standIns ?? []).find((s) => tower?.LEVELS?.[s] !== undefined)
  const commentingRef = useRef(commenting)
  commentingRef.current = commenting
  const finishesRef = useRef(finishesOpen)
  finishesRef.current = finishesOpen
  const modeRef = useRef(mode)
  modeRef.current = mode
  /** every slot resolved (selection or its default), plus the one-room / one-wall choices — what the engine and the share link get */
  const fullCfg = useMemo<Configuration>(
    () => ({ ...Object.fromEntries(unit.finishSlots.map((s) => [s.id, s.defaultOptionId])), ...cfg }),
    [unit.finishSlots, cfg],
  )

  // engine (made once per unit loaded; an opening edit rebuilds it in place — its rooms, so the closures below, stay the same)
  useEffect(() => {
    let s: PlotlineScene
    try {
      s = new PlotlineScene(canvasRef.current!, { quality: TIER.tier })
    } catch (e) {
      console.warn('[plotline] the 3D could not start', e)
      setNo3d(true)
      return
    }
    // frames too slow: down one tier once — only while the device chose (a pick is never overridden); Lite: shadows off
    s.onSlow(() => {
      if (TIER.tier === 'lite') {
        s.shadowsOff()
        setQNote('Shadows off: frames were still slow on this device.')
      } else if (TIER.by === 'device') {
        write(local, KEYS.slow, lower(TIER.tier))
        write(tab, KEYS.note, `Switched to ${NAME[lower(TIER.tier)]}: frames were slow on this device.`)
        restart(cfgRef.current)
      }
    })
    // the graphics failed (context lost, out of memory): Lite once, whoever chose; already Lite and not back: the message
    s.onFail((why) => {
      if (why === 'gone') return setNo3d(true)
      if (TIER.tier === 'lite') return
      write(tab, KEYS.fallback, 'lite')
      write(tab, KEYS.note, `Switched to Lite: ${why === 'memory' ? 'the graphics ran out of memory' : 'the 3D stopped'} on this device.`)
      restart(cfgRef.current)
    })
    s.cover = tower && stem ? coverOf(tower, stem) : [] // a level: the slab of the floors above it
    s.setUnit(given)
    s.setLightsMode(lightsSaved())
    s.setTimeOfDay(DEFAULT_HOUR)
    s.onPick((hit) => {
      if (!hit) return
      // the Finishes panel open: a floor / wall / ceiling picks that room's (that wall's) finish — in the dollhouse instead of dropping in
      const r = finishesRef.current && hit.kind !== 'opening' && hit.kind !== 'furniture' ? rooms.find((x) => x.id === hit.roomId) : undefined
      const room = r && roomKey(r.id, hit.kind as FinishSlot['target'])
      const face = r && hit.kind === 'wall' ? wallKey(faceWallId(unit, r, hit.id), r.id) : undefined // a column: none, its room's walls
      if (commentingRef.current) {
        const roomId = hit.roomId ?? core.roomAt({ x: hit.point.x, y: hit.point.z }, rooms, unit)?.id
        setDraft({ hit: { ...hit, roomId }, point: hit.point, label: tagOf(hit.label, rooms.find((r) => r.id === roomId)?.name) })
      } else if (room && keys.has(room)) {
        setSurface({ roomKey: room, wallKey: face && keys.has(face) ? face : undefined })
      } else if (modeRef.current === 'orbit' && hit.kind === 'floor') {
        // dollhouse → click a room floor drops back into walk mode there, keeping the orbit heading (§3.2)
        s.spawnAt({ x: hit.point.x, y: hit.point.z }, yawFor(headingOf(s)))
        setMode('walk')
      }
    })
    // Building view: a click on this flat opens its dollhouse, on another flat loads that one on its floor
    s.onFlat((f) => {
      if (!f) return
      if (f.stem !== stem || f.floor !== unit.floor) return location.assign(`/u/${f.stem}?floor=${f.floor}&view=dollhouse`)
      setMode('orbit')
      s.setMode('orbit')
    })
    let alive = true // StrictMode/HMR dispose this scene before the promise settles
    void Promise.resolve(xrEmulation)
      .then(() => navigator.xr?.isSessionSupported('immersive-vr'))
      .then((ok) => {
        if (!ok || !alive) return
        setXr(s.enableXR())
        s.renderer.xr.addEventListener('sessionstart', () => {
          setMode('walk') // engine forces walk in VR; keep the button label honest
          setInVR(true)
        })
        s.renderer.xr.addEventListener('sessionend', () => setInVR(false))
      })
    if (import.meta.env.DEV) Object.assign(window, { __plotline: s })
    setScene(s)
    return () => {
      alive = false
      s.dispose()
    }
  }, [given]) // eslint-disable-line react-hooks/exhaustive-deps

  // Wind on: the month's arrows through the flat (three/wind.ts)
  useEffect(() => scene?.setWind(windOn ? months[month] : null, core.seasonOf(month, unit.site)), [scene, windOn, months, month, unit.site])

  useEffect(() => {
    scene?.setConfiguration(fullCfg)
  }, [scene, fullCfg])

  // a share link: what waited in this browser's outbox (sent offline) goes now, and whenever the network comes back
  useEffect(() => {
    if (!TOKEN) return
    const send = () => void flushOutbox()
    send()
    addEventListener('online', send)
    return () => removeEventListener('online', send)
  }, [])

  // load progress: a room counts once every placement it owns is in the scene graph
  useEffect(() => {
    if (!scene) return
    const need = new Map<Id, Id[]>()
    for (const p of unit.furniture) need.set(p.roomId, [...(need.get(p.roomId) ?? []), p.id])
    const poll = setInterval(() => {
      const seen = new Set<string>()
      scene.scene.traverse((o) => {
        if (o.userData.kind === 'furniture') seen.add(o.userData.id as string)
      })
      const k = rooms.filter((r) => (need.get(r.id) ?? []).every((id) => seen.has(id))).length
      setLoaded(k)
      if (k === rooms.length) clearInterval(poll)
    }, 150)
    const cap = setTimeout(() => setLoaded(rooms.length), 20000) // a stuck download must not block Enter
    return () => {
      clearInterval(poll)
      clearTimeout(cap)
    }
  }, [scene, unit, rooms])

  // room chip + pointer lock state
  useEffect(() => {
    if (!scene) return
    const t = setInterval(() => {
      const id = scene.currentRoomId()
      if (id) setRoom((prev) => (prev?.id === id ? prev : (rooms.find((r) => r.id === id) ?? prev)))
    }, 100)
    const onLock = () => setLocked(!!document.pointerLockElement)
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      clearInterval(t)
      document.removeEventListener('pointerlockchange', onLock)
    }
  }, [scene, rooms])

  const ready = loaded >= rooms.length

  const enter = () => {
    if (!scene || !ready) return
    setEntered(true)
    const e = entrySpawn(shown(), rooms)
    if (e) spawn(scene, e.p, e.face)
    if (params.get('view') === 'dollhouse') go('orbit')
    else if (params.get('view') === 'building') {
      go(stem ? 'building' : 'orbit') // the Studio's "Show building" (taken out of it since: the dollhouse)
      const k = Number(params.get('pick')) // a level shown from the Studio: its floor picked (a basement: what is above it hidden)
      if (stem && params.has('pick') && Number.isFinite(k)) (setPicked(k), scene.showFloor(k))
    } else if (STAFF && params.get('edit') === 'openings') toggleOpenings() // a built-in unit just made the Studio draft
    else scene.lockPointer()
  }

  const go = (m: SceneMode) => {
    if (m === modeRef.current) return // setMode('walk') again would snap the view back to the last saved heading
    setMode(m)
    scene?.setMode(m)
    setPicked(unit.floor ?? 0)
  }
  const toggleMode = () => go(mode === 'walk' ? 'orbit' : 'walk')
  // a flat picked in the Building view opens straight into its dollhouse once loaded; the Studio's building into the tower
  useEffect(() => {
    if (ready && !entered && (params.get('view') === 'dollhouse' || params.get('view') === 'building')) enter()
  })

  const showToast = (msg: string, ms = 2500) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), ms)
  }

  const share = () => {
    const url = shareUrl(location, unit.floor, fullCfg) // the flat picked in the Building view stays on its floor; never `staff`
    history.replaceState(null, '', url)
    void navigator.clipboard?.writeText(url).then(() => showToast('Link copied — it opens with exactly these finishes.'))
  }

  const toggleVR = () => void xr?.toggle().catch(() => showToast(VR_FAILED))

  // ── Arrange: the Studio's rules (arrange.ts → studio/furniture.ts); the scene moves one piece's transform at a time
  const pieceOf = (id: Id | null) => steps.current.pieces.find((p) => p.id === id) ?? null
  const showSel = (p: FurniturePlacement | null, refused = false) =>
    scene?.showSelection(p && { id: p.id, quad: pieceQuad(p), refused, axes: resizeAxes(p.assetId) })
  /** a committed step (drop, turn, undo, reset): saved for this browser and the Studio, shadows and lights follow */
  const settle = (h: Steps, show = sel) => {
    h = { ...h, pieces: layoutFor({ ...unit, furniture: h.pieces }, rooms) } // curtains on their windows as they are now
    steps.current = h
    saveLayout(unit.id, h.pieces, base)
    scene?.setLayout(h.pieces)
    showSel(pieceOf(show))
    redraw()
  }
  const undo = () => steps.current.past.length && settle(undoStep(steps.current))
  const turn = () => {
    const p = pieceOf(sel)
    const m = p && movePiece(unit, rooms, steps.current.pieces, p.id, p, p.rotationDeg + 90, false)
    if (m?.error) showToast(m.error)
    else if (m) settle(pushStep(steps.current, m.furniture))
  }
  /** Delete: the piece in hand (G, a drag: deleteHeld), else the one picked; one undo step */
  const remove = () => {
    const h = held.current
    const next = h ? deleteHeld(steps.current.pieces, h) : sel && deletePiece(steps.current.pieces, sel)
    letGo()
    setSel(null)
    if (next) settle(pushStep(steps.current, next), null)
  }
  /** the unit as arranged, deleted pieces out: what the first views frame */
  const shown = (): Unit => ({ ...unit, furniture: steps.current.pieces.some((p) => p.removed) ? steps.current.pieces.filter((p) => !p.removed) : steps.current.pieces })
  const toggleArrange = () => {
    letGo()
    if (editingOpenings) toggleOpenings() // one editor at a time
    setAdding(false)
    setArranging(!arranging)
    scene?.setArrange(!arranging)
    setSel(null)
    setCommenting(false)
    if (!arranging && !stored(HINTED)) {
      showToast('Edit furniture: click a piece to move, turn, resize or delete it — or Add one from the library', 6000)
      store(HINTED)
    }
  }
  // ── the piece in hand (ask 10 / 7): it follows the pointer, or the crosshair while walking with the mouse locked, on
  // the Studio's rules; a refused spot keeps it in hand, red with the reason; a click / G drops it only where it fits; Esc
  // puts it back where it was picked up (nothing was committed). The library's new piece is held the same way.
  const ceilingM = Math.max(...unit.walls.map((w) => w.heightM))
  /** the candidate shown: the whole layout with the held piece where it is (red when refused) */
  const showHeld = (h: Held | null) => {
    held.current = h
    scene?.placePieces(h?.move?.furniture ?? steps.current.pieces, true)
    const p = h ? h.move?.piece : arranging ? pieceOf(sel) : null // a walk carry leaves nothing selected
    scene?.showSelection(p ? { id: p.id, quad: pieceQuad(p), refused: !!h?.move?.error, axes: h ? [] : resizeAxes(p.assetId) } : null) // in hand: no resize dots
    redraw()
  }
  /** Picks `h` up; the scene moves it with the pointer on the floor (or the ceiling: lights, fans), wall pieces by the wall in view. */
  const grip = (h: Held) => {
    letGo()
    held.current = h
    scene?.setHand({ id: h.id, y: surfaceOf(h.assetId ? { assetId: h.assetId } : (pieceOf(h.id) ?? { assetId: '' })) === 'ceiling' ? ceilingM : 0 })
  }
  const startPlacing = (assetId: string) => {
    grip({ id: core.newId(), assetId, rot: 0, at: null, move: null })
    setAdding(false)
    setSel(null)
    showSel(null)
  }
  /** G: the piece under the crosshair / pointer into the hand; nothing there says so */
  const pickUpAtPointer = () => {
    const id = scene?.pieceUnderPointer()
    if (!id) return showToast(`Point ${locked ? 'the dot' : 'the mouse'} at a piece of furniture, then press G`)
    if (arranging) setSel(id)
    grip(pickUp(steps.current.pieces, id))
  }
  /** Esc (or the mouse lock lost mid-carry, or done): the hand empties; the layout is the committed one again */
  const letGo = () => {
    if (!held.current) return
    scene?.setHand(null)
    showHeld(null) // ponytail: a cancelled library ghost stays in the scene graph, hidden, until the page reloads
  }
  /** A click / G / a drag's release: drops it where it fits; refused, it stays in hand (red, the reason on screen) */
  const dropHand = () => {
    const h = held.current
    const furniture = h && dropHeld(h)
    if (!h?.move || !furniture) return
    held.current = null
    scene?.setHand(null)
    const id = arranging ? h.move.piece.id : null // Arrange keeps it selected; a walk carry leaves nothing selected
    setSel(id)
    settle(pushStep(steps.current, furniture), id)
  }
  const onArrange = (e: ArrangeEvent) => {
    if (e.kind === 'select') {
      // the piece clicked, so Delete takes just the TV off its unit; a drag of it moves what it rests on (dragTo)
      const p = pieceOf(e.id)
      setSel(p?.id ?? null)
      return showSel(p)
    }
    if (e.kind === 'drag') {
      const h = held.current ?? pickUp(steps.current.pieces, e.id) // a drag's first frame picks the piece up
      if (h.id === e.id) showHeld(holdAt(unit, rooms, steps.current.pieces, h, e))
      return
    }
    if (e.kind === 'drop' && held.current) return dropHand()
    const m = live.current
    if (e.kind === 'drop') {
      live.current = null
      if (!m) return
      if (!m.error) return settle(pushStep(steps.current, m.furniture), m.piece.id)
      scene?.placePieces(steps.current.pieces, true) // a refused resize springs back (chairs it added go)
      showSel(pieceOf(m.piece.id))
      return showToast(m.error)
    }
    const p = pieceOf(e.id)
    const next = p && resizePiece(unit, rooms, steps.current.pieces, e.id, { ...placementSize(p), [e.axis]: e.sizeM }, { x: e.axis === 'x' ? e.sign : 0, z: e.axis === 'z' ? e.sign : 0 })
    if (!next) return
    live.current = next
    scene?.placePieces(next.furniture, true) // the whole layout: a chair an earlier frame of this resize added goes again
    showSel(next.piece, !!next.error)
  }
  useEffect(() => scene?.onArrange(onArrange))
  // the browser's Esc frees a locked mouse without telling the page: a carry in walk ends there, the piece back where it was
  useEffect(() => {
    const onLock = () => !document.pointerLockElement && !arranging && letGo()
    document.addEventListener('pointerlockchange', onLock)
    return () => document.removeEventListener('pointerlockchange', onLock)
  })

  // ── Edit openings (staff, founder 2026-10-04): the Studio's own reducer over this plan (model.ts drag-opening /
  // resize-opening / update-opening / delete / undo — one source of rules); a drag shows its outline live, every committed
  // change goes into the Studio draft + the preview (arrange.ts saveOpenings) and rebuilds the 3D in place, camera kept
  const [editingOpenings, setEditingOpenings] = useState(false)
  const [opSel, setOpSel] = useState<Id | null>(null)
  const plan = useRef<StudioState>({ ...initialState(), unit: given })
  /** the plan before the gesture in progress (a drag: from its first move to its drop) */
  const gesture = useRef<StudioState | null>(null)
  /** a low wall's drag: the corners its drop joins (model drag-end), as the Studio's V drop does */
  const dragIds = useRef<Id[] | null>(null)
  const showOp = (id = opSel) => {
    const u = plan.current.unit
    const w = id ? u.walls.find((x) => x.id === id) : undefined
    if (w) return scene?.showWall({ id: w.id, a: core.vertexById(u.vertices, w.a), b: core.vertexById(u.vertices, w.b), heightM: w.heightM, thicknessM: w.thicknessM })
    const f = id ? findOpening(plan.current.unit, id) : null
    const { offsetM, widthM, heightM, sillM } = f?.opening ?? { offsetM: 0, widthM: 0, heightM: 0, sillM: 0 }
    scene?.showOpening(f && { id: f.opening.id, wallId: f.wall.id, offsetM, widthM, heightM, sillM, refused: plan.current.dragBlocked })
  }
  /** a plan action, live (a drag's frames, or the first step of a commit); the reducer's refusals toast */
  const planDo = (a: Action) => {
    gesture.current ??= plan.current
    const next = reducer(plan.current, a)
    if (next.toast) showToast(next.toast.text)
    plan.current = { ...next, toast: null }
    showOp()
    redraw()
  }
  /** the gesture done: saved into the draft and the preview, the 3D rebuilt in place; refused there, the plan goes back */
  const commitPlan = () => {
    const before = gesture.current
    gesture.current = null
    const after = plan.current.unit
    plan.current = { ...plan.current, dragBlocked: false }
    if (!before) return showOp()
    if (planOf(after) === planOf(unit)) {
      // nothing changed (a drag back to where it was, a refused width): no undo step, no rebuild — but an undo keeps its step
      if (before.history.past.length <= plan.current.history.past.length) plan.current = { ...before, dragBlocked: false }
      return showOp()
    }
    const why = saveOpenings(unit, after)
    if (why !== 'ok') {
      plan.current = before
      showOp()
      return showToast(OPENINGS_WHY[why], 7000)
    }
    setPlanUnit(after)
    // curtains follow their window (moved, resized) or go with it, a room still on its presets is furnished for its new
    // walls (a planter bed fills the moved strip): the layout laid again on the new plan, no undo step of its own
    steps.current = { ...steps.current, pieces: refurnish(unit, after, steps.current.pieces) }
    scene?.setUnit({ ...after, furniture: steps.current.pieces }, true)
    scene?.setLayout(steps.current.pieces)
    showOp()
    redraw()
  }
  const planCommit = (a: Action) => {
    planDo(a)
    commitPlan()
  }
  const onOpening = (e: OpeningEvent) => {
    if (e.kind === 'select') {
      setOpSel(e.id)
      return showOp(e.id)
    }
    if (e.kind === 'drop') {
      if (dragIds.current) planDo({ type: 'drag-end', ids: dragIds.current }) // a low wall's ends join where they land
      dragIds.current = null
      return commitPlan()
    }
    if (!gesture.current) planDo({ type: 'drag-begin' }) // one undo step for the whole drag
    if (e.kind === 'wall-end' || e.kind === 'wall-move') {
      const r = wallDrag(plan.current, gesture.current!.unit, e, OPENING_SNAP_M)
      dragIds.current = r.ids
      plan.current = r.s
      showOp()
      return redraw()
    }
    planDo(e.kind === 'slide' ? { type: 'drag-opening', id: e.id, offsetM: e.offsetM, tolM: OPENING_SNAP_M } : { type: 'resize-opening', id: e.id, end: e.end, uM: e.uM, tolM: OPENING_SNAP_M })
  }
  useEffect(() => scene?.onOpening(onOpening))
  const toggleOpenings = () => {
    if (editingOpenings) {
      setEditingOpenings(false)
      setOpSel(null)
      return scene?.setOpeningEdit(false)
    }
    const at = draftState(unit)
    if (at === 'changed') return showToast(OPENINGS_WHY.changed, 7000)
    if (at === 'other') {
      // its doors and windows live in the Studio draft: this unit becomes the draft (as Edit plan does), asked first
      const builtIn = location.pathname !== '/u/preview'
      const ask = builtIn
        ? `${unit.name} is a built-in unit. Its doors and windows are edited on your Studio draft: this makes it your Studio draft (replacing the unit open in the Studio — export that first if you need it) and reopens it here. Continue?`
        : 'Edit openings saves into your Studio draft, and your Studio draft is not this unit. Make this unit your Studio draft? (It replaces the unit open in the Studio — export that one first if you need it.)'
      if (!window.confirm(ask)) return
      if (!makeDraft(unit)) return showToast(OPENINGS_WHY.full, 7000)
      if (builtIn) return location.assign('/u/preview?edit=openings')
    }
    letGo()
    setAdding(false)
    setArranging(false)
    scene?.setArrange(false)
    setSel(null)
    setCommenting(false)
    setEditingOpenings(true)
    scene?.setOpeningEdit(true)
  }

  // keys: Enter (load screen), O, F, C, P (the wind, as the Wind button), Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!entered) {
        if (e.key === 'Enter') enter()
        return
      }
      if (inVR) return // a desk keyboard next to a tethered headset must not flip the scene to dollhouse
      const k = e.key.toLowerCase()
      const h = held.current
      if (editingOpenings && k === 'z' && (e.ctrlKey || e.metaKey)) {
        if (plan.current.history.past.length) planCommit({ type: 'undo' })
      } else if (editingOpenings && opSel && (k === 'delete' || k === 'backspace')) {
        setOpSel(null)
        planCommit({ type: 'delete', ids: [opSel] })
      } else if (editingOpenings && opSel && k === 'escape') {
        setOpSel(null)
        showOp(null)
      } else if (arranging && k === 'z' && (e.ctrlKey || e.metaKey)) {
        letGo()
        undo()
      } else if (h && k === 'r') showHeld(turnHeld(unit, rooms, steps.current.pieces, h))
      else if (STAFF && k === 'g' && mode !== 'building' && !editingOpenings && !e.repeat) {
        // G: pick up the piece under the crosshair (or the pointer); G again puts it down where it fits
        if (h) dropHand()
        else pickUpAtPointer()
      } else if (h && k === 'escape') letGo() // back where it was picked up; the selection stays
      else if (arranging && k === 'r') turn()
      else if ((arranging || h) && (k === 'delete' || k === 'backspace')) remove()
      else if (arranging && k === 'escape') {
        setAdding(false)
        setSel(null)
        showSel(null)
      } else if (k === 'o') toggleMode()
      else if (k === 'b' && stem) go('building')
      else if (k === 'f') setFinishesOpen((v) => !v)
      else if (k === 'c') setCommenting((v) => !v)
      else if (k === 'p' && !e.repeat) setWindOn((v) => !v) // founder 2026-10-19: "make windpaths visible by pressing the button p"
      else if (k === 'escape') {
        setCommenting(false)
        setDraft(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const savePin = (text: string) => {
    if (!draft) return
    const { hit } = draft
    const pin: Pin = {
      id: core.newId(),
      anchor: { kind: hit.kind, entityId: hit.id, offset: hit.localOffset, label: hit.label, objectKind: hit.objectKind },
      point: hit.point,
      roomId: hit.roomId,
      text,
      createdAt: new Date().toISOString(),
    }
    appendPin(unit.id, pin)
    if (TOKEN) void sendEvent(TOKEN, 'comment', pin.id, { text, object: draft.label, anchor: pin.anchor, roomId: pin.roomId })
    setPins(readPins(unit.id))
    setDraft(null)
    setCommenting(false)
    setFinishesOpen(true)
  }
  /**
   * A finish choice: a slot id, or a one-room / one-wall key (null: back to the group's choice). On a share link it goes to
   * the change list (lib/events.ts) under that key, named for a person; picking the chip already chosen logs nothing.
   */
  const choose = (key: string, optionId: Id | null) => {
    const k = keys.get(key)
    const slot = unit.finishSlots.find((x) => x.id === key) ?? k?.slot
    const p = slot && (cfg[key] ?? (k ? null : slot.defaultOptionId)) !== optionId && selectionPayload(slot, optionId, k && { key, scope: k.scope })
    if (TOKEN && p) void sendEvent(TOKEN, 'selection', key, p)
    setCfg((c) => {
      const next = { ...c }
      if (optionId) next[key] = optionId
      else delete next[key]
      return next
    })
  }

  const focusPin = (pin: Pin) => {
    if (!scene) return
    const target = { x: pin.point.x, y: pin.point.z }
    let from = eyeOf(scene)
    const r = (pin.roomId && rooms.find((x) => x.id === pin.roomId)) || core.roomAt(target, rooms, unit)
    if (r && core.roomAt(from, rooms, unit)?.id !== r.id) from = r.centroid
    const d = Math.hypot(target.x - from.x, target.y - from.y) || 1
    spawn(scene, from, { x: (target.x - from.x) / d, y: (target.y - from.y) / d })
    setMode('walk')
  }

  const sqm = Math.round(unit.areaSqft * 0.09290304)
  const h = held.current
  const hp = h && (h.move?.piece ?? pieceOf(h.id) ?? (h.assetId ? { assetId: h.assetId } : null))
  const handInfo: HandInfo | null = h && { label: hp ? placementLabel(hp) : '', error: h.move?.error ?? null, ready: !!h.move, adding: !!h.assetId }
  const opF = editingOpenings && opSel ? findOpening(plan.current.unit, opSel) : null
  const opW = editingOpenings && opSel ? plan.current.unit.walls.find((w) => w.id === opSel) : undefined
  const opWall = opW ? { w: opW, lengthM: core.wallFrame(opW, plan.current.unit.vertices).lengthM } : null
  // the level on the floor picked in the Building view (buyers too: a share link's level stays a buyer's link)
  const walkStem = levelAt(picked)
  return (
    <div className={`viewer${commenting ? ' commenting' : ''}`}>
      <canvas ref={canvasRef} className={`scene${entered ? '' : ' blurred'}`} />

      {!entered && (
        <div className="load">
          <div className="project">{unit.projectName}</div>
          <div className="unit-name">{unit.name}</div>
          <div className="muted">
            {level !== undefined ? (
              levelName(tower!, level)
            ) : (
              <>
                {unit.floor !== undefined && `Floor ${unit.floor} · `}
                {unit.areaSqft} sqft · {sqm} m²
              </>
            )}
          </div>
          <div className="progress">
            <div className="bar" style={{ width: `${rooms.length ? (loaded / rooms.length) * 100 : 100}%` }} />
          </div>
          <div className="muted small">
            {ready ? 'Ready' : `Loading… ${loaded} of ${rooms.length} rooms`}
          </div>
          <button className="btn primary enter" disabled={!ready} onClick={enter}>
            {ready ? 'Enter' : 'Loading…'}
          </button>
          {/* ponytail: plain links until Phase A gives each developer a project list */}
          <nav className="load-nav muted small">
            {NAV.flats.map((u) => (
              <a key={u.stem} href={`/u/${u.stem}`} className={u.unit.id === unit.id ? 'current' : ''}>
                {u.unit.name}
              </a>
            ))}
            {!SHARED && <a href="/studio">Studio</a>}
            {!SHARED &&
              (STAFF ? (
                <a href={staffHref('0')} title="See the flat as a buyer does (no Edit furniture, no Edit plan)">
                  Leave staff mode
                </a>
              ) : (
                <a href={staffHref('1')} title="For the developer’s team: Edit furniture and Edit plan in this browser. Buyer links never show them.">
                  Staff mode
                </a>
              ))}
          </nav>
          {NAV.towers.map((g) => (
            <nav key={g.name} className="load-nav load-levels muted small">
              <span className="tower">{g.name}</span>
              {g.levels.map((l) => (
                <a key={l.stem} href={`/u/${l.stem}`} className={l.stem === stem ? 'current' : ''}>
                  {l.label}
                </a>
              ))}
            </nav>
          ))}
        </div>
      )}

      {entered && inVR && (
        <div className="hud-tr">
          <button className="btn" onClick={toggleVR}>
            Exit VR
          </button>
        </div>
      )}

      {entered && scene && !inVR && (
        <>
          <Hud
            room={room}
            rooms={listed}
            mode={mode}
            floor={unit.floor}
            floorLabel={level !== undefined ? levelName(tower!, level) : unit.floor !== undefined ? `Floor ${unit.floor}` : undefined}
            roomNote={windOn && room ? core.windSentence(windRooms.find((w) => w.roomId === room.id), unit.northDeg) : null}
            floors={stem ? PICKER(unit) : null}
            picked={picked}
            onWalkLevel={walkStem ? () => (walkStem === stem ? go('walk') : location.assign(`/u/${encodeURIComponent(walkStem)}${SHARED ? '?c=' : ''}`)) : null}
            onPickFloor={(k) => {
              setPicked(k)
              scene.showFloor(k)
            }}
            finishesOpen={finishesOpen}
            commenting={commenting}
            locked={locked}
            onEnterVR={xr ? toggleVR : null}
            toast={toast}
            onJump={(r) => {
              const v = roomView(r, shown()) // the arranged layout, deleted pieces out
              // a leaf that would fill the first frame is shut for it; the next jump, key or click opens it again
              scene.shutLeaf(v.closeLeaf ?? null)
              if (v.closeLeaf) for (const e of ['keydown', 'pointerdown']) addEventListener(e, () => scene.shutLeaf(null), { once: true })
              spawn(scene, v.p, v.face, v.pitch)
              setMode('walk')
            }}
            onMode={go}
            onToggleFinishes={() => setFinishesOpen((v) => !v)}
            onToggleComment={() => setCommenting((v) => !v)}
            onShare={share}
            arranging={arranging}
            hand={handInfo}
            staff={STAFF}
            osm={!!unit.site && unit.site.buildings.length + unit.site.roads.length > 0}
            onArrange={STAFF ? toggleArrange : null}
            editingOpenings={editingOpenings}
            onOpenings={STAFF && !TOKEN ? toggleOpenings : null}
            onEditPlan={
              STAFF
                ? () => {
                    const id = location.pathname.split('/')[2] // the route stem; `/u/preview` is already the Studio's draft
                    window.open(id === 'preview' ? '/studio' : `/studio?unit=${id}`, '_blank')
                  }
                : null
            }
          />
          {finishesOpen && (
            <aside className="glass panel" onKeyDown={(e) => e.stopPropagation()}>
              {TOKEN && (
                <label className="buyer-name">
                  <span className="label">Your name</span>
                  <input defaultValue={buyer().name} placeholder="So the developer knows who asked" maxLength={80} onChange={(e) => setBuyerName(e.target.value)} />
                </label>
              )}
              {/* Notes first: a just-saved note must be visible without scrolling past the finishes */}
              <NotesList
                pins={pins}
                rooms={rooms}
                onFocus={focusPin}
                onRemove={(p) => {
                  removePin(unit.id, p.id)
                  if (TOKEN) void sendEvent(TOKEN, 'comment', p.id, { removed: true })
                  setPins(readPins(unit.id))
                }}
              />
              <FinishesPanel
                slots={unit.finishSlots}
                cfg={cfg}
                keys={keys}
                surface={surface}
                onSelect={choose}
                onCloseSurface={() => setSurface(null)}
                onReset={() => {
                  for (const s of unit.finishSlots) choose(s.id, s.defaultOptionId)
                  for (const k of Object.keys(cfg)) if (keys.has(k)) choose(k, null)
                  setCfg({})
                }}
              />
            </aside>
          )}
          {editingOpenings && (
            <OpeningPanel
              opening={opF?.opening ?? null}
              wall={opWall}
              where={opF || opW ? rooms.filter((r) => r.wallIds.includes(opF?.wall.id ?? opW!.id)).map((r) => r.name).join(' ↔ ') || (opF ? 'On an outside wall' : 'Outside') : ''}
              refused={plan.current.dragBlocked}
              canUndo={plan.current.history.past.length > 0}
              onKind={(kind) => opF && planCommit({ type: 'update-opening', id: opF.opening.id, patch: { kind } })}
              onSize={(patch) => opF && planCommit({ type: 'update-opening', id: opF.opening.id, patch })}
              onWall={({ lengthM, heightM }) =>
                opW && planCommit(lengthM !== undefined ? { type: 'set-wall-length', id: opW.id, lengthM } : { type: 'set-wall-type', ids: [opW.id], wall: wallTypeOf(heightM!), heightM })
              }
              onDelete={() => {
                if (!opF && !opW) return
                setOpSel(null)
                planCommit({ type: 'delete', ids: [opF?.opening.id ?? opW!.id] })
              }}
              onUndo={() => planCommit({ type: 'undo' })}
            />
          )}
          {arranging && adding && <AddPanel onPick={startPlacing} />}
          {arranging && (
            <ArrangePanel
              piece={pieceOf(sel)}
              held={handInfo}
              adding={adding}
              canUndo={steps.current.past.length > 0}
              onTurn={() => (held.current ? showHeld(turnHeld(unit, rooms, steps.current.pieces, held.current)) : turn())}
              onDelete={remove}
              onUndo={() => {
                letGo()
                undo()
              }}
              onReset={() => {
                letGo()
                settle(pushStep(steps.current, base))
              }}
              onAdd={() => {
                letGo()
                setAdding((v) => !v)
              }}
            />
          )}
          <SunPill
            hour={hour}
            date={date}
            northDeg={unit.northDeg}
            onChange={(h) => {
              setHour(h)
              scene.setTimeOfDay(h)
            }}
            onDate={(d) => {
              setDate(d)
              scene.setTimeOfDay(hour, d)
            }}
            lights={lit}
            lightsAuto={lightsMode === 'auto'}
            onLights={flipLights}
            wind={windOn}
            onWind={() => setWindOn((v) => !v)}
            month={month}
            onMonth={pickMonth}
            windLine={core.monthLine(month, months, unit.site)}
            windNote={core.seasonNote(month, months, unit.site)}
            rose={roseOn}
            onRose={() =>
              setRoseOn((v) => {
                try {
                  localStorage.setItem(ROSE_KEY, v ? '0' : '1')
                } catch {
                  /* this browser keeps nothing: the rose stays as clicked for now */
                }
                return !v
              })
            }
          />
          {windOn && roseOn && (
            <WindRose
              months={months}
              month={month}
              northDeg={unit.northDeg}
              source={unit.site?.wind ? `Wind at this site: Open-Meteo, ${windYears(unit.site.fetchedAt)}` : 'Wind: the Dhaka table (Open-Meteo 2015–2024) — no site set in the Studio'}
              onMonth={pickMonth}
            />
          )}
          {windOn && mode === 'walk' && room && (
            <WindChips scene={scene} unit={unit} room={room} rw={windRooms.find((w) => w.roomId === room.id)} fromDeg={months[month].fromDeg} />
          )}
          <PinLayer scene={scene} pins={pins} draft={draft} onSave={savePin} onCancel={() => setDraft(null)} />
          <Minimap scene={scene} unit={unit} rooms={rooms} walking={mode === 'walk'} />
        </>
      )}
      {!inVR && !arranging && !editingOpenings && !no3d && (
        <QualityChip
          note={qNote}
          onPick={(q) => {
            write(local, KEYS.picked, q)
            write(tab, KEYS.fallback, null) // the person's pick, from now on
            restart(cfg)
          }}
        />
      )}
      {no3d && <NoThreeD unit={unit} />}
    </div>
  )
}
