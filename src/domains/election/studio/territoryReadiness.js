// ============================================================
// FORGE ELECTION — TERRITORY READINESS
//
// A SEPARATE module from readiness.js, deliberately never merged into it —
// readiness.js's own header explains why it has exactly 3 dimensions and no
// more; this module does not touch that discipline. It exists because
// readiness.js's `unsupportedDimensions` already names CONSTITUENCY_INTELLIGENCE
// and POLLING_UNIT_COVERAGE as refused, not fabricated, specifically because
// "no total-constituency denominator exists to compute a true coverage
// percentage against" — real geography reference data (geography_lgas/
// geography_wards/geography_polling_units) is exactly that missing
// denominator. This module computes real percentages ONLY for geography
// levels that actually have imported rows; a level with zero imported rows
// (today: wards, polling units — see supabase/geography-import/README.md)
// renders NOT_ESTABLISHED, never a fabricated percentage over zero real
// units. Pure: no DB read of its own — `view` (the folded Canon) and
// `geographyTree` (a real read from geography/read.js's
// getConstituencyTerritory()) both arrive already resolved.
// ============================================================

function gap({ what, why_it_matters, action }) {
  // Same shape readiness.js's own gapFor() establishes — owner/deadline/
  // dependency stay "UNKNOWN" for the identical reason that module states:
  // no Canon field carries an assignee, a deadline, or a dependency graph,
  // so populating them with a guess would be fabrication.
  return Object.freeze({ what, why_it_matters, canon_evidence: null, action, owner: "UNKNOWN", deadline: "UNKNOWN", dependency: "UNKNOWN" });
}

export function deriveTerritoryReadiness({ view = {}, geographyTree = null } = {}) {
  const territory = view?.territory ?? null;
  const responsibilities = Object.values(view?.responsibilities ?? {});
  const gaps = [];

  if (!territory) {
    gaps.push(gap({
      what: "no territory set",
      why_it_matters: "ElectionCanon cannot resolve LGAs, wards, or polling units until this campaign chooses its election, office, state and constituency",
      action: "set your territory in the Territory tab",
    }));
    return Object.freeze({
      territorySet: false,
      constituencyLead: { assigned: false },
      lgaCoverage: { totalLgas: 0, assigned: 0, percent: null, note: "no territory set yet" },
      wardCoverage: { status: "NOT_ESTABLISHED", note: "no territory set yet" },
      pollingUnitCoverage: { status: "NOT_ESTABLISHED", note: "no territory set yet" },
      trainingCompletion: { status: "NOT_ESTABLISHED", note: "no territory set yet" },
      gaps: Object.freeze(gaps),
    });
  }

  const constituencyLeadResp = responsibilities.find((r) => r.level === "constituency") ?? null;
  const lgaResps = responsibilities.filter((r) => r.level === "lga");
  const wardResps = responsibilities.filter((r) => r.level === "ward");
  const puResps = responsibilities.filter((r) => r.level === "polling_unit");

  const lgas = geographyTree?.lgas ?? [];
  const wards = geographyTree?.wards ?? [];
  // Polling-unit TOTAL only — never the full row list. A constituency's
  // polling-unit count can be the largest number in this whole tree (unlike
  // LGAs/wards, which stay small enough to fetch as real rows), so
  // geography/read.js's getConstituencyTerritory() deliberately returns a
  // count-only `pollingUnitTotal` (a bounded `{count:'exact',head:true}`
  // query, no row data transferred) instead of every polling-unit row —
  // see that function's own header. `assigned` is counted directly from
  // this campaign's own responsibility events (same trust model
  // `constituencyLeadResp` already uses — PREPARE-time-validated, not a
  // second row-membership check), not by cross-referencing row ids that
  // are no longer fetched here.
  const totalPollingUnits = geographyTree?.pollingUnitTotal ?? geographyTree?.pollingUnits?.length ?? 0;

  const lgaAssignedIds = new Set(lgaResps.map((r) => r.geographyRef));
  const lgaAssignedCount = lgas.filter((l) => lgaAssignedIds.has(l.id)).length;

  let lgaCoverage;
  if (lgas.length > 0) {
    lgaCoverage = { totalLgas: lgas.length, assigned: lgaAssignedCount, percent: Math.round((lgaAssignedCount / lgas.length) * 100) };
    for (const l of lgas) {
      if (!lgaAssignedIds.has(l.id)) {
        gaps.push(gap({
          what: `${l.name} LGA has no coordinator`,
          why_it_matters: `${l.name} has no team responsible for it`,
          action: `assign an LGA Coordinator to ${l.name}`,
        }));
      }
    }
  } else {
    lgaCoverage = { totalLgas: 0, assigned: 0, percent: null, note: "no LGA reference geography resolved for this territory" };
  }

  const wardAssignedIds = new Set(wardResps.map((r) => r.geographyRef));
  const wardCoverage = wards.length > 0
    ? { totalWards: wards.length, assigned: wards.filter((w) => wardAssignedIds.has(w.id)).length,
        percent: Math.round((wards.filter((w) => wardAssignedIds.has(w.id)).length / wards.length) * 100) }
    : { status: "NOT_ESTABLISHED", note: "no ward reference geography imported for this constituency — see supabase/geography-import/README.md" };

  const pollingUnitCoverage = totalPollingUnits > 0
    ? { totalPollingUnits, assigned: puResps.length, percent: Math.round((puResps.length / totalPollingUnits) * 100) }
    : { status: "NOT_ESTABLISHED", note: "no polling-unit reference geography imported — see supabase/geography-import/README.md" };

  // Training completion is only ever computed over responsibilities whose
  // LEVEL has real imported geography rows (today: constituency + lga) —
  // never over ward/polling-unit responsibilities, since those levels
  // cannot exist yet (proposeAssignResponsibility refuses them) while
  // geography_wards/geography_polling_units stay empty.
  const trainingEligible = [...(constituencyLeadResp ? [constituencyLeadResp] : []), ...lgaResps];
  const trainingComplete = trainingEligible.filter((r) => r.trainingStatus === "COMPLETE").length;
  const trainingCompletion = trainingEligible.length > 0
    ? { total: trainingEligible.length, complete: trainingComplete, percent: Math.round((trainingComplete / trainingEligible.length) * 100) }
    : { status: "NOT_ESTABLISHED", note: "no responsibilities assigned yet at a level with real geography data" };

  if (!constituencyLeadResp) {
    gaps.push(gap({
      what: "constituency has no lead",
      why_it_matters: "no one is accountable for this territory as a whole",
      action: "assign a Constituency Lead",
    }));
  }

  return Object.freeze({
    territorySet: true,
    constituencyLead: constituencyLeadResp
      ? { assigned: true, person: constituencyLeadResp.person, status: constituencyLeadResp.status, trainingStatus: constituencyLeadResp.trainingStatus }
      : { assigned: false },
    lgaCoverage: Object.freeze(lgaCoverage),
    wardCoverage: Object.freeze(wardCoverage),
    pollingUnitCoverage: Object.freeze(pollingUnitCoverage),
    trainingCompletion: Object.freeze(trainingCompletion),
    gaps: Object.freeze(gaps),
  });
}

export default { deriveTerritoryReadiness };
