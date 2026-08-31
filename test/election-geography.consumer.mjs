// ============================================================
// ELECTORAL GEOGRAPHY — TERRITORY  (MOCK evidence)
//
// Same fake-client pattern election-mobilization.consumer.mjs already
// establishes for election_events, extended with a minimal thenable
// query-builder stub for the geography_* reference tables (geography/
// read.js) — fixture-shaped exactly like the real migration's seed data
// for the acceptance-test constituency, so `getConstituencyTerritory()`
// resolving to Okpe/Sapele/Uvwie is proven against the SAME code path the
// live app uses, not a separate hand-rolled check.
// ============================================================

import {
  proposeSetTerritory, executeSetTerritory,
} from "../src/domains/election/geography/write.js";
import { getConstituencyTerritory, listConstituencies, listPollingUnitsForWard } from "../src/domains/election/geography/read.js";
import { projectElection } from "../src/domains/election/projections.js";
import { ELECTION_EVENT_TYPES } from "../src/domains/election/events.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTORAL GEOGRAPHY — Territory\n");

// ---------- event-log fake client (election_events) ----------
function fakeEventClient() {
  const rows = [];
  return {
    rows,
    from(table) {
      return {
        insert: async (row) => {
          if (rows.some((r) => r.table === table && r.event_id === row.event_id)) {
            const err = new Error('duplicate key value violates unique constraint "election_events_event_id_key"');
            err.code = "23505";
            return { error: err };
          }
          rows.push({ table, ...row });
          return { error: null };
        },
      };
    },
  };
}
const logFor = (client, campaignId) =>
  client.rows.filter((r) => r.table === "election_events" && r.campaign_id === campaignId).map((r) => r.payload).reverse();

// ---------- reference-table fake client (geography_*) ----------
function fakeTable(rows) {
  let filtered = rows;
  let countMode = false;
  const builder = {
    // Mirrors Supabase's `.select(cols, {count:'exact', head:true})` — a
    // bounded COUNT query that transfers no row data, the exact mechanism
    // getConstituencyTerritory() now uses for polling-unit totals (see
    // read.js's own scale-hardening header) instead of fetching every row.
    select(_cols, opts) { if (opts?.count) countMode = true; return builder; },
    eq(key, value) { filtered = filtered.filter((r) => r[key] === value); return builder; },
    in(key, values) { filtered = filtered.filter((r) => values.includes(r[key])); return builder; },
    order() { return builder; },
    async maybeSingle() { return { data: filtered[0] ?? null, error: null }; },
    then(resolve) {
      if (countMode) { resolve({ data: null, count: filtered.length, error: null }); return; }
      resolve({ data: filtered, error: null });
    },
  };
  return builder;
}
function fakeGeographyClient(fixture) {
  return { from: (table) => fakeTable(fixture[table] ?? []) };
}

const CAMPAIGN_A = "camp-a";
const CAMPAIGN_B = "camp-b";
const USER = "user-1";

// The acceptance-test slice, shaped exactly like the real migration seeds it.
const CONSTITUENCY_ID = "constituency-osu";
const LGA_OKPE = "lga-okpe", LGA_SAPELE = "lga-sapele", LGA_UVWIE = "lga-uvwie";
const geographyFixture = {
  geography_offices: [
    { id: "house_of_reps", name: "House of Representatives", boundary_level: "federal_constituency", sort_order: 4 },
    { id: "president", name: "President", boundary_level: "national", sort_order: 1 },
  ],
  geography_states: [{ code: "delta", name: "Delta", sort_order: 10 }],
  geography_constituencies: [
    { id: CONSTITUENCY_ID, office_id: "house_of_reps", state_code: "delta", name: "Okpe/Sapele/Uvwie Federal Constituency" },
  ],
  geography_constituency_lgas: [
    { constituency_id: CONSTITUENCY_ID, lga_id: LGA_OKPE, geography_lgas: { id: LGA_OKPE, name: "Okpe", state_code: "delta" } },
    { constituency_id: CONSTITUENCY_ID, lga_id: LGA_SAPELE, geography_lgas: { id: LGA_SAPELE, name: "Sapele", state_code: "delta" } },
    { constituency_id: CONSTITUENCY_ID, lga_id: LGA_UVWIE, geography_lgas: { id: LGA_UVWIE, name: "Uvwie", state_code: "delta" } },
  ],
  geography_wards: [],
  geography_polling_units: [],
};
const OFFICES = geographyFixture.geography_offices;
const STATES = geographyFixture.geography_states;
const CONSTITUENCIES = geographyFixture.geography_constituencies;

// ---------- read.js against the migration-shaped fixture ----------
{
  const client = fakeGeographyClient(geographyFixture);
  const { data: territory, error } = await getConstituencyTerritory({ client, constituencyId: CONSTITUENCY_ID });
  ok("R1. getConstituencyTerritory resolves with no error", error === null);
  ok("R2. it resolves EXACTLY the 3 acceptance-test LGAs: Okpe, Sapele, Uvwie",
     territory.lgas.length === 3 && territory.lgas.map((l) => l.name).join(",") === "Okpe,Sapele,Uvwie");
  ok("R3. wards are honestly empty, pollingUnitTotal is honestly 0 — no fabricated rows", territory.wards.length === 0 && territory.pollingUnitTotal === 0);

  const { data: constituencies } = await listConstituencies({ client, officeId: "house_of_reps", stateCode: "delta" });
  ok("R4. listConstituencies finds the seeded Okpe/Sapele/Uvwie constituency for House of Reps / Delta",
     constituencies.length === 1 && constituencies[0].name === "Okpe/Sapele/Uvwie Federal Constituency");
}

