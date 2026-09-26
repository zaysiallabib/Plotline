# Plotline — Product Spec (Phase 0 demo + Studio v1)

Owner: PM · Date: 2026-09-24 · Builds on CLAUDE.md decisions (English only, realism first, PC + VR, no base price, Poly Haven CC0). Data model = `src/core/types.ts`. Where docs were silent I decided and marked **(PM decision)**.

Demo unit: the large apartment in the lower part of `Demo drawings/Btibd/img_3.webp` — "2nd floor plan, 2703 SFT". Rooms printed on it: Living Room 14'-11"×15'-4", Dining & Family Living 12'-11"×23'-10", Bed-1 14'-0"×16'-0", Walk-in Closet 7'-0"×8'-6", Bath-1 7'-0"×8'-0", Bed-2 15'-0"×11'-10", Bath-2 9'-0"×5'-0", Study Room 12'-11"×10'-0", Kitchen 11'-0"×7'-6", Bed-3 11'-0"×10'-6", Bath-3 4'-11"×7'-7", Help Bed 6'-0"×5'-0", H.Toilet 3'-9"×4'-5", PDR 5'-11"×5'-11", four Verandas, Lift Lobby 14'-8"×5'-8". Compass on the drawing: N points up-left, so `northDeg ≈ 315` **(PM decision: read from the rose, refine later)**. Unit name: `Type A · 2703 sft`, floor 2, `areaSqft: 2703`.

---

## 1. Who uses it, and when

**Sales-office staffer, tracing (PC, Chrome, mouse).** A marketing/sales staffer at a mid-tier Dhaka developer has the architect's brochure plan as a JPG/WEBP/PNG (exactly `img_3.webp`). They open `/studio`, drop the image in, click two ends of a printed dimension, type what it says, then walk the plan corner by corner typing the printed lengths. They are not CAD users; they know Excel and WhatsApp. Success = one unit traced, labelled, validated and previewed in 3D in **15 minutes** on the second attempt, and the "minutes to trace" counter is the number we report every week. If any step needs the founder in the room after the pilot, we failed.

**Buyer, on a PC browser link.** A buyer — often an NRB abroad deciding with a relative — opens `/u/type-a-2703` from a WhatsApp link on a laptop. No login, no install. They read the unit name, floor and area, press Enter, and walk in from the front door. They look around each room, read the printed size in the HUD, try the floor and wall options and see the price *delta* (never the base price), drag the sun slider to see the afternoon light on the veranda, pin a comment on the kitchen counter, and share the exact configuration back to the family. Session length target: 5+ minutes.

**Buyer or staffer in a VR headset (sales office).** A Quest-class headset in the sales office opens the same URL in its browser. The staffer sets options on the PC first; the buyer puts the headset on, presses "Enter VR", stands in Bed-1 at true scale and teleports room to room by pointing. VR is a presence demo, not an editing surface: no panels in VR in Phase 0 **(PM decision)**. It must never crash or drop below comfortable framerate; if unsure, fewer assets in VR.

---

## 2. THE STUDIO — `/studio`

This is the product. Dimension-driven tracing of a wall graph over a plan image. Output = one `Unit` JSON.

### 2.1 Layout

```
┌ Top bar (48 px) ───────────────────────────────────────────────────────────┐
│ Plotline / Studio │ [Unit name] [Project] [Floor] [Area sqft] │ ⏱ 04:12 │ Undo Redo │ Import  Export  Preview 3D │
├ Canvas (fills) ──────────────────────────────────────┬ Right panel (320 px) ┤
│ plan image at 55 % opacity on --bg                   │ Steps (1–8 checklist) │
│ walls drawn to true thickness, vertices as dots      │ ───────────────────── │
│ inline length field appears next to the cursor       │ Selection properties  │
│                                                      │ ───────────────────── │
│                                                      │ Issues (n)            │
├ Status bar (28 px) ──────────────────────────────────┴───────────────────────┤
│ Wall · click next corner or type a length  │ 14'-5" · 4.39 m · 90° · snapped: vertex │ 1 px = 0.0123 m · 100 % │
└──────────────────────────────────────────────────────────────────────────────┘
```

Left tool strip (vertical, 40 px, inside canvas top-left): Select (V), Scale (S), Wall (W), Opening (O), Room (R). Tools are text-labelled on hover; no icons required beyond a single-letter glyph.

