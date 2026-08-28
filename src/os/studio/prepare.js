// ============================================================
// FORGE STUDIO — PREPARE  (Phase 2)
//
// The third mode, and the only one that produces something shaped like an action.
// It produces an OBJECT. It does not produce an effect.
//
// WHAT PREPARE IS FOR. A workshop participant who has just told Forge AI, in
// Hausa, that a part passed inspection should not then have to hunt through a
// form. Forge AI can assemble the record. What it must never do is finish the
// job, because the entire authority architecture of ForgeOS lives in the step it
// would be skipping.
//
// THREE THINGS ARE DELIBERATELY MISSING FROM EVERY DRAFT, AND THEIR ABSENCE IS
// THE POINT:
//
//   eventId   assigned by the emitter, not by a caller. A draft with an id would
//             look like an event that already exists.
//   at        stamped when the event is actually recorded. A draft carries no
//             claim about when anything happened.
//   person    the AUTHENTICATED operator. This is the important one: if a draft
//             could name its own operator, a conversational assertion ("I am the
//             engineer") would become an attribution, and attribution is what the
//             policy gates check. So the draft leaves the actor blank and says so.
//
// This module imports NO emitter, NO policy, and NO publish. It cannot record an
// event even if every check above it were removed — there is nothing here to call.
// The test suite asserts that by reading this file's imports, not by trusting this
// comment.
// ============================================================

import { EVENT_TYPES, INSPECTION_RESULT } from "../events.js";
import { INTENT } from "./intent.js";

/** Why a draft is not an event. Rendered next to every draft, in every language. */
const NOT_AUTHORISED = Object.freeze({
  ha: "BA A RUBUTA BA · BA A BA DA IZINI BA — ForgeOS na buƙatar tabbataccen shaida da izini kafin a rubuta wannan.",
  en: "NOT PUBLISHED · NOT AUTHORISED — ForgeOS requires an authenticated, authorised identity before this can be recorded.",
  yo: "KÒ TÍ Ì KỌ SÍLẸ̀ · KÒ NÍ ÀṢẸ — ForgeOS béèrè ìdánimọ̀ tí a fọwọ́ sí kí ó tó kọ ọ́.",
  ig: "E DEKỌGHỊ · E NYEGHỊ IKIKE — ForgeOS chọrọ njirimara akwadoro tupu e dekọọ ya.",
  pcm: "E NO DEY PUBLISHED · E NO GET AUTHORITY — ForgeOS need authorised identity before e go enter.",
  fr: "NON PUBLIÉ · NON AUTORISÉ — ForgeOS exige une identité authentifiée et autorisée.",
});

/**
 * What the participant asked to record, mapped to a canonical event type.
 *
 * INTENTIONALLY TINY. Only outcomes the Canon already has an event type for are
 * offered. There is no "other" branch and no free-text type: a draft Forge AI
 * cannot name is a draft it does not make, which is preferable to a plausible
 * object that validateEvent would reject at the boundary anyway.
 */
const DRAFTABLE = Object.freeze([
  {
    match: /\b(pass|passed|amince|ya wuce|wuce|gafere|kọjá|koja)\b/i,
    build: (comp, id) => ({
      type: EVENT_TYPES.INSPECTION.PASSED,
      component: id, specification: comp?.specification ?? null, mission: comp?.mission ?? null,
      result: INSPECTION_RESULT.PASS,
    }),
    label: "inspection pass",
  },
  {
    match: /\b(fail|failed|ya faskara|faskara|ba ya ci|échou)\b/i,
    build: (comp, id) => ({
      type: EVENT_TYPES.INSPECTION.FAILED,
      component: id, specification: comp?.specification ?? null, mission: comp?.mission ?? null,
      result: INSPECTION_RESULT.FAIL,
    }),
    label: "inspection fail",
  },
  {
    match: /\b(produc|manufactur|kera|made|emere)\w*/i,
    build: (comp, id) => ({
      type: EVENT_TYPES.PRODUCTION.COMPONENT_PRODUCED,
      component: id, specification: comp?.specification ?? null, mission: comp?.mission ?? null,
    }),
    label: "component produced",
  },
]);

