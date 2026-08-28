// ============================================================
// FORGE STUDIO — TECHNICAL TERM PRESERVATION  (Phase 0)
//
// The rule this file enforces: an explanation may be translated, a technical
// value may not. "HUB-014 yana cikin matakin manufacturing" is correct. A
// translated component id, a converted dimension or a localised state name is a
// manufacturing defect wearing the costume of a helpful translation.
//
// THE PROTECTED SET COMES FROM THE CANON, NOT FROM A WORDLIST. Event types,
// component states, specification states, mission states, component classes,
// organisation ids and mission ids are read from the live vocabulary, so the set
// cannot drift when the vocabulary grows. Only the shape-based patterns
// (identifiers, measurements) are expressed as regexes, because a component
// instance id is operator-supplied and cannot be enumerated in advance.
//
// NOT AN ENGLISH ASSUMPTION. The patterns match identifier and measurement
// SHAPE — uppercase-hyphen-digit runs, Ø, ±, unit suffixes — not English words.
// They behave identically inside Hausa, Yoruba, Igbo or Pidgin text.
// ============================================================

import { EVENT_TYPES } from "../events.js";
import { componentState } from "../../domains/production/state.js";
import { specificationState } from "../../domains/engineering/state.js";
import { missionState } from "../../domains/mission/state.js";
import { COMPONENT_CLASS, SEED_ORGANISATIONS } from "../network.js";
import { PILOT_ORGANISATIONS } from "../pilot.js";
import { MISSIONS } from "../missions.js";

/**
 * Canon vocabulary that must survive translation verbatim.
 *
 * HUB IDS WERE MISSING, AND THAT WAS A REAL HOLE. Found while building the Urhobo
 * pack: `findProtectedTerms("warri")` returned nothing. Hub names are lowercase, so
 * the `identifier` shape pattern — which requires an uppercase run — never caught
 * them either. A hub is a Canon value that appears in almost every manufacturing
 * answer ("Ana yin aikin CHS-014 a warri"), and nothing was protecting it during
 * translation; only the response planner's own `verifyPreserved` call happened to
 * cover it, because it passes spoken values in explicitly.
 *
 * DERIVED FROM THE ORGANISATION REGISTRIES THIS FILE ALREADY IMPORTS, not from
 * STUDIO_HUBS. My first attempt imported STUDIO_HUBS directly and tripped a Phase 2
 * guard — "Studio does not import ForgeStudio.js, the frozen token layer is
 * untouched" — which fired exactly as intended. Reading ids out of that layer is
 * harmless in itself, but the guard was written deliberately and the right response
 * to a guard is to satisfy it, not to loosen it.
 *
 * Every hub an organisation operates is enumerated here, which is precisely the set
 * that can appear on a manufacturing event: `hub` is written by an emitter from the
 * acting organisation's own hubs. A hub in STUDIO_HUBS that no organisation operates
 * cannot reach the Canon, so it does not need protecting.
 */
export const CANON_TERMS = Object.freeze([
  ...Object.values(EVENT_TYPES).flatMap((d) => Object.values(d)),
  ...componentState.states(),
  ...specificationState.states(),
  ...missionState.states(),
  ...Object.values(COMPONENT_CLASS),
  ...[...PILOT_ORGANISATIONS, ...SEED_ORGANISATIONS].map((o) => o.id),
  ...MISSIONS.flatMap((m) => [m.id, m.specification].filter(Boolean)),
  ...[...PILOT_ORGANISATIONS, ...SEED_ORGANISATIONS].flatMap((o) => o.hubs ?? []),
]);

/**
 * Shape patterns for values no registry can enumerate.
 *
 * `identifier` deliberately requires an uppercase run plus a hyphenated segment
 * (FTT-HB-001, HUB-014, FORGE-HUB, SOLC is covered by CANON_TERMS). It will not
 * swallow ordinary capitalised words in any language.
 */
export const TERM_PATTERNS = Object.freeze({
  // Ø25 ±0.05 mm  ·  Ø 25.4mm  ·  M8x1.25
  measurement: /(?:Ø\s?\d+(?:[.,]\d+)?(?:\s*±\s?\d+(?:[.,]\d+)?)?(?:\s*(?:mm|cm|m|µm|um|in|°)\b)?)|(?:±\s?\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m|µm|um|in|°)\b)?)|(?:\bM\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?\b)|(?:\b\d+(?:[.,]\d+)?\s?(?:mm|µm|um|MPa|HRC|Nm|kg|°C)\b)/g,
  // FTT-HB-001 · HUB-014 · FORGE-HUB · DEMO-ORG-001
  identifier: /\b[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,6}){1,3}\b/g,
});

const escape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Longest-first so `production.work.acknowledged` is matched before `production`.
const canonRe = () =>
  new RegExp(
    `(?:${[...CANON_TERMS].sort((a, b) => b.length - a.length).map(escape).join("|")})`,
    "g",
  );

/**
 * Find every protected term in a piece of text, in order of appearance.
 * Overlapping matches are resolved longest-first so a measurement is never split.
 */
export function findProtectedTerms(text) {
  const src = String(text ?? "");
  const spans = [];
  const collect = (re, kind) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (m[0]) spans.push({ start: m.index, end: m.index + m[0].length, text: m[0], kind });
      if (m.index === re.lastIndex) re.lastIndex++;   // zero-width guard
    }
  };
  collect(TERM_PATTERNS.measurement, "measurement");
  collect(canonRe(), "canon");
  collect(TERM_PATTERNS.identifier, "identifier");

  // Keep the longest span at each position; drop anything nested inside it.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const s of spans) {
    if (kept.some((k) => s.start >= k.start && s.end <= k.end)) continue;
    kept.push(s);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

const TOKEN = (i) => `‹FT${i}›`;   // ‹FT0› — guillemets survive translation

/**
 * Mask protected terms so a translator physically cannot alter them, and
 * restore them afterwards. The masked form is what a future inference layer
 * would be given; `restoreTerms` puts the exact originals back.
 */
export function protectTerms(text) {
  const terms = findProtectedTerms(text);
  let masked = "";
  let cursor = 0;
  terms.forEach((t, i) => {
    masked += String(text).slice(cursor, t.start) + TOKEN(i);
    cursor = t.end;
  });
  masked += String(text ?? "").slice(cursor);
  return { masked, terms: terms.map((t) => t.text), kinds: terms.map((t) => t.kind) };
}

export function restoreTerms(masked, terms = []) {
  let out = String(masked ?? "");
  terms.forEach((t, i) => { out = out.split(TOKEN(i)).join(t); });
  return out;
}

/**
 * Did every protected term survive verbatim?
 *
 * The check a translation must pass before it may be shown. It compares
 * OCCURRENCE COUNTS, so a term that was dropped, altered, localised or
 * duplicated is all caught.
 */
export function verifyPreserved(original, produced) {
  const expected = findProtectedTerms(original).map((t) => t.text);
  const missing = [];
  const seen = new Map();
  for (const term of expected) seen.set(term, (seen.get(term) ?? 0) + 1);
  for (const [term, wanted] of seen) {
    const got = String(produced ?? "").split(term).length - 1;
    if (got < wanted) missing.push({ term, wanted, got });
  }
  return { preserved: missing.length === 0, missing, expected };
}

export default {
  CANON_TERMS, TERM_PATTERNS, findProtectedTerms,
  protectTerms, restoreTerms, verifyPreserved,
};
