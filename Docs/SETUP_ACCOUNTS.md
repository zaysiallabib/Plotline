# Turning on accounts — one sitting

For the founder, rewritten 2026-11-20 (session 31). No earlier knowledge needed. About 25 minutes, once. Do the steps in
order; each says what you click and what you should see. Every SQL step is safe to run twice.

**Already pasted the setup file earlier (session 30)?** Paste it again (Step 1) and run the check again (Step 2): it adds
the new parts (members, plan pictures, the links list) and changes nothing you already have.

## What you get

- **Staff sign in with their email.** No password: they type their email, get a link, click it.
- **Their Studio work is saved online as they work**, for their company — **with the plan pictures**, so a colleague
  who opens a project sees the sheet under the walls. **Every save is kept**: an older save can always be opened again.
- **Owners add and remove their own people in the Studio** (account card → **Members**). You never paste SQL for that;
  you only make each new company's first owner (Step 6).
- **Every buyer link of a project in one list** (account card → **Links**): who made it, when, how often buyers opened
  it, and **Turn off**.
- **Your own furniture, finishes and textures for the whole company.** A model or a finish option a staff member adds
  (Docs/MANUAL.md, "Your own furniture, finishes and textures") is there for every colleague, and the buyer links
  that show it draw it.
- **Each developer company sees only its own** projects, pictures, people, buyer links and buyer notes. The database
  itself refuses anything else, and a check you run (Step 2) proves it.
- **Buyer links keep working with no account**, as before. Buyers never see a plan picture.
- Not signed in, or the database missing: the Studio works exactly as before, in this browser only.

## Words used here

| Word | Meaning |
|---|---|
| Company | One developer you work with (BTI, Sheltech…). Its people see its work, nobody else's. |
| Owner / staff | People in a company. Staff do the work (trace, save, share). An owner can also invite and remove people. A company always keeps at least one owner. |
| Invite | An owner types a colleague's email in the Studio. That person joins the company the first time they sign in with that email. |
| Magic link | The sign-in link Plotline emails. It works once, for a short time, and only in the browser where the email was typed. |
| SQL editor | The page in Supabase where you paste database text and press **Run**. |
| SQL | The short typed instructions the database understands. You never write any: you paste what is given here and press **Run**. |
| Two-tenant check | A test that makes two pretend companies ("tenant" = company) and proves one cannot reach the other. It removes everything it made. |
| Storage, bucket | Supabase's place for files. A bucket is one folder of it; Plotline has two: **plans** (the plan pictures) and **library** (your staff's own furniture models and texture pictures). |
| SMTP | The standard way a program sends email. An email service gives you its SMTP details to paste into Supabase. |
| Key (publishable / secret) | A long code that lets a program talk to the database. The **publishable** one is safe in a website. The **secret** one is the master key and must never be shown to anyone. |

## Before you start

1. You can log in to https://supabase.com and open the **Plotline** project (its address contains `qhrtjf`). There is
   another project on the same account (`txbt…`) that belongs to a different app: **never run Plotline SQL there.**
2. The live site has the two database values (Docs/SETUP_SUPABASE_ON_VERCEL.md). If **⋯ → Share link** shows in the live
   Studio, this is done.
3. The site is built from the new code (deployed after this change).

## Step 1 — Paste the database part (3 minutes)

1. Supabase → the Plotline project → left side **SQL Editor** → **New query**. You see an empty text box with a
   **Run** button at its bottom right.
2. On your computer open `E:\dev\Plotline\supabase\paste-into-sql-editor.sql` with Notepad. Press **Ctrl+A**, then
   **Ctrl+C**.
3. Click in the Supabase text box, press **Ctrl+V** (a long text appears), then click **Run**.
4. Under the box you see a small table with one row: **Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2 (the
   security check).**

The file holds every database part in order: share links, the change list, accounts, members and plan pictures, your
own library. The parts that are already there are left as they are: your old staff key and old links keep working.

## Step 2 — Run the security check (2 minutes)

1. SQL Editor → **New query**.
2. Open `E:\dev\Plotline\supabase\tests\two_tenants.sql` in Notepad, **Ctrl+A**, **Ctrl+C**, paste into the box,
   **Run**.
3. Under the box you must see one row: **All two-tenant checks passed**.

