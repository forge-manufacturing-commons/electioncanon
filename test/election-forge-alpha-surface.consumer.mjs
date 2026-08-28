// ============================================================
// ELECTION FORGE ALPHA 1.0 — SURFACE STRUCTURAL CHECKS
//
// Same style as election-web-surface.consumer.mjs: literal source-pattern
// checks (via stripComments()) against the new Alpha 1.0 section files —
// no React-rendering harness exists in this repo, so this is the strongest
// automated evidence available for "no dead nav" and "simulation data is
// labelled as such," proven at the source level rather than asserted.
// ============================================================

import { readFileSync } from "node:fs";
import { stripComments } from "./lib/source.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const src = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));

console.log("\nELECTION FORGE ALPHA — Surface structural checks\n");

const home = src("../src/pages/election/HomeSection.jsx");
const mobilize = src("../src/pages/election/MobilizeSection.jsx");
const chat = src("../src/pages/election/ChatSection.jsx");
const studio = src("../src/pages/election/CampaignStudioSection.jsx");
const electionDay = src("../src/pages/election/ElectionDaySection.jsx");
const intelligence = src("../src/pages/election/IntelligenceSection.jsx");
const mobilizationWrite = src("../src/domains/election/mobilization/write.js");
const electionDayWrite = src("../src/domains/election/electionDay/write.js");
const chatApi = src("../src/domains/election/chat/api.js");
const studioAssets = src("../src/domains/election/design/assets.js");

// ============================================================
console.log("A — NO DEAD NAV: none of the 8 primary sections is a static placeholder");
// ============================================================
{
  const DEAD_PHRASES = /coming soon|not yet functional|preview only[^A-Za-z]/i;
  ok("A1. HomeSection has no dead-placeholder copy", !DEAD_PHRASES.test(home));
  ok("A2. MobilizeSection has no dead-placeholder copy", !DEAD_PHRASES.test(mobilize));
  ok("A3. ChatSection has no dead-placeholder copy", !DEAD_PHRASES.test(chat));
  ok("A4. CampaignStudioSection has no dead-placeholder copy", !DEAD_PHRASES.test(studio));
  ok("A5. IntelligenceSection has no dead-placeholder copy", !DEAD_PHRASES.test(intelligence));
  ok("A6. every section exports a real default component, not a stub",
     /export default function MobilizeSection/.test(mobilize) &&
     /export default function ChatSection/.test(chat) &&
     /export default function CampaignStudioSection/.test(studio) &&
     /export default function ElectionDaySection/.test(electionDay) &&
     /export default function IntelligenceSection/.test(intelligence) &&
     /export default function HomeSection/.test(home));
}

// ============================================================
console.log("\nB — SIMULATION LABELLING: Election Day never presents simulated data as official");
// ============================================================
{
  ok("B1. ElectionDaySection uses DemoTag (the shared simulation-label component) at least twice",
     (electionDay.match(/<DemoTag\b/g) ?? []).length >= 2);
  ok("B2. ElectionDaySection's own copy explicitly says results are not official",
     /not official election results|SIMULATION/i.test(electionDay));
  // ALPHA 1.1 — real evidence photo storage was built (private, tenant-
  // isolated Supabase Storage bucket; see electionDay/evidence.js and
  // ARCHITECTURE.md's "Simulation vs. real Election Day data" section).
  // The disclosure obligation flipped: the panel must now say the photo
  // IS genuinely preserved, and must still say the event stays simulation
  // data — never silently claiming photo persistence without the caveat,
  // and never silently dropping the caveat now that storage is real.
  ok("B3. the result-capture panel explicitly discloses the photo is genuinely uploaded and preserved as evidence",
     /genuinely uploaded and preserved as evidence/i.test(electionDay));
  ok("B3b. the same disclosure still marks the recorded event as simulation data, not an official result",
     /never an official election result|not an official election result/i.test(electionDay));
  ok("B4. resultCapturedEvent's factory (events.js) defaults `simulated` to true, never silently false",
     /simulated: simulated !== false/.test(src("../src/domains/election/events.js")));
}

