// ============================================================
// FORGE ELECTION — RESPONSE COMPOSER  (MVP domain pack)
//
// Election's own `responder`, passed to ask.js's `askForge({responder, ...})`
// seam. SAME CONTRACT as os/studio/respond.js's `planResponse`:
//
//   ({ grounded, intent, view }) -> { answer, language, fellBack, sources,
//     presented, segments, refused, canonLimitation, clarifying, preserved }
//
// and it imports `SEGMENT` from the CORE respond.js rather than declaring its
// own — CANON / CANON_ABSENCE / RECOMMENDATION / AUTHORITY / PREPARED /
// NOT_UNDERSTOOD / CLARIFY mean the same thing here as they do for
// manufacturing, because a surface (Studio, a future Election room) renders
// them once, generically, regardless of which domain produced them.
//
// ONE LANGUAGE, HONESTLY. Only `en` has real connective wording below. Any
// other requested language falls back to English and SAYS SO (`fellBack:
// true`) via the exact same `realiserFor` fallback shape os/studio/respond.js
// uses — never a fabricated Hausa/Yoruba/Igbo sentence invented to look
// supported. See docs/BUSINESS-AI-DOMAIN-CONTRACT.md's language section.
// ============================================================

import { isBinding, isCanonLimitation } from "../../../os/studio/grounding.js";
import { SEGMENT } from "../../../os/studio/respond.js";
import { verifyPreserved } from "../../../os/studio/terms.js";
import { REQUEST } from "../../../os/studio/request.js";
import { INTENT } from "./intent.js";

const REALISERS = Object.freeze({
  en: {
    office: (o) => `You are contesting for ${o}.`,
    noOffice: () => "ElectionCanon has no office recorded for this candidate.",
    constituency: (c) => `Your constituency is ${c}.`,
    noConstituency: () => "ElectionCanon has no constituency recorded for this candidate.",
    wardStatus: (w, s) => `${w} is currently reported as ${s}.`,
    noWardStatus: (w) => `No status has been reported for ${w} in ElectionCanon.`,
    wardOrg: (w, o) => `${o} is responsible for ${w}.`,
    noWardOrg: (w) => `No team has been assigned responsibility for ${w} in ElectionCanon.`,
    wardReason: (w, reason) => `The reported reason: ${reason}.`,
    noWardReason: (w) => `No reason has been recorded for ${w}.`,
    unknownWard: (w) => `ElectionCanon has no record of ${w}.`,
    needWard: () => "Which ward do you mean? Name it and I will check ElectionCanon.",
    nextAction: (text) => text,
    coverageWards: (text) => text,
    coveragePollingUnits: (text) => text,
    noCoverageData: () => "ElectionCanon has no wards or polling units recorded yet.",
    incidentSummary: (text) => text,
    noIncidents: () => "ElectionCanon has no incidents recorded.",
    evidenceSummary: (text) => text,
    noEvidence: () => "ElectionCanon has no results captured yet.",
    ocrSummary: (text) => text,
    noOcr: () => "ElectionCanon has no OCR-processed results yet.",
    resultsSubmittedSummary: (text) => text,
    noResultsSubmitted: () => "ElectionCanon has no polling units or results recorded yet.",
    disputedResultsSummary: (text) => text,
    noDisputedResults: () => "ElectionCanon has no results captured yet.",
    highPriorityIncidentsSummary: (text) => text,
    noHighPriorityIncidents: () => "ElectionCanon has no incidents recorded.",
    notReportingSummary: (text) => text,
    noNotReportingData: () => "ElectionCanon has no polling units recorded yet.",
    coveragePercentSummary: (text) => text,
    noCoveragePercentData: () => "ElectionCanon has no polling units recorded yet.",
    cannotAct: (matched) => matched
      ? `I can prepare "${matched}", but ElectionCanon requires an authenticated, authorised campaign identity before it can be recorded. I cannot grant myself that authority.`
      : `I can prepare the record, but ElectionCanon requires an authenticated, authorised campaign identity before it can be recorded. I cannot grant myself that authority.`,
    notUnderstood: (w) => w
      ? `I did not read that as a question about ${w} that ElectionCanon can answer.`
      : "I did not read that as a question ElectionCanon can answer. Try asking about the office, the constituency, a ward's status, or who is responsible.",
    clarify: (list) => `Which one do you mean — ${list}?`,
    or: " or ",
  },
});

export function realiserFor(language) {
  const r = REALISERS[language];
  return r ? { r, language, fellBack: false } : { r: REALISERS.en, language: "en", fellBack: true, requested: language };
}

export const REALISED_LANGUAGES = Object.freeze(Object.keys(REALISERS));