Canvas: pan = Space+drag or middle-drag; zoom = wheel (about cursor), `0` = fit plan. Pixels exist only here; everything stored is meters via `planImage.pxPerM` and `originPx`.

### 2.2 Step flow

The right panel lists the steps; a step ticks when its condition is met. Steps are not modal — the user can go back any time.

**1. Load plan.** Drop an image on the canvas or click "Choose plan image…". Accepted: png/jpg/webp ≤ 10 MB. Image is kept as a data URL in the draft (localStorage `plotline.studio.draft`); the exported JSON's `planImage.src` is the file name, e.g. `img_3.webp` **(PM decision — keeps JSON small; the deploy copies the image to `public/plans/`)**. Canvas shows: "Drop the floor plan here (PNG, JPG, WEBP)".

**2. Set scale.** Tool S. Click one end of a printed dimension, click the other end (line rubber-bands, axis-snapped), an inline field opens pre-focused: "Printed length" → type `14'-0"`, Enter. `pxPerM` is derived. Parser = `core.parseLength` (accepts `14'-5"`, `14'5`, `14.4`, `14.4ft`, `4.4m`, `440cm`; feet default). Status bar shows `1 px = 0.0123 m`. Until scale is set, Wall/Opening/Room tools are disabled with tooltip "Set the scale first (S)". Re-setting scale rescales nothing already traced; it just changes the image mapping — so we warn: "Changing scale after tracing moves the image under your walls. Continue?"

**3. Trace walls.** Tool W. Interaction is a *chain*:
- Click a corner → vertex placed, chain starts. A ghost wall follows the cursor.
- Next vertex, either way:
  - **Click** the next corner, or
  - **Type** the printed length (any digit key opens the inline field at the cursor) and press **Enter** → vertex placed at that length along the *current direction* (the snapped direction from the last vertex toward the cursor; if the cursor hasn't moved, the previous wall's direction). **Tab** in the field switches to an angle field (degrees, absolute, 0 = plan-right, clockwise) **(PM decision)**.
- Angle snapping: 0/45/90° (relative to plan axes) by default; hold **Shift** for free angle. Snapped angle shown in the status bar.
- Vertex snapping (radius 10 screen px): to existing vertices (ring highlight, "snapped: vertex"); to axis alignment with any existing vertex (dashed guide line, "snapped: aligned with Bed-1 corner" — we just say "aligned x" / "aligned y"); to a point on an existing wall ("snapped: wall — will split").
- **Close a loop** by clicking the chain's start vertex; the chain ends. Clicking any other existing vertex also ends the chain there (T-junction). **Esc** ends the chain without closing. **Backspace** while chaining removes the last placed vertex.
- Starting a chain on an existing vertex continues from it (this is how you branch partitions off exterior walls).
- **T-junctions — auto-split (hard rule).** When a new vertex lands on an existing wall (not at its endpoint), the editor splits that wall into two walls sharing the new vertex; openings keep their absolute position (offsets recomputed per piece; an opening straddling the split point blocks the split with an error). When a new wall passes *through* an existing vertex, the new wall is split at that vertex. Two walls that *cross* mid-span are **not** auto-split; `validate` reports `walls-intersect` and the issues panel says "Walls cross — end one wall on the other instead" **(PM decision: crossing is nearly always a tracing slip, splitting it would hide the mistake)**.
- Zero-length or duplicate walls are refused at placement ("That wall already exists").
- Wall height: 10'-0" (3.048 m) for all walls **(PM decision — standard Dhaka slab-to-slab)**; editable per wall in the panel.

**4. Wall thickness.** Chain default = partition 5" (0.127 m). Press **T** while chaining, or use the toggle in the panel, to switch the chain to exterior 10" (0.254 m). Select any wall(s) later and change thickness in the panel (Partition 5" / Exterior 10" / custom inches). Exterior walls render visibly thicker on the canvas.

