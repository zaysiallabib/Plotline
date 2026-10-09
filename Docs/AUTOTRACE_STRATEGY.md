# Auto-trace strategy v3 — rooms first, walls on tracks (2026-10-02, session 14)

Status: PROPOSED — nothing in `src/` changed yet. Evidence: four agents (web research, BTI forensics,
Sheltech/Banani/DMD forensics, a rooms-first experiment). Their crops and logs:
`E:\dev\plotline-shots\wave19\{current,bti,shel,rooms}\`, `E:\dev\tmp\wave19\{bti,shel,rooms}\`.

## 1. What is actually wrong (measured)

1. **Finding thick walls is NOT the problem.** Of the walls drawn as a dark band, the wall stage already finds
   92–97 % on BTI and 86–91 % on Sheltech. Furniture, text, hatch, stairs and counters cause zero false walls on
   BTI / Sheltech L2 / Banani (they are thin grey lines, never ink).
2. **"Multiple walls" is a representation problem.** The tracer outputs a loose pile of segments from three
   generators (bands, skeleton leftovers, door bridges) and ~10 repair passes then stitch them, each with its own
   tolerance. Nothing enforces "one drawn wall = one wall". Result: 1.45–1.66 draft walls per real wall. Causes,
   each verified by switching it off:
   - columns / junction blocks accepted as walls (`bands.ts:55`, `walls.ts:416` — any run up to ~0.55 m is a
     "wall"): 13 of 16 parallel pairs on Sheltech L2;
   - band ends overshoot up to ~0.55 m past a thickness step (`bands.ts:124-128`): the only source of
     side-by-side duplicates on BTI;
   - `joinEnds` moves near-parallel ends to their mean (`solve.ts:254-274`): tilted walls 2 → 24 (Sheltech),
     7 → 26 (BTI A), 6 → 67 (DMD) at that one step;
   - thickness rounded to ½" then merged only when identical (`solve.ts:689`, `:708`): one wall stays 2–5 pieces;
   - every door guess becomes its own wall piece (`solve.ts:806-816`); WC bowls / basins pass the arc test
     (`walls.ts:755-777`).
   Patching all of these cleans the draft (84 → 54 walls on Sheltech A, crooked 26 → 9 on BTI A) but **adds no
   rooms**, and each patch moves the artefact elsewhere (columns: recall 62 → 54 %).
3. **Rooms stay open because 35–49 % of room boundary is not a thick wall at all**: windows, thin veranda /
   railing lines, foliage over planter walls, light-grey shaft walls, or nothing (open plan). A tracer that
   starts from thick ink can never close those rooms. This, not wall finding, caps the eval (46 of 116 with
   window guesses on, 13 of 116 walls-and-doors only).
4. **Text reading is the weakest link.** Only 57 of 87 sized labels are found and 28 sizes read correctly
   (Sheltech 0–1). The crops are legible to a human at 4× — it is the reader, not the resolution. Consequences:
   scale falls back to line weight (+10.8 % Sheltech, +15 % Banani, +20 % DMD) and the flat pick fails
   (Banani: wrong flat's area; DMD: all three flats).
5. **Published evidence agrees.** Rule-based systems reach 90 %+ only on one notation at ~3500 px; on small
   mixed-style real-estate images they land at ~57–59 %. The published cure for duplicates is a global
   consistency step, not more local heuristics. No public pretrained model is commercially usable
   (CubiCasa5K etc. are non-commercial) and they do badly on marketing plans anyway.

## 2. The experiment that points the way

Almost every room carries a label with its printed inner size ("BED-3 11'-0"X10'-6""). Fit that W×H rectangle
around the label to the ink edges:

- With the size read correctly: **79 of 87 sized rooms land on the drawn walls (91 %)** — including rooms behind
  windows, thin-line verandas, open-plan living/dining and the low-res Sheltech sheet. Median edge error 7 cm.
- The gap between two neighbouring fitted rooms IS the wall: 90 % of gaps are 0.07–0.35 m and match the drawn
  thickness to 1–4 cm. One wall per room boundary, by construction.
- With today's OCR it only matches 26 of 116 (reader is the bottleneck); with a perfect reader on labels already
  found: 52; union with the bottom-up solver: 62 today, 72 with a perfect reader, 89 at the oracle ceiling.
- It cannot seed the 29 of 116 rooms with no printed size (AOD, planters, lifts, stair).
- No publication does this — it is ours.

## 3. Architecture v3

Top-down and bottom-up meet on a shared skeleton of **tracks**. Deterministic; AI only reads text it is handed.

1. **Pixel classes (per sheet, colour + stroke width).** wall ink (dark, 0.10–0.35 m across) · block (dark,
   wider: columns, junctions, shear walls) · thin line · glass (blue) · plant (green — removed BEFORE tracing) ·
   text. Each ink pixel belongs to exactly one class.
2. **Read labels.** Find label boxes → tesseract with a feet-inch grammar → unread crops go as ONE montage to
   the AI reader (this is the ≤ 10 % AI: reading ~20 tiny labels, no geometry) → still unread → Studio asks the
   user to type that size (review item). Scale = consensus of the rooms' printed sizes; a user-clicked dimension
   when nothing reads.
3. **Tracks.** Per axis direction, cluster wall-ink centre marks into track lines; two tracks closer than half
   a wall are the same track. A wall = an occupied interval on a track. Corners = track crossings (exact, no
   averaging). Blocks attach to crossings and are never walls. Thickness snaps to the sheet's own 2–3 classes.
   Angled walls: separate direction families from the leftover mask. Parallel duplicates, fragments and tilted
   walls cannot be represented. This replaces tidy / snapAxes / joinEnds / node / pruneSpurs / extendEnds /
   resumeWalls / mergeCollinear.
4. **Fit rooms.** Rectangle per sized label, joint fit (no overlaps, no rectangle contains another label),
   edges snap to a track where one exists. An edge with no track under it is still a room boundary; what is
   drawn there classifies it: dark = wall, blue / parallel thin lines = window, thin line = railing/parapet,
   nothing = open.
5. **Leftover space** inside the flat outline (AOD, shafts, planters, passages, L-shaped extensions) is closed
   by tracks only, merged into a neighbour when open to it.
6. **Openings** are gaps on a track / room edge: arc centred on a jamb = door; glass = window; else open.
   Children of the wall (core invariant 1), never their own wall piece.
7. **Self-check → review list.** Fitted size vs printed size per room; rooms' area sum vs printed sft; any edge
   whose class is uncertain. Flat pick = the labelled rooms connected to the click, not an area budget.

## 4. Build order

| # | Wave | What | Done when |
|---|---|---|---|
| 1 | Reader | grammar-constrained size reader + label finder fixes + AI montage fallback + "type this size" row | sizes correct ≥ 80 % of 87 without AI, ≥ 95 % with |
| 2 | Tracks | pixel classes, green removal, tracks/intervals/blocks replacing the repair passes | ≤ 1.1 draft walls per real wall, 0 tilted, dark-band recall ≥ 90 % |
| 3 | Rooms | rectangle fit + track snapping + leftover faces + scale consensus + flat pick | ≥ 70 of 116 rooms |
| 4 | Openings | per-edge classification (door / window / railing / open) | founder decides what the draft shows (below) |
| 5 | Only if new developers' sheets break 1–4 | small self-trained local model (≈ 4 MB, in-browser, no API) for wall/door/window evidence, trained on generated plans + CC BY data | — |

1 and 2 are independent and can run in parallel. Before 3: fix the eval — type-a's hand trace sits a mean
4.2 px off the drawing (26 of 90 walls > 5 px), which shows correct walls as "missed"; hand-trace one Banani
flat as extra ground truth.

## 5. Open decisions (founder)

- **What the draft shows for non-wall boundaries.** 2026-09-30 decision was "walls and doors only". Rooms-first
  finds windows / railings / open boundaries as classified room edges, not guesses from gaps. Recommended: show
  them, each as a "check this" item; the alternative keeps rooms open.
- **DMD-style sheets** (grey 3 px walls at 18 px/m, same as text): out of scope until a higher-resolution
  source exists.

## 6. 2026-10-09 — APARTMENT DETECTION: where it stands, and the levels to fix it (founder's priority for session 24)

**The founder's finding (2026-10-09):** "almost all of them have one or two rooms missing" after Auto-trace, and the
checks that said otherwise ran on files (grey fixtures, JSON drafts), not in the Studio with the sheet picture. He is
right on both counts. Measured today on the five hand-traced flats (`npx vitest run src/trace/solve.test.ts
--silent=false`, the "NEW READER (the product now)" table — the product's own path, no AI key):

| Flat (sheet) | Rooms found | Missing | Why (the eval's own words) |
|---|---|---|---|
| Sheltech A (L2) | 15 of 21 | 6 | Veranda 1, Veranda 4, Passage, Bed 4 MERGED into a neighbour; Toilet, Living, Lobby, Stair SPLIT; Planter (east) no face |
| Sheltech B (L2) | 14 of 20 | 6 | Toilet, PDR, Veranda 1, Lobby MERGED; Planter (south), Lifts, Dining SPLIT; Planter (west) no face |
| BTI Type A | 18 of 27 | 9 | AOD (service / west / south / east / north), Service veranda, Veranda (study) MERGED or no face; Bath-3 no face; Bed-3, Lift lobby SPLIT; H. toilet, Planter SHIFTED |
| BTI Type B | 19 of 22 | 3 | AOD (bath-2), Planter (living), Veranda (living), Stair no face; Lift lobby MERGED |
| BTI Type C | 23 of 26 | 3 | AOD (service), Lift lobby MERGED; Bath-3 no face; Bed-1, Bed-2, Lift core SPLIT; planters SHIFTED |

Total **71 of 116**. With PERFECT names (the "oracle" row) it is still 71 of 116: the names are not the cap, the
ROOM BOUNDARIES are (§1.3 above: 35–49 % of a room's edge is no thick wall — glass fronts, railings, planter edges,
shaft walls, open plan). The three ways a room goes missing, in the eval's words: **merged** (a veranda / AOD / lobby
swallowed by the room beside it because the glass / railing / thin line between them is not a wall), **split** (a
room cut into pieces by a line that is no wall — a counter, a wardrobe, a column row — or by a door bridge that never
closed), **no face** (the room never closes at all). Walls themselves are found at 59–69 % recall / 68–85 %
precision (`walls.test.ts` table) — better walls alone do not add rooms (§1.2).

In the Studio on the Sheltech L2 sheet at the founder's scale (Firefox, session 23): "Traced 96 walls, 13 rooms,
9 labelled"; Lobby, Toilet 3, Veranda 1, Bed 4 and Veranda 4 never close; Toilet 1 comes out as "Space 4"; the
Kitchen's printed size is not read; the area line says "13 closed rooms add up to 1401 sft … should give about 2408 —
3 named rooms are still open".

**Ground truth today:** five hand-traced flats (BTI type-a / b / c, Sheltech L2 A / B) and nothing else — no truth
for Banani, DMD, Sheltech L1 / L3–L6 or the BTI sheets that are not those three flats. 29 sheets in `Demo drawings/`
(BTI 5, Sheltech 10, Banani 8, DMD 6) have been run only as a crash / speed smoke in node, never judged room by room.

### The levels (each one = one task for one agent; each ends with the Level 0 scoreboard re-run and a HANDOFF entry)

**Level 0 — Measure in the product, on every sheet (first, before any fix).** An agent acting as the founder
(Firefox, the sheet picture, mouse; no JSON / fixtures): for EVERY sheet in `Demo drawings/` that shows flats, drop
the picture, set the scale from a printed size, Auto-trace each flat (one click per flat, as today), and for each
flat write down: rooms printed on the sheet (read off the picture by the agent), rooms closed AND named, rooms
closed but unnamed ("Space N"), rooms open or missing (by printed name), and the review rows. Overlay screenshot per
sheet. Result = `Docs/AUTOTRACE_SCOREBOARD.md`: one row per flat per sheet, plus the 71 / 116 node table. This
scoreboard is THE acceptance for every later level ("done when" below reads from it); the node evals stay as the
fast check between runs. Also from this level: pick 3 more flats to hand-trace as ground truth where the scoreboard
is worst (one Banani, one DMD, one Sheltech L1 / L3–6 if they differ from L2 — the agent checks, never assumes).
Done when: the scoreboard exists for all flat sheets and names every missing room.

**Level 1 — Close rooms on their real boundaries (the biggest loss: merged + no face).** A room's edge on these
sheets is a thick wall OR glass (two / three thin lines), a railing / planter edge (one thin line), a shaft wall
(light grey), or nothing (open plan). Rooms-first: each room is bounded by whatever is drawn there, and the edge is
classified (wall / glass / railing / open) and shown as such — a glass front becomes a glass wall (sill 0, full
height), a railing a low wall, an open edge a zone line (`heightM` 0) — each one a "check this" row the person can
change in one click. This needs the founder's open decision in §5 ("what the draft shows for non-wall boundaries") —
recommended: show them. Covers the glass-front placement problem parked on 2026-10-09 (the window on the frame band,
not the columns' line; patch at `E:/dev/tmp/s23/t3/glazing-frame-prototype.patch`, and its trap: Bed 3 stopped
closing because the flat picker drops 0.07 m joining pieces). Done when: verandas, AODs / shafts, planters and lobbies
stop being "merged" / "no face": at least 95 of 116 in node AND every scoreboard flat has at most 1 room missing.

**Level 2 — Stop splitting rooms on lines that are no wall.** Counters, wardrobes, column rows, dashed lines and
unclosed door bridges cut Toilet, Living, Dining, Bed-1 / Bed-2, lift cores into pieces ("split"). Rule: a face with
no printed name whose every edge toward a named neighbour is a thin line or a gap is part of that neighbour (the
2026-10-03 "join the unread space" rule, applied to faces, not whole rooms); a door bridge must close or be a
"check this" row. Done when: "split" is gone from the eval's missed list on all five flats; the scoreboard shows no
room in two pieces.

**Level 3 — Every printed name and size lands in its room.** "Space 4" for Toilet 1, the Kitchen's size unread,
the printed "TYPE-A ±2736 SFT" dropped (task 5 found it): the reader finds every name block on the sheet, a name
with no closed room gets a review row with the crop and a "name it here" click, a read size becomes the room's
Printed size (never the Studio's own measurement — fixed 8a17210), and a size typed by hand produces a size-check
row (the gap seen 2026-10-09: it does not today). The TYPE label is kept as the flat's name (core `flatTypeOf`).
Done when: on the scoreboard every printed name is on a room or in a review row, 0 "Space N" rooms where the sheet
prints a name, and the Kitchen / Toilet 1 size rows show on Sheltech L2.

**Level 4 — The whole floor in one go.** Today Auto-trace does one flat per click and the founder traces the lobby
and the second flat by hand. The whole sheet: every flat + the core in one run, `deriveFlats` groups the rooms
(2026-10-09 rules: doors, sliders, passages, walls < 1.2 m join; lobby / stair / lift stop), the TYPE labels name
them, the area line is per flat ("Type A: 17 rooms add up to … sft, printed ±2736"). Done when: Sheltech L2 and one
BTI sheet come out as 2 named flats + core from one click, scoreboard counts per flat.

**Level 5 — The person fixes the rest in seconds.** Whatever is still missing after 1–4 must be a review row that
says WHICH room ("Veranda 1 is open on its south side") with the one-click fix (close it with a glass wall / low
wall / zone line, name it, join it), and the room count against the sheet ("17 of 18 printed rooms closed; missing:
Veranda 1") so a person sees at once what is left. Done when: a Level 0 re-run as the founder gets every test flat
to "all printed rooms closed and named" in under 2 minutes of clicks per flat, and the MANUAL says how.

**Order:** 0 → 1 → 2 → 3 → 4 → 5. Level 0 and the ground-truth tracing can run while the founder decides §5.
Levels 1 and 2 touch `src/trace` and `src/core` (plan first). Each level: one Opus agent on a worktree off main,
acceptance in Firefox on the sheets, HANDOFF + scoreboard in the same merge, `npm run typecheck` + `npm test` green.
**Out of scope here:** DMD-style grey 3 px sheets (§5), AI drafting as a separate button (it lives inside Auto-trace
later), ground / basement / roof auto-trace.
