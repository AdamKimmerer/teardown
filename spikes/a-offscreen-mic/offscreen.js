// Spike A offscreen document: getUserMedia + MediaRecorder for 10 s, RMS level every 100 ms.
// Everything it learns is both messaged to the panel and written to chrome.storage.local, so the
// result survives the panel being closed mid-recording (the thing this spike exists to prove).

let recorder = null;
let stream = null;
let levelTimer = null;

function toPanel(message) {
  chrome.runtime.sendMessage({ target: "panel", ...message }).catch(() => {});
}

async function record(seconds, deviceId) {
  const startedAt = Date.now();
  await chrome.storage.local.set({ spikeA: { state: "starting", startedAt } });

  const constraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
  };
  stream = await navigator.mediaDevices.getUserMedia(constraints);
  const track = stream.getAudioTracks()[0];
  toPanel({
    type: "STARTED",
    label: track.label,
    settings: track.getSettings(),
  });

  // Level meter: RMS of the time-domain signal, sampled every 100 ms.
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let peakRms = 0;
  let zeroSamples = 0;
  levelTimer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const rms = Math.sqrt(sum / samples.length);
    peakRms = Math.max(peakRms, rms);
    if (rms < 0.0001) zeroSamples += 1;
    toPanel({ type: "LEVEL", rms });
  }, 100);

  // MediaRecorder in 1 s slices, like the real recorder will do in 15-30 s chunks.
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus"
    : "";
  recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise((resolve) => {
    recorder.onstop = resolve;
  });
  recorder.start(1000);
  await chrome.storage.local.set({ spikeA: { state: "recording", startedAt } });

  await new Promise((r) => setTimeout(r, seconds * 1000));
  recorder.stop();
  await done;

  clearInterval(levelTimer);
  track.stop();
  await audioContext.close();

  const bytes = chunks.reduce((n, c) => n + c.size, 0);
  const result = {
    state: "done",
    startedAt,
    durationMs: Date.now() - startedAt,
    mimeType: recorder.mimeType,
    chunkCount: chunks.length,
    bytes,
    peakRms,
    zeroSamples,
  };
  await chrome.storage.local.set({ spikeA: result });
  toPanel({ type: "DONE", ...result });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.target !== "offscreen") return;
  if (message.type === "START") {
    record(message.seconds ?? 10, message.deviceId).catch(async (err) => {
      const result = { state: "error", name: err.name, message: err.message };
      await chrome.storage.local.set({ spikeA: result });
      toPanel({ type: "ERROR", ...result });
    });
  }
});
