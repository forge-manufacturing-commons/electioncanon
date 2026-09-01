// ============================================================
// FORGE ELECTION — CONVERSATIONAL WRITES  (first version)
//
// Business's `write.js` proved the PREPARE -> APPROVAL -> EXECUTE shape;
// this is Election's OWN, much smaller instance of the identical
// architecture, not a copy-paste of Business's code (the entities, phrase
// table, and event factories are Election's own).
//
// FOUR OPERATIONS EXIST, BECAUSE ONLY FOUR ARE JUSTIFIED. Every
// reconnaissance pass against this repository found real, validated
// Election event factories: `candidateEvent`, `wardAssignedEvent`,
// `wardStatusEvent`, and (Loop 29) `observerAssignedEvent`. The observer
// operation earned the same bar the two ward operations already had: it is
// the ONLY way an `observer.assignment.recorded` event can ever be
// written. CANDIDATE REGISTRATION (LOOP 32) earns it too — Loop 31's own
// audit concluded `CANDIDATE_REGISTERED` was already a correctly-derived
// readiness dimension with NO real way for a candidate to ever trigger it
// (only direct test-fixture construction could produce the event); this is
// that gap closed, not a new fact invented. Do not add a further operation
// without the same justification this comment gives for these four.
//
// CANDIDATE REGISTRATION ESTABLISHES ONLY A SELF-DECLARATION, THE SAME
// EPISTEMIC STATUS WARD/OBSERVER ASSIGNMENT ALREADY HAVE. No external
// registry verifies `office`/`constituency`/`party` any more than one
// verifies a ward name or an observer's name — this event means "this
// campaign's Canon contains a candidate registration declaration," never
// "legally eligible," "nominated," "party-approved," or "INEC-registered."
// See events.js's own REQUIRED_ACTOR_KIND entry for this type (declared
// back in Loop 30, unused until now) for the actor-kind gate this
// activation relies on unchanged.
//
// `candidate` (the subject id) IS `campaign` (the tenant id) — not a
// user-suppliable field, not a slug generated from `name`. A campaign in
// this data model already IS one candidate's own campaign (see
// electionBootstrap.js's own reasoning for why `campaigns` exists), and
// `deriveReadiness()` has only ever read `candidates[0]` — there is no
// meaning anywhere in this Canon for a SECOND distinct candidate id inside
// one campaign's log. Reusing `campaign` as `candidate` avoids inventing an
// id-generation scheme with its own edge cases (collisions, slugs) for a
// concept that is already one-per-tenant by construction.
//
// ANCHORED, IMPERATIVE-PREFIX CLASSIFICATION — NOT A SUBSTRING-ANYWHERE
// PHRASE TABLE. Business's own write.js history (Loop 18, Loop 21) found
// repeated collisions from bare substring markers matching ordinary
// questions ("new customer" inside an observation, "complete the task"
// inside "Did I complete the task for Ade?"). Every Election write pattern
// below is anchored to the START of the message ("Assign observer .../
// "Assign .../"Report ..."), which a natural question never is ("Who is
// assigned to Ward 6?", "Is an observer assigned to this polling unit?",
// "What is the report for Ward 6?" all open with an interrogative, never
// with the bare imperative verb) — this closes that collision class by
// construction rather than by a phrase-table blocklist.
//
// OBSERVER-ASSIGN IS CHECKED BEFORE WARD-ASSIGN, DELIBERATELY. "Assign
// observer Jane to Location X" would ALSO satisfy `matchWardAssign`'s
// bare `/^assign\s+(.+?)\s+to\s+(.+?)/` pattern (capturing "observer Jane"
// as an organisation name) if that check ran first — the literal word
// "observer" is what makes the observer pattern the MORE SPECIFIC match,
// so `proposeElectionWrite` tries it first and only falls through to the
// general ward pattern when it does not match. See test S in
// test/election-readiness.consumer.mjs for the collision proof this
// ordering exists to satisfy.
//
// NO MODEL ESCALATION THIS VERSION. `proposeElectionWrite` accepts no
// `interpreter` parameter — only the two deterministic patterns below are
// recognised. Extending this to a model-backed path is future work, not a
// silent gap: the omission is a scope decision (this loop's own brief:
// "DO NOT invent a large collection of election WRITE_OPERATIONs"), stated
// here rather than left to be discovered as a missing feature.
// ============================================================

import { candidateEvent, wardAssignedEvent, wardStatusEvent, observerAssignedEvent, ELECTION_EVENT_TYPES } from "../events.js";

