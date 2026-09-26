import { api, ApiError } from "../shared/api.js";
import { getAuthSession } from "../shared/auth.js";
import { buildConfig } from "../shared/buildConfig.js";
import {
  clearBuffer,
  deleteCapture as deleteStoredCapture,
  deleteCaptureBlob,
  getCapture,
} from "../shared/idb.js";
import { sendMessage } from "../shared/messages.js";
import type { PanelState } from "../shared/panelState.js";
import {
  clearClock,
  clearLocalSession,
  getClock,
  getLocalSession,
  setClock,
  setLocalSession,
  updateLocalSession,
  type LocalSession,
  type LocalSessionStatus,
} from "../shared/sessionState.js";
import { activeTab, ensureControlsInTab } from "./injection.js";
import { clearNudges, scheduleForgotToStopNudge } from "./nudges.js";
import {
  closeOffscreenDocument,
  ensureOffscreenDocument,
  hasOffscreenDocument,
} from "./offscreen.js";
import { drainUploads, resumePendingUploads } from "./uploader.js";

// The session lifecycle from the extension's side (spine §11): start, stop, keep going,
// generate, throw away, and recovery after the service worker or browser restarts.

export async function panelState(): Promise<PanelState> {
  const auth = await getAuthSession();
  return {
    signedIn: auth !== null,
    email: auth?.user.email ?? null,
    session: await getLocalSession(),
    webAppUrl: buildConfig.webAppUrl,
  };
}

async function broadcastState(): Promise<void> {
  await sendMessage({ type: "STATE_CHANGED" });
}

async function requireSession(
  status: LocalSessionStatus,
): Promise<LocalSession> {
  const session = await getLocalSession();
  if (session === null) throw new Error("No session in progress");
  if (session.status !== status)
    throw new Error(`Session is ${session.status}`);
  return session;
}

// Start: server row at the clock epoch, recorder in the offscreen document, controls in the
// active tab, nudge timer.
export async function startSession(
  deviceId: string | undefined,
): Promise<void> {
  if ((await getLocalSession()) !== null)
    throw new Error("A session is already in progress");
  const startedAt = Date.now();
  const { session } = await api.createSession({
    startedAt: new Date(startedAt).toISOString(),
  });
  await setClock({ startedAt, pausedMs: 0 });
  await setLocalSession({
    id: session.id,
    status: "recording",
    startedAt,
    pausedMs: 0,
    stoppedAt: null,
    deviceId,
    skippedChunksInARow: 0,
  });
  await startRecorder(session.id, deviceId, startedAt, 0);
  scheduleForgotToStopNudge();
  await broadcastState();
  void showControlsInActiveTab();
}

// Stop: the recorder flushes its last chunk, every upload finishes, then the server is told.
export async function stopSession(): Promise<void> {
  const session = await requireSession("recording");
  // Stamp the stop when the microphone stops, not after the uploads drain: the drain can take
  // seconds, and that time is neither recorded nor paused, so it would open a hole in the clock.
  const stoppedAt = Date.now();
  await sendMessage({ type: "RECORDER_STOP" });
  await drainUploads();
  await api.stopSession(session.id, {
    stoppedAt: new Date(stoppedAt).toISOString(),
    pausedMs: session.pausedMs,
  });
  await updateLocalSession({ status: "review", stoppedAt });
  clearNudges();
  await broadcastState();
}

// Keep going: the time spent stopped becomes paused time, so the clock stays continuous.
export async function resumeSession(): Promise<void> {
  const session = await requireSession("review");
  const pausedMs =
    session.pausedMs + (Date.now() - (session.stoppedAt ?? Date.now()));
  await api.resumeSession(session.id, { pausedMs });
  await setClock({ startedAt: session.startedAt, pausedMs });
  await updateLocalSession({ status: "recording", pausedMs, stoppedAt: null });
  await startRecorder(
    session.id,
    session.deviceId,
    session.startedAt,
    pausedMs,
  );
  scheduleForgotToStopNudge();
  await broadcastState();
  void showControlsInActiveTab();
}

// Generate: hand off to the web app. The local buffer is cleared once the server accepts, since
// from here on the server is the source of truth (spine §10.2).
export async function generateSession(): Promise<string> {
  const session = await requireSession("review");
  try {
    await api.generate(session.id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 402)
      throw new Error("out_of_credits");
    if (err instanceof ApiError && err.status === 404)
      throw new Error("Generation is not available yet");
    throw err;
  }
  const url = `${buildConfig.webAppUrl}/sessions/${session.id}`;
  await chrome.tabs.create({ url });
  await forgetSession();
  return url;
}

// Throw the local copy away. The server keeps the session for the web app's library.
export async function dismissSession(): Promise<void> {
  const session = await getLocalSession();
  if (session?.status === "recording")
    await sendMessage({ type: "RECORDER_STOP" });
  clearNudges();
  await forgetSession();
}

export async function deleteCapture(captureId: string): Promise<void> {
  const session = await getLocalSession();
  const stored = await getCapture(captureId);
  if (session && stored?.uploaded)
    await api.deleteCapture(session.id, captureId);
  await deleteCaptureBlob(captureId);
  await deleteStoredCapture(captureId);
  await sendMessage({ type: "CAPTURE_DELETED", captureId });
}

// On every service-worker start: a recording whose clock is gone was interrupted by a browser
// restart, so it becomes a review session; a recording whose offscreen document is gone gets
// its recorder back; anything not yet uploaded goes back on the queue.
export async function recoverOnStartup(): Promise<void> {
  const session = await getLocalSession();
  if (session === null) return;
  if (session.status === "recording") {
    const clock = await getClock();
    if (clock === null) {
      await updateLocalSession({ status: "review", stoppedAt: Date.now() });
      await api
        .stopSession(session.id, {
          stoppedAt: new Date().toISOString(),
          pausedMs: session.pausedMs,
        })
        .catch(() => {});
    } else if (!(await hasOffscreenDocument())) {
      await startRecorder(
        session.id,
        session.deviceId,
        clock.startedAt,
        clock.pausedMs,
      );
    }
  }
  await resumePendingUploads();
}

async function startRecorder(
  sessionId: string,
  deviceId: string | undefined,
  startedAt: number,
  pausedMs: number,
): Promise<void> {
  await ensureOffscreenDocument();
  await sendMessage({
    type: "RECORDER_START",
    sessionId,
    deviceId,
    startedAt,
    pausedMs,
  });
}

// Not awaited by callers: session state never waits on a tab (see injection.ts).
async function showControlsInActiveTab(): Promise<void> {
  const tab = await activeTab();
  if (tab?.id) await ensureControlsInTab(tab.id);
}

async function forgetSession(): Promise<void> {
  await clearBuffer();
  await clearLocalSession();
  await clearClock();
  await closeOffscreenDocument();
  await broadcastState();
}
