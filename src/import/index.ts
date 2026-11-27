/**
 * One door for every architect file the Studio takes (see types.ts for what comes out and the frame). By extension:
 *  .ifc / .ifczip                       → ifc.ts  (walls, openings, spaces, storeys, columns + the exact shell)
 *  .dxf                                 → dxf.ts  (2D lines on layers → walls, openings, texts)
 *  .pdf (vector drawing)                → pdf.ts  (path lines + text → the DXF engine)
 *  .svg                                 → svg.ts  (lines / paths / texts, groups as layers → the DXF engine)
 *  .glb .gltf .obj .fbx .3dm .dae .stl .3ds .kmz .wrl .ply → mesh.ts (the exact shell only, no rooms)
 * The picture formats (png / jpg / webp) and Plotline's own .json stay with the Studio's loadImage / importJson.
 * Several files dropped together, a folder or a .zip: bundle.ts picks the one to open, the rest are its pictures / buffers.
 */
import type { ImportFormat, ImportResult } from './types'
import { DWG_CONVERTER, convertDwg } from './dwg'
import type { LayerRoles } from './plan2d'

export type * from './types'
export type { LayerRoles, Role as LayerRole } from './plan2d'
export { expandZips, mainFile, siblingsOf, type DropFile } from './bundle'
export { filesOfDrop } from './drop'

export const IMPORT_EXTENSIONS: Record<string, ImportFormat> = {
  ifc: 'ifc',
  ifczip: 'ifc',
  dxf: 'dxf',
  pdf: 'pdf',
  svg: 'svg',
  glb: 'mesh',
  gltf: 'mesh',
  obj: 'mesh',
  fbx: 'mesh',
  '3dm': 'mesh',
  dae: 'mesh',
  stl: 'mesh',
  '3ds': 'mesh',
  kmz: 'mesh',
  wrl: 'mesh',
  ply: 'mesh',
}

/** the `accept` list for the file input, beside the pictures and .json (and a .zip of any of them; a .dwg with a converter) */
export const IMPORT_ACCEPT = [...Object.keys(IMPORT_EXTENSIONS), 'zip', ...(DWG_CONVERTER ? ['dwg'] : [])].map((e) => `.${e}`).join(',')

/**
 * The locked files Plotline cannot read, and the one-click export that gives the same thing (Docs/FORMATS.md §3). DWG: the
 * only free reader is GPL (cannot ship), Autodesk's converter is a desktop program — "Save as DXF" loses nothing a plan needs.
 */
export const LOCKED_FORMATS: Record<string, string> = {
  dwg: "AutoCAD's own .dwg cannot be read here: save it as DXF and drop the .dxf — nothing a plan needs is lost. AutoCAD: type SAVEAS, pick \"AutoCAD DXF\" under Files of type. DraftSight: File → Save As → DXF. No CAD program: LibreCAD (free) opens the .dwg, then File → Save As → DXF. An IFC export works too.",
  rvt: 'Revit keeps .rvt locked. In Revit: File → Export → IFC, then drop the .ifc (every storey, wall, room and the outside shape come with it).',
  rfa: 'A Revit family (.rfa) is not a building. Export the project as IFC and drop the .ifc.',
  pln: 'ArchiCAD keeps .pln locked. In ArchiCAD: File → Save as → IFC, then drop the .ifc.',
  skp: 'SketchUp keeps .skp locked. In SketchUp: File → Export → 3D Model as glTF / OBJ / DAE (the outside shape), or IFC in SketchUp Pro (rooms too), then drop that file.',
  max: 'Export the model as glTF / OBJ / FBX from 3ds Max and drop that file.',
  blend: 'In Blender: File → Export → glTF 2.0 (.glb), or IFC with the free Bonsai add-on, then drop that file.',
  dwf: 'A .dwf / .dwfx is a print, not a drawing: ask for the DXF or IFC instead.',
  dwfx: 'A .dwf / .dwfx is a print, not a drawing: ask for the DXF or IFC instead.',
}

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? ''

/** Plain words for a locked file the Studio should refuse, or null when the file is not one of them (a .dwg is not, with a converter). */
export const lockedFormatOf = (name: string): string | null => (extOf(name) === 'dwg' && DWG_CONVERTER ? null : (LOCKED_FORMATS[extOf(name)] ?? null))

export const importFormatOf = (name: string): ImportFormat | null => (extOf(name) === 'dwg' && DWG_CONVERTER ? 'dxf' : (IMPORT_EXTENSIONS[extOf(name)] ?? null))

