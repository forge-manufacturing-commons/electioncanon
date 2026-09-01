// ============================================================
// ELECTORAL GEOGRAPHY IMPORT — PURE VALIDATION  (National geography pass, Phase A)
//
// Plain JavaScript, no Supabase client, no network, no filesystem — so the
// Node test suite runs the EXACT validation logic the real importer uses,
// the same split contract.mjs/index.ts already establish for the
// invitation-email Edge Function. import-lgas.mjs (the runner) is TRANSPORT
// ONLY: read a file, call validateLgaRows(), write the rows, print the
// summary. Every decision about what counts as a valid/duplicate/rejected
// row lives here, where it's testable without a database.
//
// SHAPE MATCHES supabase/geography-import/README.md EXACTLY — this module
// doesn't invent a new import format, it implements the one already
// documented there (state / lga / source columns, idempotent on the same
// (state_code, name) uniqueness the migration's own `unique(state_code,
// name)` constraint enforces at the database layer). Validation here is a
// FIRST pass, honest about what it can catch (unknown state, missing
// field, in-batch duplicate) — the database's own unique constraint is
// still the final, authoritative idempotency guarantee; this module never
// claims to replace it.
// ============================================================

/** @param row.state  matches a real geography_states row by CODE or NAME (case-insensitive) — README's own documented column meaning. */
function resolveStateCode(rawState, states) {
  const needle = String(rawState ?? "").trim().toLowerCase();
  if (!needle) return null;
  const byCode = states.find((s) => s.code.toLowerCase() === needle);
  if (byCode) return byCode.code;
  const byName = states.find((s) => s.name.toLowerCase() === needle);
  return byName ? byName.code : null;
}

/**
 * Validate a batch of raw LGA import rows against the real, already-seeded
 * geography_states rows (never a hardcoded state list — a state added to
 * the reference table later is automatically recognised here too).
 *
 * @param rows    raw input rows: [{ state, lga, source }]
 * @param states  real rows from geography_states: [{ code, name }]
 * @returns {{ valid: Array, rejected: Array, duplicates: Array }}
 *   valid       — [{ stateCode, name, source }], ready to load
 *   rejected    — [{ row, reason }], never loaded
 *   duplicates  — [{ row, reason }], same (stateCode, name) as an earlier
 *                 valid row IN THIS BATCH — reported separately from
 *                 `rejected` because it's a different, expected condition
 *                 (e.g. the same source file included twice), not a data
 *                 quality problem with the row itself.
 */
export function validateLgaRows(rows, states) {
  const valid = [];
  const rejected = [];
  const duplicates = [];
  const seen = new Set();

  for (const row of rows ?? []) {
    const lgaName = String(row?.lga ?? "").trim();
    const source = String(row?.source ?? "").trim();

    if (!row?.state) { rejected.push({ row, reason: "missing state" }); continue; }
    if (!lgaName) { rejected.push({ row, reason: "missing lga name" }); continue; }
    if (!source) { rejected.push({ row, reason: "missing source" }); continue; }

    const stateCode = resolveStateCode(row.state, states);
    if (!stateCode) { rejected.push({ row, reason: `"${row.state}" is not a recognised state` }); continue; }

    const key = `${stateCode}::${lgaName.toLowerCase()}`;
    if (seen.has(key)) { duplicates.push({ row, reason: `duplicate of an earlier row in this batch (${stateCode}, ${lgaName})` }); continue; }
    seen.add(key);

    valid.push({ stateCode, name: lgaName, source });
  }

  return { valid, rejected, duplicates };
}

export default { validateLgaRows };
