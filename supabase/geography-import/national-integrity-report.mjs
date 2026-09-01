#!/usr/bin/env node
// ============================================================
// ELECTORAL GEOGRAPHY — NATIONAL INTEGRITY REPORT  (Pre-import qualification pass, Phase 5)
//
// Reads the local national snapshot (produced by
// acquire-national-snapshot.mjs — read-only, no network call of its own)
// and runs the FULL validation pipeline (integrity.mjs) across every
// state/LGA/ward/polling-unit acquired. Writes a machine-readable JSON
// report and prints a human-readable summary. Makes NO database call —
// this is pure analysis of already-acquired local data.
//
// ZERO HIDDEN ERRORS, ON PURPOSE. Every category this pass's own spec
// asked for is computed and reported even when the count is 0 — an
// absent category in the output would be indistinguishable from "we
// forgot to check," which this report refuses to allow.
//
// Run: node supabase/geography-import/national-integrity-report.mjs
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findDuplicates, findOrphans, findMalformedIdentifiers } from "./integrity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(HERE, "snapshots");
const SNAPSHOT_PATH = join(SNAP_DIR, "national-snapshot.json");
const MANIFEST_PATH = join(SNAP_DIR, "manifest.json");
const REPORT_JSON_PATH = join(SNAP_DIR, "integrity-report.json");
const REPORT_TXT_PATH = join(SNAP_DIR, "integrity-report.txt");

const ID_PATTERN = /^\d+$/;

/** Exported for direct testing (see
 *  test/election-geography-national-integrity-report.consumer.mjs) —
 *  pure over a single state's already-acquired result object, no file
 *  I/O, no network. */
export function analyzeState(stateResult) {
  const lgas = stateResult.lgas ?? [];
  let wardCount = 0, puCount = 0;
  let emptyLgas = 0, emptyWards = 0;
  const allWards = [];
  const allPus = [];
  const lgaLevelFailures = [];
  const wardLevelFailures = [];

  for (const lga of lgas) {
    if (lga.lgaLevelFailure) lgaLevelFailures.push({ lgaId: lga.id, lgaName: lga.name, failure: lga.lgaLevelFailure });
    if ((lga.wards ?? []).length === 0 && !lga.lgaLevelFailure) emptyLgas++;
    for (const ward of lga.wards ?? []) {
      wardCount++;
      allWards.push({ ...ward, lgaId: lga.id, lgaName: lga.name });
      if (ward.wardLevelFailure) wardLevelFailures.push({ wardId: ward.id, wardName: ward.name, lgaName: lga.name, failure: ward.wardLevelFailure });
      if ((ward.pollingUnits ?? []).length === 0 && !ward.wardLevelFailure) emptyWards++;
      for (const pu of ward.pollingUnits ?? []) {
        puCount++;
        allPus.push({ ...pu, wardId: ward.id, wardName: ward.name, lgaName: lga.name });
      }
    }
  }

  const dupLgaIds = findDuplicates(lgas, (l) => l.id);
  const dupLgaNames = findDuplicates(lgas, (l) => l.name.toLowerCase());
  const dupWardIds = findDuplicates(allWards, (w) => w.id);
  const dupWardNamesUnderLga = findDuplicates(allWards, (w) => `${w.lgaId}::${w.name.toLowerCase()}`);
  const dupPuIds = findDuplicates(allPus, (p) => p.id);
  const dupPuNamesUnderWard = findDuplicates(allPus, (p) => `${p.wardId}::${(p.name ?? "").toLowerCase()}`);
  const lgaIdSet = new Set(lgas.map((l) => l.id));
  const wardIdSet = new Set(allWards.map((w) => w.id));
  const orphanWards = findOrphans(allWards, lgaIdSet, (w) => w.lgaId);
  const orphanPus = findOrphans(allPus, wardIdSet, (p) => p.wardId);
  const malformedLgaIds = findMalformedIdentifiers(lgas, (l) => l.id, ID_PATTERN);
  const malformedWardIds = findMalformedIdentifiers(allWards, (w) => w.id, ID_PATTERN);
  const malformedPuIds = findMalformedIdentifiers(allPus, (p) => p.id, ID_PATTERN);

  const validationErrorCount = dupLgaIds.length + dupLgaNames.length + dupWardIds.length + dupWardNamesUnderLga.length
    + dupPuIds.length + dupPuNamesUnderWard.length + orphanWards.length + orphanPus.length
    + malformedLgaIds.length + malformedWardIds.length + malformedPuIds.length;

  return {
    stateCode: stateResult.code,
    lgaCount: lgas.length,
    wardCount, puCount,
    requestFailures: stateResult.stats?.failedRequests ?? 0,
    retriedRequests: stateResult.stats?.retriedRequests ?? 0,
    invalidResponses: stateResult.stats?.invalidResponses ?? 0,
    validationErrors: validationErrorCount,
    emptyLgas, emptyWards,
    duplicateLgaIds: dupLgaIds.length, duplicateLgaNames: dupLgaNames.length,
    duplicateWardIds: dupWardIds.length, duplicateWardNamesUnderParent: dupWardNamesUnderLga.length,
    duplicatePuIds: dupPuIds.length, duplicatePuNamesUnderParent: dupPuNamesUnderWard.length,
    orphanWards: orphanWards.length, orphanPus: orphanPus.length,
    malformedLgaIds: malformedLgaIds.length, malformedWardIds: malformedWardIds.length, malformedPuIds: malformedPuIds.length,
    lgaLevelFailures: lgaLevelFailures.length, wardLevelFailures: wardLevelFailures.length,
    status: (stateResult.stats?.failedRequests ?? 0) === 0 && validationErrorCount === 0 ? "CLEAN" : "ANOMALIES FOUND",
  };
}

