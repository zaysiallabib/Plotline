# ARCHITECTURE.md — Plotline

How Plotline is built, in plain language. Read CLAUDE.md first for the rules that never bend (the wall graph is the
truth, `src/core` is pure, metres, stable ids, structured finishes, append-only buyer events); this file is the detail.
What a person sees and clicks: `Docs/MANUAL.md`. The look: `Docs/DESIGN.md`.

## The pipeline (floor plan → buyer link)

```
plan picture / brochure PDF            architect's file (IFC, DXF, DWG*, PDF drawing, SVG, 3D model)
   │  Studio: trace by hand (typed           │  src/import: read into the SAME draft —
   │  dimensions, snapping) or Auto-trace    │  one Unit per storey + the outside shape
   │  (src/trace) + the Check these rows     │
   ▼                                         ▼
Unit (one drawing = one whole floor) ──── in a Project: floors of drawings, "this floor only" copies
   │  src/core: validate, derive rooms (faces of the wall graph) and flats
   ▼
3D (src/three): walls with real holes, floors, ceilings, openings, light, sun, the street
   │  furnished by room kind (src/furnish presets) + staff arranging + the staff's own library
   ▼
Preview 3D / Building view ──── Share link: a frozen copy in Supabase, an unguessable token
   ▼
Buyer link (/s/<token>) → notes and finish choices (append-only events) → the Change list (/changes)
```
`*` DWG only through the optional converter (`api/dwg.js`, CloudConvert).

## Core data model (`src/core/types.ts`)

All lengths in metres (floats), money in integer taka, ids from `newId()` (crypto.randomUUID).

- **Vertex** `{ id, x, y }` — a corner, plan space.
- **Wall** `{ id, a, b, thicknessM, heightM, openings[], standsAlone? }` — between two vertices at any angle. Its height
  is its type: 0 = a zone line (bounds a zone, drawn as nothing), up to ~0.2 m a kerb, under the storey a low wall.
  `standsAlone` keeps a free-standing wall that closes nothing.
- **Opening** `{ id, kind: door | window | passage | slider, offsetM, widthM, heightM, sillM, hinge?, swing? }` — a child of
  its wall, so a door cut in a wall serves both rooms. A window with sill 0 and ≥ 1.5 m tall is glazing; a door ≥ 1.5 m
  wide is a pair of leaves.
- **Pillar** `{ id, x, y, wM, hM, corners? }` — a column; four free corners make a tapered one.
- **RoomLabel** `{ id, name, kind, x, y, printedSize?, levelM?, slope?, flat? }` — a named point inside a face. Rooms are
  never stored: **Room** `{ id, name, kind, loop, wallIds, areaSqm, centroid, … }` is DERIVED by `deriveRooms` from the
  graph and the labels. `RoomKind` covers flats (bed, living, … shaft, other), common rooms (lobby, gym, community, guard)
  and zones (lawn, paving, driveway, parking, deck, pool, planter, play; `isOutdoor` = no ceiling, no flat furnishing).
- **FinishSlot** `{ id, label, target: floor | wall | ceiling, roomIds, options[], defaultOptionId }` and **FinishOption**
  `{ id, brand, sku, label, priceDeltaBdt, material }` — structured, never free text.
- **FurniturePlacement** `{ id, assetId, roomId, x, y, rotationDeg, scale?, sizeM?, removed?, openingId?, mountY?, … }`.
- **Unit** `{ id, projectName, name, floor?, northDeg, vertices, walls, pillars?, roomLabels, furniture, finishSlots,
  areaSqft, planImage?, site?, shell? }` — one drawing. `site` holds the place, the neighbour blocks, roads and ten years
  of monthly wind; `shell` places the architect's outside shape.
- **Project** (`src/data/building/projects.ts`) — the building: its plan (basements, floors, rooftop), its drawings
  (`units`), which drawing stands on which floor, and own copies for floors that differ. Built-in towers and Studio towers
  share one shape (`LEVELS`).
