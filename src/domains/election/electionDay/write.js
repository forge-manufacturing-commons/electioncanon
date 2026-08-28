// ============================================================
// FORGE ELECTION — ELECTION DAY SIMULATION WRITES  (Alpha 1.0)
//
// Same PREPARE -> APPROVE -> EXECUTE shape as mobilization/write.js.
// EVERY fact this module can produce is explicitly simulation/demonstration
// data (RESULT_CAPTURED always carries `simulated: true` — see events.js —
// and no result-sheet image is ever persisted, per this Alpha's own scope
// decision). Nothing here claims to authenticate an official INEC result.
// ============================================================

import {
  pollingUnitAddedEvent, agentAssignedEvent, agentStatusEvent,
  resultCapturedEvent, resultOcrProcessedEvent, resultVerifiedEvent, incidentReportedEvent, incidentStatusEvent,
  ELECTION_EVENT_TYPES,
} from "../events.js";

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

export const AGENT_STATUS = Object.freeze({
  ASSIGNED: "ASSIGNED", ARRIVED: "ARRIVED", SETUP: "SETUP",
  VOTING_UNDERWAY: "VOTING_UNDERWAY", COUNTING: "COUNTING",
  RESULT_CAPTURED: "RESULT_CAPTURED", SUBMITTED: "SUBMITTED",
});

// ALPHA 1.1 — DISPUTED added: a verified-then-contested result is a
// distinct, real state from "still pending" — a human raised a specific
// objection, which REJECTED (never even accepted) does not capture.
export const VERIFICATION_STATUS = Object.freeze({ PENDING: "PENDING", VERIFIED: "VERIFIED", DISPUTED: "DISPUTED", REJECTED: "REJECTED" });

// ALPHA 1.1 — expanded toward election-integrity-specific categories, not
// just generic operational ones, per the Alpha 1.1 brief's own incident
// list (voter suppression, intimidation, violence, ...).
export const INCIDENT_CATEGORIES = Object.freeze([
  "voter_suppression", "intimidation", "violence", "missing_materials", "delayed_opening",
  "polling_unit_disruption", "agent_obstruction", "result_sheet_dispute",
  "result_transmission_concern", "accessibility_issue",
  "polling_unit_issue", "agent_issue", "logistics_issue", "security_concern", "communication_outage", "other",
]);

// ALPHA 1.1 — ESCALATED and CLOSED added. REPORTED is kept (not renamed to
// "OPEN") to avoid a silent data-shape change against events.js's existing
// incidentReportedEvent() factory default and every already-written event —
// it means the same thing. CLOSED is distinct from RESOLVED: RESOLVED means
// the underlying problem was fixed, CLOSED means the incident record itself
// was administratively closed (may follow RESOLVED, or a report found not
// to require further action).
export const INCIDENT_STATUS = Object.freeze({
  REPORTED: "REPORTED", ACKNOWLEDGED: "ACKNOWLEDGED", INVESTIGATING: "INVESTIGATING",
  ESCALATED: "ESCALATED", RESOLVED: "RESOLVED", CLOSED: "CLOSED",
});

