// ============================================================
// FORGE URHOBO QUESTION PATTERNS — SPINE ATTESTED, SENTENCES NOT
//
// The brief asked for fourteen natural Urhobo question patterns. I can supply the
// GRAMMATICAL SPINE of every one of them from a citable source, and I cannot supply
// the sentences. Both halves of that matter, so both are recorded.
//
// WHAT IS ATTESTED. Ukere tags twelve interrogatives as `int.`, which is unusually
// strong evidence — the source is asserting a part of speech, not just a gloss:
//
//   dié   what        óno    who (sing.)    tivọ  where     mavó  how
//   kídié what else   amóno  who (coll.)    ọkevó when      bró   how many/much
//   vó    which       omagáre how are you?  vwa   state of a person or thing
//
// WHAT IS NOT. A dictionary gives words, not syntax. I have no attested Urhobo
// sentence in the source — not one worked example of subject-verb-object order,
// question particle placement, or how an interrogative combines with a noun phrase.
// Composing `tivọ` + `CHS-014` into a sentence and calling it Urhobo would be
// exactly the fabrication the brief forbids, and it would be fabrication of the
// least detectable kind: individually correct words in an order no speaker uses.
//
// So every PATTERN below is `native_review_required` with `urhobo: null`, and its
// `spine` records the attested pieces a translator would build from. That gives a
// reviewer a filled-in worksheet rather than a blank page, without a single invented
// sentence.
//
// UNDERSTANDING IS UNAFFECTED. This file is about GENERATING Urhobo. Recognising an
// Urhobo question is intent.js's job, and it needs marker phrases rather than
// grammar — the interrogatives above are usable there the moment a reviewer confirms
// them, because matching a word does not require producing a sentence.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const pattern = (id, english, spine, note = null) =>
  Object.freeze({
    id, english,
    urhobo: null,                      // NOTHING INVENTED
    spine: Object.freeze(spine),       // attested pieces, each citable
    category: "question",
    source: SOURCES.UKERE,
    confidence: CONFIDENCE.NATIVE_REVIEW_REQUIRED,
    approved: false,
    note,
  });

export const PATTERNS = Object.freeze([
  pattern("component.state", "What is the status of {C}?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "vwa", gloss: "word relating to the state of a person or thing", pos: "int." }],
    "`vwa` is the closest attested form to a status question, but Ukere describes its " +
    "function rather than showing it used. Highest-value item for a reviewer."),
  pattern("component.happening", "What is happening with {C}?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "íruéru", gloss: "activity", pos: "n." }]),
  pattern("component.next_action", "What should we do next?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "kídié", gloss: "what else", pos: "int." }],
    "No attested sequential 'next'. `kẹré` is spatial adjacency and was rejected in " +
    "lexicon.js; `kídié` (what else) may carry the sense better."),
  pattern("component.who", "Who is responsible for {C}?",
    [{ urhobo: "óno", gloss: "who (singular)", pos: "int." },
     { urhobo: "amóno", gloss: "who (collective)", pos: "int." }],
    "An organisation is a collective, so `amóno` may be the correct choice over `óno` " +
    "— a genuine grammatical decision only a speaker can make."),
  pattern("component.hub", "Where is {C} being produced?",
    [{ urhobo: "tivọ", gloss: "where", pos: "int." },
     { urhobo: "asa", gloss: "place", pos: "n." }]),
  pattern("component.history", "What happened to {C}?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "ọkevó", gloss: "when", pos: "int." }]),
  pattern("component.history.show", "Show me the history of {C}.",
    [{ urhobo: "mrẹ", gloss: "see", pos: "v.t" }],
    "Imperative formation is unattested; `mrẹ` is the verb stem only."),
  pattern("component.ready", "Is {C} ready?",
    [{ urhobo: "vwa", gloss: "state of a person or thing", pos: "int." }],
    "No attested yes/no question particle. `e` (yes) and `ẹjo` (no) are attested as " +
    "answers, which does not establish how the question is framed."),
  pattern("inspection.status", "Has {C} passed inspection?",
    [{ urhobo: "vwa", gloss: "state of a person or thing", pos: "int." }],
    "`inspection` is retained in English per technical.js."),
  pattern("component.directives", "Who directed this work?",
    [{ urhobo: "óno", gloss: "who (singular)", pos: "int." }],
    "No attested term for 'direct'/'instruct'. `ta` (talk/say) is not a directive."),
  pattern("acknowledgement.status", "Has the work been accepted?",
    [{ urhobo: "vwa", gloss: "state of a person or thing", pos: "int." }],
    "Neither 'accept' nor 'acknowledge' is attested."),
  pattern("component.explain", "Tell me about this component.",
    [{ urhobo: "ta", gloss: "talk/say", pos: "v.t" },
     { urhobo: "órávwọ", gloss: "thing/something", pos: "n." }]),
  pattern("canon.has", "What information does Forge Canon have?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "ériáriẹ", gloss: "knowledge", pos: "n." }],
    "'information' is unattested; `ériáriẹ` (knowledge) is the nearest attested noun."),
  pattern("canon.missing", "What information is missing?",
    [{ urhobo: "dié", gloss: "what", pos: "int." },
     { urhobo: "kídié", gloss: "what else", pos: "int." }]),
]);

/**
 * No pattern is production-ready, and this says so rather than returning something.
 *
 * The return shape is deliberately the same as an approved lookup would be, so the
 * caller's code path is identical whether or not review has happened — there is no
 * "temporary" branch to forget to remove later.
 */
export function approvedPattern(id) {
  const p = PATTERNS.find((x) => x.id === id);
  if (!p || !p.approved || !p.urhobo) return null;
  return p.urhobo;
}

/** The worksheet: every pattern with its attested pieces, for a translator. */
export const reviewWorksheet = () =>
  Object.freeze(PATTERNS.map((p) => Object.freeze({
    id: p.id, english: p.english,
    attestedPieces: p.spine.map((s) => `${s.urhobo} (${s.pos}) — ${s.gloss}`),
    note: p.note,
  })));

export default { PATTERNS, approvedPattern, reviewWorksheet };
