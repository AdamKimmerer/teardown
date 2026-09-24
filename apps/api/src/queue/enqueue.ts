import type { PgBoss } from "pg-boss";
import { QUEUES } from "./boss.js";

export type TranscribeChunkJob = { chunkId: string };

// Queues a chunk for transcription. singletonKey means a re-registered chunk does not get a
// second job while the first is still queued; retries back off for transient OpenAI errors.
export async function enqueueTranscribeChunk(
  boss: PgBoss,
  job: TranscribeChunkJob,
): Promise<void> {
  await boss.send(QUEUES.transcribeChunk, job, {
    singletonKey: job.chunkId,
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
    expireInSeconds: 300,
  });
}

export type GenerateJob = { sessionId: string };

// Queues a generation. No automatic retry: a failure is recorded on the session and the user
// retries (the OpenAI SDK already retries transient errors inside the call). singletonKey stops a
// double-clicked Generate from queuing twice.
export async function enqueueGenerate(
  boss: PgBoss,
  job: GenerateJob,
): Promise<void> {
  await boss.send(QUEUES.generate, job, {
    singletonKey: job.sessionId,
    retryLimit: 0,
    expireInSeconds: 1_800,
  });
}