/**
 * Every canonical event type, flattened. EVENT_TYPES is grouped by domain.
 *
 * This exists because of a real defect: the first version of DRAFTABLE named
 * `EVENT_TYPES.INSPECTION.COMPONENT_INSPECTED`, which does not exist — the
 * canonical members are PASSED, FAILED, RECORDED and REWORKED. JavaScript
 * resolved it to `undefined` without complaint and PREPARE happily produced a
 * draft with `type: undefined`: an object that LOOKS like an event, carries a real
 * component and a real specification, and names no event type at all. Exactly the
 * plausible-shaped falsehood this whole architecture exists to prevent, produced
 * by a typo rather than by a model.
 *
 * So the type is now CHECKED against the live vocabulary before a draft is
 * returned, and an unrecognised type produces no draft.
 */
const CANONICAL_TYPES = Object.freeze(
  new Set(Object.values(EVENT_TYPES).flatMap((domain) => Object.values(domain))),
);

/**
 * Prepare a draft event. Returns null when nothing draftable was asked for.
 *
 * @returns {{ draft, label, component, missingFields, published, authorised, notice }}
 *   `published` and `authorised` are always false. They exist as fields so a
 *   surface has to render a value rather than forget the question, and so a test
 *   can assert on them instead of on the absence of a side effect.
 */
/**
 * @param draftable       the match/build/label table. Defaults to manufacturing's
 *                        own `DRAFTABLE`. A second domain (Election, Business, ...)
 *                        passes its OWN table — same shape
 *                        (`{match: RegExp, build: (subject, id) => draftFields,
 *                        label}`) — rather than this function growing a second
 *                        drafting engine per domain. The safety guarantees below
 *                        (published:false, authorised:false, missing
 *                        person/eventId/at, the canonical-type gate) are shared
 *                        unconditionally and do not vary per domain.
 * @param canonicalTypes  the Set a draft's `type` must belong to. Defaults to
 *                        manufacturing's own flattened `EVENT_TYPES`.
 * @param actionRequestType  the domain's own "this is a request to act" intent
 *                        constant. Defaults to manufacturing's `INTENT.ACTION_REQUEST`.
 * @param subjectOf       (view, id) => the Canon record the draft is about.
 *                        Defaults to manufacturing's `view.components[id]`.
 */
export function prepareDraft({ intent, view = {}, language = "en", text = "",
  draftable = DRAFTABLE, canonicalTypes = CANONICAL_TYPES,
  actionRequestType = INTENT.ACTION_REQUEST,
  subjectOf = (v, i) => v?.components?.[i] } = {}) {
  const notice = NOT_AUTHORISED[language] ?? NOT_AUTHORISED.en;
  const id = intent?.component ?? null;

  // A draft must be ABOUT something the Canon already knows, otherwise Forge AI
  // would be inventing the subject as well as the record.
  const comp = id ? subjectOf(view, id) : null;
  if (!id || !comp) {
    return Object.freeze({
      draft: null, label: null, component: id,
      missingFields: Object.freeze(["component"]),
      published: false, authorised: false, notice,
      reason: id
        ? `Forge Canon has no record of ${id}, so there is nothing to prepare a record against.`
        : "no component was named, so there is nothing to prepare a record against",
    });
  }

  // Match against the participant's own words when supplied, and fall back to the
  // resolved intent. An inspection question is not an inspection record, so only
  // ACTION_REQUEST and an explicit verb may produce a draft.
  const source = `${text} ${intent?.type === actionRequestType ? "approve" : ""}`;
  const chosen = draftable.find((d) => d.match.test(source));

  if (!chosen) {
    return Object.freeze({
      draft: null, label: null, component: id,
      missingFields: Object.freeze([]),
      published: false, authorised: false, notice,
      reason: "no canonical event type matches what was asked; Forge AI does not " +
              "invent an event type it cannot name",
    });
  }

  const draft = Object.freeze(chosen.build(comp, id));

  // FAIL CLOSED ON AN UNRECOGNISED TYPE. A draft naming a type the Canon does not
  // have is worse than no draft: it would be carried to a surface, rendered as a
  // pending record, and only rejected much later at validateEvent — by which point
  // a participant has been shown something that was never recordable.
  if (!canonicalTypes.has(draft.type)) {
    return Object.freeze({
      draft: null, label: chosen.label, component: id,
      missingFields: Object.freeze([]),
      published: false, authorised: false, notice,
      reason: `"${String(draft.type)}" is not a canonical Forge event type, so no draft was produced`,
    });
  }

  return Object.freeze({
    draft,
    label: chosen.label,
    component: id,
    // Named explicitly so the surface can show what the OPERATOR still has to
    // supply. `person` is here because attribution belongs to the authenticated
    // session, never to the assistant.
    missingFields: Object.freeze(["person", "eventId", "at"]),
    published: false,
    authorised: false,
    notice,
    reason: null,
  });
}

export default { prepareDraft };
