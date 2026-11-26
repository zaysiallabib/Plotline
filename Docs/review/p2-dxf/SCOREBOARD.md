# DXF scoreboard — his reader against ours, file by file

Session 31, lane p2dxf (2026-11-26). The same 73 files dropped on **our** Studio (`s31/redesign` `bb23229`, dev server
5226) and on **his** Studio (Maheer's fork `Plotline2.O-main`, dev server 5236), each in a fresh Firefox page (Playwright's
Firefox on E:, headless, one browser at a time), as the founder would: the file DROPPED on the Studio.

- **Ours** reads at once; nothing is clicked.
- **His** opens "Import a DXF floor plan" with the file; "Automatically import a whole floor" is on. When it stops for a
  person, his own guesses are accepted as they are (layers, drawing = the first choice, model space), **Build and review**,
  then **Import whole floor**. A file with no units has an empty scale box in his dialog: it was given the scale OUR reader
  worked out (`scaleTyped` in the JSON) — the founder would have to know that number. *clicks* = what a person had to do.
- Both drawings are then counted by the **same code** (ours: `core.deriveRooms`, `core.validate`, `studio/model.studioIssues`)
  — ours as our Studio opens it, his as his Studio holds it (his own **Export**). *Closed rooms* = closed faces of at least
  1 m². *Review rows*: ours = our Issues list; his = his "DXF review" rows + his Issues list.
- **Truth** where known: our 20 built-ins (counted the same way from their `.json`), and his fixture (7 walls, 2 rooms,
  2 openings, from his brief). The built-ins were exported with the Studio's own **⋯ → Export as DXF** (each `.json`
  dropped on the Studio first) — "as exported" still carries the drawing as DXF comments (our reader opens it exactly by
  design); "lines only" is the same file with the comments cut off, as a CAD program saves it.
- Verdicts as in `Docs/FORMATS_SCOREBOARD.md`: *clean* = no crossings, every name in its own closed room, at least one
  closed room; *rooms open* = walls but a crossing or a name outside a room; *no walls*; *refused*; *not read in 5 min*.

Scripts and raw results: `E:/dev/tmp/s31/p2dxf/` — `export-builtins.mjs`, `ours.mjs`, `his.mjs`, `count-his.mjs`,
`count.mjs`, `table.mjs`, `undo.mjs`, `probe.mjs`; `runs/ours.json`, `runs/his.json`, `runs/per-file.json`; his exported
drawings `runs/his-units/`. Shots: `E:/dev/plotline-shots/s31/p2dxf/ours/` and `…/his/` (`-1-layers` his dialog before
building, `-2-result` after, `-3-studio` the Studio after the import).

**A third pass, "his, our layers"**: his dialog with "Automatically import" off and every layer set to what OUR reader took
it as (walls / doors / windows / room text / dimensions; our columns, zone lines, kerbs and ignored layers → Ignore; a
layer we could not place keeps his guess) — so his wall-and-opening engine gets the same understanding of the file as
ours. A fourth file set, **"plain CAD"**: the five built-in flats' lines-only exports with every Plotline layer removed
(no centre lines, no PLOTLINE_ layer names), so neither reader knows them as Plotline's own — clean real-world CAD
drawings (walls as closed outlines on WALLS, DOOR-n / WIN-n blocks, names on TEXT) with exact truth.

## Summary

| group | files | ours | his (dropped, his guesses) | his given our layer roles |
|---|---|---|---|---|
| Real DXF files (corpus + DWG-converted + 2026-11-22 samples) | 32 | clean 15, rooms open 7, no walls 9, not read in 5 min 1 | **refused 16**, rooms open 11, clean 5 | refused 16, rooms open 12, clean 4 |
| His fixture (`two-room-floor.dxf`) | 1 | clean but **wrong**: 4 walls, 1 room, 0 openings (truth 7 / 2 / 2) | **right**: 7 walls, 2 rooms, 2 openings, imported with no click | right |
| Our 20 built-ins, as exported | 20 | 20 exactly the truth | rooms open 20 | — (no layer list: ours opens these from the comment copy) |
| Our 20 built-ins, lines only | 20 | 20 clean; walls, openings, names exactly the truth (3 levels keep 1–4 loose ends) | rooms open 20 | rooms open 19, clean 1 |
| 5 built-in flats as plain CAD | 5 | clean 5, but 78 of 116 rooms named | rooms open 5, 72 of 116 named | the same as his guesses (his guesses were already right) |

Totals over the 32 real files (both drawings counted by the same code):

| | ours | his | his, our layers |
|---|---|---|---|
| files that gave walls | 22 | 16 | 16 |
| walls | 1 293 | 2 727 | 2 514 |
| openings | 260 | 172 | 161 |
| closed rooms (≥ 1 m²) | 135 | 69 | 45 |
| named rooms | **70** | 16 | 25 |
| loose ends | **187** | 875 | 801 |
| crossings (the 3D breaks there) | **0** | 57 | 36 |
| review rows | 342 (Issues) | 3 072 DXF review + 1 091 Issues | — |
| what a person does to get a drawing | nothing (drop) | 2–3 steps on each of the 16 it drew (type a scale when the file has none, Build and review, Import whole floor) | 2–18 (each layer set by hand, then the same) |

The 5 plain-CAD flats against the truth (429 walls, 161 openings, 112 closed rooms, 116 named): **ours** 513 walls, 134
openings, 73 closed, 78 named, 44 loose ends, 0 crossings; **his** 2 852 walls, 199 openings, 68 closed, 72 named, 827
loose ends, 269 crossings, 1 673 DXF review rows. Both miss about a third of the rooms on a clean plain-CAD flat; his
also breaks the drawing (crossings) and asks about everything.

Undo (`undo.mjs`, Firefox): Type A open, then a DXF dropped on it. **His** asks "Replace your current drawing with this
DXF? Ctrl+Z restores your drawing." and one Undo brings Type A back (90 walls, 27 names). **Ours** asks nothing, and the
Undo button is greyed out: Type A is gone (shots `undo-ours-2-after-dxf.png`, `undo-his-3-after-undo.png`).

The 23.6 MB UCL office file (four floors as blocks): **his** says in 0.3 s "This file is over 15 MB. Export only the
floor plan or split the drawing"; **ours** keeps the page busy and has not drawn it after 5 minutes (the page did not even
answer the harness — the read runs on the page's own thread).

