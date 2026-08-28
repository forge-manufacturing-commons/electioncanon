// ============================================================
// FORGE ELECTION — WEB SURFACE  (Alpha 1.0)
//
// ELECTION FORGE IS A SINGULAR PRODUCT. A person using this page should
// never need to know Business Forge, Manufacturing Forge, or "Forge
// Platform" exist — App.jsx suppresses the shared kernel chrome
// (InstRail/OSRail/RoomLocator/footer) on every `/election*` path for
// exactly this reason; this file supplies its own header and section nav
// in their place.
//
// THE VALIDATED CANON PATH IS UNCHANGED. `readElectionCanon`,
// `activateElection`, `prepareElectionWrite`, `approveElectionWrite` are
// called exactly as before — this file does not touch electionWebAdapter.js's
// existing exports, electionContext.js, electionScope.js,
// electionBootstrap.js, any migration, or any pre-existing Election
// domain/events/projections file's existing behavior.
//
// ALPHA 1.0 restructures the product shell around that unchanged Canon:
// shared atoms (Label/Panel/StatusChip/WriteActionPanel/ForgeHeader/...)
// moved to ./election/shared.jsx so the new Mobilize/Chat/Campaign
// Studio/Election Day/Intelligence sections can reuse them; those five
// sections plus Home (replacing the old Dashboard) live in ./election/ as
// their own files. Mobilization and Election Day read/write through NEW
// event types folded by the SAME projectElection() (see
// src/domains/election/events.js's own header for why no migration was
// needed for them); Chat and Campaign Studio read/write through two new,
// RLS-protected tables (see the Alpha 1.0 migration).
//
// CANON HONESTY, PRESERVED EXACTLY. UNKNOWN/INCOMPLETE/AT_RISK/COMPLETE —
// deriveReadiness()'s own four words — are still rendered as exactly those
// four words, never translated into a percentage or a colour-only signal.
// ============================================================

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isConfigured } from "../lib/supabase.js";
import { useIdentity } from "../os/ForgeIdentity.jsx";
import { FORGE_CLIPS } from "../os/geometry.js";
import { normalizeUrl } from "../lib/urlNormalize.js";
import {
  readElectionCanon, activateElection, prepareElectionWrite, approveElectionWrite, WRITE_CHANNEL,
} from "../os/electionWebAdapter.js";
import { ACTIVATION, ACTOR_KIND } from "../os/electionContext.js";
import { ELECTION_SCOPE } from "../os/electionScope.js";
import { READINESS_DIMENSION_STATUS as STATUS } from "../domains/election/studio/readiness.js";
import {
  ForgeHeader, WriteActionPanel, Label, Panel, ClaimRow, GapRow, NotStartedRow,
  friendlyError, UI, DISPLAY, BLACK, IVORY, TEAL, AMBER, PINK, MUTED, BORDER,
} from "./election/shared.jsx";
import HomeSection from "./election/HomeSection.jsx";
import MobilizeSection from "./election/MobilizeSection.jsx";
import ChatSection from "./election/ChatSection.jsx";
import CampaignStudioSection from "./election/CampaignStudioSection.jsx";
import ElectionDaySection from "./election/ElectionDaySection.jsx";
import IntelligenceSection from "./election/IntelligenceSection.jsx";

/** Only these four words, ever, for a REAL Canon claim — the exact vocabulary deriveReadiness() uses. */
const STATUS_COLOR = Object.freeze({
  [STATUS.COMPLETE]: TEAL, [STATUS.INCOMPLETE]: MUTED, [STATUS.AT_RISK]: PINK, [STATUS.UNKNOWN]: AMBER,
});

