# Electoral geography import

`geography_wards` and `geography_polling_units` are seeded **empty** by
`supabase/migrations/20260829000000_election_geography.sql`. No authoritative
INEC ward/polling-unit dataset exists in this repository, and none is
fabricated — see that migration's own header.

This directory is where a real import lands once a verified source is
supplied. There is no automated importer script yet (out of scope for the
migration that created these tables) — this file documents the exact shape
one should expect so a script can be written against it without redesigning
the schema.

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
