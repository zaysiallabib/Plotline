# Plotline — manual (working notes)

A list of everything the tool can do today and where to click. Kept in plain words.
Rule: whenever a button, key or page is added, changed or removed, this file changes in the same commit.
Last checked against the code: 2026-10-05.

Plotline has three places:

- **The 3D view** — what a buyer sees. You walk through a flat or a level, pick finishes, leave notes.
- **The Studio** — where staff draw a plan over the plan picture.
- **The Building view** — the whole tower, floor by floor.

Two kinds of people:

- **Buyer** — can look, choose finishes, leave notes. Nothing else.
- **Staff** — can also move furniture, change doors and windows, and open the Studio.
  A browser becomes "staff" the first time it opens the Studio, or when you add `?staff=1` to the address. `?staff=0` turns it off.

---

## 1. Addresses

| Address | What opens |
|---|---|
| `/u/<name>` | The 3D view of a built-in flat or level. Names: `type-a`, `type-b`, `type-c`, `sheltech-a`, `sheltech-b`, `sheltech-ground`, `sheltech-l1`, `sheltech-b1`, `sheltech-b2`, `sheltech-roof`, `banani-ground`, `banani-b1`, `banani-b2`, `banani-roof`, `dmd-ground`, `dmd-b1`, `dmd-b2`, `dmd-roof` |
| `/u/preview` | Whatever you last sent from the Studio with **Preview 3D**. Only works in the same browser. |
| `/s/<code>` | A buyer link made with the Studio's **Share link**. Works anywhere. Needs the database (Supabase). |
| `/studio` | The Studio. |
| `/changes` | The staff list of everything buyers chose and wrote. Asks for the staff key. Needs the database. |
| `/` | Jumps to the first built-in plan (today that is Banani Basement 1 — see "Rough edges"). |

Extras you can add to the end of a 3D address:

| Add | What it does |
|---|---|
| `?staff=1` / `?staff=0` | Turn staff mode on / off in this browser |
| `?view=dollhouse` | Open straight into the dollhouse (seen from above) |
| `?view=building` | Open straight into the Building view |
| `?floor=5` | Show the flat on floor 5 |
| `?quality=low` | Lighter shadows for a slow computer |

---

## 2. The 3D view — everyone

**Start screen:** project, flat name, floor and size. **Enter** (button or Enter key) goes in. Below it: links to the other flats and levels.

**Buttons, top right**

| Button | Key | What it does |
|---|---|---|
| Walk | O (switches) | Walk inside at eye height |
| Dollhouse | O (switches) | See the whole plan from above with the roof off |
| Building | B | The whole tower. Only when the flat belongs to a tower. |
| Finishes | F | Opens the panel on the right: floor, wall, ceiling options. While it is open, clicking a floor, a wall or a ceiling chooses for that one room or wall |
| Comment | C | Click anything to leave a note on it |
| Share | — | Copies a link that opens with the finishes you chose |
| Enter VR | — | Only shows when a VR headset is connected |

**Top left:** the name and size of the room you are standing in. **Rooms** = a list; click a room to jump there.

**Moving in Walk**

- **W A S D** or the arrow keys — walk. **Shift** — faster.
- **Click a spot on the floor** — you walk there.
- **Double-click** (or the Enter button) — the mouse now turns your head. **Esc** gives the mouse back.
- You cannot walk through walls. You can climb steps and ramps. You cannot walk into a pool.

**Moving in Dollhouse:** drag to turn, scroll to zoom, right-drag to slide. Click a room's floor to drop into it (not while the Finishes panel is open: then the click picks that floor's finish).

**Finishes panel**

- **One room or one wall:** with the panel open, click a floor, a wall or a ceiling — in Walk or in Dollhouse. The panel's top block names it ("Bed-1 · floor", "Living room · north-east wall": the side of the room the wall is on, by the compass) and shows the options for it. Click one: only that floor or that wall changes — Bed-2 keeps its own floor, the other walls keep their paint.
  - For a wall: **This wall** or **The whole room** (every wall of that room, columns too). A wall is the whole straight wall you see, even where the plan has it in pieces.
  - **Same as the group** (for one wall: **Same as the room**) takes it back; it shows what that is. **Done** closes the block.
  - If the mouse is turning your head, press **Esc** first; a click then picks what is under the middle of the screen.
- Each block below is one thing you choose for a group of rooms (for example "Bedroom floors"). Click an option. Each shows its brand and the price difference. A room or wall with its own choice keeps it when the group changes.
- **Chosen for one room or wall** lists those choices; **undo** takes one back.
- **Options total** and **Reset to included** at the bottom. The total = each group's choice + each one-room / one-wall choice once, at that option's own price (not shared out by floor area). Reset also clears the one-room choices.
- **Share** puts the one-room and one-wall choices into the link too. On a buyer link each one goes to the change list under its room's name ("Bed-1 · floor: White marble"); taking it back is a row too ("Same as the group").
- Your notes are listed at the top. Click a note to walk to it. **Remove** deletes it.

**Notes (Comment):** press **C**, click the thing, type, **Save**. A numbered pin stays on it.

**Always on screen**

- **Sun slider** (bottom middle) — time of day, 06:00 to 18:00.
- **Small map** (bottom right, Walk only) — where you are. **M** hides or shows it.

**In VR:** hold the trigger to aim at the floor, let go to jump there. Thumbstick left/right turns you.

---

## 3. The 3D view — staff only

Three extra buttons appear top right: **Edit furniture**, **Edit openings**, **Edit plan**.

### Edit furniture

- **Click a piece** to pick it — also one you see through a window or a glass door. A click whose mouse slides up to 6 pixels is still a click: the piece is picked, never moved. **Drag** it (further) to move it — a drag on cushions, or on a TV standing on its unit, moves the piece under them. It turns red and tells you why if it cannot go there (outside the room, covers a window, overlaps another piece). Doors, passages and the entrance are NOT kept clear (founder, 2026-10-13): put a piece where you like — the same in the Studio's F tool.
- **Drag a dot** on a piece to make it bigger or smaller (only pieces that can stretch).
- **Curtains** are a piece of their own, hung on their window (since 2026-10-14). Click them: "Curtains" shows. **Drag** them (or **G**) and they slide along their own wall only, in 3-inch steps, and stay their window's: move or resize the window later and they follow it. They cannot be pushed into another pair (red: "Overlaps the curtains"). **Del** takes them away; **Undo** brings them back. **Add → Bedroom** (or Living) **→ Curtains**, then point at a window: a new pair hangs on it, sized to it. They are as wide as their window plus up to 15 cm past each side (less where a side wall or the next window is closer), floor to ceiling, drawn open: one gathered panel at each side, over the edge of the glass.
- Buttons in the small panel, bottom left: **Add**, **Turn 90°**, **Delete**, **Undo**, **Reset layout**.
- Keys: **R** turns · **Del** deletes · **Ctrl+Z** undoes · **Esc** lets go.
- **G** — picks up the piece under the mouse (also through glass) without opening Edit furniture; **G** again puts it down.
- **Add** opens the library: Living, Dining, Bedroom, Kitchen, Bath, Lights & AC, Greenery, Outdoor, Lobby & gym, Decor. Pick one, point at the floor, a wall or the ceiling, click.
- Saved in this browser only.

### Edit openings (doors, windows, sliding doors, open passages)

- **Click one** to pick it. **Drag** it along its wall. **Drag a dot** to change width, height, or a window's sill.
- Panel, bottom left: change its kind (**Door / Window / Slider / Passage**), type **Width / Height / Sill**, **Delete**, **Undo**.
- A window's curtains go with it: move or resize the window and they follow; delete it and they go. (The old **Curtains** tick box is gone — delete the curtains themselves in Edit furniture.)
- The change is written into the Studio drawing too, so plan and 3D always agree.
- On a built-in flat it first asks to make that flat your Studio drawing (this replaces the drawing you had there).

### Edit plan

Opens this flat or level in the Studio, in a new tab.

---

## 4. The Building view

- **Floor buttons on the right**, top to bottom: **R** (roof), the flat floors by number, **G** (ground), **B1**, **B2**. Your own floor is underlined.
- Picking a basement hides everything above it.
- **Walk this level** (bottom middle) — shows when the picked floor is a ground floor, basement, rooftop or common floor. Click to walk it.
- **Click a flat** to open it.
- Drag to turn, scroll to zoom.

---

## 5. The Studio

You draw over a plan picture. The order is written on the right under **Steps**: load the plan → set the scale → trace walls → wall thickness → openings → rooms → check → export.

### Top bar

