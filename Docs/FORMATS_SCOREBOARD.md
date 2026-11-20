# Formats scoreboard — the architect's files, file by file

**What this is.** For every file in the format corpus (`E:/dev/ALTERNATIVE FORMAT TEST/`: buildingSMART's certification
IFCs, ifc-bench's public buildings, `samples/` — DXF, DWG, vector PDF and 3D models), what Plotline makes of it when a
person drops it on the Studio. The founder asked (2026-11-21): "we are testing the new formats for 100 % result — do we
need an AI model, or is the system robust enough?" No model: an architect's file carries the exact walls; what is left is
reading them robustly. This page is how we know: every fix is measured on the whole corpus, before and after.

**How it is made — the founder's path.** Firefox (Playwright's build on E:, headless, one browser), the real Studio at
`/studio` from a fresh browser for each file. Each file is DROPPED on the sheet (a real drop event, the bytes fetched by
the page itself); a 3D model is dropped with the files beside it in its folder; a PDF of several pages is read page by
page through the "Which page is the floor plan?" picker, and a page that became the plan picture is counted through its
"Read its lines instead" button. Then what the drop gave is counted in the page with the Studio's own code: each floor as
the Studio opens it (its load path), its closed rooms, its Issues list. Harness: `E:/dev/tmp/s31/formats2/score.mjs`
(`node score.mjs <tag>`, 12–25 minutes for all 134 files: the 342 MB Sixty5 tower alone takes about a minute) and `table.mjs <tag> [<tag before>]` for these tables; raw
results `E:/dev/tmp/s31/formats2/runs/<tag>.json`; shots `E:/dev/plotline-shots/s31/formats2/<tag>/`.

**The columns** (summed over a file's floors). *Names*: the room names the file gives (IFC spaces, DXF / PDF texts in a
room). *Closed rooms*: closed faces of the walls. *Named rooms*: closed rooms carrying one of the file's names. *Loose
ends*: wall ends joined to nothing. *Crossings*: walls that cross or touch mid-way without a shared corner (the 3D breaks
there). *Names outside a room*: a name in no closed room, or sharing a room with another name. *Review rows*: the
Studio's Issues list (what a person is asked to check), every floor added up. *Read s*: drop → the drawing on screen.

**Verdicts.** *clean*: no crossings, every name in its own closed room, at least one closed room. *rooms open*: a
crossing or a name outside a room is left (the review rows say where). *no walls*: the file has floors but no walls (a
services or structural model, a test file of single shapes). *refused*: the Studio says it cannot read the file and why.
*picture*: a PDF page that opened as the plan picture for Auto-trace (its lines did not make a clean plan). *shape*: a
3D model, or an IFC of no storeys (a bridge, a road): its outside shape only, by design.

Left out: 69 git-lfs pointers (130-byte stand-ins for files not downloaded in this copy of the corpus).

## Before and after (session 31, formats2)

