# Plotline design language — "Marble" (session 31, 2026-11-20)

The founder's verdict on the old look: black and gold "feels cheap, wannabe elegant". This replaces it from scratch.
Nothing of the old language survives: no gold, no dark glass, no pill on every button. The tokens live in
`src/index.css`; every screen reads them and types no colour, size or easing of its own.

## The idea

Greek architecture: stone, light, proportion. Marble that is slightly warm, charcoal ink, one deep Aegean blue, and
terracotta only where something is refused. The 3D is the product; the interface is the thin marble frame round it.
Lines and air separate things, not boxes and shadows. Labels are inscriptions: small capitals, widely tracked.
Titles are a serif. Everything else is a plain sans.

Five rules, in order of weight:

1. **The 3D first.** Over the 3D nothing stays on screen that the person is not using. The HUD fades when the mouse
   rests; one key (H) or the eye button hides it entirely ("Clean view"). A buyer should be able to look at the flat
   with nothing on screen at all.
2. **Light, not dark.** Surfaces are marble (`--bg`) and white (`--surface`). Glass over the 3D is frosted marble
   (`--glass`), ink text on it. It reads over a sunlit room and over the night alike.
3. **One accent.** Aegean blue (`--accent`) for the primary action, the selected state, links and focus. Never two
   accents on one screen. Terracotta (`--danger`) only for a refusal or a delete.
4. **Proportion over decoration.** 8-pt spacing, a 1.2 type scale for the interface, golden steps for display
   sizes, stone edges (6 / 10 / 14 px), one control height (36 px; 44 px under a finger). No gradients, no glow, no
   borders thicker than a hairline, no drop shadow except under something that floats.
5. **Motion is physical and short.** 120–180 ms expo-out for state, 400 ms for a panel opening, nothing bounces or
   slides in sideways. The front page's story is driven by the scroll, not by timers.

## Colour

| token | value | use |
|---|---|---|
| `--bg` | #f5f3ef | marble: pages, the Studio sheet, the base of the glass |
| `--surface` | #ffffff | raised: panels, cards, inputs |
| `--surface-2` | #ece9e3 | sunken: wells, the picked row, a rail's base |
| `--ink` | #17191c | text, icons |
| `--ink-2` | #4b4f55 | second text |
| `--muted` | #62666d | labels, hints |
| `--line` / `--hairline` | 14 % / 8 % ink | a drawn edge / a quiet edge |
| `--hover` / `--press` | 5 % / 9 % ink | a button under the mouse / pressed |
| `--accent` | #2458a6 | the one accent; white text on it (`--accent-ink`) |
| `--accent-soft` / `--accent-line` | 10 % / 40 % accent | an "on" toggle's wash (Finishes on, Wind on) / the Studio's hover edge |
| `--danger` / `--danger-soft` | #b5432b / 10 % | terracotta: refused, broken, delete / its wash |
| `--sev-red` / `--sev-amber` / `--sev-grey` | `--danger` / #b4791f / `--muted` | the Studio's three severities (Issues, Check these marks) |
| `--ok` | #3a7d5c | a passed check |
| `--wind` | #5b8db8 | the wind lines' base tint |
| `--glass` / `--glass-strong` | marble 80 % / 94 % + `--blur` | floating panels over the 3D |

The 3D scene cannot read CSS, so `src/three/PlotlineScene.ts` keeps two copies — `SEL` = `--accent` (a picked piece,
opening or low wall: the accent 2 px wide over a 4 px white halo, so the edge reads on a black TV and a white wardrobe
alike) and `REFUSED` = `--danger` (a piece that cannot go there). Change them with the tokens.

Contrast (measured by `src/lib/contrast.test.ts`, which fails if a token drifts): ink on marble 15.9:1, ink-2 7.4:1, muted on marble 5.2:1 and 4.8:1 on `--surface-2`, white on accent 6.9:1, terracotta 5.0:1. Everything passes AA; body text passes AAA. On the glass over a dark night scene muted text falls under AA (about 3.3:1 over black): a label over the 3D that must be read uses `--ink-2`, or the panel uses `--glass-strong`.

## Type

- Interface: **Instrument Sans** (`--font`), 400 for text, 500 for a selected thing or a label, 600 never.
  Scale `--fs-2xs … --fs-xl` = 10 · 11 · 12 · 13 · 15 · 18. Tabular numerals everywhere (`tnum` is on at the root).
- Display: **Instrument Serif** (`--font-display`), 400 only, italic for emphasis inside a title. Scale
  `--fs-2xl … --fs-5xl` = 28 · 45 · 73 · 118 (golden steps). Letter-spacing −0.01em, line-height 1.05.
  Where: the room's name in the walk, the Studio's empty state ("Drop your drawings"), the front page, a sheet's title.
