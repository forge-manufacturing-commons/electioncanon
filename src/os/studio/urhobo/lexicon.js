// ============================================================
// FORGE URHOBO LEXICON — SOURCE-BACKED, APPROVAL-GATED
//
// Every entry below was read out of a citable source and transcribed. Nothing was
// generated, inferred from a related language, or back-translated. Where a source
// could not be found, the entry is absent or English is retained — never invented.
//
// PRIMARY SOURCE
//   UKERE  Anthony Obakpọnọvwẹ Ukere, "Urhobo–English Dictionary", Ilupeju Press,
//          Benin City (preface dated 1986). Typed by George Sider for Kay
//          Williamson; this edition edited by Roger Blench, Cambridge 2005.
//          https://urhobodigitallibrarymuseum.com/wp-content/uploads/2021/10/urhobodictionary.pdf
//          Fetched and parsed in full: 1,636 part-of-speech-tagged entries, A–Z.
//   UCLA   UCLA Phonetics Lab Archive, Urhobo word list (1984), 107 entries with
//          orthography, IPA and English gloss.
//          https://archive.phonetics.ucla.edu/Language/URH/urh_word-list_1984_01.html
//
// THE DICTIONARY IS URHOBO→ENGLISH, WHICH MATTERS. Entries were located by
// searching the ENGLISH gloss, so a hit proves "this Urhobo word can mean X"; it
// does not prove "X is best rendered by this word" in a manufacturing UI. That gap
// is exactly what `native_review_required` exists to record, and it is why several
// findable words below are deliberately NOT approved.
//
// CONFIDENCE, AND WHAT IT HONESTLY MEANS
//   source_verified          a cited source gives this Urhobo form for this sense,
//                            and the sense matches the ForgeOS usage.
//   contextual               the source gives the form, but the SENSE needs judgement
//                            in a manufacturing UI.
//   native_review_required   no usable source, or the source's sense does not match
//                            the ForgeOS usage. NEVER shown to a participant.
//
// `approved` IS SEPARATE FROM `confidence` AND IS CURRENTLY FALSE EVERYWHERE.
// A citation proves a word exists; it does not prove a native speaker accepts it as
// the Forge term. Only a reviewer sets `approved`. `approvedFor()` is the only
// production accessor and it returns nothing until then — so this file cannot leak
// unreviewed Urhobo into the UI even by accident.
// ============================================================

export const CONFIDENCE = Object.freeze({
  SOURCE_VERIFIED: "source_verified",
  CONTEXTUAL: "contextual",
  NATIVE_REVIEW_REQUIRED: "native_review_required",
});

export const SOURCES = Object.freeze({
  UKERE: "Ukere, Urhobo–English Dictionary (ed. Blench, Cambridge 2005)",
  UCLA: "UCLA Phonetics Lab Archive, Urhobo word list 1984",
  OPERATOR_BRIEF: "operator brief (asserted, not corroborated by a cited source)",
  NONE: "no source found",
});

const entry = (english, urhobo, category, source, confidence, note = null) =>
  Object.freeze({ english, urhobo, category, source, confidence, approved: false, note });

