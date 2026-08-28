// ============================================================
// ELECTIONCANON EXTRACTION — INERT COMPATIBILITY STUB.
//
// This file exists ONLY so os/studio/{terms,intent,infer}.js — the
// shared conversational engine ElectionCanon's own Ask ElectionCanon
// pipeline reuses — can load standalone, without pulling any real
// Forge-A-Truck manufacturing code or data into this repository.
//
// The real `componentState` (in the fatt-app monorepo this was
// extracted from) enumerates actual manufacturing component states.
// ElectionCanon's own call path through the shared engine (its own
// `deterministicAdapter`/`ELECTION_VOCABULARY`, see
// src/domains/election/studio/) never reaches the manufacturing-
// specific branches inside terms.js/intent.js/infer.js that call these
// functions — they exist in those files only to serve Forge-A-Truck's
// OWN default adapter, a code path ElectionCanon's requests never take.
// This stub is deliberately empty, not a guess at what the real
// manufacturing states are.
// ============================================================

export const componentState = Object.freeze({
  states: () => [],
  transitions: () => [],
  means: () => null,
});

export default { componentState };
