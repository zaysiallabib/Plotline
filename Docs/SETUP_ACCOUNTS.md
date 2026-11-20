# Turning on accounts — one sitting

For the founder. No earlier knowledge needed. About 25 minutes, once. Do the steps in order; each says what you click,
what you should see, and what to do if you do not. Every SQL step is safe to run twice.

**Pasted the setup file before (session 30)?** Paste it again (Step 1) and run the check again (Step 2): it adds the new
parts (members, plan pictures online, the links list, your own library) and changes nothing you already have.

## What you get

- **Staff sign in with their email** — no password: they type their email, get a link, click it.
- **Their Studio work is saved online as they work**, for their company, **with the plan pictures**, so a colleague who
  opens a project sees the sheet under the walls. **Every save is kept**: an older one can always be opened again.
- **Owners add and remove their own people in the Studio** (account card → **Members**). You only make each new
  company's first owner (Step 6).
- **Every buyer link of a project in one list** (account card → **Links**): who made it, when, how often buyers opened
  it, and **Turn off**.
- **Your staff's own furniture, finishes and textures for the whole company** (MANUAL §3), drawn in the buyer links
  that show them.
- **Each developer company sees only its own** projects, pictures, people, links and buyer notes. The database itself
  refuses anything else, and the check in Step 2 proves it.
- **Buyer links keep working with no account.** Buyers never see a plan picture.
- Not signed in, or no database: the Studio works exactly as before, in this browser only.

## Words used here

| Word | Meaning |
|---|---|
| Company | One developer you work with (BTI, Sheltech…). Its people see its work, nobody else's. |
| Owner / staff | People in a company. Staff do the work (trace, save, share); an owner can also invite and remove people. A company always keeps at least one owner. |
| Invite | An owner types a colleague's email in the Studio; that person joins the company the first time they sign in with it. |
| Magic link | The sign-in link Plotline emails. It works once, for a short time, and only in the browser where the email was typed. |
| SQL editor, SQL | The page in Supabase where you paste database instructions (SQL) and press **Run**. You never write any: you paste what is given here. |
| Two-tenant check | A test that makes two pretend companies ("tenant" = company), proves one cannot reach the other, and removes everything it made. |
| Storage, bucket | Supabase's place for files; a bucket is one folder. Plotline has two: **plans** (plan pictures) and **library** (your staff's own models and texture pictures). |
| SMTP | The standard way a program sends email. An email service gives you its SMTP details to paste into Supabase. |
| Key (publishable / secret) | A code that lets a program talk to the database. The **publishable** one is safe in a website; the **secret** one is the master key and is never shown to anyone. |

## Before you start

1. You can log in to https://supabase.com and open the **Plotline** project (its address contains `qhrtjf`). The other
   project on the account (`txbt…`) belongs to a different app: **never run Plotline SQL there.**
2. The live site has the two database values: in the live Studio, **⋯** shows **Share link** under Buyers. If not, do
   [SETUP_SUPABASE_ON_VERCEL.md](SETUP_SUPABASE_ON_VERCEL.md) first.
3. The live site runs the session 31 code (the branch `s31/redesign` merged and deployed). Until then **⋯** shows no
   **Sign in**.

## Step 1 — Paste the database part (3 minutes)

1. Supabase → the Plotline project → **SQL Editor** (left side) → **New query**. An empty text box opens with **Run** at
   its bottom right.
2. On your computer open `E:\dev\Plotline\supabase\paste-into-sql-editor.sql` with Notepad, **Ctrl+A**, **Ctrl+C**.
3. Click in the Supabase box, **Ctrl+V** (a long text appears), **Run**.

**You should see** under the box a small table with one row: **Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2
(the security check).**
**If not:** a red error names the line. Make sure you pasted the whole file (Ctrl+A first) into the `qhrtjf` project,
then **Run** again; still red — copy the message and give it to Claude.

The file holds every database part in order: share links, the change list, accounts, members and plan pictures, your own
library. Parts already there are left as they are: your old staff key and old links keep working.

## Step 2 — Run the security check (2 minutes)

1. SQL Editor → **New query**.
2. Open `E:\dev\Plotline\supabase\tests\two_tenants.sql` in Notepad, **Ctrl+A**, **Ctrl+C**, paste into the box,
   **Run**.

**You should see** one row: **All two-tenant checks passed**.
**If not:** a red message starting with **FAIL:** — stop here, copy the whole message and give it to Claude.

