-- ============================================================
-- FORGE ELECTION — FIX campaign_members RLS RECURSION  (Loop 44)
--
-- THE BUG, PROVEN LIVE, NOT ASSUMED FROM THE MIGRATION'S OWN COMMENT.
-- 20260823000000_campaign_membership.sql's "campaign members read same
-- campaign" policy reads:
--
--   using (exists (select 1 from campaign_members m2 where ...))
--
-- the EXACT self-referencing shape 20260822000000_fix_organisation_members_
-- rls_recursion.sql already proved recursive (42P17) and fixed for
-- organisation_members — one day before this migration was written, and
-- reintroduced here regardless. Evaluating this policy for any row requires
-- evaluating campaign_members' own SELECT policies again for the inner
-- EXISTS's access to campaign_members, which requires evaluating the same
-- policy again, and so on. Confirmed reproducible against the live project
-- (Loop 44's own pre-confirmed test identity, `auth.signInWithPassword` +
-- real anon-key session — never postgres/service_role, which bypass RLS and
-- would hide this): every authenticated read of campaign_members, and every
-- read/write that depends on it (campaigns' own "read own membership"
-- policy, and both election_events policies below), failed with "infinite
-- recursion detected in policy for relation \"campaign_members\"".
--
-- THE FIX — the SAME helper-function pattern
-- 20260822000000_fix_organisation_members_rls_recursion.sql already
-- established for organisation_members, applied to campaign_members. A
-- SECURITY DEFINER function owned by postgres (BYPASSRLS) answers exactly
-- one question — "is the calling authenticated user an active member of
-- this campaign?" — so the internal check never re-triggers
-- campaign_members' own policies. Not a new architecture; the same one,
-- applied to the second table that needed it.
--
-- WHY THE HELPER TAKES NO PERSON PARAMETER — identical reasoning to
-- is_active_org_member(): always checks auth.uid(), never a caller-supplied
-- id, so the only fact anyone can learn by calling it is something about
-- themselves. Returns a boolean only — never membership rows, other
-- people, or roles.
--
-- WHY campaigns AND election_events ARE ALSO REWRITTEN HERE, NOT ONLY
-- campaign_members. Both already expressed the identical check inline
-- against campaign_members (not self-referencing on their own table, but
-- each depended on campaign_members' RLS being sane) — the same second-hop
-- failure 20260822000000's own header names for business_events. Rewritten
-- to call the same helper: identical effective security, one fewer place a
-- future edit could reintroduce a raw self-referencing subquery.
-- ============================================================

create or replace function public.is_active_campaign_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.campaign_members m
    where m.campaign_id = p_campaign_id
      and m.person = auth.uid()
      and m.status = 'active'
  );
$function$;

comment on function public.is_active_campaign_member(uuid) is
  'Returns whether the CALLING authenticated user (auth.uid(), never a caller-supplied person id) is an active member of the given campaign. SECURITY DEFINER so this internal check does not re-trigger campaign_members'' own RLS policies — fixes 42P17 infinite recursion in "campaign members read same campaign". Answers only a boolean; never exposes membership rows, other people, or roles.';

revoke all on function public.is_active_campaign_member(uuid) from public;
grant execute on function public.is_active_campaign_member(uuid) to authenticated;

-- ---------- FIX THE RECURSIVE POLICY (campaign_members) ----------
-- "campaign members read own row" is untouched: it already covers seeing
-- your own row regardless of status, and never touched campaign_members
-- recursively in the first place.
drop policy if exists "campaign members read same campaign" on campaign_members;
create policy "campaign members read same campaign" on campaign_members
  for select using (
    public.is_active_campaign_member(campaign_members.campaign_id)
  );

-- ---------- REUSE THE SAME HELPER IN campaigns, PLUS THE CREATOR GAP ----------
-- SECOND BUG, FOUND ONLY AFTER THE RECURSION FIX STOPPED MASKING IT. Postgres
-- checks an INSERT's RETURNING rows against the table's SELECT policy, not
-- only its own WITH CHECK (docs: "if RETURNING is specified, the row must
-- additionally satisfy the SELECT policy"). `bootstrapCampaign()`
-- (electionBootstrap.js) does `.insert({...}).select("id, actor_kind").single()`
-- — a RETURNING read — BEFORE `ensure_campaign_owner()` has run, so no
-- `campaign_members` row exists yet for this brand-new campaign. Under the
-- membership-only policy this insert's own RETURNING clause was refused
-- (42501 "new row violates row-level security policy"), live-reproduced
-- against this same test identity (Loop 44) with a plain `.insert()` with no
-- `.select()` succeeding while the RETURNING form failed on the identical
-- row. `organisations` never hit this because it is `using (true)` (public
-- read) — `campaigns` chose NOT to be public (see
-- 20260823000000_campaign_membership.sql's own header), so it is the first
-- table in this project where the gap is reachable. Fixed by trusting the
-- SAME fact the INSERT policy already trusts: `created_by = auth.uid()` is
-- checked by "campaigns insert as self" at write time and cannot be spoofed,
-- so a creator may always read their own row, membership or not — this is
-- an OR, strictly widening what the row's own creator could always
-- eventually see anyway (owner membership follows moments later in the same
-- bootstrap call).
drop policy if exists "campaigns read own membership" on campaigns;
create policy "campaigns read own membership" on campaigns
  for select using (
    created_by = auth.uid()
    or public.is_active_campaign_member(campaigns.id)
  );

-- ---------- REUSE THE SAME HELPER IN election_events ----------
drop policy if exists "election events read own campaign" on election_events;
create policy "election events read own campaign" on election_events
  for select using (
    public.is_active_campaign_member(election_events.campaign_id)
  );

drop policy if exists "election events insert own campaign" on election_events;
create policy "election events insert own campaign" on election_events
  for insert with check (
    actor = auth.uid()
    and public.is_active_campaign_member(election_events.campaign_id)
  );

-- No UPDATE/DELETE policy is added or changed anywhere in this migration.
-- Membership write restrictions (only ensure_campaign_owner() may insert a
-- row, no direct INSERT/UPDATE/DELETE policy on campaign_members) are
-- unchanged. Campaign ownership semantics, actor_kind taxonomy, and the
-- Election Canon event model are unchanged.
