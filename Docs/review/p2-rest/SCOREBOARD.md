# The cofounder's raster Auto-trace and OCR against ours, measured (lane p2rest, session 31, 2026-11-26/27)

**In plain words.** On the 29 real brochure sheets both apps finished, with the scale set the way the founder sets it (S on
a printed size), his tracer closes and names **446 printed rooms against our 439** (85.9 % against 84.6 %) and the
building's **lifts and stairs 39 against 29**. It was better on 10 sheets, ours on 1, the same on 18. It reads the same
number of room names (459 against 458) in the same time (996 s against 998 s from the Auto-trace click to "Point at a
flat"). It leaves **57 % more "Check these" rows** (1 823 against 1 160) — mostly because his copy predates our session 31
"calm" work, which took a third of the rows away. Its walls on the five hand-traced flats are the same as ours (one flat
3 points better). **Without the scale step, his scale-agreement rule made the scale worse on 4 of 19 sheets and better on
none** — and his "Upload design" path skips that step. His pale-scan contrast recovery never fires on any of our 1 098
pictures (no floor plan we hold is that pale). His text-rule fixes are real: sizes printed in cm / mm, a number kept on a
misread name, a sparse label's paper kept white.

## 0. How it was measured — the founder's path, both apps side by side

- **Both apps in one Firefox** (Playwright's build on E:, headless, 1600 × 1000, a fresh browser context per sheet and
  app): ours = `E:/dev/Plotline/.claude/worktrees/s31-p2rest` (`s31/redesign` `bb23229`) on port 5227; his = the fork as
  he gave it (`npm ci` inside `E:/dev/tmp/s31/p2/Plotline2.O-main`, its own Vite and packages) on port 5237. Turn about per
  sheet, the order flipping every sheet, so machine load hit both alike.
- **The clicks** (`E:/dev/tmp/s31/p2rest/fx.mjs`, the s31 calm harness made two-app): load the sheet picture with the
  Studio's own picture input; **S** on the sheet's printed length (two image points + the typed size, the 30-sheet
  scorer's `sheets30.json` and the calm lane's `l0.json`); **Auto-trace**; wait for "Point at a flat"; **Whole floor**
  (Kanakchapa: click inside Type A); wait; **Ctrl+S** Export. The page text, a shot and the export are kept per run.
  Run "no scale" = the same without S (the scale is the tracer's own guess — what his "Upload design" does).
- **The sheets**: the 30 sheets of the 30-sheet scorer (`src/trace/eval/sheets30.json`, 522 printed rooms) + the three
  sheets with hand-traced flats (BTI 2nd floor `img_3`, BTI 3rd floor `img_2`, Sheltech Level 2 — `l0.json`'s printed
  points) = 33. List: `E:/dev/tmp/s31/p2rest/sheets33.json`.
- **Scored with OUR rules for both** (`score.mjs`): `score30.ts scoreUnit / rowOf` on each export against the sheet's
  printed rooms (right = a closed room with the right name; "names read" = a right name the reader read within 3 m,
  from the export's own `review.stats.printed`); on the three sheets with hand traces `solveEval.ts scoreSolve` +
  `withWallScore` (rooms at IoU 0.6, wall recall / precision on the hand trace laid onto the drawing, openings within
  0.3 m). Totals count only sheets both apps finished.
- **Not finished** (stopped by the manager: "judge from the data you have"): the no-scale run reached 19 of 33 sheets
  both; the faded-sheet run, the tilted-sheet hover shot and his own "Upload design" path were not run; ours' export of 4
  sheets in the scale run hung on our own "This unit has N errors. Export anyway?" box (a harness gap, fixed for the
  later runs, never re-run) — those 4 are compared from the panel's own count line below.
- Logs, exports, shots: `E:/dev/plotline-shots/s31/p2rest/given.log` + `given/`, `auto.log` + `auto/`; tables
  `E:/dev/tmp/s31/p2rest/score-given.md`, `score-auto.md`, room-by-room `diffrooms-given.txt`.

## 1. Scale set with S (the founder's path) — 33 sheets, 29 finished by both

| sheet | printed | right ours / fork | names read ours / fork | wrong | unnamed | merged | open | false rooms | core right | scale ours / fork | read s ours / fork | trace s | Check these |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bti-amabilia-typea | 16 | 12 / 13 | 14 / 14 | 1 / 1 | 0 / 0 | 1 / 0 | 2 / 2 | 5 / 5 | 1/3 / 3/3 | given / given | 30 / 31 | 1 / 1 | 45 / 56 |
| bti-magnifico-unita | 27 | - / 10 | - / 18 | - / 4 | - / 0 | - / 1 | - / 12 | - / 6 | - / 1/5 | - / given | - / 33 | - / 1 | - / 187 |
| bti-cosmopolis-t4typea | 9 | 9 / 9 | 9 / 9 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 0/0 / 0/0 | given / given | 32 / 33 | 1 / 1 | 27 / 45 |
| bti-silvi-5th7th | 29 | 21 / 22 | 22 / 22 | 1 / 2 | 0 / 0 | 2 / 2 | 5 / 3 | 8 / 7 | 2/4 / 2/4 | given / given | 27 / 24 | 1 / 1 | 77 / 123 |
| bti-peak-typef-1397 | 11 | 9 / 9 | 10 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 2/2 / 2/2 | given / given | 22 / 19 | 1 / 1 | 16 / 21 |
| bti-fernhill-2nd3rd | 16 | 15 / 15 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 1 | 1 / 0 | 0 / 1 | 3/3 / 3/3 | given / given | 41 / 38 | 1 / 1 | 37 / 78 |
| bti-lamontana-t1typeb | 18 | 16 / 16 | 18 / 18 | 0 / 0 | 0 / 0 | 1 / 1 | 1 / 1 | 5 / 6 | 2/5 / 4/5 | given / given | 41 / 39 | 1 / 1 | 40 / 74 |
| bti-lamontana-t1typea | 14 | 14 / 14 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 3 / 4 | 0/5 / 2/5 | given / given | 40 / 36 | 1 / 1 | 36 / 48 |
| rangs-torukabbo-typea | 13 | 13 / 13 | 13 / 13 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 0/0 / 0/0 | given / given | 17 / 14 | 1 / 1 | 24 / 31 |
| rangs-sanctuary-12th-roof | 17 | 13 / 13 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 0 | 4 / 4 | 2 / 2 | 1/4 / 1/4 | given / given | 23 / 36 | 1 / 1 | 27 / 31 |
| rangs-whitelake-ab-fl3 | 24 | 24 / 24 | 24 / 24 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 2/10 / 2/10 | given / given | 29 / 28 | 1 / 1 | 55 / 91 |
| rangs-ixora-ef | 22 | 20 / 20 | 22 / 22 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 2 / 2 | 0/0 / 0/0 | given / given | 25 / 25 | 1 / 1 | 55 / 66 |
| sheltech-kanakchapa-l4-a | 14 | 11 / 11 | 12 / 12 | 0 / 0 | 0 / 0 | 1 / 1 | 2 / 2 | 4 / 4 | 0/0 / 0/0 | given / given | 77 / 73 | 3 / 3 | 37 / 67 |
| sheltech-waterlily-typical | 35 | - / 23 | - / 33 | - / 0 | - / 1 | - / 2 | - / 9 | - / 14 | - / 3/4 | - / given | - / 25 | - / 1 | - / 156 |
| sheltech-siddiques-typea | 14 | 10 / 10 | 10 / 10 | 0 / 0 | 1 / 1 | 0 / 0 | 3 / 3 | 2 / 2 | 2/3 / 3/3 | given / given | 10 / 11 | 1 / 1 | 35 / 54 |
| assure-gladiolus-2nd6th | 15 | 14 / 13 | 15 / 15 | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 1 | 6 / 5 | 1/3 / 1/3 | given / given | 28 / 23 | 1 / 1 | 42 / 69 |
| assure-phera-1st | 16 | 14 / 14 | 16 / 16 | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 1 / 1 | 1/3 / 1/3 | given / given | 29 / 26 | 1 / 1 | 34 / 55 |
| assure-hermitage-typical | 20 | - / 19 | - / 20 | - / 0 | - / 0 | - / 0 | - / 1 | - / 9 | - / 0/5 | - / given | - / 35 | - / 1 | - / 112 |
| cpdl-skymark-unitd | 15 | 15 / 15 | 15 / 15 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0/0 / 0/0 | given / given | 20 / 20 | 1 / 1 | 25 / 35 |
| cpdl-joljhiri-unita | 14 | 13 / 13 | 13 / 13 | 0 / 0 | 0 / 0 | 1 / 1 | 0 / 0 | 0 / 0 | 0/0 / 0/0 | given / given | 34 / 30 | 1 / 1 | 26 / 37 |
| cpdl-lareina-amber | 19 | - / 11 | - / 12 | - / 2 | - / 0 | - / 0 | - / 6 | - / 1 | - / 0/0 | - / given | - / 28 | - / 1 | - / 123 |
| finlay-chayaneer-typeb | 16 | 16 / 16 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 6 / 7 | 0/3 / 0/3 | given / given | 38 / 37 | 1 / 1 | 79 / 115 |
| finlay-nirvana-typical | 31 | 31 / 31 | 31 / 31 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 7 / 7 | 0/4 / 0/4 | given / given | 19 / 22 | 1 / 1 | 39 / 66 |
| finlay-palmspring-typea | 12 | 8 / 8 | 9 / 9 | 1 / 1 | 1 / 1 | 1 / 1 | 1 / 1 | 4 / 4 | 0/1 / 0/1 | given / given | 68 / 61 | 1 / 1 | 38 / 72 |
| ena-azmaryvilla-typea | 14 | 14 / 14 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 0/0 / 0/0 | given / given | 18 / 17 | 1 / 1 | 32 / 84 |
| ena-jahanlodge-typea | 9 | 6 / 9 | 9 / 9 | 0 / 0 | 0 / 0 | 0 / 0 | 3 / 0 | 0 / 0 | 0/0 / 0/0 | given / given | 20 / 19 | 1 / 1 | 20 / 18 |
| accept-aftabnagar-typical | 12 | 7 / 9 | 10 / 10 | 0 / 0 | 1 / 1 | 0 / 1 | 4 / 1 | 3 / 2 | 1/3 / 2/3 | given / given | 47 / 46 | 1 / 1 | 41 / 90 |
| eh-pearl-2145 | 18 | 13 / 13 | 13 / 13 | 0 / 0 | 0 / 0 | 0 / 0 | 5 / 5 | 0 / 0 | 2/3 / 2/3 | given / given | 59 / 69 | 1 / 1 | 29 / 36 |
| eh-sapphire-unita | 15 | 11 / 11 | 12 / 12 | 0 / 0 | 2 / 2 | 0 / 0 | 2 / 2 | 4 / 8 | 1/5 / 2/5 | given / given | 71 / 88 | 1 / 1 | 38 / 59 |
| mir-mrmemento-typeb | 17 | 7 / 7 | 8 / 9 | 1 / 1 | 0 / 0 | 0 / 0 | 9 / 9 | 1 / 2 | 1/4 / 2/4 | given / given | 56 / 56 | 1 / 1 | 25 / 60 |
| btibd-img3 | 28 | 28 / 28 | 28 / 28 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 6 / 5 | 2/4 / 2/4 | given / given | 31 / 31 | 1 / 1 | 57 / 81 |
| btibd-img2 | 32 | 30 / 30 | 30 / 30 | 1 / 1 | 1 / 1 | 0 / 0 | 0 / 0 | 9 / 9 | 3/4 / 3/4 | given / given | 30 / 30 | 1 / 1 | 70 / 96 |
| sheltech-l2 | 38 | 25 / 26 | 25 / 25 | 2 / 2 | 0 / 0 | 1 / 0 | 10 / 10 | 2 / 2 | 2/3 / 2/3 | given / given | 13 / 12 | 1 / 1 | 54 / 65 |
| **ours total (29 sheets both finished)** | 519 | 439 (84.6 %) | 458 (88.2 %) | 7 | 6 | 11 | 56 | 87 | 29/79 | given | 998 | 31 | 1160 |
| **fork total (29 sheets both finished)** | 519 | 446 (85.9 %) | 459 (88.4 %) | 8 | 6 | 11 | 48 | 92 | 39/79 | given | 996 | 32 | 1823 |

("-" = ours' export hung on its own "Export anyway?" box: see below.)

**Room by room, where the two disagree** (28 rooms on 29 sheets; everything else is identical):

- bti-amabilia-typea · STRETCHER LIFT (core): ours open → fork right "Lift"
- bti-amabilia-typea · F.STAIR (core): ours open → fork right "F.stair"
- bti-amabilia-typea · S.BED: ours merged "S.toi" → fork right "S.bed"
- bti-silvi-5th7th · PLANTER: ours open → fork right "Planter"
- bti-silvi-5th7th · VERANDAH: ours open → fork wrong "Void"
- bti-fernhill-2nd3rd · GREEN: ours open → fork merged "Bed 01"
- bti-lamontana-t1typeb · LIFT (core): ours open → fork right "Lift"
- bti-lamontana-t1typeb · STAIR (core): ours open → fork right "Stair"
- bti-lamontana-t1typea · FIRE STAIR (core): ours open → fork right "Fire Stair"
- bti-lamontana-t1typea · LIFT (core): ours open → fork right "Lift"
- sheltech-siddiques-typea · STAIRCASE WITH FIRE DOOR (core): ours open → fork right "Staircase"
- assure-gladiolus-2nd6th · VER: ours right "Ver" → fork open
- ena-jahanlodge-typea · LIVING: ours open → fork right "Living"
- ena-jahanlodge-typea · DINING: ours open → fork right "Dining"
- ena-jahanlodge-typea · KITCHEN: ours open → fork right "Kitchen"
- accept-aftabnagar-typical · Ver: ours open → fork right "Ver"
- accept-aftabnagar-typical · Ver: ours right "Ver" → fork open
- accept-aftabnagar-typical · Dining: ours open → fork right "Dining"
- accept-aftabnagar-typical · Drawing: ours open → fork merged "Dining"
- accept-aftabnagar-typical · Family Living: ours open → fork right "Family Living"
- accept-aftabnagar-typical · Stair (core): ours open → fork right "Stair Stair & Lift Lobby"
- accept-aftabnagar-typical · Stair & Lift Lobby (core): ours open → fork merged "Stair Stair & Lift Lobby"
- eh-sapphire-unita · PASSENGER LIFT (core): ours open → fork right "Lift"
- mir-mrmemento-typeb · G.BED: ours right "G.bed" → fork open
- mir-mrmemento-typeb · M.BED: ours open → fork right "Mbed"
- mir-mrmemento-typeb · LIFT & STAIR LOBBY (core): ours open → fork right "Lift & Stair Lobby"
- mir-mrmemento-typeb · STAIR (core): ours open → fork merged "Lift & Stair Lobby"
- sheltech-l2 · TOILET 2: ours merged "Lift" → fork right "Toilet 2"

What moved: **lifts and stairs** close in his (10 more core rooms right: his whole floor keeps every core face, his closed core no
longer leaks — R15 / R17); **an open living / dining / kitchen** closes on Jahan Lodge and Accept Aftabnagar (R11 / R18);
**Sheltech Level 2's Toilet 2 is no longer merged into the lift** (the short wall where the wall thickness steps, R5);
Amabilia's servant bed is split from its toilet; Silvi's planter closes (R12). Ours keeps Gladiolus's veranda, Mir
Memento's guest bed and one Aftabnagar veranda that his loses.

**The 4 sheets ours did not export** (the panel's own line after the trace, "N of the M room names read on it are closed
and named"): BTI Magnifico ours 14 of 20 / his 13 of 20; Assure Hermitage ours 19 of 20 / his 20 of 21; CPDL La Reina
ours 13 of 17 / his 14 of 17; Sheltech Water Lily ours 8 of 11 + 11 of 11 (two flats) / his 9 of 11 + 0 of 1 (his whole
floor found the second flat with one name). By the scorer his exports there: 10 / 19 / 11 / 23 rooms right.

**Speed and the page.** From the Auto-trace click to "Point at a flat" (what the founder waits): ours 998 s, his 996 s
over the 29 sheets — the same. The tracer's own time (`stats.ms`, in the worker): ours 476 s, his 511 s (+7 %, his extra
door and face probes). The page's longest stall after the click (no frame drawn; headless Firefox draws a frame every
~40 ms, so this only sees big stalls): median ours 40 ms / his 28 ms, worst 93 / 83 ms, over 60 ms on 3 / 2 sheets — his
picture preparation in the worker (W1) shows only as a slightly smoother page, no visible freeze in either. One ours run
(Mir Memento, first try) sat in "Reading the plan (text)" for 7 minutes and passed in 56 s in a fresh browser — flaky OCR
start, not seen in his.

**The five hand-traced flats** (rooms at IoU 0.6; walls = traced wall length on a hand-traced wall / hand-traced wall
covered; openings within 0.3 m of a hand-traced one):

| hand-traced flat | rooms matched (IoU 0.6) ours / fork | wall recall ours / fork | wall precision ours / fork | openings found ours / fork | scale error ours / fork |
|---|---|---|---|---|---|
| type-a | 17/27 / 17/27 | 60.8 % / 64.5 % | 66.9 % / 69.6 % | 21/34 / 19/34 | -1.1 % / -0.7 % |
| type-b | 21/22 / 21/22 | 94.9 % / 94.2 % | 84.3 % / 83.2 % | 28/30 / 27/30 | -0.3 % / -0.7 % |
| type-c | 20/26 / 20/26 | 91.8 % / 91.8 % | 81.5 % / 81.5 % | 24/31 / 22/31 | -0.3 % / -0.7 % |
| sheltech-a | 17/21 / 17/21 | 72.4 % / 72.4 % | 64.7 % / 64.3 % | 26/34 / 26/34 | 1.2 % / 0.8 % |
| sheltech-b | 13/20 / 15/20 | 71.6 % / 71.2 % | 74.9 % / 73.8 % | 17/32 / 18/32 | 1.2 % / 0.8 % |

Walls are the same on four flats; BTI 2nd floor Type A is 3–4 points better in his (recall 60.8 → 64.5 %, precision
66.9 → 69.6 %). Sheltech B gains 2 rooms in his (the Toilet 2 / lift split). Ours finds 116 of 161 hand-traced openings,
his 112 — his faint-door and double-door rules (R7–R9) do not add matched openings on these sheets.

## 1b. No scale given (the tracer's own guess — his "Upload design" path) — 19 sheets finished by both

| sheet | printed | right ours / fork | names read ours / fork | wrong | unnamed | merged | open | false rooms | core right | scale ours / fork | read s ours / fork | trace s | Check these |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bti-amabilia-typea | 16 | 11 / 13 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 1 | 5 / 2 | 5 / 5 | 2/3 / 1/3 | dims -0.6 % / dims -0.6 % | 29 / 29 | 1 / 1 | 52 / 66 |
| bti-magnifico-unita | 27 | 1 / 1 | 1 / 1 | 0 / 0 | 0 / 0 | 0 / 0 | 26 / 26 | 10 / 12 | 0/5 / 0/5 | dims -69.1 % / dims -69.1 % | 87 / 45 | 1 / 1 | 38 / 62 |
| bti-cosmopolis-t4typea | 9 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 9 / 9 | 1 / 4 | 0/0 / 0/0 | thickness -89.9 % / thickness -89.9 % | 58 / 76 | 1 / 1 | 8 / 33 |
| bti-silvi-5th7th | 29 | 17 / 17 | 22 / 22 | 0 / 0 | 0 / 0 | 1 / 1 | 11 / 11 | 5 / 5 | 1/4 / 1/4 | thickness +18.6 % / thickness +18.6 % | 23 / 23 | 1 / 1 | 65 / 109 |
| bti-peak-typef-1397 | 11 | 9 / 9 | 10 / 10 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 0 / 0 | 2/2 / 2/2 | dims -0.0 % / dims -0.0 % | 17 / 18 | 1 / 1 | 16 / 21 |
| bti-fernhill-2nd3rd | 16 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 16 / 16 | 0 / 0 | 0/3 / 0/3 | thickness -74.1 % / thickness -74.1 % | 64 / 79 | 1 / 1 | 6 / 10 |
| bti-lamontana-t1typeb | 18 | 1 / 0 | 1 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 17 / 18 | 0 / 1 | 0/5 / 0/5 | dims -76.6 % / dims -76.6 % | 65 / 141 | 1 / 1 | 18 / 1 |
| bti-lamontana-t1typea | 14 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 14 / 14 | 7 / 22 | 0/5 / 0/5 | thickness -76.4 % / thickness -76.4 % | 67 / 130 | 1 / 1 | 9 / 84 |
| rangs-torukabbo-typea | 13 | 13 / 13 | 13 / 13 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 1 | 0/0 / 0/0 | dims -0.6 % / dims -0.6 % | 14 / 14 | 1 / 1 | 24 / 31 |
| rangs-sanctuary-12th-roof | 17 | 13 / 13 | 14 / 14 | 0 / 0 | 0 / 0 | 0 / 0 | 4 / 4 | 2 / 2 | 1/4 / 1/4 | dims -0.2 % / dims -0.2 % | 20 / 20 | 1 / 1 | 27 / 32 |
| rangs-whitelake-ab-fl3 | 24 | 24 / 24 | 24 / 24 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 2/10 / 2/10 | dims -0.7 % / dims -0.7 % | 24 / 24 | 1 / 1 | 56 / 91 |
| rangs-ixora-ef | 22 | 22 / 22 | 22 / 22 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 2 | 0/0 / 0/0 | dims +0.2 % / dims +0.2 % | 26 / 25 | 1 / 1 | 55 / 62 |
| sheltech-kanakchapa-l4-a | 14 | 0 / 0 | 4 / 3 | 0 / 0 | 0 / 0 | 0 / 0 | 14 / 14 | 1 / 0 | 0/0 / 0/0 | dims -38.0 % / dims -51.1 % | 308 / 347 | 3 / 3 | 32 / 92 |
| sheltech-waterlily-typical | 35 | 24 / 26 | 31 / 33 | 0 / 0 | 1 / 1 | 1 / 1 | 9 / 7 | 11 / 16 | 1/4 / 3/4 | dims +0.6 % / dims +0.6 % | 24 / 22 | 1 / 1 | 98 / 159 |
| sheltech-siddiques-typea | 14 | 7 / 7 | 10 / 10 | 0 / 0 | 1 / 1 | 0 / 0 | 6 / 6 | 2 / 2 | 0/3 / 2/3 | thickness +5.0 % / thickness +5.0 % | 8 / 9 | 1 / 1 | 35 / 53 |
| assure-gladiolus-2nd6th | 15 | 3 / 0 | 9 / 7 | 0 / 0 | 0 / 0 | 0 / 0 | 12 / 15 | 4 / 0 | 0/3 / 3/3 | dims -42.9 % / thickness -75.2 % | 36 / 43 | 1 / 1 | 44 / 56 |
| assure-phera-1st | 16 | 0 / 0 | 11 / 9 | 0 / 0 | 0 / 0 | 0 / 0 | 16 / 16 | 0 / 4 | 0/3 / 0/3 | dims -33.5 % / dims -77.9 % | 56 / 68 | 1 / 1 | 37 / 139 |
| assure-hermitage-typical | 20 | 0 / 2 | 0 / 8 | 0 / 0 | 0 / 0 | 0 / 0 | 20 / 18 | 0 / 1 | 0/5 / 1/5 | thickness -46.7 % / dims -75.6 % | 113 / 160 | 1 / 1 | 4 / 47 |
| cpdl-skymark-unitd | 15 | 15 / 15 | 15 / 15 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0/0 / 0/0 | dims +0.3 % / dims +0.3 % | 21 / 20 | 1 / 1 | 25 / 39 |
| cpdl-joljhiri-unita | 14 | - / 1 | - / 10 | - / 0 | - / 0 | - / 0 | - / 13 | - / 25 | - / 0/0 | - / dims -92.8 % | - / 425 | - / 422 | - / 129 |
| **ours total (19 sheets both finished)** | 345 | 160 (46.4 %) | 201 (58.3 %) | 0 | 2 | 2 | 181 | 53 | 9/59 | mean |err| 30.2 %, within 3 %: 8 of 19 | 1060 | 21 | 649 |
| **fork total (19 sheets both finished)** | 345 | 162 (47.0 %) | 205 (59.4 %) | 0 | 2 | 3 | 178 | 79 | 16/59 | mean |err| 36.5 %, within 3 %: 8 of 19 | 1292 | 21 | 1187 |

**The scale.** Both guess it within 3 % on the same 8 sheets; on 11 both are far off (the drawn-size reading picks the
wrong rooms or falls back to wall thickness). Where they differ, **his scale is worse on all 4**: Kanakchapa −38 → −51 %,
Gladiolus −43 % (sizes) → −75 % (wall thickness), Phera −34 → −78 %, Hermitage −47 % (thickness) → −76 % (sizes); mean
error 30.2 % ours, 36.5 % his. His per-room vote (R20) refuses agreements ours accepted and then falls to a worse source.
CPDL Joljhiri (his only; ours not reached): −92.8 %, 14 minutes. **The founder's S step stays essential**; an upload path
that skips it (his W4) would hand him a wrong scale on more than half of these sheets. Rooms right with a wrong scale
mean little; on the 8 sheets with a good scale both are equal except BTI Amabilia (his +2 rooms, −1 core) and Water Lily (his +2 rooms, +2 core).

## 2. Pale scans (R1)

- **Census** (`census.mjs`): every picture in `Demo drawings/` (1 098) decoded in Firefox as the Studio does and put
  through his own rule (median grey ≥ 215, darkest 0.5 % lighter than 160, ≥ 45 levels of range, enough thin strokes):
  **2 trigger, both brochure text pages with no plan** (Rangs Ixora brochure p17 "Fitness Center", Rangs White Lake
  brochure p6 "The best view of Dhaka skyline"). 442 pictures are darker overall, 615 have ink darker than 160 already,
  24 are nearly blank, 3 have too few strokes, 12 are over 16 megapixels (his Auto-trace refuses those — W3).
- So **no floor plan we hold is pale enough for his recovery to act**; it is insurance for a scanner the founder's
  developers may use, not a gain on today's sheets. The faded-copy test (8 clean sheets faded the way his own test fades
  one, `fade.mjs`, `E:/dev/tmp/s31/p2rest/faded/`) is ready but was not run.

## 3. The text rules, input by input (node, pure functions — no image, no OCR)

`purecheck.mjs` loads `text.ts` from both trees and feeds both the same strings:

| printed size | ours reads | fork reads |
|---|---|---|
| `440 x 320 cm` | not read | 4.40 × 3.20 m |
| `440 X 320CM` | not read | 4.40 × 3.20 m |
| `4.4 x 3.2m` | 4.40 × 3.20 m | 4.40 × 3.20 m |
| `4.4m x 3.2` | 4.40 × 0.98 m | 4.40 × 3.20 m |
| `4400 x 3200 mm` | not read | 4.40 × 3.20 m |
| `440cm x 320` | not read | 4.40 × 3.20 m |
| `12'-0" x 14'-6"` | 3.66 × 4.42 m | 3.66 × 4.42 m |
| `12'0" X 14'6"` | 3.66 × 4.42 m | 3.66 × 4.42 m |
| `3.66 x 4.42 M` | 3.66 × 4.42 m | 3.66 × 4.42 m |

| OCR read | ours: name | fork: name | ours: snapped (over a size) | fork: snapped |
|---|---|---|---|---|
| `UVING` | UVING | LIVING | UVING | UVING |
| `UFT LOBBY` | UFT LOBBY | LIFT LOBBY | UFT LOBBY | UFT LOBBY |
| `Hoistway` | HOISTWAY | HOISTWAY | HOISTWAY | HOISTWAY |
| `BED-02` | BED 02 | BED 02 | BED-02 | BED-02 |
| `TOILET-03` | TOILET 03 | TOILET 03 | TOILET-03 | TOILET-03 |
| `KlTCHEN-02` | KITCHEN 02 | KITCHEN 02 | KITCHEN | KITCHEN-02 |
| `BEDR00M 2` | BEDROOM 2 | BEDROOM 2 | BEDR00M 2 | BEDR00M 2 |
| `DINNING` | DINING | DINING | DINNING | DINNING |
| `VERANDAH-1` | VERANDAH 1 | VERANDAH 1 | VERANDAH-1 | VERANDAH-1 |
| `M.BED-01` | M.BED 01 | M.BED 01 | BED | M.BED-01 |
| `T0ILET 2` | TOILET 2 | TOILET 2 | T0ILET 2 | TOILET 2 |

| sparse label (1.3 % ink at grey 120, paper grain 226-239) | ink after the stretch | paper pixels turned dark (< 128) |
|---|---|---|
| ours | 0 | 27.9 % |
| fork | 0 | 0.0 % |

His `parseDims` reads every metric form (ours misses cm / mm and reads "4.4m x 3.2" as 4.40 × **0.98** m — the 3.2 as
feet: a bug of ours); his snapping keeps a room's number ("KlTCHEN-02", "M.BED-01" — ours drops them to "KITCHEN",
"BED"); his name cleaner undoes the LI-read-as-U ("UVING", "UFT"); his contrast stretch keeps a sparse label's paper white
(ours turns 28 % of the paper grain black). None of the 33 sheets prints a metric size, so this did not move the
scoreboard above; it matters on the next developer who prints "440 x 320 cm".

## 4. What this does not show

- No faded-sheet run and no hover shot on the tilted La Montana Tower 2 sheet (the turned-sheet fixes R3 / R21 act on
  no sheet of the 33: `sheetTurn` is 0 on all of them).
- Memory: his bounded OCR (T6 / T7) cannot be read from headless Firefox here; desktop Firefox reports no device memory,
  so his worker count is ours on this machine.
- The DXF half of his work: the p2dxf lane.
- A difference of 1 room on one sheet can be OCR noise between runs (the s26 note: "the scorer is slightly
  non-repeatable"); the core-room and open-plan gains repeat across sheets, the single-room ones may not.
