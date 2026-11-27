/**
 * Buyer-facing viewer (PRODUCT_SPEC §3): routing, load screen, HUD, finishes,
 * sun, comment pins, share, VR. No router lib, no state lib.
 * Routes: `/` → replaceState `/u/<first unit>`; `/u/preview` ← localStorage
 * `plotline.preview`; `/u/:id` by Unit.id or the JSON's filename stem;
 * `/s/<token>` ← Supabase (a link the Studio's Share published).
 */
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import * as core from '../core'
import type { Configuration, FinishOption, FinishSlot, FurniturePlacement, Id, Opening, OpeningKind, Pt, RailColor, Room, Unit, Wall } from '../core'
import { coverOf, floorIn, levelName, projectUnit, roleIn, roofIn, saveRoof, stairOnFloor, stairsDown, stairTo, stemIn, streetOf, topFloor, towerOf, type Tower } from '../data/building'
import type { Roof } from '../data/building/roof'
import { buildingOf, keptAt, outsideRecord, placesIn, readFinishes } from '../data/building/apartments'
import { readProjects, sharedAt, slotsText } from '../data/building/projects'
import { arriveBy, isStair, isStairRoom } from '../furnish/stairs'
import { EDGES_SLOT, FRAMES_SLOT, OUTSIDE_SLOT, faceWallId, frameKey, outerRuns, outsideOf, roomKey, wallKey } from '../furnish/finishes'
import { placementLabel, placementSize } from '../furnish/kit'
import { onOwnChange, ownVersion, refreshOwnOptions, withOwnOptions } from '../furnish/own'
import { isGlazing } from '../furnish/presets'
import { deletePiece, layoutFor, movePiece, pieceQuad, refurnish, resizeAxes, resizePiece, surfaceOf, type Move } from '../studio/furniture'
import { buyer, flushOutbox, selectionPayload, sendEvent, setBuyerName } from '../lib/events'
import { learnCarried } from '../lib/library'
import { configured as sharingConfigured, fetchSharedUnit } from '../lib/supabase'
import { LinkOff, NoPreview, NotFound, Offline, Skeleton, Slate } from '../lib/pages'
import { pageTitle } from '../lib/route'
import { LOW_KINDS, RAIL_COLOR_WORDS, SPANDREL_AT_WORDS, SPANDREL_WORDS, WALL_TYPES, findOpening, initialState, isUnit, normalizeUnit, reducer, wallTypeOf, type Action, type StudioState } from '../studio/model'
import { preloadModels } from '../three/furniture'
import { PlotlineScene, type ArrangeEvent, type OpeningEvent, type PickHit, type SceneMode } from '../three/PlotlineScene'
import type { TowerHit } from '../three/building'
import { lightsOn, type LightsMode } from '../three/render'
import { TEST_UNIT } from '../three/testUnit'
import type { XRControls } from '../three/xr'
import { baseOf, deleteHeld, draftState, dropHeld, floorAnswer, forkHere, holdAt, isShareLink, isStaff, keepsFinishes, madeOfOnTower, makeDraft, outsideAnswer, outsideChanges, outsideOf as isOutsidePiece, outsideOnEveryFloor, pickUp, planOf, pushStep, saveFinishes, saveLayout, saveOpenings, setFloorAnswer, setOutsideAnswer, turnHeld, undoStep, wallDrag, type FloorAnswer, type Held, type Steps } from './arrange'
import FinishesPanel, { type Surface } from './FinishesPanel'
import Hud, { floorTitle, Grip, lowWallAt, StatsPanel, useFinger, type HandInfo } from './Hud'
import Minimap, { mapOf } from './Minimap'
import { NotesList, PinLayer, tagOf, type Draft } from './Notes'
import { arrivalFace, coreRooms, entrySpawn, listedRooms, roomView, stairView, yawFor } from './spawn'
import SunPill, { WindChips } from './SunPill'
import { drawingTitle, withDefaults } from './defaults'
import { chosen, KEYS, local, lower, NAME, probeDevice, QUALITIES, read, recommend, tab, write, type Quality } from './quality'
import { encodeConfig, finishKeys, keepConfig, keepOutside, shareUrl, stairUrl, startFinishes } from './share'
import { appendPin, readPins, removePin, type Pin } from './storage'
import { LibraryPanel } from '../studio/LibraryPanel'
import { copyPicture } from '../studio/pictures'
import './viewer.css'
import { ask, askChoice } from '../lib/ask'

const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
const UNITS = Object.entries(files).map(([path, unit]) => ({ stem: path.split('/').pop()!.replace(/\.json$/, ''), unit }))
if (!UNITS.length) UNITS.push({ stem: TEST_UNIT.id, unit: TEST_UNIT }) // dev only: no unit JSON on disk yet

const NO_3D = 'This browser or computer cannot draw 3D, so here is the plan. Try another browser, or open the link on a computer.'
const DEFAULT_HOUR = 15.5

/** the ten full years before the site was fetched (SitePanel asks for those) */
const windYears = (at?: string): string => (at ? `${Number(at.slice(0, 4)) - 10}–${Number(at.slice(0, 4)) - 1}` : 'ten years')
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
/** Arrange is staff only (arrange.ts): `?staff=1` is remembered, then dropped from the address bar so a copied URL doesn't carry it. Never on `/s/`. */
const STAFF = isStaff(location.search, location.pathname)
/** a published link's token (`/s/<token>`): the unit comes from Supabase */
const TOKEN = location.pathname.match(/^\/s\/([^/]+)/)?.[1]
/** a buyer's link: no way into staff mode from it (no "Staff mode" / Studio link) */
const SHARED = isShareLink(location.search) || !!TOKEN
/** staff on the flat's own page: what they pick in Finishes is kept for this apartment (arrange.ts keepsFinishes) */
const KEEP = keepsFinishes(STAFF, location.search, location.pathname)
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
/** A new tier takes a fresh page (antialias is fixed when the 3D starts); a buyer's finishes ride along in the address (staff's are kept for the apartment). */
const restart = (cfg: Configuration): void => {
  const q = new URLSearchParams(location.search)
  q.delete('quality')
  if (!KEEP && Object.keys(cfg).length) q.set('c', encodeConfig(cfg))
  location.replace(`${location.pathname}${q.size ? `?${q}` : ''}`)
}
/** this floor was just given its own drawing (arrange.ts forkHere): said once on entering */
const OWN = params.get('own') === '1'
if (params.has('staff') || OWN) {
  params.delete('staff')
  params.delete('own')
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
 * The floor the unit stands on in its tower, by the scene's own rule (floorIn): a Studio preview with no floor typed stands
 * on its drawing's first floor there, as the Building view draws it; a unit in no tower: its own floor, else 0.
 */
const floorOf = (u: Unit): number => {
  const t = towerOf(u)
  const s = t && stemIn(t, u)
  return t && s ? floorIn(t, s, u.floor) : (u.floor ?? 0)
}
/**
 * Floor `n` (`?floor=N`: a flat picked in the Building view, or reached by a stair) puts the flat on floor N if the tower has it there; the JSON
 * keeps its own (no `?floor=` is no floor: never the ground, where a flat with no columns stands in as the tower's base). A level (ground,
 * basement, rooftop) stands on its tower's floor for it.
 */
function onFloor(u: Unit | null, n = params.has('floor') ? Number(params.get('floor')) : NaN): Unit | null {
  const t = u && towerOf(u)
  const stem = t && stemIn(t, u)
  if (!u || !t || !stem) return u
  const level = t.LEVELS?.[stem]
  if (level !== undefined) return { ...u, floor: level }
  return t.FLOORS.some((f) => f.floor === n && (f.flats.includes(stem) || f.standIns?.includes(stem))) ? { ...u, floor: n } : u // a stand-in too: the stair to it (takeStair)
}
/** the Studio's Preview 3D: without `?floor=` it is the drawing the Studio has open (its own furniture and finishes), not a floor of it */
const PREVIEW_DRAWING = location.pathname === '/u/preview' && !params.has('floor')
/** A trip to floor `floor` of the tower (ViewerApp travel): its unit, the stair point he arrives by (none: its entry), the view it opens in. */
/** `door`: arrive at the door of the stair room at `at`, looking at the flight (the Rooms list's core group: spawn stairView) */
type Trip = { stem: string; floor: number; at?: Pt; view: SceneMode; door?: boolean }
/** A unit as the viewer shows it: the apartment it is (data/building/apartments.ts), with what it keeps. */
interface Shown {
  unit: Unit
  /** its layout to fall back to (Reset layout): the drawing's own (the Studio's tool F) or its JSON's, presets for rooms without pieces */
  base: FurniturePlacement[]
  /** the apartment's key, under which this browser keeps its furniture and finishes; null on a published link (the link is the snapshot) */
  key: string | null
  /** what it opens with: its record, else the drawing's (`baseFinishes`); a published link's own */
  finishes: Configuration
  baseFinishes: Configuration
  /** its building's outside (furnish/finishes.ts outsideOf): as this browser keeps it (apartments.ts outsideRecord), a published link's own */
  outside: Configuration
}
/**
 * A unit as the viewer shows it (the page's, or a floor reached by the stair): on its floor, what a Studio draft / auto-trace
 * / its share link lacks filled in (finishes, area, name: defaults.ts), as its apartment keeps it — the furniture and
 * finishes staff left there (Edit furniture, Finishes), else the drawing's own (the Studio's tool F, Preview 3D), else its
 * JSON's / the presets, all through layoutFor (a room added since gets its presets). A published link (`carried`: the
 * finishes it was made with) never reads this browser's records.
 */
function prepare(raw: Unit | null, floor?: number, carried?: { finishes?: unknown; outside?: unknown }): Shown | null {
  const u = onFloor(raw, floor)
  if (!u) return null
  const rooms = core.deriveRooms(u)
  const k = TOKEN ? null : keptAt(u, PREVIEW_DRAWING && floor === undefined ? undefined : u.floor, towerOf(u))
  const base = layoutFor(k?.base ? { ...u, furniture: k.base } : u, rooms)
  const unit = { ...withDefaults(u, rooms), furniture: k?.layout ? layoutFor({ ...u, furniture: k.layout }, rooms) : base }
  const keys = finishKeys(unit, rooms)
  const kept = (c: unknown) => keepConfig(c, unit.finishSlots, keys) // only what this plan offers
  const outside = k ? (readFinishes(outsideRecord(buildingOf(towerOf(u), u.id))) ?? {}) : keepOutside(carried?.outside)
  return { unit, base, key: k?.key ?? null, finishes: kept(k ? k.finishes : carried?.finishes), baseFinishes: kept(k?.baseFinishes), outside }
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
    // an old `/?c=…` link (before the front page existed): the demo flat, never the first file on disk (a basement)
    const first = UNITS.find((u) => u.stem === 'type-a') ?? UNITS[0]
    history.replaceState(null, '', `/u/${first.stem}${location.search}`)
    return first.unit
  }
  const id = decodeURIComponent(m[1])
  if (id === 'preview') {
    try {
      return asUnit(JSON.parse(localStorage.getItem('plotline.preview') ?? 'null')) // a stale/garbage preview must not crash deriveRooms
    } catch {
      return null
    }
  }
  // a built-in by its own address (/u/type-a); else a flat of a building made in the Studio (this browser) — before a built-in
  // of the same id: a project drawing opened from a built-in (Edit → Plan (Studio)) keeps its id, and its floor's page must
  // show the project's copy as edited (a Made of on the tower, a wall moved), not the file (phoneqa: Edit openings refused)
  return UNITS.find((u) => u.stem === id)?.unit ?? projectUnit(id) ?? UNITS.find((u) => u.unit.id === id)?.unit ?? null
}

