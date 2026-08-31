// ============================================================
// FORGE ELECTION — ELECTORAL GEOGRAPHY WRITES
//
// The SAME PREPARE -> APPROVE -> EXECUTE shape mobilization/write.js
// establishes, applied to territory selection and geography-scoped
// responsibility assignment. Like that module, every `propose*` function
// here is PURE — no database client, no network call. Validating an office/
// state/constituency choice, or a ward/polling-unit assignment against real
// imported rows, needs real reference data; the CALLER (the UI, via
// geography/read.js) fetches the small lookup lists first and passes them
// in as `offices`/`states`/`constituencies`/`roster`/`geographyTree` — the
// exact same `extra`-bag mechanism electionWebAdapter.js's
// prepareStructuredWrite() already generically supports for `roster`/
// `knownResultIds` elsewhere in this project. This keeps write.js as pure
// as every sibling module, with zero new plumbing required in the adapter.
//
// NEVER FABRICATE A GEOGRAPHY REFERENCE. If `level` is 'ward' or
// 'polling_unit' and the caller's `geographyTree` shows no imported rows for
// it yet, `proposeAssignResponsibility` refuses with NO_GEOGRAPHY_DATA_IMPORTED
// — never a free-text fallback, never a partial draft. See
// supabase/geography-import/README.md for the real import this is waiting on.
// ============================================================

import {
  territorySetEvent, responsibilityAssignedEvent, responsibilityStatusEvent,
  ELECTION_EVENT_TYPES,
} from "../events.js";
import { ASSIGNMENT_STATUS } from "../mobilization/write.js";

const NOT_AUTHORISED_NOTICE =
  "NOT RECORDED · NOT AUTHORISED — ForgeOS requires an authenticated, authorised campaign identity before this can be recorded.";
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

export const GEOGRAPHY_LEVEL = Object.freeze({
  CONSTITUENCY: "constituency", LGA: "lga", WARD: "ward", POLLING_UNIT: "polling_unit",
});

// Deliberately separate from mobilization's PERSON_ROLE_TYPES — that
// vocabulary describes a person's general roster role (e.g. "volunteer");
// this describes what ONE SPECIFIC responsibility assignment means, and is
// paired 1:1 with GEOGRAPHY_LEVEL (see ROLE_FOR_LEVEL below) rather than
// freely combinable, so a "Ward Coordinator" responsibility can never be
// recorded against a polling unit by mistake.
export const RESPONSIBILITY_ROLE = Object.freeze({
  CONSTITUENCY_LEAD: "CONSTITUENCY_LEAD", LGA_COORDINATOR: "LGA_COORDINATOR",
  WARD_COORDINATOR: "WARD_COORDINATOR", POLLING_UNIT_AGENT: "POLLING_UNIT_AGENT",
});

const ROLE_FOR_LEVEL = Object.freeze({
  [GEOGRAPHY_LEVEL.CONSTITUENCY]: RESPONSIBILITY_ROLE.CONSTITUENCY_LEAD,
  [GEOGRAPHY_LEVEL.LGA]: RESPONSIBILITY_ROLE.LGA_COORDINATOR,
  [GEOGRAPHY_LEVEL.WARD]: RESPONSIBILITY_ROLE.WARD_COORDINATOR,
  [GEOGRAPHY_LEVEL.POLLING_UNIT]: RESPONSIBILITY_ROLE.POLLING_UNIT_AGENT,
});

export const TRAINING_STATUS = Object.freeze({
  NOT_STARTED: "NOT_STARTED", IN_PROGRESS: "IN_PROGRESS", COMPLETE: "COMPLETE",
});

/** @param fields { election, officeId, stateCode, constituencyId }
 *  @param offices  real rows from geography/read.js's listOffices()
 *  @param states   real rows from listStates()
 *  @param constituencies  real rows from listConstituencies(officeId, stateCode) */
export async function proposeSetTerritory({ fields = {}, offices = [], states = [], constituencies = [] } = {}) {
  const election = requireText(fields.election, "an election");
  if (!election.valid) return { status: "NEEDS_ELECTION", draft: null, reason: election.reason };

  const office = offices.find((o) => o.id === fields.officeId);
  if (!office) return { status: "NEEDS_OFFICE", draft: null, reason: `"${fields.officeId}" is not a recognised office` };

  const state = states.find((s) => s.code === fields.stateCode);
  if (!state) return { status: "NEEDS_STATE", draft: null, reason: `"${fields.stateCode}" is not a recognised state` };

  // A constituency is required for any office whose boundary_level resolves
  // BELOW state level; offices that resolve directly to a state (President,
  // Governor) carry none.
  let constituency = null;
  if (office.boundary_level !== "national" && office.boundary_level !== "state") {
    if (!fields.constituencyId) {
      return { status: "NEEDS_CONSTITUENCY", draft: null, reason: "a constituency is required for this office" };
    }
    constituency = constituencies.find((c) => c.id === fields.constituencyId && c.office_id === office.id && c.state_code === state.code);
    if (!constituency) {
      return { status: "NEEDS_CONSTITUENCY", draft: null, reason: `"${fields.constituencyId}" is not a recognised constituency for ${office.name} in ${state.name}` };
    }
  }

  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.TERRITORY.SET,
        election: election.value, office: office.id, state: state.code,
        constituency: constituency?.id ?? null,
      },
      label: "set territory", component: office.name,
      summary: constituency
        ? `setting territory: ${office.name} / ${state.name} / ${constituency.name}`
        : `setting territory: ${office.name} / ${state.name}`,
    }),
  };
}

