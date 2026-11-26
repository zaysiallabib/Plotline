# The engine for whole projects — plan (2026-11-26)

The founder's verdict, after dropping real drawing sets: "the current system is only working on floor plans and that
too in the wrong way … it has no system to read documents like elevations … there were a lot of files with all
construction related details and the system just blindly chose to draw lines on everything … I need something that
will work on every project, not just using you. You are the engineer, you build the engine that makes the flawless
models." No AI unless absolutely necessary.

## 1. What is wrong today, in one list

1. **Every page is treated as a floor plan.** Elevations, sections, interior elevations, detail sheets, schedules and
   title blocks all get walls drawn over them. There is no step that asks "what kind of drawing is this?"
2. **A page with several drawings on it** (two floor plans side by side, four kitchen elevations) is read as one
   drawing, so the walls of one are glued to the other.
3. **Elevations and sections are not read at all.** The building's outside — window heights, floor heights, roof,
   parapet, materials — never reaches the 3D. The outside shape comes only from a dropped 3D model.
4. **A plan's level is not read from its title** ("2ND FLOOR PLAN", "PLANTA SEGUNDO NIVEL" → floor 2). Every drawing
   lands as "Floor" and a person sorts it by hand.
5. **Big architect models drown the person in marks.** A 3 000-wall storey (a university building) shows hundreds of
   "loose end" badges. Nobody can work with that.
6. **DWG is refused** without an online converter key; SVGs that are traced scans come out as scattered pieces.
7. **The person's path is still "one plan → one flat".** The project (floors, types, facades, site) is assembled by
   hand afterwards.

## 2. What a whole project is, as it arrives

A developer's architect sends a **drawing set**: a PDF (20–80 pages) and/or DWG / DXF files, sometimes an IFC model.
A set holds: a site plan, a floor plan per level (basements, ground, typical floors, roof), four elevations, one or
two sections, door / window schedules, finish schedules, details, a title block on every page with the sheet name,
number, scale and level. Everything the 3D needs is in it. Nothing has to be invented, so nothing needs an AI.

| Sheet | What it gives the 3D |
|---|---|
| Floor plan (per level) | walls, openings' positions, rooms, names, stairs, lifts, columns, the level it is for |
| Elevation (N / S / E / W) | floor-to-floor heights, every window's sill and head, the roof line, parapet, balconies, materials |
| Section | storey heights, slab thickness, basement depth, roof pitch, what each floor line means |
| Site plan | plot boundary, setbacks, true north, the road side, neighbours |
| Door / window schedule | each tag (W1, D3) → size, sill, kind; links the plan's tags to real openings |
| Finish schedule | the included finish per room |
| Details, interior elevations, title sheets | kept as reference pictures, never traced |

## 3. The engine, stage by stage (each stage proven on real sets before the next)

**Stage 1 — Sheet understanding.** Drop the whole set. For every page the engine says what it is and for what:
`plan · floor 2`, `elevation · north`, `section · A-A`, `site plan`, `schedule · windows`, `detail`, `title`. Two
signals, both deterministic: (a) the words on the page — the view titles under each drawing ("2ND FLOOR PLAN SCALE
1/4" = 1'-0"", "BACK ELEVATION (NORTH)", "SECTION @ LIVING ROOM", "PLANTA SEGUNDO NIVEL 1:50") in the languages the
layer table already knows; (b) the drawing's own shape — a plan has closed rooms of parallel wall pairs and door
swings; an elevation has a ground line, stacked horizontals and nested window rectangles and no swings; a section has
hatched cut walls and stacked slabs; a detail has a scale finer than 1 : 20. A page with several titled views is split
into those views, each with its own scale. **Only plans become walls.** Everything else is kept with the project as
what it is. A "Set" panel lists every page with its kind and level; one click corrects a wrong guess, and the
correction is remembered for the architect's next set.
Proof: a scoreboard over complete sets (the farmhouse set's 25 pages, the Elemental set, Casa Steiner, every
multi-page PDF in the corpus, then his clients' sets): pages classified right / split right / level right.

**Stage 2 — Levels from plans.** Each plan goes to its level from its title; levels stack by their shared grid and
core (stairs, lifts, columns); the same drawing on floors 2–8 is one drawing on seven floors (what the project panel
does today, now filled in by the engine). Basement, ground, typical, roof. Proof: levels found / expected per set.

**Stage 3 — Heights from sections and elevations.** Floor-to-floor per level, slab thickness, parapet, roof shape
(flat / pitched, eave and ridge heights), basement depth. Today every storey is 3.0 m. Proof: heights read / printed.

**Stage 4 — The outside from elevations.** For each facade: window and door openings as rectangles (x along the
facade, sill and head), balconies, columns, materials by hatch. Matched to the plan: the plan says where each exterior
opening is along the wall, the elevation says how tall — together an exact window, and the plan's tag + the schedule
confirm it. The 3D's outside is then built from the set, not from a dropped model: this is the "accurate outside view".
Proof: openings matched plan ↔ elevation / total, per facade, per set.

**Stage 5 — Site.** Plot, setbacks, north and the road from the site plan; neighbours from the map as today.

**Stage 6 — Schedules.** W1 / D3 tags resolved to sizes and kinds; finish schedules to the included finish per room.

**Stage 7 — Big models.** An IFC of a whole building: storeys are already exact; what is missing is restraint — loose
ends and names on a 3 000-wall floor grouped, counted and shown as one row per kind with a "fix all the same" button,
never hundreds of badges; the person picks the flats to show, the rest stays as shells.

**Stage 8 — Formats.** DWG: a converter key, or the architect's DXF (one line in the message says how). Traced-scan
SVGs are refused as drawings with the reason and offered as pictures.

**Stage 9 — One path in the Studio.** "Drop the set" → the Set panel → "Build the project": levels, facades, site,
schedules, all from the set, every unsure thing a one-click row. The present single-plan path stays for brochures.

## 4. What the founder has to give (the engine is only as good as the sets it is built against)

1. **3–5 complete real drawing sets from the lined-up clients**, exactly as the architect sent them (PDF + DWG / DXF;
   IFC if there is one). Dhaka sets, with their title blocks. These are the proof for every stage; the public sets
   fetched so far stand in until they arrive.
2. **DWG:** the CloudConvert key (Docs/SETUP_FORMATS.md, ten minutes, free) or DXF exports from the architects.
3. **A yes / no on each stage's sample** when it is shown (one set, one building), nothing else.

## 5. Where AI is and is not needed

- Vector files (PDF with lines, DXF, DWG, IFC, SVG): no AI. The lines, words and tags are exact; the engine reads
  them deterministically and the scoreboard proves it.
- Raster brochure pictures (JPEG): the existing Auto-trace stays; room names through the local OCR already in the
  product. No cloud model.
- The only place a model might ever be worth it: a scanned, hand-drawn or photographed set with no vector lines.
  Not now; it would be optional and behind a button, as today.

## 6. Order and size

Stage 1 first (everything else stands on it), Stage 7 beside it (it is what the IFC screenshots show); then 2 → 3 →
4 with the client sets; 5, 6, 8, 9 after. Each stage is one lane with a scoreboard, a test per rule, and a MANUAL
section; a stage that does not raise its scoreboard on the real sets does not merge.
