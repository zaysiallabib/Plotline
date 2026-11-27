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
the Studio opens it (its load path), its closed rooms, its Issues list. Harness: `E:/dev/tmp/s31/formats2/score.mjs` (since formats3 its copy `E:/dev/tmp/s31/formats3/score.mjs`, runs and shots under `formats3/`, scored from a frozen `git archive` of the commit)
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

## Session 31, ifcmap — an architect's IFC arrives dressed

The founder (2026-11-27): the files an architect hands over with the least hassle must "produce the actual building" on
their own, IFC first. Until now the IFC reader dropped every material name, `IsExternal`, PredefinedType and style name
(Docs/review/outside/INVENTORY.md §4): an imported building stood in the file's flat colours, Plotline's own plaster boxes
poked through IfcOpenHouse's gable roof, and three buildings floated over or sank under the street. Now the reader reads
the words (`src/import/materials.ts`, eleven languages) and dresses the building with Plotline's own finishes — the
outside shape's walls, roof and window frames wear the same pictures as Plotline's walls, the walked flat's outer walls
wear the same finish (the building's outside record), and Finishes → Whole building changes both.

**How it is measured.** The numbers: the reader itself in Node over the 21 sample IFCs (`E:/dev/tmp/s31/ifcmap/score.test.ts`,
copied into `src/import` to run; the before numbers from a frozen `git archive` of s31/redesign a6938ad). The pictures: the
founder's path in Firefox (drop on `/studio` → **Show building**; a 3D model on Type A → **Building → Put only this plan
into a building… → Show building**), the Building view's camera moved round the outside shape as the outside lane did —
before `E:/dev/plotline-shots/s31/outside/close/<file>-a|b|c.png`, after `E:/dev/plotline-shots/s31/ifcmap/after/<file>-a|b|c.png`,
side by side `E:/dev/plotline-shots/s31/ifcmap/contact-01…05.png` (harness `E:/dev/tmp/s31/ifcmap/scripts/shots.mjs`,
`contact.mjs`). The Studio's own lists checked as a person sees them: `E:/dev/plotline-shots/s31/ifcmap/ui/`.
Read times did not grow: the five biggest samples (LTU, Nordic office, Advanced Project, Nordic housing, Vienna) read in
19.9 s together against 21.4 s before (the faster of four reads each, `E:/dev/tmp/s31/ifcmap/timing.test.ts`). The rows a
person checks (the Studio's own list, seven of the buildings) are unchanged but for Longyearbyen 29 → 26 and Advanced
Project 772 → 773 (a railing closing a balcony: one more room to name).

*Materials known / listed*: the outer-wall material names read (an outer layer of an outer wall), and how many of them
Plotline knows; one not known keeps the plaster and is listed in **Materials** for a person to map. *Outer walls dressed /
outer*: walls the file calls outside (`IsExternal`, or every wall when it does not say) that wear the finish their names
say. *The building's own*: the commonest named finish when the named walls make 30 % of the outer walls, else the
plaster. *Railings read*: IfcRailings that made the low wall under them glass / metal / timber, or a low wall of their
own on a balcony edge (in brackets: the low walls made, by kind); a stair's handrail and a window guard against a wall
stay in the shape. *Roof read*: the roof setting (kind, pitch, covering) from IfcRoof's own kind (else its slopes);
"the file's own shape" for a freeform roof. *Street*: the storey whose floor is the street; **bold** where it moved.

| building | materials known / listed | outer walls dressed / outer | the building’s own | railings read / in file | roof read | street (ground storey) | shots (file name) |
|---|---|---|---|---|---|---|---|
| De Basis, Doorn (structural) | 0 / 0 | 0 / 0 | — | 0 / 0 | — | peil=0 | balconies-a3-de-basis-doorn |
| Amstelveen block (structural) | 0 / 0 | 0 / 0 | — | 0 / 0 | — | 01 eerste verdieping | balconies-a4-amstelveen |
| Spaarnelicht, Amsterdam (structural) | 3 / 3 | 702 / 702 | Fair-faced concrete | 0 / 0 | — | **V0 bk. ruwe vloer** (was K2) | balconies-a7-spaarnelicht-amsterdam |
| BIM4EEB demo, Finland | 1 / 1 | 216 / 226 | Fair-faced concrete; frames timber | 0 / 0 | — | 1. Kerros | bim4eeb-demo-fin |
| BIM4EEB demo, Poland | 0 / 0 | 0 / 63 | — | 0 / 0 | flat (file: notdefined ×10) | P0(+0.00m) | bim4eeb-demo-pol |
| Advanced Project | 5 / 5 | 158 / 390 | White render; frames black | 3 / 19 (2 railing, 6 glass) | flat, terrace tiles (file: notdefined ×2) | **Level 1** (was -1 - Garage) | bimwhale-advanced-project |
| Gaia switch house | 3 / 3 | 103 / 103 | Sand render; frames anthracite | 1 / 1 (1 glass) | flat, terrace tiles (file: flat ×4, notdefined ×10) | **Level 0** (was Level -2) | chek-gaia-switch-house |
| EDEA, Cáceres | 4 / 4 | 23 / 23 | Precast concrete panels; frames white | 2 / 7 (2 railing) | flat, gravel (file: notdefined ×2) | **Level 0** (was Level -1) | encore-edea-caceres |
| IfcOpenHouse (IFC2x3) | 1 / 1 | 4 / 4 | Red brick | 0 / 0 | gable 45° (file: gable) | Storey | ifcopenhouse-ifc2x3 |
| IfcOpenHouse (IFC4) | 1 / 1 | 4 / 4 | Red brick | 0 / 0 | gable 45° (file: gable) | Storey | ifcopenhouse-ifc4 |
| Nordic LCA housing, timber | 4 / 4 | 83 / 84 | Timber slats | 3 / 11 (6 railing) | flat (file: notdefined ×10) | **Level_01** (was Sea_Level) | nordic-lca-housing-timber |
| Nordic LCA office, concrete | 6 / 6 | 238 / 437 | Fair-faced concrete | 0 / 0 | flat, green roof (file: notdefined ×11, flat) | **Level_01** (was Foundations) | nordic-lca-office-concrete |
| Azuma house | 2 / 2 | 0 / 0 | Fair-faced concrete | 0 / 0 | — | NIVEAU 0 | oimr-azuma-house |
| Svaleveien 8, house A | 4 / 5 | 51 / 57 | Timber slats | 0 / 2 | the file's own shape (file: freeform) | 1-etasje | oimr-svaleveien-8-hus-a |
| Donor building, The Hague | 0 / 0 | 0 / 33 | — | 0 / 6 | flat (file: flat) | **01 Ground Floor** (was 00 Garage) | sum4re-den-haag-donor |
| HoloLens flat C | 0 / 0 | 0 / 29 | — | 0 / 0 | flat (file: flat) | Level 1 | sum4re-hololens-apartment-c |
| HoloLens flat D | 0 / 0 | 0 / 37 | — | 0 / 0 | flat (file: notdefined) | Level 1 | sum4re-hololens-apartment-d |
| Longyearbyen | 0 / 0 | 0 / 46 | — | 12 / 15 (28 railing) | flat (file: flat, shed) | 01 Ground Floor | sum4re-longyearbyen |
| Vienna real-world model | 15 / 16 | 116 / 116 | White render | 12 / 25 (30 railing) | flat, gravel (file: notdefined ×18) | **EG** (was UG2) | tuwien-vienna-realworld |
| Kleine Wohnung | 1 / 1 | 26 / 168 | White render; frames anthracite | 8 / 8 (22 glass) | flat (file: notdefined ×4) | BT-A_0990_UG01_RDOK_0,000 | webifc-kleine-wohnung-r22 |
| LTU A-House | 1 / 1 | 3 / 2622 | Warm plaster | 1 / 3 (1 railing) | flat (file: notdefined ×14) | VÅNING 1 | webifc-ltu-a-house |
| **all 21** | **51 / 53** | **1727 / 5144** | | **42 / 97** | **16 of 16 files with a roof** | **8 moved to the right storey** | |

**What the founder sees now, building by building** (after shots; compare the before shots of the same name):
- **IfcOpenHouse** — red brick walls under its gable roof; the walls stop at the eaves (they stood through the roof as
  flat-topped plaster boxes); the roof read as a 45° gable.
- **Gaia switch house** — sand render ("Crépi beige, texturé"), anthracite PVC frames, the little annex in white painted
  sand-lime brick; the glass veranda toned to Plotline's glass (it was violet); its basements under the street (the
  lowest storey stood on it).
