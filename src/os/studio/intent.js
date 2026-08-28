// ============================================================
// FORGE STUDIO — CANONICAL INTENT  (Phase 0)
//
// Language is an input/output layer. Meaning is not.
//
//   "What should I do next with HUB-014?"          en
//   "Me ya kamata in yi na gaba akan HUB-014?"     ha
//   "Kí ni mo yẹ kí n ṣe tókàn lori HUB-014?"      yo
//   "Gịnị ka m kwesịrị ime ọzọ na HUB-014?"        ig
//
// ...all resolve to ONE canonical intent:
//
//   { type: "component.next_action", component: "HUB-014", language, confidence }
//
// There is deliberately NO per-language business logic. Each intent declares
// marker phrases per language and the resolution code is shared, so adding a
// language means adding phrases — never a second implementation, and never a
// second copy of the manufacturing rules.
//
// ENTITIES COME FROM THE PROTECTED-TERM LAYER. A component or specification id is
// extracted by the same mechanism that stops it being translated, so the entity
// the intent names and the token the translator must preserve are guaranteed to
// be the same string.
//
// PHASE 0 IS RECOGNITION, NOT ACTION. An intent is a question the Canon can be
// asked. It carries no authority, publishes nothing, and an unrecognised message
// is `unknown` rather than a guess.
// ============================================================

import { detectLanguage, explicitLanguageRequest, resolveResponseLanguage } from "./language.js";
import { findProtectedTerms } from "./terms.js";
import { componentState } from "../../domains/production/state.js";

/**
 * Every intent Forge Studio recognises.
 *
 * PHASE 2 ADDED SIX, AND EVERY ONE OF THEM IS STILL A READ. The additions exist
 * because the Canon already holds four DISTINCT relationships on a component and
 * a single "who?" intent could not tell them apart:
 *
 *   COMPONENT_WHO           RESPONSIBILITY   component.organisation
 *   COMPONENT_CONTRIBUTIONS PARTICIPATION    component.contributions[]
 *   COMPONENT_DIRECTIVES    COORDINATION     component.directives[]
 *   COMPONENT_HISTORY       PERFORMANCE      component.history[]
 *
 * Collapsing those into one intent would have made Forge AI answer "who is
 * responsible?" with a list of contributors — reintroducing exactly the confusion
 * E9 was built to remove. So the language layer distinguishes them, because the
 * Canon does.
 *
 * ACTION_REQUEST is the one that is NOT a question. It exists so that "approve
 * this" is RECOGNISED rather than falling through to `unknown` — a request to act
 * must be identified in order to be refused with a reason. Recognising an
 * instruction is not obeying it.
 */
export const INTENT = Object.freeze({
  COMPONENT_STATE:         "component.state",
  COMPONENT_NEXT_ACTION:   "component.next_action",
  COMPONENT_WHO:           "component.who",
  COMPONENT_HUB:           "component.hub",
  COMPONENT_MISSION:       "component.mission",
  COMPONENT_CONTRIBUTIONS: "component.contributions",
  COMPONENT_DIRECTIVES:    "component.directives",
  COMPONENT_HISTORY:       "component.history",
  // (Phase 3) EXPLANATION. "Why is it still in manufacturing?" is the question a
  // participant actually asks, and it is not a state lookup: the answer is a
  // recorded fact PLUS what the Canon does not hold PLUS what the lifecycle permits
  // next. Three different claim classes in one reply, which is why it needs its own
  // intent rather than being folded into component.state.
  COMPONENT_WHY:           "component.status_explanation",
  // What the Canon does NOT hold about a subject. Absence as a first-class answer.
  CANON_GAPS:              "canon.gaps",
  ACKNOWLEDGEMENT_STATUS:  "acknowledgement.status",
  INSPECTION_STATUS:       "inspection.status",
  SPECIFICATION_EXPLAIN:   "specification.explain",
  MISSION_PROGRESS:        "mission.progress",
  ACTION_REQUEST:          "action.request",
  SEARCH:                  "search",
  UNKNOWN:                 "unknown",
});

