import { Hono } from "hono";
import type { PgBoss } from "pg-boss";
import {
  ChunkResponseSchema,
  PresignChunkRequestSchema,
  PresignResponseSchema,
  RegisterChunkRequestSchema,
} from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { upsertChunk } from "../db/queries/audioChunks.js";
import { requireAuth } from "../middleware/auth.js";
import { enqueueTranscribeChunk } from "../queue/enqueue.js";
import { BUCKETS } from "../storage/client.js";
import { chunkKey } from "../storage/objectKeys.js";
import { signedUpload } from "../storage/signedUpload.js";
import { assertSessionStatus, ownedSession } from "./ownedSession.js";

// Mounted at /v1/sessions/:id/chunks. Takes the API's queue client so registering a chunk can
// enqueue its transcription.
export function chunkRoutes(boss: PgBoss): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.use(requireAuth);

  // POST .../chunks/presign — where to PUT the audio for a chunk at this session-clock offset.
  routes.post("/presign", async (c) => {
    const session = await ownedSession(c);
    assertSessionStatus(session, ["recording"]);
    const body = PresignChunkRequestSchema.parse(await c.req.json());
    const presign = await signedUpload(
      BUCKETS.audio,
      chunkKey(session.userId, session.id, body.offsetMs),
    );
    return c.json(PresignResponseSchema.parse(presign));
  });

  // POST .../chunks — the chunk exists in storage; record it and queue transcription.
  routes.post("/", async (c) => {
    const session = await ownedSession(c);
    // The final chunk is flushed at Stop, so 'review' is allowed too.
    assertSessionStatus(session, ["recording", "review"]);
    const body = RegisterChunkRequestSchema.parse(await c.req.json());
    const expectedPath = chunkKey(session.userId, session.id, body.offsetMs);
    if (body.path !== expectedPath) {
      throw new AppError(
        "invalid_request",
        400,
        "path does not match the presigned path",
      );
    }
    const chunk = await upsertChunk(
      session.id,
      body.offsetMs,
      body.durationMs,
      body.path,
    );
    await enqueueTranscribeChunk(boss, { chunkId: chunk.id });
    return c.json(ChunkResponseSchema.parse({ chunk }), 201);
  });

  return routes;
}
