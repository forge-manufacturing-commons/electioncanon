// ============================================================
// FORGE HAUSA LEXICON — SOURCE-BACKED, APPROVAL-GATED  (Alpha 1.2)
//
// Same discipline as ../urhobo/lexicon.js: every entry below was read out
// of a citable, linkable source. Nothing was generated, inferred from a
// related language, or back-translated. This is a SMALLER pack than
// Urhobo's — this pass researched only the interrogative spine and a
// handful of basic words, not a full 1,600-entry dictionary — so
// UNSOURCED below is long, honestly, rather than padded with guesses.
//
// PRIMARY SOURCES
//   WIKT_SWADESH  Wiktionary, "Appendix:Hausa Swadesh list" — a standard
//                 207-item comparative word list.
//                 https://en.wiktionary.org/wiki/Appendix:Hausa_Swadesh_list
//   WIKIVOYAGE    Wikivoyage, "Hausa phrasebook".
//                 https://en.wikivoyage.org/wiki/Hausa_phrasebook
//
// `approved` IS FALSE EVERYWHERE, EXACTLY LIKE URHOBO. A web source
// proves a word exists and is commonly used; it does not prove a native
// speaker accepts it as the correct ElectionCanon term in this specific
// civic-tech context. Only a reviewer sets `approved`. `approvedFor()` is
// the only production accessor and returns nothing until then.
// ============================================================

export const CONFIDENCE = Object.freeze({
  WEB_SOURCED: "web_sourced",
  NATIVE_REVIEW_REQUIRED: "native_review_required",
});

export const SOURCES = Object.freeze({
  WIKT_SWADESH: "Wiktionary, Appendix:Hausa Swadesh list",
  WIKIVOYAGE: "Wikivoyage, Hausa phrasebook",
  NONE: "not researched this pass",
});

const entry = (english, hausa, category, source, confidence, note = null) =>
  Object.freeze({ english, hausa, category, source, confidence, approved: false, note });

export const INTERROGATIVES = Object.freeze([
  entry("what", "me", "interrogative", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
  entry("who", "wa", "interrogative", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
  entry("where", "ina", "interrogative", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
  entry("when", "yaushe", "interrogative", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
  entry("how", "yaya", "interrogative", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
]);

export const BASIC = Object.freeze([
  entry("yes", "eh", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Wikivoyage phrasebook: 'eh' (stressed) = yes."),
  entry("no", "a'a", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Wikivoyage phrasebook."),
  entry("thank you", "na gode", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Wikivoyage phrasebook."),
  entry("person", "mutum", "noun", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list: 'mutum' (adult male sense noted by the source)."),
  entry("name", "suna", "noun", SOURCES.WIKT_SWADESH, CONFIDENCE.WEB_SOURCED, "Swadesh list entry."),
]);

// Every ElectionCanon UI/technical concept this pass searched for and did
// NOT find a citable Hausa source for — recorded explicitly, per the same
// "absence stated, not papered over" discipline as Urhobo's UNSOURCED.
export const UNSOURCED = Object.freeze([
  "candidate", "campaign", "readiness", "ward", "polling unit", "agent",
  "incident", "evidence", "verified", "coordinator", "mobilize", "chat",
  "dashboard", "settings", "status", "next", "cancel", "save",
]);

export const ALL = Object.freeze([...INTERROGATIVES, ...BASIC]);

/** THE ONLY PRODUCTION ACCESSOR — see ../urhobo/lexicon.js's own doc for why. */
export function approvedFor(english) {
  const e = ALL.find((x) => x.english === english);
  if (!e || !e.approved || !e.hausa) return null;
  if (e.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return e.hausa;
}

export const reviewQueue = () =>
  Object.freeze(ALL.filter((e) => !e.approved).map((e) => Object.freeze({
    english: e.english, proposed: e.hausa, confidence: e.confidence, source: e.source, note: e.note,
  })));

export default { CONFIDENCE, SOURCES, INTERROGATIVES, BASIC, UNSOURCED, ALL, approvedFor, reviewQueue };
