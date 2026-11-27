/**
 * Importing an architect's own file (session 29, founder 2026-11-19: "find different file formats to get us the absolute
 * optimum result … the closest thing to reality"). Every format comes out as the SAME thing, so nothing downstream knows
 * which file it was:
 *
 *  - one Unit draft per storey, in ONE shared plan frame (the building's: a storey's walls stand over the storey below's),
 *    lengths in metres, rooms named from the file's spaces / texts, openings on their walls, columns as pillars, floor
 *    levels on the labels — editable in the Studio like any traced plan ("nothing only Claude can do");
 *  - the building's exact outside shape (the facade, balconies, fins, the roof) as it came, as a GLB in the SAME frame,
 *    so the Building view and the walk draw the architect's building instead of boxes.
 *
 * FRAME. Plan space is y-DOWN (core/types.ts): x → right, y → down, like the sheet. 3D maps plan (x, y) → world (X, Z),
 * Y up. A CAD / IFC file is y-UP in plan (x east, y north, z up): plan.x = file.x, plan.y = −file.y, and the GLB is built
 * in world axes: X = file.x, Y = file.z (up), Z = −file.y. The lowest storey's floor is Y = 0 (plan datum). True north
 * (IfcGeometricRepresentationContext.TrueNorth, DXF $NORTHDIRECTION, else +y of the file) goes to Unit.northDeg.
 *
 * "If there is a wall and an outside view then follow the measurements, no need to complicate things" (founder): the
 * file's walls are the draft; the shell is only what is seen from outside.
 */
import type { Configuration, Pt, Unit } from '../core'
import type { Roof } from '../data/building/roof'
import type { Role } from './plan2d'

export type ImportFormat = 'ifc' | 'dxf' | 'pdf' | 'svg' | 'mesh'

/** One storey of the file as a Studio draft. `elevationM`: its floor above the lowest storey's (plan datum). */
export interface ImportedStorey {
  name: string
  elevationM: number
  unit: Unit
}

/** The exact outside shape, in world axes (see FRAME): a binary glTF the Studio stores and the viewer loads as it is. */
export interface ImportedShell {
  glb: ArrayBuffer
  name: string
  /** world-axis box of the shell, metres */
  bounds: { min: [number, number, number]; max: [number, number, number] }
  /** triangles, for the notes and the lite tier */
  triangles: number
  /** its windows' glass is solid in the file (no see-through colour on any window): the 3D draws its own glass there (core Shell.glass) */
  glass?: 'opaque'
}

export interface ImportResult {
  format: ImportFormat
  /** lowest first; a 2D file (DXF, PDF) gives one storey at elevation 0 */
  storeys: ImportedStorey[]
  shell?: ImportedShell
  /** plain words for the Studio: what was read, what the file lacked, what was skipped and why */
  notes: string[]
  /** the file's own scale to metres (1 = metres, 0.001 = millimetres, 0.3048 = feet): shown in the notes */
  unitScale: number
  /** the plan frame's origin in the file's own x / y, so a second file of the same building lands on the first */
  origin: Pt
  /** a DXF's / SVG's layers, most used first: what each was taken as (`yours`: the person set it), for the Studio's layer list */
  layers?: { name: string; role: Role; count: number; yours: boolean }[]
  /** a DXF's / SVG's words, biggest first (no dimensions): what kind of drawing a file of a set is, and of which floor (sheets.ts fileView) */
  texts?: { text: string; height: number }[]
  /** a DXF's / SVG's lines as one SVG path in the plan frame (plan2d previewPath): the set's list draws its picture from it */
  preview?: string
  /**
   * An IFC's outside as its materials name it (session 31 ifcmap, import/materials.ts): the building's outside record
   * (furnish/finishes.ts outsideOf — the building's own finish and frames, an outer wall or a window that differs, keyed by the
   * storeys' own unit ids), saved for the project the Studio makes of it (data/building/apartments.ts outsideRecord).
   */
  outside?: Configuration
  /** an IFC's roof as its IfcRoof and its slopes say (kind, pitch, ridge, covering): the project's roof setting */
  roof?: Roof
  /** every outer material name read, what it became (an option id; null: not known, plaster), on how many elements; `yours`: the person's word */
  materials?: { name: string; finish: string | null; count: number; yours: boolean }[]
}
