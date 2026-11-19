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

Built 2026-11-20 (session 30). The SQL is `supabase/migrations/` (pasted by the founder:
`Docs/SETUP_ACCOUNTS.md`); the browser talks to it through one client, `src/lib/supabase.ts` (supabase-js).

Tables (RLS on every one; tenant = developer company, `orgs`):
- `orgs`, `org_members` (user, company, `owner | staff`) — written only in the SQL editor (`private.add_member`).
- `projects` — a Studio `Project` or one loose `Unit` as JSON, `version` for optimistic concurrency; never
  deleted (Delete hides it: `deleted_at`).
- `project_versions` — every save, written by a trigger, append-only (nobody can change or remove a row).
- `units` + `share_links` — what a buyer link shows (a frozen copy) and its token; a link can be turned off.
- `events` — append-only buyer notes and finish choices on a link (this IS the change list).

Client: `src/lib/auth.ts` (email magic links, PKCE; the session; the person's company), `src/lib/cloud.ts`
(save with the version it started from, list / open / rename / delete, history, the 2 s autosaver and its
status word), `src/lib/events.ts` (the buyer outbox, the change list). Not configured (no env) = no client:
every path stays in the browser, as before. The plan picture is not in the cloud yet (Supabase Storage, later).

Proof: `supabase/tests/two_tenants.sql` (paste after the migration; it rolls itself back) — mandatory again
for every schema change.

## Security

In plain words; the code that enforces each point is named in brackets.

- **What a buyer link can reach.** Only the one flat it was made for, while the link is on
  (`unit_by_token`), and adding notes / finish choices to that link (`add_event`). Nothing else: no table,
  no other link, no project, no company. A turned-off link opens nothing and takes nothing (`revoke_link`).
- **What the public key (in every page) can do.** The same as a buyer link — those two calls — and ask
  Supabase for a sign-in email. It reads and writes no table (privileges revoked from `anon`, and RLS
  everywhere behind that).
- **What a member of company A can do to company B.** Nothing: every row carries its company and the
  database answers only the signed-in person's company (RLS policies on every table). A cannot read, save
  over, add to, delete, share or turn off anything of B's, cannot add itself to B, and cannot make a
  company. `supabase/tests/two_tenants.sql` checks each of these, and was itself checked by breaking each
  guard in turn (it must then fail).
- **What a member can do in their own company.** Read, create and save projects; read the history (never
  change it); make and turn off share links; read the change list. A save names the version it started
  from; the database stamps the next version, who and when (a browser cannot forge them).
- **Share tokens** are 128 random bits made by the database (`gen_random_bytes(16)`), never by a browser.
- **No secret key in the website.** Only the publishable key is in the browser; the build refuses a
  secret / `service_role` key (`vite.config.ts`). The founder's tools (`private.add_member`,
  `private.adopt_old_links`) live in a schema the website cannot reach.
- **No passwords.** Sign-in is an emailed link (Supabase Auth). The link only works in the browser that
  asked for it (PKCE: a code plus a secret this browser keeps), so a forwarded or intercepted email is
  useless, and it brings the person back only to this site's `/studio` (`emailRedirectTo` = this origin;
  Supabase refuses any address not on its Redirect URLs list — no open redirect, no login forgery from
  another site).
- **Emails are not logged** by Plotline (no console output, no error text with the address; the founder's
  SQL error for an unknown address does not repeat it). They live in Supabase Auth only.
- **Rate limits** are Supabase's own (Dashboard → Authentication → Rate Limits): sign-in emails per hour,
  one link a minute per address, sign-in and token requests per IP. Buyer notes have no limit per link
  yet (8 KB a row); a spammed link is turned off.
- **Anyone can create an empty account** (by asking for a link); it reaches nothing until the founder adds
  it to a company. To close even that: turn off sign-ups in Supabase and invite people instead.
- **The old staff key** (Phase 0) reaches only links made before accounts (no company) and stops working
  for good when the founder deletes it (`SETUP_ACCOUNTS.md`).

## Routes (the addresses)

One page (`index.html`), no router: `src/main.tsx` picks the app from the address and loads only that one.

- `/` — the front page (`src/landing/`): plain React + CSS + one small canvas, no three.js. `/` with `?c=`, `?floor=`,
  `?staff=` or `?view=` (an old share link or staff bookmark) opens the viewer instead — `landing/route.ts landingOrViewer`.
- `/u/<stem>` — the viewer on a built-in flat or level; `/u/preview` — the Studio's draft; `/s/<token>` — a published buyer link.
- `/studio` — the Studio. `/changes` — the staff change list.
- Anything else opens the viewer, which sends it to the first built-in unit.

## Repo layout

```
plotline/
  CLAUDE.md  ARCHITECTURE.md  BUILD_PLAN.md
  assets/MANIFEST.md            # licenses
  src/
    core/       # wall graph + geometry (pure, tested)
    three/      # scene generation, controls, perf
    furnish/    # kit registry + presets
    landing/    # the front page at / (no three.js)
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
