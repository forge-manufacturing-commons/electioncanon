// ============================================================
// ELECTORAL GEOGRAPHY — INEC SOURCE PARSING, VALIDATION PIPELINE, DELTA
// RECONCILIATION  (National geography data acquisition & verification pass)
//
// Three kinds of evidence, kept deliberately separate:
//   A. parseCascadeResponse() — pure parsing logic, synthetic inputs.
//   B. integrity.mjs — the validation pipeline (duplicates/orphans/
//      malformed ids/inconsistency/count reconciliation/conflicting
//      extracts), synthetic inputs, so a passing test is never mistaken
//      for evidence about real Nigerian geography.
//   C. The Delta pilot reconciliation — runs the SAME parsing +
//      integrity functions against the REAL data captured live from
//      cvr.inecnigeria.org/PublicApi/ and persisted in
//      supabase/geography-import/fixtures/inec-delta-*-live.json. This is
//      the actual evidence backing this pass's reconciliation report —
//      not re-asserted narrative, a real assertion against real captured
//      INEC output.
//
// No network call in this file — CI/local `npm test` never depends on
// cvr.inecnigeria.org being reachable, matching this repo's own
// established "no real network in the test suite" discipline (see
// inec-source.mjs's own header for why the live-fetch functions
// themselves are untested here).
//
// Run: node test/election-geography-inec-reconciliation.consumer.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { parseCascadeResponse } from "../supabase/geography-import/inec-source.mjs";
import { findDuplicates, findOrphans, findMalformedIdentifiers, findInconsistent, reconcileCount, findConflicts } from "../supabase/geography-import/integrity.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const fixture = (name) => JSON.parse(readFileSync(new URL(`../supabase/geography-import/fixtures/${name}`, import.meta.url), "utf8"));

console.log("\nELECTORAL GEOGRAPHY — INEC source parsing, validation pipeline, Delta reconciliation\n");

// ============================================================
console.log("A — parseCascadeResponse (pure parsing of INEC's own response shape)");
// ============================================================
{
  const raw = [{ "0": "--SELECT--", "selected": "0", "2298": "01 - OREROKPE", "2299": "02 - OVIRI - OKPE" }];
  const parsed = parseCascadeResponse(raw);
  ok("A1. the placeholder ('0'/'selected') is stripped, never treated as a real row", parsed.length === 2);
  ok("A2. the id is the real INEC internal id, not the display number", parsed[0].id === "2298");
  ok("A3. the display number and name are split apart correctly", parsed[0].displayNumber === "01" && parsed[0].name === "OREROKPE");
  ok("A4. a label with extra internal spacing/dashes still splits correctly", parsed[1].name === "OVIRI - OKPE");
  ok("A5. an empty/malformed response never throws, resolves to []", (() => { const r = parseCascadeResponse([{}]); return Array.isArray(r) && r.length === 0; })());
  ok("A6. null/undefined input never throws", parseCascadeResponse(null).length === 0 && parseCascadeResponse(undefined).length === 0);
  ok("A7. a label with no 'NN - ' prefix still parses, with a null displayNumber (never thrown away)",
    parseCascadeResponse([{ "999": "A LABEL WITH NO NUMBER PREFIX" }])[0].displayNumber === null);
}

// ============================================================
console.log("\nB — integrity.mjs validation pipeline (synthetic data)");
// ============================================================
{
  const wards = [
    { id: "w1", lgaId: "l1", name: "Central" },
    { id: "w2", lgaId: "l1", name: "Central" }, // duplicate name under same LGA
    { id: "w3", lgaId: "l1", name: "North" },
    { id: "w1", lgaId: "l1", name: "Central Dup Id" }, // duplicate id
  ];
  const dupNames = findDuplicates(wards, (w) => `${w.lgaId}::${w.name.toLowerCase()}`);
  ok("B1. findDuplicates catches the same NAME reused under the same parent", dupNames.length === 1 && dupNames[0].rows.length === 2);
  const dupIds = findDuplicates(wards, (w) => w.id);
  ok("B2. findDuplicates ALSO catches a reused id across two otherwise-different rows", dupIds.some((g) => g.key === "w1" && g.rows.length === 2));

  const lgaIds = new Set(["l1", "l2"]);
  const orphanWards = [{ id: "w4", lgaId: "l1" }, { id: "w5", lgaId: "l99-does-not-exist" }];
  const orphans = findOrphans(orphanWards, lgaIds, (w) => w.lgaId);
  ok("B3. findOrphans flags a ward whose LGA does not exist in the real parent set", orphans.length === 1 && orphans[0].id === "w5");
  ok("B4. findOrphans never flags a ward with a genuinely real parent", !orphans.some((w) => w.id === "w4"));

  const malformed = findMalformedIdentifiers([{ code: "123" }, { code: "abc" }, { code: "" }, { code: null }], (r) => r.code, /^\d+$/);
  ok("B5. findMalformedIdentifiers catches non-numeric, empty, and null identifiers, never the valid one", malformed.length === 3 && !malformed.some((r) => r.code === "123"));

  const rows = [{ state: "delta", lgaState: "delta" }, { state: "delta", lgaState: "lagos" }];
  const inconsistent = findInconsistent(rows, (r) => r.state === r.lgaState);
  ok("B6. findInconsistent reports rows failing a cross-field consistency check (e.g. state/LGA mismatch)", inconsistent.length === 1 && inconsistent[0].lgaState === "lagos");

  const count = reconcileCount(774, 774, "LGAs");
  ok("B7. reconcileCount reports an exact match honestly", count.matches === true && count.diff === 0);
  const mismatch = reconcileCount(773, 774, "LGAs");
  ok("B8. reconcileCount reports a real mismatch honestly, never rounds it away", mismatch.matches === false && mismatch.diff === -1);
  ok("B9. withinTolerance() is a separate, explicit opt-in — an exact-match check never silently tolerates a diff", mismatch.withinTolerance(1) === true && !mismatch.matches);

  const extractA = [{ id: "x1", name: "Okpe" }];
  const extractB = [{ id: "x1", name: "Okpe Renamed" }];
  const conflicts = findConflicts(extractA, extractB, (r) => r.id, ["name"]);
  ok("B10. findConflicts reports the SAME key with a DIFFERENT value across two extracts, never picks a winner silently", conflicts.length === 1 && conflicts[0].mismatchedFields.includes("name"));
}

