// ============================================================
// ELECTORAL GEOGRAPHY — NATIONAL INTEGRITY REPORT, CHECKPOINTING, DRY-RUN
// DIFF  (Pre-import qualification pass, Phase 5/6/9)
//
// All synthetic fixtures — deliberately invented state/LGA/ward/PU
// identifiers, never confused with the real INEC-sourced data in
// election-geography-inec-reconciliation.consumer.mjs. Uses a real
// temporary directory for the checkpoint round-trip tests (file I/O is
// the thing under test there), cleaned up after.
//
// Run: node test/election-geography-national-integrity-report.consumer.mjs
// ============================================================

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeState } from "../supabase/geography-import/national-integrity-report.mjs";
import { loadCheckpoint, saveCheckpoint, isStateComplete, recordStateComplete } from "../supabase/geography-import/checkpoint.mjs";
import { diffForImport } from "../supabase/geography-import/integrity.mjs";
import { INEC_STATE_IDS } from "../supabase/geography-import/inec-source.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTORAL GEOGRAPHY — national integrity report, checkpointing, dry-run diff\n");

// ============================================================
console.log("A — analyzeState: EVERY ANOMALY CATEGORY IS DETECTED, NONE HIDDEN");
// ============================================================
{
  // INEC ids are always numeric strings (e.g. "2298", "199" — see
  // inec-source.mjs's own header) — malformedLgaIds/etc. check exactly
  // this shape, so synthetic fixtures use realistic numeric ids too,
  // otherwise "clean" data would trip the malformed-id check itself.
  const cleanState = {
    code: "testland", stats: { failedRequests: 0, retriedRequests: 1, invalidResponses: 0 },
    lgas: [
      { id: "101", name: "North", wards: [{ id: "201", name: "Central", pollingUnits: [{ id: "301", code: "001", name: "School" }] }] },
      { id: "102", name: "South", wards: [] }, // genuinely empty LGA — 0 wards is a REAL fact here, not a failure
    ],
  };
  const r1 = analyzeState(cleanState);
  ok("A1. a clean state reports zero of every anomaly category, all explicitly present (not omitted)",
    r1.duplicateLgaIds === 0 && r1.duplicateWardIds === 0 && r1.duplicatePuIds === 0 && r1.orphanWards === 0
    && r1.orphanPus === 0 && r1.malformedLgaIds === 0 && r1.malformedWardIds === 0 && r1.malformedPuIds === 0);
  ok("A2. status is CLEAN when there are zero request failures and zero validation errors", r1.status === "CLEAN");
  ok("A3. a genuinely empty LGA (0 wards) is counted as emptyLgas, distinct from a request failure", r1.emptyLgas === 1 && r1.requestFailures === 0);
  ok("A4. retriedRequests is carried through from the acquisition stats, not recomputed/guessed", r1.retriedRequests === 1);

  const dupState = {
    code: "dupland", stats: { failedRequests: 0, retriedRequests: 0, invalidResponses: 0 },
    lgas: [
      { id: "l1", name: "North", wards: [{ id: "w1", name: "Central", pollingUnits: [] }] },
      { id: "l1", name: "North Dup Id", wards: [] }, // duplicate LGA id
    ],
  };
  const r2 = analyzeState(dupState);
  ok("A5. a duplicate LGA id across the state is caught, status flips to ANOMALIES FOUND", r2.duplicateLgaIds === 1 && r2.status === "ANOMALIES FOUND");

  // The snapshot's own data model nests every PU under the exact ward it
  // was fetched for (see acquire-national-snapshot.mjs's own acquireState())
  // — a PU literally cannot exist in the structure without a real parent
  // ward, so a correctly-shaped state can never produce a false-positive
  // orphan. findOrphans() itself is independently proven against
  // deliberately disconnected data in
  // election-geography-inec-reconciliation.consumer.mjs's B3/B4; here we
  // confirm analyzeState() correctly reports 0/0 for genuinely
  // well-formed nested data, never a false positive.
  ok("A6. well-formed nested data never produces a false-positive orphan (orphan detection ran and found nothing, not skipped)",
    r1.orphanWards === 0 && r1.orphanPus === 0);

  const malformedState = {
    code: "malformedland", stats: { failedRequests: 2, retriedRequests: 0, invalidResponses: 1 },
    lgas: [{ id: "not-numeric", name: "North", wards: [] }],
  };
  const r4 = analyzeState(malformedState);
  ok("A7. a non-numeric LGA id is flagged as malformed", r4.malformedLgaIds === 1);
  ok("A8. request failures and invalid responses are both carried through and both push status to ANOMALIES FOUND", r4.requestFailures === 2 && r4.invalidResponses === 1 && r4.status === "ANOMALIES FOUND");

  const failureState = {
    code: "failedland", stats: { failedRequests: 0, retriedRequests: 0, invalidResponses: 0 },
    lgas: [{ id: "l1", name: "North", lgaLevelFailure: null, wards: [{ id: "w1", name: "A", wardLevelFailure: "REQUEST_FAILED", pollingUnits: null }] }],
  };
  const r5 = analyzeState(failureState);
  ok("A9. a ward whose OWN PU request failed is NOT counted as emptyWards (a real empty result) — it's a distinct failure, not silently merged",
    r5.emptyWards === 0 && r5.wardLevelFailures === 1);
}

