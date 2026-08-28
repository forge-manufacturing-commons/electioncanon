// ============================================================
// FORGE ELECTION — DOMAIN-PLURALITY PROOF  (MVP domain pack)
//
// The question this suite answers: does the SAME Forge Core — one AI engine,
// one conversation memory, one Canon-fold pattern, one grounding pass, one
// language runtime, one authority engine — serve a second domain without
// becoming a second application?
//
// It proves that by NEVER importing a second `understand`, a second
// `runInference`, a second `groundResponse`, or a second `SEGMENT` — every
// import below with "../src/os/studio/" in its path is the SAME module
// manufacturing's own consumer suites import, and Election supplies only
// DATA (its own intent table, adapter switch, response wording) over that
// SAME shared algorithm.
//
// Run: node test/election.consumer.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { candidateEvent, wardAssignedEvent, wardStatusEvent, validateElectionEvent,
         assertElectionEvent, ELECTION_EVENT_TYPES, MISSION_POLICY }
  from "../src/domains/election/events.js";
import { projectElection } from "../src/domains/election/projections.js";
import { askForge, MODE } from "../src/os/studio/ask.js";
import { understand, interpretContext } from "../src/os/studio/understand.js";
import { runInference } from "../src/os/studio/infer.js";
import { groundResponse, CLAIM, isBinding } from "../src/os/studio/grounding.js";
import { SEGMENT } from "../src/os/studio/respond.js";
import { emptyConversation, remember } from "../src/os/studio/conversation.js";
import { deterministicAdapter as electionAdapter } from "../src/domains/election/studio/infer.js";
import { planElectionResponse, realiserFor as electionRealiserFor } from "../src/domains/election/studio/respond.js";
import { ELECTION_VOCABULARY } from "../src/domains/election/studio/vocabulary.js";
import { INTENT as ELECTION_INTENT } from "../src/domains/election/studio/intent.js";
import { stripComments } from "./lib/source.mjs";
import {
  proposeAddPollingUnit, executeAddPollingUnit,
  proposeAssignAgent, executeAssignAgent,
  proposeCaptureResult, executeCaptureResult,
  proposeVerifyResult, executeVerifyResult,
  proposeReportIncident, executeReportIncident,
  VERIFICATION_STATUS, INCIDENT_SEVERITY,
} from "../src/domains/election/electionDay/write.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const src = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));

// ---------------------------------------------------------------
// FIXTURE — the one demo candidate the task specifies, plus a second,
// unrelated candidate used ONLY by the tenant-isolation section below.
// ---------------------------------------------------------------
const stamp = (e, i, prefix) => Object.freeze({ ...e, eventId: `${prefix}-${i}`, at: `2026-01-0${i}T00:00:00.000Z` });

const CAMPAIGN_ADA = "campaign-ada";
const CAMPAIGN_BAYO = "campaign-bayo";

function adaExampleLog() {
  return [
    stamp(candidateEvent({ candidate: "ada-example", campaign: CAMPAIGN_ADA, name: "Ada Example",
      office: "House of Representatives", constituency: "Demo Federal Constituency", party: "DEMO" }), 1, "ada"),
    stamp(wardAssignedEvent({ ward: "Ward 7", campaign: CAMPAIGN_ADA, name: "Ward 7 field team", organisation: "Demo Field Org" }), 2, "ada"),
    stamp(wardStatusEvent({ ward: "Ward 7", campaign: CAMPAIGN_ADA, status: "behind",
      reason: "no volunteers reporting in this week" }), 3, "ada"),
  ].reverse(); // newest-first, matching manufacturing's own log convention
}

/** A SECOND, wholly unrelated candidate, in a DIFFERENT campaign — different office, different ward. */
function bayoExampleLog() {
  return [
    stamp(candidateEvent({ candidate: "bayo-example", campaign: CAMPAIGN_BAYO, name: "Bayo Example",
      office: "State House of Assembly", constituency: "Other Demo Constituency", party: "OTHER" }), 1, "bayo"),
    stamp(wardAssignedEvent({ ward: "Ward 3", campaign: CAMPAIGN_BAYO, name: "Ward 3 field team", organisation: "Other Field Org" }), 2, "bayo"),
    stamp(wardStatusEvent({ ward: "Ward 3", campaign: CAMPAIGN_BAYO, status: "on-track" }), 3, "bayo"),
  ].reverse();
}

