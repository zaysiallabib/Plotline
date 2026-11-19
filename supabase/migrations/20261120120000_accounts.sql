-- Accounts, Phase A (session 30, 2026-11-20): every developer company is an org; its staff sign in with an email
-- magic link (Supabase Auth: no passwords to leak) and save their Studio work here; every save is kept.
-- The founder pastes supabase/paste-into-sql-editor.sql (all three migrations, in order): Docs/SETUP_ACCOUNTS.md.
-- Safe to run twice: tables `if not exists`, functions `create or replace`, each policy dropped and made again.
-- The proof: supabase/tests/two_tenants.sql (paste it after this; it changes nothing).
--
-- Who reaches what:
--  * anon = the publishable key = every visitor, every buyer: no table at all. Only unit_by_token (the one unit a
--    link was made for, while the link is on) and add_event (one note / choice on such a link).
--  * a signed-in member of a company: that company's rows only (RLS on every table). Projects: read, create, save
--    (a save must name the version it started from; the database stamps the next one and keeps a copy in
--    project_versions itself). History, links, events: read only. Links are made / turned off through share_unit /
--    revoke_link, which check the membership; their tokens are 128 random bits made here, never by a browser.
--  * a signed-in person in no company: nothing (an account alone reaches no row).
--  * nobody through the website: companies and members. The founder adds them in the SQL editor (private.add_member).
--  * the old staff key (Phase 0): only the links made with it before accounts (no company). Delete it when everyone
--    signs in: `delete from private.config where key = 'staff_key';` - the old functions then refuse every call.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- tables

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- owner: adds and removes staff (in the SQL editor today); staff: everything else
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists org_members_user on public.org_members (user_id);

-- a Studio project (data = the Project: floors, drawings) or one loose drawing (data = the Unit); kind says which
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null check (length(name) between 1 and 200),
  kind text not null check (kind in ('project', 'unit')),
  -- ponytail: 5 MB a save (a 30-floor project is ~0.3 MB; plan pictures stay in the browser); Supabase Storage for them later
  data jsonb not null check (octet_length(data::text) <= 5000000),
  -- optimistic concurrency: a save names the version it started from; the trigger below makes the next one
  version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  -- Delete in the Studio only hides it: its history stays (nothing is lost; the founder can bring it back)
  deleted_at timestamptz
);
create index if not exists projects_org on public.projects (org_id, updated_at desc);

-- every save, as it was saved; written by the database itself (projects_history), never changed (append-only)
-- ponytail: a full copy per save (~20-80 KB stored for a floor drawing); watch the size (SETUP_ACCOUNTS.md) near 500 MB
create table if not exists public.project_versions (
  project_id uuid not null references public.projects (id),
  version integer not null,
  org_id uuid not null references public.orgs (id),
  name text not null,
  data jsonb not null,
  deleted boolean not null default false,
  saved_by uuid,
  saved_at timestamptz not null default clock_timestamp(),
  primary key (project_id, version)
);

-- share links (session 17) belong to a company now; old ones have none until private.adopt_old_links gives them one
alter table public.units add column if not exists org_id uuid references public.orgs (id);
alter table public.share_links add column if not exists org_id uuid references public.orgs (id);
alter table public.share_links add column if not exists project_id uuid references public.projects (id);
alter table public.share_links add column if not exists stem text check (length(stem) <= 200);
alter table public.share_links add column if not exists floor integer;
alter table public.share_links add column if not exists created_by uuid;
alter table public.share_links add column if not exists revoked_at timestamptz;
-- 128 random bits (was gen_random_uuid: 122); still a uuid, so every old link and the events' key stay as they are
alter table public.share_links alter column token set default (encode(extensions.gen_random_bytes(16), 'hex'))::uuid;
create index if not exists share_links_org on public.share_links (org_id, created_at desc);

-- the database keeps the score: versions, who saved, history

create or replace function private.projects_stamp ()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    -- a browser cannot move a project to another company, pick its own version number or rewrite who made it
    new.id := old.id;
    new.org_id := old.org_id;
    new.kind := old.kind;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;
create or replace trigger projects_stamp before insert or update on public.projects for each row execute function private.projects_stamp ();

-- security definer: members cannot write project_versions themselves; this is the only way a row gets there
create or replace function private.projects_history ()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.project_versions (project_id, version, org_id, name, data, deleted, saved_by)
  values (new.id, new.version, new.org_id, new.name, new.data, new.deleted_at is not null, new.updated_by);
  return null;
end
$$;
create or replace trigger projects_history after insert or update on public.projects for each row execute function private.projects_history ();

create or replace function private.append_only ()
  returns trigger
  language plpgsql
