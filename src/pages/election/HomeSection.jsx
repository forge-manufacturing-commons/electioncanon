// ============================================================
// ELECTION FORGE — HOME  (Alpha 1.0 command centre)
//
// Replaces the old DashboardSection. Every metric below is either read
// straight off the Canon (readiness, mobilization, election day — all
// folded from real events) or explicitly reads "No data yet" — never a
// fabricated number. Communications/Campaign Studio summaries make one
// additional lightweight read each (chat unread counts, studio asset
// counts) since those live outside the event-sourced Canon (see
// chat/api.js and design/assets.js's own headers for why).
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import * as chatApi from "../../domains/election/chat/api.js";
import * as assetsApi from "../../domains/election/design/assets.js";
import { ACTOR_KIND } from "../../os/electionContext.js";
import { READINESS_DIMENSION_STATUS as STATUS } from "../../domains/election/studio/readiness.js";
import { TASK_STATUS, ASSIGNMENT_STATUS } from "../../domains/election/mobilization/write.js";
import { VERIFICATION_STATUS, INCIDENT_STATUS } from "../../domains/election/electionDay/write.js";
import { FORGE_CLIPS } from "../../os/geometry.js";
import { computeAttention } from "./attention.js";
import { Label, Panel, linkBtn, UI, DISPLAY, IVORY, MUTED, TEAL, AMBER, PINK, BLACK } from "./shared.jsx";

const TONE_COLOR = { danger: PINK, warning: AMBER };

const NEXT_ACTION_BY_DIMENSION = Object.freeze({
  CANDIDATE_REGISTERED: "Complete candidate registration.",
  WARD_ASSIGNMENT: "Prepare your first ward.",
  WARD_STATUS_HEALTH: "Report a ward's current status.",
  OBSERVER_ASSIGNMENT: "Assign your first observer.",
});

function SummaryCard({ label, accent, children, onOpen, openLabel }) {
  return (
    <div>
      <Label>{label}</Label>
      <Panel accent={accent}>
        {children}
        {onOpen && <button onClick={onOpen} style={{ ...linkBtn(), marginTop: 12 }}>{openLabel} →</button>}
      </Panel>
    </div>
  );
}

// CAMPAIGN ONBOARDING PASS — geography name lookups for MyScopeCard. One
// targeted single-row query per level (mirrors acceptInvitation()'s own
// lazy, single-row polling-unit lookup) — never an eager constituency-wide
// fetch just to show one coordinator their own territory's name.
const GEOGRAPHY_LOOKUP = Object.freeze({
  lga: { table: "geography_lgas", select: "id, name" },
  ward: { table: "geography_wards", select: "id, name" },
  polling_unit: { table: "geography_polling_units", select: "id, name, code" },
});

const RESPONSIBILITY_ROLE_LABEL = Object.freeze({
  CONSTITUENCY_LEAD: "Constituency Lead", LGA_COORDINATOR: "LGA Coordinator",
  WARD_COORDINATOR: "Ward Coordinator", POLLING_UNIT_AGENT: "Polling Unit Agent",
});

function MyScopeCard({ campaignId, userId, responsibility, onOpenChat }) {
  const [geographyName, setGeographyName] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const lookup = GEOGRAPHY_LOOKUP[responsibility.level];
    if (!lookup || !responsibility.geographyRef) { setGeographyName(null); return; }
    (async () => {
      const { data } = await supabase.from(lookup.table).select(lookup.select).eq("id", responsibility.geographyRef).maybeSingle();
      if (!cancelled) setGeographyName(data?.name ?? data?.code ?? null);
    })();
    return () => { cancelled = true; };
  }, [responsibility.level, responsibility.geographyRef]);

  const roleLabel = RESPONSIBILITY_ROLE_LABEL[responsibility.responsibilityRole] ?? "Coordinator";
  const levelLabel = { lga: "LGA", ward: "Ward", polling_unit: "Polling Unit" }[responsibility.level] ?? responsibility.level;

  const openChat = async () => {
    setOpening(true);
    await chatApi.ensureGeographyRoom({
      client: supabase, userId, campaignId, level: responsibility.level, geographyRef: responsibility.geographyRef,
      name: `${geographyName ?? levelLabel} Coordination`,
    });
    setOpening(false);
    onOpenChat();
  };

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <Label>Your scope</Label>
      <Panel accent={TEAL}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(18px,2.4vw,24px)", color: IVORY, marginBottom: 6 }}>
          {roleLabel}{geographyName ? ` — ${geographyName}` : ""}
        </div>
        <div style={{ fontFamily: UI, fontSize: 12, color: MUTED, marginBottom: 14 }}>
          {levelLabel} · status: {responsibility.status ?? "ASSIGNED"} · training: {responsibility.trainingStatus ?? "NOT_STARTED"}
        </div>
        <button onClick={openChat} disabled={opening}
          style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.12em",
            textTransform: "uppercase", padding: "12px 20px", border: "none", background: TEAL,
            color: BLACK, cursor: opening ? "default" : "pointer", clipPath: FORGE_CLIPS.button, opacity: opening ? 0.6 : 1 }}>
          {opening ? "Opening…" : `Open ${levelLabel} Coordination Chat →`}
        </button>
      </Panel>
    </div>
  );
}

