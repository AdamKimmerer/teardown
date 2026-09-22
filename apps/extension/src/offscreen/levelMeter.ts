import { DEAD_MIC_MS, DEAD_MIC_RMS } from "../shared/constants.js";

// Reads the microphone's loudness (RMS of the time-domain signal) every 100 ms for the panel's
// meter, for each chunk's VAD peak, and for the dead-mic warning (spine §7).

export type LevelListener = {
  onLevel: (rms: number) => void;
  onDeadMic: (silent: boolean) => void;
  onSample: (rms: number) => void;
};

export function startLevelMeter(
  stream: MediaStream,
  listener: LevelListener,
): () => Promise<void> {
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  audioContext.createMediaStreamSource(stream).connect(analyser);
  // A page with no window never gets a user gesture, so resume explicitly (spike A).
  void audioContext.resume();

  const samples = new Float32Array(analyser.fftSize);
  let silentMs = 0;
  let deadMicReported = false;

  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = rootMeanSquare(samples);
    listener.onLevel(rms);
    listener.onSample(rms);

    silentMs = rms < DEAD_MIC_RMS ? silentMs + 100 : 0;
    if (silentMs >= DEAD_MIC_MS && !deadMicReported) {
      deadMicReported = true;
      listener.onDeadMic(true);
    } else if (silentMs === 0 && deadMicReported) {
      deadMicReported = false;
      listener.onDeadMic(false);
    }
  }, 100);

  return async () => {
    clearInterval(timer);
    await audioContext.close();
  };
}

function rootMeanSquare(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}
