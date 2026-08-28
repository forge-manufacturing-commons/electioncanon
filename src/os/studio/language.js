// ============================================================
// FORGE STUDIO — LANGUAGE DETECTION  (Phase 0)
//
// Deterministic, offline, no model. It reuses the existing SUPPORTED_LANGUAGES
// registry rather than declaring a second list, so adding a language later is a
// change to i18n.js and a marker set here — never a new AI implementation.
//
// HONEST ABOUT CONFIDENCE. Short input genuinely cannot be identified: "OK" is
// not Hausa or English, it is unknowable. Detection therefore returns an
// explicit `uncertain` flag rather than a confident guess, and the layer above
// is expected to fall back to the user's stored preference instead of inventing
// one.
//
// MIXED INPUT IS NORMAL, NOT AN ERROR. "Yanzu muna ready mu fara inspection na
// HUB-014" is how people actually speak in a Nigerian workshop. It is reported
// as `mixed: true` with a dominant language, and never rejected.
//
// PROTECTED TERMS ARE REMOVED BEFORE SCORING. Canon identifiers are
// language-neutral, and leaving them in would tilt every message towards English
// because they are written in Latin uppercase.
// ============================================================

import { SUPPORTED_LANGUAGES } from "../i18n.js";
import { protectTerms } from "./terms.js";

/**
 * Function words and orthographic markers. Function words are the reliable
 * signal — content words are borrowed freely across all of these languages.
 * `chars` are diacritics that appear in one language and not the others.
 */
const MARKERS = Object.freeze({
  ha: {
    words: ["ina", "yana", "yanzu", "kamata", "wannan", "muna", "mu", "yi", "me", "ya",
            "san", "abin", "rage", "kafin", "fara", "da", "ba", "akan", "matakin",
            "gaba", "shi", "ne", "halin", "bayan", "za", "samun", "ko", "kuma", "wani",
            "bukata", "kula", "gama", "turo", "mana", "bayyana", "min", "nawa", "cikin",
            "don", "sai", "amma", "ta", "na", "in", "an", "ka", "ki", "su", "sun",
            // PHASE 2. The question words a workshop participant actually opens with,
            // plus the manufacturing nouns Forge Canon questions are built from.
            // Without these, "Menene matsayin HUB-014?" scored ZERO on Hausa and was
            // answered in English — the single most visible failure this phase had to
            // fix, because a Hausa question answered in English is not a multilingual
            // system, it is an English system with a Hausa veneer.
            "menene", "mene", "matsayin", "matsayi", "wanene", "wace", "wane",
            "alhakin", "alhaki", "kera", "ake", "aka", "shin", "wuce", "umarni",
            "umarnin", "gudummawa", "amince", "yarda", "karɓi", "karbi", "karɓa",
            "karba", "injiniya", "tarihin", "tarihi", "faru", "saura", "manufa",
            "ƙarƙashin", "karkashin", "yake", "take", "aiki", "aikin", "ayyukan",
            "hannu", "tabbatar", "rubuta", "taimaka", "suka", "mun", "ke", "sa",
            "bita", "kungiya", "ƙungiya", "bincike", "jerin", "nemo"],
    chars: /[ƙɗɓƴ]/i,
  },
  yo: {
    words: ["kí", "ki", "ni", "mo", "yẹ", "ye", "ṣe", "se", "tókàn", "tokan", "lori",
            "ohun", "wa", "ti", "náà", "naa", "báwo", "bawo", "fún", "fun", "wọn",
            "kan", "jẹ", "je", "àwọn", "awon", "ṣàlàyé", "salaye", "pé", "pe", "ló", "lo",
            // PHASE 2 — the question and relationship words used by the intent layer.
            "ipò", "ipo", "níbo", "nibo", "mélòó", "meloo", "ìtàn", "itan", "àṣẹ", "ase",
            "kópa", "kopa", "ojuse", "ẹni", "eni", "ibi", "wọ́n", "ń", "ilé", "ile",
            "iṣẹ́", "ise", "ayẹwo", "kọja", "koja", "fọwọ́", "fowo", "gbà", "gba",
            "onímọ̀", "ẹ̀rọ", "ta"],
    // DISTINCTIVE ONLY: the sub-dot letters. Tone marks (à é ì ó ù …) were here and
    // are now SHARED with French — see SHARED_CHARS. Keeping them as distinctive
    // Yoruba evidence meant "Quel est l'état de HUB-014 ?" scored +2 on Yoruba for
    // the é in "état" and was answered in Yoruba.
    chars: /[ẹṣ]/,
  },
  ig: {
    words: ["gịnị", "gini", "ka", "kwesịrị", "kwesiri", "ime", "ọzọ", "ozo", "na",
            "ihe", "ndị", "ndi", "nke", "ya", "anyị", "anyi", "bụ", "bu", "maka",
            "kọwaa", "kowaa", "ọrụ", "oru", "were", "ugbu", "a", "gịnị", "dị", "di",
            // PHASE 2 — Igbo scored only on orthography before, which it SHARES with
            // Yoruba, so an Igbo question could be answered in Yoruba. See SHARED_CHARS.
            "kedu", "ọnọdụ", "onodu", "ebee", "onye", "ole", "mgbe", "akụkọ", "akuko",
            "iwu", "nabatara", "tinyere", "nyere", "aka", "fọdụrụ", "foduru", "emere",
            "mere", "ụlọ", "ulo", "nwe", "agafeela", "nyochaa", "gịnị", "depụta"],
    chars: /[ịụṅ]/i,
  },
  pcm: {
    words: ["wetin", "dey", "abeg", "na", "make", "don", "wan", "sabi", "fit", "no",
            "go", "una", "dem", "wey", "how", "e", "im"],
    chars: null,
  },
  en: {
    words: ["the", "what", "should", "do", "next", "with", "is", "are", "please",
            "explain", "tell", "this", "that", "we", "have", "has", "on", "for",
            "and", "to", "of", "in", "it", "can", "need", "now", "been", "was",
            "will", "would", "my", "our", "team", "ready", "state", "status"],
    chars: null,
  },
  fr: {
    words: ["le", "la", "les", "que", "quoi", "est", "pour", "nous", "avec", "dans",
            "sur", "une", "des", "il", "elle", "faire", "prochaine", "étape",
            // French now has to stand on VOCABULARY, because its accents are no
            // longer distinctive evidence — they are shared with Yoruba tone marks.
            "quel", "quelle", "quels", "quelles", "où", "combien", "atelier",
            "fabriqué", "fabrique", "état", "etat", "responsable", "historique",
            "quand", "ordonné", "accepté", "acceptés", "terminée", "mission",
            "organisation", "ceci", "reste", "expliquer", "explique", "cet", "cette"],
    chars: null,
  },
  urh: {
    words: ["vwo", "ọke", "kẹ", "rẹ", "na", "ọ", "avwanre", "wo"],
    chars: /[ẹọ]/,
  },
});

