// ============================================================
// FORGE IGBO QUESTION PATTERNS — SPINE ATTESTED, SENTENCES NOT  (Alpha 1.2)
// Same reasoning as ../hausa/questions.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const pattern = (id, english, spine, note = null) => Object.freeze({
  id, english, igbo: null, spine: Object.freeze(spine), category: "question",
  source: SOURCES.WEB_GENERAL, confidence: CONFIDENCE.NATIVE_REVIEW_REQUIRED, approved: false, note,
});

export const PATTERNS = Object.freeze([
  pattern("election.ward_status", "What is the status of {ward}?", [{ igbo: "gịnị", gloss: "what" }]),
  pattern("election.ward_who", "Who is responsible for {ward}?", [{ igbo: "onye", gloss: "who" }]),
  pattern("election.pu_coverage", "Which polling units have no agent?", [{ igbo: "onye", gloss: "who" }],
    "No attested Igbo word for 'which' was found this pass."),
  pattern("election.next_action", "What should we do next?", [{ igbo: "gịnị", gloss: "what" }]),
  pattern("election.incident_status", "What incidents are unresolved?", [{ igbo: "gịnị", gloss: "what" }]),
]);

export function approvedPattern(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p || !p.approved || !p.igbo) return null;
  return p.igbo;
}

export const reviewWorksheet = () => Object.freeze(PATTERNS.map((p) => Object.freeze({
  id: p.id, english: p.english, attestedPieces: p.spine.map((s) => `${s.igbo} — ${s.gloss}`), note: p.note,
})));

export default { PATTERNS, approvedPattern, reviewWorksheet };
