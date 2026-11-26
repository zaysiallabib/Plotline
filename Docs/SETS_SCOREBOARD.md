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
| 3 | plan:2 | plan:2 | → 2 | yes |

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
| 8 | plan:typ | plan:typ | → 1 | yes |
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
