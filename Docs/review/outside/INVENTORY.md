# Outside — what real buildings have on the outside that Plotline cannot draw

Session 31, lane *outside*, 2026-11-27. **Data only: no product code was changed.** The build lanes add the elements; the
manager judges. The founder's ask: *"real buildings look a lot different from the outside and very striking. for example a
lot of buildings use glass walls on their balcony. we don't have that. also there are a lot of textures that real
buildings use. we have none of that … if there is something that doesn't exist in our current library then add it — glass
walled balcony, textured walls and all — but make sure they can be used in any and all projects."*

The generated tables (every IFC's entity counts, every material name, the evidence per element) are in
[TABLES.md](TABLES.md). Raw results and scripts: `E:/dev/tmp/s31/outside/` (§6).

---

## 0. In plain words — the ten things real buildings have that Plotline cannot draw

Counted over the 53 sample buildings' files (`Docs/SAMPLES.md`): how many of them show the thing in their own file, their
source page's photo or their drawing set. 16 of the 53 show nothing of their outside at all (a plan with no elevation, no
photo, no material) and count for nothing here, so every number is a floor, not a ceiling. "+N" is the 22 older test
buildings (`ifc-bench`, buildingSMART) on top. "Dhaka" is what 12 Dhaka developers' brochure renders in `Demo drawings/`
show (§2e) — the buildings Plotline is sold for. The 22 older test buildings are counted once each (an architectural and a structural file of one building are one).

| # | What real buildings have | How many of the 53 | Example | Dhaka |
|---|---|---|---|---|
| 1 | **Walls that are not plain plaster** — brick (10), stone (7), exposed concrete or concrete block (7), coloured / textured render (7), metal sheet or panels (9), timber boards (7), fibre-cement panels (2) | **25** (+16) | The Finnish timber block is clad in vertical boards above a concrete base; the Vienna block is white render over insulation with sheet-metal trims; Quinta Monroy is bare grey concrete block | about 9 of 12 renders: white render with bands of timber-look slats, brick tiles, charcoal or rust metal panels |
| 2 | **Pitched roofs and what covers them** (clay tiles, slate, zinc, standing-seam metal, shingles) | **16** (+10) | IfcOpenHouse's red gable roof; the Kleine Wohnung's titanium-zinc roof; the farmhouse's metal-panel roof at 45° | none — flat roofs with roof gardens, trees and pergolas |
| 3 | **Railings** — steel, aluminium or timber balustrades on balconies, roof terraces, stairs | **13** (+21) | 25 steel railings on the Vienna block's balconies; the Quinta Monroy timber-board balustrades | about 4 of 12: steel railings and grilles |
| 4 | **Glass balcony fronts** — a glass panel balustrade instead of a solid parapet, and balconies glazed in | **5** (+4) | The Vienna block's balconies and terraces all behind glass panels with a steel top rail; the Kleine Wohnung's 8 "glass element, infill below" balustrades; the Nordic block's 6 glazed balconies; 176 glass balustrades on Sixty5 (Amsterdam) | **about 7 of 12 — the commonest balcony front on the covers**, often with planters behind |
| 5 | **Window frames in their own colour and material** (anthracite or white aluminium, uPVC, timber, black steel) | **8** (+5) | Gaia: "PVC frames, anthracite grey"; Advanced Project: "White RAL 9010"; the brick walk-up's black frames | dark grey or black frames on most |
| 6 | **Glass fronts with mullions and panels** (curtain walls, shopfronts, glass bays) | **7** (+8) | The Nordic office's 85 curtain walls; Gaia's 37 with 758 mullions | floor-to-ceiling glass behind most balconies |
| 7 | **The roof edge and the cornice** — parapet caps, eaves flashings, cornices, fascia boards | **9** (+4) | 217 eaves flashings on the Nordic office; the brick walk-up's cornice; Macky Auditorium's crenellated gables | deep slab edges and roof frames, no cornices |
| 8 | **Balconies that stand out** — a projecting slab with its edge showing, curved balconies | **8** (+2) | 65 cast balcony slabs on the Amsterdam block; Newburn Flats' curved balcony | **about 7 of 12: deep projecting balcony frames**, often a darker colour |
| 9 | **Outside stairs, ramps, fire escapes** | **6** (+2) | The brick walk-up's black steel fire escape; Quinta Monroy's open timber stairs | none seen |
| 10 | **Canopies, porches and sunshades** — entrance canopies, porch roofs, awnings, louvres | **8** (canopy 5, louvres / awnings 3) (+2) | The Vienna block's balcony canopy; Gaia's wall of slats; four white fabric awnings in Cáceres | about 4 of 12: vertical fins, timber screens, perforated metal panels |

Below the ten: fences and boundary walls (4), solar panels (3), green or gravel roofs (3), roof windows (3), a chimney (1)
— all in §3 with where each would live in Plotline and a free (CC0) texture or the rule to build it in code.

**The one finding behind all ten.** A building Plotline draws itself — every built-in flat, every plan traced from a
picture, a DXF, a PDF — is one warm plaster all over: every outer wall, balcony parapet, slab edge and roof parapet uses the
same texture (`EXTERIOR_PLASTER`, `src/three/materials.ts`), windows get one grey aluminium frame, and there is **no place
to choose anything else**: `Docs/MANUAL.md` §11 lists "its paint on the outside" and "its finish" (a parapet's) as *cannot be
changed anywhere*. The library's 154 pieces are furniture, lights and greenery — not one facade piece. Of the 21 texture
sets only plaster, concrete and the ground surfaces can stand outside: no brick, stone, timber cladding, metal panel, roof
tile or gravel. An **architect's IFC** does carry much of the outside (railings, glass balustrades, roofs, mullions) — but as
flat colours only: Plotline keeps each triangle's colour and drops every material name (429 named materials in the 21
sample IFCs) and none of the files has a single texture (§4).

**What could not be seen.** Of the 39 source pages `Docs/SAMPLES.md` names (all fetched), only two show the building: ELEMENTAL's Quinta Monroy page (one
photo) and Google's KML page (a picture of Macky Auditorium). The Zenodo, TU Wien, VTT, GitHub and Wikimedia pages show
logos, licences or the plan itself; the Loughborough, ZivaHub and gov.ie pages refused the connection (HTTP 403). So the
"what the real one has" column comes mostly from the files themselves (materials, element types, names, colours, texture
pictures, elevations), which is what Plotline can actually read. The two HoloLens flats, five DXF floors, five PDFs and four
SVGs show nothing of their outside (§2c).

---

## 1. What Plotline draws of a building's outside today

**A building Plotline draws itself** (`src/three/building.ts`, the Building view; the same tower stands round the walk and
the Dollhouse). Shot: `E:/dev/plotline-shots/s31/outside/builtin-type-a-1.png` (BTI Type A tower, High, 15:30).

- Every other flat is a shell of its traced walls with openings cut, merged per flat per floor, in **one material**:
  `EXTERIOR_PLASTER` = the `plaster_white` scan (Poly Haven white_stucco) tinted `#dbd3c6`. Slabs and the roof plate: the
  same plaster. The walked flat's own outer faces: the same.
- **Windows and sliders**: real glass with the room behind it, the frame and the meeting stile drawn in the pane's shader
  in one fixed grey (`PANE_FRAME`, rgb 0.50 / 0.51 / 0.52). Doors: voids.
- **Balconies**: a balcony room's floor plus its low walls — any wall under 1.2 m is a solid plaster box (parapet, railing
  and planter edge alike). No railing, no glass, no slab edge.
- **Glass walls** (Studio O tool → *Glass wall*): a floor-to-top pane of thick green-tinted glass (`GLAZING_GLASS`), no
  mullions, no frame colour.
- **Roof**: the top floor's plate, a 1.1 m plaster parapet on its outer walls, dark water-tank boxes, lawn strips.
- **Ground**: a paving plinth, columns and blocks as plaster boxes, roads, lawns.
- **Choices**: none outside. Finishes covers floors, walls and ceilings *inside* rooms (`src/furnish/finishes.ts`: slot
  targets floor / wall / ceiling, keys `room:` and `wall:<wallId>:<roomId>` — an outer face has no room, so no key).
  MANUAL §11: wall "its paint on the outside", low wall "its finish", glass wall "frame, glass colour" — cannot be changed.

**A building from the architect's file** (`src/import/ifc.ts`, `src/import/mesh.ts`, `src/three/shell.ts`). The file's
"outside shape" stands in for the plaster boxes: every IFC product but walls' rooms, openings' voids, spaces, annotations
and furniture is kept as triangles **grouped by their flat colour** (`writeGlb`: one material per colour, no texture, no
material name; windows flagged so solid glass can be left out). A 3D model keeps its own materials and pictures. What that
looks like in the shots (§2a, §2b):