export const ELECTION_WRITE_OPERATION = Object.freeze({
  CANDIDATE_REGISTER: "write.candidate.register",
  WARD_ASSIGN: "write.ward.assign",
  WARD_STATUS_REPORT: "write.ward.status_report",
  OBSERVER_ASSIGN: "write.observer.assign",
});

// FIRST-USER COMPLETION PASS — this notice is shown on EVERY freshly
// prepared draft, before Approve is ever clicked — it is a static label for
// the PENDING state, not the result of a real-time permission check (a
// signed-in, authorised owner sees this too, on every single action). This
// is the exact panel behind "Record a campaign action" / candidate
// registration, PREPARE/APPROVE via WriteActionPanel (shared.jsx). A real
// Approve failure is reported separately, in `error`/friendlyError().
const NOT_AUTHORISED_NOTICE =
  "NOT YET RECORDED — review this action, then click Approve to record it.";

/** Same ceiling discipline as Business's MAX_ENTITY_NAME_LENGTH — not an electoral fact. */
export const MAX_FIELD_LENGTH = 200;

function validateFreeText(raw, label) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { valid: false, reason: `no ${label} was understood` };
  if (trimmed.length > MAX_FIELD_LENGTH) {
    return { valid: false, reason: `a ${label} above ${MAX_FIELD_LENGTH} characters is not recordable — check the text` };
  }
  return { valid: true, value: trimmed };
}

/**
 * "Register <name> as candidate for <office> in <constituency>, <party>" —
 * anchored at the start, requiring the literal sequence "as candidate for
 * ... in ..." so it cannot collide with an ordinary question or statement
 * about registration ("Did I register as a candidate?", "Is the candidate
 * registered?", "Candidate registration is complete." — none contain this
 * exact structured shape). Deliberately does NOT require the campaign to
 * already lack a candidate: a repeat registration is a CORRECTION (a new
 * event that overwrites the prior declaration), the same "correction is a
 * new event, never an edit to history" principle Business's own write.js
 * already follows.
 */
function matchCandidateRegister(message) {
  const m = String(message ?? "").trim()
    .match(/^register\s+(.+?)\s+as\s+candidate\s+for\s+(.+?)\s+in\s+(.+?)\s*,\s*(.+?)\s*[.!]*$/i);
  if (!m) return null;
  return { nameText: m[1].trim(), officeText: m[2].trim(), constituencyText: m[3].trim(), partyText: m[4].trim() };
}

/**
 * "Assign observer <name> to <location>" — anchored at the start, and
 * anchored on the literal word "observer" as the SECOND token specifically
 * so it is checked (and matches) before the more general ward-assign
 * pattern below — see the module header on why the order matters.
 * Deliberately does NOT require the observer to already exist in Canon:
 * assignment is how an observer FIRST enters Election Canon, the same
 * reasoning `matchWardAssign` already gives for wards.
 */
function matchObserverAssign(message) {
  const m = String(message ?? "").trim().match(/^assign\s+observer\s+(.+?)\s+to\s+(.+?)\s*[.!]*$/i);
  if (!m) return null;
  return { observerText: m[1].trim(), locationText: m[2].trim() };
}

/**
 * "Assign <organisation> to <ward>" — anchored at the start. Deliberately
 * does NOT require the ward to already exist in Canon: assignment is how a
 * ward FIRST enters Election Canon (mirroring Business's TASK_CREATE, which
 * checks the CUSTOMER exists, never the task-to-be-created).
 */
function matchWardAssign(message) {
  const m = String(message ?? "").trim().match(/^assign\s+(.+?)\s+to\s+(.+?)\s*[.!]*$/i);
  if (!m) return null;
  return { organisationText: m[1].trim(), wardText: m[2].trim() };
}

/**
 * "Report <ward> as <status>[ because <reason>]" — anchored at the start.
 * The ward MUST already exist (resolved against `view.wards`, exactly as
 * Business's `task.complete` requires the task to already exist) — status
 * reporting on a name the Canon has never seen is far more likely a typo
 * than a genuinely new ward, and refusing costs a legitimate user nothing
 * (they assign the ward first, exactly as the daily workflow already
 * expects: assign, then report).
 */
function matchWardStatusReport(message) {
  const m = String(message ?? "").trim()
    .match(/^report\s+(.+?)\s+as\s+(.+?)(?:\s+because\s+(.+?))?\s*[.!]*$/i);
  if (!m) return null;
  return { wardText: m[1].trim(), statusText: m[2].trim(), reasonText: m[3] ? m[3].trim() : null };
}

