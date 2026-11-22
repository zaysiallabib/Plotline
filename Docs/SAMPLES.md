# Samples — 53 real buildings' files from the internet, and how Plotline reads each one

**What this is.** The founder asked (2026-11-22): "are you properly focusing on the new formats and not just the old way
of jpeg? if you need samples go to the internet and fetch around 50 examples of buildings with supported file types
which even I can test later." These are those files: 53 real buildings' files in every format the Studio reads, found
on the internet on 2026-11-22, each with its source and its licence read on the source page, each dropped on the real
Studio in Firefox and scored file by file. It is the next formats lane's list: what works, what fails, and why.

**Where they are.** On the office PC, outside the code: `E:/dev/ALTERNATIVE FORMAT TEST/samples-2026-11-22/`, one
folder per download under `ifc/`, `dxf/`, `pdf/`, `svg/`, `model/` (next to the older corpus of the formats scoreboard,
not mixed into it). Any of them can be dropped on the Studio (`/studio`) to see it yourself.

**One click away.** Eight of them — the smallest that anyone may pass on, at least one of each kind — are in the site
itself (`public/samples/`, credits in `public/samples/MANIFEST.md`): in the empty Studio click **Try a sample ▾** under
the dashed box and pick one. They are marked ★ below.

| In the Studio's list | File | What you see |
|---|---|---|
| A flat, 7 rooms (surveyed) · IFC · 415 KB | `flat-7-rooms.ifc` | A project of 2 floors; the flat opens with its 7 named rooms (kitchen, bathrooms, corridor, living room, bedrooms), doors and windows; the second floor is empty |
| IfcOpenHouse, a small house · IFC · 113 KB | `ifcopenhouse.ifc` | One room of 4 walls with its door and windows, and the house's outside shape (roof, stair) for the 3D |
| Two semi-detached houses, ground floor · DXF · 716 KB | `semi-detached-houses-ground.dxf` | Both houses' ground floors: 8 named rooms (kitchens, dining, living, halls), doors with their swings; the stairs come in as blocks of columns |
| An institute office floor · DXF · 25 KB | `institute-office-floor.dxf` | 38 walls with angled pieces, 6 closed rooms, no names (the file has none) |
| A primary school, ground floor · PDF · 237 KB | `primary-school-ground.pdf` | Read as a drawing at the 1 : 200 printed on the sheet: 56 named rooms (reception, classrooms, hall, kitchen…), 79 things to check |
| Casa Steiner, Vienna (Adolf Loos) · PDF · 109 KB | `casa-steiner-ground.pdf` | Becomes the plan picture (set the scale with S, then Auto-trace); its message offers **Read its lines instead** (65 walls, not yet a clean plan) |
| A flat: three rooms, hall, bath · SVG · 33 KB | `flat-three-rooms.svg` | Thick walls, 9 windows and doors with their swings, 6 closed rooms; its three words are left out (they stand in no closed room); the scale is guessed (check with S) |
| A brick apartment building · GLB · 1.2 MB | `apartment-building.glb` | The outside shape only (10 × 6 m, 18 m tall), listed under **Outside shape** on the right; it waits for a drawing to stand round |

**How it was scored — the founder's path.** Firefox (Playwright's build on E:, headless, one browser), the real Studio
at `/studio` from a fresh browser for each file, the file DROPPED on the sheet (a real drop event; a 3D model with the
files beside it in its folder); a PDF of several pages read page by page through **Which page is the floor plan?**, a
page that became the plan picture counted through its **Read its lines instead**; then what the drop gave is counted in
the page with the Studio's own code (each floor as the Studio opens it, its closed rooms, its Issues list). Harness:
`E:/dev/tmp/s31/samples/score.mjs` (the formats scoreboard's `formats3/score.mjs`, pointed at this folder and taking only
the recorded files) and `samples-table.mjs` for these tables; raw results `E:/dev/tmp/s31/samples/runs/final.json`; a
screenshot of every file in `E:/dev/plotline-shots/s31/samples/s1/` (the two PDFs re-read after the fix below in
`…/fix/`). Scored on `s31/redesign` 2860fd0 from a frozen copy, except the two PDF sheets the samples lane's one reader
fix changed (Hannover, Casa Steiner), which were scored again on that fix.

**The one reader fix this lane made.** A sheet that prints its scale the European way (`Scala 1:100`, `M 1:50`,
`Maßstab`, `Échelle`, `Escala`, `Schaal`, `Skala`) or runs it on into the title block (`1 : 100 Datum: 09.04.2013`) is
now read at that scale (`plan2d.ts printedScale`, one rule, tested). Before it, both such sheets among the 53 had nothing
read at all. The Hannover flat now opens as a drawing (100 walls, 18 openings, 7 closed rooms); Casa Steiner reads its
lines on request. Of the 888 PDF pages we have (the formats corpus, the Dhaka brochures, these samples) no other page
reads differently. Nothing else in the readers was changed: the point is the set and the honest scoreboard.

