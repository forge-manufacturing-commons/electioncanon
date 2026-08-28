// ============================================================
// URL NORMALIZATION  (Election Forge Alpha 1.0)
//
// Strips attribution/tracking parameters (utm_*, and other common referral
// params) from the visible browser URL via the History API — no reload, no
// effect on authentication, no loss of any parameter the application
// actually uses. Small and reusable rather than scattered inline, since
// more than one product surface may want it.
// ============================================================

const TRACKING_PARAM_PATTERN = /^(utm_|gclid$|fbclid$|msclkid$|ref$|referrer$)/i;

/** Removes tracking params from the current URL in place, preserving every
 *  other query param, the path, and the hash. No-op if nothing changes. */
export function normalizeUrl({ location = window.location, history = window.history } = {}) {
  const url = new URL(location.href);
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM_PATTERN.test(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return changed;
}

export default { normalizeUrl };