- Railings, glass balustrades, roofs, mullions, balcony slabs, eaves **do appear** — as flat colours: Vienna's and the
  Kleine Wohnung's glass balustrades as pale see-through panels, Gaia's glass veranda as a violet box.
- **Textures never**: render, brick, timber boards, zinc, gravel and grass are one flat colour each — the Nordic office's
  green roof is a flat bright green slab; the Gaia render "Crépi beige, texturé" is a flat pink-beige.
- The file's glass tints are drawn literally: the Kleine Wohnung's windows (blue at 25 %) read saturated blue.
- Problems seen on the way (for the IFC lane, not this one): the **Nordic timber housing floats 47 m above the street** —
  the file has an empty storey "Sea_Level" at 0 m under "Foundations" at 47.3 m and the reader takes the lowest storey as
  the ground; its piles show as long posts down to the street. **IfcOpenHouse**: Plotline's own walls are drawn as
  flat-topped boxes up to the gable's peak, poking through the file's pitched roof. The **Advanced Project** (a 236 × 166 m
  site with mock-up neighbours, capped at 1.5 million triangles) disappears among the street blocks Plotline puts round it.
  The **Vienna** block's two garage levels stand above the street instead of under it (the same "lowest storey = ground"
  rule).
- A **3D model** is drawn centred on the walked flat at whatever size it came in (§2b): toy-size ones sit inside it, the
  right-size brick walk-up stands inside the Type A tower hidden by its slabs, and the Collada **Macky Auditorium is
  invisible** — all 52 meshes arrive with opacity 0.

---

## 2. Building by building