/**
 * Marker phrases per intent per language. Multi-word phrases first — they are
 * far more discriminating than single words, especially across languages that
 * share borrowed technical vocabulary.
 *
 * HAUSA IS FIRST-CLASS HERE, NOT TRANSLATED IN. The Hausa lists carry the natural
 * question openers a workshop participant actually uses — Menene, Wane, Ina,
 * Yaushe, Me ya sa, Me ya kamata, Wanene, Nawa, Shin — and, just as importantly,
 * the CODE-SWITCHED forms. A Nigerian engineer says "Menene state ɗin HUB-014
 * yanzu?", mixing Hausa grammar with English technical nouns, and that is correct
 * speech in a Nigerian workshop rather than a degraded input to be corrected. So
 * both "matsayi" and "state ɗin" are markers for the same intent.
 *
 * PHRASES ARE MATCHED AGAINST THE RAW TEXT, WHICH CONSTRAINS WHAT MAY GO IN HERE.
 * Canon identifiers are not masked at this stage, so a bare "hub" would match the
 * component id "HUB-014" and make every component question look like a location
 * question. Every hub marker is therefore multi-word or unambiguous.
 */
const PHRASES = Object.freeze({
  [INTENT.COMPONENT_NEXT_ACTION]: {
    en: ["what next", "do next", "next step", "what should i do", "what happens next",
         "what remains", "what still needs", "what is left", "what's left"],
    ha: ["na gaba", "me ya kamata", "mataki na gaba", "me ya rage", "abin da ya rage",
         "me za mu yi", "me ake bukata", "sauran aikin", "me ya saura"],
    yo: ["tókàn", "tokan", "kí ni mo yẹ", "ki ni mo ye", "ìgbésẹ̀ tókàn", "kí ó ku"],
    ig: ["ọzọ", "ozo", "kwesịrị ime", "kwesiri ime", "gịnị ka m", "gịnị fọdụrụ"],
    pcm: ["wetin next", "wetin i go do", "wetin remain", "wetin still dey"],
    fr: ["prochaine étape", "que faire", "que reste"],
  },
  [INTENT.COMPONENT_STATE]: {
    // "where is" USED TO BE HERE AND IT WAS WRONG. §6 requires "Where is it?" to
    // resolve to LOCATION, and this entry sent it to a state lookup instead — which
    // then answered with state, responsibility, hub AND mission, over-answering a
    // one-field question (§21) as well as answering the wrong one.
    //
    // The interesting part is that no test caught it and the escalation path could
    // not either: the phrase table matched CONFIDENTLY, so `deterministicIsSufficient`
    // returned true and the model was never consulted. This is precisely the failure
    // mode named in understand.js's header, found by probing the conversation rather
    // than by reading the table. A marker on the wrong intent is invisible to a suite
    // that only asserts the intents it already believes in.
    en: ["what is happening", "what's happening", "current state", "status of",
         "what state", "what is the state"],
    // "matsayi" is status/position. "menene state ɗin" is the code-switched form
    // of the same question and must land on the same intent.
    // "status ɗin" completes a code-switch pattern that was already half-present:
    // "state ɗin" was here and "status ɗin" was not, though a Nigerian engineer uses
    // both interchangeably — §17's own example sentence is "Menene status ɗin CHS-014?".
    // This is finishing an existing pattern, not starting a phrase dictionary.
    ha: ["menene matsayin", "menene matsayi", "matsayin", "matsayi", "menene state",
         "state ɗin", "state din", "menene status", "status ɗin", "status din",
         "yana ina", "halin yanzu", "yaya", "ina", "a ina",
         "wane matakin", "wane mataki"],
    yo: ["ipò", "ipo", "báwo", "bawo", "níbo", "nibo", "kí ni ipò"],
    ig: ["kedu", "ebee", "ọnọdụ", "onodu", "kedu ọnọdụ"],
    // A BARE "where" WAS HERE AND IT WAS A LANDMINE. As a single-word marker it
    // matched ANY sentence containing "where", in any language, and it is the reason
    // removing "where is" from the English list above did not fix "Where is it?" —
    // the Pidgin entry kept catching it. A one-word marker for a word this common is
    // not a Pidgin fact about the question; it is a wildcard.
    pcm: ["how far", "wetin dey happen", "e dey which state"],
    fr: ["état actuel", "quel est l'état"],
  },
  // RESPONSIBILITY. "alhaki" is the Hausa word for responsibility/accountability —
  // it is the discriminator that separates this from participation below.
  [INTENT.COMPONENT_WHO]: {
    en: ["who is responsible", "who is accountable", "who owns", "which organisation is responsible",
         "who answers for"],
    ha: ["wanene ke da alhakin", "wane ke da alhakin", "ke da alhakin", "alhakin",
         "wanene ke da", "wace kungiya", "wace ƙungiya"],
    yo: ["ta ni ó ni", "ta ni ni ojuse", "ẹni tó ni"],
    ig: ["onye nwe", "onye na-ahụ maka", "onye ọrụ ya bụ"],
    pcm: ["who dey responsible", "who own", "who get am"],
    fr: ["qui est responsable", "quelle organisation est responsable"],
  },
  // MANUFACTURING LOCATION. Distinct from state because the Canon holds it in a
  // different field, closed by Canon P0-2. "ake kera" = "is being manufactured".
  [INTENT.COMPONENT_HUB]: {
    // §6 REQUIRES "Where is it?" TO MEAN LOCATION, and the bare locative forms now
    // live here where they belong. `hub` is MANUFACTURING LOCATION in the fold
    // (Canon P0-2), so "where is X" is a one-field answer — which also fixes the §21
    // over-answering this question used to produce by reaching COMPONENT_STATE and
    // reciting state, responsibility, hub and mission together.
    en: ["which hub", "what hub", "where is it", "where is", "where's it", "where's",
         "where was it made", "where is it made", "where is it being made",
         "where was it manufactured", "where is it manufactured", "which workshop", "what workshop"],
    // "Ina yake?" IS THE HAUSA FOR "Where is it?" and it belonged here from the
    // start. It was missing, so §16's locative follow-up fell through to the state
    // markers ("ina" alone means "where") and answered with four facts instead of the
    // hub — the same mis-filing as the English "where is", found the same way. Note
    // "yana ina" stays on COMPONENT_STATE: it is the copular "how is it", not a
    // locative, which is why the two are separate entries rather than one.
    ha: ["a ina ake kera", "ina ake kera", "ake kera", "a ina aka kera", "aka kera",
         "a wane hub", "wane hub", "a ina ake yin", "ina ake yin", "a wace bita",
         "ina yake", "a ina yake", "ina take", "a ina take"],
    yo: ["ibi tí wọ́n ń ṣe", "níbo ni wọ́n ń ṣe", "ilé iṣẹ́ wo"],
    ig: ["ebee ka a na-emere", "ebee ka e mere", "ụlọ ọrụ ole"],
    pcm: ["which hub", "where dem make am", "where dem dey make am", "where e dey", "where am dey"],
    fr: ["quel atelier", "où est-il fabriqué", "où est"],
  },
  [INTENT.COMPONENT_MISSION]: {
    en: ["what mission", "which mission", "part of what mission", "part of which mission",
         "belongs to what mission", "under what mission"],
    ha: ["wane aiki", "wane manufa", "wace manufa", "ƙarƙashin wane", "karkashin wane",
         "wane mission", "wace mission"],
    yo: ["iṣẹ́ àpinfunni wo", "iṣẹ wo"],
    ig: ["ozi ọrụ ole", "ọrụ ole"],
    pcm: ["which mission", "na which mission"],
    fr: ["quelle mission"],
  },
  // PARTICIPATION. "gudummawa" = contribution. Never responsibility.
  [INTENT.COMPONENT_CONTRIBUTIONS]: {
    en: ["who contributed", "who worked on", "who helped", "who participated",
         "what knowledge was contributed", "who advised"],
    ha: ["wanene ya ba da gudummawa", "ya ba da gudummawa", "gudummawa",
         "wanene ya yi aiki a kan", "su wa suka yi aiki", "wanene ya taimaka"],
    yo: ["ta ni ó kópa", "ta ni ṣe iranlọwọ"],
    ig: ["onye tinyere aka", "onye nyere aka"],
    pcm: ["who contribute", "who work on am", "who help"],
    fr: ["qui a contribué", "qui a participé"],
  },
  // COORDINATION. "umarni" = instruction/directive.
  [INTENT.COMPONENT_DIRECTIVES]: {
    en: ["who directed", "who instructed", "who gave the instruction", "who ordered",
         "what was directed", "what instruction"],
    ha: ["wanene ya ba da umarni", "ya ba da umarni", "umarni", "wanene ya umarce",
         "wa ya bada umarni"],
    yo: ["ta ni ó pàṣẹ", "àṣẹ wo"],
    ig: ["onye nyere iwu", "iwu gịnị"],
    pcm: ["who give order", "who direct am"],
    fr: ["qui a donné l'instruction", "qui a ordonné"],
  },
  // ACKNOWLEDGEMENT — the two-party resolution of a directive (E9.5).
  [INTENT.ACKNOWLEDGEMENT_STATUS]: {
    en: ["has the instruction been accepted", "was the instruction accepted", "has it been acknowledged",
         "was it acknowledged", "did they accept", "instruction accepted", "acknowledgement status"],
    ha: ["an amince da umarnin", "shin an amince", "an karɓi umarnin", "an karbi umarnin",
         "an amince da umarni", "an yarda da umarnin"],
    yo: ["ṣé wọ́n gbà", "wọn gba àṣẹ"],
    ig: ["a nabatara iwu", "ha nabatara"],
    pcm: ["dem accept the order", "dem gree"],
    fr: ["l'instruction a-t-elle été acceptée"],
  },
  // WHY. Deliberately short markers, because a follow-up is usually one word. Weight
  // is word count, so any fuller question outranks a bare "why".
  [INTENT.COMPONENT_WHY]: {
    en: ["why", "why is", "why not", "why still", "how come", "for what reason",
         "what is blocking", "what's blocking", "why has not", "why hasn't"],
    ha: ["me ya sa", "don me", "saboda me", "me ke hana"],
    yo: ["kí ló dé", "kilode", "nítorí kí ni"],
    ig: ["gịnị kpatara", "maka gịnị"],
    pcm: ["why", "wetin cause am", "wetin dey block am"],
    fr: ["pourquoi", "qu'est-ce qui bloque"],
  },
  [INTENT.CANON_GAPS]: {
    // "TELL ME ABOUT X" AND "WHAT DO WE KNOW ABOUT X" ARE THE SAME QUESTION AS
    // "WHAT IS MISSING", asked from the positive side rather than the negative one.
    // CANON_GAPS already answers both halves in one reply — held AND missing — so
    // this is three markers added to an intent that already has a responder, not a
    // new capability. Each is three words or longer specifically so it cannot become
    // a landmine the way a bare "about" or "know" would.
    en: ["what information is missing", "what is missing", "what's missing",
         "what does forge canon not have", "what do you not know", "what don't you know",
         "what is not recorded", "what is unknown",
         "tell me about", "what do we know about", "what information do we have on"],
    ha: ["me ya ɓace", "me ba a rubuta ba", "menene ba a sani ba"],
    yo: ["kí ni kò sí", "kí ni ó ṣàìsí"],
    ig: ["gịnị na-efu", "gịnị a na-amaghị"],
    pcm: ["wetin dey miss", "wetin you no know"],
    fr: ["quelles informations manquent", "qu'est-ce qui manque"],
  },
  [INTENT.COMPONENT_HISTORY]: {
    en: ["what happened to", "history of", "what has happened", "when was", "when did",
         "show the history", "timeline"],
    ha: ["yaushe", "tarihin", "tarihi", "me ya faru", "menene ya faru", "ya faru",
         "abin da ya faru"],
    yo: ["ìtàn", "itan", "ìgbà wo"],
    ig: ["akụkọ", "kedu mgbe", "mgbe ole"],
    pcm: ["wetin happen", "when e happen"],
    fr: ["historique", "quand"],
  },
  [INTENT.INSPECTION_STATUS]: {
    en: ["passed inspection", "inspection done", "have we inspected", "inspection complete", "did it pass"],
    ha: ["ya wuce inspection", "shin ya wuce", "gama inspection", "an gama inspection",
         "ya ci inspection", "an yi inspection", "fara inspection", "shirye", "inspection",
         "ya wuce ayyukan bincike"],
    yo: ["ti kọja", "ti koja", "ayẹwo"],
    ig: ["nyochaa", "agafeela"],
    pcm: ["inspection don finish", "e pass"],
    fr: ["inspection terminée"],
  },
  [INTENT.SPECIFICATION_EXPLAIN]: {
    en: ["explain the specification", "explain this drawing", "explain the drawing", "explain",
         "what does the spec"],
    ha: ["bayyana", "ka bayyana", "bayyana min", "ka yi min bayani", "ka bayyana min"],
    yo: ["ṣàlàyé", "salaye", "ṣalaye"],
    ig: ["kọwaa", "kowaa"],
    pcm: ["explain", "break am down"],
    fr: ["expliquer", "explique"],
  },
  [INTENT.MISSION_PROGRESS]: {
    en: ["mission progress", "how many accepted", "how far is the mission", "progress of",
         "how many have been accepted", "how many wheel hubs"],
    ha: ["nawa aka gama", "nawa aka amince", "nawa ne aka gama", "ci gaban aiki", "ci gaba",
         "nawa aka karɓa", "nawa aka karba", "nawa"],
    yo: ["ìlọsíwájú", "ilosiwaju", "mélòó ni"],
    ig: ["ọganihu", "oganihu", "ole ka a nabatara"],
    pcm: ["how far mission", "how many dem accept"],
    fr: ["progression de la mission", "combien ont été acceptés"],
  },
  // NOT A QUESTION. Recognised so it can be REFUSED with a reason rather than
  // silently falling through to `unknown`. See the authority boundary in infer.js.
  [INTENT.ACTION_REQUEST]: {
    en: ["approve this", "approve it", "approve the", "sign this off", "sign off",
         "record the pass", "publish this", "mark it as passed", "i am the engineer",
         "record this event", "authorise this", "authorize this"],
    ha: ["ka amince da", "ki amince da", "amince da wannan", "ka sa hannu",
         "ni injiniya ne", "ni engineer ne", "ka approve", "ki approve",
         "ka tabbatar da wannan", "ka rubuta wannan"],
    yo: ["fọwọ́ sí", "fowo si", "gba á", "èmi ni onímọ̀ ẹ̀rọ"],
    ig: ["kwadoo ya", "bịanye aka", "abụ m onye injinia"],
    pcm: ["approve am", "sign am", "na me be the engineer"],
    fr: ["approuve ceci", "approuvez ceci", "je suis l'ingénieur"],
  },
  [INTENT.SEARCH]: {
    en: ["find", "search", "show me all", "list"],
    ha: ["nemo", "nema", "jerin"],
    yo: ["wá", "wa fún", "ṣàwárí"],
    ig: ["chọọ", "choo", "depụta"],
    pcm: ["find", "show me"],
    fr: ["chercher", "trouver"],
  },
});