- **Apartment** `{ finishes?: Configuration, furniture?: FurniturePlacement[] }` — what one flat keeps (founder
  2026-11-21): one drawing in one place of its building (a floor of flats or a level; the mirrored neighbour is its own
  drawing, `<id>-m`). Key (`src/data/building/apartments.ts apartmentKey`): the drawing's id while it stands in one place
  (the key arranged layouts always had, so the Studio's F, Preview 3D and the 3D view share it), `<id>:<floor>` once it
  stands on several — a floor never changed takes the drawing's record. In the browser: `plotline.layout.<key>` and
  `plotline.finishes.<key>`; in the saved project / drawing JSON: `apartments: { <key>: Apartment }` beside
  `pictures`. Staff write it (Finishes, Edit furniture, F); a buyer link never reads or writes it — it carries the
  drawing's finishes (`finishes`) beside its baked furniture, and the address's `?c=` wins when it has a choice.

Pure functions in `src/core/` (tested): `deriveRooms` (planar faces), `deriveFlats` (rooms joined by doors, passages,
zone lines and walls under `LOW_WALL_M` = 1.2 m; the core in no flat), `validate`, `mainRectangle` / `printedSizeCheck`
(a room's drawn size against its print), `mirrorUnit`, the sun (`site.ts`, NOAA's formula) and the Dhaka wind fallback
(`DHAKA_WIND`). `src/core/index.ts` is the contract: extend, never change.

## 3D (`src/three/`)

- `PlotlineScene.ts` owns the scene: Walk (a 50° tall view, `WALK_FOV`, from 1.45 m eye height), Dollhouse, Building; collision against the wall
  graph (a 2D test, no physics); WebXR (`xr.ts`: aim and jump, 45° turns).
- Walls, floors, ceilings and joinery are built from the graph (`details.ts`, `openings.ts`): openings cut real holes,
  textures are in metres (`materials.ts`). Settled meshes are drawn as one mesh per material (`batch.ts`; the furniture
  in squares of the plan so pieces behind the camera are left out): on Type A 312 → 102 draw calls a frame on Lite,
  330 → 115 on High. The originals stay, hidden, for picking.
- No glass uses three's transmission: one transmissive surface in view makes three draw everything opaque a second time
  each frame (a scanned wall clock's face did: every view drew the flat twice). Windows are a plain dimming (`openings.ts`),
  a scan's glass is made plain glass at load (`furniture.ts plainGlass`).
- **Quality tiers** (`render.ts` `TIERS`, picked in `src/viewer/quality.ts`):

  | | sun shadow | lamps lit | lamp shadows | corner shading | rests when still | pictures |
  |---|---|---|---|---|---|---|
  | High | 2048 px | 12 | 3 | yes | no | full |
  | Low | 1024 px | 4 | 0 | no | yes | ≤ 1024 px |
  | Lite | none indoors | 2 | 0 | no | yes | ≤ 512 px |

  A slow device steps down once by itself; lost graphics fall back to Lite; no WebGL 2 shows the plan instead.
- Daylight is measured once per room (`daylight.ts`): brighter by the windows, darker deep inside, darker facing a
  neighbour 3 m away. Each piece of furniture reads the same daylight at one point, the floor under its middle
  (`pieceDayUv`, `lightPiece`), and is relit when it moves; outdoor pieces keep a neutral light. Lamps are the
  furniture's own (a lamp deleted takes its light). The street is the site's real
  blocks or a rule-made Dhaka street (`context.ts`); the flat's tower (`building.ts`: other flats as shells, the traced
  levels in full, one mesh per material per floor, built a floor at a time) stands round it in every mode — the floors
  `render.ts towerLevel` picks per tier in Walk / Dollhouse, all of them in the Building view; what the flat draws itself
  (a shared lobby, the slab over it) the tower leaves out (`sharedWith`, the lid), so no two surfaces share a place. Its
  windows are real glass with each flat's rooms behind them (`interiors.ts`: floors, ceilings, painted walls and the
  presets' furniture with their colours baked into the vertices — one program, one geometry per drawing shared by every floor,
  a lamp table per flat for the night pattern `roomLight`; round the flat only the rooms, the furniture once the Building
  view has opened); the Building view lifts the picked flat by light (a depth-matched skin that multiplies what is behind
  it), and picks the floor under the pointer (`pickAt`, `floorAtY`; a window names its flat); the
  architect's outside shape is `shell.ts`; the wind lines `wind.ts`.
- Nothing in `src/three` or `src/furnish` may name a unit, project or room (`greenery.test.ts` enforces it): the look
  comes from rules by kind and geometry, so a traced plan gets everything a built-in one has.

