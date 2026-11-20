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
(`node score.mjs <tag>`, about 12 minutes for all 134 files) and `table.mjs <tag> [<tag before>]` for these tables; raw
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

## Baseline — session 31, branch `s31/formats2` at 7ec8a3b (= s31/redesign 104fd03 + the scoreboard's dev hook)

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

Files with floors (83): 1 714 names, 1 254 named closed rooms, **460 names outside a room, 254 crossings**, 3 984 loose ends, 6 421 review rows.

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