Before: `s31/formats2` at 7ec8a3b (= `s31/redesign` 104fd03 + the scoreboard's dev hook). After: 0c93c3f for the IFC,
DXF and model files (what came after it changed notes only) and a2b4984 for the PDF pages (re-scored after the grey-fill
rule). In between, each fix was scored on the whole corpus too (`runs/ifc`, `runs/dxf` in the harness folder).

**Before**

| format | files | clean | rooms open | no walls | refused | picture | shape only |
|---|---|---|---|---|---|---|---|
| IFC (ifc-bench) | 28 | 7 | 16 | 3 | 1 | 0 | 1 |
| IFC (buildingSMART) | 35 | 0 | 7 | 3 | 0 | 0 | 25 |
| DXF | 11 | 4 | 5 | 2 | 0 | 0 | 0 |
| DXF (from DWG) | 11 | 4 | 0 | 7 | 0 | 0 | 0 |
| PDF | 25 | 0 | 0 | 0 | 0 | 25 | 0 |
| DWG | 11 | 0 | 0 | 0 | 11 | 0 | 0 |
| 3D model | 13 | 0 | 0 | 0 | 1 | 0 | 12 |
| **all** | 134 | 15 | 28 | 15 | 13 | 25 | 38 |

On the files with floors: 1714 names, 1254 named closed rooms, 460 names outside a room, 254 crossings, 3984 loose ends, 6421 review rows.

**After**

| format | files | clean | rooms open | no walls | refused | picture | shape only |
|---|---|---|---|---|---|---|---|
| IFC (ifc-bench) | 28 | 14 | 9 | 4 | 0 | 0 | 1 |
| IFC (buildingSMART) | 35 | 0 | 7 | 3 | 0 | 0 | 25 |
| DXF | 11 | 6 | 3 | 2 | 0 | 0 | 0 |
| DXF (from DWG) | 11 | 4 | 0 | 7 | 0 | 0 | 0 |
| PDF | 25 | 16 | 0 | 0 | 0 | 9 | 0 |
| DWG | 11 | 0 | 0 | 0 | 11 | 0 | 0 |
| 3D model | 13 | 0 | 0 | 0 | 1 | 0 | 12 |
| **all** | 134 | 40 | 19 | 16 | 12 | 9 | 38 |

On the files with floors: 2296 names, 1427 named closed rooms, 869 names outside a room, 2 crossings, 2283 loose ends, 5013 review rows.

On the 66 files that have walls: **names outside a room 220 → 103, crossings 254 → 2, named rooms 1 254 → 1 427, loose
ends 3 984 → 2 283, rows to check 6 156 → 4 218.** (The all-files "names outside" total grows only because a services
IFC that used to stop with an error now opens: its 526 room names have no walls at all — verdict *no walls*.)

### What changed, file by file (before → after; every file that changed at all)

- city_house_munich/arc.ifc: walls 130 → 137, rooms 33 → 37, named 12 → 16, loose 18 → 15, outside 7 → 3, rows 49 → 42
- dental_clinic/arc.ifc: walls 2014 → 2031, openings 376 → 375, rooms 485 → 528, named 231 → 265, loose 23 → 17, crossings 20 → 0, outside 38 → 4, rows 204 → 147
- dental_clinic/mep.ifc: **refused → no walls**, labels 0 → 526, outside 0 → 526, rows 0 → 530
- digital_hub/arc.ifc: walls 396 → 381, rooms 116 → 111, crossings 6 → 0, rows 61 → 55
- duplex/arc.ifc: **rooms open → clean**, walls 102 → 104, rooms 25 → 31, named 17 → 21, loose 6 → 0, outside 4 → 0, rows 26 → 18
- fantasy_hotel_1/arc.ifc: rooms 40 → 46, named 20 → 23, crossings 12 → 0, outside 6 → 3, rows 27 → 12
- fantasy_office_building_3/arc.ifc: **rooms open → clean**, rooms 140 → 142, named 85 → 87, outside 2 → 0, rows 63 → 61
- fantasy_residential_building_1/arc.ifc: walls 349 → 351, rooms 79 → 81, named 47 → 49, outside 10 → 8, rows 56 → 54
- fzk_house/arc.ifc: **rooms open → clean**, walls 20 → 21, rooms 5 → 7, named 5 → 7, loose 1 → 0, outside 2 → 0, rows 6 → 3
- hitos/arc.ifc: walls 1711 → 1780, openings 440 → 438, labels 243 → 238, rooms 394 → 453, named 192 → 221, loose 96 → 82, crossings 19 → 2, outside 51 → 17, rows 239 → 179
- molio/arc.ifc: walls 348 → 360, rooms 104 → 114, named 89 → 99, loose 8 → 3, outside 14 → 4, rows 55 → 40
- samuel_macalister_sample_house/arc.ifc: **rooms open → clean**, openings 53 → 52, rooms 30 → 33, named 13 → 14, crossings 1 → 0, outside 1 → 0, rows 60 → 58
- schependomlaan/arc.ifc: **rooms open → clean**, walls 1043 → 991, rooms 285 → 315, crossings 84 → 0, rows 172 → 92
- sixty5/arc.ifc: walls 12360 → 12345, rooms 2042 → 2097, named 44 → 60, crossings 73 → 0, outside 66 → 50, rows 1966 → 1895
- sixty5/str.ifc: **rooms open → clean**, rooms 37 → 40, crossings 6 → 0, rows 365 → 359
- smiley_west/arc.ifc: walls 436 → 430
- wbdg_office/arc.ifc: **rooms open → clean**, walls 833 → 837, openings 176 → 175, rooms 198 → 206, named 94 → 99, crossings 2 → 0, outside 5 → 0, rows 78 → 72
- autodesk_blocks_and_tables_-_imperial: walls 104 → 99, labels 9 → 11, rooms 20 → 19, named 9 → 11, rows 14 → 12
- draftsperson_house_floor_plan_tutorial: walls 45 → 92, rooms 7 → 32, loose 2 → 1
- twindo_Backcountry_1st_Floor_Plan: walls 77 → 86, rooms 9 → 14, loose 11 → 9
- twindo_Backcountry_2nd_Floor_Plan: walls 92 → 98, openings 30 → 28, rooms 11 → 14, loose 16 → 14, rows 26 → 24
- ccwi_simple_floorplan.dxf: **rooms open → clean**, walls 56 → 54, crossings 2 → 0, rows 19 → 17
- drafted_ai_example.dxf: walls 77 → 74, rooms 25 → 24
- giraffe360_demo_commercial_2.dxf: **rooms open → clean**, walls 59 → 63, rooms 0 → 3, loose 33 → 32, rows 36 → 35
- giraffe360_demo_residential.dxf: walls 61 → 63, rooms 8 → 9
- jscad_dxfparser_floorplan.dxf: walls 105 → 127, labels 9 → 13, rooms 20 → 37, named 9 → 13, loose 12 → 8, rows 21 → 15
- twindo_Backcountry_2D_Plan.pdf p1: **picture → clean**, walls 308 → 171, openings 21 → 5, labels 2 → 1, rooms 67 → 43, named 2 → 1, loose 63 → 14, crossings 3 → 0, rows 79 → 30
- twindo_Backcountry_2D_Plan.pdf p2: **picture → clean**, walls 1475 → 393, openings 118 → 16, labels 3 → 1, rooms 432 → 111, named 3 → 1, loose 147 → 22, crossings 9 → 0, rows 222 → 59
- twindo_Backcountry_Measurement_Report.pdf p10: walls 48 → 140, openings 0 → 2, labels 0 → 2, rooms 0 → 36, named 0 → 2, loose 85 → 16, rows 87 → 25
- twindo_Backcountry_Measurement_Report.pdf p11: **picture → clean**, walls 35 → 117, openings 0 → 2, labels 0 → 2, rooms 0 → 29, named 0 → 2, loose 59 → 13, rows 61 → 20
- twindo_Backcountry_Measurement_Report.pdf p12: **picture → clean**, walls 970 → 139, openings 153 → 6, rooms 278 → 36, loose 171 → 1, crossings 6 → 0, rows 251 → 27
- twindo_Backcountry_Measurement_Report.pdf p14: walls 125 → 281, openings 7 → 14, labels 0 → 2, rooms 1 → 89, named 0 → 2, loose 98 → 16, rows 101 → 31
- twindo_Backcountry_Measurement_Report.pdf p15: **picture → clean**, walls 68 → 298, openings 3 → 13, labels 0 → 3, rooms 0 → 93, named 0 → 3, loose 92 → 16, rows 94 → 33
- twindo_Backcountry_Measurement_Report.pdf p16: **picture → clean**, walls 94 → 344, openings 6 → 15, labels 0 → 8, rooms 2 → 103, named 0 → 8, loose 120 → 19, rows 123 → 39
- twindo_Backcountry_Measurement_Report.pdf p17: **picture → clean**, walls 105 → 323, openings 5 → 12, labels 0 → 7, rooms 1 → 95, named 0 → 7, loose 126 → 18, crossings 3 → 0, rows 131 → 38
- twindo_Backcountry_Measurement_Report.pdf p18: walls 89 → 267, openings 5 → 11, labels 1 → 3, rooms 7 → 87, named 1 → 3, loose 73 → 16, rows 78 → 31
- twindo_Backcountry_Measurement_Report.pdf p19: **picture → clean**, walls 125 → 315, openings 9 → 13, labels 0 → 4, rooms 7 → 102, named 0 → 4, loose 76 → 17, crossings 3 → 0, rows 84 → 37
- twindo_Backcountry_Measurement_Report.pdf p20: **picture → clean**, walls 88 → 305, openings 5 → 12, labels 0 → 7, rooms 0 → 93, named 0 → 7, loose 137 → 18, rows 139 → 36
- twindo_Backcountry_Measurement_Report.pdf p21: **picture → clean**, walls 113 → 340, openings 9 → 13, labels 0 → 5, rooms 3 → 105, named 0 → 5, loose 97 → 21, crossings 3 → 0, rows 105 → 42
- twindo_Backcountry_Measurement_Report.pdf p22: **picture → clean**, walls 84 → 352, openings 1 → 13, labels 0 → 6, rooms 0 → 108, named 0 → 6, loose 119 → 18, rows 121 → 38
- twindo_Backcountry_Measurement_Report.pdf p3: **picture → clean**, walls 517 → 152, openings 75 → 3, rooms 127 → 34, loose 114 → 15, crossings 2 → 0, rows 147 → 33
- twindo_Backcountry_Measurement_Report.pdf p5: **picture → clean**, walls 52 → 141, openings 0 → 4, labels 0 → 2, rooms 2 → 37, named 0 → 2, loose 68 → 13, rows 72 → 26
- twindo_Backcountry_Measurement_Report.pdf p6: **picture → clean**, walls 53 → 128, openings 2 → 3, labels 0 → 5, rooms 1 → 34, named 0 → 5, loose 74 → 18, rows 77 → 27
- twindo_Backcountry_Measurement_Report.pdf p7: **picture → clean**, walls 46 → 109, openings 1 → 2, labels 0 → 1, rooms 1 → 28, named 0 → 1, loose 60 → 12, rows 63 → 19
- twindo_Backcountry_Measurement_Report.pdf p8: **picture → clean**, walls 51 → 119, labels 0 → 1, rooms 0 → 30, named 0 → 1, loose 69 → 15, rows 71 → 22
- twindo_Backcountry_Measurement_Report.pdf p9: walls 77 → 187, openings 2 → 9, labels 0 → 1, rooms 0 → 50, named 0 → 1, loose 120 → 14, rows 122 → 30


### The fixes, each measured on the whole corpus

1. **Rooms that do not close on big IFCs.** After the Studio's own join, a wall end left touching another wall mid-way
   splits it (a T) and twins become one wall; invisible zone lines that end on a wall's face come onto the wall; the
   load and that pass take turns until opening the floor again changes nothing. Two rooms of one open plan get a zone
   line where the file's own room outlines run together, then (if still shared) the smaller rooms' outlines — each step
   kept only when it leaves fewer rows to check. A space that holds two or more others (a gross area) is not a room name.
   web-ifc failing on one element no longer stops the file (the rest are read one by one). ifc-bench, 19 buildings
   (sixty5 aside), each floor as the Studio opens it: **crossings 144 → 2, names outside a room 148 → 47, named rooms
   1 158 → 1 254, rows to check 1 274 → 1 011**, no building with more rows than before; clean 7 → 14 of 28 files.
2. **A DXF saved by a CAD program after Plotline's export.** Zone lines and kerbs on their own layers
   (PLOTLINE_ZONES, PLOTLINE_KERBS); each wall outline carries its height as its thickness (group 39); every opening a
   block with its two jambs (a passage too), the jambs carrying the wall's height; a raised floor's name at that height;
   bare numbers name rooms (parking bays). A file with the PLOTLINE_ layers is read to the letter. From their lines alone
   **10 of the 20 built-in drawings come back exactly** (walls per thickness and height, zone lines, openings per kind,
   closed rooms, every name, raised floors) — before: none (Type A 90 → 103 walls, 33 → 30 openings, 27 → 21 rooms).
   The other ten within 1–13 differences (`dxfWrite.test.ts` holds each number so it cannot grow).
3. **Layerless vector PDFs.** Each line keeps its pen (weight in page points, colour); the pens 2.5 × the usual line
   weight and the grey fills are the walls. twindo's print, page 1: 308 walls / 79 rows → 171 / 30 and it now opens as a
   drawing (it fell back to the plan picture); page 2: 1 475 / 222 → 393 / 59; 14 pages of the measurement report open as
   drawings too. A grey fill counts only when the page's scale is known and its shapes are wall-thin (two report pages
   that shade whole rooms grey stay pictures, as before). A one-pen PDF reads as before. Room names on these prints are
   mostly outlines, not text: the rooms close but stay "Space N" — a PDF verdict *clean* means no crossing and no name
   outside a room, not that every room is named.
