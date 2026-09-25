# HANDOFF.md — Plotline

Read this first in every new session. Repo: `E:\dev\Plotline` (never the OneDrive copy on C:).
Branch: `feat/phase-0` (pushed to GitHub `zaysiallabib/Plotline`; main untouched).
Live: https://plotline-flax.vercel.app — still shows the **pre-wave-4** build. Not redeployed since.

Session ritual: each wave ends with (1) this file updated, (2) production redeployed and checked in a real browser.
Manager model: Fable 5.1 by default (session 3 ran on Opus 5.5 by the founder's /model choice); every coding agent uses `model: "opus"` (Opus 5.5).

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

## Progress — Phase 0 demo ≈ 78 %

Done and merged on `feat/phase-0` (127 tests + tsc + build green, 2026-09-25 ~09:40):
- Geometry core, 3D engine (PBR/HDRI, walk/orbit/dollhouse, WebXR, picking), Poly Haven CC0 kit.
- Type A 2703 sft unit drafted from `Demo drawings/img_3.webp` (64 vertices, 90 walls, 34 openings, 27 rooms).
- Studio tracing editor, buyer viewer (rooms list, finishes, sun slider, anchored notes, share config).
- Wave 3 architectural detail (joinery, sliders, sash windows, skirting, curtains).
- Wave 4 realism + VR (Neutral tone mapping, GTAO, room lights, XR teleport/snap-turn). Art director score 5.5/10.
- Wave 5 render (db2b55c): shafts/planter open to sky, lower ambient + stronger sun (time slider now matters), tinted sky, dusk pools, neutral hemi, GTAO seams, env reload on context restore.
- Wave 5 viewer (eb2303e): Rooms-list jump stays clear of door swings and wardrobes.
- Wave 5 furnish (merge after add1b5d): bed linen varies by bedroom size (`bed_queen`, `_b`, `_c`), oak bedside tables, plain cushions on the family sofa, toned-down terracotta throw, tall larder + styled counter (kettle, board, lemons) in the kitchen, slimmer hood, steel fridge, live vanity mirrors (three `Reflector`, only within 4 m and never in XR), veneer grain per panel, smaller prints, large-format bath tiles.

## Wave 5 — what is left (IN PROGRESS)

| Item | State |
|---|---|
| #7 aluminium frames flip dark/white, #8 wall seam hairlines | **Opus agent running** in `.claude/worktrees/agent-af65fe6ff1691487d` (branch `worktree-agent-af65fe6ff1691487d`, from eb2303e — before the furnish merge; merge will be clean, it touches `src/three/` only). After-shots → `E:\dev\plotline-shots\wave5\details2\`. **If the session died:** `git -C .claude/worktrees/agent-af65fe6ff1691487d log --oneline -3` — a commit on top of eb2303e = done, test + merge it; no commit = re-brief (fix #7 in the frame material: low metalness, powder-coat; fix #8 at the wall-mesh source: world-space UVs / merged coplanar pieces). |

Parked by founder decision (PC first, VR later): #1 desktop canvas black when WebXR enabled, #10 VR window glass opaque.
These are the first two VR tasks when VR resumes. VR draw calls 2.5–3.1k/eye: fine tethered, too many for standalone Quest.

### Next, in order
1. Merge the details agent's branch → `npm test`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`.
2. Screenshot pass on the merged build (script `E:\dev\w5f-shots.mjs <prefix> <steps.json> [base]`: Playwright via Edge, swiftshader; steps can `jump` a room, `focus` an asset, set `hour`). Note: focus-shots can land the camera inside a neighbouring room — use `jump` for room overviews.
3. Art-director rescore of the shots (Fable agent, or Claude itself) → aim ≥ 7/10; fix the top items if cheap.
4. `git push`, then the founder runs `npx vercel --prod`; Claude verifies https://plotline-flax.vercel.app in a browser and opens it.
5. Update this file; remove merged worktrees (`git worktree remove <path>`, `git branch -d <branch>`).

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
- Screenshots: `E:\dev\plotline-shots\` (`art\`, `render\`, `xr\`, `wave5\{details,details2,furnish,render,viewer}\`)
- Agent scratch, logs, texture sheets: `E:\dev\tmp\` (safe to delete once wave 5 is merged)
