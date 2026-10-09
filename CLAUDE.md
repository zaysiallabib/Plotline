# CLAUDE.md — Plotline

Plotline is a "digital show flat" TOOL, licensed to real-estate developers
pre-selling apartments (Dhaka first): their team traces a unit's floor plan
in the Studio (typing the dimensions printed on the plan), generates a
furnished, realistic 3D walkthrough, and shares buyer links. Buyers explore,
pick developer-approved finish options (with BDT price deltas), and file
object-anchored comments/change requests logged in a shared change list.
The Studio (tracing editor) is part of the product, not internal tooling.
Budget rule: $0 until revenue — free tiers and CC0 assets only.

Full plan: `Docs/Plotline masterplan v2.md`. Architecture: ARCHITECTURE.md.
Build order: BUILD_PLAN.md. Product spec: Docs/PRODUCT_SPEC.md.
Why we don't chase render-level realism, and how to answer "why pay":
Docs/PRODUCT_PHILOSOPHY.md.
Every function a person can use, in plain words: Docs/MANUAL.md — update it in the
same commit as any change to a button, key or page (founder, 2026-10-05).
`plotline_1.2/` is the OLD prototype — read-only reference, never import from it.

## Decisions made 2026-09-24 (override older docs where they conflict)

- **English only** for now. No i18n layer until a customer asks.
- **Realism is the priority. Target = PC browsers + VR headsets (WebXR).**
  Low-end Android is NOT a launch gate. Sane limits still apply: lazy-load
  per room, ≤ 2k textures, keep initial load reasonable — but never trade
  realism for a phone budget.
- Furniture/materials/lighting come from **Poly Haven (CC0)**: photoreal glTF
  models, PBR textures, HDRI environment lighting.
- **Price is not shown** in the demo. Unit area/dimensions come from the plan.
- Phase 0 unit = the 2662–2703 sft unit repeated on floors 2–8 of the demo
  tower (`Demo drawings/Btibd/img_3.webp` is the clearest drawing; developer
  BTI). `Demo drawings/Sheltech/` (added 2026-09-26) is a second developer's
  tower — basements, ground, levels 1–6, rooftop; two ±2736 sft flats per
  level — and is the real "different plan" system test.
- **Furniture arranging (founder, 2026-09-27, extends the grid-move exception):**
  staff can move, turn and (code-built pieces only) resize furniture in the
  Studio (tool F) AND in the 3D walk view via an "Arrange" button that buyer
  links never show. Same rules everywhere: 1 ft grid, wall snap, refuse
  overlaps / blocked doors. Saved in the browser (Phase 0), shared by viewer
  and Studio. Buyers still only look, choose finishes and comment. Staff may
  also DELETE pieces (founder, same day); rooms with no pieces auto-furnish.
  Sliding doors are their own opening kind.
- **Furniture library (founder, 2026-09-27 late, extends the arranging decision):**
  staff may ADD pieces from a library (the kit) in the 3D walk view AND the
  Studio — pick an item, point at the floor / wall / ceiling, drop it (same
  rules: grid, wall snap, no overlaps / blocked doors); every piece gets
  dimensions (scanned models scale within sane limits). A longer table may
  gain chairs. Staff-only; buyers still only look, choose finishes, comment.
- **Whole-building projects (founder, 2026-10-04 — un-parks the level
  templates parked 2026-09-26):** "build whole-building projects from traced
  units". Stage 1 = a Project made in the Studio (top bar → Building): floors
  of traced flats (offset + mirrored neighbour), "repeat on floors N–M", saved
  in the browser like drafts, drawn by the Building view. Stage 2 = ground /
  basement / rooftop as traced levels shown as shells (walls, slabs, no
  furnishing). Per-level furnishing rules: un-parked the same evening (below).
- **Openings in 3D (founder, 2026-10-04):** staff may edit OPENINGS in the 3D
  view too — walk and dollhouse: remove, resize, move along their wall, change
  kind / width / height / sill, with the Studio's own rules (one reducer,
  `studio/model.ts`). Saved into the Studio draft (and the preview) so plan and
  3D never disagree; a built-in unit becomes the Studio draft first. A refused
  furniture spot keeps the piece in hand, red with the reason (same day).
  Buyers never. Moving WALLS in 3D is not part of it.
