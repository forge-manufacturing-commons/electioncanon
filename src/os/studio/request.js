// ============================================================
// FORGE STUDIO — THE SEMANTIC REQUEST LAYER  (conversational phase, §9)
//
// The narrow doorway between "the model understood the sentence" and "Forge reads
// the Canon". A model may PROPOSE a request:
//
//   { intent: "component.responsibility", entity: "CHS-014" }
//
// and this file decides whether that proposal is a thing Forge will do. It is the
// same architectural move as `validateEvent` at the kernel boundary: the proposer is
// untrusted, the shape is checked, and an unrecognised value is a rejection rather
// than a best guess.
//
// FOUR REASONS THIS IS A SEPARATE FILE AND NOT AN `if` INSIDE THE ADAPTER:
//
// 1. THE ALLOWLIST IS THE CAPABILITY CEILING. A model can only ever propose one of
//    the operations named below, and every one of them is a READ. There is no
//    proposable operation that publishes, approves, transfers responsibility or
//    changes state — not because the prompt asks the model not to, but because no
//    such name exists in this map for it to return. An operation Forge does not
//    perform cannot be requested into existence by a fluent sentence.
//
// 2. THE INTERNAL NAMES NEVER LEAK. `component.responsibility` is vocabulary for
//    this boundary. §7 and §20 forbid showing a participant `AMBIGUOUS_ENTITY` or
//    `COMPONENT_STATUS`, so these strings are carried on the result for tests and
//    the provenance panel and are never realised into a sentence.
//
// 3. UNKNOWN MEANS REJECTED, NOT NEAREST. A proposal of "component.materials" is
//    refused outright. Coercing it to the closest known intent is how a model's
//    misunderstanding becomes Forge's confident wrong answer, and the coercion would
//    be invisible in the result.
//
// 4. AN ENTITY IS VALIDATED AGAINST THE FOLD, NEVER ACCEPTED ON THE MODEL'S WORD.
//    entity.js does the resolving and it can only ever return an id the Canon holds.
//    A proposal naming "HUB-999" therefore yields UNRESOLVED_ENTITY, and Forge says
//    it has no record — which is true — instead of answering about a part that does
//    not exist.
// ============================================================

import { INTENT } from "./intent.js";
import { validateProposedEntity } from "./entity.js";

/**
 * Every operation a model may propose, mapped to the canonical intent it becomes.
 *
 * THE LEFT-HAND SIDE IS SEMANTIC VOCABULARY; THE RIGHT-HAND SIDE IS FORGE CANON.
 * Several names map to one intent on purpose — "component.location" and
 * "component.hub" are the same read, and a model that reaches for either is
 * understood. That is aliasing at the boundary, which is cheap, and it is NOT the
 * phrase dictionary §25 rules out: these are a dozen stable operation names, not an
 * open-ended and ever-growing list of the ways a human might word a question. The
 * wording is the model's problem. The operation is Forge's.
 *
 * NOTE WHAT IS ABSENT. There is no `component.approve`, `component.publish`,
 * `event.record`, `responsibility.transfer` or `state.set`. The eight open questions
 * in §8 all land on reads that already existed before this phase — which is the
 * payoff of the four-relationships design rather than a coincidence.
 */
export const SEMANTIC_INTENTS = Object.freeze({
  // state / progress
  "component.state":            INTENT.COMPONENT_STATE,
  "component.status":           INTENT.COMPONENT_STATE,
  "component.next_action":      INTENT.COMPONENT_NEXT_ACTION,
  "component.status_explanation": INTENT.COMPONENT_WHY,
  "component.blocked_reason":   INTENT.COMPONENT_WHY,

  // the four relationships, kept apart because the Canon keeps them apart (§7/§21)
  "component.responsibility":   INTENT.COMPONENT_WHO,
  "component.who":              INTENT.COMPONENT_WHO,
  "component.participation":    INTENT.COMPONENT_CONTRIBUTIONS,
  "component.contributions":    INTENT.COMPONENT_CONTRIBUTIONS,
  "component.coordination":     INTENT.COMPONENT_DIRECTIVES,
  "component.directives":       INTENT.COMPONENT_DIRECTIVES,
  "component.performance":      INTENT.COMPONENT_HISTORY,
  "component.history":          INTENT.COMPONENT_HISTORY,

  // location — descriptive, never responsibility (Canon P0-2)
  "component.location":         INTENT.COMPONENT_HUB,
  "component.hub":              INTENT.COMPONENT_HUB,

  "component.mission":          INTENT.COMPONENT_MISSION,
  "component.inspection_status": INTENT.INSPECTION_STATUS,
  "inspection.status":          INTENT.INSPECTION_STATUS,
  "acknowledgement.status":     INTENT.ACKNOWLEDGEMENT_STATUS,
  "specification.explain":      INTENT.SPECIFICATION_EXPLAIN,
  "mission.progress":           INTENT.MISSION_PROGRESS,
  "canon.gaps":                 INTENT.CANON_GAPS,
  "search":                     INTENT.SEARCH,

  // NOT A PERMISSION. Recognising "approve this" as a request to act is what lets
  // infer.js refuse it with the real reason — that ForgeOS requires an
  // authenticated, authorised identity — instead of the much weaker and more
  // misleading "I did not understand that". Classifying an instruction is not
  // obeying it, and this mapping confers nothing: the ACTION_REQUEST branch has no
  // access to policy, an emitter or publish.
  "action.request":             INTENT.ACTION_REQUEST,
});

