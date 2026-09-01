// ============================================================
// ELECTIONCANON — FIRST-USER COMPLETION PASS  (structural + contract)
//
// Same discipline as election-prelaunch-ux.consumer.mjs and
// election-voice.consumer.mjs: pure contract functions get real
// input/output assertions; everything else is a structural/source-text
// check against comment-stripped code (test/lib/source.mjs), so an
// explanatory comment mentioning old/removed text never counts as
// satisfying or leaking anything.
//
// Run: node test/election-first-user-completion.consumer.mjs
// ============================================================

import { readFileSync } from "node:fs";
import { stripComments } from "./lib/source.mjs";
import {
  validateSendRequest, buildInvitationEmail, buildResendRequest, interpretResendResponse,
  parseCampaignTitle as parseCampaignTitleEmail,
} from "../supabase/functions/election-invitation-email/contract.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };
const code = (p) => stripComments(readFileSync(new URL(p, import.meta.url), "utf8"));
const text = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

console.log("\nELECTIONCANON — First-user completion pass\n");

// ============================================================
console.log("A — INVITATION EMAIL CONTRACT: validateSendRequest");
// ============================================================
{
  ok("A1. a real invitation_id validates", validateSendRequest({ invitation_id: "abc-123" }).valid === true);
  ok("A2. missing invitation_id is rejected", validateSendRequest({}).valid === false);
  ok("A3. an empty string is rejected, not silently accepted", validateSendRequest({ invitation_id: "   " }).valid === false);
  ok("A4. a non-string invitation_id is rejected", validateSendRequest({ invitation_id: 42 }).valid === false);
  ok("A5. null body never throws", validateSendRequest(null).valid === false);
}

