// ============================================================
// FORGE ELECTION — CAMPAIGN BOOTSTRAP  (Loop 24 foundation)
//
// The ONE authoritative path for creating a campaign and establishing its
// owner membership. Not a UI, not a React hook — pure and channel-neutral,
// the same discipline src/os/businessScope.js and src/os/electionScope.js
// already establish, so it can be called from a future room, a future
// WhatsApp channel, or a test, unchanged.
//
// WHY THIS IS NOT `ensureOrganisation()` (ForgeIdentity.jsx) WITH RENAMED
// TABLES. That function is inseparable from Business/manufacturing-network
// identity: it reads/writes `profiles.organisation_id` (a PERMANENT,
// single-valued public-network affiliation a person carries for life),
// calls `linkProfileToOrganisation()`, and fires `audit_events` rows scoped
// to that same network-identity model. A campaign has no such field and no
// such lifetime constraint — a person may plausibly be a member of exactly
// one campaign today and a different one in a future election, and nothing
// about a campaign is a "network affiliation" the rest of the platform
// reads. Embedding this in ForgeIdentity.jsx would silently couple
// Election to Business/Manufacturing identity machinery this project's own
// repository guidance ("do not refactor unrelated shared systems") argues
// against. This file imports NOTHING from ForgeIdentity.jsx,
// organisationLink.js, or profiles — only `campaigns`/`campaign_members`,
// via `ensure_campaign_owner()` (20260823000000_campaign_membership.sql).
//
// WHAT THIS FILE DOES NOT DO — the exact CBOOT-9 guarantee. It writes
// `campaigns.name`/`created_by`/`actor_kind` and nothing else. It never
// writes to `election_events`, never calls `candidateEvent()`, and never
// returns a candidate/readiness fact of any kind — bootstrapping a campaign
// is not, and must never be read as, registering a candidate. The Election
// Canon is established exclusively by `src/domains/election/events.js`'s
// factories, folded by `projectElection()`; this module cannot reach
// either.
//
// ACTOR_KIND (LOOP 28) — a TAXONOMY DECLARATION, NOT A READINESS FACT.
// Reconnaissance found no authoritative event/fold path for any
// preparedness dimension beyond the three already built for a candidate
// campaign (readiness.js's own header), so none is invented here. What IS
// safe to record, with the same precedent `organisations.role` already
// sets: which kind of legitimate actor this campaign declares itself to
// be, once, at creation (20260824000000_campaign_actor_kind.sql). It is
// immutable thereafter — the reuse path below never changes an existing
// row's actor_kind, matching the "no reassignment" discipline this
// project's identity code already follows elsewhere.
//
// WHAT THIS FILE DOES NOT RETURN — scope. Bootstrap answers "does this
// campaign and its owner membership now exist?", not "what may this caller
// read?". The caller resolves scope SEPARATELY and afterward, by calling
// `resolveElectionScope()` (src/os/electionScope.js) — exactly the
// authoritative chain Loop 24 specifies:
//   authenticated user -> create campaign -> owner membership
//     -> resolveElectionScope() -> projectElection()
// Collapsing that into one function would let a caller mistake "I just
// created this" for "I am scoped to this", which are the same fact only
// while `ensure_campaign_owner()` has actually run and committed.
// ============================================================

/** Every way campaign bootstrap can end. Tagged, never a guess. */
export const BOOTSTRAP = Object.freeze({
  UNAUTHENTICATED:   "unauthenticated",  // no identity at all
  INVALID_NAME:      "invalid-name",     // no usable name was supplied
  INVALID_ACTOR_KIND: "invalid-actor-kind", // actorKind was supplied but is not a recognised kind
  READ_FAILED:       "read-failed",      // the reuse-lookup itself failed
  INSERT_FAILED:     "insert-failed",    // the campaign row could not be created
  MEMBERSHIP_FAILED: "membership-failed", // campaign exists, ensure_campaign_owner() failed
  BOOTSTRAPPED:      "bootstrapped",     // campaign + owner membership both exist
});

/**
 * The closed set of legitimate election actors this loop's reconnaissance
 * found the repository could name without inventing a readiness fact —
 * matches 20260824000000_campaign_actor_kind.sql's enum exactly, and
 * Loop 28's own brief section 1(A-F). "Other legitimate actors" (1G) are
 * deliberately NOT enumerated — an open-ended catch-all would defeat the
 * point of a closed taxonomy; a genuinely new actor kind is a future
 * migration, not a free-text field.
 */
