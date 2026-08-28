// ============================================================
// FORGE STUDIO — GROUNDING  (Phase 1)
//
// The layer that makes "the AI must not fabricate Canon facts" enforceable
// rather than aspirational. It is the AI equivalent of validateEvent: a claim
// that cannot be grounded is refused at the boundary, before anyone reads it.
//
// FOUR CLAIM CLASSES, AND ONLY ONE OF THEM IS BINDING:
//
//   CANON_FACT          the Canon says this. REQUIRES provenance, and the
//                       provenance is RESOLVED against the live fold — a source
//                       that does not resolve is not accepted, it is downgraded.
//   AI_INTERPRETATION   what the AI thinks the fact means. Never binding.
//   AI_RECOMMENDATION   what the AI suggests doing. Records nothing.
//   UNKNOWN             the Canon does not establish this. A first-class answer.
//
// THE CRITICAL PROPERTY: a claim can only ever move DOWNWARD in authority. An
// unsupported CANON_FACT becomes UNKNOWN. Nothing in this module can promote a
// recommendation into a fact, so no amount of model confidence, user insistence
// or prompt injection can turn "you should inspect it" into "it was inspected".
//
// AUTHORITY IS NOT A CLAIM CLASS. A claim can describe authority ("this action
// requires engineering.approve") but can never CONFER it. Execution still runs
// the existing four policy gates against the authenticated identity, and this
// module deliberately exposes no way to reach them.
// ============================================================

export const CLAIM = Object.freeze({
  CANON_FACT:        "CANON_FACT",
  // PHASE 2. A fact COMPUTED from Canon facts rather than read from one field:
  // "82 of 200 accepted, so 118 remain". The arithmetic is not in the fold, but
  // every input to it is, and each input must resolve exactly as a CANON_FACT
  // must. It is a separate class because the failure modes differ — a derived
  // claim can be wrong by miscalculation while every source it cites resolves —
  // so `sources` is plural and ALL of them are verified.
  CANON_DERIVED:     "CANON_DERIVED",
  AI_INTERPRETATION: "AI_INTERPRETATION",
  AI_RECOMMENDATION: "AI_RECOMMENDATION",
  UNKNOWN:           "UNKNOWN",
  // P0-1. Something a ROOM displays that the Canon does not hold —
  // EngineeringBay's DECLARED_SPECS titles and authors, ACTORS, SEED_JOBS,
  // DEMO_EVENTS, WORKFLOW. It is real information and a surface may legitimately
  // show it, but it is NOT a Canon fact and may never be presented as one. It has
  // its own class precisely so it cannot be mistaken for the two neighbours it
  // sits between: it is neither authoritative nor invented.
  ROOM_LOCAL:        "ROOM_LOCAL",
});

/**
 * Subjects the Canon does not currently record, per the Canon-completeness audit.
 *
 * A question about any of these must be refused as a CANON limitation, never as a
 * model limitation. The distinction is the whole point: "ForgeOS has not recorded
 * this" is a fact about the system; "I don't know" is a confession that invites
 * the model to fill the gap from general knowledge.
 */
export const NOT_RECORDED_BY_CANON = Object.freeze({
  material:        "component material",
  tolerance:       "dimensional tolerance",
  // "component dimensions", not "dimensions" — the audit caught the bare key being
  // reused as its own wording, which reads like a field name leaking into prose.
  dimensions:      "component dimensions",
  drawing:         "drawing content",
  evidence:        "inspection evidence",
  measurement:     "recorded measurements",
  workshopHead:    "the Head of Workshop relationship",
  studentIdentity: "student or NYSC participant identity",
  personRole:      "a person's role or organisation",
  specTitle:       "specification title",
});

/**
 * Canon-voiced refusal stems, in the languages Phase 0 already detects.
 *
 * Deliberately NOT a translator and not prose generation — one sentence stem per
 * language, so a refusal can be spoken in the participant's language while still
 * attributing the absence to ForgeOS rather than to the assistant. Canonical
 * identifiers are interpolated, never translated.
 */
export const CANON_SILENCE = Object.freeze({
  en:  (subject, about) => `Forge Canon does not contain ${subject}${about ? ` for ${about}` : ""}.`,
  ha:  (subject, about) => `Forge Canon ba ta ƙunshi bayanin ${subject}${about ? ` na ${about}` : ""} ba.`,
  yo:  (subject, about) => `Forge Canon kò ní ìsọfúnni ${subject}${about ? ` fún ${about}` : ""}.`,
  ig:  (subject, about) => `Forge Canon enweghị ozi ${subject}${about ? ` maka ${about}` : ""}.`,
  pcm: (subject, about) => `Forge Canon no get ${subject}${about ? ` for ${about}` : ""}.`,
  fr:  (subject, about) => `Forge Canon ne contient pas ${subject}${about ? ` pour ${about}` : ""}.`,
  urh: (subject, about) => `Forge Canon vwo ${subject}${about ? ` kẹ ${about}` : ""}-ọ.`,
});

