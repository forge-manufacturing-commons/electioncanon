// ============================================================
// ORGANISATION — INVITE WIZARD GEOGRAPHY  (production verification pass fix)
//
// Regression coverage for the live bug found during production
// verification: a STATE-LEVEL campaign territory (Governor/President — no
// constituency at all, e.g. a Lagos campaign) made InviteWizard's LGA
// dropdown (Organisation → Invite Person → step 3) render permanently
// empty, because it only ever called getConstituencyTerritory() and only
// when `territory.constituency` was set. Fixed in
// src/pages/election/OrganisationSection.jsx by mirroring
// TerritoryExplorer.jsx's own state-level-vs-constituency resolution
// (getStateTerritory() when there is no constituency but the office's
// boundary_level is state/national).
//
// This repo has no React-rendering test harness (see
// election-web-surface.consumer.mjs's own header) — section A is the same
// class of structural/source-level check test/election-prelaunch-ux.
// consumer.mjs already established, using test/lib/source.mjs's
// stripComments() so a comment can never fake a passing assertion.
// Sections B-D exercise the REAL, already-shipped geography/read.js
// functions (getStateTerritory/listWardsForLga/listPollingUnitsForWard —
// the exact ones InviteWizard now calls) against a fake Supabase client,
// same pattern test/election-geography.consumer.mjs already established.
//
// Run: node test/election-organisation-invite-geography.consumer.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { stripComments } from "./lib/source.mjs";
import { getStateTerritory, listWardsForLga, listPollingUnitsForWard } from "../src/domains/election/geography/read.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const code = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));

console.log("\nORGANISATION — invite wizard geography (Lagos state-level fix)\n");

// ---------- fake Supabase client (same pattern as election-geography.consumer.mjs) ----------
function fakeTable(rows) {
  let filtered = rows;
  let countMode = false;
  const builder = {
    select(_cols, opts) { if (opts?.count) countMode = true; return builder; },
    eq(key, value) { filtered = filtered.filter((r) => r[key] === value); return builder; },
    in(key, values) { filtered = filtered.filter((r) => values.includes(r[key])); return builder; },
    order() { return builder; },
    async maybeSingle() { return { data: filtered[0] ?? null, error: null }; },
    then(resolve) {
      if (countMode) { resolve({ data: null, count: filtered.length, error: null }); return; }
      resolve({ data: filtered, error: null });
    },
  };
  return builder;
}
function fakeGeographyClient(fixture) {
  return { from: (table) => fakeTable(fixture[table] ?? []) };
}

// Real production shape: a Lagos state-level (Governor) territory has NO
// geography_constituency_lgas entries at all — geography_lgas is queried
// DIRECTLY by state_code, exactly like getStateTerritory()'s own header
// says. A second real state (Ogun) is mixed into the SAME fixture so a
// leak would actually be caught, not just "the query returned nothing."
const LGA_AGEGE = "lga-agege", LGA_IKEJA = "lga-ikeja", LGA_ABEOKUTA = "lga-abeokuta-south";
const WARD_AGEGE_1 = "ward-agege-orile", WARD_IKEJA_1 = "ward-ikeja-alausa";
const PU_AGEGE_ORILE_1 = "pu-agege-orile-001";

const fixture = {
  geography_lgas: [
    { id: LGA_AGEGE, name: "Agege", state_code: "lagos" },
    { id: LGA_IKEJA, name: "Ikeja", state_code: "lagos" },
    { id: LGA_ABEOKUTA, name: "Abeokuta South", state_code: "ogun" },
  ],
  geography_wards: [
    { id: WARD_AGEGE_1, lga_id: LGA_AGEGE, name: "Orile Agege" },
    { id: WARD_IKEJA_1, lga_id: LGA_IKEJA, name: "Alausa" },
  ],
  geography_polling_units: [
    { id: PU_AGEGE_ORILE_1, ward_id: WARD_AGEGE_1, code: "001", name: "Orile Agege Primary School" },
    { id: "pu-ikeja-alausa-001", ward_id: WARD_IKEJA_1, code: "001", name: "Alausa Community Hall" },
  ],
};

// ============================================================
console.log("A — SOURCE FIX PRESENT (guards against regressing to the old buggy gate)");
// ============================================================
{
  const orgSection = code("../src/pages/election/OrganisationSection.jsx");
  ok("A1. InviteWizard imports getStateTerritory (not only getConstituencyTerritory)", /getStateTerritory/.test(orgSection));
  ok("A2. it also imports listOffices, needed to tell a state-level office apart from a constituency-bound one", /listOffices/.test(orgSection));
  ok("A3. it computes an isStateLevel-style check from the office's boundary_level, same as TerritoryExplorer.jsx", /boundary_level\s*===\s*"state"/.test(orgSection) && /boundary_level\s*===\s*"national"/.test(orgSection));
  ok("A4. the tree-fetch effect's guard is NOT gated on territory.constituency alone anymore — the exact regression this fix closes", !/if \(!territory\?\.constituency\) return undefined;/.test(orgSection));
  ok("A5. the tree-fetch effect calls getStateTerritory when there is no constituency", /getStateTerritory\(\{\s*client:\s*supabase,\s*stateCode:\s*territory\.state\s*\}\)/.test(orgSection));
  ok("A6. offices is threaded down into InviteWizard as a real prop, not left undefined", /<InviteWizard[^>]*\boffices=\{offices\}/.test(orgSection));
}

