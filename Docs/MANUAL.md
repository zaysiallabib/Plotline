# Plotline — the manual

Everything a person can do in Plotline and where to click, in plain words. Every key and button in one list:
[KEYS.md](KEYS.md). Where the furniture, maps, weather and fonts come from, and what is free only for now:
[SOURCES.md](SOURCES.md). The architect's files Plotline reads and writes: [FORMATS.md](FORMATS.md).

Rule: whenever a button, key or page is added, changed or removed, this file and KEYS.md change in the same commit.
Checked against the product on 2026-11-21 (branch `s31/redesign`); walked from zero, with only README and these
manuals, on 2026-11-22.

## Start here

Plotline has three screens:

- **The front page** (`/`) — what Plotline is, as a short story you scroll through (§0).
- **The 3D view** (`/u/type-a`) — what a buyer walks through: Walk, Dollhouse and the whole Building (§2–§4).
- **The Studio** (`/studio`) — where your staff turn what the architect sent into the project's floors (§5–§6).

What a developer does first:

1. **Drop what the architect sent** on the Studio: the whole set (a PDF), CAD files (DXF), a building model (IFC), or a
   brochure's plan picture — one file, several, a folder or a .zip (§5 "The door"). A set lists its drawings and
   **Build the project** makes every floor at once; a model makes its storeys; one drawing or picture makes a project of
   one floor. No file of your own yet? **Try a sample ▾** beside **Choose files…** opens a real building's IFC, DXF, PDF,
   SVG or 3D model from the internet in one click.
2. **Check what came in:** the project's column on the right lists its floors, each saying where its drawing came from;
   **Steps** on the far right say what is next (§5 "The Steps"). A floor that came in as a picture: set the scale with
   **S**, **Auto-trace** → **Whole floor**, then answer **Check these** (§5).
3. **Name the flats and give each plan its floors:** check the flat names written on the plan (part two flats that came
   out as one with **V → Flat → New flat**), name each with **R** inside one of its rooms ("Type A ±2703 sft"), then
   type a plan's floors in its **Floor plans** box (`2-8`) and **Apply** (§5 "Flats in a drawing", §6). No drawings yet,
   only the building's shape? **Start an empty project** (or ⋯ → **New project**): its name, basements, floors and
   rooftop first, then **Draw** a drawing for each floor (§6).
4. **Walk it:** **Preview 3D** (one floor) or **Show building** (the tower); arrange the furniture (**Edit ▾ →
   Furniture**), set the site and true north (**Site** in the project's column, or **⋯ → Site**) (§2, §3, §4, §5).
5. **Send it to buyers:** **⋯ → Share link** (or **Buyer link** under **Share** in Steps); what they choose and write
   comes back in the **Change list** (§1, §5).
   Both need the online database: without it the Studio's **⋯** has no Buyers part at all (README, "The online
   database").

**Two kinds of people.** A **buyer** looks, chooses finishes and leaves notes — nothing else. **Staff** can also move
furniture, change doors and windows, and use the Studio. A browser becomes staff the first time it opens the Studio, or
when `?staff=1` is added to a 3D address (`?staff=0` turns it off). A buyer link never offers staff mode, and a buyer
link (`/s/…`) shows a staff browser exactly what a buyer sees — to edit, open the flat's own address (`/u/…`).

**When something asks first:** a white card opens in the middle of the screen and the page behind it goes pale.
**Cancel** (or **Esc**) says no and nothing changes. The second button names what it does — **Delete**, **Replace**,
**Continue**, **Turn off**, **Remove**, **Start over**, **Make it my draft** — and is red when something is taken away;
**Enter** says yes too. When it needs a word — a new name (**Rename** of a project or a save) or the staff key (**Share link** while
not signed in) — the card has a line to type in, the old name already in it and selected, so you just type over it;
**Enter** or the second button (**Rename**, **Share**) takes it. The browser's own grey box is never used.

---

## 0. The front page

What someone who has never seen Plotline sees first: the product told as a short story you scroll through.

- At the top: the name, one line, the blue **See a flat** button (opens flat Type A in 3D) and **Open the Studio**
  (on a phone, a small line under it says "The Studio is for a computer").
- Beside them (under them on a phone) lies a real floor plan: flat Type A on a sheet of paper, drawn as the architect's
  sheet draws it, with its room names, sizes and north point. Names read as a sheet prints them ("Veranda", not
  "Veranda (living)"); a room the sheet gives no size (a shaft, the lift core) shows its name alone. A name too big for
  its room goes on two lines, then in smaller letters twice, and only then is left out (on a phone the smallest baths
  and verandas still are). On a phone the drawing hangs right under the words of each part of the story, so no empty
  band opens between them as the words get shorter.
- Scroll down and the story plays with your scroll: the sheet tips back, the walls rise out of the plan with their doors
  and windows cut in, the floor lifts onto a row of columns and more floors stack into a tower, each turned a little more
  than the one under it. The roof closes it and a June morning's sun casts its shadow (true to the flat's north). Scroll
  back up and it plays backwards; nothing moves unless you scroll. **I · Plan, II · Walls, III · Building** at the
  bottom left show where the story is.
- Below: "How it works", "What buyers do" and "What the developer gets", with six pictures taken from the 3D view
  (Plate I to VI). At the end, **See a flat** and **Open the Studio** again.
- The thin bar on top stays while you scroll: **Plotline** (back to the top; it shows once the big name has scrolled
  away), **See a flat**, **Studio**.
- A computer set to "reduce motion" gets no story: the page shows the finished tower beside the first words.
- The front page shows no prices and nothing a buyer could change.
- A link to the site pasted into a chat, an email or a post shows a small card: the tower drawn in ink, **Plotline** and
  one line. The browser tab (and a phone's home-screen icon) shows a marble square with a plan corner and a door swing.

---

## 1. Addresses

Which address opens what, and what can be added to the end of a 3D address.

| Address | What opens |
|---|---|
| `/` | The front page (§0). An old link that adds `?c=`, `?floor=`, `?staff=` or `?view=` to `/` still opens the 3D view of Type A. |
| `/u/<name>` | The 3D view of a built-in flat or level. Flats: `type-a`, `type-b`, `type-c` (the demo tower), `sheltech-a`, `sheltech-b`. Levels: `sheltech-ground`, `sheltech-l1`, `sheltech-b1`, `sheltech-b2`, `sheltech-roof`; `banani-ground`, `banani-typical`, `banani-b1`, `banani-b2`, `banani-roof`; `dmd-ground`, `dmd-typical`, `dmd-b1`, `dmd-b2`, `dmd-roof` |
| `/u/preview` | Whatever you last sent from the Studio with **Preview 3D**. Only in the same browser. |
| `/s/<code>` | A buyer link made with the Studio's **⋯ → Share link**. Opens anywhere, no account needed, until staff **Turn off** the link. Needs the online database. |
| `/studio` | The Studio. |
| `/changes` | The staff list of everything buyers chose and wrote. Signed in: your company's links. Not signed in: it asks for the staff key (for links made before accounts existed). Needs the online database. |
| anything else | "Nothing stands at this address" with **Go to the front page** (§12). On the live site it also tells search engines and link checkers that the page does not exist; it looks the same. |

Extras for the end of a 3D address:

| Add | What it does |
|---|---|
| `?staff=1` / `?staff=0` | Staff mode on / off in this browser |
| `?view=dollhouse` / `?view=building` | Opens straight into the Dollhouse or the Building view |
| `?floor=5` | Shows the flat on floor 5 |
| `?quality=lite` / `low` / `high` | Opens at that quality, whatever this computer would pick (§2, "Choosing quality"). Picking another in the Quality menu drops it from the address. |
| `?stats=1` | Opens with the **How fast it is here** card (below, "Choosing quality"). Not on a buyer link. |
| `?scale=0.5` (0.25 to 2) | For speed tests: draws the 3D picture at that size (0.5 = half the width and height, stretched to the window). On Lite it replaces Lite's own size; on Low and High it multiplies theirs. |

---

## 2. The 3D view — everyone

What a buyer and staff see on every flat and level: how to move, choose finishes, leave notes, and read the sun, wind
and light.

**The look.** Light frosted stone with dark text over the 3D, thin lines instead of boxes, small spaced capitals for
labels, and one deep blue for what is picked or on.

**Start screen.** A light stone screen: the project's name in small capitals, the flat's name large in a serif letter, its
floor and size. A thin dark line fills as the rooms load ("12 of 27 rooms ready"); when the 3D is ready to show, the room
fades in faintly behind the words and the blue **Enter** (or the Enter key) takes you in.

- You stand just inside the flat's front door, looking in. A drawing with no door yet puts you in its living room (or
  its first room), never facing a bare wall nor with an AC cut by the top of the picture. A whole floor (both flats and
  the lift lobby in one drawing) is entered from the lift lobby into its first flat; without a traced door from the lobby
  you start in its biggest living room, looking across it.
- A drawing you have not named shows the name printed for its flat on the sheet ("Type A"), **Floor plan A** for a
  whole floor, else "Untitled unit".
- Under Enter, one quiet line says the quality and why ("High quality · This device can show the full look.") with
  **Change** (§2, "Choosing quality").
- At the bottom, quietly: the other flats and each tower's levels. Top right, small: **Studio** and **Staff mode** /
  **Leave staff mode**. None of these show on a buyer link.

**What is on screen.** Top left: the room you are in. Top right: one bar. Bottom middle: the hint and the Sun & wind
pill, with a short message just above them after something you did ("Link copied …"). Bottom right: the small map.
Everything else opens from these and closes again with **Esc**.

**The bar, top right**, left to right:

| Button | Key | What it does |
|---|---|---|
| Walk · Dollhouse · Building (one switch; the view you are in is white) | O: Walk ↔ Dollhouse; B: Building | Walk inside at eye height · the whole plan from above with the roof off · the whole tower (only when the flat belongs to one) |
| Finishes | F | The panel on the right: floor, wall and ceiling options. While it is open, a click on a floor, wall or ceiling chooses for that one room or wall. **×**, F or Esc closes it |
| Comment | C | The Comment panel on the right: click anything to leave a note on it; your notes are listed there. Finishes and Comment take turns |
| Share | — | Copies a link that opens with the finishes you chose. Staff, with the online database: a buyer link (`/s/…`) of this flat on its floor, with the finishes and furniture kept for it (floor 3's beige, not the floor plan's); its buyers' picks and notes reach the change list. It asks once for the staff key when you are not signed in. Without the online database the link of a drawing made in the Studio (Preview 3D, a project's floor) opens only in this browser — anywhere else it says "This flat isn't here."; a built-in flat's link (`/u/type-a?c=…`) opens anywhere |
| Enter VR | — | Only when a VR headset is connected |
| Edit ▾ (staff) | — | Furniture, Openings, Plan (Studio), Download 3D model (§3) |
| ⋯ | — | **Clean view** (H), **Quality**: Lite · Low · High, and **How fast is it here?** (not on a buyer link) |
| The eye (last) | H | **Clean view**: everything on screen goes (below) |

A button that is on (a panel open, an editor on) has a light blue wash and blue words.