// ---------- scale-hardening: polling-unit TOTAL is a bounded count, never a full row fetch ----------
{
  // A fixture WITH real wards/polling units, to prove the count path
  // actually works (not merely that it's skipped when empty, per R3 above).
  const WARD_A = "ward-a", WARD_B = "ward-b";
  const scaledFixture = {
    ...geographyFixture,
    geography_wards: [
      { id: WARD_A, lga_id: LGA_OKPE, name: "Okpe Ward 1" },
      { id: WARD_B, lga_id: LGA_SAPELE, name: "Sapele Ward 1" },
    ],
    geography_polling_units: [
      { id: "pu-1", ward_id: WARD_A, code: "PU001", name: null },
      { id: "pu-2", ward_id: WARD_A, code: "PU002", name: null },
      { id: "pu-3", ward_id: WARD_B, code: "PU003", name: null },
    ],
  };
  const client = fakeGeographyClient(scaledFixture);
  const { data: territory } = await getConstituencyTerritory({ client, constituencyId: CONSTITUENCY_ID });
  ok("R5. pollingUnitTotal correctly counts all 3 PUs across both wards, via a count-only query",
     territory.pollingUnitTotal === 3);
  ok("R5b. the ward rows themselves ARE fetched in full (small, bounded) — 2 wards, both present",
     territory.wards.length === 2 && territory.wards.map((w) => w.name).sort().join(",") === "Okpe Ward 1,Sapele Ward 1");

  const { data: puForWardA } = await listPollingUnitsForWard({ client, wardId: WARD_A });
  ok("R6. listPollingUnitsForWard (the lazy per-ward fetch TerritoryExplorer uses on expand) returns ONLY that ward's 2 PUs, not all 3",
     puForWardA.length === 2 && puForWardA.every((p) => p.ward_id === WARD_A));
}

// ---------- proposeSetTerritory / executeSetTerritory ----------
{
  const eventClient = fakeEventClient();
  const prepared = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "house_of_reps", stateCode: "delta", constituencyId: CONSTITUENCY_ID },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  ok("T1. proposeSetTerritory with a valid selection is PREPARED", prepared.status === "PREPARED");
  const result = await executeSetTerritory({ draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client: eventClient, confirmationId: "territory-1" });
  ok("T2. executeSetTerritory succeeds and inserts a territory.set event", result.success && result.event.type === ELECTION_EVENT_TYPES.TERRITORY.SET);

  const view = projectElection(logFor(eventClient, CAMPAIGN_A), CAMPAIGN_A);
  ok("T3. the fold resolves the territory with office/state/constituency intact",
     view.territory?.office === "house_of_reps" && view.territory?.state === "delta" && view.territory?.constituency === CONSTITUENCY_ID);

  const dup = await executeSetTerritory({ draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client: eventClient, confirmationId: "territory-1" });
  ok("T4. re-executing with the SAME confirmationId is idempotent, not a duplicate row",
     dup.success && dup.alreadyRecorded &&
     logFor(eventClient, CAMPAIGN_A).filter((e) => e.type === ELECTION_EVENT_TYPES.TERRITORY.SET).length === 1);
}

// ---------- refusals, never a partial draft ----------
{
  const badOffice = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "not_a_real_office", stateCode: "delta" },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  ok("T5. an unrecognised office is refused (NEEDS_OFFICE), never a partial draft", badOffice.status === "NEEDS_OFFICE" && badOffice.draft === null);

  const badState = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "house_of_reps", stateCode: "not_a_real_state" },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  ok("T6. an unrecognised state is refused (NEEDS_STATE)", badState.status === "NEEDS_STATE");

  const missingConstituency = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "house_of_reps", stateCode: "delta" },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  ok("T7. house_of_reps requires a constituency — refused when absent (NEEDS_CONSTITUENCY)", missingConstituency.status === "NEEDS_CONSTITUENCY");

  const president = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "president", stateCode: "delta" },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  ok("T8. President (national boundary_level) needs no constituency and is PREPARED", president.status === "PREPARED" && president.draft.draft.constituency === null);
}

// ---------- tenant isolation ----------
{
  const eventClient = fakeEventClient();
  const preparedA = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "house_of_reps", stateCode: "delta", constituencyId: CONSTITUENCY_ID },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  await executeSetTerritory({ draft: preparedA.draft.draft, campaign: CAMPAIGN_A, userId: USER, client: eventClient, confirmationId: "territory-a" });

  const preparedB = await proposeSetTerritory({
    fields: { election: "2027 General Election", officeId: "president", stateCode: "delta" },
    offices: OFFICES, states: STATES, constituencies: CONSTITUENCIES,
  });
  await executeSetTerritory({ draft: preparedB.draft.draft, campaign: CAMPAIGN_B, userId: USER, client: eventClient, confirmationId: "territory-b" });

  const mixedLog = eventClient.rows.filter((r) => r.table === "election_events").map((r) => r.payload);
  const viewA = projectElection(mixedLog, CAMPAIGN_A);
  const viewB = projectElection(mixedLog, CAMPAIGN_B);
  ok("D1. campaign A's fold shows ONLY campaign A's territory (house_of_reps)", viewA.territory?.office === "house_of_reps");
  ok("D2. campaign B's fold shows ONLY campaign B's territory (president), never A's", viewB.territory?.office === "president");
  ok("D3. a fold with no campaign scope is EMPTY (fail-closed)", projectElection(mixedLog, null).territory === null);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