export const DETECTABLE = Object.freeze(Object.keys(MARKERS));

/**
 * Tokens that appear in more than one marker list — "in", "na", "a", "no", "e".
 *
 * These are the reason a naive detector calls pure English "mixed": "What state
 * is HUB-014 in?" contains `in`, which is also Hausa. Shared tokens are weak
 * evidence, so they score half and are EXCLUDED from the mixed determination.
 * Only a token unique to one language is allowed to argue that a second language
 * is genuinely present.
 */
export const SHARED_TOKENS = Object.freeze(new Set(
  Object.values(MARKERS)
    .flatMap((m) => m.words)
    .filter((w, i, all) => all.indexOf(w) !== i),
));

/**
 * Orthography shared between two languages, and therefore weak evidence.
 *
 * The same trap as SHARED_TOKENS, one level down. "ọ" (o with dot below) is used
 * by BOTH Yoruba and Igbo. Scoring it as a distinctive character for each meant
 * "Kedu ọnọdụ HUB-014?" — unambiguously Igbo — tied at 2 points each and was
 * decided by the order this file happens to declare its languages, which answered
 * an Igbo question in Yoruba.
 *
 * Truly distinctive marks stay in `chars` and score 2: ẹ and ṣ and tone marks are
 * Yoruba, ị and ụ and ṅ are Igbo. Shared marks score 1 — enough to say "one of
 * these two", never enough to choose between them on its own.
 */
const SHARED_CHARS = Object.freeze([
  { re: /ọ/i, langs: ["yo", "ig"] },
  // Accented vowels: Yoruba tone marks and French accents are the SAME characters.
  // This entry is why a French question is no longer read as Yoruba.
  { re: /[àèìòùáéíóúâêîôû]/i, langs: ["yo", "fr"] },
]);

const isUnique = (token, code) =>
  MARKERS[code].words.includes(token) && !SHARED_TOKENS.has(token);

