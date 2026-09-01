// ============================================================
// ELECTORAL GEOGRAPHY — QUARANTINE LIST  (Production import pass)
//
// Every record here is EXCLUDED from operational import — never deleted
// from the source snapshot, never merged, never renamed, never guessed
// at. A quarantined record stays visible in this file, in the snapshot,
// and in the import report; it simply never becomes a row in
// geography_wards/geography_polling_units.
//
// Adding an entry here is a HUMAN decision recorded with a reason, not
// something an importer infers on its own — see import-national-
// geography.mjs's own header for how this list is consulted.
// ============================================================

export const QUARANTINED_WARDS = Object.freeze([
  {
    inecWardId: "8810",
    state: "benue",
    lga: "GWER EAST",
    name: "MBAIKYAAN",
    reason: "INEC's live PublicApi returns TWO wards named MBAIKYAAN under Benue/GWER EAST: id 1462 (real, populated with real polling units) and id 8810 (empty, 0 polling units). This accounts for the entire national ward-count discrepancy found during the pre-import qualification pass (8,810 acquired vs. INEC's own stated ~8,809). Not merged, not renamed, not deleted from the snapshot — id 1462 imports normally; id 8810 is excluded from operational geography until a human (ideally with direct INEC contact) resolves which record is authoritative.",
    quarantinedAt: "2026-09-01",
  },
]);

export const QUARANTINED_WARD_IDS = new Set(QUARANTINED_WARDS.map((w) => w.inecWardId));

export default { QUARANTINED_WARDS, QUARANTINED_WARD_IDS };
