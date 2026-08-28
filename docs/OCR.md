# ElectionCanon — OCR-Assisted Evidence Extraction

## Status: real, client-side, assistive only

Unlike the WhatsApp channel contract (`WHATSAPP.md`), OCR is genuinely
implemented and working as of Alpha 1.2 — this is not a documented shape
waiting for a future integration. It runs entirely in the browser, using
[`tesseract.js`](https://github.com/naptha/tesseract.js) (MIT-licensed,
Apache Tesseract compiled to WebAssembly). No account, no API key, no
server-side secret, no image ever leaves the browser to a third-party OCR
vendor. See `src/domains/election/electionDay/ocr.js` (the provider
abstraction) and `src/domains/election/electionDay/ocrProviders/
tesseract.js` (the real implementation) for the code.

## OCR is assistance, never authority

The model, enforced structurally, not just by convention:

```
PHOTO -> EVIDENCE (Alpha 1.1: real, private, tenant-isolated storage)
       -> OCR (Alpha 1.2: real, client-side, confidence-bucketed reading)
       -> EXTRACTED VALUES (RESULT_OCR_PROCESSED — a separate, immutable event)
       -> HUMAN REVIEW (CONFIRM / CORRECT / DISPUTE)
       -> VERIFIED VALUES (RESULT_VERIFIED's reviewedFields)
       -> "ElectionCanon Verified Evidence" — still never an official result
```

`RESULT_OCR_PROCESSED` is a **separate event type** from both
`RESULT_CAPTURED` (the human-entered capture) and `RESULT_VERIFIED` (the
human review decision) — OCR completing never implies a human reviewed
anything, and the fold keeps `result.ocr.status` and
`result.verificationStatus` as two independently-readable facts. There is
no code path from "OCR extracted a value" directly to "this is the
recorded result" — every OCR reading requires an explicit human PREPARE →
APPROVE step to even be recorded, and a second, separate human PREPARE →
APPROVE step (the review) to become part of the human-facing record.

## Confidence, honestly

Every OCR-read field carries one of four buckets — `HIGH`, `MEDIUM`,
`LOW`, `UNKNOWN` — derived from tesseract.js's own real per-line
confidence score (not invented). A missing, malformed, or out-of-range
confidence value is always coerced to `UNKNOWN`, never silently promoted
to a more confident bucket. These buckets are a UI/UX honesty device, not
a certified accuracy claim — the header comment in
`ocrProviders/tesseract.js` states the threshold choice is engineering
judgment, not a validated accuracy figure.

## What "extract from image" actually does

`tesseract.js` recognises TEXT — lines, words, and per-word confidence.
It does not understand INEC result-sheet *layout*. `ocrProviders/
tesseract.js`'s `linesToFields()` applies a plain text heuristic to turn
recognised lines into candidate `{ field, value }` pairs: a line matching
`LABEL: VALUE`, `LABEL - VALUE`, or `LABEL` followed by a run of spaces/
dots and then a value (common on tally sheets, e.g. "Candidate A
.......... 123") is split into a labelled field; anything else is kept in
full as `"Line N (unlabeled)"` rather than silently dropped, so a human
reviewer always sees everything OCR actually read. This is explicitly a
heuristic, not form understanding, and the code says so.

## Human review preserves the original reading

When a human confirms or corrects an OCR-read field
(`proposeVerifyResult`'s `reviewedFields`), the event records **both**
`ocrValue` (untouched, whatever OCR actually read) **and** `value` (what
the human decided), with `source` honestly set to `"ocr_confirmed"` or
`"ocr_corrected"`. A correction is never a silent overwrite — the
original machine reading stays in the record permanently, auditable
alongside the human's decision.

## Consistency checking

The result-review screen runs a best-effort arithmetic check: if one
field's label contains "total" and at least two other fields look
numeric, it compares the total against their sum and flags a mismatch.
This is a **flag, never a correction** — ElectionCanon never silently
adjusts a figure to make the arithmetic work; a human sees the
discrepancy and decides.

## Self-hosting: engine yes, language data no

`worker.min.js` and the SIMD+LSTM WebAssembly core are copied from
`node_modules` into `public/tesseract/` (see that directory's own
`README.md`) and served from ElectionCanon's own origin — the OCR
*engine* has no third-party runtime dependency. The trained English
language data (`eng.traineddata`, several megabytes) is left at
tesseract.js's own default behavior — fetched from its public `tessdata`
CDN on first use and cached by the browser afterward. Bundling every
language's model file into this repository does not scale, and every
other self-hosted Tesseract deployment makes the same trade-off. This is
stated here plainly rather than claimed as "fully self-hosted."

## What is explicitly out of scope this phase

- No automatic acceptance of an OCR value into an official tally — every
  reading requires human review before it affects `verificationStatus`.
- No non-English OCR language pack wired in yet (English only).
- No cloud OCR vendor — see the "provider" abstraction in `ocr.js` if a
  higher-accuracy cloud vendor is ever added alongside `tesseract.js`;
  the public UI must continue to say "Extract from image," never a
  vendor name.
- No arithmetic auto-correction — the consistency check flags, it never
  edits a value on a human's behalf.

## Security notes

- OCR runs client-side — there is no new server secret, no new Edge
  Function, and no new Storage bucket for this capability. The evidence
  photo it reads is fetched via the same short-lived signed URL
  (`getResultEvidenceUrl`) every other evidence read already uses,
  governed by the same RLS policy as before.
- `RESULT_OCR_PROCESSED` events flow through the same `election_events`
  table and the same tenant-scoped RLS as every other Election Day
  event — no widened access, no new policy.
