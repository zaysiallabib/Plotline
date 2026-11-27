# Drawing sets — what kind of drawing is every page? (the scoreboard)

**What this is.** Stage 1 of [the engine for whole projects](PLAN_DRAWING_SETS.md). The founder, 2026-11-26: "the current
system is only working on floor plans … it has no system to read documents like elevations … a lot of files with all
construction related details and the system just blindly chose to draw lines on everything". Now every page of a drawing
set is read for what it is — a **plan** (and of which floor), an **elevation** (and which side), a **section** (and its
mark), a **site** plan, a **schedule**, an **interior** elevation, a **detail**, a **title** page, or **other** (a
brochure's photos and words) — and a page of several drawings is split into them. Only plans become walls; the rest is kept
with the project as what it is. How a person uses it: [MANUAL §5 "Drop a whole set"](MANUAL.md).

**How it reads, with no AI.** First the words: the title printed under (or over) each drawing — "2ND FLOOR PLAN SCALE
1/4" = 1'-0"", "FRONT ELEVATION (SOUTH)", "CORTE A-A", "PLANTA SEGUNDO NIVEL", "GRUNDRISS 1. OG", "Level-02, Level-03 &
Level-09 Plan" — in English, Spanish, German, French, Italian and Dutch. Then the sheet number in the title block (A-201,
A2.0: the first digit says plans, elevations, sections, details, schedules), which also reads a plot stamp's drawing file
("M-501.dwg") when the sheet's words are drawn as lines. Then the drawing's own shape (door swings with their leaves make
a plan, a ruled table a schedule, a page of words a title page). Code: `src/import/sheets.ts` (70 tests,
`sheets.test.ts`).

**How it was scored — the founder's path.** Firefox (Playwright's build on E:, headless, one browser), a fresh Studio
(`/studio`) for every set, the set's PDF **dropped** on the sheet (a real drop event), the **What is in this set** list
left to read every page; what the list holds is compared, drawing by drawing, with what each page really is — the
*expected* column, written by looking at every page once (contact sheets) **before** any scoring. A one-page PDF that is one
floor plan opens straight as before (no list); it is scored on what it was read as. Harness:
`E:/dev/tmp/s31/sheets/score.mjs` (expected in `expected.json` beside it, raw results `runs/final.json`); a screenshot of
every set's list in `E:/dev/plotline-shots/s31/sheets/score/`.

**The columns.** *Drawings*: the views the pages really hold (a page of five kitchen elevations is five). *Kind right*: a
drawing read as its kind (title and other count as one: neither is drawn nor kept). *Kind + floor / side / mark right*: also
the floors a plan's title names (as printed: "1ST FLOOR" is 1, "GROUND" is G — where that lands in the project is the next
column's business), an elevation's side, a section's mark. *Pages split right*: a page read as exactly as many drawings as
it holds. *Before* (in brackets): today, before this lane — every page one drawing, a plan, on no floor ("Floor").

**Used when built** is what **Build the project** does with each drawing: → the floors a plan goes on (G, 1, Roof; a set with
no ground-floor plan puts its 1st floor on the ground), *kept* (a picture in the project), or *left out*.

## Totals

