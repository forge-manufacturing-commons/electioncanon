// ============================================================
// FORGE URHOBO PHRASES — GREETINGS AND SET EXPRESSIONS
//
// THE MOST IMPORTANT FINDING IN THIS PACK IS A NEGATIVE ONE.
//
// The brief listed eight greetings as "established forms" and asked that they be
// included with source orthography preserved:
//
//   Oma̩mo r'urhiọke · Oma̩mo r'Oghẹruvo · Oma̩mo r'Ovwọvwọ · Todẹ
//   Mavọ · Oshephiyọ · K'iruo vwo? · Iruo erọ / Iruo shephiyọ
//
// NOT ONE OF THEM APPEARS IN THE UKERE DICTIONARY. All 1,636 entries were parsed
// and each form searched, including plausible spelling variants and the tone-marked
// and unmarked shapes. `urhiọke`, `Oghẹruvo`, `todẹ`, `mavọ`, `shephiyọ` and
// `k'iruo` return nothing; the nearest hits are unrelated (`ovwọvwọvwe`;
// `ẹdiruo` "traditional working day"). The UCLA 1984 list is a phonetic elicitation
// set and contains no greetings at all.
//
// That does not mean they are wrong. They may well be current spoken Urhobo that a
// 1986 dictionary omits, or dialect forms — `mavó` IS in Ukere as an interrogative
// meaning "how", which makes "Mavọ" as a greeting entirely plausible. But the
// brief's own CRITICAL RULE is explicit: a form I cannot cite is
// `native_review_required` and must not reach production UI. So they are recorded
// here, in full, with their provenance stated as the operator brief — preserved for
// a reviewer to confirm, and withheld from the interface until one does.
//
// WHAT I CAN OFFER INSTEAD: fourteen greetings and set expressions that ARE in
// Ukere, tagged `excl.` or `exp.` by the source itself. Several are close to what
// the brief was reaching for — `míguẹ` for junior-to-senior respect, `kódẹ (tódẹ)`
// for "till tomorrow", which may be the `Todẹ` above.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const phrase = (urhobo, english, source, confidence, note = null) =>
  Object.freeze({ urhobo, english, category: "greeting", source, confidence,
                  approved: false, note });

// ============================================================
// ATTESTED IN UKERE — orthography exactly as the source prints it, including tone
// marks and the parenthesised variants the dictionary itself records.
// ============================================================
export const ATTESTED = Object.freeze([
  phrase("do", "thank; general greeting expressing a variety of sentiments",
         SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
         "Ukere: `do1 v.t`. The general-purpose greeting, and the closest attested " +
         "equivalent to a neutral 'hello' for a Forge interface."),
  phrase("míguẹ", "I am on my knees (junior to senior)",
         SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
         "Ukere: `exp.` Carries deference. Wrong register for a machine addressing a " +
         "participant — recorded for completeness, not proposed for the UI."),
  phrase("úyérén", "greeting, appreciation", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
         "Ukere: `úyérén1 n.` A noun for the act of greeting."),
  phrase("omagáre", "how are you?", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
         "Ukere: `int.` Also in the interrogative set."),
  phrase("Yéghwérẹ", "safe journey!", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("kédófa", "till another day / goodbye", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("késiéfa", "till another time / goodbye", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("kódẹ (tódẹ)", "till tomorrow / goodnight", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
         "Ukere: `exp.` The variant `tódẹ` may be the brief's `Todẹ` — a reviewer " +
         "should confirm, because if so the brief's form is attested after all."),
  phrase("fobọrhe", "you may return soon (farewell)", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("misiẹguare", "I greet the gathering (before and after a speech)",
         SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("yerobuwevwi", "greet all at home", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("gberuo", "please continue with your meal (singular)", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("wéruo", "please continue with your meal (collective)", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.`"),
  phrase("kada", "response of kings and chiefs to greetings and praise-singing",
         SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `exp.` Royal register."),
]);

// ============================================================
// FROM THE OPERATOR BRIEF — NOT CORROBORATED. Withheld from production.
// Orthography preserved exactly as supplied, including the `a̩` underdot.
// ============================================================
export const OPERATOR_SUPPLIED = Object.freeze([
  phrase("Oma̩mo r'urhiọke", "greeting (asserted: morning)",
         SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere; `urhiọke` returns no entry."),
  phrase("Oma̩mo r'Oghẹruvo", "greeting (asserted: afternoon)",
         SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere; `Oghẹruvo` returns no entry."),
  phrase("Oma̩mo r'Ovwọvwọ", "greeting (asserted: evening)",
         SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere; nearest form is the unrelated `ovwọvwọvwe`."),
  phrase("Todẹ", "greeting (asserted)", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not found as given. Ukere has `kódẹ (tódẹ) exp. till tomorrow/goodnight`, " +
         "which may be the same word — the single most likely of the eight to be " +
         "confirmable."),
  phrase("Mavọ", "greeting (asserted)", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not found as a greeting. Ukere has `mavó int. how`, so a greeting use is " +
         "plausible but unattested in the source."),
  phrase("Oshephiyọ", "greeting/response (asserted)", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere under any searched spelling."),
  phrase("K'iruo vwo?", "asserted: how is the work?", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere. `ẹdiruo n. traditional working day` shares the `iruo` element, " +
         "which is suggestive but not evidence for the phrase."),
  phrase("Iruo erọ", "asserted: the work is good", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere."),
  phrase("Iruo shephiyọ", "asserted: the work is fine", SOURCES.OPERATOR_BRIEF, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
         "Not in Ukere."),
]);

export const ALL_PHRASES = Object.freeze([...ATTESTED, ...OPERATOR_SUPPLIED]);

/** Production accessor. Approval is required, and review-required forms never pass. */
export function approvedPhrase(english) {
  const p = ALL_PHRASES.find((x) => x.english === english);
  if (!p || !p.approved) return null;
  if (p.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return p.urhobo;
}

export default { ATTESTED, OPERATOR_SUPPLIED, ALL_PHRASES, approvedPhrase };