- **Nordic LCA housing** — timber cladding ("Puuverhous") on 83 of 84 outer walls, the concrete base ("Betoniverhous")
  in fair-faced concrete; on the street (it floated 47 m up on an empty "Sea_Level" storey).
- **Kleine Wohnung** — white render (its walls' type names say WDVS, an ETICS render), anthracite frames, its eight
  glass balustrades read as glass low walls, the saturated blue windows toned to glass.
- **Vienna real-world model** — white render (Zementputz), zinc sheet metal (Blech), timber parts; the garage levels
  under the street (they stood above it); a gravel flat roof; 12 of its 25 railings read (made of parts; the rest stand against storey walls).
- **Advanced Project** — white render (Paint), engineering brick, black frames, terrace tiles on its flat roof; the
  garage under the street.
- **EDEA, Cáceres** — precast concrete panels, perforated ceramic brick, white aluminium frames, a gravel roof.
- **Nordic LCA office** — fair-faced concrete, a green roof ("Nurmi").
- **Svaleveien 8** — rough timber cladding ("Rupanel"), render ("Puss"); its freeform metal roof keeps the file's shape.
- **Spaarnelicht, Amstelveen, De Basis** (structural models) — concrete where the file says outer walls (Spaarnelicht);
  the other two say no wall is outside: as before. Spaarnelicht's street moved from its lowest kelder (K2) to V0.

**The outside shape stands on its own plans.** Found on the way: an IFC whose storeys the file places away from its 0
had its outside shape drawn that far from its flats — Gaia's 95 m off, EDEA's (a site in map coordinates) 4 374 km off, so
its Building view showed the shape alone with no street, its walls rounded to half a metre and its new textures
sparkling; Svaleveien's 3 m. The meshes are now moved into the plan frame as they are read (src/import/ifc.ts worldMesh):
the three stand on their plans in their streets (after shots), the other 18 are unchanged.

**Still flat-coloured, and why.** A file whose materials are placeholders — "Default", "Generic Material", "Material_10",
"Layer" (Donor, both HoloLens flats, Longyearbyen, BIM4EEB Poland) — names nothing to dress: those buildings stay in the
file's colours, said in the notes; the architect exports again with materials (FORMATS.md §3). LTU A-House's outer walls
are "beklädnad, invändig" (inner lining) and "tomt mönster" (empty pattern) on their ends: 3 of 2 622 outer walls say
brick, so the building's own stays plaster. A curtain wall's opaque spandrel panels are still glass (Plotline's glass wall
has no spandrel yet). Copper ("Kupari") is drawn as rust composite panels, the nearest option. The 3D models carry their
own pictures and are not re-dressed; a model drawn at 1 : 10 (NASA VAB, 15 m for a 160 m hall) looks like a plausible
small building and is not asked about — one under 8 m across (NASA HQ) or well under the drawing is.

**The 3D models** (6): each now stands on the street on the floor its drawing stands on (Shell.street; they floated at
the walked flat's floor), centred on the drawing; a fully see-through Collada material is drawn solid (the Macky
Auditorium was invisible: 52 meshes at opacity 0); coloured glass is toned; a model under 8 m across or well under the
drawing asks once how big it is ("As it is: 7.8 m" · "778 m across (×100)" · "78 m across (×10)"), kept for its name.

## Session 31, bigifc — a big architect model does not drown the person in marks (Stage 7)

The founder's LTU A-House screenshot: a university floor of 3 062 walls and 1 076 rooms under hundreds of ×N badges, a
minute to open, rooms all "Space N". Now (Firefox, the founder's path: `E:/dev/tmp/s31/bigifc/score/score.mjs` — the
formats3 scorer, adding the Issues rows a person sees after the grouping and each floor's open time; before =
`s31/redesign` bb23229, after = `s31/bigifc` a6c81a5, each from a frozen copy; shots `E:/dev/plotline-shots/s31/bigifc/`):

| file | floors | read s | slowest floor open s | walls | closed rooms | named rooms | loose ends | crossings | names outside a room | flats | Issues rows a person sees |
|---|---|---|---|---|---|---|---|---|---|---|---|
| dental_clinic/arc.ifc | 4 | 4.3 → **5.8** | 0.1 | 2,037 | 533 | 269 | 11 | 0 | 0 | 0 | 138 → **25** |
| hitos/arc.ifc | 7 | 3.6 → **4.3** | 0.0 | 1,828 | 506 | 238 | 62 | 2 | 0 | 0 | 159 → **39** |
| schependomlaan/arc.ifc | 1 | 2.7 → **3** | 0.1 | 991 | 315 | 0 | 32 | 0 | 0 | 0 | 92 → **3** |
| sixty5/arc.ifc | 19 | 18.4 → **21.5** | 0.1 | 12,345 | 2,147 | 110 | 1,254 | 0 | 0 | 0 | 1,895 → **162** |
| smiley_west/arc.ifc | 5 | 1.3 | 0.0 | 430 | 140 | 133 | 21 | 0 | 7 | 0 → **20** | 40 |
| wbdg_office/arc.ifc | 3 | 1.3 → **1** | 0.0 | 837 | 206 | 99 | 10 | 0 | 0 | 0 | 72 → **24** |
| bim4eeb-demo-pol/BIM4EEB_DEMONSTRATION_BLDG_POL.ifc | 5 | 0.6 | 0.0 | 278 → **268** | 43 → **41** | 0 | 63 → **64** | 14 → **12** | 0 | 0 | 109 → **105** |
| nordic-lca-housing-timber/ARK_NordicLCA_Housing_Timber_As-built_Archicad.ifc | 8 | 1.9 → **2.2** | 0.0 | 590 → **581** | 172 → **165** | 104 | 27 | 0 | 5 | 0 | 77 → **65** |
| nordic-lca-office-concrete/ARK_NordicLCA_Office_Concrete_BuildingPermit_Archicad.ifc | 9 | 357.3 → **8.9** | 15.5 → **0.0** | 4,125 → **1,329** | 845 → **436** | 202 → **269** | 48 → **47** | 2,414 → **0** | 89 → **22** | 0 | 2,661 → **110** |
| tuwien-vienna-realworld/RealWorldTestModel-EscapeRouteAnalysis-ZDB-v2.ifc | 7 | 1.6 → **1.9** | 0.0 | 640 | 197 | 110 | 15 | 7 | 0 | 0 → **5** | 49 |
| webifc-ltu-a-house/LTU_A-House_redesign.ifczip | 5 | 42.2 → **11.5** | 43.4 → **0.2** | 8,735 → **4,600** | 1,830 → **834** | 0 | 82 → **134** | 4,561 → **0** | 0 | 0 | 5,609 → **40** |

*Read s*: drop → the drawing on screen (the machine was shared: ±1–2 s on the small files is noise). *Slowest floor open*:
the Studio's own open (join + checks) of the file's slowest floor. *Issues rows a person sees*: the rows listed one by one
plus one row per grouped kind (below), every floor added up — the Issues heading still counts every issue.

What changed, and why each number moved:
1. **A glass front turning a corner is no 17 m wall.** A curtain wall has no body of its own; its panels' footprints were
   read as one straight wall as thick as the front was deep (LTU: 17 m and 9 m), split at every wall meeting it and
   passing that thickness on — 1 476 pieces of one storey; the Studio's join then took every end within 8 m as inside a
   wall. Now a footprint over 1.5 m across is read from its panels' straight runs (a run under 1 m — a frame's return —
   is none), a balcony glazing with a body of its own from its upright faces, else left to the outside shape (noted). LTU:
   crossings 4 561 → 0, walls 8 735 → 4 600, closed rooms 1 830 → 834 (the rest were slivers between the fake walls),
   read 42 → 11 s, its 2nd floor's open 43 → 0.2 s; the Nordic office: 6 minutes → 9 s, crossings 2 414 → 0, names in a
   room of their own 202 → 269. Loose ends on the LTU 82 → 134: on the base the fake walls swallowed every end near them
   (hidden, not joined); they are one row now with its fix. A "column" wider than 1.5 m both ways (two of 13 × 9 m on
   the LTU, drawn as black blocks) is left to the outside shape too.
