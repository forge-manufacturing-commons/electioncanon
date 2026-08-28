// ============================================================
// FORGE STUDIO — ENTITY RESOLUTION  (conversational phase, §5)
//
// "hub 002", "HUB 002", "hub-002", "Hub-002", "the 002 hub" and "HUB-002" are the
// same part. A participant types whichever one their thumbs produce, and Forge has
// to understand all of them without the participant learning a syntax.
//
// THE RULE THAT MAKES THIS SAFE, AND THE REASON THIS FILE IS SHORT:
// RESOLUTION IS DRIVEN BY THE CANON, NOT BY A PATTERN LIBRARY.
//
// Nothing here knows that component ids look like `XXX-999`. It reads the ids the
// Canon ACTUALLY HOLDS — `Object.keys(view.components)`, the specification keys, the
// mission ids — and asks a much narrower question: does this message name one of
// them? So the resolvable set is exactly the set of things that exist. A model, a
// participant or a future bug proposing "HUB-999" gets nothing back, because
// "HUB-999" is not in the Canon and there is no code path here that could mint it.
//
// That is also why this is NOT the "dozens of hardcoded regexes" §5 rules out. There
// is one normalisation and one comparison. Adding a component to the Canon makes it
// resolvable; adding a naming convention costs nothing here.
//
// AMBIGUITY IS AN OUTCOME, NOT A COIN FLIP. When a message could mean two Canon
// entities, `resolveEntity` returns them BOTH and resolves nothing. §7 requires
// Forge to ask rather than guess, and it can only ask if this layer refuses to
// decide. A resolver that silently picked the first match would make the
// clarification path dead code — and dead safety code reads exactly like working
// safety code.
// ============================================================

/**
 * Alphanumeric parts of an identifier, uppercased.
 *
 * `HUB-002` -> ["HUB", "002"]     `FTT-HB-001` -> ["FTT", "HB", "001"]
 *
 * Splitting on non-alphanumerics rather than on "-" specifically means a Canon id
 * using a different separator, or none, needs no change here.
 */
