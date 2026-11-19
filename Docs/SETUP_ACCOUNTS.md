# Turning on accounts: signing in, saving to the cloud, one space per company

Written 2026-11-20 for the founder. No earlier knowledge needed. About 20 minutes the first time.
Do the steps in order. Every SQL step is safe to run twice.

## What this gives you

- **Staff sign in with their email.** No password: they type their email, get a link, click it.
- **Their Studio work is saved in the database as they work** (2 seconds after they stop), for their
  company. **Every save is kept**: an older save can always be opened again.
- **Each developer company sees only its own** projects, buyer links and buyer notes. Company A can
  never see, change or add to company B's — the database itself refuses it, and a check you run
  (Step 2) proves it.
- **Buyer links keep working with no account**, as before. A link can now be **turned off**.
- Not signed in, or the database missing: the Studio works exactly as before, in this browser only.

## Words used here

| Word | Meaning |
|---|---|
| Company (org) | One developer you work with (BTI, Sheltech…). Its people see its work, nobody else's. |
| Owner / staff | People in a company. Today both work the same in the Studio; the owner is the one who asks you to add or remove people. |
| Magic link | The sign-in link Plotline emails. It works once, for a short time, and only in the browser where the email was typed. |
| SQL editor | The page in Supabase where you paste database text and press **Run**. |
| Two-tenant check | A test that makes two pretend companies and proves one cannot reach the other. It removes everything it made. |

## Before you start

1. You can log in to https://supabase.com and open the **Plotline** project (its address contains
   `qhrtjf`). There is another project on the same account (`txbt…`) that belongs to a different
   app: **never run Plotline SQL there.**
2. The live site already has the two database values (Docs/SETUP_SUPABASE_ON_VERCEL.md). If **Share
   link** shows in the live Studio, this is done.
3. The site is built from the new code (deployed after this change).

## Step 1 — Paste the database part

1. Supabase → the Plotline project → left side **SQL Editor** → **New query**.
2. On your computer open `E:\dev\Plotline\supabase\paste-into-sql-editor.sql` with Notepad.
   Press Ctrl+A, then Ctrl+C.
3. Click in the Supabase query box, Ctrl+V, then **Run** (bottom right).
4. The result is one row: **Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2 (the security check).**

The file holds all three database parts in order (share links, the change list, accounts). The two
older parts are already there from October: running them again changes nothing, and your old staff
key and old links keep working.

## Step 2 — Run the security check

1. SQL Editor → **New query**.
2. Open `E:\dev\Plotline\supabase\tests\two_tenants.sql` in Notepad, Ctrl+A, Ctrl+C, paste, **Run**.
3. The result must be one row: **All two-tenant checks passed**.

It makes two pretend companies with one person each, and checks — the same way the website reaches
the database — that one cannot read, change or add to the other's projects, save history, links or
buyer notes; that a buyer reads no table; and that a turned-off link opens nothing. Then it undoes
everything it made.

If it shows a red error starting with **FAIL:** — stop here, copy the whole message and give it to
Claude. Do not go on.

## Step 3 — Tell Supabase where sign-in links may go

1. Supabase → left side **Authentication** → **URL Configuration**.
2. **Site URL**: `https://plotline-flax.vercel.app` → **Save**.
3. **Redirect URLs** → **Add URL**: `https://plotline-flax.vercel.app/studio` → **Save**.
   Add `http://localhost:5173/studio` too (for Plotline running on your own computer).

Why: a sign-in link can only bring someone back to an address on this list. Nobody can make a
Plotline sign-in link that sends your staff to another site.

## Step 4 — Emails to people other than you (needed before you add staff)

Supabase's own email service only sends to the people in **your Supabase team**, and only a couple
of emails an hour. That is enough for you alone. For staff of a developer company, give Supabase a
free email sender:

1. Make a free account with an email-sending service. Two with a free plan: **Brevo** (brevo.com) or
   **Resend** (resend.com — needs a web address (domain) of your own). Check their free limits on
   their pages; a few hundred emails a day is plenty.
2. In that service, find its **SMTP** details: host, port, user name, password (sometimes called an
   SMTP key), and set the sender address (for example `login@yourcompany.com`).
3. Supabase → **Authentication** → **Emails** → **SMTP Settings** → turn on **custom SMTP** and fill
   in those details → **Save**.
4. Test: sign in on the Studio with an address that is not in your Supabase team (Step 5, point 1).

## Step 5 — Make yourself the owner of your company

1. Open https://plotline-flax.vercel.app/studio. Top right: **Sign in** → type your email → **Send me
   a link**. It says **Check your email**.
