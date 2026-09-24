# ARCHITECTURE.md — Plotline

Plain-language spec of how Plotline is built. Read CLAUDE.md first for the
invariants; this file is the detail.

## The pipeline (floor plan → buyer link)

```
plan PDF/image
   │  (1) TRACE: user marks corners in the Studio and TYPES the dimensions
   │      printed on the plan (e.g. 14'5") — walls size themselves
   ▼
Unit definition (JSON)  ←── week 1 only: drafted by Claude Code from the
                            plan image's printed dims, corrected by hand
   │  (2) WALL GRAPH: validate, derive rooms
   ▼
3D generation (walls, floors, ceilings, openings)
   │  (3) FURNISH: per-room presets from the curated kit + per-unit overrides
   ▼
Furnished scene + finish options
   │  (4) PUBLISH: upload unit JSON + assets, mint signed share link
   ▼
Buyer link (phone browser)  → comments/selections → Supabase → change list
```

## Core data model (src/core/types.ts)

```ts
type Id = string; // ULID

interface Vertex { id: Id; x: number; y: number }          // meters, plan space
interface Wall {
  id: Id; a: Id; b: Id;            // vertex ids, arbitrary angle
  thicknessM: number;              // partition ~0.125, shear/exterior ~0.25
  heightM: number;
  openings: Opening[];
}
interface Opening {
  id: Id; kind: 'door' | 'window';
  offsetM: number;                 // along wall from vertex a
  widthM: number; heightM: number; sillM: number;  // sill=0 for doors
}
interface Room {                    // DERIVED from the graph — never authored
  id: Id; name_bn: string; name_en: string;
  kind: 'bed' | 'living' | 'dining' | 'kitchen' | 'bath' | 'balcony' | 'other';
  wallIds: Id[]; areaSqm: number;
  floorFinishSlot: Id; wallFinishSlot: Id;
}
interface FinishOption {
  id: Id; slot: 'floor' | 'wall' | 'fixture';
  brand: string; sku: string; label_bn: string; label_en: string;
  priceDeltaBdt: number;           // integer taka
  material: MaterialRef;           // texture/color set in the kit
}
interface FurniturePlacement {
  id: Id; assetId: Id; roomId: Id;
  x: number; y: number; rotationDeg: number; scale?: number;
}
interface Unit {
  id: Id; projectId: Id; name: string;
  floor?: number; facingDeg?: number;   // compass: 180 = south-facing
  vertices: Vertex[]; walls: Wall[];
  furniture: FurniturePlacement[];      // preset output + hand overrides
  options: FinishOption[];
  areaSqft: number; priceBdt?: number;  // for per-sqft display
}
```

Geometry algorithms in `src/core/` (pure functions, unit-tested):
- `deriveRooms(graph)` — find enclosed faces (planar face traversal)
- `wallMesh(wall)` — wall solid with opening holes, both sides correct
- `floorMesh(room)`, `ceilingMesh(room)` — triangulated from derived face
- `validate(unit)` — dangling vertices, overlapping walls, unclosed loops

## 3D generation & performance (src/three/)

- Extrude walls/floors/ceilings from the graph; openings cut real holes.
- Furniture: curated kit (~30 glTF assets, one style, Draco + KTX2).
- Merge static geometry per room; instance repeated assets; target < 100 draw
  calls, < 5 MB initial, 30 fps on low-end Android. Lazy-load per-room assets.
- Lighting: hemisphere + one directional "sun" whose angle derives from
  `facingDeg` + time-of-day slider (the Asr-sunlight feature); baked AO later.
- Controls: first-person walk + tap-to-move fallback (mobile-first), collision
  against the wall graph (cheap 2D segment test, not 3D physics).

## Furnishing presets (src/furnish/)

- `presets/bedroom.ts`, `living.ts`, ... : rules placing kit assets by room
  size/shape ("bed against longest wall without openings").
- Output = FurniturePlacement[] written into the unit JSON; operator hand-tweaks
  values there. There is NO in-app placement editor (see CLAUDE.md).

## Backend (Supabase)

Tables (all RLS-protected, tenant = developer org):
- `orgs`, `projects`, `units` (unit JSON in storage, row holds metadata + version)
- `share_links` (unit_id, signed token, buyer label, expires)
- `buyers` (name, phone — minimal PII)
- `events` (append-only: link_open {geo, ua}, selection {optionId}, comment
  {anchorId, offset, text}, change_request, approval — this IS the change list)
- `assets` manifest mirror (license audit)

Access: operator app uses authenticated role; buyer link uses the signed token
via an edge function / RPC that scopes every read/write to that unit. The
two-tenant RLS test is mandatory for every schema change.

## Repo layout

```
plotline/
  CLAUDE.md  ARCHITECTURE.md  BUILD_PLAN.md
  assets/MANIFEST.md            # licenses
  src/
    core/       # wall graph + geometry (pure, tested)
    three/      # scene generation, controls, perf
    furnish/    # kit registry + presets
    viewer/     # buyer-facing React app (Bangla-first)
    studio/     # tracing editor — part of the PRODUCT (weeks 2–4):
                # dimension-driven input, snapping, openings, publish
    data/units/ # hand-authored unit JSONs (week 1)
    i18n/  lib/supabase.ts
  supabase/migrations/
```

## Phasing (what exists when)

- **Phase 0 (wk 1):** unit JSON drafted from the plan's printed dims →
  generated, furnished, deployed demo. No editors.
- **Phase A (wk 2–6):** Studio tracing editor (dimension-driven — this IS the
  product the developer's team uses); Supabase links, comments, events;
  presets; perf budget enforced; paid pilots.
- **Phase B (mo 2–3):** change-list PDF export, buyer copies, offline
  sales-office mode (service worker + preloaded assets), customer-usable
  furniture arranging, analytics.
- **Phase C (mo 3+):** template library (reuse traced graphs + finish sets),
  whole-tower parameterization (floor/orientation variants), AI-assisted
  import (read printed dims + labels; AI drafts, human confirms), self-serve
  onboarding.