4. **DXF layer names.** One table (US / AIA names, English, German, French, Spanish, Italian, Dutch, Plotline's own;
   casework, stairs, details and floor patterns left out; a STRUCTURE layer is a wall, no longer a door); the notes name
   the layers it could not place; a person sets any layer in one click (the Studio's Layers list) and it is kept for the
   next file. The corpus DXFs read the same as before this step (`dxf.test.ts` "layer names").
5. **Seen twice on the scoreboard:** a services IFC (dental clinic, 125 MB) stopped with "[object
   WebAssembly.Exception]" — now read (22 of 16 544 pieces left out of the outside shape, said in the notes).

### Not 100 % yet, and why (plain words)

- **IFC:** 47 room names of 1 301 still stand outside a closed room on the 19 buildings — walls in the file that stop
  9–25 cm short of each other at junctions of three thick walls (Hitos), balconies edged only by railings (the fantasy
  residential building: railings are not read as walls), bath and hall pairs whose dividing door wall leaks elsewhere
  (Smiley West). 2 crossings left on one Hitos floor. The rows to check include every closed space the file leaves
  unnamed (shafts, voids) as "Room has no name" — honest, not hidden.
- **IFC speed:** joining and checking each floor costs time on big buildings: the dental clinic 6.7 → 11 s, Hitos
  3.6 → 5.8 s, Schependomlaan 3.2 → 4.6 s, the 342 MB Sixty5 tower 18 → 57 s (the page keeps answering; the bar now gives the floors their
  share). Small buildings read as fast as before.
