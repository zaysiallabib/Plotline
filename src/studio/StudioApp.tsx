import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { deriveRooms, formatFeetInches, nearestWall, parseLength, roomAt, unitBounds, vertexById, wallFrame } from '../core'
import type { Id, Pt, RoomKind } from '../core'
import { draw, type Hit, type Hover } from './draw'
import { GRID_M, movePiece, pieceAt, pieceLabel, piecesOf, type Move } from './furniture'
import {
  entityPoints,
  formatTimer,
  guessKind,
  initialState,
  isUnit,
  normalizeUnit,
  openingAt,
  printedSizeOf,
  reducer,
  slug,
  studioIssues,
  wallLabelSides,
  type Draft,
  type StudioIssue,
  type StudioState,
  type Tool,
} from './model'
import { Panel, ROOM_KINDS, formatArea } from './Panel'
import { snapPoint } from './snap'
import { frameOf, mToPx, mToScreen, screenToM, screenToPx } from './transform'
import './studio.css'

const DRAFT_KEY = 'plotline.studio.draft'
const PREVIEW_KEY = 'plotline.preview'
const SNAP_PX = 10
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const TOOLS: [Tool, string, string][] = [
  ['select', 'V', 'Select'],
  ['scale', 'S', 'Scale'],
  ['wall', 'W', 'Wall'],
  ['opening', 'O', 'Opening'],
  ['room', 'R', 'Room'],
  ['furniture', 'F', 'Furniture'],
]
const HINTS: Record<Tool, string> = {
  furniture: 'Furniture · drag a piece to move it on the 1 ft grid, R turns it 90°, arrow keys move it one square',
  select: `Select · click to select, drag to move, arrow keys nudge 1" (Shift 1'), double-click a wall to set its length`,
  scale: 'Scale · click both ends of a printed dimension',
  wall: 'Wall · Click the first corner',
  opening: 'Opening · click a wall',
  room: 'Room · click inside a closed room',
}

interface Field {
  purpose: 'scale' | 'chain' | 'wall-length'
  x: number
  y: number
  len: string
  ang: string
  mode: 'length' | 'angle'
  error: string | null
  pxLen?: number
  wallId?: Id
}
interface Popover {
  x: number
  y: number
  sx: number
  sy: number
  name: string
  kind: RoomKind
  kindTouched: boolean
  printedSize: string
  areaSqm: number
  labelId?: Id
}
interface Note {
  text: string
  link?: { label: string; onClick: () => void }
}
/** `to`: a dragged piece's raw target centre (the drop re-runs the same snap in the reducer) */
type Drag = { hit: Hit; sx: number; sy: number; m: Pt; moved: boolean; orig: Map<Id, Pt>; to?: Pt }

/**
 * `/studio?unit=<stem|id>` (the viewer's "Edit plan"): open that unit from src/data/units instead of the draft.
 * Asks first when the draft holds anything but that unit untouched; drops the param so a reload keeps the edits.
 * Module level so StrictMode's double init never asks twice.
 */
const EDIT = ((): Draft['unit'] | null => {
  const q = new URLSearchParams(location.search).get('unit')
  const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Draft['unit']>
  const u = q && Object.entries(files).find(([path, x]) => path.endsWith(`/${q}.json`) || x.id === q)?.[1]
  if (!u) return null
  let d: { unit?: unknown } | null = null
  try {
    d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
  } catch {
    /* no usable draft */
  }
  const du = [d, d?.unit].find(isUnit) // a Draft or a bare Unit, as init() accepts
  if (du?.vertices.length && JSON.stringify(du) !== JSON.stringify(normalizeUnit(u)))
    if (!window.confirm(`Replace your Studio draft (${du.name || 'untitled unit'}) with ${u.name} as the viewer shows it? Export the draft first if you need it.`)) return null
  history.replaceState(null, '', '/studio')
  return u
})()

function init(): StudioState {
  const s = initialState()
  if (EDIT) return reducer(reducer(s, { type: 'load-unit', unit: EDIT }), { type: 'toast', text: `Editing ${EDIT.name} — Export saves a copy` })
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      // a full Draft, a bare `{ unit }`, or a Unit JSON pasted straight in — all restore
      const d = (isUnit(parsed) ? { unit: parsed } : parsed) as Partial<Draft> | null
      if (d && isUnit(d.unit)) return reducer(s, { type: 'restore', draft: d as Draft })
    }
  } catch {
    /* corrupt draft: start clean */
  }
  return s
}

