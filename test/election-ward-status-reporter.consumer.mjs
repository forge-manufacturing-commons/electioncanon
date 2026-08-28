// ============================================================
// FORGE ELECTION — WARD STATUS REPORTER CANON INTEGRITY  (Loop 35)
//
// Proves the Loop 35 correctness fix, and ONLY that fix: `wardStatusEvent`'s
// own `person` field (the REPORTER of a status update — a different fact
// from `wardAssignedEvent`'s `person`, the ASSIGNEE, preserved by Loop 34 in
// test/election-ward-person.consumer.mjs) is now preserved end-to-end.
//
// THE CRITICAL DISTINCTION THIS FILE EXISTS TO PROVE: the reporter's
// `person` is folded ONLY into `wards[id].history[i].person` — a per-entry
// fact about ONE status report — and NEVER into `wards[id].person`, which
// remains exclusively the ward's ASSIGNEE (Loop 34's field). If these two
// were ever conflated into one top-level field, a status report from
// someone other than the assigned organisation's own contact would silently
// overwrite "who is assigned to this ward" with "who last reported on it" —
// two genuinely different facts. Every assertion below that touches BOTH
// fields exists specifically to catch that conflation if it is ever
// reintroduced.
//
// Same two-point drop this loop closes, mirroring Loop 34 exactly:
//   1. `executeElectionWrite()` didn't forward `draft.person` to
//      `wardStatusEvent()`.
//   2. `projectElection()` didn't fold `e.person` into the history entry.
//
// Neither PREPARE (`matchWardStatusReport`) nor `readiness.js` is touched —
// the NL grammar still never produces a `person` field, and readiness still
// reads only `status`/`reason`, never `history`.
//
// Run: node test/election-ward-status-reporter.consumer.mjs
// ============================================================

import { wardAssignedEvent, wardStatusEvent } from "../src/domains/election/events.js";
import { projectElection } from "../src/domains/election/projections.js";
import { deriveReadiness, READINESS_DIMENSION_STATUS as STATUS } from "../src/domains/election/studio/readiness.js";
import { executeElectionWrite, proposeElectionWrite } from "../src/domains/election/studio/write.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

function fakeClient(store) {
  return { from: () => ({ insert: async (row) => {
    if (store.some((r) => r.event_id === row.event_id)) {
      return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    }
    store.push(row); return { error: null };
  } }) };
}

const CAMPAIGN_A = "campaign-A";
const CAMPAIGN_B = "campaign-B";
const stamp = (e, i, prefix) => Object.freeze({ ...e, eventId: `${prefix}-${i}`, at: `2026-02-0${i}T00:00:00.000Z` });

// =================================================================
// PART V1 — the fold: a status report carrying `person` resolves into
// history[]'s own entry, and NEVER into the ward's top-level `person`.
// =================================================================
{
  const log = [
    stamp(wardAssignedEvent({ ward: "Ward V1", campaign: CAMPAIGN_A, organisation: "Team V1", person: "Assignee-Alice" }), 1, "v1a"),
    stamp(wardStatusEvent({ ward: "Ward V1", campaign: CAMPAIGN_A, status: "on-track", person: "Reporter-Bob" }), 2, "v1b"),
  ].reverse();
  const view = projectElection(log, CAMPAIGN_A);

  ok("V1a. the reporter's person is recorded in history[]'s own entry",
     view.wards["Ward V1"].history.at(-1).person === "Reporter-Bob");
  ok("V1b. the ward's TOP-LEVEL person remains the ASSIGNEE — the reporter never overwrites it",
     view.wards["Ward V1"].person === "Assignee-Alice");

  // Two reports, two different reporters — each entry keeps its OWN.
  // `log` is stored NEWEST-first (projectElection's own convention — it
  // reverses internally to process oldest-first), so the newer report is
  // PREPENDED, not appended.
  const log2 = [
    stamp(wardStatusEvent({ ward: "Ward V1", campaign: CAMPAIGN_A, status: "behind", reason: "delay", person: "Reporter-Carol" }), 3, "v1c"),
    ...log,
  ];
  const view2 = projectElection(log2, CAMPAIGN_A);
  ok("V1c. a SECOND report's reporter is a SEPARATE history entry — never overwrites the first entry's reporter",
     view2.wards["Ward V1"].history[0].person === "Reporter-Bob" && view2.wards["Ward V1"].history[1].person === "Reporter-Carol");
  ok("V1d. the top-level assignee STILL reads Alice after two status reports from two different reporters",
     view2.wards["Ward V1"].person === "Assignee-Alice");

  // A status report with no person names an honest null entry, never a guess.
  const logNoReporter = [
    stamp(wardAssignedEvent({ ward: "Ward V2", campaign: CAMPAIGN_A, organisation: "Team V2" }), 1, "v1e"),
    stamp(wardStatusEvent({ ward: "Ward V2", campaign: CAMPAIGN_A, status: "on-track" }), 2, "v1f"),
  ].reverse();
  const viewNoReporter = projectElection(logNoReporter, CAMPAIGN_A);
  ok("V1e. a status report that never named a reporter folds an honest null in that entry, never a fabricated one",
     viewNoReporter.wards["Ward V2"].history.at(-1).person === null);
}

