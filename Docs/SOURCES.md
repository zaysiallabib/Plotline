# Plotline — where everything comes from

Every outside thing Plotline uses, in one place: what it is, what we use it for, where it comes from, what it costs, the limits that matter, and whether it stays. Checked 2026-10-19 (the licence and limit pages of Open-Meteo, OpenStreetMap, Overpass, Vercel and Supabase were read that day; they can change).

**Money: today Plotline pays for nothing.** Everything below is free. But several free tiers are only free for non-commercial use, and those have to change when the first developer pays — they are marked **TEMPORARY** with the reason.

## The short answer

| Question | Where it comes from | Costs | Stays? |
|---|---|---|---|
| The furniture library | 25 scanned 3D models from **Poly Haven** + 85 pieces built in our own code, wearing textures from **Poly Haven** and **ambientCG** | free (CC0, no credit needed) | permanent |
| The wind | **Open-Meteo**'s weather archive, once per building site; a built-in **Dhaka table** (Open-Meteo 2015–2024) when no site is set | free, but non-commercial only | **TEMPORARY** — a paid plan or our own copy of the data once Plotline earns money |
| The sunlight | **No outside service**: the sun's position is worked out by a published formula (NOAA's) in our own code | free | permanent |
| The location (address → map spot) | **Nominatim** (OpenStreetMap's address search) | free, 1 request a second | **TEMPORARY** for many users |
| The map picture | **OpenStreetMap** map tiles | free, best effort | **TEMPORARY** for many users |
| The buildings and roads round the plot | **Overpass API** (OpenStreetMap data); when it fails, OpenStreetMap's own editing server | free | the fallback **must go** (see §4) |

---

## 1. Furniture, materials and light (the 3D look)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **29 scanned 3D models** (sofas, chairs, tables, lamps, ceiling fan, clock, plants, bench, bistro set, a covered car…) + the leaf and bark pictures of 2 tree models | Furniture and plants. 25 of them are pieces in the library; 4 plants sit in pots built in code | Poly Haven — https://polyhaven.com (each model's page is listed in `public/assets/MANIFEST.md`) | **CC0** (public domain): free for anything, no credit required. We list authors anyway | permanent |
| **85 code-built pieces** (beds, wardrobes, kitchens, bathroom fittings, TVs, rugs, curtains, frames, AC units, pots and planters, trees, shrubs, lounger, pergola, gym and play pieces…) | The rest of the library — Poly Haven has no modern bed, bathroom, kitchen, gym or play equipment | Our own code (`src/furnish/procedural.ts`) | ours | permanent |
| **The library** (Add in Edit furniture, Pick from the library in the Studio) | 110 pieces in 10 tabs = the 25 scanned + the 85 code-built | both of the above | free | permanent |
| **21 texture sets** (wood floors, marble, tiles, plaster, fabrics, rug, metal, turf, paving, asphalt, concrete, deck boards, gym rubber, soil) | What floors, walls, furniture and outdoor areas are made of | 10 from Poly Haven, 11 from ambientCG — https://ambientcg.com | **CC0** | permanent |
| **2 sky / light pictures (HDRIs)**: a small photo studio (`interior.hdr`) and a clear sky (`sky.hdr`) | The soft light inside the rooms; the sky seen through windows and from the dollhouse | Poly Haven (studio_small_09, kloofendal_43d_clear_puresky) | **CC0** | permanent |
| **2 wall pictures** (sea, dawn) | The framed art on the walls | Cropped from two Poly Haven sky photos (umhlanga_sunrise, kiara_1_dawn) | **CC0** | permanent |

All of it is in `public/assets/` (about 89 MB: models 59 MB, textures 26 MB, sky 2.7 MB) and listed one by one, with author and the date the licence was checked, in `public/assets/MANIFEST.md`. A room loads only the pieces it uses. Lite quality loads the pictures at half size and leaves the scanned potted plants out.

**Later (planned, not built):** brand libraries — real furniture and finish brands' own models and price lists (the masterplan's marketplace). Nothing from a brand is in Plotline yet.

## 2. Letters (fonts)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Inter** (light and regular) | All the text on every page | Google Fonts — fetched from `fonts.googleapis.com` each time a page opens | SIL Open Font License, free | permanent. Could be copied into the site so pages stop asking Google (optional) |
| Georgia | The N E S W letters on the wind rose | The computer's own font, nothing downloaded | — | permanent |

