# Plotline — the architect's files

Which files Plotline takes in and gives back, what each one gives us, what reads it (and under which licence), and what
to ask an architect for. Written in session 29 (2026-11-19), every format in and out since session 31 (2026-11-20).

The founder's ask: "architects design the outsides of buildings in different ways to create their identity and our
current program is not good for that. I need the closest thing to reality, absolutely not compromisable. Find formats,
multiple, test them, change the code so it applies to every building Plotline works on."

A picture of a plan (PNG, JPG, a brochure page) needs **Auto-trace** to guess the walls and read the printed names — the
right tool when a picture is all the developer has. Once the architect's own file exists it already holds the exact
walls, doors, windows and floors, and a 3D file holds the exact outside of the building.

Rule when a file has both walls and an outside shape (founder, 2026-11-19): "**follow the measurements, no need to
complicate things**". The file's walls become the Studio drawing, changeable like any traced plan; the outside shape is
only what is seen from outside and through the windows.

## 1. Every file Plotline takes and gives

**Bring in** — drop the file on the Studio, or **⋯ → Import…** (several files can be picked together). A **folder**, a
**.zip** or several files dropped at once are opened as one: the best file is read (an IFC first, then a 3D model, then
a drawing; an architectural IFC before a structural or services one) and the others are its pictures and data.

**To try them:** the empty Studio's **Try a sample ▾** opens eight small real buildings' files, at least one of each kind,
in one click (`public/samples/`, each free to pass on, its source in `public/samples/MANIFEST.md`). All 53 real
buildings' files fetched from the internet on 2026-11-22 — 21 IFC, 10 DXF, 10 PDF, 6 SVG, 6 3D models — and how each one
reads in Firefox today, with what fails and why: [SAMPLES.md](SAMPLES.md).

