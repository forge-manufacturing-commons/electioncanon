// ============================================================
// FORGE STUDIO — UNDERSTANDING  (conversational phase, §4, §8, §25)
//
// THE STAGE THIS PHASE EXISTS TO ADD, and the one that was missing.
//
// Before this file, the model was attached at the wrong end of the pipeline. A
// deterministic phrase table decided what the participant meant, and the model was
// invited afterwards to rephrase the answer more fluently. So Forge could produce a
// beautiful Hausa sentence about the wrong question, and could not understand
// "What is stopping this work?" at all — because the table happens to contain
// "what is blocking" and not "what is stopping". The measured failures were:
//
//   "where is the drawing of hub 002"   component = null   (the id was simply lost)
//   "the 002 hub"                       unknown
//   "CHS 014 status"                    unknown
//   "has fabrication started?"          unknown
//   "Has anyone been assigned to it?"   unknown
//   "What is stopping this work?"       unknown
//
// Adding those six phrasings to the table would have fixed those six sentences and
// nothing else, which is precisely the trap §25 names. The division of labour is
// instead the one §25 sets out:
//
//   THE MODEL       reads the sentence and PROPOSES an operation and an entity
//   THE DETERMINISM validates the proposal, resolves the entity against the fold,
//                   retrieves, grounds, and composes the answer
//
// DETERMINISTIC FIRST, MODEL ON ESCALATION — AND WHY THAT IS NOT A HEDGE.
//
// The phrase table is not deleted. It is demoted to what §12 requires anyway: the
// path that answers when the provider is a 429, a timeout or an unreachable host,
// which in a Nigerian workshop is an ordinary Tuesday rather than an incident. So
// understanding runs deterministically first and consults the model ONLY when the
// deterministic read is genuinely inadequate — an unrecognised intent, or an
// operation that needs a subject and has none. Three consequences, all wanted:
//
//   * a workshop with no connectivity keeps the behaviour it has today
//   * the common questions cost no extra provider call and no extra latency
//   * the model is used exactly where understanding is hard, which is where its
//     value is real and where a table can never catch up
//
// I am naming the trade because it is a real one: a phrase table that matches
// CONFIDENTLY AND WRONGLY will not escalate, and the model never sees that sentence.
// That is why escalation also fires on a missing subject, and why the mutation suite
// includes a mutant that makes the deterministic read always look sufficient.
//
// WHAT THE MODEL CANNOT DO FROM HERE. It returns a request, never a fact — there is
// no claim, no source, no state and no event in the interpret contract. It cannot
// select the response language (§15: that was resolved from the participant's own
// words and the global preference before this file ran). It cannot name an entity
// into existence, because request.js resolves every entity against the fold. And it
// cannot widen its own context: it is given the participant's sentence, the
// operations it may propose, and the ids the Canon actually holds — nothing else,
// and in particular no state, organisation, history or specification content.
// ============================================================

import { resolveIntent, INTENT } from "./intent.js";
import { resolveSubject, lastIntentType, RESOLUTION } from "./conversation.js";
import { validateRequest, validateOperation, REQUEST, PROPOSABLE } from "./request.js";
import { canonEntities } from "./entity.js";

/** How the intent in front of you was arrived at. Diagnostics and tests only. */
export const UNDERSTOOD_BY = Object.freeze({
  DETERMINISTIC: "DETERMINISTIC",
  MODEL:         "MODEL",
  CLARIFY:       "CLARIFY",
});

/**
 * Is the deterministic read good enough to skip the model?
 *
 * Good enough means: it recognised an operation, AND if that operation needs a
 * subject it has one. Nothing about elegance — only whether Forge can actually
 * perform the read the participant asked for.
 *
 * A CANON LIMITATION IS ALWAYS SUFFICIENT, whatever the intent says. "What material
 * is CHS-014 made from?" resolves to an unrecognised intent and a `material`
 * subject, and the honest answer — Forge Canon does not record component material —
 * needs no model to produce and must not be escalated in the hope of a better one.
 * Escalating it would invite the model to fill a gap ForgeOS has, which is §18's and
 * §11's whole concern.
 */