**The columns** are the formats scoreboard's ([FORMATS_SCOREBOARD.md](FORMATS_SCOREBOARD.md)), summed over a file's
floors: *names* (the file's room names in a room), *closed rooms*, *named rooms*, *loose ends* (wall ends joined to
nothing), *crossings* (walls that cross without a shared corner — the 3D breaks there), *names outside a room*, *review
rows* (the Studio's Issues list), *read s* (drop → the drawing on screen). **Verdicts** as there: *clean* = no crossing,
no name outside its room, at least one closed room; *rooms open*; *no walls*; *refused*; *plan picture* (a PDF page that
opened as the picture for Auto-trace); *shape only* (a 3D model: the building's outside, by design). A PDF of several
pages is one row here: its best page's numbers, and how many of its pages opened as drawings.

**Read "clean" with the plain words beside it.** The scoreboard's *clean* does not count loose wall ends, nor texts the
reader left out because they stood in no closed room — a traced scan can be "clean" and still be scattered pieces of
wall. The last column says what a person actually sees; the failure class follows it.

## Totals (files)

| format | files | clean | rooms open | no walls | refused | plan picture | shape only |
|---|---|---|---|---|---|---|---|
| IFC | 21 | 13 | 7 | 1 | 0 | 0 | 0 |
| DXF | 10 | 7 | 2 | 0 | 1 | 0 | 0 |
| PDF | 10 | 4 | 0 | 0 | 0 | 6 | 0 |
| SVG | 6 | 4 | 2 | 0 | 0 | 0 | 0 |
| 3D model | 6 | 0 | 0 | 0 | 0 | 0 | 6 |
| **all** | 53 | 28 | 11 | 1 | 1 | 6 | 6 |

PDF pages: 71 in all — 15 open as drawings, 56 become the plan picture.

**In plain words.** 9 files open as a plan with their rooms named and nothing crossing: the Gaia switch house, both
surveyed flats, the Kleine Wohnung, both Loughborough floors, the LibreCAD basement, the open-source farmhouse's plan
page and the DfE school. 19 more open with closed rooms but no names — mostly because the file has none (structural
models, laser-scan shells, plans without words); 5 of those are mostly scattered pieces of wall (two traced SVG scans,
the Elemental sheet, a structural model, an institute floor drawn with gaps). 11 leave rooms open (walls crossing, or a
name outside its room), 1 has no walls (they are exported as generic pieces), 1 was not read within 5 minutes, 6 PDFs
become the plan picture for Auto-trace (no scale written on the page, words drawn as lines, or walls in the wrong pen),
and the 6 3D models give the outside shape as designed — two of them at toy size, one at a wrong unit.

## The files, format by format

★ = one click away in the Studio (Try a sample ▾). "(test only)" = its licence does not let us pass it on: it stays on this PC.

### IFC (21)

| file | what it is | licence | size | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict | in plain words |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| balconies-a3-de-basis-doorn (a3.ifc) | real new-build residential block De Basis, Doorn (NL) - structural model | CC-BY-4.0 | 8.5 MB | 4 | 1065 | 368 | 64 | 0 | 200 | 0 | 172 | 0 | 0 | 271 | 2.4 | clean | opens as 200 closed rooms, no names in the file on 4 floors; 172 loose wall ends — class *structural* |
| balconies-a4-amstelveen (a4.ifc) | real 10-storey apartment building, Amstelveen (NL) - structural model | CC-BY-4.0 | 1.3 MB | 10 | 328 | 309 | 40 | 0 | 62 | 0 | 106 | 0 | 0 | 188 | 0.9 | clean | opens as 62 closed rooms, no names in the file on 10 floors; 106 loose wall ends — class *structural* |
| balconies-a7-spaarnelicht-amsterdam (a7.ifc) | real apartment building (62 flats), Lindenlaan, Amsterdam - structural model | CC-BY-4.0 | 1.6 MB | 13 | 830 | 146 | 46 | 0 | 28 | 0 | 802 | 0 | 0 | 857 | 1.1 | clean | opens as 28 closed rooms, no names in the file on 13 floors; 802 loose wall ends — mostly scattered pieces — class *structural* |
| bim4eeb-demo-fin (BIM4EEB_DEMONSTRATION_BLDG_FIN.ifc) | real 6-storey apartment block in Finland (EU renovation demo site): outer walls, windows, structure; flat interiors left out for privacy | CC-BY-4.0 | 2.0 MB | 6 | 250 | 319 | 6 | 0 | 8 | 0 | 9 | 0 | 0 | 29 | 1.6 | clean | opens as 8 closed rooms, no names in the file on 6 floors; 9 loose wall ends |
| bim4eeb-demo-pol (BIM4EEB_DEMONSTRATION_BLDG_POL.ifc) | real 5-storey apartment block in Poland (EU renovation demo site): outer walls, windows, slabs; flat interiors left out for privacy | CC-BY-4.0 | 1.3 MB | 5 | 278 | 110 | 0 | 0 | 43 | 0 | 63 | 14 | 0 | 109 | 0.7 | rooms open | rooms open — 14 crossings; 43 closed rooms, no names on 5 floors; 63 loose wall ends — class *count-disagrees* |
| bimwhale-advanced-project (AdvancedProject.ifc) | multistorey apartment building with garage, 6 floors and roof; each flat roughly modelled and furnished (student-made in Revit) | MIT | 44.3 MB | 10 | 2773 | 455 | 0 | 8 | 670 | 7 | 103 | 0 | 1 | 782 | 3 | rooms open | rooms open — 1 name outside a room; 7 of 8 names in their room on 10 floors; 103 loose wall ends — class *name-outside* |
| chek-gaia-switch-house (Gaia_Renovation_Demo_Building.ifc) | real house renovation in Vila Nova de Gaia, Portugal: living room, kitchen, master bedroom, kid rooms, patios, glass veranda, basements | CC-BY-4.0 | 5.9 MB | 5 | 220 | 46 | 74 | 18 | 55 | 18 | 16 | 0 | 0 | 53 | 1 | clean | opens as 18 named rooms and 37 unnamed on 5 floors; 16 loose wall ends |
| encore-edea-caceres (EDEA_experimental_building_renovation_study.ifc) | real experimental dwelling building of the Junta de Extremadura (EDEA), Caceres, Spain - renovation study model | CC-BY-4.0 | 5.5 MB | 4 | 72 | 34 | 11 | 0 | 17 | 0 | 7 | 0 | 0 | 28 | 0.6 | clean | opens as 17 closed rooms, no names in the file on 4 floors; 7 loose wall ends |
| ifcopenhouse-ifc2x3 (IfcOpenHouse_IFC2x3.ifc) | small single-family house with pitched roof, door, windows, stairs (written by code with IfcOpenShell) | CC0-1.0 | 113 KB | 1 | 4 | 4 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0.6 | clean | opens as 1 closed room, no names in the file |
| ifcopenhouse-ifc4 (IfcOpenHouse_IFC4.ifc) ★ | small single-family house with pitched roof, door, windows, stairs (written by code with IfcOpenShell) | CC0-1.0 | 113 KB | 1 | 4 | 4 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 2 | 0.6 | clean | opens as 1 closed room, no names in the file |
| nordic-lca-housing-timber (ARK_NordicLCA_Housing_Timber_As-built_Archicad.ifc) | Finnish multi-storey apartment building (asuinkerrostalo): half service flats for families, half regular family flats, shared ground-floor space | CC-BY-SA-4.0 | 11.5 MB | 8 | 590 | 133 | 66 | 109 | 172 | 104 | 27 | 0 | 5 | 77 | 2.2 | rooms open | rooms open — 5 names outside a room; 104 of 109 names in their room on 8 floors; 27 loose wall ends — class *name-outside* |
| nordic-lca-office-concrete (ARK_NordicLCA_Office_Concrete_BuildingPermit_Archicad.ifc) | Finnish office building: ground-floor restaurant, meeting space and office hub, three office floors, garage and basement | CC-BY-SA-4.0 | 39.0 MB | 9 | 4125 | 502 | 383 | 291 | 845 | 202 | 48 | 2414 | 89 | 2661 | 367.7 | rooms open | rooms open — 89 names outside a room, 2,414 crossings; 202 of 291 names in their room on 9 floors; 48 loose wall ends — class *huge-ifc*, *count-disagrees* |
| oimr-azuma-house (AZUMA9.ifc) | real house: Tadao Ando row house with central patio, Osaka (1976) - student reconstruction | none stated (test only) | 10.5 MB | 3 | 0 | 0 | 4 | 9 | 10 | 9 | 0 | 0 | 0 | 5 | 1.3 | no walls | no walls: 3 floors with rooms and names but nothing standing — class *proxy-walls* |
| oimr-svaleveien-8-hus-a (Svaleveien_8_Hus_A.ifc) | real detached two-storey house project in Norway (rooms STUE, SOV., BAD, KJOKKEN / SPIS, WALK-IN...) | none stated (test only) | 12.1 MB | 3 | 109 | 29 | 0 | 15 | 31 | 13 | 12 | 0 | 2 | 19 | 1.3 | rooms open | rooms open — 2 names outside a room; 13 of 15 names in their room on 3 floors; 12 loose wall ends — class *name-outside* |
| sum4re-den-haag-donor (Donor.ifc) | real existing building in The Hague (NL), garage + 3 floors, modelled as-built from LiDAR for urban mining | CC-BY-4.0 | 3.6 MB | 4 | 122 | 132 | 8 | 0 | 21 | 0 | 9 | 0 | 0 | 34 | 0.9 | clean | opens as 21 closed rooms, no names in the file on 4 floors; 9 loose wall ends |
| sum4re-hololens-apartment-c (apartmentC_HL2_reference.ifc) ★ | real flat (7 rooms) modelled by hand from a HoloLens 2 survey, SUM4Re project, Spain | CC-BY-4.0 | 415 KB | 2 | 43 | 12 | 0 | 7 | 8 | 7 | 0 | 0 | 0 | 3 | 0.6 | clean | opens as 7 named rooms and 1 unnamed on 2 floors |
| sum4re-hololens-apartment-d (apartmentD_HL2_reference.ifc) | real flat (11 rooms) modelled by hand from a HoloLens 2 survey, SUM4Re project, Spain | CC-BY-4.0 | 1.1 MB | 2 | 55 | 19 | 0 | 11 | 11 | 11 | 0 | 0 | 0 | 2 | 0.6 | clean | opens as 11 named rooms on 2 floors |
| sum4re-longyearbyen (Longyearbyen.ifc) | real existing 2-storey building in Longyearbyen, Svalbard (NO), modelled as-built from LiDAR | CC-BY-4.0 | 1.5 MB | 2 | 87 | 46 | 0 | 0 | 14 | 0 | 15 | 0 | 0 | 31 | 0.6 | clean | opens as 14 closed rooms, no names in the file on 2 floors; 15 loose wall ends |
| tuwien-vienna-realworld (RealWorldTestModel-EscapeRouteAnalysis-ZDB-v2.ifc) | real apartment building in Vienna (2 basement garage levels, ground, upper and attic floors; flats with Zimmer, Bad, Wohnkueche, Terrasse) | CC-BY-4.0 | 13.5 MB | 7 | 640 | 106 | 8 | 110 | 197 | 110 | 15 | 7 | 0 | 49 | 1.7 | rooms open | rooms open — 7 crossings; 110 of 110 names in their room on 7 floors; 15 loose wall ends — class *count-disagrees* |
| webifc-kleine-wohnung-r22 (kleine_Wohnung_R22.ifc) | small German apartment house: basement UG01, OG01, OG02, attic DG03, 28 rooms | MPL-2.0 (repository licence only) (test only) | 10.2 MB | 4 | 531 | 151 | 0 | 28 | 129 | 28 | 29 | 0 | 0 | 125 | 1.3 | clean | opens as 28 named rooms and 101 unnamed on 4 floors; 29 loose wall ends |
| webifc-ltu-a-house (LTU_A-House_redesign.ifczip) | real university building A at Lulea University of Technology, Sweden (redesign model) | MPL-2.0 (repository licence only) (test only) | 35.5 MB | 5 | 8735 | 1565 | 907 | 0 | 1830 | 0 | 82 | 4561 | 0 | 5609 | 46.6 | rooms open | rooms open — 4,561 crossings; 1,830 closed rooms, no names on 5 floors; 82 loose wall ends — class *count-disagrees* |

### DXF (10)

| file | what it is | licence | size | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict | in plain words |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| archicad-first-floor-plan-almajd (texts-in-block.dxf) | residential first-floor plan (villa/house, 'AL MAJD' furniture layer) with columns, doors, windows, furniture; scale 1/100 | MIT (repo) - drawing's origin not stated (test only) | 349 KB | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.3 | rooms open | rooms open — no closed room; 0 closed rooms, no names; 2 texts in no closed room (left out), 6 loose wall ends — mostly scattered pieces — class *plan-in-block* |
| bc-apartment-block-floor-a000217 (A_000217.dxf) | multi-unit residential building floor: double-loaded corridor, units A3...G with kitchen / ensuite / master bedroom / living-dining / patio, stairs, fire separations, wall-type legend | GPL-3.0 (repo) (test only) | 3.7 MB | 1 | 12 | 1 | 0 | 0 | 0 | 0 | 14 | 0 | 0 | 16 | 1.2 | rooms open | rooms open — no closed room; 0 closed rooms, no names; 102 texts in no closed room (left out), 14 loose wall ends — mostly scattered pieces — class *unit-guess-dxf* |
| ceco-net-house-tm53 (Ceco.NET-Architecture-Tm-53.dxf) | small detached house: floor plan with hall, kitchen, roof projection, dimensions, site levels and plants | MIT (repo) - drawing's own terms not stated (test only) | 537 KB | 1 | 169 | 7 | 0 | 0 | 27 | 0 | 26 | 0 | 0 | 39 | 0.3 | clean | opens as 27 closed rooms, none named; 9 texts in no closed room (left out), 26 loose wall ends — class *rooms-dont-close* |
| ijs-uwb-env0-rooms (floorplan.dxf) | institute building, part of a floor: rooms around a pentagonal room with 45-degree walls (Jozef Stefan Institute) | CC-BY-4.0 | 22 KB | 1 | 17 | 1 | 0 | 0 | 1 | 0 | 9 | 0 | 0 | 11 | 0.3 | clean | opens as 1 closed room, no names in the file; 9 loose wall ends — mostly scattered pieces — class *rooms-dont-close* |
| ijs-uwb-env3-office-floor (floorplan.dxf) ★ | institute / office building floor: ~14 rooms off a corridor, double-line walls incl. angled wall segments (Jozef Stefan Institute, Ljubljana) | CC-BY-4.0 | 25 KB | 1 | 38 | 1 | 0 | 0 | 6 | 0 | 9 | 0 | 0 | 17 | 0.3 | clean | opens as 6 closed rooms, no names in the file; 9 loose wall ends |
| lboro-matched-pair-semi-detached-houses (Internal_First.dxf) | pair of real 1930s-style semi-detached houses (Loughborough University test houses, UK), first floor: bedrooms, bathroom, WC, landing, stairs | CC-BY-4.0 | 610 KB | 1 | 52 | 15 | 24 | 9 | 11 | 9 | 10 | 0 | 0 | 13 | 0.3 | clean | opens as 9 named rooms and 2 unnamed; 4 texts in no closed room (left out), 10 loose wall ends |
| lboro-matched-pair-semi-detached-houses (Internal_Ground.dxf) ★ | pair of real 1930s-style semi-detached houses (Loughborough University test houses, UK), ground floor: hall, kitchen, dining, stairs | CC-BY-4.0 | 716 KB | 1 | 62 | 14 | 32 | 8 | 22 | 8 | 1 | 0 | 0 | 14 | 0.3 | clean | opens as 8 named rooms and 14 unnamed; 4 texts in no closed room (left out), 1 loose wall end |
| librecad-house-basement-remodel (basement_plan.dxf) | detached house basement (US): partition walls, foundation, stairs, doors, glass-block windows, bathroom with shower, utility, plumbing / heating / lighting layers, dimensions | CC-BY-4.0 | 173 KB | 1 | 59 | 7 | 0 | 3 | 8 | 3 | 11 | 0 | 0 | 16 | 0.3 | clean | opens as 3 named rooms and 5 unnamed; 102 texts in no closed room (left out), 11 loose wall ends |
| ucl-uk-tech-office-hq-plans (plans_clean.dxf) | office building (UK headquarters of a global technology company): floors 2, 3, 4 and 10 with walls, doors, desk panels, furniture and numbered seats | CC0-1.0 | 23.6 MB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | refused | refused: not read after 300 s — class *too-slow-dxf* |
| zamani-kua-ruins-house-3 (house_3_Kua_3_Layout.dxf) | ruined Swahili coral-stone house (domestic structure), Kua, Juani Island, Tanzania: standing walls, niches, other structures, scale bar, true-north arrow | CC-BY-NC-4.0 (test only) | 201 KB | 1 | 83 | 6 | 0 | 1 | 21 | 1 | 11 | 0 | 0 | 27 | 0.3 | clean | opens as 1 named room and 20 unnamed; 4 texts in no closed room (left out), 11 loose wall ends |

### PDF (10)

| file | what it is | licence | size | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict | in plain words |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| amatect-farmhouse-set (Farmhouse_Drawing_Set_V-001.pdf) | two-storey detached house, open-source construction set based on a real derelict Virginia farmhouse: site, foundation, 1st and 2nd floor plans, roof, RCP/electrical, elevations, sections, details, schedules | CC-BY-SA-3.0 | 2.7 MB | 1 | 223 | 11 | 0 | 24 | 78 | 24 | 5 | 0 | 0 | 14 | 1 | clean | page 16 of 25: opens as 24 named rooms and 54 unnamed; 31 texts in no closed room (left out), 5 loose wall ends; 12 of 25 pages open as drawings, 13 become the plan picture |
| cmhc-ontario-fourplex-02 (on_fourplex_02.pdf) | two-storey fourplex (4 flats), Government of Canada Housing Design Catalogue design for Ontario; ground + second floor plans with furniture, room numbers, scale bars | none stated (CMHC website terms, all rights reserved) (test only) | 434 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | picture | page 1 of 3: becomes the plan picture for Auto-trace (no scale on the page: its lines are not read); 0 of 3 pages open as drawings, 3 become the plan picture — class *no-scale-words* |
| dfe-primary-school-model (PRI-DFE-XX-00-D-X-0201-Primary_School_GA_Plan_Level_00-A-C01.pdf) ★ | primary school with nursery (UK Department for Education model / pattern-book design, 2026), ground floor general arrangement 1:200 on A2 | OGL-UK-3.0 | 237 KB | 1 | 1368 | 27 | 0 | 56 | 526 | 56 | 10 | 0 | 0 | 79 | 3.6 | clean | opens as 56 named rooms and 470 unnamed; 27 texts in no closed room (left out), 10 loose wall ends |
| elemental-quinta-monroy (ELEMENTAL-QUINTA-MONROY-ARQ.pdf) | incremental social housing, 93 units (stacked two/three-storey houses), Iquique, Chile, 2003-2004, ELEMENTAL / Alejandro Aravena: first-floor plan, second+third floor plan, facades, sections at 1:50 | none stated as an open licence (ELEMENTAL Some Rights Reserved: use as a guide for new housing projects) (test only) | 2.4 MB | 1 | 441 | 94 | 0 | 0 | 51 | 0 | 222 | 0 | 0 | 271 | 4.3 | clean | page 3 of 5: opens as 51 closed rooms, none named; 104 texts in no closed room (left out), 222 loose wall ends — mostly scattered pieces; 1 of 5 pages open as drawings, 4 become the plan picture — class *not-a-clean-plan* |
| hannover-pagenstrasse-2 (Grundriss_Pagenstr._2,_Hannover.pdf) | listed residential + commercial building (c. 1908), Hannover, Germany; typical upper floor (1. Obergeschoss) with one flat and the stair | CC-BY-SA-3.0 | 27 KB | 1 | 100 | 18 | 0 | 1 | 17 | 1 | 12 | 0 | 0 | 21 | 0.7 | clean | opens as 1 named room and 16 unnamed; 28 texts in no closed room (left out), 12 loose wall ends |
| ireland-mmc-apartment-a1-3d (A1-3D APARTMENT 22 3B-5P-1S.pdf) | 3-bedroom / 5-person single-storey apartment (Irish social-housing standard internal layout for modern methods of construction, Design Manual for Quality Housing): rooms with names and areas, furniture, dimension chains in mm, area table | IE-PSI re-use terms (Department of Housing): free re-use with attribution | 134 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.9 | picture | becomes the plan picture for Auto-trace (no scale on the page: its lines are not read) — class *bare-mm-dimensions* |
| loos-steiner-house-ground-floor (Pianta_piano_terra_rialzato,_Casa_Steiner,_Adolf_Loos.pdf) ★ | detached family house (Haus Steiner, Vienna, 1910, architect Adolf Loos): raised ground floor with kitchen, pantry, library, dining, salon, winter garden, terrace, pool, spiral + main stair | CC0-1.0 | 109 KB | 1 | 65 | 29 | 0 | 1 | 5 | 1 | 25 | 0 | 0 | 27 | 0.9 | picture | becomes the plan picture for Auto-trace (its lines on request: 65 walls, 5 closed rooms) — class *grey-fill-walls* |
| newburn-flats-unit (Newburn_Flats_Floor_Plan.pdf) | one flat of the Newburn Flats apartment block (1941, Melbourne, architect Frederick Romberg): bedroom, living, kitchen, dining, bath, curved balcony, angled outer walls | CC-BY-SA-3.0 (dual GFDL-1.2+) | 737 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | picture | becomes the plan picture for Auto-trace (no scale on the page: its lines are not read) — class *no-scale-words* |
| nist-nzertf-house (nzertf-fireplumbelecmech-plans-june2011.pdf) | two-storey detached house with basement and attic (NIST NZERTF test house, Gaithersburg MD), construction drawing set | none stated (title block: Copyright 2009 Building Science Corporation) (test only) | 6.4 MB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.9 | picture | page 1 of 32: becomes the plan picture for Auto-trace (no scale on the page: its lines are not read); 0 of 32 pages open as drawings, 32 become the plan picture — class *words-as-lines* |
| nps-arlington-house-first-floor (ARHOmap1.pdf) | historic mansion (1802-1818), Arlington, Virginia, with its two slave-quarters / summer-kitchen outbuildings: first floor with room names, portico columns, stairs | PD-USGov | 354 KB | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | picture | becomes the plan picture for Auto-trace (no scale on the page: its lines are not read) — class *no-scale-words* |

### SVG (6)

| file | what it is | licence | size | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict | in plain words |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bolduc-house-ste-genevieve (Bolduc_House_Floor_Plan--Ste_Genevieve_MO.svg) | c.1740/1785 French colonial house (Bolduc House), measured drawing by the US Historic American Buildings Survey: rooms, porches, dimension strings, scale bar, title block | PD-USGov | 2.7 MB | 1 | 3 | 3 | 0 | 0 | 0 | 0 | 4 | 0 | 0 | 6 | 0.3 | rooms open | rooms open — no closed room; 0 closed rooms, no names; 4 loose wall ends — mostly scattered pieces — class *traced-scan-svg* |
| bratislava-mileticova-12-tower (Podorys_mileticova12.svg) | 1957 residential tower block (architect Karol Palus), Mileticova 12, Bratislava: four flats around a stair/lift core, thick walls as filled bands, door swings, scale bar 0-10 m | CC-BY-3.0 | 99 KB | 1 | 130 | 3 | 0 | 0 | 10 | 0 | 116 | 0 | 0 | 119 | 0.3 | clean | opens as 10 closed rooms, none named; 3 texts in no closed room (left out), 116 loose wall ends — mostly scattered pieces — class *traced-scan-svg* |
| milano-qt8-ina-casa (Milano_QT8_edificio_INA-Casa_pianta.svg) | Post-war INA-Casa apartment block in the QT8 quarter, Milan (architects Pietro Lingeri and Luigi Zuccoli): whole typical floor | CC-BY-SA-3.0 | 538 KB | 1 | 564 | 86 | 15 | 0 | 165 | 0 | 62 | 0 | 0 | 106 | 0.8 | clean | opens as 165 closed rooms, none named; 4 texts in no closed room (left out), 62 loose wall ends — class *rooms-dont-close* |
| rzut-budynku-flat-fragment (Rzut_budynku.svg) ★ | Fragment of a residential building: one flat with three rooms, hall, bath and WC, drawn as an architect sheet at 1:50 (thick black walls, window symbols, door swings, title text) | CC-BY-SA-3.0 | 33 KB | 1 | 44 | 9 | 0 | 0 | 6 | 0 | 10 | 0 | 0 | 15 | 0.3 | clean | opens as 6 closed rooms, none named; 3 texts in no closed room (left out), 10 loose wall ends |
| vandergrift-bungalow-1925 (063_The_Vandergrift_1925_floor_plan.svg) | One-storey bungalow design from the 1925 "Pennsylvania Homes" catalogue; Inkscape vector, room names drawn as outlines | Public domain | 408 KB | 1 | 38 | 5 | 0 | 0 | 2 | 0 | 32 | 0 | 0 | 35 | 0.3 | clean | opens as 2 closed rooms, no names in the file; 32 loose wall ends — mostly scattered pieces — class *traced-scan-svg* |
| warm-springs-little-white-house (Little_White_House_floor_plan.svg) | Little White House of Franklin D. Roosevelt (1932 cottage), Warm Springs, Georgia: bedrooms, living room, entrance hall, kitchen, sun deck; coloured room fills with room names as text | PD (released by author) | 167 KB | 1 | 117 | 3 | 2 | 0 | 0 | 0 | 121 | 0 | 0 | 124 | 0.3 | rooms open | rooms open — no closed room; 0 closed rooms, no names; 121 loose wall ends — mostly scattered pieces — class *diagram-svg* |

### 3D model (6)

| file | what it is | licence | size | triangles | read s | verdict | in plain words |
|---|---|---|---|---|---|---|---|
| 3dbag-delft-tile-9-284-556 (9-284-556-LoD22-3D.obj) | 1,212 real buildings of a Delft (NL) neighbourhood incl. 1950s apartment blocks and row houses, LoD2.2 roof shapes, one 'o' object per building | CC-BY-4.0 | 4.8 MB | 99,661 | 1.3 | shape | the outside shape only, 1.1 × 0.1 m, 1.2 m tall — class *unit-guess-model* |
| macky-auditorium-kmz/files (CU Macky.dae) | Macky Auditorium, University of Colorado Boulder (1923 historic university building with towers), photo-textured SketchUp model | CC-BY-4.0 (page footer only; file not licensed separately) (test only) | 268 KB | 2,684 | 0.3 | shape | the outside shape only, 70.0 × 71.4 m, 34.6 m tall |
| macky-auditorium-kmz (MackyBldg.kmz) | Macky Auditorium, University of Colorado Boulder (1923 historic university building with towers), photo-textured SketchUp model | CC-BY-4.0 (page footer only; file not licensed separately) (test only) | 225 KB | 2,684 | 0.4 | shape | the outside shape only, 70.0 × 71.4 m, 34.6 m tall — class *kmz-pictures* |
| nasa-headquarters-building (Headquarters_Building.glb) | NASA Headquarters office building (Two Independence Square, Washington DC), simple massing model, 89 meshes, no textures | PD-USGov | 213 KB | 21,532 | 0.3 | shape | the outside shape only, 7.8 × 4.3 m, 9.1 m tall — class *toy-size-model* |
| nasa-vehicle-assembly-building (Vehicle_Assembly_Building_VAB.glb) | Vehicle Assembly Building, Kennedy Space Center, Florida (1966, 160 m tall historic landmark), textured exterior model | PD-USGov | 6.5 MB | 6,458 | 0.8 | shape | the outside shape only, 15.0 × 21.3 m, 13.7 m tall — class *toy-size-model* |
| polygoogle-apartment-building (Apartment_building.glb) ★ | New York style six-storey brick walk-up apartment building with fire escape, textured low-poly model (2,088 triangles, one embedded texture) | CC-BY-3.0 | 1.2 MB | 2,088 | 0.3 | shape | the outside shape only, 10.3 × 5.8 m, 18.1 m tall |

## Failure classes, counted — the next formats lane's list

Each failing (or "clean" but broken) file's class, most files first. A file can have two.

- **count-disagrees** (4): Walls cross once the floor opens in the Studio although the reader's own note says "0 crossings left" — the reader's count and the Studio's disagree (an IFC; look at what the Studio's load does to the reader's joined walls). Files: bim4eeb-demo-pol, tuwien-vienna-realworld, webifc-ltu-a-house, nordic-lca-office-concrete.
- **name-outside** (3): A few of the file's room names stand outside a closed room (walls that stop short of each other, or an open space the file does not divide). Files: bimwhale-advanced-project, nordic-lca-housing-timber, oimr-svaleveien-8-hus-a.
- **structural** (3): A structural engineer's model (walls, slabs, columns; no doors, windows or room names): the walls open, there is nothing to name, many wall ends stay loose. Files: balconies-a3-de-basis-doorn, balconies-a4-amstelveen, balconies-a7-spaarnelicht-amsterdam.
- **rooms-dont-close** (3): Walls are read but leave gaps, so rooms do not close and the file's names fall outside them ("text stood in no closed room"). Files: ceco-net-house-tm53, ijs-uwb-env0-rooms, milano-qt8-ina-casa.
- **traced-scan-svg** (3): A scan traced into vector outlines (one long outline for everything, room names drawn as shapes): no line pairs to read as walls, so the walls come out as scattered pieces. Files: bolduc-house-ste-genevieve, bratislava-mileticova-12-tower, vandergrift-bungalow-1925.
- **no-scale-words** (3): No scale printed as words on the page (no scale note, no dimension with a unit, no room size): its lines are not read and the page becomes the plan picture for Auto-trace. Files: cmhc-ontario-fourplex-02, nps-arlington-house-first-floor, newburn-flats-unit.
- **toy-size-model** (2): The model is made at toy size (a 100 m building 8–21 m across): its numbers are not real metres, a person sets the size. Files: nasa-headquarters-building, nasa-vehicle-assembly-building.
- **huge-ifc** (1): A very big IFC (39 MB): 6 minutes to read, things that are not walls drawn as thick black blocks, thousands of crossings. Files: nordic-lca-office-concrete.
- **proxy-walls** (1): The walls are exported as generic pieces (IfcBuildingElementProxy, a student's Revit export), so no wall is read: the rooms and names come, the walls do not. Files: oimr-azuma-house.
- **plan-in-block** (1): The whole plan sits inside one block reference (an INSERT inside an INSERT, as an ArchiCAD export writes it): the reader takes only the 4 loose lines outside it. Files: archicad-first-floor-plan-almajd.
- **unit-guess-dxf** (1): No unit in the file and the guess is wrong: a feet-and-inches drawing read as millimetres (the plan comes out 4.1 m across), so almost no walls pair up. Files: bc-apartment-block-floor-a000217.
- **too-slow-dxf** (1): A 23.6 MB DXF (four office floors as blocks, 2,135 seat numbers) is not read in 5 minutes. Files: ucl-uk-tech-office-hq-plans.
- **diagram-svg** (1): A diagram rather than an architect's sheet: walls as single thin lines, room names drawn as letter outlines — the letters are read as tiny walls, the rooms do not close. Files: warm-springs-little-white-house.
- **words-as-lines** (1): A CAD print whose words are drawn as lines (AutoCAD's SHX fonts): no scale or name can be read as text, so every page becomes the plan picture. Files: nist-nzertf-house.
- **bare-mm-dimensions** (1): Dimensions printed as bare numbers in millimetres ("3380", no unit) and no scale note: not taken as dimensions, no scale found, the page becomes the plan picture. Files: ireland-mmc-apartment-a1-3d.
- **grey-fill-walls** (1): Walls drawn as grey fills while the thicker black pen is something else (stairs, symbols): the pen rule takes the black lines as walls, so the lines read on request are the wrong ones. Files: loos-steiner-house-ground-floor.
- **not-a-clean-plan** (1): Lines read at a proper scale, but they do not make a clean plan (hatching, furniture, several drawings on one sheet): the page becomes the plan picture, its lines one click away. Files: elemental-quinta-monroy.
- **unit-guess-model** (1): A model with no unit, guessed wrong: a 1.2 km city tile in metres read as millimetres (1.18 m across). Files: 3dbag-delft-tile-9-284-556.
- **kmz-pictures** (1): A KMZ (SketchUp / Google Earth) whose pictures inside it are not found: the shape comes without its 20 pictures (the same model as a .dae beside its pictures keeps them). Files: macky-auditorium-kmz.

## Where each file came from

| file | source page (licence read there) | author | licence | free to pass on | fetched |
|---|---|---|---|---|---|
| dxf/archicad-first-floor-plan-almajd/texts-in-block.dxf | https://github.com/bjnortier/dxf/blob/master/LICENSE | unknown architect (contributed to bjnortier/dxf as a bug sample) | MIT (repo) - drawing's origin not stated | no | 2026-11-22 |
| dxf/bc-apartment-block-floor-a000217/A_000217.dxf | https://github.com/dotoritos-kim/dxf-json | unknown Canadian architect (sample file in dotoritos-kim/dxf-json) | GPL-3.0 (repo) | no | 2026-11-22 |
| dxf/ceco-net-house-tm53/Ceco.NET-Architecture-Tm-53.dxf | https://github.com/bjnortier/dxf/blob/master/LICENSE | Ceco.NET (drawing); test-resource of bjnortier/dxf (Ben Nortier) | MIT (repo) - drawing's own terms not stated | no | 2026-11-22 |
| dxf/ijs-uwb-env0-rooms/floorplan.dxf | https://zenodo.org/records/8280736 | Klemen Bregar, Institut Jozef Stefan | CC-BY-4.0 | yes | 2026-11-22 |
| dxf/ijs-uwb-env3-office-floor/floorplan.dxf | https://zenodo.org/records/8280736 | Klemen Bregar, Institut Jozef Stefan | CC-BY-4.0 | yes | 2026-11-22 |
| dxf/lboro-matched-pair-semi-detached-houses/Internal_First.dxf | https://repository.lboro.ac.uk/articles/dataset/Prediction_of_overheating_in_synthetically_occupied_UK_homes_dataset_for_validating_dynamic_thermal_models_of_buildings/8094575 | Ben M Roberts, David Allinson, Kevin Lomas (Loughborough University) | CC-BY-4.0 | yes | 2026-11-22 |
| dxf/lboro-matched-pair-semi-detached-houses/Internal_Ground.dxf | https://repository.lboro.ac.uk/articles/dataset/Prediction_of_overheating_in_synthetically_occupied_UK_homes_dataset_for_validating_dynamic_thermal_models_of_buildings/8094575 | Ben M Roberts, David Allinson, Kevin Lomas (Loughborough University) | CC-BY-4.0 | yes | 2026-11-22 |
| dxf/librecad-house-basement-remodel/basement_plan.dxf | https://runlevel-6.github.io/posts/12 | Ken Zahorec (runlevel-6 blog) | CC-BY-4.0 | yes | 2026-11-22 |
| dxf/ucl-uk-tech-office-hq-plans/plans_clean.dxf | https://zenodo.org/records/4677482 | Kerstin Sailer, Petros Koutsolampros, Rosica Pachilova (University College London) | CC0-1.0 | yes | 2026-11-22 |
| dxf/zamani-kua-ruins-house-3/house_3_Kua_3_Layout.dxf | https://doi.org/10.25375/uct.34754742.v2 (ZivaHub item https://zivahub.uct.ac.za/articles/figure/Plans_of_a_3D_Model_of_House_3_at_Kua_Ruins/34754742) | Heinz Ruther, Ralph Schroder, Roshan Bhurtha, Stephen Wessels, Bruce McDonald (Zamani Project, University of Cape Town) | CC-BY-NC-4.0 | no | 2026-11-22 |
| ifc/balconies-a3-de-basis-doorn/a3.ifc | https://zenodo.org/records/5047709 | Thomas Krijnen & Geert Hesselink (dataset); original Dutch structural engineers | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/balconies-a4-amstelveen/a4.ifc | https://zenodo.org/records/5047709 | Thomas Krijnen & Geert Hesselink (dataset); original Dutch structural engineers | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/balconies-a7-spaarnelicht-amsterdam/a7.ifc | https://zenodo.org/records/5047709 | Thomas Krijnen & Geert Hesselink (dataset); original Dutch structural engineers | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/bim4eeb-demo-fin/BIM4EEB_DEMONSTRATION_BLDG_FIN.ifc | https://zenodo.org/records/6685810 | BIM4EEB Project (EU H2020) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/bim4eeb-demo-pol/BIM4EEB_DEMONSTRATION_BLDG_POL.ifc | https://zenodo.org/records/6685810 | BIM4EEB Project (EU H2020) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/bimwhale-advanced-project/AdvancedProject.ifc | https://github.com/andrewisen/bim-whale-ifc-samples/blob/main/LICENSE | Andre Wisen | MIT | yes | 2026-11-22 |
| ifc/chek-gaia-switch-house/Gaia_Renovation_Demo_Building.ifc | https://zenodo.org/records/17419355 | Stojanov, Martinez, Muro, Gonzalez (CHEK project, EU Horizon Europe 101058559); model by SIA.architects | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/encore-edea-caceres/EDEA_experimental_building_renovation_study.ifc | https://zenodo.org/records/6777933 | Francesco Spegni, Massimo Vaccarini, Alessandro Carbonari (Univpm, Encore project) with JEA | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/ifcopenhouse-ifc2x3/IfcOpenHouse_IFC2x3.ifc | https://github.com/aothms/IfcOpenHouse/blob/master/LICENSE | Thomas Krijnen (aothms), IfcOpenShell | CC0-1.0 | yes | 2026-11-22 |
| ifc/ifcopenhouse-ifc4/IfcOpenHouse_IFC4.ifc | https://github.com/aothms/IfcOpenHouse/blob/master/LICENSE | Thomas Krijnen (aothms), IfcOpenShell | CC0-1.0 | yes | 2026-11-22 |
| ifc/nordic-lca-housing-timber/ARK_NordicLCA_Housing_Timber_As-built_Archicad.ifc | https://cris.vtt.fi/en/publications/bim-files-to-download/ | Nordic Sustainable Construction programme (Nordic LCA case buildings; VTT / Gravicon architects) | CC-BY-SA-4.0 | yes | 2026-11-22 |
| ifc/nordic-lca-office-concrete/ARK_NordicLCA_Office_Concrete_BuildingPermit_Archicad.ifc | https://cris.vtt.fi/en/publications/bim-files-to-download/ | Nordic Sustainable Construction programme (Nordic LCA case buildings; VTT / Gravicon architects) | CC-BY-SA-4.0 | yes | 2026-11-22 |
| ifc/oimr-azuma-house/AZUMA9.ifc | https://openifcmodel.cs.auckland.ac.nz/Model | student (mathi), French Revit template; Open IFC Model Repository model id 199 | none stated | no | 2026-11-22 |
| ifc/oimr-svaleveien-8-hus-a/Svaleveien_8_Hus_A.ifc | https://openifcmodel.cs.auckland.ac.nz/Model | Architect (Vectorworks Architect 2018 export); uploaded to the Open IFC Model Repository, model id 190 | none stated | no | 2026-11-22 |
| ifc/sum4re-den-haag-donor/Donor.ifc | https://zenodo.org/records/23808860 | Balado Frias, Navares Vazquez, Garcia Moll, Fernandez Copons, Sanchez Rodriguez, Arias (SUM4Re project) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/sum4re-hololens-apartment-c/apartmentC_HL2_reference.ifc | https://zenodo.org/records/24345251 | Fernandez Copons, Navares Vazquez, Arias, Balado Frias (SUM4Re) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/sum4re-hololens-apartment-d/apartmentD_HL2_reference.ifc | https://zenodo.org/records/24345251 | Fernandez Copons, Navares Vazquez, Arias, Balado Frias (SUM4Re) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/sum4re-longyearbyen/Longyearbyen.ifc | https://zenodo.org/records/23808860 | Balado Frias, Navares Vazquez, Garcia Moll, Fernandez Copons, Sanchez Rodriguez, Arias (SUM4Re project) | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/tuwien-vienna-realworld/RealWorldTestModel-EscapeRouteAnalysis-ZDB-v2.ifc | https://researchdata.tuwien.ac.at/records/wzp90-dmf60 | TU Wien Research Unit Digital Building Process | CC-BY-4.0 | yes | 2026-11-22 |
| ifc/webifc-kleine-wohnung-r22/kleine_Wohnung_R22.ifc | https://github.com/ThatOpen/engine_web-ifc/blob/main/LICENSE.md | unknown; test file in That Open Company web-ifc repository | MPL-2.0 (repository licence only) | no | 2026-11-22 |
| ifc/webifc-ltu-a-house/LTU_A-House_redesign.ifczip | https://github.com/ThatOpen/engine_web-ifc/blob/main/LICENSE.md | unknown; test file in That Open Company web-ifc repository | MPL-2.0 (repository licence only) | no | 2026-11-22 |
| model/3dbag-delft-tile-9-284-556/9-284-556-LoD22-3D.obj | https://docs.3dbag.nl/en/copyright/ | 3D geoinformation research group (TU Delft) and 3DGI | CC-BY-4.0 | yes | 2026-11-22 |
| model/macky-auditorium-kmz/files/CU Macky.dae | https://developers.google.com/kml/documentation/models | Noel Nemcik (SketchUp model, per doc.kml); published by Google in the KML developer documentation | CC-BY-4.0 (page footer only; file not licensed separately) | no | 2026-11-22 |
| model/macky-auditorium-kmz/MackyBldg.kmz | https://developers.google.com/kml/documentation/models | Noel Nemcik (SketchUp model, per doc.kml); published by Google in the KML developer documentation | CC-BY-4.0 (page footer only; file not licensed separately) | no | 2026-11-22 |
| model/nasa-headquarters-building/Headquarters_Building.glb | https://github.com/nasa/NASA-3D-Resources | NASA/Ames Research Center | PD-USGov | yes | 2026-11-22 |
| model/nasa-vehicle-assembly-building/Vehicle_Assembly_Building_VAB.glb | https://github.com/nasa/NASA-3D-Resources | NASA / Michael D. Carbajal | PD-USGov | yes | 2026-11-22 |
| model/polygoogle-apartment-building/Apartment_building.glb | https://poly.pizza/m/01lqee-dZAr | Poly by Google | CC-BY-3.0 | yes | 2026-11-22 |
| pdf/amatect-farmhouse-set/Farmhouse_Drawing_Set_V-001.pdf | https://commons.wikimedia.org/wiki/File:Farmhouse_Drawing_Set_V-001.pdf | Amatect (Wikimedia Commons user, amatect.com) | CC-BY-SA-3.0 | yes | 2026-11-22 |
| pdf/cmhc-ontario-fourplex-02/on_fourplex_02.pdf | https://www.cmhc-schl.gc.ca/about-us/terms-conditions | CMHC / Housing, Infrastructure and Communities Canada | none stated (CMHC website terms, all rights reserved) | no | 2026-11-22 |
| pdf/dfe-primary-school-model/PRI-DFE-XX-00-D-X-0201-Primary_School_GA_Plan_Level_00-A-C01.pdf | https://www.gov.uk/government/publications/a-new-model-design-for-a-primary-school | UK Department for Education | OGL-UK-3.0 | yes | 2026-11-22 |
| pdf/elemental-quinta-monroy/ELEMENTAL-QUINTA-MONROY-ARQ.pdf | https://www.elementalchile.cl/downloads/quinta-monroy-housing-plans | ELEMENTAL | none stated as an open licence (ELEMENTAL Some Rights Reserved: use as a guide for new housing projects) | no | 2026-11-22 |
| pdf/hannover-pagenstrasse-2/Grundriss_Pagenstr._2,_Hannover.pdf | https://commons.wikimedia.org/wiki/File:Grundriss_Pagenstr._2,_Hannover.pdf | Knase (Wikimedia Commons user) | CC-BY-SA-3.0 | yes | 2026-11-22 |
| pdf/ireland-mmc-apartment-a1-3d/A1-3D APARTMENT 22 3B-5P-1S.pdf | https://www.gov.ie/en/department-of-housing-local-government-and-heritage/organisation-information/re-use-of-public-sector-information/ | Department of Housing, Local Government and Heritage (Ireland) | IE-PSI re-use terms (Department of Housing): free re-use with attribution | yes | 2026-11-22 |
| pdf/loos-steiner-house-ground-floor/Pianta_piano_terra_rialzato,_Casa_Steiner,_Adolf_Loos.pdf | https://commons.wikimedia.org/wiki/File:Pianta_piano_terra_rialzato,_Casa_Steiner,_Adolf_Loos.pdf | Julian.Schindler (Wikimedia Commons user) | CC0-1.0 | yes | 2026-11-22 |
| pdf/newburn-flats-unit/Newburn_Flats_Floor_Plan.pdf | https://commons.wikimedia.org/wiki/File:Newburn_Flats_Floor_Plan.pdf | Linkblaine (Wikimedia Commons user) | CC-BY-SA-3.0 (dual GFDL-1.2+) | yes | 2026-11-22 |
| pdf/nist-nzertf-house/nzertf-fireplumbelecmech-plans-june2011.pdf | https://www.nist.gov/document/nzertf-fireplumbelecmech-plans-june2011pdf | Building Science Corporation for NIST | none stated (title block: Copyright 2009 Building Science Corporation) | no | 2026-11-22 |
| pdf/nps-arlington-house-first-floor/ARHOmap1.pdf | https://www.nps.gov/npgallery/AssetDetail/2fd409aa-bbbc-4657-8a48-8326ccedf18e | National Park Service, Harpers Ferry Center (cartographer) | PD-USGov | yes | 2026-11-22 |
| svg/bolduc-house-ste-genevieve/Bolduc_House_Floor_Plan--Ste_Genevieve_MO.svg | https://commons.wikimedia.org/wiki/File:Bolduc_House_Floor_Plan--Ste_Genevieve_MO.svg | Frank R. Leslie (drawing), Historic American Buildings/Engineering Record, National Park Service (record MO-1105) | PD-USGov | yes | 2026-11-22 |
| svg/bratislava-mileticova-12-tower/Podorys_mileticova12.svg | https://commons.wikimedia.org/wiki/File:Podorys_mileticova12.svg | Ojap (original JPG); vectorised derivative by Malyszkz | CC-BY-3.0 | yes | 2026-11-22 |
| svg/milano-qt8-ina-casa/Milano_QT8_edificio_INA-Casa_pianta.svg | https://commons.wikimedia.org/wiki/File:Milano_QT8_edificio_INA-Casa_pianta.svg | Waltermammi (Wikimedia Commons) | CC-BY-SA-3.0 | yes | 2026-11-22 |
| svg/rzut-budynku-flat-fragment/Rzut_budynku.svg | https://commons.wikimedia.org/wiki/File:Rzut_budynku.svg | Avalokitesvara | CC-BY-SA-3.0 | yes | 2026-11-22 |
| svg/vandergrift-bungalow-1925/063_The_Vandergrift_1925_floor_plan.svg | https://commons.wikimedia.org/wiki/File:063_The_Vandergrift_(Pennsylvania_Homes,_1925),_floor_plan.svg | Unknown author (1925 catalogue); vectorised on Wikimedia Commons | Public domain | yes | 2026-11-22 |
| svg/warm-springs-little-white-house/Little_White_House_floor_plan.svg | https://commons.wikimedia.org/wiki/File:Little_White_House_floor_plan.svg | Bedford (original JPG); vector by Connormah | PD (released by author) | yes | 2026-11-22 |

## What could not be found, and why

- **IFC:** no school, kindergarten or clinic under 50 MB with a clear licence, and no dormitory (KIT's Mehrfamilienhaus and
  Wohnheim are no longer published; the xBIM / GitHub "sample house" IFCs state no licence and look like Autodesk's).
  buildingSMART's Sample-Test-Files repeat the Certification datasets we already have. Two big Revit exports (52.7 MB,
  57 MB) and three bigger towers were left out for size.
- **DXF:** no multi-flat apartment block under CC0 / CC BY (the one found is GPL, kept for testing only); no floor plan
  written by FreeCAD, QCAD or Revit with a clear licence; no R12 or binary DXF plan; universities keep interior plans
  behind logins; US federal drawings are published as PDF or DWG.
- **PDF:** no openly licensed CAD print of a typical floor with a lift core and several flats (the nearest: the CMHC
  fourplex, all rights reserved, and one Irish standard flat); no PDF printed by Revit; what the US federal sites offer is
  mostly scans or contractor-copyrighted (the NIST house). Developers' brochures were not used (copyrighted).
- **SVG:** the SVG floor plans on Wikimedia Commons are mostly diagrams or scans traced into outlines; only one of six
  is drawn like an architect's sheet. Wikimedia refused this connection (HTTP 429, "too many requests") all day; three
  files came from the Internet Archive's copy of the same upload address, each checked byte for byte against the sha1
  Commons lists; a seventh (the Schmidt-Lademann house, CC BY-SA 4.0) was not in the archive.
- **3D models:** no building STL with an open licence could be fetched (the two on Commons are blocked as above and not
  archived; NASA's STLs are rockets and antennas); Sketchfab, the biggest CC source, needs a login; no .3dm building.
- **DWG** was not part of this hunt: without the converter it is refused with how to save a DXF, and the formats corpus
  already holds 11 DWGs.
- **Privacy:** every download used a generic client name; nothing about Plotline or its owner was sent anywhere; no
  page behind a login, sign-up or captcha was used.
