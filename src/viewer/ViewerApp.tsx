/**
 * Buyer-facing viewer (PRODUCT_SPEC §3): routing, load screen, HUD, finishes,
 * sun, comment pins, share, VR. No router lib, no state lib.
 * Routes: `/` → replaceState `/u/<first unit>`; `/u/preview` ← localStorage
 * `plotline.preview`; `/u/:id` by Unit.id or the JSON's filename stem.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import * as core from '../core'
import type { Configuration, Id, Pt, Room, Unit } from '../core'
import { furnish } from '../furnish/presets'
import { isUnit, normalizeUnit } from '../studio/model'
import { PlotlineScene, type PickHit, type SceneMode } from '../three/PlotlineScene'
import { TEST_UNIT } from '../three/testUnit'
import type { XRControls } from '../three/xr'
import FinishesPanel from './FinishesPanel'
import Hud from './Hud'
import { NotesList, PinLayer, type Draft } from './Notes'
import { entrySpawn, listedRooms, roomView, yawFor } from './spawn'
import SunPill from './SunPill'
import { decodeConfig, encodeConfig } from './share'
import { appendPin, readPins, removePin, type Pin } from './storage'
import './viewer.css'

const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Unit>
const UNITS = Object.entries(files).map(([path, unit]) => ({ stem: path.split('/').pop()!.replace(/\.json$/, ''), unit }))
if (!UNITS.length) UNITS.push({ stem: TEST_UNIT.id, unit: TEST_UNIT }) // dev only: no unit JSON on disk yet

const NOT_FOUND = "This unit isn't available. Ask your sales contact for a fresh link."
const NO_WEBGL = "This browser can't show 3D. Try Chrome or Edge on a PC."
const DEFAULT_HOUR = 15.5
const VR_FAILED = "Couldn't start VR. Is the headset connected?"

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

function resolveUnit(): Unit | null {
  const m = location.pathname.match(/^\/u\/([^/]+)/)
  if (!m) {
    history.replaceState(null, '', `/u/${UNITS[0].stem}${location.search}`)
    return UNITS[0].unit
  }
  const id = decodeURIComponent(m[1])
  if (id === 'preview') {
    try {
      const u = JSON.parse(localStorage.getItem('plotline.preview') ?? 'null')
      return isUnit(u) ? normalizeUnit(u) : null // a stale/garbage preview must not crash deriveRooms
    } catch {
      return null
    }
  }
  return UNITS.find((u) => u.stem === id || u.unit.id === id)?.unit ?? null
}

const spawn = (scene: PlotlineScene, p: Pt, face: Pt): void => scene.spawnAt(p, yawFor(face))
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
  const unit = useMemo(() => {
    const u = resolveUnit()
    return u && !u.furniture.length ? { ...u, furniture: furnish(u, core.deriveRooms(u)) } : u
  }, [])
  if (!unit) return <div className="boot">{NOT_FOUND}</div>
  if (!document.createElement('canvas').getContext('webgl2')) return <div className="boot">{NO_WEBGL}</div>
  return <Viewer unit={unit} />
}

function Viewer({ unit }: { unit: Unit }) {
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
        setDraft({ hit: { ...hit, roomId }, point: hit.point })
      } else if (modeRef.current === 'orbit' && hit.kind === 'floor') {
        // dollhouse → click a room floor drops back into walk mode there, keeping the orbit heading (§3.2)
        s.spawnAt({ x: hit.point.x, y: hit.point.z }, yawFor(headingOf(s)))
        setMode('walk')
      }
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
    const e = entrySpawn(unit, rooms)
    if (e) spawn(scene, e.p, e.face)
    scene.lockPointer()
  }

  const toggleMode = () => {
    const m: SceneMode = mode === 'walk' ? 'orbit' : 'walk'
    setMode(m)
    scene?.setMode(m)
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const share = () => {
    const url = `${location.origin}${location.pathname}?c=${encodeConfig(fullCfg)}`
    history.replaceState(null, '', url)
    void navigator.clipboard?.writeText(url).then(() => showToast('Link copied — it opens with exactly these finishes.'))
  }

  const toggleVR = () => void xr?.toggle().catch(() => showToast(VR_FAILED))

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
      if (k === 'o') toggleMode()
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
      anchor: { kind: hit.kind, entityId: hit.id, offset: hit.localOffset },
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
            Loading… {loaded} of {rooms.length} rooms
          </div>
          <button className="btn primary enter" disabled={!ready} onClick={enter}>
            Enter
          </button>
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
            finishesOpen={finishesOpen}
            commenting={commenting}
            locked={locked}
            onEnterVR={xr ? toggleVR : null}
            toast={toast}
            onJump={(r) => {
              const v = roomView(r, unit)
              spawn(scene, v.p, v.face)
              setMode('walk')
            }}
            onToggleMode={toggleMode}
            onToggleFinishes={() => setFinishesOpen((v) => !v)}
            onToggleComment={() => setCommenting((v) => !v)}
            onShare={share}
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
