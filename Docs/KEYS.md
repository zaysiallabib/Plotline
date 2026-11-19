# Plotline — every key and every button

All the keys, mouse moves and buttons a person can use, in one place. Read from the code on 2026-10-19 (branch `s27/finish` at 32aadf2: the P key for the wind, curtains on any opening and Delete on the piece in your hand are in); the 3D view's buttons moved on 2026-11-20 (session 30: one bar top right, Sun & wind at the bottom middle, Quality under ⋯). How each one works in detail is in [MANUAL.md](MANUAL.md): the last column says where.

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
| **Enter** | Confirms the box you are typing in: a wall's length, the scale's real length, the room box (= Save), a floor level, a wall width, a floor plan's floors box (= Apply), the New project name (= Create project), the Site address (= Find), the name box on the plan | text boxes | §5, §6 |
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
| **P** | Wind on / off — the same as the Wind button on the Sun & wind card (the pill at the bottom middle) | Walk, Dollhouse, Building | everyone | §2 Always on screen |
| **M** | Hides / shows the small map (the same as its × and the **Map** button) | Walk | everyone | §2 Always on screen |
| **Esc** | Gives the mouse back, and one step back: an open list or menu (Rooms, Edit, ⋯) closes first; a piece in your hand goes back where it was (a new one is dropped); in Edit furniture: closes the library and unpicks; in Edit openings: unpicks; else stops Comment and drops an unsaved note; else closes Finishes and the Sun & wind card | any | everyone | §2, §3 |
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

### Front page (`/`)

| Name | What it does | Who |
|---|---|---|
| **Plotline** (top left) | Back to the top of the front page | everyone |
| **See a flat** (top bar, top of the page, end of the page) | Opens flat type A in 3D (`/u/type-a`) | everyone |
| **Studio** (top bar), **Open the Studio** (end of the page) | Opens the Studio | everyone (like any visit to the Studio, it makes the browser staff) |
| **For developers** | Slides the page down to "How it works" | everyone |

### 3D view — start screen

