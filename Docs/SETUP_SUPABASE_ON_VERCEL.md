# Turning on Share links and the Change list on the live site

Written 2026-10-04 for the founder. No earlier knowledge needed. About 10 minutes.

## What this does

The live site (https://plotline-flax.vercel.app) is built by **Vercel**. The buyer data
(share links, comments, finish choices) lives in **Supabase**. The database is already set up
and working. The only missing piece: Vercel does not yet know the address of the database, so
the live site was built without the **Share link** and **Change list** buttons.

You will give Vercel two values, then build the site again. That is all.

When you are done:

- `/studio` on the live site shows **Share link** and **Change list** in the top bar.
- A buyer who opens a share link can comment and pick finishes, and you see them in the Change list.

## Words used here

| Word | Meaning |
|---|---|
| Environment variable | A named value the site is given when it is built. Here there are two. |
| Deploy | Build the site and put it live. One command. |
| Publishable key | The database key that is allowed to be public. It is safe inside the website. |
| Staff key | Your own password for publishing links and reading the Change list. It is NOT one of the two values. Never put it on Vercel or in a file in the project. |

## Before you start

You need three things.

1. **You can log in to https://vercel.com** with the account that owns the project `plotline`.
2. **The two values.** They are already on your computer in the file `E:\dev\Plotline\.env.local`.
3. **Your staff key.** It was printed when you pasted the SQL into Supabase. If you did not keep
   it, get it again:
   1. Open https://supabase.com, open the Plotline project (its address contains `qhrtjf`).
   2. Left side: **SQL Editor** → **New query**.
   3. Paste this one line and press **Run**:
      ```sql
      select value as staff_key from private.config where key = 'staff_key';
      ```
   4. The result row is your staff key. Save it in a password manager.

## Step 1 — Find the two values

1. Open the folder `E:\dev\Plotline` in File Explorer.
2. Open the file `.env.local` with Notepad (right-click → Open with → Notepad).
   If you do not see the file: in File Explorer click **View → Show → Hidden items**.
3. Find these two lines:
   ```
   VITE_SUPABASE_URL=https://qhrtjf…….supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_……
   ```
4. For each line, the **name** is the part before `=` and the **value** is everything after `=`.
   Leave Notepad open; you will copy from it.

Ignore the other line in that file (`VERCEL_OIDC_TOKEN`). Do not copy it anywhere.

If you changed the key in Supabase since 2026-10-03, the file is out of date. Get the current
values from Supabase instead: open the project → **Project Settings** (the gear) → **API Keys**
for the publishable key, and **Data API** for the project URL. Then also replace the two lines
in `.env.local` so your own computer keeps working.

## Step 2 — Give the two values to Vercel

1. Go to https://vercel.com and log in.
2. Click the project named **plotline**.
3. Click **Settings** (top of the page).
4. In the left menu click **Environment Variables**.
5. Add the first one:
   - **Key**: type exactly `VITE_SUPABASE_URL`
   - **Value**: paste the value from Notepad (starts with `https://`, ends with `.supabase.co`).
     No spaces, no quotes, no `=` sign.
   - **Environments**: make sure **Production** is ticked. Leaving Preview and Development
     ticked too is fine.
   - Click **Save**.
6. Add the second one the same way:
   - **Key**: `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Value**: the value that starts with `sb_publishable_`
   - **Production** ticked → **Save**.
7. You should now see both names in the list on that page.

The names must be typed exactly, capital letters and underscores included. A name that is one
letter off does nothing and gives no error.

### The same thing from the terminal (only if you prefer it)

Open a terminal in `E:\dev\Plotline` and run these one at a time. Each asks for the value:
paste it and press Enter.

```
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production
```

## Step 3 — Build the live site again

Saving the values does not change the live site. The site only reads them while it is being
built, so it must be built again.

1. Open a terminal in `E:\dev\Plotline` (in VS Code: **Terminal → New Terminal**).
2. Run:
   ```
   npx vercel --prod --yes
   ```
3. Wait about one minute. It is done when it prints a line with
   `https://plotline-flax.vercel.app` and returns to the prompt.

## Step 4 — Check that it worked

Do all three. Each takes a minute.

**Check A — the buttons are there.**
Open https://plotline-flax.vercel.app/studio and press Ctrl+F5 (a full reload).
The top bar must show **Share link** and **Change list**. If they are missing, go to
"If something is wrong" below.

**Check B — the automatic check.**
In the terminal in `E:\dev\Plotline` run (put your staff key in place of `YOUR_STAFF_KEY`):
```
node scripts/verify-share.mjs YOUR_STAFF_KEY
```
Every line must start with `PASS` and the last line must say `all checks passed`.
This creates one test link named "Verify script test — ignore" with three test rows. They stay
in the Change list forever (the list never deletes anything). That is expected.

**Check C — the real thing, as a buyer.**
1. Open https://plotline-flax.vercel.app/studio with a flat open.
2. Click **Share link**. The first time it asks for the staff key: paste it. It is asked once
   per browser.
3. Copy the link it gives you.
4. Open a **private window** (Ctrl+Shift+N in Chrome or Edge, Ctrl+Shift+P in Firefox) and
   paste the link. This is what a buyer sees.
5. Click **Enter**. Press **C**, click a wall, type a note, **Save**. Open **Finishes** and
   pick one option.
6. Back in your normal window: `/studio` → **Change list**. You must see the note and the
   finish choice under that link. **Export CSV** downloads them.

## If something is wrong

| What you see | Why | What to do |
|---|---|---|
| No **Share link** / **Change list** button on live `/studio` | The site was built without the values | Check both names are in Vercel → Settings → Environment Variables, spelled exactly, with **Production** ticked. Then run Step 3 again and reload with Ctrl+F5. |
| Buttons still missing after Step 3 | The browser shows the old site | Ctrl+F5, or open the site in a private window. |
| "Wrong staff key" | The key typed is not the one in the database | Get it again (see "Before you start", point 3) and click Share link / Change list again to retype it. |
| The share link says "This unit isn't available" | The link was copied incompletely, or the browser is offline | Copy the whole link again; check the internet connection. |
| `verify-share.mjs` shows a `FAIL` line | Something in the database setup is off | Copy the whole output and give it to Claude. Do not try to fix the database by hand. |
| `npx vercel --prod --yes` asks you to log in | The terminal is not logged in to Vercel | Run `npx vercel login`, follow it, then run Step 3 again. |
| The Change list is empty after a buyer commented | The buyer was on a normal `/u/...` page, not a share link | Only links that start with `/s/` are recorded. Use the link from **Share link**. |

## Rules that keep the data safe

- Only ever put the **publishable** key on Vercel. Supabase also has a **secret** key (also
  called `service_role`). Never copy that one anywhere: it bypasses all protection.
- The **staff key** stays in your password manager. Not on Vercel, not in `.env.local`, not in
  a chat, not in git.
- Never commit `.env.local`. It is already ignored by git; leave it that way.
- Plotline's Supabase project is the one whose address contains `qhrtjf`. There is another
  project on the same account (`txbt…`) that belongs to a different app: never run Plotline
  SQL there.

## If you change the Supabase key later

1. Put the new value in `E:\dev\Plotline\.env.local`.
2. In Vercel → Settings → Environment Variables, open the three-dot menu on
   `VITE_SUPABASE_PUBLISHABLE_KEY` → **Edit**, paste the new value, **Save**.
3. Run Step 3, then Step 4.
