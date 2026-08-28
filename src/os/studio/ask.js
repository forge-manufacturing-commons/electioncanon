// ============================================================
// FORGE STUDIO — THE PIPELINE  (Phase 2)
//
// One function the room calls, and the only place the stages are wired together:
//
//   message
//     -> detect language          language.js
//     -> resolve canonical intent intent.js
//     -> read Forge Canon         canonTools.js  (deep-frozen, read-only)
//     -> produce claims           infer.js       (adapter — UNTRUSTED)
//     -> verify every claim       grounding.js   (second security boundary)
//     -> realise in the language  respond.js
//
// THE ORDER IS THE SECURITY MODEL. Verification sits between the thing that
// produces claims and the thing that speaks them, so no adapter — deterministic,
// remote, hostile, or a future model with a persuasive tone — can reach the
// sentence without passing the fold. Swapping the adapter cannot reorder this.
//
// MODE is a capability ceiling, not a hint:
//   ASK      read the Canon and answer.
//   EXPLAIN  the same facts plus the interpretation the Canon's own state
//            machine supplies. Still read.
//   PREPARE  additionally return a DRAFT event object. Not published, not
//            authorised, not validated against policy. See prepare.js.
//
// Nothing in this file imports an emitter, a policy, `publish`, Supabase, or any
// room-local module. That is checked by the test suite rather than promised here.
// ============================================================

import { createCanonTools } from "./canonTools.js";
import { groundResponse, CLAIM, isBinding } from "./grounding.js";
import { runInference, deterministicAdapter } from "./infer.js";
import { planResponse, realiserFor } from "./respond.js";
import { prepareDraft } from "./prepare.js";
import { understand, UNDERSTOOD_BY, DEFAULT_VOCABULARY } from "./understand.js";
import { remember } from "./conversation.js";

export const MODE = Object.freeze({
  ASK: "ASK",
  EXPLAIN: "EXPLAIN",
  PREPARE: "PREPARE",
});

/**
 * MODE INFERRED FROM THE MESSAGE, NOT CHOSEN BY THE PARTICIPANT (§3).
 *
 * A verb that asks Forge to draft an event means PREPARE; anything else is a
 * question and stays ASK. Moved here, out of ForgeStudioRoom.jsx, so every
 * caller of `askForge` — the Studio room today, a future standalone client, a
 * future WhatsApp adapter — applies the SAME rule rather than each reimplementing
 * its own approximation of it. Same regex, same two outcomes; this is a pure
 * extraction, not a new capability.
 */
export function inferMode(message) {
  return /\b(prepare|draft|shirya|kwadebe|pèsè)\b/i.test(String(message ?? ""))
    ? MODE.PREPARE
    : MODE.ASK;
}

/**
 * State a prepared draft in the participant's language.
 *
 * The `notice` carried on the draft already says NOT PUBLISHED / NOT AUTHORISED in
 * that language, so this sentence names WHAT was prepared and then defers to it.
 * The two are kept together deliberately: a draft description that could be read
 * without the notice is a draft that looks like a recorded event.
 */
function draftSentence(draft, language) {
  const { r } = realiserFor(language);
  return `${r.prepared(draft.label, draft.component)} ${draft.notice}`;
}

/**
 * Ask Forge Canon a question in any supported language.
 *
 * @param message            what the participant said
 * @param view               project(log, MISSIONS) — deep-frozen
 * @param log                the event stream (event-level grounding only)
 * @param preferredLanguage  the session preference, used only when detection is
 *                           genuinely uncertain. Never overrides a confident read.
 * @param mode               ASK | EXPLAIN | PREPARE
 * @param adapter            claim producer. Defaults to the deterministic one, so
 *                           Forge AI answers with NO provider attached.
 * @param session            prior turns, for resolving "the component we discussed".
 *                           Session memory only — it is not persisted and does not
 *                           outrank the Canon. Superseded by `conversation`, and
 *                           still honoured so every existing caller keeps working.
 * @param conversation       the richer memory from conversation.js, which knows how
 *                           many subjects are in play and can therefore tell a
 *                           carry-forward from an ambiguity.
 * @param interpreter        optional model-backed understanding (understand.js).
 *                           Absent means deterministic-only, which is the offline
 *                           behaviour and fully supported rather than degraded.
 * @param responder          the response composer. Defaults to manufacturing's own
 *                           `planResponse` (respond.js). A second domain (Election,
 *                           Business, ...) supplies its own composer here — same
 *                           contract (`{grounded, intent, view} -> {answer, segments,
 *                           ...}`), same SEGMENT vocabulary, own switch over its own
 *                           intents. This IS the seam that proves `askForge` is not
 *                           rewritten per domain: everything below this parameter
 *                           list is unconditional and shared.
 * @param vocabulary         the domain's understanding vocabulary, forwarded to
 *                           understand.js untouched. See understand.js's
 *                           `DEFAULT_VOCABULARY` for the shape. Absent means
 *                           manufacturing's own vocabulary, unchanged.
 */