/**
 * Subjects that plausibly EXIST somewhere, just not linked into Forge Canon. (§11, §18)
 *
 * A drawing, an inspection photograph or a measured reading almost certainly exists
 * on somebody's laptop, in a folder, or on paper in the workshop. Saying only "Forge
 * Canon does not contain drawing content" is true but leaves the participant thinking
 * ForgeOS is asserting the drawing does not exist. The extra clause distinguishes
 * "not recorded here" from "not real", which is the same distinction the whole
 * CANON / ROOM_LOCAL / UNKNOWN split exists to protect, applied to wording.
 *
 * DELIBERATELY NARROW. `material` and `tolerance` are not here: they are properties
 * of a part, not artefacts that live in a filing cabinet, and inviting the
 * participant to go and find the material somewhere else is not helpful. The
 * distinction is between a MISSING LINK and a MISSING FIELD.
 *
 * AND STILL NO DOCUMENT SYSTEM. This is one clause of wording. It names no filename,
 * no path, no store and no location, because §18 forbids manufacturing a document
 * reference and this phase builds no document store. Forge says where the information
 * is NOT; it does not speculate about where it is.
 */
export const EXISTS_ELSEWHERE = Object.freeze(["drawing", "evidence", "measurement", "specTitle"]);

export const CANON_SILENCE_ELSEWHERE = Object.freeze({
  en:  () => "If it exists elsewhere, it has not been linked into Forge Canon yet.",
  ha:  () => "Idan yana wani wuri, ba a haɗa shi da Forge Canon ba tukuna.",
  yo:  () => "Bí ó bá wà níbòmíràn, a kò tí ì so ó mọ́ Forge Canon.",
  ig:  () => "Ọ bụrụ na ọ dị ebe ọzọ, ejikọtabeghị ya na Forge Canon.",
  pcm: () => "If e dey somewhere else, dem no link am into Forge Canon yet.",
  fr:  () => "S'il existe ailleurs, il n'a pas encore été lié à Forge Canon.",
  // Urhobo is intentionally absent — `notRecorded` falls back to English and says so
  // rather than machine-guessing a sentence. Fabricated Urhobo is the failure the
  // language pack was built to make impossible, and a second clause is no exception.
});

export const SOURCE_KIND = Object.freeze({ FOLD: "fold", EVENT: "event" });

const freeze = (o) => Object.freeze(o);

// ---------- constructors ----------

/** A Canon fact. Refused later unless `source` resolves against the fold. */
export const canonFact = (text, source) =>
  freeze({ type: CLAIM.CANON_FACT, text: String(text ?? ""), source: source ? freeze(source) : null });

/**
 * A fact derived from Canon facts. EVERY source must resolve, not just one.
 *
 * `sources` is an array because the honesty of a derivation depends on all of its
 * inputs. A claim citing one resolvable path and one imaginary path is not
 * three-quarters true; it is unsupported, and verifyClaim downgrades it whole.
 */
export const canonDerived = (text, sources = []) =>
  freeze({ type: CLAIM.CANON_DERIVED, text: String(text ?? ""),
           source: null, sources: freeze((Array.isArray(sources) ? sources : [sources]).map(freeze)) });

export const interpretation = (text) =>
  freeze({ type: CLAIM.AI_INTERPRETATION, text: String(text ?? ""), source: null });

export const recommendation = (text) =>
  freeze({ type: CLAIM.AI_RECOMMENDATION, text: String(text ?? ""), source: null });

export const unknown = (text, reason = null) =>
  freeze({ type: CLAIM.UNKNOWN, text: String(text ?? ""), source: null, reason });

/**
 * Information a ROOM declares, which the Canon does not hold. (P0-1)
 *
 * `origin` is mandatory and names the module and binding the value came from, so
 * a reader can always answer "if not the Canon, then who says so?". It carries no
 * `source`, because a fold source is exactly what it does not have — and
 * verifyClaim therefore leaves it alone rather than downgrading it, since it never
 * claimed to be Canon in the first place.
 */
export const roomLocal = (text, origin) =>
  freeze({ type: CLAIM.ROOM_LOCAL, text: String(text ?? ""), source: null,
           origin: String(origin ?? "unattributed room-local declaration") });

/**
 * The Canon does not record this subject. A refusal in the Canon's voice.
 *
 * This is UNKNOWN — the class is not weakened — but it carries `canonLimitation:
 * true` and a subject, so a surface can state WHAT is missing rather than emitting
 * a generic apology, and a test can prove the wording blames ForgeOS instead of
 * the assistant.
 */
