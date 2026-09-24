import { Hono } from "hono";
import { MeResponseSchema } from "@teardown/core/api-contract";
import type { AppEnv } from "../appEnv.js";
import { AppError } from "../appError.js";
import { listConnectorsForUser } from "../db/queries/connectorConnections.js";
import { creditBalanceForUser } from "../db/queries/credits.js";
import { findUserById, markUserDeleting } from "../db/queries/users.js";
import { requireAuth } from "../middleware/auth.js";
import { BUCKETS } from "../storage/client.js";
import { deletePrefix } from "../storage/deleteObjects.js";
import { supabaseAdmin } from "../supabaseAdmin.js";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use(requireAuth);

// GET /v1/me — the signed-in user's profile, credit balance, and connected services.
meRoutes.get("/", async (c) => {
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

// DELETE /v1/me — delete the account (spine §14 item 6). Every object key starts with the user
// id, so each bucket is one prefix deletion. Then deleting the auth user cascades to every row
// (users → sessions → captures, words, documents…, ledger, usage) and revokes every refresh
// token, on every surface.
meRoutes.delete("/", async (c) => {
  const userId = c.get("userId");
  await markUserDeleting(userId);
  for (const bucket of Object.values(BUCKETS)) {
    await deletePrefix(bucket, userId);
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    throw new AppError(
      "delete_failed",
      502,
      `Could not delete the account: ${error.message}`,
    );
  }
  return c.body(null, 204);
});
