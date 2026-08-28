# ElectionCanon — Public Release Manifest & Checklist

This document is the single place that answers "is ElectionCanon ready
to publish, and what exactly remains for the owner to do." It is
produced once per release-readiness pass (currently Alpha 1.7) and
should be re-read, not blindly trusted, the next time this question
comes up — re-verify anything time-sensitive (git-history reachability,
docs accuracy) rather than assuming it's still true.

## Release manifest (Alpha 1.7)

- **Base commit this pass built on**: `b76670b` (Alpha 1.4's
  release-readiness audit fixes, itself on `dcfcffb`/Alpha 1.3,
  `454d906`/Alpha 1.2, `7941be4`/Alpha 1.1).
- **Files this pass adds** (all additive, nothing existing modified other
  than build config): `election.html`, `public/election.webmanifest`,
  `vite.config.js` (multi-entry build input), `vercel.json` (one rewrite
  rule), this file.
- **Tests**: 4568/4568 passing before and after. **Build**: clean,
  produces `dist/index.html` (Forge-A-Truck) and `dist/election.html`
  (ElectionCanon) from the same app bundle.
- Everything else ElectionCanon has (Readiness, Mobilize, Coverage, Chat,
  Campaign Studio, Election Day, Evidence/OCR, Intelligence, Ask
  ElectionCanon, Settings) was built across Alpha 1.0-1.5 and verified
  live — through the real browser UI, not just REST — in Loop 1.6, then
  re-confirmed unchanged in Alpha 1.7.

## Release checklist

- [x] Product functionally real, no dead buttons (Loop 1.6, full browser
      walkthrough)
- [x] Tenant isolation adversarially tested (chat, election_events,
      evidence Storage) — repeated fresh in Alpha 1.6 and 1.7, both clean
- [x] No manufacturing/Forge-A-Truck leakage in the ElectionCanon UI
      itself (Alpha 1.4 audit, re-confirmed)
- [x] Static-HTML identity leak fixed — `/election` now serves its own
      title/description/OG/Twitter tags and manifest via
      `election.html`, verified by inspecting the actual `npm run build`
      output
- [x] Simulation/official-result boundary — no overclaiming copy found
      anywhere in the election UI (Loop 1.6 targeted sweep)
- [x] OSS docs (LICENSE/README/ARCHITECTURE/SECURITY/CONTRIBUTING/
      CODE_OF_CONDUCT/VOICE) accurate as of Alpha 1.4/1.5's line-by-line
      audit, re-spot-checked this pass, no drift found
- [ ] **GitHub repository visibility** — `PUBLIC VISIBILITY: OWNER ACTION
      REQUIRED`. No tool available to this session can read a GitHub
      repo's visibility setting. Check `github.com/forge-manufacturing-
      commons/fatt-app` → Settings → General → Danger Zone directly.
- [ ] **Real mobile-device/DevTools verification** — `MOBILE QA: BLOCKED
      BY TOOLING`, confirmed 4 independent times across Alpha 1.4-1.7
      (`window.innerWidth` never actually changes after a reported-
      successful `resize_window` call; this session's browser automation
      appears to run in a fixed-size virtual display). Needs a real
      phone or a working Chrome DevTools device toolbar outside this
      session, at minimum: 390×844, 768×1024, 1024×768, 1440×900,
      walking registration → Home → Mobilize → Coverage → Chat →
      Campaign Studio → Election Day (evidence upload, OCR review) →
      Intelligence → Settings.
- [ ] **Domain purchase + attachment** — not done, not attempted
      (explicitly out of scope for this session; see cutover checklist
      below).

## Rollback instructions

This pass's changes are pure-addition (two new files) plus two small,
independently-reversible config edits:

1. `git revert` the commit that adds `election.html`/
   `public/election.webmanifest`/the `vite.config.js` and `vercel.json`
   changes — or manually: delete `election.html` and
   `public/election.webmanifest`, remove the `build.rollupOptions.input`
   block from `vite.config.js`, remove the two `/election`/`/election/`
   rewrite entries from `vercel.json`.
2. Redeploy. `index.html`/the Forge-A-Truck shell and every other route
   are untouched by this pass, so a rollback here cannot affect anything
   outside the two new files and the two config additions.
3. No database/RLS change was made this pass — nothing to roll back
   there.

## Domain cutover checklist (ElectionCanon → its own hostname)

**Already real, already shipped** (in `src/App.jsx`, committed at HEAD,
confirmed by reading the file directly — not something this pass built):
a `useEffect` that redirects `electioncanon.org`/`www.electioncanon.org`'s
bare root (`/`) to `/election`, and `isElectionForge`, which suppresses
Forge-A-Truck's shared chrome (nav rail, footer) on any `/election*`
path or `/access?product=election`. Both are dormant until the domain is
actually attached — they are not hypothetical, they are inert code
waiting for DNS.

**Still needed, in order, all owner/account actions**:

1. **Domain registration** — purchase `electioncanon.org` (or the chosen
   domain) from a registrar. Not done.
2. **Vercel domain attachment** — add the domain to this project in
   Vercel's dashboard (Project → Settings → Domains). Not done.
3. **DNS configuration** — point the domain's DNS at Vercel per Vercel's
   own instructions for that domain (typically an A/ALIAS record for the
   apex and a CNAME for `www`). Not done.
4. **HTTPS** — Vercel provisions this automatically once DNS resolves
   correctly; no separate action.
5. **Canonical hostname / www vs. non-www** — decide which is canonical
   (recommend apex `electioncanon.org` canonical, `www` redirecting to
   it) and configure that redirect in Vercel's domain settings.
6. **ElectionCanon hostname routing** — already handled client-side (see
   above); once DNS/Vercel are configured, no further app code should be
   needed for a visitor at the new domain's root to land on `/election`.
7. **Old `forgeatruck.ng/election` behavior** — decide whether to keep it
   live (as a secondary path into the same app, harmless to leave) or
   redirect it to the new domain. Not decided; no urgency either way
   since it's not broken by attaching a new domain.
8. **Authentication redirect behaviour** — Supabase Auth's email
   templates/redirect URLs (password reset, magic link, email
   confirmation) are configured with an allow-list of redirect URLs in
   the Supabase dashboard (Authentication → URL Configuration). The new
   domain must be added to that allow-list or auth emails sent to users
   on the new domain will redirect incorrectly. Not done — requires
   Supabase project dashboard access.
9. **OAuth/email-confirmation URLs** — same Supabase dashboard surface as
   #8; no separate OAuth provider is configured for ElectionCanon
   currently (email/password only), so this is limited to the email
   redirect allow-list.
10. **Open Graph URLs** — `election.html`'s `og:title`/`og:description`
    (added this pass) have no `og:url` set (correctly — the canonical URL
    isn't decided/live yet). Add `<meta property="og:url" content="https://electioncanon.org/">`
    to `election.html` once the domain is attached and canonical.
11. **robots/sitemap** — no `robots.txt` or sitemap exists for either
    product currently; decide whether ElectionCanon wants one once it has
    a real public domain (out of scope to invent before that).
12. **Removing this cutover checklist's dormant-code caveat** — once the
    domain is attached and confirmed working, update the comments in
    `src/App.jsx` (around `isElectionCanonHost`) that currently say
    "inert until electioncanon.org is actually attached" to reflect that
    it's live — a documentation-only follow-up, not a code change.

## Git-history cleanup procedure (proposed, NOT executed)

Verified reproducible 4 times across Alpha 1.5-1.7 in a disposable local
clone (`git clone` of the local repo into scratch space, never touching
`origin`):

1. `git clone <local-repo-path> <scratch-dir>` — a disposable clone, not
   the working repo.
2. In that clone: `git filter-branch --force --index-filter "git rm
   --cached --ignore-unmatch fatt-current.zip forge-sprint2.zip
   gcm-diagnose.log" --prune-empty --tag-name-filter cat -- --all`
