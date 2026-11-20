# Turning on buyer links and the Change list on the live site — one sitting

For the founder. No earlier knowledge needed. About 10 minutes, once. After this, staff accounts and saving online are
turned on with [SETUP_ACCOUNTS.md](SETUP_ACCOUNTS.md).

## What this does

The live site (https://plotline-flax.vercel.app) is built by **Vercel**. The buyer data — share links, notes, finish
choices — lives in **Supabase**, the online database. Vercel needs two values to reach it: the database's address and
its **publishable** key. With them, the live Studio's **⋯** menu shows **Share link** and **Change list**, and a buyer
who opens a share link can leave notes and pick finishes that you then see in the Change list.

## Words used here

| Word | Meaning |
|---|---|
| Supabase / Vercel | Supabase keeps the data. Vercel runs the live website. Two separate online services, each with its own login. |
| Environment variable | A named value (a name and a value) the site is given when it is built. Here there are two. |
| Deploy | Build the site and put it live. One command. |
| Terminal | A plain window where you type a command and press Enter. In VS Code: **Terminal → New Terminal**; it opens in the project folder. |
| Publishable key | The database key that is allowed to be public. It is safe inside the website. |
| Staff key | Your own password for sharing links before accounts exist. It is NOT one of the two values: never put it on Vercel or in a project file. |

## Before you start

1. You can log in to https://vercel.com with the account that owns the project **plotline**.
2. You can log in to https://supabase.com and open the **Plotline** project — its address contains `qhrtjf`. The other
   project on the same account (`txbt…`) belongs to another app: never touch it.

## Step 1 — Find the two values (2 minutes)

1. Supabase → the Plotline project → **Project Settings** (the gear, bottom left) → **Data API**. Copy **Project URL**
   (it starts with `https://qhrtjf` and ends with `.supabase.co`).
2. Same settings → **API Keys**. Copy the **publishable** key (it starts with `sb_publishable_`). Never the **secret**
   one (`sb_secret_…` or `service_role`).

You should now have two lines of text. They are also in `E:\dev\Plotline\.env.local` (open it with Notepad; File
Explorer → **View → Show → Hidden items** if you do not see it) as `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` — if you copy them from there, ignore the other line (`VERCEL_OIDC_TOKEN`).

## Step 2 — Give them to Vercel (3 minutes)

1. https://vercel.com → the project **plotline** → **Settings** (top) → **Environment Variables** (left).
2. **Already listed there: `SUPABASE_URL` and `SUPABASE_KEY`?** Then this step is done — go to Step 3.
3. Otherwise add the first one: **Key** `SUPABASE_URL`, **Value** the Project URL (no spaces, no quotes), **Environments**
   with **Production** ticked (Preview and Development may stay ticked) → **Save**.
4. Add the second: **Key** `SUPABASE_KEY`, **Value** the publishable key, **Production** ticked → **Save**.

You should see both names in the list. They must be spelled exactly, capitals and underscores included: a name one
letter off does nothing and gives no error. (The older names `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
work too; use one pair, not both. Only `SUPABASE_KEY` is checked: the build stops if it is a secret key.)

The same from the terminal, if you prefer: `npx vercel env add SUPABASE_URL production`, then
`npx vercel env add SUPABASE_KEY production` (each asks for the value: paste it, Enter).

## Step 3 — Build the live site again (2 minutes)

Saving the values does not change the live site; it reads them only while being built.

1. Open a terminal in `E:\dev\Plotline`.
2. Run `npx vercel --prod --yes`.
3. Wait about a minute. It is done when it prints a line with `https://plotline-flax.vercel.app` and returns to the
   prompt.

If it asks you to log in: run `npx vercel login`, follow it, then run step 2 again.

## Step 4 — Check that it worked (3 minutes)

**A — the menu.** Open https://plotline-flax.vercel.app/studio, press **Ctrl+F5** (a full reload), click **⋯** (top
right). Under **Buyers** you must see **Share link** and **Change list**.

**B — the automatic check** (only if you know the staff key): in the terminal run
`node scripts/verify-share.mjs YOUR_STAFF_KEY`. Every line must start with `PASS` and the last says
`all checks passed`. It leaves one test link named "Verify script test — ignore" in the Change list for ever (the list
never deletes anything); that is expected. Lost the staff key? Supabase → **SQL Editor** → **New query**, paste
`select value as staff_key from private.config where key = 'staff_key';`, **Run**; keep it in a password manager.

**C — the real thing, as a buyer.**
1. In the live Studio, with a drawing open: **⋯ → Share link**. Signed in to your company nothing is asked; not signed
   in, the white card asks once for the staff key ("Type the staff key …"): paste it, **Share**. The message says
   "Link copied: …".
2. Open a **private window** (Ctrl+Shift+N in Chrome or Edge, Ctrl+Shift+P in Firefox) and paste the link: this is what a
   buyer sees.
3. **Enter**, press **C**, click a wall, type a note, **Save**. Open **Finishes** and pick one option.
4. Back in your normal window: **⋯ → Change list**. You must see the note and the choice under that link; **Export CSV**
   downloads them as a spreadsheet.

## If something is wrong

| What you see | Why | What to do |
|---|---|---|
| No **Share link** / **Change list** under ⋯ | The site was built without the values | Check both names in Vercel → Settings → Environment Variables, spelled exactly, **Production** ticked; Step 3 again; Ctrl+F5 |
| Still missing after Step 3 | The browser shows the old site | Ctrl+F5, or a private window |
| The build stops with "SUPABASE_KEY is a SECRET key" | The secret key was pasted | Replace it with the publishable one (Step 1, point 2), Step 3 again |
| "Wrong staff key — click Share again to retype it." | The key typed is not the one in the database | Get it again (Check B), click Share link again |
| The link says "This link no longer opens a flat." | The link was copied incompletely, or turned off | Copy the whole link again, or make a new one |
| "The flat could not be fetched." | No internet, or the database is not set up on this site | Check the connection; then the values above |
| `verify-share.mjs` shows a `FAIL` line | Something in the database setup is off | Copy the whole output and give it to Claude; do not fix the database by hand |
| The Change list is empty after a buyer wrote a note | The buyer was on a `/u/…` page, not a share link | Only links that start with `/s/` are recorded: use **Share link** |

## Rules that keep the data safe

- Only ever put the **publishable** key on Vercel. The **secret** key (`sb_secret_…`, `service_role`) bypasses every
  protection: never copy it anywhere.
- The **staff key** stays in your password manager: not on Vercel, not in `.env.local`, not in a chat, not in git.
- Never add `.env.local` to the project's history (a git commit). It is set to be skipped; leave it so.

## If you change the Supabase key later

Put the new value in `.env.local` (for your own computer) and in Vercel (Settings → Environment Variables → the ⋯ beside
`SUPABASE_KEY` → **Edit** → paste → **Save**), then Step 3 and Step 4.
