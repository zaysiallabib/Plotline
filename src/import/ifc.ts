/**
 * IFC (2x3, 4, 4.3; .ifc / .ifczip) → one Unit draft per storey + the exact shell as a GLB. See types.ts for the frame.
 *
 * web-ifc parses the file and builds every product's mesh in a y-up metre frame that IS our world frame (X = file x,
 * Y = file z, Z = −file y, metres) — the shell takes those triangles as they come, shifted so the lowest storey's floor
 * is Y = 0. The walls come from their 'Axis' curve (through the placement chain, which this file walks itself), else from
 * the body's footprint; openings from their void's body projected onto the wall; columns and spaces from their bodies.
 * Plan: x = world X − origin.x, y = world Z + origin.y, the origin being the lowest storey's placement in file x / y.
 *
 * "If there is a wall and an outside view then follow the measurements, no need to complicate things" (founder).
 */
import type { ImportResult, ImportedStorey } from './types'
import { deriveRooms, newId, pointInPolygon, roomPolygon, validate } from '../core'
import type { Id, Opening, OpeningKind, Pillar, Pt, RoomLabel, Unit, Vertex, Wall } from '../core'
import { PARTITION_M, WALL_HEIGHT_M, ZONE_LINE_M, emptyUnit, guessKind, studioIssues } from '../studio/model'
import { writeGlb, type GlbGroup } from './glb'
import { settleImport } from './plan2d'
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'

type WebIfc = typeof import('web-ifc')
type Api = InstanceType<WebIfc['IfcAPI']>

/** corners closer than this are one corner */
const SNAP_M = 0.01
/** a curved axis is cut into chords this far from the arc at most */
const CHORD_M = 0.02
/** a wall end at least this close to another wall's centre line is moved onto it (more for a thick wall: half its thickness + 1 cm) */
const END_SNAP_M = 0.05
/** a wall piece shorter than this after the snap is a nib, not a wall */
const MIN_PIECE_M = 0.05
/** a space outline edge this close to a wall's centre line (more for a thick wall: half its thickness + 2 cm) is that wall, not a zone line */
const ON_WALL_M = 0.1
const TRIANGLE_CAP = 1_500_000
/**
 * A wall footprint wider than this across is no straight wall: a glass front turning a corner, read as one box round both
 * sides (LTU A-House: two curtain walls 17 m and 9 m "thick" swallowed 1 476 wall pieces of a storey, 2 887 crossings).
 * Such a wall is read from its parts' straight runs (curtainRuns), else left to the outside shape.
 */
const MAX_THICK_M = 1.5
/** a curtain wall's part shorter than this along its long side is a mullion's section, not a run of the front */
const RUN_PART_M = 0.3
/** parts on one line with a gap up to this between them are one run (a mullion, a door in the front) */
const RUN_GAP_M = 0.6

// ---------- web-ifc ----------

let apiPromise: Promise<{ W: WebIfc; api: Api }> | null = null
/** Node (the tests) — not the browser's page or its worker (ifc.worker.ts), which have no `process` */
const NODE = typeof process !== 'undefined' && !!process.versions?.node

/** How far a read is, for the Studio's progress line: what it is doing in plain words, and 0..1. */
export type Progress = (stage: string, fraction: number) => void

/** One wasm instance for the session (web-ifc's Init is the slow part). Browser: the wasm comes from Vite's asset URL. */
function loadApi(): Promise<{ W: WebIfc; api: Api }> {
  apiPromise ??= (async () => {
    const mod = (await import('web-ifc')) as WebIfc & { default?: WebIfc }
    const W = mod.IfcAPI ? mod : mod.default! // Node's CommonJS build lands under `default`
    const api = new W.IfcAPI()
    if (!NODE) {
      const wasmUrl = (await import('web-ifc/web-ifc.wasm?url')).default
      await api.Init((path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path))
    } else await api.Init()
    return { W, api }
  })()
  return apiPromise
}

// ---------- small vector helpers (file axes, metres) ----------

type V3 = [number, number, number]
/** a placement: x, y, z unit columns + origin */
interface Frame {
  x: V3
  y: V3
  z: V3
  o: V3
}
const IDENTITY: Frame = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] }
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const apply = (f: Frame, p: V3): V3 => [
  f.o[0] + f.x[0] * p[0] + f.y[0] * p[1] + f.z[0] * p[2],
  f.o[1] + f.x[1] * p[0] + f.y[1] * p[1] + f.z[1] * p[2],
  f.o[2] + f.x[2] * p[0] + f.y[2] * p[1] + f.z[2] * p[2],
]
const rotate = (f: Frame, v: V3): V3 => [
  f.x[0] * v[0] + f.y[0] * v[1] + f.z[0] * v[2],
  f.x[1] * v[0] + f.y[1] * v[1] + f.z[1] * v[2],
  f.x[2] * v[0] + f.y[2] * v[1] + f.z[2] * v[2],
]
const compose = (parent: Frame, local: Frame): Frame => ({ x: rotate(parent, local.x), y: rotate(parent, local.y), z: rotate(parent, local.z), o: apply(parent, local.o) })

// ---------- plan geometry ----------

const hull = (pts: Pt[]): Pt[] => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cr = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Pt[] = [], upper: Pt[] = []
  for (const q of p) {
    while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

interface Rect {
  centre: Pt
  dir: Pt
  lengthM: number
  widthM: number
}

/** the smallest rectangle around the points: its long axis is a wall's centre line, its short side the thickness */
function minRect(pts: Pt[]): Rect | null {
  const h = hull(pts)
  if (h.length < 2) return null
  let best: Rect | null = null
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 1e-9) continue
    const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (const p of h) {
      const u = p.x * d.x + p.y * d.y, v = -p.x * d.y + p.y * d.x
      u0 = Math.min(u0, u), u1 = Math.max(u1, u), v0 = Math.min(v0, v), v1 = Math.max(v1, v)
    }
    const area = (u1 - u0) * (v1 - v0)
    if (best && area >= best.lengthM * best.widthM) continue
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
    const r: Rect = { centre: { x: cu * d.x - cv * d.y, y: cu * d.y + cv * d.x }, dir: d, lengthM: u1 - u0, widthM: v1 - v0 }
    if (r.lengthM < r.widthM) Object.assign(r, { dir: { x: -d.y, y: d.x }, lengthM: r.widthM, widthM: r.lengthM })
    best = r
  }
  return best
}

// ---------- what one mesh tells (plan footprint + height range) ----------

interface Body {
  pts: Pt[]
  minY: number
  maxY: number
  /** a point surely inside the footprint: the centroid of the largest downward-facing triangle (spaces) */
  inside?: Pt
  insideY?: number
  insideArea?: number
  /** the downward-facing triangles (a space's floor) with their height: its exact footprint outline comes from them */
  floorTris?: { pts: [Pt, Pt, Pt]; y: number }[]
}

/** one wall's centre line on one storey, with its openings, before the Studio joins the graph */
interface WallDraft {
  pts: Pt[]
  thicknessM: number
  heightM: number
  /** [segment index, opening] */
  openings: [number, Opening][]
}

// ---------- the importer ----------

export async function importIfc(bytes: ArrayBuffer, name: string, progress: Progress = () => {}): Promise<ImportResult> {
  const t0 = Date.now()
  progress('starting the reader', 0)
  const { W, api } = await loadApi()
  const data = name.toLowerCase().endsWith('.ifczip') ? unzipIfc(new Uint8Array(bytes)) : new Uint8Array(bytes)
  progress(`opening the file (${Math.max(1, Math.round(data.byteLength / 1e6))} MB)`, 0.03)
  const model = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false })
  try {
    return readModel(W, api, model, name, t0, progress)
  } finally {
    api.CloseModel(model)
  }
}