// ALPHA 1.2 — severity is an honest human judgment call, never computed
// from category alone (a "missing_materials" incident could be LOW or
// CRITICAL depending on real circumstances a category string can't carry).
export const INCIDENT_SEVERITY = Object.freeze({ LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL" });

// ALPHA 1.2 — OCR is a SEPARATE axis from VERIFICATION_STATUS: a result can
// be OCR_STATUS=COMPLETE and still VERIFICATION_STATUS=PENDING (OCR ran,
// nobody has reviewed it yet). UNAVAILABLE covers both "no OCR engine
// could load" and "no evidence photo exists to run OCR against" — see
// electionDay/ocr.js for which producer sets which value.
export const OCR_STATUS = Object.freeze({
  NOT_RUN: "NOT_RUN", PROCESSING: "PROCESSING", COMPLETE: "COMPLETE", FAILED: "FAILED", UNAVAILABLE: "UNAVAILABLE",
});
export const OCR_CONFIDENCE = Object.freeze({ HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW", UNKNOWN: "UNKNOWN" });

// ALPHA 1.3 — a UI-facing DERIVED label only. It introduces no new Canon
// field and no new event — `OCR_STATUS` and `VERIFICATION_STATUS` remain
// the only two sources of truth this reads. Every UI surface showing a
// result's progress should read THIS, not hand-roll its own if/else
// chain over the two raw fields, so the lifecycle story stays consistent
// everywhere it is shown (results list, Intelligence, Ask ElectionCanon).
export const RESULT_LIFECYCLE_STAGE = Object.freeze({
  CAPTURED: "CAPTURED",           // evidence/manual entry recorded; OCR has not completed
  OCR_COMPLETE: "OCR_COMPLETE",   // OCR read the image; no human has reviewed it yet
  CONFIRMED: "CONFIRMED",         // human accepted at least one OCR-read field as-is
  CORRECTED: "CORRECTED",         // human changed at least one OCR-read field
  HUMAN_REVIEWED: "HUMAN_REVIEWED", // verified with no OCR involvement at all (fully manual)
  DISPUTED: "DISPUTED",
  REJECTED: "REJECTED",
});

/** @param result the folded `view.results[id]` shape — `{evidenceImagePath,
 *  extractedFields, ocr:{status}, verificationStatus}`. Pure, no I/O. */
export function resultLifecycleStage(result) {
  if (!result) return null;
  if (result.verificationStatus === VERIFICATION_STATUS.DISPUTED) return RESULT_LIFECYCLE_STAGE.DISPUTED;
  if (result.verificationStatus === VERIFICATION_STATUS.REJECTED) return RESULT_LIFECYCLE_STAGE.REJECTED;
  if (result.verificationStatus === VERIFICATION_STATUS.VERIFIED) {
    const fields = result.extractedFields ?? [];
    if (fields.some((f) => f.source === "ocr_corrected")) return RESULT_LIFECYCLE_STAGE.CORRECTED;
    if (fields.some((f) => f.source === "ocr_confirmed")) return RESULT_LIFECYCLE_STAGE.CONFIRMED;
    return RESULT_LIFECYCLE_STAGE.HUMAN_REVIEWED;
  }
  if (result.ocr?.status === OCR_STATUS.COMPLETE) return RESULT_LIFECYCLE_STAGE.OCR_COMPLETE;
  return RESULT_LIFECYCLE_STAGE.CAPTURED;
}

/** @param fields { state, lga, ward, code, name, senatorialDistrict,
 *  federalConstituency, stateConstituency } — the last three are OPTIONAL;
 *  a campaign whose election type doesn't use one of these levels simply
 *  omits it, same honesty discipline as `name`. */
export async function proposeAddPollingUnit({ fields = {} } = {}) {
  const state = requireText(fields.state, "a state");
  if (!state.valid) return { status: "NEEDS_STATE", draft: null, reason: state.reason };
  const lga = requireText(fields.lga, "an LGA");
  if (!lga.valid) return { status: "NEEDS_LGA", draft: null, reason: lga.reason };
  const ward = requireText(fields.ward, "a ward");
  if (!ward.valid) return { status: "NEEDS_WARD", draft: null, reason: ward.reason };
  const code = requireText(fields.code, "a polling unit identifier");
  if (!code.valid) return { status: "NEEDS_CODE", draft: null, reason: code.reason };
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.ELECTION_DAY.POLLING_UNIT_ADDED, state: state.value, lga: lga.value, ward: ward.value, code: code.value,
        name: fields.name ?? null,
        senatorialDistrict: fields.senatorialDistrict ?? null,
        federalConstituency: fields.federalConstituency ?? null,
        stateConstituency: fields.stateConstituency ?? null,
      },
      label: "add polling unit", component: code.value,
      summary: `adding polling unit ${code.value} (${ward.value}, ${lga.value}, ${state.value})`,
    }),
  };
}