**Top left: the room.** Its floor in small capitals, its name in the serif, its printed size and area under it, on a
soft frosted rectangle whose edges fade out, so the words read over any wall, by day and by night. **Click it** for the
list of rooms (your room is the white row) and click a room to jump there; Esc or a click elsewhere closes the list.
The list holds the flat's own rooms (a level's: its rooms and areas), then, under **BUILDING** at the bottom, the
building's stair and lift lobby: click the stair and you stand just inside the stair room's door looking at the flight
(then walk up or down it, or use **Up to …** / **Down to …**, below "Stairs between floors"); click the lift lobby and you
stand in the lobby. Where your flat's floor has its stair drawn with the other flat (BTI's Type A, whose stair is in Type
B's drawing) the stair row takes you there, on the same floor, without a new page. Walking out through the flat's front
door into the lobby and on into the stair room still works. A
jump is framed so a wall AC is neither cut by the top of the picture nor hidden under the bar — where the best picture of
the room would cut one, it looks a little lower, turns a little or looks a little higher until the AC is out of the
picture or wholly in it (none of the 79 jumps on the built-in flats cuts one). A WC smaller than 2 m² (Type A's H. toilet) is
shown from its door through a narrower lens, looking down at the WC as one does from a WC's door, the basin beside the door
at the edge of the picture; make the window wider or narrower while you stand there and the lens keeps the same picture;
walk out of it and the lens widens back to the usual one in about a third of a second (on a phone held upright the
picture is narrow already and stays as it is). In the Building view the same place names the
floor you picked: "Floor 2 · Type A · 2703 sft", the flats of another floor, or "Ground floor", "Basement 1",
"Rooftop".

**The hint** (bottom middle) shows the keys for what you are doing ("Double-click to look with the mouse · click the
floor to walk there · WASD to walk"; staff also "G picks up the piece under the mouse"). It fades after a few seconds,
never shows while the Sun & wind card is open, and comes back when it changes or when the mouse rests where it was.
Under a finger it names no key: "Drag to look · tap the floor to walk there".

**Resting.** In Walk, after 3 seconds without the mouse moving, everything but the room's name fades: the bar, the
hint, the Sun & wind pill, the small map. Move the mouse, click, scroll or press a key and it all comes back; walking (W
A S D, arrows, Shift) and turning your head do not bring it back. It never fades while a panel, list or menu is open,
while you hold a piece, in the Dollhouse or Building view, or while the mouse is over the bar or a panel.

**Clean view** (buyers and staff). **H**, the **eye**, or **⋯ → Clean view**: everything on screen goes — the room's
name, the bar, the hint, the pill, the map, the note pins, the wind's labels, the staff panels — and no message pops up.
A faint dot stays top right. **H**, **Esc** or a click (a tap) on the dot brings it all back. **F**, **C** and (staff)
**G** bring it back too and do their own job; walking, **O**, **P** and **M** keep the view clean. The browser tab
remembers it: the next flat opened in the same tab starts clean too.

**Moving in Walk**

- **W A S D** or **↑ ↓** walk; **← →** turn (they step sideways while the mouse turns your head); **Shift** is faster.
- **Click a spot on the floor** and you walk there — not while Comment or Finishes is open: then the click is for the
  note or the finish and you stay where you are.
- **Double-click** (or Enter on the start screen) and the mouse turns your head; **Esc** gives the mouse back.
- You cannot walk through walls or into a pool; you climb steps and ramps.
- **Stairs between floors**, in a flat or level that is part of a building — through the whole building, basements,
  ground floor, common level, every floor of flats and the rooftop (the Sheltech tower has them all: Basement 2 up to the
  rooftop and back):
  - **Up:** walk the first flight to the half landing and on up the second; you stand at the top of the next floor's
    stair, facing the stair room's door.
  - **Down:** where there is a floor below, the stair room's floor is open round the stair, as in a real stair core: you
    see the flight coming up from the floor below and its half landing. Walk onto that flight from the floor and on down
    it; at its foot, one more step toward the half landing and you stand on the floor below at the foot of its stair,
    facing the stair room's door. Where that door is only a step away (Type B) you face along the stair instead. The
    lowest floor (a bottom basement, BTI's first floor) has no opening: there is nothing below.
  - **Up to …** and **Down to …** (bottom middle, in a stair room) do the same in one click, also where the room is too
    small for a drawn stair (the Sheltech ground floor): you then stand in the middle of that floor's stair room. The
    rooftop's stair says "This stair goes no higher" (the lowest: "no lower").
  - **No new page:** the next floor comes into the same 3D. While it gets ready you stay where you are and can still look
    round, the line at the bottom says where you are going ("Floor 4 …"), the room's name top left still names where you
    are (it changes with the picture), and the floor you leave stays on screen until
    the new one is complete — its furniture, its plants, its pictures and the other flats' rooms round it all in — then
    the picture changes in one go; the grounds' trees and play things seen from its windows come in just after. The
    first time you reach a floor with new kinds of furniture or lamps, the picture moves in small steps for a few seconds
    while the graphics card learns them (it no longer stops for seconds); after that, that floor comes at once. Going
    back to a floor of the drawing you just left — the rooftop and down to floor 6 again, Level 1 and back up to floor 2 —
    takes under a second: the page keeps the last other drawing's flat ready (two flats at most, the one you see and that
    one). The time of day, the wind, Clean view and the quality stay, and so do a buyer's
    finishes; staff see the new floor's flat with its own finishes, as they were last left there (below, "Every flat keeps
    its own"). Anything open on the floor you leave (Edit furniture, Edit openings, a note being written) closes.
  - The address changes to that floor (`/u/<flat or level>?floor=4`), so a reload opens it, and the browser's **Back** and **Forward** take
    the stair down or up again, also without a new page.
- Walk sees about as much as a 22 mm camera lens (a little under 80° across a wide screen) from 1.45 m eye height. The
  Dollhouse and the Building view see wider.

**Moving in Dollhouse:** drag to turn, scroll to zoom, right-drag to slide. Click a room's floor to drop into it — a
bed, a rug or another piece on it too: you land on the floor where the click meets it behind the piece; a click in the
stair room puts you at its door looking at the flight (not while
Finishes is open: then the click picks that floor's finish).

**Finishes panel**

- **One room or one wall:** with the panel open, click a floor, a wall or a ceiling (Walk or Dollhouse). The panel's top
  block names it ("Bed-1 · floor", "Living room · north-east wall") with its options; a click on one changes only that
  floor or wall.
  - For a wall: **This wall · The whole room** (every wall of the room, columns too). A wall is the whole straight wall
    you see, even where the plan has it in pieces.
  - **Same as the group** (for a wall: **Same as the room**) takes your choice back. **Done** closes the block.
  - If the mouse is turning your head, press **Esc** first; a click then picks what is under the middle of the screen.
- Each block below is one choice for a group of rooms ("Bedroom floors"). Each option shows its brand and price
  difference; the chosen one is the white row. A room or wall with its own choice keeps it when the group changes.
- **Chosen for one room or wall** lists those choices; **undo** takes one back.
- **Options total** adds each group's choice and each one-room / one-wall choice once, at the option's own price.
  **Reset to included** takes everything back, the one-room choices too.
- **Share** puts the one-room and one-wall choices into the link. On a buyer link each one goes to the change list
  under its room's name ("Bed-1 · floor: White marble"), and taking one back is a row too.
- On a buyer link, **Your name** sits at the top (the same field as in Comment).
- Staff add their own options here (**+ Add option**, §3), and change the building's roof (§3, "The roof").

**The building's outside** (staff, session 31). What the outer walls are clad in and the colour of the window frames —
chosen once for the whole building, not flat by flat.
- At the end of Finishes: **Outside walls** — Warm plaster (what every building was drawn in before), White, Sand,
  Terracotta and Charcoal render, Red brick, White painted brick, Grey brick, Stone blocks, Timber slats, Timber
  clapboard, Zinc panels, Dark metal panels, Corrugated metal, Fair-faced concrete, Precast concrete panels, Fibre-cement
  panels, Charcoal and Rust composite panels — and **Window frames**: Silver (as before), White, Anthracite, Black,
  Timber. One click dresses every flat and every floor of the building; the tower is built again round you in a moment.
- **One wall, one floor:** with Finishes open, click an outer wall — in the **Building view** any wall of the tower (a
  ground-floor block too; while Finishes is open a click there chooses — the card beside the pointer says *Click to
  choose its outside* — it does not open the flat), in **Walk** or the
  **Dollhouse** the outside of a wall or a balcony's wall. The card **OUTSIDE · FLOOR 5 · TYPE B WALL** has **This wall ·
  This floor · Whole building**: *this wall* is that straight wall on every floor its floor plan stands on (a balcony's
  front can be timber in a brick tower); *this floor* is every outer wall of that floor (a stone plinth on the ground
  floor); then the options. **Same as the floor** / **Same as the building** takes the choice back; **Window frames ·
  whole building** sits in the same card; **Done** closes it.
- A balcony's walls are the outside: they take the outside finish unless a buyer picked a paint for that wall or that
  balcony.
- **Chosen for one wall, floor or window** lists those choices; **undo** takes one back.
- Your own brick, stone or cladding panel: **+ Add option** under **Outside walls**, its look a **Picture** (§3).
- It is kept for the whole building at once (in this browser, in the project saved online, and in every buyer link
  made after); a buyer sees it and never changes it — buyers do not get this part of the panel.

**Every flat keeps its own** (staff, founder 2026-11-21). A flat is one floor plan in one place of the building: floor 3's
Type A, floor 4's Type A and the mirrored flat next door on floor 3 are three flats. What staff pick in Finishes — a whole
group, one room, one wall — is kept for that flat the moment they click, and the flat opens like that next time, by any
way in (the Building view, a stair, its address) and on another computer once the Studio has saved the project online.
Floor 3's beige wall never touches floor 4. Furniture works the same way (§3, Edit furniture). Under **Reset to
included** the panel says where the picks are kept:
- "Kept for floor 3 only: it opens like this next time" — a floor plan that is on several floors;
- "Kept for this flat" (a level: "this level") — a floor plan on one floor only, a level, a flat of no building;
- "Kept for the drawing: every floor not changed on its own starts from this" — the Studio's **Preview 3D** of a floor
  plan that is on several floors: every floor of it that you never changed on its own starts from these picks.

**Reset to included** on a floor shows what the flat comes with, and keeps that — staff are asked first when it would wipe
picks kept for the flat ("Back to the included finishes? The 3 choices kept for this flat go, and Undo cannot bring them
back.", **Cancel** or **Reset**). An address that carries a choice (a link
copied with **Share**, ending in `?c=…`) opens with that choice and keeps nothing: open the flat without it to keep your
picks. Buyers keep nothing: a buyer link (`/s/…`) opens with the finishes it was made with, the buyer's picks go to the
change list as before, and nothing a buyer does changes the flat staff see.

**Notes (Comment panel).** Press **C** or click **Comment**: the panel opens on the right (Finishes closes) — "Click
anything in the flat … and write what you would change" — with **Your notes** and how many. Click the thing, type,
**Save**: a numbered blue pin stays on it and the note joins the list. Comment stays on for the next note. Click a note
in the list to walk to it; **Remove** deletes it. **Esc** first drops a note you have not saved; a second Esc (or C, or
the panel's **×**) stops Comment. On a buyer link **Your name** is here too.

**Sun & wind** (bottom middle)

- **The pill:** a small sun, the time ("15:30"), the month ("Nov"), "Wind" while the wind is on, and a small compass.
  Click it and it opens into the **Sun & wind card**: the compass and the time on top, then the slider, the months, and
  **Lights** · **Wind**. **⌄** at its top right (or Esc) folds it back; the sun and wind keep going meanwhile.
- **The compass** (top left of the card; small on the pill): N in blue, turned so that the top of the compass is
  straight ahead of you — walking, N on the right means north is on your right. In the Dollhouse and Building view it
  turns with the view. It uses the plan's true north (Studio → Site), as the sun and the wind do.
- **The sun:** the time of day large ("15:30 afternoon"), a slider for the whole day (0 to 24) coloured by that day at
  the site (dark at night, rose at dawn and dusk, warm by day), the date under it (click it to pick a day; it starts on
  today), and the twelve months as buttons, six to a row.
  - The sun stands where it really stands at the building's site on that day and hour, by the plan's true north. A June
    noon in Dhaka is almost overhead, a December noon low in the south. A room gets a sun patch only when the sun is on
    its side of the building. No site set in the Studio: Dhaka, on Bangladesh time.
  - The only light is the sun and the flat's own lamps. As the sun sets the windows' light fades, the sky turns golden,
    deep blue, then near black with a faint city glow, and the neighbour blocks become dark shapes with some windows
    lit. With the lamps off, a room at night is dark.
- **Lights** (on the card, everyone): the flat's own lamps — each ceiling light, fan, pendant and chandelier (warm
  white, as bright as a real 10–45 W LED for the room's size) and each floor and table lamp (a warm pool on the desk or
  bedside table and the wall behind).
  - Up to 12 shine at once on High (4 on Low, 2 on Lite): those in your room and nearest you. A farther room still
    glows softly with its lamps' light off the walls. On High the 3 ceiling lights nearest you cast real shadows. On a
    level with parking under a slab (a basement, a ground floor) on High, its 4 parking downlights are 4 of the 12.
  - The light follows the pieces: move a lamp in Edit furniture and its light moves; **Delete** it and its light goes;
    **Undo** brings it back lit; a lamp added from the library shines as soon as it is placed.
  - **Automatic** at first: on while the sun is under 5° (dusk to dawn), off by day; the button is lit while they are
    on. A click turns them the other way; a click again goes back to automatic. This browser remembers it.
  - At night glass faintly mirrors the lit room, the Dollhouse rooms glow inside dark walls, about half the tower's
    rooms have a lamp on in the Building view (§4), and the neighbours light about four windows in ten (Low and
    High) — each seen from your window as a room in a warm, neutral or cool light. The buildings themselves never go
    black: the city's glow lights every outside wall a little, the street lamps light the lower floors warmer, a pool of
    light lies under each street lamp along the roads (Low and High), and a balcony catches a little of the light of the
    lit room it opens from. A lit window seen at a slant fades, as its frame would hide it.
  - In the Building view the button does the same from outside: your flat's rooms glow through its windows with the
    lamps on and go dark with them off (and the picked flat's, when you picked another floor).
- **Wind** (on the card, or **P** in any view): the wind through the flat this month, as thin lines drifting from where
  it comes in to where it goes out. Again to hide it.
  - The lines fill the opening the wind comes in by: 3 to 5 rows one above the other, about one every 60 cm across it.
    Where the way out is close (two windows at a corner) they bend round the corner.
  - The card says the month and its season under the months: "June · monsoon · steady south-south-east breeze,
    3.5 m/s · hot and humid, about 28 °C and 85 % humidity" (Dhaka's seasons: winter Dec–Feb, pre-monsoon Mar–May,
    monsoon Jun–Sep, post-monsoon Oct–Nov), where the numbers come from (the site's ten years of Open-Meteo records, or
    the built-in Dhaka table) and "A guide, not a wind simulation." The lines take the season's tint.
  - Walking, chips float over the openings ("Wind in · SSE", "Out") and the room's words top left say it ("Wind comes in
    at the south window and goes out through the north window", "… no way out: it stays in the room", or "No window or
    door here faces the wind").
  - How it is decided: an outside window or door facing within 60° of the wind lets it in; of those facing 90° or more
    away, the one farthest downwind lets it out. A door into the next room does not count. A neighbour block within 30 m
    upwind and taller than your floor makes the lines fainter.
  - With the wind on, the compass becomes the **wind rose**: every month as one slim line toward where the wind comes
    from (longer = stronger, rings 1 m/s apart, the picked month blue). Click a line to pick its month.

**What the surfaces look like.** Where a wall meets the floor or ceiling, and where a window frame sits on its sill,
the corner is softly shaded (every quality). Painted walls have a faint hand-plastered cloudiness and keep exactly the
colour you chose (Low and High; Lite shows the plain colour); up close at night they are smooth, with no specks. Window
glass has the faint green-grey of real glass and mirrors the sky; the neighbours' windows read as glass, and in the
Building view every window of the tower is real glass with that flat's own rooms and furniture behind it (§4).

**Furniture is as bright as the room it stands in** (every quality). A piece takes the light of the floor under its
middle: a wardrobe in a windowless closet or the basin in a windowless toilet is as dim as the walls round it, a sofa by
the window as bright as the floor there, and a dining table lit only through the living room's opening is dimmer than
the living room's pieces. A piece across two rooms (a rug in a doorway) takes the room its middle is in. Move a piece in
Edit furniture (or carry it with **G**) and it takes the light of where you put it at once. At night the lamps light
the furniture as they light the walls: a room whose lamps you deleted goes dim, pieces and all. Pieces outdoors (a lawn,
a pool deck, a play area) look as they always did, by day and at night.

**Around the flat.** Your own building first, then the neighbourhood. A flat that is part of a building (every built-in
flat, and a flat of a project you made in the Studio, §6) stands in that building in Walk and Dollhouse, as in the
Building view: look out of a window and you see the floors above and below with their windows and slab edges, and down
on the building's own ground — its lawns, driveway, parking, pool or play area — then the street. Behind the other
flats' glass are their rooms (floors, ceilings, painted walls; lit at night as in the Building view); their furniture
fills in once you have opened the Building view, so the walk starts as fast as before. A ground floor,
basement or rooftop you walk has the building above or below it too. In the Dollhouse the floors above yours are left
out, so you still look in from above (on Lite the Dollhouse shows only the ground and your own floor, and no made-up
street). On **Lite** only the ground (its lawns, paving, pool and play area, without the
trees, benches and play things) and the floors just above and below yours are drawn (what a window shows most); on
**Low** your building throws no sun-shadow (the neighbours still do); **High** draws all of it with its shadows.

**The sun's shadow outside (High).** In a flat that stands in its building, look out of a window, open the Dollhouse
or the Building view: the shadows of your building and of the neighbours lie across the lawn, the play area, the pool
deck, the driveway and the road, and on the neighbours' walls, as far as the haze — and they move as you drag the hour.
The grounds' trees, benches and play things throw theirs too (on the ground and the deck round them, never into your
flat: a tree's shadow falls outside it).
The narrow gap to the next building is in its shade most of the day, as on a real Dhaka street. On **Low** only your
flat and what stands right round it take the sun's shadow, and on **Lite** nothing does; further out the ground and the
road stay evenly sunlit there, as they do round a flat on its own (a Studio draft that is not part of a building). Where
that shadow ends, it fades into the sunlit ground over a metre or two, so no hard bright patch shows on the street.

The neighbouring buildings and roads are seen in Walk, Dollhouse and Building. They throw the sun's
shadow onto the flat and darken the rooms that face them: a bedroom looking at a wall 3 m away is dimmer than a room
facing the road, a low floor more than a high one. In the Dollhouse and Building view a block between you and the flat
is left out while you look from there (its shadow stays), so it never hides what you look at.

- **With a site set in the Studio** (§5, Site): the real buildings and roads from the map, with "© OpenStreetMap
  contributors" bottom right.
- **No site: a made-up street like a real Dhaka street.** On the sides with no road the next building stands 2–4 m from
  the flat's walls, in one row with gaps of 1.5 m at most, about as tall as this building. One side (on a corner plot,
  two) has the road, 6–9 m wide, with buildings right at its far edge; a built-in building uses its drawing's own road.
  Each building gets its own street, the same every time and for every flat of it. The buildings are off-white, sand or
  pale grey; on High each floor's slab edge runs across their fronts as a line. The made-up street shows in Walk and the
  Building view, and round the Dollhouse of a flat that is part of a building on Low and High (on Lite, and round a flat
  on its own: not round the Dollhouse).

**Small map** (bottom right, Walk only): white rooms, dark walls, your room washed light blue, you as a blue dot with a
cone, and a tiny compass to true north in its top left corner. It is drawn the plan's way up, so it stays put as you
turn. Its **×** (shows when the mouse is over it) or **M** hides it; the small **Map** button (or M) brings it back. It
steps aside while Finishes or Comment is open.

**Choosing quality** (buyer links, Preview 3D, the built-in flats)

- **⋯ → Quality: Lite · Low · High.** The one in use is white; a small blue dot marks the one this computer should
  use, and a line under them says why (hover the menu to see the graphics chip's name).
- **⋯ → How fast is it here?** (or `?stats=1` in the address; never on a buyer link) opens a card on the right: the
  graphics chip's name as the browser tells it, the quality in use, how long a frame takes (the middle of the last 60
  frames drawn one after another, and how many that makes a second), and what one frame draws — draw calls, triangles,
  shader programs, the pictures in graphics memory, the pixels drawn. It updates twice a second. Walk round for a few
  seconds, press **Copy**, and paste it into a message: the same lines as plain text, with the page, the window size and
  the browser. A frame at 16.7 ms is the screen's own 60 a second: smooth. × or Esc closes it.
- **The start screen says it too:** under Enter, "High quality · This device can show the full look. **Change**".
  When another quality is advised the line says why: a phone or tablet (they all start on Lite), integrated graphics
  (the graphics built into the processor), no graphics chip in use, 4 GB memory, 4 processor threads, no WebGL 2 (the
  browser's 3D feature), or slow frames. **Change** shows Lite · Low · High right there.
- A pick opens the page again with it (press Enter again; your finishes stay) and is kept in this browser. The 3D never
  changes your pick by itself, except when the graphics stop (below).
- If you never picked: when the 3D draws slower than 30 frames a second it steps down once (High → Low, Low → Lite)
  within about 3 seconds of the furniture loading, opens again and says "Switched to …: frames were slow on this
  device". If Lite is still slow its picture gets smaller ("Smaller picture: frames were still slow on this device").
- **High** — the full look: soft shading in corners, smooth edges, the sharpest pictures, up to twice the screen's
  pixels, lamp shadows, and the sun's shadow over the whole neighbourhood (the grounds, the road, the next buildings),
  not only round your flat.
- **Low** — the screen's own pixels, no corner shading, a smaller sun-shadow picture that covers your flat only (the
  grounds and the road beyond it evenly sunlit), 4 lamps lit at night (no lamp shadows), the wall tile's extra-sharp
  picture at half size, no potted-plant models, bathroom mirrors as plain silvery glass, your building round the flat
  without its sun-shadow, each heavy piece (a scanned sofa, a bed, a pleated curtain) a lighter copy of itself — the
  same shape and pictures, at most about 4 000 triangles instead of tens of thousands. Nothing is drawn while nothing changes.
- **Lite** — for weak laptops and phones: a smaller picture stretched to the window, no edge smoothing, no corner
  shading, **no shadows and no sun patches inside the flat** (rooms are still brighter by their windows; the sun still
  lights the street, the Dollhouse and Building views, and an open lawn, pool deck or roof terrace you stand on), **every
  lamp lit at night** — their light is worked out once when the flat opens and painted onto the rooms (a lamp moved or
  deleted in Edit furniture is worked out again), so no lamp costs anything while you walk; the street as plain blocks
  under a plain blue sky, pictures at half size and the colour picture only (no relief, no shine pictures), each piece a
  light copy of itself (at most about 1 500 triangles), no potted-plant models, plain mirrors, and of your building only
  the ground (no trees or play things) and the floors just above and below yours. Nothing is drawn while
  nothing changes (with Wind on its lines keep drifting). Same walls, furniture and finishes.

**When the 3D cannot run**

- No 3D in this browser at all: the "No 3D on this device" page — "This browser or computer cannot draw 3D, so here is
  the plan. Try another browser, or open the link on a computer." — with the flat's plan and room names. The Studio
  still works (it draws in 2D).
- The graphics stop in the middle (lost, or out of memory): the 3D opens again in Lite once and the start screen says
  "Switched to Lite: the 3D stopped on this device" (or "… the graphics ran out of memory …"), even if you had picked
  High; the tab stays on Lite until you pick again. Already on Lite and the graphics do not come back within 5 seconds:
  the same page and plan, never a frozen black picture.

**On a phone or tablet.** Open the same address. Every phone and tablet starts on Lite.

- **Going in:** tap **Enter**. Your finger never takes over the way a mouse does, so there is nothing to free with Esc.
  Held upright the screen shows the middle of the first view; when that middle would be a door across the room or a
  wall close by, you look down the room's length instead (Type A and Type C).
- **Walk:** drag one finger on the room to look round (the room follows your finger, like pushing a photo); tap the floor
  to walk there. A long press does nothing, so a resting thumb never moves you; two fingers do nothing in Walk.
- **Dollhouse and Building:** one finger turns, two fingers pinch to zoom and slide. Tap a room's floor to drop into it
  (Dollhouse), or a floor in the list on the right (Building; a tall tower's list scrolls and opens at the picked floor,
  **Walk this level** under it). In the Building view a tap on the tower shows the floor's card; a second tap on it opens
  it (§4). Lifting fingers after a pinch never drops you in. Upright, both views
  start farther back so the flat or tower fits.
- **The bar** (screens narrower than 720 px) sits at the bottom in two rows: Walk · Dollhouse · Building, then Finishes,
  Comment, Share, (staff) Edit, ⋯ and the eye, each big enough for a finger, with the Sun & wind pill above it. The
  room's name is smaller, top left; the small map top right.
- **Sheets:** Finishes, Comment, the Sun & wind card, the Rooms list and the menus come up from the bottom. Pull a
  sheet's short grey **grip** down to close it (a short pull settles back), or use its **×** (the card's **⌄**) or tap
  outside a menu. Finishes and Comment take the lower half so you can tap the flat above them; the rest up to 70 %.
- **Comment:** tap **Comment**, then the thing. The pin goes on, the note box opens beside it (above it when there is
  room, so the keyboard does not cover it), the sheet steps away while you write, **Save** pins it. Tapping the floor for
  a note does not walk you there. **Finishes:** with the sheet open, tap a floor, wall or ceiling above it.
- **Resting and Clean view:** after 3 seconds with no tap everything but the room's name fades; a tap brings it back
  (a tap where the bar was only brings it back, it presses nothing). The eye hides everything; a tap on the faint dot
  brings it back.
- **On its side, or a tablet:** a short screen lets the start screen scroll. From 721 to 1080 px wide the bar stays at
  the top with the room's name just under it.
- A touch-screen computer works both ways; the hint follows whichever you used last.
- **Staff on a phone:** Edit → Furniture and Edit → Openings work with a thumb, though a computer is still the
  better tool. The Edit furniture panel is one row over the bar, so the room and its furniture stay free for your thumb:
  "Tap a piece to move it" and **Add**; with a piece picked its name and **Done** (lets go of it); with one in your hand
  what you are placing (or in red why not there) and **Cancel** (back where it was). Tap the short bar (the grip) on top
  of the row for the rest — Turn 90°, Delete, Undo, Reset layout and its size; tap it again to fold them away.
  Tap a piece to pick it, drag it to move it, drag the empty room to look. Its resize dots are drawn small
  (7 % of the screen's short side, at most 44 px, so they never cover a picture on the wall up close) but a thumb takes a
  dot anywhere within half a fingertip of it. **Add** opens the library as a sheet from the bottom, with **×** and a grip
  to close it; the search box waits for your tap (so the keyboard does not jump up over the list) and every row is a
  fingertip tall. Tap a piece in it, then tap the floor, a wall or the ceiling where it goes: the Edit panel says so
  ("Tap the floor, a wall or the ceiling where it goes", or in red why not there); it lands where your finger did.
  Finishes, Comment and the menus cover the Edit panel while they are up. The panels speak of fingers — **Turn 90°** (no
  "(R)"), "Tap a piece…", "Tap a door, window…" — and no button anywhere names a key under a finger (the Studio's
  **Delete wall**, **Copy wall**, **Turn 90°** drop their "(Del)", "(Ctrl+D)", "(R)" on a touch screen).

**In VR:** hold the trigger to aim at the floor, let go to jump there. The thumbstick left / right turns you 45°.

---

## 3. The 3D view — staff only

What staff can change in the 3D view: furniture, doors and windows, low walls, the library, and their own models and
finishes. Buyers never see any of it.

One extra button sits in the bar: **Edit ▾** (washed blue while an editor is on). It holds **Furniture** (Edit
furniture), **Openings** (Edit openings), **Plan (Studio) ↗** (opens this flat or level in the Studio in a new tab) and
**Download 3D model** (saves this flat as one `.glb` file once every room has arrived; §5, "Give the drawing back").
The one that is on is the white row, marked "on". On a buyer link (`/s/…`) none of this section shows, even in a
browser that has opened the Studio: no **Edit ▾**, no **G**, no **+ Add option** — you see what the buyer sees. To edit
that flat, open its own address (`/u/…`, or **Preview 3D** in the Studio).

### The roof

The roof over the whole building (staff; buyers see it, never its choices). In the **Building** view open **Finishes** and
click the roof on the tower (or **Change** beside "The roof · the whole building" at the foot of Finishes): the panel's top
block is the roof.
- **Its covering**, as swatches: a flat roof — **Plain roof slab** (as before), **Gravel**, **Green roof**, **Terracotta
  terrace tiles**; a pitched roof — **Grey metal sheet** (as before), **Clay tiles**, **Slate**, **Zinc standing seam**,
  **Timber shingles**, **Corrugated metal**. The chosen one is the white row; no price (it is not a buyer's choice).
- **Kind**: **Flat** (the parapet, as every building had), **Gable** (two slopes, a gable wall at each end), **Hip** (slopes
  at the ends too), **Shed** (one slope, high along the back), **Mansard** (steep lower slopes all round, a low roof over
  them). Under a pitched roof there is no parapet, no stair head room, no water tanks and no roof garden.
- A pitched roof: **Pitch °** (empty: 30°, or as steep as the drawing set's eave and ridge make it — "as drawn"),
  **Ridge** (**Lengthwise**, along the building's long side, or **Crosswise**), **Eaves m** (how far the roof reaches past the walls:
  the slopes run on at the same pitch, a white fascia board along the edge and a soffit under it).
- A flat roof: **Coping** (**None**, **Plaster**, **Metal**, **Stone**): a cap along the top of the parapet.
- **A cornice band under the roof**: a band round the building just under the roof line (on a flat roof, round the parapet's
  foot).
- **Roof windows** (on a flat roof **Skylights**): **+ Add** puts one on the front slope; the windows on a slope spread out
  evenly; **Front / Back** moves one to the other slope; drag its slider to slide it along; **×** takes it away. A roof
  window is glass in a grey frame lying on the slope; a skylight sits on a 15 cm curb on the roof.
- **On the roof:** **+ Solar panels** puts a frame of two panels on the roof, **+ Chimney** a chimney stack; like the
  windows they spread out evenly, **Front / Back** moves one to the other slope, the slider slides it along, **×** takes it
  away. On a flat roof the panels stand on their tilted frame on the deck; on a sloping roof they lie on the slope, 12 cm
  over its tiles, and a chimney stands upright out of it. One that does not fit its slope (a narrow house) is left out.
  (A rooftop you traced as a level of its own is a floor: put panels and chimneys there from **Add → Outside**, §3.)
- Each change rebuilds the tower round the flat at once; **Done** closes the block. It is kept at once: a building made in
  the Studio keeps it in its project (the Studio's project column shows it under **ROOF**, §6); a built-in building
  (Type A's, Sheltech's) keeps it in this browser.

### Edit furniture

- **Click a piece** to pick it — also one seen through a window or a glass door. A click whose mouse slides up to 6
  pixels is still a click: the piece is picked, never moved.
- **Drag** a piece to move it. The piece turns red and says why when it cannot go there: outside the room, covering a
  window, overlapping another piece. Doors, passages and the entrance are not kept clear (founder, 2026-10-13): put a
  piece where you like.
- **What rests on a piece goes with it.** A drag on cushions, or on a TV standing on its unit, moves the piece under
  them; **Turn 90° (R)** on that TV turns the unit with the TV still on it. Drag that TV up a wall and it turns red: "A TV
  on its stand cannot hang" — for a TV on the wall use **Add → Living → 55" TV, wall-mounted**.
- **Wall pieces go up and down:** a TV, picture, AC, clock, mirror or geyser follows the mouse along the wall and up or
  down it, in 1-inch steps, never below the skirting or through the ceiling. It turns red over a window ("Covers the
  window") or in a doorway ("Covers the doorway"); above a door's head it may hang.
- **Drag a dot** on a piece to make it bigger or smaller (only pieces that can stretch).
- **Outside the flat** (the library's **Outside** group): a sunshade (chhajja), a canopy, an awning, louvres, fins, a
  jaali screen, a roller shutter, an AC outdoor unit, a fire escape, an edge planter or a name sign may also hang on the
  **outside face** of a wall — the side where no room is. In the **Dollhouse** turn round to the flat's outside (or in the
  **Building view**, with Edit furniture on, turn the tower), pick the piece in **Add** and point at the outside of one of
  this flat's walls; on a balcony in **Walk**, point at the balcony's own walls. In the Building view only a new piece is
  put down this way — to move or delete one, go back to the Dollhouse (a click on the tower opens a floor). It goes
  flat against that face, facing out, and slides along it in 3-inch steps, up and down in 1-inch steps (outside there is no
  skirting: it may come down to the floor). It turns red and says why: "Covers the window", "Covers the doorway", "Past the
  end of the wall", "Runs into a wall" (a parapet round the corner: above it is fine), or that it overlaps another piece.
  Other pieces (a sofa, a TV, a picture) stay inside: on an outside face they say "Outside the room".
- **Over a window or door by design:** a sunshade, canopy or awning never "covers" its opening. Dropped on a window or
  door it fits itself to it: centred on it, 15 cm wider each side, its underside on the opening's top. A louvre, fin or
  jaali screen or a roller shutter fits in front of it: 5 cm wider each side, from just under the sill, as tall as the
  opening. Dragged later, a sunshade within 20 cm of an opening's top sits on it exactly. Drag a dot to change the size.
- **Curtains** are a piece of their own, hung on their opening. Drag them (or **G**) and they slide along their wall in
  3-inch steps; they cannot be pushed into another pair ("Overlaps the curtains"). Drag the dot on one side to make them
  wider or narrower on that side (5 cm steps from the opening's edge, 0.4 to 6 m, never round a corner). They follow
  their opening when it moves or resizes. To add a pair: **Add → Bedroom** (or Living) **→ Curtains**, then point at a
  window, sliding door, door or passage (also through the doorway) and click; they hang centred on it, up to 15 cm past
  each side, floor to ceiling, drawn open. Pointing at no opening says "Point at an opening". Curtains in a doorway do
  not stop you walking through.
- The small panel, bottom left: **Add**, **Turn 90° (R)**, **Delete**, **Undo**, **Reset layout** (back to the floor
  plan's own layout, as the Studio's F tool arranged it; Undo brings yours back).
- Keys: **R** turns · **Del** (or Backspace) deletes · **Ctrl+Z** undoes · **Esc** lets go.
- **G** picks up the piece under the mouse (also through glass) without opening Edit furniture; **G** again puts it
  down. **Del** deletes the piece in your hand, with what rests on it; Undo brings it back. A new piece from the library
  still in your hand is just let go.
- **Every flat keeps its own furniture** (founder 2026-11-21): each piece moved, added, removed, turned or resized is
  kept for this flat at once — floor 3's Type A, not every floor of that plan — and the flat opens like that next time,
  by any way in, and on another computer once the Studio has saved the project online (§2, "Every flat keeps its own").
  Nothing is asked: the "which floors?" box is for doors and windows only now. The panel's last line says where it is
  kept ("Kept for floor 3 only: it opens like this next time").
- **The Studio's F tool arranges the floor plan itself:** a plan on one floor (and any level) is one flat, so F and the
  3D view show the same layout, as before. A plan on several floors: F arranges what every floor starts with; a floor
  you changed in the 3D view keeps its own (**Reset layout** there brings it back to F's).

### The library

The same list in the 3D view (**Edit ▾ → Furniture → Add**) and in the Studio (tool **F**, on the right).

- **A search box on top**, ready to type into in the 3D view (in the Studio click it first: there the letters pick
  tools). Any word shrinks the list as you type: a name (*sofa*, *lamp*), an everyday word (*almirah*, *chula*,
  *jaynamaz*, *geyser*), or a room (*balcony*, *kitchen*, *office*); plurals work. **Enter** takes the first piece. One
  **Esc** empties the box and leaves it (in the 3D view it also closes the library, as its **×** does).
- **Without a search:** **Recent** (your last six), then the groups with how many pieces each holds — **Living** 28,
  **Dining** 15, **Bedroom** 32, **Office** 6, **Kitchen** 16, **Bath** 8, **Lights & AC** 10, **Greenery** 18,
  **Outdoor** 12, **Outside** 16, **Lobby & gym** 6, **Decor** 28 — 170 pieces in all (some are in two groups: the
  hand-wash basin under Dining and Bath, as a Dhaka dining space has one; desks and office chairs under Bedroom and Office;
  the edge planter under Greenery and Outside, the AC outdoor unit under Lights & AC and Outside). Inside a group the pieces stand by kind with a count (Sofas 5, Armchairs
  3, …).
- **Outside** is what goes on a building rather than in a room: **Canopies and porch roofs** (a glass canopy on steel rods,
  a concrete slab canopy, a porch roof on posts), **Sunshades** (the chhajja over a window), **Awnings** (fabric),
  **Screens and fins** (vertical fins, a louvre screen, a perforated jaali screen), a **roller shutter** (a scan) and an
  **AC outdoor unit** on its wall brackets (a scan), a **planter box on a balcony edge**
  (with plants: pointed at a balcony's solid low wall it sits on its cap, astride it; at a railing, grille or glass front
  it stands on the balcony floor just inside it), a **fire escape** (a steel landing with a stair up to the floor above: put one on each floor and they
  make the whole stair), a **name sign** (a blank brushed-steel plate), **solar panels**, a **chimney** and a **flagpole**.
  The last three and the porch roof stand on a floor: a rooftop's deck, a ground floor's paving or lawn. All but the two
  scans are built by Plotline and get more fins, slats, modules or balusters as they grow, never stretched ones; the
  shutter stretches wider or taller on its own, the AC unit keeps its shape. Words that find them:
  *chhajja*, *louver*, *jaali*, *aircon*, *PV*, *facade*, *outside*.
- **Each row:** the name, its footprint in feet (width × depth), and a mark — **built** (drawn by Plotline; resizing
  builds it again at the new size: more shelves, drawers, doors or seats, never stretched), **scan** (a photo-real
  scanned model from Poly Haven, loaded when placed; resizing stretches it a little) or **yours** (your staff's own, with
  a **⋯** to rename, resize or remove it).
- **Placing:** click a piece (or Enter), point at the floor, a wall or the ceiling, click.
- **A table lamp stands on what is under it:** point at the top of a desk, bedside table, chest, shelf, TV unit, console
  or counter and its foot sits right on it; on the floor it stands on the floor; on a bed, sofa or chair it turns red. It
  moves and rises with what it stands on.
- **Resizing** works for every piece but stairs and curtains. Built again at the new size: upholstered beds, wardrobes,
  closets, larder, fridges, desks, the three dining tables (the chairs follow the seats), sofas, cots, rectangular rugs
  and the runner, planter boxes, the bookshelf, the chest of drawers and both TV units. The rest stretch within limits:
  longer only for benches, consoles, racks and the study desk; the same shape for lamps, mirrors, plants and round rugs.

### Your own furniture, finishes and textures

Staff put their own 3D models, finish options and texture pictures into Plotline in a few clicks; they then work
exactly like the built-in ones.

**Your own piece of furniture** (a supplier's sofa, a lamp from Sketchfab, a desk drawn in Blender):

1. Open the library (3D view: **Edit ▾ → Furniture → Add**; Studio: **F**) and click **+ Add your own…** under the search
   box. A white box opens: **Drop a 3D model here**.
2. Drag the file onto it, or **Choose a file…**: **GLB, glTF, OBJ, FBX, DAE, STL**. Best is one **.glb** (Blender: File →
   Export → glTF 2.0, Format "glTF Binary (.glb)"). A model that keeps its parts in separate files (a .gltf with its
   .bin and a textures folder, an .obj with its .mtl and pictures): drop its **whole folder or a .zip of it**, or select
   all its files and drop (or choose) them together — Plotline finds the model among them and its pictures beside it.
   A .gltf dropped alone says to drop its files together.
3. The model turns slowly on the left, with its size in feet and inches (and metres) and its triangle count. On the
   right: **Name**; **Kind** (decides its group); **Which side is the front** (click the arrow of the front side until it
   faces you); **Where it sits** — **Floor**, **Wall** (eye height, like a picture), **Ceiling** (hangs, like a pendant),
   **On a table** (like the table lamp) or **Outside wall** (a supplier's AC unit, awning or sign: it hangs on a wall like a
   picture and may also go on a wall's outside face; listed under **Outside**); **Real size** — type one side (6'2", 1.9 m or 190 cm) and Enter, the other two
   follow so it never squashes; **It gives light** (ticked by itself for the kind "Lamp or light": it lights the room at
   night).
   An **OBJ or STL names no unit**. When its numbers cannot be metres (bigger than 12 m or smaller than 5 cm), Plotline
   does not fill in a size it would have to guess: it says "This file names no unit. It looks like:" with the units that
   make it a piece of furniture, each with the width it gives — **Inches · 7'-0"**, **Centimetres · 2'-9"** for a sofa
   drawn 84 across. The size boxes show the first in grey; pick one, or type the real size of one side, and **Add to the
   library** can be pressed. When only one unit fits (an 1800-wide cabinet: millimetres) it is picked already, as before.
4. **Add to the library.** A line says where it is kept, and the piece is in your hand: point and click (on a phone,
   tap) to place it (the line goes as soon as the piece is down).

It is listed on top of the library under **Your own** (and in its group), marked **yours**, with **⋯**: **Rename**;
**Change size** (pieces already placed take the new size at once); **Remove…** (asks once; pieces already placed stay —
delete those in Edit furniture). A file over **30 MB** or a model over **2 million triangles** is refused with the
reason and how to lighten it (Blender: Modifiers → Add Modifier → Decimate, Ratio 0.5, Apply, export as .glb).

**Your own finish option** (a tile, a parquet, a paint the developer offers):

1. In the 3D view (staff): **Finishes**. Under each group there is **+ Add option**; click it under the right group.
2. Fill in **Name**, **Brand**, **Code** (empty: Plotline makes one), **Price difference ৳** (0 = included, a minus for
   cheaper; commas are fine), **Offered in** (another group if you like), and **Its look**: **Colour** (pick it),
   **Texture** (one of Plotline's surfaces, with **Tinted** for a colour) or **Picture** (drop a JPG or PNG of one tile
   or plank, up to 4 MB — a bigger one is made 2048 px across — and type **One picture covers**: how big that photo is
   on the floor or wall, across × down).
3. **Add option.** It joins the group, is chosen at once and shows in the 3D. Its **⋯** (staff only) opens the same form
   to **Save** a change or **Remove** it.

**Where it is kept:** in this browser, models and pictures too. Signed in to your company (Studio → ⋯ → Sign in) it is
also online for the whole company: colleagues see your pieces and options, and buyer links made with **Share link**
draw them. A buyer link made while signed out shows your own piece as a plain box of its size — sign in and share
again.

### Edit openings (doors, windows, sliding doors, open passages, low walls)

Works in Walk and Dollhouse; the mouse stays free, so drag empty space to look round.

- **Click one** to pick it, **drag** it along its wall, **drag a dot** to change its width, height or a window's sill
  (the height of its bottom edge). An open passage is picked by clicking anywhere in it.
- The panel, bottom left: its kind (**Door · Window · Slider · Passage**), **Width / Height / Sill** to type, **Delete**,
  **Undo**.
- **Low walls** — a railing, parapet, planter edge or kerb, anything under 1.2 m (3'-11"). Click it: a blue box with a
  dot on each end, and "Low wall · 6'-9" long · 1'-6" high". Drag an end dot to make it longer or shorter along its own
  line (a joined end leaves its corner, opening a gap the Studio lists under Issues with **Extend**; hold **Alt** to keep
  the corner joined, the wall it meets moving with it). Drag the wall itself to move it across. Type **Length** (end B
  moves) and **Height**.
- **Made of** (a low wall picked): **Solid (plaster)**, **Glass** (clear panels in a steel channel, a steel rail on top),
  **Metal railing** (posts, rails and thin bars), **Steel grille** (dark bars with a band of crossed flats, as Dhaka
  balconies have), **Timber railing**, **Timber fence** (boards on posts) or **Chain-link fence**. Pick one and the 3D
  shows it at once. To make a balcony glass-fronted: **Edit ▾ → Openings**, click the balcony's edge, **Made of → Glass**
  (each side of the balcony is its own low wall: click the next one and do the same). A solid one has **Cornice**: a
  stepped band under its cap. A passage in a railing or fence stays a gap — a gate.
- Keys: **Del** removes what is picked · **Ctrl+Z** undoes (one drag = one step) · **Esc** unpicks · **Alt** while
  dragging a low wall's end keeps its corner.
- A window or a sliding door also has **Frame**: *Same as the building* (Finishes → Window frames), or its own colour —
  Silver, White, Anthracite, Black, Timber. It changes that window on every floor its floor plan stands on.
- A room nobody arranged is furnished again for its new walls; a room you arranged keeps its pieces. An opening's
  curtains go with it (move, resize, delete).
- The change is written into the Studio drawing, so plan and 3D always agree; a Studio open in another tab shows it the
  moment you let go ("Changed in the 3D view … — the plan shows it now").
- On a built-in flat it first asks to make that flat your Studio drawing (this replaces the drawing you had there). On a
  project floor whose drawing is on other floors too, it asks "Floor 3 only" or "All 4 floors" (§6).

---

## 4. The Building view

The whole tower, floor by floor: point at a floor to see which it is, open a flat, or walk a common level.

- **Point at the tower.** The storey under the mouse turns a little brighter, and a small card beside the mouse names it: the
  floor in large letters ("Floor 4", "Ground floor", "Basement 1", "Rooftop") and, over a flat, the flat's name and its
  size from the plan ("Type B · 1747 sft"), then what a click does there. **Click** opens that flat in its Dollhouse,
  walks a ground floor, basement, rooftop or common floor, or — on a floor with nothing to open — picks that floor as the
  list does. The card keeps to the screen at its edges; it goes while you drag the tower round.
- **Staff, with Edit furniture on:** **Add** a piece from the library's **Outside** group (a sunshade, a canopy, an AC
  unit…) and point at the outside of the open flat's walls: it hangs there as in the Dollhouse (§3), and a click puts it
  down. While a piece is in your hand, a click on the tower puts the piece down instead of opening a floor; Esc lets it go,
  and so does opening **Finishes** (there a click on an outer wall opens its outside card); picking a piece closes Finishes.
- **No new page:** the flat or level you click comes into the same 3D, as a stair brings a floor (§2): the tower stays on
  screen, the line at the bottom says where you are going ("Floor 8 …"), and the picture changes in one go — about 2–3
  seconds for a flat, longer the first time you open a ground floor with trees and play things (5 s on Lite, about 10 s
  on High, while the graphics card learns them). The address changes to it, so a reload opens it; the browser's **Back**
  brings you back to the tower, also without a new page. **Walk this level** under the floor list goes the same way.
- **On a phone:** tap a floor and the card shows beside your finger (the storey brighter); tap the same floor again to open
  it. A tap somewhere else names that instead.
- **Floors on the right** (headed "Floors"), top to bottom: **Roof**, the flat floors by number, **Ground**, **B1**,
  **B2** — the numbers in the large serif letters, Roof / Ground / B1 in small capitals. The floor under the mouse, in the
  list or on the tower, is the white row and is a little brighter on the tower: point at a row and you see that storey on
  the building. The picked floor has a thin blue line running to the list's edge, your own flat's floor a small blue dot.
  A tall tower's list scrolls to keep the picked floor — and the floor under the mouse — in view.
- **The picked flat is lit.** On the tower the picked flat — everything of it you see from outside: its walls, its
  balcony fronts, its window frames and the rooms through its glass — is shown about a fifth brighter than the rest, by
  day and by night, from every side; at night its lamps are on too (the **Lights** button turns them off). No lines, no
  colour: the floor under the mouse turns brighter too, but less. Pick another floor and the light moves to it.
- **Every window is a home.** Behind every window of every flat are its real rooms: the floors, the ceilings and the
  walls in their paint, and the furniture the walk lays out (beds, sofas, tables, wardrobes, curtains) — each floor as
  staff left it: floor 5's blue bedroom is blue from the street, floor 4's next to it white. The glass is real
  glass in an aluminium frame, mirroring the sky's haze at a slant; your own flat's furnished rooms show through its
  glass too. By day the rooms read a little darker than the street, with sun patches on the floors; at night about half
  the rooms have a lamp on — warm, neutral or cool, some flats all dark — the same ones every time you look. The ground
  floor's lobby and the common floors have their rooms and furniture too, lit at night.
  - The tower shows first; the rooms fill in within a moment, the nearest flats first, then the furniture flat by flat.
  - By quality: **High** furnishes every flat; **Low** shows every flat's rooms and furnishes the three storeys
    nearest you (it follows you as you turn the tower) and the floor you picked; **Lite** shows every flat's rooms without furniture.
  - Rugs, potted plants and small things (a vase, a book) are left out of the other flats: from the street they are not
    seen.
- Picking a basement hides everything above it; the street and the next buildings stay.
- **The roof:** a building whose rooftop was not traced still has one — the top floor's slab, a parapet along its outer
  edge, the stair and lift head room with the water tanks on it, and the roof garden its data lists (the Demo tower). A
  building made in the Studio gets the head room over the rooms its top floor's drawing names a stair or a lift ("Stair",
  "Lift", "Lift lobby") — name them so on the plan. A traced rooftop (Sheltech) shows as drawn.
- **A pitched roof** (gable, hip, shed or mansard; staff set it, §3 "The roof", or the Studio's project column, §6): drawn
  over the top floor instead of the parapet, in its covering (clay tiles, slate, zinc, shingles, corrugated metal), at its
  pitch, with its overhang, fascia, soffit and roof windows; a flat roof can be gravel, a green roof or terrace tiles, with a
  coping on its parapet and a cornice. A drawing set whose sections print an eave and a ridge gets its gable (or hip) at the
  printed heights without anyone setting it. A traced rooftop stays as drawn under a pitched roof. One roof covers the top
  floor's whole outline as a rectangle: an L-shaped building gets one roof over its box; no dormers yet.
- **Top left** names the picked floor: "Floor 2" over "Type A · 2703 sft", the flats of another floor, or "Ground
  floor", "Basement 1", "Rooftop".
- **Walk this level** (the blue button under the floors) shows for a ground floor, basement, rooftop or common floor.
- Drag to turn, scroll to zoom.
- **Round the tower:** the made-up street (§2, "Around the flat") or, with a site set, the map's blocks and roads; both
  cast shadows on the tower. On High the tower's and the neighbours' shadows also lie on the road, the grounds and the
  next buildings' walls as far as the haze, moving with the hour. A block between you and the tower is left out while
  you look.

---

## 5. The Studio

Where staff turn what the architect sent into the project's floors, check them, and send them to 3D. The Studio reads
whatever the architect sends — the whole set as a PDF, CAD files, a building model, or a brochure's plan picture — and
what you drop decides what comes next. Whatever it was, the column on the right is the project, from the first drop.

**On a phone** (a screen under 720 px wide) the Studio opens as one card instead: "The Studio is for a computer", with
**See a flat** and **Open it anyway** (that opens the Studio, squeezed, for the rest of that tab).

**What you see.** Left to right: the **tools** (a strip of small drawings), the **sheet** (a light stone page with the
drawing on it), the **project's column** (its name, its floors and where each came from, the views kept from the set,
the site — §6) and the **inspector** (white: **Steps**, what you picked, **Issues**); along the top the **top bar**, along
the bottom the **status bar**. **Building** in the top bar hides and shows the project's column. With nothing on the
sheet yet the inspector holds only Steps (no empty Selection, no Issues about nothing).

On the sheet the plan picture lies like a sheet of paper, a little faded, so the walls stand out in dark ink. Doors are
drawn with their swing, windows as three thin lines between two short ends, as on an architect's sheet. What you picked
is **blue**; what is under the mouse gets a light blue edge before you click. Room names are in small capitals with the
printed size under them. **Zoomed out** (a whole floor at 30 %), names never sit on top of each other: a crowded name
first loses the space between its letters, then gets a little smaller without its printed size, and where two still would
not fit the bigger room keeps its name — the other shows when the mouse is over its room (its neighbours make room for
it). Wall lengths are written only where they cover no name. A drawing that comes in, or a project's column that opens
beside it, is fitted to the sheet; once you zoom or slide it, the view stays yours.

### The door — Drop your drawings

With nothing on the sheet, the middle says **Drop your drawings** — "The architect's set (PDF), CAD files (DXF), a
building model (IFC), or a plan picture — a file, several, a folder or a .zip." Drop them on the dashed box or anywhere on
the page, or click **Choose files…** (the one blue button: it picks any of them, several at once; ⋯ → **Import…** and
**Ctrl+O** open the same picker). Pictures: PNG, JPG, WEBP or TIFF, up to 10 MB; an iPhone's HEIC photo only in a browser
that opens it (Safari), else a message says how to get a JPEG.

**Try a sample ▾** (beside Choose files…) lists eight real buildings' files found on the internet and free to pass on —
at least one of each kind Plotline reads, each with its kind and size ("IFC · 415 KB"); rest the mouse on one for who
made it and its licence. Click one and it opens exactly as if you had dropped it: the two IFCs make their floors (the
flat opens with its 7 named rooms), the DXFs and the SVG open as a drawing, the school PDF opens as a drawing at its
printed 1 : 200, Casa Steiner's PDF becomes the plan picture (its message offers **Read its lines instead**), and the 3D
model (a brick apartment building) gives only the outside shape — it shows under **Outside shape** on the right and waits
for a drawing to stand round. Esc or a click elsewhere closes the list. Where each came from: `public/samples/MANIFEST.md`.
All 53 files of that hunt, and how each one reads today, are listed in [SAMPLES.md](SAMPLES.md) — they sit on the office
PC in `E:/dev/ALTERNATIVE FORMAT TEST/samples-2026-11-22/`; drop any of them on the Studio to see it yourself.

**Open a project** (under the box, when projects are kept in this browser) lists them newest first, each with its floors
and drawings ("3 floors · 3 drawings"): a click opens it — its floors on the right, its lowest drawn floor above the
ground on the sheet. **Start an empty project** under the list opens the New project card, its Name box ready to type (§6: the building's name and
floors first, a drawing for each floor after). A floor of an open project with no drawing yet (after **Draw**) shows the
same door, titled for it: "Drop the drawing of floor 2".

### What happens with each kind

| You drop | What you see next | Then |
|---|---|---|
| **The architect's set** — a PDF of several pages, several PDFs, a folder or .zip of DXF / SVG files | **What is in this set** over the sheet: every drawing listed by kind — plans with their floors, elevations, sections, site, schedules ("Reading page 7 of 25…" while it reads) | **Build the project**: a project with every floor the set names, each ticked plan the drawing of its floors, in real sizes; the elevations, sections, site and schedules kept with it. Nothing to scale or trace — except a floor whose page is only a picture (scaled already when the sheet prints its scale). "Drop a whole set" below |
| **A building model** — an IFC (.ifc, .ifczip) | A box at the top: "Reading … · building the 3D (53 %)", **Cancel** | Several storeys: a project of them, basements to rooftop, the first floor above the ground open. One storey: a project of one floor. "Bring in the architect's file" below |
| **One CAD drawing** — a DXF or an SVG, or a one-page PDF printed from a drawing program | The drawing in real sizes, and **What was read from the file** on the right | A project of one floor (the drawing on **Floor 1**), named after the file. Nothing to scale — unless the DXF names no unit, or a wrong one: then **Check its size** is a step (the **Read in** row) |
| **A plan picture** — PNG, JPG, WEBP, TIFF, HEIC; a brochure page | The picture on the sheet | A project of one floor with the picture on Floor 1: **S** sets the scale, **Auto-trace** traces it (or W and the other tools by hand) — the same clicks as before projects came first |
| **A 3D model** — .glb, .gltf, .obj, .fbx, … | Its name under **Outside shape** on the right | The building's outside, round the drawing open now: no floors of its own |
| **A Plotline file** (.json, from Export) | The drawing exactly as it was saved | — |
| **A locked file** — .rvt, .pln, .skp, .max, .blend, .dwf, and .dwg until it is turned on | A message | Which export to ask the architect for |

**With a project open,** a dropped drawing goes into the drawing open in it — asked first when that one has walls
("Replace the drawing on screen with *file*? Undo brings it back.") — and a set asks whether to add its floors to the
project or make a new one. A drawing open in no project (an older draft) is replaced the same way, after the same
question.

### The Steps

On the far right, at the top of the inspector: the checklist for the drawing open now. It ticks itself as you go, the next
step marked with a blue dot, and it follows what you dropped:

| You dropped | Steps |
|---|---|
| Nothing yet | 1 Drop your drawings · 2 Check · 3 Preview 3D · 4 Share |
| A set | 1 Read the set (ticks when every page is read) · 2 Check the floors · 3 Build (both tick once **Build the project** is done) · 4 Check · 5 Preview 3D · 6 Share |
| A CAD or IFC file, a PDF page read from its lines | 1 Read the file · 2 Check its size (only when the DXF names no unit, or a wrong one: pick the unit in **Read in**, and it ticks) · Check · Preview 3D · Share — nothing to scale or trace |
| A plan picture — also a floor of a set that came in as a picture | 1 Load plan · 2 Set scale · 3 Trace walls · 4 Wall thickness · 5 Openings · 6 Rooms · 7 Check · 8 Share |

**Check** ticks when something is drawn and Issues holds no error that stops it from being built, as before (a red loose wall end can stay: it is worth fixing, it leaves a room open in 3D). **Preview 3D** ticks once you have looked at the
drawing in 3D (**Preview 3D**, or **Show building**). **Share** ticks once it has gone out; under it, **Buyer link** (with
the online database), **DXF**, **3D model** and **Print** do what ⋯ → Share link, Export as DXF, Export 3D model and Print
plan… do, and ⋯ → **Export** (the Plotline file) ticks it too.

**Draft restored.** The Studio opens on the drawing you left, with a message at the bottom: "Draft restored — its name",
**Start over** and **×** (hides the message). **Start over** asks first: "Start over? The drawing, its picture and its
furniture go. Undo cannot bring them back." — **Start over** (red) empties the Studio for good; **Cancel** or **Esc**
keeps everything. A drawing of a project is not asked about: it stays in its project (open it again from the floor list,
or from **Open a project** on the door) and only the screen empties.

**Messages at the bottom.** What was done ("Joined 1 overlapping wall — Ctrl+Z undoes") fades after about 5 seconds
(longer for a long one). Something refused or gone wrong ("A zone line takes no doors or windows", "Could not read the
file …") has a small red dot before it and stays until you click its **×**, the next message comes, or you change the
drawing.

### Top bar

- **Left:** **Plotline STUDIO** (opens the front page; the mouse over STUDIO says this browser is in staff mode), then
  the drawing's fields: **Unit name**, **Project**, **Floor** (numbers only), **Area** (sft). They look like plain words
  until the mouse is over one. An empty name box shows in grey the name Preview 3D will use ("Type A", **Floor plan A**
  for a whole floor, else "Untitled unit"); Export, Export as DXF and Share link name the file and the buyer's link the same
  way (floor-plan-a.dxf). Narrower than about 1000 px, Project and Area step aside.
- After the fields, when signed in: where your work stands online (**Saving…**, **Saved · just now**, …; "Accounts"
  below).
- **Right:** **↶ Undo** / **↷ Redo**, **Auto-trace** (once a plan picture is in), **Preview 3D** (the blue button: your
  drawing in the 3D view, in a new tab), **Building** (shows / hides the project's column, §6), and **⋯**.
- While the Studio is empty, **Choose files…** in the middle is the blue button and Preview 3D is plain: there is
  only ever one blue button. With no wall drawn yet (an empty Studio, or only a 3D model's outside shape), Preview 3D
  says "Nothing drawn yet to show in 3D" instead of opening a 3D page with nothing to build.

**⋯** opens a menu in four parts (Esc or a click elsewhere closes it):

| Part | Item | What it does |
|---|---|---|
| Drawing | **Import…** (Ctrl+O) | The same picker as Choose files…: a Plotline drawing file, the architect's own file or a picture ("What happens with each kind" above). In a project it goes into the drawing open now |
| | **Export** (Ctrl+S) | Saves the drawing as a Plotline file (`.json`); after an Auto-trace it holds the Check these rows too |
| | **Export as DXF** · **Export 3D model** · **Print plan…** | "Give the drawing back" below |
| | **Export answers** | Saves every Check these answer clicked in this browser as `plotline-answers.json` (the Local AI's answers marked `"by": "ai"`) |
| Building | **New project** | The project's column with the New project card (§6) |
| | **Site** | Where the building stands ("Site" below); "open" shows beside it while the panel is open |
| Buyers | **Share link** | Makes a buyer link and copies it. Signed in: for your company, nothing asked. Not signed in: asks once for the staff key, in the marble card. Only with the online database |
| | **Change list ↗** | Opens `/changes` in a new tab. Only with the online database |
| Account | **Sign in** / your email | Your account, your company's projects, members and buyer links ("Accounts" below). Only with the online database |

**The status bar** (bottom): on the left what the tool does, in one short line (the whole sentence when the mouse is
over it); in the middle, while you draw or drag, the length, the angle and what the point sticks to; on the right how
long you have been tracing, the scale (1 px = … m, or "Real sizes · no picture lined up" for a drawing read from a file)
and the zoom. **Keys** (bottom right) or **?** opens a sheet with every key, the tool you are on explained in full at the
top; **×**, Esc or a click elsewhere closes it. Every key in one list: [KEYS.md](KEYS.md).

### The tools (the strip on the left)

Each is a small drawing — an arrow, a measuring line, a wall corner, a curve, a door and its swing, a named room, a
filled square, a sofa. Point at one for its name and key ("Wall  W"); press the letter to pick it. Every tool but **V**
and **S** is locked (faint) until the scale is set; a drawing that already has walls (a built-in level, an opened file)
is in real sizes, so its tools are open at once. **Hold** W, O or R, use the tool, let go: you are back on the tool you
had.

**V — Select**
- Click a corner, wall, opening, room name or column to pick it. **Shift+click** adds to what is picked (or takes one
  out); **drag on empty plan** for a dashed box that picks every wall, opening and column it touches (Shift+drag adds);
  **Ctrl+A** picks every wall; **Esc** or a click on empty plan unpicks. The status bar says what is picked ("3 walls, 2
  windows selected"); a value typed on the right then changes them all, **Del** deletes them all, the arrow keys nudge
  them all, and one Ctrl+Z takes it all back. A drag moves only the thing under the mouse.
- Drag to move; **Shift** = no snapping. Drag the end of a picked wall to lengthen or shorten it (**Alt**: the walls
  joined to it follow). **Alt** + drag a corner of an unpicked wall pulls that one wall free.
- **Thickness by mouse:** a picked wall shows a dot on each long face; drag it out to thicken that side, in to thin it,
  in whole inches. The whole straight wall changes, and the walls at its ends stay joined.
- Double-click a wall to type its length. The numbered marks on the plan can only be clicked with V.

**S — Scale**
- Click both ends of a size printed on the plan and type it (`14'-5"`, `14.4` or `4.4m`). No size printed (ground floors,
  basements, rooftops)? Use anything whose length you know: the plot's width from the land papers is the one to trust (a
  door or a drawn car was 4–6 % off in our test; a parking bay is about 8' × 16', a single door about 3'-3").
- **Only room sizes printed** (most brochure sheets: "BED-2 15'-0"X11'-10"", no dimension line): a room's size runs
  between the inside faces of its walls. Pick a plain rectangular room, zoom in with the wheel until its two walls fill
  the plan (at a whole floor's 30 % a click 2 px off is a 1 % error), click the inside face of one wall, then straight
  across on the inside face of the other, and type the number for that side — the longer number for the longer side
  (BTI's Bed-2: 15'-0" from wall to wall across, 11'-10" up and down). The status bar then shows the scale (1 px = … m).
- **Lining a picture up with a drawing that has none** (a built-in Banani / dmd level, an opened file): drop the picture,
  press **S**, then 4 clicks — a corner on the picture, the same corner in the drawing, then another corner far away,
  likewise. The picture jumps under the drawing at the right size and "Done" shows. Wrong? **Ctrl+Z** and again. The
  picture must be the same way up.
- With a picture under it, S is the plain scale tool again. Set the scale BEFORE tracing: walls already drawn keep their
  typed sizes and no longer sit on the picture.
- The Sheltech levels open with their plan picture already behind them.

**W — Wall**
- What to draw (keys 1–4): **Wall**, **Low wall** (boundary wall, parapet, railing; type its height — then pick it for **Made of**: glass, a railing, a grille, timber, a fence; on the plan such a one shows a line down its middle), **Kerb** (a 6-inch
  edge, as round a planter), **Zone line** (invisible; only separates two areas, a lawn from a driveway).
- Click corner after corner; click the first corner again to close the room. While drawing, type a number for the exact
  length (**Tab** switches to the angle); **Backspace** takes back the last piece; **Esc** stops; **T** switches thin
  (5") / thick (10").
- **What the cursor sticks to** (the status bar says which, before the first corner too): a corner, a wall's centre line
  ("wall — will split"), a column's centre, corners and sides, and a thick wall's two faces. **Shift** = no sticking.
- A wall started or ended on a wall where a door or a window sits (a veranda's railing meeting a bedroom's window wall)
  puts its corner there all the same: the opening is cut back to the new wall's face, keeping its larger side, and the
  message says "The opening there was cut back to meet it — Ctrl+Z undoes".
- **Walls that touch are joined** (founder 2026-10-09: "a wall touches another wall, that is it, it is a box"): a wall
  touching a column anywhere closes the room there (the room goes round the column); a wall stopping on another wall's
  face joins it; a wall end put down a little short — up to 6 inches, or that wall's thickness — is carried on to it
  (when you click, when you drop a dragged end, by Join walls, after Auto-trace and when a drawing opens).

**A — Arc** (a curved wall)
- Click where it starts and where it ends, then move the mouse: the curve bends through the pointer; click to lay it
  (Esc cancels). It lays a chain of short straight walls (at most 10° of turn each, none shorter than about 1 foot); the
  status bar says how many. Its ends stick and join like a W corner, so an arc from one point of a wall to another closes
  a curved bay you can name with R.
- The pieces are the W tool's type, 5" thick; after laying they are all picked (**T** makes them 10", Del removes them).
  Rooms, doors, the 3D and Auto-trace see the straight pieces (a door goes on one piece).

**O — Opening**
- Pick one: **Door 2'-6"**, **Door 3'-0"**, **Window 4'**, **Window 6'**, **Slider 6'**, **Slider 8'**, **Passage**
  (keys 1–4 for the kind), or **Glass wall**. Point at a wall — a preview shows what you will get — and click. Kerbs and
  zone lines take no openings.
- **Glass wall**: click a wall and all of it becomes glass, floor to top. For part of a wall, drag the glass's end
  shorter, or split the wall first (W, click on it).
- With a door picked: **H** flips the hinge side, **Shift+H** which way it swings.
- **Curtains:** a window or sliding door in a bed, living, dining or study room gets a pair by itself when the other
  side is outside (a veranda, a shaft, open air); a glass wall never does. Doors and passages get none by themselves.
  Curtains are a piece: change or delete them with F or Edit furniture; add a pair to any opening from the library.

**R — Room**
- Click inside a closed room. A box opens: **Room name**, **Kind** (guessed from the name, §8), **Printed size** (what
  the sheet prints, e.g. `12'-0" × 14'-2"`; leave it empty if none — the tool never fills it for you), **Floor level**,
  **Ramp** (tick it, type the far end's level, pick the direction). **Save**, or **Remove** to take the name off.
  **Esc** closes the box without saving, wherever you are in it (the name, a level, the Ramp tick box, the Kind list).
- **A room that has a name already:** click ON its name and the box opens with that name to change. Clicked elsewhere in
  the room, the box opens empty and **Save** puts a second name in that room — that is how a flat's "Type A" name goes
  in (below, "Flats in a drawing"); to rename the room itself, click its name (or V, click the name, type on the right).
- **Clicked where no closed room is?** R looks at the walls round your click. If one wall end there stops a little short,
  R joins it (one Ctrl+Z) and opens the box. Otherwise it says which end keeps the room open, how far short and where,
  and rings it ("Not closed yet: the wall end 2'-3" up-left of your click (ringed) stops 0'-7" short of the wall ahead —
  drag its end onto that wall"), or "a wall is missing. Draw it with W."
- A printed size passes when either the room's main rectangle (the biggest rectangle that fits inside it, door nooks left
  out) or its whole outline matches it.

**C — Column**
- Click = a standard column; drag = a column of the size you drag. Pick one by clicking anywhere on it.
- A picked column shows eight dots. Drag a **side** to move that side alone, in whole inches; drag a **corner** to move
  that corner alone (a tapered or wedge-shaped column; its sides snap back to square within 3°). Both stick to walls and
  corners; **Shift** = no sticking. **Width / Depth** on the right type an exact size (on a tapered column: its outer
  size, stretched about its middle).
- The 3D builds the column from its four corners; rooms round a tapered column and the Building view still use its
  outer rectangle.

**F — Furniture**
- Click a piece, drag it, click where it should go; the same rules as Edit furniture in 3D (§3). **R** turns it, **Del**
  deletes (also the piece in your hand), the arrow keys move it one 3-inch square.
- A click picks the piece drawn on top (a wall cabinet over its counter, cushions over the sofa); a thin print or a wall
  TV is picked within a few pixels of its line.
- **A wall piece** (TV, picture, AC, clock, mirror) shows **Height from floor (m)** on the right: type its bottom edge's
  height (1-inch steps; refused over a window or in a doorway). On the plan dragging moves it along the wall.
- **Outside a wall:** a piece of the library's **Outside** group (a sunshade, a canopy, a sign…) can go on the
  outer side of a wall: pick it, click just outside the wall on the plan (within about a metre of it). Over a window it
  fits itself to the window, as in 3D (§3). Drag it along the outside, or round a corner onto the next wall; drag it into a
  room and it is an ordinary wall piece of that room again.
- **Curtains** show as a thin strip along their opening: drag it along its wall, drag an end dot to widen one side, type
  **W** on the right for an exact width (both sides move), **Del** removes it.
- **Add a piece** (on the right while F is on) is the library (§3): search or open a group, click a piece, click the plan
  (curtains: beside an opening). **Reset to preset** lays one room out automatically again; **Reset all** every room.

### The right-hand panel

- **Steps** — the checklist for the drawing open now ("The Steps" above).
- **Selection** — the details of what you picked, to type exact values: a *corner* (position); a *wall* (Wall / Low wall
  / Kerb / Zone line, width, height, **Made of** for a low wall — Solid (plaster), Glass, Metal railing, Steel grille,
  Timber railing, Timber fence, Chain-link fence — and for a solid one **Cornice under the cap**, **Stands alone** — a
  screen or decoration wall not meant to close a room, **Outside** — what the outside of that wall is clad in, on every
  floor this plan stands on, or *Same as the building* (the 3D view's Finishes; §2 The building's outside) — length, copy,
  delete); an *opening* (Door / Sliding door / Window / Passage, width, height, sill, distance from each corner; for a door,
  hinge and swing; a window's or sliding door's **Frame** colour); a *column* (width, depth, delete); a *room name* (name, kind, **Flat**, printed size,
  floor level, ramp); a *piece* (position, turn, size, height from floor, reset).
  - **Several things picked:** the walls' type, height, width, the low walls' Made of and Cornice (pick a whole
    balcony's edge — a curved one's many short pieces too — and make it glass in one go), Stands alone, Outside ("mixed"
    when they differ); the openings' kind, width, height, sill. A
    box shows the value they share; "mixed" means they differ — type a value and every one takes it (one Ctrl+Z). An
    opening the new size does not fit stays as it was, and a note says how many. **Delete them all** removes them.
- **Issues** — problems in the drawing: red breaks the 3D, amber is worth a look, grey is cosmetic. **Join walls** fixes
  every overlap and crossing in one click. Click an issue: the plan zooms to it with its fixes.
  - **A big floor** (over 200 walls — an architect's whole storey, a university building's 1 800 walls): five or more of
    one kind are ONE row with the count — "34 loose wall ends", "250 rooms with no name", "… walls crossing", "… room
    names outside a room" — and their marks stay off the plan, so it reads as a drawing. Each row has its fix for all of
    them, one Ctrl+Z: **Keep them all — they stand alone** (loose ends: the walls are meant to end there, nothing moves),
    **Name them "VÅNING 3 · 1" to "VÅNING 3 · 250"** (rooms the file gives no name: the floor's name and a number, west to
    east; rename any one with R), **Join all that touch** (crossings; offered only when it leaves fewer). Names outside a
    room have no fix for all: which room is whose is your call. Click a row to open it: its rows are listed under it,
    each with its own fixes, and its marks show on the plan — one badge per room, with its count. Click it again to fold
    it and take its marks off. The rows listed one by one are numbered first.

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
| A room name outside any room | (by hand: close the room round it) |
| Two names in one room ("Bath shares a room with Hall") | **Bath → room below · 5.8 m²** / **Hall → room below · 5.8 m²** — which of the two is the room next door (through its door when it has one); the other keeps this room. Neither is marked as the first choice: the file cannot tell. No unnamed room beside it: **Draw a zone line** — the plan goes there with the Wall tool on Zone line; draw it where the two rooms meet, from a wall or a line's end to the next |
| Walls standing loose inside a room | Join with a zone line |

- **Check these** — after Auto-trace, what it was unsure of (next section).

### Auto-trace and Check these

Auto-trace draws the flats for you from the plan picture; Check these lists what it was unsure of, each with its
one-click fixes. It is made for flats: it does not understand ground floors, basements or rooftops (it says so when a
sheet prints PARKING, DRIVEWAY or RAMP and no bedroom), and it says loudly when it had to guess the scale.

**Running it.** Press **Auto-trace** and wait for "Point at a flat". Move the pointer over the plan: the flat a click
would take glows (its closed rooms and the open floor round them). Then:
- **Click inside one flat** — that flat alone, whichever of its rooms you click; never a room of the flat next door.
- **Whole floor** (in the same box) — every flat on the sheet and the shared lobby, stair and lifts, in one draft.
  - There are as many flats as flat labels printed on the plan ("Unit A: 1375 Sft", "TYPE-A ±2736 SFT", "UNIT-B"); a
    key plan's tiny "TYPE: A" and a title block's list do not count, and a legend line and the plan's label for the same
    type are one flat. One label on the whole sheet = one flat. With no label read, each living / dining / kitchen with a
    bedroom is a flat; only where more kitchens than labels were read does an extra kitchen start one.
  - A flat ends at its front door: the lobby, corridor, lifts and stair belong to no flat. A room whose door was not found
    still goes into the flat it shares most walls with.
  - Each flat comes out tinted and named by its printed type (**Type A**, **Unit A**, "Unit A & B" when the sheet says
    so), else **Flat 1, Flat 2…** from west to east.
  - It takes about half a minute to read a sheet before "Point at a flat" shows (the BTI 2nd floor: 31 s), then a few
    seconds for the floor.
- **Cancel** in the box stops it.
- The trace replaces the walls and names; the drawing keeps its own name, project, floor, true north, site and outside
  shape.

**Flats in a drawing.** Once rooms are named, the Studio finds the flats by itself: rooms joined by a door, passage,
sliding door, zone line or a wall lower than 1.2 m are one flat (a window joins nothing); lobbies, stairs, lifts, shafts,
gym / community / guard rooms and outdoor areas belong to no flat; a group counts as a flat when it has a bedroom and one
more room. Each flat is tinted with its name written once above it.
- **To use the sheet's name:** R, click inside one of its rooms, type **Type A ±2736 sft**, Save — it names the flat, not
  the room; V on it shows the check ("Names the flat Type A: its 17 rooms add up to 1857 sft, printed ±2736 sft").
  Click inside the room away from its name, so the box opens empty (§5 R). After **Whole floor** too: Auto-trace has put
  every room in its flat (V on a room says **Flat (from Auto-trace)**; once you pick another it says **Flat (moved by
  hand)**), and the name renames that flat.
- **How many flats:** Whole floor counts the flats the sheet prints — its flat labels and area figures, one flat per area
  in a title that lists several ("2703 SFT & 674 SFT" on the BTI 2nd floor: its big flat and the two small ones, three
  flats), more where more kitchens than labels are read.
- **Two flats came out as one** (a sheet whose labels were not read): V, click a room name of the second flat, **Flat →
  New flat (Flat 2)**; then click each of its other rooms' names and pick **Flat 2**; then name it with R as above. The floor list shows the flats under the drawing's name.
- **A room in the wrong flat:** V, click the room's name, pick the right one in **Flat**; **Not in a flat** takes it out;
  **New flat** starts another with just that room; **Back to: by its doors** undoes a hand pick. An untinted room inside
  a flat usually has no door (add it with O — the 3D needs it too) or none at all (pick its flat by hand).

**The marks on the plan**, so the sheet reads as a drawing, not a list of errors:
- **Red** (breaks the 3D: a room left open, a loose wall end, a gap) — a numbered badge.
- **Amber** (worth a look) — a small dot; its number shows when the mouse is near or its row is picked. Click to open it.
- **Grey** (cosmetic) — not drawn; the row is in the list.
- Rows close together on the screen share one outlined badge with their count, **×7** (zoomed out a whole floor has a
  few of these instead of dozens; zoom in and they come apart). The mouse on it lights its rows in the list (pale blue,
  the first scrolled into view); click it and they stay lit until Esc, its first row opens and **Also here** in its box lists the
  others. The row picked in the list has its badge in blue. A badge or dot never sits on a room name or a flat's name: it
  goes just beside it.

**The list.** Rows are grouped by room: a room with two rows or more is one line (its name, the count, its first row in
grey) — click it to show or fold its rows; rows in no closed room go under the printed name they are about, the rest
under **Elsewhere** — more than 12 of those come in parts, one per kind of row (**Elsewhere · Outline not closed**,
**Elsewhere · Not sure about this**, **Elsewhere · Opening kind is a guess**…; on the BTI 3rd floor sheet its 16 rows
are 4 + 12). Every row is listed: the heading counts them all. Click in the list and **↑ / ↓** pick the row
above or below (its mark turns blue), **Enter** goes to it on the plan. The same thing is never asked twice: loose wall
ends are listed only under Issues, a box Auto-trace guessed (an AOD, a planter) is one row. Every fix is one Ctrl+Z.

**The room count** (the first line): "5 of the 8 room names read on the sheet are closed and named — missing: Bed 4,
Bed 2, Ver", then what the closed rooms add up to against the printed flat area — one line per flat on a whole floor,
in orange when the closed rooms are under 70 % of the printed area. It counts only the names Auto-trace could read. The
flat's area comes from its "TYPE-A ±2736 SFT" or the sheet's title block; a figure bigger than the whole sheet is a
misread and never used, and with none read the top bar's Area box shows the closed rooms' total — type the right figure.

**The kinds of row and their buttons:**
- **A room that is missing** ("Veranda 1 is open — no closed room around its name", "Ver and Bed 2 share one space —
  split here?"): **Name it …** (the unnamed room beside the printed name takes it), **Close it — zone line / railing /
  carry N walls on** (draws the one missing line along the sheet's lines, previewed faintly, picking the closing nearest
  the printed size), or **Show me** (the plan goes there with the Wall tool picked; draw the open sides, then Name it).
- **Unnamed space (5.8 m²):** **Name it** (type the name you read on the sheet, Enter), or **Join it to Dining** (takes
  out the thin wall between; with two rooms of one name beside it, each button says which side).
- **A piece Auto-trace guessed** ("Drew a 2'-10" door in the gap … A door, or open?", "Traced as a 1.1 m low wall …
  Check"): **Make it a wall / a low wall / a zone line**, **Make it open (no door) / Make it a door**, **Take it out**
  (the room opens again), or **Looks right**.
- **A size row** ("Kitchen: drawn 6'-5" × 12'-2", printed 8'-5" × 12'-2""): neither the main rectangle nor the whole
  outline is within 2" of the print. A size it could not read asks you to type it in the room's **Printed size**.
- **"Table says Suite 2 is 14'-0" × 11'-6" — no room on the plan carries that name"**: name that room with R and type
  the size. **"Its number was not read: named Bed 3 from the size table — check".**

**What Auto-trace draws that is not a wall.** Only where the sheet shows why, and only when the room it closes then
matches its printed size (within 6": no row; off by more than 1 ft: not drawn, the room stays open with its row; in
between, or no size read: drawn, with a row):
- **Glass front** — two or three thin lines side by side, one thin line carrying a wall's line on to the next wall, or a
  window drawn as a light frame band: a glass wall, floor to top.
- **Railing** — one thin line across a veranda's open side: a 1.1 m low wall (0.45 m beside planter green), kept on the
  drawn line. A veranda drawn as a box of thin lines closes on its three railing sides.
- **A door in a gap** — a wall stopping a door's width (2–6 ft) short of the next with nothing drawn between: a door
  (wider than 3'-7": a passage).
- **Zone line** — only between open-plan spaces (living, dining, foyer, an open kitchen), only where the printed size was
  read, or on a dashed line the sheet draws between two names in one space.
- **Walls that stop short** — carried on to the wall ahead (up to 4 ft) when the sheet shows the same thing between (the
  wall's band, a window's lines, a railing), when the gap is under 1 ft, or through a column drawn as a filled box;
  corners left open under 1'-8" are joined.
- **To change one:** V, click it. A railing is a Low wall (pick Wall, type a height, or Del); a glass front is a wall
  carrying one window as long as the wall with sill 0 (change its kind, sill or height, or Del it).

**What Auto-trace reads.** Every letter size on the sheet (names, sizes, the title's big figures); names on floor tiles
or speckled fills; labels printed sideways; white print on a dark ground; names touching a basin or a door arc; a name
read in pieces along one line ("DINING" + "AMILY" + "f LOUNGE"). Size tables beside the plan ("SUITE 1 13'-4" × 14'-0"",
numbered legends "01. LIVING …") give each room its size, and their words never count as rooms. Two names in one closed
space: the larger printed room names it. A reading names a room only when its words are the sheet's room words (one
letter off at most): a garbled reading leaves "Space N" with its row. Guessed names ("Toilet 3" from a drawn WC) are
numbered west to east and never take a printed room's number.

**What it reads as walls:** solid black walls; hollow walls (two thin lines with paper between, when most of the sheet's
walls are drawn so); grey bands between two thin lines; white or cream walls between coloured floors (a second pass when
fewer than half the names closed); a plan turned on its sheet (2° or more: traced straight, put back as drawn); a plan
on a dark or coloured page. A dashed plot line round the site is never a wall.

**What it leaves out as furniture:** a dark block is a column only when a wall runs out of it; a closed piece of drawing
touching no wall and under about 3 × 3 m (bed, sofa, table, WC), hatch (thin lines close together) and a narrow strip
under 75 cm deep (wardrobe, counter) are never walls or rooms; fixture words (WASHING MACHINE, FRIDGE, a beam note) are
never names. Your picture is never changed.

**Still not read well** — fix these by hand: very small print (6 px letters), grey names on grey floors, white names on
speckled granite, names touching furniture on both sides; a whole-floor brochure page in 5–7 px print (drop the
single-flat page instead when there is one); walls with furniture drawn against both sides (draw them with W); striped
bed covers or a dark page's streaks that come out as short loose walls (V, Del).

**Big drawings** (a whole floor of five or six flats, 1 000 walls and 700 rows or more): the rows show at once and their
buttons fill in a few at a time — the row you click first, then what is in view ("Working out the rows' fixes — 320
rows left…"). The page stays usable; Export saves at once, rows still being worked out marked `"answersPending": true`.

**The list stays with its drawing.** In a project each drawing keeps its own Check these rows: open another floor's
drawing (Draw, Open) and come back with **Open**, or reload the page, and the rows are there as you left them — the
ones you answered gone, the rest waiting. They go with the project when it is saved online. Delete the drawing and its
rows go with it. Outside a project the open drawing keeps its rows as before; **⋯ → Export** keeps them in a file.

**Your answers are kept as a record.** Every row is kept with the open drawing (and in the Export file) with its **picture
box** — the piece of the sheet an AI helper would be shown — and its buttons. Every button you click (Looks right and
Show me too) is added to a list that is never changed afterwards: the sheet, the row, the button, the time. **⋯ →
Export answers** saves it. A name typed with Name it is not kept yet.

**Settings under Check these:** **Wall tracks** (the tracing method; leave it on); **AI helper (optional)** (a Gemini
key, used only to re-read names the tool could not read; the sheet then goes to Google); **Local AI** (below).

**Ask AI** (on each row; **Ask AI for all** beside the heading) asks the free AI on this PC which of the row's buttons
is right, showing it the piece of sheet round the row with a red ring. One row at a time, 2–3 seconds each (about 10 s
for the first).
- If it picks a fix, the fix is done as your click would do it (**Undo** on the row, or Ctrl+Z). A fix that takes out a
  door, window or passage is only suggested, with **Apply** for you. Looks right or Show me does nothing: the AI never
  takes a row off the list. "AI was not sure" = no answer.
- It is not good yet (right 8 times, wrong 14 on rows that change the plan: it does not see door swings), so **Ask AI
  for all** skips every row whose answer would change the plan and only gives its opinion on the rest.
- Its answers go into the same record, marked `"by": "ai"` with the model and its reason.

**Local AI (this PC, free)** — the settings for Ask AI: **Server** (`http://localhost:11434`), **Model**
(`qwen2.5vl:7b`) and **Test** ("found qwen2.5vl:7b", or why not: server not running, blocked by CORS, model not pulled).
It is Ollama with an open-licence model on this PC's graphics card: no account, no key, no internet, no cost. A server
that is not this PC is refused unless you tick **Use it anyway**; a paid cloud model ("-cloud") always.
- **Start it** after each restart: double-click `E:\dev\tools\ollama\start-ollama.cmd` and leave its black window open.
- **The model** (6 GB, already on this PC): with the server running, `E:\dev\tools\ollama\ollama.exe pull qwen2.5vl:7b`.

### Accounts — signing in, saving online, members, links (⋯ → Sign in)

Without signing in, your work is kept in this browser only (§9). Signed in, it is also kept online for your company, by
itself as you work, with the plan pictures. Turning accounts on (once, by the founder):
[SETUP_ACCOUNTS.md](SETUP_ACCOUNTS.md).

**Signing in** (no password): **⋯ → Sign in**, type your email, **Send me a link** ("Check your email"). Open the email
on the same computer, in the same browser, and click the link: the Studio opens with your email in the ⋯ menu. If an
owner invited that email you are in the company at once; if not, "Not saved: not in a company yet" — ask an owner to
invite you, then F5.

**Saving** happens 2 seconds after you stop changing things: the project open in the Studio (all its floors and
drawings) or, with no project, the drawing you are on. Each plan picture goes once to your company's private folder,
so a colleague who opens the project gets it under the walls; buyers never get it. The word after the drawing's name
(click it for the card):

| Word | Means |
|---|---|
| **Saving…** | Your latest change is on its way |
| **Saved · just now** (or **· 4 min ago**) | The online copy is exactly what you see |
| **Offline · will retry** | No internet; keep working — it saves by itself when the internet is back |
| **Someone else saved** (red) | A colleague (or you, in another tab) saved the same project after you opened it; yours was not saved over theirs. Click it: **Open theirs** or **Keep mine** (theirs stays under Earlier saves). Nothing is lost |
| **Deleted in the cloud** (red) | Someone deleted it meanwhile; **Save as new** keeps your copy |
| **Not saved: …** (red) | The reason (for example too big: 5 MB at most). Your work is still in this browser |

**The card** (the word, or ⋯ → your email): your email and company (owner or staff), then **Projects**, **Members**,
**Links**, and **Sign out** (saves what is waiting first; your work stays in this browser).
- **Projects** — your company's projects and drawings, last saved first, who saved and when. **Open** (what is open is
  saved first), **Rename**, **Earlier saves** → **Open this save** (that copy, with the picture it had, becomes the newest
  when it saves; later saves stay listed), **Delete** (asks first; hides it for everyone; every save stays, the founder
  can bring it back).
- **Members** — everyone in the company and those invited. Only an owner sees the buttons: **Invite** (their work email,
  **Staff** or **Owner**; Plotline sends no email of its own — **Copy this for them** copies the words telling them to
  sign in with that email; **Take back** cancels an unused invite), **Make owner / Make staff** (a company always keeps
  one owner), **Remove** (asks first; they reach nothing of the company's any more, what they saved stays; nobody removes
  themself).
- **Links** — every buyer link made from what is open, by the Studio's Share link or by **Share** in the 3D view of one of
  its floors (once it has saved to the cloud): which flat and floor, when, by whom, how often buyers opened it
  (your company's own opens not counted), how many notes and choices came back, whether it is off. **Copy link**;
  **Turn off** (asks first; the link stops for good, what buyers wrote stays in the Change list; to share again, make a
  new link).

Two people on **different** projects never notice each other; on the **same** project the second save asks ("Someone
else saved").

### Site — where the building stands (⋯ → Site)

The panel opens top right and a blue north arrow appears in the middle of the plan.

1. **Find the place:** type an address ("Road 11, Banani") and **Find** (or Enter), or paste the plot's position
   "23.7903, 90.4077" (Google Maps: right-click the plot, click the numbers). A map shows round it; the mouse wheel or
   **+ / −** zoom (five steps), dragging slides it.
2. **Click your plot.** The buildings and roads within 250 m and ten years of wind come in (a few seconds; up to half a
   minute when the map server is busy). Grey shapes = buildings (dashed = height guessed), dark lines = roads, blue = your
   drawing, the blue dot = the plot. A building the map has on your own spot is left out of the 3D and drawn dotted.
   Clicking again moves the plot (it asks first: your typed heights and deletions are lost).
3. **Set true north:** drag the blue arrow on the plan until it points like the north arrow printed on the sheet (drag
   its round dot to move it over that arrow first), or type the degrees in **True north** (0 = up the page, 90 = right).
   The drawing on the map turns with it.
4. **Fix the neighbours:** click a building for its height and where that comes from; type the right **Height** (m) or
   **Delete block**. Click a road: **Delete road**.

Heights come from the map's own height, else its floors × 3 m, else a guess of 3 floors = 9 m (most Dhaka buildings
have neither: in Banani 396 of 407). A height that does not fit its floor count is taken as a typo. **Fetch again** asks
the map once more (your edits are lost); **Remove site** takes it all away (the made-up street comes back). The site is
saved with the drawing — one site for every drawing of a project — so Preview 3D, the Building view and buyer links show
it without asking the map again. Map and buildings © OpenStreetMap contributors; the wind is Open-Meteo's.

### Bring in the architect's file

Instead of a picture to trace, drop the architect's own file on the Studio (or ⋯ → **Import…** / **Choose
files…**). Its walls ARE the drawing, so there is no picture behind it (the status bar says "no picture lined up"); a
picture can still be dropped later to see the sheet behind. Every format and how it was tested: [FORMATS.md](FORMATS.md).
Dropped (or imported) onto a drawing, a file asks first: "Replace the drawing on screen with *file*? Undo brings it
back." — **Replace**, and one **Ctrl+Z** (or ↶ Undo) gives the drawing that was there back, on its picture as before and
with its Check these rows; **Cancel** keeps it. The same for a Plotline file (.json). A whole building (an IFC of several
storeys) makes a project of its own: a drawing open in a project stays in its project; one open in no project is
replaced, and it says so before ("Make a project of *file*'s 5 floors? The drawing on screen is in no project…").
To see each kind without a file of your own: **Try a sample ▾** in the empty Studio ("The door" above).

| File | What happens |
|---|---|
| **IFC** `.ifc`, `.ifczip` (Revit, ArchiCAD, …: a building model with its walls, doors and rooms) | One storey opens as the drawing (on an empty Studio, a project of one floor: §6). Several make a whole **project** in one go — basements, ground, floors, rooftop — each storey its own drawing, the outside shape saved once for the building; the first floor above ground opens (a house's: its attic — click **Open** beside **Ground floor** in the list for the main rooms). Walls the file leaves touching are joined, two of its rooms in one open space are split by flush zone lines where the file draws their boundary (two names the file gives one outline — a bath and its hall — stay a row in Issues that asks which room is which, below), a room the walls leave open (a balcony edged only by a railing, a roof terrace, a stair open to the floor above) is closed by flush zone lines along the file's own outline of it — the railing itself shows in the outside shape — and a space that only holds other rooms (a gross area) gives no room name — "What was read from the file" says how many of each. A European file's room words are understood (Zimmer / Slaapkamer / Sovrum a bedroom, Bad / Badkamer a bath, Küche / Keuken a kitchen, Wohnzimmer / Wohnküche a living room, Terrasse / Balkon a balcony; Treppenhaus, Aufzug, Trappenhuis, Hiss, Escalier, Ascensore and the corridor Gang are the shared core), so the flats of a whole floor are found — a word Plotline does not know stays "other": give the room its kind with V. A room the file gives no name of its own takes its zone's name, else its floor's name and a number ("Level 2 · 3"); a floor where the file names no rooms at all keeps "Space N", said once in the notes, and on a big floor Issues offers **Name them …** in one click. **The building comes dressed** (below, "What an IFC is made of"): its outer walls in brick, render, timber, zinc, concrete or stone as its materials name them, its railings as glass or metal, its roof's kind, pitch and covering, its window frames' colour; the street is its ground floor (Ground / EG / RDC, else the storey at the file's 0, else the lowest that holds rooms or outer walls — never one named a basement), what is below it a basement |
| **DXF** `.dxf`, **SVG** `.svg` (a drawing made of lines) | One floor's walls, openings and room names read from the file, to check and finish as usual (on an empty Studio, a project of one floor: §6). Names in any script come through as written (a Bangla "শয়ন কক্ষ" too, even from a file older than AutoCAD 2007). A DXF's walls may be line pairs, polylines, hatches or multilines, a floor drawn as one outline with its partitions as single lines, or each room as its outline (a partition drawn as one line still splits its room); its doors and windows swings, blocks, glass lines, or a plain line or narrow rectangle on a door / window layer (on a layer of doors and windows, a plain line is a window); a door, window or sliding-door block standing in no wall (a front all of glass) is a wall of that opening; an SVG's groups are its layers ("Walls", "A-WALL"); an SVG with no named groups (a CAD print saved as SVG) has its lines sorted by pen like a PDF — the heaviest pen and grey wall fills are the walls. An SVG has no scale: the printed dimensions give it — check with S |
| **DWG** `.dwg` (AutoCAD's own) | Once DWG is turned on ([SETUP_FORMATS.md](SETUP_FORMATS.md)): sent to an online converter, back as a DXF ("converting the DWG to DXF"); 10 a day. Not turned on: refused with how to save it as DXF — AutoCAD: type SAVEAS, pick "AutoCAD DXF" under Files of type; DraftSight: File → Save As → DXF; no CAD program: LibreCAD (free) opens the .dwg, then File → Save As → DXF. Drop the .dxf: nothing a plan needs is lost |
| **PDF** `.pdf` (a brochure, or a print from the drawing program) | One page that is one floor plan opens at once. Several pages (an architect's set, a brochure), a page of several drawings, or an elevation on its own: **What is in this set** lists every drawing by kind (below, "Drop a whole set"); click a drawing's picture there to open it alone. A page whose lines make a clean plan opens as the drawing — a PDF has no layers, so its lines are sorted by pen: the heaviest pen and grey wall fills are the walls ("What was read from the file" names them); the scale printed on the sheet (`1/4" = 1'-0"`, `1:100`) is the scale, else the printed dimensions measured against their lines — check with S; a stair's "UP" / "DN" and a door or window tag ("D-16", "Win-18") never name a room; a page with no scale printed as words (a brochure page whose words are drawn as outlines) opens straight as the plan picture, its lines not read; any other page becomes the **plan picture** for S and Auto-trace. The message offers the other way: **Use it as a picture instead** / **Read its lines instead** |
| **3D model** `.glb` `.gltf` `.obj` `.fbx` `.dae` `.stl` `.3dm` `.3ds` `.kmz` `.wrl` `.ply` | The building's **outside shape** only (no rooms), attached to the drawing open now, centred on it, its lowest point on the street (on every floor the drawing stands on in a project): the Building view shows it round your flat and the walk sees its facade through the windows. A model far smaller than a building (under 8 m across, or well under the drawing) asks once how big it is — **As it is: 7.8 m** or **78 m across (×10)** … —, the answer kept for the file's name. A material the file made fully see-through (a Collada habit: nothing would show) is drawn solid, and a coloured glass is toned to Plotline's glass (the notes say how many). A model with its pictures (or a `.gltf` with its `.bin`) in other files: drop the whole folder or a `.zip`, or pick the files together |
| **Locked files** `.rvt` `.pln` `.skp` `.max` `.blend` `.dwf` (and `.dwg` while off) | Refused, with the one-click export to ask for: Revit / ArchiCAD → IFC; SketchUp / 3ds Max / Blender → glTF, OBJ or FBX; AutoCAD → DXF |
| A **folder**, a **.zip** or several files | The best file opens (an IFC first, then a 3D model, then a DXF / PDF; an architectural IFC before a structural one); the rest are its pictures and data. Several PDFs and nothing better (an architect's set sent as one PDF a sheet): all their pages in **What is in this set**, in the order of their names. A zip of pictures opens its first picture |

While it reads, a box at the top says what it is doing with a bar for how far ("building the 3D (53 %)", "floor 3 of
7", a DXF's "reading the lines", "finding the walls"); the Studio keeps working (a 64 MB building takes about half a minute; the 35 MB LTU university building 13 s, the
39 MB Nordic office about 10 s), and **Cancel** stops it. A DXF over 15 MB is refused at once with its size ("it is 22.5 MB, and Plotline reads a
DXF of up to 15.0 MB — save only the floor plan from your CAD program (one floor per file) and drop that"), so is one
holding more than 50 000 drawn things, and a binary DXF ("save it as ASCII DXF in your CAD program"). A glass front (curtain wall) that turns a corner is read as
the straight runs of its panels, one glass wall per run; a "column" wider than a wall both ways (over 1.5 m) is no
column and is left to the outside shape — the notes say how many of each. A whole big floor opens in Preview 3D too (the
LTU building's 2nd floor, 285 rooms and 1 644 walls: about half a minute to Enter); on a floor that big the daylight inside
is worked out on a coarser grid, so it is ready in a second instead of never. Afterwards the panel
lists **What was read from the file** — its unit, what was guessed, what it lacked — until **Dismiss**. After a DXF or
an SVG the list ends with its **layers**, each with what Plotline took it as ("Plotline decides: Walls"); a layer it
could not place is named in the notes. Pick another meaning in a layer's box — **Walls**, **Kerbs**, **Zone lines**,
**Doors**, **Windows**, **Columns**, **Room names**, **Dimensions** or **Leave out** — and the file is read again at once;
the choice is kept in this browser for every next file with that layer name (an architect's template uses the same
names every time). **Plotline decides** gives the layer back to Plotline. Layer names it knows by itself: the US / AIA
ones (A-WALL, A-DOOR, A-GLAZ, S-COLS, A-ANNO-TEXT…), plain English, and the German, French, Spanish, Italian and Dutch
words (Wände, MURS, PUERTAS, FINESTRE, KOLOM…). What a block (a door, a window, a symbol) draws on layer 0 belongs to
the layer the block is placed on, as in CAD: a door block placed on A-DOOR counts as doors.

**Read in** (after a DXF, above its layers) says the unit the file was read in — "Plotline decides: millimetres" (the
file's own, or Plotline's guess when the file says none or says one that makes the plan too small or too big). A drawing
that came out the wrong size (a house 3 m across, a flat 700 m across): pick **Millimetres**, **Centimetres**, **Metres**,
**Inches** or **Feet** and the file is read again at once at that size. Not sure of the unit? Click one wall whose real
length you know, pick **A length I know…**, type it (14'-0" or 4.27 m) and **Read again**: the file is read at the size
that makes that wall so. The choice is kept in this browser for that file's name (drop it again tomorrow: same size);
**Plotline decides** gives it back.

**What an IFC is made of.** An IFC names every layer of every wall ("Puuverhous", "SIA_PA_Crépi beige, texturé",
"Dach - Titanzink") and says which walls are outside (IsExternal). Plotline reads those words in eleven languages —
brick / Ziegel / tiili / tegel / baksteen / mursten / ladrillo; render / Putz / crépi / stukko; timber / Holz / puu / trä /
hout; zinc / Zink / Blech / metal; concrete / Beton / betoni; stone / Stein / Kivi / granit; Eternit / fibre cement / Viroc;
glass — and dresses the building with Plotline's own finishes: the outer layer of each outer wall is that wall's outside
finish, the commonest the whole building's (a render takes its colour from the file: beige crépi is Sand render); the
roof takes the covering its words say (tiles, zinc, slate, shingles, gravel, a green roof, terrace tiles) and its kind
from the file (gable, hip, shed, flat; a freeform roof keeps the file's own shape), its pitch from its slopes; a railing
(IfcRailing) makes the low wall under it glass, metal or timber (**Made of**), or becomes a low wall of its own along a
balcony's edge; a glass front keeps the file's mullion spacing and frame colour; a window's frame takes its colour from
its names (white, anthracite / RAL 7016, black, timber); a gable wall stops at its eaves (the gable is in the outside
shape). The outside shape wears the same pictures as Plotline's own walls, and **Finishes** in the 3D view shows each as
chosen — change the whole building there (it changes the shape's walls too), or one wall, one floor, the frames, the
roof. "What was read from the file" says what each name became ("Timber slats ("Puuverhous"); Fair-faced concrete
("Betoniverhous") — the building's own: Timber slats"). A name Plotline does not know keeps the plaster and is listed
("3 materials not known: "BEKLEIDUNG", …"). **Materials** (under the notes) lists every outer wall's material with what
it became — "Plotline decides: Timber slats" — and how many walls wear it; pick another finish in its box and the file is
read again at once (the project it made is made again in its place); the choice is kept in this browser for every next
file with that material name. **Plotline decides** gives it back. What an architect should export:
[FORMATS.md](FORMATS.md) §2.

**Outside shape** (in the panel while the drawing has one): its name and triangle count, **Offset x / y (m)** (slide it
until its walls sit on yours), **Turn (deg)**, **Floor height (m)** (how high this drawing's floor is inside it), each one
Ctrl+Z; **Remove outside shape**. In a project every drawing shares the building's shape. The model is kept in this
browser only (an exported drawing file names it but does not hold it); Lite skips a shape over 500 000 triangles and
says so. An IFC whose windows came with solid glass (no see-through colour on any window, as some exports give): its
windows are left out of the shape and the Building view and the windows round your flat draw real glass in your flats'
window openings instead, with the rooms behind it and their lights at night. Windows with see-through glass stay as
the file drew them. A shape read before this change keeps its windows: drop the file again. In the 3D view's
**Dollhouse** the shape stops at the floor's ceiling (the top of its lowest full-height walls), so its slab above — an
IFC house's upper floor — never hides the rooms; Walk and the Building view show it whole.

### Drop a whole set

An architect's set is a PDF of 20 to 80 pages (or one PDF a sheet): a site plan, a floor plan for every level, the four
elevations, sections, schedules, details and a cover page. Drop it on the Studio — the whole PDF, several PDFs, or their
folder — and **What is in this set** opens over the sheet instead of tracing anything. Every page is read for what it is,
by the words printed under each drawing ("2ND FLOOR PLAN", "FRONT ELEVATION (SOUTH)", "CORTE A-A", "PLANTA SEGUNDO NIVEL",
"GRUNDRISS 1. OG", "Level-02, Level-03 & Level-09 Plan", "Typical Floor 2nd, 4th & 6th"), else by the sheet's number in
its title block (A-201 and A2.0 are elevations, M-501 a detail, by the first digit), else by the drawing itself (door
swings make a plan, a ruled table a schedule, a page of words a title page). A page with several drawings (two floor plans
side by side, five kitchen elevations) is split into them, each its own row with its own picture and scale. Reading takes
a few seconds (a 25-page set about 4 s); the line "Reading page 7 of 25…" counts.

**A folder of DXF or SVG files is a set too** — drop the folder, its .zip, or the files picked together (PDFs may be among
them). Each file is one drawing, read as a file dropped alone is (your layer and unit choices hold), its kind and floor from
the biggest title written in it ("Internal walls, ground floor", "East Elevation") or from its name, with the short names
architects give files: `GF` ground, `1F` / `2F` floor 1 / 2, `RF` roof, `TYP` typical, `B1` basement, `E-1` an elevation,
`S-2` a section, a sheet number like `A-201`. Nothing said: a plan when its lines make two or more rooms, else Other. Its
picture in the list is drawn from its lines; a kept elevation keeps that picture. A drawing saved both ways in the folder
("Ground.dxf" and "Ground.pdf") is read once, from the DXF; a DWG beside its DXF is left out. Of two plans of one floor
(the external walls only, and the whole floor) the one with more rooms becomes the floor's drawing. The files of one CAD
model share its coordinates, so the floors stand over each other exactly as drawn. One DXF or SVG dropped alone opens as
before.

The list, grouped by kind — each row: a tick, the drawing's picture, its title as printed with "Page 7 · A1.3 · 1 : 48"
under it, its kind, and its floors (a plan), side (an elevation) or mark (a section):
- **Plans** — each ticked one becomes the drawing of its floors. The floors come from the title: G (ground), B1, 2, 2–8,
  Roof. A set with no ground-floor plan counts its 1st floor as the ground floor (American and Chilean sets do; a line
  under Plans says so). Of two plans for one floor the first is ticked; a reflected ceiling, electrical, plumbing or
  foundation plan never is. A typical floor with no numbers goes on every floor left up to the highest one named — or up
  to the top floor the set itself names when a page says how tall the building is ("2B+G+12", "B+G+M+12", "G+9",
  "10 Storied", "Floors: 09": a line under Plans says which page said it; a storey count includes the ground, so
  "10 Storied" is the ground and 9 floors). "TYPICAL FLOOR PLAN 3RD–8TH" and the Spanish "PLANTA TIPO" are read too. A
  house of a ground floor and a "2ND FLOOR" (no 1st) counts its ground as the 1st: its upper floor is floor 1. A plan
  whose title names no floor is left out when the others name theirs; when none does, the first goes on the ground and
  you type the others' floors (a set whose words are drawn as lines).
- **Elevations, Sections, Site, Schedules, Interior elevations** — ticked: kept with the project as pictures.
- **Details, Title pages and notes, Other pages** (a brochure's photos, its specifications) — left out unless ticked.

**Change anything with one click:** the kind in its box (Plan, Elevation, Section, Site plan, Schedule, Interior elevation,
Detail, Title & notes, Other), the floors in theirs (`G`, `B1`, `2-8`, `3, 5, 7`, `Roof` — red when it is not
floors), the tick. What you change is remembered in this browser by the drawing's title: the next set from the same
architect, printing the same titles, comes in as you set it ("as you set it" under the row). **Click a drawing's picture**
to open that one drawing alone, as before (its lines when they make a plan, else its picture to trace). **Esc**, **×** or
**Cancel** closes the list.

**Build the project** (the bottom line says what it will make: "3 drawings on G, 1, Roof · 20 kept · 10 left out"): a new
project named after the file, its floors filled in from the floors read — basements, ground, floors, rooftop — each ticked
plan the drawing of its floors (named Floor plan A, Ground floor, Rooftop… as always), read from its own lines when they
make a plan, else its picture to trace, already scaled when the sheet's scale is known (printed under the drawing, or
three of its dimensions agree). The border, the title block and a notes column beside the drawing are left out of what is
read, and so are the sheet's own symbols: the elevation and section markers round the plan (a circle with its number and
its triangle), grid bubbles, door and window tags, north arrows, the stair's UP / DN arrow and every note's arrow, and the
zigzag break line where the plan cuts through a stair. A door drawn open at 45° comes in as a door, hinged where it is
drawn. **The floors stand over each other:** the lowest drawn floor is where the building stands, and every other floor
read at a known scale is put on the floor it shares the most walls with (outer walls, the stair and lift shafts,
columns) — the message says how many were stacked. A floor that is a picture to trace is lined up the same way, so what
you trace on it lands over the floor below. A floor that shares too little with the others (a roof plan of slopes, a
brochure page with no scale) stays where its own drawing puts it. The first drawing opens and the project's column stays on
the right, each floor saying which page its drawing came from ("from page 7 · 2ND FLOOR PLAN · 1 : 48"); under the floors,
**Kept from the drawing set** lists the kept drawings by kind — Site, Elevations, Sections, Schedules, Interior elevations —
each with its count (a group of more than four starts folded: click its name): click one ("South — FRONT ELEVATION
(SOUTH)") to see it big (× or Esc closes). Nothing is traced on them; the sections and elevations give the
building its heights (below); the windows from the elevations are the next stage. Their pictures are kept with the project's other pictures (in
this browser, and online for your company when signed in).

**A floor drawn in parts joins:** two drawings on one page for the same floor whose titles differ only by the part
("GROUND FLOOR PLAN (LEFT PART)" / "(RIGHT PART)", "PART A" / "PART B") are one drawing, as two halves under one title
already were; two titled apart ("Ground Floor" and "Ground Floor – Enhanced Accessible") stay two ways to build it. A
brochure that prints a page a flat for the same floors ("TYPE-A", "TYPE-B" … each "LEVEL 1 to 11") asks in one row at the
top of Plans: tick it to put those flats **side by side on one floor drawing** (each named by its page; their own lines when
every one makes a plan, else one picture of them all to trace) — nothing on the pages says where each flat stands, so you
move each into place in the Studio; left unticked, only the first flat goes on those floors, as before.

**With a project open,** Build the project asks first: "Add the set's floors (G, 1, 2) to the project open now? Or make
a new project" — **Add to this project**, **New project** or **Cancel** (Esc). Added, the set's floors stack on the
project's own drawn floors, and its shape grows to hold them (more floors, a rooftop). A floor that already has a drawing
is asked about once more, naming the floors: **Replace** puts the set's drawing there (the old one stays in the project,
on no floor, under Floor plans); Cancel keeps yours (the set's drawing for that floor then waits on no floor). A drawing
open in no project is replaced only after a yes. Every build's message has **Undo**: the projects as they were, the
drawing you had open opened again, the build's pictures gone.

**How tall each storey is — read from the sections and elevations.** Under every section and elevation in the list, a
line of fields shows the heights its level marks print — the lines with words beside them ("1ST FLOOR (FINISH) +0'-0"",
"CEILING (T.O. PLATE) +19'-0"", "ROOF RIDGE +29'-2"", "N.P.T +2.34", "F.F.L. +3.05", "ROOF", "PARAPET"): **Floor to
floor** (one number when every storey is alike, else by floor: "G 4.50, 1–9 3.05"), the top floor's **Ceiling** and the
**Slab** when a drawing prints them, and the roof — **Flat** with its **Roof level** and **Parapet**, or **Pitched** (a gable
at each end) or **Hipped** (sloped at the ends too) with its **Eave** and **Ridge**. Gable or hip is read from the
elevations' outline of the roof: a long side whose ridge runs its whole length is a gable's, one whose slopes stop short of
the ends a hip's. Levels are shown as the drawing prints them (+6.10 m over the ground floor), heights in metres.
A mark with no number printed is measured on the drawing at its printed scale (or from a dimension printed between two
level lines). Click any field and type over it — metres, or feet and inches with their marks (`10'-0"`, `+20'-0"`);
red when it is no length; the roof's kind in its box. What you type is remembered by the drawing's title, like a kind. A
section or elevation with no marks says "No level marks on it" — **Type its heights** opens its fields.

Under the list, **Heights — how tall each storey is built** says what the project will be built to: the sections first,
the elevations confirming ("Floor to floor 3.05 m · top floor's ceiling +5.79 · slab 0.15 m (not printed: as usual) · a
pitched roof, eave +6.10, ridge +8.89. From SECTION LOOKING NORTH and 6 more"). Where two drawings differ by more than
5 cm it asks, one row each: "Floor 2: the drawings differ — CORTE A-A says +4.68 · CORTE B-B says +4.72 — which?" (the
first is used until you pick); a number you typed is never questioned. A set whose sections and elevations print no
levels (the Dhaka brochures, a set of plans only) says so, and every storey stays 3.20 m floor to floor, as before.

**Build the project** then builds every storey to those heights: each floor at its own level, its walls up to the slab
under the next floor (the top floor's to its ceiling), the slab as thick as printed (0.15 m when no drawing says), a flat
roof's parapet as high as printed (1.10 m when none is), a pitched roof as two slopes from the eave up to the ridge along
the building's long side with a gable at each end (a hipped roof slopes at the ends too). While the top floor is still a
picture to trace, the roof stands over the highest floor that has walls, at its printed height. A floor the drawings do not show takes the storey under it (a
typical floor); a building taller than its section keeps the section's top storey under the roof. Walking a flat — and
its Dollhouse — its ceiling is at its storey's height; the drawing itself keeps its walls as drawn (only a full-height wall
stands its storey: a low wall, a parapet, a planter edge keep theirs). The message after the build says "every storey as
tall as its sections print (7 drawings)". A project with no heights read is drawn exactly as before.

What it reads today, set by set: [SETS_SCOREBOARD.md](SETS_SCOREBOARD.md).

### Give the drawing back: DXF, 3D model, printed plan

From the ⋯ menu, what a developer or their architect asks for:

- **Export as DXF** — a `.dxf` in metres that AutoCAD and every drawing program opens, each part on its own layer:
  **WALLS** (closed outlines; each wall's height rides along as its thickness, so a CAD program shows the walls in 3D),
  **DOORS** (leaf, swing and the two jambs; a wide opening with no door is a block of its two jambs), **WINDOWS**,
  **COLUMNS**, **TEXT** (names and sizes; a raised floor's name sits at that height), **PLOTLINE_ZONES** (a level's flush
  lines), **PLOTLINE_KERBS** (walls of 20 cm or less) and **PLOTLINE_AXES_…** (each wall's centre line, one layer per
  thickness — leave them in the file; a low wall's **Made of** and a wall's outside finish ride in the layer's name,
  `PLOTLINE_AXES_500_LOW_GLASS`, `PLOTLINE_AXES_2540_OUT_BRICK_RED`, so a glass balustrade comes back glass and a brick
  wall brick, the commonest finish the building's own). Dropped back untouched it opens exactly as it was ("Written by Plotline and not
  changed since"). Saved again by a CAD program it is read from its lines and layers ("… walls read from their centre
  lines, exactly as exported"): all 20 built-in flats and levels come back exactly the same, curved ramps and parking
  bays included. A wall moved, made longer or shorter in the CAD program: the walls are read from their outlines instead
  ("Walls were changed in a CAD program since the export") ([FORMATS_SCOREBOARD.md](FORMATS_SCOREBOARD.md)).
- **Export 3D model** — the 3D view opens in a new tab and, once every room has arrived, saves the furnished flat as one
  `.glb` (walls, floors, ceilings, doors, windows, furniture with their pictures; not the street or the sky): about 55 MB
  (Type A 54 MB). Blender, 3ds Max, SketchUp and any glTF viewer open it; a render artist who wants it smaller runs it
  through gltf-transform or gltfpack. From any flat in 3D: **Edit ▾ → Download 3D model**.
- **Print plan…** — the plan as a sheet: walls filled black, door swings, windows, names and sizes, and along the foot
  the project, drawing, floor, area, scale, a scale bar and the north arrow. Pick **Paper** (A4–A1) and **Scale** (1 : 50,
  1 : 100, 1 : 200; one that does not fit the paper is greyed); **Print** opens the browser's print window, where **Save
  as PDF** makes the PDF.
- The buyers' notes and choices: ⋯ → **Change list** → **Export CSV**.

---

## 6. Making a building — a project, floor by floor

Every project is a list of floors, each with a drawing. A drawing is one whole floor (all its flats and the lift lobby);
one drawing can be on any floors you like.

**A project comes from what you drop** — nothing to set up first:
- **A set** (a PDF of many pages, several PDFs, a folder or .zip of DXFs): **What is in this set** → **Build the project**
  makes the project with every floor the set names (§5 "Drop a whole set").
- **A building model** (an IFC of several storeys): a project of its storeys at once (§5 "Bring in the architect's file").
- **One drawing** — one DXF, SVG, IFC storey, a PDF page, or a plan picture — dropped on an empty Studio: a project of one
  floor, named after the file, the drawing on **Floor 1** (the ground floor waits empty). A brochure flat is traced
  exactly as before (drop the picture, S, Auto-trace, Preview 3D); the project around it is there when you want more
  floors: type them in its floor plan's box (below) or Draw on another floor. With a project open, a drop goes into the
  drawing open in it, as before.

**Or start an empty project** — the floors said first, the drawings after:
1. Studio → **⋯** → **New project** (or **Start an empty project** under the door of an empty Studio, or
   **Building**).
2. Type its **Name**, **Basements** (0–5), **Floors above ground** (1–60), tick **Rooftop** or not. A ground floor is
   always there.
3. **Create project.** The project's column appears on the right and stays.

**The project's column** (on the right, beside the inspector; **Building** in the top bar hides and shows it), top down:
its name in large type with **Rename**, **Delete** and **Close**; **Show building**; **FLOORS** — **Rooftop**, the floors
from the highest down, **Ground floor**, **Basement 1**, **Basement 2**… each with its drawing's name and, under it, where
that drawing came from ("from page 7 · 2ND FLOOR PLAN · 1 : 48", "from Internal_Ground.dxf", "from
LTU_A-House_redesign.ifczip · VÅNING 2", "traced on img_3.webp"); then the open drawing (**Open now**), **Floor plans**,
**Kept from the drawing set** (a set's elevations, sections, site and schedules by kind), **Site** (where the building
stands: **Open** opens the Site panel, as ⋯ → Site) and, signed in to a company, **Team**: **Members** and **Links** open
your account card on that list (as ⋯ → your email).

**ROOF** (under the floors): the roof over the top floor in one line ("Flat, with its parapet · Plain roof slab", "Gable ·
pitch as drawn · Clay tiles · eaves 0.45 m · 2 roof windows"). **Change** opens its fields under it — **Kind**, **Pitch °**,
**Ridge**, **Eaves m**, **Covering** (a list), **Coping**, **A cornice band under the roof**, **Roof windows** / **Skylights**
with **+ Add**, **Front / Back**, a slider and **×**, **On the roof** with **+ Solar panels** and **+ Chimney** (the same
rows) — the same as the 3D view's roof block (§3, "The roof"); **Close** folds
them. A typed number goes in on Enter or when you leave the box. Saved in the project at once; **Show building** shows it.
A project built from a drawing set whose sections print an eave and a ridge starts with that roof ("Gable · pitch as
drawn"): change its covering or overhang and it stays at the printed heights; type a pitch to make it steeper or flatter.

**Give each floor a drawing** — work down the list:
- **Draw** (an empty floor): a new drawing for it opens, called Floor plan A, Floor plan B… (or Ground floor, Basement 1,
  Rooftop); the flats inside keep the sheet's names (Type A, Type B). Drop its plan picture, set the scale, trace.
- **Use its scale and position:** when the picture is exactly the size of one you already scaled, a message offers this
  for 15 seconds — no scale to set, and the two drawings sit right over each other. Ctrl+Z undoes it.
- **Open:** that floor's drawing comes in; the one you were on is saved first, with its picture.
- **Use drawing…:** pick one of your drawings for this floor. **Clear:** the floor is empty again (the drawing is kept).
- Under a floor's drawing name, its flats ("— Flat 1, Flat 2" or "Type A, Type B"), found from the drawing itself.
- The floors of the drawing open now are white.

**Floor plans — draw once, use on many floors** (under the floors, one row per drawing): its name and the floors it is on
("on G, 2, 4, 6"). Type floors in its box — `2, 4, 6-8`, any pattern — and **Apply** (or Enter). A floor that already has
another drawing asks first (that drawing is kept). **Copy** makes a new plan from this one, for a floor that differs a
little; it is on no floor until you give it some.

**Under the floors:** **Open now** (the open drawing's name, to rename it) and **Delete this drawing** (it leaves every floor;
asks first). A drawing with two flats or more (a whole floor: an architect's storey of ten student flats) shows **Furnish
in 3D** between them: a tick per flat (Flat 1, Flat 2 … or its Type name), **All**, **None**. Only the ticked flats are
furnished and lit in Preview 3D, the walk and the Building view; the others stand bare — walls, floors, doors and windows
— and the walk starts in the first ticked one. The lobby, stairs and lifts stay as they are; a flat you arranged by hand
keeps its pieces. All ticked (as at first) = every flat furnished. **The project itself** (top of the list): **Rename**, **Delete** (asks first), **Close** (nothing is lost; open
it again with **Building** → **Or open a project**, a list of your projects by name; a reload keeps it closed). After
Close the drawing you were on stays on the screen and is still the project's copy: what you change on it goes into the
project. **Start over** then empties the Studio without asking and says so ("An empty Studio — the project BTI Demo
Tower keeps its copy of Floor plan A").
**Show building** opens the stacked building in a new tab (start screen, then the tower); a floor with no drawing yet is
filled with the one below it.

**One floor different from the others**
- A drawing on several floors is ONE drawing: change its walls, doors or windows in the Studio and every floor with it
  changes.
- **Furniture and finishes are every flat's own, always** (founder 2026-11-21): floor 3's flat keeps what you picked and
  arranged there in the 3D view, floor 4's keeps its own, the mirrored flat next door its own (§2 and §3, "Every flat
  keeps its own"). The Studio's F tool and Preview 3D set where every floor of the plan starts.
- **Use drawing… → This floor only — its own copy:** that floor gets its own copy ("Floor plan A · floor 5") with the
  picture, that floor's furniture and finishes, and the notes, and the copy opens. From then on its walls, doors and
  windows stay on that floor.
- **In the 3D view** (staff): **Edit ▾ → Openings** on such a floor asks "Floor plan A is also on floors 1, 3, 4. Change
  its doors and windows on: **Floor 2 only** / **All 4 floors**". Floor 2 only gives floor 2 its own copy (with floor 2's
  furniture and finishes) and opens the page again on the copy, Edit openings on ("Floor 2 has its own drawing now"); All
  4 floors changes every floor; **Esc** closes the box (it asks again next time). The answer is remembered for the project
  in this browser; **Ask again** under Show building forgets it. Furniture changes never ask.
- When a floor plan is left on one floor only (you cleared or gave away its other floors), that floor keeps what it had:
  its furniture and finishes become the plan's own, which F then shows.
- **A building from an IFC** has one drawing per storey from the start: nothing repeats, nothing to answer.

Whatever was open before you started (or opened) the project becomes one of its drawings when you open a floor (Use
drawing… puts it on floors); the list says so meanwhile ("The plan open now is not one of this project's drawings yet").
A drawing that belongs to another project stays in that one (the list says the same line about it: it is not added).

**The old way, one plan:** **Building** with no project open → **Put only this plan into a building…** → "Use this plan
as" **A flat** (floors N to M, a mirrored neighbour), **Ground floor**, **Basement**, **Common floor** or **Rooftop**,
placed on the flats' columns or by **Move it right / Move it down**.

**A whole drawing set** makes its project in one go: drop it and **Build the project** (§5, "Drop a whole set"); the
set's elevations, sections, site plan and schedules are listed by kind under **Kept from the drawing set** in the
project's column (click one to see it).

Projects, their drawings and pictures are kept in this browser, and online for your company when signed in (§5,
Accounts).

---

## 7. What the tool decides by itself

The rules Plotline follows without asking, so you know why something came out as it did.

**Walls**
- Height decides the type: 0 = zone line, up to 8 inches = kerb, under a full storey = low wall, else a wall.
- A low wall that gets a door or a window becomes full height; an open passage does not raise it (a gate).
- A wall lower than 1.2 m (planter edge, kerb, low parapet) joins its two sides into one flat, as a door does.
- Walls drawn across each other are joined.
- Every solid low wall (parapet, planter edge, boundary wall, under 2.4 m) wears a cap 1 inch proud of both faces.
- Every balcony's floor slab stands out past its front by 2 inches, its edge showing as a band about a foot deep with a
  drip under it (the plaster of the outside). A curved balcony gets it round its curve.
- A railing, glass front or fence (**Made of**) stops at the face of a solid wall it meets; its posts are never more
  than 1.5 m apart (a grille or timber fence 1.8 m, chain-link 2.5 m), a railing's bars never more than 11.5 cm, glass
  panels never wider than 1.25 m.

**Openings**
- A window that starts at the floor and is at least 1.5 m tall is a **glass wall**; a door 1.5 m wide or more is a
  **double door**.
- Changing an opening's kind resets its size to that kind's usual size.

**Rooms**
- A room exists wherever walls close a shape: you never draw a room, you only name it.
- The kind is guessed from the name (the words Auto-trace reads, §8).
- What Auto-trace draws by itself: §5, "What Auto-trace draws that is not a wall".

**Furniture**
- A room with no furniture of its own is furnished by its kind; once you move one piece, that room's layout is yours. A
  room you emptied stays empty.
- Things resting on a piece move with it. A longer dining table gets more chairs. Trees keep 1.5 m from windows and
  glass walls.
- The AC goes on a wall with no window when there is one, never over a bed's headboard, slid clear of the sofa, on the
  wall facing the room's biggest window when it can.

**Sun:** where the real sun stands at the site (Dhaka with no site) on the day and hour picked, by the plan's true north.

**The floor above:** walking a flat that is part of a building, a veranda, planter or air shaft with a floor over it gets
no sun or sky through its ceiling; only what has nothing above it (a part sticking out, a shaft kept open above, the
rooftop) sees the sky. A flat opened on its own still lets the sky into its verandas and shafts.

---

## 8. Room kinds and what each gets

What each kind of room is furnished with, and which printed words give which kind.

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
| foyer | A low cabinet on its blankest wall (else a shoe bench), light; a passage under 1.5 m wide stays clear |
| pantry | Counters and wall cabinets (no sink, no hob), a fridge, open shelves, light |
| maid | A cot and a hook rail, light (no AC) |
| prayer | Kept empty, light only |
| utility | Nothing |
| shaft | Nothing; open to the sky |
| other | Nothing (a room named "stair" gets a stair). The lift lobby, stair and lifts: the building's core, in no flat |

**The words Auto-trace reads, and the kind each gives** (any case; dots, hyphens and spaces may vary — "M.BED",
"BED-03"). Typing the same word as a room's name in the Studio picks the same kind; you can always change it. The room
keeps the name as printed ("Suite 1", "K.Ver").

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

Never a room — fixture and drawing tags: DW, D.WASH, FRIDGE, FREEZER, REF, W/M, WASHING MACHINE, TV, FHC, FHB, F.RISER,
E.RISER, SDB, FIRE HOSE REEL, DINNER WAGON, SHOWER AREA, UP, DN, BEAM, SLAB, ROOF OF …, SLOPE, LEVEL, TYPE-A, UNIT A, LIFT
PIT, K.WASH, LOW WASH, STANDOUT, TEA CORNER. Typed in the Studio on a ground floor or rooftop, "Lobby" gives a common lobby
and "Garden" a lawn.

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

What lives only in this browser, what is safe online, and what is never saved.

**In this browser** (gone if the browser's data is cleared, not seen on another computer — unless the last column says
otherwise):

| What | Also online? |
|---|---|
| The Studio drawing you are working on, with its plan picture | Yes, signed in to a company |
| Projects (every drop on an empty Studio makes one), every drawing of a project, where each came from, and its plan picture | Yes, signed in |
| Every flat's own furniture and finishes, as staff left them (3D view, F, Preview 3D) | Yes, inside the project (or drawing) the next time the Studio saves it signed in — at once while the Studio is open in another tab, else when you next open the Studio; the floor plan's own goes into a buyer link when you make one. A built-in flat's: this browser only |
| Your own furniture, finishes and texture pictures | Yes, signed in — for every colleague and in the buyer links that show them |
| The last Preview 3D | No |
| Notes on ordinary (non-buyer) links | No |
| Your answer to the 3D view's "which floors?" box, per project | No (Studio → Building list: **Ask again**) |
| Staff mode, the staff key, your sign-in (until **Sign out**) | No |
| Your Check these answers (Export answers) and where the print Auto-trace could not read stands | No |
| The Local AI settings (the model itself is on this PC's disk, `E:\dev\tools\ollama\models`) | No |

The **Site** (place, north, blocks, roads, wind) is part of the drawing: kept wherever the drawing is.

**Safe:** the built-in flats and levels; anything exported as a file (it does not hold the plan picture — keep the
picture too); buyer links and what buyers do on them (in the database); signed in, the open project or drawing with
**every save of it** and each drawing's plan picture (your company only).

**Never saved:** what a buyer (or anyone not in staff mode) clicks in Finishes, unless they press **Share** (it goes
into the link; on a buyer link each pick also goes to the change list).

---

## 10. Rough edges known today

Things that are confusing or not finished. Each one is a job on the list.

**Auto-trace**
- It misses rooms. On the 30 test sheets about 8 rooms in 10 come out closed and named (83 %); across all 110 sheets
  about half. The ones usually left: open-plan foyer / living / dining with no size printed, verandas drawn with a very
  light railing, planter strips, names it could not read (very small, grey on grey, touching a fixture), printed sizes
  crossed by a counter line or a door arc, rooms drawn at another size than their print. Each one has its row; the
  measured history is in [AUTOTRACE_SCOREBOARD.md](AUTOTRACE_SCOREBOARD.md).
- Ground floors, basements and rooftops cannot be auto-traced: draw them with W.
- A whole-floor sheet still shows many marks (84 on the BTI 2nd floor), crowding the plan when zoomed out.
- Whole floor's flat count is right on most test sheets but not all: two flats can come out as one where the floor
  reaches between them other than through the lobby (Eastern Housing Sapphire through its open-to-sky void; Sheltech
  Windflower Tower 1's Type F and B), and flats whose labels were not read are missed or merged (Rangs Sanctuary's five
  studios, Arkam Metro Park's seven, Windflower's red TYPE-W labels; the BTI 2nd floor's 2703 sft flat and its two
  674 sft flats came out as one "Flat 1", 2026-11-22). Check the flat names after Whole floor; part them with **New
  flat** (§5, "Flats in a drawing"). The second drawing on a sheet (BTI 3rd floor's "4th, 6th & 8th floor" strip) is not
  traced.
- The BTI 2nd floor's lift lobby and its top-left veranda (railing lines only) come out open; that veranda's railing
  meets the bedroom's window wall, where a new wall cannot end (§5 W).
- A flat without a printed type is "Flat 1, 2 …", counted west to east, so a mirrored drawing counts the other way; a
  room moved by hand to "Flat 2" goes with the number.
- Auto-trace puts the printed "TYPE-A ±2736 SFT" on the drawing only when it stands in a closed room of the flat; in an
  open foyer, add it with R.

**The Studio**
- Every file or picture dropped on an empty Studio makes a project of its own, so **Open a project** grows with each one
  tried: **Delete** in a project's column takes one away. The project's column takes 280 px of the sheet's width;
  **Building** hides it while you trace.
- A floor's "where it came from" line is written when the drawing comes in: a drawing traced by hand from nothing, or one
  from before session 31, says nothing (a picture-traced one says the picture it was traced on).
- The "Draft restored" message shows at every opening of the Studio, not only after a closed tab.
- A wrong scale found after tracing cannot be put right in one step: S changes the scale, but the walls do not follow.
- Once a plan picture is in there is no button to swap it (drop a new one); a drawing file opened again always asks for
  its picture. Lining a picture up needs zooming between the clicks when the two are far apart in size.
- The Banani and dmd built-in levels open without their plan picture: drop it and line it up with S.
- After typing in a box on the right press **Enter**, or the tool keys still go into the box. A typed wall length cannot
  start with 0 (type `.5`).
- The Floor box takes numbers only: G, B1 or R are dropped without a word, and the number does not make a plan a ground
  floor or basement — only its row in the floor list does. It also shows the floor a drawing was first made for.
- Clicking a wall that is all glass picks the glass ("Window" in the panel). Clicking a door on a thin low wall picks the
  wall (Del then removes the whole wall). While a column is picked, a wall end on its side cannot be dragged.
- R on a room with several gaps says only "a wall is missing"; the Issues row "Label is not inside a closed room" rings
  the nearest open spot, which can be outside that room. "Join with a zone line" can draw a long diagonal across a lawn.
- On the plan (F) a piece wholly under another (a hob under its hood, a light over a bed) cannot be clicked: pick it in
  the 3D view.
- Zoomed out, a small room's name can be hidden until the mouse is over it; coloured areas (lawn, driveway) cover much of the
  picture under them; checks written for flats show on levels ("No entry door on an outer wall", the Area number).
- Undo does not reach past closing the browser or switching drawings (an imported file over a drawing is one step back);
  the tracing timer starts again for each drawing.
  Ctrl+Z right after opening the Studio again does nothing.
- Renaming a project does not change the Project box of drawings made before.

**Projects and the 3D**
- Outside a project only one Studio drawing exists: opening another plan from the 3D view (Edit plan, Edit openings)
  replaces yours after one question. Inside a project nothing is asked.
- A whole-floor drawing knows its flats only in the Studio: a buyer link and the Building view treat the whole floor as
  one flat, and finishes go per room and wall, not per flat.
- "Which floors?" is asked only on a Studio project's flat floors: a built-in tower's flat, or one level drawing on two
  floors, changes everywhere (use **This floor only** in the floor list first). **Floor 2 only** reopens the page on the
  copy, from the entrance. The old one-plan way does not know about own copies (use the floor list).
- The old one-plan way (Put only this plan into a building… → Ground floor) refuses until a building with a flat exists,
  then needs typed "move it" numbers.
- "Walk this level" from Show building first shows an Enter screen. An area added to a level ("Sand pit") may be missing
  from the room list; jumping to a lawn can leave you in a corner facing a wall.
- Furniture moved in 3D while the Studio is open in another tab can be overwritten by the Studio (on a floor plan that is
  on one floor only: there F and the 3D view share one layout).
- In the Building view the other flats show each floor as this browser keeps it (its own finishes and furniture, else the
  floor plan's); a floor changed in another browser shows here once its project is opened. Rugs, potted plants and small
  things (a vase, a book) are left out of the other flats.
- A flat's own furniture and finishes go online only through the Studio (open it once after a 3D tour, signed in). The
  Studio's buyer link (**⋯ → Share link**) carries the floor plan's own furniture and finishes (Preview 3D's); for one
  floor's own, press **Share** in that floor's 3D view (staff, with the online database).
- In 3D, walls higher than 1.2 m cannot be moved; sliding a low wall whose end meets the middle of another wall slides
  that piece's doors and windows with it.
- **Outside pieces** (sunshades, canopies, AC units…): "outside" is outside the drawing. A one-flat drawing in a tower of
  several (the built-in Type A, B, C) does not know its neighbour flat, so the wall it shares with the next flat or the
  core counts as outside and a piece hung there stands inside the neighbour — use the building's real outer walls. A
  whole-floor drawing (the Studio's way) knows its neighbours. In the Building view a piece can be added, not moved or
  deleted (do that in the Dollhouse). On the other floors of the same drawing a flat's outside pieces show only where the
  Building view draws furniture (by quality), and lit as the inside.
- A low wall's **Made of** is kept in the drawing, the 3D and the Building view, but not in a DXF given back (it comes back
  solid), and an architect's file (IFC) brings its railings as its own shape, not as a Made of. With Finishes open, a
  click on a railing or glass front offers the balcony's wall paint (the railing's own colour has no choice yet). The
  daylight on a balcony is worked out as if its front were solid.
- Two different "share" buttons: **Share** in the 3D view (staff with the online database: a buyer link of that floor's
  flat as it stands; otherwise a link with your finishes) and **⋯ → Share link** in the Studio (a buyer link of the floor
  plan as Preview 3D shows it). Both feed the change list. The same thing has two names in places: "Slider" (3D) /
  "Sliding door" (Studio panel); "Reset layout" (3D) / "Reset to preset" (Studio).
- One-room finishes: the clicked floor or wall is not outlined in 3D (only the panel names it); the Studio cannot set
  them; two rooms of one floor group with different floors get no threshold strip in their doorway.
- The building's outside: a building drawn with the architect's own 3D outside shape (Studio → Outside shape) keeps the
  file's colours — the outside finish dresses the walls Plotline draws (the walked flat's, every tower without a shape).
  The tower is built again for each choice (about half a second); the floor plates' edges stay plaster. Railings and
  glass balcony fronts are their own work; the roof is its own block (Finishes → The roof). A click on a roof's wall or parapet in
  the Building view opens the outside card; on the roof itself, the roof's block.

**Site:** most neighbour heights are guesses (3 floors) — type the ones you know. The map may miss new buildings or keep
torn-down ones (delete those; a building cannot be added by hand yet). The plot is where the middle of the open drawing
stands, not the plot's outline. The wind lines show one room at a time (no wind through a door into the next room), and
the 3D shows no height on a block (the Studio's Site map does).

**Not yet tried on a real phone** (touch is proven with stand-in fingers in Firefox), **nor on the real online
database** (proven in a stand-in): see HANDOFF, session 31.

---

## 11. Can I change it?

The goal: **if you can see it, you can click it and change it.** This table is how far the tool is from that; every "No"
is a job (hand-tested 2026-10-05, updated since).

| Thing | In the 3D view | In the Studio | Cannot be changed anywhere |
|---|---|---|---|
| Wall | Its paint, one side at a time (Finishes open, click it); its outside finish — that wall, its floor or the whole building (staff: Finishes open, click its outside) | Yes — type, thickness (typed, or a face's dot), height, length, move, copy, delete; curved walls with A; **Outside** (what it is clad in) | — |
| Boundary wall, parapet, low wall | Yes under 1.2 m — Edit openings: drag an end dot, drag it across, type Length / Height, **Made of** (solid, glass, metal railing, steel grille, timber railing, timber fence, chain-link), Cornice, delete; a solid one's outside finish as a wall's (Finishes) | Yes — plus Made of and Cornice up to 2.4 m (a fence, a boundary wall); **Outside** | The colour of its metal, timber or glass |
| Balcony slab edge | It follows the balcony: every balcony's edge stands out | The same | Its depth and colour |
| Kerb, free-standing screen | Yes under 1.2 m, as a low wall | Yes | — |
| Glass wall | Yes — width, height, sill, slide, delete; its frame colour (Finishes → Window frames) | Yes | Glass colour. Cannot be *added* in 3D |
| Door, double door, gate, window, passage | Yes — kind, width, height, sill, slide, delete; a window's or slider's **Frame** colour | Yes — plus hinge side and swing; a window's **Frame** | Door material. Cannot be *added* in 3D |
| Column | No | Yes — each corner and side by mouse (or typed), move, delete, add | — |
| Ceiling, slab, ceiling height, ceiling lights | One room's ceiling can be clicked in Finishes, but only one ceiling colour exists | No | Everything else |
| Roof (the whole building's) | Yes (staff) — Building view, Finishes open, click the roof: kind (flat, gable, hip, shed, mansard), pitch, ridge, eaves, covering, coping, cornice | Yes — the project's column, **ROOF → Change** | A roof shaped to an L-shaped building (one roof over its box); dormers |
| Roof window, skylight | Yes (staff) — the roof block: add, front / back slope, slide along, take away | Yes — **ROOF → Change** | Its size (78 × 118 cm) |
| Floor of ONE room | Yes — Finishes open, click the floor; kept for that flat (§2, "Every flat keeps its own") | No | — |
| Lawn, paving, driveway, deck surface | No | No | No finish choices exist for outdoor areas |
| Shape, kind or floor level of an area | No | Yes | — |
| Ramp | No | Yes — far-end level, direction, length | Steepness as a number (1:8) |
| Steps | No | No | They are not their own thing yet |
| Pool | not tested | not tested | not tested |
| Parking bay | No | Yes — size, number, add, delete | The painted lines |
| Wall paint of one room / one wall | Yes — Finishes open, click the wall; kept for that flat | No | — |
| The building's outside (every outer wall, one floor's band, one wall; the window frames) | Yes (staff) — Finishes → Outside walls / Window frames, or click an outer wall: This wall · This floor · Whole building; kept for the whole building | Yes — a wall's **Outside**, a window's **Frame** | — |
| Tree, shrub, plant, furniture, loungers, pergola | Yes — move, turn, resize, delete, add from the library | Yes (F) | Swap a plant for another in one step |
| Sunshade, canopy, awning, fins, louvres, jaali, roller shutter, AC outdoor unit, fire escape, edge planter, name sign on a wall's outside | Yes — add from **Outside**, move along the outside, up and down, resize, delete (Dollhouse; on a balcony in Walk; the Building view adds only) | Yes (F: click outside the wall) | Their colour or material |
| Solar panels, chimney, flagpole, porch roof | Yes — like any piece, on a rooftop deck or a ground-floor zone | Yes (F) | A roof that is no traced level (the tower's own flat roof) takes none |
| Your own furniture model | Yes — Add → + Add your own…, then like any piece; ⋯ renames, resizes, removes | Yes (F) | — |
| A finish option of your own | Yes — Finishes → + Add option (staff); ⋯ changes or removes it | No | — |
| Curtains | Yes — slide, widen one side, delete, add onto any opening | Yes (F) — plus a typed width | Fabric and colour, drawn closed |
| Neighbour buildings, road | No (staff change them in the Studio) | Yes — Site: a height typed, a building or road deleted, fetched again or removed | Adding a building or road by hand |
| Sky | No | No | Everything |
| Day, time, the lamps on / off | Yes — the Sun & wind card | — | — |
| North direction | No | Yes — Site: drag the arrow, or type the degrees | — |

What staff change in the 3D view is saved in this browser and in the Studio drawing; a buyer on another computer sees
it once you make a new **Share link**.

---

## 12. If something goes wrong

Each of these is a plain page on the marble background — a small heading, one sentence, a button. **Plotline** at the
top left always goes to the front page. While a page is still arriving you see its outline in pale shapes, never a blank
screen.

| What you see | Why | What to do |
|---|---|---|
| **Nothing stands at this address.** | The address is mistyped, or the page has moved. | **Go to the front page**, or check the address. |
| **This flat isn't here.** | A `/u/…` address names a flat that does not exist (an old or mistyped link), or a link of a Studio drawing opened in another browser (without the online database it lives only in the browser that made it). | Ask whoever sent it for a fresh link. Staff: check the name against §1. |
| **Nothing was sent from the Studio.** | `/u/preview` opened in a browser where the Studio never pressed **Preview 3D**. | **Open the Studio**, then **Preview 3D**. |
| **This link no longer opens a flat.** | A buyer link (`/s/…`) was turned off, has expired, or never existed. | Buyer: ask your sales contact for a fresh link. Staff: make one with ⋯ → **Share link**. |
| **The flat could not be fetched.** | A buyer link could not reach the online database: no internet, or the database is not set up on this site. | Check the connection, **Try again**. If it keeps happening: [SETUP_SUPABASE_ON_VERCEL.md](SETUP_SUPABASE_ON_VERCEL.md). |
| **No 3D on this device**, with the flat's plan | No WebGL 2 in this browser, or the 3D stopped twice even on Lite. | Try another browser (Firefox, Chrome or Edge) or another computer, then **Try again**. The plan beside it is the real plan. |
| **Something broke here.** | A fault in the page itself (also when the site was updated while the page was open). | **Reload** (usually enough) or **Go back**. Staff: the details are in the browser's console (F12) — send them to the developer. |
| **Switched to Lite: the 3D stopped on this device.** (a line on the start screen) | The graphics gave up once; Plotline opened again on Lite. | Nothing — walk on. **Change** beside it picks another quality. |
