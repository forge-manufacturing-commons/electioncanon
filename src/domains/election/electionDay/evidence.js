// ============================================================
// ELECTIONCANON ALPHA 1.1 — RESULT-EVIDENCE UPLOAD
//
// Direct Supabase Storage upload — deliberately NOT a Canon event or a
// PREPARE/APPROVE step. The image itself is inert bytes; the Canon FACT
// that matters (a result was captured, referencing this image) is still
// recorded through the normal proposeCaptureResult/executeCaptureResult
// PREPARE/APPROVE pair in write.js. This function only ever returns the
// resulting Storage object PATH for that event to reference — it never
// writes to election_events itself.
//
// PATH CONVENTION: <campaign_id>/<result_id>/<filename> — the SAME
// tenant-scoping shape used everywhere else in this project, so the
// migration's RLS policy on storage.objects is a pure path-prefix check
// via storage.foldername(name), reusing is_active_campaign_member()
// unchanged. See supabase/migrations/20260828000000_election_forge_evidence_storage.sql.
//
// IMMUTABLE — no update/delete policy exists on this bucket. A corrected
// photo is a new resultId (a new RESULT_CAPTURED event, new confirmationId),
// never an overwrite of an existing path.
// ============================================================

export const EVIDENCE_BUCKET = "election-evidence";
export const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024; // 8 MB — a phone photo, not a raw file
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/** ALPHA 1.3 — a SHA-256 of the raw file bytes, computed client-side via
 *  the standard Web Crypto API. This is a DUPLICATE-EVIDENCE signal, never
 *  a blocking check — the same result sheet legitimately gets photographed
 *  and re-submitted (a failed first attempt, a clearer retake), and this
 *  codebase never refuses to record a real event on a heuristic. Callers
 *  compare the returned hash against already-known result hashes and
 *  surface a flag, same discipline as `ConsistencyNote`. Returns `null`
 *  (never throws) when `crypto.subtle` is unavailable (e.g. a non-HTTPS
 *  context) — the caller must treat that as "no signal", not an error. */
export async function hashResultEvidence(file) {
  if (!file || typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

// ALPHA 1.3 — a phone camera photo is routinely 4000x3000+ and several MB;
// a poor-connectivity field upload of that is a real failure mode, not a
// hypothetical. 1600px on the long edge and JPEG quality 0.82 are chosen
// to stay legible for the OCR text heuristic (tesseract.js reads printed
// tally-sheet text fine well below this resolution) while cutting typical
// upload size by 80-90% — NEVER destroying evidentiary quality: the
// ORIGINAL is what a human reviewer sees full-size via the signed URL,
// this only shrinks what actually travels over the network.
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;
// Below this, compressing would only add re-encoding artifacts for little
// bandwidth benefit — the photo is left exactly as the camera produced it.
const SKIP_COMPRESSION_BELOW_BYTES = MAX_EVIDENCE_BYTES / 2;

/** ALPHA 1.3 — client-side downscale/re-encode before upload, for
 *  low-bandwidth field conditions. NEVER throws and NEVER blocks the
 *  upload path: any unsupported type, missing browser capability, or
 *  mid-compression failure returns the ORIGINAL file unchanged with an
 *  honest `reason`, exactly the "flag, don't fabricate" discipline used
 *  throughout this domain. HEIC is left alone — re-encoding it client-side
 *  would need a decoder this codebase does not carry, and uploading it
 *  unchanged is honest, not a bug. Returns `{ file, compressed, reason }`. */
export async function compressResultEvidence({ file, maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = {}) {
  if (!file) return { file: null, compressed: false, reason: "no file supplied" };
  if (file.type === "image/heic") return { file, compressed: false, reason: "HEIC cannot be re-encoded client-side — uploaded as captured" };
  if (!ALLOWED_TYPES.includes(file.type)) return { file, compressed: false, reason: "unsupported type — uploaded as captured" };
  if (file.size <= SKIP_COMPRESSION_BELOW_BYTES) return { file, compressed: false, reason: "already small enough — uploaded as captured" };
  if (typeof createImageBitmap !== "function") {
    return { file, compressed: false, reason: "no image-compression support in this browser — uploaded as captured" };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    // OffscreenCanvas only, deliberately — this is a domain module and
    // must stay DOM-free (no document.createElement), the same boundary
    // test/election-web-adapter.consumer.mjs's §F already enforces for
    // every other file under src/domains/election. Broadly supported
    // (Chrome/Firefox/Edge for years, Safari 16.4+); where it's missing,
    // the honest fallback below uploads the original, uncompressed photo.
    if (typeof OffscreenCanvas === "undefined") {
      return { file, compressed: false, reason: "no canvas available in this browser — uploaded as captured" };
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
    if (!blob) return { file, compressed: false, reason: "compression produced no output — uploaded as captured" };

    const name = (file.name ?? "result").replace(/\.\w+$/, "") + ".jpg";
    const compressed = typeof File === "function" ? new File([blob], name, { type: "image/jpeg" }) : blob;
    return { file: compressed, compressed: true, reason: `resized to ${w}x${h} and re-encoded as JPEG (quality ${quality}) for faster upload` };
  } catch (err) {
    return { file, compressed: false, reason: `compression failed (${err?.message ?? "unknown error"}) — uploaded as captured` };
  } finally {
    bitmap?.close?.();
  }
}

/**
 * Uploads a result-sheet photo to the private evidence bucket.
 * @param file      a browser File/Blob — never touched by anything else in
 *                  this codebase; nothing here runs OCR or interprets pixels.
 * @param campaignId the caller's own resolved campaign id (never trusted
 *                  from anywhere but the same Canon scope resolution every
 *                  other write already goes through).
 * @param resultId  the confirmationId the caller will use for the matching
 *                  RESULT_CAPTURED event — ties the image path to that
 *                  event before the event itself is even written.
 */
export async function uploadResultEvidence({ client, campaignId, resultId, file }) {
  if (!file) return { path: null, error: "a result-sheet photo is required" };
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { path: null, error: `"${file.type || "unknown file type"}" is not a supported image type` };
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { path: null, error: "the photo is larger than 8 MB — please use a smaller image" };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/heic" ? "heic" : "jpg";
  const path = `${campaignId}/${resultId}/result.${extension}`;

  const { error } = await client.storage.from(EVIDENCE_BUCKET).upload(path, file, {
    contentType: file.type, upsert: false,
  });
  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

/** A short-lived signed URL to display an already-uploaded evidence photo —
 *  the bucket is private, so a plain public URL never works, by design. */
export async function getResultEvidenceUrl({ client, path, expiresInSeconds = 300 }) {
  if (!path) return { url: null, error: null };
  const { data, error } = await client.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return { url: null, error: error.message };
  return { url: data?.signedUrl ?? null, error: null };
}

export default { EVIDENCE_BUCKET, MAX_EVIDENCE_BYTES, uploadResultEvidence, getResultEvidenceUrl, hashResultEvidence, compressResultEvidence };
