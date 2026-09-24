# CLAUDE.md — Plotline

Plotline is a "digital show flat" TOOL, licensed to Bangladeshi real-estate
developers pre-selling apartments: their team traces a unit's floor plan
(typing the dimensions printed on the plan), generates a furnished 3D
walkthrough that opens in a phone browser, and shares buyer links. Buyers
explore, pick developer-approved finish options (with BDT price deltas), and
file object-anchored comments/change requests logged in a shared change list.
The Studio (tracing editor) is part of the product, not internal tooling.
Budget rule: $0 until revenue — free tiers and free assets only.

The full plan lives in the Plotline Claude project (`plotline-masterplan-v2.md`).
Architecture details: see ARCHITECTURE.md. Build order: see BUILD_PLAN.md.

## Stack

- TypeScript + React + Vite
- Three.js (latest release — never pin to old r-versions)
- Supabase (Postgres, auth via magic/signed links, storage)
- Deploy: Vercel
- Tests: Vitest — ONLY for the geometry core (`src/core/`)

## Non-negotiable invariants

1. **Wall graph is the single source of truth.**
   Vertices → wall segments (each wall may border two rooms) → openings
   (doors/windows) as children of a wall with `{offsetM, widthM, heightM, sillM}`.
   Rooms are DERIVED faces of the graph, never stored as independent polygons.
   Never duplicate a wall per room. A door cut in a wall affects both rooms.
2. **Walls are arbitrary-angle.** Never assume axis-aligned/rectangular rooms.
   Real Dhaka plans have chamfered corners, angled balconies, thick shear walls.
3. **All lengths in meters (floats), all money in integer BDT.** Pixels exist
   only inside the tracing editor, converted at the boundary.
4. **Stable IDs everywhere.** Every wall, opening, room, furniture instance, and
   finish option has a ULID. Comments/change requests anchor to those IDs plus a
   local offset — never to world coordinates alone.
5. **Finish options are structured:** `{brand, sku, label_bn, label_en,
   priceDeltaBdt}` — never free-text strings.
6. **Buyer selections and events are append-only** rows with timestamps. Never
   update-in-place a change-list entry; supersede it.

## Performance budget (launch requirement — check before merging 3D changes)

- < 5 MB initial payload; interactive < 8 s on a 3-year-old Android over 4G
- ~30 fps sustained on a low-end device; < 100 draw calls in a furnished unit
- Furniture kit: one style-consistent set, Draco-compressed glTF, KTX2 textures,
  shared atlas where possible; merge static meshes per room

## Security rules

- Supabase RLS on every table, no exceptions. Change lists contain buyer phone
  numbers and negotiated prices: cross-tenant reads are a business-ending bug.
- Every RLS change must be verified with the two-tenant test
  (`src/test/rls.test.ts` pattern): tenant A must fail to read tenant B.
- Share links are unguessable signed tokens, view-scoped. No public table reads.
- Never commit secrets; use `.env.local` (gitignored) and Vercel env vars.

## Furniture assets

- Only assets whose license is verified (CC0 or explicit commercial-ok).
- Every asset recorded in `assets/MANIFEST.md`: source URL, author, license,
  date checked. If a license is unclear, do not ship it.
- One coherent visual style. Do not mix realistic and low-poly/cartoon assets.

## Working rules for Claude Code sessions

- Plan before implementing anything that touches `src/core/` (the wall graph).
- Small commits, each one working. Feature branches; never commit to main.
- After geometry changes: `npm test` must pass; add tests for new geometry.
- Bangla + English for all buyer-facing strings (`src/i18n/`), Bangla first.
- Don't add abstractions, frameworks, or "hireability" layers speculatively.
- The Studio tracing editor IS the product (dimension-driven: click corner,
  type printed length). But no drag-and-drop furniture placement editor in the
  first 6 weeks — per-room presets + the per-unit config file are the
  mechanism until paying customers demand more.