function readModel(W: WebIfc, api: Api, model: number, fileName: string, t0: number, progress: Progress): ImportResult {
  const notes: string[] = []
  const line = (id: number): any => api.GetLine(model, id)
  const val = (x: any): any => (x == null ? undefined : typeof x === 'object' && 'value' in x ? x.value : x)
  const idsOf = (type: number): number[] => {
    const v = api.GetLineIDsWithType(model, type, true)
    const out: number[] = []
    for (let i = 0; i < v.size(); i++) out.push(v.get(i))
    return out
  }
  const typeName = (id: number): string => api.GetNameFromTypeCode(api.GetLineType(model, id))
  const isA = (id: number, type: number): boolean => {
    const t = api.GetLineType(model, id)
    return t === type || idsOfSet(type).has(id)
  }
  const setCache = new Map<number, Set<number>>()
  const idsOfSet = (type: number): Set<number> => {
    let s = setCache.get(type)
    if (!s) setCache.set(type, (s = new Set(idsOf(type))))
    return s
  }

  // header
  const schema = api.GetModelSchema(model)
  let tool = ''
  try {
    const h = api.GetHeaderLine(model, W.FILE_NAME)
    tool = [val(h?.arguments?.[5]), val(h?.arguments?.[4])].filter((s) => typeof s === 'string' && s.trim()).join(' / ')
  } catch {
    /* no header line */
  }
  notes.push(`Schema ${schema}${tool ? `, written by ${tool}` : ''}.`)

  // units
  let scale = 1
  let angle = 1 // plane angle unit → radians
  let unitWord = 'metres'
  for (const ua of idsOf(W.IFCUNITASSIGNMENT)) {
    for (const ref of line(ua).Units ?? []) {
      const u = line(ref.value)
      const kind = val(u.UnitType)
      if (kind === 'LENGTHUNIT') {
        const r = unitFactor(u)
        if (r) (scale = r.factor), (unitWord = r.word)
      } else if (kind === 'PLANEANGLEUNIT') {
        const r = unitFactor(u)
        if (r) angle = r.factor
      }
    }
  }
  function unitFactor(u: any): { factor: number; word: string } | null {
    if (u.type === W.IFCSIUNIT) {
      const prefix: Record<string, number> = { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 }
      const p = val(u.Prefix) as string | undefined
      const nm = val(u.Name) as string
      if (nm === 'RADIAN') return { factor: 1, word: 'radians' }
      return { factor: p ? (prefix[p] ?? 1) : 1, word: `${(p ?? '').toLowerCase()}${nm.toLowerCase()}s` }
    }
    if (u.type === W.IFCCONVERSIONBASEDUNIT) {
      const f = line(u.ConversionFactor.value)
      const base = f.UnitComponent ? unitFactor(line(f.UnitComponent.value)) : null
      const v = val(f.ValueComponent)
      if (typeof v === 'number' && base) return { factor: v * base.factor, word: String(val(u.Name) ?? 'units').toLowerCase() }
    }
    return null
  }
  notes.push(`Lengths in the file are ${unitWord} (× ${scale} = metres).`)

  // true north
  let northDeg = 0
  let northFound = false
  for (const c of idsOf(W.IFCGEOMETRICREPRESENTATIONCONTEXT)) {
    const ctx = line(c)
    if (ctx.type !== W.IFCGEOMETRICREPRESENTATIONCONTEXT || !ctx.TrueNorth) continue
    const d = (line(ctx.TrueNorth.value).DirectionRatios ?? []).map(val) as number[]
    if (d.length >= 2 && (d[0] || d[1])) {
      northDeg = ((Math.atan2(d[0], d[1]) * 180) / Math.PI + 360) % 360
      northFound = true
      break
    }
  }
  notes.push(northFound ? `True north: ${northDeg.toFixed(1)}° clockwise from the plan's up.` : 'The file names no true north: the plan\'s up is taken as north.')

  // placements (file axes, metres)
  const frames = new Map<number, Frame>()
  const axisFrame = (id: number): Frame => {
    const a = line(id)
    const loc = ((a.Location && line(a.Location.value).Coordinates) ?? []).map(val) as number[]
    const o: V3 = [(loc[0] ?? 0) * scale, (loc[1] ?? 0) * scale, (loc[2] ?? 0) * scale]
    const z: V3 = a.Axis ? norm(line(a.Axis.value).DirectionRatios.map(val).concat([0, 0]).slice(0, 3) as V3) : [0, 0, 1]
    let x: V3 = a.RefDirection ? (line(a.RefDirection.value).DirectionRatios.map(val).concat([0, 0]).slice(0, 3) as V3) : [1, 0, 0]
    const dz = x[0] * z[0] + x[1] * z[1] + x[2] * z[2]
    x = norm([x[0] - dz * z[0], x[1] - dz * z[1], x[2] - dz * z[2]])
    if (!Number.isFinite(x[0]) || Math.hypot(...x) < 1e-6) x = Math.abs(z[0]) < 0.9 ? norm(cross([1, 0, 0], z)) : norm(cross([0, 1, 0], z))
    return { x, y: cross(z, x), z, o }
  }
  const worldFrame = (placementId: number | undefined, depth = 0): Frame => {
    if (!placementId || depth > 64) return IDENTITY
    const cached = frames.get(placementId)
    if (cached) return cached
    const p = line(placementId)
    let f = IDENTITY
    if (p.type === W.IFCLOCALPLACEMENT) {
      const parent = worldFrame(p.PlacementRelTo?.value, depth + 1)
      f = p.RelativePlacement ? compose(parent, axisFrame(p.RelativePlacement.value)) : parent
    } // grid / linear placements: identity (noted below when a wall lands on it)
    frames.set(placementId, f)
    return f
  }

  // storeys, lowest first; everything hangs off them by containment or aggregation
  interface Storey {
    id: number
    name: string
    z: number
    walls: number[]
    columns: number[]
    spaces: number[]
  }
  const allStoreys: Storey[] = idsOf(W.IFCBUILDINGSTOREY).map((id) => {
    const s = line(id)
    const pz = s.ObjectPlacement ? worldFrame(s.ObjectPlacement.value).o[2] : NaN
    const ez = val(s.Elevation)
    return { id, name: String(val(s.Name) ?? val(s.LongName) ?? `Storey`), z: Number.isFinite(pz) ? pz : typeof ez === 'number' ? ez * scale : 0, walls: [], columns: [], spaces: [] }
  })
  allStoreys.sort((a, b) => a.z - b.z)
  // storeys at one height are one floor (Revit writes one per linked model: the rooms on one, the walls on another)
  const storeys: Storey[] = []
  const storeyOfId = new Map<number, Storey>()
  for (const s of allStoreys) {
    const same = storeys.find((t) => Math.abs(t.z - s.z) <= 0.01)
    if (same) {
      if (s.name.length > same.name.length) same.name = s.name
      storeyOfId.set(s.id, same)
    } else storeys.push(s), storeyOfId.set(s.id, s)
  }
  if (!storeys.length) notes.push('The file has no building storeys: no floor plan could be made, only the outside shape.')
  if (allStoreys.length > storeys.length) notes.push(`${allStoreys.length} storeys in the file share ${storeys.length} heights: those at one height were joined into one floor.`)
  const baseY = storeys[0]?.z ?? 0
  const parentOf = new Map<number, number>() // element → what contains or aggregates it
  for (const r of idsOf(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = line(r)
    for (const e of rel.RelatedElements ?? []) parentOf.set(e.value, rel.RelatingStructure.value)
  }
  const aggregateParent = new Map<number, number>()
  for (const r of idsOf(W.IFCRELAGGREGATES)) {
    const rel = line(r)
    for (const e of rel.RelatedObjects ?? []) {
      aggregateParent.set(e.value, rel.RelatingObject.value)
      if (!parentOf.has(e.value)) parentOf.set(e.value, rel.RelatingObject.value)
    }
  }
  const storeyOf = (id: number): Storey | undefined => {
    for (let i = 0, cur: number | undefined = id; cur !== undefined && i < 32; i++) {
      const s = storeyOfId.get(cur)
      if (s) return s
      cur = parentOf.get(cur)
    }
    return undefined
  }
  /** the wall / curtain wall / column a part's body belongs to */
  const ownerOf = (id: number): number => {
    for (let i = 0, cur = id; i < 8; i++) {
      if (isA(cur, W.IFCWALL) || isA(cur, W.IFCCURTAINWALL) || isA(cur, W.IFCCOLUMN)) return cur
      const p = aggregateParent.get(cur)
      if (p === undefined) return id
      cur = p
    }
    return id
  }

  // the plan origin: the lowest storey's placement in file x / y
  const o0 = storeys[0] ? worldFrame(line(storeys[0].id).ObjectPlacement?.value).o : [0, 0, 0]
  const origin: Pt = { x: o0[0], y: o0[1] }
  const planOfWorld = (X: number, Z: number): Pt => ({ x: X - origin.x, y: Z + origin.y })
  const planOfFile = (x: number, y: number): Pt => ({ x: x - origin.x, y: -(y - origin.y) })

  // types (door operation), materials (layer thickness)
  const typeOf = new Map<number, number>()
  for (const r of idsOf(W.IFCRELDEFINESBYTYPE)) {
    const rel = line(r)
    for (const e of rel.RelatedObjects ?? []) typeOf.set(e.value, rel.RelatingType.value)
  }
  const materialOf = new Map<number, number>()
  for (const r of idsOf(W.IFCRELASSOCIATESMATERIAL)) {
    const rel = line(r)
    for (const e of rel.RelatedObjects ?? []) materialOf.set(e.value, rel.RelatingMaterial.value)
  }
  const layerThickness = (elem: number): number | null => {
    for (const id of [materialOf.get(elem), materialOf.get(typeOf.get(elem) ?? -1)]) {
      if (id === undefined) continue
      let m = line(id)
      if (m.type === W.IFCMATERIALLAYERSETUSAGE) m = line(m.ForLayerSet.value)
      if (m.type !== W.IFCMATERIALLAYERSET) continue
      const t = (m.MaterialLayers ?? []).reduce((s: number, l: any) => s + (Number(val(line(l.value).LayerThickness)) || 0), 0) * scale
      if (t > 0.005) return t
    }
    return null
  }
  const slidingDoor = (door: number): boolean => {
    const d = line(door)
    const ops = [val(d.OperationType), typeOf.has(door) ? val(line(typeOf.get(door)!).OperationType) : undefined]
    return ops.some((o) => typeof o === 'string' && o.includes('SLIDING'))
  }

  // ---------- meshes: the shell + each wall / column / space body ----------
  const bodies = new Map<number, Body>()
  const groups = new Map<string, GlbGroup & { pos: Float32Array[]; nor: Float32Array[]; idx: Uint32Array[]; n: number }>()
  /** the windows' colours: any see-through one, and how many in all (ImportedShell.glass) */
  const windows = { clear: false, n: 0 }
  const windowIds = idsOfSet(W.IFCWINDOW)
  let triangles = 0
  let capped = false
  const skipShell = new Set<string>(['IfcSpace', 'IfcOpeningElement', 'IfcSpatialZone', 'IfcAnnotation', 'IfcGrid', 'IfcOpeningStandardCase', 'IfcVirtualElement'])
  const furniture = idsOfSet(W.IFCFURNISHINGELEMENT)
  let furnitureSkipped = 0

  const takeBody = (into: Body, P: Float32Array, N: Float32Array, I: Uint32Array, wantInside: boolean) => {
    for (let i = 0; i < P.length; i += 3) {
      into.pts.push(planOfWorld(P[i], P[i + 2]))
      if (P[i + 1] < into.minY) into.minY = P[i + 1]
      if (P[i + 1] > into.maxY) into.maxY = P[i + 1]
    }
    if (!wantInside) return
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3
      if (N[a + 1] > -0.5) continue // the floor of the space faces down
      const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vz = P[c + 2] - P[a + 2]
      const area = Math.abs(ux * vz - uz * vx) / 2
      ;(into.floorTris ??= []).push({ pts: [planOfWorld(P[a], P[a + 2]), planOfWorld(P[b], P[b + 2]), planOfWorld(P[c], P[c + 2])], y: Math.max(P[a + 1], P[b + 1], P[c + 1]) })
      if (area > (into.insideArea ?? 0)) {
        into.insideArea = area
        into.inside = planOfWorld((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3)
        into.insideY = (P[a + 1] + P[b + 1] + P[c + 1]) / 3
      }
    }
  }
  /** one placed geometry → world positions (Y shifted to the datum), normals, indices */
  const worldMesh = (g: { geometryExpressID: number; flatTransformation: number[] }): { P: Float32Array; N: Float32Array; I: Uint32Array } | null => {
    const geo = api.GetGeometry(model, g.geometryExpressID)
    const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize())
    const I = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize()).slice()
    geo.delete()
    const n = v.length / 6
    if (!n || !I.length) return null
    const m = g.flatTransformation
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3)
    for (let i = 0, j = 0; i < v.length; i += 6, j += 3) {
      const x = v[i], y = v[i + 1], z = v[i + 2]
      P[j] = m[0] * x + m[4] * y + m[8] * z + m[12]
      P[j + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] - baseY
      P[j + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
      const nx = v[i + 3], ny = v[i + 4], nz = v[i + 5]
      const wx = m[0] * nx + m[4] * ny + m[8] * nz, wy = m[1] * nx + m[5] * ny + m[9] * nz, wz = m[2] * nx + m[6] * ny + m[10] * nz
      const l = Math.hypot(wx, wy, wz) || 1
      N[j] = wx / l, N[j + 1] = wy / l, N[j + 2] = wz / l
    }
    return { P, N, I }
  }
  /** a curtain wall's parts (panels, frames), each its own footprint: its straight runs (curtainRuns) */
  const parts = new Map<number, Map<number, Body>>()
  const partOf = (owner: number, id: number): Body => {
    const m = parts.get(owner) ?? parts.set(owner, new Map()).get(owner)!
    return m.get(id) ?? m.set(id, { pts: [], minY: Infinity, maxY: -Infinity }).get(id)!
  }
  const bodyOf = (id: number): Body => {
    let b = bodies.get(id)
    if (!b) bodies.set(id, (b = { pts: [], minY: Infinity, maxY: -Infinity }))
    return b
  }

  // the 3D is most of the time: one step per element with a body (the openings are not streamed; measured on molio,
  // hitos, duplex: the stream visits 95–99 % of this count — products would count hitos' 9 203 annotations too)
  const products = Math.max(1, idsOf(W.IFCELEMENT).length - idsOf(W.IFCOPENINGELEMENT).length)
  let streamed = 0
  let said = -1
  progress('building the 3D', 0.1)
  const seen = new Set<number>()
  let broken = 0
  const onMesh = (mesh: { expressID: number; geometries: { size(): number; get(i: number): { geometryExpressID: number; flatTransformation: number[]; color: { x: number; y: number; z: number; w: number } } } }) => {
    seen.add(mesh.expressID)
    const f = Math.min(1, ++streamed / products)
    if (f - said >= 0.02) (said = f), progress(`building the 3D (${Math.round(f * 100)} %)`, 0.1 + 0.5 * f)
    const tn = typeName(mesh.expressID)
    const owner = ownerOf(mesh.expressID)
    const wantBody = isA(owner, W.IFCWALL) || isA(owner, W.IFCCURTAINWALL) || isA(owner, W.IFCCOLUMN)
    const shell = !skipShell.has(tn) && !furniture.has(mesh.expressID)
    const win = windowIds.has(mesh.expressID)
    if (!shell && furniture.has(mesh.expressID)) furnitureSkipped++
    if (!shell && !wantBody) return
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const g = mesh.geometries.get(i)
      const wm = worldMesh(g)
      if (!wm) continue
      if (wantBody) takeBody(bodyOf(owner), wm.P, wm.N, wm.I, false)
      if (wantBody && owner !== mesh.expressID && isA(owner, W.IFCCURTAINWALL)) takeBody(partOf(owner, mesh.expressID), wm.P, wm.N, wm.I, false)
      if (!shell) continue
      if (triangles + wm.I.length / 3 > TRIANGLE_CAP) {
        capped = true
        continue
      }
      const c = g.color
      if (win) (windows.n++, (windows.clear ||= c.w < 0.99))
      const key = `${win ? 'w|' : ''}${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)},${c.w.toFixed(3)}`
      let grp = groups.get(key)
      if (!grp) groups.set(key, (grp = { color: [c.x, c.y, c.z, c.w], positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), pos: [], nor: [], idx: [], n: 0, ...(win ? { window: true } : {}) }))
      for (let k = 0; k < wm.I.length; k++) wm.I[k] += grp.n
      grp.pos.push(wm.P), grp.nor.push(wm.N), grp.idx.push(wm.I)
      grp.n += wm.P.length / 3
      triangles += wm.I.length / 3
    }
  }
  try {
    api.StreamAllMeshes(model, onMesh)
  } catch {
    // web-ifc stopped inside one element's geometry (measured: a services model, 22 of 16 544 products): the rest one by
    // one, the broken ones left out of the outside shape (said in the notes)
    for (const id of idsOf(W.IFCPRODUCT)) {
      if (seen.has(id)) continue
      try {
        api.StreamMeshes(model, [id], onMesh)
      } catch {
        broken++
      }
    }
  }
  const concat = <T extends Float32Array | Uint32Array>(parts: T[], make: (n: number) => T): T => {
    const out = make(parts.reduce((s, p) => s + p.length, 0))
    let at = 0
    for (const p of parts) out.set(p as any, at), (at += p.length)
    return out
  }
  const glbGroups: GlbGroup[] = [...groups.values()].map((g) => ({
    ...(g.window ? { window: true } : {}),
    color: g.color,
    positions: concat(g.pos, (n) => new Float32Array(n)),
    normals: concat(g.nor, (n) => new Float32Array(n)),
    indices: concat(g.idx, (n) => new Uint32Array(n)),
  }))
  const shellName = fileName.replace(/\.[^.]+$/, '')
  const shell = glbGroups.length ? { ...writeGlb(glbGroups, shellName), name: shellName, ...(windows.n && !windows.clear ? { glass: 'opaque' as const } : {}) } : undefined
  const bodyMesh = (id: number, wantInside: boolean): Body | null => {
    try {
      const fm = api.GetFlatMesh(model, id)
      const b: Body = { pts: [], minY: Infinity, maxY: -Infinity }
      for (let i = 0; i < fm.geometries.size(); i++) {
        const wm = worldMesh(fm.geometries.get(i))
        if (wm) takeBody(b, wm.P, wm.N, wm.I, wantInside)
      }
      return b.pts.length ? b : null
    } catch {
      return null
    }
  }

  // ---------- walls ----------
  progress('walls, doors and windows', 0.62)
  const voidsOf = new Map<number, number[]>() // wall → openings
  for (const r of idsOf(W.IFCRELVOIDSELEMENT)) {
    const rel = line(r)
    const w = rel.RelatingBuildingElement.value
    voidsOf.set(w, [...(voidsOf.get(w) ?? []), rel.RelatedOpeningElement.value])
  }
  const fillOf = new Map<number, number>() // opening → door / window
  for (const r of idsOf(W.IFCRELFILLSELEMENT)) {
    const rel = line(r)
    fillOf.set(rel.RelatingOpeningElement.value, rel.RelatedBuildingElement.value)
  }

  /** the wall's Axis curve as plan polylines, else null */
  const axisOf = (wall: any): Pt[][] | null => {
    if (!wall.Representation) return null
    const frame = worldFrame(wall.ObjectPlacement?.value)
    const toPlan = (p: number[]): Pt => {
      const w = apply(frame, [(p[0] ?? 0) * scale, (p[1] ?? 0) * scale, (p[2] ?? 0) * scale])
      return planOfFile(w[0], w[1])
    }
    for (const r of line(wall.Representation.value).Representations ?? []) {
      const rep = line(r.value)
      if (val(rep.RepresentationIdentifier) !== 'Axis') continue
      const chains = (rep.Items ?? []).map((it: any) => curvePoints(it.value, 0)).filter((c: number[][]) => c.length >= 2)
      if (chains.length) return chains.map((c: number[][]) => c.map(toPlan))
    }
    return null
  }
  /** a curve as a list of file-unit points (the item's own 2D / 3D coordinates) */
  function curvePoints(id: number, depth: number): number[][] {
    if (depth > 8) return []
    const c = line(id)
    const pt = (ref: any): number[] => (line(ref.value).Coordinates ?? []).map(val)
    switch (c.type) {
      case W.IFCPOLYLINE:
        return (c.Points ?? []).map(pt)
      case W.IFCINDEXEDPOLYCURVE: {
        const list = (line(c.Points.value).CoordList ?? []).map((row: any[]) => row.map(val)) as number[][]
        if (!c.Segments?.length) return list
        const out: number[][] = []
        for (const s of c.Segments) {
          const seg = s.value !== undefined && typeof s.value !== 'object' ? line(s.value) : s
          const idx = ((seg.value ?? seg) as any[]).map((v: any) => Number(val(v)) - 1)
          const arc = seg.type === W.IFCARCINDEX || (seg.name === 'IFCARCINDEX')
          const pts = idx.map((i: number) => list[i]).filter(Boolean)
          if (arc && pts.length === 3) out.push(...arcThrough(pts[0], pts[1], pts[2], out.length ? 1 : 0))
          else out.push(...(out.length ? pts.slice(1) : pts))
        }
        return out
      }
      case W.IFCTRIMMEDCURVE: {
        const basis = line(c.BasisCurve.value)
        const sense = val(c.SenseAgreement) !== false && val(c.SenseAgreement) !== 'F' && val(c.SenseAgreement) !== 0
        const trimPt = (trim: any[]): number[] | null => {
          const p = trim.find((t) => t.type === 5 && line(t.value).type === W.IFCCARTESIANPOINT)
          return p ? pt(p) : null
        }
        const trimParam = (trim: any[]): number | null => {
          const p = trim.find((t) => t.type !== 5)
          const v = val(p)
          return typeof v === 'number' ? v : null
        }
        if (basis.type === W.IFCCIRCLE) {
          const pos = line(basis.Position.value)
          const centre = pt(pos.Location)
          const r = Number(val(basis.Radius))
          const xd: number[] = pos.RefDirection ? line(pos.RefDirection.value).DirectionRatios.map(val) : [1, 0]
          const ang = (trim: any[]): number => {
            const p = trimPt(trim)
            if (p) return Math.atan2(-(p[0] - centre[0]) * xd[1] + (p[1] - centre[1]) * xd[0], (p[0] - centre[0]) * xd[0] + (p[1] - centre[1]) * xd[1])
            return (trimParam(trim) ?? 0) * angle
          }
          let a0 = ang(c.Trim1), a1 = ang(c.Trim2)
          if (sense && a1 <= a0) a1 += 2 * Math.PI
          if (!sense && a1 >= a0) a1 -= 2 * Math.PI
          const rM = r * scale
          const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (2 * Math.acos(Math.max(-1, 1 - CHORD_M / Math.max(rM, CHORD_M))))))
          const out: number[][] = []
          for (let i = 0; i <= n; i++) {
            const t = a0 + ((a1 - a0) * i) / n
            out.push([centre[0] + r * (Math.cos(t) * xd[0] - Math.sin(t) * xd[1]), centre[1] + r * (Math.cos(t) * xd[1] + Math.sin(t) * xd[0])])
          }
          return out
        }
        if (basis.type === W.IFCLINE) {
          const p0 = pt(basis.Pnt)
          const vec = line(basis.Dir.value)
          const d: number[] = line(vec.Orientation.value).DirectionRatios.map(val)
          const mag = Number(val(vec.Magnitude)) || 1
          const at = (trim: any[]): number[] => trimPt(trim) ?? p0.map((x, i) => x + (d[i] ?? 0) * mag * (trimParam(trim) ?? 0))
          const pts = [at(c.Trim1), at(c.Trim2)]
          return sense ? pts : pts.reverse()
        }
        return []
      }
      case W.IFCCOMPOSITECURVE: {
        const out: number[][] = []
        for (const s of c.Segments ?? []) {
          const seg = line(s.value)
          let pts = curvePoints(seg.ParentCurve.value, depth + 1)
          if (val(seg.SameSense) === false || val(seg.SameSense) === 'F') pts = pts.reverse()
          out.push(...(out.length ? pts.slice(1) : pts))
        }
        return out
      }
      case W.IFCLINE:
        return [] // unbounded
      default:
        return []
    }
  }
  function arcThrough(a: number[], b: number[], c: number[], skip: number): number[][] {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
    if (Math.abs(d) < 1e-12) return [a, b, c].slice(skip)
    const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2
    const cx = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d
    const cy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d
    const r = Math.hypot(a[0] - cx, a[1] - cy)
    const t0 = Math.atan2(a[1] - cy, a[0] - cx)
    let t1 = Math.atan2(b[1] - cy, b[0] - cx), t2 = Math.atan2(c[1] - cy, c[0] - cx)
    const ccw = d > 0
    const fix = (t: number, from: number) => (ccw ? (t <= from ? t + 2 * Math.PI : t) : t >= from ? t - 2 * Math.PI : t)
    t1 = fix(t1, t0), t2 = fix(t2, t1)
    const rM = r * scale
    const n = Math.max(2, Math.ceil(Math.abs(t2 - t0) / (2 * Math.acos(Math.max(-1, 1 - CHORD_M / Math.max(rM, CHORD_M))))))
    const out: number[][] = []
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t2 - t0) * i) / n
      out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
    }
    return out.slice(skip)
  }

  const dropped: string[] = []
  let noAxis = 0
  let curved = 0
  let noBody = 0
  let fromParts = 0
  let wideColumns = 0
  let bent = 0
  const draftsByStorey = new Map<number, { walls: WallDraft[]; pillars: Pillar[]; labels: RoomLabel[]; noSpace: boolean }>()
  const draftOf = (s: Storey) => {
    let d = draftsByStorey.get(s.id)
    if (!d) draftsByStorey.set(s.id, (d = { walls: [], pillars: [], labels: [], noSpace: true }))
    return d
  }
  let unplaced = 0
  let multi = 0

  /**
   * The storeys a body stands on: every storey whose band (its floor up to the next floor; the top storey up to the body's
   * top) the body crosses by more than 0.3 m — a wall Revit draws through five floors is on all five — else the storey the
   * file put it in. Heights above the datum (Y).
   */
  const bands = storeys.map((s, i) => ({ s, bottom: s.z - baseY, top: i + 1 < storeys.length ? storeys[i + 1].z - baseY : Infinity }))
  const storeysFor = (body: Body | undefined, s0: Storey | undefined): { s: Storey; bottom: number; top: number }[] => {
    const hit = body ? bands.filter((b) => Math.min(body.maxY, b.top) - Math.max(body.minY, b.bottom) > 0.3) : []
    if (hit.length) return hit.map((b) => ({ ...b, top: Math.min(b.top, body!.maxY) }))
    const b = s0 && bands.find((b) => b.s === s0)
    return b ? [{ ...b, top: Math.min(b.top, body?.maxY ?? b.bottom + WALL_HEIGHT_M) }] : []
  }

  /** one wall's centre line with what hangs on it, before the storeys split it: segment, along-range, height range above the datum */
  interface Chain {
    pts: Pt[]
    thickness: number
    on: { s: Storey; bottom: number; top: number }[]
    name: string
    holes: { seg: number; kind: OpeningKind; u0: number; u1: number; y0: number; y1: number }[]
  }
  const chainsOut: Chain[] = []
  const segLen = (pts: Pt[], i: number) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  /** the chain's segment nearest a plan point: its index, length, unit direction and the point's distance from it */
  const nearestSeg = (pts: Pt[], cx: number, cy: number): { seg: number; L: number; d: Pt; dist: number } | null => {
    let best: { seg: number; L: number; d: Pt; dist: number } | null = null
    for (let i = 0; i + 1 < pts.length; i++) {
      const L = segLen(pts, i)
      if (L < 1e-6) continue
      const d = { x: (pts[i + 1].x - pts[i].x) / L, y: (pts[i + 1].y - pts[i].y) / L }
      const u = Math.max(0, Math.min(L, (cx - pts[i].x) * d.x + (cy - pts[i].y) * d.y))
      const dist = Math.hypot(pts[i].x + d.x * u - cx, pts[i].y + d.y * u - cy)
      if (!best || dist < best.dist) best = { seg: i, L, d, dist }
    }
    return best
  }

  const wallIds = [...idsOf(W.IFCWALL), ...idsOf(W.IFCCURTAINWALL)]
  for (const id of wallIds) {
    const w = line(id)
    const curtain = isA(id, W.IFCCURTAINWALL)
    const body = bodies.get(id)
    const on = storeysFor(body, storeyOf(id))
    if (!on.length) {
      unplaced++
      continue
    }
    if (on.length > 1) multi++
    let chains = curtain ? null : axisOf(w)
    if (chains && chains.some((c) => c.length > 2)) curved++
    let thickness = layerThickness(id)
    if (!chains) {
      if (!body) {
        noBody++
        continue
      }
      const r = minRect(body.pts)
      if (!r || r.lengthM < 0.05) continue
      if (r.widthM > MAX_THICK_M) {
        // no straight wall (a glass front turning a corner): its parts' straight runs, else the outside shape alone shows it
        const runs = curtainRuns([...(parts.get(id)?.values() ?? [])].flatMap((b) => minRect(b.pts) ?? []))
        if (!runs.length) {
          bent++
          continue
        }
        fromParts++
        chains = runs.map((x) => [x.a, x.b])
        thickness ??= Math.max(...runs.map((x) => x.widthM))
      } else {
        if (!curtain) noAxis++
        chains = [[{ x: r.centre.x - (r.dir.x * r.lengthM) / 2, y: r.centre.y - (r.dir.y * r.lengthM) / 2 }, { x: r.centre.x + (r.dir.x * r.lengthM) / 2, y: r.centre.y + (r.dir.y * r.lengthM) / 2 }]]
        thickness ??= r.widthM
      }
    } else if (thickness === null && body) {
      // the body's width across the longest segment, from the points that project onto it
      let best: { a: Pt; b: Pt; L: number } | null = null
      for (const c of chains) for (let i = 1; i < c.length; i++) {
        const L = Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y)
        if (!best || L > best.L) best = { a: c[i - 1], b: c[i], L }
      }
      if (best) {
        const d = { x: (best.b.x - best.a.x) / best.L, y: (best.b.y - best.a.y) / best.L }
        let v0 = Infinity, v1 = -Infinity
        for (const p of body.pts) {
          const u = (p.x - best.a.x) * d.x + (p.y - best.a.y) * d.y
          if (u < -0.01 || u > best.L + 0.01) continue
          const v = -(p.x - best.a.x) * d.y + (p.y - best.a.y) * d.x
          v0 = Math.min(v0, v), v1 = Math.max(v1, v)
        }
        if (v1 - v0 > 0.02 && v1 - v0 < 1.5) thickness = v1 - v0
      }
    }
    thickness = thickness && thickness > 0.02 ? thickness : PARTITION_M
    const wallName = String(val(w.Name) ?? id)
    for (const pts of chains) {
      const chain: Chain = { pts, thickness, on, name: wallName, holes: [] }
      if (curtain && body) chain.holes.push({ seg: 0, kind: 'window', u0: 0, u1: segLen(pts, 0), y0: body.minY, y1: body.maxY })
      for (const op of voidsOf.get(id) ?? []) {
        const fill = fillOf.get(op)
        const kind: OpeningKind = fill === undefined ? 'passage' : isA(fill, W.IFCDOOR) ? (slidingDoor(fill) ? 'slider' : 'door') : isA(fill, W.IFCWINDOW) ? 'window' : 'passage'
        hang(chain, op, kind)
      }
      chainsOut.push(chain)
    }
  }
  const filled = new Set(fillOf.values())
  let hung = 0
  for (const id of [...idsOf(W.IFCDOOR), ...idsOf(W.IFCWINDOW)]) {
    if (filled.has(id)) continue
    const kind: OpeningKind = isA(id, W.IFCDOOR) ? (slidingDoor(id) ? 'slider' : 'door') : 'window'
    const ob = bodyMesh(id, false)
    if (!ob) continue
    const cx = ob.pts.reduce((a, p) => a + p.x, 0) / ob.pts.length, cy = ob.pts.reduce((a, p) => a + p.y, 0) / ob.pts.length
    // the nearest chain whose line passes within the wall's half thickness (+ 15 cm) of the door's centre, at its height
    let best: { chain: Chain; d: number } | null = null
    for (const chain of chainsOut) {
      if (!chain.on.some((b) => Math.min(ob.maxY, b.top) - Math.max(ob.minY, b.bottom) > 0.1)) continue
      const near = nearestSeg(chain.pts, cx, cy)
      if (near && near.dist <= chain.thickness / 2 + 0.15 && (!best || near.dist < best.d)) best = { chain, d: near.dist }
    }
    if (best && hang(best.chain, id, kind, ob)) hung++
  }
  // one draft per storey the wall stands on, its height and openings cut to that storey's band
  for (const chain of chainsOut) {
    for (const { s, bottom, top } of chain.on) {
      const heightM = top - bottom > 0.1 ? top - bottom : WALL_HEIGHT_M
      const draft: WallDraft = { pts: chain.pts, thicknessM: chain.thickness, heightM, openings: [] }
      for (const h of chain.holes) {
        const y0 = Math.max(h.y0, bottom) - bottom, y1 = Math.min(h.y1, bottom + heightM) - bottom
        if (y1 - y0 < 0.1) continue
        const sillM = h.kind === 'window' ? y0 : 0
        const L = segLen(chain.pts, h.seg)
        draft.openings.push([h.seg, { id: newId(), kind: h.kind, offsetM: Math.max(0, Math.min(L - (h.u1 - h.u0), h.u0)), widthM: h.u1 - h.u0, heightM: y1 - sillM, sillM }])
      }
      draftOf(s).walls.push(draft)
    }
  }
  /** an opening element's (or a void-less door's) body projected onto the chain's nearest segment; false when it does not fit */
  function hang(chain: Chain, elem: number, kind: OpeningKind, ob = bodyMesh(elem, false)): boolean {
    if (!ob) return false
    const cx = ob.pts.reduce((a, p) => a + p.x, 0) / ob.pts.length, cy = ob.pts.reduce((a, p) => a + p.y, 0) / ob.pts.length
    const near = nearestSeg(chain.pts, cx, cy)
    if (!near) return false
    const { seg, L, d } = near
    let u0 = Infinity, u1 = -Infinity
    for (const p of ob.pts) {
      const u = (p.x - chain.pts[seg].x) * d.x + (p.y - chain.pts[seg].y) * d.y
      u0 = Math.min(u0, u), u1 = Math.max(u1, u)
    }
    if (u1 - u0 > L + 0.02 || u1 - u0 < 0.1) {
      dropped.push(`${kind} ${(u1 - u0).toFixed(2)} m wide on the ${L.toFixed(2)} m wall "${chain.name}"`)
      return false
    }
    chain.holes.push({ seg, kind, u0, u1, y0: ob.minY, y1: ob.maxY })
    return true
  }

  // ---------- columns ----------
  for (const id of idsOf(W.IFCCOLUMN)) {
    const body = bodies.get(id)
    if (!body) continue
    const h = hull(body.pts)
    if (h.length < 3) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of h) (x0 = Math.min(x0, p.x)), (y0 = Math.min(y0, p.y)), (x1 = Math.max(x1, p.x)), (y1 = Math.max(y1, p.y))
    const pillar: Pillar = { id: newId(), x: (x0 + x1) / 2, y: (y0 + y1) / 2, wM: x1 - x0, hM: y1 - y0 }
    const axisAligned = h.every((p) => (Math.abs(p.x - x0) < 0.005 || Math.abs(p.x - x1) < 0.005) && (Math.abs(p.y - y0) < 0.005 || Math.abs(p.y - y1) < 0.005))
    if (h.length === 4 && !axisAligned) pillar.corners = h.map((p) => ({ x: p.x, y: p.y }))
    // (a "column" wider than a wall both ways is no column — LTU A-House: two of 13 × 9 m drawn as black blocks; the outside shape shows them)
    if (Math.min(pillar.wM, pillar.hM) > MAX_THICK_M) wideColumns++
    else if (pillar.wM > 0.02 && pillar.hM > 0.02) for (const { s } of storeysFor(body, storeyOf(id))) draftOf(s).pillars.push({ ...pillar, id: newId() })
  }

  // ---------- spaces ----------
  progress('rooms', 0.66)
  let outsideLabels = 0
  const outlineOf = new Map<Id, [Pt, Pt][]>() // label → the space's exact floor outline (edges)
  const floorOf = new Map<Id, [Pt, Pt, Pt][]>() // label → the space's floor triangles
  const areaNames: string[] = []
  // a space with no name of its own: its IfcZone's, else the storey's name and a number ("Space" only for a storey with none)
  const zoneOf = new Map<number, string>()
  for (const r of idsOf(W.IFCRELASSIGNSTOGROUP)) {
    const rel = line(r)
    const g = rel.RelatingGroup && line(rel.RelatingGroup.value)
    const zone = g?.type === W.IFCZONE && String(val(g.LongName) ?? val(g.Name) ?? '').trim()
    if (zone) for (const o of rel.RelatedObjects ?? []) zoneOf.set(o.value, zone)
  }
  const numbered = new Map<Storey, number>()
  let byZone = 0
  for (const id of idsOf(W.IFCSPACE)) {
    const s = storeyOf(id)
    if (!s) continue
    const sp = line(id)
    const body = bodyMesh(id, true)
    if (!body) continue
    const at = body.inside ?? (minRect(body.pts)?.centre ?? null)
    if (!at) continue
    const own = String(val(sp.LongName) || val(sp.Name) || '').trim()
    const zone = !own && zoneOf.get(id)
    if (zone) byZone++
    const name = own || zone || `${s.name.trim() || 'Space'} · ${numbered.set(s, (numbered.get(s) ?? 0) + 1).get(s)}`
    const lvl = (body.insideY ?? body.minY) - (s.z - baseY)
    const label: RoomLabel = { id: newId(), name, kind: guessKind(name), x: at.x, y: at.y, ...(Math.abs(lvl) > 0.05 && Math.abs(lvl) < 3 ? { levelM: lvl } : {}) }
    draftOf(s).labels.push(label)
    draftOf(s).noSpace = false
    if (body.floorTris) {
      const floor = body.floorTris.filter((t) => t.y <= body.minY + 0.02).map((t) => t.pts)
      outlineOf.set(label.id, boundaryEdges(floor))
      floorOf.set(label.id, floor)
    }
  }

  // ---------- the units ----------
  const result: ImportedStorey[] = []
  const counts: string[] = []
  const nameless: string[] = []
  let snapped = 0
  let nibs = 0
  let openPlan = 0
  let zoneLines = 0
  let outlined = 0
  let touches = 0
  for (const [k, s] of storeys.entries()) {
    progress(`floor ${k + 1} of ${storeys.length}`, 0.7 + (0.3 * k) / storeys.length) // (each floor is joined and checked: on a big building the longest part)
    const d = draftsByStorey.get(s.id) ?? { walls: [], pillars: [], labels: [], noSpace: true }
    if (!draftsByStorey.has(s.id)) counts.push(`${s.name} (floor at ${fmt(s.z - baseY)} m): nothing on it.`)
    let last = { snapped: 0, dropped: 0 }
    const joinedBy = new Map<Unit, number>()
    const build = (drafts: WallDraft[]): Unit => {
      // Revit axes end 2–5 cm short of / past the wall they meet: ends land on the centre line here, before the Studio joins
      const e = (last = snapEnds(drafts))
      let unit = emptyUnit()
      unit.name = s.name
      unit.projectName = shellName
      unit.northDeg = northDeg
      const vertices: Vertex[] = []
      const vertexAt = (p: Pt): Id => {
        const near = vertices.find((v) => Math.hypot(v.x - p.x, v.y - p.y) <= SNAP_M)
        if (near) return near.id
        const v = { id: newId(), x: p.x, y: p.y }
        vertices.push(v)
        return v.id
      }
      const walls: Wall[] = []
      const byEnds = new Map<string, Wall>() // two pieces between the same corners (a wall over a wall) are one
      for (const wd of e.walls) {
        const segs: (Wall | null)[] = []
        for (let i = 0; i + 1 < wd.pts.length; i++) {
          const a = vertexAt(wd.pts[i]), b = vertexAt(wd.pts[i + 1])
          if (a === b) {
            segs.push(null)
            continue
          }
          const key = a < b ? `${a}|${b}` : `${b}|${a}`
          const same = byEnds.get(key)
          if (same) {
            same.heightM = Math.max(same.heightM, wd.heightM)
            same.thicknessM = Math.max(same.thicknessM, wd.thicknessM)
            segs.push(same.a === a ? same : null) // an opening of a reversed twin is left out: its offset would be mirrored
            continue
          }
          const w: Wall = { id: newId(), a, b, thicknessM: wd.thicknessM, heightM: wd.heightM, openings: [] }
          byEnds.set(key, w)
          segs.push(w)
          walls.push(w)
        }
        for (const [i, o] of wd.openings) {
          const w = segs[i]
          if (!w) continue
          const L = Math.hypot(vertices.find((v) => v.id === w.b)!.x - vertices.find((v) => v.id === w.a)!.x, vertices.find((v) => v.id === w.b)!.y - vertices.find((v) => v.id === w.a)!.y)
          if (o.widthM > L + 0.02) {
            dropped.push(`${o.kind} ${o.widthM.toFixed(2)} m wide on a ${L.toFixed(2)} m wall (${s.name})`)
            continue
          }
          w.openings.push({ ...o, offsetM: Math.max(0, Math.min(L - o.widthM, o.offsetM)) })
        }
        // voids stacked or overlapping on one wall (a window of three panes, a door with a fanlight) are one opening here
        for (const w of segs) if (w && w.openings.length > 1) w.openings = mergeOpenings(w.openings)
      }
      unit = { ...unit, vertices, walls, pillars: d.pillars, roomLabels: d.labels }
      // the Studio's own load path: corners within 1 cm merge, ends inside a wall join it (T-splits, crossings), stubs go
      const n = settleImport(unit)
      joinedBy.set(n.unit, n.joined)
      return n.unit
    }
    // a space that holds two or more of the others (a gross area, a fire zone, a flat's whole floor) is an area, not a room
    const areas = d.labels.filter((l) => d.labels.filter((m) => m !== l && (floorOf.get(l.id) ?? []).some((t) => inTriangle(m, t))).length >= 2)
    if (areas.length) {
      d.labels = d.labels.filter((l) => !areas.includes(l))
      areaNames.push(...areas.map((l) => l.name))
    }
    let unit = build(d.walls)
    // open plan: two or more of the file's rooms in one closed face (Revit's room-separation lines are not in the IFC) —
    // zone lines (flush, drawn as nothing), so each room gets its own face: first where two of the rooms' own outlines run
    // together (the separation the architect drew between them) and no wall stands; then, for rooms still sharing a face,
    // the outlines of all but the biggest of them (an outline's other edges follow walls, columns and voids and can cut
    // slivers); then, name by name, the outline of each still sharing one. Each step is kept only when it leaves fewer rows to
    // check (studioIssues): never more work for a person. What none of them places, the Studio's row asks (issues.ts).
    const lines: WallDraft[] = []
    const seen = new Set<string>()
    const keyOf = (a: Pt, b: Pt) => [a, b].map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join('|')
    const add = (a: Pt, b: Pt) => {
      const key = keyOf(a, b)
      if (onWall(unit, a, b) || seen.has(key)) return
      seen.add(key)
      lines.push({ pts: [a, b], thicknessM: ZONE_LINE_M, heightM: 0, openings: [] })
    }
    const sharing = () =>
      deriveRooms(unit).flatMap((r) => {
        const poly = roomPolygon(r, unit)
        const inside = unit.roomLabels.filter((l) => pointInPolygon(l, poly))
        return inside.length >= 2 ? [inside] : []
      })
    const counted = new Map<Unit, number>() // (each floor tried is counted once: the kept one is asked again by the next try)
    const rows = (u: Unit) => counted.get(u) ?? counted.set(u, studioIssues(u, deriveRooms(u)).length).get(u)!
    const tryLines = (more: () => void) => {
      const kept = lines.length
      more()
      if (lines.length === kept) return
      const next = build([...d.walls, ...lines])
      // (or as many, and fewer of the file's names outside a room)
      const out = (u: Unit) => validate(u).filter((i) => i.code === 'label-outside-any-room').length
      if (rows(next) < rows(unit) || (rows(next) === rows(unit) && out(next) < out(unit))) unit = next
      else for (const l of lines.splice(kept)) seen.delete(keyOf(l.pts[0], l.pts[1])) // (a later try may take them again)
    }
    const open = sharing()
    openPlan += open.length
    const area = (l: RoomLabel) => (floorOf.get(l.id) ?? []).reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, 0)
    if (open.length) {
      tryLines(() => {
        for (const inside of open) for (const [i, l] of inside.entries()) for (const m of inside.slice(i + 1)) for (const [a, b] of sharedEdges(outlineOf.get(l.id) ?? [], outlineOf.get(m.id) ?? [])) add(a, b)
      })
      tryLines(() => {
        for (const inside of sharing()) for (const l of [...inside].sort((p, q) => area(q) - area(p)).slice(1)) for (const [a, b] of outlineOf.get(l.id) ?? []) add(a, b)
      })
      // a name still sharing a room: its own outline alone, name by name (all at once, one bad outline sank the rest —
      // Molio's reception in the hall, the digital hub's second lounge); a bath and hall the file outlines alike stay rows
      const polys = deriveRooms(unit).map((r) => roomPolygon(r, unit))
      for (const i of validate(unit)) {
        const l = i.code === 'label-outside-any-room' && unit.roomLabels.find((x) => x.id === i.ids[0])
        if (l && polys.some((poly) => pointInPolygon(l, poly))) tryLines(() => (outlineOf.get(l.id) ?? []).forEach(([a, b]) => add(a, b)))
      }
    }
    // a room the file outlines that no walls close — a balcony edged by a railing, a roof terrace, a stair open to the
    // floor above: its own outline where no wall stands, as zone lines (the railing itself is in the outside shape)
    const before = lines.length
    tryLines(() => {
      const polys = deriveRooms(unit).map((r) => roomPolygon(r, unit))
      for (const l of unit.roomLabels) if (!polys.some((poly) => pointInPolygon(l, poly))) for (const [a, b] of outlineOf.get(l.id) ?? []) add(a, b)
    })
    outlined += lines.length - before
    zoneLines += lines.length
    touches += joinedBy.get(unit) ?? 0 // (the floor kept, not the zone lines tried and dropped)
    snapped += last.snapped
    nibs += last.dropped
    const rooms = deriveRooms(unit)
    const issues = validate(unit)
    const n = (code: string) => issues.filter((i) => i.code === code).length
    const closed = rooms.length
    const labelled = rooms.filter((r) => unit.roomLabels.some((l) => l.id === r.id)).length
    outsideLabels += n('label-outside-any-room')
    const openings = unit.walls.reduce((a, w) => a + w.openings.length, 0)
    counts.push(
      `${s.name} (floor at ${fmt(s.z - baseY)} m): ${unit.walls.length} walls, ${openings} openings, ${unit.pillars?.length ?? 0} columns, ${closed} closed rooms (${labelled} named), ${n('dangling-vertex')} loose wall ends, ${n('label-outside-any-room')} names outside any room, ${n('walls-intersect')} crossings left.`,
    )
    if (d.noSpace && d.walls.length) nameless.push(s.name)
    result.push({ name: s.name, elevationM: s.z - baseY, unit })
  }

  notes.push(`${storeys.length} storey${storeys.length === 1 ? '' : 's'}: ${storeys.map((s) => `${s.name} at ${fmt(s.z - baseY)} m`).join(', ')}.`)
  notes.push(...counts)
  // (said once, not per floor nor per room: the Issues list holds them as one row on a big floor)
  if (nameless.length) notes.push(`${nameless.length === storeys.length ? 'No floor' : nameless.join(', ')} ${nameless.length === storeys.length ? 'of the file names its rooms' : nameless.length === 1 ? 'names no rooms' : 'name no rooms'} (no IfcSpace): the rooms stay "Space N" — Issues → "rooms with no name" names them by floor and number in one click.`)
  if (byZone || numbered.size) notes.push(`${[byZone && `${byZone} rooms with no name of their own took their zone's name`, numbered.size && `${[...numbered.values()].reduce((a, b) => a + b, 0)} took their floor's name and a number`].filter(Boolean).join('; ')}.`)
  if (wideColumns) notes.push(`${wideColumns} columns are wider than a wall both ways (over ${MAX_THICK_M} m): no column, left out of the plans (the outside shape shows them).`)
  if (fromParts) notes.push(`${fromParts} glass fronts (curtain walls) turn a corner: each was read as the straight runs of its panels, one glass wall per run.`)
  if (bent) notes.push(`${bent} walls are no straight wall and have no straight parts: they are left out of the plans (the outside shape shows them).`)
  if (noAxis) notes.push(`${noAxis} walls had no centre line in the file: their line was taken from the body's footprint.`)
  if (curved) notes.push(`${curved} curved walls were cut into straight pieces (within ${CHORD_M * 100} cm of the arc).`)
  if (noBody) notes.push(`${noBody} walls had neither a centre line nor a body and were left out.`)
  if (multi) notes.push(`${multi} walls run through more than one storey and stand on each of them.`)
  if (snapped) notes.push(`${snapped} wall ends stopped a few centimetres short of (or ran past) the wall they meet: each was moved onto that wall's centre line${nibs ? `; ${nibs} pieces shorter than ${MIN_PIECE_M * 100} cm left by that were removed` : ''}.`)
  if (openPlan) notes.push(`${openPlan} open-plan rooms held two or more of the file's room names in one space: ${zoneLines - outlined ? `${zoneLines - outlined} zone lines (flush, drawn as nothing) were added where the file draws their boundary, so each name has its own room` : 'no zone line along the file\'s own room outlines left fewer things to check, so none was added (the Issues list says where)'}.`)
  if (outlined) notes.push(`${outlined} zone lines (flush, drawn as nothing) close rooms the walls leave open along the file's own room outlines — a balcony edged by a railing, a roof terrace, a stair open to the floor above; the outside shape shows what stands there.`)
  if (areaNames.length) notes.push(`${areaNames.length} of the file's spaces hold other rooms (a gross area, a zone) and were left out as room names: ${[...new Set(areaNames)].slice(0, 4).join(', ')}${areaNames.length > 4 ? ', …' : ''}.`)
  if (touches) notes.push(`${touches} wall ends that touched another wall without a shared corner were joined to it.`)
  if (hung) notes.push(`${hung} doors / windows had no opening cut in a wall (the file lacks IfcRelVoidsElement): each was hung on the nearest wall by its own body.`)
  if (unplaced) notes.push(`${unplaced} walls belong to no storey in the file and were left out of the plans (they are still in the outside shape).`)
  if (dropped.length) notes.push(`${dropped.length} openings did not fit their wall and were left out: ${dropped.slice(0, 5).join('; ')}${dropped.length > 5 ? '; …' : ''}.`)
  if (outsideLabels) notes.push(`${outsideLabels} room names landed outside any closed room (walls there do not close).`)
  if (broken) notes.push(`${broken} pieces have a shape the IFC reader could not build: they are left out of the outside shape (the plans do not need them).`)
  if (furnitureSkipped) notes.push(`${furnitureSkipped} furniture pieces were skipped (the Studio furnishes rooms itself).`)
  if (shell) notes.push(`Outside shape: ${shell.triangles.toLocaleString()} triangles in ${new Set([...groups.keys()].map((k) => k.replace(/^w\|/, ''))).size} colours${capped ? ` — capped at ${TRIANGLE_CAP.toLocaleString()}, the rest was left out` : ''}.`)
  else notes.push('The file has no solid geometry: no outside shape.')
  notes.push(`Read in ${((Date.now() - t0) / 1000).toFixed(1)} s.`)

  return { format: 'ifc', storeys: result, shell, notes, unitScale: scale, origin }
}

