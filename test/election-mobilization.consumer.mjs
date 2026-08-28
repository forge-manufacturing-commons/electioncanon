// ============================================================
// ELECTION FORGE ALPHA 1.0 — MOBILIZATION  (MOCK evidence)
//
// Fake, stateful Supabase client — no live database — mirroring the same
// pattern election-bootstrap.consumer.mjs/election-scope.consumer.mjs
// already use. Proves: propose/execute pairs produce and persist real
// election_events rows, the fold (projectElection) reconstructs
// people/assignments/tasks correctly, tenant isolation holds for the new
// event types, and idempotency (duplicate confirmationId) is honoured.
// ============================================================

import {
  proposeAddPerson, executeAddPerson,
  proposeCreateAssignment, executeCreateAssignment,
  proposeChangeAssignmentStatus, executeChangeAssignmentStatus,
  proposeCreateTask, executeCreateTask,
  proposeChangeTaskStatus, executeChangeTaskStatus,
  ASSIGNMENT_STATUS, TASK_STATUS,
} from "../src/domains/election/mobilization/write.js";
import { projectElection } from "../src/domains/election/projections.js";
import { ELECTION_EVENT_TYPES } from "../src/domains/election/events.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTION FORGE ALPHA — Mobilization\n");

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
// loadElectionLog() (electionContext.js) queries `ORDER BY created_at DESC` —
// NEWEST first — and projectElection() reverses that back to oldest-first
// internally. The fake client here pushes rows in insertion (oldest-first)
// order, so this helper reverses them to match the real contract.
const logFor = (client, campaignId) =>
  client.rows.filter((r) => r.table === "election_events" && r.campaign_id === campaignId).map((r) => r.payload).reverse();

const CAMPAIGN_A = "camp-a";
const CAMPAIGN_B = "camp-b";
const USER = "user-1";

// ---------- People ----------
{
  const client = fakeClient();
  const prepared = await proposeAddPerson({ fields: { name: "Amaka Obi", roleType: "ward_coordinator", contact: "0800-000-0000" } });
  ok("A1. proposeAddPerson with valid fields is PREPARED", prepared.status === "PREPARED");
  const result = await executeAddPerson({
    draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "person-1",
  });
  ok("A2. executeAddPerson succeeds and inserts a mobilization.person.added event",
     result.success && result.event.type === ELECTION_EVENT_TYPES.MOBILIZATION.PERSON_ADDED);

  const missingName = await proposeAddPerson({ fields: { roleType: "volunteer" } });
  ok("A3. proposeAddPerson without a name refuses (NEEDS_NAME), never a partial draft",
     missingName.status === "NEEDS_NAME" && missingName.draft === null);

  const badRole = await proposeAddPerson({ fields: { name: "X", roleType: "not_a_real_role" } });
  ok("A4. proposeAddPerson rejects an unrecognised role", badRole.status === "NEEDS_ROLE");

  const view = projectElection(logFor(client, CAMPAIGN_A), CAMPAIGN_A);
  ok("A5. the fold reconstructs the person with the right name/role",
     view.people["person-1"]?.name === "Amaka Obi" && view.people["person-1"]?.roleType === "ward_coordinator");

  const dup = await executeAddPerson({ draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "person-1" });
  ok("A6. re-executing with the SAME confirmationId is idempotent (alreadyRecorded: true), not a duplicate row",
     dup.success && dup.alreadyRecorded &&
     logFor(client, CAMPAIGN_A).filter((e) => e.type === ELECTION_EVENT_TYPES.MOBILIZATION.PERSON_ADDED).length === 1);
}

