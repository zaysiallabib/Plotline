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
import type { Configuration, Id, LowWallKind, RailColor, Opening, OpeningKind, Pillar, Pt, RoomLabel, Unit, Vertex, Wall } from '../core'
import { PARTITION_M, WALL_HEIGHT_M, ZONE_LINE_M, emptyUnit, guessKind, studioIssues } from '../studio/model'
import { FRAMES_SLOT, OUTSIDE_SLOT, ROOF_COVERINGS, frameKey, outerRuns, outsideKey } from '../furnish/finishes'
import type { Roof, RoofKind } from '../data/building/roof'
import { classOf, coveringOption, frameOption, outerOf, outsideOption, plain, railColor, railKind, toneGlass } from './materials'
import { dressName, writeGlb, type GlbGroup } from './glb'
import { finishesOn, settleImport } from './plan2d'
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'

type WebIfc = typeof import('web-ifc')

/**
 * A wall type's or a material's name as a person says it (qa4fix): its own words — not the family ("Basic Wall:"), the
 * element number (":7102787") nor an office's code in front ("SIA_41_", "SIA_PA_", "CHEK_"); underscores between parts as
 * dots. "Basic Wall:SIA_41_Crépi 10 _ Is 140 _ Colle 10:7102787" → "Crépi 10 · Is 140 · Colle 10"; "SIA_PA_Crépi beige,
 * texturé" → "Crépi beige, texturé"; a plain name stays.
 */
export function nameWords(name: string): string {
  const parts = name.split(':').map((s) => s.trim()).filter((s) => s && !/^\d+$/.test(s))
  const type = parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '')
  return type.replace(/^(?:[A-Z0-9]{1,6}_)+/, '').replace(/\s*_\s*/g, ' · ').trim() || name
}
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
/** a run shorter than this is no glass wall: a mullion's depth, a frame's return (the Nordic office's garage: 167 pieces under 0.5 m, each a loose wall) */
const RUN_MIN_M = 1

// ---------- web-ifc ----------

let apiPromise: Promise<{ W: WebIfc; api: Api }> | null = null
/** Node (the tests) — not the browser's page or its worker (read.worker.ts), which have no `process` */
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
  /** a wall's: each of `pts`' height (its top along it: a gable wall's peak is no storey top) */
  ys?: number[]
}

/** one wall's centre line on one storey, with its openings, before the Studio joins the graph */
interface WallDraft {
  pts: Pt[]
  thicknessM: number
  heightM: number
  /** [segment index, opening] */
  openings: [number, Opening][]
  /** the outside finish its file's materials say (an outer wall's: materials.ts) */
  finish?: string
  /** a railing on its line (IfcRailing): what it is made of, its own colour; `alone`: the railing's own low wall (its loose ends are meant) */
  lowKind?: LowWallKind
  railColor?: RailColor
  alone?: boolean
}

/** What the person said a material name stands for (the Studio's Materials list), by its plain name (materials.ts plain): an option id. */
export type MaterialPicks = Record<string, string>

// ---------- the importer ----------

export async function importIfc(bytes: ArrayBuffer, name: string, progress: Progress = () => {}, picks: MaterialPicks = {}): Promise<ImportResult> {
  const t0 = Date.now()
  progress('starting the reader', 0)
  const { W, api } = await loadApi()
  const data = name.toLowerCase().endsWith('.ifczip') ? unzipIfc(new Uint8Array(bytes)) : new Uint8Array(bytes)
  progress(`opening the file (${Math.max(1, Math.round(data.byteLength / 1e6))} MB)`, 0.03)
  const model = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false })
  try {
    return readModel(W, api, model, name, t0, progress, picks)
  } finally {
    api.CloseModel(model)
  }
}

