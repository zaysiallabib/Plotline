# Turning on DWG: letting the Studio open AutoCAD's own files

Written 2026-11-20 for the founder. About 10 minutes, once. Optional: without it, a `.dwg` dropped on the Studio is
refused with the one-click fix ("in AutoCAD: Save as → DXF, then drop the .dxf"), as before.

## What this gives you

- Staff can drop the architect's **`.dwg`** on the Studio (or pick it with ⋯ → **Import…**). It is turned into a DXF
  on the internet and opened like a dropped DXF: walls, doors, windows, columns and room names, ready to check.
- The box at the top says **Reading Floor 2.dwg · converting the DWG to DXF** while it works (a few seconds).
- **10 drawings a day, free** (CloudConvert's free plan; it resets every day). The 11th that day is refused with the
  same "Save as DXF" advice. If you ever need more, CloudConvert sells packs; nothing changes in Plotline.

## Why it goes through the internet

AutoCAD's `.dwg` is a locked format. The only free program that reads it (LibreDWG) has a licence (GPL) that would force
Plotline's own code to become free for everyone if we put it inside the website — so we cannot. A converter on the
internet does the job instead: the drawing is sent to **CloudConvert** (a German company; files are deleted after 24
hours), and only the DXF comes back. If a customer must not send drawings outside, they use "Save as DXF" instead.

## Words used here

| Word | Meaning |
|---|---|
| DWG / DXF | AutoCAD's own locked file / its open version. Same drawing, different packaging. |
| API key | A long code that lets Plotline use your CloudConvert account. It is a password: never paste it anywhere but Vercel. |
| Environment variable | A named setting you type into Vercel (a name and a value). The website reads it when it is built. |

## Steps

1. **Make a free CloudConvert account.** Open https://cloudconvert.com → **Sign Up** (email and password, no card).
2. **Make the key.** In CloudConvert: your name (top right) → **Authorization** → **API Keys** → **Create New API Key**.
   Name: `Plotline`. Tick only **task.read** and **task.write**. → **Create**. Copy the long key it shows (it shows it
   only once).
3. **Give the key to Vercel (the server only).** Open https://vercel.com → the **plotline** project → **Settings** →
   **Environment Variables** → **Add New**:
   - Name `CLOUDCONVERT_API_KEY`, value: the key from step 2, environments **Production** (and **Preview** if you like)
     → **Save**. This one has no `VITE_` in front: that is what keeps it on the server, out of the website.
4. **Tell the Studio where the converter is.** Same page → **Add New**:
   - Name `VITE_DWG_CONVERT_URL`, value `/api/dwg` → **Save**.
5. **Deploy**: in `E:\dev\Plotline`, run `npx vercel --prod --yes` (as always).
6. **Check it.** Open https://plotline-flax.vercel.app/studio, drop any `.dwg` (a test one is in
   `E:\dev\ALTERNATIVE FORMAT TEST\samples\dwg\`). The box at the top says "converting the DWG to DXF", then the plan
   opens and the right-hand list starts with "Converted from DWG to DXF…".

## On your own PC (only if you run the site locally)

Put the same two lines in `E:\dev\Plotline\.env.local` (this file is never uploaded to GitHub):

```
CLOUDCONVERT_API_KEY=the key from step 2
VITE_DWG_CONVERT_URL=/api/dwg
```

The `/api/dwg` part runs only on Vercel (or with `npx vercel dev`); the normal `npm run dev` has no server, so locally a
DWG then says "the DWG converter could not be reached".

## If something goes wrong

| What you see | What it means / what to do |
|---|---|
| "AutoCAD's own .dwg cannot be read here…" | Step 4 is missing, or the site was not deployed after it (step 5). |
| "The DWG converter is not set up on this site" | Step 3 is missing (the key), or it was added after the last deploy: deploy again. |
| "The converter refused it: … credits …" | The 10 free drawings of today are used up. Tomorrow it works again, or use Save as DXF. |
| "The DWG is … MB; the converter takes 4 MB at most" | A very big drawing (Vercel takes 4.5 MB a message). Save it as DXF in AutoCAD and drop that. |

## Safety (what Claude checked)

- The key lives only in Vercel's server settings (`CLOUDCONVERT_API_KEY`, no `VITE_`), so it is never in the website a
  visitor downloads. `api/dwg.js` is the only code that reads it.
- The converter only answers Plotline's own pages, only takes a real DWG (it starts with "AC10"), at most 4 MB.
- Worst case if someone abuses it: today's 10 free conversions are spent. The free plan has no card, so nothing can be
  charged.