/**
 * Subjects the Canon does not record. (P0-1)
 *
 * Recognising these is the RECOGNITION layer's job — this table only answers "what
 * was asked about", never "can it be answered". Whether a subject is refusable is
 * grounding.js's decision, which is why these keys are meaningless here and only
 * acquire wording in NOT_RECORDED_BY_CANON.
 *
 * These are deliberately NARROW. A false positive turns a question the Canon CAN
 * answer into a refusal, which is a worse failure than a generic unknown: it would
 * make ForgeOS claim ignorance of something it actually knows.
 */
const SUBJECT_PHRASES = Object.freeze({
  material:        ["material", "made of", "made from", "what metal", "which metal", "alloy",
                    "irin ƙarfe", "irin karfe", "matériau", "irin abu"],
  tolerance:       ["tolerance", "tolerances", "how accurate", "accuracy required", "tolérance"],
  dimensions:      ["dimension", "dimensions", "diameter", "how thick", "how wide", "how long",
                    "bore size", "girman", "kauri", "diamètre"],
  drawing:         ["drawing", "drawings", "cad file", "cad model", "zane", "dessin"],
  evidence:        ["evidence", "proof", "certificate", "photograph", "photo of", "attach",
                    "shaida", "hujja", "preuve"],
  measurement:     ["measurement", "measurements", "measured value", "recorded reading",
                    "ma'auni", "mauni", "mesure"],
  workshopHead:    ["head of workshop", "workshop head", "who runs the workshop",
                    "who is in charge of the workshop", "shugaban bita", "shugaban workshop"],
  studentIdentity: ["student", "students", "nysc", "corper", "intern", "trainee",
                    "ɗalibi", "dalibi", "étudiant"],
  personRole:      ["what role does", "what is his role", "what is her role", "what is my role",
                    "which organisation does he", "which organisation does she",
                    "who does he work for", "who does she work for", "mece rawar"],
  specTitle:       ["title of", "what is it called", "name of the specification",
                    "specification title", "sunan"],
});

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFC");

