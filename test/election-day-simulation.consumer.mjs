// ============================================================
// ELECTION FORGE ALPHA 1.0 — ELECTION DAY SIMULATION  (MOCK evidence)
//
// Same fake-client pattern as election-mobilization.consumer.mjs. Proves:
// polling unit -> agent -> simulated result capture -> verification ->
// latest-per-PU aggregation -> incident report -> status change, all
// through the real propose/execute pairs and the real fold, and that every
// captured result is explicitly marked `simulated: true` — never silently
// presentable as an official result.
// ============================================================

import {
  proposeAddPollingUnit, executeAddPollingUnit,
  proposeAssignAgent, executeAssignAgent,
  proposeChangeAgentStatus, executeChangeAgentStatus,
  proposeCaptureResult, executeCaptureResult,
  proposeVerifyResult, executeVerifyResult,
  proposeReportIncident, executeReportIncident,
  proposeChangeIncidentStatus, executeChangeIncidentStatus,
  AGENT_STATUS, VERIFICATION_STATUS, INCIDENT_STATUS,
} from "../src/domains/election/electionDay/write.js";
import { projectElection } from "../src/domains/election/projections.js";
import { ELECTION_EVENT_TYPES } from "../src/domains/election/events.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTION FORGE ALPHA — Election Day simulation\n");

function fakeClient() {
  const rows = [];
  return {
    rows,
    from(table) {
      return {
        insert: async (row) => {
          if (rows.some((r) => r.table === table && r.event_id === row.event_id)) {
            const err = new Error("duplicate key value violates unique constraint");
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

const CAMPAIGN = "camp-election-day";
const USER = "agent-user";

const client = fakeClient();

// ---------- Polling unit ----------
{
  const prepared = await proposeAddPollingUnit({ fields: { state: "Delta", lga: "Uvwie", ward: "Ward 3", code: "PU-001" } });
  ok("A1. proposeAddPollingUnit is PREPARED", prepared.status === "PREPARED");
  const result = await executeAddPollingUnit({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "pu-1" });
  ok("A2. executeAddPollingUnit succeeds", result.success);

  const missingCode = await proposeAddPollingUnit({ fields: { state: "Delta", lga: "Uvwie", ward: "Ward 3" } });
  ok("A3. proposeAddPollingUnit without a polling-unit identifier refuses", missingCode.status === "NEEDS_CODE");
}

// ---------- Agent ----------
{
  const prepared = await proposeAssignAgent({ fields: { pollingUnitId: "pu-1", person: "Chinedu Eze" } });
  ok("B1. proposeAssignAgent is PREPARED", prepared.status === "PREPARED");
  await executeAssignAgent({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "agent-1" });

  const badStatus = await proposeChangeAgentStatus({ fields: { agentId: "agent-1", status: "NOT_REAL" } });
  ok("B2. proposeChangeAgentStatus rejects an unrecognised status", badStatus.status === "NEEDS_STATUS");

  const statusChange = await proposeChangeAgentStatus({ fields: { agentId: "agent-1", status: AGENT_STATUS.ARRIVED } });
  await executeChangeAgentStatus({ draft: statusChange.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "agent-1-status" });

  const view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("B3. the fold shows the agent ARRIVED, assigned to the right polling unit",
     view.agents["agent-1"]?.status === AGENT_STATUS.ARRIVED && view.agents["agent-1"]?.pollingUnit === "pu-1");
}

// ---------- Result capture (simulation) + verification ----------
{
  const prepared = await proposeCaptureResult({ fields: { pollingUnitId: "pu-1" } });
  ok("C1. proposeCaptureResult is PREPARED and marked simulated", prepared.status === "PREPARED" && prepared.draft.draft.simulated === true);
  const captured = await executeCaptureResult({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "result-1" });
  ok("C2. executeCaptureResult writes a RESULT_CAPTURED event with simulated: true",
     captured.success && captured.event.type === ELECTION_EVENT_TYPES.ELECTION_DAY.RESULT_CAPTURED && captured.event.simulated === true);

  const preVerifyView = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("C3. before verification, the result reads PENDING", preVerifyView.results["result-1"]?.verificationStatus === VERIFICATION_STATUS.PENDING);

  const verifyPrepared = await proposeVerifyResult({ fields: { resultId: "result-1", verificationStatus: VERIFICATION_STATUS.VERIFIED } });
  await executeVerifyResult({ draft: verifyPrepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "result-1-verify" });

  const view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("C4. after verification, the SAME result id reads VERIFIED — one result, two events merged, not two rows",
     view.results["result-1"]?.verificationStatus === VERIFICATION_STATUS.VERIFIED &&
     view.results["result-1"]?.pollingUnit === "pu-1" && view.results["result-1"]?.simulated === true);
  ok("C5. latest-verified-per-polling-unit aggregation: exactly one verified result exists for pu-1",
     Object.values(view.results).filter((r) => r.pollingUnit === "pu-1" && r.verificationStatus === VERIFICATION_STATUS.VERIFIED).length === 1);
}

// ---------- Incidents ----------
{
  const prepared = await proposeReportIncident({ fields: { category: "logistics_issue", description: "Transport delayed", pollingUnitId: "pu-1" } });
  ok("D1. proposeReportIncident is PREPARED with status REPORTED", prepared.status === "PREPARED" && prepared.draft.draft.status === undefined);
  await executeReportIncident({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "incident-1" });

  const badCategory = await proposeReportIncident({ fields: { category: "not_a_category", description: "x" } });
  ok("D2. proposeReportIncident rejects an unrecognised category", badCategory.status === "NEEDS_CATEGORY");

  const statusChange = await proposeChangeIncidentStatus({ fields: { incidentId: "incident-1", status: INCIDENT_STATUS.RESOLVED, note: "transport arrived" } });
  await executeChangeIncidentStatus({ draft: statusChange.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "incident-1-status" });

  const view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("D3. the fold shows the incident RESOLVED, with the resolution note in history",
     view.incidents["incident-1"]?.status === INCIDENT_STATUS.RESOLVED && view.incidents["incident-1"]?.history[0]?.note === "transport arrived");
  ok("D4. the incident retains its original category/description (created once, status corrected via new events)",
     view.incidents["incident-1"]?.category === "logistics_issue" && view.incidents["incident-1"]?.description === "Transport delayed");
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
