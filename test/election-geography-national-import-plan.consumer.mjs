// ============================================================
// ELECTORAL GEOGRAPHY — NATIONAL IMPORT PLANNING  (Production import pass)
//
// Tests import-plan.mjs's pure functions directly — no network, no
// database, synthetic data only. This is what proves import idempotency,
// quarantine handling, parent-integrity resolution, and duplicate
// prevention BEFORE any of it runs against a real database.
//
// Run: node test/election-geography-national-import-plan.consumer.mjs
// ============================================================

import { resolveIds, flattenSnapshot, planLgaImport, planWardImport, planPuImport, chunk } from "../supabase/geography-import/import-plan.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTORAL GEOGRAPHY — national import planning\n");

// ============================================================
console.log("A — flattenSnapshot: NESTED -> FLAT, PARENT REFERENCES PRESERVED");
// ============================================================
{
  const states = {
    delta: {
      code: "delta",
      lgas: [{
        id: "199", name: "Okpe",
        wards: [{ id: "2298", name: "OREROKPE", pollingUnits: [{ id: "30405", code: "001", name: "PAVILION" }] }],
      }],
    },
  };
  const flat = flattenSnapshot(states);
  ok("A1. one LGA, one ward, one PU, all present", flat.lgas.length === 1 && flat.wards.length === 1 && flat.pollingUnits.length === 1);
  ok("A2. the ward carries its real INEC parent lga id forward", flat.wards[0].inecLgaId === "199");
  ok("A3. the PU carries its real INEC parent ward id forward", flat.pollingUnits[0].inecWardId === "2298");
  ok("A4. the LGA carries its state code forward", flat.lgas[0].stateCode === "delta");
}

// ============================================================
console.log("\nB — resolveIds: INEC ID -> REAL DATABASE ID, BY NAME UNDER THE CORRECT SCOPE");
// ============================================================
{
  const items = [{ inecId: "199", key: "delta::okpe" }, { inecId: "203", key: "delta::sapele" }];
  const dbRows = [{ id: "uuid-okpe", key: "delta::okpe" }]; // Sapele not yet in the DB
  const { map, unresolved } = resolveIds(items, (i) => i.inecId, (i) => i.key, dbRows, (r) => r.key, (r) => r.id);
  ok("B1. a real match resolves to the real database id", map.get("199") === "uuid-okpe");
  ok("B2. no match for Sapele -> reported as unresolved, never silently dropped or guessed", unresolved.length === 1 && unresolved[0].inecId === "203");
  ok("B3. resolveIds never invents an id for something it can't find", !map.has("203"));
}

// ============================================================
console.log("\nC — planLgaImport: IDEMPOTENCY / NO DUPLICATE CREATION");
// ============================================================
{
  const flatLgas = [
    { stateCode: "delta", name: "Okpe" }, { stateCode: "delta", name: "Sapele" }, { stateCode: "delta", name: "Uvwie" },
  ];
  const existingLgas = [{ state_code: "delta", name: "Okpe" }, { state_code: "delta", name: "Sapele" }, { state_code: "delta", name: "Uvwie" }];
  const plan = planLgaImport(flatLgas, existingLgas);
  ok("C1. all 3 already-existing Delta LGAs are recognised as existing, ZERO proposed for insert (the exact Okpe/Sapele/Uvwie reconciliation this pass exists to prove)",
    plan.toInsert.length === 0 && plan.alreadyExisting.length === 3);

  const withNewState = [...flatLgas, { stateCode: "bayelsa", name: "Brass" }];
  const plan2 = planLgaImport(withNewState, existingLgas);
  ok("C2. a genuinely new LGA (different state) IS proposed for insert", plan2.toInsert.length === 1 && plan2.toInsert[0].name === "Brass");
  ok("C3. running the SAME plan twice is idempotent — identical result both times",
    JSON.stringify(planLgaImport(withNewState, existingLgas)) === JSON.stringify(plan2));
}

