// ============================================================
// FORGE ELECTION — CAMPAIGN BOOTSTRAP  (Loop 24 foundation)
//
// Exercises bootstrapCampaign() against a fake, STATEFUL Supabase client
// (MOCK evidence — no live database; see the Loop 24 final report for the
// honest LIVE/STRUCTURAL/MOCK classification). Unlike the simple
// call-recording fakes in business-scope/election-scope tests, this fake
// actually persists rows across calls within one test block, because
// CBOOT-2/3/4 (exactly one campaign, exactly one membership, idempotent
// repeat) can only be proven against STATE, not against a single call's
// arguments.
//
// Also proves the full authoritative chain end-to-end:
//   authenticated user -> bootstrapCampaign() -> resolveElectionScope()
//     -> projectElection() -> deriveReadiness()
// using ONLY the two already-tested modules from Loops 22/23
// (electionScope.js, projections.js, readiness.js) — this file adds no
// second scope-resolution mechanism of its own.
//
// Run: node test/election-bootstrap.consumer.mjs
// ============================================================

import { bootstrapCampaign, BOOTSTRAP, ACTOR_KIND } from "../src/os/electionBootstrap.js";
import { resolveElectionScope, ELECTION_SCOPE } from "../src/os/electionScope.js";
import { projectElection } from "../src/domains/election/projections.js";
import { deriveReadiness, READINESS_DIMENSION_STATUS as STATUS } from "../src/domains/election/studio/readiness.js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { stripComments } from "./lib/source.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const src = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));

const OWNER_A = "11111111-1111-1111-1111-111111111111";
const OWNER_B = "22222222-2222-2222-2222-222222222222";
const NON_MEMBER = "33333333-3333-3333-3333-333333333333";

/**
 * A STATEFUL fake — `store` persists across calls, so repeated bootstrap
 * calls against the SAME store can be checked for real idempotency, not
 * merely "this one call's arguments looked right". `asUser` fixes the
 * simulated `auth.uid()` for this client instance, mirroring how a real
 * Supabase client is bound to one authenticated session.
 */
// A real Postgres `gen_random_uuid()` never collides across tables/stores;
// a per-store incrementing counter would (two independent stores both
// minting "campaign-1"), which would make CBOOT-7's cross-tenant-id-
// difference assertion pass for the wrong reason. randomUUID() closes that.
function freshStore() { return { campaigns: [], campaign_members: [] }; }

