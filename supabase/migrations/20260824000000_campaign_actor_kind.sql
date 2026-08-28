-- ============================================================
-- FORGE ELECTION — CAMPAIGN ACTOR KIND  (Loop 28 taxonomy foundation)
--
-- PROPOSED. NOT YET APPLIED TO ANY LIVE PROJECT — same status every
-- migration in this project carries until a human reviews and runs it.
--
-- WHAT THIS CLOSES, AND WHAT IT DELIBERATELY DOES NOT. Loop 28's brief asks
-- Forge Election to eventually support multiple legitimate election actors
-- (candidate/campaign, NGO/CSO, observer organisation, monitoring group,
-- campaign support organisation, security/coordination organisation), each
-- with its OWN preparedness definition. Reconnaissance against the actual
-- repository (events.js, projections.js, readiness.js) found ZERO
-- authoritative event or fold path for any actor-specific dimension beyond
-- the three that already exist for a candidate campaign
-- (CANDIDATE_REGISTERED, WARD_ASSIGNMENT, WARD_STATUS_HEALTH) — no NGO
-- deployment event, no observer assignment event, no security coordination
-- event exists anywhere. Per this loop's own rule ("DO NOT INVENT CANON
-- DIMENSIONS" / "STOP and report instead of coding if... the Canon cannot
-- authoritatively support a proposed preparedness dimension"), none of
-- those dimensions are built here.
--
-- What CAN be supported without inventing anything is the TAXONOMY
-- question one layer below readiness: which KIND of actor is this
-- campaign? That is not a readiness fact — it is a declaration the actor
-- makes about itself at creation time, exactly the same kind of fact
-- `organisations.role` already is for the manufacturing network
-- (`forge_role`: sme, investor, university, ...). This migration is that
-- SAME pattern, applied to `campaigns` instead of `organisations`, for the
-- identical reason Loop 23 kept `campaigns` a separate table in the first
-- place: an Election actor's taxonomy is not a manufacturing-network fact.
--
-- WHY A DEFAULT, NOT A REQUIRED CHOICE WITH NO FALLBACK. Every campaign
-- created before this migration existed (Loops 24-27's entire test suite,
-- and any real campaign a human bootstrapped) was, in fact, implicitly a
-- candidate's own campaign — that was the ONLY actor concept that existed.
-- Defaulting `actor_kind` to 'candidate_campaign' therefore states a true
-- historical fact about every existing row, not a guess about an unknown
-- one — it is not the same kind of fabrication "UNKNOWN -> INCOMPLETE"
-- would be, because there genuinely is no other possibility for a row
-- created under the old, single-actor-type assumption.
--
-- WHAT THIS DOES NOT DO. It does not add a SECOND actor_kind concept
-- anywhere else, does not touch `election_events`' schema (actor kind is a
-- TENANT fact, not a Canon fact — see the header of
-- 20260823000000_campaign_membership.sql on why `campaigns` never
-- duplicates Canon facts), and does not make actor_kind mutable after
-- creation (no UPDATE policy is granted below) — an actor does not
-- relabel itself after the fact, the same discipline
-- organisation_members' role-bootstrap already follows.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
  ) then
    raise exception
      'Table public.campaigns does not exist. Apply 20260823000000_campaign_membership.sql first.';
  end if;
end $$;

do $$ begin
  create type campaign_actor_kind as enum (
    'candidate_campaign',
    'ngo_cso',
    'observer_organisation',
    'monitoring_group',
    'campaign_support_organisation',
    'security_coordination_organisation'
  );
exception when duplicate_object then null; end $$;

alter table campaigns
  add column if not exists actor_kind campaign_actor_kind not null default 'candidate_campaign';

comment on column campaigns.actor_kind is
  'Which kind of legitimate election actor this campaign represents. A DECLARATION the actor makes at creation, never a readiness fact — no preparedness dimension for any non-candidate kind is authoritative yet (see src/domains/election/studio/readiness.js''s own header for the three that exist, all candidate-specific). Immutable after creation: no UPDATE policy is granted on this column, matching the append-only discipline election_events itself already uses for a different reason.';

-- No RLS change needed — campaigns' existing SELECT/INSERT policies
-- (20260823000000_campaign_membership.sql) already cover this new column;
-- a member reads their own campaign's full row, an owner sets actor_kind
-- once, at INSERT, like every other field on this table.
