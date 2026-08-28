// ============================================================
// FORGE HAUSA QUESTION PATTERNS — SPINE ATTESTED, SENTENCES NOT  (Alpha 1.2)
//
// Same reasoning as ../urhobo/questions.js: a word list gives words, not
// syntax. Every pattern below is `native_review_required` with
// `hausa: null` — no sentence is invented, ever. `spine` records the
// attested interrogative a translator would build from.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const pattern = (id, english, spine, note = null) => Object.freeze({
  id, english, hausa: null, spine: Object.freeze(spine), category: "question",
  source: SOURCES.WIKT_SWADESH, confidence: CONFIDENCE.NATIVE_REVIEW_REQUIRED, approved: false, note,
});

export const PATTERNS = Object.freeze([
  pattern("election.ward_status", "What is the status of {ward}?", [{ hausa: "me", gloss: "what" }]),
  pattern("election.ward_who", "Who is responsible for {ward}?", [{ hausa: "wa", gloss: "who" }]),
  pattern("election.pu_coverage", "Which polling units have no agent?", [{ hausa: "wa", gloss: "who" }],
    "No attested Hausa word for 'which' was found this pass — 'wa' (who) is the nearest attested interrogative, not a confirmed fit."),
  pattern("election.next_action", "What should we do next?", [{ hausa: "me", gloss: "what" }]),
  pattern("election.incident_status", "What incidents are unresolved?", [{ hausa: "me", gloss: "what" }]),
]);

export function approvedPattern(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p || !p.approved || !p.hausa) return null;
  return p.hausa;
}

export const reviewWorksheet = () => Object.freeze(PATTERNS.map((p) => Object.freeze({
  id: p.id, english: p.english, attestedPieces: p.spine.map((s) => `${s.hausa} — ${s.gloss}`), note: p.note,
})));

export default { PATTERNS, approvedPattern, reviewWorksheet };