/** How far a read is, for the Studio's progress line: what it is doing in plain words, and 0..1 (null: not known). */
export type ReadProgress = (stage: string, fraction: number | null) => void

export interface ReadOptions {
  progress?: ReadProgress
  /** Cancel: an IFC or DXF read in its worker stops at once */
  signal?: AbortSignal
  /** the other files dropped with it (bundle.ts siblingsOf): a model's buffers, pictures, .mtl */
  siblings?: Map<string, Blob>
  /** the person's corrections of what a DXF / SVG layer holds */
  layerRoles?: LayerRoles
  /** a DXF read in the unit the person picked (metres per file unit), not the file's own or the guessed one */
  unitScale?: number
  /** an IFC's material names as the person mapped them (the Studio's Materials list): plain name → option id */
  materials?: Record<string, string>
}

/** the biggest DXF read (the size Windows shows): a bigger one is refused at once, saying both sizes (from Maheer's Plotline 2.0) */
export const MAX_DXF_BYTES = 15 * 2 ** 20

const mb = (bytes: number) => (bytes / 2 ** 20).toFixed(1)

/**
 * An IFC or a DXF is read in a Web Worker (read.worker.ts) so a big file does not freeze the page, with its progress;
 * Node (the tests) and a browser without module workers read it here.
 */
const workers = typeof Worker !== 'undefined' && typeof window !== 'undefined'
function inWorker(bytes: ArrayBuffer, name: string, { progress, signal, layerRoles, unitScale, materials }: ReadOptions): Promise<ImportResult> {
  return new Promise((ok, no) => {
    const w = new Worker(new URL('./read.worker.ts', import.meta.url), { type: 'module' })
    const end = (fn: () => void) => (w.terminate(), signal?.removeEventListener('abort', abort), fn())
    const abort = () => end(() => no(new DOMException('Cancelled', 'AbortError')))
    signal?.addEventListener('abort', abort)
    w.onmessage = (e: MessageEvent<{ stage?: string; fraction?: number; result?: ImportResult; error?: string }>) => {
      const d = e.data
      if (d.stage !== undefined) progress?.(d.stage, d.fraction ?? null)
      else if (d.result) end(() => ok(d.result!))
      else end(() => no(new Error(d.error ?? 'the reader stopped')))
    }
    w.onerror = (e) => (e.preventDefault(), end(() => no(new Error(e.message || 'the reader stopped (out of memory?)'))))
    w.postMessage({ bytes, name, layerRoles, unitScale, materials }, [bytes])
  })
}

/** Reads the file; the format modules load lazily (web-ifc, rhino3dm and pdf.js are big) so the Studio bundle stays as it is. */
export async function importFile(file: File, opts: ReadOptions = {}): Promise<ImportResult> {
  const format = importFormatOf(file.name)
  if (!format) throw new Error(`Plotline cannot read .${file.name.split('.').pop()} files`)
  if (format === 'dxf' && file.size > MAX_DXF_BYTES) throw new Error(`it is ${mb(file.size)} MB, and Plotline reads a DXF of up to ${mb(MAX_DXF_BYTES)} MB — save only the floor plan from your CAD program (one floor per file) and drop that`)
  const bytes = await file.arrayBuffer()
  switch (format) {
    case 'ifc':
      if (workers) return inWorker(bytes, file.name, opts)
      return (await import('./ifc')).importIfc(bytes, file.name, opts.progress, opts.materials)
    case 'dxf': {
      const read = (b: ArrayBuffer, name: string) => (workers ? inWorker(b, name, opts) : import('./dxf').then((m) => m.importDxf(new TextDecoder().decode(b), name, opts)))
      if (extOf(file.name) !== 'dwg') return read(bytes, file.name)
      opts.progress?.('converting the DWG to DXF', null)
      const dxf = await convertDwg(bytes, file.name, DWG_CONVERTER!, opts.signal)
      const r = await read(new TextEncoder().encode(dxf).buffer as ArrayBuffer, file.name.replace(/\.dwg$/i, '.dxf'))
      return { ...r, notes: ['Converted from DWG to DXF by the converter set up for this site (Docs/SETUP_FORMATS.md).', ...r.notes] }
    }
    case 'pdf':
      return (await import('./pdf')).importPdf(bytes, file.name)
    case 'svg':
      return (await import('./svg')).importSvg(new TextDecoder().decode(bytes), file.name, opts.layerRoles)
    case 'mesh':
      return (await import('./mesh')).importMesh(bytes, file.name, opts.siblings)
  }
}