// ============================================================
console.log("\nC — EVENT VOCABULARY DISCIPLINE: no literal event-type string, only symbolic references");
// ============================================================
{
  // Mirrors kernel.audit.mjs's own "invented event type" check style — every
  // `type:` value must be a symbolic ELECTION_EVENT_TYPES.* reference, never
  // a raw string literal, in the new write modules.
  const rawTypeLiteral = /type:\s*["'][a-z][a-z0-9.]*["']/;
  ok("C1. mobilization/write.js never assigns `type:` a raw string literal", !rawTypeLiteral.test(mobilizationWrite));
  ok("C2. electionDay/write.js never assigns `type:` a raw string literal", !rawTypeLiteral.test(electionDayWrite));
}

// ============================================================
console.log("\nD — ARCHITECTURE BOUNDARY: Chat and Campaign Studio are direct CRUD, not PREPARE/APPROVE");
// ============================================================
{
  ok("D1. chat/api.js never imports prepareElectionWrite/approveElectionWrite or the mobilization/election-day write modules",
     !/prepareElectionWrite|approveElectionWrite|mobilization\/write\.js|electionDay\/write\.js/.test(chatApi));
  ok("D2. design/assets.js never imports prepareElectionWrite/approveElectionWrite either",
     !/prepareElectionWrite|approveElectionWrite/.test(studioAssets));
  ok("D3. chat/api.js and design/assets.js both take `client` as an explicit parameter — never import the supabase singleton",
     !/from ["'].*lib\/supabase\.js["']/.test(chatApi) && !/from ["'].*lib\/supabase\.js["']/.test(studioAssets));
}

// ============================================================
console.log("\nE — MOBILIZATION/ELECTION DAY WRITES ROUTE THROUGH electionWebAdapter.js");
// ============================================================
{
  // MobilizeSection/ElectionDaySection legitimately import shared vocabulary
  // constants (PERSON_ROLE_TYPES, ASSIGNMENT_STATUS, AGENT_STATUS, ...) from
  // the domain write modules for their <select> options — that is not a
  // gate-bypass. The invariant is that the actual propose*/execute*
  // FUNCTION CALLS only ever happen through electionWebAdapter.js's
  // prepare/approve wrappers, never called directly.
  ok("E1. MobilizeSection calls prepareMobilizationWrite/approveMobilizationWrite from electionWebAdapter.js",
     /from ["']\.\.\/\.\.\/os\/electionWebAdapter\.js["']/.test(mobilize) &&
     /prepareMobilizationWrite/.test(mobilize) && /approveMobilizationWrite/.test(mobilize));
  ok("E2. MobilizeSection never calls a mobilization propose*/execute* function directly (only the adapter wrappers)",
     !/\bpropose(AddPerson|CreateAssignment|ChangeAssignmentStatus|CreateTask|ChangeTaskStatus)\s*\(/.test(mobilize) &&
     !/\bexecute(AddPerson|CreateAssignment|ChangeAssignmentStatus|CreateTask|ChangeTaskStatus)\s*\(/.test(mobilize));
  ok("E3. ElectionDaySection calls prepareElectionDayWrite/approveElectionDayWrite from electionWebAdapter.js",
     /from ["']\.\.\/\.\.\/os\/electionWebAdapter\.js["']/.test(electionDay) &&
     /prepareElectionDayWrite/.test(electionDay) && /approveElectionDayWrite/.test(electionDay));
  ok("E4. ElectionDaySection never calls an election-day propose*/execute* function directly (only the adapter wrappers)",
     !/\bpropose(AddPollingUnit|AssignAgent|ChangeAgentStatus|CaptureResult|VerifyResult|ReportIncident|ChangeIncidentStatus)\s*\(/.test(electionDay) &&
     !/\bexecute(AddPollingUnit|AssignAgent|ChangeAgentStatus|CaptureResult|VerifyResult|ReportIncident|ChangeIncidentStatus)\s*\(/.test(electionDay));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
process.exit(fail ? 1 : 0);
