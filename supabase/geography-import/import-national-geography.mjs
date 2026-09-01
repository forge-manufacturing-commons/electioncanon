#!/usr/bin/env node
// ============================================================
// ELECTORAL GEOGRAPHY — NATIONAL ADMINISTRATIVE GEOGRAPHY IMPORT  (Production import pass)
//
// TRANSPORT ONLY. Every decision (what to insert, what already exists,
// what's quarantined, how a child resolves to its parent) is made by
// import-plan.mjs's pure, independently-tested functions
// (test/election-geography-national-import-plan.consumer.mjs) — this
// file reads the local snapshot, reads real existing rows, calls those
// functions, and either PRINTS the resulting plan (dry run, the default)
// or EXECUTES it (only with DRY_RUN=false, explicit and unambiguous).
//
// SCOPE: State -> LGA -> Ward -> Polling Unit ONLY. This script never
// touches geography_constituencies / geography_constituency_lgas —
// constituency delimitation is a separate, still-unqualified problem
// (see supabase/geography-import/README.md's own section on this) and
// this script has no code path that could write to those tables even by
// accident (it never imports write logic for them).
//
// MUST BE RUN LOCALLY, BY THE OPERATOR, WITH A SERVICE-ROLE KEY — same
// discipline as import-lgas.mjs. The key is read only from the
// environment, never logged, never written to a file, never a CLI arg.
//
// IDEMPOTENT BY CONSTRUCTION: every write is `.upsert(rows, {onConflict,
// ignoreDuplicates: true})` against the SAME real unique constraints the
// original migration already defined — re-running this script (after an
// interruption, or just to pick up a later re-acquired snapshot) can
// only ever add rows that don't already exist; it can never create a
// duplicate, and it never deletes or updates an existing row.
//
// Usage (dry run — the default, safe, no writes):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node supabase/geography-import/import-national-geography.mjs
//
// Usage (real import — explicit opt-in required):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DRY_RUN=false \
//     node supabase/geography-import/import-national-geography.mjs
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { flattenSnapshot, resolveIds, planLgaImport, planWardImport, planPuImport, chunk } from "./import-plan.mjs";
import { QUARANTINED_WARDS, QUARANTINED_WARD_IDS } from "./quarantine.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, "snapshots", "national-snapshot.json");
const SOURCE_TAG = "inec-cvr-publicapi-live-2026-09-01";
const BATCH_SIZE = 500;
const DRY_RUN = process.env.DRY_RUN !== "false"; // default TRUE — writes require an explicit, unambiguous opt-out

