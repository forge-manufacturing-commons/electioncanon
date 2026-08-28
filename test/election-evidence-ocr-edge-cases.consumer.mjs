// ============================================================
// ELECTIONCANON ALPHA 1.3 — RESULT-SHEET HANDLING, EDGE CASES
//
// This does NOT render or read actual photographs — there is no image
// library in this repository (`canvas`/`sharp`/etc. are not dependencies,
// and adding one to fake "synthetic images" would itself be a dishonest
// shortcut). What CAN be genuinely tested without guessing is the real
// boundary the pixels cross into this codebase: tesseract.js's own
// `recognize()` result shape (`{blocks:[{paragraphs:[{lines:[...]}]}]}`,
// confirmed against the real installed library in Alpha 1.2 — see
// ocrProviders/tesseract.js's header comment) feeding into
// `linesToFields()`. So this file feeds `linesToFields`/`flattenLines`
// directly with synthetic DATA SHAPES standing in for what a clear,
// blurry (low per-line confidence), rotated/damaged (unparseable text),
// partial (few/no lines), or hostile/malformed OCR pass would actually
// hand back — the same contract `extract()` already trusts blindly. This
// is a claim about ROBUSTNESS ("never crashes, never silently drops or
// invents a reading"), never a claim that the heuristic reads a real hard
// photograph correctly — no text heuristic can promise that.
//
// Also covers: `hashResultEvidence`'s duplicate-evidence signal (Alpha
// 1.3) and `proposeCaptureResult`'s non-blocking duplicate flag.
// ============================================================

