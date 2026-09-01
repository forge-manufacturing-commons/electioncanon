// ============================================================
// ELECTIONCANON INVITATION EMAIL — WIRE CONTRACT  (First-user completion pass, item 4)
//
// Modelled directly on supabase/functions/election-voice/contract.mjs's
// own split: plain JavaScript, no Deno APIs, so Deno runs it in
// production and the Node test suite runs the EXACT same code — the
// validator under test is the real security control, not just the
// transport around it.
//
// WHY THIS TAKES ONLY invitation_id, NEVER EMAIL CONTENT FROM THE CLIENT.
// create_campaign_invitation() already did the one privileged check that
// matters — WHO may invite WHOM, for WHAT role, in WHAT territory — at
// creation time, server-side, in Postgres. If this function instead
// trusted client-supplied name/email/role/campaign fields, ANY signed-in
// user (not just a campaign member) could make ElectionCanon's own mail
// sender deliver an arbitrary message to an arbitrary address — a spam
// relay wearing this project's name. Taking only an id and re-reading the
// real row (via the CALLER's own forwarded session, respecting the
// existing "invitations read own campaign" RLS policy — see index.ts)
// means this function can only ever email an invitation the caller could
// already see in their own Organisation tab.
//
// HONESTY, NOT JUST TRANSPORT. buildInvitationEmail() and
// interpretResendResponse() are pure and independently testable so the
// actual claims this project makes — "the email is branded", "the link
// is exact", "queued means queued, not delivered" — are proven in the
// same Node test suite as everything else, not asserted only in a
// Deno function nobody can run here.
// ============================================================

export const RESPONSIBILITY_ROLE_LABEL = Object.freeze({
  CONSTITUENCY_LEAD: "Constituency Lead",
  LGA_COORDINATOR: "LGA Coordinator",
  WARD_COORDINATOR: "Ward Coordinator",
  POLLING_UNIT_AGENT: "Polling-Unit Agent",
});

// MIRRORS src/pages/election/shared.jsx's parseCampaignTitle() EXACTLY —
// same regex, same fallback behaviour. Not imported from there: Supabase
// deploys this function's own directory only (index.ts/contract.mjs), so a
// cross-directory import into src/ is not deployable. campaigns.name is
// still stored as "[ElectionType] Name" (unchanged, no migration); this is
// the SAME display-only split shared.jsx already does, duplicated here on
// purpose and kept honest by test/election-first-user-completion.consumer.mjs's
// parity assertion, which imports BOTH copies and fails if they ever
// disagree on the same input.
export function parseCampaignTitle(rawName) {
  const text = String(rawName ?? "").trim();
  const match = text.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) return { name: text, electionType: null };
  const [, electionType, rest] = match;
  return { name: rest.trim() || text, electionType: electionType.trim() || null };
}

/** Validates the ONLY thing the client is trusted to say: which invitation to email. */
export function validateSendRequest(body) {
  const id = body && typeof body === "object" ? body.invitation_id : undefined;
  if (typeof id !== "string" || !id.trim()) {
    return { valid: false, reason: "invitation_id is required" };
  }
  return { valid: true, invitationId: id.trim() };
}

/**
 * @param invitation    the REAL row read from campaign_invitations (via the
 *                       caller's own RLS-scoped session — see index.ts),
 *                       plus the campaign's own name and the resolved
 *                       geography name (already how OrganisationSection.jsx/
 *                       AcceptInvite.jsx resolve it — no new lookup logic).
 * @param invitedByName  the inviter's OWN display name/email, resolved by
 *                       index.ts from the CALLER's own forwarded session
 *                       (never a lookup of some other user's profile — the
 *                       caller invoking this function *is* invited_by, by
 *                       construction of create_campaign_invitation()). null
 *                       when it genuinely could not be resolved — rendered
 *                       as "the campaign team", never fabricated.
 * @param origin         the site origin (e.g. https://electioncanon.org),
 *                       used to build the exact same /invite/:token link the
 *                       "copy invitation link" fallback in the UI produces.
 */
