import { Hono } from "hono";
import type { PgBoss } from "pg-boss";
import { SessionResponseSchema } from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { creditBalanceForUser } from "../db/queries/credits.js";
import {
  findOwnedSession,
  updateSessionStatus,
} from "../db/queries/sessions.js";
import { requireAuth } from "../middleware/auth.js";
import { enqueueGenerate } from "../queue/enqueue.js";
import { assertSessionStatus, ownedSession } from "./ownedSession.js";

// Mounted at /v1/sessions/:id/generate.
export function generateRoutes(boss: PgBoss): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.use(requireAuth);

  // POST .../generate — 202 once queued, 402 when the balance cannot cover it. The credit itself
  // is spent by the worker, only when the document is saved. A failed session can be retried.
  routes.post("/", async (c) => {
    const session = await ownedSession(c);
    assertSessionStatus(session, ["review", "failed"]);
    if ((await creditBalanceForUser(session.userId)) < 1) {
      throw new AppError("out_of_credits", 402, "Out of credits");
    }
    await updateSessionStatus(session.id, "syncing");
    await enqueueGenerate(boss, { sessionId: session.id });
    const queued = await findOwnedSession(session.userId, session.id);
    return c.json(SessionResponseSchema.parse({ session: queued }), 202);
  });

  return routes;
}
