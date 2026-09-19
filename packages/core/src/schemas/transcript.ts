import { z } from "zod";

export const AudioChunkStatusSchema = z.enum([
  "uploaded",
  "transcribed",
  "failed",
]);

export type AudioChunkStatus = z.infer<typeof AudioChunkStatusSchema>;

// One VAD-passed audio chunk. offsetMs is where it starts on the session clock.
export const AudioChunkSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  offsetMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  storagePath: z.string(),
  status: AudioChunkStatusSchema,
  createdAt: z.iso.datetime(),
});

export type AudioChunk = z.infer<typeof AudioChunkSchema>;

// One transcribed word, already rebased from chunk time onto the session clock.
export const TranscriptWordSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  chunkId: z.uuid(),
  word: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  // Position within the chunk, so words with equal timestamps keep their spoken order.
  ordinal: z.number().int().nonnegative(),
});

export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;