## 3. Sunlight

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Sun position formula** (NOAA's solar position equations, low-precision version, exact to well under 1°) | Where the sun stands at the site on the chosen day and hour, turned by the plan's true north: the sun patches and shadows in the 3D | Written into our own code (`src/core/site.ts`, `sunPosition` / `sunAt`) — no internet at all | a published formula, free | permanent |
| **The site's clock** | So "15:00" is the site's own 15:00 | Open-Meteo's time-zone answer, saved with the site; else worked out from the longitude (Dhaka = UTC+6) | free | permanent |

No site set in the Studio: the sun of Dhaka.

## 4. Wind, location and the map round the building

All of this is fetched **once**, in the Studio (top bar → Site → click the plot), and saved inside the drawing. Preview 3D, the Building view and buyer links never ask these services again — they work offline.

| What | Used for | From | Licence / cost / limits | Status |
|---|---|---|---|---|
| **Open-Meteo Historical Weather API** | The wind by month (daily mean speed and main direction at 10 m), temperature and humidity, over the ten full years before the fetch; the site's clock | https://archive-api.open-meteo.com — no key, no account. The numbers are ERA5 reanalysis (the European weather centre's, through Open-Meteo) | Data under **CC BY 4.0**: credit needed — we show "Open-Meteo" on the wind rose and in the Site panel. **The free API is for non-commercial use only.** Limits: 600 calls a minute, 5,000 an hour, 10,000 a day (we use one call per site). Paid plans start at "API Standard" (1 million calls a month; price on open-meteo.com/en/pricing) | **TEMPORARY**: when Plotline earns money, a paid Open-Meteo plan, or the same ERA5 data downloaded ourselves from Copernicus (free, needs an account) |
| **The Dhaka wind table** (`DHAKA_WIND`) | The wind when no site is set, and when offline | Open-Meteo 2015–2024 at 23.79 N, 90.40 E, fetched 2026-10-18, written into our code | as above | permanent as the fallback |
| **Nominatim** | Address → map position (Site → **Find**). Pasting "23.7903, 90.4077" needs no call | https://nominatim.openstreetmap.org — no key | Free. Rules: at most **1 request a second**, never search-as-you-type, the browser must send the page address (it does), credit the data. Data © OpenStreetMap contributors (ODbL) | **TEMPORARY**: fine for staff typing an address now and then. Many customers → our own Nominatim or a paid address search |
| **OpenStreetMap map tiles** | The small map picture in the Site panel (9 tiles at zoom 18 per opening) | https://tile.openstreetmap.org — no key | Free, **best effort, no guarantee**: may be blocked at any time, credit must show on the map (we show "© OpenStreetMap contributors" under it); paying services are warned that access can be withdrawn | **TEMPORARY**: a map-tile company (free tiers exist) when there are customers |
| **Overpass API** | The buildings (outline, height or floors) and roads within 250 m of the plot | https://overpass-api.de — no key, 20-second wait | Free. About 10,000 questions and 1 GB a day per user; when busy it refuses (errors 429 / 504). **From this PC it refused or timed out most of the night of 2026-10-18** — every site so far came from the fallback | permanent for now; a second Overpass server could be added as the next try |
| **OpenStreetMap's own map server** (the fallback) | Same buildings and roads (one 500 m box) when Overpass fails | https://api.openstreetmap.org/api/0.6/map.json | **Against its rules**: OpenStreetMap's API policy says this server is "to edit the map data, not for read-only purposes". Fine as a stop-gap on our own PC; it can be blocked without warning | **MUST BE REPLACED**: another Overpass server, or a free download of all Bangladesh map data (Geofabrik) read by us |
| **OpenStreetMap data** (the blocks and roads themselves) | The grey neighbour blocks and dark roads in the 3D, their shadows | © OpenStreetMap contributors | **ODbL**: free, credit required where the data is shown. The Studio's map shows the credit; **the 3D view does not yet** (blocks and roads show on buyer links with no credit line) | to do: a small "© OpenStreetMap contributors" line in the 3D view when a site is set |
| Building heights | How tall each neighbour block stands | The map's own height, else its floors × 3 m, else **a guess of 9 m** (most Dhaka buildings have neither: Banani 396 of 407) | — | staff type the heights they know |
| **Google Maps** | **Not used** | — | Needs a billing account with a card even for its free credit | planned only if the founder adds a card |
| **Windy API** | **Not used** (the idea in CLAUDE.md); Open-Meteo gave the same monthly wind for free | — | — | not planned now |

What the wind is and is not: real monthly averages from weather records, NOT gusts and NOT the street-level wind between buildings. Lines are a guide, not a wind simulation.

## 5. Reading the plan (Auto-trace)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **tesseract.js 7.0.0** (with tesseract.js-core 7.0.0) | Reads the printed words and sizes on the plan, inside the browser | npm package; its worker and engine files and the English reading data (`eng.traineddata`, 4.0.0_best_int, about 2.9 MB) are **downloaded from cdn.jsdelivr.net the first time Auto-trace runs**, then kept in the browser | Apache-2.0, free. jsDelivr is a free public file server | permanent. Could copy the files into the site so Auto-trace does not depend on jsDelivr (optional) |
| Everything else in Auto-trace (walls, doors, rooms, flats, sizes) | — | Our own code (`src/trace/`) | ours | permanent |