const download = (name: string, text: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function StudioApp() {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  const [restored, setRestored] = useState<string | null>(() =>
    !EDIT && (state.unit.vertices.length || state.planImage) ? state.unit.name || 'untitled unit' : null,
  )
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [scaleStart, setScaleStart] = useState<Pt | null>(null)
  const [panning, setPanning] = useState(false)
  const [field, setField] = useState<Field | null>(null)
  const [popover, setPopover] = useState<Popover | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [missingPlan, setMissingPlan] = useState<string | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const jsonRef = useRef<HTMLInputElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const hoverRef = useRef<Hover | null>(null)
  hoverRef.current = hover
  const spaceRef = useRef(false)
  const shiftRef = useRef(false)
  const panRef = useRef<{ sx: number; sy: number; panX: number; panY: number } | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const lastPointer = useRef<{ sx: number; sy: number } | null>(null)
  const fitOnLoad = useRef(false)

  const { unit, view, tool, chain } = state
  const frame = useMemo(() => frameOf(view, unit.planImage), [view, unit.planImage])
  const { pxPerM } = frame
  const s = view.zoom * pxPerM
  const tolM = SNAP_PX / s
  const scaleSet = !!unit.planImage
  const rooms = useMemo(() => deriveRooms(unit), [unit])
  const issues = useMemo(() => studioIssues(unit, rooms), [unit, rooms])
  const labelSides = useMemo(() => wallLabelSides(unit, rooms), [unit, rooms])
  const errors = issues.filter((i) => i.level === 'error').length
  // furniture layer (tool F): the unit's pieces, else the preset layout; a drag's candidate layout lives here until the drop
  const pieces = useMemo(() => (tool === 'furniture' ? piecesOf(unit, rooms) : null), [tool, unit, rooms])
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  const [furnDrag, setFurnDrag] = useState<Move | null>(null)

  const toast = useCallback((text: string, link?: Note['link']) => setNote({ text, link }), [])
  const toM = useCallback((sx: number, sy: number): Pt => screenToM(frame, { x: sx, y: sy }), [frame])
  const toPx = useCallback((sx: number, sy: number): Pt => screenToPx(frame, { x: sx, y: sy }), [frame])
  const toScreen = useCallback((m: Pt): Pt => mToScreen(frame, m), [frame])
  const now = () => Date.now()

  // ----- reducer toasts → note
  useEffect(() => {
    if (state.toast) {
      setNote({ text: state.toast.text })
      dispatch({ type: 'clear-toast' })
    }
  }, [state.toast])
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), 5000)
    return () => clearTimeout(id)
  }, [note])

  // ----- plan image element
  useEffect(() => {
    if (!state.planImage) return setImg(null)
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => setImg(null)
    im.src = state.planImage.dataUrl
  }, [state.planImage])

  // ----- sizing
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback(
    (bounds?: { minX: number; minY: number; maxX: number; maxY: number }) => {
      const st = stateRef.current
      const { w, h } = size
      if (!w || !h) return
      let bx: { minX: number; minY: number; maxX: number; maxY: number } | null = null
      if (bounds) bx = bounds
      else if (st.planImage) bx = { minX: 0, minY: 0, maxX: st.planImage.naturalW, maxY: st.planImage.naturalH }
      else if (st.unit.vertices.length) {
        const f = frameOf(st.view, st.unit.planImage)
        const b = unitBounds(st.unit)
        const lo = mToPx(f, { x: b.minX, y: b.minY })
        const hi = mToPx(f, { x: b.maxX, y: b.maxY })
        bx = { minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y }
      }
      if (!bx) return
      const bw = Math.max(bx.maxX - bx.minX, 1)
      const bh = Math.max(bx.maxY - bx.minY, 1)
      const zoom = Math.min(w / bw, h / bh) * 0.9
      dispatch({
        type: 'set-view',
        view: { zoom, panX: (w - bw * zoom) / 2 - bx.minX * zoom, panY: (h - bh * zoom) / 2 - bx.minY * zoom },
      })
    },
    [size],
  )
  useEffect(() => {
    if (img && fitOnLoad.current) {
      fitOnLoad.current = false
      fitView()
    }
  }, [img, fitView])
  useEffect(() => {
    // first layout of a restored/empty studio: fit if the view is untouched
    if (size.w && view.zoom === 1 && view.panX === 0 && view.panY === 0) fitView()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w > 0, img])

  // ----- draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(size.w * dpr)) canvas.width = Math.round(size.w * dpr)
    if (canvas.height !== Math.round(size.h * dpr)) canvas.height = Math.round(size.h * dpr)
    const id = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d')
      const furniture = pieces ? { pieces, drag: furnDrag } : undefined
      if (ctx) draw({ ctx, width: size.w, height: size.h, dpr, state, img, rooms, labelSides, hover, scaleStart, frame, furniture })
    })
    return () => cancelAnimationFrame(id)
  }, [state, img, rooms, labelSides, hover, scaleStart, size, frame, pieces, furnDrag])

  // ----- draft persistence
  const saveDraft = useCallback(() => {
    const st = stateRef.current
    const d: Draft = { unit: st.unit, planImage: st.planImage, view: st.view, timer: st.timer }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    } catch {
      setNote({ text: 'Draft too large to autosave — export your JSON often.' })
    }
  }, [])
  useEffect(() => {
    const id = setTimeout(saveDraft, 400)
    return () => clearTimeout(id)
  }, [state.unit, state.planImage, state.view, saveDraft])

  // ----- timer
  useEffect(() => {
    const tick = () => dispatch({ type: 'timer-tick', now: now(), hidden: document.hidden })
    const id = setInterval(tick, 1000)
    const vis = () => {
      tick()
      saveDraft()
    }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('beforeunload', saveDraft)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('beforeunload', saveDraft)
    }
  }, [saveDraft])

  // ----- files
  const loadImage = useCallback(
    (file: File) => {
      const fail = () => toast("Couldn't open that image. Use PNG, JPG or WEBP under 10 MB.")
      if (file.size > MAX_IMAGE_BYTES || !/^image\/(png|jpeg|webp)$/.test(file.type)) return fail()
      const reader = new FileReader()
      reader.onerror = fail
      reader.onload = () => {
        const dataUrl = String(reader.result)
        const im = new Image()
        im.onerror = fail
        im.onload = () => {
          fitOnLoad.current = true
          setMissingPlan(null)
          dispatch({ type: 'set-plan-image', image: { dataUrl, naturalW: im.naturalWidth, naturalH: im.naturalHeight, name: file.name } })
        }
        im.src = dataUrl
      }
      reader.readAsDataURL(file)
    },
    [toast],
  )

  /** Exported JSON names its image (`img_3.webp` → /plans/, or an absolute public path); load it or show the "not found" prompt. */
  const loadPlanSrc = useCallback(
    (src: string) => {
      const url = src.startsWith('/') || /^(https?:|data:)/.test(src) ? src : `/plans/${src}`
      const im = new Image()
      im.onload = () => {
        setMissingPlan(null)
        fitOnLoad.current = true
        dispatch({ type: 'set-plan-image', image: { dataUrl: url, naturalW: im.naturalWidth, naturalH: im.naturalHeight, name: src } })
      }
      im.onerror = () => {
        dispatch({ type: 'set-plan-image', image: null })
        setMissingPlan(src)
        fitView()
      }
      im.src = url
    },
    [fitView],
  )

  const importJson = useCallback(
    async (file: File) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        parsed = null
      }
      if (!isUnit(parsed)) return toast('That file is not a Plotline unit')
      const u = normalizeUnit(parsed)
      dispatch({ type: 'load-unit', unit: u })
      const src = u.planImage?.src
      if (src && src !== stateRef.current.planImage?.name) loadPlanSrc(src)
      else if (!src) fitView()
    },
    [toast, fitView, loadPlanSrc],
  )
  // a restored draft that carries the exported `planImage.src` but no data URL: try the deployed image
  useEffect(() => {
    const st = stateRef.current
    if (!st.planImage && st.unit.planImage?.src) loadPlanSrc(st.unit.planImage.src)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0]
      if (!f) return
      if (f.name.endsWith('.json') || f.type === 'application/json') void importJson(f)
      else loadImage(f)
    },
    [importJson, loadImage],
  )

  const exportJson = useCallback(() => {
    const st = stateRef.current
    const traced = `Traced in ${formatTimer(st.timer.elapsedMs)}`
    const n = issues.filter((i) => i.level === 'error').length
    if (n && !window.confirm(`This unit has ${n} error${n === 1 ? '' : 's'}. Export anyway?\n${traced}`)) return
    console.log(`[plotline] ${traced} (${st.timer.elapsedMs} ms)`)
    const name = st.unit.name.trim() || 'Untitled unit'
    const out = { ...st.unit, name, planImage: st.unit.planImage && { ...st.unit.planImage, src: st.planImage?.name ?? st.unit.planImage.src } }
    download(`${slug(name)}.plotline.json`, JSON.stringify(out, null, 2))
    dispatch({ type: 'exported' })
    toast(traced)
  }, [issues, toast])

  const preview = useCallback(() => {
    if (errors) return
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(stateRef.current.unit))
    } catch {
      return toast('Draft too large to autosave — export your JSON often.')
    }
    const w = window.open('/u/preview', '_blank')
    if (!w) toast('Preview blocked by the browser.', { label: 'Open preview', onClick: () => window.open('/u/preview', '_blank') })
  }, [errors, toast])

  // ----- hit testing (screen px)
  const hitTest = useCallback(
    (sx: number, sy: number): Hit | null => {
      const u = stateRef.current.unit
      const m = toM(sx, sy)
      if (stateRef.current.tool === 'furniture') {
        const p = pieceAt(piecesRef.current ?? [], m)
        return p && { kind: 'furniture', id: p.id }
      }
      for (const v of u.vertices) {
        const p = toScreen(v)
        if (Math.hypot(p.x - sx, p.y - sy) <= 8) return { kind: 'vertex', id: v.id }
      }
      for (const w of u.walls) {
        const f = wallFrame(w, u.vertices)
        const du = (m.x - f.origin.x) * f.dir.x + (m.y - f.origin.y) * f.dir.y
        const dv = Math.abs((m.x - f.origin.x) * f.normal.x + (m.y - f.origin.y) * f.normal.y)
        if (dv > Math.max(w.thicknessM / 2, 6 / s)) continue
        for (const o of w.openings) if (du >= o.offsetM && du <= o.offsetM + o.widthM) return { kind: 'opening', id: o.id }
      }
      for (const l of u.roomLabels) {
        const p = toScreen(l)
        if (Math.abs(p.x - sx) <= 40 && sy >= p.y - 14 && sy <= p.y + 18) return { kind: 'label', id: l.id }
      }
      const nw = nearestWall(m, u)
      if (nw && nw.distanceM <= Math.max(nw.wall.thicknessM / 2, 5 / s)) return { kind: 'wall', id: nw.wall.id }
      return null
    },
    [toM, toScreen, s],
  )

  const computeHover = useCallback(
    (sx: number, sy: number, shift: boolean): Hover => {
      const st = stateRef.current
      const m = toM(sx, sy)
      let px = toPx(sx, sy)
      if (st.tool === 'wall' && st.unit.planImage) {
        const from = st.chain ? vertexById(st.unit.vertices, st.chain.ids[st.chain.ids.length - 1]) : undefined
        return { m, px, snap: snapPoint(m, st.unit, { tolM: SNAP_PX / s, from, free: shift }), hit: null }
      }
      if (st.tool === 'scale') {
        if (scaleStart && !shift) {
          const dx = px.x - scaleStart.x
          const dy = px.y - scaleStart.y
          px = Math.abs(dx) > Math.abs(dy) ? { x: px.x, y: scaleStart.y } : { x: scaleStart.x, y: px.y }
        }
        return { m, px, snap: null, hit: null }
      }
      if (st.tool === 'opening' && st.unit.planImage) {
        const nw = nearestWall(m, st.unit)
        const ghost =
          nw && nw.distanceM <= Math.max(SNAP_PX / s, nw.wall.thicknessM)
            ? { wallId: nw.wall.id, t: nw.t, ...openingAt(st.unit, nw.wall, nw.t, st.lastOpeningKind, SNAP_PX / s, rooms) }
            : undefined
        return { m, px, snap: null, hit: hitTest(sx, sy), ghost }
      }
      return { m, px, snap: null, hit: hitTest(sx, sy) }
    },
    [toM, toPx, s, scaleStart, hitTest, rooms],
  )

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  const openPopover = useCallback(
    (m: Pt, sx: number, sy: number, labelId?: Id) => {
      const st = stateRef.current
      const existing = labelId ? st.unit.roomLabels.find((l) => l.id === labelId) : undefined
      const r = roomAt(existing ?? m, rooms, st.unit)
      if (!r && !existing) return toast('Click inside a closed room. Is a corner not joined?')
      setPopover({
        x: existing?.x ?? m.x,
        y: existing?.y ?? m.y,
        sx,
        sy,
        name: existing?.name ?? '',
        kind: existing?.kind ?? 'other',
        kindTouched: !!existing,
        printedSize: existing?.printedSize ?? (r ? printedSizeOf(r, st.unit) : ''),
        areaSqm: r?.areaSqm ?? 0,
        labelId,
      })
    },
    [rooms, toast],
  )

  // ----- pointer events
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
    // take focus off the top-bar inputs; the field/popover effects below re-focus their input after render.
    // The canvas's onMouseDown preventDefault keeps the browser from moving focus back to <body>.
    canvasRef.current?.focus()
    // Pan (Figma-style): Space+drag, or the middle / right button, in any tool.
    if (e.button === 1 || e.button === 2 || spaceRef.current) {
      panRef.current = { sx, sy, panX: view.panX, panY: view.panY }
      setPanning(true)
      return
    }
    if (e.button !== 0) return
    if (field) setField(null)
    if (popover) setPopover(null)
    dispatch({ type: 'timer-input', now: now() })
    const m = toM(sx, sy)
    // Recompute from the event: the `hover` state may still be the previous position when a
    // click follows the move within the same frame (React defers pointermove renders).
    const h = computeHover(sx, sy, e.shiftKey)
    switch (tool) {
      case 'scale': {
        if (!state.planImage) return toast('Load a plan image first')
        dispatch({ type: 'timer-start', now: now() })
        if (!scaleStart) return setScaleStart(h.px)
        const end = h.px
        const pxLen = Math.hypot(end.x - scaleStart.x, end.y - scaleStart.y)
        if (pxLen < 2) return
        setScaleStart(null)
        setField({ purpose: 'scale', x: sx, y: sy, len: '', ang: '', mode: 'length', error: null, pxLen })
        return
      }
      case 'wall': {
        if (!scaleSet) return toast('Set the scale first (S)')
        const snap = h.snap ?? snapPoint(m, unit, { tolM, free: e.shiftKey })
        const at = { x: snap.x, y: snap.y, tolM }
        dispatch(chain ? { type: 'chain-add', at } : { type: 'chain-start', at })
        return
      }
      case 'opening': {
        if (!scaleSet) return toast('Set the scale first (S)')
        if (!h.ghost) return toast('Click on a wall')
        dispatch({ type: 'add-opening', wallId: h.ghost.wallId, t: h.ghost.t, tolM })
        return
      }
      case 'room': {
        if (!scaleSet) return toast('Set the scale first (S)')
        const hit = hitTest(sx, sy)
        openPopover(m, sx, sy, hit?.kind === 'label' ? hit.id : undefined)
        return
      }
      case 'select': {
        const hit = hitTest(sx, sy)
        if (!hit) {
          if (!e.shiftKey) dispatch({ type: 'select', ids: [] })
          return
        }
        const orig = new Map<Id, Pt>()
        if (hit.kind === 'wall') {
          const w = unit.walls.find((x) => x.id === hit.id)!
          for (const id of [w.a, w.b]) orig.set(id, { ...vertexById(unit.vertices, id) })
        }
        dragRef.current = { hit, sx, sy, m, moved: false, orig }
        if (!e.shiftKey && !state.selection.includes(hit.id)) dispatch({ type: 'select', ids: [hit.id] })
        return
      }
      case 'furniture': {
        const hit = hitTest(sx, sy)
        const p = hit && piecesRef.current?.find((x) => x.id === hit.id)
        dispatch({ type: 'select', ids: p ? [p.id] : [] })
        if (hit && p) dragRef.current = { hit, sx, sy, m, moved: false, orig: new Map([[p.id, { x: p.x, y: p.y }]]) }
      }
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { sx, sy } = local(e)
    lastPointer.current = { sx, sy }
    if (panRef.current) {
      const p = panRef.current
      dispatch({ type: 'set-view', view: { ...view, panX: p.panX + sx - p.sx, panY: p.panY + sy - p.sy } })
      return
    }
    const fd = dragRef.current
    if (fd?.hit.kind === 'furniture') {
      // a piece follows the pointer on the grid; the reducer only sees the drop (one undo entry, refusals spring back)
      if (!fd.moved && Math.hypot(sx - fd.sx, sy - fd.sy) < 3) return
      fd.moved = true
      const m = toM(sx, sy)
      const o = fd.orig.get(fd.hit.id)!
      const p = pieces?.find((x) => x.id === fd.hit.id)
      fd.to = { x: o.x + m.x - fd.m.x, y: o.y + m.y - fd.m.y }
      if (p && pieces) setFurnDrag(movePiece(unit, rooms, pieces, p.id, fd.to, p.rotationDeg))
      return
    }
    const d = dragRef.current
    if (d) {
      if (!d.moved) {
        if (Math.hypot(sx - d.sx, sy - d.sy) < 3) return
        d.moved = true
        dispatch({ type: 'drag-begin' })
      }
      const m = toM(sx, sy)
      if (d.hit.kind === 'vertex') {
        const snap = snapPoint(m, unit, { tolM, exclude: [d.hit.id] })
        dispatch({ type: 'drag', vertices: [{ id: d.hit.id, x: snap.x, y: snap.y }] })
        setHover({ m, px: toPx(sx, sy), snap, hit: d.hit })
      } else if (d.hit.kind === 'wall') {
        const dx = m.x - d.m.x
        const dy = m.y - d.m.y
        dispatch({ type: 'drag', vertices: [...d.orig].map(([id, p]) => ({ id, x: p.x + dx, y: p.y + dy })) })
      } else if (d.hit.kind === 'opening') {
        const w = unit.walls.find((x) => x.openings.some((o) => o.id === d.hit.id))
        const o = w?.openings.find((x) => x.id === d.hit.id)
        if (w && o) {
          const f = wallFrame(w, unit.vertices)
          const u = (m.x - f.origin.x) * f.dir.x + (m.y - f.origin.y) * f.dir.y
          dispatch({ type: 'drag-opening', id: o.id, offsetM: u - o.widthM / 2, tolM })
        }
      } else if (d.hit.kind === 'label') {
        dispatch({ type: 'drag-label', id: d.hit.id, x: m.x, y: m.y })
      }
      return
    }
    setHover(computeHover(sx, sy, e.shiftKey))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) setPanning(false)
    panRef.current = null
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) {
      if (e.shiftKey) dispatch({ type: 'select', ids: [d.hit.id], add: true })
      else dispatch({ type: 'select', ids: [d.hit.id] })
    } else if (d.hit.kind === 'vertex' || d.hit.kind === 'wall') {
      // a corner dropped on another corner becomes that corner
      dispatch({ type: 'drag-end', ids: d.hit.kind === 'vertex' ? [d.hit.id] : [...d.orig.keys()] })
    } else if (d.hit.kind === 'furniture' && d.to) {
      setFurnDrag(null)
      dispatch({ type: 'move-piece', id: d.hit.id, ...d.to })
    }
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'wall') return
    const { sx, sy } = local(e)
    const hit = hitTest(sx, sy)
    if (hit?.kind !== 'wall') return
    const w = unit.walls.find((x) => x.id === hit.id)!
    const len = wallFrame(w, unit.vertices).lengthM
    dispatch({ type: 'select', ids: [w.id] })
    setField({ purpose: 'wall-length', wallId: w.id, x: sx, y: sy, len: formatFeetInches(len), ang: '', mode: 'length', error: null })
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { sx, sy } = local(e)
      const st = stateRef.current.view
      const k = Math.exp(-e.deltaY * 0.0015)
      const zoom = Math.min(20, Math.max(0.02, st.zoom * k))
      const r = zoom / st.zoom
      dispatch({ type: 'set-view', view: { zoom, panX: sx - (sx - st.panX) * r, panY: sy - (sy - st.panY) * r } })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  // ----- inline field
  useEffect(() => {
    if (field) fieldRef.current?.focus()
  }, [field?.purpose, field?.mode])

  const currentDirDeg = useCallback((): number => {
    const st = stateRef.current
    if (!st.chain) return 0
    const ids = st.chain.ids
    const last = vertexById(st.unit.vertices, ids[ids.length - 1])
    const h = hoverRef.current
    if (h?.snap?.angleDeg !== undefined && Math.hypot(h.m.x - last.x, h.m.y - last.y) > SNAP_PX / s) return h.snap.angleDeg
    if (ids.length >= 2) {
      const prev = vertexById(st.unit.vertices, ids[ids.length - 2])
      return ((Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI + 360) % 360
    }
    return 0
  }, [s])

  const confirmField = () => {
    if (!field) return
    const m = parseLength(field.len)
    if (m == null) return setField({ ...field, error: 'Try 14\'-5", 14.4 or 4.4m' })
    if (m <= 0 || m > 100) return setField({ ...field, error: 'That length looks wrong' })
    if (field.purpose === 'scale' && field.pxLen) {
      if (unit.walls.length && unit.planImage && !window.confirm('Changing scale after tracing moves the image under your walls. Continue?')) {
        return setField(null)
      }
      dispatch({ type: 'set-scale', pxPerM: field.pxLen / m })
    } else if (field.purpose === 'chain') {
      const ang = field.ang.trim() === '' ? currentDirDeg() : Number(field.ang)
      if (!Number.isFinite(ang)) return setField({ ...field, error: 'Angle in degrees, 0 = right' })
      dispatch({ type: 'chain-typed', lengthM: m, dirDeg: ang, tolM })
    } else if (field.purpose === 'wall-length' && field.wallId) {
      dispatch({ type: 'set-wall-length', id: field.wallId, lengthM: m })
    }
    dispatch({ type: 'timer-input', now: now() })
    setField(null)
  }

  // ----- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'
      const st = stateRef.current
      const ctrl = e.ctrlKey || e.metaKey
      if (e.key === 'Shift') {
        shiftRef.current = true
        if (lastPointer.current && !typing) setHover(computeHover(lastPointer.current.sx, lastPointer.current.sy, true))
      }
      if (ctrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        return exportJson()
      }
      if (ctrl && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault()
        return jsonRef.current?.click()
      }
      if (typing) return
      dispatch({ type: 'timer-input', now: now() })
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        return dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        return dispatch({ type: 'redo' })
      }
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        return dispatch({ type: 'duplicate-label' })
      }
      if (ctrl) return
      const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]
      // furniture tool: arrows move the selected piece one grid square, R turns it; Delete / T / H never touch a piece
      if (st.tool === 'furniture') {
        const p = piecesRef.current?.find((x) => st.selection.includes(x.id))
        if (arrow) {
          e.preventDefault()
          if (p) dispatch({ type: 'move-piece', id: p.id, x: p.x + arrow[0] * GRID_M, y: p.y + arrow[1] * GRID_M })
          return
        }
        if (e.key === 'r' || e.key === 'R') return p && dispatch({ type: 'rotate-piece', id: p.id })
        if (['Delete', 't', 'T', 'h', 'H'].includes(e.key)) return
      }
      if (arrow) {
        e.preventDefault() // never scroll the page or the panel
        const step = e.shiftKey ? 0.3048 : 0.0254 // 1' / 1"; no snapPoint: a 10 px snap would swallow a 1" step
        if (st.selection.length) dispatch({ type: 'nudge', dx: arrow[0] * step, dy: arrow[1] * step })
        return
      }
      if (e.key === ' ') {
        spaceRef.current = true
        e.preventDefault()
        return
      }
      if (e.key === 'Escape') {
        if (popover) return setPopover(null)
        if (st.chain) return dispatch({ type: 'chain-end' })
        setScaleStart(null)
        return dispatch({ type: 'select', ids: [] })
      }
      const key = e.key.toLowerCase()
      const toolKey = TOOLS.find(([, k]) => k.toLowerCase() === key)
      if (toolKey && !e.shiftKey) {
        const tl = toolKey[0]
        if (tl !== 'select' && tl !== 'scale' && !st.unit.planImage) return setNote({ text: 'Set the scale first (S)' })
        setScaleStart(null)
        return dispatch({ type: 'set-tool', tool: tl })
      }
      if (key === 't') return dispatch({ type: 'toggle-thickness' })
      if (key === 'h') return dispatch({ type: 'flip', what: e.shiftKey ? 'swing' : 'hinge' })
      if (e.key === 'Backspace') {
        if (st.chain) dispatch({ type: 'chain-back' })
        return
      }
      if (e.key === 'Delete') {
        const sel = new Set(st.selection)
        const orphaned = st.unit.walls
          .filter((w) => sel.has(w.a) || sel.has(w.b) || sel.has(w.id))
          .reduce((n, w) => n + w.openings.filter((o) => !sel.has(o.id)).length, 0)
        if (orphaned && !window.confirm(`This also removes ${orphaned} opening${orphaned === 1 ? '' : 's'}. Continue?`)) return
        return dispatch({ type: 'delete' })
      }
      if (e.key === '0') return fitView()
      if (/^[0-9.]$/.test(e.key) && st.chain && st.tool === 'wall') {
        e.preventDefault()
        const p = lastPointer.current ?? { sx: size.w / 2, sy: size.h / 2 }
        setField({ purpose: 'chain', x: p.sx, y: p.sy, len: e.key, ang: '', mode: 'length', error: null })
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key === 'Shift') {
        shiftRef.current = false
        const t = e.target as HTMLElement
        if (lastPointer.current && t.tagName !== 'INPUT') setHover(computeHover(lastPointer.current.sx, lastPointer.current.sy, false))
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [exportJson, fitView, computeHover, popover, size])

  // ----- issues → pan/zoom/select
  const focusIssue = (i: StudioIssue) => {
    const pts = i.ids.flatMap((id) => entityPoints(unit, id))
    const selectable = i.ids.filter((id) => !id.startsWith('space-'))
    dispatch({ type: 'select', ids: selectable })
    if (!pts.length) return
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const lo = mToPx(frame, { x: Math.min(...xs) - 2, y: Math.min(...ys) - 2 }) // 2 m of context around the issue
    const hi = mToPx(frame, { x: Math.max(...xs) + 2, y: Math.max(...ys) + 2 })
    fitView({ minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y })
  }

  const savePopover = () => {
    if (!popover) return
    const name = popover.name.trim() || 'Room'
    const label = { name, kind: popover.kind, x: popover.x, y: popover.y, printedSize: popover.printedSize.trim() || undefined }
    if (popover.labelId) dispatch({ type: 'update-label', id: popover.labelId, patch: label })
    else dispatch({ type: 'add-label', label })
    setPopover(null)
  }

  const startOver = () => {
    localStorage.removeItem(DRAFT_KEY)
    dispatch({ type: 'reset' })
    setRestored(null)
    setMissingPlan(null)
  }

  // ----- status text
  const hint =
    (chain
      ? chain.ids.length >= 3
        ? 'Wall · Click the start corner to close'
        : 'Wall · Click the next corner, or type its printed length'
      : tool === 'scale' && scaleStart
        ? 'Scale · click the other end'
        : HINTS[tool]) +
    (tool === 'select' || tool === 'furniture' ? '' : ' · V to move things') +
    ' · Space-drag to pan · wheel zooms'
  let centre = ''
  if (chain && hover?.snap) {
    const last = vertexById(unit.vertices, chain.ids[chain.ids.length - 1])
    const len = Math.hypot(hover.snap.x - last.x, hover.snap.y - last.y)
    const ang = hover.snap.angleDeg ?? 0
    const snapped = hover.snap.kind === 'wall' ? 'wall — will split' : hover.snap.kind
    centre = `${formatFeetInches(len)} · ${len.toFixed(2)} m · ${shiftRef.current ? 'free' : `${Math.round(ang)}°`} · snapped: ${snapped}`
  } else if (tool === 'scale' && scaleStart && hover) {
    centre = `${Math.round(Math.hypot(hover.px.x - scaleStart.x, hover.px.y - scaleStart.y))} px`
  } else if (tool === 'opening' && hover?.ghost) {
    const g = hover.ghost
    const why = g.error ?? (g.snapped && `snapped: ${g.snapped === 'corner' ? 'corner' : `next to ${g.snapped}`}`)
    centre = why ? `${formatFeetInches(g.opening.widthM)} · ${why}` : formatFeetInches(g.opening.widthM)
  } else if (furnDrag) {
    centre = `${pieceLabel(furnDrag.piece)} · ${furnDrag.error ?? `snapped: ${furnDrag.snapped === 'wall' ? 'wall' : '1 ft grid'}`}`
  } else if (hover?.hit?.kind === 'furniture') {
    const p = pieces?.find((x) => x.id === hover.hit!.id)
    centre = p ? pieceLabel(p) : ''
  } else if (hover?.hit) centre = hover.hit.kind
  const scaleText = unit.planImage ? `1 px = ${(1 / unit.planImage.pxPerM).toFixed(4)} m` : 'Scale not set'

  const meta = (k: 'name' | 'projectName' | 'floor' | 'areaSqft') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    dispatch({
      type: 'set-meta',
      patch: k === 'floor' ? { floor: v === '' ? undefined : Number(v) } : k === 'areaSqft' ? { areaSqft: Number(v) || 0 } : { [k]: v },
    })
  }

  return (
    <div
      className="studio"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onFiles(e.dataTransfer.files)
      }}
    >
      <header className="topbar">
        <span className="brand">
          <a href="/" title="Open the buyer viewer">Plotline</a> <span className="muted">/ Studio</span>
        </span>
        <input className="meta wide" placeholder="Unit name" value={unit.name} onChange={meta('name')} />
        <input className="meta" placeholder="Project" value={unit.projectName} onChange={meta('projectName')} />
        <input className="meta narrow" placeholder="Floor" type="number" value={unit.floor ?? ''} onChange={meta('floor')} />
        <input className="meta narrow" placeholder="Area (sqft)" type="number" value={unit.areaSqft || ''} onChange={meta('areaSqft')} />
        <span className="timer" title="Minutes to trace">
          ⏱ {formatTimer(state.timer.elapsedMs)}
        </span>
        <span className="grow" />
        <button disabled={!state.history.past.length} onClick={() => dispatch({ type: 'undo' })}>
          Undo
        </button>
        <button disabled={!state.history.future.length} onClick={() => dispatch({ type: 'redo' })}>
          Redo
        </button>
        <span className="sep" />
        <button onClick={() => jsonRef.current?.click()}>Import</button>
        <button onClick={exportJson}>Export</button>
        <button className="primary" disabled={errors > 0} title={errors ? 'Fix the errors first' : undefined} onClick={preview}>
          Preview 3D
        </button>
        <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFiles(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onFiles(e.target.files)} />
      </header>

      <div className="main">
        <div className="canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            tabIndex={-1}
            style={{ width: size.w, height: size.h, cursor: panning ? 'grabbing' : tool === 'select' || tool === 'furniture' ? 'default' : 'crosshair' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onMouseDown={(e) => e.preventDefault()} // no middle-click autoscroll, no focus steal from a field opened by this click
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="tools">
            {TOOLS.map(([t, k, label]) => {
              const locked = t !== 'select' && t !== 'scale' && !scaleSet
              return (
                <button
                  key={t}
                  className={tool === t ? 'on' : ''}
                  disabled={locked}
                  title={locked ? 'Set the scale first (S)' : `${label} (${k})`}
                  onClick={() => {
                    setScaleStart(null)
                    dispatch({ type: 'set-tool', tool: t })
                  }}
                >
                  {k}
                </button>
              )
            })}
          </div>
          {!state.planImage && (
            <div className="empty">
              <p>{missingPlan ? `Plan image not found — drop \`${missingPlan}\` here to trace over it` : 'Drop the floor plan here (PNG, JPG, WEBP)'}</p>
              <button className="primary" onClick={() => fileRef.current?.click()}>
                Choose plan image…
              </button>
            </div>
          )}
          {field && (
            <div className="field" style={{ left: Math.max(0, Math.min(field.x + 12, size.w - 180)), top: Math.max(0, Math.min(field.y + 12, size.h - 90)) }}>
              <label>{field.purpose === 'scale' ? 'Printed length' : field.mode === 'angle' ? 'Angle (°)' : 'Length'}</label>
              <input
                ref={fieldRef}
                className={field.error ? 'bad' : ''}
                placeholder={field.mode === 'angle' ? '90' : "14'-0\""}
                value={field.mode === 'angle' ? field.ang : field.len}
                onChange={(e) => setField({ ...field, [field.mode === 'angle' ? 'ang' : 'len']: e.target.value, error: null })}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') confirmField()
                  else if (e.key === 'Escape') setField(null)
                  else if (e.key === 'Tab' && field.purpose === 'chain') {
                    e.preventDefault()
                    setField({ ...field, mode: field.mode === 'angle' ? 'length' : 'angle' })
                  }
                }}
              />
              {field.error && <span className="err">{field.error}</span>}
            </div>
          )}
          {popover && (
            <div className="popover" style={{ left: Math.min(popover.sx + 12, size.w - 280), top: Math.min(popover.sy + 12, size.h - 220) }}>
              <label>
                <span>Room name</span>
                <input
                  autoFocus
                  value={popover.name}
                  onChange={(e) =>
                    setPopover({ ...popover, name: e.target.value, kind: popover.kindTouched ? popover.kind : guessKind(e.target.value) })
                  }
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') savePopover()
                    if (e.key === 'Escape') setPopover(null)
                  }}
                />
              </label>
              <label>
                <span>Kind</span>
                <select value={popover.kind} onChange={(e) => setPopover({ ...popover, kind: e.target.value as RoomKind, kindTouched: true })}>
                  {ROOM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Printed size</span>
                <input
                  value={popover.printedSize}
                  onChange={(e) => setPopover({ ...popover, printedSize: e.target.value })}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter') savePopover()
                  }}
                />
              </label>
              <p className="muted">{formatArea(popover.areaSqm)}</p>
              <div className="actions">
                <button className="primary" onClick={savePopover}>
                  Save
                </button>
                {popover.labelId && (
                  <button
                    onClick={() => {
                      dispatch({ type: 'delete', ids: [popover.labelId!] })
                      setPopover(null)
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
          {restored && (
            <div className="toast">
              Draft restored — {restored}
              <button className="link" onClick={startOver}>
                Start over
              </button>
              <button className="link" onClick={() => setRestored(null)}>
                ×
              </button>
            </div>
          )}
          {note && (
            <div className="toast">
              {note.text}
              {note.link && (
                <button className="link" onClick={note.link.onClick}>
                  {note.link.label}
                </button>
              )}
            </div>
          )}
        </div>
        <Panel state={state} dispatch={dispatch} rooms={rooms} issues={issues} onFocusIssue={focusIssue} pieces={pieces} />
      </div>

      <footer className="statusbar">
        <span>{hint}</span>
        <span className="centre">{centre}</span>
        <span>
          {scaleText} · {Math.round(view.zoom * 100)} %
        </span>
      </footer>
    </div>
  )
}
