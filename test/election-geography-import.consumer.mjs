// ============================================================
// ELECTORAL GEOGRAPHY IMPORT — VALIDATION  (National geography pass, Phase A)
//
// Tests validateLgaRows() directly — the pure logic import-lgas.mjs's
// runner calls, per that module's own header. All fixtures here are
// SYNTHETIC (invented state/LGA names for test purposes only, clearly not
// real Nigerian geography) — never confused with the real, sourced
// supabase/geography-import/fixtures/delta-lgas.json, which mirrors the
// migration's own already-verified Okpe/Sapele/Uvwie seed exactly and is
// used only for a live idempotency demonstration against production, not
// unit-tested here.
//
// Run: node test/election-geography-import.consumer.mjs
// ============================================================

import { validateLgaRows } from "../supabase/geography-import/validate.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTORAL GEOGRAPHY IMPORT — validation\n");

// Synthetic reference states — deliberately NOT real Nigerian state codes,
// so a passing test can never be mistaken for evidence about real geography.
const STATES = [
  { code: "testland", name: "Testland" },
  { code: "fixturia", name: "Fixturia" },
];

console.log("A — VALID ROWS");
{
  const rows = [
    { state: "testland", lga: "North Ward District", source: "unit-test-fixture" },
    { state: "Fixturia", lga: "Central District", source: "unit-test-fixture" }, // state matched by NAME, case-insensitive
  ];
  const { valid, rejected, duplicates } = validateLgaRows(rows, STATES);
  ok("A1. both rows validate", valid.length === 2 && rejected.length === 0 && duplicates.length === 0);
  ok("A2. state is resolved to its CODE even when the input was a NAME", valid[1].stateCode === "fixturia");
  ok("A3. the LGA name and source are carried through unchanged", valid[0].name === "North Ward District" && valid[0].source === "unit-test-fixture");
}

console.log("\nB — REJECTED ROWS (never loaded, never guessed)");
{
  const rows = [
    { state: "", lga: "X", source: "s" },
    { state: "testland", lga: "", source: "s" },
    { state: "testland", lga: "X", source: "" },
    { state: "not_a_real_state", lga: "X", source: "s" },
  ];
  const { valid, rejected } = validateLgaRows(rows, STATES);
  ok("B1. all 4 malformed/unrecognised rows are rejected, none silently accepted", valid.length === 0 && rejected.length === 4);
  ok("B2. a missing state is rejected with an honest reason", rejected[0].reason === "missing state");
  ok("B3. a missing LGA name is rejected with an honest reason", rejected[1].reason === "missing lga name");
  ok("B4. a missing source is rejected with an honest reason", rejected[2].reason === "missing source");
  ok("B5. an unrecognised state is rejected by name, never fabricated as a new state", /is not a recognised state/.test(rejected[3].reason));
}

console.log("\nC — IN-BATCH DUPLICATE DETECTION");
{
  const rows = [
    { state: "testland", lga: "North Ward District", source: "unit-test-fixture" },
    { state: "TESTLAND", lga: "north ward district", source: "unit-test-fixture" }, // same slot, different case
  ];
  const { valid, duplicates } = validateLgaRows(rows, STATES);
  ok("C1. the second row is flagged as an in-batch duplicate of the first, not silently loaded twice",
    valid.length === 1 && duplicates.length === 1);
  ok("C2. the duplicate reason names the (state, lga) pair", /testland/.test(duplicates[0].reason) && /north ward district/i.test(duplicates[0].reason));
}

console.log("\nD — EMPTY / MALFORMED INPUT NEVER THROWS");
{
  ok("D1. an empty array validates cleanly", (() => { const r = validateLgaRows([], STATES); return r.valid.length === 0 && r.rejected.length === 0; })());
  ok("D2. null rows never throws", (() => { validateLgaRows(null, STATES); return true; })());
  ok("D3. a row that is not an object is rejected, not thrown on", validateLgaRows([null, undefined, 42], STATES).rejected.length === 3);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
