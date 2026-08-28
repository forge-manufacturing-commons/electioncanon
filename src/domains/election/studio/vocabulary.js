// ============================================================
// FORGE ELECTION — UNDERSTANDING VOCABULARY  (MVP domain pack)
//
// The bundle understand.js's `vocabulary` parameter expects (see
// os/studio/understand.js's `DEFAULT_VOCABULARY` and its own header comment on
// "what makes a domain pluggable into this ONE understanding stage, not a
// second one"). This is DATA, not algorithm: `understand()` itself is never
// imported, wrapped or reimplemented here — a caller imports it straight from
// os/studio/understand.js and hands it THIS bundle.
// ============================================================

import { INTENT, resolveIntent } from "./intent.js";
import { ELECTION_EVENT_TYPES } from "../events.js";

const ANSWERABLE = Object.freeze([
  INTENT.CANDIDATE_OFFICE, INTENT.CANDIDATE_CONSTITUENCY,
  INTENT.WARD_STATUS, INTENT.WARD_WHO, INTENT.WARD_WHY,
  INTENT.NEXT_ACTION, INTENT.COVERAGE_GAPS, INTENT.UNRESOLVED_INCIDENTS,
  INTENT.EVIDENCE_REVIEW, INTENT.OCR_CONFIDENCE,
  INTENT.RESULTS_SUBMITTED, INTENT.DISPUTED_RESULTS, INTENT.HIGH_PRIORITY_INCIDENTS,
  INTENT.POLLING_UNITS_NOT_REPORTING, INTENT.COVERAGE_PERCENTAGE,
  INTENT.ACTION_REQUEST,
]);

/** Only ward-level questions are meaningless without a resolved subject. */
const NEEDS_SUBJECT_TYPES = Object.freeze([INTENT.WARD_STATUS, INTENT.WARD_WHO, INTENT.WARD_WHY]);

/** entity.js's `kinds` — which `view` keys hold resolvable entities. */
const ENTITY_KINDS = Object.freeze([Object.freeze({ key: "wards", kind: "ward" })]);

/** request.js's allowlist — every operation a model may propose, all reads. */
const SEMANTIC_INTENTS = Object.freeze({
  "candidate.office":        INTENT.CANDIDATE_OFFICE,
  "candidate.constituency":  INTENT.CANDIDATE_CONSTITUENCY,
  "ward.status":             INTENT.WARD_STATUS,
  "ward.who":                INTENT.WARD_WHO,
  "ward.responsibility":     INTENT.WARD_WHO,
  "ward.why":                INTENT.WARD_WHY,
  "ward.blocked_reason":     INTENT.WARD_WHY,
  "campaign.next_action":    INTENT.NEXT_ACTION,
  "campaign.coverage_gaps":        INTENT.COVERAGE_GAPS,
  "campaign.unresolved_incidents": INTENT.UNRESOLVED_INCIDENTS,
  "campaign.evidence_review":      INTENT.EVIDENCE_REVIEW,
  "campaign.ocr_confidence":       INTENT.OCR_CONFIDENCE,
  "campaign.results_submitted":            INTENT.RESULTS_SUBMITTED,
  "campaign.disputed_results":             INTENT.DISPUTED_RESULTS,
  "campaign.high_priority_incidents":      INTENT.HIGH_PRIORITY_INCIDENTS,
  "campaign.polling_units_not_reporting":  INTENT.POLLING_UNITS_NOT_REPORTING,
  "campaign.coverage_percentage":          INTENT.COVERAGE_PERCENTAGE,
  "action.request":          INTENT.ACTION_REQUEST,
});
const PROPOSABLE = Object.freeze(Object.keys(SEMANTIC_INTENTS));
const NEEDS_COMPONENT = Object.freeze([INTENT.WARD_STATUS, INTENT.WARD_WHO, INTENT.WARD_WHY]);

/**
 * prepare.js's optional sub-bundle. Only ONE draftable outcome exists this
 * phase — a situation report — because no document/creative engine exists to
 * draft a poster or a website against (see docs/BUSINESS-AI-DOMAIN-CONTRACT.md
 * and the final report's "deliberately not built" section). The guarantees
 * prepare.js enforces unconditionally (published:false, authorised:false, no
 * person/eventId/at, fail-closed on an unrecognised type) are NOT re-declared
 * here — they are prepare.js's, shared, not Election's to restate.
 */
const DRAFTABLE = Object.freeze([
  {
    match: /\b(situation report|status report|campaign report|report)\b/i,
    build: (ward, id) => ({
      type: ELECTION_EVENT_TYPES.DOCUMENT.PUBLISHED,
      ward: id, document: `${id} situation report`,
      summary: `Situation report drafted for ${id}`,
    }),
    label: "situation report",
  },
]);
const CANONICAL_TYPES = Object.freeze(
  new Set(Object.values(ELECTION_EVENT_TYPES).flatMap((group) => Object.values(group))),
);

export const ELECTION_VOCABULARY = Object.freeze({
  resolveIntent, INTENT, ANSWERABLE, needsSubjectTypes: NEEDS_SUBJECT_TYPES,
  entityKinds: ENTITY_KINDS,
  operations: PROPOSABLE,
  semanticIntents: SEMANTIC_INTENTS,
  needsComponent: NEEDS_COMPONENT,
  // The §23 "bare entity resumes the last question" rule fires for kind
  // "ward" here, the same way it fires for "component" in manufacturing.
  carryForwardKinds: Object.freeze(["ward"]),
  prepare: Object.freeze({
    draftable: DRAFTABLE,
    canonicalTypes: CANONICAL_TYPES,
    subjectOf: (v, i) => v?.wards?.[i],
  }),
});

export default { ELECTION_VOCABULARY };