It checks, the same way the website reaches the database, that one company cannot read, change or add to the other's
projects, save history, plan pictures, own library, people, links or buyer notes; that only an owner invites or removes
people (never themself, never the last owner); that an invite joins only its own email; that a buyer reads nothing; and
that a turned-off link opens nothing. Then it undoes everything it made.

## Step 3 — Look at the two file folders (1 minute, nothing to change)

Supabase → **Storage** (left side).

**You should see** two buckets:
- **plans**, marked **Private** — the plan pictures, one folder per company (10 MB a picture; PNG, JPG, WEBP). Leave it
  private: they are your customers' drawings.
- **library**, marked **Public** — your staff's own models and texture pictures, one folder per company (30 MB a file;
  GLB, JPG, PNG). It must be public because a buyer link has no account and still has to draw the sofa or the tile it was
  shared with. Nobody can list what is in it; a file is fetched only by its exact name, which appears only in a link that
  shows it.

**If a bucket is missing:** Step 1 did not finish — paste it again.

## Step 4 — Tell Supabase where sign-in links may go (2 minutes)

1. Supabase → **Authentication** → **URL Configuration**. You see **Site URL** and a list **Redirect URLs**.
2. **Site URL**: `https://plotline-flax.vercel.app` → **Save**.
3. **Redirect URLs** → **Add URL**: `https://plotline-flax.vercel.app/studio` → **Save**. Add
   `http://localhost:5173/studio` too (Plotline on your own computer).

**You should see** both addresses in the Redirect URLs list.
Why: a sign-in link can only bring someone back to an address on this list, so nobody can make a Plotline sign-in link
that sends your staff to another site.

## Step 5 — Emails to people other than you (10 minutes; before anyone else signs in)

Supabase's own email service only sends to the people in **your Supabase team**, a couple of emails an hour — enough for
you alone. For a developer's staff, give Supabase a free email sender:

1. Make a free account with **Brevo** (brevo.com) or **Resend** (resend.com — needs a web address of your own). A few
   hundred emails a day is plenty; check their free limits on their pages.
2. In that service find its **SMTP** details (host, port, user name, password — sometimes called an SMTP key) and set
   the sender address (for example `login@yourcompany.com`).
3. Supabase → **Authentication** → **Emails** → **SMTP Settings** → turn on **Enable custom SMTP**, fill in the details →
   **Save**.

**You should see**, once Step 6 is done, a sign-in email arrive at an address that is not in your Supabase team.
**If not:** look in spam; check the sender address is one the email service accepted; wait a minute (one link a minute
per address).

## Step 6 — Make yourself the owner of your company (3 minutes)

1. Open https://plotline-flax.vercel.app/studio → **⋯** → **Sign in** → your email → **Send me a link**. It says **Check
   your email**.
2. Open the email **on the same computer, in the same browser**, and click the link. The Studio opens signed in; next to
   the drawing's name it says **Not saved: not in a company yet** — expected.
3. Supabase → SQL Editor → **New query** → paste this line with your company's name and **your** email → **Run**:
   ```sql
   select private.add_member('Plotline', 'you@example.com', 'owner');
   ```
   **You should see** **Done: you@example.com is owner of Plotline** (the company is made the first time its name is
   used). **If you see** "No account with that email yet": points 1–2 were not done with that exact email.
4. Back in the Studio press **F5**, then **⋯** → your email. **You should see** your company and three parts:
   **Projects**, **Members**, **Links**. Change anything in the drawing: the word next to its name goes **Saving…**, then
   **Saved · just now**.