| Control | What it does |
|---|---|
| Unit name, Project, Floor, Area | Plain fields saved with the drawing |
| ⏱ | How long you have been tracing |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Auto-trace | Tries to draw the flats for you from the picture. While it shows "Point at a flat": click inside ONE flat to trace that flat, or press **Whole floor** (in the same box) to trace every flat of the floor and the lobby, stair and lifts between them in one go. It does not understand ground floors, basements or rooftops. |
| Import | Opens a saved drawing file (Ctrl+O). In a project it goes into the drawing open now. |
| Export | Saves the drawing as a file (Ctrl+S). After an Auto-trace the file also holds the Check these rows, each with its picture box and its answers (see "Check these") |
| Export answers | Saves, as a file (`plotline-answers.json`), every Check these answer you clicked in this browser: which sheet, which row, which button, when. It is the record an AI helper will later be tested against |
| Preview 3D | Opens your drawing in the 3D view, in a new tab |
| Building | Shows / hides the list of your project's floors on the right; with no project open: start one (section 6) |
| Share link | Makes a buyer link and copies it. Asks once for the staff key. Needs the database. |
| Change list | Opens `/changes`. Needs the database. |

**Loading the plan picture:** drop the picture on the Studio, or click **Choose plan image…** (PNG, JPG or WEBP, up to 10 MB).

### The tools (letters on the left; press the letter to pick the tool)

Every tool except **V** and **S** stays locked until the scale is set. A drawing that already has walls (a built-in level, a drawing file you opened) is in real sizes already: its tools are open at once.

**V — Select**
- Click a corner, wall, opening, room name or column to pick it. **Shift+click** picks several.
- Drag to move. **Shift** = no snapping.
- Drag the end of a picked wall to make it longer or shorter. **Alt** = the walls joined to it follow.
- Double-click a wall to type its length.
- The numbered marks on the plan (problems) can only be clicked with this tool.

**S — Scale**
- Click both ends of a size printed on the plan, then type that size (`14'-5"`, `14.4` or `4.4m`).
- **No size printed** (ground floors, basements, rooftops)? Click both ends of anything whose real length you know and type it: the plot's width from the land papers, a parking bay (about 8' wide, 16' long), a single door (about 3'-3").
- **Line a picture up with a drawing that has no picture under it** (a built-in Banani / dmd level, a drawing file opened without its picture): drop the picture on the page, press **S**, then 4 clicks — a corner on the picture, the same corner in the drawing; another corner far away on the picture, the same corner in the drawing. The picture jumps under the drawing at the right size, a message says **Done**, and you are back in Select. Wrong? **Undo** (Ctrl+Z), press S and do it again. The picture must be the same way up as the drawing.
- Once a drawing has its picture under it, **S** is the plain scale tool again (two ends of a known length, type it) — also after you have drawn walls. It changes the size the picture is read at; walls already drawn keep their typed sizes and no longer sit on the picture, so set the scale BEFORE tracing. A door or a drawn car as the known length was 4–6 % off in our test: the plot's width from the land papers is the one to trust.
- The five Sheltech levels (ground, basements, level 1, rooftop) open with their plan picture already behind them.

**W — Wall**
- Choose what to draw: **Wall**, **Low wall**, **Kerb**, **Zone line** (keys 1–4).
  - *Low wall* — a boundary wall, parapet or railing; type its height.
  - *Kerb* — a 6-inch edge, as round a planter.
  - *Zone line* — an invisible line that only separates two areas (lawn from driveway).
- Click corner after corner. Click the first corner again to close the room.
- **What the cursor sticks to** (the status bar says which): a corner, a wall's centre line ("wall — will split"), a column (its centre, corners and sides: "column"), and the two sides of a thick wall ("wall face"). Corners and centre lines pull from 7 screen pixels, columns and wall faces from about 5. **Shift** = no sticking. Snapping to a centre line is offered, never asked for: a wall may meet a column or another wall off-centre.
- **Walls that touch are joined — no gluing pieces needed** (founder 2026-10-09: "pillar or not, a wall touches another wall, that is it, it is a box"):
  - A wall that touches a **column** — on its side, its edge, its corner, or ending inside it — closes the room there. The room goes round the column (its area leaves the column out). No "loose end" mark.
  - A wall that stops on **another wall's face** (from either side, square or at an angle) is joined to it: under the hood it runs on to that wall's middle line. You still see and click ONE wall.
  - A wall end put down **a little short** of a wall or a column — up to 6 inches, or as much as that wall is thick — is carried on to it along its own line when you click it down, when you drop a dragged end, and by Join walls (also after Auto-trace and when a drawing is opened). Further than that it stays where you put it.
- While drawing, **type a number** to set the exact length; **Tab** switches to the angle.
- **Backspace** removes the last piece. **Esc** stops.
- **T** switches thin wall (5") / thick wall (10").

**O — Opening**
- Choose: Door 2'-6", Door 3'-0", Window 4', Window 6', Slider 6', Slider 8', Passage (keys 1–4 for the kind), or **Glass wall**.
- **Glass wall**: click a wall and all of it becomes glass, floor to top. For glass on only part of a wall, drag the glass's end shorter, or first split the wall (W, click on it).
- Point at a wall — a preview shows what you will get — click.
- Kerbs and zone lines do not take doors or windows.
- With a door picked: **H** flips the hinge side, **Shift+H** flips which way it swings.
- **Curtains**: a window or sliding door in a bed, living, dining or study room gets a pair of curtains by itself when the other side is outside (a veranda, a shaft, open air). A glass wall never gets them. They are a piece: change or delete them with **F** (below) or Edit furniture in 3D; they follow their window when you move or resize it, and go when you delete it. A window switched off with the old tick box (drawings made before 2026-10-14) keeps none until you add a pair from the library.

**R — Room**
- Click inside a closed room. A small box opens: **Room name**, **Kind** (guessed from the name), **Printed size** (type what the sheet prints there, e.g. `12'-0" × 14'-2"`; leave it empty if the sheet prints none — the tool never fills it in for you, so the size check in "Check these" is always sheet against drawing, and a size you type gets its own size row there when the room does not match it; it accepts the room when either its main rectangle — the biggest rectangle that fits inside it, door recesses and nooks left out — or its whole outline matches what the sheet prints), **Floor level**, **Ramp** (tick it, type the level at the far end, pick the direction).
- **Save**, or **Remove** to take the name off.
- **Clicked where no closed room is?** R looks only at the room around your click. If one wall end there stops a little short (the same reach as in W — Wall), R joins it (one Ctrl+Z undoes it) and opens the name box. Otherwise it says which wall end keeps this room open, how far short and where, and rings it: "Not closed yet: the wall end 2'-3" up-left of your click (ringed) stops 0'-7" short of the wall ahead — drag its end onto that wall". If no wall end nearby would close it: "a wall is missing. Draw it with W." A loose wall end somewhere else (a stub beside the ODU) is never the reason and is never ringed.

**C — Column**
- Click = a standard column. Drag = a column of the size you drag.
- **Pick a column** by clicking anywhere on it — also where a wall runs through it (with V, or with C).
- **Size it with the mouse**: a picked column shows eight dots. Drag a **side** (its middle dot or anywhere along it; the pointer becomes a double arrow) to move that one side — the other side stays. Drag a **corner** to move two sides. It sticks to walls and corners as a corner does, in whole inches. The Width / Depth boxes on the right are only for typing an exact size.
- Walls stick to a column's sides, corners and centre. A wall that touches a column anywhere closes the room there (see W — Wall).

**F — Furniture**
- Click a piece, drag it, click where it should go. **R** turns it. **Del** deletes. Arrow keys nudge it.
- **A click selects the piece under the mouse** — the one drawn on top: a wall cabinet or a hood over its counter, cushions over the sofa. A thin print or a wall TV is picked when you click within a few pixels of its line. A click whose mouse slides up to 6 pixels is still a click: the piece is selected, never moved. Drag further and the piece is in your hand; a drag on cushions or a TV standing on its unit moves the piece under them.
- **Curtains** show as a thin strip along their window: click one, drag it along its wall, **Del** removes it. **Pick from the library… → Curtains**, then click beside a window: a pair hangs on it.
- **Pick from the library…** adds a new piece (same library as the 3D view).
- **Reset to preset** puts one room back to the automatic layout; **Reset all** does every room.

**Hold instead of switch:** hold **W**, **O** or **R**, use the tool, let go — you are back on the tool you had.

### Flats in a whole-floor drawing