export function planElectionResponse({ grounded, intent, view = {} } = {}) {
  const { r, language, fellBack } = realiserFor(intent?.language ?? "en");
  const wardId = intent?.component ?? null;
  const ward = wardId ? view?.wards?.[wardId] : null;

  const segments = [];
  const add = (text, kind) => { segments.push(Object.freeze({ text, kind })); };
  const sources = [];
  const spoken = [];
  const mention = (...vals) => { for (const v of vals) if (v) spoken.push(String(v)); };

  const proved = new Map();
  for (const c of grounded?.claims ?? []) {
    if (isBinding(c) && c.source?.path) proved.set(c.source.path, c);
  }
  const provedPath = (p) => proved.get(p) ?? null;
  const say = (p, fn, ...values) => {
    const claim = provedPath(p);
    if (!claim) return false;
    sources.push(p); mention(...values); add(fn(), SEGMENT.CANON); return true;
  };

  // §7 PARITY — AMBIGUITY IS A QUESTION, NOT A GUESS. Same short-circuit as
  // os/studio/respond.js: zero Canon reading is spoken because none was proved.
  const candidates = intent?.clarify?.candidates ?? [];
  if (candidates.length) {
    const list = candidates.length === 2 ? candidates.join(r.or) : candidates.join(", ");
    const text = r.clarify(list);
    mention(...candidates);
    return Object.freeze({
      answer: text, language, fellBack, sources: Object.freeze([]),
      segments: Object.freeze([Object.freeze({ text, kind: SEGMENT.CLARIFY })]),
      presented: 1, refused: 0, canonLimitation: false,
      clarifying: Object.freeze([...candidates]),
      preserved: verifyPreserved(candidates.join(" "), text).preserved,
    });
  }

  // NEEDS_SUBJECT PARITY — understand.js sets this the same way for every
  // domain (request.js's REQUEST enum is domain-neutral); Election asks which
  // ward instead of assuming one.
  if (intent?.proposalRejected === REQUEST.NEEDS_SUBJECT) {
    const text = r.needWard();
    return Object.freeze({
      answer: text, language, fellBack, sources: Object.freeze([]),
      segments: Object.freeze([Object.freeze({ text, kind: SEGMENT.NOT_UNDERSTOOD })]),
      presented: 0, refused: 1, canonLimitation: false,
      clarifying: Object.freeze([]), preserved: true,
    });
  }

  const limitation = (grounded?.claims ?? []).find(isCanonLimitation);
  if (limitation) {
    return Object.freeze({
      answer: limitation.text, language, fellBack, sources: Object.freeze([]),
      segments: Object.freeze([Object.freeze({ text: limitation.text, kind: SEGMENT.CANON_ABSENCE })]),
      presented: 0, refused: 1, canonLimitation: true,
      clarifying: Object.freeze([]), preserved: true,
    });
  }

  switch (intent?.type) {
    case INTENT.CANDIDATE_OFFICE: {
      const candidate = Object.values(view?.candidates ?? {})[0] ?? null;
      if (!candidate) { add(r.noOffice(), SEGMENT.CANON_ABSENCE); break; }
      mention(candidate.office);
      if (!say(`candidates.${candidate.id}.office`, () => r.office(candidate.office), candidate.office)) {
        add(r.noOffice(), SEGMENT.CANON_ABSENCE);
      }
      break;
    }

    case INTENT.CANDIDATE_CONSTITUENCY: {
      const candidate = Object.values(view?.candidates ?? {})[0] ?? null;
      if (!candidate) { add(r.noConstituency(), SEGMENT.CANON_ABSENCE); break; }
      mention(candidate.constituency);
      if (!say(`candidates.${candidate.id}.constituency`, () => r.constituency(candidate.constituency),
                candidate.constituency)) {
        add(r.noConstituency(), SEGMENT.CANON_ABSENCE);
      }
      break;
    }

    case INTENT.WARD_STATUS:
      if (!wardId) { add(r.needWard(), SEGMENT.NOT_UNDERSTOOD); break; }
      if (!ward) { add(r.unknownWard(wardId), SEGMENT.CANON_ABSENCE); break; }
      mention(wardId);
      if (!say(`wards.${wardId}.status`, () => r.wardStatus(wardId, ward.status), ward.status)) {
        add(r.noWardStatus(wardId), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.WARD_WHO:
      if (!wardId) { add(r.needWard(), SEGMENT.NOT_UNDERSTOOD); break; }
      if (!ward) { add(r.unknownWard(wardId), SEGMENT.CANON_ABSENCE); break; }
      mention(wardId);
      if (!say(`wards.${wardId}.organisation`, () => r.wardOrg(wardId, ward.organisation), ward.organisation)) {
        add(r.noWardOrg(wardId), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.WARD_WHY: {
      if (!wardId) { add(r.needWard(), SEGMENT.NOT_UNDERSTOOD); break; }
      if (!ward) { add(r.unknownWard(wardId), SEGMENT.CANON_ABSENCE); break; }
      mention(wardId);
      if (!say(`wards.${wardId}.status`, () => r.wardStatus(wardId, ward.status), ward.status)) {
        add(r.noWardStatus(wardId), SEGMENT.CANON_ABSENCE);
      }
      if (!say(`wards.${wardId}.reason`, () => r.wardReason(wardId, ward.reason), ward.reason)) {
        add(r.noWardReason(wardId), SEGMENT.CANON_ABSENCE);
      }
      const rec = (grounded?.recommendations ?? [])[0];
      if (rec?.text) add(r.nextAction(rec.text), SEGMENT.RECOMMENDATION);
      break;
    }

    case INTENT.NEXT_ACTION: {
      if (wardId && ward) {
        say(`wards.${wardId}.status`, () => r.wardStatus(wardId, ward.status), wardId, ward.status);
      }
      const rec = (grounded?.recommendations ?? [])[0];
      if (rec?.text) add(r.nextAction(rec.text), SEGMENT.RECOMMENDATION);
      else add(r.needWard(), SEGMENT.NOT_UNDERSTOOD);
      break;
    }

    // ALPHA 1.2 — campaign-wide operational facts. No subject/ward
    // resolution needed; each reads straight from grounded claims sourced
    // off the named collection (see infer.js's matching foldSource calls).
    case INTENT.COVERAGE_GAPS: {
      // infer.js emits these two claims TOGETHER, in this order, only for
      // this intent — facts[0] is always the wards count, facts[1] the
      // polling-units count, when both are present at all.
      const wardsText = grounded?.facts?.find((f) => f.source?.path === "wards")?.text ?? "";
      const puText = grounded?.facts?.find((f) => f.source?.path === "pollingUnits")?.text ?? "";
      const wardsOk = say("wards", () => r.coverageWards(wardsText), "coverage");
      const puOk = say("pollingUnits", () => r.coveragePollingUnits(puText), "coverage");
      if (!wardsOk && !puOk) add(r.noCoverageData(), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.UNRESOLVED_INCIDENTS:
      if (!say("incidents", () => r.incidentSummary(grounded?.facts?.[0]?.text ?? ""), "incidents")) {
        add(r.noIncidents(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.EVIDENCE_REVIEW:
      if (!say("results", () => r.evidenceSummary(grounded?.facts?.[0]?.text ?? ""), "evidence")) {
        add(r.noEvidence(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.OCR_CONFIDENCE:
      if (!say("results", () => r.ocrSummary(grounded?.facts?.[0]?.text ?? ""), "ocr")) {
        add(r.noOcr(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.RESULTS_SUBMITTED:
      if (!say("results", () => r.resultsSubmittedSummary(grounded?.facts?.[0]?.text ?? ""), "results submitted")) {
        add(r.noResultsSubmitted(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.DISPUTED_RESULTS:
      if (!say("results", () => r.disputedResultsSummary(grounded?.facts?.[0]?.text ?? ""), "disputed")) {
        add(r.noDisputedResults(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.HIGH_PRIORITY_INCIDENTS:
      if (!say("incidents", () => r.highPriorityIncidentsSummary(grounded?.facts?.[0]?.text ?? ""), "high priority")) {
        add(r.noHighPriorityIncidents(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.POLLING_UNITS_NOT_REPORTING:
      if (!say("pollingUnits", () => r.notReportingSummary(grounded?.facts?.[0]?.text ?? ""), "not reporting")) {
        add(r.noNotReportingData(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.COVERAGE_PERCENTAGE:
      if (!say("pollingUnits", () => r.coveragePercentSummary(grounded?.facts?.[0]?.text ?? ""), "coverage percentage")) {
        add(r.noCoveragePercentData(), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.ACTION_REQUEST:
      add(r.cannotAct(intent?.matched?.[0] ?? null), SEGMENT.AUTHORITY);
      break;

    default:
      add(r.notUnderstood(wardId), SEGMENT.NOT_UNDERSTOOD);
      break;
  }

  const answer = segments.map((x) => x.text).join(" ");
  const preserved = verifyPreserved([...new Set(spoken)].join(" "), answer).preserved;

  return Object.freeze({
    answer, language, fellBack, sources: Object.freeze([...new Set(sources)]),
    presented: segments.length, segments: Object.freeze(segments), refused: 0,
    canonLimitation: false, clarifying: Object.freeze([]), preserved,
  });
}

export default { planElectionResponse, realiserFor, REALISED_LANGUAGES };
