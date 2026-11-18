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
import { deriveRooms, newId, validate } from '../core'
import type { Id, Opening, OpeningKind, Pillar, Pt, RoomLabel, Vertex, Wall } from '../core'
import { PARTITION_M, WALL_HEIGHT_M, emptyUnit, guessKind, initialState, reducer } from '../studio/model'
import { writeGlb, type GlbGroup } from './glb'

type WebIfc = typeof import('web-ifc')
type Api = InstanceType<WebIfc['IfcAPI']>

/** corners closer than this are one corner */
const SNAP_M = 0.01
/** a curved axis is cut into chords this far from the arc at most */
const CHORD_M = 0.02
const TRIANGLE_CAP = 1_500_000

// ---------- web-ifc ----------

let apiPromise: Promise<{ W: WebIfc; api: Api }> | null = null

/** One wasm instance for the session (web-ifc's Init is the slow part). Browser: the wasm comes from Vite's asset URL. */
function loadApi(): Promise<{ W: WebIfc; api: Api }> {
  apiPromise ??= (async () => {
    const mod = (await import('web-ifc')) as WebIfc & { default?: WebIfc }
    const W = mod.IfcAPI ? mod : mod.default! // Node's CommonJS build lands under `default`
    const api = new W.IfcAPI()
    if (typeof window !== 'undefined') {
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
}

// ---------- the importer ----------

export async function importIfc(bytes: ArrayBuffer, name: string): Promise<ImportResult> {
  const t0 = Date.now()
  const { W, api } = await loadApi()
  const data = name.toLowerCase().endsWith('.ifczip') ? await unzipIfc(bytes) : new Uint8Array(bytes)
  const model = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false })
  try {
    return readModel(W, api, model, name, t0)
  } finally {
    api.CloseModel(model)
  }
}

function readModel(W: WebIfc, api: Api, model: number, fileName: string, t0: number): ImportResult {
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
  const storeys: Storey[] = idsOf(W.IFCBUILDINGSTOREY).map((id) => {
    const s = line(id)
    const pz = s.ObjectPlacement ? worldFrame(s.ObjectPlacement.value).o[2] : NaN
    const ez = val(s.Elevation)
    return { id, name: String(val(s.Name) ?? val(s.LongName) ?? `Storey`), z: Number.isFinite(pz) ? pz : typeof ez === 'number' ? ez * scale : 0, walls: [], columns: [], spaces: [] }
  })
  storeys.sort((a, b) => a.z - b.z)
  if (!storeys.length) notes.push('The file has no building storeys: no floor plan could be made, only the outside shape.')
  const baseY = storeys[0]?.z ?? 0
  const storeyOfId = new Map<number, Storey>(storeys.map((s) => [s.id, s]))
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
  const bodyOf = (id: number): Body => {
    let b = bodies.get(id)
    if (!b) bodies.set(id, (b = { pts: [], minY: Infinity, maxY: -Infinity }))
    return b
  }

  api.StreamAllMeshes(model, (mesh) => {
    const tn = typeName(mesh.expressID)
    const owner = ownerOf(mesh.expressID)
    const wantBody = isA(owner, W.IFCWALL) || isA(owner, W.IFCCURTAINWALL) || isA(owner, W.IFCCOLUMN)
    const shell = !skipShell.has(tn) && !furniture.has(mesh.expressID)
    if (!shell && furniture.has(mesh.expressID)) furnitureSkipped++
    if (!shell && !wantBody) return
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const g = mesh.geometries.get(i)
      const wm = worldMesh(g)
      if (!wm) continue
      if (wantBody) takeBody(bodyOf(owner), wm.P, wm.N, wm.I, false)
      if (!shell) continue
      if (triangles + wm.I.length / 3 > TRIANGLE_CAP) {
        capped = true
        continue
      }
      const c = g.color
      const key = `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)},${c.w.toFixed(3)}`
      let grp = groups.get(key)
      if (!grp) groups.set(key, (grp = { color: [c.x, c.y, c.z, c.w], positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), pos: [], nor: [], idx: [], n: 0 }))
      for (let k = 0; k < wm.I.length; k++) wm.I[k] += grp.n
      grp.pos.push(wm.P), grp.nor.push(wm.N), grp.idx.push(wm.I)
      grp.n += wm.P.length / 3
      triangles += wm.I.length / 3
    }
  })
  const concat = <T extends Float32Array | Uint32Array>(parts: T[], make: (n: number) => T): T => {
    const out = make(parts.reduce((s, p) => s + p.length, 0))
    let at = 0
    for (const p of parts) out.set(p as any, at), (at += p.length)
    return out
  }
  const glbGroups: GlbGroup[] = [...groups.values()].map((g) => ({
    color: g.color,
    positions: concat(g.pos, (n) => new Float32Array(n)),
    normals: concat(g.nor, (n) => new Float32Array(n)),
    indices: concat(g.idx, (n) => new Uint32Array(n)),
  }))
  const shellName = fileName.replace(/\.[^.]+$/, '')
  const shell = glbGroups.length ? { ...writeGlb(glbGroups, shellName), name: shellName } : undefined
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

  interface WallDraft {
    pts: Pt[]
    thicknessM: number
    heightM: number
    /** [segment index, opening] */
    openings: [number, Opening][]
  }
  const dropped: string[] = []
  let noAxis = 0
  let curved = 0
  let noBody = 0
  const draftsByStorey = new Map<number, { walls: WallDraft[]; pillars: Pillar[]; labels: RoomLabel[]; noSpace: boolean }>()
  const draftOf = (s: Storey) => {
    let d = draftsByStorey.get(s.id)
    if (!d) draftsByStorey.set(s.id, (d = { walls: [], pillars: [], labels: [], noSpace: true }))
    return d
  }
  let unplaced = 0

  const wallIds = [...idsOf(W.IFCWALL), ...idsOf(W.IFCCURTAINWALL)]
  for (const id of wallIds) {
    const s = storeyOf(id)
    if (!s) {
      unplaced++
      continue
    }
    const w = line(id)
    const curtain = isA(id, W.IFCCURTAINWALL)
    const body = bodies.get(id)
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
      if (!curtain) noAxis++
      chains = [[{ x: r.centre.x - (r.dir.x * r.lengthM) / 2, y: r.centre.y - (r.dir.y * r.lengthM) / 2 }, { x: r.centre.x + (r.dir.x * r.lengthM) / 2, y: r.centre.y + (r.dir.y * r.lengthM) / 2 }]]
      thickness ??= r.widthM
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
    const heightM = body && body.maxY - body.minY > 0.1 ? body.maxY - body.minY : WALL_HEIGHT_M
    const wallName = String(val(w.Name) ?? id)
    for (const pts of chains) {
      const draft: WallDraft = { pts, thicknessM: thickness, heightM, openings: [] }
      const segLen = (i: number) => Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
      if (curtain) {
        draft.openings.push([0, { id: newId(), kind: 'window', offsetM: 0, widthM: segLen(0), heightM, sillM: 0 }])
      }
      for (const op of voidsOf.get(id) ?? []) {
        const ob = bodyMesh(op, false)
        if (!ob) continue
        // the segment nearest the opening's centre
        const cx = ob.pts.reduce((a, p) => a + p.x, 0) / ob.pts.length, cy = ob.pts.reduce((a, p) => a + p.y, 0) / ob.pts.length
        let seg = 0, segD = Infinity
        for (let i = 0; i + 1 < pts.length; i++) {
          const L = segLen(i)
          if (L < 1e-6) continue
          const d = { x: (pts[i + 1].x - pts[i].x) / L, y: (pts[i + 1].y - pts[i].y) / L }
          const u = Math.max(0, Math.min(L, (cx - pts[i].x) * d.x + (cy - pts[i].y) * d.y))
          const dist = Math.hypot(pts[i].x + d.x * u - cx, pts[i].y + d.y * u - cy)
          if (dist < segD) (segD = dist), (seg = i)
        }
        const L = segLen(seg)
        if (L < 1e-6) continue
        const d = { x: (pts[seg + 1].x - pts[seg].x) / L, y: (pts[seg + 1].y - pts[seg].y) / L }
        let u0 = Infinity, u1 = -Infinity
        for (const p of ob.pts) {
          const u = (p.x - pts[seg].x) * d.x + (p.y - pts[seg].y) * d.y
          u0 = Math.min(u0, u), u1 = Math.max(u1, u)
        }
        const fill = fillOf.get(op)
        const kind: OpeningKind = fill === undefined ? 'passage' : isA(fill, W.IFCDOOR) ? (slidingDoor(fill) ? 'slider' : 'door') : isA(fill, W.IFCWINDOW) ? 'window' : 'passage'
        const sillM = kind === 'window' ? Math.max(0, ob.minY - (s.z - baseY)) : 0
        const top = ob.maxY - (s.z - baseY)
        const widthM = u1 - u0
        if (widthM > L + 0.02 || widthM < 0.1 || top - sillM < 0.1) {
          dropped.push(`${kind} ${widthM.toFixed(2)} m wide on wall "${wallName}" (${s.name})`)
          continue
        }
        const offsetM = Math.max(0, Math.min(L - widthM, u0))
        draft.openings.push([seg, { id: newId(), kind, offsetM, widthM, heightM: Math.min(top, heightM) - sillM, sillM }])
      }
      draftOf(s).walls.push(draft)
    }
  }

  // ---------- columns ----------
  for (const id of idsOf(W.IFCCOLUMN)) {
    const s = storeyOf(id)
    const body = bodies.get(id)
    if (!s || !body) continue
    const h = hull(body.pts)
    if (h.length < 3) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of h) (x0 = Math.min(x0, p.x)), (y0 = Math.min(y0, p.y)), (x1 = Math.max(x1, p.x)), (y1 = Math.max(y1, p.y))
    const pillar: Pillar = { id: newId(), x: (x0 + x1) / 2, y: (y0 + y1) / 2, wM: x1 - x0, hM: y1 - y0 }
    const axisAligned = h.every((p) => (Math.abs(p.x - x0) < 0.005 || Math.abs(p.x - x1) < 0.005) && (Math.abs(p.y - y0) < 0.005 || Math.abs(p.y - y1) < 0.005))
    if (h.length === 4 && !axisAligned) pillar.corners = h.map((p) => ({ x: p.x, y: p.y }))
    if (pillar.wM > 0.02 && pillar.hM > 0.02) draftOf(s).pillars.push(pillar)
  }

  // ---------- spaces ----------
  let outsideLabels = 0
  for (const id of idsOf(W.IFCSPACE)) {
    const s = storeyOf(id)
    if (!s) continue
    const sp = line(id)
    const body = bodyMesh(id, true)
    if (!body) continue
    const at = body.inside ?? (minRect(body.pts)?.centre ?? null)
    if (!at) continue
    const name = String(val(sp.LongName) || val(sp.Name) || 'Space').trim()
    const lvl = (body.insideY ?? body.minY) - (s.z - baseY)
    const label: RoomLabel = { id: newId(), name, kind: guessKind(name), x: at.x, y: at.y, ...(Math.abs(lvl) > 0.05 && Math.abs(lvl) < 3 ? { levelM: lvl } : {}) }
    draftOf(s).labels.push(label)
    draftOf(s).noSpace = false
  }

  // ---------- the units ----------
  const result: ImportedStorey[] = []
  const counts: string[] = []
  for (const s of storeys) {
    const d = draftsByStorey.get(s.id)
    if (!d) {
      counts.push(`${s.name} (${fmt(s.z - baseY)} m): nothing on it.`)
      continue
    }
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
    for (const wd of d.walls) {
      const segs: (Wall | null)[] = []
      for (let i = 0; i + 1 < wd.pts.length; i++) {
        const a = vertexAt(wd.pts[i]), b = vertexAt(wd.pts[i + 1])
        if (a === b) {
          segs.push(null)
          continue
        }
        const w: Wall = { id: newId(), a, b, thicknessM: wd.thicknessM, heightM: wd.heightM, openings: [] }
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
    unit = reducer(initialState(), { type: 'load-unit', unit }).unit
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
    if (d.noSpace) counts.push(`${s.name}: the file names no rooms (IfcSpace) on this floor; the rooms stay "Space N".`)
    result.push({ name: s.name, elevationM: s.z - baseY, unit })
  }

  notes.push(`${storeys.length} storey${storeys.length === 1 ? '' : 's'}: ${storeys.map((s) => `${s.name} at ${fmt(s.z - baseY)} m`).join(', ')}.`)
  notes.push(...counts)
  if (noAxis) notes.push(`${noAxis} walls had no centre line in the file: their line was taken from the body's footprint.`)
  if (curved) notes.push(`${curved} curved walls were cut into straight pieces (within ${CHORD_M * 100} cm of the arc).`)
  if (noBody) notes.push(`${noBody} walls had neither a centre line nor a body and were left out.`)
  if (unplaced) notes.push(`${unplaced} walls belong to no storey in the file and were left out of the plans (they are still in the outside shape).`)
  if (dropped.length) notes.push(`${dropped.length} openings did not fit their wall and were left out: ${dropped.slice(0, 5).join('; ')}${dropped.length > 5 ? '; …' : ''}.`)
  if (outsideLabels) notes.push(`${outsideLabels} room names landed outside any closed room (walls there do not close).`)
  if (furnitureSkipped) notes.push(`${furnitureSkipped} furniture pieces were skipped (the Studio furnishes rooms itself).`)
  if (shell) notes.push(`Outside shape: ${shell.triangles.toLocaleString()} triangles in ${glbGroups.length} colours${capped ? ` — capped at ${TRIANGLE_CAP.toLocaleString()}, the rest was left out` : ''}.`)
  else notes.push('The file has no solid geometry: no outside shape.')
  notes.push(`Read in ${((Date.now() - t0) / 1000).toFixed(1)} s.`)

  return { format: 'ifc', storeys: result, shell, notes, unitScale: scale, origin }
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

// ---------- .ifczip ----------

/** the first .ifc inside a zip (stored or deflated); the browser and Node both have DecompressionStream */
async function unzipIfc(bytes: ArrayBuffer): Promise<Uint8Array> {
  const dv = new DataView(bytes)
  const u8 = new Uint8Array(bytes)
  let eocd = -1
  for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 66000); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  if (eocd < 0) throw new Error('not a zip file')
  const count = dv.getUint16(eocd + 10, true)
  let at = dv.getUint32(eocd + 16, true)
  let fallback: number | null = null
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(at, true) !== 0x02014b50) break
    const nameLen = dv.getUint16(at + 28, true), extraLen = dv.getUint16(at + 30, true), commentLen = dv.getUint16(at + 32, true)
    const name = new TextDecoder().decode(u8.subarray(at + 46, at + 46 + nameLen))
    const local = dv.getUint32(at + 42, true)
    if (name.toLowerCase().endsWith('.ifc')) return inflateEntry(bytes, local)
    fallback ??= local
    at += 46 + nameLen + extraLen + commentLen
  }
  if (fallback === null) throw new Error('the zip holds no .ifc file')
  return inflateEntry(bytes, fallback)
}

async function inflateEntry(bytes: ArrayBuffer, local: number): Promise<Uint8Array> {
  const dv = new DataView(bytes)
  if (dv.getUint32(local, true) !== 0x04034b50) throw new Error('broken zip entry')
  const method = dv.getUint16(local + 8, true)
  const compressed = dv.getUint32(local + 18, true)
  const nameLen = dv.getUint16(local + 26, true), extraLen = dv.getUint16(local + 28, true)
  const start = local + 30 + nameLen + extraLen
  const data = new Uint8Array(bytes, start, compressed || bytes.byteLength - start)
  if (method === 0) return data.slice()
  if (method !== 8) throw new Error(`zip method ${method} is not supported`)
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
