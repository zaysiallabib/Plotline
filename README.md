# Plotline

The digital show flat. A developer's sales team traces an apartment floor plan
in the **Studio** (typing the dimensions printed on the plan), and Plotline
generates a realistic, furnished 3D walkthrough buyers open in a browser or a
VR headset, pick finish options in, and leave anchored comments on.

## Run

```
npm install
npm run dev        # http://localhost:5173  → viewer (demo unit)
                   # http://localhost:5173/studio → tracing editor
npm test           # geometry core, presets, studio reducer, viewer logic
npm run build      # production build to dist/
```

## Where things are

| Path | What |
|---|---|
| `src/core/` | Wall graph + geometry (pure, tested). `types.ts` is the data contract. |
| `src/three/` | 3D engine: walls/floors/openings from the graph, PBR + HDRI, walk/orbit, WebXR, picking |
| `src/furnish/` | Furniture kit registry (Poly Haven CC0), procedural assets, per-room presets |
| `src/studio/` | The tracing editor (`/studio`) |
| `src/viewer/` | The buyer walkthrough (`/`, `/u/:unitId`, `/u/preview`) |
| `src/data/units/` | Hand-authored unit JSONs (Type A = the 2703 sft demo unit) |
| `public/assets/` | Models, textures, HDRIs + `MANIFEST.md` (licences) |
| `Docs/` | Masterplan, product spec |

Read `CLAUDE.md` for the invariants and the decisions in force.
`plotline_1.2/` is the old prototype — reference only.