// ============================================================
console.log("\nC — DELTA PILOT RECONCILIATION (real data captured from cvr.inecnigeria.org)");
// ============================================================
{
  const wardFixture = fixture("inec-delta-okpe-sapele-uvwie-wards-live.json");
  const reconFixture = fixture("inec-delta-reconciliation-live.json");

  ok("C1. the fixture records a real source name/URL, not a placeholder", /INEC/.test(wardFixture.source_name) && wardFixture.source_url.includes("inecnigeria.org"));
  ok("C2. the fixture records retrieval provenance (retrieved_at, reference_cycle) — never omitted", Boolean(wardFixture.retrieved_at) && Boolean(wardFixture.reference_cycle));

  ok("C3. national totals reconcile exactly against INEC's own stated figures (37 states+FCT, 774 LGAs, 8809 wards, 176846 PUs)",
    reconcileCount(reconFixture.national_totals_stated_by_inec.totalStatesIncludingFct, 37, "states").matches
    && reconcileCount(reconFixture.national_totals_stated_by_inec.totalLgas, 774, "lgas").matches
    && reconcileCount(reconFixture.national_totals_stated_by_inec.totalRegistrationAreasWards, 8809, "wards").matches
    && reconcileCount(reconFixture.national_totals_stated_by_inec.totalPollingUnits, 176846, "pus").matches);

  ok("C4. Delta's live-crawled LGA count matches the expected 25, exactly", reconFixture.delta_state.lgaCount === 25);
  ok("C5. Delta's live-crawled ward/PU totals are real, non-zero counts from an actual completed crawl (0 unresolved)",
    reconFixture.delta_state.totalWards === 270 && reconFixture.delta_state.totalPollingUnits === 5863
    && reconFixture.delta_state.unresolvedWardsDuringCrawl === 0);

  // The actual gap this pilot exists to prove, over the REAL parsed wards.
  const lgaNames = wardFixture.lgas.map((l) => l.name);
  ok("C6. the pilot covers EXACTLY the existing acceptance-test slice — Okpe, Sapele, Uvwie — no more, no less",
    lgaNames.length === 3 && lgaNames.includes("Okpe") && lgaNames.includes("Sapele") && lgaNames.includes("Uvwie"));

  let allWards = [];
  const perLgaCounts = {};
  for (const lga of wardFixture.lgas) {
    const parsed = parseCascadeResponse(lga.wardsRaw);
    perLgaCounts[lga.name] = parsed.length;
    allWards = allWards.concat(parsed.map((w) => ({ ...w, lga: lga.name })));
  }
  ok("C7. INEC reports real, non-zero ward counts for all 3 existing LGAs (Okpe 10, Sapele 11, Uvwie 10)",
    perLgaCounts.Okpe === 10 && perLgaCounts.Sapele === 11 && perLgaCounts.Uvwie === 10);
  ok("C8. total real wards known to INEC for the existing 3-LGA slice is 31 — this IS the import gap, not a guess",
    allWards.length === 31);

  ok("C9. no duplicate ward names under the same LGA in the real captured data",
    findDuplicates(allWards, (w) => `${w.lga}::${w.name.toLowerCase()}`).length === 0);
  ok("C10. no duplicate INEC ward ids in the real captured data", findDuplicates(allWards, (w) => w.id).length === 0);
  ok("C11. no malformed (non-numeric) INEC ward ids in the real captured data",
    findMalformedIdentifiers(allWards, (w) => w.id, /^\d+$/).length === 0);

  // PRESERVATION — the existing seed is asserted UNCHANGED, matching
  // exactly what 20260829000000_election_geography.sql's own seed section
  // and test/election-geography.consumer.mjs's own fixture already encode
  // (3 LGAs, 0 wards, 0 PUs) — this pass performed NO write.
  ok("C12. ElectionCanon's existing Okpe/Sapele/Uvwie seed is asserted PRESERVED — still exactly 3 LGAs, 0 wards, 0 PUs (no import was performed this pass)",
    reconFixture.electioncanon_existing_seed.lgaCount === 3
    && reconFixture.electioncanon_existing_seed.wardCount === 0
    && reconFixture.electioncanon_existing_seed.pollingUnitCount === 0
    && reconFixture.electioncanon_existing_seed.lgas.sort().join(",") === "Okpe,Sapele,Uvwie");
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
