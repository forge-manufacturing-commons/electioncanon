// ============================================================
// ELECTORAL GEOGRAPHY — NATIONAL IMPORT PLANNING  (Production import pass)
//
// Pure functions, no network, no database — everything a real import
// decides (what to insert, what already exists, what's quarantined,
// which parent a child resolves to) is computed here and independently
// tested (test/election-geography-national-import-plan.consumer.mjs)
// against synthetic data. import-national-geography.mjs (the runner) is
// TRANSPORT ONLY: read the snapshot, call these functions, execute (or,
// in dry-run mode, only print) the resulting plan.
//
// WHY ID RESOLUTION IS A SEPARATE STEP FROM DIFFING. The snapshot's
// nested structure uses INEC's OWN internal ids as foreign keys (a
// ward's `lgaId` is the INEC lga id it was fetched under). The database
// uses its own generated uuids. A real import must resolve INEC id ->
// real database id (by NAME, under the correct real parent scope) BEFORE
// it can build a valid ward/PU insert payload — resolveIds() does
// exactly this, and reports anything it can't resolve rather than
// silently dropping it.
// ============================================================

/**
 * Resolves each snapshot item's INEC id to the real database id of the
 * matching already-existing-or-just-inserted parent row, by NAME under
 * the correct composite scope (e.g. LGAs scoped by state_code, wards
 * scoped by their real parent lga_id) — never by name alone, since names
 * repeat across different parents by design (the database's own
 * `unique(parent_id, name)` constraints say so).
 *
 * @param items    snapshot items needing resolution, each with an
 *                 inecId (via idFn) and a scope+name (via keyFn)
 * @param dbRows   real rows already read back from the database, each
 *                 with the SAME scope+name shape (via dbKeyFn) and a
 *                 real id (via dbIdFn)
 * @returns { map: Map<inecId, realDbId>, unresolved: [items with no match] }
 */
export function resolveIds(items, idFn, keyFn, dbRows, dbKeyFn, dbIdFn) {
  const byKey = new Map(dbRows.map((row) => [dbKeyFn(row), dbIdFn(row)]));
  const map = new Map();
  const unresolved = [];
  for (const item of items) {
    const key = keyFn(item);
    const dbId = byKey.get(key);
    if (dbId) map.set(idFn(item), dbId);
    else unresolved.push(item);
  }
  return { map, unresolved };
}

/** Flattens the acquired national snapshot's nested {states:{lgas:{wards:{pollingUnits}}}}
 *  shape into flat arrays, one per level — makes every downstream planning
 *  function operate on plain lists instead of re-walking the tree. */
export function flattenSnapshot(states) {
  const lgas = [];
  const wards = [];
  const pollingUnits = [];
  for (const state of Object.values(states)) {
    for (const lga of state.lgas ?? []) {
      lgas.push({ inecLgaId: lga.id, stateCode: state.code, name: lga.name });
      for (const ward of lga.wards ?? []) {
        wards.push({ inecWardId: ward.id, inecLgaId: lga.id, stateCode: state.code, lgaName: lga.name, name: ward.name });
        for (const pu of ward.pollingUnits ?? []) {
          pollingUnits.push({ inecPuId: pu.id, inecWardId: ward.id, wardName: ward.name, code: pu.code, name: pu.name });
        }
      }
    }
  }
  return { lgas, wards, pollingUnits };
}

/** LGA import plan — key = (state_code, name), the database's own real
 *  unique constraint. `existingLgas` are real rows read from
 *  geography_lgas ({state_code, name}). */
export function planLgaImport(flatLgas, existingLgas) {
  const existingKeys = new Set(existingLgas.map((l) => `${l.state_code}::${l.name.toLowerCase()}`));
  const toInsert = [];
  const alreadyExisting = [];
  for (const lga of flatLgas) {
    const key = `${lga.stateCode}::${lga.name.toLowerCase()}`;
    (existingKeys.has(key) ? alreadyExisting : toInsert).push(lga);
  }
  return { toInsert, alreadyExisting };
}

/**
 * Ward import plan — separates quarantine from everything else FIRST
 * (a quarantined ward is never even considered for insert/existing
 * classification), then resolves each remaining ward's real lga_id via
 * `lgaIdMap` (built by resolveIds() against the just-upserted/existing
 * LGA rows), then diffs against real existing ward rows scoped by
 * (lga_id, name) — the database's own unique constraint.
 */
export function planWardImport(flatWards, lgaIdMap, existingWards, quarantinedWardIds) {
  const quarantined = [];
  const candidates = [];
  for (const ward of flatWards) {
    if (quarantinedWardIds.has(ward.inecWardId)) quarantined.push(ward);
    else candidates.push(ward);
  }

  const unresolvedParent = [];
  const resolved = [];
  for (const ward of candidates) {
    const lgaId = lgaIdMap.get(ward.inecLgaId);
    if (!lgaId) unresolvedParent.push(ward);
    else resolved.push({ ...ward, lgaId });
  }

  const existingKeys = new Set(existingWards.map((w) => `${w.lga_id}::${w.name.toLowerCase()}`));
  const toInsert = [];
  const alreadyExisting = [];
  for (const ward of resolved) {
    const key = `${ward.lgaId}::${ward.name.toLowerCase()}`;
    (existingKeys.has(key) ? alreadyExisting : toInsert).push(ward);
  }
  return { toInsert, alreadyExisting, quarantined, unresolvedParent };
}

/** Polling-unit import plan — same shape as planWardImport, minus
 *  quarantine (none declared at PU level this pass), keyed by
 *  (ward_id, code) — the database's own real unique constraint. */
export function planPuImport(flatPus, wardIdMap, existingPus) {
  const unresolvedParent = [];
  const resolved = [];
  for (const pu of flatPus) {
    const wardId = wardIdMap.get(pu.inecWardId);
    if (!wardId) unresolvedParent.push(pu);
    else resolved.push({ ...pu, wardId });
  }

  const existingKeys = new Set(existingPus.map((p) => `${p.ward_id}::${p.code}`));
  const toInsert = [];
  const alreadyExisting = [];
  for (const pu of resolved) {
    const key = `${pu.wardId}::${pu.code}`;
    (existingKeys.has(key) ? alreadyExisting : toInsert).push(pu);
  }
  return { toInsert, alreadyExisting, unresolvedParent };
}

/** Splits `items` into `chunkSize`-sized arrays — used to keep each
 *  upsert request a bounded size against a database with 176,846+
 *  candidate polling-unit rows. */
export function chunk(items, chunkSize) {
  const out = [];
  for (let i = 0; i < items.length; i += chunkSize) out.push(items.slice(i, i + chunkSize));
  return out;
}

export default { resolveIds, flattenSnapshot, planLgaImport, planWardImport, planPuImport, chunk };