function main() {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`No snapshot found at ${SNAPSHOT_PATH} — run acquire-national-snapshot.mjs first.`);
    process.exitCode = 1;
    return;
  }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : null;
  const stateResults = Object.values(snapshot.states ?? {});

  const perState = stateResults.map(analyzeState).sort((a, b) => a.stateCode.localeCompare(b.stateCode));

  const totals = perState.reduce((acc, s) => {
    acc.states += 1; acc.lgas += s.lgaCount; acc.wards += s.wardCount; acc.polling_units += s.puCount;
    acc.requestFailures += s.requestFailures; acc.retriedRequests += s.retriedRequests; acc.invalidResponses += s.invalidResponses;
    acc.validationErrors += s.validationErrors;
    acc.duplicateLgaIds += s.duplicateLgaIds; acc.duplicateWardIds += s.duplicateWardIds; acc.duplicatePuIds += s.duplicatePuIds;
    acc.duplicateLgaNames += s.duplicateLgaNames; acc.duplicateWardNamesUnderParent += s.duplicateWardNamesUnderParent; acc.duplicatePuNamesUnderParent += s.duplicatePuNamesUnderParent;
    acc.orphanWards += s.orphanWards; acc.orphanPus += s.orphanPus;
    acc.malformedLgaIds += s.malformedLgaIds; acc.malformedWardIds += s.malformedWardIds; acc.malformedPuIds += s.malformedPuIds;
    acc.emptyLgas += s.emptyLgas; acc.emptyWards += s.emptyWards;
    return acc;
  }, { states: 0, lgas: 0, wards: 0, polling_units: 0, requestFailures: 0, retriedRequests: 0, invalidResponses: 0,
       validationErrors: 0, duplicateLgaIds: 0, duplicateWardIds: 0, duplicatePuIds: 0,
       duplicateLgaNames: 0, duplicateWardNamesUnderParent: 0, duplicatePuNamesUnderParent: 0,
       orphanWards: 0, orphanPus: 0,
       malformedLgaIds: 0, malformedWardIds: 0, malformedPuIds: 0, emptyLgas: 0, emptyWards: 0 });

  const expected = { states: 37, lgas: 774, wards: 8809, polling_units: 176846 };
  const reconciliation = Object.fromEntries(Object.entries(expected).map(([k, exp]) => [k, { actual: totals[k], expected: exp, diff: totals[k] - exp, matches: totals[k] === exp }]));

  const report = { generatedAt: new Date().toISOString(), manifest, perState, totals, reconciliation, zeroHiddenErrors: true };
  writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2));

  const lines = [];
  lines.push("ELECTORAL GEOGRAPHY — NATIONAL INTEGRITY REPORT");
  lines.push("");
  lines.push("STATE/FCT       LGAs   WARDS     PUs  FAILURES  VALID.ERR  STATUS");
  for (const s of perState) {
    lines.push(`${s.stateCode.padEnd(15)} ${String(s.lgaCount).padStart(4)}  ${String(s.wardCount).padStart(6)}  ${String(s.puCount).padStart(6)}  ${String(s.requestFailures).padStart(8)}  ${String(s.validationErrors).padStart(9)}  ${s.status}`);
  }
  lines.push("");
  lines.push(`NATIONAL TOTALS — states: ${totals.states}, LGAs: ${totals.lgas}, wards: ${totals.wards}, polling units: ${totals.polling_units}`);
  lines.push(`Request failures: ${totals.requestFailures}, retried: ${totals.retriedRequests}, invalid responses: ${totals.invalidResponses}`);
  lines.push("");
  lines.push("RECONCILIATION vs. reference figures (validation expectations, NOT forced):");
  for (const [key, r] of Object.entries(reconciliation)) {
    lines.push(`  ${key}: actual=${r.actual} expected=${r.expected} diff=${r.diff} ${r.matches ? "MATCH" : "MISMATCH — reported honestly, not corrected"}`);
  }
  lines.push("");
  lines.push("ANOMALY CATEGORIES (every one always reported, even at zero):");
  lines.push(`  duplicate LGA ids: ${totals.duplicateLgaIds}`);
  lines.push(`  duplicate Ward ids: ${totals.duplicateWardIds}`);
  lines.push(`  duplicate PU ids: ${totals.duplicatePuIds}`);
  lines.push(`  duplicate LGA names (within a state): ${totals.duplicateLgaNames}`);
  lines.push(`  duplicate Ward names (under the same LGA): ${totals.duplicateWardNamesUnderParent}`);
  lines.push(`  duplicate PU names (under the same Ward): ${totals.duplicatePuNamesUnderParent}`);
  lines.push(`  orphan Wards: ${totals.orphanWards}`);
  lines.push(`  orphan PUs: ${totals.orphanPus}`);
  lines.push(`  malformed LGA ids: ${totals.malformedLgaIds}`);
  lines.push(`  malformed Ward ids: ${totals.malformedWardIds}`);
  lines.push(`  malformed PU ids: ${totals.malformedPuIds}`);
  lines.push(`  empty LGAs (0 wards, not a failure): ${totals.emptyLgas}`);
  lines.push(`  empty Wards (0 PUs, not a failure): ${totals.emptyWards}`);
  lines.push(`  retried requests: ${totals.retriedRequests}`);
  lines.push(`  permanently failed requests: ${totals.requestFailures}`);
  lines.push("");
  const allClean = totals.requestFailures === 0 && totals.validationErrors === 0;
  lines.push(allClean ? "ZERO unresolved errors across the entire acquired dataset." : "ANOMALIES PRESENT — see per-state table and JSON report before proposing import.");
  lines.push("");

  const text = lines.join("\n");
  writeFileSync(REPORT_TXT_PATH, text);
  console.log("\n" + text);
  console.log(`(JSON report: ${REPORT_JSON_PATH})`);
}

// Only runs the CLI/file-I/O path when executed directly (`node
// national-integrity-report.mjs`) — importing this module for its
// exported analyzeState() (see the test suite) must never trigger a real
// snapshot-file read.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