// ============================================================
// WELCOME / ONBOARDING — the front door. A welcome screen that states
// plainly what ElectionCanon does today, then a setup step that leads
// straight into the SAME, unchanged activateElection() call the rest of
// this file already uses — no new backend path, no manufactured record.
//
// ACTOR-KIND CHOICE IS REAL, NOT INVENTED. Only the two actor kinds with a
// real, live readiness engine (candidate_campaign, observer_organisation —
// see electionContext.js's own `deriveFor` routing) are offered.
//
// ELECTION TYPE IS NOT A CANON FACT. `campaigns` has no election-type
// column — the selection here is folded into the free-text workspace name
// the existing `campaigns.name` field already safely holds.
const ACTOR_CHOICES = Object.freeze([
  { kind: ACTOR_KIND.CANDIDATE_CAMPAIGN, label: "Candidate / Candidate Campaign",
    note: "Track your own registration, ward coverage and campaign preparation." },
  { kind: ACTOR_KIND.OBSERVER_ORGANISATION, label: "Observer / Monitoring Organisation",
    note: "Track observer deployment and coverage across your assignment area." },
]);

const ELECTION_TYPES = Object.freeze([
  "Presidential", "Senatorial", "House of Representatives", "Governorship", "State House of Assembly",
]);

// ALPHA 1.4 — the SINGLE source of truth for "what's real today" copy,
// used by BOTH the post-signup Welcome screen and the signed-out public
// landing page, so the two can never drift into contradicting each other
// again (the landing page previously still said "no OCR is connected
// yet" while this exact list, one screen later, already said otherwise).
const CAPABILITIES_AVAILABLE_NOW = Object.freeze([
  "Election readiness (COMPLETE / INCOMPLETE / AT RISK / UNKNOWN — never a fabricated percentage)",
  "Campaign / workspace setup",
  "Mobilization — people, roles, wards, polling units, assignments, tasks",
  "Coverage by state / LGA / ward, computed from real agent assignments",
  "Coordination chat, including contextual references to a polling unit, incident, result, or task",
  "Campaign Studio — 21 templates, save/edit, client-side PNG export",
  "Ask ElectionCanon — 15+ operational questions answered from your own campaign's real data",
  "Election-day simulation — polling units, agents, result capture, incident reporting",
  "Result-sheet photo evidence capture (private, tenant-isolated storage)",
  "OCR-assisted result extraction (English, client-side) with mandatory human review",
  "Human confirm / correct / dispute workflow, with the original OCR reading always preserved",
  "Low-bandwidth image compression before upload",
]);
const CAPABILITIES_COMING_NEXT = Object.freeze([
  "Voice operation (architecture ready; a Google Cloud Speech-to-Text profile is registered but not configured with a live key in any deployment yet)",
  "Multilingual conversational realisation (Hausa/Yoruba/Igbo/Pidgin/Urhobo — detection exists; every language pack is unreviewed and unapproved for production)",
  "Chat-app channel (e.g. WhatsApp) — documented contract, no live transport",
  "Official election-result integration — Election Day remains explicitly simulated data",
  "Invite-only chat rooms (currently open to any active campaign member)",
]);

function ChoiceButton({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: "block", width: "100%", textAlign: "left", fontFamily: UI,
        padding: "12px 14px", marginBottom: 8, cursor: "pointer",
        background: active ? "rgba(10,180,160,0.12)" : BLACK,
        border: `1px solid ${active ? TEAL : BORDER}`, color: IVORY, clipPath: FORGE_CLIPS.buttonSm }}>
      {children}
    </button>
  );
}