export const ACTOR_KIND = Object.freeze({
  CANDIDATE_CAMPAIGN:                "candidate_campaign",
  NGO_CSO:                           "ngo_cso",
  OBSERVER_ORGANISATION:             "observer_organisation",
  MONITORING_GROUP:                  "monitoring_group",
  CAMPAIGN_SUPPORT_ORGANISATION:     "campaign_support_organisation",
  SECURITY_COORDINATION_ORGANISATION: "security_coordination_organisation",
});

const result = (outcome, extra = {}) => Object.freeze({ outcome, campaignId: null, created: false, error: null, ...extra });

/**
 * Create (or idempotently reuse) a campaign this user owns, and ensure the
 * owner membership row exists for it.
 *
 * @param userId     the authenticated actor's id — never inferred, never a
 *                   default; no userId is UNAUTHENTICATED, full stop.
 * @param client     anything with .from().select/.insert(), and .rpc()
 * @param name       a human-readable campaign label ONLY — see this file's
 *                   header on what `campaigns` may and may not hold.
 * @param actorKind  optional — one of ACTOR_KIND's closed set. Omitted
 *                   defaults to CANDIDATE_CAMPAIGN, the only actor concept
 *                   that existed before this loop (see the migration's own
 *                   header on why that default states a true historical
 *                   fact rather than a guess). ONLY consulted when a NEW
 *                   campaign is created — a reused existing campaign's
 *                   actor_kind is never touched, even if a different value
 *                   is supplied on the repeat call.
 *
 * IDEMPOTENT, THE SAME WAY `ensureOrganisation()`'s bootstrap half is: a
 * repeated call with the same (userId, name) reuses the existing row
 * (scoped to `created_by = userId`, so it can never surface — and then
 * "adopt" — a different user's campaign of the same name) rather than
 * creating a second one, and `ensure_campaign_owner()` itself is idempotent
 * (`on conflict (campaign_id, person) do nothing`), so calling this twice
 * in a row is always safe.
 */
export async function bootstrapCampaign({ userId, client, name, actorKind = ACTOR_KIND.CANDIDATE_CAMPAIGN } = {}) {
  if (!userId) return result(BOOTSTRAP.UNAUTHENTICATED);

  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) return result(BOOTSTRAP.INVALID_NAME, { error: "A campaign name is required." });

  if (!Object.values(ACTOR_KIND).includes(actorKind)) {
    return result(BOOTSTRAP.INVALID_ACTOR_KIND, { error: `"${actorKind}" is not a recognised actor kind.` });
  }

  const { data: mine, error: findErr } = await client
    .from("campaigns")
    .select("id, name, created_by, actor_kind")
    .eq("created_by", userId)
    .ilike("name", clean)
    .maybeSingle();
  if (findErr) return result(BOOTSTRAP.READ_FAILED, { error: findErr.message });

  let campaignId = mine?.id ?? null;
  let created = false;
  let resolvedActorKind = mine?.actor_kind ?? actorKind;

  if (!campaignId) {
    const { data: createdRow, error: insErr } = await client
      .from("campaigns")
      .insert({ name: clean, created_by: userId, actor_kind: actorKind })
      .select("id, actor_kind")
      .single();
    if (insErr) return result(BOOTSTRAP.INSERT_FAILED, { error: insErr.message });
    campaignId = createdRow.id;
    resolvedActorKind = createdRow.actor_kind;
    created = true;
  }

  // ensure_campaign_owner() — the EXISTING, already-tested, idempotent RPC
  // (20260823000000_campaign_membership.sql). Never duplicated here, only
  // called; runs under this authenticated user's own session, never
  // service_role, and only ever succeeds for a campaign this same user
  // created — which is exactly what the lookup/insert above just did or
  // reused.
  const { error: rpcErr } = await client.rpc("ensure_campaign_owner", { p_campaign_id: campaignId });
  if (rpcErr) return result(BOOTSTRAP.MEMBERSHIP_FAILED, { campaignId, created, error: rpcErr.message });

  return result(BOOTSTRAP.BOOTSTRAPPED, { campaignId, created, actorKind: resolvedActorKind });
}

export default { BOOTSTRAP, ACTOR_KIND, bootstrapCampaign };
