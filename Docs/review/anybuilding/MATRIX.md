# Every building through every view — the matrix (session 31, round 18, lane anybuilding)

The founder, on a building made in the Studio (2026-11-28): "changed the whole walls from outside. cannot choose separate
walls — if I do it gives an error … cannot go to dollhouse from building view or even select the floors, gives me an error …
if it works only for one building then it is a flaw." Then (his two screenshots, Chrome): Preview 3D of the sample "Two
semi-detached houses, ground floor" → Building → Finishes → Timber slats for the whole building worked → a click on one wall
for "This wall" → **Something broke here.**

**How it was run.** As a person does it, in Firefox (Playwright's, headless, WebGL on), one browser, on this lane's own Vite
(port 5251): each building made the way he makes it (Try a sample, a file dropped on the Studio, a set built, Auto-trace,
Building → New project → Draw / "on floors 2-8"), then each action by the product's own buttons and clicks — the spot on the
tower for a wall, a balcony edge or a floor is found by the Building view's own pick (`Building.pickAt`) and then moved to
and clicked with the mouse. A step passes only when what a person would see happened (the card, its words, the record kept,
the mode) and the page threw nothing (every page error and console error is caught; the error page counts as a fail). The
"before" column ran on s31/redesign 5a9e2b6 (a copy of it), the "after" column on this branch. Harness:
`E:/dev/tmp/s31/anybuilding/` (`builds.mjs` how each building is made, `actions.mjs` the actions, `mx.sh` runs them).

**His crash was not reproduced in Firefox.** Tried on the very sample and steps: the whole building in Timber slats, then
every one of the 25 spots of the tower clicked with Finishes open (no throw), then This wall + a finish on each of the 20
outer wall runs (no throw), the floor list, Dollhouse, Walk (no throw). What differs: his browser (Chrome) and what his
browser kept from earlier days. **The error page now prints the error's own words** under "Something broke here." (a grey
line), so his next screenshot names the failing step.

**What was wrong, at the root (one line each; one code path for every building, nothing keyed on a built-in):**
1. *A one-storey building (its ground floor alone — Try a sample → the 7-room IFC) answered no click in the Building view*
   (no card on a floor, no outside card on a wall): the walked flat has an unseen pick copy in the tower, the walked
   **level** had none (`three/building.ts` addLevel `proxy`). A cut floor's pick copy also came back into view (highlight).
2. *The IFC sample's roof slabs were black*: the file colours its "Generic" roof pure black (Revit's unset colour) and names
   no covering, so the 3D shape kept that black (`import/ifc.ts`: such a roof wears its kind's plain covering, and the
   building's chosen one).
3. *A building in its architect's 3D shape had no roof in Finishes*: the roof block showed only for towers that draw their
   own roof, though the shape's roof already wore the chosen covering (`viewer/FinishesPanel.tsx` roof `shape`: its covering).
4. *A picture traced on an empty Studio had no Building view in Preview 3D*: Auto-trace gives the draft a new id, the
   project keeps the drawing under the old one, and the preview carried the draft's (`studio/StudioApp.tsx` previewOf: the
   drawing's id in its project, as the Studio's own draft record already says).
