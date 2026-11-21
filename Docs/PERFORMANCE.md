# How fast the 3D is — and why (session 31, perf lane)

Plain words first, numbers after. Every number here was measured in Firefox on this office PC (an NVIDIA card Firefox
reports as "GeForce GTX 980, or similar"), headless, 1440 × 900 unless said, while other test runs shared the same card —
so one number moves by ±20 % from run to run; where two versions are compared they ran **side by side in one browser,
turn about**, and the tables give medians. **We still have no number from the founder's laptop.** To get one: open any
flat, **⋯ → How fast is it here?** (or add `?stats=1` to the address), walk round for a few seconds, press **Copy**, paste
it into a message. A frame of 16.7 ms is the screen's own 60 a second: smooth.

## What the smooth viewers do that we did not

Public three.js walkthroughs, opened in the same headless Firefox and read from their WebGL calls (draws and triangles each
frame, shader programs made, pictures uploaded) while the view is dragged round — nothing about Plotline is sent to them:

| scene | draws a frame (most) | triangles a frame (most) | shader programs made | pictures uploaded (largest side) |
|---|---|---|---|---|
| oaksun (vr-interior.oaksun.studio) | 69 (91) | 78 k (125 k) | 8 | 90 (8192 px) |
| twopixels-in (penthouse.twopixels.studio) | 335 (344) | 514 k (522 k) | 40 | 1073 (6408 px) |

The Two Pixels penthouse (read in its lift lobby, where its walk starts) is the other kind: 335 draws, half a million
triangles and 40 programs, and still a 13 ms frame here — draws alone do not make a viewer slow on this card. What both
share: no light at all in their shaders (light and shadow are painted into their pictures). A third
(modernstillness.nourtin.com) stayed on its start page in headless Firefox and is left out.

What they do, in plain words:
1. **The light is painted in, not worked out.** The Oaksun apartment (230 m², a real three.js walkthrough) draws its rooms
   with 8 shader programs in all and no lamp light in its shaders: the light and shadow of every room were worked out once
   in a 3D program and painted into its pictures (huge ones: up to 8 192 px a side). Plotline works the daylight, the sun's
   shadow and up to 12 lamps out live, every frame — that is what lets a buyer change the hour, switch the lamps and change
   a wall's paint, which a painted-in picture cannot do.
2. **Few, light pieces.** 78 thousand triangles a frame for a whole furnished 230 m² flat; the furniture modelled for the web
   (hundreds to a few thousand triangles a piece). Plotline's scans are photo-scanned pieces of 10–60 thousand triangles each.
3. **No extra passes.** No corner shading pass, no shadow maps redrawn, one picture size: their frame is one pass over few
   materials. Plotline's High adds the corner shading pass — 27 of a 44 ms frame at twice the pixels before this lane.

What this lane took from them (sections 3 and 4): Lite paints the lamps in (every lamp, no light in the shader), every piece
is a light copy of itself on Lite and Low, Lite keeps the colour picture only, and one batch per material for the flat — the
same few-programs, few-draws shape as theirs, while the buyer can still change the hour, the lamps and the finishes.

## 1. Walk on High: did it get slower? (the six commits since session 30)

Walk view, High, the walker in the living room turning a full circle; "ms" is the 3D's own draw, waited for until the card
has finished (the median of three turns). Lights = what every lit surface's shader works through each pixel.

