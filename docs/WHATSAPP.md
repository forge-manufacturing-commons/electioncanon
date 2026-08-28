# ElectionCanon — WhatsApp Channel Contract

## Status: documented, not implemented

No WhatsApp Business API credentials are configured anywhere in this
codebase. No message has ever been sent or received through WhatsApp by
ElectionCanon. No webhook endpoint exists. This document describes the
*shape* a WhatsApp channel adapter would take if built, so that when
credentials and a real integration are available, the work is "write an
adapter that matches an already-agreed contract," not "invent a new
write path into the Canon." See `src/domains/election/channels/
whatsapp.contract.js` for the same shape expressed as a non-imported
JavaScript interface stub.

## Why a channel, not a separate product

ElectionCanon's write functions (`propose*`/`execute*` in
`src/domains/election/{mobilization,electionDay}/write.js`, and the
generic free-text pipeline in `prepareElectionWrite`/
`approveElectionWrite`, `src/os/electionWebAdapter.js`) already take a
plain `{ client, fields }` or `{ client, message }` shape with no
assumption about the caller being a browser — see
`ARCHITECTURE.md`'s "Channel independence" section. A WhatsApp adapter's
only job is translating WhatsApp's transport (inbound webhook payloads,
outbound Business API calls) into calls against that same surface. It
must never re-implement election business logic, PREPARE/APPROVE
discipline, RLS, or rule checks of its own — those all live in the
domain layer and stay there regardless of which channel is calling them.

## What "channel" would mean concretely

1. **Inbound.** A webhook receives a WhatsApp message from a known,
   already-registered phone number. The adapter resolves that number to
   an existing campaign member (never auto-creates an actor from an
   inbound message — identity is established the same way it is on the
   web: through `Access.jsx` registration, not through a phone number
   appearing in a webhook payload). The message text is passed to the
   same `prepareElectionWrite`/`prepareMobilizationWrite`/
   `prepareElectionDayWrite` functions the web UI calls.
2. **PREPARE stays a reply, not a side effect.** Exactly like the web
   UI, the first message produces a PREPARE response (a human-readable
   summary of the proposed action) — never an immediate write. The
   adapter sends that summary back over WhatsApp as a reply.
3. **APPROVE requires an explicit second message.** A distinct
   affirmative reply (e.g. "yes," a fixed keyword, or a WhatsApp quick-
   reply button) triggers the corresponding `approve*` call with the
   SAME `confirmationId` issued at PREPARE time — the idempotency
   discipline every existing write path already follows. A channel
   adapter must never collapse PREPARE+APPROVE into one inbound message;
   doing so would remove the human confirmation step that exists on
   every other channel.
4. **Outbound evidence/notifications.** A verified result, a new
   incident, or an assignment change may be pushed out as an outbound
   WhatsApp notification to relevant coordinators — this is a *read* of
   the same Canon fold (`projectElection`) that Home/Intelligence
   already read, formatted for WhatsApp, never a second source of truth.
5. **Media (evidence photos).** If a result-sheet photo arrives as a
   WhatsApp media attachment, the adapter would call the same
   `uploadResultEvidence()` helper the web UI's `CaptureResultPanel`
   calls (`src/domains/election/electionDay/evidence.js`) — same bucket,
   same RLS, same upload-state honesty (an upload failure must be
   reported back to the sender, never silently dropped).

## What is explicitly out of scope for a first WhatsApp adapter

- No group-broadcast "campaign announcement" send is implied by this
  contract — that would be a Campaign Studio distribution feature, a
  separate decision with its own opt-in/consent requirements.
- No phone-number-based auto-registration. Identity is established
  through the existing `Access.jsx` flow; WhatsApp only recognizes
  numbers already linked to a registered actor.
- No storage of WhatsApp message content outside what an explicit
  `propose*/execute*` call already persists as a Canon event.

## Security notes for a future implementation

- The WhatsApp webhook verification token and Business API credentials
  would be server-side secrets (an edge function or backend service),
  never shipped to the browser bundle — the same rule that already
  applies to the Supabase service-role key, which this codebase never
  uses client-side.
- Rate limiting and sender verification happen before any `propose*`
  call is reached, so a spoofed or unregistered number cannot reach the
  Canon write surface at all.
