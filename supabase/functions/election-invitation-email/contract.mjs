// ============================================================
// ELECTIONCANON INVITATION EMAIL — WIRE CONTRACT  (First-user completion pass, item 4;
// redesigned in the human-first invitation-email pass)
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
//
// REDESIGN, 2026-09-02: the previous version opened with a motivational
// quote before a first-time recipient learned anything about who invited
// them or why, buried role/territory inside one long sentence, and
// rendered the full invitation link (including the raw token) as plain
// visible text below the button. This version leads with the invitation
// itself; states responsibility/area as two separate, labelled facts; adds
// an explicit numbered "what happens next" that matches AcceptInvite.jsx's
// real flow (see that file plus Election.jsx's own pending-invite-token
// redirect); and never prints the token as visible text anywhere in the
// HTML body (see buildInvitationEmail()'s own note on the plain-text
// alternative, which is the one place a raw link is unavoidable).
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

// geography_states.name is stored as its plain canonical name ("Lagos",
// "Delta", "Federal Capital Territory" — see the geography migration's own
// seed). "State" is a DISPLAY convention, not stored data, and does not
// apply to the one non-state entry (FCT already reads correctly on its
// own) — this check is against that literal, general seeded value, never
// against any particular state's name, so no state (Lagos or otherwise)
// is special-cased here.
function displayStateName(stateName) {
  if (!stateName) return null;
  return stateName === "Federal Capital Territory" ? stateName : `${stateName} State`;
}

/**
 * Composes the "Your area" line for whichever level this invitation is
 * actually at, from the REAL canonical names get_invitation_preview()
 * resolved (see that function's own migration) — never a guess, never
 * re-derived from anything but what was actually returned. Returns null
 * (never a fabricated placeholder) when there is no geography at all — a
 * Director-level invitation carries none, and the "Your area" fact block
 * is omitted entirely for it rather than shown empty.
 */
export function formatInvitationArea({ level, geographyName, geographyStateName, geographyLgaName, geographyWardName }) {
  if (!geographyName) return null;
  const stateDisplay = displayStateName(geographyStateName);
  const parts = [geographyName];
  if (level === "ward") {
    if (geographyLgaName) parts.push(geographyLgaName);
  } else if (level === "polling_unit") {
    if (geographyWardName) parts.push(geographyWardName);
    if (geographyLgaName) parts.push(geographyLgaName);
  }
  if (stateDisplay) parts.push(stateDisplay);
  return parts.join(", ");
}

/**
 * @param invitation    the REAL row read from campaign_invitations (via the
 *                       caller's own RLS-scoped session — see index.ts).
 * @param campaignName   the campaign's own real, stored name (still
 *                       "[ElectionType] Name" — split by parseCampaignTitle
 *                       below, never rendered raw).
 * @param geographyName, geographyStateName, geographyLgaName,
 *   geographyWardName   the real canonical names get_invitation_preview()
 *                       resolved for this invitation's level (see that
 *                       function's own migration) — composed into one
 *                       "Your area" line by formatInvitationArea() above.
 * @param invitedByName  the inviter's OWN display name/email, resolved by
 *                       index.ts from the CALLER's own forwarded session
 *                       (never a lookup of some other user's profile — the
 *                       caller invoking this function *is* invited_by, by
 *                       construction of create_campaign_invitation()). null
 *                       when it genuinely could not be resolved — rendered
 *                       as "your campaign team", never fabricated.
 * @param origin         the site origin (e.g. https://electioncanon.org),
 *                       used to build the exact same /invite/:token link the
 *                       "copy invitation link" fallback in the UI produces.
 */
