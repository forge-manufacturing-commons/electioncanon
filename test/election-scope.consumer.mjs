// ============================================================
// FORGE ELECTION — CAMPAIGN SCOPE RESOLUTION  (Loop 23 tenant foundation)
//
// Exercises resolveElectionScope() against a fake Supabase client — the
// SAME harness style test/business-scope.consumer.mjs uses for
// resolveBusinessScope(), applied to campaign_members instead of
// organisation_members. Also proves the END-TO-END wire: an authenticated
// user's RESOLVED campaign id, and only that id, is what ever reaches
// projectElection() — never a raw request-supplied string.
//
// Run: node test/election-scope.consumer.mjs
// ============================================================

import { resolveElectionScope, ELECTION_SCOPE, CAMPAIGN_MEMBERSHIP_COLUMNS, isElectionScoped }
  from "../src/os/electionScope.js";
import { projectElection } from "../src/domains/election/projections.js";
import { candidateEvent } from "../src/domains/election/events.js";
import { ACTOR_KIND } from "../src/os/electionBootstrap.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

/**
 * SQL-specific comment stripper — test/lib/source.mjs's stripComments()
 * only understands `//`/`/* *\/`, not SQL's `--` line comments, so reusing
 * it here would leave this file's own prose (which discusses phrases like
 * "using (true)") inside the "code" the checks below scan, exactly the R7
 * failure mode stripComments()'s own header describes. Verified safe by
 * grep: neither migration's single-quoted string literals contain a
 * literal `--`, so a per-line strip cannot clip real SQL content.
 */
const sqlCode = (p) => readFileSync(new URL(p, import.meta.url), "utf8")
  .split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");

const OWNER = "11111111-1111-1111-1111-111111111111";
const CAMP_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CAMP_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OTHER_PERSON_CAMP = "cccccccc-cccc-cccc-cccc-cccccccccccc";

/** Fake client. Records every call so tests can assert on what did NOT happen. */
function fakeClient({ rows = null, error = null, throws = false } = {}) {
  const calls = { tables: [], columns: [], filters: [] };
  return {
    calls,
    from(table) {
      calls.tables.push(table);
      return {
        select(cols) {
          calls.columns.push(cols);
          return {
            eq(col1, val1) {
              calls.filters.push(`${col1}=${val1}`);
              return {
                eq(col2, val2) {
                  calls.filters.push(`${col2}=${val2}`);
                  return (async () => { if (throws) throw new Error("network down"); return { data: rows, error }; })();
                },
              };
            },
          };
        },
      };
    },
  };
}

console.log("\nFORGE ELECTION — campaign scope resolution\n");

// ============================================================
console.log("CASE 1 — no identity at all");
// ============================================================
{
  const c = fakeClient({ rows: [] });
  const r = await resolveElectionScope({ userId: null, client: c });
  ok("1. no userId -> UNAUTHENTICATED", r.outcome === ELECTION_SCOPE.UNAUTHENTICATED);
  ok("1. and the membership table is never even queried", c.calls.tables.length === 0);
}

// ============================================================
console.log("\nCASE 2 — authenticated, zero memberships");
// ============================================================
{
  const c = fakeClient({ rows: [] });
  const r = await resolveElectionScope({ userId: OWNER, client: c });
  ok("2. zero memberships -> NONE, not a guessed campaign", r.outcome === ELECTION_SCOPE.NONE && r.campaignId === null);
  ok("2. queries campaign_members for exactly this person, active only",
     c.calls.tables[0] === "campaign_members" &&
     c.calls.filters.includes(`person=${OWNER}`) && c.calls.filters.includes("status=active"));
  ok("2. reads exactly the declared column set", c.calls.columns[0] === CAMPAIGN_MEMBERSHIP_COLUMNS);
}

// ============================================================
console.log("\nCASE 3 — exactly one membership: the confident, ordinary case");
// ============================================================
{
  const c = fakeClient({ rows: [{ campaign_id: CAMP_A, member_role: "owner", status: "active" }] });
  const r = await resolveElectionScope({ userId: OWNER, client: c });
  ok("3. exactly one membership -> SCOPED to it, automatically", r.outcome === ELECTION_SCOPE.SCOPED && r.campaignId === CAMP_A);
  ok("3. and the role travels with it", r.role === "owner");
  ok("3. isElectionScoped() agrees", isElectionScoped(r) === true);
}

// ============================================================
console.log("\nCASE 4 — two memberships: AMBIGUOUS, never a silent first-match default");
// ============================================================
{
  const c = fakeClient({ rows: [
    { campaign_id: CAMP_A, member_role: "owner", status: "active" },
    { campaign_id: CAMP_B, member_role: "staff", status: "active" },
  ] });
  const r = await resolveElectionScope({ userId: OWNER, client: c });
  ok("4. two active memberships -> AMBIGUOUS", r.outcome === ELECTION_SCOPE.AMBIGUOUS && r.campaignId === null);
  ok("4. both candidates are named, so the caller can ask \"which campaign?\"",
     r.candidates.includes(CAMP_A) && r.candidates.includes(CAMP_B) && r.candidates.length === 2);
  ok("4. isElectionScoped() correctly refuses an ambiguous result", isElectionScoped(r) === false);
}