export async function executeAddPollingUnit({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeAddPollingUnit requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = pollingUnitAddedEvent({
    pollingUnit: confirmationId, campaign, state: draft.state, lga: draft.lga, ward: draft.ward, code: draft.code,
    name: draft.name ?? undefined,
    senatorialDistrict: draft.senatorialDistrict ?? undefined,
    federalConstituency: draft.federalConstituency ?? undefined,
    stateConstituency: draft.stateConstituency ?? undefined,
    eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { pollingUnitId, person } */
export async function proposeAssignAgent({ fields = {} } = {}) {
  const pollingUnitId = requireText(fields.pollingUnitId, "a polling unit");
  if (!pollingUnitId.valid) return { status: "NEEDS_POLLING_UNIT", draft: null, reason: pollingUnitId.reason };
  const person = requireText(fields.person, "an agent");
  if (!person.valid) return { status: "NEEDS_PERSON", draft: null, reason: person.reason };
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.ELECTION_DAY.AGENT_ASSIGNED, pollingUnit: pollingUnitId.value, person: person.value },
      label: "assign agent", component: person.value,
      summary: `assigning ${person.value} to polling unit ${pollingUnitId.value}`,
    }),
  };
}

export async function executeAssignAgent({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeAssignAgent requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = agentAssignedEvent({ agent: confirmationId, campaign, pollingUnit: draft.pollingUnit, person: draft.person, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { agentId, status } */
export async function proposeChangeAgentStatus({ fields = {} } = {}) {
  const agentId = requireText(fields.agentId, "an agent");
  if (!agentId.valid) return { status: "NEEDS_AGENT", draft: null, reason: agentId.reason };
  const status = fields.status;
  if (!status || !Object.values(AGENT_STATUS).includes(status)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${status}" is not a recognised agent status` };
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.ELECTION_DAY.AGENT_STATUS_CHANGED, agent: agentId.value, status },
      label: "agent status", component: agentId.value,
      summary: `changing agent status to ${status.replace(/_/g, " ").toLowerCase()}`,
    }),
  };
}

export async function executeChangeAgentStatus({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeChangeAgentStatus requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = agentStatusEvent({ agent: draft.agent, campaign, status: draft.status, eventId: confirmationId });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { pollingUnitId, extractedFields, evidenceHash } — SIMULATION
 *  ONLY. No image, uploaded to the private `election-evidence` Storage
 *  bucket BEFORE this is called (see electionDay/evidence.js's
 *  uploadResultEvidence) — this function only ever records the resulting
 *  object path, never image bytes. `extractedFields` are always
 *  human-entered this phase (no OCR runs); each is normalised to
 *  { field, value, confidence: null, source: "manual" } — confidence is
 *  never invented. `knownEvidenceHashes` (Alpha 1.3, optional) is a
 *  caller-supplied `{ hash, pollingUnit }[]` of already-recorded results
 *  (never invented — the same read-only-context pattern as `roster`/
 *  `knownResultIds`); a match sets `duplicateOfPollingUnit` on the draft
 *  as a FLAG only — it never blocks the write, since a legitimate retake
 *  of the same real sheet can share a hash. */
export async function proposeCaptureResult({ fields = {}, knownEvidenceHashes = [] } = {}) {
  const pollingUnitId = requireText(fields.pollingUnitId, "a polling unit");
  if (!pollingUnitId.valid) return { status: "NEEDS_POLLING_UNIT", draft: null, reason: pollingUnitId.reason };
  const extractedFields = Array.isArray(fields.extractedFields)
    ? fields.extractedFields
        .filter((f) => f?.field && f?.value)
        .map((f) => ({ field: String(f.field).trim().slice(0, MAX_FIELD_LENGTH), value: String(f.value).trim().slice(0, MAX_FIELD_LENGTH), confidence: null, source: "manual" }))
    : [];
  const evidenceHash = fields.evidenceHash ?? null;
  const duplicate = evidenceHash ? knownEvidenceHashes.find((k) => k?.hash === evidenceHash) : null;
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.ELECTION_DAY.RESULT_CAPTURED, pollingUnit: pollingUnitId.value,
        evidenceImagePath: fields.evidenceImagePath ?? null, evidenceHash,
        extractedFields: extractedFields.length ? extractedFields : null, simulated: true,
      },
      label: "capture result (simulation)", component: pollingUnitId.value,
      summary: `simulated result captured for polling unit ${pollingUnitId.value}` +
        (fields.evidenceImagePath ? " — evidence photo attached" : " — no photo attached") +
        (duplicate ? ` — ⚠ this photo appears identical to one already submitted for polling unit ${duplicate.pollingUnit} (will still be recorded as a new event)` : "") +
        " — SIMULATION, not an official result",
    }),
  };
}

