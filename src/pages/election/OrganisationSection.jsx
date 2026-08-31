// ============================================================
// ELECTION FORGE — ORGANISATION  (Campaign invitations + roster)
//
// Who is in this campaign, what role they hold, what territory they're
// responsible for, and a 4-step flow to invite someone new. Geography
// options come only from the campaign's own already-resolved territory
// (Territory tab) — no re-asking Election/Office/State/Constituency, and
// no geography ever shown that doesn't exist in the real tables (an empty
// ward/PU list renders the same honest "not imported yet" message Territory
// already established, never a placeholder).
// ============================================================

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase.js";
import { getConstituencyTerritory } from "../../domains/election/geography/read.js";
import { listWardsForLga } from "../../domains/election/geography/read.js";
import { createInvitation, revokeInvitation } from "../../domains/election/invitations/write.js";
import { listInvitations } from "../../domains/election/invitations/read.js";
import { Label, Panel, friendlyError, UI, IVORY, TEAL, AMBER, PINK, MUTED, BORDER, BLACK, inputStyle } from "./shared.jsx";

const RESPONSIBILITY_ROLE_LABEL = Object.freeze({
  CONSTITUENCY_LEAD: "Constituency Lead", LGA_COORDINATOR: "LGA Coordinator",
  WARD_COORDINATOR: "Ward Coordinator", POLLING_UNIT_AGENT: "Polling-Unit Agent",
});

const STATUS_COLOR = Object.freeze({ pending: AMBER, accepted: TEAL, expired: MUTED, revoked: PINK });

function myOwnResponsibility(view, campaignId, userId) {
  const mine = Object.values(view?.responsibilities ?? {}).find((r) => r.person === `invite:${campaignId}:${userId}`);
  return mine ?? null;
}