const partsOf = (id) =>
  String(id ?? "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);

/**
 * Tokens of a participant message, uppercased, with letter/digit runs SEPARATED.
 *
 * The split on a letter-digit boundary is what makes "hub002" and "the002hub" work:
 * a participant who omits the separator has still named the same two parts. It is
 * also why this cannot be done with a single id-shaped regex over the raw text — the
 * shape the participant typed may not be an id shape at all.
 */
const tokensOf = (text) =>
  String(text ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .flatMap((t) => t.split(/(?<=[A-Z])(?=[0-9])|(?<=[0-9])(?=[A-Z])/))
    .filter(Boolean);

/**
 * WHICH top-level `view` keys hold resolvable entities, and how to read each.
 *
 * This is the ONE piece of manufacturing-specific data in this file — everything
 * else in entity.js is a generic algorithm over whatever `kinds` describes. Kept
 * as data, not as three hardcoded `Object.keys(view.components)`-style lines, so
 * a second domain (Election, Business, ...) can hand in its OWN `kinds` describing
 * its OWN view shape (`candidates`, `wards`, ...) and get the exact same
 * Canon-driven resolution, ambiguity handling and never-invents guarantee this
 * file already provides — not a second, parallel resolver.
 *
 * `isArray: true` means the view key is an array of `{id, ...}` objects
 * (missions today); its absence means the key is a map keyed by id (components,
 * specifications today).
 *
 * `describe` (optional) reads a HUMAN-READABLE LABEL off the Canon record itself
 * — never a second name for the entity, never an alias table. Missions already
 * carry a `title` field the fold has held since before this phase; this is a
 * one-line accessor onto data that already exists, not new Canon content and not
 * a lookup a person maintains. See `canonEntities`'s `label` field below for what
 * this is FOR: a model reading "FORGE-HUB (mission)" has no way to connect that id
 * to "the two-hundred-hub batch" a participant might say instead; a model reading
 * "FORGE-HUB (mission: Manufacture 200 wheel hubs)" can. Components and
 * specifications have no `describe` here because the fold holds no title-like
 * field for either — adding `describe` costs nothing when a kind has none.
 */
export const DEFAULT_ENTITY_KINDS = Object.freeze([
  Object.freeze({ key: "components", kind: "component" }),
  Object.freeze({ key: "specifications", kind: "specification" }),
  Object.freeze({ key: "missions", kind: "mission", isArray: true, describe: (m) => m?.title ?? null }),
]);

/**
 * Every entity the Canon holds, as { id, kind, label }. The ONLY resolvable set.
 *
 * `label` is null whenever a kind declares no `describe` — every existing reader
 * destructures `{id, kind}` and never looks at `label`, so this is purely
 * additive. It exists for ONE consumer, `understand.js`'s `interpretContext`,
 * and is never used for resolution itself: `resolveEntity`/`entitiesNamed` still
 * match on `id` alone, so a label can never become a second way to name an
 * entity into existence.
 */
export function canonEntities(view = {}, { kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const out = [];
  for (const k of kinds) {
    const node = view?.[k.key];
    if (k.isArray) {
      for (const m of node ?? []) {
        if (m?.id) out.push({ id: m.id, kind: k.kind, label: k.describe ? (k.describe(m) ?? null) : null });
      }
    } else {
      for (const id of Object.keys(node ?? {})) {
        out.push({ id, kind: k.kind, label: k.describe ? (k.describe(node[id]) ?? null) : null });
      }
    }
  }
  return Object.freeze(out.map(Object.freeze));
}

/**
 * Does `text` name this entity?
 *
 * EVERY part of the id must appear as a token, and parts are compared for EQUALITY
 * rather than containment. That is deliberate and it is what stops the most
 * dangerous class of false positive: with containment, "002" would match a Canon
 * holding `HUB-0021`, and Forge would answer confidently about the wrong part. A
 * wrong component id in a manufacturing answer is worse than no answer.
 *
 * `strength` is the total matched id length, used only to prefer a LONGER exact
 * naming over a shorter one — `FTT-HB-001` over a hypothetical `FTT` — never to
 * break a genuine ambiguity between two equally-named entities.
 */
function names(text, id) {
  const tokens = new Set(tokensOf(text));
  const parts = partsOf(id);
  if (!parts.length) return null;
  if (!parts.every((p) => tokens.has(p))) return null;
  return { strength: parts.join("").length, parts };
}

/**
 * Resolve whatever entity a message names, against the live Canon.
 *
 * @param text  the participant's words, or a candidate a model proposed
 * @param view  project(log, MISSIONS) — the only source of resolvable ids
 * @param kind  optionally restrict to "component" | "specification" | "mission"
 *
 * @returns {{ resolved, id, kind, candidates, ambiguous, reason }}
 *
 * Four honest outcomes, and no fifth:
 *   resolved      exactly one Canon entity is named
 *   ambiguous     more than one is named, equally strongly — CALLER MUST ASK
 *   not resolved  nothing in the Canon is named
 *   not resolved  the Canon is empty, which is a different reason and says so
 */
export function resolveEntity(text, view = {}, { kind = null, kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const pool = canonEntities(view, { kinds }).filter((e) => !kind || e.kind === kind);
  if (!pool.length) {
    return Object.freeze({ resolved: false, id: null, kind: null,
                           candidates: Object.freeze([]), ambiguous: false,
                           reason: "Forge Canon holds no entity of that kind yet" });
  }

  const hits = [];
  for (const e of pool) {
    const m = names(text, e.id);
    if (m) hits.push({ ...e, strength: m.strength });
  }
  if (!hits.length) {
    return Object.freeze({ resolved: false, id: null, kind: null,
                           candidates: Object.freeze([]), ambiguous: false,
                           reason: "no entity recorded in Forge Canon is named in that message" });
  }

  // Strongest naming wins; equal strength is a genuine ambiguity, never a pick.
  const top = Math.max(...hits.map((h) => h.strength));
  const best = hits.filter((h) => h.strength === top);

  if (best.length > 1) {
    return Object.freeze({
      resolved: false, id: null, kind: null,
      candidates: Object.freeze(best.map((b) => b.id).sort()),
      ambiguous: true,
      reason: "more than one recorded entity is named equally strongly",
    });
  }

  return Object.freeze({
    resolved: true, id: best[0].id, kind: best[0].kind,
    candidates: Object.freeze([best[0].id]), ambiguous: false, reason: null,
  });
}

/**
 * EVERY Canon entity a message names, not just the strongest one.
 *
 * `resolveEntity` answers "what is this question about?" and must therefore choose
 * or refuse. This answers a different question — "what did this sentence put on the
 * table?" — and must NOT choose, because a sentence naming two parts genuinely put
 * two parts in play. conversation.js uses it to know when a later "it" is ambiguous.
 *
 * Keeping these separate is what stopped the clarification path from being dead
 * code: with only `resolveEntity`, a two-entity sentence silently reduced to one
 * subject and no later reference could ever be ambiguous.
 */
export function entitiesNamed(text, view = {}, { kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const out = [];
  for (const e of canonEntities(view, { kinds })) {
    if (names(text, e.id)) out.push(e.id);
  }
  return Object.freeze([...new Set(out)]);
}

/**
 * Validate an entity a MODEL proposed. (§5, §9)
 *
 * Separate from `resolveEntity` only in what it accepts — a model returns a
 * candidate string rather than a sentence — and identical in what it guarantees:
 * the returned id is a key that exists in the fold, or there is no returned id.
 *
 * A model proposing an entity the Canon does not hold is NOT an error to report to
 * the participant. It is an unresolved reference, handled exactly like a participant
 * naming a part that was never recorded: Forge says it has no record. The model's
 * proposal never becomes the answer's subject on the model's word alone.
 */
export function validateProposedEntity(candidate, view = {}, { kinds = DEFAULT_ENTITY_KINDS } = {}) {
  const raw = String(candidate ?? "").trim();
  if (!raw) {
    return Object.freeze({ resolved: false, id: null, kind: null, reason: "no entity proposed" });
  }

  // An exact key hit is the common case and needs no fuzzy work.
  for (const e of canonEntities(view, { kinds })) {
    if (e.id === raw) {
      return Object.freeze({ resolved: true, id: e.id, kind: e.kind, reason: null });
    }
  }
  // Otherwise the same Canon-driven naming test, so "hub 002" from a model resolves
  // exactly as it does from a participant — one rule, not two.
  const r = resolveEntity(raw, view, { kinds });
  return Object.freeze({
    resolved: r.resolved, id: r.id, kind: r.kind,
    ambiguous: r.ambiguous, candidates: r.candidates,
    reason: r.resolved ? null : `"${raw}" is not recorded in Forge Canon`,
  });
}

/**
 * Does the message refer to something without naming it? ("it", "that hub", "this")
 *
 * This is the ONE piece of surface-language matching in this file, and it is kept as
 * small as it can be: a reference word is a closed class in every language, unlike
 * the open-ended question forms the model is there to understand. It is used only to
 * decide whether to CONSULT THE CONVERSATION — it never selects an intent and never
 * supplies a fact.
 *
 * Absence of a reference word is not evidence of absence of a reference: "Why?" and
 * "Menene matsayin?" refer to the subject under discussion with no pronoun at all.
 * conversation.js therefore carries the subject forward whenever no entity is named,
 * and this function only makes that carry-forward EXPLICIT where a word marks it.
 */
const REFERENCE_WORDS = Object.freeze([
  // en
  "it", "its", "it's", "that one", "this one", "that component", "this component",
  "that hub", "this hub", "that part", "this part", "the same", "them",
  // ha — wannan/wancan (this/that), shi/ta (it), nasa/nata (its)
  "wannan", "wancan", " shi", " ta ", "nasa", "nata", "wanda",
  // yo
  "rẹ̀", "ohun náà", "iyẹn", "eyi",
  // ig
  "ya", "nke ahụ", "nke a",
  // pcm
  " am", "that thing", "the same one",
  // fr
  "le même", "celui-là", "ça",
]);

export function refersToSomething(text) {
  const t = ` ${String(text ?? "").toLowerCase().normalize("NFC")} `;
  return REFERENCE_WORDS.some((w) => t.includes(w.toLowerCase()));
}

export default { canonEntities, resolveEntity, entitiesNamed,
                 validateProposedEntity, refersToSomething, DEFAULT_ENTITY_KINDS };