- **Free-standing walls + the other levels (founder, 2026-10-04 evening):** not
  every wall has to be extended to close a room — a wall may stand alone as
  decoration, a design choice or a wind screen, on any level and inside a flat;
  it is never an error by itself. Claude hand-authors the ground floors,
  basements and rooftops (as the five flats were), with their new elements
  (ramps, floor levels, glass walls, lawn / paving / parking / pool zones,
  planters, screens) — for ALL the projects in `Demo drawings/`. They are a
  BENCHMARK: data only; how they look comes from general rules by kind and
  geometry, and a level he traces in the Studio must come out the same — what
  Claude shows is the minimum. Buyers walk these levels too. Common levels are
  furnished by kind (lobby, rooftop, gym, pool, play area) — this un-parks the
  per-level furnishing rules; greenery (lawns, big trees, planters) is in the
  library for flats' balconies as well. Plan in HANDOFF "SESSION 19 PLAN".
- **Levels are data, the look is rules (session 19, 2026-10-04 night — built under the benchmark rule above):**
  `Wall.standsAlone` (a kept free-standing wall); `Wall.heightM` 0 = a flush "zone line" (bounds a zone, drawn as
  nothing, never carries an opening), ≤ 0.2 = kerb; wall height is measured from the lower adjacent floor; a low wall
  (< 2 m) whose openings are all passages keeps its height (a gate), a window / door still raises it. `RoomKind` has
  common rooms `lobby gym community guard` and zones `lawn paving driveway parking deck pool planter play`
  (`core.isOutdoor`: no ceiling, no flat furnishing); one `parking` face per bay, named by its number. A label's
  `levelM` / `slope` set the floor (a `pool`'s level = its water surface; steps = a sloped `paving` face). A face with an
  island inside is bridged by a zone line. A window with sill 0 and ≥ 1.5 m tall is glazing; a door ≥ 1.5 m wide is a
  pair of leaves. Levels carry no furniture / finishes — presets and the catalog apply by kind. A tower lists its
  levels in `LEVELS` (built-in and Studio towers share one shape); nothing in `src/three` / `src/furnish` may name a
  unit, project or room (`greenery.test.ts` enforces it).
- **Browser tests run in Firefox** (Playwright's build on E:, HANDOFF), never
  Edge with swiftshader — it burned the founder's CPU (2026-10-04).
- **Nothing only Claude can do (founder, 2026-10-05).** Session 19's hand-written level JSONs were rejected as a
  deliverable: "then it is Claude not Plotline". Whatever is shown must be makeable and changeable by a person in the
  product, from the plan picture. Acceptance of any Studio-made thing = an agent acting as the founder (sheet image,
  mouse, keyboard, real Studio in Firefox; no Import / JSON / code reading), run before reporting. Talk to him in plain
  words. List problems before fixing.
- **Every element is changeable (founder, 2026-10-05):** "every single element can be manipulated and changed" — if a
  person can see it, they can select it and change it, one piece without disturbing the others (one room's floor, one
  wall's paint, a column, a ramp, a tree, the ceiling…). `Docs/MANUAL.md` §11 is the scoreboard: every "No" is a job
  (approved as "B"). This overrides the older "no wall moves in 3D / nothing beyond …" limits in Working rules for
  STAFF; buyers still only look, choose finishes and comment.
- **Project-first workflow (founder, 2026-10-05) — the product's main path:**
  1. Create a project; say how many floors (basements, ground, flat floors, rooftop) and how many types.
  2. A list of all the floors stays on the right (as the Building view's picker does today).
  3. Trace each type once, from the basement up to the rooftop. **A type = one WHOLE FLOOR drawing** (all its flats +
     the lift lobby in one tracing); each flat in it can still be opened on its own. One type serves many floors, and
     ANY floor may take ANY type — never assume a pattern ("2 / 4 / 6 / 8" was only his example). "Floor types + which
     floors each one is on" comes back to the front (today it is buried in Studio → Building → A flat → "on floors N
     to M", and a type is one flat). A floor that differs a little (a 2nd floor with an extra lawn) is traced as its
     own extra.
  4. Stack the floors like Lego — interactive, game-like.
  5. Finishes are per flat / room / wall: changing a wall colour must NOT change every flat of the building.
  6. Pick a flat, show it to the client. Sun must be ACCURATE for the site and direction (needs location, date, true
     north — today it is one equinox path). Wind from real data comes later (Windy API if it fits the budget).
  7. Everything the built-in (Claude-authored) flats and levels have goes into the general library: "yours is much
     richer and that is how the generalised version should be". A plan he traces gets all of it by default — no
     component, finish choice or detail may exist only in a built-in file.
  AI drafting ("C") is not a separate button: it will live inside Auto-trace, later. Brand libraries / marketplace later.
  Order approved: A (unlock the levels: sheets, scale, tools, traps) → B (every element) with this workflow as the frame.

- **Decisions 2026-10-09 (founder, asked one by one in plain words after session 23):** (1) a room's drawn size = its
  MAIN RECTANGLE, as the sheet prints it (not the whole outline with door nooks); (2) an unread space next to a room
  stays JOINED to it (the 2026-10-03 rule stands; the dining may read longer than printed); (3) auto-trace's glass-front
  placement (window on the columns' line, rooms 5–9" short) is fixed LATER, not before new features; (4) a wall lower
  than 1.2 m (planter edge, kerb, low parapet) joins its two sides into one flat like a door (`core/flats.ts
  LOW_WALL_M`); (5) a whole-floor drawing is named "Floor plan A, B…" — "Type A / B" is only ever a flat's name from
  the sheet.

## Stack

- TypeScript + React 19 + Vite 8
- Three.js latest (0.186+) — never pin to old r-versions; WebXR via built-in
- Supabase (later — Phase A/B), deploy: Vercel
- Tests: Vitest for pure logic only — `src/core/`, `src/furnish/`, `src/trace/` (auto-trace + its eval vs the hand-traced units), and the reducers/rules in `src/viewer`, `src/studio`, `src/three` that already have tests

## Non-negotiable invariants

1. **Wall graph is the single source of truth.** Vertices → wall segments
   (each wall may border two rooms) → openings as children of a wall with
   `{offsetM, widthM, heightM, sillM}`. Rooms are DERIVED faces of the graph
   (`deriveRooms`), named via `RoomLabel` points — never stored as polygons.
   Never duplicate a wall per room. A door cut in a wall affects both rooms.
2. **Walls are arbitrary-angle.** Never assume axis-aligned/rectangular rooms.
   Real Dhaka plans have chamfered corners, angled verandas, shear walls, shafts.
3. **All lengths in meters (floats), all money in integer BDT.** Pixels exist
   only inside the Studio, converted at the boundary.
4. **Stable IDs everywhere** (`newId()` = crypto.randomUUID). Comments/change
   requests anchor to entity IDs plus a local offset — never to world coords alone.
5. **Finish options are structured:** `{brand, sku, label, priceDeltaBdt,
   material}` — never free-text strings.
6. **Buyer selections and events are append-only** rows with timestamps.
   Never update-in-place a change-list entry; supersede it.
7. `src/core/` is pure: no Three.js, no DOM, no React. `src/core/index.ts`
   signatures are the contract — extend, don't change.

## Layout

```
src/core/     wall graph + geometry (pure, tested)
src/three/    scene generation, materials, lighting, controls, WebXR
src/furnish/  kit registry (kit.data.ts generated) + presets
src/viewer/   buyer-facing React app  (route: /  and /u/:unitId)
src/studio/   tracing editor React app (route: /studio)
src/trace/    auto-trace: plan image → walls/openings/text → Unit draft + review list (pure; local first, AI backup)
src/data/units/*.json   hand-authored unit JSONs (Phase 0)
public/assets/{models,textures,hdri}/ + MANIFEST.md (licenses)
```

## Security rules (when the backend lands)

- Supabase RLS on every table, no exceptions; two-tenant test before real data.
- Share links are unguessable signed tokens, view-scoped. No public table reads.
- Never commit secrets; `.env.local` (gitignored) and Vercel env vars.

## Assets

- Only assets whose license is verified (CC0). Every asset in
  `public/assets/MANIFEST.md`: source URL, author, license, date checked.
- One coherent realistic style. Never mix low-poly/cartoon with photoreal.

## Working rules

- Plan before implementing anything that touches `src/core/`.
- Small commits, each one working. Feature branches; never commit to main.
- After geometry changes: `npm test` must pass; add tests for new geometry.
- Don't add abstractions, frameworks, or "hireability" layers speculatively.
- No drag-and-drop furniture placement editor in the first 6 weeks — per-room
  presets + the per-unit JSON are the mechanism until paying customers demand more.
  Exception: the founder's staff-only arranging (Decisions, 2026-09-27) — nothing
  beyond move / turn / resize / delete / add-from-the-kit-library (Decisions, 2026-09-27 late) without asking;
  and staff opening edits in 3D (Decisions, 2026-10-04) — nothing beyond remove / resize / move along the
  wall / change kind and size without asking (no wall moves in 3D).
