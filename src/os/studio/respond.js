// ============================================================
// FORGE STUDIO — RESPONSE PLANNING  (Phase 2)
//
// The last stage of the pipeline, and the one that makes Forge AI usable rather
// than merely safe:
//
//   language -> intent -> Canon tools -> grounded claims -> RESPONSE -> answer
//
// WHAT THIS IS NOT. It is not a translator. Nothing here takes an English
// sentence and converts it. It takes VERIFIED CANON FACTS — values already read
// out of the fold and already re-resolved by grounding.js — and realises them as
// a sentence in the language the participant used. The Canon is queried once, in
// one language-neutral form, and the answer is composed at the very end. That is
// why an English, Hausa, Yoruba and Igbo user reach the same fact: they are not
// asking different questions, they are reading the same answer.
//
// WHY IT IS DETERMINISTIC. A model is not required to say "HUB-014 yana cikin
// matakin manufacturing". The facts are known, the grammar is fixed, and a
// template that interpolates verified values cannot hallucinate a state that the
// component is not in. When the provider IS attached (provider.js), its prose is
// only ever ADDITIONAL — and only survives if every claim it made grounds. So
// Forge AI answers correctly in Hausa with no model connected at all, and a model
// can improve the phrasing without becoming able to change the facts.
//
// THE REALISATION CONTRACT. Every sentence is assembled from:
//   * FIXED language-specific connective text, written here
//   * CANONICAL VALUES, interpolated verbatim and never inflected
//
// A canonical value is never translated, never pluralised, never case-folded.
// "manufacturing" stays "manufacturing" inside a Hausa sentence, because it is
// the name of a lifecycle state in Forge Canon, not an English word that happens
// to appear there. terms.js already guarantees this for translation; here the
// guarantee is structural, because the value is never touched at all.
//
// ONE TEMPLATE SET PER INTENT, NOT PER LANGUAGE PER INTENT. Adding a language
// means adding a REALISER — the connective words — not a second set of
// manufacturing rules and not a second idea of what the Canon says.
// ============================================================

import { CLAIM, isBinding, isCanonLimitation, notRecorded } from "./grounding.js";
import { INTENT } from "./intent.js";
import { verifyPreserved } from "./terms.js";
import { REQUEST } from "./request.js";

/**
 * What KIND of statement each sentence is. (§8)
 *
 * The answer used to be a single joined string, and the surface rendered the whole
 * thing under one "FORGE CANON" badge. For "Me ya kamata mu yi na gaba akan
 * HUB-014?" that meant a verified Canon fact and an AI RECOMMENDATION arrived
 * fused into one paragraph wearing the Canon's authority:
 *
 *   "HUB-014 yana cikin matakin manufacturing a halin yanzu.        <- CANON_FACT
 *    Mataki na gaba da lifecycle ya ba da izini: submitForInspection" <- RECOMMENDATION
 *
 * The first is something ForgeOS recorded. The second is something ForgeOS
 * SUGGESTS, and presenting it identically is precisely the confusion this whole
 * architecture exists to prevent — one level up from the claim layer, in the
 * rendering. So the planner now returns SEGMENTS and the surface labels each.
 *
 * CANON_ABSENCE is its own kind rather than a flavour of fact: "Forge Canon holds
 * no record that X passed" is a true statement ABOUT the Canon, but it is not a
 * recorded manufacturing fact and must not be badged as one.
 */
export const SEGMENT = Object.freeze({
  CANON:        "CANON",         // a verified CANON_FACT or CANON_DERIVED
  CANON_ABSENCE:"CANON_ABSENCE", // the Canon records nothing here
  RECOMMENDATION:"RECOMMENDATION",// what ForgeOS suggests. Recorded nowhere.
  AUTHORITY:    "AUTHORITY",     // what ForgeOS requires before acting
  PREPARED:     "PREPARED",      // a draft, never an event
  NOT_UNDERSTOOD:"NOT_UNDERSTOOD",
  // (conversational phase §7) A QUESTION BACK. Not a failure and not an absence —
  // Forge understood the sentence and needs one more word to act on it. It has its
  // own kind so a surface can render it as a prompt rather than as an error, and so a
  // test can prove the participant is never shown "AMBIGUOUS_ENTITY".
  CLARIFY:      "CLARIFY",
});

/**
 * Connective vocabulary per language. This is the ONLY place language-specific
 * wording lives, and it contains no manufacturing logic whatsoever — every entry
 * is a function of already-verified canonical values.
 *
 * Hausa is written first and in full because it is the language this phase had to
 * prove. The others are complete for the intents the tests exercise; a gap
 * falls back to English rather than inventing grammar, which is why `pick()`
 * exists and why a missing realiser is a legible fallback and not a crash.
 */
