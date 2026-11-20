# Plotline — manual (working notes)

A list of everything the tool can do today and where to click. Kept in plain words.
Rule: whenever a button, key or page is added, changed or removed, this file changes in the same commit.
Last checked against the code: 2026-10-05; the keys, §2 walking, §3, §5 keys and §7 sun on 2026-10-19; the 3D view's screen (§2–§4: the bar, Sun & wind, Quality, the floors) on 2026-11-20.

**Every key and every button in one list: [KEYS.md](KEYS.md).** Where the furniture, the wind, the sun and the map come from, and what is free only for now: [SOURCES.md](SOURCES.md).

Plotline has three places (and a front page, §0):

- **The 3D view** — what a buyer sees. You walk through a flat or a level, pick finishes, leave notes.
- **The Studio** — where staff draw a plan over the plan picture.
- **The Building view** — the whole tower, floor by floor.

Two kinds of people:

- **Buyer** — can look, choose finishes and leave notes. Nothing else.
- **Staff** — can also move furniture, change doors and windows, and open the Studio.
  A browser becomes "staff" the first time it opens the Studio, or when you add `?staff=1` to the address. `?staff=0` turns it off.

**When something "asks first"** (since 2026-11-20, session 31): a white card opens in the middle of the screen with the question, and the page behind it goes pale and takes no clicks. **Cancel** (or **Esc**) says no and nothing changes. The second button says yes and names what it does — **Delete**, **Replace**, **Continue**, **Turn off**, **Make it my draft**; it is red when something is deleted or taken away. **Enter** says yes too. The browser's own grey box is never used any more.

---

## 0. The front page

Open the site with nothing after its name (`/`) and you get the front page. It tells a developer who has never seen Plotline what it does, as a short story you scroll through.

