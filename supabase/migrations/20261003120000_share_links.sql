-- Share links, Phase 0 backend (HANDOFF item 2, 2026-10-03).
-- Paste into the Supabase SQL editor of the Plotline project (or `supabase db push`).
-- The last SELECT prints the staff key: keep it, the Studio asks for it once per browser.
--
-- Security (CLAUDE.md): RLS on, NO policies - anon reads nothing from the tables.
-- The only ways in are the two security-definer RPCs: a buyer resolves a token to a
-- unit (unguessable uuid, view-scoped), staff publish with the staff key.

create table public.units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.share_links (
  token uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id),
  created_at timestamptz not null default now()
);

alter table public.units enable row level security;
alter table public.share_links enable row level security;
revoke all on public.units, public.share_links from anon, authenticated;

-- not exposed by PostgREST; only the definer functions read it
create schema if not exists private;
create table private.config (key text primary key, value text not null);
insert into private.config (key, value) values ('staff_key', encode(gen_random_bytes(24), 'hex'));

create or replace function public.unit_by_token (p_token uuid)
  returns jsonb
  language sql
  security definer
  set search_path = public
  stable
as $$
  select u.json from public.share_links s join public.units u on u.id = s.unit_id where s.token = p_token
$$;

create or replace function public.publish_unit (p_unit jsonb, p_key text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_unit uuid;
  v_token uuid;
begin
  if p_key is null or p_key <> (select value from private.config where key = 'staff_key') then
    raise exception 'wrong staff key' using errcode = '28000';
  end if;
  insert into public.units (name, json) values (coalesce(p_unit ->> 'name', 'Untitled unit'), p_unit) returning id into v_unit;
  insert into public.share_links (unit_id) values (v_unit) returning token into v_token;
  return v_token;
end
$$;

revoke all on function public.unit_by_token (uuid), public.publish_unit (jsonb, text) from public;
grant execute on function public.unit_by_token (uuid), public.publish_unit (jsonb, text) to anon;

select value as staff_key from private.config where key = 'staff_key';
