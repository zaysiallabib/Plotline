# Plotline — every key and every button

One table per screen. How each one works in detail: [MANUAL.md](MANUAL.md), the section in the last column.
Rule: when a key or a button is added, changed or removed, this file changes in the same commit (as MANUAL.md does).
**Who:** staff = the developer's team (a browser becomes staff the first time it opens the Studio, or with `?staff=1`);
buyer = someone on a buyer link; everyone = both. On a buyer link (`/s/…`) nobody is staff, even in a staff browser:
no staff row below shows there. Checked against the product on 2026-11-21.

## Everywhere

| Key / button | What it does | Where | Who | MANUAL |
|---|---|---|---|---|
| Any key while the cursor is in a text box | Goes into the box (the letters are typed). **Enter** or a click on the plan / the 3D gives the keys back. Ctrl+S and Ctrl+O still work in the Studio | every screen | everyone | §10 |
| **Cancel** (or **Esc**) on a question card | Says no: nothing changes | the white card in the middle of the screen | staff | Start here |
| The second button on a question card (or **Enter**) | Says yes; it names what happens — **Delete**, **Replace**, **Continue**, **Turn off**, **Remove**, **Start over**, **Make it my draft**; red when something is taken away | the same card | staff | Start here |
| The line to type in on a question card | Opens with the old name in it, selected: type over it; **Rename** / **Share** (or **Enter**) takes it | the card, when it asks for a new name or the staff key | staff | Start here |

## Front page (`/`)

| Key / button | What it does | Where | Who | MANUAL |
|---|---|---|---|---|
| Scrolling | Plays the story: the plan's walls rise, the floors stack into a tower; scrolling up plays it back | the page | everyone | §0 |
| **See a flat** | Opens flat Type A in 3D (`/u/type-a`) | top bar, the blue button by the plan, end of the page, footer | everyone | §0 |
| **Studio** / **Open the Studio** | Opens the Studio (like any visit to it, makes the browser staff) | top bar, by the plan, end of the page, footer | everyone | §0 |
| **Plotline** | Back to the top | top left, once you have scrolled | everyone | §0 |

## 3D view (`/u/…`, `/s/…`)

