# Plotline — where everything comes from

Every outside thing Plotline uses, in one place: what it is, what we use it for, where it comes from, its licence and
cost, the limits that matter, and whether it stays. The licence and limit pages of Open-Meteo, OpenStreetMap, Overpass,
Vercel and Supabase were read on 2026-10-19, CloudConvert's on 2026-11-20; the counts and versions were checked against
the code on 2026-11-21. They can change.

**Money: today Plotline pays for nothing.** Several free tiers are free only for non-commercial use; those must change
when the first developer pays and are marked **TEMPORARY** with the reason.

**The site reaches only what is listed here.** The live site tells every browser which outside addresses it may load
from or send to (the Content-Security-Policy in `vercel.json`, explained in ARCHITECTURE.md "Security"); anything else is
refused. **A new outside service needs a line in `vercel.json`, a row here and a line in ARCHITECTURE.md "Security", in
the same commit** — or browsers will refuse it on the live site while it still works on `npm run dev`. `npm run preview`
serves the same rules, so check a new service there.

| What a page may do | Allowed addresses (besides the site itself) | For |
|---|---|---|
| Run code | `cdn.jsdelivr.net`; WebAssembly; on `/studio` only also `eval` | Auto-trace's reading engine (§5); IFC and Rhino readers; rhino3dm needs `eval` |
| Load styles · fonts | `fonts.googleapis.com` · `fonts.gstatic.com` | The two fonts (§2) |
| Show pictures | any `https:` address, `data:`, `blob:` | Map tiles (§4), plan and library pictures from Supabase (§8) |
| Send or fetch data | `*.supabase.co`, `overpass-api.de`, `api.openstreetmap.org`, `nominatim.openstreetmap.org`, `archive-api.open-meteo.com`, `generativelanguage.googleapis.com`, `cdn.jsdelivr.net`, `localhost:11434` / `127.0.0.1:11434` | The database (§8), the map round the plot and the wind (§4), the optional AI helpers (§6), Auto-trace's reading data (§5) |
| Not in the list, on purpose | CloudConvert | Called only by the site's own server function (`api/dwg.js`), never by a page |

## The short answer