const tokenise = (s) =>
  String(s ?? "").toLowerCase().replace(/[^\p{L}\p{M}'’\s]/gu, " ").split(/\s+/).filter(Boolean);

/**
 * Detect the language of a message.
 *
 * @returns {{ language, confidence, uncertain, mixed, scores, secondary, tokens }}
 *   `language` is the dominant code, or null when nothing scored.
 *   `uncertain` means the caller should prefer a stored preference.
 */
export function detectLanguage(text) {
  // Canon identifiers are language-neutral; scoring them would bias to English.
  const { masked } = protectTerms(text);
  const tokens = tokenise(masked);
  const scores = {};
  const unique = {};
  for (const code of DETECTABLE) { scores[code] = 0; unique[code] = 0; }

  for (const [code, m] of Object.entries(MARKERS)) {
    for (const tk of tokens) {
      if (!m.words.includes(tk)) continue;
      // A token shared with another language is weak evidence and may not argue
      // that a second language is present.
      if (isUnique(tk, code)) { scores[code] += 1; unique[code] += 1; }
      else scores[code] += 0.5;
    }
    // A distinctive diacritic is strong evidence — it appears in no other set.
    if (m.chars && m.chars.test(masked)) { scores[code] += 2; unique[code] += 2; }
  }

  // Orthography shared by two languages: half weight, and it may NOT count towards
  // `unique`, so it can never argue on its own that a second language is present.
  for (const { re, langs } of SHARED_CHARS) {
    if (!re.test(masked)) continue;
    for (const code of langs) if (code in scores) scores[code] += 1;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topCode, topScore] = ranked[0];
  const [secondCode, secondScore] = ranked[1] ?? [null, 0];

  if (topScore === 0) {
    return Object.freeze({
      language: null, confidence: 0, uncertain: true, mixed: false,
      scores: Object.freeze(scores), secondary: null, tokens: tokens.length,
      reason: "no language marker was recognised",
    });
  }

  const total = ranked.reduce((n, [, v]) => n + v, 0);
  const confidence = Number((topScore / total).toFixed(2));

  // MIXED means a second language contributed a token that belongs to it ALONE,
  // on top of a clear primary. "Yanzu muna ready mu fara inspection" is mixed
  // because `ready` is English-only inside Hausa. "What state is HUB-014 in?" is
  // NOT mixed, because its only Hausa-looking token (`in`) is shared.
  const mixed = unique[topCode] >= 2 && (unique[secondCode] ?? 0) >= 1;
  // Too little signal to be trusted on its own.
  const uncertain = topScore < 2 || (tokens.length <= 2 && topScore < 3);

  return Object.freeze({
    language: topCode,
    confidence,
    uncertain,
    mixed,
    scores: Object.freeze(scores),
    secondary: mixed ? secondCode : null,
    tokens: tokens.length,
    reason: uncertain ? "too few markers to be confident" : null,
  });
}

/**
 * Resolve which language to REPLY in.
 *
 * PRECEDENCE CHANGED IN PHASE 2.4, AND IT IS A USER-VISIBLE CHANGE.
 *
 *   was:  explicit request  >  confident detection  >  stored preference
 *   now:  explicit request  >  GLOBAL PREFERENCE    >  confident detection
 *
 * The old order let DETECTION own the response language, which contradicts the
 * architecture two ways. Forge Studio is a room inside ForgeOS, and ForgeOS owns
 * the language: if a participant has set the OS to Hausa, typing one English
 * sentence should not answer them in English. And detection's job is to UNDERSTAND
 * what was said, never to decide what the application speaks — a detector that
 * chooses the response language is a second language preference wearing a
 * disguise, recomputed from scratch on every message.
 *
 * THE TRADE-OFF IS REAL AND WORTH NAMING. A participant who has never touched the
 * language control sits on the default `en`, so typing Hausa now yields an English
 * answer where it previously yielded Hausa. That is the correct reading of "ForgeOS
 * owns the language" — the OS setting is a declaration, not a guess — but it does
 * mean the multilingual experience begins with one deliberate act. Detection still
 * runs, is still reported for the internals, and still drives intent resolution;
 * it simply no longer overrides a choice the participant made.
 *
 * `explicit` remains first, and deliberately affects THIS TURN ONLY. "Answer this
 * one in English" is answered in English while the global preference stays exactly
 * where it was — nothing here writes any state.
 */
export function resolveResponseLanguage({ detected, preferred = "en", explicit = null } = {}) {
  const supported = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
  if (explicit && supported.has(explicit)) {
    return { language: explicit, because: "explicitly requested for this turn" };
  }
  if (supported.has(preferred)) {
    return {
      language: preferred,
      because: detected?.language && detected.language !== preferred
        ? `global ForgeOS language (${detected.language} detected in the question)`
        : "global ForgeOS language",
    };
  }
  // No usable preference at all — fall back to what was actually understood.
  if (detected?.language && !detected.uncertain && supported.has(detected.language)) {
    return { language: detected.language, because: "no global preference — used the detected language" };
  }
  return { language: "en", because: "no global preference and no confident detection" };
}

/** "Explain it in English" / "Ka yi min bayani da Turanci" -> an explicit switch. */
const EXPLICIT = Object.freeze([
  [/\b(in|da)\s+(english|turanci)\b/i, "en"],
  [/\b(in|da)\s+(hausa)\b/i, "ha"],
  [/\b(in|ni|ede)\s+(yoruba|yorùbá)\b/i, "yo"],
  [/\b(in|na|asụsụ)\s+(igbo)\b/i, "ig"],
  [/\b(in|for)\s+(pidgin)\b/i, "pcm"],
  [/\b(in|en)\s+(french|français|francais)\b/i, "fr"],
]);

export function explicitLanguageRequest(text) {
  for (const [re, code] of EXPLICIT) if (re.test(String(text ?? ""))) return code;
  return null;
}

export default { detectLanguage, resolveResponseLanguage, explicitLanguageRequest, DETECTABLE };
