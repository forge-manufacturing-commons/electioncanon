// ============================================================
// FORGE URHOBO TECHNICAL REGISTRY — ENGLISH RETAINED, ON PURPOSE
//
// Nineteen ForgeOS terms were searched across all 1,636 Ukere entries and the UCLA
// word list. NONE has an established Urhobo technical equivalent. Every one keeps
// English, which is the brief's own instruction:
//
//   "Where a technically appropriate Urhobo equivalent cannot be established:
//    KEEP THE ENGLISH TERM. Do not manufacture terminology."
//
// This is not a failure of searching. A general dictionary compiled in 1986 has no
// reason to contain "specification", "acknowledgement" or "coordination" in the
// senses ForgeOS uses, and the two near-misses below show exactly how a careless
// import would have gone wrong:
//
//   production  →  Ukere `ẹmó n. production (of fruits)`   agricultural yield
//   state       →  Ukere ideophones for flame heat, unripeness, tangling
//
// Both are real dictionary hits. Both would be false friends on a manufacturing
// screen. Recording the near-miss is more useful than recording nothing, because it
// tells the next person why the obvious candidate was rejected.
//
// A REGISTRY, NOT A TRANSLATOR. Forge AI may not translate these terms freely — it
// reads this table. `technicalTerm()` returns English until a reviewer supplies and
// approves an Urhobo form, so the model has no route to invent one.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const tech = (english, { candidate = null, source = SOURCES.NONE,
                         confidence = CONFIDENCE.NATIVE_REVIEW_REQUIRED,
                         usage, note = null } = {}) =>
  Object.freeze({
    english,
    urhobo: candidate,          // null = no candidate at all
    retainEnglish: true,        // flipped only by a reviewer, per term
    category: "technical",
    source, confidence, approved: false, usage, note,
  });

export const TECHNICAL = Object.freeze([
  tech("organisation", { usage: "An institution responsible for a component (ForgeOS RESPONSIBILITY)." }),
  tech("workshop", { usage: "A physical manufacturing site. ForgeOS `hub`.",
    note: "Ukere has `ugbokodo` glossed in i18n's existing urh strings as 'workshops'. " +
          "That value predates this pack and I could not trace its source, so it is not " +
          "adopted here — see coverage.js on pre-existing i18n entries." }),
  tech("manufacturing", { usage: "A canonical component lifecycle state. PROTECTED — see CATEGORY 6.",
    note: "Also a protected Canon state name, so it must survive verbatim regardless." }),
  tech("engineering", { usage: "The specification domain and its room." }),
  tech("inspection", { usage: "Verification of a component against its specification.",
    note: "The brief names this one explicitly as an acceptable English retention." }),
  tech("production", { candidate: null, source: SOURCES.UKERE,
    usage: "The making of a component.",
    note: "NEAR MISS REJECTED: Ukere `ẹmó n. production (of fruits)` is agricultural " +
          "yield, not manufacture. Adopting it would be a false friend." }),
  tech("component", { usage: "A single manufactured part. Its ID is protected." }),
  tech("specification", { usage: "The controlled document a component is made against." }),
  tech("mission", { usage: "A national manufacturing objective with a target." }),
  tech("project", { usage: "A body of coordinated work." }),
  tech("responsible", { usage: "Holds accountability for a component (E5/E9 RESPONSIBILITY)." }),
  tech("contribution", { candidate: "árhóghọ", source: SOURCES.UKERE,
    confidence: CONFIDENCE.CONTEXTUAL,
    usage: "PARTICIPATION in a component's making, distinct from responsibility (E9.1).",
    note: "Ukere `árhóghọ n. contribution` is attested, but ForgeOS gives the word a " +
          "precise relational meaning. A reviewer must confirm the everyday term carries " +
          "it before this labels the relation." }),
  tech("participant", { usage: "A person taking part in manufacturing.",
    note: "Ukere `ohwó n. person` is attested and may compose into a phrase, but " +
          "'participant' as a role term is not established." }),
  tech("coordination", { usage: "Directing work between two parties (E9.3)." }),
  tech("instruction", { usage: "A directive issued from one party to another." }),
  tech("acknowledgement", { usage: "The two-party resolution of a directive (E9.5)." }),
  tech("approval", { usage: "An authorised decision that a specification may be manufactured." }),
  tech("evidence", { candidate: "úseri", source: SOURCES.UKERE,
    confidence: CONFIDENCE.CONTEXTUAL,
    usage: "Proof supporting a manufacturing claim.",
    note: "Ukere `úseri n. proof, evidence`. Sense matches; ForgeOS does not yet record " +
          "evidence at all, so this is ahead of the Canon." }),
  tech("measurement", { usage: "A recorded dimensional value. Values themselves are PROTECTED." }),
  tech("state", { candidate: null, source: SOURCES.UKERE,
    usage: "A component's position in its lifecycle.",
    note: "NEAR MISS REJECTED: the only Ukere hits are ideophones — `gidigidi` (flame " +
          "heat), `piápiá` (unripeness), `tighitighi` (tangling). None is the lifecycle sense." }),
  tech("event", { usage: "A canonical recorded fact. Event type strings are PROTECTED." }),
  tech("recommendation", { usage: "What ForgeOS suggests. Never a recorded fact." }),
  tech("authority", { usage: "The capability to record a given event." }),
  tech("Canon", { usage: "The event-sourced record of manufacturing truth.",
    note: "A ForgeOS proper noun. Should arguably remain 'Forge Canon' verbatim in every " +
          "language, like a product name." }),
  tech("knowledge", { candidate: "ériáriẹ", source: SOURCES.UKERE,
    confidence: CONFIDENCE.CONTEXTUAL,
    usage: "Documented engineering understanding.",
    note: "Ukere `ériáriẹ n. knowledge`. General sense attested; technical sense unreviewed." }),
]);

/**
 * The term Forge AI must use. English until a reviewer says otherwise.
 *
 * There is deliberately no path from a model to this function's output: it reads the
 * frozen table and nothing else, so an unapproved candidate can never be emitted.
 */
export function technicalTerm(english) {
  const t = TECHNICAL.find((x) => x.english === english);
  if (!t) return english;
  if (t.retainEnglish || !t.approved || !t.urhobo) return english;
  if (t.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return english;
  return t.urhobo;
}

/** Terms with a candidate awaiting review — the shortest useful worklist. */
export const candidatesAwaitingReview = () =>
  Object.freeze(TECHNICAL.filter((t) => t.urhobo && !t.approved)
    .map((t) => Object.freeze({ english: t.english, candidate: t.urhobo,
                                confidence: t.confidence, note: t.note })));

/** Terms with no candidate at all — these need a translator, not a reviewer. */
export const termsWithNoCandidate = () =>
  Object.freeze(TECHNICAL.filter((t) => !t.urhobo).map((t) => t.english));

export default { TECHNICAL, technicalTerm, candidatesAwaitingReview, termsWithNoCandidate };