2. **One Issues row per kind on a big floor** (over 200 walls; five or more of a kind): "34 loose wall ends", "250 rooms
   with no name", walls crossing, names outside a room — each with its fix for all, one Ctrl+Z: **Keep them all — they
   stand alone**, **Name them "VÅNING 3 · 1" to "VÅNING 3 · 250"**, **Join all that touch**. Their marks stay off the plan
   until the row is opened (then one badge per room). The LTU's floor 2: 6 rows on one screen (base: 2 085 rows, 142
   badges); both fixes applied leave 4 rows (Firefox, `E:/dev/tmp/s31/bigifc/ltu.mjs`).
3. **European room words** (Zimmer, Bad, Küche, Wohnzimmer, Slaapkamer, Treppenhaus, Aufzug, Gang …): Smiley West's upper
   floors show their 10 student flats each, the Vienna block 1–2 a floor (flats 0 → 20 and 0 → 5 above). **Furnish in 3D**
   (the floor list): tick the flats the 3D furnishes, the rest stand bare; Preview 3D of Smiley West's 1.OG with Flat 5 and
   Flat 6 ticked shows those two furnished between bare ones, the walk starting in a ticked flat.
4. **Preview 3D of a whole university floor opens**: the LTU's 2nd floor reaches Enter in 27 s (base: never — the
   daylight bake sampled a 100 × 60 m corridor box at 25 cm, 79 s on its small 4th floor alone); the bake's work is now
   bounded, every built-in flat and level unchanged (each daylight region on the same 25 cm grid).

Not done: a storey cannot be opened before the whole file is read (every file here now reads in 22 s or less, most in
1–5 s, the slowest Sixty5's 342 MB at about 20 s; the reading box names each floor as it goes); a solid wall with no
centre line that bends (one in the Polish block, 20 × 3 m) is left to the outside shape; the Polish block keeps 12
crossings and Hitos 2 (not looked into here); the LTU's Dollhouse shows one black-streaked block with a magenta line (from
the outside shape, not looked into); the Nordic housing block has 7 fewer closed rooms (no name lost: 104 named either way).

## Session 31, review — what the file cannot place, the person places in one click

After formats3, 9 names on the ifc-bench buildings stood in no room of their own. Now:
- **The digital hub's second lounge** (1 → 0): its room is split along the file's own outline of it, name by name — the
  importer tried every sharing room's outline at once, one bad outline sank them all, and a refused try kept the next
  one from using the same lines. Firefox (the founder's path, `E:/dev/tmp/s31/review/score.mjs`): digital hub 1 → 0
  names outside a room, 55 → 54 rows, read 1.3 s. Every other ifc-bench file reads exactly as before (node, all 27
  files: walls, rooms, names, crossings, rows unchanged).
- **Smiley West's first floor** (7, the file gives each flat's bath and hall one identical outline): still 7 at the
  drop — the file cannot tell which room is the bath, so nothing is guessed. Each Issues row now reads "BAD / WC-3-1
  shares a room with FLUR-3-3" and offers the unnamed room next door for either name (the one through a door), neither
  as the first choice: **7 clicks and the floor is clean** — 40 of 40 rooms named, no name outside a room (Firefox, shots
  `E:/dev/plotline-shots/s31/review/smiley-*.png`).