**5. Openings.** Tool O. Click a wall → an opening is created centred on the click, with the last-used kind (default door). Panel fields: Kind (Door / Window / Passage), Width, Height, Sill, Offset from A, Hinge (A/B), Swing (In/Out). Defaults **(PM decision)**: door 3'-0" × 7'-0", sill 0; bath door (wall borders a room of kind `bath`) 2'-6"; window 4'-0" wide, sill 3'-0", height 4'-0"; passage 4'-0" × 7'-0". Drag the opening along its wall (it clamps inside the wall; overlapping another opening turns it red and refuses to drop). **H** flips hinge, **Shift+H** flips swing. Canvas draws doors as a quarter-arc on the swing side, windows as a triple line, passages as a dashed gap.

**6. Label rooms.** Tool R. Click inside an enclosed face → popover: Name (autofocus), Kind (select), Printed size (text). Kind is auto-guessed from the name: bed/bedroom→`bed`, bath/toilet/pdr/wc→`bath`, veranda/balcony→`balcony`, kitchen→`kitchen`, dining→`dining`, living/family/drawing→`living`, study→`study`, closet/walk in→`closet`, lift/stair/shaft/aod/duct/e-shaft→`shaft`, utility/store/help→`utility`, else `other`. Printed size is pre-filled from the face's bounding box as `14'-0" × 16'-0"` (nearest inch) so the user only corrects it against the print. The popover also shows computed `Area 22.1 m² · 238 sqft`. Clicking outside any enclosed face: toast "Click inside a closed room. Is a corner not joined?" Click an existing label to edit; Delete removes it.

**7. Validate.** Issues panel updates live from `core.validate(unit)` plus Studio-only checks: `scale-not-set`, `no-rooms`, `no-entry-door` (no door on a wall bordering the outer face). Each row: level dot (red error / amber warning), message, and clicking it pans+zooms to the ids and selects them. Copy for codes: dangling-vertex "Corner is not joined to anything"; zero-length-wall "Wall has no length"; duplicate-wall "Two walls lie on top of each other"; opening-out-of-bounds "Opening runs past the end of its wall"; openings-overlap "Two openings overlap on this wall"; unlabelled-room "Room has no name"; label-outside-any-room "Label is not inside a closed room"; walls-intersect "Walls cross — end one wall on the other instead". Empty state: "No issues. Ready to export."

**8. Export / Import / Preview.** Export downloads `<unit-name-slug>.plotline.json` (the `Unit` object, pretty-printed). Export is always allowed (warnings shown in a confirm if any errors exist: "This unit has 2 errors. Export anyway?"). Import accepts a `.json` via button or drag-drop; invalid → "That file is not a Plotline unit". If the imported JSON's `planImage.src` is not loadable, the canvas shows "Plan image not found — drop `img_3.webp` here to trace over it" and everything else still works. **Preview 3D** writes the JSON to localStorage key `plotline.preview` and opens `/u/preview` in a new tab; disabled while errors exist (tooltip "Fix the errors first").

### 2.3 Selection & editing (tool V)

Click selects a vertex, wall, opening or label; Shift+click adds. Drag a vertex moves it (all attached walls follow; snapping applies; openings keep their `offsetM`, clamped). Drag a wall moves both its vertices. Delete removes the selection (deleting a vertex deletes its walls; a warning if it would orphan openings). Double-click a wall → inline length field: typing a new length moves vertex **b** along the wall's direction **(PM decision: a is the anchor; the status bar says so)**.

### 2.4 Keyboard

| Key | Action | Key | Action |
|---|---|---|---|
| V / S / W / O / R | Select / Scale / Wall / Opening / Room | Esc | End chain / cancel / deselect |
| Enter | Confirm typed length | Tab | Length ↔ angle field |
| Shift (hold) | Free angle | T | Toggle partition/exterior for chain or selection |
| Backspace | Undo last chain vertex | Delete | Delete selection |
| H / Shift+H | Flip hinge / swing | Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / Redo |
| Ctrl+S | Export JSON | Ctrl+O | Import JSON |
| Space+drag / wheel / 0 | Pan / zoom / fit | Ctrl+D | Duplicate selected label |

Undo/redo: every graph mutation is one history entry (a chain of N placements = N entries; a drag = 1). History cap 200. The draft autosaves to localStorage on every mutation; reopening `/studio` restores it with the toast "Draft restored — Type A · 2703 sft".

### 2.5 Status bar (always visible)

Left: tool name + one-line hint (e.g. "Wall · click the next corner, or type its printed length"). Centre, while chaining or dragging: `14'-5" · 4.39 m · 90° · snapped: vertex` (length in feet-inches AND meters, angle, what it snapped to; "free" when Shift held). Right: scale (`1 px = 0.0123 m` or "Scale not set"), zoom %.