export function buildInvitationEmail({ invitation, campaignName, geographyName, invitedByName, origin }) {
  // campaigns.name is stored as "[ElectionType] Name" (unchanged, no
  // migration — see parseCampaignTitle()'s own header above). The email
  // must never render that raw bracket-prefixed string; the clean name and
  // the election type are shown separately, exactly like the app's own
  // display layer already does.
  const { name: cleanCampaignName, electionType } = parseCampaignTitle(campaignName);
  const roleLabel = invitation.intended_responsibility_role
    ? RESPONSIBILITY_ROLE_LABEL[invitation.intended_responsibility_role] ?? invitation.intended_responsibility_role
    : "Campaign Director";
  const territoryLine = geographyName ? ` — ${geographyName}` : "";
  const link = `${origin}/invite/${invitation.token}`;
  const inviterLabel = invitedByName?.trim() || "the campaign team";
  const expiresText = invitation.expires_at
    ? new Date(invitation.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const subject = "You're invited to join an ElectionCanon campaign";

  // Table-based HTML, inline CSS, no external fonts, no JavaScript — same
  // constraints and the same visual language (black/ivory/teal/amber/pink)
  // as supabase/email-templates/confirm-signup.html, reused rather than a
  // second visual identity. escapeHtml() guards every field that came from
  // a human typing into a form (invited_name, campaignName, geographyName,
  // invitedByName) — the token/link are server-generated, never user-typed.
  //
  // THE QUOTE BLOCK IS DELIBERATELY REUSED, NOT DUPLICATED AS A SEPARATE
  // IDENTITY. confirm-signup.html's own opening element (Archbishop Benson
  // Idahosa's "If you fail to prepare, you are preparing to fail.") is the
  // brand's one preparation motif — reused here so both emails read as the
  // same product. The two are kept from being confused with each other the
  // same way confirm-signup.html already distinguishes itself from any other
  // email: a distinct <title>/H1 ("You've been invited to join X", never
  // "Confirm your ElectionCanon account") and body copy that is about a
  // CAMPAIGN INVITATION throughout, never account confirmation.
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0; padding:0; background-color:#0D0D0F;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
    ${esc(inviterLabel)} has invited you to join ${esc(cleanCampaignName)} on ElectionCanon as ${esc(roleLabel)}${esc(territoryLine)}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0D0D0F" style="background-color:#0D0D0F;">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
        <tr><td style="padding: 0 8px 20px 8px;">
          <span style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 2px; color: #0A7F73; text-transform: uppercase;">ElectionCanon</span>
        </td></tr>
        <tr><td style="background-color:#111418; border:1px solid #1C2128;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 36px 40px 28px 40px; border-bottom: 1px solid #1C2128;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="3" style="background-color:#FF2E63; font-size:0; line-height:0;">&nbsp;</td>
                <td style="padding-left: 18px;">
                  <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 19px; line-height: 28px; color: #F5F1E9;">
                    &ldquo;If you fail to prepare,<br>you are preparing to fail.&rdquo;
                  </p>
                  <p style="margin: 12px 0 0 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #8899AA; text-transform: uppercase;">
                    &mdash; Archbishop Benson Idahosa
                  </p>
                </td>
              </tr></table>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 32px 40px 8px 40px;">
              <h1 style="margin:0 0 6px 0; font-family: Helvetica, Arial, sans-serif; font-weight: 800; font-size: 26px; line-height: 32px; color: #F5F1E9;">
                You've been invited to join ${esc(cleanCampaignName)}
              </h1>
              ${electionType ? `<p style="margin:0 0 18px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #8899AA; text-transform: uppercase;">Election: ${esc(electionType)}</p>` : `<div style="margin-bottom:18px;"></div>`}
              <p style="margin: 0 0 10px 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #C9CDD3;">
                Hi ${esc(invitation.invited_name)},
              </p>
              <p style="margin: 0 0 16px 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #C9CDD3;">
                <strong style="color:#F5F1E9;">${esc(inviterLabel)}</strong> has invited you to join
                <strong style="color:#F5F1E9;">${esc(cleanCampaignName)}</strong> on ElectionCanon as
                <strong style="color:#0AB4A0;">${esc(roleLabel)}${esc(territoryLine)}</strong>. Accepting gives you your own
                sign-in, scoped to exactly this responsibility and territory — not a generic account.
              </p>
              <p style="margin: 0 0 16px 0; font-family: Helvetica, Arial, sans-serif; font-size: 15px; line-height: 24px; color: #C9CDD3;">
                Accepting will take you through ElectionCanon's own sign-in and registration — you'll confirm or create your
                account there before this invitation is applied to it.
              </p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="left" style="padding: 8px 40px 28px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" bgcolor="#F5A623" style="background-color:#F5A623;">
                  <a href="${esc(link)}" target="_blank" style="display:inline-block; padding: 16px 40px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #0D0D0F; text-decoration: none; white-space: nowrap;">
                    Accept Invitation
                  </a>
                </td>
              </tr></table>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 0 40px 28px 40px;">
              <p style="margin: 0 0 8px 0; font-family: Helvetica, Arial, sans-serif; font-size: 13px; line-height: 20px; color: #5C6672; word-break: break-all;">
                Or paste this link into your browser: <a href="${esc(link)}" style="color:#0A7F73;">${esc(link)}</a>
              </p>
              ${expiresText ? `<p style="margin: 0 0 8px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #5C6672;">This invitation expires ${esc(expiresText)}.</p>` : ""}
              <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5C6672;">
                This invitation is intended for ${esc(invitation.invited_email)}. If you sign in with a different email
                address, ElectionCanon will not let you accept it.
              </p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 20px 40px 32px 40px; border-top: 1px solid #1C2128;">
              <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #0A7F73; text-transform: uppercase;">
                Prepare&nbsp;&nbsp;&middot;&nbsp;&nbsp;Organize&nbsp;&nbsp;&middot;&nbsp;&nbsp;Coordinate&nbsp;&nbsp;&middot;&nbsp;&nbsp;Observe&nbsp;&nbsp;&middot;&nbsp;&nbsp;Respond
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding: 24px 8px 0 8px;">
          <p style="margin: 0 0 6px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #8899AA; text-transform: uppercase;">ElectionCanon</p>
          <p style="margin: 0 0 14px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5C6672;">
            An open-source operating system for running an election campaign.
          </p>
          <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; line-height: 17px; color: #3a4a5a;">
            You are receiving this because ${esc(invitation.invited_email)} was invited to a campaign on electioncanon.org.
            If you were not expecting this, you can safely ignore it — no account will be created and no action will be taken.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `"If you fail to prepare, you are preparing to fail." — Archbishop Benson Idahosa\n\n`
    + `${inviterLabel} has invited you to join ${cleanCampaignName} on ElectionCanon as ${roleLabel}${territoryLine}.\n`
    + (electionType ? `Election: ${electionType}\n\n` : `\n`)
    + `Accepting will take you through ElectionCanon's own sign-in and registration — you'll confirm or create your account there before this invitation is applied to it.\n\n`
    + `Accept your invitation: ${link}\n\n`
    + (expiresText ? `This invitation expires ${expiresText}.\n\n` : "")
    + `This invitation is intended for ${invitation.invited_email}. If you sign in with a different email address, `
    + `ElectionCanon will not let you accept it.\n\n`
    + `ElectionCanon — an open-source operating system for running an election campaign.`;

  return { subject, html, text };
}

/** Resend's request body — the ONLY place RESEND_API_KEY's caller (index.ts) needs to know the shape. */
export function buildResendRequest({ from, to, subject, html, text }) {
  return { from, to: [to], subject, html, text };
}

/** Resend returns {id} on acceptance, or {message,name} on refusal — never a delivery guarantee either way. */
export function interpretResendResponse(status, body) {
  if (status >= 200 && status < 300 && body && typeof body.id === "string") {
    return { ok: true, providerMessageId: body.id, error: null };
  }
  const message = (body && (body.message || body.error)) || `email provider returned HTTP ${status}`;
  return { ok: false, providerMessageId: null, error: message };
}

export default { RESPONSIBILITY_ROLE_LABEL, validateSendRequest, parseCampaignTitle, buildInvitationEmail, buildResendRequest, interpretResendResponse };
