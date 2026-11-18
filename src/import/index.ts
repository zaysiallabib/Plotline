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
