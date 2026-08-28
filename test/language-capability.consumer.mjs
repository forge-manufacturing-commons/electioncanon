// ============================================================
// ELECTIONCANON ALPHA 1.3 — LANGUAGE CAPABILITY HONESTY
//
// Proves the language capability registry, and the pipeline it
// describes, cannot report or produce more than what actually exists:
// unreviewed content never reports VERIFIED, an unsupported/unavailable
// language falls back to English and SAYS SO, English is always the
// fallback, and no intent fabricates a translation merely because a
// language was requested. This is the same "no fabricated capability"
// discipline every prior Alpha's test suite enforces, applied to the
// new registry.
// ============================================================

import { capabilityFor, ALL_CAPABILITIES, TEXT_STATUS, VOICE_STATUS, supportStatement } from "../src/os/studio/languageCapability.js";
import { askForge, MODE } from "../src/os/studio/ask.js";
import { deterministicAdapter } from "../src/domains/election/studio/infer.js";
import { planElectionResponse, REALISED_LANGUAGES } from "../src/domains/election/studio/respond.js";
import { ELECTION_VOCABULARY } from "../src/domains/election/studio/vocabulary.js";
import { PROVIDER_PROFILES as VOICE_PROFILES } from "../supabase/functions/election-voice/contract.mjs";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTIONCANON ALPHA 1.3 — language capability honesty\n");

// ============================================================
console.log("A — UNREVIEWED CONTENT CAN NEVER REPORT VERIFIED");
// ============================================================
{
  ok("A1. English is the only language reporting TEXT VERIFIED",
    ALL_CAPABILITIES.filter((c) => c.text === TEXT_STATUS.VERIFIED).map((c) => c.code).join(",") === "en");
  for (const code of ["pcm", "ha", "yo", "ig", "urh"]) {
    ok(`A2. ${code} reports REVIEW_REQUIRED, never VERIFIED, while unwired`,
      capabilityFor(code).text === TEXT_STATUS.REVIEW_REQUIRED);
  }
  ok("A3. REALISED_LANGUAGES itself is still English-only — the registry did not get ahead of the real pipeline",
    REALISED_LANGUAGES.length === 1 && REALISED_LANGUAGES[0] === "en");
}

// ============================================================
console.log("\nB — VOICE STATUS NEVER CLAIMS MORE THAN THE REAL PROVIDER REGISTRY HOLDS");
// ============================================================
{
  ok("B1. exactly one voice provider is registered (google_stt) — Alpha 1.3's researched, justified choice",
    Object.keys(VOICE_PROFILES).length === 1 && VOICE_PROFILES.google_stt);
  ok("B1b. it only claims the languages Google's own documented locale table lists — no Pidgin, no Urhobo",
    JSON.stringify([...VOICE_PROFILES.google_stt.sttSupportedLangs].sort()) === JSON.stringify(["en", "ha", "ig", "yo"]));
  ok("B2. NO language reports voiceStt AVAILABLE (fully live) — this repo has never held a real key, only AVAILABLE_PENDING_CONFIG at best",
    ALL_CAPABILITIES.every((c) => c.voiceStt !== VOICE_STATUS.AVAILABLE));
  ok("B3. Pidgin and Urhobo voice STT honestly report UNAVAILABLE (no provider covers them at all)",
    capabilityFor("pcm").voiceStt === VOICE_STATUS.UNAVAILABLE && capabilityFor("urh").voiceStt === VOICE_STATUS.UNAVAILABLE);
  ok("B4. no language reports voiceTts as anything but UNAVAILABLE — no TTS provider was found for any of them",
    ALL_CAPABILITIES.every((c) => c.voiceTts === VOICE_STATUS.UNAVAILABLE));
  ok("B5. supportStatement() never contains the bare word 'supported' — always qualified",
    !/\bsupported\b/i.test(supportStatement("ha")));
  ok("B6. languageCapability.js's local mirror of Google's supported languages stays in sync with contract.mjs's real registry",
    ["en", "ha", "yo", "ig"].every((c) => capabilityFor(c).voiceStt === VOICE_STATUS.AVAILABLE_PENDING_CONFIG) &&
    ["pcm", "urh"].every((c) => capabilityFor(c).voiceStt === VOICE_STATUS.UNAVAILABLE) &&
    VOICE_PROFILES.google_stt.sttSupportedLangs.every((c) => capabilityFor(c).voiceStt === VOICE_STATUS.AVAILABLE_PENDING_CONFIG));
}

// ============================================================
console.log("\nC — AN UNAVAILABLE/UNREVIEWED LANGUAGE FALLS BACK TO ENGLISH, HONESTLY");
// ============================================================
{
  const view = { candidates: {}, wards: { "Ward 3": { id: "Ward 3", status: "on-track" } }, results: {}, incidents: {}, pollingUnits: {}, agents: {}, people: {}, assignments: {}, tasks: {}, feed: [], observers: {} };

  // The message text itself stays ENGLISH — intent PHRASE MATCHING is
  // English-only by design (intent.js's own "English only, honestly"
  // header) — what varies is `preferredLanguage`, exactly how the real
  // Ask panel sends it (text box in English, a language preference
  // hint alongside it). This is what proves the FALLBACK mechanism,
  // not intent recognition in another language (a separate, larger,
  // not-yet-built capability this test correctly does not claim exists).
  for (const lang of ["ha", "yo", "urh"]) {
    const out = await askForge({
      message: "status in Ward 3", view, log: [], preferredLanguage: lang, mode: MODE.ASK,
      adapter: deterministicAdapter, responder: planElectionResponse, vocabulary: ELECTION_VOCABULARY,
    });
    ok(`C1. an English question with preferredLanguage="${lang}" still answers (never silently drops the question)`, typeof out.answer === "string" && out.answer.length > 0);
    ok(`C2. ...and honestly reports languageFellBack:true for "${lang}" — never a fabricated ${lang} sentence`, out.languageFellBack === true);
    ok(`C3. ...and the answer text is the SAME English realiser output any English speaker would get`, /Ward 3/.test(out.answer));
  }

  const enOut = await askForge({
    message: "what is the status of Ward 3", view, log: [], preferredLanguage: "en", mode: MODE.ASK,
    adapter: deterministicAdapter, responder: planElectionResponse, vocabulary: ELECTION_VOCABULARY,
  });
  ok("C4. English itself never reports a language fallback — it IS the authoritative language, not a fallback target only", enOut.languageFellBack === false);
}

// ============================================================
console.log("\nD — NO INTENT FABRICATES A TRANSLATION MERELY BECAUSE A LANGUAGE WAS SELECTED");
// ============================================================
{
  // Structural proof: realiserFor only ever returns REALISERS.en's
  // functions for a non-English language (never a synthesized/templated
  // non-English string) — confirmed by reading the actual module rather
  // than trusting behaviour alone.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/domains/election/studio/respond.js", import.meta.url), "utf8");
  ok("D1. respond.js's own source defines REALISERS with exactly one language key",
    (src.match(/^\s{2}(en|ha|yo|ig|pcm|urh):\s*\{/gm) ?? []).length === 1);
  ok("D2. ...and that key is 'en'", /^\s{2}en:\s*\{/m.test(src));
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail) process.exit(1);
