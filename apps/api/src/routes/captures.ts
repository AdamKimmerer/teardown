import { Hono } from "hono";
import {
  CaptureResponseSchema,
  PresignCaptureRequestSchema,
  PresignResponseSchema,
  UpsertCaptureRequestSchema,
} from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import {
  deleteCapture,
  findCapture,
  upsertCapture,
} from "../db/queries/captures.js";
import { requireAuth } from "../middleware/auth.js";
import { BUCKETS } from "../storage/client.js";
import { deleteObjects } from "../storage/deleteObjects.js";
import { cropKey, originalKey } from "../storage/objectKeys.js";
import { signedUpload } from "../storage/signedUpload.js";
import { assertSessionStatus, ownedSession } from "./ownedSession.js";

// Mounted at /v1/sessions/:id/captures.
export const captureRoutes = new Hono<AppEnv>();

captureRoutes.use(requireAuth);

// POST .../captures/presign — where to PUT the original PNG for a client-generated capture id.
captureRoutes.post("/presign", async (c) => {
  const session = await ownedSession(c);
  assertSessionStatus(session, ["recording"]);
  const body = PresignCaptureRequestSchema.parse(await c.req.json());
  const presign = await signedUpload(
    BUCKETS.originals,
    originalKey(session.userId, session.id, body.captureId),
  );
  return c.json(PresignResponseSchema.parse(presign));
});

// POST .../captures — the capture record, after the PNG is uploaded. Idempotent on the id.
// The path must be the one this API presigned, so a record cannot point at someone else's object.
captureRoutes.post("/", async (c) => {
  const session = await ownedSession(c);
  assertSessionStatus(session, ["recording"]);
  const body = UpsertCaptureRequestSchema.parse(await c.req.json());
  const expectedPath = originalKey(session.userId, session.id, body.id);
  if (body.originalPath !== expectedPath) {
    throw new AppError(
      "invalid_request",
      400,
      "originalPath does not match the presigned path",
    );
  }
  const capture = await upsertCapture(session.id, body);
  return c.json(CaptureResponseSchema.parse({ capture }), 201);
});

// DELETE .../captures/:captureId — the original, its crop if any, then the row.
captureRoutes.delete("/:captureId", async (c) => {
  const session = await ownedSession(c);
  assertSessionStatus(session, ["recording", "review"]);
  const captureId = c.req.param("captureId");
  const capture = await findCapture(session.id, captureId);
  if (capture === null) {
    throw new AppError("capture_not_found", 404, "No such capture");
  }
  await Promise.all([
    deleteObjects(BUCKETS.originals, [
      originalKey(session.userId, session.id, capture.id),
    ]),
    deleteObjects(BUCKETS.crops, [
      cropKey(session.userId, session.id, capture.id),
    ]),
  ]);
  await deleteCapture(session.id, capture.id);
  return c.body(null, 204);
});
