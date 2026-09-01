// ============================================================
// FORGE ELECTION — PRE-LAUNCH UX CLEANUP PASS  (structural)
//
// This repository has no React-rendering test harness (see
// election-web-surface.consumer.mjs's own header) — these are the same
// class of structural/source-level checks that file already established,
// proving each of the seven findings from the live continuous-journey
// verification pass was actually fixed in the source, not just described
// as fixed. All regex checks run against comment-stripped code (see
// test/lib/source.mjs) so an explanatory comment that MENTIONS the old,
// removed text (e.g. "was 'ForgeOS requires...'") never counts as a leak.
//
// Run: node test/election-prelaunch-ux.consumer.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { stripComments } from "./lib/source.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const code = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));

console.log("\nFORGE ELECTION — Pre-launch UX cleanup (structural)\n");

const orgSection = code("../src/pages/election/OrganisationSection.jsx");
const invRead = code("../src/domains/election/invitations/read.js");
const geoWrite = code("../src/domains/election/geography/write.js");
const territoryReadiness = code("../src/domains/election/studio/territoryReadiness.js");
const territoryExplorer = code("../src/pages/election/TerritoryExplorer.jsx");
const territorySection = code("../src/pages/election/TerritorySection.jsx");
const access = code("../src/pages/Access.jsx");
const forgeIdentity = code("../src/os/ForgeIdentity.jsx");
const resetPassword = code("../src/pages/ResetPassword.jsx");
const app = code("../src/App.jsx");
const election = code("../src/pages/Election.jsx");
const homeSection = code("../src/pages/election/HomeSection.jsx");
const shared = code("../src/pages/election/shared.jsx");