## 6. AI helpers (both optional, both off unless set up)

| What | Used for | From | Licence / cost | Status |
|---|---|---|---|---|
| **Ollama 0.40.6** (the program that runs a model) | **Ask AI** / **Ask AI for all** in Check these: which of a row's buttons is right | The GitHub release zip, unpacked to `E:\dev\tools\ollama` (nothing installed, nothing on C:); started with `start-ollama.cmd`; answers at `http://localhost:11434` | Open source (MIT), free. Its paid cloud models are switched off (`OLLAMA_NO_CLOUD=1`, and the Studio refuses "-cloud" models and servers that are not this PC) | **TEMPORARY** |
| **qwen2.5vl:7b** (Qwen2.5-VL 7B, the Qwen team at Alibaba) | The model Ollama runs; sees the piece of the sheet round a row | Pulled by Ollama into `E:\dev\tools\ollama\models` (6 GB), runs on this PC's RTX 3050 (8 GB) — works only on this PC | Apache-2.0, free | **TEMPORARY: measured too weak on plans** — right 8 times, wrong 14 on the rows that change the plan (it does not see door swings), so Ask AI for all skips those rows. **Planned replacement:** a frontier vision model through a paid API (e.g. Claude: a small one for crop questions, a bigger one for a whole unreadable sheet — cents per sheet) when there is a key and a budget |
| **qwen3-vl:8b** | Nothing — tried and dropped (slower, 12–100 s an answer, not better) | Pulled to `E:\dev\tools\ollama\models` (6.1 GB) | Apache-2.0 | unused; can be deleted to free 6 GB |
| **Google Gemini** (`gemini-2.5-flash`) — the **AI helper (optional)** box | Re-reads room names and sizes the built-in reader could not read | https://generativelanguage.googleapis.com, with a key typed into the Studio (free keys from https://aistudio.google.com/apikey); no key is in the code; nothing is sent without one | Free tier with daily limits. Google's free-tier terms let it use what is sent to improve its products — a customer's sheet would go to Google | optional; likely replaced by the same paid vision API as above |

## 7. The 3D engine and the libraries in the code

All open source and free. Versions from `package.json` (installed copies checked).

| Library | Version | Licence | Used for | In the live site? |
|---|---|---|---|---|
| **three.js** | 0.186.1 | MIT | The whole 3D view: drawing, light and shadows, loading models, walking and dollhouse controls, VR (WebXR) | yes |
| **React** + **react-dom** | 19.3.0 | MIT | The screens and buttons | yes |
| **tesseract.js** | 7.0.0 | Apache-2.0 | Reading the plan (§5) | yes (Studio only, loaded when Auto-trace starts) |
| **Vite** + @vitejs/plugin-react | 8.3.1 / 6.1.1 | MIT | Builds the site; the local dev server | no (building only) |
| **TypeScript** | 7.0.2 | Apache-2.0 | Checks the code (`npm run typecheck`) | no |
| **Vitest** | 5.0.1 | MIT | The automatic tests (`npm test`) | no |
| **Playwright** + its Firefox | 1.63.0 | Apache-2.0 (Firefox: MPL-2.0) | Browser tests "as the founder", always in Firefox, kept at `E:\dev\tools\ms-playwright` | no |
| **iwer** (Meta's VR headset stand-in) | 2.5.0 | MIT | Testing VR without a headset (`?xr=emulate`, dev server only) | no (left out of the live build) |
| @types/node, @types/react, @types/react-dom, @types/three | — | MIT | Type information for TypeScript | no |
| **Node.js** | 24 | MIT | Runs the tools above on this PC | no |

## 8. Hosting, database and putting it live

| What | Used for | From | Licence / cost / limits | Status |
|---|---|---|---|---|
| **Vercel — Hobby (free) plan** | The live site: https://plotline-flax.vercel.app (Vercel project "plotline") | https://vercel.com | Free. Per month: 100 GB of data sent, 1 million requests; over a limit that feature stops until 30 days have passed. A visit downloads the models and pictures its rooms need (tens of MB for a furnished flat; the browser keeps them), so 100 GB is roughly a few thousand first visits a month. **The Hobby plan is for personal, non-commercial use only** | **TEMPORARY**: when the first developer pays — Vercel Pro ($20 a month per developer seat) or another host |
| **Putting it live (deploy)** | Sends the current code to the live site | From `E:\dev\Plotline`, run `npx vercel --prod --yes` (the Vercel command-line tool, fetched by npx). **Pushing to GitHub does NOT deploy** — Vercel is not linked to GitHub for this project | free | the founder deploys (Claude did it once, 2026-10-19, at his ask) |
| **Supabase — Free plan** | Buyer links (`/s/…`): the flat a link opens (tables `units`, `share_links`); the change list: buyers' notes and finish choices (table `events`); staff actions guarded by the staff key | https://supabase.com — project `qhrtjfwjyctvlcgxmvyi` (the one in `.env.local`; the other project the connector shows, `txbt…`, is another app's — never touch it). Called with plain web requests, no Supabase library. The browser gets the publishable key only (Vercel `SUPABASE_URL` / `SUPABASE_KEY`); the build refuses a secret key | Free: 500 MB database, 5 GB data out a month, 1 GB files, 50,000 monthly users, 2 active projects. **Pauses after 7 days with no activity** — buyer links stop working until someone presses Restore in the Supabase dashboard. Pro: from $25 a month | permanent; Pro when buyer links must never pause |
| What is **not** in the database yet | Logins / accounts, Studio drawings and projects, plan pictures, furniture moved in 3D, notes on ordinary (non-buyer) links — all kept in the browser only | — | — | Phase A/B (accounts, shared projects) |
| **GitHub** | Keeps the code and its history: github.com/zaysiallabib/Plotline | https://github.com | free | permanent |