- **DXF round trip:** 10 of 20 built-ins exact from their lines alone; Banani's basements and ground (curved ramp walls
  drawn as short chords, parking bays) and Sheltech ground / Sheltech A / Type B / Type C (a door right at a corner, one
  short wall at a T) still differ by 1–13 things. Untouched exports still open exactly (the comment copy).
- **PDF:** a print whose walls are drawn with the same pen as everything else gets nothing from pens; brochure pages
  stay pictures for Auto-trace, by design.
- **Not plans:** the buildingSMART Simple-Scene buildings have only four walls (no front or back) — nothing can close;
  LibreDWG's example drawings and ezdxf's test files are not floor plans; DWG stays refused until the online converter
  is set up (Docs/SETUP_FORMATS.md); 3D models give the outside shape only, by design.

## Per file — baseline (7ec8a3b)


#### IFC (ifc-bench)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4351/arc.ifc | IFC2X3 | 5 | 152 | 30 | 0 | 6 | 39 | 6 | 7 | 0 | 0 | 32 | 1 | clean |
| ac20/arc.ifc | IFC4 | 5 | 257 | 283 | 2 | 82 | 82 | 82 | 0 | 0 | 0 | 6 | 1 | clean |
| city_house_munich/arc.ifc | IFC4X3_ADD2 | 5 | 130 | 27 | 0 | 19 | 33 | 12 | 18 | 0 | 7 | 49 | 1.3 | rooms open |
| dental_clinic/arc.ifc | IFC2X3 | 4 | 2014 | 376 | 0 | 269 | 485 | 231 | 23 | 20 | 38 | 204 | 6.7 | rooms open |
| dental_clinic/mep.ifc | IFC | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.9 | refused: Could not read mep.ifc: [object WebAssembly.Exception] |
| dental_clinic/str.ifc | IFC2X3 | 4 | 33 | 1 | 270 | 0 | 4 | 0 | 4 | 0 | 0 | 15 | 1.3 | clean |
| digital_hub/arc.ifc | IFC4 | 3 | 396 | 214 | 62 | 64 | 116 | 63 | 9 | 6 | 1 | 61 | 1.4 | rooms open |
| duplex/arc.ifc | IFC2X3 | 4 | 102 | 28 | 0 | 21 | 25 | 17 | 6 | 0 | 4 | 26 | 0.6 | rooms open |
| duplex/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 42 | 0 | 0 | 0 | 0 | 42 | 45 | 1 | no walls |
| ettenheim_gis/city.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.9 | shape |
| fantasy_hotel_1/arc.ifc | IFC4 | 4 | 200 | 144 | 39 | 26 | 40 | 20 | 4 | 12 | 6 | 27 | 1.3 | rooms open |
| fantasy_hotel_2/arc.ifc | IFC4 | 6 | 218 | 258 | 86 | 20 | 64 | 20 | 6 | 0 | 0 | 56 | 1.6 | clean |
| fantasy_office_building_1/arc.ifc | IFC4 | 5 | 293 | 118 | 40 | 44 | 56 | 44 | 0 | 0 | 0 | 17 | 1.3 | clean |
| fantasy_office_building_2/arc.ifc | IFC4 | 3 | 100 | 40 | 44 | 5 | 29 | 5 | 0 | 0 | 0 | 27 | 1.3 | clean |
| fantasy_office_building_3/arc.ifc | IFC4 | 6 | 436 | 297 | 20 | 87 | 140 | 85 | 0 | 0 | 2 | 63 | 1.3 | rooms open |
| fantasy_residential_building_1/arc.ifc | IFC4 | 4 | 349 | 134 | 30 | 57 | 79 | 47 | 0 | 0 | 10 | 56 | 1.3 | rooms open |
| fzk_house/arc.ifc | IFC4 | 2 | 20 | 16 | 0 | 7 | 5 | 5 | 1 | 0 | 2 | 6 | 0.6 | rooms open |
| hitos/arc.ifc | IFC2X3 | 7 | 1711 | 440 | 225 | 243 | 394 | 192 | 96 | 19 | 51 | 239 | 3.6 | rooms open |
| molio/arc.ifc | IFC2X3 | 10 | 348 | 241 | 14 | 103 | 104 | 89 | 8 | 0 | 14 | 55 | 2.4 | rooms open |
| samuel_macalister_sample_house/arc.ifc | IFC4 | 6 | 172 | 53 | 5 | 14 | 30 | 13 | 38 | 1 | 1 | 60 | 1.3 | rooms open |
| samuel_macalister_sample_house/mep.ifc | IFC4 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 2.3 | no walls |
| schependomlaan/arc.ifc | IFC2X3 | 1 | 1043 | 77 | 23 | 0 | 285 | 0 | 32 | 84 | 0 | 172 | 3.2 | rooms open |
| sixty5/arc.ifc | IFC2X3 | 19 | 12360 | 572 | 0 | 110 | 2042 | 44 | 1254 | 73 | 66 | 1966 | 17.9 | rooms open |
| sixty5/str.ifc | IFC2X3 | 19 | 412 | 329 | 393 | 0 | 37 | 0 | 289 | 6 | 0 | 365 | 1.6 | rooms open |
| smiley_west/arc.ifc | IFC4 | 5 | 436 | 250 | 20 | 140 | 140 | 133 | 21 | 0 | 7 | 40 | 0.9 | rooms open |
| wbdg_office/arc.ifc | IFC2X3 | 3 | 833 | 176 | 0 | 99 | 198 | 94 | 10 | 2 | 5 | 78 | 1.4 | rooms open |
| wbdg_office/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 198 | 0 | 0 | 0 | 0 | 198 | 201 | 2.3 | no walls |
| wbdg_office/str.ifc | IFC2X3 | 4 | 8 | 0 | 120 | 0 | 2 | 0 | 0 | 0 | 0 | 8 | 1 | clean |

