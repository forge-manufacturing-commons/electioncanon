// ============================================================
// ELECTIONCANON — RUNTIME OBJECT CONSTANTS
//
// EXTRACTED FROM fatt-app's shared src/os/ForgeRuntime.js (Alpha 1.7
// standalone extraction). The original file also built a full
// manufacturing "operating picture" runtime (workshops, machines,
// components, vehicle studios, language list) that nothing in
// ElectionCanon's own call path ever calls — `src/os/events.js`
// (see its own header) imports only `FORGE_OBJECT`, a set of generic
// entity-kind string constants used as a synonym-lookup table, kept
// here unchanged. The manufacturing-specific `buildRuntime()` and its
// helpers are not ElectionCanon's and were not carried into this repo.
// ============================================================

export const FORGE_OBJECT = {
  PERSON: "person",
  WORKSHOP: "workshop",
  MACHINE: "machine",
  SPECIFICATION: "specification",
  COMPONENT: "component",
  ASSEMBLY: "assembly",
  PROGRAM: "program",
  KNOWLEDGE: "knowledge",
  COMPETENCY: "competency",
  INSTITUTION: "institution",
};
