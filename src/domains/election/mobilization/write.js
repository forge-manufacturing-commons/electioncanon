// ============================================================
// FORGE ELECTION — MOBILIZATION WRITES  (Alpha 1.0)
//
// The SAME PREPARE -> APPROVE -> EXECUTE shape as studio/write.js, applied
// to STRUCTURED form fields instead of free text. Mobilization actions
// (adding a person, creating an assignment, creating a task) carry too many
// independent fields to force through a single-sentence command parser —
// this module's `propose*` functions validate an object of fields directly,
// no NLP, but return the exact same draftShape()-style object the existing
// PREPARE/APPROVE UI panels already expect (draft/label/summary/
// missingFields/notice/reason), and its `execute*` functions write into the
// SAME `election_events` table via the SAME insert shape as
// executeElectionWrite() — see events.js's own header on why Mobilization
// reuses the existing Canon log rather than a new table.
// ============================================================

import {
  personAddedEvent, assignmentCreatedEvent, assignmentStatusEvent,
  taskCreatedEvent, taskStatusEvent, ELECTION_EVENT_TYPES,
} from "../events.js";

// FIRST-USER COMPLETION PASS — this notice is shown on EVERY freshly
// prepared draft, before Approve is ever clicked — it is a static label for
// the PENDING state, not the result of a real-time permission check (a
// signed-in, authorised owner sees this too, on every single action). The
// previous wording ("ForgeOS requires an authenticated, authorised campaign
// identity...") read as a permission denial in exactly the case where the
// user IS authorised and Approve is about to succeed — this is the exact
// panel behind "Record a campaign action" (WriteActionPanel, shared.jsx). A
// real Approve failure is reported separately, in `error`/friendlyError().
const NOT_AUTHORISED_NOTICE =
  "NOT YET RECORDED — review this action, then click Approve to record it.";
export const MAX_FIELD_LENGTH = 200;

function requireText(raw, label) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { valid: false, reason: `${label} is required` };
  if (trimmed.length > MAX_FIELD_LENGTH) return { valid: false, reason: `${label} above ${MAX_FIELD_LENGTH} characters is not recordable` };
  return { valid: true, value: trimmed };
}

function draftShape({ draft, label, component, summary }) {
  return Object.freeze({
    draft: Object.freeze(draft),
    label, component,
    missingFields: Object.freeze(["eventId", "at"]),
    published: false,
    authorised: false,
    notice: NOT_AUTHORISED_NOTICE,
    reason: null,
    summary,
  });
}

// ALPHA 1.1 — national/state/lga tiers added alongside the existing
// ward_coordinator, covering the coordinator hierarchy §3 of the Alpha 1.1
// brief asks for (national/state/LGA/ward coordinator, PU agent, team
// member) without touching campaigns.actor_kind or any Canon table — this
// is a plain string stored in the mobilization.person.added event payload,
// not a database enum, so extending it is additive and zero-migration.
// ALPHA — `campaign_director`/`constituency_lead` added for the campaign
// invitation/onboarding flow (accept_campaign_invitation folds an invited
// Director/Constituency Lead's Mobilization roster entry through this SAME
// zero-migration array) — same additive discipline as every prior addition.
export const PERSON_ROLE_TYPES = Object.freeze([
  "campaign_director", "constituency_lead",
  "national_coordinator", "state_coordinator", "lga_coordinator", "ward_coordinator",
  "coordinator", "polling_unit_agent", "observer", "volunteer", "logistics",
]);

export const ASSIGNMENT_STATUS = Object.freeze({
  UNASSIGNED: "UNASSIGNED", ASSIGNED: "ASSIGNED", ACCEPTED: "ACCEPTED",
  IN_PROGRESS: "IN_PROGRESS", COMPLETE: "COMPLETE", BLOCKED: "BLOCKED",
});

export const TASK_STATUS = Object.freeze({
  OPEN: "OPEN", IN_PROGRESS: "IN_PROGRESS", COMPLETE: "COMPLETE", BLOCKED: "BLOCKED",
});

/** @param fields { name, roleType, contact } */
export async function proposeAddPerson({ fields = {} } = {}) {
  const name = requireText(fields.name, "a name");
  if (!name.valid) return { status: "NEEDS_NAME", draft: null, reason: name.reason };
  const roleType = requireText(fields.roleType, "a role");
  if (!roleType.valid) return { status: "NEEDS_ROLE", draft: null, reason: roleType.reason };
  if (!PERSON_ROLE_TYPES.includes(roleType.value)) {
    return { status: "NEEDS_ROLE", draft: null, reason: `"${roleType.value}" is not a recognised role` };
  }
  const contact = fields.contact ? String(fields.contact).trim().slice(0, MAX_FIELD_LENGTH) : null;
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.MOBILIZATION.PERSON_ADDED, name: name.value, roleType: roleType.value, contact },
      label: "add person", component: name.value,
      summary: `adding ${name.value} as ${roleType.value.replace(/_/g, " ")}`,
    }),
  };
}

