# Plotline — the architect's files (session 29, 2026-11-19; every format in and out: session 31, 2026-11-20)

The founder's ask: "architects design the outsides of buildings in different ways to create their identity and our
current program is not good for that. I need the closest thing to reality, absolutely not compromisable. Find formats,
multiple, test them, change the code so it applies to every building Plotline works on."

Until this session Plotline read only PICTURES of plans (PNG / JPG / WEBP, or a brochure PDF page). **Auto-trace** guesses
the walls from the picture and reads the printed names. That is the right tool when a picture is all the developer has.

It is the wrong tool once the architect's own file exists. That file already holds the exact walls, doors, windows and
floors. If it is a 3D file, it also holds the exact outside of the building.

This page says which files exist, what each one gives us, which ones Plotline now reads, and what to ask an architect for.
The measured results are at the end.

## 1. Every file Plotline takes and gives (rewritten 2026-11-20, session 31)

**Bring in** — drop the file on the Studio, or ⋯ → **Import…** (several files can be picked together). A **folder**, a
**.zip** or several files dropped at once are opened as one: the best file in it is read (an IFC first, then a 3D model,
then a drawing; an architectural IFC before a structural or services one) and the others are its pictures and data.

| File | Made by | What Plotline gets | How it reads it | Tested on (2026-11-20, Firefox unless said) |
|---|---|---|---|---|
| **IFC** `.ifc`, `.ifczip` | Revit, ArchiCAD, Vectorworks, Allplan, Tekla, SketchUp Pro, Blender (Bonsai), FreeCAD | Every storey's walls, doors, windows, columns, named rooms and floor heights, true north **and** the exact outside of the building — a whole project in one drop | web-ifc (MPL-2.0), in the background with a progress box and **Cancel**: the page keeps working | buildingSMART's test files (IFC2x3, IFC4, IFC4.3) and 20 public buildings (node, session 29). Firefox: a 1.7 MB house (read in 0.9 s), a 64 MB and a 74 MB building (7 and 10 storeys): the page kept answering the whole time |
| **DXF** `.dxf` | AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD, any CAD program | One floor: walls (line pairs, polylines, hatches, multilines), doors (swings, blocks), windows, columns, room names, printed sizes; units from the file | dxf-parser (MIT) + Plotline's own readers for hatches, multilines and curves | 20 files R12–2018 (node); Firefox: drafted.ai's house plan (75 walls, 34 openings, 20 rooms); Plotline's own export, back exactly |
| **DWG** `.dwg` | AutoCAD's own file | The same as its DXF | **Only when turned on** (Docs/SETUP_FORMATS.md, free: 10 a day): sent to an online converter (CloudConvert), back as a DXF. Not turned on: refused with "in AutoCAD: Save as → DXF" | Firefox with a stand-in converter: a real 2013 DWG → its DXF → the plan; the server part against a stand-in CloudConvert. **Not yet run against the real CloudConvert** (needs the founder's key) |
| **PDF** `.pdf` — a brochure, or a drawing printed from a CAD program | Any | Several pages: **Which page is the floor plan?** with the pages as pictures. A page whose lines make a clean plan opens as the drawing; any other page (a photo, outlined words) becomes the **plan picture** for Auto-trace. The other way is one click | pdf.js (Apache-2.0) | 45 brochures measured page by page (node); Firefox: a 16-page brochure → page 9 as the plan picture; a CAD print (2 pages, scale 1 : 48 found) → picture, lines on request |
| **SVG** `.svg` | Illustrator, Inkscape, LibreCAD, QCAD, floor-plan apps, a CAD program through a PDF | One floor, like a DXF: its groups are its layers | Plotline's own reader (lines, shapes, paths, curves, arcs, symbols, transforms) | Hand-made sheets (node); Firefox: drafted.ai's plan as a CAD-style SVG → 76 walls, 34 openings, 21 rooms (its DXF: 75 / 34 / 22) |
| **3D model** `.glb` `.gltf` `.obj` `.fbx` `.dae` `.stl` `.3dm` `.3ds` `.kmz` `.wrl` `.ply` | A render artist: SketchUp, Rhino, Blender, 3ds Max, ArchiCAD, Revit | The building's exact **outside shape** (no rooms), round the traced flats | three.js's loaders; rhino3dm (MIT) for `.3dm`; Draco and meshopt decoders (shipped with three.js) for compressed models | Firefox: one sample of each kind; a `.gltf` with its `.bin` and texture as three files and as a zip; an `.obj` with its `.mtl` and picture; a compressed (Draco) model |
| **Picture** `.png` `.jpg` `.webp` `.tif` | A brochure, a scanner, a photo | The plan picture to trace (Auto-trace) | The browser; TIFF with UTIF (MIT, shipped with three.js) | Firefox: a TIFF scan. **HEIC** (iPhone photo): only where the browser opens it (Safari); elsewhere a message says how to get a JPEG |
| **Plotline drawing** `.json` | Plotline's own Export | The drawing, exactly | — | — |
| **Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, 3ds Max `.max`, Blender `.blend`, `.dwf`** | Each program's locked file | — | Refused, with the one-click export to ask for (IFC, glTF, OBJ, FBX) | — |

