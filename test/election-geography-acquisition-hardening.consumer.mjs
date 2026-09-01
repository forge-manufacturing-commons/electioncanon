// ============================================================
// ELECTORAL GEOGRAPHY — ACQUISITION HARDENING  (Pre-import qualification pass, Phase 2/9)
//
// Tests harden.mjs's fetchWithRetry/runBounded/tallyOutcome/checksumOf
// directly, using FAKE fetch/sleep implementations — zero real network
// calls, zero real wall-clock delay, so this suite runs instantly and
// never depends on cvr.inecnigeria.org being reachable (matching this
// repo's own "no real network in npm test" discipline, same as
// election-geography-inec-reconciliation.consumer.mjs's own header).
//
// Run: node test/election-geography-acquisition-hardening.consumer.mjs
// ============================================================

import { fetchWithRetry, runBounded, tallyOutcome, checksumOf, OUTCOME } from "../supabase/geography-import/harden.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const noSleep = () => Promise.resolve(); // instant fake sleep — no real backoff delay in tests

console.log("\nELECTORAL GEOGRAPHY — acquisition hardening (retry/timeout/concurrency/checksum)\n");

// ============================================================
console.log("A — fetchWithRetry: SUCCESS PATHS");
// ============================================================
{
  const okFetch = async () => ({ ok: true, text: async () => JSON.stringify({ a: 1 }) });
  const r1 = await fetchWithRetry({ url: "https://x/1", fetchImpl: okFetch, sleepImpl: noSleep });
  ok("A1. a clean 2xx JSON response resolves OK on the first attempt", r1.outcome === OUTCOME.OK && r1.attempts === 1 && r1.data.a === 1);

  let calls = 0;
  const flakyThenOk = async () => {
    calls++;
    if (calls < 3) throw new Error("network blip");
    return { ok: true, text: async () => JSON.stringify({ recovered: true }) };
  };
  const r2 = await fetchWithRetry({ url: "https://x/2", fetchImpl: flakyThenOk, sleepImpl: noSleep, maxRetries: 5 });
  ok("A2. a request that fails twice then succeeds is reported OK, with attempts=3 (retried, not a permanent failure)",
    r2.outcome === OUTCOME.OK && r2.attempts === 3 && r2.data.recovered === true);

  ok("A3. parseFn is applied to the successful JSON body, so callers never see raw INEC shape by accident",
    (await fetchWithRetry({ url: "https://x/3", fetchImpl: okFetch, parseFn: (j) => ({ doubled: j.a * 2 }), sleepImpl: noSleep })).data.doubled === 2);
}

// ============================================================
console.log("\nB — fetchWithRetry: THE THREE-WAY OUTCOME NEVER COLLAPSES");
// ============================================================
{
  const alwaysHttpError = async () => ({ ok: false, status: 503, text: async () => "" });
  const r1 = await fetchWithRetry({ url: "https://x/4", fetchImpl: alwaysHttpError, sleepImpl: noSleep, maxRetries: 2 });
  ok("B1. a persistent HTTP failure (503) is REQUEST_FAILED after exhausting retries, never silently OK", r1.outcome === OUTCOME.REQUEST_FAILED && r1.data === null);
  ok("B2. attempts = maxRetries + 1 (the initial try plus every retry)", r1.attempts === 3);

  const alwaysTimeout = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
  });
  const r2 = await fetchWithRetry({ url: "https://x/5", fetchImpl: alwaysTimeout, sleepImpl: noSleep, maxRetries: 1, timeoutMs: 1 });
  ok("B3. a request that never resolves before its timeout is REQUEST_FAILED (TIMEOUT), never silently treated as empty",
    r2.outcome === OUTCOME.REQUEST_FAILED && r2.detail.kind === "TIMEOUT");

  const invalidJson = async () => ({ ok: true, text: async () => "<html>not json</html>" });
  const r3 = await fetchWithRetry({ url: "https://x/6", fetchImpl: invalidJson, sleepImpl: noSleep, maxRetries: 1 });
  ok("B4. a 2xx response with a non-JSON body is INVALID_RESPONSE, a DISTINCT outcome from REQUEST_FAILED",
    r3.outcome === OUTCOME.INVALID_RESPONSE && r3.outcome !== OUTCOME.REQUEST_FAILED);

  const genuinelyEmpty = async () => ({ ok: true, text: async () => JSON.stringify([{ "0": "--SELECT--", "selected": "0" }]) });
  const r4 = await fetchWithRetry({ url: "https://x/7", fetchImpl: genuinelyEmpty, parseFn: (j) => j[0], sleepImpl: noSleep });
  ok("B5. a genuinely empty (but successfully fetched) result is OK — NEVER confused with a failed request",
    r4.outcome === OUTCOME.OK);
  ok("B6. OK and REQUEST_FAILED/INVALID_RESPONSE are three genuinely distinct tags, not two collapsed into one",
    new Set([r1.outcome, r3.outcome, r4.outcome]).size === 3);
}