- At the top: the name, one line, the blue **See a flat** button (opens flat type A in 3D) and **Open the Studio**.
- Beside them (under them on a phone) lies a real floor plan: flat type A on a sheet of paper, drawn the way the architect's sheet draws it, with its room names, sizes and north point.
- Scroll down and the story plays with your scroll: the sheet straightens and tips back, the walls rise out of the plan with their doors and windows cut in, then the floor lifts onto a row of columns and more floors of the same plan stack up into a tower, each turned a little more than the one under it. The roof closes it and a June morning's sun casts the tower's shadow (true to the flat's north). Scroll back up and it plays backwards. Nothing moves unless you scroll.
- **I · Plan, II · Walls, III · Building** at the bottom left show where the story is.
- Below: "How it works" (bring the plan, walk the building, share), "What buyers do" and "What the developer gets", with six pictures taken from the 3D view (Plate I to VI). At the end, **See a flat** and **Open the Studio** appear again.
- The thin bar on top stays while you scroll: **Plotline** (back to the top; it appears once the big name has scrolled away), **See a flat**, **Studio**.
- If the computer is set to "reduce motion", the story does not play: the page shows the finished tower beside the first words.
- The front page shows no prices and nothing a buyer could change.
- A link to the site pasted into a chat, an email or a post shows a small card: the tower drawn in ink, **Plotline** and one line. The tab shows a marble square with a plan corner and a door swing; the same drawing is the icon when the site is saved to a phone's home screen.

---

## 1. Addresses

| Address | What opens |
|---|---|
| `/u/<name>` | The 3D view of a built-in flat or level. Names: `type-a`, `type-b`, `type-c`, `sheltech-a`, `sheltech-b`, `sheltech-ground`, `sheltech-l1`, `sheltech-b1`, `sheltech-b2`, `sheltech-roof`, `banani-ground`, `banani-b1`, `banani-b2`, `banani-roof`, `dmd-ground`, `dmd-b1`, `dmd-b2`, `dmd-roof` |
| `/u/preview` | Whatever you last sent from the Studio with **Preview 3D**. Only works in the same browser. |
| `/s/<code>` | A buyer link made with the Studio's ⋯ → **Share link**. Works anywhere, no account needed. Stops opening when staff **Turn off** the link. Needs the online database (Supabase). |
| `/studio` | The Studio. |
| `/changes` | The staff list of everything buyers chose and wrote. Signed in: your company's links. Not signed in: it asks for the staff key (for links made before accounts existed). Needs the online database. |
| `/` | The front page (§0): what Plotline is, with **See a flat** and **Studio**. An old link that adds `?c=`, `?floor=`, `?staff=` or `?view=` to `/` still opens the 3D view, as before. |
| anything else | A page that says "Nothing stands at this address" with **Go to the front page** (§12). (Until 2026-11-20 any unknown address opened the first flat in the list.) |

Extras you can add to the end of a 3D address:

| Add | What it does |
|---|---|
| `?staff=1` / `?staff=0` | Turn staff mode on / off in this browser |
| `?view=dollhouse` | Open straight into the dollhouse (seen from above) |
| `?view=building` | Open straight into the Building view |
| `?floor=5` | Show the flat on floor 5 |
| `?quality=lite` / `?quality=low` / `?quality=high` | Opens the 3D at that quality, whatever this computer would pick (see **Choosing quality** in §2). Choosing another one in the Quality menu drops it from the address. |
| `?scale=0.5` (any number from 0.25 to 2) | For testing speed: draws the 3D picture at that size (0.5 = half the width and height, stretched to the window). On Lite it replaces Lite's own size; on Low and High it multiplies theirs. |

---

## 2. The 3D view — everyone

**The look** (since 2026-11-20, session 31: "Marble" — the old black and gold is gone). Everything over the 3D is light frosted stone with dark text, thin lines instead of boxes, small spaced capitals for labels, and one deep blue for what is picked or on.

**Start screen.** A light stone screen with the room faintly behind it. You see the project's name in small capitals, the flat's name large in a serif letter, and its floor and size. A thin dark line fills as the rooms load ("12 of 27 rooms ready"). Then the blue **Enter** (or the Enter key) takes you in. You stand just inside the flat's front door, looking in. A drawing with no door yet puts you in its living room (or its first room), never facing a bare wall (2026-10-18). A whole floor (both flats and the lift lobby in one drawing) is entered from the lift lobby into its first flat; when no door from the lobby was traced, you start in its biggest living room, looking across it — never nose to a window (since 2026-11-20). A drawing you have not named shows the name printed for its flat on the sheet ("Type A"), or **Floor plan A** for a whole floor, or "Untitled unit" — Auto-trace no longer names it "Auto-trace draft", and a drawing you named keeps its name when you Auto-trace it. Under Enter, one quiet line says the quality and why ("High quality · This device can show the full look.") with **Change**: click it and **Lite · Low · High** show right there (a pick opens the page again with it). At the bottom, quietly: the other flats and each tower's levels (not on a buyer's link). Top right, small: **Studio** and **Staff mode** / **Leave staff mode** (not on a buyer's link).

**What is on screen** (since 2026-11-20: less over the 3D). Top left is the room you are in. Top right is one bar. Bottom middle are the hint and the Sun & wind pill; a short message after something you did ("Link copied …") shows there too, just above them. Bottom right is the small map. Everything else opens from these and closes again with **Esc**.

**The bar, top right** — from left to right:

| Button | Key | What it does |
|---|---|---|
| Walk · Dollhouse · Building (one switch; the view you are in is white) | O switches Walk ↔ Dollhouse; B the Building | Walk inside at eye height · the whole plan from above with the roof off · the whole tower (only when the flat belongs to a tower) |
| Finishes | F | Opens the panel on the right: floor, wall and ceiling options. While it is open, clicking a floor, a wall or a ceiling chooses for that one room or wall. Its **×** (or F, or Esc) closes it |
| Comment | C | Opens the Comment panel on the right: click anything to leave a note on it; your notes are listed there. Finishes and Comment take turns: opening one closes the other |
| Share | — | Copies a link that opens with the finishes you chose |
| Enter VR | — | Only shows when a VR headset is connected |
| Edit ▾ (staff only) | — | Furniture, Openings, Plan (Studio), Download 3D model — see §3 |
| ⋯ | — | **Clean view** (H) and **Quality**: Lite · Low · High (see **Choosing quality** below) |
| The eye (last button) | H | **Clean view**: hides everything on screen so you see only the flat (below) |

The button that is on (Finishes open, Comment on, an Edit mode on) has a light blue wash and blue words.

**Top left:** the room you are standing in — its floor in small capitals, its name in the serif, its printed size and area under it. There is no box: a soft haze of frosted stone sits behind the words so they read over any wall. **Click it** for the list of rooms (this is where the old **Rooms** button went); the room you are in is the white row. Click a room to jump there. Esc, or a click elsewhere, closes the list. In the Building view the same place names the floor you picked instead (since 2026-11-20): "Floor 2 · Type A · 2703 sft", the flats on another floor, or "Ground floor", "Basement 1", "Rooftop".

**The hint** (bottom middle) shows the keys for what you are doing ("Double-click to look with the mouse · click the floor to walk there · WASD to walk"). It fades after a few seconds so it never sits over the room, and it does not show while the Sun & wind card is open. It comes back when it changes (the mouse locked or freed, another view, an editor on) or when you hold the mouse over where it was. Under a finger (a phone, a tablet, or a touch screen you just touched) it never names a key (nor does the ⋯ menu's Clean view row): it says what a finger does — "Drag to look · tap the floor to walk there" (see **On a phone or tablet** below).

**Resting** (since 2026-11-20, session 31). In Walk, when the mouse has not moved for 3 seconds, everything fades away except the room's name top left — the bar, the hint, the Sun & wind pill, the small map. Move the mouse, click, scroll or press a key and it all comes back at once. The walking keys (W A S D, the arrows, Shift) and turning your head with the mouse do not bring it back: you are looking at the room. It never fades while a panel, a list or a menu is open (Finishes, Comment, Sun & wind, Rooms, Edit, ⋯, the staff editors), while you hold a piece of furniture, in the Dollhouse or in the Building view, or while the mouse rests on the bar or a panel.

**Clean view** (since 2026-11-20, session 31; buyers and staff). Press **H**, click the **eye** (the last button of the bar), or **⋯ → Clean view**: everything on screen goes — the room's name, the bar, the hint, the Sun & wind pill, the small map, the note pins, the wind's labels, the staff panels, and no message pops up. Only a faint small dot stays top right. **H**, **Esc** or a click (a tap on a phone) on the dot brings it all back. **F**, **C** and (staff) **G** also bring it back and do their own job (the panel opens, the note starts, the piece is picked up); walking, **O**, **P** and **M** keep the view clean. This browser tab remembers it: open another flat in the same tab and it starts clean too.

**Moving in Walk**

- **W A S D**, or **↑ ↓** — walk. **← →** turn you (while the mouse turns your head they step sideways, as A and D do). **Shift** — faster.
- **Click a spot on the floor** — you walk there. (Not while Comment or Finishes is open: then the click puts the note or picks the finish, and you stay where you are — since session 31.)
- **Double-click** (or the Enter button) — the mouse now turns your head. **Esc** gives the mouse back.
- You cannot walk through walls. You can climb steps and ramps. You cannot walk into a pool.
- **Stairs between floors** (since 2026-11-20), in a flat or level that is part of a building:
  - Walk up the stair: the first flight to the half landing, then turn onto the second flight. The floor above opens with you standing at the top of its stair, facing the stair room's door.
  - To go down, walk from the stair room's floor into the space under the second flight, toward the back (where the flight from the floor below comes up). The floor below opens with you on its half landing, looking down the last flight.
  - Each change of floor loads that floor (a few seconds, like opening it from the list).
  - In a stair room, the buttons **Up to …** and **Down to …** (bottom middle, just above the Sun & wind pill) do the same in one click. They also work where the stair room is too small for a drawn stair.
  - A stair with no floor above (the rooftop) or below says so: "This stair goes no higher / lower".
- Walk sees about as much as a 22 mm camera lens: a little under 80° across a wide screen, from 1.45 m eye height (since 2026-10-19; it used to be a wider 16 mm look, which made rooms and furniture look small and far). The dollhouse and the Building view see wider, as before.

**Moving in Dollhouse:** drag to turn, scroll to zoom, right-drag to slide. Click a room's floor to drop into it (not while the Finishes panel is open: then the click picks that floor's finish).

**Finishes panel**

- **One room or one wall:** with the panel open, click a floor, a wall or a ceiling — in Walk or in Dollhouse. The panel's top block names it ("Bed-1 · floor", "Living room · north-east wall": the side of the room the wall is on, by the compass) and shows the options for it. Click one: only that floor or that wall changes. Bed-2 keeps its own floor, and the other walls keep their paint.
  - For a wall: a switch **This wall · The whole room** (every wall of that room, columns too). A wall is the whole straight wall you see, even where the plan has it in pieces.
  - **Same as the group** (for one wall: **Same as the room**) takes your choice back, and shows what that is. **Done** closes the block.
  - If the mouse is turning your head, press **Esc** first. A click then picks what is under the middle of the screen.
- Each block below is one thing you choose for a group of rooms (for example "Bedroom floors"). Click an option. Each shows its brand and the price difference; the one chosen is the white row. A room or wall with its own choice keeps it when the group changes.
- **Chosen for one room or wall** lists those choices. **undo** takes one back.
- **Options total** and **Reset to included** sit at the bottom. The total is each group's choice plus each one-room / one-wall choice once, at that option's own price (not shared out by floor area). Reset also clears the one-room choices.
- **Share** puts the one-room and one-wall choices into the link too. On a buyer link each one goes to the change list under its room's name ("Bed-1 · floor: White marble"). Taking it back is a row too ("Same as the group").
- On a buyer link, **Your name** sits at the top (the same field as in the Comment panel).

**Notes (Comment panel)** (since 2026-11-20, session 31 the notes live here, not in Finishes): press **C** or click **Comment**. A panel opens on the right where Finishes opens (Finishes closes): "Click anything in the flat … and write what you would change", then **Your notes** with how many. Click the thing, type, **Save**: a numbered blue pin stays on it and the note shows in the list at once. Comment stays on, so the next click starts another note. Click a note in the list to walk to it; **Remove** deletes it. **Esc** first drops a note you have not saved, then a second **Esc** (or C, or the panel's **×**) stops Comment. On a buyer link **Your name** is in this panel too.

**Always on screen**

- **Sun & wind** (bottom middle) — a slim pill showing a small sun, the time ("15:30"), the month ("Nov"), the word "Wind" while the wind is on, and a small compass. Click it and it opens into the **Sun & wind card** in its place: a narrow card (since session 31) headed SUN & WIND — the compass and the time on top, then the slider, the months, and **Lights** · **Wind** side by side. The **⌄** at the card's top right (or Esc) folds it back into the pill. The sun and the wind keep going while it is folded (the wind's lines and chips stay).
- **The compass** (the card's top left; small on the pill) — a compass rose on a white face with N in blue and the letters a little larger than before (always readable), turned so that **the top of the compass is straight ahead of you**. Walking, N to the right means north is on your right. In the Dollhouse and the Building view it turns as you turn the view. It uses the plan's true north (set in the Studio's Site), the same north the sun and the wind use. It is always there while the card or the pill shows (it used to hide behind the Quality box on laptop screens — fixed 2026-11-20).
- **Sun & wind card, the sun.** The **time of day** is large ("15:30 afternoon"), with a slider under it for the whole day (0 to 24; "0 · 6 · noon · 18 · 24" under it). The slider's handle is a small white disc, and the slider is coloured by that day at the site — dark at night, rose at dawn and dusk, warm through the day — so you see when the sun is up. The **day** sits under the time (click the date and pick one; it starts on today). Under the slider are the **twelve months**, Jan to Dec, as buttons, six to a row so they are easy to read (the picked one white). A click moves the day to that month, and the sun and the wind follow.
  - The sun stands where it really stands at the building's site on that day at that hour, by the plan's true north. A June noon in Dhaka is almost overhead, a December noon low in the south. A room only gets a sun patch when the sun is on its side of the building (Type A's living room faces north-east and south-east: sun in the morning, none at 15:00).
  - No site set in the Studio: Dhaka. The time is the site's own clock (Bangladesh time for Dhaka).
  - **The only light is the sun and the flat's own lamps.** From noon down to a low sun the rooms look as they always have. As the sun sets the windows' light fades, the sky turns golden, then deep blue (blue hour), then near black with a faint city glow low on the horizon, and the neighbour blocks become dark shapes. With the lamps off, a room at night is dark — only that faint glow comes through the windows.
- **Lights** (the button beside Wind on the Sun & wind card; everyone sees it) — the flat's own lamps. Every piece that gives light shines:
  - each ceiling light, fan, pendant and chandelier (warm white, as bright as a real 10–45 W LED ceiling light for that room's size);
  - each **floor lamp** and **table lamp** (a warm bulb in its shade: a pool of light on the desk or bedside table and the wall behind it).
  - Up to 12 shine at once on **High** (4 on **Low**, 2 on **Lite**) — the ones in your room and nearest you. A farther one lights up as you walk toward it; until then its room still glows softly with its lamps' light bounced off the walls.
  - They light their room from the fixture down: a bright pool under it, walls lit to near the ceiling and fading into the corners, and on **High** furniture throws real shadows (the 3 ceiling lights nearest you cast them; Low and Lite draw no lamp shadows). The light bounced off the floor lights the ceiling. The diffuser, the pendant's globe, the fan's light kit and a lamp's shade glow.
  - **The light follows the pieces** (since 2026-11-20). Move a light in Edit furniture and its light moves with it. **Delete** it and its light goes: the room goes dim, lit only by what comes in from the next room through its door or passage. **Undo** brings it back lit. **Add** a light from the library and it shines as soon as it is placed. A room lit only by a table lamp is dim, with a warm pool round the lamp.
  - **Automatic** (the start): on while the sun is under 5° (dusk to dawn), off by day. The button is lit while they are on. A click turns them the other way (lamps on at noon, or off at night, to see the room by the sky alone). A click again goes back to automatic. This browser remembers the choice.
  - Glass at night mirrors the lit room faintly. In the **Dollhouse** at night the rooms glow inside dark outer walls. In the **Building** view the tower's other flats show lit windows (about half, the same ones every time).
- **Wind** (the button on the Sun & wind card, or the **P** key in Walk, Dollhouse or Building) — the wind through the flat this month, as thin lines drifting from where it comes in to where it goes out. Pressing it again hides it all.
  - **The lines fill the opening the wind comes in by** (2026-11-20; before, there were two thin threads at two heights). There are 3 to 5 rows of lines one above the other, from a quarter of the opening's height up to near its top (a window: from its sill to its head; a door: its whole leaf), and across it one about every 60 cm — a sheet of air through the window, the same in Walk and Dollhouse. Where the way out is close by (two windows at a corner of the room), the lines bend round the corner instead of fanning across the room.
  - While it is on, the card shows under the months the month in words with its **season**: "June · monsoon · steady south-south-east breeze, 3.5 m/s · hot and humid, about 28 °C and 85 % humidity". Seasons for Dhaka: winter Dec–Feb, pre-monsoon summer Mar–May, monsoon Jun–Sep, post-monsoon autumn Oct–Nov. The air numbers come from the site's ten years of Open-Meteo weather records, or the built-in Dhaka table. The lines take the season's quiet tint: monsoon a cool blue, winter a pale grey-blue, the hot months a muted terracotta.
  - **Walking**, small chips float over the room's openings: "Wind in · SSE" where it comes in, "Out" where it leaves. The room's box top left says it in words: "Wind comes in at the south window and goes out through the north window" (the side of the room each one is on), "… no way out: it stays in the room" when nothing on the far side lets it out, or "No window or door here faces the wind".
  - How it is decided: an outside window or door (onto the open air or a balcony) facing within 60° of where the wind comes from lets it in. Of those facing away from it (90° or more), the one farthest downwind lets it out. A door into the next room does not count.
  - **Fainter lines:** a neighbour block within 30 m upwind of that window, taller than your floor (floor × 3.2 m above the street), takes the wind.
  - With the wind on, **the compass becomes the wind rose** (larger). It shows every month at once, one slim line each toward where the wind comes FROM (longer = stronger, rings 1 m/s apart; the picked month blue and thick), turned like the compass. Click a line to pick its month. (The old **Rose** button is gone: the rose is the compass now, so it never covers anything.) Under the month's words: where the wind table comes from, and "A guide, not a wind simulation."
- **Around the flat** — the neighbouring buildings and roads, grey blocks at their height with dark roads, seen in Walk, Dollhouse and Building. They throw the sun's shadow onto the flat, and while they show, "© OpenStreetMap contributors" (the map's credit) sits bottom right. In Dollhouse and Building, a block standing between you and the flat (or the tower) is left out while you look from there, so a neighbour's roof never hides the floor you are looking at (2026-10-18). Its shadow stays.
  - **With a site set in the Studio** (§5, Site): the real buildings and roads from the map.
  - **No site: a made-up street, built like a real Dhaka street** (2026-11-20; before, the neighbours stood 8–25 m away with wide gaps and roads on every side). On the sides with no road, the next building stands **2–4 m from the flat's walls** (never nearer than 1.25–1.5 m past the plot's edge, as the building rules ask the neighbour too). The buildings along a side stand in one row with gaps of 1.5 m at most, about as tall as this building (two floors more or less). **One side has the road** (6–9 m wide; on some buildings two sides, a corner plot), with the buildings across it right at its edge. For a built-in building, the road is its drawing's own road.
  - Each building gets its own street: the same every time you open it, and the same for every flat of it, from inside and in the Building view.
  - These buildings throw the sun's shadow into the flat, and they **darken the rooms facing them**. A bedroom looking at a wall 3 m away is dimmer than a room facing the road, and the low floors more than the high ones — as in real life, where the space between buildings is what lets light and wind in.
  - The made-up street is seen from inside (Walk) and in the Building view, not round the Dollhouse.
- **Small map** (bottom right, Walk only) — where you are: white rooms, dark walls, the room you are in washed light blue, you as a blue dot with a cone. It has no title bar since session 31 (the room's name is top left already). Its **×** shows in its top right corner when the mouse is over the map; the × (or **M**) hides it. A small **Map** button stays in its place to bring it back (or M again). It steps aside while the Finishes or Comment panel is open. Its tiny compass (its top left corner: a blue needle tip and a small N) points to true north on the plan. The map is drawn the plan's way up, so it stays put as you turn.
- **Quality** (⋯ in the bar) — see below.

**Choosing quality** (everyone: buyer links, the Studio's Preview 3D, the built-in flats)

- **⋯** (top right, next to the eye) → **Quality** with **Lite**, **Low** and **High**. The one in use is white, and a small blue dot marks the one this computer should use. Under them one line says why. Hover the menu to see the graphics chip's name.
- **The start screen says it too** (since session 31; it replaces the small note that used to pop up bottom left the first time): under **Enter**, one quiet line — "High quality · This device can show the full look. **Change**". If another quality is advised, the line says why: *a phone or tablet* (every phone and tablet starts on Lite), *integrated graphics* (the graphics built into the processor: Intel HD / UHD / Iris, phone chips), *no graphics chip in use (software drawing)*, *4 GB memory*, *4 processor threads*, *no WebGL 2 in this browser* (WebGL 2 is the browser's 3D drawing feature), or *slow frames*. After an automatic switch (below) it says that instead ("Switched to Low: frames were slow on this device").
  - **Change** shows **Lite · Low · High** right there (the dot marks the recommended one); a pick opens the page again with it. Nothing pops up over the 3D about quality any more. If Lite is still slow, its picture gets smaller again and ⋯ → Quality says so (*Smaller picture: frames were still slow on this device*).
- Pick another one and the page opens again with it (you press **Enter** again; the finishes you chose stay). Your pick is kept in this browser, and the 3D never changes it by itself — with one exception: if the graphics stop working (see below).
- If you never picked: when the 3D draws slower than 30 frames a second, it steps down once (High → Low, or Low → Lite), opens again and says *Switched to …: frames were slow on this device*. It decides within about 3 seconds of the flat's furniture finishing loading (on Low, as soon as you start to move) — before 2026-11-20 it waited for you to walk for a while, which on a slow laptop could take minutes. It is remembered as this computer's recommendation.
- **High** = the full look: soft shading in corners, smooth edges, the sharpest pictures, up to twice the screen's pixels.
- **Low** = the screen's own pixels (never 2×, so a sharp "retina" screen draws a quarter of the pixels), no corner shading, a smaller sun-shadow picture, the 4 lamps nearest you lit at night (no lamp shadows), the wall tile's extra-sharp picture at half size, and — like Lite — no potted-plant models (the plants of planters and pots are left out, their soil stays) and bathroom mirrors as plain silvery glass. Like Lite, nothing is drawn while nothing changes.
- **Lite** = for weak laptops and phones: a smaller picture that the browser stretches to the window (about three quarters of the window's width and height on a big screen; a phone or small laptop screen draws nearer its own size) — slightly softer, much lighter to draw; no edge smoothing, no corner shading, **no shadows and no sun patches inside the flat** (the rooms are still brighter by their windows and darker deep inside; the sun still lights the street outside, the Dollhouse and Building views, and an open lawn, pool deck or roof terrace while you stand on it — there without the shade of the buildings around), the 2 lamps nearest you lit at night, the street outside as plain blocks (no painted windows, roof tanks or AC units) under a plain blue sky (no photo sky; glass mirrors the room's light instead), softer reflections, bathroom mirrors as plain silvery glass (no live reflection), pictures (wood, marble, fabric) at half size and without their fine relief, and no potted-plant models (the pots of code-built planters stay, without plants). Nothing is drawn while nothing changes, so the computer rests when you stand still (with **Wind** on, its lines keep drifting). Same walls, floors, furniture and finishes. If Lite is still slow, the picture gets smaller again (*Smaller picture: frames were still slow on this device*).

**When the 3D cannot run**

- No 3D in this browser at all (no WebGL 2, or the 3D could not start): *This browser or machine cannot draw 3D. Try another browser, or open on a PC.* Under it, the flat's plan with its room names. The Studio still works (it draws in 2D).
- The graphics stop in the middle (the browser loses them, or they run out of memory): the 3D opens again in **Lite** once and says *Switched to Lite: the 3D stopped on this device* (or *… the graphics ran out of memory …*) — even if you had picked High. For that browser tab it stays Lite until you pick again. If it was already Lite and the graphics do not come back within 5 seconds: the same message and plan as above, never a frozen black picture.

**On a phone or tablet** (since session 31, 2026-11-20: you can show a flat from your phone). Open the same address as on a computer. Every phone and tablet starts on **Lite**.

- **Going in:** tap **Enter**. (There is no "or press Enter" under it: a phone has no keys.) Your finger never takes over like a mouse does — there is nothing to free with Esc.
- **Looking round (Walk):** put one finger on the room and drag. The room follows your finger, like pushing a photo: drag to the left and you turn right, drag up and you look down. It stops before straight up and straight down.
- **Walking (Walk):** tap a spot on the floor — you walk there, as a click does. A long press (a finger held still for half a second or more) does nothing, so resting your thumb on the screen never moves you. Two fingers do nothing in Walk; tap where you want to go.
- **Dollhouse:** one finger turns it, two fingers pinch to zoom in and out and slide it. Tap a room's floor to drop into that room. Lifting the fingers after a pinch never drops you in.
- **Building:** the same — one finger turns the tower, two fingers pinch and slide. Tap a flat to open it; tap a floor in the list on the right to pick it (a tall tower's list scrolls, and it always opens at the floor that is picked; **Walk this level** stays full size under it).
- **On an upright phone** the Dollhouse and the Building view start a little farther back, so the whole flat or tower fits the narrow screen.
- **The bar** (a screen narrower than 720 px) sits at the bottom in two rows: Walk · Dollhouse · Building on top, then Finishes, Comment, Share, (staff) Edit, ⋯ and the eye, each big enough for a finger. The Sun & wind pill sits just above it. The room's name is a little smaller, top left, and the small map is top right.
- **Sheets:** Finishes, Comment, the Sun & wind card, the Rooms list and the menus come up from the bottom edge as a sheet. Each has a short grey bar at its top (the **grip**): pull it down and let go to close the sheet (a short pull and it settles back). Its **×** (the Sun & wind card's **⌄**), or a tap outside a menu, closes it too. A long sheet scrolls inside itself; the page behind never moves. Finishes and Comment take only the lower half, so you can tap the flat above them; the Sun & wind card, the Rooms list and the menus can take up to 70 %. While a sheet is up the bar steps away.
- **Comment:** tap **Comment**, then tap the thing — a wall, a window, a piece of furniture, the floor. A numbered pin goes on it and the note box opens next to it, always inside the screen (above the pin when there is room, so the keyboard does not cover it) and never over the room's name at the top; the Comment sheet steps away while you write. **Save** pins it. Tapping the floor for a note does not walk you there.
- **Finishes:** with the sheet open, tap a floor, a wall or a ceiling above it to choose for that one room or wall. You stay where you are.
- **Resting:** after 3 seconds with no tap, everything but the room's name fades (as when the mouse rests). Dragging the view does not bring it back — you are looking. A tap brings it back; a tap where the bar was only brings it back and presses nothing, so you never press a button you could not see.
- **Clean view:** the eye hides everything; a tap on the faint dot top right brings it back.
- **A phone on its side, a tablet:** on a short screen the start screen scrolls, with the list of flats under the Enter button. On a screen 721 to 1080 px wide (a tablet upright) the bar stays at the top and the room's name sits just under it, so the two never overlap.
- A computer with a touch screen works both ways: the mouse as always, a finger as above (the hint follows whichever you used last).
- **Staff on a phone** (Edit → Furniture works, but a computer is still the tool for it): drag a piece with a finger to move it, drag the empty room to look; the piece's tag says "Tap puts it down · the panel turns or removes it" — no keys.

**In VR:** hold the trigger to aim at the floor, let go to jump there. Thumbstick left/right turns you 45° at a time.

---

## 3. The 3D view — staff only

One extra button appears in the bar, top right: **Edit ▾** (washed blue while an editor is on). It holds **Furniture** (Edit furniture below), **Openings** (Edit openings), **Plan (Studio) ↗** (Edit plan) and **Download 3D model** (saves this flat as one `.glb` file once every room has arrived — Studio §5 "Give the drawing back"). The one that is on is the white row and says "on" beside it.

### Edit furniture

- **Click a piece** to pick it — also one you see through a window or a glass door. A click where the mouse slides up to 6 pixels is still a click: the piece is picked, never moved.
- **Drag** a piece (further) to move it. A drag on cushions, or on a TV standing on its unit, moves the piece under them. **Turn 90° (R)** on that TV (or the arrow keys in the Studio) turns or moves its unit too, with the TV still standing on it (since 2026-11-20; before, the TV turned alone, slid off the unit's front and was left in the air when the unit moved). Drag that TV up onto the wall above it and it turns red: "A TV on its stand cannot hang" — it has its stand foot, so it only stands (since 2026-11-20; before, it stayed in your hand without a word). For a TV on the wall: **Add → Living → 55" TV, wall-mounted**, and delete the one on the stand. Point back down at the floor and you carry the unit again. The piece turns red and tells you why if it cannot go there (outside the room, covers a window, overlaps another piece). Doors, passages and the entrance are NOT kept clear (founder, 2026-10-13): put a piece where you like. The Studio's F tool works the same way.
- **Wall pieces go up and down too** (since 2026-11-20): a TV, a picture, the AC, a clock, a mirror, a geyser.
  - Drag it and it follows the mouse along the wall *and* up or down it: point higher on the wall and it goes up, lower and it comes down, in 1-inch steps.
  - It never goes below the skirting or through the ceiling. It turns red over a window ("Covers the window") or in a doorway ("Covers the doorway"). Above a door's head it may hang.
  - **Ctrl+Z** puts it back where it was.
  - The same in the Studio: pick it with F and type **Height from floor** on the right.
- **Drag a dot** on a piece to make it bigger or smaller (only pieces that can stretch).
- **Curtains** are a piece of their own, hung on their opening (since 2026-10-14). Click them and "Curtains" shows.
  - **Drag** them (or press **G**) and they slide along their own wall only, in 3-inch steps. They stay with their opening: move or resize the opening later and they follow it.
  - They cannot be pushed into another pair (red: "Overlaps the curtains"). **Del** takes them away; **Undo** brings them back.
  - To add a pair: **Add → Bedroom** (or Living) **→ Curtains**, then point at an opening and click. The opening can be a window, a sliding door, a door or an open passage (since 2026-10-19; you may point through the doorway itself). A new pair hangs on it, centred and sized to it. Pointing at no opening says so in red: "Point at an opening".
  - They are as wide as their opening plus up to 15 cm past each side (less where a side wall or the next opening is closer), floor to ceiling, drawn open: one gathered panel at each side. Curtains in a doorway do not stop you walking through it.
- **Make curtains wider or narrower** (since 2026-10-19): click them, then drag the dot on one side. That side moves and the other stays. It moves in 5 cm steps counted from the opening's edge (so the edge itself is one step), from 0.4 m to 6 m wide, and stops short of a side wall (never round a corner). Moving or resizing the opening later keeps how far each side reaches past its edge.
- Buttons in the small panel, bottom left: **Add**, **Turn 90°**, **Delete**, **Undo**, **Reset layout**.
- Keys: **R** turns · **Del** (or Backspace) deletes · **Ctrl+Z** undoes · **Esc** lets go.
- **G** picks up the piece under the mouse (also through glass) without opening Edit furniture. **G** again puts it down.
- **Delete a piece in your hand** (since 2026-10-19): after **G**, or while a dragged piece is still in your hand, **Del** (or **Backspace**, or the panel's **Delete** button) deletes it. What moves in your hand goes, with what rests on it (G on the cushions takes the sofa and its cushions). Curtains too. **Undo** brings it back. A new piece from the library that is still in your hand is just let go.
- **Add** opens the library (see **The library** just below). Type what you want, or open a group, and click a piece (or press **Enter** for the first one listed). Then point at the floor, a wall or the ceiling and click.
- Saved in this browser only.
- On a floor of a Studio project whose drawing is on other floors too, the first change asks "Floor 2 only" or "All 4 floors" (§6, "One floor different from the others").

### The library (Add in the 3D view, F in the Studio — the same list in both, since 2026-10-19)

- **A search box on top.** In the 3D view it is ready to type into as soon as Add opens. In the Studio click it first (there the letter keys still pick the tools).
  - Type any word and the list shrinks as you type: a name (*sofa*, *lamp*, *bookshelf*), a kind or an everyday word (*almirah*, *chula*, *jaynamaz*, *geyser*, *nightstand*), or a room (*balcony*, *kitchen*, *office*, *dining*). Plurals work (*lamps*). Pieces whose name has your word come first.
  - **Enter** takes the first piece listed. **Esc** (one press, since 2026-11-20) empties the box and leaves it, so R / Esc / Del work again — in the 3D view the same Esc also closes the library.
- **Without a search:** first **Recent** (the last six pieces you picked in this browser), then the groups, each with how many pieces it holds: **Living, Dining, Bedroom, Office, Kitchen, Bath, Lights & AC, Greenery, Outdoor, Lobby & gym, Decor**. Click a group's name to open or close it. Inside a group the pieces stand by kind, each kind with its count (Sofas 5, Armchairs 3, …). A piece can be in two groups: the hand-wash basins are under Dining and Bath (a Dhaka dining space has one), desks and office chairs under Bedroom and Office, the chandelier under Lights & AC, Dining and Living.
- **Each row** shows the name, its footprint in feet (width × depth), and a small mark:
  - **built** = drawn by Plotline itself. There is no download, and when you resize it, it is built again at the new size (more shelves, drawers, doors or seats, never stretched).
  - **scan** = a photo-real scanned model (Poly Haven, free licence). It loads when you place it, and resizing stretches it a little.
  - **yours** = a model your staff added (next section), with a **⋯** to rename, resize or remove it.
- **Added 2026-10-19** (154 pieces now, was 110):
  - *Living*: bookshelf with books (also Office), console table, shoe rack, two TV units (1.5 m and 2.1 m), floor lamp, classic sofa (scan), carved drawing-room sofa (scan), classic armchair (scan), upholstered bench, prayer mat (jaynamaz, also Bedroom).
  - *Dining*: dining tables for 4 and 8 (the 6-seat one was there), a small wooden table for 4 (scan), a white painted chair (scan), a hand-wash basin with a mirror, the water filter on its stand, a pendant light and the chandelier (scan).
  - *Bedroom*: chest of drawers, walnut nightstand, classic nightstand (scan), drawer cabinet with shelves (scan), wardrobes 4 ft and 6 ft, kids' bed, bunk bed, baby crib, wall mirror, table lamp (see below), study desk and office chair (also Office).
  - *Kitchen*: double-door fridge, washing machine (also Bath), gas stove for the worktop (a two-burner chula), microwave on a steel stand, kitchen rack with pots and jars, exhaust fan (also Bath).
  - *Bath*: geyser (water heater) high on the wall.
  - *Outdoor*: balcony set (two teak chairs and a side table), clothes-drying rack with laundry.
  - *Decor*: rugs 2.0 × 1.4 m, a 2.4 × 0.7 m runner, a round 1.2 m rug.
- **A table lamp stands ON what is under it** (since 2026-11-20). Point at the top of a desk, a bedside table, a chest of drawers, a shelf, a TV unit, a console or a kitchen counter and click. Its foot sits right on that top, whatever its height (no gap, not sunk in). Pointed at the floor, it stands on the floor. On a bed, sofa or chair it turns red ("Overlaps the …"), because those are no tables. Move the desk later and the lamp goes with it, still on top. Make a chest taller and the lamp rises with it. At night it lights its desk and the wall behind it, and its shade glows.
- **Resizing** (drag a dot, or the size boxes in the Studio) works for every piece but the stairs and curtains.
  - Built again at the new size: the upholstered beds, wardrobes (also the 4 ft and 6 ft), closets, larder, fridges, desks, dining tables (all three — the chairs follow the seats), sofas, cots, rectangular rugs and the runner, planter boxes, the bookshelf, the chest of drawers and both TV units.
  - The rest stretch within limits: longer only for benches, consoles, racks and the study desk; the same shape for lamps, mirrors, plants and the round rugs.

### Your own furniture, finishes and textures (since 2026-11-20)

Staff can put their own 3D models, their own finish options and their own texture pictures into Plotline themselves,
in a few clicks. They then work exactly like the built-in ones.

**Your own piece of furniture** (a sofa model from your supplier, a lamp from Sketchfab, a desk you drew in Blender):

1. Open the library: in the 3D view **Edit ▾ → Furniture → Add**; in the Studio press **F** (the list is on the right).
2. Click **+ Add your own…** (just under the search box). A white box opens: **Drop a 3D model here**.
3. Drag the file from your computer onto the box, or click **Choose a file…**. Plotline reads: **GLB, glTF, OBJ, FBX,
   DAE, STL**. Best is one **.glb** file (Blender: File → Export → glTF 2.0, Format "glTF Binary (.glb)"). A .gltf that
   keeps its parts in separate files: export it as one .glb (Plotline says so).
4. The model turns slowly on the left, with its size under it in feet and inches (and metres) and how many triangles it
   has. On the right:
   - **Name** — filled in from the file's name; type the name your staff and buyers will see.
   - **Kind** — sofa, armchair, bed, lamp or light, plant, kitchen… It decides which group of the library it goes in.
   - **Which side is the front** — four arrows. Click the arrow of the side that is the front; the model turns so that
     side faces you, with a small arrow on the floor. Keep clicking until the front faces you.
   - **Where it sits** — **Floor**, **Wall** (hung at eye height, like a picture or a TV), **Ceiling** (hangs from it,
     like a pendant light) or **On a table** (stands on the desk, bedside or chest you point at, like the table lamp).
   - **Real size** — Width, Depth, Height, filled in from the file. Type one side (6'2", 1.9 m or 190 cm) and press
     Enter: the other two follow, so it never gets squashed. (A file drawn in centimetres is read as such.)
   - **It gives light** — tick it for a lamp: at night it lights the room, and deleting it takes its light away.
     Picking the kind "Lamp or light" ticks it for you.
5. Click **Add to the library**. A short line says where it is kept, and the piece is **in your hand at once**: point at
   the floor (or the wall, the ceiling, a table top) and click. Then it moves, turns (R), resizes, deletes and undoes
   like any other piece.

It is listed on top of the library under **Your own** (and in its room's group). Each of your own rows has a mark
**yours** and a **⋯** button:

- **Rename** — the same box, the name ready to type over. **Save**.
- **Change size** — the same box, the width ready to type over (the other sides follow). **Save**. Pieces already
  placed take the new size at once.
- **Remove…** — asks once: "Remove … from the library? Pieces already placed stay where they are." **Remove** or
  **Keep**. It leaves the library; to take a placed one away, delete it in Edit furniture.

**Too big:** a file over **30 MB** or a model over **2 million triangles** is refused, with the reason and how to make
it lighter (Blender, free: select the model → Modifiers → Add Modifier → Decimate, Ratio 0.5, Apply, export as .glb).
Over that, the walk would stutter on an ordinary laptop.

**Your own finish option** (a tile, a parquet, a paint your developer offers):

1. In the 3D view, staff mode: **Finishes**. Under each group (Bedroom floors, Living & dining floors, Wall paint, Bath
   walls…) there is **+ Add option**. Click it under the group the option belongs to.
2. Fill in:
   - **Name** (Teak parquet), **Brand** (Akij Ceramics), **Code** (their product code; leave it empty and Plotline makes
     one).
   - **Price difference ৳** — what it adds to the flat's price: 0 = included, a minus for cheaper (−12000). Commas are
     fine (52,000).
   - **Offered in** — the group again, if you want another one.
   - **Its look** — three ways:
     - **Colour**: click the colour square and pick.
     - **Texture**: any surface of Plotline's own list (oak, walnut, marble, tiles, stone, paving, deck, fabric…), and
       **Tinted** to give it a colour.
     - **Picture**: drop a photo of the surface (one tile, a plank, a piece of the stone) onto the box, or click it.
       JPG or PNG, up to 4 MB; a bigger picture is made 2048 pixels across for you. Then **One picture covers**: how
       big that photo is on the floor or wall, across × down (60 cm × 60 cm for one 60 cm tile). Type one side, the other
       follows the photo's shape.
3. **Add option.** It joins the group, is chosen at once, and the 3D shows it straight away.

Your own options have a **⋯** next to them (staff only): the same form, to change it, **Save**, or **Remove**.

**Where it is kept:** in this browser — the models and pictures too, however big. Signed in to your company (Studio →
⋯ → Sign in), it is also kept online for the whole company: colleagues see your pieces and options in their library
and Finishes, and **buyer links** you make with **Share link** draw them. A buyer link made while signed out shows your
own piece as a plain box of its size (the file was never sent online) — sign in and share again.

### Edit openings (doors, windows, sliding doors, open passages, low walls)

Works in Walk and in Dollhouse. The mouse stays free: drag empty space to look around.

- **Click one** to pick it. **Drag** it along its wall. **Drag a dot** to change width, height, or a window's sill (the height of its bottom edge above the floor). An open passage is picked by clicking anywhere in its opening; its side dots make it wider or narrower.
- Panel, bottom left: change its kind (a switch: **Door · Window · Slider · Passage**), type **Width / Height / Sill**, **Delete**, **Undo**.
- **Low walls** (since 2026-10-19) — a railing, parapet, planter edge or kerb: anything lower than 1.2 m (3'-11"). **Click it**: a blue box with a dot on each end appears, and the panel says "Low wall · 6'-9" long · 1'-6" high".
  - **Drag an end dot:** that end slides along the wall's own line, so the wall gets longer or shorter. An end joined to another wall leaves it, as with V in the Studio. A gap opens there, and the rooms on both sides become one (the Studio lists it under Issues, with **Extend** to close it again). Hold **Alt** while you drag to keep the corner joined instead: the wall it meets moves with it, so the room stays closed (a narrower veranda).
  - **Drag the wall itself:** it moves across, sideways, and its ends slide along the walls they meet. It snaps to nearby wall lines as in the Studio.
  - Panel: type **Length** (the end B moves) and **Height**; **Delete**; **Undo**.
- Keys: **Del** (or Backspace) removes what is picked · **Ctrl+Z** undoes (one drag = one step) · **Esc** unpicks it · **Alt** while dragging a low wall's end keeps its corner.
- A room whose furniture nobody arranged is laid out again for its new walls (a planter's bed fills the moved planter). A room you arranged keeps its pieces.
- The Studio, open in another tab, shows each change the moment you let go of the mouse, without reloading ("Changed in the 3D view … — the plan shows it now").
- An opening's curtains go with it: move or resize the opening and they follow, delete it and they go. (The old **Curtains** tick box is gone — delete the curtains themselves in Edit furniture.)
- The change is written into the Studio drawing too, so plan and 3D always agree.
- On a built-in flat it first asks to make that flat your Studio drawing (this replaces the drawing you had there).
- On a floor of a Studio project whose drawing is on other floors too, it then asks "Floor 3 only" or "All 4 floors" (§6, "One floor different from the others"). The change is also saved into the project at once, so the Building view shows it on that floor.

### Edit plan

Opens this flat or level in the Studio, in a new tab.

---

## 4. The Building view

- **Floors on the right** (a list headed "Floors"), top to bottom: **Roof**, the flat floors by number, **Ground**, **B1**, **B2**. The picked floor is the white row, and your own flat's floor has a small blue dot. On the tower, thin blue bands run round the picked floor's flat (they were gold until 2026-11-20).
- Picking a basement hides everything above it (a ground floor traced in the Studio too). The street round the tower and the next buildings stay (since 2026-11-20; before, they went with the floors above).
- **Top left** the box names the floor you picked: "Floor 2" over the flat's name and size ("Type A · 2703 sft"), the flats of another floor, or the level ("Ground floor", "Basement 1", "Rooftop").
- **Walk this level** (the blue button right under the floors) shows when the picked floor is a ground floor, basement, rooftop or common floor. Click to walk it.
- **Click a flat** to open it.
- Drag to turn, scroll to zoom.
- **Round the tower** you see the made-up street (§2, "Around the flat"): the next buildings a few metres past the plot on the sides with no road, the drawing's roads (a built-in building) or a made-up one, and the buildings across them right at the road's edge. With a site set in the Studio (§5, Site), the map's blocks and roads show instead. Both throw their shadows on the tower. A block between you and the tower is left out while you look (its shadow stays), so it never hides the floor you picked.

---

## 5. The Studio

You draw over a plan picture. The order is written on the right under **Steps**: load the plan → set the scale → trace walls → wall thickness → openings → rooms → check → export.

**What you see** (since 2026-11-20, the "marble" look): a light stone-coloured page. The plan picture lies on it like a sheet of paper, a little faded, so the walls you draw stand out on it in dark ink. Doors are drawn with their swing (a thin arc), windows as three thin lines between two short ends, as on an architect's sheet. Whatever you have picked turns **blue**; the wall, corner or opening under the mouse gets a **light blue edge** before you click. Room names are written in small capitals, the printed size under them. The tools are on the left, the details of what you picked on the right (white), and one thin line at the bottom says what the tool does.

### Top bar

One line (since 2026-11-20).

- **Left:** **Plotline** and the small word **STUDIO** (point at it: it says this browser is in staff mode; a click on either opens the front page), then the drawing's own fields.
- **Right:** Undo and Redo, then Auto-trace, **Preview 3D** (the blue button), Building, and **⋯** — a small menu with everything else: Import, Export, Export answers, New project, Site, Share link, Change list and Sign in.
- While the Studio is still empty, **Preview 3D** is a plain button and **Choose plan image…** in the middle is the blue one — there is only ever one blue button.
- In a window narrower than about 1000 px, the **Project** and **Area** fields step aside (widen the window to type them; they stay in the drawing).

Click **⋯**, then the item. **Esc** or a click anywhere else closes the menu. The keys still work without the menu: Ctrl+O imports, Ctrl+S exports.

| Control | What it does |
|---|---|
| Unit name, Project, Floor, Area (sft) | Plain fields saved with the drawing. They look like plain words; the mouse over one shows its box — click and type |
| Saved · just now · Saving… · Offline · will retry · Someone else saved · Not saved: … | After the fields, when signed in: where your work stands online (see "Accounts" below). A problem shows in red; a click opens the account card |
| ↶ Undo / ↷ Redo | Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) |
| Auto-trace | Tries to draw the flats for you from the picture. While it shows "Point at a flat": move the pointer over the plan, and the flat a click there would take glows (all of it, open floor too). Then click inside ONE flat to trace that flat, or press **Whole floor** (in the same box) to trace every flat of the floor and the lobby, stair and lifts between them in one go. It does not understand ground floors, basements or rooftops. |
| Preview 3D | Opens your drawing in the 3D view, in a new tab |
| Building | Shows / hides the list of your project's floors on the right. With no project open: start one (section 6) |
| ⋯ → Import… | Opens a saved drawing file (Ctrl+O) — or the architect's own file: see "Bring in the architect's file" below. In a project it goes into the drawing open now. |
| ⋯ → Export | Saves the drawing as a file (Ctrl+S). After an Auto-trace the file also holds the Check these rows, each with its picture box and its answers (see "Check these") |
| ⋯ → Export as DXF | Saves the drawing for AutoCAD or any drawing program (`.dxf`, in metres) — see "Give the drawing back" below |
| ⋯ → Export 3D model | Opens the 3D view in a new tab, which saves the furnished flat as one 3D model file (`.glb`) — see "Give the drawing back" |
| ⋯ → Print plan… | The plan as an architect's sheet, to print or save as a PDF — see "Give the drawing back" |
| ⋯ → Export answers | Saves, as a file (`plotline-answers.json`), every Check these answer you clicked in this browser: which sheet, which row, which button, when. It is the record an AI helper will later be tested against. The answers the Local AI gave (Ask AI) are in it too, each marked `"by": "ai"` with its model and reason; yours carry no mark |
| ⋯ → New project | Opens the floor list with the New project card (section 6) |
| ⋯ → Site | Where the building stands: find it on the map, click the plot (the buildings, roads and wind round it come in), set true north — see "Site" below. "open" shows beside it while the panel is open; click it again (or the panel's ×) to close |
| ⋯ → Share link | Makes a buyer link and copies it. Signed in: made for your company, nothing asked. Not signed in: asks once for the staff key. Needs the online database. |
| ⋯ → Change list ↗ | Opens `/changes` in a new tab. Needs the online database. |
| ⋯ → Sign in / your email | Your account, your company's projects online, its members and the buyer links — see "Accounts" below. Needs the online database. |

**Loading the plan picture:** with nothing drawn yet, the middle of the Studio says **Start with a plan**. It shows a dashed box (drop the picture on it — or anywhere on the page — or click **Choose plan image…**; PNG, JPG, WEBP or TIFF, up to 10 MB — an iPhone's HEIC photo only in a browser that opens it (Safari), else a message says how to get a JPEG; the developer's brochure PDF (see "A PDF" below); the architect's IFC, DXF, PDF, SVG or 3D model — or a folder or .zip of them — can be dropped there too) and, beside it, the **New project** card (section 6).

**The tools** are the small drawings in the strip on the left, top to bottom: Select (an arrow), Scale (a measuring line), Wall (a wall corner), Arc (a curve), Opening (a door and its swing), Room (a named room), Column (a filled square), Furniture (a sofa). The one you are on is white. Point at one and its name and key show beside it ("Wall  W") — press that letter to pick it. A faint one is locked until the scale is set ("set the scale first (S)").

### The status bar and the Keys sheet

The thin line at the bottom says, on the left, what the tool you are on does — one short line (the mouse over it shows the whole sentence). In the middle, while you draw or drag: the length, the angle and what the point sticks to. On the right: how long you have been tracing (it was the ⏱ in the top bar), the plan's scale (1 px = … m) and the zoom.

**Keys** (bottom right) — or the **?** key — opens a sheet with every key in one list: the tools, drawing, picking and moving, the view and the file keys, with the tool you are on explained in full at the top. **×**, Esc or a click anywhere else closes it. The full list with every detail is [KEYS.md](KEYS.md).

### Accounts — signing in, saving online, members, links (top bar → ⋯ → Sign in)

Without signing in, your work is kept in this browser only (section 9). Signed in, it is **also** kept online, in the database, for your company, by itself, as you work — the plan pictures too. Setting it up (once, by the founder): [SETUP_ACCOUNTS.md](SETUP_ACCOUNTS.md).

**Signing in** (no password):

1. Top bar, right: **⋯** → **Sign in**. A card opens (its **Close**, or **Esc**, closes it).
2. Type your email, click **Send me a link**. The card says **Check your email**.
3. Open that email **on the same computer, in the same browser**, and click the link. The Studio opens with your email in the **⋯** menu instead of **Sign in**.
4. If an owner of your company invited your email (Members, below), you are in the company at once. If not, the word says **Not saved: not in a company yet**: ask an owner to invite you, then press F5.

**Saving** happens by itself 2 seconds after you stop changing things. What is saved: the project open in the Studio (all its floors and drawings), or — with no project open — the drawing you are on. **The plan pictures go with it**: each drawing's picture is sent once to your company's private folder online, and a colleague who opens the project gets the picture under the walls, without dropping it again. Buyers never get the plan picture. The word next to the drawing's name (click it to open the card):

| Word | Means |
|---|---|
| **Saving…** | Your latest change is on its way |
| **Saved · just now** (or **· 4 min ago**) | The online copy has exactly what you see (and this browser has it too) |
| **Offline · will retry** | No internet. Keep working: it is in this browser, and it saves by itself when the internet is back |
| **Someone else saved** (red) | A colleague — or you, in another tab — saved the same project after you opened it, and yours was **not** saved over theirs. Click the word: **Open theirs** (their copy replaces yours here) or **Keep mine** (yours becomes the newest; theirs stays under **Earlier saves**). Nothing is lost either way |
| **Deleted in the cloud** (red) | Someone deleted it meanwhile. Click the word → **Save as new** keeps your copy as a new one |
| **Not saved: …** (red, anything else) | The reason in words (for example too big: the most is 5 MB). Your work is still in this browser |

**The card** (click the word, or **⋯** → your email): your email and your company (owner or staff), then three parts — **Projects**, **Members**, **Links** — and **Sign out** (saves what is waiting, then signs out; your work stays in this browser).

**Projects** — your company's projects and drawings, last saved first, with who saved last ("by a colleague") and when. The one open now sits on a grey row.

- **Open** — puts it in the Studio in place of what is open (what is open is saved first; if it could not be, you are asked). Its plan pictures come down as each drawing opens.
- **Rename** — its name, for everyone.
- **Earlier saves** — every save of it, newest first (version, when, you or a colleague). **Open this save** puts that older copy in the Studio — with the plan picture it had then; it becomes the newest when it saves. Nothing is ever lost: the later saves stay in the list.
- **Delete** (with a question first) — takes it off the list for everyone in the company. This browser keeps its own copy, and every save stays in the history (the founder can bring it back).

**Members** — everyone in your company, owner or staff, and the people invited who have not signed in yet. Everyone sees the list; only an **owner** sees the buttons:

- **Invite**: type their work email, pick **Staff** (does the work: tracing, saving, sharing) or **Owner** (can also invite and remove people), click **Invite**. Plotline sends no email of its own: tell them to open the Studio, click ⋯ → **Sign in** and use that email — **Copy this for them** copies that line. They join the moment they sign in. **Take back** cancels an invite not used yet.
- **Make owner** / **Make staff** — changes someone's role. A company always keeps at least one owner, so the only owner never sees **Make staff** on themself.
- **Remove** (asks first) — takes someone out of the company. They keep their account but reach nothing of the company's; everything they saved stays. Nobody can remove themself (another owner can).

**Links** — every buyer link made from what is open (with **⋯** → **Share link**): which flat and floor, when, by whom, how often buyers opened it (your own company's opens are not counted), how many notes and choices came back, and whether it was turned off.

- **Copy link** — copies it again.
- **Turn off** (asks first) — the link stops working for good: whoever has it is told the flat is not available; what they wrote stays in the **Change list**. To share again, make a new link.

Two people can work in the Studio at once on **different** projects without ever noticing each other. On the **same** project, the second save is the one that asks ("Someone else saved" above) — also between two tabs of one browser.

### Site — where the building stands (top bar → ⋯ → Site)

The panel opens top right, and a blue **north arrow** appears in the middle of the plan.

1. **Find the place:** type an address ("Banani, Dhaka", "Road 11, Banani") and press **Find** (or Enter) — or paste the plot's position as "23.7903, 90.4077" (in Google Maps: right-click the plot, click the numbers to copy them). A map picture shows round it.
2. **Zoom and pan** if you need to: the mouse wheel over the map (it zooms where the pointer is) or **+ / −** in its top-right corner, five steps; drag the map to slide it. Nothing is fetched again, the blocks, roads and your drawing stay on it.
  - **Click your plot** on the map. The buildings and roads within 250 m and the wind of the last ten years come in (a few seconds; up to half a minute when the map server is busy). On the map: grey shapes = buildings (dashed outline = height guessed), dark lines = roads, blue = your drawing, the blue dot = the plot.
  - The middle of your drawing stands on the dot; a building the map has on that spot (within 1 m of your drawing — the old house, or this very building if it is already mapped) is left out of the 3D and drawn dotted on the map.
  - Clicking the map again moves the plot (it asks first: what you typed or deleted is lost).
3. **Set true north:** drag the blue arrow on the plan (anywhere along it) until it points the same way as the north arrow printed on the sheet; drag its round dot to move it over that arrow first. Or type the degrees in **True north** (0 = up the page, 90 = to the right). The drawing on the map turns with it — check that it sits on the plot the right way round.
4. **Fix the neighbours:** click a building on the map: its height and where the height comes from show — type the right height (metres) in **Height**, or **Delete block**. Click a road: **Delete road**.

**Where the heights come from:** the map's own height when it has one; else its number of floors × 3 m; else **a guess: 3 floors = 9 m** (most buildings in Dhaka have neither on the map — in Banani 396 of 407). A height that does not fit its floor count (60 m on 5 floors) is taken as a typo and the floors are used. **Fetch again** asks the map once more (your deletions and typed heights are lost). **Remove site** takes it all away: the 3D shows the made-up street again.

It is saved with the drawing (and on every drawing of the project open, one site for the building): Preview 3D, the Building view and buyer links show it without asking the map again, also offline. The map and the buildings are © OpenStreetMap contributors; the wind is Open-Meteo's. All free, no account.

### Bring in the architect's file

Instead of a picture to trace, the architect's own file can be dropped on the Studio (or picked with ⋯ → **Import…** / **Choose plan image…**). What happens depends on what the file holds: A drawing that came from a file has no picture behind it: the walls ARE the file, so the "Start with a plan" box does not show (the status bar says "no picture lined up"). A picture can still be dropped on the page later to see the sheet behind the walls.

| File | What it holds | What happens |
|---|---|---|
| `.glb`, `.gltf`, `.obj`, `.fbx`, `.dae`, `.stl`, `.3dm` (Rhino), `.3ds` (3ds Max, ArchiCAD, SketchUp), `.kmz` (SketchUp's Google Earth file), `.wrl` (VRML), `.ply` | A 3D model of the building: the **outside shape** only (facade, balconies, roof) — no rooms | The shape is attached to the drawing open now, centred on it. Preview 3D → the Building view shows that shape standing round your flat instead of the plain boxes, and in the walk you see its facade through the windows. A model that keeps its pictures (or, for a `.gltf`, its 3D data in a `.bin`) in other files: **drop the whole folder, or a `.zip` of it**, or pick all its files together with Import… — dropped alone, the shape comes without those pictures and the list says which ones were missing. Compressed models (Draco, meshopt) are unpacked. |
| `.ifc` (a BIM model: a building model that holds its walls, doors and rooms) | The storeys with their walls, doors, windows, rooms and columns — and the outside shape | One storey: it opens as the drawing (like Import). Several: a whole **project** is made in one go — basements, ground floor, floors 1…n and the rooftop (the top storey when it is named Roof / Terrace or holds no room) each with its storey as its drawing, the outside shape saved once for the building; the first floor above ground opens. Every wall and room is yours to change, as a traced plan is. |
| **A PDF** (`.pdf`): a brochure, or a drawing printed from the architect's program | Its pages | A PDF of several pages first shows **Which page is the floor plan?** — its pages as small pictures; click the plan's page (× or Esc closes it). One page is used at once. A page drawn in lines that make a clean plan opens as the drawing (its own walls, doors and names); otherwise — a page that is a photo, or whose lines do not make a clean plan — the page becomes the **plan picture**, ready for the scale (S) and **Auto-trace**. The message at the bottom offers the other way: **Use it as a picture instead** / **Read its lines instead**. |
| `.dxf`, `.svg` (a vector drawing: made of lines, not a photo) | One floor's lines and texts | It opens as the drawing: walls, openings and room names read from the file, to check and finish as usual. A DXF's walls may be pairs of lines, polylines, hatches or AutoCAD multilines (MLINE); curves (arcs, splines) follow their real shape. An SVG's groups are read as its layers (a group called "Walls" or "A-WALL" holds walls); a PDF page or an SVG has no scale of its own, so the printed dimensions give it (else the printed room sizes, else the drawing's own units are guessed from its size) — check it with S. |
| `.dwg` (AutoCAD's own file) **once DWG is turned on** (Docs/SETUP_FORMATS.md, 10 minutes, free) | One floor's lines and texts | It is sent to an online converter (CloudConvert), comes back as a DXF and opens like one; the box at the top says "converting the DWG to DXF". 10 drawings a day on the free plan. Not turned on: refused as below. |
| `.dwg`, `.rvt`, `.pln`, `.skp`, `.max`, `.blend`, `.dwf` (locked files) | — | Refused, with the one-click export to ask for instead: AutoCAD → Save as DXF; Revit / ArchiCAD → export IFC; SketchUp / 3ds Max / Blender → export as glTF, OBJ or FBX (common 3D model files), or IFC. Why: Docs/FORMATS.md §3. |
| A **folder**, a **`.zip`**, or several files at once | Whatever is inside | The best file in it is opened (an IFC first, then a 3D model, then a DXF / PDF; an architectural IFC before a structural one), the rest are its pictures and data. A zip of plan pictures opens its first picture. |

While it reads, a box at the top of the sheet says what it is doing, with a thin bar for how far it is — for an IFC: "opening the file (64 MB)", "building the 3D (53 %)", "walls, doors and windows", "rooms", "floor 3 of 7". The rest of the Studio keeps working meanwhile (a 64 MB building takes about half a minute). **Cancel** in that box stops the reading and leaves the Studio as it was. Afterwards the panel on the right lists **What was read from the file** in plain words — the file's unit, what was guessed (a `.obj` or `.stl` names no unit or up axis: the size says millimetres or metres, up is taken as Y), what the file lacked — until you click **Dismiss**.

**Outside shape** (in the panel while the drawing has one): its name and triangle count (how many small flat faces make up the model), then **Offset x / y (m)** — slide the shape over the plan until its walls sit on yours; **Turn (deg)** — turn it (clockwise on the plan); **Floor height (m)** — how high this drawing's floor is inside the shape (an imported storey has it from the file; a plain model starts at 0 = the model's lowest point). Each is one step for Ctrl+Z. **Remove outside shape** deletes the model from this browser and from the drawing. In a project every drawing shares the building's shape (each at its own floor height); a drawing with its own keeps it.

The model is kept in this browser only (like the pictures); an exported drawing file names it but does not hold it. The Lite quality skips a shape over 500 000 triangles and says so.

### Give the drawing back: DXF, 3D model, printed plan

What a developer or their architect asks for, from the ⋯ menu (top right):

- **Export as DXF** saves the drawing as a `.dxf` file that AutoCAD and every drawing program opens, in metres. Each part
  is on its own layer: **WALLS** (each piece of wall between openings as a closed outline, corners filled), **DOORS**
  (each door with its leaf and its swing; a sliding door), **WINDOWS**, **COLUMNS**, **TEXT** (room names and their
  printed sizes) and **ZONES** (the flush lines of a level: parking bays, lawn edges). Dropped back on the Studio
  untouched, it opens exactly as it was ("Written by Plotline and not changed since"). Once someone changes it in a
  drawing program, it is read from its lines like any architect's DXF — close, not exact (for Type A: 103 walls back
  for its 90, 30 of its 33 openings, 21 of its 27 rooms; levels lose more, as their zone lines are not walls).
- **Export 3D model** opens the 3D view in a new tab; once every room and picture has arrived it saves the furnished
  flat as one `.glb` file (walls, floors, ceilings, doors, windows, furniture with their pictures; not the street or the
  sky), and says "Saved …". A furnished flat is about 60 MB (Type A: 63 MB, a million triangles). Staff can also save it
  from any flat in the 3D view: **Edit ▾ → Download 3D model**. Blender, 3ds Max, SketchUp and any glTF viewer open it.
- **Print plan…** shows the plan as a sheet: the walls filled black, doors with their swings, windows, the names and
  printed sizes, and along the foot the project, the drawing and floor, the area, the scale, a scale bar and the north
  arrow. Pick the **Paper** (A4, A3, A2, A1) and the **Scale** (1 : 50, 1 : 100, 1 : 200 — a scale the plan does not fit
  on that paper is greyed); **Print** opens the browser's print window, where **Save as PDF** makes the PDF. Esc, × or
  **Close** shuts the box.
- The buyers' notes and choices: ⋯ → **Change list** → **Export CSV** (a spreadsheet file).

### The tools (the strip on the left; press the letter to pick the tool)

Every tool except **V** and **S** stays locked until the scale is set. A drawing that already has walls (a built-in level, a drawing file you opened) is in real sizes already: its tools are open at once.

**V — Select**
- Click a corner, wall, opening, room name or column to pick it.
- **Pick several and change them together** (2026-10-19): **Shift+click** adds a wall, window, door, passage or column to what is picked — Shift+click a picked one again to take it out. **Drag on an empty part of the plan** to draw a thin dashed box: everything it touches — walls, windows, doors, passages, columns — is picked when you let go (Shift+drag adds to what is already picked).
  - **Ctrl+A** picks every wall. **Esc** (or a click on an empty part of the plan) unpicks. The bar at the bottom says what is picked: "3 walls, 2 windows selected". The panel on the right then shows the boxes the picked things share (see "The right-hand panel"); a value typed there changes every one of them at once, and one Ctrl+Z puts them all back.
  - **Del** deletes them all (one Ctrl+Z brings them all back), the arrow keys nudge them all together. Dragging still moves only the one thing under the mouse.
- Drag to move. **Shift** = no snapping.
- Drag the end of a picked wall to make it longer or shorter. **Alt** = the walls joined to it follow.
- **Alt** + drag a corner of a wall that is not picked: that one wall comes free of the corner (the others stay).
- **Make a wall thicker or thinner with the mouse** (2026-10-16): a picked wall (one wall picked) shows a dot in the middle of each long face. Drag a face's dot out to thicken the wall on that side, in to thin it — the other face stays where it is, in whole inches (1" at least). The whole straight wall it is part of changes with it (the pieces a T-joint split it into), and the walls at its ends get longer or shorter to stay joined, as when you drag a corner. The Width box on the right still takes a typed size. Ctrl+Z undoes the whole drag.
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
- **What the cursor sticks to** (the status bar says which — also before the first corner): a corner, a wall's centre line ("wall — will split"), a column (its centre, corners and sides: "column"), and the two sides of a thick wall ("wall face"). Corners and centre lines pull from 7 screen pixels, columns and wall faces from about 5. **Shift** = no sticking. Snapping to a centre line is offered, never asked for: a wall may meet a column or another wall off-centre.
- **Walls that touch are joined — no gluing pieces needed** (founder 2026-10-09: "pillar or not, a wall touches another wall, that is it, it is a box"):
  - A wall that touches a **column** — on its side, its edge, its corner, or ending inside it — closes the room there. The room goes round the column (its area leaves the column out). No "loose end" mark.
  - A wall that stops on **another wall's face** (from either side, square or at an angle) is joined to it: under the hood it runs on to that wall's middle line. You still see and click ONE wall.
  - A wall end put down **a little short** of a wall or a column — up to 6 inches, or as much as that wall is thick — is carried on to it along its own line when you click it down, when you drop a dragged end, and by Join walls (also after Auto-trace and when a drawing is opened). Further than that it stays where you put it.
- While drawing, **type a number** to set the exact length; **Tab** switches to the angle.
- **Backspace** removes the last piece. **Esc** stops.
- **T** switches thin wall (5") / thick wall (10").

**A — Arc** (2026-10-16)
- For a curved wall: **click where it starts, click where it ends**, then move the mouse — the curve bends through the pointer (like a curve handle in Photoshop). **Click** (or press, drag and let go) to lay it. **Esc** cancels.
- It lays a chain of short straight walls along the curve — at most 10° of turn each, none shorter than about 1 foot — joined end to end, so you never place the small pieces yourself. The status bar says how many before you click.
- Its two ends stick and join like a W corner (onto a wall, a corner or a column; the status bar says what each click will stick to — "snapped: wall — will split" — and, for the end, how far it is from the start), so an arc from one point of a wall to another closes a curved bay you can name with R.
- The pieces are the W tool's type (wall, low wall, kerb, zone line — keys 1–4 in W) and 5" thick. After laying they are all picked: **T** makes them all 10", or type a width on the right; Del removes them all.
- Rooms, doors, the 3D and Auto-trace see the arc as its straight pieces (a door goes on one piece).

**O — Opening**
- Choose: Door 2'-6", Door 3'-0", Window 4', Window 6', Slider 6', Slider 8', Passage (keys 1–4 for the kind), or **Glass wall**.
- **Glass wall**: click a wall and all of it becomes glass, floor to top. For glass on only part of a wall, drag the glass's end shorter, or first split the wall (W, click on it).
- Point at a wall — a preview shows what you will get — click.
- Kerbs and zone lines do not take doors or windows.
- With a door picked: **H** flips the hinge side, **Shift+H** flips which way it swings.
- **Curtains**: a window or sliding door in a bed, living, dining or study room gets a pair of curtains by itself when the other side is outside (a veranda, a shaft, open air). A glass wall never gets them. They are a piece: change or delete them with **F** (below) or Edit furniture in 3D; they follow their window when you move or resize it, and go when you delete it. A window switched off with the old tick box (drawings made before 2026-10-14) keeps none until you add a pair from the library. Doors and passages never get curtains by themselves; add a pair from the library on any of them.

**R — Room**
- Click inside a closed room. A small box opens: **Room name**, **Kind** (guessed from the name), **Printed size** (type what the sheet prints there, e.g. `12'-0" × 14'-2"`; leave it empty if the sheet prints none — the tool never fills it in for you, so the size check in "Check these" is always sheet against drawing, and a size you type gets its own size row there when the room does not match it; it accepts the room when either its main rectangle — the biggest rectangle that fits inside it, door recesses and nooks left out — or its whole outline matches what the sheet prints), **Floor level**, **Ramp** (tick it, type the level at the far end, pick the direction).
- **Save**, or **Remove** to take the name off.
- **Clicked where no closed room is?** R looks only at the room around your click (the wall ends within about 26 ft of it). If one wall end there stops a little short (the same reach as in W — Wall), R joins it (one Ctrl+Z undoes it) and opens the name box. Otherwise it says which wall end keeps this room open, how far short and where, and rings it: "Not closed yet: the wall end 2'-3" up-left of your click (ringed) stops 0'-7" short of the wall ahead — drag its end onto that wall". If no wall end nearby would close it: "a wall is missing. Draw it with W." A loose wall end somewhere else (a stub beside the ODU) is never the reason and is never ringed.

**C — Column**
- Click = a standard column. Drag = a column of the size you drag.
- **Pick a column** by clicking anywhere on it — also where a wall runs through it (with V, or with C).
- **Size it with the mouse**: a picked column shows eight dots — its four corners and the middle of its four sides. Drag a **side** (its middle dot or anywhere along it; the pointer becomes a double arrow) to move that one side — the other sides stay, in whole inches.
  - Drag a **corner** dot to move **that corner alone** (2026-10-16): the column becomes a tapered or wedge-shaped one, as some sheets draw it, with straight sides. While you drag a corner its two sides stick a little when they come within 3° of square or of parallel to the side across — a small move snaps it back to a plain rectangle; drag further and it lets go.
  - Both stick to walls and corners as a corner does. **Shift** = no sticking.
- The Width / Depth boxes on the right are for typing an exact size. On a tapered column they show its outer size, and typing one stretches the whole column about its middle.
- The 3D builds the column from its four corners. (Rooms around a tapered column, and the Building view, still use the rectangle around it.)
- Walls stick to a column's sides, corners and centre. A wall that touches a column anywhere closes the room there (see W — Wall).

**F — Furniture**
- Click a piece, drag it, click where it should go. **R** turns it. **Del** deletes — also the piece in your hand (a refused drop keeps it there). Arrow keys move it one 3-inch square.
- **A click selects the piece under the mouse** — the one drawn on top: a wall cabinet or a hood over its counter, cushions over the sofa. A thin print or a wall TV is picked when you click within a few pixels of its line. A click whose mouse slides up to 6 pixels is still a click: the piece is selected, never moved. Drag further and the piece is in your hand; a drag on cushions or a TV standing on its unit moves the piece under them.
- **A wall piece** (TV, picture, AC, clock, mirror) picked with F shows **Height from floor (m)** on the right: type how high its bottom edge should be (1-inch steps, between the skirting and the ceiling; refused over a window or in a doorway). On the plan you only see it from above, so dragging moves it along the wall; in the 3D view you can drag it up and down.
- **Curtains** show as a thin strip along their opening: click one, drag it along its wall, **Del** removes it. A picked pair shows a dot at each end: **drag a dot** to make it wider or narrower on that side only (5 cm steps from the opening's edge, 0.4 to 6 m) — the same as in the 3D view; the **W** box on the right types an exact width (both sides move). In **Add a piece** type *curtains* (or open Living / Bedroom) and click **Curtains**, then click beside a window, sliding door, door or passage: a pair hangs on it.
- **Add a piece** (right-hand panel, while F is on) is the library — the same list as the 3D view's Add (see **The library** in §3): search or open a group, click a piece (or **Enter**), then click the plan where it goes. **R** turns it, **Esc** cancels.
- **Reset to preset** puts one room back to the automatic layout; **Reset all** does every room.

**Hold instead of switch:** hold **W**, **O** or **R**, use the tool, let go — you are back on the tool you had.

### Flats in a whole-floor drawing

**Auto-trace does it for you (2026-10-09, Level 4).** Press **Auto-trace**, wait for "Point at a flat", then:
- **Whole floor** (button in the box at the top of the plan): every flat on the sheet and the shared lobby, stair and lifts, in one draft. **As many flats as labels** (2026-10-16): each flat label printed on the plan is one flat, found around its label (Foysal Smart Garden: Unit A + Unit B; CPDL Charukabya: Unit A + Unit B; Finlay Chayaneer: Type A, B, C, which print no room names at all); a studio counts though it has no bedroom.
  - A sheet whose only flat label is its title ("UNIT A: 3910 SFT") is one flat (BTI Magnifico, was 3). With no flat label, the flats are found from the living / dining / kitchen names as before. Each flat comes out tinted and named: by its printed type when the sheet has one ("TYPE-A ±2736 SFT" → **Type A**; Sheltech L2's red TYPE-B is read too; "Unit A: 1375 Sft" → **Unit A**, the sheet's own word — 2026-10-18, it came out "Flat 1" before), else **Flat 1, Flat 2, Flat 3** from west to east.
  - The lobby, stair and lifts are in no flat. Sheltech Level 2: Type A + Type B + the core. BTI 2nd floor: three flats (the big one and the two small ones above it). A room whose name is printed but whose door Auto-trace did not find still goes into the flat it shares the most walls with — and since 2026-10-18 evening so does a veranda that touches the flat only through such a room (Jahan Lodge's Master Ver.).
- **Before you click, the flat glows** under the pointer: everything the click would take, its closed rooms outlined and the open floor around them (rooms whose walls are not closed yet) tinted the same, as one area (since 2026-10-16; before, only closed rooms glowed, so on a sheet drawn in thin lines nothing did). If the glow runs into the flat next door, the click would take that part too.
- **A flat holds its own label, never another flat's** (2026-10-16). The flat labels printed on the plan — an area ("Unit A: 1375 Sft", "±2736 SFT") or a flat's name standing alone ("UNIT-B", "TYPE A") — mark the flats: a click never takes the floor around another flat's label, even where a wall between the two flats was not found (the open floor between two labels is split halfway). A key plan's tiny "TYPE: A" and a title block's list do not count.
- **A flat ends at its front door; one flat, one kitchen** (2026-10-19). The lobby, corridor, lifts and stair between the flats belong to no flat: from each LOBBY / LIFT / STAIR word Auto-trace follows the shared floor with every door shut, so a flat stops at its own front door even where a wall beside the lobby was not found (Sheltech Kanakchapa's long lift lobby no longer joins the flats on both sides of it), and a small closed space (up to about 8 m²) against a named stair, with no room name read in it, is the lobby too — a landing whose LOBBY word was not read.
  - **How many flats Whole floor makes:** as many as the flat labels name. A legend line "TYPE C : 1469 SFT" and the plan's "TYPE-C" are one flat; "UNIT A & B 3925 SFT" with a "Unit A" beside it is ONE flat, called **Unit A & B** (Sheltech Banani Level 7 — it came out as four flats before).
  - One label on the whole sheet = one flat, whatever rooms it holds. Only where more kitchens than labels were read (labels the reader missed: Kanakchapa's TYPE-D and TYPE-B) does each extra kitchen start a flat — a dry, wet or service kitchen does not count — and then a flat that took a second kitchen, living, dining or master bedroom more than 4 m from its own is split where the two meet.
  - With no flat label read at all, each living / dining / kitchen with a bedroom is a flat, as before. A flat found around its own TYPE label on the plan is called by it (Kanakchapa: Type G, F, E, C, A; the two whose labels were not read are Flat 1 and Flat 2) — a legend's figure is matched to it by its letter, never by its place on the sheet.
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
| Shift+click (V) | Adds to what is picked, or takes a picked one out |
| Drag on empty plan (V) | A box: picks every wall, opening and column it touches (Shift: adds) |
| Ctrl+A | Picks every wall |
| Ctrl+D | Copies the picked walls and room names |
| Del | Deletes what is picked (all of it, one Ctrl+Z brings it back) |
| Arrow keys | Nudge what is picked 1 inch (Shift = 1 foot); with F, the picked piece one 3-inch square |
| 0 | Fit the whole plan on screen |
| Mouse wheel | Zoom |
| Space + drag, right-drag or middle-drag | Slide the plan |
| Esc | Cancel / close / unpick (with the ⋯ menu or the Keys sheet open: closes only that) |
| ? | Opens or closes the Keys sheet (every key) — the same as **Keys** at the bottom right |

### The right-hand panel

- **Steps** — the checklist. It ticks itself (a small tick); the next step to do is marked with a blue dot and written darker; you cannot click it.
- **Selection** — the details of what you picked, to type exact values:
  - *Corner* — position.
  - *Wall* — its type (Wall / Low wall / Kerb / Zone line), width, height, **Stands alone** (a screen or decoration wall that is not meant to close a room), length, copy, delete.
  - *Opening* — kind, width, height, sill, distance from each corner; for doors, hinge side and swing.
  - *Column* — width, depth (a tapered column: its outer size, typing stretches it), delete.
  - *Room name* — name, kind, **Flat** (which flat of the drawing it is in — see "Flats in a whole-floor drawing"), printed size, floor level, ramp.
  - *Several things picked* — the top line says what ("3 walls, 2 windows selected"). For the walls: type (Wall / Low wall / Kerb / Zone line), height, width, **Stands alone**. For the openings: kind (Door / Sliding door / Window / Passage), width, height, sill. A box shows the value when they all have the same one; an empty box marked "mixed" means they differ — type a value and every picked wall (or opening) takes it, one Ctrl+Z for all. An opening the new size does not fit on its wall stays as it was, and a note says how many did not change. **Delete them all** removes everything picked.
- **Check these** — after Auto-trace: the things it was unsure about. Each has fix buttons and **Looks right**.
  - **The room count** (the line with an amber dot at the top): "5 of the 8 room names read on the sheet are closed and named — missing: Bed 4, Bed 2, Ver", then what the closed rooms add up to against the printed flat area. It counts the room names Auto-trace could READ inside the traced flat (not the next flat's); a name it missed is not in the count — its room shows as an "Unnamed space" row instead.
    - Auto-trace reads every word it could not make out a second time on a closer view, and reads every closed room it found no name in as a whole, so far more names come through (Sheltech L2 Type A: 14 names read, was 8). A name printed on a room's edge or in its door nook names that room, and so does a name standing inside a room that only closed when the walls were joined — no row for those.
    - Guessed names ("Toilet 3" from a drawn WC) and "Space N" are numbered west to east, the same every time you trace the same sheet, and a guessed name never takes the number a printed room already carries. A guessed kind is given only where the room is big enough to be one (2026-10-18): a 3 m² toilet with the bedrooms' floor colour is no longer called "Bed 3" — it stays "Space N" with its Unnamed space row (type the name with Name it).
    - The flat's "TYPE-A ±2736 SFT", when it is printed inside a closed room of the flat, is put on the drawing as a label that names the flat (the tint then reads "Type A"); printed in an open foyer it is not — add it with R. The flat area is taken from a "TYPE-A ±2736 SFT" printed inside the flat, else from the sheet's title block (2026-10-14): one flat on the sheet — the one area figure printed beside or under it ("TYPE A 2279 SFT", "Unit A 1365 sft", "2023 SQT (Approx.)"); two or more flats — only when the sheet prints exactly one figure per flat, given west to east (or top to bottom); a title naming two figures ("2703 SFT & 674 SFT", BTI 2nd floor) goes to no flat.
    - A figure bigger than the whole sheet at its scale is a misread and is never used (2026-10-18: Assure Phera's "Floor Area- 1691 Sft." was read as 71 697 sft and the Area box showed it). When none is read it says "no printed flat area was read on this flat" rather than use another flat's — and the top-bar area box then shows the closed rooms' total: type the right figure there.
    - The line changes with every fix and says "All … are closed and named" when none is left. Because only the names it READ are counted, "all 9 … closed and named" could show on a flat with half its floor missing; now, when the closed rooms add up to less than 70 % of the printed flat area, the line says so in orange (2026-10-14): "… But its closed rooms add up to only 524 sft of about 1150 — the sheet prints more rooms than were found."
  - **One row per missing room**, first in the list, saying which room and where. Click the row and the plan goes to it. Its button:
    - **Name it Toilet 1** — "Space 4 — printed name Toilet 1 is 0.6 m away": the unnamed room next to (or under) the printed name gets that name, kind and printed size.
    - **Close it — zone line / railing / carry N walls on** — "Veranda 1 is open — no closed room around its name" or "Ver and Bed 2 share one space — split here?": draws the one missing line along the sheet's lines (a railing — a low wall — on a veranda's open side; a zone line, which shows nothing in 3D, anywhere else), or carries the loose wall ends around the name on to the wall ahead, and names the room. The faint line on the plan shows what it will draw before you click. It picks the closing that gives the room nearest its printed size (the smallest, when no size was read). If the line is really glass or a wall: click it, pick Wall in the panel, then O → Glass wall.
    - **Show me** — nothing closes it in one click (no walls were found around that name): the plan goes there and the Wall tool is picked. Draw its open sides (keys 1–4: wall, low wall, kerb, zone line); once it is closed the row offers **Name it**.
  - **Unnamed space (5.8 m²) rows** — a closed room with no name read (also one left with no label at all): **Name it** opens a box on the plan, type the name you read on the sheet, Enter. **Join it to Dining** takes out the thin wall between it and that room (only offered when that leaves no new problem) — use it for a strip that is really part of the room beside it, not for a room whose name was just not read. Two rooms of one name beside it (two toilets): each button says which side of the space its room is on — **Join it to Toilet (left)**, **Join it to Toilet (right)** — and how much wall goes when both are on the same side (2026-10-18; before, two identical buttons).
  - Every fix is one Ctrl+Z.
  - **A big drawing** (a whole floor of five or six flats, 1 000 walls or more, 700 rows or more; 2026-10-19): all the rows show at once and their buttons fill in a few at a time while you work — first the row you click, then what is in view — and the list says "Working out the rows' fixes — 320 rows left…".
    - The page stays usable meanwhile; a row's button works as soon as it shows. After a fix only the rows near it are worked out again; the others keep their buttons. Export saves the file at once (2026-10-19 evening): a row still being worked out goes in with its picture box but no answers, marked `"answersPending": true`, and the message says how many — export again once the list is done for them all.
    - Tried on Sheltech Windflower Tower 1 (532 rows): the first buttons came 6 seconds after Whole floor and all of them within a minute; a row's Close it took under 3 seconds.
  - **What a row keeps, and your clicks kept as a record** (2026-10-15, so an AI helper can later answer rows the way you do — none is switched on). Every row is saved with the drawing (in this browser, and in the Export file) together with the **picture box** around it — the piece of the plan picture an AI would be shown: the row's spot, what it is about and what its buttons would change, with about a metre around it so the walls show — and its **answers**: the same buttons you see (Close it, Join it to …, Make it a wall, Take it out, Show me, Looks right), each with a fixed name.
    - A row's buttons do exactly what they did; after any edit the row's answers are worked out again on the plan as it is now. **Every answer you click is kept as a record**: the sheet (file name and size), the row's text, the button and the time, added at the end of a list and never changed afterwards — Looks right and Show me count as answers too.
    - **Export answers** (top bar → ⋯) saves that list as a file. Auto-trace also keeps where the print it could not use stands — a word it read as a room but did not trust, a room's size it could not read, the spot over a size where no name came out — and which way to turn each one to read it upright; only their places are kept (no pictures), one list per sheet.
    - Typing a name with Name it is not kept as an answer yet.
  - **Sizes in a table beside the plan** (2026-10-14). Many brochure sheets print the room sizes in a list beside or under the drawing ("SUITE 1   13'-4" x 14'-0"", or a numbered legend "01. LIVING 10'-00" x 09'-06"" with only "01" in the room).
    - Auto-trace finds such a list (three or more rows of a room name and a size, one under the other, away from the walls) and the floor-stack chart (19 … 01, G, B1): it never traces walls in them and never counts their words as rooms of the flat.
    - Each row's size goes to the room of the same name on the drawing (the number's room for a numbered list), exactly as if it were printed in the room — the size row then checks it. A size it cannot read for sure is not used.
    - A row whose name is on no room of the drawing becomes a Check these row: "Table says Suite 2 is 14'-0" × 11'-6" — no room on the plan carries that name": name that room with R and type the size.
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
    - **A window drawn as one line** (2026-10-18): where a wall stops and ONE thin line carries on along that wall's own line to the next wall (a window drawn as a single line in an outer wall, as CAD sheets draw it), the line is a **glass wall** — before, only two or three lines were, and one line was a railing on a veranda and nothing anywhere else. A corner bedroom whose outer wall is mostly window then closes. Kept only when the room passes the same check, with its row.
    - **Kept only when the room is right**: the name's room is closed, holds no other printed name, its size is within 1 ft of the size printed in it (when no size was read: only a door, glass wall or low wall, at most three pieces, and a size that kind of room can have), no room that was already closed changes, no small nameless space is cut off, and nothing is drawn from or onto furniture (a table's edges, a bed's headboard line). Otherwise nothing is drawn and the room keeps its "… is open" row.
    - **Each room closed this way gets one row** in Check these saying what was drawn and asking: "Drew a 2'-10" door in the gap (no door swing is drawn there) to close Toilet — no printed size was read to check it. A door, or open?", "Drew a glass wall 6'-5" along the window line drawn there to close Veranda 02 — no printed size was read to check it.
      - Right?", "Drew a wall carried on 1'-6" and a zone line 9'-0" (open plan: nothing in 3D) to close Dining Space — it then matches its printed size. Right? Select a line to make it a wall, glass or a low wall". Click the row to go there. Its buttons answer it in one click: **Make it a wall / Make it a low wall / Make it a zone line**, **Make it open (no door) / Make it a door**, **Take it out** (the room opens again) — or **Looks right**.
      - The same buttons now come on Auto-trace's other rows about one guessed piece ("Traced as a 1.1 m low wall … Check", "Passage 3'-1" wide? …"). Ctrl+Z undoes any of them.
    - On the 30 test sheets this took the rooms closed and named right from 205 to 254 of 522 (39 % → 49 %); on White Lake 3rd floor both flats now come out with all 12 read names closed and named. Most rooms still open are rooms whose printed size Auto-trace could not read (a zone line needs it) or whose walls it hardly traced (§10).
    - **A size read unsure checks a room too** (2026-10-15, step 5A). A printed size Auto-trace could not read for sure (it then asks you to type it) — or a size in the table beside the plan whose row names no room of the drawing (TERRACE in the list, VER in the room) — is used only where the room it closes comes within 1 ft of it on both sides: two readings agree. Then a zone line may close an open-plan room, and the row says so: "Drew a zone line 13'-6" (open plan: nothing in 3D) to close Dining — it then matches its printed size as far as the size could be read (check it)". Type the size to be sure.
    - **More ways to find the missing side, each kept only where a printed size checks the room**: where the printed size puts the side, measured from the wall across the room; the first line drawn across the floor; two open sides at once (a veranda between two walls: its glass door on one side, its railing on the other); and a **veranda drawn as a box of thin lines against the room's outer wall** — low walls (its railing) on its three sides at its printed size, with a short jog onto a wall that stops just short of the box. The room's name must stand near the middle of what is closed.
    - **A veranda drawn as a box of thin lines, found from its name** (2026-10-18, clean 90). A veranda / balcony / green whose box of railing lines leans on the building is closed from its name outward, with or without a printed size: the wall behind the name (through its window or door), the first line drawn across the floor ahead of it, then halfway between them the line (or wall) on each side — a table edge or a chair in front of the railing is passed over.
      - Every side must be a line drawn along its whole length; each becomes a 1.1 m **low wall** (its railing; 0.45 m beside planter green), and the window behind is split where a railing meets it (a side that reaches the wall just past its corner gets a short jog onto it).
      - A printed size, where one was read, must still match; with none read the room must be a size a veranda can have. Its row asks as for any railing. Skymark Ver 1, Fernhill VER 02, La Montana Green, Amabilia VER-1, Aftabnagar Ver and three of Water Lily's verandas close this way.
    - On the 30 test sheets (2026-10-15, after step 5B): 385 → 396 of 522 closed and named right (73.8 % → 75.9 %); Sheltech Siddiques 6 → 9 of 14 (Dining with a zone line, Bed 2 and the Ver beside the dining), Ixora both terraces, Sapphire, Azmary 11 → 13. Still open: rooms whose drawing does not match their print (Water Lily's verandas are drawn 5'-9" wide but printed 8'-0"; its Bed 3, Living and Dining likewise) — they keep their row; and rooms whose size was not read at all.
    - **Walls that stop just short, and open-plan rooms side by side** (2026-10-15, step 6B). A wall that stops up to 40 cm before the line it should meet — beside a column the drawing shows only in grey, at a door jamb — is carried on to that line with a short jog onto its end, when the room then matches its printed size (Gladiolus Parent's Bed, La Montana B Dining, Ixora's two Living - Dining rooms).
      - A piece that would end a few centimetres inside another wall's window runs straight onto that wall's end instead (Hermitage's toilet). When an open-plan room (dining, living, foyer) closes at its printed size but another open-plan name still stands in the same space — Dining with Family Living beside it (Accept Aftabnagar) — a second zone line splits them.
      - Each room closed this way keeps its one row, e.g. "Drew a zone line 11'-9" (open plan: nothing in 3D) and a zone line 8'-2" (open plan: nothing in 3D) to close Dining — it then matches its printed size. Right?", with Make it a wall / Make it a low wall / Take it out / Looks right.
    - On the 30 test sheets (2026-10-15, after step 6A): 410 → 421 of 522 closed and named right (78.5 % → 80.7 %); no room that came out right before was lost. Still open: rooms whose drawing does not match their print (Water Lily), rooms whose size was not read at all (Sapphire's Dining & Living, Magnifico's Foyer / Formal Living / Dining), and a toilet or veranda inside a bigger space with nothing drawn between them (Phera's toilet, Hermitage's small veranda, where a window was traced over the column).
    - **Two or three names in one open space** (2026-10-19, open plan). When one closed space holds two or three printed open-plan names — living and dining, living and foyer, dining and an open kitchen — Auto-trace looks for a line the sheet draws between them and splits the space with a **zone line** (nothing in 3D) only on it: a **dashed line** drawn across the space from wall to wall (a light, coloured or very fine one too), or a **box of dashes** round one of the names against the walls (a foyer drawn as a dashed box: a zone line on each dashed side).
      - A space longer than the walls usually looked at (a living and a dining 12 m end to end) is looked at whole. It is kept only when each name then stands in a part of its own, every name left alone in its part matches the size printed in it (within 1 ft; a name whose size was not read: a size its kind can have), and no room already closed changes.
      - Nothing drawn between them, or the sizes do not agree: nothing is drawn, the space stays one room, and its row asks **"Foyer and Formal Living share one space — split here?"** with **Close it — zone line** (the line that gives the room nearest its printed size; the faint line shows where), **Show me** and **Looks right**.
      - Each split gets its own row: "Drew a zone line 22'-11" along the dashed line drawn there (open plan: nothing in 3D) to close Dining — it then matches its printed size. Right? Select a line to make it a wall, glass or a low wall", with Make it a wall / Make it a low wall / Take it out / Looks right.
      - BTI Park Royale 2nd / 3rd / 7th level: the Dining Room now closes on its own on the dashed line under the Formal Living (was one space with the living and the foyer). Wall stubs and a change of floor shade were tried as the line too and found nothing on the test sheets — left out.
  - **Walls that stop short**: a wall end that stops before the wall ahead (up to 4 ft) is carried on to it when the sheet shows the same thing in between — the wall's dark band, a window's pane lines (then it is a window there), a railing's line — or when the gap is under 1 ft (no door is that narrow).
    - A gap with nothing drawn in it stays open, with its row. Since 2026-10-18 evening a wall that stops at a **column** drawn as a filled box (one even grey, clearly darker than the floor beside it) is carried on through the column to the wall ahead as a wall — also where Auto-trace had laid a window along that wall over the column: the window is split where the wall meets it (Assure Hermitage's small veranda, which used to share the child bed's room).
  - **Two printed names in one closed space** (2026-10-15): the larger printed room names it (a 22 m² space holding PARENT'S BED and TOILET is the bedroom, not "Toilet"); the room rows still say which name has no room of its own. **A name read in pieces along one line** — "DINING", "AMILY" with the size under it, "f LOUNGE" — is one name, its kind as the whole reads (Dining Family Lounge: a dining room); so is "BED" beside "-04/HOME OFFICE" (Bed 04/Home Office: a bedroom). **A size table read with two rows on one line** ("SUITE 3 LIVING & DINING 110" x 1311" 267" x 140"") is split into its two rows, and a table size whose foot marks were all lost ("82" x 120"" = 8'-2" × 12'-0") is read.
  - **Spaces cut off by a line that is no wall**: a space with no name of its own, cut from a named room only by an open-plan line or a thin line (a counter, a wardrobe front, a beam line), is part of that room (the 2026-10-03 rule: an unread space joins the room beside it).
    - Since 2026-10-15 also a space under 4 m² with no name of its own that is split off a named room by a drawn line with no door in it, when the room only matches its printed size together with it — a shower area behind its curtain line, a veranda's planter box at its end.
    - Since step 6B the space behind the line may be of any size when the room only matches its printed size together with it (the name was cut off in a strip of its own), and where no size was read a low wall (under 1.2 m — a tile line or a rug's edge read as one) across a bedroom, bath or kitchen is taken out (Sapphire's bedroom).
    - Words of fittings printed on the plan (WASHING MACHINE, FREEZER, FRIDGE, a beam note) and stray strokes read as letters do not count as a name. Lifts read as "LIFT PIT" or "STRETCHER LIFT" are kept out of the flat like the lobby and stairs, and the core's walls left hanging off the flat go with it.
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
    - **Brochure pages with several flats in small print** (2026-10-18): a size printed sideways whose name was not read with it has the strip beside it — where its name stands — read turned upright (Residence Park's MASTER BED; before, the strip above it was read, unturned), and a sideways name whose first letter touches a fixture is read once more one letter wider each side (Residence Park's KITCHEN at the stove, read "[CHEN" before).
      - A flat's area stamp read "1376 SOFT" (its Q read as an O) or cut short ("1364 SOF", then read whole from the wider view) is the flat's area, so each flat on the page has its label for **Whole floor** (Mir Sarwar 2nd–8th: all three "UNIT- … SQFT" stamps read, was one — Whole floor now finds three flats there, was one).
    - **Never a guess from a garbled reading.** A reading names a room only when its words are the sheet's room words (one letter off at most) with at most one number. "BATH 3 21050X 10 67", two rooms' labels read as one ("BED 1 VER 1 TOILET 1" — now three labels), or a stray line stacked on a name never names a room or changes its kind: that room stays "Space N" with its row. A size read on a second look that the size reader could not confirm is never used as a size (it shows as "type this size"). Numbers in names are kept ("BED-04/HOME OFFICE", "BED D4" read for BED 04).
    - On the 30 test sheets (2026-10-15) the room names read went from 298 to 434 of the 522 printed rooms (57 % → 83 %), and the rooms closed and named right from 254 to 351 (49 % → 67 %) — a name read with its size lets Auto-trace fit and close that room. Reading takes longer: about 13 seconds a sheet, up to 33 (it was about 7).
    - **Still not read**: very small print on a busy sheet (CPDL La Reina at 6 px letters, bti Magnifico's grey names on grey floors), names printed white on a speckled granite floor (Palm Spring's kitchen), names touching furniture on both sides; and a name read on a sheet whose walls Auto-trace hardly traced is not counted on a flat.
      - **Room names on a whole-floor brochure page** printed 5–7 px tall in a small or blurred picture (Mir Sarwar, Mir Sohelas, Crystal Purba Badda, Assure KM Heights): the letters themselves are blurred away — reading the page twice as big was tried (2026-10-18) and read fewer, not more.
      - Drop the brochure's single-flat page instead when it has one (Mir Sarwar's Unit A page: 11 of 14 rooms right, against 4 of 37 on the whole-floor page), or type such a name with the row's Name it.
    - **Room lists in small print, and numbered lists** (2026-10-15, step 6A). A list of rooms and sizes beside the plan is now found even when its print is tiny and its names were read as one block (CPDL La Reina's 8 px list "F. Living / Living / Dining / Kitchen / Bed 1 …" beside its sizes): the sizes on the right split the block into its rows, and the thin lines ruled under each row no longer count as walls.
      - A size in the list that could not be read for sure still goes to its room as a size "read unsure" (it then checks the room as in step 5A, and its row asks you to type it). "BED 01" in a room and "Bed 1" in the list are the same name, and so are "J BALCONY" and "BALCONY" (a stray letter beside it).
      - On a numbered list ("01. LIVING …", Ena Jahan Lodge) a number misread in the list takes the number of its place (between 03 and 05 it is 04), and the small "06" printed in a room is looked for once more when no room carried it — so each room takes the name and size of its number.
      - The list's words no longer make a "Flat 1" of their own.
    - **A room whose number was lost** (2026-10-15, step 6A). When a line is drawn through a room's number ("BED-4" read as "BED", "BATH-01" as "BATH-0", "VER 03" as "VER 0"), the name is read once more in other views; when one of them reads the same name with a number (and no view reads another number), the room gets it.
      - Where the sheet prints a size list, a room whose number was not read takes the name of the one list row of its name that no room took and whose size is the room's (BED 03 on La Reina, "Bed 3" in the list); a room whose kind was only guessed (from a fill colour) takes its row's name the same way.
      - Both keep a row: "Its number was not read: named Bed 3 from the size table (the row of its name and size) — check". When two rows would fit, it takes neither.
    - On the 30 test sheets this took the rooms closed and named right from 396 to 410 of 522 (78.5 %; La Reina 6 → 11, Jahan Lodge 3 → 8) and the wrong names from 17 to 10.
  - A loose wall end on a column is not listed as "A wall ends here" (the Issues list already treated it as joined).
  - **Walls drawn in other ways** (2026-10-15). Besides walls printed solid black, Auto-trace now reads:
    - **hollow walls** — two thin lines a wall's thickness apart with paper (or a pale fill) between, as Assure's brochures and CAD drawings (Accept Builders) draw them: the band between the two lines is taken as the wall, its corners and T-joints included. It does this only when most of the sheet's long walls are drawn that way, so a sheet with black walls is never changed; a window drawn as three or four lines, a tile floor and a word's letters stay what they are, and a sofa or armchair drawn with a frame under 1 m long stays furniture (a longer frame standing free may still come out as a wall — select it with V and press Del);
    - **a window drawn as a frame band** (2026-10-18): on photo-style brochures (Akter Residence Park) a window in a wall is a light grey band as wide as the wall with one dark line in it. Such a band between two wall ends is now a window in that wall (before, only two or three separate lines were), so the corner bedrooms behind long windows close. Not on a small picture whose walls are under about 6 px thick (Auto-trace enlarges those first, and a thin wall's own grey then looks the same — bti Magnifico, Sheltech Water Lily): there nothing changes;
    - **a dashed or dash-dot line is never a wall** (2026-10-18): the plot line drawn round the building (dashes up to about 1.5 m with gaps or dots between, five or more in a row) is left out, like furniture. Before, on Akter Anandita it counted as the sheet's heavy black walls, so the hollow walls inside were not read at all and the whole site came out as one room; now they are read: in Auto-trace's own test (2026-10-18) Anandita's 1st & 2nd floor went from 8 to 23 of its 27 rooms closed and named, the 5th–7th floor from 4 to 10 of 16, the 4th floor from 7 to 10 of 17.
      - A line broken into pieces that has another line right beside it (a wall's outline cut by stair treads, a sofa's double edge) is not a dashed line (2026-10-18, second fix: UPL Mridha Lodge had lost its left flat's living, bedrooms and toilets to it, 22 → 18 of 24; back to 22);
    - **grey walls between two thin dark lines** (bti's newer brochures), as before;
    - **walls drawn lighter than the floor** (2026-10-18, second fix): colour brochures that draw the walls white or cream between beige, tiled, carpet or marble floors (Moonstone Chowdhury Bari and White Angelica, Assure Murshed Heights, Moonstone Easin Court).
      - Before, no wall was read on them and almost nothing closed. Now, when fewer than half of the room names read on a colour sheet stand in a closed room, Auto-trace traces the sheet a second time looking for light bands (a band lighter than the floor on both sides and no thicker than a thick wall) and keeps that second tracing when it closes clearly more of the named rooms.
      - In that second tracing a small space with no name read in it (under 3 m², or under 0.8 m across) is joined to the unnamed space beside it, never to a named room. In Auto-trace's own test on 14 colour brochure sheets the rooms closed and named right went from 34 to 82 of 383 (Chowdhury Bari 0 → 11 of 23, White Angelica 0 → 7 of 14, Murshed option 1 1 → 7 of 34, option 2 0 → 9 of 34, Neer 2 → 7 of 22, Mir MR Memento 6 → 11 of 31).
      - It still draws more small spaces that are no rooms there (26 → 64 on those 14 sheets, about 3 more a sheet: select them with V and press Del). Your picture is not changed. Still not read: mid-grey walls on a grey tile floor (Assure Neer, Mir Shohag), thin light lines between coloured floors with names too small to read (Easin: 5 of 57), walls on an orange page (Moonstone Unity);
    - **a plan drawn turned on its sheet** (2026-10-18, second fix): Sheltech Windflower Tower 2 draws its plan 9.35° turned on a square sheet (the title block and frame straight). Auto-trace now measures the angle of the plan's lines and, when the plan is 2° or more off the sheet's edges, reads and traces it turned straight, then puts every wall, name and column back where it is on your picture — you see nothing turned. Before, its walls came out as thousands of tiny steps, nothing closed and Auto-trace did not finish in 10 minutes; in Auto-trace's own test it now closes and names 33 of the 78 printed rooms. Sheets drawn straight are not touched (none of the other test sheets is turned);
    - **a plan printed on a dark page** (a navy, grey or striped card round the plan): the page round the plan is taken as paper and the plan keeps its own colours (before, the whole sheet was turned over and the plan was lost). White lines on a dark page (bti La Montana) are still turned over as before.
    - **a plan on a coloured page whose grey is the walls' own grey** (Mir MR Memento: a dark green sheet with a grey-green card under the plan; in black and white the card and the walls are the same grey, so no wall was read). Since step 5B Auto-trace tells them apart by their colour: the big areas of one colour round the plan are taken as paper, layer by layer from the edge of the sheet, and the plan's walls, floors and the title's letters keep their greys. On Mir this closes and names the Living, Guest Bed, Dining and Kitchen (the Studio's count: "6 of the 10 room names read on it are closed and named"; it was 3); on Ena Jahan Lodge's striped page the Master Bed too.
    - On the 30 test sheets this took the rooms closed and named right from 351 to 382 of 522 (67 % → 73 %): Assure Hermitage 10 → 18 of 20, Assure Gladiolus 10 → 13 of 15, Accept Aftabnagar 4 → 7 of 12, Ena Azmary Villa 1 → 11 of 14, Finlay Palm Spring 1 → 7 of 12.
    - **Still not read well**: on Mir the wall between the two bedrooms runs through two wooden wardrobes and two desks drawn against it (Auto-trace sees one block 1.3 m thick, not a wall — draw it with W), and the beds' striped covers come out as short loose walls (select them with V and press Del); bti Magnifico (walls 5 px thick, some hollow, some solid; a bed's rug border is drawn exactly like a wall at that size; the formal living, dining and foyer are one open room), Ena Jahan Lodge's blue walls on a striped page.
      - On a dark page, the page's own streaks, a script logo or a photo beside the plan can come out as loose walls outside the flat ("Loose wall end" rows): select them with V and press Del.
  - A size row ("drawn … printed …") means neither of the room's two measures matches its printed size within 2": its main rectangle (the biggest rectangle that fits inside it — the "drawn" figure the row shows) and its whole outline (an L-shaped room whose sheet prints the whole L passes this way).
    - The row goes once either one matches. A printed size Auto-trace could not read ("Kitchen: its printed size could not be read — type it"): click the row, the room's box opens on the right, type the size into **Printed size** — the size row for it appears at once if the room does not match (Sheltech L2: "Kitchen: drawn 6'-5" × 12'-2", printed 8'-5" × 12'-2"").
    - The same for a size typed with R or brought by Name it.
  - **Wall tracks** tick box — which tracing method Auto-trace uses (leave it on).
  - **AI helper (optional)** — a place for a Gemini key; only used to re-read room names the tool could not read.
  - **Ask AI** (2026-10-18) — on every Check these row, and **Ask AI for all** beside the "Check these" heading. It asks the free AI running on this PC (Local AI, below) which of the row's buttons is right. It is shown the piece of the sheet round the row (the row's picture box and a metre more, at full size, a red ring on the spot) and the row's text with its buttons as a multiple choice.
    - One row at a time — the graphics card holds one model; a row waiting its turn or being thought about shows a spinner on its Ask AI. What it says shows under the row: "AI: Make it a wall — a full wall is drawn there (6 s)".
    - **If it picks a fix, the fix is done** exactly as your own click would do it (one Ctrl+Z, or **Undo** on the row while nothing was changed after it); a row the fix closed leaves the list and its line "AI: …" stays at the bottom of the list with its Undo.
    - **A fix that takes a door, window or passage out is never done by the AI**: the row says "AI suggests: Take it out — <its reason>" with an **Apply** button — look at the sheet, and click Apply only if you agree (that click is yours).
    - **If it picks Looks right or Show me, nothing is done**: the AI never takes a row off the list and never picks your tool — click Looks right yourself if you agree. "AI was not sure" = it gave no answer from the list: nothing is done.
    - A failed call says why on the row (server not running, model not pulled, …). If you change the plan while it is thinking, its answer is dropped ("the plan changed … ask again"). Ask AI for all asks every row the AI has not answered yet, top to bottom (when every row has been asked or skipped the button reads **AI asked on every row**, greyed — Ask AI on a row still asks that one again); the rows a fix closes on the way are skipped, and so are the kinds of row the AI got wrong too often in the test — the row then says "AI: skipped — AI is not trusted on door / window / passage rows yet" (Ask AI on that row itself still asks).
    - **How good it is (2026-10-18, see HANDOFF "LOCAL AI"):** not good yet. On the rows where its answer changes the plan it was right 8 times and wrong 14 times (bti Amabilia + Assure Phera): it does not see door swings, takes a sofa line for a room edge and calls drawn walls low walls.
    - So Ask AI for all now skips every kind of row whose answer changes the plan (open rooms, unnamed spaces, guessed lines, doors / windows / passages) and only gives its opinion on the rest; Ask AI on one row still asks and applies its fix — check it, and press Undo when it is wrong.
    - Answers take 2–3 seconds each (the first one about 10 s while the model loads).
  - **Local AI (this PC, free)** — the settings for Ask AI: **Server** (`http://localhost:11434`) and **Model** (`qwen2.5vl:7b`), kept in this browser, and **Test**: "found qwen2.5vl:7b", or the reason and its fix — *server not running* (start it, below), *blocked by CORS* (a browser safety rule that stops a page from calling another program; start it again with the start file, which allows it), *model not pulled* (pull it, below).
    - **It costs nothing: Ollama is an open-source program, Qwen2.5-VL an open-licence (Apache-2.0) model, and both run on this PC's own graphics card — no account, no key, no internet once the model is on the disk.** A server address that is not this PC or its home network is refused ("This is not a local server"), unless you tick "Use it anyway"; a cloud model name (one ending in "-cloud": those run, paid, on ollama.com) is refused always.
    - Works only on this PC (it has the card) — on another computer Ask AI says the server is not running.
    - **Start it** (each time the PC was restarted, before Ask AI): double-click `E:\dev\tools\ollama\start-ollama.cmd` and leave its black window open (closing it stops the AI). Or, in PowerShell (a Windows command window): `$env:OLLAMA_MODELS='E:\dev\tools\ollama\models'; $env:OLLAMA_ORIGINS='*'; $env:OLLAMA_NO_CLOUD='1'; E:\dev\tools\ollama\ollama.exe serve` (`OLLAMA_MODELS` keeps the 6 GB model on E:, `OLLAMA_ORIGINS` lets the Studio page — also the live site — call it, `OLLAMA_NO_CLOUD` switches Ollama's paid cloud models off; the start file also keeps Ollama's own small files on E:.)
    - **The model** (once; 6 GB, already on this PC): with the server running, in a second PowerShell window: `E:\dev\tools\ollama\ollama.exe pull qwen2.5vl:7b`. To see whether it runs on the graphics card: `nvidia-smi` while a row is being asked.
    - **What is kept**: every answer the AI gives from the list (fix, Looks right or Show me) goes into the same record as your own clicks (Export answers), marked `"by": "ai"` with the model's name and its reason — your own clicks carry no mark, so they stay the test set to score the AI against. Nothing is ever changed in the record afterwards; an Undo is not recorded.
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
1. Open the Studio. Top bar → **⋯** → **New project** (or, with nothing open, the **New project** card is in the middle, beside the plan picture box; or top bar → **Building**).
2. Type its **Name**, how many **Basements** (0–5), how many **Floors above ground** (1–60), tick **Rooftop** or not. A ground floor is always there.
3. Click **Create project**. The list of floors appears on the right of the plan and stays there: **Rooftop** at the top, then the floors from the highest down, **Ground floor**, **Basement 1**, **Basement 2**…

**Give each floor a drawing** — work through the list:
- **Draw** (on an empty floor): a new, empty drawing for that floor opens. Floors get the names Floor plan A, Floor plan B… (the flats inside a drawing keep the sheet's names, Type A, Type B); the others are called Ground floor, Basement 1, Rooftop. Drop that floor's plan picture on the page (or **Choose plan image…**), set the scale (S) and trace as usual.
- **Same size as "Floor plan A" — Use its scale and position**: when the picture you load is exactly the size of a picture you already set the scale on, this message offers it (15 seconds). Click it: no scale to set, and the two drawings sit right over each other in the building. Not right? **Ctrl+Z**.
- **Open**: that floor's drawing comes into the Studio. The drawing you were on is saved first, with its picture. Nothing is asked, nothing is lost — also after closing the browser.
- **Use drawing…**: pick one of your drawings for this floor.
- **Clear**: the floor is empty again; the drawing itself is kept.
- **Use drawing… → This floor only — its own copy** (in the menu of a floor whose drawing is on other floors too): that floor gets its own copy of the drawing and the copy opens — see "One floor different from the others" below.
- The floors of the drawing open now are white (the list itself is stone-coloured).
- Under a floor's drawing name, its flats: **Floor 2 — Level 2** with **— Flat 1, Flat 2** under it (or "Type A, Type B" when the drawing names them). They come from the drawing itself (section 5, "Flats in a whole-floor drawing"); nothing to type here. A ground floor, basement or rooftop shows none.

**Under the list, for the drawing open now**
- **Open now** — its name.
- **Delete this drawing** — it leaves every floor and is gone (asks first).

**Floor plans — draw once, use on many floors** (above the floor list, one row per drawing): the plan's name and the floors it is on now ("on G, 2, 4, 6"). Type the floors in its box — `2, 4, 6-8`, any pattern, Floor plan A on 2, 4, 6 and Floor plan B on 1, 3, 5 — and click **Apply** (or press Enter): the plan goes on those floors too, nothing drawn twice. If one of those floors already has another drawing, you are asked first; that other drawing is kept. Clearing a floor never asks (the drawing is kept too). **Copy** makes a new plan from this one (with its picture), for a floor that differs a little — it is on no floor until you type its floors or **Use drawing…** on a floor.

**One floor different from the others** (since 2026-11-20)
- A drawing on several floors is ONE drawing: change it in the Studio (a wall, a door, a room's name) and every floor that has it changes. That is the point of a floor plan: draw it once.
- **Use drawing… → This floor only — its own copy** (the floor's menu in the list): that floor gets its own copy of the drawing, called "Floor plan A · floor 5", and the copy opens in the Studio. The other floors keep "Floor plan A" as it is. From then on, whatever you change on the copy (walls, doors, windows, furniture) stays on that floor, and changes to "Floor plan A" no longer reach it. The plan picture, the furniture you arranged and the notes come along with the copy.
- **In the 3D view** (staff): the first time you change the furniture (move, turn, resize, delete, add, undo) on a floor whose drawing is on other floors too — or click **Edit ▾ → Openings** there — a small box asks: "Floor plan A is also on floors 1, 3, 4. Change: **Floor 2 only** / **All 4 floors**".
  - **Floor 2 only**: floor 2 gets its own copy (as above), your change is kept on it, and the page opens again on that copy (a few seconds) with Edit furniture (or Edit openings) still on. A note says "Floor 2 has its own drawing now". Floors 1, 3 and 4 stay exactly as they were.
  - **All 4 floors**: the change goes to every floor with the drawing (as before this box existed).
  - **Esc** (since 2026-11-20): takes the change back instead — the piece goes back where it was, nothing is saved, and nothing is remembered: the box asks again at your next change.
  - The answer is remembered for the project in this browser: the next floor you change does the same without asking. The Studio's floor list shows the remembered answer under **Show building**; **Ask again** forgets it.
- **Finishes never spread to other floors.** What you or a buyer pick in **Finishes** (a floor, a wall colour) is not saved into the drawing: it lives in that page and in the **Share** link only, so it never changes another floor or another flat.
- **A building from an architect's file** (an IFC dropped on the Studio, §5 "Bring in the architect's file"): every floor is its own drawing from the start — nothing is repeated, nothing to answer. **A traced building**: one drawing per floor type, put on many floors. In the 3D view, the first change you make on one floor asks whether it is for that floor only; in the Studio, a change to the drawing goes to all its floors — pick **Use drawing… → This floor only** on a floor first when it is for that floor alone.

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

**Sun:** stands where the real sun stands at the building's site (Dhaka when no site is set) on the day and hour picked in the 3D, turned by the plan's true north.

**The floor above** (since 2026-11-20): walking a flat that is part of a building, a veranda, planter or air shaft with a floor of the building over it gets no sun and no sky through its ceiling — the floor above's slab is there. Only what has nothing above it sees the sky: a part of the flat that sticks out past the floor above, an air shaft that the floor above keeps open too, and the rooftop. (A flat opened on its own, not in a building, still lets the sky into its small verandas and shafts.)

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
- Your answer to the 3D view's "which floors?" box, per project (Studio → Building list: **Ask again**)
- Staff mode, the staff key, your sign-in (until **Sign out**)
- Your own furniture, finishes and texture pictures (also online for your company when signed in — see below)
- Your Check these answers (the record Export answers saves, with the Local AI's answers marked) and, per sheet, where the print Auto-trace could not read stands
- The Local AI settings (server, model). The model itself is on this PC's disk (`E:\dev\tools\ollama\models`), not in the browser

The **Site** (place, north, blocks, roads, wind) is part of the drawing: kept wherever the drawing is (draft, project, Export file, buyer link).

**Safe:**

- The built-in flats and levels
- Anything exported as a file (the file does not contain the plan picture — keep the picture too)
- Buyer links made with **Share link** and what buyers do on them (in the database)
- Signed in to a company: the open project or drawing and **every save of it** (in the database, for your company only), with each drawing's plan picture (in your company's private folder online; a save names the picture it was traced on)
- Signed in to a company: your own furniture, finish options and texture pictures (§3, "Your own furniture, finishes and textures"), for every colleague, and in the buyer links that show them

**Never saved:** the finishes you clicked, unless you press **Share** (they go into the link).

---

## 10. Rough edges known today

Things that are confusing or not finished. Each one is a job on the list.

- **Auto-trace misses rooms.** On the test sheets it closes and names about 6 of every 10 rooms (75 of 116 on the five hand-traced flats after the 2026-10-09 evening work, was 71); verandas, planters, shafts and lobbies are the usual ones left open or swallowed by the room beside them.
  - Since that work it closes a veranda on its railing line, a glass front drawn as two or three lines, and a wall or window that stops short of the next wall (§5, "What Auto-trace draws that is not a wall"): in the Studio test Sheltech L2 Type A went from 10 to 13 of its 14 read names closed and named, Type B 9 → 11 of 13, Level 4 Type A 8 → 9 of 13, BTI Type A 19 → 20 of 21, and "Check these" + Issues fell on every test flat (Sheltech L4 Type A 51 + 9 → 38 + 5).
  - Still left open by Auto-trace: an **open-plan foyer / dining / family room** with no sizes printed (nothing pins where one ends — draw a Zone line with W), **verandas drawn with a very light double railing line** and no size read, **the planter strip** south of each Sheltech flat, and on BTI's 3rd floor the **south flat's west rooms** (the flat it picks does not reach them: draw them with W).
  - "Check these" now names each one and closes or names most in one click (see §5): in the Studio test of 2026-10-09 the BTI Type A flat reached "All 21 room names read on the sheet are closed and named" in 4 clicks; Sheltech Type A and Type B were left with 1 and 2 rooms to draw with W (no walls of theirs were traced).
  - Still by hand: **names Auto-trace could not read** — it now reads most (Sheltech L2 Type A 14 of 18, Level 4 Type A 13 of 18, BTI Type A 21 of 22), but not light grey names drawn over a fixture (the small toilet by the Sheltech kitchen veranda), a few names whose letters touch a basin or a wall (Toilet 3 on Sheltech L2), the small SUNSHADE / PLANTER words, the red TYPE-B; a toilet read without its number is called just "Toilet"; on Banani (6 px letters) it reads 9 of 19.
  - Those rooms show as "Unnamed space" or "Space N — printed name … is in it": type the name with the row's Name it. **Printed sizes touching a counter line or crossed by a door arc** (Kitchen, Toilet 1 on Sheltech L2) are not read either: their row asks you to type them, **glass fronts Auto-trace did not see as two or three lines** (Close it draws a zone line there: turn it into glass yourself), and **the Banani sheets** (their walls are thin lines Auto-trace does not take: draw the flat with W — when it closes almost nothing Auto-trace now says what happened — "Auto-trace found only 8 walls and 1 room.
  - Walls drawn grey, hollow or as thin lines are not yet read well; draw the missing walls with W, or trace one flat with a click." — and says "made for flats … ground floor, basement or rooftop" only when the sheet itself prints PARKING, DRIVEWAY or RAMP (and no bedroom), or only a lobby (2026-10-14)).
  - Making the tracer itself better is the next job (HANDOFF session 24). Since 2026-10-15 it also closes many open rooms itself — a door in a gap, a glass wall, a railing, an open-plan zone line, each with its row (§5, "Closing a room that is still open"): on the 30 test sheets 254 of 522 printed rooms come out closed and named (was 205).
  - Most still open are rooms whose printed size it cannot read yet, or whose walls it hardly traces. Since the same day hollow walls (two thin lines), grey walls between two lines and plans printed on a dark page are read as walls too (§5, "Walls drawn in other ways"): 382 of 522 closed and named; since step 5B a plan on a coloured page whose grey is the walls' grey (Mir) too: 385 of 522.
  - Since step 5A a size read unsure, a table row of the room's kind and a veranda drawn as a box of thin lines close rooms too, and a name read in pieces is one name (§5): 396 of 522. Since step 6A room lists in small print and numbered lists are read, and a room whose number a line hid gets it back (§5): 410 of 522.
  - Since step 6B walls that stop just short of the line they meet, two open-plan rooms in one space and a tile line read across a bedroom are handled (§5): 421 of 522 (80.7 %). Since 2026-10-18 a window drawn as a frame band or as a single line, a dashed plot line round the site (never a wall now) and a guessed room type that does not fit the room's size are handled (§5): 423 of 522 (81.0 %); on the Akter Anandita sheets, whose hollow walls were not read at all before, most rooms now close.
  - Since the same day's reading rules for brochure pages (a sideways size's name read beside it, a flat's area stamp read as "SOFT" or cut short, a sideways name read one letter wider — §5, "How Auto-trace reads the printed words"): 424 of 522 (81.2 %); on Mir Sarwar's whole-floor page Whole floor finds its three flats (was one).
  - Since the second fix the same day, walls drawn lighter than the floor (white walls on colour brochures) and a plan drawn turned on its sheet are read too (§5): still 423 of 522 (none of the 30 test sheets is drawn either way); on 14 colour brochure sheets 34 → 82 of 383 rooms, and Sheltech Windflower's two six-flat towers are now read and traced in about 2 minutes in the browser (in Auto-trace's own test Whole floor closes 58 and 33 of their 78 rooms) — and since 2026-10-19 the Studio takes in a whole floor that big (about 1 400 walls, 750 rows): see "Check these", A big drawing.
  - Rooms drawn at another size than their print stay open with their row. Since the clean-90 work (2026-10-18 evening) a veranda drawn as a box of thin railing lines closes from its name even when its size was not read, and a room the floor reaches only through another room it took in is kept (§5, "A veranda drawn as a box of thin lines, found from its name"): 433 of 522 (83.0 %), and a wall stopping at a column drawn filled goes on through it.
  - What still keeps the 30 sheets from 90 %: names not read (sideways or small toilets, verandas), open-plan foyer / living / dining with no size read, walls drawn white or light grey (La Reina, Palm Spring's railings), and rooms drawn at another size than their print.
  - Still hardly traced: walls with furniture drawn against them on both sides (Mir's bedrooms), bti Magnifico.
- **Ground floors, basements and rooftops cannot be auto-traced.** Auto-trace only understands flats; when it finds almost nothing on a sheet that prints no bedroom it says so (on a flat sheet it says the walls may be thin lines instead), and it says loudly when it had to guess the scale.
- **Whole floor's flat count (2026-10-17, 2026-10-19):** it matches the printed flats on Sheltech Kanakchapa (7, was 5), Banani Level 7 (one flat "Unit A & B", was four), Mir Jahan e Nur (2, was 1), Mir Daisy (3), Foysal Smart Garden (2, the lobby now in neither), and 10 of job 1's 14 test sheets; Sheltech Windflower Tower 1 comes out as 5 of its 6 (Type F and Type B as one), Eastern Housing Sapphire still joins Unit A and Unit B (with a small unnamed part beside them), Moonstone Unity as 2 of 4 (its light walls are hardly traced), Rangs Sanctuary's five studios as one (no flat label read), Arkam Metro Park's seven as one (print too small).
  - Check the flat names after Whole floor; pick **New flat** for a room to part them.
- **Whole floor (Level 4) — what is still rough:** a flat whose type is not printed is called "Flat 1, 2 …" (BTI); a room the tracer did not close stays open in its flat (Sheltech L2 Type B's Toilet 2 by the lifts, BTI 3rd floor south's Bed-2 and Bath-3) — its row says so.
  - On BTI 2nd floor the big flat now always comes out as it did when clicked on its dining's printed name, which reaches a little further north than a click at the dining's west side did: loose wall ends around the unnamed box between the lift lobby and its powder room (Check these 42 → 47, Issues 3 → 9 against that old click).
  - Without a flat label printed on the plan, the flats are found only from the printed living / dining / kitchen names with a bedroom: a flat whose names are not read (Banani Level 2-6 Unit B, 6 px letters) is not found — Whole floor leaves it out, and a click in it traces from the click as before.
  - The second drawing on a sheet (BTI 3rd floor's "4th, 6th & 8th floor" strip) is not traced by Whole floor. **A big sheet of six flats** (Sheltech Windflower: 2515 × 1790 px, furniture drawn in every room, a title block and a key plan) did not finish in 10 minutes; since 2026-10-18 (second fix) the step that sorts the rooms into flats is about 14 times faster there (2 minutes → 9 seconds in Auto-trace's own test) and in Auto-trace's own test Tower 1's Whole floor closes and names 58 of its 78 printed rooms.
  - In the browser the sheet is read and traced in about 2 minutes, but Whole floor on it does not finish yet: the Studio's checks of its 700-odd rows take so long the tab gives up — click one flat at a time. Its flats are not all found: only two or three of the six red "TYPE-W 1440 SFT." labels are read, so Whole floor makes 3 flats of Tower 1's 6 and one big flat of Tower 2 — the rooms are right, the flat names are not (fix them as in "A room in the wrong flat").
  - **Two flats can still come out as one** where the flood finds a way between them that is not the lobby (Eastern Housing Sapphire: Unit A and Unit B through the open-to-sky void; Windflower Tower 1: Type F and Type B); move those rooms to their own flat by hand (V, click the room's name, Flat → New flat; see "A room in the wrong flat").
  - Since 2026-10-19 Sheltech Kanakchapa comes out as its 7 flats (was 5, its "Flat 3" held Type E, Type B and part of Type D).
- **The Banani and dmd built-in levels still open without their plan picture.** Drop the picture on the page and line it up with S (4 clicks). The Sheltech ones have theirs.
- **Lining a picture up needs zooming in and out** between the clicks when the picture and the drawing are far apart in size.
- In **Show building** the tall neighbour blocks can hide your building after you turn the view; picking a floor does not bring it back into sight.
- **Site:** most neighbour heights are guesses (3 floors) — the map rarely has them in Dhaka; type the ones you know. The map may also miss new buildings or still show torn-down ones: delete those; a building cannot be added by hand yet. The plot is where the middle of the open drawing stands (in a project, of the flat you look at), not the plot's outline. Tall blocks right beside the flat can stand in the Dollhouse view's way. The wind lines only show one room at a time: wind through a door into the next room is not drawn. The 3D has no hover tooltip on a block: its height and "guessed" show in the Studio's Site map.
- Renaming a project does not change the Project box of drawings made before the rename.
- The "Draft restored — Start over" message shows at every opening; in a project **Start over** only empties the screen, the drawing is kept.
- Undo does not go back past closing the browser or switching drawings. The tracing timer (bottom right) starts again for each drawing you open.
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
- **"Which floors?" is asked only on a Studio project's floors of flats.** A built-in tower's flat (Type A on floors 2–8 of the BTI tower) and a level used on two floors (the same basement drawing on B1 and B2) still change on every floor that has them; for a level, use **Use drawing… → This floor only** in the Studio's floor list first.
- **"Floor 2 only" opens the page again** (a few seconds) on floor 2's own copy: the view starts over (at the entrance in Walk, the whole flat in Dollhouse), not where you were.
- **The old one-plan way does not know about own copies**: putting the plan on floors 1–4 again with **Put only this plan into a building…** after floor 2 got its own copy puts both on floor 2. Use the project floor list instead.
- After typing in a box on the right, press **Enter** — then the tool keys (W, O…) work again. (Without Enter they still go into the box.)
- Clicking a door on a thin low wall picks the wall; Del then removes the whole wall.
- **3D Edit openings, low walls:** sliding a low wall whose end meets the middle of another wall also slides the doors and windows on that wall's piece with it (they keep their distance from that corner, as in the Studio). Walls higher than 1.2 m (a 7' screen, a full wall) cannot be moved in 3D yet.
- **The first view of each room** (Enter, **Rooms**) was chosen for the old, wider walk lens: since 2026-10-19 it can cut the edge of a piece (Bed-1's AC and plant) — walk back a step.
- The fix "Join with a zone line" can draw a long diagonal line across a lawn.
- **R on a room with several gaps** says only "a wall is missing — draw it with W"; it does not yet show where. The Issues row "Label is not inside a closed room" still rings the nearest open spot, which can be outside that room.
- While a column is picked, a wall end lying on its side cannot be dragged (the column's side handle takes the press): click elsewhere first.
- Room names overlap each other on crowded plans.
- Checks written for flats show on levels ("No entry door on an outer wall", the Area number).
- The hint "Click to look around" is wrong — one click walks you to that spot; a double-click lets the mouse turn your head.
- There are two different "share" buttons: **Share** in the 3D view (a link with your finishes only) and ⋯ → **Share link** in the Studio (the real buyer link that feeds the change list).
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
| Wall | Its paint, one side at a time (Finishes open, click it) — nothing else | Yes — type, thickness (typed, or drag a face's dot: that side only), height, length, move, copy, delete; curved walls with A (as short straight pieces) | Its paint on the outside |
| Boundary wall, parapet, low wall | Yes when lower than 1.2 m — Edit openings: click it, drag an end dot (longer / shorter), drag it across, type Length / Height, delete | Yes — same as a wall | Its finish |
| Kerb, free-standing screen | Yes for a kerb and a screen lower than 1.2 m — as a low wall | Yes | — |
| Glass wall | Yes — width, height, sill, slide along the wall, delete | Yes | Frame, glass colour. Cannot be *added* in 3D |
| Door, double door, gate, window, passage | Yes — kind, width, height, sill, slide, delete | Yes — plus hinge side and swing | Door material. Cannot be *added* in 3D |
| Column | No | Yes — its four corners one by one (a tapered column), each side by mouse (or typed), move, delete, add; a wall touching it closes the room | — |
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
| Your own furniture model (since 2026-11-20) | Yes — Add → + Add your own…, then like any piece; ⋯ renames, resizes, removes | Yes (tool F, the same) | — |
| A finish option of your own (colour, texture, your picture) | Yes — Finishes → + Add option (staff); ⋯ changes or removes it | No | — |
| Curtains | Yes — slide along their wall, wider or narrower by dragging a side, delete, add from the library onto any opening (window, sliding door, door, passage); they follow their opening | Yes (tool F) — same, plus a typed width | Fabric and colour, drawing them closed |
| Neighbour buildings, road | No (they show; staff change them in the Studio) | Yes — Site: a building's height typed, a building or road deleted, the whole site fetched again or removed | Adding a building or road by hand |
| Sky | No | No | Everything |
| Day and time of day | Yes — the date and the slider (the whole day, 0–24) | — | — |
| The flat's lamps on / off | Yes — Lights on the Sun & wind card (automatic after sunset) | — | — |
| North direction | No | Yes — Site: drag the arrow on the plan, or type the degrees | — |

One limit that applies to all of it:

- **What staff change in 3D stays in that one browser.** A buyer on another computer still sees the original.

---

## 12. If something goes wrong

Every one of these is a plain page on the marble background: a small heading, one sentence, and a button. **Plotline** at the top left always goes to the front page.

| What you see | Why | What to do |
|---|---|---|
| **Nothing stands at this address.** | The address is mistyped, or the page has moved. | Click **Go to the front page**, or check the address. |
| **This flat isn't here.** | A `/u/…` address names a flat that does not exist (an old or mistyped link). | Ask whoever sent it for a fresh link. Staff: check the name against §1. |
| **Nothing was sent from the Studio.** | `/u/preview` was opened in a browser where the Studio never pressed **Preview 3D**. The preview lives in that one browser. | Click **Open the Studio**, then **Preview 3D**. |
| **This link no longer opens a flat.** | A buyer link (`/s/…`) was turned off by staff, has expired, or never existed. | Buyer: ask your sales contact for a fresh link. Staff: make a new one with ⋯ → **Share link**. |
| **The flat could not be fetched.** | A buyer link could not reach the online database: no internet, or the database is not set up on this site. | Check the connection and click **Try again**. If it keeps happening, the database needs a look (Docs/SETUP_SUPABASE_ON_VERCEL.md). |
| **No 3D on this device**, with the flat's name and its plan | This browser or computer cannot draw 3D (it has no WebGL 2), or the 3D stopped twice even at Lite. | Try another browser (Firefox, Chrome or Edge) or another computer, then **Try again**. The plan beside it is the real plan. |
| **Something broke here.** | A fault in the page itself. Plotline never leaves a blank white screen: this card replaces the page. It also shows when the site was updated while the page was open and a piece of it could not load. | Click **Reload** (most of the time that is all), or **Go back**. Staff: the details are in the browser's console (F12) — send them to the developer. |
| **Switched to Lite: the 3D stopped on this device.** (one line on the start screen) | The graphics gave up once; Plotline opened again at Lite by itself. | Nothing — walk on. **Change** beside it picks another quality. |

While a page is still arriving you see its outline in pale shapes (the Studio's bars, the start screen's column) — never a blank screen or a "Loading…" word in the corner.