function WelcomeOnboarding({ onActivate, busy, error }) {
  const [step, setStep] = useState("welcome"); // "welcome" | "setup"
  const [actorKind, setActorKind] = useState(ACTOR_KIND.CANDIDATE_CAMPAIGN);
  const [electionType, setElectionType] = useState(null);
  const [name, setName] = useState("");

  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    const finalName = electionType ? `[${electionType}] ${clean}` : clean;
    onActivate(finalName, actorKind);
  };

  if (step === "welcome") {
    return (
      <div style={{ maxWidth: 720 }}>
        <Label>Welcome</Label>
        <Panel accent={AMBER}>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(24px,3.4vw,34px)",
            letterSpacing: "-0.03em", lineHeight: 1.15, margin: "0 0 14px", color: IVORY }}>
            ElectionCanon
          </h1>
          <p style={{ fontFamily: UI, fontSize: 13.5, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
            ElectionCanon is an operating system for preparing, coordinating and safeguarding
            democratic elections — candidate readiness, mobilizing your people, coordinating
            through chat, producing campaign materials, and a simulated election day with
            result capture and incident reporting.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14, marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em",
                textTransform: "uppercase", color: TEAL, marginBottom: 8 }}>Available now</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 1.9 }}>
                {CAPABILITIES_AVAILABLE_NOW.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
            <div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, letterSpacing: "0.14em",
                textTransform: "uppercase", color: AMBER, marginBottom: 8 }}>Coming next</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: UI, fontSize: 12.5, color: MUTED, lineHeight: 1.9 }}>
                {CAPABILITIES_COMING_NEXT.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          </div>
          <button onClick={() => setStep("setup")}
            style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, letterSpacing: "0.12em",
              textTransform: "uppercase", padding: "13px 24px", border: "none",
              background: AMBER, color: BLACK, cursor: "pointer", clipPath: FORGE_CLIPS.button }}>
            Get Started →
          </button>
        </Panel>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <Label>Set up your election workspace</Label>
      <Panel accent={AMBER}>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.14em",
          textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>What are you preparing for?</div>
        {ACTOR_CHOICES.map((c) => (
          <ChoiceButton key={c.kind} active={actorKind === c.kind} onClick={() => setActorKind(c.kind)}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>{c.note}</div>
          </ChoiceButton>
        ))}

        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.14em",
          textTransform: "uppercase", color: TEAL, margin: "18px 0 10px" }}>
          What election are you preparing for? <span style={{ color: MUTED, textTransform: "none", letterSpacing: 0 }}>(optional)</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {ELECTION_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setElectionType(electionType === t ? null : t)}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, padding: "8px 14px", cursor: "pointer",
                background: electionType === t ? "rgba(10,180,160,0.12)" : BLACK,
                border: `1px solid ${electionType === t ? TEAL : BORDER}`, color: IVORY,
                clipPath: FORGE_CLIPS.buttonSm }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>
          ElectionCanon does not yet track election level as its own Canon fact — this becomes part
          of your workspace name below, which the Canon does record.
        </div>

        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.14em",
          textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>Workspace name</div>
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ada for LG Chair, Ward 7" aria-label="Workspace name"
          style={{ width: "100%", boxSizing: "border-box", fontFamily: UI, fontSize: 13,
            padding: "11px 13px", background: BLACK, color: IVORY,
            border: `1px solid ${BORDER}`, outline: "none", marginBottom: 16 }} />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={submit} disabled={busy || !name.trim()}
            style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", padding: "13px 22px", border: "none",
              background: busy || !name.trim() ? BORDER : AMBER, color: busy || !name.trim() ? MUTED : BLACK,
              cursor: busy || !name.trim() ? "not-allowed" : "pointer", clipPath: FORGE_CLIPS.button }}>
            {busy ? "Creating…" : "Create My Election Workspace →"}
          </button>
          <button onClick={() => setStep("welcome")} disabled={busy}
            style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.12em",
              textTransform: "uppercase", padding: "13px 18px", cursor: busy ? "not-allowed" : "pointer",
              background: "transparent", color: MUTED, border: `1px solid ${BORDER}`, clipPath: FORGE_CLIPS.button }}>
            ← Back
          </button>
        </div>
        {error && <div style={{ fontFamily: UI, fontSize: 12.5, color: PINK, marginTop: 14 }}>{friendlyError(error)}</div>}
      </Panel>
    </div>
  );
}

const SCOPE_MESSAGE = Object.freeze({
  [ELECTION_SCOPE.NONE]: null, // handled by WelcomeOnboarding instead
  [ELECTION_SCOPE.AMBIGUOUS]: "You belong to more than one campaign — this screen does not yet let you choose which.",
  [ELECTION_SCOPE.REFUSED]: "That campaign is not accessible to this account.",
  [ELECTION_SCOPE.READ_FAILED]: "Campaign membership could not be read right now.",
});

