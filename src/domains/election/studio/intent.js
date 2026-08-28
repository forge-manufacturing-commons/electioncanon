// ============================================================
// FORGE ELECTION — CANONICAL INTENT  (MVP domain pack)
//
// A SIBLING to src/os/studio/intent.js, built to the SAME CONTRACT
// `resolveIntent(text, {preferredLanguage}) -> {type, ..., language, matched,
// confidence, reason}` — the shape understand.js's `vocabulary.resolveIntent`
// expects, unchanged. This file supplies DATA (Election's own phrase table and
// entity extraction) over the SAME scoring algorithm manufacturing's intent.js
// uses (longest-phrase-wins weighting), not a second implementation of it.
//
// THE RESOLVED SUBJECT LANDS IN `component`, NOT A NEW FIELD. understand.js
// (`intent.component = subject.id ?? base.component ?? null`) and request.js's
// domain-specific-kind fallback both write/read that one generic slot regardless
// of what the entity is actually called — a ward here, a component in
// manufacturing. Naming Election's own field `ward` would silently fall on the
// floor at that boundary, so it stays `component` here too: the field is a
// resolved-subject-id slot, not a manufacturing noun.
// ============================================================

import { detectLanguage, explicitLanguageRequest, resolveResponseLanguage } from "../../../os/studio/language.js";

export const INTENT = Object.freeze({
  CANDIDATE_OFFICE:       "candidate.office",
  CANDIDATE_CONSTITUENCY: "candidate.constituency",
  WARD_STATUS:            "ward.status",
  WARD_WHO:                "ward.who",
  WARD_WHY:                "ward.why",
  NEXT_ACTION:             "campaign.next_action",
  // ALPHA 1.2 — operational/coverage questions. Canon-wide aggregate
  // queries, like NEXT_ACTION: they need no resolved subject, because the
  // "subject" is the whole campaign's roster/results/incidents, not one
  // ward. Each is answered from the SAME folded view attention.js already
  // computes from — no new data source, just a conversational path to
  // the same honest counts Home/Intelligence already show.
  COVERAGE_GAPS:           "campaign.coverage_gaps",
  UNRESOLVED_INCIDENTS:    "campaign.unresolved_incidents",
  EVIDENCE_REVIEW:         "campaign.evidence_review",
  OCR_CONFIDENCE:          "campaign.ocr_confidence",
  // ALPHA 1.3 — five more campaign-wide questions, same "no resolved
  // subject needed, answered from the same folded view" shape as the
  // Alpha 1.2 set above. Each is deliberately DISTINCT from its nearest
  // Alpha 1.2 neighbour, not a rewording of it: RESULTS_SUBMITTED counts
  // how many polling units have reported AT ALL (EVIDENCE_REVIEW counts
  // human-review status of results already captured); DISPUTED_RESULTS
  // is its own verificationStatus, never folded into "pending review";
  // HIGH_PRIORITY_INCIDENTS filters UNRESOLVED_INCIDENTS by severity, it
  // does not replace it; POLLING_UNITS_NOT_REPORTING is a RESULT gap
  // (no captured result), distinct from COVERAGE_GAPS' AGENT gap (no
  // agent assigned) — a PU can have an agent and still not have reported;
  // COVERAGE_PERCENTAGE speaks the same real, null-when-no-denominator
  // number computeMobilizationCoverage() already computes for the
  // Mobilize screen — never a second, re-derived calculation.
  RESULTS_SUBMITTED:              "campaign.results_submitted",
  DISPUTED_RESULTS:               "campaign.disputed_results",
  HIGH_PRIORITY_INCIDENTS:        "campaign.high_priority_incidents",
  POLLING_UNITS_NOT_REPORTING:    "campaign.polling_units_not_reporting",
  COVERAGE_PERCENTAGE:            "campaign.coverage_percentage",
  ACTION_REQUEST:          "action.request",
  UNKNOWN:                 "unknown",
});

