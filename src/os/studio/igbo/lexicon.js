// ============================================================
// FORGE IGBO LEXICON — SOURCE-BACKED, APPROVAL-GATED  (Alpha 1.2)
// Same discipline as ../urhobo/lexicon.js and ../hausa/lexicon.js.
//
// PRIMARY SOURCES
//   WIKIVOYAGE  Wikivoyage, "Igbo phrasebook".
//               https://en.wikivoyage.org/wiki/Igbo_phrasebook
//   WEB_GENERAL Cross-checked against multiple independent web results for
//               "gịnị" (what), "onye" (who), "ebee" (where) — these three
//               are corroborated across sources and treated as more
//               reliable than a single-page fetch; everything else in
//               this file comes from the one Wikivoyage fetch only.
//
// A first automated fetch of a comparative Niger-Congo word list returned
// an Igbo column that did NOT match these well-corroborated forms (it
// gave nonsense-looking short strings for "who"/"what"/"when"/"how") —
// that result was DISCARDED rather than transcribed, exactly the kind of
// near-miss ../urhobo/lexicon.js's own header warns about. Nothing from
// that garbled fetch appears below.
//
// `approved` is false everywhere.
// ============================================================

export const CONFIDENCE = Object.freeze({
  WEB_SOURCED: "web_sourced",
  NATIVE_REVIEW_REQUIRED: "native_review_required",
});

export const SOURCES = Object.freeze({
  WIKIVOYAGE: "Wikivoyage, Igbo phrasebook",
  WEB_GENERAL: "corroborated across multiple independent web sources",
  NONE: "not researched this pass",
});

const entry = (english, igbo, category, source, confidence, note = null) =>
  Object.freeze({ english, igbo, category, source, confidence, approved: false, note });

export const INTERROGATIVES = Object.freeze([
  entry("what", "gịnị", "interrogative", SOURCES.WEB_GENERAL, CONFIDENCE.WEB_SOURCED, null),
  entry("who", "onye", "interrogative", SOURCES.WEB_GENERAL, CONFIDENCE.WEB_SOURCED, null),
  entry("where", "ebee", "interrogative", SOURCES.WEB_GENERAL, CONFIDENCE.WEB_SOURCED, "Wikivoyage also gives 'kedụ ebe' as a fuller phrase form."),
  entry("how", "kedụ ka", "interrogative", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "From 'kèdú kà ímẹ̀rẹ̀?' — spine only, not the full attested sentence."),
]);

export const BASIC = Object.freeze([
  entry("yes", "éeyi", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Also attested: ëhh."),
  entry("no", "mba", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, null),
  entry("thank you", "dalu", "ui", SOURCES.WIKIVOYAGE, CONFIDENCE.WEB_SOURCED, "Also attested: imeela."),
]);

export const UNSOURCED = Object.freeze([
  "when", "which", "how many", "person", "name", "candidate", "campaign",
  "readiness", "ward", "polling unit", "agent", "incident", "evidence",
  "verified", "coordinator", "mobilize", "chat", "dashboard", "settings",
  "status", "next", "cancel", "save",
]);

export const ALL = Object.freeze([...INTERROGATIVES, ...BASIC]);

export function approvedFor(english) {
  const e = ALL.find((x) => x.english === english);
  if (!e || !e.approved || !e.igbo) return null;
  if (e.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return e.igbo;
}

export const reviewQueue = () =>
  Object.freeze(ALL.filter((e) => !e.approved).map((e) => Object.freeze({
    english: e.english, proposed: e.igbo, confidence: e.confidence, source: e.source, note: e.note,
  })));

export default { CONFIDENCE, SOURCES, INTERROGATIVES, BASIC, UNSOURCED, ALL, approvedFor, reviewQueue };
