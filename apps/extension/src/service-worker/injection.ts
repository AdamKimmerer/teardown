import { sendToTab } from "../shared/messages.js";

// The in-page controls are injected on demand (spine §4: no declared content_scripts) into the
// tab the user is looking at while a session records. Whether they are visible is not messaged:
// each content script watches the session in chrome.storage and shows itself only while
// recording. That matters because Chrome freezes background tabs, and a message to a frozen tab
// can wait forever; storage changes simply reach a frozen tab when it wakes.

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab ?? null;
}

// Makes sure the tab has the controls: asks the content script if it is there (with a
// timeout), and injects it if not. False on pages Chrome will not let us into (chrome://, the
// Web Store, PDFs). Callers do not wait on this before changing session state.
export async function ensureControlsInTab(tabId: number): Promise<boolean> {
  if (await sendToTab(tabId, { type: "PING" })) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    return true;
  } catch {
    return false;
  }
}

// Keeps the controls on the active tab as the user switches tabs and navigates.
export function followActiveTab(isRecording: () => Promise<boolean>): void {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if (await isRecording()) await ensureControlsInTab(tabId);
  });
  chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status === "complete" && tab.active && (await isRecording())) {
      await ensureControlsInTab(tabId);
    }
  });
}