It makes two pretend companies and checks — the same way the website reaches the database — that one cannot read,
change or add to the other's projects, save history, plan pictures, own library, people, links or buyer notes; that only an owner
invites or removes people, never themself, never the last owner; that an invite joins only its own email; that a buyer
reads nothing; and that a turned-off link opens nothing. Then it undoes everything it made.

If it shows a red message starting with **FAIL:**, stop here, copy the whole message and give it to Claude.

## Step 3 — Look at the two file folders (1 minute, nothing to change)

Supabase → left side **Storage**. In the list of buckets you see **plans**, marked **Private**. That is where the
Studio puts the plan pictures, one folder per company. Leave its settings as they are (private, 10 MB a picture, PNG,
JPG and WEBP only). Do not make it public: the plan pictures are your customers' drawings.

Next to it you see **library**, marked **Public**. That is where the Studio puts your staff's own furniture models and
texture pictures, one folder per company. Leave it as it is (public, 30 MB a file, GLB models, JPG and PNG pictures):
a buyer link has no account, and it must still draw the sofa or the tile it was shared with. Nobody can list what is
in it; a file is fetched only by its exact name, which appears only in a link that shows it.

## Step 4 — Tell Supabase where sign-in links may go (2 minutes)

1. Supabase → left side **Authentication** → **URL Configuration**. You see a box named **Site URL** and a list named
   **Redirect URLs**.
2. **Site URL**: `https://plotline-flax.vercel.app` → **Save**.
3. **Redirect URLs** → **Add URL**: `https://plotline-flax.vercel.app/studio` → **Save**. Add
   `http://localhost:5173/studio` too (for Plotline running on your own computer).

Why: a sign-in link can only bring someone back to an address on this list. Nobody can make a Plotline sign-in link
that sends your staff to another site.

## Step 5 — Emails to people other than you (10 minutes; needed before anyone else signs in)

Supabase's own email service only sends to the people in **your Supabase team**, a couple of emails an hour. Enough
for you alone. For a developer's staff, give Supabase a free email sender:

1. Make a free account with an email-sending service: **Brevo** (brevo.com) or **Resend** (resend.com — needs a web
   address of your own). Check their free limits on their pages; a few hundred emails a day is plenty.
2. In that service find its **SMTP** details: host, port, user name, password (sometimes called an SMTP key), and set
   the sender address (for example `login@yourcompany.com`).
3. Supabase → **Authentication** → **Emails** → **SMTP Settings** → turn on **custom SMTP**, fill in those details →
   **Save**.
4. Test: sign in on the Studio with an address that is not in your Supabase team (Step 6, point 1).

## Step 6 — Make yourself the owner of your company (3 minutes)

1. Open https://plotline-flax.vercel.app/studio. Top right **⋯** → **Sign in** → type your email → **Send me a link**.
   It says **Check your email**.
2. Open the email **on the same computer, in the same browser**, and click the link. The Studio opens signed in. Next
   to the drawing's name it says **Not saved: not in a company yet** — expected.
3. Supabase → SQL Editor → **New query** → paste this one line with your company's name and **your** email, then
   **Run**:
   ```sql
   select private.add_member('Plotline', 'you@example.com', 'owner');
   ```
   The answer: **Done: you@example.com is owner of Plotline** (the company is made the first time its name is used).
4. Back in the Studio press **F5**. **⋯** → your email: the card shows your company, and three parts: **Projects**,
   **Members**, **Links**. Change anything in the drawing: the word next to its name goes **Saving…**, then
   **Saved · just now**.

**A new developer company** (a real customer): their first owner signs in once (point 1–2, on their computer), then you
run the same line with their company's name and their email, for example
`select private.add_member('BTI', 'their.owner@bti.com', 'owner');`. From then on they invite their own people.

## Step 7 — Give your old links to your company (1 minute, once)

Links made before accounts (with the staff key) belong to no company. So that they show in the Change list and in
**Links** when you are signed in, run once:

```sql
select private.adopt_old_links('Plotline');
```

The answer is how many links moved.

## Done. Every day after this — no SQL

**Adding a colleague** (an owner does it):