/**
 * A glass front's straight runs from its parts' footprints (each a minRect): parts along one line (within 2°, 15 cm of it)
 * whose spans meet or leave a gap of RUN_GAP_M at most are one run, from the first part's end to the last's; its width
 * the widest part's. A part shorter than RUN_PART_M (a mullion's section) or wider than MAX_THICK_M is no run.
 */
export function curtainRuns(rects: Rect[]): { a: Pt; b: Pt; widthM: number }[] {
  const lines: { d: Pt; o: Pt; spans: [number, number, number][] }[] = []
  for (const r of [...rects].filter((x) => x.lengthM >= RUN_PART_M && x.widthM <= MAX_THICK_M).sort((p, q) => q.lengthM - p.lengthM)) {
    const on = lines.find((l) => Math.abs(l.d.x * r.dir.y - l.d.y * r.dir.x) < 0.035 && Math.abs(-(r.centre.x - l.o.x) * l.d.y + (r.centre.y - l.o.y) * l.d.x) <= 0.15)
    const l = on ?? lines[lines.push({ d: r.dir, o: r.centre, spans: [] }) - 1]
    const u = (r.centre.x - l.o.x) * l.d.x + (r.centre.y - l.o.y) * l.d.y
    l.spans.push([u - r.lengthM / 2, u + r.lengthM / 2, r.widthM])
  }
  const out: { a: Pt; b: Pt; widthM: number }[] = []
  for (const l of lines) {
    const at = (u: number): Pt => ({ x: l.o.x + l.d.x * u, y: l.o.y + l.d.y * u })
    const runs: [number, number, number][] = []
    for (const s of l.spans.sort((p, q) => p[0] - q[0])) {
      const run = runs[runs.length - 1]
      if (run && s[0] <= run[1] + RUN_GAP_M) (run[1] = Math.max(run[1], s[1])), (run[2] = Math.max(run[2], s[2]))
      else runs.push([...s])
    }
    for (const [u0, u1, w] of runs) if (u1 - u0 >= RUN_PART_M) out.push({ a: at(u0), b: at(u1), widthM: w })
  }
  return out
}