as $$
begin
  raise exception '% is append-only: nothing in it is ever changed or removed', tg_table_name using errcode = '55000';
end
$$;
create or replace trigger project_versions_append_only before update or delete on public.project_versions for each row execute function private.append_only ();
-- a project row is never removed either (Delete hides it): its history keeps pointing at it
create or replace trigger projects_no_delete before delete on public.projects for each row execute function private.append_only ();

-- privileges: the website's roles get only what they use

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.units enable row level security;
alter table public.share_links enable row level security;
alter table public.events enable row level security;

revoke all on public.orgs, public.org_members, public.projects, public.project_versions, public.units, public.share_links, public.events from anon, authenticated;
revoke all on private.config from public, anon, authenticated;
grant select on public.orgs, public.org_members, public.projects, public.project_versions, public.units, public.share_links, public.events to authenticated;
-- the columns a browser may write; everything else (version, who, when) the trigger sets
grant insert (org_id, name, kind, data) on public.projects to authenticated;
grant update (name, data, deleted_at) on public.projects to authenticated;

-- row level security: a member sees and writes their own company's rows, nothing else
-- (select auth.uid()) is read once per statement (Supabase's advice); a member sees only their own membership rows, so
-- the other policies can ask org_members without recursion

drop policy if exists "a member sees their own memberships" on public.org_members;
create policy "a member sees their own memberships" on public.org_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "members see their company" on public.orgs;
create policy "members see their company" on public.orgs for select to authenticated
  using (id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

drop policy if exists "members read their company's projects" on public.projects;
create policy "members read their company's projects" on public.projects for select to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members add projects to their company" on public.projects;
create policy "members add projects to their company" on public.projects for insert to authenticated
  with check (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members save their company's projects" on public.projects;
create policy "members save their company's projects" on public.projects for update to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

drop policy if exists "members read their company's history" on public.project_versions;
create policy "members read their company's history" on public.project_versions for select to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

drop policy if exists "members read their company's links" on public.share_links;
create policy "members read their company's links" on public.share_links for select to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

drop policy if exists "members read their company's shared units" on public.units;
create policy "members read their company's shared units" on public.units for select to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

drop policy if exists "members read their company's events" on public.events;
create policy "members read their company's events" on public.events for select to authenticated
  using (token in (select s.token from public.share_links s where s.org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid()))));

-- buyers (no account): a link opens its unit and takes notes only while it is on

create or replace function public.unit_by_token (p_token uuid)
  returns jsonb
  language sql
  security definer
  set search_path = ''
  stable
as $$
  select u.json from public.share_links s join public.units u on u.id = s.unit_id where s.token = p_token and s.revoked_at is null
$$;

-- an unknown or turned-off link is refused (400): the buyer's outbox drops the row
-- ponytail: no rate limit per link (8 KB a row); a spammed link is turned off with revoke_link
create or replace function public.add_event (p_id uuid, p_token uuid, p_kind text, p_ref text, p_buyer text, p_name text, p_payload jsonb)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from public.share_links s where s.token = p_token and s.revoked_at is null) then
    raise exception 'no such link, or it was turned off' using errcode = '22023';
  end if;
  insert into public.events (id, token, kind, ref, buyer, name, payload)
  values (p_id, p_token, p_kind, p_ref, p_buyer, nullif(trim(p_name), ''), p_payload)
  on conflict (id) do nothing;
  return p_id;
end
$$;

-- members: make a link, turn one off, read the change list

create or replace function public.share_unit (p_org uuid, p_unit jsonb, p_project uuid default null, p_stem text default null, p_floor integer default null)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_unit uuid;
  v_token uuid;
begin
  if v_me is null or not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = v_me) then
    raise exception 'not a member of this company' using errcode = '42501';
  end if;
  if p_project is not null and not exists (select 1 from public.projects p where p.id = p_project and p.org_id = p_org) then
    raise exception 'no such project in this company' using errcode = '42501';
  end if;
  if octet_length(p_unit::text) > 5000000 then
    raise exception 'this drawing is too large to share' using errcode = '54000';
  end if;
  insert into public.units (name, json, org_id)
  values (left(coalesce(nullif(trim(p_unit ->> 'name'), ''), 'Untitled unit'), 200), p_unit, p_org)
  returning id into v_unit;
  insert into public.share_links (unit_id, org_id, project_id, stem, floor, created_by)
  values (v_unit, p_org, p_project, left(p_stem, 200), p_floor, v_me)
  returning token into v_token;
  return v_token;
end
$$;

