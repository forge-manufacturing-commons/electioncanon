// ============================================================
// FORGE URHOBO COVERAGE — COUNTED, NOT CLAIMED
//
// The rule this file exists to enforce:
//
//   ForgeOS must never say "Urhobo is supported" because 45 Urhobo keys exist.
//   It may say "Urhobo localisation is 31% genuinely translated".
//
// I reported 100% coverage in an earlier phase. That was wrong. It counted KEY
// PRESENCE — every language has all 45 keys — while 31 of the 45 Urhobo values are
// still the English string. Presence is not translation, and the difference is the
// whole point of this module.
//
// TWO INDEPENDENT MEASURES, because they answer different questions:
//
//   i18nCoverage(lang)   How much of the SHIPPED UI is genuinely in this language?
//                        Computed by comparing each value against English. Crude —
//                        a legitimately identical value (a proper noun like "NMCP")
//                        counts as untranslated — so `identicalToEnglish` is reported
//                        separately rather than hidden inside a percentage.
//
//   lexiconCoverage()    How much of the FORGE URHOBO PACK is approved for use?
//                        Currently zero: everything awaits native review. A citation
//                        proves a word exists; only a speaker makes it the Forge term.
//
// Neither number is allowed to round upward. `supportStatement()` produces the exact
// sentence ForgeOS may say, and it cannot be made to say "supported".
// ============================================================

import { SUPPORTED_LANGUAGES, translations } from "../../i18n.js";
import { ALL, CONFIDENCE, UNSOURCED } from "./lexicon.js";
import { ALL_PHRASES, ATTESTED, OPERATOR_SUPPLIED } from "./phrases.js";
import { TECHNICAL } from "./technical.js";
import { PATTERNS } from "./questions.js";

/**
 * Genuine UI translation coverage for one language.
 *
 * `genuine` counts keys whose value DIFFERS from English. A proper noun that is
 * correctly identical will be undercounted, which is the safe direction to be wrong
 * in: it can only understate coverage, never overstate it.
 */
export function i18nCoverage(lang) {
  const en = translations.en ?? {};
  const target = translations[lang] ?? {};
  const keys = Object.keys(en);
  const present = keys.filter((k) => target[k] !== undefined);
  const identical = keys.filter((k) => target[k] === en[k]);
  const genuine = present.length - identical.length;
  return Object.freeze({
    language: lang,
    totalKeys: keys.length,
    present: present.length,
    identicalToEnglish: identical.length,
    genuine,
    percentGenuine: keys.length ? Math.round((genuine / keys.length) * 100) : 0,
    untranslatedKeys: Object.freeze(identical),
  });
}

/** Every language, so the gap between them is visible at a glance. */
export const allI18nCoverage = () =>
  Object.freeze(SUPPORTED_LANGUAGES.map((l) => i18nCoverage(l.code)));

/**
 * Coverage of the Forge Urhobo pack itself.
 *
 * `approvedForProduction` is the only figure a surface may act on. It is zero, and
 * it will stay zero until a reviewer sets `approved` on individual entries.
 */
export function lexiconCoverage() {
  const items = [...ALL, ...ALL_PHRASES, ...TECHNICAL, ...PATTERNS];
  const by = (c) => items.filter((i) => i.confidence === c).length;
  return Object.freeze({
    totalEntries: items.length,
    sourceVerified: by(CONFIDENCE.SOURCE_VERIFIED),
    contextual: by(CONFIDENCE.CONTEXTUAL),
    nativeReviewRequired: by(CONFIDENCE.NATIVE_REVIEW_REQUIRED),
    approvedForProduction: items.filter((i) => i.approved).length,
    englishRetainedTechnical: TECHNICAL.filter((t) => t.retainEnglish).length,
    unsourcedUiConcepts: UNSOURCED.length,
    attestedPhrases: ATTESTED.length,
    uncorroboratedPhrases: OPERATOR_SUPPLIED.length,
    questionPatternsApproved: PATTERNS.filter((p) => p.approved).length,
    questionPatternsTotal: PATTERNS.length,
  });
}

/**
 * The exact sentence ForgeOS is permitted to say about Urhobo.
 *
 * There is deliberately no branch that produces the word "supported". The strongest
 * statement available is a percentage plus the approval count, and while
 * `approvedForProduction` is zero the sentence says so in as many words.
 */
export function supportStatement(lang = "urh") {
  const ui = i18nCoverage(lang);
  const pack = lang === "urh" ? lexiconCoverage() : null;
  const parts = [
    `${lang} UI localisation is ${ui.percentGenuine}% genuinely translated ` +
    `(${ui.genuine} of ${ui.totalKeys} keys; ${ui.identicalToEnglish} still English).`,
  ];
  if (pack) {
    parts.push(
      pack.approvedForProduction === 0
        ? `The Forge ${lang} lexicon has ${pack.totalEntries} researched entries and ` +
          `NONE approved for production — ${pack.sourceVerified} are source-verified and ` +
          `awaiting native review.`
        : `${pack.approvedForProduction} of ${pack.totalEntries} Forge ${lang} entries are approved.`,
    );
    parts.push(
      `Forge AI cannot yet answer in ${lang}: ${pack.questionPatternsApproved} of ` +
      `${pack.questionPatternsTotal} sentence patterns are approved, so answers fall back ` +
      `to English and are labelled.`,
    );
  }
  return parts.join(" ");
}

/** What a translator needs, in one object. */
export const translatorBrief = () => Object.freeze({
  ui: i18nCoverage("urh"),
  pack: lexiconCoverage(),
  technicalTermsNeedingTranslation:
    Object.freeze(TECHNICAL.filter((t) => !t.urhobo).map((t) => t.english)),
  uiConceptsWithNoSource: UNSOURCED,
  phrasesNeedingCorroboration:
    Object.freeze(OPERATOR_SUPPLIED.map((p) => p.urhobo)),
  sentencePatternsNeeded: Object.freeze(PATTERNS.map((p) => p.english)),
});

export default { i18nCoverage, allI18nCoverage, lexiconCoverage, supportStatement, translatorBrief };