His console printed a React error three times in the run ("Cannot update a component (`StudioApp`) while rendering a
different component (`DxfReviewPanel`)" / "(`Panel`)"): a state change during drawing in his review panel. His Studio
also keeps the empty-sheet card ("Drop a floor plan here", "Upload design…", "Load image manually…") on top of an
imported DXF (every `-3-studio.png` shot).

## Where they differ, and why (one line each)

- **His fixture** (`fixture-two-room-floor.dxf.png`, his `-3-studio`): the floor is ONE closed outline polyline plus
  single partition lines, door and window drawn as plain lines. Ours takes the outline for a "room outline" plan
  (`plan2d.ts roomPolygons`: ≥ 60 % of the wall length in room-sized closed loops), and in that mode single lines are not
  read (`buildPlan`: `for (const g of roomMode || axes ? [] : explicit)`) — the partition and its door go; the window line
  is not in a gap, and ours reads no plain line on a door / window layer as an opening. His reads every unpaired line as a
  12.7 cm wall (`extractWallRuns`) and line symbols as openings (`openingMarks`).
- **11 real files his refuses with "No wall linework was selected"**: no layer his guess calls walls. Ours still draws
  walls on 3 of them: parallel pairs on layers it cannot place count as walls (ezdxf_uncommon 17 walls, almajd 3), its own
  MLINE reader (AutoCAD multiline sample: 5 walls; dxf-parser drops MLINE, so his sees nothing). The 7 LibreDWG examples
  are mechanical drawings: neither finds walls.
- **3 files "The selected DXF linework expands into too many segments"** (Autodesk blocks & tables, Ceco house, the BC
  apartment block): his wall-guessed layers include arcs and circles tessellated at 10°, past his 6 000-segment cap
  (`buildUnit.ts MAX_WALL_SEGMENTS`). Ours reads them (Autodesk: 99 walls, 17 closed rooms, 11 named, clean).
- **Too many walls on the files he reads** (basement remodel 539 vs ours 59, twindo 2nd floor 527 vs 98, giraffe
  residential 209 vs 63): his layer guess makes any layer with more than 4 lines and no text a wall layer
  (`layers.ts guess`: lighting, plumbing, heating, stairs, sanitary fixtures, casework, details), and every line with no
  parallel partner becomes a 12.7 cm wall. Ours leaves those layers out by name (`plan2d.ts LAYER_TABLE`) and drops
  unpaired lines under 40 cm (jambs, end caps).
- **Our built-ins (as exported, lines only, plain CAD)**: each wall piece is a closed outline. His pairs the two long
  sides, but the two short ends (the wall's thickness, ≥ 8 cm) have no partner and each becomes its own little wall — about
  six walls for every real one, with loose ends and crossings at every junction; door / window blocks' leaves and jambs
  add "could not attach … marker" rows. Ours reads its own centre lines (lines only) or pairs the long sides and drops the
  short ends (plain CAD).
- **Plain-CAD flats, rooms ours misses** (`builtin-type-a.neutral.dxf.png`): the missing walls are the all-glass and
  all-slider ones (the living room's front, Bed-1's window wall). Ours makes a wall out of a door / window block that
  stands in no wall only for Plotline's own export (`plan2d.ts buildPlan`: `if (!w && jambs && d.own)`). His keeps more of
  those walls (joins pieces across gaps up to 1.6 m) and names about as many rooms (72 vs 78), at 269 crossings.
- **Wrong units declared in the file** (ccwi: says metres, is inches; jscad floor plan: says millimetres, is inches): his
  trusts the header — 7 092 m and 10.6 m of walls; ours sees the plan would be 684 m / 0.8 m across and re-guesses.
- **"Separated drawings"**: his offered them on 5 files (giraffe commercial 1 and 2, the two jscad samples, an ezdxf test
  file) — each is one plan, so all 5 were false splits; the only real multi-floor file (UCL, four floors) is refused by
  his 15 MB limit. Ours never splits (Docs/PLAN_DRAWING_SETS.md §1.2 names that as our gap).
- **Names**: his keeps a text only on a layer taken as text and only if it is a known room word (`classifyRoom`:
  BED, KITCHEN, TOILET…), and places it even outside a room; ours takes any text with letters inside a closed room. On the
  32 real files: 70 named rooms ours, 16 his.

## Per file

Columns as above. *openings* = all (doors incl. sliders / windows / passages). *review rows*: ours = our Issues list; his = his DXF review rows + his Issues list. *clicks*: what a person did (a typed scale counts as one; "his, our layers" counts each layer set). The verdict is about the drawing's structure; compare with the **truth** rows where there is one (a "clean" drawing can still miss rooms).

| group | files | ours: verdicts | his: verdicts (auto = imported with no click) | his given our layer roles |
|---|---|---|---|---|
| DXF samples 2026-11-22 | 10 | rooms open 3, clean 6, not read in 5 min 1 | refused 4, clean 2, rooms open 4 | refused 3, rooms open 5, clean 2 |
| DXF from DWG | 11 | clean 4, no walls 7 | refused 8, rooms open 1, clean 2 | refused 8, rooms open 1, clean 2 |
| DXF corpus | 11 | clean 5, no walls 2, rooms open 4 | clean 1, rooms open 6, refused 4 | refused 5, rooms open 6 |
| His fixture | 1 | clean 1 | clean 1, auto 1 | clean 1 |
| Built-ins, as exported | 20 | clean 20 | rooms open 20 | rooms open 20 |
| Built-ins, lines only | 20 | clean 20 | rooms open 20 | rooms open 19, clean 1 |
| Built-in flats, plain CAD (no Plotline layers) | 5 | clean 5 | rooms open 5 | rooms open 5 |

#### DXF samples 2026-11-22

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| archicad-first-floor-plan-almajd/texts-in-block.dxf | ours | 3 | 0 (0/0/0) | 0 | 0 | 0 | 6 | 0 | 8 | 0.3 | 0 | rooms open |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.8 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| bc-apartment-block-floor-a000217/A_000217.dxf | ours | 12 | 1 (0/0/1) | 0 | 0 | 0 | 14 | 0 | 16 | 0.9 | 0 | rooms open |
| | his |  |  |  |  |  |  |  |  | 1.1 | — | refused: The selected DXF linework expands into too many segments. Map fewer layers or split the dr |
| | his, our layers | 433 | 6 (6/0/0) | 33 | 0 | 11 | 74 | 5 | 298 + 115 | 1.1 | 9 | rooms open |
| ceco-net-house-tm53/Ceco.NET-Architecture-Tm-53.dxf | ours | 169 | 7 (0/2/5) | 0 | 2 | 0 | 26 | 0 | 39 | 0.3 | 0 | clean |
| | his |  |  |  |  |  |  |  |  | 0.7 | — | refused: The selected DXF linework expands into too many segments. Map fewer layers or split the dr |
| | his, our layers |  |  |  |  |  |  |  |  | 0.8 | — | refused: The selected DXF linework expands into too many segments. Map fewer layers or split the dr |
| ijs-uwb-env0-rooms/floorplan.dxf | ours | 17 | 1 (0/1/0) | 0 | 0 | 0 | 9 | 0 | 11 | 0.3 | 0 | rooms open |
| | his | 42 | 0 (0/0/0) | 0 | 1 | 0 | 12 | 0 | 19 + 15 | 0.5 | 2 | clean |
| | his, our layers | 42 | 0 (0/0/0) | 0 | 1 | 0 | 12 | 0 | 19 + 15 | 0.7 | 2 | clean |
| ijs-uwb-env3-office-floor/floorplan.dxf | ours | 38 | 1 (0/0/1) | 0 | 6 | 0 | 9 | 0 | 17 | 0.3 | 0 | clean |
| | his | 78 | 1 (1/0/0) | 0 | 9 | 0 | 7 | 16 | 36 + 34 | 0.5 | 2 | rooms open |
| | his, our layers | 78 | 1 (1/0/0) | 0 | 9 | 0 | 7 | 16 | 36 + 34 | 0.7 | 2 | rooms open |
| lboro-matched-pair-semi-detached-houses/Internal_First.dxf | ours | 52 | 15 (7/0/8) | 9 | 11 | 9 | 10 | 0 | 13 | 0.3 | 0 | clean |
| | his | 16 | 0 (0/0/0) | 4 | 0 | 0 | 0 | 0 | 8 + 6 | 0.6 | 3 | rooms open |
| | his, our layers | 16 | 0 (0/0/0) | 4 | 0 | 0 | 0 | 0 | 8 + 6 | 0.8 | 4 | rooms open |
| lboro-matched-pair-semi-detached-houses/Internal_Ground.dxf | ours | 62 | 14 (6/0/8) | 8 | 8 | 8 | 1 | 0 | 14 | 0.3 | 0 | clean |
| | his | 16 | 0 (0/0/0) | 6 | 0 | 0 | 0 | 0 | 4 + 8 | 0.5 | 3 | rooms open |
| | his, our layers | 16 | 0 (0/0/0) | 6 | 0 | 0 | 0 | 0 | 4 + 8 | 0.7 | 4 | rooms open |
| librecad-house-basement-remodel/basement_plan.dxf | ours | 59 | 7 (0/4/3) | 3 | 5 | 3 | 11 | 0 | 16 | 0.3 | 0 | clean |
| | his | 539 | 16 (16/0/0) | 21 | 9 | 5 | 192 | 4 | 338 + 221 | 0.8 | 2 | rooms open |
| | his, our layers | 344 | 4 (4/0/0) | 12 | 11 | 3 | 99 | 0 | 226 + 119 | 0.8 | 12 | rooms open |
| ucl-uk-tech-office-hq-plans/plans_clean.dxf | ours |  |  |  |  |  |  |  |  |  | 0 | not read in 5 min |
| | his |  |  |  |  |  |  |  |  | 0.3 | — | refused: This file is over 15 MB. Export only the floor plan or split the drawing, then retry. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.4 | — | refused: This file is over 15 MB. Export only the floor plan or split the drawing, then retry. |
| zamani-kua-ruins-house-3/house_3_Kua_3_Layout.dxf | ours | 83 | 6 (0/0/6) | 1 | 10 | 1 | 11 | 0 | 27 | 0.3 | 0 | clean |
| | his | 207 | 7 (7/0/0) | 0 | 11 | 0 | 59 | 0 | 120 + 78 | 0.5 | 2 | clean |
| | his, our layers | 207 | 7 (7/0/0) | 0 | 11 | 0 | 59 | 0 | 120 + 78 | 0.7 | 5 | clean |

#### DXF from DWG

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| converted/autodesk_blocks_and_tables_-_imperial.libredwg.dxf | ours | 99 | 21 (14/0/7) | 11 | 17 | 11 | 5 | 0 | 12 | 0.3 | 0 | clean |
| | his |  |  |  |  |  |  |  |  | 0.6 | — | refused: The selected DXF linework expands into too many segments. Map fewer layers or split the dr |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: The selected DXF linework expands into too many segments. Map fewer layers or split the dr |
| converted/draftsperson_house_floor_plan_tutorial.libredwg.dxf | ours | 92 | 31 (3/25/3) | 3 | 3 | 3 | 1 | 0 | 7 | 0.3 | 0 | clean |
| | his | 78 | 18 (10/8/0) | 6 | 3 | 1 | 36 | 0 | 980 + 44 | 0.5 | 2 | rooms open |
| | his, our layers | 78 | 18 (10/8/0) | 6 | 3 | 1 | 36 | 0 | 982 + 44 | 0.7 | 10 | rooms open |
| converted/libredwg_example_2000.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.8 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.6 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_example_2007.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.9 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_example_2013.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.4 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_example_2018.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.8 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_example_r14.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.7 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.6 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_sample_2000.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/libredwg_sample_2018.libredwg.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| converted/twindo_Backcountry_1st_Floor_Plan.libredwg.dxf | ours | 86 | 15 (1/8/6) | 0 | 5 | 0 | 9 | 0 | 19 | 0.3 | 0 | clean |
| | his | 212 | 23 (12/11/0) | 0 | 3 | 0 | 95 | 0 | 306 + 99 | 0.5 | 2 | clean |
| | his, our layers | 163 | 23 (12/11/0) | 0 | 2 | 0 | 84 | 0 | 296 + 87 | 0.7 | 18 | clean |
| converted/twindo_Backcountry_2nd_Floor_Plan.libredwg.dxf | ours | 98 | 28 (3/11/14) | 0 | 8 | 0 | 14 | 0 | 25 | 0.3 | 0 | clean |
| | his | 527 | 42 (23/19/0) | 0 | 9 | 0 | 174 | 0 | 558 + 194 | 0.6 | 2 | clean |
| | his, our layers | 304 | 40 (21/19/0) | 0 | 2 | 0 | 135 | 0 | 508 + 144 | 0.7 | 15 | clean |

#### DXF corpus

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dxf/ccwi_simple_floorplan.dxf | ours | 54 | 0 (0/0/0) | 0 | 15 | 0 | 0 | 0 | 17 | 0.3 | 0 | clean |
| | his | 64 | 0 (0/0/0) | 0 | 14 | 0 | 0 | 0 | 15 + 16 | 0.5 | 2 | clean |
| | his, our layers |  |  |  |  |  |  |  |  | 0.6 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| dxf/drafted_ai_example.dxf | ours | 74 | 34 (15/11/8) | 19 | 21 | 19 | 1 | 0 | 8 | 0.3 | 0 | clean |
| | his | 268 | 22 (15/7/0) | 16 | 5 | 5 | 134 | 0 | 343 + 148 | 0.5 | 2 | rooms open |
| | his, our layers | 268 | 22 (15/7/0) | 16 | 5 | 5 | 134 | 0 | 343 + 148 | 0.7 | 8 | rooms open |
| dxf/ezdxf_Minimal_DXF_AC1009.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.2 | — | refused: No supported 2D geometry or text was found in this DXF. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.4 | — | refused: No supported 2D geometry or text was found in this DXF. |
| dxf/ezdxf_dimension_in_nested_blocks.dxf | ours | 0 | 0 (0/0/0) | 0 | 0 | 0 | 0 | 0 | 1 | 0.3 | 0 | no walls |
| | his |  |  |  |  |  |  |  |  | 0.5 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| dxf/ezdxf_uncommon.dxf | ours | 17 | 3 (0/2/1) | 0 | 0 | 0 | 12 | 0 | 14 | 0.3 | 0 | rooms open |
| | his |  |  |  |  |  |  |  |  | 0.6 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| dxf/giraffe360_demo_commercial_1.dxf | ours | 18 | 3 (3/0/0) | 1 | 1 | 1 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 90 | 6 (6/0/0) | 0 | 1 | 0 | 16 | 22 | 47 + 41 | 0.5 | 3 | rooms open |
| | his, our layers | 58 | 6 (6/0/0) | 0 | 0 | 0 | 16 | 2 | 27 + 20 | 0.6 | 7 | rooms open |
| dxf/giraffe360_demo_commercial_2.dxf | ours | 63 | 33 (0/4/29) | 0 | 0 | 0 | 32 | 0 | 35 | 0.3 | 0 | rooms open |
| | his | 273 | 33 (33/0/0) | 0 | 3 | 0 | 37 | 11 | 91 + 57 | 0.5 | 3 | rooms open |
| | his, our layers | 185 | 30 (30/0/0) | 0 | 0 | 0 | 35 | 9 | 78 + 46 | 0.7 | 8 | rooms open |
| dxf/giraffe360_demo_residential.dxf | ours | 63 | 10 (1/9/0) | 2 | 7 | 2 | 0 | 0 | 7 | 0.3 | 0 | clean |
| | his | 209 | 4 (4/0/0) | 2 | 1 | 0 | 82 | 4 | 100 + 91 | 0.5 | 3 | rooms open |
| | his, our layers | 209 | 4 (4/0/0) | 2 | 1 | 0 | 82 | 4 | 102 + 91 | 0.7 | 8 | rooms open |
| dxf/jscad_autocad2017_2Dmlines.dxf | ours | 5 | 0 (0/0/0) | 0 | 0 | 0 | 4 | 0 | 6 | 0.3 | 0 | rooms open |
| | his |  |  |  |  |  |  |  |  | 0.6 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| | his, our layers |  |  |  |  |  |  |  |  | 0.7 | — | refused: No wall linework was selected. Adjust the layer mapping and try again. |
| dxf/jscad_dxfparser_floorplan.dxf | ours | 127 | 30 (8/21/1) | 13 | 16 | 13 | 8 | 0 | 15 | 0.3 | 0 | clean |
| | his | 95 | 0 (0/0/0) | 8 | 0 | 5 | 16 | 0 | 89 + 22 | 0.6 | 2 | rooms open |
| | his, our layers | 100 | 0 (0/0/0) | 8 | 0 | 5 | 13 | 0 | 88 + 19 | 0.8 | 10 | rooms open |
| dxf/jscad_ezdxf_small_r13.dxf | ours | 2 | 0 (0/0/0) | 0 | 0 | 0 | 4 | 0 | 6 | 0.3 | 0 | rooms open |
| | his | 13 | 0 (0/0/0) | 0 | 0 | 0 | 15 | 0 | 18 + 17 | 0.6 | 3 | rooms open |
| | his, our layers | 13 | 0 (0/0/0) | 0 | 0 | 0 | 15 | 0 | 18 + 17 | 0.7 | 3 | rooms open |

#### His fixture

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fixture/two-room-floor.dxf | ours | 4 | 0 (0/0/0) | 1 | 1 | 1 | 0 | 0 | 2 | 0.3 | 0 | clean |
| | his | 7 | 2 (1/1/0) | 2 | 2 | 2 | 0 | 0 | 1 + 2 | 0.4 | 0 | clean |
| | his, our layers | 7 | 2 (1/1/0) | 2 | 2 | 2 | 0 | 0 | 1 + 2 | 0.7 | 6 | clean |
| | **truth** | 7 | 2 |  | 2 |  |  |  |  | | | |

#### Built-ins, as exported

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| builtin/banani-b1.dxf | ours | 59 | 2 (0/0/2) | 22 | 22 | 22 | 0 | 0 | 2 | 0.3 | 0 | clean |
| | his | 544 | 2 (2/0/0) | 4 | 21 | 4 | 189 | 7 | 220 + 214 | 0.5 | 2 | rooms open |
| | his, our layers | 544 | 2 (2/0/0) | 4 | 21 | 4 | 189 | 7 | 220 + 214 | 0.7 | 2 | rooms open |
| | **truth** | 59 | 2 (0/0/2) | 22 | 22 | 22 | 0 | 0 | 2 | | | |
| builtin/banani-b2.dxf | ours | 46 | 2 (1/1/0) | 24 | 24 | 24 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 445 | 1 (1/0/0) | 1 | 23 | 1 | 145 | 2 | 176 + 170 | 0.6 | 2 | rooms open |
| | his, our layers | 445 | 1 (1/0/0) | 1 | 23 | 1 | 145 | 2 | 176 + 170 | 0.7 | 2 | rooms open |
| | **truth** | 46 | 2 (1/1/0) | 24 | 24 | 24 | 0 | 0 | 1 | | | |
| builtin/banani-ground.dxf | ours | 93 | 55 (11/39/5) | 28 | 28 | 28 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 586 | 36 (26/10/0) | 12 | 29 | 12 | 183 | 6 | 312 + 207 | 0.5 | 2 | rooms open |
| | his, our layers | 586 | 36 (26/10/0) | 12 | 29 | 12 | 183 | 6 | 312 + 207 | 0.7 | 2 | rooms open |
| | **truth** | 93 | 55 (11/39/5) | 28 | 28 | 28 | 0 | 0 | 1 | | | |
| builtin/banani-roof.dxf | ours | 50 | 11 (6/3/2) | 14 | 14 | 14 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 339 | 18 (16/2/0) | 12 | 11 | 8 | 123 | 0 | 182 + 131 | 0.5 | 2 | rooms open |
| | his, our layers | 339 | 18 (16/2/0) | 12 | 11 | 8 | 123 | 0 | 182 + 131 | 0.7 | 2 | rooms open |
| | **truth** | 50 | 11 (6/3/2) | 14 | 14 | 14 | 0 | 0 | 1 | | | |
| builtin/banani-typical.dxf | ours | 32 | 5 (3/0/2) | 6 | 6 | 6 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 290 | 7 (7/0/0) | 5 | 5 | 4 | 108 | 0 | 137 + 111 | 0.5 | 2 | rooms open |
| | his, our layers | 290 | 7 (7/0/0) | 5 | 5 | 4 | 108 | 0 | 137 + 111 | 0.7 | 2 | rooms open |
| | **truth** | 32 | 5 (3/0/2) | 6 | 6 | 6 | 0 | 0 | 1 | | | |
| builtin/dmd-b1.dxf | ours | 78 | 2 (1/1/0) | 45 | 45 | 45 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 655 | 13 (12/1/0) | 1 | 43 | 1 | 188 | 162 | 421 + 400 | 0.5 | 2 | rooms open |
| | his, our layers | 655 | 13 (12/1/0) | 1 | 43 | 1 | 188 | 162 | 421 + 400 | 0.8 | 2 | rooms open |
| | **truth** | 78 | 2 (1/1/0) | 45 | 45 | 45 | 0 | 0 | 1 | | | |
| builtin/dmd-b2.dxf | ours | 85 | 3 (2/1/0) | 49 | 49 | 49 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 695 | 16 (15/1/0) | 1 | 45 | 1 | 197 | 166 | 440 + 415 | 0.5 | 2 | rooms open |
| | his, our layers | 695 | 16 (15/1/0) | 1 | 45 | 1 | 197 | 166 | 440 + 415 | 0.7 | 2 | rooms open |
| | **truth** | 85 | 3 (2/1/0) | 49 | 49 | 49 | 0 | 0 | 1 | | | |
| builtin/dmd-ground.dxf | ours | 80 | 21 (8/11/2) | 22 | 22 | 22 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 640 | 21 (17/4/0) | 13 | 20 | 12 | 201 | 14 | 295 + 231 | 0.5 | 2 | rooms open |
| | his, our layers | 640 | 21 (17/4/0) | 13 | 20 | 12 | 201 | 14 | 295 + 231 | 0.5 | 2 | rooms open |
| | **truth** | 80 | 21 (8/11/2) | 22 | 22 | 22 | 0 | 0 | 1 | | | |
| builtin/dmd-roof.dxf | ours | 66 | 7 (3/3/1) | 16 | 16 | 16 | 0 | 0 | 1 | 0.4 | 0 | clean |
| | his | 368 | 7 (5/2/0) | 14 | 16 | 14 | 102 | 2 | 138 + 107 | 0.5 | 2 | rooms open |
| | his, our layers | 368 | 7 (5/2/0) | 14 | 16 | 14 | 102 | 2 | 138 + 107 | 0.7 | 2 | rooms open |
| | **truth** | 66 | 7 (3/3/1) | 16 | 16 | 16 | 0 | 0 | 1 | | | |
| builtin/dmd-typical.dxf | ours | 33 | 5 (4/1/0) | 8 | 8 | 8 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 381 | 7 (7/0/0) | 6 | 5 | 5 | 127 | 12 | 167 + 143 | 0.5 | 2 | rooms open |
| | his, our layers | 381 | 7 (7/0/0) | 6 | 5 | 5 | 127 | 12 | 167 + 143 | 0.7 | 2 | rooms open |
| | **truth** | 33 | 5 (4/1/0) | 8 | 8 | 8 | 0 | 0 | 1 | | | |
| builtin/sheltech-a.dxf | ours | 84 | 34 (15/16/3) | 21 | 21 | 21 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 644 | 42 (25/17/0) | 21 | 15 | 15 | 154 | 112 | 402 + 274 | 0.5 | 2 | rooms open |
| | his, our layers | 644 | 42 (25/17/0) | 21 | 15 | 15 | 154 | 112 | 402 + 274 | 0.7 | 2 | rooms open |
| | **truth** | 84 | 34 (15/16/3) | 21 | 21 | 21 | 0 | 0 | 0 | | | |
| builtin/sheltech-b.dxf | ours | 82 | 32 (14/16/2) | 20 | 20 | 20 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 577 | 36 (21/15/0) | 20 | 19 | 18 | 176 | 26 | 317 + 206 | 0.5 | 2 | rooms open |
| | his, our layers | 577 | 36 (21/15/0) | 20 | 19 | 18 | 176 | 26 | 317 + 206 | 0.6 | 2 | rooms open |
| | **truth** | 82 | 32 (14/16/2) | 20 | 20 | 20 | 0 | 0 | 0 | | | |
| builtin/sheltech-b1.dxf | ours | 42 | 1 (1/0/0) | 21 | 21 | 21 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 403 | 2 (2/0/0) | 4 | 18 | 4 | 104 | 32 | 157 + 151 | 0.9 | 2 | rooms open |
| | his, our layers | 403 | 2 (2/0/0) | 4 | 18 | 4 | 104 | 32 | 157 + 151 | 0.7 | 2 | rooms open |
| | **truth** | 42 | 1 (1/0/0) | 21 | 21 | 21 | 0 | 0 | 0 | | | |
| builtin/sheltech-b2.dxf | ours | 44 | 1 (1/0/0) | 23 | 23 | 23 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 421 | 2 (2/0/0) | 3 | 19 | 3 | 106 | 38 | 169 + 161 | 0.6 | 2 | rooms open |
| | his, our layers | 421 | 2 (2/0/0) | 3 | 19 | 3 | 106 | 38 | 169 + 161 | 0.5 | 2 | rooms open |
| | **truth** | 44 | 1 (1/0/0) | 23 | 23 | 23 | 0 | 0 | 0 | | | |
| builtin/sheltech-ground.dxf | ours | 95 | 21 (9/11/1) | 25 | 25 | 25 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 710 | 23 (16/7/0) | 12 | 25 | 12 | 204 | 8 | 284 + 236 | 0.5 | 2 | rooms open |
| | his, our layers | 710 | 23 (16/7/0) | 12 | 25 | 12 | 204 | 8 | 284 + 236 | 0.7 | 2 | rooms open |
| | **truth** | 95 | 21 (9/11/1) | 25 | 25 | 25 | 0 | 0 | 0 | | | |
| builtin/sheltech-l1.dxf | ours | 41 | 14 (6/8/0) | 9 | 9 | 9 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 314 | 13 (12/1/0) | 9 | 7 | 7 | 89 | 50 | 177 + 149 | 0.5 | 2 | rooms open |
| | his, our layers | 314 | 13 (12/1/0) | 9 | 7 | 7 | 89 | 50 | 177 + 149 | 0.7 | 2 | rooms open |
| | **truth** | 41 | 14 (6/8/0) | 9 | 9 | 9 | 0 | 0 | 0 | | | |
| builtin/sheltech-roof.dxf | ours | 67 | 6 (3/3/0) | 15 | 15 | 15 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 334 | 11 (10/1/0) | 15 | 14 | 14 | 98 | 14 | 135 + 115 | 0.5 | 2 | rooms open |
| | his, our layers | 334 | 11 (10/1/0) | 15 | 14 | 14 | 98 | 14 | 135 + 115 | 0.7 | 2 | rooms open |
| | **truth** | 67 | 6 (3/3/0) | 15 | 15 | 15 | 0 | 0 | 0 | | | |
| builtin/type-a.dxf | ours | 90 | 34 (17/16/1) | 27 | 27 | 27 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 598 | 55 (37/18/0) | 27 | 21 | 21 | 164 | 188 | 477 + 359 | 0.5 | 2 | rooms open |
| | his, our layers | 598 | 55 (37/18/0) | 27 | 21 | 21 | 164 | 188 | 477 + 359 | 0.5 | 2 | rooms open |
| | **truth** | 90 | 34 (17/16/1) | 27 | 27 | 27 | 0 | 0 | 0 | | | |
| builtin/type-b.dxf | ours | 81 | 30 (15/15/0) | 22 | 20 | 22 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 571 | 55 (39/16/0) | 22 | 20 | 21 | 130 | 40 | 299 + 173 | 0.5 | 2 | rooms open |
| | his, our layers | 571 | 55 (39/16/0) | 22 | 20 | 21 | 130 | 40 | 299 + 173 | 0.7 | 2 | rooms open |
| | **truth** | 81 | 30 (15/15/0) | 22 | 20 | 22 | 0 | 0 | 0 | | | |
| builtin/type-c.dxf | ours | 92 | 31 (17/13/1) | 26 | 24 | 26 | 0 | 0 | 0 | 0.3 | 0 | clean |
| | his | 594 | 50 (37/13/0) | 26 | 17 | 19 | 178 | 87 | 378 + 273 | 0.5 | 2 | rooms open |
| | his, our layers | 594 | 50 (37/13/0) | 26 | 17 | 19 | 178 | 87 | 378 + 273 | 0.7 | 2 | rooms open |
| | **truth** | 92 | 31 (17/13/1) | 26 | 24 | 26 | 0 | 0 | 0 | | | |

#### Built-ins, lines only

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| builtin/banani-b1.lines.dxf | ours | 59 | 2 (0/0/2) | 22 | 22 | 22 | 0 | 0 | 2 | 0.3 | 0 | clean |
| | his | 544 | 2 (2/0/0) | 4 | 21 | 4 | 189 | 7 | 220 + 214 | 0.5 | 2 | rooms open |
| | his, our layers | 385 | 2 (2/0/0) | 4 | 2 | 2 | 167 | 0 | 179 + 171 | 0.7 | 10 | rooms open |
| | **truth** | 59 | 2 (0/0/2) | 22 | 22 | 22 | 0 | 0 | 2 | | | |
| builtin/banani-b2.lines.dxf | ours | 46 | 2 (1/1/0) | 24 | 24 | 24 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 445 | 1 (1/0/0) | 1 | 23 | 1 | 145 | 2 | 176 + 170 | 0.6 | 2 | rooms open |
| | his, our layers | 286 | 1 (1/0/0) | 1 | 2 | 1 | 114 | 0 | 126 + 116 | 0.9 | 11 | clean |
| | **truth** | 46 | 2 (1/1/0) | 24 | 24 | 24 | 0 | 0 | 1 | | | |
| builtin/banani-ground.lines.dxf | ours | 93 | 55 (11/39/5) | 28 | 28 | 28 | 4 | 0 | 5 | 0.3 | 0 | clean |
| | his | 586 | 36 (26/10/0) | 12 | 29 | 12 | 183 | 6 | 312 + 207 | 0.5 | 2 | rooms open |
| | his, our layers | 357 | 23 (21/2/0) | 12 | 8 | 4 | 177 | 0 | 326 + 190 | 0.7 | 14 | rooms open |
| | **truth** | 93 | 55 (11/39/5) | 28 | 28 | 28 | 0 | 0 | 1 | | | |
| builtin/banani-roof.lines.dxf | ours | 50 | 11 (6/3/2) | 14 | 14 | 14 | 3 | 0 | 4 | 0.3 | 0 | clean |
| | his | 339 | 18 (16/2/0) | 12 | 11 | 8 | 123 | 0 | 182 + 131 | 0.5 | 2 | rooms open |
| | his, our layers | 261 | 20 (18/2/0) | 12 | 10 | 8 | 91 | 0 | 143 + 98 | 0.7 | 14 | rooms open |
| | **truth** | 50 | 11 (6/3/2) | 14 | 14 | 14 | 0 | 0 | 1 | | | |
| builtin/banani-typical.lines.dxf | ours | 32 | 5 (3/0/2) | 6 | 6 | 6 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 290 | 7 (7/0/0) | 5 | 5 | 4 | 108 | 0 | 137 + 111 | 0.5 | 2 | rooms open |
| | his, our layers | 205 | 8 (8/0/0) | 5 | 4 | 4 | 61 | 0 | 84 + 63 | 0.7 | 8 | rooms open |
| | **truth** | 32 | 5 (3/0/2) | 6 | 6 | 6 | 0 | 0 | 1 | | | |
| builtin/dmd-b1.lines.dxf | ours | 78 | 2 (1/1/0) | 45 | 45 | 45 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 655 | 13 (12/1/0) | 1 | 43 | 1 | 188 | 162 | 421 + 400 | 0.5 | 2 | rooms open |
| | his, our layers | 374 | 3 (2/1/0) | 1 | 4 | 1 | 163 | 8 | 186 + 176 | 0.7 | 10 | rooms open |
| | **truth** | 78 | 2 (1/1/0) | 45 | 45 | 45 | 0 | 0 | 1 | | | |
| builtin/dmd-b2.lines.dxf | ours | 85 | 3 (2/1/0) | 49 | 49 | 49 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 695 | 16 (15/1/0) | 1 | 45 | 1 | 197 | 166 | 440 + 415 | 0.6 | 2 | rooms open |
| | his, our layers | 411 | 4 (3/1/0) | 1 | 5 | 1 | 179 | 8 | 205 + 193 | 0.7 | 11 | rooms open |
| | **truth** | 85 | 3 (2/1/0) | 49 | 49 | 49 | 0 | 0 | 1 | | | |
| builtin/dmd-ground.lines.dxf | ours | 80 | 21 (8/11/2) | 22 | 22 | 22 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 640 | 21 (17/4/0) | 13 | 20 | 12 | 201 | 14 | 295 + 231 | 0.5 | 2 | rooms open |
| | his, our layers | 451 | 14 (12/2/0) | 13 | 5 | 4 | 159 | 8 | 244 + 178 | 0.6 | 12 | rooms open |
| | **truth** | 80 | 21 (8/11/2) | 22 | 22 | 22 | 0 | 0 | 1 | | | |
| builtin/dmd-roof.lines.dxf | ours | 66 | 7 (3/3/1) | 16 | 16 | 16 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 368 | 7 (5/2/0) | 14 | 16 | 14 | 102 | 2 | 138 + 107 | 0.5 | 2 | rooms open |
| | his, our layers | 373 | 7 (5/2/0) | 14 | 9 | 8 | 110 | 6 | 154 + 124 | 0.7 | 15 | rooms open |
| | **truth** | 66 | 7 (3/3/1) | 16 | 16 | 16 | 0 | 0 | 1 | | | |
| builtin/dmd-typical.lines.dxf | ours | 33 | 5 (4/1/0) | 8 | 8 | 8 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 381 | 7 (7/0/0) | 6 | 5 | 5 | 127 | 12 | 167 + 143 | 0.5 | 2 | rooms open |
| | his, our layers | 196 | 8 (7/1/0) | 6 | 5 | 5 | 64 | 4 | 96 + 70 | 0.7 | 11 | rooms open |
| | **truth** | 33 | 5 (4/1/0) | 8 | 8 | 8 | 0 | 0 | 1 | | | |
| builtin/sheltech-a.lines.dxf | ours | 84 | 34 (15/16/3) | 21 | 21 | 21 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 644 | 42 (25/17/0) | 21 | 15 | 15 | 154 | 112 | 402 + 274 | 0.5 | 2 | rooms open |
| | his, our layers | 606 | 33 (20/13/0) | 21 | 8 | 8 | 162 | 72 | 360 + 248 | 0.7 | 8 | rooms open |
| | **truth** | 84 | 34 (15/16/3) | 21 | 21 | 21 | 0 | 0 | 0 | | | |
| builtin/sheltech-b.lines.dxf | ours | 82 | 32 (14/16/2) | 20 | 20 | 20 | 0 | 0 | 2 | 0.3 | 0 | clean |
| | his | 577 | 36 (21/15/0) | 20 | 19 | 18 | 176 | 26 | 317 + 206 | 0.5 | 2 | rooms open |
| | his, our layers | 552 | 29 (18/11/0) | 20 | 10 | 10 | 183 | 12 | 309 + 206 | 0.6 | 8 | rooms open |
| | **truth** | 82 | 32 (14/16/2) | 20 | 20 | 20 | 0 | 0 | 0 | | | |
| builtin/sheltech-b1.lines.dxf | ours | 42 | 1 (1/0/0) | 21 | 21 | 21 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 403 | 2 (2/0/0) | 4 | 18 | 4 | 104 | 32 | 157 + 151 | 0.7 | 2 | rooms open |
| | his, our layers | 205 | 1 (1/0/0) | 4 | 3 | 3 | 79 | 12 | 99 + 94 | 0.7 | 9 | rooms open |
| | **truth** | 42 | 1 (1/0/0) | 21 | 21 | 21 | 0 | 0 | 0 | | | |
| builtin/sheltech-b2.lines.dxf | ours | 44 | 1 (1/0/0) | 23 | 23 | 23 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 421 | 2 (2/0/0) | 3 | 19 | 3 | 106 | 38 | 169 + 161 | 0.6 | 2 | rooms open |
| | his, our layers | 211 | 1 (1/0/0) | 3 | 3 | 2 | 89 | 12 | 110 + 105 | 0.6 | 9 | rooms open |
| | **truth** | 44 | 1 (1/0/0) | 23 | 23 | 23 | 0 | 0 | 0 | | | |
| builtin/sheltech-ground.lines.dxf | ours | 95 | 21 (9/11/1) | 25 | 25 | 25 | 1 | 0 | 2 | 0.3 | 0 | clean |
| | his | 710 | 23 (16/7/0) | 12 | 25 | 12 | 204 | 8 | 284 + 236 | 0.6 | 2 | rooms open |
| | his, our layers | 529 | 17 (15/2/0) | 12 | 8 | 6 | 190 | 4 | 268 + 203 | 0.8 | 12 | rooms open |
| | **truth** | 95 | 21 (9/11/1) | 25 | 25 | 25 | 0 | 0 | 0 | | | |
| builtin/sheltech-l1.lines.dxf | ours | 41 | 14 (6/8/0) | 9 | 9 | 9 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 314 | 13 (12/1/0) | 9 | 7 | 7 | 89 | 50 | 177 + 149 | 0.5 | 2 | rooms open |
| | his, our layers | 200 | 12 (11/1/0) | 9 | 4 | 4 | 67 | 20 | 123 + 93 | 0.7 | 10 | rooms open |
| | **truth** | 41 | 14 (6/8/0) | 9 | 9 | 9 | 0 | 0 | 0 | | | |
| builtin/sheltech-roof.lines.dxf | ours | 67 | 6 (3/3/0) | 15 | 15 | 15 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 334 | 11 (10/1/0) | 15 | 14 | 14 | 98 | 14 | 135 + 115 | 0.5 | 2 | rooms open |
| | his, our layers | 326 | 10 (9/1/0) | 15 | 11 | 11 | 102 | 10 | 145 + 119 | 0.7 | 11 | rooms open |
| | **truth** | 67 | 6 (3/3/0) | 15 | 15 | 15 | 0 | 0 | 0 | | | |
| builtin/type-a.lines.dxf | ours | 90 | 34 (17/16/1) | 27 | 27 | 27 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 598 | 55 (37/18/0) | 27 | 21 | 21 | 164 | 188 | 477 + 359 | 0.6 | 2 | rooms open |
| | his, our layers | 576 | 47 (34/13/0) | 27 | 20 | 20 | 165 | 120 | 399 + 293 | 0.6 | 8 | rooms open |
| | **truth** | 90 | 34 (17/16/1) | 27 | 27 | 27 | 0 | 0 | 0 | | | |
| builtin/type-b.lines.dxf | ours | 81 | 30 (15/15/0) | 22 | 20 | 22 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 571 | 55 (39/16/0) | 22 | 20 | 21 | 130 | 40 | 299 + 173 | 0.5 | 2 | rooms open |
| | his, our layers | 543 | 46 (33/13/0) | 22 | 14 | 16 | 136 | 24 | 289 + 167 | 0.7 | 8 | rooms open |
| | **truth** | 81 | 30 (15/15/0) | 22 | 20 | 22 | 0 | 0 | 0 | | | |
| builtin/type-c.lines.dxf | ours | 92 | 31 (17/13/1) | 26 | 24 | 26 | 0 | 0 | 1 | 0.3 | 0 | clean |
| | his | 594 | 50 (37/13/0) | 26 | 17 | 19 | 178 | 87 | 378 + 273 | 0.5 | 2 | rooms open |
| | his, our layers | 575 | 44 (35/9/0) | 26 | 16 | 18 | 181 | 41 | 326 + 231 | 0.7 | 8 | rooms open |
| | **truth** | 92 | 31 (17/13/1) | 26 | 24 | 26 | 0 | 0 | 0 | | | |

#### Built-in flats, plain CAD (no Plotline layers)

| file | reader | walls | openings (doors/windows/passages) | labels | closed rooms | named rooms | loose ends | crossings | review rows | read s | clicks | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| builtin/sheltech-a.neutral.dxf | ours | 89 | 26 (9/15/2) | 10 | 10 | 10 | 6 | 0 | 8 | 0.3 | 0 | clean |
| | his | 606 | 33 (20/13/0) | 21 | 8 | 8 | 162 | 72 | 358 + 248 | 0.4 | 1 | rooms open |
| | his, our layers | 606 | 33 (20/13/0) | 21 | 8 | 8 | 162 | 72 | 358 + 248 | 0.7 | 6 | rooms open |
| | **truth** | 84 | 34 (15/16/3) | 21 | 21 | 21 | 0 | 0 | 0 | | | |
| builtin/sheltech-b.neutral.dxf | ours | 90 | 30 (14/12/4) | 13 | 13 | 13 | 11 | 0 | 14 | 0.3 | 0 | clean |
| | his | 552 | 29 (18/11/0) | 20 | 10 | 10 | 183 | 12 | 307 + 206 | 0.2 | 1 | rooms open |
| | his, our layers | 552 | 29 (18/11/0) | 20 | 10 | 10 | 183 | 12 | 307 + 206 | 0.7 | 6 | rooms open |
| | **truth** | 82 | 32 (14/16/2) | 20 | 20 | 20 | 0 | 0 | 0 | | | |
| builtin/type-a.neutral.dxf | ours | 104 | 28 (16/12/0) | 19 | 19 | 19 | 7 | 0 | 8 | 0.3 | 0 | clean |
| | his | 576 | 47 (34/13/0) | 27 | 20 | 20 | 165 | 120 | 397 + 293 | 0.2 | 1 | rooms open |
| | his, our layers | 576 | 47 (34/13/0) | 27 | 20 | 20 | 165 | 120 | 397 + 293 | 0.7 | 6 | rooms open |
| | **truth** | 90 | 34 (17/16/1) | 27 | 27 | 27 | 0 | 0 | 0 | | | |
| builtin/type-b.neutral.dxf | ours | 125 | 23 (10/10/3) | 16 | 13 | 16 | 10 | 0 | 14 | 0.3 | 0 | clean |
| | his | 543 | 46 (33/13/0) | 22 | 14 | 16 | 136 | 24 | 287 + 167 | 0.2 | 1 | rooms open |
| | his, our layers | 543 | 46 (33/13/0) | 22 | 14 | 16 | 136 | 24 | 287 + 167 | 0.7 | 6 | rooms open |
| | **truth** | 81 | 30 (15/15/0) | 22 | 20 | 22 | 0 | 0 | 0 | | | |
| builtin/type-c.neutral.dxf | ours | 105 | 27 (15/12/0) | 20 | 18 | 20 | 10 | 0 | 12 | 0.3 | 0 | clean |
| | his | 575 | 44 (35/9/0) | 26 | 16 | 18 | 181 | 41 | 324 + 231 | 0.2 | 1 | rooms open |
| | his, our layers | 575 | 44 (35/9/0) | 26 | 16 | 18 | 181 | 41 | 324 + 231 | 0.7 | 6 | rooms open |
| | **truth** | 92 | 31 (17/13/1) | 26 | 24 | 26 | 0 | 0 | 0 | | | |

## After the port — his eight ideas in our reader (lane p2port, session 31, 2026-11-27)

The manager's judgment above (keep our reader, take his ideas into it) carried out on branch `s31/p2port`, one commit
per idea, each measured with this page's harness on all 78 files before the next (Firefox, the founder's path: a fresh
Studio, the file dropped, nothing clicked; counted by `count.mjs`). Scripts and raw runs: `E:/dev/tmp/s31/p2port/`
(`score.mjs` = `ours.mjs` on the lane's worktree, `compare.mjs`, `items.mjs`, `runs/<step>.json`); shots
`E:/dev/plotline-shots/s31/p2port/<step>/` and `…/proof/`. "Before" = `s31/redesign` 46b2b0b (the same counts as "ours"
above); "final" = the lane merged with `s31/redesign` 0c386bc (bigifc).

| # | idea (from Maheer's Plotline 2.0) | what changed in ours | kept? |
|---|---|---|---|
| 1 | an import is one undo step, asked first | `load-unit` keeps the history over a drawing; "Replace the drawing on screen with *file*? Undo brings it back." for every format and a .json (a several-storey IFC over a drawing in no project says it is replaced) | yes |
| 2 | read off the page; limits in plain words | one worker for IFC and DXF (`read.worker.ts`), progress + Cancel; over 15 MB, over 50 000 entities, blocks opening into over 1 000 000 lines, binary DXF: refused at once, saying what to do | yes |
| 3 | `\U+XXXX`, escaped braces | `plainMtext` (was `stripMtext`): one pass, his rules + our `%%c %%d %%p`; a TEXT keeps its braces; a name of any script is a name (`\p{L}`), so a Bangla name from an older file names its room | yes |
| 4 | "1 DXF unit equals … metres" | **Read in** row under What was read from the file: a unit, or **A length I know…** (a picked wall, its real length typed); kept per file name | yes |
| 5 | plain-line / narrow-rectangle opening symbols | a door / window layer line along a wall cuts that opening where the wall has none, or names a bare gap (the gap keeps its width); 1.5 m+ door = slider; a layer of doors AND windows: its lines are windows | yes |
| 6 | his fixture (one outline + single partition lines) | single lines read in room-outline mode too, merged across a doorway. (Refusing room mode for one outline was tried: the giraffe360 commercial scan lost its room — dropped) | yes |
| 7 | layer 0 in a block takes the insert's layer | `flatten` carries the insert's layer down nested blocks and dimensions; a block over an opening read already only says what it is (the draftsperson house's windows grew into one 5.27 m window without that — fixed before keeping) | yes |
| 8 | a wall made of one door / window block, any DXF | `if (!w && jambs)` without `d.own` — measured: rooms named up, crossings not | **yes** (the rule held) |

**Real DXF files (32)**

| step | walls | openings | closed rooms | named rooms | loose ends | crossings | refused / not read |
|---|---|---|---|---|---|---|---|
| before (s31/redesign 46b2b0b) | 1293 | 260 | 135 | 70 | 187 | 0 | 1 (UCL: not read in 5 min) |
| 1+2 undo + question; worker, limits | 1293 | 260 | 135 | 70 | 187 | 0 | 1 (UCL: refused in 0.6 s, plain words) |
| 3 text decoding | 1293 | 260 | 135 | 70 | 187 | 0 | 1 |
| 4 Read in | 1293 | 260 | 135 | 70 | 187 | 0 | 1 |
| 5 plain-line doors / windows | 1293 | 265 | 135 | 70 | 187 | 0 | 1 |
| 6 single lines in room-outline mode | 1293 | 265 | 135 | 70 | 187 | 0 | 1 |
| 7 layer 0 takes the block's layer | 1293 | 303 | 135 | 70 | 187 | 0 | 1 |
| 8 a block in no wall is a wall | 1365 | 318 | 139 | 72 | 216 | 0 | 1 |
| **final, merged with s31/redesign 0c386bc** | **1365** | **318** | **139** | **72** | **216** | **0** | **1** |

**The 5 built-in flats as plain CAD** (truth: 429 walls, 161 openings, 112 closed rooms, 116 named)

| step | walls | openings | closed rooms | named rooms | loose ends | crossings |
|---|---|---|---|---|---|---|
| before | 513 | 134 | 73 | 78 | 44 | 0 |
| 1 – 7 | 513 | 134 | 73 | 78 | 44 | 0 |
| 8 a block in no wall is a wall | 579 | 169 | 110 | 114 | 9 | 0 |
| **final** | **579** | **169** | **110** | **114** | **9** | **0** |

**His fixture** (`two-room-floor.dxf`; truth 7 walls, 2 rooms, 2 openings): before 4 walls / 1 room / 0 openings; after
5 (his window line) 4 / 1 / 1; after 6 and final **7 / 2 / 2** — exactly the truth.

**Our 20 built-ins, as exported and lines only**: every count the same at every step (1 340 walls, 317 openings, 439
closed, 443 named; 0 and 8 loose ends) — the round trips are untouched.

Files that changed, before → final (all others the same; no file has fewer rooms named or closed, none has a crossing):

- `ucl-uk-tech-office-hq-plans/plans_clean.dxf` (22.5 MB): not read after 5 minutes → refused in 0.6 s: "it is 22.5 MB,
  and Plotline reads a DXF of up to 15.0 MB — save only the floor plan from your CAD program (one floor per file) and drop that".
- `ceco-net-house-tm53`: openings 7 → 15 (windows 2 → 8: its windows drawn as lines on "doorswindows" over its sill walls;
  doors 0 → 3), closed rooms 2 → 3, loose ends 26 → 25.
- `autodesk_blocks_and_tables`: windows 0 → 38 (window blocks on "DB - Windows", drawn on layer 0); 2 doors read 0.86 → 1.02 m
  wide (the block's frame, not the swing — the one width that got worse); loose ends 5 → 9.
- `draftsperson_house_floor_plan_tutorial`: closed rooms 3 → 5, named 3 → 4, doors 3 → 5, loose ends 1 → 2.
- `drafted_ai_example`: closed 21 → 22, named 19 → 20, loose ends 1 → 0.
- `twindo_Backcountry_1st / 2nd_Floor_Plan` (no closed rooms before or after): walls 86 → 105 / 98 → 130, loose ends 9 → 20 /
  14 → 29 — block walls standing beside walls they do not reach. The cost of item 8: 29 more loose ends on the real files
  (+15 Issues rows on twindo), against 35 fewer on the plain-CAD flats.
- The 5 plain-CAD flats: Type A 19 → 27 named, Type B 16 → 21, Type C 20 → 26, Sheltech A 10 → 21, Sheltech B 13 → 19.

Item 8 variants measured and dropped: a block-wall only when a wall is within 5 cm of a jamb (plain-CAD 110 named, 4 rooms
lost: Type A's veranda slider stands 22 cm from both walls, a stub too short to draw between), within 30 cm (identical to
no condition: dropped as code that does nothing).

Read seconds: the whole set 26.4 s before, 24.7 s final (the slowest file 1.1 → 0.5 s); the reader in its worker answers
the page in 1 ms while a slow file reads (`proof2.mjs`).