-- true = turned off now; false = no such link in your company, or it was off already (never turned back on: make a new one)
create or replace function public.revoke_link (p_token uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.share_links s set revoked_at = now()
  where s.token = p_token and s.revoked_at is null
    and s.org_id in (select m.org_id from public.org_members m where m.user_id = auth.uid());
  return found;
end
$$;

-- the change list of the caller's company, the shape events_for_staff gives; security invoker = the policies above decide
create or replace function public.events_for_org ()
  returns jsonb
  language sql
  security invoker
  set search_path = ''
  stable
as $$
  select jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('token', s.token, 'unit_name', u.name, 'created_at', s.created_at, 'revoked_at', s.revoked_at) order by s.created_at desc)
      from public.share_links s join public.units u on u.id = s.unit_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id)
      from (
        select ev.*, row_number() over (partition by ev.token, ev.kind, ev.ref order by ev.created_at desc, ev.id) > 1 as superseded
        from public.events ev
      ) e), '[]'::jsonb))
$$;

-- the old staff key (Phase 0): only links with no company; `is distinct from` = a deleted key refuses everything

create or replace function public.publish_unit (p_unit jsonb, p_key text)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_unit uuid;
  v_token uuid;
begin
  if p_key is null or p_key is distinct from (select c.value from private.config c where c.key = 'staff_key') then
    raise exception 'wrong staff key' using errcode = '28000';
  end if;
  insert into public.units (name, json) values (coalesce(p_unit ->> 'name', 'Untitled unit'), p_unit) returning id into v_unit;
  insert into public.share_links (unit_id) values (v_unit) returning token into v_token;
  return v_token;
end
$$;

create or replace function public.events_for_staff (p_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  stable
as $$
begin
  if p_key is null or p_key is distinct from (select c.value from private.config c where c.key = 'staff_key') then
    raise exception 'wrong staff key' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('token', s.token, 'unit_name', u.name, 'created_at', s.created_at, 'revoked_at', s.revoked_at) order by s.created_at desc)
      from public.share_links s join public.units u on u.id = s.unit_id where s.org_id is null), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id)
      from (
        select ev.*, row_number() over (partition by ev.token, ev.kind, ev.ref order by ev.created_at desc, ev.id) > 1 as superseded
        from public.events ev join public.share_links s on s.token = ev.token where s.org_id is null
      ) e), '[]'::jsonb));
end
$$;

-- who may call what (Supabase lets anon call every new public function unless told otherwise)

revoke all on function public.unit_by_token (uuid), public.add_event (uuid, uuid, text, text, text, text, jsonb), public.publish_unit (jsonb, text), public.events_for_staff (text) from public;
-- a signed-in staff member opening a buyer link is `authenticated`, not anon: both may
grant execute on function public.unit_by_token (uuid), public.add_event (uuid, uuid, text, text, text, text, jsonb), public.publish_unit (jsonb, text), public.events_for_staff (text) to anon, authenticated;
revoke all on function public.share_unit (uuid, jsonb, uuid, text, integer), public.revoke_link (uuid), public.events_for_org () from public, anon;
grant execute on function public.share_unit (uuid, jsonb, uuid, text, integer), public.revoke_link (uuid), public.events_for_org () to authenticated;

-- the founder's tools, SQL editor only (schema private is not on the website)

-- select private.add_member('Company name', 'person@example.com', 'owner');  -- or 'staff'
-- makes the company the first time; the person must have signed in once (Studio -> Sign in) so their account exists
create or replace function private.add_member (p_org_name text, p_email text, p_role text default 'staff')
  returns text
  language plpgsql
  set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_user is null then
    -- (the email is not repeated here: error messages land in the database log)
    raise exception 'No account with that email yet: ask them to open the Studio, click Sign in and use the link once, then run this again';
  end if;
  insert into public.orgs (name) values (trim(p_org_name)) on conflict (name) do nothing;
  select o.id into v_org from public.orgs o where o.name = trim(p_org_name);
  insert into public.org_members (org_id, user_id, role) values (v_org, v_user, p_role)
  on conflict (org_id, user_id) do update set role = excluded.role;
  return format('Done: %s is %s of %s', p_email, p_role, trim(p_org_name));
end
$$;

-- select private.adopt_old_links('Company name');  -- once: the links made with the old staff key join that company
create or replace function private.adopt_old_links (p_org_name text)
  returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  v_org uuid;
  v_n integer;
begin
  select o.id into v_org from public.orgs o where o.name = trim(p_org_name);
  if v_org is null then
    raise exception 'No company with that name: run private.add_member first';
  end if;
  update public.units set org_id = v_org where org_id is null;
  update public.share_links set org_id = v_org where org_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;
revoke all on function private.add_member (text, text, text), private.adopt_old_links (text) from public;

select 'Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2 (the security check).' as result;
