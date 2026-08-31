// ============================================================
// ELECTION FORGE — TERRITORY EXPLORER
//
// Constituency -> LGA -> Ward -> Polling Unit drill-down, once a campaign
// has set its territory (TerritorySection.jsx). Reads the real geography_*
// reference tables (geography/read.js's getConstituencyTerritory) and the
// campaign's own `responsibilities`/`people` fold — never a fabricated row.
// Ward/polling-unit levels render an honest "not imported yet" state
// instead of a placeholder, exactly as long as geography_wards/
// geography_polling_units stay empty (see supabase/geography-import/README.md).
// `PercentBar` is a LOCAL equivalent of MobilizeSection.jsx's own
// (unexported) CoverageBar — same visual language, not an import, so this
// file stays additive rather than refactoring that one.
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { getConstituencyTerritory, listPollingUnitsForWard } from "../../domains/election/geography/read.js";
import { prepareGeographyWrite, approveGeographyWrite, GEOGRAPHY_OPERATION } from "../../os/electionWebAdapter.js";
import { GEOGRAPHY_LEVEL } from "../../domains/election/geography/write.js";
import { deriveTerritoryReadiness } from "../../domains/election/studio/territoryReadiness.js";
import { Label, Panel, StructuredWritePanel, GapRow, UI, IVORY, TEAL, AMBER, PINK, MUTED, BORDER } from "./shared.jsx";

