import { Hono } from "hono";
import { MeResponseSchema } from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { listConnectorsForUser } from "../db/queries/connectorConnections.js";
import { creditBalanceForUser } from "../db/queries/credits.js";
import { findUserById } from "../db/queries/users.js";
import { requireAuth } from "../middleware/auth.js";

export const meRoutes = new Hono<AppEnv>();

// GET /v1/me — the signed-in user's profile, credit balance, and connected services.
meRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const user = await findUserById(userId);
  if (user === null) {
    throw new AppError(
      "user_not_found",
      404,
      "No Teardown account for this login",
    );
  }

  const [creditBalance, connectors] = await Promise.all([
    creditBalanceForUser(userId),
    listConnectorsForUser(userId),
  ]);

  return c.json(
    MeResponseSchema.parse({
      id: user.id,
      email: user.email,
      creditBalance,
      connectors,
    }),
  );
});
