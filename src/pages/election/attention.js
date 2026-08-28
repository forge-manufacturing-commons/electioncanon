// ============================================================
// ELECTIONCANON ALPHA 1.1 — SHARED "WHAT NEEDS ATTENTION" COMPUTATION
//
// Pure data, no JSX, no color tokens — Home and Intelligence each render
// this the same underlying list their own way. Extracted from Intelligence's
// own Alpha 1.0 computeAlerts() so the two screens can never drift into
// disagreeing about what counts as an open issue. Every item here is
// derived from the SAME folded Canon view every other section reads — no
// new tables, no fabricated scores. `tone` is an abstract "danger" |
// "warning" key, not a color — callers map it to their own token.
// ============================================================

import { TASK_STATUS, ASSIGNMENT_STATUS } from "../../domains/election/mobilization/write.js";
import { INCIDENT_STATUS, INCIDENT_SEVERITY, VERIFICATION_STATUS, OCR_STATUS } from "../../domains/election/electionDay/write.js";

export function computeAttention(view = {}, gaps = []) {
  const wards = Object.values(view.wards ?? {});
  const assignments = Object.values(view.assignments ?? {});
  const tasks = Object.values(view.tasks ?? {});
  const incidents = Object.values(view.incidents ?? {});
  const pollingUnits = Object.values(view.pollingUnits ?? {});
  const agents = Object.values(view.agents ?? {});
  const results = Object.values(view.results ?? {});

  const alerts = [];
  const now = Date.now();

  for (const w of wards) {
    if (!w.organisation) alerts.push({ text: `${w.id} has no coordinator or team assigned.`, tone: "danger" });
  }
  for (const a of assignments) {
    if (a.status === ASSIGNMENT_STATUS.BLOCKED) alerts.push({ text: `Assignment for ${a.assignee} in ${a.ward} is blocked.`, tone: "danger" });
    if (a.status === ASSIGNMENT_STATUS.UNASSIGNED) alerts.push({ text: `Assignment to ${a.ward} is unconfirmed.`, tone: "warning" });
  }
  const overdueTasks = [];
  for (const t of tasks) {
    if (t.status === TASK_STATUS.BLOCKED) alerts.push({ text: `Task "${t.title}" is blocked.`, tone: "danger" });
    if (t.dueDate && t.status !== TASK_STATUS.COMPLETE && new Date(t.dueDate).getTime() < now) {
      alerts.push({ text: `Task "${t.title}" is overdue (due ${t.dueDate}).`, tone: "danger" });
      overdueTasks.push(t);
    }
  }
  const pollingUnitsWithAgent = new Set(agents.map((a) => a.pollingUnit));
  const pollingUnitsWithoutAgent = pollingUnits.filter((pu) => !pollingUnitsWithAgent.has(pu.id));
  for (const pu of pollingUnitsWithoutAgent) {
    alerts.push({ text: `Polling unit ${pu.code} has no agent assigned.`, tone: "warning" });
  }
  for (const i of incidents) {
    const unresolved = i.status !== INCIDENT_STATUS.RESOLVED && i.status !== INCIDENT_STATUS.CLOSED;
    if (!unresolved) continue;
    alerts.push({ text: `Unresolved incident: ${i.category?.replace(/_/g, " ")}${i.severity ? ` (${i.severity})` : ""}.`, tone: "danger" });
  }
  // ALPHA 1.2 — evidence/OCR review signals, read straight off the same
  // per-result `verificationStatus`/`ocr` fields the Election Day screen
  // renders — no new computation, just surfaced as an attention item.
  const evidenceAwaitingReview = results.filter((r) => r.verificationStatus === VERIFICATION_STATUS.PENDING && r.evidenceImagePath);
  for (const r of evidenceAwaitingReview) {
    alerts.push({ text: `Result for polling unit ${r.pollingUnit} has evidence awaiting human review.`, tone: "warning" });
  }
  const lowConfidenceOcr = results.filter((r) => r.ocr?.status === OCR_STATUS.COMPLETE &&
    (r.ocr.extractedFields ?? []).some((f) => f.confidence === "LOW" || f.confidence === "UNKNOWN"));
  for (const r of lowConfidenceOcr) {
    alerts.push({ text: `OCR reading for polling unit ${r.pollingUnit} has low-confidence fields — review before verifying.`, tone: "warning" });
  }
  for (const g of gaps ?? []) {
    alerts.push({ text: g.what, tone: "warning" });
  }

  const wardsWithoutCoordinator = wards.filter((w) => !w.organisation);
  const criticalIncidents = incidents.filter((i) =>
    (i.status !== INCIDENT_STATUS.RESOLVED && i.status !== INCIDENT_STATUS.CLOSED) &&
    (i.severity === INCIDENT_SEVERITY.CRITICAL || i.severity === INCIDENT_SEVERITY.HIGH));

  return {
    alerts,
    counts: {
      wardsKnown: wards.length,
      wardsWithoutCoordinator: wardsWithoutCoordinator.length,
      pollingUnitsKnown: pollingUnits.length,
      pollingUnitsWithoutAgent: pollingUnitsWithoutAgent.length,
      tasksOverdue: overdueTasks.length,
      tasksOpen: tasks.filter((t) => t.status !== TASK_STATUS.COMPLETE).length,
      unresolvedIncidents: incidents.filter((i) => i.status !== INCIDENT_STATUS.RESOLVED && i.status !== INCIDENT_STATUS.CLOSED).length,
      unresolvedHighSeverityIncidents: criticalIncidents.length,
      evidenceAwaitingReview: evidenceAwaitingReview.length,
      lowConfidenceOcr: lowConfidenceOcr.length,
    },
    wardsWithoutCoordinator,
    pollingUnitsWithoutAgent,
    overdueTasks,
  };
}

export default { computeAttention };
