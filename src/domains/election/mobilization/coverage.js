// ============================================================
// ELECTIONCANON ALPHA 1.3 — MOBILIZATION COVERAGE BY GEOGRAPHY
//
// Pure, read-only. Answers exactly the questions the brief names ("which
// wards have zero agents assigned?", "how many polling units in this LGA
// are covered?") by grouping the REAL folded state — `view.pollingUnits`
// (Alpha 1.2's own state/lga/ward fields, added when a unit is recorded —
// see electionDay/write.js's proposeAddPollingUnit) and `view.agents`
// (electionDay's AGENT_ASSIGNED/AGENT_STATUS_CHANGED fold) — into
// national -> state -> LGA -> ward -> polling unit. NEVER invents a
// coverage percentage: a level with zero recorded polling units reports
// `coveragePercent: null` ("not surveyed"), not `0`, matching this
// codebase's own zero-vs-absence discipline (absence of data is never
// rendered as a false zero). "Covered" means at least one AGENT_ASSIGNED record
// exists for that polling unit — it is a claim about ASSIGNMENT, not
// about whether that agent is actually on the ground; `onGroundCount`
// is tracked separately (agent.status anything past plain ASSIGNED).
// ============================================================

const ON_GROUND_STATUSES = new Set([
  "ARRIVED", "SETUP", "VOTING_UNDERWAY", "COUNTING", "RESULT_CAPTURED", "SUBMITTED",
]);

function emptyCounts() {
  return { totalPollingUnits: 0, assignedCount: 0, onGroundCount: 0, unassignedCount: 0, coveragePercent: null };
}

function finalize(counts) {
  return {
    ...counts,
    coveragePercent: counts.totalPollingUnits > 0
      ? Math.round((counts.assignedCount / counts.totalPollingUnits) * 100)
      : null,
  };
}

/** @param view the folded election Canon (`projectElection()`'s return) —
 *  reads only `view.pollingUnits` and `view.agents`, both already
 *  tenant-scoped by the fold itself. */
export function computeMobilizationCoverage(view) {
  const pollingUnits = Object.values(view?.pollingUnits ?? {});
  const agents = Object.values(view?.agents ?? {});

  const agentsByPollingUnit = new Map();
  for (const agent of agents) {
    if (!agent.pollingUnit) continue;
    const list = agentsByPollingUnit.get(agent.pollingUnit) ?? [];
    list.push(agent);
    agentsByPollingUnit.set(agent.pollingUnit, list);
  }

  const byState = {};
  const unassignedPollingUnits = [];

  for (const pu of pollingUnits) {
    const state = pu.state ?? "Unspecified state";
    const lga = pu.lga ?? "Unspecified LGA";
    const ward = pu.ward ?? "Unspecified ward";
    const puAgents = agentsByPollingUnit.get(pu.id) ?? [];
    const isAssigned = puAgents.length > 0;
    const isOnGround = puAgents.some((a) => ON_GROUND_STATUSES.has(a.status));

    byState[state] ??= { counts: emptyCounts(), byLga: {} };
    byState[state].counts.totalPollingUnits += 1;
    byState[state].byLga[lga] ??= { counts: emptyCounts(), byWard: {} };
    byState[state].byLga[lga].counts.totalPollingUnits += 1;
    byState[state].byLga[lga].byWard[ward] ??= { counts: emptyCounts(), pollingUnits: [] };
    byState[state].byLga[lga].byWard[ward].counts.totalPollingUnits += 1;

    if (isAssigned) {
      byState[state].counts.assignedCount += 1;
      byState[state].byLga[lga].counts.assignedCount += 1;
      byState[state].byLga[lga].byWard[ward].counts.assignedCount += 1;
    } else {
      byState[state].counts.unassignedCount += 1;
      byState[state].byLga[lga].counts.unassignedCount += 1;
      byState[state].byLga[lga].byWard[ward].counts.unassignedCount += 1;
      unassignedPollingUnits.push({ id: pu.id, code: pu.code ?? pu.id, state, lga, ward });
    }
    if (isOnGround) {
      byState[state].counts.onGroundCount += 1;
      byState[state].byLga[lga].counts.onGroundCount += 1;
      byState[state].byLga[lga].byWard[ward].counts.onGroundCount += 1;
    }

    byState[state].byLga[lga].byWard[ward].pollingUnits.push({
      id: pu.id, code: pu.code ?? pu.id, assigned: isAssigned, onGround: isOnGround, agentCount: puAgents.length,
    });
  }

  for (const state of Object.values(byState)) {
    for (const lga of Object.values(state.byLga)) {
      for (const ward of Object.values(lga.byWard)) ward.counts = finalize(ward.counts);
      lga.counts = finalize(lga.counts);
    }
    state.counts = finalize(state.counts);
  }

  const national = finalize(Object.values(byState).reduce((acc, state) => ({
    totalPollingUnits: acc.totalPollingUnits + state.counts.totalPollingUnits,
    assignedCount: acc.assignedCount + state.counts.assignedCount,
    onGroundCount: acc.onGroundCount + state.counts.onGroundCount,
    unassignedCount: acc.unassignedCount + state.counts.unassignedCount,
    coveragePercent: null,
  }), emptyCounts()));

  return { national, byState, unassignedPollingUnits };
}

export default { computeMobilizationCoverage };
