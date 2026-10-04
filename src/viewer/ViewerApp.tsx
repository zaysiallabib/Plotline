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
import type { Configuration, FurniturePlacement, Id, Pt, Room, Unit } from '../core'
import { towerOf } from '../data/building'
import { placementLabel, placementSize } from '../furnish/kit'
import { deletePiece, layoutFor, library, movePiece, pieceQuad, placePiece, resizeAxes, resizePiece, surfaceOf, type Move } from '../studio/furniture'
import { fetchSharedUnit } from '../lib/supabase'
import { isUnit, normalizeUnit } from '../studio/model'
import { PlotlineScene, type ArrangeEvent, type PickHit, type SceneMode } from '../three/PlotlineScene'
import { TEST_UNIT } from '../three/testUnit'
import type { XRControls } from '../three/xr'
import { dragTo, isShareLink, isStaff, pushStep, readLayout, saveLayout, undoStep, type DragTarget, type Steps } from './arrange'
import FinishesPanel from './FinishesPanel'
import Hud from './Hud'
import { NotesList, PinLayer, tagOf, type Draft } from './Notes'
import { entrySpawn, listedRooms, roomView, yawFor } from './spawn'
import SunPill from './SunPill'
import { withDefaults } from './defaults'
import { decodeConfig, shareUrl } from './share'
import { appendPin, readPins, removePin, type Pin } from './storage'
import './viewer.css'

const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
const UNITS = Object.entries(files).map(([path, unit]) => ({ stem: path.split('/').pop()!.replace(/\.json$/, ''), unit }))
if (!UNITS.length) UNITS.push({ stem: TEST_UNIT.id, unit: TEST_UNIT }) // dev only: no unit JSON on disk yet

