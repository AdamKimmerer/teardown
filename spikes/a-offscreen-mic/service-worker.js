// Spike A service worker: creates the offscreen document on request and forwards start/stop.
// The panel and the offscreen document talk to each other directly with runtime messages;
// the worker only exists because chrome.offscreen must be called from here.

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

let creating = null;

// Creates the offscreen document once; concurrent callers share the same promise.
async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL],
  });
  if (contexts.length > 0) return "already open";

  if (creating === null) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ["USER_MEDIA"],
      justification: "Record the microphone for the walkthrough narration",
    });
  }
  try {
    await creating;
  } finally {
    creating = null;
  }
  return "created";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "service-worker") return false;

  if (message.type === "ENSURE_OFFSCREEN") {
    ensureOffscreenDocument()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message.type === "CLOSE_OFFSCREEN") {
    chrome.offscreen
      .closeDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
