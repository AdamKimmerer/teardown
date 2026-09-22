import { signInWithGoogle, signOut } from "./shared/auth.js";
import { sessionNowMs } from "./shared/clock.js";
import {
  parseMessage,
  sendMessage,
  sendToTab,
  type Message,
} from "./shared/messages.js";
import { getLocalSession } from "./shared/sessionState.js";
import { enqueueCapture } from "./service-worker/captureQueue.js";
import { activeTab, followActiveTab } from "./service-worker/injection.js";
import {
  listenForNudgeAlarms,
  noteChunkSkipped,
  noteChunkStored,
} from "./service-worker/nudges.js";
import {
  deleteCapture,
  dismissSession,
  generateSession,
  panelState,
  recoverOnStartup,
  resumeSession,
  startSession,
  stopSession,
} from "./service-worker/session.js";
import { enqueueUpload } from "./service-worker/uploader.js";
import { api } from "./shared/api.js";

// The service worker: stateless orchestration (spine §4). Everything it needs to remember is in
// chrome.storage or IndexedDB, because Chrome kills it whenever it likes.

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Content scripts read the session clock from chrome.storage.session (spine §8.4).
void chrome.storage.session.setAccessLevel({
  accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

const isRecording = async () =>
  (await getLocalSession())?.status === "recording";

followActiveTab(isRecording);
listenForNudgeAlarms();
void recoverOnStartup();

// ⌘⇧S: ask the page's controls to capture (they hide themselves first); a page without
// controls (chrome://, PDFs) is captured directly as a plain viewport shot.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture" || !(await isRecording())) return;
  const tab = await activeTab();
  if (!tab?.id) return;
  const delivered = await sendToTab(tab.id, { type: "TRIGGER_CAPTURE" });
  if (!delivered) await captureWithoutControls(tab);
});

// One handler per message type the worker answers. Each returns what the sender gets back.
const handlers: {
  [T in Message["type"]]?: (
    m: Extract<Message, { type: T }>,
    sender: chrome.runtime.MessageSender,
  ) => Promise<unknown>;
} = {
  GET_STATE: () => panelState(),
  SIGN_IN: async () => {
    await signInWithGoogle();
    await sendMessage({ type: "STATE_CHANGED" });
    return panelState();
  },
  SIGN_OUT: async () => {
    await signOut();
    await sendMessage({ type: "STATE_CHANGED" });
    return panelState();
  },
  START_SESSION: (m) => startSession(m.deviceId),
  STOP_SESSION: () => stopSession(),
  RESUME_SESSION: () => resumeSession(),
  GENERATE: () => generateSession(),
  DISMISS_SESSION: () => dismissSession(),
  DELETE_CAPTURE: (m) => deleteCapture(m.captureId),
  GET_SUMMARY: async () => {
    const session = await getLocalSession();
    if (session === null) throw new Error("No session");
    return api.sessionSummary(session.id);
  },
  MIC_GRANTED: async () => sendMessage({ type: "STATE_CHANGED" }),

  CAPTURE_FROM_PANEL: async () => {
    const tab = await activeTab();
    if (!tab?.id) throw new Error("No active tab");
    const delivered = await sendToTab(tab.id, { type: "TRIGGER_CAPTURE" });
    if (!delivered) await captureWithoutControls(tab);
  },
  CAPTURE_REQUEST: async (m, sender) => {
    const session = await getLocalSession();
    if (session?.status !== "recording") throw new Error("Not recording");
    const windowId = sender.tab?.windowId;
    if (windowId === undefined)
      throw new Error("Capture request did not come from a tab");
    await enqueueCapture({
      region: m.region,
      viewport: m.viewport,
      tPickStart: m.tPickStart,
      tCapture: m.tCapture,
      url: m.url,
      pageTitle: m.pageTitle,
      sessionId: session.id,
      windowId,
    });
  },

  CHUNK_STORED: async (m) => {
    await noteChunkStored();
    enqueueUpload({ kind: "chunk", offsetMs: m.offsetMs });
  },
  CHUNK_SKIPPED: () => noteChunkSkipped(),
  RECORDER_ERROR: (m) =>
    sendMessage({ type: "PROBLEM", message: `Microphone: ${m.message}` }),
};

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const message = parseMessage(raw);
  if (message === null) return false;
  const handler = handlers[message.type] as
    | ((m: Message, s: chrome.runtime.MessageSender) => Promise<unknown>)
    | undefined;
  if (handler === undefined) return false;
  handler(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err: Error) => sendResponse({ ok: false, error: err.message }));
  return true;
});

// A viewport shot with no content script to hide: dpr is recovered from the tab's CSS width.
async function captureWithoutControls(tab: chrome.tabs.Tab): Promise<void> {
  const session = await getLocalSession();
  if (session === null || tab.id === undefined || tab.windowId === undefined)
    return;
  const t = await sessionNowMs();
  await enqueueCapture({
    sessionId: session.id,
    windowId: tab.windowId,
    region: { mode: "viewport", selectors: [], padding: 0 },
    viewport: { w: tab.width ?? 1, h: tab.height ?? 1, dpr: null },
    tPickStart: t,
    tCapture: t,
    url: tab.url ?? "",
    pageTitle: tab.title ?? "",
  });
}
