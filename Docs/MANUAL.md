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
| Finishes | F | Opens the panel on the right: floor, wall, ceiling options |
| Comment | C | Click anything to leave a note on it |
| Share | — | Copies a link that opens with the finishes you chose |
| Enter VR | — | Only shows when a VR headset is connected |

**Top left:** the name and size of the room you are standing in. **Rooms** = a list; click a room to jump there.

**Moving in Walk**

- **W A S D** or the arrow keys — walk. **Shift** — faster.
- **Click a spot on the floor** — you walk there.
- **Double-click** (or the Enter button) — the mouse now turns your head. **Esc** gives the mouse back.
- You cannot walk through walls. You can climb steps and ramps. You cannot walk into a pool.

**Moving in Dollhouse:** drag to turn, scroll to zoom, right-drag to slide. Click a room's floor to drop into it.

**Finishes panel**

- Each block is one thing you can choose (for example "Bedroom floors"). Click an option. Each shows its brand and the price difference.
- **Options total** and **Reset to included** at the bottom.
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

- **Click a piece** to pick it. **Drag** it to move it. It turns red and tells you why if it cannot go there (outside the room, blocks a door, covers a window, overlaps another piece).
- **Drag a dot** on a piece to make it bigger or smaller (only pieces that can stretch).
- Buttons in the small panel, bottom left: **Add**, **Turn 90°**, **Delete**, **Undo**, **Reset layout**.
- Keys: **R** turns · **Del** deletes · **Ctrl+Z** undoes · **Esc** lets go.
- **G** — picks up the piece under the mouse without opening Edit furniture; **G** again puts it down.
- **Add** opens the library: Living, Dining, Bedroom, Kitchen, Bath, Lights & AC, Greenery, Outdoor, Lobby & gym, Decor. Pick one, point at the floor, a wall or the ceiling, click.
- Saved in this browser only.

### Edit openings (doors, windows, sliding doors, open passages)

- **Click one** to pick it. **Drag** it along its wall. **Drag a dot** to change width, height, or a window's sill.
- Panel, bottom left: change its kind (**Door / Window / Slider / Passage**), type **Width / Height / Sill**, **Delete**, **Undo**.
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
| Auto-trace | Tries to draw a **flat** for you from the picture. Click inside the flat it should trace. It does not understand ground floors, basements or rooftops. |
| Import | Opens a saved drawing file (Ctrl+O). In a project it goes into the drawing open now. |
| Export | Saves the drawing as a file (Ctrl+S) |
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
- **Line a picture up with a drawing that is already there** (a built-in level, or your drawing after you swapped the picture): drop the picture on the page, press **S**, then 4 clicks — a corner on the picture, the same corner in the drawing; another corner far away on the picture, the same corner in the drawing. The picture jumps under the drawing at the right size. Wrong? **Undo**, or press S and do it again. The picture must be the same way up as the drawing.
- The five Sheltech levels (ground, basements, level 1, rooftop) open with their plan picture already behind them.

**W — Wall**
- Choose what to draw: **Wall**, **Low wall**, **Kerb**, **Zone line** (keys 1–4).
  - *Low wall* — a boundary wall, parapet or railing; type its height.
  - *Kerb* — a 6-inch edge, as round a planter.
  - *Zone line* — an invisible line that only separates two areas (lawn from driveway).
- Click corner after corner. Click the first corner again to close the room.
- While drawing, **type a number** to set the exact length; **Tab** switches to the angle.
- **Backspace** removes the last piece. **Esc** stops.
- **T** switches thin wall (5") / thick wall (10").

**O — Opening**
- Choose: Door 2'-6", Door 3'-0", Window 4', Window 6', Slider 6', Slider 8', Passage (keys 1–4 for the kind), or **Glass wall**.
- **Glass wall**: click a wall and all of it becomes glass, floor to top. For glass on only part of a wall, drag the glass's end shorter, or first split the wall (W, click on it).
- Point at a wall — a preview shows what you will get — click.
- Kerbs and zone lines do not take doors or windows.
- With a door picked: **H** flips the hinge side, **Shift+H** flips which way it swings.

