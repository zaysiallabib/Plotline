# HANDOFF.md — Plotline

Read this first in every new session. Repo: `E:\dev\Plotline` (never the OneDrive copy on C:).
Branch: `feat/phase-0` (pushed to GitHub `zaysiallabib/Plotline`; main untouched).
Live: https://plotline-flax.vercel.app — still shows the **pre-wave-4** build. Not redeployed since.

Session ritual: each wave ends with (1) this file updated, (2) production redeployed and checked in a real browser.
Claude runs on Fable 5.1 as manager; every coding agent uses `model: "opus"` (Opus 5.5).

## Commands you will forget

```
cd E:\dev\Plotline
claude --continue          # resume the last session here
claude                     # fresh session
npm run dev                # Vite dev server
npm test                   # Vitest (core + furnish + viewer + engine tests)
npm run build              # tsc + vite build
git worktree list          # the agent worktrees under .claude/worktrees/
npx vercel login           # founder only, once
npx vercel --prod          # founder must run this: Claude's auto-mode blocks it
```

## Progress — Phase 0 demo ≈ 70 %

Done and merged (commit 56a9c02, 126 tests green):
- Geometry core, 3D engine (PBR/HDRI, walk/orbit/dollhouse, WebXR, picking), Poly Haven CC0 kit.
- Type A 2703 sft unit drafted from `Demo drawings/img_3.webp` (64 vertices, 90 walls, 34 openings, 27 rooms).
- Studio tracing editor, buyer viewer (rooms list, finishes, sun slider, anchored notes, share config).
- Wave 3 architectural detail (joinery, sliders, sash windows, skirting, curtains).
- Wave 4 realism + VR (Neutral tone mapping, GTAO, room lights, XR teleport/snap-turn). Art director score 5.5/10.

## Wave 5 — realism fixes from the art-director list (IN PROGRESS, interrupted)

The brief was the ranked list after wave 4. Four Opus agents, one worktree each, all branched from 56a9c02.
Status per branch, updated 2026-09-25 09:15 (session 3, on Opus 5.5):

| Worktree (`.claude/worktrees/`) | Fixes | State |
|---|---|---|
| `wave5-render` | #3 flat light / dead time slider, #5 beige cast, #9 dusk grey, #8 GTAO seams, shafts+planter open to sky, env reload on context restore | **MERGED (db2b55c).** |
| `wave5-viewer` | #2 Rooms-list jump lands in door swing / wardrobe | **MERGED (eb2303e). 127 tests + tsc green after both merges.** |
| `wave5-furnish` | #4 Bath tiles mosaic + dead mirror (Reflector), #6 veneer too orange (re-exported textures + boxUV grain), #12 calmer staging (bed styles, bedside, cushions, styled counter, tall larder) | **Uncommitted, mid-edit.** See "Finish furnish" below. |
| `wave5-details` | #7 aluminium frames flip dark/white, #8 wall seam hairlines | Old worktree had no code → abandoned. **Re-briefed 09:15:** an Opus agent works in a NEW `.claude/worktrees/agent-*` worktree branched from eb2303e; after-shots → `E:\dev\plotline-shots\wave5\details2\`. If the session died: `git worktree list`, look for its commit; none → re-brief (#7 frame material metalness, #8 seams fixed at the wall-mesh source). |

Parked by founder decision (PC first, VR later): #1 desktop canvas black when WebXR enabled, #10 VR window glass opaque.
These are the first two VR tasks when VR resumes. VR draw calls 2.5–3.1k/eye: fine tethered, too many for standalone Quest.

### Finish furnish (do this first, ~1 hour)
In `.claude/worktrees/wave5-furnish`:
1. `src/furnish/procedural.ts` lines 615–616: `bed()` now takes `(w, style)`; two callers still pass one arg.
2. `tall()` (line 445, the larder unit) is defined but never registered in the builder map → wire `kitchen_tall` and `kitchen_counter_styled` to their builders.
3. Failing test `engine.test.ts › every procedural asset builds within ±10 %`: `bed_queen_b` returns null → the builder map must register `bed_queen`/`bed_single` × `BED_STYLES` (`''`, `_b`, `_c`).
4. Delete `src/furnish/zz-print.test.ts` (scratch file that writes to E:\dev\tmp; not a test).
5. `public/assets/MANIFEST.md`: note the re-exported `tile_wall_white` (ao.jpg removed), `wood_veneer_light`, `throw_pillows_01` textures.
6. `npm test` + `npx tsc -p tsconfig.app.json --noEmit` green → commit → merge.

### Then, in order
1. Merge `wave5-render` and `wave5-viewer` into `feat/phase-0` (both green; resolve any overlap in `src/three/` with render's version).
2. Merge furnish. Run the full suite. `npm run build`.
3. Re-brief a details agent for #7 frames and #8 seams using the shots above.
4. Screenshot pass (Playwright via Edge, `channel: 'msedge'`; old script pattern in `E:\dev\tmp\wave5-viewer-shots.cjs`) → art-director rescore (Fable) → aim ≥ 7/10.
5. Founder runs `npx vercel --prod`; Claude verifies the live URL in a browser and opens it.
6. Update this file. Remove the four worktrees (`git worktree remove`).

## After wave 5 (masterplan week 2)
- Founder traces a unit himself in the Studio; record "minutes to trace".
- Discovery demos with Dhaka developers.
- Supabase, share links, RLS = Phase A. Not before demos.

## Open founder style questions (defaults in use until answered)
- Exterior: skyline vs plain → **plain**.
- Staging: muted vs colourful → **calmer**.
- Sunlight: honest vs flattering → **honest**.
- VR target: tethered PC vs standalone Quest → unanswered, VR frozen anyway.

## Scratch locations (not in repo)
- Screenshots: `E:\dev\plotline-shots\` (`art\`, `render\`, `xr\`, `wave5\{details,render,viewer}\`)
- Agent scratch, logs, texture sheets: `E:\dev\tmp\` (safe to delete once wave 5 is merged)