const spawn = (scene: PlotlineScene, p: Pt, face: Pt, pitch = 0, hfov?: number): void => scene.spawnAt(p, yawFor(face), pitch, hfov)
/** Plan-space eye position (rig + camera): the walker in walk mode, the orbit camera in dollhouse. */
const eyeOf = (scene: PlotlineScene): Pt => scene.viewEye()
const headingOf = (scene: PlotlineScene): Pt => scene.viewHeading()

export default function ViewerApp() {
  // a published link: undefined while it loads, null when the database has no such link (or it is off), 'offline' when
  // the database could not be asked (no network, not set up) — each gets its own page
  const [fetched, setFetched] = useState<Unit | null | undefined | 'offline'>(TOKEN ? undefined : null)
  /** the finishes the link was made with (the Studio's Share link: the drawing's as Preview 3D showed them) */
  const carried = useRef<{ finishes?: unknown; outside?: unknown } | undefined>(undefined)
  useEffect(() => {
    if (TOKEN)
      fetchSharedUnit(TOKEN)
        .then(async (raw) => {
          const r = raw as { library?: unknown; finishes?: unknown; outside?: unknown } | null
          await learnCarried(r?.library) // its own pieces and finishes first
          carried.current = { finishes: r?.finishes, outside: r?.outside }
          return asUnit(raw)
        })
        .catch((e) => (console.warn('[plotline] share link', e), 'offline' as const))
        .then(setFetched)
  }, [])
  const shown = useMemo(() => prepare(TOKEN ? (fetched === 'offline' ? null : (fetched ?? null)) : resolveUnit(), undefined, carried.current), [fetched])
  const unit = shown?.unit ?? null
  useEffect(() => {
    document.title = unit ? pageTitle(unit.name) : fetched === undefined || fetched === 'offline' ? pageTitle() : pageTitle('Not found')
  }, [unit, fetched])
  if (TOKEN && fetched === undefined) return <Skeleton kind="viewer" />
  if (fetched === 'offline') return <Offline />
  if (!unit) return TOKEN ? <LinkOff /> : location.pathname === '/u/preview' ? <NoPreview /> : <NotFound what="flat" />
  if (!DEVICE.webgl2)
    return (
      <div className="viewer">
        <NoThreeD unit={unit} />
      </div>
    )
  return <Viewer first={shown!} />
}

const dims = (s: { x: number; y: number; z: number }) => `${s.x.toFixed(2)} × ${s.z.toFixed(2)} m, ${s.y.toFixed(2)} m high`

/**
 * No 3D here (no WebGL 2, the 3D could not start, or the graphics gave up): a page with the flat's name, what to do, and
 * its plan. The `no3d` wrapper keeps it on screen in Clean view (viewer.css).
 */
function NoThreeD({ unit }: { unit: Unit }) {
  const rooms = useMemo(() => core.deriveRooms(unit), [unit])
  const map = useMemo(() => mapOf(unit, rooms), [unit, rooms])
  // a room's name as large as fits across it (ponytail: a letter ≈ 0.55 of the size); smaller than ~11 px on a desktop → left off
  const names = useMemo(
    () =>
      rooms.flatMap((r) => {
        const xs = core.roomPolygon(r, unit).map((p) => p.x)
        const size = Math.min(0.32, (0.8 * (Math.max(...xs) - Math.min(...xs))) / (r.name.length * 0.55))
        return size >= 0.26 ? [{ r, size }] : []
      }),
    [rooms, unit],
  )
  const { x, y, w, h } = map.box
  return (
    <div className="no3d">
      <Slate
        eyebrow="No 3D on this device"
        title={unit.name}
        line={NO_3D}
        figure={
          <div className="minimap">
            <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={`The plan of ${unit.name}`}>
              {map.rooms.map((r) => (
                <polygon key={r.id} className={r.zone ? `room zone z-${r.zone}` : 'room'} points={r.points} />
              ))}
              {map.walls.map((s, i) => (
                <path key={i} className={s.low ? `wall ${s.low}` : 'wall'} d={s.d} strokeWidth={s.w} />
              ))}
              {names.map(({ r, size }) => (
                <text key={r.id} x={r.centroid.x} y={r.centroid.y + size / 3} fontSize={size} textAnchor="middle">
                  {r.name}
                </text>
              ))}
            </svg>
          </div>
        }
      >
        <button className="btn primary" onClick={() => location.reload()}>
          Try again
        </button>
      </Slate>
    </div>
  )
}

/** Quality (quality.ts, everyone) in one line: why this tier — the start screen's quality line and the HUD's ⋯ menu say it */
const QUALITY_WHY =
  TIER.by === 'link' ? 'Set by this link.' : TIER.by === 'fallback' ? 'Lite since the 3D failed on this device.' : REC.why ? `Recommended for this device: ${REC.why}.` : 'This device can show the full look.'

/**
 * The start screen's quality line (session 31: in place of the first-visit toast): the tier and why — or the note an
 * automatic switch left — and Change, which opens Lite · Low · High right there (a pick reloads the page, as in ⋯).
 */
function QualityLine({ onPick }: { onPick: (q: Quality) => void }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <div className="load-q" title={DEVICE.gpu && `Graphics: ${DEVICE.gpu}`}>
        {NAME[TIER.tier]} quality · {SWITCHED ?? QUALITY_WHY}{' '}
        <button className="link" onClick={() => setOpen(true)}>
          Change
        </button>
      </div>
    )
  return (
    <div className="load-q open">
      <div className="seg" role="group" aria-label="Quality">
        {QUALITIES.map((q) => (
          <button key={q} className={q === TIER.tier ? 'on' : ''} aria-pressed={q === TIER.tier} onClick={() => (q === TIER.tier ? setOpen(false) : onPick(q))}>
            {NAME[q]}
            {q === REC.tier && <span className="rec" title="Recommended for this device" />}
          </button>
        ))}
      </div>
      <span className="muted small">The dot: recommended here. Lite is lightest on the computer; a new choice reloads the page.</span>
    </div>
  )
}

/** One shared field (share links): the buyer's name, on the change list beside every note and finish choice */
const BuyerName = () => (
  <label className="buyer-name">
    <span className="label">Your name</span>
    <input defaultValue={buyer().name} placeholder="So the developer knows who asked" maxLength={80} onChange={(e) => setBuyerName(e.target.value)} />
  </label>
)

/**
 * The staff library (studio/LibraryPanel.tsx, the Studio's too): search, pieces by room and kind; pick one, then point
 * where it goes. A phone: a bottom sheet (its grip or × closes it), and the search box waits for a tap — typing into it at
 * once would raise the on-screen keyboard over the list.
 */
function AddPanel({ onPick, onEsc, onNote }: { onPick: (assetId: string) => void; onEsc: () => void; onNote: (text: string) => void }) {
  const finger = useFinger()
  return (
    <aside className="glass library" aria-label="Library">
      <Grip onClose={onEsc} />
      <header className="panel-head">
        <span className="label">Library</span>
        <button className="x" aria-label="Close the library" title="Close (Esc)" onClick={onEsc}>
          ×
        </button>
      </header>
      <LibraryPanel onPick={onPick} focus={!finger} onEsc={onEsc} onNote={(t) => onNote(`${t} ${finger ? 'Tap' : 'Click'} where it goes.`)} />
    </aside>
  )
}

/**
 * Arrange (staff): the selected piece, what it allows, turn / delete / undo / reset; Add opens the library; a piece in hand:
 * what and why not. A phone (viewer.css, qa3 P15: the panel and the bar hid the lower 42 % of the room, where the furniture
 * is): one row — the piece and Done (in hand: why not, and Cancel), or "Tap a piece" and Add — the rest behind the grip.
 */