- Inscription (`.label`): 10 px, 500, capitals, `--track` 0.12em, muted. Where: over a value ("FLOOR 2"), a panel's
  section name, an eyebrow.
- Both fonts load from Google Fonts in `index.html` (free; `Docs/SOURCES.md`). The system fallbacks are set.

## Space and edges

- Spacing `--s-1 … --s-8` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 80. Padding inside a panel 16; between groups 24;
  between sections 48.
- Edges `--r-sm` 6 (inputs, small buttons), `--radius` 10 (panels), `--r-lg` 14 (sheets), `--r-pill` only for the view
  switch and tags.
- Controls: height `--control` (36; 44 with `pointer: coarse`). Horizontal padding 14. Icon-only buttons are square.
- Shadows: `--shadow` under a floating panel; `--shadow-sm` under a raised card on marble; nothing else.

## Components (the same everywhere: viewer, Studio, front page)

- **Button**: ink text on transparent, hairline edge, `--r-sm`. Hover: `--hover` fill. Primary: accent fill, white
  text, no edge. "On" (a toggle): `--accent-soft` fill, accent text. Disabled: 40 % opacity. Danger: terracotta text.
- **Segmented switch** (Walk · Dollhouse · Building; Lite · Low · High): one pill, the picked segment white with
  `--shadow-sm`; the rest muted.
- **Panel over the 3D** (`.glass`): `--glass`, `--blur`, hairline edge, `--radius`, `--shadow`, 16 px padding.
  Title row: an inscription on the left, × on the right.
- **Panel on marble** (Studio inspector, cards): `--surface`, hairline edge, `--radius`, `--shadow-sm`.
- **Input**: `--surface`, `--line` edge, `--r-sm`, `--control` tall; focus: accent edge, no glow.
- **Toast**: glass, bottom centre, fades in place (no slide).
- **Hint line** (keys): one line, muted, 12 px, bottom centre, fades after 4 s and when the HUD rests.
- **Room name** (walk, top left): inscription "FLOOR 2" over the room's name in the serif at `--fs-2xl`, then the size
  in muted sans. No box and no edge: a frosted marble rectangle under the words (70 % `--bg` + `--blur`) whose edges fade
  out over 24 px (`--s-5`), so the words read over any wall, by day and by night. Never an oval: QA found it read as a
  white smudge at night and over curtains.
- **Question card** (`src/lib/ask.ts`, `.ask` in `index.css`): every "are you sure?" in the product. A white card in the
  middle, the page behind washed with 55 % marble and taking no clicks; the question in `--fs-lg`; **Cancel** (Esc) and
  one button that names the action (Enter), terracotta when something is taken away. When it needs a word (`askText`: a
  new name, the staff key) it adds one input line, the old value in it and selected. The browser's grey `confirm()`,
  `prompt()` and `alert()` boxes are never used (`ask.test.ts` keeps all three out of `src`).
- **Not-found page** (`public/404.html`): the app's "Nothing stands at this address" in plain HTML, no script, its
  colours and fonts copied from the tokens (`route.test.ts` keeps them equal) — change both together.

## The three screens

### Front page (`/`)
The page tells one story as the person scrolls, in three acts drawn on one canvas (2D canvas, ink lines on marble;
never three.js — `/` stays small):
1. **The plan.** A floor plan sheet (the real Type A unit's walls, drawn as a plan with its printed sizes, on a
   paper-coloured sheet with the grain). The headline over it: "Plotline" in the serif, then one line.
2. **The walls rise.** As the person scrolls, the plan's walls extrude upward in an axonometric view (the wall graph is
   the data; the projection is a few lines of maths), doors and windows cut as gaps.
3. **The building.** Floors stack from the one plan into a tower; it is abstract: thin ink lines, floors slightly offset
   as they rise, a colonnade of slim columns at the ground, a flat roof plane. It never tries to be a render.
Then the sections (how it works, what buyers do, what the developer gets) in prose and the six product pictures.
One accent on the page: the primary button. Everything else is ink on marble.

### Walk / Dollhouse / Building (`/u/…`)
- Top left: the room name (above). Top right: ONE pill — the view switch, then Finishes · Comment · Share, staff's
  Edit ▾, and ⋯. Bottom centre: the hint line, the Sun & wind pill. Bottom right: the minimap (glass, no title bar).
- Rest: after 3 s without the mouse moving, everything but the room name fades to 0; the mouse brings it back.
- Clean view: H or the eye button (in ⋯ and as the last button of the top pill) hides everything, the room name too;
  a 24 px faint dot top right (and H / Esc) brings it back. Phone: a tap on the dot. Nothing else ever asks for
  attention while it is on (no toasts, no hints).
