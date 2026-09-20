// Spike C service worker: injects the content script on demand (as the real extension will on
// session start, instead of a declared content_scripts entry) and takes screenshots on request so
// the content script can prove its UI was hidden in time.

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "CAPTURE_TEST") return false;
  chrome.tabs
    .captureVisibleTab(sender.tab.windowId, { format: "png" })
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