import { linesToFields, flattenLines } from "../src/domains/election/electionDay/ocrProviders/tesseract.js";
import { hashResultEvidence, compressResultEvidence } from "../src/domains/election/electionDay/evidence.js";
import { proposeCaptureResult, executeCaptureResult, OCR_CONFIDENCE } from "../src/domains/election/electionDay/write.js";
import { projectElection } from "../src/domains/election/projections.js";

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  ok   ${n}`); } else { fail++; console.log(`  FAIL ${n}`); } };

console.log("\nELECTIONCANON ALPHA 1.3 — result-sheet handling, edge cases\n");

function dataOf(lines) {
  // one block, one paragraph — flattenLines() walks blocks[].paragraphs[].lines[]
  return { blocks: [{ paragraphs: [{ lines }] }] };
}

// ============================================================
console.log("A — CLEAR: well-formed rows are parsed with high confidence");
// ============================================================
{
  const data = dataOf([
    { text: "Candidate A: 245", confidence: 96 },
    { text: "Candidate B: 118", confidence: 91 },
    { text: "Total: 363", confidence: 94 },
  ]);
  const fields = linesToFields(data);
  ok("A1. three lines in, three fields out — nothing dropped", fields.length === 3);
  ok("A2. field/value split correctly on the colon", fields[0].field === "Candidate A" && fields[0].value === "245");
  ok("A3. high raw confidence buckets to HIGH", fields[0].confidence === OCR_CONFIDENCE.HIGH);
}

// ============================================================
console.log("\nB — BLURRY: low per-line confidence still yields a reading, honestly bucketed");
// ============================================================
{
  const data = dataOf([
    { text: "Candidate A: 245", confidence: 41 },
    { text: "Candidate B: 118", confidence: 68 },
  ]);
  const fields = linesToFields(data);
  ok("B1. a blurry line is still extracted, never silently dropped", fields.length === 2);
  ok("B2. very low confidence buckets to LOW", fields[0].confidence === OCR_CONFIDENCE.LOW);
  ok("B3. mid confidence buckets to MEDIUM, not rounded up to HIGH", fields[1].confidence === OCR_CONFIDENCE.MEDIUM);
}

// ============================================================
console.log("\nC — ROTATED/DAMAGED: unparseable text is kept whole, never dropped or fabricated into a field");
// ============================================================
{
  const data = dataOf([
    { text: "C4nd1d4t3 /\\ 24S", confidence: 30 }, // garbled, no separator this heuristic recognises
    { text: "||||  ___  42", confidence: 22 },
  ]);
  const fields = linesToFields(data);
  ok("C1. two garbled lines still produce two entries", fields.length === 2);
  ok("C2. an unparseable line is labelled honestly as unlabeled, not guessed at",
    /\(unlabeled\)/.test(fields[0].field) && fields[0].value === "C4nd1d4t3 /\\ 24S");
  ok("C3. unrecognisable confidence never gets promoted to a real bucket", fields[1].confidence === OCR_CONFIDENCE.LOW);
}

// ============================================================
console.log("\nD — PARTIAL: sparse or empty OCR output never crashes");
// ============================================================
{
  ok("D1. zero lines yields zero fields, not a crash", linesToFields(dataOf([])).length === 0);
  ok("D2. a single readable line still works on its own", linesToFields(dataOf([{ text: "Candidate A: 9", confidence: 80 }])).length === 1);
  ok("D3. a line with only whitespace text is filtered out entirely", linesToFields(dataOf([{ text: "   ", confidence: 50 }])).length === 0);
}

// ============================================================
console.log("\nE — PARTY-ABBREVIATION ROWS (Alpha 1.3 addition)");
// ============================================================
{
  const data = dataOf([
    { text: "APC 2450", confidence: 88 },
    { text: "PDP  1899", confidence: 85 },
    { text: "LP 733", confidence: 90 },
  ]);
  const fields = linesToFields(data);
  ok("E1. all three party/count rows are recognised as field:value pairs, not left unlabeled",
    fields.every((f) => !/unlabeled/.test(f.field)));
  ok("E2. the abbreviation becomes the field name", fields[0].field === "APC" && fields[0].value === "2450");
  ok("E3. a lowercase word beside a number is NOT mistaken for this pattern (too narrow on purpose)",
    linesToFields(dataOf([{ text: "polling unit 42", confidence: 80 }]))[0].field !== "polling");
}

// ============================================================
console.log("\nF — CONFLICTING / DUPLICATE OCR READS: nothing is silently merged or lost");
// ============================================================
{
  const data = dataOf([
    { text: "Candidate A: 245", confidence: 90 },
    { text: "Candidate A: 254", confidence: 60 }, // same field read twice, disagreeing values
  ]);
  const fields = linesToFields(data);
  ok("F1. both conflicting reads survive as separate rows — this layer never resolves a conflict itself",
    fields.length === 2 && fields[0].value === "245" && fields[1].value === "254");
}

// ============================================================
console.log("\nG — HOSTILE/MALFORMED INPUT: never throws");
// ============================================================
{
  let threw = false;
  try {
    linesToFields(null);
    linesToFields({});
    linesToFields({ blocks: null });
    linesToFields({ blocks: [{ paragraphs: null }] });
    linesToFields({ blocks: [{ paragraphs: [{ lines: [{ text: null, confidence: "not-a-number" }] }] }] });
    linesToFields({ blocks: [{ paragraphs: [{ lines: [{}] }] }] });
    flattenLines(undefined);
  } catch {
    threw = true;
  }
  ok("G1. every malformed/hostile shape is absorbed without throwing", !threw);
  ok("G2. a line with no text is simply omitted, not a fabricated empty field", flattenLines({ blocks: [{ paragraphs: [{ lines: [{ confidence: 50 }] }] }] }).length === 0);
}

// ============================================================
console.log("\nH — hashResultEvidence: a real, deterministic content signal");
// ============================================================
{
  const bytesA = new Uint8Array([1, 2, 3, 4, 5]);
  const bytesB = new Uint8Array([1, 2, 3, 4, 6]);
  const fileA1 = new Blob([bytesA]);
  const fileA2 = new Blob([bytesA]);
  const fileB = new Blob([bytesB]);

  const hA1 = await hashResultEvidence(fileA1);
  const hA2 = await hashResultEvidence(fileA2);
  const hB = await hashResultEvidence(fileB);
  ok("H1. identical bytes hash identically", hA1 !== null && hA1 === hA2);
  ok("H2. different bytes hash differently", hB !== null && hB !== hA1);
  ok("H3. the hash is a real hex SHA-256 (64 hex chars), not a placeholder", /^[0-9a-f]{64}$/.test(hA1));

  const hNoFile = await hashResultEvidence(null);
  ok("H4. no file at all returns null, never throws", hNoFile === null);
}

// ============================================================
console.log("\nI — proposeCaptureResult's duplicate-evidence flag is a FLAG, never a block");
// ============================================================
{
  const CAMPAIGN = "camp-dup", USER = "agent-dup";
  const rows = [];
  const client = {
    from: () => ({
      insert: async (row) => {
        if (rows.some((r) => r.event_id === row.event_id)) return { error: { code: "23505", message: "duplicate key" } };
        rows.push(row);
        return { error: null };
      },
    }),
  };
  const logFor = () => rows.map((r) => r.payload).reverse();

  const first = await proposeCaptureResult({ fields: { pollingUnitId: "pu-1", evidenceHash: "aaaa1111" } });
  ok("I1. the first submission of a hash is PREPARED with no duplicate warning", first.status === "PREPARED" && !/appears identical/.test(first.draft.summary));
  const exec1 = await executeCaptureResult({ draft: first.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "res-dup-1" });
  ok("I2. it is recorded", exec1.success);

  const knownEvidenceHashes = [{ hash: "aaaa1111", pollingUnit: "PU-1" }];
  const second = await proposeCaptureResult({ fields: { pollingUnitId: "pu-2", evidenceHash: "aaaa1111" }, knownEvidenceHashes });
  ok("I3. a matching hash is still PREPARED — never refused", second.status === "PREPARED");
  ok("I4. ...but the summary honestly flags it as a likely duplicate", /appears identical/.test(second.draft.summary));
  const exec2 = await executeCaptureResult({ draft: second.draft.draft, campaign: CAMPAIGN, userId: USER, client, confirmationId: "res-dup-2" });
  ok("I5. the flagged duplicate is still recorded as its own real event", exec2.success);

  const view = projectElection(logFor(), CAMPAIGN);
  ok("I6. both results carry the same evidenceHash once folded", view.results["res-dup-1"].evidenceHash === "aaaa1111" && view.results["res-dup-2"].evidenceHash === "aaaa1111");

  const distinct = await proposeCaptureResult({ fields: { pollingUnitId: "pu-3", evidenceHash: "bbbb2222" }, knownEvidenceHashes });
  ok("I7. a genuinely different hash is never flagged", !/appears identical/.test(distinct.draft.summary));
}

// ============================================================
console.log("\nJ — compressResultEvidence: honest fallback and real resize math");
// ============================================================
{
  const bigJpeg = { type: "image/jpeg", size: 5_000_000, name: "photo.jpg" };

  // J1-J4 run in the REAL Node environment, where createImageBitmap/
  // OffscreenCanvas genuinely do not exist — proving the honest fallback
  // path, not a mocked one.
  const noSupport = await compressResultEvidence({ file: bigJpeg });
  ok("J1. with no browser image APIs available, the ORIGINAL file is returned unchanged", noSupport.file === bigJpeg && noSupport.compressed === false);
  ok("J2. ...with an honest reason, never a silent no-op", /no image-compression support/.test(noSupport.reason));

  const heic = { type: "image/heic", size: 5_000_000, name: "photo.heic" };
  const heicResult = await compressResultEvidence({ file: heic });
  ok("J3. HEIC is never touched — no client-side decoder exists for it", heicResult.file === heic && heicResult.compressed === false && /HEIC/.test(heicResult.reason));

  const small = { type: "image/jpeg", size: 500_000, name: "small.jpg" };
  const smallResult = await compressResultEvidence({ file: small });
  ok("J4. an already-small photo is left alone — compression is never applied just because it can be",
    smallResult.file === small && smallResult.compressed === false && /already small/.test(smallResult.reason));

  const noFile = await compressResultEvidence({ file: null });
  ok("J5. no file at all is refused cleanly, never throws", noFile.file === null && noFile.compressed === false);

  // J6+ — inject fake browser globals to exercise the REAL resize/re-encode
  // branch (the actual pixel decode is the browser's job; what this proves
  // is the scaling arithmetic, quality passthrough, and File construction).
  let capturedDrawArgs = null, capturedBlobOptions = null;
  globalThis.createImageBitmap = async (file) => ({ width: file.__width, height: file.__height, closed: false, close() { this.closed = true; } });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() {
      return { drawImage: (...args) => { capturedDrawArgs = args; } };
    }
    async convertToBlob(opts) {
      capturedBlobOptions = opts;
      return new Blob([new Uint8Array(1_200_000)], { type: opts.type });
    }
  };
  try {
    const wide = { type: "image/jpeg", size: 5_000_000, name: "wide.jpg", __width: 4000, __height: 3000 };
    const result = await compressResultEvidence({ file: wide, maxDimension: 1600, quality: 0.7 });
    ok("J6. a wide (landscape) photo is scaled down to fit the long edge at 1600", result.compressed === true && capturedDrawArgs[3] === 1600);
    ok("J7. the short edge is scaled by the SAME ratio, preserving aspect ratio (1600 * 3000/4000 = 1200)", capturedDrawArgs[4] === 1200);
    ok("J8. the requested quality is passed straight through to the encoder, never a hardcoded default", capturedBlobOptions.quality === 0.7 && capturedBlobOptions.type === "image/jpeg");
    ok("J9. the output is a real, smaller file with a .jpg name", result.file.name === "wide.jpg" && result.file.type === "image/jpeg" && result.file.size === 1_200_000);
    ok("J10. the reason string honestly reports the real new dimensions", /1600x1200/.test(result.reason));

    const tall = { type: "image/png", size: 6_000_000, name: "tall.png", __width: 2000, __height: 5000 };
    const result2 = await compressResultEvidence({ file: tall });
    ok("J11. a tall (portrait) photo scales by its LONG edge (height), not width — 1600 * 2000/5000 = 640", capturedDrawArgs[3] === 640 && capturedDrawArgs[4] === 1600);

    const alreadySmallDims = { type: "image/jpeg", size: 5_000_000, name: "smalldims.jpg", __width: 800, __height: 600 };
    const result3 = await compressResultEvidence({ file: alreadySmallDims, maxDimension: 1600 });
    ok("J12. a photo already under the max dimension is not upscaled — width/height pass through at 1:1",
      capturedDrawArgs[3] === 800 && capturedDrawArgs[4] === 600);
  } finally {
    delete globalThis.createImageBitmap;
    delete globalThis.OffscreenCanvas;
  }

  // J13 — a mid-compression throw is absorbed, never propagated, and the
  // original file is still returned so the upload path is never blocked.
  globalThis.createImageBitmap = async () => { throw new Error("decode failed"); };
  try {
    const throwing = { type: "image/jpeg", size: 5_000_000, name: "bad.jpg" };
    const result = await compressResultEvidence({ file: throwing });
    ok("J13. a mid-compression failure falls back to the original file, never throws", result.file === throwing && result.compressed === false && /compression failed/.test(result.reason));
  } finally {
    delete globalThis.createImageBitmap;
  }
}

console.log(`\n${pass}/${pass + fail} assertions passed${fail ? ` — ${fail} FAILED` : ""}\n`);
if (fail) process.exit(1);