// ============================================================
console.log("\nB — LAGOS CAMPAIGN: LGA DROPDOWN RESOLVES REAL, STATE-FILTERED LGAs (the reported bug)");
// ============================================================
{
  const client = fakeGeographyClient(fixture);
  const { data: lagosTerritory, error } = await getStateTerritory({ client, stateCode: "lagos" });
  ok("B0. resolves with no error", error === null);
  ok("B1. Lagos campaign → the LGA list contains Agege — the exact example from the bug report", lagosTerritory.lgas.some((l) => l.name === "Agege"));
  ok("B2. Lagos campaign → the LGA list contains only Lagos LGAs — Ogun's Abeokuta South never leaks in", lagosTerritory.lgas.every((l) => l.stateCode === "lagos") && !lagosTerritory.lgas.some((l) => l.name === "Abeokuta South"));
  ok("B3. exactly the 2 real Lagos LGAs in the fixture, none dropped, none duplicated", lagosTerritory.lgas.length === 2);

  const { data: ogunTerritory } = await getStateTerritory({ client, stateCode: "ogun" });
  ok("B4. another state (Ogun) cannot see Lagos LGAs — Agege/Ikeja never appear", !ogunTerritory.lgas.some((l) => l.name === "Agege" || l.name === "Ikeja"));
  ok("B5. Ogun's own real LGA still resolves correctly (this isn't just an empty result for every state)", ogunTerritory.lgas.some((l) => l.name === "Abeokuta South"));
}

// ============================================================
console.log("\nC — WARD-LEVEL SELECTION DEPENDS ON THE SELECTED LGA");
// ============================================================
{
  const client = fakeGeographyClient(fixture);
  const { data: agegeWards } = await listWardsForLga({ client, lgaId: LGA_AGEGE });
  ok("C1. Agege's own ward list contains Orile Agege", agegeWards.some((w) => w.name === "Orile Agege"));
  ok("C2. Agege's ward list does NOT include Ikeja's ward (Alausa) — selecting a different LGA must not leak its wards", !agegeWards.some((w) => w.name === "Alausa"));

  const { data: ikejaWards } = await listWardsForLga({ client, lgaId: LGA_IKEJA });
  ok("C3. switching the selected LGA to Ikeja resolves Ikeja's own real ward, not Agege's", ikejaWards.some((w) => w.name === "Alausa") && !ikejaWards.some((w) => w.name === "Orile Agege"));

  const { data: noLga } = await listWardsForLga({ client, lgaId: null });
  ok("C4. no LGA selected yet -> empty ward list, never a fabricated/previous selection's rows", noLga.length === 0);
}

// ============================================================
console.log("\nD — POLLING-UNIT-LEVEL SELECTION DEPENDS ON THE SELECTED WARD");
// ============================================================
{
  const client = fakeGeographyClient(fixture);
  const { data: agegeOrilePus } = await listPollingUnitsForWard({ client, wardId: WARD_AGEGE_1 });
  ok("D1. Orile Agege ward's own PU list contains its real polling unit", agegeOrilePus.some((p) => p.name === "Orile Agege Primary School"));
  ok("D2. it does NOT include Alausa ward's polling unit — selecting a different ward must not leak its PUs", !agegeOrilePus.some((p) => p.name === "Alausa Community Hall"));

  const { data: alausaPus } = await listPollingUnitsForWard({ client, wardId: WARD_IKEJA_1 });
  ok("D3. switching the selected ward to Alausa resolves Alausa's own real PU, not Orile Agege's", alausaPus.some((p) => p.name === "Alausa Community Hall") && !alausaPus.some((p) => p.name === "Orile Agege Primary School"));
}

// ============================================================
console.log("\nE — create_campaign_invitation()'s AUTHORIZATION/GEOGRAPHY VALIDATION IS UNCHANGED (fix stayed client-side only)");
// ============================================================
{
  const migrationPath = "../supabase/migrations/20260831000000_election_campaign_invitations.sql";
  const migration = readFileSync(new URL(migrationPath, import.meta.url), "utf8");
  ok("E1. owner/manager are still unconditionally authorised for any geography (unchanged) — the UI fix works WITH this, not around it", /if v_my_role in \('owner', 'manager'\) then\s*\n\s*v_authorised := true;/.test(migration));
  ok("E2. WARD_COORDINATOR staff-escalation invites still join real geography_wards to the inviter's own LGA responsibility (unchanged)", /join public\.geography_wards w on w\.id::text = p_intended_geography_ref/.test(migration));
  ok("E3. POLLING_UNIT_AGENT staff-escalation invites still join real geography_polling_units to the inviter's own ward responsibility (unchanged)", /join public\.geography_polling_units pu on pu\.id::text = p_intended_geography_ref/.test(migration));
  ok("E4. the RPC is still SECURITY DEFINER with search_path locked down — this fix touched no privileged database function", /security definer[\s\S]{0,40}set search_path = ''/.test(migration));
}

// ============================================================
console.log("\nF — NO GEOGRAPHY TABLE WRITE WAS INTRODUCED BY THIS FIX");
// ============================================================
{
  const orgSection = code("../src/pages/election/OrganisationSection.jsx");
  const readJs = code("../src/domains/election/geography/read.js");
  const geoTables = ["geography_lgas", "geography_wards", "geography_polling_units", "geography_offices", "geography_states", "geography_constituencies", "geography_constituency_lgas"];
  const writeCallPattern = (table) => new RegExp(`from\\(["']${table}["']\\)\\s*\\.\\s*(insert|update|delete|upsert)\\(`);
  for (const table of geoTables) {
    ok(`F. OrganisationSection.jsx never calls insert/update/delete/upsert on ${table}`, !writeCallPattern(table).test(orgSection));
    ok(`F. geography/read.js never calls insert/update/delete/upsert on ${table}`, !writeCallPattern(table).test(readJs));
  }
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