// ============================================================
console.log("\nD — planWardImport: QUARANTINE, PARENT RESOLUTION, DUPLICATE PREVENTION");
// ============================================================
{
  const flatWards = [
    { inecWardId: "1462", inecLgaId: "1000", stateCode: "benue", lgaName: "GWER EAST", name: "MBAIKYAAN" },
    { inecWardId: "8810", inecLgaId: "1000", stateCode: "benue", lgaName: "GWER EAST", name: "MBAIKYAAN" }, // the quarantined duplicate
    { inecWardId: "2298", inecLgaId: "199", stateCode: "delta", lgaName: "Okpe", name: "OREROKPE" },
    { inecWardId: "9999", inecLgaId: "no-such-lga", stateCode: "nowhere", lgaName: "GHOST", name: "PHANTOM WARD" },
  ];
  const lgaIdMap = new Map([["1000", "uuid-gwer-east"], ["199", "uuid-okpe"]]); // "no-such-lga" deliberately unresolved
  const existingWards = []; // fresh import — nothing exists yet
  const quarantinedIds = new Set(["8810"]);

  const plan = planWardImport(flatWards, lgaIdMap, existingWards, quarantinedIds);
  ok("D1. the quarantined ward (INEC id 8810) is separated out, never proposed for insert", plan.quarantined.length === 1 && plan.quarantined[0].inecWardId === "8810");
  ok("D2. the REAL Benue ward (id 1462) is NOT quarantined — only the empty duplicate is", !plan.quarantined.some((w) => w.inecWardId === "1462"));
  ok("D3. a ward whose parent LGA never resolved is reported as unresolvedParent, never silently inserted with a null/guessed lga_id",
    plan.unresolvedParent.length === 1 && plan.unresolvedParent[0].inecWardId === "9999");
  ok("D4. the two genuinely resolvable, non-quarantined wards are proposed for insert (against a fresh/empty existing set)", plan.toInsert.length === 2);
  ok("D5. the resolved wards carry the REAL database lga_id, not the INEC one", plan.toInsert.every((w) => w.lgaId.startsWith("uuid-")));

  // Idempotency: re-running against a DB that now has those 2 wards -> 0 new inserts, 2 already-existing, quarantine/unresolved unchanged.
  const existingAfterFirstRun = [{ lga_id: "uuid-gwer-east", name: "MBAIKYAAN" }, { lga_id: "uuid-okpe", name: "OREROKPE" }];
  const plan2 = planWardImport(flatWards, lgaIdMap, existingAfterFirstRun, quarantinedIds);
  ok("D6. re-running the SAME import after a successful first run proposes ZERO new inserts (idempotent, no duplicate creation)",
    plan2.toInsert.length === 0 && plan2.alreadyExisting.length === 2);
  ok("D7. the quarantine decision is stable across re-runs — still 1 quarantined, not reconsidered", plan2.quarantined.length === 1);
}

// ============================================================
console.log("\nE — planPuImport: PARENT RESOLUTION, DUPLICATE PREVENTION");
// ============================================================
{
  const flatPus = [
    { inecPuId: "30405", inecWardId: "2298", wardName: "OREROKPE", code: "001", name: "PAVILION POLICE STATION I" },
    { inecPuId: "30406", inecWardId: "2298", wardName: "OREROKPE", code: "002", name: "PAVILION POLICE STATION II" },
    { inecPuId: "99999", inecWardId: "no-such-ward", wardName: "GHOST", code: "001", name: "PHANTOM PU" },
  ];
  const wardIdMap = new Map([["2298", "uuid-orerokpe"]]);
  const plan = planPuImport(flatPus, wardIdMap, []);
  ok("E1. both real PUs resolve and are proposed for insert", plan.toInsert.length === 2);
  ok("E2. a PU whose parent ward never resolved is reported, not inserted with a guessed parent", plan.unresolvedParent.length === 1);

  const existingAfterRun = [{ ward_id: "uuid-orerokpe", code: "001" }, { ward_id: "uuid-orerokpe", code: "002" }];
  const plan2 = planPuImport(flatPus, wardIdMap, existingAfterRun);
  ok("E3. idempotent re-run — both already-imported PUs recognised as existing, zero new inserts", plan2.toInsert.length === 0 && plan2.alreadyExisting.length === 2);
}

// ============================================================
console.log("\nF — chunk: BOUNDED BATCH SIZES FOR LARGE-SCALE WRITES");
// ============================================================
{
  const items = Array.from({ length: 176846 }, (_, i) => i);
  const chunks = chunk(items, 1000);
  ok("F1. every item is preserved across all chunks, none dropped/duplicated", chunks.reduce((s, c) => s + c.length, 0) === 176846);
  ok("F2. no chunk exceeds the configured size", chunks.every((c) => c.length <= 1000));
  ok("F3. the last chunk correctly holds the remainder", chunks[chunks.length - 1].length === 176846 % 1000);
  ok("F4. an empty list produces zero chunks, never a single empty chunk", chunk([], 500).length === 0);
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
