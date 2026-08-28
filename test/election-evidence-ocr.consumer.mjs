// ============================================================
// ELECTIONCANON ALPHA 1.2 — OCR-ASSISTED EVIDENCE  (MOCK evidence)
//
// Same fake-client pattern as election-day-simulation.consumer.mjs. Proves:
// RESULT_OCR_PROCESSED is a separate, immutable axis from VERIFICATION_STATUS
// (OCR completing never implies human review happened); confidence is
// always coerced to a real bucket, never invented; a human CONFIRM/CORRECT
// via proposeVerifyResult's reviewedFields preserves the original OCR
// value; geography fields and incident severity/escalation are optional
// and validated, never invented; and electionDay/ocr.js's runOcrExtraction
// never throws, for any provider failure mode.
// ============================================================

import {
  proposeAddPollingUnit, executeAddPollingUnit,
  proposeCaptureResult, executeCaptureResult,
  proposeRecordOcrExtraction, executeRecordOcrExtraction,
  proposeVerifyResult, executeVerifyResult,
  proposeReportIncident, executeReportIncident,
  proposeChangeIncidentStatus, executeChangeIncidentStatus,
  OCR_STATUS, OCR_CONFIDENCE, VERIFICATION_STATUS, INCIDENT_STATUS, INCIDENT_SEVERITY,
} from "../src/domains/election/electionDay/write.js";
import { runOcrExtraction } from "../src/domains/election/electionDay/ocr.js";
import { projectElection } from "../src/domains/election/projections.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTIONCANON ALPHA 1.2 — OCR-assisted evidence\n");

function fakeClient() {
  const rows = [];
  return {
    rows,
    from(table) {
      return {
        insert: async (row) => {
          if (rows.some((r) => r.table === table && r.event_id === row.event_id)) {
            const err = new Error("duplicate key value violates unique constraint");
            err.code = "23505";
            return { error: err };
          }
          rows.push({ table, ...row });
          return { error: null };
        },
      };
    },
  };
}
const logFor = (client, campaignId) =>
  client.rows.filter((r) => r.table === "election_events" && r.campaign_id === campaignId).map((r) => r.payload).reverse();

const CAMPAIGN = "camp-ocr";
const USER = "agent-user";
const client = fakeClient();

// ============================================================
console.log("A — GEOGRAPHY FIELDS ARE OPTIONAL, NEVER INVENTED");
// ============================================================
let puWithGeo, puWithoutGeo;
{
  const prepared = await proposeAddPollingUnit({ fields: {
    state: "Delta", lga: "Uvwie", ward: "Ward 3", code: "PU-101",
    senatorialDistrict: "Delta Central", federalConstituency: "Uvwie", stateConstituency: "Uvwie I",
  } });
  ok("A1. a polling unit WITH geography fields is PREPARED", prepared.status === "PREPARED");
  const executed = await executeAddPollingUnit({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "pu-geo" });
  ok("A2. it is recorded", executed.success);
  puWithGeo = "pu-geo";

  const prepared2 = await proposeAddPollingUnit({ fields: { state: "Delta", lga: "Uvwie", ward: "Ward 4", code: "PU-102" } });
  ok("A3. a polling unit WITHOUT geography fields is still PREPARED (nothing required)", prepared2.status === "PREPARED");
  const executed2 = await executeAddPollingUnit({ draft: prepared2.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "pu-nogeo" });
  ok("A4. it is recorded too", executed2.success);
  puWithoutGeo = "pu-nogeo";

  const view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("A5. the geography-bearing unit folds all three optional fields", view.pollingUnits[puWithGeo].senatorialDistrict === "Delta Central" &&
    view.pollingUnits[puWithGeo].federalConstituency === "Uvwie" && view.pollingUnits[puWithGeo].stateConstituency === "Uvwie I");
  ok("A6. the geography-free unit folds all three as null — never a fabricated value", view.pollingUnits[puWithoutGeo].senatorialDistrict === null &&
    view.pollingUnits[puWithoutGeo].federalConstituency === null && view.pollingUnits[puWithoutGeo].stateConstituency === null);
}