| commit | flat | time | ms (median of 3 turns) | the 3 turns | draw calls | triangles | programs | lights |
|---|---|---|---|---|---|---|---|---|
| 930121b session 30 (main) | Type A 2 | 15:30 | 16.26 | 14.76 / 16.26 / 20.78 | 333 | 443 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 930121b session 30 (main) | Type A 2 | 21:00 | 14.62 | 14.34 / 15.32 / 14.62 | 333 | 443 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 930121b session 30 (main) | Sheltech A 3 | 15:30 | 16.44 | 15.16 / 16.44 / 22.56 | 330 | 755 k | 43 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 930121b session 30 (main) | Sheltech A 3 | 21:00 | 11.82 | 15.42 / 11.36 / 11.82 | 330 | 755 k | 43 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 104fd03 round 3 closed | Type A 2 | 15:30 | 40.28 | 40.28 / 36.8 / 43.84 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 104fd03 round 3 closed | Type A 2 | 21:00 | 22 | 21.06 / 22 / 24.56 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 104fd03 round 3 closed | Sheltech A 3 | 15:30 | 12.78 | 13.64 / 12.78 / 12.38 | 115 | 813 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 104fd03 round 3 closed | Sheltech A 3 | 21:00 | 12.6 | 13.84 / 12.6 / 12.06 | 115 | 813 k | 48 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 1563988 after stairflight | Type A 2 | 15:30 | 15.1 | 16.9 / 15.02 / 15.1 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 1563988 after stairflight | Type A 2 | 21:00 | 17.26 | 14.64 / 17.5 / 17.26 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 1563988 after stairflight | Sheltech A 3 | 15:30 | 11.92 | 11.9 / 11.92 / 12.1 | 117 | 813 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 1563988 after stairflight | Sheltech A 3 | 21:00 | 20.02 | 18.92 / 21.48 / 20.02 | 117 | 813 k | 48 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| e467d6d after kept | Type A 2 | 15:30 | 20.48 | 20.46 / 20.48 / 21.38 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| e467d6d after kept | Type A 2 | 21:00 | 28.7 | 24.16 / 42.32 / 28.7 | 118 | 686 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| e467d6d after kept | Sheltech A 3 | 15:30 | 13.44 | 12.38 / 13.44 / 18.08 | 117 | 813 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| e467d6d after kept | Sheltech A 3 | 21:00 | 12.44 | 12.46 / 12.44 / 11.78 | 117 | 813 k | 48 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 6db76bc after pick | Type A 2 | 15:30 | 17.36 | 25.66 / 17.36 / 12.74 | 118 | 686 k | 54 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 6db76bc after pick | Type A 2 | 21:00 | 18.24 | 15.44 / 18.24 / 27.28 | 118 | 686 k | 54 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 6db76bc after pick | Sheltech A 3 | 15:30 | 23.58 | 23.58 / 21.76 / 42.92 | 117 | 813 k | 47 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| 6db76bc after pick | Sheltech A 3 | 21:00 | 36.26 | 36.26 / 40.36 / 21.22 | 117 | 813 k | 48 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| bf84d8e after glow | Type A 2 | 15:30 | 14.32 | 21.54 / 13.64 / 14.32 | 91 | 551 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| bf84d8e after glow | Type A 2 | 21:00 | 13.32 | 13.32 / 13.76 / 12.9 | 91 | 551 k | 51 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| bf84d8e after glow | Sheltech A 3 | 15:30 | 12.14 | 12.96 / 12.14 / 11.44 | 87 | 548 k | 48 | 12 lamps (3 shadowed) + sun (shadowed) + sky |
| bf84d8e after glow | Sheltech A 3 | 21:00 | 11.68 | 13.22 / 11.36 / 11.68 | 87 | 548 k | 49 | 12 lamps (3 shadowed) + sun (shadowed) + sky |

