// The offscreen document hosts the recorder (spine §8.4). Created once per session; closed
// after Generate or when the session is thrown away. It may only use chrome.runtime messaging
// (spike A), so everything it needs arrives in RECORDER_START.

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");

let creating: Promise<void> | null = null;

export async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [OFFSCREEN_URL],
  });
  return contexts.length > 0;
}

// Creates the document if needed; concurrent callers share one creation.
export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (creating === null) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Record the microphone while a walkthrough is narrated",
    });
  }
  try {
    await creating;
  } finally {
    creating = null;
  }
}

export async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}
