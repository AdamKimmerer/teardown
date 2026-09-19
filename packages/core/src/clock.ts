// Elapsed session time in ms. Every runtime (content script, panel, offscreen document, service
// worker, API) computes this from the same startedAt epoch and pausedMs accumulator, so audio
// offsets, capture timestamps, and transcript words all share one clock (spine §8.4).
export function sessionElapsedMs(
  startedAt: number,
  pausedMs: number,
  now: number = Date.now(),
): number {
  return Math.max(0, now - startedAt - pausedMs);
}
