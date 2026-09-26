import { sessionElapsedMs } from "@teardown/core/clock";
import { CHUNK_MS, CHUNK_OVERLAP_MS } from "../shared/constants.js";
import { startLevelMeter } from "./levelMeter.js";

// The recording engine (spine §9.1): the microphone, chunked into standalone recordings.
// Two MediaRecorders alternate so each chunk has its own container header (a single recorder
// with a timeslice produces fragments Whisper cannot read); the next chunk starts
// CHUNK_OVERLAP_MS before the current one stops, so no word falls in a gap. Each chunk carries
// its start on the session clock and the loudest level seen while it ran, for the VAD gate.

export type FinishedChunk = {
  blob: Blob;
  offsetMs: number;
  durationMs: number;
  peakRms: number;
};

export type RecorderOptions = {
  deviceId: string | undefined;
  clock: { startedAt: number; pausedMs: number };
  onChunk: (chunk: FinishedChunk) => Promise<void>;
  onLevel: (rms: number) => void;
  onDeadMic: (silent: boolean) => void;
};

type ActiveChunk = {
  recorder: MediaRecorder;
  offsetMs: number;
  peakRms: number;
  blob: Promise<Blob>;
};

const MIME = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ? "audio/webm;codecs=opus"
  : "audio/webm";

export async function startRecording(
  options: RecorderOptions,
): Promise<() => Promise<void>> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: options.deviceId ? { deviceId: { exact: options.deviceId } } : true,
  });
  const now = () =>
    sessionElapsedMs(options.clock.startedAt, options.clock.pausedMs);
  const active = new Set<ActiveChunk>();
  let stopped = false;
  let rotation: ReturnType<typeof setTimeout> | null = null;

  const stopMeter = startLevelMeter(stream, {
    onLevel: options.onLevel,
    onDeadMic: options.onDeadMic,
    onSample: (rms) =>
      active.forEach((chunk) => (chunk.peakRms = Math.max(chunk.peakRms, rms))),
  });

  function startChunk(): ActiveChunk {
    const recorder = new MediaRecorder(stream, { mimeType: MIME });
    const blob = new Promise<Blob>((resolve) => {
      const parts: Blob[] = [];
      recorder.ondataavailable = (e) => parts.push(e.data);
      recorder.onstop = () => resolve(new Blob(parts, { type: MIME }));
    });
    recorder.start();
    const chunk = { recorder, offsetMs: now(), peakRms: 0, blob };
    active.add(chunk);
    return chunk;
  }

  async function finishChunk(chunk: ActiveChunk): Promise<void> {
    chunk.recorder.stop();
    const blob = await chunk.blob;
    active.delete(chunk);
    await options.onChunk({
      blob,
      offsetMs: chunk.offsetMs,
      durationMs: now() - chunk.offsetMs,
      peakRms: chunk.peakRms,
    });
  }

  let current = startChunk();
  let rotating: Promise<void> | null = null;

  // Every CHUNK_MS: start the next chunk, let the two overlap, then finish the current one.
  async function rotate(): Promise<void> {
    const next = startChunk();
    await new Promise((r) => setTimeout(r, CHUNK_OVERLAP_MS));
    const finished = current;
    current = next;
    if (!stopped) scheduleRotation();
    await finishChunk(finished);
  }
  function scheduleRotation(): void {
    rotation = setTimeout(() => {
      rotating = rotate().finally(() => (rotating = null));
    }, CHUNK_MS - CHUNK_OVERLAP_MS);
  }
  scheduleRotation();

  // Stopping in the middle of a rotation waits for it, so both overlapping chunks are finished
  // exactly once and the newest one (with the latest audio) is the one stopped here.
  return async function stop() {
    stopped = true;
    if (rotation !== null) clearTimeout(rotation);
    if (rotating !== null) await rotating;
    await finishChunk(current);
    await stopMeter();
    stream.getTracks().forEach((track) => track.stop());
  };
}