5. *Preview 3D said "Ground floor", marked Ground in the list, and a click on its own flat left the preview for the stored
   copy*: the viewer took the draft's typed floor (none) where the scene puts it on the floor its project lists it
   (`viewer/ViewerApp.tsx` floorOf = `floorIn`, the scene's rule).
6. *The Building view looked into the rooms of a Studio-made top floor (no roof over it), then showed the rooms' wall tops
   as lines on it*: the slab over the walked flat starts on the flat's own roof, and the Studio's 10 ft walls put that roof
   5 mm past the storey, so nothing of the slab was left (`three/building.ts` plate keeps its top skin; the roof deck lies
   a skin over the flat's own roof).
7. *A building that is its ground floor alone and has no 3D shape had no roof at all*: the roof stood only over flats and
   massing (`three/building.ts` roofOn: over a level's indoor rooms, never its lawns or pool).
8. *The tower's words for a drawing with no name typed were " · 3409 sft"*: the cards read the raw name; now the walk's
   own title rule (`viewer/defaults.ts` drawingTitle → "Floor plan A · 3409 sft").

Buildings: `dxfPreview` = Preview 3D of a lone DXF (Try a sample → semi-detached houses); `picPreview` = Preview 3D of a lone picture (Type A sheet → Auto-trace); `ifc7` = IFC "A flat, 7 rooms" (Try a sample → Show building); `typeA` = Built-in Type A (/u/type-a?staff=1); `sheltechA` = Built-in Sheltech A (traced ground, basements, rooftop); `nordic` = Nordic housing IFC (B1, G, 1–3, roof); `typeAProject` = Type A as a project on floors 2–8; `pearl` = Eastern Housing Pearl brochure built, Floor plan A Auto-traced; `farmhouse` = Farmhouse drawing set built.

### Before (s31/redesign 5a9e2b6)

| Action | dxfPreview | picPreview | ifc7 | typeA | sheltechA | nordic | typeAProject | pearl | farmhouse |
|---|---|---|---|---|---|---|---|---|---|
| Walk → Building → Dollhouse | pass | **FAIL** | pass | pass | pass | pass | pass | pass | pass |
| Building → every floor in the list | pass | **FAIL** | pass | pass | pass | pass | pass | pass | pass |
| A floor's card → click | pass | **FAIL** | **FAIL** | pass | pass | pass | pass | pass | pass |
| Finishes → a wall → This wall | pass | **FAIL** | **FAIL** | pass | pass | pass | pass | pass | pass |
| → This floor | pass | **FAIL** | **FAIL** | pass | pass | pass | pass | pass | pass |
| → Whole building | pass | **FAIL** | **FAIL** | pass | pass | pass | pass | pass | pass |
| A balcony edge → Made of | n/a | **FAIL** | n/a | n/a | n/a | pass | pass | pass | n/a |
| Roof → Change → gable (an IFC 3D shape: its covering) | pass | **FAIL** | **FAIL** | pass | pass | **FAIL** | pass | pass | pass |
| Add → Outside → chhajja | pass | **FAIL** | pass | pass | n/a | pass | n/a | n/a | pass |
| Reload → still there | pass | **FAIL** | **FAIL** | pass | pass | **FAIL** | pass | pass | pass |
| Walk the chosen floor | pass | **FAIL** | n/a | pass | pass | pass | pass | n/a | pass |

Shots: `E:/dev/plotline-shots/s31/anybuilding/before/before-<building>-<action>.png`.

- **dxfPreview · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **picPreview · Walk → Building → Dollhouse** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Building → every floor in the list** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · A floor's card → click** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Finishes → a wall → This wall** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · → This floor** (FAIL): no This floor on the card
- **picPreview · → Whole building** (FAIL): no Whole building on the card
- **picPreview · A balcony edge → Made of** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Roof → Change → gable (an IFC 3D shape: its covering)** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Add → Outside → chhajja** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Reload → still there** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **picPreview · Walk the chosen floor** (FAIL): no Building button on the page (Walk · Dollhouse only): the preview stood in no building
- **ifc7 · A floor's card → click** (FAIL): no spot of the tower under any point
- **ifc7 · Finishes → a wall → This wall** (FAIL): no wall found on the tower by pickAt
- **ifc7 · → This floor** (FAIL): no This floor on the card
- **ifc7 · → Whole building** (FAIL): no Whole building on the card
- **ifc7 · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **ifc7 · Roof → Change → gable (an IFC 3D shape: its covering)** (FAIL): no roof line with Change in Finishes
- **ifc7 · Reload → still there** (FAIL): outside kept: true · roof "" · chhajjas 1 → 1
- **ifc7 · Walk the chosen floor** (n/a): not judged: the harness then had no step for a building of one level (Walk this level); the after run has it
- **typeA · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **sheltechA · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **sheltechA · Add → Outside → chhajja** (n/a): the harness pressed Esc at the pick-up question "Put its outside pieces on: This floor only · All N floors" (a drawing on several floors) — the product path is unchanged on this branch and passes once the question is answered (after column)
- **nordic · Roof → Change → gable (an IFC 3D shape: its covering)** (FAIL): no roof line with Change in Finishes
- **nordic · Reload → still there** (FAIL): outside kept: true · roof "" · chhajjas 1 → 1
- **typeAProject · Add → Outside → chhajja** (n/a): the harness pressed Esc at the pick-up question "Put its outside pieces on: This floor only · All N floors" (a drawing on several floors) — the product path is unchanged on this branch and passes once the question is answered (after column)
- **pearl · Add → Outside → chhajja** (n/a): the harness pressed Esc at the pick-up question "Put its outside pieces on: This floor only · All N floors" (a drawing on several floors) — the product path is unchanged on this branch and passes once the question is answered (after column)
- **pearl · Walk the chosen floor** (n/a): not judged: the harness then picked floor 9, a floor still a picture to trace (it stands as a block, nothing to open); the after run picks a traced floor
- **farmhouse · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower

### After (s31/anybuilding)

| Action | dxfPreview | picPreview | ifc7 | typeA | sheltechA | nordic | typeAProject | pearl | farmhouse |
|---|---|---|---|---|---|---|---|---|---|
| Walk → Building → Dollhouse | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Building → every floor in the list | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| A floor's card → click | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Finishes → a wall → This wall | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| → This floor | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| → Whole building | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| A balcony edge → Made of | n/a | pass | n/a | n/a | n/a | pass | pass | pass | n/a |
| Roof → Change → gable (an IFC 3D shape: its covering) | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Add → Outside → chhajja | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Reload → still there | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Walk the chosen floor | pass | pass | pass | pass | pass | pass | pass | pass | pass |

Shots: `E:/dev/plotline-shots/s31/anybuilding/after/after-<building>-<action>.png`.

- **dxfPreview · A balcony edge → Made of** (n/a): (final run, shots in after2/) no balcony edge (a low wall of a flat) seen on this tower
- **ifc7 · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **typeA · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **sheltechA · A balcony edge → Made of** (n/a): no balcony edge (a low wall of a flat) seen on this tower
- **farmhouse · A balcony edge → Made of** (n/a): (final run, shots in after2/) no balcony edge (a low wall of a flat) seen on this tower

**Reading the "before" passes.** Some "pass" cells of the before run hide what a person saw on screen, which the checks do
not read: on the Preview 3D of the DXF the tower had **no roof over the house** (the Building view looked straight into its
rooms: shot `before/before-dxfPreview-1a-building.png`), the top left said **Ground floor** and the floor list marked
Ground for a flat on floor 1, and a click on the flat **left the preview** for the project's stored copy
(`/u/<id>?floor=1&view=dollhouse`, rows 3 and 9). On the IFC sample the roof slabs were **black**
(`before/before-ifc7-1a-building.png`). All of these are fixed in the after run (`after/after-dxfPreview-1a-building.png`,
`after/after-ifc7-1a-building.png`, `after/after-ifc7-6-roof-gable.png`).

**n/a cells.** "A balcony edge → Made of" on the tower is for a Studio project's flats (its Made of changes the project's
drawing); a built-in flat's balcony is changed through Edit ▾ → Openings (it becomes the Studio draft first) — that rule is
kept. The DXF houses, the IFC 7-room flat and the farmhouse have no low wall on a flat's edge to click.

**Rows marked "harness".** A chhajja that "no spot took" on a drawing that stands on several floors was the harness not
answering the question that comes at pick-up ("Put its outside pieces on: This floor only · All N floors") — it pressed Esc,
nothing was picked up. The before column marks those three n/a; the after column's chhajja cells for Sheltech A, the Type A
project and Pearl come from a re-run that answers "All N floors" — the sunshade then lands on all 5, 7 and 5 floors.

**Still rough (not fixed here).**
- His "Something broke here" on Chrome is not reproduced in Firefox on any of the nine buildings; the page now shows the
  error's words — his next screenshot will name it.
- On the Nordic housing IFC the roof covering chosen in Finishes changes only the roof parts the file marks as the building's
  own covering; its big top slab keeps the colour the file gives it.
- Over a Studio-made top floor the roof slab over the walked flat stands 2.5 cm above the rest of the roof (it lies on the
  flat's own roof: 10 ft walls under a 3.198 m storey). Not visible at the Building view's distance.
- Over an Auto-traced floor a space the trace left open (no room closed) has no roof over it in the Building view: the roof
  covers rooms (the trace's quality, not the Building view's).
- The roof card on a building with no traced rooftop still says "Rooftop" where the floor list says "Roof" (phoneqa's note;
  left as the tests pin it).

**The last run.** After the attic fix (commit 431bffa: a pitched roof over an attic stays whole — the full after run had
shown a pale patch in the farmhouse's gable from the roof-deck change) the farmhouse, the DXF preview and the picture preview
ran through every action once more: all pass, shots in `E:/dev/plotline-shots/s31/anybuilding/after2/`
(`after2-farmhouse-1a-building.png`: the gable whole; `after2-dxfPreview-1a-building.png`: the roof over the house).