async function upsertBatched(client, table, rows, onConflict) {
  let inserted = 0;
  for (const batch of chunk(rows, BATCH_SIZE)) {
    if (DRY_RUN) { inserted += batch.length; continue; } // dry run never calls upsert at all
    const { data, error } = await client.from(table).upsert(batch, { onConflict, ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`upsert into ${table} failed: ${error.message}`);
    inserted += data?.length ?? 0;
  }
  return inserted;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the environment (never on the command line, never committed).");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(SNAPSHOT_PATH)) {
    console.error(`No snapshot found at ${SNAPSHOT_PATH} — run acquire-national-snapshot.mjs first.`);
    process.exitCode = 1;
    return;
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const { lgas, wards, pollingUnits } = flattenSnapshot(snapshot.states);

  console.log(`\nELECTORAL GEOGRAPHY — NATIONAL ADMINISTRATIVE GEOGRAPHY IMPORT ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE — WRITING)"}\n`);
  console.log(`Snapshot acquired at: ${snapshot.acquiredAt}`);
  console.log(`Candidates — LGAs: ${lgas.length}, wards: ${wards.length}, polling units: ${pollingUnits.length}`);
  console.log(`Quarantined wards (excluded, never imported): ${QUARANTINED_WARDS.length}`);
  for (const q of QUARANTINED_WARDS) console.log(`  - ${q.state}/${q.lga}/${q.name} (INEC id ${q.inecWardId}): ${q.reason.slice(0, 90)}...`);
  console.log("");

  // ---------- LGAs ----------
  const { data: existingLgas, error: lgaReadErr } = await client.from("geography_lgas").select("id, state_code, name");
  if (lgaReadErr) throw new Error(`could not read geography_lgas: ${lgaReadErr.message}`);
  const lgaPlan = planLgaImport(lgas, existingLgas ?? []);
  console.log(`LGAs — existing: ${lgaPlan.alreadyExisting.length}, new: ${lgaPlan.toInsert.length}`);
  const lgaPayload = lgaPlan.toInsert.map((l) => ({ state_code: l.stateCode, name: l.name, source: SOURCE_TAG }));
  const lgaInsertedCount = await upsertBatched(client, "geography_lgas", lgaPayload, "state_code,name");
  console.log(`LGAs — ${DRY_RUN ? "would insert" : "inserted"}: ${lgaInsertedCount}`);

  // Re-read LGAs (post-write, or the same read in dry-run — either way this
  // is the REAL set an id-resolution step must use) to build the INEC id -> real db id map for wards.
  const { data: lgasForResolution } = DRY_RUN
    ? { data: [...(existingLgas ?? []), ...lgaPlan.toInsert.map((l) => ({ id: `WOULD-INSERT:${l.stateCode}:${l.name}`, state_code: l.stateCode, name: l.name }))] }
    : await client.from("geography_lgas").select("id, state_code, name");
  const { map: lgaIdMap, unresolved: unresolvedLgaRefs } = resolveIds(
    lgas, (l) => l.inecLgaId, (l) => `${l.stateCode}::${l.name.toLowerCase()}`,
    lgasForResolution ?? [], (r) => `${r.state_code}::${r.name.toLowerCase()}`, (r) => r.id,
  );
  if (unresolvedLgaRefs.length > 0) console.log(`  WARNING: ${unresolvedLgaRefs.length} LGA(s) could not be resolved after write — see log.`);

  // ---------- Wards ----------
  const { data: existingWards, error: wardReadErr } = await client.from("geography_wards").select("id, lga_id, name");
  if (wardReadErr) throw new Error(`could not read geography_wards: ${wardReadErr.message}`);
  const wardPlan = planWardImport(wards, lgaIdMap, existingWards ?? [], QUARANTINED_WARD_IDS);
  console.log(`\nWards — existing: ${wardPlan.alreadyExisting.length}, new: ${wardPlan.toInsert.length}, quarantined: ${wardPlan.quarantined.length}, unresolved parent: ${wardPlan.unresolvedParent.length}`);
  const wardPayload = wardPlan.toInsert.map((w) => ({ lga_id: w.lgaId, name: w.name, source: SOURCE_TAG }));
  const wardInsertedCount = await upsertBatched(client, "geography_wards", wardPayload, "lga_id,name");
  console.log(`Wards — ${DRY_RUN ? "would insert" : "inserted"}: ${wardInsertedCount}`);
  if (wardPlan.unresolvedParent.length > 0) {
    console.log(`  WARNING: ${wardPlan.unresolvedParent.length} ward(s) have no resolvable parent LGA — NOT imported, listed below:`);
    for (const w of wardPlan.unresolvedParent.slice(0, 20)) console.log(`    - ${w.stateCode}/${w.lgaName}/${w.name} (INEC lga id ${w.inecLgaId})`);
  }

  const { data: wardsForResolution } = DRY_RUN
    ? { data: [...(existingWards ?? []), ...wardPlan.toInsert.map((w) => ({ id: `WOULD-INSERT:${w.lgaId}:${w.name}`, lga_id: w.lgaId, name: w.name }))] }
    : await client.from("geography_wards").select("id, lga_id, name");
  const { map: wardIdMap, unresolved: unresolvedWardRefs } = resolveIds(
    wards.filter((w) => !QUARANTINED_WARD_IDS.has(w.inecWardId)), (w) => w.inecWardId, (w) => {
      const lgaId = lgaIdMap.get(w.inecLgaId);
      return `${lgaId}::${w.name.toLowerCase()}`;
    },
    wardsForResolution ?? [], (r) => `${r.lga_id}::${r.name.toLowerCase()}`, (r) => r.id,
  );

  // ---------- Polling Units ----------
  const { data: existingPus, error: puReadErr } = await client.from("geography_polling_units").select("id, ward_id, code");
  if (puReadErr) throw new Error(`could not read geography_polling_units: ${puReadErr.message}`);
  const puPlan = planPuImport(pollingUnits, wardIdMap, existingPus ?? []);
  console.log(`\nPolling Units — existing: ${puPlan.alreadyExisting.length}, new: ${puPlan.toInsert.length}, unresolved parent: ${puPlan.unresolvedParent.length}`);
  const puPayload = puPlan.toInsert.map((p) => ({ ward_id: p.wardId, code: p.code, name: p.name, source: SOURCE_TAG }));
  const puInsertedCount = await upsertBatched(client, "geography_polling_units", puPayload, "ward_id,code");
  console.log(`Polling Units — ${DRY_RUN ? "would insert" : "inserted"}: ${puInsertedCount}`);
  if (puPlan.unresolvedParent.length > 0) {
    console.log(`  WARNING: ${puPlan.unresolvedParent.length} polling unit(s) have no resolvable parent ward — NOT imported.`);
  }

  console.log(`\n${DRY_RUN ? "DRY RUN COMPLETE — no writes were performed. Re-run with DRY_RUN=false to execute for real." : "IMPORT COMPLETE."}\n`);
}

main().catch((err) => {
  console.error("Import run failed:", err);
  process.exitCode = 1;
});
