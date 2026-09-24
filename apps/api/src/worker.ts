import { createBoss, ensureQueues, QUEUES } from "./queue/boss.js";
import type { GenerateJob, TranscribeChunkJob } from "./queue/enqueue.js";
import { generateJob } from "./jobs/generate.js";
import { transcribeChunkJob } from "./jobs/transcribeChunk.js";

// The worker process: the same codebase as the API, started separately, consuming the queues.
// The export handler is added in Phase 7.

const boss = createBoss("worker");

boss.on("error", (err) => console.error("pg-boss error", err));

await boss.start();
await ensureQueues(boss);

// pg-boss hands each handler an array of jobs; with the default batch size that is one job.
await boss.work<TranscribeChunkJob>(QUEUES.transcribeChunk, async (jobs) => {
  for (const job of jobs) {
    await transcribeChunkJob(job.data);
  }
});

await boss.work<GenerateJob>(QUEUES.generate, async (jobs) => {
  for (const job of jobs) {
    await generateJob(job.data);
  }
});

console.log(`worker listening on queues: ${Object.values(QUEUES).join(", ")}`);
