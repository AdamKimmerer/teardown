// Spike A panel: grants permission (two paths), starts a recording in the offscreen document,
// shows the level meter, and renders a PASS/FAIL verdict from the offscreen document's result.

const $ = (id) => document.getElementById(id);
const log = (line) => {
  $("log").textContent += line + "\n";
  $("log").scrollTop = $("log").scrollHeight;
};

async function showPermissionState() {
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    $("perm").textContent = status.state;
    status.onchange = () => ($("perm").textContent = status.state);
  } catch (err) {
    $("perm").textContent = `query failed: ${err.message}`;
  }
}

async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === "audioinput");
  $("device").innerHTML =
    `<option value="">default microphone</option>` +
    mics
      .map(
        (d) =>
          `<option value="${d.deviceId}">${d.label || "(unnamed)"}</option>`,
      )
      .join("");
  log(
    `${mics.length} audio input(s)${mics.some((d) => d.label) ? "" : " (labels hidden until permission is granted)"}`,
  );
}

function showVerdict(result) {
  const el = $("verdict");
  el.className = "verdict";
  if (!result) return;
  if (result.state === "error") {
    el.className += " fail";
    el.textContent = `FAIL: ${result.name}: ${result.message}`;
  } else if (result.state === "done") {
    const heard = result.peakRms > 0.01;
    el.className += heard ? " pass" : " fail";
    el.textContent = heard
      ? `PASS: ${result.chunkCount} chunks, ${result.bytes} bytes, peak RMS ${result.peakRms.toFixed(3)}`
      : `FAIL (silent): recorded ${result.bytes} bytes but peak RMS ${result.peakRms.toFixed(4)} — mic muted or wrong device?`;
  } else {
    el.textContent = `state: ${result.state}`;
  }
}

$("grant-panel").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    log(`panel getUserMedia OK: ${stream.getAudioTracks()[0].label}`);
    stream.getTracks().forEach((t) => t.stop());
    await listDevices();
  } catch (err) {
    log(`panel getUserMedia FAILED: ${err.name}: ${err.message}`);
    log("→ try 1b (full-tab page). Note which path worked in docs/spikes.md.");
  }
  showPermissionState();
});

$("grant-tab").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
});

$("start").addEventListener("click", async () => {
  $("verdict").textContent = "recording…";
  $("verdict").className = "verdict";
  const ensure = await chrome.runtime.sendMessage({
    target: "service-worker",
    type: "ENSURE_OFFSCREEN",
  });
  log(
    `offscreen document: ${ensure.ok ? ensure.result : "FAILED " + ensure.error}`,
  );
  if (!ensure.ok) return;
  chrome.runtime.sendMessage({
    target: "offscreen",
    type: "START",
    seconds: 10,
    deviceId: $("device").value || undefined,
  });
  log("sent START; you can close and reopen this panel during the 10 s");
});

$("close").addEventListener("click", async () => {
  const r = await chrome.runtime.sendMessage({
    target: "service-worker",
    type: "CLOSE_OFFSCREEN",
  });
  log(`close offscreen: ${r.ok ? "ok" : r.error}`);
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "panel") return;
  if (message.type === "STEP") {
    log(message.text);
  } else if (message.type === "LEVEL") {
    $("level").style.width = `${Math.min(100, message.rms * 400)}%`;
  } else if (message.type === "STARTED") {
    log(
      `offscreen recording from: ${message.label} (${JSON.stringify(message.settings)})`,
    );
  } else if (message.type === "DONE") {
    $("level").style.width = "0";
    log(`done: ${JSON.stringify(message)}`);
    showVerdict(message);
  } else if (message.type === "ERROR") {
    log(`offscreen ERROR: ${message.name}: ${message.message}`);
    showVerdict(message);
  }
});

// On open, show whatever the offscreen document last wrote — this is how a reopened panel
// finds out what happened while it was closed.
chrome.storage.local.get("spikeA").then(({ spikeA }) => {
  if (spikeA) {
    log(`last result from storage: ${JSON.stringify(spikeA)}`);
    showVerdict(spikeA);
  }
});
// Device labels appear only after permission is granted, which may happen in another tab (the
// fallback page), so re-list whenever devices change or this panel becomes visible again.
navigator.mediaDevices.addEventListener("devicechange", listDevices);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    listDevices();
    showPermissionState();
  }
});

showPermissionState();
listDevices();
