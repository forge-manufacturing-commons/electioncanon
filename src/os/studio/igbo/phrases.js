// ============================================================
// FORGE IGBO PHRASES — GREETINGS  (Alpha 1.2)
// Same accessor discipline as ../hausa/phrases.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const phrase = (igbo, english, source, confidence, note = null) =>
  Object.freeze({ igbo, english, category: "greeting", source, confidence, approved: false, note });

export const ATTESTED = Object.freeze([
  phrase("Kedu", "hello (informal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("Ndewo", "hello (formal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("Ututu oma", "good morning", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("Dalu", "thank you", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Also attested: imeela."),
]);

export const OPERATOR_SUPPLIED = Object.freeze([]);
export const ALL_PHRASES = Object.freeze([...ATTESTED, ...OPERATOR_SUPPLIED]);

export function approvedPhrase(english) {
  const p = ALL_PHRASES.find((x) => x.english === english);
  if (!p || !p.approved) return null;
  if (p.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return p.igbo;
}

export default { ATTESTED, OPERATOR_SUPPLIED, ALL_PHRASES, approvedPhrase };