/**
 * The intents Forge can actually ANSWER.
 *
 * RECOGNISED IS NOT THE SAME AS ANSWERABLE, and conflating them cost a real answer.
 *
 * "where can I find the drawing for the 002 hub" matched the SEARCH marker "find".
 * SEARCH needs no subject, so the deterministic read looked complete, escalation was
 * skipped — and then `infer.js` has no SEARCH branch and `planResponse` has no SEARCH
 * case, so the participant received "I did not read that as a question Forge Canon can
 * answer" for a question Forge Canon can answer perfectly well. The phrase table was
 * confident and the pipeline was empty.
 *
 * This is the failure mode named in the header of this file, caught by acting as a
 * participant rather than by reading the table — and §18 rules out the tempting fix.
 * Adding "where can I find the drawing" as a marker would have fixed that sentence and
 * left the next one broken, because the defect is not a missing phrase: it is that
 * SUFFICIENCY WAS MEASURED AGAINST RECOGNITION INSTEAD OF AGAINST THE ABILITY TO
 * ANSWER. So sufficiency now requires an intent the responder implements, and any
 * future intent that is recognised before it is answerable escalates instead of
 * producing a shrug.
 *
 * ACTION_REQUEST is answerable — the answer is the authority boundary, which is a real
 * and important reply. UNKNOWN is not, by definition.
 *
 * SEARCH JOINED THIS LIST ONLY ONCE IT HAD A RESPONDER (Gap 1 fix). Before that,
 * "search for CHS-014" and "show me anything about hub 002" matched the SEARCH
 * marker, looked sufficient, and reached a responder that did not exist — the exact
 * failure this list exists to prevent. `infer.js`'s SEARCH branch and `respond.js`'s
 * SEARCH case are the responder; deterministic and free-text, via
 * `canonTools.searchForge`, so it needs no model and stays in this always-answerable
 * list rather than the needsSubject one below.
 */
const ANSWERABLE = Object.freeze([
  INTENT.COMPONENT_STATE, INTENT.COMPONENT_NEXT_ACTION, INTENT.COMPONENT_WHY,
  INTENT.COMPONENT_WHO, INTENT.COMPONENT_CONTRIBUTIONS, INTENT.COMPONENT_DIRECTIVES,
  INTENT.COMPONENT_HISTORY, INTENT.COMPONENT_HUB, INTENT.COMPONENT_MISSION,
  INTENT.INSPECTION_STATUS, INTENT.ACKNOWLEDGEMENT_STATUS, INTENT.CANON_GAPS,
  INTENT.SPECIFICATION_EXPLAIN, INTENT.MISSION_PROGRESS, INTENT.ACTION_REQUEST,
  INTENT.SEARCH,
]);

const NEEDS_SUBJECT_TYPES = Object.freeze([
  INTENT.COMPONENT_STATE, INTENT.COMPONENT_NEXT_ACTION, INTENT.COMPONENT_WHY,
  INTENT.COMPONENT_WHO, INTENT.COMPONENT_CONTRIBUTIONS, INTENT.COMPONENT_DIRECTIVES,
  INTENT.COMPONENT_HISTORY, INTENT.COMPONENT_HUB, INTENT.COMPONENT_MISSION,
  INTENT.INSPECTION_STATUS, INTENT.ACKNOWLEDGEMENT_STATUS, INTENT.CANON_GAPS,
]);

/**
 * WHAT MAKES A DOMAIN PLUGGABLE INTO THIS ONE understanding STAGE, NOT A SECOND ONE.
 *
 * Everything ABOVE this bundle — the escalation decision, the ambiguity/clarify
 * flow, the intent carry-forward rule, the fail-closed proposal handling — is
 * domain-neutral ALGORITHM. Everything IN this bundle is domain-neutral in SHAPE
 * but manufacturing-specific in CONTENT today. A second domain (Election,
 * Business, ...) supplies its OWN bundle with the SAME five keys; `understand()`
 * itself never changes, and neither does request.js/entity.js/conversation.js/
 * grounding.js — they all already accept (or now accept, see entity.js's `kinds`
 * and request.js's `semanticIntents`/`needsComponent`) exactly this same data as
 * parameters rather than importing it.
 *
 * `carryForwardKinds` is new: the §23 "bare entity resumes the last question"
 * rule (below) only fired for `kind === "component"`. A domain whose primary
 * entity is called something else (a "candidate", a "ward") needs its own kind
 * listed here to get the same conversational behaviour — not a second rule.
 */
