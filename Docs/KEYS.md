# Plotline — every key and every button

All the keys, mouse moves and buttons a person can use, in one place. Read from the code on 2026-10-19 (branch `s27/finish` at 32aadf2: the P key for the wind, curtains on any opening and Delete on the piece in your hand are in). How each one works in detail is in [MANUAL.md](MANUAL.md): the last column says where.

Rule: when a key or a button is added, changed or removed, this file changes in the same commit (as MANUAL.md does).

Keys do nothing while the cursor is in a text box (the letters go into the box). Press **Enter** (or click the plan) to give the keys back. The few keys that work inside a box are marked.

Who: **staff** = the developer's team (a browser becomes staff the first time it opens the Studio, or with `?staff=1`); **buyer** = someone on a buyer link; **everyone** = both.

---

## 1. Studio keys (staff)

| Key / mouse | What it does | Where (tool / mode) | MANUAL |
|---|---|---|---|
| **V** | Select tool | any time | §5 The tools — V |
| **S** | Scale tool | any time | §5 — S |
| **W** | Wall tool | after the scale is set (before: "Set the scale first (S)") | §5 — W |
| **A** | Arc tool: a curved wall, laid as short straight pieces | after the scale | §5 — A |
| **O** | Opening tool: doors, windows, sliders, passages, glass wall | after the scale | §5 — O |
| **R** | Room tool: name a closed room | after the scale (in F, R turns a piece instead) | §5 — R |
| **C** | Column tool | after the scale | §5 — C |
| **F** | Furniture tool | after the scale | §5 — F |
| Hold **W**, **O** or **R** | The tool works only while the key is held; let go and you are back on the tool you had (a quick tap just switches). Hold W and drag from corner to corner = one wall; hold O and click a wall; hold R and click a room | any tool | §5 "Hold instead of switch" |
| Shift + a tool letter | Does not switch the tool (Shift+H is the door swing) | — | — |
| **1 2 3 4** | Wall / Low wall / Kerb / Zone line — what W and A draw next | W, before the first corner | §5 — W |
| **1 2 3 4** | Door / Window / Slider / Passage, at its usual width | O (also with O held) | §5 — O |
| A digit or **.** | Opens the length box with it; **Enter** lays the wall at that length. **0** fits the view instead, so type `.5`, not `0.5` | W, while drawing (after the first corner) | §5 — W |
| **Tab** | The length box switches between length and angle (0° = to the right) | the length box while drawing walls | §5 — W |
| **Enter** | Confirms the box you are typing in: a wall's length, the scale's real length, the room box (= Save), a floor level, a wall width, Also on floors (= Apply), the New project name (= Create project), the Site address (= Find), the name box on the plan | text boxes | §5, §6 |
| **Esc** | One step back, in this order: stops Auto-trace's "Point at a flat"; closes the problem box on the plan; lets go of the piece in your hand (F: a moved piece stays where it was, a new one is dropped); closes the room box; ends the wall you are drawing; else drops a half-done scale, line-up or arc and unpicks everything. In a length box: closes it | any tool | §5 Other keys |
| **Backspace** | While drawing walls: takes back the last piece. Otherwise the same as Del | W; any tool | §5 — W |
| **Del** | Deletes what is picked (asks first when doors or windows would go with the walls). In F: the picked piece and what rests on it — also the piece in your hand (a new one from the library is only let go) | any tool | §5 Other keys, — F |
| **T** | Thin wall 5" ↔ thick wall 10": the walls being drawn, else the picked walls | W, A, V (not F) | §5 — W, A |
| **H** | The picked door's hinge goes to the other side | a door picked, any tool but F | §5 — O |
| **Shift+H** | The picked door swings the other way (in / out) | same | §5 — O |
| **Ctrl+Z** | Undo | any tool (not in a text box) | §5 Top bar |
| **Ctrl+Y** or **Ctrl+Shift+Z** | Redo | same | §5 Top bar |
| **Ctrl+D** | Copies the picked walls and room names, set a little to one side | any tool | §5 Other keys |
| **Ctrl+S** | Export: saves the drawing as a file | any tool — **also inside a text box** | §5 Top bar |
| **Ctrl+O** | Import: opens a drawing file | any tool — **also inside a text box** | §5 Top bar |
| Ctrl+A | Picks every wall | V | §5 — V |
| **Arrow keys** | Nudge what is picked 1 inch | every tool but F | §5 Other keys |
| **Shift + arrow keys** | Nudge 1 foot | every tool but F | §5 Other keys |
| **Arrow keys** | Move the picked piece one 3-inch square (Shift changes nothing; nothing while a piece is in your hand) | F | §5 — F |
| **R** | Turn the picked piece 90° — or the piece in your hand | F | §5 — F |
| **0** | Fit the whole plan on screen | any tool | §5 Other keys |
| **Space** held + drag | Slide the plan | any tool | §5 Other keys |
| **Shift** held | No snapping or sticking while you point, draw or drag (corners, wall lines, wall faces, columns; a column corner's square-up stick); the status bar shows it at once | V, W, A, C | §5 — V, W, C |
| **Shift + click** | Adds to what is picked (pick several); a Shift-click on empty plan keeps what is picked | V | §5 — V |
| **Drag on empty plan** | A thin dashed box: picks every wall, opening and column it touches when you let go (Shift+drag adds); a plain click on empty plan unpicks | V | §5 — V |
| **Alt** + drag an end of the picked wall | The walls joined at that corner move with it and stay straight. Without Alt the end leaves the corner and only this wall gets longer or shorter | V, one wall picked | §5 — V |
| **Alt** + drag a corner of a wall that is not picked | Pulls that one wall free of the corner (the others stay) | V | §5 — V |
| Mouse wheel | Zoom in / out at the pointer | any tool | §5 Other keys |
| Left click, press-drag | The tool's own action (pick, draw, place, drag) | any tool | §5 The tools |
| Right-drag or middle-drag | Slide the plan | any tool | §5 Other keys |
| Double-click a wall | Type its length | every tool but W and A | §5 — V |
| Drag a dot on a picked thing | A wall's face dot: its thickness on that side (V). A column's side or corner dot: that side, or that corner alone (V or C). An opening's end dot: its width (V or O). Curtains' end dot: wider or narrower on that side (F). A ramp's arrow head: which way it runs (V). The Site's gold north arrow: true north; its round dot moves the arrow | V, C, O, F, Site open | §5 — V, C, F, Site |
| Drop a picture or a file on the page | A plan picture (PNG, JPG, WEBP, up to 10 MB) goes under the drawing; a drawing file opens | any time | §5 "Loading the plan picture" |

## 2. 3D view keys

| Key / mouse | What it does | Where (mode) | Who | MANUAL |
|---|---|---|---|---|
| **Enter** | Go in (the start screen's Enter button) | start screen | everyone | §2 |
| **W** or **↑** | Walk forward | Walk | everyone | §2 Moving in Walk |
| **S** or **↓** | Walk back | Walk | everyone | §2 |
| **A** / **D** | Step left / right | Walk | everyone | §2 |
| **←** / **→** | Turn left / right while the mouse is free; step left / right while the mouse turns your head | Walk | everyone | §2 |
| **Shift** held | Walk faster (about 4 m/s instead of 1.8) | Walk | everyone | §2 |
| Click a spot on the floor | Walk there | Walk, mouse free | everyone | §2 |
| Double-click | The mouse turns your head; **Esc** gives the mouse back | Walk (not in Edit furniture / Edit openings) | everyone | §2 |
| **O** | Walk ↔ Dollhouse (from the Building view: back to Walk) | any | everyone | §2 Buttons |
| **B** | The Building view | only when the flat is part of a tower | everyone | §2, §4 |
| **F** | Opens / closes Finishes | any | everyone | §2 Finishes panel |
| **C** | Comment on / off; then click the thing | any | everyone | §2 Notes |
| **P** | Wind on / off — the same as the Wind button | Walk, Dollhouse, Building | everyone | §2 Always on screen |
| **M** | Hides / shows the small map | Walk | everyone | §2 Always on screen |
| **Esc** | Gives the mouse back, and one step back: a piece in your hand goes back where it was (a new one is dropped); in Edit furniture: closes the library and unpicks; in Edit openings: unpicks; else stops Comment and drops an unsaved note | any | everyone | §2, §3 |
| **G** | Picks up the piece under the mouse (under the dot while the mouse turns your head), also through glass; **G** again puts it down where it fits | Walk or Dollhouse, not in Edit openings | staff | §3 Edit furniture |
| **R** | Turns the piece in your hand; in Edit furniture turns the picked piece 90° | Walk, Dollhouse | staff | §3 Edit furniture |
| **Del** or **Backspace** | Deletes the piece in your hand (after G or a drag; a new one from the library is only let go); in Edit furniture: the picked piece. In Edit openings: removes the picked door, window, passage or low wall | Walk, Dollhouse | staff | §3 |
| **Ctrl+Z** | Undo the last furniture or opening change | Edit furniture, Edit openings | staff | §3 |
| Number keys | Nothing in the 3D view | — | — | — |
| Drag / wheel / right-drag | Turn the view / zoom / slide it | Dollhouse, Building | everyone | §2, §4 |
| Click a room's floor | Drops you into that room (not while Finishes is open) | Dollhouse | everyone | §2 |
| Click a floor, a wall or a ceiling | Chooses the finish for that one room or wall | Finishes open, Walk or Dollhouse | everyone | §2 Finishes panel |
| Click anything | Puts a note on it | Comment on | everyone | §2 Notes |
| Click a flat | Opens it | Building | everyone | §4 |
| Click / drag / drag a dot | Click a piece = pick it (also through glass); drag = move it; drag a dot = bigger or smaller (curtains: wider or narrower on that side); drag the empty room = look around (Walk) | Edit furniture | staff | §3 Edit furniture |
| Click / drag / drag a dot | Click = pick a door or window; drag = slide it along its wall; drag a dot = width, height, a window's sill; drag the empty room = look around (Walk) | Edit openings | staff | §3 Edit openings |
| Click / drag / drag a dot (low wall) | Click = pick a low wall (under 1.2 m: railing, parapet, planter edge, kerb); drag an end dot = longer / shorter along its line (a joined end leaves its corner); drag the wall = move it across | Edit openings | staff | §3 Edit openings |
| **Alt** + drag a low wall's end dot | Keeps its corner joined: the wall it meets moves with it | Edit openings | staff | §3 Edit openings |
| VR trigger | Hold to aim at the floor, let go to jump there | in VR | everyone | §2 In VR |
| VR thumbstick left / right | Turns you 45° | in VR | everyone | §2 In VR |
| Keyboard while in VR | Ignored | in VR | — | — |

---

## 3. Every button and field

### 3D view — start screen

| Name | What it does | Who |
|---|---|---|
| **Enter** | Goes in; you stand inside the front door | everyone |
| The other flats and levels (links under it) | Open another built-in flat or level | `/u/…` addresses (not on a buyer link `/s/…`) |
| **Studio** | Opens the Studio | `/u/…` addresses |
| **Staff mode** / **Leave staff mode** | Turns staff mode on / off in this browser | `/u/…` addresses |

### 3D view — top

| Name | What it does | Who |
|---|---|---|
| Room box (top left) | The room you stand in: name, floor, printed size; with Wind on, the wind in words | everyone |
| **Rooms** | A list of the rooms; click one to jump there | everyone |
| **Walk** | Walk inside at eye height (O) | everyone |
| **Dollhouse** | The whole plan from above, roof off (O) | everyone |
| **Building** | The whole tower (B) — only when the flat belongs to one | everyone |
| **Finishes** | Opens the finishes panel (F) | everyone |
| **Comment** | Click anything to leave a note (C) | everyone |
| **Share** | Copies a link that opens with the finishes you chose | everyone |
| **Edit furniture** | Move, turn, resize, delete or add furniture | staff |
| **Edit openings** | Move, resize, change or remove doors, windows, sliders, passages, low walls | staff, not on a buyer link |
| **Edit plan** | Opens this flat or level in the Studio, in a new tab | staff |
| **Enter VR** / **Exit VR** | Into / out of the headset — only when one is connected | everyone |

### 3D view — bottom

| Name | What it does | Who |
|---|---|---|
| Day (date, left end of the sun bar) | The day the sun (and the wind's month) is shown for; starts on today | everyone |
| Time of day (slider) | 06:00 to 18:00; the sun moves with it | everyone |
| **Wind** (right end of the sun bar) | The wind through the flat this month, on / off (P) | everyone |
| Months **J F M … D** (above the bar, Wind on) | Pick a month; the day moves to it | everyone |
| **Rose** (Wind on) | Shows / hides the wind rose (remembered in this browser) | everyone |
| A month's line on the wind rose | Picks that month | everyone |
| **Quality** (bottom left): Lite / Low / High, **OK** | How heavy the 3D is for this computer; OK closes the note. Steps aside while Edit furniture or Edit openings is open | everyone |
| Small map (bottom right, Walk) | Where you are, with a compass to true north (M hides it) | everyone |
| **Walk this level** (Building view) | Walks the picked ground floor, basement, rooftop or common floor | everyone |
| Floor buttons R, the flat floors, G, B1, B2 (Building view, right) | Picks a floor; a basement hides what is above it | everyone |

### 3D view — Finishes panel and notes

| Name | What it does | Who |
|---|---|---|
| **Your name** | So the developer knows who asked | buyer links only |
| A note in the list | Walks you to it | everyone |
| **Remove** (on a note) | Deletes that note | everyone |
| The block for the clicked floor / wall / ceiling | Names it ("Bed-1 · floor") and shows its options | everyone |
| **This wall** / **The whole room** | A wall's choice for that wall only, or every wall of the room | everyone |
| **Same as the group** / **Same as the room** | Takes a one-room / one-wall choice back | everyone |
| An option (brand, price difference) | Chooses it | everyone |
| **Done** | Closes the clicked thing's block | everyone |
| **undo** (under "Chosen for one room or wall") | Takes that one choice back | everyone |
| Options total | The sum of the price differences (shows only) | everyone |
| **Reset to included** | Every choice back to what the flat comes with | everyone |
| Note box: text, **Save**, **Cancel** | Writes the note and pins it to what you clicked | everyone |

### 3D view — Edit furniture panel (bottom left)

| Name | What it does | Who |
|---|---|---|
| **Add** | Opens the library: tabs Living, Dining, Bedroom, Kitchen, Bath, Lights & AC, Greenery, Outdoor, Lobby & gym, Decor (110 pieces); pick one, point at the floor, a wall, the ceiling or (curtains) an opening, click | staff |
| **Turn 90° (R)** | Turns the picked piece (or the one in your hand) | staff |
| **Delete** | Deletes the picked piece and what rests on it — also the one in your hand (Del) | staff |
| **Undo** | Takes back the last change | staff |
| **Reset layout** | Back to the flat's own layout (Undo brings yours back) | staff |

### 3D view — Edit openings panel (bottom left)

| Name | What it does | Who |
|---|---|---|
| **Door / Window / Slider / Passage** | Changes the picked opening's kind | staff |
| **Width**, **Height**, **Sill** | Type a size (`3'-6"`, `3.5`, `1.07m`); Enter sets it | staff |
| **Length**, **Height** (a low wall) | Type its length (the end B moves) or height | staff |
| **Delete** | Removes the picked opening (Del) | staff |
| **Undo** | Takes back the last change (Ctrl+Z) | staff |

### Studio — top bar (all staff)

| Name | What it does |
|---|---|
| **Plotline** (top left) | Opens the 3D viewer |
| Staff mode (badge) | Says this browser is in staff mode — not a button |
| **Unit name**, **Project**, **Floor**, **Area sft** | Plain fields saved with the drawing (Floor takes numbers only) |
| ⏱ | How long you have been tracing |
| **Undo** / **Redo** | Ctrl+Z / Ctrl+Y |
| **Auto-trace** | Traces the flats from the picture: point at a flat, click it — or **Whole floor** |
| **Import** | Opens a drawing file (Ctrl+O) |
| **Export** | Saves the drawing as a file (Ctrl+S) |
| **Export answers** | Saves every Check these answer clicked in this browser (and the Local AI's) as `plotline-answers.json` |
| **Preview 3D** | Opens your drawing in the 3D view, in a new tab |
| **Building** | Shows / hides the project's floor list (or starts a project) |
| **Site** | Where the building stands: map, plot, neighbours, wind, true north |
| **Share link** | Makes a buyer link and copies it (asks once for the staff key; only when the database is set up) |
| **Change list** | Opens `/changes` (only when the database is set up) |

### Studio — the plan area

| Name | What it does |
|---|---|
| **Choose plan image…** | Picks the plan picture (or drop it on the page) |
| **Whole floor** (Auto-trace box) | Traces every flat of the floor and the lobby, stair and lifts in one go |
| **Cancel** (Auto-trace box) | Stops Auto-trace |
| Length box | A wall's length or the scale's real length (Enter; Tab = angle while drawing) |
| Room box: **Room name**, **Kind**, **Printed size**, **Floor level**, **Ramp**, **To level**, the ramp's direction arrows, **Save**, **Remove** | Names a room (R) |
| Problem box on the plan: its fix buttons, **Name this room** (Enter), **×** | Opens from a numbered mark or a row; fixes it in one click |
| **Start over** / **×** (on "Draft restored") | Empties the Studio / hides the message |
| A link in a message (e.g. **Use its scale and position**) | Does what it says (15 seconds) |

### Studio — the tools (left, letters as keys)

| Name | What it does |
|---|---|
| **V Select**, **S Scale**, **W Wall**, **A Arc**, **O Opening**, **R Room**, **C Column**, **F Furniture** | Picks the tool; locked (greyed) until the scale is set, except V and S |

### Studio — right-hand panel

| Section | Buttons and fields | What they do |
|---|---|---|
| **Draw a** (W) | **Wall**, **Low wall**, **Kerb**, **Zone line**; **Low wall height** | What the next wall is (keys 1–4) |
| **Place an opening** (O) | **Door 2'-6"**, **Door 3'-0"**, **Window 4'**, **Window 6'**, **Slider 6'**, **Slider 8'**, **Passage**, **Glass wall**; **Width** | What the next click on a wall puts in |
| **Steps** | (none) | The checklist; ticks itself |
| **Selection** — a corner | **X (m)**, **Y (m)** | Its exact place |
| **Selection** — a wall | **Wall / Low wall / Kerb / Zone line**, **Width (inches)** with **Partition 5"** / **Exterior 10"**, **Height (0 = zone line)**, **Stands alone**, **Length (moves B)**, **Copy wall (Ctrl+D)**, **Delete wall (Del)** | Change one wall |
| **Selection** — several | the wall types, **Height (all of them)**, **Width**, **Stands alone** | Change them all at once |
| **Selection** — while drawing | **Width** (5" / 10") | The walls being drawn |
| **Selection** — an opening | **Door / Window / Slider / Passage**, **Width**, **Height**, **Sill**, **From corner A**, **From corner B**; for a door **Hinge** and **Swing** | Change one opening |
| **Selection** — a column | **Width (across)**, **Depth (up–down)**, **Delete** | Its size |
| **Selection** — a room name | **Room name**, **Kind**, **Flat** (by its doors / a flat / Not in a flat / New flat / Back to: by its doors), **Printed size**, **Floor level**, **Ramp**, **Delete** | Change one room's name and details |
| **Selection** — a piece (F) | **X (m)**, **Y (m)**, **Turn 90° (R)**, **Delete**, **W / D / H (m)** (pieces that stretch; curtains: **W**), **Reset to preset**, **Reset all** | Change one piece; put a room (or all) back to the automatic layout |
| **Add a piece** (F) | **Pick from the library…** | A new piece; click the plan to put it there (curtains: beside an opening) |
| **Check these** (after Auto-trace) | per row: **Name it**, **Close it …**, **Show me**, **Join it to …**, **Make it a wall / low wall / zone line**, **Make it open (no door)** / **Make it a door**, **Take it out**, **Looks right**, **Ask AI** (then **Apply** or **Undo**); beside the heading **Ask AI for all**; click a row = go to it | Answer what Auto-trace was unsure of |
| **Check these** — settings | **Wall tracks** (tick box: which tracing method — leave it on); **AI helper (optional)**: a Gemini key; **Local AI (this PC, free)**: **Server**, **Model**, **Use it anyway**, **Test** | How Auto-trace and Ask AI work |
| **Issues** | **Join walls (overlaps and crossings)**; click an issue = its fixes (Close the gap, Join, Extend, Remove end, Keep — it stands alone, Remove, Merge corners, Remove the copy, Shrink, Move it inside, Trim, Join here, End it here, Type the name, Join with a zone line) | Problems in the drawing |

### Studio — Site panel (top bar → Site)

| Name | What it does |
|---|---|
| Address box, **Find** | Finds the place (an address, or "lat, lon") |
| The map | Click your plot: the neighbours, roads and wind come in; click a block or a road to pick it |
| **Height (m)**, **Delete block** | A picked neighbour's height; or take it out |
| **Delete road** | Takes a picked road out |
| **True north (°)** | Typed north (or drag the gold arrow on the plan) |
| **Fetch again** | Asks the map and the weather once more (your edits are lost) |
| **Remove site** | Takes it all away |
| **×** | Closes the panel |

### Studio — Building (the project's floor list)

| Name | What it does |
|---|---|
| New project: **Name**, **Basements**, **Floors above ground**, **Rooftop**, **Create project** | Starts a project |
| **Or open a project** | Opens one you made |
| **Put only this plan into a building…** | The old one-plan way (last row) |
| **Rename**, **Delete**, **Close** | The project itself |
| **Show building** | The stacked building in a new tab |
| **Open now** (name) | Renames the drawing open now |
| **Also on floors** + **Apply** | Puts the open drawing on more floors (`2, 4, 6-8`) |
| **Delete this drawing** | Takes it off every floor and deletes it |
| Per floor: **Draw**, **Open**, **Use drawing…**, **Clear** | Give a floor a drawing, open it, use another, or empty the floor |
| Old way: **Use this plan as** (A flat / Ground floor / Basement / Common floor / Rooftop), **Building**, **Name**, **This flat on floors … to …**, **Next to it on each floor** (None / Mirrored, left / Mirrored, right), **Basement number**, **On floor**, **Move it right**, **Move it down**, **Back to the automatic place**, **Show building**, **Take this flat out** / **Take this plan out** | One plan into a building, without a project |

### Change list (`/changes`, staff)

| Name | What it does |
|---|---|
| Staff key, **Open** | Opens the list (the key printed when the database was set up) |
| **Refresh** | Loads it again |
| **Export CSV** | Saves every row as a spreadsheet file |
| **Open link** / **Copy link** (per buyer link) | Opens or copies that buyer link |
