// ============================================================
// FORGE PIDGIN TECHNICAL REGISTRY — ENGLISH RETAINED  (Alpha 1.2)
// Same shape as ../hausa/technical.js. Most of these terms would likely
// be retained verbatim in real spoken Pidgin usage too (it is an
// English-lexified creole) — but that is exactly the kind of judgment
// call left to a reviewer, not asserted here.
// ============================================================

import { CONFIDENCE, SOURCES } from "./lexicon.js";

const tech = (english, { candidate = null, source = SOURCES.NONE,
                         confidence = CONFIDENCE.NATIVE_REVIEW_REQUIRED, usage, note = null } = {}) =>
  Object.freeze({ english, pidgin: candidate, retainEnglish: true, category: "technical", source, confidence, approved: false, usage, note });

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
  // ALPHA 1.3 — the remaining civic/election concepts the brief names.
  // Every one is retained English here for the same reason the first
  // nine are: these are INEC/administrative loanwords used as-is in
  // real spoken Pidgin, not evidence of a missing translation.
  tech("LGA", { usage: "Local Government Area — the level between state and ward." }),
  tech("constituency", { usage: "The electoral area a candidate contests." }),
  tech("candidate", { usage: "A person contesting an election." }),
  tech("observer", { usage: "A person or organisation monitoring the election, not contesting it." }),
  tech("result sheet", { usage: "The physical form a polling unit's results are recorded on." }),
  tech("dispute", { usage: "A formal objection to a captured result.",
    note: "See lexicon.js's CIVIC entry: 'wahala' is a real, broader colloquial word for trouble/dispute, but a " +
          "reviewer must decide whether it fits ElectionCanon's specific formal-dispute sense before this stops " +
          "retaining English." }),
  tech("vote count", { usage: "The number of votes recorded for a candidate at a polling unit.",
    note: "No single established Pidgin term found — natural spoken Pidgin describes this ('how many vote dem " +
          "count'), it does not name it as one word. Retaining English avoids inventing a false single-word term." }),
  tech("turnout", { usage: "The proportion or count of registered voters who actually voted.",
    note: "Same reasoning as 'vote count' — a descriptive phrase in natural Pidgin, not an established single term." }),
  tech("assignment", { usage: "A person's assigned responsibility for a ward or task." }),
  tech("task", { usage: "A trackable unit of campaign work." }),
]);

export function technicalTerm(english) {
  const t = TECHNICAL.find((x) => x.english === english);
  if (!t) return english;
  if (t.retainEnglish || !t.approved || !t.pidgin) return english;
  if (t.confidence === CONFIDENCE.NATIVE_REVIEW_REQUIRED) return english;
  return t.pidgin;
}

export const candidatesAwaitingReview = () =>
  Object.freeze(TECHNICAL.filter((t) => t.pidgin && !t.approved)
    .map((t) => Object.freeze({ english: t.english, candidate: t.pidgin, confidence: t.confidence, note: t.note })));

export const termsWithNoCandidate = () => Object.freeze(TECHNICAL.filter((t) => !t.pidgin).map((t) => t.english));

export default { TECHNICAL, technicalTerm, candidatesAwaitingReview, termsWithNoCandidate };
