import { VAD_PEAK_RMS_THRESHOLD } from "../shared/constants.js";
import { putChunk } from "../shared/idb.js";
import { parseMessage, sendMessage } from "../shared/messages.js";
import { startRecording } from "./recorder.js";

// The offscreen document: runs the recorder and nothing else. Only chrome.runtime messaging is
// available here (spike A); chunks go into IndexedDB and the service worker uploads them.

let stopRecording: (() => Promise<void>) | null = null;
let sessionId: string | null = null;

async function handleStart(
  deviceId: string | undefined,
  clock: { startedAt: number; pausedMs: number },
) {
  if (stopRecording !== null) return;
  stopRecording = await startRecording({
    deviceId,
    clock,
    onLevel: (rms) => void sendMessage({ type: "LEVEL", rms }),
    onDeadMic: (silent) => void sendMessage({ type: "DEAD_MIC", silent }),
    onChunk: async (chunk) => {
      try {
        // The VAD gate (spine §6.3): a chunk with nothing loud enough in it is never uploaded.
        if (chunk.peakRms < VAD_PEAK_RMS_THRESHOLD || chunk.blob.size === 0) {
          await sendMessage({
            type: "CHUNK_SKIPPED",
            offsetMs: chunk.offsetMs,
          });
          return;
        }
        await putChunk({
          offsetMs: chunk.offsetMs,
          sessionId: sessionId!,
          durationMs: chunk.durationMs,
          blob: chunk.blob,
          uploaded: false,
        });
        await sendMessage({
          type: "CHUNK_STORED",
          offsetMs: chunk.offsetMs,
          durationMs: chunk.durationMs,
        });
      } catch (err) {
        await sendMessage({
          type: "RECORDER_ERROR",
          message: `could not store a chunk: ${(err as Error).message}`,
        });
      }
    },
  });
}

async function handleStop() {
  if (stopRecording === null) return;
  const stop = stopRecording;
  stopRecording = null;
  await stop();
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  const message = parseMessage(raw);
  if (message === null) return false;

  if (message.type === "RECORDER_START") {
    sessionId = message.sessionId;
    handleStart(message.deviceId, {
      startedAt: message.startedAt,
      pausedMs: message.pausedMs,
    })
      .then(() => sendResponse({ ok: true }))
      .catch(async (err: Error) => {
        stopRecording = null;
        await sendMessage({ type: "RECORDER_ERROR", message: err.message });
        sendResponse({ ok: false, error: err.message });
      });
    return true;
  }

  if (message.type === "RECORDER_STOP") {
    handleStop()
      .then(() => sendResponse({ ok: true }))
      .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  return false;
});