| Question | Where it comes from | Costs | Stays? |
|---|---|---|---|
| The furniture library (154 pieces) | 33 scanned 3D models from **Poly Haven** + 121 pieces built in our own code, wearing textures from **Poly Haven** and **ambientCG** | free (CC0, no credit needed) | permanent |
| The letters | **Instrument Sans** and **Instrument Serif** from **Google Fonts** | free (SIL Open Font License) | permanent |
| The sunlight | **No outside service**: a published formula (NOAA's) in our own code | free | permanent |
| The wind | **Open-Meteo**'s weather archive, once per building site; a built-in **Dhaka table** (Open-Meteo 2015–2024) with no site | free, non-commercial only | **TEMPORARY** — a paid plan or our own copy of the data once Plotline earns money |
| Address → map spot | **Nominatim** (OpenStreetMap's address search) | free, 1 request a second | **TEMPORARY** for many users |
| The map picture | **OpenStreetMap** map tiles | free, best effort | **TEMPORARY** for many users |
| Buildings and roads round the plot | **Overpass API** (OpenStreetMap data); when it fails, OpenStreetMap's own editing server | free | the fallback is **TEMPORARY** (§4) |
| Reading the plan's words | **tesseract.js**, its files from **jsDelivr** | free (Apache-2.0) | permanent |
| The Studio's sample buildings (**Try a sample ▾**) | 8 real buildings' files from open research data, gov.uk, Wikimedia Commons, IfcOpenShell and Poly by Google, kept in our own site (§9) | free (CC0, CC BY, Open Government Licence, one CC BY-SA; credits in `public/samples/MANIFEST.md`) | permanent |
| Hosting · database | **Vercel** Hobby · **Supabase** Free | free | **TEMPORARY** at the first paying customer |
| AutoCAD's DWG files | **CloudConvert** free plan, off until set up | free, 10 a day | optional |

---

## 1. Furniture, materials and light (the 3D look)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **39 scanned 3D models** (sofas, chairs, tables, lamps, a ceiling fan, a clock, plants, a bench, a bistro set, a covered car…) | 33 are pieces in the library; 4 plants sit in pots built in code; 2 give the leaves and bark of the code-built trees and shrubs | Poly Haven — https://polyhaven.com (each model's page in `public/assets/MANIFEST.md`) | **CC0** (public domain): free for anything, no credit required; we list the authors anyway | permanent |
| **121 code-built pieces** (beds, wardrobes, kitchens, bathroom fittings, TVs, rugs, curtains, frames, AC units, pots and planters, trees, shrubs, loungers, pergola, gym and play pieces…) | The rest of the library — Poly Haven has no modern bed, bathroom, kitchen, gym or play equipment | Our own code (`src/furnish/procedural.ts`) | ours | permanent |
| **The library** (Edit furniture → Add in the 3D view; Add a piece with F in the Studio) | 154 pieces in 11 groups (Living, Dining, Bedroom, Office, Kitchen, Bath, Lights & AC, Greenery, Outdoor, Lobby & gym, Decor) | both of the above | free | permanent |
| **21 texture sets** (wood floors, marble, tiles, plaster, fabrics, rug, metal, turf, paving, asphalt, concrete, deck boards, gym rubber, soil) | What floors, walls, furniture and outdoor areas are made of | 10 from Poly Haven, 11 from ambientCG — https://ambientcg.com | **CC0** | permanent |
| **6 roof texture sets** (clay tiles, slate, timber shingles, zinc standing seam, corrugated metal, gravel) | What a building's roof is covered with (Studio → Building → Roof; the 3D view's Finishes → the roof) | Poly Haven (clay_roof_tiles_02, grey_roof_01, roof_slates_02, box_profile_metal_sheet, corrugated_iron_02, gravel_floor_02; licence read on each page 2026-11-27), re-encoded small (2.4 MB together) | **CC0** | permanent |
| **2 sky / light pictures (HDRIs)**: a small photo studio (`interior.hdr`), a clear sky (`sky.hdr`) | The soft light inside the rooms; the sky through windows and from the Dollhouse | Poly Haven (studio_small_09, kloofendal_43d_clear_puresky) | **CC0** | permanent |
| **2 wall pictures** (sea, dawn) | The framed art on the walls | Cropped from two Poly Haven sky photos (umhlanga_sunrise, kiara_1_dawn) | **CC0** | permanent |
| **Your staff's own models, finishes and textures** | Their pieces and options in the library and Finishes | Whatever they drop in (MANUAL §3) | the developer's own responsibility | — |

All of it is in `public/assets/` (about 95 MB: models 65 MB, textures 26 MB, sky 2.7 MB, art 1.4 MB), listed one by one
with author and the date the licence was checked in `public/assets/MANIFEST.md`. A room loads only the pieces it uses;
Lite loads the pictures at half size and leaves the scanned potted plants out.

**Later (planned, not built):** brand libraries — real furniture and finish brands' own models and price lists (the
masterplan's marketplace).

## 2. Letters (fonts) and the site's own pictures

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Instrument Sans** (interface) and **Instrument Serif** (titles) | All the text on every page: the sans for buttons and labels, the serif for titles and the room's name | Google Fonts — the style from `fonts.googleapis.com`, the font files from `fonts.gstatic.com`, each time a page opens (`index.html`) | SIL Open Font License, free | permanent. Could be copied into the site so pages stop asking Google (optional) |
| The computer's own fonts | Only as a fallback while the fonts load or when Google is blocked | nothing downloaded | — | permanent |
| **The front page's six pictures, the share card, the icons** (`public/landing/*.jpg`, `og.jpg`, `favicon.svg`, `icon-512.png`, `apple-touch-icon.png`) | The front page, the card a pasted link shows, the browser tab and home-screen icon | Taken from Plotline's own 3D view and drawn by us | ours | permanent |

## 3. Sunlight

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Sun position formula** (NOAA's solar position equations, low-precision, well under 1° off) | Where the sun stands at the site on the chosen day and hour, turned by the plan's true north | Our own code (`src/core/site.ts`, `sunPosition` / `sunAt`) — no internet | a published formula, free | permanent |
| **The site's clock** | So "15:00" is the site's own 15:00 | Open-Meteo's time-zone answer, saved with the site; else worked out from the longitude (Dhaka = UTC+6) | free | permanent |

No site set in the Studio: the sun of Dhaka.

## 4. Wind, location and the map round the building

Fetched **once**, in the Studio (⋯ → Site → click the plot), and saved inside the drawing. Preview 3D, the Building view
and buyer links never ask these services again — they work offline.

| What | Used for | From | Licence / cost / limits | Status |
|---|---|---|---|---|
| **Open-Meteo Historical Weather API** | The wind by month (daily mean speed and main direction at 10 m), temperature and humidity over the ten full years before the fetch; the site's clock | https://archive-api.open-meteo.com — no key, no account; the numbers are ERA5 reanalysis (the European weather centre's, through Open-Meteo) | Data **CC BY 4.0** (credit: we show "Open-Meteo" on the wind card and in the Site panel). **The free API is for non-commercial use only.** 600 calls a minute, 5,000 an hour, 10,000 a day (we use one per site). Paid plans from "API Standard" (open-meteo.com/en/pricing) | **TEMPORARY**: a paid Open-Meteo plan, or the same ERA5 data from Copernicus ourselves (free, needs an account), when Plotline earns money |
| **The Dhaka wind table** (`DHAKA_WIND`) | The wind with no site set, and offline | Open-Meteo 2015–2024 at 23.79 N, 90.40 E, fetched 2026-10-18, written into our code | as above | permanent as the fallback |
| **Nominatim** | Address → map position (Site → **Find**); pasting "23.7903, 90.4077" needs no call | https://nominatim.openstreetmap.org — no key | Free: at most **1 request a second**, never search-as-you-type, the page address sent (it is), data © OpenStreetMap contributors (ODbL) | **TEMPORARY**: fine for staff typing an address now and then; many customers → our own Nominatim or a paid search |
| **OpenStreetMap map tiles** | The small map picture in the Site panel (9 tiles at zoom 18 per opening) | https://tile.openstreetmap.org — no key | Free, **best effort, no guarantee**: may be blocked at any time; credit under the map ("© OpenStreetMap contributors") | **TEMPORARY**: a map-tile company (free tiers exist) when there are customers |
| **Overpass API** | The buildings (outline, height or floors) and roads within 250 m of the plot | https://overpass-api.de — no key, 20-second wait | Free; about 10,000 questions and 1 GB a day per user; refuses when busy (429 / 504). From this PC it refused or timed out most of the night of 2026-10-18 — every site so far came from the fallback | permanent for now; a second Overpass server as the next try |
| **OpenStreetMap's own map server** (the fallback) | The same buildings and roads (one 500 m box) when Overpass fails | https://api.openstreetmap.org/api/0.6/map.json | **Against its rules**: the API policy says it is "to edit the map data, not for read-only purposes". A stop-gap; it can be blocked without warning | **TEMPORARY — MUST BE REPLACED** (the code says so, `studio/SitePanel.tsx`): a second Overpass mirror, or Geofabrik's free Bangladesh extract served from our own files |
| **OpenStreetMap data** (the blocks and roads themselves) | The neighbour blocks and roads in the 3D and their shadows | © OpenStreetMap contributors | **ODbL**: free, credit where shown. The Site map shows it under the map; the 3D view shows "© OpenStreetMap contributors" bottom right, linked to their copyright page, whenever a site's blocks or roads are drawn | done |
| Building heights | How tall each neighbour stands | The map's own height, else floors × 3 m, else **a guess of 9 m** (most Dhaka buildings have neither: Banani 396 of 407) | — | staff type the heights they know |
| The made-up street (no site set) | Neighbours 2–4 m away and a 6–9 m road, like a real Dhaka street | Our own code | ours | permanent |
| **Google Maps** · **Windy API** | **Not used.** Google needs a billing card even for its free credit; Open-Meteo gave the same monthly wind as Windy for free | — | — | Google only if the founder adds a card |

What the wind is and is not: real monthly averages from weather records, NOT gusts and NOT the street-level wind between
buildings. The lines are a guide, not a wind simulation.

## 5. Reading the plan (Auto-trace)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **tesseract.js 7.0.0** (with tesseract.js-core 7.0.0) | Reads the printed words and sizes on the plan, inside the browser | npm; its worker and engine files and the English reading data (`eng.traineddata`, 4.0.0_best_int, about 2.9 MB) are **downloaded from cdn.jsdelivr.net the first time Auto-trace runs**, then kept in the browser | Apache-2.0, free; jsDelivr is a free public file server | permanent. Could copy the files into the site so Auto-trace stops depending on jsDelivr (optional) |
| Everything else in Auto-trace (walls, doors, rooms, flats, sizes) | — | Our own code (`src/trace/`) | ours | permanent |

## 6. AI helpers (both optional, both off unless set up)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Ollama 0.40.6** (the program that runs a model) | **Ask AI** / **Ask AI for all** in Check these | The GitHub release zip, unpacked to `E:\dev\tools\ollama` (nothing installed, nothing on C:); started with `start-ollama.cmd` (it sets `OLLAMA_MODELS` on E:, `OLLAMA_ORIGINS=*` so the page may call it, `OLLAMA_NO_CLOUD=1`); answers at `http://localhost:11434` | Open source (MIT), free. Its paid cloud models are off, and the Studio refuses "-cloud" models and servers that are not this PC | **TEMPORARY** |
| **qwen2.5vl:7b** (Qwen2.5-VL 7B, the Qwen team at Alibaba) | The model Ollama runs; sees the piece of the sheet round a row | Pulled by Ollama into `E:\dev\tools\ollama\models` (6 GB); runs on this PC's RTX 3050 (8 GB) — only on this PC | Apache-2.0, free | **TEMPORARY: measured too weak on plans** — right 8 times, wrong 14 on rows that change the plan (it does not see door swings), so Ask AI for all skips those. **Planned:** a frontier vision model through a paid API (cents per sheet) when there is a key and a budget |
| **qwen3-vl:8b** | Nothing — tried and dropped (12–100 s an answer, not better) | `E:\dev\tools\ollama\models` (6.1 GB) | Apache-2.0 | unused; can be deleted to free 6 GB |
| **Google Gemini** (`gemini-2.5-flash`), the **AI helper (optional)** box | Re-reads room names and sizes the built-in reader could not read | https://generativelanguage.googleapis.com, with a key typed into the Studio (free keys at https://aistudio.google.com/apikey); no key in the code, nothing sent without one | Free tier with daily limits. Google's free-tier terms let it use what is sent to improve its products — a customer's sheet would go to Google | optional; likely replaced by the same paid vision API |

## 7. The 3D engine and the libraries in the code

All open source and free. Versions from `package.json`.

| Library | Version | Licence | Used for | In the live site? |
|---|---|---|---|---|
| **three.js** | 0.186.1 | MIT | The whole 3D view (drawing, light and shadows, models, walking, Dollhouse, VR), and its loaders and exporter for the architect's files (glTF, OBJ + MTL, FBX, Collada, STL, PLY, 3DS, KMZ, VRML, Rhino, TIFF; the .glb export) | yes |
| **web-ifc** | 0.0.79 | MPL-2.0 (That Open Company) | Reading an IFC building in the Studio (`src/import/ifc.ts`, in a background worker); its engine (`web-ifc.wasm`, 1.7 MB) and code (3.5 MB) load only when an .ifc is dropped | yes (Studio, on demand) |
| **dxf-parser** | 1.1.2 | MIT | Reading a DXF (`src/import/dxf.ts`), also a converted DWG | yes (Studio, on demand) |
| **pdfjs-dist** (pdf.js, Mozilla) | 6.5.438 | Apache-2.0 | Reading a PDF's pages (`src/import/pdf.ts`): the page picker, a page's own lines and texts, or the page as a picture; its worker (1.3 MB) loads only when a .pdf is dropped | yes (Studio, on demand) |
| **rhino3dm** | 8.35.0 | MIT | Reading a Rhino .3dm. Its `rhino3dm.js` + `rhino3dm.wasm` are COPIED from the package into `public/rhino3dm/` (three's 3DMLoader fetches both by name from one folder) — copy again after a version bump | yes (Studio, on demand) |
| **Small readers inside three.js** (no package of their own): **fflate** 0.8 (MIT, unzipping `.zip`, `.ifczip`, `.kmz`), the **Draco** decoder (Apache-2.0, Google), the **meshoptimizer** decoder (MIT), **chevrotain** 9 (Apache-2.0, under the VRML reader), **UTIF** (MIT, under the TIFF reader) | as three.js | MIT / Apache-2.0 | A folder or zip dropped as one, compressed models, VRML / KMZ / 3DS / PLY models, TIFF scans (`src/import/bundle.ts`, `mesh.ts`, `picture.ts`) | yes (Studio, on demand) |
| **React** + **react-dom** | 19.3.0 | MIT | The screens and buttons | yes |
| **supabase-js** (`@supabase/supabase-js`, with auth-js, postgrest-js, realtime-js, storage-js, functions-js, phoenix, iceberg-js, tslib) | 2.119 | MIT (tslib 0BSD) | The one connection to the database (§8): signing in, saving, buyer links, the change list, pictures and the own library | yes (56 kB compressed, fetched only by the first call that needs it: a share link, signing in, a save online, the own library online; a walk by someone never signed in on that browser never loads it) |
| **tesseract.js** | 7.0.0 | Apache-2.0 | Reading the plan (§5) | yes (Studio, when Auto-trace starts) |
| **Vite** + @vitejs/plugin-react | 8.3.1 / 6.1.1 | MIT | Builds the site; the local dev server | no |
| **TypeScript** | 7.0.2 | Apache-2.0 | Checks the code (`npm run typecheck`) | no |
| **Vitest** | 5.0.1 | MIT | The automatic tests (`npm test`) | no |
| **Playwright** + its Firefox | 1.63.0 | Apache-2.0 (Firefox: MPL-2.0) | Browser tests "as the founder", always in Firefox, kept at `E:\dev\tools\ms-playwright` | no |
| **iwer** (Meta's VR headset stand-in) | 2.5.0 | MIT | Testing VR without a headset (`?xr=emulate`, dev server only) | no |
| @types/node, @types/react, @types/react-dom, @types/three | — | MIT | Type information for TypeScript | no |
| **Node.js** | 24 on this PC (22 or newer needed) | MIT | Runs the tools above | no |

## 8. Hosting, database and putting it live

| What | Used for | From | Licence / cost / limits | Status |
|---|---|---|---|---|
| **Vercel — Hobby (free) plan** | The live site https://plotline-flax.vercel.app (project "plotline") and its one server function (`api/dwg.js`) | https://vercel.com | Free: 100 GB of data sent and 1 million requests a month; over a limit that feature stops until 30 days have passed. A first visit downloads the models and pictures its rooms need (tens of MB), so 100 GB is roughly a few thousand first visits a month. **Hobby is for personal, non-commercial use only** | **TEMPORARY**: Vercel Pro ($20 a month per seat) or another host when the first developer pays |
| **Putting it live** | Sends the current code to the live site | `npx vercel --prod --yes` in `E:\dev\Plotline`. Pushing to GitHub does not put the live site up | free | the founder deploys |
| **Supabase — Free plan** | Buyer links (`units`, `share_links`), the change list (`events`), staff accounts (`orgs`, `org_members`, `org_invites`), the Studio's projects with every save (`projects`, `project_versions`), plan pictures (bucket `plans`, private, 10 MB each), the staff's own library (`library_items`, bucket `library`: models up to 30 MB, pictures up to 4 MB, readable by exact name for buyer links), the old staff key until turned off — [SETUP_ACCOUNTS.md](SETUP_ACCOUNTS.md) | https://supabase.com — project `qhrtjfwjyctvlcgxmvyi` (the other project the connector shows, `txbt…`, is another app's: never touch it). The browser gets the publishable key only (Vercel `SUPABASE_URL` / `SUPABASE_KEY`); the build refuses a secret key | Free: 500 MB database, 5 GB data out a month, **1 GB files** (plan pictures at 0.1–3 MB a sheet and the own library's models share it; SETUP_ACCOUNTS shows how full it is), 50,000 monthly users, 2 active projects. **Pauses after 7 days with no activity** — buyer links stop until someone presses Restore in the Supabase dashboard. Pro from $25 a month | permanent; **TEMPORARY** Free → Pro when buyer links must never pause |
| **Supabase Auth — sign-in emails** | The "Check your email" link staff sign in with | Supabase's own email service | Free, but **only to the people in the Supabase team, a couple an hour**, one link a minute per address. Staff of a developer need a free email sender plugged in (custom SMTP, e.g. Brevo or Resend free plans) — SETUP_ACCOUNTS.md Step 5 | **TEMPORARY** until Step 5 is done |
| **CloudConvert — free plan** (optional, off until set up) | Turning a dropped AutoCAD `.dwg` into a DXF (`api/dwg.js` on Vercel; `src/import/dwg.ts`). Why online: DWG's only free reader, LibreDWG (also as `@mlightcad/libredwg-web` and the dwg2dxf builds), is GPL-3.0 and cannot go in the page | https://cloudconvert.com, synchronous API v2 (`import/base64` → `convert` dwg→dxf → `export/url`). Key `CLOUDCONVERT_API_KEY` on Vercel only; the page knows only `VITE_DWG_CONVERT_URL=/api/dwg` — [SETUP_FORMATS.md](SETUP_FORMATS.md) | Free: 10 conversions a day, no card (checked 2026-11-20). The file leaves the browser for CloudConvert (Germany; deleted after 24 h) — a customer who must not, uses "Save as DXF". Not used: Aspose.CAD Cloud (company sign-up), Autodesk APS (no DXF out), ODA (members only) | **TEMPORARY / optional** |
| What is **not** in the database yet | Notes on ordinary (non-buyer) links; plan pictures and furniture of people not signed in (they stay in their browser until they sign in) | — | — | Phase B |
| **GitHub** | Keeps the code and its history: github.com/zaysiallabib/Plotline | https://github.com | free | permanent |

## 9. The plan sheets we test with (`Demo drawings/`)

| What | Used for | From | Rights | Status |
|---|---|---|---|---|
| **114 project folders** of Bangladeshi developers' plan sheets — bti, Sheltech, Assure, Mir, Ena, Akter, Rangs, Moonstone, Finlay, CPDL, Uttaradhikar, Dominant, Eastern Housing, Assort, Crystal, Accept, Arkam, Foysal, Nessa, Prime Asset, Renown and others (Dhaka and Chattogram) | Testing Auto-trace "as the founder" (the 30-sheet and 110-sheet scoreboards) | Collected 2026-10-14 from the developers' own websites and brochure PDFs, and Bikroy developer ads; 109 folders have a `SOURCES.md` with the page and file addresses | The sheets belong to the developers. We use them only to test; they are never shown to buyers. Only BTI's and Sheltech's 4 folders are in git; the other 110 stay on this PC | test material only |
| **8 of those sheets on the live site** (`public/assets/plan-*`: BTI 2nd and 3rd floor, six Sheltech levels) | The plan pictures behind the built-in demo flats and levels | BTI and Sheltech brochures | the developers' | fine for a private demo; **before a public launch ask BTI / Sheltech, or use a paying customer's own sheets** |
| **8 real buildings' files on the live site** (`public/samples/`: 2 IFC, 2 DXF, 2 PDF, 1 SVG, 1 GLB) | The Studio's **Try a sample ▾** (one click, opened as if dropped) | Zenodo (the SUM4Re project's surveyed flat; Institut Jožef Stefan's office floor), IfcOpenShell's IfcOpenHouse (GitHub), Loughborough University's data repository, the UK Department for Education (gov.uk), Wikimedia Commons (Casa Steiner, a Polish flat plan), Poly by Google (poly.pizza). Served from our own site: no outside address, no CSP change | CC0 (2), CC BY 4.0 (3), CC BY 3.0 (1), Open Government Licence v3.0 (1), CC BY-SA 3.0 (the SVG, passed on unchanged); every source, author and credit in `public/samples/MANIFEST.md` and on each sample in the list | permanent |
| **53 public buildings' files** (`E:/dev/ALTERNATIVE FORMAT TEST/samples-2026-11-22/`, on this PC only): 21 IFC, 10 DXF, 10 PDF, 6 SVG, 6 3D models | Testing the file readers in Firefox, file by file ([SAMPLES.md](SAMPLES.md)) | Fetched 2026-11-22 from Zenodo, figshare / Loughborough, TU Wien and VTT research data, GitHub repositories, the Open IFC Model Repository, gov.uk, gov.ie, the US National Park Service, NIST, CMHC, Wikimedia Commons (when it refused this connection, the Internet Archive's copy of the same file, checked byte for byte), NASA, 3D BAG, Google's KML pages, poly.pizza | Each file's licence in SAMPLES.md, read on its page: 40 free to pass on (CC0, CC BY, CC BY-SA, public domain, open government, MIT); 13 test only (no licence stated, GPL, MPL inside a code repository, non-commercial, all rights reserved) | test material only; the 8 above ship |

## 10. Made by us (no outside source)

The wall graph and every rule (`src/core`), Auto-trace (`src/trace`), the file readers and writers of our own
(`src/import`: SVG, the DXF writer, the print sheet), the furnishing presets and code-built pieces (`src/furnish`), the
Studio, the 3D view, the wind lines, the made-up street, the front page's story, the room words Auto-trace reads, the
Dhaka wind table (data from Open-Meteo, §4), the built-in flats and levels (`src/data/units`).

## 11. Tools used to build Plotline (not part of the product)

- **Claude Code** (Anthropic) writes and tests the code, on the founder's own Claude account — nothing in the product
  calls it.
- **Git** and **GitHub** (§8), **Node.js** (§7).
- **Poly Haven's file service** (api.polyhaven.com) was used once per asset to download it; the site never calls it.

---

## What we would replace, and when

| # | Replace | With | When |
|---|---|---|---|
| 1 | OpenStreetMap's editing server as the fallback for neighbours and roads (against its rules) | A second Overpass server, or a free Bangladesh map download (Geofabrik) read by us | **Soon** — before more sites are fetched |
| 2 | Vercel Hobby (non-commercial only) | Vercel Pro ($20 a month per seat) or another host | When the **first developer pays** |
| 3 | Open-Meteo free API (non-commercial only) | Open-Meteo paid plan, or ERA5 from Copernicus ourselves | When Plotline **earns money** |
| 4 | Supabase Free (pauses after 7 quiet days) | Supabase Pro ($25 a month) | When buyer links **must never stop** (the first real customer) |
| 5 | Supabase's own sign-in emails (only the Supabase team) | A free email sender (Brevo or Resend), SETUP_ACCOUNTS Step 5 | Before **anyone else** signs in |
| 6 | Local AI (Qwen on the founder's PC) and the Gemini free key | A frontier vision model through a paid API | When there is **a key and a budget**; the local model is measured too weak |
| 7 | OpenStreetMap tiles and Nominatim (best effort, no guarantee) | A map company's tiles and address search (free tiers exist; Google Maps if a card is added) | When **many staff** use Site, or a block happens |
| 8 | BTI and Sheltech sheets on the live demo | Their permission, or customers' own sheets | Before a **public launch** |
| 9 | Instrument Sans / Serif from Google Fonts, tesseract files from jsDelivr (optional) | Copies inside our own site | Any time — removes two outside calls (and their CSP lines) |