**Give back** — from the Studio's ⋯ menu.

| What | File | What is in it | Tested on |
|---|---|---|---|
| **Export** | `.json` | The drawing, exactly (Plotline's own file) | — |
| **Export as DXF** | `.dxf`, AutoCAD R12, metres | Layers WALLS (closed outlines, corners filled), DOORS (each door a block: leaf and swing), WINDOWS, COLUMNS, TEXT (names, printed sizes), ZONES. Opens in every CAD program. Back in Plotline untouched: exactly; changed in CAD: read from its lines | All 20 built-in flats and levels written and read back exactly (node); Firefox: Type A exported (91 KB) and dropped back; its lines alone: 103 walls for 90, 30 of 33 openings, 21 of 27 rooms |
| **Export 3D model** (also the 3D view: Edit ▾ → Download 3D model, staff) | `.glb` | The furnished flat: walls, floors, ceilings, doors, windows, furniture with pictures — not the street or the sky | Firefox: Type A, 63 MB, 1.0 million triangles, 133 pictures, made in 15 s; opened again by Plotline's own 3D-model reader |
| **Print plan…** | paper, or a PDF ("Save as PDF" in the print window) | The plan at 1 : 50, 1 : 100 or 1 : 200 on A4–A1: walls, door swings, windows, names, sizes, a title block, a scale bar, a north arrow | Firefox: Type A on A3 at 1 : 100, as the print page renders it |
| **Change list → Export CSV** | `.csv` | Every buyer note and finish choice, for a spreadsheet | (existing, session 18) |

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
- AutoCAD's own locked file, the one most architects actually send.
- Its format is not published. The only free reader is **LibreDWG**, whose licence (GPL-3.0) would force all of Plotline's own code to be free and open too, so it cannot go in the product. Autodesk's free **ODA File Converter** is a desktop program, not something a web page can run.
- Every free DWG reader is LibreDWG under another name: `@mlightcad/libredwg-web`, the "dwg2dxf" web builds — all GPL. (Checked 2026-11-20.)
- So a DWG goes to a converter **outside the page** (session 31): a small server function on Plotline's own site sends it to **CloudConvert** (free: 10 drawings a day, no card) and gets the DXF back; the key stays on the server. It is off until the founder sets it up (Docs/SETUP_FORMATS.md, 10 minutes). Off, a DWG is refused with the one-click answer: "Save as → DXF" in AutoCAD (or any free viewer) — it loses nothing a plan needs.
- Considered and not used: Aspose.CAD Cloud (150 free calls a month, but a company sign-up), Autodesk's online services (they do not give DXF back), ODA's converter (a desktop program, members only).
- The GPL reader was tried only as an experiment on public DWG files, to see what a converter would give (§5). It is not in the program.

**3D models (glTF / GLB, OBJ, FBX, Collada DAE, STL, Rhino 3DM; since session 31 also 3DS, KMZ, VRML WRL, PLY).**
- They hold the shape only: small flat faces (triangles) with colours and pictures on them. No rooms, no walls as separate things.
- This is what a render artist's SketchUp / Rhino / Blender / 3ds Max file saves. It is the cheapest way to get the real facade, because the artist already made it for the brochure.
- The 3D library Plotline uses (Three.js) opens every one of these out of the box. Rhino's `.3dm` needs one small extra reader, **rhino3dm** (free, MIT licence, from McNeel).
- Plotline keeps the model in the browser (the same place the plan pictures live) as a GLB (one packed 3D file). It draws the model round the traced flats in the Building view and through the windows while walking.
- Staff get four numbers to line it up with the plan: offset (two numbers), turn, floor height.
- A model that keeps its pictures (or, for a `.gltf`, its 3D data in a `.bin`) in other files is dropped as its whole folder or a `.zip`; dropped alone, the notes name what was missing. Compressed models (Draco, meshopt) are unpacked.

**PDF.**
- A PDF straight out of a drawing program carries the drawing as lines and the names as text, so it can be read exactly like a DXF. **pdf.js** (free, Apache-2.0 licence, Mozilla's PDF reader) gives us the lines.
- A brochure is mostly pictures: of the 45 brochures in `Demo drawings/`, many pages are one photo; others are drawn in lines but with the words turned into outlines (no text to read). Since session 31 Plotline asks which page is the plan, then decides: a page whose lines make a clean plan (two or more closed rooms, at most 20 walls a room — measured: real plans have 3–9) opens as the drawing; any other page is drawn as a picture (4000 px) and becomes the plan picture for Auto-trace. The message offers the other way in one click.
- A PDF has no scale. Plotline reads the printed dimensions against their line lengths; else the printed room sizes; else it asks you to set the scale with S.

**SVG** (session 31).
- The web's drawing format; Illustrator, Inkscape, LibreCAD and QCAD save it, and a CAD drawing often reaches a marketing team as SVG through a PDF. It holds lines, shapes, curves and texts, grouped; the groups usually carry the CAD layer names.
- Plotline reads it with its own small reader (no extra library) and the same engine as DXF: a group called "A-WALL" or "Walls" holds walls, "Doors" doors, and so on. Like a PDF it has no scale of its own: printed dimensions, else room sizes, else the drawing's own units guessed from its size.
- No public SVG floor plan could be fetched for the test (the ones online are diagrams, or under non-commercial licences): the Firefox test used a real DXF plan written out the way CAD programs write SVG. Its read matched the DXF's.

**What we do not read, and why.**
- Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, Allplan: locked formats with no free reader. Each program saves IFC in one click.
- CityGML / GeoJSON: these describe a whole city, not the inside of a building.
- `.max`, `.blend`: ask for a glTF / OBJ / FBX export instead (`.3ds` is read since session 31).
- HEIC (an iPhone photo): only where the browser opens it (Safari); elsewhere a message says how to get a JPEG.

## 3. What to say to a developer's architect

1. "Send the **IFC** of the building" — if they work in Revit, ArchiCAD, SketchUp Pro or Allplan this is one export.
   It gives Plotline the whole building in one drop.
2. If they only have AutoCAD: "**Save the floor plans as DXF**, one file per floor type" (or send the DWG, once DWG is
   turned on — Docs/SETUP_FORMATS.md) — and, from whoever made the renders, "the **3D model** of the outside as glTF /
   OBJ / FBX / 3DM", the whole folder or a zip of it.
3. A drawing PDF is fine if it came out of the drawing program (not a scan); a brochure PDF works too — Plotline asks
   which page is the plan.
4. A picture still works — it is just slower and needs the Check-these rows.
5. What you can send them back: the drawing as **DXF** (their CAD program opens it), the furnished flat as a **3D model**
   (`.glb`) for their render artist, the plan **printed** or as a **PDF** at 1 : 50 / 1 : 100 / 1 : 200.

## 4. Where it lives in the code (for the developers who work on Plotline)

`src/import/` (pure, like `src/trace/`): `index.ts` routes a dropped file by its extension (`bundle.ts` / `drop.ts`: a folder, zip
or several files); `ifc.ts` (in `ifc.worker.ts`), `dxf.ts` (+ `dwg.ts` through `api/dwg.js`), `pdf.ts`, `svg.ts`, `mesh.ts` each turn their file into the SAME result (`types.ts`): one Unit draft per storey in one shared plan
frame + the exact outside shape as a GLB. `src/studio/shells.ts` keeps the GLB in the browser; `Unit.shell` (core
types) says where it stands; `src/three/` draws it. Nothing downstream knows which file it was. `picture.ts` turns a TIFF / HEIC
into a plan picture. Going out: `sheet.ts` (the plan as a sheet's shapes, and the printable SVG), `dxfWrite.ts` (DXF),
`PlotlineScene.exportGlb` (the furnished flat as a GLB).

## 5. Measured (filled in by the lanes' eval tables at the end of the session)

See HANDOFF "SESSION 29" for the per-file tables. For each sample they list the format version, floors, walls, openings,
columns, labels, closed rooms, validation errors, outside-shape triangles and read time. For DWG they list which versions
the GPL experiment converted.

Session 31 (Firefox, the founder's path): IFC hitos 64 MB → 7 floors and molio 74 MB → 10 storeys read in the background,
the page answering 323 of 327 and 323 of 325 timer ticks; models: gltf + bin + texture (3 files and a zip), glb +
texture, obj + mtl + texture, fbx + texture, 3ds, kmz, wrl (a 5.8 × 16.9 m house, its 20 km sky left out), ply, a Draco
glb — all read; SVG (drafted.ai's plan as CAD-style SVG) 76 walls / 34 openings / 21 rooms vs its DXF's 75 / 34 / 22;
PDF: a 16-page brochure's floor plan page as the plan picture, a CAD print read; TIFF read, HEIC refused in plain words in
Firefox; DWG through a stand-in converter → the plan (its DXF's walls). DXF multilines: the AutoCAD multiline sample 0 → 5
walls. Exports: Type A as DXF (back exactly; lines only 103 / 30 / 21 for 90 / 33 / 27), as GLB (63 MB, 1.0 M triangles,
re-opened), printed on A3 at 1 : 100. The lines-only DXF read of all 20 built-in drawings is in `src/import/dxfWrite.test.ts`'s
table (flats close, levels lose their zone lines).