/** English only, honestly — see docs/BUSINESS-AI-DOMAIN-CONTRACT.md's language note. */
const PHRASES = Object.freeze({
  [INTENT.CANDIDATE_OFFICE]: {
    en: ["what office am i contesting", "which office am i contesting", "what office", "which office"],
  },
  [INTENT.CANDIDATE_CONSTITUENCY]: {
    en: ["what is my constituency", "which constituency", "my constituency"],
  },
  [INTENT.WARD_STATUS]: {
    en: ["status of the campaign", "campaign status", "what is happening in",
         "what's happening in", "status in", "current status"],
  },
  [INTENT.WARD_WHO]: {
    en: ["who is responsible", "who's responsible", "who is in charge", "who is leading"],
  },
  [INTENT.WARD_WHY]: {
    en: ["why", "why is", "why has", "why hasn't", "why has not",
         "what is stopping", "what's stopping", "what is blocking", "what's blocking"],
  },
  [INTENT.NEXT_ACTION]: {
    en: ["what should we do next", "what do we do next", "what next", "next step"],
  },
  [INTENT.COVERAGE_GAPS]: {
    en: ["which wards have no coordinator", "wards with no coordinator", "wards without a coordinator",
         "which polling units have no agent", "polling units with no agent", "polling units without an agent",
         "coverage gaps", "which wards are not ready", "wards not ready"],
  },
  [INTENT.UNRESOLVED_INCIDENTS]: {
    en: ["unresolved incidents", "show unresolved incidents", "open incidents", "which incidents are unresolved",
         "what incidents are unresolved", "outstanding incidents"],
  },
  [INTENT.EVIDENCE_REVIEW]: {
    en: ["evidence waiting for verification", "what evidence is waiting", "results awaiting review",
         "which results need review", "results pending review", "evidence pending review",
         "how many polling units have submitted evidence"],
  },
  [INTENT.OCR_CONFIDENCE]: {
    en: ["low ocr confidence", "which result sheets have low ocr confidence", "low confidence results",
         "results with low confidence"],
  },
  [INTENT.RESULTS_SUBMITTED]: {
    en: ["how many results have been submitted", "results submitted", "how many polling units have submitted results",
         "how many polling units have reported", "results submitted so far"],
  },
  [INTENT.DISPUTED_RESULTS]: {
    en: ["disputed results", "which results are disputed", "how many results are disputed", "results in dispute"],
  },
  [INTENT.HIGH_PRIORITY_INCIDENTS]: {
    en: ["high priority incidents", "high-priority incidents", "critical incidents", "high severity incidents",
         "urgent incidents"],
  },
  [INTENT.POLLING_UNITS_NOT_REPORTING]: {
    en: ["polling units not reporting", "which polling units have not reported", "polling units that have not reported",
         "polling units with no result"],
  },
  [INTENT.COVERAGE_PERCENTAGE]: {
    en: ["coverage percentage", "what percentage of polling units are covered", "what is our coverage",
         "overall coverage", "percent covered"],
  },
  // NOT A QUESTION. Recognised so it can be REFUSED with a reason — same purpose
  // as manufacturing's ACTION_REQUEST (see os/studio/intent.js).
  [INTENT.ACTION_REQUEST]: {
    en: ["prepare a", "prepare the", "draft a", "draft the", "publish this",
         "create a poster", "make it", "approve this"],
  },
});

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC");

/**
 * A ward id, extracted the same shape-based way manufacturing extracts a
 * component id — never invented, only ever a candidate string for entity.js to
 * resolve against the live fold (see request.js's UNRESOLVED_ENTITY path).
 */
export function extractEntities(text) {
  const raw = String(text ?? "");
  const m = raw.match(/\bward\s+([a-z0-9]+)\b/i);
  return { component: m ? `Ward ${m[1]}` : null };
}

export function resolveIntent(text, { preferredLanguage = "en" } = {}) {
  const raw = String(text ?? "");
  const lower = norm(raw);
  const detected = detectLanguage(raw);
  const explicit = explicitLanguageRequest(raw);
  const { language: responseLanguage, because } =
    resolveResponseLanguage({ detected, preferred: preferredLanguage, explicit });

  const hits = [];
  for (const [type, byLang] of Object.entries(PHRASES)) {
    for (const [lang, phrases] of Object.entries(byLang)) {
      for (const p of phrases) {
        const n = norm(p);
        if (lower.includes(n)) {
          hits.push({ type, lang, phrase: p, weight: n.split(/\s+/).filter(Boolean).length });
        }
      }
    }
  }

  const entities = extractEntities(raw);

  if (!hits.length) {
    return Object.freeze({
      type: INTENT.UNKNOWN, ...entities, subject: null,
      language: responseLanguage, detectedLanguage: detected.language,
      languageConfidence: detected.confidence, mixedLanguage: detected.mixed,
      responseLanguageBecause: because, confidence: 0, matched: Object.freeze([]),
      reason: "no recognised intent phrase",
    });
  }

  const totals = new Map();
  const longest = new Map();
  for (const h of hits) {
    totals.set(h.type, (totals.get(h.type) ?? 0) + h.weight);
    longest.set(h.type, Math.max(longest.get(h.type) ?? 0, h.phrase.length));
  }
  const best = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || (longest.get(b[0]) ?? 0) - (longest.get(a[0]) ?? 0),
  )[0];
  const [type, weight] = best;
  const totalWeight = [...totals.values()].reduce((a, b) => a + b, 0);

  return Object.freeze({
    type, ...entities, subject: null,
    language: responseLanguage, detectedLanguage: detected.language,
    languageConfidence: detected.confidence, mixedLanguage: detected.mixed,
    responseLanguageBecause: because,
    confidence: Number((weight / totalWeight).toFixed(2)),
    matched: Object.freeze(hits.filter((h) => h.type === type).map((h) => h.phrase)),
    reason: null,
  });
}

export const sameIntent = (a, b) => a?.type === b?.type && (a?.component ?? null) === (b?.component ?? null);

export default { INTENT, resolveIntent, extractEntities, sameIntent };
