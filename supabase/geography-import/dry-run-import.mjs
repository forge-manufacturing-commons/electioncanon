#!/usr/bin/env node
// ============================================================
// ELECTORAL GEOGRAPHY — IMPORTER DRY RUN  (Pre-import qualification pass, Phase 6)
//
// Proves what a real import WOULD do, without doing it. Reads the REAL
// existing geography_lgas/geography_wards rows for the Okpe/Sapele/Uvwie
// acceptance-test slice (read-only — SELECT is all this script ever
// calls), and diffs them against the real INEC-sourced data in
// fixtures/inec-delta-okpe-sapele-uvwie-wards-live.json via
// integrity.mjs's diffForImport(). NEVER calls insert/upsert/update/
// delete on anything. Requires the same service-role credentials as
// import-lgas.mjs (these tables have no client SELECT-bypassing-RLS
// path other than service role — see that script's own header) — but
// unlike import-lgas.mjs, this script would still be safe with a
// read-only key if this project had one, because it performs no writes
// regardless.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node supabase/geography-import/dry-run-import.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseCascadeResponse } from "./inec-source.mjs";
import { diffForImport } from "./integrity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const wardFixture = JSON.parse(readFileSync(join(HERE, "fixtures", "inec-delta-okpe-sapele-uvwie-wards-live.json"), "utf8"));

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in the environment (never on the command line).");
    process.exitCode = 1;
    return;
  }
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  console.log("\nELECTORAL GEOGRAPHY — IMPORTER DRY RUN (no writes performed)\n");

  // ---------- LGAs: candidate = the 3 LGAs INEC confirms for Delta's acceptance-test slice ----------
  const { data: existingLgas, error: lgaErr } = await client.from("geography_lgas").select("id, state_code, name, source").eq("state_code", "delta");
  if (lgaErr) { console.error(`Could not read geography_lgas: ${lgaErr.message}`); process.exitCode = 1; return; }

  const candidateLgas = wardFixture.lgas.map((l) => ({ state_code: "delta", name: l.name, source: "inec-cvr-publicapi-live" }));
  const lgaDiff = diffForImport(candidateLgas, existingLgas, (r) => `${r.state_code}::${r.name.toLowerCase()}`, ["state_code"]);

  console.log("LGAs (Delta / Okpe, Sapele, Uvwie):");
  console.log(`  To insert:         ${lgaDiff.toInsert.length}`);
  console.log(`  Already existing:  ${lgaDiff.alreadyExisting.length}`);
  console.log(`  Conflicting:       ${lgaDiff.conflicting.length}`);

  // ---------- Wards: candidate = the 31 real wards INEC confirms; existing = whatever is really in the DB (0, per the acceptance-test seed's own header) ----------
  const existingLgaIds = (existingLgas ?? []).map((l) => l.id);
  const { data: existingWards, error: wardErr } = existingLgaIds.length
    ? await client.from("geography_wards").select("id, lga_id, name, source").in("lga_id", existingLgaIds)
    : { data: [], error: null };
  if (wardErr) { console.error(`Could not read geography_wards: ${wardErr.message}`); process.exitCode = 1; return; }

  let candidateWards = [];
  for (const lga of wardFixture.lgas) {
    const existingLga = (existingLgas ?? []).find((l) => l.name === lga.name);
    for (const w of parseCascadeResponse(lga.wardsRaw)) {
      candidateWards.push({ lga_name: lga.name, lga_id: existingLga?.id ?? null, name: w.name, source: "inec-cvr-publicapi-live" });
    }
  }
  const wardDiff = diffForImport(candidateWards, existingWards, (r) => `${r.lga_id}::${r.name.toLowerCase()}`, ["lga_id"]);

  console.log("\nWards (Okpe 10 + Sapele 11 + Uvwie 10 = 31 known to INEC):");
  console.log(`  To insert:         ${wardDiff.toInsert.length}`);
  console.log(`  Already existing:  ${wardDiff.alreadyExisting.length}`);
  console.log(`  Conflicting:       ${wardDiff.conflicting.length}`);

  // ---------- Preservation check: the constituency-LGA relationship itself ----------
  const { data: constituencyLgas, error: clErr } = await client
    .from("geography_constituency_lgas").select("constituency_id, lga_id, geography_lgas(name)")
    .in("lga_id", existingLgaIds.length ? existingLgaIds : ["00000000-0000-0000-0000-000000000000"]);
  if (clErr) { console.error(`Could not read geography_constituency_lgas: ${clErr.message}`); process.exitCode = 1; return; }
  const clNames = (constituencyLgas ?? []).map((r) => r.geography_lgas?.name).filter(Boolean).sort();

  console.log("\nConstituency-LGA relationship (Okpe/Sapele/Uvwie Federal Constituency):");
  console.log(`  Rows found:  ${constituencyLgas?.length ?? 0}`);
  console.log(`  LGA names:   ${clNames.join(", ") || "(none)"}`);
  console.log(`  Preserved:   ${clNames.length === 3 && clNames.join(",") === "Okpe,Sapele,Uvwie" ? "YES — untouched, exactly as before" : "UNEXPECTED — investigate before any import"}`);

  console.log("\nThis was a DRY RUN. No insert/update/delete was executed against any table.\n");
}

main();