function InviteWizard({ campaignId, refresh, territory, myRole, myResponsibility, onDone }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(null); // 'DIRECTOR' | RESPONSIBILITY_ROLE key
  const [lgaId, setLgaId] = useState("");
  const [wardId, setWardId] = useState("");
  const [tree, setTree] = useState(null);
  const [wards, setWards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sentToken, setSentToken] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!territory?.constituency) return undefined;
    (async () => {
      const { data } = await getConstituencyTerritory({ client: supabase, constituencyId: territory.constituency });
      if (!cancelled) setTree(data);
    })();
    return () => { cancelled = true; };
  }, [territory?.constituency]);

  // The roles a Director/owner may offer are all four; an LGA Coordinator
  // may only offer Ward Coordinator (within their own LGA); a Ward
  // Coordinator may only offer Polling-Unit Agent (within their own ward) —
  // mirrors create_campaign_invitation()'s own authorization exactly, so
  // the UI never offers a choice the database would refuse anyway.
  const canOfferDirector = myRole === "owner" || myRole === "manager";
  const canOfferLga = myRole === "owner" || myRole === "manager";
  const canOfferWard = myRole === "owner" || myRole === "manager" || myResponsibility?.responsibilityRole === "LGA_COORDINATOR";
  const canOfferPu = myRole === "owner" || myRole === "manager" || myResponsibility?.responsibilityRole === "WARD_COORDINATOR";

  // Geography choices are constrained to the inviter's own authority — an
  // LGA Coordinator only ever sees THEIR OWN LGA's wards, never another.
  const availableLgas = (myRole === "owner" || myRole === "manager")
    ? (tree?.lgas ?? [])
    : (tree?.lgas ?? []).filter((l) => l.id === myResponsibility?.geographyRef);

  useEffect(() => {
    let cancelled = false;
    setWardId("");
    if (role !== "WARD_COORDINATOR" && role !== "POLLING_UNIT_AGENT") { setWards([]); return undefined; }
    const effectiveLga = (myResponsibility?.responsibilityRole === "LGA_COORDINATOR") ? myResponsibility.geographyRef : lgaId;
    if (!effectiveLga) { setWards([]); return undefined; }
    (async () => {
      const { data } = await listWardsForLga({ client: supabase, lgaId: effectiveLga });
      if (!cancelled) setWards(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [role, lgaId, myResponsibility]);

  const needsLga = role === "LGA_COORDINATOR" || (role === "WARD_COORDINATOR" && myResponsibility?.responsibilityRole !== "LGA_COORDINATOR");
  const needsWard = role === "WARD_COORDINATOR" || role === "POLLING_UNIT_AGENT";
  const territoryReady = role === "DIRECTOR"
    || (role === "LGA_COORDINATOR" && lgaId)
    || (role === "WARD_COORDINATOR" && wardId)
    || (role === "POLLING_UNIT_AGENT" && wardId); // PU picker itself is a future step once real PU data exists

  const roleLabel = role === "DIRECTOR" ? "Campaign Director" : RESPONSIBILITY_ROLE_LABEL[role];
  const lgaName = availableLgas.find((l) => l.id === (lgaId || myResponsibility?.geographyRef))?.name;
  const wardName = wards.find((w) => w.id === wardId)?.name;

  const send = async () => {
    setBusy(true); setError(null);
    const geographyRef = role === "WARD_COORDINATOR" || role === "POLLING_UNIT_AGENT" ? wardId
      : role === "LGA_COORDINATOR" ? lgaId : null;
    const { invitation, error: sendError } = await createInvitation({
      client: supabase, campaignId, invitedName: name.trim(), invitedEmail: email.trim(),
      intendedMemberRole: role === "DIRECTOR" ? "manager" : "staff",
      intendedResponsibilityRole: role === "DIRECTOR" ? null : role,
      intendedLevel: role === "DIRECTOR" ? null : role === "LGA_COORDINATOR" ? "lga" : role === "WARD_COORDINATOR" ? "ward" : "polling_unit",
      intendedGeographyRef: geographyRef,
    });
    setBusy(false);
    if (sendError) { setError(sendError); return; }
    setSentToken(invitation.token);
    await refresh();
  };

  if (sentToken) {
    const link = `${window.location.origin}/invite/${sentToken}`;
    return (
      <Panel accent={TEAL}>
        <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 12, color: TEAL, marginBottom: 8 }}>Invitation sent</div>
        <div style={{ fontFamily: UI, fontSize: 13, color: IVORY, marginBottom: 10 }}>
          Share this link with {name} — it's the only way this invitation can be accepted.
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11.5, color: IVORY, background: BLACK, border: `1px solid ${BORDER}`, padding: "10px 12px", wordBreak: "break-all", marginBottom: 12 }}>
          {link}
        </div>
        <button onClick={onDone} style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 16px", border: "none", background: TEAL, color: BLACK, cursor: "pointer" }}>Done</button>
      </Panel>
    );
  }

  return (
    <Panel accent={AMBER}>
      <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: AMBER, marginBottom: 14 }}>
        Invite person · step {step} of 4
      </div>

      {step === 1 && (
        <>
          <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Doe" aria-label="Name" style={inputStyle} />
          <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Email</div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.g. john@example.com" type="email" aria-label="Email" style={inputStyle} />
          <button onClick={() => setStep(2)} disabled={!name.trim() || !email.trim()}
            style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 18px", border: "none",
              background: name.trim() && email.trim() ? TEAL : BORDER, color: BLACK, cursor: name.trim() && email.trim() ? "pointer" : "not-allowed" }}>Next →</button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontFamily: UI, fontSize: 13, color: MUTED, marginBottom: 14 }}>What is {name}'s responsibility?</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {canOfferDirector && <RoleButton label="Campaign Director" active={role === "DIRECTOR"} onClick={() => setRole("DIRECTOR")} />}
            {canOfferLga && <RoleButton label="LGA Coordinator" active={role === "LGA_COORDINATOR"} onClick={() => setRole("LGA_COORDINATOR")} />}
            {canOfferWard && <RoleButton label="Ward Coordinator" active={role === "WARD_COORDINATOR"} onClick={() => setRole("WARD_COORDINATOR")} />}
            {canOfferPu && <RoleButton label="Polling-Unit Agent" active={role === "POLLING_UNIT_AGENT"} onClick={() => setRole("POLLING_UNIT_AGENT")} />}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <BackButton onClick={() => setStep(1)} />
            <button onClick={() => setStep(role === "DIRECTOR" ? 4 : 3)} disabled={!role}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 18px", border: "none",
                background: role ? TEAL : BORDER, color: BLACK, cursor: role ? "pointer" : "not-allowed" }}>Next →</button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div style={{ fontFamily: UI, fontSize: 13, color: MUTED, marginBottom: 14 }}>Where is {name} responsible?</div>
          {needsLga && (
            <>
              <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase" }}>LGA</div>
              <select value={lgaId} onChange={(e) => setLgaId(e.target.value)} aria-label="LGA" style={inputStyle}>
                <option value="">Select an LGA…</option>
                {availableLgas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </>
          )}
          {needsWard && (
            <>
              <div style={{ fontFamily: UI, fontSize: 10, color: MUTED, marginBottom: 4, textTransform: "uppercase" }}>Ward</div>
              {(myResponsibility?.responsibilityRole !== "LGA_COORDINATOR" && !lgaId) ? (
                <div style={{ fontFamily: UI, fontSize: 12, color: MUTED, marginBottom: 9 }}>Select an LGA first.</div>
              ) : wards.length === 0 ? (
                <div style={{ fontFamily: UI, fontSize: 12, color: MUTED, marginBottom: 9 }}>
                  No wards imported yet for this LGA — see supabase/geography-import/README.md.
                </div>
              ) : (
                <select value={wardId} onChange={(e) => setWardId(e.target.value)} aria-label="Ward" style={inputStyle}>
                  <option value="">Select a ward…</option>
                  {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <BackButton onClick={() => setStep(2)} />
            <button onClick={() => setStep(4)} disabled={!territoryReady}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 18px", border: "none",
                background: territoryReady ? TEAL : BORDER, color: BLACK, cursor: territoryReady ? "pointer" : "not-allowed" }}>Next →</button>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>Review</div>
          <div style={{ fontFamily: UI, fontSize: 13, color: IVORY, lineHeight: 1.9, marginBottom: 16 }}>
            Person: <strong>{name}</strong> ({email})<br />
            Role: <strong>{roleLabel}</strong><br />
            {role !== "DIRECTOR" && <>Territory: <strong>{[lgaName, wardName].filter(Boolean).join(" → ")}</strong><br /></>}
            Campaign: <strong>{tree?.constituency?.name ?? "—"}</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <BackButton onClick={() => setStep(role === "DIRECTOR" ? 2 : 3)} />
            <button onClick={send} disabled={busy}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 18px", border: "none",
                background: busy ? BORDER : TEAL, color: BLACK, cursor: busy ? "not-allowed" : "pointer" }}>{busy ? "Sending…" : "Send Invitation"}</button>
          </div>
        </>
      )}
      {error && <div style={{ fontFamily: UI, fontSize: 12.5, color: PINK, marginTop: 12 }}>{friendlyError(error)}</div>}
    </Panel>
  );
}