// ============================================================
console.log("\nCASE 5 — an explicit choice, VERIFIED against real membership");
// ============================================================
{
  const c = fakeClient({ rows: [
    { campaign_id: CAMP_A, member_role: "owner", status: "active" },
    { campaign_id: CAMP_B, member_role: "staff", status: "active" },
  ] });
  const r = await resolveElectionScope({ userId: OWNER, client: c, requested: CAMP_B });
  ok("5. an explicit choice that IS a real membership resolves to it",
     r.outcome === ELECTION_SCOPE.SCOPED && r.campaignId === CAMP_B && r.role === "staff");
  ok("5. and states it was an explicit selection, not the fallback default",
     r.because === "explicit selection, verified against membership");
}

// ============================================================
console.log("\nCASE 6 — ADVERSARIAL: a client-supplied campaign id the caller does not belong to");
// ============================================================
{
  // The exact boundary Loop 23 exists to enforce: a request body / URL /
  // model-proposed campaign id is a HINT at most, never an authority grant.
  const c = fakeClient({ rows: [{ campaign_id: CAMP_A, member_role: "owner", status: "active" }] });
  const r = await resolveElectionScope({ userId: OWNER, client: c, requested: OTHER_PERSON_CAMP });
  ok("6. a campaign the caller does not belong to is REFUSED, never granted on its own say-so",
     r.outcome === ELECTION_SCOPE.REFUSED && r.campaignId === null);
  ok("6. the refusal names neither the requested campaign nor silently falls back to CAMP_A",
     r.campaignId !== CAMP_A && r.campaignId !== OTHER_PERSON_CAMP);
  ok("6. isElectionScoped() refuses it too", isElectionScoped(r) === false);
}

// ============================================================
console.log("\nCASE 7 — the membership read itself fails: state is UNKNOWN, never assumed empty");
// ============================================================
{
  const c1 = fakeClient({ rows: null, error: { message: "connection reset" } });
  const r1 = await resolveElectionScope({ userId: OWNER, client: c1 });
  ok("7a. a query error -> READ_FAILED, not silently treated as zero memberships",
     r1.outcome === ELECTION_SCOPE.READ_FAILED && /connection reset/.test(r1.error));

  const c2 = fakeClient({ throws: true });
  const r2 = await resolveElectionScope({ userId: OWNER, client: c2 });
  ok("7b. a thrown network error is caught and reported the same way, not left to crash the caller",
     r2.outcome === ELECTION_SCOPE.READ_FAILED && /network down/.test(r2.error));
}

// ============================================================
console.log("\nCASE 8 — REVOKED membership never counts, even if the row still exists");
// ============================================================
{
  const c = fakeClient({ rows: [] });
  const r = await resolveElectionScope({ userId: OWNER, client: c });
  ok("8. a person with only a revoked membership resolves to NONE, not to the revoked campaign",
     r.outcome === ELECTION_SCOPE.NONE);
  ok("8. and the query itself asked for active status only (never post-filtered)",
     c.calls.filters.includes("status=active"));
}

// ============================================================
console.log("\nCASE 9 — END-TO-END: the RESOLVED campaign id, and only it, reaches projectElection()");
// ============================================================
{
  // Two campaigns' logs are mixed in a single array, exactly as O1-O4 in
  // test/election-readiness.consumer.mjs already prove at the fold layer —
  // this proves the LAYER ABOVE the fold as well: a real caller never has
  // a bare string to hand projectElection() except what resolveElectionScope()
  // itself returned.
  const mixedLog = [
    candidateEvent({ candidate: "cand-A", campaign: CAMP_A, name: "Candidate A", office: "Ward Councillor",
      constituency: "District A", party: "Independent" }),
    candidateEvent({ candidate: "cand-B", campaign: CAMP_B, name: "Candidate B", office: "Ward Councillor",
      constituency: "District B", party: "Independent" }),
  ];

  const cOwnerOfA = fakeClient({ rows: [{ campaign_id: CAMP_A, member_role: "owner", status: "active" }] });
  const scopeForOwnerOfA = await resolveElectionScope({ userId: OWNER, client: cOwnerOfA });
  const viewForOwnerOfA = projectElection(mixedLog, scopeForOwnerOfA.campaignId);
  ok("9a. a member of campaign A resolves and folds to see ONLY campaign A's candidate",
     Object.keys(viewForOwnerOfA.candidates).length === 1 && viewForOwnerOfA.candidates["cand-A"] &&
     !viewForOwnerOfA.candidates["cand-B"]);

  // ADVERSARIAL — the caller tries to hand projectElection() campaign B's id
  // directly (e.g. a compromised UI, a hand-crafted request), bypassing
  // resolveElectionScope() entirely. This is not resolveElectionScope()'s
  // job to stop (it never ran) — it demonstrates why the calling
  // discipline (ALWAYS resolve first, NEVER accept a bare id from
  // elsewhere) is the actual enforcement point, matching O5/O6's proof that
  // executeElectionWrite() enforces the identical discipline on the write
  // side. Documented here, not silently assumed.
  const viewIfBypassed = projectElection(mixedLog, CAMP_B);
  ok("9b. (adversarial control) a bare, unresolved campaign id folds to THAT campaign's data — " +
     "proving the guarantee lives in never calling projectElection() with anything but a resolved id",
     Object.keys(viewIfBypassed.candidates).length === 1 && viewIfBypassed.candidates["cand-B"]);

  const cAmbiguous = fakeClient({ rows: [
    { campaign_id: CAMP_A, member_role: "owner", status: "active" },
    { campaign_id: CAMP_B, member_role: "staff", status: "active" },
  ] });
  const scopeAmbiguous = await resolveElectionScope({ userId: OWNER, client: cAmbiguous });
  const viewIfAmbiguous = projectElection(mixedLog, scopeAmbiguous.campaignId);
  ok("9c. an AMBIGUOUS resolution (campaignId: null) folds to an EMPTY Canon, never one candidate's data by accident",
     scopeAmbiguous.outcome === ELECTION_SCOPE.AMBIGUOUS &&
     Object.keys(viewIfAmbiguous.candidates).length === 0);
}