## Furnishing (`src/furnish/`)

- The kit: `kit.data.ts` (33 Poly Haven scans, generated) + `procedural.meta.ts` / `procedural.ts` (121 pieces built in
  code, rebuilt at a new size rather than stretched). 154 pieces, 11 library groups (`src/studio/furniture.ts`
  `library()`).
- `presets.ts` furnishes a room by its kind and shape when nobody arranged it (clear of doors; the AC off window walls,
  over no bed). Staff arranging — move, turn, resize, delete, add — follows one set of rules for the Studio's F tool and
  the 3D view (`src/studio/furniture.ts`, `src/viewer/arrange.ts`); a move is refused only outside its room, overlapping a
  piece, or (a wall piece) over a window.
- `own.ts`: the staff's own models and finish options (rules), kept by `src/lib/library.ts`. `finishes.ts`: the finish
  catalogue by slot.

## Auto-trace (`src/trace/`) and the architect's files (`src/import/`)

- `src/trace/` is pure: plan picture → walls, openings, text (tesseract.js) → a Unit draft + the Check these rows, each
  with its picture box and one-click answers. Run in workers from the Studio (`autotrace.worker.ts`, `fixes.worker.ts`).
  Measured on real sheets in `Docs/AUTOTRACE_SCOREBOARD.md`; the eval against the hand-traced units is in
  `src/trace/eval`.
- `src/import/`: every format into the same result — one Unit per storey in one frame + the outside shape as a GLB —
  and out again (DXF writer, print sheet, GLB). Detail: `Docs/FORMATS.md` §4.

## The screens

- `src/landing/` — the front page at `/`: plain React, CSS and one 2D canvas drawing the real Type A walls; never
  three.js.