export const PROPOSABLE = Object.freeze(Object.keys(SEMANTIC_INTENTS));

/** Operations that are meaningless without a subject. */
const NEEDS_COMPONENT = Object.freeze([
  INTENT.COMPONENT_STATE, INTENT.COMPONENT_NEXT_ACTION, INTENT.COMPONENT_WHY,
  INTENT.COMPONENT_WHO, INTENT.COMPONENT_CONTRIBUTIONS, INTENT.COMPONENT_DIRECTIVES,
  INTENT.COMPONENT_HISTORY, INTENT.COMPONENT_HUB, INTENT.COMPONENT_MISSION,
  INTENT.INSPECTION_STATUS, INTENT.ACKNOWLEDGEMENT_STATUS, INTENT.CANON_GAPS,
]);

export const REQUEST = Object.freeze({
  OK:                "OK",
  UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
  UNRESOLVED_ENTITY: "UNRESOLVED_ENTITY",
  NEEDS_SUBJECT:     "NEEDS_SUBJECT",
  AMBIGUOUS_ENTITY:  "AMBIGUOUS_ENTITY",
  MALFORMED:         "MALFORMED",
});

/**
 * Validate a proposed semantic request. FAILS CLOSED.
 *
 * @param proposal  { intent, entity } — from a model, or from anywhere
 * @param view      the fold, the only thing an entity may be validated against
 * @param semanticIntents  operation-name -> canonical-intent map. Defaults to
 *                  manufacturing's own `SEMANTIC_INTENTS`. A second domain (Election,
 *                  Business, ...) passes its OWN map here rather than this file
 *                  growing a second copy of the allowlist algorithm below — the
 *                  ALGORITHM (fail-closed, no coercion, smuggle-check) is shared;
 *                  only the DATA differs per domain.
 * @param needsComponent  intent types meaningless without a subject. Defaults to
 *                  manufacturing's own `NEEDS_COMPONENT`.
 * @param kinds     forwarded to entity.js's resolution — which `view` keys are
 *                  resolvable entities. Defaults to entity.js's own manufacturing
 *                  default when omitted.
 *
 * @returns { status, intentType, component, specification, mission, candidates, reason }
 *
 * The caller receives a canonical intent type it can hand straight to the existing
 * pipeline, or a status explaining why it received none. Every failure is distinct
 * because the honest reply differs for each: an unknown operation means Forge did not
 * understand, an unresolved entity means Forge has no record, a missing subject means
 * Forge should ask which part, and an ambiguous one means Forge should ask which of
 * these. Collapsing them into one "sorry" is how an assistant becomes useless while
 * remaining safe.
 */
