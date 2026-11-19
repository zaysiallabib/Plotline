-- Two-tenant test (session 30): the security check of supabase/migrations/20261120120000_accounts.sql.
-- Paste this whole file into the Supabase SQL editor AFTER the accounts SQL and press Run.
--
-- It makes two companies (A and B), one person in each, a project, a share link and a buyer's note in B, then acts
-- as A - through the same database roles the website uses (`authenticated` with A's sign-in, `anon` for a buyer) -
-- and checks that A cannot read, change or add to anything of B's; that a buyer reads no table; that a save from an
-- old version is refused; and that a turned-off link opens nothing and takes no note.
-- It all runs in one transaction that is rolled back at the end: nothing it made is left behind.
--
-- Result: one row, "All two-tenant checks passed". Anything else stops at once with "FAIL: <what went wrong>".
-- (Run in the throwaway database too: E:/dev/tmp/s30/backend/pg/run.mjs, PGlite, with mutations that must fail it.)

begin;

do $$
declare
  ua constant uuid := 'aaaaaaaa-0000-4000-8000-00000000000a'; -- the person in company A
  ub constant uuid := 'bbbbbbbb-0000-4000-8000-00000000000b'; -- the person in company B
  oa uuid;
  ob uuid;
  pa uuid;
  pb uuid;
  tb uuid;
  n integer;
  j jsonb;
  t text;
  k text;
begin
  -- fixtures, as the SQL editor's own role
  insert into auth.users (id, email) values (ua, 'two-tenant-a@plotline.invalid'), (ub, 'two-tenant-b@plotline.invalid');
  insert into public.orgs (name) values ('Two-tenant test A') returning id into oa;
  insert into public.orgs (name) values ('Two-tenant test B') returning id into ob;
  insert into public.org_members (org_id, user_id, role) values (oa, ua, 'owner'), (ob, ub, 'staff');

  -- as B: a project saved twice, a share link, a buyer's note
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);

  insert into public.projects (org_id, name, kind, data) values (ob, 'B tower', 'project', '{"name":"B tower"}') returning id into pb;
  update public.projects set data = '{"name":"B tower","floors":2}' where id = pb and version = 1;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B cannot save its own project'; end if;
  select version into n from public.projects where id = pb;
  if n <> 2 then raise exception 'FAIL: a save did not make version 2 (got %)', n; end if;

  update public.projects set data = '{"name":"from an old copy"}' where id = pb and version = 1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a save from an old version (1, the project is at 2) went through'; end if;

  select count(*) into n from public.project_versions where project_id = pb;
  if n <> 2 then raise exception 'FAIL: the history should hold 2 saves, it holds %', n; end if;
  select count(*) into n from public.project_versions where project_id = pb and saved_by = ub;
  if n <> 2 then raise exception 'FAIL: the history does not say B saved it'; end if;

  begin
    update public.projects set version = 99 where id = pb;
    raise exception 'FAIL: a browser could set the version number itself';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.projects (org_id, name, kind, data, created_by) values (ob, 'forged', 'unit', '{}', ua);
    raise exception 'FAIL: a browser could write who made a project';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.project_versions set data = '{}' where project_id = pb;
    raise exception 'FAIL: B could rewrite its own history';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.project_versions (project_id, version, org_id, name, data) values (pb, 3, ob, 'x', '{}');
    raise exception 'FAIL: B could write a history row by hand';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.projects where id = pb;
    raise exception 'FAIL: B could delete a project row (Delete must only hide it)';
  exception when insufficient_privilege then null;
  end;

  tb := public.share_unit(ob, '{"name":"B flat","id":"b-flat"}'::jsonb, pb, 'b-flat', 3);
  if tb is null then raise exception 'FAIL: B could not make a share link'; end if;
  perform public.add_event(gen_random_uuid(), tb, 'comment', 'pin-1', 'buyer-1', 'Rahim', '{"text":"wider door"}'::jsonb);
  j := public.events_for_org();
  if jsonb_array_length(j -> 'links') <> 1 or jsonb_array_length(j -> 'events') <> 1 then
    raise exception 'FAIL: B''s change list should show its 1 link and 1 note, it shows %', j;
  end if;

  -- as A: nothing of B's can be read, changed or added to
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);

  select count(*) into n from public.projects where id = pb or org_id = ob;
  if n <> 0 then raise exception 'FAIL: A reads B''s projects'; end if;
  select count(*) into n from public.project_versions where project_id = pb or org_id = ob;
  if n <> 0 then raise exception 'FAIL: A reads B''s save history'; end if;
  select count(*) into n from public.share_links where token = tb or org_id = ob;
  if n <> 0 then raise exception 'FAIL: A reads B''s share links'; end if;
  select count(*) into n from public.units where org_id = ob;
  if n <> 0 then raise exception 'FAIL: A reads the units B shared'; end if;
  select count(*) into n from public.events where token = tb;
  if n <> 0 then raise exception 'FAIL: A reads the notes on B''s link'; end if;
  select count(*) into n from public.orgs where id = ob;
  if n <> 0 then raise exception 'FAIL: A sees company B'; end if;
  select count(*) into n from public.org_members where org_id = ob or user_id = ub;
  if n <> 0 then raise exception 'FAIL: A sees who is in company B'; end if;
  j := public.events_for_org();
  if jsonb_array_length(j -> 'links') <> 0 or jsonb_array_length(j -> 'events') <> 0 then
    raise exception 'FAIL: A''s change list shows B''s links or notes: %', j;
  end if;

  update public.projects set name = 'taken over', data = '{}' where id = pb;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A changed B''s project'; end if;
  update public.projects set deleted_at = now() where id = pb;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted (hid) B''s project'; end if;

  begin
    insert into public.projects (org_id, name, kind, data) values (ob, 'planted by A', 'unit', '{}');
    raise exception 'FAIL: A added a project to company B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.org_members (org_id, user_id, role) values (ob, ua, 'owner');
    raise exception 'FAIL: A made itself a member of company B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.orgs (name) values ('made by A');
    raise exception 'FAIL: a signed-in person could make a company';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.share_links set revoked_at = null where token = tb;
    raise exception 'FAIL: A could write to share_links directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.events (id, token, kind, ref, buyer, payload) values (gen_random_uuid(), tb, 'comment', 'x', 'a', '{}');
    raise exception 'FAIL: A could write a note into the events table directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.share_unit(ob, '{"name":"A in B"}'::jsonb);
    raise exception 'FAIL: A made a share link in company B';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.share_unit(oa, '{"name":"B project under A"}'::jsonb, pb);
    raise exception 'FAIL: A made a link in its own company pointing at B''s project';
  exception when insufficient_privilege then null;
  end;
  if public.revoke_link(tb) then raise exception 'FAIL: A turned off B''s link'; end if;

  -- A's own work still works (the checks above are not passing because everything is refused)
  insert into public.projects (org_id, name, kind, data) values (oa, 'A flat', 'unit', '{"name":"A flat"}') returning id into pa;
  select count(*) into n from public.projects where org_id = oa;
  if n <> 1 then raise exception 'FAIL: A cannot see its own project'; end if;

  -- a person signed in but in no company reaches nothing
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  select (select count(*) from public.projects) + (select count(*) from public.share_links) + (select count(*) from public.events) into n;
  if n <> 0 then raise exception 'FAIL: an account in no company reads rows'; end if;
  begin
    insert into public.projects (org_id, name, kind, data) values (oa, 'stranger', 'unit', '{}');
    raise exception 'FAIL: an account in no company added a project';
  exception when insufficient_privilege then null;
  end;

  -- as a buyer (anon, the publishable key): no table, only the link's own unit
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  foreach t in array array['orgs', 'org_members', 'projects', 'project_versions', 'units', 'share_links', 'events'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      raise exception 'FAIL: a buyer can read table %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.events_for_org();
    raise exception 'FAIL: a buyer can call events_for_org';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.share_unit(ob, '{}'::jsonb);
    raise exception 'FAIL: a buyer can call share_unit';
  exception when insufficient_privilege then null;
  end;
  if public.unit_by_token(tb) ->> 'name' is distinct from 'B flat' then raise exception 'FAIL: the buyer link does not open its unit'; end if;
  if public.unit_by_token(gen_random_uuid()) is not null then raise exception 'FAIL: a made-up token opened something'; end if;

  -- B turns the link off: it opens nothing and takes no note; what was said stays
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  if not public.revoke_link(tb) then raise exception 'FAIL: B could not turn its link off'; end if;
  if public.revoke_link(tb) then raise exception 'FAIL: a link was turned off twice'; end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  if public.unit_by_token(tb) is not null then raise exception 'FAIL: a turned-off link still opens its unit'; end if;
  begin
    perform public.add_event(gen_random_uuid(), tb, 'comment', 'pin-2', 'buyer-1', null, '{"text":"after"}'::jsonb);
    raise exception 'FAIL: a turned-off link still takes notes';
  exception when invalid_parameter_value then null;
  end;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  j := public.events_for_org();
  if jsonb_array_length(j -> 'events') <> 1 or j -> 'links' -> 0 ->> 'revoked_at' is null then
    raise exception 'FAIL: after turning the link off B should still see its 1 note and the link marked off: %', j;
  end if;

  -- back as the SQL editor: history is append-only even here; the old staff key reaches no company's link
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    delete from public.project_versions where project_id = pb;
    raise exception 'FAIL: the save history can be deleted';
  exception when object_not_in_prerequisite_state then null;
  end;
  select pg_get_expr(d.adbin, d.adrelid) into t from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
  where d.adrelid = 'public.share_links'::regclass and a.attname = 'token';
  if t not like '%gen_random_bytes(16)%' then raise exception 'FAIL: share tokens are not 128 random bits (default is %)', t; end if;
  select c.value into k from private.config c where c.key = 'staff_key';
  if k is not null then
    j := public.events_for_staff(k);
    if j::text like '%' || tb::text || '%' then raise exception 'FAIL: the old staff key reads a company''s link'; end if;
  end if;
end
$$;

rollback;

select 'All two-tenant checks passed' as result;