const RANK: Record<OpeningKind, number> = { slider: 3, door: 2, passage: 1, window: 0 }
/** overlapping openings become one: the union along the wall and in height, the kind that ranks highest (a door over a window) */
function mergeOpenings(list: Opening[]): Opening[] {
  const sorted = [...list].sort((a, b) => a.offsetM - b.offsetM)
  const out: Opening[] = []
  for (const o of sorted) {
    const last = out[out.length - 1]
    if (last && o.offsetM < last.offsetM + last.widthM - 0.005) {
      const top = Math.max(last.sillM + last.heightM, o.sillM + o.heightM), sill = Math.min(last.sillM, o.sillM)
      const end = Math.max(last.offsetM + last.widthM, o.offsetM + o.widthM)
      const kind = RANK[o.kind] > RANK[last.kind] ? o.kind : last.kind
      out[out.length - 1] = { ...last, kind, widthM: end - last.offsetM, sillM: kind === 'window' ? sill : 0, heightM: top - (kind === 'window' ? sill : 0) }
    } else out.push(o)
  }
  return out
}

const fmt = (m: number): string => (Math.abs(m) < 0.0005 ? '0' : m.toFixed(2).replace(/\.?0+$/, ''))

/**
 * Revit writes wall axes that end 2–5 cm short of / past the centre line of the wall they meet; the Studio's join then leaves
 * a hair-long nib and a crossing. Here, before the Studio sees the graph:
 *  1. each chain end within END_SNAP_M (half the other wall's thickness + 1 cm for a thick wall) of another wall's centre
 *     line moves onto it along its OWN line (no wall tilts); an end near-parallel to the other wall only onto that wall's
 *     end when it is nearly collinear (an end-to-end gap). Two passes: an L whose two ends are both short meets on the second.
 *  2. an end on another wall's line within MIN_PIECE_M of that wall's end becomes that end (no nib); an end on the line's
 *     middle splits the other wall there (a T, or a wall drawn over a longer one: the twin pieces become one in build).
 *  3. a piece shorter than MIN_PIECE_M goes.
 */
