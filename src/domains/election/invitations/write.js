// ============================================================
// FORGE ELECTION — CAMPAIGN INVITATIONS: WRITES
//
// createInvitation/revokeInvitation are thin RPC wrappers around the
// SECURITY DEFINER functions in 20260831000000_election_campaign_
// invitations.sql -- all authorization logic lives there, not here.
//
// acceptInvitation() is a SEQUENCE, not a single call: (1) the privileged
// accept_campaign_invitation() RPC creates campaign membership -- the one
// genuinely privileged step, since campaign_members has no client INSERT
// policy at all; (2)/(3) reuse the EXISTING, tested Mobilization/Geography
// write functions (proposeAddPerson/executeAddPerson,
// proposeAssignResponsibility/executeAssignResponsibility) to record a
// roster entry and responsibility for the accepter's REAL auth identity --
// never a second, hand-built event-construction path. A failure between
// steps is recoverable (campaign_members membership alone grants no
// geography-scoped access; a campaign owner can complete the assignment
// manually via Territory) and reported plainly, never silently swallowed.
// ============================================================

import { proposeAddPerson, executeAddPerson } from "../mobilization/write.js";
import { proposeAssignResponsibility, executeAssignResponsibility } from "../geography/write.js";
import { getConstituencyTerritory } from "../geography/read.js";
import { getElectionContext } from "../../../os/electionContext.js";

const RESPONSIBILITY_ROLE_TO_PERSON_ROLE_TYPE = Object.freeze({
  CONSTITUENCY_LEAD: "constituency_lead",
  LGA_COORDINATOR: "lga_coordinator",
  WARD_COORDINATOR: "ward_coordinator",
  POLLING_UNIT_AGENT: "polling_unit_agent",
});

export async function createInvitation({
  client, campaignId, invitedName, invitedEmail, intendedMemberRole,
  intendedResponsibilityRole = null, intendedLevel = null, intendedGeographyRef = null, expiresInDays = 14,
}) {
  const { data, error } = await client.rpc("create_campaign_invitation", {
    p_campaign_id: campaignId, p_invited_name: invitedName, p_invited_email: invitedEmail,
    p_intended_member_role: intendedMemberRole,
    p_intended_responsibility_role: intendedResponsibilityRole,
    p_intended_level: intendedLevel,
    p_intended_geography_ref: intendedGeographyRef,
    p_expires_in_days: expiresInDays,
  });
  if (error) return { invitation: null, error: error.message };
  return { invitation: data, error: null };
}

export async function revokeInvitation({ client, invitationId }) {
  const { error } = await client.rpc("revoke_campaign_invitation", { p_invitation_id: invitationId });
  if (error) return { revoked: false, error: error.message };
  return { revoked: true, error: null };
}

export async function acceptInvitation({ client, token, displayName }) {
  const { data: rpcData, error: rpcError } = await client.rpc("accept_campaign_invitation", {
    p_token: token, p_display_name: displayName ?? null,
  });
  if (rpcError) return { accepted: false, campaignId: null, error: rpcError.message };
  const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  if (!result) return { accepted: false, campaignId: null, error: "invitation could not be resolved" };

  const { campaign_id: campaignId, intended_responsibility_role: responsibilityRole,
    intended_level: level, intended_geography_ref: geographyRef, invited_name: invitedName } = result;

  if (!responsibilityRole) {
    // Director-level invitation -- membership alone is the whole grant.
    return { accepted: true, campaignId, error: null };
  }

  const { data: { user } } = await client.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    return { accepted: true, campaignId, error: "membership created, but no authenticated session to record a responsibility" };
  }

  const personConfirmationId = `invite:${campaignId}:${userId}`;
  const roleType = RESPONSIBILITY_ROLE_TO_PERSON_ROLE_TYPE[responsibilityRole] ?? "coordinator";
  const name = displayName?.trim() || invitedName;

  const personPrepared = await proposeAddPerson({ fields: { name, roleType } });
  if (personPrepared.status !== "PREPARED") {
    return { accepted: true, campaignId, error: `membership created, but the roster entry could not be prepared: ${personPrepared.reason}` };
  }
  const personResult = await executeAddPerson({
    draft: personPrepared.draft.draft, campaign: campaignId, userId, client, confirmationId: personConfirmationId,
  });
  if (!personResult.success) {
    return { accepted: true, campaignId, error: `membership created, but the roster entry failed: ${personResult.error}` };
  }

  // Real geography rows to validate the assignment against -- the SAME
  // PREPARE-time-validation discipline every structured write in this
  // codebase already uses, applied regardless of what the invitation
  // itself claims. Now that membership exists, election_events reads for
  // this campaign are permitted, so a fresh Canon read resolves the
  // campaign's own territory via the EXISTING getElectionContext().
  let geographyTree = null;
  if (level === "lga" || level === "ward") {
    const ctx = await getElectionContext({ userId, client, requestedCampaign: campaignId });
    const constituencyId = ctx?.view?.territory?.constituency ?? null;
    if (constituencyId) {
      const { data } = await getConstituencyTerritory({ client, constituencyId });
      geographyTree = data ? { lgas: data.lgas, wards: data.wards } : null;
    }
  } else if (level === "polling_unit") {
    // A single, targeted existence check -- not a constituency-wide fetch
    // (the scale-hardening pass's own lazy-loading discipline applies here
    // too, at the one-row scale it actually needs).
    const { data } = await client.from("geography_polling_units").select("id, ward_id, code").eq("id", geographyRef).maybeSingle();
    geographyTree = { pollingUnits: data ? [data] : [] };
  }

  const respPrepared = await proposeAssignResponsibility({
    fields: { personId: personConfirmationId, level, geographyRef },
    roster: [{ id: personConfirmationId, name }],
    geographyTree,
  });
  if (respPrepared.status !== "PREPARED") {
    return { accepted: true, campaignId, error: `membership and roster entry created, but the responsibility could not be assigned: ${respPrepared.reason}` };
  }
  const respResult = await executeAssignResponsibility({
    draft: respPrepared.draft.draft, campaign: campaignId, userId, client,
    confirmationId: `invite-resp:${campaignId}:${userId}`,
  });
  if (!respResult.success) {
    return { accepted: true, campaignId, error: `membership and roster entry created, but the responsibility assignment failed: ${respResult.error}` };
  }

  return { accepted: true, campaignId, error: null };
}

export default { createInvitation, revokeInvitation, acceptInvitation };