### 2.6 "Minutes to trace" counter

Top bar shows `⏱ 04:12`. Starts on the first scale click, pauses when the tab is hidden or after 3 minutes of no input, resumes on input, stops at the first Export. Persists in the draft. Shown in the export confirm: "Traced in 11:40". Engineer logs it to console on export; it is *the* adoption metric from the masterplan. Not stored in the Unit JSON (the type has no field; don't extend for this).

### 2.7 Error states

- Image fails to decode / > 10 MB: "Couldn't open that image. Use PNG, JPG or WEBP under 10 MB."
- Length can't be parsed: field turns red, hint "Try 14'-5\", 14.4 or 4.4m".
- Length ≤ 0 or > 100 m: "That length looks wrong".
- localStorage full (big data URL): "Draft too large to autosave — export your JSON often."
- Preview tab blocked by popup blocker: show link "Open preview".

### 2.8 Studio v1.1 — from the founder's first tracing session (2026-09-26, 13:15 on a 5-room tilted plan)

The founder traced a plan on the live Studio without help and hit these. Each is a requirement now; "placing" means the moment before the click.

- **Ghost footprint before placing (the Clash-of-Clans rule).** Whatever the cursor is about to create is drawn at its true size first. Wall tool: the ghost wall is a filled slab at the chain's thickness (5" or 10"), with its length label, not a hairline. Opening tool: hovering a wall shows the opening at its full width (door leaf + swing arc on the swing side, window triple line, passage dashed gap) sliding along the wall under the cursor; nothing is created until the click. Room tool: the hovered face is tinted.
- **Openings anchor from an edge.** Today a click centres the opening on the cursor. New: the ghost snaps its nearer edge to a wall end or to the edge of a neighbouring opening within 10 screen px (status bar: "snapped: corner" / "snapped: next to door"); otherwise it centres. `From corner A` in the panel stays for exact numbers. Dragging an opening in Select uses the same edge snap.
- **Moving must be obvious.** Select (V) already drags corners, walls, openings and labels; the founder never found it. The status-bar hint of every tool ends with "· V to move things"; the first time a chain closes, a one-time toast says "Drag any corner with V to adjust it". Arrow keys nudge the selection by 1" (Shift: 1'), with the same snapping; Esc + arrows never scroll the canvas.
- **Closing a loop must land on the start corner.** While chaining, the start vertex draws a larger accent ring and its snap radius doubles (20 px), so a chain closed "next to" it cannot leave a dangling corner (the "wall sticking out" the founder saw in 3D). The `dangling-vertex` issue row reads "Corner is not joined to anything — click to find it".
- **Selected item shows its size.** The panel for a wall shows its length; for an opening its width and the distances to both wall ends ("2'-4\" from corner A · 5'-1\" from corner B"), editable.

Acceptance: the founder re-traces the same plan and raises none of the five points; "minutes to trace" does not get worse.

Parked (founder, 2026-09-26): level templates — ground floor, basements, typical floors, rooftop — with different furnishing rules (rooftops and verandas get furniture, basements don't). After the living floors are done.

---

## 3. THE VIEWER — `/` and `/u/:unitId`

`/` redirects to the demo unit `/u/type-a-2703` (`src/data/units/type-a-2703.json`). `/u/preview` loads from localStorage `plotline.preview`. Unknown id → "This unit isn't available. Ask your sales contact for a fresh link."

### 3.1 First load

Full-bleed dark screen, centred, thin type: project name (small caps), unit name large `Type A · 2703 sft`, line `Floor 2 · 2703 sqft · 251 m²`, a thin progress bar with `Loading… 4 of 12 rooms`, then a single button **Enter**. Behind it the scene fades in blurred. Pressing Enter (or key Enter) puts the buyer 1.2 m inside the **entry door**, facing into the unit. Entry door = the first `door` opening in `walls[]` order that sits on a wall bordering the outer face; the unit author lists it first **(PM decision)**. If none, spawn at the centroid of the largest `living` room.

### 3.2 Walking

- **Pointer lock:** click the scene → mouse look, `WASD`/arrows move, Shift = faster, Esc releases. Eye height 1.6 m, walk 1.4 m/s, collision = 2D segment test against walls (openings passable; doors render open 90°).
- **Click-to-move:** when not locked, a single click on a floor glides the camera there over 0.6 s (ease-out). A soft ring shows the target on hover.
- **Touch fallback:** one-finger drag = look, tap floor = move. It must work; it is not the target device.
- **Orbit / Dollhouse (key O, button "Dollhouse"):** ceilings hidden, camera lifts to 45° over the unit, drag orbits, wheel zooms. Clicking a room's floor drops back into walk mode at that spot. Button text toggles "Walk".

### 3.3 Room HUD and quick-jump

Top-left glass chip, updated from `core.roomAt(cameraXY)`: `BED-1` / `14'-0" × 16'-0"` / `20.8 m² · 224 sqft`. Between rooms (in a wall opening) the chip keeps the last room. Below it a "Rooms" button opens a list (name + printed size); clicking one glides the camera to the room's centroid, facing its longest wall. Shafts and closets under 2 m² are hidden from the list.

### 3.4 Finish options panel

Right side, 320 px, glass, collapsible (key F, button "Finishes"). One block per `FinishSlot`, in JSON order: slot label (`Bedroom floors`), then option chips in a row: a 28 px material swatch (rendered from the texture's albedo, tinted), the label, the brand in muted small text, and the delta: `+৳1,85,000` or `Included` (when `priceDeltaBdt` is 0; negative deltas render `−৳40,000`). Taka formatted with Bangladeshi grouping (`1,85,000`). Selected chip has the accent border. Selecting swaps the material on every room the slot targets, live, ≤ 200 ms (textures preloaded on panel open; while loading, the chip shows a thin progress underline). Panel footer: `Options total  +৳2,40,000` — sum of deltas only. **The base price is never shown, anywhere.** "Reset to included" link resets the configuration to `defaultOptionId`s.

### 3.5 Sun / time slider

Bottom-centre pill: a compass glyph rotated by `northDeg`, a slider 06:00–18:00 in 15-min steps, label `15:30 · afternoon` (06–11 morning, 11–14 midday, 14–17 afternoon, 17–18 evening). The directional light's azimuth/elevation come from Dhaka latitude 23.8°N at equinox **(PM decision: fixed date; season toggle later)** and `northDeg`. Shadows on. Default 15:30 so the first impression answers "where does the afternoon sun hit".

### 3.6 Comment pins

Button "Comment" (key C) → crosshair cursor and hint "Click anything to leave a note". Click any surface → raycast → anchor = `{entityId, offset}` where entityId is the wall/furniture/room-floor id and offset is the hit point in that entity's local frame (never world coords alone). A small pin appears with a popover: textarea placeholder `What would you like to change here?`, buttons **Save** / **Cancel**. Saved pins: numbered markers in the scene (billboarded), and a "Notes (3)" list in the right panel under Finishes: number, first line of text, room name; clicking glides the camera to face the pin; a "Remove" link per note. Storage: localStorage `plotline.pins.<unitId>` as append-only rows `{id, anchor, text, createdAt}` — Phase 0 only, the Supabase `events` table replaces this later. Empty state: "No notes yet. Press C and click anything you'd change."

### 3.7 Share this configuration

Button "Share" → URL `/u/<unitId>?c=<base64url(JSON.stringify(Configuration))>` copied to clipboard; toast `Link copied — it opens with exactly these finishes.` Loading a URL with `?c=` applies the configuration before Enter. Unknown slot/option ids are ignored silently. Pins are not encoded **(PM decision)**.

### 3.8 VR

If `navigator.xr?.isSessionSupported('immersive-vr')` resolves true, a top-right button **Enter VR** appears (otherwise nothing — no greyed-out button). In session: current configuration and sun time are kept; panels hidden; controller ray + trigger on a floor = teleport (with a floor ring), thumbstick = 45° snap turn; the room chip is drawn as a small text plane on the left controller. Exit = headset system button; the page returns to walk mode where the VR camera was.

### 3.9 Footer

Bottom-right, 11 px, muted: `Powered by Plotline`. Always visible except in VR and pointer lock.

---

## 4. Visual direction and exact copy

**Direction:** realistic, calm, premium. The 3D is the hero; chrome recedes. Dark UI using the tokens in `src/index.css` (`--bg #0f0f10`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--line`, `--accent #e8c170`, `--radius 12px`). Glass panels = `rgba(23,24,26,.72)` + `backdrop-filter: blur(16px)` + 1 px `--line` border. Inter, weights 300/400 only; 13 px body, 11 px uppercase labels with 0.08 em tracking, 22 px light for the unit name. Accent used only for: selected chip, active tool, snap highlight, primary button. No cartoon icons: text labels, and where an icon is unavoidable, inline SVG 1.5 px stroke in `--ink`. Studio canvas: plan image at 55 % opacity, walls in `--ink` at true thickness (exterior filled), vertices 4 px dots, selection in `--accent`, guides dashed `--muted`. Viewer: nothing on screen but the room chip, three small buttons top-right (Dollhouse · Finishes · Share · Enter VR when available), the sun pill bottom-centre, the footer.

**Copy (exact strings)**

| Where | Text |
|---|---|
| Studio top bar | `Plotline` · `Studio` · fields `Unit name` `Project` `Floor` `Area (sqft)` · `Undo` `Redo` `Import` `Export` `Preview 3D` |
| Studio empty canvas | `Drop the floor plan here (PNG, JPG, WEBP)` · button `Choose plan image…` |
| Steps panel | `1 Load plan` `2 Set scale` `3 Trace walls` `4 Wall thickness` `5 Openings` `6 Rooms` `7 Check` `8 Export` |
| Scale field | label `Printed length`, placeholder `14'-0"` |
| Chain hints | `Click the first corner` · `Click the next corner, or type its printed length` · `Click the start corner to close` |
| Thickness toggle | `Partition 5"` / `Exterior 10"` / `Custom…` |
| Opening panel | `Door` `Window` `Passage` · `Width` `Height` `Sill` `From corner A` · `Hinge A / B` · `Swing in / out` |
| Room popover | `Room name`, `Kind`, `Printed size`, `Area 20.8 m² · 224 sqft` · `Save` `Remove` |
| Issues header | `Issues (2)` / empty `No issues. Ready to export.` |
| Export confirm | `This unit has 2 errors. Export anyway?` · `Traced in 11:40` |
| Preview disabled | `Fix the errors first` |
| Draft restored | `Draft restored — {unit name}` · link `Start over` |
| Viewer load | `{project}` · `{unit name}` · `Floor {n} · {sqft} sqft · {m²} m²` · `Loading… {k} of {n} rooms` · button `Enter` |
| Viewer buttons | `Dollhouse` ↔ `Walk` · `Rooms` · `Finishes` · `Comment` · `Share` · `Enter VR` |
| Finishes | `Included` · `+৳1,85,000` · `Options total` · `Reset to included` |
| Sun pill | `{HH:MM} · morning/midday/afternoon/evening` |
| Comment | hint `Click anything to leave a note` · placeholder `What would you like to change here?` · `Save` `Cancel` · list `Notes (3)` · `Remove` · empty `No notes yet. Press C and click anything you'd change.` |
| Share toast | `Link copied — it opens with exactly these finishes.` |
| Pointer lock hint | `Click to look around · WASD to walk · Esc to release` |
| Unit not found | `This unit isn't available. Ask your sales contact for a fresh link.` |
| WebGL missing | `This browser can't show 3D. Try Chrome or Edge on a PC.` |
| Footer | `Powered by Plotline` |

---

## 5. Acceptance criteria — Phase 0 demo

Studio
- [ ] `/studio` opens with the empty-canvas state; dropping `img_3.webp` shows it fitted to the canvas in < 1 s.
- [ ] Scale: two clicks + `14'-0"` + Enter sets scale; status bar shows `1 px = … m`; tools unlock.
- [ ] A new user traces a rectangular room with four typed lengths (click, type, Enter ×3, click start) in **< 60 s**; the loop closes and the room outline is drawn at correct scale (within 1 %).
- [ ] Typing `14'-5"`, `14'5`, `14.4`, `4.4m`, `440cm` all place a vertex; `abc` turns the field red and places nothing.
- [ ] Angle snaps to 0/45/90; holding Shift allows any angle; status bar shows `free`.
- [ ] Placing a vertex on the middle of an existing wall splits it into two walls sharing that vertex (walls count +1, both pieces keep thickness; an opening on the split wall keeps its world position).
- [ ] Crossing two walls mid-span yields a `walls-intersect` error, clicking it selects both walls.
- [ ] T toggles a chain to Exterior 10"; the canvas draws it visibly thicker; JSON has `thicknessM: 0.254`.
- [ ] Opening tool: click a wall → door 3'-0"×7'-0"; drag moves it along the wall and it cannot leave the wall or overlap another opening; H flips hinge.
- [ ] Room tool: clicking inside the closed rectangle opens the popover with a pre-filled printed size; saving `Bed-1` guesses kind `bed`; clicking outside any face shows the toast and creates nothing.
- [ ] Undo (Ctrl+Z) reverts each placement one at a time; redo restores; 20 undos in a row leave a consistent graph (no dangling ids).
- [ ] Export downloads a JSON that `core.validate` accepts with zero errors for the demo unit, and Import of that file reproduces the same canvas.
- [ ] Preview 3D opens `/u/preview` in a new tab showing the traced unit.
- [ ] Reloading `/studio` restores the draft including image and timer.
- [ ] The demo unit (all rooms listed at the top of this doc) is fully traced in the Studio by the founder in **< 30 min**; timer value recorded in the commit message.

Viewer
- [ ] `/` shows the load screen with `Type A · 2703 sft`, `Floor 2 · 2703 sqft · 251 m²`, and Enter; first interactive frame < 8 s on a mid-range PC on broadband.
- [ ] Enter spawns 1.2 m inside the entry door facing in; WASD walks; walls block; door openings pass.
- [ ] Click-to-move glides to the clicked floor point; clicking a wall does nothing.
- [ ] Room chip updates within one frame of crossing a doorway and shows the printed size and area for every labelled room.
- [ ] Rooms list jumps to each listed room; shafts are absent from the list.
- [ ] Finishes: ≥ 2 slots, ≥ 3 options each, with brand + `Included`/`+৳…`; choosing an option updates the material in **≤ 200 ms** after textures are cached; Options total updates; base price appears nowhere in the DOM.
- [ ] Sun slider from 06:00 to 18:00 moves the shadow direction continuously; 15:30 is the default.
- [ ] Comment: C + click on a piece of furniture creates a pin anchored to that asset id; reload keeps the pin; Remove deletes it.
- [ ] Share copies a URL with `?c=`; opening it in a private window shows the same selections.
- [ ] Dollhouse toggle hides ceilings and orbits; clicking a floor returns to walk mode there.
- [ ] `Enter VR` appears on a WebXR-capable browser (Quest Browser or Chrome + emulator) and is absent otherwise; in session, pointing at the floor + trigger teleports.
- [ ] Footer `Powered by Plotline` visible on every non-VR screen.
- [ ] Every string in §4 appears verbatim; no Bangla, no prices except deltas.
- [ ] Deployed to a public Vercel URL; `npm test` green.

---

## 6. Out of scope now (do not build)

- Drag-and-drop furniture editor — presets + per-unit JSON only.
- Pixel-based auto-detection of walls from the image (the old prototype's `ImagePlanDetector` is dead; do not port it). Phase C reads printed labels/dims, not pixels.
- Buyer geometry edits of any kind.
- Backend, accounts, share tokens, Supabase — Phase A. Pins and drafts live in localStorage.
- Bangla / i18n.
- Base price, per-sqft price, cost estimation.
- Phone performance budget as a gate (keep sane limits; realism wins).
- Curved walls (trace as segments), multi-floor units, whole-tower variants, templates.
- Change-list PDF, WhatsApp buyer copies, offline sales-office mode.
- VR interaction beyond teleport + snap turn (no panels, no option picking in VR).

### What the old prototype got wrong (so we don't repeat it)
Rooms were separate polygons, so shared walls were duplicated and doors cut one room but not the neighbour; tracing was pure clicking with no dimension entry; auto-detect produced boxes that looked right and measured wrong; the modal-per-question flow made a 20-room plan take an afternoon. Every one of those is answered above by: one wall graph, typed printed lengths, T-junction auto-split, and inline (non-modal) fields.