function snapEnds(drafts: WallDraft[]): { walls: WallDraft[]; snapped: number; dropped: number } {
  const walls = drafts.map((w) => ({ ...w, pts: w.pts.map((p) => ({ x: p.x, y: p.y })), openings: w.openings.map(([i, o]) => [i, { ...o }] as [number, Opening]) }))
  let snapped = 0
  const ends = walls.flatMap((wall) => (wall.pts.length >= 2 ? [{ wall, first: true }, { wall, first: false }] : []))
  const endOf = ({ wall, first }: { wall: WallDraft; first: boolean }) => {
    const n = wall.pts.length
    const e = first ? wall.pts[0] : wall.pts[n - 1]
    const inner = first ? wall.pts[1] : wall.pts[n - 2]
    const L = Math.hypot(e.x - inner.x, e.y - inner.y)
    return { e, own: { x: (e.x - inner.x) / L, y: (e.y - inner.y) / L }, L } // own: out of the chain
  }
  /** openings on the first segment are measured from its start: when that moves they keep their place */
  const move = (wall: WallDraft, first: boolean, e: Pt, to: Pt) => {
    if (first && wall.pts.length >= 2) {
      const i = wall.pts[1]
      const L = Math.hypot(i.x - e.x, i.y - e.y) || 1
      const du = ((to.x - e.x) * (i.x - e.x) + (to.y - e.y) * (i.y - e.y)) / L
      for (const h of wall.openings) if (h[0] === 0) h[1].offsetM -= du
    }
    e.x = to.x
    e.y = to.y
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const end of ends) {
      const { e, own, L: ownL } = endOf(end)
      if (ownL < 1e-6) continue
      let best: { p: Pt; dist: number } | null = null
      for (const o of walls) {
        if (o === end.wall) continue
        const tol = Math.max(END_SNAP_M, o.thicknessM / 2 + 0.01)
        for (let i = 0; i + 1 < o.pts.length; i++) {
          const a = o.pts[i], b = o.pts[i + 1]
          // (an end outside the segment's box grown by the reach is neither on nor beside it: most pairs stop here)
          if (e.x < Math.min(a.x, b.x) - 2 * tol || e.x > Math.max(a.x, b.x) + 2 * tol || e.y < Math.min(a.y, b.y) - 2 * tol || e.y > Math.max(a.y, b.y) + 2 * tol) continue
          const L = Math.hypot(b.x - a.x, b.y - a.y)
          if (L < 1e-6) continue
          // a wall that already ends at this corner is a neighbour, not a target
          if (Math.hypot(a.x - e.x, a.y - e.y) <= SNAP_M || Math.hypot(b.x - e.x, b.y - e.y) <= SNAP_M) continue
          const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
          const u = (e.x - a.x) * d.x + (e.y - a.y) * d.y
          const dist = Math.abs(-(e.x - a.x) * d.y + (e.y - a.y) * d.x)
          if (dist > tol || u < -tol || u > L + tol || (best && dist >= best.dist)) continue
          const sin = own.x * d.y - own.y * d.x
          let p: Pt
          if (Math.abs(sin) > 0.2) {
            // where the end's own line crosses the other's centre line
            const t = ((a.x - e.x) * d.y - (a.y - e.y) * d.x) / sin
            p = { x: e.x + own.x * t, y: e.y + own.y * t }
          } else if (dist <= 0.02 && (u < 0 || u > L)) p = u < 0 ? a : b // an end-to-end gap on one line
          else continue // beside a parallel wall's middle: the Studio's own join decides
          if (Math.hypot(p.x - e.x, p.y - e.y) > 2 * tol) continue
          best = { p, dist }
        }
      }
      if (!best || Math.hypot(best.p.x - e.x, best.p.y - e.y) < 1e-4) continue
      move(end.wall, end.first, e, best.p)
      snapped++
    }
  }
  // ends on a line: into the other's end block → its end; on its middle → split it there
  const splits = new Map<WallDraft, { i: number; u: number }[]>()
  for (const end of ends) {
    const { e } = endOf(end)
    for (const o of walls) {
      if (o === end.wall) continue
      for (let i = 0; i + 1 < o.pts.length; i++) {
        const a = o.pts[i], b = o.pts[i + 1]
        if (e.x < Math.min(a.x, b.x) - 2 * SNAP_M || e.x > Math.max(a.x, b.x) + 2 * SNAP_M || e.y < Math.min(a.y, b.y) - 2 * SNAP_M || e.y > Math.max(a.y, b.y) + 2 * SNAP_M) continue
        const L = Math.hypot(b.x - a.x, b.y - a.y)
        if (L < 1e-6) continue
        const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
        const u = (e.x - a.x) * d.x + (e.y - a.y) * d.y
        const dist = Math.abs(-(e.x - a.x) * d.y + (e.y - a.y) * d.x)
        if (dist > SNAP_M || u < -SNAP_M || u > L + SNAP_M) continue
        if (u <= MIN_PIECE_M || u >= L - MIN_PIECE_M) {
          const to = u <= MIN_PIECE_M ? a : b
          if (Math.hypot(to.x - e.x, to.y - e.y) > 1e-4) move(end.wall, end.first, e, to), snapped++
        } else splits.set(o, [...(splits.get(o) ?? []), { i, u }])
      }
    }
  }
  for (const [w, list] of splits) {
    // later segments first, longer u first: earlier indices stay valid
    for (const { i, u } of list.sort((p, q) => q.i - p.i || q.u - p.u)) {
      const a = w.pts[i], b = w.pts[i + 1]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      w.pts.splice(i + 1, 0, { x: a.x + ((b.x - a.x) * u) / L, y: a.y + ((b.y - a.y) * u) / L })
      w.openings = w.openings.map(([s, o]) => (s > i ? [s + 1, o] : s === i && o.offsetM >= u ? [s + 1, { ...o, offsetM: o.offsetM - u }] : [s, o]))
    }
  }
  // pieces shorter than MIN_PIECE_M: a lone one goes, one inside a chain folds into its neighbour
  let dropped = 0
  const out: WallDraft[] = []
  for (const w of walls) {
    for (let i = 0; i + 1 < w.pts.length; ) {
      if (Math.hypot(w.pts[i + 1].x - w.pts[i].x, w.pts[i + 1].y - w.pts[i].y) >= MIN_PIECE_M) {
        i++
        continue
      }
      w.pts.splice(i === 0 ? 1 : i, 1)
      w.openings = w.openings.filter(([s]) => s !== i).map(([s, o]) => [s > i ? s - 1 : s, o])
      dropped++
    }
    if (w.pts.length >= 2) out.push(w)
  }
  return { walls: out, snapped, dropped }
}