// =================================================================
// PART V2 — the entire pipeline: EXECUTE -> election_events -> fresh
// projectElection() -> Canon, with the reporter surviving.
// =================================================================
{
  const store = [];
  const assignLog = [stamp(wardAssignedEvent({ ward: "Ward V10", campaign: CAMPAIGN_A, organisation: "Team V10", person: "Assignee-Deji" }), 1, "v2a")].reverse();
  const viewBefore = projectElection(assignLog, CAMPAIGN_A);

  const draft = { type: "campaign.ward.status_reported", ward: "Ward V10", status: "on-track", person: "Reporter-Emeka" };
  const exec = await executeElectionWrite({
    draft, campaign: CAMPAIGN_A, userId: "user-1", client: fakeClient(store), confirmationId: "confirm-v2-1",
  });
  ok("V2a. execution succeeds and writes EXACTLY one event", exec.success === true && store.length === 1);
  ok("V2b. the stored event's payload carries the reporter exactly as drafted",
     store[0].payload.person === "Reporter-Emeka" && store[0].payload.status === "on-track");

  // `assignLog` is stored newest-first; the report is the NEWER event, so it
  // is prepended, not appended (matching projectElection's own convention).
  const freshLog = [store[0].payload, ...assignLog];
  const after = projectElection(freshLog, CAMPAIGN_A);
  ok("V2c. a FRESH Canon read shows the reporter in history[], from re-folding the persisted event",
     after.wards["Ward V10"].history.at(-1).person === "Reporter-Emeka");
  ok("V2d. the SAME fresh read still shows the ORIGINAL assignee, untouched by the report's own reporter",
     after.wards["Ward V10"].person === "Assignee-Deji");
}

// =================================================================
// PART V3 — readiness stays byte-for-byte unchanged: WARD_STATUS_HEALTH
// depends ONLY on `status`, never on who reported it.
// =================================================================
{
  const logWithReporter = [
    stamp(wardAssignedEvent({ ward: "Ward V20", campaign: CAMPAIGN_A, organisation: "Team V20" }), 1, "v3a"),
    stamp(wardStatusEvent({ ward: "Ward V20", campaign: CAMPAIGN_A, status: "on-track", person: "Reporter-X" }), 2, "v3b"),
  ].reverse();
  const logNoReporter = [
    stamp(wardAssignedEvent({ ward: "Ward V20", campaign: CAMPAIGN_A, organisation: "Team V20" }), 1, "v3c"),
    stamp(wardStatusEvent({ ward: "Ward V20", campaign: CAMPAIGN_A, status: "on-track" }), 2, "v3d"),
  ].reverse();

  const rWith = deriveReadiness(projectElection(logWithReporter, CAMPAIGN_A));
  const rWithout = deriveReadiness(projectElection(logNoReporter, CAMPAIGN_A));
  const claimWith = rWith.claims.find((c) => c.dimension === "WARD_STATUS_HEALTH");
  const claimWithout = rWithout.claims.find((c) => c.dimension === "WARD_STATUS_HEALTH");

  ok("V3a. WARD_STATUS_HEALTH reads COMPLETE identically whether a reporter is named or not",
     claimWith.status === STATUS.COMPLETE && claimWithout.status === STATUS.COMPLETE);
  ok("V3b. the claim's own stated VALUE text is unchanged by the reporter's presence",
     claimWith.value === claimWithout.value);
  ok("V3c. the exact set of claim dimensions is unchanged — no WARD_REPORTER/REPORTING_INTEGRITY/etc. dimension exists",
     rWith.claims.map((c) => c.dimension).sort().join(",") === "CANDIDATE_REGISTERED,WARD_ASSIGNMENT,WARD_STATUS_HEALTH");
  ok("V3d. unsupportedDimensions is unchanged — still exactly the pre-existing 18-entry list",
     rWith.unsupportedDimensions.length === 18 && !rWith.unsupportedDimensions.some((d) => /REPORT|PERSON/i.test(d)));
}

