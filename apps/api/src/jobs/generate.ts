import { documentTitle } from "@teardown/core/documentTitle";
import { normalizeGeneratedPlaceholders } from "@teardown/core/outputContract";
import type { Capture } from "@teardown/core/schemas/capture";
import { analyzeSession, type AnalyzeResult } from "../ai/analyze.js";
import { markedTranscript } from "../ai/markedTranscript.js";
import { toModelImage, type ModelImage } from "../ai/modelImages.js";
import { visionCostUsd } from "../ai/models.js";
import type { CaptureForPrompt } from "../ai/prompts/analyze.v1.js";
import { spendCredit } from "../billing/ledger.js";
import { sql } from "../db/client.js";
import { listChunksForSession } from "../db/queries/audioChunks.js";
import { listCapturesForSession, setCropPath } from "../db/queries/captures.js";
import {
  insertVersion,
  setCurrentVersion,
  upsertDocument,
} from "../db/queries/documents.js";
import {
  findSession,
  markSessionReady,
  updateSessionStatus,
} from "../db/queries/sessions.js";
import { insertUsageEvent } from "../db/queries/usageEvents.js";
import { cropCapture } from "../images/cropCapture.js";
import { imageSource } from "../images/imageSource.js";
import { BUCKETS } from "../storage/client.js";
import { downloadObject } from "../storage/downloadObject.js";
import { cropKey } from "../storage/objectKeys.js";
import { uploadObject } from "../storage/uploadObject.js";
import type { GenerateJob } from "../queue/enqueue.js";
import { transcribeChunkJob } from "./transcribeChunk.js";

// The step a failed generation stopped at, stored in sessions.failed_step. A retry runs the whole
// job again, but the steps before the failure find their work already done (words transcribed,
// crops cached) and pass straight through.
type GenerateStep = "transcribe" | "crop" | "analyze" | "save" | "credits";

// How long to wait for queued transcriptions before transcribing stragglers here.
const TRANSCRIPTION_WAIT_MS = 90_000;

// Turns a stopped session into document version 1 (spine §11 step 5): finish transcription,
// derive crops, one vision-model call over the marked transcript and the images, then spend the
// credit and save the document in one transaction. Never throws: a failure marks the session
// failed with its step, and the user retries from the web app.
export async function generateJob({ sessionId }: GenerateJob): Promise<void> {
  const session = await findSession(sessionId);
  if (session === null || session.status === "ready") return;

  let step: GenerateStep = "transcribe";
  try {
    await updateSessionStatus(sessionId, "syncing");
    await finishTranscription(sessionId);

    step = "crop";
    await updateSessionStatus(sessionId, "processing");
    const captures = await listCapturesForSession(sessionId);
    const images = await Promise.all(
      captures.map((capture) => modelImageFor(session.userId, capture)),
    );

    step = "analyze";
    const transcript = await markedTranscript(sessionId, captures);
    if (captures.length === 0 && transcript.length === 0)
      throw new Error("the session has no captures and no narration");
    const result = await analyzeSession(
      transcript,
      captures.map(captureForPrompt),
      images,
    );
    await recordUsage(session.userId, sessionId, result, images);

    step = "save";
    const saved = await saveDocument(
      session.userId,
      sessionId,
      captures.length,
      result,
    );
    if (!saved) {
      step = "credits";
      throw new Error("the balance no longer covers a generation");
    }
    console.log(
      `generated ${sessionId}: ${captures.length} captures, ${result.inputTokens} in / ${result.outputTokens} out tokens`,
    );
  } catch (err) {
    await updateSessionStatus(sessionId, "failed", step);
    console.error(`generate ${sessionId} failed at ${step}:`, err);
  }
}

// Waits for queued chunk transcriptions to land, then transcribes here whatever is still missing
// (a chunk whose job failed, or one still queued after the wait).
async function finishTranscription(sessionId: string): Promise<void> {
  const deadline = Date.now() + TRANSCRIPTION_WAIT_MS;
  while (Date.now() < deadline) {
    const chunks = await listChunksForSession(sessionId);
    if (!chunks.some((chunk) => chunk.status === "uploaded")) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  const missing = (await listChunksForSession(sessionId)).filter(
    (chunk) => chunk.status !== "transcribed",
  );
  for (const chunk of missing) {
    await transcribeChunkJob({ chunkId: chunk.id });
  }
}

// The image the model sees for one capture: the region crop (derived and cached on first use)
// or the full original, shrunk to the model's patch budget.
async function modelImageFor(
  userId: string,
  capture: Capture,
): Promise<ModelImage> {
  if (capture.region.mode === "freehand" && capture.cropPath === null) {
    const original = await downloadBuffer(imageSource(capture));
    const crop = await cropCapture(capture, original);
    const path = cropKey(userId, capture.sessionId, capture.id);
    await uploadObject(BUCKETS.crops, path, crop, "image/png");
    await setCropPath(capture.id, path);
    return toModelImage(crop);
  }
  return toModelImage(await downloadBuffer(imageSource(capture)));
}

async function downloadBuffer(
  source: ReturnType<typeof imageSource>,
): Promise<Buffer> {
  const blob = await downloadObject(source.bucket, source.path);
  return Buffer.from(await blob.arrayBuffer());
}

function captureForPrompt(capture: Capture, index: number): CaptureForPrompt {
  return {
    n: index + 1,
    tCaptureMs: capture.tCapture,
    url: capture.url,
    pageTitle: capture.pageTitle,
    regionMode: capture.region.mode,
  };
}

async function recordUsage(
  userId: string,
  sessionId: string,
  result: AnalyzeResult,
  images: ModelImage[],
): Promise<void> {
  await insertUsageEvent({
    userId,
    sessionId,
    kind: "generate",
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    imageCount: images.length,
    imagePixels: images.map((image) => ({ w: image.width, h: image.height })),
    costUsdEstimate: visionCostUsd(result.inputTokens, result.outputTokens),
  });
}

// Spends the credit and writes version 1 together: either both happen or neither does, so a
// failed save never costs a credit and a saved document is always paid for (spine §12.1).
async function saveDocument(
  userId: string,
  sessionId: string,
  captureCount: number,
  result: AnalyzeResult,
): Promise<boolean> {
  const normalized = normalizeGeneratedPlaceholders(
    result.markdown,
    captureCount,
  );
  if (normalized.removed.length > 0 || normalized.appended.length > 0) {
    console.log(
      `generate ${sessionId}: removed image refs ${normalized.removed.join(",") || "none"}, appended ${normalized.appended.join(",") || "none"}`,
    );
  }
  return sql.begin(async (tx) => {
    if (!(await spendCredit(tx, userId, sessionId))) return false;
    const documentId = await upsertDocument(tx, sessionId);
    const version = await insertVersion(tx, {
      documentId,
      markdown: normalized.markdown,
      source: "generate",
      refinePrompt: null,
      model: result.model,
    });
    await setCurrentVersion(tx, documentId, version.id);
    await markSessionReady(tx, sessionId, documentTitle(normalized.markdown));
    return true;
  });
}
