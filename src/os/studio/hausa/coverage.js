// ============================================================
// FORGE HAUSA COVERAGE — COUNTED, NOT CLAIMED  (Alpha 1.2)
// Same rule as ../urhobo/coverage.js: ElectionCanon must never say
// "Hausa is supported" because entries exist. `approvedForProduction`
// is the only figure a surface may act on, and it is zero.
// ============================================================

import { SUPPORTED_LANGUAGES, translations } from "../../i18n.js";
import { ALL, CONFIDENCE, UNSOURCED } from "./lexicon.js";
import { ALL_PHRASES, ATTESTED } from "./phrases.js";
import { TECHNICAL } from "./technical.js";
import { PATTERNS } from "./questions.js";

export function i18nCoverage(lang) {
  const en = translations.en ?? {};
  const target = translations[lang] ?? {};
  const keys = Object.keys(en);
  const present = keys.filter((k) => target[k] !== undefined);
  const identical = keys.filter((k) => target[k] === en[k]);
  const genuine = present.length - identical.length;
  return Object.freeze({
    language: lang, totalKeys: keys.length, present: present.length,
    identicalToEnglish: identical.length, genuine,
    percentGenuine: keys.length ? Math.round((genuine / keys.length) * 100) : 0,
    untranslatedKeys: Object.freeze(identical),
  });
}

export const allI18nCoverage = () => Object.freeze(SUPPORTED_LANGUAGES.map((l) => i18nCoverage(l.code)));

export function lexiconCoverage() {
  const items = [...ALL, ...ALL_PHRASES, ...TECHNICAL, ...PATTERNS];
  const by = (c) => items.filter((i) => i.confidence === c).length;
  return Object.freeze({
    totalEntries: items.length,
    webSourced: by(CONFIDENCE.WEB_SOURCED),
    nativeReviewRequired: by(CONFIDENCE.NATIVE_REVIEW_REQUIRED),
    approvedForProduction: items.filter((i) => i.approved).length,
    englishRetainedTechnical: TECHNICAL.filter((t) => t.retainEnglish).length,
    unsourcedUiConcepts: UNSOURCED.length,
    attestedPhrases: ATTESTED.length,
    questionPatternsApproved: PATTERNS.filter((p) => p.approved).length,
    questionPatternsTotal: PATTERNS.length,
  });
}

export function supportStatement(lang = "ha") {
  const ui = i18nCoverage(lang);
  const pack = lang === "ha" ? lexiconCoverage() : null;
  const parts = [
    `${lang} UI localisation is ${ui.percentGenuine}% genuinely translated ` +
    `(${ui.genuine} of ${ui.totalKeys} keys; ${ui.identicalToEnglish} still English).`,
  ];
  if (pack) {
    parts.push(
      pack.approvedForProduction === 0
        ? `The Forge Hausa lexicon has ${pack.totalEntries} researched entries and NONE ` +
          `approved for production — ${pack.webSourced} are web-sourced and awaiting native review.`
        : `${pack.approvedForProduction} of ${pack.totalEntries} Forge Hausa entries are approved.`,
    );
    parts.push(
      `Forge AI cannot yet answer in Hausa: ${pack.questionPatternsApproved} of ` +
      `${pack.questionPatternsTotal} sentence patterns are approved, so answers fall back to English and are labelled.`,
    );
  }
  return parts.join(" ");
}

export const translatorBrief = () => Object.freeze({
  ui: i18nCoverage("ha"), pack: lexiconCoverage(),
  technicalTermsNeedingTranslation: Object.freeze(TECHNICAL.filter((t) => !t.hausa).map((t) => t.english)),
  uiConceptsWithNoSource: UNSOURCED,
  sentencePatternsNeeded: Object.freeze(PATTERNS.map((p) => p.english)),
});

export default { i18nCoverage, allI18nCoverage, lexiconCoverage, supportStatement, translatorBrief };
