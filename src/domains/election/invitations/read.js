// ============================================================
// FORGE ELECTION — CAMPAIGN INVITATIONS: READS
//
// `token` is DELIBERATELY never selected here when listing a campaign's own
// invitations — see the migration's own header on why raw table access
// alone is not the right place to trust with a secret. It is returned only
// once, directly, by createInvitation()'s own RPC response.
// ============================================================

export async function listInvitations({ client, campaignId }) {
  return client.from("campaign_invitations")
    .select("id, invited_name, invited_email, intended_member_role, intended_responsibility_role, intended_level, intended_geography_ref, status, created_at, expires_at, accepted_at, invited_by")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
}

/** Unauthenticated-safe preview for the accept-invite landing page — see
 *  get_invitation_preview() in the migration; never exposes the token or email.
 *  Wrapped in try/catch: a signed-out visitor's very first network call on
 *  this page must fail into a visible state, never an unhandled rejection
 *  that leaves AcceptInvite.jsx stuck on "Loading invitation…" forever. */
export async function getInvitationPreview({ client, token }) {
  try {
    const { data, error } = await client.rpc("get_invitation_preview", { p_token: token });
    if (error) return { invitation: null, error: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    return { invitation: row ?? null, error: null };
  } catch (err) {
    return { invitation: null, error: err?.message ?? "could not reach ElectionCanon" };
  }
}

export default { listInvitations, getInvitationPreview };