- `src/viewer/` — the 3D view: `ViewerApp.tsx` (the page), `Hud.tsx` (one bar top right, the room's name top left, the
  hint and the Sun & wind pill bottom middle, the small map; everything fades after 3 s still in Walk; Clean view = H),
  `quality.ts`, `spawn.ts` / `frame.ts` (the first view and the room jumps; `frame.ts` still frames for 65° and `spawn.ts` scales it to the walk's 50° — change them together), the
  Finishes and Comment panels, `ChangeList.tsx` (`/changes`).
- `src/studio/` — the Studio: ONE reducer, `model.ts` (pure, tested; every coordinate in metres, pixels only in
  `StudioApp.tsx` / `draw.ts`), the top bar, the tool strip, the right-hand panel, the floor list, the Site panel, the
  account card.
- `src/lib/` — shared by every page: `route.ts` (which app an address opens), `pages.tsx` (the plain pages and the error
  card), `ask.ts` (the one marble question card, `ask` and `askText` for a typed word; a test keeps `confirm(`, `prompt(` and `alert(` out of `src`), the database clients.
- **The look** is one stylesheet of tokens, `src/index.css` (marble, ink, one Aegean blue, terracotta for a refusal,
  Instrument Sans / Serif), specified in `Docs/DESIGN.md`; no component types a colour, size or easing of its own, and
  `src/lib/contrast.test.ts` fails if a token's contrast drifts.

## Backend (Supabase)

In one sentence: the online storage that keeps your company's projects, the buyer links and what buyers write, and keeps
each developer company's work apart from the others.

The SQL is `supabase/migrations/` (pasted by the founder as one file, `supabase/paste-into-sql-editor.sql`:
`Docs/SETUP_ACCOUNTS.md`); the browser talks to it through one client, `src/lib/supabase.ts` (supabase-js). Not
configured (the two values not set) = no client: everything stays in the browser, as before. The client's code (56 kB
compressed) is fetched only by the first call that needs it (`getSb()`: a share link, signing in, a cloud save, the
library online, the Studio's account bar). A walk of a flat by someone never signed in on that browser never loads it:
`maySignIn()` looks for a kept session first, and `publicUrl()` writes a library file's address without the client.

Tables (RLS — "row level security", the database's own rule about which rows each person may touch — is on every one;
"tenant" = one developer company, `orgs`):
- `orgs`, `org_members` (user, company, `owner | staff`) — the companies and who belongs to which. The founder makes a
  company and its first owner in the SQL editor (`private.add_member`); from then on owners manage their people in the
  Studio (Members) through the database functions `org_people`, `invite_member`, `cancel_invite`, `remove_member`,
  `set_member_role`.
- `org_invites` (company, email, role) — an owner's invitation. The invited person's first sign-in with that email turns
  it into a membership (`accept_invites`). No browser can read or write this table directly.
- `projects` — a Studio `Project` or one loose `Unit`, as JSON, with each flat's own furniture and finishes in
  `apartments` (no table of their own: a few KB each inside the 5 MB row). `version` stops two people overwriting each other
  unnoticed (a save says which version it started from and is refused if someone saved in between). Never deleted:
  Delete hides it (`deleted_at`).
- `project_versions` — every save, written by a trigger inside the database, append-only: nobody can change or remove a
  row.
- `units` + `share_links` — what a buyer link shows (a frozen copy of the flat, with its arranged furniture, the
  finishes it was made with and the records of the own pieces it shows) and its token. A link can be turned off; it counts opens by anyone outside the
  company; `project_links` lists a project's links for the Links card.
- `events` — append-only buyer notes and finish choices on a link. This IS the change list.
- `library_items` — the staff's own furniture models, finish options and texture pictures, one record per piece or
  option ("Remove" is a mark, never a delete).
- `private.config` — the old staff key (Phase 0 links), in a part of the database the website cannot reach.
- Storage bucket `plans` — the plan pictures: private, one folder per company (`<company id>/<sha-256>.png|jpg|webp`,
  10 MB each). A save names each drawing's picture by its path; nothing in the bucket is ever changed or deleted, so
  every saved version still finds the picture it was traced on.
- Storage bucket `library` — the own library's files (`<company id>/<sha-256>.glb|jpg|png`, 30 MB each), readable by
  exact name so a buyer link (no account) draws the pieces it was shared with; only members add, nobody lists another
  company's folder, nobody changes or deletes a file.

The browser side:
- `src/lib/auth.ts` — email sign-in links (PKCE, under Security), the session, the person's company.
- `src/lib/cloud.ts` — saves with the version it started from; lists, opens, renames, deletes; history; the 2-second
  autosaver and its status word. Each browser tab remembers the version IT opened or saved, so two tabs cannot overwrite
  each other silently either.
- `src/lib/members.ts` — the member rules (who may invite, remove, change roles) and their database calls.
- `src/lib/pictures.ts` — plan pictures online: sent once per picture (named by its bytes), named in the save, fetched
  by a colleague when a drawing opens.
- `src/lib/library.ts` — the own library: kept in this browser (IndexedDB `plotline-library`), each file sent online once
  (named by its bytes), the company's records fetched when a page opens (signed in), the records a share link carries.
- `src/lib/events.ts` — the buyer outbox and the change list.

Proof: `supabase/tests/two_tenants.sql` (paste it after the migration; it undoes everything it made) — mandatory again
for every change to the tables' shape.

## Security

What this protects for you: a buyer sees only the flat you shared, a rival developer using Plotline never sees your
work, and nothing a stranger types into the site can change your data. In plain words; the code that enforces each
point is named in brackets.

- **A buyer link opens one flat and nothing else.** It reaches only the flat it was made for, while the link is on
  (`unit_by_token`), and can add notes / finish choices to that link (`add_event`). No table, no other link, no project,
  no company, no plan picture (the `plans` bucket has no rule for buyers at all). A turned-off link opens nothing and
  takes nothing (`revoke_link`). It can fetch the files of the own pieces and finishes it shows (bucket `library`,
  readable by exact name only — no rule lets a buyer list it, and a name is the company's random id plus the file's
  SHA-256); the company's library records stay members-only.
- **The public key in every page cannot read your data.** It can do what a buyer link does — those two calls — and ask
  Supabase for a sign-in email. It reads and writes no table (privileges revoked from `anon`, the name for an unsigned
  visitor, and RLS everywhere behind that).
- **Company A can never touch company B.** Every row carries its company and the database answers only the signed-in
  person's company (RLS policies on every table). A cannot read, save over, add to, delete, share or turn off anything
  of B's, cannot add itself to B or make a company, cannot see B's people or plan pictures, invite into B, put a picture
  or a file in B's folders, or read, change or list B's own library. `supabase/tests/two_tenants.sql` checks each of
  these and was itself checked by breaking each guard in turn (it must then fail: 43 broken guards, each caught — a
  throwaway Postgres run, session 31: `E:/dev/tmp/s31/library/pg/run.mjs`).
- **Your own staff can do their work, and no more.** Members read, create and save projects; read the history (never
  change it); make and turn off share links; read the change list; read and add their company's plan pictures and
  library files (never change or delete one). Only an **owner** invites, removes people or changes roles — never
  removing themself, never leaving the company without an owner (`invite_member`, `remove_member`, `set_member_role`; the
  company's row locked so two owners cannot both step down at once). An invite joins only the person who can open that
  email's sign-in link, and only into the company that invited it. The database stamps each save's version, who and when
  (a browser cannot forge them).
- **Buyer links cannot be guessed.** Share tokens are 128 random bits made by the database (`gen_random_bytes(16)`),
  never by a browser.
- **The master key is never in the website.** Only the publishable key is in the browser; the build refuses a secret /
  `service_role` key (`vite.config.ts`). The founder's tools (`private.add_member`, `private.adopt_old_links`) live in a
  schema the website cannot reach.
- **No passwords to steal.** Sign-in is an emailed link (Supabase Auth) that only works in the browser that asked for it
  (PKCE: the browser keeps a secret that matches a code in the link), so a forwarded or intercepted email is useless. It
  brings the person back only to this site's `/studio` (`emailRedirectTo` = this origin; Supabase refuses any address
  not on its Redirect URLs list — no open redirect, no login forgery from another site).
- **Staff email addresses are kept private.** Plotline does not log them (no console output, no error text with the
  address); they live in Supabase Auth only.
- **Abuse is slowed down.** Supabase's own rate limits (Dashboard → Authentication → Rate Limits): sign-in emails per
  hour, one link a minute per address, sign-in and token requests per IP address. Buyer notes have no limit per link yet
  (8 KB a row); a spammed link is turned off.
- **A stranger can make an empty account, and it is useless:** it reaches nothing until an owner or the founder adds it
  to a company. To close even that: turn off sign-ups in Supabase and invite people instead.
- **The old staff key stops working when you say so.** It reaches only links made before accounts (no company) and
  stops for good when the founder deletes it (`SETUP_ACCOUNTS.md`).
- **The browser is told what the site may load** (`vercel.json`, served the same by `npm run preview`). A
  Content-Security-Policy lets pages run code only from the site itself, plus jsDelivr (Auto-trace's reading engine) and
  WebAssembly — never a script written into a page; data may go only to the site, Supabase, the map and weather
  services (Nominatim, Overpass, OpenStreetMap, Open-Meteo), Google's AI (the optional helper, with the staff member's
  own key), jsDelivr and the Local AI on the same computer; styles and fonts only from the site and Google Fonts. The
  Studio alone also allows `eval`, because the Rhino reader (rhino3dm) needs it. The Studio and the change list cannot
  be shown inside another site's frame (`X-Frame-Options: DENY`, against click tricks); the 3D view and the front page
  can, so a developer may put a flat on their own site. Browsers are also told not to guess file types (`nosniff`), to
  send other sites only our address and never the page (`Referrer-Policy`), and that the site never uses the camera,
  microphone, location, payments or USB (`Permissions-Policy`; VR is allowed). Every address allowed, and why:
  `Docs/SOURCES.md`. **A new outside service = a line in the CSP, a row in `Docs/SOURCES.md` and a line here, in one
  commit.**
- **A missing page says it is missing.** Only the app's own addresses reach `index.html` (Routes, below); any other
  address gets `public/404.html` — no script at all — with a real 404 status, so search engines and link checkers see
  it as missing.
- Known, not yet fixed: `/studio` allows `eval` (rhino3dm needs it).

## Routes (the addresses)

One page (`index.html`), no router: `src/main.tsx` picks the app from the address (`src/lib/route.ts routeOf`, tested)
and loads only that one, each wrapped in an error card so a fault shows "Something broke here" instead of a white
screen.

- `/` — the front page (`src/landing/`). `/` with `?c=`, `?floor=`, `?staff=` or `?view=` (an old share link or staff
  bookmark) opens the viewer instead (`landing/route.ts landingOrViewer`).
- `/u/<stem>` — the viewer on a built-in flat or level (every `src/data/units/*.json`); `/u/preview` — the Studio's
  draft; `/s/<token>` — a published buyer link.
- `/studio` — the Studio. `/changes` — the staff change list.
- Anything else — the not-found page. On Vercel only `/`, `/u/…`, `/s/…`, `/studio…` and `/changes…` reach the app
  (`vercel.json` rewrites); any other address gets `public/404.html` — the same words and marble, no script — with a
  real 404 status. Its colours and fonts are copies of `index.css`'s tokens, kept equal by `route.test.ts`.
  `npm run preview` has no rewrite rules, so there it still answers 200 (the app's own not-found page).
- An unknown flat, a turned-off link, no connection and no 3D each have their own plain page (`src/lib/pages.tsx`, styled
  in `index.css` so they work even when an app's code failed to download). The tab's title names the page
  (`pageTitle`).
- A stair changes floor inside the same page: the next floor loads into the same scene and the address becomes
  `/u/<stem>?floor=N` through the browser's history (`history.pushState`), so reload, Back and Forward work without a
  page load (`src/viewer/share.ts stairUrl`).
- `api/dwg` — the one server function (Vercel), the optional DWG converter. Cache headers keep the built code for a
  year and the models, textures and front-page pictures for a week.

## Repo layout

```
plotline/
  CLAUDE.md  ARCHITECTURE.md  HANDOFF.md  README.md  BUILD_PLAN.md
  Docs/            MANUAL, KEYS, DESIGN, FORMATS, SOURCES, the setup guides, the Auto-trace scoreboards, the product spec
  src/
    core/          wall graph, rooms, flats, geometry, sun (pure, tested)
    three/         the 3D: scene, materials, light, daylight, street, Building view, wind, WebXR
    furnish/       kit registry (kit.data.ts generated) + code-built pieces + presets + finishes + own library rules
    trace/         Auto-trace: plan picture → draft + Check these rows (pure; its eval vs the hand-traced units)
    import/        the architect's files in and out (IFC, DXF, DWG, PDF, SVG, 3D models; DXF / GLB / print out)
    viewer/        the 3D view (/u/…, /s/…) and the change list (/changes)
    studio/        the Studio (/studio): model.ts is its one reducer
    landing/       the front page (/), no three.js
    lib/           routes, plain pages, the question card, the database clients
    data/units/    the built-in flats and levels (JSON); data/building/ the towers and projects
  public/          assets/ (models, textures, sky, art + MANIFEST.md), landing/ pictures, rhino3dm/, icons
  supabase/        migrations/, paste-into-sql-editor.sql, tests/two_tenants.sql
  api/             dwg.js (Vercel function)
  scripts/         verify-share.mjs, trace-fixtures.mjs
  plotline_1.2/    the old prototype — read-only reference, never imported
```

## Where it stands (session 31, 2026-11-21)

The redesign is on branch `s31/redesign`, not yet merged to main or deployed (the founder decides). Built: the "Marble"
look on every screen (`src/index.css`, `Docs/DESIGN.md`), the scroll-story front page, the 3D view's one-bar HUD with the
idle fade and Clean view, touch on phones, the Studio rebuilt, three measured quality tiers (Lite made truly light),
accounts with members, invites, plan pictures and the staff's own library online, the security headers above, every
architect's format in and out, the one marble question card (for typed words too), stairs that change floor without a
new page, furniture lit by its own room, a database client loaded only when needed and a real 404. Not yet tried on a real phone or on the real Supabase
project (both proven against stand-ins). Next, in order, is in HANDOFF "SESSION 31".

## Phasing (what exists when)

- **Phase 0 — done:** the demo tower's flats and the levels of three towers as built-in data, furnished and walkable.
- **Phase A — built:** the Studio (dimension-driven tracing, Auto-trace, the architect's files), Supabase buyer links,
  notes and choices, the change list, staff accounts; paid pilots still to come.
- **Phase B — partly:** staff arranging and the own library are built; still to come: a change-list PDF, buyer copies,
  offline sales-office mode, analytics.
- **Phase C — started:** whole-building projects (floors of drawings, own copies per floor) and AI-assisted import
  (Auto-trace drafts, a person confirms; the Local AI is measured too weak) exist; template libraries, brand libraries
  and self-serve onboarding are later.
