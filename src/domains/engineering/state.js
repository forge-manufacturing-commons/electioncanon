// ============================================================
// ELECTIONCANON EXTRACTION — INERT COMPATIBILITY STUB.
// See src/domains/production/state.js's header for the full explanation
// — same reasoning applies here. ElectionCanon's own call path through
// the shared engine never reaches the manufacturing-specific code that
// reads `specificationState`.
// ============================================================

export const specificationState = Object.freeze({
  states: () => [],
});

export default { specificationState };
