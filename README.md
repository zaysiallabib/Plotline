# Plotline

The digital show flat. A real-estate developer's team traces an apartment floor plan in the **Studio** (typing the dimensions printed on the plan). Plotline then builds a furnished, realistic 3D walkthrough. Buyers open it in a browser or a VR headset, walk through it, pick the finish options the developer allows, and leave notes on any object. Everything buyers choose or write lands in one change list for the developer.

## Open it

```
npm install
npm run dev        # then open the addresses below
npm test           # runs the automatic checks
npm run build      # makes the production version in dist/
```

| Address (while `npm run dev` runs) | What opens |
|---|---|
| http://localhost:5173/ | The front page: what Plotline does, with **See a flat** and **Studio** |
| http://localhost:5173/u/type-a | The 3D walkthrough of flat type A (add `?staff=1` to get the staff buttons) |
| http://localhost:5173/studio | The Studio, where staff trace a plan |

The live site is https://plotline-flax.vercel.app (same addresses).

## Where things are

| Path | What |
|---|---|
| `src/core/` | The wall plan and its geometry (plain logic, tested). `types.ts` is the data contract. |
| `src/three/` | The 3D engine: walls, floors, openings, light, walking, VR |
| `src/furnish/` | The furniture library and the automatic room layouts |
| `src/studio/` | The Studio (`/studio`) |
| `src/trace/` | Auto-trace: reads a plan picture and drafts the walls |
| `src/import/` | Reads the architect's own files (IFC, DXF, PDF, 3D models) |
| `src/viewer/` | What buyers see (`/`, `/u/:unitId`, `/s/:code`) |
| `src/data/units/` | The built-in flats |
| `public/assets/` | 3D models, textures, sky pictures + `MANIFEST.md` (where each came from and its licence) |
| `supabase/` | The online database set-up and its safety test |
| `Docs/` | The documents below |

## Which document answers what

- `Docs/MANUAL.md` — every function a person can use, in plain words.
- `Docs/KEYS.md` — every key and button in one list.
- `Docs/SOURCES.md` — every outside source (assets, maps, weather, hosting) and what is free only for now.
- `Docs/FORMATS.md` — the architect's files Plotline can read.
- `Docs/SETUP_ACCOUNTS.md` and `Docs/SETUP_SUPABASE_ON_VERCEL.md` — turning on sign-in, saving online and share links.
- `ARCHITECTURE.md` — how it is built, and how the data is kept safe.
- `CLAUDE.md` — the rules and the founder's decisions in force.
- `Docs/PRODUCT_SPEC.md`, `Docs/PRODUCT_PHILOSOPHY.md`, `Docs/Plotline masterplan v2.md` — what the product is and why.

`plotline_1.2/` is the old prototype — reference only.
