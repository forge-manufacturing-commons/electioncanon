// ============================================================
// ELECTORAL GEOGRAPHY — ACQUISITION HARDENING PRIMITIVES  (Pre-import qualification pass, Phase 2)
//
// Generic, INJECTABLE retry/backoff and bounded-concurrency helpers, used
// by acquire-national-snapshot.mjs's real crawl. `fetchImpl`/`sleepImpl`
// are always passed in, never called globally by name — this is what lets
// test/election-geography-acquisition-hardening.consumer.mjs exercise
// every failure mode (timeout, HTTP failure, invalid JSON, retry-then-
// succeed, permanent failure) with a FAKE fetch and an instant fake sleep,
// with zero real network calls and zero real wall-clock delay.
//
// THE THREE-WAY OUTCOME IS THE WHOLE POINT. A caller must never be able to
// confuse "INEC really has zero rows here" with "we couldn't find out" —
// see fetchWithRetry()'s own return shape.
// ============================================================

import { createHash } from "node:crypto";

export const OUTCOME = Object.freeze({
  OK: "OK",
  REQUEST_FAILED: "REQUEST_FAILED", // timeout, network error, or HTTP non-2xx, after all retries exhausted
  INVALID_RESPONSE: "INVALID_RESPONSE", // a 2xx response whose body is not valid JSON, after all retries exhausted
});

/**
 * Fetch `url` via `fetchImpl` (a function with fetch()'s own signature —
 * real `fetch` in production, a scripted fake in tests), with a timeout,
 * and retry-with-exponential-backoff up to `maxRetries` additional
 * attempts. Never throws — every path returns a tagged outcome.
 *
 * @param parseFn  applied to the successfully-parsed JSON body on OK —
 *   kept as a parameter (not hardcoded to parseCascadeResponse) so this
 *   module has no dependency on INEC's specific response shape at all.
 */
export async function fetchWithRetry({
  url, fetchImpl, parseFn = (x) => x,
  timeoutMs = 10000, maxRetries = 5, baseBackoffMs = 500,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {},
}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        lastError = { kind: "HTTP_FAILURE", status: res.status };
      } else {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          return { outcome: OUTCOME.OK, data: parseFn(json), attempts: attempt };
        } catch {
          lastError = { kind: "INVALID_RESPONSE", bodyPreview: String(text).slice(0, 200) };
        }
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = { kind: err?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR", message: String(err?.message ?? err) };
    }
    if (attempt <= maxRetries) {
      onRetry({ attempt, url, ...lastError });
      await sleepImpl(baseBackoffMs * 2 ** (attempt - 1));
    }
  }
  return {
    outcome: lastError?.kind === "INVALID_RESPONSE" ? OUTCOME.INVALID_RESPONSE : OUTCOME.REQUEST_FAILED,
    data: null, attempts: maxRetries + 1, detail: lastError,
  };
}

/** Bounded-concurrency runner with a small stagger between request
 *  starts — `sleepImpl` is injectable so tests run instantly while still
 *  proving the concurrency cap is respected (see the test file's own
 *  "never more than N in flight" assertion). */
export async function runBounded(items, worker, { concurrency = 3, staggerMs = 60, sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const results = new Array(items.length);
  let cursor = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  async function lane() {
    while (cursor < items.length) {
      const i = cursor++;
      await sleepImpl(staggerMs);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        results[i] = await worker(items[i], i);
      } finally {
        inFlight--;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return { results, maxInFlight };
}

/** Honest request-outcome tally — an OK with attempts>1 counts as
 *  "retried" (it eventually succeeded), never conflated with a permanent
 *  failure. */
export function tallyOutcome(stats, result) {
  if (result.outcome === OUTCOME.OK) {
    stats.successfulRequests += 1;
    if (result.attempts > 1) stats.retriedRequests += 1;
  } else if (result.outcome === OUTCOME.INVALID_RESPONSE) {
    stats.invalidResponses += 1;
    stats.failedRequests += 1;
  } else {
    stats.failedRequests += 1;
  }
  return stats;
}

/** Deterministic SHA-256 of a JSON-serializable value — used to fingerprint
 *  an acquired snapshot so the exact imported source can later be
 *  identified (see the snapshot manifest's own `snapshot_sha256`). */
export function checksumOf(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export default { OUTCOME, fetchWithRetry, runBounded, tallyOutcome, checksumOf };