| File | Made by | What Plotline gets | Read with (licence) | Tested on (Firefox unless said) |
|---|---|---|---|---|
| **IFC** `.ifc`, `.ifczip` | Revit, ArchiCAD, Vectorworks, Allplan, Tekla, SketchUp Pro, Blender (Bonsai), FreeCAD | Every storey's walls, doors, windows, columns, named rooms and floor heights, true north **and** the exact outside shape — a whole project in one drop | **web-ifc** 0.0.79 (MPL-2.0), in the background with a progress box and **Cancel**; `.ifczip` unzipped by fflate (MIT, inside three.js) | buildingSMART's test files (IFC2x3, IFC4, IFC4.3) and 20 public buildings (node, session 29); a 1.7 MB house (0.9 s), a 64 MB and a 74 MB building (7 and 10 storeys) with the page answering throughout |
| **DXF** `.dxf` | AutoCAD, BricsCAD, DraftSight, LibreCAD, QCAD, any CAD program | One floor: walls (line pairs, polylines, hatches, multilines), doors (swings, blocks), windows, a door or window drawn as a plain line or a narrow rectangle on its layer, columns, room names in any script (a Bangla name an older file writes as codes reads as শয়ন কক্ষ; Ø ° ± as drawn), printed sizes; units from the file. Read off the page (progress, Cancel); a DXF over 15 MB, of more than 50 000 drawn things, or binary is refused at once, saying what to do | **dxf-parser** 1.1.2 (MIT) + Plotline's own readers for hatches, multilines and curves (ours) | 20 files R12–2018 (node); drafted.ai's house plan (75 walls, 34 openings, 20 rooms); the AutoCAD multiline sample (0 → 5 walls); Plotline's own export, back exactly |
| **DWG** `.dwg` | AutoCAD's own file | The same as its DXF | **Only when turned on** ([SETUP_FORMATS.md](SETUP_FORMATS.md)): **CloudConvert**'s free plan (an online service, 10 a day) turns it into a DXF, then the DXF reader. Off: refused with how to save it as DXF (AutoCAD: type SAVEAS, pick "AutoCAD DXF" under Files of type; DraftSight: File → Save As → DXF; no CAD program: LibreCAD (free) opens the .dwg, then File → Save As → DXF) | A real 2013 DWG through a stand-in converter → the plan; the server part against a stand-in CloudConvert. **Not yet run against the real CloudConvert** (needs the founder's key) |
| **PDF** `.pdf` — a brochure, a print from a CAD program, a whole drawing set (one PDF, or one PDF a sheet) | Any | One page that is one floor plan: opens at once. A set: **What is in this set** reads every page for what it is — plan (and of which floor), elevation (and which side), section (and its mark), site, schedule, interior elevation, detail, title page — by its view titles, then its sheet number, then its shape; splits a page of several drawings; **Build the project** puts each plan on its floors (its lines when they make a plan, else its picture, scaled from the printed scale) and keeps elevations, sections, site and schedules with the project as pictures. A drawing whose lines make a clean plan opens as the drawing; any other (a photo, outlined words) becomes the **plan picture** for Auto-trace; the other way is one click | **pdf.js** (pdfjs-dist 6.5.438, Apache-2.0); the sheet reader is ours (`src/import/sheets.ts`, no AI) | 12 sets, 215 pages, through the real drop in Firefox: [SETS_SCOREBOARD.md](SETS_SCOREBOARD.md); 45 brochures page by page (node) |
| **SVG** `.svg` | Illustrator, Inkscape, LibreCAD, QCAD, floor-plan apps, a CAD program through a PDF | One floor, like a DXF; its groups are its layers | Plotline's own reader (ours): lines, shapes, paths, curves, arcs, symbols, transforms | Hand-made sheets (node); drafted.ai's plan as a CAD-style SVG → 76 walls, 34 openings, 21 rooms (its DXF: 75 / 34 / 22) |
| **3D model** `.glb` `.gltf` `.obj` `.fbx` `.dae` `.stl` `.3dm` `.3ds` `.kmz` `.wrl` `.ply` | A render artist: SketchUp, Rhino, Blender, 3ds Max, ArchiCAD, Revit | The building's exact **outside shape** (no rooms), round the traced flats | **three.js** 0.186 loaders (MIT); **rhino3dm** 8.35 (MIT) for `.3dm`; the **Draco** (Apache-2.0) and **meshopt** (MIT) decoders shipped with three.js for compressed models; chevrotain (Apache-2.0) under the VRML reader; fflate (MIT) for `.kmz` and zips | One sample of each kind; a `.gltf` with its `.bin` and texture as three files and as a zip; an `.obj` with its `.mtl` and picture; a Draco model; a `.wrl` house (its 20 km sky left out) |
| **Picture** `.png` `.jpg` `.webp` `.tif` | A brochure, a scanner, a photo | The plan picture to trace (Auto-trace) | The browser; TIFF with three.js's TIFF reader (UTIF, MIT). **HEIC** (an iPhone photo): only where the browser opens it (Safari); elsewhere a message says how to get a JPEG | A TIFF scan; HEIC refused in plain words |
| **Plotline drawing** `.json` | Plotline's own Export | The drawing, exactly | Ours | — |
| Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, 3ds Max `.max`, Blender `.blend`, `.dwf` | Each program's locked file | — | Refused, with the one-click export to ask for (IFC, glTF, OBJ, FBX) | — |

**Give back** — from the Studio's **⋯** menu.

| What | File | What is in it | Made with (licence) | Tested on |
|---|---|---|---|---|
| **Export** | `.json` | The drawing, exactly (Plotline's own file) | Ours | — |
| **Export as DXF** | `.dxf`, AutoCAD R12, metres | Layers WALLS (closed outlines, corners filled, each wall's height as its thickness), DOORS (each a block: leaf, swing, jambs; a passage a block of its jambs), WINDOWS, COLUMNS, TEXT (names, printed sizes, a raised floor as the text's height), PLOTLINE_ZONES, PLOTLINE_KERBS, PLOTLINE_AXES_<thickness in 0.1 mm> (each wall's centre line, its height as the line's thickness). Opens in every CAD program. Back in Plotline untouched: exactly; saved again by a CAD program: its walls from their centre lines while they agree with the outlines, else from the outlines | Plotline's own writer (ours) | All 20 built-in flats and levels written and read back exactly (node); from their lines alone (as a CAD program saves them) all 20 exactly the same (`dxfWrite.test.ts`); a wall moved in CAD falls back to the outlines (tested) |
| **Export 3D model** (also the 3D view: **Edit ▾ → Download 3D model**, staff) | `.glb` | The furnished flat: walls, floors, ceilings, doors, windows, furniture with pictures (at most 1024 px) — not the street or the sky | three.js's glTF exporter (MIT) | Type A: 54 MB (31 MB shapes, 23 MB pictures; it was 63 MB when first measured and 106 MB before the round-2 fix that stopped pieces going in twice), opened again by Plotline's own 3D-model reader. No mesh compression in the browser's exporter: gltf-transform or gltfpack on a computer makes it smaller |
| **Print plan…** | paper, or a PDF ("Save as PDF" in the print window) | The plan at 1 : 50, 1 : 100 or 1 : 200 on A4–A1: walls, door swings, windows, names, sizes, a title block, a scale bar, a north arrow | Plotline's own sheet (ours) + the browser's print window | Type A on A3 at 1 : 100, as the print page renders it |
| **Change list → Export CSV** | `.csv` | Every buyer note and finish choice, for a spreadsheet | Ours | (since session 18) |

## 2. What each format is, and what we found

**IFC (Industry Foundation Classes, an international standard, ISO 16739).**
- A plain-text file every building-design program can save. Versions in use: IFC2x3 (2007, still the most common), IFC4
  (2013), IFC4.3 (2024).
- It names things — walls, doors, windows, rooms with their names, floors with their heights, columns, slabs, glass
  curtain walls — and gives each its real shape (in the file: `IfcWall`, `IfcDoor`, `IfcWindow`, `IfcSpace`,
  `IfcBuildingStorey`, `IfcColumn`, `IfcSlab`, `IfcCurtainWall`).
- Read in the browser with **web-ifc** (the reader That Open Company's viewers use). Out come one Studio drawing per
  floor, all on one frame, stacked into a whole project in one drop, and the exact outside shape as one 3D piece.
- A room the file outlines but its walls leave open — a balcony edged only by a railing, a roof terrace, a stair open to
  the floor above, a room whose wall the file put on another storey — is closed by flush zone lines (drawn as nothing)
  along the file's own outline of it, where no wall stands; the railing or parapet itself is in the outside shape. Kept
  only when it leaves fewer things to check (or as many, with fewer names outside a room).
- Two of its rooms in one open space are split the same way along the file's own outlines — all at once, then name by
  name. What the file cannot settle — a bath and its hall given the very same outline (Smiley West, seven flats) — is
  never guessed: the Issues row "Bath shares a room with Hall" offers the unnamed room next door for either name (one
  click), or, with none beside it, **Draw a zone line** with the Wall tool ready.

**DXF (Drawing Exchange Format).**
- AutoCAD's open version of DWG; any drawing program writes it. A plan in DXF is lines, polylines, arcs, repeated symbols
  (a door with its swing arc), texts and dimensions, each on a named layer (`A-WALL`, `A-DOOR`, `A-GLAZ`, `TEXT`…).
- Walls come from pairs of parallel lines on the wall layers (the gap is the thickness, exact), doors from their swing
  arcs, windows from the glass lines in a wall gap, columns from small closed shapes, names and sizes from the texts.
- Layer names are a habit, not a rule: Plotline reads the names CAD templates use (the US / AIA names A-WALL, A-DOOR,
  A-GLAZ, S-COLS, A-ANNO-TEXT, A-ANNO-DIMS, A-FURN…, plain English, and German, French, Spanish, Italian and Dutch
  words — `plan2d.ts` LAYER_TABLE), shows what it took each layer as, names the ones it could not place, and a person
  corrects any layer in one click in the Studio's layer list — kept for the next file with that name. Units come from
  the file's header, else from the drawing's size (a flat is 5–150 m wide, not 5 000–150 000).
- A Plotline export (its PLOTLINE_ZONES / PLOTLINE_KERBS layers in the file) is read to the letter, even after a CAD
  program saved it: each wall is its centre line (PLOTLINE_AXES_<thickness>, its height the line's thickness) while every
  centre line and every wall outline still agree — a curved ramp's chords, a short wall at a T, a door at a corner come
  back exactly; a wall moved in the CAD program makes it read each wall piece from its outline instead. Each opening is
  its block, as narrow as it was drawn.

**DWG.**
- AutoCAD's own locked file, the one most architects actually send. Its format is not published. The only free reader,
  **LibreDWG**, is GPL-3.0, which would force all of Plotline's own code to be free and open, so it cannot go in the
  product; every free DWG reader is LibreDWG under another name (`@mlightcad/libredwg-web`, the "dwg2dxf" web builds —
  checked 2026-11-20). Autodesk's free ODA File Converter is a desktop program, not something a web page can run.
- So a DWG goes to a converter **outside the page**: a small server function on Plotline's own site (`api/dwg.js`)
  sends it to **CloudConvert** and gets the DXF back; the key stays on the server. Off until the founder sets it up;
  off, a DWG is refused with how to save it as DXF, which loses nothing a plan needs: AutoCAD: type SAVEAS, pick "AutoCAD DXF" under Files of type; DraftSight: File → Save As → DXF; no CAD program: LibreCAD (free) opens the .dwg, then File → Save As → DXF.
- Considered and not used: Aspose.CAD Cloud (150 free calls a month, but a company sign-up), Autodesk's online services
  (no DXF back), ODA's converter (desktop, members only). The GPL reader was tried only as an experiment on public DWG
  files (§5); it is not in the program.

**3D models (glTF / GLB, OBJ, FBX, Collada DAE, STL, Rhino 3DM, 3DS, KMZ, VRML WRL, PLY).**
- Shape only: small flat faces (triangles) with colours and pictures, no rooms. It is what a render artist's SketchUp /
  Rhino / Blender / 3ds Max file saves — the cheapest way to the real facade, made already for the brochure.
- Three.js opens all of them; Rhino's `.3dm` needs **rhino3dm** (from McNeel). Plotline keeps the model in the browser as
  one GLB and draws it round the traced flats in the Building view and through the windows while walking; staff line it
  up with four numbers (offset x / y, turn, floor height).
- A model that keeps its pictures (or a `.gltf` its `.bin`) in other files is dropped as its folder or a `.zip`; dropped
  alone, the notes name what was missing. Compressed models (Draco, meshopt) are unpacked; KTX2 pictures are refused
  with "export it with PNG / JPEG pictures".

**PDF.**
- A PDF straight out of a drawing program carries the drawing as lines and the names as text, so it reads like a DXF
  (**pdf.js**, Mozilla's reader). A brochure is mostly pictures: of the 45 brochures in `Demo drawings/`, many pages are
  one photo, others lines with the words turned into outlines.
- So Plotline asks which page is the plan, then decides: a page whose lines make a clean plan (two or more closed rooms,
  at most 20 walls a room — real plans have 3–9) opens as the drawing; any other page is drawn as a picture (4000 px)
  for Auto-trace. The message offers the other way in one click.
- A PDF has no scale of its own: Plotline takes the scale printed on the sheet (`1/4" = 1'-0"`, `1:100`, `SCALE 1 : 50`;
  a sheet that prints two different scales says nothing), else the printed dimensions measured against their lines, else
  the printed room sizes, else asks for the scale (S). (A page's tables can fool the dimensions: twindo's room pages
  measured 1 : 31–64 for their printed 1 : 16 / 1 : 24.) The word before the scale may be a European sheet's — `Scala
  1:100`, `M 1:50`, `Maßstab`, `Échelle`, `Escala`, `Schaal`, `Skala` — and the scale may run on into the title block's
  next words (`1 : 100 Datum: 09.04.2013`): since session 31's samples lane, which found two such sheets among the 53
  samples (a Hannover flat now opens as a drawing; Casa Steiner reads its lines on request). Of the 888 PDF pages we have
  (the corpus, the Dhaka brochures, the samples) no other page reads differently.
- A room's name is a text in it; a stair's "UP" / "DN" and a door or window tag ("D-16", "Win-18", "W3") are not.
- A page with no scale printed as words (no dimension, scale note or room size as text: a Dhaka brochure's plan page
  whose words are all outlines — Akter Anandita page 9, 232 412 lines) is not read as lines at all: read as metres they
  make no walls, and reading them took minutes. It opens as the plan picture at once (0.35 s), where Auto-trace reads
  its names.

**SVG.**
- The web's drawing format (Illustrator, Inkscape, LibreCAD, QCAD; a CAD drawing often reaches a marketing team as SVG
  through a PDF). Lines, shapes, curves and texts in groups that usually carry the CAD layer names.
- Read by Plotline's own small reader with the same engine as DXF ("A-WALL" or "Walls" holds walls, "Doors" doors…). No
  scale of its own: printed dimensions, else room sizes, else the drawing's units guessed from its size.
- An SVG whose groups name no layers (a CAD print saved as SVG) is sorted by pen with the PDF's rule, one rule for both
  (`plan2d.ts` penRoles): the stroke widths at least 2.5 × the usual line's and grey fills of wall-thin shapes are the
  walls; thin floor tiles, furniture and dimension lines no longer pair into walls. One pen for everything: as before.
- The first test used a real DXF plan written out as CAD programs write SVG; its read matched the DXF's. Since
  2026-11-22, six real SVG floor plans from Wikimedia Commons are in [SAMPLES.md](SAMPLES.md): the one drawn as an
  architect's sheet (thick walls, door swings) opens as a drawing; the others are diagrams with single-line walls and
  words drawn as outlines, or scans traced into one outline, and come out as scattered pieces of wall.

**What we do not read, and why.**
- Revit `.rvt`, ArchiCAD `.pln`, SketchUp `.skp`, Allplan: locked, no free reader; each saves IFC in one click.
- `.max`, `.blend`: ask for a glTF / OBJ / FBX export.
- CityGML / GeoJSON: they describe a city, not the inside of a building.

## 3. What to say to a developer's architect

1. "Send the **IFC** of the building" — one export in Revit, ArchiCAD, SketchUp Pro or Allplan; the whole building in one
   drop.
2. AutoCAD only: "**Save the floor plans as DXF**, one file per floor type" (or the DWG, once DWG is turned on) — and,
   from whoever made the renders, "the **3D model** of the outside as glTF / OBJ / FBX / 3DM", the folder or a zip.
3. A drawing PDF is fine if it came out of the drawing program (not a scan); a brochure PDF works too — Plotline asks
   which page is the plan.
4. A picture still works; it is slower and needs the Check these rows.
5. What you can send back: the drawing as **DXF**, the furnished flat as a **3D model** (`.glb`) for their render
   artist, the plan **printed** or as a **PDF** at 1 : 50 / 1 : 100 / 1 : 200.

## 4. Where it lives in the code (for the developers who work on Plotline)

`src/import/` (pure, like `src/trace/`): `index.ts` routes a dropped file by its extension (`bundle.ts` / `drop.ts`: a
folder, zip or several files); `ifc.ts` and `dxf.ts` (both run in `read.worker.ts`, off the page; + `dwg.ts` through `api/dwg.js`), `pdf.ts`,
`svg.ts`, `mesh.ts` each turn their file into the SAME result (`types.ts`): one Unit draft per storey in one shared plan
frame + the exact outside shape as a GLB. `src/studio/shells.ts` keeps the GLB in the browser; `Unit.shell` (core types)
says where it stands; `src/three/` draws it. Nothing downstream knows which file it was. `picture.ts` turns a TIFF / HEIC
into a plan picture. Going out: `sheet.ts` (the plan as a sheet's shapes, and the printable SVG), `dxfWrite.ts` (DXF),
`PlotlineScene.exportGlb` (the furnished flat as a GLB). Every library named here is listed with its licence in
[SOURCES.md](SOURCES.md) §7.

## 5. Measured

**The scoreboard: [FORMATS_SCOREBOARD.md](FORMATS_SCOREBOARD.md)** — every file of the corpus dropped on the real
Studio in Firefox, file by file (walls, openings, columns, names, closed and named rooms, loose ends, crossings, rows to
check, read time, a verdict), before and after each fix of session 31's formats2 and formats3 lanes (formats3: IFC names
outside a room 97 → 9 on the architects' buildings, the PDF scale as printed, every built-in back exactly from a DXF); regenerated by
`E:/dev/tmp/s31/formats2/score.mjs`. It is the acceptance for any change to `src/import/`: the whole corpus again, no
file worse.

The per-file tables of session 29 are in HANDOFF "SESSION 29": for each sample the format version, floors, walls,
openings, columns, labels, closed rooms, validation errors, outside-shape triangles and read time; for DWG, which
versions the GPL experiment converted.

Session 31 (Firefox, the founder's path): IFC hitos 64 MB → 7 floors and molio 74 MB → 10 storeys read in the
background, the page answering 323 of 327 and 323 of 325 timer ticks; models: gltf + bin + texture (3 files and a zip),
glb + texture, obj + mtl + texture, fbx + texture, 3ds, kmz, wrl, ply, a Draco glb — all read; SVG 76 / 34 / 21 against
its DXF's 75 / 34 / 22; PDF: a 16-page brochure's plan page as the picture, a CAD print read; TIFF read, HEIC refused in
plain words; DWG through a stand-in converter → the plan; DXF multilines 0 → 5 walls. Exports: Type A as DXF (back
exactly; lines only 103 / 30 / 21 for 90 / 33 / 27), as GLB (now 54 MB, re-opened), printed on A3 at 1 : 100. The
lines-only DXF read of all 20 built-in drawings is `src/import/dxfWrite.test.ts`: since session 31's formats3 lane every
one comes back exactly the same (walls per thickness and height, zone lines, openings per kind, closed rooms, names,
raised floors).
