-- The staff's own library (session 31, 2026-11-20): the furniture models, finish options and texture pictures a
-- developer's staff add in the product (Docs/MANUAL.md "Your own furniture, finishes and textures"). Runs after the
-- members and pictures migration; the founder pastes supabase/paste-into-sql-editor.sql (all five, in order):
-- Docs/SETUP_ACCOUNTS.md. Safe to run twice. The proof: supabase/tests/two_tenants.sql.
--
-- Who reaches what (added):
--  * library_items: one row per piece or finish option of a company, its record as the Studio keeps it (src/furnish/
--    own.ts). Members read, add and change their own company's (a rename, a new size; "Remove" is a mark in the record,
--    so a piece already placed keeps drawing). Nobody deletes a row, nobody reaches another company's, a buyer reads none.
--  * bucket `library` (a model as .glb up to 30 MB, a texture picture as JPG / PNG): one folder per company,
--    `<org id>/<sha-256>.<ext>`. Members add to their own company's folder and list it; nobody changes or deletes a file
--    (a buyer link keeps pointing at it). The bucket is PUBLIC TO READ BY EXACT NAME, so a buyer link (no account) draws
--    the pieces and finishes it was shared with; nobody outside a company can list it, and a name is the company's id
--    (random) plus the file's own SHA-256 — known only from a link that shows that very file.

create table if not exists public.library_items (
  org_id uuid not null references public.orgs (id) on delete cascade,
  id text not null check (id ~ '^own_[0-9a-f-]{36}$'),
  item jsonb not null check (jsonb_typeof(item) = 'object' and octet_length(item::text) <= 8192),
  primary key (org_id, id)
);
alter table public.library_items enable row level security;
revoke all on public.library_items from anon, authenticated;
-- the Studio saves a record by upsert (insert, or on its id update): both rights, on these three columns only
grant select, insert (org_id, id, item), update (org_id, id, item) on public.library_items to authenticated;

drop policy if exists "members read their company's library" on public.library_items;
create policy "members read their company's library" on public.library_items for select to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members add to their company's library" on public.library_items;
create policy "members add to their company's library" on public.library_items for insert to authenticated
  with check (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members change their company's library" on public.library_items;
create policy "members change their company's library" on public.library_items for update to authenticated
  using (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.org_members m where m.user_id = (select auth.uid())));

-- the files: Supabase Storage, bucket `library` (30 MB a file, the Studio's own limit for a model)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', true, 31457280, array['model/gltf-binary', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members list their company's library files" on storage.objects;
create policy "members list their company's library files" on storage.objects for select to authenticated
  using (bucket_id = 'library' and (storage.foldername(name))[1] in (select m.org_id::text from public.org_members m where m.user_id = (select auth.uid())));
drop policy if exists "members add library files to their company" on storage.objects;
create policy "members add library files to their company" on storage.objects for insert to authenticated
  with check (bucket_id = 'library' and (storage.foldername(name))[1] in (select m.org_id::text from public.org_members m where m.user_id = (select auth.uid())));

select 'Accounts are set up. Next: Docs/SETUP_ACCOUNTS.md step 2 (the security check).' as result;
