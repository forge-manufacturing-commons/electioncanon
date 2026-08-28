// ============================================================
// FORGE PIDGIN (NAIJA) LEXICON — SOURCE-BACKED, APPROVAL-GATED  (Alpha 1.2)
//
// Nigerian Pidgin is the one language this pass researched most, per the
// user's own direction — it is close enough to English that cautious,
// real content is tractable without a specialist dictionary. Even so,
// the SAME discipline as every other pack applies: nothing is fabricated,
// and `approved` is false everywhere until a native speaker reviews it.
//
// PRIMARY SOURCE
//   WIKIVOYAGE  Wikivoyage, "Nigerian Pidgin phrasebook".
//               https://en.wikivoyage.org/wiki/Nigerian_Pidgin_phrasebook
//
// A THIRD, LOWER CONFIDENCE TIER EXISTS HERE ON PURPOSE.
//   COMMON_USAGE — this session's own general familiarity with widely-used
//   Pidgin, NOT independently corroborated by a cited source this pass
//   (e.g. Wikivoyage's phrasebook did not list a word for "who"). This is
//   explicitly a WEAKER claim than WEB_SOURCED, not a stronger one — it
//   is recorded honestly as "asserted, not corroborated," the same
//   category the Urhobo pack calls OPERATOR_BRIEF, and it can NEVER be
//   approved without a reviewer regardless of how ordinary the word
//   seems, for exactly the reason near-misses elsewhere in these packs
//   demonstrate: what seems obvious can still be wrong.
// ============================================================

export const CONFIDENCE = Object.freeze({
  WEB_SOURCED: "web_sourced",
  COMMON_USAGE: "common_usage_uncorroborated",
  NATIVE_REVIEW_REQUIRED: "native_review_required",
});

export const SOURCES = Object.freeze({
  WIKIVOYAGE: "Wikivoyage, Nigerian Pidgin phrasebook",
  WIKTIONARY: "Wiktionary, wahala",
  SELF_ASSESSED: "this session's general familiarity, not independently corroborated",
  NONE: "not researched this pass",
});

const entry = (english, pidgin, category, source, confidence, note = null) =>
  Object.freeze({ english, pidgin, category, source, confidence, approved: false, note });

export const INTERROGATIVES = Object.freeze([
  entry("what", "wetin", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "e.g. 'Wetin bi your name?'"),
  entry("where", "wia", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "e.g. 'Wie di toilet dey?' (spelling varies: wia/wie)."),
  entry("how", "how", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Retained from English; e.g. 'How yu dey?'"),
  entry("how much", "how much", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Retained from English; e.g. 'How much be the ticket?'"),
  entry("when", "when", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Retained from English in the source's own examples."),
  entry("who", "who", "interrogative", SOURCES.SELF_ASSESSED, CONFIDENCE.COMMON_USAGE,
    "Not listed in the Wikivoyage phrasebook this pass consulted — recorded as commonly retained from English, unverified."),
  entry("why", "why", "interrogative", SOURCES.SELF_ASSESSED, CONFIDENCE.COMMON_USAGE,
    "Not listed in the source consulted — recorded from general familiarity only."),
]);

export const BASIC = Object.freeze([
  entry("yes", "yes o", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  entry("no", "no o", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  entry("please", "abeg", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  entry("thank you", "tank yu", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
]);

// ALPHA 1.3 — CIVIC/ELECTION VOCABULARY. Most of the brief's 20 concepts
// (polling unit, ward, LGA, constituency, candidate, agent, observer,
// result sheet, evidence, coordinator, assignment, task) are recorded in
// technical.js as DELIBERATELY RETAINED English — that is not a gap,
// it is the honest finding: in real spoken Pidgin, INEC/administrative
// terms are used AS-IS ("dem dey do accreditation for polling unit"),
// not translated. What belongs HERE, in the lexicon proper, is the one
// genuinely Pidgin-specific civic word this pass could source: "wahala"
// ("trouble/problem"), colloquially used for election disputes and
// incidents (e.g. the real headline "Transmission 'Wahala': As
// lawmakers tinker, trust in 2027 election wanes" — a citable example
// of exactly this civic usage, not an invented one).
export const CIVIC = Object.freeze([
  entry("dispute", "wahala", "civic", SOURCES.WIKTIONARY, CONFIDENCE.COMMON_USAGE,
    "Wiktionary: 'wahala' = trouble/problem, from Hausa 'wàhalā̀'. Colloquially used for election-related trouble " +
    "(citable example: a 2026 Businessday headline 'Transmission \"Wahala\"...'), but this is a general trouble-word, " +
    "not a precise legal/procedural term for a formal Election-Day dispute — a native reviewer must confirm the register fits."),
  entry("incident", "wahala", "civic", SOURCES.WIKTIONARY, CONFIDENCE.COMMON_USAGE,
    "Same source and same caveat as 'dispute' — 'wahala' is broad enough to cover both senses colloquially, which is " +
    "itself a reason a reviewer should decide whether ElectionCanon needs to distinguish them in Pidgin at all."),
]);

export const UNSOURCED = Object.freeze([
  "which", "verified", "mobilize", "chat", "dashboard", "settings",
  "status", "next", "cancel", "save",
]);

export const ALL = Object.freeze([...INTERROGATIVES, ...BASIC, ...CIVIC]);

export function approvedFor(english) {
  const e = ALL.find((x) => x.english === english);
  if (!e || !e.approved || !e.pidgin) return null;
  if (e.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return e.pidgin;
}

export const reviewQueue = () =>
  Object.freeze(ALL.filter((e) => !e.approved).map((e) => Object.freeze({
    english: e.english, proposed: e.pidgin, confidence: e.confidence, source: e.source, note: e.note,
  })));

export default { CONFIDENCE, SOURCES, INTERROGATIVES, BASIC, UNSOURCED, ALL, approvedFor, reviewQueue };
