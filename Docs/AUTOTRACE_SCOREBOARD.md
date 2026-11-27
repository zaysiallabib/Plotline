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

## After Levels 1–2 (2026-10-09, rooms close on their real boundaries; lines that are no wall split nothing)

**How it was made:** the Level 0 method again — Firefox (Playwright's build on E:, headless), the real Studio, a fresh
Studio per flat, the sheet picture dropped, **S** on the same printed length, **Auto-trace**, one click inside the flat at
the Level 0 spot. "Before" = main at `526e0e1` (Level 3 merged), "after" = the Levels 1–2 branch at `0b7fdc3`; same
harness, same clicks (`E:/dev/tmp/s24/l12/l12.mjs` + `batch.mjs`, shots + page texts
`E:/dev/plotline-shots/s24/l12/before-…` / `after1-…`, logs `E:/dev/tmp/s24/l12/before.log` / `after1.log`). Counts read
off the panel text (the "Traced …" line, the count line, the "Check these (N)" and "Issues (N)" headers) and the plan
screenshots with every row dismissed (`…-names.png`). "Closed + named" counts the flat's printed rooms (as above), "names
read" = the M of the count line.

| Sheet | Flat | Printed | Traced (walls / rooms / labelled) | Names read → closed + named in the count line | Closed + named (of printed) | Open / missing after | Check these | Issues | Shot |
|---|---|---|---|---|---|---|---|---|---|
| Sheltech L2 | Type A | 18 | 89 / 13 / 12 → 95 / 15 / 15 | 10 of 14 → **13 of 14** (missing: Ver) | 12 → **15** (+ Veranda 7'-1"×4'-6", Bed 4, Veranda 7'-5"×6'-8") | 6 → **3**: Toilet 3 (its name not read: no room of its own), Veranda 6'-9"×6'-3", Planter (south) | 34 → 33 | 3 → 2 | after1-sheltech-L2-TypeA-names.png |
| Sheltech L2 | Type B | 17 | 80 / 11 / 10 → 83 / 12 / 12 | 9 of 12 → **11 of 13** (missing: Toilet 2, Ver) | 10 → **12** (+ Bed 4, Veranda 7'-9"×5'-2") | 7 → **5**: Toilet 4'-10"×4'-0", PDR, Veranda 7'-10"×6'-4", Toilet 2, Planter (south) | 25 → 26 | 2 → 2 | after1-sheltech-L2-TypeB-names.png |
| Sheltech L4 | Type A | 18 | 100 / 12 / 10 → 102 / 14 / 12 | 8 of 13 → **9 of 13** (missing: Foyer, Dining, Family, Ver) | 9 → **10** (+ Kitchen) | 8 → **7**: Veranda (kitchen), Toilet 3, Foyer, Dining, Family Living, Veranda 7'-5"×6'-8", Planter (south) | 51 → **38** | 9 → **5** | after1-sheltech-L4-TypeA-names.png |
| BTI 2nd (`img_3`) | Type A | 22 | 123 / 25 / 19 → 119 / 24 / 20 | 19 of 21 → **20 of 21** (missing: Veranda) | 19 → **20** (+ Living Room) | 3 → **2**: Veranda 3'-0"×5'-5", Bath-3 | 45 → 42 | 4 → 3 | after1-bti-img3-TypeA-names.png |
| BTI 3rd (`img_2`) | north | 18 | 111 / 23 / 19 → 107 / 23 / 19 | 16 of 17 → 16 of 17 (missing: Bath 3 — the south flat's, see below) | unchanged | unchanged | 49 → 46 | 2 → **0** | after1-bti-img2-North-names.png |
| BTI 3rd (`img_2`) | south | 21 | 118 / 20 / 15 → 116 / 20 / 16 | 14 of 19 → **15 of 19** (missing: Veranda 5, Veranda, Ver, Aod) | + Help Bed | the kitchen, Bath-2, Bed-2, the two west AODs and Veranda 3'-0"×5'-5" are outside the traced flat (flat pick, Level 4); Veranda 5'-0"×7'-0", Veranda 5'-5"×9'-11" | 53 → **46** | 11 → **7** | after1-bti-img2-South-names.png |
| Banani L2-6 | Unit A | 19 | 42 / 1 / 1 → 41 / 1 / 1 | 1 of 9 → 1 of 9 | 1 → 1 | 18 → 18 | 40 → 37 | 30 → 29 | after1-banani-L2-6-UnitA-names.png |

**Totals on these seven flats:** Check these 297 → 268, Issues 61 → 48 — each row gone because what it warned about is
closed, joined or no longer in the flat (verandas closed on their railing, a window line carried to the wall ahead, the
lifts read as LIFT PIT / STRETCHER LIFT kept out, the core's hanging walls dropped, a wall end on a column no longer
listed), none hidden. New rows that came with the closures: a size row where a newly closed room is a few inches off
its print (Sheltech L2 A: "Ver: drawn 6'-1" × 4'-3", printed 7'-1" × 4'-6"", "Ver: drawn 6'-11" × 6'-8", printed
7'-5" × 6'-8""), "Bed 4: its printed size could not be read — type it", "Slider … wide? (drawn like a window, rooms
say slider)" on the glass between a bedroom and its now closed veranda, and the railing / glass rows where the room's size
was not read to check them (Sheltech L2 B: +1 row in all).

**One traced flat tinted as two:** Sheltech L2 Type A — Bed 3 was its own "Flat 1" before; after, one flat (the nook in
front of its door joins the dining). Sheltech L4 Type A is still tinted Flat 1 / Flat 2: its foyer, dining and family
living are one open area with no door between the two halves.

**Rooms no line closes yet, and why (for the next lane):** Sheltech L4's foyer / dining / family living (open plan: only
the foyer's size is printed and read; its open side runs between two wall ends 0.3 m apart, no straight line meets both),
the Sheltech south verandas whose size was not read and whose railing is a light double line at the threshold of the
thin-line cut (L2 A Veranda 6'-9"×6'-3", L2 B Veranda 7'-10"×6'-4"), Sheltech L2 B's Toilet 2 by the lift (its west wall
is not traced at all), L4's kitchen veranda (its label is read as part of a 743 px wide garbage line), the planters
south of every Sheltech flat, BTI 3rd floor south's west part (the flat pick does not reach it — most likely the rival
rule in `solve.ts pickByRooms`: the north flat's BED-2 print is 476 px from the click, the south flat's own 487 px, so the
south one is taken for the next flat's — Level 4),
Banani (walls drawn as thin lines).

**Node eval (`npx vitest run src/trace/solve.test.ts --silent=false`, NEW READER table):** 71 → **75 of 116** rooms
matched (Sheltech A 11 → 13, B 12 → 12, BTI Type A 14 → 15, Type B 16 → 16, Type C 18 → 19); "split" in the missed list
12 → 11 (gone: Type A Bed-3, Type C Bed-1; Sheltech A's south planter is now listed split instead of shifted). The
target of 95 is not reached: 10 of the 41 still missed are the core (lobby, stair, lifts, lift lobby — kept out of a flat
by the founder's rule, so the eval sees them split or merged), 16 are AODs and planters (closed by no line the trace
reads, or swallowed by the room beside them), 5 verandas, and 10 others (two toilets, two Bath-3s, a PDR, a passage,
Sheltech A's Living, H. toilet shifted, Sheltech B's Dining, Type C's Bed-2).

## After Level 4 (2026-10-09, the whole floor in one click; one flat = the same flat wherever it is clicked)

**How it was made:** the Level 0 method — Firefox (Playwright's build on E:, headless, one browser), the real Studio, a
fresh Studio per run, the sheet picture dropped, **S** on the same printed length as above, **Auto-trace**, then either a
click inside a flat or the new **Whole floor** button. "Before" = main at `b4c1884` (its `src` is the Levels 1–2 "after"),
"after" = the Level 4 branch merged with main (pillar lane included) at `5b3232e`; same harness, same clicks
(`E:/dev/tmp/s24/l4/l4.mjs`, logs `before.log` / `merged.log`, shots + page texts `E:/dev/plotline-shots/s24/l4/before-…` /
`merged-…`, `…-names.png` = every row dismissed, to read the tints and names). Every number below is from the panel text
("Traced …", the count line(s), the "Check these (N)" / "Issues (N)" headers — "Issues" with no number = 0) or read off
the `…-names.png` screenshots. Sheltech L2 is `Demo drawings/Sheltech/Level 2.jpg` = `public/assets/plan-sheltech-l2.jpg`
(the same file).

**Whole floor (one click; before: not possible — one flat per click):**

| Sheet | Flats found (tint names) | Core | Traced | Count lines (as the panel prints them) | Check these | Issues |
|---|---|---|---|---|---|---|
| Sheltech L2 | **Type A** (15 rooms) + **Type B** (12 rooms) | Lobby, Lift, Stair untinted | 198 walls, 30 rooms, 30 labelled | Type A: 13 of the 14 room names read on it closed and named — missing: Ver; 1795 sft, printed area gives about 2408 · Type B: 11 of 13 — missing: Toilet 2, Ver; 1662 sft, about 2408 | 68 | 6 |
| BTI 2nd (`img_3`) | **Flat 1** (west small flat), **Flat 2** (the 2703 sft flat), **Flat 3** (east small flat) | Lift, Stretcher Lift untinted (the stair and lift lobby are not closed faces) | 225 walls, 38 rooms, 34 labelled | Flat 2: 20 of 21 — missing: Veranda; 2029 sft · Flat 1: 5 of 6 — missing: Aod; 512 sft · Flat 3: all 6; 486 sft (no printed flat area on any: the figures are in the title) | 80 | 15 |
| BTI 3rd (`img_2`) | **Flat 1** (south), **Flat 2** (north) | Lift Lobby, Stair, Stretcher Lift untinted | 231 walls, 45 rooms, 38 labelled | Flat 2: all 15; 1693 sft · Flat 1: 16 of 21 — missing: Bath 3, Veranda 5, Veranda, Bed 2, Ver; 1818 sft | 99 | 10 |

The two whole-floor drafts the scope asked for (Sheltech L2, BTI `img_3`) come out as their flats + the core from one
click; Sheltech's two flats are named by their own printed types (the red "TYPE-B (L/O)" is now read from the block around
its "±2736 SFT"). The right-hand strip on BTI `img_2` ("4th, 6th & 8th floor") is not traced (it has no living / kitchen).

**One flat clicked — before → after (each click a fresh Studio):**

| Sheet · flat (printed rooms) | Click spots | Before: Traced · count line · Check these / Issues | After (all spots alike) |
|---|---|---|---|
| Sheltech L2 · Type A (18) | dining (690,380) · living (560,250) · Bed 1 (800,520) | 95/15/15 · 13 of 14 · 33/2 — 96/15/15 · 13 of 14 · 32/2 — 95/15/15 · 13 of 14 · 33/2 | 95 walls, 15 rooms, 15 labelled · "Type A: 13 of the 14 … missing: Ver" · 33 / 2; tint **Type A** |
| Sheltech L2 · Type B (17) | dining (345,440) · Bed 3 (200,250) · Bed 2 (420,520) | 83/12/12 · 11 of 13, Bed 2 closed but **untinted** (no flat) · 26/2 — 78/11/11 · 10 of 12, Bed 2 **missing** · 24/2 — **5 walls, 1 room** · "All 1 …" · 3/1 **+ "Auto-trace is made for flats. On a ground floor …"** | 84 walls, 12 rooms, 12 labelled · "Type B: 11 of the 13 … missing: Toilet 2, Ver" · 26 / 2; Bed 2 in the flat; tint **Type B** |
| BTI 2nd · the 2703 sft flat (22) | dining (606,1491) | 119/24/20 · 20 of 21 · 42/3 | 128/24/20 · "Flat 1: 20 of the 21 … missing: Veranda" · **47 / 9** (see below) |
| BTI 2nd · small flat, west (6) | (644,758) | 102/12/11 · **10 of 16** — missing: Aod, Aod, **Living Room, Dining & Family Living**, Toilet, Veranda (the big flat's) · 42/16 | 60/7/7 · "Flat 1: 6 of the 7 … missing: Aod" · **24 / 11** |
| BTI 2nd · small flat, east (6) | (1011,758) | 76/8/7 · **7 of 10** — missing: Aod, Aod, **Living Room** · 34/13 | 43/5/5 · "Flat 1: all 5 …" · **13 / 0** |
| BTI 3rd · north (18) | living (653,602) · Bed-1 (900,500) · living west end (450,700) | 107/23/19 · 16 of 17 — missing: Bath 3 (the south's) · 46/0, the same at all three | 105/22/18 · "Flat 1: all 15 …" · **44 / 0**; no longer takes the south flat's PDR |
| BTI 3rd · south (21) | dining (576,1280) · living room (736,1114) · Bed-1 (883,1408) | **116/20/16 · 15 of 19 · 46/7 — 98/17/13 · 12 of 16 · 40/5 — 96/15/12 · 11 of 17 · 44/7** (three different flats; the kitchen, Bath-2, study and Bed-2 outside the flat; the north's Bath-2 inside) | **121/20/17 at all three** · "Flat 1: 16 of the 21 … missing: Bath 3, Veranda 5, Veranda, Bed 2, Ver" · 52 / 10; kitchen, Bath-2, study room, help bed and its own PDR in; the north's Bath-2 out |
| Banani L2-6 · Unit A (19) | (340,400) | 41/1/1 · 1 of 9 · 37/29 **+ "Auto-trace is made for flats. On a ground floor, basement or rooftop it finds little"** | 52/3/2 · "Flat 1: 2 of the 9 …" · 40 / 29; the ground-floor message is gone (a sheet that prints a bedroom is a flat sheet) |

**Stable:** every flat gives the same draft from every spot clicked (Sheltech A ×3, B ×3, BTI north ×3, south ×3). **One
traced flat = one flat:** every after-shot shows the traced flat in one tint with one name; before, Sheltech L2 Type B's
Bed 2 was closed but in no flat. **No borrowing:** the small BTI flats no longer take the big flat's rooms or names; north /
south keep their own PDR / Bath-2; each flat's printed area and TYPE come only from its own part of the floor.

**Check these + Issues on the eight Level 0 test flats (first spot each): 378 → 342.** Fell: BTI small west 58 → 35, small
east 47 → 13, BTI north 46 → 44. Rose, and why (no row hidden): BTI south 53 → 62 — the flat now holds its west part (kitchen,
Bath-2, study, help bed: 4 more rooms, their rows and wall ends); Banani A 66 → 69 — more of it traced (52 walls, 3 rooms;
2 names closed, was 1); BTI 2nd big flat 45 → 56 — the flat is now always chosen from its dining's printed name, and from
there the flood reaches the unnamed box between the lift lobby and the powder room (Check these: + 5 "A wall ends here",
+ a 2'-1" gap, − the dining's size row; Issues: + 6 loose wall ends); the old pick gave exactly this when clicked on that name (checked in node: 128 walls, 48 / 9), and 119 walls /
42 / 3 only from a spot 1.5 m further west. Sheltech A and B unchanged (35, 28).

**Node eval (`npx vitest run src/trace/solve.test.ts --silent=false`, NEW READER):** **75 of 116** — unchanged (Sheltech A
13, B 12, BTI Type A 15, Type B 16, Type C 19).

## Session 31 (2026-11-20, "calm"): fewer Check-these rows needed, and a sheet that reads as a drawing

**Why.** QA, as the founder, dropped the BTI 2nd floor sheet, set the scale and ran Auto-trace on the whole floor: 85
"Check these" rows and 88 numbered red / amber circles — "the screen reads as an error list, not a drawing". His rule:
never hide a warning, build so fewer are needed; every row stays in the list.

**The rows by cause, before (node, the 12 flat sheets below, 847 rows):** a loose wall end 173 — every one either the
same end the Issues list already shows (with its fixes) or one the import's own joining had already met with a wall
(52: their corner was gone, the row stayed for ever); a gap 101 (30 of them already closed: the import had joined
their end); a printed size not read 99; a thin line traced as a low wall 81 (many of them the sides of an AOD box that was
already a row of its own, and the box asked twice: "A small space … offered as an AOD" + "Room type guessed from its size
and thin-line sides"); a planter edge 65 (most on the outline of a planter that was already a row); a size off 53; a
sliding door drawn like a window 47 (on a veranda reached by nothing else in 21 of them); a passage 34, an open side 25
(the same piece asked twice where an open-plan side became a passage).

**What changed (general rules, each with a test in `solve.test.ts` / `issues.test.ts`; nothing is hidden — a row goes
only where the same thing is asked elsewhere or its problem is gone):** no "A wall ends here" row (the Issues list carries
every loose end, live); a trace row about a wall end follows it through the import's join and goes once the end meets a
wall; a room guessed whole (an AOD from its thin-line sides, a planter from its green) is ONE row, its edges part of it; an
open-plan side traced as a passage is one row; glass drawn like a window onto a veranda with no other way in is a sliding
door with no row (a door elsewhere on the veranda keeps the question). The canvas (Studio): red keeps its numbered badge;
amber is an 8 px dot until the mouse is near or its row is picked; grey is list only; rows at one spot share an outlined
badge with their count; the list is grouped by room; ↑ / ↓ / Enter in the list.

**How it was measured — the founder's path.** Firefox (Playwright's build on E:, headless, one browser, a fresh browser
context per sheet), the real Studio at 1600 × 1000: drop the sheet picture, **S** on the printed length of the s27 batch
files (`E:/dev/tmp/s27/batchK.json`, `batchO.json`), **Auto-trace**, **Whole floor**, then the panel's "Check these (N)" and
"Issues (N)" and the marks on the plan counted from the page, the plan shot, Export. "Before" = `s31/redesign` 370ea02,
"after" = `s31/calm`; same harness, same clicks (`E:/dev/tmp/s31/calm/fx.mjs`, `l0.json`; logs and shots
`E:/dev/plotline-shots/s31/calm/before/` and `after/`). Rooms right = the exported drafts scored with `score30.ts` against
the printed points `E:/dev/tmp/s27/pts` (`E:/dev/tmp/s31/calm/scorefx.mjs`).

| Sheet (whole floor) | Check these before → after | Issues | Marks on the plan: before (all numbered) → after numbered + dots | Rooms closed + named right before → after (printed) | Walls traced |
|---|---|---|---|---|---|
| BTI 3rd floor (`img_2`) | 89 → **70** | 8 → 8 | 92 → **15** + 55 dots | 30 → 30 (32) | 235 → 235 |
| BTI 2nd floor (`img_3`) | 81 → **57** | 13 → 13 | 84 → **23** + 43 dots | 28 → 28 (28) | 226 → 226 |
| Sheltech Level 2 | 68 → **54** | 5 → 5 | 70 → **12** + 46 dots | 25 → 25 (38) | 195 → 195 |
| Sheltech Level 3 | 94 → **55** | 10 → 10 | 94 → **13** + 48 dots | 26 → 26 (36) | 217 → 217 |
| Sheltech Level 4 | 71 → **47** | 9 → 9 | 73 → **15** + 35 dots | 26 → 26 (37) | 211 → 211 |
| Sheltech Level 5 | 84 → **63** | 8 → 8 | 86 → **16** + 49 dots | 25 → 25 (36) | 197 → 197 |
| Sheltech Level 6 | 84 → **63** | 8 → 8 | 86 → **16** + 49 dots | 25 → 25 (36) | 197 → 197 |
| Banani Level 2-6 | 68 → **39** | 37 → 37 | 84 → **48** + 16 dots | 6 → 6 (22) | 117 → 117 |
| Banani Level 7 | 44 → **23** | 22 → 22 | 51 → **29** + 11 dots | 2 → 2 (21) | 80 → 80 |
| Banani Level 8 | 3 → 3 | 0 → 0 | 3 → **0** + 3 dots | 0 → 0 (18) | 16 → 16 |
| Banani Level 9-13 | 6 → 6 | 0 → 0 | 6 → **0** + 6 dots | 1 → 1 (17) | 20 → 20 |
| DMD Level 3-14 *(out of scope)* | 132 → **63** | 85 → 85 | 179 → **72** + 18 dots | 0 → 0 (47) | 227 → 227 |
| **all 12** | **824 → 543 (−34 %)** | 205 → 205 | **908 → 259** numbered + 379 dots | 194 → 194 (368) | the same |

Three more developers' sheets the same way (`E:/dev/tmp/s31/calm/others.json`, from `sheets30.json`): Assure Hermitage
typical floor 111 → **80** rows, 121 → **33** numbered + 55 dots; Rangs White Lake A + B 92 → **55**, 94 → **28** + 38; Finlay
Nirvana typical 55 → **39**, 58 → **10** + 29 — the same walls, rooms and labels traced (240 / 32 / 22, 196 / 33 / 29,
246 / 39 / 35 both times).

**Walls and rooms did not move:** every sheet traced the same walls, rooms and labels before and after (the "Traced …"
lines, the exported drafts); the node table (`solve.test.ts`, NEW READER, the five hand-traced flats) is 76 of 116 rooms
matched before and after with the same wall recall / precision (Sheltech A 65 / 79 %, B 67 / 86 %, BTI Type A 52 / 71 %,
Type B 78 / 87 %, Type C 75 / 90 %); the trace's own review rows there 227 → 156. On the 30 scorer sheets (`npm run
score30`, node): Check these rows 2132 → **1339** (−37 %), rows + Issues marks 2346 → 1950, 434 of 522 printed rooms closed and named right = 83.1 % before and after, names read 458 of 522 both (`E:/dev/tmp/s31/calm/s30-before.log` / `s30-after.log`; score30 now writes each sheet's open rows and marks into its `<key>.json`).

**Left, and why (the next lane):** the rows still most common are a printed size the reader could not read (99 on the 12
sheets: the print is small or a line runs through it — reading, not rules), a gap in a wall with nothing drawn in it (68,
mostly DMD's grey walls and Banani's thin walls, where the trace itself fails), a size a few inches off its print (53), the
thin-line low walls round verandas and the foliage edges of planters that are no room of their own, and the passages with
nothing drawn across them. The red marks left on the BTI sheet are mostly the AC ledges' fins at the top, which stop at a
dashed grille — real loose ends until a person closes them or keeps them standing alone.

## Session 31 newcomer lane (2026-11-22): how many flats Whole floor finds

**Why.** A newcomer with only the manuals ran Whole floor on the BTI 2nd floor (`img_3`): its big flat and its two small
top flats came out as ONE "Flat 1", and he needed 9 picks to split them. Level 4 (above) had found three; the s27 "flats 2"
rule since caps the floor at the flats its labels name, and this sheet's only label is its title, "2703 SFT & 674 SFT",
read as one untyped stamp = one flat — so the first seed's flood took the whole floor, lobby and both small flats.

**The rule (one line, `solve.ts areasIn`, tested in `solve.test.ts`):** an untyped area stamp names one flat per area it
prints joined by "&", "+", "and" or a comma ("2703 SFT & 674 SFT" = 2; "2,703 SFT" = 1; "Net 1650 SFT Gross 1980 SFT" = 1).
With 2 labels and 3 kitchens read the floor may have 3 flats, and a flat that took a second kitchen is picked again with
it as a rival — the three flats split where their floods meet, the lift lobby in none.

**How it was measured.** Every whole-floor sheet in `Demo drawings/` that the s25 batches and the Level 0 list mark with
two or more flats (49 sheets, `E:/dev/tmp/s31/newcomer/floors/floors.json`, the sheet's own flat count from the batch
tables). Node (`src/trace/eval/flats27.test.ts`, fixtures decoded in Firefox): Whole floor before (s31/redesign 2860fd0)
and after, the flats deriveFlats gives. Firefox, the founder's path (`E:/dev/tmp/s31/newcomer/floors/fx.mjs`, the calm
harness: drop the sheet, S on its printed length, Auto-trace, Whole floor), after: the panel's per-flat count lines ("Flat
2: 21 of the 22 room names read on it …") — one line per flat that has a name read, so a flat with none read is not
counted there. Log and shots: `E:/dev/plotline-shots/s31/newcomer/floors/` (`after.log`, `after-<sheet>.png`). The
calm lane's Firefox run of the 15 sheets it shares (`E:/dev/tmp/s31/calm/fx-after*.out`) is the Firefox "before": the
same counts on every one but BTI `img_3` (one flat there).

| Sheet | Flats on the sheet | Node before | Node after | Firefox after (count lines) |
|---|---|---|---|---|
| btibd-img2 | 2 | 2 | 2 | 2 (Flat 2, Flat 1) |
| btibd-img3 | 3 | 1 | 3 | 3 (Flat 2, Flat 1, Flat 3) | **changed**
| sheltech-l2 | 2 | 2 | 2 | 2 (Type A, Type B) |
| sheltech-l3 | 2 | 2 | 2 | 2 (Type WO, Type A) |
| sheltech-l4 | 2 | 2 | 2 | 2 (Type A, Type B) |
| sheltech-l5 | 2 | 2 | 2 | 2 (Type A, Type B) |
| sheltech-l6 | 2 | 2 | 2 | 2 (Type A, Type B) |
| sheltech-banani-l26 | 2 | 1 | 1 | 1 (Unit A) |
| sheltech-banani-l7 | 1 | 1 | 1 | 1 (Unit A & B) |
| sheltech-banani-l8 | 1 | 1 | 1 | 1 (Unit A) |
| sheltech-banani-l913 | 1 | 1 | 1 | 1 (Unit A) |
| sheltech-dmd-l314 | 3 | 1 | 1 | 0 (no names read) |
| rangs-majestic-typical | 2 | 2 | 2 | 2 (Flat 2, Flat 1) |
| rangs-sanctuary-4th10th-6th8th | 2 | 2 | 2 | 2 (Flat 2, Flat 1) |
| rangs-sanctuary-b2-1st | 5 | 1 | 1 | 1 (Flat 1) |
| rangs-ixora-a1a2 | 2 | 2 | 2 | 2 (Flat 1, Flat 2) |
| rangs-ixora-db | 2 | 2 | 2 | 2 (Flat 2, Flat 1) |
| rangs-ixora-ef | 2 | 2 | 2 | 2 (Flat 1, Flat 2) |
| rangs-noorani-ab-2nd4th | 2 | 3 | 3 | 3 (Flat 1, Flat 2, Flat 3) |
| rangs-noorani-ab-3rd7th | 2 | 4 | 4 | 4 (Flat 1, Flat 2, Flat 3, Flat 4) |
| rangs-whitelake-ab-fl2 | 2 | 2 | 2 | 2 (Flat 1, Type A) |
| rangs-whitelake-ab-fl3 | 2 | 2 | 2 | 2 (Type B, Type A) |
| rangs-whitelake-ab-fl4 | 2 | 2 | 2 | 2 (Type A, Type DB) |
| rangs-whitelake-ab-odd | 2 | 2 | 2 | 2 (Type A, Type B) |
| rangs-whitelake-ab-even | 2 | 2 | 2 | 2 (Type A, Type B) |
| sheltech-windflower-t1 | 6 | 5 | 5 | 5 (Flat 3, Type F, Type AC, Flat 1, Flat 2) |
| sheltech-windflower-t2 | 6 | 1 | 1 | 1 (Flat 1) |
| sheltech-kanakchapa-l4 | 7 | 7 | 7 | 7 (Type G, Type F, Type E, Type C, Type A, Flat 1, Flat 2) |
| sheltech-waterlily-typical | 3 | 3 | 3 | 3 (Type C, Flat 1, Type A) |
| sheltech-waterlily-l2 | 3 | 3 | 3 | 3 (Type C, Type B, Type AL) |
| sheltech-nurjahan-typical | 2 | 1 | 1 | 1 (Flat 1) |
| assure-tilottoma-typical | 4 | 1 | 1 | 1 (Type A) |
| assure-hermitage-typical | 1 | 1 | 1 | 1 (Flat 1) |
| cpdl-charukabya-typical | 2 | 2 | 2 | 2 (Flat 1, Unit B) |
| cpdl-lareina-typical | 2 | 1 | 1 | 2 (Flat 1, Flat 2) |
| cpdl-jheenuk-typical | 3 | 1 | 1 | 0 (no names read) |
| finlay-chayaneer-typical | 3 | 3 | 3 | 0 (no names read) |
| finlay-dilruba-a3470 | 2 | 2 | 2 | 2 (Flat 1, Flat 2) |
| finlay-dilruba-a3495 | 2 | 2 | 2 | 2 (Flat 1, Flat 2) |
| finlay-nirvana-typical | 2 | 2 | 2 | 2 (Unit B, Unit A) |
| finlay-jahanara-typical | 2 | 2 | 2 | 2 (Type B, Type A) |
| finlay-palmspring-tower1 | 4 | 2 | 2 | 2 (Flat 1, Flat 2) |
| arkam-metropark-typical | 7 | 1 | 1 | 0 (no names read) |
| assort-muksud-typical | 2 | 2 | 2 | 2 (Type A, Type B) |
| foysal-smartgarden-typical | 2 | 2 | 2 | 2 (Unit A, Unit B) |
| nessa-hasnahena-typical | 2 | 2 | 2 | 2 (Flat 1, Flat 2) |
| eh-sapphire-typ02 | 3 | 3 | 3 | 2 (Flat 3, Flat 1) |
| mir-jahanenur-typ | 2 | 2 | 2 | 2 (Unit A, Unit B) |
| mir-shohag-unitab | 2 | 2 | 2 | 1 (Flat 1) |

**Right flat count — node before 35, node after 36, Firefox after 34 of 49.** The rule changed one sheet, BTI `img_3`: 1 → 3 flats (Flat 1 = west small
flat, Flat 2 = the 2703 sft flat, Flat 3 = east small flat; lobby, stair and lifts in none). No other sheet moved in node;
in Firefox every sheet the calm run also measured gave the same count.

**Left, and why (not one rule):** most of the 13 sheets still wrong are trace failures, not splitting — DMD (grey walls), Jheenuk
(0 rooms traced), Tilottoma (10 walls), Metro Park (5 rooms), Windflower T2 and Nurjahan (8–10 rooms): too few rooms for any
flat rule. Banani L2-6: its "UNIT B" label is read but Unit A's is not, and a stamp beside typed labels counts as a misread
one (s27, Kanakchapa's legend) — one flat. Palm Spring (2 of 4) and Sanctuary B2/1st (1 of 5 studios): flats joined through
corridors whose doors were not read, with fewer kitchens read than flats. Noorani 2nd/4th and 3rd/7th (3 and 4 of 2): each
flat split by a door not found. The next lane: count living / dining / master bed prints with the kitchens when the labels
run out, and a lobby whose name was not read (BTI's) as core when it touches the stair.


## Session 31 p2trace (2026-11-27): the cofounder's Auto-trace changes, taken in one at a time and measured in Firefox

**In plain words.** Maheer's Plotline 2.0 changes to Auto-trace (the review is `Docs/review/p2-rest/`) were taken into ours
one at a time, each with his tests and "from Maheer's Plotline 2.0" in its commit. After each one the founder's own path
ran in Firefox on the same 33 sheets (the 30 above + the three with hand-traced flats): drop the sheet, **S** on its
printed length, **Auto-trace**, **Whole floor**, Export. A change stays only if no sheet loses a room that was right, no
hand-traced flat loses a matched door or window, and the Check these rows do not go up. Result: **rooms closed and named
right 507 → 510 of 620 printed, lifts / stairs / lobbies right 29 → 41 of 93, Check these rows 1 504 → 1 497, the
hand-traced flats' rooms and doors unchanged. On the merged tree, its final measure: 506 → 508 right, 28 → 43 lifts /
stairs / lobbies, 1 504 → 1 499 rows, no room lost (below; one rule of the glass step narrowed to get there).**

**How it was measured.** One Firefox, one Vite; each step's commit frozen as a copy of `src/` so a run measures exactly that
commit. Every export is scored by ONE fixed scorer (`score30.ts` + `solveEval.ts` at `f269ff4`), so the new name rules
cannot change the scoring. Right = a closed room with the printed name; core = a printed lift / stair / lobby; Check
these = the count on the panel. Logs and exports `E:/dev/plotline-shots/s31/p2trace/<step>.log` + `<step>/`. The same
code on the same sheet at the same scale gives the same rooms (re-run on 8 sheets: no room differs).

**Step by step (33 sheets):**

| step | what a person sees (his item numbers) | rooms right | lifts / stairs / lobbies | Check these | kept? |
|---|---|---|---|---|---|
| before | `f269ff4` | 507 | 29 | 1 504 | |
| 1 core | after Whole floor a closed lift, stair or lobby stays in the drawing as the building's core, out of every flat; a lobby no longer swallows the bedroom across a thin wall; a lift bank read from its "8 PERSONS" prints (R15 R17 R14 T9) | 507 | **39** | 1 515 | yes: 10 lifts / stairs on 8 sheets, none lost |
| calm (ours) | no printed-size question on a lift (its print is the car) or a stair (the flight), none on a stair found from its drawn treads | | | −20 such rows | yes |
| 2 glass | living / dining / open kitchens behind coloured glass close; OPEN KITCHEN inside a living room no longer renames it; a glass veranda goes to its flat (R10 R11 R18 R6 R16) | 508 | 39 | 1 517 | yes: Magnifico's veranda (Water Lily: one VER right instead of the other); on the merged tree its reconnect narrowed to coloured glass, below |
| 3 thickness step | a wall that steps thick → thin keeps its short thick piece (R5) | 508 (9 lost, 9 gained) | 38 | 1 528 | **no**, below |
| 4 + 5 text | sizes in cm / mm (and our "4.4m x 3.2" read as 0.98 m, fixed); "KlTCHEN-02" keeps its number; UVING → LIVING; the second look inside an unnamed room reads only that room, names land where printed, sideways names read upright (T1–T8) | +0 | +1 (La Montana B's lift) | +1 | yes |
| 6 dark floors | names printed on a dark floor are no longer planter green; with no click the region with the bedrooms is the flat (R12 R13) | no change on the sheets it touches | | | yes |
| 7 doors | the door-swing test counts instead of sorting (R4, kept); its window ×2 / ×3 on enlarged sheets (R4, **dropped**); faint and double-action doors (R7 R8 R9, kept: Water Lily's lift, no door lost) | | | | see below |
| 8 – 9, R1 | the picture made into pixels in the trace worker (W1 W2); a turned sheet's hover tint and edge pixels (R3 R21); a pale scan stretched to full contrast (R1) | no change (none of these sheets is turned or pale) | | | yes |
| **all kept** | `b93f06a` | **510** | **41** | **1 497** | |

Per sheet, before → all kept (rooms right · lifts / stairs / lobbies right · Check these · seconds from Auto-trace to
"Point at a flat"; Sapphire's "after" from a second run — in the first its text reading never finished, which happened to
the old tracer on Sapphire too):

| sheet | printed | rooms right | lifts / stairs / lobbies | Check these | seconds |
|---|---|---|---|---|---|
| bti-amabilia-typea | 16 | 12 → 13 | 1/3 → 3/3 | 45 → 45 | 27 → 25 |
| bti-magnifico-unita | 27 | 11 → 12 | 0/5 → 2/5 | 88 → 90 | 28 → 27 |
| bti-cosmopolis-t4typea | 9 | 9 | 0/0 → 0/0 | 27 | 29 → 29 |
| bti-silvi-5th7th | 29 | 21 | 2/4 → 2/4 | 77 → 74 | 22 → 20 |
| bti-peak-typef-1397 | 11 | 9 | 2/2 → 2/2 | 16 → 14 | 18 → 20 |
| bti-fernhill-2nd3rd | 16 | 15 | 3/3 → 3/3 | 37 → 35 | 36 → 33 |
| bti-lamontana-t1typeb | 18 | 16 | 2/5 → 4/5 | 40 → 41 | 34 → 28 |
| bti-lamontana-t1typea | 14 | 14 | 0/5 → 2/5 | 36 | 37 → 26 |
| rangs-torukabbo-typea | 13 | 13 | 0/0 → 0/0 | 24 | 15 → 12 |
| rangs-sanctuary-12th-roof | 17 | 13 | 1/4 → 1/4 | 27 | 21 → 17 |
| rangs-whitelake-ab-fl3 | 24 | 24 | 2/10 → 2/10 | 55 | 24 → 22 |
| rangs-ixora-ef | 22 | 20 | 0/0 → 0/0 | 55 | 24 → 22 |
| sheltech-kanakchapa-l4-a | 14 | 11 | 0/0 → 0/0 | 37 | 61 → 57 |
| sheltech-waterlily-typical | 35 | 27 | 0/4 → 2/4 | 117 → 116 | 27 → 20 |
| sheltech-siddiques-typea | 14 | 10 | 2/3 → 3/3 | 35 → 38 | 9 |
| assure-gladiolus-2nd6th | 15 | 14 | 1/3 → 1/3 | 42 → 40 | 25 → 22 |
| assure-phera-1st | 16 | 14 | 1/3 → 1/3 | 35 → 33 | 26 → 23 |
| assure-hermitage-typical | 20 | 19 | 0/5 → 0/5 | 80 → 79 | 35 → 32 |
| cpdl-skymark-unitd | 15 | 15 | 0/0 → 0/0 | 25 | 22 → 18 |
| cpdl-joljhiri-unita | 14 | 13 | 0/0 → 0/0 | 26 | 31 → 27 |
| cpdl-lareina-amber | 19 | 11 | 0/0 → 0/0 | 58 → 52 | 17 → 15 |
| finlay-chayaneer-typeb | 16 | 16 | 0/3 → 0/3 | 79 | 37 → 32 |
| finlay-nirvana-typical | 31 | 31 | 0/4 → 0/4 | 39 | 20 → 18 |
| finlay-palmspring-typea | 12 | 8 | 0/1 → 0/1 | 38 → 40 | 62 → 53 |
| ena-azmaryvilla-typea | 14 | 14 | 0/0 → 0/0 | 32 → 33 | 18 → 15 |
| ena-jahanlodge-typea | 9 | 6 | 0/0 → 0/0 | 20 | 19 → 16 |
| accept-aftabnagar-typical | 12 | 7 | 1/3 → 1/3 | 41 | 43 → 36 |
| eh-pearl-2145 | 18 | 13 | 2/3 → 2/3 | 29 → 28 | 56 → 53 |
| eh-sapphire-unita | 15 | 11 | 1/5 → 2/5 | 38 → 43 | 75 → 61 |
| mir-mrmemento-typeb | 17 | 7 → 8 | 1/4 | 25 → 28 | 57 → 47 |
| btibd-img3 | 28 | 28 | 2/4 → 2/4 | 57 → 56 | 33 → 29 |
| btibd-img2 | 32 | 30 | 3/4 → 3/4 | 70 → 69 | 33 → 28 |
| sheltech-l2 | 38 | 25 | 2/3 → 2/3 | 54 → 52 | 14 → 12 |
| **total (33 sheets both finished)** | 620 | 507 → 510 | 29/93 → 41/93 | 1504 → 1497 | |

Rooms gained: Amabilia's two lifts / stair and S.Bed (was merged into S.Toi), Magnifico's two stretcher lifts and
veranda, La Montana B's lift and stair, La Montana A's fire stair and lift, Water Lily's two lifts, Siddiques' staircase,
Sapphire's passenger lift, Mir Memento's family living. Lost: none (Water Lily: one VER closed instead of the other).
The hand-traced flats: rooms and doors / windows the same on all five; Type A's wall recall 60.8 → 64.6 %.

**On the merged tree (with s31/redesign's frame, heights, roof, railings, facade and outside pieces) — the final
measure.** The frame lane's project column makes the sheet a little smaller on screen, so the same S clicks land a pixel
apart and the scale differs by up to 0.7 % on 21 of the 33 sheets (Magnifico 35.06 → 34.83 px/m, nearer its print).
Measured against the redesign head with our old tracer at that same layout (`86a4d7c`, same scale on all 33 sheets):

| | old tracer (`86a4d7c`) | this lane, final (`f856640`) |
|---|---|---|
| rooms closed and named right | 506 | **508** |
| lifts / stairs / lobbies right | 28 / 93 | **43 / 93** |
| Check these rows | 1 504 | **1 499** |
| rooms lost | | **none** |
| hand-traced flats: rooms · doors and windows | 88 / 116 · 113 / 161 | the same; Type A's wall recall 60.8 → 64.6 % |
| seconds from Auto-trace to "Point at a flat", 33 sheets | 1 076 | 947 |

Per sheet, old tracer → final, on the merged tree:

| sheet | printed | rooms right | lifts / stairs / lobbies | Check these | seconds |
|---|---|---|---|---|---|
| bti-amabilia-typea | 16 | 12 → 13 | 1/3 → 3/3 | 45 → 45 | 29 → 28 |
| bti-magnifico-unita | 27 | 12 | 0/5 → 2/5 | 93 → 95 | 34 → 29 |
| bti-cosmopolis-t4typea | 9 | 9 | 0/0 → 0/0 | 27 | 33 → 29 |
| bti-silvi-5th7th | 29 | 21 | 2/4 → 2/4 | 79 → 76 | 26 → 22 |
| bti-peak-typef-1397 | 11 | 9 | 2/2 → 2/2 | 16 → 17 | 21 → 18 |
| bti-fernhill-2nd3rd | 16 | 15 | 3/3 → 3/3 | 37 → 35 | 38 → 36 |
| bti-lamontana-t1typeb | 18 | 16 | 2/5 → 4/5 | 42 → 45 | 37 → 30 |
| bti-lamontana-t1typea | 14 | 12 | 0/5 → 2/5 | 33 | 31 → 27 |
| rangs-torukabbo-typea | 13 | 13 | 0/0 → 0/0 | 24 | 18 → 13 |
| rangs-sanctuary-12th-roof | 17 | 13 | 1/4 → 1/4 | 26 | 36 → 18 |
| rangs-whitelake-ab-fl3 | 24 | 24 | 2/10 → 2/10 | 55 | 24 → 24 |
| rangs-ixora-ef | 22 | 22 | 0/0 → 0/0 | 55 | 25 → 22 |
| sheltech-kanakchapa-l4-a | 14 | 11 | 0/0 → 0/0 | 37 | 82 → 58 |
| sheltech-waterlily-typical | 35 | 25 | 0/4 → 2/4 | 109 → 107 | 24 → 21 |
| sheltech-siddiques-typea | 14 | 10 | 2/3 → 3/3 | 35 → 37 | 10 → 9 |
| assure-gladiolus-2nd6th | 15 | 14 | 1/3 → 1/3 | 42 → 40 | 26 → 24 |
| assure-phera-1st | 16 | 14 | 1/3 → 1/3 | 35 → 33 | 27 → 24 |
| assure-hermitage-typical | 20 | 19 | 0/5 → 0/5 | 80 → 79 | 35 → 32 |
| cpdl-skymark-unitd | 15 | 15 | 0/0 → 0/0 | 25 | 24 → 18 |
| cpdl-joljhiri-unita | 14 | 13 | 0/0 → 0/0 | 26 | 32 → 28 |
| cpdl-lareina-amber | 19 | 11 | 0/0 → 0/0 | 58 → 54 | 15 → 16 |
| finlay-chayaneer-typeb | 16 | 16 | 0/3 → 0/3 | 79 | 35 → 35 |
| finlay-nirvana-typical | 31 | 31 | 0/4 → 0/4 | 39 | 20 → 18 |
| finlay-palmspring-typea | 12 | 8 | 0/1 → 0/1 | 39 | 63 → 57 |
| ena-azmaryvilla-typea | 14 | 14 | 0/0 → 0/0 | 32 → 33 | 17 → 15 |
| ena-jahanlodge-typea | 9 | 6 | 0/0 → 0/0 | 20 | 20 → 17 |
| accept-aftabnagar-typical | 12 | 7 | 1/3 → 1/3 | 41 | 43 → 38 |
| eh-pearl-2145 | 18 | 13 | 2/3 → 2/3 | 29 → 28 | 57 → 53 |
| eh-sapphire-unita | 15 | 11 | 0/5 → 4/5 | 40 → 45 | 68 → 64 |
| mir-mrmemento-typeb | 17 | 7 → 8 | 1/4 | 25 → 27 | 50 |
| btibd-img3 | 28 | 28 | 2/4 → 2/4 | 57 → 56 | 30 → 29 |
| btibd-img2 | 32 | 30 | 3/4 → 3/4 | 73 → 72 | 29 → 28 |
| sheltech-l2 | 38 | 25 | 2/3 → 2/3 | 51 → 49 | 13 → 14 |
| **total (33 sheets both finished)** | 620 | 506 → 508 | 28/93 → 43/93 | 1504 → 1499 | |
Gained: lifts / stairs on Amabilia (2), Magnifico (2), La Montana B (2) and A (2), Water Lily (2), Siddiques (1),
Sapphire (4); Amabilia's S.Bed (was merged into S.Toi); Mir Memento's family living.

**Why the glass step was narrowed.** The first merged-tree run (glass step whole) lost BTI Magnifico's family lounge and
Bath 1 and added 14 rows there (1 504 → 1 521 in all); run on Magnifico at the merged layout item by item, the loss came
with step 2 (glass) — at the old layout the same step had lost nothing there. Each of its rules turned off alone, on
Magnifico in Firefox at the merged layout: closing line on blue glazing colour (R10), thin blue panes from the colour mask
(R11), the pane's one straight offset (R6), the open kitchen as a work zone (R18), the glass veranda to its flat (R16) —
off, nothing changes; **the reconnect (R11: a line whose end lost its line at a T looks for another line) — off, both
rooms back and 95 rows.** His two tests for it are blue panes on a dark floor, so it stays only for coloured-glass lines;
grey lines prune as before. With that, Magnifico's veranda and Water Lily's second VER (which the reconnect had closed at
the old layout) stay open.

Time: whole-run totals move ±15 % between runs of the same code on this machine (old tracer 1 038 and 1 076 s, new 907,
947 and 1 213 s); the turn-about run (old and new one after the other on each of 6 sheets) is equal within 1–3 s per sheet.

**Auto-trace's text reading sometimes never finishes** (a bug for a next lane, not this one): the card stays at "Reading
the plan (text)… 0 %" for over 7 minutes with a clean console, on the old tracer and the new alike — Eastern Housing
Sapphire twice in a row (f269ff4 and b93f06a), Finlay Palm Spring once (79977d6), and once at "Reading the plan (graph)…"
on CPDL La Reina (f269ff4); a fresh page then reads each in 15–90 s. Shots `ours-<sheet>-notready.png` in
`E:/dev/plotline-shots/s31/p2trace/{final2,tb,merged}/`.

**Dropped, with the numbers.**
- **The short wall where a wall changes thickness (R5).** It split Sheltech Level 2's Toilet 2 from the lift (Sheltech B
  13 → 15 rooms matched) and closed Jahan Lodge's living / dining / kitchen and three Mir Memento rooms, but lost BTI
  Magnifico's two lifts, kitchen, kitchen veranda, family lounge and Bed 3, a veranda on Kanakchapa and on Gladiolus and
  La Reina's Bed 3: 508 → 508 right, 9 rooms lost. Two narrower versions on the 9 sheets it moved: old OR new test (10
  lost), new test only up to 1.2 m (12 lost, the Toilet 2 gain gone).
- **The wider door-swing window on enlarged sheets (part of R4).** It lost Magnifico's family lounge and Bed 3 and Water
  Lily's living room and added 20 rows on Magnifico; the 33-sheet run with it took 1 291 s against 907 s without. Without
  it, on the five sheets it touches, no room is lost. The counted test itself (same answer, no sort) stays.

**Also in this lane (not on the 33 sheets' path):** "Set the scale and trace again" under Check these when Auto-trace had
to guess the scale (MANUAL §5, KEYS); opening another drawing while Auto-trace runs stops it; 3D on ground floors — the
covered parking's slab is solid with its lights only under it, the face above a kerb by a raised lawn is drawn, a piece
deleted in Edit furniture is not built (V7 V8 V10 V2 V3 V4; shots `E:/dev/plotline-shots/s31/p2trace/3d/`).

**Not measured.** Memory (headless Firefox reports none); a real pale scan (none of the 1 098 pictures is one — his faded
copy of a Sheltech crop is the test); a double-action door on a real sheet (none of the five hand-traced flats draws one).
