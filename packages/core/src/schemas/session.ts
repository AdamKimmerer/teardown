import { z } from "zod";

// Session state machine: recording → review → syncing → processing → ready (or failed).
export const SessionStatusSchema = z.enum([
  "recording",
  "review",
  "syncing",
  "processing",
  "ready",
  "failed",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

// A recording session. startedAt and pausedMs are the session clock epoch (spine §8.4).
export const SessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  status: SessionStatusSchema,
  startedAt: z.iso.datetime(),
  pausedMs: z.number().int().nonnegative(),
  stoppedAt: z.iso.datetime().nullable(),
  title: z.string().nullable(),
  // Which processing step failed, so a retry can resume from it instead of starting over.
  failedStep: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type Session = z.infer<typeof SessionSchema>;