/** an edge that lies along one of the unit's walls (both ends within ON_WALL_M, or half the thickness + 2 cm, of its centre line) */
function onWall(unit: Unit, a: Pt, b: Pt): boolean {
  const vs = new Map(unit.vertices.map((v) => [v.id, v]))
  for (const w of unit.walls) {
    const p = vs.get(w.a), q = vs.get(w.b)
    if (!p || !q) continue
    const L = Math.hypot(q.x - p.x, q.y - p.y)
    if (L < 1e-6) continue
    const d = { x: (q.x - p.x) / L, y: (q.y - p.y) / L }
    const tol = Math.max(ON_WALL_M, w.thicknessM / 2 + 0.02)
    const near = (e: Pt) => {
      const u = (e.x - p.x) * d.x + (e.y - p.y) * d.y
      return u >= -tol && u <= L + tol && Math.abs(-(e.x - p.x) * d.y + (e.y - p.y) * d.x) <= tol
    }
    if (near(a) && near(b)) return true
  }
  return false
}

/** two outlines run together: parallel within 2°, this far apart at most, this long at least */
const SHARED_GAP_M = 0.05
const SHARED_MIN_M = 0.1

/** Where two rooms' outlines run together (their common boundary, a separation line): the overlap of each pair of edges, on the first's line. */
export function sharedEdges(A: [Pt, Pt][], B: [Pt, Pt][]): [Pt, Pt][] {
  const out: [Pt, Pt][] = []
  for (const [a, b] of A) {
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < SHARED_MIN_M) continue
    const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    for (const [p, q] of B) {
      const M = Math.hypot(q.x - p.x, q.y - p.y)
      if (M < SHARED_MIN_M || Math.abs(d.x * (q.y - p.y) - d.y * (q.x - p.x)) / M > 0.035) continue
      if (Math.abs((p.y - a.y) * d.x - (p.x - a.x) * d.y) > SHARED_GAP_M || Math.abs((q.y - a.y) * d.x - (q.x - a.x) * d.y) > SHARED_GAP_M) continue
      const t = [(p.x - a.x) * d.x + (p.y - a.y) * d.y, (q.x - a.x) * d.x + (q.y - a.y) * d.y].sort((m, n) => m - n)
      const t0 = Math.max(0, t[0]), t1 = Math.min(L, t[1])
      if (t1 - t0 >= SHARED_MIN_M) out.push([{ x: a.x + d.x * t0, y: a.y + d.y * t0 }, { x: a.x + d.x * t1, y: a.y + d.y * t1 }])
    }
  }
  return out
}

