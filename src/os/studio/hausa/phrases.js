// ============================================================
// FORGE HAUSA PHRASES — GREETINGS  (Alpha 1.2)
// Same accessor discipline as ../urhobo/phrases.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const phrase = (hausa, english, source, confidence, note = null) =>
  Object.freeze({ hausa, english, category: "greeting", source, confidence, approved: false, note });

export const ATTESTED = Object.freeze([
  phrase("Sannu", "hello", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Common informal greeting."),
  phrase("Ina kwana?", "good morning / how did you sleep?", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Morning-specific greeting."),
  phrase("Yaya za ka/ki?", "how are you?", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "General 'how are you' — /ki for a female addressee."),
  phrase("Na gode", "thank you", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
]);

export const OPERATOR_SUPPLIED = Object.freeze([]);
export const ALL_PHRASES = Object.freeze([...ATTESTED, ...OPERATOR_SUPPLIED]);

export function approvedPhrase(english) {
  const p = ALL_PHRASES.find((x) => x.english === english);
  if (!p || !p.approved) return null;
  if (p.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return p.hausa;
}

export default { ATTESTED, OPERATOR_SUPPLIED, ALL_PHRASES, approvedPhrase };