1. Studio → **⋯** → your email → **Members**.
2. Under **Invite someone**: their work email, **Staff** or **Owner**, **Invite**.
3. Tell them (the card's **Copy this for them** copies the words): open the Studio, **⋯** → **Sign in**, use that email.
   They are in the company as soon as they sign in. (Step 5 must be done, or the email never reaches them.)

**Removing someone** (they left): **Members** → **Remove** beside their name. They keep their account but reach nothing
of the company's; everything they saved stays. Nobody can remove themself, and a company always keeps one owner.

**Making someone owner or staff**: **Members** → **Make owner** / **Make staff**.

**A buyer link that should stop working**: open the project in the Studio → your email → **Links** → **Turn off**. The
buyer is told the flat is not available; what they wrote stays in the Change list.

## Later, when everyone signs in — turn off the old staff key

```sql
delete from private.config where key = 'staff_key';
```

From then on **Share link** and the **Change list** work only for people signed in. Do this before a second developer
company gets accounts.

## How full is it?

The free plan holds **500 MB of database** and **1 GB of files**. Every save is kept as a full copy (one floor drawing
is about 20–80 KB stored; a busy day of tracing can make a few hundred saves). A plan picture is stored once, however
many times it is saved (0.1–3 MB a sheet). To see both, paste and **Run**:

```sql
select pg_size_pretty(pg_total_relation_size('public.project_versions')) as save_history,
       pg_size_pretty(pg_database_size(current_database())) as database,
       (select pg_size_pretty(coalesce(sum((metadata ->> 'size')::bigint), 0)) from storage.objects where bucket_id = 'plans') as plan_pictures;
```

When **database** passes 400 MB or **plan_pictures** passes 800 MB, tell Claude: the choices are Supabase Pro ($25 a
month, 8 GB database, 100 GB files) or keeping only one save an hour for saves older than a month.

## Bringing back a deleted project

**Delete** in the Studio only hides a project; all its saves stay. To bring it back:

```sql
update public.projects set deleted_at = null where name = 'Banani tower';
```

## If something is wrong

| What you see | Why | What to do |
|---|---|---|
| No **Sign in** under **⋯** in the live Studio | The site was built without the database values, or not rebuilt since this change | Docs/SETUP_SUPABASE_ON_VERCEL.md, then deploy |
| **Check your email** but no email comes | Step 5 not done (only your Supabase team gets emails), the couple-an-hour limit, or spam | Do Step 5; wait a few minutes; look in spam |
| **Too many emails asked for** | Supabase allows one link a minute per address | Wait a minute |
| The link opens Plotline but you are not signed in | The link was opened in another browser or on another device | Ask for a new link and open it where you typed your email |
| **Not saved: not in a company yet** | Nobody invited this email, or it was invited with a different spelling | An owner invites that exact email (Members), then F5. A company's first owner: Step 6 |
| **Members** says **Could not read the members** | Step 1 was pasted before this change | Paste Step 1 again, run Step 2 |
| A colleague sees the walls but no plan picture | The picture was dropped while signed out (it stays in that browser), or Step 1 is the old one | The person who has it opens the drawing once while signed in (it goes up by itself); else paste Step 1 again |
| **Someone else saved** (red) | Two people — or two tabs — changed the same project at once; the second save was not put over the first | Click the word: **Open theirs** (their copy replaces yours here) or **Keep mine** (yours becomes the newest; theirs stays under **Earlier saves**) |
| **Offline · will retry** | No internet | Keep working; it saves by itself when the internet is back |
| The two-tenant check shows **FAIL: …** | Something in the database setup is off | Stop; give the whole message to Claude |

## Rules that keep the data safe

- Only the **publishable** key is on Vercel and in the website. Never copy the **secret** key (`sb_secret_…` /
  `service_role`) anywhere: it bypasses every protection. The build refuses it.
- A company and its first owner are made **only** in the SQL editor, by you. After that only that company's owners can
  add people to it — nobody can add themself to a company, and an invite works only for the person who can open that
  email.
- The **plans** folder stays **Private**. Nothing in it can be changed or deleted from the website, so every old save
  still shows the picture it was traced on.
- The **library** folder stays **Public**: a buyer link needs to draw your own sofa and your own tile. Public here means
  "readable by its exact name" — the name is your company's random code plus the file's own fingerprint, so only
  someone holding a link that shows that very piece can fetch it, and nobody outside your company can list the folder.
  Nothing in it can be changed or deleted from the website.
- Anyone can create an account by asking for a sign-in link; an account in no company reaches nothing. To stop even
  that: Authentication → **Sign In / Providers** → turn off **Allow new users to sign up**. Invited people then need an
  account first: Authentication → **Users** → **Invite user** with their email (the Studio's invite still decides the
  company).
- What a buyer link can reach, and the rest of the security story in plain words: ARCHITECTURE.md, "Security".
