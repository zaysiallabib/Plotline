import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { deriveFlats, deriveRooms, formatFeetInches, nearestWall, newId, parseLength, pillarCorners, roomAt, unitBounds, vertexById, wallFrame } from '../core'
import type { Id, OpeningKind, Pt, RoomKind, Site, Slope, Unit } from '../core'
import { draw, wallFaceDots, type Hit, type Hover } from './draw'
import { GRID_M, movePiece, pieceAt, pieceLabel, placePiece, layoutFor, resizePiece, sideDots, type Move } from './furniture'
import { placementSize } from '../furnish/kit'
import {
  PILLAR_M,
  WALL_TYPES,
  arcPoints,
  dirDegOf,
  entityPoints,
  findEntity,
  formatTimer,
  guessKind,
  initialState,
  isUnit,
  lengthMoves,
  normalizeUnit,
  openingAt,
  rampArrow,
  rampDirs,
  reducer,
  slug,
  snapRampDir,
  studioIssues,
  wallLabelSides,
  type Draft,
  type StudioState,
  type Target,
  type Tool,
} from './model'
import { AI_KEY, ANSWERS_KEY, LOOKS_RIGHT, SHOW_ME, STRIPS_KEY, TRACKER_KEY, answerId, logAnswer, openReview, studioReducer } from './review'
import type { AutoTraceResult, Gray } from '../trace/types'
import type { Preview, TraceIn, TraceJob, TraceMsg } from './autotrace.worker'
import type { FixesIn, FixesOut } from './fixes.worker'
import { KindSelect, LevelFields, Panel, WALL_KEYS, formatArea } from './Panel'
import { IssueLayer } from './IssueLayer'
import { fixSig, leaksAround, markIssues, rowAnswers, type Fix, type Mark, type MarkFixes } from './issues'
import { UNTRUSTED, askRow, rowPicture, type AiNote } from './localAI'
import { ProjectPanel } from './ProjectPanel'
import { NorthArrow, SitePanel } from './SitePanel'
import { FloorList, NewProject } from './FloorList'
import { getPicture, putPicture } from './pictures'
import { newProject, projectTower, readProjects, saveProjects, slotsOf, syncUnit, type Project, type ProjectPlan } from '../data/building/projects'
import { floorIn, roleIn, stemIn } from '../data/building'
import { HARD, snapMove, snapPoint, type Snap } from './snap'
import { STAFF_KEY, baseOf, readLayout, saveLayout } from '../viewer/arrange'
import { RpcError, configured as sharingConfigured, publishUnit } from '../lib/supabase'
import { fitSheet, frameOf, mToPx, mToScreen, screenToM, screenToPx } from './transform'
import './studio.css'

const DRAFT_KEY = 'plotline.studio.draft'
const PREVIEW_KEY = 'plotline.preview'
/**
 * The project open in the Studio (its id: `plotline.studio.project`) and which of its drawings the Studio holds, whatever
 * the unit's id became (an auto-trace gives a new one). The drawing is kept in the draft itself (`drawing`): a draft
 * replaced from elsewhere (Edit plan, the 3D view's Edit openings) is never written into a project drawing.
 */
const ACTIVE_KEY = 'plotline.studio.project'
type Active = { id: Id; drawing?: Id }
/** the staff key that lets this browser publish share links (from the migration's output); asked for once */
const PUBLISH_KEY = 'plotline.staffKey'
const SNAP_PX = 7 // was 10: founder 2026-10-06, "30 % less magnetic"
/** a press on a piece that drifts at most this far is a click (tool F): it selects, never moves; the 3D view uses the same (PlotlineScene) */
const CLICK_PX = 6
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const TOOLS: [Tool, string, string][] = [
  ['select', 'V', 'Select'],
  ['scale', 'S', 'Scale'],
  ['wall', 'W', 'Wall'],
  ['arc', 'A', 'Arc'],
  ['opening', 'O', 'Opening'],
  ['room', 'R', 'Room'],
  ['pillar', 'C', 'Column'],
  ['furniture', 'F', 'Furniture'],
]
const HINTS: Record<Tool, string> = {
  pillar: `Column · click = a 12" × 20" column (snaps to walls and corners), drag = its size · drag a column to move it, a side dot to move that side, a corner dot to move that corner alone (a tapered column)`,
  arc: 'Arc · click where the curved wall starts',
  furniture: 'Furniture · drag a piece to move it on the 3" grid, R turns it 90°, arrow keys move it one square; Add a piece from the panel',
  select: `Select · drag to move (Shift: no snap), drag a selected wall's or opening's end handle to resize it (Alt: neighbours follow), Ctrl+D copies, Del deletes, arrows nudge 1" (Shift 1') · hold W + drag = a wall, hold O / R + click`,
  scale: `Scale · click both ends of anything whose real length you know: a printed size, the plot's width, a parking bay (about 8' × 16'), a door (about 3'-3")`,
  wall: 'Wall · click the first corner, or drag from corner to corner',
  opening: "Opening · pick it on the right (1 door, 2 window, 3 slider, 4 passage), click a wall · drag a selected opening's end to resize",
  room: 'Room · click inside a closed room',
}
/** Spring-loaded tools: hold the key, act, release = back to the tool before (a tap still just switches) */
const HOLD_HINTS: Record<string, string> = {
  w: 'drag from corner to corner to draw one wall',
  o: 'click a wall to add the picked opening (1–4 switch kind)',
  r: 'click inside a room to name it',
}
/** O tool (or held O): these keys pick the kind at its default width */
const OPENING_KEYS: Record<string, OpeningKind> = { 1: 'door', 2: 'window', 3: 'slider', 4: 'passage' }
/** a held tool key: the tool and selection to go back to, `used` = a pointer action happened, `up` = released mid wall-drag */
interface Hold {
  key: string
  tool: Tool
  selection: Id[]
  used: boolean
  up?: boolean
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
  levelM?: number
  slope?: Slope
  /** the ramp's four quick directions (model.rampDirs) */
  dirs: number[]
}
interface Note {
  text: string
  link?: { label: string; onClick: () => void }
}
/** `end`: an opening's end handle (resize); `corner`: a column's corner dot k (that corner alone) or side k; `face`: a wall's face dot (its thickness, that side); `aim`: a ramp arrow's head */
type Drag = { hit: Hit; sx: number; sy: number; m: Pt; moved: boolean; orig: Map<Id, Pt>; end?: 'a' | 'b'; corner?: { k: number; side: boolean }; face?: 1 | -1; aim?: boolean } & CornerDrag
/**
 * Select drags of corners/walls: `lengthOf` = resizing that selected wall by its end — the end leaves a shared corner on the
 * first move and slides along the wall alone, unless `rigid` (Alt: the walls at the corner stay straight, model.lengthMoves);
 * `detach` = Alt on a corner of an unselected wall (pulls one wall free); `ids` = the corners the drop joins
 */
type CornerDrag = { lengthOf?: Id; rigid?: boolean; detach?: boolean; ids?: Id[] }
const loose = (p: Pt): Snap => ({ x: p.x, y: p.y, kind: 'free', guides: [] })

// the Studio's user is staff: the viewer shows them its Arrange button from now on (arrange.ts isStaff)
try {
  localStorage.setItem(STAFF_KEY, '1')
} catch {
  /* storage blocked */
}
/** The furniture layout arranged in this browser (viewer Arrange / tool F, `plotline.layout.<unit id>`) replaces the unit's own. */
const withLayout = <U extends Draft['unit']>(u: U): U => ({ ...u, furniture: readLayout(u.id) ?? u.furniture })

/**
 * `/studio?unit=<stem|id>` (the viewer's "Edit plan"): open that unit from src/data/units instead of the draft.
 * Asks first when the draft holds anything but that unit untouched; drops the param so a reload keeps the edits.
 * Module level so StrictMode's double init never asks twice.
 */
const EDIT = ((): Draft['unit'] | null => {
  const q = new URLSearchParams(location.search).get('unit')
  const files = import.meta.glob('../data/units/*.json', { eager: true, import: 'default' }) as Record<string, Draft['unit']>
  const found = q && Object.entries(files).find(([path, x]) => path.endsWith(`/${q}.json`) || x.id === q)?.[1]
  if (!found) return null
  const u = withLayout(found) // as the viewer shows it: with the layout arranged in this browser
  let d: { unit?: unknown; drawing?: unknown } | null = null
  try {
    d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
  } catch {
    /* no usable draft */
  }
  const du = [d, d?.unit].find(isUnit) // a Draft or a bare Unit, as init() accepts
  // a project drawing is kept in its project (FloorList): nothing to lose, nothing to ask
  if (du?.vertices.length && !d?.drawing && JSON.stringify(du) !== JSON.stringify(normalizeUnit(u)))
    if (!window.confirm(`Replace your Studio draft (${du.name || 'untitled unit'}) with ${u.name} as the viewer shows it? Export the draft first if you need it.`)) return null
  history.replaceState(null, '', '/studio')
  return u
})()

function readActive(): Active | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY)
    if (!id) return null
    const d = EDIT ? null : (JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { drawing?: unknown } | null)
    return { id, ...(typeof d?.drawing === 'string' ? { drawing: d.drawing } : {}) }
  } catch {
    return null
  }
}

function init(): StudioState {
  const s = initialState()
  if (EDIT) return reducer(reducer(s, { type: 'load-unit', unit: EDIT }), { type: 'toast', text: `Editing ${EDIT.name} — Export saves a copy` })
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      // a full Draft, a bare `{ unit }`, or a Unit JSON pasted straight in — all restore
      const d = (isUnit(parsed) ? { unit: parsed } : parsed) as Partial<Draft> | null
      if (d && isUnit(d.unit)) return studioReducer(s, { type: 'restore', draft: { ...(d as Draft), unit: withLayout(d.unit) } })
    }
  } catch {
    /* corrupt draft: start clean */
  }
  return s
}

/** dev only: Auto-trace returns the fixed Sheltech A result (autotraceMock.ts) until the solver lands */
const MOCK_TRACE = import.meta.env.DEV && new URLSearchParams(location.search).has('mock-trace')

/**
 * The loaded plan as auto-trace's rasters: grey (luminance) and the colour image (RGBA, for planter greens and blue
 * glazing); transparent pixels read as paper. Both buffers are transferred to the worker, not copied.
 */