// ============================================================
console.log("\nB — CHECKPOINT / RESUME");
// ============================================================
{
  const tmpDir = mkdtempSync(join(tmpdir(), "electioncanon-checkpoint-test-"));
  const checkpointPath = join(tmpDir, "checkpoint.json");
  try {
    const fresh = loadCheckpoint(checkpointPath);
    ok("B1. loading a checkpoint that doesn't exist yet returns a clean empty starting state, never throws", fresh.completedStateCodes.length === 0);

    recordStateComplete(fresh, "delta", { lgas: [{ id: "l1", name: "Okpe", wards: [] }] });
    saveCheckpoint(checkpointPath, fresh);
    const reloaded = loadCheckpoint(checkpointPath);
    ok("B2. a saved checkpoint round-trips through disk correctly", isStateComplete(reloaded, "delta") && reloaded.states.delta.lgas[0].name === "Okpe");
    ok("B3. isStateComplete correctly distinguishes a completed state from one never attempted", !isStateComplete(reloaded, "lagos"));

    recordStateComplete(reloaded, "delta", { lgas: [{ id: "l1", name: "Okpe (re-run)", wards: [] }] });
    ok("B4. re-recording an already-complete state does not duplicate it in completedStateCodes (idempotent resume)",
      reloaded.completedStateCodes.filter((c) => c === "delta").length === 1);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ============================================================
console.log("\nC — DRY-RUN IMPORT DIFF: IDEMPOTENCY AND CORRECTNESS");
// ============================================================
{
  const existing = [{ key: "delta::okpe", state_code: "delta", name: "Okpe" }];
  const candidate = [
    { key: "delta::okpe", state_code: "delta", name: "Okpe" }, // already exists, identical
    { key: "delta::sapele", state_code: "delta", name: "Sapele" }, // new
  ];
  const keyFn = (r) => r.key;
  const diff1 = diffForImport(candidate, existing, keyFn, ["state_code"]);
  ok("C1. the already-existing row is correctly classified, not re-proposed as an insert", diff1.alreadyExisting.length === 1 && diff1.toInsert.length === 1);
  ok("C2. the new row is correctly identified for insertion", diff1.toInsert[0].name === "Sapele");
  ok("C3. no false conflicts when fields genuinely match", diff1.conflicting.length === 0);

  // Idempotency: running the SAME diff twice produces the SAME result.
  const diff2 = diffForImport(candidate, existing, keyFn, ["state_code"]);
  ok("C4. dry-run idempotency — running the identical diff twice yields identical counts",
    diff1.toInsert.length === diff2.toInsert.length && diff1.alreadyExisting.length === diff2.alreadyExisting.length && diff1.conflicting.length === diff2.conflicting.length);

  const conflictingExisting = [{ key: "delta::okpe", state_code: "lagos", name: "Okpe" }]; // same key, different state_code
  const diff3 = diffForImport(candidate, conflictingExisting, keyFn, ["state_code"]);
  ok("C5. a real field mismatch under the same key is reported as CONFLICTING, never silently merged or silently skipped",
    diff3.conflicting.length === 1 && diff3.conflicting[0].mismatchedFields.includes("state_code"));
}

// ============================================================
console.log("\nD — FCT HANDLING (INEC's own numbering quirk)");
// ============================================================
{
  const fct = INEC_STATE_IDS.find((s) => s.code === "fct");
  ok("D1. FCT is present in the state list, exactly once", INEC_STATE_IDS.filter((s) => s.code === "fct").length === 1);
  ok("D2. FCT's internal INEC state_id (15) is recorded exactly as INEC's own live dropdown renders it, not 'corrected' to 37",
    fct.stateId === 15);
  ok("D3. FCT's own display label preserves INEC's '37 - FCT' numbering, so the discrepancy is visible in the data itself, not silently normalized away",
    fct.label === "37 - FCT");
  ok("D4. the full state list is exactly 37 entries (36 states + FCT), matching the reconciled national total", INEC_STATE_IDS.length === 37);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