2. Open the email **on the same computer, in the same browser**, and click the link. The Studio opens
   with your email at the top right. Next to it: **Not saved: not in a company yet** — expected.
3. Supabase → SQL Editor → New query → paste this one line, with your company's name and **your**
   email, then **Run**:
   ```sql
   select private.add_member('Plotline', 'you@example.com', 'owner');
   ```
   The answer: **Done: you@example.com is owner of Plotline**. (The company is made the first time
   its name is used.)
4. Back in the Studio press **F5**. Click your email (top right): it shows your company and
   **Projects in the cloud**. Change anything: the word next to it goes **Saving…** then **Saved**.

One company per developer customer. For a real customer, make their own, e.g.
`select private.add_member('BTI', 'their.owner@bti.com', 'owner');` — after that person has signed
in once.

## Step 6 — Give your old links to your company (once)

Links made before accounts (with the staff key) belong to no company. So the Change list shows them
when you are signed in, run once:

```sql
select private.adopt_old_links('Plotline');
```

The answer is how many links moved.

## Adding a staff member

1. They open the Studio, **Sign in** with their work email, and click the link in their email.
   (Step 4 must be done, or the email never arrives.)
2. You run, in the SQL editor:
   ```sql
   select private.add_member('Plotline', 'their@email.com', 'staff');
   ```
   If it says **No account with that email yet**, they have not finished point 1.
3. They press **F5** in the Studio.

**Removing someone** (they left the company):

```sql
delete from public.org_members where user_id = (select id from auth.users where email = 'their@email.com');
```

Their account then reaches nothing. Everything they saved stays with the company.

## Turning off the old staff key (when everyone signs in)

```sql
delete from private.config where key = 'staff_key';
```

From then on **Share link** and the **Change list** work only for people signed in. Do this before a
second developer company gets accounts.

## How full is the database?

The free plan holds 500 MB. Every save is kept as a full copy (one floor drawing is roughly 20–80 KB
once stored; a busy day of tracing can make a few hundred saves). To see the size:

```sql
select pg_size_pretty(pg_total_relation_size('public.project_versions')) as save_history,
       pg_size_pretty(pg_database_size(current_database())) as everything;
```

When **everything** passes 400 MB, tell Claude: the choices are Supabase Pro ($25 a month, 8 GB) or
keeping only one save an hour for saves older than a month.

## Bringing back a deleted project

**Delete** in the Studio only hides a project; all its saves stay. To bring it back:

```sql
update public.projects set deleted_at = null where name = 'Banani tower';
```

## If something is wrong

| What you see | Why | What to do |
|---|---|---|
| No **Sign in** in the live Studio | The site was built without the database values, or not rebuilt since this change | Docs/SETUP_SUPABASE_ON_VERCEL.md, then deploy |
| **Check your email** but no email comes | Step 4 not done (only your Supabase team gets emails), or the couple-an-hour limit, or spam | Do Step 4; wait a few minutes; look in spam |
| **Too many emails asked for** | Supabase allows one link a minute per address | Wait a minute |
| The link opens Plotline but you are not signed in | The link was opened in another browser or on another device | Ask a new link and open it where you typed your email |
| **Not saved: not in a company yet** | Nobody added this account to a company | Step 5 point 3 (or "Adding a staff member"), then F5 |
| **No account with that email yet** (SQL) | That person never clicked a sign-in link | They sign in once first |
| **Not saved: someone saved a newer version** | Two people changed the same project at once | Click your email (top right): **Open theirs** (their copy replaces yours here) or **Keep mine** (yours becomes the newest; theirs stays under **Earlier saves**) |
| **Offline, will retry** | No internet | Keep working; it saves by itself when the internet is back |
| The two-tenant check shows **FAIL: …** | Something in the database setup is off | Stop; give the whole message to Claude |

## Rules that keep the data safe

- Only the **publishable** key is on Vercel and in the website. Never copy the **secret** key
  (`sb_secret_…` / `service_role`) anywhere: it bypasses every protection. The build refuses it.
- Companies and members are added **only** in the SQL editor, by you. Nobody can add themselves to a
  company from the website.
- Anyone can create an account by asking for a sign-in link; an account in no company reaches
  nothing. To stop even that: Authentication → **Sign In / Providers** → turn off **Allow new users
  to sign up**, and invite people from **Authentication → Users → Invite user** instead.
- What a buyer link can reach, and the rest of the security story in plain words: ARCHITECTURE.md,
  "Security".
