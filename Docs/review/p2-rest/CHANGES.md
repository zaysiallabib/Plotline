# The cofounder's fork, everything but DXF — change by change against ours (lane p2rest, session 31, 2026-11-26)

**What was compared.** The fork (Maheer's, `E:/dev/tmp/s31/p2/Plotline2.O-main/`, files dated 2026-11-24) against our
session branch `s31/redesign` at `bb23229`. Nothing was ported; this is the data a later lane ports from. The DXF module
(`src/dxf/*`, `DxfImport.tsx`, `dxf.worker.ts`, `dxf-import.css`, the DXF half of `StudioApp.tsx` / `Panel.tsx`) is the
p2dxf lane's and is left out here. Measurements: `Docs/review/p2-rest/SCOREBOARD.md`.

## 1. Where the fork branched off

**Fork point: our commit `c76e4b7`** ("Merge s27/fit", 2026-10-19 23:03, main at the end of session 27).
- Found by hashing every file of his `src/` (217 files) and comparing with each candidate commit's tree: `c76e4b7` holds
  157 of them byte for byte, more than any commit before or after it (155–156 the commits just before, 152–153 just after).
- His own `Context_Plotline.md` says the same: "The inspected checkout was on `main`, based on `c76e4b7`, with existing
  tracing, rendering, test, script, and documentation changes" (13 Nov).
- The real diff was taken against that tree (`git archive c76e4b7`, read-only, in `E:/dev/tmp/s31/p2rest/base/`):
  `diff -ru base/src fork/src` = 33 changed files + 10 new ones outside DXF (`E:/dev/tmp/s31/p2rest/fork.diff`, 3 682 lines).

**What came in on his side** (two batches, both in his tree):
1. 3–4 Nov, the "P0" tracing / ground-rendering batch (his `Docs/AUTOTRACE_P0_REPORT_2026-11-04.md`,
   `AUTOTRACE_GLAZING_REPORT_2026-11-03.md`, `AUTOTRACE_OWNERSHIP_REPORT_2026-11-03.md`, `GROUND_RENDERING_FIXES_2026-11-03.md`):
   faint doors, double-action doors, coloured glass, open kitchens, lift cores by capacity, face OCR masks, kerb faces,
   contact shadows per room, covered-zone lights, solid cover slab.
2. 13–24 Nov, Maheer's list (`MAHEER_CONTRIBUTIONS.md`): pale-scan contrast, deskew border pixels, hover highlight on a
   turned sheet, scale agreement across rooms, OCR fixes (L-shaped rooms, same name twice, sparse lettering, sideways
   strips, room numbers, "440 × 320 cm"), image preparation in the worker, bounded OCR, 3D loading, viewer overlays,
   upload benchmark, Context_Plotline.md.

**What moved on our side in the same files since `c76e4b7`:** almost nothing in tracing — `solve.ts` +57 lines (s31 calm:
fewer review rows; `areasIn`; flat labels carry `flatFrom`), a few test files. Everything else he touched was rebuilt by
us in sessions 29–31: `StudioApp.tsx` (s29 import pipeline, s31 redesign), `draw.ts` (+322 / −93, redesign),
`PlotlineScene.ts` / `render.ts` / `materials.ts` / `ViewerApp.tsx` / `Minimap.tsx` (s30–31 lighting, Lite, batching,
start screen, perf lane: `Docs/PERFORMANCE.md`). So every tracing change below would land in code that is still the same
as his base; every 3D / viewer change would have to be re-applied by hand onto a rebuilt file.

## 2. Every change, one row each

Columns: **ours today** = the function on `bb23229` that does it (or "lacks"); **verdict** = fork better / ours better /
same / different job; **proof** = what decides it, and the measured result where this lane measured it (numbers in
SCOREBOARD.md, Firefox runs unless marked "node, pure rule").

### Raster Auto-trace (walls, doors, glass, scale, flats)

| # | File · function | What it does (one line) | Ours today | Verdict | Proof / result |
|---|---|---|---|---|---|
| R1 | `trace/raster.ts` `normalPolarity` → new `restoreFadedInk` | A pale scan (median grey ≥ 215, even its darkest 0.5 % lighter than 160, ≥ 45 grey levels of range, enough thin dark strokes with paper both sides) is stretched to full contrast before OCR and wall tracing. | lacks — `normalPolarity` returns a light page as it is; `walls.ts inkThreshold` caps ink at 160, so a faded plan has no wall ink at all | fork better **on a faded sheet**; does nothing on any real sheet we hold | Census of all 1 098 pictures in `Demo drawings/` with his own rule in Firefox: **0 floor plans trigger it** (2 brochure text pages do, harmlessly). Faded copies of 8 clean sheets (his own fade) made, not run (stopped by the manager). |
| R2 | `raster.ts` `WALL_INK_CAP` | The 160 ink cap shared by raster.ts and walls.ts. | `walls.ts DEF.inkCap = 160` | same (refactor) | — |
| R3 | `raster.ts` `turnRaster` | A turned (deskewed) sheet samples its border pixels (paper beyond the edge) instead of dropping the last row / column; RGBA stays `Uint8ClampedArray`. | lacks (drops a 1 px border) | fork better, tiny | His unit test. None of the 33 measured sheets is turned (`sheetTurn` = 0 on all); acts only on tilted sheets (La Montana T2). Port with its test. |
| R4 | `walls.ts` `arcInk` | Door-arc "local contrast" by counting pixels below a cut instead of sorting a 7×7 window per probe; window radius a parameter, scaled ×2/×3 when a small sheet is enlarged before tracing. | `arcInk` sorts 49 px per probe; radius 3 px even on a 2× enlarged sheet | fork better (same answer at native size — his median-reference test — and the right neighbourhood on enlarged sheets) | His tests (median reference incl. ties; 2× / 3× enlargement). Speed: SCOREBOARD time columns. |
| R5 | `tracks.ts` `traceTracks` (side-contrast filter) | A wall interval is kept by the median side contrast of its own cross-sections at their measured widths, not the whole interval at its thickness class's width — a short thick riser where a wall changes width (Sheltech's lift junction) is no longer thrown away. | lacks (`sideContrast` over the whole interval at the class width) | fork better | His Sheltech crop test. **Measured:** Sheltech Level 2's Toilet 2 is no longer merged into the lift (+1 room; Sheltech B 13 → 15 rooms matched to the hand trace). |
| R6 | `tracks.ts` `classifyGap` (glass colour) | A window pane may sit up to 0.1 m off the wall centre, but one straight offset must carry the blue for ≥ 60 % of the gap; scattered blue across the band no longer counts. | lacks (any offset per sample: scattered blue counts) | fork better | His test (pane just inside the face kept; scattered / distant colour not). |
| R7 | `tracks.ts` `classifyGap` (`faint`) + `doorArcs` (`requireLeaf`, `anchor`) | A faint door is accepted only when two contrast cuts agree on the same hinge and swing and a straight leaf is drawn; closed fixtures, rings, part-arcs stay out. | lacks | fork better in his tests; **no gain measured** | Openings found on the 5 hand-traced flats: ours 116 of 161, his 112 (R7–R9 together). |
| R8 | `solve.ts` new `refineOpenings` | After room fitting, at the final scale and full resolution, undecided gaps are re-read with 4 contrast cuts; a very faint door is kept at low confidence (a review row), plus R9's doors. | lacks | fork better | as R7. |
| R9 | new `trace/doorEnds.ts` `endDoors` | Double-action doors: a half-circle swing about a structural wall tip, with a jamb across, clear floor inside, no closed ring. | lacks | fork better (a door kind we never find) | His tests (rotated, rings, part-arcs as negatives). |
| R10 | `close.ts` `drawn` | A closing line ≥ 90 % on blue glass colour counts as glazing (even on a dark floor fill). | lacks | fork better | His test (colour glazing closes a room on a dark floor, 0° and 30°). |
| R11 | `faces.ts` `thinFaces` / `glazingFrames` | Thin blue / cyan panes read from the colour mask on their own (a pane lighter than a dark floor was lost in the grey threshold); partial readings of one pane share one axis; a line pruned next to a T reconnects; a living / dining / open kitchen behind coloured glass may hold two labels; an unnamed room closed by real walls + coloured glass is kept. | lacks | fork better | His 9 face tests (corner of two panes, break left open, free blue rectangle refused, blue bathroom floor refused). |
| R12 | `solve.ts` `planterMask` (+ `text`) | Printed labels (and the white left where text was erased) on a dark floor are not foliage; a pale-green JPEG halo round coloured text needs real green support. | lacks | fork better | His test. |
| R13 | `solve.ts` `pickFlat` (no click) | Without a click, the region holding a printed BED name wins over the merely largest region (a newly closed unnamed core no longer becomes "the flat"). | lacks | fork better | His 2 tests. |
| R14 | `solve.ts` new `capacityCores` | Two adjacent small dimensioned rooms each printed "8 PERSONS" (a lift bank whose LIFT word was not read) are kept out of every flat, with a review row. | lacks | fork better (a review row more on whole floors) | His recovery test. |
| R15 | `solve.ts` `prepareTraces` → `buildCore` / `refreshCore`; label loop | A closed lobby / lift face ends at its own walls (the 1.2 m halo round its label is only for an unclosed core — it used to steal the next bedroom across a thin wall); core evidence wins even when a flat's flood claimed the face first; names found late (face OCR) refresh the core without re-tracing walls. | older rule: halo always; core only when no flat claimed it | fork better | **Measured with R17:** lifts / stairs / lobbies closed and named right 29 → **39 of 79** on 29 sheets (7 sheets gain, none lose). His P0 report: Banani L2-6 flat witnesses 7/12 → 12/12, core 0/3 → 3/3. |
| R16 | `solve.ts` `selectFlat` (glass leaf) | A veranda behind drawn glass, off the flooded floor, is given to its flat now (another flat could claim it as "surrounded"). | lacks | fork better | His P0 report (Banani). |
| R17 | `solve.ts` `pickTraces` (whole floor) | Every core face goes into a whole-floor draft, even one not touching a flat's wall. | lacks | fork better | as R15. |
| R18 | `solve.ts` `pickTraces` / `faces.ts` (open kitchen) | An "OPEN KITCHEN" print inside a living / dining space sizes its work zone, not the whole shared room; the living names the room. | lacks | fork better | His face test; "wrong" / size rows. |
| R19 | `rooms.ts` edge-step prefix sums | One step buffer and one byte mask instead of two step and four bonus Float32 images. | lacks | fork better (memory only, same result) | — |
| R20 | new `trace/scale.ts` `dimensionConsensus` (used in `prepareTraces`) | With no scale given: printed room sizes vote **per room** — a size printed twice in one room is one vote, a room whose sizes disagree has none; ≥ 2 rooms must agree and be the majority. | any two printed sizes agreeing anywhere set the scale | **ours better** | Firefox, no S, 19 sheets finished by both: the same scale on 15; **his worse on 4, better on none** (Kanakchapa −38 → −51 %, Gladiolus −43 → −75 %, Phera −34 → −78 %, Hermitage −47 → −76 %); within 3 % on 8 of 19 in both. Do not port as it is. |
| R21 | `solve.ts` `preview` + `studio/draw.ts` (`regionAngle`) | On a turned sheet the hover highlight is drawn turned with the sheet (rotated rectangles), not as the axis-aligned box round each turned rectangle. | `boxBack`: axis-aligned bounding boxes (the tint spills past the flat on a tilted sheet) | fork better (look only) | Acts on no sheet of the 33 (none is turned); the hover shot on the 10.6° tilted La Montana Tower 2 sheet was prepared, not run. Port with his rotated-hover test. |