function rastersOf(im: HTMLImageElement): { gray: Gray; rgb: NonNullable<TraceJob['rgb']> } {
  const c = document.createElement('canvas')
  c.width = im.naturalWidth
  c.height = im.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(im, 0, 0)
  const rgba = ctx.getImageData(0, 0, c.width, c.height).data
  const data = new Uint8Array(c.width * c.height)
  for (let i = 0; i < data.length; i++) data[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  return { gray: { width: c.width, height: c.height, data }, rgb: { width: c.width, height: c.height, data: rgba } }
}

const download = (name: string, text: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export default function StudioApp() {
  const [state, dispatch] = useReducer(studioReducer, undefined, init)
  const [restored, setRestored] = useState<string | null>(() =>
    !EDIT && (state.unit.vertices.length || state.planImage) ? state.unit.name || 'untitled unit' : null,
  )
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)
  const [scaleStart, setScaleStart] = useState<Pt | null>(null)
  /** A tool: its start, then its end; arcDownRef = the press that lays it on release (the bulge is the pointer) */
  const [arc, setArc] = useState<{ a: Target; b?: Target } | null>(null)
  const arcDownRef = useRef(false)
  /** S on a drawing that already has walls = line the picture up with it: the first matched pair (picture px, drawing m) */
  const [align, setAlign] = useState<{ p: Pt; m: Pt } | null>(null)
  const [panning, setPanning] = useState(false)
  const [field, setField] = useState<Field | null>(null)
  const [popover, setPopover] = useState<Popover | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [missingPlan, setMissingPlan] = useState<string | null>(null)
  // Auto-trace: 'pick' = waiting for the click inside the flat; then the running stage; cancelTrace stops either
  const [trace, setTrace] = useState<'pick' | { stage: string; fraction: number } | null>(null)
  const cancelTrace = useRef(() => setTrace(null))
  // pick mode: the sheet's preparing stage (null = ready), the flat a click at the pointer picks, the hover / click senders
  const [prep, setPrep] = useState<string | null>(null)
  const [flatPreview, setFlatPreview] = useState<Preview | null>(null)
  const hoverTrace = useRef((_px: Pt) => {})
  /** the click inside a flat; null = the Whole floor button (Level 4) */
  const pickTrace = useRef((_px: Pt | null) => {})
  /** a review row's spot, ringed on the canvas until the next click */
  const [mark, setMark] = useState<Pt | null>(null)

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
  /** Wall tool press: a move of 3 px or more makes it press-drag-release (one wall to the release point); `hold` = held W */
  const wallDragRef = useRef<{ sx: number; sy: number; at: Target; hold: boolean; moved: boolean } | null>(null)
  /** F tool: a selected curtain's side dot pressed (sign: its +x / −x side); dragged, that side alone moves (furniture.resizePiece) */
  const sideRef = useRef<{ id: Id; sign: 1 | -1; sx: number; sy: number; moved: boolean } | null>(null)
  /** C tool press: a release where it was = a 12" × 20" column there; dragged = a column from the press to the release */
  const pillarDragRef = useRef<{ sx: number; sy: number; at: Pt; moved: boolean } | null>(null)
  const holdRef = useRef<Hold | null>(null)
  const [held, setHeld] = useState<{ key: string; back: Tool } | null>(null)
  const lastPointer = useRef<{ sx: number; sy: number } | null>(null)
  const fitOnLoad = useRef(false)

  const { unit, view, tool, chain } = state
  useEffect(() => setArc(null), [tool]) // another tool drops a half-placed arc
  const frame = useMemo(() => frameOf(view, unit.planImage), [view, unit.planImage])
  const { pxPerM } = frame
  const s = view.zoom * pxPerM
  const tolM = SNAP_PX / s
  // a drawing with walls is already in real lengths (a built-in level has no picture): nothing to wait for
  const scaleSet = !!unit.planImage || unit.walls.length > 0
  // S lines the picture up only while the drawing has no picture under it yet; a drawing traced on its picture: S sets the scale
  const lineUp = unit.walls.length > 0 && !unit.planImage
  const rooms = useMemo(() => deriveRooms(unit), [unit])
  const flats = useMemo(() => deriveFlats(unit, rooms), [unit, rooms])
  const issues = useMemo(() => studioIssues(unit, rooms), [unit, rooms])
  const labelSides = useMemo(() => wallLabelSides(unit, rooms), [unit, rooms])
  const errors = issues.filter((i) => i.level === 'error').length
  // the Issues and "Check these" rows as marks on the plan; their fixes are checked by applying them (issues.ts): once the
  // plan has stood still for 150 ms (never mid-drag), in a worker (fixes.worker.ts: s27 rows, a six-flat floor's 755 rows
  // took minutes of checks) — the mark open on the plan first, then what is in view — and shown as they come; any edit
  // drops them (never a fix from a stale plan), but a mark the edit did not reach gets its fixes back at once (fixSig)
  const review = useMemo(() => openReview(state, rooms), [state.review, unit, rooms]) // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => markIssues(unit, rooms, issues, review), [unit, rooms, issues, review])
  /** per mark key, its fixes — an entry (maybe with none) once worked out; null while the plan is changing */
  const [fixes, setFixes] = useState<Map<string, MarkFixes> | null>(null)
  const fixCache = useRef(new Map<string, { unit: Unit; sig: unknown[]; got: MarkFixes }>())
  /** marks still to work out (Export waits for them: every row's answers go into the file) */
  const fixesLeft = useRef(0)
  // (by key: the rows' answers stored below change the review, not the marks' fixes — no second round)
  const markKeys = marks.map((m) => m.key).join('\n')
  /** rowAnswers for the rows among `ms` whose fixes (and their issue's) are worked out */
  const answersOf = (u: Unit, ms: Mark[], found: Map<string, MarkFixes>) => {
    const p = stateRef.current.planImage
    return rowAnswers(u, ms.filter((m) => m.review && found.has(m.key) && (!m.twinOf || found.has(m.twinOf))), found, p ? { w: p.naturalW, h: p.naturalH } : undefined)
  }
  const fixWorker = useRef<Worker | null>(null)
  const fixSeq = useRef(0)
  useEffect(() => () => fixWorker.current?.terminate(), [])
  useEffect(() => {
    setFixes(null)
    const cache = fixCache.current
    const found = new Map<string, MarkFixes>()
    const byKey = new Map(marks.map((m) => [m.key, m]))
    const sigs = new Map<string, unknown[]>()
    let left = marks.length
    fixesLeft.current = left
    let shown = 0
    const take = (key: string, got: MarkFixes) => {
      found.set(key, got)
      cache.set(key, { unit, sig: sigs.get(key)!, got })
      fixesLeft.current = --left
    }
    const publish = () => {
      setFixes(new Map(found))
      shown = performance.now()
      if (left) return
      // s27 AI-prep: the rows' answers (= these buttons) and sheet boxes go into the draft, saved with it — once all are
      // worked out (a row clicked before that gets its own first: answer)
      dispatch({ type: 'answers', unit, rows: answersOf(unit, marks, found) })
      for (const k of cache.keys()) if (!found.has(k)) cache.delete(k)
    }
    const seq = ++fixSeq.current
    const start = () => {
      // a mark the edit did not reach keeps its fixes (fixSig); the others are worked out in the worker, one by one
      const todo = marks.filter((m) => {
        const c = cache.get(m.key)
        const sig = c?.unit === unit ? c.sig : fixSig(unit, m, rooms) // (a row dismissed: the plan is the same)
        sigs.set(m.key, sig)
        if (!c || c.sig.length !== sig.length || c.sig.some((x, i) => x !== sig[i])) return true
        take(m.key, c.got)
        return false
      })
      publish()
      if (!todo.length) return
      // what is in view first, from the middle of the screen out (the mark open on the plan before all: `first`)
      const c = screenToM(frame, { x: size.w / 2, y: size.h / 2 })
      const far = (m: Mark) => (m.at ? Math.hypot(m.at.x - c.x, m.at.y - c.y) : Infinity)
      todo.sort((p, q) => far(p) - far(q))
      const w = (fixWorker.current ??= new Worker(new URL('./fixes.worker.ts', import.meta.url), { type: 'module' }))
      w.onmessage = ({ data }: MessageEvent<FixesOut>) => {
        if (data.seq !== seq) return
        take(data.key, data.got)
        const m = byKey.get(data.key)
        if (!left || (m && (m.twinOf ?? m.key) === activeRef.current) || performance.now() - shown > 500) publish()
      }
      w.postMessage({ type: 'job', seq, unit, marks: todo, issues, printed: state.review?.stats.printed, rooms } satisfies FixesIn)
      if (activeRef.current) w.postMessage({ type: 'first', key: activeRef.current } satisfies FixesIn)
    }
    const id = window.setTimeout(start, 150)
    return () => {
      clearTimeout(id)
      if (fixWorker.current) (fixWorker.current.onmessage = null), fixWorker.current.postMessage({ type: 'stop' } satisfies FixesIn)
    }
  }, [unit, markKeys, issues]) // eslint-disable-line react-hooks/exhaustive-deps -- (marks follow the review, its printed names with it)
  /** the mark open on the plan (its ghost + fix buttons) and the one whose row is hovered (it pulses) */
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [hotKey, setHotKey] = useState<string | null>(null)
  const activeRef = useRef(activeKey)
  activeRef.current = activeKey
  // (a mark opened while the list is still being worked out: its fixes next)
  useEffect(() => void (activeKey && fixWorker.current?.postMessage({ type: 'first', key: activeKey } satisfies FixesIn)), [activeKey])
  // furniture layer (tool F): the unit's pieces, else the preset layout; a drag's candidate layout lives here until the drop
  const pieces = useMemo(() => (tool === 'furniture' ? layoutFor(unit, rooms).filter((p) => !p.removed) : null), [tool, unit, rooms])
  const piecesRef = useRef(pieces)
  piecesRef.current = pieces
  const [furnDrag, setFurnDrag] = useState<Move | null>(null)
  // the piece in hand (tool F): a kit piece picked in the library (assetId), or a dragged one — it follows the pointer
  // (grab offset `off`) as a candidate layout, red with the reason where the rules refuse it, and goes down only where it
  // fits (a click, or the drag's release); R turns it, Esc puts it back (founder 2026-10-04, as the 3D Arrange)
  const [placing, setPlacing] = useState<{ id: Id; assetId?: string; rot: number; off?: Pt } | null>(null)
  // the handlers read the hand from the ref, set at once: a quick drag's release can come before the redraw that shows the
  // piece in hand — it must put it down then, not leave it in the hand to swallow the next click (founder 2026-10-09)
  const placingRef = useRef(placing)
  const hold = (h: typeof placing) => {
    placingRef.current = h
    setPlacing(h)
  }
  const handAt = (sx: number, sy: number): Pt => {
    const m = toM(sx, sy)
    const off = placingRef.current?.off
    return { x: m.x + (off?.x ?? 0), y: m.y + (off?.y ?? 0) }
  }
  const handMove = (to: Pt) => {
    const h = placingRef.current
    return h && pieces && (h.assetId ? placePiece(unit, rooms, pieces, h.assetId, to, h.rot, h.id) : movePiece(unit, rooms, pieces, h.id, to, h.rot))
  }
  const ghost = (sx: number, sy: number) => placingRef.current && pieces && setFurnDrag(handMove(handAt(sx, sy)))
  /** a click (or the drag's release) with a piece in hand: down where it fits, one undo step; refused, it stays in hand */
  const putDown = (sx: number, sy: number) => {
    const h = placingRef.current
    const to = handAt(sx, sy)
    const m = h && handMove(to)
    if (!h || !m) return
    if (m.error) return toast(m.error)
    dispatch(h.assetId ? { type: 'place-piece', id: h.id, assetId: h.assetId, ...to, rotationDeg: h.rot } : { type: 'move-piece', id: h.id, ...to, rotationDeg: h.rot })
    hold(null)
    setFurnDrag(null)
  }

  /** a curtain's side dragged to the pointer: its new width, that side moving (as the 3D view's side dots) */
  const sideSize = (sd: { id: Id; sign: 1 | -1 }, sx: number, sy: number) => {
    const p = piecesRef.current?.find((x) => x.id === sd.id)
    if (!p) return null
    const m = toM(sx, sy)
    const t = (p.rotationDeg * Math.PI) / 180
    const size = placementSize(p)
    const u = (m.x - p.x) * Math.cos(t) + (m.y - p.y) * Math.sin(t) // along its +x
    return { sizeM: { ...size, x: sd.sign * u + size.x / 2 }, grow: { x: sd.sign, z: 0 } }
  }

  const toast = useCallback((text: string, link?: Note['link']) => setNote({ text, link }), [])
  const [cursor, setCursor] = useState<string | null>(null)
  const toM = useCallback((sx: number, sy: number): Pt => screenToM(frame, { x: sx, y: sy }), [frame])
  const toPx = useCallback((sx: number, sy: number): Pt => screenToPx(frame, { x: sx, y: sy }), [frame])
  const toScreen = useCallback((m: Pt): Pt => mToScreen(frame, m), [frame])
  const now = () => Date.now()
  // a new pick or R: the ghost where the pointer is; leaving tool F drops it
  useEffect(() => {
    if (placing && tool !== 'furniture') return hold(null)
    if (placing && !placing.assetId && pieces && !pieces.some((x) => x.id === placing.id)) return hold(null) // deleted while in hand (the panel's Delete)
    if (!placing) return setFurnDrag(null)
    const p = lastPointer.current
    if (p) ghost(p.sx, p.sy)
  }, [placing, tool, pieces]) // eslint-disable-line react-hooks/exhaustive-deps

  // ----- reducer toasts → note
  useEffect(() => {
    if (state.toast) {
      setNote({ text: state.toast.text })
      dispatch({ type: 'clear-toast' })
    }
  }, [state.toast])
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), note.link ? 15000 : 5000) // an offer stays long enough to read and click
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
      else {
        // the picture and the drawing together: a picture not yet lined up (S) may sit far from the drawing
        if (st.planImage) bx = { minX: 0, minY: 0, maxX: st.planImage.naturalW, maxY: st.planImage.naturalH }
        if (st.unit.vertices.length) {
          const f = frameOf(st.view, st.unit.planImage)
          const b = unitBounds(st.unit)
          const lo = mToPx(f, { x: b.minX, y: b.minY })
          const hi = mToPx(f, { x: b.maxX, y: b.maxY })
          bx = bx
            ? { minX: Math.min(bx.minX, lo.x), minY: Math.min(bx.minY, lo.y), maxX: Math.max(bx.maxX, hi.x), maxY: Math.max(bx.maxY, hi.y) }
            : { minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y }
        }
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
      if (ctx) draw({ ctx, width: size.w, height: size.h, dpr, state, img, rooms, labelSides, hover, scaleStart, frame, furniture, mark, preview: flatPreview, flats })
    })
    return () => cancelAnimationFrame(id)
  }, [state, img, rooms, labelSides, hover, scaleStart, size, frame, pieces, furnDrag, mark, flatPreview, flats])

  // ----- project first (FloorList): the open project, the drawing of it the Studio holds
  const [projects, setProjects] = useState(readProjects)
  const [active, setActiveState] = useState(readActive)
  const projRef = useRef(active)
  projRef.current = active
  const setActive = (a: Active | null) => {
    projRef.current = a
    setActiveState(a)
    try {
      if (a) localStorage.setItem(ACTIVE_KEY, a.id)
      else localStorage.removeItem(ACTIVE_KEY)
    } catch {
      /* storage blocked */
    }
  }
  const project = (active && projects.find((p) => p.id === active.id)) || null
  const [listOpen, setListOpen] = useState(() => !!active)
  /** `ps` with the Studio's unit as it is now wherever it stands, and as the open project drawing; null: nothing changed */
  const synced = (ps: Project[]): Project[] | null => {
    const u = stateRef.current.unit
    const d = projRef.current?.drawing
    const a = syncUnit(ps, u)
    return (d && d !== u.id ? syncUnit(a ?? ps, { ...u, id: d }) : null) ?? a
  }
  const storeProjects = (ps: Project[]): boolean => {
    if (!saveProjects(ps)) {
      toast('This browser refused to save the project (storage full?)')
      return false
    }
    setProjects(ps)
    return true
  }
  /** the stored projects with the open drawing as it is now; work open in no project joins the open one (a switch never loses it) */
  const fresh = (): Project[] => {
    const ps0 = readProjects()
    const ps = synced(ps0) ?? ps0
    const st = stateRef.current
    const a = projRef.current
    if (!a || ps.some((p) => p.units[a.drawing ?? st.unit.id]) || (!st.unit.vertices.length && !st.planImage)) return ps
    if (st.planImage?.dataUrl.startsWith('data:')) void putPicture(st.unit.id, st.planImage).catch(() => {})
    return ps.map((p) => (p.id === a.id ? { ...p, units: { ...p.units, [st.unit.id]: st.unit } } : p))
  }
  /** another drawing into the Studio (null: an empty one): this one is saved first (`ps` holds it), its picture comes back from this browser */
  const opening = useRef<Id | null>(null)
  const openDrawing = (ps: Project[], id: Id | null) => {
    if (!storeProjects(ps)) return
    const a = projRef.current
    const u = id ? ps.find((p) => p.id === a?.id)?.units[id] : undefined
    if (a) setActive({ id: a.id, ...(u ? { drawing: u.id } : {}) })
    opening.current = u?.id ?? null
    setNote(null)
    setRestored(null)
    setMissingPlan(null)
    setScaleStart(null)
    setAlign(null)
    dispatch({ type: 'set-plan-image', image: null })
    if (!u) return dispatch({ type: 'reset' })
    dispatch({ type: 'load-unit', unit: withLayout(u) })
    void getPicture(u.id)
      .catch(() => undefined)
      .then((pic) => {
        if (opening.current !== u.id) return // he opened another meanwhile
        if (pic) {
          fitOnLoad.current = true
          dispatch({ type: 'set-plan-image', image: pic })
        } else if (u.planImage?.src) loadPlanSrc(u.planImage.src)
        else fitView()
      })
  }
  const activate = (id: Id | null) => {
    const s = synced(readProjects()) // the last edits of the drawing open, before it stops being "the open drawing"
    if (s) saveProjects(s)
    const ps = readProjects()
    setProjects(ps)
    const live = stateRef.current.unit.id
    setActive(id ? { id, ...(ps.find((p) => p.id === id)?.units[live] ? { drawing: live } : {}) } : null)
    if (id) setListOpen(true)
  }
  const createProject = (name: string, plan: ProjectPlan) => {
    const p = newProject(newId(), name, plan)
    if (!storeProjects([...fresh(), p])) return
    setActive({ id: p.id })
    setListOpen(true)
    toast(`${name}: pick a floor on the right and click Draw`)
  }
  // a picture loaded onto a project drawing is kept for it in this browser (the draft holds only the open one's)
  useEffect(() => {
    const pi = state.planImage
    const d = projRef.current?.drawing
    if (d && pi?.dataUrl.startsWith('data:')) putPicture(d, pi).catch(() => toast('This browser would not keep the plan picture: load it again when you come back to this drawing'))
  }, [state.planImage]) // eslint-disable-line react-hooks/exhaustive-deps
  /**
   * A picture loaded onto a project drawing with no scale yet, the same pixel size as another drawing's that has one (sheets
   * exported from one set share their framing): offer that drawing's scale and position — all floors in one frame. Never silently.
   */
  const offerScale = async (w: number, h: number) => {
    const a = projRef.current
    const p = a?.drawing && readProjects().find((x) => x.id === a.id)
    if (!a?.drawing || !p) return
    for (const u of Object.values(p.units)) {
      const fit = u.planImage
      if (u.id === a.drawing || !fit?.pxPerM) continue
      const pic = await getPicture(u.id).catch(() => undefined)
      if (pic?.naturalW !== w || pic.naturalH !== h) continue
      if (projRef.current?.drawing !== a.drawing) return
      const name = u.name.trim() || 'Untitled drawing'
      return toast(`Same size as "${name}"`, {
        label: 'Use its scale and position',
        onClick: () => {
          setNote(null)
          if (projRef.current?.drawing !== a.drawing) return
          dispatch({ type: 'set-scale', pxPerM: fit.pxPerM, originPx: fit.originPx })
          toast(`Scale and position of "${name}" used — Ctrl+Z undoes it`)
        },
      })
    }
  }

  // ----- draft persistence
  const saveDraft = useCallback(() => {
    const st = stateRef.current
    const d: Draft = { unit: st.unit, planImage: st.planImage, view: st.view, timer: st.timer, review: st.review }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, drawing: projRef.current?.drawing }))
    } catch {
      setNote({ text: 'Draft too large to autosave — export your JSON often.' })
    }
    // a building made from this flat (or the open project drawing) shows it as it is now (data/building/projects.ts)
    const ps = synced(readProjects())
    if (ps) saveProjects(ps)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setTimeout(saveDraft, 400)
    return () => clearTimeout(id)
  }, [state.unit, state.planImage, state.view, state.review, saveDraft])
  // a door / window changed in the 3D view (viewer Edit openings) is written into this draft from that tab: the plan takes
  // it at once, so this tab's next autosave never writes the old openings back
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAFT_KEY || !e.newValue) return
      try {
        const d = JSON.parse(e.newValue) as Partial<Draft> | Draft['unit']
        const u = isUnit(d) ? d : (d as Partial<Draft>).unit
        const now = stateRef.current.unit
        if (!isUnit(u) || u.id !== now.id || JSON.stringify(u.walls) === JSON.stringify(now.walls)) return
        dispatch({ type: 'restore', draft: { ...(isUnit(d) ? {} : d), unit: withLayout(u) } as Draft }) // a bare unit restores too (init does the same)
        setNote({ text: 'Doors and windows changed in the 3D view — the plan shows them now' })
      } catch {
        /* not a draft */
      }
    }
    addEventListener('storage', onStorage)
    return () => removeEventListener('storage', onStorage)
  }, [])
  // shared layout: every furniture change (move, turn, resize, delete, reset, a relabel's re-furnish, their undo, an
  // import) is what the viewer shows after a reload; loading one is not a change
  const lastFurniture = useRef(unit.furniture)
  useEffect(() => {
    if (lastFurniture.current === unit.furniture) return
    lastFurniture.current = unit.furniture
    saveLayout(unit.id, unit.furniture) // "Reset all" (empty) removes it
  }, [unit.furniture, unit.id])

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
          const scaled = !!stateRef.current.unit.planImage
          dispatch({ type: 'set-plan-image', image: { dataUrl, naturalW: im.naturalWidth, naturalH: im.naturalHeight, name: file.name } })
          if (!scaled) void offerScale(im.naturalWidth, im.naturalHeight)
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
      const u = normalizeUnit({ ...parsed, review: undefined } as typeof parsed) // (an Export's Check-these rows stay out of the unit)
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

  const exportJson = useCallback(async () => {
    // every open row's answers go into the file (s27 AI-prep): on a long list still being worked out, the export waits
    const answered = () => {
      const s = stateRef.current
      if (fixesLeft.current) return false
      const open = new Set(openReview(s).map((i) => i.id))
      return (s.review?.items ?? []).every((i) => !open.has(i.id) || i.answers)
    }
    if (!answered()) {
      toast(`Working out the fixes of the ${fixesLeft.current || 'last'} rows first — the file follows`)
      for (let t = 0; t < 2400 && !answered(); t++) await new Promise((r) => setTimeout(r, 250)) // (≤ 10 min, then as it is)
    }
    const st = stateRef.current
    const traced = `Traced in ${formatTimer(st.timer.elapsedMs)}`
    const n = issues.filter((i) => i.level === 'error').length
    if (n && !window.confirm(`This unit has ${n} error${n === 1 ? '' : 's'}. Export anyway?\n${traced}`)) return
    console.log(`[plotline] ${traced} (${st.timer.elapsedMs} ms)`)
    const name = st.unit.name.trim() || 'Untitled unit'
    // (s27 AI-prep: with this trace's Check-these rows — their sheet boxes and answers; Import leaves them out)
    const out = { ...st.unit, name, planImage: st.unit.planImage && { ...st.unit.planImage, src: st.planImage?.name ?? st.unit.planImage.src }, review: st.review?.unitId === st.unit.id ? st.review : undefined }
    download(`${slug(name)}.plotline.json`, JSON.stringify(out, null, 2))
    dispatch({ type: 'exported' })
    toast(traced)
  }, [issues, toast])
  // s27 AI-prep: every Check-these answer clicked in this browser (append-only), as a file — the test set for a model
  const exportAnswers = () => {
    const raw = localStorage.getItem(ANSWERS_KEY) ?? '[]'
    download('plotline-answers.json', raw) // (as stored: nothing lost even if it no longer parses)
    let n = 0
    try {
      n = JSON.parse(raw).length
    } catch {
      /* the file still has it */
    }
    toast(`${n} answer${n === 1 ? '' : 's'} exported`)
  }

  // never locked by errors (founder 2026-10-03, 310fe76 unlocked the button but left this early return: a click did nothing)
  const preview = useCallback(() => {
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(stateRef.current.unit))
    } catch {
      return toast('Draft too large to autosave — export your JSON often.')
    }
    const w = window.open('/u/preview', '_blank')
    if (!w) toast('Preview blocked by the browser.', { label: 'Open preview', onClick: () => window.open('/u/preview', '_blank') })
  }, [toast])
  // Building (ask 2): the draft's building in the viewer's Building view, the draft standing on one of its floors
  const [buildingOpen, setBuildingOpen] = useState(false)
  // Site (s27): where the building stands — one site for the whole building, so every drawing of the open project gets it
  const [siteOpen, setSiteOpen] = useState(false)
  const setSite = (site: Site | undefined) => {
    dispatch({ type: 'set-meta', patch: { site } })
    const a = projRef.current
    if (a) saveProjects(readProjects().map((p) => (p.id === a.id ? { ...p, units: Object.fromEntries(Object.entries(p.units).map(([id, u]) => [id, { ...u, site }])) } : p)))
  }
  const showBuilding = (from: number, to: number) => {
    let u = stateRef.current.unit
    if (u.floor === undefined || u.floor < from || u.floor > to) {
      dispatch({ type: 'set-meta', patch: { floor: from } })
      u = { ...u, floor: from }
    }
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(u))
    } catch {
      return toast('Draft too large to autosave — export your JSON often.')
    }
    openBuilding('/u/preview?view=building')
  }
  const openBuilding = (url: string) => {
    setBuildingOpen(false)
    setProjects(readProjects()) // the old Building panel may have changed them
    if (!window.open(url, '_blank')) toast('The building opens in a new tab: the browser blocked it.', { label: 'Open building', onClick: () => window.open(url, '_blank') })
  }
  /** the floor list's Show building: the whole stack, entered by the open drawing's flat (else any flat, else a level picked) */
  const showProject = () => {
    const ps = fresh()
    const a = projRef.current
    const p = ps.find((x) => x.id === a?.id)
    if (!p || !storeProjects(ps)) return
    const t = projectTower(p)
    const mine = a?.drawing && p.units[a.drawing] ? stemIn(t, p.units[a.drawing]) : undefined
    const stem = (mine && roleIn(t, mine) === 'flat' ? mine : undefined) ?? Object.keys(t.FLATS).find((s) => roleIn(t, s) === 'flat') ?? mine ?? Object.keys(t.LEVELS ?? {})[0]
    if (!stem) return toast('Put a drawing on a floor first: Draw, or Use drawing…')
    const k = t.LEVELS?.[stem]
    openBuilding(`/u/${encodeURIComponent(stem)}?floor=${floorIn(t, stem)}&view=building${k !== undefined ? `&pick=${k}` : ''}`)
  }

  // Share: the draft as it is goes to Supabase, the link (`/s/<token>`) lands on the clipboard. Every share is a new
  // link (append-only): a client keeps seeing what he was sent. The staff key is asked for once per browser.
  const [sharing, setSharing] = useState(false)
  const share = useCallback(async () => {
    let key = localStorage.getItem(PUBLISH_KEY) ?? ''
    if (!key) {
      key = window.prompt('Staff key (printed when the Supabase migration ran):')?.trim() ?? ''
      if (!key) return
      localStorage.setItem(PUBLISH_KEY, key)
    }
    setSharing(true)
    try {
      const st = stateRef.current
      const unit = withLayout({ ...st.unit, name: st.unit.name.trim() || 'Untitled unit' }) // the buyer's browser has no arranged layout: bake it in
      const url = `${location.origin}/s/${await publishUnit(unit, key)}`
      await navigator.clipboard.writeText(url).catch(() => {})
      toast(`Link copied: ${url}`, { label: 'Open', onClick: () => window.open(url, '_blank') })
    } catch (e) {
      if (e instanceof RpcError && (e.status === 401 || e.status === 403)) {
        localStorage.removeItem(PUBLISH_KEY)
        toast('Wrong staff key — click Share again to retype it.')
      } else toast(`Could not share: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSharing(false)
    }
  }, [toast])

  // ----- auto-trace: pick mode starts the worker reading the sheet at once (text, walls, the whole graph); a hover
  // previews the flat a click there picks; the click picks it on the same prepared sheet → the result replaces the unit
  // (one undo step)
  const startAutoTrace = () => {
    if (!img || (unit.walls.length && !window.confirm('Replace your current trace? Ctrl+Z brings it back.'))) return
    let aiKey: string | undefined
    let tracker: TraceJob['tracker']
    try {
      aiKey = localStorage.getItem(AI_KEY) || undefined
      tracker = localStorage.getItem(TRACKER_KEY) === 'skeleton' ? 'skeleton' : undefined
    } catch {
      /* storage blocked: no AI helper, the default tracker */
    }
    const { gray, rgb } = rastersOf(img)
    const worker = new Worker(new URL('./autotrace.worker.ts', import.meta.url), { type: 'module' })
    const send = (m: TraceIn, transfer: Transferable[] = []) => worker.postMessage(m, transfer)
    // hover: one preview in flight at a time, the latest spot sent as soon as it is back (the worker's pace is the throttle)
    let ready = false, busy = false, picked = false, want: Pt | null = null, seq = 0
    const next = () => {
      if (!ready || busy || picked || !want) return
      busy = true
      send({ type: 'hover', px: want, seq: ++seq })
      want = null
    }
    hoverTrace.current = (px) => {
      want = px
      next()
    }
    const stop = () => {
      worker.terminate()
      hoverTrace.current = pickTrace.current = () => {}
      setTrace(null)
      setPrep(null)
      setFlatPreview(null)
    }
    const done = (result: AutoTraceResult) => {
      stop()
      dispatch({ type: 'auto-trace', result })
      // s27 AI-prep: the print the reader threw away, kept beside the draft — one entry per sheet, boxes only
      const p = stateRef.current.planImage
      if (p && result.rejectedText)
        try {
          localStorage.setItem(STRIPS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STRIPS_KEY) ?? '{}'), [`${p.name} ${p.naturalW}x${p.naturalH}`]: result.rejectedText }))
        } catch {
          /* storage full or blocked: the trace stands without them */
        }
      const u = result.unit
      if (u.vertices.length) {
        const f = frameOf(view, u.planImage)
        const b = unitBounds(u)
        const lo = mToPx(f, { x: b.minX - 1, y: b.minY - 1 })
        const hi = mToPx(f, { x: b.maxX + 1, y: b.maxY + 1 })
        fitView({ minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y })
      }
      const n = result.review.length
      toast(n ? `Traced — ${n} thing${n === 1 ? '' : 's'} to check on the right · Ctrl+Z undoes it` : 'Traced · Ctrl+Z undoes it')
    }
    const fail = (why: string) => {
      stop()
      toast(`Auto-trace could not finish (${why.replace(/^autoTrace:\s*/, '')}). Nothing was changed.`)
    }
    // (before the click Esc / Cancel just leave pick mode)
    cancelTrace.current = stop
    pickTrace.current = (px) => {
      picked = true
      setFlatPreview(null)
      // ready: only the flat's own steps are left; else the sheet's progress carries on in the card
      setTrace({ stage: ready ? (px ? 'flat' : 'whole floor') : 'Reading the plan', fraction: ready ? 0.8 : 0 })
      cancelTrace.current = () => {
        stop()
        toast('Auto-trace cancelled')
      }
      send(px ? { type: 'pick', px } : { type: 'floor' })
    }
    worker.onmessage = (e: MessageEvent<TraceMsg>) => {
      const m = e.data
      if (m.type === 'progress') return picked ? setTrace({ stage: m.stage, fraction: m.fraction }) : setPrep(m.stage)
      if (m.type === 'ready') {
        ready = true
        setPrep(null)
        return next()
      }
      if (m.type === 'preview') {
        busy = false
        if (!picked) setFlatPreview(m.polys.length || m.region.length ? m : null)
        return next()
      }
      if (m.type === 'done') done(m.result)
      else fail(m.message)
    }
    worker.onerror = (e) => {
      e.preventDefault()
      fail(e.message || 'the tracer could not start')
    }
    setPrep('starting')
    setTrace('pick')
    send({ type: 'prepare', job: { gray, rgb, pxPerM: unit.planImage?.pxPerM, aiKey, tracker, mock: MOCK_TRACE } }, [gray.data.buffer, rgb.data.buffer])
  }

  // ----- hit testing (screen px)
  const hitTest = useCallback(
    (sx: number, sy: number): Hit | null => {
      const u = stateRef.current.unit
      const m = toM(sx, sy)
      if (stateRef.current.tool === 'furniture') {
        const p = pieceAt(piecesRef.current ?? [], m, 6 / s) // a sliver (a print, a TV) within 6 px, as a wall's
        return p && { kind: 'furniture', id: p.id }
      }
      // a column's block (3 px slack) wins inside it over the walls, openings and labels running through / beside it (the
      // smallest when two overlap); only a corner the pointer is right on (4 px) comes first: a wall end on its face
      const col = (u.pillars ?? []).filter((p) => Math.abs(m.x - p.x) <= p.wM / 2 + 3 / s && Math.abs(m.y - p.y) <= p.hM / 2 + 3 / s).sort((p, q) => p.wM * p.hM - q.wM * q.hM)[0]
      for (const v of u.vertices) {
        const p = toScreen(v)
        if (Math.hypot(p.x - sx, p.y - sy) <= (col ? 4 : 8)) return { kind: 'vertex', id: v.id }
      }
      if (col) return { kind: 'pillar', id: col.id }
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
      if ((st.tool === 'wall' || st.tool === 'arc') && (st.unit.planImage || st.unit.walls.length)) {
        const from = st.chain && st.tool === 'wall' ? vertexById(st.unit.vertices, st.chain.ids[st.chain.ids.length - 1]) : undefined
        return { m, px, snap: snapPoint(m, st.unit, { tolM: SNAP_PX / s, from, free: shift }), hit: null }
      }
      if (st.tool === 'scale') {
        // lining up: the second click of a pair is a point of the drawing
        if (st.unit.walls.length && !st.unit.planImage) return { m, px, snap: scaleStart ? snapPoint(m, st.unit, { tolM: SNAP_PX / s }) : null, hit: null }
        if (scaleStart && !shift) {
          const dx = px.x - scaleStart.x
          const dy = px.y - scaleStart.y
          px = Math.abs(dx) > Math.abs(dy) ? { x: px.x, y: scaleStart.y } : { x: scaleStart.x, y: px.y }
        }
        return { m, px, snap: null, hit: null }
      }
      if (st.tool === 'opening' && (st.unit.planImage || st.unit.walls.length)) {
        const nw = nearestWall(m, st.unit)
        const ghost =
          nw && nw.distanceM <= Math.max(SNAP_PX / s, nw.wall.thicknessM)
            ? { wallId: nw.wall.id, t: nw.t, ...openingAt(st.unit, nw.wall, nw.t, st.lastOpeningKind, SNAP_PX / s, rooms, st.lastOpeningWidthM, st.glassPick) }
            : undefined
        return { m, px, snap: null, hit: hitTest(sx, sy), ghost }
      }
      return { m, px, snap: null, hit: hitTest(sx, sy) }
    },
    [toM, toPx, s, scaleStart, hitTest, rooms],
  )

  /** a selected opening's end handle under the pointer (8 px, as a corner): dragging it resizes the opening */
  const openingEndAt = (sx: number, sy: number): { id: Id; end: 'a' | 'b' } | undefined => {
    for (const id of state.selection) {
      const e = findEntity(unit, id)
      if (e?.kind !== 'opening') continue
      const f = wallFrame(e.w, unit.vertices)
      for (const [end, u] of [['a', e.o.offsetM], ['b', e.o.offsetM + e.o.widthM]] as const) {
        const p = toScreen({ x: f.origin.x + f.dir.x * u, y: f.origin.y + f.dir.y * u })
        if (Math.hypot(p.x - sx, p.y - sy) <= 8) return { id, end }
      }
    }
  }

  /**
   * A selected column's handle under the pointer (founder 2026-10-09: "why can i change the pillars only on 2 sides?";
   * 2026-10-16: "a column becomes four corner points"): a CORNER dot (8 px) moves that corner alone (a tapered column), a
   * SIDE (6 px either side of it, along it) moves that one side. Inside a small block a side reaches only a third of the
   * way in, so its middle still moves it.
   */
  const pillarHandleAt = (sx: number, sy: number): { id: Id; k: number; side: boolean; cursor: string } | undefined => {
    for (const p of unit.pillars ?? []) {
      if (!state.selection.includes(p.id)) continue
      const cs = pillarCorners(p).map(toScreen)
      const k = cs.findIndex((c) => Math.hypot(c.x - sx, c.y - sy) <= 8)
      if (k >= 0) return { id: p.id, k, side: false, cursor: 'move' }
      const mid = { x: cs.reduce((s, c) => s + c.x, 0) / 4, y: cs.reduce((s, c) => s + c.y, 0) / 4 }
      const inner = Math.min(6, (Math.min(Math.max(...cs.map((c) => c.x)) - Math.min(...cs.map((c) => c.x)), Math.max(...cs.map((c) => c.y)) - Math.min(...cs.map((c) => c.y))) / 3))
      for (let i = 0; i < 4; i++) {
        const [a, b] = [cs[i], cs[(i + 1) % 4]]
        const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
        const t = ((sx - a.x) * (b.x - a.x) + (sy - a.y) * (b.y - a.y)) / L / L
        const across = (q: Pt) => ((q.x - a.x) * (b.y - a.y) - (q.y - a.y) * (b.x - a.x)) / L
        const d = across({ x: sx, y: sy }) * Math.sign(across(mid)) // inside > 0
        if (t >= 0 && t <= 1 && d >= -6 && d <= inner) return { id: p.id, k: i, side: true, cursor: Math.abs(b.x - a.x) < Math.abs(b.y - a.y) ? 'ew-resize' : 'ns-resize' }
      }
    }
  }
  /** the one selected wall's face dot under the pointer (8 px): dragging it thickens / thins the wall on that side */
  const wallFaceAt = (sx: number, sy: number): { id: Id; side: 1 | -1; cursor: string } | undefined => {
    const w = state.selection.length === 1 ? unit.walls.find((x) => x.id === state.selection[0]) : undefined
    const dots = w && wallFaceDots(w, unit.vertices)
    if (!w || !dots) return
    const [d0, d1] = dots.map((p) => { const q = toScreen(p); return Math.hypot(q.x - sx, q.y - sy) })
    if (Math.min(d0, d1) > 8) return
    const f = wallFrame(w, unit.vertices)
    return { id: w.id, side: d0 <= d1 ? 1 : -1, cursor: Math.abs(f.normal.x) > Math.abs(f.normal.y) ? 'ew-resize' : 'ns-resize' }
  }
  /** a selected ramp's arrow head under the pointer (10 px): dragging it aims the ramp */
  const rampHeadAt = (sx: number, sy: number): Id | undefined => {
    for (const l of unit.roomLabels) {
      const r = l.slope && state.selection.includes(l.id) && rooms.find((x) => x.id === l.id)
      if (!r || !l.slope) continue
      const h = toScreen(rampArrow(r, unit, l, l.slope.dirDeg).to)
      if (Math.hypot(h.x - sx, h.y - sy) <= 10) return l.id
    }
  }

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  const openPopover = useCallback(
    (m: Pt, sx: number, sy: number, labelId?: Id) => {
      const st = stateRef.current
      const existing = labelId ? st.unit.roomLabels.find((l) => l.id === labelId) : undefined
      let r = roomAt(existing ?? m, rooms, st.unit)
      let now = st.unit // the unit the popover's room is in (healed below)
      if (!r && !existing) {
        // decided on the room around the click only (founder 2026-10-09): the wall ends whose own fix closes it — a loose
        // end elsewhere is never the reason. One within reach is joined (one undo step) and the room is named.
        const leaks = leaksAround(st, m)
        const one = leaks.length === 1 ? leaks[0] : null
        if (one?.heal) {
          const t = one.fix.actions.reduce(reducer, st)
          r = roomAt(m, deriveRooms(t.unit), t.unit)
          now = t.unit
          if (r) dispatch({ type: 'apply-fix', actions: one.fix.actions, label: one.gap > 0.005 ? `Joined a wall end ${formatFeetInches(one.gap)} short of the wall` : 'Joined a wall end to the wall it touches' })
        }
        if (!r) {
          const where = (q: Pt) => {
            const [dx, dy] = [q.x - m.x, q.y - m.y]
            const d = Math.hypot(dx, dy) || 1
            const v = Math.abs(dy) > 0.38 * d ? (dy < 0 ? 'up' : 'down') : ''
            const h = Math.abs(dx) > 0.38 * d ? (dx < 0 ? 'left' : 'right') : ''
            return `${formatFeetInches(d)} ${[v, h].filter(Boolean).join('-')} of your click`
          }
          const short = (l: (typeof leaks)[number]) => (l.fix.label.startsWith('Close the gap') ? `stops ${formatFeetInches(l.gap)} short of the wall end facing it — drag it there (or put a door / window in the gap with O)` : `stops ${formatFeetInches(l.gap)} short of the wall ahead — drag its end onto that wall`)
          if (leaks.length) setMark(leaks[0].at)
          return toast(
            !leaks.length
              ? 'Not a closed room here: no wall end around this spot closes it — a wall is missing. Draw it with W.'
              : leaks.length === 1
                ? `Not closed yet: the wall end ${where(leaks[0].at)} (ringed) ${short(leaks[0])}.`
                : `Not closed yet: ${leaks.length} wall ends around it stop short — the one ${where(leaks[0].at)} (ringed) ${short(leaks[0])}; then press R here again.`,
          )
        }
      }
      setPopover({
        x: existing?.x ?? m.x,
        y: existing?.y ?? m.y,
        sx,
        sy,
        name: existing?.name ?? '',
        kind: existing?.kind ?? 'other',
        kindTouched: !!existing,
        printedSize: existing?.printedSize ?? '', // never pre-filled from the drawn walls: the size check would compare the drawing with itself (task 3, 2026-10-09)
        areaSqm: r?.areaSqm ?? 0,
        labelId,
        levelM: existing?.levelM,
        slope: existing?.slope,
        dirs: r ? rampDirs(r, now) : [0, 90, 180, 270],
      })
    },
    [rooms, toast],
  )

  /** a held W / O / R released: after a pointer action, back to the tool and selection before it; a tap stays in the tool */
  const endHold = () => {
    const h = holdRef.current
    if (!h) return
    if (wallDragRef.current) return void (h.up = true) // the wall being dragged comes first: its pointer up ends the hold
    holdRef.current = null
    setHeld(null)
    if (h.used) dispatch({ type: 'spring-back', tool: h.tool, selection: h.selection })
  }
  // a tool switch (a key, a held key, its release) or a new O pick shows what the pointer is over in the new tool: the O ghost at once
  useEffect(() => {
    const p = lastPointer.current
    if (p && hoverRef.current && !dragRef.current) setHover(computeHover(p.sx, p.sy, shiftRef.current))
  }, [tool, state.lastOpeningKind, state.lastOpeningWidthM]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (mark) setMark(null)
    if (activeKey) setActiveKey(null)
    if (trace === 'pick') {
      const p = toPx(sx, sy)
      const pi = state.planImage
      if (!pi || p.x < 0 || p.y < 0 || p.x > pi.naturalW || p.y > pi.naturalH) return toast('Click on the plan, inside the flat')
      return pickTrace.current(p)
    }
    if (placingRef.current && tool === 'furniture') return putDown(sx, sy) // refused: it stays in hand
    if (field) setField(null)
    if (popover) setPopover(null)
    dispatch({ type: 'timer-input', now: now() })
    const m = toM(sx, sy)
    // Recompute from the event: the `hover` state may still be the previous position when a
    // click follows the move within the same frame (React defers pointermove renders).
    const h = computeHover(sx, sy, e.shiftKey)
    if (holdRef.current) holdRef.current.used = true
    // a selected opening's end handle (Select, or the O tool right after placing one): drag = resize
    const end = (tool === 'select' || tool === 'opening') && openingEndAt(sx, sy)
    if (end) return void (dragRef.current = { hit: { kind: 'opening', id: end.id }, sx, sy, m, moved: false, orig: new Map(), end: end.end })
    // a selected column's side or corner: drag = its size; a selected ramp's arrow head: drag = which way it runs
    const handle = (tool === 'select' || tool === 'pillar') && pillarHandleAt(sx, sy)
    if (handle) return void (dragRef.current = { hit: { kind: 'pillar', id: handle.id }, sx, sy, m, moved: false, orig: new Map(), corner: { k: handle.k, side: handle.side } })
    // the one selected wall's face dot: drag = its thickness on that side
    const face = tool === 'select' && wallFaceAt(sx, sy)
    if (face) return void (dragRef.current = { hit: { kind: 'wall', id: face.id }, sx, sy, m, moved: false, orig: new Map(), face: face.side })
    const head = tool === 'select' && rampHeadAt(sx, sy)
    if (head) return void (dragRef.current = { hit: { kind: 'label', id: head }, sx, sy, m, moved: false, orig: new Map(), aim: true })
    switch (tool) {
      case 'scale': {
        if (!state.planImage) return toast('Load a plan image first')
        dispatch({ type: 'timer-start', now: now() })
        if (!scaleStart) return setScaleStart(h.px)
        if (lineUp) {
          const at = h.snap ?? m
          setScaleStart(null)
          if (!align) return setAlign({ p: scaleStart, m: { x: at.x, y: at.y } })
          const fit = fitSheet(align.p, align.m, scaleStart, at)
          setAlign(null)
          if (!fit) return toast('Those two corners are too close together. Pick two far apart and try again.')
          if (fit.turnDeg > 3) return toast(`Those corners do not match: the picture would have to turn ${Math.round(fit.turnDeg)}°. Try again with two corners you are sure of.`)
          dispatch({ type: 'set-scale', pxPerM: fit.pxPerM, originPx: fit.originPx })
          if (state.planImage) fitView({ minX: 0, minY: 0, maxX: state.planImage.naturalW, maxY: state.planImage.naturalH })
          dispatch({ type: 'set-tool', tool: 'select' }) // done: out of the tool, so the next click is not a new line-up
          return toast('Done — the picture now sits under the drawing. Not right? Undo (Ctrl+Z), press S and line it up again.')
        }
        const end = h.px
        const pxLen = Math.hypot(end.x - scaleStart.x, end.y - scaleStart.y)
        if (pxLen < 2) return
        setScaleStart(null)
        setField({ purpose: 'scale', x: sx, y: sy, len: '', ang: '', mode: 'length', error: null, pxLen })
        return
      }
      case 'wall': {
        if (!scaleSet) return toast('Set the scale first (S)')
        // held W: one fresh wall from this press to the release, nothing before the drag starts (onPointerMove)
        const hold = holdRef.current?.key === 'w'
        const snap = (!hold && h.snap) || snapPoint(m, unit, { tolM, free: e.shiftKey })
        const at = { x: snap.x, y: snap.y, tolM }
        wallDragRef.current = { sx, sy, at, hold, moved: false }
        if (!hold) dispatch(chain ? { type: 'chain-add', at } : { type: 'chain-start', at })
        return
      }
      case 'arc': {
        // click its start, click its end, then the bulge follows the pointer: the release of the next press lays it
        if (!scaleSet) return toast('Set the scale first (S)')
        const p = h.snap ?? m
        const at = { x: p.x, y: p.y, tolM }
        if (!arc) return setArc({ a: at })
        if (!arc.b) return void (Math.hypot(at.x - arc.a.x, at.y - arc.a.y) > tolM && setArc({ ...arc, b: at }))
        arcDownRef.current = true
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
      case 'pillar': {
        if (!scaleSet) return toast('Set the scale first (S)')
        const hit = hitTest(sx, sy)
        const p = hit?.kind === 'pillar' && unit.pillars?.find((x) => x.id === hit.id)
        if (hit && p) {
          // on a column: it moves, as in Select
          dragRef.current = { hit, sx, sy, m, moved: false, orig: new Map([[p.id, { x: p.x, y: p.y }]]) }
          return dispatch({ type: 'select', ids: [p.id] })
        }
        const at = snapPoint(m, unit, { tolM, free: e.shiftKey })
        pillarDragRef.current = { sx, sy, at: { x: at.x, y: at.y }, moved: false }
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
        const col = hit.kind === 'pillar' && unit.pillars?.find((x) => x.id === hit.id)
        if (col) orig.set(col.id, { x: col.x, y: col.y })
        // an end of the selected wall extends / shortens that wall alone (Alt: its neighbours stay straight instead);
        // Alt on any other corner detaches the wall the pointer pulls (on the first move)
        const selWall = hit.kind === 'vertex' && state.selection.length === 1 ? unit.walls.find((w) => w.id === state.selection[0] && (w.a === hit.id || w.b === hit.id)) : undefined
        const detach = hit.kind === 'vertex' && e.altKey && !selWall
        const lengthOf = selWall?.id
        dragRef.current = { hit, sx, sy, m, moved: false, orig, detach, lengthOf, rigid: !!selWall && e.altKey }
        if (!e.shiftKey && !state.selection.includes(hit.id) && !detach && !lengthOf) dispatch({ type: 'select', ids: [hit.id] })
        return
      }
      case 'furniture': {
        const cur = piecesRef.current?.find((x) => x.openingId && state.selection.includes(x.id))
        const side = cur ? sideDots(cur).findIndex((c) => Math.hypot(toScreen(c).x - sx, toScreen(c).y - sy) <= 8) : -1
        if (cur && side >= 0) return void (sideRef.current = { id: cur.id, sign: side ? -1 : 1, sx, sy, moved: false })
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
    if (trace === 'pick') {
      const p = toPx(sx, sy), pi = state.planImage
      if (pi && p.x >= 0 && p.y >= 0 && p.x <= pi.naturalW && p.y <= pi.naturalH) hoverTrace.current(p)
      return
    }
    if (placingRef.current && tool === 'furniture') return void ghost(sx, sy)
    const sd = sideRef.current
    if (sd) {
      if (!sd.moved && Math.hypot(sx - sd.sx, sy - sd.sy) <= CLICK_PX) return
      sd.moved = true
      const r = sideSize(sd, sx, sy)
      return void setFurnDrag(r && pieces && resizePiece(unit, rooms, pieces, sd.id, r.sizeM, r.grow))
    }
    if (tool === 'arc' && arc) {
      // the A tool's preview: a straight line to the pointer until the end is clicked, then the arc bulging through it
      const h = computeHover(sx, sy, e.shiftKey)
      const to = arc.b ? toM(sx, sy) : (h.snap ?? h.m)
      return setHover({ ...h, ...(arc.b && { snap: null }), arc: arc.b ? arcPoints(arc.a, arc.b, to) : [arc.a, to] })
    }
    const pd = pillarDragRef.current
    if (pd) {
      // a new column dragged out: its box from the press to the pointer, snapped like a corner
      if (!pd.moved && Math.hypot(sx - pd.sx, sy - pd.sy) < 3) return
      pd.moved = true
      const b = snapPoint(toM(sx, sy), unit, { tolM, free: e.shiftKey })
      return setHover({ m: toM(sx, sy), px: toPx(sx, sy), snap: b, hit: null, box: { a: pd.at, b } })
    }
    const wd = wallDragRef.current
    if (wd && !wd.moved && Math.hypot(sx - wd.sx, sy - wd.sy) >= 3) {
      wd.moved = true
      // the dragged wall starts at the press: always a fresh one for held W; in the Wall tool when that press closed the chain
      if (wd.hold || !stateRef.current.chain) dispatch({ type: 'chain-start', at: wd.at })
    }
    const fd = dragRef.current
    if (fd?.hit.kind === 'furniture') {
      // a dragged piece goes into the hand (it follows the pointer on the grid); the reducer only sees the drop (one undo entry)
      // (a hand's click drifts a few px: up to CLICK_PX it stays a click — the piece neither moves nor goes into the hand)
      if (!fd.moved && Math.hypot(sx - fd.sx, sy - fd.sy) <= CLICK_PX) return
      fd.moved = true
      // what rests on a piece (a TV on its unit, cushions) is picked alone but drags that piece, as in the 3D view
      const p = pieces && baseOf(pieces, fd.hit.id)
      if (p) hold({ id: p.id, rot: p.rotationDeg, off: { x: p.x - fd.m.x, y: p.y - fd.m.y } })
      return
    }
    const d = dragRef.current
    if (d) {
      const m = toM(sx, sy)
      if (!d.moved) {
        if (Math.hypot(sx - d.sx, sy - d.sy) < 3) return
        d.moved = true
        dispatch({ type: 'drag-begin' })
        const id = d.hit.id
        const at = d.detach || (d.lengthOf && !d.rigid) ? unit.walls.filter((w) => w.a === id || w.b === id) : []
        if (d.lengthOf && at.length >= 2) {
          // the selected wall's end leaves the shared corner; the next move slides the new end along the wall
          const nid = newId()
          dispatch({ type: 'detach', wallId: d.lengthOf, vertexId: id, newId: nid })
          d.hit = { kind: 'vertex', id: nid }
          return
        }
        if (at.length >= 2) {
          // detach the selected wall if it ends here, else the wall the pointer pulls along; the new end then drags as a corner
          const v = vertexById(unit.vertices, id)
          const pull = (w: (typeof at)[number]) => {
            const o = vertexById(unit.vertices, w.a === id ? w.b : w.a)
            return ((o.x - v.x) * (m.x - d.m.x) + (o.y - v.y) * (m.y - d.m.y)) / Math.hypot(o.x - v.x, o.y - v.y)
          }
          const w = at.find((x) => state.selection.includes(x.id)) ?? at.reduce((p, q) => (pull(q) > pull(p) ? q : p))
          const nid = newId()
          dispatch({ type: 'detach', wallId: w.id, vertexId: id, newId: nid })
          d.hit = { kind: 'vertex', id: nid }
        }
      }
      // corners and walls snap exactly as the Wall tool's cursor (snapPoint, same radius); Shift = free
      const free = e.shiftKey
      const show = (snap: Snap, ids: Id[]) => {
        d.ids = ids
        setHover({ m, px: toPx(sx, sy), snap, hit: d.hit, moving: ids })
      }
      if (d.face) {
        // a face dot: the pointer's distance from the other face is the wall's thickness (whole inches; model 'wall-face')
        const w = unit.walls.find((x) => x.id === d.hit.id)
        if (!w) return
        const f = wallFrame(w, unit.vertices)
        const v = (m.x - f.origin.x) * f.normal.x + (m.y - f.origin.y) * f.normal.y
        dispatch({ type: 'wall-face', id: w.id, side: d.face, thicknessM: d.face * v + w.thicknessM / 2 })
      } else if (d.hit.kind === 'vertex' && d.lengthOf) {
        // the end slides along its wall; the walls at it stay straight (model.lengthMoves)
        const w = unit.walls.find((x) => x.id === d.lengthOf)
        if (!w) return
        const A = vertexById(unit.vertices, w.a === d.hit.id ? w.b : w.a)
        const E = vertexById(unit.vertices, d.hit.id)
        const L0 = Math.hypot(E.x - A.x, E.y - A.y)
        const dir = { x: (E.x - A.x) / L0, y: (E.y - A.y) / L0 }
        const along = (p: Pt) => (p.x - A.x) * dir.x + (p.y - A.y) * dir.y
        const onLine = (L: number): Pt => ({ x: A.x + dir.x * L, y: A.y + dir.y * L })
        const ids = lengthMoves(unit, w.id, d.hit.id, L0).map((v) => v.id)
        let L = along(m)
        let snap = loose(onLine(L))
        if (!free) {
          const s0 = snapPoint(onLine(L), unit, { tolM, exclude: ids })
          L = along(s0)
          const guides = s0.guides.filter((g) => Math.abs(g.axis === 'x' ? dir.x : dir.y) > 1e-6) // only guides across the line stop the end
          const kind = guides.length ? (guides[0].axis === 'x' ? 'aligned x' : 'aligned y') : HARD.has(s0.kind) ? s0.kind : 'free'
          snap = { ...s0, ...onLine(L), kind, guides }
        }
        if (L < 0.05) return // never through the anchor
        dispatch({ type: 'drag', vertices: lengthMoves(unit, w.id, d.hit.id, L) })
        show(snap, ids)
      } else if (d.hit.kind === 'vertex') {
        const snap = free ? loose(m) : snapPoint(m, unit, { tolM, exclude: [d.hit.id] })
        dispatch({ type: 'drag', vertices: [{ id: d.hit.id, x: snap.x, y: snap.y }] })
        show(snap, [d.hit.id])
      } else if (d.hit.kind === 'wall') {
        const pts = [...d.orig].map(([id, p]) => ({ id, x: p.x + m.x - d.m.x, y: p.y + m.y - d.m.y }))
        const { dx, dy, snap } = free ? { dx: 0, dy: 0, snap: loose(pts[0]) } : snapMove(pts, unit, tolM)
        dispatch({ type: 'drag', vertices: pts.map((p) => ({ id: p.id, x: p.x + dx, y: p.y + dy })) })
        show(snap, pts.map((p) => p.id))
      } else if (d.hit.kind === 'opening') {
        const w = unit.walls.find((x) => x.openings.some((o) => o.id === d.hit.id))
        const o = w?.openings.find((x) => x.id === d.hit.id)
        if (w && o) {
          const f = wallFrame(w, unit.vertices)
          const u = (m.x - f.origin.x) * f.dir.x + (m.y - f.origin.y) * f.dir.y
          dispatch(d.end ? { type: 'resize-opening', id: o.id, end: d.end, uM: u, tolM } : { type: 'drag-opening', id: o.id, offsetM: u - o.widthM / 2, tolM })
        }
      } else if (d.hit.kind === 'pillar') {
        const p = unit.pillars?.find((x) => x.id === d.hit.id)
        if (!p) return
        if (d.corner) {
          // a side: it follows the pointer (snapped as a corner), the other sides stay, whole inches; a corner: that corner
          // alone, its sides a little sticky to parallel (model 'pillar-corner')
          const c = free ? loose(m) : snapPoint(m, unit, { tolM, exclude: [p.id] })
          dispatch({ type: 'pillar-corner', id: p.id, k: d.corner.k, side: d.corner.side, x: c.x, y: c.y, sticky: !free && !HARD.has(c.kind) })
          show(c, [])
        } else {
          // its centre follows the pointer and snaps as a corner does: onto a wall's centre line, a corner, in line
          const o = d.orig.get(p.id)!
          const to = { x: o.x + m.x - d.m.x, y: o.y + m.y - d.m.y }
          const c = free ? loose(to) : snapPoint(to, unit, { tolM, exclude: [p.id] })
          dispatch({ type: 'set-pillar', id: p.id, patch: { x: c.x, y: c.y }, live: true })
          show(c, [])
        }
      } else if (d.hit.kind === 'label' && d.aim) {
        // a ramp's arrow head: the direction from its label to the pointer, onto its zone's edge directions (8°), else 5°
        const l = unit.roomLabels.find((x) => x.id === d.hit.id)
        const r = rooms.find((x) => x.id === d.hit.id)
        if (!l || !r) return
        const deg = dirDegOf({ x: m.x - l.x, y: m.y - l.y })
        dispatch({ type: 'aim-ramp', id: l.id, dirDeg: free ? Math.round(deg) % 360 : snapRampDir(r, unit, deg) })
      } else if (d.hit.kind === 'label') {
        dispatch({ type: 'drag-label', id: d.hit.id, x: m.x, y: m.y })
      }
      return
    }
    const hd = tool === 'select' || tool === 'pillar' ? pillarHandleAt(sx, sy) ?? (tool === 'select' ? wallFaceAt(sx, sy) : undefined) : undefined
    setCursor(hd?.cursor ?? null) // a column's side / corner, a wall's face dot under the pointer: its cursor
    setHover(computeHover(sx, sy, e.shiftKey))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current) setPanning(false)
    panRef.current = null
    const sd = sideRef.current
    sideRef.current = null
    if (sd) {
      const { sx, sy } = local(e)
      const r = sd.moved && sideSize(sd, sx, sy)
      setFurnDrag(null)
      return void (r && dispatch({ type: 'resize-piece', id: sd.id, ...r })) // refused: the reducer says why
    }
    const pd = pillarDragRef.current
    pillarDragRef.current = null
    if (pd) {
      const { sx, sy } = local(e)
      if (!pd.moved) dispatch({ type: 'add-pillar', ...pd.at, ...PILLAR_M })
      else {
        // the box from the press to the release, whole inches
        const b = snapPoint(toM(sx, sy), unit, { tolM, free: e.shiftKey })
        const inch = (v: number) => Math.round(Math.abs(v) / 0.0254) * 0.0254
        dispatch({ type: 'add-pillar', x: (pd.at.x + b.x) / 2, y: (pd.at.y + b.y) / 2, wM: inch(b.x - pd.at.x), hM: inch(b.y - pd.at.y) })
      }
      return setHover(computeHover(sx, sy, e.shiftKey))
    }
    const arcDown = arcDownRef.current
    arcDownRef.current = false
    if (tool === 'arc' && arc?.b && arcDown) {
      // the A tool's third press released: the arc through the release point, as short straight walls (model 'add-arc')
      const { sx, sy } = local(e)
      setArc(null)
      dispatch({ type: 'add-arc', a: arc.a, b: arc.b, via: toM(sx, sy) })
      return setHover(computeHover(sx, sy, e.shiftKey))
    }
    const wd = wallDragRef.current
    wallDragRef.current = null
    if (wd?.moved) {
      // the release is the wall's other end, snapped as the Wall tool snaps its next corner (from the press)
      const { sx, sy } = local(e)
      const snap = snapPoint(toM(sx, sy), stateRef.current.unit, { tolM, from: wd.at, free: e.shiftKey })
      dispatch({ type: 'chain-add', at: { x: snap.x, y: snap.y, tolM } })
      if (wd.hold) dispatch({ type: 'chain-end' })
    }
    if (holdRef.current?.up) endHold()
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) {
      if (e.shiftKey) dispatch({ type: 'select', ids: [d.hit.id], add: true })
      else dispatch({ type: 'select', ids: [d.hit.id] })
    } else if (d.face) {
      const { sx, sy } = local(e)
      setHover(computeHover(sx, sy, e.shiftKey))
    } else if (d.hit.kind === 'vertex' || d.hit.kind === 'wall') {
      // a corner dropped on another corner becomes that corner; on a wall, it T-splits the wall
      dispatch({ type: 'drag-end', ids: d.ids ?? [] })
      const { sx, sy } = local(e)
      setHover(computeHover(sx, sy, e.shiftKey)) // drop the drag's guides, ring and live lengths
    } else if (d.hit.kind === 'furniture') {
      const { sx, sy } = local(e)
      putDown(sx, sy) // refused: it stays in hand, red; a click where it fits puts it down
    } else if (d.hit.kind === 'pillar') {
      const { sx, sy } = local(e)
      setHover(computeHover(sx, sy, e.shiftKey)) // drop the drag's snap ring
    }
  }

  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'wall' || tool === 'arc') return
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
        if (lastPointer.current && !typing && !dragRef.current) setHover(computeHover(lastPointer.current.sx, lastPointer.current.sy, true))
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
      if (e.key === 'Escape' && trace === 'pick') return cancelTrace.current()
      if (e.key === 'Escape' && activeRef.current) return setActiveKey(null)
      if (e.key === 'Alt') return e.preventDefault() // Alt-drag detaches; a lone Alt must not focus the browser menu
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
        return dispatch({ type: 'duplicate' })
      }
      if (ctrl) return
      const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key]
      // furniture tool: arrows move the selected piece one grid square, R turns it, Delete / Backspace deletes it; T / H never touch a piece
      if (st.tool === 'furniture') {
        const pl = placingRef.current
        if (pl && e.key === 'Escape') return hold(null)
        if (pl && (e.key === 'r' || e.key === 'R')) return hold({ ...pl, rot: pl.rot + 90 })
        if (pl && (e.key === 'Delete' || e.key === 'Backspace')) {
          // the piece in hand goes (one undo step, as a Delete of a picked one); a library piece in hand is only let go
          e.preventDefault()
          hold(null)
          return void (!pl.assetId && dispatch({ type: 'delete-piece', id: pl.id }))
        }
        if (pl && arrow) return e.preventDefault() // the piece in hand is not on the plan yet
        const p = piecesRef.current?.find((x) => st.selection.includes(x.id))
        if (arrow) {
          e.preventDefault()
          if (p) dispatch({ type: 'move-piece', id: p.id, x: p.x + arrow[0] * GRID_M, y: p.y + arrow[1] * GRID_M })
          return
        }
        if (e.key === 'r' || e.key === 'R') return p && dispatch({ type: 'rotate-piece', id: p.id })
        if (e.key === 'Delete' || e.key === 'Backspace') return p && dispatch({ type: 'delete-piece', id: p.id })
        if (['t', 'T', 'h', 'H'].includes(e.key)) return
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
        setAlign(null)
        setArc(null)
        return dispatch({ type: 'select', ids: [] })
      }
      const key = e.key.toLowerCase()
      const toolKey = TOOLS.find(([, k]) => k.toLowerCase() === key)
      if (toolKey && !e.shiftKey) {
        const tl = toolKey[0]
        const spring = key in HOLD_HINTS
        if (spring) e.preventDefault() // a held key never reaches the browser
        if (e.repeat) return
        if (tl !== 'select' && tl !== 'scale' && !st.unit.planImage && !st.unit.walls.length) return setNote({ text: 'Set the scale first (S)' })
        setScaleStart(null)
        setAlign(null)
        if (spring) {
          // switch now (a tap = today's switch); the release decides whether to spring back (endHold). A second held key keeps the first one's way back.
          const h = holdRef.current
          holdRef.current = { key, tool: h?.tool ?? st.tool, selection: h?.selection ?? st.selection, used: h?.used ?? false }
          setHeld({ key, back: holdRef.current.tool })
        }
        return dispatch({ type: 'set-tool', tool: tl })
      }
      if (key === 't') return dispatch({ type: 'toggle-thickness' })
      if (key === 'h') return dispatch({ type: 'flip', what: e.shiftKey ? 'swing' : 'hinge' })
      if (e.key === 'Backspace' && st.chain) return dispatch({ type: 'chain-back' })
      if (e.key === 'Delete' || (e.key === 'Backspace' && st.tool !== 'furniture')) {
        const sel = new Set(st.selection)
        const orphaned = st.unit.walls
          .filter((w) => sel.has(w.a) || sel.has(w.b) || sel.has(w.id))
          .reduce((n, w) => n + w.openings.filter((o) => !sel.has(o.id)).length, 0)
        if (orphaned && !window.confirm(`This also removes ${orphaned} opening${orphaned === 1 ? '' : 's'}. Continue?`)) return
        return dispatch({ type: 'delete' })
      }
      if (st.tool === 'opening' && OPENING_KEYS[e.key]) return dispatch({ type: 'pick-opening', kind: OPENING_KEYS[e.key] })
      // the W tool's type (mid-chain a digit starts the typed length instead)
      if (st.tool === 'wall' && !st.chain && WALL_KEYS[Number(e.key) - 1]) return dispatch({ type: 'pick-wall', wall: WALL_KEYS[Number(e.key) - 1] })
      if (e.key === '0') return fitView()
      if (/^[0-9.]$/.test(e.key) && st.chain && st.tool === 'wall') {
        e.preventDefault()
        const p = lastPointer.current ?? { sx: size.w / 2, sy: size.h / 2 }
        setField({ purpose: 'chain', x: p.sx, y: p.sy, len: e.key, ang: '', mode: 'length', error: null })
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
      if (e.key.toLowerCase() === holdRef.current?.key) {
        e.preventDefault()
        endHold()
      }
      if (e.key === 'Shift') {
        shiftRef.current = false
        const t = e.target as HTMLElement
        if (lastPointer.current && t.tagName !== 'INPUT' && !dragRef.current) setHover(computeHover(lastPointer.current.sx, lastPointer.current.sy, false))
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', endHold) // a key released in another window never sends its keyup here
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', endHold)
    }
  }, [exportJson, fitView, computeHover, popover, size, trace])

  // ----- issues and review rows → pan/zoom to the mark, select what it is about (a loose corner: ready to drag), open it
  const openMark = (row: Mark) => {
    const m = (row.twinOf && marks.find((x) => x.key === row.twinOf)) || row // a "Check these" row on an issue's spot opens that issue
    const ids = m.issue ? (m.issue.code === 'unlabelled-room' ? [] : m.issue.ids) : m.review?.entityId ? [m.review.entityId] : []
    const sel = ids.filter((id) => findEntity(unit, id))
    focusOn([...(m.at ? [m.at] : []), ...sel.flatMap((id) => entityPoints(unit, id))], sel, 3)
    setActiveKey(m.key)
  }
  /** s27 AI-prep: a "Check these" row answered (its buttons, here and on the plan) — logged, then applied by id (applyAnswer) */
  const answer = (rowId: string, id: string) => {
    // a row clicked while the list is still being worked out (s27 rows): its own answers go in first
    let s = stateRef.current
    const m = marks.find((x) => x.review?.id === rowId)
    if (m && fixes && !s.review?.items.find((i) => i.id === rowId)?.answers) {
      const own = { type: 'answers' as const, unit: s.unit, rows: answersOf(s.unit, [m], fixes) }
      s = studioReducer(s, own)
      dispatch(own)
    }
    try {
      logAnswer(localStorage, s, rowId, id)
    } catch {
      /* storage full or blocked: the answer still counts on the plan */
    }
    dispatch({ type: 'answer', rowId, answerId: id })
    if (id !== LOOKS_RIGHT && id !== SHOW_ME) setActiveKey(null) // (Show me keeps its mark open with the hint, as before)
  }
  // ----- s27 Local AI: rows asked of the model on this PC (localAI.ts), one request at a time (the card holds one model)
  const [aiNotes, setAiNotes] = useState<Record<string, AiNote>>({})
  const aiNote = (id: string, n: AiNote | null) =>
    setAiNotes((m) => {
      const x = { ...m }
      if (n) x[id] = n
      else delete x[id]
      return x
    })
  const aiQueue = useRef(Promise.resolve())
  const live = useRef({ img, review })
  live.current = { img, review }
  /** `all`: Ask AI for all — a row of a kind the AI is not trusted on (localAI UNTRUSTED) is skipped, and says so */
  const askAI = (rowIds: string[], all = false) => {
    for (const id of rowIds) {
      const r = live.current.review.find((i) => i.id === id)
      const skip = all && r ? UNTRUSTED[r.kind] : undefined
      if (skip) {
        aiNote(id, { row: r!.message, skip })
        continue
      }
      aiNote(id, { row: '', busy: true })
      aiQueue.current = aiQueue.current.then(() => askOne(id))
    }
  }
  const askOne = async (rowId: string) => {
    const msg = () => live.current.review.find((i) => i.id === rowId)?.message
    try {
      // its answers come back a moment after any edit (the fixes loop above): wait for them; a row that went is left
      let item = stateRef.current.review?.items.find((i) => i.id === rowId)
      for (let t = 0; !(item?.answers && item.box); t++) {
        if (!msg()) return aiNote(rowId, null)
        if (t > 240) throw new Error('its answers are not worked out yet — ask again in a moment')
        await new Promise((r) => setTimeout(r, 250))
        item = stateRef.current.review?.items.find((i) => i.id === rowId)
      }
      const im = live.current.img
      if (!im) throw new Error('the sheet picture is not loaded')
      const s = stateRef.current
      const { note, fix } = await askRow(s, rowId, rowPicture(im, s.unit, { ...item, box: item.box }), msg() ?? item.message, () => stateRef.current)
      if (fix) dispatch({ type: 'answer', rowId, answerId: fix }) // = applyAnswer: one undo step
      aiNote(rowId, note)
      // the next row in line must see the plan WITH this fix (else it is asked on the old plan and dropped as "changed")
      for (let t = 0; fix && stateRef.current.unit === s.unit && t < 40; t++) await new Promise((r) => setTimeout(r, 50))
    } catch (e) {
      aiNote(rowId, { row: msg() ?? '', error: (e as Error).message })
    }
  }
  // an AI fix taken back (its Undo or Ctrl+Z): the plan is the one before it again — its note goes
  useEffect(() => {
    for (const [id, n] of Object.entries(aiNotes)) if (n.before === state.unit) aiNote(id, null)
  }, [state.unit]) // eslint-disable-line react-hooks/exhaustive-deps
  /** an AI fix undone: only while it is still the last undo step (else Ctrl+Z steps back through the later edits) */
  const undoAI = (rowId: string) => {
    const b = aiNotes[rowId]?.before
    if (b && stateRef.current.history.past[stateRef.current.history.past.length - 1] === b) dispatch({ type: 'undo' })
    aiNote(rowId, null)
  }
  const applyFix = (f: Fix) => {
    // a row's fix on the plan's popover (the row's own mark, or the issue it sits on): that row's answer
    const row = activeKey ? marks.find((m) => m.review && (m.twinOf ?? m.key) === activeKey && [...(fixes?.get(m.key)?.fixes ?? []), ...(fixes?.get(activeKey)?.fixes ?? [])].includes(f)) : undefined
    if (row) return answer(row.review!.id, answerId(f.label))
    dispatch({ type: 'apply-fix', actions: f.actions, label: f.label })
    setActiveKey(null)
  }
  const nameRoom = (at: Pt, name: string) => {
    // an unnamed space's "Space N" label sits there (a "Check these" row): it is renamed, not doubled
    const l = unit.roomLabels.find((x) => x.x === at.x && x.y === at.y)
    dispatch(l ? { type: 'update-label', id: l.id, patch: { name, kind: guessKind(name) } } : { type: 'add-label', label: { name, kind: guessKind(name), x: at.x, y: at.y } })
    setActiveKey(null)
  }
  const focusOn = (pts: Pt[], selectable: Id[], padM = 2) => {
    dispatch({ type: 'select', ids: selectable })
    if (!pts.length) return
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const lo = mToPx(frame, { x: Math.min(...xs) - padM, y: Math.min(...ys) - padM }) // context around the issue
    const hi = mToPx(frame, { x: Math.max(...xs) + padM, y: Math.max(...ys) + padM })
    fitView({ minX: lo.x, minY: lo.y, maxX: hi.x, maxY: hi.y })
  }

  const savePopover = () => {
    if (!popover) return
    const name = popover.name.trim() || 'Room'
    const label = { name, kind: popover.kind, x: popover.x, y: popover.y, printedSize: popover.printedSize.trim() || undefined, levelM: popover.levelM, slope: popover.slope }
    if (popover.labelId) dispatch({ type: 'update-label', id: popover.labelId, patch: label })
    else dispatch({ type: 'add-label', label: Object.fromEntries(Object.entries(label).filter(([, x]) => x !== undefined)) as typeof label })
    setPopover(null)
  }

  const startOver = () => {
    const a = projRef.current
    if (a?.drawing) setActive({ id: a.id }) // the project drawing keeps what it had; the empty Studio is not it
    localStorage.removeItem(DRAFT_KEY)
    dispatch({ type: 'reset' })
    setRestored(null)
    setMissingPlan(null)
  }

  // ----- status text
  const hint =
    trace === 'pick'
      ? 'Auto-trace · click inside the flat you want to trace, or Whole floor · Esc cancels'
      : held
        ? `Holding ${held.key.toUpperCase()} · ${HOLD_HINTS[held.key]} · let go to return to ${TOOLS.find(([t]) => t === held.back)![2]} (a tap switches tools)`
      : (chain
      ? chain.ids.length >= 3
        ? 'Wall · Click the start corner to close'
        : 'Wall · Click the next corner, or type its printed length'
      : tool === 'scale' && lineUp
        ? !state.planImage
          ? 'Line up · load the plan picture first (drop it on the page)'
          : `Line up the picture with the drawing · ${align ? 2 : 1} of 2 · ${scaleStart ? 'now click the SAME corner in the drawing' : align ? 'click another corner on the picture, far from the first' : 'click a corner on the picture'}`
      : tool === 'scale' && scaleStart
        ? 'Scale · click the other end'
        : tool === 'furniture' && placing
          ? placing.assetId
            ? 'Furniture · click the plan to put the piece there, R turns it, Esc cancels'
            : 'Furniture · the piece is in your hand: click where it fits (red = it does not, the reason is in red here), R turns it, Esc puts it back'
          : tool === 'wall'
            ? `Wall · drawing a ${WALL_TYPES[state.wallType ?? 'wall'].label.toLowerCase()} (1 wall, 2 low wall, 3 kerb, 4 zone line) · click the first corner, or drag from corner to corner`
            : tool === 'arc' && arc
              ? arc.b
                ? 'Arc · move (or drag) to bend it, click to lay it · Esc cancels'
                : 'Arc · click where it ends · Esc cancels'
              : HINTS[tool]) +
    (tool === 'select' || tool === 'furniture' ? '' : ' · V to move things') +
    ' · Space-drag to pan · wheel zooms'
  let centre = ''
  // W's next corner or A's end: the length from the last point and what the click sticks to (A: no angle)
  const from = chain ? vertexById(unit.vertices, chain.ids[chain.ids.length - 1]) : tool === 'arc' && arc && !arc.b ? arc.a : null
  const sticks = hover?.snap && (hover.snap.kind === 'wall' ? 'wall — will split' : hover.snap.kind)
  if (from && hover?.snap) {
    const len = Math.hypot(hover.snap.x - from.x, hover.snap.y - from.y)
    const ang = chain ? `${shiftRef.current ? 'free' : `${Math.round(hover.snap.angleDeg ?? 0)}°`} · ` : ''
    centre = `${formatFeetInches(len)} · ${len.toFixed(2)} m · ${ang}snapped: ${sticks}`
  } else if ((tool === 'wall' || tool === 'arc') && !arc?.b && hover?.snap && HARD.has(hover.snap.kind)) {
    centre = `snapped: ${sticks}` // W's first corner, A's start
  } else if (hover?.arc && arc?.b) {
    centre = `${hover.arc.length - 1} straight wall${hover.arc.length === 2 ? '' : 's'}`
  } else if (tool === 'scale' && scaleStart && hover && !lineUp) {
    centre = `${Math.round(Math.hypot(hover.px.x - scaleStart.x, hover.px.y - scaleStart.y))} px`
  } else if (tool === 'opening' && hover?.ghost) {
    const g = hover.ghost
    const why = g.error ?? (g.snapped && `snapped: ${g.snapped === 'corner' ? 'corner' : `next to ${g.snapped}`}`)
    centre = [g.opening.kind, formatFeetInches(g.opening.widthM), why].filter(Boolean).join(' · ')
  } else if (furnDrag) {
    centre = `${pieceLabel(furnDrag.piece)} · ${furnDrag.error ?? `snapped: ${furnDrag.snapped === 'wall' ? 'wall' : '3" grid'}`}`
  } else if (hover?.hit?.kind === 'furniture') {
    const p = pieces?.find((x) => x.id === hover.hit!.id)
    centre = p ? pieceLabel(p) : ''
  } else if (tool === 'select' && hover?.snap) {
    // dragging a corner or a wall: the selected wall's live length, and what the drag snapped to (Wall tool wording)
    const w = state.selection.length === 1 ? unit.walls.find((x) => x.id === state.selection[0]) : undefined
    const len = w ? wallFrame(w, unit.vertices).lengthM : 0
    const snapped = shiftRef.current ? 'free' : `snapped: ${hover.snap.kind === 'wall' ? 'wall — will split' : hover.snap.kind}`
    centre = w ? `${formatFeetInches(len)} · ${len.toFixed(2)} m · ${snapped}` : snapped
  } else if (hover?.hit) centre = hover.hit.kind === 'pillar' ? 'column' : hover.hit.kind
  const scaleText = unit.planImage ? `1 px = ${(1 / unit.planImage.pxPerM).toFixed(4)} m` : unit.walls.length ? 'Real sizes · no picture lined up' : 'Scale not set'
  /** the first floor of the project the open drawing is on (the drop prompt names it) */
  const openSlot = project && active?.drawing ? slotsOf(project).find((r) => r.unitIds.includes(active.drawing!)) : undefined

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
        <span className="staff-badge" title="Staff mode is on in this browser: the 3D viewer (Preview 3D, or any unit) shows Edit furniture — move, turn, resize, delete, add — and Edit plan. Buyer links never do.">
          Staff mode
        </span>
        <input className="meta wide" placeholder="Unit name" value={unit.name} onChange={meta('name')} />
        <input className="meta" placeholder="Project" value={unit.projectName} onChange={meta('projectName')} />
        <input className="meta narrow" placeholder="Floor" type="number" value={unit.floor ?? ''} onChange={meta('floor')} />
        <input className="meta narrow" placeholder="Area sft" title="The flat's area as the sheet prints it (sqft)" type="number" value={unit.areaSqft || ''} onChange={meta('areaSqft')} />
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
        {state.planImage && (
          <button
            className="primary"
            disabled={!img || !!trace}
            title="Trace the plan automatically: click inside a flat, then check what it lists on the right. Everything stays editable."
            onClick={startAutoTrace}
          >
            Auto-trace
          </button>
        )}
        <button onClick={() => jsonRef.current?.click()}>Import</button>
        <button onClick={exportJson}>Export</button>
        <button title="Download every Check-these answer clicked in this browser (row, answer, sheet, time) — the test set for an AI helper later" onClick={exportAnswers}>
          Export answers
        </button>
        {/* never locked on a draft (founder, 2026-10-03): the 3D shows the plan as it is, open rooms have no floor yet */}
        <button className="primary" title={errors ? `${errors} error${errors > 1 ? 's' : ''} in Issues — the 3D shows the plan as it is` : undefined} onClick={preview}>
          Preview 3D
        </button>
        <button
          className={listOpen ? 'on' : ''}
          title="Your project's floors: make a project, draw each floor, then Show building"
          onClick={() => {
            setBuildingOpen(false)
            setListOpen((v) => !v)
          }}
        >
          Building
        </button>
        <button
          className={siteOpen ? 'on' : ''}
          title="Where the building stands: find it on the map, click the plot (neighbour blocks, roads, wind), set true north"
          onClick={() => {
            setBuildingOpen(false)
            setSiteOpen((v) => !v)
          }}
        >
          Site
        </button>
        {sharingConfigured && (
          <button disabled={sharing} title="Publish this draft and copy a buyer link (/s/…) — every click makes a new link" onClick={() => void share()}>
            {sharing ? 'Sharing…' : 'Share link'}
          </button>
        )}
        {sharingConfigured && (
          <button title="What buyers noted and chose on your share links: who, when, which finish, the price" onClick={() => window.open('/changes', '_blank')}>
            Change list
          </button>
        )}
        <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={(e) => onFiles(e.target.files)} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => onFiles(e.target.files)} />
      </header>

      <div className={listOpen ? 'main with-floors' : 'main'}>
        <div className="canvas-wrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            tabIndex={-1}
            style={{ width: size.w, height: size.h, cursor: panning ? 'grabbing' : (cursor ?? (trace !== 'pick' && (tool === 'select' || tool === 'furniture') ? 'default' : 'crosshair')) }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onMouseDown={(e) => e.preventDefault()} // no middle-click autoscroll, no focus steal from a field opened by this click
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
          />
          {buildingOpen && (
            <ProjectPanel
              unit={unit}
              roomCount={rooms.length}
              onShow={showBuilding}
              onOpen={openBuilding}
              onClose={() => {
                setBuildingOpen(false)
                setProjects(readProjects())
              }}
              onToast={toast}
            />
          )}
          {siteOpen && <NorthArrow northDeg={unit.northDeg} width={size.w} height={size.h} onChange={(northDeg) => dispatch({ type: 'set-meta', patch: { northDeg } })} />}
          {siteOpen && <SitePanel unit={unit} onSite={setSite} onNorth={(northDeg) => dispatch({ type: 'set-meta', patch: { northDeg } })} onClose={() => setSiteOpen(false)} />}
          {trace !== 'pick' && (
            <IssueLayer
              marks={marks}
              fixes={fixes}
              toScreen={toScreen}
              width={size.w}
              height={size.h}
              active={activeKey}
              hot={hotKey}
              onActivate={setActiveKey}
              onFix={applyFix}
              onName={nameRoom}
              clickable={tool === 'select'}
            />
          )}
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
                    setAlign(null)
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
              {!project && !unit.vertices.length && !missingPlan && <NewProject onCreate={createProject} />}
              <div className="drop">
                <p>
                  {missingPlan
                    ? `Plan image not found — drop \`${missingPlan}\` here to trace over it`
                    : openSlot
                      ? `Drop the plan picture of ${openSlot.label.toLowerCase()} here (PNG, JPG, WEBP)`
                      : 'Drop the floor plan here (PNG, JPG, WEBP)'}
                </p>
                <button className="primary" onClick={() => fileRef.current?.click()}>
                  Choose plan image…
                </button>
              </div>
            </div>
          )}
          {trace && (
            <div className="trace-card" role="status">
              {trace === 'pick' ? (
                <>
                  <span>{prep ? `Reading the plan (${prep})… then click inside the flat` : 'Point at a flat to see it · click inside the one you want to trace'}</span>
                  {/* Level 4: every flat + the core in one go */}
                  <button title="Trace every flat of this floor and the lobby, stair and lifts between them, in one go" onClick={() => pickTrace.current(null)}>
                    Whole floor
                  </button>
                </>
              ) : (
                <>
                  <span>
                    Auto-trace · {trace.stage} · {Math.round(trace.fraction * 100)} %
                  </span>
                  <progress value={trace.fraction} />
                </>
              )}
              <button onClick={() => cancelTrace.current()}>Cancel</button>
            </div>
          )}
          {field && (
            <div className="field" style={{ left: Math.max(0, Math.min(field.x + 12, size.w - 180)), top: Math.max(0, Math.min(field.y + 12, size.h - 90)) }}>
              <label>{field.purpose === 'scale' ? 'Its real length' : field.mode === 'angle' ? 'Angle (°)' : 'Length'}</label>
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
            <div className="popover" style={{ left: Math.min(popover.sx + 12, size.w - 280), top: Math.max(0, Math.min(popover.sy + 12, size.h - (popover.slope ? 420 : 330))) }}>
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
                    if (e.key.toLowerCase() === holdRef.current?.key) return e.preventDefault() // the held R's key repeat types nothing
                    if (e.key === 'Enter') savePopover()
                    if (e.key === 'Escape') setPopover(null)
                  }}
                />
              </label>
              <label>
                <span>Kind</span>
                <KindSelect value={popover.kind} onChange={(kind) => setPopover({ ...popover, kind, kindTouched: true })} />
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
              <LevelFields levelM={popover.levelM} slope={popover.slope} dirs={popover.dirs} onChange={(p) => setPopover({ ...popover, ...p })} />
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
        {listOpen && (
          <FloorList
            projects={projects}
            project={project}
            drawing={active?.drawing}
            unit={unit}
            fresh={fresh}
            onStore={storeProjects}
            onCreate={createProject}
            onActivate={activate}
            onOpen={openDrawing}
            onRename={(name) => dispatch({ type: 'set-meta', patch: { name } })}
            onShow={showProject}
            onOldWay={() => setBuildingOpen(true)}
            onClose={() => setListOpen(false)}
            onToast={toast}
          />
        )}
        <Panel
          state={state}
          dispatch={dispatch}
          rooms={rooms}
          flats={flats}
          issues={issues}
          marks={marks}
          fixes={fixes}
          active={activeKey}
          onHot={setHotKey}
          onOpen={openMark}
          onFix={applyFix}
          onAnswer={answer}
          ai={{ notes: aiNotes, ask: askAI, undo: undoAI, canUndo: (b) => state.history.past[state.history.past.length - 1] === b, apply: (rowId, id) => (answer(rowId, id), aiNote(rowId, null)) }}
          pieces={pieces}
          placing={placing?.assetId ?? null}
          onPlace={(assetId) => hold(assetId ? { id: newId(), assetId, rot: 0 } : null)}
        />
      </div>

      <footer className="statusbar">
        <span>{hint}</span>
        <span className="centre" style={furnDrag?.error ? { color: '#e5534b' } : undefined}>
          {centre}
        </span>
        <span>
          {scaleText} · {Math.round(view.zoom * 100)} %
        </span>
      </footer>
    </div>
  )
}
