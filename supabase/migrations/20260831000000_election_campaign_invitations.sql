-- ============================================================
-- CAMPAIGN ORGANISATION ONBOARDING — INVITATIONS
--
-- THE GAP THIS CLOSES. `campaign_members` has exactly one write path today
-- (`ensure_campaign_owner()`, scoped to the campaign's own creator) — there
-- has never been a way for a real Director to bring in an LGA Coordinator,
-- or for that coordinator to bring in Ward Coordinators, without someone
-- with database access doing it by hand. Chat room membership has been
-- documented as "OPEN CAMPAIGN-WIDE... a real invite-only workflow is a
-- documented fast-follow" since Alpha 1.0 (20260827000000...sql). This is
-- that fast-follow.
--
-- ROLE MODEL — NOTHING NEW. A Campaign Director is `campaign_members.
-- member_role = 'manager'` (the enum already had this value; there was
-- simply no write path to it). An LGA/Ward Coordinator or Polling-Unit
-- Agent is `member_role = 'staff'` PLUS a `responsibility.assigned` event
-- (already built in the geography pass — RESPONSIBILITY_ROLE already has
-- exactly these four roles). No new event type, no new enum.
--
-- WHY THIS TABLE IS NOT EVENT-SOURCED. An invitation is not a Canon fact
-- about a campaign's territory or accountability — it is a transient,
-- MUTABLE administrative record (pending -> accepted/expired/revoked) with
-- no accountability meaning of its own once resolved, the same reasoning
-- `campaign_studio_assets` already established for mutable content over an
-- immutable event log.
--
-- WHY EVERY WRITE GOES THROUGH A SECURITY DEFINER FUNCTION, NEVER A CLIENT
-- INSERT POLICY. Two reasons, one per function:
--   create_campaign_invitation() — WHO may invite WHOM for WHAT geography is
--   a genuinely relational question (does the caller hold LGA_COORDINATOR
--   for the ward's own parent LGA?) that a static RLS predicate cannot
--   express without re-deriving the entire responsibility graph inline.
--   Exactly the class of problem is_active_campaign_member() already
--   exists to solve for a simpler case.
--   accept_campaign_invitation() — creating a campaign_members row is
--   ALREADY privileged (no client INSERT policy exists on that table at
--   all); this function is the second sanctioned bootstrap path, alongside
--   ensure_campaign_owner(), not a third architecture.
--
-- TOKEN SECRECY. `campaign_invitations` carries NO select-by-token RLS
-- policy — a bare `using (true)` policy would make the token itself
-- readable by anyone who can query the table, which defeats its purpose.
-- The unauthenticated accept-invite landing page instead calls
-- get_invitation_preview(token), a SECURITY DEFINER function that takes the
-- token as an EXACT-MATCH input (never a client-supplied filter RLS has to
-- trust) and returns a deliberately minimal field set — no token, no email.
-- ============================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_members') then
    raise exception 'Table public.campaign_members does not exist. Apply 20260823000000_campaign_membership.sql first.';
  end if;
  if not exists (select 1 from pg_proc where proname = 'is_active_campaign_member') then
    raise exception 'Function public.is_active_campaign_member does not exist. Apply 20260826000000_fix_campaign_members_rls_recursion.sql first.';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'geography_wards') then
    raise exception 'Table public.geography_wards does not exist. Apply 20260829000000_election_geography.sql first.';
  end if;
end $$;

-- ---------- table ----------

create table if not exists campaign_invitations (
  id                             uuid primary key default gen_random_uuid(),
  campaign_id                    uuid not null references campaigns(id) on delete cascade,
  token                          text not null unique,
  invited_name                   text not null,
  invited_email                  text not null,
  intended_member_role           text not null check (intended_member_role in ('manager', 'staff')),
  intended_responsibility_role   text check (intended_responsibility_role in
    ('CONSTITUENCY_LEAD', 'LGA_COORDINATOR', 'WARD_COORDINATOR', 'POLLING_UNIT_AGENT')),
  intended_level                 text check (intended_level in ('constituency', 'lga', 'ward', 'polling_unit')),
  intended_geography_ref         text,
  status                         text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by                     uuid references auth.users(id) on delete set null,
  created_at                     timestamptz not null default now(),
  expires_at                     timestamptz,
  accepted_at                    timestamptz,
  accepted_by                    uuid references auth.users(id) on delete set null
);

create index if not exists campaign_invitations_campaign_idx on campaign_invitations(campaign_id, status);

comment on table campaign_invitations is
  'Pending/accepted/expired/revoked invitations into a campaign. Mutable administrative record, not a Canon fact -- see this migration''s own header. No client write policy anywhere; every write is create_campaign_invitation()/accept_campaign_invitation()/revoke_campaign_invitation().';

-- ---------- RLS: members read their own campaign's invitations; no client write ----------
alter table campaign_invitations enable row level security;

drop policy if exists "invitations read own campaign" on campaign_invitations;
create policy "invitations read own campaign" on campaign_invitations
  for select using (public.is_active_campaign_member(campaign_invitations.campaign_id));

-- No insert/update/delete policy for any client role. Deliberately: see
-- this migration's own header on why both writes are privileged functions.
-- The client-side read layer (src/domains/election/invitations/read.js)
-- never selects the `token` column when listing a campaign's own
-- invitations -- it is returned ONLY once, directly, by
-- create_campaign_invitation()'s own RPC response to the inviter.

-- ---------- create_campaign_invitation(): the authorization-critical write ----------
create or replace function public.create_campaign_invitation(
  p_campaign_id uuid,
  p_invited_name text,
  p_invited_email text,
  p_intended_member_role text,
  p_intended_responsibility_role text default null,
  p_intended_level text default null,
  p_intended_geography_ref text default null,
  p_expires_in_days int default 14
)
returns public.campaign_invitations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_my_role text;
  v_authorised boolean := false;
  v_token text;
  v_row public.campaign_invitations;
begin
  if v_uid is null then
    raise exception 'create_campaign_invitation requires an authenticated session';
  end if;
  if p_invited_name is null or btrim(p_invited_name) = '' then
    raise exception 'an invited name is required';
  end if;
  if p_invited_email is null or btrim(p_invited_email) = '' then
    raise exception 'an invited email is required';
  end if;
  if p_intended_member_role not in ('manager', 'staff') then
    raise exception 'intended_member_role must be manager or staff';
  end if;

  select member_role into v_my_role
  from public.campaign_members
  where campaign_id = p_campaign_id and person = v_uid and status = 'active';

  if v_my_role is null then
    raise exception 'you are not an active member of this campaign';
  end if;

  -- WHO MAY INVITE WHOM. Owner/manager (Director-level) may invite anyone,
  -- any role, any geography within their own campaign. A staff member
  -- holding a geography-scoped responsibility may invite exactly one level
  -- below their own, and only within their own scope -- an LGA Coordinator
  -- for Okpe may invite a Ward Coordinator for a ward INSIDE Okpe, never
  -- for Sapele, never another LGA Coordinator, never a Director. This is
  -- the literal database enforcement of Phase 9's access-control ask,
  -- applied to invitation creation specifically.
  if v_my_role in ('owner', 'manager') then
    v_authorised := true;
  elsif p_intended_member_role = 'manager' then
    v_authorised := false; -- only owner/manager may invite another Director
  elsif p_intended_responsibility_role = 'WARD_COORDINATOR' and p_intended_level = 'ward' and p_intended_geography_ref is not null then
    v_authorised := exists (
      select 1
      from public.election_events e
      join public.geography_wards w on w.id::text = p_intended_geography_ref
      where e.campaign_id = p_campaign_id
        and e.type = 'responsibility.assigned'
        and e.payload ->> 'level' = 'lga'
        and e.payload ->> 'geographyRef' = w.lga_id::text
        and e.payload ->> 'person' = 'invite:' || p_campaign_id::text || ':' || v_uid::text
    );
  elsif p_intended_responsibility_role = 'POLLING_UNIT_AGENT' and p_intended_level = 'polling_unit' and p_intended_geography_ref is not null then
    v_authorised := exists (
      select 1
      from public.election_events e
      join public.geography_polling_units pu on pu.id::text = p_intended_geography_ref
      where e.campaign_id = p_campaign_id
        and e.type = 'responsibility.assigned'
        and e.payload ->> 'level' = 'ward'
        and e.payload ->> 'geographyRef' = pu.ward_id::text
        and e.payload ->> 'person' = 'invite:' || p_campaign_id::text || ':' || v_uid::text
    );
  else
    v_authorised := false;
  end if;

  if not v_authorised then
    raise exception 'you are not authorised to invite this role/geography combination';
  end if;

  -- 256 bits of randomness from two concatenated gen_random_uuid() calls --
  -- no pgcrypto dependency (gen_random_uuid() is Postgres core since v13,
  -- the same function every table's `id default` already relies on).
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.campaign_invitations (
    campaign_id, token, invited_name, invited_email, intended_member_role,
    intended_responsibility_role, intended_level, intended_geography_ref,
    status, invited_by, expires_at
  ) values (
    p_campaign_id, v_token, btrim(p_invited_name), btrim(p_invited_email), p_intended_member_role,
    p_intended_responsibility_role, p_intended_level, p_intended_geography_ref,
    'pending', v_uid, now() + make_interval(days => p_expires_in_days)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.create_campaign_invitation(uuid, text, text, text, text, text, text, int) from public;
grant execute on function public.create_campaign_invitation(uuid, text, text, text, text, text, text, int) to authenticated;

-- ---------- get_invitation_preview(): the unauthenticated-safe lookup ----------
create or replace function public.get_invitation_preview(p_token text)
returns table (
  campaign_id uuid, campaign_name text, invited_name text,
  intended_member_role text, intended_responsibility_role text,
  intended_level text, intended_geography_ref text, geography_name text,
  status text, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.campaign_invitations;
  v_campaign_name text;
  v_geo_name text;
begin
  select * into v_inv from public.campaign_invitations where token = p_token;
  if not found then
    return;
  end if;

  select c.name into v_campaign_name from public.campaigns c where c.id = v_inv.campaign_id;

  if v_inv.intended_level = 'constituency' then
    select gc.name into v_geo_name from public.geography_constituencies gc where gc.id::text = v_inv.intended_geography_ref;
  elsif v_inv.intended_level = 'lga' then
    select gl.name into v_geo_name from public.geography_lgas gl where gl.id::text = v_inv.intended_geography_ref;
  elsif v_inv.intended_level = 'ward' then
    select gw.name into v_geo_name from public.geography_wards gw where gw.id::text = v_inv.intended_geography_ref;
  elsif v_inv.intended_level = 'polling_unit' then
    select gp.code into v_geo_name from public.geography_polling_units gp where gp.id::text = v_inv.intended_geography_ref;
  end if;

  return query select v_inv.campaign_id, v_campaign_name, v_inv.invited_name, v_inv.intended_member_role,
    v_inv.intended_responsibility_role, v_inv.intended_level, v_inv.intended_geography_ref, v_geo_name,
    v_inv.status, v_inv.expires_at;
end;
$$;

revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.get_invitation_preview(text) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon;

-- ---------- accept_campaign_invitation(): the second privileged write ----------
create or replace function public.accept_campaign_invitation(p_token text, p_display_name text default null)
returns table (
  campaign_id uuid, intended_member_role text, intended_responsibility_role text,
  intended_level text, intended_geography_ref text, invited_name text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.campaign_invitations;
begin
  -- RETURNS TABLE(campaign_id uuid, ...) implicitly declares `campaign_id`
  -- as a PL/pgSQL variable in this function's scope -- without the pragma
  -- above, the bare `campaign_id` inside `on conflict (campaign_id,
  -- person)` below is genuinely ambiguous between that variable and
  -- campaign_members.campaign_id (Postgres: "column reference is
  -- ambiguous... could refer to either a PL/pgSQL variable or a table
  -- column"). get_invitation_preview() has the same RETURNS TABLE shape
  -- but never references a bare (unqualified) campaign_id, so it is not
  -- affected and needs no such pragma.
  if v_uid is null then
    raise exception 'accept_campaign_invitation requires an authenticated session';
  end if;

  select * into v_inv from public.campaign_invitations where token = p_token for update;
  if not found then
    raise exception 'this invitation does not exist';
  end if;

  if v_inv.status = 'accepted' then
    -- Idempotent for the SAME person re-accepting their own already-
    -- accepted invitation (e.g. a page refresh after success) -- a safe
    -- no-op, not an error. A DIFFERENT person hitting an already-accepted
    -- token is refused: an invitation cannot be reused by a second account.
    if v_inv.accepted_by = v_uid then
      return query select v_inv.campaign_id, v_inv.intended_member_role, v_inv.intended_responsibility_role,
        v_inv.intended_level, v_inv.intended_geography_ref, v_inv.invited_name;
      return;
    end if;
    raise exception 'this invitation has already been accepted';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'this invitation has been revoked';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    update public.campaign_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'this invitation has expired';
  end if;

  -- POSSESSING THE LINK IS NOT ENOUGH. The authenticated caller's own real
  -- email must match who this invitation was actually sent to.
  select email into v_email from auth.users where id = v_uid;
  if lower(coalesce(v_email, '')) <> lower(v_inv.invited_email) then
    raise exception 'this invitation was sent to a different email address than your signed-in account';
  end if;

  -- campaign_members.member_role is the enum campaign_member_role, not
  -- text -- unlike ensure_campaign_owner()'s literal 'owner' (an untyped
  -- literal Postgres resolves contextually), intended_member_role here is
  -- a genuine text COLUMN value and needs an explicit cast.
  insert into public.campaign_members (campaign_id, person, member_role, status, invited_by)
  values (v_inv.campaign_id, v_uid, v_inv.intended_member_role::public.campaign_member_role, 'active', v_inv.invited_by)
  on conflict (campaign_id, person) do nothing;

  update public.campaign_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_uid
  where id = v_inv.id;

  return query select v_inv.campaign_id, v_inv.intended_member_role, v_inv.intended_responsibility_role,
    v_inv.intended_level, v_inv.intended_geography_ref, v_inv.invited_name;
end;
$$;

revoke all on function public.accept_campaign_invitation(text, text) from public;
grant execute on function public.accept_campaign_invitation(text, text) to authenticated;

-- ---------- revoke_campaign_invitation(): safe reinvitation support ----------
create or replace function public.revoke_campaign_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign_id uuid;
  v_my_role text;
begin
  if v_uid is null then
    raise exception 'revoke_campaign_invitation requires an authenticated session';
  end if;

  select campaign_id into v_campaign_id from public.campaign_invitations where id = p_invitation_id;
  if v_campaign_id is null then
    raise exception 'this invitation does not exist';
  end if;

  select member_role into v_my_role from public.campaign_members
  where campaign_id = v_campaign_id and person = v_uid and status = 'active';

  -- Only Director-level (owner/manager) may revoke -- a staff inviter
  -- cannot un-invite someone above the authority that created the
  -- invitation in the first place; keeps revocation at least as
  -- restrictive as creation.
  if v_my_role not in ('owner', 'manager') then
    raise exception 'you are not authorised to revoke invitations in this campaign';
  end if;

  update public.campaign_invitations
  set status = 'revoked'
  where id = p_invitation_id and status = 'pending';
end;
$$;

revoke all on function public.revoke_campaign_invitation(uuid) from public;
grant execute on function public.revoke_campaign_invitation(uuid) to authenticated;

-- ---------- chat rooms: geography-scoped rooms require a matching responsibility ----------
--
-- has_responsibility_for() mirrors is_active_campaign_member()'s exact
-- pattern -- SECURITY DEFINER so it never re-triggers RLS on the tables it
-- reads. 'invite:<campaign>:<uid>' is the SAME roster-person-id convention
-- accept_campaign_invitation-driven onboarding uses (see
-- src/domains/election/invitations/write.js) -- a free-text Mobilization
-- roster entry (never tied to a real auth id) can never match this, which
-- is correct: nobody can log in as a name someone typed into a form.
create or replace function public.has_responsibility_for(p_campaign_id uuid, p_level text, p_geography_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.campaign_members m
      where m.campaign_id = p_campaign_id and m.person = auth.uid()
        and m.status = 'active' and m.member_role in ('owner', 'manager')
    )
    or exists (
      select 1 from public.election_events e
      where e.campaign_id = p_campaign_id
        and e.type = 'responsibility.assigned'
        and e.payload ->> 'level' = p_level
        and e.payload ->> 'geographyRef' = p_geography_ref
        and e.payload ->> 'person' = 'invite:' || p_campaign_id::text || ':' || auth.uid()::text
    );
$$;

revoke all on function public.has_responsibility_for(uuid, text, text) from public;
grant execute on function public.has_responsibility_for(uuid, text, text) to authenticated;

-- Narrowed ONLY for scope_type in ('lga','ward','polling_unit') that
-- actually carry a scope_ref. Every other existing scope_type (national,
-- state, senatorial_district, federal_constituency, state_constituency,
-- team, operations, incident_response, evidence_review) and any
-- lga/ward/polling_unit room created WITHOUT a scope_ref (today's existing
-- ROOM_PRESETS UI never collects one) keep their EXISTING open-self-join
-- behavior, completely unchanged -- this migration adds a real boundary
-- only where real geography data makes one meaningful.
drop policy if exists "chat room members self-join own campaign" on campaign_chat_room_members;
create policy "chat room members self-join own campaign" on campaign_chat_room_members
  for insert with check (
    person = auth.uid()
    and exists (
      select 1 from campaign_chat_rooms r
      where r.id = campaign_chat_room_members.room_id
        and public.is_active_campaign_member(r.campaign_id)
        and (
          r.scope_type not in ('lga', 'ward', 'polling_unit')
          or r.scope_ref is null
          or public.has_responsibility_for(r.campaign_id, r.scope_type, r.scope_ref)
        )
    )
  );
