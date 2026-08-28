// ============================================================
// FORGE OS — PROFILE RESOLUTION  (E6.2 identity reliability)
//
// One function that answers one question: given a session, what is this actor's
// profile row? It exists as a separate, React-free module for two reasons.
//
// FIRST, IT IS THE ONLY WAY TO TEST THIS. The six cases that matter —
// existing profile, missing profile, unauthenticated, unconfigured, RPC failure,
// and organisation_id staying null — are all branches of one async decision.
// Inside a React hook they are reachable only through a rendered component with
// a mocked network. As a pure function with an injected client they are ordinary
// unit tests, so the reliability pass is actually verified rather than asserted.
//
// SECOND, IT KEEPS ONE MECHANISM. There is no second profile-creation path here.
// The browser NEVER inserts into public.profiles. It does exactly two things:
//   SELECT the row, and
//   call public.ensure_profile(), which is SECURITY DEFINER, owned by postgres,
//   pinned to search_path = '', and derives the id from auth.uid().
//
// WHY THE RPC AND NOT THE TRIGGER. `on_auth_user_created` fires AFTER INSERT on
// auth.users, so it cannot provision a user who already existed, and it was
// observed DISABLED on this project while registrations were succeeding. The
// trigger remains the fast path; this is the guarantee. Verified contract:
//
//   CREATE FUNCTION public.ensure_profile() RETURNS profiles
//     LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
//     insert into public.profiles (id) values (auth.uid())
//       on conflict (id) do nothing;
//     select * into result from public.profiles where id = auth.uid();
//
// Three consequences of that exact text, all of which this module depends on:
//
//   1. IT IS IDEMPOTENT AND NON-DESTRUCTIVE. `on conflict (id) do nothing`
//      followed by a plain select means an existing profile is returned
//      untouched. Calling it on every session resolution cannot reset a role, a
//      verification state, an onboarded flag, or an organisation link.
//   2. IT INSERTS ONLY `id`. Every other column takes its schema default, so
//      organisation_id stays NULL. No organisation is assigned, inferred from
//      email, display_name, role, state, workshop or form data, or fabricated.
//   3. IT REQUIRES A SESSION. With no JWT, auth.uid() is NULL and the insert
//      violates the primary key's NOT NULL — the function raises rather than
//      creating a null-id row. EXECUTE is granted to `authenticated` and
//      `service_role` but NOT to `anon`. So it must never be called without a
//      session, which is why `authenticated` below checks the access token and
//      not merely the presence of a user object.
//
// ERRORS ARE RETURNED, NEVER SWALLOWED. Every failure path produces an outcome
// tag and a human-readable message for the caller to surface. Nothing here
// catches an error and pretends the profile is simply absent — "no profile" and
// "we could not find out" are different facts and the UI must be able to say so.
// ============================================================

/** The exact column list the application reads. One definition, one truth. */
export const PROFILE_COLUMNS =
  "id, display_name, role, actor_kind, organisation_id, state, discipline, verification, onboarded";

/** Every way resolution can end. Tagged so callers branch on a value, not a guess. */
export const RESOLUTION = Object.freeze({
  NOT_CONFIGURED:    "not-configured",     // no Supabase keys — do not call anything
  UNAUTHENTICATED:   "unauthenticated",    // no valid session — do not call the RPC
  EXISTING:          "existing",           // profile was already there
  ENSURED:           "ensured",            // profile was created server-side by the RPC
  SELECT_FAILED:     "select-failed",      // the read failed; state is unknown
  RPC_FAILED:        "rpc-failed",         // ensure_profile() raised
  RPC_EMPTY:         "rpc-empty",          // ensure_profile() returned no row
  ALREADY_ATTEMPTED: "already-attempted",  // loop guard tripped
});

/** True only for a session that can actually authorise a request. */
export const isAuthenticated = (session) =>
  Boolean(session && session.user && session.user.id && session.access_token);

const result = (outcome, profile = null, error = null, calledRpc = false) =>
  ({ outcome, profile, error, calledRpc });

/**
 * Resolve the signed-in actor's profile, provisioning it server-side if absent.
 *
 * @param configured    mirrors `isConfigured` from lib/supabase
 * @param session       the Supabase session, or null
 * @param client        anything with .from().select().eq().maybeSingle() and .rpc()
 * @param hasAttempted  (userId) => boolean   loop guard, read
 * @param markAttempted (userId) => void      loop guard, write
 *
 * LOOP SAFETY. The RPC is attempted at most ONCE per user identity. If it
 * returns and the profile is still missing, the second pass reports the failure
 * instead of calling again — otherwise a server-side refusal would drive an
 * endless resolve → rpc → resolve cycle. The guard is caller-owned so it can
 * live in a ref (no re-render) and be cleared on sign-out.
 */
export async function resolveProfile({
  configured,
  session,
  client,
  hasAttempted = () => false,
  markAttempted = () => {},
}) {
  if (!configured) return result(RESOLUTION.NOT_CONFIGURED);
  if (!isAuthenticated(session)) return result(RESOLUTION.UNAUTHENTICATED);

  const userId = session.user.id;

  // 1. Read. The common case is that the trigger already did its job.
  let sel;
  try {
    sel = await client.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  } catch (err) {
    return result(RESOLUTION.SELECT_FAILED, null, `profile read threw: ${err?.message ?? String(err)}`);
  }
  if (sel?.error) {
    return result(RESOLUTION.SELECT_FAILED, null, `profile read failed: ${sel.error.message}`);
  }
  if (sel?.data) return result(RESOLUTION.EXISTING, sel.data);

  // 2. Absent. Converge it server-side — once.
  if (hasAttempted(userId)) {
    return result(
      RESOLUTION.ALREADY_ATTEMPTED, null,
      "No profile exists for this account and ensure_profile() has already been attempted this session. " +
      "Not retrying automatically. Sign out and in again, or contact an administrator.",
    );
  }
  markAttempted(userId);

  let rpc;
  try {
    rpc = await client.rpc("ensure_profile");
  } catch (err) {
    return result(RESOLUTION.RPC_FAILED, null, `ensure_profile() threw: ${err?.message ?? String(err)}`, true);
  }
  if (rpc?.error) {
    return result(RESOLUTION.RPC_FAILED, null, `ensure_profile() failed: ${rpc.error.message}`, true);
  }

  // The function RETURNS profiles (a composite row), so PostgREST sends one
  // object. Unwrap an array defensively rather than assuming the shape.
  const row = Array.isArray(rpc?.data) ? (rpc.data[0] ?? null) : (rpc?.data ?? null);
  if (!row || !row.id) {
    return result(
      RESOLUTION.RPC_EMPTY, null,
      "ensure_profile() returned no profile row. The account is authenticated but has no profile.",
      true,
    );
  }

  return result(RESOLUTION.ENSURED, row, null, true);
}

export default { PROFILE_COLUMNS, RESOLUTION, isAuthenticated, resolveProfile };
