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

export const importFormatOf = (name: string): ImportFormat | null => IMPORT_EXTENSIONS[name.toLowerCase().split('.').pop() ?? ''] ?? null

/** Reads the file; the format modules load lazily (web-ifc, rhino3dm and pdf.js are big) so the Studio bundle stays as it is. */
export async function importFile(file: File): Promise<ImportResult> {
  const format = importFormatOf(file.name)
  if (!format) throw new Error(`Plotline cannot read .${file.name.split('.').pop()} files`)
  const bytes = await file.arrayBuffer()
  switch (format) {
    case 'ifc':
      return (await import('./ifc')).importIfc(bytes, file.name)
    case 'dxf':
      return (await import('./dxf')).importDxf(new TextDecoder().decode(bytes), file.name)
    case 'pdf':
      return (await import('./pdf')).importPdf(bytes, file.name)
    case 'mesh':
      return (await import('./mesh')).importMesh(bytes, file.name)
  }
}