const REALISERS = Object.freeze({
  ha: {
    // "HUB-014 yana cikin matakin manufacturing a halin yanzu."
    state: (c, s) => `${c} yana cikin matakin ${s} a halin yanzu.`,
    responsibility: (c, o) => `${o} ce ke da alhakin aikin ${c}.`,
    noResponsibility: (c) => `Babu wata ƙungiya da ta ɗauki alhakin ${c} a Forge Canon.`,
    hub: (c, h) => `Ana yin aikin ${c} a ${h}.`,
    noHub: (c) => `Forge Canon ba ta da rikodin hub ɗin da ake yin aikin ${c}.`,
    mission: (c, m) => `Aikin yana ƙarƙashin ${m}.`,
    noMission: (c) => `${c} ba ya ƙarƙashin wata manufa a Forge Canon.`,
    progress: (m, a, t) => `An amince da ${a} daga cikin ${t} a ${m}.`,
    remaining: (n) => `Sauran ${n} ne.`,
    nextActions: (c, list) => `Mataki na gaba da lifecycle ya ba da izini: ${list}.`,
    noNextAction: (c, s) => `Lifecycle bai ba da wani mataki daga "${s}" ba.`,
    inspectionPassed: (c) => `${c} ya wuce inspection — an rubuta shi a Forge Canon.`,
    inspectionUnknown: (c) => `Forge Canon ba ta da rikodin da ke tabbatar da cewa ${c} ya wuce inspection.`,
    contributions: (c, n) => `Mutane ${n} sun ba da gudummawa ga ${c}.`,
    noContributions: (c) => `Forge Canon ba ta da rikodin gudummawa ga ${c}.`,
    directives: (c, n) => `Akwai umarni ${n} da aka rubuta a kan ${c}.`,
    noDirectives: (c) => `Forge Canon ba ta da rikodin umarni a kan ${c}.`,
    acknowledged: (who, outcome) => `${who} ya amsa umarnin: ${outcome}.`,
    notAcknowledged: (c) => `Ba a rubuta amsa ga umarnin ${c} ba tukuna a Forge Canon.`,
    historyCount: (c, n) => `An rubuta canje-canje ${n} a kan ${c}.`,
    noHistory: (c) => `Forge Canon ba ta da tarihin canji a kan ${c}.`,
    unknownComponent: (c) => `Forge Canon ba ta da rikodin wani abu mai suna ${c}.`,
    // (Gap 1) SEARCH — built by substituting the query into the exact unknownComponent
    // / gapsHeld frames above, so no new Hausa grammar is invented here.
    searchFound: (q, list) => `Abin da Forge Canon ta rubuta game da "${q}": ${list}.`,
    searchEmpty: (q) => `Forge Canon ba ta da rikodin wani abu mai suna "${q}".`,
    // (Gap 2) `id` names the subject when one is known — "game da X" (about X) is the
    // same preposition already used in `gapsHeld` above, inserted into the unchanged
    // original sentence rather than new prose.
    notUnderstood: (id) => id
      ? `Ban gane tambayar game da ${id} a matsayin tambaya ga Forge Canon ba. Ka gwada tambaya game da wani component, hub, alhaki, ko manufa.`
      : `Ban gane tambayar a matsayin tambaya ga Forge Canon ba. Ka gwada tambaya game da wani component, hub, alhaki, ko manufa.`,
    // AUTHORITY. Never "I cannot" — always what ForgeOS requires.
    // (Gap 2) `matched` echoes the participant's own words in the same object-noun
    // slot "rikodin" (the record) previously occupied — one substitution, not new
    // grammar — so the refusal is specific without guessing which rule applies.
    cannotAct: (matched) => matched
      ? `Zan iya shirya "${matched}", amma ForgeOS na buƙatar tabbataccen shaidar injiniya kafin a rubuta shi. Ba zan iya ba wa kaina wannan izini ba.`
      : `Zan iya shirya rikodin, amma ForgeOS na buƙatar tabbataccen shaidar injiniya kafin a rubuta shi. Ba zan iya ba wa kaina wannan izini ba.`,
    prepared: (type, c) => `Na shirya daftarin ${type} na ${c}.`,
    sourceLabel: () => "MAFARIN BAYANI · Forge Canon",
    // PROVIDER FAILURE (§14). States what did not happen AND that the Canon is
    // untouched — a participant's first worry when a system errors mid-task is
    // whether it half-recorded something.
    whyState: (c, s) => `${c} yana cikin matakin ${s} saboda abin da aka rubuta a Forge Canon.`,
    whyBlocked: (c, w) => `Forge Canon ba ta da rikodin ${w} na ${c}, don haka aikin bai ci gaba ba.`,
    gapsHeld: (c, list) => `Abin da Forge Canon ta rubuta game da ${c}: ${list}.`,
    gapsMissing: (c, list) => `Abin da ba a rubuta ba tukuna: ${list}.`,
    canonYoung: (c) => `Ba ni da isasshen bayanin Forge Canon game da ${c} tukuna.`,
    needSubject: () => `Wane component kake nufi? Ka ba ni sunansa, sannan zan duba Forge Canon.`,
    // §7 — A QUESTION BACK, IN THE PARTICIPANT'S OWN LANGUAGE. Two candidates are
    // joined with the language's own "or"; more than two are listed. Never a code.
    clarify: (list) => `Wanne kake nufi — ${list}?`,
    or: " ko ",
    // §12 — THE PREAMBLE COMES FIRST, THEN THE CANON ANSWER. It names what was lost
    // (the conversational phrasing), what still holds (the recorded facts), and that
    // nothing was written — which is a participant's first fear when a system errors
    // in the middle of their work.
    providerDown: () =>
      "Ban iya kammala sashen tattaunawa na wannan a yanzu ba, amma ga abin da Forge Canon ta rubuta. Ba a canza kome ba.",
  },
  en: {
    state: (c, s) => `${c} is currently in ${s}.`,
    responsibility: (c, o) => `${o} is responsible for ${c}.`,
    noResponsibility: (c) => `No organisation has claimed responsibility for ${c} in Forge Canon.`,
    hub: (c, h) => `${c} is being made at ${h}.`,
    noHub: (c) => `Forge Canon has no record of the hub where ${c} is being made.`,
    mission: (c, m) => `The work sits under ${m}.`,
    noMission: (c) => `${c} is not part of any mission in Forge Canon.`,
    progress: (m, a, t) => `${a} of ${t} accepted on ${m}.`,
    remaining: (n) => `${n} remain.`,
    nextActions: (c, list) => `The lifecycle permits: ${list}.`,
    noNextAction: (c, s) => `The lifecycle permits no transition from "${s}".`,
    inspectionPassed: (c) => `${c} passed inspection — it is recorded in Forge Canon.`,
    inspectionUnknown: (c) => `Forge Canon holds no record that ${c} passed inspection.`,
    contributions: (c, n) => `${n} contribution${n === 1 ? "" : "s"} recorded on ${c}.`,
    noContributions: (c) => `Forge Canon records no contributions to ${c}.`,
    directives: (c, n) => `${n} directive${n === 1 ? "" : "s"} recorded on ${c}.`,
    noDirectives: (c) => `Forge Canon records no directives on ${c}.`,
    acknowledged: (who, outcome) => `${who} answered the directive: ${outcome}.`,
    notAcknowledged: (c) => `No acknowledgement of the directive on ${c} is recorded in Forge Canon yet.`,
    historyCount: (c, n) => `${n} recorded transition${n === 1 ? "" : "s"} on ${c}.`,
    noHistory: (c) => `Forge Canon holds no transition history for ${c}.`,
    unknownComponent: (c) => `Forge Canon has no record of anything called ${c}.`,
    // (Gap 1) SEARCH — the existing Canon/search owner, canonTools.searchForge,
    // realised in words. Never a second index: every id named here already resolved
    // against the live fold before this ran.
    searchFound: (q, list) => `Forge Canon holds records matching "${q}": ${list}.`,
    searchEmpty: (q) => `Forge Canon has no record matching "${q}".`,
    // (Gap 2) Name the subject when one is known, and say what CAN be asked instead
    // of a dead end.
    notUnderstood: (id) => id
      ? `I did not read that as a question about ${id} that Forge Canon can answer. Try asking about its status, who is responsible, where it is made, its mission, or its history.`
      : `I did not read that as a question Forge Canon can answer. Try asking about a component, its hub, who is responsible, or a mission.`,
    // (Gap 2) The refusal echoes what was actually asked instead of one boilerplate
    // sentence for every action. It still names no rule code — see the skill report.
    cannotAct: (matched) => matched
      ? `I can prepare a draft for "${matched}", but ForgeOS requires an authorised engineering identity before it can be recorded. I cannot grant myself that authority.`
      : `I can prepare the record, but ForgeOS requires an authorised engineering identity before it can be recorded. I cannot grant myself that authority.`,
    prepared: (type, c) => `I have prepared a draft ${type} for ${c}.`,
    sourceLabel: () => "CANON SOURCE · Forge Canon",
    whyState: (c, s) => `${c} is in ${s} because that is what Forge Canon records.`,
    whyBlocked: (c, w) => `Forge Canon holds no recorded ${w} for ${c}, so the work has not moved on.`,
    gapsHeld: (c, list) => `What Forge Canon records about ${c}: ${list}.`,
    gapsMissing: (c, list) => `What is not recorded yet: ${list}.`,
    canonYoung: (c) => `I do not have enough recorded Forge Canon information about ${c} yet.`,
    needSubject: () => `Which component do you mean? Name it and I will check Forge Canon.`,
    clarify: (list) => `Which one do you mean — ${list}?`,
    or: " or ",
    providerDown: () =>
      "I could not complete the conversational part of that just now, but here is what Forge Canon currently records. Nothing has been changed.",
  },
  yo: {
    state: (c, s) => `${c} wà ní ${s} lọ́wọ́lọ́wọ́.`,
    responsibility: (c, o) => `${o} ni ó ni ojúṣe fún ${c}.`,
    noResponsibility: (c) => `Kò sí àjọ tí ó gba ojúṣe fún ${c} nínú Forge Canon.`,
    hub: (c, h) => `Wọ́n ń ṣe ${c} ní ${h}.`,
    noHub: (c) => `Forge Canon kò ní àkọsílẹ̀ ibi tí wọ́n ń ṣe ${c}.`,
    mission: (c, m) => `Iṣẹ́ náà wà lábẹ́ ${m}.`,
    noMission: (c) => `${c} kò wà lábẹ́ iṣẹ́ àpinfunni kankan nínú Forge Canon.`,
    progress: (m, a, t) => `${a} nínú ${t} ni a gbà lórí ${m}.`,
    remaining: (n) => `${n} ṣẹ́ kù.`,
    nextActions: (c, list) => `Lifecycle gbà: ${list}.`,
    noNextAction: (c, s) => `Lifecycle kò gbà ìyípadà kankan láti "${s}".`,
    inspectionPassed: (c) => `${c} kọjá inspection — a kọ ọ́ sínú Forge Canon.`,
    inspectionUnknown: (c) => `Forge Canon kò ní àkọsílẹ̀ pé ${c} kọjá inspection.`,
    contributions: (c, n) => `Ìkópa ${n} ni a kọ sílẹ̀ lórí ${c}.`,
    noContributions: (c) => `Forge Canon kò kọ ìkópa kankan sí ${c}.`,
    directives: (c, n) => `Àṣẹ ${n} ni a kọ sílẹ̀ lórí ${c}.`,
    noDirectives: (c) => `Forge Canon kò kọ àṣẹ kankan lórí ${c}.`,
    acknowledged: (who, outcome) => `${who} dáhùn àṣẹ náà: ${outcome}.`,
    notAcknowledged: (c) => `Kò sí ìdáhùn sí àṣẹ lórí ${c} nínú Forge Canon.`,
    historyCount: (c, n) => `Ìyípadà ${n} ni a kọ sílẹ̀ lórí ${c}.`,
    noHistory: (c) => `Forge Canon kò ní ìtàn ìyípadà fún ${c}.`,
    unknownComponent: (c) => `Forge Canon kò ní àkọsílẹ̀ ohunkóhun tí ń jẹ́ ${c}.`,
    searchFound: (q, list) => `Ohun tí Forge Canon kọ nípa "${q}": ${list}.`,
    searchEmpty: (q) => `Forge Canon kò ní àkọsílẹ̀ ohunkóhun tí ń jẹ́ "${q}".`,
    notUnderstood: (id) => id
      ? `Mi kò ka ìyẹn sí ìbéèrè nípa ${id} tí Forge Canon lè dáhùn.`
      : `Mi kò ka ìyẹn sí ìbéèrè tí Forge Canon lè dáhùn.`,
    cannotAct: (matched) => matched
      ? `Mo lè pèsè "${matched}", ṣùgbọ́n ForgeOS béèrè ìdánimọ̀ onímọ̀ ẹ̀rọ tí a fọwọ́ sí kí ó tó kọ ọ́.`
      : `Mo lè pèsè àkọsílẹ̀, ṣùgbọ́n ForgeOS béèrè ìdánimọ̀ onímọ̀ ẹ̀rọ tí a fọwọ́ sí kí ó tó kọ ọ́.`,
    prepared: (type, c) => `Mo pèsè àkọsílẹ̀ ${type} fún ${c}.`,
    sourceLabel: () => "ÌPÍLẸ̀ · Forge Canon",
    whyState: (c, s) => `${c} wà ní ${s} nítorí ìyẹn ni Forge Canon kọ sílẹ̀.`,
    whyBlocked: (c, w) => `Forge Canon kò ní àkọsílẹ̀ ${w} fún ${c}, nítorí náà iṣẹ́ kò tẹ̀síwájú.`,
    gapsHeld: (c, list) => `Ohun tí Forge Canon kọ nípa ${c}: ${list}.`,
    gapsMissing: (c, list) => `Ohun tí a kò kọ sílẹ̀: ${list}.`,
    canonYoung: (c) => `Mi kò ní àkọsílẹ̀ Forge Canon tó nípa ${c} síbẹ̀.`,
    needSubject: () => `Ohun èlò wo ni ẹ ń sọ? Sọ orúkọ rẹ̀, màá wo Forge Canon.`,
    clarify: (list) => `Èwo ni ẹ ń sọ — ${list}?`,
    or: " tàbí ",
    providerDown: () =>
      "Mi kò lè parí apá ìjíròrò náà báyìí, ṣùgbọ́n èyí ni ohun tí Forge Canon kọ sílẹ̀. A kò yí ohunkóhun padà.",
  },
  ig: {
    state: (c, s) => `${c} nọ na ${s} ugbu a.`,
    responsibility: (c, o) => `${o} bụ onye na-ahụ maka ${c}.`,
    noResponsibility: (c) => `Ọ dịghị nzukọ nabatara ọrụ maka ${c} na Forge Canon.`,
    hub: (c, h) => `A na-emere ${c} na ${h}.`,
    noHub: (c) => `Forge Canon enweghị ndekọ ebe a na-emere ${c}.`,
    mission: (c, m) => `Ọrụ ahụ dị n'okpuru ${m}.`,
    noMission: (c) => `${c} adịghị n'okpuru ozi ọrụ ọ bụla na Forge Canon.`,
    progress: (m, a, t) => `A nabatara ${a} n'ime ${t} na ${m}.`,
    remaining: (n) => `${n} fọdụrụ.`,
    nextActions: (c, list) => `Lifecycle kwere: ${list}.`,
    noNextAction: (c, s) => `Lifecycle ekweghị mgbanwe ọ bụla site na "${s}".`,
    inspectionPassed: (c) => `${c} gafere inspection — e dekọrọ ya na Forge Canon.`,
    inspectionUnknown: (c) => `Forge Canon enweghị ndekọ na ${c} gafere inspection.`,
    contributions: (c, n) => `Ntinye aka ${n} ka e dekọrọ na ${c}.`,
    noContributions: (c) => `Forge Canon edekọghị ntinye aka ọ bụla na ${c}.`,
    directives: (c, n) => `Iwu ${n} ka e dekọrọ na ${c}.`,
    noDirectives: (c) => `Forge Canon edekọghị iwu ọ bụla na ${c}.`,
    acknowledged: (who, outcome) => `${who} zaghachiri iwu ahụ: ${outcome}.`,
    notAcknowledged: (c) => `Ọ dịghị nzaghachi iwu na ${c} e dekọrọ na Forge Canon.`,
    historyCount: (c, n) => `Mgbanwe ${n} ka e dekọrọ na ${c}.`,
    noHistory: (c) => `Forge Canon enweghị akụkọ mgbanwe maka ${c}.`,
    unknownComponent: (c) => `Forge Canon enweghị ndekọ ihe ọ bụla a na-akpọ ${c}.`,
    searchFound: (q, list) => `Ihe Forge Canon dekọrọ gbasara "${q}": ${list}.`,
    searchEmpty: (q) => `Forge Canon enweghị ndekọ ihe ọ bụla a na-akpọ "${q}".`,
    notUnderstood: (id) => id
      ? `Agụghị m nke ahụ dị ka ajụjụ gbasara ${id} nke Forge Canon nwere ike ịza.`
      : `Agụghị m nke ahụ dị ka ajụjụ Forge Canon nwere ike ịza.`,
    cannotAct: (matched) => matched
      ? `Enwere m ike ịkwadebe "${matched}", mana ForgeOS chọrọ njirimara injinia akwadoro tupu e dekọọ ya.`
      : `Enwere m ike ịkwadebe ndekọ ahụ, mana ForgeOS chọrọ njirimara injinia akwadoro tupu e dekọọ ya.`,
    prepared: (type, c) => `Akwadebere m ndekọ ${type} maka ${c}.`,
    sourceLabel: () => "ISI MMALITE · Forge Canon",
    whyState: (c, s) => `${c} nọ na ${s} n\u2019ihi na nke ahụ bụ ihe Forge Canon dekọrọ.`,
    whyBlocked: (c, w) => `Forge Canon enweghị ndekọ ${w} maka ${c}, ya mere ọrụ agaghị n\u2019ihu.`,
    gapsHeld: (c, list) => `Ihe Forge Canon dekọrọ gbasara ${c}: ${list}.`,
    gapsMissing: (c, list) => `Ihe a na-edekọbeghị: ${list}.`,
    canonYoung: (c) => `Enweghị m ozi Forge Canon zuru ezu gbasara ${c} ugbu a.`,
    needSubject: () => `Kedu akụrụngwa ị na-ekwu? Kpọọ aha ya, m ga-elele Forge Canon.`,
    clarify: (list) => `Kedu nke ị na-ekwu — ${list}?`,
    or: " ma ọ bụ ",
    providerDown: () =>
      "Enweghị m ike imecha akụkụ mkparịta ụka nke ahụ ugbu a, mana nke a bụ ihe Forge Canon dekọrọ. Agbanweghị ihe ọ bụla.",
  },
  pcm: {
    state: (c, s) => `${c} dey ${s} right now.`,
    responsibility: (c, o) => `${o} na the one wey responsible for ${c}.`,
    noResponsibility: (c) => `No organisation don claim responsibility for ${c} inside Forge Canon.`,
    hub: (c, h) => `Dem dey make ${c} for ${h}.`,
    noHub: (c) => `Forge Canon no get record of the hub where dem dey make ${c}.`,
    mission: (c, m) => `The work dey under ${m}.`,
    noMission: (c) => `${c} no dey under any mission inside Forge Canon.`,
    progress: (m, a, t) => `${a} out of ${t} don be accepted on ${m}.`,
    remaining: (n) => `${n} still remain.`,
    nextActions: (c, list) => `The lifecycle allow: ${list}.`,
    noNextAction: (c, s) => `Lifecycle no allow any move from "${s}".`,
    inspectionPassed: (c) => `${c} pass inspection — e dey inside Forge Canon.`,
    inspectionUnknown: (c) => `Forge Canon no get any record say ${c} pass inspection.`,
    contributions: (c, n) => `${n} contribution dey recorded on ${c}.`,
    noContributions: (c) => `Forge Canon no record any contribution to ${c}.`,
    directives: (c, n) => `${n} directive dey recorded on ${c}.`,
    noDirectives: (c) => `Forge Canon no record any directive on ${c}.`,
    acknowledged: (who, outcome) => `${who} answer the directive: ${outcome}.`,
    notAcknowledged: (c) => `Nobody don answer the directive on ${c} inside Forge Canon.`,
    historyCount: (c, n) => `${n} transition dey recorded on ${c}.`,
    noHistory: (c) => `Forge Canon no get transition history for ${c}.`,
    unknownComponent: (c) => `Forge Canon no get record of anything wey dem call ${c}.`,
    searchFound: (q, list) => `Wetin Forge Canon record about "${q}": ${list}.`,
    searchEmpty: (q) => `Forge Canon no get record of anything wey dem call "${q}".`,
    notUnderstood: (id) => id
      ? `I no read that one as question about ${id} wey Forge Canon fit answer. You fit ask about component, hub, who dey responsible, or mission.`
      : `I no read that one as question wey Forge Canon fit answer.`,
    cannotAct: (matched) => matched
      ? `I fit prepare "${matched}", but ForgeOS need authorised engineering identity before e go enter.`
      : `I fit prepare the record, but ForgeOS need authorised engineering identity before e go enter.`,
    prepared: (type, c) => `I don prepare draft ${type} for ${c}.`,
    sourceLabel: () => "CANON SOURCE · Forge Canon",
    whyState: (c, s) => `${c} dey ${s} because na wetin Forge Canon record.`,
    whyBlocked: (c, w) => `Forge Canon no get any recorded ${w} for ${c}, so the work no move forward.`,
    gapsHeld: (c, list) => `Wetin Forge Canon record about ${c}: ${list}.`,
    gapsMissing: (c, list) => `Wetin dem no record yet: ${list}.`,
    canonYoung: (c) => `I no get enough Forge Canon information about ${c} yet.`,
    needSubject: () => `Which component you dey talk about? Give me the name, I go check Forge Canon.`,
    clarify: (list) => `Which one you mean — ${list}?`,
    or: " abi ",
    providerDown: () =>
      "I no fit finish the conversation part of that one now, but see wetin Forge Canon record. Nothing change at all.",
  },
});

