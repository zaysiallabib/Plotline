# Plotline — the architect's files (session 29, 2026-11-19)

The founder's ask: "architects design the outsides of buildings in different ways to create their identity and our
current program is not good for that. I need the closest thing to reality, absolutely not compromisable. Find formats,
multiple, test them, change the code so it applies to every building Plotline works on."

Until this session Plotline read only PICTURES of plans (PNG / JPG / WEBP, or a brochure PDF page). **Auto-trace** guesses
the walls from the picture and reads the printed names. That is the right tool when a picture is all the developer has.

It is the wrong tool once the architect's own file exists. That file already holds the exact walls, doors, windows and
floors. If it is a 3D file, it also holds the exact outside of the building.

This page says which files exist, what each one gives us, which ones Plotline now reads, and what to ask an architect for.
The measured results are at the end.

## 1. The short answer

| Ask the architect for | Plotline gets | Reads it? |
|---|---|---|
| **IFC** (`.ifc`, `.ifczip`) — the open file that building-design programs (called BIM programs) swap with each other. Revit, ArchiCAD, SketchUp Pro, Allplan, Vectorworks, Tekla and Blender (Bonsai) can all save it | every floor's walls, doors, windows, columns, named rooms, floor heights, true north, AND the exact 3D of the whole building: facade, balconies, fins, roof | **yes** — the main one |
| **DXF** (`.dxf`) — AutoCAD's open version of a drawing ("Save as → DXF", one click) | the exact plan lines, sorted into named layers: walls, doors, windows, columns, room names, printed sizes. One floor per file. No outside shape | **yes** |
| **A 3D model** (`.glb` / `.gltf`, `.obj`, `.fbx`, `.dae`, `.stl`, Rhino `.3dm`) — what the render artist already has from SketchUp, Rhino, Blender or 3ds Max | the exact outside shape only, no rooms. It wraps round the traced or imported flats | **yes** |
| **A drawing PDF** (made by the drawing program itself, straight out of AutoCAD / Revit — not a scan, not a brochure) | the same lines as a DXF, read from the PDF's own drawing instructions; the scale comes from the printed dimensions | **yes** (when the PDF is a real drawing) |
| **DWG** (`.dwg`) — AutoCAD's own locked file | the same as DXF | **no** — see §2. Ask for "Save as DXF" |
| **Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`** — each program's own locked file | — | **no** — ask for the IFC export (every one of them has it built in) |
| A picture (PNG / JPG / WEBP, brochure PDF page) | Auto-trace's best guess, with Check-these rows | yes, as before |

Rule when a file has both walls and an outside shape (founder, 2026-11-19): "**follow the measurements, no need to
complicate things**". The file's walls become the Studio drawing, and you can change them like any traced plan. The outside
shape is only what is seen from outside and through the windows.

## 2. What each format is, and what we found

**IFC (Industry Foundation Classes, an international standard, ISO 16739).**
- It is a plain-text file that every building-design program can save.
- Versions in use: IFC2x3 (2007, still the most common), IFC4 (2013) and IFC4.3 (2024).
- It names things: walls, doors, windows, rooms (with their names), floors (with their heights), columns, slabs and glass curtain walls. It gives each one its real shape. (In the file they are called `IfcWall`, `IfcDoor`, `IfcWindow`, `IfcSpace`, `IfcBuildingStorey`, `IfcColumn`, `IfcSlab`, `IfcCurtainWall`.)
- Plotline reads it inside the browser with **web-ifc** (free, open source, MPL-2.0 licence; the same reader That Open Company's viewers use).
- What comes out: one Studio drawing per floor, all lined up on one frame. They are stacked into a whole Project in one drop (basements, ground, floors, rooftop). You also get the exact outside shape as one 3D piece.
- Tested on buildingSMART's test files (three versions of the format) and twenty public buildings (ifc-bench: houses, hotels, offices, a clinic, a city block). Measured results in §5.

**DXF (Drawing Exchange Format).**
- AutoCAD's open version of DWG; any drawing program can write it.
- A flat plan in DXF is made of lines, polylines, arcs, repeated symbols (a door symbol is one, with its swing arc), texts and dimensions. Each sits on a named layer (`A-WALL`, `A-DOOR`, `A-GLAZ`, `TEXT`…).
- Plotline reads it with **dxf-parser** (free, MIT licence).
  - Walls come from pairs of parallel lines on the wall layers (the gap is the thickness, exact).
  - Doors come from their swing arcs.
  - Windows come from the glass lines in a wall gap.
  - Columns come from the small closed shapes.
  - Room names and printed sizes come from the texts.
- Layer names are a habit, not a rule. Plotline shows what it took each layer as, so staff can see a wrong guess.
- Units come from the file's header. When it has none, they come from the size of the drawing (a flat is 5–150 m wide, not 5 000–150 000).

**DWG.**
- AutoCAD's own locked file, the one most Dhaka architects actually send.
- Its format is not published. The only free reader is **LibreDWG**, whose licence (GPL-3.0) would force all of Plotline's own code to be free and open too, so it cannot go in the product. Autodesk's free **ODA File Converter** is a desktop program, not something a web page can run.
- The one-click answer is "Save as → DXF" in AutoCAD (or any free viewer). It loses nothing a plan needs.
- The GPL reader was tried only as an experiment on public DWG files, to see what a converter would give (§5). It is not in the program.

**3D models (glTF / GLB, OBJ, FBX, Collada DAE, STL, Rhino 3DM).**
- They hold the shape only: small flat faces (triangles) with colours and pictures on them. No rooms, no walls as separate things.
- This is what a render artist's SketchUp / Rhino / Blender / 3ds Max file saves. It is the cheapest way to get the real facade, because the artist already made it for the brochure.
- The 3D library Plotline uses (Three.js) opens every one of these out of the box. Rhino's `.3dm` needs one small extra reader, **rhino3dm** (free, MIT licence, from McNeel).
- Plotline keeps the model in the browser (the same place the plan pictures live) as a GLB (one packed 3D file). It draws the model round the traced flats in the Building view and through the windows while walking.
- Staff get four numbers to line it up with the plan: offset (two numbers), turn, floor height.

**Vector PDF.**
- A PDF straight out of a drawing program carries the drawing as lines and the names as text, so it can be read exactly like a DXF. **pdf.js** (free, Apache-2.0 licence, Mozilla's PDF reader) gives us the lines.
- A scanned PDF, or a brochure page, has no lines inside (all 45 PDFs in `Demo drawings/` are brochures made of photos). Plotline says so, and the picture route is used instead.
- A PDF has no scale. Plotline reads the printed dimensions against their line lengths; if it cannot, it asks you to set the scale with S.

**What we do not read, and why.**
- Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, Allplan: locked formats with no free reader. Each program saves IFC in one click.
- CityGML / GeoJSON: these describe a whole city, not the inside of a building.
- `.3ds`, `.max`, `.blend`: ask for a glTF / OBJ / FBX export instead.

## 3. What to say to a developer's architect

1. "Send the **IFC** of the building" — if they work in Revit, ArchiCAD, SketchUp Pro or Allplan this is one export.
   It gives Plotline the whole building in one drop.
2. If they only have AutoCAD: "**Save the floor plans as DXF**, one file per floor type" — and, from whoever made the
   renders, "the **3D model** of the outside as glTF / OBJ / FBX / 3DM".
3. A drawing PDF is fine if it came out of the drawing program (not a scan).
4. A picture still works — it is just slower and needs the Check-these rows.

## 4. Where it lives in the code (for the developers who work on Plotline)

`src/import/` (pure, like `src/trace/`): `index.ts` routes a dropped file by its extension; `ifc.ts`, `dxf.ts`,
`pdf.ts`, `mesh.ts` each turn their file into the SAME result (`types.ts`): one Unit draft per storey in one shared plan
frame + the exact outside shape as a GLB. `src/studio/shells.ts` keeps the GLB in the browser; `Unit.shell` (core
types) says where it stands; `src/three/` draws it. Nothing downstream knows which file it was.

## 5. Measured (filled in by the lanes' eval tables at the end of the session)

See HANDOFF "SESSION 29" for the per-file tables. For each sample they list the format version, floors, walls, openings,
columns, labels, closed rooms, validation errors, outside-shape triangles and read time. For DWG they list which versions
the GPL experiment converted.
