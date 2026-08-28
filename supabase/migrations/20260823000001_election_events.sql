-- ============================================================
-- FORGE ELECTION — EVENT LOG  (the authoritative persistence layer)
--
-- PROPOSED. NOT YET APPLIED TO ANY LIVE PROJECT — same status every
-- migration in this project carries until a human reviews and runs it.
--
-- THE GAP THIS CLOSES. `src/domains/election/events.js` and
-- `projections.js` are sound and tested (test/election.consumer.mjs,
-- test/election-readiness.consumer.mjs), and `src/domains/election/studio/
-- write.js`'s `executeElectionWrite` already inserts into a table named
-- `election_events` with exactly the columns this migration defines — but
-- until now no such table existed anywhere, so that call site was dead code
-- against a live database. This migration is that persistence, closing the
-- gap the same way `20260821000000_business_events.sql` closed it for
-- Business Canon.
--
-- SCOPED THROUGH `campaigns`/`campaign_members`, NOT `organisations`. See
-- `20260823000000_campaign_membership.sql`'s header for the full
-- architectural decision record — a campaign is a genuinely separate tenant
-- primitive from an organisation, so this table's RLS mirrors
-- `business_events`'s SHAPE (append-only, actor enforced by the database,
-- tenant scoped by an EXISTS against the membership table) without
-- borrowing its actual tenant table.
--
-- COLUMNS DERIVED FROM THE REAL EVENT FACTORIES, NOT INVENTED. Every column
-- here corresponds to a field `src/domains/election/events.js`'s factories
-- (`candidateEvent`, `wardAssignedEvent`, `wardStatusEvent`) actually
-- produce, or to a fact `executeElectionWrite`'s own insert call already
-- supplies:
--   event_id        <- event.eventId               (createEvent(), events.js)
--   campaign_id      <- campaign                     (the resolved tenant scope)
--   type            <- event.type                    (ELECTION_EVENT_TYPES.*)
--   actor           <- userId                        (the authenticated caller)
--   schema_version  <- "1"                            (write.js's literal today)
--   payload         <- event                          (the full validated event object)
-- No column is added "because it might be useful later" — see the general
-- development-rules discipline against speculative schema.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_members'
  ) then
    raise exception
      'Table public.campaign_members does not exist. Apply 20260823000000_campaign_membership.sql first — this migration''s RLS depends on it.';
  end if;
end $$;

create table if not exists election_events (
  id              bigserial primary key,
  event_id        text not null unique,
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  type            text not null,
  -- WHO RECORDED THIS, established by the SESSION, never by the payload —
  -- identical discipline to business_events.actor. A client cannot claim to
  -- be someone else; the INSERT policy below requires actor = auth.uid().
  actor           uuid not null references auth.users(id) on delete restrict,
  correlation_id  text,
  schema_version  text not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists election_events_campaign_idx
  on election_events(campaign_id, created_at desc);
create index if not exists election_events_campaign_type_idx
  on election_events(campaign_id, type);

comment on table election_events is
  'The authoritative Election Canon event log. Append-only — no update or delete policy is granted to any client, matching business_events and audit_events. RLS scopes every read and write through campaign_members, never through a client-supplied campaign_id alone.';

-- ---------- ROW LEVEL SECURITY ----------
alter table election_events enable row level security;

-- READ: an active member of the SAME campaign only.
drop policy if exists "election events read own campaign" on election_events;
create policy "election events read own campaign" on election_events
  for select using (
    exists (
      select 1 from campaign_members m
      where m.campaign_id = election_events.campaign_id
        and m.person = auth.uid()
        and m.status = 'active'
    )
  );

-- WRITE: an active member of the SAME campaign, recording AS THEMSELVES.
-- `actor = auth.uid()` in the WITH CHECK, not merely in application code —
-- the same two-independent-enforcement-points discipline business_events'
-- own header names: resolveElectionScope() upstream is one gate, this is
-- the second, and a request naming another campaign's id or another
-- person's identity as actor is refused by the database itself either way.
drop policy if exists "election events insert own campaign" on election_events;
create policy "election events insert own campaign" on election_events
  for insert with check (
    actor = auth.uid()
    and exists (
      select 1 from campaign_members m
      where m.campaign_id = election_events.campaign_id
        and m.person = auth.uid()
        and m.status = 'active'
    )
  );

-- No update policy, no delete policy — granted to nobody. The log is
-- immutable by construction. A correction is itself a new event, never an
-- edit to history.

-- ---------- IDEMPOTENCY ----------
-- `event_id` carries the SAME `unique` constraint business_events.event_id
-- does — the single idempotency mechanism, not a second one. The tested
-- behaviour in test/election-readiness.consumer.mjs (N1: replaying the same
-- confirmationId is reported as already-recorded) already assumes exactly
-- this constraint exists at the database layer; this migration is what
-- makes that assumption true against a live database rather than only a
-- fake in-memory client.

-- ---------- ROLE-BASED WRITE RESTRICTIONS: DECLARED, NOT WIRED ----------
-- Whether a 'staff' campaign member may record every event type or only
-- 'owner'/'manager' may is a real policy decision this migration
-- deliberately does NOT make — the same status business_events.sql leaves
-- it in, and the same status Election's own EVENT_CAPABILITY already
-- carries ("declared, not yet wired into policy.js").