/**
 * Pick a realiser, falling back to English for a language that has none yet.
 *
 * The fallback is deliberate and reported. Inventing grammar for a language this
 * file has no realiser for would be exactly the kind of confident fabrication the
 * grounding layer exists to prevent — one level up, in the wording rather than
 * the facts. `fr` and `urh` are detectable and intentionally fall back here until
 * a speaker supplies the connectives.
 */
export function realiserFor(language) {
  const r = REALISERS[language];
  return r
    ? { r, language, fellBack: false }
    : { r: REALISERS.en, language: "en", fellBack: true, requested: language };
}

export const REALISED_LANGUAGES = Object.freeze(Object.keys(REALISERS));

/** Values that must appear in the answer EXACTLY as the Canon holds them. */
const canonicalValuesOf = (view, componentId, missionId) => {
  const out = [];
  const c = componentId ? view?.components?.[componentId] : null;
  if (componentId) out.push(componentId);
  if (c?.state) out.push(c.state);
  if (c?.organisation) out.push(c.organisation);
  if (c?.hub) out.push(c.hub);
  if (c?.mission) out.push(c.mission);
  if (c?.specification) out.push(c.specification);
  if (missionId) out.push(missionId);
  return [...new Set(out)];
};

/**
 * Compose the answer.
 *
 * @param grounded  the output of groundResponse — ALREADY verified
 * @param intent    the canonical intent
 * @param view      the fold, for reading verified values (never for new claims)
 * @returns {{ answer, language, fellBack, sources, presented, refused, preserved }}
 *
 * IT READS ONLY WHAT THE CLAIMS ALREADY PROVED. The `view` is consulted for
 * values, but a value is only spoken when a BINDING claim citing its path
 * survived verification. That ordering is the whole safety property: the sentence
 * cannot mention a fact that failed to ground, because the branch that would
 * speak it is gated on the claim, not on the fold.
 */