- **Molio's reception in the hall** (1): no unnamed room beside it, and its outline does not close against the walls; the
  row offers **Draw a zone line** (the plan goes there with the Wall tool on Zone line).

## Session 31, formats3 — the rest of the way

Before: `s31/redesign` 734c599 (run `before`: every file read exactly as formats2 left it — the speed lane changed no
number). After: `s31/formats3` 4bd824b (with `s31/redesign` merged), run `final` — its PDF pages scored on 4bd824b, every other
file on 328d0d8 (the last commit changed only PDF pages with no scale). Both scored on the whole corpus in
Firefox from a frozen copy of the commit (`git archive`), so code edited during a run cannot mix two versions.

**Before**

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

**After**

| format | files | clean | rooms open | no walls | refused | picture | shape only |
|---|---|---|---|---|---|---|---|
| IFC (ifc-bench) | 28 | 19 | 4 | 4 | 0 | 0 | 1 |
| IFC (buildingSMART) | 35 | 3 | 4 | 3 | 0 | 0 | 25 |
| DXF | 11 | 6 | 3 | 2 | 0 | 0 | 0 |
| DXF (from DWG) | 11 | 4 | 0 | 7 | 0 | 0 | 0 |
| PDF | 25 | 6 | 0 | 0 | 0 | 19 | 0 |
| DWG | 11 | 0 | 0 | 0 | 11 | 0 | 0 |
| 3D model | 13 | 0 | 0 | 0 | 1 | 0 | 12 |
| **all** | 134 | 38 | 11 | 16 | 12 | 19 | 38 |

On the files with floors: 2262 names, 1864 named closed rooms, 398 names outside a room, 2 crossings, 2190 loose ends, 4509 review rows.

**The IFC buildings (ifc-bench, the architects' own models): names outside a room 97 → 9 (without the Sixty5 tower
47 → 9), clean 14 → 19 of 28 files; the buildingSMART sample buildings 0 → 3 clean.** The rows to check fall on every
IFC file that changed; five PDF / DXF pages gain one row each (the stair hall that "UP" used to name now asks for its
name). PDF clean 16 → 6: twelve room pages of the twindo measurement report were read at a scale measured off their
tables (1 : 31–64, every length 1.3 to 2.7 times too long); now at the scale printed on them (1 : 16 / 1 : 24), where
each is one room and a thumbnail, not a floor plan — they open as the plan picture, as the page picker always offered. The plan pages (the 2D plan's 1 and 2, the report's 3, 4, 12 and 13) open as drawings.

### What changed, file by file (before → after; every file that changed at all)

- cert 2.3.0.1/Simple-Scene/Building-Architecture.ifc: **rooms open → clean**, walls 4 → 8, rooms 0 → 3, named 0 → 2, loose 8 → 2, outside 2 → 0, rows 12 → 4
- cert 4.0.2.1/Simple-Scene/Building-Architecture.ifc: **rooms open → clean**, walls 4 → 8, rooms 0 → 3, named 0 → 2, loose 8 → 2, outside 2 → 0, rows 12 → 4
- cert 4.3.2.0/Simple-Scene/Building-Architecture.ifc: **rooms open → clean**, walls 4 → 8, rooms 0 → 3, named 0 → 2, loose 8 → 2, outside 2 → 0, rows 12 → 4
- city_house_munich/arc.ifc: **rooms open → clean**, walls 137 → 142, rooms 37 → 42, named 16 → 19, loose 15 → 9, outside 3 → 0, rows 42 → 34
- dental_clinic/arc.ifc: **rooms open → clean**, walls 2031 → 2037, openings 375 → 374, rooms 528 → 533, named 265 → 269, loose 17 → 11, outside 4 → 0, rows 147 → 138
- dental_clinic/mep.ifc: rooms 0 → 262, named 0 → 258, loose 0 → 9, outside 526 → 268, rows 530 → 286
- duplex/mep.ifc: rooms 0 → 20, named 0 → 20, outside 42 → 22, rows 45 → 27
- fantasy_hotel_1/arc.ifc: **rooms open → clean**, walls 200 → 204, rooms 46 → 49, named 23 → 26, outside 3 → 0, rows 12 → 9
- fantasy_residential_building_1/arc.ifc: **rooms open → clean**, walls 351 → 360, rooms 81 → 89, named 49 → 57, outside 8 → 0, rows 54 → 46
- hitos/arc.ifc: walls 1780 → 1828, openings 438 → 436, rooms 453 → 506, named 221 → 238, loose 82 → 62, outside 17 → 0, rows 179 → 159
- molio/arc.ifc: walls 360 → 364, rooms 114 → 117, named 99 → 102, loose 3 → 6, outside 4 → 1
- sixty5/arc.ifc: **rooms open → clean**, rooms 2097 → 2147, named 60 → 110, outside 50 → 0
- wbdg_office/mep.ifc: rooms 0 → 112, named 0 → 99, outside 198 → 99, rows 201 → 142
- twindo_Backcountry_2nd_Floor_Plan: labels 1 → 0, named 1 → 0, rows 24 → 25
- qcad_flange.pdf: walls 1 → 0, loose 2 → 0, rows 4 → 0
- twindo_Backcountry_2D_Plan.pdf p1: labels 1 → 0, named 1 → 0, rows 30 → 31
- twindo_Backcountry_2D_Plan.pdf p2: walls 393 → 392, labels 1 → 0, rooms 111 → 110, named 1 → 0, rows 59 → 60
- twindo_Backcountry_Measurement_Report.pdf p1: rows 1 → 0
- twindo_Backcountry_Measurement_Report.pdf p10: walls 140 → 111, openings 2 → 1, labels 2 → 0, rooms 36 → 31, named 2 → 0, loose 16 → 12, rows 25 → 18
- twindo_Backcountry_Measurement_Report.pdf p11: **clean → picture**, walls 117 → 89, openings 2 → 1, labels 2 → 0, rooms 29 → 25, named 2 → 0, loose 13 → 10, rows 20 → 18
- twindo_Backcountry_Measurement_Report.pdf p12: walls 139 → 141, labels 1 → 0, rooms 36 → 37, named 1 → 0, rows 27 → 28
- twindo_Backcountry_Measurement_Report.pdf p13: **picture → clean**, walls 16 → 126, openings 0 → 6, labels 0 → 9, rooms 0 → 33, named 0 → 9, loose 32 → 1, rows 34 → 20
- twindo_Backcountry_Measurement_Report.pdf p14: walls 281 → 191, openings 14 → 10, labels 2 → 1, rooms 89 → 56, named 2 → 1, loose 16 → 12, rows 31 → 23
- twindo_Backcountry_Measurement_Report.pdf p15: **clean → picture**, walls 298 → 205, openings 13 → 9, labels 3 → 1, rooms 93 → 61, named 3 → 1, loose 16 → 13, rows 33 → 30
- twindo_Backcountry_Measurement_Report.pdf p16: **clean → picture**, walls 344 → 246, openings 15 → 10, labels 8 → 4, rooms 103 → 74, named 8 → 4, loose 19 → 14, rows 39 → 30
- twindo_Backcountry_Measurement_Report.pdf p17: **clean → picture**, walls 323 → 223, openings 12 → 5, labels 7 → 2, rooms 95 → 66, named 7 → 2, rows 38 → 34
- twindo_Backcountry_Measurement_Report.pdf p18: walls 267 → 117, openings 11 → 4, labels 3 → 0, rooms 87 → 31, named 3 → 0, loose 16 → 18, rows 31 → 22
- twindo_Backcountry_Measurement_Report.pdf p19: **clean → picture**, walls 315 → 153, openings 13 → 6, labels 4 → 0, rooms 102 → 44, named 4 → 0, loose 17 → 21, rows 37 → 25
- twindo_Backcountry_Measurement_Report.pdf p2: rows 1 → 0
- twindo_Backcountry_Measurement_Report.pdf p20: **clean → picture**, walls 305 → 217, openings 12 → 7, labels 7 → 3, rooms 93 → 62, named 7 → 3, loose 18 → 19, rows 36 → 34
- twindo_Backcountry_Measurement_Report.pdf p21: **clean → picture**, walls 340 → 162, openings 13 → 4, labels 5 → 2, rooms 105 → 46, named 5 → 2, loose 21 → 18, rows 42 → 26
- twindo_Backcountry_Measurement_Report.pdf p22: **clean → picture**, walls 352 → 155, openings 13 → 5, labels 6 → 1, rooms 108 → 41, named 6 → 1, loose 18 → 21, rows 38 → 30
- twindo_Backcountry_Measurement_Report.pdf p3: labels 1 → 0, named 1 → 0, rows 33 → 34
- twindo_Backcountry_Measurement_Report.pdf p4: **picture → clean**, walls 6 → 81, openings 0 → 1, labels 0 → 6, rooms 0 → 16, named 0 → 6, loose 12 → 4, rows 14 → 12
- twindo_Backcountry_Measurement_Report.pdf p5: **clean → picture**, walls 141 → 76, openings 4 → 1, labels 2 → 0, rooms 37 → 17, named 2 → 0, rows 26 → 20
- twindo_Backcountry_Measurement_Report.pdf p6: **clean → picture**, walls 128 → 87, openings 3 → 0, labels 5 → 1, rooms 34 → 21, named 5 → 1, rows 27 → 26
- twindo_Backcountry_Measurement_Report.pdf p7: **clean → picture**, walls 109 → 60, openings 2 → 0, labels 1 → 0, rooms 28 → 12, named 1 → 0, rows 19 → 17
- twindo_Backcountry_Measurement_Report.pdf p8: **clean → picture**, walls 119 → 70, openings 2 → 0, labels 1 → 0, rooms 30 → 14, named 1 → 0, rows 22 → 20
- twindo_Backcountry_Measurement_Report.pdf p9: walls 187 → 163, openings 9 → 5, labels 1 → 0, rooms 50 → 48, named 1 → 0, loose 14 → 12, rows 30 → 27