function RoleButton({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", fontFamily: UI, fontWeight: 700, fontSize: 13, padding: "12px 14px",
      cursor: "pointer", background: active ? "rgba(10,180,160,0.12)" : BLACK, border: `1px solid ${active ? TEAL : BORDER}`, color: IVORY }}>
      {label}
    </button>
  );
}
function BackButton({ onClick }) {
  return (
    <button onClick={onClick} style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
      padding: "11px 18px", cursor: "pointer", background: "transparent", color: MUTED, border: `1px solid ${BORDER}` }}>← Back</button>
  );
}

export default function OrganisationSection({ ctx, campaignId, refresh }) {
  const [inviting, setInviting] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [userId, setUserId] = useState(null);
  const [members, setMembers] = useState([]);

  const loadAll = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);
    const { data: invData } = await listInvitations({ client: supabase, campaignId });
    setInvitations(invData ?? []);
    const { data: memberData } = await supabase.from("campaign_members").select("person, member_role, status").eq("campaign_id", campaignId).eq("status", "active");
    setMembers(memberData ?? []);
  };

  useEffect(() => { loadAll(); }, [campaignId]); // eslint-disable-line

  const territory = ctx.view?.territory ?? null;
  const view = ctx.view ?? {};
  const myMemberRow = members.find((m) => m.person === userId);
  const myRole = myMemberRow?.member_role ?? null;
  const myResponsibility = userId ? myOwnResponsibility(view, campaignId, userId) : null;
  const canInvite = myRole === "owner" || myRole === "manager" || myResponsibility != null;

  const revoke = async (invitationId) => {
    await revokeInvitation({ client: supabase, invitationId });
    await loadAll();
  };

  const people = Object.values(view.people ?? {});
  const nameFor = (uid) => people.find((p) => p.id === `invite:${campaignId}:${uid}`)?.name ?? `member ${uid.slice(0, 8)}`;
  const roleFor = (uid) => {
    const resp = Object.values(view.responsibilities ?? {}).find((r) => r.person === `invite:${campaignId}:${uid}`);
    return resp ? RESPONSIBILITY_ROLE_LABEL[resp.responsibilityRole] : (members.find((m) => m.person === uid)?.member_role === "owner" ? "Campaign Owner" : members.find((m) => m.person === uid)?.member_role === "manager" ? "Campaign Director" : "Team member");
  };
  const territoryFor = (uid) => {
    const resp = Object.values(view.responsibilities ?? {}).find((r) => r.person === `invite:${campaignId}:${uid}`);
    return resp?.geographyRef ?? null;
  };

  return (
    <div>
      <Label>Campaign Organisation</Label>
      <Panel>
        {members.length === 0 ? (
          <div style={{ fontFamily: UI, fontSize: 12.5, color: MUTED }}>No team members yet.</div>
        ) : members.map((m) => (
          <div key={m.person} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
            <div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 12.5, color: IVORY }}>{nameFor(m.person)}</div>
              <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginTop: 2 }}>{roleFor(m.person)}{territoryFor(m.person) ? ` · ${territoryFor(m.person)}` : ""}</div>
            </div>
            <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, border: `1px solid ${TEAL}`, padding: "3px 8px" }}>ACTIVE</span>
          </div>
        ))}
      </Panel>

      {invitations.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Label>Invitations</Label>
          <Panel>
            {invitations.map((i) => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: 12.5, color: IVORY }}>{i.invited_name}</div>
                  <div style={{ fontFamily: UI, fontSize: 11, color: MUTED, marginTop: 2 }}>
                    {i.intended_responsibility_role ? RESPONSIBILITY_ROLE_LABEL[i.intended_responsibility_role] : "Campaign Director"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: UI, fontWeight: 700, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
                    color: STATUS_COLOR[i.status], border: `1px solid ${STATUS_COLOR[i.status]}`, padding: "3px 8px" }}>{i.status}</span>
                  {i.status === "pending" && (myRole === "owner" || myRole === "manager") && (
                    <button onClick={() => revoke(i.id)} style={{ fontFamily: UI, fontWeight: 700, fontSize: 10, color: PINK, background: "transparent", border: "none", cursor: "pointer" }}>Revoke</button>
                  )}
                </div>
              </div>
            ))}
          </Panel>
        </div>
      )}

      {!territory ? (
        <div style={{ marginTop: 18 }}>
          <Panel accent={PINK}><div style={{ fontFamily: UI, fontSize: 13, color: IVORY }}>Set your territory in the Territory tab before inviting people.</div></Panel>
        </div>
      ) : !canInvite ? null : (
        <div style={{ marginTop: 18 }}>
          {!inviting ? (
            <button onClick={() => setInviting(true)}
              style={{ fontFamily: UI, fontWeight: 700, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 20px", border: "none", background: TEAL, color: BLACK, cursor: "pointer" }}>
              + Invite Person
            </button>
          ) : (
            <InviteWizard campaignId={campaignId} refresh={loadAll} territory={territory} myRole={myRole} myResponsibility={myResponsibility}
              onDone={() => setInviting(false)} />
          )}
        </div>
      )}
    </div>
  );
}