export async function executeCaptureResult({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeCaptureResult requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = resultCapturedEvent({
    result: confirmationId, campaign, pollingUnit: draft.pollingUnit, submittedBy: userId,
    evidenceImagePath: draft.evidenceImagePath ?? undefined, evidenceHash: draft.evidenceHash ?? undefined,
    extractedFields: draft.extractedFields ?? undefined, simulated: true, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** ALPHA 1.2 — records that an OCR pass ran against an already-uploaded
 *  evidence photo. `fields.ocrExtractedFields` is the RAW machine reading —
 *  `[{ field, value, confidence }]`, `confidence` coerced to one of
 *  OCR_CONFIDENCE's four values (an unrecognised/missing confidence
 *  becomes UNKNOWN, never silently HIGH). This is PREPARE/APPROVE like
 *  every other Election Day write — the OCR ENGINE ITSELF runs on the
 *  client BEFORE prepare is even called (see electionDay/ocr.js); this
 *  operation only ever records the resulting read, it never triggers OCR
 *  as a side effect of being approved. @param fields { resultId,
 *  ocrProvider, ocrStatus, ocrExtractedFields } */
export async function proposeRecordOcrExtraction({ fields = {} } = {}) {
  const resultId = requireText(fields.resultId, "a result");
  if (!resultId.valid) return { status: "NEEDS_RESULT", draft: null, reason: resultId.reason };
  const ocrStatus = fields.ocrStatus;
  if (!ocrStatus || !Object.values(OCR_STATUS).includes(ocrStatus)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${ocrStatus}" is not a recognised OCR status` };
  }
  const ocrExtractedFields = Array.isArray(fields.ocrExtractedFields)
    ? fields.ocrExtractedFields
        .filter((f) => f?.field && f?.value)
        .map((f) => ({
          field: String(f.field).trim().slice(0, MAX_FIELD_LENGTH),
          value: String(f.value).trim().slice(0, MAX_FIELD_LENGTH),
          confidence: Object.values(OCR_CONFIDENCE).includes(f.confidence) ? f.confidence : OCR_CONFIDENCE.UNKNOWN,
        }))
    : [];
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.ELECTION_DAY.RESULT_OCR_PROCESSED, result: resultId.value,
        ocrProvider: fields.ocrProvider ?? null, ocrStatus,
        ocrExtractedFields: ocrExtractedFields.length ? ocrExtractedFields : null,
      },
      label: "record OCR extraction", component: resultId.value,
      summary: `OCR ${ocrStatus.toLowerCase()} for result ${resultId.value}`,
    }),
  };
}

