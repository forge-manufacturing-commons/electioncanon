# Electoral geography import

`geography_wards` and `geography_polling_units` are seeded **empty** by
`supabase/migrations/20260829000000_election_geography.sql`. No authoritative
INEC ward/polling-unit dataset exists in this repository, and none is
fabricated — see that migration's own header.

## Status (National geography pass, Phase A/B)

| Table                        | Coverage today                                          |
|-------------------------------|----------------------------------------------------------|
| `geography_offices`           | Complete — 5 offices, static/constitutional, no import needed |
| `geography_states`            | Complete — 36 states + FCT, static/constitutional, no import needed |
| `geography_lgas`              | **3 of 774** — only Delta's Okpe/Sapele/Uvwie (the acceptance-test slice). A verified, sourced attempt to import the remaining ~771 was made and **declined** this pass — see "Why the national LGA import did not proceed" below. |
| `geography_constituencies`    | **1 row** — the acceptance-test constituency only. Full national federal-constituency/senatorial-district/state-assembly delimitation is not freely available as verifiable structured data. |
| `geography_wards`              | **0** — no authoritative INEC dataset available |
| `geography_polling_units`      | **0** — no authoritative INEC dataset available |

**Classification: NATIONAL GEOGRAPHY ARCHITECTURE READY — AUTHORITATIVE
DATA IMPORT OUTSTANDING.** The schema, RLS, progressive-disclosure reads,
responsibility-assignment validation, readiness roll-up, and the import
tooling below are all built and tested. The *data* to populate them beyond
the original acceptance-test slice has not been imported, because it could
not be verified to the standard this project requires — see below.

### Why the national LGA import did not proceed

Nigeria's 774 LGAs are stable, uncontroversial administrative fact (unlike
ward/PU boundaries, which are INEC's own periodically-revised delimitation
product) — in principle a legitimate, sourceable dataset, the same class of
fact this migration already seeds directly for the 36 states + FCT. An
attempt was made to source it from Wikipedia's "Local government areas of
Nigeria" article. Cross-checking the extracted per-state counts against
well-established figures surfaced **at least two state-level discrepancies**
(the extracted list under/over-counted specific states, and the total came
out to 773 against the well-known figure of 774) — evidence that the
extraction method available in that session was not reliable enough to
import as "verified" data at national scale. Rather than import a dataset
with a *known, demonstrated* error rate under this project's own
"do not fabricate, do not guess" standard, the import was declined. The
existing 3-LGA acceptance-test slice (independently, manually verified) was
left untouched.

**What would unblock this:** a structured, citable dataset (e.g. an
official NBS/INEC publication, or a well-maintained structured repository
that can be fetched and diffed row-by-row rather than summarized) that
permits verifying counts and names per state before loading.

## Import tooling (Phase A infrastructure)

`validate.mjs` — pure validation (state resolution, required-field checks,
in-batch duplicate detection). No network, no filesystem, no Supabase
client — this is what `test/election-geography-import.consumer.mjs` tests
directly, against clearly-labelled *synthetic* fixtures (never real
geography).

`import-lgas.mjs` — the runner. Reads a JSON fixture, validates it against
the real `geography_states` rows, and loads it idempotently. **Must be run
locally, by the operator, with a service-role key** — these tables have no
client write policy for any role (see the RLS section below), so only a
service-role key (which bypasses RLS entirely) can write here. The key is
read only from the environment, never committed, never pasted into chat,
never passed as a CLI argument:

```sh
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
  node supabase/geography-import/import-lgas.mjs supabase/geography-import/fixtures/delta-lgas.json
```

`fixtures/delta-lgas.json` mirrors the migration's own already-verified
Okpe/Sapele/Uvwie seed exactly (same names, same `source` string) — running
the importer against it demonstrates idempotency against real production
data (expected result: `Imported: 0, Conflicts: 3`) without introducing any
new, unverified rows.

This directory is where a real import lands once a verified national source
is supplied. This file documents the exact shape the importer expects, and
the importer script above already implements it — a future contributor
does not need to write one from scratch, only supply a verified fixture.