export async function executeAddPerson({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeAddPerson requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = personAddedEvent({ person: confirmationId, campaign, name: draft.name, roleType: draft.roleType, contact: draft.contact ?? undefined, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { ward, assignee } */
export async function proposeCreateAssignment({ fields = {} } = {}) {
  const ward = requireText(fields.ward, "a ward");
  if (!ward.valid) return { status: "NEEDS_WARD", draft: null, reason: ward.reason };
  const assignee = requireText(fields.assignee, "a person or team");
  if (!assignee.valid) return { status: "NEEDS_ASSIGNEE", draft: null, reason: assignee.reason };
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.MOBILIZATION.ASSIGNMENT_CREATED, ward: ward.value, assignee: assignee.value, status: ASSIGNMENT_STATUS.ASSIGNED },
      label: "create assignment", component: ward.value,
      summary: `assigning ${assignee.value} to ${ward.value}`,
    }),
  };
}

export async function executeCreateAssignment({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeCreateAssignment requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = assignmentCreatedEvent({ assignment: confirmationId, campaign, ward: draft.ward, assignee: draft.assignee, status: draft.status, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { assignmentId, status } */
export async function proposeChangeAssignmentStatus({ fields = {} } = {}) {
  const assignmentId = requireText(fields.assignmentId, "an assignment");
  if (!assignmentId.valid) return { status: "NEEDS_ASSIGNMENT", draft: null, reason: assignmentId.reason };
  const status = fields.status;
  if (!status || !Object.values(ASSIGNMENT_STATUS).includes(status)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${status}" is not a recognised assignment status` };
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.MOBILIZATION.ASSIGNMENT_STATUS_CHANGED, assignment: assignmentId.value, status },
      label: "assignment status", component: assignmentId.value,
      summary: `changing assignment status to ${status}`,
    }),
  };
}

export async function executeChangeAssignmentStatus({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeChangeAssignmentStatus requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = assignmentStatusEvent({ assignment: draft.assignment, campaign, status: draft.status, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { title, description, owner, ward, priority, dueDate } */
export async function proposeCreateTask({ fields = {} } = {}) {
  const title = requireText(fields.title, "a title");
  if (!title.valid) return { status: "NEEDS_TITLE", draft: null, reason: title.reason };
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.MOBILIZATION.TASK_CREATED, title: title.value,
        description: fields.description ? String(fields.description).trim().slice(0, MAX_FIELD_LENGTH) : null,
        owner: fields.owner ? String(fields.owner).trim().slice(0, MAX_FIELD_LENGTH) : null,
        ward: fields.ward ? String(fields.ward).trim().slice(0, MAX_FIELD_LENGTH) : null,
        priority: fields.priority ?? null, dueDate: fields.dueDate ?? null, status: TASK_STATUS.OPEN,
      },
      label: "create task", component: title.value,
      summary: `creating task: ${title.value}`,
    }),
  };
}

export async function executeCreateTask({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeCreateTask requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = taskCreatedEvent({
    task: confirmationId, campaign, title: draft.title, description: draft.description ?? undefined,
    owner: draft.owner ?? undefined, ward: draft.ward ?? undefined, priority: draft.priority ?? undefined,
    dueDate: draft.dueDate ?? undefined, status: draft.status, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { taskId, status, note } */
export async function proposeChangeTaskStatus({ fields = {} } = {}) {
  const taskId = requireText(fields.taskId, "a task");
  if (!taskId.valid) return { status: "NEEDS_TASK", draft: null, reason: taskId.reason };
  const status = fields.status;
  if (!status || !Object.values(TASK_STATUS).includes(status)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${status}" is not a recognised task status` };
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.MOBILIZATION.TASK_STATUS_CHANGED, task: taskId.value, status, note: fields.note ?? null },
      label: "task status", component: taskId.value,
      summary: `changing task status to ${status}`,
    }),
  };
}

export async function executeChangeTaskStatus({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeChangeTaskStatus requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = taskStatusEvent({ task: draft.task, campaign, status: draft.status, note: draft.note ?? undefined, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

async function insertEvent({ client, campaign, userId, event, confirmationId }) {
  const { error } = await client.from("election_events").insert({
    event_id: event.eventId, campaign_id: campaign, type: event.type,
    actor: userId, schema_version: "1", payload: event,
  });
  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message ?? "")) {
      return { success: true, alreadyRecorded: true, error: null, eventId: confirmationId };
    }
    return { success: false, alreadyRecorded: false, error: error.message };
  }
  return { success: true, alreadyRecorded: false, error: null, eventId: confirmationId, event };
}

export default {
  proposeAddPerson, executeAddPerson,
  proposeCreateAssignment, executeCreateAssignment,
  proposeChangeAssignmentStatus, executeChangeAssignmentStatus,
  proposeCreateTask, executeCreateTask,
  proposeChangeTaskStatus, executeChangeTaskStatus,
  PERSON_ROLE_TYPES, ASSIGNMENT_STATUS, TASK_STATUS, MAX_FIELD_LENGTH,
};
