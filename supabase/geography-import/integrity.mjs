// ============================================================
// ELECTORAL GEOGRAPHY — VALIDATION PIPELINE  (National geography pass, Phase B research)
//
// Pure functions, no network, no database, no filesystem — every check
// operates on already-fetched/already-parsed row arrays, so the Node test
// suite runs the EXACT logic a real import would run. Deliberately a small
// set of GENERIC, reusable checks rather than one bespoke function per
// table — "duplicate LGA codes" and "duplicate ward codes" are the same
// shape of problem (findDuplicates with a different key function), not two
// different algorithms.
//
// NEVER REPAIRS A QUESTIONABLE RECORD. Every function here reports; none
// mutates, guesses a fix, or drops a row silently — the caller decides
// what to do with a reported orphan/duplicate/mismatch, and every one MUST
// appear in the import report (per this pass's own explicit instruction).
// ============================================================

/** Groups `rows` by `keyFn(row)`; returns only groups with 2+ members —
 *  i.e. duplicates. Used for duplicate state codes, LGA codes, ward codes,
 *  PU codes, and (with a composite key) duplicate names under the same
 *  parent (e.g. two wards named "Central" under the same LGA). */
export function findDuplicates(rows, keyFn) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = keyFn(row);
    if (key == null || key === "") continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, rows: group }));
}

/** `children` whose `parentKeyFn(child)` does not match any real parent's
 *  id (from `parentIds`, a Set or array of real, already-fetched parent
 *  ids) — an orphan ward (no matching LGA) or orphan polling unit (no
 *  matching ward). Never assumes a missing parent id is "probably fine". */
export function findOrphans(children, parentIds, parentKeyFn) {
  const idSet = parentIds instanceof Set ? parentIds : new Set(parentIds ?? []);
  return (children ?? []).filter((child) => !idSet.has(parentKeyFn(child)));
}

/** Reports rows whose id/code fails `pattern` — a malformed identifier
 *  (empty, wrong shape, non-numeric where a numeric id is expected). */
export function findMalformedIdentifiers(rows, idFn, pattern) {
  return (rows ?? []).filter((row) => {
    const id = idFn(row);
    return id == null || id === "" || !pattern.test(String(id));
  });
}

/** "Inconsistent state/LGA relationships" / "constituency/LGA mismatches"
 *  — generic cross-field consistency check. `checkFn(row)` returns true
 *  when the row is CONSISTENT; this returns the ones that are NOT. Example:
 *  a ward whose claimed state doesn't match its LGA's real state. */
export function findInconsistent(rows, checkFn) {
  return (rows ?? []).filter((row) => !checkFn(row));
}

/** "Unexpected record counts" — compares an actual count against an
 *  expected/reference figure (e.g. INEC's own published national totals),
 *  never silently accepted or silently rejected — the caller decides what
 *  a mismatch means, this only reports the fact honestly. */
export function reconcileCount(actual, expected, label) {
  const diff = actual - expected;
  return Object.freeze({
    label, actual, expected, diff,
    matches: diff === 0,
    withinTolerance: (tolerancePercent) => Math.abs(diff) <= expected * (tolerancePercent / 100),
  });
}

/** "Conflicting records between source extracts" — the SAME key (e.g. the
 *  same INEC ward id) present in two independently-fetched extracts with
 *  DIFFERENT field values (e.g. a different name or parent). Never assumes
 *  the newer/second extract wins — reports the conflict for a human to
 *  resolve, exactly like create_campaign_invitation()'s own "never
 *  silently overwrite" discipline applied to reference-data extraction. */
export function findConflicts(extractA, extractB, keyFn, compareFields) {
  const byKeyB = new Map((extractB ?? []).map((row) => [keyFn(row), row]));
  const conflicts = [];
  for (const rowA of extractA ?? []) {
    const key = keyFn(rowA);
    const rowB = byKeyB.get(key);
    if (!rowB) continue;
    const mismatched = compareFields.filter((field) => rowA[field] !== rowB[field]);
    if (mismatched.length > 0) conflicts.push({ key, a: rowA, b: rowB, mismatchedFields: mismatched });
  }
  return conflicts;
}

/**
 * DRY-RUN IMPORT DIFF (Pre-import qualification pass, Phase 6). Never
 * writes anything — a pure comparison of `candidateRows` (what a real
 * import WOULD load, e.g. from an acquired snapshot) against
 * `existingRows` (a REAL read of what the database already holds),
 * keyed by the same natural key the database's own `unique(...)`
 * constraint enforces (e.g. `(state_code, name)` for LGAs). Three
 * outcomes, exactly mirroring the runner's own `upsert(...,
 * {ignoreDuplicates:true})` semantics PLUS one more the database can't
 * distinguish on its own:
 *   toInsert       — key not present in existingRows at all.
 *   alreadyExisting — key present, and every field in `compareFields`
 *                     matches — this is what `ON CONFLICT DO NOTHING`
 *                     silently and safely skips.
 *   conflicting    — key present, but `compareFields` differ (e.g. the
 *                     existing row's `source` disagrees with the
 *                     candidate's) — the database would ALSO silently
 *                     skip this via ON CONFLICT DO NOTHING, which is
 *                     exactly why a human-reviewed report is needed:
 *                     silent-skip is safe for the database (never
 *                     corrupts existing data) but would hide a real
 *                     discrepancy from the operator if this diff didn't
 *                     surface it separately.
 */
export function diffForImport(candidateRows, existingRows, keyFn, compareFields = []) {
  const existingByKey = new Map((existingRows ?? []).map((row) => [keyFn(row), row]));
  const toInsert = [];
  const alreadyExisting = [];
  const conflicting = [];
  for (const candidate of candidateRows ?? []) {
    const key = keyFn(candidate);
    const existing = existingByKey.get(key);
    if (!existing) { toInsert.push(candidate); continue; }
    const mismatched = compareFields.filter((field) => candidate[field] !== undefined && existing[field] !== undefined && candidate[field] !== existing[field]);
    if (mismatched.length > 0) conflicting.push({ candidate, existing, mismatchedFields: mismatched });
    else alreadyExisting.push({ candidate, existing });
  }
  return { toInsert, alreadyExisting, conflicting };
}

export default { findDuplicates, findOrphans, findMalformedIdentifiers, findInconsistent, reconcileCount, findConflicts, diffForImport };