export async function askForge({
  message,
  view = {},
  log = [],
  preferredLanguage = "en",
  mode = MODE.ASK,
  adapter = deterministicAdapter,
  session = null,
  conversation = null,
  interpreter = null,
  responder = planResponse,
  vocabulary,
} = {}) {
  const tools = createCanonTools(view, log);
  const V = vocabulary ?? DEFAULT_VOCABULARY;

  // SESSION CONTINUITY, WITHOUT PRETENDING TO REMEMBER. "What about the one we
  // discussed?" names no component, so the last component of THIS session is
  // carried forward. It is conversational context and nothing more: it can only
  // ever supply an identifier to look up in the Canon, never a fact. If the
  // carried id is not in the Canon, the answer is still "no record of that".
  //
  // A BARE `session.lastComponent` IS PROMOTED TO A ONE-TURN CONVERSATION rather than
  // handled by a second code path. Every caller written against the old shape keeps
  // working, and the ambiguity logic in conversation.js applies to both — which it
  // could not if `session` were still resolved by its own `if`. One subject in play
  // is exactly what a `lastComponent` describes, so the promotion is lossless.
  const memory = conversation
    ?? (session?.lastComponent
          ? remember(null, { message: String(session.lastComponent), view,
                             intent: { component: session.lastComponent } })
          : null);

  // UNDERSTANDING (§4). The stage this phase added: the Canon resolves the entity,
  // the conversation resolves the reference, ambiguity becomes a question, and a
  // model is consulted only where the deterministic read cannot answer at all.
  let intent = await understand({
    message, view, preferredLanguage, conversation: memory, interpreter, vocabulary,
  });
  const carried = intent.componentFromSession === true;

  // The participant's words travel with the intent so a provider adapter can send
  // them. They are DATA for the model, never an instruction to Forge — the intent
  // was already resolved above, from those same words, before any model saw them.
  intent = Object.freeze({ ...intent, message: String(message ?? "") });

  // PROVIDER STATUS IS CAPTURED, NOT SWALLOWED (§14).
  //
  // In Phase 2 a provider failure fell back to the deterministic answer silently.
  // The answer was correct, which is why it looked acceptable — but the participant
  // could not tell whether they were reading a model's phrasing or Forge's own, and
  // an operator could not tell that inference was down at all. Silence about a
  // failure is its own kind of dishonesty. The status is now surfaced.
  let providerStatus = null;
  const observed = (res) => { providerStatus = res ?? null; };
  const wired = adapter?.withStatus ? adapter.withStatus(observed) : adapter;

  const grounded = await runInference({ adapter: wired, intent, view, log, tools });
  const planned = responder({ grounded, intent, view });

  // PREPARE is additive and strictly last. It cannot change the answer, and it
  // produces an object rather than an action.
  // The participant's own words are passed through, because the event type they
  // asked for lives in the VERB ("record the pass", "an amince") and the resolved
  // intent only carries the fact that something was requested. Without the text,
  // PREPARE could never name an event type and always returned an empty draft.
  //
  // AND IT CANNOT FIRE WHILE FORGE IS STILL ASKING WHICH COMPONENT (§7). "Prepare
  // the inspection pass" with two parts in play must produce a question, not a draft
  // naming whichever one happened to sort first. A draft is not an event, but it is a
  // document with a component id on it that a participant may act on — drafting
  // against a guessed subject is exactly the confident-and-wrong outcome the
  // clarification path exists to prevent.
  const clarifying = (planned.clarifying ?? []).length > 0;
  // `vocabulary.prepare` is an OPTIONAL sub-bundle {draftable, canonicalTypes,
  // subjectOf} — undefined (manufacturing's case) leaves prepareDraft's own
  // defaults untouched. `actionRequestType` comes from the SAME vocabulary's
  // INTENT so "this is a request to act" means the same thing here as it does
  // throughout understanding, for whichever domain is asking.
  const draft = mode === MODE.PREPARE && !clarifying
    ? prepareDraft({ intent, view, language: planned.language, text: String(message ?? ""),
                     actionRequestType: V.INTENT.ACTION_REQUEST, ...(vocabulary?.prepare ?? {}) })
    : null;

  // A prepared draft is stated in the participant's language, appended to the
  // answer rather than replacing it — they still get the Canon's current position
  // AND a clear statement that nothing has been recorded.
  // When PREPARE succeeded but the message was not ALSO a recognisable question,
  // the "I did not understand that" preamble is misleading — the request was
  // understood well enough to draft a canonical event from it. Drop the preamble
  // and state the draft alone.
  const answer = draft?.draft
    ? (intent.type === V.INTENT.UNKNOWN
        ? draftSentence(draft, planned.language)
        : `${planned.answer} ${draftSentence(draft, planned.language)}`.trim())
    : planned.answer;

  // PREPARE's draft sentence is its own segment kind, so a surface can never
  // render "I have prepared a draft" with the same weight as a recorded fact.
  const segments = draft?.draft
    ? Object.freeze([
        ...(intent.type === V.INTENT.UNKNOWN ? [] : planned.segments),
        Object.freeze({ text: draftSentence(draft, planned.language), kind: "PREPARED" }),
      ])
    : planned.segments;

  return Object.freeze({
    // What the participant reads.
    answer,
    // The SAME answer, split by what kind of statement each part is (§8). A
    // recommendation and a Canon fact must never be presented identically.
    segments,
    language: planned.language,
    languageFellBack: planned.fellBack,

    // Why they should believe it. Present in every result so a surface can show
    // provenance without the caller having to ask for it.
    sources: planned.sources,
    canonLimitation: planned.canonLimitation,
    identifiersPreserved: planned.preserved,

    // What the pipeline decided, exposed for the intent preview and the audit.
    intent: Object.freeze({
      type: intent.type,
      component: intent.component ?? null,
      mission: intent.mission ?? null,
      specification: intent.specification ?? null,
      subject: intent.subject ?? null,
      confidence: intent.confidence,
      fromSession: Boolean(carried),
      // HOW the sentence was understood: the phrase table, the model, or neither
      // because Forge is asking which component. Diagnostics and tests only — §20
      // keeps it off the screen unless the participant opens the provenance panel.
      understoodBy: intent.understoodBy ?? UNDERSTOOD_BY.DETERMINISTIC,
      operation: intent.operation ?? null,
      // Set when a model proposed something Forge refused: an operation it does not
      // perform, or an entity the Canon does not hold. Recorded rather than hidden,
      // because a proposal being rejected often is how you find out the understanding
      // stage is misconfigured rather than merely unlucky.
      proposalRejected: intent.proposalRejected ?? null,
      // THE QUESTION FORGE WAS ASKING WHEN IT ASKED "WHICH ONE?".
      //
      // This has to be on the RESULT, not merely inside `understand`, because the
      // caller is what feeds `remember` — the room does
      // `remember(c, { intent: result.intent })`. My first attempt set it deep in the
      // pipeline and it never surfaced, so the clarification still could not be
      // resumed and the probe showed `pending=-`. A field that exists but does not
      // reach the only consumer that needs it is not a fix.
      pendingType: intent.pendingType ?? null,
    }),

    // §7 — THE CANDIDATES FORGE IS ASKING BETWEEN. Empty on every ordinary turn. The
    // answer above is already the question, in the participant's language; this is
    // the machine-readable form, for the room's quick-reply buttons and for the suite.
    clarifying: planned.clarifying ?? Object.freeze([]),
    detectedLanguage: intent.detectedLanguage ?? null,
    languageConfidence: intent.languageConfidence ?? 0,
    mixedLanguage: Boolean(intent.mixedLanguage),
    responseLanguageBecause: intent.responseLanguageBecause ?? null,

    // The grounding verdict. `sound` is false when anything asserted the Canon
    // and failed to prove it — the single field a surface should refuse to
    // present facts on.
    grounded: Object.freeze({
      sound: grounded.sound,
      facts: grounded.facts.length,
      derived: grounded.derived.length,
      unknowns: grounded.unknowns.length,
      downgraded: grounded.downgraded.length,
      roomLocal: grounded.roomLocal.length,
      canonLimitations: grounded.canonLimitations.length,
      claims: grounded.claims,
    }),

    mode,
    draft,

    // INFERENCE PROVENANCE. Which path produced the words the participant is
    // reading, and — when the provider failed — a sentence in their own language
    // saying so and confirming the Canon is untouched.
    provider: Object.freeze({
      attempted: providerStatus !== null,
      status: providerStatus?.status ?? null,
      reason: providerStatus?.reason ?? null,
      // A model's prose is only ever used when EVERY claim it made grounded.
      usedModelPhrasing: false,
      failed: providerStatus !== null && providerStatus.status !== "OK",
      notice: providerStatus !== null && providerStatus.status !== "OK"
        ? realiserFor(planned.language).r.providerDown()
        : null,
    }),
  });
}

/** Only these two classes may ever be shown to a user as Forge Canon facts. */
export const presentableFacts = (result) =>
  (result?.grounded?.claims ?? []).filter(isBinding);

export default { askForge, MODE, inferMode, presentableFacts };
