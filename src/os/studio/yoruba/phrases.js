// ============================================================
// FORGE YORUBA PHRASES — GREETINGS  (Alpha 1.2)
// Same accessor discipline as ../hausa/phrases.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const phrase = (yoruba, english, source, confidence, note = null) =>
  Object.freeze({ yoruba, english, category: "greeting", source, confidence, approved: false, note });

export const ATTESTED = Object.freeze([
  phrase("Bawo ni", "hello / how are you?", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("E kaaro", "good morning (formal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("E kaasan", "good afternoon (formal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("E kaale", "good evening (formal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("E se", "thank you (to an elder)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "'O se' is the peer-register form — register choice needs native review."),
]);

export const OPERATOR_SUPPLIED = Object.freeze([]);
export const ALL_PHRASES = Object.freeze([...ATTESTED, ...OPERATOR_SUPPLIED]);

export function approvedPhrase(english) {
  const p = ALL_PHRASES.find((x) => x.english === english);
  if (!p || !p.approved) return null;
  if (p.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return p.yoruba;
}

export default { ATTESTED, OPERATOR_SUPPLIED, ALL_PHRASES, approvedPhrase };