| Name | What it does | Who |
|---|---|---|
| **Enter** | Goes in; you stand inside the front door | everyone |
| The other flats and levels (a quiet list at the bottom: Flats, then each tower's levels) | Open another built-in flat or level | `/u/…` addresses (not on a buyer link: `/s/…` or a Share link) |
| **Studio** (small, top right) | Opens the Studio | `/u/…` addresses |
| **Staff mode** / **Leave staff mode** (small, top right) | Turns staff mode on / off in this browser | `/u/…` addresses |

### 3D view — top

| Name | What it does | Who |
|---|---|---|
| Room box (top left) | The room you stand in: floor, name, printed size; with Wind on, the wind in words. **Click it** for the list of rooms (it replaces the old Rooms button); click a room to jump there | everyone |
| **Walk** · **Dollhouse** · **Building** (the switch at the left of the bar, top right) | Walk inside at eye height (O) · the whole plan from above, roof off (O) · the whole tower (B — only when the flat belongs to one). The one you are in is filled white | everyone |
| **Finishes** | Opens the finishes panel (F) | everyone |
| **Comment** | Click anything to leave a note (C) | everyone |
| **Share** | Copies a link that opens with the finishes you chose | everyone |
| **Edit ▾** → **Furniture** | Edit furniture: move, turn, resize, delete or add furniture | staff |
| **Edit ▾** → **Openings** | Edit openings: move, resize, change or remove doors, windows, sliders, passages, low walls | staff, not on a buyer link |
| **Edit ▾** → **Plan (Studio)** | Edit plan: opens this flat or level in the Studio, in a new tab | staff |
| **⋯** (the last button of the bar) → **Quality**: **Lite** · **Low** · **High** | How heavy the 3D is for this computer; a gold dot marks the one recommended for this device; a new choice reloads the page | everyone |
| **Enter VR** / **Exit VR** | Into / out of the headset — only when one is connected | everyone |

### 3D view — bottom

| Name | What it does | Who |
|---|---|---|
| The hint (bottom middle, above the pill) | The keys for what you are doing; it fades after a few seconds and comes back when it changes or when the mouse is over where it was. While Comment is on it stays: "Click anything to leave a note · Esc stops" | everyone |
| **Sun & wind** pill (bottom middle: a sun, the time, the month, a small compass; "Wind" while the wind is on) | Opens the Sun & wind card | everyone |
| **⌄** (top right of the card) | Closes the card back to the pill (or Esc) | everyone |
| Compass (left of the card; small on the pill) | Where true north is as you look now — the top of the compass is straight ahead; it turns as you turn. N is gold | everyone |
| Day (the date on the card) | The day the sun (and the wind's month) is shown for; starts on today | everyone |
| Time of day (the slider, 0 to 24) | The sun moves with it; the slider is coloured by the site's own day (night, dawn, day, dusk) and the time shows large above it | everyone |
| **Lights** (on the card) | The flat's lamps on / off (automatic after sunset) | everyone |
| **Wind** (on the card) | The wind through the flat this month, on / off (P) | everyone |
| Months **Jan … Dec** (on the card, always) | Pick a month; the day moves to it (the sun and the wind follow) | everyone |
| A month's line on the compass (Wind on) | With the wind on, the compass shows every month's wind as a line toward where it comes from; a click on one picks that month (this replaces the old Rose button) | everyone |
| Quality note (bottom left: "High quality. This device can show the full look.") | Shows by itself only the first time, or after an automatic switch; **Change** opens ⋯ → Quality, **×** closes it; it goes by itself after 12 seconds | everyone |
| Small map (bottom right, Walk) | Where you are, with a compass to true north on the plan; **×** hides it, **Map** brings it back (or M). It steps aside while Finishes is open | everyone |
| Floors (Building view, right): **Roof**, the flat floors, **Ground**, **B1**, **B2** | Picks a floor (the picked one is filled white, your flat's floor has a gold dot); a basement hides what is above it | everyone |
| **Walk this level** (Building view, under the floors) | Walks the picked ground floor, basement, rooftop or common floor | everyone |

### 3D view — Finishes panel and notes

| Name | What it does | Who |
|---|---|---|
| **×** (top right of the panel) | Closes the panel (or F, or Esc) | everyone |
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

### 3D view — "which floors?" box (a project floor whose drawing is on other floors too)

Shows at the first furniture change, or at **Edit ▾ → Openings**, on a floor of a Studio project whose drawing is also on other floors: "Floor plan A is also on floors 1, 3, 4. Change:"

| Name | What it does | Who |
|---|---|---|
| **Floor 2 only** | Floor 2 gets its own copy of the drawing; your change is kept on it and the page opens again on that copy (the other floors stay as they are) | staff |
| **All 4 floors** | The change goes to every floor with the drawing | staff |

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
| **Import** | Opens a drawing file (Ctrl+O), or the architect's own file (.ifc, .dxf, .pdf, .glb, .gltf, .obj, .fbx, .dae, .stl, .3dm) — see MANUAL §5 "Bring in the architect's file" |
| **Export** | Saves the drawing as a file (Ctrl+S) |
| **Export answers** | Saves every Check these answer clicked in this browser (and the Local AI's) as `plotline-answers.json` |
| **Preview 3D** | Opens your drawing in the 3D view, in a new tab |
| **Building** | Shows / hides the project's floor list (or starts a project) |
| **Site** | Where the building stands: map, plot, neighbours, wind, true north |
| **Share link** | Makes a buyer link and copies it (signed in: for your company; not signed in: asks once for the staff key; only when the database is set up) |
| **Change list** | Opens `/changes` (only when the database is set up) |
| **Sign in** / your email | Opens the account card below (only when the database is set up) |
| Saved · Saving… · Offline, will retry · Not saved: … | Where your work stands in the cloud — not a button (MANUAL §5 "Signing in and saving to the cloud") |

### Studio — the account card (top bar → Sign in, or your email)

| Name | What it does |
|---|---|
| Email, **Send me a link** (Enter works too) | Emails you a sign-in link; open it in this same browser |
| **Use another email** | Back to the email box |
| **Open** (per project) | Puts that cloud project or drawing in the Studio in place of what is open |
| **Rename** | Its name, for everyone in the company |
| **Earlier saves** → **Open this save** | Every save of it; puts that older copy in the Studio (it becomes the newest when it saves) |
| **Hide earlier saves** | Closes that list |
| **Delete** | Takes it off the company's list (asks first; every save stays in the history) |
| **Open theirs** / **Keep mine** | Only after "someone saved a newer version": take their copy, or save yours on top (theirs stays in Earlier saves) |
| **Save as new** | Only after "it was deleted from the cloud": keeps your copy as a new one |
| **Sign out** | Saves what is waiting, then signs out |
| **Close** | Closes the card |

### Studio — the plan area

| Name | What it does |
|---|---|
| **Choose plan image…** | Picks the plan picture (or drop it on the page) — the architect's file too (Import's list) |
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
| **What was read from the file** (after an architect's file) | **Dismiss** | The file's unit, what was guessed, what it lacked |
| **Outside shape** (the drawing has one) | **Offset x (m)**, **Offset y (m)**, **Turn (deg)**, **Floor height (m)**, **Remove outside shape** | Where the architect's model stands over the plan, how high this floor is inside it; take it away (deleted from this browser) |
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
| Per floor, in the **Use drawing…** menu: **This floor only — its own copy** (only when that floor's drawing is on other floors too) | That floor gets its own copy of the drawing ("Floor plan A · floor 5") and it opens; changes to it stay on that floor |
| **Ask again** (under **Show building**, after you answered the 3D view's "which floors?" box) | Forgets the answer: the 3D view asks again |
| Old way: **Use this plan as** (A flat / Ground floor / Basement / Common floor / Rooftop), **Building**, **Name**, **This flat on floors … to …**, **Next to it on each floor** (None / Mirrored, left / Mirrored, right), **Basement number**, **On floor**, **Move it right**, **Move it down**, **Back to the automatic place**, **Show building**, **Take this flat out** / **Take this plan out** | One plan into a building, without a project |

### Change list (`/changes`, staff)

| Name | What it does |
|---|---|
| Staff key, **Open** | Not signed in: opens the list of links made before accounts (the key printed when the database was set up). Signed in to a company: not asked — the list is your company's |
| **Refresh** | Loads it again |
| **Export CSV** | Saves every row as a spreadsheet file |
| **Open link** / **Copy link** (per buyer link) | Opens or copies that buyer link |
| **Turn off** (per buyer link, signed in) | Asks first, then the link stops opening for good ("This unit isn't available"); what the buyer wrote stays. A turned-off link shows "turned off" and the date |
