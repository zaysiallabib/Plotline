# BUILD_PLAN.md — Plotline, first 6 weeks (tool/license model)

Plotline is a TOOL the developer's team will use — licensed per tower or by
subscription. The founder writes all the code (VS Code + Claude Code). Budget
is $0: free tiers only (Vite/React/TS/Three.js, Supabase free tier, Vercel
free tier, CC0 assets). The week-6 kill gate is ≥2 developers who have PAID
for pilot licenses.

## Week 1 — the pitch demo (all coding, no editors, no backend)

Goal: one real unit, walkable and furnished, at a free public URL by Friday.

1. **Scaffold + deploy.**
   > Create a Vite + React + TypeScript app with Three.js (latest). Empty
   > scene, hemisphere + directional light, mobile-friendly first-person
   > controls (touch tap-to-move; desktop WASD + pointer lock). Deploy to
   > Vercel (free .vercel.app URL).
2. **Core types + one real unit as data.** Copy `src/core/types.ts` from
   ARCHITECTURE.md. Then paste a real floor plan image into Claude Code:
   > Here is a floor plan image and our Unit type. Read the printed room
   > dimensions and labels (e.g. BED-1 14'-5" x 14'-4") and draft
   > src/data/units/unit-a.json: vertices, walls (with thickness), openings.
   > Ask me about anything ambiguous instead of guessing.
   No measuring — the architect printed every dimension. You correct the
   draft; ~1 hour of arithmetic checking, not days.
3. **Geometry core + tests.**
   > Implement deriveRooms, wallMesh (with opening holes), floorMesh,
   > ceilingMesh, validate as pure functions with Vitest tests. Walls are
   > arbitrary-angle; never assume rectangles. Plan first, then implement.
4. **Furnish minimally.** ~15 license-verified, style-consistent glTF assets
   (record each in assets/MANIFEST.md). Bedroom + living presets; placements
   land in the unit JSON.
5. **Options + Bangla + sun + polish.** 2–3 floor/wall options with BDT deltas
   (structured brand/sku), Bangla/English toggle, room name/size/per-sqft
   overlay, sun-angle slider wired to `facingDeg`. Verify the perf budget on a
   real cheap Android. Deploy.

**Friday gate:** URL opens < 8 s on a cheap Android over mobile data.

## Week 2 — show it + start the Studio

- **3 discovery demos** (not sales calls): show the link to developer-connected
  contacts; watch what they tap, note every question. Their reactions steer
  weeks 3–6. This is a hard task, not optional.
- Start the Studio (now the PRODUCT, not internal tooling): load plan image,
  set scale, click corners to place vertices.

## Weeks 3–4 — Studio v1 + real backend

- **Dimension-driven tracing:** click a corner, type the printed length
  (accept 14'5", 14.4, 4.4m), wall sizes itself; snapping to vertices/axes;
  openings with widths; wall thickness; export/import unit JSON.
- Produce units #2 and #3 with the Studio from real plans. Track minutes per
  unit — the adoption metric. Target: < half a day end-to-end, trending to
  15 minutes of tracing.
- Supabase: orgs/projects/units/share_links/buyers/events tables, RLS on all,
  **two-tenant RLS test before any real buyer data**. Signed share links,
  link-open events with geo.

## Weeks 5–6 — buyer loop + paid pilots

- Object-anchored comments (raycast → stable ID + offset → event row), buyer's
  copy of choices (printable/WhatsApp-able page), "share this exact
  configuration" button, presets for all room kinds, perf pass (merge,
  Draco/KTX2, atlas) re-verified on the cheap Android.
- Pilot pitches to sales heads. Pilot deal: discounted but PAID (free pilots
  produce polite lies), founder personally onboards and drives the tool with
  their team (white-glove ≠ service business; it's onboarding + QA).
- Only when a pilot says yes: start trade license / bank / bKash paperwork.

**Week 6 KILL GATE:** ≥2 developers paid → continue to Phase B (change-list
PDF, offline sales-office mode, customer-usable furniture arranging). <2 →
fallback: architect/interior firms get exactly 4 weeks and 10 pitches with the
same tool; if that also fails, stop building. No third pivot on this codebase.

## Standing weekly checklist

- Cheap-Android test (8 s / 30 fps / 5 MB) over mobile data.
- Off-site backup: Supabase dump + unit JSONs + kit.
- Metrics: demos, paid pilots, cash, minutes-to-trace, opens, %-abroad,
  forwards, selections, change requests.
- Read every Claude Code diff before accepting; `npm test` green on main.

## Explicitly cut from weeks 1–6

Drag-and-drop furniture placement editor (presets + JSON overrides instead) ·
pixel-based floor-plan auto-detection (later: AI reads the PRINTED dims and
labels — "AI drafts, human confirms" — in Phase C) · buyer geometry editing ·
VR/AR · photorealism · cost-estimation engine · self-serve dashboard ·
payments integration · native apps.

### Note: we are holding off on android, VR, and Bangla language. Build the pc versoin first