**R — Room**
- Click inside a closed room. A small box opens: **Room name**, **Kind** (guessed from the name), **Printed size**, **Floor level**, **Ramp** (tick it, type the level at the far end, pick the direction).
- **Save**, or **Remove** to take the name off.

**C — Column**
- Click = a standard column. Drag = a column of the size you drag. Drag its corner dots to resize.

**F — Furniture**
- Click a piece, drag it, click where it should go. **R** turns it. **Del** deletes. Arrow keys nudge it.
- **Pick from the library…** adds a new piece (same library as the 3D view).
- **Reset to preset** puts one room back to the automatic layout; **Reset all** does every room.

**Hold instead of switch:** hold **W**, **O** or **R**, use the tool, let go — you are back on the tool you had.

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
  - *Room name* — name, kind, printed size, floor level, ramp.
- **Check these** — after Auto-trace: the things it was unsure about. Each has fix buttons and **Looks right**.
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
- **Draw** (on an empty floor): a new, empty drawing for that floor opens. Floors get the names Type A, Type B…; the others are called Ground floor, Basement 1, Rooftop. Drop that floor's plan picture on the page (or **Choose plan image…**), set the scale (S) and trace as usual.
- **Same size as "Type A" — Use its scale and position**: when the picture you load is exactly the size of a picture you already set the scale on, this message offers it (15 seconds). Click it: no scale to set, and the two drawings sit right over each other in the building. Not right? **Ctrl+Z**.
- **Open**: that floor's drawing comes into the Studio. The drawing you were on is saved first, with its picture. Nothing is asked, nothing is lost — also after closing the browser.
- **Use drawing…**: pick one of your drawings for this floor.
- **Clear**: the floor is empty again; the drawing itself is kept.
- The floors of the drawing open now have a yellow outline.

**Under the list, for the drawing open now**
- **Open now** — its name.
- **Also on floors** — type `2, 4, 6-8` and click **Apply** (or press Enter): the drawing goes on those floors too.
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

**Openings**
- A window that starts at the floor and is at least 1.5 m tall becomes a **glass wall**.
- A door 1.5 m wide or more becomes a **double door**.
- Changing an opening's kind resets its size to that kind's usual size.

**Rooms**
- A room exists wherever walls close a shape. You never draw a room; you only name it.
- The kind is guessed from the name ("Lawn", "Lobby", "12" for a parking bay…).

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
| utility | Nothing |
| shaft | Nothing; open to the sky |
| other | Nothing (a room named "stair" gets a stair) |

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

**Safe:**

- The built-in flats and levels
- Anything exported as a file (the file does not contain the plan picture — keep the picture too)
- Buyer links made with **Share link** and what buyers do on them (in the database)

**Never saved:** the finishes you clicked, unless you press **Share** (they go into the link).

---

## 10. Rough edges known today

Things that are confusing or not finished. Each one is a job on the list.

