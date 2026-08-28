// ============================================================
// FORGE PIDGIN QUESTION PATTERNS — SPINE ATTESTED, SENTENCES NOT  (Alpha 1.2)
//
// Even though Pidgin syntax is closer to English than the other three
// packs, the SAME rule applies: no full sentence is invented without a
// citable attested example. "Who dey handle Ward 3?" (the kind of
// sentence a directive brief might use as an illustration) is NOT
// recorded as attested here — it is a plausible construction, not a
// sourced one, and the difference matters exactly as much as it does
// for Hausa/Yoruba/Igbo.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const pattern = (id, english, spine, note = null) => Object.freeze({
  id, english, pidgin: null, spine: Object.freeze(spine), category: "question",
  source: SOURCES.SELF_ASSESSED, confidence: CONFIDENCE.NATIVE_REVIEW_REQUIRED, approved: false, note,
});

export const PATTERNS = Object.freeze([
  pattern("election.ward_status", "What is the status of {ward}?", [{ pidgin: "wetin", gloss: "what" }]),
  pattern("election.ward_who", "Who is responsible for {ward}?", [{ pidgin: "who", gloss: "who" }],
    "'who' recorded at COMMON_USAGE confidence in lexicon.js — not independently corroborated this pass."),
  pattern("election.pu_coverage", "Which polling units have no agent?", [{ pidgin: "which", gloss: "which (English retained, UNSOURCED)" }]),
  pattern("election.next_action", "What should we do next?", [{ pidgin: "wetin", gloss: "what" }]),
  pattern("election.incident_status", "What incidents are unresolved?", [{ pidgin: "wetin", gloss: "what" }]),
]);

export function approvedPattern(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p || !p.approved || !p.pidgin) return null;
  return p.pidgin;
}

export const reviewWorksheet = () => Object.freeze(PATTERNS.map((p) => Object.freeze({
  id: p.id, english: p.english, attestedPieces: p.spine.map((s) => `${s.pidgin} — ${s.gloss}`), note: p.note,
})));

export default { PATTERNS, approvedPattern, reviewWorksheet };