### The fixes, each measured on the whole corpus

1. **A PDF is read at the scale printed on its sheet** (`1/4" = 1'-0"`, `1:100`, `SCALE 1 : 50`; two different
   ones say nothing), then its printed dimensions, then its room sizes. twindo's Room Layout pages print their room names
   as text but no dimension lines: without a scale their grey wall fills were not walls and the pages fell back to
   pictures. Page 13 now opens as a drawing with all nine rooms named; page 4 with six of seven (Room-1 shares one open
   space with the living room — no wall between them on the sheet). A stair's "UP" / "DN" and a door or window tag
   ("D-16", "Win-18", "W3") no longer name a room (on page 13 "Win-18" had taken Room-4's place; on the plan pages "UP"
   named the stair hall — that room now asks for its name, one row more on five pages).
2. **IFC: a room its walls leave open closes along the file's own outline of it** — a balcony edged only by a railing
   (the fantasy residential building's eight), a roof terrace (the dental clinic's roof), a stair open to the floor above
   (the fantasy hotel's), a room whose wall the file put on another storey (Hitos, Sixty5): flush zone lines, drawn as
   nothing, where no wall stands; the railing or parapet itself is in the outside shape. Kept only when it leaves fewer
   rows to check (or as many, with fewer names outside a room). ifc-bench names outside a room 97 → 9: Hitos 17 → 0,
   Sixty5 50 → 0, fantasy residential 8 → 0, dental 4 → 0, city house 3 → 0, fantasy hotel 3 → 0, Molio 4 → 1. The
   services models (no walls at all) get their spaces outlined too: dental services 526 → 268 names outside a room.
   Tried and dropped: wall ends reaching up to a wall thickness further (Hitos' 9–27 cm gaps) — once rooms close along
   their outlines it changed nothing, so it is not in the code.
3. **Opening a floor whose joining only puts the same wall back says nothing.** A short piece of a thick wall beside its
   finish wall was dropped as "drawn over another" and joined back by the next rule — the same wall, a message and an
   undo step every time the floor opened (the dental clinic's first floor, 4351, Schependomlaan). The Studio's load now
   compares what a person sees (each wall's corners, thickness, height, openings) and keeps the floor as it was.
4. **Plotline's own DXF, saved by a CAD program, comes back exactly: 20 of 20 built-in flats and levels** (was 10, then
   11 with fix 5). Each wall's centre line rides along (layer `PLOTLINE_AXES_<thickness in 0.1 mm>`, a two-point polyline,
   its height as its thickness); read back, while every centre line and every outline agree, the walls are those lines —
   a curved ramp's chords stay chords and share their corners — and every opening its block at its own width (a curved
   glass wall's 6–18 cm panes). A wall moved, lengthened or shortened in CAD breaks the agreement: the walls are read from
   their outlines as before. Measured in node (`src/import/dxfWrite.test.ts`, every built-in), not on the corpus: no
   corpus file is a Plotline export.
5. **A DXF door 1–3 cm from a corner** (the wall's last piece too short to draw) keeps its own width and its wall
   instead of growing to the corner or being moved off a wall split at its jamb (Type B, Sheltech ground).
6. **SVG: a sheet whose groups name no layers is sorted by pen with the PDF's own rule** (one rule, `plan2d.ts`
   penRoles): the heavy strokes and wall-thin grey fills are the walls; thin floor tiles, a wardrobe, dimension lines no
   longer pair into walls (`svg.test.ts`). The corpus has no SVG.
7. **A page with no scale printed as words is not read as lines** (a Dhaka brochure's plan page whose words are all
   outlines: Akter Anandita page 9, 232 412 lines, no text). Read as metres its lines make no walls, and pairing them
   took minutes with the Studio standing still; now the page is the plan picture in 0.35 s and Auto-trace reads its names.
   On the corpus only three picture pages change (their unread lines no longer counted).

**Read times** (drop → floors on screen, Firefox, the file already in the page, the speed lane's `stages.mjs`, before
and now alternated twice; the machine was shared with other lanes, so a few tenths are noise): dental clinic 4.3 → 5.1 s, Hitos 3.8 → 3.9 s, Schependomlaan 2.9 → 2.5 s, the 342 MB Sixty5 tower 18.4 → 20.9 s
(averages of the two passes). The extra is the floors that now close a room along its outline: each such floor is joined
once more (dental's first floor and roof, Sixty5's floors with a name in no room); a floor with every name in a room
reads exactly as before. That cost buys every name its room — the founder's call against "never slower", as for formats2.

### Not 100 % yet, and why (plain words)

- **IFC, 9 names outside a room on the 28 ifc-bench files:** Smiley West's first floor gives the bath and the hall of
  each of its seven flats the very same outline (the file's own mistake: two names, one room) — the row stays so a person
  splits them; Molio's auditorium and depot, and two lounges of the digital hub, share one open space whose separation
  the file does not draw (a zone line along their outlines left more to check, so none was added). 2 crossings remain on
  one Hitos floor. Services models have spaces but no walls: half their spaces still stand in no room.
- **PDF room names drawn as outlines:** none of the corpus PDFs has them — the twindo 2D plan's pages 1 and 2 print no
  room names at all (only ceiling heights, "8'-5\" CLG"), so their rooms stay "Space N"; the room names are on the
  measurement report's Room Layout pages, which now read. Where a real plan page has its words as outlines — Akter
  Anandita's brochure page 9, a CAD print with no text at all — there is no scale either, so its lines make no walls; it
  opens as the plan picture (fix 7) and Auto-trace's reader (tesseract) reads the names off the picture, as for every
  brochure. Across the 45 Dhaka brochures in `Demo drawings/` (node, page by page): 391 pages carry lines; ten pages of the Rangs
brochures read as line drawings with their names printed as words (4–35 names a page, read as names), every other page
opens as the plan picture, and the slowest page now takes 4.4 s (Anandita's page 9 took minutes before fix 7). So no second reader of outlined words was built into the line path.
- **PDF room pages** (the report's 15 per-room pages) open as pictures at their true scale (see above).
- **DXF / SVG test files** that are not plans (ezdxf's, the multiline sample) stay "rooms open"; DWG stays refused until
  the online converter is set up (Docs/SETUP_FORMATS.md); 3D models give the outside shape only, by design.

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
- **IFC speed:** joining and checking each floor made big buildings slower with formats2; the speed lane (session 31)
  made the joining itself several times faster with the same result to the corner (`src/studio/joinPinned.test.ts`;
  the 28 ifc-bench files re-scored with every floor's numbers identical, run `speed-ifc`). Seconds from the drop to the
  floors on screen, Firefox, the file already in the page, two runs averaged — before formats2 → after formats2 →
  now: dental clinic 3.6 → 8.4 → 2.9, Hitos 2.6 → 5.1 → 2.8, Schependomlaan 3.0 → 3.6 → 2.4, the 342 MB Sixty5 tower
  15.8 → 51.8 → 15.4 (`E:/dev/tmp/s31/speed/stages.mjs`; the scoreboard's own clock, which also counts fetching the file: 6.7 → 11.2 → 4.1,
  3.6 → 5.8 → 3.3, 3.2 → 4.6 → 3.8, 17.9 → 57.3 → 17.0). Small buildings read as fast as before.
- **DXF round trip:** 10 of 20 built-ins exact from their lines alone; Banani's basements and ground (curved ramp walls
  drawn as short chords, parking bays) and Sheltech ground / Sheltech A / Type B / Type C (a door right at a corner, one
  short wall at a T) still differ by 1–13 things. Untouched exports still open exactly (the comment copy).
- **PDF:** a print whose walls are drawn with the same pen as everything else gets nothing from pens; brochure pages
  stay pictures for Auto-trace, by design.
- **Not plans:** the buildingSMART Simple-Scene buildings have only four walls (no front or back) — nothing can close;
  LibreDWG's example drawings and ezdxf's test files are not floor plans; DWG stays refused until the online converter
  is set up (Docs/SETUP_FORMATS.md); 3D models give the outside shape only, by design.

## Per file — now (formats3, 4bd824b)

#### IFC (ifc-bench)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4351/arc.ifc | IFC2X3 | 5 | 152 | 30 | 0 | 6 | 39 | 6 | 7 | 0 | 0 | 32 | 1 | clean |
| ac20/arc.ifc | IFC4 | 5 | 257 | 283 | 2 | 82 | 82 | 82 | 0 | 0 | 0 | 6 | 1.3 | clean |
| city_house_munich/arc.ifc | IFC4X3_ADD2 | 5 | 142 | 27 | 0 | 19 | 42 | 19 | 9 | 0 | 0 | 34 | 2 | clean |
| dental_clinic/arc.ifc | IFC2X3 | 4 | 2037 | 374 | 0 | 269 | 533 | 269 | 11 | 0 | 0 | 138 | 5.4 | clean |
| dental_clinic/mep.ifc | IFC2X3 | 4 | 0 | 0 | 0 | 526 | 262 | 258 | 9 | 0 | 268 | 286 | 7.3 | no walls |
| dental_clinic/str.ifc | IFC2X3 | 4 | 33 | 1 | 270 | 0 | 4 | 0 | 4 | 0 | 0 | 15 | 1.6 | clean |
| digital_hub/arc.ifc | IFC4 | 3 | 381 | 214 | 62 | 64 | 111 | 63 | 9 | 0 | 1 | 55 | 2.1 | rooms open |
| duplex/arc.ifc | IFC2X3 | 4 | 104 | 28 | 0 | 21 | 31 | 21 | 0 | 0 | 0 | 18 | 0.7 | clean |
| duplex/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 42 | 20 | 20 | 0 | 0 | 22 | 27 | 1 | no walls |
| ettenheim_gis/city.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2.3 | shape |
| fantasy_hotel_1/arc.ifc | IFC4 | 4 | 204 | 144 | 39 | 26 | 49 | 26 | 4 | 0 | 0 | 9 | 1.6 | clean |
| fantasy_hotel_2/arc.ifc | IFC4 | 6 | 218 | 258 | 86 | 20 | 64 | 20 | 6 | 0 | 0 | 56 | 1.9 | clean |
| fantasy_office_building_1/arc.ifc | IFC4 | 5 | 293 | 118 | 40 | 44 | 56 | 44 | 0 | 0 | 0 | 17 | 1.3 | clean |
| fantasy_office_building_2/arc.ifc | IFC4 | 3 | 100 | 40 | 44 | 5 | 29 | 5 | 0 | 0 | 0 | 27 | 1.3 | clean |
| fantasy_office_building_3/arc.ifc | IFC4 | 6 | 436 | 297 | 20 | 87 | 142 | 87 | 0 | 0 | 0 | 61 | 1.6 | clean |
| fantasy_residential_building_1/arc.ifc | IFC4 | 4 | 360 | 134 | 30 | 57 | 89 | 57 | 0 | 0 | 0 | 46 | 1.7 | clean |
| fzk_house/arc.ifc | IFC4 | 2 | 21 | 16 | 0 | 7 | 7 | 7 | 0 | 0 | 0 | 3 | 1 | clean |
| hitos/arc.ifc | IFC2X3 | 7 | 1828 | 436 | 225 | 238 | 506 | 238 | 62 | 2 | 0 | 159 | 4.4 | rooms open |
| molio/arc.ifc | IFC2X3 | 10 | 364 | 241 | 14 | 103 | 117 | 102 | 6 | 0 | 1 | 40 | 2.7 | rooms open |
| samuel_macalister_sample_house/arc.ifc | IFC4 | 6 | 172 | 52 | 5 | 14 | 33 | 14 | 38 | 0 | 0 | 58 | 1.3 | clean |
| samuel_macalister_sample_house/mep.ifc | IFC4 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 | 2.6 | no walls |
| schependomlaan/arc.ifc | IFC2X3 | 1 | 991 | 77 | 23 | 0 | 315 | 0 | 32 | 0 | 0 | 92 | 2.7 | clean |
| sixty5/arc.ifc | IFC2X3 | 19 | 12345 | 572 | 0 | 110 | 2147 | 110 | 1254 | 0 | 0 | 1895 | 21.2 | clean |
| sixty5/str.ifc | IFC2X3 | 19 | 412 | 329 | 393 | 0 | 40 | 0 | 289 | 0 | 0 | 359 | 1.6 | clean |
| smiley_west/arc.ifc | IFC4 | 5 | 430 | 250 | 20 | 140 | 140 | 133 | 21 | 0 | 7 | 40 | 1.3 | rooms open |
| wbdg_office/arc.ifc | IFC2X3 | 3 | 837 | 175 | 0 | 99 | 206 | 99 | 10 | 0 | 0 | 72 | 1.4 | clean |
| wbdg_office/mep.ifc | IFC2X3 | 3 | 0 | 0 | 0 | 198 | 112 | 99 | 0 | 0 | 99 | 142 | 2.3 | no walls |
| wbdg_office/str.ifc | IFC2X3 | 4 | 8 | 0 | 120 | 0 | 2 | 0 | 0 | 0 | 0 | 8 | 1 | clean |

#### IFC (buildingSMART)

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cert 2.3.0.1/Simple-Scene/Building-Architecture.ifc | IFC2X3 | 1 | 8 | 0 | 0 | 2 | 3 | 2 | 2 | 0 | 0 | 4 | 1.5 | clean |
| cert 2.3.0.1/Simple-Scene/Building-Hvac.ifc | IFC2X3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 2.3.0.1/Simple-Scene/Building-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Building-Structural.ifc | IFC2X3 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 2.3.0.1/Simple-Scene/Infra-Bridge.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Electrical.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Landscaping.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Plumbing.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Rail.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 2.3.0.1/Simple-Scene/Infra-Road.ifc | IFC2X3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/basin-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/column-straight-rectangle-tessellation.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellated-item.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/tessellation-with-individual-colors.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/ISO Spec - ReferenceView_V1.2/wall-with-opening-and-window.ifc | IFC4 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 4 | 0.6 | rooms open |
| cert 4.0.2.1/Simple-Scene/Building-Architecture.ifc | IFC4 | 1 | 8 | 0 | 0 | 2 | 3 | 2 | 2 | 0 | 0 | 4 | 0.6 | clean |
| cert 4.0.2.1/Simple-Scene/Building-Hvac.ifc | IFC4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.0.2.1/Simple-Scene/Building-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Building-Structural.ifc | IFC4 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 1 | rooms open |
| cert 4.0.2.1/Simple-Scene/Infra-Bridge.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Electrical.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Landscaping.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Plumbing.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Rail.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.0.2.1/Simple-Scene/Infra-Road.ifc | IFC4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Architecture.ifc | IFC4X3_ADD2 | 1 | 8 | 0 | 0 | 2 | 3 | 2 | 2 | 0 | 0 | 4 | 0.6 | clean |
| cert 4.3.2.0/Simple-Scene/Building-Hvac.ifc | IFC4X3_ADD2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.6 | no walls |
| cert 4.3.2.0/Simple-Scene/Building-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Building-Structural.ifc | IFC4X3_ADD2 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 6 | 0 | 0 | 8 | 0.6 | rooms open |
| cert 4.3.2.0/Simple-Scene/Infra-Bridge.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.7 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Electrical.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Landscaping.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Plumbing.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Rail.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.6 | shape |
| cert 4.3.2.0/Simple-Scene/Infra-Road.ifc | IFC4X3_ADD2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.9 | shape |

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
| draftsperson_house_floor_plan_tutorial | DXF 2013 | 1 | 92 | 31 | 4 | 3 | 32 | 3 | 1 | 0 | 0 | 7 | 0.3 | clean |
| libredwg_example_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.8 | no walls |
| libredwg_example_2007 | DXF 2007 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | no walls |
| libredwg_example_2013 | DXF 2013 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | no walls |
| libredwg_example_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.8 | no walls |
| libredwg_example_r14 | DXF R14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.8 | no walls |
| libredwg_sample_2000 | DXF 2000 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| libredwg_sample_2018 | DXF 2018 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | no walls |
| twindo_Backcountry_1st_Floor_Plan | DXF 2013 | 1 | 86 | 15 | 1 | 0 | 14 | 0 | 9 | 0 | 0 | 19 | 0.3 | clean |
| twindo_Backcountry_2nd_Floor_Plan | DXF 2013 | 1 | 98 | 28 | 11 | 0 | 14 | 0 | 14 | 0 | 0 | 25 | 0.3 | clean |

#### PDF

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| qcad_flange.pdf | PDF | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.3 | picture |
| twindo_Backcountry_2D_Plan.pdf p1 | PDF p1 | 1 | 171 | 5 | 0 | 0 | 43 | 0 | 14 | 0 | 0 | 31 | 0.7 | clean |
| twindo_Backcountry_2D_Plan.pdf p2 | PDF p2 | 1 | 392 | 16 | 0 | 0 | 110 | 0 | 22 | 0 | 0 | 60 | 1.3 | clean |
| twindo_Backcountry_Measurement_Report.pdf p1 | PDF | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p10 | PDF p10 | 1 | 111 | 1 | 0 | 0 | 31 | 0 | 12 | 0 | 0 | 18 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p11 | PDF p11 | 1 | 89 | 1 | 0 | 0 | 25 | 0 | 10 | 0 | 0 | 18 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p12 | PDF p12 | 1 | 141 | 6 | 0 | 0 | 37 | 0 | 1 | 0 | 0 | 28 | 0.7 | clean |
| twindo_Backcountry_Measurement_Report.pdf p13 | PDF p13 | 1 | 126 | 6 | 0 | 9 | 33 | 9 | 1 | 0 | 0 | 20 | 0.6 | clean |
| twindo_Backcountry_Measurement_Report.pdf p14 | PDF p14 | 1 | 191 | 10 | 0 | 1 | 56 | 1 | 12 | 0 | 0 | 23 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p15 | PDF p15 | 1 | 205 | 9 | 0 | 1 | 61 | 1 | 13 | 0 | 0 | 30 | 1.6 | picture |
| twindo_Backcountry_Measurement_Report.pdf p16 | PDF p16 | 1 | 246 | 10 | 0 | 4 | 74 | 4 | 14 | 0 | 0 | 30 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p17 | PDF p17 | 1 | 223 | 5 | 0 | 2 | 66 | 2 | 18 | 0 | 0 | 34 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p18 | PDF p18 | 1 | 117 | 4 | 0 | 0 | 31 | 0 | 18 | 0 | 0 | 22 | 1 | picture |
| twindo_Backcountry_Measurement_Report.pdf p19 | PDF p19 | 1 | 153 | 6 | 0 | 0 | 44 | 0 | 21 | 0 | 0 | 25 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p2 | PDF | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1.6 | picture |
| twindo_Backcountry_Measurement_Report.pdf p20 | PDF p20 | 1 | 217 | 7 | 0 | 3 | 62 | 3 | 19 | 0 | 0 | 34 | 1.8 | picture |
| twindo_Backcountry_Measurement_Report.pdf p21 | PDF p21 | 1 | 162 | 4 | 0 | 2 | 46 | 2 | 18 | 0 | 0 | 26 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p22 | PDF p22 | 1 | 155 | 5 | 0 | 1 | 41 | 1 | 21 | 0 | 0 | 30 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p3 | PDF p3 | 1 | 152 | 3 | 0 | 0 | 34 | 0 | 15 | 0 | 0 | 34 | 0.7 | clean |
| twindo_Backcountry_Measurement_Report.pdf p4 | PDF p4 | 1 | 81 | 1 | 0 | 6 | 16 | 6 | 4 | 0 | 0 | 12 | 0.7 | clean |
| twindo_Backcountry_Measurement_Report.pdf p5 | PDF p5 | 1 | 76 | 1 | 0 | 0 | 17 | 0 | 13 | 0 | 0 | 20 | 0.9 | picture |
| twindo_Backcountry_Measurement_Report.pdf p6 | PDF p6 | 1 | 87 | 0 | 0 | 1 | 21 | 1 | 18 | 0 | 0 | 26 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p7 | PDF p7 | 1 | 60 | 0 | 0 | 0 | 12 | 0 | 12 | 0 | 0 | 17 | 1.4 | picture |
| twindo_Backcountry_Measurement_Report.pdf p8 | PDF p8 | 1 | 70 | 0 | 0 | 0 | 14 | 0 | 15 | 0 | 0 | 20 | 1.3 | picture |
| twindo_Backcountry_Measurement_Report.pdf p9 | PDF p9 | 1 | 163 | 5 | 0 | 0 | 48 | 0 | 12 | 0 | 0 | 27 | 1.3 | picture |

#### DWG

| file | version | storeys | walls | openings | columns | names | closed rooms | named rooms | loose ends | crossings | names outside a room | review rows | read s | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| autodesk_blocks_and_tables_-_imperial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| draftsperson_house_floor_plan_tutorial.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2007.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.5 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2013.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_example_r14.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2000.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.4 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| libredwg_sample_2018.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_1st_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.3 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |
| twindo_Backcountry_2nd_Floor_Plan.dwg | DWG | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0.4 | refused: AutoCAD's own .dwg cannot be read here. In AutoCAD (or any free DWG viewer): Sav |

#### 3D model

| file | triangles | read s | verdict |
|---|---|---|---|
| threejs_Rhino_Logo.3dm | 131,948 | 1 | shape |
| threejs_Cobra_s350.dae | 9,598 | 0.3 | shape |
| kenney_suburban_building-type-a.fbx | 1,174 | 0.3 | shape |
| threejs_exampleWindow.fbx | 44 | 0.3 | shape |
| threejs_monkey.fbx | 970 | 0.3 | shape |
| threejs_nurbs.fbx | — | 0.3 | refused: Could not read threejs_nurbs.fbx: threejs_nurbs.fbx holds no surfaces (lines or curves onl |
| babylon_village.glb | 458 | 0.7 | shape |
| kenney_suburban_building-type-a.glb | 1,174 | 0.3 | shape |
| kenney_suburban_building-type-k.glb | 1,024 | 0.3 | shape |
| threejs_LittlestTokyo.glb | 141,802 | 0.6 | shape |
| kenney_suburban_building-type-a.obj | 2,348 | 0.3 | shape |
| threejs_colored_binary.stl | 2,156 | 0.3 | shape |
| threejs_slotted_disk_ascii.stl | 288 | 0.3 | shape |

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