## 9. The plan sheets we test with (`Demo drawings/`)

| What | Used for | From | Rights | Status |
|---|---|---|---|---|
| **114 project folders** of Bangladeshi developers' plan sheets — bti, Sheltech, Assure, Mir, Ena, Akter, Rangs, Moonstone, Finlay, CPDL, Uttaradhikar, Dominant, Eastern Housing, Assort, Crystal, Accept, Arkam, Foysal, Nessa, Prime Asset, Renown and others (Dhaka and Chattogram) | Testing Auto-trace "as the founder" (the 30-sheet and 114-project scoreboards) | Collected 2026-10-14 from the developers' own websites and brochure PDFs, and Bikroy developer ads. 109 folders have a `SOURCES.md` with the page and file addresses | The sheets belong to the developers (their brochures). We use them only to test; they are never shown to buyers. Only BTI's and Sheltech's 4 folders are in git; the other 110 stay on this PC | test material only |
| **8 of those sheets on the live site** (`public/assets/plan-*`: BTI 2nd and 3rd floor, six Sheltech levels) | The plan pictures behind the built-in demo flats and levels | BTI and Sheltech brochures | the developers' | fine for a private demo; **before a public launch ask BTI / Sheltech, or use a paying customer's own sheets** |

## 10. Made by us (no outside source)

The wall graph and every rule (`src/core`), Auto-trace (`src/trace`), the furnishing presets and code-built pieces (`src/furnish`), the Studio, the 3D view and the wind lines, the room words Auto-trace reads, the Dhaka wind table (data from Open-Meteo, §4), the built-in flats and levels (`src/data/units`).

## 11. Tools used to build Plotline (not part of the product)

- **Claude Code** (Anthropic) writes and tests the code, on the founder's own Claude account — nothing in the product calls it.
- **Git** and **GitHub** (§8), **Node.js** (§7).
- **Poly Haven's file service** (api.polyhaven.com) was used once per asset to download it; the site never calls it.

---

## What we would replace, and when

| # | Replace | With | When |
|---|---|---|---|
| 1 | OpenStreetMap's editing server as the fallback for neighbours and roads (against its rules) | A second Overpass server, or a free Bangladesh map download (Geofabrik) read by us | **Soon** — before more sites are fetched |
| 2 | No map credit in the 3D view | A small "© OpenStreetMap contributors" line when a site is shown (ODbL needs it) | **Soon** — before a client sees a site |
| 3 | Vercel Hobby (non-commercial only) | Vercel Pro ($20 a month per seat) or another host | When the **first developer pays** |
| 4 | Open-Meteo free API (non-commercial only) | Open-Meteo paid plan, or ERA5 from Copernicus ourselves | When Plotline **earns money** |
| 5 | Supabase Free (pauses after 7 quiet days) | Supabase Pro ($25 a month) | When buyer links **must never stop** (first real customer) |
| 6 | Local AI (Qwen on the founder's PC) and the Gemini free key | A frontier vision model through a paid API | When there is **a key and a budget**; the local model is measured too weak |
| 7 | OpenStreetMap tiles and Nominatim (best effort, no guarantee) | A map company's tiles and address search (free tiers exist; Google Maps if a card is added) | When **many staff** use Site, or a block happens |
| 8 | BTI and Sheltech sheets on the live demo | Their permission, or customers' own sheets | Before a **public launch** |
| 9 | Inter from Google Fonts, tesseract files from jsDelivr (optional) | Copies inside our own site | Any time — removes two outside calls |