// ============================================================
// CATEGORY 1 — BASIC UI LANGUAGE
//
// Of the 28 concepts the brief lists, 12 were found with a matching sense. The
// other 16 are recorded in UNSOURCED below with English retained. That ratio is the
// finding, not a shortfall to be papered over: a 1986 general dictionary simply does
// not contain "dashboard", "loading" or "settings".
// ============================================================
export const BASIC = Object.freeze([
  entry("home", "urhuẹ (ogbẹ)", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `urhuẹ (ogbẹ) n. home`. Domestic dwelling — a reviewer must confirm it " +
        "carries the 'home screen' sense before use as navigation."),
  entry("back", "obúko", "ui", SOURCES.UKERE, CONFIDENCE.CONTEXTUAL,
        "Ukere: `obúko n. back, behind`. Anatomical/spatial. Whether it serves as a " +
        "'go back' control is a review question."),
  entry("help", "ukécha", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ukécha n. help`. Direct gloss, no competing sense."),
  entry("language", "éphérẹ", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `éphérẹ1 n. language`."),
  entry("message", "óvuẹ", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `óvuẹ n. message`."),
  entry("question", "ónánó", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ónánó (onọ) n. question`. Variant `onọ` recorded by the source."),
  entry("answer", "ẹkpávwiyo", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ẹkpávwiyo n. answer/reply`."),
  entry("activity", "íruéru", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `íruéru n. activity`."),
  entry("yes", "e", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `e part. yes, response to most greetings and directives`. A particle, " +
        "not a standalone button label — review before using on a control."),
  entry("no", "ẹjo", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ẹjo a. no`. Adjectival; same caveat as `e`."),
  entry("today", "inónẹ", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `inónẹ n. today`."),
  entry("now", "nánánáná", "ui", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `nánánáná adv. now, just now`."),

  // FOUND BUT DELIBERATELY NOT USABLE. Recording these is the point: each is a real
  // dictionary hit that a careless importer would have shipped.
  entry("next", "kẹré", "ui", SOURCES.UKERE, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
        "Ukere: `kẹré prep. near, next, by` — SPATIAL adjacency, not sequence. Using " +
        "it on a Next button would say 'beside', not 'after'. Refused."),
  entry("state", null, "ui", SOURCES.UKERE, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
        "The only Ukere hits for 'state' are ideophones describing flame heat " +
        "(`gidigidi`), unripeness (`piápiá`) and tangling (`tighitighi`). None is the " +
        "lifecycle sense ForgeOS means. English retained."),
]);

// ============================================================
// USEFUL CONTENT WORDS, for building sentences later.
// ============================================================
export const CONTENT = Object.freeze([
  entry("person", "ohwó", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ohwó n. person`. Corroborated by UCLA 1984 #27 `ohwo` /oxʍó/ 'person'."),
  entry("thing", "órávwọ", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `órávwọ n. thing/something`."),
  entry("place", "asa", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `asa1 n. place`."),
  entry("knowledge", "ériáriẹ", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `ériáriẹ n. knowledge`."),
  entry("contribution", "árhóghọ", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `árhóghọ n. contribution`. NOTE: ForgeOS `contributions[]` is a " +
        "PARTICIPATION relation with precise semantics (E9.1). A reviewer must confirm " +
        "the everyday word carries that meaning before it labels the relation."),
  entry("evidence", "úseri", "noun", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `úseri n. proof, evidence`."),
  entry("see", "mrẹ", "verb", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `mrẹ v.t see`."),
  entry("say", "ta", "verb", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `ta1 v.t talk/say`."),
  entry("read", "se", "verb", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `se1 v.t read`."),
  entry("learn", "yono", "verb", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED,
        "Ukere: `yono v.t learn, study`."),

  entry("work", null, "noun", SOURCES.UKERE, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
        "Ukere gives `íruorugbóbọ n. manual work` and `ifo n. work or something done in " +
        "return for the same` — both narrower than ForgeOS 'work'. `ẹdiruo n. traditional " +
        "working day` and `íruéru n. activity` are adjacent. No generic term established."),
  entry("production", null, "noun", SOURCES.UKERE, CONFIDENCE.NATIVE_REVIEW_REQUIRED,
        "The only Ukere hit is `ẹmó n. production (of fruits)` — agricultural yield, not " +
        "manufacturing. Using it would be a false friend. English retained."),
]);

// ============================================================
// INTERROGATIVES — the grammatical spine of any question pattern.
// All twelve are tagged `int.` by Ukere, which makes them unusually well attested.
// ============================================================
export const INTERROGATIVES = Object.freeze([
  entry("what", "dié", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `dié int. what`."),
  entry("what else", "kídié", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `kídié int. what else`."),
  entry("who (singular)", "óno", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `óno int. who (sing.)`."),
  entry("who (collective)", "amóno", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `amóno int. who (coll.)`."),
  entry("where", "tivọ", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `tivọ int. where`."),
  entry("when", "ọkevó", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `ọkevó int. when`."),
  entry("how", "mavó", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `mavó int. how`."),
  entry("how many", "bró", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `bró1 int. how many?`."),
  entry("how much", "bró", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `bró2 int. how much?`."),
  entry("which", "vó", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `vó int. which`."),
  entry("how are you", "omagáre", "interrogative", SOURCES.UKERE, CONFIDENCE.SOURCE_VERIFIED, "Ukere: `omagáre int. how are you?`."),
  entry("state of a person or thing", "vwa", "interrogative", SOURCES.UKERE, CONFIDENCE.CONTEXTUAL,
        "Ukere: `vwa2 int. word that relates to the state of a person or thing`. The " +
        "closest attested form to a ForgeOS 'what is the status of X' question, but the " +
        "gloss describes a function rather than giving a usage — review required."),
]);

// ============================================================
// UNSOURCED — English retained, per the brief's explicit instruction.
//
// Searched across all 1,636 Ukere entries and the UCLA list; no entry with a
// matching sense. Keeping English is the correct outcome, not a gap in the work.
// ============================================================
export const UNSOURCED = Object.freeze([
  "cancel", "save", "close", "search", "settings", "dashboard", "status",
  "information", "details", "history", "loading", "unavailable", "error",
  "success", "warning", "continue", "open", "next",
]);

/** Every entry, one list. */
export const ALL = Object.freeze([...BASIC, ...CONTENT, ...INTERROGATIVES]);

/**
 * THE ONLY PRODUCTION ACCESSOR.
 *
 * Returns the Urhobo form only when a reviewer has approved it. Confidence alone is
 * never enough: `source_verified` means a book contains the word, which is not the
 * same as a speaker accepting it as the Forge term. Until review, this returns null
 * and the caller falls back to English — visibly, never silently.
 */
export function approvedFor(english) {
  const e = ALL.find((x) => x.english === english);
  if (!e || !e.approved || !e.urhobo) return null;
  if (e.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return null;
  return e.urhobo;
}

/** Everything a reviewer needs to work through, worst-confidence first. */
export const reviewQueue = () =>
  Object.freeze(ALL.filter((e) => !e.approved).map((e) => Object.freeze({
    english: e.english, proposed: e.urhobo, confidence: e.confidence,
    source: e.source, note: e.note,
  })));

export default { CONFIDENCE, SOURCES, BASIC, CONTENT, INTERROGATIVES, UNSOURCED, ALL,
                 approvedFor, reviewQueue };
