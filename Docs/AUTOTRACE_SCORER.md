# The 30-sheet scorer (session 26, step 0)

One command tells, for 30 real brochure sheets, how many PRINTED rooms Auto-trace closes and names right — the number the
founder counts in the Studio after: drop the sheet, S on a printed size, Auto-trace → Whole floor (or a click on the flat).
It runs in node, in minutes, so every change to the tracer can be measured. The Firefox harness (`E:/dev/tmp/s25/run.mjs`)
stays the proof at each checkpoint.

## Run it

```
node scripts/trace-fixtures.mjs --rgb --sheets src/trace/eval/sheets30.json   # once: the sheet pictures → E:/dev/tmp/s26/fixtures (Firefox, ~10 s)
npm run score30                                                                # all 30; the table at the end
SCORE30_SHEETS=bti-amabilia-typea,cpdl-skymark-unitd npm run score30           # a few sheets (PowerShell: $env:SCORE30_SHEETS='…'; npm run score30)
SCORE30_FRESH=1 npm run score30                                                # read the text again (the cache is normally enough)
```

Per sheet it does exactly what the Studio does: the picture decoded as `StudioApp.tsx rastersOf` (white under transparent
pixels, the same luma), the S tool's scale (`pxPerM` = the distance between `scale.a` and `scale.b` ÷ the printed length),
`prepare` → `pickFloor` (Whole floor) or one `pick` per `flats[].at` when the sheet says `"floor": false`, and the result
imported as the Studio imports it (`studioReducer` 'auto-trace': walls joined, a printed name standing in an unnamed room
names it). Then it scores that unit.

**Speed.** The text reading (tesseract) is cached per sheet in `E:/dev/tmp/s26/text/<key>-<hash>.json`; the hash covers
`src/trace/text.ts`, `src/trace/sizes.ts`, the tesseract.js version and the page it reads — change any of them and that
sheet is read again. Tesseract's data comes from `E:/dev/tmp/wave19/reader/tess/` (nothing is downloaded). Everything after
the reading (walls, rooms, the face re-reads, names) runs every time. Folders: `SCORE30_FIXTURES`, `SCORE30_TEXT`,
`SCORE30_OUT`, `SCORE30_TESS`.

## What comes out

`E:/dev/tmp/s26/out/`: `score30.txt` (the table + headline), `score30.json` (the rows), and per sheet `<key>.json` (every
printed room with its state and the traced room's name / area there, the false rooms, the pillars in rooms, the traced
counts) and `<key>.png` — the draft on the sheet (rooms tinted by kind, walls red, openings blue / cyan / magenta, review
marks yellow / orange) with every printed room as a dot: **green = closed and named right, red = anything else**.

## The columns

| column | meaning |
|---|---|
| printed | rooms printed on the sheet (the flats' rooms; the core is counted apart) |
| closed+named right | the room around the printed point is closed and carries a right name: the tracer's own kind of both names (`text.ts classifyRoom`) is the same, and the number when the print carries one ("Suite 2" on SUITE-2 / BED-2 is right, "Bed 1" or "Bed" on BED-2 is wrong; a core room also shares a word: Lobby is no Stair) |
| wrong name | closed, carries another name |
| unnamed | closed, "Space N" |
| merged | its room holds another printed room too — right only for the one whose name it carries |
| open | no closed room there, or only one bigger than `KNOBS.maxRoomSqm` (90 m²) |
| core right/printed | the same for lobby / lift / stair / corridor |
| false rooms | closed rooms of 1 … 90 m² holding no printed room (furniture, fills, slivers) |
| pillars in rooms | pillars whose block touches no wall (a chair or basin taken for a column) |
| names read | printed rooms whose name Auto-trace read (`stats.printed`: the right name within 3 m) |
| s | seconds for the sheet (the text reading only when not cached) |

Headline: **"N of M printed rooms closed and named right = P %"** (flat rooms), then the same with the core, then names read.

## The 30 sheets and adding one

`src/trace/eval/sheets30.json`: per sheet `file, w, h, scale {a, b, len, what}, flats, floor?, style` (the first fields as in
the session-25 batch files `E:/dev/tmp/s25/batch{A..I}.json`) and `expected` — every printed room once:
`{ name, size?, at: [x, y], core?: true, flat? }` — the sheet's own words, the size as printed, a point well inside the room
in IMAGE px, `core` for lobby / lift / stair / corridor, `flat` on multi-flat sheets (the flat-click name on `floor: false`
sheets). Not rooms: ducts / risers / shafts, voids, AC outdoor units, D.W, FHC / FHB, SDB, W/M, fridge, TV, notes,
dimension strings, title text, the key plan. Planters / GREEN with a printed name are rooms.

To add a sheet: put its entry in `sheets30.json` (take the scale from a printed size: two image-px points on the room's wall
faces and the printed length), run the fixture script, and place every room's point by looking at grid crops of the sheet
(session 26 used `E:/dev/tmp/s26/work/crop.mjs <key> x y w h k out.png [points.json]`: a crop with an image-px grid and
the points drawn on it; `seeds.mjs <key>` lists the names the reader found with their centres).

## Proof in Firefox

`PLAYWRIGHT_BROWSERS_PATH=E:/dev/tools/ms-playwright ROOT=<checkout> PORT=5440 OUT=E:/dev/plotline-shots/s26/<tag> node E:/dev/tmp/s26/run.mjs src/trace/eval/sheets30.json <key>,<key> <tag>`
— the real Studio, one sheet at a time, 10-minute cap; count on the `-names.png` / quarter shots and the page text.
`E:/dev/tmp/s26/run.mjs` is the session-25 harness plus one step: it clicks Export after the trace and saves the unit the
founder now has as `<OUT>/<key>-floor.unit.json`. `SCORE30_BROWSER=<OUT> SCORE30_SHEETS=<key> SCORE30_PXPERM=<its pxPerM>
npm run score30` then scores that unit beside the node one and lists every room whose state differs (the browser's scale
comes from mouse clicks, so it is a few tenths of a percent off the exact one — `SCORE30_PXPERM` gives node the same).