3. `rm -rf .git/refs/original/ && git reflog expire --expire=now --all
   && git gc --prune=now --aggressive`
4. Verify: `git log --all -- fatt-current.zip forge-sprint2.zip
   gcm-diagnose.log` must return nothing (confirmed clean every time this
   has been run).
5. Re-sweep the cleaned clone's full blob contents for the same
   machine-identifier strings (Windows username, computer name, GitHub
   handle) — confirmed clean for the three named files; a SEPARATE,
   unrelated finding (Manufacturing-side PNG metadata leaking a local
   path, 20 files, still live in current HEAD — see below) is NOT fixed
   by this procedure, since those files are still tracked, not deleted.
6. Confirm the cleaned clone still builds (`npm install && npm run
   build`) and tests pass (`npm test`) — not yet re-verified in the
   clone after this pass's new files; re-run this specific check before
   actually publishing.
7. **This has never been applied to the real `origin`.** Doing so
   requires: (a) confirming GitHub visibility first (above), (b) explicit
   owner authorization to force-push, (c) awareness that a rewritten
   history breaks any existing clone/fork's ability to fast-forward.

## GitHub publication steps (once the above are cleared)

1. Confirm current repo visibility and decide: publish this existing
   repo (after history cleanup) as public, or create a fresh public repo
   from the cleaned clone's history and treat the current private repo
   as the permanent development copy.
2. If publishing the cleaned history to a NEW public repository (lower
   risk — never touches the existing shared `origin`): push the cleaned
   disposable clone's `main` to the new repo's `origin` directly. No
   force-push needed since it's a brand-new remote.
3. If rewriting the EXISTING repo's history in place instead: this
   requires explicit owner authorization for a force-push, coordination
   with anyone who has an existing clone (their clone will need to be
   re-cloned, not pulled, after the rewrite), and should be done as its
   own explicit, separate action — not bundled into a feature/release
   commit.
4. Either way: re-run the full test suite and build against whatever
   history ends up public, one more time, immediately before or
   immediately after the publish action, so the published state is
   verified, not assumed.

## Known, out-of-scope findings (not fixed by any ElectionCanon release
work, restated for visibility)

- **Manufacturing-side PNG metadata leak** (found Alpha 1.6): 20 files
  under `public/assets/NMCP/`, `public/renders/`, `src/assets/nigeria/`
  embed a local Windows path via Blender's PNG `tEXt` chunks, live in
  current HEAD. Not ElectionCanon's to fix; whoever owns the Manufacturing
  asset pipeline needs to re-export or strip metadata from those files.