// ============================================================
console.log("\nCASE 10 — MIGRATION STRUCTURE: RLS and idempotency, checked at the source-text\n" +
            "          level (no live database — see the final report's honest classification)");
// ============================================================
{
  const membershipSql = sqlCode("../supabase/migrations/20260823000000_campaign_membership.sql");
  const eventsSql = sqlCode("../supabase/migrations/20260823000001_election_events.sql");

  /** Extract one named policy's body — scoping every check to the ACTUAL
   *  policy clause, never "anywhere in the file" (which would let this
   *  same migration's own header prose, e.g. its "organisations ... using
   *  (true)" comparison, satisfy a check meant to prove real SQL). */
  const policyBody = (sql, name) => {
    const m = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`));
    return m ? m[0] : "";
  };

  const campaignsRead = policyBody(membershipSql, "campaigns read own membership");
  const campaignsInsert = policyBody(membershipSql, "campaigns insert as self");
  const membersReadSame = policyBody(membershipSql, "campaign members read same campaign");
  const eventsRead = policyBody(eventsSql, "election events read own campaign");
  const eventsInsert = policyBody(eventsSql, "election events insert own campaign");

  ok("10a. campaigns/campaign_members/election_events policies exist and are non-empty",
     [campaignsRead, campaignsInsert, membersReadSame, eventsRead, eventsInsert].every((b) => b.length > 0));

  ok("10b. NONE of the five tenant policies grants a bare `using (true)` — " +
     "unlike organisations/component_jobs, campaign data is never publicly readable",
     ![campaignsRead, campaignsInsert, membersReadSame, eventsRead, eventsInsert]
       .some((b) => /using\s*\(\s*true\s*\)/.test(b)));

  ok("10c. every read/insert policy on election_events is scoped through an EXISTS against campaign_members",
     /exists\s*\(\s*select 1 from campaign_members/.test(eventsRead) &&
     /exists\s*\(\s*select 1 from campaign_members/.test(eventsInsert));

  ok("10d. the election_events INSERT policy also pins actor = auth.uid() — " +
     "database-level attribution, not merely application-code discipline",
     /actor\s*=\s*auth\.uid\(\)/.test(eventsInsert));

  const eventsTableBody = eventsSql.match(/create table if not exists election_events\s*\(([\s\S]*?)\n\);/)?.[1] ?? "";
  ok("10e. event_id carries a real, in-schema UNIQUE constraint — the one idempotency mechanism, " +
     "matching business_events.event_id rather than inventing a second one",
     /^\s*event_id\s+text\s+not null\s+unique\s*,?\s*$/m.test(eventsTableBody));
}

// ============================================================
console.log("\nCASE 11 — MIGRATION STRUCTURE (Loop 28): actor_kind taxonomy, JS/SQL parity");
// ============================================================
{
  const actorKindSql = sqlCode("../supabase/migrations/20260824000000_campaign_actor_kind.sql");

  const enumBody = actorKindSql.match(/create type campaign_actor_kind as enum \(([\s\S]*?)\);/)?.[1] ?? "";
  const sqlValues = [...enumBody.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  ok("11a. the SQL enum's values are EXACTLY ACTOR_KIND's values — no drift between JS and schema",
     sqlValues.join(",") === Object.values(ACTOR_KIND).sort().join(","));

  ok("11b. actor_kind is NOT NULL with a default of 'candidate_campaign' — " +
     "every pre-Loop-28 campaign is truthfully classified, never left UNKNOWN by the migration itself",
     /actor_kind campaign_actor_kind not null default 'candidate_campaign'/.test(actorKindSql));

  ok("11c. no UPDATE policy is granted anywhere for campaigns — actor_kind (like every other campaigns column) " +
     "is immutable after creation at the database layer, not merely by application discipline",
     !/create policy[^;]*campaigns[^;]*for update/i.test(sqlCode("../supabase/migrations/20260823000000_campaign_membership.sql")) &&
     !/create policy[^;]*campaigns[^;]*for update/i.test(actorKindSql));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