export const notRecorded = (subjectKey, about = null, language = "en") => {
  const subject = NOT_RECORDED_BY_CANON[subjectKey] ?? String(subjectKey ?? "that information");
  const stem = CANON_SILENCE[language] ?? CANON_SILENCE.en;
  // §11 — the second clause, only for artefacts that could genuinely be elsewhere,
  // and only in a language that has a written stem for it.
  const tail = EXISTS_ELSEWHERE.includes(subjectKey)
    ? (CANON_SILENCE_ELSEWHERE[language] ?? CANON_SILENCE_ELSEWHERE.en)()
    : null;
  return freeze({
    type: CLAIM.UNKNOWN,
    text: tail ? `${stem(subject, about)} ${tail}` : stem(subject, about),
    source: null,
    reason: `not recorded by Forge Canon: ${subject}`,
    canonLimitation: true,
    subject: subjectKey,
    about: about ?? null,
    language: CANON_SILENCE[language] ? language : "en",
  });
};

/** Is this refusal attributed to the Canon rather than to the model? */
export const isCanonLimitation = (claim) =>
  claim?.type === CLAIM.UNKNOWN && claim?.canonLimitation === true;

export const foldSource = (path) => freeze({ kind: SOURCE_KIND.FOLD, path: String(path ?? "") });
export const eventSource = (eventId) => freeze({ kind: SOURCE_KIND.EVENT, eventId: String(eventId ?? "") });

// ---------- resolution ----------

/**
 * Resolve a dotted fold path against the projection.
 *
 * `components.HUB-014.state` — segment by segment, so a path that names a
 * component the Canon has never seen fails instead of returning undefined and
 * being mistaken for a legitimate null. Missions are an array in the fold, so
 * `missions.FORGE-HUB.accepted` is resolved by id for the caller's convenience.
 */
export function resolveFoldPath(view, path) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!parts.length) return { resolved: false, reason: "empty path" };

  let node = view;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i];
    if (node === null || node === undefined) {
      return { resolved: false, reason: `"${parts.slice(0, i).join(".")}" is not present in the fold` };
    }
    if (Array.isArray(node)) {
      const byId = node.find((x) => x?.id === key);
      if (byId === undefined) {
        const idx = Number(key);
        if (!Number.isInteger(idx) || idx < 0 || idx >= node.length) {
          return { resolved: false, reason: `no member "${key}" in the collection at "${parts.slice(0, i).join(".")}"` };
        }
        node = node[idx];
        continue;
      }
      node = byId;
      continue;
    }
    if (typeof node !== "object" || !(key in node)) {
      return { resolved: false, reason: `"${parts.slice(0, i + 1).join(".")}" is not present in the fold` };
    }
    node = node[key];
  }
  return { resolved: true, value: node };
}

/**
 * Verify one claim against the Canon.
 *
 * Only CANON_FACT is checked, because only CANON_FACT asserts that the Canon
 * says something. An unverifiable fact is DOWNGRADED to UNKNOWN carrying the
 * reason — never dropped silently, and never left standing as a fact.
 */
export function verifyClaim(claim, { view = {}, log = [] } = {}) {
  if (!claim || typeof claim !== "object" || !claim.type) {
    return unknown("", "not a claim");
  }
  if (claim.type === CLAIM.ROOM_LOCAL) {
    // A room-local claim carrying a fold source is a category error, not a
    // stronger claim: it is an attempt to dress a room declaration as Canon.
    // The source is DISCARDED rather than resolved, and the class never rises.
    return freeze({ ...claim, source: null, verified: true, verifiedAgainst: "room declaration, not Canon" });
  }

  if (claim.type === CLAIM.CANON_DERIVED) {
    // ALL sources, or none. A derivation with one unresolvable input is
    // unsupported in full — it cannot stand as "mostly Canon".
    const srcs = Array.isArray(claim.sources) ? claim.sources : [];
    if (!srcs.length) {
      return unknown(claim.text, "a CANON_DERIVED claim was asserted with no sources");
    }
    const results = srcs.map((s) =>
      s?.kind === SOURCE_KIND.EVENT
        ? (log.find((x) => x?.eventId === s.eventId)
            ? { resolved: true }
            : { resolved: false, reason: `event "${s.eventId}" is not present in this event stream` })
        : resolveFoldPath(view, s?.path));
    const bad = results.findIndex((r) => !r.resolved);
    if (bad !== -1) {
      return unknown(claim.text, `derivation source did not resolve: ${results[bad].reason}`);
    }
    return freeze({ ...claim, verified: true,
                    values: freeze(results.map((r) => r.value)) });
  }

  if (claim.type !== CLAIM.CANON_FACT) {
    // Interpretation, recommendation and unknown assert nothing about the Canon.
    return freeze({ ...claim, verified: true });
  }

  const src = claim.source;
  if (!src || !src.kind) {
    return unknown(claim.text, "a CANON_FACT was asserted with no source");
  }

  if (src.kind === SOURCE_KIND.FOLD) {
    const r = resolveFoldPath(view, src.path);
    if (!r.resolved) return unknown(claim.text, `source did not resolve: ${r.reason}`);
    return freeze({ ...claim, verified: true, value: r.value });
  }

  if (src.kind === SOURCE_KIND.EVENT) {
    const e = log.find((x) => x?.eventId === src.eventId);
    if (!e) return unknown(claim.text, `event "${src.eventId}" is not present in this event stream`);
    return freeze({ ...claim, verified: true, value: freeze({ type: e.type, at: e.at }) });
  }

  return unknown(claim.text, `unrecognised source kind "${src.kind}"`);
}

