import { insertCaptureMarkers } from "@teardown/core/markers";
import type { Capture } from "@teardown/core/schemas/capture";
import { listSessionWords } from "../db/queries/audioChunks.js";

// The whole narration with [CAPTURE n] at each capture's word position (spine §9.2). Captures
// must be in listCapturesForSession order, which is the order images are numbered in.
export async function markedTranscript(
  sessionId: string,
  captures: Capture[],
): Promise<string> {
  const words = await listSessionWords(sessionId);
  return insertCaptureMarkers(words, captures);
}