/** A real, computed count — not a formal Canon readiness claim (no
 *  COMPLETE/INCOMPLETE status), but not fabricated either: exactly the
 *  same folded view Mobilize/Election Day themselves render. Used for the
 *  Alpha 1.1 readiness areas that now have real cross-section data
 *  (Mobilization, Wards, Polling Units, Agents, Communications, Evidence)
 *  but no `deriveReadiness()` dimension of their own yet. */
function CountRow({ label, note }) {
  return (
    <div style={{ padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 11.5, color: IVORY, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: UI, fontSize: 11.5, color: MUTED, marginTop: 2 }}>{note}</div>
    </div>
  );
}

/** Readiness — the same claims/gaps the Canon actually computes, organised
 *  into the 10 practical election areas Alpha 1.1 asks for. A claim area
 *  renders ClaimRow (a real Canon dimension), a data area renders CountRow
 *  (real cross-section data, no formal claim yet), and a genuinely empty
 *  area renders NotStartedRow — never a fabricated claim or score. */
function ReadinessSection({ ctx, campaignId, refresh }) {
  const byDim = Object.fromEntries(ctx.readiness.claims.map((c) => [c.dimension, c]));
  const view = ctx.view ?? {};
  const people = Object.values(view.people ?? {});
  const wards = Object.values(view.wards ?? {});
  const pollingUnits = Object.values(view.pollingUnits ?? {});
  const agents = Object.values(view.agents ?? {});
  const incidents = Object.values(view.incidents ?? {});
  const results = Object.values(view.results ?? {});

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
      <div>
        <Label>Readiness claims (CANON)</Label>
        <Panel>
          {ctx.readiness.claims.map((c, i) => <ClaimRow key={i} claim={c} statusColor={STATUS_COLOR} />)}
        </Panel>
      </div>

      <div>
        <Label>Known ward coverage</Label>
        <Panel accent={AMBER}>
          {ctx.readiness.knownWardCoverage ? (
            <>
              <div style={{ fontFamily: UI, fontSize: 13, color: IVORY }}>
                {ctx.readiness.knownWardCoverage.knownWards} known ·{" "}
                {ctx.readiness.knownWardCoverage.assignedWards} assigned ·{" "}
                {ctx.readiness.knownWardCoverage.healthyWards} healthy ·{" "}
                {ctx.readiness.knownWardCoverage.atRiskWards} at-risk ·{" "}
                {ctx.readiness.knownWardCoverage.unreportedWards} unreported
              </div>
              <div style={{ fontFamily: UI, fontSize: 11.5, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                {ctx.readiness.knownWardCoverage.note}
              </div>
            </>
          ) : (
            <div style={{ fontFamily: UI, fontSize: 12.5, color: MUTED }}>
              No ward coverage computed for this actor kind yet.
            </div>
          )}
        </Panel>
      </div>

      {ctx.readiness.gaps.length > 0 && (
        <div>
          <Label>Gaps (CANON-derived)</Label>
          <Panel accent={PINK}>
            {ctx.readiness.gaps.map((g, i) => <GapRow key={i} gap={g} />)}
          </Panel>
        </div>
      )}

      <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
        <Label>Readiness by area — the same Canon claims and folded data above, organised for campaign preparation</Label>
      </div>

      <div>
        <Label>1 · Candidate</Label>
        <Panel>
          {byDim.CANDIDATE_REGISTERED
            ? <ClaimRow claim={byDim.CANDIDATE_REGISTERED} statusColor={STATUS_COLOR} />
            : <NotStartedRow label="CANDIDATE_REGISTERED" note="No candidate registration recorded for this actor kind." />}
        </Panel>
      </div>

      <div>
        <Label>2 · Legal / documentation</Label>
        <Panel>
          <NotStartedRow label="REQUIRED_DOCUMENTS" note="Not yet tracked in Forge Election Canon." />
        </Panel>
      </div>

      <div>
        <Label>3 · Organisation</Label>
        <Panel>
          {byDim.OBSERVER_ASSIGNMENT
            ? <ClaimRow claim={byDim.OBSERVER_ASSIGNMENT} statusColor={STATUS_COLOR} />
            : <NotStartedRow label="AGENTS / OBSERVERS" note="Not yet tracked for this actor kind." />}
          <CountRow label="PEOPLE" note={people.length ? `${people.length} person${people.length === 1 ? "" : "s"} in the roster.` : "No people added yet — see Mobilize."} />
        </Panel>
      </div>

      <div>
        <Label>4 · Wards</Label>
        <Panel>
          {byDim.WARD_ASSIGNMENT
            ? <ClaimRow claim={byDim.WARD_ASSIGNMENT} statusColor={STATUS_COLOR} />
            : <NotStartedRow label="WARD_ASSIGNMENT" note="No ward assignment recorded yet." />}
          {byDim.WARD_STATUS_HEALTH
            ? <ClaimRow claim={byDim.WARD_STATUS_HEALTH} statusColor={STATUS_COLOR} />
            : <NotStartedRow label="WARD_STATUS_HEALTH" note="No ward status reported yet." />}
          <CountRow label="WARD_COVERAGE" note={wards.length ? `${wards.length} ward${wards.length === 1 ? "" : "s"} known · ${wards.filter((w) => w.organisation).length} with a coordinator.` : "No wards recorded yet."} />
        </Panel>
      </div>

      <div>
        <Label>5 · Polling units</Label>
        <Panel>
          <CountRow label="POLLING_UNITS" note={pollingUnits.length ? `${pollingUnits.length} polling unit${pollingUnits.length === 1 ? "" : "s"} configured. See Election Day.` : "Not yet tracked in Forge Election Canon — see Election Day."} />
        </Panel>
      </div>

      <div>
        <Label>6 · Agents</Label>
        <Panel>
          <CountRow label="AGENT_DEPLOYMENT" note={agents.length ? `${agents.length} agent${agents.length === 1 ? "" : "s"} assigned across polling units.` : "Not yet tracked in Forge Election Canon — see Election Day."} />
        </Panel>
      </div>

      <div>
        <Label>7 · Mobilization</Label>
        <Panel>
          <CountRow label="ASSIGNMENTS_AND_TASKS" note={`${Object.keys(view.assignments ?? {}).length} assignment(s) · ${Object.keys(view.tasks ?? {}).length} task(s) recorded. See Mobilize.`} />
        </Panel>
      </div>

      <div>
        <Label>8 · Communications</Label>
        <Panel>
          <NotStartedRow label="COORDINATION_CHANNELS" note="Room/message counts are shown live on Home and in Chat — not yet a formal Canon readiness dimension." />
        </Panel>
      </div>

      <div>
        <Label>9 · Election day</Label>
        <Panel>
          <NotStartedRow label="ESCALATION_CONTACTS" note="Not yet tracked in Forge Election Canon." />
          <CountRow label="RESULT_CAPTURE" note={results.length ? `${results.length} simulated result(s) captured. See Election Day.` : "No results captured yet."} />
        </Panel>
      </div>

      <div>
        <Label>10 · Evidence / incident preparedness</Label>
        <Panel>
          <NotStartedRow label="CAMPAIGN_DOCUMENTS" note="Not yet tracked in Forge Election Canon." />
          <CountRow label="INCIDENT_LOG" note={incidents.length ? `${incidents.length} incident(s) logged, ${incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "CLOSED").length} unresolved.` : "No incidents logged yet — see Election Day."} />
        </Panel>
      </div>

      <div style={{ gridColumn: "1 / -1" }}>
        <WriteActionPanel campaignId={campaignId} refresh={refresh} />
      </div>
    </div>
  );
}

function SettingsSection({ ctx, workspaceName }) {
  return (
    <Panel>
      <div style={{ fontFamily: UI, fontSize: 12.5, color: IVORY, lineHeight: 2 }}>
        Workspace name: <span style={{ color: TEAL }}>{workspaceName ?? "—"}</span><br />
        Campaign ID: <span style={{ color: TEAL }}>{ctx?.scope?.campaignId ?? "—"}</span><br />
        Actor kind: <span style={{ color: TEAL }}>{ctx?.actorKind ?? "unknown"}</span><br />
        Membership role: <span style={{ color: TEAL }}>{ctx?.scope?.role ?? "—"}</span>
      </div>
    </Panel>
  );
}

/** Per-section browser tab title — see the title-management effect below. */
const TITLE_BY_SECTION = Object.freeze({
  home: "Home", readiness: "Readiness", mobilize: "Mobilization", chat: "Chat",
  studio: "Campaign Studio", "election-day": "Election Day", intelligence: "Intelligence", settings: "Settings",
});

export default function Election() {
  const nav = useNavigate();
  const { configured, loading: identityLoading, session, signOut } = useIdentity();

  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [activateError, setActivateError] = useState(null);
  const [section, setSection] = useState("home");
  const [workspaceName, setWorkspaceName] = useState(null);

  useEffect(() => { normalizeUrl(); }, []);

  // BROWSER TITLE — scoped to this page only. index.html's own <title> stays
  // "Forge-A-Truck-Thon — NAWEDOAM" for every OTHER route; this overrides it
  // only while ElectionCanon is mounted, and restores the original on
  // unmount so navigating to a manufacturing room never shows a stale
  // ElectionCanon title.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `ElectionCanon — ${TITLE_BY_SECTION[section] ?? "Election Operating System"}`;
    return () => { document.title = previousTitle; };
  }, [section]);

  // THE ONE READ PATH. Every render of Canon/readiness on this page comes
  // from calling this function again — never from mutating `ctx` in place.
  const refresh = useCallback(async () => {
    if (!session?.user) return;
    setCtxLoading(true);
    const result = await readElectionCanon({ client: supabase });
    setCtx(result);
    // The campaign's own workspace name (`campaigns.name`, what the user
    // actually typed at setup). A SECOND, additive read — never a second
    // scope decision — of a column the SAME "campaigns read own
    // membership" RLS policy already exposes to any active member.
    if (result?.scope?.campaignId) {
      const { data } = await supabase.from("campaigns").select("name")
        .eq("id", result.scope.campaignId).maybeSingle();
      setWorkspaceName(data?.name ?? null);
    } else {
      setWorkspaceName(null);
    }
    setCtxLoading(false);
  }, [session?.user]);

  useEffect(() => { refresh(); }, [refresh]);

  const doActivate = useCallback(async (name, actorKind) => {
    setActivateBusy(true); setActivateError(null);
    const result = await activateElection({ client: supabase, name, actorKind });
    setActivateBusy(false);
    if (result.outcome !== ACTIVATION.CREATED && result.outcome !== ACTIVATION.ALREADY_MEMBER) {
      setActivateError(result.error ?? `could not activate: ${result.outcome}`);
      return;
    }
    await refresh();
  }, [refresh]);

  const shell = (inner) => (
    <div className="forge-brand" style={{ background: BLACK, color: IVORY, minHeight: "100vh",
      padding: "clamp(28px,5vw,60px)", fontFamily: UI }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>{inner}</div>
    </div>
  );

  if (!configured) {
    return shell(
      <>
        <ForgeHeader section={section} onSection={setSection} />
        <Panel accent={PINK}>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 28, letterSpacing: "-0.03em", margin: "0 0 10px" }}>
            ElectionCanon unavailable
          </h1>
          <p style={{ color: "rgba(245,241,233,.75)", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            This deployment has no database credentials, so there is no Election Canon to show.
          </p>
        </Panel>
      </>
    );
  }

  if (identityLoading) return shell(<div style={{ color: MUTED, fontSize: 13 }}>Resolving identity…</div>);

  if (!session) {
    // ALPHA 1.1 — a real public landing page for the unauthenticated state,
    // replacing the bare "Not signed in" block. Answers the questions a
    // first-time visitor actually has, in plain language, with no party or
    // candidate alignment anywhere in the copy — ElectionCanon is
    // infrastructure any accountable campaign or observer organisation can
    // run, not an endorsement of any of them.
    const registerCta = (
      <button onClick={() => nav("/access")} style={{ fontFamily: UI, fontWeight: 700,
        fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", padding: "13px 24px",
        border: "none", background: AMBER, color: BLACK, cursor: "pointer", clipPath: FORGE_CLIPS.button }}>
        Register or sign in →
      </button>
    );
    const landingPanel = (title, body, accent = TEAL) => (
      <Panel accent={accent}>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.12em",
          textTransform: "uppercase", color: accent, marginBottom: 10 }}>{title}</div>
        <div style={{ fontFamily: UI, fontSize: 13.5, color: "rgba(245,241,233,.82)", lineHeight: 1.7 }}>{body}</div>
      </Panel>
    );
    return shell(
      <>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.22em",
          textTransform: "uppercase", color: TEAL, borderLeft: `2px solid ${PINK}`,
          paddingLeft: 12, marginBottom: 18 }}>ElectionCanon</div>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.14em",
          textTransform: "uppercase", color: MUTED, marginBottom: 10 }}>Not signed in</div>
        <h1 style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(26px,3.6vw,40px)",
          letterSpacing: "-0.03em", margin: "0 0 12px" }}>An accountable operating system for running an election campaign</h1>
        <p style={{ color: "rgba(245,241,233,.72)", fontSize: 15, maxWidth: 640, lineHeight: 1.6, marginBottom: 22 }}>
          ElectionCanon attributes every campaign action — every readiness claim, every
          assignment, every captured result — to an accountable actor and an immutable
          event log. It does not run for any party, and it does not run against any
          party: it is neutral infrastructure any campaign or observer organisation can
          operate on its own terms.
        </p>
        <div style={{ marginBottom: 36 }}>{registerCta}</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18, marginBottom: 20 }}>
          {landingPanel("What is ElectionCanon", "An open-source coordination platform for running a campaign: readiness "
            + "tracking, mobilization of people across wards and polling units, coordination chat, campaign "
            + "communications, and an election-day evidence record — all built on one event log that every "
            + "screen reads from, so nothing is ever out of sync.", TEAL)}
          {landingPanel("Who it is for", "Candidate campaigns at any level (national, state, or constituency), observer "
            + "and election-monitoring organisations, and the coordinators, polling-unit agents, and volunteers "
            + "they work with — each represented as an accountable actor, not an anonymous login.", AMBER)}
          {landingPanel("The problem it solves", "Campaign coordination usually lives in scattered phone calls, chat "
            + "screenshots, and spreadsheets nobody fully trusts. ElectionCanon replaces that with one shared, "
            + "attributable record of what has actually happened — so \"is Ward 3 covered?\" has a real answer, "
            + "not a guess.", PINK)}
          {landingPanel("Before election day", "Prepare candidate and legal documentation, assign coordinators down to "
            + "ward level, recruit and assign polling-unit agents and observers, plan mobilization tasks, and "
            + "produce campaign communications — each step tracked as COMPLETE, INCOMPLETE, AT RISK, or UNKNOWN, "
            + "never a fabricated percentage.", TEAL)}
          {landingPanel("On election day", "Polling-unit agents and coordinators capture results and report incidents "
            + "in real time, each one attributed to who reported it and when. Coordination rooms exist per level "
            + "— national, state, LGA, ward, polling unit, and dedicated incident-response rooms — so escalation "
            + "has a clear channel.", AMBER)}
          {landingPanel("How evidence is protected", "A result-sheet photo is uploaded to private, tenant-isolated "
            + "storage and never overwritten — a correction is always a new, separately recorded event, so the "
            + "original is preserved. On-device OCR (client-side, no photo ever leaves your browser for this step) "
            + "reads the sheet as a starting point, but a human always confirms or corrects every figure before it "
            + "counts — OCR completing is never treated as verification. The result is labelled \"ElectionCanon "
            + "Verified Evidence,\" never presented as an official result.", PINK)}
          {landingPanel("Security & tenant isolation", "Every campaign's data — chat, evidence, results, incidents, "
            + "roster — is walled off from every other campaign at the database level (row-level security), not "
            + "just by what the interface happens to show you. No campaign can read or write another campaign's "
            + "records, even if it guesses an id. This has been independently tested with separate accounts "
            + "attempting exactly that.", TEAL)}
          {landingPanel("What \"simulated\" means", "Every Election Day result and incident recorded through this "
            + "product today is explicitly test/demonstration data, marked as such in the record itself, never an "
            + "official election outcome. ElectionCanon does not integrate with INEC or IReV and makes no claim to "
            + "authenticate or transmit an official result — it is infrastructure for a campaign or observer "
            + "organisation's own coordination and evidence record.", AMBER)}
          {landingPanel("What ElectionCanon does not do", "It does not run for or against any party or candidate, "
            + "does not declare or predict a winner, does not claim to prevent or detect election rigging, does "
            + "not surveil or geolocate agents without their own coordination context, and does not send your data "
            + "anywhere outside your own campaign's isolated record.", PINK)}
          {landingPanel("Available now", <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            {CAPABILITIES_AVAILABLE_NOW.map((c) => <li key={c}>{c}</li>)}
          </ul>, TEAL)}
          {landingPanel("Coming next", <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            {CAPABILITIES_COMING_NEXT.map((c) => <li key={c}>{c}</li>)}
          </ul>, AMBER)}
          {landingPanel("Why it is open source", "A tool that campaigns and observers are asked to trust with their "
            + "coordination record should be inspectable by anyone, not a black box. ElectionCanon's source, "
            + "architecture, and security documentation are public under AGPL-3.0, scoped to ElectionCanon's own "
            + "code and documentation only — see docs/electioncanon/ in the repository for the full documentation "
            + "set (architecture, security policy, contribution guide, license).", PINK)}
        </div>

        <div>{registerCta}</div>
      </>
    );
  }

  if (ctxLoading && !ctx) return shell(<div style={{ color: MUTED, fontSize: 13 }}>Loading Election Canon…</div>);

  const scopeOutcome = ctx?.scope?.outcome ?? null;
  const isFirstRun = scopeOutcome === ELECTION_SCOPE.NONE;
  const campaignId = ctx?.scope?.campaignId ?? null;
  const userId = session?.user?.id ?? null;

  return shell(
    <>
      <ForgeHeader section={section} onSection={setSection} campaignName={workspaceName}
        onSignOut={signOut ? () => signOut() : null} showNav={!isFirstRun} />

      {isFirstRun && (
        <WelcomeOnboarding onActivate={doActivate} busy={activateBusy} error={activateError} />
      )}

      {scopeOutcome && SCOPE_MESSAGE[scopeOutcome] && (
        <Panel accent={PINK}><div style={{ fontFamily: UI, fontSize: 13, color: IVORY }}>
          {SCOPE_MESSAGE[scopeOutcome]}
        </div></Panel>
      )}

      {scopeOutcome === ELECTION_SCOPE.SCOPED && ctx.readiness && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={refresh} disabled={ctxLoading} style={{ fontFamily: UI, fontWeight: 700,
              fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", padding: "9px 16px",
              cursor: ctxLoading ? "not-allowed" : "pointer", background: "transparent", color: MUTED,
              border: `1px solid ${BORDER}`, clipPath: FORGE_CLIPS.button }}>
              {ctxLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {section === "home" && <HomeSection ctx={ctx} onSection={setSection} workspaceName={workspaceName} />}
          {section === "readiness" && <ReadinessSection ctx={ctx} campaignId={campaignId} refresh={refresh} />}
          {section === "mobilize" && <MobilizeSection ctx={ctx} campaignId={campaignId} refresh={refresh} />}
          {section === "chat" && <ChatSection campaignId={campaignId} userId={userId} />}
          {section === "studio" && <CampaignStudioSection campaignId={campaignId} userId={userId} workspaceName={workspaceName} />}
          {section === "election-day" && <ElectionDaySection ctx={ctx} campaignId={campaignId} userId={userId} refresh={refresh} />}
          {section === "intelligence" && <IntelligenceSection ctx={ctx} campaignId={campaignId} refresh={refresh} />}
          {section === "settings" && <SettingsSection ctx={ctx} workspaceName={workspaceName} />}
        </>
      )}
    </>
  );
}
