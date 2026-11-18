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
import type { Pt, Unit } from '../core'

export type ImportFormat = 'ifc' | 'dxf' | 'pdf' | 'mesh'

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
}