- Enter screen: marble, the flat's name in the serif, the one blue button. The quality note (Lite / Low / High) is one
  muted line under it with "Change", not a toast.
- Finishes, Comment, the rooms list, the Sun & wind card, the Edit furniture panel, the library and the How fast card
  (⋯ → How fast is it here?: each number an inscription over its value, one ordinary Copy button): glass panels,
  320 px wide (`--panel-w`), docked to their button, inscription titles, white picked rows.
- A picked piece, opening or low wall: the accent line over a white halo (above, "Colour"); a refused spot: terracotta.
- Building view: the floor rail (glass, right) has the floor numbers in the serif at `--fs-xl` and Roof / Ground / B1 as
  inscriptions; the floor under the mouse, in the rail or on the tower, is a white row and, on the tower, that storey a
  little brighter; the picked floor is an accent hairline running to the rail's edge — never a filled block, never darkness.
  On the tower the picked flat is told by **light, not lines**: everything of it seen from outside (walls, balcony fronts,
  frames, the rooms through its glass) about a fifth brighter, by day and by night, its lamps on at night; the hover the
  same, quieter (`building.ts` PICK_LIFT / HOVER_LIFT and their night light PICK_NIGHT / HOVER_NIGHT). No accent colour, no
  wash of marble on the 3D: the faces keep their own colours and contrast. The card beside the pointer (`.tower-card`): `--glass-strong`, the floor in the serif at
  `--fs-2xl`, the flat and its size as an inscription in `--ink-2`, what a click does in muted 12 px; kept on the screen
  as a note by its pin is (`noteAt`).

### Studio (`/studio`)
- The sheet is marble with the grain; the plan picture sits on it like paper; walls are ink, the selected wall accent,
  openings as the architect draws them. Hover: `--accent-line`.
- Left: the tool rail (icons 20 px, a tooltip with the key, the picked tool white with `--shadow-sm`). Top: one bar —
  the wordmark, the drawing's name and floor, Undo / Redo, Auto-trace, Preview 3D (the one primary button), Building, ⋯.
- Right: the project's column (280 px, marble, hairline left edge) — the frame of every drop: the project's name in the
  serif at `--fs-2xl`, then the inscription FLOORS over the floor rows (the floor in 500, its drawing's name, where it came
  from in muted 11 px under it; the open floor a white row with `--shadow-sm`), the floor plans, KEPT FROM THE DRAWING SET
  as folding groups by kind (name, count, ▸ / ▾), SITE and TEAM as one line each (inscription, words, link). Beside it
  the inspector (320 px, white, hairline left edge): Steps as a quiet list (Share's links under its step), Selection,
  Issues with the three severity dots (terracotta / amber / grey).
- Marks on the plan, so the sheet reads as a drawing, not an error list: terracotta = a numbered badge (it breaks the
  3D), amber = an 8 px dot whose number shows only when the mouse is near or its row is picked, grey = not drawn (the
  row is in the list); several at one spot share one outlined badge with their count.
- Empty state — one door: "Drop your drawings" in the serif at `--fs-3xl`, one line naming what it takes in `--ink-2`,
  the drop zone a dashed hairline on marble holding **Choose files…** (the screen's one blue button) and **Try a sample
  ▾** side by side; under it, behind a hairline, the inscription OPEN A PROJECT over plain rows (name left, "3 floors · 3
  drawings" muted right, a `--hover` wash under the mouse) and one link, Start an empty project. No card beside it.

## Phones (the viewer; built in session 31, not yet tried on a real phone)

- `viewport-fit=cover`; padding from `env(safe-area-inset-*)`.
- Controls grow to 44 px (`--touch`) under `pointer: coarse`.
- Narrower than 720 px: the top pill becomes a bottom bar in two rows (the view switch, then the buttons), the Sun & wind
  pill above it, the room's name smaller, the minimap top right. Panels become bottom sheets (`--r-lg` top edges, a grip
  to pull down): Finishes and Comment take half the height so the flat stays tappable above them, the rest up to 70 vh.
- 721–1080 px (a tablet upright): the pill stays at the top, the room's name just under it.
- Walk: one finger drags to look, a tap on the floor walks there, two fingers pinch in the Dollhouse and Building. No
  keys named in hints under a finger.
- The Studio is for a computer; it is not laid out for a phone.

## Banned (so no one drifts back)

Gold or any yellow accent · dark panels · a pill on an ordinary button · text under 11 px except an inscription ·
more than one accent on a screen · a border above 1 px · a glow, a gradient, a slide-in from the side · a toast that
is not an answer to something the person just did · a hint that stays on screen while the person is looking at the 3D.