| Set | pages | drawings | kind right (before) | kind + floor / side / mark right (before) | pages split right (before) | read in |
|---|---|---|---|---|---|---|
| Farmhouse drawing set (Amatect, US) | 25 | 33 | 33 · 100 % (6) | 33 · 100 % (1) | 25 · 100 % (22) | 3.8 s |
| Quinta Monroy (Elemental, Chile) | 5 | 9 | 9 · 100 % (2) | 9 · 100 % (0) | 5 · 100 % (2) | 1.8 s |
| NIST net-zero house, services set (US, words drawn as lines) | 32 | 34 | 28 · 82 % (19) | 10 · 29 % (0) | 30 · 94 % (30) | 7.1 s |
| Fourplex 02 (CMHC, Canada) | 3 | 4 | 4 · 100 % (2) | 4 · 100 % (0) | 3 · 100 % (2) | 1.0 s |
| Backcountry house plan (twindo, US) | 2 | 2 | 2 · 100 % (2) | 2 · 100 % (0) | 2 · 100 % (2) | 0.8 s |
| Backcountry measurement report (twindo, US) | 22 | 22 | 6 · 27 % (4) | 6 · 27 % (0) | 22 · 100 % (22) | 1.5 s |
| Rangs The Sanctuary (Dhaka brochure) | 28 | 32 | 31 · 97 % (4) | 31 · 97 % (0) | 28 · 100 % (24) | 8.5 s |
| Rangs White Lake (Dhaka brochure) | 36 | 38 | 34 · 89 % (8) | 34 · 89 % (0) | 35 · 97 % (34) | 2.1 s |
| Rangs The Majestic (Dhaka brochure) | 27 | 29 | 28 · 97 % (4) | 28 · 97 % (0) | 27 · 100 % (25) | 8.1 s |
| Eastern Housing Pearl (Dhaka brochure) | 15 | 15 | 14 · 93 % (4) | 14 · 93 % (0) | 15 · 100 % (15) | 1.7 s |
| Eastern Housing Noboneer (Dhaka brochure) | 14 | 14 | 12 · 86 % (3) | 12 · 86 % (0) | 14 · 100 % (14) | 6.8 s |
| Single sheets (the samples' one-page PDFs) | 6 | 6 | 4 · 67 % (6) | 4 · 67 % (4) | 6 · 100 % (6) | 3.0 s |
| **All** | **215** | **238** | **205 · 86 %** (64 · 27 %) | **187 · 79 %** (5 · 2 %) | **212 · 99 %** (198 · 92 %) | |

**In plain words.** Before this lane every page of a set was one drawing, a floor plan on no floor: 64 of the 238
drawings were "right" only because they happened to be plans, and 5 had their floor right by accident. Now 205 (86 %) are
read as what they are and 187 (79 %) with their floor, side or mark too; 212 of 215 pages are split into the right number of
drawings. The two architects' sets with words (the farmhouse, Quinta Monroy) and the three smaller ones are read without a
miss; the Dhaka brochures miss only what has no words at all (the location maps) or whose words are broken in the file.

## What is still wrong, and why

- **NIST's services set — the floors (24 plans).** The sheet's words are drawn as lines, not letters: only the plot stamp
  down the edge ("…\M-101-A1.dwg") is real text. The sheet number says *plan* (or detail, schedule, general), so the kind
  is right on 28 of 34, but "BASEMENT FLOOR PLAN — PLUMBING" cannot be read: the floors are not known. The first such plan
  goes on the ground, the others are left out until a person types their floors. Two pages hold two plans each (lighting
  and power of one floor) and are one row. Reading words drawn as lines would need the shapes of the letters — not now.
- **NIST F-601, M-002, E-105, E-501.** F-601 is riser diagrams on a sheet numbered as schedules (read: schedule); M-002
  is the mechanical *site* plan on a general sheet number (read: title); E-105 and E-501 carry no plot stamp, so nothing
  says what they are and their shape does not decide (read: other).
- **The twindo measurement report's 16 room pages.** Each is one room drawn large beside its table of measurements; the
  table's ruled rows make them *schedule*; the expected is *detail* (a part drawn large). They are not floors either way.
- **Location maps in the brochures (5).** A street map with no title and no plan in it: read *other*, left out. Tick it and
  set it to Site plan if it should be kept.
- **White Lake's "GROUND FLOOR" and "ROOFTOP".** The brochure's font gives some letter pairs as broken characters ("F?OR",
  "?OFTOP"), so those two titles cannot be read; the ground floor's page is read as its mezzanine only, the rooftop as
  other. One click puts them right. Its specification page (a drawing of a compass and set squares) is read *plan* by its
  shape, and left out (the brochure's plans name their floors).
- **A rooftop photo captioned "FRESH BREATHING ROOFTOP"** (Noboneer) reads as the rooftop's plan; it is left out because
  the real "ROOF FLOOR PLAN" already holds the rooftop.
- **Hannover and Arlington (one page each).** Nothing on the page names the drawing and the doors are not drawn as swing
  curves, so the page is *other* / *title* by its shape — but a one-page PDF with nothing written still opens at once as
  before, so for a person nothing changed.
- **Which floor is the "1st".** Every title's floor is read as printed. A set with no ground-floor plan (the US farmhouse,
  twindo, the Chilean set, Eastern Housing's "Level-01" lobby) puts its 1st floor on the ground, and the list says so; a
  set with a ground floor numbers up from it (Dhaka, the UK). A set that has a ground floor and *also* counts its 1st
  floor as the ground (rare) needs its floors typed once — the next set from that architect remembers.

## Stage 2 — levels from plans (session 31, levels lane)

**What changed for a person.** Build the project now (1) leaves the sheet's own symbols out of the walls, (2) puts every
plan on the floors the set says — a typical floor on every floor the brochure says the building has — and stacks the floors
over each other on the walls they share, (3) joins a floor drawn in parts, and asks once about a brochure's page-a-flat,
(4) asks before adding a set to the project open now, with Undo, and (5) takes a folder of DXF / SVG files as a set. How a
person uses it: [MANUAL §5 "Drop a whole set"](MANUAL.md). Measured in node with the Studio's own code (the quick loop:
`E:/dev/tmp/s31/levels/probe.mjs`, `levels.mjs`, `align.mjs`, `dxfalign.mjs`) and proven through the real drop in Firefox
(`build.mjs`, `add.mjs`, `toruset.mjs`; shots in `E:/dev/plotline-shots/s31/levels/`). The page-by-page reading above is
unchanged: 205 / 187 / 212 of 238 / 238 / 215 (node and Firefox).

### 1. Sheet symbols are not walls

A symbol is drawn at a size on paper whatever the scale, so it is found by paper size (`plan2d.ts sheetSymbols`, 5 tests):
a circle 2–20 mm across with a short text in it (an elevation or section marker, a grid bubble, a tag, a north arrow) and
the lines it carries within 2.4 radii (its triangle); an arrowhead (two short equal lines from a tip, 20–100° open, the barbs'
far ends free or joined to each other) with its shaft back to where it meets another line (the stair's UP / DN arrow, every
note's leader); a break line (a long line, a slanted zigzag crossing it, the line again on its line). A door drawn open at
45° is read as a door (`bezierArc` reads any circular curve, not only a quarter).

| Farmhouse floor | walls before → after | Issues before → after | rooms | symbol pieces that were walls (by eye, shot) |
|---|---|---|---|---|
| Ground (1ST FLOOR PLAN, a drawing) | 97 → 79 | 22 → 11 | 7 → 7 | 14 → 0 (six elevation markers' triangles, the stair's break line and arrow) |
| Floor 1 (2ND FLOOR PLAN) | 203 → 184 | 19 → 6 | 5 → 5 | the same markers gone; still a picture to trace (its stair treads, bath fixtures and porch roof pair as walls: 37 walls a room) |
| Roof (ROOF PLAN) | 91 → 91 | 68 → 68 | 0 | none — a roof of slopes is no floor: a picture |

The doors: 0 → 2 swings read as doors on the ground floor. Quinta Monroy level 1: 332 walls, Issues 95 → 94 (its junk is
drawn furniture, not symbols). twindo's sample table unchanged. Shots: `farm2-built.png` (the Studio, Issues 11),
`farm6sym.png` (`E:/dev/tmp/s31/levels/`: what was left out in magenta).

### 2. Levels, not pages

How tall the building is, read from any page: "2B+G+12", "B+G+M+12" (the mezzanine is floor 1), "G+9", "Basement + Ground
Floor + 9", "10 Storied" / "Number of Storied : 10" / "Floors: 09" (a storey count includes the ground) — a typical floor
with no numbers goes on every floor up to the top (`sheets.ts storeysOf`). Also read: "TYPICAL FLOOR PLAN 3RD–8TH",
"(2ND-9TH)", "PLANTA TIPO"; a house of a ground floor and a "2ND FLOOR" counts its ground as the 1st.

| Set | levels the building has | found before | found after | what told it |
|---|---|---|---|---|
| Farmhouse (US) | 3 | 3 | 3 | titles |
| Quinta Monroy (Chile) | 3 | 3 | 3 | titles |
| Fourplex 02 (Canada) | 2 | 1 | 2 | GROUND + 2ND FLOOR: the 2nd is floor 1 |
| Rangs The Sanctuary | 16 | 10 | 10 | "2B+G+12": the 12 floors stand (floors 2, 3, 5, 7, 9, 11 have no page: the Building view stands the floor below in) |
| Rangs White Lake | 23 | 21 | 21 | G and Roof: their titles are broken in the brochure's font |
| Rangs The Majestic | 16 | 16 | 16 | "B+G+M+12" agrees |
| Eastern Housing Pearl | 11 | 11 | 11 | ": 10 Storied" agrees |
| Eastern Housing Noboneer | 10 | 3 | **10** | "Floors: 09": TYPICAL FLOOR PLAN on floors 1–8 (was floor 1 only) |
| Akter Aleena | 12 | 4 | **12** | "Basement + Ground Floor + 9 (10 storied": Typical Floor Plan on 1–9 |
| Rangs Noorani Heights | 9 | 6 | 6 | its pages print the 2nd–4th and 3rd–7th floors only |
| Rangs Torukabbo | 14 | 14 | 14 | titles |
| **All** | **119** | **92** | **108** | |

**Floors stacked.** Each floor read at a known scale (printed, or its dimensions agree; a brochure's guessed scale is not
used) is put on the floor it shares most walls with (`projects.ts alignPlans`, `stackFloors`, 6 tests): every pair of corners
votes a shift, the 40 best, the columns' shift and the files' own frame (one PDF's page layout, one CAD model's coordinates)
are scored by the wall length they put on walls; the files' frame wins within 3 % (exact); under a quarter of the smaller
plan's walls is not placed. A floor that is a picture to trace gets its picture lined up the same way.

| Set | floors | core offset before (each in its own frame) | after | how |
|---|---|---|---|---|
| Farmhouse | G → 1 (a picture, its lines read) | 0.09 m | 0.00 m | the page layout (both plans print at one place), confirmed by the walls (51 % shared, 6 cm) |
| Quinta Monroy | level 1 → level 3 (a drawing) | 4.31 m | on its walls: 3.4 cm root-mean-square | the walls (63 % shared): the upper floors' stairs over the ground floor's (shot `E:/dev/tmp/s31/levels/q13.png`) |
| Quinta Monroy | level 1 → level 2 (a picture) | 4.28 m | 4.0 cm | the walls (75 % shared) |
| Loughborough pair of houses (DXF folder) | ground → first | 0.07 m | 0.00 m | the CAD model's coordinates (78 % of the walls shared) |
| Dhaka brochures (Sanctuary, Pearl, Noboneer, White Lake, Majestic, Torukabbo) | — | not stacked | not stacked | no scale on their pages (a picture to trace each, guessed or no scale): the person sets the scale (S) and traces |

Roof plans of slopes (the farmhouse) share too little and are left where their own drawing puts them.

### 3. Several plans for one floor

Two drawings on one page for one floor whose titles differ only by the part ("(LEFT PART)" / "(RIGHT PART)", "PART A" /
"PART B") are one drawing; titled apart ("Ground Floor" / "Ground Floor – Enhanced Accessible") they stay two (4 tests).
A brochure that prints a page a flat for the same floors asks once (a tick at the top of Plans):

| Brochure | flats on a typical floor | placed before | placed after | |
|---|---|---|---|---|
| Rangs Torukabbo (TYPE-A, B, C/G/K, D/H/L, E/I/M, F/J/N; LEVEL 1 to 11) | 14 (6 drawings, four used three times) | 1 (TYPE-A only) | ticked: 6 drawings side by side on floors 1–11, one picture to trace (shot `toru-floor.png`) | not where they stand: each page's key plan (the flat dark in a small outline of the towers) is not read yet — the person moves them |
| Rangs White Lake, Rangs Noorani Heights | 2 (TYPE A + TYPE B on each floor's page) | 2 | 2 | a whole floor a page: nothing to join |
| Akter Aleena | its Typical Floor Plan holds every flat | the typical plan | the typical plan | one drawing already: its flat pages ("1400 sft South-East facing") name no type and are left out |

### 4. Build adds to an open project

With a project open, Build the project asks "Add the set's floors (G, 1, 2) to the project open now, … ? Or make a new
project" (**Add to this project** / **New project** / Cancel); a floor that has a drawing is replaced only after a second yes
(the old drawing stays in the project on no floor); the set stacks on the project's own drawn floors. Undo in the message
puts the projects back. Firefox, Quinta Monroy built twice (`add.mjs`): after the first build 3 drawings on G, 1, 2; added
again with Replace: 6 drawings, the new ones on G, 1, 2, all 3 stacked on the old; Undo: 3 drawings, as before (shots
`add-ask-add.png`, `add-ask-replace.png`, `add-added.png`, `add-undone.png`).

### 5. A folder of DXFs / SVGs is a set

Several drawing files dropped together — a folder, its .zip, PDFs among them — open What is in this set: each DXF / SVG one
drawing, read as a file alone is, its kind and floor from its biggest title inside or its name (`sheets.ts fileView`: GF, 1F,
RF, TYP, B1, E-1, S-2, A-201; 2 tests), its picture drawn from its lines; one drawing saved as DXF and PDF is read from the
DXF; a DWG beside its DXF is left out; of two plans of one floor the one with more rooms is used.

| Folder | files | drawings listed | plans → floors | kept | stacked |
|---|---|---|---|---|---|
| Loughborough matched pair of semi-detached houses (`Floorplan_Site_Elevations.zip`: 9 DXF, 9 DWG, 9 PDF) | 27 | 11 (9 DXF + 2 PDF prints of other names) | Internal walls ground → G, first → 1 (the External-walls-only twins and the PDF prints left out) | 4 elevations (east, north, south, west) + the site plan, with their pictures | first on ground, by the model's coordinates |

Shots: `lboro-set.png`, `lboro-built.png`, `lboro-building.png` (two storeys standing one over the other).

### Still not done

- **The key plan.** A brochure's flat page shows where its flat stands in a small outline of the floor; it is not read, so
  joined flats are side by side, not in place (Torukabbo). The typical floor plan, when the brochure has one, is still the
  better drawing.
- **The farmhouse's upper floor stays a picture.** Its stair treads, bath fixtures and the porch roof drawn with the same pen
  as the walls pair into 184 "walls" for 5 rooms; a rule for stair treads (equal parallel lines at tread spacing) would be the
  next step.
- **Brochure pages are not stacked**: they have no scale; once the person sets each picture's scale (S), lining them up is
  the Studio's own "Use its scale and position" or by hand.
- **Floors with no page** (Sanctuary's 2nd, 3rd, 5th …) are not guessed from the nearest page: the Building view stands the
  floor below in, as before.

## Stage 3 — heights from sections and elevations (session 31, heights lane)

**What changed for a person.** Until now every storey of every project was 3.20 m floor to floor with 3 m walls and a 1.1 m
parapet, whatever the drawings said. Now **What is in this set** shows, under every section and elevation, the heights its
level marks print — floor to floor, the top floor's ceiling, the slab, a flat roof's level and parapet or a pitched roof's
eave and ridge — as fields a person can type over (remembered by the drawing's title); under the list, what the project
will be built to, with one question where two drawings differ by more than 5 cm. **Build the project** builds every storey
to them: each floor at its own level, its walls a slab short of the next floor, the slab and parapet as printed, a pitched
(or hipped) roof from the eave to the ridge; walking a flat its ceiling is at its storey's height. A set whose drawings print
no levels says so and is built exactly as before (a test proves the tower vertex for vertex). How a person uses it:
[MANUAL §5 "Drop a whole set"](MANUAL.md).

**How it reads, with no AI** (`src/import/heights.ts` and `src/data/building/storeys.ts`: 81 tests; 6 more on the tower in `three/building.test.ts`). A level mark is a
horizontal line with its words beside it: a name ("1ST FLOOR (FINISH)", "CEILING (T.O. PLATE)", "ROOF RIDGE", "ROOF EAVE",
"PARAPET", "B1", "N.P.T", "F.F.L.", "OKFF") and / or its value ("+10'-0"", "+2.34", "±0.00", "EL. 103.05", "+3050" mm). A
name pairs with the value under or over it; a value alone is a mark with no name (Elemental prints only "+2.34" at its level
triangles). A name with no value counts only when it is set like the view's valued names and stands on a level line (a
note's "EAVE / T.O. FASCIA" in small letters is no mark). The height is the value printed; else the line measured at the
view's printed scale from the nearest printed mark (or the ground floor's line); else the scale comes from two printed
marks, or from a dimension printed in the middle between two level lines ("9'-1""). The marks become the building's
heights: the ground floor is the one named so (else the one at 0, else the lowest — a US set's "1ST FLOOR" is the ground,
as its plans are counted), floors over it numbered up in order; a top under the top floor is a lower roof's (the farmhouse
porch's eave +9'-6") — but a ceiling under the next floor gives the slab; values alone at the top with no roof named are the
roof (two within 1.3 m: its slab and its parapet or edge); a ridge 1.3 m or more over the eave is a pitched roof, hipped
when an elevation shows its long side as a trapezoid (a gable shows a rectangle). Several views vote: sections first,
elevations confirm, more than 5 cm apart is a question; a typed number is never questioned.

**How it was scored — the founder's path.** Firefox (Playwright's build on E:, headless, one browser), a fresh Studio for
every set, the set **dropped** (a real drop event), the list left to read every page; what each section's and elevation's
row holds is compared with the heights printed on it — the *printed* column, read by eye from every section and elevation
page (`E:/dev/tmp/s31/heights/expected.json`, written before scoring). A height counts as right within 5 cm. Harness:
`E:/dev/tmp/s31/heights/score.mjs` (raw `runs/score.json`, tables by `table.mjs`); a shot of each set's Heights line in
`E:/dev/plotline-shots/s31/heights/score/`. The farmhouse, Quinta Monroy and one Dhaka brochure (Eastern Housing Pearl)
were then built end to end in Firefox (`build.mjs`): shots of the Set panel's heights and of the Building view and the walk
with the read heights and, for comparison, the same project with its heights taken away (as before this lane), in
`E:/dev/plotline-shots/s31/heights/`.

### Totals

| Set | sections + elevations | with levels printed | heights printed | read right within 5 cm | wrong | missed | read with none printed | questions | the set, as built | read in |
|---|---|---|---|---|---|---|---|---|---|---|
| Farmhouse drawing set (Amatect, US) | 7 | 7 | 21 | 21 · 100 % | 0 | 0 | 0 | 0 | 4 / 4 | 2.7 s |
| Quinta Monroy (Elemental, Chile) | 6 | 4 | 14 | 14 · 100 % | 0 | 0 | 0 | 0 | 4 / 4 | 1.6 s |
| NIST net-zero house, services set (US) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 4.9 s |
| Fourplex 02 (CMHC, Canada) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 1.1 s |
| Loughborough pair of houses (DXF folder) | 4 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 1.3 s |
| Rangs The Sanctuary (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 9.0 s |
| Rangs White Lake (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 1.8 s |
| Rangs The Majestic (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 7.9 s |
| Eastern Housing Pearl (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 2.0 s |
| Eastern Housing Noboneer (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 5.8 s |
| Rangs Torukabbo (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 2.5 s |
| Akter Aleena (Dhaka brochure) | 0 | 0 | 0 | — | 0 | 0 | 0 | 0 | none printed: says so, 3.20 m storeys as before | 2.3 s |
| **All** | **17** | **11** | **35** | **35 · 100 %** | **0** | **0** | **0** | **0** | **8 / 8** | |

**In plain words.** Two of the twelve sets print levels on their sections and elevations: the farmhouse (7 drawings, 21
heights printed) and Quinta Monroy (4 sections, 14). All 35 are read right within 5 cm, no drawing disagrees with another by
more than 5 cm (no question asked), and both projects are built to them (the set's 4 heights each). The other ten sets print
none — the Dhaka brochures have no section or elevation at all — and the panel says so; they are built as before. Reading a
set takes as long as it did (Stage 1's column above: farmhouse 3.8 s, Sanctuary 8.5 s, Noboneer 6.8 s).

#### Farmhouse drawing set (Amatect, US)

| drawing | printed (by eye) | read | right? |
|---|---|---|---|
| FRONT ELEVATION (SOUTH) (p12) | floor 1 3.05, eave 6.10, ridge 8.89 | floor 1 3.05, eave 6.10, ridge 8.89 | 3 / 3 |
| SIDE ELEVATION (WEST) (p13) | floor 1 3.05, eave 6.10, ridge 8.89 | floor 1 3.05, eave 6.10, ridge 8.89 | 3 / 3 |
| BACK ELEVATION (NORTH) (p14) | floor 1 3.05, eave 6.10, ridge 8.89 | floor 1 3.05, eave 6.10, ridge 8.89 | 3 / 3 |
| SIDE ELEVATION (EAST) (p15) | floor 1 3.05, eave 6.10, ridge 8.89 | floor 1 3.05, eave 6.10, ridge 8.89 | 3 / 3 |
| SECTION LOOKING NORTH (p18) | floor 1 3.05, ceiling 5.79, ridge 8.89 | floor 1 3.05, ceiling 5.79, ridge 8.89 | 3 / 3 |
| SECTION @ LIVING ROOM & MAIN BEDROOM (p19) | floor 1 3.05, ceiling 5.79, ridge 8.89 | floor 1 3.05, ceiling 5.79, ridge 8.89 | 3 / 3 |
| SECTION THROUGH CENTRAL HALL AND STAIRCASE (p20) | floor 1 3.05, ceiling 5.79, ridge 8.89 | floor 1 3.05, ceiling 5.79, ridge 8.89 | 3 / 3 |
| **the set, as built** | floor 1 3.05, ceiling 5.79, eave 6.10, ridge 8.89 | floor 1 3.05, ceiling 5.79, eave 6.10, ridge 8.89 | 4 / 4 |

slab printed only on a detail page (1st floor ceiling +9'-0": 1'-0" slab); the west elevation also prints the porch roof eave +9'-6" (a lower roof).

#### Quinta Monroy (Elemental, Chile)

| drawing | printed (by eye) | read | right? |
|---|---|---|---|
| ELEVACION FRONTAL (p3) | no level printed | nothing | yes |
| ELEVACION POSTERIOR (p3) | no level printed | nothing | yes |
| CORTE A-A (p4) | floor 1 2.34, floor 2 4.68, roof 7.32, roof edge / parapet 0.16 | floor 1 2.34, floor 2 4.68, roof 7.32, roof edge / parapet 0.16 | 4 / 4 |
| CORTE B-B (p4) | floor 1 2.34, floor 2 4.72, roof 7.32, roof edge / parapet 0.16 | floor 1 2.34, floor 2 4.72, roof 7.32, roof edge / parapet 0.16 | 4 / 4 |
| CORTE C-C (p4) | floor 1 2.34, roof 7.32, roof edge / parapet 0.16 | floor 1 2.34, roof 7.32, roof edge / parapet 0.16 | 3 / 3 |
| CORTE D-D (p5) | floor 1 2.34, floor 2 4.68, roof 7.30 | floor 1 2.34, floor 2 4.68, roof 7.30 | 3 / 3 |
| **the set, as built** | floor 1 2.34, floor 2 4.68, roof 7.32, roof edge / parapet 0.16 | floor 1 2.34, floor 2 4.68, roof 7.32, roof edge / parapet 0.16 | 4 / 4 |

the roof is printed at two edges, +7.32 and +7.48 (a 16 cm fall); D-D also prints N.P.T -20 (a step outside, in centimetres).

#### Loughborough pair of houses (DXF folder)

| drawing | printed (by eye) | read | right? |
|---|---|---|---|
| Elevation_East (p1) | no level printed | nothing | yes |
| Elevation_North (p1) | no level printed | nothing | yes |
| Elevation_South (p1) | no level printed | nothing | yes |
| Elevation_West (p1) | no level printed | nothing | yes |
| **the set, as built** | — | — | — |

four elevations drawn at full size with no level marks.

**The roof's kind.** The farmhouse's main roof is a gable (its front and back elevations draw the ridge the whole length, its
side elevations a triangle): read as a gable — front and back *rectangle*, west and east *triangle* (`roofOutline`). No set in
the corpus has a hipped main roof drawn in elevations; the rule is tested on made-up outlines.

**With the numbers hidden** (node, the Studio's own code, `E:/dev/tmp/s31/heights/measured.mjs`): every printed value taken
off the farmhouse's sections and elevations, the heights measured from the level lines alone at the printed 1/4" = 1'-0" —
19 of the 21 printed heights come back, all within 2 cm (the 2 lost: "+19'-0"" printed with no name on two sections, so with
its number gone nothing is left). Quinta Monroy prints values only (no names): with them hidden there is nothing to measure.

**What the 3D now shows** (`E:/dev/plotline-shots/s31/heights/`, each beside the same project with its heights taken away —
as every project was before this lane):
- **Quinta Monroy** — `quinta-building.png` / `quinta-building-before.png`: storeys of 2.34 m (were 3.20), the roof at
  +7.32 with its 16 cm edge (was a 1.10 m parapet): the house stands a metre and a half lower among its neighbours.
  `quinta-walk.png` / `quinta-walk-before.png`: the ground floor walked, its ceiling at 2.19 m (2.34 less the slab) just over
  the door head; before, 3.05 m. Set panel: `quinta-heights.png`, `quinta-heights-sum.png`.
- **Farmhouse** — `farm-building.png` / `farm-building-before.png`: the ground floor 3.05 m floor to floor, a gable roof from
  the eave at +6.10 to the ridge at +8.89 with its gable ends (before: no roof at all over a floor still a picture). Its upper
  floor is still a picture to trace (Stage 2: its lines pair into 184 "walls"), so the roof stands over the ground floor's
  outline at its printed height, a storey of air under it until the 2nd floor is traced. Set panel: `farm-heights.png`,
  `farm-heights-sum.png`.
- **Eastern Housing Pearl** (a Dhaka brochure) — `pearl-heights-sum.png`: "No section or elevation in this set prints its
  levels: every storey stays 3.20 m floor to floor, as before"; built, `pearl-building.png` is the tower as before.

### Still not done, and why

- **No Dhaka brochure in the corpus prints a section or an elevation in lines.** The 45 brochure PDFs in `Demo drawings`
  were scanned page by page (`scan.mjs`): none has one; Sheltech Banani is pictures only. The heights the founder's clients
  care about wait for an architect's set (PLAN_DRAWING_SETS §4). The made-up Dhaka-style section in the tests (basement,
  ground, typical floors, ROOF, PARAPET, values in metres) is read right. Torukabbo's specification line "Double Height in
  Ground Floor, up to 15'-0''" is words on a brochure page, not a level mark: not read.
- **The slab.** No section or elevation in the corpus prints it; the farmhouse prints its 1st floor ceiling (+9'-0", a
  1'-0" floor) only on a detail page of several details at several scales, which is not read for heights (their marks would
  mix). Every built project takes 0.15 m unless a person types it.
- **The roof is one box over the whole top floor**: an L-shaped house gets one roof over its box; no overhang, no dormers;
  all slopes alike. Which way the ridge runs is the box's long side (the farmhouse's is right), not read from the elevations.
- **A mark that is only a number** (Elemental) cannot be measured when its number is hidden; a value with no name at the top
  of a section is taken as the roof (two within 1.3 m: its slab and edge) — a section cut through a 1.4 m parapet with no
  words would read as a pitched roof. The panel shows it and a person corrects it.
- **DXF elevations are not read for marks** (the folder path reads each DXF's lines for its picture; the Loughborough
  elevations have no level marks anyway).
- **After the build the heights cannot be changed in the Studio**: they are typed in What is in this set before building
  (or the set is built again). A field for them in the project's floor list is the next step.
- **A traced level's full-height wall** (3 m or more) stands its storey; a deliberately double-height wall on a traced ground
  floor would be cut to the storey.

## Page by page

### Farmhouse drawing set (Amatect, US)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | title | title | left out | yes |
| 2 | site · site | site · site | kept · kept | yes |
| 3 | title | title | left out | yes |
| 4 | site | site | kept | yes |
| 5 | plan | plan | left out | yes |
| 6 | plan:1 | plan:1 | → G | yes |
| 7 | plan:2 | plan:2 | → 1 | yes |
| 8 | plan:R | plan:R | → Roof | yes |
| 9 | plan:1 | plan:1 | left out | yes |
| 10 | plan:2 | plan:2 | left out | yes |
| 11 | detail | detail | left out | yes |
| 12 | elevation:south | elevation:south | kept | yes |
| 13 | elevation:west | elevation:west | kept | yes |
| 14 | elevation:north | elevation:north | kept | yes |
| 15 | elevation:east | elevation:east | kept | yes |
| 16 | interior · interior · interior · interior | interior · interior · interior · interior | kept · kept · kept · kept | yes |
| 17 | interior · interior · interior · interior · interior | interior · interior · interior · interior · interior | kept · kept · kept · kept · kept | yes |
| 18 | section | section | kept | yes |
| 19 | section | section | kept | yes |
| 20 | section | section | kept | yes |
| 21 | detail | detail | left out | yes |
| 22 | detail | detail | left out | yes |
| 23 | detail | detail | left out | yes |
| 24 | detail | detail | left out | yes |
| 25 | schedule | schedule | kept | yes |

### Quinta Monroy (Elemental, Chile)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | plan:1 | plan:1 | → G | yes |
| 2 | plan:2 · plan:3 | plan:3 · plan:2 | → 2 · → 1 | yes |
| 3 | elevation:front · elevation:back | elevation:front · elevation:back | kept · kept | yes |
| 4 | section:A-A · section:B-B · section:C-C | section:A-A · section:B-B · section:C-C | kept · kept · kept | yes |
| 5 | section:D-D | section:D-D | kept | yes |

### NIST net-zero house, services set (US, words drawn as lines)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | title | title | left out | yes |
| 2 | plan:B1 | plan | → G | kind yes, floor / side no |
| 3 | plan:1 | plan | left out | kind yes, floor / side no |
| 4 | plan:2 | plan | left out | kind yes, floor / side no |
| 5 | plan:attic | plan | left out | kind yes, floor / side no |
| 6 | detail | schedule | kept | no |
| 7 | plan:B1 | plan | left out | kind yes, floor / side no |
| 8 | plan:1 | plan | left out | kind yes, floor / side no |
| 9 | plan:2 | plan | left out | kind yes, floor / side no |
| 10 | plan:attic | plan | left out | kind yes, floor / side no |
| 11 | detail | detail | left out | yes |
| 12 | schedule | schedule | kept | yes |
| 13 | title | title | left out | yes |
| 14 | site | title | left out | no |
| 15 | plan:B1 | plan | left out | kind yes, floor / side no |
| 16 | plan:1 | plan | left out | kind yes, floor / side no |
| 17 | plan:1 | plan | left out | kind yes, floor / side no |
| 18 | plan:2 | plan | left out | kind yes, floor / side no |
| 19 | plan:attic | plan | left out | kind yes, floor / side no |
| 20 | plan:B1 | plan | left out | kind yes, floor / side no |
| 21 | detail | detail | left out | yes |
| 22 | detail | detail | left out | yes |
| 23 | schedule | schedule | kept | yes |
| 24 | title | title | left out | yes |
| 25 | plan:B1 · plan:B1 | plan | left out | split no |
| 26 | plan:1 | plan | left out | kind yes, floor / side no |
| 27 | plan:1 | plan | left out | kind yes, floor / side no |
| 28 | plan:2 · plan:2 | plan | left out | split no |
| 29 | plan:attic | other | left out | no |
| 30 | detail | other | left out | no |
| 31 | detail | detail | left out | yes |
| 32 | schedule | schedule | kept | yes |

### Fourplex 02 (CMHC, Canada)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | title | title | left out | yes |
| 2 | plan:G · plan:G | plan:G · plan:G | → G · left out | yes |
| 3 | plan:2 | plan:2 | → 1 | yes |

### Backcountry house plan (twindo, US)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | plan:1 | plan:1 | → G | yes |
| 2 | plan:2 | plan:2 | → 1 | yes |

### Backcountry measurement report (twindo, US)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 1 | title | title | left out | yes |
| 2 | title | title | left out | yes |
| 3 | plan:1 | plan:1 | → G | yes |
| 4 | plan:1 | plan:1 | left out | yes |
| 5 | detail | schedule | kept | no |
| 6 | detail | schedule | kept | no |
| 7 | detail | schedule | kept | no |
| 8 | detail | schedule | kept | no |
| 9 | detail | schedule | kept | no |
| 10 | detail | schedule | kept | no |
| 11 | detail | schedule | kept | no |
| 12 | plan:2 | plan:2 | → 1 | yes |
| 13 | plan:2 | plan:2 | left out | yes |
| 14 | detail | schedule | kept | no |
| 15 | detail | schedule | kept | no |
| 16 | detail | schedule | kept | no |
| 17 | detail | schedule | kept | no |
| 18 | detail | schedule | kept | no |
| 19 | detail | schedule | kept | no |
| 20 | detail | schedule | kept | no |
| 21 | detail | schedule | kept | no |
| 22 | detail | schedule | kept | no |

### Rangs The Sanctuary (Dhaka brochure)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 4 | site | other | left out | no |
| 17 | plan:G · plan:B1 | plan:G · plan:B1 | → G · → B1 | yes |
| 18 | plan:B2 · plan:1 | plan:B2 · plan:1 | → B2 · → 1 | yes |
| 19 | plan:4,10 · plan:6,8 | plan:4,10 · plan:6,8 | → 4,10 · → 6,8 | yes |
| 20 | plan:12 · plan:R | plan:12 · plan:R | → 12 · → Roof | yes |
| 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 25, 26, 27, 28 | title / other (photos, words, covers) | title / other | left out | yes |

### Rangs White Lake (Dhaka brochure)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 3 | site | other | left out | no |
| 21 | title | plan | left out | no |
| 23 | plan:G · plan:mezz | plan:mezz | → 1 | split no |
| 24 | plan:B1 · plan:B2 | plan:B1 · plan:B2 | → B1 · → B2 | yes |
| 25 | plan:2 | plan:2 | → 2 | yes |
| 26 | plan:3 | plan:3 | → 3 | yes |
| 27 | plan:4 | plan:4 | → 4 | yes |
| 28 | plan:5,7,9,11,13,15,17,19 | plan:5,7,9,11,13,15,17,19 | → 5,7,9,11,13,15,17,19 | yes |
| 29 | plan:6,8,10,12,14,16,18 | plan:6,8,10,12,14,16,18 | → 6,8,10,12,14,16,18 | yes |
| 30 | plan:R | other | left out | no |
| 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 31, 32, 33, 34, 35, 36 | title / other (photos, words, covers) | title / other | left out | yes |

### Rangs The Majestic (Dhaka brochure)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 5 | site | other | left out | no |
| 16 | plan:B1 | plan:B1 | → B1 | yes |
| 17 | plan:G · plan:mezz | plan:G · plan:mezz | → G · → 1 | yes |
| 18 | plan:2,4,6,8,10,12 · plan:3,5,7,9,11,13 | plan:2,4,6,8,10,12 · plan:3,5,7,9,11,13 | → 2,4,6,8,10,12 · → 3,5,7,9,11,13 | yes |
| 19 | plan:R | plan:R | → Roof | yes |
| 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 26, 27 | title / other (photos, words, covers) | title / other | left out | yes |

### Eastern Housing Pearl (Dhaka brochure)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 3 | site | other | left out | no |
| 6 | plan:2,3,5,7,9 | plan:2,3,5,7,9 | → 1,2,4,6,8 | yes |
| 7 | plan:4,6,8,10 | plan:4,6,8,10 | → 3,5,7,9 | yes |
| 9 | plan:1 | plan:1 | → G | yes |
| 10 | plan:R | plan:R | → Roof | yes |
| 1, 2, 4, 5, 8, 11, 12, 13, 14, 15 | title / other (photos, words, covers) | title / other | left out | yes |

### Eastern Housing Noboneer (Dhaka brochure)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| 6 | site | other | left out | no |
| 7 | plan:G | plan:G | → G | yes |
| 8 | plan:typ | plan:typ | → 1,2,3,4,5,6,7,8 | yes |
| 9 | plan:R | plan:R | → Roof | yes |
| 13 | other | plan:R | left out | no |
| 1, 2, 3, 4, 5, 10, 11, 12, 14 | title / other (photos, words, covers) | title / other | left out | yes |

### Single sheets (the samples' one-page PDFs)

| page | expected | read | used when built | right? |
|---|---|---|---|---|
| Casa Steiner | plan:G | plan:G | opens at once, as before | yes |
| Hannover Pagenstr. 2 | plan | other | opens at once, as before | no |
| DfE primary school | plan:G | plan:G | opens at once, as before | yes |
| Irish apartment A1 | plan | plan | opens at once, as before | yes |
| Newburn flats | plan | plan | opens at once, as before | yes |
| Arlington House | plan | title | opens at once, as before | no |
