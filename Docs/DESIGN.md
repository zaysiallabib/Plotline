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
| `--muted` | #6b7077 | labels, hints |
| `--line` / `--hairline` | 14 % / 8 % ink | a drawn edge / a quiet edge |
| `--accent` | #2458a6 | the one accent; white text on it |
| `--accent-soft` | 10 % accent | an "on" toggle's wash (Finishes on, Wind on) |
| `--danger` | #b5432b | terracotta: refused, broken, delete |
| `--glass` / `--glass-strong` | marble 80 % / 94 % + `--blur` | floating panels over the 3D |

Contrast: ink on marble 15:1, muted on marble 4.9:1, white on accent 7:1. Everything passes AA; body text passes AAA.

## Type

- Interface: **Instrument Sans** (`--font`), 400 for text, 500 for a selected thing or a label, 600 never.
  Scale `--fs-2xs … --fs-xl` = 10 · 11 · 12 · 13 · 15 · 18. Tabular numerals everywhere (`tnum` is on at the root).
- Display: **Instrument Serif** (`--font-display`), 400 only, italic for emphasis inside a title. Scale
  `--fs-2xl … --fs-5xl` = 28 · 45 · 73 · 118 (golden steps). Letter-spacing −0.01em, line-height 1.05.
  Where: the room's name in the walk, the Studio's empty state ("Start with a plan"), the front page, a sheet's title.
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
  in muted sans. No box behind it: a soft marble blur under the text only (`.glass` with no edge and `--radius` 0 is
  fine), so the words read over any wall.

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
- Finishes, Comment, the change list, the Sun & wind card: glass panels, 320 px wide, docked to their button, inscription
  titles, white picked rows.

### Studio (`/studio`)
- The sheet is marble with the grain; the plan picture sits on it like paper; walls are ink, the selected wall accent,
  openings as the architect draws them. Hover: `--accent-line`.
- Left: the tool rail (icons 20 px, a tooltip with the key, the picked tool white with `--shadow-sm`). Top: one bar —
  the wordmark, the drawing's name and floor, Undo / Redo, Auto-trace, Preview 3D (the one primary button), Building, ⋯.
- Right: the inspector (320 px, white, hairline left edge): Steps as a quiet list, Selection, Issues with the three
  severity dots (terracotta / amber / grey).
- Empty state: "Start with a plan" in the serif at `--fs-3xl`, the drop zone a dashed hairline on marble, the New
  project card white.

## Phones (coming: the viewer first)

- `viewport-fit=cover`; padding from `env(safe-area-inset-*)`.
- Controls grow to 44 px under `pointer: coarse`; the top pill becomes a bottom bar; panels become bottom sheets
  (`--r-lg` top edges, drag handle, 70 vh).
- Walk: one finger drags to look, a tap on the floor walks there, two fingers pinch in the dollhouse. No keys shown in
  hints under a finger.

## Banned (so no one drifts back)

Gold or any yellow accent · dark panels · a pill on an ordinary button · text under 11 px except an inscription ·
more than one accent on a screen · a border above 1 px · a glow, a gradient, a slide-in from the side · a toast that
is not an answer to something the person just did · a hint that stays on screen while the person is looking at the 3D.
