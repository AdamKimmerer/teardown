// Spike B service worker: the capture and upload paths the real extension will use.
//   CAPTURE      captureVisibleTab → PNG data URL → Blob → IndexedDB
//   BURST        five captures back to back, to observe Chrome's rate limit
//   UPLOAD       read Blob from IndexedDB → presign (local server) → PUT to signed URL → verify
//   UPLOAD_BIG   same with a synthetic 6 MB blob, to answer the "PNG over 5 MB" question
import { getBlob, putBlob, deleteAll } from "./idb.js";

const PRESIGN_SERVER = "http://localhost:3999";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

async function captureActiveTab() {
  const t0 = performance.now();
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png",
  });
  const captureMs = performance.now() - t0;

  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const id = crypto.randomUUID();
  const record = {
    blob,
    width: bitmap.width,
    height: bitmap.height,
    createdAt: Date.now(),
    url: tab.url,
  };
  bitmap.close();
  await putBlob(id, record);

  return {
    id,
    bytes: blob.size,
    width: record.width,
    height: record.height,
    captureMs: Math.round(captureMs),
    url: tab.url,
  };
}

async function burst(n) {
  const results = [];
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: n }, () =>
      captureActiveTab()
        .then((r) => results.push({ ok: true, ...r }))
        .catch((err) => results.push({ ok: false, error: err.message })),
    ),
  );
  return { totalMs: Math.round(performance.now() - t0), results };
}

async function presign(bucket, path) {
  const res = await fetch(`${PRESIGN_SERVER}/presign`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });
  if (!res.ok) throw new Error(`presign ${res.status}: ${await res.text()}`);
  return res.json();
}

async function verify(bucket, path) {
  const res = await fetch(`${PRESIGN_SERVER}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ bucket, path }),
  });
  if (!res.ok) throw new Error(`verify ${res.status}: ${await res.text()}`);
  return res.json();
}

// Uploads a blob exactly the way production will: presign on the server, raw PUT from the client.
async function uploadBlob(blob, bucket, path, contentType) {
  const signed = await presign(bucket, path);
  const t0 = performance.now();
  const put = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: blob,
  });
  const putMs = Math.round(performance.now() - t0);
  const putBody = await put.text();
  if (!put.ok) throw new Error(`PUT ${put.status}: ${putBody}`);
  const seen = await verify(bucket, path);
  return {
    path,
    putStatus: put.status,
    putMs,
    sizeOnServer: seen.size,
    sizeMatches: seen.size === blob.size,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "service-worker") return false;

  const handlers = {
    CAPTURE: () => captureActiveTab(),
    BURST: () => burst(5),
    UPLOAD: async () => {
      const record = await getBlob(message.id);
      if (!record) throw new Error("no such capture in IndexedDB");
      return uploadBlob(
        record.blob,
        "originals",
        `spike/${message.id}.png`,
        "image/png",
      );
    },
    UPLOAD_BIG: async () => {
      const big = new Blob([
        crypto.getRandomValues(new Uint8Array(6 * 1024 * 1024)),
      ]);
      return uploadBlob(
        big,
        "originals",
        `spike/big-6mb.bin`,
        "application/octet-stream",
      );
    },
    CLEAR: () => deleteAll().then(() => ({ cleared: true })),
  };

  const handler = handlers[message.type];
  if (!handler) return false;
  handler()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
