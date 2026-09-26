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
- Level templates (ground / basement / typical floor / rooftop, each with
  its own furnishing rules) are parked until the living floors are done
  (founder, 2026-09-26).

## Stack

- TypeScript + React 19 + Vite 8
- Three.js latest (0.186+) — never pin to old r-versions; WebXR via built-in
- Supabase (later — Phase A/B), deploy: Vercel
- Tests: Vitest — ONLY for `src/core/` (geometry) and `src/furnish/presets`

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
