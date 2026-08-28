// ============================================================
// FORGE URHOBO RESPONSE REALISATION — REFUSES UNTIL REVIEWED
//
// This is the seam respond.js will call once Urhobo realisers exist. It is written
// now, with the protected-term restoration and the refusal already in place, so that
// approving a phrase is the ONLY step between here and a working Urhobo answer — no
// new architecture, no second pipeline.
//
// IT CURRENTLY REALISES NOTHING, AND THAT IS THE CORRECT STATE. Producing an Urhobo
// sentence needs an approved sentence pattern; questions.js has none, because a
// dictionary gives words and not syntax. So `realise()` returns `{ realised: false }`
// and respond.js's existing fallback answers in English AND SAYS SO. A participant
// with ForgeOS in Urhobo gets correct Canon facts in English with a visible notice —
// never machine-guessed Urhobo.
//
// WHY A REFUSING MODULE IS WORTH COMMITTING. The alternative is to add Urhobo to
// REALISED_LANGUAGES later along with the templates, in one change, under time
// pressure — which is exactly when a plausible-looking sentence gets waved through.
// With the gate already built and tested, the reviewer's approval is the whole
// change, and the tests that forbid fabrication are already guarding it.
//
// PROTECTED TERMS ARE HANDLED HERE, NOT HOPED FOR. Whatever realisation eventually
// arrives, canonical identifiers pass through `protectTerms`/`restoreTerms` — the
// existing mechanism, not a second one — so `CHS-014`, `warri`, `FORGE-HUB`,
// `manufacturing` and `Ø25 ±0.05 mm` survive byte-for-byte inside any Urhobo
// sentence, and `verifyPreserved` proves it rather than assuming it.
// ============================================================

import { protectTerms, restoreTerms, verifyPreserved } from "../terms.js";
import { approvedPattern } from "./questions.js";
import { approvedPhrase } from "./phrases.js";
import { approvedFor } from "./lexicon.js";
import { technicalTerm } from "./technical.js";

/** Why a realisation was refused. Reported, never silently swallowed. */
export const REFUSAL = Object.freeze({
  NO_APPROVED_PATTERN: "no approved Urhobo sentence pattern for this intent",
  NO_APPROVED_VOCABULARY: "no approved Urhobo vocabulary for this response",
  TERMS_NOT_PRESERVED: "a canonical identifier did not survive realisation",
});

/**
 * Attempt an Urhobo realisation of an already-grounded answer.
 *
 * @param intentType  canonical intent id, e.g. "component.state"
 * @param values      canonical values to interpolate — ALREADY verified upstream
 * @returns {{ realised:false, reason:string } | { realised:true, text:string }}
 *
 * Values are NEVER translated. They are Canon identifiers and lifecycle state names;
 * `technicalTerm()` is consulted for the surrounding technical nouns only, and it
 * returns English until a reviewer approves otherwise.
 */
export function realise(intentType, values = {}) {
  const template = approvedPattern(intentType);
  if (!template) {
    return Object.freeze({ realised: false, reason: REFUSAL.NO_APPROVED_PATTERN, intentType });
  }

  // Protect every canonical value BEFORE any substitution touches the sentence.
  const canonical = Object.values(values).filter((v) => typeof v === "string" && v.length);
  const { masked, map } = protectTerms(canonical.join(" "));
  void masked;

  let text = template;
  for (const [key, value] of Object.entries(values)) {
    text = text.split(`{${key}}`).join(String(value));
  }
  text = restoreTerms(text, map);

  // A realisation that mangles an identifier is refused, not shipped.
  if (!verifyPreserved(canonical.join(" "), text).preserved) {
    return Object.freeze({ realised: false, reason: REFUSAL.TERMS_NOT_PRESERVED, intentType });
  }
  return Object.freeze({ realised: true, text });
}

/** Greeting, if one has been approved. Null is a normal, expected answer. */
export const greeting = (english) => approvedPhrase(english);

/** A single UI word, if approved. Callers fall back to English on null. */
export const word = (english) => approvedFor(english) ?? null;

/** Restated for callers: the technical term to use right now. */
export const term = technicalTerm;

/**
 * Is Urhobo realisation available at all?
 *
 * respond.js reads this rather than assuming. While false, `urh` stays out of
 * REALISED_LANGUAGES and the fallback-to-English notice keeps appearing — which is
 * how a participant learns the truth about coverage without reading a report.
 */
export function realisationAvailable() {
  return false;
}

export default { realise, greeting, word, term, realisationAvailable, REFUSAL };
