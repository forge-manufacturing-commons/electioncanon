// ============================================================
// FORGE YORUBA LEXICON — SOURCE-BACKED, APPROVAL-GATED  (Alpha 1.2)
// Same discipline as ../urhobo/lexicon.js and ../hausa/lexicon.js.
//
// PRIMARY SOURCES
//   WIKT_NC     Wiktionary, "Appendix:Niger-Congo Swadesh lists" (Yoruba column).
//               https://en.wiktionary.org/wiki/Appendix:Niger-Congo_Swadesh_lists
//   WIKIVOYAGE  Wikivoyage, "Yoruba phrasebook".
//               https://en.wikivoyage.org/wiki/Yoruba_phrasebook
//
// `approved` is false everywhere. See ../urhobo/lexicon.js for why a
// sourced word is not the same as a reviewer-accepted UI term.
// ============================================================

export const CONFIDENCE = Object.freeze({
  WEB_SOURCED: "web_sourced",
  NATIVE_REVIEW_REQUIRED: "native_review_required",
});

export const SOURCES = Object.freeze({
  WIKT_NC: "Wiktionary, Appendix:Niger-Congo Swadesh lists (Yoruba column)",
  WIKIVOYAGE: "Wikivoyage, Yoruba phrasebook",
  NONE: "not researched this pass",
});

const entry = (english, yoruba, category, source, confidence, note = null) =>
  Object.freeze({ english, yoruba, category, source, confidence, approved: false, note });

export const INTERROGATIVES = Object.freeze([
  entry("what", "kíni", "interrogative", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, "Also attested: kínlá, èwo."),
  entry("who", "tani", "interrogative", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, "Also attested: ẹnití."),
  entry("where", "níbo", "interrogative", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, "Also attested: ibo, níbití."),
  entry("when", "ìgbàtí", "interrogative", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, null),
  entry("how", "báwo", "interrogative", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, "Also attested: bí."),
]);

export const BASIC = Object.freeze([
  entry("thank you", "e se", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Addressing an elder; 'o se' for a peer — register choice needs review."),
  entry("person", "ènìyàn", "noun", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, null),
  entry("name", "orúkọ", "noun", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, null),
  entry("I", "èmi", "pronoun", SOURCES.WIKT_NC, CONFIDENCE.WEB_SOURCED, "Also attested: mo (subject clitic form)."),
]);

export const UNSOURCED = Object.freeze([
  "yes", "no", "candidate", "campaign", "readiness", "ward", "polling unit",
  "agent", "incident", "evidence", "verified", "coordinator", "mobilize",
  "chat", "dashboard", "settings", "status", "next", "cancel", "save",
]);

export const ALL = Object.freeze([...INTERROGATIVES, ...BASIC]);

export function approvedFor(english) {
  const e = ALL.find((x) => x.english === english);
  if (!e || !e.approved || !e.yoruba) return null;
  if (e.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return e.yoruba;
}

export const reviewQueue = () =>
  Object.freeze(ALL.filter((e) => !e.approved).map((e) => Object.freeze({
    english: e.english, proposed: e.yoruba, confidence: e.confidence, source: e.source, note: e.note,
  })));

export default { CONFIDENCE, SOURCES, INTERROGATIVES, BASIC, UNSOURCED, ALL, approvedFor, reviewQueue };