## LGAs

JSON, one row per LGA — the exact shape `validate.mjs`/`import-lgas.mjs`
implement:

| column      | required | meaning                                                          |
|-------------|----------|-------------------------------------------------------------------|
| state       | yes      | matches `geography_states.name` or `geography_states.code` (case-insensitive) |
| lga         | yes      | LGA name                                                         |
| source      | yes      | e.g. `"NBS 2024 LGA register"` — recorded verbatim in `source`   |

Idempotent load (what `import-lgas.mjs` does, via `.upsert(..., {onConflict:
"state_code,name", ignoreDuplicates: true})` — the JS equivalent of):

```sql
insert into geography_lgas (state_code, name, source)
values (:state_code, :lga, :source)
on conflict (state_code, name) do nothing;
```

## Wards

CSV or JSON, one row per ward:

| column      | required | meaning                                                          |
|-------------|----------|-------------------------------------------------------------------|
| state       | yes      | matches `geography_states.name` (or `code`)                      |
| lga         | yes      | matches `geography_lgas.name` within that state                  |
| ward        | yes      | ward / registration area name                                    |
| source      | yes      | e.g. `"INEC delimitation 2023"` — recorded verbatim in `source`   |

Idempotent load:

```sql
insert into geography_wards (lga_id, name, source)
select l.id, :ward, :source
from geography_lgas l
where l.state_code = :state_code and l.name = :lga
on conflict (lga_id, name) do nothing;
```

## Polling units

CSV or JSON, one row per polling unit:

| column      | required | meaning                                                          |
|-------------|----------|-------------------------------------------------------------------|
| state       | yes      | as above                                                          |
| lga         | yes      | as above                                                          |
| ward        | yes      | matches `geography_wards.name` within that LGA                   |
| code        | yes      | INEC polling unit code (unique within the ward)                  |
| name        | no       | polling unit / address label, if published                       |
| source      | yes      | recorded verbatim in `source`                                    |

Idempotent load:

```sql
insert into geography_polling_units (ward_id, code, name, source)
select w.id, :code, :name, :source
from geography_wards w
join geography_lgas l on l.id = w.lga_id
where l.state_code = :state_code and l.name = :lga and w.name = :ward
on conflict (ward_id, code) do nothing;
```

## Constraints that keep this safe

- Both tables use `unique (parent_id, key)` + `on conflict do nothing` — the
  same batch can be re-run any number of times without creating duplicates.
- `source`/`imported_at` are provenance columns, not a versioning system (see
  the migration header for why full cycle-versioning was deliberately not
  built). A re-delimitation is a **new** import batch with a new `source`
  value describing it — never an edit of existing rows in place.
- These tables have no client write policy (see the migration's RLS
  section) — an import must run with a service-role key **locally, by the
  operator**, never from the frontend, and the key must never be committed
  or pasted into chat.
- Until real rows exist for a given LGA, the app's Territory Explorer shows
  an honest "not imported yet" state for its wards/polling units, and
  `RESPONSIBILITY.ASSIGNED` refuses ward/polling-unit-level assignments
  against that LGA — never a fabricated row or a silent guess.

## Election-cycle awareness — a deliberate non-decision

The spec this pass implements against asks whether ElectionCanon should
support multiple election cycles (2023, 2027, ...) without corrupting
historical records. **No `geography_versions`/cycle schema was added.**
Reasoning, matching the original migration's own header almost exactly:
no real cycle-varying geography exists in this repository to import yet
(only one, still-current, slice). Adding a cycle FK to every geography row
today would carry exactly one possible value everywhere — speculative
schema for a need that doesn't exist yet. `source`/`imported_at` already
give a real, sufficient provenance trail: a future re-delimitation is
handled as a new import batch with a new `source` value describing it
(e.g. `"INEC delimitation review 2027"`), never an edit of existing rows.
If/when a genuine second cycle's geography needs to coexist with the
first, that is the moment to design the versioning relationship the spec
anticipated — against a real second dataset, not a hypothetical one.
