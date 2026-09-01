// ============================================================
// ELECTORAL GEOGRAPHY — ACQUISITION CHECKPOINTING  (Pre-import qualification pass, Phase 2)
//
// Tiny, deliberately dependency-free so it can be tested in isolation
// without importing (and thereby accidentally executing) the real
// national crawl script. Progress is checkpointed after every STATE
// completes — an interruption loses at most one state's partial work,
// never the whole run.
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function loadCheckpoint(path) {
  if (!existsSync(path)) return { completedStateCodes: [], states: {} };
  return JSON.parse(readFileSync(path, "utf8"));
}

export function saveCheckpoint(path, checkpoint) {
  writeFileSync(path, JSON.stringify(checkpoint));
}

export function isStateComplete(checkpoint, stateCode) {
  return checkpoint.completedStateCodes.includes(stateCode);
}

export function recordStateComplete(checkpoint, stateCode, result) {
  checkpoint.states[stateCode] = result;
  if (!checkpoint.completedStateCodes.includes(stateCode)) checkpoint.completedStateCodes.push(stateCode);
  return checkpoint;
}

export default { loadCheckpoint, saveCheckpoint, isStateComplete, recordStateComplete };
