-- ============================================================
-- FORGE ELECTION — CAMPAIGN + CAMPAIGN MEMBERSHIP  (Loop 23 tenant foundation)
--
-- PROPOSED. NOT YET APPLIED TO ANY LIVE PROJECT — same status every
-- migration in this project carries until a human reviews and runs it.
--
-- THE DECISION THIS MIGRATION IMPLEMENTS (Loop 23's architectural record).
-- A campaign is NOT an `organisations` row. `organisations.role` is a
-- CLOSED enum (`forge_role`: sme, investor, university, polytechnic,
-- research_institute, government_agency, manufacturer, component_supplier,
-- logistics_partner, engineer, nysc_volunteer, diaspora_expert) describing
-- manufacturing-network participants, and that table is documented as a
-- PUBLIC, world-readable directory (`for select using (true)` in
-- schema.sql). A candidate's campaign is not a manufacturing-network
-- participant, has no representable value in `forge_role`, and its data
-- (office, constituency, party, ward assignments) has no home in that
-- table's columns (rc_number, verification, website, ...) — reusing it
-- would pollute a table three other domains already depend on. This is the
-- OPPOSITE conclusion from `20260820000000_business_membership.sql`'s own
-- reasoning, which reused `organisations` because it found the two to be
-- "the same real-world entity" — that identity does not hold here, so this
-- migration does NOT copy that precedent blindly; it reaches the answer the
-- Election domain's own evidence supports.
--
-- WHAT `campaigns` DOES AND DOES NOT HOLD. This table is a TENANT BOUNDARY
-- PRIMITIVE ONLY — an id and who created it. It carries no candidate name,
-- office, constituency, or party: those are Election Canon facts, owned
-- exclusively by `election_events` (see the sibling migration) via
-- `candidate.registered`. Duplicating them here would create a second
-- source of truth for exactly the kind of fact this project's whole
-- architecture (events.js/projections.js) exists to keep singular. This
-- mirrors the split `organisations` (public directory row) / Business Canon
-- events (actual business data) already establishes — the same principle,
-- applied to a table that is NOT publicly readable (see RLS below).
--
-- SHAPE. `campaign_members` mirrors `organisation_members` field-for-field
-- (see that migration's own header for the reasoning behind each choice —
-- not restated here), with distinct enum type names (`campaign_member_role`/
-- `campaign_member_status`, not reused from `business_member_role`/
-- `business_member_status`) because Postgres enum types are global and the
-- two tenancies are independent concepts that should be free to diverge.
-- ============================================================

-- ---------- TABLES (both created first — RLS below on either references
-- the other, so neither table may be defined after its own policies) ----------

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  -- A human-readable label only (e.g. "Ada Example for LG Chair, Ward 7") —
  -- NOT the candidate's registered name, office, or constituency, which are
  -- Election Canon facts recorded by candidate.registered, never here.
  name        text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table campaigns is
  'Forge Election tenant boundary primitive. Holds no candidate/campaign fact — those live exclusively in election_events, folded by projectElection(). This table exists only so campaign_members and election_events have something to reference and RLS-scope against.';

do $$ begin
  create type campaign_member_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_member_status as enum ('active', 'invited', 'revoked');
exception when duplicate_object then null; end $$;

create table if not exists campaign_members (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  person       uuid not null references auth.users(id) on delete cascade,
  member_role  campaign_member_role   not null default 'staff',
  status       campaign_member_status not null default 'active',
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (campaign_id, person)
);

create index if not exists campaign_members_campaign_idx
  on campaign_members(campaign_id, status);
create index if not exists campaign_members_person_idx
  on campaign_members(person, status);

comment on table campaign_members is
  'Who may act for a campaign, and with what standing. Election''s own tenant-membership table — deliberately not organisation_members; see this file''s header for why the two are not merged.';

-- ---------- RLS: campaigns ----------
--
-- Unlike `organisations`, `campaigns` is NOT a public directory — no RLS
-- policy below grants a bare `using (true)` read. A campaign's existence is
-- private to its own members, matching the "private business data" posture
-- business_events.sql chose over organisations'/component_jobs' public one.
alter table campaigns enable row level security;

drop policy if exists "campaigns read own membership" on campaigns;
create policy "campaigns read own membership" on campaigns
  for select using (
    exists (
      select 1 from campaign_members m
      where m.campaign_id = campaigns.id
        and m.person = auth.uid()
        and m.status = 'active'
    )
  );

-- A campaign is created directly by its future owner (mirrors
-- organisations.created_by discipline) — INSERT is granted to any
-- authenticated user, naming themselves as creator; nobody else's id may be
-- used, checked the same way business_events' actor check is.
drop policy if exists "campaigns insert as self" on campaigns;
create policy "campaigns insert as self" on campaigns
  for insert with check (created_by = auth.uid());

-- No update/delete policy — a campaign's name is corrected by creating a
-- fresh row in the rare case it is ever needed, not by editing history,
-- matching this project's append-only discipline everywhere else.

-- ---------- BOOTSTRAP: THE FIRST OWNER ----------
--
-- Same deadlock-avoidance reasoning as ensure_business_owner(): a campaign
-- is created with zero membership rows, so this is the one sanctioned way
-- to open that door — SECURITY DEFINER, only for a campaign the caller
-- themselves created, only if no membership exists yet.
create or replace function public.ensure_campaign_owner(p_campaign_id uuid)
returns campaign_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.campaign_members;
begin
  if auth.uid() is null then
    raise exception 'ensure_campaign_owner requires an authenticated session';
  end if;

  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.created_by = auth.uid()
  ) then
    raise exception 'ensure_campaign_owner: % was not created by the caller', p_campaign_id;
  end if;

  insert into public.campaign_members (campaign_id, person, member_role, status)
  values (p_campaign_id, auth.uid(), 'owner', 'active')
  on conflict (campaign_id, person) do nothing;

  select * into v_row from public.campaign_members
  where campaign_id = p_campaign_id and person = auth.uid();

  return v_row;
end;
$$;

comment on function public.ensure_campaign_owner(uuid) is
  'Bootstraps the first owner membership row for a campaign the caller created. Idempotent; never reassigns; grants no role to anyone but the caller.';

revoke all on function public.ensure_campaign_owner(uuid) from public;
grant execute on function public.ensure_campaign_owner(uuid) to authenticated;

-- ---------- ROW LEVEL SECURITY (campaign_members) ----------
alter table campaign_members enable row level security;

drop policy if exists "campaign members read own row" on campaign_members;
create policy "campaign members read own row" on campaign_members
  for select using (auth.uid() = person);

drop policy if exists "campaign members read same campaign" on campaign_members;
create policy "campaign members read same campaign" on campaign_members
  for select using (
    exists (
      select 1 from campaign_members m2
      where m2.campaign_id = campaign_members.campaign_id
        and m2.person = auth.uid()
        and m2.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policy granted to any client — the bootstrap path
-- is ensure_campaign_owner() (SECURITY DEFINER, above) only. A second-member
-- invitation flow is explicitly NOT built here, matching
-- organisation_members' own stated scope boundary.