How to read: *Has* = what the real one has outside, from the file (script counts and material / type names, §6) and the
source page; *Shows* = what Plotline draws in the Building view after the founder's path (drop the file on `/studio` →
**Show building**; a one-storey file or a 3D model: **Building → Put only this plan into a building… → Show building**, a 3D
model on Type A, since an outside shape waits for a drawing); *Missing* = what Plotline cannot draw of it. Shots:
`E:/dev/plotline-shots/s31/outside/<name>-1.png` (the view's own camera), `-2.png` (turned), `close/<name>-a|b|c.png`
(the camera moved round the outside shape: two sides, then street height).

### 2a. The 21 IFC files

| Building (file) | Has — from the file (and source page) | Shows in Plotline today | Missing |
|---|---|---|---|
| **De Basis, Doorn** (a3.ifc), structural model | 212 floor slabs, 369 proxies, 742 walls, 150 beams, 64 columns; materials are concrete grades and "Isokorf" ×202 (the thermal break that carries a **cantilevered balcony**); no facade material, no railing (the dataset is about balconies). Source page: no picture | The bare concrete frame in Revit's structural colours (cyan beams, magenta columns, orange proxies) — `-1`, `close/…-a` | Not a facade model: nothing to compare except the balconies, which come as bare slabs |
| **Amstelveen 10-storey block** (a4.ifc), structural | 36 "Prefab beton balkon 300mm" slabs (one per floor and bay), 155 walls, 36 columns | A white frame with a stack of **bare projecting balcony slabs**, no edge, no railing (`close/…-a`) | The railings or glass fronts the real balconies carry (not in this model) |
| **Spaarnelicht, Amsterdam** (a7.ifc), structural | 65 "FL_ihwg_beton_290_balkon" slabs, 702 outer walls (IsExternal), calcium-silicate ("kalkzandsteen") inner leaves, steel S355 | A white concrete skeleton with balcony slabs; red steel columns at the corners (`close/…-a`) | (as a4) |
| **BIM4EEB demo, Finland** (BIM4EEB…FIN.ifc) | 226 outer walls: "Stukko - valkoinen hieno" (fine white stucco) and "Puu - mänty rae vaakasuora" (**horizontal pine boards**); 335 windows; wood-fibre insulation, concrete. Interiors left out for privacy | Walls one flat light grey (Revit's 127/127/127), balcony slabs bare, windows as see-through panes (`close/…-a`) | White render vs timber boards (both flat grey); railings (none in the file) |
| **BIM4EEB demo, Poland** (BIM4EEB…POL.ifc) | 10 IfcRoof + 6 ROOF slabs, 127 walls, 82 windows; materials only "Material_1…20" (no names); colours: beige, sand, a red-brown roof (116/75/75) | A corner tenement with a **mansard roof and dormers** in flat pink-brown, cream walls with tall windows, a shop-window ground floor (`close/bim4eeb-demo-pol-c`) | The roof's covering, the facade's render — and every material is unnamed in the file: nothing to map by name |
| **Advanced Project** (AdvancedProject.ifc), student Revit model, 8 floors + garage | **19 glass-panel balustrades** ("Railing:Glass Panel - Bottom Fill", stainless + glass); "Render, Beige, Textured" (630 mm wall type); windows "White RAL 9010"; "Roofing, Tile"; **23 solar panels** (proxies); a garage ramp; mock-up neighbour blocks | 236 × 166 m site at 1.5 M triangles (capped): from the view's camera a small block among Plotline's street blocks; closer, it is hidden behind the generated neighbours (`close/…-c`) | Textured beige render, white frames, tile roof — flat colours; the street blocks Plotline adds stand where the file's own mock-ups are |
| **Gaia switch house, Portugal** (Gaia_Renovation_Demo_Building.ifc) | Render **"Crépi beige, texturé"** on EPS boards (ETICS), "Petit Granit, coupé, poli" (blue-grey stone), architectural concrete, a zinc sheet, "Eternit"-look paint; **37 curtain walls** with 758 mullions and 112 glazed panels — a **glass veranda** and **sloped glazing**, a curtain wall of **slats** ("CHEK_Lames", a louvre screen); a **glass-panel balustrade** ("Panneau de verre - Remplissage Inférieur", stainless + glass) on the roof terrace; PVC frames "gris anthracite"; a fascia board | The house in flat pink-beige (its render's colour), the veranda a **violet-blue glass box** (the file's glass at 25 %), the roof terrace's posts and glass faint; the lower storey Plotline's own plaster (`close/…-a`, `-b`) | Textured render, stone, zinc, anthracite frames, the slat screen as slats |
| **EDEA experimental building, Cáceres** (EDEA….ifc) | A renovation: perforated ceramic brick, render mortar, **Viroc** (cement-bonded wood) panels and 4 cm **precast concrete panels** as new skins, white aluminium frames, 7 aluminium railings, a **gravel roof** ("Capa de grava"), and **4 white fabric awnings** ("Toldo Navarrete Novelty", canvas RAL 9016) | A small white box with an orange band (the file's 231/120/23) and the awnings as grey slanted planes (`close/…-a`) | Panels and brick as textures; the awnings as fabric; the gravel roof |
| **IfcOpenHouse** (IFC2x3 and IFC4, two files) | 4 walls of "Brick" 360 mm, a **gable roof** (IfcRoof GABLE_ROOF; dark red-brown 61/20/10), timber window frames (128/102/77) with mullions, a door, a stair, a strip footing | The file's red gable roof over beige walls — but Plotline's own walls stand inside as **flat-topped plaster boxes up to the gable's peak, poking through the roof** (`-1`) | Brick (flat beige), the roof's tiles; the walls must stop under the roof |
| **Nordic LCA housing, timber** (ARK_NordicLCA_Housing_Timber….ifc), 6 storeys + basement | 84 outer walls; **"Puuverhous" (timber cladding) on 75 walls**, "Betoniverhous" (concrete cladding) on the base, "Kalkkihiekkatiili" (sand-lime brick), "Metallipinnoite" (metal roof coating); **6 glazed balcony fronts** ("JULKISIVUVARUSTEET": glass + aluminium); 11 metal / aluminium railings; 45 timber posts; 1 skylight, 1 solar panel. Source page: "all apartments have windows on three sides", a sheltered terrace | The block in pale cream and white, the glazed balconies as pale grids — and the whole building **47 m in the air** on its piles (an empty "Sea_Level" storey under "Foundations" at 47.3 m; `-1`, `-3`) | Vertical timber boards, the concrete base, the glazed balconies' frames; the building must stand on the street |
| **Nordic LCA office, concrete** (ARK_NordicLCA_Office_Concrete….ifc) | 437 outer walls; **85 curtain walls** (glass "Lasi" + 8 592 aluminium members); **copper** ("Kupari", 65), stone ("Kivi", 23), timber cladding; **217 eaves flashings** ("Räystäspelti", proxies); a **grass roof** ("Nurmi"); 4 outside ramps ("ulkoluiska"). Source page: "a shading system has been designed for the south-west façade" | A dark mullion grid over the glass fronts, a **flat bright-green roof slab**, white walls (`-1`) | Copper, stone, timber, the shading system, the grass as grass |
| **Azuma house** (AZUMA9.ifc; Tadao Ando's row house, student model) | Walls exported as 52 proxies of "Béton armé (Coulé)" — **exposed in-situ concrete**; "Dallage - Pierre" (stone paving) in the patio; dark slabs | A plain light-grey box with its patio and roof-terrace walls (`close/oimr-azuma-house-a`) | Board-marked exposed concrete |
| **Svaleveien 8, house A** (Svaleveien_8_Hus_A.ifc), Norway | Timber-frame walls with **"puss"** (render) and **"Rupanel"** (rough timber cladding) on 13 parts + 4 CLADDING coverings; a **freeform metal roof** ("Alu finishing"); 4 parapet walls; 2 railings | All white (the file's colours are all 255/255/255), a dark flat roof framed in black, black frames on the glazed corner (`close/oimr-svaleveien…-a`) | The cladding boards, render, the metal roof |
| **Donor building, The Hague** (Donor.ifc), as-built from a laser scan | 102 windows (frames "Window Frame", glazed panels), 1 curtain wall with 12 glazed panels, 6 guard rails, a flat roof, a garage; walls only "Default" (no facade material) | Light grey-white walls, white frames, pale blue glazing, the garage annex (`close/sum4re-den-haag-donor-c`) | The real brick / render is not in the file |
| **HoloLens flat C** and **flat D** (two files), Spain | One flat each from a HoloLens survey: "Default Wall", doors, windows — no outside | A one-storey white box under a black roof slab (the file's 0/0/0); the view's own camera starts inside it (`-1` is black) | Nothing known of the outside |
| **Longyearbyen building** (Longyearbyen.ifc), Svalbard | A **shed (mono-pitch) roof** (IfcRoof SHED_ROOF), a **private exterior stair** (timber steps), 15 white railings, 20 windows with frames; walls "Generic Material" | Cream-grey walls, white railings on the balconies and the outside stair, coloured glass doors, and the roof a **flat bright-green slab** (the file's 0/127/0) (`close/sum4re-longyearbyen-c`) | The real cladding (not in the file); the roof's covering |
| **Real-world test model, Vienna** (RealWorldTestModel….ifc), 5 floors + 2 garage levels | Render ("Zementputz") on EPS — 143 render and 448 cladding parts; **264 sheet-metal parts** ("Blech") and **standing seam** ("Stehfalz") on a **pitched roof** ("Schrägdach"); flat **gravel roofs** ("Flachdach Kies"); **25 railings with glass infill** on balconies and terraces; 91 **Profilit** channel-glass parts; a **balcony canopy** ("Balkon Vordach"); 36 parapet walls ("Attika"); a **fence** (52 parts); **4 solar collectors**; roof windows ("Dachfenster") | The white block with its **glass balcony fronts as pale green panels** and steel top rails, the furniture inside, the garage podium **above the street** instead of under it (`close/…-a`) | Render texture, sheet metal, gravel; the garage must sit below the street |
| **Kleine Wohnung** (kleine_Wohnung_R22.ifc), small German apartment house | "Ziegel" 240 mm walls (rendered, white), **"Metall Panele" walls**, a **titanium-zinc pitched roof** ("Titanzink - Eindeckung"), **8 glass balustrades** ("Geländer:Glaselement - Füllung unten", stainless + safety glass), natural-stone stairs | White and grey walls, balconies with **see-through blue-tinted glass fronts**, windows **saturated blue** (the file's 0/0/255 at 25 %), a pale flat-coloured zinc roof (`-1`) | Zinc and metal panels as metal; the windows' glass as glass |
| **LTU A-House, Luleå** (LTU_A-House_redesign.ifczip), university building | 2 408 outer walls, **brick** ("tegel, std."; brick-red 201/89/69 on 6 % of the wall triangles), **board cladding** ("glespanel"), 5 curtain walls with 145 glazed panels, a **canopy** ("SKÄRMTAK"), 976 windows, a skylight | A long white block with red brick bands, capped at 1.5 M triangles (`-1`) | Brick and boards as texture |

### 2b. The 6 3D models

A 3D model is shape only: it is dropped on a drawing (here Type A, `/studio?unit=type-a`) and becomes its outside shape
(the Studio's *Outside shape* panel: offset, turn, floor height); then **Building → Put only this plan into a building… →
Show building**. In all six the Building view **drops the tower's own outer walls** (the flats stand as see-through
boxes of slabs and balconies, as the code intends when an outside shape is set) and draws the shape where the walked flat
is, centred on it, at whatever size it came in:

- the three **toy-size** models sit inside or beside the walked flat: the Delft city tile is 1 m long on Type A's
  living-room floor (`close/3dbag…-c`), the NASA hall's white panels and logo stick out of the tower at floor 2
  (`close/nasa-vehicle…-a`);
- the **brick walk-up**, the right size, stands *inside* the Type A tower, where the flats' slabs and rooms hide it; its
  pink brick shows through the windows (`close/polygoogle…-a`);
- **Macky Auditorium**, the right size (70 × 71 m, 35 m tall), cannot be seen at all: a probe in the page
  (`scripts/probe.mjs`) finds all 52 of its meshes with **opacity 0** and *transparent* on — the Collada file's
  transparency read as fully clear (`macky…-1.png`, `close/macky…-a|c`).

So today a facade model shows its brick and stone only where nothing of Plotline's tower stands in front of it.

| Model (file) | Has — its materials and pictures (and source page) | Shows in Plotline today | Missing |
|---|---|---|---|
| **3DBAG Delft tile** (9-284-556-LoD22-3D.obj + .mtl) | 1 212 buildings of a Delft neighbourhood (1950s flats, row houses) with their **real roof shapes** (LoD 2.2: gables, hips, flat); 4 flat colours: red roofs (0.87/0.26/0.28), cream walls, grey ground; no pictures | A 1 m model on the living-room floor (the unit guessed as millimetres, `SAMPLES.md` class *unit-guess-model*) | Real size; then brick and roof tiles as textures |
| **Macky Auditorium** (MackyBldg.kmz; the same as `files/CU Macky.dae` with its pictures) | 22 materials, **20 photo textures** (looked at: `files/CU-Macky-FrontnoCulling.jpg`, `…RoofnoCulling.jpg`): **red-brown brick** walls, **sandstone** trim and window surrounds, Gothic **tracery windows**, **stepped crenellated gables**, turrets, a **red tile pitched roof** (an aerial photo). Source page: a picture of the textured model in Google Earth (`mackyBldg.gif`) | Invisible: every mesh at opacity 0 (above); the KMZ alone loses its pictures (`SAMPLES.md` *kmz-pictures*), the DAE with its folder keeps them | The shape must show; then nothing — it is photo-textured (the one way today to get brick on a building) |
| **NASA Headquarters** (Headquarters_Building.glb) | A massing model, 89 meshes, 12 flat materials named "Glass" (blue), "Cement", "Sand", "Metal", "RustyRed", "White", "GrayPoles", "Tree" | A 7.8 m toy inside the walked flat (`close/nasa-headquarters…-a`) | Real size (`SAMPLES.md` *toy-size-model*) |
| **NASA Vehicle Assembly Building** (Vehicle_Assembly_Building_VAB.glb) | 4 pictures (looked at: `runs/model-pics/…VAB_glb-1.png`): **white metal-panel walls** in large bays, the flag and the NASA logo painted on | A 15 m toy sticking out of the tower at floor 2: its white panels and the logo show (`close/nasa-vehicle…-a`) | Real size (160 m) |
| **Brick apartment building** (Apartment_building.glb, Poly by Google) | One 2048 px atlas (looked at: `runs/model-pics/polygoogle…-0.png`): **pink-red brick** with **cream stone window surrounds and lintels**, a **banded rusticated base** (red and cream stripes), a **black steel fire escape** with railings and stairs on every floor, a dark **cornice**, black window frames with blinds | Inside the Type A tower, hidden by its slabs; its brick shows through the windows (above) | The shape must stand clear of the tower; it is textured already |

### 2c. The 26 drawings (10 DXF, 10 PDF, 6 SVG)

These are plans: Plotline draws them as a traced building (§1, plaster all over). What their outside is, where the file
or its set tells:

| Drawing (file) | Has — from the file, its set and its source page | Missing in Plotline |
|---|---|---|
| **BC apartment block floor** (A_000217.dxf), multi-unit residential | Wall-type notes and hatches name the whole outside: **"VINYL SIDING (SEE ELEVATIONS)"** (hatch "4\"-VINYL" ×8), **"CULTURED STONE VENEER"** (hatch "CAROLINA-LEDGESTONE" ×3), **"3/4\" STUCCO C/W K-LATH"**, hatch **"BOARD-BATTEN"** ×4, "PREFINISHED ALUMINUM SOFFIT", **"42\" HIGH ALUMINUM HANDRAIL"** and hatch "GUARDRAIL" (balconies), "BALCONY", "24\"x24\" CONCRETE PAVERS", **"7:12 PITCHED ROOF"**, **"ROOF SHINGLES"**, "FLAT ROOF", "2 PLY TORCH DOWN SBS ROOFING", "EXTERIOR STAIR - CONCRETE" | Siding, stone veneer, stucco, board-and-batten, aluminium railings, a shingled pitched roof — none |
| **Loughborough semi-detached houses** (Internal_First.dxf, Internal_Ground.dxf; the set's zip has four elevations and a site plan) | Elevations (`sheets/Elevation_South_pdf-p1.png`, `…East…`): one **hipped roof** over the pair with **two front gables**, a **"Tile hung area"** band between the storeys, **"Sub-floor air brick"** (brick walls), arched front doors; site plan: **"Brick wall (1m high)"**, **"East boundary wooden fence (0.8m)"**, "wooden fence/evergreen hedge (1.8m)", brick and concrete pathways (blocks BRICK_PATHWAY, CONCRETE_PATHWAY, WOOD_FENCE), "Similar roof height to 207/209" | Brick, tile-hanging, the hipped roof and its gables, a brick boundary wall, timber fences |
| **Ceco.NET house Tm-53** (DXF) | "PROJECTION OF THE ROOF" (an eaves overhang drawn round the plan), site levels, plants | The eaves overhang |
| **Kua ruins, house 3** (DXF), Tanzania | A Swahili **coral-stone** house (SAMPLES; source page refused the connection) — walls and niches standing | Coral rag stone (Poly Haven has `coral_stone_wall`, CC0) |
| **LibreCAD basement remodel** (DXF) | "glass block window", soffit — the inside of a basement | (inside only) |
| AL MAJD first floor, IJS env0 and env3 floors, UCL office floors (4 DXF) | Plans only: no elevation, no material note, no photo | — (unknown) |
| **Farmhouse drawing set** (PDF, 25 pages: 4 elevations, sections, details) | Front elevation p. 12 (`sheets/Farmhouse…-p12.png`, the others pp. 13–15): **"CLAPBOARD SIDING"** with corner boards, frieze and water-table boards and window surrounds; **"5V METAL ROOF PANELS"** at 12/12 (45°) with a bulbed ridge cap; a **"BRICK CHIMNEY"** and a **"BRICK FOUNDATION WALL"**; a **front porch** 30 × 7 ft under a 4/12 metal hip roof on 6×6 posts, with decking and an optional **porch balustrade** (p. 21); fascia boards; notes "**DO NOT USE VINYL OR ALUMINUM SIDING**", "FINISH WOOD HANDRAIL"; site: **"WHITE PICKET FENCE"**, gates, a brick path, a gravel drive | Clapboard, the metal roof, brick chimney and base, the porch with its roof and posts, the picket fence |
| **CMHC fourplex** (PDF, 3 pages) | Plans with "Building Height (Roof Peak)", terraces / patios — a pitched-roof house (no elevation page in this PDF) | The pitched roof |
| **Quinta Monroy** (PDF, 5 pages: plans, sections, facades at 1 : 50) + the source page's photo | Photo (ELEMENTAL's page): three-storey row houses of **bare grey concrete block** ("BLOQUETA HORMIGÓN 39X19X14 CM" in the set), a white roof coping, **open timber stairs** with board (OSB) sides up to the first floor, **landings with board balustrades** and a timber rail, the empty bay between houses left for the owners; roof "PLANCHA ZINC TOLEDANA" (**corrugated zinc sheet**) | Concrete block, the outside stairs, board balustrades, the corrugated roof |
| **Newburn Flats** (PDF) | One flat: angled outer walls, a **curved balcony** (SAMPLES); source page: no photo | A curved balcony slab and its railing |
| **Arlington House** (PDF) | First floor with the **portico columns** (the NPS alt text: "the exterior Portico in darker moss green") | A portico: columns carrying a roof |
| DfE primary school, Hannover Pagenstraße 2, Irish MMC flat, Casa Steiner, NIST NZERTF house (5 PDF) | Plans only (the NIST set is plumbing / electrical / fire); Hannover's page says "listed building, c. 1908" but shows only the plan; Casa Steiner's plan names a winter garden and terrace | — (unknown) |
| **Bolduc House** (SVG) | A 1740s French colonial house: the plan's **porches / galleries** round the house (HABS drawing); source page: plan only | A gallery: a roof on posts round the house |
| **Miletičova 12 tower** (SVG) | A 1957 tower; the source page files it under **"Plattenbau"** (precast concrete panel building) | Precast panel joints |
| Milano QT8, Rzut budynku, Vandergrift bungalow, Little White House (4 SVG) | Plans only; no photo on their pages | — (unknown) |

### 2d. The 27 older test IFCs (data only, not dropped in Firefox)

What their own data shows (full evidence in [TABLES.md](TABLES.md)); they were scored for walls and rooms in
`Docs/FORMATS_SCOREBOARD.md`, not shot here.

| Building (file) | What its own data shows of the outside |
|---|---|
| 4351/arc | railings (11); brick: Masonry - Brick · Masonry - Brick 0.302 · Basic Wall:Exterior - Brick  |
| ac20/arc | railings (12) |
| city_house_munich/arc | railings (5); render: Render, Cream, Textured · Render, Cream, Textured: Render, Cream, Text; metal cladding / roof: Blks - Metal - Copper - Polished · Blks - Metal - Satin - Corrugated -; window frames: Aluminium, dark grey · Aluminium_ALUPROF_RAL7036_PlatinumGrey; pitched roof: 1 GAMBREL_ROOF |
| dental_clinic/arc | railings (9); curtain wall: 31 IfcCurtainWall, 172 IfcPlate, 522 mullions; fence: Plate: System Panel:Chain Link Fence Panel:Chain Link Fence Panel / Ch |
| dental_clinic/str | railings (3); metal cladding / roof: Roofing - Metal · Roofing - Metal 0.006 · Basic Roof:Standing Seam Met; pitched roof: Basic Roof:Standing Seam Metal Roof; outside stair / ramp: RampFlight: Rampmm Concrete ADA Ramp / Rampmm Concrete ADA Ramp /  |
| digital_hub/arc | railings (13); render: Ortbeton - bewehrt Verputzt · Ortbeton - bewehrt Verputzt: Ortbeton - ; metal cladding / roof: Metall - Zink · Metall - Zink: Metall - Zink; stone: Mauerwerk - Naturstein · Mauerwerk - Naturstein: Mauerwerk - Naturstei; fibre cement: Faserzementplatte (Equitone - natura): Faserzementplatte (Equitone - n; curtain wall: 1 IfcCurtainWall, 25 IfcPlate, 72 mullions; green / gravel roof: Dachdeckung - Begrünung · Dachdeckung - Begrünung: Dachdeckung - Begrü |
| duplex/arc | railings (4); brick: Masonry - Brick · Masonry - Brick 0.092 · Basic Wall:Exterior - Brick ; skylight:  skylight / roof window |
| ettenheim_gis/city | railings (1); pitched roof: 154 FREEFORM; fence: Door: Oberes-Tor |
| fantasy_hotel_1/arc | glass balustrade: 11 IfcRailing: Railing:Glass Panel - Bottom Fill · Railing:Glass Panel; railings (11); brick: Brick, Common · Basic Wall:Generic - 100mm Brick [STANDARD] · Basic Wa; exposed concrete: Concrete, Precast; curtain wall: 23 IfcCurtainWall, 29 IfcPlate, 50 mullions; window frames: Window Frame; pitched roof: Asphalt Shingle |
| fantasy_hotel_2/arc | glass balustrade: 32 IfcRailing: Railing:Glass Panel - Bottom Fill · Railing:Glass Panel; railings (32) |
| fantasy_office_building_1/arc | railings (28); metal cladding / roof: Metall - Paneel, verzinkt · Metall - verzinkt; stone: Naturstein - Granit; exposed concrete: StB - Sichtbeton (1) · StB - Sichtbeton (1): StB - Sichtbeton (1); curtain wall: 38 IfcCurtainWall, 453 IfcPlate, 804 mullions |
| fantasy_office_building_2/arc | railings (33); render: Ortbeton - bewehrt Verputzt; stone: Mauerwerk - Naturstein; curtain wall: 9 IfcCurtainWall, 280 IfcPlate, 688 mullions; pitched roof: Dachdeckung - Ziegeldach · Dachdeckung - Holz · Dachdeckung - Holz: Da; green / gravel roof: Dachdeckung - Begrünung · Dachdeckung - Begrünung: Dachdeckung - Begrü |
| fantasy_office_building_3/arc | railings (20); render: MW - Ziegel, verputzt; timber cladding: Holz - Verschalung · Holz - Verschalung: Holz - Verschalung; metal cladding / roof: Basisdach:Titanzink - Eindeckung · Metall - verzinkt; stone: Naturstein - Granit · Naturstein - Granit: Naturstein - Granit; curtain wall: 5 IfcCurtainWall, 51 IfcPlate, 158 mullions; pitched roof: Basisdach:Titanzink - Eindeckung |
| fantasy_residential_building_1/arc | glass balustrade: 31 IfcRailing: Geländer:Glas - Ohne Pfosten · Geländer:Glas - Ohne Pfo; railings (31); brick: Mauerwerk - Ziegel; timber cladding: Holz - Verschalung · Holz - Verschalung: Holz - Verschalung; metal cladding / roof: Basisdach:Titanzink - Eindeckung · Metall - verzinkt; stone: Naturstein - Granit; exposed concrete: StB - Sichtbeton (1) · Basiswand:STB 15.0 - Sichtbeton [STANDARD] · Ba; curtain wall: 42 IfcCurtainWall, 109 IfcPlate, 183 mullions; window frames: Plastic_Gealan_PVC-H; pitched roof: Basisdach:Titanzink - Eindeckung; parapet cap / eaves: 2 IfcCovering MOLDING; solar: 0 IfcSolarDevice, 51 named solar |
| fzk_house/arc | railings (2) |
| hitos/arc | railings (6); brick: Tegl vanlig / murt vegg; render: Puss · Puss 15; stone: cut stone · cut stone 150; louvres: BuildingElementProxy: Solavskjerming kantine / Solavskjerming kantine ; canopy: Slab: Baldakin / / ; parapet cap / eaves: 10× WallStandardCase: Gesims_AV52T / ; outside stair / ramp: Ramp: Rampe / /  |
| molio/arc | railings (2119); brick: _DK Ydervæg, tegl/Beton, 588, 108/180 588 · Mursten - Beklædning Grå; timber cladding: _DK Ydervæg, beklædning/beton, 396 376 · Mursten - Beklædning Grå · Tr; green / gravel roof: _DK Dæk terræn, grus/iso/afret 510 mm 510 · _DK Dæk terræn, grus/iso/t |
| samuel_macalister_sample_house/arc | railings (10); timber cladding: Finishes - Exterior - Timber Cladding · Finishes - Exterior - Timber C; metal cladding / roof: Roofing - Metal Standing Seam; exposed concrete: CL Concrete_ panels · CL Concrete_ panels 280; curtain wall: 9 IfcCurtainWall, 46 IfcPlate, 148 mullions; pitched roof: Roofing - Metal Standing Seam; solar: 0 IfcSolarDevice, 12 named solar; skylight:  skylight / roof window |
| schependomlaan/arc | railings (90); metal cladding / roof: zinkwerk_(#730061) · zinkwerk_(#721840) · zinkwerk_(#723874); window frames: stelkozijn_(#650409) · stelkozijn_(#613855) · stelkozijn_(#662684); parapet cap / eaves: 1× Covering: muurafdekker_(#273825) /  |
| sixty5/arc | glass balustrade: 176 IfcRailing: Glas 20 · Glas; railings (176); stone: DD Steen -kunststeen; exposed concrete: DD prefabbeton gevel; window frames: stelkozijn dagmaat 2595x2525 · stelkozijn logia pui 7e verd · stelkozi; balcony slabs: 23-prefab beton loggia · DD loggia afwerking; parapet cap / eaves: 202× Wall: 41-covering-DD-DAKRAND REKJE / REKJE balkon rand (1e verd ) |
| sixty5/str | structure only, nothing outside named |
| smiley_west/arc | railings (120); canopy: Slab: EG-Vordach-01 / Aluminium 587913947 98; balcony slabs: 1OG-Balkon-2-1 · 1OG-Balkon-2-2 |
| wbdg_office/arc | railings (10); brick: Masonry - Brick · Masonry - Brick 0.09 · Basic Wall:Exterior - Brick o |
| wbdg_office/str | metal cladding / roof: Basic Roof:Standing Seam Metal Roof · Roofing - Metal · Roofing - Meta; pitched roof: Basic Roof:Standing Seam Metal Roof |
| cert-Building-Architecture | pitched roof: 1 type:GABLE_ROOF; chimney: 1 IfcChimney |
| cert-Building-Landscaping | structure only, nothing outside named |
| cert-Building-Structural | pitched roof: 1 type:GABLE_ROOF; chimney: 1 IfcChimney |

### 2e. Dhaka check — 16 developers' brochures

Plotline is sold to Dhaka developers, so 16 brochures in `Demo drawings/` (already on this PC, page pictures in each
`pages/` folder; read only, nothing fetched) were looked at for their facade: first the covers
(`E:/dev/plotline-shots/s31/outside/dhaka-1.png`, `dhaka-2.png` — mostly logos and paintings; four show the building),
then the first render page of each (`dhaka-3.png`, `dhaka-4.png`), and one at full size (Akter Aziz's Manor p. 3).
Twelve show the building. Counted by eye from those pictures, so "about".

| Brochure (page) | What its facade shows |
|---|---|
| **Akter Aziz's Manor** (p. 3, full size) | White render with horizontal reveals; **glass balcony balustrades** with a thin metal top rail on every floor; **deep charcoal balcony frames** projecting from the face; **timber-slat soffits** under the balconies; **black perforated metal screens** beside them; planters on every balcony, trees on the roof; floor-to-ceiling glass behind; a stone-faced **boundary wall** and a **timber-slat gate** at the street |
| Akter Anaya Intezaar (p. 5) | A dark **timber-look vertical feature wall** up the middle; **glass balustrades** with planters; dark frames; lit at night |
| Akter Aleena (p. 6) | White tower with **black vertical bands**, grey **metal railings**, climbers |
| Assure Gladiolus (p. 2) | White balconies with **timber-look slatted panels** and dark vertical-bar railings |
| Assure Hermitage (p. 2) | White with a **terracotta brick-tile band**; **glass balustrades** |
| Assure Nirjhor (p. 2) | White with **dark grey panels**; **glass balustrades**; planters |
| Assure Phera (p. 2) | White and grey with a **rust-red (corten-look) fin** up the corner; glass on the balconies |
| Assure Skyline (p. 2) | White; **glass balustrades** on deep balconies; planters |
| Eastern Housing Noboneer (p. 2) | A white grid frame, glass railings, **vertical green**, **timber screens** at the ground floor, a gate and boundary wall |
| Mir Amena's Heritage (p. 2) | A white tower with grey **steel railings** on its balconies |
| Mir Jahan-e-Nur (p. 2) | White with **red brick-tile bands**; steel railings; a ground-floor gate |
| Mir Tiara (cover) | Grey and white with **vertical planters** and timber accents |

So on the buildings Plotline sells: glass balcony fronts (about 7 of 12) and a second facade material beside the white
render (about 9 of 12: timber-look slats, brick tiles, charcoal or rust panels) are the norm; deep projecting balcony
frames and planters are common; every roof is flat. The 53 samples (European and American houses and blocks) rank pitched
roofs first; for Dhaka they are last.

---

## 3. The ranked missing list

By how many of the 53 need it (their own evidence, §2; `runs/the53.json`), then by the 22 older test buildings ("+").
"Where it lives" points at the five places of §5. "CC0 source": every Poly Haven and ambientCG asset is CC0 1.0 — the
licence pages were read on 2026-11-27 (Poly Haven: "Our assets are all licensed as CC0 … You can use our assets for any
purpose, including commercial work … You do not need to give credit"; ambientCG: all assets "under the Creative Commons CC0
1.0 Universal License", commercial use and redistribution allowed); sizes are each asset's real-world size from its page
(Poly Haven `dimensions`), the size one texture repeat covers (`repeatM` in `textures.data.ts`). "Built in code" = no asset
needed: drawn from the wall's own line like the pergola or the tower's panes, wearing textures Plotline already has.

| # | Element | Of the 53 (+older) | Which of the 53 | Where it lives in Plotline | CC0 source | The path a person uses (any project) |
|---|---|---|---|---|---|---|
| 1 | **Pitched roof and its covering** (gable, hip, shed, gambrel; clay tile, slate, zinc / standing seam, shingles) | 16 (+10) | BIM4EEB Poland, Advanced Project, IfcOpenHouse ×2, Svaleveien, Longyearbyen, Vienna, Kleine Wohnung, 3DBAG Delft, Macky ×2, BC block, Loughborough ×2, farmhouse, CMHC fourplex | §5.4 roof setting per building (kind, pitch, ridge, covering = a finish option); IFC: IfcRoof kind + covering name | Clay tiles [clay_roof_tiles_02](https://polyhaven.com/a/clay_roof_tiles_02) (2.5 m, Amal Kumar); slate [roof_slates_02](https://polyhaven.com/a/roof_slates_02) (3 m, Rob Tuytel); grey tiles [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles) (3 m); standing seam / sheet [box_profile_metal_sheet](https://polyhaven.com/a/box_profile_metal_sheet) (2 m, Amal Kumar) | Studio → **Building** → *Roof*: kind, pitch, covering; the covering also a Finishes option |
| 2 | **Railings** — steel, aluminium, timber balustrades; MS grilles | 13 (+21) | Advanced Project, Gaia, Cáceres, Nordic housing, Svaleveien, Donor, Longyearbyen, Vienna, Kleine Wohnung, brick walk-up, BC block, farmhouse, Quinta Monroy | §5.2 what a low wall is made of (posts + top rail + infill, built in code); IFC: `IfcRailing` → that low wall | Built in code; brushed steel = `metal_brushed` (ambientCG Metal009, in the library), tinted for powder-coat (finish options already carry a tint); timber = `wood_veneer_light` (in the library) | Studio **W** → *Low wall* → kind *Railing*; or in the 3D view click a balcony's edge (Edit openings → low walls, which exists) → *Railing* |
| 3 | **Brick** — exposed brick, brick slips, tile-hanging | 10 (+7) | Cáceres, IfcOpenHouse ×2, LTU, Macky ×2, brick walk-up, Loughborough ×2 (and its tile-hanging), farmhouse | §5.1 outside finish (texture set); IFC: material word table (brick / Ziegel / tiili / tegel / baksteen / mursten / ladrillo) | Clean orange-red (Dhaka's exposed brick) [large_red_bricks](https://polyhaven.com/a/large_red_bricks) (2 m, Rob Tuytel) and [Bricks059](https://ambientcg.com/view?id=Bricks059) (ambientCG); weathered [red_brick_03](https://polyhaven.com/a/red_brick_03) (1 m, Rob Tuytel — asset page read: "CC0"); tile-hanging = a roof-tile set on a wall | 3D **Finishes** → click an outer wall → *Brick*; whole building: the outside default; own brick: **+ Add option → Picture** (exists) |
| 4 | **Window frames in their colour / material** | 8 (+5) | Advanced Project (white RAL 9010), Gaia (PVC anthracite), Cáceres (white aluminium), Donor, Longyearbyen, Macky ×2 (stone tracery), brick walk-up (black) | An opening's frame finish (`openings.ts` frame material; the tower's `PANE_FRAME` grey) — one building-wide choice + per opening; IFC: window material names | Built in code (a colour: powder-coated aluminium in RAL tones, uPVC white, timber = `wood_veneer_light`) | 3D **Finishes** → *Window frames* (building) / **Edit openings** → a window → *Frame* |
| 5 | **Metal cladding and metal roofs** — zinc, titanium zinc, copper, standing seam, corrugated, metal panels | 9 (+9) | Gaia (zinc), Nordic housing, Nordic office (copper), Svaleveien, Vienna (sheet metal, standing seam), Kleine Wohnung (titanzink roof, metal-panel walls), NASA VAB (white panels), Quinta Monroy (corrugated zinc), farmhouse (5V metal roof panels) | §5.1 outside finish; §5.4 roof covering | Corrugated [corrugated_iron_02](https://polyhaven.com/a/corrugated_iron_02) (2.7 m, grey); profiled sheet [box_profile_metal_sheet](https://polyhaven.com/a/box_profile_metal_sheet) (2 m, comes red: tint it); standing seam [factory_wall](https://polyhaven.com/a/factory_wall) (3 m); flat panels = `metal_brushed` with a joint grid in code | As 3, *Metal panel* / *Zinc* (a tint of one set) |
| 6 | **Balconies that stand out** — the projecting slab and its edge, curved balconies | 8 (+2) | De Basis (Isokorb), Amstelveen (36), Spaarnelicht (65), Advanced Project, Vienna, Kleine Wohnung, BC block, Newburn Flats (curved) | A drawing rule in `building.ts` for a balcony room: the floor plate a few cm past its low walls, its edge band, a drip; curved walls already exist (Studio **A**) | Built in code (the plaster / concrete sets) | Nothing new to click: every balcony a person draws gets it |
| 7 | **The roof edge** — parapet caps (coping), eaves and fascia, cornices, crenellations | 9 (+4) | Gaia (fascia), Nordic office (217 eaves flashings), Svaleveien, Vienna (Attika ×36), Macky ×2, brick walk-up (cornice), Ceco house (eaves), farmhouse (fascia, frieze) | §5.4 roof edge (coping / overhang / cornice band) and a cap on every low wall (§5.2) | Built in code; metal coping = the metal sets of 5; stone cornice = the stone sets of 9 | Studio → **Building** → *Roof edge*; a low wall's kind (§5.2) |
| 8 | **Render in its colour and texture** (ETICS, coarse or fine stucco) | 7 (+5) | BIM4EEB Finland, Advanced Project (beige textured), Gaia (crépi beige), Cáceres, Svaleveien, Vienna, BC block | §5.1 outside finish (the plaster set tinted — Plotline already has the texture; only the choice outside is missing) | `plaster_white` (Poly Haven white_stucco, in the library) tinted; coarse render [white_stucco_02](https://polyhaven.com/a/white_stucco_02) (1.8 m, Dimitrios Savva); [plastered_wall_05](https://polyhaven.com/a/plastered_wall_05) (2 m) | As 3, *Render* + a colour (the paint list's own colours) |
| 9 | **Stone** — cladding, plinth, trim, coral rag | 7 (+7) | Gaia (Petit Granit), Nordic office (Kivi), Macky ×2 (sandstone trim), brick walk-up (stone lintels), BC block (cultured stone veneer), Kua ruins (coral stone) | §5.1 outside finish; a plinth band = the finish on the ground floor's outer faces | Light stone blocks [stone_tile_wall](https://polyhaven.com/a/stone_tile_wall) (2 m, Charlotte Baglioni); dark large-format facade tiles [rectangular_facade_tiles](https://polyhaven.com/a/rectangular_facade_tiles) (2 m, Charlotte Baglioni); [sandstone_blocks_08](https://polyhaven.com/a/sandstone_blocks_08) (3 m, Rob Tuytel); [coral_stone_wall](https://polyhaven.com/a/coral_stone_wall) (2 m) | As 3, *Stone* |
| 10 | **Exposed concrete** — board-marked, precast panels, concrete block | 7 (+5) | Gaia (architectural concrete), Cáceres (precast panels), Nordic housing (concrete cladding base), Azuma (Ando), NASA HQ, Quinta Monroy (block), Miletičova (panel building) | §5.1 outside finish | Smooth fair-faced [concrete_wall_008](https://polyhaven.com/a/concrete_wall_008) (2.71 m, Dario Barresi, Charlotte Baglioni); fluted [ribbed_concrete_wall](https://polyhaven.com/a/ribbed_concrete_wall) (2 m); concrete block [concrete_block_wall](https://polyhaven.com/a/concrete_block_wall) (2 m); precast panels = smooth + a joint grid in code | As 3, *Concrete* |
| 11 | **Glass fronts with mullions** — curtain walls, shopfronts, glass bays, spandrel panels | 7 (+8) | Gaia (37), Nordic housing (glazed balconies), Nordic office (85), Donor, Vienna (Profilit channel glass), LTU, NASA HQ | The Glass wall that exists (Studio O → *Glass wall*) + a mullion spacing and a frame colour (item 4); IFC: curtain-wall members' spacing | Built in code (`GLAZING_GLASS`, the frame colours of 4) | Studio **O** → *Glass wall*, then *Mullions every …*; **Edit openings** in 3D |
| 12 | **Timber cladding** — boards, clapboard, board-and-batten, slats | 7 (+4) | BIM4EEB Finland (pine), Nordic housing (75 walls), Nordic office, Svaleveien (Rupanel), LTU (glespanel), BC block (board-and-batten), farmhouse (clapboard) | §5.1 outside finish | Vertical composite boards (the Dhaka "timber-look" panel) [synthetic_wood](https://polyhaven.com/a/synthetic_wood) (2 m, Dario Barresi, Charlotte Baglioni); warm slats [japanese_cedar_planks](https://polyhaven.com/a/japanese_cedar_planks) (1.13 m); grey boards [white_planks_clean](https://polyhaven.com/a/white_planks_clean) (1.8 m, Rob Tuytel); lap siding / clapboard [WoodSiding009](https://ambientcg.com/view?id=WoodSiding009) (ambientCG) | As 3, *Timber boards* |
| 13 | **Outside stairs, ramps, fire escapes** | 6 (+2) | Nordic office (ramps), Longyearbyen (private exterior stair), Vienna (ramp), brick walk-up (fire escape), farmhouse (porch steps), Quinta Monroy (open timber stairs) | A stair drawn on an outdoor zone (the stair lane's flights, s31) and ramps (sloped faces, exist); a fire escape = a library piece hung outside (§5.3) | Fire escape model [modular_fire_escape](https://polyhaven.com/a/modular_fire_escape) (Poly Haven, Juniix, 11 k triangles) | Studio (stair as for any floor); **Edit furniture → Add** → *Fire escape* |
| 14 | **Glass balcony fronts** — glass balustrades, glazed (winter-garden) balconies | 5 (+4) | Advanced Project (19 glass-panel balustrades), Gaia (glass balustrade + glass veranda), Vienna (glass infill on 25 railings), Kleine Wohnung (8), Nordic housing (6 glazed balconies) | §5.2 low wall kind *Glass balustrade* (toughened glass, a steel or aluminium top rail, clamps or a base channel); a glazed balcony = the Glass wall on the balcony's open side (exists) + frames (item 4) | Built in code: `GLAZING_GLASS` / `CLEAR_GLASS` (`openings.ts`) + `metal_brushed` | Studio **W** → *Low wall* → *Glass*; 3D: click the balcony's edge → *Glass*. The founder's own example |
| 15 | **Canopies, porches, porticos** | 5 (+2) | Vienna (balcony canopy), LTU (skärmtak), farmhouse (porch roof), Arlington (portico), Bolduc (galleries) | §5.3 a piece on a wall's outer face over a door (glass + steel, concrete slab, fabric); a porch roof on posts = the pergola with a solid roof (the pergola exists) | Built in code (glass, metal, plaster sets; `fabric_curtain` for fabric) | **Edit furniture → Add** → *Canopy* / *Porch roof*, then drop it on the wall above a door |
| 16 | **Fences, boundary walls, gates** | 4 (+2) | Vienna (fence), Loughborough ×2 (brick wall 1 m, timber fences), farmhouse (white picket fence) | Low walls on the ground floor (exist) with §5.2's kinds (*Timber fence*, *Chain-link*, *Railing*); a gate = a passage in a low wall (exists) | Chain-link [modular_chainlink_fence](https://polyhaven.com/a/modular_chainlink_fence), gate [large_iron_gate](https://polyhaven.com/a/large_iron_gate) (Poly Haven); timber = `deck_boards` / `wood_veneer_light` | Studio **W** → *Low wall* on the ground level → kind |
| 17 | **Louvres, sunshades, awnings, shutters** (and the chhajja over a Dhaka window) | 3 (+1) | Gaia (slat curtain wall), Cáceres (4 fabric awnings), Nordic office (SW shading system, source page) | §5.3 pieces on a wall's outer face above or over a window (horizontal sunshade, vertical fins, louvre screen, awning); a fin = a free-standing wall (`standsAlone`, exists) with an outside finish | Built in code (metal, timber, concrete sets; `fabric_curtain` for awnings); perforated metal screens [SheetMetal001](https://ambientcg.com/view?id=SheetMetal001) / [SheetMetal004](https://ambientcg.com/view?id=SheetMetal004) (ambientCG, perforated sheet); shutters [rollershutter_window_01](https://polyhaven.com/a/rollershutter_window_01) (Poly Haven) | **Edit furniture → Add** → *Sunshade* / *Louvres* / *Awning*, dropped over a window |
| 18 | **Solar panels** | 3 (+2) | Advanced Project (23), Nordic housing, Vienna (4 collectors) | §5.3 a piece on the roof deck | Built in code (dark glass cells, aluminium frame) | **Edit furniture → Add** → *Solar panel* on the roof (rooftop level) |
| 19 | **Green and gravel roofs** | 3 (+3) | Cáceres (gravel), Nordic office (grass), Vienna (gravel) | §5.4: rooftop zone finishes — `turf` exists; gravel a new set (outdoor zones have no finish choice today) | [gravel_floor](https://polyhaven.com/a/gravel_floor) (2.25 m, Jenelle van Heerden); [gravel_stones](https://polyhaven.com/a/gravel_stones) (2 m) | Studio rooftop level: a *Lawn* zone (exists) or *Gravel*; 3D **Finishes** → the zone |
| 20 | **Roof windows, skylights** | 3 (+2) | Nordic housing, Vienna (Dachfenster), LTU | An opening in a roof (roofs have none today) | Built in code (the window's own glass and frame) | Studio rooftop / Building → *Roof* → *Add roof window* |
| 21 | **Fibre-cement and composite panels** | 2 (+1) | Gaia ("Eternit"), Cáceres (Viroc) | §5.1 outside finish with a panel-joint grid | Corrugated fibre-cement [asbestos_sheet_02](https://polyhaven.com/a/asbestos_sheet_02) (1.8 m, Amal Kumar); flat panels = smooth concrete or render + a joint grid in code | As 3, *Panels* |
| 22 | **Chimney** | 1 (+1) | farmhouse (masonry chimney) | §5.3 a roof piece | Built in code + `red_brick_03` | **Edit furniture → Add** → *Chimney* |

Not in the 53 but on the Dhaka covers (§2e): **planters and climbing green on balcony edges** (about 7 of 12 — Plotline has planter zones and plants, not a planter box on a balcony's edge; Poly Haven [planter_box_01](https://polyhaven.com/a/planter_box_01) is CC0), **perforated metal and jaali screens** (item 17), **boundary walls with timber-slat gates** at the street (item 16), and roof gardens with trees and pergolas (the pergola and trees exist; a rooftop level is drawn with them today).

---

## 4. What the IFC reader drops that the outside needs

What `src/import/ifc.ts` does with each kind of thing, counted over the 21 sample IFCs and the 22 older test buildings
(27 files; `runs/classes.tsv`). "Shape only" = its triangles go into the outside shape **in their flat colour**, nothing
else of it is read: not its kind, not its material, not its type name. Everything in this table is in the shape unless it
says otherwise.

| IFC element | in the 21 samples (files) | in the older 27 files (files) | read as | what the outside loses |
|---|---|---|---|---|
| IfcWall / IfcWallStandardCase | 6 657 (20) | 14 393 (26) | walls (the plan) + shape | its material layers (brick, render, timber boards…) and `IsExternal`; a gable wall becomes a flat-topped box up to its peak (IfcOpenHouse) |
| IfcCurtainWall | 137 (6) | 158 (8) | a glass wall per straight run (a full-height window) + shape | its mullion spacing, frame colour, opaque panels; a curtain wall of slats (Gaia "CHEK_Lames") becomes glass |
| IfcWindow / IfcDoor | 2 301 / 1 559 (18 / 16) | 2 890 / 2 697 (21 / 21) | openings + shape (windows flagged) | frame material and colour (Gaia "PVC anthracite", Advanced Project "RAL 9010"), sill and lintel pieces |
| IfcColumn | 1 403 (12) | 1 410 (17) | columns (the plan) + shape | — (wider than 1.5 m both ways: left out) |
| IfcSlab | 1 498 (20) | 2 158 (25) | shape only | that it is a **roof** (938 slabs `ROOF`), a **balcony** (Amsterdam's 65 "balkon" slabs, De Basis's Isokorb thermal breaks) or a landing; its covering |
| IfcRoof | 94 (16) | 195 (14) | shape only | its kind — GABLE 4, SHED 1, GAMBREL 1, FREEFORM 155, FLAT 8 — and its covering (tiles, titanium zinc, standing seam) |
| IfcRailing | 97 (10) | 2 746 (22) | shape only | that it is a railing at all, its kind (BALUSTRADE 1 858, GUARDRAIL 21, HANDRAIL 22) and infill: "Glass Panel - Bottom Fill", "Glaselement - Füllung unten", "Glas - Ohne Pfosten" (glass balustrades in 7 files) |
| IfcPlate | 281 (6) | 1 165 (8) | shape only | CURTAIN_PANEL 1 243: glass or opaque panel |
| IfcMember | 1 411 (7) | 2 875 (15) | shape only | MULLION 3 435: the mullion grid |
| IfcCovering | 122 (5) | 5 769 (11) | shape only | CLADDING 4, MOLDING 3, the fascia board (Gaia "Planche de rive"), Sixty5's 3 846 coverings (406 of them marked outer) |
| IfcBuildingElementProxy | 10 332 (11) | 1 839 (18) | shape only | whatever it is: 217 eaves flashings (Nordic office "Räystäspelti"), 23 solar panels (Advanced Project), 4 fabric awnings (Cáceres "Toldo"), the Azuma house's walls |
| IfcBuildingElementPart | 2 719 (4) | 654 (2) | shape only | Vienna's facade layers: 448 "BEKLEIDUNG" (cladding), 264 "Blech" (sheet metal), 143 render, 91 Profilit channel glass, 52 fence parts |
| IfcBeam / IfcFooting / IfcPile | 300 / 179 / 0 | 2 596 / 282 / 146 | shape only | — (structure; a footing far below can lift or float the building, see Nordic housing) |
| IfcStair / IfcStairFlight / IfcRamp | 98 / 35 / 8 | 799 / 109 / 4 | shape only | that a stair or ramp is outside (Longyearbyen "Private Exterior", the Nordic office's "ulkoluiska") |
| IfcShadingDevice | 0 | 0 | — | (no file uses it: louvres come as curtain walls, proxies or coverings) |
| IfcSolarDevice | 5 (2) | 0 | shape only | that it is a solar panel |
| IfcChimney / IfcGeographicElement | 0 | 2 / 4 | shape only | — |
| IfcFurnishingElement, IfcFurniture, IfcSystemFurnitureElement | 781 (7) | 1 938 (17) | **left out** (the Studio furnishes) | — |
| IfcSpace / IfcOpeningElement / IfcAnnotation / IfcGrid | — | — | names / voids, not in the shape | — |

What is dropped that is not a shape:

- **Every material name.** 429 named materials in the 21 samples, 743 in the older files; the reader looks at a material
  only for its layer thicknesses (`layerThickness`). Those names are the facade: "Puuverhous" (timber cladding, 75 outer
  walls), "SIA_PA_Crépi beige, texturé", "Stukko - valkoinen hieno", "Dach - Titanzink", "Metall - Paneel, verzinkt",
  "Mursten - Beklædning Grå", "Finishes - Exterior - Timber Cladding".
- **`IsExternal`** (Pset_WallCommon …): set on 8 581 elements in 16 of the 21 samples (and 9 084 in 20 of the 27 older
  files). It says which walls are the facade — the walls a facade finish belongs on.
- **PredefinedType and type names** (above): railing, roof, covering, slab and plate kinds.
- **Surface style names** (500 named styles in the samples) — the colour is kept, the name ("Glass", "Brick", "RAL 7016")
  is not.
- **Textures: none to drop.** Not one of the 48 files has an `IfcImageTexture`, `IfcBlobTexture` or `IfcPixelTexture`. An
  IFC will never bring a brick picture by itself: the picture has to come from Plotline's own library, chosen by the
  material's name.
- **The shape's size limit**: 1.5 million triangles; the Advanced Project (1 500 000) and the LTU house (1 499 994) hit it
  and lose the rest.
- **The ground**: the lowest storey is taken as the street; an empty "Sea_Level" storey 47 m under the building lifts the
  whole Nordic housing block 47 m into the air.

A 3D model keeps all of its own materials and pictures (Macky Auditorium's 20 photo textures, the brick walk-up's atlas);
dropped as a `.kmz` the pictures are lost (`SAMPLES.md`, class *kmz-pictures*).

---

## 5. Where each element would live — the common thread

Five places carry all of §3, and each is keyed by a wall, an opening, a room kind or a library piece — never by a unit,
project or room name — so whatever a build lane adds works on every project, traced or imported (CLAUDE.md "Levels are
data, the look is rules"; nothing in `src/three` / `src/furnish` may name a unit):

1. **An outside finish on a wall's outer face** (items 1, 5, 7 of §3 and the colour of a railing or a glass front). Today
   `finishes.ts` keys a wall face by the room it faces (`wall:<wallId>:<roomId>`); an outer face faces no room. One more
   key for "the outside of this wall" (and a building-wide default for all outer faces, so one click dresses the tower),
   resolved in `building.ts` where it now always uses `EXTERIOR_PLASTER`. The options are ordinary finish options
   (`{brand, sku, label, priceDeltaBdt, material}`, invariant 5) over new texture sets in `textures.data.ts`, so a
   developer's own brick is **Finishes → + Add option → Picture**, the path that already exists for floors and walls.
   Product path: 3D view → **Finishes** → click an outer wall from the Building view or a balcony → pick; Studio: select
   walls → their outside finish. Buyers keep seeing only what staff offer.
2. **What a low wall is made of** (railings, glass balcony fronts, fences, parapet caps). Every wall under 1.2 m is today a
   plaster box (`details.ts` / `building.ts`); the W tool already has *Low wall* and the 3D view already edits low walls
   (MANUAL §3 "Edit openings … low walls"). A low wall's kind — solid parapet / metal railing / glass balustrade / timber
   balustrade / steel grille — drawn by code (posts, rails, glass panes) from the wall's own line and height, the way the
   pergola is built (`procedural.ts`). Product path: Studio W → *Low wall* → its kind; or click a balcony's edge in the 3D
   view → *Railing: Glass*. The IFC reader would set it from `IfcRailing` (type name / material "Glass").
3. **Library pieces that hang on the outside** (canopies, sunshades / chhajja, louvres, awnings, AC outdoor units, a fire
   escape, solar panels, a chimney, planter boxes). The kit already mounts pieces on walls (`mountY`, TV / AC / mirror),
   but always on a room's side. A piece placed on a wall's outer face (or on a roof deck — solar) with the same rules
   (1 ft grid, wall snap, no overlap) is **Edit furniture → Add** / Studio **F** as today. Poly Haven has CC0 models for
   some (exterior_aircon_unit, modular_fire_escape, modular_metal_gutter, rollershutter_window_01, planter_box_01); the rest
   are code-built like the pergola.
4. **The roof and the roof edge** (items 2, 7, green / gravel roof, roof windows). A building-level roof setting — flat with
   parapet (today), gable, hip, shed, mansard; pitch; ridge direction; covering (a finish option); eaves overhang or parapet
   cap — drawn by `building.ts` instead of the flat plate + 1.1 m parapet; a traced rooftop level keeps its own walls. Gravel
   and sedum are zone finishes (outdoor zones have none today: MANUAL §11 "No finish choices exist for outdoor areas").
   Product path: Studio → **Building** (the project's floor list) → *Roof*.
5. **The IFC mapping** (§4). Read what the file already says instead of dropping it: material and layer names (and
   `IsExternal`) → the outside finish of item 1 by a word table (brick / Ziegel / tiili / baksteen → brick; render / Putz /
   crépi / stukko → render; …); `IfcRailing` → the low wall of item 2; IfcRoof kind → item 4; `IfcSolarDevice` and named
   proxies → item 3; curtain-wall members → the glass wall's mullion spacing. The outside shape could then carry Plotline's
   textures by material name (today: one flat colour per triangle group).

---

## 6. How it was measured (to run again)

Everything under `E:/dev/tmp/s31/outside/` (scripts in `scripts/`, results in `runs/`). Node 24, web-ifc 0.0.79 and
pdf.js from the main checkout's `node_modules`, Playwright's Firefox (`PLAYWRIGHT_BROWSERS_PATH=E:/dev/tools/ms-playwright`),
one browser at a time, the worktree's own Vite on port 5236 (`hmr: false`, `watch: null`, private cache dir).

| Script | What it does | Out |
|---|---|---|
| `ifc-census.mjs <file> <out>` (run over all 48 by `run-census.sh`) | web-ifc, the reader's own pattern: every entity type counted; per product class its PredefinedType, names, type names, materials (through `IfcRelAssociatesMaterial` on the element or its type: layers, constituents, profiles, lists), `IsExternal`, and the flat colours the shape draws (web-ifc mesh colours, by triangles); every IfcMaterial and IfcSurfaceStyle; textures | `runs/ifc/*.json` (sixty5's 342 MB without the colours) |
| `ifc-words.mjs <file> <out>` | every product's name / object type / type name searched for outside words in 11 languages (louvre, canopy, balcony, glazed balcony, railing, parapet, cladding, roof, green roof, fence, column, outside stair, chimney, solar) | `runs/words/*.json` |
| `matrix.mjs` | per IFC, the elements its data shows, with the evidence | `runs/matrix.json`, `runs/matrix.txt` |
| `tables.mjs` | the generated tables | `runs/tables.md` → [TABLES.md](TABLES.md) |
| `model-census.mjs` | 3D models: a GLB's materials and pictures (written out to look at), an OBJ's MTL, a DAE's materials and images, a KMZ's files | `runs/models.json`, `runs/model-pics/` |
| `sheet-census.mjs` | DXF layers, hatch patterns, blocks and texts naming a material; PDF pages that are elevations / sections and their material words (pdf.js); SVG texts — including the Loughborough zip's elevations | `runs/sheets.json` |
| `outside.mjs` | Firefox, the founder's path: drop on `/studio` → Show building → the Building view, three shots each; Plotline's own Type A and Sheltech A for comparison | `runs/shots.json`, `E:/dev/plotline-shots/s31/outside/*.png` |
| `close.mjs` | the same path, then the camera moved round the outside shape (two sides at 20°, one at street height); the sample PDFs' elevation pages drawn to pictures; the CC0 candidates' thumbnails | `…/outside/close/`, `…/outside/sheets/` |
| `probe.mjs <name>` | the same path for one model, then what the page holds of its outside shape (visible, opacity, clipping) | printed |
| `the53.mjs` | the ranked list's counts over the 53 | `runs/the53.json` |
| `sheets-html.mjs`, `contact.mjs` | contact sheets of the shots, of 16 Dhaka brochure covers and of their first render pages | `…/outside/contact-*.png`, `dhaka-*.png` |

Source pages: the 37 pages `Docs/SAMPLES.md` names were read once each (a generic client name, nothing about Plotline sent);
the two pictures they show were saved to look at. CC0 pages read: the Poly Haven licence page and asset list
(api.polyhaven.com), the ambientCG licence page and asset search, and the asset pages named in §3.
