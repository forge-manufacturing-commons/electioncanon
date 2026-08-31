-- ============================================================
-- ELECTORAL GEOGRAPHY — Election / Office / State / Constituency / LGA
--
-- A NEW RLS PATTERN, DELIBERATE, NOT AN OVERSIGHT. Every prior table in
-- this project's Election domain is either event-sourced (election_events,
-- tenant-scoped by campaign_id inside projectElection()'s own fold) or a
-- plain relational table scoped to ONE campaign via `is_active_campaign_member()`
-- (campaign_chat_*, campaign_studio_assets, the evidence storage bucket).
-- The tables below have no `campaign_id` at all, because electoral
-- geography is not tenant data — "Uvwie LGA exists" is true regardless of
-- which campaign is asking, and two campaigns in the same constituency must
-- see the exact same rows, not two private copies. So this migration
-- introduces a THIRD pattern: public-to-any-authenticated-user SELECT, and
-- NO INSERT/UPDATE/DELETE policy for any client role at all. Population is
-- this migration's own seed data, or a future service-role import script
-- run locally by the operator — never through electionWebAdapter.js, never
-- bundled into the frontend.
--
-- WHAT THIS DOES NOT DO. It does not touch campaigns, campaign_members,
-- election_events, or any existing RLS policy. A campaign's CHOICE of
-- territory, and WHO is responsible for which part of it, are Canon facts
-- and belong on the existing event log instead (see events.js's
-- TERRITORY.SET / RESPONSIBILITY.* — this migration adds no table for
-- either, on purpose).
--
-- NO GEOGRAPHY_CYCLE / VERSIONING TABLE. Rejected as speculative schema:
-- only one real data slice (Delta State's Okpe/Sapele/Uvwie constituency)
-- is seeded this pass, so a cycle/version FK on every row would carry
-- exactly one possible value everywhere — the same "add a column because it
-- might be useful later" failure this project's own conventions warn
-- against elsewhere. `source`/`imported_at` on the three real-data tables
-- (geography_lgas/geography_wards/geography_polling_units) cover
-- provenance without the join overhead; a future re-delimitation is a new
-- import batch with a new `source` value, never an edit in place.
--
-- WARD AND POLLING-UNIT DATA IS DELIBERATELY NOT SEEDED HERE. No
-- authoritative INEC dataset is available in this repository. Seeding
-- invented rows would be exactly the fabrication this product exists to
-- refuse. See supabase/geography-import/README.md for the exact shape a
-- future real import expects.
-- ============================================================

-- ---------- reference tables ----------

create table if not exists geography_offices (
  id             text primary key,
  name           text not null,
  boundary_level text not null check (boundary_level in
    ('national', 'state', 'senatorial_district', 'federal_constituency', 'state_constituency')),
  sort_order     int not null default 0
);
comment on table geography_offices is
  'Which elective office a campaign is contesting, and which electoral boundary tier that office resolves against (boundary_level). Public reference data — see this migration''s own header for why.';

create table if not exists geography_states (
  code       text primary key,
  name       text not null unique,
  sort_order int not null default 0
);
comment on table geography_states is 'Nigeria''s 36 states + FCT. Public reference data.';

create table if not exists geography_lgas (
  id          uuid primary key default gen_random_uuid(),
  state_code  text not null references geography_states(code) on delete cascade,
  name        text not null,
  source      text,
  imported_at timestamptz not null default now(),
  unique (state_code, name)
);
create index if not exists geography_lgas_state_idx on geography_lgas(state_code);
comment on table geography_lgas is
  'Local Government Areas. Only rows independently verifiable at seed time are present — see this migration''s seed section and supabase/geography-import/README.md for how the rest arrives.';

create table if not exists geography_constituencies (
  id         uuid primary key default gen_random_uuid(),
  office_id  text not null references geography_offices(id) on delete cascade,
  state_code text not null references geography_states(code) on delete cascade,
  name       text not null,
  unique (office_id, state_code, name)
);
create index if not exists geography_constituencies_office_state_idx
  on geography_constituencies(office_id, state_code);
comment on table geography_constituencies is
  'A named electoral constituency for a given office within a state (e.g. a Federal Constituency for House of Representatives). Only the acceptance-test slice is seeded this pass — see this migration''s seed section.';

create table if not exists geography_constituency_lgas (
  constituency_id uuid not null references geography_constituencies(id) on delete cascade,
  lga_id          uuid not null references geography_lgas(id) on delete cascade,
  primary key (constituency_id, lga_id)
);
create index if not exists geography_constituency_lgas_lga_idx on geography_constituency_lgas(lga_id);
comment on table geography_constituency_lgas is
  'Which LGAs make up a constituency (a federal constituency may span multiple LGAs, as Okpe/Sapele/Uvwie does).';

create table if not exists geography_wards (
  id          uuid primary key default gen_random_uuid(),
  lga_id      uuid not null references geography_lgas(id) on delete cascade,
  name        text not null,
  source      text,
  imported_at timestamptz not null default now(),
  unique (lga_id, name)
);
create index if not exists geography_wards_lga_idx on geography_wards(lga_id);
comment on table geography_wards is
  'Wards / registration areas. DELIBERATELY SEEDED EMPTY by this migration — no authoritative dataset is available in this repository. See supabase/geography-import/README.md.';

create table if not exists geography_polling_units (
  id          uuid primary key default gen_random_uuid(),
  ward_id     uuid not null references geography_wards(id) on delete cascade,
  code        text not null,
  name        text,
  source      text,
  imported_at timestamptz not null default now(),
  unique (ward_id, code)
);
create index if not exists geography_polling_units_ward_idx on geography_polling_units(ward_id);
comment on table geography_polling_units is
  'Polling units. DELIBERATELY SEEDED EMPTY by this migration — no authoritative dataset is available in this repository. See supabase/geography-import/README.md.';

-- ---------- RLS: public-authenticated-read, zero client-write ----------
-- Identical block per table, on purpose (not extracted into a function —
-- there is nothing to parameterise; every table needs the exact same
-- policy). No INSERT/UPDATE/DELETE policy is granted anywhere below, for
-- any client role — see this migration's own header.

alter table geography_offices enable row level security;
revoke all on geography_offices from anon;
grant select on geography_offices to authenticated;
drop policy if exists "geography offices read" on geography_offices;
create policy "geography offices read" on geography_offices for select using (true);

alter table geography_states enable row level security;
revoke all on geography_states from anon;
grant select on geography_states to authenticated;
drop policy if exists "geography states read" on geography_states;
create policy "geography states read" on geography_states for select using (true);

alter table geography_lgas enable row level security;
revoke all on geography_lgas from anon;
grant select on geography_lgas to authenticated;
drop policy if exists "geography lgas read" on geography_lgas;
create policy "geography lgas read" on geography_lgas for select using (true);

alter table geography_constituencies enable row level security;
revoke all on geography_constituencies from anon;
grant select on geography_constituencies to authenticated;
drop policy if exists "geography constituencies read" on geography_constituencies;
create policy "geography constituencies read" on geography_constituencies for select using (true);

alter table geography_constituency_lgas enable row level security;
revoke all on geography_constituency_lgas from anon;
grant select on geography_constituency_lgas to authenticated;
drop policy if exists "geography constituency_lgas read" on geography_constituency_lgas;
create policy "geography constituency_lgas read" on geography_constituency_lgas for select using (true);

alter table geography_wards enable row level security;
revoke all on geography_wards from anon;
grant select on geography_wards to authenticated;
drop policy if exists "geography wards read" on geography_wards;
create policy "geography wards read" on geography_wards for select using (true);

alter table geography_polling_units enable row level security;
revoke all on geography_polling_units from anon;
grant select on geography_polling_units to authenticated;
drop policy if exists "geography polling_units read" on geography_polling_units;
create policy "geography polling_units read" on geography_polling_units for select using (true);

-- ---------- seed: offices ----------

insert into geography_offices (id, name, boundary_level, sort_order) values
  ('president',      'President',                     'national',             1),
  ('governor',        'Governor',                      'state',                2),
  ('senator',         'Senator',                        'senatorial_district',  3),
  ('house_of_reps',   'House of Representatives',       'federal_constituency', 4),
  ('state_assembly',  'State House of Assembly',        'state_constituency',   5)
on conflict (id) do nothing;

-- ---------- seed: states (36 + FCT) ----------

insert into geography_states (code, name, sort_order) values
  ('abia', 'Abia', 1), ('adamawa', 'Adamawa', 2), ('akwa_ibom', 'Akwa Ibom', 3),
  ('anambra', 'Anambra', 4), ('bauchi', 'Bauchi', 5), ('bayelsa', 'Bayelsa', 6),
  ('benue', 'Benue', 7), ('borno', 'Borno', 8), ('cross_river', 'Cross River', 9),
  ('delta', 'Delta', 10), ('ebonyi', 'Ebonyi', 11), ('edo', 'Edo', 12),
  ('ekiti', 'Ekiti', 13), ('enugu', 'Enugu', 14), ('fct', 'Federal Capital Territory', 15),
  ('gombe', 'Gombe', 16), ('imo', 'Imo', 17), ('jigawa', 'Jigawa', 18),
  ('kaduna', 'Kaduna', 19), ('kano', 'Kano', 20), ('katsina', 'Katsina', 21),
  ('kebbi', 'Kebbi', 22), ('kogi', 'Kogi', 23), ('kwara', 'Kwara', 24),
  ('lagos', 'Lagos', 25), ('nasarawa', 'Nasarawa', 26), ('niger', 'Niger', 27),
  ('ogun', 'Ogun', 28), ('ondo', 'Ondo', 29), ('osun', 'Osun', 30),
  ('oyo', 'Oyo', 31), ('plateau', 'Plateau', 32), ('rivers', 'Rivers', 33),
  ('sokoto', 'Sokoto', 34), ('taraba', 'Taraba', 35), ('yobe', 'Yobe', 36),
  ('zamfara', 'Zamfara', 37)
on conflict (code) do nothing;

-- ---------- seed: acceptance-test slice ONLY (Delta / Okpe-Sapele-Uvwie) ----------
-- No other Delta constituency and no other Delta LGA is seeded — asserting
-- them without a verified source would be exactly the fabrication this
-- migration's header explains this whole feature exists to refuse.

insert into geography_lgas (state_code, name, source) values
  ('delta', 'Okpe',   'manual-verified-2026'),
  ('delta', 'Sapele', 'manual-verified-2026'),
  ('delta', 'Uvwie',  'manual-verified-2026')
on conflict (state_code, name) do nothing;

insert into geography_constituencies (office_id, state_code, name) values
  ('house_of_reps', 'delta', 'Okpe/Sapele/Uvwie Federal Constituency')
on conflict (office_id, state_code, name) do nothing;

insert into geography_constituency_lgas (constituency_id, lga_id)
select c.id, l.id
from geography_constituencies c
cross join geography_lgas l
where c.office_id = 'house_of_reps'
  and c.state_code = 'delta'
  and c.name = 'Okpe/Sapele/Uvwie Federal Constituency'
  and l.state_code = 'delta'
  and l.name in ('Okpe', 'Sapele', 'Uvwie')
on conflict (constituency_id, lga_id) do nothing;

-- geography_wards / geography_polling_units: NO seed rows. See this
-- migration's own header and supabase/geography-import/README.md.
