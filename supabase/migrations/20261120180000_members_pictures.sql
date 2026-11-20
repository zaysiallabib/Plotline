-- Members, plan pictures online, the links list (session 31, 2026-11-20). Runs after the accounts migration; the founder
-- pastes supabase/paste-into-sql-editor.sql (all four, in order): Docs/SETUP_ACCOUNTS.md. Safe to run twice.
-- The proof: supabase/tests/two_tenants.sql (it covers this file too).
--
-- Who reaches what (added):
--  * an owner: invites an email (a pending row in org_invites, NOT a member yet), cancels an invite, removes a member
--    (never themself), makes a member owner or staff (never leaving the company without an owner). Staff: read the list.
--  * the invited person: their first sign-in with that email joins them (accept_invites, called by the Studio); an
--    invite is keyed by the email, so only whoever can open that inbox can use it.
--  * plan pictures: bucket `plans`, private, one folder per company (`<org id>/<sha-256>.<ext>`); members read and add
--    their own company's, nobody changes or deletes one (a saved version keeps pointing at its picture). Buyers: nothing.
--  * share links count their views (unit_by_token): opens by people outside the link's company only.
-- Why functions, not table policies, for the member rules: a policy on org_members cannot read the other rows of
-- org_members without recursion, and "not the last owner" is about other rows. RLS stays on every table and the
-- browser holds no write grant on org_members or org_invites: these functions (security definer, each checks the
-- caller's role first) are the only way in.

-- 1. members and invites

create table if not exists public.org_invites (
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- kept as typed, lower case: the sign-in compares it with the account's email the same way
  email text not null check (email = lower(trim(email)) and length(email) between 3 and 254 and email like '%_@_%'),
  role text not null check (role in ('owner', 'staff')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, email)
);
create index if not exists org_invites_email on public.org_invites (email);
alter table public.org_invites enable row level security;
revoke all on public.org_invites from anon, authenticated;

-- the company's people for its members: who, role, since; the pending invites
create or replace function public.org_people (p_org uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  stable
as $$
begin
  if not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid()) then
    raise exception 'not a member of this company' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', u.email, 'role', m.role, 'since', m.created_at) order by m.role, lower(u.email))
      from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'since', i.created_at) order by i.created_at)
      from public.org_invites i where i.org_id = p_org), '[]'::jsonb));
end
$$;

-- the caller must be an owner of p_org; the company's row is locked, so two owners changing roles at once take turns
create or replace function private.owner_or_refuse (p_org uuid)
  returns void
  language plpgsql
  set search_path = ''
as $$
begin
  perform 1 from public.orgs o where o.id = p_org for update;
  if not exists (select 1 from public.org_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'only an owner of this company can do that' using errcode = '42501';
  end if;
end
$$;

-- an owner invites an email (again = a new role for the same invite); it is not sent from here: the person signs in
create or replace function public.invite_member (p_org uuid, p_email text, p_role text default 'staff')
  returns text
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  perform private.owner_or_refuse(p_org);
  if p_role is null or p_role not in ('owner', 'staff') then
    raise exception 'a member is an owner or staff' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'that is not an email address' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members m join auth.users u on u.id = m.user_id where m.org_id = p_org and lower(u.email) = v_email) then
    raise exception 'already in this company' using errcode = '23505';
  end if;
  insert into public.org_invites (org_id, email, role, invited_by) values (p_org, v_email, p_role, auth.uid())
  on conflict (org_id, email) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
  return v_email;
end
$$;

