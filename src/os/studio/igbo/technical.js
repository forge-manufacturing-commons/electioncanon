// ============================================================
// FORGE IGBO TECHNICAL REGISTRY — ENGLISH RETAINED  (Alpha 1.2)
// Same shape as ../hausa/technical.js.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const tech = (english, { candidate = null, source = SOURCES.NONE,
                         confidence = CONFIDENCE.NATIVE_REVIEW_REQUIRED, usage, note = null } = {}) =>
  Object.freeze({ english, igbo: candidate, retainEnglish: true, category: "technical", source, confidence, approved: false, usage, note });

export const TECHNICAL = Object.freeze([
  tech("campaign", { usage: "A candidate's or observer organisation's ElectionCanon workspace." }),
  tech("readiness", { usage: "How prepared a campaign is, per a fixed Canon vocabulary." }),
  tech("ward", { usage: "An electoral administrative subdivision." }),
  tech("polling unit", { usage: "The physical location where votes are cast on election day." }),
  tech("agent", { usage: "A person representing a campaign at a polling unit." }),
  tech("incident", { usage: "A reported election-day problem or concern." }),
  tech("evidence", { usage: "A photographed result sheet and its extracted figures." }),
  tech("verified", { usage: "A human on the campaign confirmed a result against its evidence photo." }),
  tech("coordinator", { usage: "A person responsible for a level of the campaign's organisation." }),
]);

export function technicalTerm(english) {
  const t = TECHNICAL.find((x) => x.english === english);
  if (!t) return english;
  if (t.retainEnglish || !t.approved || !t.igbo) return english;
  if (t.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return english;
  return t.igbo;
}

export const candidatesAwaitingReview = () =>
  Object.freeze(TECHNICAL.filter((t) => t.igbo && !t.approved)
    .map((t) => Object.freeze({ english: t.english, candidate: t.igbo, confidence: t.confidence, note: t.note })));

export const termsWithNoCandidate = () => Object.freeze(TECHNICAL.filter((t) => !t.igbo).map((t) => t.english));

export default { TECHNICAL, technicalTerm, candidatesAwaitingReview, termsWithNoCandidate };