**Auto-trace does it for you (2026-10-09, Level 4).** Press **Auto-trace**, wait for "Point at a flat", then:
- **Whole floor** (button in the box at the top of the plan): every flat on the sheet and the shared lobby, stair and lifts, in one draft. Each flat comes out tinted and named: by its printed type when the sheet has one ("TYPE-A ±2736 SFT" → **Type A**; Sheltech L2's red TYPE-B is read too), else **Flat 1, Flat 2, Flat 3** from west to east. The lobby, stair and lifts are in no flat. Sheltech Level 2: Type A + Type B + the core. BTI 2nd floor: three flats (the big one and the two small ones above it).
- **Click inside one flat**: that flat alone. Wherever in the flat you click (its living room, a bedroom, a toilet) you get the same flat — Auto-trace finds the floor's flats first and hands you the one you clicked in — and it never takes a room of the flat next door. Everything it traced is ONE flat (all its rooms carry that flat's name, so a door it did not find does not split it in two); the lobby, stair and lifts stay out.
- The **room count** in Check these is per flat: "Type A: 13 of the 14 room names read on it are closed and named — missing: Ver. Its closed rooms add up to 1795 sft; the printed flat area gives about 2408.", one line per flat. Each room row says which flat: "Type B: Ver is open — no closed room around its name". A room you close or name from a row (Close it, Name it) goes into that flat.
- A room you draw later next to a traced flat joins it through its door, low edge or zone line. A whole new flat you draw by hand next to a traced "Flat 1" is also called "Flat 1" and joins it: pick **New flat** for one of its rooms to part them.

When a drawing has its rooms named, the Studio finds its flats by itself — nothing to type:
- Rooms joined by a **door, an open passage or a sliding door** are one flat (a zone line joins too). A window joins nothing.
- The **lift lobby, stairs, lifts, shafts**, gym / community / guard rooms and outdoor areas are shared: they belong to no flat, and a flat stops there. (It knows them by their kind, or by a name with Lobby, Stair, Lift or Hoistway in it.)
- A group of rooms counts as a flat when it has a bedroom and at least one more room.
- Each flat is **tinted in its own colour** and its name is written once above it. The shared rooms, and rooms in no flat, keep the plain light wash.
- Names: **Flat 1, Flat 2…** from west to east (left to right on the plan). To use the sheet's names: **R**, click inside one of the flat's rooms (where the sheet prints "TYPE-A ±2736 SFT"), type **Type A ±2736 sft**, **Save**. That name names the flat "Type A", not the room — the room keeps its own name. Click it (V) and the panel shows the check: "Names the flat Type A: its 17 rooms add up to 1857 sft, printed ±2736 sft".

**A room in the wrong flat** — with **V** (Select), click the room's name on the plan. In the panel, **Flat** lists the flats: pick the right one and its colour follows at once. **Not in a flat** takes a room out (say, a lobby that was not called Lobby, so it joined two flats into one). **New flat** starts another flat with just that room. A room moved by hand says **Flat (moved by hand)**; **Back to: by its doors** undoes that. **Ctrl+Z** also undoes it.
- A room moved by hand no longer joins anything through its doors — if that leaves a room next to it untinted, move that one too.
- An untinted room inside a flat usually means its door is missing (add it with O — the 3D needs it too) or it has no door at all (a planter behind a low planter edge, a light well behind a window). Add the door, or pick the flat for it.

### Other keys and the mouse

| Key / mouse | What it does |
|---|---|
| Ctrl+D | Copies the picked walls |
| Del | Deletes what is picked |
| Arrow keys | Nudge 1 inch (Shift = 1 foot) |
| 0 | Fit the whole plan on screen |
| Mouse wheel | Zoom |
| Space + drag, or right-drag | Slide the plan |
| Esc | Cancel / close / unpick |

### The right-hand panel

- **Steps** — the checklist. It ticks itself; you cannot click it.
- **Selection** — the details of what you picked, to type exact values:
  - *Corner* — position.
  - *Wall* — its type (Wall / Low wall / Kerb / Zone line), width, height, **Stands alone** (a screen or decoration wall that is not meant to close a room), length, copy, delete.
  - *Opening* — kind, width, height, sill, distance from each corner; for doors, hinge side and swing.
  - *Column* — width, depth, delete.
  - *Room name* — name, kind, **Flat** (which flat of the drawing it is in — see "Flats in a whole-floor drawing"), printed size, floor level, ramp.
