import { Hono } from "hono";
import {
  CreateSessionRequestSchema,
  ListSessionsResponseSchema,
  SessionDetailResponseSchema,
  SessionResponseSchema,
  SessionSummaryResponseSchema,
  StopSessionRequestSchema,
} from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import {
  countCapturesForSession,
  listCapturesForSession,
} from "../db/queries/captures.js";
import { findDocumentIdForSession } from "../db/queries/documents.js";
import {
  createSession,
  deleteSession,
  listSessionsForUser,
  stopSession,
} from "../db/queries/sessions.js";
import { countTranscriptWordsForSession } from "../db/queries/transcriptWords.js";
import { requireAuth } from "../middleware/auth.js";
import { BUCKETS } from "../storage/client.js";
import { deletePrefix } from "../storage/deleteObjects.js";
import { sessionPrefix } from "../storage/objectKeys.js";
import { assertSessionStatus, ownedSession } from "./ownedSession.js";

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use(requireAuth);

// POST /v1/sessions — the extension starts a session at its clock epoch.
sessionRoutes.post("/", async (c) => {
  const body = CreateSessionRequestSchema.parse(await c.req.json());
  const session = await createSession(c.get("userId"), body.startedAt);
  return c.json(SessionResponseSchema.parse({ session }), 201);
});

// GET /v1/sessions — the library, newest first.
sessionRoutes.get("/", async (c) => {
  const sessions = await listSessionsForUser(c.get("userId"));
  return c.json(ListSessionsResponseSchema.parse({ sessions }));
});

// GET /v1/sessions/:id — the session, its captures, and its document id if generated.
sessionRoutes.get("/:id", async (c) => {
  const session = await ownedSession(c);
  const [captures, documentId] = await Promise.all([
    listCapturesForSession(session.id),
    findDocumentIdForSession(session.id),
  ]);
  return c.json(
    SessionDetailResponseSchema.parse({ session, captures, documentId }),
  );
});

// GET /v1/sessions/:id/summary — the Stop screen's quality read (spine §7).
sessionRoutes.get("/:id/summary", async (c) => {
  const session = await ownedSession(c);
  const [captureCount, wordCount] = await Promise.all([
    countCapturesForSession(session.id),
    countTranscriptWordsForSession(session.id),
  ]);
  return c.json(
    SessionSummaryResponseSchema.parse({ captureCount, wordCount }),
  );
});

// POST /v1/sessions/:id/stop — recording → review.
sessionRoutes.post("/:id/stop", async (c) => {
  const session = await ownedSession(c);
  assertSessionStatus(session, ["recording"]);
  const body = StopSessionRequestSchema.parse(await c.req.json());
  const stopped = await stopSession(session.id, body.stoppedAt, body.pausedMs);
  return c.json(SessionResponseSchema.parse({ session: stopped }));
});

// DELETE /v1/sessions/:id — objects first, then the row and everything that cascades from it
// (spine §14: delete means delete).
sessionRoutes.delete("/:id", async (c) => {
  const session = await ownedSession(c);
  const prefix = sessionPrefix(session.userId, session.id);
  await Promise.all([
    deletePrefix(BUCKETS.originals, prefix),
    deletePrefix(BUCKETS.crops, prefix),
    deletePrefix(BUCKETS.audio, prefix),
  ]);
  await deleteSession(session.id);
  return c.body(null, 204);
});