// ============================================================
console.log("\nB — RESULT_OCR_PROCESSED IS A SEPARATE AXIS FROM VERIFICATION");
// ============================================================
let resultId;
{
  const prepared = await proposeCaptureResult({ fields: { pollingUnitId: puWithGeo, evidenceImagePath: `${CAMPAIGN}/res-1/result.png` } });
  const executed = await executeCaptureResult({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "res-1" });
  ok("B1. the result is captured", executed.success);
  resultId = "res-1";

  let view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("B2. before any OCR event, ocr.status reads NOT_RUN", view.results[resultId].ocr.status === OCR_STATUS.NOT_RUN);
  ok("B3. verificationStatus independently reads PENDING", view.results[resultId].verificationStatus === VERIFICATION_STATUS.PENDING);

  const ocrPrepared = await proposeRecordOcrExtraction({ fields: {
    resultId, ocrProvider: "tesseract.js", ocrStatus: OCR_STATUS.COMPLETE,
    ocrExtractedFields: [
      { field: "Candidate A", value: "123", confidence: OCR_CONFIDENCE.HIGH },
      { field: "Candidate B", value: "45", confidence: "not-a-real-bucket" }, // hostile/malformed confidence
    ],
  } });
  ok("B4. proposeRecordOcrExtraction is PREPARED", ocrPrepared.status === "PREPARED");
  const ocrExecuted = await executeRecordOcrExtraction({ draft: ocrPrepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "ocr-1" });
  ok("B5. it is recorded", ocrExecuted.success);

  view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("B6. ocr.status now reads COMPLETE", view.results[resultId].ocr.status === OCR_STATUS.COMPLETE);
  ok("B7. verificationStatus is STILL PENDING — OCR completing never implies a human reviewed it",
    view.results[resultId].verificationStatus === VERIFICATION_STATUS.PENDING);
  ok("B8. a malformed confidence value was coerced to UNKNOWN, never silently accepted",
    view.results[resultId].ocr.extractedFields.find((f) => f.field === "Candidate B").confidence === OCR_CONFIDENCE.UNKNOWN);
  ok("B9. a real confidence value survives unchanged",
    view.results[resultId].ocr.extractedFields.find((f) => f.field === "Candidate A").confidence === OCR_CONFIDENCE.HIGH);
  ok("B10. the human-facing extractedFields (from capture) is untouched by the OCR event",
    view.results[resultId].extractedFields === null);
}

// ============================================================
console.log("\nC — HUMAN REVIEW PRESERVES THE ORIGINAL OCR VALUE");
// ============================================================
{
  const reviewed = await proposeVerifyResult({ fields: {
    resultId, verificationStatus: VERIFICATION_STATUS.VERIFIED,
    reviewedFields: [
      { field: "Candidate A", value: "123", ocrValue: "123", confidence: OCR_CONFIDENCE.HIGH, source: "ocr_confirmed" },
      { field: "Candidate B", value: "54", ocrValue: "45", confidence: OCR_CONFIDENCE.UNKNOWN, source: "ocr_corrected" },
    ],
  } });
  ok("C1. proposeVerifyResult with reviewedFields is PREPARED", reviewed.status === "PREPARED");
  const executed = await executeVerifyResult({ draft: reviewed.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "verify-1" });
  ok("C2. it is recorded", executed.success);

  const view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  const fields = view.results[resultId].extractedFields;
  const corrected = fields.find((f) => f.field === "Candidate B");
  ok("C3. verificationStatus reads VERIFIED", view.results[resultId].verificationStatus === VERIFICATION_STATUS.VERIFIED);
  ok("C4. a CORRECTED field keeps the human value in `value`", corrected.value === "54");
  ok("C5. ...and NEVER erases what OCR actually read, in `ocrValue`", corrected.ocrValue === "45");
  ok("C6. its source is honestly recorded as ocr_corrected, not manual", corrected.source === "ocr_corrected");
  ok("C7. a CONFIRMED field also keeps both values, even though they match",
    fields.find((f) => f.field === "Candidate A").value === "123" && fields.find((f) => f.field === "Candidate A").ocrValue === "123");

  const hostile = await proposeVerifyResult({ fields: {
    resultId, verificationStatus: VERIFICATION_STATUS.VERIFIED,
    reviewedFields: [{ field: "X", value: "1", source: "fabricated_source" }],
  } });
  ok("C8. an unrecognised field `source` is refused, not silently accepted", hostile.status === "NEEDS_VALID_FIELD_SOURCE");
}

