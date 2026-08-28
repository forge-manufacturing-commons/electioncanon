// ============================================================
// ELECTIONCANON — OCR PROVIDER ABSTRACTION  (Alpha 1.2)
//
// The same shape as src/os/studio/provider.js's contract: never throws,
// returns an explicit status instead. OCR is ASSISTIVE EXTRACTION, never
// authority — this module's job ends at "here is what the engine read
// and how confident it was," never at "here is the result." The human
// review step (electionDay/write.js's proposeVerifyResult with
// reviewedFields) is where a reading becomes a record.
//
// PROVIDER CONTRACT — any module under ocrProviders/ must export:
//   name        — string, audit/event-log purposes ONLY. Never surfaced
//                 in the public UI as "powered by X" (the UI says
//                 "Extract from image," per the product's own vendor-
//                 neutrality requirement).
//   isAvailable() -> Promise<boolean> | boolean
//   extract({ imageUrl }) -> Promise<{
//     status: OCR_STATUS value,
//     extractedFields: [{ field, value, confidence: OCR_CONFIDENCE }],
//     reason?: string,   // present when status !== COMPLETE
//   }>
// A provider's `extract` may itself throw — this module is what
// guarantees the CALLER never sees a throw, by catching here.
// ============================================================

import { OCR_STATUS } from "./write.js";
import * as tesseractProvider from "./ocrProviders/tesseract.js";

export { OCR_STATUS };
export const DEFAULT_OCR_PROVIDER = tesseractProvider;

/**
 * Run OCR against an already-uploaded evidence image. Never throws — every
 * failure mode (no image, provider unavailable, engine load failure,
 * extraction error) returns a status object instead, exactly like
 * `callForgeAI`'s contract. `imageUrl` is expected to be a short-lived
 * signed URL (see electionDay/evidence.js's `getResultEvidenceUrl`) —
 * this function does not fetch or cache the image itself.
 */
export async function runOcrExtraction({ imageUrl, provider = DEFAULT_OCR_PROVIDER } = {}) {
  if (!imageUrl) {
    return { status: OCR_STATUS.UNAVAILABLE, provider: provider?.name ?? null, extractedFields: [], reason: "no evidence image to read" };
  }
  if (!provider || typeof provider.extract !== "function") {
    return { status: OCR_STATUS.UNAVAILABLE, provider: null, extractedFields: [], reason: "no OCR provider is configured" };
  }
  let available;
  try {
    available = await provider.isAvailable();
  } catch {
    available = false;
  }
  if (!available) {
    return { status: OCR_STATUS.UNAVAILABLE, provider: provider.name ?? null, extractedFields: [], reason: "the OCR engine is not available in this browser" };
  }
  try {
    const result = await provider.extract({ imageUrl });
    return {
      status: Object.values(OCR_STATUS).includes(result?.status) ? result.status : OCR_STATUS.FAILED,
      provider: provider.name ?? null,
      extractedFields: Array.isArray(result?.extractedFields) ? result.extractedFields : [],
      reason: result?.reason ?? null,
    };
  } catch (err) {
    return { status: OCR_STATUS.FAILED, provider: provider.name ?? null, extractedFields: [], reason: err?.message ?? "OCR extraction failed" };
  }
}

export default { OCR_STATUS, DEFAULT_OCR_PROVIDER, runOcrExtraction };
