// ============================================================
// FORGE ELECTION — OBSERVER ORGANISATION READINESS ENGINE  (Loop 29)
//
// deriveObserverReadiness(view) is the FIRST non-candidate preparedness
// engine — a pure, read-only projection of the SAME Election Canon
// (`projectElection()`'s own output) an observer organisation's tenant
// produces, into evidence-backed readiness claims. It is a SIBLING to
// src/domains/election/studio/readiness.js, not a replacement, an
// extension, or a merge — that file remains exactly as candidate-specific
// as it always was; this file never imports it and never modifies it.
//
// ONLY ONE DIMENSION IS IMPLEMENTED, BECAUSE ONLY ONE IS REAL. Loop 29's
// reconnaissance checked every category Loop 28's brief named for observer
// organisations — accreditation, training, deployment coverage, logistics,
// security, communications, command structure, incident reporting,
// evidence integrity — against the actual Election Canon
// (`observer.assignment.recorded`, the only observer event this loop
// added) and found authoritative backing for exactly one fact:
//
//   OBSERVER_ASSIGNMENT — does at least one observer have a recorded
//                         assignment to an operational location.
//
// Every other dimension a fuller observer-preparedness engine might want
// renders in `unsupportedDimensions` — never fabricated, never silently
// omitted.
//
// UNKNOWN, NOT INCOMPLETE, WHEN NO ASSIGNMENT EXISTS. This is a
// DELIBERATE, DOCUMENTED DEPARTURE from candidate readiness's own
// CANDIDATE_REGISTERED dimension, which reads INCOMPLETE when no candidate
// is registered. The difference is epistemic, not stylistic: a campaign
// with no candidate.registered event is a campaign that has definitely not
// registered its candidate — INCOMPLETE is the true fact. A campaign with
// no observer.assignment.recorded event could mean "no observer has been
// assigned yet" OR "no observer deployment is required for this
// organisation's current programme" OR simply "nobody has told the Canon
// yet" — this Canon has no event that distinguishes those cases, so
// claiming INCOMPLETE would assert a fact the evidence does not support.
// UNKNOWN is the only honest reading of silence here.
//
// INCOMPLETE AND AT_RISK ARE STRUCTURALLY UNREACHABLE THIS LOOP, ON
// PURPOSE. Nothing in `observer.assignment.recorded` carries a status/
// health field (unlike `campaign.ward.status_reported`), so there is no
// authoritative event that could ever establish "assignment explicitly
// required but not met" (INCOMPLETE) or "assignment at risk" (AT_RISK).
// The dimension function below can only ever produce COMPLETE or UNKNOWN —
// this is stated in code, not hidden, and is the correct behavior until a
// SEPARATE, deliberately designed event adds that evidence.
//
// NO WRITE. NO CONVERSATION READ. Exactly the same guarantee
// readiness.js's own header states, for the identical reason: this file
// imports nothing from conversation.js, write.js, or any provider/model
// module. It takes a `view` and returns claims.
// ============================================================

const READINESS_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
  AT_RISK: "AT_RISK",
  UNKNOWN: "UNKNOWN",
});

function claim({ dimension, status, value, threshold, sourceEntity, sourceEvent, calculation, confidence }) {
  return Object.freeze({
    dimension, status, value, threshold: threshold ?? null,
    source: "fold", source_entity: sourceEntity, source_event: sourceEvent,
    calculation, timestamp: null, confidence,
  });
}

function observerAssignmentClaim(observers) {
  const hasAny = observers.length > 0;
  return claim({
    dimension: "OBSERVER_ASSIGNMENT",
    status: hasAny ? READINESS_STATUS.COMPLETE : READINESS_STATUS.UNKNOWN,
    value: hasAny
      ? `${observers.length} observer assignment${observers.length === 1 ? "" : "s"} recorded in Forge Election Canon`
      : "no observer assignment is recorded in Forge Election Canon",
    threshold: "observers{} is non-empty",
    sourceEntity: "observers", sourceEvent: "observer.assignment.recorded",
    calculation: "Object.keys(view.observers).length > 0",
    // UNKNOWN, not a lower-confidence CANON claim — the fold genuinely has
    // no evidence either way when this reads UNKNOWN (see module header).
    confidence: hasAny ? "CANON" : "UNKNOWN",
  });
}

/**
 * One GAP for the one non-COMPLETE claim this dimension can produce. Exactly
 * one shape: "no observer assignment has been recorded yet." `owner`/
 * `deadline`/`dependency` stay honestly UNKNOWN — no Canon field carries any
 * of them for observer organisations, matching readiness.js's own refusal
 * to guess.
 */
function gapFor(claimObj) {
  if (claimObj.status === READINESS_STATUS.COMPLETE) return null;
  return Object.freeze({
    what: claimObj.value,
    why_it_matters: "no observer has an identified assignment, so this organisation's Canon " +
                    "cannot yet demonstrate any operational deployment for this election",
    canon_evidence: claimObj.source_entity,
    action: "record an observer assignment to an operational location",
    owner: "UNKNOWN",
    deadline: "UNKNOWN",
    dependency: "UNKNOWN",
    status: claimObj.status,
    resolves_when: "an observer.assignment.recorded event exists",
  });
}

/**
 * The single entry point for observer organisation readiness. Pure
 * function: `view` in, claims/gaps/unsupportedDimensions out. Never throws
 * on an empty Canon.
 */
export function deriveObserverReadiness(view = {}) {
  const observers = Object.values(view?.observers ?? {});
  const assignmentClaim = observerAssignmentClaim(observers);
  const gaps = [gapFor(assignmentClaim)].filter(Boolean);

  return Object.freeze({
    claims: Object.freeze([assignmentClaim]),
    gaps: Object.freeze(gaps),
    // NEVER a single opaque percentage or score — see readiness.js's own
    // header on why. A raw count over exactly what the Canon already
    // proved, nothing derived beyond it.
    knownObserverCoverage: Object.freeze({
      knownObservers: observers.length,
      note: observers.length > 0
        ? "This reflects only the observers already recorded in Forge Election Canon. " +
          "The true operational deployment plan for this organisation is not a Canon fact " +
          "and is not represented here — this is not full deployment coverage."
        : "Forge Election Canon has no observer assignments recorded at all.",
    }),
    // Every category Loop 28/29's own briefs named for observer
    // organisations that this loop found NO authoritative event for.
    // Adding a new dimension here without first adding the Canon evidence
    // it would read is exactly the failure this module exists to refuse.
    unsupportedDimensions: Object.freeze([
      "ACCREDITATION", "OBSERVER_TRAINING", "DEPLOYMENT_COVERAGE", "LOGISTICS_READINESS",
      "SECURITY_READINESS", "COMMUNICATIONS_READINESS", "COMMAND_STRUCTURE",
      "INCIDENT_REPORTING", "EVIDENCE_INTEGRITY", "PROGRAMME_DEFINITION",
    ]),
  });
}

export const OBSERVER_READINESS_DIMENSION_STATUS = READINESS_STATUS;

export default { deriveObserverReadiness, OBSERVER_READINESS_DIMENSION_STATUS };