export function buildInvitationEmail({
  invitation, campaignName, geographyName, geographyStateName, geographyLgaName, geographyWardName, invitedByName, origin,
}) {
  // campaigns.name is stored as "[ElectionType] Name" (unchanged, no
  // migration — see parseCampaignTitle()'s own header above). The email
  // must never render that raw bracket-prefixed string; the clean name and
  // the election type are shown separately, exactly like the app's own
  // display layer already does.
  const { name: cleanCampaignName, electionType } = parseCampaignTitle(campaignName);
  const displayCampaignName = cleanCampaignName || "an ElectionCanon campaign";
  const roleLabel = invitation.intended_responsibility_role
    ? RESPONSIBILITY_ROLE_LABEL[invitation.intended_responsibility_role] ?? invitation.intended_responsibility_role
    : "Campaign Director";
  const areaDisplay = formatInvitationArea({
    level: invitation.intended_level, geographyName, geographyStateName, geographyLgaName, geographyWardName,
  });
  const link = `${origin}/invite/${invitation.token}`;
  const inviterLabel = invitedByName?.trim() || "your campaign team";
  const expiresText = invitation.expires_at
    ? new Date(invitation.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Subject names both facts a recipient needs before even opening the
  // email — inviter and campaign — with the SAME honest fallback
  // ("your campaign team") the body uses when the inviter can't be
  // resolved, never "undefined"/"null". The token never appears here.
  const subject = `${inviterLabel} invited you to ${displayCampaignName} on ElectionCanon`;

  // Table-based HTML, inline CSS, no external fonts, no JavaScript — same
  // constraints and the same visual language (black/ivory/teal/amber/pink)
  // as supabase/email-templates/confirm-signup.html, reused rather than a
  // second visual identity. escapeHtml() guards every field that came from
  // a human typing into a form (invited_name, campaignName, geography
  // names, invitedByName) — the token/link are server-generated, never
  // user-typed.
  //
  // CONTENT ORDER, DELIBERATE: brand mark -> the invitation itself (who /
  // what) -> one plain-language sentence -> two labelled fact blocks
  // (responsibility, area) -> the one CTA -> numbered "what happens next"
  // (matching AcceptInvite.jsx's real flow, not an idealised one) ->
  // expiry/trust line -> footer, where the Archbishop Benson Idahosa quote
  // now lives as a small, secondary brand motif — present, never first.
  //
  // THE RAW TOKEN NEVER APPEARS AS VISIBLE HTML TEXT. It exists only
  // inside the two <a href="..."> targets below (the primary button and
  // the small "Open invitation" fallback link, whose own VISIBLE text is
  // never the URL) — never printed as a readable string a recipient could
  // screenshot or accidentally repaste out of context. (The plain-text
  // alternative body below is the one unavoidable exception: a client that
  // renders text/plain has no concept of a hidden link target at all, so
  // the literal URL is the only way that alternative can be clicked or
  // copied — see interpretResendResponse()'s own file header on why a
  // text alternative exists in the first place.)
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const factBlock = (label, value, accent) => `
            <tr><td style="padding: 0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="3" style="background-color:${accent}; font-size:0; line-height:0;">&nbsp;</td>
                <td style="padding-left: 14px;">
                  <p style="margin:0 0 3px 0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #8899AA; text-transform: uppercase;">${esc(label)}</p>
                  <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 800; color: #F5F1E9;">${esc(value)}</p>
                </td>
              </tr></table>
            </td></tr>`;
  const stepRow = (n, copy) => `
            <tr><td style="padding: 0 0 10px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="22" valign="top" style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; color: #0AB4A0;">${n}.</td>
                <td style="font-family: Helvetica, Arial, sans-serif; font-size: 13.5px; line-height: 20px; color: #C9CDD3;">${esc(copy)}</td>
              </tr></table>
            </td></tr>`;

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
    ${esc(inviterLabel)} invited you to join ${esc(displayCampaignName)} on ElectionCanon as ${esc(roleLabel)}${areaDisplay ? ` — ${esc(areaDisplay)}` : ""}.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0D0D0F" style="background-color:#0D0D0F;">
    <tr><td align="center" style="padding: 32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px;">
        <tr><td style="padding: 0 8px 20px 8px;">
          <span style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 800; letter-spacing: 2px; color: #0A7F73; text-transform: uppercase;">ElectionCanon</span>
        </td></tr>
        <tr><td style="background-color:#111418; border:1px solid #1C2128;">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 36px 40px 8px 40px;">
              <h1 style="margin:0 0 12px 0; font-family: Helvetica, Arial, sans-serif; font-weight: 800; font-size: 25px; line-height: 31px; color: #F5F1E9;">
                ${esc(inviterLabel)} invited you to join ${esc(displayCampaignName)}
              </h1>
              ${electionType ? `<p style="margin:0 0 14px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #8899AA; text-transform: uppercase;">Election: ${esc(electionType)}</p>` : ""}
              <p style="margin: 0 0 22px 0; font-family: Helvetica, Arial, sans-serif; font-size: 14.5px; line-height: 22px; color: #C9CDD3;">
                You've been invited to help coordinate this campaign on ElectionCanon.
              </p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 0 40px 8px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${factBlock("Your responsibility", roleLabel, "#0AB4A0")}
                ${areaDisplay ? factBlock("Your area", areaDisplay, "#F5A623") : ""}
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="left" style="padding: 8px 40px 10px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" bgcolor="#F5A623" style="background-color:#F5A623;">
                  <a href="${esc(link)}" target="_blank" style="display:inline-block; padding: 16px 40px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #0D0D0F; text-decoration: none; white-space: nowrap;">
                    Accept Invitation
                  </a>
                </td>
              </tr></table>
            </td></tr>
            <tr><td style="padding: 0 40px 28px 40px;">
              <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #5C6672;">
                Button not working? <a href="${esc(link)}" style="color:#0A7F73;">Open invitation</a>
              </p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 0 40px 28px 40px; border-top: 1px solid #1C2128; padding-top: 24px;">
              <p style="margin:0 0 12px 0; font-family: Helvetica, Arial, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #8899AA; text-transform: uppercase;">What happens next</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepRow(1, "Click Accept Invitation.")}
                ${stepRow(2, "Sign in, or create your ElectionCanon account.")}
                ${stepRow(3, "Review your role and area.")}
                ${stepRow(4, "Accept the invitation and join the campaign.")}
              </table>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 0 40px 28px 40px;">
              <p style="margin: 0 0 8px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5C6672;">
                This invitation is for ${esc(invitation.invited_email)}${expiresText ? ` and expires ${esc(expiresText)}` : ""}.
              </p>
              <p style="margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5C6672;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td></tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding: 20px 40px 32px 40px; border-top: 1px solid #1C2128;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="3" style="background-color:#FF2E63; font-size:0; line-height:0;">&nbsp;</td>
                <td style="padding-left: 14px;">
                  <p style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 13px; line-height: 19px; color: #8899AA;">
                    &ldquo;If you fail to prepare, you are preparing to fail.&rdquo; &mdash; Archbishop Benson Idahosa
                  </p>
                </td>
              </tr></table>
            </td></tr>
          </table>

        </td></tr>
        <tr><td style="padding: 24px 8px 0 8px;">
          <p style="margin: 0 0 6px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; font-weight: 800; letter-spacing: 1px; color: #8899AA; text-transform: uppercase;">ElectionCanon</p>
          <p style="margin: 0 0 14px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #5C6672;">
            An open-source election operating system.
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

  const text = `${inviterLabel} invited you to join ${displayCampaignName} on ElectionCanon.\n`
    + `You've been invited to help coordinate this campaign on ElectionCanon.\n`
    + (electionType ? `Election: ${electionType}\n\n` : `\n`)
    + `Your responsibility: ${roleLabel}\n`
    + (areaDisplay ? `Your area: ${areaDisplay}\n` : ``)
    + `\nAccept your invitation: ${link}\n\n`
    + `What happens next:\n`
    + `1. Click the link above.\n`
    + `2. Sign in, or create your ElectionCanon account.\n`
    + `3. Review your role and area.\n`
    + `4. Accept the invitation and join the campaign.\n\n`
    + `This invitation is for ${invitation.invited_email}` + (expiresText ? ` and expires ${expiresText}` : "") + `.\n`
    + `If you weren't expecting this invitation, you can safely ignore this email.\n\n`
    + `"If you fail to prepare, you are preparing to fail." — Archbishop Benson Idahosa\n\n`
    + `ElectionCanon — an open-source election operating system.`;

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

export default {
  RESPONSIBILITY_ROLE_LABEL, validateSendRequest, parseCampaignTitle, formatInvitationArea,
  buildInvitationEmail, buildResendRequest, interpretResendResponse,
};