| Key / button | What it does | Where | Who | MANUAL |
|---|---|---|---|---|
| **Enter** (button or key) | Goes in; you stand inside the front door. "or press Enter" under it (not under a finger) | start screen | everyone | §2 Start screen |
| **Change** (in "High quality · …") | Shows **Lite · Low · High** right there (a blue dot marks the recommended one); a pick opens the page again with it | start screen | everyone | §2 Choosing quality |
| The other flats and levels (quiet list at the bottom) | Opens another built-in flat or level | start screen, not on a buyer link | everyone | §2 Start screen |
| **Studio** · **Staff mode** / **Leave staff mode** (small, top right) | Opens the Studio · turns staff mode on / off in this browser | start screen, not on a buyer link | everyone | §2 Start screen |
| **W** or **↑** · **S** or **↓** | Walk forward · back | Walk | everyone | §2 Moving in Walk |
| **A** / **D** | Step left / right | Walk | everyone | §2 Moving in Walk |
| **←** / **→** | Turn left / right (step sideways while the mouse turns your head) | Walk | everyone | §2 Moving in Walk |
| **Shift** held | Walk faster (about 4 m/s instead of 1.8) | Walk | everyone | §2 Moving in Walk |
| Click a spot on the floor | Walk there (not while Comment or Finishes is open) | Walk, mouse free | everyone | §2 Moving in Walk |
| Double-click | The mouse turns your head; **Esc** gives it back | Walk, not in an editor | everyone | §2 Moving in Walk |
| **Up to …** / **Down to …** | Takes the stair: the floor above / below comes into the same 3D, no new page ("Floor 4 …" at the bottom while it gets ready), you stand at its stair (walking up the second flight, or under it from the floor, does the same) | bottom middle, standing in a stair room of a building | everyone | §2 Moving in Walk |
| The browser's **Back** / **Forward** | Takes the last stair back down / up again, without a new page | after a stair | everyone | §2 Moving in Walk |
| Drag · wheel · right-drag | Turn · zoom · slide the view | Dollhouse, Building | everyone | §2, §4 |
| Click a room's floor | Drops you into that room (not while Finishes is open) | Dollhouse | everyone | §2 |
| Click a flat | Opens it | Building | everyone | §4 |
| **O** | Walk ↔ Dollhouse (from the Building view: Walk) | any view | everyone | §2 The bar |
| **B** | The Building view | a flat that belongs to a tower | everyone | §2, §4 |
| **Walk** · **Dollhouse** · **Building** | The view switch; the one you are in is white | the bar, top right | everyone | §2 The bar |
| **Finishes** / **F** | Opens / closes Finishes (closes Comment); in Clean view also brings everything back | the bar | everyone | §2 Finishes panel |
| **Comment** / **C** | Comment on / off (closes Finishes): click anything to leave a note; in Clean view also brings everything back | the bar | everyone | §2 Notes |
| **Share** | Copies a link that opens with the finishes you chose | the bar | everyone | §2 The bar |
| **Edit ▾ → Furniture** | Edit furniture: move, turn, resize, delete, add | the bar | staff | §3 Edit furniture |
| **Edit ▾ → Openings** | Edit openings: doors, windows, sliders, passages, low walls | the bar | staff | §3 Edit openings |
| **Edit ▾ → Plan (Studio) ↗** | Opens this flat or level in the Studio, in a new tab | the bar | staff | §3 |
| **Edit ▾ → Download 3D model** | Saves this flat as one `.glb` once every room has arrived | the bar | staff | §3, §5 Give the drawing back |
| **⋯ → Quality: Lite · Low · High** | How heavy the 3D is; a blue dot marks the recommended one; a new choice reloads the page | the bar | everyone | §2 Choosing quality |
| **H** · the eye (last button) · **⋯ → Clean view** | Clean view on / off: everything on screen goes but a faint dot top right; remembered for the browser tab | any view | everyone | §2 Clean view |
| The faint dot (top right) | Brings everything back (or **H**, **Esc**, a tap) | Clean view | everyone | §2 Clean view |
| **Enter VR** / **Exit VR** | Into / out of the headset | the bar, only with a headset connected | everyone | §2 In VR |
| The room's name (top left) | Click it for the list of rooms (yours is the white row); click a room to jump there. In the Building view it names the picked floor | top left | everyone | §2 Top left |
| Moving the mouse, a click, the wheel, any key but W A S D / arrows / Shift | Brings back what faded while the mouse rested (3 s still: all but the room's name fades) | Walk | everyone | §2 Resting |
| The hint | The keys for what you are doing; fades after a few seconds, back when it changes or when the mouse rests where it was | bottom middle | everyone | §2 The hint |
| A short message | Answers what you just did ("Link copied …"); fades by itself | bottom middle, above the hint | everyone | §2 |
| **Sun & wind** pill (sun, time, month, compass; "Wind" while on) | Opens the Sun & wind card | bottom middle | everyone | §2 Sun & wind |
| **⌄** | Folds the card back into the pill (or Esc) | the card, top right | everyone | §2 Sun & wind |
| The compass | True north as you look now (its top = straight ahead; N is blue); with Wind on it is the wind rose | the card, top left; small on the pill | everyone | §2 Sun & wind |
| The date | The day the sun and the wind's month are shown for; starts on today | the card | everyone | §2 Sun & wind |
| The time slider (0 to 24) | Moves the sun; coloured by the site's own day | the card | everyone | §2 Sun & wind |
| **Jan … Dec** | Picks a month; the day moves to it | the card | everyone | §2 Sun & wind |
| **Lights** | The flat's lamps on / off; automatic after sunset; a click again goes back to automatic | the card | everyone | §2 Sun & wind |
| **Wind** / **P** | The wind through the flat this month, on / off | the card; P in Walk, Dollhouse, Building | everyone | §2 Sun & wind |
| A month's line on the wind rose | Picks that month | the card, Wind on | everyone | §2 Sun & wind |
| Small map: **×** / **M** / **Map** | Hides it (× shows when the mouse is over it) / brings it back | bottom right in Walk (top right on a phone) | everyone | §2 Small map |
| Floors: **Roof**, the flat floors, **Ground**, **B1**, **B2** | Picks a floor (white row; your flat's floor has a blue dot); a basement hides what is above | Building view, right | everyone | §4 |
| **Walk this level** | Walks the picked ground floor, basement, rooftop or common floor | Building view, under the floors | everyone | §4 |
| **×** (Finishes) · **×** (Comment) | Closes Finishes (or F, Esc) · stops Comment (or C, Esc) | the panel's top right | everyone | §2 |
| **Your name** | So the developer knows who asked | Finishes and Comment, buyer links only | buyer | §2 |
| Click a floor, a wall or a ceiling | Chooses the finish for that one room or wall | Finishes open, Walk or Dollhouse | everyone | §2 Finishes panel |
| **This wall** · **The whole room** | A wall's choice for that wall only, or every wall of the room | Finishes, the clicked thing's block | everyone | §2 Finishes panel |
| **Same as the group** / **Same as the room** · **Done** | Takes a one-room / one-wall choice back · closes the block | the same block | everyone | §2 Finishes panel |
| An option (brand, price difference) | Chooses it (the chosen one is white) | Finishes | everyone | §2 Finishes panel |
| **undo** | Takes one one-room / one-wall choice back | Finishes, "Chosen for one room or wall" | everyone | §2 Finishes panel |
| **Options total** · **Reset to included** | The sum of the price differences (shows only) · every choice back to what the flat comes with | Finishes, bottom | everyone | §2 Finishes panel |
| **+ Add option** | A finish option of your own in that group: **Name**, **Brand**, **Code**, **Price difference ৳**, **Offered in**, **Its look** (**Colour** · **Texture** with **Tinted** · **Picture**, JPG / PNG up to 4 MB, with **One picture covers**), **Add option**, **Cancel** | Finishes, under each group, not on buyer links | staff | §3 Your own furniture, finishes and textures |
| **⋯** beside your own option | The same form: **Save**, **Remove**, **Cancel** | Finishes, not on buyer links | staff | §3 Your own … |
| Click anything | Puts a note on it (you stay where you are) | Comment on | everyone | §2 Notes |
| Note box: **Save** · **Cancel** | Pins the note; Comment stays on for the next | Comment on | everyone | §2 Notes |
| A note in the list · **Remove** | Walks you to it · deletes it | Comment, "Your notes" | everyone | §2 Notes |
| Click a piece · drag it · drag a dot | Picks it (also through glass) · moves it (a TV, picture, AC, clock or mirror also up and down its wall, 1-inch steps) · bigger or smaller (curtains: wider or narrower on that side); drag the empty room to look round | Edit furniture | staff | §3 Edit furniture |
| **G** | Picks up the piece under the mouse (under the dot while the mouse turns your head), also through glass; **G** again puts it down | Walk or Dollhouse, not in Edit openings | staff | §3 Edit furniture |
| **R** · **Turn 90° (R)** (on a phone: **Turn 90°**) | Turns the piece picked or in your hand 90° (a TV on its unit turns the unit, the TV still on it) | Walk, Dollhouse | staff | §3 Edit furniture |
| **Del** / **Backspace** · **Delete** | Deletes the picked piece, or the one in your hand, with what rests on it (a new one from the library is only let go) | Edit furniture, or a piece in your hand | staff | §3 Edit furniture |
| **Ctrl+Z** · **Undo** | Takes back the last furniture or opening change | Edit furniture, Edit openings | staff | §3 |
| **Reset layout** | Back to the flat's own layout (Undo brings yours back) | Edit furniture panel | staff | §3 Edit furniture |
| **Add** · the library's **×** | Opens the library (titled LIBRARY, its **×** closes it; on a phone a sheet from the bottom with a grip): the search box (ready to type; on a phone tap it first), **Recent**, the groups Living · Dining · Bedroom · Office · Kitchen · Bath · Lights & AC · Greenery · Outdoor · Lobby & gym · Decor (and **Your own**); click a piece, point at the floor, a wall, the ceiling or (curtains) an opening, click (a finger: tap the piece, then tap where it goes) | Edit furniture panel | staff | §3 The library |
| **Enter** · **Esc** in the library's search box | Takes the first piece listed · empties the box and closes the library | the library | staff | §3 The library |
| **+ Add your own…** | A 3D model of your own: drop it or **Choose a file…** (GLB, glTF, OBJ, FBX, DAE, STL; up to 30 MB, 2 million triangles; a model in several files: its folder, a .zip, or all its files together), **Name**, **Kind**, **Which side is the front** (four arrows), **Where it sits** (Floor · Wall · Ceiling · On a table), **Real size** (type one side; an OBJ / STL that names no unit and cannot be metres first offers **Inches** · **Centimetres** · **Millimetres** with the width each gives), **It gives light**, **Add to the library** (it is in your hand), **Cancel** / **×** / Esc | the library, under the search box | staff | §3 Your own … |
| **⋯** on a row marked **yours** | **Rename**, **Change size** (**Save**), **Remove…** (**Remove** / **Keep**; placed pieces stay) | the library | staff | §3 Your own … |
| **Floor 2 only** · **All 4 floors** · **Esc** | Floor 2 gets its own copy and keeps your change (the page opens again on it) · the change goes to every floor with the drawing · the change is taken back, asked again next time | "Floor plan A is also on floors … Change:", at the first change on a shared project floor | staff | §6 One floor different |
| Click · drag · drag a dot | Picks a door, window or passage · slides it along its wall · width, height, a window's sill; drag the empty room to look round | Edit openings | staff | §3 Edit openings |
| **Door · Window · Slider · Passage** | Changes the picked opening's kind | Edit openings panel | staff | §3 Edit openings |
| **Width**, **Height**, **Sill** | Type a size (`3'-6"`, `3.5`, `1.07m`), Enter | Edit openings panel | staff | §3 Edit openings |
| Click a low wall · drag an end dot · drag the wall | Picks it (under 1.2 m: railing, parapet, planter edge, kerb) · longer / shorter along its line (a joined end leaves its corner) · moves it across | Edit openings | staff | §3 Edit openings |
| **Alt** + drag a low wall's end dot | Keeps its corner joined: the wall it meets moves with it | Edit openings | staff | §3 Edit openings |
| **Length**, **Height** (a low wall) | Type its length (end B moves) or height | Edit openings panel | staff | §3 Edit openings |
| **Del** / **Backspace** · **Delete** | Removes the picked opening or low wall | Edit openings | staff | §3 Edit openings |
| **Esc** | Gives the mouse back and goes one step back: in Clean view only brings everything back; the "which floors?" box takes the change back; an open list or menu (rooms, Edit, ⋯) closes first; a piece in your hand goes back (a new one is dropped); in Edit furniture closes the library and unpicks; in Edit openings unpicks; else drops an unsaved note; else stops Comment; else closes Finishes and the Sun & wind card | any | everyone | §2, §3 |
| Number keys | Nothing | — | — | — |
| One finger drag | Look round (the room follows the finger) | Walk, a finger | everyone | §2 On a phone or tablet |
| Tap the floor | Walk there (not while Comment or Finishes is open) | Walk, a finger | everyone | §2 On a phone or tablet |
| Long press (half a second, still) | Nothing | the 3D, a finger | everyone | §2 On a phone or tablet |
| One finger · two fingers pinch / drag | Turn · zoom · slide | Dollhouse, Building, a finger | everyone | §2 On a phone or tablet |
| Tap a room's floor · a flat | Drops you into it · opens it (never after a pinch) | Dollhouse · Building, a finger | everyone | §2 On a phone or tablet |
| Tap anything | Puts a note on it | Comment on, a finger | everyone | §2 On a phone or tablet |
| Pull a sheet's **grip** down · **×** | Closes that sheet (Finishes, Comment, Sun & wind, the rooms list, Edit, ⋯) | a phone (under 720 px wide) | everyone | §2 On a phone or tablet |
| Tap where the faded bar was | Only brings the bar back (presses nothing) | resting, a phone | everyone | §2 On a phone or tablet |
| Tap a piece · drag it · drag near a dot | Picks it · moves it · resizes it (a thumb within half a fingertip of a dot takes the dot) | Edit furniture, a finger | staff | §2 On a phone or tablet |
| Tap where it goes | Puts the piece in your hand there (a new one from the library, or one a drag could not leave) | Edit furniture, a piece in hand, a finger | staff | §2 On a phone or tablet |
| VR trigger · thumbstick left / right | Hold to aim at the floor, let go to jump · turns you 45° | in VR (the keyboard is ignored) | everyone | §2 In VR |

## Studio (`/studio`, staff)

| Key / button | What it does | Where | MANUAL |
|---|---|---|---|
| **Plotline STUDIO** | Opens the front page (the mouse over STUDIO: this browser is in staff mode) | top bar, left | §5 Top bar |
| **Unit name**, **Project**, **Floor**, **Area** (sft) | The drawing's fields; click and type (Floor: numbers only). Under about 1000 px wide Project and Area step aside | top bar | §5 Top bar |
| Saving… · Saved · just now · Offline · will retry · Someone else saved · Not saved: … | Where your work stands online; click it for the account card | top bar, signed in | §5 Accounts |
| **↶** / **↷** · **Ctrl+Z** / **Ctrl+Y** (or **Ctrl+Shift+Z**) | Undo / Redo | top bar; any tool, not in a text box | §5 Top bar |
| **Auto-trace** | Traces the flats: point at a flat and click it, or **Whole floor** | top bar, once a plan picture is in | §5 Auto-trace and Check these |
| **Preview 3D** | Your drawing in the 3D view, in a new tab (the blue button; plain while the Studio is empty) | top bar | §5 Top bar |
| **Building** | Shows / hides the project's floor list (or starts a project) | top bar | §6 |
| **⋯** | The menu: Drawing · Building · Buyers · Account; Esc or a click elsewhere closes it | top bar, right | §5 Top bar |
| **⋯ → Import…** · **Ctrl+O** | Opens a drawing file, or the architect's own (.ifc, .ifczip, .dxf, .dwg once turned on, .pdf, .svg, .glb, .gltf, .obj, .fbx, .dae, .stl, .3dm, .3ds, .kmz, .wrl, .ply), or a .zip; several files at once (a model with its pictures). Ctrl+O works in a text box too | any time | §5 Bring in the architect's file |
| **⋯ → Export** · **Ctrl+S** | Saves the drawing as a Plotline file (.json). Ctrl+S works in a text box too | any time | §5 Top bar |
| **⋯ → Export as DXF** | The drawing for AutoCAD or any drawing program (.dxf, metres, layers WALLS · DOORS · WINDOWS · COLUMNS · TEXT · PLOTLINE_ZONES · PLOTLINE_KERBS) | ⋯ | §5 Give the drawing back |
| **⋯ → Export 3D model** | Opens the 3D view in a new tab, which saves the furnished flat as a .glb | ⋯ | §5 Give the drawing back |
| **⋯ → Print plan…** · **Paper** (A4 · A3 · A2 · A1) · **Scale** (1 : 50 · 1 : 100 · 1 : 200) · **Print** · **Close** / × / Esc | The plan as a sheet; Print opens the browser's print window (Save as PDF there) | ⋯, the Print box | §5 Give the drawing back |
| **⋯ → Export answers** | Saves every Check these answer clicked in this browser (and the Local AI's) as `plotline-answers.json` | ⋯ | §5 Auto-trace and Check these |
| **⋯ → New project** | The floor list with the New project card | ⋯ | §6 |
| **⋯ → Site** | The Site panel (click again to close; "open" shows beside it) | ⋯ | §5 Site |
| **⋯ → Share link** | Makes a buyer link and copies it (signed in: for your company; not signed in: asks once for the staff key, in the marble card) | ⋯, with the online database | §5 Top bar |
| **⋯ → Change list ↗** | Opens `/changes` in a new tab | ⋯, with the online database | §1 |
| **⋯ → Sign in** / your email | Opens the account card | ⋯, with the online database | §5 Accounts |
| Drop a picture or a file on the page · **Choose plan image…** | A plan picture (PNG, JPG, WEBP or TIFF, up to 10 MB) goes under the drawing; a drawing or architect's file opens | any time; the "Start with a plan" box | §5 Top bar |
| **New project** card: **Name**, **Basements**, **Floors above ground**, **Rooftop**, **Create project** (Enter) | Starts a project | beside the "Start with a plan" box, or the floor list | §6 |
| **Whole floor** · **Cancel** | Traces every flat of the floor with the lobby, stair and lifts · stops Auto-trace | the Auto-trace box at the top of the plan | §5 Auto-trace and Check these |
| **Cancel** | Stops reading an architect's file; nothing changes | the "Reading …" box at the top | §5 Bring in the architect's file |
| A page in **Which page is the floor plan?** · **×** / Esc | Uses that page (a clean line drawing opens as the drawing, anything else becomes the plan picture) · closes the box | a PDF of several pages | §5 Bring in the architect's file |
| **Use it as a picture instead** / **Read its lines instead** | Takes the same page the other way | the message after a PDF page | §5 Bring in the architect's file |
| **Use its scale and position** | A picture the same size as one already scaled: no scale to set, the drawings sit over each other (15 seconds) | the message after loading a picture | §6 |
| **Start over** · **×** | Asks first ("The drawing, its picture and its furniture go. Undo cannot bring them back.": **Start over** in red empties the Studio for good, **Cancel** / **Esc** keeps it; a project's drawing is not asked about, it stays in the project) · hides the message | the "Draft restored" message | §5 |
| **V** · **S** · **W** · **A** · **O** · **R** · **C** · **F** | Select · Scale · Wall · Arc · Opening · Room · Column · Furniture; all but V and S locked until the scale is set ("set the scale first (S)") | the tool strip on the left | §5 The tools |
| Hold **W**, **O** or **R** | The tool works while held; let go and you are back on the tool you had (a quick tap just switches) | any tool | §5 The tools |
| Shift + a tool letter | Does not switch the tool (Shift+H is the door swing) | — | — |
| **1 2 3 4** | Wall · Low wall · Kerb · Zone line (what W and A draw next) | W, before the first corner | §5 W — Wall |
| **1 2 3 4** | Door · Window · Slider · Passage, at its usual width | O (also with O held) | §5 O — Opening |
| A digit or **.** · **Tab** · **Enter** | Opens the length box with it · switches length ↔ angle (0° = right) · lays the wall at that length. **0** fits the view instead, so type `.5` | W, while drawing | §5 W — Wall |
| **Enter** | Confirms the box you are in: a wall's length, the scale's length, the room box (Save), a floor level, a wall width, a floor plan's floors (Apply), the New project name, the Site address (Find), a name typed on the plan | text boxes | §5, §6 |
| **Esc** | One step back: stops "Point at a flat"; closes the problem box; lets go of the piece in your hand (a moved one stays, a new one is dropped); closes the room box; ends the wall being drawn; else drops a half-done scale, line-up or arc and unpicks. In a length box: closes it. With a menu, the account card or the Keys sheet open: closes only that | any tool | §5 |
| **Backspace** | While drawing walls: takes back the last piece; otherwise as Del | W; any tool | §5 W — Wall |
| **Del** | Deletes what is picked (asks first when doors or windows would go with walls); in F the picked piece with what rests on it, or the one in your hand | any tool | §5 |
| **T** | Thin 5" ↔ thick 10": the walls being drawn, else the picked walls | W, A, V | §5 W — Wall |
| **H** · **Shift+H** | The picked door's hinge to the other side · its swing in ↔ out | a door picked, any tool but F | §5 O — Opening |
| **Ctrl+D** | Copies the picked walls and room names, a little to one side | any tool | §5 V — Select |
| **Ctrl+A** | Picks every wall | V | §5 V — Select |
| **Arrow keys** · **Shift + arrows** | Nudge what is picked 1 inch · 1 foot | every tool but F | §5 V — Select |
| **Arrow keys** | Move the picked piece one 3-inch square | F | §5 F — Furniture |
| **R** | Turns the picked piece, or the one in your hand, 90° (a TV on its unit and cushions turn their unit with them) | F | §5 F — Furniture |
| **↑ / ↓** · **Enter** | Pick the row above / below (its mark turns blue) · go to it on the plan and open it — once you have clicked in the list | Check these | §5 Auto-trace and Check these |
| **0** | Fits the whole plan on screen | any tool | §5 |
| Mouse wheel · **Space** + drag, right-drag or middle-drag | Zoom at the pointer · slide the plan | any tool | §5 |
| **Shift** held | No snapping or sticking while you point, draw or drag (the status bar shows it at once) | V, W, A, C | §5 The tools |
| **Shift + click** · drag on empty plan | Adds to what is picked (or takes one out) · a dashed box picks every wall, opening and column it touches (Shift: adds); a plain click on empty plan unpicks | V | §5 V — Select |
| **Alt** + drag an end of the picked wall · **Alt** + drag a corner of an unpicked wall | The walls joined at that corner follow · pulls that one wall free of the corner | V | §5 V — Select |
| Double-click a wall | Type its length | every tool but W and A | §5 V — Select |
| Drag a dot on a picked thing | A wall's face dot: its thickness on that side (V) · a column's side or corner dot (V, C) · an opening's end dot: its width (V, O) · curtains' end dot: that side (F) · a ramp's arrow head: its direction (V) · the Site's north arrow (its round dot moves it) | V, C, O, F, Site open | §5 The tools, Site |
| **Draw a** (W): **Wall**, **Low wall**, **Kerb**, **Zone line**, **Low wall height** | What the next wall is | right-hand panel | §5 W — Wall |
| **Place an opening** (O): **Door 2'-6"**, **Door 3'-0"**, **Window 4'**, **Window 6'**, **Slider 6'**, **Slider 8'**, **Passage**, **Glass wall**, **Width** | What the next click on a wall puts in | right-hand panel | §5 O — Opening |
| Room box: **Room name**, **Kind**, **Printed size**, **Floor level**, **Ramp**, **To level**, the direction arrows, **Save**, **Remove** | Names a room | R, click in a closed room | §5 R — Room |
| **Steps** | The checklist; ticks itself, the next step marked with a blue dot | right-hand panel | §5 The right-hand panel |
| **What was read from the file** · **Dismiss** | The file's unit, what was guessed, what it lacked | right-hand panel, after an architect's file | §5 Bring in the architect's file |
| **Layers** · a layer's box (**Plotline decides**, Walls, Kerbs, Zone lines, Doors, Windows, Columns, Room names, Dimensions, Leave out) | Says what a DXF / SVG layer holds: the file is read again, the choice kept for every next file | right-hand panel, under What was read from the file | §5 Bring in the architect's file |
| **Outside shape**: **Offset x (m)**, **Offset y (m)**, **Turn (deg)**, **Floor height (m)**, **Remove outside shape** | Lines the architect's model up with the plan; takes it away | right-hand panel, a drawing with a model | §5 Bring in the architect's file |
| Selection — a corner: **X (m)**, **Y (m)** | Its exact place | right-hand panel | §5 The right-hand panel |
| Selection — a wall: **Wall / Low wall / Kerb / Zone line**, **Width (inches)** with **Partition 5"** / **Exterior 10"**, **Height (0 = zone line)**, **Stands alone**, **Length (moves B)**, **Copy wall (Ctrl+D)**, **Delete wall (Del)** | Changes one wall | right-hand panel | §5 The right-hand panel |
| Selection — several: the wall types, **Height (all of them)**, **Width**, **Stands alone**; the openings' kind, width, height, sill; **Delete them all** | Changes them all at once ("mixed" = they differ) | right-hand panel | §5 The right-hand panel |
| Selection — an opening: **Door / Sliding door / Window / Passage**, **Width**, **Height**, **Sill**, **From corner A**, **From corner B**; for a door **Hinge**, **Swing** | Changes one opening | right-hand panel | §5 The right-hand panel |
| Selection — a column: **Width (across)**, **Depth (up–down)**, **Delete** | Its size | right-hand panel | §5 C — Column |
| Selection — a room name: **Room name**, **Kind**, **Flat** (by its doors · a flat · Not in a flat · New flat · Back to: by its doors), **Printed size**, **Floor level**, **Ramp**, **Delete** | Changes one room's name and details | right-hand panel | §5 Auto-trace and Check these |
| Selection — a piece (F): **X (m)**, **Y (m)**, **Turn 90° (R)**, **Delete**, **W / D / H (m)**, **Height from floor (m)**, **Reset to preset**, **Reset all** | Changes one piece; lays a room (or all) out automatically again | right-hand panel | §5 F — Furniture |
| **Add a piece** (F): the library, **+ Add your own…**, **⋯** on your own pieces | A new piece; click the plan to put it there (curtains: beside an opening) | right-hand panel | §3 The library |
| Check these: a room's line · a row | Shows / folds its rows · goes to it on the plan | right-hand panel, after Auto-trace | §5 Auto-trace and Check these |
| Check these buttons: **Name it**, **Close it …**, **Show me**, **Join it to …**, **Make it a wall / a low wall / a zone line**, **Make it open (no door)** / **Make it a door**, **Take it out**, **Looks right** | Answers what Auto-trace was unsure of, in one click (one Ctrl+Z) | a row, or its box on the plan | §5 Auto-trace and Check these |
| **Ask AI** · **Apply** · **Undo** · **Ask AI for all** | Asks the Local AI for this row · applies a fix it only suggested · takes its fix back · asks every row not asked yet | Check these | §5 Auto-trace and Check these |
| **Wall tracks** · **AI helper (optional)** · **Local AI**: **Server**, **Model**, **Use it anyway**, **Test** | The tracing method (leave it on) · a Gemini key · the Local AI's settings | under Check these | §5 Auto-trace and Check these |
| Marks on the plan: a red numbered badge · an amber dot · an outlined badge with a count | Click one: its problem box opens (a count: the first row, with **Also here** for the others) | the plan, V | §5 Auto-trace and Check these |
| Problem box: its fix buttons, **Name this room** (Enter), **Also here**, **×** | Fixes it in one click | the plan | §5 Auto-trace and Check these |
| **Issues**: **Join walls (overlaps and crossings)**; click an issue | Fixes every overlap and crossing · zooms to it with its fixes (Close the gap, Join, Extend, Remove end, Keep — it stands alone, Remove, Merge corners, Remove the copy, Shrink, Move it inside, Trim, Join here, End it here, Type the name, Join with a zone line) | right-hand panel | §5 The right-hand panel |
| The status bar: the line on the left · the middle · the time, **1 px = … m**, the zoom | What the tool does · length, angle, what the point sticks to (red when a piece cannot go there) · how long you have traced, the scale, the zoom | bottom | §5 Top bar |
| **Keys** · **?** | Opens / closes the Keys sheet (every key, the tool you are on explained in full); **×**, Esc or a click elsewhere closes it | bottom right; any time, not in a text box | §5 Top bar |
| Account card: email, **Send me a link** (Enter), **Use another email** | Emails a sign-in link; open it in this same browser | ⋯ → Sign in | §5 Accounts |
| Account card — **Projects**: **Open**, **Rename**, **Earlier saves** → **Open this save**, **Hide earlier saves**, **Delete** | Your company's projects online | ⋯ → your email | §5 Accounts |
| **Open theirs** / **Keep mine** · **Save as new** | After "Someone else saved" · after "Deleted in the cloud" | the account card | §5 Accounts |
| **Members**: their work email, **Staff** / **Owner**, **Invite**, **Copy this for them**, **Make owner** / **Make staff**, **Remove**, **Take back** | Invites, changes roles, removes people (only an owner sees the buttons) | the account card | §5 Accounts |
| **Links**: **Copy link**, **Turn off**, **Change list** | Copies a buyer link · turns it off for good (asks first) · opens `/changes` | the account card | §5 Accounts |
| **Sign out** · **Close** (or Esc) | Saves what is waiting, signs out · closes the card | the account card | §5 Accounts |
| Site: address box, **Find** | Finds the place (an address, or "lat, lon") | ⋯ → Site | §5 Site |
| Site: the map, **+ / −**, wheel, drag | Click your plot (neighbours, roads and wind come in); click a block or a road to pick it; zoom and slide | ⋯ → Site | §5 Site |
| Site: **Height (m)**, **Delete block**, **Delete road**, **True north (°)**, **Fetch again**, **Remove site**, **×** | A neighbour's height or removal · a road's removal · typed north · ask the map again · take the site away · close | ⋯ → Site | §5 Site |
| Floor list — the project: **Rename**, **Delete**, **Close**, **Show building**, **Ask again**, **Or open a project** | The project itself · the stacked building in a new tab · forget the "which floors?" answer · open another | Building | §6 |
| Floor list — **Floor plans**: a plan's floors box (`2, 4, 6-8`), **Apply**, **Copy** | Puts the plan on those floors · a new plan from this one | Building | §6 |
| Floor list — per floor: **Draw**, **Open**, **Use drawing…** (with **This floor only — its own copy**), **Clear** | Gives a floor a drawing, opens it, uses another (or its own copy), empties the floor | Building | §6 |
| Floor list — **Open now** (name), **Delete this drawing** | Renames the open drawing · takes it off every floor and deletes it | Building | §6 |
| The old way: **Put only this plan into a building…**, **Use this plan as** (A flat · Ground floor · Basement · Common floor · Rooftop), **Name**, **This flat on floors … to …**, **Next to it on each floor**, **Basement number**, **On floor**, **Move it right**, **Move it down**, **Back to the automatic place**, **Show building**, **Take this flat out** / **Take this plan out** | One plan into a building, without a project | Building, no project open | §6 |

## Change list (`/changes`, staff)

| Key / button | What it does | Where | MANUAL |
|---|---|---|---|
| Staff key, **Open** | Not signed in: opens the list of links made before accounts. Signed in to a company: not asked — the list is your company's | top | §1 |
| **Refresh** | Loads it again | top | §1 |
| **Export CSV** | Saves every row as a spreadsheet file | top | §5 Give the drawing back |
| **Open link** / **Copy link** | Opens or copies that buyer link | each link | §1 |
| **Turn off** | Asks first, then the link stops for good ("This link no longer opens a flat."); what the buyer wrote stays; the row says "turned off" and the date | each link, signed in | §5 Accounts |

## Pages that say something went wrong

| Key / button | What it does | Where | Who | MANUAL |
|---|---|---|---|---|
| **Plotline** | Opens the front page | top left of each page | everyone | §12 |
| **Go to the front page** | Opens the front page | not found, link turned off | everyone | §12 |
| **Open the Studio** | Opens the Studio | "Nothing was sent from the Studio" | staff | §12 |
| **Try again** | Opens the page again | the flat could not be fetched; no 3D on this device | everyone | §12 |
| **Reload** / **Go back** | Opens the page again / the page before (the front page if none) | "Something broke here." | everyone | §12 |