#### IFC (buildingSMART)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cert 2.3.0.1/Simple-Scene/Building-Architecture.ifc | IFC2X3 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 1.5 | rooms open |
| cert 2.3.0.1/Simple-Scene/Building-Hvac.ifc | IFC2X3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 2.3.0.1/Simple-Scene/Building-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Building-Structural.ifc | IFC2X3 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 2.3.0.1/Simple-Scene/Infra-Bridge.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Electrical.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Plumbing.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Rail.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Road.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/basin-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/column-straight-rectangle-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellated-item.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellation-with-individual-colors.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/wall-with-opening-and-window.ifc | IFC4 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 4 | 0.7 | rooms open |
| cert 4.0.2.1/Simple-Scene/Building-Architecture.ifc | IFC4 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Building-Hvac.ifc | IFC4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.0.2.1/Simple-Scene/Building-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Building-Structural.ifc | IFC4 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Infra-Bridge.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Electrical.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Plumbing.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Rail.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Road.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Architecture.ifc | IFC4X3_ADD2 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 0.6 | rooms open |
| cert 4.3.2.0/Simple-Scene/Building-Hvac.ifc | IFC4X3_ADD2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.3.2.0/Simple-Scene/Building-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Structural.ifc | IFC4X3_ADD2 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 4.3.2.0/Simple-Scene/Infra-Bridge.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Electrical.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Plumbing.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Rail.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Road.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |

#### DXF

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ccwi_simple_floorplan.dxf | DXF 2000 | 1 | 56 | 0 | 0 | 0 | 15 | 0 | 0 | 2 | 0 | 19 | 0.3 | rooms open |
| drafted_ai_example.dxf | DXF 2018 | 1 | 77 | 34 | 1 | 19 | 25 | 19 | 1 | 0 | 0 | 8 | 0.3 | clean |
| ezdxf_dimension_in_nested_blocks.dxf | DXF 2013 | 1 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| ezdxf_Minimal_DXF_AC1009.dxf | DXF unknown. | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| ezdxf_uncommon.dxf | DXF 2018 | 1 | 17 | 3 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 14 | 0.3 | rooms open |
| giraffe360_demo_commercial_1.dxf | DXF 2007 | 1 | 18 | 3 | 2 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0.3 | clean |
| giraffe360_demo_commercial_2.dxf | DXF 2007 | 1 | 59 | 33 | 2 | 0 | 0 | 0 | 33 | 0 | 0 | 36 | 0.3 | rooms open |
| giraffe360_demo_residential.dxf | DXF 2007 | 1 | 61 | 10 | 0 | 2 | 8 | 2 | 0 | 0 | 0 | 7 | 0.3 | clean |
| jscad_autocad2017_2Dmlines.dxf | DXF 2013 | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 6 | 0.3 | rooms open |
| jscad_dxfparser_floorplan.dxf | DXF 2004 | 1 | 105 | 30 | 0 | 9 | 20 | 9 | 12 | 0 | 0 | 21 | 0.3 | clean |
| jscad_ezdxf_small_r13.dxf | DXF R13 | 1 | 2 | 0 | 1 | 0 | 0 | 0 | 4 | 0 | 0 | 6 | 0.3 | rooms open |

#### DXF (from DWG)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| autodesk_blocks_and_tables_-_imperial | DXF 2007 | 1 | 104 | 21 | 27 | 9 | 20 | 9 | 5 | 0 | 0 | 14 | 0.4 | clean |
| draftsperson_house_floor_plan_tutorial | DXF 2013 | 1 | 45 | 31 | 4 | 3 | 7 | 3 | 2 | 0 | 0 | 7 | 0.3 | clean |
| libredwg_example_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| libredwg_example_2007 | DXF 2007 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| libredwg_example_2013 | DXF 2013 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_example_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| libredwg_example_r14 | DXF R14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_sample_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| libredwg_sample_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| twindo_Backcountry_1st_Floor_Plan | DXF 2013 | 1 | 77 | 15 | 1 | 0 | 9 | 0 | 11 | 0 | 0 | 19 | 0.3 | clean |
| twindo_Backcountry_2nd_Floor_Plan | DXF 2013 | 1 | 92 | 30 | 11 | 1 | 11 | 1 | 16 | 0 | 0 | 26 | 0.3 | clean |