/**
 * Which unrecorded subject, if any, is this message about?
 *
 * Longest match wins, so "measured value" is not mistaken for the broader
 * "measurement" and a two-word marker beats an incidental single word.
 */
export function detectSubject(text) {
  const lower = norm(text);
  let chosen = null;
  let longest = 0;
  for (const [subject, phrases] of Object.entries(SUBJECT_PHRASES)) {
    for (const p of phrases) {
      const n = norm(p);
      if (lower.includes(n) && n.length > longest) {
        longest = n.length;
        chosen = subject;
      }
    }
  }
  return chosen;
}

export const UNRECORDED_SUBJECTS = Object.freeze(Object.keys(SUBJECT_PHRASES));

/** Extract Canon entities using the same layer that protects them. */
export function extractEntities(text) {
  const terms = findProtectedTerms(text);
  const ids = terms.filter((t) => t.kind !== "measurement").map((t) => t.text);
  const states = new Set(componentState.states());

  const specification = ids.find((v) => /^FTT-[A-Z]{2}-\d{3}$/.test(v)) ?? null;
  const mission = ids.find((v) => /^FORGE-[A-Z]+$/.test(v)) ?? null;
  // A component is a hyphenated id that is not a specification or a mission.
  const component = ids.find(
    (v) => v !== specification && v !== mission &&
           /^[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,6}){1,3}$/.test(v) && !states.has(v.toLowerCase()),
  ) ?? null;
  const measurements = terms.filter((t) => t.kind === "measurement").map((t) => t.text);

  return { component, specification, mission, measurements, identifiers: ids };
}

