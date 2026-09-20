// Spike B panel: buttons that drive the service worker, and a filmstrip rendered from the
// Blobs in IndexedDB via URL.createObjectURL (no base64 anywhere).
import { getBlob, listIds } from "./idb.js";

const $ = (id) => document.getElementById(id);
const log = (line) => {
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};
let lastId = null;

function verdict(text, pass) {
  const el = $("verdict");
  el.textContent = text;
  el.className =
    "verdict " + (pass === undefined ? "" : pass ? "pass" : "fail");
}

async function send(type, extra = {}) {
  const res = await chrome.runtime.sendMessage({
    target: "service-worker",
    type,
    ...extra,
  });
  if (!res.ok) throw new Error(res.error);
  return res.result;
}

async function renderStrip() {
  const ids = await listIds();
  $("strip").innerHTML = "";
  for (const id of ids.slice(-6)) {
    const record = await getBlob(id);
    const img = document.createElement("img");
    img.src = URL.createObjectURL(record.blob);
    img.title = `${record.width}×${record.height}`;
    $("strip").appendChild(img);
  }
}

$("capture").addEventListener("click", async () => {
  try {
    const r = await send("CAPTURE");
    lastId = r.id;
    log(
      `captured ${r.width}×${r.height} PNG, ${(r.bytes / 1024 / 1024).toFixed(2)} MB in ${r.captureMs} ms from ${r.url}`,
    );
    log(
      `  (window.devicePixelRatio here is ${devicePixelRatio}; compare width to the tab's CSS width × its dpr)`,
    );
    verdict(
      `capture OK: ${r.width}×${r.height}, ${(r.bytes / 1024 / 1024).toFixed(2)} MB`,
      true,
    );
    await renderStrip();
  } catch (err) {
    log(`capture FAILED: ${err.message}`);
    verdict(`FAIL: ${err.message}`, false);
  }
});

$("burst").addEventListener("click", async () => {
  try {
    const r = await send("BURST");
    const ok = r.results.filter((x) => x.ok).length;
    const errors = r.results.filter((x) => !x.ok).map((x) => x.error);
    log(
      `burst: ${ok}/5 succeeded in ${r.totalMs} ms` +
        (errors.length ? `; errors: ${[...new Set(errors)].join(" | ")}` : ""),
    );
    verdict(
      `burst: ${ok}/5 in ${r.totalMs} ms — ${errors.length ? "rate limit hit (expected; the real queue paces to ≤2/s)" : "no rate-limit error"}`,
      true,
    );
    await renderStrip();
  } catch (err) {
    log(`burst FAILED: ${err.message}`);
  }
});

$("upload").addEventListener("click", async () => {
  if (!lastId) return verdict("capture something first", false);
  try {
    const r = await send("UPLOAD", { id: lastId });
    log(
      `upload: PUT ${r.putStatus} in ${r.putMs} ms → ${r.path}; server sees ${r.sizeOnServer} bytes; sizes match: ${r.sizeMatches}`,
    );
    verdict(
      r.sizeMatches
        ? `PASS: upload round-trip OK (${r.putMs} ms)`
        : `FAIL: size mismatch`,
      r.sizeMatches,
    );
  } catch (err) {
    log(`upload FAILED: ${err.message}`);
    verdict(`FAIL: ${err.message}`, false);
  }
});

$("big").addEventListener("click", async () => {
  try {
    const r = await send("UPLOAD_BIG");
    log(
      `6 MB upload: PUT ${r.putStatus} in ${r.putMs} ms; server sees ${r.sizeOnServer} bytes; match: ${r.sizeMatches}`,
    );
    verdict(
      r.sizeMatches
        ? `PASS: 6 MB accepted (${r.putMs} ms)`
        : `FAIL: size mismatch`,
      r.sizeMatches,
    );
  } catch (err) {
    log(`6 MB upload FAILED: ${err.message}`);
    verdict(`FAIL (6 MB): ${err.message}`, false);
  }
});

$("clear").addEventListener("click", async () => {
  await send("CLEAR");
  lastId = null;
  await renderStrip();
  log("IndexedDB cleared");
});

fetch("http://localhost:3999/buckets")
  .then((r) => r.json())
  .then((b) => {
    $("server").textContent = `up; buckets: ${b.buckets.join(", ")}`;
    if (!b.buckets.includes("originals"))
      log("WARNING: no 'originals' bucket — did 0001_init.sql run?");
  })
  .catch(() => ($("server").textContent = "not running"));

renderStrip();