const NOT_FOUND = "This unit isn't available. Ask your sales contact for a fresh link."
const NO_WEBGL = "This browser can't show 3D. Try Chrome or Edge on a PC."
const DEFAULT_HOUR = 15.5
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
if (params.has('staff')) {
  params.delete('staff')
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}`)
}
/** Building view floor picker of the flat's tower, top down: roof, the floors with flats, ground */
function PICKER(u: Unit) {
  const FLOORS = towerOf(u)?.FLOORS ?? []
  const top = Math.max(...FLOORS.map((f) => f.floor))
  return [{ k: top + 1, label: 'R' }, ...FLOORS.filter((f) => f.flats.length).map((f) => ({ k: f.floor, label: String(f.floor) })).reverse(), { k: 0, label: 'G' }]
}
/** the flat's route stem in its tower, if it is in one */
const towerStem = (u: Unit) => {
  const FLATS = towerOf(u)?.FLATS ?? {}
  return Object.keys(FLATS).find((s) => FLATS[s].unit.id === u.id)
}
/** `?floor=N` (a flat picked in the Building view) puts the flat on floor N if the tower has it there; the JSON keeps its own. */
function onFloor(u: Unit | null): Unit | null {
  const n = Number(params.get('floor'))
  const stem = u && towerStem(u)
  return u && stem && towerOf(u)!.FLOORS.some((f) => f.floor === n && f.flats.includes(stem)) ? { ...u, floor: n } : u
}

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
  return UNITS.find((u) => u.stem === id || u.unit.id === id)?.unit ?? null
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
  if (!document.createElement('canvas').getContext('webgl2')) return <div className="boot">{NO_WEBGL}</div>
  return <Viewer unit={unit} base={base} />
}

const dims = (s: { x: number; y: number; z: number }) => `${s.x.toFixed(2)} × ${s.z.toFixed(2)} m, ${s.y.toFixed(2)} m high`

/** The staff library (studio/furniture.ts library): every kit piece by tab; pick one, then point where it goes. */
function AddPanel({ onPick }: { onPick: (assetId: string) => void }) {
  const tabs = useMemo(library, [])
  const [tab, setTab] = useState(tabs[0].tab)
  return (
    <aside className="glass library">
      <div className="arrange-row">
        {tabs.map((t) => (
          <button key={t.tab} className={`btn${t.tab === tab ? ' active' : ''}`} onClick={() => setTab(t.tab)}>
            {t.tab}
          </button>
        ))}
      </div>
      <div className="library-list">
        {tabs
          .find((t) => t.tab === tab)!
          .items.map((i) => (
            <button key={i.id} className="room-row" onClick={() => onPick(i.id)}>
              <span>{i.label}</span>
              <span className="muted">{dims(i.size)}</span>
            </button>
          ))}
      </div>
    </aside>
  )
}

/** Arrange (staff): the selected piece, what it allows, turn / delete / undo / reset; Add opens the library; while placing, what and why not. */
function ArrangePanel(p: {
  piece: FurniturePlacement | null
  placing: { label: string; error: string | null; ready: boolean } | null
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
      {p.placing ? (
        <>
          <div className="arrange-name">Placing: {p.placing.label}</div>
          <div className={`small ${p.placing.error ? 'refused' : 'muted'}`}>{p.placing.error ?? (p.placing.ready ? 'Click to put it here · R turns · Esc cancels' : 'Point at the floor, a wall or the ceiling')}</div>
        </>
      ) : p.piece && s ? (
        <>
          <div className="arrange-name">{placementLabel(p.piece)}</div>
          <div className="muted small">
            {resizeAxes(p.piece.assetId).length
              ? `${dims(s)} · drag a dot to resize`
              : 'This piece can be moved and turned'}
          </div>
        </>
      ) : (
        <div className="muted small">Click a piece, then drag it. The TV, art and AC slide along the walls, lights and fans on the ceiling. Add puts a new one in.</div>
      )}
      <div className="arrange-row">
        <button className={`btn${p.adding ? ' active' : ''}`} title="Add a piece from the library" onClick={p.onAdd}>
          Add
        </button>
        <button className="btn" disabled={!p.piece} onClick={p.onTurn}>
          Turn 90° (R)
        </button>
        <button className="btn" disabled={!p.piece} title="Delete this piece (and what rests on it)" onClick={p.onDelete}>
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

function Viewer({ unit, base }: { unit: Unit; base: FurniturePlacement[] }) {
  const rooms = useMemo(() => core.deriveRooms(unit), [unit])
  const listed = useMemo(() => listedRooms(unit, rooms), [unit, rooms])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scene, setScene] = useState<PlotlineScene | null>(null)
  const [loaded, setLoaded] = useState(0)
  const [entered, setEntered] = useState(false)
  const [mode, setMode] = useState<SceneMode>('walk')
  const [hour, setHour] = useState(DEFAULT_HOUR)
  const [cfg, setCfg] = useState<Configuration>(() => decodeConfig(new URLSearchParams(location.search).get('c'), unit.finishSlots))
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
  // Arrange (staff): the committed layout and its undo steps; a drag's candidate lives in `live` until the drop
  const [arranging, setArranging] = useState(false)
  const [sel, setSel] = useState<Id | null>(null)
  const steps = useRef<Steps>({ pieces: unit.furniture, past: [] })
  const live = useRef<Move | null>(null)
  // the library: open or not; the new piece following the pointer (its id, asset, turn, the last pointer target)
  const [adding, setAdding] = useState(false)
  const placing = useRef<{ id: Id; assetId: string; rot: number; last: DragTarget | null } | null>(null)
  const [, redraw] = useReducer((n: number) => n + 1, 0)
  const stem = towerStem(unit)
  const commentingRef = useRef(commenting)
  commentingRef.current = commenting
  const modeRef = useRef(mode)
  modeRef.current = mode
  /** every slot resolved (selection or its default) — what the engine and the share link get */
  const fullCfg = useMemo<Configuration>(
    () => Object.fromEntries(unit.finishSlots.map((s) => [s.id, cfg[s.id] ?? s.defaultOptionId])),
    [unit.finishSlots, cfg],
  )

  // engine
  useEffect(() => {
    const s = new PlotlineScene(canvasRef.current!, { quality: new URLSearchParams(location.search).get('quality') === 'low' ? 'low' : 'high' })
    s.setUnit(unit)
    s.setTimeOfDay(DEFAULT_HOUR)
    s.onPick((hit) => {
      if (!hit) return
      if (commentingRef.current) {
        const roomId = hit.roomId ?? core.roomAt({ x: hit.point.x, y: hit.point.z }, rooms, unit)?.id
        setDraft({ hit: { ...hit, roomId }, point: hit.point, label: tagOf(hit.label, rooms.find((r) => r.id === roomId)?.name) })
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
  }, [unit, rooms])

  useEffect(() => {
    scene?.setConfiguration(fullCfg)
  }, [scene, fullCfg])

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
    else scene.lockPointer()
  }

  const go = (m: SceneMode) => {
    if (m === modeRef.current) return // setMode('walk') again would snap the view back to the last saved heading
    setMode(m)
    scene?.setMode(m)
    setPicked(unit.floor ?? 0)
  }
  const toggleMode = () => go(mode === 'walk' ? 'orbit' : 'walk')
  // a flat picked in the Building view opens straight into its dollhouse once loaded
  useEffect(() => {
    if (ready && !entered && params.get('view') === 'dollhouse') enter()
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
  const remove = () => {
    if (!sel) return
    settle(pushStep(steps.current, deletePiece(steps.current.pieces, sel)), null)
    setSel(null)
  }
  /** the unit as arranged, deleted pieces out: what the first views frame */
  const shown = (): Unit => ({ ...unit, furniture: steps.current.pieces.some((p) => p.removed) ? steps.current.pieces.filter((p) => !p.removed) : steps.current.pieces })
  const toggleArrange = () => {
    stopPlacing()
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
  // ── the library: a picked piece follows the pointer (placePiece: the same rules as a move) until a click drops it
  const startPlacing = (assetId: string) => {
    stopPlacing()
    const id = core.newId()
    placing.current = { id, assetId, rot: 0, last: null }
    const ceiling = Math.max(...unit.walls.map((w) => w.heightM))
    scene?.setPlacing({ id, y: surfaceOf({ assetId }) === 'ceiling' ? ceiling : 0 })
    setAdding(false)
    setSel(null)
    showSel(null)
  }
  /** Esc, or done: the ghost goes (ponytail: a cancelled ghost stays in the scene graph, hidden, until the page reloads) */
  const stopPlacing = () => {
    if (!placing.current) return
    placing.current = null
    live.current = null
    scene?.setPlacing(null)
    scene?.placePieces(steps.current.pieces, true)
    showSel(null)
    redraw()
  }
  const previewPlacing = () => {
    const pl = placing.current
    if (!pl) return
    const at = pl.last && (pl.last.at ?? pl.last.wall?.p)
    const m = at && placePiece(unit, rooms, steps.current.pieces, pl.assetId, at, pl.rot, pl.id, pl.last!.wall)
    if (!m) {
      // the sky out of a window: nothing to put it on
      live.current = null
      scene?.placePieces(steps.current.pieces, true)
      showSel(null)
      return redraw()
    }
    live.current = m
    scene?.placePieces(m.furniture, true)
    showSel(m.piece, !!m.error)
    redraw()
  }
  const onArrange = (e: ArrangeEvent) => {
    const pl = placing.current
    if (pl && e.kind === 'drag' && e.id === pl.id) {
      pl.last = e
      return previewPlacing()
    }
    if (pl && e.kind === 'drop' && e.id === pl.id) {
      const m = live.current
      if (!m) return
      if (m.error) return showToast(m.error)
      placing.current = null
      live.current = null
      scene?.setPlacing(null)
      setSel(m.piece.id)
      return settle(pushStep(steps.current, m.furniture), m.piece.id)
    }
    if (e.kind === 'select') {
      // the piece clicked, so Delete takes just the TV off its unit; a drag of it moves what it rests on (dragTo)
      const p = pieceOf(e.id)
      setSel(p?.id ?? null)
      return showSel(p)
    }
    const m = live.current
    if (e.kind === 'drop') {
      live.current = null
      if (!m) return
      if (!m.error) return settle(pushStep(steps.current, m.furniture), m.piece.id)
      scene?.placePieces(steps.current.pieces, true) // springs back (chairs a resize added go)
      showSel(pieceOf(m.piece.id))
      return showToast(m.error)
    }
    const p = pieceOf(e.id)
    const next =
      e.kind === 'drag'
        ? dragTo(unit, rooms, steps.current.pieces, e.id, e)
        : p && resizePiece(unit, rooms, steps.current.pieces, e.id, { ...placementSize(p), [e.axis]: e.sizeM }, { x: e.axis === 'x' ? e.sign : 0, z: e.axis === 'z' ? e.sign : 0 })
    if (!next) return
    live.current = next
    scene?.placePieces(next.furniture, true) // the whole layout: a chair an earlier frame of this drag added goes again
    showSel(next.piece, !!next.error)
  }
  useEffect(() => scene?.onArrange(onArrange))

  // keys: Enter (load screen), O, F, C, Esc
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
      const pl = placing.current
      if (arranging && k === 'z' && (e.ctrlKey || e.metaKey)) {
        stopPlacing()
        undo()
      } else if (pl && k === 'r') {
        pl.rot += 90
        previewPlacing()
      } else if (arranging && k === 'r') turn()
      else if (arranging && !pl && (k === 'delete' || k === 'backspace')) remove()
      else if (arranging && k === 'escape') {
        stopPlacing()
        setAdding(false)
        setSel(null)
        showSel(null)
      } else if (k === 'o') toggleMode()
      else if (k === 'b' && stem) go('building')
      else if (k === 'f') setFinishesOpen((v) => !v)
      else if (k === 'c') setCommenting((v) => !v)
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
    setPins(readPins(unit.id))
    setDraft(null)
    setCommenting(false)
    setFinishesOpen(true)
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
  return (
    <div className={`viewer${commenting ? ' commenting' : ''}`}>
      <canvas ref={canvasRef} className={`scene${entered ? '' : ' blurred'}`} />

      {!entered && (
        <div className="load">
          <div className="project">{unit.projectName}</div>
          <div className="unit-name">{unit.name}</div>
          <div className="muted">
            {unit.floor !== undefined && `Floor ${unit.floor} · `}
            {unit.areaSqft} sqft · {sqm} m²
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
            {UNITS.map((u) => (
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
            floors={stem ? PICKER(unit) : null}
            picked={picked}
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
            placing={!!placing.current}
            onArrange={STAFF ? toggleArrange : null}
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
              {/* Notes first: a just-saved note must be visible without scrolling past the finishes */}
              <NotesList
                pins={pins}
                rooms={rooms}
                onFocus={focusPin}
                onRemove={(p) => {
                  removePin(unit.id, p.id)
                  setPins(readPins(unit.id))
                }}
              />
              <FinishesPanel
                slots={unit.finishSlots}
                cfg={cfg}
                onSelect={(slotId, optionId) => setCfg((c) => ({ ...c, [slotId]: optionId }))}
                onReset={() => setCfg({})}
              />
            </aside>
          )}
          {arranging && adding && <AddPanel onPick={startPlacing} />}
          {arranging && (
            <ArrangePanel
              piece={pieceOf(sel)}
              placing={placing.current && { label: placementLabel(placing.current), error: live.current?.error ?? null, ready: !!live.current }}
              adding={adding}
              canUndo={steps.current.past.length > 0}
              onTurn={turn}
              onDelete={remove}
              onUndo={() => {
                stopPlacing()
                undo()
              }}
              onReset={() => {
                stopPlacing()
                settle(pushStep(steps.current, base))
              }}
              onAdd={() => {
                stopPlacing()
                setAdding((v) => !v)
              }}
            />
          )}
          <SunPill
            hour={hour}
            northDeg={unit.northDeg}
            onChange={(h) => {
              setHour(h)
              scene.setTimeOfDay(h)
            }}
          />
          <PinLayer scene={scene} pins={pins} draft={draft} onSave={savePin} onCancel={() => setDraft(null)} />
        </>
      )}
    </div>
  )
}