-- true = taken back; false = there was no such invite
create or replace function public.cancel_invite (p_org uuid, p_email text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  perform private.owner_or_refuse(p_org);
  delete from public.org_invites i where i.org_id = p_org and i.email = lower(trim(p_email));
  return found;
end
$$;

-- an owner removes someone else (their saves stay with the company); never themself, never the last owner
create or replace function public.remove_member (p_org uuid, p_user uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_role text;
begin
  perform private.owner_or_refuse(p_org);
  if p_user = auth.uid() then
    raise exception 'you cannot remove yourself: another owner can' using errcode = '42501';
  end if;
  select m.role into v_role from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  if v_role is null then
    return false;
  end if;
  if v_role = 'owner' and (select count(*) from public.org_members m where m.org_id = p_org and m.role = 'owner') <= 1 then
    raise exception 'a company needs at least one owner' using errcode = '42501';
  end if;
  delete from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  return true;
end
$$;

-- an owner makes a member owner or staff (themself too), never leaving the company with no owner
create or replace function public.set_member_role (p_org uuid, p_user uuid, p_role text)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_role text;
begin
  perform private.owner_or_refuse(p_org);
  if p_role is null or p_role not in ('owner', 'staff') then
    raise exception 'a member is an owner or staff' using errcode = '22023';
  end if;
  select m.role into v_role from public.org_members m where m.org_id = p_org and m.user_id = p_user;
  if v_role is null then
    return false;
  end if;
  if v_role = 'owner' and p_role = 'staff' and (select count(*) from public.org_members m where m.org_id = p_org and m.role = 'owner') <= 1 then
    raise exception 'a company needs at least one owner: make someone else owner first' using errcode = '42501';
  end if;
  update public.org_members m set role = p_role where m.org_id = p_org and m.user_id = p_user;
  return true;
end
$$;

-- the signed-in person's invites become memberships (their email confirmed by the sign-in link); how many joined
create or replace function public.accept_invites ()
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_email text;
  v_n integer;
begin
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;
  insert into public.org_members (org_id, user_id, role)
  select i.org_id, auth.uid(), i.role from public.org_invites i where i.email = v_email
  on conflict (org_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  delete from public.org_invites i where i.email = v_email;
  return v_n;
end
$$;

revoke all on function public.org_people (uuid), public.invite_member (uuid, text, text), public.cancel_invite (uuid, text), public.remove_member (uuid, uuid), public.set_member_role (uuid, uuid, text), public.accept_invites () from public, anon;
grant execute on function public.org_people (uuid), public.invite_member (uuid, text, text), public.cancel_invite (uuid, text), public.remove_member (uuid, uuid), public.set_member_role (uuid, uuid, text), public.accept_invites () to authenticated;
revoke all on function private.owner_or_refuse (uuid) from public;

-- 2. plan pictures: Supabase Storage, bucket `plans` (private; 10 MB a picture, the Studio's own drop limit; PNG, JPG, WEBP)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read their company's plan pictures" on storage.objects;
create policy "members read their company's plan pictures" on storage.objects for select to authenticated
  using (bucket_id = 'plans' and (storage.foldername(name))[1] in (select m.org_id::text from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members add plan pictures to their company" on storage.objects;
create policy "members add plan pictures to their company" on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and (storage.foldername(name))[1] in (select m.org_id::text from public.org_members m where m.user_id = (select auth.uid())));

-- 3. the links list: views counted when a link opens, every link of a project with who made it

alter table public.share_links add column if not exists views integer not null default 0;
alter table public.share_links add column if not exists last_viewed_at timestamptz;

-- as before (the link's unit while it is on), and one view more when the opener is not of the link's company
create or replace function public.unit_by_token (p_token uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_json jsonb;
begin
  update public.share_links s set views = s.views + 1, last_viewed_at = now()
  where s.token = p_token and s.revoked_at is null
    and not exists (select 1 from public.org_members m where m.org_id = s.org_id and m.user_id = auth.uid());
  select u.json into v_json from public.share_links s join public.units u on u.id = s.unit_id where s.token = p_token and s.revoked_at is null;
  return v_json;
end
$$;

-- every link made from project p_project (a cloud row: a project or a loose drawing), newest first
create or replace function public.project_links (p_project uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  stable
as $$
declare
  v_org uuid;
begin
  select p.org_id into v_org from public.projects p where p.id = p_project;
  if v_org is null or not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = auth.uid()) then
    raise exception 'not a project of your company' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'token', s.token, 'unit_name', u.name, 'stem', s.stem, 'floor', s.floor, 'created_at', s.created_at,
      'created_by', s.created_by, 'by_email', w.email, 'revoked_at', s.revoked_at, 'views', s.views,
      'last_viewed_at', s.last_viewed_at, 'events', (select count(*) from public.events e where e.token = s.token)
    ) order by s.created_at desc)
    from public.share_links s join public.units u on u.id = s.unit_id left join auth.users w on w.id = s.created_by
    where s.project_id = p_project and s.org_id = v_org), '[]'::jsonb);
end
$$;
revoke all on function public.project_links (uuid) from public, anon;
grant execute on function public.project_links (uuid) to authenticated;

select 'Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2 (the security check).' as result;