function readModel(W: WebIfc, api: Api, model: number, fileName: string, t0: number, progress: Progress, picks: MaterialPicks): ImportResult {
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

  // header (what wrote it is no news to the person who dropped it, qa4fix)
  const schema = api.GetModelSchema(model)
  notes.push(`Schema ${schema}.`)

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
    /** its Elevation as the file writes it (metres), when it does */
    elev?: number
    walls: number[]
    columns: number[]
    spaces: number[]
  }
  const allStoreys: Storey[] = idsOf(W.IFCBUILDINGSTOREY).map((id) => {
    const s = line(id)
    const pz = s.ObjectPlacement ? worldFrame(s.ObjectPlacement.value).o[2] : NaN
    const ez = val(s.Elevation)
    return { id, name: String(val(s.Name) ?? val(s.LongName) ?? `Storey`), z: Number.isFinite(pz) ? pz : typeof ez === 'number' ? ez * scale : 0, ...(typeof ez === 'number' ? { elev: ez * scale } : {}), walls: [], columns: [], spaces: [] }
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
  /** the street: the ground storey's floor (groundStorey below; until then the lowest) */
  let baseY = storeys[0]?.z ?? 0
  const parentOf = new Map<number, number>() // element → what contains or aggregates it
  for (const r of idsOf(W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = line(r)
    for (const e of rel.RelatedElements ?? []) parentOf.set(e.value, rel.RelatingStructure.value)
  }
  const aggregateParent = new Map<number, number>()
  const childrenOf = new Map<number, number[]>()
  for (const r of idsOf(W.IFCRELAGGREGATES)) {
    const rel = line(r)
    for (const e of rel.RelatedObjects ?? []) {
      aggregateParent.set(e.value, rel.RelatingObject.value)
      ;(childrenOf.get(rel.RelatingObject.value) ?? childrenOf.set(rel.RelatingObject.value, []).get(rel.RelatingObject.value)!).push(e.value)
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
  // (the meshes are moved into the plan frame as they are read — worldMesh —, so a mesh point is a plan point: the outside
  // shape stands on its plans, and a file placed far from its 0 (EDEA's site 722 km east, Gaia's storeys 95 m north) keeps
  // its precision in the GLB's 32-bit numbers)
  const planOfWorld = (X: number, Z: number): Pt => ({ x: X, y: Z })
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

  // ---------- what the outside is made of (session 31 ifcmap; materials.ts): IsExternal, material names, their colours ----------
  const truthy = (v: unknown) => v === true || v === 'T' || v === 'TRUE' || v === '.T.' || v === 1
  /** a property set's IsExternal, when it says */
  const externalIn = (ps: any): boolean | undefined => {
    for (const p of ps?.HasProperties ?? []) {
      const pr = line(p.value)
      if (val(pr?.Name) === 'IsExternal' && pr.NominalValue) return truthy(val(pr.NominalValue))
    }
    return undefined
  }
  const common = (ps: any) => ps?.type === W.IFCPROPERTYSET && /common/i.test(String(val(ps.Name) ?? ''))
  // (the property sets of the elements that can be outside only, each read when first asked: a big file's other tens of
  // thousands — doors, spaces, furniture — are never opened)
  const asked = new Set([W.IFCWALL, W.IFCSLAB, W.IFCCURTAINWALL, W.IFCCOVERING, W.IFCBUILDINGELEMENTPART, W.IFCPLATE, W.IFCBUILDINGELEMENTPROXY, W.IFCROOF].flatMap((t) => [...idsOfSet(t)]))
  const psetsOf = new Map<number, number[]>()
  for (const r of idsOf(W.IFCRELDEFINESBYPROPERTIES)) {
    const rel = line(r)
    const ps = rel.RelatingPropertyDefinition?.value
    if (ps !== undefined) for (const o of rel.RelatedObjects ?? []) if (asked.has(o.value)) (psetsOf.get(o.value) ?? psetsOf.set(o.value, []).get(o.value)!).push(ps)
  }
  const psetSays = new Map<number, boolean | undefined>()
  const external = new Map<number, boolean | undefined>()
  /** an element's own IsExternal (its Common property sets) */
  const ownExternal = (id: number): boolean | undefined => {
    if (!external.has(id))
      external.set(
        id,
        (psetsOf.get(id) ?? [])
          .map((ps) => {
            if (!psetSays.has(ps)) {
              const p = line(ps)
              psetSays.set(ps, common(p) ? externalIn(p) : undefined)
            }
            return psetSays.get(ps)
          })
          .find((x) => x !== undefined),
      )
    return external.get(id)
  }
  const typeSays = new Map<number, boolean | undefined>()
  /** the element's IsExternal, else its type's, else what it is part of says; undefined: the file does not say */
  const isExternal = (id: number, depth = 0): boolean | undefined => {
    const v = ownExternal(id)
    if (v !== undefined) return v
    const t = typeOf.get(id)
    if (t !== undefined) {
      if (!typeSays.has(t)) typeSays.set(t, (line(t).HasPropertySets ?? []).map((p: any) => line(p.value)).filter(common).map(externalIn).find((x: boolean | undefined) => x !== undefined))
      if (typeSays.get(t) !== undefined) return typeSays.get(t)
    }
    const up = aggregateParent.get(id)
    return up !== undefined && depth < 4 ? isExternal(up, depth + 1) : undefined
  }
  /** the file says which walls are outside (16 of the 21 samples): only those are dressed; else every wall is */
  const fileSaysOutside = [...idsOfSet(W.IFCWALL)].some((id) => ownExternal(id) !== undefined) // (a file that says it of its railings only says nothing of its walls)
  type Mat = { name: string; id: number }
  const matsOf = new Map<number, { mats: Mat[]; layered: boolean }>()
  /** a material select as its materials, a layer set's in the file's order (outside → inside, as CAD programs write it) */
  const resolveMat = (id: number, depth = 0): { mats: Mat[]; layered: boolean } => {
    const kept = matsOf.get(id)
    if (kept) return kept
    const m = depth > 5 ? null : line(id)
    const each = (refs: any[] | undefined, inner: (x: any) => any) =>
      (refs ?? []).flatMap((r: any) => {
        const ref = inner(line(r.value))
        return ref?.value !== undefined ? resolveMat(ref.value, depth + 1).mats : []
      })
    let out: { mats: Mat[]; layered: boolean } = { mats: [], layered: false }
    if (m?.type === W.IFCMATERIAL) out = { mats: [{ name: String(val(m.Name) ?? '').trim(), id }], layered: false }
    else if (m?.type === W.IFCMATERIALLAYERSETUSAGE && m.ForLayerSet) out = resolveMat(m.ForLayerSet.value, depth + 1)
    else if (m?.type === W.IFCMATERIALLAYERSET) out = { mats: each(m.MaterialLayers, (l) => l.Material), layered: true }
    else if ((m?.type === W.IFCMATERIALLAYER || m?.type === W.IFCMATERIALLAYERWITHOFFSETS) && m.Material) out = resolveMat(m.Material.value, depth + 1)
    else if (m?.type === W.IFCMATERIALLIST) out = { mats: (m.Materials ?? []).flatMap((r: any) => resolveMat(r.value, depth + 1).mats), layered: false }
    else if (m?.type === W.IFCMATERIALCONSTITUENTSET) out = { mats: each(m.MaterialConstituents, (c) => c.Material), layered: false }
    else if ((m?.type === W.IFCMATERIALPROFILESETUSAGE || m?.type === W.IFCMATERIALPROFILESETUSAGETAPERING) && m.ForProfileSet) out = resolveMat(m.ForProfileSet.value, depth + 1)
    else if (m?.type === W.IFCMATERIALPROFILESET) out = { mats: each(m.MaterialProfiles, (p) => p.Material), layered: false }
    matsOf.set(id, out)
    return out
  }
  /** the element's materials, else its type's, else its parts' (a wall built of parts, Vienna's: one material each) */
  const materialsOf = (elem: number): { mats: Mat[]; layered: boolean } => {
    for (const id of [materialOf.get(elem), materialOf.get(typeOf.get(elem) ?? -1)]) {
      const r = id === undefined ? null : resolveMat(id)
      if (r?.mats.some((x) => x.name)) return r
    }
    const parts = (childrenOf.get(elem) ?? []).flatMap((c) => {
      const id = materialOf.get(c) ?? materialOf.get(typeOf.get(c) ?? -1)
      return id === undefined ? [] : resolveMat(id).mats.slice(0, 1)
    })
    return { mats: parts, layered: false }
  }
  /** a material's own colour (its IfcMaterialDefinitionRepresentation's surface style), 0–255: a render's tint */
  const matRgb = new Map<number, [number, number, number]>()
  const styleRgb = (id: number, depth = 0): [number, number, number] | null => {
    const s = depth > 4 ? null : line(id)
    if (!s) return null
    if (s.type === W.IFCSURFACESTYLERENDERING || s.type === W.IFCSURFACESTYLESHADING) {
      const c = s.SurfaceColour && line(s.SurfaceColour.value)
      return c ? [Number(val(c.Red)) * 255, Number(val(c.Green)) * 255, Number(val(c.Blue)) * 255] : null
    }
    for (const st of Array.isArray(s.Styles) ? s.Styles : []) {
      const c = st?.value !== undefined ? styleRgb(st.value, depth + 1) : null
      if (c) return c
    }
    return null
  }
  for (const r of idsOf(W.IFCMATERIALDEFINITIONREPRESENTATION)) {
    const d = line(r)
    const m = d.RepresentedMaterial?.value
    if (m === undefined) continue
    for (const rep of d.Representations ?? [])
      for (const it of line(rep.value).Items ?? [])
        for (const st of line(it.value).Styles ?? []) {
          const c = matRgb.has(m) ? null : styleRgb(st.value)
          if (c) matRgb.set(m, c)
        }
  }
  /** a person's own word for a name, when it is an option of that kind (`fo_out_` an outside finish, `rc_` a covering, `fo_frame_` a frame) */
  const pickOf = (name: string, kind: 'fo_out_' | 'rc_' | 'fo_frame_'): string | undefined => {
    const p = picks[plain(name)]
    return p?.startsWith(kind) ? p : undefined
  }
  /** every outer material name read: what it became (null: not known, plaster) and on how many elements — the notes, the Studio's list */
  const read = new Map<string, { name: string; finish: string | null; count: number; yours: boolean }>()
  const tally = (name: string, finish: string | null, yours: boolean) => {
    const k = plain(name)
    const e = read.get(k) ?? read.set(k, { name, finish, count: 0, yours }).get(k)!
    e.count++
  }
  const typeNamesOf = new Map<number, string[]>()
  const typeNames = (id: number): string[] => {
    const kept = typeNamesOf.get(id)
    if (kept) return kept
    const e = line(id)
    const t = typeOf.has(id) ? line(typeOf.get(id)!) : null
    const out = [val(t?.Name), val(e?.ObjectType), val(e?.Name)].filter((x): x is string => typeof x === 'string' && !!x.trim())
    typeNamesOf.set(id, out)
    return out
  }
  const finishOf = new Map<number, string | null>()
  /**
   * An outer element's outside finish (an option id; null: plaster): its materials' outer layer (materials.ts outerOf), the
   * person's word for that name first; else what its type's or its own name says ("Basic Wall:SIA_41_Crépi 10 …"). An outer
   * name not known is listed once (the notes, the Studio's Materials list); a part with no material of its own: its owner's.
   */
  const wallFinish = (id: number, depth = 0): string | null => {
    if (finishOf.has(id)) return finishOf.get(id)!
    const { mats, layered } = materialsOf(id)
    const names = mats.map((m) => m.name)
    const opt = (n: string, mat?: number) => {
      const o = pickOf(n, 'fo_out_') ?? outsideOption(n, mat === undefined ? undefined : matRgb.get(mat))
      return o === 'glass' ? null : o
    }
    const i = outerOf(names, layered, (n) => pickOf(n, 'fo_out_') ?? outsideOption(n))
    let f: string | null = null
    if (i >= 0) {
      f = opt(names[i], mats[i].id)
      tally(names[i], f, !!pickOf(names[i], 'fo_out_'))
    } else {
      for (const k of new Set(layered ? [0, names.length - 1] : names.map((_, j) => j))) if (names[k] && classOf(names[k]) === null) tally(names[k], null, false)
      f = typeNames(id).map((n) => outsideOption(n, undefined, true)).find((x) => !!x && x !== 'glass') ?? null
      const up = aggregateParent.get(id)
      if (!f && !mats.length && up !== undefined && depth < 3) f = wallFinish(up, depth + 1)
    }
    finishOf.set(id, f)
    return f
  }
  const roofIds = idsOfSet(W.IFCROOF)
  const predefinedKept = new Map<number, string>()
  const predefinedOf = (id: number): string => {
    let p = predefinedKept.get(id)
    if (p === undefined) {
      const e = line(id)
      p = String(val(e?.PredefinedType) ?? val(e?.ShapeType) ?? '') || String(val(typeOf.has(id) ? line(typeOf.get(id)!).PredefinedType : '') ?? '')
      predefinedKept.set(id, p)
    }
    return p
  }
  const inRoof = (id: number): boolean => roofIds.has(id) || roofIds.has(aggregateParent.get(id) ?? -1) || (isA(id, W.IFCSLAB) && predefinedOf(id) === 'ROOF')
  /** a roof's covering (an option of ROOF_COVERINGS): its materials, its type's or own name; null: as the file colours it */
  const roofCovering = (id: number, pitched: boolean): string | null => {
    for (const n of [...materialsOf(id).mats.map((m) => m.name), ...typeNames(id)]) {
      const o = pickOf(n, 'rc_') ?? coveringOption(n, pitched)
      if (o) return o
    }
    return null
  }
  /** a window's frame (an option of FRAMES_SLOT), from its materials' and type's names */
  const windowFrame = (id: number): string | null => {
    const names = [...materialsOf(id).mats.map((m) => m.name), ...typeNames(id)]
    return names.map((n) => pickOf(n, 'fo_frame_')).find((x) => !!x) ?? frameOption(names)
  }
  /** an outer wall with no material, or one whose names say nothing known (not one of plasterboard and studs: an inner wall the file calls outer) */
  const unknownOuter = (id: number): boolean => {
    const { mats } = materialsOf(id)
    return !mats.length || mats.some((m) => classOf(m.name) === null)
  }
  /** the classes whose outer faces wear an outside finish in the shape (a wall and what clads it) */
  const cladding = new Set(['IfcWall', 'IfcWallStandardCase', 'IfcWallElementedCase', 'IfcCovering', 'IfcBuildingElementPart', 'IfcPlate', 'IfcBuildingElementProxy'])
  const outerEl = (id: number, tn: string): boolean => {
    const e = isExternal(id)
    if (e !== undefined) return e
    if (tn === 'IfcCovering' && predefinedOf(id) === 'CLADDING') return true
    return !fileSaysOutside && tn !== 'IfcBuildingElementProxy' && tn !== 'IfcPlate'
  }

  // ---------- the street: the ground storey ----------
  // Not an empty datum storey under the building (Nordic housing's "Sea_Level" 47 m below it): the storey named the ground
  // (Ground / EG / RDC / 1F …), else the one the file puts at elevation 0, else the lowest that holds outer walls or slabs, or
  // rooms — of these never one named a basement (Keller, UG, B1, sous-sol …). What stands below it is a basement.
  const holds = new Map<Storey, { outer: number; walls: number; rooms: number }>()
  const tallyIn = (id: number, k: 'outer' | 'walls' | 'rooms') => {
    const s = storeyOf(id)
    if (!s) return
    const h = holds.get(s) ?? holds.set(s, { outer: 0, walls: 0, rooms: 0 }).get(s)!
    h[k]++
  }
  for (const id of [...idsOf(W.IFCWALL), ...idsOf(W.IFCSLAB), ...idsOf(W.IFCCURTAINWALL)]) {
    if (isExternal(id)) tallyIn(id, 'outer')
    if (!isA(id, W.IFCSLAB)) tallyIn(id, 'walls')
  }
  for (const id of idsOf(W.IFCSPACE)) tallyIn(id, 'rooms')
  const held = (s: Storey) => {
    const h = holds.get(s)
    return !!h && (h.outer > 0 || h.rooms > 0 || (!fileSaysOutside && h.walls > 0))
  }
  const named = (s: Storey) => plain(s.name).replace(/^[\d\s._-]+(?=[a-z])/, '').trim()
  const GROUND = /^(ground( floor| level)?|eg|erdgeschoss|rdc|rez[- ]de[- ]chaussee|planta baja|pb|begane grond|bg|stueetage|stueplan|stue|pohjakerros|maantaso|bottenvaning|entreplan|piano terra|pt|1f|1\/f|gf|g\/f|l0|level 0+|niveau 0)$/
  const BELOW = /basement|cellar|keller|\bug\d*\b|\bkg\b|kellari|kallare|kjeller|kaelder|sous-sol|sotano|souterrain|kelder|\bb-?\d\b|^k-?\d\b|^-\d|garage under|tiefgarage/
  const groundStorey =
    storeys.find((s) => GROUND.test(named(s)) && held(s)) ??
    storeys.find((s) => s.elev !== undefined && Math.abs(s.elev) < 0.25 && held(s)) ??
    storeys.find((s) => held(s) && !BELOW.test(plain(s.name))) ??
    storeys[0]
  const emptyBelow = groundStorey ? storeys.filter((s) => s.z < groundStorey.z - 0.01 && !held(s) && !holds.get(s)?.walls) : []
  if (groundStorey && groundStorey !== storeys[0]) {
    baseY = groundStorey.z
    notes.push(`The street is at ${groundStorey.name.trim() || 'the ground storey'}'s floor${emptyBelow.length ? `; ${emptyBelow.map((s) => `"${s.name.trim()}"`).join(', ')} below it hold${emptyBelow.length === 1 ? 's' : ''} nothing and ${emptyBelow.length === 1 ? 'was' : 'were'} left out` : ''}${storeys.some((s) => s.z < groundStorey.z - 0.01 && !emptyBelow.includes(s)) ? '; the storeys below it are basements' : ''}.`)
  }
  for (const s of emptyBelow) storeys.splice(storeys.indexOf(s), 1)

  // ---------- meshes: the shell + each wall / column / space body ----------
  const bodies = new Map<number, Body>()
  const groups = new Map<string, GlbGroup & { pos: Float32Array[]; nor: Float32Array[]; idx: Uint32Array[]; n: number; look?: { slot: 'out' | 'roof' | 'frame'; option: string } }>()
  /** the windows' colours: any see-through one, and how many in all (ImportedShell.glass) */
  const windows = { clear: false, n: 0 }
  const windowIds = idsOfSet(W.IFCWINDOW)
  let triangles = 0
  let capped = false
  const skipShell = new Set<string>(['IfcSpace', 'IfcOpeningElement', 'IfcSpatialZone', 'IfcAnnotation', 'IfcGrid', 'IfcOpeningStandardCase', 'IfcVirtualElement'])
  const furniture = idsOfSet(W.IFCFURNISHINGELEMENT)
  let furnitureSkipped = 0

  const takeBody = (into: Body, P: Float32Array, N: Float32Array, I: Uint32Array, wantInside: boolean, withYs = false) => {
    if (withYs) into.ys ??= []
    for (let i = 0; i < P.length; i += 3) {
      into.pts.push(planOfWorld(P[i], P[i + 2]))
      if (withYs) into.ys!.push(P[i + 1])
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
  /** one placed geometry → positions in the plan frame (X − origin x, Y over the datum, Z + origin y: Z is plan y), normals, indices */
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
      P[j] = m[0] * x + m[4] * y + m[8] * z + m[12] - origin.x
      P[j + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] - baseY
      P[j + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] + origin.y
      const nx = v[i + 3], ny = v[i + 4], nz = v[i + 5]
      const wx = m[0] * nx + m[4] * ny + m[8] * nz, wy = m[1] * nx + m[5] * ny + m[9] * nz, wz = m[2] * nx + m[6] * ny + m[10] * nz
      const l = Math.hypot(wx, wy, wz) || 1
      N[j] = wx / l, N[j + 1] = wy / l, N[j + 2] = wz / l
    }
    return { P, N, I }
  }
  /** a curtain wall's parts (panels, frames), each its own footprint: its straight runs (curtainRuns) */
  const parts = new Map<number, Map<number, Body>>()
  /** a curtain wall's panels (IfcPlate, CURTAIN_PANEL) seen solid in every one of their pieces, and those with a see-through piece: its spandrels (glassFront) */
  const solidPanels = new Set<number>()
  const clearPanels = new Set<number>()
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
  /** each railing's body and upright faces as the stream builds them — its own meshes and its parts' (Vienna's are posts, rails and panes aggregated under it) */
  const railIds = idsOfSet(W.IFCRAILING)
  const rails = new Map<number, { ob: Body; upright: [Pt, Pt, Pt][] }>()
  const railOf = (id: number): number | undefined => {
    for (let i = 0, cur: number | undefined = id; cur !== undefined && i < 3; i++, cur = aggregateParent.get(cur)) if (railIds.has(cur)) return cur
    return undefined
  }
  /** the shape's dressed area by slot and option (m²): the commonest is the building's own (dressName's main) */
  const dressedArea = new Map<string, number>()
  /** the roofs' upward faces (unit normal, area, plan centre): the roof's kind, pitch and ridge (roofSetting) */
  const roofFaces: { n: [number, number, number]; area: number; at: Pt }[] = []
  /** each IfcRoof's upward area (its own faces and its slabs'): the kind its PredefinedType names weighs by it */
  const roofArea = new Map<number, number>()
  const triArea = (P: Float32Array, a: number, b: number, c: number) => {
    // (plain numbers, no Math.hypot nor array destructuring: a million triangles)
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx
    return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2
  }
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
    const wms: { g: ReturnType<typeof mesh.geometries.get>; wm: NonNullable<ReturnType<typeof worldMesh>> }[] = []
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const g = mesh.geometries.get(i)
      const wm = worldMesh(g)
      if (wm) wms.push({ g, wm })
    }
    // what Plotline dresses it in (materials.ts): an outer wall's and its cladding's outside finish, a roof's covering, a
    // window's frame — its triangles then wear that option's pictures (three/shell.ts dressShell)
    const id = mesh.expressID
    let look: { slot: 'out' | 'roof' | 'frame'; option: string } | null = null
    if (shell && inRoof(id)) {
      let flat = 0, sloped = 0
      for (const { wm } of wms)
        for (let t = 0; t < wm.I.length; t += 3) {
          const [a, b, c] = [wm.I[t] * 3, wm.I[t + 1] * 3, wm.I[t + 2] * 3]
          const ny = (wm.N[a + 1] + wm.N[b + 1] + wm.N[c + 1]) / 3
          if (ny < 0.2) continue
          const area = triArea(wm.P, a, b, c)
          if (ny > 0.985) flat += area
          else sloped += area
          roofFaces.push({ n: [(wm.N[a] + wm.N[b] + wm.N[c]) / 3, ny, (wm.N[a + 2] + wm.N[b + 2] + wm.N[c + 2]) / 3], area, at: planOfWorld((wm.P[a] + wm.P[b] + wm.P[c]) / 3, (wm.P[a + 2] + wm.P[b + 2] + wm.P[c + 2]) / 3) })
        }
      const of = roofIds.has(id) ? id : aggregateParent.get(id)
      if (of !== undefined && roofIds.has(of)) roofArea.set(of, (roofArea.get(of) ?? 0) + flat + sloped)
      // (the shape wears the covering its names say even when it is the other kind's: a zinc roof of 5° is zinc)
      const up = aggregateParent.has(id) && roofIds.has(aggregateParent.get(id)!) ? aggregateParent.get(id)! : null
      const pitched = sloped > flat
      const o = roofCovering(id, pitched) ?? (up !== null ? roofCovering(up, pitched) : null) ?? roofCovering(id, !pitched) ?? (up !== null ? roofCovering(up, !pitched) : null)
      if (o) look = { slot: 'roof', option: o }
      // a roof that names no covering and that its file leaves pure black (a colour never set: Revit's "Generic", the 7-room
      // sample's slabs drew black in the Building view) wears its kind's plain covering — and the building's, once staff choose one
      else if (wms.length && wms.every(({ g }) => g.color.x === 0 && g.color.y === 0 && g.color.z === 0)) look = { slot: 'roof', option: (pitched ? ROOF_COVERINGS.pitched : ROOF_COVERINGS.flat)[0].id }
    } else if (shell && win) {
      const o = windowFrame(id)
      if (o) look = { slot: 'frame', option: o }
    } else if (shell && cladding.has(tn) && !(tn === 'IfcPlate' && (isA(owner, W.IFCCURTAINWALL) || predefinedOf(id) === 'CURTAIN_PANEL')) && outerEl(id, tn)) {
      const o = wallFinish(id)
      if (o) look = { slot: 'out', option: o }
      // (an outer wall whose names say nothing known is plaster: it counts toward the building's own, undressed)
      else if (unknownOuter(id)) for (const { wm } of wms) for (let t = 0; t < wm.I.length; t += 3) dressedArea.set(`out|${OUTSIDE_SLOT.defaultOptionId}`, (dressedArea.get(`out|${OUTSIDE_SLOT.defaultOptionId}`) ?? 0) + triArea(wm.P, wm.I[t] * 3, wm.I[t + 1] * 3, wm.I[t + 2] * 3))
    }
    const rail = railOf(id)
    for (const [i, { g, wm }] of wms.entries()) {
      if (wantBody) takeBody(bodyOf(owner), wm.P, wm.N, wm.I, false, isA(owner, W.IFCWALL))
      if (rail !== undefined) {
        // a railing's (or one of its parts'): its footprint, height and upright faces in plan (the railings, below)
        const r = rails.get(rail) ?? rails.set(rail, { ob: { pts: [], minY: Infinity, maxY: -Infinity }, upright: [] }).get(rail)!
        takeBody(r.ob, wm.P, wm.N, wm.I, false)
        for (let t = 0; t < wm.I.length; t += 3) {
          const a = wm.I[t] * 3, b = wm.I[t + 1] * 3, c = wm.I[t + 2] * 3
          if (Math.abs(wm.N[a + 1]) < 0.3) r.upright.push([planOfWorld(wm.P[a], wm.P[a + 2]), planOfWorld(wm.P[b], wm.P[b + 2]), planOfWorld(wm.P[c], wm.P[c + 2])])
        }
      }
      if (wantBody && isA(owner, W.IFCCURTAINWALL)) {
        if (owner !== mesh.expressID && (tn === 'IfcPlate' || predefinedOf(mesh.expressID) === 'CURTAIN_PANEL')) (g.color.w < 0.99 ? clearPanels : solidPanels).add(mesh.expressID)
        if (owner !== mesh.expressID) takeBody(partOf(owner, mesh.expressID), wm.P, wm.N, wm.I, false)
        // a glass front with a body of its own (a balcony's glazing wrapped round it, Nordic housing): its upright faces are its parts
        else
          for (let t = 0; t < wm.I.length; t += 3) {
            const [a, b, c] = [wm.I[t] * 3, wm.I[t + 1] * 3, wm.I[t + 2] * 3]
            if (Math.abs(wm.N[a + 1]) < 0.3) partOf(owner, -1 - t - 1e6 * i).pts.push(planOfWorld(wm.P[a], wm.P[a + 2]), planOfWorld(wm.P[b], wm.P[b + 2]), planOfWorld(wm.P[c], wm.P[c + 2]))
          }
      }
      if (!shell) continue
      if (triangles + wm.I.length / 3 > TRIANGLE_CAP) {
        capped = true
        continue
      }
      const c = g.color
      if (win) (windows.n++, (windows.clear ||= c.w < 0.99))
      // (see-through: the file's glass toned to Plotline's own, materials.ts toneGlass)
      if (c.w < 0.99) [c.x, c.y, c.z, c.w] = toneGlass([c.x, c.y, c.z, c.w])
      // (a window's glass keeps its own colour: only its frame is dressed)
      const dress = look && c.w >= 0.99 ? look : null
      if (dress) {
        const k = `${dress.slot}|${dress.option}`
        let area = 0
        for (let t = 0; t < wm.I.length; t += 3) area += triArea(wm.P, wm.I[t] * 3, wm.I[t + 1] * 3, wm.I[t + 2] * 3)
        dressedArea.set(k, (dressedArea.get(k) ?? 0) + area)
      }
      const key = dress ? `d|${win ? 'w|' : ''}${dress.slot}|${dress.option}` : `${win ? 'w|' : ''}${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)},${c.w.toFixed(3)}`
      let grp = groups.get(key)
      if (!grp) groups.set(key, (grp = { color: [c.x, c.y, c.z, c.w], positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), pos: [], nor: [], idx: [], n: 0, ...(win ? { window: true } : {}), ...(dress ? { look: dress } : {}) }))
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
  const shellName = fileName.replace(/\.[^.]+$/, '')
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
    /** a window's frame (FRAMES_SLOT option), a glass front's mullion spacing */
    holes: { seg: number; kind: OpeningKind; u0: number; u1: number; y0: number; y1: number; frame?: string; bayM?: number; spandrelM?: number; spandrel?: 'dark' | 'metal'; spandrelAt?: 'head' | 'both' }[]
    /** its outside finish (an outer wall's, materials.ts); `outer`: an outer wall's (IsExternal, or every wall when the file does not say) */
    finish?: string
    outer?: boolean
    /** a railing stands on it (or it is one: `alone`, a low wall of its own on the railing's line), and the railing's colour */
    lowKind?: LowWallKind
    railColor?: RailColor
    alone?: boolean
  }
  const chainsOut: Chain[] = []
  /**
   * A gable wall's top at its two ends (its highest point within 15 cm of each, both under its peak), the lower of the two: a
   * gable's peak is no storey top — the plan wall stops at the eave and the outside shape shows the triangle over it
   * (IfcOpenHouse's walls stood through the file's roof). Null: no heights kept (not an IfcWall), or a wall too short.
   */
  const endsTop = (pts: Pt[], b: Body | undefined): number | null => {
    if (!b?.ys) return null
    const a = pts[0], z = pts[pts.length - 1]
    const L = Math.hypot(z.x - a.x, z.y - a.y)
    if (L < 0.5) return null
    const d = { x: (z.x - a.x) / L, y: (z.y - a.y) / L }
    let t0 = -Infinity, t1 = -Infinity
    b.pts.forEach((p, i) => {
      const u = (p.x - a.x) * d.x + (p.y - a.y) * d.y
      if (u < 0.15) t0 = Math.max(t0, b.ys![i])
      else if (u > L - 0.15) t1 = Math.max(t1, b.ys![i])
    })
    // (both ends under its top: a gable's peak, not a wall that steps or one side of a shed — those keep their height)
    return Number.isFinite(t0) && Number.isFinite(t1) && Math.max(t0, t1) < b.maxY - 0.3 ? Math.min(t0, t1) : null
  }
  let gables = 0
  /** outer walls (IsExternal, or every wall when the file does not say), and those whose materials name a finish */
  let outerWalls = 0
  let dressedWalls = 0
  /** each opening's frame as its window's names say (FRAMES_SLOT option): the record's `frame:` keys */
  const frameOfOpening = new Map<Id, string>()
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
    // (an outer wall whose names say nothing keeps the plaster: said so in the record when the building wears something else)
    const outer = !curtain && outerEl(id, typeName(id))
    const named = outer ? wallFinish(id) : null
    if (outer) (outerWalls++, named && dressedWalls++)
    const finish = outer ? (named ?? (unknownOuter(id) ? OUTSIDE_SLOT.defaultOptionId : null)) : null
    for (const pts of chains) {
      const top = endsTop(pts, body)
      const capped = top !== null && body ? on.map((b) => (b.top >= body.maxY - 0.01 && top < b.top - 0.3 && top > b.bottom + 1.5 ? { ...b, top } : b)) : on
      if (capped.some((b, i) => b !== on[i])) gables++
      const chain: Chain = { pts, thickness, on: capped, name: wallName, holes: [], ...(finish ? { finish } : {}), ...(outer ? { outer } : {}) }
      if (curtain && body) chain.holes.push({ seg: 0, kind: 'window', u0: 0, u1: segLen(pts, 0), y0: body.minY, y1: body.maxY, ...glassFront(id, pts) })
      for (const op of voidsOf.get(id) ?? []) {
        const fill = fillOf.get(op)
        const kind: OpeningKind = fill === undefined ? 'passage' : isA(fill, W.IFCDOOR) ? (slidingDoor(fill) ? 'slider' : 'door') : isA(fill, W.IFCWINDOW) ? 'window' : 'passage'
        hang(chain, op, kind, undefined, fill !== undefined && isA(fill, W.IFCWINDOW) ? (windowFrame(fill) ?? undefined) : undefined)
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
    if (best && hang(best.chain, id, kind, ob, kind === 'window' ? (windowFrame(id) ?? undefined) : undefined)) hung++
  }
  // ---------- railings (IfcRailing): what the low wall under each is made of, else a low wall of its own on its line ----------
  let railsOn = 0
  let railsAlone = 0
  let railsAgainst = 0
  for (const [id, { ob, upright }] of rails) {
    // (its footprint, height range and upright faces in plan, from the stream: railRuns tells which sides of its outline it stands on)
    // (a stair's handrail climbs a storey; a stub of rail is no balcony front)
    if (!ob.pts.length || ob.maxY - ob.minY < 0.5 || ob.maxY - ob.minY > 1.6) continue
    const band = bands.find((b) => ob.minY + 0.05 >= b.bottom - 0.3 && ob.minY + 0.05 < b.top)
    if (!band) continue
    const names = [...materialsOf(id).mats.map((m) => m.name), ...typeNames(id)]
    const kind = railKind(names) ?? 'railing'
    const color = railColor(names, kind) // (its material / type names: "Steel, Paint Finish, Dark Gray" anthracite, "Iron, Cast" black)
    let on = 0, alone = 0, against = 0
    for (const [a, b] of railRuns(ob.pts, upright)) {
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const under = chainsOut.find((c) => {
        const on = c.on.find((o) => o.s === band.s)
        if (!on || c.pts.length !== 2) return false
        const [p, q] = c.pts
        const M = Math.hypot(q.x - p.x, q.y - p.y)
        if (M < 0.3 || Math.abs((d.x * (q.y - p.y) - d.y * (q.x - p.x)) / M) > 0.05) return false
        const e = { x: (q.x - p.x) / M, y: (q.y - p.y) / M }
        const u = (mid.x - p.x) * e.x + (mid.y - p.y) * e.y
        return u > 0 && u < M && Math.abs(-(mid.x - p.x) * e.y + (mid.y - p.y) * e.x) <= c.thickness / 2 + 0.12
      })
      if (under) {
        // (a railing against a storey wall — a window's guard rail, a French balcony — is the outside shape's alone)
        if (under.on.some((o) => o.s === band.s && o.top - o.bottom < 2.4)) {
          if (!under.lowKind && color) under.railColor = color
          ;(under.lowKind ??= kind), on++
        }
        else against++
        continue
      }
      const top = Math.min(1.5, Math.max(0.6, ob.maxY - band.bottom))
      chainsOut.push({ pts: [a, b], thickness: 0.05, on: [{ s: band.s, bottom: band.bottom, top: band.bottom + top }], name: 'Railing', holes: [], lowKind: kind, ...(color ? { railColor: color } : {}), alone: true })
      alone++
    }
    // (counted by railing: one that made a low wall glass or stands as one is read; one only against storey walls is the shape's)
    if (alone) railsAlone++
    else if (on) railsOn++
    else if (against) railsAgainst++
  }
  // one draft per storey the wall stands on, its height and openings cut to that storey's band
  for (const chain of chainsOut) {
    for (const { s, bottom, top } of chain.on) {
      const heightM = top - bottom > 0.1 ? top - bottom : WALL_HEIGHT_M
      const draft: WallDraft = { pts: chain.pts, thicknessM: chain.thickness, heightM, openings: [], ...(chain.finish ? { finish: chain.finish } : {}), ...(chain.lowKind ? { lowKind: chain.lowKind } : {}), ...(chain.railColor ? { railColor: chain.railColor } : {}), ...(chain.alone ? { alone: true } : {}) }
      for (const h of chain.holes) {
        const y0 = Math.max(h.y0, bottom) - bottom, y1 = Math.min(h.y1, bottom + heightM) - bottom
        if (y1 - y0 < 0.1) continue
        const sillM = h.kind === 'window' ? y0 : 0
        const L = segLen(chain.pts, h.seg)
        const o: Opening = { id: newId(), kind: h.kind, offsetM: Math.max(0, Math.min(L - (h.u1 - h.u0), h.u0)), widthM: h.u1 - h.u0, heightM: y1 - sillM, sillM, ...(h.bayM ? { bayM: h.bayM } : {}), ...(h.spandrelM ? { spandrelM: h.spandrelM, spandrel: h.spandrel, ...(h.spandrelAt ? { spandrelAt: h.spandrelAt } : {}) } : {}) }
        if (h.frame) frameOfOpening.set(o.id, h.frame)
        draft.openings.push([h.seg, o])
      }
      draftOf(s).walls.push(draft)
    }
  }
  /** an opening element's (or a void-less door's) body projected onto the chain's nearest segment; false when it does not fit */
  function hang(chain: Chain, elem: number, kind: OpeningKind, ob = bodyMesh(elem, false), frame?: string): boolean {
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
      dropped.push(`${kind} ${(u1 - u0).toFixed(2)} m wide on the ${L.toFixed(2)} m wall "${nameWords(chain.name)}"`)
      return false
    }
    chain.holes.push({ seg, kind, u0, u1, y0: ob.minY, y1: ob.maxY, ...(frame ? { frame } : {}) })
    return true
  }
  /**
   * A glass front's mullion spacing and frame: its upright members (IfcMember, MULLION or standing over a metre) projected on
   * its line, the middle of their gaps — between 0.4 and 4 m, else the glazing's own (≤ 1.4 m bays) — and the frame its
   * members' materials name (FRAMES_SLOT).
   */
  function glassFront(wall: number, pts: Pt[]): { bayM?: number; frame?: string; spandrelM?: number; spandrel?: 'dark' | 'metal'; spandrelAt?: 'head' | 'both' } {
    return { ...mullions(wall, pts), ...spandrels(wall) }
  }
  /**
   * A glass front's spandrel (session 31 outside2: ifcmap left them glass): its panels solid in every piece (no see-through
   * one), their height's middle value between 0.2 and 2 m the band on each storey; metal when their materials say so, else
   * dark glass. Where they sit: each panel's middle in the lower half of its storey is a band at the glass's foot (over the
   * slab), in the upper half at its head (under the next slab); both found: a band at both. ponytail: one height and one place
   * for the whole front (a panel astride a slab counts where its middle is), per-storey bands if a file needs them.
   */
  function spandrels(wall: number): { spandrelM?: number; spandrel?: 'dark' | 'metal'; spandrelAt?: 'head' | 'both' } {
    const hs = [...(parts.get(wall)?.entries() ?? [])]
      .filter(([p]) => solidPanels.has(p) && !clearPanels.has(p))
      .map(([p, b]) => [p, b.maxY - b.minY, (b.maxY + b.minY) / 2] as const)
      .filter(([, h]) => h >= 0.2 && h <= 2)
      .sort((a, b) => a[1] - b[1])
    if (!hs.length) return {}
    const [p, h] = hs[Math.floor(hs.length / 2)]
    const metal = materialsOf(p).mats.some((m) => /metal|alu|steel|zinc|copper|panel/i.test(m.name))
    const at = new Set(
      hs.map(([, , c]) => {
        const b = bands.find((x) => c >= x.bottom && c < x.top)
        const top = b && (Number.isFinite(b.top) ? b.top : b.bottom + WALL_HEIGHT_M)
        return b && top! > b.bottom && (c - b.bottom) / (top! - b.bottom) >= 0.5 ? 'head' : 'foot'
      }),
    )
    return { spandrelM: Math.round(h * 100) / 100, spandrel: metal ? 'metal' : 'dark', ...(at.has('head') ? { spandrelAt: at.has('foot') ? 'both' : 'head' } : {}) }
  }
  function mullions(wall: number, pts: Pt[]): { bayM?: number; frame?: string } {
    const a = pts[0], b = pts[pts.length - 1]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    const members = [...(parts.get(wall)?.entries() ?? [])].filter(([p, body]) => p >= 0 && isA(p, W.IFCMEMBER) && (predefinedOf(p) === 'MULLION' || body.maxY - body.minY > 1))
    if (L < 1 || !members.length) return {}
    const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const us = members
      .map(([, body]) => body.pts.reduce((s, p) => s + (p.x - a.x) * d.x + (p.y - a.y) * d.y, 0) / body.pts.length)
      .filter((u) => u > -0.2 && u < L + 0.2)
      .sort((x, y) => x - y)
      .filter((u, i, all) => i === 0 || u - all[i - 1] > 0.05)
    const gaps = us.slice(1).map((u, i) => u - us[i]).sort((x, y) => x - y)
    const bay = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
    const frame = frameOption(materialsOf(members[0][0]).mats.map((m) => m.name)) ?? windowFrame(wall)
    return { ...(bay >= 0.4 && bay <= 4 ? { bayM: Math.round(bay * 100) / 100 } : {}), ...(frame ? { frame } : {}) }
  }

  // ---------- the outside shape, dressed ----------
  /** the building's own option per slot: the outer walls' commonest finish by length on the plans; else the commonest by area in the shape */
  const mainOf = (slot: string): string | undefined => [...dressedArea].filter(([k]) => k.startsWith(`${slot}|`)).sort((a, b) => b[1] - a[1])[0]?.[0].split('|')[1]
  // (named over 30 % of the outer walls' length; else the plaster: LTU's three brick walls of 2 622 are no brick building)
  const byLength = new Map<string, number>()
  let outerLength = 0
  for (const c of chainsOut) {
    if (!c.outer) continue
    const L = c.pts.slice(1).reduce((s, _, i) => s + segLen(c.pts, i), 0) * c.on.length
    outerLength += L
    if (c.finish && c.finish !== OUTSIDE_SLOT.defaultOptionId) byLength.set(c.finish, (byLength.get(c.finish) ?? 0) + L)
  }
  const ranked = [...byLength].sort((a, b) => b[1] - a[1])
  const namedLength = ranked.reduce((s, [, L]) => s + L, 0)
  const mains = {
    out: outerLength ? (namedLength >= 0.3 * outerLength ? ranked[0][0] : OUTSIDE_SLOT.defaultOptionId) : mainOf('out'),
    frame: mainOf('frame'),
    roof: mainOf('roof'),
  }
  const glbGroups: GlbGroup[] = [...groups.values()].map((g) => ({
    ...(g.window ? { window: true } : {}),
    ...(g.look ? { dress: dressName(g.look.slot, g.look.option, mains[g.look.slot] === g.look.option) } : {}),
    color: g.color,
    positions: concat(g.pos, (n) => new Float32Array(n)),
    normals: concat(g.nor, (n) => new Float32Array(n)),
    indices: concat(g.idx, (n) => new Uint32Array(n)),
  }))
  const colours = new Set([...groups.values()].map((g) => g.look?.option ?? g.color.join())).size
  groups.clear() // (the shape's arrays once: the GLB holds them now)
  const shell = glbGroups.length ? { ...writeGlb(glbGroups, shellName), name: shellName, ...(windows.n && !windows.clear ? { glass: 'opaque' as const } : {}) } : undefined
  glbGroups.length = 0

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
  /** the building's outside as the file's materials name it (apartments.ts outsideRecord) */
  const outside: Configuration = { ...(mains.out && mains.out !== OUTSIDE_SLOT.defaultOptionId ? { [OUTSIDE_SLOT.id]: mains.out } : {}), ...(mains.frame ? { [FRAMES_SLOT.id]: mains.frame } : {}) }
  for (const [k, s] of storeys.entries()) {
    const d = draftsByStorey.get(s.id) ?? { walls: [], pillars: [], labels: [], noSpace: true }
    // (each floor is joined and checked — on a big building the longest part): which floor, by its own name, and its size
    progress(`floor ${k + 1} of ${storeys.length}: ${s.name.trim() || 'unnamed'}, ${d.walls.length.toLocaleString('en')} walls`, 0.7 + (0.3 * k) / storeys.length)
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
            if (wd.lowKind && !same.lowKind) (same.lowKind = wd.lowKind), wd.railColor && (same.railColor = wd.railColor)
            segs.push(same.a === a ? same : null) // an opening of a reversed twin is left out: its offset would be mirrored
            continue
          }
          const w: Wall = { id: newId(), a, b, thicknessM: wd.thicknessM, heightM: wd.heightM, openings: [], ...(wd.lowKind ? { lowKind: wd.lowKind } : {}), ...(wd.railColor ? { railColor: wd.railColor } : {}), ...(wd.alone ? { standsAlone: true as const } : {}) }
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
    // the building's outside record (furnish/finishes.ts outsideOf): an outer wall whose file names another finish than the
    // building's own, by its run on this drawing; a window whose frame differs, by its opening
    if (mains.out) {
      const runs = outerRuns(unit)
      for (const [wid, f] of finishesOn(unit, d.walls)) if (f !== mains.out) outside[outsideKey(unit.id, runs.get(wid) ?? wid)] = f
    }
    for (const w of unit.walls)
      for (const o of w.openings) {
        const f = frameOfOpening.get(o.id)
        if (f && f !== mains.frame) outside[frameKey(unit.id, o.id)] = f
      }
    result.push({ name: s.name, elevationM: s.z - baseY, unit })
  }
  const roof = roofSetting([...roofIds].map((r) => ({ kind: predefinedOf(r), area: roofArea.get(r) ?? 0 })), roofFaces, mains.roof)

  // (each storey's own line follows, with its floor's height: listed once, qa4fix)
  notes.push(storeys.length === 1 ? 'One storey:' : `${storeys.length} storeys, the lowest first:`)
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
  // what the outside is made of, by the file's own words (materials.ts)
  const label = (id: string) => [...OUTSIDE_SLOT.options, ...FRAMES_SLOT.options, ...ROOF_COVERINGS.flat, ...ROOF_COVERINGS.pitched].find((o) => o.id === id)?.label ?? id
  const materials = [...read.values()].sort((a, b) => b.count - a.count)
  const known = materials.filter((m) => m.finish)
  if (known.length) {
    const by = new Map<string, string[]>()
    for (const m of known) by.set(m.finish!, [...(by.get(m.finish!) ?? []), m.name])
    notes.push(`The outside as the file's materials name it: ${[...by].map(([f, ns]) => `${label(f)} (${ns.slice(0, 2).map((n) => `"${nameWords(n)}"`).join(', ')}${ns.length > 2 ? ', …' : ''})`).join('; ')}${mains.out ? ` — the building's own: ${label(mains.out)}` : ''}${mains.frame ? `; window frames ${label(mains.frame)}` : ''}. Finishes → click an outer wall to change it.`)
  } else if (mains.frame) notes.push(`Window frames as the file names them: ${label(mains.frame)}.`)
  const unknown = materials.filter((m) => !m.finish && classOf(m.name) === null)
  if (unknown.length) notes.push(`${unknown.length} material${unknown.length === 1 ? '' : 's'} not known (${unknown.length === 1 ? 'it keeps' : 'they keep'} the plaster): ${unknown.slice(0, 4).map((m) => `"${m.name}"`).join(', ')}${unknown.length > 4 ? ', …' : ''} — Materials, below: say what each is, and it is kept for the next file.`)
  if (!fileSaysOutside && known.length) notes.push('The file does not say which walls are outside (IsExternal): every wall whose material is known wears it.')
  if (railsOn + railsAlone) notes.push(`${railsOn + railsAlone} railings read (IfcRailing): ${[railsOn && `${railsOn} on the low wall under them`, railsAlone && `${railsAlone} as low walls of their own on their line (a balcony front)`].filter(Boolean).join(', ')}; what each is made of is under the wall's Made of${railsAgainst ? `; ${railsAgainst} against a storey wall (a window's guard) stay in the outside shape` : ''}.`)
  if (outerWalls) notes.push(`${dressedWalls} of ${outerWalls} outer walls wear the finish their materials name${dressedWalls < outerWalls ? '; the others keep the plaster' : ''}.`)
  if (gables) notes.push(`${gables} walls stop at their eaves: the gable over them is in the outside shape.`)
  const bays = chainsOut.filter((c) => c.holes.some((h) => h.bayM)).length
  if (bays) notes.push(`${bays} glass fronts keep the file's mullion spacing.`)
  if (roof) notes.push(`Roof: ${roof.kind === 'flat' ? 'flat' : `${roof.kind}${roof.pitchDeg ? `, ${roof.pitchDeg}°` : ''}${roof.ridge === 'short' ? ', ridge across the building' : ''}`}${roof.covering ? `, ${label(roof.covering)}` : ''} — from the file (Studio → the ROOF line changes it).`)
  else {
    const own = [...roofIds].map(predefinedOf).find((k) => ROOF_TYPE[k] === 'own')
    if (own) notes.push(`The file's roof is its own shape (${own.toLowerCase().replace(/_/g, ' ')}): the outside shape keeps it${mains.roof ? `, in ${label(mains.roof)}` : ''}.`)
  }
  if (shell) notes.push(`Outside shape: ${shell.triangles.toLocaleString()} triangles in ${colours} colours${capped ? ` — capped at ${TRIANGLE_CAP.toLocaleString()}, the rest was left out` : ''}.`)
  else notes.push('The file has no solid geometry: no outside shape.')
  notes.push(`Read in ${((Date.now() - t0) / 1000).toFixed(1)} s.`)

  return {
    format: 'ifc',
    storeys: result,
    shell,
    notes,
    unitScale: scale,
    origin,
    ...(Object.keys(outside).length ? { outside } : {}),
    ...(roof ? { roof } : {}),
    ...(materials.length ? { materials } : {}),
  }
}

/**
 * The straight runs of a railing's footprint (plan points of its body, its upright triangles in plan): one run along a thin
 * one (the long axis of its smallest box, under 30 cm across); else the sides of its outline that its upright faces cover
 * for 60 % of their length (a face within 12 cm of the side) — the three sides of a balcony's U, never the open fourth along
 * the facade. Runs under 80 cm are left out.
 */
export function railRuns(pts: Pt[], upright: [Pt, Pt, Pt][]): [Pt, Pt][] {
  const r = minRect(pts)
  if (!r || r.lengthM < 0.8) return []
  const end = (k: number): Pt => ({ x: r.centre.x + (k * r.dir.x * r.lengthM) / 2, y: r.centre.y + (k * r.dir.y * r.lengthM) / 2 })
  if (r.widthM < 0.3) return [[end(-1), end(1)]]
  const h = hull(pts)
  const out: [Pt, Pt][] = []
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length]
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 0.8) continue
    const d = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const spans: [number, number][] = []
    for (const t of upright) {
      if (!t.every((p) => Math.abs(-(p.x - a.x) * d.y + (p.y - a.y) * d.x) <= 0.12)) continue
      const us = t.map((p) => Math.max(0, Math.min(L, (p.x - a.x) * d.x + (p.y - a.y) * d.y)))
      spans.push([Math.min(...us), Math.max(...us)])
    }
    let covered = 0
    let reach = 0
    for (const [u0, u1] of spans.sort((p, q) => p[0] - q[0])) {
      covered += Math.max(0, u1 - Math.max(u0, reach))
      reach = Math.max(reach, u1)
    }
    if (covered >= 0.6 * L) out.push([a, b])
  }
  return out
}

/** IfcRoof's PredefinedType → the roof kind; one Plotline cannot draw (a barrel, a dome, a freeform roof) is the file's own shape. */
const ROOF_TYPE: Record<string, RoofKind | 'own'> = {
  FLAT_ROOF: 'flat',
  SHED_ROOF: 'shed',
  GABLE_ROOF: 'gable',
  HIP_ROOF: 'hip',
  HIPPED_GABLE_ROOF: 'hip',
  GAMBREL_ROOF: 'mansard',
  MANSARD_ROOF: 'mansard',
  BARREL_ROOF: 'own',
  RAINBOW_ROOF: 'own',
  BUTTERFLY_ROOF: 'own',
  PAVILION_ROOF: 'own',
  DOME_ROOF: 'own',
  FREEFORM: 'own',
}

/**
 * The roof setting (data/building/roof.ts) an IFC's roofs make: the kind its IfcRoofs name (the one over the most area), else what its
 * upward faces show — flat when most of their area lies within 10° of level; else by which way the slopes face, across the
 * roof's long side or along it: two opposite ways a gable (its ridge along the long side, or across it), one way a shed,
 * all four a hip; the pitch the slopes' area-weighted mean, to the degree; the covering the commonest one read. Null: no
 * roof, or one of its own shape (kept as the outside shape draws it).
 */
export function roofSetting(kinds: { kind: string; area: number }[], faces: { n: [number, number, number]; area: number; at: Pt }[], covering?: string): Roof | null {
  const by = new Map<RoofKind | 'own', number>()
  for (const k of kinds) if (ROOF_TYPE[k.kind]) by.set(ROOF_TYPE[k.kind], (by.get(ROOF_TYPE[k.kind]) ?? 0) + k.area + 1e-6)
  const said = [...by].sort((a, b) => b[1] - a[1])[0]?.[0]
  if (said === 'own' || (!faces.length && !said)) return null
  const total = faces.reduce((s, f) => s + f.area, 0)
  const sloped = faces.filter((f) => f.n[1] <= 0.985)
  const slopedArea = sloped.reduce((s, f) => s + f.area, 0)
  const flat = slopedArea < total / 2
  const r = minRect(faces.map((f) => f.at))
  const along = r?.dir ?? { x: 1, y: 0 }
  // the share of the sloped area facing across the long side, each way, and along it, each way
  const share = [0, 0, 0, 0]
  for (const f of sloped) {
    const h = Math.hypot(f.n[0], f.n[2]) || 1
    const [x, y] = [f.n[0] / h, f.n[2] / h] // (world Z is plan y)
    const u = x * along.x + y * along.y, v = -x * along.y + y * along.x
    share[Math.abs(v) >= Math.abs(u) ? (v >= 0 ? 0 : 1) : u >= 0 ? 2 : 3] += f.area / (slopedArea || 1)
  }
  const [a0, a1, l0, l1] = share
  const geo: RoofKind = flat
    ? 'flat'
    : Math.max(...share) > 0.8
      ? 'shed'
      : Math.min(...share) > 0.1
        ? 'hip'
        : 'gable'
  const kind = said ?? geo
  const pitch = slopedArea ? Math.round((sloped.reduce((s, f) => s + Math.acos(Math.min(1, f.n[1])) * f.area, 0) / slopedArea) * (180 / Math.PI)) : 0
  const ridge = kind === 'gable' && l0 + l1 > a0 + a1 ? ('short' as const) : undefined
  const cover = covering && (kind === 'flat' ? ROOF_COVERINGS.flat : ROOF_COVERINGS.pitched).some((o) => o.id === covering) ? covering : undefined
  return {
    kind,
    ...(kind !== 'flat' && pitch >= 5 && pitch <= 75 ? { pitchDeg: pitch } : {}),
    ...(ridge ? { ridge } : {}),
    ...(cover ? { covering: cover } : {}),
  }
}

/**
 * A glass front's straight runs from its parts' footprints (each a minRect): parts along one line (within 2°, 15 cm of it)
 * whose spans meet or leave a gap of RUN_GAP_M at most are one run, from the first part's end to the last's; its width
 * the widest part's. A part shorter than RUN_PART_M (a mullion's section) or wider than MAX_THICK_M is no run; a run shorter
 * than RUN_MIN_M is no wall.
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
    for (const [u0, u1, w] of runs) if (u1 - u0 >= RUN_MIN_M - 1e-9) out.push({ a: at(u0), b: at(u1), widthM: w })
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