- **Check these** — after Auto-trace: the things it was unsure about. Each has fix buttons and **Looks right**.
  - **The room count** (the orange line at the top): "5 of the 8 room names read on the sheet are closed and named — missing: Bed 4, Bed 2, Ver", then what the closed rooms add up to against the printed flat area. It counts the room names Auto-trace could READ inside the traced flat (not the next flat's); a name it missed is not in the count — its room shows as an "Unnamed space" row instead. Auto-trace reads every word it could not make out a second time on a closer view, and reads every closed room it found no name in as a whole, so far more names come through (Sheltech L2 Type A: 14 names read, was 8). A name printed on a room's edge or in its door nook names that room, and so does a name standing inside a room that only closed when the walls were joined — no row for those. Guessed names ("Toilet 3" from a drawn WC) and "Space N" are numbered west to east, the same every time you trace the same sheet, and a guessed name never takes the number a printed room already carries. The flat's "TYPE-A ±2736 SFT", when it is printed inside a closed room of the flat, is put on the drawing as a label that names the flat (the tint then reads "Type A"); printed in an open foyer it is not — add it with R. The flat area is taken from a "TYPE-A ±2736 SFT" printed inside the flat, else from the sheet's title block (2026-10-14): one flat on the sheet — the one area figure printed beside or under it ("TYPE A 2279 SFT", "Unit A 1365 sft", "2023 SQT (Approx.)"); two or more flats — only when the sheet prints exactly one figure per flat, given west to east (or top to bottom); a title naming two figures ("2703 SFT & 674 SFT", BTI 2nd floor) goes to no flat. When none is read it says "no printed flat area was read on this flat" rather than use another flat's — and the top-bar area box then shows the closed rooms' total: type the right figure there. The line changes with every fix and says "All … are closed and named" when none is left. Because only the names it READ are counted, "all 9 … closed and named" could show on a flat with half its floor missing; now, when the closed rooms add up to less than 70 % of the printed flat area, the line says so in orange (2026-10-14): "… But its closed rooms add up to only 524 sft of about 1150 — the sheet prints more rooms than were found."
  - **One row per missing room**, first in the list, saying which room and where. Click the row and the plan goes to it. Its button:
    - **Name it Toilet 1** — "Space 4 — printed name Toilet 1 is 0.6 m away": the unnamed room next to (or under) the printed name gets that name, kind and printed size.
    - **Close it — zone line / railing / carry N walls on** — "Veranda 1 is open — no closed room around its name" or "Ver shares Bed 2's room — no wall between them": draws the one missing line along the sheet's lines (a railing — a low wall — on a veranda's open side; a zone line, which shows nothing in 3D, anywhere else), or carries the loose wall ends around the name on to the wall ahead, and names the room. The faint line on the plan shows what it will draw before you click. It picks the closing that gives the room nearest its printed size (the smallest, when no size was read). If the line is really glass or a wall: click it, pick Wall in the panel, then O → Glass wall.
    - **Show me** — nothing closes it in one click (no walls were found around that name): the plan goes there and the Wall tool is picked. Draw its open sides (keys 1–4: wall, low wall, kerb, zone line); once it is closed the row offers **Name it**.
  - **Unnamed space (5.8 m²) rows** — a closed room with no name read (also one left with no label at all): **Name it** opens a box on the plan, type the name you read on the sheet, Enter. **Join it to Dining** takes out the thin wall between it and that room (only offered when that leaves no new problem) — use it for a strip that is really part of the room beside it, not for a room whose name was just not read.
  - Every fix is one Ctrl+Z.
  - **What a row keeps, and your clicks kept as a record** (2026-10-15, so an AI helper can later answer rows the way you do — none is switched on). Every row is saved with the drawing (in this browser, and in the Export file) together with the **picture box** around it — the piece of the plan picture an AI would be shown: the row's spot, what it is about and what its buttons would change, with about a metre around it so the walls show — and its **answers**: the same buttons you see (Close it, Join it to …, Make it a wall, Take it out, Show me, Looks right), each with a fixed name. A row's buttons do exactly what they did; after any edit the row's answers are worked out again on the plan as it is now. **Every answer you click is kept as a record**: the sheet (file name and size), the row's text, the button and the time, added at the end of a list and never changed afterwards — Looks right and Show me count as answers too. **Export answers** in the top bar saves that list as a file. Auto-trace also keeps where the print it could not use stands — a word it read as a room but did not trust, a room's size it could not read, the spot over a size where no name came out — and which way to turn each one to read it upright; only their places are kept (no pictures), one list per sheet. Typing a name with Name it is not kept as an answer yet.
  - **Sizes in a table beside the plan** (2026-10-14). Many brochure sheets print the room sizes in a list beside or under the drawing ("SUITE 1   13'-4" x 14'-0"", or a numbered legend "01. LIVING 10'-00" x 09'-06"" with only "01" in the room). Auto-trace finds such a list (three or more rows of a room name and a size, one under the other, away from the walls) and the floor-stack chart (19 … 01, G, B1): it never traces walls in them and never counts their words as rooms of the flat. Each row's size goes to the room of the same name on the drawing (the number's room for a numbered list), exactly as if it were printed in the room — the size row then checks it. A size it cannot read for sure is not used. A row whose name is on no room of the drawing becomes a Check these row: "Table says Suite 2 is 14'-0" × 11'-6" — no room on the plan carries that name": name that room with R and type the size.
  - **What Auto-trace draws that is not a wall** (2026-10-09). It draws a non-wall edge only where the sheet clearly shows one, and only where the room it closes then matches the size printed in it:
    - **Glass front** — two or three thin lines running side by side (a window's frame and pane, as Sheltech and BTI draw their big glazing) become a **glass wall**: a wall that is all window, from the floor to its top — the same thing O → Glass wall makes. A glass band in the sheet's blue counts too.
    - **Railing** — ONE thin line across the open side of a room printed VER / Veranda becomes its railing: a 1.1 m **low wall** (beside a planter's green: a 0.45 m kerb). The line is kept where it is drawn (the building's outer line), so the veranda keeps its printed depth.
    - **The check** — each one is weighed against the printed size of the room it closes (the room passes when its main rectangle or its whole outline is within 6" of the print): then no row asks about it. Off by more than 1 ft: it is not drawn, and the room stays open with its "… is open" row (Close it / Show me). In between, or when the room's size was not read: it is drawn and its row asks ("Traced as a 1.1 m low wall … Check", "Glass front traced as glazing floor to top … Check").
    - **To change one**: click it with V. A railing is a **Low wall** in the panel (pick **Wall** for a full wall, type another height, or Del). A glass front is a wall carrying one **Window** as long as the wall with sill 0: click the glass to change its kind, sill or height, or Del it to leave a plain wall.
  - **Closing a room that is still open** (2026-10-15). When a printed room name stands in no closed room — or shares one with another printed name — Auto-trace tries to close it with as few guessed pieces as it can, each one drawn only where the sheet shows why:
    - **A door in a gap** — a wall that stops at a door's width (2 ft to 6 ft) short of the wall ahead, with nothing drawn in the gap (the door's swing not drawn, or drawn so lightly it was missed): the wall line goes on with a **door** in it (wider than 3'-7": an open **passage**) — never a solid wall.
    - **A glass wall** — two or three thin lines side by side across the open side: a wall that is all window, floor to top.
    - **A low wall** — one thin line across the open side of a veranda / balcony / terrace: its 1.1 m railing.
    - **A zone line** — nothing drawn, only between open-plan spaces (living, dining, foyer, family living, an open kitchen): an edge with nothing in 3D. Never for a bedroom, toilet or veranda, and only where the room's printed size was read.
    - Short corners the drawing left open (under 1'-8") are joined with a piece of wall.
    - **Kept only when the room is right**: the name's room is closed, holds no other printed name, its size is within 1 ft of the size printed in it (when no size was read: only a door, glass wall or low wall, at most three pieces, and a size that kind of room can have), no room that was already closed changes, no small nameless space is cut off, and nothing is drawn from or onto furniture (a table's edges, a bed's headboard line). Otherwise nothing is drawn and the room keeps its "… is open" row.
    - **Each room closed this way gets one row** in Check these saying what was drawn and asking: "Drew a 2'-10" door in the gap (no door swing is drawn there) to close Toilet — no printed size was read to check it. A door, or open?", "Drew a glass wall 6'-5" along the double line to close Veranda 02 — no printed size was read to check it. Right?", "Drew a wall carried on 1'-6" and a zone line 9'-0" (open plan: nothing in 3D) to close Dining Space — it then matches its printed size. Right? Select a line to make it a wall, glass or a low wall". Click the row to go there. Its buttons answer it in one click: **Make it a wall / Make it a low wall / Make it a zone line**, **Make it open (no door) / Make it a door**, **Take it out** (the room opens again) — or **Looks right**. The same buttons now come on Auto-trace's other rows about one guessed piece ("Traced as a 1.1 m low wall … Check", "Passage 3'-1" wide? …"). Ctrl+Z undoes any of them.
    - On the 30 test sheets this took the rooms closed and named right from 205 to 254 of 522 (39 % → 49 %); on White Lake 3rd floor both flats now come out with all 12 read names closed and named. Most rooms still open are rooms whose printed size Auto-trace could not read (a zone line needs it) or whose walls it hardly traced (§10).
    - **A size read unsure checks a room too** (2026-10-15, step 5A). A printed size Auto-trace could not read for sure (it then asks you to type it) — or a size in the table beside the plan whose row names no room of the drawing (TERRACE in the list, VER in the room) — is used only where the room it closes comes within 1 ft of it on both sides: two readings agree. Then a zone line may close an open-plan room, and the row says so: "Drew a zone line 13'-6" (open plan: nothing in 3D) to close Dining — it then matches its printed size as far as the size could be read (check it)". Type the size to be sure.
    - **More ways to find the missing side, each kept only where a printed size checks the room**: where the printed size puts the side, measured from the wall across the room; the first line drawn across the floor; two open sides at once (a veranda between two walls: its glass door on one side, its railing on the other); and a **veranda drawn as a box of thin lines against the room's outer wall** — low walls (its railing) on its three sides at its printed size, with a short jog onto a wall that stops just short of the box. The room's name must stand near the middle of what is closed.
    - On the 30 test sheets (2026-10-15, after step 5B): 385 → 396 of 522 closed and named right (73.8 % → 75.9 %); Sheltech Siddiques 6 → 9 of 14 (Dining with a zone line, Bed 2 and the Ver beside the dining), Ixora both terraces, Sapphire, Azmary 11 → 13. Still open: rooms whose drawing does not match their print (Water Lily's verandas are drawn 5'-9" wide but printed 8'-0"; its Bed 3, Living and Dining likewise) — they keep their row; and rooms whose size was not read at all.
    - **Walls that stop just short, and open-plan rooms side by side** (2026-10-15, step 6B). A wall that stops up to 40 cm before the line it should meet — beside a column the drawing shows only in grey, at a door jamb — is carried on to that line with a short jog onto its end, when the room then matches its printed size (Gladiolus Parent's Bed, La Montana B Dining, Ixora's two Living - Dining rooms). A piece that would end a few centimetres inside another wall's window runs straight onto that wall's end instead (Hermitage's toilet). When an open-plan room (dining, living, foyer) closes at its printed size but another open-plan name still stands in the same space — Dining with Family Living beside it (Accept Aftabnagar) — a second zone line splits them. Each room closed this way keeps its one row, e.g. "Drew a zone line 11'-9" (open plan: nothing in 3D) and a zone line 8'-2" (open plan: nothing in 3D) to close Dining — it then matches its printed size. Right?", with Make it a wall / Make it a low wall / Take it out / Looks right.
    - On the 30 test sheets (2026-10-15, after step 6A): 410 → 421 of 522 closed and named right (78.5 % → 80.7 %); no room that came out right before was lost. Still open: rooms whose drawing does not match their print (Water Lily), rooms whose size was not read at all (Sapphire's Dining & Living, Magnifico's Foyer / Formal Living / Dining), and a toilet or veranda inside a bigger space with nothing drawn between them (Phera's toilet, Hermitage's small veranda, where a window was traced over the column).
  - **Walls that stop short**: a wall end that stops before the wall ahead (up to 4 ft) is carried on to it when the sheet shows the same thing in between — the wall's dark band, a window's pane lines (then it is a window there), a railing's line — or when the gap is under 1 ft (no door is that narrow). A gap with nothing drawn in it stays open, with its row.
  - **Two printed names in one closed space** (2026-10-15): the larger printed room names it (a 22 m² space holding PARENT'S BED and TOILET is the bedroom, not "Toilet"); the room rows still say which name has no room of its own. **A name read in pieces along one line** — "DINING", "AMILY" with the size under it, "f LOUNGE" — is one name, its kind as the whole reads (Dining Family Lounge: a dining room); so is "BED" beside "-04/HOME OFFICE" (Bed 04/Home Office: a bedroom). **A size table read with two rows on one line** ("SUITE 3 LIVING & DINING 110" x 1311" 267" x 140"") is split into its two rows, and a table size whose foot marks were all lost ("82" x 120"" = 8'-2" × 12'-0") is read.
  - **Spaces cut off by a line that is no wall**: a space with no name of its own, cut from a named room only by an open-plan line or a thin line (a counter, a wardrobe front, a beam line), is part of that room (the 2026-10-03 rule: an unread space joins the room beside it). Since 2026-10-15 also a space under 4 m² with no name of its own that is split off a named room by a drawn line with no door in it, when the room only matches its printed size together with it — a shower area behind its curtain line, a veranda's planter box at its end. Since step 6B the space behind the line may be of any size when the room only matches its printed size together with it (the name was cut off in a strip of its own), and where no size was read a low wall (under 1.2 m — a tile line or a rug's edge read as one) across a bedroom, bath or kitchen is taken out (Sapphire's bedroom). Words of fittings printed on the plan (WASHING MACHINE, FREEZER, FRIDGE, a beam note) and stray strokes read as letters do not count as a name. Lifts read as "LIFT PIT" or "STRETCHER LIFT" are kept out of the flat like the lobby and stairs, and the core's walls left hanging off the flat go with it.
  - **What Auto-trace leaves out as furniture** (2026-10-15). Furniture is not building:
    - **A column is only a dark block that a wall runs out of** (a wall's band, a hollow wall's two lines or a window's lines leaving one of its sides for at least 40 cm). A dark block standing in the floor — a chair, a sofa, a bedside table — is never a column.
    - **A closed piece of drawing that touches no wall** and fits in about 3 × 3 m — a bed, a sofa, a dining table with its chairs, a chair, a WC, a box around a printed area like "TYPE-C ±1362 SFT" — is never read as a wall or a room. Furniture drawn against a wall (a bed's head on the wall) is still seen; a piece that holds a wall's band (a short wall with a basin hung on it) is kept as wall.
    - **Hatch** — four or more thin lines close together (a wardrobe's hangers, shower tiles, a floor's planks) — is never a wall.
    - **A narrow strip with no name** closed by a thin line, no deeper than 75 cm and at least twice as long — a wardrobe, a kitchen counter, a vanity, a shoe cabinet — is not offered as an AOD; it stays part of its room.
    - Your picture is not changed; the furniture is only left out of what Auto-trace draws. On the 30 test sheets (2026-10-15) this took the small rooms that are not printed rooms from 82 to 65 and the chairs, sofas and bedside tables taken for columns out (the columns still counted are mostly real ones in rooms still open), without losing rooms overall (204 → 205 of 522 closed and named). Still seen as building: furniture drawn against a wall (a bed's head on its wall, a kitchen counter, a wooden TV unit) — delete such a wall or column with V and Del.
  - **How Auto-trace reads the printed words** (2026-10-15). It reads the whole sheet at its own size several times, each time looking for another kind of print, and keeps the best reading of each spot:
    - **Every letter size on the sheet**: room names, the smaller sizes under them and the big figures of the title ("TYPE A 2279 SFT") are each looked for at their own height. Before, only the most common letter height was read, so a big title figure and names printed larger than the sizes were dropped.
    - **Names on floor tiles, a carpet or a speckled fill**: the tile lines and specks touching the letters are left out, so the name comes through (bti Amabilia, Mir Memento, Eastern Housing Sapphire).
    - **Labels printed sideways**, reading up or down the page (Accept Aftabnagar, Finlay Palm Spring, bti The Peak's VER labels): the sheet is also read turned a quarter each way, and each label found is put back where it is printed.
    - **White print on a dark ground**: a legend in a dark box (Ena Jahan Lodge's "01. LIVING 10'-00" x 09'-06"" list — each room then takes the name of its number) and a light plan on a dark page (Ena Azmary Villa).
    - **A letter touching a basin, a door arc or a WC** is read from a slightly wider view ("STAFF BATH" had lost its S and TH), and **a size with no name read above it** has the strip just above it read once more for the name.
    - **Never a guess from a garbled reading.** A reading names a room only when its words are the sheet's room words (one letter off at most) with at most one number. "BATH 3 21050X 10 67", two rooms' labels read as one ("BED 1 VER 1 TOILET 1" — now three labels), or a stray line stacked on a name never names a room or changes its kind: that room stays "Space N" with its row. A size read on a second look that the size reader could not confirm is never used as a size (it shows as "type this size"). Numbers in names are kept ("BED-04/HOME OFFICE", "BED D4" read for BED 04).
    - On the 30 test sheets (2026-10-15) the room names read went from 298 to 434 of the 522 printed rooms (57 % → 83 %), and the rooms closed and named right from 254 to 351 (49 % → 67 %) — a name read with its size lets Auto-trace fit and close that room. Reading takes longer: about 13 seconds a sheet, up to 33 (it was about 7).
    - **Still not read**: very small print on a busy sheet (CPDL La Reina at 6 px letters, bti Magnifico's grey names on grey floors), names printed white on a speckled granite floor (Palm Spring's kitchen), names touching furniture on both sides; and a name read on a sheet whose walls Auto-trace hardly traced is not counted on a flat. Type such a name with the row's Name it.
    - **Room lists in small print, and numbered lists** (2026-10-15, step 6A). A list of rooms and sizes beside the plan is now found even when its print is tiny and its names were read as one block (CPDL La Reina's 8 px list "F. Living / Living / Dining / Kitchen / Bed 1 …" beside its sizes): the sizes on the right split the block into its rows, and the thin lines ruled under each row no longer count as walls. A size in the list that could not be read for sure still goes to its room as a size "read unsure" (it then checks the room as in step 5A, and its row asks you to type it). "BED 01" in a room and "Bed 1" in the list are the same name, and so are "J BALCONY" and "BALCONY" (a stray letter beside it). On a numbered list ("01. LIVING …", Ena Jahan Lodge) a number misread in the list takes the number of its place (between 03 and 05 it is 04), and the small "06" printed in a room is looked for once more when no room carried it — so each room takes the name and size of its number. The list's words no longer make a "Flat 1" of their own.
    - **A room whose number was lost** (2026-10-15, step 6A). When a line is drawn through a room's number ("BED-4" read as "BED", "BATH-01" as "BATH-0", "VER 03" as "VER 0"), the name is read once more in other views; when one of them reads the same name with a number (and no view reads another number), the room gets it. Where the sheet prints a size list, a room whose number was not read takes the name of the one list row of its name that no room took and whose size is the room's (BED 03 on La Reina, "Bed 3" in the list); a room whose kind was only guessed (from a fill colour) takes its row's name the same way. Both keep a row: "Its number was not read: named Bed 3 from the size table (the row of its name and size) — check". When two rows would fit, it takes neither.
    - On the 30 test sheets this took the rooms closed and named right from 396 to 410 of 522 (78.5 %; La Reina 6 → 11, Jahan Lodge 3 → 8) and the wrong names from 17 to 10.
  - A loose wall end on a column is not listed as "A wall ends here" (the Issues list already treated it as joined).
  - **Walls drawn in other ways** (2026-10-15). Besides walls printed solid black, Auto-trace now reads:
    - **hollow walls** — two thin lines a wall's thickness apart with paper (or a pale fill) between, as Assure's brochures and CAD drawings (Accept Builders) draw them: the band between the two lines is taken as the wall, its corners and T-joints included. It does this only when most of the sheet's long walls are drawn that way, so a sheet with black walls is never changed; a window drawn as three or four lines, a tile floor and a word's letters stay what they are, and a sofa or armchair drawn with a frame under 1 m long stays furniture (a longer frame standing free may still come out as a wall — select it with V and press Del);
    - **grey walls between two thin dark lines** (bti's newer brochures), as before;
    - **a plan printed on a dark page** (a navy, grey or striped card round the plan): the page round the plan is taken as paper and the plan keeps its own colours (before, the whole sheet was turned over and the plan was lost). White lines on a dark page (bti La Montana) are still turned over as before.
    - **a plan on a coloured page whose grey is the walls' own grey** (Mir MR Memento: a dark green sheet with a grey-green card under the plan; in black and white the card and the walls are the same grey, so no wall was read). Since step 5B Auto-trace tells them apart by their colour: the big areas of one colour round the plan are taken as paper, layer by layer from the edge of the sheet, and the plan's walls, floors and the title's letters keep their greys. On Mir this closes and names the Living, Guest Bed, Dining and Kitchen (the Studio's count: "6 of the 10 room names read on it are closed and named"; it was 3); on Ena Jahan Lodge's striped page the Master Bed too.
    - On the 30 test sheets this took the rooms closed and named right from 351 to 382 of 522 (67 % → 73 %): Assure Hermitage 10 → 18 of 20, Assure Gladiolus 10 → 13 of 15, Accept Aftabnagar 4 → 7 of 12, Ena Azmary Villa 1 → 11 of 14, Finlay Palm Spring 1 → 7 of 12.
    - **Still not read well**: on Mir the wall between the two bedrooms runs through two wooden wardrobes and two desks drawn against it (Auto-trace sees one block 1.3 m thick, not a wall — draw it with W), and the beds' striped covers come out as short loose walls (select them with V and press Del); bti Magnifico (walls 5 px thick, some hollow, some solid; a bed's rug border is drawn exactly like a wall at that size; the formal living, dining and foyer are one open room), Ena Jahan Lodge's blue walls on a striped page. On a dark page, the page's own streaks, a script logo or a photo beside the plan can come out as loose walls outside the flat ("Loose wall end" rows): select them with V and press Del.
  - A size row ("drawn … printed …") means neither of the room's two measures matches its printed size within 2": its main rectangle (the biggest rectangle that fits inside it — the "drawn" figure the row shows) and its whole outline (an L-shaped room whose sheet prints the whole L passes this way). The row goes once either one matches. A printed size Auto-trace could not read ("Kitchen: its printed size could not be read — type it"): click the row, the room's box opens on the right, type the size into **Printed size** — the size row for it appears at once if the room does not match (Sheltech L2: "Kitchen: drawn 6'-5" × 12'-2", printed 8'-5" × 12'-2""). The same for a size typed with R or brought by Name it.
  - **Wall tracks** tick box — which tracing method Auto-trace uses (leave it on).
  - **AI helper (optional)** — a place for a Gemini key; only used to re-read room names the tool could not read.
- **Issues** — problems in the drawing. Red = breaks the 3D. Amber = worth a look. Grey = cosmetic.
  - **Join walls** — fixes every wall that overlaps or crosses another, in one click.
  - Click an issue: the plan zooms to it and offers fixes.

**The problems it can find and the one-click fixes**

| Problem | Fixes offered |
|---|---|
| A wall end joined to nothing | Close the gap · Join · Extend · Remove end · Keep — it stands alone |
| A corner with no wall | Remove |
| A wall with no length | Remove / Merge corners |
| Two walls on top of each other | Remove the copy |
| An opening longer than its wall | Remove it / Shrink / Move it inside |
| Two openings overlapping | Trim / Remove |
| Walls crossing | Join here / End it here |
| A room with no name | Type the name |
| A room name outside any room | (by hand) |
| Walls standing loose inside a room | Join with a zone line |

---

## 6. Making a building — a project, floor by floor

You say what the building is first, then give each floor a drawing. A drawing is one whole floor (all its flats and the lift lobby); one drawing can be on as many floors as you like, any floors.

**Start a project**
1. Open the Studio. With nothing open, the **New project** card is in the middle. (Or: top bar → **Building**.)
2. Type its **Name**, how many **Basements** (0–5), how many **Floors above ground** (1–60), tick **Rooftop** or not. A ground floor is always there.
3. Click **Create project**. The list of floors appears on the right of the plan and stays there: **Rooftop** at the top, then the floors from the highest down, **Ground floor**, **Basement 1**, **Basement 2**…

**Give each floor a drawing** — work through the list:
- **Draw** (on an empty floor): a new, empty drawing for that floor opens. Floors get the names Floor plan A, Floor plan B… (the flats inside a drawing keep the sheet's names, Type A, Type B); the others are called Ground floor, Basement 1, Rooftop. Drop that floor's plan picture on the page (or **Choose plan image…**), set the scale (S) and trace as usual.
- **Same size as "Floor plan A" — Use its scale and position**: when the picture you load is exactly the size of a picture you already set the scale on, this message offers it (15 seconds). Click it: no scale to set, and the two drawings sit right over each other in the building. Not right? **Ctrl+Z**.
- **Open**: that floor's drawing comes into the Studio. The drawing you were on is saved first, with its picture. Nothing is asked, nothing is lost — also after closing the browser.
- **Use drawing…**: pick one of your drawings for this floor.
- **Clear**: the floor is empty again; the drawing itself is kept.
- The floors of the drawing open now have a yellow outline.
- Under a floor's drawing name, its flats: **Floor 2 — Level 2** with **— Flat 1, Flat 2** under it (or "Type A, Type B" when the drawing names them). They come from the drawing itself (section 5, "Flats in a whole-floor drawing"); nothing to type here. A ground floor, basement or rooftop shows none.

**Under the list, for the drawing open now**
- **Open now** — its name.
- **Also on floors** — type `2, 4, 6-8` and click **Apply** (or press Enter): the drawing goes on those floors too. The label shows the floors it is on now. If one of those floors already has another drawing, you are asked first; that other drawing is kept. Clearing a floor never asks (the drawing is kept too). This box sits above the floor list.
- **Delete this drawing** — it leaves every floor and is gone (asks first).

**Show building** (top of the list) opens the stacked building in a new tab. A floor that has no drawing yet is filled with the one below it.

**The project itself** (top of the list): **Rename**, **Delete** (asks first), **Close** (nothing is lost; open it again with top bar → **Building** → **Or open a project**). Top bar **Building** hides or shows the list.

Whatever was open in the Studio before you started the project is not thrown away: when you open a floor it becomes one of the project's drawings — **Use drawing…** puts it on floors.

**The old way, one plan** — top bar → **Building** with no project open → **Put only this plan into a building…**: "Use this plan as" **A flat** (floors N to M, a mirrored neighbour), **Ground floor**, **Basement**, **Common floor** or **Rooftop**, placed on the flats' columns or by **Move it right / Move it down**.

Projects, their drawings and their pictures are kept in this browser only.

---

## 7. What the tool decides by itself

**Walls**
- Height decides the type: 0 = zone line, up to 8 inches = kerb, under a full storey = low wall, else a wall.
- A low wall that gets a door or a window becomes full height. An open passage does not raise it (that makes a gate).
- Walls drawn across each other are joined automatically.

**Auto-trace** (what it draws by itself on a flat sheet — details in §5, "What Auto-trace draws that is not a wall")
- Two or three thin lines side by side = a glass front → a glass wall. One thin line across a veranda's open side = its railing → a 1.1 m low wall (0.45 m beside planter green).
- Each such edge is kept only if the room it closes matches its printed size: within 6" it needs no question; off by more than 1 ft it is left out and the room shows as open.
- A wall stopping short of the next wall is carried on to it when the same thing is drawn in between, or when the gap is under 1 ft.
- A space with no name split off a named room by a thin or open line belongs to that room.
- Furniture is not building: a dark block is a column only when a wall runs out of it; a closed piece of drawing touching no wall (bed, sofa, table, chair), hatch (thin lines close together) and a narrow unnamed strip (wardrobe, counter) are never walls, columns or rooms.
- Walls drawn as a grey (or any light colour) band between two thin dark lines, as on bti's newer brochures (Amabilia), are read as walls, the same as solid black ones — when most of the sheet's walls are drawn that way. Where furniture is drawn the same way and the walls are very thin (bti Magnifico, Moondrift) it is not used yet: draw what is missing with W. A sheet drawn in white lines on a dark page (bti La Montana) is read too. Your picture in the Studio stays as it is.

**Openings**
- A window that starts at the floor and is at least 1.5 m tall becomes a **glass wall**.
- A door 1.5 m wide or more becomes a **double door**.
- Changing an opening's kind resets its size to that kind's usual size.

**Rooms**
- A room exists wherever walls close a shape. You never draw a room; you only name it.
- The kind is guessed from the name ("Lawn", "Lobby", "12" for a parking bay, "Dry Kitchen" → pantry…) — the same words Auto-trace reads (table in §8).

**Furniture**
- A room with no furniture of its own is furnished automatically by its kind.
- Once you move one piece in a room, that room's layout is yours and stays.
- A room you emptied stays empty.
- Things resting on a piece move with it. A longer dining table gets more chairs.
- Trees keep 1.5 m away from windows and glass walls.

**Sun:** follows Dhaka's sun path, turned by the plan's north.

---

## 8. Room kinds and what each gets

**Rooms in a flat**

| Kind | Gets |
|---|---|
| bed | Bed, bedside tables, rug, wardrobe, pictures, light, AC |
| living | TV wall, sofa group, light, AC |
| dining | Table and chairs, light, AC |
| kitchen | Fridge, counters, sink, hob, cabinets, light |
| bath | Toilet, basin, shower screen if big enough, light |
| balcony | Plant, lounge chair if big enough, planter box |
| study | Desk, chair, shelves, armchair, light, AC |
| closet | Rails and shelves |
| foyer | The flat's entrance hall: a low cabinet on its blankest wall (else a shoe bench), light. A passage narrower than 1.5 m stays clear |
| pantry | Pantry, dry kitchen, food store: counters and wall cabinets (no sink, no hob), a fridge, open shelves, light |
| maid | Servant's / staff room: a cot and a hook rail, light (no AC) |
| prayer | Kept empty, light only |
| utility | Nothing |
| shaft | Nothing; open to the sky |
| other | Nothing (a room named "stair" gets a stair). The lift lobby, stair and lifts are "other": the building's core, in no flat |

**The words Auto-trace reads, and the kind each gives** (any case; dots, hyphens and spaces may vary — "M.BED", "M. BED", "BED-03"). Typing the same word as a room's name in the Studio picks the same kind; you can always change it in the kind list. The room keeps the name as the sheet prints it ("Suite 1", "K.Ver", "Dry Kitchen").

| Printed on the sheet | Kind |
|---|---|
| BED, SUITE, M.BED, G.BED, C.BED, MBED, GBED, CBED, M. ROOM, G. ROOM, C. ROOM, MASTER / GUEST / CHILD BED, BED/LIVING | bed |
| TOILET, TOI, TLT, TOIL, BATH, WC, PDR, POWDER, S.TOI, M.TOILET, MAID TOI, STAFF TOILET, SERVANT BATH, TOIL-1, M.TOIL, STLT, SER. TOI, SER. TOILET | bath |
| VER, VERANDAH, BALCONY, TERRACE, K.VER, KIT. VER., SERVICE VER, FRONT VER, KVER | balcony |
| LIVING, DRAWING, FAMILY, LOUNGE, F.LIVING, FAMILY SPACE, ENTRY LOUNGE — with DINING, the word printed first decides | living |
| DINING, DINNING, DINING & F. LOUNGE, DINING/F.LIVING | dining |
| KITCHEN, WET KITCHEN | kitchen |
| PANTRY, DRY KITCHEN, FOOD STORE | pantry |
| S.BED, STAFF BED, SERVANT BED, HELP BED, MAID'S ROOM, MAID RM, DRIVER'S ROOM, SBED, S/A (servant's area) | maid |
| FOYER, ENTRY, ENTRANCE, PASSAGE, CORRIDOR | foyer |
| PRAYER, PRAYER ROOM, PUJA | prayer |
| STUDY, HOME OFFICE, LIBRARY, PAINTING CORNER | study |
| W.I.C, WALK-IN CLOSET, DRESS, DRESSER, DRESSING | closet |
| STORE, LUGGAGE STORE, LAUNDRY, UTILITY, SERVICE (AREA), CLOTH DRYING AREA, IRON PAD, SHOE RACK, DISH WASH AREA | utility |
| GREEN, UPSTAND GREEN, PLANTER, PLANTATION, GARDEN, SUNSHADE, LANDSCAPE | balcony with planting |
| AC LEDGE, A.C, A/C OUTDOOR, ODU, AOD, DUCT (E. / P. / F.), SHAFT, VOID, OPEN TO SKY, GARBAGE CHUTE | shaft |
| LOBBY, SERVICE LOBBY, STAIR, STAIRCASE, FIRE STAIR, LIFT, STRETCHER / BED / MRL LIFT, LIFT MACHINE ROOM, LIFT & STAIR LOBBY, FIRE CORRIDOR | other (the core) |
| GYM | gym (a common room) |
| SWIMMING POOL, POOL | pool |
| GRAVEL | paving |

Never a room — fixture and drawing tags: DW, D.WASH, FRIDGE, FREEZER, REF, W/M, WASHING MACHINE, TV, FHC, FHB, F.RISER, E.RISER, SDB, FIRE HOSE REEL, DINNER WAGON, SHOWER AREA, UP, DN, BEAM, SLAB, ROOF OF …, SLOPE, LEVEL, TYPE-A, UNIT A, LIFT PIT, K.WASH (the kitchen basin), LOW WASH, STANDOUT, TEA CORNER. Typed in the Studio on a ground floor or rooftop, "Lobby" gives a common lobby and "Garden" a lawn.

**Common rooms**

| Kind | Gets |
|---|---|
| lobby | Plants; seating if big; a reception desk if bigger |
| gym | Mirror, weights, treadmills, rack, mat, light, AC |
| community | Sofas, dining sets, plant, light, AC |
| guard | Desk, chair, benches, light, AC |

**Outdoor areas** (no ceiling)

| Kind | Gets |
|---|---|
| lawn | Trees, shrubs, a bench if big |
| paving | Empty; a bench if big |
| driveway | Nothing |
| parking | Nothing; one area per bay, named by its number |
| deck | Loungers by a pool, or pergola and small tables, pots |
| pool | Water; cannot be walked into |
| planter | One planted bed |
| play | Swing, slide, seesaw, benches |

---

## 9. Where your work is kept

**In this browser only** (gone if the browser's data is cleared, and not visible on another computer):

- The Studio drawing you are working on, with its plan picture
- The last Preview 3D
- Furniture you moved
- Notes on ordinary links
- Buildings and projects you made, every drawing of a project and its plan picture
- Staff mode, the staff key
- Your Check these answers (the record Export answers saves) and, per sheet, where the print Auto-trace could not read stands

**Safe:**

- The built-in flats and levels
- Anything exported as a file (the file does not contain the plan picture — keep the picture too)
- Buyer links made with **Share link** and what buyers do on them (in the database)

**Never saved:** the finishes you clicked, unless you press **Share** (they go into the link).

---

## 10. Rough edges known today

Things that are confusing or not finished. Each one is a job on the list.

- **Auto-trace misses rooms.** On the test sheets it closes and names about 6 of every 10 rooms (75 of 116 on the five hand-traced flats after the 2026-10-09 evening work, was 71); verandas, planters, shafts and lobbies are the usual ones left open or swallowed by the room beside them. Since that work it closes a veranda on its railing line, a glass front drawn as two or three lines, and a wall or window that stops short of the next wall (§5, "What Auto-trace draws that is not a wall"): in the Studio test Sheltech L2 Type A went from 10 to 13 of its 14 read names closed and named, Type B 9 → 11 of 13, Level 4 Type A 8 → 9 of 13, BTI Type A 19 → 20 of 21, and "Check these" + Issues fell on every test flat (Sheltech L4 Type A 51 + 9 → 38 + 5). Still left open by Auto-trace: an **open-plan foyer / dining / family room** with no sizes printed (nothing pins where one ends — draw a Zone line with W), **verandas drawn with a very light double railing line** and no size read, **the planter strip** south of each Sheltech flat, and on BTI's 3rd floor the **south flat's west rooms** (the flat it picks does not reach them: draw them with W). "Check these" now names each one and closes or names most in one click (see §5): in the Studio test of 2026-10-09 the BTI Type A flat reached "All 21 room names read on the sheet are closed and named" in 4 clicks; Sheltech Type A and Type B were left with 1 and 2 rooms to draw with W (no walls of theirs were traced). Still by hand: **names Auto-trace could not read** — it now reads most (Sheltech L2 Type A 14 of 18, Level 4 Type A 13 of 18, BTI Type A 21 of 22), but not light grey names drawn over a fixture (the small toilet by the Sheltech kitchen veranda), a few names whose letters touch a basin or a wall (Toilet 3 on Sheltech L2), the small SUNSHADE / PLANTER words, the red TYPE-B; a toilet read without its number is called just "Toilet"; on Banani (6 px letters) it reads 9 of 19. Those rooms show as "Unnamed space" or "Space N — printed name … is in it": type the name with the row's Name it. **Printed sizes touching a counter line or crossed by a door arc** (Kitchen, Toilet 1 on Sheltech L2) are not read either: their row asks you to type them, **glass fronts Auto-trace did not see as two or three lines** (Close it draws a zone line there: turn it into glass yourself), and **the Banani sheets** (their walls are thin lines Auto-trace does not take: draw the flat with W — when it closes almost nothing Auto-trace now says what happened — "Auto-trace found only 8 walls and 1 room. Walls drawn grey, hollow or as thin lines are not yet read well; draw the missing walls with W, or trace one flat with a click." — and says "made for flats … ground floor, basement or rooftop" only when the sheet itself prints PARKING, DRIVEWAY or RAMP (and no bedroom), or only a lobby (2026-10-14)). Making the tracer itself better is the next job (HANDOFF session 24). Since 2026-10-15 it also closes many open rooms itself — a door in a gap, a glass wall, a railing, an open-plan zone line, each with its row (§5, "Closing a room that is still open"): on the 30 test sheets 254 of 522 printed rooms come out closed and named (was 205). Most still open are rooms whose printed size it cannot read yet, or whose walls it hardly traces. Since the same day hollow walls (two thin lines), grey walls between two lines and plans printed on a dark page are read as walls too (§5, "Walls drawn in other ways"): 382 of 522 closed and named; since step 5B a plan on a coloured page whose grey is the walls' grey (Mir) too: 385 of 522. Since step 5A a size read unsure, a table row of the room's kind and a veranda drawn as a box of thin lines close rooms too, and a name read in pieces is one name (§5): 396 of 522. Since step 6A room lists in small print and numbered lists are read, and a room whose number a line hid gets it back (§5): 410 of 522. Since step 6B walls that stop just short of the line they meet, two open-plan rooms in one space and a tile line read across a bedroom are handled (§5): 421 of 522 (80.7 %). Rooms drawn at another size than their print stay open with their row. Still hardly traced: walls with furniture drawn against them on both sides (Mir's bedrooms), bti Magnifico.
- **Ground floors, basements and rooftops cannot be auto-traced.** Auto-trace only understands flats; when it finds almost nothing on a sheet that prints no bedroom it says so (on a flat sheet it says the walls may be thin lines instead), and it says loudly when it had to guess the scale.
- **Whole floor (Level 4) — what is still rough:** a flat whose type is not printed is called "Flat 1, 2 …" (BTI); a room the tracer did not close stays open in its flat (Sheltech L2 Type B's Toilet 2 by the lifts, BTI 3rd floor south's Bed-2 and Bath-3) — its row says so. On BTI 2nd floor the big flat now always comes out as it did when clicked on its dining's printed name, which reaches a little further north than a click at the dining's west side did: loose wall ends around the unnamed box between the lift lobby and its powder room (Check these 42 → 47, Issues 3 → 9 against that old click). The flats are found only from the printed living / dining / kitchen names with a bedroom: a flat whose names are not read (Banani Level 2-6 Unit B, 6 px letters) is not found — Whole floor leaves it out, and a click in it traces from the click as before. The second drawing on a sheet (BTI 3rd floor's "4th, 6th & 8th floor" strip) is not traced by Whole floor.
- **The Banani and dmd built-in levels still open without their plan picture.** Drop the picture on the page and line it up with S (4 clicks). The Sheltech ones have theirs.
- **Lining a picture up needs zooming in and out** between the clicks when the picture and the drawing are far apart in size.
- In **Show building** the tall neighbour blocks can hide your building after you turn the view; picking a floor does not bring it back into sight.
- Renaming a project does not change the Project box of drawings made before the rename.
- The "Draft restored — Start over" message shows at every opening; in a project **Start over** only empties the screen, the drawing is kept.
- Undo does not go back past closing the browser or switching drawings. The ⏱ timer starts again for each drawing you open.
- The top-bar Floor box shows the floor a drawing was first made for, not the floor you opened it from.
- "Walk this level" from Show building first shows an Enter screen.
- **A wrong scale found after tracing cannot be put right in one step**: S changes the scale, but the walls do not follow the picture.
- Clicking a wall that is all glass picks the glass, not the wall — its Width / Height boxes are the glass's. A glass wall is called "Window" in the panel.
- An area you add to a level ("Sand pit") may be missing from the 3D **Rooms** list; **Rooms → Lawn** can drop you in a corner facing a wall.
- The coloured areas of a drawing (lawn, driveway…) cover much of the picture under them.
- **The Floor box in the top bar only takes numbers.** Typing G, B1 or R is thrown away without a word, and the number does not make the plan a ground floor or basement — only its row in the project's floor list (or the old "Use this plan as") does.
- The old one-plan way (**Put only this plan into a building…** → Ground floor) refuses until a building with a flat exists, then needs typed "move it right / down" numbers. The project floor list has neither problem.
- **Outside a project, only one Studio drawing at a time.** Opening another plan from the 3D view (Edit plan, Edit openings) replaces yours after one question. Inside a project nothing is asked: the project keeps your drawing and its picture — open it again from its floor in the list.
- **A whole-floor drawing knows its flats only in the Studio** (the tints, the Flat pick, the floor list): you cannot yet walk ONE flat of it on its own in 3D, and a buyer link and the Building view still treat the whole floor as one flat. Finishes go per room / per wall (as before), not per flat.
- **Flat names follow the place**: "Flat 1, Flat 2" count from west to east, so a drawing turned into its mirror image counts them the other way. A room moved by hand to "Flat 2" goes with the number. "Type A" names do not move.
- **A room with no door and no low edge to the flat is in no flat** (it shows untinted) on a drawing you traced by hand: pick its flat by hand. A planter edge, kerb or parapet lower than 4 feet counts as a way in. (After Auto-trace every room is already in its flat.) Auto-trace puts the printed "TYPE-A ±2736 SFT" on the drawing only when it stands in a closed room of the flat and its TYPE word was read (Sheltech L2 Type A and Type B yes; Level 4 Type A — open foyer — no: type it with R).
- After typing in a box on the right, press **Enter** — then the tool keys (W, O…) work again. (Without Enter they still go into the box.)
- Clicking a door on a thin low wall picks the wall; Del then removes the whole wall.
- The fix "Join with a zone line" can draw a long diagonal line across a lawn.
- **R on a room with several gaps** says only "a wall is missing — draw it with W"; it does not yet show where. The Issues row "Label is not inside a closed room" still rings the nearest open spot, which can be outside that room.
- While a column is picked, a wall end lying on its side cannot be dragged (the column's side handle takes the press): click elsewhere first.
- Room names overlap each other on crowded plans.
- Checks written for flats show on levels ("No entry door on an outer wall", the Area number).
- The hint "Click to look around" is wrong — one click walks you to that spot; a double-click lets the mouse turn your head.
- Opening the site with no address shows Banani Basement 1 instead of a flat.
- There are two different "share" buttons: **Share** in the 3D view (a link with your finishes only) and **Share link** in the Studio (the real buyer link that feeds the change list).
- **Start over** (on the "Draft restored" message) wipes the Studio drawing without asking.
- Once a plan picture is loaded there is no button to swap it — only dropping a new one on the Studio.
- A drawing file opened again always asks for its plan picture.
- Furniture moved in 3D while the Studio is open in another tab can be overwritten by the Studio.
- **On the plan (F), a piece wholly under another cannot be clicked there** — the hob + oven under its chimney hood, a ceiling light, pendant or wall AC over a bed or table: a click picks the piece drawn on top. Pick it in the 3D view (Edit furniture).
- The same thing has different names in different places: "Slider" / "Sliding door"; "Reset layout" / "Reset to preset".
- Keys **T**, **H** and **Shift+H** are not mentioned anywhere on screen.
- A typed wall length cannot start with 0 (type `.5`, not `0.5`).
- A staff browser still sees the staff buttons on a buyer link.
- **One-room finishes:** the clicked floor or wall is not outlined in 3D — only the panel names it. A one-room choice is priced at the option's full group price. The Studio cannot set them. Two rooms of the same floor group with different floors get no threshold strip in their doorway.

---

## 11. Can I change it? (state on 2026-10-05, from a test done by hand in the browser; finish rows updated 2026-10-09)

The goal: **if you can see it, you can click it and change it.** This table is how far the tool is from that today. Every "No" is a job.

| Thing | In the 3D view | In the Studio | Cannot be changed anywhere |
|---|---|---|---|
| Wall | Its paint, one side at a time (Finishes open, click it) — nothing else | Yes — type, thickness, height, length, move, copy, delete | Its paint on the outside |
| Boundary wall, parapet, low wall | No | Yes — same as a wall | Its finish |
| Kerb, free-standing screen | No | Yes | — |
| Glass wall | Yes — width, height, sill, slide along the wall, delete | Yes | Frame, glass colour. Cannot be *added* in 3D |
| Door, double door, gate, window, passage | Yes — kind, width, height, sill, slide, delete | Yes — plus hinge side and swing | Door material. Cannot be *added* in 3D |
| Column | No | Yes — size from any side or corner by mouse (or typed), move, delete, add; a wall touching it closes the room | — |
| Ceiling, slab, ceiling height, ceiling lights | One room's ceiling can be clicked in Finishes, but only one ceiling colour exists | No | Everything else |
| Floor of ONE room | Yes — Finishes open, click the floor (Walk or Dollhouse) | No | — |
| Lawn, paving, driveway, deck surface | No | No | Everything — no finish choices exist for outdoor areas |
| Shape of an area | No | Yes — move its corners and lines | — |
| Kind of an area (lawn → paving) | No | Yes | — |
| Floor level of an area | No | Yes | — |
| Ramp | No | Yes — level at the far end, direction, length | Steepness as a number (1:8) |
| Steps | No | No | They are not their own thing yet |
| Pool | not tested | not tested | not tested |
| Parking bay | No | Yes — size, number, add, delete | The painted lines |
| Wall paint of one room / one wall / the outside / the boundary | Yes for one room or one wall — Finishes open, click the wall | No | The outside and the boundary (no paint choice) |
| Tree, shrub, plant | Yes — move, turn, resize, delete, add from the library | Yes (tool F) | Swap for another in one step |
| Furniture, loungers, pergola | Yes — same | Yes (tool F) | — |
| Curtains | Yes — slide along their wall, delete, add from the library onto any window; they follow their window | Yes (tool F) — same | Their width by hand, fabric and colour, drawing them closed |
| Neighbour buildings, road, sky | No | No | Everything |
| Time of day | Yes — the slider | — | — |
| North direction | No | No | No control found |

One limit that applies to all of it:

- **What staff change in 3D stays in that one browser.** A buyer on another computer still sees the original.
