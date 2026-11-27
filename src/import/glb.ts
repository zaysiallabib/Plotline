/**
 * A binary glTF (GLB) written by hand, so the shell needs no three.js here and the same code runs in Node (tests) and the
 * browser. One buffer, one mesh, one primitive per material colour (positions + normals + uint32 indices; a dressed group's
 * texture coordinates in metres), the JSON chunk and the BIN chunk padded to 4 bytes. World axes as the importer gives them (X right, Y up, Z toward the viewer).
 */

export interface GlbGroup {
  /** r g b a, 0..1 */
  color: [number, number, number, number]
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  /** an IfcWindow's (its frame and its glass): its material named WINDOW, so the viewer can find it (three/shell.ts) */
  window?: boolean
  /**
   * What Plotline dresses it in (session 31 ifcmap: `dressName`), its material's name; it then carries texture coordinates in
   * metres (dressUvs), so the viewer's picture sets tile on it as on its own walls (three/materials.ts).
   */
  dress?: string
}

/**
 * A dressed group's material name: `plotline:<slot>:<option id>`, `:main` when it is the building's own (the commonest), so it
 * follows the building's choice for that slot (three/shell.ts dressShell). Slots: `out` (an outside finish), `frame` (a
 * window frame), `roof` (a roof covering).
 */
export const DRESS = 'plotline:'
export const dressName = (slot: 'out' | 'frame' | 'roof', option: string, main: boolean): string => `${DRESS}${slot}:${option}${main ? ':main' : ''}`
export const parseDress = (name: string): { slot: 'out' | 'frame' | 'roof'; option: string; main: boolean } | null => {
  const m = /^plotline:(out|frame|roof):([^:]+)(:main)?$/.exec(name)
  return m ? { slot: m[1] as 'out' | 'frame' | 'roof', option: m[2], main: !!m[3] } : null
}

/**
 * Texture coordinates in metres for a dressed group, from each vertex's own normal: a flat roof or floor by its X / Z; any
 * other face by its horizontal run along the face and its rise up it (a wall: across and up; a slope: along the eave and up
 * the slope), so a brick course stays level and a tile row runs along the eave.
 */
export function dressUvs(P: Float32Array, N: Float32Array): Float32Array {
  const uv = new Float32Array((P.length / 3) * 2)
  // (plain numbers, no Math.hypot nor array destructuring: a million vertices)
  for (let i = 0, j = 0; i < P.length; i += 3, j += 2) {
    const x = P[i], y = P[i + 1], z = P[i + 2]
    const nx = N[i], ny = N[i + 1], nz = N[i + 2]
    const h = Math.sqrt(nx * nx + nz * nz)
    if (h < 0.02) {
      uv[j] = x
      uv[j + 1] = z
      continue
    }
    const tx = -nz / h, tz = nx / h // along the face, level
    // up the face: n × t has a positive rise on every face that is not a ceiling
    const bx = ny * tz, by = nz * tx - nx * tz, bz = -ny * tx
    const s = by < 0 ? -1 : 1
    uv[j] = x * tx + z * tz
    uv[j + 1] = s * (x * bx + y * by + z * bz)
  }
  return uv
}

/** the material name a window's parts carry in the GLB */
export const WINDOW = 'window'

export interface GlbOut {
  glb: ArrayBuffer
  bounds: { min: [number, number, number]; max: [number, number, number] }
  triangles: number
}

const pad4 = (n: number): number => (n + 3) & ~3

export function writeGlb(groups: GlbGroup[], name: string): GlbOut {
  const bufferViews: object[] = []
  const accessors: object[] = []
  const materials: object[] = []
  const primitives: object[] = []
  const chunks: ArrayBufferView[] = []
  let byteOffset = 0
  let triangles = 0
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  const view = (data: ArrayBufferView, target: number): number => {
    chunks.push(data)
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.byteLength, target })
    byteOffset += pad4(data.byteLength)
    return bufferViews.length - 1
  }

  for (const g of groups) {
    if (!g.indices.length) continue
    const n = g.positions.length / 3
    const pmin = [Infinity, Infinity, Infinity], pmax = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < g.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const v = g.positions[i + k]
        if (v < pmin[k]) pmin[k] = v
        if (v > pmax[k]) pmax[k] = v
      }
    for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], pmin[k])), (max[k] = Math.max(max[k], pmax[k]))
    const pos = accessors.push({ bufferView: view(g.positions, 34962), componentType: 5126, count: n, type: 'VEC3', min: pmin, max: pmax }) - 1
    const nor = accessors.push({ bufferView: view(g.normals, 34962), componentType: 5126, count: n, type: 'VEC3' }) - 1
    const idx = accessors.push({ bufferView: view(g.indices, 34963), componentType: 5125, count: g.indices.length, type: 'SCALAR' }) - 1
    const uv = g.dress ? accessors.push({ bufferView: view(dressUvs(g.positions, g.normals), 34962), componentType: 5126, count: n, type: 'VEC2' }) - 1 : -1
    const [r, b_, bl, a] = g.color
    const mat =
      materials.push({
        ...(g.dress ? { name: g.dress } : g.window ? { name: WINDOW } : {}),
        pbrMetallicRoughness: { baseColorFactor: [r, b_, bl, a], metallicFactor: 0, roughnessFactor: 0.8 },
        doubleSided: true,
        ...(a < 0.999 ? { alphaMode: 'BLEND' } : {}),
      }) - 1
    primitives.push({ attributes: { POSITION: pos, NORMAL: nor, ...(uv >= 0 ? { TEXCOORD_0: uv } : {}) }, indices: idx, material: mat, mode: 4 })
    triangles += g.indices.length / 3
  }

  const json = {
    asset: { version: '2.0', generator: 'Plotline import' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [{ primitives, name }],
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonLen = pad4(jsonBytes.length)
  const total = 12 + 8 + jsonLen + 8 + byteOffset
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonLen, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  u8.set(jsonBytes, 20)
  u8.fill(0x20, 20 + jsonBytes.length, 20 + jsonLen) // spaces pad the JSON chunk
  let at = 20 + jsonLen
  dv.setUint32(at, byteOffset, true)
  dv.setUint32(at + 4, 0x004e4942, true) // 'BIN'
  at += 8
  for (const c of chunks) {
    u8.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), at)
    at += pad4(c.byteLength)
  }
  if (!Number.isFinite(min[0])) min.fill(0), max.fill(0)
  return { glb: out, bounds: { min, max }, triangles }
}

/** The JSON chunk of a GLB (for tests and the notes). Throws when the magic is wrong. */
export function readGlbJson(glb: ArrayBuffer): { json: Record<string, unknown>; binLength: number } {
  const dv = new DataView(glb)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB')
  const jsonLen = dv.getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen))) as Record<string, unknown>
  const binLength = 20 + jsonLen + 8 <= glb.byteLength ? dv.getUint32(20 + jsonLen, true) : 0
  return { json, binLength }
}
