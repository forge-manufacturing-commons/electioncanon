// ============================================================
// FORGE STUDIO — CONVERSATION  (conversational phase, §6, §7, §17)
//
// A participant should be able to type an identifier ONCE:
//
//   "What is the status of CHS-014?"   -> subject established
//   "Why?"                            -> same subject
//   "Who is responsible for it?"       -> same subject
//   "Where is it?"                     -> same subject
//   "What about inspection?"           -> same subject
//   "Prepare the inspection pass."     -> same subject
//
// WHAT A CONVERSATION IS ALLOWED TO BE, AND WHY THE LIMIT IS THE DESIGN.
//
// A conversation carries EXACTLY ONE KIND OF THING FORWARD: which Canon entities
// have been named. It does not carry facts, states, answers, provenance or
// authority. That restriction is not tidiness — it is the security property. If a
// conversation could carry a fact, then "CHS-014 has passed inspection" typed by a
// participant in turn 1 would be available as context in turn 2, and the difference
// between "the Canon records this" and "somebody said this earlier" would come down
// to whether a later layer remembered to check. Here the question cannot arise: the
// only thing memory can produce is an IDENTIFIER, and an identifier is worthless
// until the fold is read. `grounding.fromConversation` exists for the same reason
// one level down.
//
// AMBIGUITY IS RECORDED PER TURN, NOT PER CONVERSATION. A turn that named two
// entities put two entities in play; a later bare "it" is then genuinely ambiguous
// and §7 requires Forge to ask. This is why `subjects` is an array on every turn:
// with only a single `lastComponent`, a two-entity sentence silently collapsed to
// one subject and the clarification path could never fire. Dead safety code reads
// exactly like working safety code, which is the more expensive kind of bug.
//
// NOTHING HERE IS PERSISTED. There is no localStorage, no Supabase table, no
// IndexedDB and no cache — §26 lists persistent conversation storage as a STOP
// condition and this phase does not have that authorisation. A reload is a new
// conversation, and the Canon is entirely unaffected by either.
// ============================================================

import { entitiesNamed, resolveEntity, refersToSomething, DEFAULT_ENTITY_KINDS } from "./entity.js";

/**
 * How many turns back a subject may be carried.
 *
 * Small on purpose. A participant who has moved on three questions ago is not
 * usually still talking about the first part, and a long memory turns a helpful
 * carry-forward into a confidently wrong subject. Being asked "which component?" is
 * a mild cost; being answered about the wrong part is a manufacturing error.
 */
export const CARRY_WINDOW = 6;

/** The most turns a conversation retains at all, so a session cannot grow forever. */
export const MAX_TURNS = 40;

export const RESOLUTION = Object.freeze({
  NAMED:      "NAMED",       // the message named it outright
  CARRIED:    "CARRIED",     // taken from the conversation
  AMBIGUOUS:  "AMBIGUOUS",   // two or more plausible subjects — ASK
  NONE:       "NONE",        // nothing named and nothing to carry
});

export const emptyConversation = () => Object.freeze({ turns: Object.freeze([]) });

/**
 * Record a turn.
 *
 * `subjects` is every Canon entity the participant's words named — computed against
 * the live fold, so an entity that is not in the Canon is never remembered as
 * though it were.
 */