function ArrangePanel(p: {
  /** where the layout is kept, in words */
  kept: string | null
  piece: FurniturePlacement | null
  held: HandInfo | null
  adding: boolean
  canUndo: boolean
  onTurn: () => void
  onDelete: () => void
  onUndo: () => void
  onReset: () => void
  onAdd: () => void
  /** the piece picked: let go of it; the piece in hand: back where it was */
  onDone: () => void
}) {
  const s = p.piece && placementSize(p.piece)
  const finger = useFinger() // a finger has no R or Esc: the words say what it can do
  const [open, setOpen] = useState(false)
  const head = p.held ? (p.held.error ?? `${p.held.adding ? 'Placing' : 'Moving'}: ${p.held.label}`) : p.piece ? placementLabel(p.piece) : `${finger ? 'Tap' : 'Click'} a piece to move it`
  return (
    <aside className={`glass arrange${open ? ' open' : ''}`}>
      <button className="arrange-grip" aria-expanded={open} aria-label={open ? 'Fewer buttons' : 'More buttons: turn, delete, undo, reset'} onClick={() => setOpen(!open)} />
      <div className="arrange-head">
        <span className={`arrange-what${p.held?.error ? ' refused' : ''}`}>{head}</span>
        {p.held || p.piece ? (
          <button className="btn" onClick={p.onDone}>
            {p.held ? 'Cancel' : 'Done'}
          </button>
        ) : (
          <button className={`btn${p.adding ? ' active' : ''}`} onClick={p.onAdd}>
            Add
          </button>
        )}
      </div>
      <div className="arrange-body">
        {p.held ? (
          <>
            <div className="arrange-name">
              {p.held.adding ? 'Placing' : 'Moving'}: {p.held.label}
            </div>
            <div className={`small ${p.held.error ? 'refused' : 'muted'}`}>
              {p.held.error ?? (finger ? 'Tap the floor, a wall or the ceiling where it goes' : p.held.ready ? `Click to put it here · R turns · Esc ${p.held.adding ? 'cancels' : 'puts it back'}` : 'Point at the floor, a wall or the ceiling')}
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
          <div className="muted small">{finger ? 'Tap' : 'Click'} a piece, then drag it. The TV, art and AC slide along the walls and up and down them, curtains along their opening's wall, lights and fans on the ceiling. Add puts a new one in.</div>
        )}
        <div className="arrange-row">
          <button className={`btn arrange-add${p.adding ? ' active' : ''}`} title="Add a piece from the library" onClick={p.onAdd}>
            Add
          </button>
          <button className="btn" disabled={!p.piece && !p.held} onClick={p.onTurn}>
            {finger ? 'Turn 90°' : 'Turn 90° (R)'}
          </button>
          <button className="btn" disabled={!p.piece && !p.held} title="Delete this piece (and what rests on it) — also the one in your hand (Del)" onClick={p.onDelete}>
            Delete
          </button>
          <button className="btn" disabled={!p.canUndo} onClick={p.onUndo}>
            Undo
          </button>
          <button className="btn" title="Back to the drawing’s own layout, as the Studio arranged it (undo brings yours back)" onClick={p.onReset}>
            Reset layout
          </button>
        </div>
        {p.kept && <div className="muted small">{p.kept}</div>}
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

type LowPatch = { kind?: (typeof LOW_KINDS)[number][0]; cornice?: boolean; color?: RailColor }
/** A low wall's Made of (model LOW_KINDS), a solid one's Cornice, a railing's Colour: Edit openings' card and the Building view's balcony edge */
function MadeOf({ w, onLowKind }: { w: Wall; onLowKind: (patch: LowPatch) => void }) {
  const rail = core.railOf(w)
  return (
    <div className="arrange-row made-of">
      <label className="ftin">
        Made of
        <select value={w.lowKind ?? 'solid'} onChange={(e) => onLowKind({ kind: e.target.value as (typeof LOW_KINDS)[number][0] })}>
          {LOW_KINDS.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {!w.lowKind && (
        <label className="ftin-check" title="A stepped band under the wall's cap, as on a classical parapet">
          <input type="checkbox" checked={!!w.cornice} onChange={(e) => onLowKind({ cornice: e.target.checked })} /> Cornice
        </label>
      )}
      {rail && core.railColors(rail).length > 0 && (
        <label className="ftin">
          Colour
          <select value={core.railColorOf(w) ?? ''} onChange={(e) => onLowKind({ color: e.target.value as RailColor })}>
            {core.railColors(rail).map((c) => (
              <option key={c} value={c}>
                {RAIL_COLOR_WORDS[c]}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
/** what a low wall is, in words: "Glass balustrade · 8'-1" long · 3'-7" high" */
const lowName = (w: Wall, lengthM: number): string => {
  const rail = core.railOf(w)
  return `${rail ? LOW_KINDS.find(([k]) => k === rail)![1] : WALL_TYPES[wallTypeOf(w.heightM)].label} · ${core.formatFeetInches(lengthM)} long · ${core.formatFeetInches(w.heightM)} high`
}

/**
 * The Building view's balcony edge (staff, qa4fix): a click on a project flat's railing, glass front or parapet on the tower —
 * what it is, its Made of, "This floor only" when its drawing stands on other floors too (else every floor with it), Done.
 */
function MadeOfCard(p: { w: Wall; lengthM: number; where: string; floors: number; k: number; one: boolean; onOne: (one: boolean) => void; onLowKind: (patch: LowPatch) => void; onDone: () => void }) {
  return (
    <aside className="glass arrange" aria-label="What this balcony edge is made of">
      <div className="arrange-name">{lowName(p.w, p.lengthM)}</div>
      <div className="small muted">{p.where}</div>
      <MadeOf w={p.w} onLowKind={p.onLowKind} />
      {p.floors > 1 && (
        <label className="ftin-check">
          <input type="checkbox" checked={p.one} onChange={(e) => p.onOne(e.target.checked)} /> This floor only
        </label>
      )}
      <div className="muted small">{p.floors > 1 && !p.one ? `Changes it on all ${p.floors} floors with this drawing.` : p.floors > 1 ? `Floor ${p.k} gets its own copy of the drawing.` : 'Saved into the drawing — the floor plan shows it too.'}</div>
      <div className="arrange-row">
        <button className="btn" onClick={p.onDone}>
          Done
        </button>
      </div>
    </aside>
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
  onSize: (patch: Partial<Pick<Opening, 'widthM' | 'heightM' | 'sillM' | 'spandrelM' | 'spandrel' | 'spandrelAt'>>) => void
  onWall: (patch: { lengthM?: number; heightM?: number }) => void
  /** what the low wall is made of (model LOW_KINDS), a solid one's cornice */
  onLowKind: (patch: LowPatch) => void
  onDelete: () => void
  onUndo: () => void
  /** a window, slider or glass wall (staff on the flat's own page): its frame's colour — the building's, or its own */
  frame?: { options: FinishOption[]; own: string | null; building: string; onPick: (id: string | null) => void }
}) {
  const o = p.opening
  const lw = p.wall
  const finger = useFinger()
  return (
    <aside className="glass arrange">
      {lw ? (
        <>
          <div className="arrange-name">{lowName(lw.w, lw.lengthM)}</div>
          <div className="small muted">{p.where}</div>
          <div className="arrange-row">
            <FtIn label="Length" m={lw.lengthM} onSet={(lengthM) => p.onWall({ lengthM })} />
            <FtIn label="Height" m={lw.w.heightM} onSet={(heightM) => p.onWall({ heightM })} />
          </div>
          {core.takesLowKind(lw.w) && <MadeOf w={lw.w} onLowKind={p.onLowKind} />}
        </>
      ) : o ? (
        <>
          <div className="arrange-name">
            {KINDS.find(([k]) => k === o.kind)?.[1]} · {core.formatFeetInches(o.widthM)} wide
          </div>
          <div className={`small ${p.refused ? 'refused' : 'muted'}`}>{p.refused ? 'Not there: another opening is in the way' : p.where}</div>
          <div className="seg seg-fill" role="group" aria-label="Kind">
            {KINDS.map(([k, label]) => (
              <button key={k} className={o.kind === k ? 'on' : ''} aria-pressed={o.kind === k} onClick={() => k !== o.kind && p.onKind(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="arrange-row">
            <FtIn label="Width" m={o.widthM} onSet={(widthM) => p.onSize({ widthM })} />
            <FtIn label="Height" m={o.heightM} onSet={(heightM) => p.onSize({ heightM })} />
            <FtIn label="Sill" m={o.sillM} onSet={(sillM) => p.onSize({ sillM })} />
          </div>
          {isGlazing(o) && (
            <div className="arrange-row">
              <FtIn label="Solid band" m={o.spandrelM ?? 0} onSet={(m) => p.onSize({ spandrelM: m > 0.01 ? m : undefined })} />
              {(o.spandrelM ?? 0) > 0 && (
                <label className="ftin">
                  Band at
                  <select value={o.spandrelAt ?? 'foot'} onChange={(e) => p.onSize({ spandrelAt: e.target.value === 'foot' ? undefined : (e.target.value as 'head' | 'both') })}>
                    {SPANDREL_AT_WORDS.map(([k, w]) => (
                      <option key={k} value={k}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(o.spandrelM ?? 0) > 0 && (
                <label className="ftin">
                  Band of
                  <select value={o.spandrel ?? 'dark'} onChange={(e) => p.onSize({ spandrel: e.target.value as NonNullable<Opening['spandrel']> })}>
                    {SPANDREL_WORDS.map(([k, w]) => (
                      <option key={k} value={k}>
                        {w}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
          {p.frame && (
            <label className="ftin">
              Frame
              <select value={p.frame.own ?? ''} onChange={(e) => p.frame!.onPick(e.target.value || null)}>
                <option value="">Same as the building ({p.frame.options.find((x) => x.id === p.frame!.building)?.label})</option>
                {p.frame.options.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <div className="muted small">
          {finger ? 'Tap' : 'Click'} a door, window, slider or passage. Drag it along its wall; drag a dot to resize it — the side dots for width, the top dot for height, a window's bottom dot for its sill. Or {finger ? 'tap' : 'click'} a low wall (railing, planter edge, kerb): drag an end dot to make it longer or shorter, drag the wall to move it across.
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

function Viewer({ first }: { first: Shown }) {
  // the unit on show and its apartment (prepare): the page's, then each floor the stair reaches (takeStair) — one 3D for all
  const [{ unit: given, base, key: apt, baseFinishes }, setFloorUnit] = useState(first)
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
  /** the 3D can show its first frame with nothing left to make (PlotlineScene.drawable) */
  const [drawable, setDrawable] = useState(false)
  const [entered, setEntered] = useState(false)
  /** a finger in use: no "press Enter", "tap" for "click" (Hud useFinger) */
  const finger = useFinger()
  const [mode, setMode] = useState<SceneMode>('walk')
  const [hour, setHour] = useState(DEFAULT_HOUR)
  /** the sun's day (the scene starts on today too) and the wind: its month's rose and arrows, on or off */
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [windOn, setWindOn] = useState(false)
  /** Sun & wind (bottom centre): the card open, or just its pill; the wind keeps blowing either way */
  const [simOpen, setSimOpen] = useState(false)
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
  // the address's choice when it has one, else what the apartment kept (staff's last picks) or the link was made with
  const [cfg, setCfg] = useState<Configuration>(() => startFinishes(location.search, first.finishes, unit.finishSlots, keys))
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  // staff on the flat's own page: every pick is kept for this apartment at once (a buyer's never: they go to the change list)
  useEffect(() => {
    if (KEEP && apt) saveFinishes(apt, cfg, baseFinishes)
  }, [cfg]) // eslint-disable-line react-hooks/exhaustive-deps
  // the building's outside (staff: Finishes → the outside card, Edit openings → a window's frame): one record for the whole
  // building, kept the moment it changes; a buyer's link shows the one it was made with
  const [outside, setOutsideRec] = useState<Configuration>(first.outside)
  const outKey = KEEP ? outsideRecord(buildingOf(towerOf(given), given.id)) : null
  useEffect(() => {
    if (outKey) saveFinishes(outKey, outside)
  }, [outside]) // eslint-disable-line react-hooks/exhaustive-deps
  /** a choice for the outside: the building's slot id, one floor's or one wall's key, one window's frame; null: back to what it falls back to */
  const chooseOutside = (key: string, optionId: Id | null) =>
    setOutsideRec((c) => {
      const next = { ...c }
      if (optionId) next[key] = optionId
      else delete next[key]
      return next
    })
  /** the floor / wall / ceiling clicked while the Finishes panel is open */
  const [surface, setSurface] = useState<Surface | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [finishesOpen, setFinishesOpen] = useState(false)
  // the outer wall the outside card is open on: outlined on the tower, every floor it dresses ("This wall"), until the card closes (qa4fix)
  const stackOn = mode === 'building' && finishesOpen && surface?.outside?.drawing && surface.outside.run ? `${surface.outside.drawing}|${surface.outside.run}` : null
  useEffect(() => {
    const [drawing, run] = stackOn?.split('|') ?? []
    scene?.showWallStack(stackOn ? { drawing, run } : null)
  }, [scene, stackOn])
  const [commenting, setCommenting] = useState(false)
  /** the stats card (`?stats=1`, ⋯ → How fast is it here?): never on a buyer's link */
  const [statsOpen, setStatsOpen] = useState(() => !SHARED && params.get('stats') === '1')
  const [locked, setLocked] = useState(false)
  const [xr, setXr] = useState<XRControls | null>(null)
  const [inVR, setInVR] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pins, setPins] = useState<Pin[]>(() => readPins(unit.id))
  const [draft, setDraft] = useState<(Draft & { hit: PickHit }) | null>(null)
  const [picked, setPicked] = useState(() => floorOf(unit))
  /** Building view: what the mouse is over on the tower (the card beside it), and the floor list's row under the mouse */
  const [towerHover, setTowerHover] = useState<(TowerHit & { x: number; y: number }) | null>(null)
  const [railHover, setRailHover] = useState<number | null>(null)
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
  /**
   * The building's roof (staff; session 31 roof lane) of a tower that draws its own (not the architect's shape): its floor, the
   * roof as drawn now (read again after each change) and whether the Finishes panel's roof block is open
   */
  const roofK = tower && !unit.shell ? topFloor(tower) + 1 : null
  const [roofV, bumpRoof] = useReducer((n: number) => n + 1, 0)
  const roofNow = useMemo(() => (tower ? roofIn(tower) : undefined), [tower, roofV]) // eslint-disable-line react-hooks/exhaustive-deps
  const [roofOpen, setRoofOpen] = useState(false)
  const commentingRef = useRef(commenting)
  commentingRef.current = commenting
  const finishesRef = useRef(finishesOpen)
  finishesRef.current = finishesOpen
  const modeRef = useRef(mode)
  modeRef.current = mode
  // the staff's own finishes (furnish/own.ts): one added or changed while the 3D runs joins its slot in place — the scene
  // holds these very slots, so the panel, the materials and a buyer's choice all have it without building the flat again
  const ownV = useSyncExternalStore(onOwnChange, ownVersion)
  useMemo(() => refreshOwnOptions(unit.finishSlots), [unit.finishSlots, ownV])
  /** the outside's two slots (what the walls are clad in, the window frames) with the staff's own options in them */
  const outSlots = useMemo(() => withOwnOptions([OUTSIDE_SLOT, FRAMES_SLOT, EDGES_SLOT]), [ownV]) // eslint-disable-line react-hooks/exhaustive-deps
  // the outside into the 3D: before the unit (setUnit builds the tower with it), then each change (the tower built again)
  useEffect(() => scene?.setOutside(outsideOf(outside, outSlots)), [scene, outside, outSlots])
  /** the floor the walked flat stands on in its tower (the outside card's "This floor", the floor list's own row, a trip's start) */
  const myFloor = floorOf(unit)
  /** an outside spot clicked (a wall of drawing `drawing`, its run, on floor k; a ground block: no wall) and its name for a person */
  const outSpot = (k: number | undefined, wall?: { drawing: Id; run: Id }, what?: string): NonNullable<Surface['outside']> => ({
    ...wall,
    floor: k,
    name: [k === undefined ? null : tower && k > 0 && k <= topFloor(tower) ? `Floor ${k}` : tower ? levelName(tower, k) : `Floor ${k}`, what ? `${what} wall` : wall ? 'Outside wall' : null].filter(Boolean).join(' · '),
  })
  /** every slot resolved (selection or its default), plus the one-room / one-wall choices — what the engine and the share link get */
  const fullCfg = useMemo<Configuration>(
    () => ({ ...Object.fromEntries(unit.finishSlots.map((s) => [s.id, s.defaultOptionId])), ...cfg }),
    [unit.finishSlots, cfg],
  )

  /** where the unit being built puts the walker and the view it opens in (travel: at its stair, or at its entry), read once by the unit effect */
  const arrival = useRef<{ at: Pt; face: Pt; view: SceneMode } | null>(null)
  // engine: made once for the page — the renderer, the sky, the sun and the quality stay for every unit it is given
  useEffect(() => {
    let s: PlotlineScene
    try {
      s = new PlotlineScene(canvasRef.current!, { quality: TIER.tier })
    } catch (e) {
      console.warn('[plotline] the 3D could not start', e)
      setNo3d(true)
      return
    }
    // frames too slow: down one tier once — only while the device chose (a pick is never overridden); Lite: a smaller picture
    s.onSlow(() => {
      if (TIER.tier === 'lite') {
        s.lighter()
        setQNote('Smaller picture: frames were still slow on this device.')
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
    s.setLightsMode(lightsSaved())
    s.setTimeOfDay(DEFAULT_HOUR)
    // opened straight into the Building view or the Dollhouse: the 3D gets ready under the start screen as that view, its own
    // programs made before it shows (PlotlineScene.prepare)
    const view = params.get('view')
    if (view === 'building' && stem) s.setMode('building')
    else if (view === 'building' || view === 'dollhouse') s.setMode('orbit')
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
  }, [])
  // the unit into the engine: the page's, then each floor a trip reaches (travel), standing where it arrives (an opening
  // edit rebuilds in place instead: commitPlan)
  useEffect(() => {
    if (!scene) return
    scene.cover = tower && stem ? coverOf(tower, stem, given.floor ?? floorIn(tower, stem)) : [] // the slab of the floors above it (a level, a flat in its tower)
    scene.street = tower && stem ? streetOf(tower, stem) : null // the made-up street round the whole tower, as the Building view's
    scene.down = tower && stem ? stairsDown(tower, stem, given.floor ?? floorIn(tower, stem), given.furniture.filter(isStair)) : [] // the hole and the flight below
    const a = arrival.current
    arrival.current = null
    const arrived = () => {
      if (!going.current) return
      going.current = null // "Floor 3 …" and the room's name he left stood there until now: the floor is ready, its first frame comes next
      if (a && a.view !== modeRef.current) setMode(a.view) // (the scene is in it already: arrive)
      setPicked(floorOf(given))
      redraw()
    }
    // a floor a trip reaches: made ready while the one he leaves stays on screen (no freeze), then shown in one frame
    if (a) void scene.arrive(given, a.at, yawFor(a.face), a.view).then(arrived)
    else {
      scene.setUnit(given)
      // under the start screen, walking in: the 3D gets ready looking where Enter will put him (the first frame then sends
      // nothing new: what that view sees is what was drawn behind the screen — PlotlineScene.prepare)
      const e = !entered && !params.has('view') && !params.has('edit') && entrySpawn(shown(), rooms, innerWidth < innerHeight)
      if (e) spawn(scene, e.p, e.face)
      arrived()
    }
  }, [scene, given]) // eslint-disable-line react-hooks/exhaustive-deps
  // a click in the 3D, with this render's plan (a floor reached by the stair has its own rooms)
  const stairRoomAt = (p: { x: number; z: number }) => {
    const r = core.roomAt({ x: p.x, y: p.z }, rooms, unit)
    return r && isStairRoom(r) && r.kind !== 'lobby' ? r : null
  }
  useEffect(() => {
    if (!scene) return
    const s = scene
    s.onPick((hit) => {
      if (!hit) return
      // the Finishes panel open: a floor / wall / ceiling picks that room's (that wall's) finish — in the dollhouse instead of dropping in
      const r = finishesRef.current && hit.kind !== 'opening' && hit.kind !== 'furniture' ? rooms.find((x) => x.id === hit.roomId) : undefined
      const room = r && roomKey(r.id, hit.kind as FinishSlot['target'])
      const face = r && hit.kind === 'wall' ? wallKey(faceWallId(unit, r, hit.id), r.id) : undefined // a column: none, its room's walls
      // staff: a wall's side outside (toward no room, a balcony, an outdoor zone) also opens the building's outside card
      const out =
        finishesRef.current && KEEP && hit.kind === 'wall' && (!r || r.kind === 'balcony' || core.isOutdoor(r.kind)) && unit.walls.some((w) => w.id === hit.id)
          ? outSpot(myFloor, { drawing: unit.id, run: outerRuns(unit).get(hit.id) ?? hit.id }, r?.name)
          : undefined
      // a pin or a finish uses the click: the walker stays where he is (a floor tap under a finger must not walk onto the pin)
      if (commentingRef.current) {
        const roomId = hit.roomId ?? core.roomAt({ x: hit.point.x, y: hit.point.z }, rooms, unit)?.id
        setDraft({ hit: { ...hit, roomId }, point: hit.point, label: tagOf(hit.label, rooms.find((r) => r.id === roomId)?.name) })
        return true
      } else if ((room && keys.has(room)) || out) {
        setSurface({ ...(room && keys.has(room) ? { roomKey: room, wallKey: face && keys.has(face) ? face : undefined } : {}), ...(out ? { outside: out } : {}) })
        setRoofOpen(false)
        return true
      } else if (modeRef.current === 'orbit' && (hit.kind === 'floor' || hit.kind === 'furniture') && stairRoomAt(hit.under ?? hit.point)) {
        // a stair room — its floor, or the stair itself (its well leaves little floor to click): at its door, looking at the flight
        jump(stairRoomAt(hit.under ?? hit.point)!)
      } else if (modeRef.current === 'orbit' && (hit.kind === 'floor' || hit.under)) {
        // dollhouse → click a room floor drops back into walk mode there, keeping the orbit heading (§3.2); a bed or a rug:
        // the floor the click reaches behind it
        const at = hit.kind === 'floor' ? hit.point : hit.under!
        s.spawnAt({ x: at.x, y: at.z }, yawFor(headingOf(s)))
        setMode('walk')
      }
    })
    // Building view: a click on this flat opens its dollhouse, on another flat brings that one in on its floor (travel: the
    // tower stays on screen meanwhile, no new page); on a level it walks it; on a floor of massing (or the roof) it picks
    // that floor, as the floor list does
    s.onFlat((h) => {
      const f = h?.flat
      if (!h || going.current) return
      // staff with Finishes open: a click on the roof (not on one of its walls) opens its block in the panel; any other spot
      // of the tower — a wall, a parapet, a ground block (its floor) — the building's outside card; neither a trip
      if (!f && STAFF && finishesRef.current && h.k === roofK && !h.wall) return void (setSurface(null), setRoofOpen(true))
      if (finishesRef.current && KEEP) {
        const of = h.wall && Object.values(tower?.FLATS ?? {}).find((x) => x.unit.id === h.wall!.drawing)?.unit
        const drawn = of ? drawingTitle(of).split(' · ')[0] : undefined
        setRoofOpen(false)
        return setSurface({ outside: outSpot(h.k, h.wall, drawn) })
      }
      // staff, Finishes closed: a balcony's edge (a railing, a glass front, a parapet) of a project's flat opens its Made of
      // card at once — no Edit ▾ → Openings, no trip to the flat (qa4fix)
      const low = STAFF && tower ? lowWallAt(tower, h) : null
      if (low) return void (setLowOne(false), setTowerLow({ stem: low.stem, k: h.k, wallId: low.wall.id }))
      if (!f) return levelAt(h.k) ? walkLevel(h.k) : (setPicked(h.k), s.showFloor(h.k))
      if (f.stem !== stem || f.floor !== myFloor) {
        if (!travel({ stem: f.stem, floor: f.floor, view: 'orbit' }, here())) location.assign(`/u/${f.stem}?floor=${f.floor}&view=dollhouse`)
        return
      }
      setMode('orbit')
      s.setMode('orbit')
    })
    s.onTowerHover(setTowerHover)
  })

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
      setDrawable(scene.drawable)
      if (k === rooms.length && scene.drawable) clearInterval(poll)
    }, 150)
    const cap = setTimeout(() => (setLoaded(rooms.length), setDrawable(true)), 20000) // a stuck download must not block Enter
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

  const ready = loaded >= rooms.length && drawable
  const readyRef = useRef(ready)
  readyRef.current = ready

  const enter = () => {
    if (!scene || !ready) return
    setEntered(true)
    scene.unveil()
    const e = entrySpawn(shown(), rooms, innerWidth < innerHeight) // an upright phone looks down the room
    if (e) spawn(scene, e.p, e.face)
    if (params.get('view') === 'dollhouse') go('orbit')
    else if (params.get('view') === 'building') {
      go(stem ? 'building' : 'orbit') // the Studio's "Show building" (taken out of it since: the dollhouse)
      const k = Number(params.get('pick')) // a level shown from the Studio: its floor picked (a basement: what is above it hidden)
      if (stem && params.has('pick') && Number.isFinite(k)) (setPicked(k), scene.showFloor(k))
    } else if (STAFF && params.get('edit') === 'openings') toggleOpenings() // a built-in unit just made the Studio draft
    else scene.lockPointer()
    if (OWN) showToast(`Floor ${unit.floor} has its own drawing now: what you change here stays on this floor`, 7000)
  }

  const go = (m: SceneMode) => {
    if (m === modeRef.current) return // setMode('walk') again would snap the view back to the last saved heading
    setMode(m)
    scene?.setMode(m)
    setPicked(myFloor)
  }
  const toggleMode = () => go(mode === 'walk' ? 'orbit' : 'walk')
  // a flat picked in the Building view opens straight into its dollhouse once loaded; the Studio's building into the tower
  useEffect(() => {
    if (ready && !entered && (params.get('view') === 'dollhouse' || params.get('view') === 'building' || (STAFF && params.has('edit')))) enter()
  })

  /** a quality picked (the start screen's Change, or ⋯): kept in this browser, the page opens again with it */
  const pickQuality = (q: Quality) => {
    write(local, KEYS.picked, q)
    write(tab, KEYS.fallback, null) // the person's pick, from now on
    restart(cfgRef.current)
  }

  const showToast = (msg: string, ms = 2500) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), ms)
  }

  /** staff: the flat as a .glb (Edit → Download 3D model; the Studio's ⋯ → Export → 3D model opens /u/preview?export=glb) */
  const downloadGlb = async (s: PlotlineScene) => {
    setToast('Making the 3D model… (waiting for every piece to arrive)')
    try {
      // every room's furniture in the scene (the start screen's count), then every picture arrived
      for (let t = 0; !readyRef.current && t < 240; t++) await new Promise((r) => setTimeout(r, 250))
      await s.settled()
      const glb = await s.exportGlb()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
      a.download = `${(unit.name || 'flat').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'flat'}.glb`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      showToast(`Saved ${a.download} (${(glb.byteLength / 1e6).toFixed(1)} MB)`, 5000)
    } catch (e) {
      showToast(`The 3D model could not be saved: ${e instanceof Error ? e.message : String(e)}`, 6000)
    }
  }
  useEffect(() => {
    if (!scene || !STAFF || new URLSearchParams(location.search).get('export') !== 'glb') return
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]export=glb/, '').replace(/^&/, '?'))
    void downloadGlb(scene)
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    // staff, the online database set up: a buyer link (/s/…) of this flat as it stands — on its floor, its furniture as laid
    // out, the finishes kept for it (floor 3's beige, not the floor plan's: the Studio's ⋯ → Share link carries those), its
    // buyers' picks and notes in the change list. Else (a buyer, no database) this address with these finishes, as before
    if (STAFF && !SHARED && sharingConfigured) {
      const { publishLink, savedIn, WrongKey } = await import('../lib/publish') // (the walk never loads it)
      try {
        // (named as the Studio names its links: the project's cloud row, the drawing, the floor — so its Links list shows it)
        const url = await publishLink({ ...shown(), name: unit.name }, fullCfg, async () => ({ project: await savedIn(unit.id), stem: unit.id, floor: unit.floor }))
        if (!url) return
        await navigator.clipboard?.writeText(url).catch(() => {})
        showToast(`Buyer link copied: ${stem && unit.floor !== undefined ? floorWord({ stem, floor: unit.floor }) : 'this flat'} with exactly these finishes and furniture.`, 6000)
      } catch (e) {
        showToast(e instanceof WrongKey ? e.message : `Could not share: ${e instanceof Error ? e.message : String(e)}`, 6000)
      }
      return
    }
    const url = shareUrl(location, unit.floor, fullCfg) // the flat picked in the Building view stays on its floor; never `staff`
    history.replaceState(null, '', url)
    // a drawing made in the Studio (a project's floor, the preview) lives in this browser only: its link opens nowhere else (qa4)
    const here = decodeURIComponent(location.pathname.match(/^\/u\/([^/]+)/)?.[1] ?? '')
    const onlyHere = !SHARED && here !== '' && !UNITS.some((x) => x.stem === here)
    void navigator.clipboard
      ?.writeText(url)
      .then(() =>
        onlyHere
          ? showToast('Link copied — but this drawing is kept in this browser only: anyone else opening it sees "This flat isn\'t here". A buyer link needs the online database (Studio → ⋯ → Sign in).', 8000)
          : showToast('Link copied — it opens with exactly these finishes.'),
      )
  }

  const toggleVR = () => void xr?.toggle().catch(() => showToast(VR_FAILED))

  // ── Arrange: the Studio's rules (arrange.ts → studio/furniture.ts); the scene moves one piece's transform at a time
  const pieceOf = (id: Id | null) => steps.current.pieces.find((p) => p.id === id) ?? null
  const showSel = (p: FurniturePlacement | null, refused = false) =>
    scene?.showSelection(p && { id: p.id, quad: pieceQuad(p), refused, axes: resizeAxes(p.assetId) })
  /** a committed step (drop, turn, undo, reset): kept for this apartment (the Studio's F shows it while the drawing stands in one place), shadows and lights follow */
  const settle = (h: Steps, show = sel) => {
    h = { ...h, pieces: layoutFor({ ...unit, furniture: h.pieces }, rooms) } // curtains on their windows as they are now
    const was = steps.current.pieces
    steps.current = h
    if (apt) saveLayout(apt, h.pieces, base) // this apartment's own (founder 2026-11-21): never another floor's, never asked
    scene?.setLayout(h.pieces)
    showSel(pieceOf(show))
    redraw()
    if (STAFF && apt) void outsideFloors(outsideChanges(was, h.pieces))
  }
  /**
   * "This floor only / All N floors with this drawing" for a sunshade, AC unit, canopy or planter on a floor whose drawing
   * stands on others too (qa4fix): asked once this visit — when such a piece is picked up (polish3: the first one then lands
   * as answered), else when one is placed, moved or deleted. undefined: nothing to ask (one floor); null: Esc, no answer.
   */
  const outsideFloorsAnswer = async (): Promise<FloorAnswer | null | undefined> => {
    const k = unit.floor
    const n = tower && k !== undefined ? placesIn(tower, unit.id).length : 0
    if (n < 2) return undefined
    const said = outsideAnswer(unit.id)
    if (said) return said
    document.exitPointerLock?.()
    const others = placesIn(tower!, unit.id).filter((f) => f !== k)
    const i = await askChoice(`${unit.name} is also on floor${others.length === 1 ? '' : 's'} ${slotsText(others)}. Put its outside pieces — sunshades, AC units, canopies, planters — on:`, ['This floor only', `All ${n} floors with this drawing`])
    if (i === null) return null
    const a: FloorAnswer = i === 1 ? 'all' : 'one'
    setOutsideAnswer(unit.id, a)
    showToast(a === 'all' ? `Outside pieces now go on all ${n} floors with ${unit.name} (until this tab closes)` : `Outside pieces stay on floor ${k} only (until this tab closes)`)
    return a
  }
  /** outside pieces placed, moved or deleted: on every other floor with this drawing too when the answer is All (arrange.ts outsideOnEveryFloor), the tower made again so they show. The inside never asks. */
  const outsideFloors = async (changed: FurniturePlacement[]) => {
    if (!changed.length || (await outsideFloorsAnswer()) !== 'all') return // (Esc: this time on this floor only; asked again next time)
    outsideOnEveryFloor(unit, rooms, changed, tower!, unit.floor!)
    scene?.retower()
  }
  /** an outside piece about to be picked up (staff, a floor that shares its drawing): the question first — false: he pressed Esc, nothing is picked up */
  const outsideFirst = async (p: Pick<FurniturePlacement, 'assetId' | 'outside' | 'onCap'> | null) => !(STAFF && apt && p && isOutsidePiece(p) && (await outsideFloorsAnswer()) === null)
  // a piece of the staff's own resized in the library (Edit furniture → Add → ⋯): the ones placed are built again at it
  const ownAt = useRef(ownV)
  useEffect(() => {
    if (ownV === ownAt.current) return
    ownAt.current = ownV
    if (arranging) scene?.setLayout(steps.current.pieces) // the layout is built by then (Edit furniture opens after Enter)
  }, [ownV]) // eslint-disable-line react-hooks/exhaustive-deps
  const undo = () => steps.current.past.length && settle(undoStep(steps.current))
  const turn = () => {
    const p = sel ? baseOf(steps.current.pieces, sel) : null // a TV on its unit: the unit turns, the TV on it
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
  /** Esc in Edit furniture (also in the library's search box): the library closes, nothing picked */
  const escArrange = () => {
    setAdding(false)
    setSel(null)
    showSel(null)
  }
  const toggleArrange = () => {
    letGo()
    if (editingOpenings) toggleOpenings() // one editor at a time
    setAdding(false)
    setArranging(!arranging)
    scene?.setArrange(!arranging)
    setSel(null)
    setCommenting(false)
    if (!arranging && !stored(HINTED)) {
      showToast(`Edit furniture: ${finger ? 'tap' : 'click'} a piece to move, turn, resize or delete it — or Add one from the library`, 6000)
      store(HINTED)
    }
  }
  // ── One floor or all (founder 2026-11-20): on a Studio project's floor whose drawing is on other floors too, Edit openings
  // asks, once per project (Studio → Building list: Ask again): this floor only — it gets its own copy of the drawing and the
  // page opens on that (arrange.ts forkHere) — or all those floors. Furniture and finishes never ask: each apartment's own.
  const [askFloor, setAskFloor] = useState<{ pid: Id; text: string; k: number; n: number; all: () => void; one: () => void } | null>(null)
  /** `all` now, unless this floor shares its drawing and he has not said "all floors" for the project; "this floor only": `one` */
  const perFloor = (all: () => void, one: () => void) => {
    const k = unit.floor
    const sh = STAFF && stem && level === undefined && k !== undefined ? sharedAt(readProjects(), stem, k) : null
    const said = sh && floorAnswer(sh.p.id)
    if (!sh || said === 'all') return all()
    if (said === 'one') return one()
    document.exitPointerLock?.()
    const others = sh.slots.filter((s) => s !== k)
    setAskFloor({ pid: sh.p.id, text: `${unit.name} is also on floor${others.length === 1 ? '' : 's'} ${slotsText(others)}.`, k: k!, n: sh.slots.length, all, one })
  }
  const answer = (a: FloorAnswer) => {
    if (!askFloor) return
    setAskFloor(null)
    setFloorAnswer(askFloor.pid, a)
    if (a === 'one') askFloor.one()
    else askFloor.all()
  }
  /** "this floor only": the copy made (with this apartment's furniture and finishes), then the page opens on it with Edit openings on */
  const ownFloor = () => {
    const f = stem && unit.floor !== undefined ? forkHere(stem, unit.floor) : null
    if (!f) return showToast('This browser would not save the copy (storage full?): nothing changed', 7000)
    if (!makeDraft(f.unit)) return showToast(OPENINGS_WHY.full, 7000)
    const to = `/u/preview?floor=${unit.floor}&edit=openings&own=1${mode === 'orbit' ? '&view=dollhouse' : ''}`
    void copyPicture(f.from, f.unit.id).then(() => location.assign(to))
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
  const startPlacing = async (assetId: string) => {
    setFinishesOpen(false) // (placing and Finishes never at once: Finishes' click on an outer wall opens its outside card)
    if (!(await outsideFirst({ assetId }))) return
    grip({ id: core.newId(), assetId, rot: 0, at: null, move: null })
    setAdding(false)
    setSel(null)
    showSel(null)
  }
  /** G: the piece under the crosshair / pointer into the hand; nothing there says so */
  const pickUpAtPointer = async () => {
    const id = scene?.pieceUnderPointer()
    if (!id) return showToast(`Point ${locked ? 'the dot' : 'the mouse'} at a piece of furniture, then press G`)
    if (!(await outsideFirst(pieceOf(id)))) return
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
    if (h.assetId) setToast(null) // a new piece is down: "… Click where it goes" has been done
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

  // ── the stairs (founder 2026-11-20: "if i climb a stair i cannot reach the upper floor"): walked up a stair's flight to
  // the floor above (or down to the one below; PlotlineScene.toNextFloor), or the Up / Down button in a stair room. Session
  // 31: that floor loads into this same 3D (no new page) and he stands at its stair, the walk going on — and a flat or a
  // level picked in the Building view comes in the same way (qa3 P12: a new page took 13–19 s before its Dollhouse showed)
  const floorLabel = level !== undefined ? levelName(tower!, level) : stem || unit.floor !== undefined ? `Floor ${myFloor}` : undefined
  /** where he is now, as a trip's way back */
  const here = (): Trip => ({ stem: stem!, floor: myFloor, view: modeRef.current })
  /** the floor a stair reaches, as the buttons and the loading line say it */
  const floorWord = (to: { stem: string; floor: number }) => (tower?.LEVELS?.[to.stem] !== undefined ? levelName(tower, to.floor) : `Floor ${to.floor}`)
  /** a trip under way: "Floor 3 …" in the hint's place, and the room's name and floor he left, while that floor loads (qa3 P7: the name switched at once); null: none */
  const going = useRef<{ line: string; room: Room | null; floorLabel: string | undefined } | null>(null)
  /**
   * Goes to floor `to` of this tower (stairTo, a flat or a level picked in the Building view, Back / Forward): its unit, the
   * stair point he arrives by (`at`: arriveBy, facing into the flight; none: the flat's entry, as Enter puts him) and the view
   * it opens in. That floor's models load while he stays where he is, the view he leaves still drawn and "Floor 3 …" where
   * the hint is; then it is swapped in in one frame. `from` (where he is) goes into the browser's history with the new
   * address (stairUrl; a flat's Dollhouse: `view=dollhouse`), so Back makes the same trip back; `from` null: Back / Forward
   * brought him here, the history is already right. False: a trip is already under way, or that floor is not in the tower.
   */
  const travel = (to: Trip, from: Trip | null): boolean => {
    const next = tower ? prepare(tower.FLATS[to.stem]?.unit ?? null, to.floor) : null
    if (going.current || !next) return false
    going.current = { line: `${floorWord(to)} …`, room, floorLabel }
    redraw()
    // ponytail: 15 s cap — a model still downloading after that streams in on the new floor (as on a page load). Then two
    // frames, so the line is on screen before the floor is built (a moment the 3D stands still, even with every model at hand)
    const frame = () => new Promise((r) => requestAnimationFrame(r))
    void Promise.race([preloadModels(next.unit.furniture), new Promise((r) => setTimeout(r, 15_000))]).then(frame).then(frame).then(() => {
      if (from) {
        history.replaceState({ ...history.state, trip: from }, '') // where Back arrives
        history.pushState({ trip: to }, '', stairUrl(location.search, to.stem, to.floor, SHARED, to.view === 'orbit'))
      }
      const rs = core.deriveRooms(next.unit)
      const at = to.door && to.at && core.roomAt(to.at, rs, next.unit)
      const door = at ? stairView(at, next.unit) : null
      const by = !door && to.at && arriveBy(next.unit, rs, to.at, to.floor > myFloor ? 'below' : 'above')
      const e = by ? null : entrySpawn(next.unit, rs, innerWidth < innerHeight) // (an upright phone looks down the room, as on Enter)
      const a = (arrival.current = door
        ? { at: door.p, face: door.face, view: to.view } // (level: arrive takes no pitch)
        : by
        ? { at: by.at, face: arrivalFace(next.unit, by), view: to.view }
        : { at: e?.p ?? rs[0]?.centroid ?? { x: 0, y: 0 }, face: e?.face ?? { x: 0, y: -1 }, view: to.view })
      // the floor he leaves: what was open on it closes; the sun, the wind and Clean view stay, and a buyer's finishes (staff
      // see that floor's apartment as it was kept)
      letGo()
      scene?.setArrange(false)
      scene?.setOpeningEdit(false)
      setArranging(false)
      setEditingOpenings(false)
      setOpSel(null)
      setAdding(false)
      setSel(null)
      setSurface(null)
      setDraft(null)
      setAskFloor(null)
      setFloorUnit(next)
      if (KEEP) setCfg(next.finishes)
      setPlanUnit(next.unit)
      steps.current = { pieces: next.unit.furniture, past: [] }
      live.current = null
      plan.current = { ...initialState(), unit: next.unit }
      gesture.current = null
      setPins(readPins(next.unit.id))
      setRoom(core.roomAt(a.at, rs, next.unit) || null)
      document.title = pageTitle(next.unit.name) // (the line, the room's name and the view go once the floor is built: the unit effect)
    })
    return true
  }
  useEffect(() =>
    scene?.onStair((dir, stair) => {
      const to = tower && stem ? stairTo(tower, stem, myFloor, stair, dir === 'up' ? 1 : -1) : null
      if (to) travel({ ...to, view: 'walk' }, { ...here(), at: stair, view: 'walk' })
      else showToast(dir === 'up' ? 'This stair goes no higher' : 'This stair goes no lower')
      return !!to
    }),
  )
  // Back / Forward between floors a trip reached: the same trip back, no new page; an address no trip made opens as a page
  useEffect(() => {
    const pop = (e: PopStateEvent) => {
      const to = (e.state as { trip?: Trip } | null)?.trip
      if (!to || !travel(to, null)) location.reload()
    }
    addEventListener('popstate', pop)
    return () => removeEventListener('popstate', pop)
  })
  /** the Rooms list's jump (and its core group's): a stair room from its door looking at the flight, any other room as roomView frames it */
  const jump = (r: Room) => {
    const v = isStairRoom(r) && r.kind !== 'lobby' ? stairView(r, shown()) : roomView(r, shown()) // the arranged layout, deleted pieces out
    // a leaf that would fill the first frame is shut for it; the next jump, key or click opens it again
    scene?.shutLeaf(v.closeLeaf ?? null)
    if (v.closeLeaf) for (const e of ['keydown', 'pointerdown']) addEventListener(e, () => scene?.shutLeaf(null), { once: true })
    if (scene) spawn(scene, v.p, v.face, v.pitch, v.hfov) // (a WC under 2 m²: a narrower lens, eased back as he walks out)
    setMode('walk')
  }
  // the building's core in the Rooms list (newcomer lane s31: the stair was in no list): this drawing's stairs and lift lobby,
  // and where its floor's stair is drawn with another flat (BTI's Type A, Sheltech's Type B) that stair, in this same 3D
  const building = useMemo(() => {
    const own = coreRooms(rooms)
    const near = own[0]?.centroid ?? rooms[0]?.centroid
    return { own, away: !own.some((r) => isStairRoom(r) && r.kind !== 'lobby') && tower && stem && near ? stairOnFloor(tower, stem, myFloor, near) : null }
  }, [rooms, tower, stem, myFloor])
  const stairWays = useMemo(() => {
    if (mode !== 'walk' || !room || !isStairRoom(room) || !tower || !stem) return []
    const s = unit.furniture.find((p) => p.roomId === room.id && isStair(p))
    const at = s ? { x: s.x, y: s.y } : room.centroid
    return ([1, -1] as const).flatMap((d) => {
      const to = stairTo(tower, stem, myFloor, at, d)
      return to ? [{ d, to, at, label: `${d > 0 ? 'Up' : 'Down'} to ${floorWord(to)}` }] : []
    })
  }, [mode, room, tower, stem, myFloor, unit.furniture]) // eslint-disable-line react-hooks/exhaustive-deps
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
  /** the Building view's balcony edge whose Made of card is open (a project flat's stem on floor k, its low wall), and its "This floor only" */
  const [towerLow, setTowerLow] = useState<{ stem: string; k: number; wallId: Id } | null>(null)
  const [lowOne, setLowOne] = useState(false)
  const lowNow = towerLow && mode === 'building' ? tower?.FLATS[towerLow.stem]?.unit : undefined
  const lowWall = lowNow?.walls.find((w) => w.id === towerLow!.wallId)
  /** Made of chosen on the tower: into the drawing (every floor with it) or a copy for this floor; the tower made again; the flat walked here too when it is that drawing */
  const madeOf = (patch: LowPatch) => {
    if (!towerLow) return
    const r = madeOfOnTower(towerLow.stem, towerLow.k, towerLow.wallId, patch, lowOne)
    if (!r) return showToast('This browser would not save it (storage full?): nothing changed', 7000)
    setTowerLow({ ...towerLow, stem: r.stem })
    const w = r.unit.walls.find((x) => x.id === towerLow.wallId)
    if (r.unit.id === unit.id && w) {
      const after = { ...unit, walls: unit.walls.map((x) => (x.id === w.id ? w : x)) }
      setPlanUnit(after)
      scene?.setUnit({ ...after, furniture: steps.current.pieces }, true)
    }
    scene?.retower()
  }
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
  const toggleOpenings = async () => {
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
      const question = builtIn
        ? `${unit.name} is a built-in unit. Its doors and windows are edited on your Studio draft: this makes it your Studio draft (replacing the unit open in the Studio — export that first if you need it) and reopens it here. Continue?`
        : 'Edit openings saves into your Studio draft, and your Studio draft is not this unit. Make this unit your Studio draft? (It replaces the unit open in the Studio — export that one first if you need it.)'
      if (!(await ask(question, 'Make it my draft'))) return
      if (!makeDraft(unit)) return showToast(OPENINGS_WHY.full, 7000)
      if (builtIn) return location.assign(`/u/preview?${unit.floor !== undefined ? `floor=${unit.floor}&` : ''}edit=openings`) // (on its floor)
    }
    perFloor(
      () => {
        letGo()
        setAdding(false)
        setArranging(false)
        scene?.setArrange(false)
        setSel(null)
        setCommenting(false)
        setEditingOpenings(true)
        scene?.setOpeningEdit(true)
      },
      ownFloor,
    )
  }

  // keys: Enter (load screen), O, F, C, P (the wind, as the Wind button), Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      // a text box keeps its letters; the hour slider takes none (after a drag the keys and Esc still work)
      if ((tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') || tag === 'TEXTAREA') return
      if (!entered) {
        if (e.key === 'Enter') enter()
        return
      }
      if (inVR) return // a desk keyboard next to a tethered headset must not flip the scene to dollhouse
      const k = e.key.toLowerCase()
      const h = held.current
      if (askFloor && k === 'escape') {
        // the "which floors?" box: Esc closes it, Edit openings stays off (no answer remembered)
        setAskFloor(null)
      } else if (editingOpenings && k === 'z' && (e.ctrlKey || e.metaKey)) {
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
      else if (arranging && k === 'escape') escArrange()
      else if (k === 'o') toggleMode()
      else if (k === 'b' && stem) go('building')
      else if (k === 'f') toggleFinishes()
      else if (k === 'c') toggleComment()
      else if (k === 'p' && !e.repeat) setWindOn((v) => !v) // founder 2026-10-19: "make windpaths visible by pressing the button p"
      else if (k === 'escape') {
        // one step back: a note being written first, then Comment, else the open panels (Finishes, Sun & wind)
        if (draft) setDraft(null)
        else if (commenting) setCommenting(false)
        else {
          setFinishesOpen(false)
          setSimOpen(false)
          setStatsOpen(false)
          setTowerLow(null) // the Building view's balcony-edge card, as its Done
        }
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
    setDraft(null) // Comment stays on: its panel lists the note just saved; the next click starts another (Esc or C stops)
  }
  /** Finishes and Comment take the same place on the right: one opens, the other closes */
  const toggleFinishes = () => {
    letGo() // a piece in hand goes back (a new one is let go): with Finishes open a click on an outer wall is its outside card, never a drop (session 31 pieces / facade)
    setFinishesOpen((v) => !v)
    setCommenting(false)
    setDraft(null)
    if (finger) scene?.forgetTowerHover() // the last tap's card on the tower would stand over the sheet's top edge (phoneqa)
  }
  const toggleComment = () => {
    setCommenting((v) => !v)
    setFinishesOpen(false)
    setDraft(null)
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
  /** staff: where what they change in Finishes / Edit furniture is kept, in words (arrange: never on a published link) */
  const kept = !apt
    ? null
    : apt !== unit.id
      ? `Kept for ${level !== undefined ? levelName(tower!, level) : `floor ${unit.floor}`} only: it opens like this next time.${outsideAnswer(unit.id) === 'all' ? ' Outside pieces: every floor with this drawing.' : ''}`
      : tower && placesIn(tower, unit.id).length > 1
        ? 'Kept for the drawing: every floor not changed on its own starts from this.'
        : `Kept for this ${level !== undefined ? 'level' : 'flat'}: it opens like this next time.`
  /** walks the level on floor k (this one: Walk; another: brought in as a stair brings a floor — a share link's level stays a buyer's link) */
  const walkLevel = (k: number) => {
    const s = levelAt(k)
    if (s === stem) go('walk')
    else if (s && !going.current && !travel({ stem: s, floor: k, view: 'walk' }, here())) location.assign(`/u/${encodeURIComponent(s)}${SHARED ? '?c=' : ''}`)
  }
  return (
    <div className={`viewer${commenting ? ' commenting' : ''}`}>
      <canvas ref={canvasRef} className={`scene${entered ? '' : ' blurred'}${drawable ? '' : ' waiting'}`} />

      {!entered && (
        <div className="load">
          <div className="load-mark display">Plotline</div>
          <div className="load-main">
            <div className="label">{unit.projectName}</div>
            <h1 className="unit-name display">{unit.name}</h1>
            <div className="load-meta">
              {level !== undefined ? (
                levelName(tower!, level) !== unit.name && levelName(tower!, level) // "Ground floor" said once, not twice
              ) : (
                <>
                  {unit.floor !== undefined && `Floor ${unit.floor} · `}
                  {unit.areaSqft.toLocaleString('en-IN')} sqft · {sqm} m²
                </>
              )}
            </div>
            <div className={`progress${ready ? ' done' : ''}`} role="progressbar" aria-label="Loading the rooms" aria-valuemin={0} aria-valuemax={rooms.length} aria-valuenow={loaded}>
              <div className="bar" style={{ width: `${rooms.length ? (loaded / rooms.length) * 100 : 100}%` }} />
            </div>
            <button className="btn primary enter" disabled={!ready} onClick={enter}>
              {ready ? 'Enter' : 'Loading…'}
            </button>
            <div className="load-key">{ready ? !finger && 'or press Enter' : `${loaded} of ${rooms.length} rooms ready`}</div>
            <QualityLine onPick={pickQuality} />
          </div>
          {/* ponytail: plain links until Phase A gives each developer a project list; never on a buyer's link */}
          {!SHARED && (
            <div className="load-more">
              <nav className="load-nav">
                <span className="label">Flats</span>
                {NAV.flats.map((u) => (
                  <a key={u.stem} href={`/u/${u.stem}`} className={u.unit.id === unit.id ? 'current' : ''}>
                    {u.unit.name}
                  </a>
                ))}
              </nav>
              {NAV.towers.map((g) => (
                <nav key={g.name} className="load-nav">
                  <span className="label">{g.name}</span>
                  {g.levels.map((l) => (
                    <a key={l.stem} href={`/u/${l.stem}`} className={l.stem === stem ? 'current' : ''}>
                      {l.label}
                    </a>
                  ))}
                </nav>
              ))}
            </div>
          )}
          {!SHARED && (
            <div className="load-corner">
              <a href="/studio">Studio</a>
              {STAFF ? (
                <a href={staffHref('0')} title="See the flat as a buyer does (no Edit furniture, no Edit plan)">
                  Leave staff mode
                </a>
              ) : (
                <a href={staffHref('1')} title="For the developer’s team: Edit furniture and Edit plan in this browser. Buyer links never show them.">
                  Staff mode
                </a>
              )}
            </div>
          )}
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
            room={going.current ? going.current.room : room}
            rooms={listed}
            mode={mode}
            floor={stem ? myFloor : unit.floor}
            floorLabel={going.current ? going.current.floorLabel : floorLabel}
            roomNote={windOn && room ? core.windSentence(windRooms.find((w) => w.roomId === room.id), unit.northDeg) : null}
            pickedFloor={tower && stem ? floorTitle(tower, picked, stem) : null}
            floors={stem ? PICKER(unit) : null}
            picked={picked}
            onWalkLevel={walkStem ? () => walkLevel(picked) : null}
            tower={tower}
            hover={mode === 'building' && !going.current ? towerHover : null}
            hovered={mode === 'building' ? (railHover ?? towerHover?.k ?? null) : null}
            onHoverFloor={(k) => {
              setRailHover(k)
              scene?.hoverFloor(k)
            }}
            onPickFloor={(k) => {
              setPicked(k)
              scene.showFloor(k)
            }}
            finishesOpen={finishesOpen}
            outsidePick={finishesOpen && KEEP}
            commenting={commenting}
            sunOpen={simOpen}
            locked={locked}
            onEnterVR={xr ? toggleVR : null}
            toast={toast}
            going={going.current?.line ?? null}
            onJump={jump}
            core={[
              ...building.own.map((r) => ({ id: r.id, name: r.name, note: r.printedSize ?? `${r.areaSqm.toFixed(1)} m²`, go: () => jump(r) })),
              ...(building.away ? [{ id: 'stair', name: building.away.name, note: '', go: () => travel({ stem: building.away!.stem, floor: myFloor, at: building.away!.at, view: 'walk', door: true }, here()) }] : []),
            ]}
            onMode={go}
            onToggleFinishes={toggleFinishes}
            onToggleComment={toggleComment}
            onShare={() => void share()}
            arranging={arranging}
            hand={handInfo}
            staff={STAFF}
            osm={!!unit.site && unit.site.buildings.length + unit.site.roads.length > 0}
            onArrange={STAFF ? toggleArrange : null}
            editingOpenings={editingOpenings}
            quality={{
              tier: TIER.tier,
              rec: REC.tier,
              why: QUALITY_WHY,
              note: qNote,
              gpu: DEVICE.gpu,
              onPick: pickQuality,
            }}
            onStats={SHARED ? null : () => setStatsOpen(true)}
            sun={
              <SunPill
                scene={scene}
                open={simOpen}
                onOpen={() => setSimOpen((v) => !v)}
                hour={hour}
                date={date}
                northDeg={unit.northDeg}
                site={unit.site}
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
                months={months}
                onMonth={pickMonth}
                windLine={core.monthLine(month, months, unit.site)}
                windNote={core.seasonNote(month, months, unit.site)}
                windSource={unit.site?.wind ? `Wind at this site: Open-Meteo, ${windYears(unit.site.fetchedAt)}` : 'Wind: the Dhaka table (Open-Meteo 2015–2024) — no site set in the Studio'}
              />
            }
            ways={
              stairWays.length > 0 && !arranging && !editingOpenings && !going.current ? (
                <div className="glass walk-level" role="group" aria-label="Take the stair">
                  {stairWays.map((w) => (
                    <button key={w.d} className="btn" title="Take the stair: that floor opens here, you stand at its stair" onClick={() => travel({ ...w.to, view: 'walk' }, { ...here(), at: w.at, view: 'walk' })}>
                      {w.label}
                    </button>
                  ))}
                </div>
              ) : null
            }
            onOpenings={STAFF ? toggleOpenings : null}
            onDownloadGlb={STAFF && scene ? () => void downloadGlb(scene) : null}
            onEditPlan={
              STAFF
                ? () => {
                    const id = location.pathname.split('/')[2] // the route stem; `/u/preview` is already the Studio's draft
                    window.open(id === 'preview' ? '/studio' : `/studio?unit=${id}`, '_blank')
                  }
                : null
            }
          />
          {askFloor && (
            <div className="glass ask-floor" role="dialog" aria-label="Which floors do these doors and windows change on?">
              <div>{askFloor.text} Change its doors and windows on:</div>
              <div className="ask-row">
                <button className="btn primary" onClick={() => answer('one')}>
                  Floor {askFloor.k} only
                </button>
                <button className="btn" onClick={() => answer('all')}>
                  All {askFloor.n} floors
                </button>
              </div>
              <div className="muted small">
                Floor {askFloor.k} only: it gets its own copy of the drawing (walls, doors and windows); the other floors stay as they are. Furniture and finishes are always each floor's own. Asked once for this project (Studio → Building: Ask again).
              </div>
            </div>
          )}
          {statsOpen && !commenting && !finishesOpen && (
            <StatsPanel scene={scene} gpu={DEVICE.gpu} tier={TIER.tier} view={{ walk: 'Walk', orbit: 'Dollhouse', building: 'Building' }[mode]} onClose={() => setStatsOpen(false)} />
          )}
          {commenting && (
            <aside className="glass panel" aria-label="Comment" onKeyDown={(e) => (e.target as HTMLElement).tagName === 'INPUT' && e.stopPropagation() /* typing a name */}>
              <Grip onClose={toggleComment} />
              <header className="panel-head">
                <span className="label">Comment</span>
                <button className="x" aria-label="Stop commenting" title="Stop (C or Esc)" onClick={toggleComment}>
                  ×
                </button>
              </header>
              <div className="panel-body">
                <p className="panel-lead">{finger ? 'Tap' : 'Click'} anything in the flat — a wall, a window, a piece of furniture — and write what you would change. A numbered pin stays on it.</p>
                {TOKEN && <BuyerName />}
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
              </div>
            </aside>
          )}
          {finishesOpen && (
            <aside className="glass panel" aria-label="Finishes" onKeyDown={(e) => ['INPUT', 'SELECT'].includes((e.target as HTMLElement).tagName) && e.stopPropagation() /* typing a name; Esc on a chip still closes the panel */}>
              <Grip onClose={() => setFinishesOpen(false)} />
              <header className="panel-head">
                <span className="label">Finishes</span>
                <button className="x" aria-label="Close Finishes" title="Close (F or Esc)" onClick={() => setFinishesOpen(false)}>
                  ×
                </button>
              </header>
              <div className="panel-body">
                {TOKEN && <BuyerName />}
                <FinishesPanel
                  outsideFirst={mode === 'building'}
                  staff={STAFF}
                  kept={KEEP ? kept : null}
                  roof={
                    STAFF && roofK !== null
                      ? {
                          value: roofNow,
                          read: tower?.STOREYS?.ridgeM !== undefined,
                          open: roofOpen,
                          onOpen: (o) => (setSurface(null), setRoofOpen(o)),
                          onChange: (r: Roof) => {
                            // kept in the project (or, for a built-in building, in this browser), then the tower made again round the flat
                            if (!saveRoof(unit, r)) return showToast('The roof could not be kept: this browser’s storage is full or blocked.')
                            bumpRoof()
                            scene?.retower()
                          },
                        }
                      : null
                  }
                  slots={unit.finishSlots}
                  cfg={cfg}
                  keys={keys}
                  outside={KEEP ? { rec: outside, slots: outSlots, onSelect: chooseOutside } : undefined}
                  surface={surface}
                  onSelect={choose}
                  onCloseSurface={() => setSurface(null)}
                  onReset={async () => {
                    // staff's picks are kept for this flat the moment they click, and the panel has no Undo: say so before they go (qa3 P4)
                    const n = Object.keys(cfg).length
                    const what = n === 1 ? 'The choice kept for this flat goes, and Undo cannot bring it back.' : `The ${n} choices kept for this flat go, and Undo cannot bring them back.`
                    if (KEEP && apt && n && !(await ask(`Back to the included finishes? ${what}`, 'Reset', true))) return
                    for (const s of unit.finishSlots) choose(s.id, s.defaultOptionId)
                    for (const k of Object.keys(cfg)) if (keys.has(k)) choose(k, null)
                    setCfg({})
                  }}
                />
              </div>
            </aside>
          )}
          {lowNow && lowWall && (
            <MadeOfCard
              w={lowWall}
              lengthM={core.wallFrame(lowWall, lowNow.vertices).lengthM}
              where={`Floor ${towerLow!.k} · ${drawingTitle(lowNow)}`}
              floors={tower ? placesIn(tower, lowNow.id).length : 1}
              k={towerLow!.k}
              one={lowOne}
              onOne={setLowOne}
              onLowKind={madeOf}
              onDone={() => setTowerLow(null)}
            />
          )}
          {editingOpenings && (
            <OpeningPanel
              opening={opF?.opening ?? null}
              wall={opWall}
              where={opF || opW ? rooms.filter((r) => r.wallIds.includes(opF?.wall.id ?? opW!.id)).map((r) => r.name).join(' ↔ ') || (opF ? 'On an outside wall' : 'Outside') : ''}
              refused={plan.current.dragBlocked}
              frame={
                KEEP && opF && (opF.opening.kind === 'window' || opF.opening.kind === 'slider')
                  ? { options: outSlots[1].options, own: outside[frameKey(unit.id, opF.opening.id)] ?? null, building: outside[FRAMES_SLOT.id] ?? FRAMES_SLOT.defaultOptionId, onPick: (id) => chooseOutside(frameKey(unit.id, opF.opening.id), id) }
                  : undefined
              }
              canUndo={plan.current.history.past.length > 0}
              onKind={(kind) => opF && planCommit({ type: 'update-opening', id: opF.opening.id, patch: { kind } })}
              onSize={(patch) => opF && planCommit({ type: 'update-opening', id: opF.opening.id, patch })}
              onWall={({ lengthM, heightM }) =>
                opW && planCommit(lengthM !== undefined ? { type: 'set-wall-length', id: opW.id, lengthM } : { type: 'set-wall-type', ids: [opW.id], wall: wallTypeOf(heightM!), heightM })
              }
              onLowKind={(patch) => opW && planCommit({ type: 'low-wall', ids: [opW.id], ...patch })}
              onDelete={() => {
                if (!opF && !opW) return
                setOpSel(null)
                planCommit({ type: 'delete', ids: [opF?.opening.id ?? opW!.id] })
              }}
              onUndo={() => planCommit({ type: 'undo' })}
            />
          )}
          {arranging && adding && <AddPanel onPick={startPlacing} onEsc={escArrange} onNote={(t) => showToast(t, 6000)} />}
          {arranging && (
            <ArrangePanel
              kept={kept}
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
              onDone={() => (held.current ? letGo() : escArrange())}
            />
          )}
          {windOn && mode === 'walk' && room && (
            <WindChips scene={scene} unit={unit} room={room} rw={windRooms.find((w) => w.roomId === room.id)} fromDeg={months[month].fromDeg} />
          )}
          <PinLayer scene={scene} pins={pins} draft={draft} onSave={savePin} onCancel={() => setDraft(null)} />
          <Minimap scene={scene} unit={unit} rooms={rooms} walking={mode === 'walk'} />
        </>
      )}
      {no3d && <NoThreeD unit={unit} />}
    </div>
  )
}