export default function HomeSection({ ctx, onSection, workspaceName }) {
  const [commsSummary, setCommsSummary] = useState(null);
  const [studioSummary, setStudioSummary] = useState(null);
  const [myUserId, setMyUserId] = useState(null);

  const campaignId = ctx?.scope?.campaignId;

  useEffect(() => {
    let cancelled = false;
    if (!campaignId) return;
    (async () => {
      const { rooms } = await chatApi.listRooms({ client: supabase, campaignId });
      if (cancelled) return;
      if (!rooms.length) { setCommsSummary({ unread: 0, rooms: 0 }); return; }
      const authUser = (await supabase.auth.getUser()).data?.user?.id;
      const { counts } = await chatApi.getUnreadCounts({ client: supabase, userId: authUser, rooms });
      if (cancelled) return;
      setCommsSummary({ unread: Object.values(counts).reduce((a, b) => a + b, 0), rooms: rooms.length });
    })();
    (async () => {
      const { assets } = await assetsApi.listAssets({ client: supabase, campaignId });
      if (cancelled) return;
      setStudioSummary({
        drafts: assets.filter((a) => a.status === "draft").length,
        published: assets.filter((a) => a.status === "published").length,
        scheduled: assets.filter((a) => a.status === "scheduled").length,
      });
    })();
    (async () => {
      const authUser = (await supabase.auth.getUser()).data?.user?.id;
      if (!cancelled) setMyUserId(authUser ?? null);
    })();
    return () => { cancelled = true; };
  }, [campaignId]); // eslint-disable-line

  const view = ctx.view ?? {};
  const attention = computeAttention(view, ctx?.readiness?.gaps);
  const claims = ctx?.readiness?.claims ?? [];
  const complete = claims.filter((c) => c.status === STATUS.COMPLETE).length;
  const nextClaim = claims.find((c) => c.status !== STATUS.COMPLETE);
  const nextAction = nextClaim ? (NEXT_ACTION_BY_DIMENSION[nextClaim.dimension] ?? "Review your readiness gaps.") : null;

  // CAMPAIGN ONBOARDING PASS — "My Scope" is shown only to an LGA/Ward/PU
  // Coordinator (someone who accepted a geography-scoped invitation).
  // Owner/manager and a Constituency Lead keep today's full-campaign Home
  // unchanged: a Constituency Lead's own scope already IS the whole
  // campaign's territory under the current single-constituency model, so a
  // separate scoped view would just duplicate this same page.
  const myPersonRef = campaignId && myUserId ? `invite:${campaignId}:${myUserId}` : null;
  const myResponsibility = myPersonRef
    ? Object.values(view.responsibilities ?? {}).find((r) => r.person === myPersonRef
        && r.responsibilityRole && r.responsibilityRole !== "CONSTITUENCY_LEAD")
    : null;

  const people = Object.values(view.people ?? {});
  const wards = Object.values(view.wards ?? {});
  const assignments = Object.values(view.assignments ?? {});
  const outstandingAssignments = assignments.filter((a) => a.status !== ASSIGNMENT_STATUS.COMPLETE).length;
  const tasks = Object.values(view.tasks ?? {});
  const openTasks = tasks.filter((t) => t.status !== TASK_STATUS.COMPLETE).length;

  const pollingUnits = Object.values(view.pollingUnits ?? {});
  const agents = Object.values(view.agents ?? {});
  const results = Object.values(view.results ?? {});
  const verifiedResults = results.filter((r) => r.verificationStatus === VERIFICATION_STATUS.VERIFIED).length;
  const incidents = Object.values(view.incidents ?? {});
  const openIncidents = incidents.filter((i) => i.status !== INCIDENT_STATUS.RESOLVED && i.status !== INCIDENT_STATUS.CLOSED).length;
  const simulationStatus = pollingUnits.length === 0 ? "Not started" : agents.length === 0 ? "Polling units configured" : "Agents assigned";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <Label>Your election</Label>
        <Panel accent={TEAL}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(20px,2.6vw,28px)", color: IVORY, marginBottom: 6 }}>
            {workspaceName || "Your election workspace"}
          </div>
          <div style={{ fontFamily: UI, fontSize: 12, color: MUTED, marginBottom: 16 }}>
            {ctx?.actorKind === ACTOR_KIND.OBSERVER_ORGANISATION ? "Observer / monitoring organisation" : "Candidate campaign"} · operating status: active
          </div>
          {nextAction ? (
            <>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em",
                textTransform: "uppercase", color: AMBER, marginBottom: 6 }}>What to do next</div>
              <div style={{ fontFamily: UI, fontSize: 14, color: IVORY, marginBottom: 14 }}>{nextAction}</div>
              <button onClick={() => onSection("readiness")}
                style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.12em",
                  textTransform: "uppercase", padding: "12px 20px", border: "none", background: TEAL,
                  color: BLACK, cursor: "pointer", clipPath: FORGE_CLIPS.button }}>
                Continue Preparation →
              </button>
            </>
          ) : claims.length > 0 ? (
            <div style={{ fontFamily: UI, fontSize: 13, color: TEAL }}>
              Every tracked readiness dimension is COMPLETE. Check Election Day for the next step.
            </div>
          ) : null}
        </Panel>
      </div>

      {myResponsibility && (
        <MyScopeCard campaignId={campaignId} userId={myUserId} responsibility={myResponsibility} onOpenChat={() => onSection("chat")} />
      )}

      <div style={{ gridColumn: "1 / -1" }}>
        <Label>What needs attention today</Label>
        <Panel accent={attention.alerts.length ? PINK : TEAL}>
          {attention.alerts.length === 0 ? (
            <div style={{ fontFamily: UI, fontSize: 13, color: TEAL }}>
              Nothing needs attention right now — every tracked ward, assignment, task and incident is in a healthy state.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {attention.alerts.slice(0, 6).map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: TONE_COLOR[a.tone] ?? AMBER, marginTop: 6, flexShrink: 0 }} />
                  <span style={{ fontFamily: UI, fontSize: 12.5, color: IVORY }}>{a.text}</span>
                </div>
              ))}
              {attention.alerts.length > 6 && (
                <div style={{ fontFamily: UI, fontSize: 11, color: MUTED }}>+{attention.alerts.length - 6} more — see Intelligence for the full list.</div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <SummaryCard label="Readiness" accent={TEAL} onOpen={() => onSection("readiness")} openLabel="Open Readiness">
        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 30, color: IVORY }}>
          {claims.length ? `${complete} / ${claims.length}` : "No data yet"}
        </div>
        <div style={{ fontFamily: UI, fontSize: 11.5, color: MUTED, marginTop: 6 }}>tracked dimensions complete</div>
      </SummaryCard>

      <SummaryCard label="Mobilization" accent={PINK} onOpen={() => onSection("mobilize")} openLabel="Open Mobilize">
        <div style={{ fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 1.9 }}>
          {people.length} people · {wards.length} ward{wards.length === 1 ? "" : "s"}<br />
          {outstandingAssignments} outstanding assignment{outstandingAssignments === 1 ? "" : "s"} · {openTasks} open task{openTasks === 1 ? "" : "s"}
        </div>
      </SummaryCard>

      <SummaryCard label="Communications" accent={AMBER} onOpen={() => onSection("chat")} openLabel="Open Chat">
        {commsSummary === null ? (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: MUTED }}>No data yet</div>
        ) : (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 1.9 }}>
            {commsSummary.unread} unread message{commsSummary.unread === 1 ? "" : "s"}<br />
            {commsSummary.rooms} active coordination room{commsSummary.rooms === 1 ? "" : "s"}
          </div>
        )}
      </SummaryCard>

      <SummaryCard label="Campaign Studio" accent={PINK} onOpen={() => onSection("studio")} openLabel="Open Studio">
        {studioSummary === null ? (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: MUTED }}>No data yet</div>
        ) : (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 1.9 }}>
            {studioSummary.drafts} draft{studioSummary.drafts === 1 ? "" : "s"} · {studioSummary.published} published · {studioSummary.scheduled} scheduled
          </div>
        )}
      </SummaryCard>

      <SummaryCard label="Election Day" accent={AMBER} onOpen={() => onSection("election-day")} openLabel="Open Election Day">
        <div style={{ fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 1.9 }}>
          Simulation status: {simulationStatus}<br />
          {pollingUnits.length} polling unit{pollingUnits.length === 1 ? "" : "s"} · {agents.length} agent{agents.length === 1 ? "" : "s"}<br />
          {verifiedResults} / {results.length} results verified · {openIncidents} open incident{openIncidents === 1 ? "" : "s"}
        </div>
      </SummaryCard>
    </div>
  );
}