export function remember(conversation, { message, view = {}, intent = null, kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const named = entitiesNamed(message, view, { kinds });
  // The intent's resolved component counts as a subject even when the words did not
  // name it — that is how a CARRIED subject stays in play for the turn after next.
  const subjects = [...new Set([...named, ...(intent?.component ? [intent.component] : [])])];
  const turn = Object.freeze({
    message: String(message ?? ""),
    subjects: Object.freeze(subjects),
    // The INTENT TYPE only. Deliberately not the answer, not the claims, not the
    // sources — see the note at the top of this file about what memory may hold.
    //
    // `pendingType` WINS WHEN PRESENT, and that is what makes a clarification
    // answerable. When Forge asks "which one?", the turn's own `type` is UNKNOWN —
    // correctly, because nothing was read — but the question it was about to ask is
    // carried on `pendingType`. Recording that instead is the difference between
    // answering "HUB-002" and getting the status, and answering "HUB-002" and being
    // told Forge did not understand.
    //
    // It is still only an INTENT TYPE. No fact, no answer, no source: a pending
    // question is a question, which is exactly the kind of thing memory may hold.
    intentType: intent?.pendingType ?? intent?.type ?? null,
  });
  const turns = [...(conversation?.turns ?? []), turn].slice(-MAX_TURNS);
  return Object.freeze({ turns: Object.freeze(turns) });
}

/**
 * The subjects in play: those of the MOST RECENT TURN THAT NAMED ANY.
 *
 * NOT THE UNION ACROSS THE WINDOW, AND THE DIFFERENCE IS THE WHOLE BEHAVIOUR.
 *
 * The union was the first implementation and the suite killed it three ways at once:
 *
 *   * §23 ENTITY CONFUSION BROKE. "What is the status of CHS-014?" then "What about
 *     HUB-002?" then "Where is it?" — under a union, both parts were in play, so a
 *     perfectly clear switch became an ambiguity and Forge asked a question the
 *     participant had already answered by naming HUB-002.
 *   * A RESOLVED AMBIGUITY CAME BACK FROM THE DEAD. Forge asks "CHS-014 or HUB-002?",
 *     the participant answers "HUB-002", and the very next "Where is it?" was
 *     ambiguous again — because the older two-subject turn was still inside the
 *     window. Being asked the same question twice after answering it is worse than
 *     not being asked at all.
 *   * IT MADE AMBIGUITY THE DEFAULT for any conversation that ranged over two parts,
 *     which would have trained participants to always type the id — the exact
 *     behaviour this phase exists to remove.
 *
 * "The last thing mentioned" is what a person means by "it", and it is also
 * self-correcting: naming one part is all it takes to clear any earlier confusion.
 * §7 still fires exactly when it should, because a turn that named TWO parts is the
 * most recent subject-bearing turn until something else is named.
 *
 * `window` still bounds how far back the search goes, so a subject cannot be carried
 * out of a conversation that has plainly moved on.
 */
export function subjectsInPlay(conversation, { window = CARRY_WINDOW } = {}) {
  const turns = [...(conversation?.turns ?? [])].slice(-window).reverse();
  for (const t of turns) {
    const subjects = t.subjects ?? [];
    if (subjects.length) return Object.freeze([...new Set(subjects)]);
  }
  return Object.freeze([]);
}

/**
 * The intent type of the most recent turn that had a usable one.
 *
 * FOR INTENT CARRY-FORWARD, WHICH IS THE MIRROR OF SUBJECT CARRY-FORWARD.
 *
 * "What about HUB-002?" names a part and asks no question. It is not an unrecognised
 * sentence — it means "the question I just asked, about this part instead", and a
 * participant who has to retype "What is the status of HUB-002?" has learned that
 * Forge is not really following the conversation.
 *
 * This is a RULE, not a phrase. It adds no marker to any table and works for any
 * wording in any language that names an entity without asking anything — which is why
 * it belongs here rather than as five more entries per language in intent.js.
 *
 * UNKNOWN and ACTION_REQUEST are deliberately not carriable. Carrying UNKNOWN
 * achieves nothing, and carrying an action request would mean a participant who once
 * typed "approve this" had every later bare mention of a part re-read as a request to
 * act — turning a refusal they already received into a refusal they keep receiving.
 */
export function lastIntentType(conversation, { window = CARRY_WINDOW } = {}) {
  const turns = [...(conversation?.turns ?? [])].slice(-window).reverse();
  for (const t of turns) {
    const type = t.intentType;
    if (type && type !== "unknown" && type !== "action.request") return type;
  }
  return null;
}

/**
 * What is THIS message about?
 *
 * The precedence, and the reason for each step:
 *
 *   1. AN ENTITY THE MESSAGE NAMES WINS OUTRIGHT. "What about HUB-002?" changes the
 *      subject, because the participant just said so. Memory never overrides the
 *      words in front of it — that would make the conversation harder to steer the
 *      longer it went on.
 *   2. THE MESSAGE NAMES TWO EQUALLY -> ASK. `resolveEntity` refuses to pick and
 *      hands both back.
 *   3. NOTHING NAMED -> CARRY, IF THERE IS EXACTLY ONE SUBJECT IN PLAY.
 *   4. NOTHING NAMED AND TWO IN PLAY -> ASK. This is §7's case, and it fires
 *      whether or not the message contains a pronoun.
 *   5. NOTHING NAMED AND NOTHING IN PLAY -> NONE, and the caller asks which
 *      component. Never a guess, and never the string "—" presented as a subject.
 */
export function resolveSubject({ message, view = {}, conversation = null, kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const direct = resolveEntity(message, view, { kinds });

  if (direct.resolved) {
    return Object.freeze({ id: direct.id, kind: direct.kind,
                           how: RESOLUTION.NAMED, candidates: Object.freeze([direct.id]) });
  }
  if (direct.ambiguous) {
    return Object.freeze({ id: null, kind: null, how: RESOLUTION.AMBIGUOUS,
                           candidates: direct.candidates });
  }

  const inPlay = subjectsInPlay(conversation);
  if (inPlay.length === 1) {
    return Object.freeze({ id: inPlay[0], kind: null, how: RESOLUTION.CARRIED,
                           candidates: Object.freeze([inPlay[0]]),
                           explicitReference: refersToSomething(message) });
  }
  if (inPlay.length > 1) {
    // TWO SUBJECTS, NO NEW NAME. The honest answer is a question.
    //
    // Note this does NOT prefer the most recent. It could — "it" usually means the
    // last thing mentioned — but "usually" is the whole problem. The participant
    // who asked about two parts and then said "where is it?" knows which one they
    // meant and can say so in one word; Forge answering about the wrong part
    // produces a confident, plausible, wrong manufacturing statement, which is the
    // single worst thing this system can do.
    return Object.freeze({ id: null, kind: null, how: RESOLUTION.AMBIGUOUS,
                           candidates: Object.freeze([...inPlay].sort()) });
  }

  return Object.freeze({ id: null, kind: null, how: RESOLUTION.NONE,
                         candidates: Object.freeze([]) });
}

export default {
  emptyConversation, remember, subjectsInPlay, lastIntentType, resolveSubject,
  RESOLUTION, CARRY_WINDOW, MAX_TURNS,
};