/**
 * Resolve a message into a canonical intent.
 *
 * @param text     what the participant actually said, in any language
 * @param context  { preferredLanguage } — session preference, never authority
 */
export function resolveIntent(text, { preferredLanguage = "en" } = {}) {
  const raw = String(text ?? "");
  const lower = norm(raw);
  const detected = detectLanguage(raw);
  const explicit = explicitLanguageRequest(raw);
  const { language: responseLanguage, because } =
    resolveResponseLanguage({ detected, preferred: preferredLanguage, explicit });

  // Score every intent across EVERY language's phrases. Scoring is not limited to
  // the detected language, because mixed input is normal — "Yanzu muna ready mu
  // fara inspection" carries an English marker inside a Hausa sentence.
  //
  // WEIGHT IS WORD COUNT, not a flat 2-for-multiword. With fourteen intents that
  // share vocabulary, "a ina ake kera" (4 words, unambiguously a location
  // question) has to outrank "ina" (1 word, which merely means "where") decisively
  // rather than by one point. Specificity is length.
  const hits = [];
  for (const [type, byLang] of Object.entries(PHRASES)) {
    for (const [lang, phrases] of Object.entries(byLang)) {
      for (const p of phrases) {
        const n = norm(p);
        if (lower.includes(n)) {
          hits.push({ type, lang, phrase: p, weight: n.split(/\s+/).filter(Boolean).length });
        }
      }
    }
  }

  const entities = extractEntities(raw);
  // What the question is ABOUT, independently of whether it can be answered.
  const subject = detectSubject(raw);

  if (!hits.length) {
    return Object.freeze({
      type: INTENT.UNKNOWN,
      ...entities,
      subject,
      language: responseLanguage,
      detectedLanguage: detected.language,
      languageConfidence: detected.confidence,
      mixedLanguage: detected.mixed,
      responseLanguageBecause: because,
      confidence: 0,
      matched: Object.freeze([]),
      reason: "no recognised intent phrase",
    });
  }

  // Best intent by total weight; ties broken by the longest matched phrase.
  //
  // THE TIE-BREAK WAS BROKEN AND IS NOW FIXED. It read `h[1] === b[0]`, indexing a
  // hit OBJECT numerically — `h[1]` is always undefined, so the filter never
  // matched, `Math.max(...[], 0)` was always 0, and every tie silently fell back to
  // Map insertion order. It went unnoticed while there were seven intents that
  // rarely tied. With fourteen that share "who" and "where" vocabulary, an
  // insertion-order tie-break would make the answer depend on the order this file
  // happens to declare its intents, which is not a linguistic fact about the
  // question. Longest single matched phrase now decides.
  const totals = new Map();
  const longest = new Map();
  for (const h of hits) {
    totals.set(h.type, (totals.get(h.type) ?? 0) + h.weight);
    longest.set(h.type, Math.max(longest.get(h.type) ?? 0, h.phrase.length));
  }
  const best = [...totals.entries()].sort(
    (a, b) => b[1] - a[1] || (longest.get(b[0]) ?? 0) - (longest.get(a[0]) ?? 0),
  )[0];
  const [type, weight] = best;
  const totalWeight = [...totals.values()].reduce((a, b) => a + b, 0);

  return Object.freeze({
    type,
    ...entities,
    subject,
    language: responseLanguage,
    detectedLanguage: detected.language,
    languageConfidence: detected.confidence,
    mixedLanguage: detected.mixed,
    responseLanguageBecause: because,
    confidence: Number((weight / totalWeight).toFixed(2)),
    matched: Object.freeze(hits.filter((h) => h.type === type).map((h) => h.phrase)),
    reason: null,
  });
}

/** Two intents mean the same thing when type and named entities agree. */
export const sameIntent = (a, b) =>
  a?.type === b?.type &&
  (a?.component ?? null) === (b?.component ?? null) &&
  (a?.specification ?? null) === (b?.specification ?? null) &&
  (a?.mission ?? null) === (b?.mission ?? null);

export default { INTENT, resolveIntent, extractEntities, sameIntent, detectSubject, UNRECORDED_SUBJECTS };
