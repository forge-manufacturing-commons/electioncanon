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
tooling below are all built and tested. No new data has been written to
the database this pass — see "National geography data acquisition &
verification pass" below for why the classification stays B even though a
genuinely verified official source now exists.

## National geography data acquisition & verification pass — an official source was found

A subsequent pass (after the Wikipedia attempt documented below was
declined) investigated INEC's own official digital infrastructure directly,
rather than a secondary/community dataset. **INEC's own live Continuous
Voter Registration Polling Unit Locator (`https://cvr.inecnigeria.org/pu`)
is backed by an unauthenticated, public JSON API** — discovered by
inspecting the network requests that page's own State → LGA → Ward →
Polling Unit cascading dropdown makes:

```
GET https://cvr.inecnigeria.org/PublicApi/lgas/1/Search?data[Search][state_id]=<state_id>
GET https://cvr.inecnigeria.org/PublicApi/wards/1/Search?data[Search][local_government_id]=<lga_id>
GET https://cvr.inecnigeria.org/PublicApi/pus/1/Search?data[Search][registration_area_id]=<ward_id>
```

This is INEC's own primary infrastructure — the same data their own public
tool serves to real voters — not a scrape of Wikipedia/Kaggle/GitHub. See
`inec-source.mjs` for the client (`parseCascadeResponse()`, tested; the live
`fetch*` functions are intentionally untested — real network I/O, see that
file's own header) and `integrity.mjs` for the validation pipeline
(duplicate/orphan/malformed-id/inconsistency/count-reconciliation/
conflicting-extract detection).

**A controlled Delta State pilot was run** (not a national import — see
`reconcile-delta.mjs` and `fixtures/inec-delta-*-live.json` for the full,
real, captured data):

- National totals, confirmed directly from `inecnigeria.org/polling-units/`:
  **37 states+FCT, 774 LGAs, 8,809 wards, 176,846 polling units** — all
  reconcile exactly against the figures this pass was asked to check.
- Delta State, fully live-crawled (all 25 LGAs → all wards → PU counts,
  zero unresolved requests): **25 LGAs (matches expected), 270 wards,
  5,863 polling units.**
- The existing acceptance-test slice (Okpe/Sapele/Uvwie) confirmed
  present in INEC's own data, by name, with real ward counts: **Okpe 10
  wards, Sapele 11 wards, Uvwie 10 wards (31 total)** — none of which are
  imported into ElectionCanon yet. This is the exact, real, non-fabricated
  gap the next pass would close.
- Integrity checks over the real captured data: 0 duplicate ward names,
  0 duplicate INEC ids, 0 malformed identifiers.
- **The existing 3-LGA seed was not touched.** No migration, no write, no
  service-role call — `reconcile-delta.mjs` makes zero network/database
  calls; it only reads the two fixture files above.

Run the reconciliation report yourself: `node
supabase/geography-import/reconcile-delta.mjs`.

**Why this stays classification B, not A**, even with a verified source in
hand: only Delta was piloted (reconciliation, not import); the other 35
states+FCT have not been crawled; and — critically — **no data has actually
been written to the database**. Per this pass's own explicit instruction,
national import is a *separate, subsequent* decision, proposed only after
this reconciliation is reviewed.

**Open questions for whoever approves the next step:** (1) INEC's own
interface does not label this data with an explicit election-cycle/year —
it is the live, current CVR configuration, described here as such rather
than asserted as "2023" or "2027" data; (2) this endpoint is not documented
by INEC as a public API and could change or be rate-limited without notice
— a real import would need retry/backoff logic (one transient non-JSON
response was observed and successfully retried during the Delta crawl).

### Why the earlier national LGA import attempt did not proceed

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
permits verifying counts and names per state before loading. **Superseded
by the finding above** — INEC's own `PublicApi` now serves exactly this,
row-by-row and verifiable, for LGAs/wards/polling units alike, not just
LGAs.

## Import tooling (Phase A infrastructure)

`validate.mjs` — pure validation (state resolution, required-field checks,
in-batch duplicate detection). No network, no filesystem, no Supabase
client — this is what `test/election-geography-import.consumer.mjs` tests
directly, against clearly-labelled *synthetic* fixtures (never real
geography).

`inec-source.mjs` — the live INEC `PublicApi` client (`parseCascadeResponse()`,
pure and tested; `fetchLgasForState()`/`fetchWardsForLga()`/
`fetchPollingUnitsForWard()`, real network I/O, intentionally untested —
see the file's own header). `integrity.mjs` — the validation pipeline
(`findDuplicates`, `findOrphans`, `findMalformedIdentifiers`,
`findInconsistent`, `reconcileCount`, `findConflicts`), pure and tested.
`reconcile-delta.mjs` — the read-only Delta pilot report, run against the
real captured fixtures below; makes no network or database call itself.
See `test/election-geography-inec-reconciliation.consumer.mjs` for the
full test coverage (parsing, validation pipeline, and the real-data Delta
reconciliation) and the "National geography data acquisition &
verification pass" section above for the findings.

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

## Pre-import qualification pass — tooling, multi-state pilot, and a hard boundary

Building on the Delta-only reconciliation above, this pass added the
production-grade acquisition machinery and ran a wider (still read-only,
still zero database writes) pilot before any import is proposed.

**New tooling** (all pure/injectable where the logic is testable, all
network I/O isolated to one file — see each file's own header):
- `harden.mjs` — `fetchWithRetry()` (timeout + exponential backoff, capped
  retries, a THREE-WAY outcome: `OK` / `REQUEST_FAILED` / `INVALID_RESPONSE`
  — a failed request can never silently become an empty result),
  `runBounded()` (bounded concurrency + polite request pacing),
  `tallyOutcome()`, `checksumOf()` (deterministic SHA-256).
- `checkpoint.mjs` — load/save/resume primitives; a crawl interrupted
  partway through loses at most the one state in progress.
- `acquire-national-snapshot.mjs` — the real, hardened national crawler.
  Concurrency capped at 3, ~60ms stagger between request starts, 10s
  per-request timeout, 5 retries with exponential backoff. Writes
  `snapshots/national-snapshot.json` (gitignored — generated data, not
  source), `snapshots/manifest.json` (source/provenance/counts/checksum),
  and an `snapshots/acquisition-log.jsonl` of every retry/failure.
- `national-integrity-report.mjs` — runs the full `integrity.mjs`
  pipeline over an acquired snapshot; writes a machine-readable JSON
  report and a human-readable table, one row per state, every anomaly
  category always present even at zero.
- `dry-run-import.mjs` — reads REAL existing rows (read-only — this
  script calls nothing but `.select()`) and diffs them against
  INEC-sourced candidate rows via `integrity.mjs`'s `diffForImport()`,
  proving insert/already-existing/conflicting counts without writing
  anything.

**Multi-state qualification pilot.** Delta (control, from the prior pass)
plus Lagos, Kano, Rivers, and FCT — chosen for being maximally different
(Lagos: dense/urban; Kano: largest LGA count; Rivers: Niger Delta;
FCT: federal territory, only 6 LGAs). All five reconciled cleanly: LGA
counts matched INEC's own figures exactly in every case, zero request
failures, zero validation anomalies. See `snapshots/integrity-report.txt`
for the full per-state table once `national-integrity-report.mjs` has
been run against an acquired snapshot.

**A hard, deliberate boundary: administrative geography vs. electoral
delimitation.** The verified INEC CVR source qualifies problem A —
State → LGA → Ward → Polling Unit, the administrative/polling hierarchy —
convincingly. It does **not** qualify problem B — Office → Constituency →
constituent LGAs/Wards, INEC's own electoral delimitation. No federal
constituency, senatorial district, or state-assembly-constituency boundary
is inferred from names or assumed from administrative geography anywhere
in this codebase. The existing, independently-verified Okpe/Sapele/Uvwie
constituency seed remains exactly as it was. **Acquiring authoritative
constituency delimitation is a separate, still-open problem for a future
pass** — INEC does publish delimitation review reports (e.g. the
Warri Federal Constituency case), but as narrative PDF documents on a
case-by-case basis, not as a structured, queryable dataset the way the
CVR `PublicApi` serves administrative geography. No live equivalent was
found during this pass's research.

**Scale review (Phase 7) — no index changes needed.** Now that a full
national snapshot has actually been acquired (774 LGAs, 8,810 wards,
176,846 polling units — see below), every existing query pattern in this
codebase was checked against it. All four existing indexes already exist
from `20260829000000_election_geography.sql` and are exactly what each
pattern needs:

| Index | Backs |
|---|---|
| `geography_lgas_state_idx (state_code)` | `getStateTerritory()`'s `.eq("state_code", ...)` |
| `geography_wards_lga_idx (lga_id)` | `getConstituencyTerritory()`/`getStateTerritory()`'s `.in("lga_id", [...])`, `listWardsForLga()`'s `.eq("lga_id", ...)` |
| `geography_polling_units_ward_idx (ward_id)` | the count-only `.in("ward_id", [...])` PU-total query, `listPollingUnitsForWard()`'s `.eq("ward_id", ...)` |
| `geography_constituency_lgas_lga_idx (lga_id)` | `create_campaign_invitation()`'s ward/LGA authorization joins |

No query anywhere in Territory Explorer, Organisation's geography
selectors, invitation geography validation, responsibility validation, or
readiness roll-up ever scans an unbounded slice of `geography_wards`/
`geography_polling_units` — every one is scoped to one state's LGAs, one
constituency's LGAs' wards, or one specific ward's polling units (and the
PU-total query is COUNT-only, never fetching rows). This holds at the now
CONFIRMED real national row counts, not just in theory — **no new index
is proposed**, per this pass's own "do not add speculatively" instruction.

**A real, notable finding from the full national crawl.** One anomaly:
Benue State's GWER EAST LGA has TWO wards both named "MBAIKYAAN" — one
real (INEC ward id 1462, populated with real polling units) and one
apparently empty duplicate (INEC ward id 8810, zero polling units). This
single extra ward accounts for the entire national ward-count discrepancy
(8,810 acquired vs. INEC's own stated ~8,809). **Not corrected, not
merged, not guessed** — flagged for human review (with direct INEC
contact, if pursued) before any import touches Benue/GWER EAST
specifically. Every other one of the 774 LGAs, 8,809 other wards, and
176,846 polling units shows zero duplicate ids, zero orphans, and zero
malformed identifiers.

## Production import (State → LGA → Ward → Polling Unit only)

`import-national-geography.mjs` — the runner. Reads the local snapshot,
resolves INEC ids to real database ids level by level (LGA → Ward → PU),
and either PRINTS the resulting plan (dry run, the default) or EXECUTES
it (`DRY_RUN=false`, explicit). Every write is `.upsert(..., {onConflict,
ignoreDuplicates:true})` against the same real unique constraints the
original migration defined — idempotent by construction, never a
duplicate, never an update/delete of an existing row. Never touches
`geography_constituencies`/`geography_constituency_lgas` — constituency
delimitation stays out of scope (see below).

**The Benue/GWER EAST/MBAIKYAAN duplicate ward (INEC id 8810, empty, see
the pre-import qualification pass above) is quarantined** —
`quarantine.mjs` lists it explicitly, with a reason; `import-plan.mjs`'s
`planWardImport()` excludes it from every plan before insert/existing
classification even runs. The real, populated ward (id 1462) imports
normally. Quarantining is a recorded human decision, not something the
importer infers — extending the list requires editing `quarantine.mjs`
directly.

```sh
# Dry run first — always, no writes performed:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node supabase/geography-import/import-national-geography.mjs

# Only after reviewing the dry-run output:
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DRY_RUN=false \
  node supabase/geography-import/import-national-geography.mjs
```

## Running the national acquisition + report yourself:
```sh
node supabase/geography-import/acquire-national-snapshot.mjs   # read-only, resumable, polite pacing
node supabase/geography-import/national-integrity-report.mjs   # analyzes the resulting local snapshot
```
Neither script requires any credential — both are pure reads against
INEC's own public endpoint plus local file I/O. `dry-run-import.mjs` is
the only script in this set that touches the ElectionCanon database, and
even it only ever calls `.select()`.