function draftShape({ draft, label, component, summary }) {
  return Object.freeze({
    draft: Object.freeze(draft),
    label, component,
    missingFields: Object.freeze(["person", "eventId", "at"]),
    published: false,
    authorised: false,
    notice: NOT_AUTHORISED_NOTICE,
    reason: null,
    summary,
  });
}

/**
 * PROPOSE an Election write. Returns a PREPARE-shaped result — `draft` is
 * null unless every required field independently validated. NEVER writes
 * anything: no import here reaches a client, a policy, or an emitter.
 *
 * @param message  the participant's own words — the ONLY source a ward
 *                 name, organisation name, or status is ever read from.
 * @param view     projectElection(log, campaign) — the CURRENT, already
 *                 tenant-scoped Canon. A ward name is resolved against this
 *                 and nothing else.
 */
export async function proposeElectionWrite({ message, view = {} } = {}) {
  const understoodBy = "DETERMINISTIC";

  // "register" is a verb none of the other three patterns use, so ordering
  // relative to them carries no collision risk the way observer-vs-ward
  // assignment did.
  const register = matchCandidateRegister(message);
  if (register) {
    const name = validateFreeText(register.nameText, "candidate name");
    if (!name.valid) return { status: "NEEDS_NAME", understoodBy, draft: null, reason: name.reason };
    const office = validateFreeText(register.officeText, "office");
    if (!office.valid) return { status: "NEEDS_OFFICE", understoodBy, draft: null, reason: office.reason };
    const constituency = validateFreeText(register.constituencyText, "constituency");
    if (!constituency.valid) return { status: "NEEDS_CONSTITUENCY", understoodBy, draft: null, reason: constituency.reason };
    const party = validateFreeText(register.partyText, "party");
    if (!party.valid) return { status: "NEEDS_PARTY", understoodBy, draft: null, reason: party.reason };
    return {
      status: "PREPARED", understoodBy,
      draft: draftShape({
        draft: {
          type: ELECTION_EVENT_TYPES.CANDIDATE.REGISTERED,
          name: name.value, office: office.value, constituency: constituency.value, party: party.value,
        },
        label: "candidate registration", component: name.value,
        summary: `registering ${name.value} as candidate for ${office.value} (${constituency.value}, ${party.value})`,
      }),
    };
  }

  // Checked next — see the module header on why observer-assign must be
  // tried before the more general ward-assign pattern.
  const observerAssign = matchObserverAssign(message);
  if (observerAssign) {
    const observer = validateFreeText(observerAssign.observerText, "observer name");
    if (!observer.valid) return { status: "NEEDS_OBSERVER", understoodBy, draft: null, reason: observer.reason };
    const location = validateFreeText(observerAssign.locationText, "location");
    if (!location.valid) return { status: "NEEDS_LOCATION", understoodBy, draft: null, reason: location.reason };
    return {
      status: "PREPARED", understoodBy,
      draft: draftShape({
        draft: { type: ELECTION_EVENT_TYPES.OBSERVER.ASSIGNED, observer: observer.value, location: location.value },
        label: "observer assignment", component: observer.value,
        summary: `assigning observer ${observer.value} to ${location.value}`,
      }),
    };
  }

  const assign = matchWardAssign(message);
  if (assign) {
    const org = validateFreeText(assign.organisationText, "organisation name");
    if (!org.valid) return { status: "NEEDS_ORGANISATION", understoodBy, draft: null, reason: org.reason };
    const ward = validateFreeText(assign.wardText, "ward name");
    if (!ward.valid) return { status: "NEEDS_WARD", understoodBy, draft: null, reason: ward.reason };
    return {
      status: "PREPARED", understoodBy,
      draft: draftShape({
        draft: { type: ELECTION_EVENT_TYPES.CAMPAIGN.WARD_ASSIGNED, ward: ward.value, organisation: org.value },
        label: "ward assignment", component: ward.value,
        summary: `assigning ${org.value} to ${ward.value}`,
      }),
    };
  }

  const report = matchWardStatusReport(message);
  if (report) {
    const wardText = validateFreeText(report.wardText, "ward name");
    if (!wardText.valid) return { status: "NEEDS_WARD", understoodBy, draft: null, reason: wardText.reason };
    const ward = view?.wards?.[wardText.value];
    if (!ward) {
      return { status: "NEEDS_WARD", understoodBy, draft: null,
        reason: `no ward "${wardText.value}" has been recorded for this campaign — assign a team to it before reporting its status` };
    }
    const status = validateFreeText(report.statusText, "status");
    if (!status.valid) return { status: "NEEDS_STATUS", understoodBy, draft: null, reason: status.reason };
    const reasonResult = report.reasonText ? validateFreeText(report.reasonText, "reason") : null;
    const reason = reasonResult?.valid ? reasonResult.value : null;
    return {
      status: "PREPARED", understoodBy,
      draft: draftShape({
        draft: { type: ELECTION_EVENT_TYPES.CAMPAIGN.WARD_STATUS_REPORTED, ward: ward.id, status: status.value, reason },
        label: "ward status report", component: ward.id,
        summary: `reporting ${ward.id} as ${status.value}`,
      }),
    };
  }

  return { status: "NOT_UNDERSTOOD", understoodBy, draft: null,
    reason: "the request was not recognised as an Election write operation" };
}

