# HANDOFF.md — Plotline

Read this first in every new session. Repo: `E:\dev\Plotline` (never the OneDrive copy on C:).
Branch: `feat/phase-0` (pushed to GitHub `zaysiallabib/Plotline`; main untouched).
Live: https://plotline-flax.vercel.app — still shows the **pre-wave-4** build (checked 2026-09-25 11:45 with `npx vercel ls`: one deployment, 9 h old). Waves 4–6 are waiting for the founder's `npx vercel --prod`.

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

## Progress — Phase 0 demo ≈ 85 %

Done and merged on `feat/phase-0` (127 tests + tsc + build green, 2026-09-25 ~11:40):
- Geometry core, 3D engine (PBR/HDRI, walk/orbit/dollhouse, WebXR, picking), Poly Haven CC0 kit.
- Type A 2703 sft unit drafted from `Demo drawings/img_3.webp` (64 vertices, 90 walls, 34 openings, 27 rooms).
- Studio tracing editor, buyer viewer (rooms list, finishes, sun slider, anchored notes, share config).
- Wave 3 architectural detail (joinery, sliders, sash windows, skirting, curtains).
- Wave 4 realism + VR (Neutral tone mapping, GTAO, room lights, XR teleport/snap-turn). Art director score 5.5/10.
- Wave 5 (all four branches merged, worktrees removed):
  - render (db2b55c): shafts/planter open to sky, lower ambient + stronger sun (time slider now matters), tinted sky, dusk pools, neutral hemi, env reload on context restore.
  - viewer (eb2303e): Rooms-list jump stays clear of door swings and wardrobes.
  - furnish (add1b5d): bed linen varies by bedroom size (`bed_queen`, `_b`, `_c`), oak bedsides, plain cushions on the family sofa, toned-down throw, larder + styled counter, slimmer hood, steel fridge, live vanity mirrors (three `Reflector`, within 4 m, never in XR), per-panel veneer grain, smaller prints, large-format bath tiles.
  - details (4d2cde9): #8 wall hairlines fixed at two causes — walls are one world-space mesh each with bit-identical shared corners (`wallGeometry` in `src/three/details.ts`, crack test added), and the wall edge/reveal material has a polygon offset so edge-on end caps never win depth ties against room faces. #7 aluminium frames are powder-coat (metalness 0.15), no more black-at-dusk / white-at-noon flip. Verified by pixel column profiles on before/after shots in `E:\dev\plotline-shots\wave5\details2\`.

- Art-director rescore after wave 5: **6.0/10** (was 5.5). Fixed: seams, frames, tiles, mirror, veneer, dusk. Overcorrected: walls read grey.
- Wave 6 polish (7638158): room jumps frame the hero piece (bed / vanity / sink) from in front, 0.5 m off anything at eye level, 0.25 m interior-grid search when corners are blocked; ambient ENV/HEMI 1.1/0.9 + near-neutral sky fill (walls measured 165 → 195 sRGB); plain cushions on every sofa (chevron pillows gone). Shots: `E:\dev\plotline-shots\wave5\furnish\sheet-w6*.jpg`.
- Founder note in BUILD_PLAN.md: hold off Android, VR, Bangla — PC first.

## Wave 5/6 — what is left (IN PROGRESS)

Parked by founder decision (PC first, VR later): #1 desktop canvas black when WebXR enabled, #10 VR window glass opaque.
These are the first two VR tasks when VR resumes. VR draw calls 2.5–3.1k/eye: fine tethered, too many for standalone Quest.

### Next, in order
1. **Deploy** (founder): `cd E:\dev\Plotline` then `npx vercel --prod`. Claude then verifies https://plotline-flax.vercel.app in a browser (Rooms list → Living, Bed-1, Bath-1 at 10:00 and 17:30) and opens it.
2. Next realism wave (art director's remaining list, ranked): (a) no visible sun patches / contact shadows under sofa, bed, wardrobe; (b) exterior void — plain neighbour blocks + haze, still "plain"; (c) blown whites (bath tiles, windows); (d) ceiling light is a flat white disc — flush-mount fixture; (e) dark timber lintel over the dining cased opening — plaster or thin frame; (f) hood reads as a grey slab, fridge a flat box, brown sliver left of the fridge; (g) plaster speckle too strong in Bed-2; (h) Bed-3 and kitchen jump views still cramped (door clearance boxes them in).
3. Then masterplan week 2: founder traces a unit in the Studio (record minutes), discovery demos.

Diagnostic scripts worth keeping (E:\dev): `w5d2.mjs` (details views incl. window frames at 10:00/17:30), `seam.mjs` / `seamcap.mjs` (seam toggles), `E:\dev\tmp\{colprof,spikes,sheet}.ps1` (pixel column profiles, single-pixel line detector, before/after contact sheet).

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