function fakeClient(store, asUser) {
  return {
    from(table) {
      return {
        // The exact shape bootstrapCampaign() itself uses: .select().eq().ilike().maybeSingle()
        select() {
          return {
            eq(col1, val1) {
              return {
                ilike(col2, val2) {
                  return {
                    async maybeSingle() {
                      const rows = (store[table] ?? []).filter((r) =>
                        r[col1] === val1 && String(r[col2] ?? "").toLowerCase() === String(val2).toLowerCase());
                      return { data: rows[0] ?? null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row) {
          return {
            select() {
              return {
                async single() {
                  const id = randomUUID();
                  const newRow = { id, ...row };
                  store.campaigns.push(newRow);
                  return { data: { id, actor_kind: newRow.actor_kind }, error: null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(name, args) {
      if (name !== "ensure_campaign_owner") return { error: { message: `unknown rpc ${name}` } };
      const campaign = store.campaigns.find((c) => c.id === args.p_campaign_id);
      if (!campaign || campaign.created_by !== asUser) {
        return { error: { message: `ensure_campaign_owner: ${args.p_campaign_id} was not created by the caller` } };
      }
      const already = store.campaign_members.find(
        (m) => m.campaign_id === args.p_campaign_id && m.person === asUser);
      if (!already) {
        store.campaign_members.push({
          campaign_id: args.p_campaign_id, person: asUser, member_role: "owner", status: "active",
        });
      }
      return { error: null };
    },
  };
}

/** electionScope.js issues .eq("person", x).eq("status", "active") — a real
 *  chained double .eq(), not .eq().ilike(). Build the exact matching shape. */
function scopeClient(store, asUser) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(col1, val1) {
              return {
                async eq(col2, val2) {
                  const rows = (store[table] ?? []).filter((r) => r[col1] === val1 && r[col2] === val2);
                  return { data: rows, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

console.log("\nFORGE ELECTION — campaign bootstrap foundation\n");

// ============================================================
console.log("CBOOT-1/2/3 — authenticated owner bootstraps exactly one campaign + one owner membership");
// ============================================================
let storeA, resultA;
{
  storeA = freshStore();
  const client = fakeClient(storeA, OWNER_A);
  resultA = await bootstrapCampaign({ userId: OWNER_A, client, name: "Ada for LG Chair, Ward 7" });

  ok("CBOOT-1. authenticated owner bootstraps successfully", resultA.outcome === BOOTSTRAP.BOOTSTRAPPED && Boolean(resultA.campaignId));
  ok("CBOOT-2. bootstrap creates EXACTLY one campaign row", storeA.campaigns.length === 1);
  ok("CBOOT-3. bootstrap creates EXACTLY one owner membership row",
     storeA.campaign_members.length === 1 &&
     storeA.campaign_members[0].member_role === "owner" &&
     storeA.campaign_members[0].status === "active" &&
     storeA.campaign_members[0].person === OWNER_A);
}

// ============================================================
console.log("\nCBOOT-4 — repeated bootstrap (same user, same name) is idempotent");
// ============================================================
{
  const client = fakeClient(storeA, OWNER_A);
  const repeat = await bootstrapCampaign({ userId: OWNER_A, client, name: "Ada for LG Chair, Ward 7" });
  ok("CBOOT-4a. a second bootstrap call reuses the SAME campaign id, never a second row",
     repeat.outcome === BOOTSTRAP.BOOTSTRAPPED && repeat.campaignId === resultA.campaignId &&
     storeA.campaigns.length === 1);
  ok("CBOOT-4b. and reports created:false on the reuse, created:true only the first time",
     repeat.created === false && resultA.created === true);
  ok("CBOOT-4c. the membership table still holds exactly one row after the repeat",
     storeA.campaign_members.length === 1);
}

// ============================================================
console.log("\nCBOOT-5/6 — a non-member cannot resolve the campaign, with or without an explicit request");
// ============================================================
{
  const client = scopeClient(storeA, NON_MEMBER);
  const r = await resolveElectionScope({ userId: NON_MEMBER, client });
  ok("CBOOT-5. a person never added to the campaign resolves to NONE, not to it",
     r.outcome === ELECTION_SCOPE.NONE && r.campaignId === null);

  const rRequested = await resolveElectionScope({ userId: NON_MEMBER, client, requested: resultA.campaignId });
  ok("CBOOT-6. supplying the campaign's real id explicitly still does not grant access — REFUSED, not SCOPED",
     rRequested.outcome === ELECTION_SCOPE.REFUSED && rRequested.campaignId === null);
}

// ============================================================
console.log("\nCBOOT-7 — Campaign A cannot resolve Campaign B (and vice versa)");
// ============================================================
{
  const storeB = freshStore();
  const clientB = fakeClient(storeB, OWNER_B);
  const resultB = await bootstrapCampaign({ userId: OWNER_B, client: clientB, name: "Bayo for State House" });
  ok("CBOOT-7a. campaign B bootstraps independently of campaign A's store",
     resultB.outcome === BOOTSTRAP.BOOTSTRAPPED && resultB.campaignId !== resultA.campaignId);

  // Owner A's own store never contains campaign B at all — proving isolation
  // is structural (separate tenants, separate rows), not merely a filtered read.
  ok("CBOOT-7b. campaign A's owner never appears in campaign B's membership store",
     !storeB.campaign_members.some((m) => m.person === OWNER_A));
  ok("CBOOT-7c. campaign B's owner never appears in campaign A's membership store",
     !storeA.campaign_members.some((m) => m.person === OWNER_B));

  const rBRequestsA = await resolveElectionScope({
    userId: OWNER_B, client: scopeClient(storeA, OWNER_B), requested: resultA.campaignId,
  });
  ok("CBOOT-7d. campaign B's owner explicitly requesting campaign A's id is REFUSED",
     rBRequestsA.outcome === ELECTION_SCOPE.REFUSED);
}

// ============================================================
console.log("\nCBOOT-8 — scope is established by the MEMBERSHIP ROW, never by bootstrap's own return value");
// ============================================================
{
  // Structural: bootstrapCampaign() never computes or returns a "scope" —
  // it has no SCOPE/ELECTION_SCOPE concept at all, and never imports
  // electionScope.js. The only authority is the row resolveElectionScope()
  // independently re-reads.
  ok("CBOOT-8a. electionBootstrap.js imports no scope-resolution module — it cannot grant scope itself",
     !/electionScope|ELECTION_SCOPE|resolveElectionScope/.test(src("../src/os/electionBootstrap.js")));

  // Functional: resolve scope for OWNER_A completely independently of
  // `resultA` (the bootstrap call's own return value is never consulted
  // here) — it comes ONLY from re-querying storeA.campaign_members.
  const independentScope = await resolveElectionScope({ userId: OWNER_A, client: scopeClient(storeA, OWNER_A) });
  ok("CBOOT-8b. re-querying the membership table independently reproduces the same scope bootstrap established",
     independentScope.outcome === ELECTION_SCOPE.SCOPED && independentScope.campaignId === resultA.campaignId);

  // Adversarial: if the membership row is manually removed from the store
  // (simulating a revoked/never-committed membership), scope resolution
  // MUST refuse — bootstrap's own past success is not itself authority.
  const storeC = freshStore();
  const bootOnly = await bootstrapCampaign({ userId: OWNER_A, client: fakeClient(storeC, OWNER_A), name: "Test Only" });
  storeC.campaign_members.length = 0; // strip the membership row after the fact
  const afterRevoke = await resolveElectionScope({ userId: OWNER_A, client: scopeClient(storeC, OWNER_A) });
  ok("CBOOT-8c. removing the membership row after bootstrap revokes scope immediately — " +
     "bootstrap having once succeeded confers nothing on its own",
     bootOnly.outcome === BOOTSTRAP.BOOTSTRAPPED && afterRevoke.outcome === ELECTION_SCOPE.NONE);
}

// ============================================================
console.log("\nCBOOT-9 — no candidate/readiness facts are fabricated during campaign creation");
// ============================================================
{
  const row = storeA.campaigns[0];
  // LOOP 28 — `actor_kind` joins the expected set deliberately: it is a
  // taxonomy declaration (see electionBootstrap.js's own header), not a
  // candidate/office/party fact. The check still fails closed against
  // anything else being added.
  ok("CBOOT-9a. the persisted campaign row carries ONLY {id, name, created_by, actor_kind} — " +
     "no candidate/office/party field",
     Object.keys(row).sort().join(",") === "actor_kind,created_by,id,name");
  ok("CBOOT-9b. electionBootstrap.js imports no election event factory — it cannot write a Canon fact",
     !/candidateEvent|wardAssignedEvent|wardStatusEvent|events\.js/.test(src("../src/os/electionBootstrap.js")));
}

// ============================================================
console.log("\nCBOOT-10 — a freshly bootstrapped campaign with zero events produces an HONEST Canon");
// ============================================================
{
  const emptyView = projectElection([], resultA.campaignId);
  const readiness = deriveReadiness(emptyView);

  ok("CBOOT-10a. candidateRegistered is false — bootstrapping a campaign is never candidate registration",
     readiness.candidateRegistered === false);
  ok("CBOOT-10b. the CANDIDATE_REGISTERED claim is INCOMPLETE, per the EXISTING readiness semantics — never fabricated COMPLETE",
     readiness.claims[0].dimension === "CANDIDATE_REGISTERED" && readiness.claims[0].status === STATUS.INCOMPLETE);
  ok("CBOOT-10c. no ward-level claims exist yet (no WARD_ASSIGNMENT/WARD_STATUS_HEALTH to fabricate a state for)",
     readiness.claims.length === 1);
  ok("CBOOT-10d. the gap list contains exactly the one honest gap — a fresh campaign, not a crash and not zero gaps",
     readiness.gaps.length === 1 && readiness.gaps[0].status === STATUS.INCOMPLETE);
  ok("CBOOT-10e. known-ward coverage honestly states zero wards recorded, never a fabricated percentage",
     readiness.knownWardCoverage.knownWards === 0 &&
     /no wards recorded/i.test(readiness.knownWardCoverage.note));
  ok("CBOOT-10f. no readiness score or probability field exists anywhere on the result",
     !("score" in readiness) && !("percentReady" in readiness) && !("winProbability" in readiness));
}

// ============================================================
console.log("\nCBOOT-11 — a hostile/extra campaignId supplied by the caller has zero effect");
// ============================================================
{
  // Mirrors write.js's own P1 pattern (test/election-readiness.consumer.mjs) —
  // bootstrapCampaign() destructures ONLY {userId, client, name}, so a caller
  // (a compromised UI, a hand-crafted request, a model proposal) attempting
  // to smuggle in its OWN campaignId has no path to it: the id always comes
  // from the database's own insert/lookup, never from the call's arguments.
  const storeH = freshStore();
  const client = fakeClient(storeH, OWNER_A);
  const hostile = await bootstrapCampaign({
    userId: OWNER_A, client, name: "Hostile Test Campaign",
    campaignId: "attacker-supplied-id", organisation_id: "org-HOSTILE", approved: true,
  });
  ok("CBOOT-11. the resolved campaignId is the database's own generated id, never the caller-supplied one",
     hostile.outcome === BOOTSTRAP.BOOTSTRAPPED && hostile.campaignId !== "attacker-supplied-id" &&
     storeH.campaigns[0].id === hostile.campaignId);
}

// ============================================================
console.log("\nCBOOT-12 — bootstrapCampaign() never returns a readiness/Canon claim of its own");
// ============================================================
{
  // The Canon-bypass boundary: readiness must ALWAYS come from re-folding
  // persisted election_events (projectElection() -> deriveReadiness()),
  // never from whatever state bootstrap happened to construct in memory.
  // Structural: no readiness vocabulary appears in bootstrap's own source.
  ok("CBOOT-12a. electionBootstrap.js's source contains no readiness/claim/gap vocabulary at all",
     !/readiness|claims|gaps|deriveReadiness/i.test(src("../src/os/electionBootstrap.js")));
  ok("CBOOT-12b. the bootstrap result object itself carries no readiness-shaped field",
     !("readiness" in resultA) && !("claims" in resultA) && !("gaps" in resultA) &&
     !("candidateRegistered" in resultA));
}

// ============================================================
console.log("\nCBOOT-13 — ACTOR_KIND taxonomy (Loop 28) — declaration only, never a readiness fact");
// ============================================================
{
  ok("CBOOT-13a. resultA (created with no actorKind argument) defaulted to CANDIDATE_CAMPAIGN — " +
     "the true historical fact for every campaign created before this loop",
     resultA.actorKind === ACTOR_KIND.CANDIDATE_CAMPAIGN);

  const storeNgo = freshStore();
  const ngo = await bootstrapCampaign({
    userId: OWNER_A, client: fakeClient(storeNgo, OWNER_A),
    name: "Election Watch NGO", actorKind: ACTOR_KIND.NGO_CSO,
  });
  ok("CBOOT-13b. an explicitly declared actor kind is recorded and returned faithfully",
     ngo.outcome === BOOTSTRAP.BOOTSTRAPPED && ngo.actorKind === ACTOR_KIND.NGO_CSO &&
     storeNgo.campaigns[0].actor_kind === ACTOR_KIND.NGO_CSO);

  const garbage = await bootstrapCampaign({
    userId: OWNER_A, client: fakeClient(freshStore(), OWNER_A),
    name: "Garbage Actor Kind Test", actorKind: "definitely_not_a_real_kind",
  });
  ok("CBOOT-13c. an unrecognised actorKind is refused outright — never coerced to a default, never silently accepted",
     garbage.outcome === BOOTSTRAP.INVALID_ACTOR_KIND);

  // IMMUTABILITY — a repeat bootstrap call for the SAME (user, name) with a
  // DIFFERENT actorKind must not relabel the existing campaign. An actor
  // does not get to reclassify itself after the fact any more than a
  // membership role does elsewhere in this project.
  const relabelAttempt = await bootstrapCampaign({
    userId: OWNER_A, client: fakeClient(storeNgo, OWNER_A),
    name: "Election Watch NGO", actorKind: ACTOR_KIND.SECURITY_COORDINATION_ORGANISATION,
  });
  ok("CBOOT-13d. actor_kind is IMMUTABLE after creation — a repeat bootstrap with a different kind changes nothing",
     relabelAttempt.outcome === BOOTSTRAP.BOOTSTRAPPED && relabelAttempt.actorKind === ACTOR_KIND.NGO_CSO &&
     relabelAttempt.campaignId === ngo.campaignId && storeNgo.campaigns.length === 1 &&
     storeNgo.campaigns[0].actor_kind === ACTOR_KIND.NGO_CSO);

  ok("CBOOT-13e. every value ACTOR_KIND declares is one of exactly the six actors Loop 28's brief names — no open catch-all",
     Object.values(ACTOR_KIND).sort().join(",") ===
       ["candidate_campaign", "campaign_support_organisation", "monitoring_group",
        "ngo_cso", "observer_organisation", "security_coordination_organisation"].sort().join(","));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
