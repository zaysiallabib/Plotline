# Turning on DWG — letting the Studio open AutoCAD's own files, in one sitting

For the founder. About 10 minutes, once, free. Optional: without it a `.dwg` dropped on the Studio is refused with the
one-click fix ("In AutoCAD (or any free DWG viewer): Save as → DXF, then drop the .dxf").

## What this gives you

- Staff can drop the architect's **`.dwg`** on the Studio (or pick it with **⋯ → Import…**). It is turned into a DXF on
  the internet and opens like a dropped DXF: walls, doors, windows, columns and room names, ready to check.
- While it works (a few seconds) the box at the top says **converting the DWG to DXF**; afterwards the list on the right
  starts with "Converted from DWG to DXF by the converter set up for this site".
- **10 drawings a day, free** (CloudConvert's free plan, reset every day, no card). The 11th that day is refused with the
  same "Save as DXF" advice. CloudConvert sells packs if you ever need more; nothing changes in Plotline.

## Why it goes through the internet

AutoCAD's `.dwg` is a locked format. The only free program that reads it (LibreDWG) has a licence (GPL) that would force
Plotline's own code to become free for everyone if it were put inside the website — so it cannot be. A converter on the
internet does the job instead: the drawing goes to **CloudConvert** (a German company; files deleted after 24 hours) and
only the DXF comes back. A customer whose drawings must not leave the office uses "Save as DXF" instead.

## Words used here

| Word | Meaning |
|---|---|
| DWG / DXF | AutoCAD's own locked file / its open version. Same drawing, different packaging. |
| API key | A long code that lets Plotline use your CloudConvert account. It is a password: paste it only into Vercel. |
| Environment variable | A named setting typed into Vercel (a name and a value); the website reads it when it is built. |

## Step 1 — A free CloudConvert account (2 minutes)

Open https://cloudconvert.com → **Sign Up** (email and password, no card) and confirm the email it sends.
**You should see** your CloudConvert dashboard with your name at the top right.

## Step 2 — The key (2 minutes)

Your name (top right) → **Authorization** → **API Keys** → **Create New API Key**. Name: `Plotline`. Tick only
**task.read** and **task.write** → **Create**.
**You should see** a long key, shown only once: copy it now. **If you lost it:** delete that key and make a new one.

## Step 3 — The key into Vercel, the server only (2 minutes)

https://vercel.com → the project **plotline** → **Settings** → **Environment Variables**: **Key**
`CLOUDCONVERT_API_KEY`, **Value** the key from Step 2, **Production** ticked (Preview too if you like) → **Save**.
It has no `VITE_` in front: that is what keeps it on the server, out of the website.
**You should see** `CLOUDCONVERT_API_KEY` in the list.

## Step 4 — Tell the Studio where the converter is (1 minute)

Same page: **Key** `VITE_DWG_CONVERT_URL`, **Value** `/api/dwg`, **Production** ticked → **Save**.
**You should see** both names in the list.

## Step 5 — Deploy (2 minutes)

In a terminal in `E:\dev\Plotline`: `npx vercel --prod --yes`. It is done when it prints a line with
`https://plotline-flax.vercel.app`.

## Step 6 — Check it (1 minute)

Open https://plotline-flax.vercel.app/studio and drop any `.dwg` (test ones are in
`E:\dev\ALTERNATIVE FORMAT TEST\samples\dwg\`).
**You should see** "converting the DWG to DXF", then the plan, and the list on the right starting "Converted from DWG to
DXF…". **If not:** the table below.

## On your own PC (only if you run the site locally)

Put the same two lines in `E:\dev\Plotline\.env.local` (never uploaded to GitHub):

```
CLOUDCONVERT_API_KEY=the key from Step 2
VITE_DWG_CONVERT_URL=/api/dwg
```

The `/api/dwg` part runs only on Vercel (or with `npx vercel dev`); plain `npm run dev` has no server, so locally a DWG
says "the DWG converter could not be reached".

## If something goes wrong

| What you see | What it means / what to do |
|---|---|
| "AutoCAD's own .dwg cannot be read here…" | Step 4 is missing, or the site was not deployed after it (Step 5). |
| "… The DWG converter is not set up on this site …" | Step 3 is missing, or it was added after the last deploy: deploy again. |
| "… The converter refused it: … credits …" | Today's 10 free drawings are used up. Tomorrow it works again, or use Save as DXF. |
| "… The DWG is … MB; the converter takes 4 MB at most" | A very big drawing (Vercel takes 4.5 MB a message). Save it as DXF in AutoCAD and drop that. |
| "the DWG converter could not be reached (no internet?)" | No internet — or, on your own PC, `npm run dev` (see above). |

## Safety (what Claude checked)

- The key lives only in Vercel's server settings (`CLOUDCONVERT_API_KEY`, no `VITE_`), never in the website a visitor
  downloads; `api/dwg.js` is the only code that reads it.
- The converter answers only Plotline's own pages, only takes a real DWG (it starts with "AC10"), at most 4 MB.
- Worst case if someone abuses it: today's 10 free conversions are spent. The free plan has no card, so nothing can be
  charged.
