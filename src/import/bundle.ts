/**
 * One drop of several files (session 31): a folder, a .zip, or files picked together — a .gltf with its .bin and texture
 * folder, an .obj with its .mtl, a .glb or .fbx beside the pictures it points to, a zipped IFC. The Studio collects them
 * (drop.ts walks a dropped folder), this picks the file to open and lets the 3D loaders find the rest by name.
 * Pure (fflate is the one three ships, MIT): tested in bundle.test.ts.
 */
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js'

/** a file of the drop: its path inside the drop ('/' between folders), its bytes */
export interface DropFile {
  path: string
  data: Blob
}

const ext = (p: string) => p.toLowerCase().split('.').pop() ?? ''
const base = (p: string) => p.split('/').pop() ?? p
const dir = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
/** a path as the files name each other: '/' only, no './', no leading '/' */
export const cleanPath = (p: string): string => p.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').replace(/\/\.\//g, '/')

/** zip bytes → its files ('\' from Windows' own zipper → '/'; folders, __MACOSX and ._ shadow files left out) */
export function unzipFiles(bytes: Uint8Array): { path: string; data: Uint8Array }[] {
  const all = unzipSync(bytes)
  return Object.entries(all)
    .map(([p, data]) => ({ path: cleanPath(p), data }))
    .filter(({ path }) => !path.endsWith('/') && !/(^|\/)__MACOSX\//.test(path) && !base(path).startsWith('._'))
}

/** a drop with its .zip files opened (their files take the zip's place, under its folder) */
export async function expandZips(files: DropFile[]): Promise<DropFile[]> {
  const out: DropFile[] = []
  for (const f of files) {
    if (ext(f.path) !== 'zip') {
      out.push(f)
      continue
    }
    const at = dir(f.path)
    for (const z of unzipFiles(new Uint8Array(await f.data.arrayBuffer()))) out.push({ path: at + z.path, data: new Blob([z.data as Uint8Array<ArrayBuffer>]) })
  }
  return out
}

/** what a drop is opened as, best first: the file that holds the most (an IFC has the rooms AND the outside) */
const RANK = ['ifc', 'ifczip', 'glb', 'gltf', 'fbx', 'obj', 'dae', 'kmz', '3dm', '3ds', 'wrl', 'ply', 'stl', 'dxf', 'svg', 'pdf']

/**
 * The file of a drop Plotline opens, or null when none is an architect's file (then a picture or a saved drawing in it is
 * used as before). Among several of the best kind: an architectural model over a structural / services one (ifc-bench's
 * arc / str / mep), else the shortest path (the top of the folder), then by name.
 */
export function mainFile(paths: string[]): string | null {
  for (const e of RANK) {
    const of = paths.filter((p) => ext(p) === e)
    if (!of.length) continue
    const arch = (p: string) => (/(^|[^a-z])(arc|arch|archi|architecture)([^a-z]|$)/i.test(base(p)) ? 0 : /(^|[^a-z])(str|struct|mep|hvac|elec|plumb)/i.test(base(p)) ? 2 : 1)
    return of.sort((a, b) => arch(a) - arch(b) || a.split('/').length - b.split('/').length || a.localeCompare(b))[0]
  }
  return null
}

/**
 * The other files as the main file's loader asks for them: by their path from the main file's folder (and, as a fallback,
 * by name alone — an .fbx often names its pictures by a path on the artist's own computer).
 */
export function siblingsOf(files: DropFile[], main: string): Map<string, Blob> {
  const at = dir(main)
  const out = new Map<string, Blob>()
  for (const f of files) {
    if (f.path === main) continue
    out.set((f.path.startsWith(at) ? f.path.slice(at.length) : f.path).toLowerCase(), f.data)
  }
  for (const f of files) if (f.path !== main && !out.has(base(f.path).toLowerCase())) out.set(base(f.path).toLowerCase(), f.data)
  return out
}

/** The file a loader asks for (a relative URI, maybe %-escaped, maybe a Windows path) among the siblings, else null. */
export function findSibling(siblings: Map<string, Blob>, uri: string): Blob | null {
  if (/^(data|blob|https?):/i.test(uri)) return null
  let p = uri
  try {
    p = decodeURIComponent(uri)
  } catch {
    /* a bare % in a name: as it is */
  }
  p = cleanPath(p).toLowerCase()
  return siblings.get(p) ?? siblings.get(base(p)) ?? null
}