/**
 * Ground a whole response.
 *
 * Returns the verified claims plus a summary, so a surface can render facts and
 * recommendations differently and can state plainly when something was refused.
 */
export function groundResponse(claims = [], ctx = {}) {
  const verified = (Array.isArray(claims) ? claims : [claims]).map((c) => verifyClaim(c, ctx));
  // A downgrade is any claim that ASSERTED the Canon and failed to prove it —
  // CANON_DERIVED counts, or a model could dodge verification by relabelling.
  const asserted = new Set([CLAIM.CANON_FACT, CLAIM.CANON_DERIVED]);
  const downgraded = verified.filter(
    (c, i) => c.type === CLAIM.UNKNOWN &&
              asserted.has((Array.isArray(claims) ? claims[i] : claims)?.type),
  );
  return freeze({
    claims: freeze(verified),
    facts: freeze(verified.filter((c) => c.type === CLAIM.CANON_FACT)),
    derived: freeze(verified.filter((c) => c.type === CLAIM.CANON_DERIVED)),
    interpretations: freeze(verified.filter((c) => c.type === CLAIM.AI_INTERPRETATION)),
    recommendations: freeze(verified.filter((c) => c.type === CLAIM.AI_RECOMMENDATION)),
    unknowns: freeze(verified.filter((c) => c.type === CLAIM.UNKNOWN)),
    // P0-1. Kept in its own bucket so a surface cannot render room declarations
    // in the same list as facts by accident — it has to ask for them by name.
    roomLocal: freeze(verified.filter((c) => c.type === CLAIM.ROOM_LOCAL)),
    canonLimitations: freeze(verified.filter(isCanonLimitation)),
    downgraded: freeze(downgraded),
    sound: downgraded.length === 0,
  });
}

/**
 * Does a claim assert that a canonical event happened?
 *
 * The injection guard. "HUB-014 passed inspection" is a claim ABOUT an event, so
 * it may only stand as a CANON_FACT when an event actually grounds it. This
 * checks the class of the statement rather than trusting its wording — an
 * event-shaped assertion that arrives as anything other than a grounded
 * CANON_FACT is reported so the surface can refuse to present it as history.
 */
export function assertsEventOccurred(claim, eventTypes = []) {
  const text = String(claim?.text ?? "").toLowerCase();
  const named = eventTypes.filter((t) => text.includes(String(t).toLowerCase()));
  // Past-tense manufacturing assertions, in the languages Phase 0 recognises.
  const pastTense = /\b(passed|failed|approved|completed|acknowledged|produced|inspected|has been|was)\b/i
    .test(text) || /\b(an gama|ya ci|an yi|an amince|ya wuce)\b/i.test(text);
  return {
    assertsEvent: named.length > 0 || pastTense,
    namedTypes: named,
    binding: claim?.type === CLAIM.CANON_FACT && Boolean(claim?.source),
  };
}

/**
 * Conversational memory may never outrank the Canon.
 *
 * A statement the user made earlier ("HUB-014 has passed inspection") is
 * conversational context, not provenance. This turns any such statement into a
 * claim that must still be grounded — which, absent a real event, resolves to
 * UNKNOWN.
 */
export const fromConversation = (text) =>
  freeze({ type: CLAIM.CANON_FACT, text: String(text ?? ""), source: null,
           origin: "conversation" });

/** The only two classes a surface may present as Forge Canon facts. */
export const BINDING_CLASSES = Object.freeze([CLAIM.CANON_FACT, CLAIM.CANON_DERIVED]);
export const isBinding = (claim) =>
  BINDING_CLASSES.includes(claim?.type) && claim?.verified === true;

export default {
  CLAIM, SOURCE_KIND, canonFact, canonDerived, BINDING_CLASSES, isBinding,
  interpretation, recommendation, unknown,
  roomLocal, notRecorded, isCanonLimitation, NOT_RECORDED_BY_CANON, CANON_SILENCE,
  EXISTS_ELSEWHERE, CANON_SILENCE_ELSEWHERE,
  foldSource, eventSource, resolveFoldPath, verifyClaim, groundResponse,
  assertsEventOccurred, fromConversation,
};
