# Auto-trace scoreboard — Level 0 (2026-10-09)

**What this is.** For every flat on every flat sheet in `Demo drawings/`: how many of the rooms printed on the sheet
come out of Auto-trace as a closed room with a name. This is the acceptance for every later level of
`Docs/AUTOTRACE_STRATEGY.md` §6: each level re-runs it and says what changed.

**How it was made — the founder's path, nothing else.** Firefox (Playwright's build on E:, headless), the real Studio
at `/studio` on commit `0d9cc90` (no code changed for this), a fresh Studio for each sheet. For each sheet: drop the
sheet picture on the Studio; press **S**, click the two walls of one room whose size is printed, type that size; then
for each flat: **Auto-trace**, wait for "Point at a flat", point inside the flat (the preview is saved as
`…-hover.png`), click, wait for the result. The "Check these" text is saved as it came out (`<sheet>-<flat>.txt`).
Then, only to read the room names hidden under the numbered marks, every row got **Looks right** and the flat was
screenshotted again (`…-names.png`, and 2× quarters `…-qnw/qne/qsw/qse.png`). Every count below was read off those
screenshots and that text by eye. No drawing files, no JSON, no node script was used for the counts.
Shots and page texts: `E:/dev/plotline-shots/s24/l0/`. Harness: `E:/dev/tmp/s24/l0/l0.mjs` + `sheets.mjs`.

**How a room is counted.**
- *Printed rooms* = every space of the flat whose name or size is printed on the sheet (an AOD box or an ODU ledge
  with "AOD" / "ODU" printed counts, as in the hand-traced flats; a dining printed with its size only counts). Left
  out: the lift lobby, stairs, lifts and shafts of the shared core, and planters / voids shared by two flats.
- *Closed + named* = a closed room carrying a real name, even a wrong one (wrong names are given in brackets).
- *Space N* = closed but not named: "Space 4", or no name at all (the Issues list then says "Unnamed space").
- *Open / missing* = no closed room there (the area has no name and no "Space N").
- *Merged / split* = the printed room is only part of a bigger closed room, or is cut into pieces none of which
  carries its name.

