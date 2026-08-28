-- ============================================================
-- ELECTIONCANON ALPHA 1.1 — RESULT-EVIDENCE STORAGE
--
-- The first Supabase Storage bucket this project uses. A polling-unit
-- agent's captured result-sheet photo needs to be preserved as immutable
-- evidence — see docs/electioncanon/ARCHITECTURE.md's "Simulation vs. real
-- Election Day data" section. RLS on storage.objects follows the EXACT
-- same tenant-isolation pattern every other table in this project already
-- uses: is_active_campaign_member(), reused unchanged — no new SECURITY
-- DEFINER function needed. Path convention: <campaign_id>/<result_id>/
-- <filename>, so the tenant check is a pure path-prefix check via
-- storage.foldername(name).
--
-- IMMUTABLE BY DESIGN — no update or delete policy is granted to any
-- client, matching election_events' own append-only discipline. A
-- correction is a new RESULT_CAPTURED event with a new image, never an
-- edit to an existing one.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'is_active_campaign_member'
  ) then
    raise exception
      'Function public.is_active_campaign_member does not exist. Apply 20260826000000_fix_campaign_members_rls_recursion.sql first.';
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('election-evidence', 'election-evidence', false)
on conflict (id) do nothing;

drop policy if exists "election evidence read own campaign" on storage.objects;
create policy "election evidence read own campaign" on storage.objects
  for select using (
    bucket_id = 'election-evidence'
    and public.is_active_campaign_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "election evidence insert own campaign" on storage.objects;
create policy "election evidence insert own campaign" on storage.objects
  for insert with check (
    bucket_id = 'election-evidence'
    and owner = auth.uid()
    and public.is_active_campaign_member(((storage.foldername(name))[1])::uuid)
  );
