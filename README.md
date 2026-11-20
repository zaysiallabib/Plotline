# Plotline

**The digital show flat.** A property developer sells flats before they are built. Plotline lets their team turn the
architect's floor plan into a furnished 3D flat in the browser, and send buyers a link to walk through it — on a
computer, a phone or a VR headset. Buyers look around, choose from the finishes the developer offers, and leave notes on
anything they see. Every choice and note lands in one list for the developer. Plotline is made in Dhaka, for Dhaka's
developers first.

There are three screens:

- **The front page** (`/`) — what Plotline is, as a short story you scroll through.
- **The 3D view** (`/u/<flat>`, `/s/<link>`) — what a buyer sees: walk, dollhouse, the whole building.
- **The Studio** (`/studio`) — where the developer's staff draw a plan over the plan picture (or bring in the architect's
  own file), check it, and make it into 3D.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```
npm install
npm run dev
```

Then open http://localhost:5173. Useful addresses:

| Address | What opens |
|---|---|
| http://localhost:5173/ | The front page |
| http://localhost:5173/u/type-a | Flat type A in 3D. Add `?staff=1` for the staff buttons (Edit, the Studio link). |
| http://localhost:5173/studio | The Studio |

Without the online database everything still works and saves in your browser; only buyer links (`/s/…`), the change
list and signing in need it (see "The online database" below).

## Check it

```
npm test            # the automatic checks (Vitest), about two minutes
npm run typecheck   # the type check the live build runs too
npm run build       # makes the site in dist/
npm run preview     # serves dist/ with the live site's security and caching headers (from vercel.json)
```

Browser checks are done in Firefox (Playwright's Firefox, headless), never in Chrome or Edge with software graphics.

## Put it online

The site is plain files (no server of its own) hosted on [Vercel](https://vercel.com); `vercel.json` holds the address
rules and the headers (security rules and how long browsers keep each file).

1. Once: `npx vercel link` in this folder, and add the two database settings below in the Vercel project
   (Settings → Environment Variables), step by step in `Docs/SETUP_SUPABASE_ON_VERCEL.md`. Optional: the two DWG
   settings (`Docs/SETUP_FORMATS.md`).
2. Every release: `npx vercel --prod --yes`. Pushing to GitHub does not publish by itself.
3. Check the live site: the front page, a flat (`/u/type-a`), the Studio (`/studio`).

The live address appears in three files besides Vercel: `index.html` (the share card), `public/robots.txt` and
`public/sitemap.xml`. Change all three if the site moves to its own domain.

### The online database

Buyer links, the change list and staff accounts use [Supabase](https://supabase.com) (its free plan). The site needs two
settings, never more: the project's address and its **publishable** key. On your computer they go in `.env.local`
(never committed) as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; on Vercel as `SUPABASE_URL` and
`SUPABASE_KEY`. The build refuses a secret key. Setting the database up once, step by step:
`Docs/SETUP_ACCOUNTS.md` and `Docs/SETUP_SUPABASE_ON_VERCEL.md`.

## Where things are

| Folder | What |
|---|---|
| `src/core/` | The plan itself: walls, doors and windows, rooms worked out from the walls. Plain logic with tests; `types.ts` is the data contract. |
| `src/three/` | The 3D: walls, floors, furniture, light and sun, walking, VR |
| `src/furnish/` | The furniture library and how each kind of room is furnished |
| `src/viewer/` | The 3D view's screens |
| `src/studio/` | The Studio |
| `src/trace/` | Auto-trace: reads a plan picture and drafts the walls |
| `src/import/` | Reads the architect's own files (IFC, DXF, PDF drawings, 3D models) |
| `src/landing/` | The front page |
| `src/lib/` | What every page shares: the address rules, the "something went wrong" pages, the database |
| `src/data/units/` | The flats and floors that come built in |
| `public/assets/` | 3D models, textures and sky pictures; `MANIFEST.md` says where each came from and its licence (all free to use) |
| `supabase/` | The database's tables, its rules and their safety test |
| `api/` | The one server function: the DWG converter (`dwg.js`, off until set up) |
| `scripts/` | `verify-share.mjs` checks the live database once it is set up |

## The documents

- `Docs/MANUAL.md` — every function a person can use, in plain words; begin at its "Start here" (and what to do when
  something goes wrong, §12).
- `Docs/KEYS.md` — every key and button, one table per screen.
- `Docs/SETUP_SUPABASE_ON_VERCEL.md`, `Docs/SETUP_ACCOUNTS.md`, `Docs/SETUP_FORMATS.md` — turning on buyer links, staff
  accounts and DWG files, one sitting each.
- `Docs/DESIGN.md` — the look: colours, type, spacing, the rules every screen follows.
- `Docs/SOURCES.md` — every outside source (furniture, maps, weather, hosting) and what is free only for now.
- `Docs/FORMATS.md` — the architect's files Plotline reads and writes.
- `Docs/AUTOTRACE_SCOREBOARD.md` — how well Auto-trace does on real plan sheets, measured.
- `ARCHITECTURE.md` — how it is built, and how the data is kept safe ("Security").
- `CLAUDE.md` — the working rules and the decisions in force.
- `HANDOFF.md` — the latest state of the work.
- `Docs/PRODUCT_SPEC.md`, `Docs/PRODUCT_PHILOSOPHY.md` — what the product is and why.

`plotline_1.2/` is the old prototype, kept for reference only.
