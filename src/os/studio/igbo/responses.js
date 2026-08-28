// ============================================================
// FORGE IGBO RESPONSE REALISATION — REFUSES UNTIL REVIEWED  (Alpha 1.2)
// Same seam as ../hausa/responses.js.
// ============================================================

import { protectTerms, restoreTerms, verifyPreserved } from "../terms.js";
import { approvedPattern } from "./questions.js";
import { approvedPhrase } from "./phrases.js";
import { approvedFor } from "./lexicon.js";
import { technicalTerm } from "./technical.js";

export const REFUSAL = Object.freeze({
  NO_APPROVED_PATTERN: "no approved Igbo sentence pattern for this intent",
  NO_APPROVED_VOCABULARY: "no approved Igbo vocabulary for this response",
  TERMS_NOT_PRESERVED: "a canonical identifier did not survive realisation",
});

export function realise(intentType, values = {}) {
  const template = approvedPattern(intentType);
  if (!template) return Object.freeze({ realised: false, reason: REFUSAL.NO_APPROVED_PATTERN, intentType });
  const canonical = Object.values(values).filter((v) => typeof v === "string" && v.length);
  const { map } = protectTerms(canonical.join(" "));
  let text = template;
  for (const [key, value] of Object.entries(values)) text = text.split(`{${key}}`).join(String(value));
  text = restoreTerms(text, map);
  if (!verifyPreserved(canonical.join(" "), text).preserved) {
    return Object.freeze({ realised: false, reason: REFUSAL.TERMS_NOT_PRESERVED, intentType });
  }
  return Object.freeze({ realised: true, text });
}

export const greeting = (english) => approvedPhrase(english);
export const word = (english) => approvedFor(english) ?? null;
export const term = technicalTerm;
export function realisationAvailable() { return false; }

export default { realise, greeting, word, term, realisationAvailable, REFUSAL };
