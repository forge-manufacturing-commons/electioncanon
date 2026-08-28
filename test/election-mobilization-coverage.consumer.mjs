// ============================================================
// ELECTIONCANON ALPHA 1.3 — MOBILIZATION COVERAGE BY GEOGRAPHY
//
// Proves computeMobilizationCoverage() against a REAL folded view (built
// through the same propose/execute/project pipeline every other consumer
// test uses, not a hand-rolled shape) — never invents a percentage when
// the denominator is zero, correctly nests state -> LGA -> ward, and
// distinguishes "assigned" (an agent record exists) from "on the ground"
// (the agent has moved past ASSIGNED).
// ============================================================

import {
  proposeAddPollingUnit, executeAddPollingUnit,
  proposeAssignAgent, executeAssignAgent,
  proposeChangeAgentStatus, executeChangeAgentStatus,
  AGENT_STATUS,
} from "../src/domains/election/electionDay/write.js";
import { projectElection } from "../src/domains/election/projections.js";
import { computeMobilizationCoverage } from "../src/domains/election/mobilization/coverage.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTIONCANON ALPHA 1.3 — mobilization coverage by geography\n");

function fakeClient() {
  const rows = [];
  return {
    rows,
    from: () => ({
      insert: async (row) => {
        if (rows.some((r) => r.event_id === row.event_id)) return { error: { code: "23505", message: "duplicate key" } };
        rows.push(row);
        return { error: null };
      },
    }),
  };
}

const CAMPAIGN = "camp-cov";
const USER = "user-cov";
const client = fakeClient();
const logFor = () => client.rows.map((r) => r.payload).reverse();

async function addPU(id, { state, lga, ward, code }) {
  const prep = await proposeAddPollingUnit({ fields: { state, lga, ward, code } });
  await executeAddPollingUnit({ draft: prep.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: id });
}
async function assign(agentId, pollingUnitId, person) {
  const prep = await proposeAssignAgent({ fields: { pollingUnitId, person } });
  await executeAssignAgent({ draft: prep.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: agentId });
}
async function setAgentStatus(agentId, status) {
  const prep = await proposeChangeAgentStatus({ fields: { agentId, status } });
  await executeChangeAgentStatus({ draft: prep.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: `${agentId}-${status}` });
}

// ============================================================
console.log("A — EMPTY CANON: no invented percentage, no crash");
// ============================================================
{
  const view = projectElection([], CAMPAIGN);
  const cov = computeMobilizationCoverage(view);
  ok("A1. national coveragePercent is null, not 0, when there are zero polling units", cov.national.coveragePercent === null);
  ok("A2. national totalPollingUnits is honestly 0", cov.national.totalPollingUnits === 0);
  ok("A3. byState is empty", Object.keys(cov.byState).length === 0);
  ok("A4. unassignedPollingUnits is empty", cov.unassignedPollingUnits.length === 0);
}

// ============================================================
console.log("\nB — GEOGRAPHY NESTING AND REAL COUNTS");
// ============================================================
{
  await addPU("pu-1", { state: "Delta", lga: "Uvwie", ward: "Ward 3", code: "PU-101" });
  await addPU("pu-2", { state: "Delta", lga: "Uvwie", ward: "Ward 3", code: "PU-102" });
  await addPU("pu-3", { state: "Delta", lga: "Uvwie", ward: "Ward 4", code: "PU-103" });
  await addPU("pu-4", { state: "Delta", lga: "Warri South", ward: "Ward 1", code: "PU-201" });
  await addPU("pu-5", { state: "Lagos", lga: "Ikeja", ward: "Ward 1", code: "PU-301" });

  await assign("agent-1", "pu-1", "Ada Agent");
  await assign("agent-2", "pu-2", "Bola Agent");
  await setAgentStatus("agent-2", AGENT_STATUS.ARRIVED);
  // pu-3, pu-4, pu-5 deliberately left unassigned

  const view = projectElection(logFor(), CAMPAIGN);
  const cov = computeMobilizationCoverage(view);

  ok("B1. national totals 5 polling units", cov.national.totalPollingUnits === 5);
  ok("B2. national assignedCount is 2", cov.national.assignedCount === 2);
  ok("B3. national onGroundCount is 1 (only agent-2 moved past ASSIGNED)", cov.national.onGroundCount === 1);
  ok("B4. national coveragePercent is a real computed 40%, not invented", cov.national.coveragePercent === 40);

  ok("B5. Delta state totals 4 PUs across two LGAs", cov.byState.Delta.counts.totalPollingUnits === 4);
  ok("B6. Lagos state totals 1 PU", cov.byState.Lagos.counts.totalPollingUnits === 1);
  ok("B7. Lagos coveragePercent is honestly 0 (a real zero, not null — it HAS a denominator)", cov.byState.Lagos.counts.coveragePercent === 0);

  ok("B8. Uvwie LGA nests 3 PUs across two wards", cov.byState.Delta.byLga.Uvwie.counts.totalPollingUnits === 3);
  ok("B9. Ward 3 nests exactly the 2 PUs added to it", cov.byState.Delta.byLga.Uvwie.byWard["Ward 3"].counts.totalPollingUnits === 2);
  ok("B10. Ward 3 is fully assigned (2/2 = 100%)", cov.byState.Delta.byLga.Uvwie.byWard["Ward 3"].counts.coveragePercent === 100);
  ok("B11. Ward 4 has zero assigned (0/1 = 0%)", cov.byState.Delta.byLga.Uvwie.byWard["Ward 4"].counts.coveragePercent === 0);

  ok("B12. unassignedPollingUnits lists exactly pu-3, pu-4, pu-5",
    cov.unassignedPollingUnits.length === 3 && ["pu-3", "pu-4", "pu-5"].every((id) => cov.unassignedPollingUnits.some((p) => p.id === id)));
  ok("B13. each unassigned entry carries its real state/lga/ward for a specific, answerable gap question",
    cov.unassignedPollingUnits.find((p) => p.id === "pu-4").lga === "Warri South");

  const ward3 = cov.byState.Delta.byLga.Uvwie.byWard["Ward 3"].pollingUnits;
  ok("B14. per-PU detail distinguishes assigned-but-not-on-ground from on-ground",
    ward3.find((p) => p.id === "pu-1").assigned === true && ward3.find((p) => p.id === "pu-1").onGround === false &&
    ward3.find((p) => p.id === "pu-2").onGround === true);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail) process.exit(1);