#### PDF

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qcad_flange.pdf | PDF p1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 4 | 1.2 | picture |
| twindo_Backcountry_2D_Plan.pdf p1 | PDF p1 | 1 | 308 | 21 | 0 | 2 | 67 | 2 | 63 | 3 | 0 | 79 | 1.3 | picture |
| twindo_Backcountry_2D_Plan.pdf p2 | PDF p2 | 1 | 1475 | 118 | 0 | 3 | 432 | 3 | 147 | 9 | 0 | 222 | 12.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p1 | PDF p1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p10 | PDF p10 | 1 | 48 | 0 | 0 | 0 | 0 | 0 | 85 | 0 | 0 | 87 | 1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p11 | PDF p11 | 1 | 35 | 0 | 0 | 0 | 0 | 0 | 59 | 0 | 0 | 61 | 1.1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p12 | PDF p12 | 1 | 970 | 153 | 0 | 1 | 278 | 1 | 171 | 6 | 0 | 251 | 6.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p13 | PDF p13 | 1 | 16 | 0 | 0 | 0 | 0 | 0 | 32 | 0 | 0 | 34 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p14 | PDF p14 | 1 | 125 | 7 | 0 | 0 | 1 | 0 | 98 | 0 | 0 | 101 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p15 | PDF p15 | 1 | 68 | 3 | 0 | 0 | 0 | 0 | 92 | 0 | 0 | 94 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p16 | PDF p16 | 1 | 94 | 6 | 0 | 0 | 2 | 0 | 120 | 0 | 0 | 123 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p17 | PDF p17 | 1 | 105 | 5 | 0 | 0 | 1 | 0 | 126 | 3 | 0 | 131 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p18 | PDF p18 | 1 | 89 | 5 | 0 | 1 | 7 | 1 | 73 | 0 | 0 | 78 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p19 | PDF p19 | 1 | 125 | 9 | 0 | 0 | 7 | 0 | 76 | 3 | 0 | 84 | 1.5 | picture |
| twindo_Backcountry_Measurement_Report.pdf p2 | PDF p2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p20 | PDF p20 | 1 | 88 | 5 | 0 | 0 | 0 | 0 | 137 | 0 | 0 | 139 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p21 | PDF p21 | 1 | 113 | 9 | 0 | 0 | 3 | 0 | 97 | 3 | 0 | 105 | 1.5 | picture |
| twindo_Backcountry_Measurement_Report.pdf p22 | PDF p22 | 1 | 84 | 1 | 0 | 0 | 0 | 0 | 119 | 0 | 0 | 121 | 1.5 | picture |
| twindo_Backcountry_Measurement_Report.pdf p3 | PDF p3 | 1 | 517 | 75 | 0 | 1 | 127 | 1 | 114 | 2 | 0 | 147 | 1.7 | picture |
| twindo_Backcountry_Measurement_Report.pdf p4 | PDF p4 | 1 | 6 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 14 | 1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p5 | PDF p5 | 1 | 52 | 0 | 0 | 0 | 2 | 0 | 68 | 0 | 0 | 72 | 1.1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p6 | PDF p6 | 1 | 53 | 2 | 0 | 0 | 1 | 0 | 74 | 0 | 0 | 77 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p7 | PDF p7 | 1 | 46 | 1 | 0 | 0 | 1 | 0 | 60 | 0 | 0 | 63 | 1.1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p8 | PDF p8 | 1 | 51 | 2 | 0 | 0 | 0 | 0 | 69 | 0 | 0 | 71 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p9 | PDF p9 | 1 | 77 | 2 | 0 | 0 | 0 | 0 | 120 | 0 | 0 | 122 | 1.4 | picture |

#### DWG

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| autodesk_blocks_and_tables_-_imperial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| draftsperson_house_floor_plan_tutorial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2007.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2013.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_r14.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_1st_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_2nd_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |

#### 3D model