// ============================================================
console.log("\nD — INCIDENT SEVERITY AND ESCALATION-TARGET VALIDATION");
// ============================================================
{
  const badSeverity = await proposeReportIncident({ fields: { category: "violence", description: "test", severity: "CATASTROPHIC" } });
  ok("D1. an unrecognised severity is refused", badSeverity.status === "NEEDS_VALID_SEVERITY");

  const prepared = await proposeReportIncident({ fields: { category: "violence", description: "reported by agent", severity: INCIDENT_SEVERITY.CRITICAL } });
  ok("D2. a recognised severity is PREPARED", prepared.status === "PREPARED");
  const executed = await executeReportIncident({ draft: prepared.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "inc-1" });
  ok("D3. it is recorded", executed.success);

  let view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("D4. severity folds onto the incident", view.incidents["inc-1"].severity === INCIDENT_SEVERITY.CRITICAL);

  const roster = [{ id: "person-1", name: "Ada Coordinator", roleType: "lga_coordinator" }];
  const noSuchTarget = await proposeChangeIncidentStatus({
    fields: { incidentId: "inc-1", status: INCIDENT_STATUS.ESCALATED, escalatedTo: "person-does-not-exist" }, roster,
  });
  ok("D5. escalating to someone NOT in the roster is refused — never an invented org relationship",
    noSuchTarget.status === "NEEDS_VALID_ESCALATION_TARGET");

  const valid = await proposeChangeIncidentStatus({
    fields: { incidentId: "inc-1", status: INCIDENT_STATUS.ESCALATED, escalatedTo: "person-1" }, roster,
  });
  ok("D6. escalating to a REAL roster member is PREPARED", valid.status === "PREPARED");
  const executedEsc = await executeChangeIncidentStatus({ draft: valid.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "inc-1-esc" });
  ok("D7. it is recorded", executedEsc.success);

  view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("D8. the incident folds status ESCALATED with the real target", view.incidents["inc-1"].status === INCIDENT_STATUS.ESCALATED &&
    view.incidents["inc-1"].escalatedTo === "person-1");

  const resolve = await proposeChangeIncidentStatus({ fields: { incidentId: "inc-1", status: INCIDENT_STATUS.RESOLVED }, roster });
  const executedResolve = await executeChangeIncidentStatus({ draft: resolve.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "inc-1-resolve" });
  ok("D9. resolving it succeeds", executedResolve.success);
  view = projectElection(logFor(client, CAMPAIGN), CAMPAIGN);
  ok("D10. moving away from ESCALATED clears escalatedTo — it's not a fact once the escalation itself has moved on",
    view.incidents["inc-1"].escalatedTo === null);
}

// ============================================================
console.log("\nE — ocr.js's runOcrExtraction NEVER THROWS");
// ============================================================
{
  const okProvider = { name: "mock-ok", isAvailable: async () => true, extract: async () => ({ status: OCR_STATUS.COMPLETE, extractedFields: [{ field: "A", value: "1", confidence: OCR_CONFIDENCE.HIGH }] }) };
  const r1 = await runOcrExtraction({ imageUrl: "https://example.com/x.png", provider: okProvider });
  ok("E1. a healthy provider returns COMPLETE with its fields intact", r1.status === OCR_STATUS.COMPLETE && r1.extractedFields.length === 1);

  const throwingProvider = { name: "mock-throw", isAvailable: async () => true, extract: async () => { throw new Error("engine crashed"); } };
  const r2 = await runOcrExtraction({ imageUrl: "https://example.com/x.png", provider: throwingProvider });
  ok("E2. a provider that THROWS is caught and reported as FAILED, never propagated", r2.status === OCR_STATUS.FAILED && /engine crashed/.test(r2.reason));

  const unavailableProvider = { name: "mock-unavailable", isAvailable: async () => false, extract: async () => ({ status: OCR_STATUS.COMPLETE, extractedFields: [] }) };
  const r3 = await runOcrExtraction({ imageUrl: "https://example.com/x.png", provider: unavailableProvider });
  ok("E3. an unavailable provider is reported UNAVAILABLE and never actually calls extract()",
    r3.status === OCR_STATUS.UNAVAILABLE);

  const malformedProvider = { name: "mock-malformed", isAvailable: async () => true, extract: async () => ({ status: "NOT_A_REAL_STATUS", extractedFields: "not-an-array" }) };
  const r4 = await runOcrExtraction({ imageUrl: "https://example.com/x.png", provider: malformedProvider });
  ok("E4. a malformed status is coerced to FAILED, never trusted verbatim", r4.status === OCR_STATUS.FAILED);
  ok("E5. a malformed extractedFields shape becomes an empty array, never crashes", Array.isArray(r4.extractedFields) && r4.extractedFields.length === 0);

  const r5 = await runOcrExtraction({ imageUrl: null, provider: okProvider });
  ok("E6. no image at all is UNAVAILABLE, not attempted", r5.status === OCR_STATUS.UNAVAILABLE);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail) process.exit(1);