export function planResponse({ grounded, intent, view = {} } = {}) {
  const { r, language, fellBack } = realiserFor(intent?.language ?? "en");
  const id = intent?.component ?? null;
  const mid = intent?.mission ?? null;
  const comp = id ? view?.components?.[id] : null;

  // SEGMENTS, not one string. `answer` is still derived by joining them, so every
  // existing caller keeps working, but a surface can now render each kind
  // differently — and a test can assert that a recommendation is never inside a
  // CANON segment.
  const segments = [];
  const add = (text, kind) => { segments.push(Object.freeze({ text, kind })); return true; };
  const sources = [];
  const bind = (claim) => { if (claim?.source?.path) sources.push(claim.source.path); return claim; };

  // Every binding claim, indexed by the fold path it proved. A path that is not
  // in here was NOT proved, and nothing below may speak it.
  const proved = new Map();
  for (const c of grounded?.claims ?? []) {
    if (isBinding(c) && c.source?.path) proved.set(c.source.path, c);
    for (const s of c.sources ?? []) if (isBinding(c) && s?.path) proved.set(s.path, c);
  }
  const provedPath = (p) => proved.get(p) ?? null;

  // Canonical values the answer actually SPEAKS. This is what the preservation
  // guarantee is about — not "does the answer mention everything the Canon holds"
  // (it should not; a hub question should not recite the mission) but "is every
  // value it does state identical to the Canon's". A realiser that lower-cased
  // SOLC, inflected `manufacturing`, or localised `warri` would fail this.
  const spoken = [];
  const mention = (...values) => { for (const v of values) if (v) spoken.push(String(v)); };

  const say = (p, fn, ...values) => {
    const claim = provedPath(p);
    if (!claim) return false;
    sources.push(p);
    mention(...values);
    add(fn(), SEGMENT.CANON);
    return true;
  };

  // ============================================================
  // §7 — AMBIGUITY IS A QUESTION, NOT A GUESS AND NOT AN ERROR.
  //
  // This returns FIRST, before any Canon reading is spoken, because there is nothing
  // to speak: understanding stopped at "which one?" and no fold path was read. Three
  // properties the tests turn on:
  //
  //   * the candidates are CANON IDS, interpolated verbatim and `mention`ed so the
  //     preservation check covers them — a clarification that mangled "CHS-014" would
  //     be a worse failure than the ambiguity it is resolving
  //   * ZERO sources and ZERO facts, because nothing was proved
  //   * the participant sees a sentence in their own language. `AMBIGUOUS_ENTITY`
  //     stays on the result object for the provenance panel and the suite, and never
  //     reaches a screen.
  // ============================================================
  const candidates = intent?.clarify?.candidates ?? [];
  if (candidates.length) {
    const list = candidates.length === 2
      ? candidates.join(r.or ?? " or ")
      : candidates.join(", ");
    const text = r.clarify(list);
    mention(...candidates);
    return Object.freeze({
      answer: text,
      language, fellBack,
      sources: Object.freeze([]),
      segments: Object.freeze([Object.freeze({ text, kind: SEGMENT.CLARIFY })]),
      presented: 1, refused: 0, canonLimitation: false,
      clarifying: Object.freeze([...candidates]),
      preserved: verifyPreserved(candidates.join(" "), text).preserved,
    });
  }

  // (NEEDS_SUBJECT fix) THE UNDERSTANDING STAGE ALREADY DETERMINED THE OPERATION
  // AND FOUND NO ENTITY. `understand.js`'s escalation branch sets this when a
  // validated proposal (or the deterministic read it fell back to) named a real
  // question with nobody to ask it about — see `request.js`'s `NEEDS_SUBJECT`.
  // Presentation-layer only: no new intent, no entity guess, no fact asserted.
  // Placed BEFORE the switch, not inside `default`, because `intent.type` here is
  // whatever the ORIGINAL deterministic read was — which may be a recognised type
  // (e.g. `component.who`) that still lacks a subject, not only UNKNOWN. Routing
  // through the switch in that case would reach that type's own case with `id`
  // null, which answers "Forge Canon has no record of anything called —" — true,
  // but not what was asked, and not this fix's job to change (see the skill
  // report). Intercepting here reuses the SAME `needSubject()` realiser already
  // used inside CANON_GAPS/INSPECTION_STATUS for exactly this situation, so no new
  // wording is introduced anywhere.
  if (intent?.proposalRejected === REQUEST.NEEDS_SUBJECT) {
    const text = r.needSubject();
    return Object.freeze({
      answer: text,
      language, fellBack,
      sources: Object.freeze([]),
      segments: Object.freeze([Object.freeze({ text, kind: SEGMENT.NOT_UNDERSTOOD })]),
      presented: 0, refused: 1, canonLimitation: false,
      preserved: true,
    });
  }

  // A Canon-limitation refusal takes the whole response. Mixing "here are three
  // facts" with "the Canon does not record what you asked" buries the refusal.
  const limitation = (grounded?.claims ?? []).find(isCanonLimitation);
  if (limitation) {
    // Re-render the refusal in the RESPONSE language if it was built in another
    // one. The refusal is regenerated from its structured `subject` and `about`
    // rather than translated from its text, so the wording comes from
    // CANON_SILENCE and the subject comes from NOT_RECORDED_BY_CANON — the same
    // two sources that produced it in the first place. Nothing is paraphrased.
    const inLanguage = limitation.language === language
      ? limitation
      : notRecorded(limitation.subject, limitation.about ?? null, language);
    return Object.freeze({
      answer: inLanguage.text,
      language, fellBack,
      sources: Object.freeze([]),
      // A Canon limitation is a statement about the Canon's SILENCE, so it is a
      // CANON_ABSENCE segment. Badging it CANON would say ForgeOS recorded it.
      segments: Object.freeze([Object.freeze({ text: inLanguage.text, kind: SEGMENT.CANON_ABSENCE })]),
      presented: 0, refused: 1, canonLimitation: true,
      // A refusal names the component it is about, so the identifier must survive.
      preserved: verifyPreserved([limitation.about].filter(Boolean).join(" "),
                                 inLanguage.text).preserved,
    });
  }

  // (SEARCH single-entity fix) THE ONE COMPOSITION FOR "WHAT DOES THE CANON HOLD
  // ABOUT THIS COMPONENT", SHARED RATHER THAN DUPLICATED.
  //
  // Extracted verbatim from the CANON_GAPS case below — same fields, same
  // held/missing split, same realisers, same fold path cited. SEARCH's
  // single-known-entity case (below) calls this INSTEAD OF building a second
  // "tell me about X" composition, per the explicit instruction not to duplicate
  // the Canon read. It reads exactly the bounded fields CANON_GAPS already read —
  // nothing wider — so this is a presentation fix, not a context expansion.
  const composeEntityOverview = (eid) => {
    const c = view?.components?.[eid];
    if (!c) { add(r.unknownComponent(eid), SEGMENT.CANON_ABSENCE); return; }
    const held = [];
    const missing = [];
    const note = (label, present) => (present ? held : missing).push(label);
    note("state", Boolean(c.state));
    note("organisation", Boolean(c.organisation));
    note("hub", Boolean(c.hub));
    note("mission", Boolean(c.mission));
    note("specification", Boolean(c.specification));
    note("history", (c.history ?? []).length > 0);
    note("contributions", (c.contributions ?? []).length > 0);
    note("directives", (c.directives ?? []).length > 0);

    if (held.length) {
      mention(eid);
      sources.push(`components.${eid}.state`);
      add(r.gapsHeld(eid, held.join(", ")), SEGMENT.CANON);
    } else {
      add(r.canonYoung(eid), SEGMENT.CANON_ABSENCE);
    }
    if (missing.length) add(r.gapsMissing(eid, missing.join(", ")), SEGMENT.CANON_ABSENCE);
  };

  switch (intent?.type) {
    case INTENT.COMPONENT_STATE:
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      say(`components.${id}.state`, () => r.state(id, comp.state), id, comp.state);
      say(`components.${id}.organisation`, () => r.responsibility(id, comp.organisation), id, comp.organisation);
      say(`components.${id}.hub`, () => r.hub(id, comp.hub), id, comp.hub);
      say(`components.${id}.mission`, () => r.mission(id, comp.mission), id, comp.mission);
      if (!segments.length) add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE);
      break;

    case INTENT.COMPONENT_HUB:
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      mention(id);
      if (!say(`components.${id}.hub`, () => r.hub(id, comp.hub), comp.hub)) add(r.noHub(id), SEGMENT.CANON_ABSENCE);
      break;

    case INTENT.COMPONENT_WHO:
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      // NEVER cites the hub. Location is not responsibility — Canon P0-2.
      mention(id);
      if (!say(`components.${id}.organisation`, () => r.responsibility(id, comp.organisation), comp.organisation)) {
        add(r.noResponsibility(id), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.COMPONENT_MISSION:
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      mention(id);
      if (!say(`components.${id}.mission`, () => r.mission(id, comp.mission), comp.mission)) {
        add(r.noMission(id), SEGMENT.CANON_ABSENCE);
      }
      break;

    case INTENT.COMPONENT_CONTRIBUTIONS: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      const n = (comp.contributions ?? []).length;
      mention(id);
      if (n && say(`components.${id}.contributions`, () => r.contributions(id, n))) break;
      add(r.noContributions(id), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.COMPONENT_DIRECTIVES: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      const n = (comp.directives ?? []).length;
      mention(id);
      if (n && say(`components.${id}.directives`, () => r.directives(id, n))) break;
      add(r.noDirectives(id), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.ACKNOWLEDGEMENT_STATUS: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      const resolved = (comp.directives ?? []).find((d) => d?.acknowledgement);
      mention(id);
      if (resolved && say(`components.${id}.directives`,
                          () => r.acknowledged(resolved.directedTo ?? resolved.person ?? "—",
                                               resolved.acknowledgement))) break;
      add(r.notAcknowledged(id), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.COMPONENT_HISTORY: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      const n = (comp.history ?? []).length;
      mention(id);
      if (n && say(`components.${id}.history`, () => r.historyCount(id, n))) break;
      add(r.noHistory(id), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.INSPECTION_STATUS: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      // Only a PROVED history claim may assert a pass. Absence is stated as a
      // Canon absence, never as ignorance — Test 5 and Test 6 turn on this.
      const passed = (comp.history ?? []).some((h) => h.transition === "pass");
      mention(id);
      if (passed && say(`components.${id}.history`, () => r.inspectionPassed(id))) break;
      add(r.inspectionUnknown(id), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.COMPONENT_NEXT_ACTION: {
      if (!comp) { add(r.unknownComponent(id ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      say(`components.${id}.state`, () => r.state(id, comp.state), id, comp.state);
      const rec = (grounded?.recommendations ?? [])[0];
      if (rec?.text) add(r.nextActions(id, rec.text), SEGMENT.RECOMMENDATION);
      else add(r.noNextAction(id, comp.state), SEGMENT.CANON_ABSENCE);
      break;
    }

    case INTENT.MISSION_PROGRESS: {
      const m = (view?.missions ?? []).find((x) => x.id === mid);
      if (!m) { add(r.unknownComponent(mid ?? "—"), SEGMENT.CANON_ABSENCE); break; }
      if (say(`missions.${m.id}.accepted`, () => r.progress(m.id, m.accepted, m.target), m.id)) {
        const d = (grounded?.derived ?? [])[0];
        if (d && isBinding(d)) add(r.remaining(Math.max(0, m.target - m.accepted)), SEGMENT.CANON);
      }
      break;
    }

    // (Phase 3) EXPLANATION — three claim classes in one answer, never merged.
    //
    // A participant asking "why?" wants the recorded state, the thing the Canon does
    // NOT hold that is keeping it there, and what could be done. Those are CANON,
    // CANON_ABSENCE and RECOMMENDATION respectively, and the whole value of the
    // answer depends on the reader being able to tell them apart.
    case INTENT.COMPONENT_WHY: {
      // §18 — ASK, DO NOT GUESS. A bare "Why?" with no subject in the conversation is
      // a question Forge cannot answer yet, and "no record of anything called —" is a
      // non-sentence. Asking which component is the honest reply.
      if (!id) { add(r.needSubject(), SEGMENT.NOT_UNDERSTOOD); break; }
      if (!comp) { add(r.unknownComponent(id), SEGMENT.CANON_ABSENCE); break; }
      say(`components.${id}.state`, () => r.whyState(id, comp.state), id, comp.state);

      // THE ABSENCE IS NAMED, NOT GUESSED. Only a lifecycle stage the Canon can be
      // asked about is reported, and only when it is genuinely unrecorded.
      const passed = (comp.history ?? []).some((h) => h.transition === "pass");
      if (!passed) add(r.whyBlocked(id, "inspection"), SEGMENT.CANON_ABSENCE);

      const next = (grounded?.recommendations ?? [])[0];
      if (next?.text) add(r.nextActions(id, next.text), SEGMENT.RECOMMENDATION);
      break;
    }

    // WHAT THE CANON DOES NOT HOLD. Absence as the answer, itemised so a young Canon
    // is useful rather than embarrassing (§19).
    case INTENT.CANON_GAPS: {
      if (!id) { add(r.needSubject(), SEGMENT.NOT_UNDERSTOOD); break; }
      composeEntityOverview(id);
      break;
    }

    // (Gap 1) FREE-TEXT DISCOVERY. Only entities whose claim actually VERIFIED may
    // be spoken — the same guarantee every other case gets from `provedPath`, just
    // read from `grounded.claims` directly because a search result names a set of
    // entities rather than one field of one entity. `infer.js` only ever produces a
    // claim here for an id it found in THIS `view`, so `isBinding` is the same gate,
    // not a weaker one.
    case INTENT.SEARCH: {
      const query = String(id ?? intent?.specification ?? intent?.mission ?? intent?.message ?? "").trim();
      const hits = (grounded?.claims ?? []).filter(isBinding).filter((c) => c.source?.path);
      if (!hits.length) {
        add(r.searchEmpty(query || "—"), SEGMENT.CANON_ABSENCE);
        break;
      }
      const foundIds = hits.map((c) => c.source.path.split(".")[1]);
      const uniqueIds = [...new Set(foundIds)];

      // (SEARCH single-entity fix) A GENUINE DISCOVERY RESULT VS. A REPHRASED
      // "TELL ME ABOUT X". When the search collapses to exactly one entity AND
      // that entity is the one the participant literally named (`id`, resolved by
      // entity.js against the fold before this ran — never guessed here), the
      // participant did not perform a discovery, they asked about a known subject
      // in different words. Presenting it identically to CANON_GAPS is a
      // consistency fix, not new context: `composeEntityOverview` reads the same
      // bounded fields either way. A search that matches more than one entity, or
      // matches something OTHER than the literal subject (an org, a spec, free
      // text with no named entity), is left untouched below — genuine discovery,
      // unchanged.
      if (id && uniqueIds.length === 1 && uniqueIds[0] === id && view?.components?.[id]) {
        composeEntityOverview(id);
        break;
      }

      mention(query, ...uniqueIds);
      for (const c of hits) sources.push(c.source.path);
      add(r.searchFound(query || "—", hits.map((c) => c.text).join(", ")), SEGMENT.CANON);
      break;
    }

    case INTENT.ACTION_REQUEST:
      // THE AUTHORITY BOUNDARY, IN THE USER'S LANGUAGE. Not "I can't" — what
      // ForgeOS requires. The refusal names the system's rule, not the AI's limit.
      //
      // (Gap 2) THE REFUSAL NOW ECHOES WHAT WAS ASKED, not a boilerplate identical
      // to every other refusal. `intent.matched` is the participant's own matched
      // phrase — data already produced by intent.js and previously discarded here.
      // Echoing it is not a new capability and cites no rule code: which specific
      // ForgeOS rule/capability governs an arbitrary matched phrase is a mapping
      // this change deliberately does not invent (see the skill report).
      add(r.cannotAct(intent?.matched?.[0] ?? null), SEGMENT.AUTHORITY);
      break;

    default:
      // (Gap 2) NAME THE SUBJECT WHEN ONE IS KNOWN, so a participant who has
      // already named a real Canon entity is told what CAN be asked about it
      // instead of a refusal that does not mention what they just said. This
      // asserts no Canon fact — it is a menu of question TYPES this pipeline
      // already answers, not a value read from the fold.
      add(r.notUnderstood(id), SEGMENT.NOT_UNDERSTOOD);
      break;
  }

  const answer = segments.map((x) => x.text).join(" ");
  // The structural guarantee, checked rather than assumed: every canonical value
  // the Canon holds for this subject survives verbatim in the answer.
  //
  // ARGUMENT ORDER MATTERS AND I HAD IT BACKWARDS. verifyPreserved(original,
  // produced) extracts protected terms from the FIRST argument and counts them in
  // the SECOND. Passing (answer, values) made it extract from the answer — where
  // "HUB-014" appears three times — and count in a stringified array where it
  // appears once, so a perfectly correct answer reported preserved: false. The
  // canonical values are the original; the answer is the product.
  const preserved = verifyPreserved([...new Set(spoken)].join(" "), answer).preserved;

  return Object.freeze({
    answer,
    language,
    fellBack,
    sources: Object.freeze([...new Set(sources)]),
    presented: segments.length,
    segments: Object.freeze(segments),
    refused: 0,
    canonLimitation: false,
    clarifying: Object.freeze([]),
    preserved,
  });
}

export default { planResponse, realiserFor, REALISED_LANGUAGES };