| file | triangles | read s | verdict |
|---|---|---|---|
| threejs_Rhino_Logo.3dm | 131,948 | 1 | shape |
| threejs_Cobra_s350.dae | 9,598 | 0.3 | shape |
| kenney_suburban_building-type-a.fbx | 1,174 | 0.3 | shape |
| threejs_exampleWindow.fbx | 44 | 0.3 | shape |
| threejs_monkey.fbx | 970 | 0.3 | shape |
| threejs_nurbs.fbx | — | 0.3 | refused: Could not read threejs_nurbs.fbx: threejs_nurbs.fbx holds no surfaces (lines or curves onl |
| babylon_village.glb | 458 | 0.3 | shape |
| kenney_suburban_building-type-a.glb | 1,174 | 0.3 | shape |
| kenney_suburban_building-type-k.glb | 1,024 | 0.4 | shape |
| threejs_LittlestTokyo.glb | 141,802 | 0.7 | shape |
| kenney_suburban_building-type-a.obj | 2,348 | 0.3 | shape |
| threejs_colored_binary.stl | 2,156 | 0.3 | shape |
| threejs_slotted_disk_ascii.stl | 288 | 0.3 | shape |



## Per file — after (a2b4984)


#### IFC (ifc-bench)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4351/arc.ifc | IFC2X3 | 5 | 152 | 30 | 0 | 6 | 39 | 6 | 7 | 0 | 0 | 32 | 0.9 | clean |
| ac20/arc.ifc | IFC4 | 5 | 257 | 283 | 2 | 82 | 82 | 82 | 0 | 0 | 0 | 6 | 0.9 | clean |
| city_house_munich/arc.ifc | IFC4X3_ADD2 | 5 | 137 | 27 | 0 | 19 | 37 | 16 | 15 | 0 | 3 | 42 | 1.3 | rooms open |
| dental_clinic/arc.ifc | IFC2X3 | 4 | 2031 | 375 | 0 | 269 | 528 | 265 | 17 | 0 | 4 | 147 | 11.2 | rooms open |
| dental_clinic/mep.ifc | IFC2X3 | 4 | 0 | 0 | 0 | 526 | 0 | 0 | 0 | 0 | 526 | 530 | 4.2 | no walls |
| dental_clinic/str.ifc | IFC2X3 | 4 | 33 | 1 | 270 | 0 | 4 | 0 | 4 | 0 | 0 | 15 | 1.3 | clean |
| digital_hub/arc.ifc | IFC4 | 3 | 381 | 214 | 62 | 64 | 111 | 63 | 9 | 0 | 1 | 55 | 1.6 | rooms open |
| duplex/arc.ifc | IFC2X3 | 4 | 104 | 28 | 0 | 21 | 31 | 21 | 0 | 0 | 0 | 18 | 0.6 | clean |
| duplex/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 42 | 0 | 0 | 0 | 0 | 42 | 45 | 1 | no walls |
| ettenheim_gis/city.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | shape |
| fantasy_hotel_1/arc.ifc | IFC4 | 4 | 200 | 144 | 39 | 26 | 46 | 23 | 4 | 0 | 3 | 12 | 0.9 | rooms open |
| fantasy_hotel_2/arc.ifc | IFC4 | 6 | 218 | 258 | 86 | 20 | 64 | 20 | 6 | 0 | 0 | 56 | 1.6 | clean |
| fantasy_office_building_1/arc.ifc | IFC4 | 5 | 293 | 118 | 40 | 44 | 56 | 44 | 0 | 0 | 0 | 17 | 1.3 | clean |
| fantasy_office_building_2/arc.ifc | IFC4 | 3 | 100 | 40 | 44 | 5 | 29 | 5 | 0 | 0 | 0 | 27 | 1.3 | clean |
| fantasy_office_building_3/arc.ifc | IFC4 | 6 | 436 | 297 | 20 | 87 | 142 | 87 | 0 | 0 | 0 | 61 | 1.6 | clean |
| fantasy_residential_building_1/arc.ifc | IFC4 | 4 | 351 | 134 | 30 | 57 | 81 | 49 | 0 | 0 | 8 | 54 | 1.3 | rooms open |
| fzk_house/arc.ifc | IFC4 | 2 | 21 | 16 | 0 | 7 | 7 | 7 | 0 | 0 | 0 | 3 | 0.9 | clean |
| hitos/arc.ifc | IFC2X3 | 7 | 1780 | 438 | 225 | 238 | 453 | 221 | 82 | 2 | 17 | 179 | 5.8 | rooms open |
| molio/arc.ifc | IFC2X3 | 10 | 360 | 241 | 14 | 103 | 114 | 99 | 3 | 0 | 4 | 40 | 2.3 | rooms open |
| samuel_macalister_sample_house/arc.ifc | IFC4 | 6 | 172 | 52 | 5 | 14 | 33 | 14 | 38 | 0 | 0 | 58 | 1.3 | clean |
| samuel_macalister_sample_house/mep.ifc | IFC4 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 2.6 | no walls |
| schependomlaan/arc.ifc | IFC2X3 | 1 | 991 | 77 | 23 | 0 | 315 | 0 | 32 | 0 | 0 | 92 | 4.6 | clean |
| sixty5/arc.ifc | IFC2X3 | 19 | 12345 | 572 | 0 | 110 | 2097 | 60 | 1254 | 0 | 50 | 1895 | 57.3 | rooms open |
| sixty5/str.ifc | IFC2X3 | 19 | 412 | 329 | 393 | 0 | 40 | 0 | 289 | 0 | 0 | 359 | 1.6 | clean |
| smiley_west/arc.ifc | IFC4 | 5 | 430 | 250 | 20 | 140 | 140 | 133 | 21 | 0 | 7 | 40 | 1.3 | rooms open |
| wbdg_office/arc.ifc | IFC2X3 | 3 | 837 | 175 | 0 | 99 | 206 | 99 | 10 | 0 | 0 | 72 | 1.2 | clean |
| wbdg_office/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 198 | 0 | 0 | 0 | 0 | 198 | 201 | 2 | no walls |
| wbdg_office/str.ifc | IFC2X3 | 4 | 8 | 0 | 120 | 0 | 2 | 0 | 0 | 0 | 0 | 8 | 1 | clean |

#### IFC (buildingSMART)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cert 2.3.0.1/Simple-Scene/Building-Architecture.ifc | IFC2X3 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 0.6 | rooms open |
| cert 2.3.0.1/Simple-Scene/Building-Hvac.ifc | IFC2X3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 2.3.0.1/Simple-Scene/Building-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Building-Structural.ifc | IFC2X3 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 2.3.0.1/Simple-Scene/Infra-Bridge.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Electrical.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Plumbing.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Rail.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Road.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.9 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/basin-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/column-straight-rectangle-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellated-item.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellation-with-individual-colors.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/wall-with-opening-and-window.ifc | IFC4 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 4 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Building-Architecture.ifc | IFC4 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Building-Hvac.ifc | IFC4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.0.2.1/Simple-Scene/Building-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Building-Structural.ifc | IFC4 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Infra-Bridge.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Electrical.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Plumbing.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Rail.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Road.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Architecture.ifc | IFC4X3_ADD2 | 1 | 4 | 0 | 0 | 2 | 0 | 0 | 8 | 0 | 2 | 12 | 0.6 | rooms open |
| cert 4.3.2.0/Simple-Scene/Building-Hvac.ifc | IFC4X3_ADD2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.3.2.0/Simple-Scene/Building-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Structural.ifc | IFC4X3_ADD2 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 4.3.2.0/Simple-Scene/Infra-Bridge.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Electrical.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Plumbing.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Rail.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Road.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |

#### DXF

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ccwi_simple_floorplan.dxf | DXF 2000 | 1 | 54 | 0 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | 17 | 0.3 | clean |
| drafted_ai_example.dxf | DXF 2018 | 1 | 74 | 34 | 1 | 19 | 24 | 19 | 1 | 0 | 0 | 8 | 0.3 | clean |
| ezdxf_dimension_in_nested_blocks.dxf | DXF 2013 | 1 | 0 | 0 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| ezdxf_Minimal_DXF_AC1009.dxf | DXF unknown. | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| ezdxf_uncommon.dxf | DXF 2018 | 1 | 17 | 3 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 14 | 0.3 | rooms open |
| giraffe360_demo_commercial_1.dxf | DXF 2007 | 1 | 18 | 3 | 2 | 1 | 1 | 1 | 0 | 0 | 0 | 1 | 0.3 | clean |
| giraffe360_demo_commercial_2.dxf | DXF 2007 | 1 | 63 | 33 | 2 | 0 | 3 | 0 | 32 | 0 | 0 | 35 | 0.3 | clean |
| giraffe360_demo_residential.dxf | DXF 2007 | 1 | 63 | 10 | 0 | 2 | 9 | 2 | 0 | 0 | 0 | 7 | 0.3 | clean |
| jscad_autocad2017_2Dmlines.dxf | DXF 2013 | 1 | 5 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 6 | 0.3 | rooms open |
| jscad_dxfparser_floorplan.dxf | DXF 2004 | 1 | 127 | 30 | 0 | 13 | 37 | 13 | 8 | 0 | 0 | 15 | 0.3 | clean |
| jscad_ezdxf_small_r13.dxf | DXF R13 | 1 | 2 | 0 | 1 | 0 | 0 | 0 | 4 | 0 | 0 | 6 | 0.3 | rooms open |

#### DXF (from DWG)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| autodesk_blocks_and_tables_-_imperial | DXF 2007 | 1 | 99 | 21 | 27 | 11 | 19 | 11 | 5 | 0 | 0 | 12 | 0.3 | clean |
| draftsperson_house_floor_plan_tutorial | DXF 2013 | 1 | 92 | 31 | 4 | 3 | 32 | 3 | 1 | 0 | 0 | 7 | 0.4 | clean |
| libredwg_example_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_example_2007 | DXF 2007 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_example_2013 | DXF 2013 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_example_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_example_r14 | DXF R14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | no walls |
| libredwg_sample_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| libredwg_sample_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| twindo_Backcountry_1st_Floor_Plan | DXF 2013 | 1 | 86 | 15 | 1 | 0 | 14 | 0 | 9 | 0 | 0 | 19 | 0.3 | clean |
| twindo_Backcountry_2nd_Floor_Plan | DXF 2013 | 1 | 98 | 28 | 11 | 1 | 14 | 1 | 14 | 0 | 0 | 24 | 0.3 | clean |

#### PDF

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qcad_flange.pdf | PDF p1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 4 | 1.1 | picture |
| twindo_Backcountry_2D_Plan.pdf p1 | PDF p1 | 1 | 171 | 5 | 0 | 1 | 43 | 1 | 14 | 0 | 0 | 30 | 0.6 | clean |
| twindo_Backcountry_2D_Plan.pdf p2 | PDF p2 | 1 | 393 | 16 | 0 | 1 | 111 | 1 | 22 | 0 | 0 | 59 | 1.1 | clean |
| twindo_Backcountry_Measurement_Report.pdf p1 | PDF p1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p10 | PDF p10 | 1 | 140 | 2 | 0 | 2 | 36 | 2 | 16 | 0 | 0 | 25 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p11 | PDF p11 | 1 | 117 | 2 | 0 | 2 | 29 | 2 | 13 | 0 | 0 | 20 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p12 | PDF p12 | 1 | 139 | 6 | 0 | 1 | 36 | 1 | 1 | 0 | 0 | 27 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p13 | PDF p13 | 1 | 16 | 0 | 0 | 0 | 0 | 0 | 32 | 0 | 0 | 34 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p14 | PDF p14 | 1 | 281 | 14 | 0 | 2 | 89 | 2 | 16 | 0 | 0 | 31 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p15 | PDF p15 | 1 | 298 | 13 | 0 | 3 | 93 | 3 | 16 | 0 | 0 | 33 | 1.2 | clean |
| twindo_Backcountry_Measurement_Report.pdf p16 | PDF p16 | 1 | 344 | 15 | 0 | 8 | 103 | 8 | 19 | 0 | 0 | 39 | 1.3 | clean |
| twindo_Backcountry_Measurement_Report.pdf p17 | PDF p17 | 1 | 323 | 12 | 0 | 7 | 95 | 7 | 18 | 0 | 0 | 38 | 1.1 | clean |
| twindo_Backcountry_Measurement_Report.pdf p18 | PDF p18 | 1 | 267 | 11 | 0 | 3 | 87 | 3 | 16 | 0 | 0 | 31 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p19 | PDF p19 | 1 | 315 | 13 | 0 | 4 | 102 | 4 | 17 | 0 | 0 | 37 | 1.2 | clean |
| twindo_Backcountry_Measurement_Report.pdf p2 | PDF p2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p20 | PDF p20 | 1 | 305 | 12 | 0 | 7 | 93 | 7 | 18 | 0 | 0 | 36 | 1.1 | clean |
| twindo_Backcountry_Measurement_Report.pdf p21 | PDF p21 | 1 | 340 | 13 | 0 | 5 | 105 | 5 | 21 | 0 | 0 | 42 | 1.1 | clean |
| twindo_Backcountry_Measurement_Report.pdf p22 | PDF p22 | 1 | 352 | 13 | 0 | 6 | 108 | 6 | 18 | 0 | 0 | 38 | 1.2 | clean |
| twindo_Backcountry_Measurement_Report.pdf p3 | PDF p3 | 1 | 152 | 3 | 0 | 1 | 34 | 1 | 15 | 0 | 0 | 33 | 0.7 | clean |
| twindo_Backcountry_Measurement_Report.pdf p4 | PDF p4 | 1 | 6 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 14 | 1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p5 | PDF p5 | 1 | 141 | 4 | 0 | 2 | 37 | 2 | 13 | 0 | 0 | 26 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p6 | PDF p6 | 1 | 128 | 3 | 0 | 5 | 34 | 5 | 18 | 0 | 0 | 27 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p7 | PDF p7 | 1 | 109 | 2 | 0 | 1 | 28 | 1 | 12 | 0 | 0 | 19 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p8 | PDF p8 | 1 | 119 | 2 | 0 | 1 | 30 | 1 | 15 | 0 | 0 | 22 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p9 | PDF p9 | 1 | 187 | 9 | 0 | 1 | 50 | 1 | 14 | 0 | 0 | 30 | 1.4 | picture |

#### DWG

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| autodesk_blocks_and_tables_-_imperial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| draftsperson_house_floor_plan_tutorial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2007.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2013.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_r14.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_1st_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_2nd_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |

#### 3D model

| file | triangles | read s | verdict |
|---|---|---|---|
| threejs_Rhino_Logo.3dm | 131,948 | 0.6 | shape |
| threejs_Cobra_s350.dae | 9,598 | 0.3 | shape |
| kenney_suburban_building-type-a.fbx | 1,174 | 0.3 | shape |
| threejs_exampleWindow.fbx | 44 | 0.3 | shape |
| threejs_monkey.fbx | 970 | 0.3 | shape |
| threejs_nurbs.fbx | — | 0.3 | refused: Could not read threejs_nurbs.fbx: threejs_nurbs.fbx holds no surfaces (lines or curves onl |
| babylon_village.glb | 458 | 0.3 | shape |
| kenney_suburban_building-type-a.glb | 1,174 | 0.3 | shape |
| kenney_suburban_building-type-k.glb | 1,024 | 0.3 | shape |
| threejs_LittlestTokyo.glb | 141,802 | 0.7 | shape |
| kenney_suburban_building-type-a.obj | 2,348 | 0.3 | shape |
| threejs_colored_binary.stl | 2,156 | 0.3 | shape |
| threejs_slotted_disk_ascii.stl | 288 | 0.3 | shape |



Left out: 69 git-lfs pointers (130-byte stand-ins for files not downloaded in this copy of the corpus).
