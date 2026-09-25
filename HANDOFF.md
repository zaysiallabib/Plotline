# HANDOFF.md — Plotline

Read this first in every new session. Repo: `E:\dev\Plotline` (never the OneDrive copy on C:).
Branch: `feat/phase-0` (pushed to GitHub `zaysiallabib/Plotline`; main untouched).
Live: https://plotline-flax.vercel.app — **deployed 2026-09-25 ~12:00 with waves 4–6** (founder ran `npx vercel --prod`; Claude checked the served build matches `dist/`, walked it in headless Edge — entry, Living, Bath-1, Bed-1 at 17:30 all fine — and opened it for the founder). **Wave 7 is merged but NOT deployed yet** — founder runs `npx vercel --prod`; Type B then lives at `/u/type-b`.

Session ritual: each wave ends with (1) this file updated, (2) production redeployed and checked in a real browser.
Manager model: Fable 5.1 by default (sessions 3–4 ran on Opus 5.5 by the founder's /model choice); every coding agent uses `model: "opus"` (Opus 5.5), art direction `model: "fable"`, easy mechanical tasks `model: "sonnet"`.

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

## Progress — Phase 0 demo ≈ 90 %

Done and merged on `feat/phase-0` (152 tests + tsc + build green, 2026-09-25 ~15:45; wave 7 below):
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
- **Wave 8 (2026-09-26): see the Wave 8 section above.** Type C added (`/u/type-c`), Studio fixed on its first real round-trip, north 304° for all units, furnish/views/render rules as listed.
- **Wave 7 (session 4, founder's photo list; three Opus agents, all merged, worktrees removed):**
  - **Type B (373ed9f), item 1:** `src/data/units/type-b.json` = the upper flat of `img_2.webp` (3rd/5th/7th floor): 60 vertices, 81 walls, 22 rooms, furniture from presets only. `src/core/type-b.test.ts` checks validation, reachability, main door first, 13 printed sizes within 2". Open at `/u/type-b` (`/` still opens Type A). Area **1747 sft is computed from the traced outline, not printed** (the 2662 on that sheet is the lower flat; the same method gives Type A 2363 vs printed 2703 — printed figures include a common-area share). Rule breaks fixed with zero Type-B code: long open-plan living rooms get two zones (dining at the kitchen end, lounge at the other; family TV across from the sofa or none); shower trays sit flush in their corner; door clear zone 1 m only where the leaf swings in, 0.6 m where it swings away/slides; entry view faces the entered room's centre; room jumps treat sliders as passages; the Rooms list shows only rooms with a door/passage (no planters, no lift core); WC < 2.5 m² gets a pedestal basin; the dining jump targets the table. Drawing readings the agent had to choose: veranda 6'×8' glazing (living side slider, Bed-2 side window), kitchen→K. veranda as a 1.5 m slider, the 2nd "Bath-2" (by Bed-3) named Bath-3, main door 1.1 m, north 304° (Type A says 311° — same building, one is ~7° off), walls 3.0 m like Type A's.
  - **Objects (4694ed5), item 3 + 4d:** every pickable carries a name tag (`label`) and a kind (`objectKind`, vocabulary `ObjectKind` in `src/furnish/kit.ts`); the comment popover and notes list show it ("Vessel basin · Bath-1"). Clickable parts with ids `${parentId}/${part}`: vanity → cabinet/basin/mixer/mirror, shower → tray/glass/head/mixer, door → leaf/handle/frame, slider/window → frame/glass. New procedural assets: flush ceiling light Ø38/Ø50 cm (replaces the flat disc; `render.ts` puts each room's SpotLight at its ceiling-light/fan/pendant placement) and a wall split AC (`ac_split`) in bed/living/dining/study, never over an opening, door swing or tall piece. Draw calls 839 → 849. Ceiling-hung pieces hidden in the dollhouse and cast no sun shadow. No catalog / swap UI yet (by design).
  - **Realism (9eca27d), items 4a/4b/4f:** sun patches — root cause was a weak sun (5.5 → 10) plus curtains covering 60 % of each window (now 18 % per side); tone mapping and ambient unchanged. Contact shadows under every floor piece (`src/three/context.ts`, one draw call, not pickable). Plain neighbour blocks (≈33, 6–10 storeys, 8–60 m out) + road + time-of-day haze, never shading the unit, hidden in the dollhouse. New chimney hood (canopy + duct to 3.0 m) and a real fridge (doors, handles, plinth). The "brown sliver" is the kitchen door's teak casing seen between the ajar door and the fridge — left as is (fix = lighter casing, or a tall-piece-off-door-frame rule that would drop Type A's fridge).
  - Manager fix at merge: room jumps ignore ceiling-mounted pieces (lights/ACs) when aiming (`spawn.ts`).

## Wave 8 — MERGED 2026-09-26 ~01:30 (manager Fable 5.1, four Opus 5.5 agents), NOT deployed — founder runs `npx vercel --prod`

Founder said 2026-09-25 evening: keep tuning the engine as planned; Fable manages, Opus codes, Sonnet for trivia; HANDOFF must stay current.
Demo drawings checked: img_1 rooftop, img_4 basement, img_5 ground floor — no third apartment. Third plan = the LOWER flat of img_2 (printed 2662 sft) = Type C.

| Agent | Branch / worktree | Scope | Status |
|---|---|---|---|
| views | wave8-views | 3a, 3c, 3g, tiny-room doorway view, + furnish follow-ups (AC clearance, cot hero, common core hidden) | MERGED 2026-09-26 ~00:10 (4 commits e788eb8..300fa62). Rules in spawn.ts: stand ≥ 1.5 m from a pendant (3 m if in frame), ≥ 1 m from a wall AC (2.2 m if in frame); baths + tiny rooms viewed from 0.4–0.6 m inside the door looking down 20° (spawnAt takes a pitch); Rooms list = entry, living, dining, kitchen(+veranda), each bed with its bath/closet, other baths, study/utility, verandas, rest; stair/lift/lobby hidden. Clock over bare wall (presets clockOver). Known weak: b-bath-3 worse than wave-7 lucky frame, b-bath-2 tight (1.65 m deep), A H. toilet mostly tile, A help bed has no cot. Doors render only 20° open so doorway views must stand inside. |
| furnish | wave8-furnish | 3b, 3d, 3e, 4 | MERGED 29c022e. Was: 5 commits on worktree-agent-abd02e988205628a9 (0d722ba..36da0dd), 156 tests; exports isCommonCore/isHelpRoom for the viewer; Type A help bed too short for a cot; stair upper flight meets the ceiling (no slab hole); steel rack + drawer_cabinet now unused (2.7 MB, deletable) |
| typec | wave8-typec | Type C via the Studio import path, north rose, rule-break list | MERGED 016bd02 (157 tests). **Finding: the lower flat of img_2 is Type A's own layout on floors 3/5/7 (Bed-1 veranda, living planter, north strip differ) — NOT a third layout; a plan from another developer is still the real system test.** Studio round-trip: import → no issues → export identical → Preview 3D fine. 3 Studio bugs fixed (false "no entry door" when the entry opens off a traced lobby; door swings drawn mirrored; "Lift lobby"/"Stair" guessed as shaft). Open: small-room labels overlap at fit zoom; timer 00:00 after import. North: 304° for A, B, C (A was 311, fixed). Type A drift vs drawing: Bath-3 is L-shaped (rect in JSON, pushed Bed-3/H.toilet/core 0.24 m east), closet/Bath-1 wall 0.14 m west, PDR 6'-1.5" vs printed 5'-11" — Type C matches 14 printed sizes, Type A ~8. New rule breaks on Type C not covered by views/furnish: two-zone rule skips the irregular 33 m² dining; planters (kind balcony) get a lounge chair; L-shaped Bath-3 gets no shower; curtains hang on the interior glass partition (study↔dining); kitchen jump 0.5 m from the cabinets; living-veranda jump faces the wall corner. Generator + overlay: E:dev	mpwave8	ypec |
| render | wave8-render | 3f, moiré, blown whites, lintel/speckle, neighbours, Bed-1 walls | MERGED 625c129 (6 commits 02f66ac..9e6ead9). Sun patches: NO code change — Type A living faces NE/SE, so at 15:30 no patch is physically possible (raycast 0.00 m²); Type B has a 1.48 m² living patch behind the living jump camera. Glass is now plain 10 % dimming (no transmission): moiré gone, milky veil gone, ~140–300 fewer draw calls per view; sliders can read as open. Tiles tinted to ~0.78 albedo (0 % clipped). Plaster AO map dropped (speckle). Doorless openings get painted trim (dark lintel gone). Interior HDRI averaged over bearings (Bed-1 vs living walls evened, living now 202–209 sRGB). Neighbours: 3 facade variants + parapets/tanks/AC boxes/balconies, haze to the far plane. Note: sky.hdr has a baked sun (faint arcs in the Bed-2 west window). |

All four merged: typec 016bd02 → views → furnish 29c022e → render 625c129. **168 tests, tsc + build green.** After merge: shots at 15:30 for A/B/C, blind art-director score (Fable), HANDOFF update, founder deploys.
Shots: E:devplotline-shotswave8<agent>. Dev ports: views 5211, furnish 5212, typec 5213, render 5214.


### Wave 8 result — manager score (Fable), 2026-09-26 ~01:00, 52 shots at 15:30 in `E:\dev\plotline-shots\wave8\score\` (a-/b-/c-)
- **Type A 6.5 / Type B 6.5 / Type C 6.5** (wave 7: 6.5 / 6.0). Flat number, different shape: furnished rooms are clearly better (living, bedrooms, study, dining, verandas now 7–7.5: clean glass, no blown tile, even walls, oak wardrobes, varied art, believable neighbours, sun patch on the Type B living floor seen from the veranda); small door-view rooms are worse (baths, powder, help room, closet, Type A kitchen: 3–5).
- **Regression to fix first (wave 9 #1): the door view for baths/tiny rooms.** Standing 0.5 m inside the door looking down 20° fills the frame with the near wall + floor and cuts the fittings (`a-bath-1`, `a-powder-room`, `b-bath-3`, `b-help-room`). Tried an 8° pitch (`score-pitch8\`): worse, the fittings leave the frame entirely. So it is not the pitch: the stand point must be the far corner / diagonal that sees the most fittings from the greatest distance (the wave-7 `b-bath-3` frame), with the door view only as fallback when no corner is ≥ 1.5 m from the vanity. Help rooms: the cot sits at the frame's bottom edge; aim at the cot's centre from the door at eye level, or accept that a 1.5 m room can't be framed and show it in the dollhouse only.
- Other wave-9 items seen in the shots: a wall AC looms in the top corner of `a-entry` and `c-entry` (the AC belongs to the dining room while the entry stand point is in the passage; the 2.2 m rule only checks the stand point's own room); Type C entry has the wooden cube shelf 0.5 m to the right of the stand point; `c-veranda-living-` faces the wall corner with the lounge chair in the foreground; `a-kitchen` stands 0.5 m from the cabinets (Type B's kitchen frame is the model); oak wardrobes fill a third of `b-bed-2`, `a-bed-3`, `c-bed-1` (stand point should keep 1 m from a tall piece in frame); the ceiling fan fills the top of `a-living-room` / `c-living-room` (minor); sliders with invisible glass read as open (a faint sky reflection would fix it).
- Typec's rule-break list (planters get a lounge chair, L-shaped Bath-3 gets no shower, curtains hang on the study's interior glass partition, the two-zone rule skips the irregular dining) is still open.

## Open work

Parked by founder decision (PC first, VR later): #1 desktop canvas black when WebXR enabled, #10 VR window glass opaque.
These are the first two VR tasks when VR resumes. VR draw calls 2.5–3.1k/eye: fine tethered, too many for standalone Quest.

### Founder questions answered 2026-09-25 (they set the order below)
- **"Is this a system or one polished plan?"** The pipeline is rule-based (walls, furniture presets, materials, lights, room views work on any traced plan), BUT every rule was only ever judged on Type A. Until a second, different plan goes through untouched and scores close to Type A, "system" is unproven. **This is now the top priority** — no more Type-A-only polish before it.
- **"When can I see it?"** Now: the live link. Founder is testing it himself and will send a bug list. Comments/notes save only in the founder's own browser (Phase 0).
- **"Make every object selectable/swappable (table, sofa, fan, AC, lights, curtains, glass colour, door, mirror, shower handle…) — foundation for a catalog."** Added below. Today: furniture pieces, curtains, doors/windows (as a whole), walls/floors/ceilings are already clickable with their own ID; walls/floors/ceilings already swap via the Finishes panel. Missing: ceiling lights (not clickable), parts inside a piece (mirror inside the vanity, shower handle inside the shower, window glass, door handle), an AC model (none in the kit), and a catalog of alternatives per object.

### Wave 7 result — art director (Fable), 2026-09-25 ~15:30, 37 shots at 15:30 in `E:\dev\plotline-shots\wave7\score\` (`a-*` Type A, `b-*` Type B)
- **Type A 6.5/10** (was 6.0): windows now look onto a street, ACs + hood/fridge add locality, flush lights beat the disc, contact shadows visible. Worse: veranda views show the neighbour blocks close up (repeated windows, hard horizon).
- **Type B 6.0/10** — delta 0.5 → **system test PASSES (borderline)**. The gap is rule edge cases (long room, common-core rooms), not Type-B work. Best shots: `b-bed-3`, `b-bath-3`.
- Fixed right after the score (manager, `spawn.ts` + test): a room with no hero piece that is empty or < 8 m² (lift lobby, help room, closet, stair, small verandas) now looks along its longest clear sightline instead of at the near wall. Re-shots `a2-*`, `b2-*`: lift lobby now looks down the corridor (was a full-frame wall), living veranda shows the living room through the slider + the street, closet shows the rack in perspective; **help bed is still a close-up** (a 1.8 × 1.5 m room can't be framed from inside — next: stand in the doorway looking in); stair unchanged (empty box).
- Art-director claims checked and dropped: "neighbour blocks shadow the dollhouse" (they never cast; that's the unit's own shadow) and "Type B H. toilet / 2nd PDR not traced" (H. toilet is traced, hidden from the list for being < 2 m²; the 5'-11" PDR belongs to Type A).

### Next, in order
1. **Founder's bug list** from the live link (after the wave-7 deploy) — fix as it arrives.
2. **Third plan, other developer (system proof, part 2).** Founder sends 2–3 brochure plans from OTHER Dhaka developers (different drawing styles, chamfered/angled rooms); trace one, same room-by-room pass, blind score. Pass = within 0.5 of Type A.
3. **Rule fixes the art director ranked** (first-30-seconds first): (a) Type B entry stands under the dining pendant (lamp fills the top third) — keep the entry stand point ≥ 1.5 m from a pendant, and the clock hangs over nothing at 2.4 m; (b) empty rooms: the stair is an empty box (no stair model), help room / H. toilet get nothing (kit single bed 1.16 m, drawing shows a 0.7 m cot) — decide: hide common-core rooms (stair, lobby) from the buyer list and add a cot preset; (c) bath jumps frame the mirror head-on (70 % white tile) — `b-bath-3` (from the door, diagonal) is the target; (d) AC sometimes lands in a ceiling corner beside a doorway (`a-entry`) — centre it on the longest windowless wall, ≥ 0.5 m from corners/doors; (e) curtain rods run into corners with no brackets/finials; (f) interior sun patches don't show in the 15:30 jump views (they do at 10:00 in Bed-1 and in the study at 15:30) — verify one lands on the living floor; glazing moiré in `b-veranda-bed-1`; (g) Rooms list order follows geometry, not a sensible order.
4. **Assets:** black steel rack reads as garage shelving in bedrooms/closet (`a-bed-3`, `b-bed-2`) — closed wardrobe or wooden bookcase, closet rails; same two sea/dawn prints everywhere — an art pool of 8+ picked by room id; neighbour blocks need 2–3 facade variants, balconies/AC boxes/rooftop tanks, and a hazier ground so the horizon fades.
5. Older realism items still open: blown whites (bath tiles, windows — the stronger sun pushes this), dark timber lintel over the dining cased opening, plaster speckle in Bed-2, Bed-3/kitchen jumps cramped, the kitchen door's teak casing seen beside the fridge.
6. Loose ends: Type A north 311° vs Type B 304° (same building — re-read both roses); the 5 m² open-to-sky threshold for verandas is fragile (Type A living veranda 5.04 m² gets a roof, the 4.91 m² planter doesn't); Bed-1 walls ≈ 163 sRGB vs living ≈ 200; blocky pattern on the kitchen floor by the fridge (pre-existing); hood duct stops at 3.0 m (`ponytail:` note); neighbours never shade the unit (not physically honest); `steel_frame_shelves_01` loads at 10× (auto-rescaled).
7. Then masterplan week 2: founder traces a unit in the Studio (record minutes), discovery demos.

Diagnostic scripts worth keeping (E:\dev): `w7-rooms.mjs` (entry + every Rooms-list jump + dollhouse for one unit; waits on `E:\dev\tmp\browser.lock`; `node w7-rooms.mjs type-b b 15.5 http://localhost:5210 "Bed-1,Kitchen"`), `w5d2.mjs` (details views incl. window frames at 10:00/17:30), `seam.mjs` / `seamcap.mjs` (seam toggles), `E:\dev\tmp\{colprof,spikes,sheet}.ps1` (pixel column profiles, single-pixel line detector, before/after contact sheet). Wave-7 agent scratch (Type B generator `gen.mjs`, drawing overlay, shot scripts): `E:\dev\tmp\wave7\`.

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
- Screenshots: `E:\dev\plotline-shots\` (`art\`, `render\`, `xr\`, `wave5\{details,details2,furnish,render,viewer}\`, `wave7\{typeb,objects,realism,score}\`)
- Agent scratch, logs, texture sheets: `E:\dev\tmp\` (safe to delete once wave 5 is merged)