// ---------- Assignments ----------
{
  const client = fakeClient();
  const prepared = await proposeCreateAssignment({ fields: { ward: "Ward 3", assignee: "Election Agent Team" } });
  ok("B1. proposeCreateAssignment is PREPARED with status ASSIGNED", prepared.status === "PREPARED" && prepared.draft.draft.status === ASSIGNMENT_STATUS.ASSIGNED);
  await executeCreateAssignment({ draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "assign-1" });

  const badStatus = await proposeChangeAssignmentStatus({ fields: { assignmentId: "assign-1", status: "NOT_A_STATUS" } });
  ok("B2. proposeChangeAssignmentStatus rejects an unrecognised status", badStatus.status === "NEEDS_STATUS");

  const statusChange = await proposeChangeAssignmentStatus({ fields: { assignmentId: "assign-1", status: ASSIGNMENT_STATUS.COMPLETE } });
  ok("B3. proposeChangeAssignmentStatus with a real status is PREPARED", statusChange.status === "PREPARED");
  await executeChangeAssignmentStatus({ draft: statusChange.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "assign-1-status" });

  const view = projectElection(logFor(client, CAMPAIGN_A), CAMPAIGN_A);
  ok("B4. the fold shows the assignment moved to COMPLETE, with the status history retained",
     view.assignments["assign-1"]?.status === ASSIGNMENT_STATUS.COMPLETE && view.assignments["assign-1"]?.history.length === 1);
  ok("B5. the assignment still carries its original ward/assignee (last-value-wins on the creation fields)",
     view.assignments["assign-1"]?.ward === "Ward 3" && view.assignments["assign-1"]?.assignee === "Election Agent Team");
}

// ---------- Tasks ----------
{
  const client = fakeClient();
  const prepared = await proposeCreateTask({ fields: { title: "Verify polling-unit information", ward: "Ward 3", priority: "high" } });
  ok("C1. proposeCreateTask is PREPARED with status OPEN", prepared.status === "PREPARED" && prepared.draft.draft.status === TASK_STATUS.OPEN);
  await executeCreateTask({ draft: prepared.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "task-1" });

  const noTitle = await proposeCreateTask({ fields: {} });
  ok("C2. proposeCreateTask without a title refuses", noTitle.status === "NEEDS_TITLE");

  const statusChange = await proposeChangeTaskStatus({ fields: { taskId: "task-1", status: TASK_STATUS.BLOCKED, note: "waiting on materials" } });
  await executeChangeTaskStatus({ draft: statusChange.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "task-1-status" });

  const view = projectElection(logFor(client, CAMPAIGN_A), CAMPAIGN_A);
  ok("C3. the fold shows the task BLOCKED, with the note preserved in history",
     view.tasks["task-1"]?.status === TASK_STATUS.BLOCKED && view.tasks["task-1"]?.history[0]?.note === "waiting on materials");
}

// ---------- Tenant isolation ----------
{
  const client = fakeClient();
  const personA = await proposeAddPerson({ fields: { name: "Person A", roleType: "volunteer" } });
  await executeAddPerson({ draft: personA.draft.draft, campaign: CAMPAIGN_A, userId: USER, client, confirmationId: "p-a" });
  const personB = await proposeAddPerson({ fields: { name: "Person B", roleType: "volunteer" } });
  await executeAddPerson({ draft: personB.draft.draft, campaign: CAMPAIGN_B, userId: USER, client, confirmationId: "p-b" });

  const mixedLog = client.rows.filter((r) => r.table === "election_events").map((r) => r.payload);
  const viewA = projectElection(mixedLog, CAMPAIGN_A);
  const viewB = projectElection(mixedLog, CAMPAIGN_B);
  ok("D1. campaign A's fold contains ONLY campaign A's person, not campaign B's",
     Object.keys(viewA.people).length === 1 && viewA.people["p-a"]?.name === "Person A");
  ok("D2. campaign B's fold contains ONLY campaign B's person",
     Object.keys(viewB.people).length === 1 && viewB.people["p-b"]?.name === "Person B");
  ok("D3. a fold with no campaign scope at all is EMPTY, never everyone's events (fail-closed)",
     Object.keys(projectElection(mixedLog, null).people).length === 0);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