const inTriangle = (p: Pt, [a, b, c]: [Pt, Pt, Pt]): boolean => {
  const s = (u: Pt, v: Pt) => (v.x - u.x) * (p.y - u.y) - (v.y - u.y) * (p.x - u.x)
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a)
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}

/** the outline of a triangulated floor: the edges used by one triangle only, straight runs joined into one edge */
function boundaryEdges(tris: [Pt, Pt, Pt][]): [Pt, Pt][] {
  const key = (p: Pt) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`
  const count = new Map<string, { a: Pt; b: Pt; n: number }>()
  for (const t of tris) {
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3]
      const ka = key(a), kb = key(b)
      if (ka === kb) continue
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const c = count.get(k)
      if (c) c.n++
      else count.set(k, { a, b, n: 1 })
    }
  }
  let edges = [...count.values()].filter((c) => c.n === 1).map((c) => [c.a, c.b] as [Pt, Pt])
  // join straight runs: a point with exactly two edges on one line is no corner
  for (let changed = true; changed; ) {
    changed = false
    const at = new Map<string, number[]>()
    edges.forEach((e, i) => e.forEach((p) => at.set(key(p), [...(at.get(key(p)) ?? []), i])))
    for (const [k, idx] of at) {
      if (idx.length !== 2) continue
      const [e1, e2] = [edges[idx[0]], edges[idx[1]]]
      const far1 = key(e1[0]) === k ? e1[1] : e1[0], far2 = key(e2[0]) === k ? e2[1] : e2[0]
      const shared = key(e1[0]) === k ? e1[0] : e1[1]
      const cross = (far1.x - shared.x) * (far2.y - shared.y) - (far1.y - shared.y) * (far2.x - shared.x)
      const l1 = Math.hypot(far1.x - shared.x, far1.y - shared.y), l2 = Math.hypot(far2.x - shared.x, far2.y - shared.y)
      if (l1 < 1e-6 || l2 < 1e-6 || Math.abs(cross) / (l1 * l2) > 0.01) continue
      edges = edges.filter((_, i) => !idx.includes(i)).concat([[far1, far2]])
      changed = true
      break
    }
  }
  return edges
}

// ---------- .ifczip ----------

/** the first .ifc inside a zip (else its first file): fflate, which three ships (no dependency of our own) */
function unzipIfc(bytes: Uint8Array): Uint8Array {
  const files = unzipSync(bytes)
  const names = Object.keys(files).filter((n) => !n.endsWith('/'))
  const pick = names.find((n) => n.toLowerCase().endsWith('.ifc')) ?? names[0]
  if (!pick) throw new Error('the zip holds no .ifc file')
  return files[pick]
}
