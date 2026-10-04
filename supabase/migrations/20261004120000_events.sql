-- Change list, Phase 0 backend (session 18, ask 8): what buyers do on a share link - their comments and finish choices.
-- The founder pastes supabase/paste-into-sql-editor.sql (the share-links migration + this one); safe to run twice.
--
-- Append-only (CLAUDE.md invariant 6): a row is never updated or deleted - a trigger refuses it, even for the owner.
-- A newer row about the same thing (same link, kind and ref: the finish slot for a selection, the note for a comment)
-- supersedes the older one; events_for_staff works that out on read, nothing is rewritten.
-- Security: RLS on, NO policies, privileges revoked - anon reads nothing. Buyers write through add_event (the link's
-- token is the only key they hold); staff read through events_for_staff with the staff key (share-links migration).

create table if not exists public.events (
  -- minted in the buyer's browser: a send retried from its offline outbox never makes a second row
  id uuid primary key,
  token uuid not null references public.share_links (token),
  kind text not null check (kind in ('comment', 'selection')),
  -- what the row is about: the finish slot id (selection) or the note's id (comment)
  ref text not null check (length(ref) between 1 and 200),
  -- the buyer's browser (a random id it keeps) and the name they typed, if any
  buyer text not null check (length(buyer) between 1 and 64),
  name text check (length(name) <= 80),
  -- selection: slot, option, label, brand, sku, priceDeltaBdt; comment: text, object, anchor (entity id + offset), room
  payload jsonb not null check (octet_length(payload::text) <= 8000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists events_token_created on public.events (token, created_at desc);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

create or replace function private.events_append_only ()
  returns trigger
  language plpgsql
as $$
begin
  raise exception 'events are append-only: add a row that supersedes this one' using errcode = '55000';
end
$$;
create or replace trigger events_append_only before update or delete on public.events for each row execute function private.events_append_only ();

-- buyers: one row; an unknown token is refused by the foreign key, a bad kind / oversized payload by the checks
-- ponytail: no rate limit per link (anyone holding a link can add rows, 8 KB each); count a token's rows in the last
-- minute here if a link is ever spammed
create or replace function public.add_event (p_id uuid, p_token uuid, p_kind text, p_ref text, p_buyer text, p_name text, p_payload jsonb)
  returns uuid
  language sql
  security definer
  set search_path = public
as $$
  insert into public.events (id, token, kind, ref, buyer, name, payload)
  values (p_id, p_token, p_kind, p_ref, p_buyer, nullif(trim(p_name), ''), p_payload)
  on conflict (id) do nothing;
  select p_id;
$$;

-- staff: every link (newest first) and every event (newest first), each flagged when a newer one about the same thing exists
create or replace function public.events_for_staff (p_key text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
  stable
as $$
begin
  if p_key is null or p_key <> (select value from private.config where key = 'staff_key') then
    raise exception 'wrong staff key' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('token', s.token, 'unit_name', u.name, 'created_at', s.created_at) order by s.created_at desc)
      from public.share_links s join public.units u on u.id = s.unit_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc, e.id)
      from (
        select ev.*, row_number() over (partition by ev.token, ev.kind, ev.ref order by ev.created_at desc, ev.id) > 1 as superseded
        from public.events ev
      ) e), '[]'::jsonb));
end
$$;

revoke all on function public.add_event (uuid, uuid, text, text, text, text, jsonb), public.events_for_staff (text) from public;
grant execute on function public.add_event (uuid, uuid, text, text, text, text, jsonb), public.events_for_staff (text) to anon;

select value as staff_key from private.config where key = 'staff_key';
