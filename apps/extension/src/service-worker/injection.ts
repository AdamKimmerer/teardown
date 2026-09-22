import { sendToTab } from "../shared/messages.js";

// The in-page controls are injected on demand (spine §4: no declared content_scripts), into
// whichever tab the user is looking at while a session is recording.

export async function activeTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab ?? null;
}

// False on pages Chrome will not let us into (chrome://, the Web Store, PDFs).
async function injectContentScript(tabId: number): Promise<boolean> {
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

// Tells the tab's content script whether a session is recording, injecting it first if the tab
// has none. Hiding never injects: a tab that never had controls has nothing to hide.
export async function showControlsInTab(
  tabId: number,
  recording: boolean,
): Promise<void> {
  const delivered = await sendToTab(tabId, {
    type: "SESSION_STATE",
    recording,
  });
  if (delivered || !recording) return;
  if (await injectContentScript(tabId)) {
    await sendToTab(tabId, { type: "SESSION_STATE", recording });
  }
}

export async function hideControlsEverywhere(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) => (tab.id ? showControlsInTab(tab.id, false) : undefined)),
  );
}

// Keeps the controls on the active tab as the user switches tabs and navigates.
export function followActiveTab(isRecording: () => Promise<boolean>): void {
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    if (await isRecording()) await showControlsInTab(tabId, true);
  });
  chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status === "complete" && tab.active && (await isRecording())) {
      await showControlsInTab(tabId, true);
    }
  });
}