**Sheets in scope and the scale set with S** (the page's own "1 px = … m" read-out after typing):

| Sheet | What it shows | Length clicked with S | Page says |
|---|---|---|---|
| Sheltech Level 2 | Type A + Type B | Bed 3 (west) width, wall to wall, typed 11'-6" | 1 px = 0.0370 m (27.0 px/m) |
| Sheltech Level 3, 4, 5, 6 | Type A + Type B | the same Bed 3 width, 11'-6" | 0.0370 / 0.0373 / 0.0373 / 0.0373 m |
| BTI `img_3` (2nd floor) | the 2703 sft flat + two small flats at the top | Bed-2 width, wall to window, 15'-0" | 0.0137 m (73 px/m) |
| BTI `img_2` (3rd / 5th / 7th floor) | north flat + south flat | Bed-1 (south flat) length, 16'-0" | 0.0176 m (56.8 px/m) |
| Banani Level 2-6 | Unit A + Unit B | Bed-03 depth, wall to wall, 12'-0" | 0.0350 m (28.6 px/m) |
| Banani Level 7 / 8 / 9-13 | one flat each | Bed-03 depth, 12'-0" | 0.0320 / 0.0324 / 0.0302 m |
| DMD Level 3-14 | Type A, B, C | stair width, 10'-2" | 0.0616 m (16.2 px/m) |

Not flat sheets (skipped): BTI `img_1` (rooftop), `img_4` (basement), `img_5` (ground); Sheltech Level 1 (community
lounge + gym); DMD Level 2 (community space + gym); all basements, ground floors and roofs. The right-hand drawing on
BTI `img_2` ("4th, 6th & 8th floor plan") shows only the strip that changes, not a whole flat: not traced.
Sheltech Level 5 and Level 6 are the same picture (identical file); both were run and gave the same rooms.
DMD sheets are grey 3 px walls, known out of scope (`AUTOTRACE_STRATEGY.md` §5) — run anyway; its text is so small
that the room assignment there is my best reading of a blurry sheet.

## The scoreboard

| Sheet | Flat | Printed | Closed + named | Space N | Open / missing | Merged / split | Shot |
|---|---|---|---|---|---|---|---|
| Sheltech L2 | Type A | 18 | 8 (Toilet as "Toilet 1", PDR as "Toilet 2") | 3: Living, Foyer, Toilet 1 | 7: Veranda 7'-1"×4'-6" (kitchen), Toilet 3, Veranda 6'-9"×6'-3", Bed 4, Toilet 2, Bed 2, Planter (south) | Foyer cut in two ("Space 3" + a strip called "AOD") | sheltech-L2-TypeA.png |
| Sheltech L2 | Type B | 17 | 10 (Toilet 3 as "Toilet") | 0 | 7: Toilet 4'-10"×4'-0", PDR, Veranda 7'-9"×5'-2", Bed 4, Veranda 7'-10"×6'-4", Toilet 2, Planter (south) | Foyer and the (unprinted) dining are one room "Foyer" | sheltech-L2-TypeB.png |
| Sheltech L3 | Type A | 18 | 6 (PDR as "Toilet 3") | 2: Toilet 5'-8"×4'-1", Toilet 1 | 10: Veranda (kitchen), Living, Foyer, Dining, Veranda 6'-9"×6'-3", Bed 4, Veranda 7'-5"×6'-8", Bed 2, Planter (east), Planter (south) | — | sheltech-L3-TypeA.png |
| Sheltech L3 | Type B | 18 | 13 (Toilet 3 as "Toilet 1", Toilet 4'-10"×4'-0" as "AOD", PDR as "Toilet 3", Dining as "Living 1") | 1: Toilet 1 | 3: Veranda 6'-0"×5'-3", Veranda 7'-9"×5'-2", Planter (south) | Foyer inside the dining | sheltech-L3-TypeB.png |
| Sheltech L4 | Type A | 18 | 6 | 3: Toilet 5'-8"×4'-1", PDR, Bed 3 (no name at all) | 9: Veranda (kitchen), Kitchen, Toilet 3, Living, Foyer, Dining, Family Living, Veranda 7'-5"×6'-8", Planter (south) | — | sheltech-L4-TypeA.png |
| Sheltech L4 | Type B | 18 | 10 (Toilet 3 as "Toilet 2") | 3: Living, Veranda 7'-9"×5'-2", Veranda 7'-10"×6'-4" | 5: Veranda 6'-0"×5'-3", Toilet 4'-10"×4'-0", PDR, Toilet 2, Planter (south) | Bed 4 cut in two (its east strip is a room called "Planter") | sheltech-L4-TypeB.png |
| Sheltech L5 | Type A | 18 | 6 | 3: Kitchen, PDR, Toilet 1 | 8: Veranda (kitchen), Toilet 5'-8"×4'-1", Toilet 3, Living, Foyer, Bed 1, Veranda 6'-9"×5'-3", Planter (south) | Bed 4 in three pieces ("Space 6" + two "AOD") | sheltech-L5-TypeA.png |
| Sheltech L5 | Type B | 18 | 7 | 2: Toilet 3, Living | 9: Veranda 6'-0"×5'-3", Toilet 4'-10"×4'-0", PDR, Toilet 1, Veranda 7'-9"×5'-2", Veranda 7'-10"×6'-4", Bed 2, Toilet 2, Planter (south) | — | sheltech-L5-TypeB.png |
| Sheltech L6 | Type A | 18 | 6 | 3 | 8 (as L5 Type A) | Bed 4 in three pieces | sheltech-L6-TypeA.png |
| Sheltech L6 | Type B | 18 | 7 | 2 | 9 (as L5 Type B) | — | sheltech-L6-TypeB.png |
| BTI 2nd floor (`img_3`) | Type A (2703 sft) | 22 | 18 | 0 | 4: Bath-3, AOD (west), Veranda 3'-0"×5'-5", Living Room | — | bti-img3-TypeA.png |
| BTI 2nd floor (`img_3`) | small flat, west | 6 | 4 | 0 | 2: Bed 11'-0"×11'-5", AOD (top) | — | bti-img3-SmallWest.png |
| BTI 2nd floor (`img_3`) | small flat, east | 6 | 4 | 0 | 2: Veranda 5'-0"×6'-0", Dining cum Living | — | bti-img3-SmallEast.png |
| BTI 3rd floor (`img_2`) | north flat | 18 | 15 (K.Veranda as "AOD", Help Room as "Help Ro Rs") | 3: H.Toilet, Bath-1, Bath-2 7'-10"×5'-6" | 0 | — | bti-img2-North.png |
| BTI 3rd floor (`img_2`) | south flat | 21 | 9 | 2: H.Toilet, Walk-in closet | 10: Bath-3, AOD (west), Veranda 3'-0"×5'-5", Help Bed, Kitchen, AOD (bath-2), Bath-2, Bed-2, Veranda 5'-0"×7'-0", Veranda 5'-5"×9'-11" | — | bti-img2-South.png |
| Banani L2-6 | Unit A | 19 | 1 (Toilet 4'-2"×6'-10") | 0 | 18: everything else — Veranda 8'-0"×4'-6", Bed-02, Toilet 8'-0"×4'-6", Toilet 6'-9"×8'-10", ODU (top), M Bed, Veranda 6'-11"×10'-8", Bed-04, ODU (west), Dinning, Formal Living, Toilet 8'-6"×6'-10", Bed-03, Dry Kitchen, S.Toilet, S.Bed, Kitchen, Veranda 11'-6"×5'-1" | — | banani-L2-6-UnitA.png |
| Banani L2-6 | Unit B | 6 | 0 | 0 | 6: Open Kitchen, Living, Bed Room, Toilet 9'-6"×6'-0", Veranda 8'-0"×5'-10", ODU | — | banani-L2-6-UnitB.png |
| Banani L7 | Unit A & B (one flat) | 24 | 3 (Bed-04; two ODUs as "AOD") | 2: Toilet 8'-6"×6'-10", Toilet 9'-6"×6'-0" | 19: Veranda 8'-0"×4'-6", Bed-02, Toilet 8'-0"×4'-6", Toilet 6'-9"×8'-10", ODU (top), M Bed, Veranda 6'-11"×10'-8", Dinning, Formal Living, Toilet 4'-2"×6'-10", Bed-03, Dry Kitchen, S.Toilet, S.Bed, Kitchen, Veranda 11'-6"×5'-1", Family Living, Bed 05, Veranda 8'-0"×5'-10" | — | banani-L7-UnitAB.png |
| Banani L8 | Unit A | 19 | 2 (ODU (top) as "AOD", Veranda 11'-6"×5'-1") | 3: Bed-03, S.Toilet, S.Bed | 14: Veranda 8'-0"×4'-6", Bed-02, Toilet 8'-0"×4'-6", Toilet 6'-9"×8'-10", M Bed, Veranda 6'-11"×10'-8", Bed-04, ODU (west), Dinning, Formal Living, Toilet 8'-6"×6'-10", Toilet 4'-2"×6'-10", Dry Kitchen, Kitchen | — | banani-L8-UnitA.png |
| Banani L9-13 | Unit A | 19 | 1 (ODU (top) as "AOD") | 1: Bed-03 | 17: Veranda 8'-0"×4'-6", Bed-02, Toilet 5'-7"×8'-6", Toilet 6'-9"×8'-10", M Bed, Veranda 6'-11"×10'-8", Bed-04, ODU (west), Dinning, Formal Living, Toilet 8'-6"×6'-10", Toilet 4'-2"×6'-10", Dry Kitchen, S.Toilet, S.Bed, Kitchen, Veranda 11'-6"×5'-1" | — | banani-L9-13-UnitA.png |
| DMD L3-14 *(out of scope)* | Type C | 15 | 1 (K.Ver as "AOD") | 5: M.Bed (no name), M.Toilet, Bed-2, Kitchen, K.Toilet | 9: Store, Living, Foyer, Living cum Dining, C.Toilet, Toilet-2, Bed-3, two Balconies | — | dmd-L3-14-TypeC.png |
| DMD L3-14 *(out of scope)* | Type B | 15 | 0 | 5: Kitchen, K.Toilet (no name), Bed-2, M.Toilet, C.Toilet (no name) | 10: K.Ver, Store, Living, Foyer, Living cum Dining, Toilet-2, M.Bed, Bed-3, two Balconies | — | dmd-L3-14-TypeB.png |
| DMD L3-14 *(out of scope)* | Type A | 17 | 0 | 9: Toilet-3, Bed-4 (no name), C.Toilet, K.Toilet, Store, K.Ver, Toilet-2, M.Toilet, M.Bed | 8: Bed (north-west), Kitchen, Living, Foyer, Dining, Bed-3, two Balconies | — | dmd-L3-14-TypeA.png |

**Totals: 137 of 386 printed rooms closed and named across 23 flats (35 %)** — 52 more closed but unnamed, 194 open
or missing, 3 merged or cut. About 10 of the 137 carry a wrong or garbled name (a PDR called "Toilet 2", a toilet
called "AOD", a dining called "Living 1", "Help Ro Rs").
- Sheltech (10 flats): 79 of 179 (44 %). BTI (5 flats): 50 of 73 (68 %). Banani (5 flats): 7 of 87 (8 %).
  DMD (3 flats, out of scope): 1 of 47.
- Without DMD: 136 of 339 (40 %). Sheltech + BTI only: 129 of 252 (51 %).
- Not one flat came out complete. The best is BTI 3rd-floor north: nothing missing, 3 rooms closed but unnamed.

**What the Studio said after each trace** (page text, "Check these"):

| Sheet · flat | Traced | "closed rooms add up to" line | Check-these rows | Issues |
|---|---|---|---|---|
| Sheltech L2 · A | 96 walls, 13 rooms, 9 labelled | 13 closed rooms add up to 1386 sft; printed 2736 should give about 2408 — 3 named rooms still open | 42 | 9 |
| Sheltech L2 · B | 80 walls, 11 rooms, 10 labelled | 11 → 1489 sft of about 2408 — 3 still open | 24 | 2 |
| Sheltech L3 · A | 117 walls, 16 rooms, 14 labelled | 16 → 1007 sft of about 2408 — 7 still open | 61 | 7 |
| Sheltech L3 · B | 112 walls, 16 rooms, 15 labelled | 16 → 1799 sft of about 2408 — 1 still open | 52 | 7 |
| Sheltech L4 · A | 92 walls, 10 rooms, 8 labelled | 10 → 740 sft of about 2408 — 5 still open | 46 | 9 |
| Sheltech L4 · B | 105 walls, 16 rooms, 13 labelled | 16 → 1971 sft of about 2408 — 1 still open | 49 | 9 |
| Sheltech L5 · A (= L6 · A) | 115 walls, 14 rooms, 9 labelled | 14 → 1275 sft of about 2408 — 7 still open | 69 | 13 |
| Sheltech L5 · B (= L6 · B) | 99 walls, 12 rooms, 9 labelled | 12 → 1351 sft of about 2408 — 2 still open | 51 | 11 |
| BTI 2nd · Type A | 123 walls, 25 rooms, 19 labelled | 25 → 1909 sft; printed 2703 should give about 2379 — 3 still open | 44 | 4 |
| BTI 2nd · small west | 106 walls, 11 rooms, 10 labelled | 11 → 756 sft; "printed 2703 sft flat should give about 2379" (the big flat's area) | 48 | 20 |
| BTI 2nd · small east | 78 walls, 7 rooms, 5 labelled | 7 → 352 sft; again measured against 2703 sft | 37 | 15 |
| BTI 3rd · north | 111 walls, 23 rooms, 18 labelled | 23 → 1734 sft; printed 2662 should give about 2343 — 1 still open | 50 | 2 |
| BTI 3rd · south | 118 walls, 20 rooms, 12 labelled | 20 → 1741 sft of about 2343 — 11 still open | 52 | 11 |
| Banani L2-6 · A | 42 walls, 1 room, 1 labelled | 1 → 35 sft; "printed 970 sft flat" (that is Unit B's area) | 33 | 30 |
| Banani L2-6 · B | 31 walls, 0 rooms | (none) | 27 | 23 |
| Banani L7 | 87 walls, 5 rooms, 3 labelled | (none) | 52 | 29 |
| Banani L8 | 116 walls, 7 rooms, 2 labelled | (none) | 51 | 30 |
| Banani L9-13 | 86 walls, 3 rooms, 1 labelled | (none) | 45 | 30 |
| DMD · C / B / A | 238 / 227 / 239 walls, 12 / 13 / 16 rooms, 4 / 5 / 5 labelled | (none) | 136 / 141 / 152 | 94 / 94 / 88 |

The rows are mostly the same kinds on every sheet: "A wall ends here without meeting another" (5–25 per flat),
"Thin-line boundary traced as a 1.1 m low wall … railing / parapet / shaft wall, or a full-height partition?",
"Window …? (faint evidence)", "Passage …? (nothing drawn across it …)", "A …gap in the wall with no door swing or
window drawn in it", "Unnamed space (… m²) — name it or delete a wall", "Room type guessed from wc / the green
(planter) fill / its size and thin-line sides (an AOD / shaft, no door?)", size rows such as "Bed 1: drawn 13'-0" ×
15'-2", printed 13'-0" × 15'-6"", and "Kitchen: its printed size could not be read — type it". The full text per flat
is in `E:/dev/plotline-shots/s24/l0/<sheet>-<flat>.txt`.

## The node table (five hand-traced flats) — for comparison

`npx vitest run src/trace/solve.test.ts --silent=false --disableConsoleIntercept`, same commit, run today. It still
says **71 of 116**:

```
== NEW READER (wave 19: the product now): 71 of 116 rooms matched
unit                  rooms matched   area%  scale%  from       kindOk  cover  spill  opens okKind extra review    ms  wallRec wallPrec
unit_sheltech_a_2736  15/21      11    9%   +0.8%  dims         7/11   57%    2%  18/28     16    10     49  2920      62%      77%
unit_sheltech_b_2736  14/20      12    6%   +0.8%  dims        11/12   67%    2%  14/30     13    15     36  2715      68%      85%
unit_type_a_2703      18/27      14    8%   -1.7%  dims        14/14   66%    1%  20/32     17    13     45  8933      56%      75%
unit_type_b_1747      19/22      16    7%   -0.2%  dims        12/16   76%    0%  24/30     22     6     44  8454      79%      89%
unit_type_c_2254      23/26      18    3%   -0.2%  dims        15/18   67%    1%  23/30     20     9     49  8565      76%      89%
```

Missed, in the eval's words: Sheltech A — Toilet split, Veranda 1 merged, Planter (east) no face, Passage merged,
Veranda 4 merged, Bed 4 merged, Lobby split, Stair split, Planter (south) shifted, Living split. Sheltech B — Toilet
merged, PDR merged, Planter (west) no face, Veranda 1 merged, Lobby merged, Planter (south) split, Lifts split,
Dining split. Type A — AOD (service) merged, Service veranda merged, H. toilet shifted, AOD (west) no face, AOD
(south) no face, Veranda (study) merged, Bath-3 no face, Planter shifted, AOD (east) merged, AOD (north) no face,
Bed-3 split, Lift core merged, Lift lobby split. Type B — AOD (bath-2) no face, Planter (bed-1) merged, Planter
(living) no face, Veranda (living) no face, Lift lobby merged, Stair no face. Type C — AOD (service) merged, Bath-3
no face, Planter (living) shifted, Planter (bed-1) shifted, Lift core split, Lift lobby merged, Bed-2 split, Bed-1
split.

**The node table is kinder than the Studio.** Its "matched" counts a room when a closed area covers it (overlap
≥ 60 %), named or not; it uses the hand-traced flat's own scale, clicks at the biggest room's name, reads the text
from a saved file and leaves out the colour picture (`solveEval.ts scoreSolve / truthPick`). In the Studio, the same BTI 3rd-floor south flat (the node's Type C,
23 of 26) gave 9 named of 21 printed — and the result changes with the click spot: clicked in the dining "Traced
118 walls, 20 rooms, 12 labelled", in the living room "100 walls, 17 rooms, 9 labelled", in Bed-1 "99 walls,
14 rooms, 10 labelled" (`bti-img2-alt-*`).

## Worst flats

1. **Banani L7 (Unit A & B)** — 3 of 24 named; 19 missing (every bedroom but Bed-04, all verandas, dining, formal
   and family living, kitchen, dry kitchen, five toilets).
2. **Banani L2-6 Unit A** — 1 of 19 named (one toilet); the other 18 missing.
3. **Banani L9-13 Unit A** — 1 of 19 (an ODU box); Bed-03 closed unnamed; 17 missing.
4. **Banani L8 Unit A** — 2 of 19; 14 missing.
5. **Banani L2-6 Unit B** — 0 of 6: nothing at all.

Outside Banani (and DMD): **Sheltech L3 Type A** (10 missing: kitchen veranda, Living, Foyer, Dining, two verandas,
Bed 4, Bed 2, both planters), **BTI 3rd floor south** (10 missing: Bath-3, Bath-2, Bed-2, Help Bed, Kitchen, three
verandas, two AODs), **Sheltech L4 Type A** (9 missing: Kitchen, Toilet 3, Living, Foyer, Dining, Family Living, two
verandas, south planter). Rooms that go missing on almost every Sheltech flat: the verandas, the south planter (10 of
10), Type B's small toilet beside the kitchen and its PDR; the Living (glass front) is missing or "Space N" on 8 of 10.

## What the Studio did that a founder would call a bug

1. **On Banani flat sheets it says the sheet is not a flat**: "Auto-trace is made for flats. On a ground floor,
   basement or rooftop it finds little: draw it with W and name the areas with R." (L2-6 Units A and B, L9-13).
2. **The flat's area comes from the wrong place.** The Area box and the area check took Unit B's "970 SFT" for Unit A
   on Banani L2-6 ("the printed 970 sft flat"); on Banani L7 / L8 / L9-13 the Area box read 282 / 366 / 199 (printed
   3925 / 2956 / 2956); on DMD 574 / 587 / 679 (printed 2383 / 2383 / 2751). On BTI 2nd floor both small flats were
   checked against the big flat's 2703 sft.
3. **The trace runs into the next flat and the core.** Sheltech L3 Type A took Type B's Toilet 2 (named "Toilet 1")
   and pieces of the stair; BTI's small west flat took five rooms of the big flat below; BTI north took the south
   flat's PDR and south took the north's Bath-2; each DMD click took pieces of all three flats.
4. **Where you click changes the flat you get** (BTI south: 20 / 17 / 14 rooms from three spots inside the same flat).
5. **One traced flat is tinted as two flats** ("Flat 1" and "Flat 2"): Sheltech L2 Type A (Bed 3 alone is "Flat 2"),
   L3 Type A and L4 Type A — the rooms between them never closed, so their doors join nothing.
6. **Closed rooms with no name at all** right after the trace ("Unnamed space · 18.5 m²" in Issues — Bed 3 on Sheltech
   L4 Type A; also on BTI 2nd-floor Type A and DMD).
7. **Wrong names**: a PDR named "Toilet 2" / "Toilet 3", a toilet named "AOD", the dining named "Living 1", the K.Veranda
   named "AOD", "Help Ro Rs" for HELP ROOM; the "Space N" numbers differ between two runs of
   the same picture (Sheltech L5 vs L6).
8. Trap seen once while setting up: opening `/studio` with an old draft and dropping a new sheet keeps the old scale;
   pressing S then asks "Changing scale after tracing moves the image under your walls. Continue?". ("Start over" in
   the "Draft restored" toast avoids it.)

## Three flats to hand-trace next as ground truth

1. **Banani Level 2-6, Unit A** (2956 sft, 19 printed rooms) — the worst sheet family (1 of 19 here, 7 of 87 across
   Banani), and the plan repeats on five floors; Levels 8 and 9-13 are nearly the same Unit A drawn at another size,
   so one ground truth covers most of Banani. (Unit B, 6 rooms, can be added in the same sitting.)
2. **DMD Level 3-14, Type B** (2383 sft, 15 printed rooms) — the names are readable with a 4× zoom, the printed sizes
   mostly are not, so this ground truth would be walls + names only. Type C is its mirror image, so one tracing covers
   two of the three flats. Worth doing only if DMD is to come into scope (§5); otherwise skip it.
3. **Sheltech Level 4, Type A** — compared with Level 2 in the pictures: Level 4's Type A has a FAMILY LIVING
   10'-2"×13'-9" where Level 2 has Bed 4 and its passage, and an open void where Level 2 has the planter between the
   two livings, so it is a different plan, not a copy. It is also the worst Sheltech flat that differs from L2 (6 of
   18 named, 740 of about 2408 sft closed). (Level 3's Type A keeps L2's rooms; Level 5 / 6 Type A is L2's layout
   with the void.)

## After Level 3 (2026-10-09, every printed name and size lands in its room)

**How it was made:** the Level 0 method again — Firefox (Playwright's build on E:, headless), the real Studio, a fresh
Studio per flat, the sheet picture dropped, **S** on the same printed length, **Auto-trace**, one click inside the flat
at the Level 0 spot. "Before" = main at `317b08e` (Level 5 merged), "after" = the Level 3 branch; same harness, same
clicks (`E:/dev/tmp/s24/l3/l3.mjs`, shots + page texts `E:/dev/plotline-shots/s24/l3/before-…` / `final-…`). Counts read
off the panel text (the count line, the "Check these (N)" and "Issues (N)" headers) and the plan screenshots; columns as
above. "Names read" = the N of the count line "… of the N room names read on the sheet …".

| Sheet | Flat | Printed | Names read | Closed + named | Space N (printed name) | Open / missing | Check these | Issues | Shot |
|---|---|---|---|---|---|---|---|---|---|
| Sheltech L2 | Type A | 18 | 8 → **14** | 8 (Toilet as "Toilet 2", PDR as "Toilet 1") → **12** (Toilet 5'-8"×4'-1" as "Toilet 3") | 3: Living, Foyer, Toilet 1 → **0** | 7 → 6: Veranda (kitchen), Toilet 3, Bed 4, Veranda 7'-5"×6'-8", Veranda 6'-9"×6'-3", Planter (south) | 44 → **34** | 9 → **3** | final-sheltech-L2-TypeA.png, finalnames-…-qne/qse.png |
| Sheltech L2 | Type B | 17 | 11 → 12 | 10 (Toilet 3 as "Toilet") → 10 (Toilet 3 and Toilet 1 as "Toilet") | 0 → 0 | 7 → 7: Toilet 4'-10"×4'-0", PDR, Veranda 7'-9"×5'-2", Bed 4, Veranda 7'-10"×6'-4", Toilet 2, Planter (south) | 26 → 25 | 2 → 2 | final-sheltech-L2-TypeB-qnw/qsw.png |
| Sheltech L4 | Type A | 18 | 8 → **13** | 6 (Toilet 1 as "Toilet 2", Toilet 2 as "Toilet 1") → **9** | 3: Toilet 5'-8"×4'-1", PDR, Bed 3 → **1**: Toilet 5'-8"×4'-1" | 9 → 8: Veranda (kitchen), Kitchen, Toilet 3, Foyer, Dining, Family Living, Veranda 7'-5"×6'-8", Planter (south) | 50 → 51 | 9 → 9 | final-sheltech-L4-TypeA-qne.png |
| BTI 2nd (`img_3`) | Type A | 22 | 21 → 21 | 19 → 19 | 0 → 0 | 3 → 3: Living Room, Veranda 3'-0"×5'-5", Bath-3 | 46 → 45 | 4 → 4 | final-bti-img3-TypeA-names.png |
| Banani L2-6 | Unit A | 19 | 6 → **9** | 1 → 1 | 0 → 0 | 18 → 18 | 37 → 40 | 30 → 30 | final-banani-L2-6-UnitA.png |

**Totals on these five flats:** names read 54 → 69 of 94 printed; closed + named 44 → 51; "Space N" on a printed name
6 → 1; wrong names 5 → 3 (two numbers lost on Type B's toilets, one guessed number on L2 A's small toilet). The
"Check these" rows went down where names landed (Sheltech L2 A −10: three of its four "Unnamed space" rows and the
guessed-room rows of rooms now named by their print; its Issues 9 → 3 with 96 → 89 walls traced), and up where more
names were read whose rooms are still open (Banani +3 "… is open" rows; L4 +1: new "Ver is open", "Living: printed
size not read for sure" and an "Unnamed space" for the void between the livings, gone the PDR's "Unnamed space" and
Bed 3's "Space 2 — the printed name Bed 3 is in it"). No row or mark was hidden or capped.

**The printed sizes on Sheltech L2:** the Kitchen's size is still not read ("Kitchen: its printed size could not be
read — type it") and Toilet 1's neither: on the sheet the Kitchen's size line touches the counter line beside it and a
door arc runs through Toilet 1's, so their letters are glued to the drawing (a test that kept such cut-free runs
under a name brought the Kitchen's line back but read it wrong, 3'-5"×11'-1", and cost BTI an AOD: not kept). **Typed
by hand it now gets its row:** clicking that row opens the Kitchen's box, typing `8'-5" x 12'-2"` into Printed size
showed at once "Kitchen: drawn 6'-5" × 12'-2", printed 8'-5" × 12'-2"" (before: no row at all).

**The TYPE label:** Sheltech L2 Type A — "Type A ±2736 sft" is on the drawing (in the dining) and the flat's tint reads
"Type A". Level 4 Type A: its stamp stands in the open foyer — not placed (putting it into the nearest closed room was
tried: it made the PDR a one-room flat "Type A", undone). Type B: the red "TYPE-B (L/O)" is not read.

**Node evals (same commit):** reader on the five hand-traced flats 81 → 86 of 116 names found, sizes right 46 → 48 of 87,
misread 0 → 0 (`TRACE_OCR=1 npx vitest run src/trace/text.test.ts`); the solver table 71 → 72 of 116.
