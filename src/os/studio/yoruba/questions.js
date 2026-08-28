// ============================================================
// FORGE YORUBA QUESTION PATTERNS — SPINE ATTESTED, SENTENCES NOT  (Alpha 1.2)
// Same reasoning as ../hausa/questions.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const pattern = (id, english, spine, note = null) => Object.freeze({
  id, english, yoruba: null, spine: Object.freeze(spine), category: "question",
  source: SOURCES.WIKT_NC, confidence: CONFIDENCE.NATIVE_REVIEW_REQUIRED, approved: false, note,
});

export const PATTERNS = Object.freeze([
  pattern("election.ward_status", "What is the status of {ward}?", [{ yoruba: "kíni", gloss: "what" }]),
  pattern("election.ward_who", "Who is responsible for {ward}?", [{ yoruba: "tani", gloss: "who" }]),
  pattern("election.pu_coverage", "Which polling units have no agent?", [{ yoruba: "tani", gloss: "who" }],
    "No attested Yoruba word for 'which' distinct from 'who' was found this pass."),
  pattern("election.next_action", "What should we do next?", [{ yoruba: "kíni", gloss: "what" }]),
  pattern("election.incident_status", "What incidents are unresolved?", [{ yoruba: "kíni", gloss: "what" }]),
]);

export function approvedPattern(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p || !p.approved || !p.yoruba) return null;
  return p.yoruba;
}

export const reviewWorksheet = () => Object.freeze(PATTERNS.map((p) => Object.freeze({
  id: p.id, english: p.english, attestedPieces: p.spine.map((s) => `${s.yoruba} — ${s.gloss}`), note: p.note,
})));

export default { PATTERNS, approvedPattern, reviewWorksheet };
