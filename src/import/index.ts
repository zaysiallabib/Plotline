/**
 * One door for every architect file the Studio takes (see types.ts for what comes out and the frame). By extension:
 *  .ifc / .ifczip                       → ifc.ts  (walls, openings, spaces, storeys, columns + the exact shell)
 *  .dxf                                 → dxf.ts  (2D lines on layers → walls, openings, texts)
 *  .pdf (vector drawing)                → pdf.ts  (path lines + text → the DXF engine)
 *  .glb .gltf .obj .fbx .3dm .dae .stl  → mesh.ts (the exact shell only, no rooms)
 * The picture formats (png / jpg / webp) and Plotline's own .json stay with the Studio's loadImage / importJson.
 */
import type { ImportFormat, ImportResult } from './types'

export type * from './types'

export const IMPORT_EXTENSIONS: Record<string, ImportFormat> = {
  ifc: 'ifc',
  ifczip: 'ifc',
  dxf: 'dxf',
  pdf: 'pdf',
  glb: 'mesh',
  gltf: 'mesh',
  obj: 'mesh',
  fbx: 'mesh',
  '3dm': 'mesh',
  dae: 'mesh',
  stl: 'mesh',
}

/** the `accept` list for the file input, beside the pictures and .json */
export const IMPORT_ACCEPT = Object.keys(IMPORT_EXTENSIONS)
  .map((e) => `.${e}`)
  .join(',')

/**
 * The locked files Plotline cannot read, and the one-click export that gives the same thing (Docs/FORMATS.md §3). DWG: the
 * only free reader is GPL (cannot ship), Autodesk's converter is a desktop program — "Save as DXF" loses nothing a plan needs.
 */
export const LOCKED_FORMATS: Record<string, string> = {
  dwg: "AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Save as → DXF, then drop the .dxf — nothing a plan needs is lost. An IFC export works too.",
  rvt: 'Revit keeps .rvt locked. In Revit: File → Export → IFC, then drop the .ifc (every storey, wall, room and the outside shape come with it).',
  rfa: 'A Revit family (.rfa) is not a building. Export the project as IFC and drop the .ifc.',
  pln: 'ArchiCAD keeps .pln locked. In ArchiCAD: File → Save as → IFC, then drop the .ifc.',
  skp: 'SketchUp keeps .skp locked. In SketchUp: File → Export → 3D Model as glTF / OBJ / DAE (the outside shape), or IFC in SketchUp Pro (rooms too), then drop that file.',
  '3ds': 'Export the model as glTF / OBJ / FBX from 3ds Max and drop that file.',
  max: 'Export the model as glTF / OBJ / FBX from 3ds Max and drop that file.',
  blend: 'In Blender: File → Export → glTF 2.0 (.glb), or IFC with the free Bonsai add-on, then drop that file.',
  dwf: 'A .dwf / .dwfx is a print, not a drawing: ask for the DXF or IFC instead.',
  dwfx: 'A .dwf / .dwfx is a print, not a drawing: ask for the DXF or IFC instead.',
}

/** Plain words for a locked file the Studio should refuse, or null when the file is not one of them. */
export const lockedFormatOf = (name: string): string | null => LOCKED_FORMATS[name.toLowerCase().split('.').pop() ?? ''] ?? null

export const importFormatOf = (name: string): ImportFormat | null => IMPORT_EXTENSIONS[name.toLowerCase().split('.').pop() ?? ''] ?? null

/** How far a read is, for the Studio's progress line: what it is doing in plain words, and 0..1 (null: not known). */
export type ReadProgress = (stage: string, fraction: number | null) => void

export interface ReadOptions {
  progress?: ReadProgress
  /** Cancel: an IFC read in its worker stops at once */
  signal?: AbortSignal
}

/**
 * An IFC is read in a Web Worker (ifc.worker.ts) so a big file does not freeze the page, with its progress; Node (the
 * tests) and a browser without module workers read it here.
 */
function ifcInWorker(bytes: ArrayBuffer, name: string, { progress, signal }: ReadOptions): Promise<ImportResult> {
  return new Promise((ok, no) => {
    const w = new Worker(new URL('./ifc.worker.ts', import.meta.url), { type: 'module' })
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
    w.postMessage({ bytes, name }, [bytes])
  })
}

/** Reads the file; the format modules load lazily (web-ifc, rhino3dm and pdf.js are big) so the Studio bundle stays as it is. */
export async function importFile(file: File, opts: ReadOptions = {}): Promise<ImportResult> {
  const format = importFormatOf(file.name)
  if (!format) throw new Error(`Plotline cannot read .${file.name.split('.').pop()} files`)
  const bytes = await file.arrayBuffer()
  switch (format) {
    case 'ifc':
      if (typeof Worker !== 'undefined' && typeof window !== 'undefined') return ifcInWorker(bytes, file.name, opts)
      return (await import('./ifc')).importIfc(bytes, file.name, opts.progress)
    case 'dxf':
      return (await import('./dxf')).importDxf(new TextDecoder().decode(bytes), file.name)
    case 'pdf':
      return (await import('./pdf')).importPdf(bytes, file.name)
    case 'mesh':
      return (await import('./mesh')).importMesh(bytes, file.name)
  }
}
