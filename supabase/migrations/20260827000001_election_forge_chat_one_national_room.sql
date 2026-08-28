-- ============================================================
-- ELECTION FORGE ALPHA 1.0 — ONE NATIONAL ROOM PER CAMPAIGN
--
-- Found during live Alpha 1.0 verification: ensureNationalRoom()
-- (src/domains/election/chat/api.js) does SELECT-then-INSERT with no
-- transactional guard, so two near-simultaneous calls (Home and Chat both
-- mounting and independently ensuring the room exists) can both observe
-- "no national room yet" and both insert one. A partial unique index turns
-- the loser's insert into a loud 23505 duplicate-key error, which the
-- client already knows how to treat as "someone else won the race,
-- re-read" — the same idempotency discipline election_events already uses
-- (see 20260823000001_election_events.sql and executeElectionWrite()).
-- ============================================================

create unique index if not exists campaign_chat_rooms_one_national_idx
  on campaign_chat_rooms (campaign_id)
  where scope_type = 'national';