export function validateRequest(proposal, { view = {}, semanticIntents = SEMANTIC_INTENTS,
  needsComponent = NEEDS_COMPONENT, kinds } = {}) {
  if (typeof proposal !== "object" || proposal === null) {
    return fail(REQUEST.MALFORMED, "a request must be an object");
  }

  // A PROPOSAL THAT CARRIES AN ASSERTION IS REFUSED WHOLE.
  //
  // Found by probing rather than by reading: an interpreter returning
  // `{ intent: "component.state", entity: "CHS-014", claims: [{ class: "CANON_FACT" }] }`
  // was ACCEPTED here, because this function only ever read `intent` and `entity` and
  // silently ignored everything else. No fact was injected — the claims went nowhere,
  // and grounding would have caught them if they had — but "the extra field was
  // harmless" is the wrong test. The right one is that an interpreter which tried to
  // assert a manufacturing fact has misunderstood its job badly enough that its
  // OPERATION CHOICE should not be trusted either, and §9 requires this boundary to
  // fail closed rather than to quietly use the salvageable part.
  //
  // The Edge Function rejects the same shape in `validateInterpretOutput`. This is
  // deliberately not redundant: an interpreter can be injected on the client — that
  // is how the whole suite substitutes a hostile one — and such an interpreter never
  // passes through the server validator at all. A boundary that is only enforced on
  // the far side of the network is not enforced.
  const ASSERTIONS = ["claims", "claim", "answer", "source", "sources", "state",
                      "value", "fact", "facts", "verified"];
  const smuggled = ASSERTIONS.filter((k) => proposal[k] !== undefined);
  if (smuggled.length) {
    return fail(REQUEST.MALFORMED,
      `a request may not assert anything about manufacturing: ${smuggled.join(", ")}`);
  }

  const name = typeof proposal.intent === "string" ? proposal.intent.trim() : "";
  if (!name) return fail(REQUEST.MALFORMED, "a request must name an operation");

  const intentType = semanticIntents[name];
  if (!intentType) {
    // NOT COERCED TO A NEIGHBOUR. See note 3 in the header.
    return fail(REQUEST.UNKNOWN_OPERATION, `"${name}" is not an operation Forge performs`);
  }

  // An entity is optional in the proposal; whether it is REQUIRED depends on the
  // operation, which is checked after resolution so the more specific failure wins.
  let component = null;
  let specification = null;
  let mission = null;
  let candidates = [];

  const raw = proposal.entity ?? proposal.component ?? null;
  if (raw != null && String(raw).trim()) {
    const e = validateProposedEntity(raw, view, kinds ? { kinds } : {});
    if (e.ambiguous) {
      return fail(REQUEST.AMBIGUOUS_ENTITY, e.reason ?? "more than one entity matches",
                  { candidates: e.candidates ?? [] });
    }
    if (!e.resolved) {
      return fail(REQUEST.UNRESOLVED_ENTITY,
                  e.reason ?? "the proposed entity is not recorded in Forge Canon");
    }
    if (e.kind === "component") component = e.id;
    else if (e.kind === "specification") specification = e.id;
    else if (e.kind === "mission") mission = e.id;
    // A domain-specific kind (a future "candidate"/"ward"/...) has no dedicated
    // field here — it lands in the SAME generic `component` slot understand.js's
    // own direct-naming path already uses for any resolved subject regardless of
    // kind. Purely additive: manufacturing's three kinds above are matched first
    // and this never fires for them.
    else component = e.id;
    candidates = [e.id];
  }

  if (needsComponent.includes(intentType) && !component) {
    return fail(REQUEST.NEEDS_SUBJECT, "that operation needs a component", { intentType });
  }
  if (intentType === INTENT.SPECIFICATION_EXPLAIN && !specification && !component) {
    return fail(REQUEST.NEEDS_SUBJECT, "that operation needs a specification", { intentType });
  }
  if (intentType === INTENT.MISSION_PROGRESS && !mission) {
    return fail(REQUEST.NEEDS_SUBJECT, "that operation needs a mission", { intentType });
  }

  return Object.freeze({
    status: REQUEST.OK,
    operation: name,
    intentType,
    component, specification, mission,
    candidates: Object.freeze(candidates),
    reason: null,
  });
}

/**
 * Validate an OPERATION NAME only, with no entity. Fail-closed.
 *
 * For the one case where Forge needs to understand WHAT is being asked while
 * deliberately refusing to decide WHAT IT IS ABOUT: an ambiguous reference.
 *
 * "What is its status?" with two parts in play is two separate questions — which
 * operation, and which entity — and only the second is ambiguous. Answering the first
 * is what lets Forge ask "which one?" and then, when told, actually produce the status
 * rather than asking the participant to type the whole sentence again.
 *
 * It runs the SAME allowlist and the SAME smuggle check as `validateRequest`; the only
 * difference is that it neither accepts nor returns an entity, so there is no path
 * here by which a model could name a subject during a clarification.
 */
export function validateOperation(proposal, { semanticIntents, needsComponent, kinds } = {}) {
  const checked = validateRequest(
    { intent: proposal?.intent, ...smuggleOnly(proposal) },
    { view: {}, semanticIntents, needsComponent, kinds },
  );
  // NEEDS_SUBJECT is the EXPECTED outcome for a component operation with no entity,
  // and it is the outcome that means the operation name itself was accepted. Any other
  // failure — an unknown operation, a smuggled assertion, a malformed proposal — is a
  // refusal, and the pending question stays unknown.
  if (checked.status === REQUEST.OK) return checked.intentType;
  if (checked.status === REQUEST.NEEDS_SUBJECT && checked.intentType) return checked.intentType;
  return null;
}

/** Carry ONLY the keys `validateRequest` refuses, so its smuggle check still fires. */
function smuggleOnly(proposal) {
  const out = {};
  if (typeof proposal !== "object" || proposal === null) return out;
  for (const k of ["claims", "claim", "answer", "source", "sources", "state",
                   "value", "fact", "facts", "verified"]) {
    if (proposal[k] !== undefined) out[k] = proposal[k];
  }
  return out;
}

function fail(status, reason, extra = {}) {
  return Object.freeze({
    status, operation: null,
    intentType: extra.intentType ?? null,
    component: null, specification: null, mission: null,
    candidates: Object.freeze(extra.candidates ?? []),
    reason,
  });
}

export default { SEMANTIC_INTENTS, PROPOSABLE, REQUEST, validateRequest, validateOperation };