// ============================================================
console.log("\nB — INVITATION EMAIL CONTRACT: buildInvitationEmail");
// ============================================================
{
  const invitation = {
    invited_name: "Amaka Obi", invited_email: "amaka@example.com", token: "tok123abc",
    intended_responsibility_role: "WARD_COORDINATOR", expires_at: "2026-12-01T00:00:00.000Z",
  };
  const built = buildInvitationEmail({ invitation, campaignName: "Obi for Ward 4", geographyName: "Ward 4", invitedByName: "Chidi Okoro", origin: "https://electioncanon.org" });

  ok("B1. subject matches the spec's own example text",
    built.subject === "You're invited to join an ElectionCanon campaign");
  ok("B2. the link is built from origin + exact token, matching the UI's own /invite/:token fallback link",
    built.html.includes("https://electioncanon.org/invite/tok123abc"));
  ok("B3. the resolved role label is rendered, not the raw enum",
    built.html.includes("Ward Coordinator") && !built.html.includes("WARD_COORDINATOR"));
  ok("B4. the campaign name is rendered",
    built.html.includes("Obi for Ward 4"));
  ok("B5. the geography name is rendered alongside the role",
    built.html.includes("Ward 4"));
  ok("B6. the email-match security note is present, naming the invited address",
    built.html.includes("amaka@example.com") && /different email/i.test(built.html));
  ok("B7. no password appears anywhere in the email",
    !/password/i.test(built.html) && !/password/i.test(built.text));
  ok("B8. a user-typed field (invited_name) is HTML-escaped, not injected raw",
    (() => {
      const xss = buildInvitationEmail({
        invitation: { ...invitation, invited_name: '<img src=x onerror=alert(1)>' },
        campaignName: "Obi for Ward 4", geographyName: "Ward 4", origin: "https://electioncanon.org",
      });
      return !xss.html.includes("<img src=x") && xss.html.includes("&lt;img");
    })());
  ok("B9. the email is table-based HTML with only inline style attributes, no external stylesheet/script",
    /<table/i.test(built.html) && !/<script/i.test(built.html) && !/<link\s+rel=["']stylesheet/i.test(built.html)
    && !/googleapis\.com/i.test(built.html));
  ok("B10. a plain-text alternative body is also produced",
    typeof built.text === "string" && built.text.includes("https://electioncanon.org/invite/tok123abc"));
  ok("B11. a Director-level invitation (no responsibility role) reads as 'Campaign Director', never blank/undefined",
    buildInvitationEmail({ invitation: { ...invitation, intended_responsibility_role: null }, campaignName: "X", geographyName: null, invitedByName: "Chidi Okoro", origin: "https://electioncanon.org" })
      .html.includes("Campaign Director"));
  ok("B12. the inviter's real name is stated, so the recipient can see who invited them",
    built.html.includes("Chidi Okoro") && built.text.includes("Chidi Okoro"));
  ok("B13. an unresolvable inviter falls back to an honest generic label, never a blank/undefined string",
    (() => {
      const noInviter = buildInvitationEmail({ invitation, campaignName: "Obi for Ward 4", geographyName: "Ward 4", invitedByName: null, origin: "https://electioncanon.org" });
      return noInviter.html.includes("the campaign team") && !/undefined|null/i.test(noInviter.html);
    })());
  ok("B14. the Archbishop Benson Idahosa preparation quote is reused as the branded opening element",
    /Archbishop Benson Idahosa/.test(built.html) && /preparing to fail/.test(built.html));
  ok("B15. the email explicitly states the recipient will go through ElectionCanon's own sign-in/registration flow",
    /sign-in and registration/.test(built.html));
  ok("B16. the H1 reads as an invitation, never the account-confirmation email's own heading (no cross-template confusion)",
    /You've been invited to join/.test(built.html) && !/Confirm your ElectionCanon account/.test(built.html));

  // B17-B21 — campaign-name presentation. campaigns.name is stored as
  // "[ElectionType] Name" (unchanged, no migration); the email must render
  // this exactly the way the app's own display layer does: clean name in
  // the headline, election type shown separately. A live-production bug
  // (raw "[House of Representatives] Journey Test Campaign" in a sent
  // email) is the reason these assertions exist.
  const bracketed = buildInvitationEmail({
    invitation, campaignName: "[House of Representatives] Journey Test Campaign",
    geographyName: "Ward 4", invitedByName: "Chidi Okoro", origin: "https://electioncanon.org",
  });
  ok("B17. a bracket-prefixed stored name never leaks into the email verbatim",
    !bracketed.html.includes("[House of Representatives] Journey Test Campaign")
    && !bracketed.text.includes("[House of Representatives] Journey Test Campaign"));
  ok("B18. the headline reads the clean campaign name only",
    bracketed.html.includes("You've been invited to join Journey Test Campaign"));
  ok("B19. the election/office is shown separately, labelled, not bracket-prefixed",
    /Election: House of Representatives/.test(bracketed.html) && /Election: House of Representatives/.test(bracketed.text));
  ok("B20. a campaign name with no bracket prefix passes through unchanged, with no 'Election:' line fabricated",
    (() => {
      const plain = buildInvitationEmail({ invitation, campaignName: "Journey Test Campaign", geographyName: "Ward 4", invitedByName: "Chidi Okoro", origin: "https://electioncanon.org" });
      return plain.html.includes("You've been invited to join Journey Test Campaign") && !/Election:/.test(plain.html);
    })());
  ok("B21. parseCampaignTitle() in the email contract uses the exact same regex as the app's own parser (shared.jsx) — a textual parity guard against future drift",
    (() => {
      const shared = code("../src/pages/election/shared.jsx");
      return shared.includes("/^\\[([^\\]]+)\\]\\s*(.*)$/") && parseCampaignTitleEmail.toString().includes("/^\\[([^\\]]+)\\]\\s*(.*)$/");
    })());
}

// ============================================================
console.log("\nC — INVITATION EMAIL CONTRACT: buildResendRequest / interpretResendResponse");
// ============================================================
{
  const req = buildResendRequest({ from: "ElectionCanon <a@b.com>", to: "x@y.com", subject: "S", html: "<p>h</p>", text: "t" });
  ok("C1. `to` is wrapped as an array (Resend's own expected shape)", Array.isArray(req.to) && req.to[0] === "x@y.com");

  ok("C2. a 2xx response with a real provider id -> ok:true, id captured",
    interpretResendResponse(200, { id: "re_abc123" }).ok === true
    && interpretResendResponse(200, { id: "re_abc123" }).providerMessageId === "re_abc123");
  ok("C3. a 2xx response is STILL only 'accepted for delivery', never claimed as delivered — no separate delivered field is invented",
    !("delivered" in interpretResendResponse(200, { id: "re_abc123" })));
  ok("C4. a 4xx/5xx response -> ok:false with the provider's own message surfaced",
    interpretResendResponse(422, { message: "invalid from address" }).ok === false
    && interpretResendResponse(422, { message: "invalid from address" }).error === "invalid from address");
  ok("C5. a malformed/empty provider response never throws, still returns ok:false",
    interpretResendResponse(500, null).ok === false);
}

// ============================================================
console.log("\nD — NO PROVIDER SECRET REACHES THE BROWSER BUNDLE");
// ============================================================
{
  const clientWrite = code("../src/domains/election/invitations/write.js");
  const orgSection = code("../src/pages/election/OrganisationSection.jsx");
  const indexTs = text("../supabase/functions/election-invitation-email/index.ts");

  ok("D1. the client-side invitation write path never references a Resend key",
    !/RESEND_API_KEY/.test(clientWrite) && !/RESEND/.test(clientWrite));
  ok("D2. OrganisationSection.jsx never references a Resend key or SMTP secret",
    !/RESEND_API_KEY/.test(orgSection) && !/smtp/i.test(orgSection));
  ok("D3. the edge function reads RESEND_API_KEY only from Deno.env, never a hardcoded literal",
    /Deno\.env\.get\("RESEND_API_KEY"\)/.test(indexTs) && !/re_[A-Za-z0-9]{10,}/.test(indexTs));
  ok("D4. the edge function never imports/uses a service-role key — only the caller's forwarded Authorization header",
    !/service_role/i.test(indexTs) && !/SUPABASE_SERVICE_ROLE/.test(indexTs)
    && /Authorization: authHeader/.test(indexTs));
  ok("D5. the edge function never logs the invitation token",
    !/console\.log\([^)]*token/i.test(indexTs));
  ok("D6. the send-from address defaults to the real ElectionCanon domain, overridable via env, never hardcoded to a sandbox/placeholder inbox",
    /RESEND_FROM_EMAIL[\s\S]{0,40}ElectionCanon <no-reply@electioncanon\.org>/.test(indexTs));
  ok("D7. the inviter's identity is resolved from the CALLER's own forwarded session (auth.getUser()), never a lookup by an arbitrary client-supplied id",
    /supabase\.auth\.getUser\(\)/.test(indexTs) && !/\.eq\("id",\s*(?:body|invitation)\./.test(indexTs));
  ok("D8. that resolution reads only the caller's OWN profiles row (eq id, caller.id) — the same safe pattern profileResolver.js already uses, no new cross-user read",
    /\.eq\("id", caller\.id\)/.test(indexTs));
}

// ============================================================
console.log("\nE — INVITATION STATUS LANGUAGE IS HONEST (item 5)");
// ============================================================
{
  const orgSection = code("../src/pages/election/OrganisationSection.jsx");
  const clientWrite = code("../src/domains/election/invitations/write.js");

  ok("E1. the just-created panel claims only 'Invitation created', never an unconditional 'Invitation sent'",
    /Invitation created/.test(orgSection) && !/>Invitation sent</.test(orgSection));
  ok("E2. a successfully dispatched email is described as 'queued for delivery', not 'delivered'",
    /queued for delivery/.test(orgSection));
  ok("E3. an email failure is shown to the user, distinctly from success, never silently swallowed",
    /could not be sent/.test(orgSection));
  ok("E4. the 'Copy invitation link' fallback exists and actually copies the link (not just displays it)",
    /Copy invitation link/.test(orgSection) && /navigator\.clipboard/.test(orgSection));
  ok("E5. createInvitation() reports emailStatus/emailError separately from the row-creation error",
    /emailStatus/.test(clientWrite) && /emailError/.test(clientWrite));
  ok("E6. a real dispatch failure never rolls back / discards the created invitation row",
    /return \{ invitation: data, emailStatus, emailError, error: null \}/.test(clientWrite));
}

// ============================================================
console.log("\nF — CAMPAIGN ACTION AUTHORIZATION NOTICE (item 2's direct target)");
// ============================================================
{
  const mobilization = code("../src/domains/election/mobilization/write.js");
  const electionDay = code("../src/domains/election/electionDay/write.js");
  const studio = code("../src/domains/election/studio/write.js");
  const geography = code("../src/domains/election/geography/write.js");

  for (const [name, src] of [["mobilization", mobilization], ["electionDay", electionDay], ["studio", studio], ["geography", geography]]) {
    ok(`F. ${name}/write.js's pending-draft notice no longer claims the actor is NOT AUTHORISED before any real check has run`,
      !/NOT AUTHORISED/.test(src));
    ok(`F. ${name}/write.js has no rendered "ForgeOS" user-facing string`,
      !/"[^"]*ForgeOS[^"]*"/.test(src) && !/\`[^\`]*ForgeOS[^\`]*\`/.test(src));
  }
}

// ============================================================
console.log("\nG — CANDIDATE REGISTRATION IS ACTIONABLE, THROUGH THE EXISTING WRITE PIPELINE (item 1)");
// ============================================================
{
  const election = code("../src/pages/Election.jsx");

  ok("G1. a real CandidateRegistrationPanel component exists",
    /function CandidateRegistrationPanel\(/.test(election));
  ok("G2. it is mounted from ReadinessSection when CANDIDATE_REGISTERED is not yet COMPLETE",
    /<CandidateRegistrationPanel ctx=\{ctx\} campaignId=\{campaignId\} refresh=\{refresh\} \/>/.test(election));
  ok("G3. it constructs the SAME command string matchCandidateRegister() already parses — no second write path invented",
    /Register \$\{cleanName\} as candidate for \$\{officeName\} in \$\{constituencyName\}, \$\{cleanParty\}\.`/.test(election));
  ok("G4. it routes through the existing prepareElectionWrite/approveElectionWrite pipeline, never a bespoke insert",
    /prepareElectionWrite\(\{ client: supabase, requestedCampaign: campaignId, message \}\)/.test(election));
  ok("G5. office/constituency are read from the campaign's own already-set territory, never re-asked or fabricated",
    /getConstituencyTerritory|listOffices/.test(election) && /ctx\.view\?\.territory/.test(election));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail > 0) process.exit(1);
