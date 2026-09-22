import {
  CAPTURE_COALESCE_MS,
  CAPTURE_MIN_SPACING_MS,
  CAPTURE_QUOTA_ERROR,
} from "../shared/constants.js";
import {
  putCapture,
  putCaptureBlob,
  type StoredCapture,
} from "../shared/idb.js";
import { sendMessage, type MessageOf } from "../shared/messages.js";
import { enqueueUpload } from "./uploader.js";

// captureVisibleTab, paced (spine §8.1): at most one shot every CAPTURE_MIN_SPACING_MS, presses
// within CAPTURE_COALESCE_MS of each other count as one, and a shot that still hits Chrome's
// quota is retried rather than dropped. The promise resolves once the shot has been taken, so a
// content script that hid its controls knows when to show them again.

// dpr is null when no content script measured it; it is then recovered from the PNG width.
export type CaptureJob = Omit<
  MessageOf<"CAPTURE_REQUEST">,
  "type" | "viewport"
> & {
  sessionId: string;
  windowId: number;
  viewport: { w: number; h: number; dpr: number | null };
};

const queue: { job: CaptureJob; done: () => void }[] = [];
let processing = false;
let lastRequestAt = 0;
let lastShotAt = 0;

export function enqueueCapture(job: CaptureJob): Promise<void> {
  const now = Date.now();
  if (now - lastRequestAt < CAPTURE_COALESCE_MS) return Promise.resolve();
  lastRequestAt = now;
  return new Promise((done) => {
    queue.push({ job, done });
    void process();
  });
}

async function process(): Promise<void> {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const { job, done } = queue.shift()!;
    try {
      await waitForSpacing();
      await captureOne(job);
    } catch (err) {
      await sendMessage({
        type: "PROBLEM",
        message: `Capture failed: ${(err as Error).message}`,
      });
    } finally {
      done();
    }
  }
  processing = false;
}

async function waitForSpacing(): Promise<void> {
  const wait = lastShotAt + CAPTURE_MIN_SPACING_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function captureOne(job: CaptureJob): Promise<void> {
  const dataUrl = await captureVisibleTabWithRetry(job.windowId);
  lastShotAt = Date.now();
  const blob = await (await fetch(dataUrl)).blob();
  const { width, height } = await pngDimensions(blob);
  const id = crypto.randomUUID();

  const capture: StoredCapture = {
    id,
    sessionId: job.sessionId,
    tPickStart: job.tPickStart,
    tCapture: job.tCapture,
    url: job.url,
    pageTitle: job.pageTitle,
    viewport: {
      ...job.viewport,
      dpr: job.viewport.dpr ?? width / job.viewport.w,
    },
    region: job.region,
    width,
    height,
    createdAt: Date.now(),
    uploaded: false,
  };
  await putCaptureBlob(id, blob);
  await putCapture(capture);
  await sendMessage({ type: "CAPTURE_STORED", captureId: id });
  enqueueUpload({ kind: "capture", id });
}

async function captureVisibleTabWithRetry(windowId: number): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (!message.includes(CAPTURE_QUOTA_ERROR) || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, CAPTURE_MIN_SPACING_MS));
    }
  }
}

async function pngDimensions(
  blob: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}