export const DEFAULT_VOCABULARY = Object.freeze({
  resolveIntent, INTENT, ANSWERABLE, needsSubjectTypes: NEEDS_SUBJECT_TYPES,
  entityKinds: undefined,      // undefined = entity.js's own manufacturing default
  operations: PROPOSABLE,
  semanticIntents: undefined,  // undefined = request.js's own manufacturing default
  needsComponent: undefined,   // undefined = request.js's own manufacturing default
  carryForwardKinds: Object.freeze(["component"]),
});

function deterministicIsSufficient(intent, vocabulary) {
  if (intent?.subject) return true;
  if (intent?.type === vocabulary.INTENT.UNKNOWN) return false;
  if (!vocabulary.ANSWERABLE.includes(intent?.type)) return false;
  const needsSubject = vocabulary.needsSubjectTypes.includes(intent?.type);
  if (needsSubject && !intent?.component) return false;
  if (intent?.type === vocabulary.INTENT.MISSION_PROGRESS && !intent?.mission) return false;
  return true;
}

/**
 * The bounded material an interpreter may be given. (§10)
 *
 * IDENTIFIERS AND OPERATION NAMES. NOT FACTS.
 *
 * The vocabulary is the ids the Canon holds, because resolving "hub 002" to HUB-002
 * requires knowing HUB-002 exists and nothing more. No state, no organisation, no
 * hub, no mission progress, no history and no specification content crosses this
 * boundary — the model is being asked to read a sentence, not to know the
 * manufacturing. The answer call downstream has its own separately-bounded context
 * and is the only thing that ever sees a value.
 *
 * `recent` is the last few messages, needed for "Why?" to be interpretable at all.
 * It carries the participant's OWN WORDS and never Forge's answers, so nothing the
 * Canon said can be laundered back in as though the model had established it.
 */
export function interpretContext({ message, view = {}, conversation = null, limit = 24,
  operations = PROPOSABLE, entityKinds } = {}) {
  // (Semantic Understanding 2.0, §3) A LABEL, WHEN THE CANON HOLDS ONE — the
  // model reads "FORGE-HUB (mission: Manufacture 200 wheel hubs)" instead of a
  // bare id, so a participant naming a mission by its CONTENT ("the
  // two-hundred-hub batch") rather than its id has something to match against.
  // The label is Canon data the fold already carries (entity.js's `describe`),
  // never invented here, and it is descriptive text only — it plays no part in
  // how `validateProposedEntity` resolves whatever the model echoes back.
  const entities = canonEntities(view, entityKinds ? { kinds: entityKinds } : {})
    .slice(0, limit)
    .map((e) => e.label ? `${e.id} (${e.kind}: ${e.label})` : `${e.id} (${e.kind})`);
  const recent = [...(conversation?.turns ?? [])].slice(-3).map((t) => t.message);
  return Object.freeze({
    message: String(message ?? ""),
    operations,
    entities: Object.freeze(entities),
    recent: Object.freeze(recent),
  });
}

/**
 * Understand a message. Returns an intent shaped exactly like `resolveIntent`'s.
 *
 * Shaped identically ON PURPOSE: ask.js, infer.js, provider.js and respond.js all
 * consume that shape, and a new stage that changed it would ripple through four
 * files and every suite that asserts on them. The additions are extra fields, so
 * every existing reader keeps working unchanged.
 *
 * @param interpreter  async ({ message, operations, entities, recent }) => { intent, entity }
 *                     Injected. Absent means deterministic-only, which is the
 *                     offline behaviour and is fully supported rather than degraded.
 * @param vocabulary   the domain's understanding vocabulary — see `DEFAULT_VOCABULARY`
 *                     above. Defaults to manufacturing's own, so every existing
 *                     caller is unaffected. A second domain passes its own bundle;
 *                     this function's ALGORITHM does not change per domain.
 */