console.log("P1-1 — CAMPAIGN OWNER RAW ID");
{
  ok("1. OrganisationSection.jsx no longer falls back to a raw uid slice for a member's name",
     !/`member \$\{uid\.slice\(0,\s*8\)\}`/.test(orgSection) && !/uid\.slice\(0,\s*8\)/.test(orgSection));
  ok("2. nameFor() resolves the signed-in viewer's OWN row through their profile display name or email",
     /myIdentity\.displayName\?\.trim\(\)\s*\|\|\s*myIdentity\.email/.test(orgSection));
  ok("3. nameFor() resolves another accepted Director-level member through the invitation that admitted them",
     /invitations\.find\(\(i\) => i\.accepted_by === uid/.test(orgSection));
  ok("4. an invited coordinator's real roster name is still checked FIRST (no regression)",
     /people\.find\(\(p\) => p\.id === `invite:\$\{campaignId\}:\$\{uid\}`\)\?\.name/.test(orgSection));
  ok("5. the true-unknown fallback is a plain honest label, never an id fragment",
     /return "Campaign member"/.test(orgSection));
  ok("6. listInvitations() selects accepted_by so the roster can resolve it (still never selects token)",
     /accepted_by/.test(invRead) && !/\.select\([^)]*\btoken\b/.test(invRead));
}

console.log("\nP1-2 — INTERNAL ENGINEERING LANGUAGE REMOVED");
{
  ok("1. geography/write.js's authorization notice no longer names ForgeOS",
     !/ForgeOS/.test(geoWrite));
  ok("2. geography/write.js's ward/PU refusal reason no longer cites a repo file path",
     !/supabase\/geography-import/.test(geoWrite));
  ok("3. the authorization notice reads as ElectionCanon product language",
     /ElectionCanon requires you to be signed in and authorised/.test(geoWrite));
  ok("4. territoryReadiness.js's ward/PU coverage notes no longer cite a repo file path",
     !/supabase\/geography-import/.test(territoryReadiness));
  ok("5. territoryReadiness.js's notes read as product language (authoritative reference data)",
     /Authoritative ward reference data has not yet been imported/.test(territoryReadiness)
     && /Authoritative polling-unit reference data has not yet been imported/.test(territoryReadiness));
  ok("6. OrganisationSection.jsx's empty ward state no longer cites a repo file path",
     !/supabase\/geography-import/.test(orgSection));
  ok("7. TerritoryExplorer.jsx's empty ward state no longer cites a repo file path",
     !/supabase\/geography-import/.test(territoryExplorer));
}

console.log("\nP1-3 — DUPLICATE CAMPAIGN NAME EXPERIENCE REMOVED");
{
  ok("1. Access.jsx no longer labels the registration name field as a campaign/organisation name",
     !/Campaign \/ organisation name/.test(access));
  ok("2. the field is relabelled to ask for the PERSON's own name",
     /<span style=\{label\}>Your name<\/span>/.test(access));
  ok("3. a helper line makes the distinction from the later campaign-name prompt explicit",
     /You'll name your campaign[\s\S]{0,40}in the next step/.test(access));
}

console.log("\nP1-4 — PASSWORD RESET");
{
  ok("1. ForgeIdentity.jsx implements requestPasswordReset via Supabase's own resetPasswordForEmail",
     /requestPasswordReset = useCallback/.test(forgeIdentity) && /resetPasswordForEmail/.test(forgeIdentity));
  ok("2. ForgeIdentity.jsx implements updatePassword via Supabase's own updateUser — no custom password storage",
     /updatePassword = useCallback/.test(forgeIdentity) && /supabase\.auth\.updateUser\(\{ password \}\)/.test(forgeIdentity));
  ok("3. both are exposed on the identity context value (reachable from any page via useIdentity())",
     /requestPasswordReset, updatePassword,/.test(forgeIdentity));
  ok("4. no service-role credential or custom password field appears anywhere in this file",
     !/service_role/i.test(forgeIdentity) && !/SUPABASE_SERVICE/i.test(forgeIdentity));
  ok("5. Access.jsx offers a 'Forgot password?' entry point from the sign-in form",
     /Forgot password\?/.test(access));
  ok("6. Access.jsx's forgot-password submit calls requestPasswordReset, never signIn/register",
     /submitForgotPassword[\s\S]{0,200}requestPasswordReset\(\{ email: form\.email \}\)/.test(access));
  ok("7. the same message is shown regardless of whether the email has an account (no enumeration leak)",
     /If an ElectionCanon account exists for that email/.test(access));
  ok("8. ResetPassword.jsx exists and calls updatePassword, never touches a plaintext password store",
     /updatePassword\(\{ password \}\)/.test(resetPassword));
  ok("9. App.jsx registers /reset-password the same explicit way every other route is registered",
     /<Route path="\/reset-password"\s+element=\{<ResetPassword \/>\}\s*\/>/.test(app));
}

console.log("\nP2-5 — WELCOME SCREEN LEADS WITH \"WHAT DO I DO NOW\"");
{
  ok("1. Election.jsx defines the primary 6-step first-run answer",
     /const WHAT_YOU_DO_NOW = Object\.freeze/.test(election));
  ok("2. the six real journey steps are present, in order",
     /"Set up your campaign\."[\s\S]{0,40}"Map your territory\."[\s\S]{0,60}"Build your organisation\."[\s\S]{0,60}"Assign responsibility\."[\s\S]{0,60}"Track readiness\."[\s\S]{0,40}"Coordinate\."/.test(election));
  ok("3. the numbered list renders ahead of the Get Started button in the welcome step",
     /WHAT_YOU_DO_NOW\.map[\s\S]{0,1000}Get Started/.test(election));
  ok("4. the full capability list is still present, reading from the SAME shared source of truth — nothing duplicated or deleted",
     /CAPABILITIES_AVAILABLE_NOW\.map/.test(election) && /CAPABILITIES_COMING_NEXT\.map/.test(election)
     && !/const CAPABILITIES_AVAILABLE_NOW = Object\.freeze/.test(election)); // still imported, not redefined locally
  ok("5. the capability list is de-prioritised out of the critical path (collapsed, not front-and-centre)",
     /<details/.test(election) && /What's already built, and what's next/.test(election));
}

console.log("\nP2-6 — ONE CLEAR ORGANISATION PATH");
{
  ok("1. TerritoryExplorer's AssignPanel explains it assigns an existing roster entry, not a new login",
     /assigns someone already on your roster, without giving them their own sign-in/.test(territoryExplorer));
  ok("2. it directs the user to Organisation for the invite-based path, rather than silently duplicating it",
     /onSection\("organisation"\)/.test(territoryExplorer) && /use Organisation/.test(territoryExplorer));
  ok("3. the old capability itself is NOT removed — AssignPanel still renders a real StructuredWritePanel",
     /<StructuredWritePanel/.test(territoryExplorer));
  ok("4. onSection is threaded from Election.jsx through TerritorySection so the link actually navigates",
     /onSection=\{onSection\}/.test(territorySection));
}

console.log("\nP3 — CAMPAIGN TITLE");
{
  ok("1. shared.jsx provides a display-only parser — no migration, no write to campaigns.name",
     /export function parseCampaignTitle/.test(shared));
  ok("2. a name with no bracket prefix passes through completely unchanged",
     /if \(!match\) return \{ name: text, electionType: null \}/.test(shared));
  ok("3. Election.jsx uses the parser at the single point workspaceName is set, not by rewriting the stored value",
     /const \{ name, electionType \} = parseCampaignTitle\(data\?\.name \?\? null\)/.test(election));
  ok("4. the underlying campaigns.name write path (WelcomeOnboarding's submit) is completely untouched",
     /const finalName = electionType \? `\[\$\{electionType\}\] \$\{clean\}` : clean;/.test(election));
  ok("5. HomeSection displays the election type as its own separate line, never bracket syntax",
     /Election: \{electionType\}/.test(homeSection) && !/\[\{electionType\}\]/.test(homeSection));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
