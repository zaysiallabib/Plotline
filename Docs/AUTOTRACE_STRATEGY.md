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
