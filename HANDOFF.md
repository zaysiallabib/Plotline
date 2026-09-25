# HANDOFF.md — Plotline

Read this first in every new session. Repo: `E:\dev\Plotline` (never the OneDrive copy on C:).
Branch: `feat/phase-0` (pushed to GitHub `zaysiallabib/Plotline`; main untouched).
Live: https://plotline-flax.vercel.app — **deployed 2026-09-25 ~12:00 with waves 4–6** (founder ran `npx vercel --prod`; Claude checked the served build matches `dist/`, walked it in headless Edge — entry, Living, Bath-1, Bed-1 at 17:30 all fine — and opened it for the founder).

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

### Founder questions answered 2026-09-25 (they set the order below)
- **"Is this a system or one polished plan?"** The pipeline is rule-based (walls, furniture presets, materials, lights, room views work on any traced plan), BUT every rule was only ever judged on Type A. Until a second, different plan goes through untouched and scores close to Type A, "system" is unproven. **This is now the top priority** — no more Type-A-only polish before it.
- **"When can I see it?"** Now: the live link. Founder is testing it himself and will send a bug list. Comments/notes save only in the founder's own browser (Phase 0).
- **"Make every object selectable/swappable (table, sofa, fan, AC, lights, curtains, glass colour, door, mirror, shower handle…) — foundation for a catalog."** Added below. Today: furniture pieces, curtains, doors/windows (as a whole), walls/floors/ceilings are already clickable with their own ID; walls/floors/ceilings already swap via the Finishes panel. Missing: ceiling lights (not clickable), parts inside a piece (mirror inside the vanity, shower handle inside the shower, window glass, door handle), an AC model (none in the kit), and a catalog of alternatives per object.

### Wave 7 (IN FLIGHT, session 4, 2026-09-25 ~12:45)
Founder's photo list = items 1–4 below. Three Opus agents in worktrees under `.claude/worktrees/`: **typeb** (item 1: trace `type-b.json` + fix rules), **objects** (item 3 + the flush-mount ceiling light from 4d), **realism** (4a sun patches + contact shadows, 4b neighbour blocks + haze, 4f hood/fridge/sliver). Item 2 waits for the founder's bug list. Screenshots: `E:\dev\plotline-shots\wave7\<agent>\`; headless Edge serialised by the lock dir `E:\dev\tmp\browser.lock` (delete it if it outlives a crash).

### Next, in order
1. **Second-plan test (system proof).** Trace the OTHER apartment on `Demo drawings/img_2.webp` (upper unit on the 3rd/5th/7th floor plan: Bed-1 14'5"×14'4", Bed-2 15'2"×10', Bed-3 14'3"×11'10", Living/Dining/Family 36'2"×12', Kitchen 8'×11') into `src/data/units/type-b.json`, add it to the viewer's unit list, run the same room-by-room screenshot pass + art-director score. Fix what breaks **in the rules** (presets, spawn, lighting), never by hand-placing for Type B. Pass = Type B within ~0.5 of Type A's score with zero Type-B-specific code. Then ask the founder for 2–3 brochure plans from OTHER Dhaka developers (different drawing styles, odd angles) and repeat. Est: trace ~half a day, fixes 1–2 days depending on what breaks.
2. **Founder's bug list** from testing the live link — fix as it arrives.
3. **Object foundation (catalog-ready).** Every visible thing gets a stable ID + a "slot" (what it is: sofa, ceiling light, curtain, window glass, mirror, shower mixer, door handle…) and is clickable; built pieces expose their sub-parts (vanity → mirror, basin, mixer; shower → glass, head, mixer; window → frame, glass) as separately clickable parts; a slot can be swapped for another catalog item without touching the plan. Add ceiling lights + wall AC units as real objects. Catalog content itself comes later. Est: 1–2 days.
4. Next realism wave (art director's remaining list, ranked): (a) no visible sun patches / contact shadows under sofa, bed, wardrobe; (b) exterior void — plain neighbour blocks + haze, still "plain"; (c) blown whites (bath tiles, windows); (d) ceiling light is a flat white disc — flush-mount fixture; (e) dark timber lintel over the dining cased opening — plaster or thin frame; (f) hood reads as a grey slab, fridge a flat box, brown sliver left of the fridge; (g) plaster speckle too strong in Bed-2; (h) Bed-3 and kitchen jump views still cramped (door clearance boxes them in); (i) the entry view (first thing on load) stands close to the family-sofa wall with the prints filling the right side.
5. Then masterplan week 2: founder traces a unit in the Studio (record minutes), discovery demos.

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