### Room-label OCR (`trace/text.ts`)

| # | Function | What it does | Ours today | Verdict | Proof / result |
|---|---|---|---|---|---|
| T1 | `parseDims` | A unit printed once (mm / cm / m, on either side) applies to both sides: "440 x 320 cm" = 4.40 × 3.20 m. | only a trailing "m" on the second side; cm / mm sizes are not read; **"4.4m x 3.2" reads 4.40 × 0.98 m** (the 3.2 as feet) | fork better, and fixes a bug of ours | node, pure rule (`purecheck.md`): ours reads 4 of 9 test prints right, fork 9 of 9. No Dhaka sheet in the 33 prints cm. |
| T2 | `snapRoomWords` | Snapping a misread word keeps its number and separators ("KlTCHEN-02" → KITCHEN-02, "M.BED-01" stays) and snaps a word with a digit in it ("T0ILET 2" → TOILET 2). | "KlTCHEN-02" → **KITCHEN**, "M.BED-01" → **BED** (number and "M." lost), "T0ILET 2" unsnapped | fork better | node, pure rule (`purecheck.md`). |
| T3 | `normaliseName` | The joined "LI" read as "U" is undone only into an exact room word: UVING → LIVING, UFT LOBBY → LIFT LOBBY. | lacks (UVING stays) | fork better | node, pure rule. |
| T4 | `WORDS` += HOISTWAY; LEXICON de-duplicated | A shaft word can be snapped to. | HOISTWAY is in our kind / core lists, not the snap list | fork better, tiny | — |
| T5 | `stretch` | Histogram quantiles (no sort of the whole crop); when the 2 % and 60 % points both land on paper (a sparse label), the 0.1 % point is the ink. | sorts the crop; on a sparse label the stretch turns paper grain black | fork better | node, pure rule: a 1.3 %-ink label on grainy paper — ours turns **27.9 %** of the paper black, fork 0 %. |
| T6 | `ocrWorkers` | OCR copies by memory: 1 on ≤ 2 GB, ≤ 2 on ≤ 4 GB, else half the cores (1–6). | half the cores, never under 3 | fork better on small machines; the same in desktop Firefox (it reports no memory) | — |
| T7 | `readBounded` (in `readText`, dims reread, `readInFaces`) | Each crop is resized only when an OCR worker is free; the first failure stops the rest. | all crops of all passes made at once (`Promise.all`) | fork better (memory); time the same | Click-to-ready on 29 sheets: ours 998 s, his 996 s; the worker's own time ours 476 s, his 511 s (+7 %, his extra probes). |
| T8 | `readInFaces` + new `cropInFace` | The face crop is masked to the room's own outline (no neighbour's text from the bounding box, concave L-shapes), mixed case allowed, the name is placed at its printed line (an L-shaped room's centroid can lie outside it), two adjacent rooms may both carry the same name (duplicates by box overlap, not "same name within 1 m"), a core word needs two agreeing reads; a rejected "name not read" strip inside the face is re-read upright (sideways strips turned), as a word and a line, 5 ways, 2 agreeing votes. | lacks all of it | fork better in his tests; **the same on our sheets** | Names read on 29 sheets: ours 458, his 459 of 519. His tests: L-shaped room, sideways cw / ccw, metric kitchen sample. |
| T9 | `solve.ts` `autoTrace` after `readInFaces` | Late names refresh flat / core ownership (R15) without re-tracing. | lacks | fork better | as R15. |

### The trace worker and the Studio's upload (`studio/autotrace.worker.ts`, `StudioApp.tsx`, `trace/rasterInput.ts`)

| # | What | What it does | Ours today | Verdict | Proof / result |
|---|---|---|---|---|---|
| W1 | worker `rasterize` + `createImageBitmap` in `startAutoTrace` | The plan picture goes to the worker as a bitmap; grey + colour buffers are made there (OffscreenCanvas); the old main-thread path stays as a fallback. | `rastersOf` on the page's thread, then transferred | fork a little better | Longest stall of the page after the Auto-trace click, 33 sheets: median ours 40 ms / his 28 ms, worst 93 / 83 ms; no visible freeze in either; time to "Point at a flat" the same (998 / 996 s). |
| W2 | `traceRasters` | The grey + colour buffers, one helper for both paths (same luminance formula). | inline in `rastersOf` | same | — |
| W3 | `MAX_TRACE_PIXELS` | Auto-trace refuses a picture over 16 megapixels ("Export one floor or use a smaller image"). | no limit | **ours better for the founder's sheets**: 12 of our 1 098 pictures are over 16 MP (Mir Amenas Heritage ×4, Mir Shohag Garden ×3, Mir Ar Rahma, Akter Residence Park ×4) — the fork refuses them; ours traces them (slowly) | Census (`census.json`). Port only with a downscale, never as a refusal. |
| W4 | "Upload design" + automatic whole-floor trace on a dropped picture; "Calibrate and retrace floor"; `raster-import` (picture + draft one undo step); stale-upload guards (`uploadSequence`) | Dropping a plan traces the whole floor at once at an automatic scale; when the scale came from wall thickness / area a button asks for one known length and traces again; undo restores the old picture with the old draft. | drop = picture only; S, then Auto-trace; our s29 import dispatcher (DXF / IFC / PDF / mesh) | **ours better as the default** | The no-scale run (SCOREBOARD §1b) is what his automatic upload produces: the scale is off by more than 3 % on 11 of 19 sheets (both apps), so a trace that skips S hands the founder a wrongly sized draft more often than not. His "Calibrate and retrace" button, undo-with-picture and the stale-upload guards are worth porting on their own. |
| W5 | Esc cancels a running trace | Esc stops the trace while it runs, not only in pick mode. | Esc only in pick mode (`trace === 'pick'`) | fork better, tiny | — |
| W6 | `Panel` `importControl` / `importReview` slots | Places for the DXF buttons and review. | — | DXF lane | — |
| W7 | `draw.ts` `preview?: Preview` | The worker's preview type reused. | own inline type | same | — |

### Benchmarks and tooling

| # | What | What it does | Ours today | Verdict |
|---|---|---|---|---|
| B1 | `trace/eval/uploads.test.ts`, `npm run bench:uploads` | The production build in Firefox: "Upload design" on the 3 hand-traced floor pictures at automatic scale, Export, scored against the 5 hand-traced flats (labels closed + named, rooms at IoU 0.6, scale error, seconds); tesseract's CDN files served from local copies (repeatable, offline). | our Firefox harnesses live outside the repo (`E:/dev/tmp/s25/run.mjs`, `s31/calm/fx.mjs`); `solve.test.ts` node table | worth porting as an in-repo command (keep our "S first" path beside his "no scale" one) |
| B2 | `scripts/trace-*.mjs`, `trace-cases.json`, `trace-ownership.json`, `trace-boundaries.*`, `check-trace-results.mjs`, `acceptance.test.ts` | A portable 37-workflow Firefox corpus on the 29 checked-in pictures with flat-ownership witnesses and glazing samples, a source fingerprint, a before / after comparer. | none in the repo | worth porting as tooling (relative paths, no E: defaults) |
| B3 | `score30.test.ts` | Folders relative to the repo (`.trace/`), a `coverage.json`, and a failure when fixtures are missing instead of a silent smaller score. | E:/dev/tmp defaults | small, worth taking |
| B4 | fixtures `metric-room.pgm`, `stepped-junction.pgm` | Images behind T1 / T8 / R5 tests. | — | come with their tests |

### 3D loading, lights, viewer (one line each; not measured — our session 31 rebuilt these files, `Docs/PERFORMANCE.md`)

| # | What his change does | Does it still apply to ours? |
|---|---|---|
| V1 | `materials.ts` `waitForFinishMaps` + `PlotlineScene.whenVisualsReady`: Enter opens only when furniture, sky light and finish pictures are in (20 s cap). | **Covered.** Ours waits under the start screen for every model and picture already (`prepare` awaits `furnished` + the `loading` set, 15 s cap). |
| V2 | `PlotlineScene.loadFurniture`: three pieces loading at a time; deleted pieces not built at all. | **Half.** Ours asks for every model at once (`preloadModels`) and mounts nearest first — better than a pool of 3; but ours still builds deleted pieces and hides them: "skip removed" still applies. |
| V3 | `currentRoomId` answers from the last position when the walker has not moved. | Applies (same code in ours), tiny. |
| V4 | `viewEye` / `viewHeading` / `projectPoint` on the scene; `Minimap`, `Notes`, `SunPill`, `ViewerApp` without their own three.js import; the pins' and chips' frame loops stop when nothing is shown; the room-chip timer only after Enter. | Applies (files exist, ours still imports three.js in all four), small. |
| V5 | `ViewerApp`: the 3D engine is loaded only when Enter is pressed; the Enter click asks for the pointer lock itself. | **Conflicts with ours.** Ours builds the flat behind the start screen so Enter is instant (s31). Leave. |
| V6 | `three/lightsMode.ts`: the lamps' auto rule in its own small file. | Applies, trivial (only useful with V5). |
| V7 | `render.ts` `coverLightSpots`: a covered-zone batten only where its whole 1.2 m body is under the slab. | Applies (ours `coverLights` still tests the centre point). Port with its test. |
| V8 | `details.ts` `coverSlabGeometry`: the slab over a covered zone gets a solid edge and both faces (it was a one-sided plane, invisible from the side). | Applies (ours `render.ts` builds the one-sided `ShapeGeometry`). Port with its test. |
| V9 | `context.ts` `buildContactShadows`: one contact-shadow sheet per furnished room on that room's own floor (ramps, raised lawns), clipped to it; deleted pieces cast none. | Applies (ours: one flat sheet at 14 mm over the whole unit). Costs one draw per furnished room against our s31 batching — measure on Lite before taking. |
| V10 | `details.ts` `stepFaces`: a retaining face above a kerb / low wall where two floors differ, clipped where a ramp crosses it. | Applies (ours only fills steps on zone lines, `heightM` 0). Port with its 2 tests. |

### Documents

| # | What | Verdict |
|---|---|---|
| D1 | `Context_Plotline.md` (98 kB onboarding guide, 13–24 Nov, written on `c76e4b7` + his changes) | Good structure (routes, data contract, coordinate frames, where data is saved, acceptance by change type). Out of date for ours in many places (the front page at `/`, the s31 design, Lite, the start screen, accounts, the s29 import pipeline). Port as a rewritten guide only if the founder wants one; never copy as is. |
| D2 | His MANUAL / KEYS additions | DXF lane, plus one paragraph on pale scans (R1). |

## 3. What to port, ranked (the manager decides; numbers from SCOREBOARD.md)

Measured on 29 real sheets with the scale set (the founder's path): his tracer is **+7 rooms (446 vs 439 of 519), +10
lift / stair / lobby rooms (39 vs 29 of 79)**, better on 10 sheets, worse on 1, the same on 18; names read and time the
same; 57 % more Check-these rows (our s31 calm work is not in his copy). Everything below lands in tracing code that is
still the same as his base, so each is a clean port with his own tests.

1. **The building core** — R15 + R17 (+ R14, T9). The biggest measured gain: +10 core rooms on 7 sheets, none lost; a
   closed lobby no longer steals the bedroom across a thin wall (his Banani witnesses 7/12 → 12/12). Check our s31 calm
   row rules on top (R14 adds a row).
2. **Coloured glass and open plans** — R10 + R11 + R18 (+ R6, R16). Jahan Lodge's living / dining / kitchen and Accept
   Aftabnagar's dining and family living close (+5 rooms on 2 sheets); his 9 face tests come with it.
3. **The short wall where a wall changes thickness** — R5. Sheltech Level 2's Toilet 2 split from the lift (+1 room,
   Sheltech B 13 → 15 rooms matched to the hand trace). Small code, a real-sheet regression test.
4. **The text rules** — T1 (metric sizes; fixes our "4.4m x 3.2" = 0.98 m bug), T2 (numbers kept on a snapped name), T3
   (LI read as U), T5 (sparse label stretch), T4. Pure functions with tests; no change on today's 29 sheets, a sure
   gain on the first sheet that prints cm or loses a number.
5. **Face OCR** — T8 (outline-masked crops, name at its printed line, same name twice, sideways strips re-read) + T7
   (bounded crops) + T6. No gain on our sheets (458 vs 459 names) but no loss and less memory; take after 4.
6. **Labels on dark floors are not foliage** — R12 (Silvi's planter +1), and R13 (a bedroom's region wins without a click).
7. **Doors** — R4 (arc contrast at the right size on enlarged sheets, faster), R7–R9 (faint and double-action doors). His
   tests pass; on the 5 hand-traced flats they found 4 fewer matched openings than ours (112 vs 116) — port R4 first,
   R7–R9 only with a before / after on the hand-traced flats.
8. **Image preparation in the worker** — W1 (+ W2). A slightly smoother page (median stall 40 → 28 ms), same wait.
9. **Turned sheets** — R3 (border pixels) + R21 (the hover tint turned with the sheet). Correct, tiny, acts only on tilted
   sheets (La Montana Tower 2); port with their tests.
10. **3D, where it still applies** — V7 (covered-zone lights), V8 (solid cover slab), V10 (retaining face above a kerb),
    each with its test; V2's "do not build deleted pieces"; V3 / V4 small. V9 (per-room contact shadows) only after a
    Lite measurement (one draw per room against our batching).
11. **Tooling** — B1 (an in-repo Firefox upload benchmark with local OCR files; keep S-first beside no-scale), B2, B3.

**Leave:**
- **R20, the per-room scale vote**: made the guessed scale worse on 4 of 19 sheets, better on none.
- **W3, the 16-megapixel refusal**: 12 of our pictures (Mir Amenas Heritage, Shohag Garden, Ar Rahma, Akter Residence Park)
  would be refused; ours traces them.
- **W4 as the default** (a dropped picture traced at once without S): the guessed scale is wrong on 11 of 19 sheets in both
  apps. Take only its "Calibrate and retrace" button, undo-with-picture and stale-upload guards.
- **V5** (the 3D engine loaded on Enter): undoes our s31 start screen that builds the flat before Enter; **V1** is covered.
- **R1, the pale-scan recovery**: harmless and correct, but no floor plan among our 1 098 pictures is pale enough for it
  to act (the faded-copy test was not run). Port last, with its tests, as insurance.
- **D1, Context_Plotline.md** as it is: out of date for ours (front page, design, Lite, start screen, accounts, imports).
