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

In one sentence: this is the online storage that keeps your company's projects, the buyer links and what buyers write, and keeps each developer company's work apart from the others.

Built 2026-11-20 (sessions 30 and 31). The SQL is `supabase/migrations/` (pasted by the founder:
`Docs/SETUP_ACCOUNTS.md`); the browser talks to it through one client, `src/lib/supabase.ts` (supabase-js).

Tables (RLS — "row level security", the database's own rule about which rows each person may touch — is on every one; "tenant" = one developer company, `orgs`):
- `orgs`, `org_members` (user, company, `owner | staff`) — the companies and who belongs to which. The founder makes a company and its first owner in the SQL editor (`private.add_member`); from then on owners manage their people in the Studio (Members) through the database functions `org_people`, `invite_member`, `cancel_invite`, `remove_member`, `set_member_role`.
- `org_invites` (company, email, role) — an owner's invitation, not a member yet. The invited person's first sign-in with that email (confirmed by the sign-in link) turns it into a membership (`accept_invites`, asked by the Studio when an account is in no company). No browser can read or write this table directly.
- `projects` — a Studio `Project` or one loose `Unit`, stored as JSON (a plain structured-text format). `version` stops two people overwriting each other unnoticed (optimistic concurrency: a save says which version it started from, and is refused if someone saved in between). Never deleted: Delete hides it (`deleted_at`).
- `project_versions` — every save, written by a trigger (an automatic step inside the database), append-only: nobody can change or remove a row.
- `units` + `share_links` — what a buyer link shows (a frozen copy of the flat) and its token (the long random code in the link that cannot be guessed). A link can be turned off. It counts its views (opens by anyone outside the company); `project_links` lists a project's links for the Studio's Links card.
- Storage bucket `plans` — the plan pictures: private, one folder per company (`<company id>/<sha-256>.png|jpg|webp`, 10 MB each). A save (`projects.data.pictures`) names each drawing's picture by its path; the bytes live only in the bucket. Nothing in it is ever changed or deleted, so every saved version still finds the picture it was traced on.
- `events` — append-only buyer notes and finish choices on a link. This IS the change list.

The browser side:
- `src/lib/auth.ts` — email sign-in links (PKCE, explained under Security), the session (the signed-in state), the person's company.
- `src/lib/cloud.ts` — saves with the version it started from; lists, opens, renames and deletes; history; the 2-second autosaver and its status word. Each browser tab remembers the version IT opened or saved (a save in another tab never moves it), so two tabs cannot overwrite each other silently either.
- `src/lib/members.ts` — the member rules (who may invite, remove, change roles) and their database calls.
- `src/lib/pictures.ts` — plan pictures online: sent once per picture (named by its bytes), named in the save, fetched by a colleague when a drawing opens.
- `src/lib/events.ts` — the buyer outbox and the change list.
- Not configured (no env, i.e. the two values are not set) = no client: every path stays in the browser, as before.

Proof: `supabase/tests/two_tenants.sql` (paste it after the migration; it undoes everything it made) — mandatory again
for every change to the tables' shape (schema).

## Security

What this protects for you: a buyer sees only the flat you shared, a rival developer using Plotline never sees your work, and nothing a stranger types into the site can change your data. In plain words below; the code that enforces each point is named in brackets.

- **A buyer link opens one flat and nothing else.** It reaches only the flat it was made for, while the link is on
  (`unit_by_token`), and can add notes / finish choices to that link (`add_event`). Nothing else: no table,
  no other link, no project, no company, no plan picture (the `plans` bucket has no rule for buyers at all). A turned-off link opens nothing and takes nothing (`revoke_link`).
- **The public key in every page cannot read your data.** It can do the same as a buyer link — those two calls — and ask
  Supabase for a sign-in email. It reads and writes no table (privileges revoked from `anon`, the name for an unsigned visitor, and RLS
  everywhere behind that).
- **Company A can never touch company B.** Every row carries its company and the
  database answers only the signed-in person's company (RLS policies on every table). A cannot read, save
  over, add to, delete, share or turn off anything of B's, cannot add itself to B, and cannot make a
  company. A cannot see B's people or plan pictures, invite into B, or put a picture in B's folder.
  `supabase/tests/two_tenants.sql` checks each of these, and was itself checked by breaking each guard in turn (it
  must then fail: 32 broken guards, each caught — PGlite run, session 31).
- **Your own staff can do their work, and no more.** Members read, create and save projects; read the history (never
  change it); make and turn off share links; read the change list; read and add their company's plan pictures (never
  change or delete one). Only an **owner** invites, removes people or changes roles — never removing themself, never
  leaving the company without an owner (`invite_member`, `remove_member`, `set_member_role`; checked in the database, the
  company's row locked so two owners cannot both step down at once). An invite joins only the person who can open that
  email's sign-in link, and only into the company that invited it. A save names the version it started
  from; the database stamps the next version, who and when (a browser cannot forge them).
- **Buyer links cannot be guessed.** Share tokens are 128 random bits made by the database (`gen_random_bytes(16)`), never by a browser.
- **The master key is never in the website.** Only the publishable key is in the browser; the build refuses a
  secret / `service_role` key (`vite.config.ts`). The founder's tools (`private.add_member`,
  `private.adopt_old_links`) live in a part of the database (a schema) the website cannot reach.
- **No passwords to steal.** Sign-in is an emailed link (Supabase Auth). The link only works in the browser that
  asked for it (PKCE: the browser keeps a secret that matches a code in the link), so a forwarded or intercepted email is
  useless. It brings the person back only to this site's `/studio` (`emailRedirectTo` = this origin;
  Supabase refuses any address not on its Redirect URLs list — no open redirect, no login forgery from
  another site).
- **Staff email addresses are kept private.** Plotline does not log them (no console output, no error text with the address; the founder's
  SQL error for an unknown address does not repeat it). They live in Supabase Auth only.
- **Abuse is slowed down.** Rate limits are Supabase's own (Dashboard → Authentication → Rate Limits): sign-in emails per hour,
  one link a minute per address, sign-in and token requests per IP address. Buyer notes have no limit per link
  yet (8 KB a row); a spammed link is turned off.
- **A stranger can make an empty account, and it is useless.** Anyone can create one (by asking for a link); it reaches nothing until the founder adds
  it to a company. To close even that: turn off sign-ups in Supabase and invite people instead.
- **The old staff key stops working when you say so.** The Phase 0 staff key reaches only links made before accounts (no company) and stops working
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