**A new developer company** (a real customer): their first owner signs in once (points 1–2, on their computer), then you
run the same line with their company's name and email, e.g. `select private.add_member('BTI', 'their.owner@bti.com',
'owner');`. From then on they invite their own people.

## Step 7 — Give your old links to your company (1 minute, once)

Links made before accounts (with the staff key) belong to no company. So that they show in the Change list and in
**Links** when you are signed in, run once:

```sql
select private.adopt_old_links('Plotline');
```

**You should see** how many links moved.

## Done. Every day after this — no SQL

- **Adding a colleague** (an owner): Studio → **⋯** → your email → **Members** → their work email, **Staff** or
  **Owner**, **Invite**. Tell them (**Copy this for them** copies the words): open the Studio, **⋯** → **Sign in**, use
  that email. They are in as soon as they sign in (Step 5 must be done, or the email never reaches them).
- **Removing someone:** **Members** → **Remove** beside their name. They keep their account but reach nothing of the
  company's; what they saved stays. Nobody removes themself; a company always keeps one owner.
- **Owner or staff:** **Members** → **Make owner** / **Make staff**.
- **A buyer link that should stop:** open the project → your email → **Links** → **Turn off**. The buyer is told the
  flat is not available; what they wrote stays in the Change list.

## Later, when everyone signs in — turn off the old staff key

```sql
delete from private.config where key = 'staff_key';
```

From then on **Share link** and the **Change list** work only for people signed in. Do this before a second developer
company gets accounts.

## How full is it?

The free plan holds **500 MB of database** and **1 GB of files**. Every save is kept as a full copy (one floor drawing is
about 20–80 KB; a busy day of tracing makes a few hundred saves). A plan picture is stored once however often it is
saved (0.1–3 MB a sheet); your own models (1–30 MB each) share the same gigabyte. To see it, paste and **Run**:

```sql
select pg_size_pretty(pg_total_relation_size('public.project_versions')) as save_history,
       pg_size_pretty(pg_database_size(current_database())) as database,
       (select pg_size_pretty(coalesce(sum((metadata ->> 'size')::bigint), 0)) from storage.objects where bucket_id = 'plans') as plan_pictures,
       (select pg_size_pretty(coalesce(sum((metadata ->> 'size')::bigint), 0)) from storage.objects where bucket_id = 'library') as own_library;
```

When **database** passes 400 MB, or **plan_pictures** and **own_library** together pass 800 MB, tell Claude: the choices
are Supabase Pro ($25 a month, 8 GB database, 100 GB files) or keeping only one save an hour for saves older than a month.

## Bringing back a deleted project

**Delete** in the Studio only hides a project; all its saves stay. To bring one back:

```sql
update public.projects set deleted_at = null where name = 'Banani tower';
```

## If something is wrong

| What you see | Why | What to do |
|---|---|---|
| No **Sign in** under **⋯** in the live Studio | The site was built without the database values, or before the session 31 code | [SETUP_SUPABASE_ON_VERCEL.md](SETUP_SUPABASE_ON_VERCEL.md), then deploy |
| **Check your email** but no email comes | Step 5 not done (only your Supabase team gets emails), the couple-an-hour limit, or spam | Do Step 5; wait a few minutes; look in spam |
| **Too many emails asked for** | One link a minute per address | Wait a minute |
| The link opens Plotline but you are not signed in | It was opened in another browser or device | Ask for a new link and open it where you typed your email |
| **Not saved: not in a company yet** | Nobody invited this email, or with a different spelling | An owner invites that exact email (Members), then F5. A company's first owner: Step 6 |
| **Members** says **Could not read the members** | Step 1 was pasted before this version | Paste Step 1 again, run Step 2 |
| A colleague sees the walls but no plan picture | The picture was dropped while signed out (it stays in that browser), or Step 1 is the old one | The person who has it opens the drawing once while signed in (it goes up by itself); else paste Step 1 again |
| **Someone else saved** (red) | Two people — or two tabs — changed the same project at once | Click it: **Open theirs** or **Keep mine** (theirs stays under **Earlier saves**) |
| **Offline · will retry** | No internet | Keep working; it saves by itself when the internet is back |
| The two-tenant check shows **FAIL: …** | Something in the database setup is off | Stop; give the whole message to Claude |

## Rules that keep the data safe

- Only the **publishable** key is on Vercel and in the website; the build refuses a secret one. Never copy the **secret**
  key (`sb_secret_…` / `service_role`) anywhere: it bypasses every protection.
- A company and its first owner are made **only** in the SQL editor, by you. After that only that company's owners add
  people — nobody can add themself, and an invite works only for the person who can open that email.
- The **plans** folder stays **Private**; nothing in it can be changed or deleted from the website, so every old save
  still shows the picture it was traced on.
- The **library** folder stays **Public** so buyer links can draw your own sofa and tile. Public here means "readable by
  its exact name": the name is your company's random code plus the file's own fingerprint, so only someone holding a
  link that shows that piece can fetch it, and nobody can list the folder. Nothing in it can be changed or deleted from
  the website.
- Anyone can create an account by asking for a sign-in link; an account in no company reaches nothing. To stop even
  that: **Authentication** → **Sign In / Providers** → turn off **Allow new users to sign up**. Invited people then need
  an account first: **Authentication** → **Users** → **Invite user** with their email (the Studio's invite still decides
  the company).
- What a buyer link can reach, and the rest in plain words: [ARCHITECTURE.md](../ARCHITECTURE.md), "Security".
