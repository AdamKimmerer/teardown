import { PgBoss } from "pg-boss";
import { config } from "../config.js";

// The three job queues (build plan §Stack). Names are the only thing shared between the
// API, which sends, and the worker, which works.
export const QUEUES = {
  transcribeChunk: "transcribe-chunk",
  generate: "generate",
  export: "export",
} as const;

// The API only sends, so it runs no maintenance; the worker supervises the queue. Pool sizes are
// small because both processes share the Supabase session pooler's connection budget.
export function createBoss(role: "api" | "worker"): PgBoss {
  return new PgBoss({
    connectionString: config.DATABASE_URL,
    schema: "pgboss",
    max: role === "worker" ? 3 : 2,
    supervise: role === "worker",
    schedule: false,
  });
}

// Creates any queue that does not exist yet; safe to call on every start.
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    const existing = await boss.getQueue(name);
    if (existing === null) {
      await boss.createQueue(name);
    }
  }
}