export async function understand({
  message,
  view = {},
  preferredLanguage = "en",
  conversation = null,
  interpreter = null,
  vocabulary = DEFAULT_VOCABULARY,
} = {}) {
  const V_INTENT = vocabulary.INTENT;

  // 1. THE DETERMINISTIC READ. Also the only source of the response language, the
  //    unrecorded-subject detection and the mixed-language flags.
  const base = vocabulary.resolveIntent(message, { preferredLanguage });

  // 2. THE SUBJECT, resolved against the CANON rather than against a shape pattern.
  //    This is what makes "hub 002" and "the 002 hub" work, and it also carries the
  //    subject forward so "Why?" has something to be about.
  const subject = resolveSubject({ message, view, conversation, kinds: vocabulary.entityKinds });

  // 3. AMBIGUITY STOPS EVERYTHING. No model call, no Canon read, no answer — a
  //    question instead (§7). Asking costs one turn; answering about the wrong part
  //    is a wrong manufacturing statement delivered with full confidence.
  if (subject.how === RESOLUTION.AMBIGUOUS) {
    // THE OPERATION MAY STILL BE UNDERSTOOD WHILE THE ENTITY IS NOT.
    //
    // "What is its status?" is not in the phrase table — the table has "what is the
    // state" and "status of", not the pronoun form — so offline there is no pending
    // question to keep, and answering the clarification led straight back to "I did
    // not understand". §8's own example sentence falls in exactly this gap.
    //
    // Adding "what is its status" as a marker is the fix §18 forbids, and it would
    // leave the next pronoun form broken. The real observation is that AMBIGUITY IS
    // ABOUT THE ENTITY, NOT THE OPERATION: Forge can ask the model what is being asked
    // while still refusing to let it decide what the question is about. So the
    // interpreter is consulted for the OPERATION NAME ONLY, through `validateOperation`,
    // which accepts no entity and can return none.
    //
    // This costs one call in the rare ambiguous case and it is the call that makes the
    // clarification worth asking. If the interpreter is absent or refuses, `pendingType`
    // is null and Forge still asks which component — just without being able to resume,
    // which is the honest offline limit rather than a wrong answer.
    let pendingType = base.type !== V_INTENT.UNKNOWN ? base.type : null;
    if (!pendingType && typeof interpreter === "function") {
      try {
        const proposal = await interpreter(interpretContext({ message, view, conversation,
          operations: vocabulary.operations, entityKinds: vocabulary.entityKinds }));
        pendingType = validateOperation(proposal ?? {}, { semanticIntents: vocabulary.semanticIntents,
          needsComponent: vocabulary.needsComponent, kinds: vocabulary.entityKinds });
      } catch { /* a failed interpreter leaves the clarification unresumable, not wrong */ }
    }
    return Object.freeze({
      ...base,
      type: V_INTENT.UNKNOWN,
      component: null,
      clarify: Object.freeze({ candidates: subject.candidates }),
      understoodBy: UNDERSTOOD_BY.CLARIFY,
      componentFromSession: false,
      // THE PENDING QUESTION IS REMEMBERED, OR THE CLARIFICATION IS A DEAD END.
      //
      // Found by answering Forge's own question: it asked "Which one do you mean —
      // CHS-014 or HUB-002?", I typed "HUB-002", and it replied "I did not read that
      // as a question Forge Canon can answer." Forge had asked for exactly one word,
      // received exactly that word, and then had no idea why it had asked.
      //
      // The cause was that this branch overwrote `type` with UNKNOWN, so `remember`
      // recorded UNKNOWN as the turn's intent and `lastIntentType` refused to carry
      // it. The intent WAS resolved — "What is its status?" reads as component.state
      // before the subject is even looked at — so nothing needed re-deriving; it was
      // being thrown away. `type` still becomes UNKNOWN because no read happened and
      // no fact may be spoken, and the question that was pending travels alongside it.
      //
      // A clarification that cannot be answered is worse than a guess: a guess is
      // wrong once, while this makes the participant repeat a whole sentence to a
      // system that just demonstrated it was listening.
      pendingType,
    });
  }

  // The Canon-resolved subject REPLACES the shape-matched one. `resolveIntent`'s
  // `component` comes from an uppercase-hyphen pattern over the raw text; this one
  // comes from the fold. When they disagree, the fold is right by definition — and
  // when the pattern found nothing, this is what supplies the id at all.
  let intent = Object.freeze({
    ...base,
    component: subject.id ?? base.component ?? null,
    componentFromSession: subject.how === RESOLUTION.CARRIED,
    understoodBy: UNDERSTOOD_BY.DETERMINISTIC,
    clarify: null,
  });

  // INTENT CARRY-FORWARD — THE MIRROR OF SUBJECT CARRY-FORWARD.
  //
  // "What about HUB-002?" names a part and asks nothing. Read literally it is an
  // unrecognised sentence; read conversationally it means "the question I just asked,
  // about this part instead", which is what §23's entity-confusion case requires and
  // what any person would assume. So when a message NAMES an entity but carries no
  // recognisable question, and the previous turn had a usable one, the question is
  // carried forward and the subject changes underneath it.
  //
  // THIS IS A RULE, NOT A PHRASE, which is the reason it lives here and not as five
  // more markers per language in intent.js. It works for "What about HUB-002?", "Kuma
  // HUB-002?", "HUB-002?" and a bare "HUB-002" — in any language, including ones with
  // no marker table at all — because it keys off structure rather than wording.
  //
  // Guarded three ways so it cannot fabricate an intent: it requires an entity to have
  // been NAMED in this message (not carried), it requires the deterministic read to
  // have recognised nothing, and `lastIntentType` refuses to hand back UNKNOWN or
  // ACTION_REQUEST. A bare "HUB-002" as the FIRST thing anyone says still resolves to
  // nothing, because there is no prior question to inherit.
  if (intent.type === V_INTENT.UNKNOWN && !intent.subject &&
      subject.how === RESOLUTION.NAMED && vocabulary.carryForwardKinds.includes(subject.kind)) {
    const carriedType = lastIntentType(conversation);
    if (carriedType) {
      intent = Object.freeze({ ...intent, type: carriedType, intentFromSession: true });
    }
  }

  // (Semantic Understanding 3.0, §1) THE FLAG THE ANSWER STAGE NEEDS, COMPUTED
  // ONCE, HERE, WHERE IT IS ALREADY BEING DECIDED — not re-derived downstream
  // from incomplete signals.
  //
  // `provider.js`'s answer-stage fast path needs to know "was the deterministic
  // read genuinely CONFIDENT", and that is exactly this line's own
  // `deterministicIsSufficient(intent, vocabulary)` result — no other file can
  // compute it, because `vocabulary` never travels past this function. The
  // trap is conflating it with "no interpreter was available": both leave
  // `understoodBy` as DETERMINISTIC, but they are not the same fact. A message
  // the phrase table never recognised, asked with NO interpreter wired at all,
  // still deserves a chance at the ANSWER-stage model if one is wired there —
  // "Forge could not even ask" is not "Forge already knows the answer with
  // confidence would be a wasted call." So the flag is set ONLY on the TRUE
  // branch of `deterministicIsSufficient`, never on the `typeof interpreter !==
  // "function"` fallback, even though both return `intent` unchanged here.
  const confident = deterministicIsSufficient(intent, vocabulary);
  if (confident || typeof interpreter !== "function") {
    return confident ? Object.freeze({ ...intent, deterministicConfident: true }) : intent;
  }

  // 4. ESCALATE TO THE MODEL. Untrusted proposal in, validated request out.
  let proposal = null;
  try {
    proposal = await interpreter(interpretContext({ message, view, conversation,
      operations: vocabulary.operations, entityKinds: vocabulary.entityKinds }));
  } catch {
    // A failed interpreter is a provider failure, not an error the participant
    // caused. The deterministic understanding stands and §12 keeps the experience.
    return intent;
  }

  // THE MODEL MAY PROPOSE THE OPERATION AND LEAVE THE ENTITY TO FORGE.
  //
  // `entity: null` is the CORRECT, CAUTIOUS answer for a model that has read the
  // sentence but is not certain which part is meant — and rule 5 of the interpret
  // prompt explicitly asks for it. Yet a null entity used to make `validateRequest`
  // return NEEDS_SUBJECT and the whole proposal was discarded, so the safest possible
  // model behaviour was punished with the worst outcome: the question went unanswered
  // even though Forge had already resolved the subject from the Canon and the
  // conversation one step earlier. Found by "search for CHS-014", where the subject was
  // never in doubt.
  //
  // So the already-resolved subject is offered as the FALLBACK entity. Nothing is
  // loosened: whatever the model DID propose still wins and is still resolved against
  // the fold by `validateProposedEntity`, and the fallback is an id Forge derived
  // itself and has already verified exists. The model gains no ability to name a
  // subject — it gains the ability to decline to.
  const proposed = (typeof proposal === "object" && proposal !== null)
    ? { ...proposal, entity: proposal.entity ?? proposal.component ?? intent.component ?? null }
    : proposal;
  const validated = validateRequest(proposed ?? {}, { view, semanticIntents: vocabulary.semanticIntents,
    needsComponent: vocabulary.needsComponent, kinds: vocabulary.entityKinds });

  if (validated.status === REQUEST.AMBIGUOUS_ENTITY) {
    return Object.freeze({
      ...intent, type: V_INTENT.UNKNOWN, component: null,
      clarify: Object.freeze({ candidates: validated.candidates }),
      understoodBy: UNDERSTOOD_BY.CLARIFY,
    });
  }
  if (validated.status !== REQUEST.OK) {
    // FAIL CLOSED, AND KEEP WHAT WE HAD. An unknown operation, an entity the Canon
    // does not hold, or a missing subject all leave the deterministic read in place
    // rather than producing a better-sounding answer to a question nobody validated.
    //
    // FOLLOW-UP MEMORY, SYMMETRIC WITH THE AMBIGUOUS-ENTITY CLARIFICATION ABOVE.
    // `validateRequest` already names the recognised operation on a NEEDS_SUBJECT
    // failure (`fail(REQUEST.NEEDS_SUBJECT, ..., { intentType })`, request.js) — the
    // exact same value `validateOperation` extracts for the AMBIGUOUS branch's
    // `pendingType`. Every other rejection (`UNKNOWN_OPERATION`, `UNRESOLVED_ENTITY`,
    // `MALFORMED`) carries no `intentType`, so this is `null` for them — nothing new
    // is remembered when Forge doesn't know what was asked or the named entity does
    // not exist, which is what "cleared after an invalid entity" requires.
    //
    // `remember()` already reads `intent.pendingType` ahead of `intent.type`
    // (conversation.js), and `ask.js` already surfaces `pendingType` on the result —
    // both written for the AMBIGUOUS case and untouched here. The INTENT
    // CARRY-FORWARD rule above already resumes a `pendingType` the moment a bare
    // entity is NAMED next. No new state, no new mechanism — this is the one field
    // that was never populated for this branch.
    return Object.freeze({ ...intent, proposalRejected: validated.status,
                           pendingType: validated.intentType ?? null });
  }

  return Object.freeze({
    ...intent,
    type: validated.intentType,
    component: validated.component ?? intent.component,
    specification: validated.specification ?? intent.specification ?? null,
    mission: validated.mission ?? intent.mission ?? null,
    // The language is NOT taken from the model. It was resolved from the
    // participant's words and the global ForgeOS preference before this ran, and
    // §15 is explicit that understanding a language is not choosing one.
    understoodBy: UNDERSTOOD_BY.MODEL,
    operation: validated.operation,
  });
}

export default { understand, UNDERSTOOD_BY, interpretContext, DEFAULT_VOCABULARY };