- **Ground floors, basements and rooftops cannot be auto-traced.** Auto-trace only understands flats; it now says so when it finds almost nothing, and says loudly when it had to guess the scale.
- **The Banani and dmd built-in levels still open without their plan picture.** Drop the picture on the page and line it up with S (4 clicks). The Sheltech ones have theirs.
- **Lining a picture up needs zooming in and out** between the clicks when the picture and the drawing are far apart in size.
- The coloured areas of a drawing (lawn, driveway…) cover much of the picture under them.
- **The Floor box in the top bar only takes numbers.** Typing G, B1 or R is thrown away without a word, and the number does not make the plan a ground floor or basement — only its row in the project's floor list (or the old "Use this plan as") does.
- The old one-plan way (**Put only this plan into a building…** → Ground floor) refuses until a building with a flat exists, then needs typed "move it right / down" numbers. The project floor list has neither problem.
- **Outside a project, only one Studio drawing at a time.** Opening another plan from the 3D view (Edit plan, Edit openings) replaces yours after one question. Inside a project nothing is asked: the project keeps your drawing and its picture — open it again from its floor in the list.
- **A whole-floor drawing cannot yet be split into its flats**: a buyer link and the Building view treat the whole floor as one flat.
- After typing in a box on the right, press **Enter** — then the tool keys (W, O…) work again. (Without Enter they still go into the box.)
- Clicking a door on a thin low wall picks the wall; Del then removes the whole wall.
- The fix "Join with a zone line" can draw a long diagonal line across a lawn.
- Room names overlap each other on crowded plans.
- Checks written for flats show on levels ("No entry door on an outer wall", the Area number).
- The hint "Click to look around" is wrong — one click walks you to that spot; a double-click lets the mouse turn your head.
- Opening the site with no address shows Banani Basement 1 instead of a flat.
- There are two different "share" buttons: **Share** in the 3D view (a link with your finishes only) and **Share link** in the Studio (the real buyer link that feeds the change list).
- **Start over** (on the "Draft restored" message) wipes the Studio drawing without asking.
- Once a plan picture is loaded there is no button to swap it — only dropping a new one on the Studio.
- A drawing file opened again always asks for its plan picture.
- Furniture moved in 3D while the Studio is open in another tab can be overwritten by the Studio.
- The same thing has different names in different places: "Slider" / "Sliding door"; "Reset layout" / "Reset to preset".
- Keys **T**, **H** and **Shift+H** are not mentioned anywhere on screen.
- A typed wall length cannot start with 0 (type `.5`, not `0.5`).
- A staff browser still sees the staff buttons on a buyer link.

---

## 11. Can I change it? (state on 2026-10-05, from a test done by hand in the browser)

The goal: **if you can see it, you can click it and change it.** This table is how far the tool is from that today. Every "No" is a job.

| Thing | In the 3D view | In the Studio | Cannot be changed anywhere |
|---|---|---|---|
| Wall | No | Yes — type, thickness, height, length, move, copy, delete | Its paint on one side only |
| Boundary wall, parapet, low wall | No | Yes — same as a wall | Its finish |
| Kerb, free-standing screen | No | Yes | — |
| Glass wall | Yes — width, height, sill, slide along the wall, delete | Yes | Frame, glass colour. Cannot be *added* in 3D |
| Door, double door, gate, window, passage | Yes — kind, width, height, sill, slide, delete | Yes — plus hinge side and swing | Door material. Cannot be *added* in 3D |
| Column | No | Yes — size, move, delete, add | — |
| Ceiling, slab, ceiling height, ceiling lights | No | No | Everything (only one ceiling colour exists) |
| Floor of ONE room | No | No | Finishes change all rooms of a group together |
| Lawn, paving, driveway, deck surface | No | No | Everything — no finish choices exist for outdoor areas |
| Shape of an area | No | Yes — move its corners and lines | — |
| Kind of an area (lawn → paving) | No | Yes | — |
| Floor level of an area | No | Yes | — |
| Ramp | No | Yes — level at the far end, direction, length | Steepness as a number (1:8) |
| Steps | No | No | They are not their own thing yet |
| Pool | not tested | not tested | not tested |
| Parking bay | No | Yes — size, number, add, delete | The painted lines |
| Wall paint of one room / one wall / the outside / the boundary | No | No | One paint choice colours everything |
| Tree, shrub, plant | Yes — move, turn, resize, delete, add from the library | Yes (tool F) | Swap for another in one step |
| Furniture, loungers, pergola | Yes — same | Yes (tool F) | — |
| Neighbour buildings, road, sky | No | No | Everything |
| Time of day | Yes — the slider | — | — |
| North direction | No | No | No control found |

One limit that applies to all of it:

- **What staff change in 3D stays in that one browser.** A buyer on another computer still sees the original.
