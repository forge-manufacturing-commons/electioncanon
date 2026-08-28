// ============================================================
// FORGE OS — PROFILE → ORGANISATION LINK  (E6.4 reliability)
//
// One conditional UPDATE, and an honest reading of what it did.
//
// THE DEFECT THIS CLOSES. The link was written as
//
//     .update({ organisation_id: org.id, ... })
//     .eq("id", userId)
//     .is("organisation_id", null)
//
// with no .select(). supabase-js returns neither data nor error when an UPDATE
// matches zero rows, so `ensureOrganisation()` could not tell "linked" from
// "matched nothing" and reported success either way.
//
// That was not hypothetical. Production held three `organisation.established`
// audit events, a created SOLC organisation, and `profiles.organisation_id =
// NULL`. The three browser attempts pre-dated the profile row existing, so the
// UPDATE matched zero rows every time, returned no error, and the function
// reported success while linking nothing — and wrote an audit event saying so.
//
// The fix is to ask the database what it actually changed, via `.select("id")`,
// and to branch on the answer rather than assume it.
//
// WHY ZERO ROWS IS NOT AUTOMATICALLY A FAILURE. The `organisation_id is null`
// guard is deliberately in the database so two tabs cannot race. That means a
// legitimate zero-row result exists: the profile is ALREADY linked to this very
// organisation, and the client's cached `profile` was merely stale. Reporting a
// hard failure there would be a false alarm on a correct system.
//
// So zero rows triggers exactly ONE diagnostic read — not a retry, not a loop —
// and the outcome is decided by what the database says:
//
//   already linked to THIS organisation  -> ALREADY_LINKED (success, no re-audit)
//   linked to a DIFFERENT organisation   -> LINKED_ELSEWHERE (refuse, never reassign)
//   no profile row at all                -> NO_PROFILE (the reported failure)
//
// Success is therefore never claimed without the database confirming the link.
// A profile is never fabricated, and an organisation is never created here.
//
// MORE THAN ONE ROW IS AN INVARIANT VIOLATION. `profiles.id` is the primary key,
// so an UPDATE filtered on a single id cannot legitimately touch two rows. If it
// ever does, something is deeply wrong and this fails loudly rather than picking
// one.
// ============================================================

export const LINK_OUTCOME = Object.freeze({
  LINKED:           "linked",            // exactly one row updated — established
  ALREADY_LINKED:   "already-linked",    // was already this organisation; nothing to do
  NO_PROFILE:       "no-profile",        // nothing to link to
  LINKED_ELSEWHERE: "linked-elsewhere",  // belongs to another organisation; refused
  INVARIANT:        "invariant",         // impossible row count or identity
  FAILED:           "failed",            // the UPDATE itself errored
});

/** Outcomes that mean the profile genuinely carries this organisation. */
export const isEstablished = (outcome) =>
  outcome === LINK_OUTCOME.LINKED || outcome === LINK_OUTCOME.ALREADY_LINKED;

/** Only a fresh link should emit an audit event. A no-op must not re-audit. */
export const shouldAudit = (outcome) => outcome === LINK_OUTCOME.LINKED;

const out = (outcome, error = null, rows = 0) => ({ outcome, error, rows });

/**
 * Link the authenticated profile to an organisation, and prove it happened.
 *
 * @param client          supabase-js or anything with the same surface
 * @param userId          the authenticated user's id
 * @param organisationId  the organisation to link
 *
 * Writes only `organisation_id` and `updated_at`. Never touches role,
 * actor_kind, verification, onboarded, display_name or state. Never inserts.
 */
export async function linkProfileToOrganisation({ client, userId, organisationId }) {
  if (!userId)         return out(LINK_OUTCOME.FAILED, "No authenticated user id.");
  if (!organisationId) return out(LINK_OUTCOME.FAILED, "No organisation id to link.");

  let res;
  try {
    res = await client
      .from("profiles")
      .update({ organisation_id: organisationId, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .is("organisation_id", null)
      .select("id");
  } catch (err) {
    return out(LINK_OUTCOME.FAILED, `Profile link threw: ${err?.message ?? String(err)}`);
  }
  if (res?.error) return out(LINK_OUTCOME.FAILED, `Profile link failed: ${res.error.message}`);

  const rows = Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []);

  // --- more than one row: impossible against a primary key ---
  if (rows.length > 1) {
    return out(
      LINK_OUTCOME.INVARIANT,
      `Invariant violation: ${rows.length} profile rows matched the single authenticated id ${userId}. ` +
      `profiles.id is the primary key, so this must never happen. Refusing to continue.`,
      rows.length,
    );
  }

  // --- exactly one row: the link was written. Verify it is OUR row. ---
  if (rows.length === 1) {
    if (rows[0]?.id !== userId) {
      return out(
        LINK_OUTCOME.INVARIANT,
        `Invariant violation: the profile link updated ${rows[0]?.id} but the authenticated user is ${userId}.`,
        1,
      );
    }
    return out(LINK_OUTCOME.LINKED, null, 1);
  }

  // --- zero rows: ONE diagnostic read decides which of three things happened ---
  let check;
  try {
    check = await client
      .from("profiles").select("id, organisation_id").eq("id", userId).maybeSingle();
  } catch (err) {
    return out(
      LINK_OUTCOME.FAILED,
      `Organisation exists but the profile link could not be confirmed: ${err?.message ?? String(err)}`,
    );
  }
  if (check?.error) {
    return out(
      LINK_OUTCOME.FAILED,
      `Organisation exists but the profile link could not be confirmed: ${check.error.message}`,
    );
  }

  const existing = check?.data ?? null;

  if (!existing) {
    return out(
      LINK_OUTCOME.NO_PROFILE,
      "Organisation exists but could not be linked to the authenticated profile.",
    );
  }
  if (existing.organisation_id === organisationId) {
    return out(LINK_OUTCOME.ALREADY_LINKED, null, 0);
  }
  return out(
    LINK_OUTCOME.LINKED_ELSEWHERE,
    `Organisation exists but could not be linked to the authenticated profile: ` +
    `the profile already belongs to organisation ${existing.organisation_id}. ` +
    `An existing organisation link is never reassigned.`,
  );
}

export default { LINK_OUTCOME, isEstablished, shouldAudit, linkProfileToOrganisation };
