-- ============================================================
-- ELECTORAL GEOGRAPHY — RESPONSIBILITY SLOT UNIQUENESS  (scale-hardening pass)
--
-- THE GAP THIS CLOSES. `RESPONSIBILITY.ASSIGNED` (events.js) gives each
-- assignment its own fresh `responsibility` id (a UUID, like every other
-- event subject in this project) — nothing in the event log itself stops
-- TWO different `responsibility.assigned` events from both targeting the
-- SAME (campaign, level, geographyRef) slot, e.g. two people both recorded
-- as "the LGA Coordinator for Okpe." The UI (TerritoryExplorer.jsx) only
-- ever offers the "Assign X Coordinator" form when its OWN client-side read
-- shows no existing responsibility for that slot — a reasonable UX guard,
-- but not a database-enforced invariant, exactly the class of gap this
-- pass's own instructions name explicitly: "one responsible person per
-- assignment slot where applicable... do not rely solely on frontend
-- checks." Two users clicking "assign" for the same LGA within the same
-- few hundred milliseconds — or any direct API call bypassing the UI
-- guard — could otherwise both succeed, leaving TWO responsibility records
-- both claiming the same slot: precisely the accountability ambiguity
-- ElectionCanon exists to prevent ("who is responsible?" must have ONE
-- answer, not two).
--
-- THE FIX. A unique index on the event log itself, expressed over the
-- jsonb payload's own `level`/`geographyRef` fields, scoped to
-- `responsibility.assigned` events only (a partial index — every other
-- event type is untouched by it). This is the SAME technique Postgres
-- documents for exactly this situation: an expression/partial unique index
-- needs no new column and no change to `election_events`' shape, schema,
-- or RLS. It does not touch event semantics (a `responsibility.assigned`
-- event still means exactly what events.js's header says it means) and
-- does not introduce a second event system — it is a constraint ON the
-- existing one.
--
-- WHAT THIS DELIBERATELY DOES NOT DO. It does not add a "reassign" or
-- "unassign" event/mechanism — that is a real product decision (should a
-- constituency ever be able to replace its LGA Coordinator?) this pass
-- does not make silently. Today, once a slot's FIRST `responsibility.assigned`
-- event is recorded, this constraint makes that permanent at the database
-- level, matching exactly what the current UI already assumes (the assign
-- form disappears forever once a responsibility exists, with no unassign
-- path anywhere in this codebase) — this migration makes that existing
-- assumption atomic and race-proof; it does not change what the product
-- currently allows a campaign to do.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'election_events'
  ) then
    raise exception
      'Table public.election_events does not exist. Apply 20260823000001_election_events.sql first.';
  end if;
end $$;

create unique index if not exists election_events_responsibility_slot_uidx
  on election_events (campaign_id, (payload ->> 'level'), (payload ->> 'geographyRef'))
  where type = 'responsibility.assigned';

comment on index election_events_responsibility_slot_uidx is
  'Enforces at most one responsibility.assigned event per (campaign, level, geographyRef) slot, closing a race condition the UI alone could not — see this migration''s own header. Partial: touches no other event type.';
