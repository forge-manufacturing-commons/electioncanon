#!/usr/bin/env node
// ============================================================
// ELECTORAL GEOGRAPHY — DELTA STATE PILOT RECONCILIATION  (National geography pass, Phase B)
//
// Compares the LIVE INEC data captured in fixtures/inec-delta-*-live.json
// against ElectionCanon's OWN existing seeded Delta slice (Okpe/Sapele/
// Uvwie, from 20260829000000_election_geography.sql — hardcoded here as
// the known, already-verified seed, not re-read from a live database:
// this script needs no credentials and makes no network call, exactly
// because it is a REPORT, not an import).
//
// WRITES NOTHING. No database connection, no service-role key, no
// migration. Read-only over the two fixture files in this directory.
//
// Run: node supabase/geography-import/reconcile-delta.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCascadeResponse } from "./inec-source.mjs";
import { findDuplicates, findMalformedIdentifiers, reconcileCount } from "./integrity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const readFixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures", name), "utf8"));

const wardFixture = readFixture("inec-delta-okpe-sapele-uvwie-wards-live.json");
const reconFixture = readFixture("inec-delta-reconciliation-live.json");

// ElectionCanon's OWN existing seed — see this file's own header.
const EXISTING_SEED = Object.freeze({ lgas: ["Okpe", "Sapele", "Uvwie"], wardCount: 0, pollingUnitCount: 0 });

console.log("\nELECTORAL GEOGRAPHY — DELTA STATE PILOT RECONCILIATION\n");
console.log(`Source:        ${wardFixture.source_name}`);
console.log(`Source URL:    ${wardFixture.source_url}`);
console.log(`Retrieved at:  ${wardFixture.retrieved_at}`);
console.log(`Reference cycle: ${wardFixture.reference_cycle.split(".")[0]}.`);

// ---------- 1. National totals reconciliation (INEC's own stated figures) ----------
console.log("\n1. NATIONAL TOTALS (as stated on inecnigeria.org/polling-units/, same retrieval)");
const nat = reconFixture.national_totals_stated_by_inec;
console.log(`   States + FCT: ${nat.totalStatesIncludingFct} (expected 37) — ${nat.totalStatesIncludingFct === 37 ? "MATCH" : "MISMATCH"}`);
console.log(`   LGAs:         ${nat.totalLgas} (expected 774) — ${nat.totalLgas === 774 ? "MATCH" : "MISMATCH"}`);
console.log(`   Wards:        ${nat.totalRegistrationAreasWards} (expected ~8,809) — ${reconcileCount(nat.totalRegistrationAreasWards, 8809, "wards").matches ? "MATCH" : "MISMATCH"}`);
console.log(`   Polling Units: ${nat.totalPollingUnits} (expected ~176,846) — ${reconcileCount(nat.totalPollingUnits, 176846, "PUs").matches ? "MATCH" : "MISMATCH"}`);

// ---------- 2. Delta state-wide reconciliation ----------
console.log("\n2. DELTA STATE (live crawl: all 25 LGAs -> all wards -> PU counts)");
const delta = reconFixture.delta_state;
console.log(`   LGAs found:          ${delta.lgaCount} (expected 25) — ${delta.lgaCountMatchesExpected ? "MATCH" : "MISMATCH"}`);
console.log(`   Wards found:         ${delta.totalWards}`);
console.log(`   Polling Units found: ${delta.totalPollingUnits}`);
console.log(`   Unresolved during crawl: ${delta.unresolvedWardsDuringCrawl}`);
console.log(`   Share of national wards: ${delta.shareOfNationalWards}`);
console.log(`   Share of national PUs:   ${delta.shareOfNationalPollingUnits}`);

// ---------- 3. Existing acceptance-test slice: does it match INEC? ----------
console.log("\n3. EXISTING OKPE/SAPELE/UVWIE SEED vs. LIVE INEC DATA");
const seedLgaNames = new Set(EXISTING_SEED.lgas);
const inecLgaNames = new Set(wardFixture.lgas.map((l) => l.name));
const namesMatch = [...seedLgaNames].every((n) => inecLgaNames.has(n)) && seedLgaNames.size === inecLgaNames.size;
console.log(`   LGA names match: ${namesMatch ? "YES — Okpe, Sapele, Uvwie all confirmed by INEC" : "NO — see below"}`);
console.log(`   ElectionCanon's existing 3-LGA slice is PRESERVED, UNTOUCHED by this pass (0 wards, 0 PUs still — no write performed).`);

let allParsedWards = [];
for (const lga of wardFixture.lgas) {
  const parsed = parseCascadeResponse(lga.wardsRaw);
  console.log(`   ${lga.name}: INEC reports ${parsed.length} wards, ElectionCanon has 0 imported — GAP: ${parsed.length} wards not yet imported.`);
  allParsedWards = allParsedWards.concat(parsed.map((w) => ({ ...w, lga: lga.name })));
}

// ---------- 4. Integrity checks over the parsed real data ----------
console.log("\n4. INTEGRITY CHECKS (over the 31 real parsed Okpe/Sapele/Uvwie wards)");
const dupNames = findDuplicates(allParsedWards, (w) => `${w.lga}::${w.name.toLowerCase()}`);
console.log(`   Duplicate ward names under the same LGA: ${dupNames.length} ${dupNames.length === 0 ? "(none found)" : ""}`);
const dupIds = findDuplicates(allParsedWards, (w) => w.id);
console.log(`   Duplicate INEC ward ids across the batch: ${dupIds.length} ${dupIds.length === 0 ? "(none found)" : ""}`);
const malformed = findMalformedIdentifiers(allParsedWards, (w) => w.id, /^\d+$/);
console.log(`   Malformed ward ids (non-numeric): ${malformed.length} ${malformed.length === 0 ? "(none found)" : ""}`);

// ---------- Classification ----------
console.log("\n5. CLASSIFICATION");
const nationalOk = nat.totalStatesIncludingFct === 37 && nat.totalLgas === 774;
const deltaOk = delta.lgaCountMatchesExpected && dupNames.length === 0 && dupIds.length === 0 && malformed.length === 0;
if (nationalOk && deltaOk && namesMatch) {
  console.log("   VERIFIED OFFICIAL SOURCE -> Delta pilot PASSED reconciliation.");
  console.log("   Ready to propose a controlled Delta import (still requires explicit approval before any write).");
} else {
  console.log("   Reconciliation did NOT fully pass — see mismatches above before proposing any import.");
}
console.log("");