function PercentBar({ assigned, total, percent, note }) {
  if (percent == null) {
    return <div style={{ fontFamily: UI, fontSize: 11, color: MUTED }}>{note ?? "not yet established"}</div>;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: BORDER, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${percent}%`,
          background: percent === 100 ? TEAL : percent === 0 ? PINK : AMBER }} />
      </div>
      <span style={{ fontFamily: UI, fontSize: 10.5, fontWeight: 700, color: MUTED, minWidth: 90, textAlign: "right" }}>
        {assigned}/{total} ({percent}%)
      </span>
    </div>
  );
}

function AssignPanel({ title, level, geographyRef, roster, geographyTree, campaignId, refresh, accent = TEAL }) {
  return (
    <StructuredWritePanel
      title={title} operation={GEOGRAPHY_OPERATION.ASSIGN_RESPONSIBILITY}
      prepareFn={prepareGeographyWrite} approveFn={approveGeographyWrite}
      campaignId={campaignId} refresh={refresh} accent={accent}
      extraArgs={{ roster, geographyTree }}
      fields={[
        { id: "personId", label: "Person", type: "select", options: roster.length
          ? roster.map((p) => ({ value: p.id, label: p.name }))
          : [{ value: "", label: "Add someone under Mobilize first" }] },
        { id: "level", label: "Level", type: "select", options: [{ value: level, label: level.replace(/_/g, " ") }] },
        { id: "geographyRef", label: "Location", type: "select", options: [{ value: geographyRef.value, label: geographyRef.label }] },
      ]}
    />
  );
}

export default function TerritoryExplorer({ ctx, campaignId, refresh, territory, offices, states }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(Boolean(territory.constituency));
  const [expandedLga, setExpandedLga] = useState(null);
  // Ward -> polling units is the LAZY step (see read.js's getConstituencyTerritory
  // header) — a ward's own PUs are fetched only when that ward is expanded,
  // cached here by ward id so re-expanding doesn't re-fetch.
  const [expandedWard, setExpandedWard] = useState(null);
  const [pollingUnitsByWard, setPollingUnitsByWard] = useState({});
  const [pollingUnitsLoading, setPollingUnitsLoading] = useState(null);

  const toggleWard = async (wardId) => {
    if (expandedWard === wardId) { setExpandedWard(null); return; }
    setExpandedWard(wardId);
    if (pollingUnitsByWard[wardId] !== undefined) return;
    setPollingUnitsLoading(wardId);
    const { data } = await listPollingUnitsForWard({ client: supabase, wardId });
    setPollingUnitsByWard((prev) => ({ ...prev, [wardId]: data ?? [] }));
    setPollingUnitsLoading(null);
  };

  useEffect(() => {
    if (!territory.constituency) { setTree(null); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await getConstituencyTerritory({ client: supabase, constituencyId: territory.constituency });
      if (!cancelled) { setTree(data); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [territory.constituency]);

  const office = offices.find((o) => o.id === territory.office) ?? null;
  const state = states.find((s) => s.code === territory.state) ?? null;
  const roster = Object.values(ctx.view?.people ?? {});
  const responsibilities = Object.values(ctx.view?.responsibilities ?? {});
  const personFor = (id) => roster.find((p) => p.id === id)?.name ?? "an unrostered person";
  const responsibilityFor = (level, geographyRef) =>
    responsibilities.find((r) => r.level === level && r.geographyRef === geographyRef) ?? null;

  if (!territory.constituency) {
    return (
      <div>
        <Label>{office?.name ?? territory.office} · {state?.name ?? territory.state}</Label>
        <Panel>
          <div style={{ fontFamily: UI, fontSize: 13, color: IVORY, lineHeight: 1.6 }}>
            {office?.name ?? "This office"} resolves directly to {state?.name ?? "a state"} — there is
            no constituency-level territory to explore. LGA/ward/polling-unit drill-down is built for
            constituency-bound offices (House of Representatives, Senate, State House of Assembly) in this pass.
          </div>
        </Panel>
      </div>
    );
  }

  if (loading) {
    return <Panel><div style={{ fontFamily: UI, fontSize: 13, color: MUTED }}>Resolving territory…</div></Panel>;
  }
  if (!tree) {
    return <Panel accent={PINK}><div style={{ fontFamily: UI, fontSize: 13, color: IVORY }}>
      Could not resolve this territory's geography. Try refreshing.
    </div></Panel>;
  }

  const readiness = deriveTerritoryReadiness({ view: ctx.view, geographyTree: tree });
  const constituencyLead = responsibilityFor(GEOGRAPHY_LEVEL.CONSTITUENCY, territory.constituency);

  return (
    <div>
      <Label>{office?.name ?? territory.office} · {state?.name ?? territory.state}</Label>
      <Panel>
        <div style={{ fontFamily: UI, fontWeight: 800, fontSize: 16, color: IVORY, marginBottom: 4 }}>{tree.constituency.name}</div>
        <div style={{ fontFamily: UI, fontSize: 11.5, color: MUTED, marginBottom: 18 }}>
          {territory.election} · {tree.lgas.length} LGA{tree.lgas.length === 1 ? "" : "s"} · Constituency Lead:{" "}
          {constituencyLead ? personFor(constituencyLead.person) : "unassigned"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 18 }}>
          <div>
            <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>LGA coordinators</div>
            <PercentBar assigned={readiness.lgaCoverage.assigned} total={readiness.lgaCoverage.totalLgas} percent={readiness.lgaCoverage.percent} note={readiness.lgaCoverage.note} />
          </div>
          <div>
            <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ward coordinators</div>
            <PercentBar assigned={readiness.wardCoverage.assigned} total={readiness.wardCoverage.totalWards} percent={readiness.wardCoverage.percent} note={readiness.wardCoverage.note} />
          </div>
          <div>
            <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Polling-unit agents</div>
            <PercentBar assigned={readiness.pollingUnitCoverage.assigned} total={readiness.pollingUnitCoverage.totalPollingUnits} percent={readiness.pollingUnitCoverage.percent} note={readiness.pollingUnitCoverage.note} />
          </div>
        </div>
      </Panel>

      {!constituencyLead && (
        <div style={{ marginTop: 18 }}>
          <AssignPanel title="Assign Constituency Lead" level={GEOGRAPHY_LEVEL.CONSTITUENCY}
            geographyRef={{ value: territory.constituency, label: tree.constituency.name }}
            roster={roster} geographyTree={tree} campaignId={campaignId} refresh={refresh} />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Label>Local Government Areas</Label>
        <Panel>
          {tree.lgas.map((lga) => {
            const resp = responsibilityFor(GEOGRAPHY_LEVEL.LGA, lga.id);
            const expanded = expandedLga === lga.id;
            const wardsForLga = tree.wards.filter((w) => w.lga_id === lga.id);
            return (
              <div key={lga.id} style={{ borderBottom: `1px solid ${BORDER}`, padding: "12px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => setExpandedLga(expanded ? null : lga.id)}>
                  <div>
                    <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 13, color: IVORY }}>{expanded ? "▾" : "▸"} {lga.name}</div>
                    <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginTop: 2 }}>
                      Coordinator: {resp ? personFor(resp.person) : "unassigned"}
                    </div>
                  </div>
                  <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
                    color: resp ? TEAL : PINK, border: `1px solid ${resp ? TEAL : PINK}`, padding: "3px 8px" }}>
                    {resp ? resp.status : "unassigned"}
                  </span>
                </div>
                {expanded && (
                  <div style={{ marginLeft: 20, marginTop: 10 }}>
                    {!resp && (
                      <div style={{ marginBottom: 14 }}>
                        <AssignPanel title={`Assign ${lga.name} LGA Coordinator`} level={GEOGRAPHY_LEVEL.LGA}
                          geographyRef={{ value: lga.id, label: lga.name }} accent={AMBER}
                          roster={roster} geographyTree={tree} campaignId={campaignId} refresh={refresh} />
                      </div>
                    )}
                    {wardsForLga.length === 0 ? (
                      <div style={{ fontFamily: UI, fontSize: 11.5, color: MUTED }}>
                        No wards imported yet for {lga.name} — see supabase/geography-import/README.md.
                      </div>
                    ) : (
                      wardsForLga.map((ward) => {
                        const wardExpanded = expandedWard === ward.id;
                        const pusForWard = pollingUnitsByWard[ward.id];
                        return (
                          <div key={ward.id} style={{ marginBottom: 10 }}>
                            <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, color: IVORY, cursor: "pointer" }}
                              onClick={() => toggleWard(ward.id)}>
                              {wardExpanded ? "▾" : "▸"} {ward.name}
                            </div>
                            {wardExpanded && (
                              pollingUnitsLoading === ward.id ? (
                                <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginLeft: 14 }}>Loading polling units…</div>
                              ) : !pusForWard || pusForWard.length === 0 ? (
                                <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginLeft: 14 }}>
                                  No polling units imported yet for this ward.
                                </div>
                              ) : (
                                pusForWard.map((pu) => (
                                  <div key={pu.id} style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginLeft: 14 }}>
                                    {pu.code}{pu.name ? ` — ${pu.name}` : ""}
                                  </div>
                                ))
                              )
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      </div>

      {readiness.gaps.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Label>What isn't covered ({readiness.gaps.length})</Label>
          <Panel accent={PINK}>
            {readiness.gaps.map((g, i) => <GapRow key={i} gap={g} />)}
          </Panel>
        </div>
      )}
    </div>
  );
}
