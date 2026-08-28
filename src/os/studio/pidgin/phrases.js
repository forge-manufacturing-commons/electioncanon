// ============================================================
// FORGE PIDGIN PHRASES — GREETINGS  (Alpha 1.2)
// Same accessor discipline as ../hausa/phrases.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const phrase = (pidgin, english, source, confidence, note = null) =>
  Object.freeze({ pidgin, english, category: "greeting", source, confidence, approved: false, note });

export const ATTESTED = Object.freeze([
  phrase("How far?", "hello (informal)", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("Gud monin", "good morning", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("How yu dey?", "how are you?", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  phrase("Tank yu", "thank you", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
]);

export const OPERATOR_SUPPLIED = Object.freeze([]);
export const ALL_PHRASES = Object.freeze([...ATTESTED, ...OPERATOR_SUPPLIED]);

export function approvedPhrase(english) {
  const p = ALL_PHRASES.find((x) => x.english === english);
  if (!p || !p.approved) return null;
  if (p.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return p.pidgin;
}

export default { ATTESTED, OPERATOR_SUPPLIED, ALL_PHRASES, approvedPhrase };