export async function executeRecordOcrExtraction({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeRecordOcrExtraction requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = resultOcrProcessedEvent({
    result: draft.result, campaign, ocrProvider: draft.ocrProvider ?? undefined, ocrStatus: draft.ocrStatus,
    ocrExtractedFields: draft.ocrExtractedFields ?? undefined, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

const REVIEWED_FIELD_SOURCES = Object.freeze(["manual", "ocr_confirmed", "ocr_corrected"]);

/** @param fields { resultId, verificationStatus, reviewedFields } —
 *  `reviewedFields` is OPTIONAL: the human-review outcome for each field
 *  (CONFIRM/CORRECT), `[{ field, value, ocrValue, confidence, source }]`.
 *  `ocrValue` is preserved verbatim (never recomputed here) so a
 *  correction never erases what OCR originally read — this normaliser
 *  only trims/caps text and rejects an unrecognised `source`, it does not
 *  invent or drop `ocrValue`. Omit `reviewedFields` entirely for a plain
 *  verification decision with no field-level review attached. */
export async function proposeVerifyResult({ fields = {} } = {}) {
  const resultId = requireText(fields.resultId, "a result");
  if (!resultId.valid) return { status: "NEEDS_RESULT", draft: null, reason: resultId.reason };
  const verificationStatus = fields.verificationStatus;
  if (!verificationStatus || !Object.values(VERIFICATION_STATUS).includes(verificationStatus)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${verificationStatus}" is not a recognised verification status` };
  }
  let reviewedFields = null;
  if (Array.isArray(fields.reviewedFields) && fields.reviewedFields.length) {
    for (const f of fields.reviewedFields) {
      if (f?.source && !REVIEWED_FIELD_SOURCES.includes(f.source)) {
        return { status: "NEEDS_VALID_FIELD_SOURCE", draft: null, reason: `"${f.source}" is not a recognised field source` };
      }
    }
    reviewedFields = fields.reviewedFields
      .filter((f) => f?.field && f?.value)
      .map((f) => ({
        field: String(f.field).trim().slice(0, MAX_FIELD_LENGTH),
        value: String(f.value).trim().slice(0, MAX_FIELD_LENGTH),
        ocrValue: f.ocrValue != null ? String(f.ocrValue).trim().slice(0, MAX_FIELD_LENGTH) : null,
        confidence: f.confidence ?? null,
        source: f.source && REVIEWED_FIELD_SOURCES.includes(f.source) ? f.source : "manual",
      }));
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: { type: ELECTION_EVENT_TYPES.ELECTION_DAY.RESULT_VERIFIED, result: resultId.value, verificationStatus, extractedFields: reviewedFields },
      label: "verify result", component: resultId.value,
      summary: `marking result ${verificationStatus.toLowerCase()}` + (reviewedFields ? " with reviewed fields" : ""),
    }),
  };
}

export async function executeVerifyResult({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeVerifyResult requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = resultVerifiedEvent({
    result: draft.result, campaign, verificationStatus: draft.verificationStatus, verifiedBy: userId,
    extractedFields: draft.extractedFields ?? undefined, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { category, description, location, pollingUnitId, severity }
 *  — `severity` is OPTIONAL; when present must be one of INCIDENT_SEVERITY. */
/** @param fields { category, description, location, pollingUnitId, severity, linkedResult }
 *  @param knownResultIds — the campaign's OWN real result ids (the caller
 *  passes `Object.keys(view.results)`; this function never reads a
 *  database itself). When `linkedResult` is supplied it MUST be one of
 *  these — never an invented/guessed result id. */
export async function proposeReportIncident({ fields = {}, knownResultIds = [] } = {}) {
  const category = fields.category;
  if (!category || !INCIDENT_CATEGORIES.includes(category)) {
    return { status: "NEEDS_CATEGORY", draft: null, reason: `"${category}" is not a recognised incident category` };
  }
  const description = requireText(fields.description, "a description");
  if (!description.valid) return { status: "NEEDS_DESCRIPTION", draft: null, reason: description.reason };
  if (fields.severity != null && !Object.values(INCIDENT_SEVERITY).includes(fields.severity)) {
    return { status: "NEEDS_VALID_SEVERITY", draft: null, reason: `"${fields.severity}" is not a recognised severity` };
  }
  if (fields.linkedResult && !knownResultIds.includes(fields.linkedResult)) {
    return { status: "NEEDS_VALID_RESULT_LINK", draft: null, reason: "the linked result is not a result recorded in this Election Canon" };
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.ELECTION_DAY.INCIDENT_REPORTED, category, description: description.value,
        location: fields.location ?? null, pollingUnit: fields.pollingUnitId ?? null, severity: fields.severity ?? null,
        linkedResult: fields.linkedResult ?? null,
      },
      label: "report incident", component: category,
      summary: `reporting incident: ${category.replace(/_/g, " ")}`,
    }),
  };
}

export async function executeReportIncident({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeReportIncident requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = incidentReportedEvent({
    incident: confirmationId, campaign, category: draft.category, description: draft.description,
    location: draft.location ?? undefined, pollingUnit: draft.pollingUnit ?? undefined, reportedBy: userId,
    severity: draft.severity ?? undefined, linkedResult: draft.linkedResult ?? undefined, eventId: confirmationId,
  });
  return insertEvent({ client, campaign, userId, event, confirmationId });
}

/** @param fields { incidentId, status, note, escalatedTo } @param roster —
 *  the reporter's OWN coordination hierarchy, `[{id, name, roleType}]`
 *  (the caller passes the live `view.people`/`view.assignments`-derived
 *  list; this function never reads a database itself, matching every
 *  other propose* in this module). When `status` is ESCALATED and
 *  `escalatedTo` is supplied, the target MUST exist in `roster` — this
 *  never invents an organisational relationship, per the directive's own
 *  "Escalation must be based on actual role membership" requirement. */
export async function proposeChangeIncidentStatus({ fields = {}, roster = [] } = {}) {
  const incidentId = requireText(fields.incidentId, "an incident");
  if (!incidentId.valid) return { status: "NEEDS_INCIDENT", draft: null, reason: incidentId.reason };
  const status = fields.status;
  if (!status || !Object.values(INCIDENT_STATUS).includes(status)) {
    return { status: "NEEDS_STATUS", draft: null, reason: `"${status}" is not a recognised incident status` };
  }
  let escalatedTo = null;
  if (status === INCIDENT_STATUS.ESCALATED && fields.escalatedTo) {
    const target = roster.find((p) => p?.id === fields.escalatedTo);
    if (!target) {
      return { status: "NEEDS_VALID_ESCALATION_TARGET", draft: null,
        reason: "the escalation target is not a recorded member of this campaign's roster" };
    }
    escalatedTo = target.id;
  }
  return {
    status: "PREPARED",
    draft: draftShape({
      draft: {
        type: ELECTION_EVENT_TYPES.ELECTION_DAY.INCIDENT_STATUS_CHANGED, incident: incidentId.value, status,
        note: fields.note ?? null, escalatedTo,
      },
      label: "incident status", component: incidentId.value,
      summary: `changing incident status to ${status.toLowerCase()}`,
    }),
  };
}

export async function executeChangeIncidentStatus({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false, error: "executeChangeIncidentStatus requires draft, campaign, userId, client, and confirmationId" };
  }
  const event = incidentStatusEvent({
    incident: draft.incident, campaign, status: draft.status, note: draft.note ?? undefined,
    escalatedTo: draft.escalatedTo ?? undefined, eventId: confirmationId,
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
  proposeAddPollingUnit, executeAddPollingUnit,
  proposeAssignAgent, executeAssignAgent,
  proposeChangeAgentStatus, executeChangeAgentStatus,
  proposeCaptureResult, executeCaptureResult,
  proposeRecordOcrExtraction, executeRecordOcrExtraction,
  proposeVerifyResult, executeVerifyResult,
  proposeReportIncident, executeReportIncident,
  proposeChangeIncidentStatus, executeChangeIncidentStatus,
  AGENT_STATUS, VERIFICATION_STATUS, INCIDENT_CATEGORIES, INCIDENT_STATUS, INCIDENT_SEVERITY,
  OCR_STATUS, OCR_CONFIDENCE, RESULT_LIFECYCLE_STAGE, resultLifecycleStage, MAX_FIELD_LENGTH,
};
