// ============================================================
// FORGE ELECTION — DETERMINISTIC ADAPTER  (MVP domain pack)
//
// The SAME CONTRACT os/studio/infer.js's ADAPTER_CONTRACT publishes:
//
//   adapter({ intent, canon, tools, language }) -> claim[]
//
// This is Election's own instance of that contract, not a second inference
// engine. `runInference` (os/studio/infer.js) is imported and used AS-IS by
// ask.js for every domain — grounding, re-verification and the untrusted-input
// treatment of whatever this function returns are identical for Election and
// for manufacturing, because it is the SAME function, called with a different
// `adapter`.
//
// Every claim constructor (canonFact, interpretation, recommendation, unknown,
// foldSource) is imported from the CORE grounding.js — Election declares no
// claim class of its own, and cites the SAME dotted fold-path convention
// (`wards.Ward 7.status`) that grounding.js's `resolveFoldPath` already knows
// how to walk against WHATEVER view shape it is given.
// ============================================================

import { canonFact, interpretation, recommendation, unknown, foldSource } from "../../../os/studio/grounding.js";
import { INTENT } from "./intent.js";
import { computeMobilizationCoverage } from "../mobilization/coverage.js";

export const deterministicAdapter = ({ intent, canon }) => {
  const wardId = intent?.component ?? null;
  const ward = wardId ? canon?.wards?.[wardId] : null;
  const candidate = Object.values(canon?.candidates ?? {})[0] ?? null;

  // (PHASE 2 PARITY) THE AUTHORITY BOUNDARY OUTRANKS EVERYTHING. A conversational
  // "prepare/draft/approve" is recognised so it can be REFUSED with a reason —
  // never obeyed. This adapter has no publish, no emitter and no policy access,
  // so there is nothing here that COULD grant authority even if this check were
  // removed; the check exists so the refusal is legible rather than a shrug.
  if (intent?.type === INTENT.ACTION_REQUEST) {
    return [
      unknown("authority", "ElectionCanon requires an authenticated, authorised campaign identity to " +
                           "record an event; a statement in conversation confers none"),
    ];
  }

  if (intent?.type === INTENT.UNKNOWN) {
    return [unknown("", "the request was not recognised as an Election Canon question")];
  }

  switch (intent?.type) {
    // CANDIDATE-LEVEL FACTS. Read directly off the single candidate record in
    // THIS view — never by id lookup, because tenant isolation means a candidate
    // view holds exactly the one candidate it belongs to (see
    // test/election.consumer.mjs's isolation tests). No id, no ambiguity: there
    // is nothing else in `canon.candidates` for this to confuse itself with.
    case INTENT.CANDIDATE_OFFICE:
      if (!candidate) return [unknown("office", "no candidate is recorded in this Election Canon")];
      return candidate.office
        ? [canonFact(candidate.office, foldSource(`candidates.${candidate.id}.office`))]
        : [unknown("office", "no office is recorded for this candidate")];

    case INTENT.CANDIDATE_CONSTITUENCY:
      if (!candidate) return [unknown("constituency", "no candidate is recorded in this Election Canon")];
      return candidate.constituency
        ? [canonFact(candidate.constituency, foldSource(`candidates.${candidate.id}.constituency`))]
        : [unknown("constituency", "no constituency is recorded for this candidate")];

    // WARD-LEVEL FACTS. Every case below needs a resolved ward id — supplied
    // either by the message naming it once, or by conversation carry-forward
    // (understand.js / conversation.js), never guessed here.
    case INTENT.WARD_STATUS:
      if (!wardId) return [unknown("ward", "a ward needs to be named")];
      if (!ward) return [unknown(wardId, `no ward "${wardId}" is recorded in the Election Canon`)];
      return [
        ward.status
          ? canonFact(`${wardId} ${ward.status}`, foldSource(`wards.${wardId}.status`))
          : unknown(`${wardId} status`, "no status has been reported for this ward"),
      ];

    case INTENT.WARD_WHO:
      if (!wardId) return [unknown("ward", "a ward needs to be named")];
      if (!ward) return [unknown(wardId, `no ward "${wardId}" is recorded in the Election Canon`)];
      return [
        ward.organisation
          ? canonFact(`${wardId} ${ward.organisation}`, foldSource(`wards.${wardId}.organisation`))
          : unknown(`${wardId} organisation`, "no team has been assigned responsibility for this ward"),
      ];

    // WHY — three claim classes in one answer, exactly like manufacturing's
    // COMPONENT_WHY: the recorded status (CANON), the reason if one was ever
    // reported or its honest absence (CANON_ABSENCE), and what to do about it
    // (RECOMMENDATION). None of the three is guessed from the others.
    case INTENT.WARD_WHY: {
      if (!wardId) return [unknown("ward", "a ward needs to be named")];
      if (!ward) return [unknown(wardId, `no ward "${wardId}" is recorded in the Election Canon`)];
      const claims = [
        ward.status
          ? canonFact(`${wardId} ${ward.status}`, foldSource(`wards.${wardId}.status`))
          : unknown(`${wardId} status`, "no status has been reported for this ward"),
        ward.reason
          ? canonFact(`${wardId} ${ward.reason}`, foldSource(`wards.${wardId}.reason`))
          : unknown(`${wardId} reason`, "no blocking reason has been reported for this ward"),
      ];
      if (ward.status && ward.status !== "on-track") {
        claims.push(recommendation(
          `Follow up with the team responsible for ${wardId} and confirm what is needed to move it forward.`));
      }
      return claims;
    }

    case INTENT.NEXT_ACTION: {
      const claims = [];
      if (wardId && ward?.status) {
        claims.push(canonFact(`${wardId} ${ward.status}`, foldSource(`wards.${wardId}.status`)));
        claims.push(interpretation(`${ward.status}`));
        claims.push(recommendation(ward.status === "on-track"
          ? `Continue monitoring ${wardId} and record the next status update when available.`
          : `Follow up with the team responsible for ${wardId} and record what is needed to move it forward.`));
      } else {
        claims.push(recommendation(
          "Name a ward and ElectionCanon can recommend a specific next step for it."));
      }
      return claims;
    }

    // ALPHA 1.2 — CAMPAIGN-WIDE OPERATIONAL FACTS. Each reads directly off
    // the SAME folded collections attention.js already computes counts
    // from (wards/pollingUnits/agents/incidents/results) — no new data
    // source, and an empty collection is answered honestly ("none
    // recorded"), never confused with "none outstanding".
    case INTENT.COVERAGE_GAPS: {
      const wards = Object.values(canon?.wards ?? {});
      const pollingUnits = Object.values(canon?.pollingUnits ?? {});
      const agents = Object.values(canon?.agents ?? {});
      if (!wards.length && !pollingUnits.length) {
        return [unknown("coverage", "no wards or polling units are recorded in this Election Canon yet")];
      }
      const wardsWithoutCoordinator = wards.filter((w) => !w.organisation);
      const pollingUnitsWithoutAgent = pollingUnits.filter((pu) => !agents.some((a) => a.pollingUnit === pu.id));
      return [
        canonFact(`${wardsWithoutCoordinator.length} of ${wards.length} recorded ward(s) have no coordinator`,
          foldSource("wards")),
        canonFact(`${pollingUnitsWithoutAgent.length} of ${pollingUnits.length} recorded polling unit(s) have no agent`,
          foldSource("pollingUnits")),
      ];
    }

    case INTENT.UNRESOLVED_INCIDENTS: {
      const incidents = Object.values(canon?.incidents ?? {});
      if (!incidents.length) return [unknown("incidents", "no incidents are recorded in this Election Canon")];
      const unresolved = incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "CLOSED");
      return [
        unresolved.length
          ? canonFact(`${unresolved.length} unresolved incident(s): ` +
              unresolved.map((i) => `${i.category?.replace(/_/g, " ")} (${i.status})`).join("; "),
              foldSource("incidents"))
          : canonFact("no unresolved incidents — every recorded incident is resolved or closed", foldSource("incidents")),
      ];
    }

    case INTENT.EVIDENCE_REVIEW: {
      const results = Object.values(canon?.results ?? {});
      if (!results.length) return [unknown("evidence", "no results have been captured in this Election Canon yet")];
      const pending = results.filter((r) => r.verificationStatus === "PENDING");
      return [
        canonFact(`${results.length} result(s) captured, ${pending.length} awaiting verification`,
          foldSource("results")),
      ];
    }

    case INTENT.OCR_CONFIDENCE: {
      const results = Object.values(canon?.results ?? {});
      const withOcr = results.filter((r) => r.ocr?.status === "COMPLETE");
      if (!withOcr.length) return [unknown("ocr", "no results have completed OCR extraction in this Election Canon yet")];
      const lowConfidence = withOcr.filter((r) =>
        (r.ocr.extractedFields ?? []).some((f) => f.confidence === "LOW" || f.confidence === "UNKNOWN"));
      return [
        canonFact(`${lowConfidence.length} of ${withOcr.length} OCR-processed result(s) have at least one ` +
          `LOW or UNKNOWN confidence field`, foldSource("results")),
      ];
    }

    // ALPHA 1.3 — five more campaign-wide facts, each deliberately reading
    // a DIFFERENT signal than its Alpha 1.2 neighbour (see intent.js's own
    // header comment on why these are not just rewordings).
    case INTENT.RESULTS_SUBMITTED: {
      const results = Object.values(canon?.results ?? {});
      const pollingUnits = Object.values(canon?.pollingUnits ?? {});
      if (!pollingUnits.length && !results.length) {
        return [unknown("results", "no polling units or results are recorded in this Election Canon yet")];
      }
      const reportingPUs = new Set(results.map((r) => r.pollingUnit));
      return [
        canonFact(`${results.length} result(s) submitted, from ${reportingPUs.size} of ${pollingUnits.length} recorded polling unit(s)`,
          foldSource("results")),
      ];
    }

    case INTENT.DISPUTED_RESULTS: {
      const results = Object.values(canon?.results ?? {});
      if (!results.length) return [unknown("results", "no results have been captured in this Election Canon yet")];
      const disputed = results.filter((r) => r.verificationStatus === "DISPUTED");
      return [
        disputed.length
          ? canonFact(`${disputed.length} of ${results.length} result(s) are disputed`, foldSource("results"))
          : canonFact("no results are currently disputed", foldSource("results")),
      ];
    }

    case INTENT.HIGH_PRIORITY_INCIDENTS: {
      const incidents = Object.values(canon?.incidents ?? {});
      if (!incidents.length) return [unknown("incidents", "no incidents are recorded in this Election Canon")];
      const highPriority = incidents.filter((i) =>
        (i.severity === "HIGH" || i.severity === "CRITICAL") && i.status !== "RESOLVED" && i.status !== "CLOSED");
      return [
        highPriority.length
          ? canonFact(`${highPriority.length} unresolved high/critical incident(s): ` +
              highPriority.map((i) => `${i.category?.replace(/_/g, " ")} (${i.severity})`).join("; "),
              foldSource("incidents"))
          : canonFact("no unresolved high or critical incidents", foldSource("incidents")),
      ];
    }

    case INTENT.POLLING_UNITS_NOT_REPORTING: {
      const pollingUnits = Object.values(canon?.pollingUnits ?? {});
      if (!pollingUnits.length) return [unknown("pollingUnits", "no polling units are recorded in this Election Canon yet")];
      const results = Object.values(canon?.results ?? {});
      const reportingPUs = new Set(results.map((r) => r.pollingUnit));
      const notReporting = pollingUnits.filter((pu) => !reportingPUs.has(pu.id));
      return [
        canonFact(`${notReporting.length} of ${pollingUnits.length} recorded polling unit(s) have not reported a result`,
          foldSource("pollingUnits")),
      ];
    }

    // Reuses the SAME computeMobilizationCoverage() the Mobilize screen's
    // Coverage tab renders from — this is a conversational path to that
    // one real number, never a second, re-derived calculation.
    case INTENT.COVERAGE_PERCENTAGE: {
      const pollingUnits = Object.values(canon?.pollingUnits ?? {});
      if (!pollingUnits.length) return [unknown("coverage", "no polling units are recorded in this Election Canon yet")];
      const coverage = computeMobilizationCoverage(canon);
      return [
        canonFact(`${coverage.national.assignedCount} of ${coverage.national.totalPollingUnits} polling unit(s) have an agent assigned` +
          (coverage.national.coveragePercent != null ? ` (${coverage.national.coveragePercent}% coverage)` : ""),
          foldSource("pollingUnits")),
      ];
    }

    default:
      return [unknown("", `no deterministic answer for intent "${intent?.type}"`)];
  }
};

export const ADAPTER_CONTRACT = Object.freeze({
  signature: "({ intent, canon, tools, language }) => claim[] | Promise<claim[]>",
  mustReturn: "claims only — never prose, never actions, never events",
  cannot: Object.freeze([
    "publish an event", "write to the Canon", "grant authority",
    "reach policy", "be trusted without grounding",
  ]),
  groundedBy: "os/studio/infer.js's runInference — the SAME function manufacturing uses",
});

export default { deterministicAdapter, ADAPTER_CONTRACT };