Side by side in one browser (930121b = session 30's main, bf84d8e = after the glow lane), Type A floor 2, the median of
3–4 rounds each — the whole frame as Firefox makes it (no waiting for the screen), the 3D's own draw, and the frame while
walking with W / S:

| pixels | time | 930121b: frame / draw / walking (ms) | bf84d8e: frame / draw / walking (ms) |
|---|---|---|---|
| 1× | 15:30 | 20.9 / 16.58 / 14.48 | 17.86 / 19.68 / 18.62 |
| 1× | 21:00 | 19 / 23.8 / 20.06 | 20.44 / 19.34 / 17.28 |
| 2× | 15:30 | 49.86 / 68.78 / 67.06 | 61.28 / 57.54 / 50.7 |
| 2× | 21:00 | 41.6 / 50.58 / 52.04 | 52.56 / 45.66 / 43.98 |

**What it says:** on this machine no step of the six is slower in Walk / High beyond the noise, at the screen's pixels or
at twice them. What did change: draw calls 333 → 91 (the gpu lane's batches), triangles 443 k → 551 k on Type A (the
furniture batched in 8 m squares: a piece behind you in the same square is still drawn), shader programs 47 → 51, lights
the same (12 lamp spot lights, 3 with shadows, the sun with its shadow, the sky). From round 3 to the pick merge every view
with the scanned wall clock in it drew the whole flat twice (the clock's glass used three's "transmission": 118 calls and
686 k triangles against 91 / 551 k once the glow lane made it plain glass) — if the founder's slow walk was in those
builds, that was it, and it is gone. Taken back on top: the street, the blocks across the lane and the ground no longer
work through the 12 lamps on every pixel (they are indoors: they lit the block across the lane through the flat's own
walls) — commit 545bad6.

Batching on or off at twice the pixels, the same page (Type A, 15:30): 41.6 ms batched (91 calls, 551 k triangles) vs
42.1 ms one by one (238 calls, 374 k triangles) — on a card that waits on its pixels the batches cost nothing.

Each part of the High walk switched off and on again in the same page, twice the pixels, Type A at 15:30 (median of 3 rounds):

| switched | as it is (ms) | switched off (ms) | draw calls | triangles |
|---|---|---|---|---|
| the batches off (one draw per mesh) | 41.56 | 42.06 | 91 → 238 | 551 k → 374 k |
| the walls’ plaster cloudiness off | 41.96 | 41.48 | 91 → 91 | 551 k → 551 k |
| the corner shading strips off | 48.74 | 41.48 | 91 → 87 | 551 k → 545 k |
| the street and neighbours hidden | 47.98 | 49.9 | 91 → 87 | 551 k → 493 k |
| the corner shading pass (GTAO) off | 43.94 | 16.82 | 91 → 87 | 551 k → 551 k |

The strips, the plaster and the street are inside the noise (single rounds run 41–52 ms either way). The corner shading
pass is the one big cost of High: 27 of a 44 ms frame at twice the pixels — it was worked out for every pixel drawn, and
High draws a sharp screen's pixels twice each way.

Taken back for High on a sharp screen (commit b33c826): the corner shading is worked out at the screen's CSS pixels, not
at every pixel drawn. The same page at twice the pixels, Type A, switched back and forth (median of 3 rounds):

| time | every pixel drawn (ms) | the CSS pixels (ms) | rounds (before / after) |
|---|---|---|---|
| 15:30 | 54.6 | 38.24 | 56.1/45.3/54.6 / 38.2/26.6/42.9 |
| 21:00 | 42.84 | 26.72 | 55.3/42/42.8 / 28.9/26.7/26.1 |

And the whole lane's Walk on High at twice the pixels, the glow lane's tree (bf84d8e) and the final tree side by side in
one browser, turn about (the whole frame, median of 3 rounds): Type A 39.9 → 24.0 ms (15:30) and 40.4 → 24.8 ms (21:00);
Sheltech A 41.1 → 24.5 ms and 42.0 → 25.0 ms. The corner shadows look the same (`look/ao-dpr2-full.png` beside
`look/ao-dpr2-css.png`).

## 2. The building round the flat (the context lane) — its cost taken back

The context lane put the rest of the building round the flat in Walk and the Dollhouse (the founder asked for it; it
stays). Its own report named the costs: more draw calls in Walk (94 → 127 on Type A, 90 → 168 on Sheltech A), the
Dollhouse on Sheltech 200 → 420 draws (High), a stair's next floor waiting longer, more draws when the sun's shadow is
drawn again. What changed: round the flat the tower is drawn as one mesh per material once it has settled (each flat's
rooms stay their own mesh; commit dacf814); a stair's next floor waits for the other flats' rooms only — the grounds'
trees come in just after it shows, and the rooms' geometry is kept for the page; and in the Dollhouse every tree's leaves
of one kind in an 8 m square are one draw (Sheltech's ground drew ~150 bunches of leaves one by one). Two tries were taken
back on the way: laying the leaves out as plain leaves inside the tower's batches froze the page for 2–3 s just after a
stair's floor showed; one draw for the whole ground's leaves of a kind (per square: still) drew 1.2 → 3.2 million
triangles in Walk on High, where few trees are in sight and each is culled on its own — so Walk keeps the trees as they
were. The kept way copies only where each leaf stands (a few ms).

Before the context lane (bf84d8e), with it (363dd50), and now — each a separate run, the medians of 2 turns (Lite's "now"
is the run before the leaves change: Lite shows no trees):

| flat | tier | view | time | before: ms · draws (most) · triangles | with the building round it | now | sun-shadow redraw draws (with → now) |
|---|---|---|---|---|---|---|---|
| Type A 2 | lite | Walk | 15:30 | 5.76 · 78 (145) · 136 k | 3.78 · 96 (162) · 202 k | 5.44 · 76 (96) · 208 k | 0 → 0 |
| Type A 2 | lite | Walk | 21:00 | 5.46 · 78 (145) · 136 k | 5.98 · 96 (162) · 202 k | 5.76 · 76 (96) · 208 k | 0 → 0 |
| Type A 2 | lite | Dollhouse | 15:30 | 4.8 · 180 (180) · 282 k | 7.02 · 189 (189) · 295 k | 4.88 · 92 (92) · 164 k | 0 → 0 |
| Type A 2 | lite | Dollhouse | 21:00 | 6.62 · 180 (180) · 282 k | 6.36 · 189 (189) · 295 k | 5.74 · 92 (92) · 164 k | 0 → 0 |
| Sheltech A 3 | lite | Walk | 15:30 | 3.82 · 75 (160) · 122 k | 5.72 · 98 (184) · 211 k | 5.28 · 78 (104) · 220 k | 0 → 0 |
| Sheltech A 3 | lite | Walk | 21:00 | 5 · 75 (160) · 122 k | 5.54 · 98 (184) · 211 k | 5.42 · 78 (104) · 220 k | 0 → 0 |
| Sheltech A 3 | lite | Dollhouse | 15:30 | 6.46 · 176 (176) · 269 k | 7.06 · 191 (191) · 293 k | 5.14 · 100 (100) · 164 k | 0 → 0 |
| Sheltech A 3 | lite | Dollhouse | 21:00 | 6.66 · 176 (176) · 269 k | 7.2 · 191 (191) · 293 k | 5.16 · 100 (100) · 164 k | 0 → 0 |
| Sheltech A 3 | low | Walk | 15:30 | 5.6 · 78 (163) · 154 k | 8.5 · 135 (217) · 372 k | 7.88 · 105 (160) · 438 k | 127 → 69 |
| Sheltech A 3 | low | Walk | 21:00 | 5.92 · 78 (163) · 154 k | 8.8 · 135 (217) · 372 k | 7.9 · 105 (160) · 438 k | 127 → 69 |
| Sheltech A 3 | low | Dollhouse | 15:30 | 6.64 · 177 (177) · 269 k | 11.42 · 395 (409) · 836 k | 9.78 · 233 (241) · 781 k | 126 → 68 |
| Sheltech A 3 | low | Dollhouse | 21:00 | 6.64 · 177 (177) · 269 k | 11.14 · 395 (409) · 836 k | 9.66 · 233 (241) · 781 k | 126 → 68 |
| Sheltech A 3 | high | Walk | 15:30 | 11.52 · 87 (180) · 548 k | 13.76 · 147 (240) · 1055 k | 13.1 · 129 (216) · 1281 k | 386 → 323 |
| Sheltech A 3 | high | Walk | 21:00 | 12.04 · 87 (180) · 548 k | 14 · 147 (240) · 1055 k | 13.2 · 129 (216) · 1281 k | 577 → 518 |
| Sheltech A 3 | high | Dollhouse | 15:30 | 12.58 · 200 (200) · 1645 k | 17.1 · 421 (435) · 2355 k | 15.56 · 329 (337) · 2362 k | 506 → 481 |
| Sheltech A 3 | high | Dollhouse | 21:00 | 12.64 · 240 (411) · 2140 k | 17.5 · 469 (682) · 2882 k | 15.52 · 375 (573) · 2889 k | 502 → 479 |
| Type A 2 | low | Walk | 15:30 | 7.9 · 81 (148) · 189 k | 7.56 · 113 (179) · 328 k | 7.5 · 84 (106) · 449 k | 136 → 70 |
| Type A 2 | low | Walk | 21:00 | 7.88 · 81 (148) · 189 k | 7.48 · 113 (179) · 328 k | 7.42 · 84 (106) · 449 k | 136 → 70 |
| Type A 2 | low | Dollhouse | 15:30 | 6.66 · 181 (181) · 282 k | 7.78 · 198 (198) · 376 k | 6.72 · 99 (99) · 317 k | 135 → 69 |
| Type A 2 | low | Dollhouse | 21:00 | 6.78 · 181 (181) · 282 k | 8.6 · 198 (198) · 376 k | 6.32 · 99 (99) · 317 k | 135 → 69 |
| Type A 2 | high | Walk | 15:30 | 12.76 · 91 (159) · 551 k | 12.46 · 123 (190) · 690 k | 12.22 · 102 (166) · 744 k | 276 → 236 |
| Type A 2 | high | Walk | 21:00 | 12.9 · 91 (159) · 551 k | 13.22 · 123 (190) · 690 k | 12.54 · 102 (166) · 744 k | 512 → 468 |
| Type A 2 | high | Dollhouse | 15:30 | 12.14 · 203 (203) · 1152 k | 13.76 · 220 (220) · 1250 k | 11.64 · 196 (196) · 1250 k | 527 → 511 |
| Type A 2 | high | Dollhouse | 21:00 | 12.38 · 243 (441) · 1468 k | 13.6 · 264 (476) · 1600 k | 11.94 · 238 (444) · 1600 k | 490 → 474 |

A stair's first visits, Sheltech, High (the time from the click until the new floor shows, and the longest frame):

| trip | with the building round it: wait (ms) / longest frame | now |
|---|---|---|
| Up → Level 1 | 10425 / 520 | 7546 / 358 |
| Up → Floor 2 | 4280 / 435 | 3465 / 355 |
| Up → Floor 3 | 2990 / 268 | 1827 / 264 |

**Still above the numbers before the context lane:** Sheltech A's Dollhouse (High 200 → 329 draws and 12.6 → 15.6 ms;
Low 177 → 233 draws), Walk on High round Sheltech A (87 → 129 draws), a stair's first visits (before the context lane:
Sheltech's floors ~1.5 s, Level 1 5.6 s — now 1.8–3.5 s and 7.5 s), and triangles on every tier (the tower drawn in a few
big batches: a batch is drawn whole when any of it is in sight). Type A is back at or under its old draws and ms
everywhere. The sun-shadow redraw is below the context lane's on every row, and below the 351–371 draws it had before
the context lane in Walk by day; the Dollhouse and the night (the lamps' shadows) stay at 468–518.

## 3. The Building view — the glow lane's cost taken back

The glow lane's rooms behind every window cost High +1–1.5 ms in the Building view. The other flats' furniture is now baked
from stand-ins of about 500 triangles, and the tower takes none of the walked flat's 12 lamp lights (they lit the
neighbours' rooms through the walls). The pre-glow tree (6db76bc) and the final tree side by side in one browser, turn
about, the camera orbiting the tower once (median of 2 rounds):

| flat | tier | time | before the glow lane (6db76bc): ms · draws · triangles | now | rounds (before / now) | all furniture in after (ms, now) |
|---|---|---|---|---|---|---|
| type-a | lite | 15:30 | 10.22 · 381 · 889 k | 7.6 · 135 · 362 k | 9.7/10.2 / 7.6/6.8 | 4000 |
| type-a | lite | 21:00 | 10.16 · 381 · 889 k | 6.98 · 136 · 362 k | 10.2/10.1 / 7.0/6.9 | 4000 |
| type-a | low | 15:30 | 11.48 · 387 · 994 k | 8.44 · 146 · 825 k | 11.5/11.5 / 8.0/8.4 | 9979 |
| type-a | low | 21:00 | 11.8 · 387 · 994 k | 8.2 · 147 · 825 k | 11.4/11.8 / 8.2/8.1 | 9979 |
| type-a | high | 15:30 | 18.6 · 426 · 2742 k | 15.32 · 251 · 2161 k | 18.6/16.7 / 15.3/15.1 | 28662 |
| type-a | high | 21:00 | 16.92 · 470 · 3103 k | 14.9 · 296 · 2518 k | 16.9/16.7 / 14.9/14.4 | 28662 |
| sheltech-a | lite | 15:30 | 14.16 · 1051 · 2118 k | 13.08 · 433 · 974 k | 14.2/12.2 / 10.7/13.1 | 6025 |
| sheltech-a | lite | 21:00 | 14.26 · 1051 · 2118 k | 11.42 · 434 · 975 k | 12.6/14.3 / 11.4/9.7 | 6025 |
| sheltech-a | low | 15:30 | 13 · 1057 · 2182 k | 11.44 · 444 · 1382 k | 12.9/13.0 / 11.4/11.4 | 13948 |
| sheltech-a | low | 21:00 | 12.94 · 1057 · 2182 k | 11.06 · 445 · 1382 k | 12.7/12.9 / 11.1/11.1 | 13948 |
| sheltech-a | high | 15:30 | 25.18 · 1224 · 9038 k | 18.88 · 605 · 5110 k | 25.2/24.3 / 18.8/18.9 | 18703 |
| sheltech-a | high | 21:00 | 24.48 · 1300 · 9654 k | 18.94 · 681 · 5725 k | 24.3/24.5 / 18.8/18.9 | 18703 |

## 4. Lite rebuilt the way they do it

Lite now: every lamp's light painted into the rooms (no lamp light in the shader at all, every lamp lit — it lit the
2 nearest before), every piece a light copy of itself (at most about 1 500 triangles; a scan's copy made once per model, a
code-built piece's when it is built), the colour picture only, a scan's physical material a standard one, one batch per
material for the whole flat, every window pane in one batch. The budget asked: ≤ 120 draw calls, ≤ 300 k triangles,
≤ 20 shader programs, no shadow maps, no lamp lights, one environment map, pictures ≤ 512.

| flat | time | before: ms · draws (most) · triangles (most) · programs · lamp lights | now | budget met |
|---|---|---|---|---|
| type-a 2 | 15:30 | 6.42 · 78 (145) · 136 k (235 k) · 29 · 2 | 5.4 · 76 (96) · 208 k (228 k) · 31 · 0 | draws ✓ · triangles ✓ · programs ✗ 31 · no lamp lights ✓ · no shadow maps ✓ |
| type-a 2 | 21:00 | 6.1 · 78 (145) · 136 k (235 k) · 29 · 2 | 5.22 · 76 (96) · 208 k (228 k) · 31 · 0 | draws ✓ · triangles ✓ · programs ✗ 31 · no lamp lights ✓ · no shadow maps ✓ |
| type-b 3 | 15:30 | 5.58 · 70 (93) · 96 k (126 k) · 24 · 2 | 5.66 · 71 (88) · 180 k (191 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| type-b 3 | 21:00 | 5.6 · 70 (93) · 96 k (126 k) · 24 · 2 | 10.92 · 71 (88) · 180 k (191 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| type-c 3 | 15:30 | 6 · 75 (147) · 125 k (232 k) · 28 · 2 | 5.3 · 76 (96) · 207 k (222 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| type-c 3 | 21:00 | 6.38 · 75 (147) · 125 k (232 k) · 28 · 2 | 5.46 · 76 (96) · 207 k (222 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| sheltech-a 3 | 15:30 | 5.66 · 75 (160) · 122 k (248 k) · 28 · 2 | 5.28 · 78 (104) · 220 k (241 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| sheltech-a 3 | 21:00 | 5.7 · 75 (160) · 122 k (248 k) · 28 · 2 | 5.32 · 78 (104) · 220 k (241 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| sheltech-b 3 | 15:30 | 5.92 · 75 (150) · 120 k (235 k) · 29 · 2 | 5.06 · 73 (97) · 213 k (235 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |
| sheltech-b 3 | 21:00 | 6.72 · 75 (150) · 120 k (235 k) · 29 · 2 | 5.56 · 73 (97) · 213 k (235 k) · 30 · 0 | draws ✓ · triangles ✓ · programs ✗ 30 · no lamp lights ✓ · no shadow maps ✓ |

(Type B at 21:00 "now" was one noisy run: the next run on the same tree, with ~30 thousand more triangles, gave 5.1 ms.)
The time a frame was already small on this card before (5–7 ms); what Lite changed is the work a weak laptop pays for:
no lamp lights in the shader, ~30 % fewer pictures, the most draws in a turn down from 93–160 to 88–104. Triangles went up
(the flat drawn as a few big batches, and the floors just above and below from the context lane) but stay under the
budget's 300 thousand. **Shader programs did not meet the budget:** 30–31 against the 20 asked — the context lane's
building round the flat added its own (Lite had 24–29 before it); the rest are the rooms, glass, sky, street, contact
shadows and corner strips, each its own kind.

What Lite looks like now, beside High, the same view (Clean view, 15:30 and 21:00): the shots are in
`E:/dev/plotline-shots/s31/perf/look/` — `look-before-<tier>-…` before this lane, `look-final2-lite-…` and
`look-final-low-…` now, `look-final-high-…` High now (its look did not change); `living` = Type A's living room,
`bed` = Type A's Bed-2, `s-living` = Sheltech A's living room, `day` = 15:30, `night` = 21:00. By day Lite reads as
High without the sun patches on the floor, the corner shading and the fine relief of wood and fabric; at night every lamp
lights its room (it lit the 2 nearest before) with a soft, even light and no lamp shadows; the furniture has the same
shapes and pictures, but the light copies lose small things: a wardrobe's seam between its doors, the crisp edge of a
handle. Curtains look flat on Lite and Low with or without their pleated shape (the pleats show on High through its
corner shading), so they stay light copies too.

## 5. What is still slower than them, and why

- **The light is worked out live.** They paint light and shadow into their pictures once, in a 3D program; we work out the
  sun (and on Low / High its shadow), the sky and the lamps every frame, because a buyer changes the hour, switches the
  lamps and repaints a wall. Lite now paints the lamps in; the sun and the sky stay live on every tier. Painting the
  daylight of every hour in too would mean an atlas per hour (or a wide one per flat) — a bigger step, worth it only if a
  laptop's number says Lite is still slow.
- **Our pieces are scans.** Even the light copies keep the scans' pictures (one per piece: a sofa, a bed and a chair are
  three pictures, three draws); theirs share a few big painted pictures. Lite draws one batch per material — the
  furniture's count is its number of different pictures.
- **High adds a corner shading pass and up to twice the screen's pixels.** Now worked out at the CSS pixels (section 1);
  still the biggest single cost of High.
- **Shader programs.** Our rooms, glass, sky, street, contact shadows and corner strips each have their own (Lite 30–31,
  High 62–71); theirs are one or two kinds of material in all. The Oaksun flat makes 8.
- **The building round the flat** costs draws in the Dollhouse and time on a stair's first visit (section 2); Sheltech's
  ground with its many trees is the heaviest case.
- **Firefox pays per draw call** more than Chrome (each goes to its graphics process): one more reason the batches matter
  here, less in Chrome.
- **None of this was measured on the founder's laptop.** Every number is this PC's card with other runs sharing it. The
  stats card (⋯ → How fast is it here?) is how we get his.

## 6. The sun's shadow over the grounds and the road (session 31, shade lane)

**What changed.** Until now only the flat's own surroundings were in the sun's shadow picture: out of a window, in the
Dollhouse or the Building view, the lawn, the play area, the pool deck, the driveway, the road and the neighbours' walls
stood evenly sunlit at every hour. On High there is now a second, wide shadow picture over the whole site — 100 m round
the flat each way, from the street up 100 m, 2048 × 2048 (about 14 cm a point) — beside the flat's own sharp one: every
surface reads the sharp picture where it reaches (the flat stays exactly as sharp as before) and the wide one past it,
the two fading into each other over a hand's width so no seam shows. Low and Lite have no second picture: they draw and
cost exactly what they did.

**Why a second picture and not a painted-in ground.** Painting the ground's shadow in per hour (the way the daylight is
painted into the rooms) is also one picture read per pixel, so a frame costs the same either way — but the wide picture
is drawn by the graphics chip in one go whenever the hour changes (no wait, nothing to work out on the processor), it
shades the neighbours' walls and the tower's own front as well as the ground, and it follows anything that moves.

**How it was kept cheap.** The wide picture is read four times a pixel half a point apart (three's own way is five reads at
random turns, which left a fine grain on the facades; one read showed stair-steps), a face turned away from the sun
reads no shadow picture at all (its sunlight is 0 anyway), and while the hour is dragged the wide picture is drawn again
on every fourth frame only, and on the first frame the hour rests (it is the dearer redraw). Both pictures are still
drawn only when what they see changes, never while you just look or walk. It holds about 32 MB of graphics memory.

The wide picture on and off inside one page, turn about (on = this lane, off = exactly the tree before it), High, 1440 × 900,
15:30, the median of 6 rounds; "the 3D's draw" waited for until the card finished; "difference" = each round's on minus
the off just before it, their median (a card shared with other runs moved both):

| view | flat (floor 2) | the 3D's draw, off → on (ms) | difference (ms) | draw calls a frame | shadow redraw when the hour changes (calls) |
|---|---|---|---|---|---|
| Walk, living-room window, looking across | Sheltech A | 12.24 → 11.54 | −0.30 | 53 → 53 | 320 → 478 |
| Walk, Bed 2's window, looking down | Sheltech A | 14.42 → 14.22 | −0.18 | 127 → 127 | 320 → 478 |
| Walk, a window | Type A | 12.16 → 12.70 | +0.32 | 50 → 50 | 236 → 392 |
| Dollhouse, a full turn | Sheltech A | 16.26 → 16.42 | +0.36 | 330 → 330 | 315 → 471 |
| Dollhouse, a full turn | Type A | 13.46 → 15.46 | +1.56 | 196 → 196 | 232 → 386 |
| Walk, the hour dragged (a new hour every frame) | Sheltech A | 16.28 → 15.68 | +0.10 | 377 → 377 (median frame) | — |
| Walk, the hour dragged | Type A | 14.68 → 20.38 | +1.58 | 289 → 289 (median frame) | — |
| Building view, a full turn (its furniture all in) | Sheltech A | 19.76 → 19.90 | −0.24 | 627 → 627 | 1194 → 1743 |
| Building view, a full turn | Type A | 18.84 → 20.46 | +0.06 | 251 → 251 | 277 → 449 |

Within the budget the founder's brief set (≤ +1.5 ms a frame in Walk at a window, ≤ +2 ms in the Dollhouse): Walk
−0.3 to +0.3 ms, the Dollhouse +0.4 to +1.6 ms, the Building view within ±0.3 ms (8 rounds; single rounds of either jump by up to 10 ms
when another run takes the card). The draw calls of a frame are the same (the wide picture is not drawn
while you look); what grows is the redraw when the hour changes (+150 to +530 calls, once). Low and Lite: no change.
Shots, before | after side by side: `E:/dev/plotline-shots/s31/shade/final/pairs-*.png` — Sheltech A floor 2 at two windows
at 09:00, 12:00, 15:30 and 17:00, its Dollhouse and Building view at 15:30, Type A floor 2's Dollhouse at 09:00 and 15:30.
The old single picture also showed its own edge: past it the ground and the walls were lit, so a lit polygon of street
sat in the middle of a shaded one (Bed 2's window, 15:30 and 17:00); that edge is gone.
