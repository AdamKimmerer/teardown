import { transcribeAudio } from "../ai/transcribe.js";
import { TRANSCRIBE_MODEL, TRANSCRIBE_USD_PER_MINUTE } from "../ai/models.js";
import {
  findChunk,
  previousChunkEndMs,
  updateChunkStatus,
} from "../db/queries/audioChunks.js";
import { findSession } from "../db/queries/sessions.js";
import {
  deleteTranscriptWordsForChunk,
  insertTranscriptWords,
  type NewTranscriptWord,
} from "../db/queries/transcriptWords.js";
import { insertUsageEvent } from "../db/queries/usageEvents.js";
import { BUCKETS } from "../storage/client.js";
import { downloadObject } from "../storage/downloadObject.js";
import type { TranscribeChunkJob } from "../queue/enqueue.js";

// Transcribes one uploaded chunk and writes its words onto the session clock (spine §9.1).
// Runs in the worker; a thrown error marks the chunk failed and lets pg-boss retry.
export async function transcribeChunkJob({
  chunkId,
}: TranscribeChunkJob): Promise<void> {
  const chunk = await findChunk(chunkId);
  if (chunk === null) return; // the session was deleted before we got here
  const session = await findSession(chunk.sessionId);
  if (session === null) return;

  try {
    const audio = await downloadObject(BUCKETS.audio, chunk.storagePath);
    const transcription = await transcribeAudio(audio);

    // Chunks overlap by about a second. Words that start before the previous chunk ended were
    // already transcribed from that chunk, so they are dropped here (decision: earlier chunk
    // owns the overlap; spine §17 N asks to measure how often this splits a word).
    const overlapEndMs = await previousChunkEndMs(
      chunk.sessionId,
      chunk.offsetMs,
    );
    const rebased = transcription.words.map((w) => ({
      word: w.word,
      startMs: chunk.offsetMs + w.startMs,
      endMs: chunk.offsetMs + w.endMs,
    }));
    const kept = rebased.filter((w) => w.startMs >= overlapEndMs);
    const words: NewTranscriptWord[] = kept.map((w, ordinal) => ({
      sessionId: chunk.sessionId,
      chunkId: chunk.id,
      ...w,
      ordinal,
    }));

    await deleteTranscriptWordsForChunk(chunk.id);
    await insertTranscriptWords(words);
    await updateChunkStatus(chunk.id, "transcribed");

    await insertUsageEvent({
      userId: session.userId,
      sessionId: session.id,
      kind: "transcribe",
      model: TRANSCRIBE_MODEL,
      audioSeconds: transcription.durationSeconds,
      costUsdEstimate:
        (transcription.durationSeconds / 60) * TRANSCRIBE_USD_PER_MINUTE,
    });

    console.log(
      `transcribed chunk ${chunk.id} (offset ${chunk.offsetMs} ms): ${words.length} words kept, ` +
        `${rebased.length - kept.length} dropped in overlap, ${transcription.durationSeconds.toFixed(1)} s audio`,
    );
  } catch (err) {
    await updateChunkStatus(chunk.id, "failed");
    throw err;
  }
}