// =================================================================
// PART V4 — tenant isolation: the SAME ward id, in TWO campaigns, reported
// by DIFFERENT people, must never cross-contaminate.
// =================================================================
{
  const storeA = [], storeB = [];
  await executeElectionWrite({
    draft: { type: "campaign.ward.assigned", ward: "Ward Shared3", organisation: "Org A3" },
    campaign: CAMPAIGN_A, userId: "user-1", client: fakeClient(storeA), confirmationId: "confirm-v4-assign-a",
  });
  await executeElectionWrite({
    draft: { type: "campaign.ward.status_reported", ward: "Ward Shared3", status: "on-track", person: "Reporter-A" },
    campaign: CAMPAIGN_A, userId: "user-1", client: fakeClient(storeA), confirmationId: "confirm-v4-report-a",
  });
  await executeElectionWrite({
    draft: { type: "campaign.ward.assigned", ward: "Ward Shared3", organisation: "Org B3" },
    campaign: CAMPAIGN_B, userId: "user-2", client: fakeClient(storeB), confirmationId: "confirm-v4-assign-b",
  });
  await executeElectionWrite({
    draft: { type: "campaign.ward.status_reported", ward: "Ward Shared3", status: "on-track", person: "Reporter-B" },
    campaign: CAMPAIGN_B, userId: "user-2", client: fakeClient(storeB), confirmationId: "confirm-v4-report-b",
  });

  const freshA = projectElection(storeA.map((r) => r.payload), CAMPAIGN_A);
  const freshB = projectElection(storeB.map((r) => r.payload), CAMPAIGN_B);
  ok("V4a. campaign A's ward history shows ONLY Reporter-A", freshA.wards["Ward Shared3"].history.at(-1).person === "Reporter-A");
  ok("V4b. campaign B's ward history shows ONLY Reporter-B", freshB.wards["Ward Shared3"].history.at(-1).person === "Reporter-B");

  const crossA = projectElection(storeA.map((r) => r.payload), CAMPAIGN_B);
  ok("V4c. campaign A's own events fold to EMPTY under campaign B's scope — no leak either direction",
     !("Ward Shared3" in crossA.wards));
}

// =================================================================
// PART V5 — hostile `person` (reporter) values are stored as inert data,
// never authority-bearing.
// =================================================================
{
  const HOSTILE_PERSONS = ["campaign-B", "observer_organisation", "candidate_campaign", "admin",
    { hostile: "object", campaign: CAMPAIGN_B, actor_kind: "observer_organisation" }];

  for (const hostilePerson of HOSTILE_PERSONS) {
    const store = [];
    await executeElectionWrite({
      draft: { type: "campaign.ward.assigned", ward: "Ward VHostile", organisation: "Org VHostile" },
      campaign: CAMPAIGN_A, userId: "user-1", client: fakeClient(store), confirmationId: `confirm-v5-assign-${JSON.stringify(hostilePerson)}`,
    });
    const exec = await executeElectionWrite({
      draft: { type: "campaign.ward.status_reported", ward: "Ward VHostile", status: "on-track", person: hostilePerson },
      campaign: CAMPAIGN_A, userId: "user-1", client: fakeClient(store), confirmationId: `confirm-v5-report-${JSON.stringify(hostilePerson)}`,
    });
    ok(`V5. hostile reporter ${JSON.stringify(hostilePerson)} is stored as inert data, never redirects the campaign`,
       exec.success === true && store[1].campaign_id === CAMPAIGN_A && store[1].payload.campaign === CAMPAIGN_A);

    const fresh = projectElection(store.map((r) => r.payload), CAMPAIGN_A);
    ok(`V5b. hostile reporter ${JSON.stringify(hostilePerson)} does not appear in a SECOND campaign's Canon`,
       !("Ward VHostile" in projectElection(store.map((r) => r.payload), CAMPAIGN_B).wards));
  }
}

// =================================================================
// PART V6 — PREPARE remains DB-inert and unchanged: the natural-language
// grammar still never produces a `person`/reporter field.
// =================================================================
{
  const view = projectElection(
    [stamp(wardAssignedEvent({ ward: "Ward V30", campaign: CAMPAIGN_A, organisation: "Team V30" }), 1, "v6a")].reverse(),
    CAMPAIGN_A,
  );
  const prepared = await proposeElectionWrite({ message: "Report Ward V30 as on-track", view });
  ok("V6. the NL status-report draft STILL names no `person` — PREPARE's grammar is untouched by this loop's fix",
     prepared.status === "PREPARED" && !("person" in prepared.draft.draft));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
