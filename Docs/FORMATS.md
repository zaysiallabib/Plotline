# Plotline — the architect's files (session 29, 2026-11-19)

The founder's ask: "architects design the outsides of buildings in different ways to create their identity and our
current program is not good for that. I need the closest thing to reality, absolutely not compromisable. Find formats,
multiple, test them, change the code so it applies to every building Plotline works on."

Until this session Plotline read only PICTURES of plans (PNG / JPG / WEBP, or a brochure PDF page): Auto-trace guesses
the walls from the pixels and reads the printed names. That is the right tool when a picture is all the developer has.
It is the wrong tool once the architect's own file exists: the file already holds the exact walls, doors, windows,
floors, and — in a 3D file — the exact outside of the building. This page says which files exist, what each gives us,
which ones Plotline now reads, and what to ask an architect for. Plain words; the measured results are at the end.

## 1. The short answer

| Ask the architect for | Plotline gets | Reads it? |
|---|---|---|
| **IFC** (`.ifc`, `.ifczip`) — the open BIM exchange file. Revit, ArchiCAD, SketchUp Pro, Allplan, Vectorworks, Tekla and Blender (Bonsai) all export it | every storey's walls, doors, windows, columns, rooms with names, floor levels, true north, AND the exact 3D of the whole building — facade, balconies, fins, roof | **yes** — the main one |
| **DXF** (`.dxf`) — AutoCAD's open text version of a drawing ("Save as → DXF", one click) | the exact plan lines on their layers: walls, doors, windows, columns, room names, printed sizes. One floor per file. No outside shape | **yes** |
| **A 3D model** (`.glb` / `.gltf`, `.obj`, `.fbx`, `.dae`, `.stl`, Rhino `.3dm`) — what the render artist already has from SketchUp, Rhino, Blender, 3ds Max | the exact outside shape only — no rooms. It wraps round the traced or imported flats | **yes** |
| **A drawing PDF** (vector, straight out of AutoCAD / Revit — not a scan, not a brochure) | the same lines as a DXF, read from the PDF's own drawing commands; the scale from the printed dimensions | **yes** (when the PDF is a real drawing) |
| **DWG** (`.dwg`) — AutoCAD's own locked file | the same as DXF | **no** — see §3. Ask for "Save as DXF" |
| **Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`** — each program's own locked file | — | **no** — ask for the IFC export (built into each) |
| A picture (PNG / JPG / WEBP, brochure PDF page) | Auto-trace's best guess, with Check-these rows | yes, as before |

Rule when a file has both walls and an outside shape (founder, 2026-11-19): "**follow the measurements, no need to
complicate things**" — the file's walls become the Studio draft, editable like any traced plan; the outside shape is only
what is seen from outside and through the windows.

## 2. What each format is, and what we found

**IFC (Industry Foundation Classes, ISO 16739).** A text file (`ISO-10303-21`) every BIM program exports. Versions in
use: IFC2x3 (2007, still the most common export), IFC4 (2013) and IFC4.3 (2024). It names things: `IfcWall`,
`IfcDoor`, `IfcWindow`, `IfcSpace` (a room, with its name), `IfcBuildingStorey` (a floor with its height), `IfcColumn`,
`IfcSlab`, `IfcCurtainWall`, and gives each one real geometry. Plotline reads it in the browser with **web-ifc** (open
source, MPL-2.0, the engine behind That Open Company's viewers). What comes out: one Studio drawing per storey, all in one
frame, stacked into a whole Project in one drop (basements, ground, floors, rooftop), plus the exact outside shape as one
3D piece. Tested on buildingSMART's certification files (three schema versions) and twenty public buildings (ifc-bench:
houses, hotels, offices, a clinic, a city block). Measured results in §5.

**DXF (Drawing Exchange Format).** AutoCAD's open text twin of DWG; any CAD program writes it. A 2D plan DXF is lines,
polylines, arcs, blocks (a door symbol is a block with its swing arc), texts and dimensions, each on a named layer
(`A-WALL`, `A-DOOR`, `A-GLAZ`, `TEXT`…). Plotline reads it with **dxf-parser** (MIT). Walls come from the paired
parallel lines on the wall layers (the gap is the thickness, exact), doors from their swing arcs, windows from the glazing
lines in a wall gap, columns from the small closed shapes, room names and printed sizes from the texts. The layer names
are a convention, not a rule: Plotline shows what it took each layer as, so staff can see a wrong guess. Units come
from the file's header; when it has none, from the size of the drawing (a flat is 5–150 m wide, not 5 000–150 000).

**DWG.** AutoCAD's own binary file, the one most Dhaka architects actually send. Its format is not published; the
only free reader is **LibreDWG** (GPL-3.0: shipping it would force Plotline's own code to be GPL, so it cannot go in the
product) and Autodesk's free **ODA File Converter** is a desktop program, not something a web page can run. The
one-click answer is "Save as → DXF" in AutoCAD (or any free viewer), which loses nothing a plan needs. The GPL reader was
tried only as an experiment on public DWG files to see what a converter would give (§5); it is not in the code.

**3D models (glTF / GLB, OBJ, FBX, Collada DAE, STL, Rhino 3DM).** Shape only: triangles with colours and
textures, no rooms, no walls as things. This is what a render artist's SketchUp / Rhino / Blender / 3ds Max file exports,
so it is the cheapest way to get the real facade: the artist already made it for the brochure. Three.js loads every one
of these out of the box; Rhino's `.3dm` needs **rhino3dm** (MIT, from McNeel). Plotline keeps the model as a GLB in the
browser (the same place the plan pictures live), draws it round the traced flats in the Building view and through the
windows while walking, and gives staff four numbers to line it up with the plan: offset, turn, floor height.

**Vector PDF.** A PDF straight out of a CAD program carries the drawing as lines and the names as text, so it can be
read exactly like a DXF — **pdf.js** (Apache-2.0, Mozilla's reader) gives us the lines. A scanned PDF or a brochure page
(all 45 PDFs in `Demo drawings/` are brochures made of photos) has no lines inside: Plotline says so and the picture path
is used instead. A PDF has no scale; Plotline reads the printed dimensions against their line lengths, else asks for S.

**What we do not read, and why.** Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, Allplan: locked formats with no
free reader; each program exports IFC in one click. CityGML / GeoJSON: city-scale, not a building's inside. `.3ds`,
`.max`, `.blend`: ask for a glTF / OBJ / FBX export instead.

## 3. What to say to a developer's architect

1. "Send the **IFC** of the building" — if they work in Revit, ArchiCAD, SketchUp Pro or Allplan this is one export.
   It gives Plotline the whole building in one drop.
2. If they only have AutoCAD: "**Save the floor plans as DXF**, one file per floor type" — and, from whoever made the
   renders, "the **3D model** of the outside as glTF / OBJ / FBX / 3DM".
3. A drawing PDF is fine if it came out of the CAD program (not a scan).
4. A picture still works — it is just slower and needs the Check-these rows.

## 4. Where it lives in the code

`src/import/` (pure, like `src/trace/`): `index.ts` routes a dropped file by its extension; `ifc.ts`, `dxf.ts`,
`pdf.ts`, `mesh.ts` each turn their file into the SAME result (`types.ts`): one Unit draft per storey in one shared plan
frame + the exact outside shape as a GLB. `src/studio/shells.ts` keeps the GLB in the browser; `Unit.shell` (core
types) says where it stands; `src/three/` draws it. Nothing downstream knows which file it was.

## 5. Measured (filled in by the lanes' eval tables at the end of the session)

See HANDOFF "SESSION 29" for the per-file tables: for each sample, the schema / version, storeys, walls, openings,
columns, labels, closed rooms, validation errors, shell triangles and read time; and for DWG, which versions the GPL
experiment converted.