export async function executeSetTerritory({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeSetTerritory requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = territorySetEvent({
    territory: confirmationId, campaign, election: draft.election, office: draft.office,
    state: draft.state, constituency: draft.constituency ?? undefined, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { personId, level, geographyRef }
 *  @param roster  real rows from view.people (the existing Mobilization roster)
 *  @param geographyTree  real rows from geography/read.js's getConstituencyTerritory(),
 *    shaped { lgas: [{id,name}], wards: [{id,name}], pollingUnits: [{id,code}] } —
 *    `wards`/`pollingUnits` are naturally empty until a real import lands. */
export async function proposeAssignResponsibility({ fields = {}, roster = [], geographyTree = null } = {}) {
  const personId = requireText(fields.personId, "a person");
  if (!personId.valid) return { status: "NEEDS_PERSON", draft: null, reason: personId.reason };
  const person = roster.find((p) => p.id === personId.value);
  if (!person) return { status: "NEEDS_PERSON", draft: null, reason: `"${personId.value}" is not on this campaign's roster — add them under Mobilize first` };

  const level = fields.level;
  if (!Object.values(GEOGRAPHY_LEVEL).includes(level)) {
    return { status: "NEEDS_LEVEL", draft: null, reason: `"${level}" is not a recognised geography level` };
  }

  const geographyRef = requireText(fields.geographyRef, "a geography unit");
  if (!geographyRef.valid) return { status: "NEEDS_GEOGRAPHY_REF", draft: null, reason: geographyRef.reason };

  if (level === GEOGRAPHY_LEVEL.WARD || level === GEOGRAPHY_LEVEL.POLLING_UNIT) {
    const pool = level === GEOGRAPHY_LEVEL.WARD ? geographyTree?.wards : geographyTree?.pollingUnits;
    if (!pool || pool.length === 0) {
      return {
        status: "NO_GEOGRAPHY_DATA_IMPORTED", draft: null,
        reason: `no ${level === GEOGRAPHY_LEVEL.WARD ? "ward" : "polling-unit"} geography has been imported yet for this constituency — see supabase/geography-import/README.md`,
      };
    }
    if (!pool.some((row) => row.id === geographyRef.value)) {
      return { status: "NEEDS_GEOGRAPHY_REF", draft: null, reason: `"${geographyRef.value}" is not a recognised ${level}` };
    }
  } else if (level === GEOGRAPHY_LEVEL.LGA) {
    const pool = geographyTree?.lgas;
    if (pool && pool.length > 0 && !pool.some((row) => row.id === geographyRef.value)) {
      return { status: "NEEDS_GEOGRAPHY_REF", draft: null, reason: `"${geographyRef.value}" is not an LGA in this constituency` };
    }
  }
  // level === CONSTITUENCY: geographyRef is the territory's own constituency
  // id, already resolved by TERRITORY.SET — nothing further to check against
  // a pool of many.

  const responsibilityRole = ROLE_FOR_LEVEL[level];

  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.RESPONSIBILITY.ASSIGNED,
        person: person.id, level, geographyRef: geographyRef.value, responsibilityRole,
        status: ASSIGNMENT_STATUS.ASSIGNED,
      },
      label: "assign responsibility", component: person.name ?? person.id,
      summary: `assigning ${person.name ?? "a person"} as ${responsibilityRole.replace(/_/g, " ").toLowerCase()}`,
    }),
  };
}

export async function executeAssignResponsibility({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeAssignResponsibility requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = responsibilityAssignedEvent({
    responsibility: confirmationId, campaign, person: draft.person, level: draft.level,
    geographyRef: draft.geographyRef, responsibilityRole: draft.responsibilityRole,
    status: draft.status, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { responsibilityId, status, trainingStatus, note } — at
 *  least one of status/trainingStatus is required; this business rule lives
 *  here (not in the factory — see responsibilityStatusEvent's own header). */
export async function proposeChangeResponsibilityStatus({ fields = {} } = {}) {
  const responsibilityId = requireText(fields.responsibilityId, "a responsibility");
  if (!responsibilityId.valid) return { status: "NEEDS_RESPONSIBILITY", draft: null, reason: responsibilityId.reason };

  const status = fields.status || null;
  if (status && !Object.values(ASSIGNMENT_STATUS).includes(status)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${status}" is not a recognised assignment status` };
  }
  const trainingStatus = fields.trainingStatus || null;
  if (trainingStatus && !Object.values(TRAINING_STATUS).includes(trainingStatus)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${trainingStatus}" is not a recognised training status` };
  }
  if (!status && !trainingStatus) {
    return { status: "NEEDS_STATUS", draft: null, reason: "a status or a training update is required" };
  }

  const summaryParts = [];
  if (status) summaryParts.push(`status to ${status}`);
  if (trainingStatus) summaryParts.push(`training to ${trainingStatus}`);

  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.RESPONSIBILITY.STATUS_CHANGED, responsibility: responsibilityId.value, status, trainingStatus, note: fields.note ?? null },
      label: "responsibility status", component: responsibilityId.value,
      summary: `changing ${summaryParts.join(" and ")}`,
    }),
  };
}

export async function executeChangeResponsibilityStatus({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeChangeResponsibilityStatus requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = responsibilityStatusEvent({
    responsibility: draft.responsibility, campaign, status: draft.status ?? undefined,
    trainingStatus: draft.trainingStatus ?? undefined, note: draft.note ?? undefined, eventId: confirmationId,
  });
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
  proposeSetTerritory, executeSetTerritory,
  proposeAssignResponsibility, executeAssignResponsibility,
  proposeChangeResponsibilityStatus, executeChangeResponsibilityStatus,
  GEOGRAPHY_LEVEL, RESPONSIBILITY_ROLE, TRAINING_STATUS, MAX_FIELD_LENGTH,
};
