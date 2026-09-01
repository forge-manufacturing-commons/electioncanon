#!/usr/bin/env node
// ============================================================
// ELECTORAL GEOGRAPHY IMPORT — LGA RUNNER  (National geography pass, Phase A)
//
// TRANSPORT ONLY — see validate.mjs's own header for why every validation
// decision lives there instead, testable without a database. This file:
// reads a fixture file, resolves it against the real geography_states
// rows, validates, loads idempotently (on conflict (state_code, name) do
// nothing — the exact guarantee the migration's own `unique(state_code,
// name)` constraint already provides at the database layer, never
// re-implemented here), and prints the section-12 summary format.
//
// MUST BE RUN LOCALLY, BY THE OPERATOR, WITH A SERVICE-ROLE KEY.
// geography_lgas has NO client write policy for any role (see
// 20260829000000_election_geography.sql's own RLS section) — only a
// service-role key, which bypasses RLS entirely, can write here. This
// script never runs from the browser, never runs in an Edge Function. The
// key is read ONLY from the environment — never a default, never logged,
// never written to a file, never passed as a CLI argument (which would
// leak it into shell history).
//
// NEVER OVERWRITES A CONFLICTING ROW. ignoreDuplicates:true means an
// existing (state_code, name) row is left exactly as it was — a
// re-delimitation is a new import batch with a new `source` value
// describing it, never a silent edit in place (see the README's own
// "Constraints that keep this safe" section).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node supabase/geography-import/import-lgas.mjs <path-to-rows.json>
// ============================================================

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { validateLgaRows } from "./validate.mjs";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node supabase/geography-import/import-lgas.mjs <path-to-rows.json>");
    process.exitCode = 1;
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the environment.\n" +
      "Never pass the key on the command line (it would leak into shell history) or commit it anywhere."
    );
    process.exitCode = 1;
    return;
  }

  let rows;
  try {
    rows = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Could not read/parse ${filePath}: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(rows)) {
    console.error(`${filePath} must contain a JSON array of {state, lga, source} rows.`);
    process.exitCode = 1;
    return;
  }

  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const { data: states, error: statesError } = await client.from("geography_states").select("code, name");
  if (statesError) {
    console.error(`Could not read geography_states: ${statesError.message}`);
    process.exitCode = 1;
    return;
  }

  const { valid, rejected, duplicates } = validateLgaRows(rows, states ?? []);

  let imported = 0;
  let conflicts = 0;
  if (valid.length > 0) {
    const payload = valid.map((v) => ({ state_code: v.stateCode, name: v.name, source: v.source }));
    // .select() after an ignoreDuplicates:true upsert returns ONLY the rows
    // that were actually newly inserted (PostgREST's ON CONFLICT DO NOTHING
    // semantics) — the diff against valid.length is the honest "already
    // existed" count, with no separate lookup query needed.
    const { data: inserted, error: upsertError } = await client
      .from("geography_lgas")
      .upsert(payload, { onConflict: "state_code,name", ignoreDuplicates: true })
      .select("id");
    if (upsertError) {
      console.error(`Load failed: ${upsertError.message}`);
      process.exitCode = 1;
      return;
    }
    imported = inserted?.length ?? 0;
    conflicts = valid.length - imported;
  }

  const sourceSet = [...new Set(valid.map((v) => v.source))];
  console.log("");
  console.log("ELECTORAL GEOGRAPHY IMPORT — LGAs");
  console.log("");
  console.log(`Imported:    ${imported}`);
  console.log(`Conflicts:   ${conflicts} (already existed — left unchanged, never overwritten)`);
  console.log(`Rejected:    ${rejected.length}`);
  console.log(`Duplicates:  ${duplicates.length} (within this batch)`);
  console.log(`Source(s):   ${sourceSet.join(", ") || "(none)"}`);
  console.log(`Imported at: ${new Date().toISOString()}`);
  if (rejected.length > 0) {
    console.log("");
    console.log("Rejected rows:");
    for (const r of rejected) console.log(`  - ${JSON.stringify(r.row)} — ${r.reason}`);
  }
  if (duplicates.length > 0) {
    console.log("");
    console.log("In-batch duplicates:");
    for (const d of duplicates) console.log(`  - ${JSON.stringify(d.row)} — ${d.reason}`);
  }
  console.log("");
}

main();