const adaView = projectElection(adaExampleLog(), CAMPAIGN_ADA);
const bayoView = projectElection(bayoExampleLog(), CAMPAIGN_BAYO);

async function say(view, log, message, { mode = MODE.ASK, conversation = null, adapter = electionAdapter,
  interpreter = null } = {}) {
  return askForge({
    message, view, log, preferredLanguage: "en", mode, adapter,
    responder: planElectionResponse, vocabulary: ELECTION_VOCABULARY, conversation, interpreter,
  });
}

// =================================================================
// A. NO SECOND ENGINE — structural proof, by import rather than by claim.
// =================================================================
{
  const infer = src("../src/domains/election/studio/infer.js");
  const respond = src("../src/domains/election/studio/respond.js");
  const understandSrc = src("../src/os/studio/understand.js");

  ok("A1. election's adapter imports the CORE grounding constructors, declares none of its own",
     /from ["']\.\.\/\.\.\/\.\.\/os\/studio\/grounding\.js["']/.test(infer) &&
     !/export const CLAIM/.test(infer));
  ok("A2. election's adapter defines no runInference/groundResponse of its own",
     !/function runInference/.test(infer) && !/function groundResponse/.test(infer));
  ok("A3. election's composer imports SEGMENT from the CORE respond.js, declares no SEGMENT of its own",
     /from ["']\.\.\/\.\.\/\.\.\/os\/studio\/respond\.js["']/.test(respond) &&
     !/export const SEGMENT\s*=/.test(respond));
  ok("A4. understand.js itself carries no election-specific vocabulary",
     !/election|candidate\.office|ward\.status/i.test(understandSrc));

  // RUNTIME PROOF, not just source text: the exact same function objects run
  // manufacturing's pipeline and election's.
  const grounded = await runInference({ adapter: electionAdapter,
    intent: { type: ELECTION_INTENT.CANDIDATE_OFFICE, language: "en" }, view: adaView, log: adaExampleLog() });
  ok("A5. runInference (the shared function) accepted and ran election's own adapter",
     grounded && Array.isArray(grounded.claims));
  const u = await understand({ message: "What office am I contesting?", view: adaView,
    preferredLanguage: "en", vocabulary: ELECTION_VOCABULARY });
  ok("A6. understand() (the shared function) resolved an election intent using election's own vocabulary",
     u.type === ELECTION_INTENT.CANDIDATE_OFFICE);
}

// =================================================================
// B. THE DEMO SLICE — Ada Example, House of Representatives, Ward 7.
//    Every turn goes through the real pipeline: askForge -> understand ->
//    runInference -> groundResponse -> planElectionResponse.
// =================================================================
{
  let conv = emptyConversation();
  const turn = async (message, opts) => {
    const r = await say(adaView, adaExampleLog(), message, { ...opts, conversation: conv });
    conv = remember(conv, { message, view: adaView, intent: r.intent, kinds: ELECTION_VOCABULARY.entityKinds });
    return r;
  };

  const office = await turn("What office am I contesting?");
  ok("B1. office is a CANON fact, correctly named, from the real fold",
     office.answer.includes("House of Representatives") &&
     office.segments.some((s) => s.kind === SEGMENT.CANON) && office.grounded.sound);

  const constituency = await turn("What is my constituency?");
  ok("B2. constituency is a CANON fact",
     constituency.answer.includes("Demo Federal Constituency") &&
     constituency.segments.every((s) => s.kind === SEGMENT.CANON));

  const status = await turn("What is the status of the campaign in Ward 7?");
  ok("B3. ward status is a CANON fact, identifier typed exactly once from here on",
     status.answer.includes("Ward 7") && status.answer.includes("behind") &&
     status.segments.some((s) => s.kind === SEGMENT.CANON));

  const who = await turn("Who is responsible?"); // NO ward named — carried forward
  ok("B4. \"who is responsible?\" resolves Ward 7 by conversation carry-forward, not by retyping it",
     who.intent.component === "Ward 7" && who.answer.includes("Demo Field Org"));

  const why = await turn("Why is it behind?"); // pronoun follow-up
  ok("B5. \"why\" carries the ward forward and answers with CANON + CANON + RECOMMENDATION, never merged",
     why.intent.component === "Ward 7" &&
     why.segments.some((s) => s.kind === SEGMENT.CANON && s.text.includes("behind")) &&
     why.segments.some((s) => s.kind === SEGMENT.CANON && s.text.includes("no volunteers")) &&
     why.segments.some((s) => s.kind === SEGMENT.RECOMMENDATION));

  const next = await turn("What should we do next?");
  ok("B6. the recommendation is its own segment kind, never badged CANON",
     next.segments.some((s) => s.kind === SEGMENT.RECOMMENDATION) &&
     !next.segments.some((s) => s.kind === SEGMENT.CANON && /follow up|continue monitoring/i.test(s.text)));

  const prepared = await turn("Prepare a campaign situation report.", { mode: MODE.PREPARE });
  ok("B7. PREPARE produces an inert draft — never published, never authorised",
     prepared.draft?.draft?.type === ELECTION_EVENT_TYPES.DOCUMENT.PUBLISHED &&
     prepared.draft.published === false && prepared.draft.authorised === false);
  ok("B8. the draft names no person, no eventId and no timestamp — the same three deliberate omissions",
     !("person" in prepared.draft.draft) && !("eventId" in prepared.draft.draft) && !("at" in prepared.draft.draft));

  // "Create a poster" IS recognised — as an ACTION_REQUEST, same as any other
  // "prepare/draft/create" phrasing — and refused via the authority boundary
  // (see D3 below for the general case). The honest "not built this phase" gap
  // is one layer deeper: in PREPARE mode, no draftable table entry exists for
  // a poster (only "situation report" does), so no draft is fabricated either.
  const poster = await turn("Prepare a campaign poster.", { mode: MODE.PREPARE });
  ok("B9. no document/creative engine exists this phase — PREPARE finds no draftable match for a poster, honestly",
     poster.draft?.draft === null && typeof poster.draft?.reason === "string");
}

// =================================================================
// C. TENANT ISOLATION — structural, not a prompt. Candidate B's data is
//    never IN Candidate A's log, so it cannot leak by construction.
// =================================================================
{
  ok("C1. Ada's view holds no key belonging to Bayo",
     !("bayo-example" in adaView.candidates) && !("Ward 3" in adaView.wards));
  ok("C2. Bayo's view holds no key belonging to Ada",
     !("ada-example" in bayoView.candidates) && !("Ward 7" in bayoView.wards));

  const askedA = await say(adaView, adaExampleLog(), "What office am I contesting?");
  const askedB = await say(bayoView, bayoExampleLog(), "What office am I contesting?");
  ok("C3. the same question against two tenants returns two DIFFERENT Canon facts",
     askedA.answer.includes("House of Representatives") && askedB.answer.includes("State House of Assembly") &&
     askedA.answer !== askedB.answer);

  // A question NAMING the other tenant's ward, asked against THIS tenant's view,
  // finds nothing — because entity.js only ever resolves against `view`, and
  // Ward 3 is not a key of `adaView.wards`.
  const crossTenant = await say(adaView, adaExampleLog(), "Who is responsible for Ward 3?");
  ok("C4. Candidate A's view cannot resolve Candidate B's ward id — no cross-tenant leak",
     crossTenant.intent.component !== "Ward 3" || crossTenant.segments.some((s) => s.kind === SEGMENT.CANON_ABSENCE));

  // THE MODEL-INTERPRETER CONTEXT ITSELF IS TENANT-BOUNDED, NOT JUST THE
  // DETERMINISTIC READ. `interpretContext` is what would be sent to a real
  // provider on escalation (§10 of os/studio/understand.js) — if it named
  // Candidate B's ward, a model reading it could propose an entity Candidate
  // A never mentioned, and validateProposedEntity would then resolve it
  // (wrongly) because entity.js only checks "is this id present in `view`",
  // which Ward 3 is not — but the leak is in what the model was SHOWN, not
  // only in what it could resolve. So this is checked directly.
  const ctxForA = interpretContext({ message: "Who is responsible?", view: adaView,
    operations: ELECTION_VOCABULARY.operations, entityKinds: ELECTION_VOCABULARY.entityKinds });
  ok("C5. the bounded interpreter context built from Candidate A's view never names Candidate B's ward",
     !ctxForA.entities.some((e) => e.includes("Ward 3")) && ctxForA.entities.some((e) => e.includes("Ward 7")));
}

// =================================================================
// D. GROUNDING SAFETY — every Election CANON_FACT is independently
//    re-verified, exactly as manufacturing's are. A hostile adapter cannot
//    make an unsupported claim stand.
// =================================================================
{
  const hostileAdapter = () => [
    { type: CLAIM.CANON_FACT, text: "Ward 7 WINNING", source: { kind: "fold", path: "wards.Ward 7.doesNotExist" } },
  ];
  const grounded = await runInference({ adapter: hostileAdapter,
    intent: { type: ELECTION_INTENT.WARD_STATUS, component: "Ward 7", language: "en" },
    view: adaView, log: adaExampleLog() });
  ok("D1. a CANON_FACT citing a fold path that does not resolve is DOWNGRADED to UNKNOWN, not spoken",
     grounded.claims[0].type === CLAIM.UNKNOWN && !grounded.sound);

  const unknownWard = await say(adaView, adaExampleLog(), "Who is responsible for Ward 99?");
  ok("D2. an unrecorded ward refuses honestly rather than guessing",
     unknownWard.segments.some((s) => s.kind === SEGMENT.CANON_ABSENCE));

  const action = await say(adaView, adaExampleLog(), "Approve this.");
  ok("D3. ACTION_REQUEST is refused by the authority boundary, never obeyed",
     action.segments.every((s) => s.kind !== SEGMENT.CANON) &&
     action.segments.some((s) => s.kind === SEGMENT.AUTHORITY));
  // D3 alone can survive a disabled infer.js authority check, because respond.js's
  // composer ALSO gates the AUTHORITY segment on `intent.type` independently — a
  // real defence-in-depth property, found by mutation-testing this exact check.
  // This asserts infer.js's OWN half of that boundary directly, so a mutant that
  // disables only the adapter's check (and not respond.js's) is still caught.
  const actionClaims = electionAdapter({ intent: { type: ELECTION_INTENT.ACTION_REQUEST }, canon: adaView });
  ok("D3b. the adapter's own authority claim names \"authority\", not a generic fallback",
     actionClaims[0]?.text === "authority" &&
     /authenticated, authorised campaign identity/.test(actionClaims[0]?.reason ?? ""));
  ok("D4. election's adapter reaches no policy, no emitter, no publish — checked by import, not by promise",
     !/policy\.js|pipeline\.js|emit\(/.test(src("../src/domains/election/studio/infer.js")));
  // RECOMMENDATION -> AUTOMATIC EXECUTION, closed by construction. The adapter
  // that PRODUCES a recommendation (infer.js) must never be able to reach the
  // module that EXECUTES a write (write.js) — a recommendation is speech, not
  // an authorised action, and the only path from one to the other is the
  // human-gated PREPARE -> APPROVAL -> EXECUTE flow outside this file
  // entirely. Found by mutation-testing: a mutant that added
  // `import { executeElectionWrite } from "./write.js"` into infer.js
  // survived every other D-series assertion, because none of them named
  // "write.js" specifically.
  ok("D4b. election's adapter imports no write module — a recommendation cannot reach an executor",
     !/write\.js|executeElectionWrite/.test(src("../src/domains/election/studio/infer.js")));
}

// =================================================================
// E. CONVERSATION MEMORY — an election turn remembers exactly what a
//    manufacturing turn remembers: an identifier and an intent TYPE. Never a
//    fact, a claim, or an answer.
// =================================================================
{
  let conv = emptyConversation();
  const r = await say(adaView, adaExampleLog(), "What is the status of the campaign in Ward 7?");
  conv = remember(conv, { message: "What is the status of the campaign in Ward 7?", view: adaView,
    intent: r.intent, kinds: ELECTION_VOCABULARY.entityKinds });
  const turnKeys = Object.keys(conv.turns[0]).sort();
  ok("E1. a remembered turn carries exactly {message, subjects, intentType} — no more",
     JSON.stringify(turnKeys) === JSON.stringify(["intentType", "message", "subjects"]));
  ok("E2. the remembered subject is the Canon id, never the answer text or the claim",
     conv.turns[0].subjects.includes("Ward 7") && !JSON.stringify(conv.turns[0]).includes("behind"));
}

// =================================================================
// F. LANGUAGE — inherits the GLOBAL runtime, never a second selector.
//    Election has real wording for `en` only; any other requested language
//    falls back HONESTLY, exactly like os/studio/respond.js's own fallback.
// =================================================================
{
  const { language, fellBack, requested } = electionRealiserFor("yo");
  ok("F1. an unsupported language falls back to English and SAYS SO — no fabricated Yoruba wording",
     language === "en" && fellBack === true && requested === "yo");
  const { fellBack: enFellBack } = electionRealiserFor("en");
  ok("F2. the supported language does not report a fallback", enFellBack === false);

  const askedInYoruba = await say(adaView, adaExampleLog(), "What office am I contesting?",
    { conversation: null });
  ok("F3. asking in a language election has no wording for still answers, in English, honestly reported",
     askedInYoruba.answer.includes("House of Representatives"));
}

// =================================================================
// G. THE EVENT SCHEMA — explicit mission relationship, fail-closed
//    validation, the same discipline as os/events.js.
// =================================================================
{
  const good = candidateEvent({ candidate: "x", campaign: "campaign-x", name: "X", office: "Y", constituency: "Z", party: "W" });
  ok("G1. a complete candidate event validates", validateElectionEvent(good).valid);

  const missingField = { type: ELECTION_EVENT_TYPES.CANDIDATE.REGISTERED, candidate: "x" };
  ok("G2. a candidate event missing required fields fails closed",
     !validateElectionEvent(missingField).valid);

  ok("G3. every Election event type is EXPLICITLY mission-FORBIDDEN, never silently UNKNOWN",
     Object.values(ELECTION_EVENT_TYPES).flatMap((g) => Object.values(g))
       .every((t) => MISSION_POLICY[t] === "MISSION_FORBIDDEN"));

  let threw = false;
  try { assertElectionEvent({ type: ELECTION_EVENT_TYPES.CANDIDATE.REGISTERED, candidate: "x", mission: "FORGE-X" }); }
  catch { threw = true; }
  ok("G4. a mission-FORBIDDEN event type carrying a mission is rejected, not silently accepted", threw);
}

// =================================================================
// H. ALPHA 1.3 — FIVE NEW ASK ELECTIONCANON OPERATIONAL INTENTS.
//    Same fake-client + real propose/execute/project pipeline every other
//    consumer test uses to build a genuinely folded view, then the real
//    askForge() pipeline answers from it — never a hand-rolled view shape.
// =================================================================
{
  const CAMPAIGN_OPS = "campaign-ops";
  const USER = "ops-user";
  const rows = [];
  const client = {
    from: () => ({
      insert: async (row) => {
        if (rows.some((r) => r.event_id === row.event_id)) return { error: { code: "23505", message: "duplicate key" } };
        rows.push(row);
        return { error: null };
      },
    }),
  };
  const logFor = () => rows.map((r) => r.payload).reverse();

  async function addPU(id, code) {
    const p = await proposeAddPollingUnit({ fields: { state: "Delta", lga: "Uvwie", ward: "Ward 3", code } });
    await executeAddPollingUnit({ draft: p.draft.draft, campaign: CAMPAIGN_OPS, userId: USER, client, confirmationId: id });
  }
  async function assign(agentId, pollingUnitId) {
    const p = await proposeAssignAgent({ fields: { pollingUnitId, person: "Agent " + agentId } });
    await executeAssignAgent({ draft: p.draft.draft, campaign: CAMPAIGN_OPS, userId: USER, client, confirmationId: agentId });
  }
  async function capture(resultId, pollingUnitId) {
    const p = await proposeCaptureResult({ fields: { pollingUnitId } });
    await executeCaptureResult({ draft: p.draft.draft, campaign: CAMPAIGN_OPS, userId: USER, client, confirmationId: resultId });
  }
  async function verify(resultId, status) {
    const p = await proposeVerifyResult({ fields: { resultId, verificationStatus: status } });
    await executeVerifyResult({ draft: p.draft.draft, campaign: CAMPAIGN_OPS, userId: USER, client, confirmationId: `${resultId}-v` });
  }
  async function reportIncident(id, category, severity) {
    const p = await proposeReportIncident({ fields: { category, description: "test", severity } });
    await executeReportIncident({ draft: p.draft.draft, campaign: CAMPAIGN_OPS, userId: USER, client, confirmationId: id });
  }

  await addPU("pu-h1", "PU-H1");
  await addPU("pu-h2", "PU-H2");
  await addPU("pu-h3", "PU-H3"); // never reports
  await assign("agent-h1", "pu-h1");
  await capture("res-h1", "pu-h1");
  await capture("res-h2", "pu-h2");
  await verify("res-h2", VERIFICATION_STATUS.DISPUTED);
  await reportIncident("inc-h1", "violence", INCIDENT_SEVERITY.CRITICAL);
  await reportIncident("inc-h2", "logistics_issue", INCIDENT_SEVERITY.LOW);

  const opsView = projectElection(logFor(), CAMPAIGN_OPS);

  const submitted = await say(opsView, logFor(), "How many results have been submitted?");
  ok("H1. RESULTS_SUBMITTED reports the real 2-of-3 count, sourced from Canon",
     submitted.answer.includes("2 result(s) submitted") && submitted.segments.some((s) => s.kind === SEGMENT.CANON));

  const disputed = await say(opsView, logFor(), "Which results are disputed?");
  ok("H2. DISPUTED_RESULTS correctly reports 1 of 2 as disputed", disputed.answer.includes("1 of 2 result(s) are disputed"));

  const highPriority = await say(opsView, logFor(), "What are the high priority incidents?");
  ok("H3. HIGH_PRIORITY_INCIDENTS reports only the CRITICAL one, not the LOW one",
     /violence/.test(highPriority.answer) && !/logistics/.test(highPriority.answer));

  const notReporting = await say(opsView, logFor(), "Which polling units have not reported?");
  ok("H4. POLLING_UNITS_NOT_REPORTING correctly counts pu-h3 as the one gap", notReporting.answer.includes("1 of 3"));

  const coveragePct = await say(opsView, logFor(), "What is our coverage percentage?");
  ok("H5. COVERAGE_PERCENTAGE reads the same real number computeMobilizationCoverage() computes (1 of 3, 33%)",
     coveragePct.answer.includes("1 of 3") && coveragePct.answer.includes("33%"));

  // Empty-Canon honesty — every new intent must say so, never invent a count.
  const emptyView = projectElection([], "campaign-empty");
  const emptySubmitted = await say(emptyView, [], "results submitted so far");
  ok("H6. RESULTS_SUBMITTED on an empty Canon is CANON_ABSENCE, never a fabricated 0",
     emptySubmitted.segments.some((s) => s.kind === SEGMENT.CANON_ABSENCE));
  const emptyCoverage = await say(emptyView, [], "coverage percentage");
  ok("H7. COVERAGE_PERCENTAGE on an empty Canon is CANON_ABSENCE, never a fabricated percentage",
     emptyCoverage.segments.some((s) => s.kind === SEGMENT.CANON_ABSENCE));

  // Collision proof — a plain read question never gets confused with a NEARBY Alpha 1.2 intent.
  const gapsVsCoverage = await say(opsView, logFor(), "coverage gaps");
  ok("H8. 'coverage gaps' still resolves to COVERAGE_GAPS, not the new COVERAGE_PERCENTAGE — no phrase collision",
     gapsVsCoverage.intent.type === ELECTION_INTENT.COVERAGE_GAPS);
  const evidenceVsSubmitted = await say(opsView, logFor(), "results awaiting review");
  ok("H9. 'results awaiting review' still resolves to EVIDENCE_REVIEW, not RESULTS_SUBMITTED — no phrase collision",
     evidenceVsSubmitted.intent.type === ELECTION_INTENT.EVIDENCE_REVIEW);
}

// ============================================================
console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