/**
 * EXECUTE an Election write. The ONLY function in this module (or anywhere
 * in `src/domains/election`) that reaches a client/store. Reused exactly
 * once per approved draft, by exactly one caller, mirroring Business's own
 * `executeWrite` single-call-site discipline.
 *
 * `campaign`/`userId` come ONLY from the caller's own authenticated
 * identity — NEVER from `draft` (the draft carries no campaign/actor field
 * at all, by construction; see `draftShape`'s `missingFields`) and never
 * from any model proposal, because no model proposal is ever consulted in
 * this module at all (see the module header).
 *
 * `confirmationId` is the idempotency key, reused as `eventId` — the SAME
 * mechanism, and the same UNIQUE-violation-is-success handling, as
 * Business's `executeWrite`.
 */
export async function executeElectionWrite({ draft, campaign, userId, client, confirmationId } = {}) {
  if (!draft || !campaign || !userId || !client || !confirmationId) {
    return { success: false, alreadyRecorded: false,
      error: "executeElectionWrite requires draft, campaign, userId, client, and confirmationId" };
  }

  let event;
  if (draft.type === ELECTION_EVENT_TYPES.CANDIDATE.REGISTERED) {
    // `candidate` is `campaign` — see the module header. Never taken from
    // `draft` (the draft carries no candidate/campaign field at all, by
    // construction) and never independently generated; the same identifier
    // resolveElectionScope() already verified is what this campaign's one
    // candidate record is keyed by.
    event = candidateEvent({
      candidate: campaign, campaign, name: draft.name, office: draft.office,
      constituency: draft.constituency, party: draft.party, eventId: confirmationId,
    });
  } else if (draft.type === ELECTION_EVENT_TYPES.CAMPAIGN.WARD_ASSIGNED) {
    // `person` (LOOP 34) — forwarded ONLY IF the draft already carries it,
    // the same optional pass-through discipline WARD_STATUS_REPORTED's own
    // `reason` already gets below. The natural-language PREPARE path
    // (matchWardAssign) never sets this — see write.js's own module header
    // and test J2/B8's own assertion that a ward-assign draft names no
    // `person` — so this closes the SECOND drop point in the same
    // `wardAssignedEvent.person` correctness gap: without this, even a
    // draft a future channel or caller legitimately populated with a person
    // would have been silently discarded HERE, before ever reaching the
    // factory that already accepts it.
    event = wardAssignedEvent({
      ward: draft.ward, campaign, organisation: draft.organisation,
      person: draft.person ?? undefined, eventId: confirmationId,
    });
  } else if (draft.type === ELECTION_EVENT_TYPES.CAMPAIGN.WARD_STATUS_REPORTED) {
    // `person` (LOOP 35) — the REPORTER, not the assignee (see events.js's
    // own field, and projections.js's own comment on why this is a
    // DIFFERENT fact from `WARD_ASSIGNED.person`). Forwarded ONLY IF the
    // draft already carries it — matchWardStatusReport never sets this, so
    // this closes the same accept-but-drop gap Loop 34 closed for
    // WARD_ASSIGNED, applied to its own distinct sibling field.
    event = wardStatusEvent({
      ward: draft.ward, campaign, status: draft.status,
      reason: draft.reason ?? undefined, person: draft.person ?? undefined, eventId: confirmationId,
    });
  } else if (draft.type === ELECTION_EVENT_TYPES.OBSERVER.ASSIGNED) {
    event = observerAssignedEvent({
      observer: draft.observer, campaign, location: draft.location, eventId: confirmationId,
    });
  } else {
    return { success: false, alreadyRecorded: false,
      error: `executeElectionWrite does not recognise draft type "${draft.type}"` };
  }

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

export default { ELECTION_WRITE_OPERATION, proposeElectionWrite, executeElectionWrite, MAX_FIELD_LENGTH };

