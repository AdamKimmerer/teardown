import { api, ApiError, putToSignedUrl } from "../shared/api.js";
import { UPLOAD_BACKOFF_MS, UPLOAD_MAX_ATTEMPTS } from "../shared/constants.js";
import {
  getCapture,
  getCaptureBlob,
  getChunk,
  listCaptures,
  listChunks,
  putCapture,
  putChunk,
} from "../shared/idb.js";
import { sendMessage } from "../shared/messages.js";

// Moves originals and audio chunks from the local buffer to the server: presign → PUT → register
// (spine §11). One item at a time, in order, with retries; the bytes stay in IndexedDB until the
// server has confirmed them, so a killed service worker or a dropped connection loses nothing.

type UploadItem =
  { kind: "capture"; id: string } | { kind: "chunk"; offsetMs: number };

const pending: UploadItem[] = [];
let running = false;
let drainWaiters: (() => void)[] = [];

export function enqueueUpload(item: UploadItem): void {
  pending.push(item);
  void run();
}

// Resolves once everything queued so far has been uploaded (or given up on).
export function drainUploads(): Promise<void> {
  if (!running && pending.length === 0) return Promise.resolve();
  return new Promise((resolve) => drainWaiters.push(resolve));
}

// After a service-worker restart, anything not yet confirmed goes back on the queue.
export async function resumePendingUploads(): Promise<void> {
  for (const capture of await listCaptures()) {
    if (!capture.uploaded) enqueueUpload({ kind: "capture", id: capture.id });
  }
  for (const chunk of await listChunks()) {
    if (!chunk.uploaded)
      enqueueUpload({ kind: "chunk", offsetMs: chunk.offsetMs });
  }
}

async function run(): Promise<void> {
  if (running) return;
  running = true;
  while (pending.length > 0) {
    await uploadWithRetry(pending.shift()!);
  }
  running = false;
  drainWaiters.forEach((resolve) => resolve());
  drainWaiters = [];
}

async function uploadWithRetry(item: UploadItem): Promise<void> {
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      if (item.kind === "capture") await uploadCapture(item.id);
      else await uploadChunk(item.offsetMs);
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status < 500 && err.status !== 429) {
        // Not something a retry fixes (signed out, session gone, wrong state). Say so and move on.
        await sendMessage({
          type: "PROBLEM",
          message: `Upload rejected: ${err.message}`,
        });
        return;
      }
      await new Promise((r) => setTimeout(r, UPLOAD_BACKOFF_MS * attempt));
    }
  }
  await sendMessage({
    type: "PROBLEM",
    message: "Uploads are failing; will keep trying",
  });
}

async function uploadCapture(id: string): Promise<void> {
  const meta = await getCapture(id);
  const blob = await getCaptureBlob(id);
  if (!meta || meta.uploaded || !blob) return;
  const presign = await api.presignCapture(meta.sessionId, { captureId: id });
  await putToSignedUrl(presign.uploadUrl, blob);
  await api.upsertCapture(meta.sessionId, {
    id,
    tPickStart: meta.tPickStart,
    tCapture: meta.tCapture,
    url: meta.url,
    pageTitle: meta.pageTitle,
    viewport: meta.viewport,
    region: meta.region,
    originalPath: presign.path,
    elementTextHash: null,
  });
  await putCapture({ ...meta, uploaded: true });
}

async function uploadChunk(offsetMs: number): Promise<void> {
  const chunk = await getChunk(offsetMs);
  if (!chunk || chunk.uploaded) return;
  const presign = await api.presignChunk(chunk.sessionId, { offsetMs });
  await putToSignedUrl(presign.uploadUrl, chunk.blob);
  await api.registerChunk(chunk.sessionId, {
    offsetMs,
    durationMs: chunk.durationMs,
    path: presign.path,
  });
  await putChunk({ ...chunk, uploaded: true });
}
