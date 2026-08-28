// ============================================================
// FORGE OS — ELECTION SCOPE RESOLUTION  (prerequisite to Election Canon access)
//
// The SAME CONTRACT src/os/businessScope.js's `resolveBusinessScope()`
// publishes, applied to Election's own tenant primitive. One function that
// answers one question: given an authenticated identity, WHICH campaign's
// private Election Canon may this conversation read or write?
//
// WHY THIS IS NOT `resolveBusinessScope()` WITH A RENAMED TABLE. A campaign
// is a genuinely separate entity from an organisation (see the Loop 23
// decision record this module's own history is built on, and
// src/domains/election/events.js's header, which already keeps `campaign`
// and `organisation` semantically apart at the event level). Reusing
// `organisation_members` here would silently make every campaign a row in
// the public manufacturing-network directory, which `organisations` is
// documented to be (`for select using (true)` in schema.sql) — Election
// tenant data must never inherit that public-read default.
//
// PURE AND CHANNEL-NEUTRAL, for the identical reason businessScope.js is:
// no React, no DOM, an injected client. `campaign` never means anything a
// caller merely asserts — see `resolveElectionScope`'s own header.
// ============================================================

/** Every way election-scope resolution can end. Tagged, never a guess. */
export const ELECTION_SCOPE = Object.freeze({
  UNAUTHENTICATED: "unauthenticated", // no identity at all — never default
  NONE:            "none",            // authenticated, but a member of zero campaigns
  SCOPED:          "scoped",          // exactly one campaign — the answer
  AMBIGUOUS:       "ambiguous",       // more than one — CALLER MUST ASK, same as §7
  REFUSED:         "refused",         // an explicit choice was supplied but is not a real membership
  READ_FAILED:     "read-failed",     // the membership read itself failed; state is unknown
});

const result = (outcome, extra = {}) => Object.freeze({ outcome, ...extra });

/** The columns this module reads — mirrors businessScope.js's MEMBERSHIP_COLUMNS. */
export const CAMPAIGN_MEMBERSHIP_COLUMNS = "campaign_id, member_role, status";

/**
 * Resolve which campaign an authenticated conversation is scoped to.
 *
 * @param userId    the authenticated actor's id, or null/undefined for an
 *                   unauthenticated request — never a guessed or default id
 * @param client    anything with .from().select().eq().eq()
 * @param requested a campaign id the caller explicitly asked for. Optional.
 *                  When supplied, it is VALIDATED against real membership,
 *                  NEVER trusted on its own word — this is the exact
 *                  boundary Loop 23 exists to enforce: a client-supplied
 *                  campaign identifier may be a lookup HINT, never an
 *                  authority grant.
 *
 * FAILS CLOSED IN EVERY DIRECTION: no userId -> UNAUTHENTICATED, a read
 * error -> READ_FAILED, a `requested` id that is not an active membership ->
 * REFUSED. None of these ever fall through to "pick something anyway."
 */
export async function resolveElectionScope({ userId, client, requested = null } = {}) {
  if (!userId) return result(ELECTION_SCOPE.UNAUTHENTICATED);

  let sel;
  try {
    sel = await client
      .from("campaign_members")
      .select(CAMPAIGN_MEMBERSHIP_COLUMNS)
      .eq("person", userId)
      .eq("status", "active");
  } catch (err) {
    return result(ELECTION_SCOPE.READ_FAILED, { error: `membership read threw: ${err?.message ?? String(err)}` });
  }
  if (sel?.error) {
    return result(ELECTION_SCOPE.READ_FAILED, { error: `membership read failed: ${sel.error.message}` });
  }

  const memberships = Object.freeze((sel?.data ?? []).map((m) => Object.freeze({ ...m })));

  if (requested) {
    const match = memberships.find((m) => m.campaign_id === requested);
    if (!match) {
      return result(ELECTION_SCOPE.REFUSED, {
        campaignId: null, memberships,
        reason: `${userId} has no active membership in ${requested} — an explicit request is never granted on its own word`,
      });
    }
    return result(ELECTION_SCOPE.SCOPED, {
      campaignId: match.campaign_id, role: match.member_role, memberships,
      because: "explicit selection, verified against membership",
    });
  }

  if (memberships.length === 0) {
    return result(ELECTION_SCOPE.NONE, { campaignId: null, memberships });
  }
  if (memberships.length === 1) {
    return result(ELECTION_SCOPE.SCOPED, {
      campaignId: memberships[0].campaign_id, role: memberships[0].member_role,
      memberships, because: "only active membership",
    });
  }
  return result(ELECTION_SCOPE.AMBIGUOUS, {
    campaignId: null, memberships,
    candidates: Object.freeze(memberships.map((m) => m.campaign_id)),
  });
}

/** True only for an outcome that yields a real, verified campaign id. */
export const isElectionScoped = (r) => r?.outcome === ELECTION_SCOPE.SCOPED && Boolean(r.campaignId);

export default { ELECTION_SCOPE, CAMPAIGN_MEMBERSHIP_COLUMNS, resolveElectionScope, isElectionScoped };