// ============================================================
console.log("\nC — RETRY COUNT IS BOUNDED (maxRetries is a real ceiling)");
// ============================================================
{
  let attempts = 0;
  const alwaysFails = async () => { attempts++; throw new Error("down"); };
  await fetchWithRetry({ url: "https://x/8", fetchImpl: alwaysFails, sleepImpl: noSleep, maxRetries: 3 });
  ok("C1. exactly maxRetries+1 attempts are made, never more, never fewer", attempts === 4);
}

// ============================================================
console.log("\nD — runBounded: CONCURRENCY IS ACTUALLY RESPECTED, NOT JUST CONFIGURED");
// ============================================================
{
  const items = Array.from({ length: 20 }, (_, i) => i);
  const { results, maxInFlight } = await runBounded(items, async (i) => {
    await noSleep();
    return i * 2;
  }, { concurrency: 3, staggerMs: 0, sleepImpl: noSleep });
  ok("D1. every item is processed exactly once, in order, none dropped", results.length === 20 && results.every((r, i) => r === i * 2));
  ok("D2. the observed max in-flight count never exceeds the configured concurrency cap", maxInFlight <= 3);

  const empty = await runBounded([], async () => 1, { concurrency: 5, sleepImpl: noSleep });
  ok("D3. an empty item list resolves cleanly, never hangs/throws", empty.results.length === 0);
}

// ============================================================
console.log("\nE — tallyOutcome: HONEST BOOKKEEPING");
// ============================================================
{
  const stats = { successfulRequests: 0, retriedRequests: 0, failedRequests: 0, invalidResponses: 0 };
  tallyOutcome(stats, { outcome: OUTCOME.OK, attempts: 1 });
  tallyOutcome(stats, { outcome: OUTCOME.OK, attempts: 3 });
  tallyOutcome(stats, { outcome: OUTCOME.REQUEST_FAILED, attempts: 6 });
  tallyOutcome(stats, { outcome: OUTCOME.INVALID_RESPONSE, attempts: 6 });
  ok("E1. two OKs counted as successful, one of them ALSO counted as retried (attempts>1)", stats.successfulRequests === 2 && stats.retriedRequests === 1);
  ok("E2. REQUEST_FAILED and INVALID_RESPONSE both count toward failedRequests", stats.failedRequests === 2);
  ok("E3. INVALID_RESPONSE is ALSO separately tracked, never merged away", stats.invalidResponses === 1);
}

// ============================================================
console.log("\nF — checksumOf: DETERMINISTIC, SENSITIVE TO REAL CHANGES");
// ============================================================
{
  const a = { states: [{ code: "delta", lgas: 25 }] };
  const b = { states: [{ code: "delta", lgas: 25 }] };
  const c = { states: [{ code: "delta", lgas: 26 }] };
  ok("F1. the same logical content produces the SAME checksum, run after run", checksumOf(a) === checksumOf(b));
  ok("F2. a genuinely different value produces a DIFFERENT checksum", checksumOf(a) !== checksumOf(c));
  ok("F3. the checksum is a real SHA-256 hex digest (64 hex chars), not a placeholder", /^[0-9a-f]{64}$/.test(checksumOf(a)));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
